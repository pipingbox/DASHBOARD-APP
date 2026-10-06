import { useEffect, useRef, useState, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Award,
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Upload,
  Loader2,
  ExternalLink,
  Calendar,
  FileText,
} from 'lucide-react';
import { supabase, TABLES, STORAGE_BUCKETS } from '@/lib/supabase';
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
import type { WorkerCertification } from '@/lib/workerProfile';
import { normalizeCertification } from '@/lib/workerProfile';
import { syncCertificationReminders, deleteCertificationReminders } from '@/lib/certificationReminders';
import { resolveFileMime } from '@/lib/uploadHelpers';
import {
  startResumableUpload,
  UPLOAD_FAILURE_I18N,
  formatBytes,
  type DocumentUploadController,
  type DocumentUploadProgress,
} from '@/lib/resumableUpload';
import { trackEvent, getCorrelationId } from '@/lib/observability';
import { recalculateAndSaveProfileCompletion } from '@/lib/profileCompletion';
import { getSecureFileUrl, deleteStorageObject, extractStoragePathAndBucket } from '@/lib/storageHelpers';
import { hasStoredRecordFile } from '@/lib/filePresence';
import { EmailIntakeEntry } from '@/components/profile/EmailIntakeEntry';

export function CertificationsSection() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<WorkerCertification[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<WorkerCertification | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WorkerCertification | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  // PB-DOCUMENT-INTAKE-001 — resumable (TUS) upload machine state for the UI.
  const [uploadUi, setUploadUi] = useState<DocumentUploadProgress | null>(null);
  const uploadControllerRef = useRef<DocumentUploadController | null>(null);
  // Controller of a transport-completed upload whose canonical row has not
  // been written yet (stays in VERIFYING until submit confirms or fails).
  const pendingConfirmRef = useRef<DocumentUploadController | null>(null);
  // Stable path per file selection so TUS can resume the same object.
  const lastUploadAttemptRef = useRef<{ signature: string; path: string } | null>(null);
  // Recoverable failure state (network/timeout): user can retry without reloading.
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Alert preferences state
  const [reminderDays, setReminderDays] = useState<number>(90);
  const [showInApp, setShowInApp] = useState<boolean>(true);
  const [savingPrefs, setSavingPrefs] = useState(false);

  // Form state
  const [certName, setCertName] = useState('');
  const [issuingOrg, setIssuingOrg] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [credentialId, setCredentialId] = useState('');
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [storageBucket, setStorageBucket] = useState<string | null>(null);
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [notes, setNotes] = useState('');
  const [isVisible, setIsVisible] = useState(true);

  const load = async () => {
    if (!user) return;
    console.log('[CertificationsSection] load - current user id:', user.id);
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('app_worker_certifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      console.log('[CertificationsSection] certifications response data:', data);
      console.log('[CertificationsSection] certifications response error:', error);
      if (error) {
        toast.error(error.message);
      } else if (data && data.length > 0) {
        const normalized = data.map((row: Record<string, unknown>) => normalizeCertification(row));
        setItems(normalized);
      } else {
        setItems([]);
      }
    } catch {
      toast.error(t('common.unexpectedError'));
    } finally {
      setLoading(false);
    }
  };

  const loadAlertPreferences = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('app_worker_certification_alert_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) {
        console.error('[CertificationsSection] alert prefs load error:', error);
        return;
      }
      if (data) {
        setReminderDays((data as Record<string, unknown>).reminder_days as number ?? 90);
        setShowInApp((data as Record<string, unknown>).show_in_app as boolean ?? true);
      }
    } catch (err) {
      console.error('[CertificationsSection] alert prefs load exception:', err);
    }
  };

  const saveAlertPreferences = async () => {
    if (!user) return;
    setSavingPrefs(true);
    try {
      const { error } = await supabase
        .from('app_worker_certification_alert_preferences')
        .upsert({
          user_id: user.id,
          reminder_days: reminderDays,
          show_in_app: showInApp,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
      if (error) {
        console.error('[CertificationsSection] alert prefs save error:', error);
        toast.error(t('workerProfile.certifications.prefsSaveError'));
      } else {
        toast.success(t('workerProfile.certifications.prefsSaved'));
      }
    } catch (err) {
      console.error('[CertificationsSection] alert prefs save exception:', err);
      toast.error(t('workerProfile.certifications.prefsSaveError'));
    } finally {
      setSavingPrefs(false);
    }
  };

  useEffect(() => {
    load();
    loadAlertPreferences();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // PB-DOCUMENT-INTAKE-001: the elapsed clock, byte counters, retry/slow
  // flags and the state machine all live in the shared uploader; this
  // component only renders what it reports. The accumulated time never
  // resets across internal retries or pauses.

  const resetForm = () => {
    setCertName('');
    setIssuingOrg('');
    setIssueDate('');
    setExpiryDate('');
    setCredentialId('');
    setFileUrl(null);
    setStorageBucket(null);
    setStoragePath(null);
    setFileName('');
    setNotes('');
    setIsVisible(true);
  };

  const openAdd = () => {
    setEditing(null);
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (cert: WorkerCertification) => {
    setEditing(cert);
    setCertName(cert.certification_name);
    setIssuingOrg(cert.issuing_organization);
    setIssueDate(cert.issue_date ?? '');
    setExpiryDate(cert.expiry_date ?? '');
    setCredentialId(cert.credential_id ?? '');
    setFileUrl(cert.file_url ?? cert.certificate_file_url ?? null);
    setStorageBucket(cert.storage_bucket ?? null);
    setStoragePath(cert.storage_path ?? null);
    setFileName(cert.file_name ?? '');
    setNotes(cert.notes ?? '');
    setIsVisible(cert.is_visible);
    setDialogOpen(true);
  };

  const toggleVisibility = async (cert: WorkerCertification) => {
    // Optimistic update
    const previousItems = [...items];
    setItems((prev) =>
      prev.map((i) => (i.id === cert.id ? { ...i, is_visible: !i.is_visible } : i))
    );
    try {
      const { error } = await supabase
        .from(TABLES.workerCertifications)
        .update({ is_visible: !cert.is_visible })
        .eq('id', cert.id);
      if (error) {
        toast.error(error.message);
        setItems(previousItems);
      }
    } catch {
      toast.error(t('common.unexpectedError'));
      setItems(previousItems);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!user) {
      console.warn('[CertUpload] No user session, aborting');
      return;
    }

    // Mobile browsers often report empty or generic MIME types.
    // Validate by extension as fallback when file.type is unreliable.
    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/heic', 'image/heif'];
    const allowedExtensions = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'heic', 'heif'];
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const mimeOk = file.type && allowedTypes.includes(file.type);
    const extOk = allowedExtensions.includes(ext);

    const resolvedMime = resolveFileMime(file);

    console.log('[CertUpload] File selected:', {
      name: file.name,
      type: file.type || '(empty)',
      size: file.size,
      ext,
      mimeOk,
      extOk,
      resolvedMime,
    });

    if (!mimeOk && !extOk) {
      console.warn('[CertUpload] Rejected: invalid type and extension');
      toast.error(t('workerProfile.certifications.invalidFileType'));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      console.warn('[CertUpload] Rejected: file too large', file.size);
      toast.error(t('workerProfile.certifications.fileTooBig'));
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadUi(null);

    // PB-DOCUMENT-INTAKE-001 — TUS resumable upload via the shared uploader.
    // The object path is stable per file selection: re-selecting the same
    // file after a recoverable failure RESUMES from the previous offset
    // instead of restarting the whole transfer.
    const signature = `${file.name}|${file.size}|${file.lastModified}`;
    const previousAttempt = lastUploadAttemptRef.current;
    const filePath =
      previousAttempt && previousAttempt.signature === signature
        ? previousAttempt.path
        : `${user.id}/cert-${Date.now()}.${ext || 'pdf'}`;
    lastUploadAttemptRef.current = { signature, path: filePath };
    // PB-STORAGE-SECURITY-001: certificates live in the certificates bucket.
    const bucketName = STORAGE_BUCKETS.certificates;

    const controller = startResumableUpload(file, {
      documentType: 'certificate',
      bucket: bucketName,
      path: filePath,
      contentType: resolvedMime,
      route: '/profile',
      onProgress: (p) => setUploadUi(p),
    });
    uploadControllerRef.current = controller;

    const result = await controller.promise;
    uploadControllerRef.current = null;

    if (result.ok) {
      // Transport + verification HEAD confirmed. The canonical row is
      // created on submit; until then the controller stays in VERIFYING
      // and is confirmed/failed by the submit path.
      pendingConfirmRef.current = controller;
      setUploadUi(null);
      setFileUrl(null);
      setStorageBucket(bucketName);
      setStoragePath(filePath);
      setFileName(file.name);
      toast.success(t('common.upload.fileAttached'));
      setUploading(false);
      return;
    }

    setUploadUi(null);
    setUploading(false);
    if ('reason' in result && result.reason === 'cancelled') {
      // User-initiated cancel: no error banner, form preserved.
      return;
    }
    if ('reason' in result) {
      // Recoverable state: keep the dialog open so the user can retry with
      // the same form data instead of losing it.
      const message = t(UPLOAD_FAILURE_I18N[result.reason]);
      setUploadError(message);
      toast.error(message);
    }
  };

  const cancelUpload = () => {
    uploadControllerRef.current?.cancel();
  };

  const openCertificateFilePicker = () => {
    if (uploading) return;
    fileInputRef.current?.click();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!certName.trim() || !issuingOrg.trim()) {
      toast.error(t('workerProfile.certifications.nameOrgRequired'));
      return;
    }
    setSaving(true);
    console.log('[CertSave] === SAVE STARTED ===');
    const saveStartTime = Date.now();

    // Hard timeout: if save takes > 20s, force-reset UI state
    const saveTimeoutId = setTimeout(() => {
      console.error('[CertSave] HARD TIMEOUT: save exceeded 20s, force-resetting UI');
      setSaving(false);
      setDialogOpen(false);
      toast.error(t('workerProfile.certifications.saveTimedOut'));
    }, 20000);

    try {
      // Build payload using ONLY allowed fields (no legacy fields)
      const payload: Record<string, unknown> = {
        certification_name: certName.trim(),
        issuing_organization: issuingOrg.trim(),
        issue_date: issueDate || null,
        expiry_date: expiryDate || null,
        expiration_date: expiryDate || null,
        credential_id: credentialId.trim() || null,
        verification_url: null,
        certificate_file_url: fileUrl || null,
        file_url: fileUrl || null,
        file_name: fileName || null,
        document_name: fileName || null,
        notes: notes.trim() || null,
        is_visible: isVisible,
        visible_to_companies: isVisible,
        storage_bucket: storageBucket,
        storage_path: storagePath,
      };

      console.log('[CertSave] Payload built:', JSON.stringify(payload, null, 2));

      if (editing) {
        console.log('[CertSave] MODE: UPDATE, cert id:', editing.id);
        console.log('[CertSave] Before supabase.update()...');
        const { error } = await supabase
          .from('app_worker_certifications')
          .update(payload)
          .eq('id', editing.id);
        console.log('[CertSave] After supabase.update(), elapsed:', Date.now() - saveStartTime, 'ms');
        console.log('[CertSave] Update error:', error || 'none');

        if (error) {
          toast.error(error.message);
          // PB-DOCUMENT-INTAKE-001 — same compensation on update failures.
          pendingConfirmRef.current?.failCanonical();
          if (pendingConfirmRef.current && storageBucket && storagePath) {
            await deleteStorageObject(storageBucket, storagePath).catch(() => undefined);
            setFileUrl(null);
            setStorageBucket(null);
            setStoragePath(null);
            setFileName('');
          }
          pendingConfirmRef.current = null;
          return;
        }

        // PB-STORAGE-SECURITY-001: if the file changed, delete the previous object.
        // Gating this on the legacy URL would leak an orphan per replacement once
        // writers stop emitting one, so the canonical path decides.
        const oldUrl = editing.file_url || editing.certificate_file_url || null;
        const oldBucket = editing.storage_bucket;
        const oldPath = editing.storage_path;
        const hadPreviousFile = hasStoredRecordFile(editing);
        const fileChanged =
          oldBucket && oldPath
            ? oldBucket !== storageBucket || oldPath !== storagePath
            : oldUrl !== fileUrl;
        if (hadPreviousFile && fileChanged) {
          if (oldBucket && oldPath) {
            await deleteStorageObject(oldBucket, oldPath);
          } else if (oldUrl) {
            const extracted = extractStoragePathAndBucket(oldUrl);
            if (extracted.bucket && extracted.path) {
              await deleteStorageObject(extracted.bucket, extracted.path);
            }
          }
        }

        // Optimistic update
        console.log('[CertSave] Applying optimistic update...');
        setItems((prev) =>
          prev.map((i) => (i.id === editing.id ? { ...i, ...payload } : i)),
        );
        // PB-DOCUMENT-INTAKE-001 — canonical write confirmed (update path).
        pendingConfirmRef.current?.confirmSaved();
        pendingConfirmRef.current = null;
        toast.success(t('workerProfile.certifications.updated'));

        // Sync reminders (non-blocking — don't let this hang the UI)
        console.log('[CertSave] Syncing reminders (non-blocking)...');
        syncCertificationReminders(user.id, editing.id, payload.expiry_date as string | null)
          .then((result) => {
            if (result.remindersCreated > 0) {
              toast.success(t('workerProfile.certifications.remindersScheduled', { count: result.remindersCreated }));
            } else if (!payload.expiry_date) {
              toast.info(t('workerProfile.certifications.noExpiryNoReminders'));
            }
            console.log('[CertSave] Reminders synced:', result);
          })
          .catch((reminderErr) => {
            console.error('[CertSave] Reminder sync failed (non-blocking):', reminderErr);
          });
      } else {
        // INSERT mode
        console.log('[CertSave] MODE: INSERT');

        // Step 1: Get fresh authenticated user
        console.log('[CertSave] Getting fresh auth user...');
        const { data: authData, error: authError } = await supabase.auth.getUser();
        console.log('[CertSave] auth.getUser() completed, elapsed:', Date.now() - saveStartTime, 'ms');
        console.log('[CertSave] auth result:', {
          userId: authData?.user?.id ?? null,
          authError: authError?.message ?? null,
        });

        // Step 2: Abort if no user session
        if (authError || !authData?.user) {
          console.error('[CertSave] No authenticated user session');
          toast.error(t('common.sessionNotFound'));
          return;
        }

        const authUserId = authData.user.id;
        if (!authUserId) {
          console.error('[CertSave] user_id is null or undefined, aborting insert');
          toast.error(t('common.sessionNotFound'));
          return;
        }

        // Step 3: Build final insert payload with user_id
        const insertPayload = { ...payload, user_id: authUserId };
        console.log('[CertSave] Final INSERT payload:', JSON.stringify(insertPayload, null, 2));

        // Step 4: Insert into Supabase
        console.log('[CertSave] Before supabase.insert()...');
        const { data, error } = await supabase
          .from('app_worker_certifications')
          .insert(insertPayload)
          .select()
          .single();
        console.log('[CertSave] After supabase.insert(), elapsed:', Date.now() - saveStartTime, 'ms');
        console.log('[CertSave] Insert response data:', data);
        console.log('[CertSave] Insert response error:', error || 'none');

        if (error) {
          toast.error(error.message);
          // PB-DOCUMENT-INTAKE-001 — safe compensation: the object finished
          // but the canonical row failed. Close the upload machine as a
          // database failure and remove the freshly-created object so no
          // orphan remains; the user keeps the form and can retry.
          pendingConfirmRef.current?.failCanonical();
          if (pendingConfirmRef.current && storageBucket && storagePath) {
            await deleteStorageObject(storageBucket, storagePath).catch(() => undefined);
            setFileUrl(null);
            setStorageBucket(null);
            setStoragePath(null);
            setFileName('');
          }
          pendingConfirmRef.current = null;
          return;
        }

        if (data) {
          console.log('[CertSave] Insert successful, updating local state...');
          setItems((prev) => [data as WorkerCertification, ...prev]);
          // PB-DOCUMENT-INTAKE-001 — canonical write confirmed: only now the
          // upload machine reaches SAVED and document_upload_completed is
          // emitted ("Certificado guardado correctamente").
          pendingConfirmRef.current?.confirmSaved();
          pendingConfirmRef.current = null;

          // Create reminders (non-blocking — don't let this hang the UI)
          console.log('[CertSave] Syncing reminders for new cert (non-blocking)...');
          syncCertificationReminders(authUserId, (data as WorkerCertification).id, payload.expiry_date as string | null)
            .then((result) => {
              if (result.remindersCreated > 0) {
                toast.success(t('workerProfile.certifications.remindersScheduled', { count: result.remindersCreated }));
              } else if (!payload.expiry_date) {
                toast.info(t('workerProfile.certifications.noExpiryNoReminders'));
              }
              console.log('[CertSave] Reminders synced for new cert:', result);
            })
            .catch((reminderErr) => {
              console.error('[CertSave] Reminder sync failed (non-blocking):', reminderErr);
            });
        } else {
          console.log('[CertSave] No data returned from insert, reloading list...');
          // Non-blocking reload — don't await
          load().catch((loadErr) => {
            console.error('[CertSave] Reload failed (non-blocking):', loadErr);
          });
        }
        // PB-DOCUMENT-INTAKE-001 — unambiguous final confirmation: only shown
        // after both the object AND the canonical row are persisted.
        toast.success(t('workerProfile.certifications.savedConfirm'));
      }

      console.log('[CertSave] Closing dialog...');
      setDialogOpen(false);
      console.log('[CertSave] === SAVE COMPLETED === elapsed:', Date.now() - saveStartTime, 'ms');

      // Recalculate profile completion (non-blocking)
      if (user) recalculateAndSaveProfileCompletion(user.id).catch(() => {});
    } catch (err) {
      console.error('[CertSave] Unexpected exception:', err);
      toast.error(t('common.unexpectedError'));
    } finally {
      clearTimeout(saveTimeoutId);
      console.log('[CertSave] finally block — setSaving(false), elapsed:', Date.now() - saveStartTime, 'ms');
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const previousItems = [...items];
    setItems((prev) => prev.filter((i) => i.id !== deleteTarget.id));
    try {
      // Delete associated reminders first
      await deleteCertificationReminders(deleteTarget.id);

      // PB-STORAGE-SECURITY-001: delete the Storage object that belongs to this
      // exact record before removing the DB row.
      if (deleteTarget.storage_bucket && deleteTarget.storage_path) {
        await deleteStorageObject(deleteTarget.storage_bucket, deleteTarget.storage_path);
      } else if (deleteTarget.file_url) {
        const extracted = extractStoragePathAndBucket(deleteTarget.file_url);
        if (extracted.bucket && extracted.path) {
          await deleteStorageObject(extracted.bucket, extracted.path);
        }
      }

      const { error } = await supabase
        .from(TABLES.workerCertifications)
        .delete()
        .eq('id', deleteTarget.id);
      if (error) {
        toast.error(error.message);
        setItems(previousItems);
      } else {
        toast.success(t('workerProfile.certifications.deleted'));
        // Recalculate profile completion (non-blocking)
        if (user) recalculateAndSaveProfileCompletion(user.id).catch(() => {});
      }
    } catch {
      toast.error(t('common.unexpectedError'));
      setItems(previousItems);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const getExpiryStatus = (expiryDate: string | null) => {
    if (!expiryDate) return null;
    const now = new Date();
    const expiry = new Date(expiryDate);
    const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntilExpiry < 0) return 'expired';
    if (daysUntilExpiry <= 30) return 'expiring-soon';
    return 'valid';
  };

  return (
    <section className="border border-zinc-800/80 bg-[#0d0d0d] p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-[#f59e0b]">
            {t('workerProfile.certifications.label')}
          </p>
          <h2 className="mt-1 text-xl font-semibold">
            {t('workerProfile.certifications.title')}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            {t('workerProfile.certifications.description')}
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center gap-2 bg-[#f59e0b] px-3 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-black hover:bg-[#d97706]"
        >
          <Plus className="h-3.5 w-3.5" />
          {t('workerProfile.certifications.add')}
        </button>
      </div>

      <div className="mt-6 space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            {/* PB-UI-DOM-INSERTBEFORE-001: span anchor — see WorkExperienceSection */}
            <span>{t('common.loading')}</span>
          </div>
        ) : items.length === 0 ? (
          <div className="border border-dashed border-zinc-800 bg-zinc-950 p-8 text-center">
            <Award className="mx-auto h-8 w-8 text-zinc-600" />
            <p className="mt-3 text-sm text-zinc-400">
              {t('workerProfile.certifications.empty')}
            </p>
          </div>
        ) : (
          items.map((cert) => {
            const status = getExpiryStatus(cert.expiry_date);
            return (
              <div
                key={cert.id}
                className={`border bg-zinc-950 p-4 ${cert.is_visible ? 'border-zinc-800' : 'border-zinc-800/50 opacity-60'}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Award className="h-4 w-4 text-[#f59e0b]" />
                      <h3 className="text-base font-semibold text-zinc-100">
                        {cert.certification_name}
                      </h3>
                      {!cert.is_visible && (
                        <span className="inline-flex items-center gap-1 border border-zinc-700 px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-zinc-500">
                          <EyeOff className="h-3 w-3" />
                          {t('workerProfile.hidden')}
                        </span>
                      )}
                      {status === 'expired' && (
                        <span className="inline-flex items-center gap-1 border border-red-600/40 bg-red-600/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-red-300">
                          {t('workerProfile.certifications.expired')}
                        </span>
                      )}
                      {status === 'expiring-soon' && (
                        <span className="inline-flex items-center gap-1 border border-yellow-600/40 bg-yellow-600/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-yellow-300">
                          {t('workerProfile.certifications.expiringSoon')}
                        </span>
                      )}
                      {status === 'valid' && (
                        <span className="inline-flex items-center gap-1 border border-emerald-600/40 bg-emerald-600/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-emerald-300">
                          {t('workerProfile.certifications.valid')}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-zinc-400">{cert.issuing_organization}</p>
                    <div className="mt-2 flex flex-wrap gap-4 text-xs text-zinc-500">
                      {cert.issue_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {t('workerProfile.certifications.issued')}: {new Date(cert.issue_date).toLocaleDateString()}
                        </span>
                      )}
                      {cert.expiry_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {t('workerProfile.certifications.expires')}: {new Date(cert.expiry_date).toLocaleDateString()}
                        </span>
                      )}
                      {cert.credential_id && (
                        <span>ID: {cert.credential_id}</span>
                      )}
                    </div>
                    {cert.notes && (
                      <p className="mt-2 text-sm text-zinc-400 line-clamp-2">
                        {cert.notes}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {hasStoredRecordFile(cert) && (
                      <a
                        href={cert.storageUrl || '#'}
                        target="_blank"
                        rel="noreferrer"
                        title={t('workerProfile.certifications.viewFile')}
                        onClick={async (e) => {
                          const bucket = cert.storage_bucket || STORAGE_BUCKETS.certificates;
                          // Canonical path first; legacy URL only for records not yet migrated.
                          const sourceRef = cert.storage_path || cert.file_url || cert.certificate_file_url;
                          if (!sourceRef) {
                            e.preventDefault();
                            return;
                          }
                          const url = await getSecureFileUrl(bucket, sourceRef);
                          if (url) {
                            setItems((prev) =>
                              prev.map((i) =>
                                i.id === cert.id ? { ...i, storageUrl: url } : i,
                              ),
                            );
                          } else {
                            e.preventDefault();
                            toast.error(t('workerProfile.certifications.viewFileDenied', { defaultValue: 'Access denied' }));
                          }
                        }}
                        className="inline-flex items-center gap-1 border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-400 hover:border-[#f59e0b] hover:text-[#f59e0b]"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleVisibility(cert)}
                      title={cert.is_visible ? t('workerProfile.hide') : t('workerProfile.show')}
                      className="inline-flex items-center gap-1 border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                    >
                      {cert.is_visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(cert)}
                      title={t('common.edit')}
                      className="inline-flex items-center gap-1 border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(cert)}
                      title={t('common.delete')}
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

      {/* Alert Preferences */}
      <div className="mt-6 border border-zinc-800 bg-zinc-950 p-4">
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium mb-3">
          {t('workerProfile.certifications.alertPreferences')}
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <Label className="text-xs text-zinc-400">
              {t('workerProfile.certifications.reminderDays')}
            </Label>
            <select
              value={reminderDays}
              onChange={(e) => setReminderDays(Number(e.target.value))}
              className="bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs px-2 py-1.5 rounded-sm focus:outline-none focus:ring-1 focus:ring-[#f59e0b]"
            >
              <option value={30}>30</option>
              <option value={60}>60</option>
              <option value={90}>90</option>
              <option value={120}>120</option>
              <option value={180}>180</option>
            </select>
          </div>
          <div className="flex items-center justify-between gap-4">
            <Label className="text-xs text-zinc-400">
              {t('workerProfile.certifications.showInApp')}
            </Label>
            <Switch
              checked={showInApp}
              onCheckedChange={setShowInApp}
              className="data-[state=checked]:bg-[#f59e0b]"
            />
          </div>
          <div className="flex justify-end pt-1">
            <Button
              type="button"
              size="sm"
              onClick={saveAlertPreferences}
              disabled={savingPrefs}
              className="bg-[#f59e0b] text-black hover:bg-[#d97706] text-xs h-7 px-3 font-semibold"
            >
              {/* PB-UI-DOM-REMOVECHILD-RESIDUAL-001: span anchor — same crash class as the
                  /tools premium banner buttons (conditional icon insert + bare label swap). */}
              {savingPrefs ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : null}
              <span>{savingPrefs ? t('common.saving') : t('common.save')}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!saving && !uploading) setDialogOpen(open); }}>
        <DialogContent
          className="max-w-2xl border-zinc-800 bg-[#0d0d0d]"
          onInteractOutside={(e) => {
            // Prevent dialog from closing when file picker is open (mobile)
            if (uploading) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            // Prevent dialog from closing on pointer down outside (mobile file picker)
            if (uploading) e.preventDefault();
          }}
          onFocusOutside={(e) => {
            // Prevent dialog from closing on focus loss (mobile file picker opens native UI)
            e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {editing
                ? t('workerProfile.certifications.editTitle')
                : t('workerProfile.certifications.addTitle')}
            </DialogTitle>
          </DialogHeader>

          {/* File input OUTSIDE the form to prevent mobile form submission issues */}
          <input
            ref={fileInputRef}
            id="cert-file-upload-input"
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/jpg,image/webp,image/heic,image/heif"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
              // Reset so same file can be re-selected
              e.target.value = '';
            }}
          />

          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-zinc-400">
                  {t('workerProfile.certifications.certName')} *
                </Label>
                <Input
                  value={certName}
                  onChange={(e) => setCertName(e.target.value)}
                  placeholder={t('workerProfile.certifications.certNamePlaceholder')}
                  required
                  className="bg-zinc-950 border-zinc-800 text-zinc-100 focus-visible:ring-[#f59e0b] [color-scheme:dark]"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-zinc-400">
                  {t('workerProfile.certifications.issuingOrg')} *
                </Label>
                <Input
                  value={issuingOrg}
                  onChange={(e) => setIssuingOrg(e.target.value)}
                  placeholder={t('workerProfile.certifications.issuingOrgPlaceholder')}
                  required
                  className="bg-zinc-950 border-zinc-800 text-zinc-100 focus-visible:ring-[#f59e0b] [color-scheme:dark]"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-zinc-400">
                  {t('workerProfile.certifications.issueDate')}
                </Label>
                <Input
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className="bg-zinc-950 border-zinc-800 text-zinc-100 focus-visible:ring-[#f59e0b] [color-scheme:dark]"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-zinc-400">
                  {t('workerProfile.certifications.expiryDate')}
                </Label>
                <Input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="bg-zinc-950 border-zinc-800 text-zinc-100 focus-visible:ring-[#f59e0b] [color-scheme:dark]"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label className="text-xs uppercase tracking-wider text-zinc-400">
                  {t('workerProfile.certifications.credentialId')}
                </Label>
                <Input
                  value={credentialId}
                  onChange={(e) => setCredentialId(e.target.value)}
                  placeholder={t('workerProfile.certifications.credentialIdPlaceholder')}
                  className="bg-zinc-950 border-zinc-800 text-zinc-100 focus-visible:ring-[#f59e0b] [color-scheme:dark]"
                />
              </div>
            </div>

            {/* File Upload - uses label[htmlFor] pattern for reliable mobile file picker */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400">
                {t('workerProfile.certifications.file')}
              </Label>
              {storagePath ? (
                <div className="flex items-center justify-between border border-zinc-800 bg-zinc-950 p-3">
                  <div className="flex items-center gap-2 text-sm text-zinc-300">
                    <FileText className="h-4 w-4 text-[#f59e0b]" />
                    <span className="truncate max-w-[200px]">{fileName}</span>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!editing) {
                        // Add mode: clean up the uploaded object before it is attached to a DB row.
                        if (storageBucket && storagePath) {
                          await deleteStorageObject(storageBucket, storagePath);
                        }
                      }
                      // PB-DOCUMENT-INTAKE-001 — the detached upload never
                      // reached its canonical write: close the machine.
                      pendingConfirmRef.current?.failCanonical();
                      pendingConfirmRef.current = null;
                      // Edit mode: just clear state; the old object is deleted on save if confirmed.
                      setFileUrl(null);
                      setStorageBucket(null);
                      setStoragePath(null);
                      setFileName('');
                    }}
                    className="text-xs uppercase tracking-wider text-zinc-500 hover:text-red-400"
                  >
                    {t('common.remove')}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <button
                    type="button"
                    aria-controls="cert-file-upload-input"
                    aria-disabled={uploading}
                    onClick={openCertificateFilePicker}
                    className={`flex w-full cursor-pointer items-center justify-center gap-2 border border-dashed border-zinc-800 bg-zinc-950 px-3 py-6 text-xs uppercase tracking-[0.15em] text-zinc-400 hover:border-[#f59e0b] hover:text-[#f59e0b] ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
                  >
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    <span data-testid="cert-upload-button-label">
                      {uploading
                        ? `${t('common.loading')} ${uploadUi?.percent ?? 0}%`
                        : t('workerProfile.certifications.uploadFile')}
                    </span>
                  </button>
                  {uploading && uploadUi && (
                    <div className="w-full space-y-1" data-testid="cert-upload-status">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                        <div
                          data-testid="cert-upload-progress-bar"
                          className="h-full rounded-full bg-[#f59e0b] transition-all duration-300 ease-out"
                          style={{ width: `${uploadUi.percent}%` }}
                        />
                      </div>
                      <p className="text-center text-[11px] text-zinc-500" data-testid="cert-upload-status-line">
                        {uploadUi.state === 'VERIFYING'
                          ? t('common.upload.verifying')
                          : uploadUi.state === 'RETRYING'
                            ? `${uploadUi.percent}% ${t('common.upload.retrying')}`
                            : `${uploadUi.percent}% ${t('workerProfile.certifications.uploading') || 'uploading...'}`}
                        {uploadUi.state !== 'VERIFYING' && (
                          <span className="ml-1 text-zinc-600">
                            ({Math.floor(uploadUi.elapsedMs / 1000)}
                            s)
                          </span>
                        )}
                        {uploadUi.state !== 'VERIFYING' && uploadUi.bytesTotal > 0 && (
                          <span className="ml-1 text-zinc-600">
                            {formatBytes(uploadUi.bytesUploaded)} / {formatBytes(uploadUi.bytesTotal)}
                          </span>
                        )}
                      </p>
                      {/* PB-DOCUMENT-INTAKE-001 — "Preparando el archivo…" while
                          the browser has not produced the first byte. */}
                      {uploadUi.preparingFile && uploadUi.state !== 'VERIFYING' && (
                        <p className="text-center text-[11px] text-zinc-400" data-testid="cert-upload-preparing">
                          {t('common.upload.preparingFile')}
                        </p>
                      )}
                      {/* Slow hint only after 30s of real accumulated time. */}
                      {uploadUi.slowConnection && uploadUi.state !== 'VERIFYING' && (
                        <p className="text-center text-[11px] text-amber-500/90">
                          {t('workerProfile.certifications.uploadSlowHint')}
                        </p>
                      )}
                      {/* User can always cancel; the form stays intact. */}
                      <button
                        type="button"
                        onClick={cancelUpload}
                        className="mx-auto block text-[11px] uppercase tracking-wider text-zinc-500 hover:text-red-400"
                        data-testid="cert-upload-cancel"
                      >
                        {t('common.upload.cancel')}
                      </button>
                    </div>
                  )}
                  {uploadError && !uploading && (
                    <p className="text-center text-[11px] text-red-400" role="alert" data-testid="cert-upload-error">
                      {uploadError} {t('workerProfile.certifications.uploadRetryHint')}
                    </p>
                  )}
                </div>
              )}
              <p className="text-[11px] text-zinc-600">
                {t('workerProfile.certifications.fileHint')}
              </p>
              {/* PB-DOCUMENT-INTAKE-001 — Entrega B: canal alternativo por
                  correo (visible solo con VITE_DOCUMENT_EMAIL_INTAKE=true). */}
              <EmailIntakeEntry documentType="certificate" testId="cert" />
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400">
                {t('workerProfile.certifications.notes')}
              </Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder={t('workerProfile.certifications.notesPlaceholder')}
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
                {t('workerProfile.visibleToCompanies')}
              </Label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
                className="text-zinc-400 hover:text-zinc-200"
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={saving || uploading}
                className="bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold"
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {saving
                  ? t('common.saving')
                  : editing
                    ? t('common.update')
                    : t('common.create')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent className="border-zinc-800 bg-[#0d0d0d]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-100">
              {t('workerProfile.certifications.confirmDelete')}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              {t('workerProfile.certifications.confirmDeleteDesc', {
                name: deleteTarget?.certification_name,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deleting}
              className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
            >
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
