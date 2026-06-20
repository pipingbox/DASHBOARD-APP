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
import { recalculateAndSaveProfileCompletion } from '@/lib/profileCompletion';
import { uploadWithTimeout } from '@/lib/uploadHelpers';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export function CVUploadSection() {
  const { t } = useTranslation();
  const { user, profile, refreshProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);

  const cvFileUrl = profile?.cv_file_url as string | null;
  const cvFileName = profile?.cv_file_name as string | null;
  const cvVisible = (profile?.cv_visible as boolean) ?? true;

  const handleUpload = async (file: File) => {
    if (!user) return;
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      toast.error(t('workerProfile.cv.pdfOnly'));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error(t('workerProfile.cv.fileTooBig'));
      return;
    }
    setUploading(true);
    const path = `${user.id}/cv-${Date.now()}.pdf`;
    const bucketName = STORAGE_BUCKETS.certificates;

    // Logging: bucket, file type, file size
    console.log('[CVUploadSection] File upload starting:', {
      bucket: bucketName,
      path,
      fileType: file.type,
      fileSize: file.size,
      fileName: file.name,
    });

    const { error } = await uploadWithTimeout(bucketName, path, file, { upsert: false, cacheControl: '3600' });
    if (error) {
      console.error('[CVUploadSection] Upload error:', { bucket: bucketName, path, error });
      setUploading(false);
      toast.error(error.message);
      return;
    }

    console.log('[CVUploadSection] Upload success:', { bucket: bucketName, path });

    const { data } = supabase.storage
      .from(bucketName)
      .getPublicUrl(path);

    console.log('[CVUploadSection] Public URL:', data.publicUrl);

    const { error: updateError } = await supabase
      .from(TABLES.profiles)
      .update({
        cv_file_url: data.publicUrl,
        cv_file_name: file.name,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    setUploading(false);
    if (updateError) {
      toast.error(updateError.message);
      return;
    }
    toast.success(t('workerProfile.cv.uploaded'));
    await recalculateAndSaveProfileCompletion(user.id);
    await refreshProfile();
  };

  const handleRemove = async () => {
    if (!user) return;
    setRemoving(true);
    const { error } = await supabase
      .from(TABLES.profiles)
      .update({
        cv_file_url: null,
        cv_file_name: null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);
    setRemoving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t('workerProfile.cv.removed'));
    await recalculateAndSaveProfileCompletion(user.id);
    await refreshProfile();
  };

  const toggleVisibility = async () => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from(TABLES.profiles)
        .update({
          cv_visible: !cvVisible,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);
      if (error) {
        toast.error(error.message);
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
                  <p className="text-xs text-zinc-500">PDF</p>
                </div>
              </div>
              <div className="flex gap-2">
                <a
                  href={cvFileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[11px] uppercase tracking-[0.15em] text-zinc-300 hover:border-[#f59e0b] hover:text-[#f59e0b]"
                >
                  <Download className="h-3 w-3" />
                  {t('workerProfile.cv.view')}
                </a>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="inline-flex items-center gap-1 border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[11px] uppercase tracking-[0.15em] text-zinc-300 hover:border-zinc-600 hover:text-zinc-200"
                >
                  <Upload className="h-3 w-3" />
                  {t('workerProfile.cv.replace')}
                </button>
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
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex w-full items-center justify-center gap-2 border border-dashed border-zinc-800 bg-zinc-950 px-3 py-8 text-xs uppercase tracking-[0.15em] text-zinc-400 hover:border-[#f59e0b] hover:text-[#f59e0b] disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Upload className="h-5 w-5" />
            )}
            {uploading
              ? t('common.loading')
              : t('workerProfile.cv.uploadPdf')}
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
          e.target.value = '';
        }}
      />
    </section>
  );
}