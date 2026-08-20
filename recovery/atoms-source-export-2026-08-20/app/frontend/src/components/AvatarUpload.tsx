import { useRef, useState } from 'react';
import { Camera, Eye, EyeOff, Loader2, Trash2, User } from 'lucide-react';
import { supabase, STORAGE_BUCKETS, TABLES } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import {
  isValidImageFile,
  isHeicFile,
  validateFileSize,
  getSafeImageExtension,
  triggerFileInput,
  ACCEPT_IMAGES,
} from '@/lib/fileUploadUtils';
import { compressImage, uploadWithTimeout } from '@/lib/uploadHelpers';
import { recalculateAndSaveProfileCompletion } from '@/lib/profileCompletion';

interface AvatarUploadProps {
  avatarUrl: string | null;
  fullName: string | null;
  showAvatar: boolean;
  onChange: (url: string | null) => void;
  onToggleShow: (next: boolean) => void;
}

export function AvatarUpload({
  avatarUrl,
  fullName,
  showAvatar,
  onChange,
  onToggleShow,
}: AvatarUploadProps) {
  const { user, refreshProfile } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [togglingVisibility, setTogglingVisibility] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const initials = (fullName || 'U')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const handleUpload = async (file: File) => {
    if (!user) return;
    setUploadError(null);

    // Validate file type (mobile-friendly: includes HEIC/HEIF)
    if (!isValidImageFile(file)) {
      const msg = 'Solo se aceptan imágenes JPG, PNG, WebP o HEIC';
      setUploadError(msg);
      toast.error(msg);
      return;
    }

    // Validate file size
    const sizeError = validateFileSize(file, 5);
    if (sizeError) {
      setUploadError(sizeError);
      toast.error(sizeError);
      return;
    }

    // Warn about HEIC (it will upload but may not preview in all browsers)
    if (isHeicFile(file)) {
      toast.info('Foto HEIC detectada. Se subirá correctamente pero la vista previa puede no funcionar en todos los navegadores.');
    }

    setUploading(true);

    // Compress image before upload (skips HEIC since canvas can't decode it)
    const compressed = await compressImage(file, { maxWidth: 800, maxHeight: 800, quality: 0.85 });

    const ext = getSafeImageExtension(compressed.name || file.name);
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;

    console.log('[AvatarUpload] Upload starting:', {
      path,
      originalType: file.type,
      originalSize: file.size,
      compressedSize: compressed.size,
      fileName: file.name,
    });

    // Use uploadWithTimeout for mobile reliability (30s timeout)
    const { error } = await uploadWithTimeout(
      STORAGE_BUCKETS.avatars,
      path,
      compressed,
      { upsert: true, cacheControl: '3600', timeoutMs: 30000 }
    );

    if (error) {
      setUploading(false);
      const msg = `Error al subir: ${error.message}`;
      setUploadError(msg);
      toast.error(msg);
      return;
    }
    const { data } = supabase.storage.from(STORAGE_BUCKETS.avatars).getPublicUrl(path);
    const publicUrl = data.publicUrl;
    const { data: upsertedData, error: updateErr } = await supabase
      .from(TABLES.profiles)
      .upsert(
        { user_id: user.id, avatar_url: publicUrl, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
      .select()
      .single();
    setUploading(false);
    if (updateErr || !upsertedData) {
      console.error('[AvatarUpload] Upsert failed:', updateErr?.message);
      const msg = updateErr?.message || 'Failed to save avatar to profile';
      setUploadError(msg);
      toast.error(msg);
      return;
    }
    setUploadError(null);
    onChange(publicUrl);
    await refreshProfile();
    toast.success('Profile picture updated');

    // Recalculate profile completion (non-blocking)
    recalculateAndSaveProfileCompletion(user.id).catch(() => {});
  };

  const handleRemove = async () => {
    if (!user) return;
    setRemoving(true);
    const { data: upsertedData, error } = await supabase
      .from(TABLES.profiles)
      .upsert(
        { user_id: user.id, avatar_url: null, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
      .select()
      .single();
    setRemoving(false);
    if (error || !upsertedData) {
      console.error('[AvatarUpload] Remove upsert failed:', error?.message);
      toast.error(error?.message || 'Failed to remove avatar');
      return;
    }
    onChange(null);
    await refreshProfile();
    toast.success('Profile photo removed');
  };

  const handleToggleVisibility = async () => {
    if (!user) return;
    const next = !showAvatar;
    setTogglingVisibility(true);
    const { data: upsertedData, error } = await supabase
      .from(TABLES.profiles)
      .upsert(
        { user_id: user.id, show_avatar: next, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
      .select()
      .single();
    setTogglingVisibility(false);
    if (error || !upsertedData) {
      console.error('[AvatarUpload] Toggle visibility upsert failed:', error?.message);
      toast.error(error?.message || 'Failed to update visibility');
      return;
    }
    onToggleShow(next);
    await refreshProfile();
    toast.success(next ? 'Photo is now visible' : 'Photo is now hidden');
  };

  const displayAvatar = avatarUrl && showAvatar;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="relative h-24 w-24 overflow-hidden border border-zinc-800 bg-zinc-900">
        {displayAvatar ? (
          <img src={avatarUrl!} alt="avatar" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xl font-semibold text-zinc-400">
            {initials || <User className="h-8 w-8" />}
          </div>
        )}
        {avatarUrl && !showAvatar && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <EyeOff className="h-5 w-5 text-zinc-300" />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {/* 
            Mobile fix: Use a <label> element that wraps the file input.
            This is more reliable on mobile than programmatic .click().
            The label acts as the click target for the hidden input.
          */}
          <label
            className={`inline-flex cursor-pointer items-center gap-2 border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs uppercase tracking-[0.15em] text-zinc-300 hover:border-[#f59e0b] hover:text-[#f59e0b] ${uploading ? 'pointer-events-none opacity-50' : ''}`}
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Camera className="h-3.5 w-3.5" />
            )}
            {uploading ? 'Uploading…' : avatarUrl ? 'Change photo' : 'Upload photo'}
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT_IMAGES}
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
                // Reset value to allow re-selecting same file
                if (e.target) e.target.value = '';
              }}
            />
          </label>

          {avatarUrl && (
            <>
              <button
                type="button"
                disabled={togglingVisibility}
                onClick={handleToggleVisibility}
                className="inline-flex items-center gap-2 border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs uppercase tracking-[0.15em] text-zinc-300 hover:border-[#f59e0b] hover:text-[#f59e0b] disabled:opacity-50"
              >
                {togglingVisibility ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : showAvatar ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
                {showAvatar ? 'Hide photo' : 'Show photo'}
              </button>

              <button
                type="button"
                disabled={removing}
                onClick={handleRemove}
                className="inline-flex items-center gap-2 border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs uppercase tracking-[0.15em] text-zinc-400 hover:border-red-500 hover:text-red-400 disabled:opacity-50"
              >
                {removing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Remove
              </button>
            </>
          )}
        </div>

        {/* Error message - visible on mobile */}
        {uploadError && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1.5">
            ⚠️ {uploadError}
          </p>
        )}

        <p className="text-[11px] text-zinc-500">
          JPG, PNG, WebP o HEIC (iPhone), max 5MB. Photo upload is optional — you can hide it at any time.
        </p>
      </div>
    </div>
  );
}