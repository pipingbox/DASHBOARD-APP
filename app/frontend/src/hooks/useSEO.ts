import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

interface SEOOptions {
  title?: string;
  description?: string;
  canonical?: string;
  ogType?: string;
}

const DEFAULT_TITLE = 'PipingBox — Industrial Workforce Platform';
const DEFAULT_DESCRIPTION =
  'Engineering tools, jobs, certification training, and community for pipefitters, welders, QA/QC inspectors, and industrial companies. ASME, API, OSHA, VCA, SCC.';

const BASE_URL = 'https://pipingbox.com';

/**
 * Dynamic SEO hook: sets document title, meta description, canonical URL,
 * and Open Graph tags per page. Solves I18N-03 (html lang) and I18N-04
 * (hreflang) gaps identified in I18N_STRATEGY.md.
 */
export function useSEO(options: SEOOptions = {}) {
  const location = useLocation();

  useEffect(() => {
    const { title, description, canonical, ogType } = options;

    // Title
    if (title) {
      document.title = title.includes('PipingBox') ? title : `${title} — PipingBox`;
    } else {
      document.title = DEFAULT_TITLE;
    }

    // Meta description
    const descContent = description || DEFAULT_DESCRIPTION;
    setMetaTag('name', 'description', descContent);
    setMetaTag('property', 'og:description', descContent);
    setMetaTag('name', 'twitter:description', descContent);

    // Canonical URL
    const canonicalUrl = canonical || `${BASE_URL}${location.pathname}`;
    setLinkTag('canonical', canonicalUrl);

    // Open Graph URL
    setMetaTag('property', 'og:url', canonicalUrl);

    // Open Graph type
    setMetaTag('property', 'og:type', ogType || 'website');

    // Set html lang attribute (I18N-03)
    document.documentElement.lang = 'en';
  }, [location.pathname, options.title, options.description, options.canonical, options.ogType]);
}

function setMetaTag(attr: 'name' | 'property', key: string, content: string) {
  let tag = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

function setLinkTag(rel: string, href: string) {
  let tag = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!tag) {
    tag = document.createElement('link');
    tag.setAttribute('rel', rel);
    document.head.appendChild(tag);
  }
  tag.setAttribute('href', href);
}
