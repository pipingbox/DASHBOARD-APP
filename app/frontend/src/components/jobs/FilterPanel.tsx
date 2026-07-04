import {
  X,
  SlidersHorizontal,
  Globe,
  Briefcase,
  Anchor,
  Building2,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  COUNTRIES,
  DISCIPLINES,
  WORK_TYPES,
  CONTRACT_TYPES_OPTIONS,
} from '@/lib/jobs/static-data';

interface FilterPanelProps {
  open: boolean;
  onClose: () => void;
  selectedCountries: string[];
  selectedDisciplines: string[];
  selectedWorkTypes: string[];
  selectedContractTypes: string[];
  urgentOnly: boolean;
  activeFilterCount: number;
  filteredCount: number;
  toggleFilter: (arr: string[], setArr: React.Dispatch<React.SetStateAction<string[]>>, val: string) => void;
  setSelectedCountries: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedDisciplines: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedWorkTypes: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedContractTypes: React.Dispatch<React.SetStateAction<string[]>>;
  setUrgentOnly: React.Dispatch<React.SetStateAction<boolean>>;
  clearFilters: () => void;
}

export function FilterPanel({
  open,
  onClose,
  selectedCountries,
  selectedDisciplines,
  selectedWorkTypes,
  selectedContractTypes,
  urgentOnly,
  activeFilterCount,
  filteredCount,
  toggleFilter,
  setSelectedCountries,
  setSelectedDisciplines,
  setSelectedWorkTypes,
  setSelectedContractTypes,
  setUrgentOnly,
  clearFilters,
}: FilterPanelProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" />

      {/* Desktop: Right Sidebar */}
      <div
        className="hidden md:block absolute top-0 right-0 h-full w-[380px] bg-[#0a0a0a] border-l border-zinc-800 shadow-2xl shadow-black/50 animate-in slide-in-from-right duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between p-5 border-b border-zinc-800/80">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f59e0b]/10 border border-[#f59e0b]/20">
                <SlidersHorizontal className="h-4 w-4 text-[#f59e0b]" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-100">Filter Jobs</h3>
                <p className="text-[10px] text-zinc-500">{activeFilterCount} active filter{activeFilterCount !== 1 ? 's' : ''}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-all duration-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
            <FilterGroup label="Country" options={COUNTRIES} selected={selectedCountries} onToggle={(v) => toggleFilter(selectedCountries, setSelectedCountries, v)} icon={Globe} layout="grid" />
            <FilterGroup label="Discipline" options={DISCIPLINES} selected={selectedDisciplines} onToggle={(v) => toggleFilter(selectedDisciplines, setSelectedDisciplines, v)} icon={Briefcase} layout="grid" />
            <FilterGroup label="Work Type" options={WORK_TYPES} selected={selectedWorkTypes} onToggle={(v) => toggleFilter(selectedWorkTypes, setSelectedWorkTypes, v)} icon={Anchor} layout="grid" />
            <FilterGroup label="Contract Type" options={CONTRACT_TYPES_OPTIONS} selected={selectedContractTypes} onToggle={(v) => toggleFilter(selectedContractTypes, setSelectedContractTypes, v)} icon={Building2} layout="grid" />

            <div className="space-y-3">
              <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-semibold">Priority</label>
              <UrgentToggle urgentOnly={urgentOnly} setUrgentOnly={setUrgentOnly} />
            </div>
          </div>

          <div className="p-5 border-t border-zinc-800/80 space-y-2.5">
            <Button onClick={onClose} className="w-full bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold">
              Show {filteredCount} Result{filteredCount !== 1 ? 's' : ''}
            </Button>
            {activeFilterCount > 0 && (
              <Button variant="outline" onClick={clearFilters} className="w-full border-zinc-700 text-zinc-400 hover:text-zinc-200 !bg-transparent hover:!bg-zinc-900">
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Reset All Filters
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
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-zinc-700" />
        </div>

        <div className="flex flex-col max-h-[80vh]">
          <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800/80">
            <div className="flex items-center gap-2.5">
              <SlidersHorizontal className="h-4 w-4 text-[#f59e0b]" />
              <h3 className="text-sm font-semibold text-zinc-100">Filter Jobs</h3>
              {activeFilterCount > 0 && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#f59e0b] text-[10px] font-bold text-black">
                  {activeFilterCount}
                </span>
              )}
            </div>
            <button onClick={onClose} className="text-zinc-400 hover:text-zinc-200 transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5" style={{ scrollbarWidth: 'none' }}>
            <FilterGroup label="Country" options={COUNTRIES} selected={selectedCountries} onToggle={(v) => toggleFilter(selectedCountries, setSelectedCountries, v)} layout="chips" />
            <FilterGroup label="Discipline" options={DISCIPLINES} selected={selectedDisciplines} onToggle={(v) => toggleFilter(selectedDisciplines, setSelectedDisciplines, v)} layout="chips" />
            <FilterGroup label="Work Type" options={WORK_TYPES} selected={selectedWorkTypes} onToggle={(v) => toggleFilter(selectedWorkTypes, setSelectedWorkTypes, v)} layout="chips" />
            <FilterGroup label="Contract Type" options={CONTRACT_TYPES_OPTIONS} selected={selectedContractTypes} onToggle={(v) => toggleFilter(selectedContractTypes, setSelectedContractTypes, v)} layout="chips" />
            <UrgentToggle urgentOnly={urgentOnly} setUrgentOnly={setUrgentOnly} />
          </div>

          <div className="px-5 py-4 border-t border-zinc-800/80 space-y-2.5">
            <Button onClick={onClose} className="w-full bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold">
              Show {filteredCount} Result{filteredCount !== 1 ? 's' : ''}
            </Button>
            {activeFilterCount > 0 && (
              <Button variant="outline" onClick={clearFilters} className="w-full border-zinc-700 text-zinc-400 !bg-transparent">
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Reset All
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterGroup({
  label,
  options,
  selected,
  onToggle,
  icon: Icon,
  layout,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (val: string) => void;
  icon?: React.ElementType;
  layout: 'grid' | 'chips';
}) {
  return (
    <div className="space-y-3">
      <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-semibold">{label}</label>
      {layout === 'grid' ? (
        <div className="grid grid-cols-2 gap-2">
          {options.map((opt) => (
            <button
              key={opt}
              onClick={() => onToggle(opt)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all duration-200 ${
                selected.includes(opt)
                  ? 'bg-[#f59e0b]/10 border-[#f59e0b]/40 text-[#f59e0b]'
                  : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
              }`}
            >
              {Icon && <Icon className="h-3 w-3 shrink-0" />}
              {opt}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {options.map((opt) => (
            <button
              key={opt}
              onClick={() => onToggle(opt)}
              className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-all duration-200 ${
                selected.includes(opt)
                  ? 'bg-[#f59e0b]/10 border-[#f59e0b]/40 text-[#f59e0b]'
                  : 'bg-zinc-900/60 border-zinc-800 text-zinc-400'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function UrgentToggle({
  urgentOnly,
  setUrgentOnly,
}: {
  urgentOnly: boolean;
  setUrgentOnly: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  return (
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
        Urgent Only
      </span>
      <div className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${urgentOnly ? 'bg-red-500' : 'bg-zinc-700'}`}>
        <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${urgentOnly ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </div>
    </button>
  );
}
