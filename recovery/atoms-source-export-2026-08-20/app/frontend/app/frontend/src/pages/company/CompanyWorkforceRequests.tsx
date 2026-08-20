import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { supabase, TABLES } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { isPrimaryAdmin } from '@/lib/admin';
import {
  HardHat,
  Plus,
  MapPin,
  Users,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';

interface WorkforceRequest {
  id: string;
  company_name: string;
  workers_needed: string;
  country: string;
  status: string;
  created_at: string;
  trade?: string;
  project_name?: string;
}

export default function CompanyWorkforceRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<WorkforceRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      setLoading(true);
      // TD-06: scope to the current company's leads only.
      // The primary admin sees all leads (no filter).
      // Company users see only leads matching their email (the contact email
      // used when submitting the workforce request via RequestWorkers.tsx).
      // NOTE: the proper fix (DEC-37 follow-up) is to add a `posted_by` column
      // referencing auth.users.id and filter by it. Until that migration lands,
      // email-based scoping closes the data-leakage gap.
      let query = supabase
        .from(TABLES.companyLeads)
        .select('*');

      if (!isPrimaryAdmin(user.email)) {
        query = query.eq('email', user.email);
      }

      const { data } = await query.order('created_at', { ascending: false });
      setRequests((data || []) as WorkforceRequest[]);
      setLoading(false);
    })();
  }, [user]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Company"
        title="Workforce Requests"
        description="Manage your submitted workforce requests and track their status."
        actions={
          <Link
            to="/companies/request-workers"
            className="inline-flex items-center gap-2 rounded-sm bg-[#f59e0b] px-4 py-2 text-sm font-semibold text-black hover:bg-[#d97706] transition"
          >
            <Plus className="h-4 w-4" />
            New Request
          </Link>
        }
      />

      {/* Summary Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Total Requests" value={requests.length} icon={HardHat} />
        <StatCard label="Pending" value={requests.filter((r) => r.status === 'new' || r.status === 'pending' || !r.status).length} icon={Clock} />
        <StatCard label="In Progress" value={requests.filter((r) => r.status === 'in_progress' || r.status === 'contacted').length} icon={Loader2} />
        <StatCard label="Fulfilled" value={requests.filter((r) => r.status === 'fulfilled' || r.status === 'completed').length} icon={CheckCircle2} />
      </div>

      {/* Requests List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#f59e0b] border-t-transparent" />
        </div>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-zinc-800/80 bg-[#0d0d0d] rounded-sm">
          <HardHat className="h-10 w-10 text-zinc-700 mb-3" />
          <p className="text-sm text-zinc-400">No workforce requests submitted yet.</p>
          <Link
            to="/companies/request-workers"
            className="mt-4 inline-flex items-center gap-2 text-sm text-[#f59e0b] hover:underline"
          >
            <Plus className="h-3.5 w-3.5" />
            Submit your first request
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <div
              key={req.id}
              className="flex items-center gap-4 border border-zinc-800/80 bg-[#0d0d0d] p-4 rounded-sm hover:border-zinc-700 transition"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-amber-500/10 border border-amber-500/20 shrink-0">
                <HardHat className="h-4.5 w-4.5 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-200">
                  {req.workers_needed || '?'} workers needed
                  {req.trade ? ` — ${req.trade}` : ''}
                </p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                    <MapPin className="h-3 w-3" />
                    {req.country || 'International'}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                    <Clock className="h-3 w-3" />
                    {new Date(req.created_at).toLocaleDateString()}
                  </span>
                  {req.company_name && (
                    <span className="text-[10px] text-zinc-600">{req.company_name}</span>
                  )}
                </div>
              </div>
              <RequestStatusBadge status={req.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) {
  return (
    <div className="border border-zinc-800/80 bg-[#0d0d0d] p-4 rounded-sm">
      <div className="flex items-center justify-between">
        <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-500">{label}</p>
        <Icon className="h-3.5 w-3.5 text-zinc-600" />
      </div>
      <p className="mt-2 text-xl font-bold text-zinc-200">{value}</p>
    </div>
  );
}

function RequestStatusBadge({ status }: { status: string }) {
  const isNew = !status || status === 'new' || status === 'pending';
  const isProgress = status === 'in_progress' || status === 'contacted';
  const isDone = status === 'fulfilled' || status === 'completed';

  if (isDone) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm border text-[9px] font-semibold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
        <CheckCircle2 className="h-3 w-3" />
        Fulfilled
      </span>
    );
  }
  if (isProgress) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm border text-[9px] font-semibold uppercase tracking-wider bg-blue-500/10 text-blue-400 border-blue-500/30">
        <Loader2 className="h-3 w-3" />
        In Progress
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm border text-[9px] font-semibold uppercase tracking-wider bg-amber-500/10 text-amber-400 border-amber-500/30">
      <AlertCircle className="h-3 w-3" />
      Pending
    </span>
  );
}