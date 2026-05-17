import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { supabase, TABLES } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import {
  Briefcase,
  ArrowLeft,
  MapPin,
  Wrench,
  FileText,
  DollarSign,
  Send,
} from 'lucide-react';

export default function CompanyPostJob() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    title: '',
    company_name: profile?.full_name || profile?.company || '',
    location: '',
    country: '',
    discipline: '',
    contract_type: '',
    salary_min: '',
    salary_max: '',
    rotation: '',
    description: '',
    requirements: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.location || !form.discipline) {
      toast.error('Please fill in required fields: Job Title, Location, Discipline');
      return;
    }

    setSubmitting(true);

    try {
      // Get authenticated user directly from Supabase Auth (no users table access)
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();

      if (authError || !authUser) {
        console.error('Auth error:', authError?.message);
        toast.error('You must be logged in to publish a job.');
        setSubmitting(false);
        return;
      }

      // If we need company info, read from profiles table (never from users table)
      let companyName = form.company_name;
      if (!companyName && profile?.company) {
        companyName = profile.company;
      }
      if (!companyName) {
        // Fallback: fetch from profiles table using user_id
        const { data: profileData } = await supabase
          .from(TABLES.profiles)
          .select('company, full_name')
          .eq('user_id', authUser.id)
          .maybeSingle();
        companyName = profileData?.company || profileData?.full_name || authUser.email?.split('@')[0] || 'Unknown';
      }

      // Build salary range string
      const salaryRange =
        form.salary_min || form.salary_max
          ? `${form.salary_min || '?'}–${form.salary_max || '?'}`
          : null;

      // Insert job — use only auth user ID fields, no users table dependency
      const jobPayload = {
        posted_by: authUser.id,
        company_user_id: authUser.id,
        company: companyName || 'Unknown',
        company_name: companyName || null,
        title: form.title,
        location: form.location,
        country: form.country || null,
        discipline: form.discipline,
        contract_type: form.contract_type || null,
        salary_range: salaryRange,
        rotation: form.rotation || null,
        description: form.description || null,
        requirements: form.requirements || null,
        status: 'open',
        applications_count: 0,
      };

      console.log('Inserting job with payload:', JSON.stringify(jobPayload, null, 2));

      const { error } = await supabase.from(TABLES.jobs).insert(jobPayload);

      if (error) {
        console.error('Job insert error details:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
        toast.error(`Failed to publish job: ${error.message}`);
      } else {
        toast.success('Job published successfully!');
        navigate('/company/jobs');
      }
    } catch (err: any) {
      console.error('Unexpected error during job publish:', err);
      toast.error('An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Company"
        title="Post New Job"
        description="Create a new industrial job listing for your company."
        actions={
          <Link
            to="/company/jobs"
            className="inline-flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-200 transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Jobs
          </Link>
        }
      />

      <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
        {/* Basic Info */}
        <Section title="Basic Information" icon={Briefcase}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Job Title *" name="title" value={form.title} onChange={handleChange} placeholder="e.g. Pipe Fitter" />
            <Field label="Company Name" name="company_name" value={form.company_name} onChange={handleChange} placeholder="Your company" />
          </div>
        </Section>

        {/* Location */}
        <Section title="Location & Region" icon={MapPin}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Location *" name="location" value={form.location} onChange={handleChange} placeholder="e.g. Abu Dhabi, UAE" />
            <Field label="Country" name="country" value={form.country} onChange={handleChange} placeholder="e.g. UAE" />
          </div>
        </Section>

        {/* Job Details */}
        <Section title="Job Details" icon={Wrench}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Discipline *" name="discipline" value={form.discipline} onChange={handleChange} placeholder="e.g. Piping, Welding, Electrical" />
            <SelectField
              label="Contract Type"
              name="contract_type"
              value={form.contract_type}
              onChange={handleChange}
              options={['', 'Permanent', 'Contract', 'Temporary', 'Freelance']}
            />
          </div>
        </Section>

        {/* Compensation */}
        <Section title="Compensation" icon={DollarSign}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Salary Min" name="salary_min" value={form.salary_min} onChange={handleChange} placeholder="e.g. 3000" type="number" />
            <Field label="Salary Max" name="salary_max" value={form.salary_max} onChange={handleChange} placeholder="e.g. 5000" type="number" />
            <Field label="Rotation" name="rotation" value={form.rotation} onChange={handleChange} placeholder="e.g. 28/28" />
          </div>
        </Section>

        {/* Description */}
        <Section title="Description & Requirements" icon={FileText}>
          <TextArea label="Job Description" name="description" value={form.description} onChange={handleChange} placeholder="Describe the role, responsibilities, and working conditions..." rows={5} />
          <TextArea label="Requirements" name="requirements" value={form.requirements} onChange={handleChange} placeholder="List required certifications, experience, and qualifications..." rows={4} />
        </Section>

        {/* Submit */}
        <div className="flex items-center gap-3 pt-4 border-t border-zinc-800/80">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-sm bg-[#f59e0b] px-6 py-2.5 text-sm font-semibold text-black hover:bg-[#d97706] transition disabled:opacity-50"
          >
            {submitting ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Publish Job
          </button>
          <Link
            to="/company/jobs"
            className="px-4 py-2.5 text-sm text-zinc-400 hover:text-zinc-200 transition"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

/* ─── Helpers ─── */
function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-[#f59e0b]" />
        <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Field({ label, name, value, onChange, placeholder, type = 'text' }: {
  label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; placeholder: string; type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-[#f59e0b]/50 transition"
      />
    </div>
  );
}

function SelectField({ label, name, value, onChange, options }: {
  label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; options: string[];
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</label>
      <select
        name={name}
        value={value}
        onChange={onChange}
        className="w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-[#f59e0b]/50 transition"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt || 'Select...'}</option>
        ))}
      </select>
    </div>
  );
}

function TextArea({ label, name, value, onChange, placeholder, rows = 4 }: {
  label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void; placeholder: string; rows?: number;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</label>
      <textarea
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
        className="w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-[#f59e0b]/50 transition resize-y"
      />
    </div>
  );
}