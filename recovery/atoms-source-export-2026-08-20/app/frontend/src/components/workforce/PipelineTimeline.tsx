import { PIPELINE_STAGES, getStageIndex, type PipelineStageKey } from '@/lib/workforce-pipeline';
import { Inbox, Search, FileCheck, UserCheck, Rocket } from 'lucide-react';

const STAGE_ICONS = {
  inbox: Inbox,
  search: Search,
  'file-check': FileCheck,
  'user-check': UserCheck,
  rocket: Rocket,
};

interface PipelineTimelineProps {
  currentStage: PipelineStageKey;
  compact?: boolean;
  timestamps?: Record<string, string>;
}

export function PipelineTimeline({ currentStage, compact = false, timestamps }: PipelineTimelineProps) {
  const currentIdx = getStageIndex(currentStage);

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        {PIPELINE_STAGES.map((stage, idx) => (
          <div
            key={stage.key}
            className={`h-1.5 flex-1 rounded-full transition-all ${
              idx <= currentIdx ? 'bg-[#f59e0b]' : 'bg-zinc-800'
            }`}
            title={stage.label}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        {PIPELINE_STAGES.map((stage, idx) => {
          const Icon = STAGE_ICONS[stage.icon];
          const isActive = idx === currentIdx;
          const isCompleted = idx < currentIdx;
          const isPending = idx > currentIdx;

          return (
            <div key={stage.key} className="flex flex-col items-center flex-1 relative">
              {/* Connector line */}
              {idx > 0 && (
                <div
                  className={`absolute top-4 right-1/2 w-full h-0.5 -translate-y-1/2 ${
                    idx <= currentIdx ? 'bg-[#f59e0b]' : 'bg-zinc-800'
                  }`}
                  style={{ left: '-50%' }}
                />
              )}
              {/* Icon circle */}
              <div
                className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all ${
                  isActive
                    ? 'border-[#f59e0b] bg-[#f59e0b]/10 text-[#f59e0b] ring-2 ring-[#f59e0b]/20'
                    : isCompleted
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                      : 'border-zinc-700 bg-zinc-900 text-zinc-600'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
              </div>
              {/* Label */}
              <p
                className={`mt-1.5 text-[9px] text-center leading-tight max-w-[70px] ${
                  isActive ? 'text-[#f59e0b] font-semibold' : isCompleted ? 'text-emerald-400' : 'text-zinc-600'
                }`}
              >
                {stage.label}
              </p>
              {/* Timestamp */}
              {timestamps?.[stage.key] && (
                <p className="text-[8px] text-zinc-600 mt-0.5">
                  {new Date(timestamps[stage.key]).toLocaleDateString()}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}