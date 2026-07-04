import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import {
  Briefcase,
  MapPin,
  Building2,
  Filter,
  BadgeCheck,
  Zap,
  Clock,
  Users,
  Globe,
  ChevronLeft,
  ChevronRight,
  Anchor,
  AlertTriangle,
  TrendingUp,
  Search,
  X,
  ArrowRight,
  SlidersHorizontal,
  RotateCcw,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase, TABLES } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

/* ─── Types ─── */
interface Job {
  id: string;
  title: string;
  company: string;
  location: string | null;
  job_type: string;
  category: string | null;
  description: string | null;
  salary_min: number | null;
  salary_max: number | null;
  currency: string;
  is_remote: boolean;
  created_at: string;
  posted_by: string | null;
}

/* ─── Animated Counter Hook ─── */
function useCounter(target: number, duration = 1600) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const start = performance.now();
          const step = (now: number) => {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.floor(eased * target));
            if (progress < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
      },
      { threshold: 0.3 },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target, duration]);

  return { count, ref };
}

/* ─── Static Job Data (realistic industrial listings) ─── */
const STATIC_JOBS: Omit<Job, 'id' | 'created_at' | 'posted_by'>[] = [
  {
    title: 'Senior Pipefitter',
    company: 'Atlas Industrial Solutions',
    location: 'Antwerp, Belgium',
    job_type: 'contract',
    category: 'Pipefitting',
    description:
      'Experienced pipefitter for petrochemical turnaround. Must hold VCA certificate. 10/4 rotation available.',
    salary_min: 3800,
    salary_max: 4600,
    currency: '€',
    is_remote: false,
  },
  {
    title: 'TIG Welder — 6GR Certified',
    company: 'Helix Marine Engineering',
    location: 'Stavanger, Norway',
    job_type: 'contract',
    category: 'Welding',
    description:
      'Offshore TIG welding on subsea manifolds. 3/3 rotation. Must have BOSIET + valid medical.',
    salary_min: 5200,
    salary_max: 6800,
    currency: '€',
    is_remote: false,
  },
  {
    title: 'QA/QC Inspector — Piping',
    company: 'Meridian Industrial Group',
    location: 'Rotterdam, Netherlands',
    job_type: 'contract',
    category: 'QA/QC',
    description:
      'Inspection of piping fabrication and installation per ASME B31.3. CSWIP 3.1 required.',
    salary_min: 4200,
    salary_max: 5400,
    currency: '€',
    is_remote: false,
  },
  {
    title: 'Mechanical Supervisor',
    company: 'Polaris Energy Services',
    location: 'Aberdeen, United Kingdom',
    job_type: 'full-time',
    category: 'Supervision',
    description:
      'Supervise mechanical installation crews on offshore platform upgrade. 2/2 rotation.',
    salary_min: 72000,
    salary_max: 95000,
    currency: '£',
    is_remote: false,
  },
  {
    title: 'Work Preparator — Piping',
    company: 'Bilfinger',
    location: 'Ludwigshafen, Germany',
    job_type: 'full-time',
    category: 'Planning',
    description:
      'Prepare work packages for piping maintenance at BASF site. SAP PM experience preferred.',
    salary_min: 48000,
    salary_max: 62000,
    currency: '€',
    is_remote: false,
  },
  {
    title: 'Rigger / Banksman',
    company: 'Vanguard Offshore Operations',
    location: 'Abu Dhabi, UAE',
    job_type: 'contract',
    category: 'Rigging',
    description:
      'Heavy lift rigging for offshore jacket installation. LEEA certification required. 8/4 rotation.',
    salary_min: 4000,
    salary_max: 5500,
    currency: '$',
    is_remote: false,
  },
  {
    title: 'Project Planner — Oil & Gas',
    company: 'Apex Technical Services',
    location: 'The Hague, Netherlands',
    job_type: 'full-time',
    category: 'Planning',
    description:
      'Primavera P6 planning for refinery expansion project. 5+ years O&G experience.',
    salary_min: 65000,
    salary_max: 85000,
    currency: '€',
    is_remote: false,
  },
  {
    title: 'Offshore Instrument Technician',
    company: 'Petrofac',
    location: 'Bergen, Norway',
    job_type: 'contract',
    category: 'Instrumentation',
    description:
      'Calibration and maintenance of process instrumentation on FPSO. 2/3 rotation.',
    salary_min: 5000,
    salary_max: 6500,
    currency: '€',
    is_remote: false,
  },
  {
    title: 'Piping Stress Engineer — CAESAR II',
    company: 'Trident Upstream Energy',
    location: 'Houston, TX',
    job_type: 'full-time',
    category: 'Stress',
    description:
      'Lead stress analysis for LNG facility projects. ASME B31.3 and B31.1 expertise.',
    salary_min: 120000,
    salary_max: 160000,
    currency: '$',
    is_remote: false,
  },
  {
    title: 'Piping Designer — AutoCAD Plant 3D',
    company: 'Meridian EPC',
    location: 'Remote',
    job_type: 'full-time',
    category: 'Design',
    description: 'Produce GA, iso, and BOM for refinery retrofits. Remote-friendly role.',
    salary_min: 70000,
    salary_max: 95000,
    currency: '$',
    is_remote: true,
  },
  {
    title: 'Scaffolder — Advanced',
    company: 'Brand Energy',
    location: 'Ghent, Belgium',
    job_type: 'contract',
    category: 'Scaffolding',
    description:
      'Complex industrial scaffolding for chemical plant shutdown. CISRS Advanced required.',
    salary_min: 3200,
    salary_max: 4200,
    currency: '€',
    is_remote: false,
  },
  {
    title: 'NDT Technician Level II',
    company: 'Applus+',
    location: 'Düsseldorf, Germany',
    job_type: 'full-time',
    category: 'QA/QC',
    description:
      'UT, MT, PT inspection of pressure vessels and piping. PCN Level II certification.',
    salary_min: 52000,
    salary_max: 68000,
    currency: '€',
    is_remote: false,
  },
  {
    title: 'Mechanical / Piping Engineer',
    company: 'Aurora Process',
    location: 'Rotterdam, Netherlands',
    job_type: 'contract',
    category: 'Mechanical',
    description: 'Chemical plant revamp, 12-month rolling contract. PED knowledge preferred.',
    salary_min: 90000,
    salary_max: 120000,
    currency: '€',
    is_remote: false,
  },
  {
    title: 'Welding Engineer',
    company: 'Cascade Dredging Marine',
    location: 'Papendrecht, Netherlands',
    job_type: 'full-time',
    category: 'Welding',
    description:
      'Develop WPS/PQR for offshore pipeline projects. IWE qualification required.',
    salary_min: 70000,
    salary_max: 92000,
    currency: '€',
    is_remote: false,
  },
  {
    title: 'Construction Manager — Piping',
    company: 'McDermott',
    location: 'Jebel Ali, UAE',
    job_type: 'contract',
    category: 'Supervision',
    description:
      'Manage piping construction on modular fabrication yard. 10+ years experience.',
    salary_min: 8000,
    salary_max: 12000,
    currency: '$',
    is_remote: false,
  },
  {
    title: 'Pipe Stress Analyst',
    company: 'Orion Engineering Partners',
    location: 'London, United Kingdom',
    job_type: 'full-time',
    category: 'Stress',
    description:
      'Perform thermal flexibility analysis for hydrogen pipeline project using AutoPIPE.',
    salary_min: 65000,
    salary_max: 85000,
    currency: '£',
    is_remote: false,
  },
];

