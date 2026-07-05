import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const BASE_TITLE = 'PipingBox';
const APP_TITLE = 'PipingBox';

const PAGE_TITLES: Record<string, string> = {
  '/': `${BASE_TITLE} — Industrial Workforce Platform | Tools, Jobs, Academy`,
  '/login': `${BASE_TITLE} — Sign In`,
  '/register': `${BASE_TITLE} — Create Account`,
  '/dashboard': `${APP_TITLE} — Dashboard`,
  '/profile': `${APP_TITLE} — Profile`,
  '/jobs': `${APP_TITLE} — Industrial Job Board | Pipefitter, Welder, QA/QC Jobs`,
  '/messages': `${APP_TITLE} — Messages`,
  '/community': `${APP_TITLE} — Community`,
  '/admin': `${APP_TITLE} — Admin`,
  '/applications': `${APP_TITLE} — Applications`,
  '/company-dashboard': `${APP_TITLE} — Company Dashboard`,
  '/enterprise-dashboard': `${APP_TITLE} — Enterprise Dashboard`,
  '/academy': `${APP_TITLE} — Academy | VCA, SCC, PRL, OSHA Certification Prep`,
  '/tools': `${APP_TITLE} — Technical Hub | Piping Calculators, Fabrication Tools, Component Library`,
  '/companies': `${APP_TITLE} — Verified Industrial Employers`,
  '/pricing': `${BASE_TITLE} — Pricing | Academy, Enterprise, Job Posts`,
};

const PAGE_DESCRIPTIONS: Record<string, string> = {
  '/': 'Free engineering tools, industrial jobs, certification training (VCA, SCC, OSHA), and community for pipefitters, welders, and industrial professionals. ASME B31.3 calculators, pipe data tables, elbow cut calculator.',
  '/tools': 'PipingBox Technical Hub: piping calculators, fabrication tools (elbow cut, branch layout, fitting take-off), pipe data tables, flange rating lookup, unit converter, and more. Free, no login required.',
  '/jobs': 'Industrial job board for pipefitters, welders, QA/QC inspectors, supervisors, and planners. Verified companies across Europe, USA, and Middle East. Apply in one click.',
  '/pricing': 'PipingBox pricing: Academy certification courses (VCA, SCC, OSHA), enterprise subscriptions, featured job posts. Transparent pricing, no hidden fees.',
  '/academy': 'Certification preparation courses: VCA (Belgium/Netherlands), SCC (Germany), PRL (Spain), OSHA 10/30 (USA). Up to 6x cheaper than classroom training.',
  '/companies': 'Directory of verified industrial companies hiring pipefitters, welders, and engineers across Europe and USA.',
  '/register': 'Create your PipingBox account. Free for workers: profile, jobs, tools, community, and certification prep.',
};

export function useDocumentTitle() {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname;

    // Set title
    if (PAGE_TITLES[path]) {
      document.title = PAGE_TITLES[path];
    } else {
      const matchedKey = Object.keys(PAGE_TITLES)
        .filter((key) => key !== '/' && path.startsWith(key))
        .sort((a, b) => b.length - a.length)[0];

      if (matchedKey) {
        document.title = PAGE_TITLES[matchedKey];
      } else if (path.startsWith('/company')) {
        document.title = `${APP_TITLE} — Company`;
      } else if (path.startsWith('/blog')) {
        document.title = `${BASE_TITLE} — Blog`;
      } else {
        document.title = APP_TITLE;
      }
    }

    // Set meta description for public pages
    const descPath = Object.keys(PAGE_DESCRIPTIONS).find(
      (key) => path === key || (key !== '/' && path.startsWith(key))
    );
    if (descPath) {
      const desc = PAGE_DESCRIPTIONS[descPath];
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

    // Set html lang to en (I18N-03 fix — was hardcoded to 'es')
    document.documentElement.lang = 'en';

    // Set canonical URL (I18N-04 fix)
    const canonicalUrl = `https://pipingbox.com${path}`;
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;
  }, [location.pathname]);
}
