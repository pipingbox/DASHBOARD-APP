import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase, TABLES } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Job } from '@/lib/jobs/types';
import {
  DISCIPLINE_MAP,
  getCountry,
  getContractTypeLabel,
} from '@/lib/jobs/static-data';

export function useJobs() {
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

  // Fetch DB jobs
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase
        .from(TABLES.jobs)
        .select('*')
        .eq('status', 'open')
        .order('created_at', { ascending: false });
      if (!mounted) return;
      if (error) {
        console.warn('Jobs fetch:', error.message);
      }
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
    return () => {
      mounted = false;
    };
  }, [user]);

  // Toggle helpers
  const toggleFilter = useCallback(
    (arr: string[], setArr: React.Dispatch<React.SetStateAction<string[]>>, val: string) => {
      setArr(arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val]);
    },
    [],
  );

  const removeFilterTag = useCallback((type: string, val: string) => {
    if (type === 'country') setSelectedCountries((p) => p.filter((v) => v !== val));
    if (type === 'discipline') setSelectedDisciplines((p) => p.filter((v) => v !== val));
    if (type === 'workType') setSelectedWorkTypes((p) => p.filter((v) => v !== val));
    if (type === 'contractType') setSelectedContractTypes((p) => p.filter((v) => v !== val));
    if (type === 'urgent') setUrgentOnly(false);
  }, []);

  // Apply filters
  const filtered = useMemo(() => {
    let result = dbJobs;

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
      result = result.filter((j) => {
        const country = getCountry(j.location);
        return selectedCountries.includes(country);
      });
    }

    if (selectedDisciplines.length > 0) {
      result = result.filter((j) => {
        const disc = DISCIPLINE_MAP[j.category ?? ''] ?? 'Other';
        return selectedDisciplines.includes(disc);
      });
    }

    if (selectedWorkTypes.length > 0) {
      result = result.filter((j) => {
        const loc = (j.location ?? '').toLowerCase();
        const desc = (j.description ?? '').toLowerCase();
        if (selectedWorkTypes.includes('Offshore') && (loc.includes('offshore') || desc.includes('offshore'))) return true;
        if (selectedWorkTypes.includes('Onshore') && !loc.includes('offshore') && !desc.includes('offshore')) return true;
        return false;
      });
    }

    if (selectedContractTypes.length > 0) {
      result = result.filter((j) => {
        const label = getContractTypeLabel(j.job_type);
        return selectedContractTypes.includes(label);
      });
    }

    // urgentOnly filter — without static data, we skip this (no urgent markers on DB jobs)
    // In future, a DB column `is_urgent` could be added.

    return result;
  }, [dbJobs, query, selectedCountries, selectedDisciplines, selectedWorkTypes, selectedContractTypes, urgentOnly]);

  const hasActiveFilters =
    selectedCountries.length > 0 ||
    selectedDisciplines.length > 0 ||
    selectedWorkTypes.length > 0 ||
    selectedContractTypes.length > 0 ||
    urgentOnly;

  const displayJobs = filtered;
  const showingRecommended = false;

  const apply = async (job: Job) => {
    if (!user) {
      toast.info(t('jobs.signInToApply'));
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
      job_id: job.id,
    };

    const { data: jobRecord } = await supabase
      .from(TABLES.jobs)
      .select('company_user_id')
      .eq('id', job.id)
      .single();
    if (jobRecord?.company_user_id) {
      applicationPayload.company_user_id = jobRecord.company_user_id;
    }

    const { error } = await supabase.from(TABLES.jobApplications).insert(applicationPayload);

    setApplyingId(null);

    if (error) {
      if (error.message.includes('duplicate') || error.code === '23505') {
        toast.info(t('jobs.alreadyApplied'));
        setAppliedKeys((s) => new Set(s).add(jobKey));
      } else {
        toast.error(t('jobs.applicationFailed'), { description: error.message });
      }
      return;
    }

    toast.success(t('jobs.applicationSubmitted'));
    setAppliedKeys((s) => new Set(s).add(jobKey));
  };

  const activeFilterCount =
    selectedCountries.length +
    selectedDisciplines.length +
    selectedWorkTypes.length +
    selectedContractTypes.length +
    (urgentOnly ? 1 : 0);

  const activeFilterTags = useMemo(() => {
    const tags: { type: string; label: string; value: string }[] = [];
    selectedCountries.forEach((v) => tags.push({ type: 'country', label: v, value: v }));
    selectedDisciplines.forEach((v) => tags.push({ type: 'discipline', label: v, value: v }));
    selectedWorkTypes.forEach((v) => tags.push({ type: 'workType', label: v, value: v }));
    selectedContractTypes.forEach((v) => tags.push({ type: 'contractType', label: v, value: v }));
    if (urgentOnly) tags.push({ type: 'urgent', label: t('jobs.urgentPositionsOnly'), value: 'urgent' });
    return tags;
  }, [selectedCountries, selectedDisciplines, selectedWorkTypes, selectedContractTypes, urgentOnly, t]);

  const clearFilters = useCallback(() => {
    setSelectedCountries([]);
    setSelectedDisciplines([]);
    setSelectedWorkTypes([]);
    setSelectedContractTypes([]);
    setUrgentOnly(false);
    setQuery('');
  }, []);

  return {
    loading,
    query,
    setQuery,
    applyingId,
    appliedKeys,
    filtered,
    displayJobs,
    showingRecommended,
    apply,
    activeFilterCount,
    activeFilterTags,
    clearFilters,
    hasActiveFilters,
    // Filter state & setters
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
  };
}