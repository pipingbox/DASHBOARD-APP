import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FileText,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Upload,
  Loader2,
  ExternalLink,
  Image,
  File,
  ShieldCheck,
  CalendarClock,
} from 'lucide-react';
import { supabase, TABLES, STORAGE_BUCKETS } from '@/lib/supabase';
import { getSecureFileUrl, deleteStorageObject, extractStoragePathAndBucket } from '@/lib/storageHelpers';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { WorkerDocument } from '@/lib/workerProfile';
import { normalizeDocument } from '@/lib/workerProfile';
import {
  isValidDocOrImageFile,
  isHeicFile,
  validateFileSize,
  getFileExtension,
  formatFileSize,
  ACCEPT_DOCS_AND_IMAGES,
} from '@/lib/fileUploadUtils';
import { uploadWithTimeout } from '@/lib/uploadHelpers';
import { recalculateAndSaveProfileCompletion } from '@/lib/profileCompletion';

const DOCUMENT_TYPES = [
  'passport',
  'id_card',
  'drivers_license',
  'work_permit',
  'visa',
  'training_certificate',
  'safety_card',
  'medical_certificate',
  'reference_letter',
  'other',
] as const;



function getMimeIcon(mimeType: string | null) {
  if (!mimeType) return <File className="h-4 w-4 text-[#f59e0b]" />;
  if (mimeType.startsWith('image/')) return <Image className="h-4 w-4 text-blue-400" />;
  if (mimeType === 'application/pdf') return <FileText className="h-4 w-4 text-red-400" />;
  return <File className="h-4 w-4 text-[#f59e0b]" />;
}

function getExpiryStatus(expiresAt: string | null): { label: string; classes: string } | null {
  if (!expiresAt) return null;
  const now = new Date();
  const expiry = new Date(expiresAt);
  const daysUntil = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysUntil < 0) {
    return { label: 'Expired', classes: 'border-red-600/50 text-red-400 bg-red-500/10' };
  }
  if (daysUntil <= 30) {
    return { label: `Expires in ${daysUntil}d`, classes: 'border-amber-600/50 text-amber-400 bg-amber-500/10' };
  }
  return { label: `Expires ${expiry.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`, classes: 'border-zinc-600 text-zinc-400 bg-zinc-800/50' };
}

