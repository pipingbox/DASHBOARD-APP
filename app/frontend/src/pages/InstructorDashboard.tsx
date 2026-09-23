import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Loader2,
  GraduationCap,
  Wallet,
  Receipt,
  FileText,
  Landmark,
  AlertTriangle,
  Clock,
  CheckCircle2,
  CalendarClock,
} from 'lucide-react';
import { supabase, TABLES } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

/**
 * PB-MARKET-INSTRUCTOR-UI-001 (T8, PO GO 2026-09-23) — instructor dashboard.
 *
 * Sections: Sales, Adjustments, Settlement, Next payout, Documents, Fiscal.
 *
 * HARD RULES:
 *   * NO student PII: sales come from the instructor-safe view
 *     (app_marketplace_revenue_events_instructor), which omits buyer data and
 *     order_id by construction (sql/005).
 *   * Numbers shown for Pending/Available come from the instructor's OWN
 *     ledger rows (RLS). Net Revenue and the instructor share shown in
 *     settlements/documents are the FROZEN settlement values — this page
 *     never recomputes a split (the canonical formula lives in the DB,
 *     sql/014; a second implementation here would be a defect).
 *   * Profile edits never modify historical documents: settlements and
 *     self-billing invoices carry immutable snapshots (PO, T7).
 *   * DAC7: no automatic reporting in MVP. The classification gate only
 *     SURFACES a reassessment flag when the instructor teaches anything
 *     other than recorded courses (PO, section 4).
 *   * i18n: new keys avoided (PremiumGate precedent) — English fallback text.
 */

interface InstructorRow {
  id: string;
  instructor_status: string;
  display_name: string | null;
  legal_name: string | null;
  legal_form: string | null;
  tax_country: string | null;
  vat_number: string | null;
  legal_address: string | null;
  iban: string | null;
  revenue_share_tier: string | null;
}

interface SaleRow {
  id: string;
  course_id: string | null;
  event_type: string;
  occurred_at: string;
  currency: string;
  gross_amount_cents: number | null;
  tax_amount_cents: number | null;
  discount_amount_cents: number | null;
  stripe_fee_cents: number | null;
}

interface LedgerRow {
  id: string;
  entry_type: string;
  status: string;
  amount_cents: number;
  currency: string;
  occurred_at: string;
  available_at: string | null;
}

interface SettlementRow {
  id: string;
  period_start: string;
  period_end: string;
  status: string;
  currency: string;
  net_revenue_cents: number;
  instructor_share_cents: number;
  offset_applied_cents: number;
  payable_cents: number;
  paid_at: string | null;
}

interface SelfBillingRow {
  id: string;
  invoice_number: string;
  status: string;
  payable_cents: number;
  currency: string;
  issued_at: string | null;
  created_at: string;
  pdf_path: string | null;
}

function eur(cents: number | null | undefined, currency = 'EUR'): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency }).format(cents / 100);
}

function day(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : '—';
}

