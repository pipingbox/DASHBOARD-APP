import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase, TABLES } from '@/lib/supabase';
import {
  NotificationRow,
  countUnread,
  fetchNotifications,
  markAllRead,
  markRead,
  deleteNotification,
} from '@/lib/notifications';

const POLL_MS = 45_000;
const MAX_BACKOFF_MS = 10 * 60_000; // 10 min cap

/**
 * Hook for managing user notifications with real-time updates.
 */
export function useNotifications() {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const failureCountRef = useRef(0);

  const refreshCount = useCallback(async () => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    try {
      setUnreadCount(await countUnread(user.id));
      // PB-GROWTH-GATE-FINAL-001: a successful poll always resets the
      // backoff — a transient 403 (e.g. stale session) must not keep the
      // loop throttled forever once the underlying cause clears.
      failureCountRef.current = 0;
    } catch (err) {
      // Back off exponentially on repeated denials instead of hammering
      // every POLL_MS forever, but keep retrying (capped) so a transient
      // failure can self-heal without requiring a remount/relogin.
      failureCountRef.current += 1;
      // eslint-disable-next-line no-console
      console.warn('[notifications] refreshCount failed', failureCountRef.current, err);
    }
  }, [user]);

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const data = await fetchNotifications(user.id, 30);
    setNotifications(data);
    setLoading(false);
  }, [user]);

  const handleMarkRead = useCallback(async (id: string) => {
    await markRead(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n)),
    );
    setUnreadCount((c) => Math.max(0, c - 1));
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    if (!user || unreadCount === 0) return;
    await markAllRead(user.id);
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, is_read: true, read_at: new Date().toISOString() })),
    );
    setUnreadCount(0);
  }, [user, unreadCount]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteNotification(id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // Poll for unread count with exponential backoff on repeated denials.
  // A single successful poll resets to the base cadence (self-healing);
  // persistent denials slow down (capped at MAX_BACKOFF_MS) instead of
  // either hammering every 45s forever or stopping permanently.
  useEffect(() => {
    failureCountRef.current = 0;
    if (!user) {
      void refreshCount();
      return;
    }
    let timeoutId: ReturnType<typeof window.setTimeout>;
    let cancelled = false;
    const tick = async () => {
      await refreshCount();
      if (cancelled) return;
      const exponent = Math.min(failureCountRef.current, 10);
      const delay = Math.min(POLL_MS * 2 ** exponent, MAX_BACKOFF_MS);
      timeoutId = window.setTimeout(() => void tick(), delay);
    };
    void tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [user, refreshCount]);

  // Real-time subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notif-hook:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: TABLES.notifications,
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotif = payload.new as NotificationRow;
          setNotifications((prev) => [newNotif, ...prev].slice(0, 30));
          setUnreadCount((c) => c + 1);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user]);

  return {
    unreadCount,
    notifications,
    loading,
    loadNotifications,
    refreshCount,
    markRead: handleMarkRead,
    markAllRead: handleMarkAllRead,
    deleteNotification: handleDelete,
  };
}