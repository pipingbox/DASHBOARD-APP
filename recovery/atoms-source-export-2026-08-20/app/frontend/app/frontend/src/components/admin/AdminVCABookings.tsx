import { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  Search,
  Mail,
  Phone,
  MapPin,
  User,
  RefreshCw,
  Filter,
  ExternalLink,
  Save,
  AlertCircle,
  Euro,
  TrendingUp,
} from 'lucide-react';
import { supabase, TABLES } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

/* ─── Admin VCA Bookings Panel (Fase 2) ───
 * Internal panel for managing VCA exam booking requests.
 *
 * Features:
 * - List all booking requests with filters (status, exam type, date)
 * - View booking details + assigned center
 * - Update booking status (pending → confirmed → completed / cancelled)
 * - Assign exam center to booking
 * - Mark fee as paid
 * - Add admin notes
 * - Search by name, email, postal code
 * - Stats: total bookings, pending, confirmed, revenue (fees)
 */

interface VCABooking {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  user_phone: string | null;
  postal_code: string;
  exam_type: 'B-VCA' | 'VOL-VCA';
  exam_language: string;
  preferred_date: string | null;
  booking_mode: 'exam_only' | 'course_plus_exam';
  fee_type: 'standard' | 'urgent';
  fee_amount_eur: number;
  fee_paid: boolean;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  assigned_center_id: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

interface ExamCenter {
  id: string;
  name: string;
  city: string;
  exam_price_eur: number;
}

type StatusFilter = 'all' | 'pending' | 'confirmed' | 'completed' | 'cancelled';

const STATUS_CONFIG = {
  pending: { label: 'Pending', icon: Clock, color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  confirmed: { label: 'Confirmed', icon: CheckCircle2, color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
  completed: { label: 'Completed', icon: CheckCircle2, color: 'text-green-400 bg-green-500/10 border-green-500/30' },
  cancelled: { label: 'Cancelled', icon: XCircle, color: 'text-red-400 bg-red-500/10 border-red-500/30' },
} as const;

export function AdminVCABookings() {
  const [bookings, setBookings] = useState<VCABooking[]>([]);
  const [centers, setCenters] = useState<ExamCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [examTypeFilter, setExamTypeFilter] = useState<'all' | 'B-VCA' | 'VOL-VCA'>('all');
  const [selectedBooking, setSelectedBooking] = useState<VCABooking | null>(null);
  const [saving, setSaving] = useState(false);
  const [editNotes, setEditNotes] = useState('');
  const [editCenter, setEditCenter] = useState('');
  const [editStatus, setEditStatus] = useState<VCABooking['status']>('pending');
  const [editFeePaid, setEditFeePaid] = useState(false);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from(TABLES.vcaBookings)
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[AdminVCA] Error fetching bookings:', error);
      toast.error('Failed to load bookings');
    }
    setBookings((data as VCABooking[]) ?? []);
    setLoading(false);
  }, []);

  const fetchCenters = useCallback(async () => {
    const { data } = await supabase
      .from(TABLES.vcaExamCenters)
      .select('id, name, city, exam_price_eur')
      .eq('is_active', true)
      .order('city');
    setCenters((data as ExamCenter[]) ?? []);
  }, []);

  useEffect(() => {
    fetchBookings();
    fetchCenters();
  }, [fetchBookings, fetchCenters]);

  const filteredBookings = bookings.filter((b) => {
    if (statusFilter !== 'all' && b.status !== statusFilter) return false;
    if (examTypeFilter !== 'all' && b.exam_type !== examTypeFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      b.user_name?.toLowerCase().includes(q) ||
      b.user_email?.toLowerCase().includes(q) ||
      b.postal_code?.toLowerCase().includes(q)
    );
  });

  // Stats
  const stats = {
    total: bookings.length,
    pending: bookings.filter((b) => b.status === 'pending').length,
    confirmed: bookings.filter((b) => b.status === 'confirmed').length,
    completed: bookings.filter((b) => b.status === 'completed').length,
    cancelled: bookings.filter((b) => b.status === 'cancelled').length,
    revenue: bookings
      .filter((b) => b.fee_paid && b.status !== 'cancelled')
      .reduce((sum, b) => sum + b.fee_amount_eur, 0),
    pendingFees: bookings
      .filter((b) => !b.fee_paid && b.status !== 'cancelled')
      .reduce((sum, b) => sum + b.fee_amount_eur, 0),
  };

