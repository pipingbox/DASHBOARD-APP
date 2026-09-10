/**
 * PB-WEB-006 — SEO head management for a React SPA.
 *
 * Manages two concerns that index.html cannot handle statically:
 *
 * 1. `<html lang>` — kept in sync with the active i18next language so crawlers
 *    and screen readers receive the correct BCP-47 code instead of the hardcoded "en".
 *
 * 2. `<link rel="canonical">` — set to `https://pipingbox.com{pathname}` on every
 *    route change. Without this every page serves the same canonical (the static "/"
 *    in index.html) and Google consolidates all signals to the root.
 *
 * PB-I18N-LAYER2-001 (PO decision D5): the hreflang alternates were removed.
 * Emitting seven `<link rel="alternate" hreflang>` entries that all point to
 * the SAME URL is semantically invalid — an alternate must point to a distinct
 * language version. Google ignores such clusters, and they add noise to the
 * head. The correct fix is per-language URLs (language-prefixed routes with
 * canonical + bidirectional hreflang + x-default), which is scoped separately
 * in PB-SEO-I18N-URLS-001. Do not re-add same-URL alternates here.
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

function removeMeta(name: string, prop?: boolean): void {
  const attr = prop ? 'property' : 'name';
  const el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
  if (el) el.remove();
}

// ─── hook ────────────────────────────────────────────────────────────────────

interface SeoOptions {
  /** Override the page <title>. Falls back to the default in index.html. */
  title?: string;
  /** Override the meta description. Falls back to the default in index.html. */
  description?: string;
  /** If true, add <meta name="robots" content="noindex"> while mounted. */
  noindex?: boolean;
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

    // PB-I18N-LAYER2-001 (D5): no hreflang alternates — see header comment.
    // Same-URL alternates were semantically invalid; per-language URLs are
    // scoped in PB-SEO-I18N-URLS-001.

    // 3. OG / Twitter URL (keep in sync with canonical)
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

  // PB-SEO-102: page-specific noindex with cleanup. When mounted, capture the
  // previous robots value (if any), set noindex, and restore/remove on unmount.
  useEffect(() => {
    if (!options.noindex) return;

    const selector = 'meta[name="robots"]';
    const existing = document.head.querySelector<HTMLMetaElement>(selector);
    const previous = existing?.content ?? null;

    setMeta('robots', 'noindex');

    return () => {
      if (previous === null) {
        removeMeta('robots');
      } else {
        setMeta('robots', previous);
      }
    };
  }, [options.noindex]);
}
