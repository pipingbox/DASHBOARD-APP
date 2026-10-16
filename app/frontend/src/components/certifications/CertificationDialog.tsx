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
import { Loader2, FileText, Upload, RefreshCw, AlertTriangle, ScanSearch } from 'lucide-react';
import type { Certification } from '@/lib/certifications';
import { getSecureFileUrl } from '@/lib/storageHelpers';
import { hasStoredRecordFile } from '@/lib/filePresence';
import {
  applyCertDraft,
  getDraftByStoragePath,
  requestCertExtraction,
  type CertDraft,
  type CertFieldName,
} from '@/lib/certDrafts';

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
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  // PB-STORAGE-SECURITY-001: canonical location of the uploaded certificate.
  const [storageBucket, setStorageBucket] = useState<string | null>(null);
  const [storagePath, setStoragePath] = useState<string | null>(null);

  // PB-CERT-AUTO-PROFILE-001: draft de extracción del documento subido.
  const [extracting, setExtracting] = useState(false);
  const [certDraft, setCertDraft] = useState<CertDraft | null>(null);
  // Confianza por campo (para el distintivo "verifica este dato").
  const [fieldConfidence, setFieldConfidence] = useState<Partial<Record<CertFieldName, 'high' | 'medium' | 'low'>>>({});

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
        setFileUrl(null);
        setStorageBucket(null);
        setStoragePath(null);
      } else {
        setIssueDate(editing.issue_date ?? '');
        setExpiryDate(editing.expiry_date ?? '');
        setFileUrl(editing.file_url ?? editing.certificate_file_url ?? null);
        setStorageBucket(editing.storage_bucket ?? null);
        setStoragePath(editing.storage_path ?? null);
      }
    } else {
      setName('');
      setIssuer('');
      setCredentialId('');
      setVerificationUrl('');
      setIssueDate('');
      setExpiryDate('');
      setFileUrl(null);
      setStorageBucket(null);
      setStoragePath(null);
    }
    // PB-CERT-AUTO-PROFILE-001: reset del estado de extracción al abrir.
    setCertDraft(null);
    setFieldConfidence({});
    setExtracting(false);
  }, [open, editing, renewMode]);

  /** Never open the stored object through a public URL. */
  const openUploadedFile = async () => {
    const bucket = storageBucket || STORAGE_BUCKETS.certificates;
    const sourceRef = storagePath || fileUrl;
    if (!sourceRef) return;
    const url = await getSecureFileUrl(bucket, sourceRef);
    if (!url) {
      toast.error(t('profile.certificationDialog.viewFileDenied', { defaultValue: 'Access denied' }));
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

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

    // PB-STORAGE-SECURITY-001 phase 2: persist the canonical location only.
    setFileUrl(null);
    setStorageBucket(bucketName);
    setStoragePath(path);
    setUploading(false);
    toast.success(t('profile.certificationDialog.fileUploaded'));

    // PB-CERT-AUTO-PROFILE-001: tras la subida, intentar la extracción
    // DRAFT FIRST. Solo PDF con texto nativo en fase 1; imagen/scan →
    // fallback manual honesto (mensaje, nunca "extracción completada").
    if (file.type === 'application/pdf') {
      setExtracting(true);
      setCertDraft(null);
      setFieldConfidence({});
      try {
        const resp = await requestCertExtraction(bucketName, path);
        if (resp && (resp.status === 'completed' || resp.status === 'retried' || resp.status === 'already_processed') && resp.draft_id) {
          const draft = await getDraftByStoragePath(path);
          if (draft && draft.extraction_status === 'pending_review' && draft.extracted_fields.length > 0) {
            setCertDraft(draft);
            const conf: Partial<Record<CertFieldName, 'high' | 'medium' | 'low'>> = {};
            for (const f of draft.extracted_fields) {
              conf[f.field] = f.confidence;
              // Pre-rellena SOLO huecos (nunca pisa lo ya escrito/confirmado).
              if (f.field === 'certification_name') setName((prev) => (prev.trim() ? prev : f.value));
              if (f.field === 'issuing_organization') setIssuer((prev) => (prev.trim() ? prev : f.value));
              if (f.field === 'credential_id') setCredentialId((prev) => (prev.trim() ? prev : f.value));
              if (f.field === 'issue_date') setIssueDate((prev) => (prev.trim() ? prev : f.value));
              if (f.field === 'expiry_date') setExpiryDate((prev) => (prev.trim() ? prev : f.value));
            }
            setFieldConfidence(conf);
            toast.success(t('certExtract.prefilled'));
          } else if (draft && draft.extraction_status === 'pending_review') {
            // Extracción OK pero sin campos explícitos: formulario en blanco.
            toast.info(t('certExtract.noDataFound'));
          }
        } else if (resp && resp.status === 'extraction_failed') {
          // Fallback manual honesto: el documento se conserva; el usuario
          // completa los datos. NO se presenta como extracción.
          toast.info(t('certExtract.manualFallback'));
        }
      } finally {
        setExtracting(false);
      }
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!name.trim() || !issuer.trim()) {
      toast.error(t('profile.certificationDialog.nameIssuerRequired'));
      return;
    }
    setSaving(true);

    // PB-CERT-AUTO-PROFILE-001: si hay un draft pendiente del documento
    // subido, la confirmación va por cert-apply-draft (única vía draft →
    // registro canónico; respeta conflictos 409 y nunca toca is_verified).
    if (certDraft && certDraft.extraction_status === 'pending_review') {
      const decisions: { field: CertFieldName; action: 'accept' | 'edit'; value?: string }[] = [];
      const push = (field: CertFieldName, formValue: string) => {
        const extracted = certDraft.extracted_fields.find((f) => f.field === field);
        const v = formValue.trim();
        if (!v) return;
        if (extracted && extracted.value === v) {
          decisions.push({ field, action: 'accept' });
        } else {
          // Valor editado por el usuario (o ausente en el draft): edit.
          decisions.push({ field, action: 'edit', value: v });
        }
      };
      push('certification_name', name);
      push('issuing_organization', issuer);
      push('credential_id', credentialId);
      push('issue_date', issueDate);
      push('expiry_date', expiryDate);

      const result = await applyCertDraft({
        draftId: certDraft.id,
        fields: decisions,
        // Alta nueva: sin target. Edición de una existente: target explícito.
        targetCertificationId: editing?.id ?? null,
      });
      setSaving(false);
      if (!result.ok) {
        if (result.error === 'conflict' && result.conflicts?.length) {
          toast.error(t('certExtract.conflict'));
        } else {
          toast.error(t('profile.certificationDialog.certAddFailed'));
        }
        return;
      }
      toast.success(
        editing
          ? t('profile.certificationDialog.certUpdated')
          : t('profile.certificationDialog.certAdded'),
      );
      onSaved();
      onOpenChange(false);
      return;
    }

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
      storage_bucket: storageBucket,
      storage_path: storagePath,
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

  // PB-CERT-AUTO-PROFILE-001: distintivo de confianza junto al label.
  // Solo "low" muestra aviso explícito (revisión obligatoria); high/medium
  // no añaden ruido visual.
  const confidenceBadge = (field: CertFieldName) => {
    if (fieldConfidence[field] !== 'low') return null;
    return (
      <span className="inline-flex items-center gap-1 text-[10px] normal-case tracking-normal text-amber-400">
        <AlertTriangle className="h-3 w-3" />
        {t('certExtract.verifyField')}
      </span>
    );
  };

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

          {extracting && (
            <div className="flex items-center gap-2 border border-zinc-800 bg-zinc-950 p-3">
              <ScanSearch className="h-4 w-4 animate-pulse text-[#f59e0b]" />
              <p className="text-xs text-zinc-400">{t('certExtract.analyzing')}</p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400">
                {t('profile.certificationDialog.certName')} * {confidenceBadge('certification_name')}
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
                {t('profile.certificationDialog.issuer')} * {confidenceBadge('issuing_organization')}
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
                {t('profile.certificationDialog.credentialId')} {confidenceBadge('credential_id')}
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
                {renewMode && '*'} {confidenceBadge('issue_date')}
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
                {renewMode && '*'} {confidenceBadge('expiry_date')}
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
            {hasStoredRecordFile({
              storage_bucket: storageBucket,
              storage_path: storagePath,
              file_url: fileUrl,
            }) ? (
              <div className="flex items-center justify-between border border-zinc-800 bg-zinc-950 p-3">
                <div className="flex items-center gap-2 text-sm text-zinc-300">
                  <FileText className="h-4 w-4 text-[#f59e0b]" />
                  <button type="button" onClick={openUploadedFile} className="underline">
                    {t('profile.certificationDialog.viewFile')}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFileUrl(null);
                    setStorageBucket(null);
                    setStoragePath(null);
                  }}
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