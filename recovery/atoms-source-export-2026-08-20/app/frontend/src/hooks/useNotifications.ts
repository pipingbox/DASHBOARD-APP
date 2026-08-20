import { useCallback, useEffect, useState } from 'react';
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

/**
 * Hook for managing user notifications with real-time updates.
 */
export function useNotifications() {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshCount = useCallback(async () => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    setUnreadCount(await countUnread(user.id));
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

  // Poll for unread count
  useEffect(() => {
    void refreshCount();
    if (!user) return;
    const id = window.setInterval(() => void refreshCount(), POLL_MS);
    return () => window.clearInterval(id);
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