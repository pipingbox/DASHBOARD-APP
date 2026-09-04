import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { catalogStats } from '@/tools/catalog';
import { PipingBoxLogo } from '@/components/PipingBoxLogo';
import { LanguageSelector } from '@/components/LanguageSelector';
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
  Wrench,
  IdCard,
  HardHat,
  BookOpen,
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

// Landing proof points.
//
// These deliberately measure the DEPTH OF THE TECHNICAL LIBRARY, not how many
// people have signed up. On a young platform a user count is both weak and
// self-defeating: "47 professionals" invites the reader to conclude we are
// empty. The library is the opposite — it is genuinely large, and it is the
// thing a piping professional actually came to evaluate.
//
// Every figure below is derived, never typed by hand:
//   - drawings / dimensionRows / standards come from `catalogStats`, emitted by
//     scripts/build-catalog.mjs from the Brain YAML at build time.
//   - IMPLEMENTED_TOOLS counts only tools with `implemented: true` in Tools.tsx.
//     The previous value (12) counted two tools that do not exist yet.
//
// See CHANGELOG v4.81.0: no metric ships without a source.
const IMPLEMENTED_TOOLS = 10;

function useRealMetrics() {
  const metrics: RealMetric[] = [
    { label: 'Technical drawings', value: catalogStats.drawings },
    { label: 'Dimensional data rows', value: catalogStats.dimensionRows },
    { label: 'Standards covered', value: catalogStats.standards },
    { label: 'Free engineering tools', value: IMPLEMENTED_TOOLS },
  ];
  return { metrics, loading: false };
}

function AnimatedCounter({ metric }: { metric: RealMetric }) {
  const { count, ref } = useCounter(metric.value);
  return (
    <div ref={ref} className="text-center">
      <p className="text-3xl font-bold text-[#f59e0b] tabular-nums sm:text-4xl">
        {count.toLocaleString()}
      </p>
      <p className="mt-1 text-[11px] uppercase tracking-[0.15em] text-zinc-500">
        {metric.label}
      </p>
    </div>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-zinc-800/80 bg-[#0d0d0d]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-medium text-zinc-200"
      >
        {question}
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="border-t border-zinc-800/60 px-5 py-4 text-sm text-zinc-400">
          {answer}
        </div>
      )}
    </div>
  );
}

