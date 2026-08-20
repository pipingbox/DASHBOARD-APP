import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, TABLES } from '@/lib/supabase';
import { HardHat, ArrowRight, Rocket, Users, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PipelineTimeline } from './PipelineTimeline';
import { WorkforcePriorityBadge } from './WorkforcePriorityBadge';
import { getStageFromStatus } from '@/lib/workforce-pipeline';

interface RequestSummary {
  id: string;
  worker_type: string;
  workers_requested: number;
  workers_assigned: number;
  coverage_percentage: number;
  priority: string;
  status: string;
  created_at: string;
}

export function WorkforceCoverageWidget() {
  const { t } = useTranslation();
  const [requests, setRequests] = useState<RequestSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from(TABLES.workforceRequests)
          .select('id, worker_type, workers_requested, workers_assigned, coverage_percentage, priority, status, created_at')
          .not('status', 'in', '("completed","archived")')
          .order('created_at', { ascending: false })
          .limit(3);

        if (error) {
          console.error('[WorkforceCoverageWidget] Fetch error:', error);
        }
        // Normalize - ensure numeric fields default to 0
        const normalized = (data || []).map((row: Record<string, unknown>) => ({
          ...row,
          workers_requested: (row.workers_requested as number) ?? 1,
          workers_assigned: (row.workers_assigned as number) ?? 0,
          coverage_percentage: (row.coverage_percentage as number) ?? 0,
          priority: (row.priority as string) || 'normal',
          status: (row.status as string) || 'new',
        })) as RequestSummary[];
        setRequests(normalized);
      } catch (err) {
        console.error('[WorkforceCoverageWidget] Unexpected error:', err);
      }
      setLoading(false);
    })();
  }, []);

  const totalRequested = requests.reduce((sum, r) => sum + r.workers_requested, 0);
  const totalAssigned = requests.reduce((sum, r) => sum + r.workers_assigned, 0);
  const overallCoverage = totalRequested > 0 ? Math.round((totalAssigned / totalRequested) * 100) : 0;

  return (
    <div className="border border-zinc-800/80 bg-[#0d0d0d] p-5 rounded-sm space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-medium">
          {t('companyDashboard.workforceCoverage', 'Workforce Coverage')}
        </p>
        <Link to="/companies/workforce" className="text-[10px] text-[#f59e0b] hover:underline flex items-center gap-1">
          {t('companyDashboard.viewAll', 'View All')}
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Overall Coverage */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-900 border border-zinc-800">
          <Rocket className="h-4 w-4 text-[#f59e0b]" />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-zinc-400">
              {totalAssigned}/{totalRequested} {t('companyDashboard.workersAssigned', 'workers assigned')}
            </span>
            <span className={`text-sm font-bold ${overallCoverage >= 80 ? 'text-emerald-400' : overallCoverage >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
              {overallCoverage}%
            </span>
          </div>
          <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${overallCoverage}%`,
                backgroundColor: overallCoverage >= 80 ? '#10b981' : overallCoverage >= 50 ? '#f59e0b' : '#ef4444',
              }}
            />
          </div>
        </div>
      </div>

      {/* Active Requests */}
      {loading ? (
        <div className="flex items-center justify-center py-4">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#f59e0b] border-t-transparent" />
        </div>
      ) : requests.length === 0 ? (
        <p className="text-xs text-zinc-500 text-center py-3">
          {t('companyDashboard.noActiveRequests', 'No active workforce requests')}
        </p>
      ) : (
        <div className="space-y-2.5">
          {requests.map((req) => (
            <div key={req.id} className="border border-zinc-800/60 bg-zinc-950/50 p-3 rounded-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <HardHat className="h-3.5 w-3.5 text-zinc-500" />
                  <span className="text-xs font-medium text-zinc-200 truncate max-w-[140px]">{req.worker_type}</span>
                </div>
                <WorkforcePriorityBadge priority={req.priority} showIcon={false} />
              </div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] text-zinc-500 flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {req.workers_assigned}/{req.workers_requested}
                </span>
                <span className="text-[10px] text-zinc-500 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(req.created_at).toLocaleDateString()}
                </span>
              </div>
              <PipelineTimeline currentStage={getStageFromStatus(req.status)} compact />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}