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
import { recalculateAndSaveProfileCompletion } from '@/lib/profileCompletion';
import { uploadWithTimeout } from '@/lib/uploadHelpers';
import { withQueryTimeout } from '@/lib/queryTimeout';

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
  const [fileUrl, setFileUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [notes, setNotes] = useState('');
  const [isVisible, setIsVisible] = useState(true);

  const load = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    console.log('[CertificationsSection] load - current user id:', user.id);
    setLoading(true);
    try {
      const { data, error } = await withQueryTimeout(
        supabase
          .from('app_worker_certifications')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
      );
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

  const resetForm = () => {
    setCertName('');
    setIssuingOrg('');
    setIssueDate('');
    setExpiryDate('');
    setCredentialId('');
    setFileUrl('');
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
    setFileUrl(cert.file_url ?? '');
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
    if (!user) return;
    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/heic', 'image/heif'];
    // Fallback: also check extension for mobile browsers that don't set MIME type
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const allowedExts = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'heic', 'heif'];
    if (!allowedTypes.includes(file.type) && !allowedExts.includes(ext)) {
      toast.error(t('workerProfile.certifications.invalidFileType'));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error(t('workerProfile.certifications.fileTooBig'));
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'pdf';
      const path = `${user.id}/cert-${Date.now()}.${ext}`;
      const bucketName = STORAGE_BUCKETS.workerDocuments;

      // Logging: bucket, file type, file size
      console.log('[CertificationsSection] File upload starting:', {
        bucket: bucketName,
        path,
        fileType: file.type,
        fileSize: file.size,
        fileName: file.name,
      });

      const { error } = await uploadWithTimeout(bucketName, path, file, { upsert: false, cacheControl: '3600' });

      if (error) {
        console.error('[CertificationsSection] Upload error:', { bucket: bucketName, path, error });
        toast.error(error.message);
        return;
      }

      console.log('[CertificationsSection] Upload success:', { bucket: bucketName, path });

      const { data } = supabase.storage
        .from(bucketName)
        .getPublicUrl(path);

      console.log('[CertificationsSection] Public URL:', data.publicUrl);
      setFileUrl(data.publicUrl);
      setFileName(file.name);
      toast.success(t('workerProfile.certifications.fileUploaded'));
    } catch (uploadErr) {
      console.error('[CertificationsSection] Upload unexpected error:', uploadErr);
      toast.error(t('common.unexpectedError'));
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!certName.trim() || !issuingOrg.trim()) {
      toast.error(t('workerProfile.certifications.nameOrgRequired'));
      return;
    }
    setSaving(true);
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
      };

      if (editing) {
        console.log('[CertificationsSection] UPDATE payload:', payload);
        const { error } = await supabase
          .from('app_worker_certifications')
          .update(payload)
          .eq('id', editing.id);
        if (error) {
          console.error('[CertificationsSection] update error:', error);
          toast.error(error.message);
          return;
        }
        // Optimistic update
        setItems((prev) =>
          prev.map((i) => (i.id === editing.id ? { ...i, ...payload } : i))
        );
        toast.success(t('workerProfile.certifications.updated'));
        await recalculateAndSaveProfileCompletion(user.id);

        // Sync reminders when expiration_date changes
        try {
          const result = await syncCertificationReminders(user.id, editing.id, payload.expiry_date as string | null);
          if (result.remindersCreated > 0) {
            toast.success(t('workerProfile.certifications.remindersScheduled', { count: result.remindersCreated }));
          } else if (!payload.expiry_date) {
            toast.info(t('workerProfile.certifications.noExpiryNoReminders'));
          }
        } catch (reminderErr) {
          console.error('[CertificationsSection] Reminder sync failed:', reminderErr);
          toast.error(t('workerProfile.certifications.reminderSyncFailed'));
        }
      } else {
        // Step 1: Get fresh authenticated user
        const { data: authData, error: authError } = await supabase.auth.getUser();

        // Step 2: Log authenticated user details
        console.log('[CertificationsSection] auth.getUser() result:', {
          user: authData?.user ?? null,
          userId: authData?.user?.id ?? null,
          authError: authError ?? null,
        });

        // Step 3: Abort if no user session
        if (authError || !authData?.user) {
          console.error('[CertificationsSection] No authenticated user session');
          toast.error('User session not found. Please sign in again.');
          return;
        }

        const authUserId = authData.user.id;

        // Step 4: Guard against null/undefined user_id
        if (!authUserId) {
          console.error('[CertificationsSection] user_id is null or undefined, aborting insert');
          toast.error('User session not found. Please sign in again.');
          return;
        }

        // Step 5: Build final insert payload with user_id
        const insertPayload = { ...payload, user_id: authUserId };

        // Step 6: Log final insert payload
        console.log('[CertificationsSection] Final INSERT payload:', JSON.stringify(insertPayload, null, 2));

        // Step 7: Insert into public.app_worker_certifications
        const { data, error } = await supabase
          .from('app_worker_certifications')
          .insert(insertPayload)
          .select()
          .single();

        // Step 8: Log full Supabase response
        console.log('[CertificationsSection] Supabase insert response data:', data);
        console.error('[CertificationsSection] Supabase insert response error:', error);

        if (error) {
          toast.error(error.message);
          return;
        }
        if (data) {
          setItems((prev) => [data as WorkerCertification, ...prev]);

          // Create reminders for new certification
          try {
            const result = await syncCertificationReminders(authUserId, (data as WorkerCertification).id, payload.expiry_date as string | null);
            if (result.remindersCreated > 0) {
              toast.success(t('workerProfile.certifications.remindersScheduled', { count: result.remindersCreated }));
            } else if (!payload.expiry_date) {
              toast.info(t('workerProfile.certifications.noExpiryNoReminders'));
            }
          } catch (reminderErr) {
            console.error('[CertificationsSection] Reminder sync failed:', reminderErr);
            toast.error(t('workerProfile.certifications.reminderSyncFailed'));
          }
        } else {
          await load();
        }
        toast.success(t('workerProfile.certifications.added'));
        await recalculateAndSaveProfileCompletion(user.id);
      }
      setDialogOpen(false);
    } catch (err) {
      console.error('[CertificationsSection] unexpected error:', err);
      toast.error(t('common.unexpectedError'));
    } finally {
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

      const { error } = await supabase
        .from(TABLES.workerCertifications)
        .delete()
        .eq('id', deleteTarget.id);
      if (error) {
        toast.error(error.message);
        setItems(previousItems);
      } else {
        toast.success(t('workerProfile.certifications.deleted'));
        await recalculateAndSaveProfileCompletion(user!.id);
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
            {t('common.loading')}
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
                    {cert.file_url && (
                      <a
                        href={cert.file_url}
                        target="_blank"
                        rel="noreferrer"
                        title={t('workerProfile.certifications.viewFile')}
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
              {savingPrefs ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : null}
              {savingPrefs ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </div>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!saving) setDialogOpen(open); }}>
        <DialogContent className="max-w-2xl border-zinc-800 bg-[#0d0d0d]">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? t('workerProfile.certifications.editTitle')
                : t('workerProfile.certifications.addTitle')}
            </DialogTitle>
          </DialogHeader>
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

            {/* File Upload */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400">
                {t('workerProfile.certifications.file')}
              </Label>
              {fileUrl ? (
                <div className="flex items-center justify-between border border-zinc-800 bg-zinc-950 p-3">
                  <div className="flex items-center gap-2 text-sm text-zinc-300">
                    <FileText className="h-4 w-4 text-[#f59e0b]" />
                    <span className="truncate max-w-[200px]">{fileName}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setFileUrl('');
                      setFileName('');
                    }}
                    className="text-xs uppercase tracking-wider text-zinc-500 hover:text-red-400"
                  >
                    {t('common.remove')}
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
                    ? t('common.loading')
                    : t('workerProfile.certifications.uploadFile')}
                </button>
              )}
              <p className="text-[11px] text-zinc-600">
                {t('workerProfile.certifications.fileHint')}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/jpg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                  e.target.value = '';
                }}
              />
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