  const openDetail = (booking: VCABooking) => {
    setSelectedBooking(booking);
    setEditNotes(booking.admin_notes ?? '');
    setEditCenter(booking.assigned_center_id ?? '');
    setEditStatus(booking.status);
    setEditFeePaid(booking.fee_paid);
  };

  const saveChanges = async () => {
    if (!selectedBooking) return;
    setSaving(true);
    const { error } = await supabase
      .from(TABLES.vcaBookings)
      .update({
        status: editStatus,
        assigned_center_id: editCenter || null,
        fee_paid: editFeePaid,
        admin_notes: editNotes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', selectedBooking.id);

    setSaving(false);

    if (error) {
      toast.error('Failed to update booking', { description: error.message });
      return;
    }

    toast.success('Booking updated');
    setSelectedBooking(null);
    fetchBookings();
  };

  const assignedCenter = centers.find((c) => c.id === selectedBooking?.assigned_center_id);
  const editCenterObj = centers.find((c) => c.id === editCenter);

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
        <StatCard label="Total" value={stats.total} icon={Calendar} color="text-zinc-300" />
        <StatCard label="Pending" value={stats.pending} icon={Clock} color="text-amber-400" />
        <StatCard label="Confirmed" value={stats.confirmed} icon={CheckCircle2} color="text-blue-400" />
        <StatCard label="Completed" value={stats.completed} icon={CheckCircle2} color="text-green-400" />
        <StatCard label="Cancelled" value={stats.cancelled} icon={XCircle} color="text-red-400" />
        <StatCard label="Revenue" value={`€${stats.revenue}`} icon={Euro} color="text-green-400" />
        <StatCard label="Pending Fees" value={`€${stats.pendingFees}`} icon={TrendingUp} color="text-amber-400" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-1.5">
          <Search className="h-4 w-4 text-zinc-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, postal code..."
            className="h-7 w-[240px] bg-transparent text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-zinc-500" />
          {(['all', 'pending', 'confirmed', 'completed', 'cancelled'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1 rounded-sm text-[10px] uppercase tracking-wider font-medium transition ${
                statusFilter === s
                  ? 'bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/30'
                  : 'bg-zinc-900 text-zinc-500 border border-zinc-800 hover:text-zinc-300'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          {(['all', 'B-VCA', 'VOL-VCA'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setExamTypeFilter(t)}
              className={`px-2.5 py-1 rounded-sm text-[10px] uppercase tracking-wider font-medium transition ${
                examTypeFilter === t
                  ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                  : 'bg-zinc-900 text-zinc-500 border border-zinc-800 hover:text-zinc-300'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <Button variant="outline" size="sm" onClick={fetchBookings} className="!bg-transparent border-zinc-700 text-zinc-400">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Bookings table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 text-[#f59e0b] animate-spin" />
        </div>
      ) : filteredBookings.length === 0 ? (
        <div className="border border-zinc-800/60 bg-[#0d0d0d] rounded-sm p-8 text-center">
          <Calendar className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
          <p className="text-xs text-zinc-500">No VCA bookings found.</p>
        </div>
      ) : (
        <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-[10px] uppercase tracking-wider text-zinc-500">
                  <th className="text-left p-3 font-medium">User</th>
                  <th className="text-left p-3 font-medium">Exam</th>
                  <th className="text-left p-3 font-medium">Date</th>
                  <th className="text-left p-3 font-medium">Fee</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium">Created</th>
                  <th className="text-right p-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredBookings.map((b) => {
                  const StatusIcon = STATUS_CONFIG[b.status].icon;
                  return (
                    <tr
                      key={b.id}
                      className="border-b border-zinc-800/50 hover:bg-zinc-900/30 transition cursor-pointer"
                      onClick={() => openDetail(b)}
                    >
                      <td className="p-3">
                        <p className="text-zinc-200 font-medium">{b.user_name}</p>
                        <p className="text-[10px] text-zinc-500">{b.user_email}</p>
                      </td>
                      <td className="p-3">
                        <span className={`px-1.5 py-0.5 text-[9px] rounded-sm ${
                          b.exam_type === 'B-VCA' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'
                        }`}>
                          {b.exam_type}
                        </span>
                        <span className="ml-1 text-[10px] text-zinc-500">{b.exam_language}</span>
                        <p className="text-[10px] text-zinc-600 mt-0.5">
                          {b.booking_mode === 'exam_only' ? 'Exam only' : 'Course + exam'}
                        </p>
                      </td>
                      <td className="p-3 text-zinc-400">
                        {b.preferred_date ? new Date(b.preferred_date).toLocaleDateString() : '—'}
                      </td>
                      <td className="p-3">
                        <span className={b.fee_paid ? 'text-green-400' : 'text-amber-400'}>
                          €{b.fee_amount_eur}
                        </span>
                        <span className="text-[9px] text-zinc-600 block">
                          {b.fee_type}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm border text-[10px] ${STATUS_CONFIG[b.status].color}`}>
                          <StatusIcon className="h-3 w-3" />
                          {STATUS_CONFIG[b.status].label}
                        </span>
                      </td>
                      <td className="p-3 text-[10px] text-zinc-500">
                        {new Date(b.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-3 text-right">
                        <span className="text-[#f59e0b] hover:underline text-[10px]">Manage →</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-zinc-800/50">
            {filteredBookings.map((b) => {
              const StatusIcon = STATUS_CONFIG[b.status].icon;
              return (
                <button
                  key={b.id}
                  onClick={() => openDetail(b)}
                  className="w-full text-left p-4 hover:bg-zinc-900/30 transition"
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-zinc-200">{b.user_name}</p>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm border text-[10px] ${STATUS_CONFIG[b.status].color}`}>
                      <StatusIcon className="h-3 w-3" />
                      {STATUS_CONFIG[b.status].label}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[10px] text-zinc-500">
                    <span className={`px-1.5 py-0.5 rounded-sm ${b.exam_type === 'B-VCA' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'}`}>
                      {b.exam_type}
                    </span>
                    <span>{b.exam_language}</span>
                    <span>€{b.fee_amount_eur} {b.fee_paid ? '✓' : '⚠'}</span>
                    <span>{new Date(b.created_at).toLocaleDateString()}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Detail modal */}
      {selectedBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSelectedBooking(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-2xl bg-[#0a0a0a] border border-zinc-800 rounded-sm shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-zinc-800">
              <div>
                <h3 className="text-sm font-semibold text-zinc-100">Booking Details</h3>
                <p className="text-[10px] text-zinc-500">ID: {selectedBooking.id.slice(0, 8)}</p>
              </div>
              <button onClick={() => setSelectedBooking(null)} className="text-zinc-500 hover:text-zinc-300">
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-5">
              {/* User info */}
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailField icon={User} label="Name" value={selectedBooking.user_name} />
                <DetailField icon={Mail} label="Email" value={selectedBooking.user_email} />
                <DetailField icon={Phone} label="Phone" value={selectedBooking.user_phone ?? '—'} />
                <DetailField icon={MapPin} label="Postal Code" value={selectedBooking.postal_code} />
              </div>

              {/* Exam info */}
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailField icon={Calendar} label="Exam Type" value={selectedBooking.exam_type} />
                <DetailField icon={Calendar} label="Language" value={selectedBooking.exam_language} />
                <DetailField
                  icon={Calendar}
                  label="Preferred Date"
                  value={selectedBooking.preferred_date ? new Date(selectedBooking.preferred_date).toLocaleDateString() : 'No preference'}
                />
                <DetailField
                  icon={Calendar}
                  label="Mode"
                  value={selectedBooking.booking_mode === 'exam_only' ? 'Exam Only' : 'Course + Exam'}
                />
              </div>

              {/* Fee info */}
              <div className="grid gap-3 sm:grid-cols-3">
                <DetailField icon={Euro} label="Fee Amount" value={`€${selectedBooking.fee_amount_eur}`} />
                <DetailField icon={Euro} label="Fee Type" value={selectedBooking.fee_type} />
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="feePaid"
                    checked={editFeePaid}
                    onChange={(e) => setEditFeePaid(e.target.checked)}
                    className="h-4 w-4 accent-[#f59e0b]"
                  />
                  <label htmlFor="feePaid" className="text-xs text-zinc-300">Fee Paid</label>
                </div>
              </div>

              {/* Editable: Status */}
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-medium">Status</label>
                <div className="flex gap-2">
                  {(['pending', 'confirmed', 'completed', 'cancelled'] as const).map((s) => {
                    const StatusIcon = STATUS_CONFIG[s].icon;
                    return (
                      <button
                        key={s}
                        onClick={() => setEditStatus(s)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm border text-[10px] font-medium transition ${
                          editStatus === s
                            ? STATUS_CONFIG[s].color
                            : 'bg-zinc-900 border-zinc-800 text-zinc-500'
                        }`}
                      >
                        <StatusIcon className="h-3 w-3" />
                        {STATUS_CONFIG[s].label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Editable: Assigned center */}
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-medium">Assigned Center</label>
                <select
                  value={editCenter}
                  onChange={(e) => setEditCenter(e.target.value)}
                  className="w-full rounded-sm border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 focus:border-[#f59e0b] focus:outline-none"
                >
                  <option value="">— No center assigned —</option>
                  {centers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.city} (€{c.exam_price_eur})
                    </option>
                  ))}
                </select>
                {editCenterObj && (
                  <p className="text-[10px] text-zinc-500">
                    Exam fee at center: €{editCenterObj.exam_price_eur} (paid by student directly to center)
                  </p>
                )}
              </div>

              {/* Editable: Admin notes */}
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-medium">Admin Notes</label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Internal notes (not visible to user). e.g., 'Called center, confirmed slot for 15/08. Student prefers morning.'"
                  rows={3}
                  className="w-full rounded-sm border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-[#f59e0b] focus:outline-none resize-none"
                />
              </div>

              {/* Timestamps */}
              <div className="flex items-center justify-between text-[10px] text-zinc-600 border-t border-zinc-800 pt-3">
                <span>Created: {new Date(selectedBooking.created_at).toLocaleString()}</span>
                <span>Updated: {new Date(selectedBooking.updated_at).toLocaleString()}</span>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between p-5 border-t border-zinc-800">
              <a
                href={`mailto:${selectedBooking.user_email}?subject=VCA Exam Booking — ${selectedBooking.exam_type}&body=Hi ${selectedBooking.user_name},%0D%0A%0D%0AYour VCA exam booking is being processed.%0D%0AExam: ${selectedBooking.exam_type}%0D%0ALanguage: ${selectedBooking.exam_language}%0D%0APreferred date: ${selectedBooking.preferred_date ?? 'flexible'}%0D%0A%0D%0AWe will confirm your slot within 24-48h.%0D%0A%0D%0APipingBox Team`}
                className="flex items-center gap-1.5 text-xs text-blue-400 hover:underline"
              >
                <Mail className="h-3.5 w-3.5" />
                Email user
              </a>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedBooking(null)} className="!bg-transparent border-zinc-700 text-zinc-400">
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={saveChanges}
                  disabled={saving}
                  className="bg-[#f59e0b] text-black hover:bg-[#d97706]"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-3.5 w-3.5 mr-1" /> Save</>}
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

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: React.ElementType; color: string }) {
  return (
    <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-3 space-y-1">
      <div className="flex items-center justify-between">
        <Icon className={`h-3.5 w-3.5 ${color}`} />
        <span className="text-[9px] uppercase tracking-wider text-zinc-600">{label}</span>
      </div>
      <p className="text-lg font-bold text-zinc-100">{value}</p>
    </div>
  );
}

function DetailField({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-medium">{label}</p>
      <p className="flex items-center gap-1.5 text-xs text-zinc-200">
        <Icon className="h-3.5 w-3.5 text-zinc-600" />
        {value}
      </p>
    </div>
  );
}