export function DocumentsSection() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<WorkerDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WorkerDocument | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Form state
  const [documentType, setDocumentType] = useState<string>('other');
  const [fileName, setFileName] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [storageBucket, setStorageBucket] = useState<string | null>(null);
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [isVisible, setIsVisible] = useState(true);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from(TABLES.workerDocuments)
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) {
        toast.error(t('workerProfile.documents.loadError', { defaultValue: 'Failed to load documents' }));
        console.error('Documents load error:', error.message);
      } else {
        setItems((data ?? []).map((row) => normalizeDocument(row as Record<string, unknown>)));
      }
    } catch (err) {
      console.error('Documents load exception:', err);
      toast.error(t('workerProfile.documents.loadError', { defaultValue: 'Failed to load documents' }));
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const resetForm = () => {
    setDocumentType('other');
    setFileName('');
    setFileUrl('');
    setStorageBucket(null);
    setStoragePath(null);
    setFileSize(null);
    setMimeType(null);
    setNotes('');
    setExpiresAt('');
    setIsVisible(true);
    setUploadError(null);
  };

  const openAdd = () => {
    resetForm();
    setDialogOpen(true);
  };

  const toggleVisibility = async (doc: WorkerDocument) => {
    const { error } = await supabase
      .from(TABLES.workerDocuments)
      .update({ is_visible: !doc.is_visible })
      .eq('id', doc.id);
    if (error) {
      toast.error(error.message);
    } else {
      setItems((prev) =>
        prev.map((i) => (i.id === doc.id ? { ...i, is_visible: !i.is_visible } : i))
      );
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!user) return;
    setUploadError(null);

    // Validate file size
    const sizeError = validateFileSize(file, 10);
    if (sizeError) {
      setUploadError(sizeError);
      toast.error(sizeError);
      return;
    }

    // Validate file type (mobile-friendly: checks MIME + extension, includes HEIC)
    if (!isValidDocOrImageFile(file)) {
      const msg = t('workerProfile.documents.invalidType', { defaultValue: 'Tipo de archivo no soportado. Acepta: PDF, DOC, DOCX, JPG, PNG, WebP, HEIC.' });
      setUploadError(msg);
      toast.error(msg);
      return;
    }

    // Inform about HEIC
    if (isHeicFile(file)) {
      toast.info('Foto HEIC detectada. Se subirá correctamente.');
    }

    setUploading(true);
    try {
      const ext = getFileExtension(file.name) || 'pdf';
      const path = `${user.id}/doc-${Date.now()}.${ext}`;
      const bucketName = STORAGE_BUCKETS.workerDocuments;

      console.log('[DocumentsSection] File upload starting:', {
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
        console.error('[DocumentsSection] Upload error:', { bucket: bucketName, path, error: error.message });
        const msg = t('workerProfile.documents.uploadFailed', { defaultValue: 'Error al subir: ' }) + error.message;
        setUploadError(msg);
        toast.error(msg);
        setUploading(false);
        return;
      }

      console.log('[DocumentsSection] Upload success:', { bucket: bucketName, path });

      const { data } = supabase.storage
        .from(bucketName)
        .getPublicUrl(path);

      console.log('[DocumentsSection] Public URL:', data.publicUrl);
      setFileUrl(data.publicUrl);
      setStorageBucket(bucketName);
      setStoragePath(path);
      setFileName(file.name);
      setFileSize(file.size);
      setMimeType(file.type || null);
      setUploadError(null);
      toast.success(t('workerProfile.documents.fileUploaded', { defaultValue: 'File uploaded successfully' }));
    } catch (err) {
      console.error('[DocumentsSection] Upload unexpected error:', err);
      const msg = t('workerProfile.documents.uploadFailed', { defaultValue: 'Error inesperado al subir el archivo' });
      setUploadError(msg);
      toast.error(msg);
    }
    setUploading(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!fileUrl) {
      toast.error(t('workerProfile.documents.fileRequired', { defaultValue: 'Please upload a file first' }));
      return;
    }
    setSaving(true);

    try {
      // Derive document_category from document_type for the DB
      const categoryMap: Record<string, string> = {
        passport: 'identity',
        id_card: 'identity',
        drivers_license: 'identity',
        work_permit: 'work_authorization',
        visa: 'work_authorization',
        training_certificate: 'certification',
        safety_card: 'certification',
        medical_certificate: 'medical',
        reference_letter: 'reference',
        other: 'other',
      };
      const derivedCategory = categoryMap[documentType] || 'other';

      const payload = {
        user_id: user.id,
        document_type: documentType,
        document_category: derivedCategory,
        file_name: fileName || 'document',
        file_url: fileUrl,
        storage_bucket: storageBucket,
        storage_path: storagePath,
        file_size: fileSize,
        mime_type: mimeType,
        notes: notes.trim() || null,
        expires_at: expiresAt || null,
        is_visible: isVisible,
      };

      const { error } = await supabase.from(TABLES.workerDocuments).insert(payload);
      if (error) {
        toast.error(t('workerProfile.documents.saveFailed', { defaultValue: 'Failed to save document: ' }) + error.message);
        setSaving(false);
        return;
      }
      toast.success(t('workerProfile.documents.added', { defaultValue: 'Document added successfully' }));
      setDialogOpen(false);
      load();
      // Recalculate profile completion (non-blocking)
      if (user) recalculateAndSaveProfileCompletion(user.id).catch(() => {});
    } catch (err) {
      console.error('Submit exception:', err);
      toast.error(t('workerProfile.documents.saveFailed', { defaultValue: 'Failed to save document' }));
    }
    setSaving(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    // PB-STORAGE-SECURITY-001: delete the Storage object that belongs to this
    // exact record before removing the DB row. Never delete unrelated objects.
    if (deleteTarget.storage_bucket && deleteTarget.storage_path) {
      await deleteStorageObject(deleteTarget.storage_bucket, deleteTarget.storage_path);
    } else if (deleteTarget.file_url) {
      const extracted = extractStoragePathAndBucket(deleteTarget.file_url);
      if (extracted.bucket && extracted.path) {
        await deleteStorageObject(extracted.bucket, extracted.path);
      }
    }

    const { error } = await supabase
      .from(TABLES.workerDocuments)
      .delete()
      .eq('id', deleteTarget.id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(t('workerProfile.documents.deleted', { defaultValue: 'Document deleted' }));
      load();
      // Recalculate profile completion (non-blocking)
      if (user) recalculateAndSaveProfileCompletion(user.id).catch(() => {});
    }
    setDeleteTarget(null);
  };

  return (
    <section className="border border-zinc-800/80 bg-[#0d0d0d] p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-[#f59e0b]">
            {t('workerProfile.documents.label', { defaultValue: 'Documents' })}
          </p>
          <h2 className="mt-1 text-xl font-semibold">
            {t('workerProfile.documents.title', { defaultValue: 'Professional Documents' })}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            {t('workerProfile.documents.description', { defaultValue: 'Upload and manage your professional documents' })}
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center gap-2 bg-[#f59e0b] px-3 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-black hover:bg-[#d97706]"
        >
          <Plus className="h-3.5 w-3.5" />
          {t('workerProfile.documents.add', { defaultValue: 'Add Document' })}
        </button>
      </div>

      <div className="mt-6 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
            <span className="ml-2 text-sm text-zinc-500">{t('common.loading', { defaultValue: 'Loading...' })}</span>
          </div>
        ) : items.length === 0 ? (
          <div className="border border-dashed border-zinc-800 bg-zinc-950 p-8 text-center">
            <FileText className="mx-auto h-8 w-8 text-zinc-600" />
            <p className="mt-3 text-sm text-zinc-400">
              {t('workerProfile.documents.empty', { defaultValue: 'No documents uploaded yet' })}
            </p>
          </div>
        ) : (
          items.map((doc) => {
            const expiryStatus = getExpiryStatus(doc.expires_at);
            return (
              <div
                key={doc.id}
                className={`border bg-zinc-950 p-4 ${doc.is_visible ? 'border-zinc-800' : 'border-zinc-800/50 opacity-60'}`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {getMimeIcon(doc.mime_type)}
                      <h3 className="text-sm font-semibold text-zinc-100">
                        {doc.file_name}
                      </h3>
                      <span className="border border-zinc-700 px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-zinc-400">
                        {t(`workerProfile.documents.types.${doc.document_type}`, { defaultValue: doc.document_type })}
                      </span>
                      {doc.document_category && doc.document_category !== 'other' && (
                        <span className="border border-zinc-700/60 px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-zinc-500">
                          {t(`workerProfile.documents.categories.${doc.document_category}`, { defaultValue: doc.document_category })}
                        </span>
                      )}
                      {doc.verified && (
                        <span className="inline-flex items-center gap-1 border border-emerald-600/40 bg-emerald-600/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-emerald-300">
                          <ShieldCheck className="h-3 w-3" />
                          {t('workerProfile.documents.verified', { defaultValue: 'Verified' })}
                        </span>
                      )}
                      {expiryStatus && (
                        <span className={`inline-flex items-center gap-1 border px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] ${expiryStatus.classes}`}>
                          <CalendarClock className="h-3 w-3" />
                          {expiryStatus.label}
                        </span>
                      )}
                      {!doc.is_visible && (
                        <span className="inline-flex items-center gap-1 border border-zinc-700 px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-zinc-500">
                          <EyeOff className="h-3 w-3" />
                          {t('workerProfile.hidden', { defaultValue: 'Hidden' })}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3">
                      {doc.notes && (
                        <p className="text-xs text-zinc-500">{doc.notes}</p>
                      )}
                      {doc.file_size && (
                        <span className="text-[11px] text-zinc-600">{formatFileSize(doc.file_size)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <a
                      href={doc.storageUrl || '#'}
                      target="_blank"
                      rel="noreferrer"
                      onClick={async (e) => {
                        const bucket = doc.storage_bucket || STORAGE_BUCKETS.workerDocuments;
                        const sourceUrl = doc.file_url;
                        if (!sourceUrl) return;
                        const url = await getSecureFileUrl(bucket, sourceUrl);
                        if (url) {
                          setItems((prev) =>
                            prev.map((i) =>
                              i.id === doc.id ? { ...i, storageUrl: url } : i,
                            ),
                          );
                        } else {
                          e.preventDefault();
                          toast.error(t('workerProfile.documents.accessDenied', { defaultValue: 'Access denied' }));
                        }
                      }}
                      className="inline-flex items-center gap-1 border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-400 hover:border-[#f59e0b] hover:text-[#f59e0b]"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <button
                      type="button"
                      onClick={() => toggleVisibility(doc)}
                      title={doc.is_visible ? t('workerProfile.hide', { defaultValue: 'Hide' }) : t('workerProfile.show', { defaultValue: 'Show' })}
                      className="inline-flex items-center gap-1 border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                    >
                      {doc.is_visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(doc)}
                      title={t('common.delete', { defaultValue: 'Delete' })}
                      className="inline-flex items-center gap-1 border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-400 hover:border-red-600/60 hover:text-red-400"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!saving && !uploading) setDialogOpen(open); }}>
        <DialogContent className="max-w-lg border-zinc-800 bg-[#0d0d0d]">
          <DialogHeader>
            <DialogTitle>{t('workerProfile.documents.addTitle', { defaultValue: 'Upload Document' })}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400">
                {t('workerProfile.documents.type', { defaultValue: 'Document type' })}
              </Label>
              <select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
                className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-[#f59e0b]"
              >
                {DOCUMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`workerProfile.documents.types.${type}`, { defaultValue: type })}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400">
                {t('workerProfile.documents.file', { defaultValue: 'File' })} *
              </Label>
              {fileUrl ? (
                <div className="flex items-center justify-between border border-zinc-800 bg-zinc-950 p-3">
                  <div className="flex items-center gap-2 text-sm text-zinc-300">
                    {getMimeIcon(mimeType)}
                    <span className="truncate max-w-[200px]">{fileName}</span>
                    {fileSize && (
                      <span className="text-[11px] text-zinc-600">({formatFileSize(fileSize)})</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      // Clean up the uploaded object before it is attached to a DB row.
                      if (storageBucket && storagePath) {
                        await deleteStorageObject(storageBucket, storagePath);
                      }
                      setFileUrl('');
                      setStorageBucket(null);
                      setStoragePath(null);
                      setFileName('');
                      setFileSize(null);
                      setMimeType(null);
                      setUploadError(null);
                    }}
                    className="text-xs uppercase tracking-wider text-zinc-500 hover:text-red-400"
                  >
                    {t('common.remove', { defaultValue: 'Remove' })}
                  </button>
                </div>
              ) : (
                /* Mobile fix: Use <label> wrapping hidden input instead of button + programmatic click */
                <label
                  className={`flex w-full cursor-pointer items-center justify-center gap-2 border border-dashed border-zinc-800 bg-zinc-950 px-3 py-6 text-xs uppercase tracking-[0.15em] text-zinc-400 hover:border-[#f59e0b] hover:text-[#f59e0b] ${uploading ? 'pointer-events-none opacity-50' : ''}`}
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {uploading
                    ? t('workerProfile.documents.uploading', { defaultValue: 'Uploading...' })
                    : t('workerProfile.documents.uploadFile', { defaultValue: 'Click to upload file' })}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPT_DOCS_AND_IMAGES}
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                      if (e.target) e.target.value = '';
                    }}
                  />
                </label>
              )}
              {/* Upload error visible on mobile */}
              {uploadError && (
                <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                  ⚠️ {uploadError}
                </div>
              )}
              <p className="text-[10px] text-zinc-600">
                PDF, DOC, DOCX, JPG, PNG, WebP, HEIC — máx. 10 MB
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400">
                {t('workerProfile.documents.expiresAt', { defaultValue: 'Expiration date (optional)' })}
              </Label>
              <Input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="bg-zinc-950 border-zinc-800 text-zinc-100 focus-visible:ring-[#f59e0b] [color-scheme:dark]"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400">
                {t('workerProfile.documents.notes', { defaultValue: 'Notes' })}
              </Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder={t('workerProfile.documents.notesPlaceholder', { defaultValue: 'Optional notes about this document...' })}
                className="bg-zinc-950 border-zinc-800 text-zinc-100 focus-visible:ring-[#f59e0b] [color-scheme:dark]"
              />
            </div>

            <div className="flex items-center gap-3">
              <Switch
                checked={isVisible}
                onCheckedChange={setIsVisible}
                className="data-[state=checked]:bg-[#f59e0b]"
              />
              <Label className="text-xs text-zinc-400">
                {t('workerProfile.documents.visibleToCompanies', { defaultValue: 'Visible to companies' })}
              </Label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDialogOpen(false)}
                disabled={saving || uploading}
                className="text-zinc-400 hover:text-zinc-200"
              >
                {t('common.cancel', { defaultValue: 'Cancel' })}
              </Button>
              <Button
                type="submit"
                disabled={saving || uploading || !fileUrl}
                className="bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold"
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {saving ? t('common.saving', { defaultValue: 'Saving...' }) : t('workerProfile.documents.upload', { defaultValue: 'Upload Document' })}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent className="border-zinc-800 bg-[#0d0d0d]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-100">
              {t('workerProfile.documents.confirmDelete', { defaultValue: 'Delete Document?' })}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              {t('workerProfile.documents.confirmDeleteDesc', {
                name: deleteTarget?.file_name,
                defaultValue: `Are you sure you want to delete "${deleteTarget?.file_name}"? This action cannot be undone.`,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100">
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {t('common.delete', { defaultValue: 'Delete' })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}