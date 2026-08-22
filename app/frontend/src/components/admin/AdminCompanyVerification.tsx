import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase, TABLES } from '@/lib/supabase';
import { logAuditEvent } from '@/components/admin/AdminAuditLog';
import { toast } from 'sonner';
import {
  Building2,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  RefreshCw,
  Loader2,
  Ban,
  Globe,
} from 'lucide-react';

type CompanyStatus = 'pending' | 'verified' | 'rejected' | 'suspended';

interface CompanyRow {
  user_id: string;
  full_name: string | null;
  company: string | null;
  company_industry: string | null;
  company_country: string | null;
  company_website: string | null;
  company_description: string | null;
  company_verified: boolean | null;
  company_status: CompanyStatus | null;
  email?: string | null;
  created_at: string | null;
  avatar_url: string | null;
}

const STATUS_CONFIG: Record<CompanyStatus, { label: string; color: string; icon: React.ElementType }> = {
  pending: { label: 'Pending', color: 'bg-amber-950/50 border-amber-800/30 text-amber-300', icon: Clock },
  verified: { label: 'Verified', color: 'bg-emerald-950/50 border-emerald-800/30 text-emerald-300', icon: CheckCircle2 },
  rejected: { label: 'Rejected', color: 'bg-red-950/50 border-red-800/30 text-red-300', icon: XCircle },
  suspended: { label: 'Suspended', color: 'bg-orange-950/50 border-orange-800/30 text-orange-300', icon: Ban },
};

