import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  User,
  Mail,
  Globe,
  HardHat,
  Calendar,
  Users,
  Clock,
  MessageSquare,
  CheckCircle2,
  Loader2,
  ArrowLeft,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { supabase, TABLES } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { notifyNewCompanyLead } from '@/lib/notifications';
import { useTranslation } from 'react-i18next';

interface FormData {
  company_name: string;
  contact_person: string;
  email: string;
  country: string;
  workers_needed: string;
  start_date: string;
  number_of_workers: string;
  project_duration: string;
  message: string;
}

const INITIAL: FormData = {
  company_name: '',
  contact_person: '',
  email: '',
  country: '',
  workers_needed: '',
  start_date: '',
  number_of_workers: '',
  project_duration: '',
  message: '',
};

const WORKER_TYPES = [
  'Pipefitters',
  'Welders',
  'Electricians',
  'Scaffolders',
  'Riggers',
  'Insulators',
  'Mechanical Fitters',
  'Instrument Technicians',
  'General Labour',
  'Other',
];

export default function RequestWorkers() {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormData>(INITIAL);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  const validate = (): boolean => {
    const e: Partial<Record<keyof FormData, string>> = {};
    if (!form.company_name.trim()) e.company_name = t('requestWorkers.errors.companyRequired', 'Company name is required');
    if (!form.contact_person.trim()) e.contact_person = t('requestWorkers.errors.contactRequired', 'Contact person is required');
    if (!form.email.trim()) e.email = t('requestWorkers.errors.emailRequired', 'Email is required');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = t('requestWorkers.errors.emailInvalid', 'Invalid email');
    if (!form.workers_needed.trim()) e.workers_needed = t('requestWorkers.errors.workerTypeRequired', 'Please select worker type');
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!validate()) return;

    setLoading(true);

    const numWorkers = parseInt(form.number_of_workers, 10) || 1;

    // Insert into workforce_requests (the new pipeline table)
    const workforcePayload = {
      company_name: form.company_name.trim(),
      contact_person: form.contact_person.trim(),
      email: form.email.trim(),
      country: form.country.trim() || null,
      worker_type: form.workers_needed,
      workers_requested: numWorkers,
      workers_assigned: 0,
      coverage_percentage: 0,
      estimated_start_date: form.start_date || null,
      project_duration: form.project_duration || null,
      priority: numWorkers >= 10 ? 'high' : 'normal',
      status: 'new',
      message: form.message.trim() || null,
      documentation_progress: {
        contracts: false,
        certifications: false,
        onboarding: false,
        compliance: false,
        medical: false,
        payroll: false,
      },
    };

    try {
      const { data, error } = await supabase
        .from(TABLES.workforceRequests)
        .insert(workforcePayload)
        .select();

      if (error) {
        console.error('[RequestWorkers] Insert error:', error);
        setSubmitError(error.message || 'Failed to submit request. Please try again.');
        setLoading(false);
        return;
      }

      if (!data || data.length === 0) {
        console.error('[RequestWorkers] Insert returned no data');
        setSubmitError('Request could not be saved. Please try again or contact support.');
        setLoading(false);
        return;
      }

      console.log('[RequestWorkers] Insert SUCCESS — request id:', data[0]?.id);

      // Also insert into legacy company_leads table for backward compatibility
      const legacyPayload = {
        company_name: form.company_name.trim(),
        contact_person: form.contact_person.trim(),
        email: form.email.trim(),
        country: form.country.trim() || null,
        workers_needed: form.workers_needed,
        start_date: form.start_date || null,
        number_of_workers: form.number_of_workers || null,
        project_duration: form.project_duration || null,
        message: form.message.trim() || null,
        status: 'new',
        priority: 'normal',
        archived: false,
      };

      supabase
        .from(TABLES.companyLeads)
        .insert(legacyPayload)
        .then(({ error: legacyErr }) => {
          if (legacyErr) console.warn('[RequestWorkers] Legacy insert failed:', legacyErr.message);
        });

      // Create admin notification (fire-and-forget)
      notifyNewCompanyLead(
        workforcePayload.company_name,
        workforcePayload.worker_type,
        workforcePayload.country || 'Unknown',
        data[0]?.id,
      ).catch((err) => console.warn('[RequestWorkers] Notification failed:', err));

      setLoading(false);
      setSubmitted(true);
      setSubmitError(null);
      setForm(INITIAL);
      toast.success(t('requestWorkers.success', 'Workforce request submitted!'));
    } catch (unexpectedErr) {
      console.error('[RequestWorkers] Unexpected error:', unexpectedErr);
      setSubmitError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  const update = (field: keyof FormData, value: string) => {
    setForm((p) => ({ ...p, [field]: value }));
    if (errors[field]) setErrors((p) => ({ ...p, [field]: undefined }));
    if (submitError) setSubmitError(null);
  };

  if (submitted) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="max-w-md w-full text-center space-y-6 p-8">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#f59e0b]/10 border border-[#f59e0b]/30">
            <CheckCircle2 className="h-8 w-8 text-[#f59e0b]" />
          </div>
          <h2 className="text-2xl font-bold text-zinc-100">{t('requestWorkers.received', 'Request Received')}</h2>
          <p className="text-zinc-400 text-sm leading-relaxed">
            {t('requestWorkers.receivedDesc', 'Thank you for your workforce request. Our team will review your requirements and get back to you within 24–48 hours with a tailored proposal.')}
          </p>
          <div className="flex flex-col gap-3 pt-4">
            <Button
              onClick={() => setSubmitted(false)}
              className="bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold"
            >
              {t('requestWorkers.submitAnother', 'Submit Another Request')}
            </Button>
            <Link
              to="/company/workforce-requests"
              className="text-sm text-zinc-500 hover:text-zinc-300 transition"
            >
              ← {t('requestWorkers.backToRequests', 'Back to Workforce Requests')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="space-y-4">
        <Link
          to="/company/workforce-requests"
          className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('requestWorkers.backToRequests', 'Back to Workforce Requests')}
        </Link>

        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-[0.25em] text-[#f59e0b] font-semibold">
            {t('requestWorkers.eyebrow', 'Workforce Solutions')}
          </p>
          <h1 className="text-3xl font-bold text-zinc-100 tracking-tight">
            {t('requestWorkers.title', 'Request Workforce')}
          </h1>
          <p className="text-zinc-400 text-sm max-w-2xl leading-relaxed">
            {t('requestWorkers.subtitle', 'Need skilled industrial workers for your project? Fill out the form below and our team will match you with qualified professionals from our global network.')}
          </p>
        </div>
      </div>

      {/* Error Banner */}
      {submitError && (
        <div className="border border-red-500/30 bg-red-500/5 rounded-sm p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-400">{t('requestWorkers.submitFailed', 'Submission Failed')}</p>
            <p className="text-xs text-red-400/70 mt-1">{submitError}</p>
          </div>
          <Button
            type="button"
            onClick={handleSubmit as unknown as () => void}
            disabled={loading}
            variant="outline"
            className="shrink-0 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 !bg-transparent text-xs px-3 py-1.5"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                {t('requestWorkers.retry', 'Retry')}
              </>
            )}
          </Button>
        </div>
      )}

      {/* Form Card */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-6 lg:p-8 space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Company Name */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <Building2 className="h-3.5 w-3.5 text-[#f59e0b]" />
                {t('requestWorkers.companyName', 'Company Name')} *
              </Label>
              <Input
                value={form.company_name}
                onChange={(e) => update('company_name', e.target.value)}
                placeholder="e.g. Your Company Name"
                className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:border-[#f59e0b] focus:ring-[#f59e0b]/20"
              />
              {errors.company_name && <p className="text-xs text-red-400">{errors.company_name}</p>}
            </div>

            {/* Contact Person */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <User className="h-3.5 w-3.5 text-[#f59e0b]" />
                {t('requestWorkers.contactPerson', 'Contact Person')} *
              </Label>
              <Input
                value={form.contact_person}
                onChange={(e) => update('contact_person', e.target.value)}
                placeholder="Full name"
                className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:border-[#f59e0b] focus:ring-[#f59e0b]/20"
              />
              {errors.contact_person && <p className="text-xs text-red-400">{errors.contact_person}</p>}
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-[#f59e0b]" />
                {t('requestWorkers.email', 'Email')} *
              </Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                placeholder="company@email.com"
                className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:border-[#f59e0b] focus:ring-[#f59e0b]/20"
              />
              {errors.email && <p className="text-xs text-red-400">{errors.email}</p>}
            </div>

            {/* Country */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <Globe className="h-3.5 w-3.5 text-[#f59e0b]" />
                {t('requestWorkers.country', 'Country')}
              </Label>
              <Input
                value={form.country}
                onChange={(e) => update('country', e.target.value)}
                placeholder="e.g. Netherlands"
                className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:border-[#f59e0b] focus:ring-[#f59e0b]/20"
              />
            </div>

            {/* Workers Needed */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <HardHat className="h-3.5 w-3.5 text-[#f59e0b]" />
                {t('requestWorkers.workerType', 'Type of Workers Needed')} *
              </Label>
              <select
                value={form.workers_needed}
                onChange={(e) => update('workers_needed', e.target.value)}
                className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-[#f59e0b] focus:outline-none focus:ring-1 focus:ring-[#f59e0b]/20"
              >
                <option value="" className="text-zinc-600">
                  {t('requestWorkers.selectType', 'Select worker type')}
                </option>
                {WORKER_TYPES.map((wt) => (
                  <option key={wt} value={wt}>{wt}</option>
                ))}
              </select>
              {errors.workers_needed && <p className="text-xs text-red-400">{errors.workers_needed}</p>}
            </div>

            {/* Start Date */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-[#f59e0b]" />
                {t('requestWorkers.startDate', 'Estimated Start Date')}
              </Label>
              <Input
                type="date"
                value={form.start_date}
                onChange={(e) => update('start_date', e.target.value)}
                className="bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-[#f59e0b] focus:ring-[#f59e0b]/20"
              />
            </div>

            {/* Number of Workers */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-[#f59e0b]" />
                {t('requestWorkers.numWorkers', 'Number of Workers')}
              </Label>
              <Input
                type="number"
                min="1"
                value={form.number_of_workers}
                onChange={(e) => update('number_of_workers', e.target.value)}
                placeholder="e.g. 15"
                className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:border-[#f59e0b] focus:ring-[#f59e0b]/20"
              />
            </div>

            {/* Project Duration */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-[#f59e0b]" />
                {t('requestWorkers.duration', 'Project Duration')}
              </Label>
              <Input
                value={form.project_duration}
                onChange={(e) => update('project_duration', e.target.value)}
                placeholder="e.g. 6 months"
                className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:border-[#f59e0b] focus:ring-[#f59e0b]/20"
              />
            </div>
          </div>

          {/* Message */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-zinc-400 flex items-center gap-2">
              <MessageSquare className="h-3.5 w-3.5 text-[#f59e0b]" />
              {t('requestWorkers.message', 'Additional Message')}
            </Label>
            <textarea
              value={form.message}
              onChange={(e) => update('message', e.target.value)}
              placeholder={t('requestWorkers.messagePlaceholder', 'Tell us more about your project requirements, certifications needed, or any specific details...')}
              rows={4}
              className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[#f59e0b] focus:outline-none focus:ring-1 focus:ring-[#f59e0b]/20 resize-none"
            />
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-zinc-600">* {t('requestWorkers.required', 'Required fields')}</p>
          <Button
            type="submit"
            disabled={loading}
            className="bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold px-8 py-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('requestWorkers.submitting', 'Submitting...')}
              </>
            ) : (
              t('requestWorkers.submit', 'Request Workforce')
            )}
          </Button>
        </div>
      </form>

      {/* Trust indicators */}
      <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-6">
        <div className="grid gap-6 md:grid-cols-3 text-center">
          <div>
            <p className="text-2xl font-bold text-[#f59e0b]">500+</p>
            <p className="text-xs text-zinc-500 mt-1">{t('requestWorkers.qualifiedWorkers', 'Qualified Workers')}</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-[#f59e0b]">24h</p>
            <p className="text-xs text-zinc-500 mt-1">{t('requestWorkers.responseTime', 'Response Time')}</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-[#f59e0b]">15+</p>
            <p className="text-xs text-zinc-500 mt-1">{t('requestWorkers.countriesCovered', 'Countries Covered')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}