/**
 * PB-WEB-006 — SEO head management for a React SPA.
 *
 * Manages three concerns that index.html cannot handle statically:
 *
 * 1. `<html lang>` — kept in sync with the active i18next language so crawlers
 *    and screen readers receive the correct BCP-47 code instead of the hardcoded "en".
 *
 * 2. `<link rel="canonical">` — set to `https://pipingbox.com{pathname}` on every
 *    route change. Without this every page serves the same canonical (the static "/"
 *    in index.html) and Google consolidates all signals to the root.
 *
 * 3. `<link rel="alternate" hreflang>` — declares the six supported languages.
 *    For a SPA the same URL serves all languages, so each alternate points to the
 *    same pathname. The x-default points to the English variant as per Google's docs.
 *
 * Usage: call `useSeo()` at the top level of any public-facing page or layout,
 * or once in `App.tsx` to cover all routes globally.
 *
 * Optional: pass `{ title, description }` to override the page-level meta tags.
 * Omitting them leaves the values set by the previous call, which is intentional —
 * non-public routes (behind login) do not need per-page SEO metadata.
 */

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '@/i18n';

const BASE_URL = 'https://pipingbox.com';

// ─── helpers ─────────────────────────────────────────────────────────────────

function setOrCreate(rel: string, href: string, hreflang?: string): void {
  const selector = hreflang
    ? `link[rel="alternate"][hreflang="${hreflang}"]`
    : `link[rel="${rel}"]`;
  let el = document.head.querySelector<HTMLLinkElement>(selector);
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    if (hreflang) el.hreflang = hreflang;
    document.head.appendChild(el);
  }
  el.href = href;
}

function setMeta(name: string, content: string, prop?: boolean): void {
  const attr = prop ? 'property' : 'name';
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.content = content;
}

// ─── hook ────────────────────────────────────────────────────────────────────

interface SeoOptions {
  /** Override the page <title>. Falls back to the default in index.html. */
  title?: string;
  /** Override the meta description. Falls back to the default in index.html. */
  description?: string;
}

export function useSeo(options: SeoOptions = {}): void {
  const { pathname } = useLocation();
  const { i18n } = useTranslation();
  const lang = i18n.language?.split('-')[0] ?? 'en';

  useEffect(() => {
    // 1. <html lang>
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    const canonical = `${BASE_URL}${pathname}`;

    // 2. Canonical
    setOrCreate('canonical', canonical);

    // 3. hreflang alternates — same URL for every language (SPA, path-based routing).
    for (const { code } of SUPPORTED_LANGUAGES) {
      setOrCreate('alternate', canonical, code);
    }
    // x-default: points to the English version per Google's recommendation.
    setOrCreate('alternate', `${BASE_URL}${pathname}`, 'x-default');

    // 4. OG / Twitter URL (keep in sync with canonical)
    setMeta('og:url', canonical, true);
    setMeta('twitter:url', canonical);
  }, [pathname]);

  useEffect(() => {
    if (options.title) {
      document.title = options.title;
      setMeta('og:title', options.title, true);
      setMeta('twitter:title', options.title);
    }
    if (options.description) {
      setMeta('description', options.description);
      setMeta('og:description', options.description, true);
      setMeta('twitter:description', options.description);
    }
  }, [options.title, options.description]);
}
