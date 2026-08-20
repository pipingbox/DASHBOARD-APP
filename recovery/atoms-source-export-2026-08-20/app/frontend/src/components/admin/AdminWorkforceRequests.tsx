import { useEffect, useState, useCallback } from 'react';
import { supabase, TABLES } from '@/lib/supabase';
import {
  HardHat,
  Users,
  Globe,
  Calendar,
  Loader2,
  X,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Clock,
  UserPlus,
  UserMinus,
  BarChart3,
  FileText,
  ChevronDown,
  Save,
  RefreshCw,
  Rocket,
  Shield,
} from 'lucide-react';
import { toast } from 'sonner';
import { logAuditEvent } from './AdminAuditLog';
import { Button } from '@/components/ui/button';
import { PipelineTimeline } from '@/components/workforce/PipelineTimeline';
import { CoverageCard } from '@/components/workforce/CoverageCard';
import { AIMatchingPreview } from '@/components/workforce/AIMatchingPreview';
import { WorkforcePriorityBadge } from '@/components/workforce/WorkforcePriorityBadge';
import {
  WORKFORCE_PRIORITIES,
  computeCoverageFromRequest,
  generateAIMatchPreview,
  getStageFromStatus,
} from '@/lib/workforce-pipeline';

/* ─── Types ─── */
interface WorkforceRequest {
  id: string;
  company_id: string | null;
  company_name: string;
  contact_person: string;
  email: string;
  country: string | null;
  worker_type: string;
  workers_requested: number;
  workers_assigned: number;
  coverage_percentage: number;
  estimated_start_date: string | null;
  project_duration: string | null;
  priority: string;
  status: string;
  recruiter_assigned: string | null;
  notes: string | null;
  message: string | null;
  documentation_progress: DocumentationProgress;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

interface DocumentationProgress {
  contracts: boolean;
  certifications: boolean;
  onboarding: boolean;
  compliance: boolean;
  medical: boolean;
  payroll: boolean;
}

interface WorkerAssignment {
  id: string;
  request_id: string;
  worker_id: string;
  worker_name: string | null;
  worker_position: string | null;
  assigned_by: string | null;
  status: string;
  notes: string | null;
  created_at: string;
}

interface WorkerProfile {
  user_id: string;
  full_name: string | null;
  position: string | null;
  country: string | null;
  avatar_url: string | null;
}

/* ─── Constants ─── */
const STATUSES = [
  { value: 'new', label: 'New', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  { value: 'reviewing', label: 'Reviewing', color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' },
  { value: 'recruiting', label: 'Recruiting', color: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
  { value: 'partially_staffed', label: 'Partially Staffed', color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' },
  { value: 'fully_staffed', label: 'Fully Staffed', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' },
  { value: 'completed', label: 'Completed', color: 'bg-green-500/10 text-green-400 border-green-500/30' },
  { value: 'archived', label: 'Archived', color: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30' },
];

function getStatusConfig(status: string) {
  return STATUSES.find((s) => s.value === status) || STATUSES[0];
}

/* ─── Main Component ─── */
export function AdminWorkforceRequests() {
  const [requests, setRequests] = useState<WorkforceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<WorkforceRequest | null>(null);
  const [assignments, setAssignments] = useState<WorkerAssignment[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  // Worker assignment
  const [workerSearch, setWorkerSearch] = useState('');
  const [workerResults, setWorkerResults] = useState<WorkerProfile[]>([]);
  const [searchingWorkers, setSearchingWorkers] = useState(false);
  const [assigningWorker, setAssigningWorker] = useState(false);

  // Notes
  const [notesInput, setNotesInput] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  // Recruiter
  const [recruiterInput, setRecruiterInput] = useState('');

  /* ─── Fetch requests ─── */
  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from(TABLES.workforceRequests)
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[AdminWorkforce] Fetch error:', error);
        toast.error('Failed to load workforce requests');
      } else {
        // Normalize data - ensure documentation_progress is always an object
        const normalized = (data || []).map((row: Record<string, unknown>) => ({
          ...row,
          documentation_progress: row.documentation_progress && typeof row.documentation_progress === 'object'
            ? row.documentation_progress
            : { contracts: false, certifications: false, onboarding: false, compliance: false, medical: false, payroll: false },
          workers_assigned: row.workers_assigned ?? 0,
          workers_requested: row.workers_requested ?? 1,
          coverage_percentage: row.coverage_percentage ?? 0,
          priority: row.priority || 'normal',
          status: row.status || 'new',
          archived: row.archived ?? false,
        })) as WorkforceRequest[];
        setRequests(normalized);
      }
    } catch (err) {
      console.error('[AdminWorkforce] Unexpected error:', err);
      toast.error('Failed to load workforce requests');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  /* ─── Fetch assignments for selected request ─── */
  const fetchAssignments = useCallback(async (requestId: string) => {
    const { data, error } = await supabase
      .from(TABLES.workforceAssignments)
      .select('*')
      .eq('request_id', requestId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[AdminWorkforce] Fetch assignments error:', error);
    } else {
      setAssignments((data || []) as WorkerAssignment[]);
    }
  }, []);

  /* ─── Open request detail ─── */
  const openRequest = (req: WorkforceRequest) => {
    // Ensure documentation_progress is always a valid object
    const safeReq = {
      ...req,
      documentation_progress: req.documentation_progress && typeof req.documentation_progress === 'object'
        ? req.documentation_progress
        : { contracts: false, certifications: false, onboarding: false, compliance: false, medical: false, payroll: false },
    };
    setSelectedRequest(safeReq);
    setNotesInput(safeReq.notes || '');
    setRecruiterInput(safeReq.recruiter_assigned || '');
    fetchAssignments(safeReq.id);
    setWorkerSearch('');
    setWorkerResults([]);
  };

  /* ─── Update status ─── */
  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase
      .from(TABLES.workforceRequests)
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      toast.error(`Failed to update status: ${error.message}`);
      return;
    }
    setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    if (selectedRequest?.id === id) setSelectedRequest((p) => (p ? { ...p, status } : p));
    toast.success(`Status updated to "${status}"`);
    logAuditEvent({
      actionType: 'workforce_status_change',
      targetType: 'workforce_request',
      targetId: id,
      details: `Changed status to "${status}"`,
    });
  };

  /* ─── Update priority ─── */
  const updatePriority = async (id: string, priority: string) => {
    const { error } = await supabase
      .from(TABLES.workforceRequests)
      .update({ priority, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      toast.error(`Failed to update priority: ${error.message}`);
      return;
    }
    setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, priority } : r)));
    if (selectedRequest?.id === id) setSelectedRequest((p) => (p ? { ...p, priority } : p));
    toast.success('Priority updated');
  };

  /* ─── Save notes ─── */
  const saveNotes = async () => {
    if (!selectedRequest) return;
    setSavingNotes(true);
    const { error } = await supabase
      .from(TABLES.workforceRequests)
      .update({ notes: notesInput, updated_at: new Date().toISOString() })
      .eq('id', selectedRequest.id);

    if (error) {
      toast.error('Failed to save notes');
    } else {
      setRequests((prev) =>
        prev.map((r) => (r.id === selectedRequest.id ? { ...r, notes: notesInput } : r))
      );
      setSelectedRequest((p) => (p ? { ...p, notes: notesInput } : p));
      toast.success('Notes saved');
    }
    setSavingNotes(false);
  };

  /* ─── Save recruiter ─── */
  const saveRecruiter = async () => {
    if (!selectedRequest) return;
    const { error } = await supabase
      .from(TABLES.workforceRequests)
      .update({ recruiter_assigned: recruiterInput || null, updated_at: new Date().toISOString() })
      .eq('id', selectedRequest.id);

    if (error) {
      toast.error('Failed to assign recruiter');
    } else {
      setRequests((prev) =>
        prev.map((r) =>
          r.id === selectedRequest.id ? { ...r, recruiter_assigned: recruiterInput || null } : r
        )
      );
      setSelectedRequest((p) => (p ? { ...p, recruiter_assigned: recruiterInput || null } : p));
      toast.success('Recruiter assigned');
      logAuditEvent({
        actionType: 'recruiter_assigned',
        targetType: 'workforce_request',
        targetId: selectedRequest.id,
        details: `Recruiter assigned: ${recruiterInput}`,
      });
    }
  };

  /* ─── Update documentation progress ─── */
  const toggleDocProgress = async (key: keyof DocumentationProgress) => {
    if (!selectedRequest) return;
    const updated = {
      ...selectedRequest.documentation_progress,
      [key]: !selectedRequest.documentation_progress[key],
    };
    const { error } = await supabase
      .from(TABLES.workforceRequests)
      .update({ documentation_progress: updated, updated_at: new Date().toISOString() })
      .eq('id', selectedRequest.id);

    if (error) {
      toast.error('Failed to update documentation');
    } else {
      setRequests((prev) =>
        prev.map((r) =>
          r.id === selectedRequest.id ? { ...r, documentation_progress: updated } : r
        )
      );
      setSelectedRequest((p) => (p ? { ...p, documentation_progress: updated } : p));
    }
  };

  /* ─── Search workers ─── */
  const searchWorkers = async () => {
    if (!workerSearch.trim()) return;
    setSearchingWorkers(true);
    const { data, error } = await supabase
      .from(TABLES.profiles)
      .select('user_id, full_name, position, country, avatar_url')
      .or(`full_name.ilike.%${workerSearch}%,position.ilike.%${workerSearch}%`)
      .in('role', ['worker', 'user'])
      .limit(10);

    if (error) {
      console.error('[AdminWorkforce] Worker search error:', error);
    } else {
      setWorkerResults((data || []) as WorkerProfile[]);
    }
    setSearchingWorkers(false);
  };

  /* ─── Assign worker ─── */
  const assignWorker = async (worker: WorkerProfile) => {
    if (!selectedRequest) return;
    // Check if already assigned
    if (assignments.some((a) => a.worker_id === worker.user_id)) {
      toast.error('Worker already assigned to this request');
      return;
    }
    setAssigningWorker(true);
    const { error } = await supabase.from(TABLES.workforceAssignments).insert({
      request_id: selectedRequest.id,
      worker_id: worker.user_id,
      worker_name: worker.full_name,
      worker_position: worker.position,
      status: 'assigned',
    });

    if (error) {
      toast.error(`Failed to assign worker: ${error.message}`);
      setAssigningWorker(false);
      return;
    }

    // Update coverage
    const newAssigned = selectedRequest.workers_assigned + 1;
    const newCoverage = Math.min(
      100,
      Math.round((newAssigned / selectedRequest.workers_requested) * 100 * 100) / 100
    );
    const newStatus =
      newCoverage >= 100
        ? 'fully_staffed'
        : newCoverage > 0
          ? 'partially_staffed'
          : selectedRequest.status;

    await supabase
      .from(TABLES.workforceRequests)
      .update({
        workers_assigned: newAssigned,
        coverage_percentage: newCoverage,
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', selectedRequest.id);

    setRequests((prev) =>
      prev.map((r) =>
        r.id === selectedRequest.id
          ? { ...r, workers_assigned: newAssigned, coverage_percentage: newCoverage, status: newStatus }
          : r
      )
    );
    setSelectedRequest((p) =>
      p
        ? { ...p, workers_assigned: newAssigned, coverage_percentage: newCoverage, status: newStatus }
        : p
    );
    fetchAssignments(selectedRequest.id);
    setAssigningWorker(false);
    setWorkerSearch('');
    setWorkerResults([]);
    toast.success(`${worker.full_name || 'Worker'} assigned`);
    logAuditEvent({
      actionType: 'worker_assigned',
      targetType: 'workforce_request',
      targetId: selectedRequest.id,
      details: `Assigned ${worker.full_name} to request`,
    });
  };

  /* ─── Remove worker ─── */
  const removeWorker = async (assignment: WorkerAssignment) => {
    if (!selectedRequest) return;
    const { error } = await supabase
      .from(TABLES.workforceAssignments)
      .delete()
      .eq('id', assignment.id);

    if (error) {
      toast.error('Failed to remove worker');
      return;
    }

    const newAssigned = Math.max(0, selectedRequest.workers_assigned - 1);
    const newCoverage =
      selectedRequest.workers_requested > 0
        ? Math.round((newAssigned / selectedRequest.workers_requested) * 100 * 100) / 100
        : 0;
    const newStatus =
      newCoverage >= 100
        ? 'fully_staffed'
        : newCoverage > 0
          ? 'partially_staffed'
          : 'recruiting';

    await supabase
      .from(TABLES.workforceRequests)
      .update({
        workers_assigned: newAssigned,
        coverage_percentage: newCoverage,
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', selectedRequest.id);

    setRequests((prev) =>
      prev.map((r) =>
        r.id === selectedRequest.id
          ? { ...r, workers_assigned: newAssigned, coverage_percentage: newCoverage, status: newStatus }
          : r
      )
    );
    setSelectedRequest((p) =>
      p
        ? { ...p, workers_assigned: newAssigned, coverage_percentage: newCoverage, status: newStatus }
        : p
    );
    setAssignments((prev) => prev.filter((a) => a.id !== assignment.id));
    toast.success('Worker removed');
    logAuditEvent({
      actionType: 'worker_removed',
      targetType: 'workforce_request',
      targetId: selectedRequest.id,
      details: `Removed ${assignment.worker_name} from request`,
    });
  };

  /* ─── Filtered requests ─── */
  const filteredRequests = requests.filter((req) => {
    if (statusFilter !== 'all' && req.status !== statusFilter) return false;
    if (priorityFilter !== 'all' && req.priority !== priorityFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        req.company_name.toLowerCase().includes(q) ||
        req.contact_person.toLowerCase().includes(q) ||
        req.worker_type.toLowerCase().includes(q) ||
        (req.country || '').toLowerCase().includes(q) ||
        (req.recruiter_assigned || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  /* ─── Stats ─── */
  const totalAssigned = requests.reduce((sum, r) => sum + r.workers_assigned, 0);
  const totalRequested = requests.reduce((sum, r) => sum + r.workers_requested, 0);
  const deploymentReadiness = totalRequested > 0 ? Math.round((totalAssigned / totalRequested) * 100) : 0;

  const stats = {
    total: requests.length,
    active: requests.filter((r) => !['completed', 'archived'].includes(r.status)).length,
    recruiting: requests.filter((r) => r.status === 'recruiting').length,
    fullyStaffed: requests.filter((r) => r.status === 'fully_staffed').length,
    totalAssigned,
    totalRequested,
    deploymentReadiness,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Staffing Operations</p>
          <h3 className="text-lg font-semibold text-zinc-100 mt-1">Workforce Pipeline</h3>
        </div>
        <Button
          onClick={fetchRequests}
          variant="outline"
          size="sm"
          className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 !bg-transparent"
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total Requests" value={stats.total} icon={HardHat} color="text-zinc-100" />
        <StatCard label="Active" value={stats.active} icon={Clock} color="text-amber-400" />
        <StatCard label="Recruiting" value={stats.recruiting} icon={Users} color="text-purple-400" />
        <StatCard label="Fully Staffed" value={stats.fullyStaffed} icon={CheckCircle2} color="text-emerald-400" />
        <StatCard label="Workers Assigned" value={stats.totalAssigned} icon={UserPlus} color="text-blue-400" />
        <div className="border border-zinc-800/80 bg-[#0d0d0d] p-3 rounded-sm">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Deploy Ready</p>
            <Rocket className="h-3.5 w-3.5 text-emerald-400" />
          </div>
          <p className="mt-2 text-xl font-bold text-emerald-400">{stats.deploymentReadiness}%</p>
          <div className="mt-1 w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${stats.deploymentReadiness}%` }} />
          </div>
        </div>
      </div>

      {/* Operational Summary */}
      <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="h-4 w-4 text-[#f59e0b]" />
          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium">Operational Summary</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-[10px] text-zinc-500">Total Workers Needed</p>
            <p className="text-lg font-bold text-zinc-100">{stats.totalRequested}</p>
          </div>
          <div>
            <p className="text-[10px] text-zinc-500">Workers Assigned</p>
            <p className="text-lg font-bold text-blue-400">{stats.totalAssigned}</p>
          </div>
          <div>
            <p className="text-[10px] text-zinc-500">Gap to Fill</p>
            <p className="text-lg font-bold text-red-400">{Math.max(0, stats.totalRequested - stats.totalAssigned)}</p>
          </div>
          <div>
            <p className="text-[10px] text-zinc-500">Deployment Readiness</p>
            <p className={`text-lg font-bold ${stats.deploymentReadiness >= 80 ? 'text-emerald-400' : stats.deploymentReadiness >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
              {stats.deploymentReadiness}%
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search company, worker type, recruiter..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[#f59e0b] focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-zinc-500" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-2 text-zinc-300 focus:outline-none focus:border-[#f59e0b]"
          >
            <option value="all">All Statuses</option>
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="text-xs bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-2 text-zinc-300 focus:outline-none focus:border-[#f59e0b]"
          >
            <option value="all">All Priority</option>
            {WORKFORCE_PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Requests Table */}
      <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
          </div>
        ) : filteredRequests.length === 0 ? (
          <p className="text-sm text-zinc-500 py-12 text-center">No workforce requests found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950/50">
                  <th className="text-left py-3 px-3 text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Company</th>
                  <th className="text-left py-3 px-3 text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Worker Type</th>
                  <th className="text-left py-3 px-3 text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Coverage</th>
                  <th className="text-left py-3 px-3 text-[10px] uppercase tracking-wider text-zinc-500 font-medium">AI Match</th>
                  <th className="text-left py-3 px-3 text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Priority</th>
                  <th className="text-left py-3 px-3 text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Pipeline</th>
                  <th className="text-left py-3 px-3 text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Status</th>
                  <th className="text-left py-3 px-3 text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Recruiter</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((req) => {
                  const aiMatch = generateAIMatchPreview(req.worker_type, req.workers_requested);
                  const coverage = computeCoverageFromRequest(req);
                  return (
                    <tr
                      key={req.id}
                      onClick={() => openRequest(req)}
                      className="border-b border-zinc-800/50 hover:bg-zinc-900/50 transition cursor-pointer"
                    >
                      <td className="py-3 px-3">
                        <p className="text-zinc-200 font-medium text-xs">{req.company_name}</p>
                        <p className="text-[10px] text-zinc-500">{req.contact_person}</p>
                      </td>
                      <td className="py-3 px-3">
                        <span className="flex items-center gap-1.5 text-xs text-zinc-300">
                          <HardHat className="h-3 w-3 text-zinc-500" />
                          {req.worker_type}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <CoverageCard coverage={coverage} compact />
                      </td>
                      <td className="py-3 px-3">
                        <AIMatchingPreview match={aiMatch} compact />
                      </td>
                      <td className="py-3 px-3">
                        <WorkforcePriorityBadge priority={req.priority} />
                      </td>
                      <td className="py-3 px-3 min-w-[120px]">
                        <PipelineTimeline currentStage={getStageFromStatus(req.status)} compact />
                      </td>
                      <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={req.status}
                          onChange={(e) => updateStatus(req.id, e.target.value)}
                          className={`text-[10px] px-2 py-1 rounded border ${getStatusConfig(req.status).color} bg-transparent cursor-pointer focus:outline-none`}
                        >
                          {STATUSES.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 px-3">
                        <span className="text-xs text-zinc-400">{req.recruiter_assigned || '—'}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Panel */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedRequest(null)} />
          <div className="relative w-full max-w-2xl bg-[#0a0a0a] border-l border-zinc-800 overflow-y-auto animate-in slide-in-from-right">
            {/* Detail Header */}
            <div className="sticky top-0 bg-[#0a0a0a] border-b border-zinc-800 p-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-sm bg-[#f59e0b]/10">
                  <HardHat className="h-4 w-4 text-[#f59e0b]" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">{selectedRequest.company_name}</h3>
                  <p className="text-xs text-zinc-500">{selectedRequest.worker_type} · {selectedRequest.workers_requested} requested</p>
                </div>
              </div>
              <button onClick={() => setSelectedRequest(null)} className="p-2 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 space-y-6">
              {/* Pipeline Timeline */}
              <div className="border border-zinc-800 rounded-sm p-4 space-y-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium">Operational Pipeline</p>
                <PipelineTimeline currentStage={getStageFromStatus(selectedRequest.status)} />
              </div>

              {/* Coverage Card (full) */}
              <CoverageCard coverage={computeCoverageFromRequest(selectedRequest)} />

              {/* AI Matching Preview */}
              <AIMatchingPreview match={generateAIMatchPreview(selectedRequest.worker_type, selectedRequest.workers_requested)} />

              {/* Status & Priority */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Status</p>
                  <select
                    value={selectedRequest.status}
                    onChange={(e) => updateStatus(selectedRequest.id, e.target.value)}
                    className={`w-full text-xs px-2 py-2 rounded border ${getStatusConfig(selectedRequest.status).color} bg-transparent cursor-pointer focus:outline-none`}
                  >
                    {STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Priority</p>
                  <select
                    value={selectedRequest.priority}
                    onChange={(e) => updatePriority(selectedRequest.id, e.target.value)}
                    className="w-full text-xs px-2 py-2 rounded border border-zinc-700 bg-transparent text-zinc-300 cursor-pointer focus:outline-none focus:border-[#f59e0b]"
                  >
                    {WORKFORCE_PRIORITIES.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Recruiter Assignment */}
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium">Recruiter Assigned</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={recruiterInput}
                    onChange={(e) => setRecruiterInput(e.target.value)}
                    placeholder="Recruiter name..."
                    className="flex-1 px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[#f59e0b] focus:outline-none"
                  />
                  <Button
                    onClick={saveRecruiter}
                    size="sm"
                    className="bg-[#f59e0b] text-black hover:bg-[#d97706] text-xs px-3"
                  >
                    <Save className="h-3 w-3 mr-1" />
                    Save
                  </Button>
                </div>
              </div>

              {/* Worker Assignment Section */}
              <div className="space-y-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium flex items-center gap-2">
                  <UserPlus className="h-3 w-3" />
                  Assign Workers
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={workerSearch}
                    onChange={(e) => setWorkerSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && searchWorkers()}
                    placeholder="Search workers by name or position..."
                    className="flex-1 px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[#f59e0b] focus:outline-none"
                  />
                  <Button
                    onClick={searchWorkers}
                    disabled={searchingWorkers}
                    size="sm"
                    variant="outline"
                    className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 !bg-transparent text-xs"
                  >
                    {searchingWorkers ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                  </Button>
                </div>

                {/* Search Results */}
                {workerResults.length > 0 && (
                  <div className="border border-zinc-800 rounded-sm divide-y divide-zinc-800 max-h-48 overflow-y-auto">
                    {workerResults.map((w) => (
                      <div key={w.user_id} className="flex items-center justify-between px-3 py-2 hover:bg-zinc-900/50">
                        <div>
                          <p className="text-xs text-zinc-200">{w.full_name || 'Unknown'}</p>
                          <p className="text-[10px] text-zinc-500">{w.position || 'No position'} · {w.country || '—'}</p>
                        </div>
                        <Button
                          onClick={() => assignWorker(w)}
                          disabled={assigningWorker}
                          size="sm"
                          className="bg-emerald-600 text-white hover:bg-emerald-700 text-[10px] px-2 py-1 h-6"
                        >
                          <UserPlus className="h-3 w-3 mr-1" />
                          Assign
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Current Assignments */}
                {assignments.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] text-zinc-400">{assignments.length} worker(s) assigned</p>
                    <div className="border border-zinc-800 rounded-sm divide-y divide-zinc-800 max-h-48 overflow-y-auto">
                      {assignments.map((a) => (
                        <div key={a.id} className="flex items-center justify-between px-3 py-2">
                          <div>
                            <p className="text-xs text-zinc-200">{a.worker_name || 'Unknown'}</p>
                            <p className="text-[10px] text-zinc-500">{a.worker_position || '—'}</p>
                          </div>
                          <button
                            onClick={() => removeWorker(a)}
                            className="p-1.5 rounded hover:bg-red-950/50 text-zinc-500 hover:text-red-400 transition"
                            title="Remove worker"
                          >
                            <UserMinus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Documentation Progress */}
              <div className="space-y-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium flex items-center gap-2">
                  <FileText className="h-3 w-3" />
                  Documentation Progress
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(selectedRequest.documentation_progress) as (keyof DocumentationProgress)[]).map((key) => (
                    <label
                      key={key}
                      className="flex items-center gap-2 px-3 py-2 border border-zinc-800 rounded-sm cursor-pointer hover:bg-zinc-900/50 transition"
                    >
                      <input
                        type="checkbox"
                        checked={selectedRequest.documentation_progress[key]}
                        onChange={() => toggleDocProgress(key)}
                        className="rounded border-zinc-700 bg-zinc-950 text-[#f59e0b] focus:ring-[#f59e0b]/20"
                      />
                      <span className="text-xs text-zinc-300 capitalize">{key}</span>
                    </label>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#f59e0b] rounded-full transition-all"
                      style={{
                        width: `${(Object.values(selectedRequest.documentation_progress).filter(Boolean).length / 6) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-zinc-500">
                    {Object.values(selectedRequest.documentation_progress).filter(Boolean).length}/6
                  </span>
                </div>
              </div>

              {/* Request Details */}
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium">Request Details</p>
                <div className="border border-zinc-800 rounded-sm divide-y divide-zinc-800">
                  <DetailRow icon={<Globe className="h-3.5 w-3.5" />} label="Country" value={selectedRequest.country || '—'} />
                  <DetailRow icon={<Calendar className="h-3.5 w-3.5" />} label="Start Date" value={selectedRequest.estimated_start_date || '—'} />
                  <DetailRow icon={<Clock className="h-3.5 w-3.5" />} label="Duration" value={selectedRequest.project_duration || '—'} />
                  <DetailRow icon={<Calendar className="h-3.5 w-3.5" />} label="Created" value={new Date(selectedRequest.created_at).toLocaleString()} />
                </div>
              </div>

              {/* Message */}
              {selectedRequest.message && (
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium">Client Message</p>
                  <div className="border border-zinc-800 rounded-sm p-3 bg-zinc-950">
                    <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">{selectedRequest.message}</p>
                  </div>
                </div>
              )}

              {/* Internal Notes */}
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium">Internal Notes</p>
                <textarea
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  placeholder="Add internal notes..."
                  rows={3}
                  className="w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-[#f59e0b] focus:outline-none resize-none"
                />
                <Button
                  onClick={saveNotes}
                  disabled={savingNotes}
                  size="sm"
                  className="bg-[#f59e0b] text-black hover:bg-[#d97706] text-xs"
                >
                  {savingNotes ? 'Saving...' : 'Save Notes'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Sub-components ─── */
function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ElementType; color: string }) {
  return (
    <div className="border border-zinc-800/80 bg-[#0d0d0d] p-3 rounded-sm">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
        <Icon className={`h-3.5 w-3.5 ${color}`} />
      </div>
      <p className={`mt-2 text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}



function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5">
      <span className="flex items-center gap-2 text-xs text-zinc-500">{icon}{label}</span>
      <span className="text-xs text-zinc-200 truncate max-w-[200px]">{value}</span>
    </div>
  );
}