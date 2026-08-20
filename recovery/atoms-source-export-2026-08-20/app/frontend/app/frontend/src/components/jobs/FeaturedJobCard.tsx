import {
  Building2,
  MapPin,
  Zap,
  AlertTriangle,
  Anchor,
  RefreshCw,
  Clock,
  CheckCircle2,
  Loader2,
  Banknote,
} from 'lucide-react';
import { URGENT_INDICES, ROTATIONS, isOffshore } from '@/data/job-constants';

// TD-10: Extracted from Jobs.tsx to reduce monolith size (1517 → ~1400 lines).
// This is the FeaturedJobCard carousel card component.

interface Job {
  id: string;
  title: string;
  company: string;
  location: string | null;
  salary_min: number | null;
  salary_max: number | null;
  currency: string;
  job_type: string;
  description: string | null;
  posted_at: string;
  category: string;
}

interface FeaturedJobCardProps {
  job: Job;
  idx: number;
  onApply: () => void;
  applied: boolean;
  applying: boolean;
}

export function FeaturedJobCard({ job, idx, onApply, applied, applying }: FeaturedJobCardProps) {
  const offshore = isOffshore(idx);
  const rotation = ROTATIONS[idx];
  const urgent = URGENT_INDICES.includes(idx);

  const formatSalary = () => {
    if (!job.salary_min && !job.salary_max) return null;
    const min = job.salary_min ?? 0;
    const max = job.salary_max ?? 0;
    if (min >= 10000) {
      return `${job.currency}${(min / 1000).toFixed(0)}k–${(max / 1000).toFixed(0)}k /yr`;
    }
    return `${job.currency}${min.toLocaleString()}–${max.toLocaleString()} /mo`;
  };

  return (
    <div className="group relative min-w-[320px] max-w-[360px] shrink-0 border border-[#f59e0b]/30 bg-gradient-to-br from-[#f59e0b]/[0.04] to-[#0d0d0d] p-5 rounded-sm hover:border-[#f59e0b]/60 transition-all duration-300 hover:shadow-xl hover:shadow-[#f59e0b]/10 hover:-translate-y-0.5 snap-start">
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#f59e0b]/60 via-[#f59e0b] to-[#f59e0b]/60 rounded-t-sm" />

      <div className="flex items-center justify-between mb-3">
        <span className="flex items-center gap-1.5 px-2 py-0.5 text-[9px] uppercase tracking-wider bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/30 rounded-sm font-semibold">
          <Zap className="h-3 w-3" />
          Featured
        </span>
        <div className="flex items-center gap-1.5">
          {urgent && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/20 rounded-sm">
              <AlertTriangle className="h-3 w-3" />
              Urgent
            </span>
          )}
          {offshore && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-sm">
              <Anchor className="h-3 w-3" />
              Offshore
            </span>
          )}
        </div>
      </div>

      <h3 className="text-base font-semibold text-zinc-100 group-hover:text-[#f59e0b] transition-colors duration-300 line-clamp-1">
        {job.title}
      </h3>

      <div className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
        <span className="flex items-center gap-1">
          <Building2 className="h-3.5 w-3.5 text-zinc-500" />
          {job.company}
        </span>
        <span className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-sm">
          {job.category}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-3 text-[11px] text-zinc-500">
        {job.location && (
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {job.location}
          </span>
        )}
        {rotation && (
          <span className="flex items-center gap-1">
            <RefreshCw className="h-3 w-3" />
            {rotation}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {job.posted_at}
        </span>
      </div>

      {job.description && (
        <p className="mt-3 text-xs text-zinc-400 line-clamp-2 leading-5">{job.description}</p>
      )}

      <div className="mt-4 flex items-center justify-between">
        {formatSalary() ? (
          <span className="flex items-center gap-1 text-sm font-semibold text-[#f59e0b]">
            <Banknote className="h-3.5 w-3.5" />
            {formatSalary()}
          </span>
        ) : (
          <span className="text-xs text-zinc-600">Salary negotiable</span>
        )}

        <button
          onClick={onApply}
          disabled={applying}
          className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-semibold transition ${
            applied
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
              : 'bg-[#f59e0b] text-black hover:bg-[#d97706]'
          } disabled:opacity-50`}
        >
          {applied ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" />
              Applied
            </>
          ) : applying ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Applying…
            </>
          ) : (
            'Apply now'
          )}
        </button>
      </div>
    </div>
  );
}
