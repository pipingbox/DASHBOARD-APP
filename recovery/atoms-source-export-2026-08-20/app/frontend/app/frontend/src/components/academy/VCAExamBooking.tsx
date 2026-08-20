import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MapPin,
  AlertCircle,
  Loader2,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase, TABLES } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

/* ─── VCA Exam Booking (Fase 2 — generic certification engine, DEC-51) ───
 * Source: 02-PRODUCT/CERTIFICATION_PLATFORM_STRATEGY.md
 *
 * Reads from app_certifications + app_certification_exam_centers (generic).
 * Writes to app_certification_bookings (generic).
 *
 * Flow:
 * 1. User enters postal code + exam type (B-VCA / VOL-VCA) + language + date
 * 2. System shows nearby official VCA exam centers (filtered by certification_id)
 * 3. User selects booking mode: exam only OR course + exam
 * 4. User selects fee type: standard (€10) OR urgent (€15)
 * 5. User submits booking request
 * 6. PipingBox manages the reservation manually (WhatsApp/email)
 * 7. User receives confirmation
 *
 * Pricing is TRANSPARENT: official exam fee (paid to center) and PipingBox
 * management fee are shown as separate line items.
 *
 * LEGAL: PipingBox does NOT issue VCA certificates.
 * "PipingBox prepara al alumno y gestiona la reserva del examen oficial
 *  en centros reconocidos."
 */

interface Certification {
  id: string;
  country_code: string;
  code: string;
  variant: string;
  name: string;
  type: 'exam_based' | 'training_based';
  issuing_body: string;
  languages: string[];
  syllabus_version: string | null;
  official_url: string | null;
}

interface ExamCenter {
  id: string;
  certification_id: string;
  center_name: string;
  city: string;
  postal_code: string | null;
  address: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  languages_offered: string[];
  variants_offered: string[];
  exam_price_cents: number;
  course_plus_exam_price_cents: number;
  online_available: boolean;
  onsite_available: boolean;
}

const EXAM_LANGUAGES = ['NL', 'FR', 'EN', 'ES', 'PT', 'DE'];

