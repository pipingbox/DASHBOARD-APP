import { useEffect, useState, useCallback } from 'react';
import { supabase, TABLES } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

/**
 * Hook to fetch and subscribe to the total unread message count
 * for the current user across all conversations.
 */
export function useUnreadMessages() {
  const { user, profile } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const userRole = profile?.role || 'worker';
  const isCompany = userRole === 'company' || userRole === 'admin';

  const fetchUnread = useCallback(async () => {
    if (!user) {
      setUnreadCount(0);
      return;
    }

    try {
      const col = isCompany ? 'company_user_id' : 'worker_user_id';
      const unreadCol = isCompany ? 'unread_company' : 'unread_worker';

      const { data, error } = await supabase
        .from(TABLES.conversations)
        .select(unreadCol)
        .eq(col, user.id);

      if (error) {
        console.error('Failed to fetch unread count:', error);
        return;
      }

      const total = (data || []).reduce(
        (sum, row) => sum + ((row as Record<string, number>)[unreadCol] || 0),
        0
      );
      setUnreadCount(total);
    } catch (err) {
      console.error('Failed to fetch unread count:', err);
    }
  }, [user, isCompany]);

  useEffect(() => {
    fetchUnread();

    // Subscribe to conversation changes to update unread count in real-time
    if (!user) return;

    // TD-12: Subscribe to conversation changes scoped to the current user only.
    // Previously subscribed to ALL conversation changes (performance waste).
    const col = isCompany ? 'company_user_id' : 'worker_user_id';
    const channel = supabase
      .channel('unread-messages')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: TABLES.conversations,
          filter: `${col}=eq.${user.id}`,
        },
        () => {
          fetchUnread();
        }
      )
      .subscribe();

    // Also poll every 30 seconds as a fallback
    const interval = setInterval(fetchUnread, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [user, fetchUnread]);

  return { unreadCount, refetch: fetchUnread };
}