export default function InstructorDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [instructor, setInstructor] = useState<InstructorRow | null>(null);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [settlements, setSettlements] = useState<SettlementRow[]>([]);
  const [documents, setDocuments] = useState<SelfBillingRow[]>([]);
  // DAC7 reassessment gate: true when any taught course is NOT a recorded
  // digital course (live / 1-to-1 / personalised). Surfaced as a flag only —
  // it blocks nothing (PO, section 4).
  const [dac7Reassess, setDac7Reassess] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data: instr } = await supabase
      .from(TABLES.marketplaceInstructors)
      .select('id, instructor_status, display_name, legal_name, legal_form, tax_country, vat_number, legal_address, iban, revenue_share_tier')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!instr) {
      setInstructor(null);
      setLoading(false);
      return;
    }
    const row = instr as InstructorRow;
    setInstructor(row);

    const [salesRes, ledgerRes, settlementsRes, docsRes, coursesRes] = await Promise.all([
      // Instructor-safe view: no student PII by construction.
      supabase
        .from(TABLES.marketplaceRevenueEventsInstructor)
        .select('id, course_id, event_type, occurred_at, currency, gross_amount_cents, tax_amount_cents, discount_amount_cents, stripe_fee_cents')
        .eq('instructor_id', row.id)
        .order('occurred_at', { ascending: false })
        .limit(50),
      supabase
        .from(TABLES.instructorLedgerEntries)
        .select('id, entry_type, status, amount_cents, currency, occurred_at, available_at')
        .eq('instructor_id', row.id)
        .order('occurred_at', { ascending: false })
        .limit(100),
      supabase
        .from(TABLES.settlements)
        .select('id, period_start, period_end, status, currency, net_revenue_cents, instructor_share_cents, offset_applied_cents, payable_cents, paid_at')
        .eq('instructor_id', row.id)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from(TABLES.selfBillingInvoices)
        .select('id, invoice_number, status, payable_cents, currency, issued_at, created_at, pdf_path')
        .eq('instructor_id', row.id)
        .order('created_at', { ascending: false })
        .limit(20),
      // DAC7 gate: any course that is not 'pregrabado' flags reassessment.
      supabase
        .from(TABLES.academyCourses)
        .select('id')
        .eq('instructor_id', row.id)
        .neq('fiscal_nature', 'pregrabado')
        .limit(1),
    ]);

    setSales((salesRes.data as SaleRow[]) ?? []);
    setLedger((ledgerRes.data as LedgerRow[]) ?? []);
    setSettlements((settlementsRes.data as SettlementRow[]) ?? []);
    setDocuments((docsRes.data as SelfBillingRow[]) ?? []);
    setDac7Reassess((coursesRes.data?.length ?? 0) > 0);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 text-[#f59e0b] animate-spin" />
      </div>
    );
  }

  if (!instructor) {
    return (
      <div className="text-center py-24 space-y-3">
        <GraduationCap className="h-10 w-10 text-zinc-700 mx-auto" />
        <p className="text-sm text-zinc-400">
          {t('instructor.notRegistered', 'You are not registered as an instructor yet.')}
        </p>
        <p className="text-xs text-zinc-600">
          {t('instructor.contactToJoin', 'Contact hello@pipingbox.com to become a content provider.')}
        </p>
      </div>
    );
  }

  // Settlement summary from the instructor's own ledger rows.
  const pendingCents = ledger
    .filter((l) => l.status === 'PENDING')
    .reduce((s, l) => s + l.amount_cents, 0);
  const availableCents = ledger
    .filter((l) => l.status === 'AVAILABLE')
    .reduce((s, l) => s + l.amount_cents, 0);
  const nextScheduled = settlements.find((s) => s.status === 'SCHEDULED') ?? null;
  const nextMaturity = ledger
    .filter((l) => l.status === 'PENDING' && l.available_at)
    .map((l) => l.available_at as string)
    .sort()[0] ?? null;
  const adjustments = ledger.filter((l) => l.entry_type !== 'SALE_CREDIT');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-[#f59e0b]/10 border border-[#f59e0b]/30">
            <GraduationCap className="h-5 w-5 text-[#f59e0b]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-100">
              {t('instructor.dashboard', 'Instructor dashboard')}
            </h1>
            <p className="text-xs text-zinc-500">
              {instructor.display_name ?? instructor.legal_name ?? ''} ·{' '}
              {instructor.revenue_share_tier ?? 'STANDARD'} · {instructor.instructor_status}
            </p>
          </div>
        </div>
      </div>

      {/* DAC7 reassessment gate (flag only, blocks nothing) */}
      {dac7Reassess && (
        <div className="border border-amber-500/30 bg-amber-500/5 rounded-sm p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-300">DAC7_REASSESS_REQUIRED</p>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              {t(
                'instructor.dac7Reassess',
                'At least one of your courses is not a recorded digital course (live, 1-to-1 or personalised service). DAC7 reportability must be reassessed for this activity. This flag does not block anything.',
              )}
            </p>
          </div>
        </div>
      )}

      {/* Settlement summary + next payout */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-4 space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 flex items-center gap-1">
            <Clock className="h-3 w-3" /> {t('instructor.pending', 'Pending (T+30)')}
          </p>
          <p className="text-lg font-bold text-zinc-100">{eur(pendingCents)}</p>
          {nextMaturity && (
            <p className="text-[10px] text-zinc-600">
              {t('instructor.nextMaturity', 'next matures')} {day(nextMaturity)}
            </p>
          )}
        </div>
        <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-4 space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 flex items-center gap-1">
            <Wallet className="h-3 w-3" /> {t('instructor.available', 'Available')}
          </p>
          <p className="text-lg font-bold text-zinc-100">{eur(availableCents)}</p>
        </div>
        <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-4 space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 flex items-center gap-1">
            <CalendarClock className="h-3 w-3" /> {t('instructor.nextPayout', 'Next payout')}
          </p>
          <p className="text-lg font-bold text-[#f59e0b]">
            {nextScheduled ? eur(nextScheduled.payable_cents, nextScheduled.currency) : '—'}
          </p>
          {nextScheduled && (
            <p className="text-[10px] text-zinc-600">{day(nextScheduled.period_end)}</p>
          )}
        </div>
        <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-4 space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> {t('instructor.paidTotal', 'Paid')}
          </p>
          <p className="text-lg font-bold text-emerald-400">
            {eur(
              settlements
                .filter((s) => s.status === 'PAID')
                .reduce((sum, s) => sum + s.payable_cents, 0),
            )}
          </p>
        </div>
      </div>

      {/* Sales */}
      <section className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm overflow-hidden">
        <header className="p-4 border-b border-zinc-800/60 flex items-center gap-2">
          <Receipt className="h-4 w-4 text-[#f59e0b]" />
          <h2 className="text-sm font-semibold text-zinc-200">
            {t('instructor.sales', 'Sales')}
          </h2>
        </header>
        {sales.length === 0 ? (
          <p className="p-4 text-xs text-zinc-600">{t('instructor.noSales', 'No sales yet.')}</p>
        ) : (
          <div className="divide-y divide-zinc-800/50">
            {sales.map((s) => (
              <div key={s.id} className="flex items-center gap-3 p-3 text-xs">
                <span className="text-zinc-500 w-20 shrink-0">{day(s.occurred_at)}</span>
                <span className={`w-24 shrink-0 ${s.event_type === 'SALE' ? 'text-zinc-300' : 'text-red-400'}`}>
                  {s.event_type}
                </span>
                <span className="flex-1 text-zinc-600 truncate">{s.course_id ?? ''}</span>
                <span className="text-zinc-200 font-medium">{eur(s.gross_amount_cents, s.currency)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Adjustments */}
      <section className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm overflow-hidden">
        <header className="p-4 border-b border-zinc-800/60 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <h2 className="text-sm font-semibold text-zinc-200">
            {t('instructor.adjustments', 'Adjustments (refunds, chargebacks, offsets)')}
          </h2>
        </header>
        {adjustments.length === 0 ? (
          <p className="p-4 text-xs text-zinc-600">
            {t('instructor.noAdjustments', 'No adjustments.')}
          </p>
        ) : (
          <div className="divide-y divide-zinc-800/50">
            {adjustments.map((a) => (
              <div key={a.id} className="flex items-center gap-3 p-3 text-xs">
                <span className="text-zinc-500 w-20 shrink-0">{day(a.occurred_at)}</span>
                <span className="w-28 shrink-0 text-amber-300">{a.entry_type}</span>
                <span className="flex-1 text-zinc-600">{a.status}</span>
                <span className="text-red-400 font-medium">{eur(a.amount_cents, a.currency)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Settlements */}
      <section className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm overflow-hidden">
        <header className="p-4 border-b border-zinc-800/60 flex items-center gap-2">
          <Landmark className="h-4 w-4 text-[#f59e0b]" />
          <h2 className="text-sm font-semibold text-zinc-200">
            {t('instructor.settlements', 'Settlements')}
          </h2>
        </header>
        {settlements.length === 0 ? (
          <p className="p-4 text-xs text-zinc-600">
            {t('instructor.noSettlements', 'No settlements yet.')}
          </p>
        ) : (
          <div className="divide-y divide-zinc-800/50">
            {settlements.map((s) => (
              <div key={s.id} className="flex items-center gap-3 p-3 text-xs">
                <span className="text-zinc-500 shrink-0">
                  {day(s.period_start)} → {day(s.period_end)}
                </span>
                <span
                  className={`w-20 shrink-0 ${
                    s.status === 'PAID' ? 'text-emerald-400' : 'text-amber-300'
                  }`}
                >
                  {s.status}
                </span>
                <span className="flex-1 text-zinc-600">
                  NCR {eur(s.net_revenue_cents, s.currency)}
                  {s.offset_applied_cents > 0 && ` · offset −${eur(s.offset_applied_cents, s.currency)}`}
                </span>
                <span className="text-zinc-200 font-medium">
                  {eur(s.instructor_share_cents, s.currency)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Documents */}
      <section className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm overflow-hidden">
        <header className="p-4 border-b border-zinc-800/60 flex items-center gap-2">
          <FileText className="h-4 w-4 text-[#f59e0b]" />
          <h2 className="text-sm font-semibold text-zinc-200">
            {t('instructor.documents', 'Self-billing invoices')}
          </h2>
        </header>
        {documents.length === 0 ? (
          <p className="p-4 text-xs text-zinc-600">
            {t('instructor.noDocuments', 'No documents yet.')}
          </p>
        ) : (
          <div className="divide-y divide-zinc-800/50">
            {documents.map((d) => (
              <div key={d.id} className="flex items-center gap-3 p-3 text-xs">
                <span className="text-zinc-300 font-mono shrink-0">{d.invoice_number}</span>
                <span className="w-16 shrink-0 text-zinc-500">{d.status}</span>
                <span className="flex-1 text-zinc-600">{day(d.issued_at ?? d.created_at)}</span>
                <span className="text-zinc-200 font-medium">{eur(d.payable_cents, d.currency)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Fiscal / account (snapshot note) */}
      <section className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-4 space-y-2">
        <h2 className="text-sm font-semibold text-zinc-200">
          {t('instructor.fiscal', 'Fiscal / account data')}
        </h2>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-xs">
          <div className="flex gap-2">
            <dt className="text-zinc-600 w-28">{t('instructor.legalName', 'Legal name')}</dt>
            <dd className="text-zinc-300">{instructor.legal_name ?? '—'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-zinc-600 w-28">{t('instructor.legalForm', 'Legal form')}</dt>
            <dd className="text-zinc-300">{instructor.legal_form ?? '—'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-zinc-600 w-28">{t('instructor.taxCountry', 'Tax residence')}</dt>
            <dd className="text-zinc-300">{instructor.tax_country ?? '—'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-zinc-600 w-28">{t('instructor.vatId', 'VAT ID')}</dt>
            <dd className="text-zinc-300">{instructor.vat_number ?? '—'}</dd>
          </div>
        </dl>
        <p className="text-[10px] text-zinc-600 leading-relaxed pt-1">
          {t(
            'instructor.snapshotNote',
            'Changes to your profile never modify historical settlements or invoices: every document keeps an immutable snapshot of the data that was true when it was issued. To update fiscal or bank data, contact hello@pipingbox.com.',
          )}
        </p>
        <p className="text-[10px] text-zinc-600">
          <Link to="/legal" className="text-zinc-500 hover:text-zinc-300 underline">
            {t('instructor.legalNotice', 'Legal notice')}
          </Link>
        </p>
      </section>
    </div>
  );
}
