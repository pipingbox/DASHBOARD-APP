/**
 * PB-JOBS-ATTRIBUTION-001: channel presets for campaign share links.
 *
 * The initial list covers the Facebook groups PIPINGBOX already belongs to
 * (§3), but the model is generic: any channel (telegram, linkedin, whatsapp,
 * …) can declare sources, mediums and groups here without code changes
 * elsewhere. Visible labels keep their original characters; ONLY the
 * utm_content identifier is normalized (lowercase ASCII snake_case, stable
 * over time — §2).
 */

export interface ChannelGroup {
  /** Original visible group name (any script). */
  label: string;
  /** Normalized, stable utm_content identifier. */
  utmContent: string;
}

export interface ChannelPreset {
  /** utm_source value. */
  source: string;
  /** Visible channel label. */
  label: string;
  /** Common utm_medium values for this channel. */
  mediums: string[];
  /** Known groups/channels/pages for this source. */
  groups: ChannelGroup[];
}

export const CHANNEL_PRESETS: ChannelPreset[] = [
  {
    source: 'facebook',
    label: 'Facebook',
    mediums: ['group', 'post', 'page', 'organic'],
    groups: [
      { label: 'Українці в Бельгії. Turnhout, Antwerpen, Brussels, Gent...', utmContent: 'ukrainians_belgium_turnhout_antwerpen' },
      { label: 'Polacy w Belgii', utmContent: 'polacy_w_belgii' },
      { label: 'Українці в Бельгії | Робота • Оренда • Допомога', utmContent: 'ukrainians_belgium_jobs' },
      { label: 'Portugueses na Bélgica', utmContent: 'portugueses_na_belgica' },
      { label: 'Italiani in Belgio', utmContent: 'italiani_in_belgio' },
      { label: 'Brasileiros na Bélgica', utmContent: 'brasileiros_na_belgica' },
      { label: 'Români în Belgia', utmContent: 'romani_in_belgia' },
      { label: 'Belgia - Ogłoszenia / Praca', utmContent: 'belgia_ogloszenia_praca' },
      { label: 'Españoles en Bélgica', utmContent: 'espanoles_en_belgica' },
      { label: 'ITALIANI IN BELGIO', utmContent: 'italiani_in_belgio_2' },
      { label: 'PRACA - BELGIA - OGŁOSZENIA', utmContent: 'praca_belgia_ogloszenia' },
      { label: 'Polacy w Belgii - praca na umowie belgijskiej', utmContent: 'polacy_belgii_praca_umowa_belgijska' },
      { label: 'Latinos y Hispanos en Amberes', utmContent: 'latinos_hispanos_antwerpen' },
      { label: 'ESPAÑOLES EN AMBERES', utmContent: 'espanoles_antwerpen' },
      { label: 'lassers onder elkaar, zoek opdrachten, lasklus...', utmContent: 'lassers_onder_elkaar' },
      { label: 'Lassers Pijpfitters BE/NL', utmContent: 'lassers_pijpfitters_be_nl' },
      { label: 'ESPAÑOLES EN BELGICA', utmContent: 'espanoles_en_belgica_2' },
      { label: 'Españoles y amigos de españoles en amberes', utmContent: 'espanoles_amigos_antwerpen' },
    ],
  },
  {
    source: 'telegram',
    label: 'Telegram',
    mediums: ['group', 'channel', 'post'],
    groups: [],
  },
  {
    source: 'linkedin',
    label: 'LinkedIn',
    mediums: ['post', 'group', 'organic'],
    groups: [],
  },
  {
    source: 'whatsapp',
    label: 'WhatsApp',
    mediums: ['group', 'messaging'],
    groups: [],
  },
];

/** Normalize any label to a stable ASCII snake_case utm identifier (§2). */
export function toUtmSlug(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_')
    .slice(0, 128);
}

/**
 * Suggested campaign slug for a job: company + city + first meaningful title
 * word, e.g. "Mechanic / Electromechanical Mechanic" @ UMICORE, Antwerpen →
 * "umicore_antwerpen_mechanic". Editable in the share dialog — the suggestion
 * is deterministic, not canonical.
 */
export function campaignSlugFromJob(company: string, location: string, title: string): string {
  const city = (location ?? '').split(',')[0]?.trim() ?? '';
  const firstWord =
    title
      .split(/[\s/–—-]+/)
      .find((w) => /^[A-Za-zÀ-ÿ]{3,}$/.test(w.trim())) ?? '';
  return toUtmSlug([company, city, firstWord].filter(Boolean).join(' '));
}

/**
 * Build a campaign URL for a job (§1). Only generic campaign identifiers —
 * never PII (§13).
 */
export function buildCampaignUrl(
  jobUrl: string,
  source: string,
  medium: string,
  campaign: string,
  utmContent?: string,
): string {
  const params = new URLSearchParams({
    utm_source: source,
    utm_medium: medium,
    utm_campaign: campaign,
  });
  if (utmContent) params.set('utm_content', utmContent);
  return `${jobUrl}?${params.toString()}`;
}
