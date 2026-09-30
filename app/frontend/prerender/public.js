import React from 'react';
import { renderToString } from 'react-dom/server';
import { Route, Routes } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { prerender as prerenderBlog } from './blog.js';
import { getToolLandingConfig } from '../src/lib/tool-landings';
import { AuthProvider } from '../src/hooks/useAuth';
import ToolLandingPage from '../src/pages/ToolLandingPage';
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
 *   - anything else (including '/') -> undefined, which makes the plugin skip
 *     the URL with a warning and leave the existing asset untouched.
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

  // '/' and any other route: skip (plugin leaves the asset untouched).
  return undefined;
}
