import { useRef, useState } from 'react';
import { Camera, Eye, EyeOff, Loader2, Trash2, User } from 'lucide-react';
import { supabase, STORAGE_BUCKETS, TABLES } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { compressImage, isAcceptedImage, uploadWithTimeout } from '@/lib/uploadHelpers';
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

  const initials = (fullName || 'U')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const handleUpload = async (file: File) => {
    if (!user) return;
    if (!isAcceptedImage(file)) {
      toast.error('Please select an image file (JPG, PNG, WebP, or HEIC)');
      return;
    }
    setUploading(true);
    try {
      // Compress image before upload (critical for mobile cameras: 5-15MB → ~200KB)
      const compressed = await compressImage(file, 800, 800, 0.8);
      const path = `${user.id}/avatar-${Date.now()}.jpg`;
      const { error } = await uploadWithTimeout(
        STORAGE_BUCKETS.avatars,
        path,
        compressed,
        { upsert: true, cacheControl: '3600' },
        30_000,
      );
      if (error) {
        toast.error(error.message);
        return;
      }
      const { data } = supabase.storage.from(STORAGE_BUCKETS.avatars).getPublicUrl(path);
      const publicUrl = data.publicUrl;
      const { error: updateErr } = await supabase
        .from(TABLES.profiles)
        .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
      if (updateErr) {
        toast.error(updateErr.message);
        return;
      }
      onChange(publicUrl);
      await recalculateAndSaveProfileCompletion(user.id);
      await refreshProfile();
      toast.success('Profile picture updated');
    } catch {
      toast.error('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!user) return;
    setRemoving(true);
    const { error } = await supabase
      .from(TABLES.profiles)
      .update({ avatar_url: null, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);
    setRemoving(false);
    if (error) {
      toast.error(error.message);
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
    const { error } = await supabase
      .from(TABLES.profiles)
      .update({ show_avatar: next, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);
    setTogglingVisibility(false);
    if (error) {
      toast.error(error.message);
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
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs uppercase tracking-[0.15em] text-zinc-300 hover:border-[#f59e0b] hover:text-[#f59e0b] disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Camera className="h-3.5 w-3.5" />
            )}
            {uploading ? 'Uploading…' : avatarUrl ? 'Change photo' : 'Upload photo'}
          </button>

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

        <p className="text-[11px] text-zinc-500">
          JPG, PNG, WebP, or HEIC. Images are compressed automatically. Photo upload is optional.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}