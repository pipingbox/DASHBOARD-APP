import React from 'react';
import { renderToString } from 'react-dom/server';
import { Route, Routes } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { prerender as prerenderBlog } from './blog.js';
import { getToolLandingConfig } from '../src/lib/tool-landings';
import { APP_ROUTES } from './app-routes.js';
import { AuthProvider } from '../src/hooks/useAuth';
import { AdminPreviewProvider } from '../src/contexts/AdminPreviewContext';
import { TooltipProvider } from '../src/components/ui/tooltip';
import { AppShell } from '../src/components/layout/AppShell';
import { resolvePageKey, PAGE_DESCRIPTION_KEYS } from '../src/hooks/useDocumentTitle';
import ToolLandingPage from '../src/pages/ToolLandingPage';
import Tools from '../src/pages/Tools';
import Academy from '../src/pages/Academy';
import Jobs from '../src/pages/Jobs';
import PricingPage from '../src/pages/PricingPage';
import Companies from '../src/pages/Companies';
import RequestWorkers from '../src/pages/RequestWorkers';
import Contact from '../src/pages/Contact';
import Privacy from '../src/pages/Privacy';
import Terms from '../src/pages/Terms';
import DsaContact from '../src/pages/DsaContact';
import VCAExamBookingPage from '../src/pages/VCAExamBookingPage';
import SCCCoursePage from '../src/pages/SCCCoursePage';
import PRLCoursePage from '../src/pages/PRLCoursePage';
import en from '../src/i18n/locales/en.json';

/**
 * PB-SEO-103: route dispatcher for the build-time prerender.
 *
 * vite-prerender-plugin queues '/' plus every route in additionalPrerenderRoutes
 * and calls this function once per URL. It delegates:
 *
 *   - /blog/*  -> the original blog prerender (unchanged behaviour);
 *   - /tools/<slug> -> the ToolLandingPage, rendered with the EN locale so the
 *     server-delivered HTML carries the full acquisition copy (H1, intro,
 *     calculator, methodology, assumptions, example, related tools, CTA);
 *   - every route in APP_ROUTES -> PB-SEO-CRAWLER-CANONICAL-001, see below;
 *   - anything else (including '/') -> undefined, which makes the plugin skip
 *     the URL with a warning and leave the existing asset untouched.
 *
 * PB-SEO-CRAWLER-CANONICAL-001 — why the app-route branch exists.
 *
 * The sitemap advertised 14 app routes that were never prerendered, so the
 * Worker served them the untouched index.html shell. That shell carries a
 * fallback `<link rel="canonical" href="https://pipingbox.com/">` which only
 * useSeo() corrects, and useSeo() is a React effect: it never runs for a
 * crawler that does not execute JavaScript. Verified in production on
 * 2026-10-23: 14 of the 24 sitemap URLs served `canonical = /` plus the
 * homepage <title>, i.e. they declared themselves duplicates of the homepage.
 *
 * This branch renders those routes at build time and emits a self-referential
 * canonical, reusing the mechanism already proven for the tool landings. Note
 * that useSeo() is deliberately NOT modified: it keeps governing the head
 * during client-side navigation, and the prerendered head governs the first,
 * JS-free response. The two now agree because the crawler-facing title and
 * description are resolved through the SAME `pageMeta` map that
 * useDocumentTitle() uses at runtime (resolvePageKey), instead of a duplicate
 * table that could drift.
 *
 * Tool landing routes are queued as '/tools/<slug>.html' so the plugin writes
 * dist/tools/<slug>.html (a standalone file). Cloudflare static assets serves
 * that file at the extension-less canonical URL /tools/<slug> with HTTP 200 —
 * no trailing-slash redirect, matching the canonical URL policy in
 * prerender/sitemap.js.
 *
 * The tool components render in Node via renderToString: React effects (and
 * therefore all Supabase/browser work) never run server-side, so the output is
 * the initial UI state — for the table-based tools that means the real
 * reference data (e.g. the ASME B36.10M dimension table) is crawlable HTML.
 */

const BASE_URL = 'https://pipingbox.com';

let i18nInstance = null;

function getPrerenderI18n() {
  if (!i18nInstance) {
    i18nInstance = createInstance();
    // EN is the crawler-facing locale. Per-language URLs are governed by
    // PB-SEO-I18N-URLS-001 and are deliberately not emitted here.
    i18nInstance.init({
      lng: 'en',
      fallbackLng: 'en',
      resources: { en: { translation: en } },
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
    });
  }
  return i18nInstance;
}

