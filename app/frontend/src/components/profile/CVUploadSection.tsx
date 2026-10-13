import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FileText,
  Upload,
  Trash2,
  Loader2,
  Download,
} from 'lucide-react';
import { supabase, TABLES, STORAGE_BUCKETS } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  isValidDocumentFile,
  validateFileSize,
  getSafeDocExtension,
  ACCEPT_DOCUMENTS,
} from '@/lib/fileUploadUtils';
import { resolveFileMime } from '@/lib/uploadHelpers';
import {
  startResumableUpload,
  UPLOAD_FAILURE_I18N,
  formatBytes,
  type DocumentUploadController,
  type DocumentUploadProgress,
} from '@/lib/resumableUpload';
import { recalculateAndSaveProfileCompletion } from '@/lib/profileCompletion';
import { hasStoredCv } from '@/lib/filePresence';
import {
  openSecureFileInNewTab,
  extractStoragePathAndBucket,
  deleteStorageObject,
} from '@/lib/storageHelpers';

export function CVUploadSection() {
  const { t } = useTranslation();
  const { user, profile, refreshProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // PB-DOCUMENT-INTAKE-001 — resumable (TUS) upload machine state for the UI.
  const [uploadUi, setUploadUi] = useState<DocumentUploadProgress | null>(null);
  const uploadControllerRef = useRef<DocumentUploadController | null>(null);
  // Stable path per file selection so TUS can resume the same object.
  const lastUploadAttemptRef = useRef<{ signature: string; path: string } | null>(null);

  // PB-GROWTH-GATE-PROFILE-E2E-001 — the CV open action resolves a FRESH
  // signed URL per click (openCv). The previous approach resolved once at
  // mount into state: first-click-before-resolution hit href="#" and the
  // cached URL broke after its 1h expiry.
  const [openingCv, setOpeningCv] = useState(false);
  const openingCvRef = useRef(false);

  const cvFileUrl = profile?.cv_file_url as string | null;
  const cvStorageBucket = profile?.cv_storage_bucket as string | null;
  const cvStoragePath = profile?.cv_storage_path as string | null;
  // PB-STORAGE-SECURITY-001: presence comes from canonical metadata, with the
  // legacy URL as fallback. Reading cv_file_url alone would hide new uploads.
  const hasCv = hasStoredCv(profile);
  const cvFileName = profile?.cv_file_name as string | null;
  const cvVisible = (profile?.cv_visible as boolean) ?? true;

  const openCv = async () => {
    if (openingCvRef.current) return;
    const pathOrUrl = cvStoragePath || cvFileUrl;
    const bucket =
      cvStorageBucket ||
      (cvFileUrl ? extractStoragePathAndBucket(cvFileUrl).bucket : null) ||
      STORAGE_BUCKETS.certificates;

    openingCvRef.current = true;
    setOpeningCv(true);
    try {
      await openSecureFileInNewTab({
        bucket,
        sourceRef: pathOrUrl || '',
        onError: () =>
          toast.error(t('workerProfile.certifications.viewFileDenied', { defaultValue: 'Access denied' })),
      });
    } finally {
      openingCvRef.current = false;
      setOpeningCv(false);
    }
  };

  const handleUpload = async (file: File) => {
    if (!user) return;
    setUploadError(null);

    // Validate file type (mobile-friendly: checks both MIME and extension)
    if (!isValidDocumentFile(file)) {
      const msg = t('workerProfile.cv.allowedFormats', 'Solo se aceptan archivos PDF, DOC y DOCX');
      setUploadError(msg);
      toast.error(msg);
      return;
    }

    // Validate file size
    const sizeError = validateFileSize(file, 10);
    if (sizeError) {
      setUploadError(sizeError);
      toast.error(sizeError);
      return;
    }

    setUploading(true);
    setUploadUi(null);

    // PB-DOCUMENT-INTAKE-001 — TUS resumable upload via the shared uploader.
    // The object path is stable per file selection: re-selecting the same
    // file after a recoverable failure RESUMES from the previous offset.
    const signature = `${file.name}|${file.size}|${file.lastModified}`;
    const previousAttempt = lastUploadAttemptRef.current;
    const safeExt = `.${getSafeDocExtension(file.name)}`;
    const path =
      previousAttempt && previousAttempt.signature === signature
        ? previousAttempt.path
        : `${user.id}/cv-${Date.now()}${safeExt}`;
    lastUploadAttemptRef.current = { signature, path };
    const bucketName = STORAGE_BUCKETS.certificates;

    const controller = startResumableUpload(file, {
      documentType: 'cv',
      bucket: bucketName,
      path,
      contentType: resolveFileMime(file),
      route: '/profile',
      onProgress: (p) => setUploadUi(p),
    });
    uploadControllerRef.current = controller;

    const result = await controller.promise;
    uploadControllerRef.current = null;

    if ('reason' in result && result.reason === 'cancelled') {
      setUploadUi(null);
      setUploading(false);
      return;
    }
    if ('reason' in result) {
      setUploadUi(null);
      setUploading(false);
      const msg = t(UPLOAD_FAILURE_I18N[result.reason]);
      setUploadError(msg);
      toast.error(msg);
      return;
    }

    // Transport finished and the verification HEAD confirmed the object.
    // Now update the canonical profile columns (requirement: only after the
    // object is complete and verified).
    const { data: upsertedData, error: updateError } = await supabase
      .from(TABLES.profiles)
      .upsert(
        {
          user_id: user.id,
          // PB-STORAGE-SECURITY-001 phase 2: the bucket is private, so a public URL
          // grants nothing and only misrepresents where the file lives. Cleared on
          // replacement because the previous object has just been deleted.
          cv_file_url: null,
          cv_storage_bucket: bucketName,
          cv_storage_path: path,
          cv_file_name: file.name,
          cv_file_path: path,
          cv_uploaded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      .select()
      .single();

    if (updateError || !upsertedData) {
      // PB-DOCUMENT-INTAKE-001 — canonical write failed: close the upload
      // machine as a database failure and remove the freshly-created object
      // (safe compensation — no orphan, no partial success).
      controller.failCanonical();
      await deleteStorageObject(bucketName, path).catch(() => undefined);
      setUploading(false);
      setUploadUi(null);
      const msg = t('workerProfile.cv.saveError', 'CV uploaded but failed to save reference: ') + (updateError?.message || 'No data returned');
      setUploadError(msg);
      toast.error(msg);
      return;
    }

    // PB-DOCUMENT-INTAKE-001 — canonical columns confirmed: only now the
    // machine reaches SAVED and document_upload_completed is emitted.
    controller.confirmSaved();

    // PB-STORAGE-SECURITY-001: delete the previous CV object after the DB
    // reference has been successfully replaced.
    const oldBucket = profile?.cv_storage_bucket as string | null;
    const oldPath = profile?.cv_storage_path as string | null;
    const oldUrl = profile?.cv_file_url as string | null;
    if (oldBucket && oldPath && (oldBucket !== bucketName || oldPath !== path)) {
      await deleteStorageObject(oldBucket, oldPath);
    } else if (oldUrl) {
      const extracted = extractStoragePathAndBucket(oldUrl);
      if (extracted.bucket && extracted.path && (extracted.bucket !== bucketName || extracted.path !== path)) {
        await deleteStorageObject(extracted.bucket, extracted.path);
      }
    }

    setUploading(false);
    setUploadUi(null);
    setUploadError(null);
    // refreshProfile() re-reads the canonical columns so the saved state is
    // what a reload would show — no ambiguous success.
    await refreshProfile();
    toast.success(t('workerProfile.cv.uploaded'));
    // Recalculate profile completion (non-blocking)
    recalculateAndSaveProfileCompletion(user.id).catch(() => {});
  };

  const cancelUpload = () => {
    uploadControllerRef.current?.cancel();
  };

  const handleRemove = async () => {
    if (!user) return;
    setRemoving(true);

    // PB-STORAGE-SECURITY-001: delete the Storage object that belongs to this
    // profile before clearing the DB reference.
    const bucket = profile?.cv_storage_bucket as string | null;
    const path = profile?.cv_storage_path as string | null;
    const url = profile?.cv_file_url as string | null;
    if (bucket && path) {
      await deleteStorageObject(bucket, path);
    } else if (url) {
      const extracted = extractStoragePathAndBucket(url);
      if (extracted.bucket && extracted.path) {
        await deleteStorageObject(extracted.bucket, extracted.path);
      }
    }

    const { data: upsertedData, error } = await supabase
      .from(TABLES.profiles)
      .upsert(
        {
          user_id: user.id,
          cv_file_url: null,
          cv_storage_bucket: null,
          cv_storage_path: null,
          cv_file_name: null,
          cv_file_path: null,
          cv_uploaded_at: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      .select()
      .single();
    setRemoving(false);
    if (error || !upsertedData) {
      console.error('[CVUploadSection] Remove upsert failed:', error?.message);
      toast.error(error?.message || 'Failed to remove CV');
      return;
    }
    toast.success(t('workerProfile.cv.removed'));
    await refreshProfile();
    // Recalculate profile completion (non-blocking)
    recalculateAndSaveProfileCompletion(user.id).catch(() => {});
  };

  const toggleVisibility = async () => {
    if (!user) return;
    try {
      const { data: upsertedData, error } = await supabase
        .from(TABLES.profiles)
        .upsert(
          {
            user_id: user.id,
            cv_visible: !cvVisible,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        )
        .select()
        .single();
      if (error || !upsertedData) {
        console.error('[CVUploadSection] Toggle visibility upsert failed:', error?.message);
        toast.error(error?.message || 'Failed to update visibility');
        return;
      }
      toast.success(
        !cvVisible
          ? t('workerProfile.cv.visibilityOn', 'CV is now visible to companies')
          : t('workerProfile.cv.visibilityOff', 'CV is now hidden from companies')
      );
      await refreshProfile();
    } catch (err) {
      console.error('Toggle visibility error:', err);
      toast.error(t('workerProfile.cv.visibilityError', 'Failed to update visibility'));
    }
  };

  return (
    <section id="profile-section-visibility" className="border border-zinc-800/80 bg-[#0d0d0d] p-6">
      <div>
        <p className="text-[10px] uppercase tracking-[0.3em] text-[#f59e0b]">
          {t('workerProfile.cv.label')}
        </p>
        <h2 className="mt-1 text-xl font-semibold">
          {t('workerProfile.cv.title')}
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          {t('workerProfile.cv.description')}
        </p>
      </div>

      <div className="mt-4">
        {hasCv ? (
          <div className="border border-zinc-800 bg-zinc-950 p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="h-8 w-8 text-[#f59e0b] shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-200 truncate">
                    {cvFileName || 'CV.pdf'}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {cvFileName?.match(/\.(docx?)$/i) ? 'DOC' : 'PDF'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={openCv}
                  disabled={openingCv}
                  aria-label={t('workerProfile.cv.view')}
                  className="inline-flex items-center gap-1 border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[11px] uppercase tracking-[0.15em] text-zinc-300 hover:border-[#f59e0b] hover:text-[#f59e0b] disabled:opacity-50"
                >
                  {openingCv ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Download className="h-3 w-3" />
                  )}
                  {t('workerProfile.cv.view')}
                </button>
                {/* Mobile fix: Use <label> instead of button + programmatic click */}
                <label
                  className={`inline-flex cursor-pointer items-center gap-1 border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[11px] uppercase tracking-[0.15em] text-zinc-300 hover:border-zinc-600 hover:text-zinc-200 ${uploading ? 'pointer-events-none opacity-50' : ''}`}
                >
                  <Upload className="h-3 w-3" />
                  {t('workerProfile.cv.replace')}
                  <input
                    type="file"
                    accept={ACCEPT_DOCUMENTS}
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUpload(file);
                      if (e.target) e.target.value = '';
                    }}
                  />
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRemove}
                  disabled={removing}
                  className="text-zinc-400 hover:text-red-400 px-2"
                >
                  {removing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3 pt-3 border-t border-zinc-800">
              <Switch
                checked={cvVisible}
                onCheckedChange={toggleVisibility}
                className="data-[state=checked]:bg-[#f59e0b]"
              />
              <Label className="text-xs text-zinc-400">
                {t('workerProfile.cv.visibleToCompanies')}
              </Label>
            </div>
          </div>
        ) : (
          /* Mobile fix: Use <label> for the upload area instead of button + programmatic click */
          <label
            className={`flex w-full cursor-pointer items-center justify-center gap-2 border border-dashed border-zinc-800 bg-zinc-950 px-3 py-8 text-xs uppercase tracking-[0.15em] text-zinc-400 hover:border-[#f59e0b] hover:text-[#f59e0b] ${uploading ? 'pointer-events-none opacity-50' : ''}`}
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Upload className="h-5 w-5" />
            )}
            <span data-testid="cv-upload-button-label">
              {uploading
                ? `${t('common.loading')} ${uploadUi?.percent ?? 0}%`
                : t('workerProfile.cv.uploadPdf')}
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_DOCUMENTS}
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
                if (e.target) e.target.value = '';
              }}
            />
          </label>
        )}
      </div>

      {/* PB-DOCUMENT-INTAKE-001 — resumable upload status: real progress,
          bytes transferred, cumulative time (never reset across retries),
          preparing/retrying/verifying states and an always-available cancel. */}
      {uploading && uploadUi && (
        <div className="mt-3 w-full space-y-1" data-testid="cv-upload-status">
          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
            <div
              data-testid="cv-upload-progress-bar"
              className="h-full rounded-full bg-[#f59e0b] transition-all duration-300 ease-out"
              style={{ width: `${uploadUi.percent}%` }}
            />
          </div>
          <p className="text-center text-[11px] text-zinc-500" data-testid="cv-upload-status-line">
            {uploadUi.state === 'VERIFYING'
              ? t('common.upload.verifying')
              : uploadUi.state === 'RETRYING'
                ? `${uploadUi.percent}% ${t('common.upload.retrying')}`
                : `${uploadUi.percent}% ${t('workerProfile.certifications.uploading', 'Subiendo…')}`}
            {uploadUi.state !== 'VERIFYING' && (
              <span className="ml-1 text-zinc-600">({Math.floor(uploadUi.elapsedMs / 1000)}s)</span>
            )}
            {uploadUi.state !== 'VERIFYING' && uploadUi.bytesTotal > 0 && (
              <span className="ml-1 text-zinc-600">
                {formatBytes(uploadUi.bytesUploaded)} / {formatBytes(uploadUi.bytesTotal)}
              </span>
            )}
          </p>
          {uploadUi.preparingFile && uploadUi.state !== 'VERIFYING' && (
            <p className="text-center text-[11px] text-zinc-400" data-testid="cv-upload-preparing">
              {t('common.upload.preparingFile')}
            </p>
          )}
          {uploadUi.slowConnection && uploadUi.state !== 'VERIFYING' && (
            <p className="text-center text-[11px] text-amber-500/90">
              {t('workerProfile.certifications.uploadSlowHint', 'La conexión es lenta; la subida sigue en curso.')}
            </p>
          )}
          <button
            type="button"
            onClick={cancelUpload}
            className="mx-auto block text-[11px] uppercase tracking-wider text-zinc-500 hover:text-red-400"
            data-testid="cv-upload-cancel"
          >
            {t('common.upload.cancel')}
          </button>
        </div>
      )}

      {/* Error message - visible on mobile with clear styling */}
      {uploadError && (
        <div className="mt-3 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          ⚠️ {uploadError}
        </div>
      )}

      <p className="mt-2 text-[10px] text-zinc-600">
        PDF, DOC, DOCX — máx. 10 MB
      </p>
    </section>
  );
}