import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  trackEvent,
  normalizeRoute,
  detectOrigin,
  detectLocale,
  detectDeviceType,
} from '@/lib/observability';

/**
 * Closed-schema page tracking — PB-OBSERVABILITY-001.
 * Emits `page_viewed` once per route change (query string never included, so
 * referral codes / tokens in the URL never leave the app). PostHog's own
 * autocapture/pageview stays disabled; GA4 keeps only the WFA-007 taxonomy.
 */
export function usePageTracking(): void {
  const location = useLocation();

  useEffect(() => {
    trackEvent(
      'page_viewed',
      {
        route: normalizeRoute(location.pathname),
        origin: detectOrigin(),
        locale: detectLocale(),
        device_type: detectDeviceType(),
      },
      { dedupeKey: `route:${location.pathname}` },
    );
  }, [location.pathname]);
}
