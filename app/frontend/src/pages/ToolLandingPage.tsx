import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, BookOpen, CheckCircle2, Info, ListChecks } from 'lucide-react';
import { useSeo } from '@/hooks/useSeo';
import { getToolLandingConfig } from '@/lib/tool-landings';
import NotFound from './NotFound';
import FlangesTool from '@/components/tools/FlangesTool';
import BoltsNutsTool from '@/components/tools/BoltsNutsTool';
import PipeDimensionsTool from '@/components/tools/PipeDimensionsTool';
import BranchLayoutTool from '@/components/tools/BranchLayoutTool';
import NewElbowCutTool from '@/tools/prefabrication/elbow-cut/ElbowCutTool';

/**
 * PB-SEO-103: public, prerendered tool landing page at /tools/:slug.
 *
 * Template per PO requirements: H1 + problem/solution intro, the real
 * interactive calculator, methodology, assumptions, a worked example, related
 * tools and a signup CTA. No thin content: every section carries real copy for
 * the tool's standard (ASME B16.5, B36.10M, ...). Copy is i18n'd; the
 * prerendered HTML (prerender/public.js) renders this same component with the
 * EN locale for crawlers, so the server-delivered HTML matches what users see.
 *
 * Unknown slugs render the NotFound UI (the Worker already answers them with
 * HTTP 404 for direct requests; this covers client-side navigation).
 */
export default function ToolLandingPage() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const config = slug ? getToolLandingConfig(slug) : undefined;

  // Hooks must run unconditionally (Rules of Hooks) even for unknown slugs.
  useSeo(
    config
      ? {
          title: t(`tools.landing.${config.i18nKey}.title`),
          description: t(`tools.landing.${config.i18nKey}.description`),
        }
      : {},
  );

  if (!config) {
    return <NotFound />;
  }

  const copy = (key: string) => t(`tools.landing.${config.i18nKey}.${key}`);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      {/* ═══ H1 + problem/solution ═══ */}
      <header className="mb-10 max-w-3xl">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-[#FF8C00]">
          {t('tools.eyebrow')}
        </p>
        <h1 className="mb-4 text-3xl font-bold leading-tight text-[#F5F7FA] sm:text-4xl">
          {copy('title')}
        </h1>
        <p className="text-base leading-7 text-[#A3A9B3]">{copy('intro')}</p>
      </header>

      {/* ═══ The real interactive calculator ═══ */}
      <section
        id="calculator"
        className="mb-10 rounded-xl border border-[#232A36] bg-[#151A22] p-4 sm:p-6"
      >
        {config.toolKey === 'flanges' ? (
          <FlangesTool />
        ) : config.toolKey === 'bolts-nuts' ? (
          <BoltsNutsTool />
        ) : config.toolKey === 'pipe-dimensions' ? (
          <PipeDimensionsTool />
        ) : config.toolKey === 'elbow-cut' ? (
          <NewElbowCutTool />
        ) : (
          <BranchLayoutTool />
        )}
      </section>

      {/* ═══ Methodology ═══ */}
      <section className="mb-10 grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-[#F5F7FA]">
            <BookOpen className="h-5 w-5 text-[#FF8C00]" aria-hidden="true" />
            {t('tools.landing.shared.methodology')}
          </h2>
          <ul className="space-y-3">
            {[copy('m1'), copy('m2'), copy('m3')].map((item, i) => (
              <li key={i} className="flex gap-3 text-sm leading-6 text-[#A3A9B3]">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#FF8C00]" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-[#F5F7FA]">
            <Info className="h-5 w-5 text-[#FF8C00]" aria-hidden="true" />
            {t('tools.landing.shared.assumptions')}
          </h2>
          <ul className="space-y-3">
            {[copy('a1'), copy('a2'), copy('a3')].map((item, i) => (
              <li key={i} className="flex gap-3 text-sm leading-6 text-[#A3A9B3]">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#FF8C00]" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ═══ Worked example ═══ */}
      <section className="mb-10 rounded-xl border border-[#232A36] bg-[#151A22] p-6">
        <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold text-[#F5F7FA]">
          <ListChecks className="h-5 w-5 text-[#FF8C00]" aria-hidden="true" />
          {t('tools.landing.shared.example')}
        </h2>
        <p className="text-sm leading-7 text-[#A3A9B3]">{copy('example')}</p>
      </section>

      {/* ═══ Related tools ═══ */}
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-semibold text-[#F5F7FA]">
          {t('tools.landing.shared.relatedTools')}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {config.related.map((relSlug) => {
            const rel = getToolLandingConfig(relSlug);
            if (!rel) return null;
            return (
              <Link
                key={rel.slug}
                to={`/tools/${rel.slug}`}
                className="group flex items-center justify-between rounded-lg border border-[#232A36] bg-[#151A22] px-4 py-3 text-sm font-medium text-[#F5F7FA] transition-colors hover:border-[#FF8C00]"
              >
                <span>{t(`tools.${rel.nameKey}`)}</span>
                <ArrowRight
                  className="h-4 w-4 text-[#A3A9B3] transition-colors group-hover:text-[#FF8C00]"
                  aria-hidden="true"
                />
              </Link>
            );
          })}
          <Link
            to={`/tools?t=${config.toolKey}`}
            className="group flex items-center justify-between rounded-lg border border-dashed border-[#232A36] px-4 py-3 text-sm font-medium text-[#A3A9B3] transition-colors hover:border-[#FF8C00] hover:text-[#F5F7FA]"
          >
            <span>{t('tools.landing.shared.openInCatalog')}</span>
            <ArrowRight className="h-4 w-4 transition-colors group-hover:text-[#FF8C00]" aria-hidden="true" />
          </Link>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="rounded-xl border border-[#FF8C00]/30 bg-gradient-to-br from-[#FF8C00]/10 to-transparent p-8 text-center">
        <h2 className="mb-2 text-2xl font-bold text-[#F5F7FA]">
          {t('tools.landing.shared.ctaTitle')}
        </h2>
        <p className="mx-auto mb-6 max-w-xl text-sm leading-6 text-[#A3A9B3]">
          {t('tools.landing.shared.ctaBody')}
        </p>
        <Link
          to="/register"
          className="inline-flex items-center gap-2 rounded-lg bg-[#FF8C00] px-6 py-3 font-semibold text-black transition-colors hover:bg-[#ffa133]"
        >
          {t('tools.landing.shared.ctaButton')}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </section>
    </main>
  );
}
