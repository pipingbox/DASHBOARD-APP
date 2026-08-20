import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/hooks/useAuth';
import { supabase, TABLES } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  Building2,
  Globe,
  MapPin,
  FileText,
  Save,
  Shield,
  ShieldAlert,
} from 'lucide-react';

export default function CompanyProfile() {
  const { profile, user } = useAuth();

  const [form, setForm] = useState({
    company_name: profile?.full_name || '',
    industry: 'Oil & Gas / Industrial Service',
    country: profile?.location || '',
    website: '',
    description: profile?.bio || '',
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load existing company data from the profile.
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data } = await supabase
          .from(TABLES.profiles)
          .select('full_name, location, bio, title')
          .eq('user_id', user.id)
          .maybeSingle();

        if (data) {
          const p = data as { full_name: string | null; location: string | null; bio: string | null; title: string | null };
          setForm((prev) => ({
            ...prev,
            company_name: p.full_name || prev.company_name,
            country: p.location || prev.country,
            description: p.bio || prev.description,
            industry: p.title || prev.industry,
          }));
        }
      } catch {
        // ignore — form keeps defaults
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error('You must be logged in to save your profile.');
      return;
    }
    setSaving(true);
    try {
      // TD-05: real DB save (previously was a fake setTimeout).
      // Map form fields to existing profile columns.
      const updates = {
        full_name: form.company_name.trim(),
        location: form.country.trim() || null,
        bio: form.description.trim() || null,
        title: form.industry || null,
      };

      const { error } = await supabase
        .from(TABLES.profiles)
        .update(updates)
        .eq('user_id', user.id);

      if (error) throw error;

      toast.success('Company profile saved.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save profile.';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#f59e0b] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Company"
        title="Company Profile"
        description="Manage your company identity, verification status, and public information."
      />

      <form onSubmit={handleSave} className="max-w-2xl space-y-6">
        {/* Verification Status — TD-34: no fake "Verified" badge. Show pending status honestly. */}
        <div className="border border-zinc-800/80 bg-zinc-900/30 rounded-sm p-4 flex items-center gap-3">
          <ShieldAlert className="h-5 w-5 text-zinc-500 shrink-0" />
          <div>
            <p className="text-sm font-medium text-zinc-300">Verification Pending</p>
            <p className="text-[11px] text-zinc-500">Submit verification documents to get your company verified.</p>
          </div>
        </div>

        {/* Company Info */}
        <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-[#f59e0b]" />
            <h3 className="text-sm font-semibold text-zinc-200">Company Information</h3>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Company Name</label>
              <input
                name="company_name"
                value={form.company_name}
                onChange={handleChange}
                className="w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-[#f59e0b]/50 transition"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Industry</label>
              <select
                name="industry"
                value={form.industry}
                onChange={handleChange}
                className="w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-[#f59e0b]/50 transition"
              >
                <option>Oil & Gas / Industrial Service</option>
                <option>Construction</option>
                <option>Marine & Offshore</option>
                <option>Mining</option>
                <option>Energy & Renewables</option>
                <option>Manufacturing</option>
                <option>Other</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                <MapPin className="h-3 w-3" />
                Country
              </label>
              <input
                name="country"
                value={form.country}
                onChange={handleChange}
                placeholder="e.g. Belgium"
                className="w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-[#f59e0b]/50 transition"
              />
            </div>
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                <Globe className="h-3 w-3" />
                Website
              </label>
              <input
                name="website"
                value={form.website}
                onChange={handleChange}
                placeholder="https://yourcompany.com"
                className="w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-[#f59e0b]/50 transition"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              <FileText className="h-3 w-3" />
              Company Description
            </label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={4}
              placeholder="Describe your company, services, and what makes you a great employer..."
              className="w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-[#f59e0b]/50 transition resize-y"
            />
          </div>
        </div>

        {/* Security */}
        <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-[#f59e0b]" />
            <h3 className="text-sm font-semibold text-zinc-200">Verification & Security</h3>
          </div>
          <div className="space-y-2 text-xs text-zinc-400">
            <p>• Email verified: <span className="text-emerald-400">Yes</span></p>
            <p>• Company documents: <span className="text-zinc-500">Not submitted</span></p>
            <p>• Account status: <span className="text-emerald-400">Active</span></p>
          </div>
        </div>

        {/* Save */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-sm bg-[#f59e0b] px-6 py-2.5 text-sm font-semibold text-black hover:bg-[#d97706] transition disabled:opacity-50"
          >
            {saving ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save Profile
          </button>
        </div>
      </form>
    </div>
  );
}