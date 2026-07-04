import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { supabase, TABLES } from '@/lib/supabase';
import {
  UserCheck,
  Calculator,
  GraduationCap,
  Briefcase,
  ShieldCheck,
  Clock,
  FileCheck,
  ArrowRight,
  ChevronDown,
  Globe,
  Lock,
} from 'lucide-react';

// BUG-001: Landing page. Replaces the old redirect-only Index.
// If the user is logged in, redirect to /dashboard.
// All metrics are real (DEC-33: never fabricated). Dark theme only (DEC-45).

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

interface RealMetric {
  label: string;
  value: number;
}

function useRealMetrics() {
  const [metrics, setMetrics] = useState<RealMetric[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [workersRes, companiesRes] = await Promise.all([
          supabase
            .from(TABLES.profiles)
            .select('*', { count: 'exact', head: true })
            .in('role', ['worker', 'company']),
          supabase
            .from(TABLES.profiles)
            .select('*', { count: 'exact', head: true })
            .eq('role', 'company'),
        ]);

        const total = workersRes.count ?? 0;
        const companies = companiesRes.count ?? 0;
        const workers = Math.max(0, total - companies);

        setMetrics([
          { label: 'Professionals registered', value: workers },
          { label: 'Companies', value: companies },
          { label: 'Free engineering tools', value: 2 },
        ]);
      } catch {
        setMetrics([
          { label: 'Professionals registered', value: 0 },
          { label: 'Companies', value: 0 },
          { label: 'Free engineering tools', value: 2 },
        ]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { metrics, loading };
}

function AnimatedCounter({ metric }: { metric: RealMetric }) {
  const { count, ref } = useCounter(metric.value);
  return (
    <div ref={ref} className="text-center">
      <p className="text-3xl font-bold text-[#f59e0b] tabular-nums sm:text-4xl">
        {count.toLocaleString()}+
      </p>
      <p className="mt-1 text-[11px] uppercase tracking-[0.15em] text-zinc-500">
        {metric.label}
      </p>
    </div>
  );
}

const FAQ_ITEMS = [
  {
    q: 'Is PipingBox free for workers?',
    a: 'Yes. Workers get a free profile, marketplace access, community, and engineering tools — forever. Only Academy certification courses are paid.',
  },
  {
    q: 'Does PipingBox issue official certifications?',
    a: 'No. PipingBox prepares you for the official certification exams (VCA, SCC, PRL). The certification itself is issued by the official certifying body (SSVV, SCC Stiftung, etc.). PipingBox is a partner, not a competitor.',
  },
  {
    q: 'Which certifications can I prepare for?',
    a: 'VCA Basic (Belgium/Netherlands), SCC (Germany/DACH), and PRL (Spain). More certifications will be added as we expand.',
  },
  {
    q: 'How much does the VCA course cost?',
    a: 'The VCA Basic preparation course is 59.90 EUR — about 6x cheaper than classroom training (250-400 EUR).',
  },
  {
    q: 'Do the engineering tools work without registration?',
    a: 'Yes. The tools are public and free. No login required. Sign up only if you want to save your calculations and access the marketplace.',
  },
];

function FaqItem({ item }: { item: { q: string; a: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-zinc-800/80 bg-[#0d0d0d]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-medium text-zinc-200"
      >
        {item.q}
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="border-t border-zinc-800/60 px-5 py-4 text-sm text-zinc-400">
          {item.a}
        </div>
      )}
    </div>
  );
}

const WORKER_BENEFITS = [
  { icon: UserCheck, title: 'Verifiable professional profile', desc: 'Build a profile that companies trust. Certifications, experience, and documents in one place.' },
  { icon: Calculator, title: 'Free engineering tools', desc: 'Wall thickness calculator, unit converter, pipe data tables — built for the field, free forever.' },
  { icon: GraduationCap, title: 'VCA, SCC & PRL preparation', desc: 'Prepare for certification exams at 6x less cost than classroom training.' },
  { icon: Briefcase, title: 'Industrial job opportunities', desc: 'Apply to verified industrial projects across Europe. Your profile works for you 24/7.' },
];

const COMPANY_BENEFITS = [
  { icon: ShieldCheck, title: 'Verified talent pool', desc: 'Access professionals whose certifications and experience are documented and searchable.' },
  { icon: Clock, title: 'Faster hiring', desc: 'Stop sifting through irrelevant CVs. Filter by certification, trade, location, and availability.' },
  { icon: FileCheck, title: 'Compliance & audit', desc: 'Track certification expiry, generate compliance reports, and maintain an auditable hiring trail.' },
];

export default function Index() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { metrics, loading: metricsLoading } = useRealMetrics();

  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#f59e0b] border-t-transparent" />
      </div>
    );
  }

  if (user) return null;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-zinc-800/80 bg-[#0a0a0a]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-1">
            <span className="text-lg font-bold tracking-tight">
              Piping<span className="text-[#f59e0b]">Box</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="text-sm text-zinc-400 transition hover:text-zinc-100"
            >
              {t('landing.signIn', { defaultValue: 'Sign in' })}
            </Link>
            <Link
              to="/register"
              className="rounded-md bg-[#f59e0b] px-4 py-1.5 text-sm font-semibold text-black transition hover:bg-[#d97706]"
            >
              {t('landing.signUpFree', { defaultValue: 'Sign up free' })}
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.08),_transparent_50%)]" />
        <div className="relative mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 sm:py-28">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#f59e0b]">
            {t('landing.eyebrow', { defaultValue: 'The European industrial workforce platform' })}
          </p>
          <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight sm:text-5xl sm:leading-tight">
            {t('landing.headline', {
              defaultValue: 'PipingBox — the ecosystem for industrial professionals and companies',
            })}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-zinc-400 sm:text-lg">
            {t('landing.subheadline', {
              defaultValue:
                'Free engineering tools, certified training (VCA / SCC / PRL), verified jobs, and a technical community. Everything an industrial professional needs, in one place.',
            })}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/register"
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#f59e0b] px-6 py-3 text-sm font-semibold text-black transition hover:bg-[#d97706] sm:w-auto"
            >
              {t('landing.ctaCreateAccount', { defaultValue: 'Create a free account' })}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/tools"
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-zinc-700 bg-transparent px-6 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-zinc-900 sm:w-auto"
            >
              {t('landing.ctaExploreTools', { defaultValue: 'Explore tools' })}
            </Link>
          </div>
        </div>
      </section>

      {/* VIS-002: Trust badges */}
      <section className="border-t border-zinc-800/60 py-8">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-center">
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <ShieldCheck className="h-4 w-4 text-[#f59e0b]" />
              <span>GDPR compliant</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <FileCheck className="h-4 w-4 text-[#f59e0b]" />
              <span>ASME · EN · ISO standards</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <Globe className="h-4 w-4 text-[#f59e0b]" />
              <span>Made in Europe</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <Lock className="h-4 w-4 text-[#f59e0b]" />
              <span>Encrypted data</span>
            </div>
          </div>
        </div>
      </section>

      {/* For Workers */}
      <section className="border-t border-zinc-800/60 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">
            {t('landing.forWorkers', { defaultValue: 'For workers' })}
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-sm text-zinc-400">
            {t('landing.forWorkersSubtitle', {
              defaultValue: 'Everything you need to grow your industrial career — free.',
            })}
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {WORKER_BENEFITS.map((b) => {
              const Icon = b.icon;
              return (
                <div
                  key={b.title}
                  className="border border-zinc-800/80 bg-[#0d0d0d] p-5 rounded-sm transition hover:border-zinc-700"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-[#f59e0b]/10 border border-[#f59e0b]/20">
                    <Icon className="h-5 w-5 text-[#f59e0b]" />
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-zinc-100">{b.title}</h3>
                  <p className="mt-1.5 text-xs leading-5 text-zinc-400">{b.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* For Companies */}
      <section className="border-t border-zinc-800/60 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">
            {t('landing.forCompanies', { defaultValue: 'For companies' })}
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-sm text-zinc-400">
            {t('landing.forCompaniesSubtitle', {
              defaultValue: 'Hire verified industrial talent faster, with built-in compliance.',
            })}
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {COMPANY_BENEFITS.map((b) => {
              const Icon = b.icon;
              return (
                <div
                  key={b.title}
                  className="border border-zinc-800/80 bg-[#0d0d0d] p-5 rounded-sm transition hover:border-zinc-700"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-[#f59e0b]/10 border border-[#f59e0b]/20">
                    <Icon className="h-5 w-5 text-[#f59e0b]" />
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-zinc-100">{b.title}</h3>
                  <p className="mt-1.5 text-xs leading-5 text-zinc-400">{b.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Real metrics */}
      <section className="border-t border-zinc-800/60 py-16 sm:py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <div className="grid grid-cols-3 gap-4">
            {metricsLoading ? (
              <>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="text-center">
                    <div className="mx-auto h-10 w-20 animate-pulse rounded bg-zinc-800/60" />
                    <div className="mx-auto mt-2 h-3 w-24 animate-pulse rounded bg-zinc-800/40" />
                  </div>
                ))}
              </>
            ) : (
              metrics.map((m) => <AnimatedCounter key={m.label} metric={m} />)
            )}
          </div>
          <p className="mt-6 text-center text-[10px] uppercase tracking-[0.2em] text-zinc-600">
            {t('landing.liveData', { defaultValue: 'Live data — no fabricated numbers' })}
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-zinc-800/60 py-16 sm:py-20">
        <div className="mx-auto max-w-2xl px-4 sm:px-6">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">
            {t('landing.faq', { defaultValue: 'Frequently asked questions' })}
          </h2>
          <div className="mt-8 space-y-3">
            {FAQ_ITEMS.map((item, i) => (
              <FaqItem key={i} item={item} />
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-zinc-800/60 py-16 sm:py-20">
        <div className="mx-auto max-w-2xl px-4 text-center sm:px-6">
          <h2 className="text-2xl font-bold sm:text-3xl">
            {t('landing.finalCtaTitle', { defaultValue: 'Ready to get started?' })}
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            {t('landing.finalCtaSubtitle', {
              defaultValue: 'Create your free account in less than a minute.',
            })}
          </p>
          <Link
            to="/register"
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-md bg-[#f59e0b] px-6 py-3 text-sm font-semibold text-black transition hover:bg-[#d97706]"
          >
            {t('landing.ctaCreateAccount', { defaultValue: 'Create a free account' })}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800/80 bg-[#0d0d0d] py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6">
          <div className="flex items-center gap-1">
            <span className="text-sm font-bold">
              Piping<span className="text-[#f59e0b]">Box</span>
            </span>
            <span className="text-xs text-zinc-600">· Made in Europe</span>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-4 text-xs text-zinc-500">
            <Link to="/tools" className="transition hover:text-zinc-300">
              {t('landing.tools', { defaultValue: 'Tools' })}
            </Link>
            <Link to="/blog" className="transition hover:text-zinc-300">
              {t('landing.blog', { defaultValue: 'Blog' })}
            </Link>
            <Link to="/pricing" className="transition hover:text-zinc-300">
              {t('landing.pricing', { defaultValue: 'Pricing' })}
            </Link>
            <Link to="/register" className="transition hover:text-zinc-300">
              {t('landing.signUpFree', { defaultValue: 'Sign up free' })}
            </Link>
            <Link to="/login" className="transition hover:text-zinc-300">
              {t('landing.signIn', { defaultValue: 'Sign in' })}
            </Link>
          </nav>
        </div>
        <p className="mt-4 text-center text-[10px] text-zinc-600">
          © {new Date().getFullYear()} PipingBox. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