// AuthProvider is imported lazily (together with the page) so a failure in the
// app's auth bootstrap can never take down the blog prerender path.
// The prerender bundle resolves React to its development build. If any
// component in the rendered tree triggers a dev-mode warning (e.g. the legacy
// lifecycle warning emitted from a dependency), React's warning logger reads
// `window`, which does not exist in Node, and crashes the prerender. A minimal
// window stub scoped to this render keeps the logger functional and changes no
// component behaviour (React effects never run during prerender).
function withWindowStub(fn) {
  const hadWindow = typeof globalThis.window !== 'undefined';
  const previousWindow = globalThis.window;
  if (!hadWindow) {
    globalThis.window = globalThis;
  }
  try {
    return fn();
  } finally {
    if (!hadWindow) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
  }
}

async function renderToolLanding(pathname) {
  let html;
  try {
    html = withWindowStub(() =>
      renderToString(
        React.createElement(
          I18nextProvider,
          { i18n: getPrerenderI18n() },
          React.createElement(
            AuthProvider,
            null,
            React.createElement(
              StaticRouter,
              { location: pathname },
              React.createElement(
                Routes,
                null,
                React.createElement(
                  Route,
                  { path: '/tools/:slug', element: React.createElement(ToolLandingPage) },
                ),
              ),
            ),
          ),
        ),
      ),
    );
  } catch (e) {
    console.error('[PB-SEO-103 DEBUG] renderToolLanding failed:', e && e.stack ? e.stack : e);
    throw e;
  }

  return html;
}

function getToolLandingHead(pathname, slug) {
  const config = getToolLandingConfig(slug);
  if (!config) return undefined;

  const i18n = getPrerenderI18n();
  const title = i18n.t(`tools.landing.${config.i18nKey}.title`);
  const description = i18n.t(`tools.landing.${config.i18nKey}.description`);
  const canonical = `${BASE_URL}/tools/${config.slug}`;

  const elements = [
    { type: 'meta', props: { name: 'prerender-static-page', content: 'tools' } },
    { type: 'meta', props: { name: 'description', content: description } },
    { type: 'link', props: { rel: 'canonical', href: canonical } },
    { type: 'meta', props: { property: 'og:title', content: title } },
    { type: 'meta', props: { property: 'og:description', content: description } },
    { type: 'meta', props: { property: 'og:type', content: 'website' } },
    { type: 'meta', props: { property: 'og:url', content: canonical } },
    { type: 'meta', props: { property: 'og:image', content: `${BASE_URL}/assets/logos/logo-horizontal.png` } },
    { type: 'meta', props: { property: 'og:site_name', content: 'PipingBox' } },
    { type: 'meta', props: { name: 'twitter:card', content: 'summary' } },
    { type: 'meta', props: { name: 'twitter:title', content: title } },
    { type: 'meta', props: { name: 'twitter:description', content: description } },
  ];

  return {
    title,
    lang: 'en',
    elements: new Set(elements),
  };
}

// PB-SEO-CRAWLER-CANONICAL-001: route -> page component, mirroring App.tsx.
// Routes wrapped in withPublicShell() there are wrapped in AppShell here so the
// server-delivered markup matches what the browser renders on first paint.
const APP_ROUTE_COMPONENTS = {
  '/tools': { component: Tools, shell: true },
  '/academy': { component: Academy, shell: true },
  '/jobs': { component: Jobs, shell: true },
  '/pricing': { component: PricingPage, shell: false },
  '/companies': { component: Companies, shell: true },
  '/companies/request-workers': { component: RequestWorkers, shell: true },
  '/contact': { component: Contact, shell: false },
  '/privacy': { component: Privacy, shell: false },
  '/terms': { component: Terms, shell: false },
  '/dsa': { component: DsaContact, shell: false },
  '/certifications': { component: VCAExamBookingPage, shell: false },
  '/certifications/vca': { component: VCAExamBookingPage, shell: false },
  '/certifications/scc': { component: SCCCoursePage, shell: false },
  '/certifications/prl': { component: PRLCoursePage, shell: false },
};

let queryClientInstance = null;

function getPrerenderQueryClient() {
  if (!queryClientInstance) {
    // retry:false keeps a failed query from scheduling timers during SSR.
    queryClientInstance = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  }
  return queryClientInstance;
}

/**
 * Render one public app route to static HTML.
 *
 * React effects never run under renderToString, so no Supabase/browser work
 * happens here and the output is each page's initial UI state: the static
 * marketing copy, headings and reference tables become crawlable HTML while
 * data-dependent regions render their empty/loading state.
 *
 * Returns null (never throws) when a page cannot render in Node. The caller
 * then ships the head-only variant: a correct canonical is the objective of
 * this ticket, and a body that fails to prerender must not break the build or
 * regress the already-working blog and tool-landing routes.
 */
