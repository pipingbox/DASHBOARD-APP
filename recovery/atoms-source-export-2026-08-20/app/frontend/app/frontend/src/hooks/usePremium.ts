import { useState, useEffect } from 'react';
import { checkPremiumStatus, cachePremiumStatus, type PremiumStatus } from '@/lib/premium';
import { useAuth } from '@/hooks/useAuth';

/**
 * usePremium — hook to check if user has premium tools access.
 * Caches result in localStorage for synchronous access.
 */
export function usePremium() {
  const { user } = useAuth();
  const [status, setStatus] = useState<PremiumStatus>({ isPremium: false, source: 'none' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setStatus({ isPremium: false, source: 'none' });
      setLoading(false);
      return;
    }

    (async () => {
      const result = await checkPremiumStatus(user.id);
      setStatus(result);
      cachePremiumStatus(result);
      setLoading(false);
    })();
  }, [user]);

  return { status, loading };
}
