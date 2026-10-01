import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Check, Link2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  buildCampaignUrl,
  campaignSlugFromJob,
  CHANNEL_PRESETS,
  toUtmSlug,
} from '@/lib/jobs/channelPresets';

interface ShareLinksDialogProps {
  job: { id: string; title: string; company: string; location: string } | null;
  onClose: () => void;
}

/**
 * PB-JOBS-ATTRIBUTION-001 §4: minimal campaign-link generator for a job.
 * Source/medium from channel presets, campaign prefilled from the job
 * (editable), destination group from the preset list or a custom slug.
 * No external URL shortening (§4/§16).
 */
export function ShareLinksDialog({ job, onClose }: ShareLinksDialogProps) {
  const { t } = useTranslation();
  const [source, setSource] = useState('facebook');
  const [medium, setMedium] = useState('group');
  const [campaign, setCampaign] = useState('');
  const [group, setGroup] = useState('');
  const [customContent, setCustomContent] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const preset = CHANNEL_PRESETS.find((p) => p.source === source) ?? CHANNEL_PRESETS[0];

  useEffect(() => {
    if (!job) return;
    setSource('facebook');
    setMedium('group');
    setCampaign(campaignSlugFromJob(job.company, job.location, job.title));
    setGroup(preset.groups[0]?.utmContent ?? '');
    setCustomContent('');
    setCopied(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id]);

  const jobUrl = job ? `${window.location.origin}/jobs/${job.id}` : '';
  const utmContent = group === 'custom' ? toUtmSlug(customContent) : group || undefined;
  const url = useMemo(
    () => (job && campaign ? buildCampaignUrl(jobUrl, source, medium, toUtmSlug(campaign), utmContent) : ''),
    [job, jobUrl, source, medium, campaign, utmContent],
  );

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      // clipboard unavailable (permissions): user can still select the text
    }
  };

  const allFacebookLinks = useMemo(() => {
    if (!job || !campaign) return '';
    const fb = CHANNEL_PRESETS.find((p) => p.source === 'facebook');
    if (!fb) return '';
    return fb.groups
      .map((g) => buildCampaignUrl(jobUrl, 'facebook', 'group', toUtmSlug(campaign), g.utmContent))
      .join('\n');
  }, [job, jobUrl, campaign]);

  const inputCls =
    'w-full rounded-sm border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-200 focus:border-zinc-500 focus:outline-none';
  const labelCls = 'block text-[10px] uppercase tracking-wider text-zinc-500 mb-1 font-medium';

  return (
    <Dialog open={!!job} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg border-zinc-800 bg-zinc-950">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm text-zinc-100">
            <Link2 className="h-4 w-4 text-zinc-400" />
            {t('shareLinks.title')}
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-500">
            {job?.title} — {job?.company}
          </DialogDescription>
        </DialogHeader>

        {job && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{t('shareLinks.source')}</label>
                <select
                  value={source}
                  onChange={(e) => {
                    setSource(e.target.value);
                    const p = CHANNEL_PRESETS.find((c) => c.source === e.target.value);
                    setMedium(p?.mediums[0] ?? 'group');
                    setGroup(p?.groups[0]?.utmContent ?? '');
                  }}
                  className={inputCls}
                >
                  {CHANNEL_PRESETS.map((p) => (
                    <option key={p.source} value={p.source}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>{t('shareLinks.medium')}</label>
                <select value={medium} onChange={(e) => setMedium(e.target.value)} className={inputCls}>
                  {preset.mediums.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className={labelCls}>{t('shareLinks.campaign')}</label>
              <input
                value={campaign}
                onChange={(e) => setCampaign(e.target.value)}
                className={inputCls}
                placeholder="umicore_antwerpen_mechanic"
              />
            </div>

            <div>
              <label className={labelCls}>{t('shareLinks.group')}</label>
              <select value={group} onChange={(e) => setGroup(e.target.value)} className={inputCls}>
                {preset.groups.length === 0 && <option value="">{t('shareLinks.noGroups')}</option>}
                {preset.groups.map((g) => (
                  <option key={g.utmContent} value={g.utmContent}>
                    {g.label}
                  </option>
                ))}
                <option value="custom">{t('shareLinks.customGroup')}</option>
              </select>
              {group === 'custom' && (
                <input
                  value={customContent}
                  onChange={(e) => setCustomContent(e.target.value)}
                  className={`${inputCls} mt-2`}
                  placeholder={t('shareLinks.customGroupPlaceholder')}
                />
              )}
            </div>

            <div>
              <label className={labelCls}>{t('shareLinks.url')}</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-sm border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[11px] text-zinc-400">
                  {url || '—'}
                </code>
                <button
                  type="button"
                  onClick={() => void copy(url, 'one')}
                  disabled={!url}
                  className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-zinc-700 px-2.5 py-1.5 text-[10px] font-medium text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition disabled:opacity-50"
                >
                  {copied === 'one' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  {copied === 'one' ? t('shareLinks.copied') : t('shareLinks.copyLink')}
                </button>
              </div>
            </div>

            {source === 'facebook' && preset.groups.length > 0 && (
              <button
                type="button"
                onClick={() => void copy(allFacebookLinks, 'all')}
                className="inline-flex items-center gap-1 rounded-sm border border-blue-500/40 px-2.5 py-1.5 text-[10px] font-medium text-blue-400 hover:bg-blue-500/10 transition"
              >
                {copied === 'all' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                {copied === 'all' ? t('shareLinks.copied') : t('shareLinks.copyAllFacebook')}
              </button>
            )}

            <p className="text-[10px] text-zinc-600">{t('shareLinks.note')}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
