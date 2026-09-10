import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/**
 * PB-I18N-LAYER2-001 — document titles and meta descriptions follow the active
 * language. The static English maps moved to the `pageMeta.*` i18n namespace;
 * this hook only maps pathname → key and lets i18next resolve the string.
 */

const BASE_TITLE = 'PipingBox';

// pathname → pageMeta key (order matters: exact match first, then prefix match
// sorted by longest path).
const PAGE_META_KEYS: Record<string, string> = {
  '/': 'home',
  '/login': 'login',
  '/register': 'register',
  '/dashboard': 'dashboard',
  '/profile': 'profile',
  '/jobs': 'jobs',
  '/messages': 'messages',
  '/community': 'community',
  '/admin': 'admin',
  '/applications': 'applications',
  '/company-dashboard': 'companyDashboard',
  '/enterprise-dashboard': 'enterpriseDashboard',
  '/academy': 'academy',
  '/tools': 'tools',
  '/companies': 'companies',
  '/pricing': 'pricing',
};

// pages that carry a translated meta description
const PAGE_DESCRIPTION_KEYS = new Set(['home', 'tools', 'jobs', 'pricing', 'academy', 'companies', 'register']);

function resolvePageKey(path: string): string | null {
  if (PAGE_META_KEYS[path]) return PAGE_META_KEYS[path];
  const matchedKey = Object.keys(PAGE_META_KEYS)
    .filter((key) => key !== '/' && path.startsWith(key))
    .sort((a, b) => b.length - a.length)[0];
  if (matchedKey) return PAGE_META_KEYS[matchedKey];
  if (path.startsWith('/company')) return 'company';
  if (path.startsWith('/blog')) return 'blog';
  return null;
}

export function useDocumentTitle() {
  const location = useLocation();
  const { t, i18n } = useTranslation();

  useEffect(() => {
    const path = location.pathname;
    const pageKey = resolvePageKey(path);

    // Set title
    if (pageKey) {
      document.title = t(`pageMeta.${pageKey}.title`, { defaultValue: `${BASE_TITLE}` });
    } else {
      document.title = BASE_TITLE;
    }

    // Set meta description for public pages
    if (pageKey && PAGE_DESCRIPTION_KEYS.has(pageKey)) {
      const desc = t(`pageMeta.${pageKey}.description`, { defaultValue: '' });
      if (desc) {
        let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
        if (!meta) {
          meta = document.createElement('meta');
          meta.name = 'description';
          document.head.appendChild(meta);
        }
        meta.content = desc;

        // Also update OG description
        let ogDesc = document.querySelector('meta[property="og:description"]') as HTMLMetaElement | null;
        if (!ogDesc) {
          ogDesc = document.createElement('meta');
          ogDesc.setAttribute('property', 'og:description');
          document.head.appendChild(ogDesc);
        }
        ogDesc.content = desc;
      }
    }

    // PB-SEO-101: <html lang> and <link rel="canonical"> are owned by useSeo
    // (dynamic lang from i18next, canonical on every route change). Keeping
    // them here forced lang="en" and wrote a duplicate canonical.
  }, [location.pathname, t, i18n.resolvedLanguage]);
}
