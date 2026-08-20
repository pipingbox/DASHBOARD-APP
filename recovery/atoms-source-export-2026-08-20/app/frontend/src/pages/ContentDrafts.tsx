import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  Send,
  Plus,
  X,
  ExternalLink,
  Tag,
  Globe,
  Layers,
  AlertCircle,
  RotateCcw,
  Sparkles,
  Megaphone,
  MessageSquare,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase, TABLES } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

/* ─── Constants ─── */
const CHANNEL_KEYS = ['piping', 'welding', 'jobs', 'tools', 'field', 'updates', 'ideas'] as const;
const CHANNELS = [
  'Piping & Isometrics',
  'Welding & QA/QC',
  'Jobs & Projects',
  'Tools & Calculators',
  'Field Problems / Site Tips',
  'Platform Updates',
  'Ideas & Suggestions',
];

const DRAFT_TYPE_KEYS = ['technical', 'job', 'update', 'suggestion', 'discussion', 'tip'] as const;
const DRAFT_TYPES = [
  'Technical post',
  'Job post',
  'Platform update',
  'User suggestion response',
  'Community discussion',
  'Site tip',
];

const SOURCE_TYPE_KEYS = ['manual', 'ai', 'external', 'user', 'internal'] as const;
const SOURCE_TYPES = [
  'Manual',
  'AI Generated',
  'External Article',
  'User Submission',
  'Internal Note',
];

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  draft: { bg: 'bg-zinc-500/10', text: 'text-zinc-400', border: 'border-zinc-500/20' },
  approved: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  published: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
  rejected: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
};

/* ─── Types ─── */
interface Draft {
  id: string;
  created_at: string;
  title: string | null;
  content: string | null;
  source_url: string | null;
  source_type: string | null;
  suggested_channel: string | null;
  language: string | null;
  tags: string | null;
  status: string;
  draft_type: string | null;
  created_by: string | null;
}