// PD-COMPANY / PB-DRIFT-001: This admin panel manages company_verified /
// company_status columns that do NOT exist yet in TABLES.profiles.
// See brain/03-ENGINEERING/COMPANY-VERIFICATION-SCHEMA.md. Until that schema
// is deployed, reads/writes below will fail gracefully (Supabase returns an
// error, handled below) and the panel will show no companies / a toast error.
export function AdminCompanyVerification() {
  const { t } = useTranslation();
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | CompanyStatus>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from(TABLES.profiles)
        .select('user_id, full_name, company, company_industry, company_country, company_website, company_description, company_verified, company_status, created_at, avatar_url')
        .or('role.eq.company,account_type.eq.company')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[AdminCompanyVerification] Fetch error:', error);
        toast.error(t('adminCompanyVerification.fetchError', 'Failed to load companies'));
        setCompanies([]);
      } else {
        setCompanies((data as CompanyRow[]) || []);
      }
    } catch (err) {
      console.error('[AdminCompanyVerification] Unexpected error:', err);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const updateCompanyStatus = async (userId: string, newStatus: CompanyStatus) => {
    setActionLoading(userId);
    const isVerified = newStatus === 'verified';

    const { error } = await supabase
      .from(TABLES.profiles)
      .update({
        company_verified: isVerified,
        company_status: newStatus,
      })
      .eq('user_id', userId);

    if (error) {
      console.error('[AdminCompanyVerification] Update error:', error);
      toast.error(t('adminCompanyVerification.updateError', 'Failed to update status'));
    } else {
      toast.success(
        t('adminCompanyVerification.statusUpdated', 'Company status updated to {{status}}', { status: newStatus })
      );
      logAuditEvent({
        actionType: 'company_verification',
        targetType: 'user',
        targetId: userId,
        details: `Company status changed to ${newStatus}`,
      });
      // Update local state
      setCompanies((prev) =>
        prev.map((c) =>
          c.user_id === userId
            ? { ...c, company_verified: isVerified, company_status: newStatus }
            : c
        )
      );
    }
    setActionLoading(null);
  };

  // Filter companies
  const filtered = companies.filter((c) => {
    // Status filter
    const currentStatus = c.company_status || 'pending';
    if (statusFilter !== 'all' && currentStatus !== statusFilter) return false;

    // Search filter
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.full_name?.toLowerCase().includes(q) ||
      c.company?.toLowerCase().includes(q) ||
      c.company_industry?.toLowerCase().includes(q) ||
      c.company_country?.toLowerCase().includes(q)
    );
  });

  // Stats
  const stats = {
    total: companies.length,
    pending: companies.filter((c) => !c.company_status || c.company_status === 'pending').length,
    verified: companies.filter((c) => c.company_status === 'verified').length,
    rejected: companies.filter((c) => c.company_status === 'rejected').length,
    suspended: companies.filter((c) => c.company_status === 'suspended').length,
  };

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label={t('adminCompanyVerification.total', 'Total')} value={stats.total} color="text-zinc-100" />
        <StatCard label={t('adminCompanyVerification.pending', 'Pending')} value={stats.pending} color="text-amber-400" />
        <StatCard label={t('adminCompanyVerification.verified', 'Verified')} value={stats.verified} color="text-emerald-400" />
        <StatCard label={t('adminCompanyVerification.rejected', 'Rejected')} value={stats.rejected} color="text-red-400" />
        <StatCard label={t('adminCompanyVerification.suspended', 'Suspended')} value={stats.suspended} color="text-orange-400" />
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex items-center gap-2 flex-1 border border-zinc-800 rounded-sm bg-zinc-950 px-3 py-2">
          <Search className="h-4 w-4 text-zinc-500" />
          <input
            placeholder={t('adminCompanyVerification.searchPlaceholder', 'Search by company name, contact, industry...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-600"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | CompanyStatus)}
            className="rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-300 outline-none"
          >
            <option value="all">{t('adminCompanyVerification.allStatuses', 'All Statuses')}</option>
            <option value="pending">{t('adminCompanyVerification.pending', 'Pending')}</option>
            <option value="verified">{t('adminCompanyVerification.verified', 'Verified')}</option>
            <option value="rejected">{t('adminCompanyVerification.rejected', 'Rejected')}</option>
            <option value="suspended">{t('adminCompanyVerification.suspended', 'Suspended')}</option>
          </select>
          <button
            onClick={fetchCompanies}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-sm border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 transition disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            {t('adminCompanyVerification.refresh', 'Refresh')}
          </button>
        </div>
      </div>

      {/* Companies List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 text-[#f59e0b] animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-12 text-center">
          <Building2 className="h-10 w-10 text-zinc-700 mx-auto mb-3" />
          <p className="text-sm text-zinc-400">
            {t('adminCompanyVerification.noCompanies', 'No companies found')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((company) => (
            <CompanyCard
              key={company.user_id}
              company={company}
              onUpdateStatus={updateCompanyStatus}
              actionLoading={actionLoading}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CompanyCard({
  company,
  onUpdateStatus,
  actionLoading,
  t,
}: {
  company: CompanyRow;
  onUpdateStatus: (userId: string, status: CompanyStatus) => void;
  actionLoading: string | null;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  const status = company.company_status || 'pending';
  const config = STATUS_CONFIG[status];
  const StatusIcon = config.icon;
  const isLoading = actionLoading === company.user_id;

  return (
    <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        {/* Company Info */}
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="h-10 w-10 rounded-sm bg-zinc-800 flex items-center justify-center text-zinc-400 shrink-0 overflow-hidden">
            {company.avatar_url ? (
              <img src={company.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <Building2 className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-semibold text-zinc-100 truncate">
              {company.company || company.full_name || t('adminCompanyVerification.unnamed', 'Unnamed Company')}
            </h4>
            <p className="text-xs text-zinc-400 truncate">
              {company.full_name && company.company ? company.full_name : ''}
              {company.company_industry ? ` · ${company.company_industry}` : ''}
            </p>
            <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[11px] text-zinc-500">
              {company.company_country && (
                <span className="flex items-center gap-1">
                  <Globe className="h-3 w-3" />
                  {company.company_country}
                </span>
              )}
              {company.company_website && (
                <a
                  href={company.company_website.startsWith('http') ? company.company_website : `https://${company.company_website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[#f59e0b] hover:underline"
                >
                  <Globe className="h-3 w-3" />
                  {t('adminCompanyVerification.website', 'Website')}
                </a>
              )}
              {company.created_at && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(company.created_at).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Status Badge */}
        <div className={`inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-[11px] font-medium ${config.color}`}>
          <StatusIcon className="h-3 w-3" />
          {t(`adminCompanyVerification.status_${status}`, config.label)}
        </div>
      </div>

      {/* Description */}
      {company.company_description && (
        <p className="text-xs text-zinc-400 line-clamp-2 border-t border-zinc-800/60 pt-3">
          {company.company_description}
        </p>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 border-t border-zinc-800/60 pt-3">
        {status !== 'verified' && (
          <button
            onClick={() => onUpdateStatus(company.user_id, 'verified')}
            disabled={isLoading}
            className="flex items-center gap-1.5 rounded-sm bg-emerald-950/50 border border-emerald-800/30 px-3 py-1.5 text-[11px] font-medium text-emerald-300 hover:bg-emerald-900/50 transition disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
            {t('adminCompanyVerification.approve', 'Approve')}
          </button>
        )}
        {status !== 'rejected' && status !== 'verified' && (
          <button
            onClick={() => onUpdateStatus(company.user_id, 'rejected')}
            disabled={isLoading}
            className="flex items-center gap-1.5 rounded-sm bg-red-950/50 border border-red-800/30 px-3 py-1.5 text-[11px] font-medium text-red-300 hover:bg-red-900/50 transition disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
            {t('adminCompanyVerification.reject', 'Reject')}
          </button>
        )}
        {status === 'verified' && (
          <button
            onClick={() => onUpdateStatus(company.user_id, 'suspended')}
            disabled={isLoading}
            className="flex items-center gap-1.5 rounded-sm bg-orange-950/50 border border-orange-800/30 px-3 py-1.5 text-[11px] font-medium text-orange-300 hover:bg-orange-900/50 transition disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ban className="h-3 w-3" />}
            {t('adminCompanyVerification.suspend', 'Suspend')}
          </button>
        )}
        {(status === 'rejected' || status === 'suspended') && (
          <button
            onClick={() => onUpdateStatus(company.user_id, 'pending')}
            disabled={isLoading}
            className="flex items-center gap-1.5 rounded-sm bg-zinc-800/50 border border-zinc-700/30 px-3 py-1.5 text-[11px] font-medium text-zinc-300 hover:bg-zinc-700/50 transition disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Clock className="h-3 w-3" />}
            {t('adminCompanyVerification.resetToPending', 'Reset to Pending')}
          </button>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-4">
      <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}

export default AdminCompanyVerification;
