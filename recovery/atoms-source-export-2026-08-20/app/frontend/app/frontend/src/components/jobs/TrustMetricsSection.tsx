import { useEffect, useRef, useState } from 'react';
import { Briefcase, BadgeCheck, TrendingUp, Globe } from 'lucide-react';
import { supabase, TABLES } from '@/lib/supabase';
import type { TrustMetric } from '@/lib/jobs/types';

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

function useTrustMetrics(): { metrics: TrustMetric[]; loading: boolean } {
  const [metrics, setMetrics] = useState<TrustMetric[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [jobsRes, companiesRes, appsRes] = await Promise.all([
          supabase.from(TABLES.jobs).select('*', { count: 'exact', head: true }),
          supabase.from(TABLES.profiles).select('*', { count: 'exact', head: true }).eq('role', 'company'),
          supabase.from(TABLES.jobApplications).select('*', { count: 'exact', head: true }),
        ]);

        const activeJobs = jobsRes.count ?? 0;
        const verifiedCompanies = companiesRes.count ?? 0;
        const applications = appsRes.count ?? 0;

        // Count distinct countries from profiles location
        const { data: locData } = await supabase
          .from(TABLES.profiles)
          .select('location')
          .not('location', 'is', null);
        const countries = new Set<string>();
        (locData || []).forEach((p: { location: string | null }) => {
          const loc = p.location || '';
          if (loc.includes('Belgium')) countries.add('Belgium');
          if (loc.includes('Netherlands')) countries.add('Netherlands');
          if (loc.includes('Germany')) countries.add('Germany');
          if (loc.includes('Norway')) countries.add('Norway');
          if (loc.includes('Spain') || loc.includes('España')) countries.add('Spain');
          if (loc.includes('France')) countries.add('France');
          if (loc.includes('UAE') || loc.includes('Emirates')) countries.add('UAE');
          if (loc.includes('United Kingdom') || loc.includes('UK')) countries.add('UK');
          if (loc.includes('TX') || loc.includes('USA') || loc.includes('Houston')) countries.add('USA');
          if (loc.includes('Poland')) countries.add('Poland');
          if (loc.includes('Portugal')) countries.add('Portugal');
          if (loc.includes('Italy')) countries.add('Italy');
        });
        const countryCount = countries.size;

        setMetrics([
          { label: 'Active Jobs', value: activeJobs, icon: Briefcase },
          { label: 'Companies', value: verifiedCompanies, icon: BadgeCheck },
          { label: 'Applications', value: applications, icon: TrendingUp },
          { label: 'Countries', value: countryCount, icon: Globe },
        ]);
      } catch {
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

export function TrustMetricsSection() {
  const { metrics } = useTrustMetrics();
  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      {metrics.map((m) => (
        <MetricCard key={m.label} metric={m} />
      ))}
    </div>
  );
}
