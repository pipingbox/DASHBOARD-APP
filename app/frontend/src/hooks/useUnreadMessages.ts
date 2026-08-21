import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase, TABLES } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

/**
 * Hook to fetch and subscribe to the total unread message count
 * for the current user across all conversations.
 */
export function useUnreadMessages() {
  const { user, profile } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const mountedRef = useRef(true);

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
      if (mountedRef.current) {
        setUnreadCount(total);
      }
    } catch (err) {
      console.error('Failed to fetch unread count:', err);
    }
  }, [user, isCompany]);

  useEffect(() => {
    mountedRef.current = true;

    if (!user) {
      setUnreadCount(0);
      return;
    }

    // Fetch immediately
    fetchUnread();

    // Generate a unique channel name per effect instance to avoid
    // Supabase's internal channel cache conflicts (especially in React Strict Mode)
    const instanceId = Math.random().toString(36).slice(2, 8);
    const channelName = `unread-msgs-${user.id}-${instanceId}`;

    // TD-12: Subscribe to conversation changes scoped to the current user only.
    // Previously subscribed to ALL conversation changes (performance waste).
    const col = isCompany ? 'company_user_id' : 'worker_user_id';
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: TABLES.conversations,
          filter: `${col}=eq.${user.id}`,
        },
        () => {
          if (mountedRef.current) {
            fetchUnread();
          }
        }
      )
      .subscribe();

    // Poll every 30 seconds as a fallback
    const interval = setInterval(() => {
      if (mountedRef.current) {
        fetchUnread();
      }
    }, 30000);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isCompany]);

  return { unreadCount, refetch: fetchUnread };
}