import { AlertTriangle, Anchor, RotateCcw, Calendar, Zap } from 'lucide-react';
import { getPriorityConfig } from '@/lib/workforce-pipeline';

interface WorkforcePriorityBadgeProps {
  priority: string;
  showIcon?: boolean;
}

const PRIORITY_ICONS: Record<string, React.ElementType> = {
  critical_shutdown: Zap,
  offshore: Anchor,
  turnaround: RotateCcw,
  long_term_project: Calendar,
  urgent: AlertTriangle,
};

export function WorkforcePriorityBadge({ priority, showIcon = true }: WorkforcePriorityBadgeProps) {
  const config = getPriorityConfig(priority);
  const Icon = PRIORITY_ICONS[priority];

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider border rounded-sm ${config.color}`}>
      {showIcon && Icon && <Icon className="h-2.5 w-2.5" />}
      {config.label}
    </span>
  );
}