/* ─── Featured Jobs (premium / high-paying) ─── */
const FEATURED_INDICES = [1, 3, 8, 14]; // TIG Welder, Mech Supervisor, Stress Eng, Construction Mgr

/* ─── Urgent Jobs ─── */
const URGENT_INDICES = [0, 1, 5, 10, 14];

/* ─── Posted time labels ─── */
const POSTED_TIMES = [
  '2h ago',
  '4h ago',
  '6h ago',
  '8h ago',
  '12h ago',
  '1d ago',
  '1d ago',
  '2d ago',
  '2d ago',
  '3d ago',
  '3d ago',
  '4d ago',
  '5d ago',
  '5d ago',
  '6d ago',
  '1w ago',
];

/* ─── Rotation info ─── */
const ROTATIONS: Record<number, string> = {
  1: '3/3 weeks',
  3: '2/2 weeks',
  5: '8/4 weeks',
  7: '2/3 weeks',
  14: '10/4 weeks',
};

/* ─── Country extraction ─── */
function getCountry(location: string | null): string {
  if (!location) return 'Other';
  if (location.includes('Belgium')) return 'Belgium';
  if (location.includes('Netherlands')) return 'Netherlands';
  if (location.includes('Germany')) return 'Germany';
  if (location.includes('Norway')) return 'Norway';
  if (location.includes('UAE')) return 'UAE';
  if (location.includes('United Kingdom') || location.includes('UK')) return 'United Kingdom';
  if (location.includes('Houston') || location.includes('TX')) return 'USA';
  if (location.includes('Remote')) return 'Remote';
  return 'Other';
}

/* ─── Discipline extraction ─── */
function getDiscipline(cat: string | null): string {
  if (!cat) return 'Other';
  return cat;
}

/* ─── Is offshore ─── */
function isOffshore(idx: number): boolean {
  return [1, 3, 5, 7, 14].includes(idx);
}

