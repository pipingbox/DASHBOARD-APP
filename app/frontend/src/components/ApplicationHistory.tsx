import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { History, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

interface ApplicationEvent {
  id: string;
  from_status: string | null;
  to_status: string;
  actor_role: string | null;
  note: string | null;
  created_at: string;
}

interface ApplicationHistoryProps {
  applicationId: string;
  /** When true, internal notes are rendered (recruitment/company/admin only). */
  showInternalNotes?: boolean;
}

/**
 * PB-JOBS-ATS-001 §3: audit history of an application's status transitions.
 *
 * Read-only. Corrections are new events; history is never edited or deleted.
 * The candidate view (showInternalNotes=false) renders only public status
 * labels — internal notes and commercial data stay hidden.
 */
export function ApplicationHistory({ applicationId, showInternalNotes = false }: ApplicationHistoryProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [events, setEvents] = useState<ApplicationEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('app_14da0f1941_job_application_events')
      .select('id, from_status, to_status, actor_role, note, created_at')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: false });

    if (!error) setEvents((data ?? []) as ApplicationEvent[]);
    setLoading(false);
  }, [applicationId, user]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-zinc-500 text-xs">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {t('applicationHistory.loading')}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="py-4 text-zinc-600 text-xs">{t('applicationHistory.empty')}</div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
        <History className="h-3 w-3" />
        {t('applicationHistory.title')}
      </div>
      <ol className="relative border-l border-zinc-800 ml-1.5 space-y-3">
        {events.map((ev) => (
          <li key={ev.id} className="ml-4">
            <div className="absolute -left-1 mt-1.5 h-2 w-2 rounded-full bg-zinc-700 border border-zinc-900" />
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-xs text-zinc-300 font-medium">
                {ev.from_status
                  ? t('applicationHistory.transition', { from: ev.from_status, to: ev.to_status })
                  : t('applicationHistory.created', { status: ev.to_status })}
              </span>
              <span className="text-[10px] text-zinc-600">
                {new Date(ev.created_at).toLocaleString()}
              </span>
            </div>
            {showInternalNotes && ev.note && (
              <p className="mt-0.5 text-[11px] text-zinc-500 italic">{ev.note}</p>
            )}
            {showInternalNotes && ev.actor_role && (
              <p className="text-[10px] text-zinc-700">{ev.actor_role}</p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
