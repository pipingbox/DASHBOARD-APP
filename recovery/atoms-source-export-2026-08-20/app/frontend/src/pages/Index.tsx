import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
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
  ChevronDown,
  Globe,
} from 'lucide-react';

/* ─── Animated Counter ─── */
function AnimatedCounter({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          if (target === 0) {
            setCount(0);
            return;
          }
          const duration = 2000;
          const steps = 60;
          const increment = target / steps;
          let current = 0;
          const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
              setCount(target);
              clearInterval(timer);
            } else {
              setCount(Math.floor(current));
            }
          }, duration / steps);
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target]);

  return (
    <div ref={ref} className="text-4xl md:text-5xl font-bold text-[#f59e0b]">
      {count.toLocaleString()}
      {suffix}
    </div>
  );
}

/* ─── FAQ Accordion Item ─── */
function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 md:p-5 text-left hover:bg-zinc-900/50 transition-colors min-h-[44px]"
      >
        <span className="text-sm md:text-base font-medium text-zinc-100 pr-4">{question}</span>
        <ChevronDown
          className={`h-5 w-5 text-[#f59e0b] shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ${open ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <p className="px-4 md:px-5 pb-4 md:pb-5 text-sm text-zinc-400 leading-relaxed">{answer}</p>
      </div>
    </div>
  );
}

/* ─── Main Landing Page ─── */
export default function Index() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [workerCount, setWorkerCount] = useState(0);
  const [companyCount, setCompanyCount] = useState(0);

  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, loading, navigate]);

  // Fetch real counts from Supabase
  useEffect(() => {
    async function fetchCounts() {
      try {
        const [workersRes, companiesRes] = await Promise.all([
          supabase
            .from(TABLES.profiles)
            .select('*', { count: 'exact', head: true })
            .or('role.eq.worker,role.is.null'),
          supabase
            .from(TABLES.profiles)
            .select('*', { count: 'exact', head: true })
            .eq('role', 'company'),
        ]);
        setWorkerCount(workersRes.count ?? 0);
        setCompanyCount(companiesRes.count ?? 0);
      } catch {
        // Graceful degradation: show 0 if tables don't exist
        setWorkerCount(0);
        setCompanyCount(0);
      }
    }
    fetchCounts();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#f59e0b] border-t-transparent" />
      </div>
    );
  }

  if (user) return null;

  const workerBenefits = [
    { icon: UserCheck, key: 'profile' },
    { icon: Calculator, key: 'tools' },
    { icon: GraduationCap, key: 'training' },
    { icon: Briefcase, key: 'jobs' },
  ];

  const companyBenefits = [
    { icon: ShieldCheck, key: 'verified' },
    { icon: Clock, key: 'time' },
    { icon: FileCheck, key: 'compliance' },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 overflow-x-hidden">
      {/* ─── Navbar ─── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0a]/80 backdrop-blur-md border-b border-zinc-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-1">
            <span className="text-lg font-bold text-zinc-100">Piping</span>
            <span className="text-lg font-bold text-[#f59e0b]">Box</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="text-sm text-zinc-300 hover:text-white transition-colors px-3 py-2 min-h-[44px] flex items-center"
            >
              {t('landing.nav.signIn', 'Sign in')}
            </Link>
            <Link
              to="/register"
              className="text-sm font-medium bg-[#f59e0b] hover:bg-[#d97706] text-black px-4 py-2 rounded-lg transition-colors min-h-[44px] flex items-center"
            >
              {t('landing.nav.signUp', 'Sign up free')}
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── Hero Section ─── */}
      <section className="pt-32 pb-20 md:pt-40 md:pb-28 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-[#f59e0b]/10 border border-[#f59e0b]/30 rounded-full px-4 py-1.5 mb-6">
            <Globe className="h-4 w-4 text-[#f59e0b]" />
            <span className="text-xs font-medium text-[#f59e0b]">
              {t('landing.hero.badge', 'The European industrial sector platform')}
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-6">
            {t('landing.hero.headline', 'PipingBox — the ecosystem for industrial professionals and companies')}
          </h1>
          <p className="text-base md:text-lg text-zinc-400 max-w-2xl mx-auto mb-8 leading-relaxed">
            {t('landing.hero.subtitle', 'Free engineering tools, certified training (VCA/SCC/PRL), verified jobs, and technical community. All in one place.')}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/register"
              className="w-full sm:w-auto inline-flex items-center justify-center bg-[#f59e0b] hover:bg-[#d97706] text-black font-semibold px-8 py-3.5 rounded-lg transition-colors text-base min-h-[44px]"
            >
              {t('landing.hero.cta', 'Create free account')}
            </Link>
            <Link
              to="/tools"
              className="w-full sm:w-auto inline-flex items-center justify-center border border-zinc-700 hover:border-zinc-500 text-zinc-200 font-medium px-8 py-3.5 rounded-lg transition-colors text-base min-h-[44px]"
            >
              {t('landing.hero.ctaSecondary', 'Explore tools')}
            </Link>
          </div>
        </div>
      </section>

      {/* ─── For Workers Section ─── */}
      <section className="py-16 md:py-24 px-4 sm:px-6 lg:px-8 border-t border-zinc-800/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold mb-3">
              {t('landing.workers.title', 'For Workers')}
            </h2>
            <p className="text-zinc-400 max-w-xl mx-auto">
              {t('landing.workers.subtitle', 'Everything you need to boost your career in the industrial sector')}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {workerBenefits.map(({ icon: Icon, key }) => (
              <div
                key={key}
                className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-6 hover:border-[#f59e0b]/40 transition-colors group"
              >
                <div className="h-12 w-12 rounded-lg bg-[#f59e0b]/10 flex items-center justify-center mb-4 group-hover:bg-[#f59e0b]/20 transition-colors">
                  <Icon className="h-6 w-6 text-[#f59e0b]" />
                </div>
                <h3 className="font-semibold text-zinc-100 mb-2">
                  {t(`landing.workers.benefits.${key}.title`)}
                </h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  {t(`landing.workers.benefits.${key}.desc`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── For Companies Section ─── */}
      <section className="py-16 md:py-24 px-4 sm:px-6 lg:px-8 bg-zinc-900/30 border-t border-zinc-800/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold mb-3">
              {t('landing.companies.title', 'For Companies')}
            </h2>
            <p className="text-zinc-400 max-w-xl mx-auto">
              {t('landing.companies.subtitle', 'Find the talent you need quickly and securely')}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {companyBenefits.map(({ icon: Icon, key }) => (
              <div
                key={key}
                className="bg-[#0a0a0a] border border-zinc-800/80 rounded-xl p-6 hover:border-[#f59e0b]/40 transition-colors group"
              >
                <div className="h-12 w-12 rounded-lg bg-[#f59e0b]/10 flex items-center justify-center mb-4 group-hover:bg-[#f59e0b]/20 transition-colors">
                  <Icon className="h-6 w-6 text-[#f59e0b]" />
                </div>
                <h3 className="font-semibold text-zinc-100 mb-2">
                  {t(`landing.companies.benefits.${key}.title`)}
                </h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  {t(`landing.companies.benefits.${key}.desc`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Real Metrics Section ─── */}
      <section className="py-16 md:py-24 px-4 sm:px-6 lg:px-8 border-t border-zinc-800/50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold">
              {t('landing.stats.title', 'Real metrics')}
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
            <div>
              <AnimatedCounter target={workerCount} />
              <p className="mt-2 text-sm text-zinc-400">{t('landing.stats.workers', 'Registered professionals')}</p>
            </div>
            <div>
              <AnimatedCounter target={companyCount} />
              <p className="mt-2 text-sm text-zinc-400">{t('landing.stats.companies', 'Companies')}</p>
            </div>
            <div>
              <AnimatedCounter target={6} />
              <p className="mt-2 text-sm text-zinc-400">{t('landing.stats.tools', 'Free tools')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FAQ Section ─── */}
      <section className="py-16 md:py-24 px-4 sm:px-6 lg:px-8 bg-zinc-900/30 border-t border-zinc-800/50">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold mb-3">
              {t('landing.faq.title', 'Frequently asked questions')}
            </h2>
          </div>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <FAQItem
                key={i}
                question={t(`landing.faq.q${i}`)}
                answer={t(`landing.faq.a${i}`)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA Banner ─── */}
      <section className="py-16 md:py-20 px-4 sm:px-6 lg:px-8 border-t border-zinc-800/50">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            {t('landing.cta.title', 'Ready to get started?')}
          </h2>
          <p className="text-zinc-400 mb-8 max-w-lg mx-auto">
            {t('landing.cta.subtitle', 'Join professionals and companies that already trust PipingBox.')}
          </p>
          <Link
            to="/register"
            className="inline-flex items-center justify-center bg-[#f59e0b] hover:bg-[#d97706] text-black font-semibold px-8 py-3.5 rounded-lg transition-colors text-base min-h-[44px]"
          >
            {t('landing.cta.button', 'Create free account')}
          </Link>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-zinc-800/80 py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-1 mb-3">
                <span className="font-bold text-zinc-100">Piping</span>
                <span className="font-bold text-[#f59e0b]">Box</span>
              </div>
              <p className="text-sm text-zinc-500 leading-relaxed">
                {t('landing.footer.description', 'The leading platform for the industrial piping and construction sector.')}
              </p>
            </div>
            {/* Links */}
            <div>
              <h4 className="text-sm font-semibold text-zinc-300 mb-3">
                {t('landing.footer.links', 'Links')}
              </h4>
              <ul className="space-y-2">
                <li>
                  <Link to="/tools" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
                    {t('landing.footer.toolsLink', 'Tools')}
                  </Link>
                </li>
                <li>
                  <a href="/blog/" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
                    {t('landing.footer.blogLink', 'Blog')}
                  </a>
                </li>
                <li>
                  <Link to="/register" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
                    {t('landing.footer.registerLink', 'Register')}
                  </Link>
                </li>
                <li>
                  <Link to="/login" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
                    {t('landing.footer.loginLink', 'Sign in')}
                  </Link>
                </li>
              </ul>
            </div>
            {/* Legal */}
            <div>
              <h4 className="text-sm font-semibold text-zinc-300 mb-3">
                {t('landing.footer.legal', 'Legal')}
              </h4>
              <ul className="space-y-2">
                <li>
                  <Link to="/privacy" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
                    {t('footer.privacy', 'Privacy Policy')}
                  </Link>
                </li>
                <li>
                  <Link to="/terms" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
                    {t('footer.terms', 'Terms of Service')}
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-zinc-800/80 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-zinc-600">
              © {new Date().getFullYear()} PipingBox. {t('landing.footer.rights', 'All rights reserved.')}
            </p>
            <p className="text-xs text-zinc-600">
              {t('landing.footer.madeIn', 'Made in Europe')} 🇪🇺
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}