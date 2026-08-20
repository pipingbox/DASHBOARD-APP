import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MessageSquareWarning,
  RefreshCw,
  ExternalLink,
  Image as ImageIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { fetchFeedbackReports, updateFeedbackReport, getScreenshotSignedUrl } from '@/lib/betaFeedback';
import { toast } from 'sonner';

/* ─── Types ─── */
type FeedbackStatus = 'new' | 'in_review' | 'resolved' | 'duplicate';
type FeedbackPriority = 'low' | 'medium' | 'high' | 'critical';

interface FeedbackRow {
  id: string;
  created_at: string;
  user_id?: string;
  user_email?: string;
  category: string;
  description: string;
  page_url?: string;
  user_agent?: string;
  screen_size?: string;
  screenshot_url?: string;
  status: FeedbackStatus;
  priority: FeedbackPriority;
}

const STATUS_OPTIONS: FeedbackStatus[] = ['new', 'in_review', 'resolved', 'duplicate'];
const PRIORITY_OPTIONS: FeedbackPriority[] = ['low', 'medium', 'high', 'critical'];

/* ─── Component ─── */
export function AdminBetaFeedback() {
  const { t } = useTranslation();
  const [reports, setReports] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<FeedbackStatus | 'all'>('all');

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFeedbackReports(filterStatus);

      if (!result.success) {
        console.error('[ADMIN_FEEDBACK] Fetch failed:', result.error);
        setError(result.error || 'Unknown error');
        setReports([]);
        return;
      }

      // Normalize rows — ensure status/priority defaults
      const normalized: FeedbackRow[] = (result.data || []).map((r: any) => ({
        ...r,
        status: r.status || 'new',
        priority: r.priority || 'medium',
      }));
      setReports(normalized);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[ADMIN_FEEDBACK] Unexpected fetch error:', err);
      setError(errorMsg);
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const updateField = async (id: string, field: 'status' | 'priority', value: string) => {
    const result = await updateFeedbackReport(id, field, value);

    if (!result.success) {
      console.error('[ADMIN_FEEDBACK] Update failed:', result.error);
      toast.error(t('adminFeedback.updateError'));
      return;
    }

    setReports((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
    toast.success(t('adminFeedback.updated'));
  };

  const getStatusColor = (status: FeedbackStatus) => {
    switch (status) {
      case 'new': return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case 'in_review': return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'resolved': return 'bg-green-500/10 text-green-400 border-green-500/30';
      case 'duplicate': return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30';
    }
  };

  const getPriorityColor = (priority: FeedbackPriority) => {
    switch (priority) {
      case 'low': return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30';
      case 'medium': return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case 'high': return 'bg-orange-500/10 text-orange-400 border-orange-500/30';
      case 'critical': return 'bg-red-500/10 text-red-400 border-red-500/30';
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };

  const safeParsePathname = (url?: string) => {
    if (!url) return '—';
    try {
      return new URL(url).pathname;
    } catch {
      return url;
    }
  };

  const stats = {
    total: reports.length,
    new: reports.filter((r) => r.status === 'new').length,
    inReview: reports.filter((r) => r.status === 'in_review').length,
    resolved: reports.filter((r) => r.status === 'resolved').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <MessageSquareWarning className="h-5 w-5 text-amber-500" />
          <h2 className="text-lg font-semibold text-zinc-100">
            {t('adminFeedback.title')}
          </h2>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchReports}
          className="border-zinc-700 text-zinc-400 hover:text-zinc-200"
        >
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          {t('adminFeedback.refresh')}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-center">
          <p className="text-2xl font-bold text-zinc-100">{stats.total}</p>
          <p className="text-xs text-zinc-500">{t('adminFeedback.stats.total')}</p>
        </div>
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 text-center">
          <p className="text-2xl font-bold text-blue-400">{stats.new}</p>
          <p className="text-xs text-zinc-500">{t('adminFeedback.stats.new')}</p>
        </div>
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-center">
          <p className="text-2xl font-bold text-amber-400">{stats.inReview}</p>
          <p className="text-xs text-zinc-500">{t('adminFeedback.stats.inReview')}</p>
        </div>
        <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3 text-center">
          <p className="text-2xl font-bold text-green-400">{stats.resolved}</p>
          <p className="text-xs text-zinc-500">{t('adminFeedback.stats.resolved')}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500">{t('adminFeedback.filterByStatus')}:</span>
        <div className="flex flex-wrap gap-1.5">
          {(['all', ...STATUS_OPTIONS] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                filterStatus === s
                  ? 'border-amber-500/50 bg-amber-500/10 text-amber-400'
                  : 'border-zinc-700/60 bg-zinc-900/50 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
              }`}
            >
              {s === 'all' ? t('adminFeedback.statusAll') : t(`adminFeedback.status.${s}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-500/30 border-t-amber-500" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <MessageSquareWarning className="h-10 w-10 text-red-500/60" />
          <p className="text-sm text-zinc-400">{t('adminFeedback.empty')}</p>
          <p className="text-xs text-zinc-600 max-w-md">
            {t('adminFeedback.errorDetail', { error })}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchReports}
            className="mt-2 border-zinc-700 text-zinc-400 hover:text-zinc-200"
          >
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            {t('adminFeedback.retry')}
          </Button>
        </div>
      ) : reports.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <MessageSquareWarning className="h-10 w-10 text-zinc-700" />
          <p className="text-sm text-zinc-500">{t('adminFeedback.empty')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-800 bg-zinc-900/60">
              <tr>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-zinc-500">{t('adminFeedback.col.date')}</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-zinc-500">{t('adminFeedback.col.user')}</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-zinc-500">{t('adminFeedback.col.category')}</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-zinc-500 max-w-[200px]">{t('adminFeedback.col.description')}</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-zinc-500">{t('adminFeedback.col.page')}</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-zinc-500">{t('adminFeedback.col.status')}</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-zinc-500">{t('adminFeedback.col.priority')}</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-zinc-500">{t('adminFeedback.col.screenshot')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {reports.map((report) => (
                <tr key={report.id} className="hover:bg-zinc-900/40 transition">
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs text-zinc-400">
                    {formatDate(report.created_at)}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-zinc-300 max-w-[140px] truncate">
                    {report.user_email || report.user_id?.slice(0, 8) || '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="rounded-md border border-zinc-700/50 bg-zinc-800/50 px-2 py-0.5 text-[10px] font-medium text-zinc-300">
                      {t(`betaFeedback.categories.${report.category}`, report.category)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-zinc-300 max-w-[200px]">
                    <p className="line-clamp-2">{report.description}</p>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-zinc-500 max-w-[120px] truncate">
                    <span title={report.page_url || ''}>
                      {safeParsePathname(report.page_url)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <Select
                      value={report.status}
                      onValueChange={(v) => updateField(report.id, 'status', v)}
                    >
                      <SelectTrigger className={`h-7 w-[110px] border text-[10px] font-medium ${getStatusColor(report.status)}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-zinc-800 bg-zinc-900">
                        {STATUS_OPTIONS.map((s) => (
                          <SelectItem key={s} value={s} className="text-xs text-zinc-200">
                            {t(`adminFeedback.status.${s}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2.5">
                    <Select
                      value={report.priority}
                      onValueChange={(v) => updateField(report.id, 'priority', v)}
                    >
                      <SelectTrigger className={`h-7 w-[100px] border text-[10px] font-medium ${getPriorityColor(report.priority)}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-zinc-800 bg-zinc-900">
                        {PRIORITY_OPTIONS.map((p) => (
                          <SelectItem key={p} value={p} className="text-xs text-zinc-200">
                            {t(`adminFeedback.priority.${p}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {report.screenshot_url ? (
                      <button
                        onClick={async () => {
                          const url = await getScreenshotSignedUrl(report.screenshot_url!);
                          if (url) {
                            window.open(url, '_blank', 'noopener,noreferrer');
                          } else {
                            toast.error('No se pudo obtener la imagen.');
                          }
                        }}
                        className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition"
                      >
                        <ImageIcon className="h-3.5 w-3.5" />
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    ) : (
                      <span className="text-xs text-zinc-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}