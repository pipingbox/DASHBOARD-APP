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
} from 'lucide-react';
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
import type { WorkExperience, WorkExperienceInput } from '@/lib/workerProfile';
import { LANGUAGE_NAMES } from '@/lib/workerProfile';
import {
  deleteWorkerExperience,
  insertWorkerExperience,
  loadWorkerExperiences,
  setWorkerExperienceVisibility,
  updateWorkerExperience,
} from '@/lib/workerExperienceService';

export function WorkExperienceSection({
  experienceToEdit,
  onEditHandled,
}: {
  experienceToEdit: WorkExperience | null;
  onEditHandled: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [items, setItems] = useState<WorkExperience[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<WorkExperience | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WorkExperience | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const result = await loadWorkerExperiences(user.id);
      if (!result.ok) {
        toast.error(result.error);
      } else {
        setItems(result.data);
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
    setDialogOpen(true);
  };

  useEffect(() => {
    if (!experienceToEdit) return;
    openEdit(experienceToEdit);
    onEditHandled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experienceToEdit]);

  const toggleVisibility = async (exp: WorkExperience) => {
    if (!user) return;
    const previousItems = [...items];
    const newVal = !exp.visible_to_companies;
    setItems((prev) =>
      prev.map((i) => (i.id === exp.id ? { ...i, visible_to_companies: newVal } : i))
    );
    try {
      const result = await setWorkerExperienceVisibility(exp.id, user.id, newVal);
      if (!result.ok) {
        toast.error(result.error);
        setItems(previousItems);
      }
    } catch {
      toast.error(t('common.unexpectedError'));
      setItems(previousItems);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const input: WorkExperienceInput = {
        position,
        company_name: companyName,
        project_name: projectName,
        city_region: cityRegion,
        country,
        start_date: startDate,
        end_date: endDate,
        currently_working: currentlyWorking,
        description_original: descriptionOriginal,
        description_en: descriptionEn,
        description_es: descriptionEs,
        description_fr: descriptionFr,
        description_nl: descriptionNl,
        description_de: descriptionDe,
        language_original: languageOriginal,
        responsibilities,
        visible_to_companies: visibleToCompanies,
      };

      // Single persistence route (WFA-001): shared service, no local
      // insert/update implementation.
      const result = editing
        ? await updateWorkerExperience(editing.id, user.id, input)
        : await insertWorkerExperience(user.id, input);

      if (!result.ok) {
        toast.error(t(result.error, result.error));
        return;
      }

      if (editing) {
        setItems((prev) =>
          prev.map((i) => (i.id === editing.id ? { ...i, ...result.data } : i))
        );
        toast.success(t('workerProfile.experience.updated'));
      } else {
        setItems((prev) => [result.data, ...prev]);
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
    if (!deleteTarget || !user) return;
    setDeleting(true);
    const previousItems = [...items];
    setItems((prev) => prev.filter((i) => i.id !== deleteTarget.id));
    try {
      const result = await deleteWorkerExperience(deleteTarget.id, user.id);
      if (!result.ok) {
        toast.error(result.error);
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
            {/* PB-UI-DOM-INSERTBEFORE-001: span anchor — auto-translate detaches bare text and the loading→content swap then throws NotFoundError removeChild */}
            <span>{t('common.loading')}</span>
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
                <span>
                  {saving
                    ? t('common.saving')
                    : editing
                      ? t('common.update')
                      : t('common.create')}
                </span>
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
              <span>{t('common.delete')}</span>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}