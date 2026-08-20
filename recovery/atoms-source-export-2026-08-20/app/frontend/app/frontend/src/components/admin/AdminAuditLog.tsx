import { useEffect, useState, useCallback } from 'react';
import { supabase, TABLES } from '@/lib/supabase';
import {
  Shield,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  FileText,
} from 'lucide-react';

/* ─── Types ─── */
interface AuditEntry {
  id: string;
  created_at: string;
  actor_email: string;
  action_type: string;
  target_type: string;
  target_id: string | null;
  details: string | null;
}

const ACTION_TYPES = [
  { value: 'role_change', label: 'Role Change', color: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
  { value: 'lead_status_change', label: 'Lead Status', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  { value: 'content_approval', label: 'Content Approved', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  { value: 'content_rejection', label: 'Content Rejected', color: 'bg-red-500/10 text-red-400 border-red-500/30' },
  { value: 'notes_saved', label: 'Notes Saved', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  { value: 'application_withdrawn', label: 'App Withdrawn', color: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30' },
];

function getActionColor(actionType: string): string {
  const found = ACTION_TYPES.find((a) => a.value === actionType);
  return found?.color ?? 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30';
}

function getActionLabel(actionType: string): string {
  const found = ACTION_TYPES.find((a) => a.value === actionType);
  return found?.label ?? actionType.replace(/_/g, ' ');
}

const PAGE_SIZE = 15;

export function AdminAuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from(TABLES.auditLogs)
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (actionFilter !== 'all') {
        query = query.eq('action_type', actionFilter);
      }

      if (searchQuery) {
        query = query.or(
          `actor_email.ilike.%${searchQuery}%,details.ilike.%${searchQuery}%,target_type.ilike.%${searchQuery}%`
        );
      }

      const { data, error, count } = await query
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (error) {
        console.error('[AuditLog] Fetch error:', error);
        // Table might not exist yet - show empty state
        setEntries([]);
        setTotalCount(0);
      } else {
        setEntries((data || []) as AuditEntry[]);
        setTotalCount(count ?? 0);
      }
    } catch (err) {
      console.error('[AuditLog] Unexpected error:', err);
      setEntries([]);
      setTotalCount(0);
    }
    setLoading(false);
  }, [page, actionFilter, searchQuery]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Security & Compliance</p>
          <h3 className="text-lg font-semibold text-zinc-100 mt-1">Audit Log</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            {totalCount} total event{totalCount !== 1 ? 's' : ''} recorded.
          </p>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-[#f59e0b]/10">
          <Shield className="h-4 w-4 text-[#f59e0b]" />
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
            placeholder="Search by actor, details, or target..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[#f59e0b] focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-zinc-500" />
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(0); }}
            className="text-xs bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-2 text-zinc-300 focus:outline-none focus:border-[#f59e0b]"
          >
            <option value="all">All Actions</option>
            {ACTION_TYPES.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Audit Table */}
      <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#f59e0b] border-t-transparent" />
          </div>
        ) : entries.length === 0 ? (
          <div className="py-12 text-center">
            <Shield className="h-8 w-8 text-zinc-700 mx-auto mb-3" />
            <p className="text-sm text-zinc-500">No audit events recorded yet.</p>
            <p className="text-xs text-zinc-600 mt-1">Admin actions will appear here automatically.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950/50">
                  <th className="text-left py-3 px-3 text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
                    Timestamp
                  </th>
                  <th className="text-left py-3 px-3 text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
                    Actor
                  </th>
                  <th className="text-left py-3 px-3 text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
                    Action
                  </th>
                  <th className="text-left py-3 px-3 text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
                    Target
                  </th>
                  <th className="text-left py-3 px-3 text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-zinc-800/50 hover:bg-zinc-900/50 transition"
                  >
                    <td className="py-3 px-3">
                      <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                        <Clock className="h-3 w-3 text-zinc-600" />
                        {new Date(entry.created_at).toLocaleString()}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="flex items-center gap-1.5 text-xs text-zinc-300">
                        <User className="h-3 w-3 text-zinc-500" />
                        {entry.actor_email || '—'}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-sm border text-[10px] font-semibold uppercase tracking-wider ${getActionColor(entry.action_type)}`}
                      >
                        {getActionLabel(entry.action_type)}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                        <FileText className="h-3 w-3 text-zinc-600" />
                        {entry.target_type || '—'}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-xs text-zinc-500 truncate max-w-[200px] block">
                        {entry.details || '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-zinc-500">
            Page {page + 1} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-2 rounded-sm border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-2 rounded-sm border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Audit Logger Utility ─── */
export async function logAuditEvent(params: {
  actionType: string;
  targetType: string;
  targetId?: string;
  details?: string;
}) {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const email = sessionData?.session?.user?.email || 'unknown';

    await supabase.from(TABLES.auditLogs).insert({
      actor_email: email,
      action_type: params.actionType,
      target_type: params.targetType,
      target_id: params.targetId || null,
      details: params.details || null,
    });
  } catch (err) {
    console.error('[AuditLog] Failed to log event:', err);
  }
}