import { Users, UserCheck, FileSearch, Rocket } from 'lucide-react';
import type { CoverageData } from '@/lib/workforce-pipeline';
import { getCoveragePercentage } from '@/lib/workforce-pipeline';

interface CoverageCardProps {
  coverage: CoverageData;
  compact?: boolean;
}

export function CoverageCard({ coverage, compact = false }: CoverageCardProps) {
  const percentage = getCoveragePercentage(coverage);
  const total = coverage.assigned_workers + coverage.pending_validation_workers + coverage.ready_to_deploy_workers;

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <div className="w-14 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${percentage}%`,
                backgroundColor: percentage >= 100 ? '#10b981' : percentage >= 50 ? '#f59e0b' : '#ef4444',
              }}
            />
          </div>
          <span className={`text-[10px] font-semibold ${percentage >= 100 ? 'text-emerald-400' : percentage >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
            {total}/{coverage.requested_workers}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-zinc-800 rounded-sm p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium">Workforce Coverage</p>
        <span className={`text-lg font-bold ${percentage >= 100 ? 'text-emerald-400' : percentage >= 50 ? 'text-[#f59e0b]' : 'text-red-400'}`}>
          {percentage}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-3 bg-zinc-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full flex overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: `${(coverage.ready_to_deploy_workers / coverage.requested_workers) * 100}%` }}
          />
          <div
            className="h-full bg-amber-500 transition-all"
            style={{ width: `${(coverage.pending_validation_workers / coverage.requested_workers) * 100}%` }}
          />
          <div
            className="h-full bg-blue-500 transition-all"
            style={{ width: `${(coverage.assigned_workers / coverage.requested_workers) * 100}%` }}
          />
        </div>
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-2 gap-2">
        <CoverageItem
          icon={Users}
          label="Requested"
          value={coverage.requested_workers}
          color="text-zinc-300"
        />
        <CoverageItem
          icon={UserCheck}
          label="Assigned"
          value={coverage.assigned_workers}
          color="text-blue-400"
        />
        <CoverageItem
          icon={FileSearch}
          label="Pending Validation"
          value={coverage.pending_validation_workers}
          color="text-amber-400"
        />
        <CoverageItem
          icon={Rocket}
          label="Ready to Deploy"
          value={coverage.ready_to_deploy_workers}
          color="text-emerald-400"
        />
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 pt-1">
        <span className="flex items-center gap-1 text-[9px] text-zinc-500">
          <span className="w-2 h-2 rounded-full bg-emerald-500" /> Ready
        </span>
        <span className="flex items-center gap-1 text-[9px] text-zinc-500">
          <span className="w-2 h-2 rounded-full bg-amber-500" /> Validating
        </span>
        <span className="flex items-center gap-1 text-[9px] text-zinc-500">
          <span className="w-2 h-2 rounded-full bg-blue-500" /> Assigned
        </span>
      </div>
    </div>
  );
}

function CoverageItem({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 border border-zinc-800/60 rounded-sm bg-zinc-950/30">
      <Icon className={`h-3.5 w-3.5 ${color}`} />
      <div>
        <p className="text-[9px] text-zinc-500">{label}</p>
        <p className={`text-sm font-bold ${color}`}>{value}</p>
      </div>
    </div>
  );
}