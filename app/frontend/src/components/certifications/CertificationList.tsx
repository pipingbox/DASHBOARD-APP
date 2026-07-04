import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  Shield,
  ShieldCheck,
  ExternalLink,
  FileText,
  Pencil,
  Trash2,
  AlertTriangle,
  RefreshCw,
  Clock,
  ShieldAlert,
} from 'lucide-react';
import { supabase, TABLES } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import {
  type Certification,
  getExpiryInfo,
  type ExpiryStatus,
} from '@/lib/certifications';
import { CertificationDialog } from './CertificationDialog';
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

function ExpiryStatusBadge({ status, label }: { status: ExpiryStatus; label: string }) {
  const baseClasses =
    'inline-flex items-center gap-1 border px-2 py-0.5 text-[10px] uppercase tracking-[0.15em]';

  const statusClasses: Record<ExpiryStatus, string> = {
    valid: 'border-emerald-600/40 bg-emerald-600/10 text-emerald-300',
    expiring_soon: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
    critical: 'border-orange-500/40 bg-orange-500/10 text-orange-300',
    expired: 'border-red-600/40 bg-red-600/10 text-red-300',
  };

  const icons: Record<ExpiryStatus, React.ReactNode> = {
    valid: <ShieldCheck className="h-3 w-3" />,
    expiring_soon: <Clock className="h-3 w-3" />,
    critical: <ShieldAlert className="h-3 w-3" />,
    expired: <AlertTriangle className="h-3 w-3" />,
  };

  return (
    <span className={`${baseClasses} ${statusClasses[status]}`}>
      {icons[status]}
      {label}
    </span>
  );
}

export function CertificationList() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [items, setItems] = useState<Certification[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Certification | null>(null);
  const [renewMode, setRenewMode] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Certification | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from(TABLES.certifications)
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) {
      toast.error(error.message);
    } else {
      // TD-09: normalize unified table columns to Certification interface
      const normalized = ((data as Record<string, unknown>[]) ?? []).map((row) => ({
        ...row,
        name: row.certification_name ?? row.name ?? '',
        issuer: row.issuing_organization ?? row.issuer ?? '',
        file_url: row.certificate_file_url ?? row.file_url ?? null,
        expiry_date: row.expiration_date ?? row.expiry_date ?? null,
      })) as Certification[];
      setItems(normalized);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleEdit = (cert: Certification) => {
    setEditing(cert);
    setRenewMode(false);
    setDialogOpen(true);
  };

  const handleRenew = (cert: Certification) => {
    setEditing(cert);
    setRenewMode(true);
    setDialogOpen(true);
  };

  const handleAdd = () => {
    setEditing(null);
    setRenewMode(false);
    setDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase
      .from(TABLES.certifications)
      .delete()
      .eq('id', deleteTarget.id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(t('certActions.deleteSuccess'));
      load();
    }
    setDeleteTarget(null);
  };

  return (
    <section className="border border-zinc-800/80 bg-[#0d0d0d] p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-[#f59e0b]">
            {t('certActions.sectionLabel')}
          </p>
          <h2 className="mt-1 text-xl font-semibold">{t('certActions.sectionTitle')}</h2>
          <p className="mt-1 text-sm text-zinc-500">
            {t('certActions.sectionDescription')}
          </p>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          className="inline-flex items-center gap-2 bg-[#f59e0b] px-3 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-black hover:bg-[#d97706]"
        >
          <Plus className="h-3.5 w-3.5" />
          {t('certActions.addCertification')}
        </button>
      </div>

      <div className="mt-6 space-y-3">
        {loading ? (
          <p className="text-sm text-zinc-500">{t('common.loading')}</p>
        ) : items.length === 0 ? (
          <div className="border border-dashed border-zinc-800 bg-zinc-950 p-8 text-center">
            <Shield className="mx-auto h-8 w-8 text-zinc-600" />
            <p className="mt-3 text-sm text-zinc-400">{t('certActions.noCerts')}</p>
            <p className="mt-1 text-xs text-zinc-600">
              {t('certActions.noCertsHint')}
            </p>
          </div>
        ) : (
          items.map((cert) => {
            const expiryInfo = getExpiryInfo(cert);
            return (
              <div
                key={cert.id}
                className="border border-zinc-800 bg-zinc-950 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-zinc-100">
                        {cert.name}
                      </h3>
                      <ExpiryStatusBadge
                        status={expiryInfo.status}
                        label={t(`certStatus.${expiryInfo.status}`)}
                      />
                    </div>
                    <p className="mt-1 text-sm text-zinc-400">{cert.issuer}</p>
                    <div className="mt-2 flex flex-wrap gap-4 text-xs text-zinc-500">
                      {cert.credential_id && <span>ID: {cert.credential_id}</span>}
                      {cert.issue_date && (
                        <span>
                          {t('certActions.issued')}:{' '}
                          {new Date(cert.issue_date).toLocaleDateString()}
                        </span>
                      )}
                      {cert.expiry_date && (
                        <span
                          className={
                            expiryInfo.status === 'expired'
                              ? 'text-red-400'
                              : expiryInfo.status === 'critical'
                                ? 'text-orange-400'
                                : expiryInfo.status === 'expiring_soon'
                                  ? 'text-amber-400'
                                  : ''
                          }
                        >
                          {expiryInfo.status === 'expired'
                            ? t('certActions.expired')
                            : t('certActions.expires')}
                          : {new Date(cert.expiry_date).toLocaleDateString()}
                          {expiryInfo.daysRemaining !== null &&
                            expiryInfo.daysRemaining > 0 && (
                              <span className="ml-1">
                                ({expiryInfo.daysRemaining} {t('certAlerts.days')})
                              </span>
                            )}
                        </span>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {cert.file_url && (
                        <a
                          href={cert.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-[11px] uppercase tracking-[0.15em] text-zinc-300 hover:border-[#f59e0b] hover:text-[#f59e0b]"
                        >
                          <FileText className="h-3 w-3" />
                          {t('certActions.viewCertificate')}
                        </a>
                      )}
                      {cert.verification_url && (
                        <a
                          href={cert.verification_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 border border-[#f59e0b]/40 bg-[#f59e0b]/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.15em] text-[#f59e0b] hover:bg-[#f59e0b]/20"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {t('certActions.verify')}
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    {cert.qr_code_url && (
                      <img
                        src={cert.qr_code_url}
                        alt="QR"
                        className="h-16 w-16 border border-zinc-800 bg-white p-1"
                      />
                    )}
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => handleEdit(cert)}
                        title={t('common.edit')}
                        className="inline-flex items-center gap-1 border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRenew(cert)}
                        title={t('certActions.renew')}
                        className="inline-flex items-center gap-1 border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-400 hover:border-emerald-600/60 hover:text-emerald-400"
                      >
                        <RefreshCw className="h-3 w-3" />
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
              </div>
            );
          })
        )}
      </div>

      <CertificationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        renewMode={renewMode}
        onSaved={load}
      />

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent className="border-zinc-800 bg-[#0d0d0d]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-100">
              {t('certActions.confirmDeleteTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              {t('certActions.confirmDeleteDescription', {
                name: deleteTarget?.name,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100">
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}