import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { storeReferralCode } from '@/lib/referrals';

/**
 * Global hook to capture referral codes from any page URL.
 * If a visitor lands on any page with ?ref=CODE, the code is persisted
 * so it survives page refreshes and delayed registration.
 */
export function useReferralCapture(): void {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref && ref.startsWith('PB-')) {
      storeReferralCode(ref);
    }
  }, [searchParams]);
}