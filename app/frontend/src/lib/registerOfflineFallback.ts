/**
 * PB-ANDROID-PLAYSTORE-001 — register the offline-fallback service worker
 * (public/sw.js) ONLY when running inside the Android TWA.
 *
 * Why channel-gated: the web channel intentionally has no service worker
 * (PB-PWA-UPDATE-CACHE-001 pending; stale-version detection in appVersion.ts
 * assumes index.html always comes from the network). The TWA quality
 * criteria, however, require that an offline navigation does not surface the
 * browser error page. sw.js is navigation-only and caches nothing but
 * /offline.html, so registering it does not change update semantics.
 *
 * Fail-open: any error is swallowed; the app must never break because of this.
 */
import { isAndroidTwa } from './appChannel';
import { logger } from './logger';

export const OFFLINE_FALLBACK_SW_URL = '/sw.js';

export function shouldRegisterOfflineFallback(
  channelIsAndroid: boolean,
  hasServiceWorkerApi: boolean,
  isSecureContext: boolean,
): boolean {
  return channelIsAndroid && hasServiceWorkerApi && isSecureContext;
}

export function registerOfflineFallback(): void {
  try {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
    const ok = shouldRegisterOfflineFallback(
      isAndroidTwa(),
      'serviceWorker' in navigator,
      window.isSecureContext === true,
    );
    if (!ok) return;
    const register = () => {
      navigator.serviceWorker
        .register(OFFLINE_FALLBACK_SW_URL, { scope: '/' })
        .catch((err: unknown) => logger.warn('[twa] offline fallback SW registration failed (swallowed)', err));
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  } catch (err) {
    logger.warn('[twa] offline fallback registration error (swallowed)', err);
  }
}
