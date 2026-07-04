import { FormEvent, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase, TABLES, STORAGE_BUCKETS } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Loader2, FileText, Upload, RefreshCw } from 'lucide-react';
import type { Certification } from '@/lib/certifications';

interface CertificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: Certification | null;
  renewMode?: boolean;
  onSaved: () => void;
}

export function CertificationDialog({
  open,
  onOpenChange,
  editing,
  renewMode = false,
  onSaved,
}: CertificationDialogProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [name, setName] = useState('');
  const [issuer, setIssuer] = useState('');
  const [credentialId, setCredentialId] = useState('');
  const [verificationUrl, setVerificationUrl] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [fileUrl, setFileUrl] = useState('');

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setIssuer(editing.issuer);
      setCredentialId(editing.credential_id ?? '');
      setVerificationUrl(editing.verification_url ?? '');
      if (renewMode) {
        // For renew mode, clear dates so user enters new ones
        setIssueDate('');
        setExpiryDate('');
        setFileUrl('');
      } else {
        setIssueDate(editing.issue_date ?? '');
        setExpiryDate(editing.expiry_date ?? '');
        setFileUrl(editing.file_url ?? '');
      }
    } else {
      setName('');
      setIssuer('');
      setCredentialId('');
      setVerificationUrl('');
      setIssueDate('');
      setExpiryDate('');
      setFileUrl('');
    }
  }, [open, editing, renewMode]);

  const handleFileUpload = async (file: File) => {
    if (!user) return;
    if (file.type !== 'application/pdf' && !file.type.startsWith('image/')) {
      toast.error(t('profile.certificationDialog.filePdfOrImage'));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error(t('profile.certificationDialog.fileUnder10'));
      return;
    }
    setUploading(true);
    const ext = file.name.split('.').pop() || 'pdf';
    const path = `${user.id}/cert-${Date.now()}.${ext}`;
    const bucketName = STORAGE_BUCKETS.certificates;

    // Logging: bucket, file type, file size
    console.log('[CertificationDialog] File upload starting:', {
      bucket: bucketName,
      path,
      fileType: file.type,
      fileSize: file.size,
      fileName: file.name,
    });

    const { error } = await supabase.storage
      .from(bucketName)
      .upload(path, file, { upsert: false, cacheControl: '3600' });
    if (error) {
      console.error('[CertificationDialog] Upload error:', { bucket: bucketName, path, error });
      setUploading(false);
      toast.error(error.message);
      return;
    }

    console.log('[CertificationDialog] Upload success:', { bucket: bucketName, path });

    const { data } = supabase.storage
      .from(bucketName)
      .getPublicUrl(path);

    console.log('[CertificationDialog] Public URL:', data.publicUrl);
    setFileUrl(data.publicUrl);
    setUploading(false);
    toast.success(t('profile.certificationDialog.fileUploaded'));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!name.trim() || !issuer.trim()) {
      toast.error(t('profile.certificationDialog.nameIssuerRequired'));
      return;
    }
    setSaving(true);

    let qrDataUrl: string | null = null;
    if (verificationUrl.trim()) {
      try {
        qrDataUrl = await QRCode.toDataURL(verificationUrl.trim(), {
          width: 300,
          margin: 1,
          color: { dark: '#000000', light: '#ffffff' },
        });
      } catch {
        qrDataUrl = null;
      }
    }

    const payload = {
      certification_name: name.trim(),
      issuing_organization: issuer.trim(),
      credential_id: credentialId.trim() || null,
      verification_url: verificationUrl.trim() || null,
      qr_code_url: qrDataUrl,
      file_url: fileUrl || null,
      certificate_file_url: fileUrl || null,
      issue_date: issueDate || null,
      expiry_date: expiryDate || null,
      expiration_date: expiryDate || null,
      updated_at: new Date().toISOString(),
    };

    if (editing) {
      const { error } = await supabase
        .from(TABLES.certifications)
        .update(payload)
        .eq('id', editing.id);
      setSaving(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(
        renewMode
          ? t('certActions.renewSuccess')
          : t('profile.certificationDialog.certUpdated')
      );
    } else {
      const { error } = await supabase
        .from(TABLES.certifications)
        .insert({ ...payload, user_id: user.id });
      setSaving(false);
      if (error) {
        toast.error(t('profile.certificationDialog.certAddFailed'));
        return;
      }
      toast.success(t('profile.certificationDialog.certAdded'));
    }
    onSaved();
    onOpenChange(false);
  };

  const dialogTitle = renewMode
    ? t('certActions.renewTitle')
    : editing
      ? t('profile.certificationDialog.editTitle')
      : t('profile.certificationDialog.addTitle');

  const dialogDescription = renewMode
    ? t('certActions.renewDescription')
    : t('profile.certificationDialog.description');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-zinc-800 bg-[#0d0d0d]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {renewMode && <RefreshCw className="h-5 w-5 text-emerald-400" />}
            {dialogTitle}
          </DialogTitle>
          <DialogDescription className="text-zinc-500">
            {dialogDescription}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          {renewMode && (
            <div className="border border-emerald-600/30 bg-emerald-600/5 p-3">
              <p className="text-xs text-emerald-300">
                {t('certActions.renewHint')}
              </p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400">
                {t('profile.certificationDialog.certName')} *
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('profile.certificationDialog.certNamePlaceholder')}
                disabled={renewMode}
                className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-[#f59e0b] [color-scheme:dark] disabled:opacity-60"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400">
                {t('profile.certificationDialog.issuer')} *
              </Label>
              <Input
                value={issuer}
                onChange={(e) => setIssuer(e.target.value)}
                placeholder={t('profile.certificationDialog.issuerPlaceholder')}
                disabled={renewMode}
                className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-[#f59e0b] [color-scheme:dark] disabled:opacity-60"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400">
                {t('profile.certificationDialog.credentialId')}
              </Label>
              <Input
                value={credentialId}
                onChange={(e) => setCredentialId(e.target.value)}
                placeholder={t(
                  'profile.certificationDialog.credentialIdPlaceholder'
                )}
                className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-[#f59e0b] [color-scheme:dark]"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400">
                {t('profile.certificationDialog.verificationUrl')}
              </Label>
              <Input
                type="url"
                value={verificationUrl}
                onChange={(e) => setVerificationUrl(e.target.value)}
                placeholder={t(
                  'profile.certificationDialog.verificationUrlPlaceholder'
                )}
                className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-[#f59e0b] [color-scheme:dark]"
              />
            </div>
            <div className="space-y-2">
              <Label
                className={`text-xs uppercase tracking-wider ${renewMode ? 'text-emerald-400' : 'text-zinc-400'}`}
              >
                {t('profile.certificationDialog.issueDate')}{' '}
                {renewMode && '*'}
              </Label>
              <Input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-[#f59e0b] [color-scheme:dark]"
              />
            </div>
            <div className="space-y-2">
              <Label
                className={`text-xs uppercase tracking-wider ${renewMode ? 'text-emerald-400' : 'text-zinc-400'}`}
              >
                {t('profile.certificationDialog.expiryDate')}{' '}
                {renewMode && '*'}
              </Label>
              <Input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-[#f59e0b] [color-scheme:dark]"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label
              className={`text-xs uppercase tracking-wider ${renewMode ? 'text-emerald-400' : 'text-zinc-400'}`}
            >
              {t('profile.certificationDialog.certificateFile')}
            </Label>
            {fileUrl ? (
              <div className="flex items-center justify-between border border-zinc-800 bg-zinc-950 p-3">
                <div className="flex items-center gap-2 text-sm text-zinc-300">
                  <FileText className="h-4 w-4 text-[#f59e0b]" />
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    {t('profile.certificationDialog.viewFile')}
                  </a>
                </div>
                <button
                  type="button"
                  onClick={() => setFileUrl('')}
                  className="text-xs uppercase tracking-wider text-zinc-500 hover:text-red-400"
                >
                  {t('profile.certificationDialog.replace')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex w-full items-center justify-center gap-2 border border-dashed border-zinc-800 bg-zinc-950 px-3 py-6 text-xs uppercase tracking-[0.15em] text-zinc-400 hover:border-[#f59e0b] hover:text-[#f59e0b] disabled:opacity-50"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {uploading
                  ? t('profile.certificationDialog.uploading')
                  : t('profile.certificationDialog.uploadFile')}
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
                e.target.value = '';
              }}
            />
            <p className="text-[11px] text-zinc-500">
              {t('profile.certificationDialog.qrNote')}
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="text-zinc-400 hover:text-zinc-200"
            >
              {t('profile.certificationDialog.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className={
                renewMode
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700 font-semibold'
                  : 'bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold'
              }
            >
              {saving
                ? t('profile.certificationDialog.saving')
                : renewMode
                  ? t('certActions.renewSave')
                  : editing
                    ? t('profile.certificationDialog.saveChanges')
                    : t('profile.certificationDialog.addCertification')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}