import { useEffect, useRef, useState } from 'react';
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
import { uploadWithTimeout } from '@/lib/uploadHelpers';
import { recalculateAndSaveProfileCompletion } from '@/lib/profileCompletion';
import {
  getSecureFileUrl,
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

  const [cvSignedUrl, setCvSignedUrl] = useState<string | null>(null);

  const cvFileUrl = profile?.cv_file_url as string | null;
  const cvFileName = profile?.cv_file_name as string | null;
  const cvVisible = (profile?.cv_visible as boolean) ?? true;

  // Resolve legacy or canonical CV URL to a short-lived signed URL.
  useEffect(() => {
    let cancelled = false;
    setCvSignedUrl(null);
    if (!cvFileUrl) return;
    const bucket =
      (profile?.cv_storage_bucket as string | null) ||
      extractStoragePathAndBucket(cvFileUrl).bucket ||
      STORAGE_BUCKETS.certificates;
    getSecureFileUrl(bucket, cvFileUrl).then((url) => {
      if (!cancelled) setCvSignedUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [cvFileUrl, profile?.cv_storage_bucket]);

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
    const safeExt = `.${getSafeDocExtension(file.name)}`;
    const path = `${user.id}/cv-${Date.now()}${safeExt}`;
    const bucketName = STORAGE_BUCKETS.certificates;

    console.log('[CVUploadSection] File upload starting:', {
      bucket: bucketName,
      path,
      fileType: file.type,
      fileSize: file.size,
      fileName: file.name,
    });

    const { error } = await uploadWithTimeout(bucketName, path, file, {
      upsert: false,
      cacheControl: '3600',
      timeoutMs: 120000,
    });
    if (error) {
      console.error('[CVUploadSection] Upload error:', { bucket: bucketName, path, error: error.message });
      setUploading(false);
      const msg = `Error al subir: ${error.message}`;
      setUploadError(msg);
      toast.error(msg);
      return;
    }

    console.log('[CVUploadSection] Upload success:', { bucket: bucketName, path });

    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(path);

    console.log('[CVUploadSection] Public URL:', urlData.publicUrl);

    const { data: upsertedData, error: updateError } = await supabase
      .from(TABLES.profiles)
      .upsert(
        {
          user_id: user.id,
          cv_file_url: urlData.publicUrl,
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

    setUploading(false);
    if (updateError || !upsertedData) {
      console.error('[CVUploadSection] Profile upsert error:', updateError?.message);
      const msg = t('workerProfile.cv.saveError', 'CV uploaded but failed to save reference: ') + (updateError?.message || 'No data returned');
      setUploadError(msg);
      toast.error(msg);
      return;
    }

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

    console.log('[CVUploadSection] Profile upserted with CV fields:', {
      cv_file_url: urlData.publicUrl,
      cv_file_name: file.name,
      cv_file_path: path,
    });
    setUploadError(null);
    toast.success(t('workerProfile.cv.uploaded'));
    await refreshProfile();
    // Recalculate profile completion (non-blocking)
    recalculateAndSaveProfileCompletion(user.id).catch(() => {});
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
    <section className="border border-zinc-800/80 bg-[#0d0d0d] p-6">
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
        {cvFileUrl ? (
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
                <a
                  href={cvSignedUrl || '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[11px] uppercase tracking-[0.15em] text-zinc-300 hover:border-[#f59e0b] hover:text-[#f59e0b]"
                >
                  <Download className="h-3 w-3" />
                  {t('workerProfile.cv.view')}
                </a>
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
            {uploading
              ? t('common.loading')
              : t('workerProfile.cv.uploadPdf')}
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