/* ─── Status Badge ─── */
function StatusBadge({ status }: { status: string }) {
  const colors = STATUS_COLORS[status] ?? STATUS_COLORS.draft;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-semibold border ${colors.bg} ${colors.text} ${colors.border}`}>
      {status === 'draft' && <Clock className="h-3 w-3" />}
      {status === 'approved' && <CheckCircle2 className="h-3 w-3" />}
      {status === 'published' && <Send className="h-3 w-3" />}
      {status === 'rejected' && <XCircle className="h-3 w-3" />}
      {status}
    </span>
  );
}

/* ─── Main Component ─── */
export default function ContentDrafts() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDraft, setSelectedDraft] = useState<Draft | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formSourceUrl, setFormSourceUrl] = useState('');
  const [formSourceType, setFormSourceType] = useState('Manual');
  const [formChannel, setFormChannel] = useState(CHANNELS[0]);
  const [formLanguage, setFormLanguage] = useState('English');
  const [formTags, setFormTags] = useState('');
  const [formDraftType, setFormDraftType] = useState('Technical post');
  const [submitting, setSubmitting] = useState(false);

  /* ─── i18n helpers for channels/types/sources ─── */
  const getChannelLabel = (channel: string): string => {
    const idx = CHANNELS.indexOf(channel);
    if (idx >= 0) return t(`contentDrafts.channels.${CHANNEL_KEYS[idx]}`);
    return channel;
  };

  const getDraftTypeLabel = (dtype: string): string => {
    const idx = DRAFT_TYPES.indexOf(dtype);
    if (idx >= 0) return t(`contentDrafts.draftTypes.${DRAFT_TYPE_KEYS[idx]}`);
    return dtype;
  };

  const getSourceTypeLabel = (stype: string): string => {
    const idx = SOURCE_TYPES.indexOf(stype);
    if (idx >= 0) return t(`contentDrafts.sourceTypes.${SOURCE_TYPE_KEYS[idx]}`);
    return stype;
  };

  // Fetch drafts
  useEffect(() => {
    fetchDrafts();
  }, []);

  const fetchDrafts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from(TABLES.aiContentDrafts)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Failed to fetch drafts:', error.message);
    }
    setDrafts((data as Draft[]) ?? []);
    setLoading(false);
  };

  // Metrics
  const metrics = useMemo(() => {
    const total = drafts.length;
    const pending = drafts.filter((d) => d.status === 'draft').length;
    const approved = drafts.filter((d) => d.status === 'approved').length;
    const published = drafts.filter((d) => d.status === 'published').length;
    return { total, pending, approved, published };
  }, [drafts]);

  // Filtered drafts
  const filteredDrafts = useMemo(() => {
    if (statusFilter === 'all') return drafts;
    return drafts.filter((d) => d.status === statusFilter);
  }, [drafts, statusFilter]);

  // Create draft
  const handleCreate = async () => {
    if (!formTitle.trim()) {
      toast.error(t('contentDrafts.titleRequired'));
      return;
    }
    if (!user) {
      toast.error(t('contentDrafts.mustBeLoggedIn'));
      return;
    }

    setSubmitting(true);

    const { data: authData } = await supabase.auth.getUser();
    const uid = authData?.user?.id;

    const { error } = await supabase.from(TABLES.aiContentDrafts).insert({
      title: formTitle.trim(),
      content: formContent.trim() || null,
      source_url: formSourceUrl.trim() || null,
      source_type: formSourceType,
      suggested_channel: formChannel,
      language: formLanguage.trim() || 'English',
      tags: formTags.trim() || null,
      status: 'draft',
      draft_type: formDraftType,
      created_by: uid ?? null,
    });

    setSubmitting(false);

    if (error) {
      toast.error(t('contentDrafts.createFailed'), { description: error.message });
      return;
    }

    toast.success(t('contentDrafts.createSuccess'));
    resetForm();
    setShowCreateForm(false);
    fetchDrafts();
  };

  const resetForm = () => {
    setFormTitle('');
    setFormContent('');
    setFormSourceUrl('');
    setFormSourceType('Manual');
    setFormChannel(CHANNELS[0]);
    setFormLanguage('English');
    setFormTags('');
    setFormDraftType('Technical post');
  };

  // Update draft status
  const updateStatus = async (draft: Draft, newStatus: string) => {
    const { error } = await supabase
      .from(TABLES.aiContentDrafts)
      .update({ status: newStatus })
      .eq('id', draft.id);

    if (error) {
      toast.error(t('contentDrafts.statusUpdateFailed'), { description: error.message });
      return;
    }

    toast.success(t('contentDrafts.statusUpdated', { status: newStatus }));
    setSelectedDraft({ ...draft, status: newStatus });
    fetchDrafts();
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('contentDrafts.eyebrow')}
        title={t('contentDrafts.title')}
        description={t('contentDrafts.descriptionFull')}
        actions={
          <Button
            onClick={() => setShowCreateForm(true)}
            className="bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            {t('contentDrafts.createDraft')}
          </Button>
        }
      />

      {/* ─── Metrics Cards ─── */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {[
          { label: t('contentDrafts.totalDrafts'), value: metrics.total, icon: FileText, color: 'text-zinc-300' },
          { label: t('contentDrafts.pendingReview'), value: metrics.pending, icon: Clock, color: 'text-yellow-400' },
          { label: t('contentDrafts.approved'), value: metrics.approved, icon: CheckCircle2, color: 'text-emerald-400' },
          { label: t('contentDrafts.published'), value: metrics.published, icon: Send, color: 'text-blue-400' },
        ].map((m) => (
          <div
            key={m.label}
            className="group border border-zinc-800/80 bg-[#0d0d0d] p-4 rounded-sm hover:border-zinc-700 transition-all duration-300"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-2xl font-bold ${m.color} tabular-nums`}>{m.value}</p>
                <p className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 mt-1 font-medium">
                  {m.label}
                </p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-sm bg-[#f59e0b]/10 border border-[#f59e0b]/20">
                <m.icon className="h-4 w-4 text-[#f59e0b]" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Status Filter Tabs ─── */}
      <div className="flex items-center gap-2 border-b border-zinc-800/60 pb-3">
        {['all', 'draft', 'approved', 'published', 'rejected'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-sm text-xs font-medium transition-all duration-200 ${
              statusFilter === s
                ? 'bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/30'
                : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
            }`}
          >
            {s === 'all'
              ? t('contentDrafts.all')
              : s === 'draft'
                ? t('contentDrafts.draft')
                : s === 'approved'
                  ? t('contentDrafts.approved')
                  : s === 'published'
                    ? t('contentDrafts.published')
                    : t('contentDrafts.rejected')}
          </button>
        ))}
      </div>

      {/* ─── Draft List ─── */}
      {loading ? (
        <div className="grid gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="border border-zinc-800/60 bg-[#0d0d0d] p-5 rounded-sm animate-pulse">
              <div className="space-y-3">
                <div className="h-5 w-48 bg-zinc-800 rounded-sm" />
                <div className="flex gap-3">
                  <div className="h-4 w-24 bg-zinc-800/50 rounded-sm" />
                  <div className="h-4 w-20 bg-zinc-800/50 rounded-sm" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredDrafts.length === 0 ? (
        <div className="border border-zinc-800/60 bg-[#0d0d0d] rounded-sm p-10 text-center">
          <FileText className="h-10 w-10 text-zinc-700 mx-auto mb-3" />
          <p className="text-sm text-zinc-500">{t('contentDrafts.noDraftsFound')}</p>
          <p className="text-xs text-zinc-600 mt-1">{t('contentDrafts.noDraftsDesc')}</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredDrafts.map((draft) => (
            <button
              key={draft.id}
              onClick={() => setSelectedDraft(draft)}
              className="group text-left w-full border border-zinc-800/80 bg-[#0d0d0d] p-5 rounded-sm hover:border-[#f59e0b]/40 transition-all duration-300 hover:shadow-lg hover:shadow-[#f59e0b]/5"
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-zinc-100 group-hover:text-[#f59e0b] transition-colors">
                      {draft.title || t('contentDrafts.untitledDraft')}
                    </h3>
                    <StatusBadge status={draft.status} />
                    {draft.draft_type && (
                      <span className="px-1.5 py-0.5 text-[9px] uppercase tracking-wider border border-zinc-700 text-zinc-500 rounded-sm">
                        {getDraftTypeLabel(draft.draft_type)}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                    {draft.suggested_channel && (
                      <span className="flex items-center gap-1">
                        <Layers className="h-3 w-3" />
                        {getChannelLabel(draft.suggested_channel)}
                      </span>
                    )}
                    {draft.language && (
                      <span className="flex items-center gap-1">
                        <Globe className="h-3 w-3" />
                        {draft.language}
                      </span>
                    )}
                    {draft.source_type && (
                      <span className="flex items-center gap-1">
                        <Sparkles className="h-3 w-3" />
                        {getSourceTypeLabel(draft.source_type)}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDate(draft.created_at)}
                    </span>
                  </div>
                </div>
                <div className="text-zinc-600 group-hover:text-[#f59e0b] transition-colors">
                  <ExternalLink className="h-4 w-4" />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ─── Draft Detail Panel (Modal) ─── */}
      {selectedDraft && (
        <div className="fixed inset-0 z-50" onClick={() => setSelectedDraft(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" />
          <div
            className="absolute top-0 right-0 h-full w-full max-w-[520px] bg-[#0a0a0a] border-l border-zinc-800 shadow-2xl animate-in slide-in-from-right duration-300 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 space-y-5">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="space-y-1 flex-1">
                  <h2 className="text-lg font-semibold text-zinc-100">
                    {selectedDraft.title || t('contentDrafts.untitledDraft')}
                  </h2>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={selectedDraft.status} />
                    {selectedDraft.draft_type && (
                      <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider border border-zinc-700 text-zinc-500 rounded-sm">
                        {getDraftTypeLabel(selectedDraft.draft_type)}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedDraft(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-all"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Meta info */}
              <div className="grid grid-cols-2 gap-3">
                {selectedDraft.suggested_channel && (
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 font-medium">{t('contentDrafts.channel')}</p>
                    <p className="text-xs text-zinc-300 flex items-center gap-1.5">
                      <Layers className="h-3 w-3 text-[#f59e0b]" />
                      {getChannelLabel(selectedDraft.suggested_channel)}
                    </p>
                  </div>
                )}
                {selectedDraft.language && (
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 font-medium">{t('contentDrafts.language')}</p>
                    <p className="text-xs text-zinc-300 flex items-center gap-1.5">
                      <Globe className="h-3 w-3 text-[#f59e0b]" />
                      {selectedDraft.language}
                    </p>
                  </div>
                )}
                {selectedDraft.source_type && (
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 font-medium">{t('contentDrafts.sourceType')}</p>
                    <p className="text-xs text-zinc-300">{getSourceTypeLabel(selectedDraft.source_type)}</p>
                  </div>
                )}
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 font-medium">{t('contentDrafts.created')}</p>
                  <p className="text-xs text-zinc-300">{formatDate(selectedDraft.created_at)}</p>
                </div>
              </div>

              {/* Source URL */}
              {selectedDraft.source_url && (
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 font-medium">{t('contentDrafts.sourceUrl')}</p>
                  <a
                    href={selectedDraft.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[#f59e0b] hover:text-[#d97706] flex items-center gap-1 transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {selectedDraft.source_url}
                  </a>
                </div>
              )}

              {/* Tags */}
              {selectedDraft.tags && (
                <div className="space-y-1.5">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 font-medium">{t('contentDrafts.tags')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedDraft.tags.split(',').map((tag, i) => (
                      <span
                        key={i}
                        className="flex items-center gap-1 px-2 py-0.5 text-[10px] bg-zinc-800/60 text-zinc-400 border border-zinc-700/50 rounded-full"
                      >
                        <Tag className="h-2.5 w-2.5" />
                        {tag.trim()}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Content */}
              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 font-medium">{t('contentDrafts.content')}</p>
                <div className="border border-zinc-800/60 bg-zinc-950/50 rounded-sm p-4 max-h-[300px] overflow-y-auto">
                  <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
                    {selectedDraft.content || t('contentDrafts.noContent')}
                  </p>
                </div>
              </div>

              {/* Platform Update specific fields */}
              {selectedDraft.draft_type === 'Platform update' && (
                <div className="border border-[#f59e0b]/20 bg-[#f59e0b]/5 rounded-sm p-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#f59e0b]">
                    <Megaphone className="h-3.5 w-3.5" />
                    {t('contentDrafts.platformUpdateFormat')}
                  </div>
                  <p className="text-[10px] text-zinc-500">
                    {t('contentDrafts.platformUpdateHint')}
                  </p>
                </div>
              )}

              {/* User suggestion response specific fields */}
              {selectedDraft.draft_type === 'User suggestion response' && (
                <div className="border border-emerald-500/20 bg-emerald-500/5 rounded-sm p-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {t('contentDrafts.suggestionResponse')}
                  </div>
                  <p className="text-[10px] text-zinc-500">
                    {t('contentDrafts.suggestionResponseHint')}
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-zinc-800/60">
                {selectedDraft.status !== 'approved' && selectedDraft.status !== 'published' && (
                  <Button
                    onClick={() => updateStatus(selectedDraft, 'approved')}
                    className="bg-emerald-600 text-white hover:bg-emerald-700 font-medium"
                    size="sm"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                    {t('contentDrafts.approve')}
                  </Button>
                )}
                {selectedDraft.status !== 'rejected' && (
                  <Button
                    onClick={() => updateStatus(selectedDraft, 'rejected')}
                    variant="outline"
                    className="border-red-500/30 text-red-400 hover:bg-red-500/10 !bg-transparent"
                    size="sm"
                  >
                    <XCircle className="h-3.5 w-3.5 mr-1.5" />
                    {t('contentDrafts.reject')}
                  </Button>
                )}
                {selectedDraft.status === 'approved' && (
                  <Button
                    onClick={() => updateStatus(selectedDraft, 'published')}
                    className="bg-blue-600 text-white hover:bg-blue-700 font-medium"
                    size="sm"
                  >
                    <Send className="h-3.5 w-3.5 mr-1.5" />
                    {t('contentDrafts.markPublished')}
                  </Button>
                )}
                {(selectedDraft.status === 'rejected' || selectedDraft.status === 'published') && (
                  <Button
                    onClick={() => updateStatus(selectedDraft, 'draft')}
                    variant="outline"
                    className="border-zinc-700 text-zinc-400 !bg-transparent hover:!bg-zinc-900"
                    size="sm"
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                    {t('contentDrafts.resetToDraft')}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Create Draft Modal ─── */}
      {showCreateForm && (
        <div className="fixed inset-0 z-50" onClick={() => setShowCreateForm(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" />
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[600px] max-h-[90vh] bg-[#0a0a0a] border border-zinc-800 rounded-lg shadow-2xl animate-in zoom-in-95 duration-200 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 space-y-5">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f59e0b]/10 border border-[#f59e0b]/20">
                    <Plus className="h-4 w-4 text-[#f59e0b]" />
                  </div>
                  <h3 className="text-sm font-semibold text-zinc-100">{t('contentDrafts.createDraft')}</h3>
                </div>
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-all"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Form */}
              <div className="space-y-4">
                {/* Title */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-semibold">
                    {t('contentDrafts.title')} <span className="text-red-400">*</span>
                  </label>
                  <Input
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder={t('contentDrafts.titlePlaceholder')}
                    className="bg-zinc-950 border-zinc-800 text-zinc-200 focus:border-[#f59e0b]/50"
                  />
                </div>

                {/* Content */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-semibold">{t('contentDrafts.content')}</label>
                  <textarea
                    value={formContent}
                    onChange={(e) => setFormContent(e.target.value)}
                    placeholder={t('contentDrafts.contentPlaceholder')}
                    rows={6}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-md text-sm text-zinc-200 p-3 focus:border-[#f59e0b]/50 focus:outline-none focus:ring-1 focus:ring-[#f59e0b]/20 resize-none transition-colors"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* Channel */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-semibold">{t('contentDrafts.channel')}</label>
                    <select
                      value={formChannel}
                      onChange={(e) => setFormChannel(e.target.value)}
                      className="w-full h-9 bg-zinc-950 border border-zinc-800 rounded-md text-xs text-zinc-300 px-2.5 focus:border-[#f59e0b]/50 focus:outline-none transition-colors"
                    >
                      {CHANNELS.map((c, i) => (
                        <option key={c} value={c}>{t(`contentDrafts.channels.${CHANNEL_KEYS[i]}`)}</option>
                      ))}
                    </select>
                  </div>

                  {/* Draft Type */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-semibold">{t('contentDrafts.draftType')}</label>
                    <select
                      value={formDraftType}
                      onChange={(e) => setFormDraftType(e.target.value)}
                      className="w-full h-9 bg-zinc-950 border border-zinc-800 rounded-md text-xs text-zinc-300 px-2.5 focus:border-[#f59e0b]/50 focus:outline-none transition-colors"
                    >
                      {DRAFT_TYPES.map((dt, i) => (
                        <option key={dt} value={dt}>{t(`contentDrafts.draftTypes.${DRAFT_TYPE_KEYS[i]}`)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* Source Type */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-semibold">{t('contentDrafts.sourceType')}</label>
                    <select
                      value={formSourceType}
                      onChange={(e) => setFormSourceType(e.target.value)}
                      className="w-full h-9 bg-zinc-950 border border-zinc-800 rounded-md text-xs text-zinc-300 px-2.5 focus:border-[#f59e0b]/50 focus:outline-none transition-colors"
                    >
                      {SOURCE_TYPES.map((st, i) => (
                        <option key={st} value={st}>{t(`contentDrafts.sourceTypes.${SOURCE_TYPE_KEYS[i]}`)}</option>
                      ))}
                    </select>
                  </div>

                  {/* Language */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-semibold">{t('contentDrafts.language')}</label>
                    <Input
                      value={formLanguage}
                      onChange={(e) => setFormLanguage(e.target.value)}
                      placeholder={t('contentDrafts.languagePlaceholder')}
                      className="bg-zinc-950 border-zinc-800 text-zinc-200 text-xs h-9 focus:border-[#f59e0b]/50"
                    />
                  </div>
                </div>

                {/* Source URL */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-semibold">{t('contentDrafts.sourceUrl')}</label>
                  <Input
                    value={formSourceUrl}
                    onChange={(e) => setFormSourceUrl(e.target.value)}
                    placeholder={t('contentDrafts.sourceUrlPlaceholder')}
                    className="bg-zinc-950 border-zinc-800 text-zinc-200 text-xs focus:border-[#f59e0b]/50"
                  />
                </div>

                {/* Tags */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-semibold">{t('contentDrafts.tags')}</label>
                  <Input
                    value={formTags}
                    onChange={(e) => setFormTags(e.target.value)}
                    placeholder={t('contentDrafts.tagsPlaceholder')}
                    className="bg-zinc-950 border-zinc-800 text-zinc-200 text-xs focus:border-[#f59e0b]/50"
                  />
                </div>

                {/* Platform Update hint */}
                {formDraftType === 'Platform update' && (
                  <div className="border border-[#f59e0b]/20 bg-[#f59e0b]/5 rounded-sm p-3 space-y-1">
                    <p className="text-[10px] font-semibold text-[#f59e0b] flex items-center gap-1.5">
                      <Megaphone className="h-3 w-3" />
                      {t('contentDrafts.platformUpdateTip')}
                    </p>
                    <p className="text-[10px] text-zinc-500">
                      {t('contentDrafts.platformUpdateTipDesc')}
                    </p>
                  </div>
                )}

                {formDraftType === 'User suggestion response' && (
                  <div className="border border-emerald-500/20 bg-emerald-500/5 rounded-sm p-3 space-y-1">
                    <p className="text-[10px] font-semibold text-emerald-400 flex items-center gap-1.5">
                      <MessageSquare className="h-3 w-3" />
                      {t('contentDrafts.suggestionResponseTip')}
                    </p>
                    <p className="text-[10px] text-zinc-500">
                      {t('contentDrafts.suggestionResponseTipDesc')}
                    </p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2 border-t border-zinc-800/60">
                <Button
                  onClick={handleCreate}
                  disabled={submitting || !formTitle.trim()}
                  className="bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold"
                >
                  {submitting ? t('contentDrafts.creating') : t('contentDrafts.createDraft')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { resetForm(); setShowCreateForm(false); }}
                  className="border-zinc-700 text-zinc-400 !bg-transparent hover:!bg-zinc-900"
                >
                  {t('contentDrafts.cancel')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}