/* ─── Activity Feed Data ─── */
const ACTIVITY_FEED = [
  { text: '3 new candidates applied to Atlas Industrial Solutions — Pipefitter role', time: '5 min ago', type: 'application' as const },
  { text: 'QA/QC Inspector role filled in Rotterdam', time: '18 min ago', type: 'filled' as const },
  { text: 'Offshore TIG Welder position closed in Norway', time: '42 min ago', type: 'closed' as const },
  { text: '7 applications received for Mechanical Supervisor — Aberdeen', time: '1h ago', type: 'application' as const },
  { text: 'New urgent listing: Rigger/Banksman — Abu Dhabi', time: '2h ago', type: 'new' as const },
  { text: 'Scaffolder role in Ghent received 5 applications', time: '3h ago', type: 'application' as const },
  { text: 'Construction Manager position updated — salary increased', time: '4h ago', type: 'new' as const },
];

/* ─── Trust Metrics (TD-03 / DEC-33: real data, never fabricated) ─── */
// Previously this was a hardcoded array with fake numbers (126 jobs, 48 companies,
// 847 applications, 17 countries). Per DEC-33, fabricated metrics destroy trust
// when discovered. These are now queried from Supabase. If the count is 0, we
// show 0 — no fake padding.
interface TrustMetric {
  label: string;
  value: number;
  icon: typeof Briefcase;
}

