import { useEffect, useState } from 'react';
import { supabase, TABLES } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

/**
 * Returns whether the current user is a moderator of the given channel.
 * Returns { isModerator, loading }. While loading, treat as false.
 */
export function useIsModerator(channelId: string | null | undefined) {
  const { user } = useAuth();
  const [isModerator, setIsModerator] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!user || !channelId) {
        setIsModerator(false);
        return;
      }
      setLoading(true);
      const { data } = await supabase
        .from(TABLES.communityModerators)
        .select('id')
        .eq('channel_id', channelId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!cancelled) {
        setIsModerator(Boolean(data));
        setLoading(false);
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, [user, channelId]);

  return { isModerator, loading };
}