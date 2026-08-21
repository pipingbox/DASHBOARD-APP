import { useState, useEffect, useRef, useCallback } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/hooks/useAuth';
import { supabase, TABLES } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  Building2,
  Globe,
  MapPin,
  FileText,
  CheckCircle2,
  Save,
  Shield,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

/* ─── localStorage draft helpers ─── */
const DRAFT_KEY_PREFIX = 'pipingbox_company_profile_draft_';
const AUTOSAVE_DEBOUNCE_MS = 1200;

interface CompanyDraft {
  company_name: string;
  industry: string;
  country: string;
  website: string;
  description: string;
  updatedAt: string;
}

function saveDraftToLocal(userId: string, draft: CompanyDraft) {
  try {
    localStorage.setItem(DRAFT_KEY_PREFIX + userId, JSON.stringify(draft));
  } catch { /* storage full — ignore */ }
}

function loadDraftFromLocal(userId: string): CompanyDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY_PREFIX + userId);
    if (!raw) return null;
    return JSON.parse(raw) as CompanyDraft;
  } catch {
    return null;
  }
}

function clearDraftFromLocal(userId: string) {
  try {
    localStorage.removeItem(DRAFT_KEY_PREFIX + userId);
  } catch { /* ignore */ }
}

export default function CompanyProfile() {
  const { user, refreshProfile } = useAuth();
  const { t } = useTranslation();

  const [form, setForm] = useState({
    company_name: '',
    industry: '',
    country: '',
    website: '',
    description: '',
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  // Load company profile data from Supabase on mount
  useEffect(() => {
    const loadCompanyData = async () => {
      if (!user) return;
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from(TABLES.profiles)
          .select('full_name, company, company_industry, company_country, company_website, company_description, updated_at')
          .eq('user_id', user.id)
          .single();

        if (error) {
          console.error('[CompanyProfile] Load error:', error.message);
        }

        // Check if localStorage draft is newer
        const draft = loadDraftFromLocal(user.id);
        const dbUpdatedAt = data?.updated_at || '';

        if (draft && draft.updatedAt && dbUpdatedAt && new Date(draft.updatedAt) > new Date(dbUpdatedAt)) {
          console.log('[CompanyProfile] Restoring from localStorage draft (newer than DB)');
          setForm({
            company_name: draft.company_name,
            industry: draft.industry,
            country: draft.country,
            website: draft.website,
            description: draft.description,
          });
          setHasUnsavedChanges(true);
        } else if (data) {
          setForm({
            company_name: data.full_name || data.company || '',
            industry: data.company_industry || 'Oil & Gas / Industrial Services',
            country: data.company_country || '',
            website: data.company_website || '',
            description: data.company_description || '',
          });
          // Clear stale draft
          if (draft) clearDraftFromLocal(user.id);
        }
      } catch (err) {
        console.error('[CompanyProfile] Unexpected error:', err);
      } finally {
        setLoading(false);
        setInitialLoadDone(true);
      }
    };

    loadCompanyData();
  }, [user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  // Build draft for localStorage
  const buildDraft = useCallback((): CompanyDraft => ({
    ...form,
    updatedAt: new Date().toISOString(),
  }), [form]);

  // Debounced autosave
  const debouncedAutosave = useCallback(() => {
    if (!user || !initialLoadDone) return;

    setHasUnsavedChanges(true);

    // Save to localStorage immediately
    saveDraftToLocal(user.id, buildDraft());

    // Debounce Supabase save
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(async () => {
      if (!isMountedRef.current) return;

      setSaveStatus('saving');
      const payload = {
        full_name: form.company_name.trim() || null,
        company_industry: form.industry || null,
        company_country: form.country.trim() || null,
        company_website: form.website.trim() || null,
        company_description: form.description.trim() || null,
        updated_at: new Date().toISOString(),
      };

      console.log('[CompanyProfile] Autosave attempt:', { userId: user.id, fields: Object.keys(payload) });

      const { error } = await supabase
        .from(TABLES.profiles)
        .update(payload)
        .eq('user_id', user.id);

      if (!isMountedRef.current) return;

      if (error) {
        console.error('[CompanyProfile] Autosave error:', error.message, error.details);
        setSaveStatus('error');
      } else {
        console.log('[CompanyProfile] Autosaved successfully');
        setSaveStatus('saved');
        setHasUnsavedChanges(false);
        clearDraftFromLocal(user.id);
        setTimeout(() => {
          if (isMountedRef.current) setSaveStatus('idle');
        }, 2500);
      }
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [user, initialLoadDone, form, buildDraft]);

  // Trigger autosave on form changes
  useEffect(() => {
    if (!initialLoadDone || !user) return;
    debouncedAutosave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.company_name, form.industry, form.country, form.website, form.description]);

  // Page unload warning
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

  // Explicit save (button click)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setSaveStatus('saving');

    // Cancel pending autosave
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    const payload = {
      full_name: form.company_name.trim() || null,
      company_industry: form.industry || null,
      company_country: form.country.trim() || null,
      company_website: form.website.trim() || null,
      company_description: form.description.trim() || null,
      updated_at: new Date().toISOString(),
    };

    console.log('[CompanyProfile] Manual save attempt:', { userId: user.id, payload });

    const { error } = await supabase
      .from(TABLES.profiles)
      .update(payload)
      .eq('user_id', user.id);

    if (error) {
      console.error('[CompanyProfile] Save error:', error.message, error.details, error.hint);
      setSaving(false);
      setSaveStatus('error');
      toast.error(t('companyProfilePage.saveError', 'Error saving profile: ') + error.message);
      return;
    }

    // Verify save
    const { data: verified, error: verifyErr } = await supabase
      .from(TABLES.profiles)
      .select('full_name, company_industry, company_country, company_website, company_description')
      .eq('user_id', user.id)
      .maybeSingle();

    if (verifyErr) {
      console.warn('[CompanyProfile] Verify read error (non-critical):', verifyErr.message);
    } else if (verified) {
      console.log('[CompanyProfile] Save verified:', verified);
    }

    setSaving(false);
    setSaveStatus('saved');
    setHasUnsavedChanges(false);
    clearDraftFromLocal(user.id);
    toast.success(t('companyProfilePage.saved'));
    await refreshProfile();

    setTimeout(() => {
      if (isMountedRef.current) setSaveStatus('idle');
    }, 2500);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('companyProfilePage.eyebrow')}
        title={t('companyProfilePage.title')}
        description={t('companyProfilePage.description')}
      />

      {/* Save status indicator */}
      {saveStatus !== 'idle' && (
        <div className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-sm border ${
          saveStatus === 'saving' ? 'border-zinc-700 bg-zinc-900 text-zinc-400' :
          saveStatus === 'saved' ? 'border-emerald-800 bg-emerald-950 text-emerald-400' :
          'border-red-800 bg-red-950 text-red-400'
        }`}>
          {saveStatus === 'saving' && <Loader2 className="h-3 w-3 animate-spin" />}
          {saveStatus === 'saved' && <CheckCircle2 className="h-3 w-3" />}
          {saveStatus === 'error' && <AlertCircle className="h-3 w-3" />}
          <span>
            {saveStatus === 'saving' && t('common.saving', 'Saving...')}
            {saveStatus === 'saved' && t('common.saved', 'Saved')}
            {saveStatus === 'error' && t('common.saveError', 'Save error — will retry')}
          </span>
        </div>
      )}

      <form onSubmit={handleSave} className="max-w-2xl space-y-6">
        {/* Verification Status */}
        <div className="border border-emerald-500/20 bg-emerald-500/5 rounded-sm p-4 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-emerald-300">{t('companyProfilePage.verified')}</p>
            <p className="text-[11px] text-emerald-400/70">{t('companyProfilePage.verifiedDesc')}</p>
          </div>
        </div>

        {/* Company Info */}
        <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-[#f59e0b]" />
            <h3 className="text-sm font-semibold text-zinc-200">{t('companyProfilePage.companyInfo')}</h3>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{t('companyProfilePage.companyName')}</label>
              <input
                name="company_name"
                value={form.company_name}
                onChange={handleChange}
                className="w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-[#f59e0b]/50 transition"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{t('companyProfilePage.industry')}</label>
              <select
                name="industry"
                value={form.industry}
                onChange={handleChange}
                className="w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-[#f59e0b]/50 transition"
              >
                <option value="Oil & Gas / Industrial Services">Oil & Gas / Industrial Services</option>
                <option value="Construction">Construction</option>
                <option value="Marine & Offshore">Marine & Offshore</option>
                <option value="Mining">Mining</option>
                <option value="Energy & Renewables">Energy & Renewables</option>
                <option value="Manufacturing">Manufacturing</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                <MapPin className="h-3 w-3" />
                {t('companyProfilePage.country')}
              </label>
              <input
                name="country"
                value={form.country}
                onChange={handleChange}
                placeholder={t('companyProfilePage.countryPlaceholder')}
                className="w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-[#f59e0b]/50 transition"
              />
            </div>
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                <Globe className="h-3 w-3" />
                {t('companyProfilePage.website')}
              </label>
              <input
                name="website"
                value={form.website}
                onChange={handleChange}
                placeholder={t('companyProfilePage.websitePlaceholder')}
                className="w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-[#f59e0b]/50 transition"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              <FileText className="h-3 w-3" />
              {t('companyProfilePage.companyDescription')}
            </label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={4}
              placeholder={t('companyProfilePage.descriptionPlaceholder')}
              className="w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-[#f59e0b]/50 transition resize-y"
            />
          </div>
        </div>

        {/* Security */}
        <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-[#f59e0b]" />
            <h3 className="text-sm font-semibold text-zinc-200">{t('companyProfilePage.verificationSecurity')}</h3>
          </div>
          <div className="space-y-2 text-xs text-zinc-400">
            <p>• {t('companyProfilePage.emailVerified')}: <span className="text-emerald-400">{t('common.yes')}</span></p>
            <p>• {t('companyProfilePage.companyDocuments')}: <span className="text-emerald-400">{t('companyProfilePage.approved')}</span></p>
            <p>• {t('companyProfilePage.accountStatus')}: <span className="text-emerald-400">{t('companyProfilePage.active')}</span></p>
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
            {t('companyProfilePage.saveProfile')}
          </button>
        </div>
      </form>
    </div>
  );
}