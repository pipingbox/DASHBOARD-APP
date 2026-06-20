import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const BRAND = 'PipingBox';

interface PageMeta {
  titleKey: string;
  titleFallback: string;
  descKey?: string;
  descFallback?: string;
}

const PAGE_META: Record<string, PageMeta> = {
  '/': {
    titleKey: 'meta.homeTitle',
    titleFallback: 'Industrial Workforce Platform',
    descKey: 'meta.homeDesc',
    descFallback: 'Find verified industrial jobs. Hire qualified workers. Grow your career in piping, welding, mechanical, and more.',
  },
  '/login': {
    titleKey: 'meta.loginTitle',
    titleFallback: 'Sign In',
    descKey: 'meta.loginDesc',
    descFallback: 'Sign in to your PipingBox account to access jobs, tools, and your professional network.',
  },
  '/register': {
    titleKey: 'meta.registerTitle',
    titleFallback: 'Create Account',
    descKey: 'meta.registerDesc',
    descFallback: 'Join PipingBox — the platform for industrial professionals and companies. Free account.',
  },
  '/forgot-password': {
    titleKey: 'meta.forgotPasswordTitle',
    titleFallback: 'Reset Password',
  },
  '/auth/callback': {
    titleKey: 'meta.authCallbackTitle',
    titleFallback: 'Signing in...',
  },
  '/auth/error': {
    titleKey: 'meta.authErrorTitle',
    titleFallback: 'Authentication Error',
  },
  '/dashboard': {
    titleKey: 'meta.dashboardTitle',
    titleFallback: 'Dashboard',
  },
  '/profile': {
    titleKey: 'meta.profileTitle',
    titleFallback: 'Profile',
  },
  '/jobs': {
    titleKey: 'meta.jobsTitle',
    titleFallback: 'Jobs',
    descKey: 'meta.jobsDesc',
    descFallback: 'Browse verified industrial job opportunities in piping, welding, mechanical, and more.',
  },
  '/messages': {
    titleKey: 'meta.messagesTitle',
    titleFallback: 'Messages',
  },
  '/community': {
    titleKey: 'meta.communityTitle',
    titleFallback: 'Community',
    descKey: 'meta.communityDesc',
    descFallback: 'Connect with industrial professionals. Share knowledge, ask questions, grow together.',
  },
  '/admin': {
    titleKey: 'meta.adminTitle',
    titleFallback: 'Admin',
  },
  '/applications': {
    titleKey: 'meta.applicationsTitle',
    titleFallback: 'Applications',
  },
  '/company-dashboard': {
    titleKey: 'meta.companyDashboardTitle',
    titleFallback: 'Company Dashboard',
  },
  '/academy': {
    titleKey: 'meta.academyTitle',
    titleFallback: 'Academy',
    descKey: 'meta.academyDesc',
    descFallback: 'Structured learning paths for piping, mechanical, and industrial professionals.',
  },
  '/tools': {
    titleKey: 'meta.toolsTitle',
    titleFallback: 'Tools',
    descKey: 'meta.toolsDesc',
    descFallback: 'Industrial calculators and utilities for piping, welding, and mechanical engineering.',
  },
  '/companies': {
    titleKey: 'meta.companiesTitle',
    titleFallback: 'Companies',
  },
  '/request-workers': {
    titleKey: 'meta.requestWorkersTitle',
    titleFallback: 'Request Workers',
    descKey: 'meta.requestWorkersDesc',
    descFallback: 'Request qualified industrial workers for your projects. Piping, welding, mechanical, and more.',
  },
  '/terms': {
    titleKey: 'meta.termsTitle',
    titleFallback: 'Terms of Service',
  },
  '/privacy': {
    titleKey: 'meta.privacyTitle',
    titleFallback: 'Privacy Policy',
  },
  '/content-drafts': {
    titleKey: 'meta.contentDraftsTitle',
    titleFallback: 'Content Drafts',
  },
};

// Prefix-based fallbacks for nested routes
const PREFIX_META: Array<{ prefix: string; meta: PageMeta }> = [
  { prefix: '/company/', meta: { titleKey: 'meta.companyTitle', titleFallback: 'Company' } },
  { prefix: '/community/', meta: { titleKey: 'meta.communityTitle', titleFallback: 'Community' } },
  { prefix: '/blog', meta: { titleKey: 'meta.blogTitle', titleFallback: 'Blog' } },
];

function setMetaTag(name: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.name = name;
    document.head.appendChild(el);
  }
  el.content = content;
}

export function useDocumentTitle() {
  const location = useLocation();
  const { t } = useTranslation();

  useEffect(() => {
    const path = location.pathname;

    // Exact match
    let meta = PAGE_META[path];

    // Prefix match (longest prefix wins)
    if (!meta) {
      const match = PREFIX_META
        .filter(({ prefix }) => path.startsWith(prefix))
        .sort((a, b) => b.prefix.length - a.prefix.length)[0];
      if (match) meta = match.meta;
    }

    if (meta) {
      const pageTitle = t(meta.titleKey, meta.titleFallback);
      document.title = `${BRAND} — ${pageTitle}`;

      if (meta.descKey && meta.descFallback) {
        setMetaTag('description', t(meta.descKey, meta.descFallback));
      }
    } else {
      document.title = BRAND;
    }
  }, [location.pathname, t]);
}
