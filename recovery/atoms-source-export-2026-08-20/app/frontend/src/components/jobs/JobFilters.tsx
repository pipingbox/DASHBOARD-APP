import {
  Briefcase,
  Building2,
  Globe,
  Anchor,
  AlertTriangle,
  X,
  SlidersHorizontal,
  RotateCcw,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { COUNTRIES, DISCIPLINES, WORK_TYPES, CONTRACT_TYPES_OPTIONS } from '@/lib/jobs/static-data';

interface JobFiltersProps {
  showFilters: boolean;
  setShowFilters: (v: boolean) => void;
  selectedCountries: string[];
  setSelectedCountries: React.Dispatch<React.SetStateAction<string[]>>;
  selectedDisciplines: string[];
  setSelectedDisciplines: React.Dispatch<React.SetStateAction<string[]>>;
  selectedWorkTypes: string[];
  setSelectedWorkTypes: React.Dispatch<React.SetStateAction<string[]>>;
  selectedContractTypes: string[];
  setSelectedContractTypes: React.Dispatch<React.SetStateAction<string[]>>;
  urgentOnly: boolean;
  setUrgentOnly: (v: boolean) => void;
  toggleFilter: (arr: string[], setArr: React.Dispatch<React.SetStateAction<string[]>>, val: string) => void;
  activeFilterCount: number;
  filteredCount: number;
  clearFilters: () => void;
}

export function JobFilters({
  showFilters,
  setShowFilters,
  selectedCountries,
  setSelectedCountries,
  selectedDisciplines,
  setSelectedDisciplines,
  selectedWorkTypes,
  setSelectedWorkTypes,
  selectedContractTypes,
  setSelectedContractTypes,
  urgentOnly,
  setUrgentOnly,
  toggleFilter,
  activeFilterCount,
  filteredCount,
  clearFilters,
}: JobFiltersProps) {
  const { t } = useTranslation();

  if (!showFilters) return null;

  const filterContent = (isMobile: boolean) => (
    <>
      {/* Country */}
      <div className="space-y-3">
        <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-semibold">{t('jobs.country')}</label>
        <div className={isMobile ? 'flex flex-wrap gap-2' : 'grid grid-cols-2 gap-2'}>
          {COUNTRIES.map((c) => (
            <button
              key={c}
              onClick={() => toggleFilter(selectedCountries, setSelectedCountries, c)}
              className={`flex items-center gap-2 px-3 py-2 ${isMobile ? 'rounded-full' : 'rounded-lg'} border text-xs font-medium transition-all duration-200 ${
                selectedCountries.includes(c)
                  ? 'bg-[#f59e0b]/10 border-[#f59e0b]/40 text-[#f59e0b]'
                  : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
              }`}
            >
              {!isMobile && <Globe className="h-3 w-3 shrink-0" />}
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Discipline */}
      <div className="space-y-3">
        <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-semibold">{t('jobs.discipline')}</label>
        <div className={isMobile ? 'flex flex-wrap gap-2' : 'grid grid-cols-2 gap-2'}>
          {DISCIPLINES.map((d) => (
            <button
              key={d}
              onClick={() => toggleFilter(selectedDisciplines, setSelectedDisciplines, d)}
              className={`flex items-center gap-2 px-3 py-2 ${isMobile ? 'rounded-full' : 'rounded-lg'} border text-xs font-medium transition-all duration-200 ${
                selectedDisciplines.includes(d)
                  ? 'bg-[#f59e0b]/10 border-[#f59e0b]/40 text-[#f59e0b]'
                  : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
              }`}
            >
              {!isMobile && <Briefcase className="h-3 w-3 shrink-0" />}
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Work Type */}
      <div className="space-y-3">
        <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-semibold">{t('jobs.workType')}</label>
        <div className={isMobile ? 'flex flex-wrap gap-2' : 'grid grid-cols-2 gap-2'}>
          {WORK_TYPES.map((w) => (
            <button
              key={w}
              onClick={() => toggleFilter(selectedWorkTypes, setSelectedWorkTypes, w)}
              className={`flex items-center gap-2 px-3 py-2 ${isMobile ? 'rounded-full' : 'rounded-lg'} border text-xs font-medium transition-all duration-200 ${
                selectedWorkTypes.includes(w)
                  ? 'bg-[#f59e0b]/10 border-[#f59e0b]/40 text-[#f59e0b]'
                  : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
              }`}
            >
              {!isMobile && <Anchor className="h-3 w-3 shrink-0" />}
              {w}
            </button>
          ))}
        </div>
      </div>

      {/* Contract Type */}
      <div className="space-y-3">
        <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-semibold">{t('jobs.contractType')}</label>
        <div className={isMobile ? 'flex flex-wrap gap-2' : 'grid grid-cols-2 gap-2'}>
          {CONTRACT_TYPES_OPTIONS.map((ct) => (
            <button
              key={ct}
              onClick={() => toggleFilter(selectedContractTypes, setSelectedContractTypes, ct)}
              className={`flex items-center gap-2 px-3 py-2 ${isMobile ? 'rounded-full' : 'rounded-lg'} border text-xs font-medium transition-all duration-200 ${
                selectedContractTypes.includes(ct)
                  ? 'bg-[#f59e0b]/10 border-[#f59e0b]/40 text-[#f59e0b]'
                  : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
              }`}
            >
              {!isMobile && <Building2 className="h-3 w-3 shrink-0" />}
              {ct}
            </button>
          ))}
        </div>
      </div>

      {/* Urgent Toggle */}
      <button
        onClick={() => setUrgentOnly(!urgentOnly)}
        className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-all duration-200 ${
          urgentOnly
            ? 'bg-red-500/10 border-red-500/30'
            : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-600'
        }`}
      >
        <span className={`flex items-center gap-2 text-xs font-medium ${urgentOnly ? 'text-red-400' : 'text-zinc-400'}`}>
          <AlertTriangle className="h-3.5 w-3.5" />
          {t('jobs.urgentPositionsOnly')}
        </span>
        <div className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${urgentOnly ? 'bg-red-500' : 'bg-zinc-700'}`}>
          <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${urgentOnly ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </div>
      </button>
    </>
  );

  return (
    <div className="fixed inset-0 z-50" onClick={() => setShowFilters(false)}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" />

      {/* Desktop: Right Sidebar */}
      <div
        className="hidden md:block absolute top-0 right-0 h-full w-[380px] bg-[#0a0a0a] border-l border-zinc-800 shadow-2xl shadow-black/50 animate-in slide-in-from-right duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-zinc-800/80">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f59e0b]/10 border border-[#f59e0b]/20">
                <SlidersHorizontal className="h-4 w-4 text-[#f59e0b]" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-100">{t('jobs.filterJobs')}</h3>
                <p className="text-[10px] text-zinc-500">
                  {activeFilterCount} {activeFilterCount !== 1 ? t('jobs.activeFilterCount_plural', { count: activeFilterCount }) : t('jobs.activeFilterCount', { count: activeFilterCount })}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowFilters(false)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-all duration-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Filter Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
            {filterContent(false)}
          </div>

          {/* Footer */}
          <div className="p-5 border-t border-zinc-800/80 space-y-2.5">
            <Button
              onClick={() => setShowFilters(false)}
              className="w-full bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold"
            >
              {t('jobs.showResults', { count: filteredCount })}
            </Button>
            {activeFilterCount > 0 && (
              <Button
                variant="outline"
                onClick={clearFilters}
                className="w-full border-zinc-700 text-zinc-400 hover:text-zinc-200 !bg-transparent hover:!bg-zinc-900"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                {t('jobs.resetAllFilters')}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile: Bottom Sheet */}
      <div
        className="md:hidden absolute bottom-0 left-0 right-0 max-h-[85vh] bg-[#0a0a0a] border-t border-zinc-800 rounded-t-2xl shadow-2xl shadow-black/50 animate-in slide-in-from-bottom duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-zinc-700" />
        </div>

        <div className="flex flex-col max-h-[80vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800/80">
            <div className="flex items-center gap-2.5">
              <SlidersHorizontal className="h-4 w-4 text-[#f59e0b]" />
              <h3 className="text-sm font-semibold text-zinc-100">{t('jobs.filterJobs')}</h3>
              {activeFilterCount > 0 && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#f59e0b] text-[10px] font-bold text-black">
                  {activeFilterCount}
                </span>
              )}
            </div>
            <button
              onClick={() => setShowFilters(false)}
              className="text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Filter Content */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5" style={{ scrollbarWidth: 'none' }}>
            {filterContent(true)}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-zinc-800/80 space-y-2.5">
            <Button
              onClick={() => setShowFilters(false)}
              className="w-full bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold"
            >
              {t('jobs.showResults', { count: filteredCount })}
            </Button>
            {activeFilterCount > 0 && (
              <Button
                variant="outline"
                onClick={clearFilters}
                className="w-full border-zinc-700 text-zinc-400 !bg-transparent"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                {t('jobs.resetAll')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}