function renderAppRoute(pathname) {
  const entry = APP_ROUTE_COMPONENTS[pathname];
  if (!entry) return null;

  const page = React.createElement(entry.component);
  const body = entry.shell ? React.createElement(AppShell, null, page) : page;

  try {
    return withWindowStub(() =>
      renderToString(
        React.createElement(
          I18nextProvider,
          { i18n: getPrerenderI18n() },
          React.createElement(
            QueryClientProvider,
            { client: getPrerenderQueryClient() },
            React.createElement(
              AuthProvider,
              null,
              React.createElement(
                AdminPreviewProvider,
                null,
                React.createElement(
                  TooltipProvider,
                  null,
                  React.createElement(
                    StaticRouter,
                    { location: pathname },
                    React.createElement(
                      Routes,
                      null,
                      React.createElement(Route, { path: pathname, element: body }),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  } catch (e) {
    // Loud on purpose: a head-only page is acceptable, a silent one is not.
    console.warn(
      `[PB-SEO-CRAWLER-CANONICAL-001] body prerender failed for ${pathname}, ` +
        'emitting head-only (canonical still correct):',
      e && e.message ? e.message : e,
    );
    return null;
  }
}

/**
 * Crawler-facing head for a public app route.
 *
 * Title and description come from the `pageMeta` i18n namespace through
 * resolvePageKey() — the same resolution useDocumentTitle() performs at
 * runtime — so the prerendered head and the client-side head cannot disagree.
 *
 * Routes with no `pageMeta` entry (the legal, contact and certification pages)
 * fall back to `pageMeta.home`, which is exactly what they serve today. This
 * ticket fixes the canonical; it deliberately authors no new copy. Those routes
 * therefore still share the homepage title/description — a known residual
 * finding, reported for a follow-up ticket rather than silently filled in with
 * invented text.
 */
function getAppRouteHead(pathname) {
  const i18n = getPrerenderI18n();
  const pageKey = resolvePageKey(pathname);
  const hasOwnDescription = pageKey !== null && PAGE_DESCRIPTION_KEYS.has(pageKey);

  const title = pageKey
    ? i18n.t(`pageMeta.${pageKey}.title`, { defaultValue: i18n.t('pageMeta.home.title') })
    : i18n.t('pageMeta.home.title');
  const description = hasOwnDescription
    ? i18n.t(`pageMeta.${pageKey}.description`, { defaultValue: i18n.t('pageMeta.home.description') })
    : i18n.t('pageMeta.home.description');

  const canonical = `${BASE_URL}${pathname}`;

  const elements = [
    { type: 'meta', props: { name: 'prerender-static-page', content: 'app-route' } },
    { type: 'meta', props: { name: 'description', content: description } },
    { type: 'link', props: { rel: 'canonical', href: canonical } },
    { type: 'meta', props: { property: 'og:title', content: title } },
    { type: 'meta', props: { property: 'og:description', content: description } },
    { type: 'meta', props: { property: 'og:type', content: 'website' } },
    { type: 'meta', props: { property: 'og:url', content: canonical } },
    { type: 'meta', props: { property: 'og:image', content: `${BASE_URL}/assets/logos/logo-horizontal.png` } },
    { type: 'meta', props: { property: 'og:site_name', content: 'PipingBox' } },
    { type: 'meta', props: { name: 'twitter:card', content: 'summary' } },
    { type: 'meta', props: { name: 'twitter:title', content: title } },
    { type: 'meta', props: { name: 'twitter:description', content: description } },
  ];

  return {
    title,
    lang: 'en',
    elements: new Set(elements),
  };
}

export async function prerender(data) {
  const { url } = data;

  // Blog routes keep their existing prerender pipeline.
  if (url.startsWith('/blog')) {
    return prerenderBlog(data);
  }

  // Tool landing routes are queued with a .html suffix (see module header).
  const toolMatch = url.match(/^\/(tools\/([a-z0-9-]+))\.html$/);
  if (toolMatch) {
    const pathname = `/${toolMatch[1]}`;
    const slug = toolMatch[2];

    // Unknown slugs are never queued by prerender/tool-landings.js; guard anyway.
    if (!getToolLandingConfig(slug)) {
      return undefined;
    }

    return {
      html: await renderToolLanding(pathname),
      head: getToolLandingHead(pathname, slug),
    };
  }

  // PB-SEO-CRAWLER-CANONICAL-001: public app routes, queued as '<route>.html'
  // by getAppRoutePrerenderRoutes() (see prerender/app-routes.js).
  const appMatch = url.match(/^(\/[a-z0-9-]+(?:\/[a-z0-9-]+)?)\.html$/);
  if (appMatch && APP_ROUTES.includes(appMatch[1])) {
    const pathname = appMatch[1];
    return {
      html: renderAppRoute(pathname) ?? '',
      head: getAppRouteHead(pathname),
    };
  }

  // '/' and any other route: skip (plugin leaves the asset untouched).
  return undefined;
}
