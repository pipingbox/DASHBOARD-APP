import { useEffect, useState, useCallback } from 'react';
import { supabase, TABLES } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

const LAST_SEEN_KEY = 'pipingbox_admin_feedback_last_seen';

/**
 * Hook that tracks the count of new (unseen) beta feedback reports for admins.
 * Uses Supabase Realtime to listen for INSERT events on the beta_feedback_reports table.
 * Only active when the user is an admin.
 */
export function useAdminFeedbackCount() {
  const { profile } = useAuth();
  const [newCount, setNewCount] = useState(0);
  const isAdmin = profile?.role === 'admin';

  // Get the last seen timestamp from localStorage
  const getLastSeen = useCallback((): string => {
    return localStorage.getItem(LAST_SEEN_KEY) || '1970-01-01T00:00:00Z';
  }, []);

  // Mark all current feedback as seen
  const markAsSeen = useCallback(() => {
    localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
    setNewCount(0);
  }, []);

  // Fetch initial count of unseen reports
  const fetchCount = useCallback(async () => {
    if (!isAdmin) return;

    try {
      const lastSeen = getLastSeen();
      const { count, error } = await supabase
        .from(TABLES.betaFeedbackReports)
        .select('*', { count: 'exact', head: true })
        .gt('created_at', lastSeen);

      if (error) {
        // RLS might block non-admins — silently ignore
        console.debug('[FEEDBACK_COUNT] Query error (may be RLS):', error.message);
        return;
      }

      setNewCount(count ?? 0);
    } catch (err) {
      console.debug('[FEEDBACK_COUNT] Fetch error:', err);
    }
  }, [isAdmin, getLastSeen]);

  useEffect(() => {
    if (!isAdmin) {
      setNewCount(0);
      return;
    }

    // Initial fetch
    fetchCount();

    // Subscribe to realtime INSERT events
    const channel = supabase
      .channel('admin-feedback-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: TABLES.betaFeedbackReports,
        },
        (payload) => {
          console.log('[FEEDBACK_COUNT] New feedback received:', payload.new);
          setNewCount((prev) => prev + 1);
        }
      )
      .subscribe((status) => {
        console.debug('[FEEDBACK_COUNT] Realtime subscription:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin, fetchCount]);

  return { newCount, markAsSeen, refetch: fetchCount };
}