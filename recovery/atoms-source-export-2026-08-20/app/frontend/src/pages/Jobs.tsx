import { useState } from 'react';
import {
  Filter,
  Search,
  X,
  RotateCcw,
  Briefcase,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useJobs } from '@/hooks/useJobs';
import { JobCard } from '@/components/jobs/JobCard';
import { JobFilters } from '@/components/jobs/JobFilters';

/* ─── Skeleton Loader ─── */
function JobSkeleton() {
  return (
    <div className="border border-zinc-800/60 bg-[#0d0d0d] p-6 rounded-sm animate-pulse">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-5 w-48 bg-zinc-800 rounded-sm" />
            <div className="h-4 w-16 bg-zinc-800/60 rounded-sm" />
          </div>
          <div className="flex items-center gap-4">
            <div className="h-3.5 w-28 bg-zinc-800/50 rounded-sm" />
            <div className="h-3.5 w-24 bg-zinc-800/50 rounded-sm" />
            <div className="h-3.5 w-20 bg-zinc-800/50 rounded-sm" />
          </div>
          <div className="h-4 w-3/4 bg-zinc-800/40 rounded-sm" />
        </div>
        <div className="h-9 w-24 bg-zinc-800 rounded-sm" />
      </div>
    </div>
  );
}

/* ─── Main Component ─── */
export default function Jobs() {
  const { t } = useTranslation();
  const [showFilters, setShowFilters] = useState(false);

  const {
    loading,
    query,
    setQuery,
    applyingId,
    appliedKeys,
    filtered,
    displayJobs,
    apply,
    activeFilterCount,
    activeFilterTags,
    clearFilters,
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
    removeFilterTag,
  } = useJobs();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t('jobs.eyebrow')}
        title={t('jobs.title')}
        description={t('jobs.description')}
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm">
              <Search className="h-4 w-4 text-zinc-500" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('jobs.searchPlaceholder')}
                className="h-7 w-[220px] border-0 bg-transparent p-0 focus-visible:ring-0"
              />
              {query && (
                <button onClick={() => setQuery('')} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className={`border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 !bg-transparent ${
                activeFilterCount > 0 ? 'border-[#f59e0b]/50 text-[#f59e0b]' : ''
              }`}
            >
              <Filter className="h-3.5 w-3.5 mr-1.5" />
              {t('jobs.filters')}
              {activeFilterCount > 0 && (
                <span className="ml-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#f59e0b] text-[9px] font-bold text-black">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </div>
        }
      />

      {/* ─── Filter Sidebar Overlay ─── */}
      <JobFilters
        showFilters={showFilters}
        setShowFilters={setShowFilters}
        selectedCountries={selectedCountries}
        setSelectedCountries={setSelectedCountries}
        selectedDisciplines={selectedDisciplines}
        setSelectedDisciplines={setSelectedDisciplines}
        selectedWorkTypes={selectedWorkTypes}
        setSelectedWorkTypes={setSelectedWorkTypes}
        selectedContractTypes={selectedContractTypes}
        setSelectedContractTypes={setSelectedContractTypes}
        urgentOnly={urgentOnly}
        setUrgentOnly={setUrgentOnly}
        toggleFilter={toggleFilter}
        activeFilterCount={activeFilterCount}
        filteredCount={filtered.length}
        clearFilters={clearFilters}
      />

      {/* ─── Active Filter Tags ─── */}
      {activeFilterTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 animate-in fade-in duration-200">
          <span className="text-[10px] uppercase tracking-[0.15em] text-zinc-600 font-medium mr-1">{t('jobs.active')}</span>
          {activeFilterTags.map((tag) => (
            <button
              key={`${tag.type}-${tag.value}`}
              onClick={() => removeFilterTag(tag.type, tag.value)}
              className="group/tag flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[#f59e0b]/30 bg-[#f59e0b]/5 text-xs text-[#f59e0b] font-medium hover:bg-[#f59e0b]/10 hover:border-[#f59e0b]/50 transition-all duration-200"
            >
              {tag.label}
              <X className="h-3 w-3 opacity-60 group-hover/tag:opacity-100 transition-opacity" />
            </button>
          ))}
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 px-2 py-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            {t('jobs.clearAll')}
          </button>
        </div>
      )}

      {/* ─── Job Listings ─── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">
            {t('jobs.allOpenPositions')}
          </h2>
          <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-600">
            {displayJobs.length} {displayJobs.length === 1 ? t('jobs.role') : t('jobs.roles')}
          </span>
        </div>

        {loading ? (
          <div className="grid gap-3">
            {[...Array(4)].map((_, i) => (
              <JobSkeleton key={i} />
            ))}
          </div>
        ) : displayJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 border border-zinc-800/60 bg-[#0d0d0d] rounded-sm">
            <Briefcase className="h-10 w-10 text-zinc-700 mb-4" />
            <h3 className="text-sm font-semibold text-zinc-400">{t('jobs.noJobsTitle', 'No open positions')}</h3>
            <p className="text-xs text-zinc-600 mt-1 max-w-sm text-center">
              {t('jobs.noJobsDescription', 'There are no job listings available at this time. Check back later or adjust your filters.')}
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {displayJobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                applied={appliedKeys.has(`${job.title}|${job.company}`)}
                applying={applyingId === job.id}
                onApply={() => apply(job)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}