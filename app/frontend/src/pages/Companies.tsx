import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  Globe,
  MapPin,
  Users,
  ArrowRight,
  HardHat,
  BadgeCheck,
  Briefcase,
  TrendingUp,
  Clock,
  Mail,
  Zap,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';

/* ─── Animated Counter Hook ─── */
function useCounter(target: number, duration = 1800) {
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

/* ─── Metrics Data ─── */
const METRICS = [
  { label: 'Active Companies', value: 48, suffix: '', icon: Building2 },
  { label: 'Open Positions', value: 126, suffix: '', icon: Briefcase },
  { label: 'Available Workers', value: 2340, suffix: '', icon: Users },
  { label: 'Countries Active', value: 17, suffix: '', icon: Globe },
];

/* ─── Activity Feed ─── */
const ACTIVITY = [
  {
    company: 'Siemens Energy',
    action: 'requested',
    count: 12,
    role: 'Pipefitters',
    country: 'Belgium',
    flag: '🇧🇪',
    time: '2 hours ago',
  },
  {
    company: 'Subsea 7',
    action: 'requested',
    count: 6,
    role: 'TIG Welders',
    country: 'Norway',
    flag: '🇳🇴',
    time: '4 hours ago',
  },
  {
    company: 'Fluor Corporation',
    action: 'requested',
    count: 8,
    role: 'QA/QC Inspectors',
    country: 'Netherlands',
    flag: '🇳🇱',
    time: '6 hours ago',
  },
  {
    company: 'TechnipFMC',
    action: 'requested',
    count: 15,
    role: 'Scaffolders',
    country: 'United Kingdom',
    flag: '🇬🇧',
    time: '8 hours ago',
  },
  {
    company: 'Saipem',
    action: 'requested',
    count: 4,
    role: 'Instrument Technicians',
    country: 'Italy',
    flag: '🇮🇹',
    time: '12 hours ago',
  },
];

/* ─── Companies Data ─── */
const COMPANIES = [
  {
    name: 'Neptune Energy',
    sector: 'Oil & Gas',
    hq: 'Houston, TX',
    size: '5,000+',
    description: 'Upstream and LNG projects across the Gulf Coast.',
    verified: true,
    hiring: true,
    projects: 3,
    tags: ['Upstream', 'LNG', 'Offshore'],
  },
  {
    name: 'Meridian EPC',
    sector: 'Engineering & Construction',
    hq: 'Calgary, CA',
    size: '1,200',
    description: 'Mid-scale refinery and petrochemical retrofits.',
    verified: true,
    hiring: true,
    projects: 2,
    tags: ['Refinery', 'Petrochemical'],
  },
  {
    name: 'Aurora Process',
    sector: 'Chemicals',
    hq: 'Rotterdam, NL',
    size: '800',
    description: 'Specialty chemicals plants and revamp projects.',
    verified: true,
    hiring: false,
    projects: 1,
    tags: ['Chemicals', 'Revamp'],
  },
  {
    name: 'Helios Power',
    sector: 'Power Generation',
    hq: 'Dubai, UAE',
    size: '3,400',
    description: 'Combined-cycle and district cooling infrastructure.',
    verified: true,
    hiring: true,
    projects: 4,
    tags: ['Power', 'District Cooling'],
  },
  {
    name: 'Orion Offshore',
    sector: 'Offshore',
    hq: 'Aberdeen, UK',
    size: '950',
    description: 'Offshore platforms and subsea tie-back specialists.',
    verified: true,
    hiring: true,
    projects: 2,
    tags: ['Offshore', 'Subsea'],
  },
  {
    name: 'Vertex Piping',
    sector: 'Fabrication',
    hq: 'Sao Paulo, BR',
    size: '500',
    description: 'Modular pipe spool fabrication and logistics.',
    verified: false,
    hiring: false,
    projects: 1,
    tags: ['Fabrication', 'Modular'],
  },
];

/* ─── Metric Card Component ─── */
function MetricCard({ metric }: { metric: (typeof METRICS)[0] }) {
  const { count, ref } = useCounter(metric.value);
  const Icon = metric.icon;
  return (
    <div
      ref={ref}
      className="group relative border border-zinc-800/80 bg-[#0d0d0d] p-5 rounded-sm hover:border-zinc-700 transition-all duration-300 hover:shadow-lg hover:shadow-[#f59e0b]/5"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-[#f59e0b]/[0.02] to-transparent rounded-sm opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="relative flex items-center justify-between">
        <div>
          <p className="text-3xl font-bold text-zinc-100 tabular-nums">
            {count.toLocaleString()}
            {metric.suffix}
          </p>
          <p className="text-[11px] uppercase tracking-[0.15em] text-zinc-500 mt-1.5 font-medium">
            {metric.label}
          </p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-[#f59e0b]/10 border border-[#f59e0b]/20">
          <Icon className="h-5 w-5 text-[#f59e0b]" />
        </div>
      </div>
    </div>
  );
}

/* ─── Main Component ─── */
export default function Companies() {
  const { t } = useTranslation();
  const [visibleActivities, setVisibleActivities] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisibleActivities((prev) => (prev < ACTIVITY.length ? prev + 1 : prev));
    }, 400);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow={t('companies.eyebrow')}
        title={t('companies.title')}
        description={t('companies.description')}
      />

      {/* ─── Metrics Section ─── */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {METRICS.map((m) => (
          <MetricCard key={m.label} metric={m} />
        ))}
      </div>

      {/* ─── Request Workforce CTA ─── */}
      <div className="border border-[#f59e0b]/30 bg-gradient-to-r from-[#f59e0b]/5 to-transparent rounded-sm p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-[#f59e0b]/10 border border-[#f59e0b]/30">
            <HardHat className="h-5 w-5 text-[#f59e0b]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">Need Industrial Workers?</h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Submit a workforce request and get matched with qualified professionals within 24
              hours.
            </p>
          </div>
        </div>
        <Link to="/companies/request-workers">
          <Button className="bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold text-sm whitespace-nowrap">
            Request Workforce
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      </div>

      {/* ─── Live Activity Feed ─── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
            </div>
            <h2 className="text-sm font-semibold text-zinc-200">Recent Hiring Activity</h2>
          </div>
          <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-600">Live</span>
        </div>

        <div className="space-y-2">
          {ACTIVITY.slice(0, visibleActivities).map((a, i) => (
            <div
              key={i}
              className="flex items-center gap-4 border border-zinc-800/60 bg-[#0d0d0d] rounded-sm px-4 py-3 animate-in fade-in slide-in-from-top-2 duration-300 hover:border-zinc-700 transition-colors"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <span className="text-lg shrink-0">{a.flag}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-200 truncate">
                  <span className="font-medium text-zinc-100">{a.company}</span>{' '}
                  <span className="text-zinc-500">{a.action}</span>{' '}
                  <span className="text-[#f59e0b] font-medium">{a.count}</span>{' '}
                  <span className="text-zinc-300">{a.role}</span>{' '}
                  <span className="text-zinc-500">in {a.country}</span>
                </p>
              </div>
              <span className="text-[10px] text-zinc-600 whitespace-nowrap flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {a.time}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Company Cards ─── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">Partner Companies</h2>
          <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-600">
            {COMPANIES.length} registered
          </span>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {COMPANIES.map((c) => (
            <div
              key={c.name}
              className="group relative border border-zinc-800/80 bg-[#0d0d0d] p-6 rounded-sm hover:border-[#f59e0b]/50 transition-all duration-300 hover:shadow-lg hover:shadow-[#f59e0b]/5 hover:-translate-y-0.5"
            >
              {/* Hover gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-br from-[#f59e0b]/[0.02] to-transparent rounded-sm opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              <div className="relative">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-[#f59e0b]" />
                    {c.verified && (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-sm">
                        <BadgeCheck className="h-3 w-3" />
                        Verified
                      </span>
                    )}
                  </div>
                  {c.hiring ? (
                    <span className="flex items-center gap-1 px-2 py-0.5 text-[9px] uppercase tracking-wider bg-green-500/10 text-green-400 border border-green-500/20 rounded-sm">
                      <Zap className="h-3 w-3" />
                      Hiring
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 text-[9px] uppercase tracking-wider text-zinc-600 border border-zinc-800 rounded-sm">
                      Inactive
                    </span>
                  )}
                </div>

                <h3 className="mt-4 text-base font-semibold text-zinc-100 group-hover:text-[#f59e0b] transition-colors duration-300">
                  {c.name}
                </h3>
                <p className="mt-1 text-sm text-zinc-400 leading-relaxed">{c.description}</p>

                {/* Tags */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {c.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 text-[10px] bg-zinc-900 text-zinc-500 border border-zinc-800/60 rounded-sm"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="mt-4 grid gap-1.5 text-xs text-zinc-500">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" /> {c.hq}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" /> {c.size} {t('companies.employees')}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5" /> {c.projects} active project
                    {c.projects > 1 ? 's' : ''}
                  </span>
                </div>

                {/* Sector badge */}
                <div className="mt-4 pt-4 border-t border-zinc-800/60 flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-600">
                    {c.sector}
                  </span>
                  <Globe className="h-3.5 w-3.5 text-zinc-700" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Secondary CTA ─── */}
      <div className="border border-zinc-800/80 bg-gradient-to-br from-[#0d0d0d] to-zinc-900/30 rounded-sm p-8 lg:p-10 text-center space-y-5">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#f59e0b]/10 border border-[#f59e0b]/20">
          <Zap className="h-6 w-6 text-[#f59e0b]" />
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-zinc-100">Need urgent workforce support?</h3>
          <p className="text-sm text-zinc-400 max-w-lg mx-auto leading-relaxed">
            PipingBox helps industrial companies connect with qualified professionals fast across
            Europe. Get matched within 24 hours.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Link to="/companies/request-workers">
            <Button className="bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold text-sm px-6">
              <HardHat className="mr-2 h-4 w-4" />
              Request Workforce
            </Button>
          </Link>
          <a href="mailto:recruitment@pipingbox.com">
            <Button
              variant="outline"
              className="border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 text-sm px-6 !bg-transparent !hover:bg-transparent"
            >
              <Mail className="mr-2 h-4 w-4" />
              Contact Recruitment Team
            </Button>
          </a>
        </div>
      </div>
    </div>
  );
}