export function VCAExamBooking() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [certs, setCerts] = useState<Certification[]>([]);
  const [centers, setCenters] = useState<ExamCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [examType, setExamType] = useState<'B-VCA' | 'VOL-VCA'>('B-VCA');
  const [examLanguage, setExamLanguage] = useState('EN');
  const [preferredDate, setPreferredDate] = useState('');
  const [bookingMode, setBookingMode] = useState<'exam_only' | 'course_plus_exam'>('exam_only');
  const [feeType, setFeeType] = useState<'standard' | 'urgent'>('standard');
  const [userName, setUserName] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [selectedCenter, setSelectedCenter] = useState<ExamCenter | null>(null);

  // Resolve the active certification id (BE B-VCA / BE VOL-VCA)
  const activeCertId =
    certs.find((c) => c.country_code === 'BE' && c.code === 'VCA' && c.variant === examType)?.id ??
    certs.find((c) => c.code === 'VCA' && c.variant === examType)?.id ??
    null;

  useEffect(() => {
    fetchCertifications();
    if (user) {
      setUserName(user.email ?? '');
    }
  }, [user]);

  useEffect(() => {
    if (activeCertId) {
      fetchCenters(activeCertId);
    } else {
      setCenters([]);
    }
  }, [activeCertId]);

  const fetchCertifications = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from(TABLES.certifications)
      .select('id, country_code, code, variant, name, type, issuing_body, languages, syllabus_version, official_url')
      .eq('code', 'VCA')
      .eq('is_active', true)
      .order('country_code', { ascending: true });
    if (error) {
      console.error('[Cert Booking] Error fetching certifications:', error);
    }
    setCerts((data as Certification[]) ?? []);
    setLoading(false);
  };

  const fetchCenters = async (certId: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from(TABLES.certificationExamCenters)
      .select('id, certification_id, center_name, city, postal_code, address, website, phone, email, languages_offered, variants_offered, exam_price_cents, course_plus_exam_price_cents, online_available, onsite_available')
      .eq('certification_id', certId)
      .eq('is_active', true)
      .order('city', { ascending: true });
    if (error) {
      console.error('[Cert Booking] Error fetching centers:', error);
    }
    setCenters((data as ExamCenter[]) ?? []);
    setLoading(false);
  };

  const filteredCenters = centers.filter((c) => {
    if (bookingMode === 'course_plus_exam' && c.course_plus_exam_price_cents === 0) return false;
    if (postalCode && c.postal_code && !c.postal_code.startsWith(postalCode.slice(0, 2))) {
      // Fase 1: simple prefix match on first 2 digits (postal region)
      // Fase 2: proper geolocation distance ranking
    }
    return true;
  });

  const feeAmount = feeType === 'standard' ? 10 : 15;
  const feeAmountCents = feeType === 'standard' ? 1000 : 1500;
  const examPriceEur = selectedCenter ? selectedCenter.exam_price_cents / 100 : null;
  const totalEur = (examPriceEur ?? 0) + feeAmount;

  const handleSubmit = async () => {
    if (!user) {
      toast.error('Please sign in to submit a booking request');
      return;
    }
    if (!userName || !postalCode) {
      toast.error('Please fill in your name and postal code');
      return;
    }
    if (!activeCertId) {
      toast.error('Certification not available. Please try again later.');
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from(TABLES.certificationBookings).insert({
      user_id: user.id,
      certification_id: activeCertId,
      exam_center_id: selectedCenter?.id ?? null,
      user_email: user.email ?? '',
      user_name: userName,
      user_phone: userPhone || null,
      postal_code: postalCode,
      requested_variant: examType,
      requested_language: examLanguage,
      requested_date: preferredDate || null,
      booking_type: feeType === 'urgent' ? 'urgent' : bookingMode,
      exam_price_cents: selectedCenter?.exam_price_cents ?? 0,
      management_fee_cents: feeAmountCents,
      total_cents: (selectedCenter?.exam_price_cents ?? 0) + feeAmountCents,
      status: 'pending',
      notes: null,
    });

    setSubmitting(false);

    if (error) {
      toast.error('Failed to submit booking request', { description: error.message });
      return;
    }

    toast.success('Booking request submitted! PipingBox will contact you within 24h to confirm your exam reservation.');
    setPostalCode('');
    setPreferredDate('');
    setSelectedCenter(null);
  };

  const activeCert = certs.find((c) => c.id === activeCertId);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="VCA Official Exam"
        title="Book Your VCA Exam"
        description="PipingBox prepares you and manages your official VCA exam reservation at recognized centers in Belgium."
        actions={
          <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-zinc-500">
            <ShieldCheck className="h-3.5 w-3.5" />
            Official BESACC/SSVV
          </span>
        }
      />

      {/* Legal Disclaimer */}
      <div className="border border-[#f59e0b]/30 bg-[#f59e0b]/5 rounded-sm p-4 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-[#f59e0b] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-xs font-semibold text-[#f59e0b]">Important — Official Certification</p>
          <p className="text-xs text-zinc-400 leading-relaxed">
            PipingBox does <strong className="text-zinc-300">not</strong> issue VCA certificates. PipingBox prepares you
            with the course and <strong className="text-zinc-300">manages the reservation</strong> of the official exam
            at recognized VCA exam centers. The VCA certificate is issued by SSVV/BESACC through the exam center.
          </p>
          {activeCert?.official_url && (
            <a
              href={activeCert.official_url}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-[10px] text-[#f59e0b] underline underline-offset-2 mt-1"
            >
              Official authority: {activeCert.issuing_body}
            </a>
          )}
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
        {/* Form */}
        <div className="space-y-6">
          {/* Step 1: Exam details */}
          <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-5 space-y-4">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f59e0b] text-[10px] font-bold text-black">1</span>
              <h3 className="text-sm font-semibold text-zinc-200">Exam Details</h3>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-medium">Exam Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['B-VCA', 'VOL-VCA'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setExamType(type)}
                      className={`px-3 py-2.5 rounded-sm border text-xs font-medium transition-all ${
                        examType === type
                          ? 'bg-[#f59e0b]/10 border-[#f59e0b]/40 text-[#f59e0b]'
                          : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-600'
                      }`}
                    >
                      {type}
                      <span className="block text-[9px] text-zinc-600 mt-0.5">
                        {type === 'B-VCA' ? 'Operators' : 'Supervisors'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-medium">Exam Language</label>
                <select
                  value={examLanguage}
                  onChange={(e) => setExamLanguage(e.target.value)}
                  className="w-full rounded-sm border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-xs text-zinc-200 focus:border-[#f59e0b] focus:outline-none"
                >
                  {EXAM_LANGUAGES.map((lang) => (
                    <option key={lang} value={lang}>{lang}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-medium">Your Postal Code</label>
                <Input
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder="e.g. 2000"
                  className="bg-zinc-900 border-zinc-800 text-zinc-200"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-medium">Preferred Date</label>
                <Input
                  type="date"
                  value={preferredDate}
                  onChange={(e) => setPreferredDate(e.target.value)}
                  className="bg-zinc-900 border-zinc-800 text-zinc-200"
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <label className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-medium">Booking Mode</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setBookingMode('exam_only')}
                    className={`px-3 py-2.5 rounded-sm border text-xs font-medium transition-all ${
                      bookingMode === 'exam_only'
                        ? 'bg-[#f59e0b]/10 border-[#f59e0b]/40 text-[#f59e0b]'
                        : 'bg-zinc-900/60 border-zinc-800 text-zinc-400'
                    }`}
                  >
                    Exam Only
                    <span className="block text-[9px] text-zinc-600 mt-0.5">I prepared with PipingBox</span>
                  </button>
                  <button
                    onClick={() => setBookingMode('course_plus_exam')}
                    className={`px-3 py-2.5 rounded-sm border text-xs font-medium transition-all ${
                      bookingMode === 'course_plus_exam'
                        ? 'bg-[#f59e0b]/10 border-[#f59e0b]/40 text-[#f59e0b]'
                        : 'bg-zinc-900/60 border-zinc-800 text-zinc-400'
                    }`}
                  >
                    Course + Exam
                    <span className="block text-[9px] text-zinc-600 mt-0.5">Classroom at center</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Step 2: Exam centers */}
          <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-5 space-y-4">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f59e0b] text-[10px] font-bold text-black">2</span>
              <h3 className="text-sm font-semibold text-zinc-200">Recognized Exam Centers</h3>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 text-[#f59e0b] animate-spin" />
              </div>
            ) : filteredCenters.length === 0 ? (
              <div className="text-center py-8 text-xs text-zinc-500">
                No centers match your criteria. Try changing the exam type or booking mode.
              </div>
            ) : (
              <div className="space-y-2">
                {filteredCenters.map((center) => (
                  <button
                    key={center.id}
                    onClick={() => setSelectedCenter(center)}
                    className={`w-full text-left border rounded-sm p-3 transition-all ${
                      selectedCenter?.id === center.id
                        ? 'border-[#f59e0b]/40 bg-[#f59e0b]/5'
                        : 'border-zinc-800/60 bg-zinc-950/50 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-xs font-semibold text-zinc-200">{center.center_name}</p>
                        <p className="text-[10px] text-zinc-500 flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {center.city} {center.postal_code && `(${center.postal_code})`}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          {center.languages_offered.map((lang) => (
                            <span key={lang} className="px-1.5 py-0.5 text-[9px] bg-zinc-800/60 text-zinc-400 rounded-sm">{lang}</span>
                          ))}
                          {center.online_available && (
                            <span className="px-1.5 py-0.5 text-[9px] bg-blue-500/10 text-blue-400 rounded-sm">Online</span>
                          )}
                          {center.course_plus_exam_price_cents > 0 && (
                            <span className="px-1.5 py-0.5 text-[9px] bg-green-500/10 text-green-400 rounded-sm">Course</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-medium text-[#f59e0b]">€{(center.exam_price_cents / 100).toFixed(2)}</p>
                        <p className="text-[9px] text-zinc-600">exam fee</p>
                        {center.course_plus_exam_price_cents > 0 && (
                          <p className="text-[10px] text-zinc-500 mt-1">€{(center.course_plus_exam_price_cents / 100).toFixed(2)} course+exam</p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Step 3: Contact info */}
          <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-5 space-y-4">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f59e0b] text-[10px] font-bold text-black">3</span>
              <h3 className="text-sm font-semibold text-zinc-200">Your Contact Details</h3>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-medium">Name</label>
                <Input
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="Your full name"
                  className="bg-zinc-900 border-zinc-800 text-zinc-200"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-medium">Phone (WhatsApp)</label>
                <Input
                  value={userPhone}
                  onChange={(e) => setUserPhone(e.target.value)}
                  placeholder="+32 4xx xxx xxx"
                  className="bg-zinc-900 border-zinc-800 text-zinc-200"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Summary sidebar */}
        <div className="space-y-4">
          <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-5 space-y-4 sticky top-4">
            <h3 className="text-sm font-semibold text-zinc-200">Booking Summary</h3>

            <div className="space-y-2 text-xs">
              <SummaryRow label="Exam Type" value={examType} />
              <SummaryRow label="Language" value={examLanguage} />
              <SummaryRow label="Mode" value={bookingMode === 'exam_only' ? 'Exam Only' : 'Course + Exam'} />
              <SummaryRow label="Preferred Date" value={preferredDate || 'No preference'} />
              <SummaryRow
                label="Center"
                value={selectedCenter ? `${selectedCenter.city}` : 'Any available center'}
              />
            </div>

            {/* Transparent pricing — official fee + PipingBox fee separated (legal requirement) */}
            <div className="border-t border-zinc-800 pt-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">Official exam fee <span className="text-zinc-600">(paid to center)</span></span>
                <span className="text-zinc-300">{examPriceEur !== null ? `€${examPriceEur.toFixed(2)}` : '€—'}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">PipingBox management fee</span>
                <span className="text-[#f59e0b] font-medium">€{feeAmount.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-xs pt-1 border-t border-zinc-800/60">
                <span className="text-zinc-400 font-medium">Total</span>
                <span className="text-zinc-200 font-semibold">€{totalEur.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => setFeeType('standard')}
                  className={`flex-1 px-2 py-1.5 rounded-sm border text-[10px] font-medium transition-all ${
                    feeType === 'standard'
                      ? 'bg-[#f59e0b]/10 border-[#f59e0b]/40 text-[#f59e0b]'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                  }`}
                >
                  Standard €10
                </button>
                <button
                  onClick={() => setFeeType('urgent')}
                  className={`flex-1 px-2 py-1.5 rounded-sm border text-[10px] font-medium transition-all ${
                    feeType === 'urgent'
                      ? 'bg-[#f59e0b]/10 border-[#f59e0b]/40 text-[#f59e0b]'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                  }`}
                >
                  Urgent €15
                </button>
              </div>
              <p className="text-[9px] text-zinc-600 leading-relaxed pt-1">
                Standard: confirmation within 48h. Urgent: confirmation within 24h + language assistance.
              </p>
            </div>

            <Button
              onClick={handleSubmit}
              disabled={submitting || !user}
              className="w-full bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold"
            >
              {submitting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting...</>
              ) : !user ? (
                'Sign in to book'
              ) : (
                <>Submit Booking Request <ArrowRight className="ml-2 h-4 w-4" /></>
              )}
            </Button>

            <p className="text-[9px] text-zinc-600 leading-relaxed text-center">
              After submitting, PipingBox will contact you via WhatsApp/email within 24-48h to confirm your reservation
              and process the management fee.
            </p>
          </div>

          {/* What happens next */}
          <div className="border border-zinc-800/60 bg-[#0d0d0d] rounded-sm p-4 space-y-3">
            <h4 className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold">What happens next?</h4>
            <ol className="space-y-2 text-[11px] text-zinc-400">
              <li className="flex gap-2">
                <span className="text-[#f59e0b] font-bold">1.</span>
                You submit this booking request.
              </li>
              <li className="flex gap-2">
                <span className="text-[#f59e0b] font-bold">2.</span>
                PipingBox contacts you within 24-48h to confirm availability.
              </li>
              <li className="flex gap-2">
                <span className="text-[#f59e0b] font-bold">3.</span>
                You pay the €{feeAmount} management fee (Stripe/transfer).
              </li>
              <li className="flex gap-2">
                <span className="text-[#f59e0b] font-bold">4.</span>
                PipingBox reserves your exam slot at the center.
              </li>
              <li className="flex gap-2">
                <span className="text-[#f59e0b] font-bold">5.</span>
                You attend the exam. The center issues your VCA certificate.
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-500">{label}</span>
      <span className="text-zinc-300 font-medium">{value}</span>
    </div>
  );
}
