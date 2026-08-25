import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  Briefcase,
  Building2,
  Check,
  Layers,
  ShieldCheck,
  Wrench,
  Users,
  GraduationCap,
} from 'lucide-react';

/**
 * PB-WEB-010 — Academy acquisition layer.
 *
 * Public/marketing layer rendered ABOVE the functional catalog. The catalog
 * itself (search, filters, Supabase grid, progress, VCA) is untouched.
 *
 * Copy origin: curated from the legacy academy.pipingbox.com bundle
 * (snapshot in brain/09-HISTORY/LEGACY_DOCS/ACADEMY-COPY-SNAPSHOT).
 * Sections classified ARCHIVE in that snapshot are deliberately NOT rendered:
 * the fake sample courses (PB-101…PB-301) and the mock dashboard metrics.
 * The legacy "Early Access" framing was removed everywhere.
 *
 * Images: legacy Atoms CDN assets migrated in Track 1. Only the 3 that passed
 * the technical visual QA are wired. welding-inspection and construction-site
 * failed (hand artifacts / PPE and working-at-height safety violations).
 */

/** Knowledge areas. `category` links to a real catalog filter when it has courses. */
const KNOWLEDGE_AREAS = [
  { key: 'pipefitting', category: 'Piping Fundamentals' },
  { key: 'isometrics', category: 'Piping Fundamentals' },
  { key: 'welding', category: 'Welding' },
  { key: 'qaqc', category: 'Codes & Standards' },
  { key: 'standards', category: 'Codes & Standards' },
  { key: 'hydrotest', category: null },
  { key: 'safety', category: 'Safety & Compliance' },
] as const;

const ECOSYSTEM = [
  { key: 'jobs', to: '/jobs', icon: Briefcase },
  { key: 'tools', to: '/tools', icon: Wrench },
  { key: 'community', to: '/community', icon: Users },
  { key: 'companies', to: '/companies', icon: Building2 },
] as const;

const METHOD_BLOCKS = ['courses', 'paths', 'certifications'] as const;
const STEPS = ['choose', 'complete', 'track', 'apply'] as const;
const AUDIENCE_ITEMS = ['a', 'b', 'c', 'd'] as const;

/** Responsive <picture> for the migrated legacy assets. */
function LegacyImage({
  name,
  widths,
  alt,
  className,
  sizes,
}: {
  name: string;
  widths: number[];
  alt: string;
  className?: string;
  sizes: string;
}) {
  const set = (ext: string) =>
    widths.map((w) => `/assets/academy/${name}-${w}.${ext} ${w}w`).join(', ');
  const fallback = widths[widths.length - 1];
  return (
    <picture>
      <source type="image/avif" srcSet={set('avif')} sizes={sizes} />
      <source type="image/webp" srcSet={set('webp')} sizes={sizes} />
      <img
        src={`/assets/academy/${name}-${fallback}.webp`}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={className}
      />
    </picture>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] uppercase tracking-[0.25em] text-[#f59e0b]">
      {children}
    </span>
  );
}

export interface AcademyIntroProps {
  /** Number of published courses actually loaded from Supabase. */
  courseCount: number;
  /** Catalog categories that currently have at least one published course. */
  availableCategories: Set<string>;
  /** Signed-in users get a strongly collapsed version so the product comes first. */
  compact: boolean;
}

