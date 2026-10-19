/**
 * PB-ANDROID-PLAYSTORE-001 — app channel detection (web vs Android TWA).
 *
 * The Android app "PIPINGBOX — Industrial Tools" is a Trusted Web Activity
 * (Bubblewrap) that opens https://pipingbox.com/tools?pb_app=android. The
 * same SPA serves both channels, so the frontend needs a cheap, deterministic
 * way to know that it is running inside the Android app in order to:
 *
 *   1. Hide flows that Google Play policy forbids inside the app (links to
 *      external checkout for digital goods — Payments policy §"Alternative
 *      billing"); the Stripe upgrade banner in /tools is the only one today.
 *   2. Differentiate Android traffic from web traffic in PostHog
 *      (super-property `app_channel`), without duplicating events.
 *
 * Detection signals, in priority order (all cheap, no network):
 *   a. `?pb_app=android` in the URL (start URL / shortcuts of the TWA).
 *   b. `document.referrer` starting with `android-app://<package>/` — set by
 *      Android on the first TWA navigation.
 *   c. A flag persisted in sessionStorage by (a) or (b), so the channel
 *      survives SPA navigation without leaking into ordinary browser tabs.
 *
 * Nothing here is PII: the only stored value is the channel enum.
 *
 * NOTE: relative imports only (no '@/') so Playwright specs can import this
 * module without Vite alias resolution — same pattern as observability.ts.
 */

export const APP_CHANNELS = ['web', 'android_twa'] as const;
export type AppChannel = (typeof APP_CHANNELS)[number];

export const ANDROID_PACKAGE_ID = 'com.pipingbox.tools';
export const APP_CHANNEL_QUERY_PARAM = 'pb_app';
export const APP_CHANNEL_QUERY_VALUE = 'android';
export const APP_CHANNEL_STORAGE_KEY = 'pipingbox_app_channel';

export interface ChannelSignals {
  search?: string | null;
  referrer?: string | null;
  stored?: string | null;
}

/** Pure: resolve the channel from raw signals. */
export function resolveAppChannel(signals: ChannelSignals): AppChannel {
  const search = signals.search ?? '';
  if (search) {
    try {
      const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
      if (params.get(APP_CHANNEL_QUERY_PARAM) === APP_CHANNEL_QUERY_VALUE) return 'android_twa';
    } catch {
      /* malformed query: ignore */
    }
  }
  const referrer = signals.referrer ?? '';
  if (referrer.startsWith(`android-app://${ANDROID_PACKAGE_ID}/`)) return 'android_twa';
  if (signals.stored === 'android_twa') return 'android_twa';
  return 'web';
}

let cached: AppChannel | null = null;

function readStored(): string | null {
  try {
    return window.sessionStorage.getItem(APP_CHANNEL_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persist(channel: AppChannel): void {
  try {
    if (channel === 'android_twa') window.sessionStorage.setItem(APP_CHANNEL_STORAGE_KEY, channel);
  } catch {
    /* storage unavailable (private mode / quota): channel stays in memory */
  }
}

/**
 * Current channel for this browsing context, memoized after the first call.
 * The Android flag is scoped to this tab and never persists into a separate
 * browser tab sharing the same origin.
 */
export function getAppChannel(): AppChannel {
  if (cached) return cached;
  if (typeof window === 'undefined') return 'web';
  const channel = resolveAppChannel({
    search: window.location.search,
    referrer: typeof document !== 'undefined' ? document.referrer : null,
    stored: readStored(),
  });
  persist(channel);
  cached = channel;
  return channel;
}

export function isAndroidTwa(): boolean {
  return getAppChannel() === 'android_twa';
}

/** Test hook. */
export function __resetAppChannelForTests(): void {
  cached = null;
}
