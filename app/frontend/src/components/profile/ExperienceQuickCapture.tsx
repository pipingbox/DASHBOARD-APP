import { useEffect, useState, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Briefcase, CheckCircle2, Loader2, Plus, ChevronDown } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { WorkExperience } from '@/lib/workerProfile';
import {
  insertWorkerExperience,
  updateWorkerExperience,
} from '@/lib/workerExperienceService';

/**
 * Quick Experience Capture — WFA-001 (D18 / PB-WORKFORCE-ACTIVATION).
 *
 * Low-friction flow to add a QUALIFYING EXPERIENCE (position + company are
 * the only required fields), unlocking the WORKFORCE READY blocker. The
 * canonical persistence route is the shared workerExperienceService — this
 * component has NO insert/update logic of its own.
 *
 * Credibility rule (D18 §7): the placeholder "translation generation" of the
 * full section is NOT exposed here. No pseudo-translated content can enter a
 * professional profile through the quick flow.
 *
 * Post-save: "Add details" reopens the saved row with the optional fields
 * expanded (edit via the same service), or "Add another experience" resets
 * the quick form.
 */
export function ExperienceQuickCapture({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after every successful save so the banner can re-query counts. */
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [position, setPosition] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currentlyWorking, setCurrentlyWorking] = useState(false);
  const [country, setCountry] = useState('');
  const [projectName, setProjectName] = useState('');
  const [cityRegion, setCityRegion] = useState('');
  const [description, setDescription] = useState('');
  const [responsibilities, setResponsibilities] = useState('');
  const [visibleToCompanies, setVisibleToCompanies] = useState(true);
  const [showOptional, setShowOptional] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedRow, setSavedRow] = useState<WorkExperience | null>(null);

  // Reset on open; keep state while the dialog stays open (error/retry must
  // not wipe the user's input).
  useEffect(() => {
    if (open) resetForm();
  }, [open]);

  const resetForm = () => {
    setPosition('');
    setCompanyName('');
    setStartDate('');
    setEndDate('');
    setCurrentlyWorking(false);
    setCountry('');
    setProjectName('');
    setCityRegion('');
    setDescription('');
    setResponsibilities('');
    setVisibleToCompanies(true);
    setShowOptional(false);
    setSavedRow(null);
    setSaving(false);
  };

  const buildInput = () => ({
    position,
    company_name: companyName,
    project_name: projectName,
    city_region: cityRegion,
    country,
    start_date: startDate,
    end_date: endDate,
    currently_working: currentlyWorking,
    description_original: description,
    responsibilities,
    visible_to_companies: visibleToCompanies,
  });

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!position.trim() || !companyName.trim()) {
      toast.error(t('workerProfile.experience.titleCompanyRequired'));
      return;
    }
    setSaving(true);
    try {
      // Single persistence route (shared service). Insert for a new capture;
      // update when the user chose "Add details" on the just-saved row.
      const result = savedRow
        ? await updateWorkerExperience(savedRow.id, user.id, buildInput())
        : await insertWorkerExperience(user.id, buildInput());

      if (!result.ok) {
        // Recoverable error: form values are kept so the user can retry.
        toast.error(t(result.error, result.error));
        return;
      }
      setSavedRow(result.data);
      setShowOptional(true);
      onSaved();
      toast.success(
        t(
          'profile.quickExperience.savedToast',
          'Experience added — your work history can now be evaluated by companies.',
        ),
      );
    } catch {
      toast.error(t('common.unexpectedError'));
    } finally {
      setSaving(false);
    }
  };

  const addAnother = () => {
    setPosition('');
    setCompanyName('');
    setStartDate('');
    setEndDate('');
    setCurrentlyWorking(false);
    setCountry('');
    setProjectName('');
    setCityRegion('');
    setDescription('');
    setResponsibilities('');
    setVisibleToCompanies(true);
    setShowOptional(false);
    setSavedRow(null);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="max-w-lg border-zinc-800 bg-[#0d0d0d] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-[#f59e0b]" />
            {t('profile.quickExperience.title', 'Add work experience')}
          </DialogTitle>
        </DialogHeader>

        {savedRow && (
          <div className="flex items-start gap-2 border border-emerald-800/60 bg-emerald-950/30 p-3 text-sm text-emerald-300">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <span>
              {t(
                'profile.quickExperience.saved',
                'Experience added — your work history can now be evaluated by companies.',
              )}
            </span>
          </div>
        )}

        <form onSubmit={save} className="space-y-4">
          {/* Required — the QUALIFYING EXPERIENCE predicate (WFA-001) */}
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
          </div>

          {/* Recommended in the quick flow */}
          <div className="grid gap-4 sm:grid-cols-2">
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
            <div className="flex items-center gap-3 sm:pt-6">
              <Switch
                checked={currentlyWorking}
                onCheckedChange={setCurrentlyWorking}
                className="data-[state=checked]:bg-[#f59e0b]"
              />
              <Label className="text-xs text-zinc-400">
                {t('workerProfile.experience.currentJob')}
              </Label>
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
          </div>

          {/* Optional / expandable */}
          {!savedRow && (
            <button
              type="button"
              onClick={() => setShowOptional(!showOptional)}
              className="flex w-full items-center gap-1.5 border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
            >
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${showOptional ? 'rotate-180' : ''}`}
              />
              {t('profile.quickExperience.moreDetails', 'Add more details (optional)')}
            </button>
          )}
          {showOptional && (
            <div className="space-y-4 border border-zinc-800 p-3">
              <div className="grid gap-4 sm:grid-cols-2">
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
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-zinc-400">
                  {t('workerProfile.experience.descriptionOriginal')}
                </Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
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
                  rows={2}
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
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="text-zinc-400 hover:text-zinc-200"
            >
              {savedRow
                ? t('common.close', 'Close')
                : t('common.cancel', 'Cancel')}
            </Button>
            {savedRow && (
              <Button
                type="button"
                variant="outline"
                onClick={addAnother}
                disabled={saving}
                className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {t('profile.quickExperience.addAnother', 'Add another experience')}
              </Button>
            )}
            <Button
              type="submit"
              disabled={saving}
              className="bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold"
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {saving
                ? t('common.saving', 'Saving...')
                : savedRow
                  ? t('profile.quickExperience.saveDetails', 'Save details')
                  : t('profile.quickExperience.save', 'Save experience')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
