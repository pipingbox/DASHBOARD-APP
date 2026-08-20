/* ─── Workforce Pipeline - Shared Types & Constants ─── */

/* ─── Priority Types ─── */
export const WORKFORCE_PRIORITIES = [
  { value: 'normal', label: 'Normal', color: 'bg-zinc-500/10 text-zinc-400 border-zinc-600', dotColor: 'bg-zinc-400' },
  { value: 'high', label: 'High', color: 'bg-orange-500/10 text-orange-400 border-orange-500/30', dotColor: 'bg-orange-400' },
  { value: 'urgent', label: 'Urgent', color: 'bg-red-500/10 text-red-400 border-red-500/30', dotColor: 'bg-red-400' },
  { value: 'critical_shutdown', label: 'Critical Shutdown', color: 'bg-rose-500/10 text-rose-300 border-rose-500/40', dotColor: 'bg-rose-400' },
  { value: 'offshore', label: 'Offshore', color: 'bg-sky-500/10 text-sky-400 border-sky-500/30', dotColor: 'bg-sky-400' },
  { value: 'turnaround', label: 'Turnaround', color: 'bg-violet-500/10 text-violet-400 border-violet-500/30', dotColor: 'bg-violet-400' },
  { value: 'long_term_project', label: 'Long-Term Project', color: 'bg-teal-500/10 text-teal-400 border-teal-500/30', dotColor: 'bg-teal-400' },
] as const;

export type PriorityValue = (typeof WORKFORCE_PRIORITIES)[number]['value'];

export function getPriorityConfig(priority: string) {
  return WORKFORCE_PRIORITIES.find((p) => p.value === priority) || WORKFORCE_PRIORITIES[0];
}

/* ─── Pipeline Stages ─── */
export const PIPELINE_STAGES = [
  { key: 'request_received', label: 'Request Received', icon: 'inbox' },
  { key: 'reviewing_candidates', label: 'Reviewing Candidates', icon: 'search' },
  { key: 'documents_validation', label: 'Documents Validation', icon: 'file-check' },
  { key: 'workers_assigned', label: 'Workers Assigned', icon: 'user-check' },
  { key: 'ready_for_mobilization', label: 'Ready for Mobilization', icon: 'rocket' },
] as const;

export type PipelineStageKey = (typeof PIPELINE_STAGES)[number]['key'];

/* Map existing statuses to pipeline stages */
export function getStageFromStatus(status: string): PipelineStageKey {
  switch (status) {
    case 'new':
      return 'request_received';
    case 'reviewing':
    case 'recruiting':
      return 'reviewing_candidates';
    case 'partially_staffed':
      return 'documents_validation';
    case 'fully_staffed':
    case 'in_progress':
      return 'workers_assigned';
    case 'completed':
      return 'ready_for_mobilization';
    default:
      return 'request_received';
  }
}

export function getStageIndex(stage: PipelineStageKey): number {
  return PIPELINE_STAGES.findIndex((s) => s.key === stage);
}

/* ─── Coverage Tracking ─── */
export interface CoverageData {
  requested_workers: number;
  assigned_workers: number;
  pending_validation_workers: number;
  ready_to_deploy_workers: number;
}

export function computeCoverageFromRequest(req: {
  workers_requested?: number | null;
  workers_assigned?: number | null;
}): CoverageData {
  const assigned = Number(req.workers_assigned) || 0;
  const requested = Number(req.workers_requested) || 1;
  // Distribute assigned workers into sub-categories (demo logic)
  const readyToDeploy = Math.floor(assigned * 0.5);
  const pendingValidation = Math.floor(assigned * 0.3);
  const justAssigned = assigned - readyToDeploy - pendingValidation;

  return {
    requested_workers: requested,
    assigned_workers: justAssigned,
    pending_validation_workers: pendingValidation,
    ready_to_deploy_workers: readyToDeploy,
  };
}

export function getCoveragePercentage(coverage: CoverageData): number {
  if (!coverage || !coverage.requested_workers || coverage.requested_workers === 0) return 0;
  const total = (coverage.assigned_workers || 0) + (coverage.pending_validation_workers || 0) + (coverage.ready_to_deploy_workers || 0);
  return Math.min(100, Math.round((total / coverage.requested_workers) * 100));
}

/* ─── AI Matching Mock (Demo Mode) ─── */
export interface AIMatchResult {
  totalMatching: number;
  readyWorkers: number;
  missingCerts: number;
  missingCertName: string;
}

const CERT_NAMES = ['VCA', 'SCC', 'BOSIET', 'H2S', 'OPITO', 'NEBOSH', 'IRATA', 'GWO'];

export function generateAIMatchPreview(workerType: string, requested: number): AIMatchResult {
  // Deterministic mock based on workerType hash
  const hash = workerType.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const multiplier = 1.5 + (hash % 5) * 0.3;
  const totalMatching = Math.max(requested, Math.floor(requested * multiplier));
  const readyWorkers = Math.floor(totalMatching * (0.5 + (hash % 3) * 0.1));
  const missingCerts = totalMatching - readyWorkers;
  const missingCertName = CERT_NAMES[hash % CERT_NAMES.length];

  return { totalMatching, readyWorkers, missingCerts, missingCertName };
}