export function AcademyIntro({ courseCount, availableCategories, compact }: AcademyIntroProps) {
  const { t } = useTranslation();

  /* ---------------------------------------------------------------------
   * Signed-in: collapse A–E to a single compact strip. Product first.
   * ------------------------------------------------------------------- */
  if (compact) {
    return (
      <section className="relative overflow-hidden rounded-sm border border-zinc-800/80 bg-[#0d0d0d]">
        <div className="absolute inset-0">
          <LegacyImage
            name="hero-piping-industrial"
            widths={[640, 1280]}
            alt=""
            sizes="100vw"
            className="h-full w-full object-cover opacity-[0.18]"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0d0d0d] via-[#0d0d0d]/85 to-transparent" />
        </div>
        <div className="relative flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <p className="text-xs text-zinc-400">
            <span className="font-semibold text-zinc-100">
              {t('academy.intro.compact.title', 'Keep building your industrial knowledge')}
            </span>
          </p>
          <a
            href="#catalog"
            className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-[#f59e0b] hover:text-[#f59e0b]/80 transition"
          >
            {t('academy.intro.compact.cta', 'Go to catalog')}
            <ArrowRight className="h-3 w-3" />
          </a>
        </div>
      </section>
    );
  }

  /* ---------------------------------------------------------------------
   * Guest: full acquisition layer A–F.
   * ------------------------------------------------------------------- */
  return (
    <div className="space-y-12 sm:space-y-16">
      {/* ============ A. HERO ============ */}
      <section className="relative overflow-hidden rounded-sm border border-zinc-800/80">
        <div className="absolute inset-0">
          <LegacyImage
            name="hero-piping-industrial"
            widths={[640, 1280, 1536]}
            alt={t('academy.intro.hero.imageAlt', 'Industrial piping plant at dusk')}
            sizes="100vw"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/85 to-[#0a0a0a]/60" />
        </div>

        <div className="relative px-5 py-12 sm:px-10 sm:py-20 lg:py-24">
          <div className="max-w-2xl space-y-5">
            <SectionLabel>{t('academy.intro.hero.label', 'PipingBox Academy')}</SectionLabel>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-zinc-50 leading-[1.1]">
              {t('academy.intro.hero.title', 'Industrial training built for the')}{' '}
              <span className="text-[#f59e0b]">
                {t('academy.intro.hero.titleHighlight', 'real world')}
              </span>
            </h1>

            <p className="text-sm sm:text-base text-zinc-300 leading-relaxed max-w-xl">
              {t(
                'academy.intro.hero.subtitle',
                'Structured courses and practical learning paths designed for piping professionals, welders, QA/QC inspectors and project teams.',
              )}
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <a
                href="#catalog"
                className="flex items-center gap-2 bg-[#f59e0b] px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-[#0a0a0a] rounded-sm hover:bg-[#f59e0b]/90 transition"
              >
                {t('academy.intro.hero.cta', 'Browse the catalog')}
                <ArrowRight className="h-3.5 w-3.5" />
              </a>
              <Link
                to="/jobs"
                className="flex items-center gap-2 border border-zinc-700 px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-zinc-200 rounded-sm hover:border-[#f59e0b]/40 hover:text-[#f59e0b] transition"
              >
                {t('academy.intro.hero.ctaSecondary', 'Explore jobs')}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ============ B. KNOWLEDGE AREAS ============ */}
      <section className="space-y-5">
        <div className="space-y-2">
          <SectionLabel>{t('academy.intro.areas.label', 'Knowledge areas')}</SectionLabel>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-100">
            {t('academy.intro.areas.title', 'Focused on')}{' '}
            <span className="text-[#f59e0b]">
              {t('academy.intro.areas.titleHighlight', 'real industrial skills')}
            </span>
          </h2>
          <p className="text-xs sm:text-sm text-zinc-500 max-w-2xl">
            {t(
              'academy.intro.areas.subtitle',
              'The technical domains PipingBox Academy covers. Every area maps to what actually happens on site.',
            )}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {KNOWLEDGE_AREAS.map((area) => {
            const hasCourses = area.category != null && availableCategories.has(area.category);
            const title = t(`academy.intro.areas.items.${area.key}.title`);
            const description = t(`academy.intro.areas.items.${area.key}.description`);

            const body = (
              <>
                <h3 className="text-sm font-semibold text-zinc-100 group-hover:text-[#f59e0b] transition-colors">
                  {title}
                </h3>
                <p className="text-[11px] text-zinc-500 leading-relaxed">{description}</p>
              </>
            );

            /* Area with real published courses -> links to the catalog filter.
               Area without courses -> shown as a topic, with no false CTA. */
            return hasCourses ? (
              <Link
                key={area.key}
                to={`/academy?category=${encodeURIComponent(area.category as string)}#catalog`}
                className="group space-y-1.5 rounded-sm border border-zinc-800/80 bg-[#0d0d0d] p-4 hover:border-[#f59e0b]/40 transition"
              >
                {body}
                <span className="flex items-center gap-1 pt-1 text-[10px] uppercase tracking-[0.2em] text-[#f59e0b]">
                  {t('academy.intro.areas.view', 'View courses')}
                  <ArrowRight className="h-3 w-3" />
                </span>
              </Link>
            ) : (
              <div
                key={area.key}
                className="space-y-1.5 rounded-sm border border-zinc-800/50 bg-[#0d0d0d]/60 p-4"
              >
                {body}
              </div>
            );
          })}
        </div>
      </section>

      {/* ============ C. TRAINING -> WORK ============ */}
      <section className="overflow-hidden rounded-sm border border-zinc-800/80 bg-[#0d0d0d]">
        <div className="grid lg:grid-cols-2">
          <div className="relative min-h-[220px] lg:min-h-[340px]">
            <LegacyImage
              name="hero-banner-industrial-workers"
              widths={[640, 1280]}
              alt={t('academy.intro.work.imageAlt', 'Industrial crew working on large-diameter pipe')}
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0d0d0d] via-transparent to-transparent lg:bg-gradient-to-r lg:from-transparent lg:to-[#0d0d0d]" />
          </div>

          <div className="space-y-5 p-5 sm:p-8 lg:p-10">
            <div className="space-y-2">
              <SectionLabel>{t('academy.intro.work.label', 'One platform')}</SectionLabel>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-100">
                {t('academy.intro.work.title', 'Learn, work and grow in')}{' '}
                <span className="text-[#f59e0b]">
                  {t('academy.intro.work.titleHighlight', 'one platform')}
                </span>
              </h2>
              <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                {t(
                  'academy.intro.work.subtitle',
                  "Academy doesn't stand alone. What you learn connects directly to the rest of PipingBox.",
                )}
              </p>
            </div>

            <div className="space-y-2.5">
              {ECOSYSTEM.map(({ key, to, icon: Icon }) => (
                <Link
                  key={key}
                  to={to}
                  className="group flex items-start gap-3 rounded-sm border border-zinc-800/60 bg-[#0a0a0a] p-3 hover:border-[#f59e0b]/40 transition"
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#f59e0b]" />
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-zinc-100 group-hover:text-[#f59e0b] transition-colors">
                      {t(`academy.intro.work.items.${key}.title`)}
                    </p>
                    <p className="text-[11px] text-zinc-500 leading-relaxed">
                      {t(`academy.intro.work.items.${key}.description`)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============ D. METHOD ============ */}
      <section className="relative overflow-hidden rounded-sm border border-zinc-800/80">
        <div className="absolute inset-0">
          <LegacyImage
            name="blueprint-isometric"
            widths={[640, 1280]}
            alt=""
            sizes="100vw"
            className="h-full w-full object-cover opacity-[0.12]"
          />
          <div className="absolute inset-0 bg-[#0a0a0a]/85" />
        </div>

        <div className="relative space-y-8 p-5 sm:p-8 lg:p-10">
          <div className="space-y-2">
            <SectionLabel>{t('academy.intro.method.label', 'Method')}</SectionLabel>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-100">
              {t('academy.intro.method.title', 'Structured learning,')}{' '}
              <span className="text-[#f59e0b]">
                {t('academy.intro.method.titleHighlight', 'not random content')}
              </span>
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 max-w-2xl">
              {t(
                'academy.intro.method.subtitle',
                'Three complementary layers designed to take you from fundamentals to real certifications.',
              )}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {METHOD_BLOCKS.map((key, i) => {
              const isCert = key === 'certifications';
              const inner = (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-[#f59e0b]/40">
                      0{i + 1}
                    </span>
                    {isCert && <ShieldCheck className="h-3.5 w-3.5 text-[#f59e0b]" />}
                    {key === 'courses' && <GraduationCap className="h-3.5 w-3.5 text-zinc-600" />}
                    {key === 'paths' && <Layers className="h-3.5 w-3.5 text-zinc-600" />}
                  </div>
                  <h3
                    className={`text-sm font-semibold ${
                      isCert ? 'text-zinc-100 group-hover:text-[#f59e0b] transition-colors' : 'text-zinc-100'
                    }`}
                  >
                    {t(`academy.intro.method.blocks.${key}.title`)}
                  </h3>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    {t(`academy.intro.method.blocks.${key}.description`)}
                  </p>
                </>
              );

              /* Certifications is a live product (VCA booking), not "planned". */
              return isCert ? (
                <Link
                  key={key}
                  to="/academy/vca-booking"
                  className="group space-y-1.5 rounded-sm border border-[#f59e0b]/30 bg-[#f59e0b]/[0.04] p-4 hover:border-[#f59e0b]/60 transition"
                >
                  {inner}
                  <span className="flex items-center gap-1 pt-1 text-[10px] uppercase tracking-[0.2em] text-[#f59e0b]">
                    {t('academy.intro.method.blocks.certifications.cta', 'Book your exam')}
                    <ArrowRight className="h-3 w-3" />
                  </span>
                </Link>
              ) : (
                <div
                  key={key}
                  className="space-y-1.5 rounded-sm border border-zinc-800/80 bg-[#0d0d0d] p-4"
                >
                  {inner}
                </div>
              );
            })}
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((key, i) => (
              <div key={key} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-zinc-800 bg-[#0d0d0d] text-[9px] font-bold text-[#f59e0b]">
                  {i + 1}
                </span>
                <div className="space-y-0.5">
                  <p className="text-[11px] font-semibold text-zinc-200">
                    {t(`academy.intro.method.steps.${key}.title`)}
                  </p>
                  <p className="text-[10px] text-zinc-500 leading-relaxed">
                    {t(`academy.intro.method.steps.${key}.description`)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ E. PROFESSIONALS / COMPANIES ============ */}
      <section className="grid gap-4 lg:grid-cols-2">
        {(['professionals', 'companies'] as const).map((who) => {
          const isCompanies = who === 'companies';
          return (
            <div
              key={who}
              className="flex flex-col space-y-4 rounded-sm border border-zinc-800/80 bg-[#0d0d0d] p-5 sm:p-6"
            >
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {isCompanies ? (
                    <Building2 className="h-4 w-4 text-[#f59e0b]" />
                  ) : (
                    <GraduationCap className="h-4 w-4 text-[#f59e0b]" />
                  )}
                  <h3 className="text-base font-bold tracking-tight text-zinc-100">
                    {t(`academy.intro.audience.${who}.title`)}
                  </h3>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  {t(`academy.intro.audience.${who}.description`)}
                </p>
              </div>

              <ul className="flex-1 space-y-1.5">
                {AUDIENCE_ITEMS.map((k) => (
                  <li key={k} className="flex items-start gap-2 text-[11px] text-zinc-400">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-[#f59e0b]" />
                    {t(`academy.intro.audience.${who}.items.${k}`)}
                  </li>
                ))}
              </ul>

              <Link
                to={isCompanies ? '/companies' : '/register'}
                className={`flex items-center justify-center gap-2 rounded-sm px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider transition ${
                  isCompanies
                    ? 'border border-zinc-700 text-zinc-200 hover:border-[#f59e0b]/40 hover:text-[#f59e0b]'
                    : 'bg-[#f59e0b] text-[#0a0a0a] hover:bg-[#f59e0b]/90'
                }`}
              >
                {t(`academy.intro.audience.${who}.cta`)}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          );
        })}
      </section>

      {/* ============ F. TRANSITION TO CATALOG ============ */}
      <section className="space-y-2 border-t border-zinc-800/60 pt-8">
        <SectionLabel>{t('academy.intro.catalog.label', 'The catalog')}</SectionLabel>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-100">
            {t('academy.intro.catalog.title', 'Start with what is available today')}
          </h2>
          {courseCount > 0 && (
            <span className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">
              {t('academy.intro.catalog.count', '{{count}} course', { count: courseCount })}
            </span>
          )}
        </div>
        <p className="max-w-2xl text-xs sm:text-sm text-zinc-500">
          {t(
            'academy.intro.catalog.subtitle',
            'The catalog is being built with professionals from the field. Everything below is live and available now.',
          )}
        </p>
      </section>
    </div>
  );
}

export default AcademyIntro;