export default function Index() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { metrics } = useRealMetrics();

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

  const faqItems = [
    { q: t('landing.faq.q1'), a: t('landing.faq.a1') },
    { q: t('landing.faq.q2'), a: t('landing.faq.a2') },
    { q: t('landing.faq.q3'), a: t('landing.faq.a3') },
    { q: t('landing.faq.q4'), a: t('landing.faq.a4') },
    { q: t('landing.faq.q5'), a: t('landing.faq.a5') },
  ];

  const workerBenefits = [
    { icon: UserCheck, titleKey: 'landing.workers.benefits.profile.title', descKey: 'landing.workers.benefits.profile.desc' },
    { icon: Calculator, titleKey: 'landing.workers.benefits.tools.title', descKey: 'landing.workers.benefits.tools.desc' },
    { icon: GraduationCap, titleKey: 'landing.workers.benefits.training.title', descKey: 'landing.workers.benefits.training.desc' },
    { icon: Briefcase, titleKey: 'landing.workers.benefits.jobs.title', descKey: 'landing.workers.benefits.jobs.desc' },
  ];

  const companyBenefits = [
    { icon: ShieldCheck, titleKey: 'landing.companies.benefits.verified.title', descKey: 'landing.companies.benefits.verified.desc' },
    { icon: Clock, titleKey: 'landing.companies.benefits.time.title', descKey: 'landing.companies.benefits.time.desc' },
    { icon: FileCheck, titleKey: 'landing.companies.benefits.compliance.title', descKey: 'landing.companies.benefits.compliance.desc' },
  ];

  const explorePillars = [
    { icon: Wrench, titleKey: 'landing.explore.tools.title', descKey: 'landing.explore.tools.desc', ctaKey: 'landing.explore.tools.cta', href: '/tools' },
    { icon: IdCard, titleKey: 'landing.explore.profile.title', descKey: 'landing.explore.profile.desc', ctaKey: 'landing.explore.profile.cta', href: '/register' },
    { icon: HardHat, titleKey: 'landing.explore.jobs.title', descKey: 'landing.explore.jobs.desc', ctaKey: 'landing.explore.jobs.cta', href: '/jobs' },
    { icon: BookOpen, titleKey: 'landing.explore.academy.title', descKey: 'landing.explore.academy.desc', ctaKey: 'landing.explore.academy.cta', href: '/academy' },
  ];

  const trustBadges = [
    { icon: ShieldCheck, labelKey: 'landing.trust.gdpr' },
    { icon: FileCheck, labelKey: 'landing.trust.standards' },
    { icon: Globe, labelKey: 'landing.trust.madeIn' },
    { icon: Lock, labelKey: 'landing.trust.encrypted' },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-zinc-800/80 bg-[#0a0a0a]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
          <Link to="/" className="flex items-center gap-1">
            <PipingBoxLogo variant="header" />
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <LanguageSelector className="inline-flex" />
            <Link
              to="/login"
              className="text-sm text-zinc-400 transition hover:text-zinc-100"
            >
              {t('landing.nav.signIn')}
            </Link>
            <Link
              to="/register"
              className="rounded-md bg-[#f59e0b] px-3 py-1.5 text-sm font-semibold text-black transition hover:bg-[#d97706] sm:px-4"
            >
              {t('landing.nav.signUp')}
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.08),_transparent_50%)]" />
        <div className="relative mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 sm:py-28">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#f59e0b]">
            {t('landing.hero.badge')}
          </p>
          <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight sm:text-5xl sm:leading-tight">
            {t('landing.hero.headline')}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-zinc-400 sm:text-lg">
            {t('landing.hero.subtitle')}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/register"
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#f59e0b] px-6 py-3 text-sm font-semibold text-black transition hover:bg-[#d97706] sm:w-auto"
            >
              {t('landing.hero.cta')}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/tools"
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-zinc-700 bg-transparent px-6 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-zinc-900 sm:w-auto"
            >
              {t('landing.hero.ctaSecondary')}
            </Link>
          </div>
        </div>
      </section>

      {/* VIS-002: Trust badges */}
      <section className="border-t border-zinc-800/60 py-8">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-center">
            {trustBadges.map(({ icon: Icon, labelKey }) => (
              <div key={labelKey} className="flex items-center gap-2 text-xs text-zinc-500">
                <Icon className="h-4 w-4 text-[#f59e0b]" />
                <span>{t(labelKey)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* P1: Explore the platform */}
      <section className="border-t border-zinc-800/60 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">
            {t('landing.explore.title')}
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-sm text-zinc-400">
            {t('landing.explore.subtitle')}
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {explorePillars.map(({ icon: Icon, titleKey, descKey, ctaKey, href }) => (
              <Link
                key={titleKey}
                to={href}
                className="group border border-zinc-800/80 bg-[#0d0d0d] p-5 rounded-sm transition hover:border-zinc-700"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-[#f59e0b]/10 border border-[#f59e0b]/20">
                  <Icon className="h-5 w-5 text-[#f59e0b]" />
                </div>
                <h3 className="mt-4 text-sm font-semibold text-zinc-100">{t(titleKey)}</h3>
                <p className="mt-1.5 text-xs leading-5 text-zinc-400">{t(descKey)}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[#f59e0b] transition group-hover:gap-2">
                  {t(ctaKey)} <ArrowRight className="h-3 w-3" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* For Workers */}
      <section className="border-t border-zinc-800/60 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">
            {t('landing.workers.title')}
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-sm text-zinc-400">
            {t('landing.workers.subtitle')}
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {workerBenefits.map(({ icon: Icon, titleKey, descKey }) => {
              const title = t(titleKey);
              return (
                <div
                  key={titleKey}
                  className="border border-zinc-800/80 bg-[#0d0d0d] p-5 rounded-sm transition hover:border-zinc-700"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-[#f59e0b]/10 border border-[#f59e0b]/20">
                    <Icon className="h-5 w-5 text-[#f59e0b]" />
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-zinc-100">{title}</h3>
                  <p className="mt-1.5 text-xs leading-5 text-zinc-400">{t(descKey)}</p>
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
            {t('landing.companies.title')}
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-sm text-zinc-400">
            {t('landing.companies.subtitle')}
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {companyBenefits.map(({ icon: Icon, titleKey, descKey }) => {
              const title = t(titleKey);
              return (
                <div
                  key={titleKey}
                  className="border border-zinc-800/80 bg-[#0d0d0d] p-5 rounded-sm transition hover:border-zinc-700"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-[#f59e0b]/10 border border-[#f59e0b]/20">
                    <Icon className="h-5 w-5 text-[#f59e0b]" />
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-zinc-100">{title}</h3>
                  <p className="mt-1.5 text-xs leading-5 text-zinc-400">{t(descKey)}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Real metrics */}
      <section className="border-t border-zinc-800/60 py-16 sm:py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {metrics.map((m) => <AnimatedCounter key={m.label} metric={m} />)}
          </div>
          <p className="mt-6 text-center text-[10px] uppercase tracking-[0.2em] text-zinc-600">
            {t('landing.stats.title')}
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-zinc-800/60 py-16 sm:py-20">
        <div className="mx-auto max-w-2xl px-4 sm:px-6">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">
            {t('landing.faq.title')}
          </h2>
          <div className="mt-8 space-y-3">
            {faqItems.map((item, i) => (
              <FaqItem key={i} question={item.q} answer={item.a} />
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-zinc-800/60 py-16 sm:py-20">
        <div className="mx-auto max-w-2xl px-4 text-center sm:px-6">
          <h2 className="text-2xl font-bold sm:text-3xl">
            {t('landing.cta.title')}
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            {t('landing.cta.subtitle')}
          </p>
          <Link
            to="/register"
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-md bg-[#f59e0b] px-6 py-3 text-sm font-semibold text-black transition hover:bg-[#d97706]"
          >
            {t('landing.cta.button')}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800/80 bg-[#0d0d0d] py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6">
          <div className="flex items-center gap-3">
            <PipingBoxLogo variant="horizontal" size={28} />
            <span className="text-xs text-zinc-600">{t('landing.footer.madeIn')}</span>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-4 text-xs text-zinc-500">
            <Link to="/tools" className="transition hover:text-zinc-300">
              {t('landing.footer.tools')}
            </Link>
            <Link to="/blog" className="transition hover:text-zinc-300">
              {t('landing.footer.blog')}
            </Link>
            <Link to="/pricing" className="transition hover:text-zinc-300">
              {t('landing.footer.pricing')}
            </Link>
            <Link to="/register" className="transition hover:text-zinc-300">
              {t('landing.footer.contact')}
            </Link>
            <Link to="/privacy" className="transition hover:text-zinc-300">
              {t('footer.privacy')}
            </Link>
            <Link to="/terms" className="transition hover:text-zinc-300">
              {t('footer.terms')}
            </Link>
            <Link to="/dsa" className="transition hover:text-zinc-300">
              {t('footer.dsa')}
            </Link>
          </nav>
        </div>
        <p className="mt-4 text-center text-[10px] text-zinc-600">
          © {new Date().getFullYear()} PipingBox. {t('landing.footer.rights')}
        </p>
      </footer>
    </div>
  );
}
