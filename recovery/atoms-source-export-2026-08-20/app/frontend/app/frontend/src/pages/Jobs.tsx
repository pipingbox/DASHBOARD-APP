import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Filter,
  Search,
  X,
  TrendingUp,
  RotateCcw,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase, TABLES } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { TrustMetricsSection } from '@/components/jobs/TrustMetricsSection';
import { ActivityFeed } from '@/components/jobs/ActivityFeed';
import { FeaturedCarousel } from '@/components/jobs/FeaturedCarousel';
import { FilterPanel } from '@/components/jobs/FilterPanel';
import { JobCard, JobSkeleton } from '@/components/jobs/JobCard';
import {
  STATIC_JOBS,
  ACTIVITY_FEED,
  COUNTRIES,
  DISCIPLINES,
  WORK_TYPES,
  CONTRACT_TYPES_OPTIONS,
  DISCIPLINE_MAP,
  getCountry,
  getWorkType,
  getContractTypeLabel,
} from '@/lib/jobs/static-data';
import type { Job, FilterTag } from '@/lib/jobs/types';
import { URGENT_INDICES } from '@/data/job-constants';

export default function Jobs() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [dbJobs, setDbJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [appliedKeys, setAppliedKeys] = useState<Set<string>>(new Set());

  // Filters
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [selectedDisciplines, setSelectedDisciplines] = useState<string[]>([]);
  const [selectedWorkTypes, setSelectedWorkTypes] = useState<string[]>([]);
  const [selectedContractTypes, setSelectedContractTypes] = useState<string[]>([]);
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Fetch DB jobs + user applications
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase
        .from(TABLES.jobs)
        .select('*')
        .eq('status', 'open')
        .order('created_at', { ascending: false });
      if (!mounted) return;
      if (error) console.warn('Jobs fetch:', error.message);
      setDbJobs((data as Job[]) ?? []);

      if (user) {
        const { data: authData } = await supabase.auth.getUser();
        const uid = authData?.user?.id;
        if (uid) {
          const { data: apps } = await supabase
            .from(TABLES.jobApplications)
            .select('job_title, company_name')
            .eq('user_id', uid);
          setAppliedKeys(
            new Set(
              (apps ?? []).map(
                (a: { job_title: string; company_name: string }) =>
                  `${a.job_title}|${a.company_name}`,
              ),
            ),
          );
        }
      }
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [user]);

  // Merge static + DB jobs (dedup by title+company)
  const allJobs = useMemo(() => {
    const staticWithIds = STATIC_JOBS.map((j, i) => ({
      ...j,
      id: `static-${i}`,
      created_at: new Date(Date.now() - i * 3600000 * 6).toISOString(),
      posted_by: null,
    })) as Job[];
    const dbTitles = new Set(dbJobs.map((j) => `${j.title}|${j.company}`));
    const uniqueStatic = staticWithIds.filter(
      (j) => !dbTitles.has(`${j.title}|${j.company}`),
    );
    return [...dbJobs, ...uniqueStatic];
  }, [dbJobs]);

  const toggleFilter = useCallback((arr: string[], setArr: React.Dispatch<React.SetStateAction<string[]>>, val: string) => {
    setArr(arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val]);
  }, []);

  const removeFilterTag = useCallback((type: string, val: string) => {
    if (type === 'country') setSelectedCountries((p) => p.filter((v) => v !== val));
    if (type === 'discipline') setSelectedDisciplines((p) => p.filter((v) => v !== val));
    if (type === 'workType') setSelectedWorkTypes((p) => p.filter((v) => v !== val));
    if (type === 'contractType') setSelectedContractTypes((p) => p.filter((v) => v !== val));
    if (type === 'urgent') setUrgentOnly(false);
  }, []);

  // Apply filters
  const filtered = useMemo(() => {
    let result = allJobs;
    const q = query.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (j) =>
          j.title.toLowerCase().includes(q) ||
          j.company.toLowerCase().includes(q) ||
          (j.location ?? '').toLowerCase().includes(q) ||
          (j.category ?? '').toLowerCase().includes(q),
      );
    }
    if (selectedCountries.length > 0) {
      result = result.filter((j) => selectedCountries.includes(getCountry(j.location)));
    }
    if (selectedDisciplines.length > 0) {
      result = result.filter((j) => selectedDisciplines.includes(DISCIPLINE_MAP[j.category ?? ''] ?? 'Other'));
    }
    if (selectedWorkTypes.length > 0) {
      result = result.filter((j) => {
        const idx = STATIC_JOBS.findIndex((s) => s.title === j.title && s.company === j.company);
        if (idx < 0) {
          const loc = (j.location ?? '').toLowerCase();
          const desc = (j.description ?? '').toLowerCase();
          if (selectedWorkTypes.includes('Offshore') && (loc.includes('offshore') || desc.includes('offshore'))) return true;
          if (selectedWorkTypes.includes('Onshore') && !loc.includes('offshore') && !desc.includes('offshore')) return true;
          return false;
        }
        return selectedWorkTypes.some((wt) => getWorkType(idx).includes(wt));
      });
    }
    if (selectedContractTypes.length > 0) {
      result = result.filter((j) => selectedContractTypes.includes(getContractTypeLabel(j.job_type)));
    }
    if (urgentOnly) {
      result = result.filter((j) => {
        const idx = STATIC_JOBS.findIndex((s) => s.title === j.title && s.company === j.company);
        return URGENT_INDICES.includes(idx);
      });
    }
    return result;
  }, [allJobs, query, selectedCountries, selectedDisciplines, selectedWorkTypes, selectedContractTypes, urgentOnly]);

  const hasActiveFilters = selectedCountries.length > 0 || selectedDisciplines.length > 0 || selectedWorkTypes.length > 0 || selectedContractTypes.length > 0 || urgentOnly;
  const displayJobs = filtered.length > 0 ? filtered : allJobs.slice(0, 6);
  const showingRecommended = filtered.length === 0 && (query || hasActiveFilters);

  const activeFilterCount = selectedCountries.length + selectedDisciplines.length + selectedWorkTypes.length + selectedContractTypes.length + (urgentOnly ? 1 : 0);

  const activeFilterTags = useMemo<FilterTag[]>(() => {
    const tags: FilterTag[] = [];
    selectedCountries.forEach((v) => tags.push({ type: 'country', label: v, value: v }));
    selectedDisciplines.forEach((v) => tags.push({ type: 'discipline', label: v, value: v }));
    selectedWorkTypes.forEach((v) => tags.push({ type: 'workType', label: v, value: v }));
    selectedContractTypes.forEach((v) => tags.push({ type: 'contractType', label: v, value: v }));
    if (urgentOnly) tags.push({ type: 'urgent', label: 'Urgent Only', value: 'urgent' });
    return tags;
  }, [selectedCountries, selectedDisciplines, selectedWorkTypes, selectedContractTypes, urgentOnly]);

  const clearFilters = () => {
    setSelectedCountries([]);
    setSelectedDisciplines([]);
    setSelectedWorkTypes([]);
    setSelectedContractTypes([]);
    setUrgentOnly(false);
    setQuery('');
  };

  const apply = async (job: Job) => {
    if (!user) {
      toast.info('Sign in to apply for jobs');
      return;
    }
    const jobKey = `${job.title}|${job.company}`;
    if (appliedKeys.has(jobKey)) {
      toast.info(t('jobs.alreadyApplied'));
      return;
    }
    setApplyingId(job.id);

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      setApplyingId(null);
      toast.error('You must be logged in to apply');
      return;
    }

    const applicationPayload: Record<string, unknown> = {
      user_id: authData.user.id,
      job_title: job.title,
      company_name: job.company,
      location: job.location ?? null,
      contract_type: job.job_type ?? null,
      status: 'applied',
    };

    if (!job.id.startsWith('static-')) {
      applicationPayload.job_id = job.id;
      const { data: jobRecord } = await supabase
        .from(TABLES.jobs)
        .select('company_user_id')
        .eq('id', job.id)
        .single();
      if (jobRecord?.company_user_id) {
        applicationPayload.company_user_id = jobRecord.company_user_id;
      }
    }

    const { error } = await supabase.from(TABLES.jobApplications).insert(applicationPayload);
    setApplyingId(null);

    if (error) {
      if (error.message.includes('duplicate') || error.code === '23505') {
        toast.info(t('jobs.alreadyApplied'));
        setAppliedKeys((s) => new Set(s).add(jobKey));
      } else {
        toast.error('Failed to submit application', { description: error.message });
      }
      return;
    }

    toast.success('Application submitted successfully');
    setAppliedKeys((s) => new Set(s).add(jobKey));
  };

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
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#f59e0b] text-[9px] font-bold text-black">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </div>
        }
      />

      <TrustMetricsSection />

      <FeaturedCarousel
        onApply={apply}
        appliedKeys={appliedKeys}
        applyingId={applyingId}
      />

      <ActivityFeed />

      <FilterPanel
        open={showFilters}
        onClose={() => setShowFilters(false)}
        selectedCountries={selectedCountries}
        selectedDisciplines={selectedDisciplines}
        selectedWorkTypes={selectedWorkTypes}
        selectedContractTypes={selectedContractTypes}
        urgentOnly={urgentOnly}
        activeFilterCount={activeFilterCount}
        filteredCount={filtered.length}
        toggleFilter={toggleFilter}
        setSelectedCountries={setSelectedCountries}
        setSelectedDisciplines={setSelectedDisciplines}
        setSelectedWorkTypes={setSelectedWorkTypes}
        setSelectedContractTypes={setSelectedContractTypes}
        setUrgentOnly={setUrgentOnly}
        clearFilters={clearFilters}
      />

      {/* Active Filter Tags */}
      {activeFilterTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 animate-in fade-in duration-200">
          <span className="text-[10px] uppercase tracking-[0.15em] text-zinc-600 font-medium mr-1">Active:</span>
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
          <button onClick={clearFilters} className="flex items-center gap-1 px-2 py-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors">
            <RotateCcw className="h-3 w-3" />
            Clear all
          </button>
        </div>
      )}

      {/* Job Listings */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">
            {showingRecommended ? 'Recommended Jobs' : 'All Open Positions'}
          </h2>
          <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-600">
            {displayJobs.length} {displayJobs.length === 1 ? 'role' : 'roles'}
          </span>
        </div>

        {showingRecommended && (
          <div className="flex items-center gap-2 px-3 py-2 border border-[#f59e0b]/20 bg-[#f59e0b]/5 rounded-sm">
            <TrendingUp className="h-3.5 w-3.5 text-[#f59e0b]" />
            <p className="text-xs text-zinc-400">
              No exact matches found. Here are some <span className="text-[#f59e0b] font-medium">recommended positions</span> you might like.
            </p>
            <button onClick={clearFilters} className="ml-auto text-xs text-[#f59e0b] hover:text-[#d97706] font-medium transition-colors">
              Clear filters
            </button>
          </div>
        )}

        {loading ? (
          <div className="grid gap-3">
            {[...Array(4)].map((_, i) => (
              <JobSkeleton key={i} />
            ))}
          </div>
        ) : (
          <div className="grid gap-3">
            {displayJobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                applied={appliedKeys.has(`${job.title}|${job.company}`)}
                applying={applyingId === job.id}
                onApply={apply}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
