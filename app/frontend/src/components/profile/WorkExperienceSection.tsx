import { useEffect, useState, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Briefcase,
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  MapPin,
  Calendar,
  Loader2,
  Languages,
  Sparkles,
  Globe,
} from 'lucide-react';
import { supabase, TABLES } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { WorkExperience, TranslationLanguage } from '@/lib/workerProfile';
import { normalizeExperience, TRANSLATION_FIELDS, LANGUAGE_NAMES } from '@/lib/workerProfile';

/**
 * Placeholder for AI-powered translation generation.
 * Replace with actual backend edge function call when ready.
 */
function generateTranslation(originalText: string, targetLang: TranslationLanguage): string {
  const lines = originalText.split('\n').filter((l) => l.trim());
  const polished = lines
    .map((line) => {
      const trimmed = line.trim();
      return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    })
    .join('. ');

  const langLabel = LANGUAGE_NAMES[targetLang] || targetLang.toUpperCase();
  // Placeholder: in production this would call an AI translation API
  return `[${langLabel} Translation] ${polished}`;
}

export function WorkExperienceSection() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [items, setItems] = useState<WorkExperience[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<WorkExperience | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WorkExperience | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Form state — mapped to DB column names
  const [position, setPosition] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [cityRegion, setCityRegion] = useState('');
  const [country, setCountry] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currentlyWorking, setCurrentlyWorking] = useState(false);
  const [descriptionOriginal, setDescriptionOriginal] = useState('');
  const [descriptionEn, setDescriptionEn] = useState('');
  const [descriptionEs, setDescriptionEs] = useState('');
  const [descriptionFr, setDescriptionFr] = useState('');
  const [descriptionNl, setDescriptionNl] = useState('');
  const [descriptionDe, setDescriptionDe] = useState('');
  const [languageOriginal, setLanguageOriginal] = useState('');
  const [responsibilities, setResponsibilities] = useState('');
  const [visibleToCompanies, setVisibleToCompanies] = useState(true);

  // Translation panel toggle
  const [showTranslations, setShowTranslations] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from(TABLES.workerExperiences)
        .select('*')
        .eq('user_id', user.id)
        .order('start_date', { ascending: false, nullsFirst: false });
      if (error) {
        toast.error(error.message);
      } else {
        const normalized = (data ?? []).map((row) =>
          normalizeExperience(row as Record<string, unknown>)
        );
        setItems(normalized);
      }
    } catch {
      toast.error(t('common.unexpectedError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const resetForm = () => {
    setPosition('');
    setCompanyName('');
    setProjectName('');
    setCityRegion('');
    setCountry('');
    setStartDate('');
    setEndDate('');
    setCurrentlyWorking(false);
    setDescriptionOriginal('');
    setDescriptionEn('');
    setDescriptionEs('');
    setDescriptionFr('');
    setDescriptionNl('');
    setDescriptionDe('');
    setLanguageOriginal('');
    setResponsibilities('');
    setVisibleToCompanies(true);
    setShowTranslations(false);
  };

  const openAdd = () => {
    setEditing(null);
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (exp: WorkExperience) => {
    setEditing(exp);
    setPosition(exp.position);
    setCompanyName(exp.company_name);
    setProjectName(exp.project_name ?? '');
    setCityRegion(exp.city_region ?? '');
    setCountry(exp.country ?? '');
    setStartDate(exp.start_date ?? '');
    setEndDate(exp.end_date ?? '');
    setCurrentlyWorking(exp.currently_working);
    setDescriptionOriginal(exp.description_original ?? '');
    setDescriptionEn(exp.description_en ?? '');
    setDescriptionEs(exp.description_es ?? '');
    setDescriptionFr(exp.description_fr ?? '');
    setDescriptionNl(exp.description_nl ?? '');
    setDescriptionDe(exp.description_de ?? '');
    setLanguageOriginal(exp.language_original ?? '');
    setResponsibilities(exp.responsibilities ?? '');
    setVisibleToCompanies(exp.visible_to_companies);
    // Show translations panel if any translations exist
    setShowTranslations(
      !!(exp.description_en || exp.description_es || exp.description_fr || exp.description_nl || exp.description_de)
    );
    setDialogOpen(true);
  };

  const toggleVisibility = async (exp: WorkExperience) => {
    const previousItems = [...items];
    const newVal = !exp.visible_to_companies;
    setItems((prev) =>
      prev.map((i) => (i.id === exp.id ? { ...i, visible_to_companies: newVal } : i))
    );
    try {
      const { error } = await supabase
        .from(TABLES.workerExperiences)
        .update({ visible_to_companies: newVal })
        .eq('id', exp.id);
      if (error) {
        toast.error(error.message);
        setItems(previousItems);
      }
    } catch {
      toast.error(t('common.unexpectedError'));
      setItems(previousItems);
    }
  };

  const handleGenerateTranslation = (targetLang: TranslationLanguage) => {
    if (!descriptionOriginal.trim()) {
      toast.error(t('workerProfile.experience.noOriginalText'));
      return;
    }
    setGenerating(true);
    setTimeout(() => {
      const result = generateTranslation(descriptionOriginal, targetLang);
      switch (targetLang) {
        case 'en':
          setDescriptionEn(result);
          break;
        case 'es':
          setDescriptionEs(result);
          break;
        case 'fr':
          setDescriptionFr(result);
          break;
        case 'nl':
          setDescriptionNl(result);
          break;
        case 'de':
          setDescriptionDe(result);
          break;
      }
      setGenerating(false);
      toast.success(t('workerProfile.experience.translationGenerated', { lang: LANGUAGE_NAMES[targetLang] }));
    }, 800);
  };

  const handleGenerateAll = () => {
    if (!descriptionOriginal.trim()) {
      toast.error(t('workerProfile.experience.noOriginalText'));
      return;
    }
    setGenerating(true);
    setTimeout(() => {
      const langs: TranslationLanguage[] = ['en', 'es', 'fr', 'nl', 'de'];
      for (const lang of langs) {
        const result = generateTranslation(descriptionOriginal, lang);
        switch (lang) {
          case 'en':
            setDescriptionEn(result);
            break;
          case 'es':
            setDescriptionEs(result);
            break;
          case 'fr':
            setDescriptionFr(result);
            break;
          case 'nl':
            setDescriptionNl(result);
            break;
          case 'de':
            setDescriptionDe(result);
            break;
        }
      }
      setGenerating(false);
      toast.success(t('workerProfile.experience.allTranslationsGenerated'));
    }, 1200);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!position.trim() || !companyName.trim()) {
      toast.error(t('workerProfile.experience.titleCompanyRequired'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        position: position.trim(),
        company_name: companyName.trim(),
        project_name: projectName.trim() || null,
        city_region: cityRegion.trim() || null,
        country: country.trim() || null,
        start_date: startDate || null,
        end_date: currentlyWorking ? null : endDate || null,
        currently_working: currentlyWorking,
        description_original: descriptionOriginal.trim() || null,
        description_en: descriptionEn.trim() || null,
        description_es: descriptionEs.trim() || null,
        description_fr: descriptionFr.trim() || null,
        description_nl: descriptionNl.trim() || null,
        description_de: descriptionDe.trim() || null,
        language_original: languageOriginal.trim() || null,
        responsibilities: responsibilities.trim() || null,
        visible_to_companies: visibleToCompanies,
      };

      if (editing) {
        const { error } = await supabase
          .from(TABLES.workerExperiences)
          .update(payload)
          .eq('id', editing.id);
        if (error) {
          toast.error(error.message);
          return;
        }
        setItems((prev) =>
          prev.map((i) =>
            i.id === editing.id
              ? { ...i, ...payload }
              : i
          )
        );
        toast.success(t('workerProfile.experience.updated'));
      } else {
        const { data, error } = await supabase
          .from(TABLES.workerExperiences)
          .insert({ ...payload, user_id: user.id })
          .select()
          .single();
        if (error) {
          toast.error(error.message);
          return;
        }
        if (data) {
          setItems((prev) => [normalizeExperience(data as Record<string, unknown>), ...prev]);
        } else {
          await load();
        }
        toast.success(t('workerProfile.experience.added'));
      }
      setDialogOpen(false);
    } catch {
      toast.error(t('common.unexpectedError'));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const previousItems = [...items];
    setItems((prev) => prev.filter((i) => i.id !== deleteTarget.id));
    try {
      const { error } = await supabase
        .from(TABLES.workerExperiences)
        .delete()
        .eq('id', deleteTarget.id);
      if (error) {
        toast.error(error.message);
        setItems(previousItems);
      } else {
        toast.success(t('workerProfile.experience.deleted'));
      }
    } catch {
      toast.error(t('common.unexpectedError'));
      setItems(previousItems);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  /** Count how many translations exist for an experience */
  const countTranslations = (exp: WorkExperience): number => {
    let count = 0;
    if (exp.description_en) count++;
    if (exp.description_es) count++;
    if (exp.description_fr) count++;
    if (exp.description_nl) count++;
    if (exp.description_de) count++;
    return count;
  };

  return (
    <section className="border border-zinc-800/80 bg-[#0d0d0d] p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-[#f59e0b]">
            {t('workerProfile.experience.label')}
          </p>
          <h2 className="mt-1 text-xl font-semibold">
            {t('workerProfile.experience.title')}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            {t('workerProfile.experience.description')}
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center gap-2 bg-[#f59e0b] px-3 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-black hover:bg-[#d97706]"
        >
          <Plus className="h-3.5 w-3.5" />
          {t('workerProfile.experience.add')}
        </button>
      </div>

      <div className="mt-6 space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('common.loading')}
          </div>
        ) : items.length === 0 ? (
          <div className="border border-dashed border-zinc-800 bg-zinc-950 p-8 text-center">
            <Briefcase className="mx-auto h-8 w-8 text-zinc-600" />
            <p className="mt-3 text-sm text-zinc-400">
              {t('workerProfile.experience.empty')}
            </p>
          </div>
        ) : (
          items.map((exp) => (
            <div
              key={exp.id}
              className={`border bg-zinc-950 p-4 ${exp.visible_to_companies ? 'border-zinc-800' : 'border-zinc-800/50 opacity-60'}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-zinc-100">
                      {exp.position}
                    </h3>
                    {!exp.visible_to_companies && (
                      <span className="inline-flex items-center gap-1 border border-zinc-700 px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-zinc-500">
                        <EyeOff className="h-3 w-3" />
                        {t('workerProfile.hidden')}
                      </span>
                    )}
                    {exp.currently_working && (
                      <span className="inline-flex items-center gap-1 border border-emerald-600/40 bg-emerald-600/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-emerald-300">
                        {t('workerProfile.experience.current')}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-zinc-400">{exp.company_name}</p>
                  {exp.project_name && (
                    <p className="mt-0.5 text-xs text-zinc-500">{exp.project_name}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-4 text-xs text-zinc-500">
                    {(exp.city_region || exp.country) && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {[exp.city_region, exp.country].filter(Boolean).join(', ')}
                      </span>
                    )}
                    {exp.start_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(exp.start_date).toLocaleDateString()} –{' '}
                        {exp.currently_working
                          ? t('workerProfile.experience.present')
                          : exp.end_date
                            ? new Date(exp.end_date).toLocaleDateString()
                            : ''}
                      </span>
                    )}
                  </div>

                  {/* Display original description */}
                  {exp.description_original && (
                    <div className="mt-3 space-y-2">
                      <div>
                        <span className="text-[10px] uppercase tracking-wider text-zinc-600 flex items-center gap-1">
                          <Languages className="h-3 w-3" />
                          {exp.language_original
                            ? LANGUAGE_NAMES[exp.language_original] || exp.language_original
                            : t('workerProfile.experience.originalText')}
                        </span>
                        <p className="mt-0.5 text-sm text-zinc-400 line-clamp-3">
                          {exp.description_original}
                        </p>
                      </div>
                      {/* Show translation count indicator */}
                      {countTranslations(exp) > 0 && (
                        <div className="flex items-center gap-1.5">
                          <Globe className="h-3 w-3 text-blue-400/70" />
                          <span className="text-[10px] text-blue-400/70">
                            {t('workerProfile.experience.translationsAvailable', { count: countTranslations(exp) })}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => toggleVisibility(exp)}
                    title={exp.visible_to_companies ? t('workerProfile.hide') : t('workerProfile.show')}
                    className="inline-flex items-center gap-1 border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                  >
                    {exp.visible_to_companies ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(exp)}
                    title={t('common.edit')}
                    className="inline-flex items-center gap-1 border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(exp)}
                    title={t('common.delete')}
                    className="inline-flex items-center gap-1 border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-400 hover:border-red-600/60 hover:text-red-400"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!saving) setDialogOpen(open); }}>
        <DialogContent className="max-w-2xl border-zinc-800 bg-[#0d0d0d] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? t('workerProfile.experience.editTitle')
                : t('workerProfile.experience.addTitle')}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-zinc-400">
                  {t('workerProfile.experience.jobTitle')} *
                </Label>
                <Input
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  placeholder={t('workerProfile.experience.jobTitlePlaceholder')}
                  required
                  className="bg-zinc-950 border-zinc-800 text-zinc-100 focus-visible:ring-[#f59e0b] [color-scheme:dark]"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-zinc-400">
                  {t('workerProfile.experience.company')} *
                </Label>
                <Input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder={t('workerProfile.experience.companyPlaceholder')}
                  required
                  className="bg-zinc-950 border-zinc-800 text-zinc-100 focus-visible:ring-[#f59e0b] [color-scheme:dark]"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-zinc-400">
                  {t('workerProfile.experience.projectName')}
                </Label>
                <Input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder={t('workerProfile.experience.projectNamePlaceholder')}
                  className="bg-zinc-950 border-zinc-800 text-zinc-100 focus-visible:ring-[#f59e0b] [color-scheme:dark]"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-zinc-400">
                  {t('workerProfile.experience.location')}
                </Label>
                <Input
                  value={cityRegion}
                  onChange={(e) => setCityRegion(e.target.value)}
                  placeholder={t('workerProfile.experience.locationPlaceholder')}
                  className="bg-zinc-950 border-zinc-800 text-zinc-100 focus-visible:ring-[#f59e0b] [color-scheme:dark]"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-zinc-400">
                  {t('workerProfile.experience.country')}
                </Label>
                <Input
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder={t('workerProfile.experience.countryPlaceholder')}
                  className="bg-zinc-950 border-zinc-800 text-zinc-100 focus-visible:ring-[#f59e0b] [color-scheme:dark]"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-zinc-400">
                  {t('workerProfile.experience.startDate')}
                </Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-zinc-950 border-zinc-800 text-zinc-100 focus-visible:ring-[#f59e0b] [color-scheme:dark]"
                />
              </div>
              {!currentlyWorking && (
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-zinc-400">
                    {t('workerProfile.experience.endDate')}
                  </Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-zinc-950 border-zinc-800 text-zinc-100 focus-visible:ring-[#f59e0b] [color-scheme:dark]"
                  />
                </div>
              )}
              <div className="flex items-center gap-3 pt-6">
                <Switch
                  checked={currentlyWorking}
                  onCheckedChange={setCurrentlyWorking}
                  className="data-[state=checked]:bg-[#f59e0b]"
                />
                <Label className="text-xs text-zinc-400">
                  {t('workerProfile.experience.currentJob')}
                </Label>
              </div>
            </div>

            {/* Language selector */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400">
                {t('workerProfile.experience.languageOriginal')}
              </Label>
              <select
                value={languageOriginal}
                onChange={(e) => setLanguageOriginal(e.target.value)}
                className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#f59e0b]"
              >
                <option value="">{t('workerProfile.experience.selectLanguage')}</option>
                <option value="es">Español</option>
                <option value="en">English</option>
                <option value="fr">Français</option>
                <option value="nl">Nederlands</option>
                <option value="de">Deutsch</option>
                <option value="pt">Português</option>
              </select>
            </div>

            {/* Original description */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                <Languages className="h-3 w-3" />
                {t('workerProfile.experience.descriptionOriginal')}
              </Label>
              <Textarea
                value={descriptionOriginal}
                onChange={(e) => setDescriptionOriginal(e.target.value)}
                rows={4}
                placeholder={t('workerProfile.experience.descriptionOriginalPlaceholder')}
                className="bg-zinc-950 border-zinc-800 text-zinc-100 focus-visible:ring-[#f59e0b] [color-scheme:dark]"
              />
            </div>

            {/* Translations section */}
            <div className="border border-zinc-800 rounded-md p-4 space-y-4">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowTranslations(!showTranslations)}
                  className="flex items-center gap-2 text-sm font-medium text-zinc-300 hover:text-zinc-100"
                >
                  <Globe className="h-4 w-4 text-blue-400" />
                  {t('workerProfile.experience.translations')}
                  <span className="text-[10px] text-zinc-500 ml-1">
                    {showTranslations ? '▼' : '▶'}
                  </span>
                </button>
                <Button
                  type="button"
                  onClick={handleGenerateAll}
                  disabled={generating || !descriptionOriginal.trim()}
                  size="sm"
                  className="bg-blue-600 text-white hover:bg-blue-700 text-[11px] font-semibold gap-1.5 h-7"
                >
                  {generating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  {t('workerProfile.experience.generateAll')}
                </Button>
              </div>

              {showTranslations && (
                <div className="space-y-4 pt-2">
                  {/* English */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs uppercase tracking-wider text-blue-400/70 flex items-center gap-1.5">
                        <span>🇬🇧</span> English
                      </Label>
                      <Button
                        type="button"
                        onClick={() => handleGenerateTranslation('en')}
                        disabled={generating || !descriptionOriginal.trim()}
                        size="sm"
                        variant="ghost"
                        className="text-[10px] text-blue-400 hover:text-blue-300 h-6 px-2"
                      >
                        <Sparkles className="h-3 w-3 mr-1" />
                        {t('workerProfile.experience.generate')}
                      </Button>
                    </div>
                    <Textarea
                      value={descriptionEn}
                      onChange={(e) => setDescriptionEn(e.target.value)}
                      rows={3}
                      placeholder={t('workerProfile.experience.translationPlaceholder', { lang: 'English' })}
                      className="bg-zinc-950 border-zinc-800 text-zinc-100 focus-visible:ring-[#f59e0b] [color-scheme:dark] text-sm"
                    />
                  </div>

                  {/* Spanish */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs uppercase tracking-wider text-blue-400/70 flex items-center gap-1.5">
                        <span>🇪🇸</span> Español
                      </Label>
                      <Button
                        type="button"
                        onClick={() => handleGenerateTranslation('es')}
                        disabled={generating || !descriptionOriginal.trim()}
                        size="sm"
                        variant="ghost"
                        className="text-[10px] text-blue-400 hover:text-blue-300 h-6 px-2"
                      >
                        <Sparkles className="h-3 w-3 mr-1" />
                        {t('workerProfile.experience.generate')}
                      </Button>
                    </div>
                    <Textarea
                      value={descriptionEs}
                      onChange={(e) => setDescriptionEs(e.target.value)}
                      rows={3}
                      placeholder={t('workerProfile.experience.translationPlaceholder', { lang: 'Español' })}
                      className="bg-zinc-950 border-zinc-800 text-zinc-100 focus-visible:ring-[#f59e0b] [color-scheme:dark] text-sm"
                    />
                  </div>

                  {/* French */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs uppercase tracking-wider text-blue-400/70 flex items-center gap-1.5">
                        <span>🇫🇷</span> Français
                      </Label>
                      <Button
                        type="button"
                        onClick={() => handleGenerateTranslation('fr')}
                        disabled={generating || !descriptionOriginal.trim()}
                        size="sm"
                        variant="ghost"
                        className="text-[10px] text-blue-400 hover:text-blue-300 h-6 px-2"
                      >
                        <Sparkles className="h-3 w-3 mr-1" />
                        {t('workerProfile.experience.generate')}
                      </Button>
                    </div>
                    <Textarea
                      value={descriptionFr}
                      onChange={(e) => setDescriptionFr(e.target.value)}
                      rows={3}
                      placeholder={t('workerProfile.experience.translationPlaceholder', { lang: 'Français' })}
                      className="bg-zinc-950 border-zinc-800 text-zinc-100 focus-visible:ring-[#f59e0b] [color-scheme:dark] text-sm"
                    />
                  </div>

                  {/* Dutch */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs uppercase tracking-wider text-blue-400/70 flex items-center gap-1.5">
                        <span>🇳🇱</span> Nederlands
                      </Label>
                      <Button
                        type="button"
                        onClick={() => handleGenerateTranslation('nl')}
                        disabled={generating || !descriptionOriginal.trim()}
                        size="sm"
                        variant="ghost"
                        className="text-[10px] text-blue-400 hover:text-blue-300 h-6 px-2"
                      >
                        <Sparkles className="h-3 w-3 mr-1" />
                        {t('workerProfile.experience.generate')}
                      </Button>
                    </div>
                    <Textarea
                      value={descriptionNl}
                      onChange={(e) => setDescriptionNl(e.target.value)}
                      rows={3}
                      placeholder={t('workerProfile.experience.translationPlaceholder', { lang: 'Nederlands' })}
                      className="bg-zinc-950 border-zinc-800 text-zinc-100 focus-visible:ring-[#f59e0b] [color-scheme:dark] text-sm"
                    />
                  </div>

                  {/* German */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs uppercase tracking-wider text-blue-400/70 flex items-center gap-1.5">
                        <span>🇩🇪</span> Deutsch
                      </Label>
                      <Button
                        type="button"
                        onClick={() => handleGenerateTranslation('de')}
                        disabled={generating || !descriptionOriginal.trim()}
                        size="sm"
                        variant="ghost"
                        className="text-[10px] text-blue-400 hover:text-blue-300 h-6 px-2"
                      >
                        <Sparkles className="h-3 w-3 mr-1" />
                        {t('workerProfile.experience.generate')}
                      </Button>
                    </div>
                    <Textarea
                      value={descriptionDe}
                      onChange={(e) => setDescriptionDe(e.target.value)}
                      rows={3}
                      placeholder={t('workerProfile.experience.translationPlaceholder', { lang: 'Deutsch' })}
                      className="bg-zinc-950 border-zinc-800 text-zinc-100 focus-visible:ring-[#f59e0b] [color-scheme:dark] text-sm"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400">
                {t('workerProfile.experience.responsibilities')}
              </Label>
              <Textarea
                value={responsibilities}
                onChange={(e) => setResponsibilities(e.target.value)}
                rows={3}
                placeholder={t('workerProfile.experience.responsibilitiesPlaceholder')}
                className="bg-zinc-950 border-zinc-800 text-zinc-100 focus-visible:ring-[#f59e0b] [color-scheme:dark]"
              />
            </div>

            <div className="flex items-center gap-3">
              <Switch
                checked={visibleToCompanies}
                onCheckedChange={setVisibleToCompanies}
                className="data-[state=checked]:bg-[#f59e0b]"
              />
              <Label className="text-xs text-zinc-400">
                {t('workerProfile.visibleToCompanies')}
              </Label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
                className="text-zinc-400 hover:text-zinc-200"
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold"
              >
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {saving
                  ? t('common.saving')
                  : editing
                    ? t('common.update')
                    : t('common.create')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent className="border-zinc-800 bg-[#0d0d0d]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-100">
              {t('workerProfile.experience.confirmDelete')}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              {t('workerProfile.experience.confirmDeleteDesc', {
                title: deleteTarget?.position,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deleting}
              className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
            >
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}