function useTrustMetrics(): { metrics: TrustMetric[]; loading: boolean } {
  const [metrics, setMetrics] = useState<TrustMetric[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // Query real counts in parallel. head:true returns count without rows.
        const [jobsRes, companiesRes, appsRes] = await Promise.all([
          supabase.from(TABLES.jobs).select('*', { count: 'exact', head: true }),
          // Company profiles: role = 'company'
          supabase.from(TABLES.profiles).select('*', { count: 'exact', head: true }).eq('role', 'company'),
          supabase.from(TABLES.jobApplications).select('*', { count: 'exact', head: true }),
        ]);

        const activeJobs = jobsRes.count ?? 0;
        const verifiedCompanies = companiesRes.count ?? 0;
        const applications = appsRes.count ?? 0;

        setMetrics([
          { label: 'Active Jobs', value: activeJobs, icon: Briefcase },
          { label: 'Companies', value: verifiedCompanies, icon: BadgeCheck },
          { label: 'Applications', value: applications, icon: TrendingUp },
          { label: 'Countries', value: 0, icon: Globe }, // TODO: derive from jobs.location distinct count when data exists
        ]);
      } catch {
        // On error, show zeros rather than fake numbers (DEC-33).
        setMetrics([
          { label: 'Active Jobs', value: 0, icon: Briefcase },
          { label: 'Companies', value: 0, icon: BadgeCheck },
          { label: 'Applications', value: 0, icon: TrendingUp },
          { label: 'Countries', value: 0, icon: Globe },
        ]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { metrics, loading };
}

function TrustMetricsSection() {
  const { metrics } = useTrustMetrics();
  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      {metrics.map((m) => (
        <MetricCard key={m.label} metric={m} />
      ))}
    </div>
  );
}

/* ─── Filter Options ─── */
const COUNTRIES = ['Belgium', 'Netherlands', 'Germany', 'Norway', 'UAE', 'United Kingdom'];
const DISCIPLINES = ['Pipefitter', 'TIG Welder', 'QA/QC', 'Supervisor', 'Planner', 'Rigger', 'Offshore Technician'];
const WORK_TYPES = ['Offshore', 'Onshore', 'Shutdown', 'Long-term', 'Rotation'];
const CONTRACT_TYPES_OPTIONS = ['Freelance', 'Employee', 'Contract', 'Full-time'];

/* ─── Discipline mapping (category → discipline label) ─── */
const DISCIPLINE_MAP: Record<string, string> = {
  'Pipefitting': 'Pipefitter',
  'Welding': 'TIG Welder',
  'QA/QC': 'QA/QC',
  'Supervision': 'Supervisor',
  'Planning': 'Planner',
  'Rigging': 'Rigger',
  'Instrumentation': 'Offshore Technician',
  'Stress': 'Pipefitter',
  'Design': 'Planner',
  'Scaffolding': 'Rigger',
  'Mechanical': 'Pipefitter',
};

/* ─── Work type mapping ─── */
function getWorkType(idx: number): string[] {
  const types: string[] = [];
  if (isOffshore(idx)) types.push('Offshore');
  else types.push('Onshore');
  if (URGENT_INDICES.includes(idx)) types.push('Shutdown');
  if ([3, 4, 6, 8, 9, 11, 12, 13, 15].includes(idx)) types.push('Long-term');
  if ([1, 3, 5, 7, 14].includes(idx)) types.push('Rotation');
  return types;
}

/* ─── Contract type mapping ─── */
function getContractTypeLabel(jobType: string): string {
  if (jobType === 'full-time') return 'Full-time';
  if (jobType === 'contract') return 'Contract';
  return 'Freelance';
}

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

/* ─── Metric Card ─── */
function MetricCard({ metric }: { metric: TrustMetric }) {
  const { count, ref } = useCounter(metric.value);
  const Icon = metric.icon;
  return (
    <div
      ref={ref}
      className="group relative border border-zinc-800/80 bg-[#0d0d0d] p-4 rounded-sm hover:border-zinc-700 transition-all duration-300 hover:shadow-lg hover:shadow-[#f59e0b]/5"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-[#f59e0b]/[0.02] to-transparent rounded-sm opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="relative flex items-center justify-between">
        <div>
          <p className="text-2xl font-bold text-zinc-100 tabular-nums">
            {count.toLocaleString()}
          </p>
          <p className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 mt-1 font-medium">
            {metric.label}
          </p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-sm bg-[#f59e0b]/10 border border-[#f59e0b]/20">
          <Icon className="h-4 w-4 text-[#f59e0b]" />
        </div>
      </div>
    </div>
  );
}

/* ─── Featured Job Card ─── */
function FeaturedJobCard({
  job,
  idx,
  onApply,
  applied,
  applying,
}: {
  job: (typeof STATIC_JOBS)[0];
  idx: number;
  onApply: () => void;
  applied: boolean;
  applying: boolean;
}) {
  const offshore = isOffshore(idx);
  const rotation = ROTATIONS[idx];
  const urgent = URGENT_INDICES.includes(idx);

  const formatSalary = () => {
    if (!job.salary_min && !job.salary_max) return null;
    const min = job.salary_min ?? 0;
    const max = job.salary_max ?? 0;
    if (min >= 10000) {
      return `${job.currency}${(min / 1000).toFixed(0)}k–${(max / 1000).toFixed(0)}k /yr`;
    }
    return `${job.currency}${min.toLocaleString()}–${max.toLocaleString()} /mo`;
  };

  return (
    <div className="group relative min-w-[320px] max-w-[360px] shrink-0 border border-[#f59e0b]/30 bg-gradient-to-br from-[#f59e0b]/[0.04] to-[#0d0d0d] p-5 rounded-sm hover:border-[#f59e0b]/60 transition-all duration-300 hover:shadow-xl hover:shadow-[#f59e0b]/10 hover:-translate-y-0.5 snap-start">
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#f59e0b]/60 via-[#f59e0b] to-[#f59e0b]/60 rounded-t-sm" />

      <div className="flex items-center justify-between mb-3">
        <span className="flex items-center gap-1.5 px-2 py-0.5 text-[9px] uppercase tracking-wider bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/30 rounded-sm font-semibold">
          <Zap className="h-3 w-3" />
          Featured
        </span>
        <div className="flex items-center gap-1.5">
          {urgent && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/20 rounded-sm">
              <AlertTriangle className="h-3 w-3" />
              Urgent
            </span>
          )}
          {offshore && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-sm">
              <Anchor className="h-3 w-3" />
              Offshore
            </span>
          )}
        </div>
      </div>

      <h3 className="text-base font-semibold text-zinc-100 group-hover:text-[#f59e0b] transition-colors duration-300 line-clamp-1">
        {job.title}
      </h3>

      <div className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
        <span className="flex items-center gap-1">
          <Building2 className="h-3.5 w-3.5 text-zinc-500" />
          {job.company}
        </span>
        <span className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-sm">
          <BadgeCheck className="h-3 w-3" />
          Verified
        </span>
      </div>

      <div className="mt-2 flex items-center gap-3 text-xs text-zinc-500">
        <span className="flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" />
          {job.location}
        </span>
        {rotation && (
          <span className="text-zinc-600">· {rotation}</span>
        )}
      </div>

      <p className="mt-2 text-xs text-zinc-500 line-clamp-2 leading-relaxed">{job.description}</p>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-[#f59e0b]">{formatSalary()}</span>
        <span className="text-[10px] text-zinc-600 uppercase tracking-wider">{job.job_type}</span>
      </div>

      <Button
        onClick={onApply}
        disabled={applied || applying}
        className={`mt-3 w-full text-sm font-semibold ${
          applied
            ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-800'
            : 'bg-[#f59e0b] text-black hover:bg-[#d97706]'
        }`}
        size="sm"
      >
        {applied ? 'Applied' : applying ? 'Applying…' : 'Apply Now'}
        {!applied && <ArrowRight className="ml-1.5 h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

/* ─── Main Component ─── */
export default function Jobs() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [dbJobs, setDbJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [applyingId, setApplyingId] = useState<string | null>(null);
  // Track applied jobs by "title|company" key for dedup across static & DB jobs
  const [appliedKeys, setAppliedKeys] = useState<Set<string>>(new Set());

  // Filters
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [selectedDisciplines, setSelectedDisciplines] = useState<string[]>([]);
  const [selectedWorkTypes, setSelectedWorkTypes] = useState<string[]>([]);
  const [selectedContractTypes, setSelectedContractTypes] = useState<string[]>([]);
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Activity feed animation
  const [visibleActivities, setVisibleActivities] = useState(0);

  // Featured carousel
  const carouselRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisibleActivities((prev) => (prev < ACTIVITY_FEED.length ? prev + 1 : prev));
    }, 500);
    return () => clearInterval(timer);
  }, []);

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
        // Silently handle — we have static jobs as fallback
        console.warn('Jobs fetch:', error.message);
      }
      setDbJobs((data as Job[]) ?? []);

      if (user) {
        // Fetch the user's existing applications by job_title + company_name
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

  // Merge static + DB jobs
  const allJobs = useMemo(() => {
    const staticWithIds = STATIC_JOBS.map((j, i) => ({
      ...j,
      id: `static-${i}`,
      created_at: new Date(Date.now() - i * 3600000 * 6).toISOString(),
      posted_by: null,
    })) as Job[];

    // Deduplicate by title+company
    const dbTitles = new Set(dbJobs.map((j) => `${j.title}|${j.company}`));
    const uniqueStatic = staticWithIds.filter(
      (j) => !dbTitles.has(`${j.title}|${j.company}`),
    );

    return [...dbJobs, ...uniqueStatic];
  }, [dbJobs]);

  // Toggle helpers for multi-select filters
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

    // Text search
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

    // Country
    if (selectedCountries.length > 0) {
      result = result.filter((j) => {
        const country = getCountry(j.location);
        return selectedCountries.includes(country);
      });
    }

    // Discipline
    if (selectedDisciplines.length > 0) {
      result = result.filter((j) => {
        const disc = DISCIPLINE_MAP[j.category ?? ''] ?? 'Other';
        return selectedDisciplines.includes(disc);
      });
    }

    // Work type
    if (selectedWorkTypes.length > 0) {
      result = result.filter((j) => {
        const idx = STATIC_JOBS.findIndex((s) => s.title === j.title && s.company === j.company);
        if (idx < 0) {
          // For DB jobs, check if offshore keyword in description/location
          const loc = (j.location ?? '').toLowerCase();
          const desc = (j.description ?? '').toLowerCase();
          if (selectedWorkTypes.includes('Offshore') && (loc.includes('offshore') || desc.includes('offshore'))) return true;
          if (selectedWorkTypes.includes('Onshore') && !loc.includes('offshore') && !desc.includes('offshore')) return true;
          return false;
        }
        const workTypes = getWorkType(idx);
        return selectedWorkTypes.some((wt) => workTypes.includes(wt));
      });
    }

    // Contract type
    if (selectedContractTypes.length > 0) {
      result = result.filter((j) => {
        const label = getContractTypeLabel(j.job_type);
        return selectedContractTypes.includes(label);
      });
    }

    // Urgent only
    if (urgentOnly) {
      result = result.filter((j) => {
        const idx = STATIC_JOBS.findIndex((s) => s.title === j.title && s.company === j.company);
        return URGENT_INDICES.includes(idx);
      });
    }

    return result;
  }, [allJobs, query, selectedCountries, selectedDisciplines, selectedWorkTypes, selectedContractTypes, urgentOnly]);

  // If filters yield nothing, show recommended
  const hasActiveFilters = selectedCountries.length > 0 || selectedDisciplines.length > 0 || selectedWorkTypes.length > 0 || selectedContractTypes.length > 0 || urgentOnly;
  const displayJobs = filtered.length > 0 ? filtered : allJobs.slice(0, 6);
  const showingRecommended = filtered.length === 0 && (query || hasActiveFilters);

  const apply = async (job: Job) => {
    if (!user) {
      toast.info('Sign in to apply for jobs');
      return;
    }

    const jobKey = `${job.title}|${job.company}`;

    // Prevent duplicate
    if (appliedKeys.has(jobKey)) {
      toast.info(t('jobs.alreadyApplied'));
      return;
    }

    setApplyingId(job.id);

    // Always fetch fresh auth user for RLS compliance
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      setApplyingId(null);
      toast.error('You must be logged in to apply');
      return;
    }

    // Build application payload — include job_id and company_user_id when available (DB jobs)
    const applicationPayload: Record<string, unknown> = {
      user_id: authData.user.id,
      job_title: job.title,
      company_name: job.company,
      location: job.location ?? null,
      contract_type: job.job_type ?? null,
      status: 'applied',
    };

    // For DB jobs (non-static), include job_id and company_user_id for company candidate linking
    if (!job.id.startsWith('static-')) {
      applicationPayload.job_id = job.id;
      // Fetch company_user_id from the job record
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

  const formatSalary = (job: Job) => {
    if (!job.salary_min && !job.salary_max) return null;
    const min = job.salary_min ?? 0;
    const max = job.salary_max ?? 0;
    if (min >= 10000) {
      return `${job.currency}${(min / 1000).toFixed(0)}k–${(max / 1000).toFixed(0)}k /yr`;
    }
    return `${job.currency}${min.toLocaleString()}–${max.toLocaleString()} /mo`;
  };

  const getStaticIndex = (job: Job) =>
    STATIC_JOBS.findIndex((s) => s.title === job.title && s.company === job.company);

  const scrollCarousel = (dir: 'left' | 'right') => {
    if (!carouselRef.current) return;
    const amount = 360;
    carouselRef.current.scrollBy({
      left: dir === 'left' ? -amount : amount,
      behavior: 'smooth',
    });
  };

  const activeFilterCount = selectedCountries.length + selectedDisciplines.length + selectedWorkTypes.length + selectedContractTypes.length + (urgentOnly ? 1 : 0);

  // Build active filter tags for display
  const activeFilterTags = useMemo(() => {
    const tags: { type: string; label: string; value: string }[] = [];
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

      {/* ─── Trust Metrics (TD-03: real data from Supabase, no fake numbers) ─── */}
      <TrustMetricsSection />

      {/* ─── Featured Jobs Carousel ─── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-[#f59e0b]" />
            <h2 className="text-sm font-semibold text-zinc-200">Featured Positions</h2>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => scrollCarousel('left')}
              className="flex h-7 w-7 items-center justify-center rounded-sm border border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => scrollCarousel('right')}
              className="flex h-7 w-7 items-center justify-center rounded-sm border border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div
          ref={carouselRef}
          className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {FEATURED_INDICES.map((idx) => (
            <FeaturedJobCard
              key={idx}
              job={STATIC_JOBS[idx]}
              idx={idx}
              onApply={() => apply({ ...STATIC_JOBS[idx], id: `static-${idx}`, created_at: '', posted_by: null } as Job)}
              applied={appliedKeys.has(`${STATIC_JOBS[idx].title}|${STATIC_JOBS[idx].company}`)}
              applying={applyingId === `static-${idx}`}
            />
          ))}
        </div>
      </div>

      {/* ─── Live Activity Feed ─── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
            </div>
            <h2 className="text-sm font-semibold text-zinc-200">Recent Applications</h2>
          </div>
          <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-600">Live</span>
        </div>

        <div className="grid gap-1.5">
          {ACTIVITY_FEED.slice(0, visibleActivities).map((a, i) => (
            <div
              key={i}
              className="flex items-center gap-3 border border-zinc-800/50 bg-[#0d0d0d] rounded-sm px-4 py-2.5 animate-in fade-in slide-in-from-top-1 duration-300 hover:border-zinc-700 transition-colors"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                  a.type === 'application'
                    ? 'bg-blue-500/10 text-blue-400'
                    : a.type === 'filled'
                      ? 'bg-green-500/10 text-green-400'
                      : a.type === 'closed'
                        ? 'bg-zinc-700/30 text-zinc-500'
                        : 'bg-[#f59e0b]/10 text-[#f59e0b]'
                }`}
              >
                {a.type === 'application' ? (
                  <Users className="h-3 w-3" />
                ) : a.type === 'filled' ? (
                  <BadgeCheck className="h-3 w-3" />
                ) : a.type === 'closed' ? (
                  <X className="h-3 w-3" />
                ) : (
                  <Zap className="h-3 w-3" />
                )}
              </div>
              <p className="flex-1 text-xs text-zinc-400">{a.text}</p>
              <span className="text-[10px] text-zinc-600 whitespace-nowrap flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {a.time}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Filter Sidebar Overlay (Desktop: right sidebar, Mobile: bottom sheet) ─── */}
      {showFilters && (
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
                    <h3 className="text-sm font-semibold text-zinc-100">Filter Jobs</h3>
                    <p className="text-[10px] text-zinc-500">{activeFilterCount} active filter{activeFilterCount !== 1 ? 's' : ''}</p>
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
                {/* Country */}
                <div className="space-y-3">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-semibold">Country</label>
                  <div className="grid grid-cols-2 gap-2">
                    {COUNTRIES.map((c) => (
                      <button
                        key={c}
                        onClick={() => toggleFilter(selectedCountries, setSelectedCountries, c)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all duration-200 ${
                          selectedCountries.includes(c)
                            ? 'bg-[#f59e0b]/10 border-[#f59e0b]/40 text-[#f59e0b]'
                            : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
                        }`}
                      >
                        <Globe className="h-3 w-3 shrink-0" />
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Discipline */}
                <div className="space-y-3">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-semibold">Discipline</label>
                  <div className="grid grid-cols-2 gap-2">
                    {DISCIPLINES.map((d) => (
                      <button
                        key={d}
                        onClick={() => toggleFilter(selectedDisciplines, setSelectedDisciplines, d)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all duration-200 ${
                          selectedDisciplines.includes(d)
                            ? 'bg-[#f59e0b]/10 border-[#f59e0b]/40 text-[#f59e0b]'
                            : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
                        }`}
                      >
                        <Briefcase className="h-3 w-3 shrink-0" />
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Work Type */}
                <div className="space-y-3">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-semibold">Work Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {WORK_TYPES.map((w) => (
                      <button
                        key={w}
                        onClick={() => toggleFilter(selectedWorkTypes, setSelectedWorkTypes, w)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all duration-200 ${
                          selectedWorkTypes.includes(w)
                            ? 'bg-[#f59e0b]/10 border-[#f59e0b]/40 text-[#f59e0b]'
                            : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
                        }`}
                      >
                        <Anchor className="h-3 w-3 shrink-0" />
                        {w}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Contract Type */}
                <div className="space-y-3">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-semibold">Contract Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {CONTRACT_TYPES_OPTIONS.map((ct) => (
                      <button
                        key={ct}
                        onClick={() => toggleFilter(selectedContractTypes, setSelectedContractTypes, ct)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all duration-200 ${
                          selectedContractTypes.includes(ct)
                            ? 'bg-[#f59e0b]/10 border-[#f59e0b]/40 text-[#f59e0b]'
                            : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
                        }`}
                      >
                        <Building2 className="h-3 w-3 shrink-0" />
                        {ct}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Urgent Only Toggle */}
                <div className="space-y-3">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-semibold">Priority</label>
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
                      Urgent Positions Only
                    </span>
                    <div className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${urgentOnly ? 'bg-red-500' : 'bg-zinc-700'}`}>
                      <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${urgentOnly ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </div>
                  </button>
                </div>
              </div>

              {/* Footer */}
              <div className="p-5 border-t border-zinc-800/80 space-y-2.5">
                <Button
                  onClick={() => setShowFilters(false)}
                  className="w-full bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold"
                >
                  Show {filtered.length} Result{filtered.length !== 1 ? 's' : ''}
                </Button>
                {activeFilterCount > 0 && (
                  <Button
                    variant="outline"
                    onClick={clearFilters}
                    className="w-full border-zinc-700 text-zinc-400 hover:text-zinc-200 !bg-transparent hover:!bg-zinc-900"
                  >
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
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-zinc-700" />
            </div>

            <div className="flex flex-col max-h-[80vh]">
              {/* Header */}
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
                <button
                  onClick={() => setShowFilters(false)}
                  className="text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Filter Content */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5" style={{ scrollbarWidth: 'none' }}>
                {/* Country */}
                <div className="space-y-2.5">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-semibold">Country</label>
                  <div className="flex flex-wrap gap-2">
                    {COUNTRIES.map((c) => (
                      <button
                        key={c}
                        onClick={() => toggleFilter(selectedCountries, setSelectedCountries, c)}
                        className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-all duration-200 ${
                          selectedCountries.includes(c)
                            ? 'bg-[#f59e0b]/10 border-[#f59e0b]/40 text-[#f59e0b]'
                            : 'bg-zinc-900/60 border-zinc-800 text-zinc-400'
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Discipline */}
                <div className="space-y-2.5">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-semibold">Discipline</label>
                  <div className="flex flex-wrap gap-2">
                    {DISCIPLINES.map((d) => (
                      <button
                        key={d}
                        onClick={() => toggleFilter(selectedDisciplines, setSelectedDisciplines, d)}
                        className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-all duration-200 ${
                          selectedDisciplines.includes(d)
                            ? 'bg-[#f59e0b]/10 border-[#f59e0b]/40 text-[#f59e0b]'
                            : 'bg-zinc-900/60 border-zinc-800 text-zinc-400'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Work Type */}
                <div className="space-y-2.5">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-semibold">Work Type</label>
                  <div className="flex flex-wrap gap-2">
                    {WORK_TYPES.map((w) => (
                      <button
                        key={w}
                        onClick={() => toggleFilter(selectedWorkTypes, setSelectedWorkTypes, w)}
                        className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-all duration-200 ${
                          selectedWorkTypes.includes(w)
                            ? 'bg-[#f59e0b]/10 border-[#f59e0b]/40 text-[#f59e0b]'
                            : 'bg-zinc-900/60 border-zinc-800 text-zinc-400'
                        }`}
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Contract Type */}
                <div className="space-y-2.5">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-semibold">Contract Type</label>
                  <div className="flex flex-wrap gap-2">
                    {CONTRACT_TYPES_OPTIONS.map((ct) => (
                      <button
                        key={ct}
                        onClick={() => toggleFilter(selectedContractTypes, setSelectedContractTypes, ct)}
                        className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-all duration-200 ${
                          selectedContractTypes.includes(ct)
                            ? 'bg-[#f59e0b]/10 border-[#f59e0b]/40 text-[#f59e0b]'
                            : 'bg-zinc-900/60 border-zinc-800 text-zinc-400'
                        }`}
                      >
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
                      : 'bg-zinc-900/60 border-zinc-800'
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
              </div>

              {/* Footer */}
              <div className="px-5 py-4 border-t border-zinc-800/80 space-y-2.5">
                <Button
                  onClick={() => setShowFilters(false)}
                  className="w-full bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold"
                >
                  Show {filtered.length} Result{filtered.length !== 1 ? 's' : ''}
                </Button>
                {activeFilterCount > 0 && (
                  <Button
                    variant="outline"
                    onClick={clearFilters}
                    className="w-full border-zinc-700 text-zinc-400 !bg-transparent"
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                    Reset All
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Active Filter Tags ─── */}
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
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 px-2 py-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            Clear all
          </button>
        </div>
      )}

      {/* ─── Job Listings ─── */}
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
            {displayJobs.map((job) => {
              const applied = appliedKeys.has(`${job.title}|${job.company}`);
              const salary = formatSalary(job);
              const sIdx = getStaticIndex(job);
              const urgent = URGENT_INDICES.includes(sIdx);
              const offshore = isOffshore(sIdx);
              const rotation = ROTATIONS[sIdx];
              const postedTime = sIdx >= 0 && sIdx < POSTED_TIMES.length ? POSTED_TIMES[sIdx] : '1w ago';

              return (
                <div
                  key={job.id}
                  className="group relative flex flex-col gap-4 border border-zinc-800/80 bg-[#0d0d0d] p-5 rounded-sm hover:border-[#f59e0b]/40 transition-all duration-300 hover:shadow-lg hover:shadow-[#f59e0b]/5 md:flex-row md:items-center md:justify-between"
                >
                  {/* Hover gradient */}
                  <div className="absolute inset-0 bg-gradient-to-r from-[#f59e0b]/[0.01] to-transparent rounded-sm opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                  <div className="relative flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-zinc-100 group-hover:text-[#f59e0b] transition-colors duration-300">
                        {job.title}
                      </h3>
                      {urgent && (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/20 rounded-sm">
                          <AlertTriangle className="h-3 w-3" />
                          Urgent
                        </span>
                      )}
                      {offshore && (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-sm">
                          <Anchor className="h-3 w-3" />
                          Offshore
                        </span>
                      )}
                      {job.is_remote && (
                        <span className="px-1.5 py-0.5 text-[9px] uppercase tracking-wider border border-emerald-400/30 text-emerald-400 rounded-sm">
                          {t('jobs.remote')}
                        </span>
                      )}
                      {job.category && (
                        <span className="px-1.5 py-0.5 text-[9px] uppercase tracking-wider border border-zinc-700 text-zinc-500 rounded-sm">
                          {job.category}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                      <span className="flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5" />
                        {job.company}
                      </span>
                      <span className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-sm">
                        <BadgeCheck className="h-3 w-3" />
                        Verified
                      </span>
                      {job.location && (
                        <span className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5" />
                          {job.location}
                        </span>
                      )}
                      {rotation && (
                        <span className="text-zinc-600">Rotation: {rotation}</span>
                      )}
                      <span className="uppercase tracking-[0.15em]">{job.job_type}</span>
                      {salary && <span className="text-[#f59e0b] font-medium">{salary}</span>}
                    </div>

                    {job.description && (
                      <p className="text-sm text-zinc-400 max-w-3xl leading-relaxed">
                        {job.description}
                      </p>
                    )}

                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-600">
                      <Clock className="h-3 w-3" />
                      Posted {postedTime}
                    </div>
                  </div>

                  <Button
                    onClick={() => apply(job)}
                    disabled={applied || applyingId === job.id}
                    className={`relative shrink-0 font-semibold ${
                      applied
                        ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-800'
                        : 'bg-[#f59e0b] text-black hover:bg-[#d97706]'
                    }`}
                  >
                    {applied
                      ? t('jobs.applied')
                      : applyingId === job.id
                        ? t('jobs.applying')
                        : t('jobs.apply')}
                    {!applied && applyingId !== job.id && (
                      <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}