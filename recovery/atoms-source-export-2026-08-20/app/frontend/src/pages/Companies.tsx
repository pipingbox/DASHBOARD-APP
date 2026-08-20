import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  Globe,
  Users,
  ArrowRight,
  HardHat,
  Briefcase,
  Mail,
  Zap,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { supabase, TABLES } from '@/lib/supabase';

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

/* ─── Metric Card Component ─── */
function MetricCard({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) {
  const { count, ref } = useCounter(value);
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
          </p>
          <p className="text-[11px] uppercase tracking-[0.15em] text-zinc-500 mt-1.5 font-medium">
            {label}
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
  const [metrics, setMetrics] = useState({ companies: 0, positions: 0, workers: 0, countries: 0 });

  // Fetch real counts from Supabase
  useEffect(() => {
    let mounted = true;
    (async () => {
      const [companiesRes, jobsRes, workersRes] = await Promise.all([
        supabase.from(TABLES.profiles).select('id', { count: 'exact', head: true }).eq('role', 'company'),
        supabase.from(TABLES.jobs).select('id', { count: 'exact', head: true }).eq('status', 'open'),
        supabase.from(TABLES.profiles).select('id', { count: 'exact', head: true }).eq('role', 'worker'),
      ]);

      // Count distinct countries from profiles
      const { data: countryData } = await supabase
        .from(TABLES.profiles)
        .select('country')
        .not('country', 'is', null);
      const uniqueCountries = new Set((countryData ?? []).map((r: { country: string }) => r.country).filter(Boolean));

      if (!mounted) return;
      setMetrics({
        companies: companiesRes.count ?? 0,
        positions: jobsRes.count ?? 0,
        workers: workersRes.count ?? 0,
        countries: uniqueCountries.size,
      });
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow={t('companies.eyebrow')}
        title={t('companies.title')}
        description={t('companies.description')}
      />

      {/* ─── Metrics Section (real data from Supabase) ─── */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <MetricCard label={t('companies.activeCompanies', 'Active Companies')} value={metrics.companies} icon={Building2} />
        <MetricCard label={t('companies.openPositions', 'Open Positions')} value={metrics.positions} icon={Briefcase} />
        <MetricCard label={t('companies.availableWorkers', 'Available Workers')} value={metrics.workers} icon={Users} />
        <MetricCard label={t('companies.countriesActive', 'Countries Active')} value={metrics.countries} icon={Globe} />
      </div>

      {/* ─── Request Workforce CTA ─── */}
      <div className="border border-[#f59e0b]/30 bg-gradient-to-r from-[#f59e0b]/5 to-transparent rounded-sm p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-[#f59e0b]/10 border border-[#f59e0b]/30">
            <HardHat className="h-5 w-5 text-[#f59e0b]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">{t('companies.needWorkers', 'Need Industrial Workers?')}</h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              {t('companies.needWorkersDesc', 'Submit a workforce request and get matched with qualified professionals within 24 hours.')}
            </p>
          </div>
        </div>
        <Link to="/companies/request-workers">
          <Button className="bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold text-sm whitespace-nowrap">
            {t('companies.requestWorkforce', 'Request Workforce')}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      </div>

      {/* ─── Secondary CTA ─── */}
      <div className="border border-zinc-800/80 bg-gradient-to-br from-[#0d0d0d] to-zinc-900/30 rounded-sm p-8 lg:p-10 text-center space-y-5">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#f59e0b]/10 border border-[#f59e0b]/20">
          <Zap className="h-6 w-6 text-[#f59e0b]" />
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-zinc-100">{t('companies.urgentSupport', 'Need urgent workforce support?')}</h3>
          <p className="text-sm text-zinc-400 max-w-lg mx-auto leading-relaxed">
            {t('companies.urgentSupportDesc', 'PipingBox helps industrial companies connect with qualified professionals fast across Europe. Get matched within 24 hours.')}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Link to="/companies/request-workers">
            <Button className="bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold text-sm px-6">
              <HardHat className="mr-2 h-4 w-4" />
              {t('companies.requestWorkforce', 'Request Workforce')}
            </Button>
          </Link>
          <a href="mailto:recruitment@pipingbox.com">
            <Button
              variant="outline"
              className="border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 text-sm px-6 !bg-transparent !hover:bg-transparent"
            >
              <Mail className="mr-2 h-4 w-4" />
              {t('companies.contactTeam', 'Contact Recruitment Team')}
            </Button>
          </a>
        </div>
      </div>
    </div>
  );
}