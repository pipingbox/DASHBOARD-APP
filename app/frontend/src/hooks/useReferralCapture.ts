import { useEffect } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { storeReferralCode } from '@/lib/referrals';
import {
  trackEvent,
  refreshOrigin,
  detectOrigin,
  normalizeRoute,
} from '@/lib/observability';

/**
 * Global hook to capture referral codes from any page URL.
 * If a visitor lands on any page with ?ref=CODE, the code is persisted
 * so it survives page refreshes and delayed registration.
 *
 * PB-OBSERVABILITY-001: emits the closed-schema funnel events
 * `referral_link_opened` / `referral_captured`. The referral CODE itself is
 * never sent to analytics — only the state transition and origin.
 */
export function useReferralCapture(): void {
  const [searchParams] = useSearchParams();
  const location = useLocation();

  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref && ref.startsWith('PB-')) {
      trackEvent(
        'referral_link_opened',
        { origin: 'referral', route: normalizeRoute(location.pathname) },
        { dedupeKey: 'ref-opened' },
      );
      storeReferralCode(ref);
      refreshOrigin(); // stored code makes this session's origin 'referral'
      trackEvent(
        'referral_captured',
        { origin: detectOrigin() },
        { dedupeKey: 'ref-captured' },
      );
    }
  }, [searchParams, location.pathname]);
}
