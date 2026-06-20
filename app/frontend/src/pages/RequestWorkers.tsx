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
} from 'lucide-react';
import { supabase, TABLES } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

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

export default function RequestWorkers({ isPublic = false }: { isPublic?: boolean }) {
  const [form, setForm] = useState<FormData>(INITIAL);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  const validate = (): boolean => {
    const e: Partial<Record<keyof FormData, string>> = {};
    if (!form.company_name.trim()) e.company_name = 'Company name is required';
    if (!form.contact_person.trim()) e.contact_person = 'Contact person is required';
    if (!form.email.trim()) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Invalid email';
    if (!form.country.trim()) e.country = 'Country is required';
    if (!form.workers_needed.trim()) e.workers_needed = 'Please select worker type';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    const payload = {
      company_name: form.company_name.trim(),
      contact_person: form.contact_person.trim(),
      email: form.email.trim(),
      country: form.country.trim(),
      workers_needed: form.workers_needed,
      start_date: form.start_date || null,
      number_of_workers: form.number_of_workers || null,
      project_duration: form.project_duration || null,
      message: form.message.trim() || null,
      status: 'new',
      priority: 'normal',
      archived: false,
    };

    console.log('[RequestWorkers] Submitting payload:', payload);

    const { data, error } = await supabase.from(TABLES.companyLeads).insert(payload).select();
    if (error) {
      setLoading(false);
      toast.error(`Failed to submit request: ${error.message}`);
      console.error('[RequestWorkers] Insert error:', error);
      return;
    }

    console.log('[RequestWorkers] Insert success:', data);

    // Trigger email notifications via edge function (fire-and-forget)
    try {
      await fetch(
        'https://mwdauubztjxkbrefirbg.supabase.co/functions/v1/app_14da0f1941_send_lead_notification',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
    } catch (emailErr) {
      console.warn('Email notification failed:', emailErr);
    }

    setLoading(false);
    setSubmitted(true);
    setForm(INITIAL);
    toast.success('Workforce request submitted!');
  };

  const update = (field: keyof FormData, value: string) => {
    setForm((p) => ({ ...p, [field]: value }));
    if (errors[field]) setErrors((p) => ({ ...p, [field]: undefined }));
  };

  if (submitted) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="max-w-md w-full text-center space-y-6 p-8">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#f59e0b]/10 border border-[#f59e0b]/30">
            <CheckCircle2 className="h-8 w-8 text-[#f59e0b]" />
          </div>
          <h2 className="text-2xl font-bold text-zinc-100">Request Received</h2>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Thank you for your workforce request. Our team will review your requirements and get
            back to you within 24–48 hours with a tailored proposal.
          </p>
          <div className="flex flex-col gap-3 pt-4">
            <Button
              onClick={() => setSubmitted(false)}
              className="bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold"
            >
              Submit Another Request
            </Button>
            {isPublic ? (
              <Link
                to="/register?type=company"
                className="text-sm text-[#f59e0b] hover:underline transition text-center"
              >
                Create an account to track your requests →
              </Link>
            ) : (
              <Link
                to="/companies"
                className="text-sm text-zinc-500 hover:text-zinc-300 transition"
              >
                ← Back to Companies
              </Link>
            )}
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
          to={isPublic ? '/' : '/companies'}
          className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition"
        >
          <ArrowLeft className="h-4 w-4" />
          {isPublic ? 'Home' : 'Back to Companies'}
        </Link>

        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-[0.25em] text-[#f59e0b] font-semibold">
            Workforce Solutions
          </p>
          <h1 className="text-3xl font-bold text-zinc-100 tracking-tight">
            Request Workforce
          </h1>
          <p className="text-zinc-400 text-sm max-w-2xl leading-relaxed">
            Need skilled industrial workers for your project? Fill out the form below and our team
            will match you with qualified professionals from our global network.
          </p>
        </div>
      </div>

      {/* Form Card */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-6 lg:p-8 space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Company Name */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <Building2 className="h-3.5 w-3.5 text-[#f59e0b]" />
                Company Name *
              </Label>
              <Input
                value={form.company_name}
                onChange={(e) => update('company_name', e.target.value)}
                placeholder="e.g. Your Company Name"
                className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:border-[#f59e0b] focus:ring-[#f59e0b]/20"
              />
              {errors.company_name && (
                <p className="text-xs text-red-400">{errors.company_name}</p>
              )}
            </div>

            {/* Contact Person */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <User className="h-3.5 w-3.5 text-[#f59e0b]" />
                Contact Person *
              </Label>
              <Input
                value={form.contact_person}
                onChange={(e) => update('contact_person', e.target.value)}
                placeholder="Full name"
                className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:border-[#f59e0b] focus:ring-[#f59e0b]/20"
              />
              {errors.contact_person && (
                <p className="text-xs text-red-400">{errors.contact_person}</p>
              )}
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-[#f59e0b]" />
                Email *
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
                Country *
              </Label>
              <Input
                value={form.country}
                onChange={(e) => update('country', e.target.value)}
                placeholder="e.g. Netherlands"
                className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:border-[#f59e0b] focus:ring-[#f59e0b]/20"
              />
              {errors.country && <p className="text-xs text-red-400">{errors.country}</p>}
            </div>

            {/* Workers Needed */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <HardHat className="h-3.5 w-3.5 text-[#f59e0b]" />
                Type of Workers Needed *
              </Label>
              <select
                value={form.workers_needed}
                onChange={(e) => update('workers_needed', e.target.value)}
                className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-[#f59e0b] focus:outline-none focus:ring-1 focus:ring-[#f59e0b]/20"
              >
                <option value="" className="text-zinc-600">
                  Select worker type
                </option>
                {WORKER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              {errors.workers_needed && (
                <p className="text-xs text-red-400">{errors.workers_needed}</p>
              )}
            </div>

            {/* Start Date */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-[#f59e0b]" />
                Estimated Start Date
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
                Number of Workers
              </Label>
              <Input
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
                Project Duration
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
              Additional Message
            </Label>
            <textarea
              value={form.message}
              onChange={(e) => update('message', e.target.value)}
              placeholder="Tell us more about your project requirements, certifications needed, or any specific details..."
              rows={4}
              className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[#f59e0b] focus:outline-none focus:ring-1 focus:ring-[#f59e0b]/20 resize-none"
            />
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-zinc-600">* Required fields</p>
          <Button
            type="submit"
            disabled={loading}
            className="bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold px-8 py-2.5 text-sm"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              'Request Workforce'
            )}
          </Button>
        </div>
      </form>

      {/* Trust indicators */}
      <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-6">
        <div className="grid gap-6 md:grid-cols-3 text-center">
          <div>
            <p className="text-2xl font-bold text-[#f59e0b]">500+</p>
            <p className="text-xs text-zinc-500 mt-1">Qualified Workers</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-[#f59e0b]">24h</p>
            <p className="text-xs text-zinc-500 mt-1">Response Time</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-[#f59e0b]">15+</p>
            <p className="text-xs text-zinc-500 mt-1">Countries Covered</p>
          </div>
        </div>
      </div>
    </div>
  );
}