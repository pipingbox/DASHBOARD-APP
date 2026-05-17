import { useEffect, useState, useCallback } from 'react';
import { supabase, TABLES } from '@/lib/supabase';
import {
  Building2,
  Globe,
  HardHat,
  Calendar,
  Loader2,
  X,
  Copy,
  Mail,
  Phone,
  Archive,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Users,
  MessageSquare,
  ChevronRight,
  Search,
  Filter,
} from 'lucide-react';
import { toast } from 'sonner';
import { logAuditEvent } from './AdminAuditLog';

interface Lead {
  id: string;
  created_at: string;
  company_name: string;
  contact_person: string;
  email: string;
  country: string;
  workers_needed: string;
  start_date: string | null;
  number_of_workers: string | null;
  project_duration: string | null;
  message: string | null;
  status: string;
  notes: string | null;
  priority: string | null;
  archived: boolean | null;
}

const STATUSES = [
  { value: 'new', label: 'New', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  { value: 'contacted', label: 'Contacted', color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' },
  { value: 'sourcing', label: 'Sourcing', color: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
  { value: 'candidates_sent', label: 'Candidates Sent', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  { value: 'closed', label: 'Closed', color: 'bg-green-500/10 text-green-400 border-green-500/30' },
  { value: 'rejected', label: 'Rejected', color: 'bg-red-500/10 text-red-400 border-red-500/30' },
];

function getStatusConfig(status: string) {
  return STATUSES.find((s) => s.value === status) || STATUSES[0];
}

function getPriorityBadge(priority: string | null, numWorkers: string | null, startDate: string | null) {
  // Auto-calculate priority if not set
  const num = parseInt(numWorkers || '0', 10);
  const isUrgentWorkers = num >= 10;
  const isUrgentDate = startDate && new Date(startDate) <= new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const isUrgent = priority === 'urgent' || isUrgentWorkers || isUrgentDate;

  if (isUrgent) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/30 rounded-sm">
        <AlertTriangle className="h-2.5 w-2.5" />
        Urgent
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-zinc-500/10 text-zinc-500 border border-zinc-700 rounded-sm">
      Normal
    </span>
  );
}

export function AdminLeads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [notesInput, setNotesInput] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [showArchived, setShowArchived] = useState(false);

  const fetchLeads = useCallback(async () => {
    console.log('[AdminLeads] Fetching leads from table:', TABLES.companyLeads);
    setLoading(true);
    try {
      const { data, error, status, statusText } = await supabase
        .from(TABLES.companyLeads)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      console.log('[AdminLeads] Response status:', status, statusText);
      if (error) {
        console.error('[AdminLeads] Fetch error:', error.message, error.details, error.hint);
        toast.error(`Failed to load leads: ${error.message}`);
      } else {
        console.log('[AdminLeads] Fetched leads count:', data?.length, 'First lead:', data?.[0]?.company_name);
        setLeads((data || []) as Lead[]);
      }
    } catch (err) {
      console.error('[AdminLeads] Unexpected error:', err);
      toast.error('Unexpected error loading leads');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLeads();

    // Real-time subscription for instant updates
    const channel = supabase
      .channel('company_leads_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLES.companyLeads },
        (payload) => {
          console.log('[AdminLeads] Real-time event:', payload.eventType, payload);
          if (payload.eventType === 'INSERT') {
            setLeads((prev) => [payload.new as Lead, ...prev]);
            toast.success(`New lead: ${(payload.new as Lead).company_name}`);
          } else if (payload.eventType === 'UPDATE') {
            setLeads((prev) =>
              prev.map((l) => (l.id === (payload.new as Lead).id ? (payload.new as Lead) : l))
            );
          } else if (payload.eventType === 'DELETE') {
            setLeads((prev) => prev.filter((l) => l.id !== (payload.old as Lead).id));
          }
        }
      )
      .subscribe((status) => {
        console.log('[AdminLeads] Subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchLeads]);

  const updateStatus = async (id: string, status: string) => {
    console.log('[AdminLeads] Updating status:', id, status);
    const lead = leads.find((l) => l.id === id);
    const { error } = await supabase.from(TABLES.companyLeads).update({ status }).eq('id', id);
    if (error) {
      console.error('[AdminLeads] Update status error:', error);
      toast.error(`Failed to update status: ${error.message}`);
      return;
    }
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
    if (selectedLead?.id === id) setSelectedLead((p) => (p ? { ...p, status } : p));
    toast.success(`Status updated to "${status}"`);
    // Audit log
    logAuditEvent({
      actionType: 'lead_status_change',
      targetType: 'company_lead',
      targetId: id,
      details: `Changed status to "${status}" for ${lead?.company_name || 'unknown'}`,
    });
  };

  const saveNotes = async () => {
    if (!selectedLead) return;
    setSavingNotes(true);
    const { error } = await supabase
      .from(TABLES.companyLeads)
      .update({ notes: notesInput })
      .eq('id', selectedLead.id);
    if (error) {
      console.error('[AdminLeads] Save notes error:', error);
      toast.error(`Failed to save notes: ${error.message}`);
      setSavingNotes(false);
      return;
    }
    setLeads((prev) =>
      prev.map((l) => (l.id === selectedLead.id ? { ...l, notes: notesInput } : l))
    );
    setSelectedLead((p) => (p ? { ...p, notes: notesInput } : p));
    setSavingNotes(false);
    toast.success('Notes saved');
    // Audit log
    logAuditEvent({
      actionType: 'notes_saved',
      targetType: 'company_lead',
      targetId: selectedLead.id,
      details: `Internal notes updated for ${selectedLead.company_name}`,
    });
  };

  const archiveLead = async (id: string) => {
    console.log('[AdminLeads] Archiving lead:', id);
    const { error } = await supabase.from(TABLES.companyLeads).update({ archived: true }).eq('id', id);
    if (error) {
      console.error('[AdminLeads] Archive error:', error);
      toast.error(`Failed to archive lead: ${error.message}`);
      return;
    }
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, archived: true } : l)));
    if (selectedLead?.id === id) setSelectedLead(null);
    toast.success('Lead archived');
  };

  const copyEmail = (email: string) => {
    navigator.clipboard.writeText(email);
    toast.success('Email copied to clipboard');
  };

  const openLead = (lead: Lead) => {
    setSelectedLead(lead);
    setNotesInput(lead.notes || '');
  };

  // Get unique countries for filter
  const uniqueCountries = Array.from(
    new Set(leads.map((l) => l.country).filter(Boolean))
  ).sort();

  // Helper to check if lead is urgent
  const isLeadUrgent = (lead: Lead) => {
    const num = parseInt(lead.number_of_workers || '0', 10);
    const isUrgentDate = lead.start_date && new Date(lead.start_date) <= new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    return lead.priority === 'urgent' || num >= 10 || isUrgentDate;
  };

  // Filtered leads
  const filteredLeads = leads.filter((lead) => {
    if (!showArchived && lead.archived) return false;
    if (statusFilter !== 'all' && lead.status !== statusFilter) return false;
    if (countryFilter !== 'all' && lead.country !== countryFilter) return false;
    if (priorityFilter === 'urgent' && !isLeadUrgent(lead)) return false;
    if (priorityFilter === 'normal' && isLeadUrgent(lead)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        lead.company_name.toLowerCase().includes(q) ||
        lead.contact_person.toLowerCase().includes(q) ||
        lead.email.toLowerCase().includes(q) ||
        lead.country.toLowerCase().includes(q) ||
        (lead.workers_needed || '').toLowerCase().includes(q) ||
        (lead.number_of_workers || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Stats
  const stats = {
    total: leads.filter((l) => !l.archived).length,
    new: leads.filter((l) => l.status === 'new' && !l.archived).length,
    urgent: leads.filter((l) => isLeadUrgent(l) && !l.archived).length,
    active: leads.filter((l) => ['contacted', 'sourcing', 'candidates_sent'].includes(l.status || '') && !l.archived).length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Recruitment CRM</p>
          <h3 className="text-lg font-semibold text-zinc-100 mt-1">Lead Pipeline</h3>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-[#f59e0b]/10">
          <Building2 className="h-4 w-4 text-[#f59e0b]" />
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-3">
        <div className="border border-zinc-800/80 bg-[#0d0d0d] p-3 rounded-sm">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">Total</p>
          <p className="text-xl font-bold text-zinc-100 mt-1">{stats.total}</p>
        </div>
        <div className="border border-zinc-800/80 bg-[#0d0d0d] p-3 rounded-sm">
          <p className="text-[10px] uppercase tracking-wider text-blue-400">New</p>
          <p className="text-xl font-bold text-blue-400 mt-1">{stats.new}</p>
        </div>
        <div className="border border-zinc-800/80 bg-[#0d0d0d] p-3 rounded-sm">
          <p className="text-[10px] uppercase tracking-wider text-red-400">Urgent</p>
          <p className="text-xl font-bold text-red-400 mt-1">{stats.urgent}</p>
        </div>
        <div className="border border-zinc-800/80 bg-[#0d0d0d] p-3 rounded-sm">
          <p className="text-[10px] uppercase tracking-wider text-emerald-400">Active</p>
          <p className="text-xl font-bold text-emerald-400 mt-1">{stats.active}</p>
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
            placeholder="Search by company, contact, email, country, workers..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[#f59e0b] focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-zinc-500" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-2 text-zinc-300 focus:outline-none focus:border-[#f59e0b]"
            >
              <option value="all">All Statuses</option>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <select
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
            className="text-xs bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-2 text-zinc-300 focus:outline-none focus:border-[#f59e0b]"
          >
            <option value="all">All Countries</option>
            {uniqueCountries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="text-xs bg-zinc-950 border border-zinc-800 rounded-sm px-2 py-2 text-zinc-300 focus:outline-none focus:border-[#f59e0b]"
          >
            <option value="all">All Priority</option>
            <option value="urgent">Urgent Only</option>
            <option value="normal">Normal Only</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-xs text-zinc-500 cursor-pointer">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="rounded border-zinc-700 bg-zinc-950 text-[#f59e0b] focus:ring-[#f59e0b]/20"
          />
          Show archived
        </label>
      </div>

      {/* Leads Table */}
      <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
          </div>
        ) : filteredLeads.length === 0 ? (
          <p className="text-sm text-zinc-500 py-12 text-center">
            {searchQuery || statusFilter !== 'all' || countryFilter !== 'all' || priorityFilter !== 'all'
              ? 'No leads match your filters.'
              : 'No workforce requests yet.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950/50">
                  <th className="text-left py-3 px-3 text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
                    Priority
                  </th>
                  <th className="text-left py-3 px-3 text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
                    Company
                  </th>
                  <th className="text-left py-3 px-3 text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
                    Country
                  </th>
                  <th className="text-left py-3 px-3 text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
                    Workers
                  </th>
                  <th className="text-left py-3 px-3 text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
                    Date
                  </th>
                  <th className="text-left py-3 px-3 text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
                    Status
                  </th>
                  <th className="text-left py-3 px-3 text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map((lead) => (
                  <tr
                    key={lead.id}
                    className={`border-b border-zinc-800/50 hover:bg-zinc-900/50 transition cursor-pointer ${
                      lead.archived ? 'opacity-50' : ''
                    }`}
                    onClick={() => openLead(lead)}
                  >
                    <td className="py-3 px-3">
                      {getPriorityBadge(lead.priority, lead.number_of_workers, lead.start_date)}
                    </td>
                    <td className="py-3 px-3">
                      <div>
                        <p className="text-zinc-200 font-medium">{lead.company_name}</p>
                        <p className="text-xs text-zinc-500">
                          {lead.contact_person} · {lead.email}
                        </p>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="flex items-center gap-1.5 text-zinc-300">
                        <Globe className="h-3 w-3 text-zinc-500" />
                        {lead.country}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="flex items-center gap-1.5 text-zinc-300">
                        <HardHat className="h-3 w-3 text-zinc-500" />
                        {lead.workers_needed}
                        {lead.number_of_workers && (
                          <span className="text-zinc-500 text-xs">({lead.number_of_workers})</span>
                        )}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="flex items-center gap-1.5 text-zinc-400 text-xs">
                        <Calendar className="h-3 w-3 text-zinc-500" />
                        {new Date(lead.created_at).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={lead.status || 'new'}
                        onChange={(e) => updateStatus(lead.id, e.target.value)}
                        className={`text-xs px-2 py-1 rounded border ${getStatusConfig(lead.status || 'new').color} bg-transparent cursor-pointer focus:outline-none`}
                      >
                        {STATUSES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => copyEmail(lead.email)}
                          className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition"
                          title="Copy email"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <a
                          href={`mailto:${lead.email}`}
                          className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition"
                          title="Send email"
                        >
                          <Mail className="h-3.5 w-3.5" />
                        </a>
                        <button
                          onClick={() => archiveLead(lead.id)}
                          className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-red-400 transition"
                          title="Archive"
                        >
                          <Archive className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Lead Detail Slide-over */}
      {selectedLead && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSelectedLead(null)}
          />
          <div className="relative w-full max-w-lg bg-[#0a0a0a] border-l border-zinc-800 overflow-y-auto animate-in slide-in-from-right">
            {/* Detail Header */}
            <div className="sticky top-0 bg-[#0a0a0a] border-b border-zinc-800 p-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-sm bg-[#f59e0b]/10">
                  <Building2 className="h-4 w-4 text-[#f59e0b]" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">
                    {selectedLead.company_name}
                  </h3>
                  <p className="text-xs text-zinc-500">{selectedLead.contact_person}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedLead(null)}
                className="p-2 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 space-y-6">
              {/* Priority & Status */}
              <div className="flex items-center gap-3">
                {getPriorityBadge(
                  selectedLead.priority,
                  selectedLead.number_of_workers,
                  selectedLead.start_date
                )}
                <select
                  value={selectedLead.status || 'new'}
                  onChange={(e) => updateStatus(selectedLead.id, e.target.value)}
                  className={`text-xs px-2 py-1 rounded border ${getStatusConfig(selectedLead.status || 'new').color} bg-transparent cursor-pointer focus:outline-none`}
                >
                  {STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Quick Actions */}
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium">
                  Quick Actions
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => copyEmail(selectedLead.email)}
                    className="flex items-center gap-2 px-3 py-2 text-xs bg-zinc-900 border border-zinc-800 rounded-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition"
                  >
                    <Copy className="h-3.5 w-3.5 text-zinc-500" />
                    Copy Email
                  </button>
                  <a
                    href={`mailto:${selectedLead.email}`}
                    className="flex items-center gap-2 px-3 py-2 text-xs bg-zinc-900 border border-zinc-800 rounded-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition"
                  >
                    <Mail className="h-3.5 w-3.5 text-zinc-500" />
                    Contact Company
                  </a>
                  <button
                    onClick={() => updateStatus(selectedLead.id, 'contacted')}
                    className="flex items-center gap-2 px-3 py-2 text-xs bg-zinc-900 border border-zinc-800 rounded-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-zinc-500" />
                    Mark Contacted
                  </button>
                  <button
                    onClick={() => archiveLead(selectedLead.id)}
                    className="flex items-center gap-2 px-3 py-2 text-xs bg-zinc-900 border border-red-900/50 rounded-sm text-red-400 hover:bg-red-950/50 transition"
                  >
                    <Archive className="h-3.5 w-3.5" />
                    Archive Lead
                  </button>
                </div>
              </div>

              {/* Lead Details */}
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium">
                  Lead Details
                </p>
                <div className="border border-zinc-800 rounded-sm divide-y divide-zinc-800">
                  <DetailRow
                    icon={<Building2 className="h-3.5 w-3.5" />}
                    label="Company"
                    value={selectedLead.company_name}
                  />
                  <DetailRow
                    icon={<Users className="h-3.5 w-3.5" />}
                    label="Contact"
                    value={selectedLead.contact_person}
                  />
                  <DetailRow
                    icon={<Mail className="h-3.5 w-3.5" />}
                    label="Email"
                    value={selectedLead.email}
                    isLink
                  />
                  <DetailRow
                    icon={<Globe className="h-3.5 w-3.5" />}
                    label="Country"
                    value={selectedLead.country}
                  />
                  <DetailRow
                    icon={<HardHat className="h-3.5 w-3.5" />}
                    label="Workers Type"
                    value={selectedLead.workers_needed}
                  />
                  {selectedLead.number_of_workers && (
                    <DetailRow
                      icon={<Users className="h-3.5 w-3.5" />}
                      label="Quantity"
                      value={selectedLead.number_of_workers}
                    />
                  )}
                  {selectedLead.start_date && (
                    <DetailRow
                      icon={<Calendar className="h-3.5 w-3.5" />}
                      label="Start Date"
                      value={selectedLead.start_date}
                    />
                  )}
                  {selectedLead.project_duration && (
                    <DetailRow
                      icon={<Clock className="h-3.5 w-3.5" />}
                      label="Duration"
                      value={selectedLead.project_duration}
                    />
                  )}
                  <DetailRow
                    icon={<Calendar className="h-3.5 w-3.5" />}
                    label="Submitted"
                    value={new Date(selectedLead.created_at).toLocaleString()}
                  />
                </div>
              </div>

              {/* Message */}
              {selectedLead.message && (
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium">
                    Message
                  </p>
                  <div className="border border-zinc-800 rounded-sm p-3 bg-zinc-950">
                    <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                      {selectedLead.message}
                    </p>
                  </div>
                </div>
              )}

              {/* Internal Notes */}
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium flex items-center gap-2">
                  <MessageSquare className="h-3 w-3" />
                  Internal Notes
                </p>
                <textarea
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  placeholder="Add internal notes about this lead..."
                  rows={4}
                  className="w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[#f59e0b] focus:outline-none resize-none"
                />
                <button
                  onClick={saveNotes}
                  disabled={savingNotes}
                  className="px-4 py-1.5 text-xs font-medium bg-[#f59e0b] text-black rounded-sm hover:bg-[#d97706] transition disabled:opacity-50"
                >
                  {savingNotes ? 'Saving...' : 'Save Notes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
  isLink,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  isLink?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5">
      <span className="flex items-center gap-2 text-xs text-zinc-500">
        {icon}
        {label}
      </span>
      {isLink ? (
        <a
          href={`mailto:${value}`}
          className="text-xs text-[#f59e0b] hover:underline truncate max-w-[200px]"
        >
          {value}
        </a>
      ) : (
        <span className="text-xs text-zinc-200 truncate max-w-[200px]">{value}</span>
      )}
    </div>
  );
}