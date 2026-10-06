import { useCallback, useEffect, useRef, useState } from 'react';
import {
  VERSION_CHECK_INITIAL_DELAY_MS,
  clearReloadMarker,
  fetchRemoteVersion,
  isMismatchPersistent,
  isVersionMismatch,
  readReloadMarker,
  shouldCheckVersion,
  writeReloadMarker,
} from '@/lib/appVersion';
import { getAppVersion, flushObservability, normalizeRoute, trackEvent } from '@/lib/observability';

export interface AppVersionState {
  /** Remote version differs from the running bundle. */
  updateAvailable: boolean;
  /** A controlled reload already happened and the mismatch persists. */
  persistentMismatch: boolean;
  /** User dismissed the banner for this tab lifecycle. */
  dismissed: boolean;
  requestUpdate: () => void;
  dismiss: () => void;
}

/**
 * PB-AUTH-CALLBACK-STALE-APP-001 (Fase 3) — compares the running
 * VITE_APP_VERSION against /version.json on app start, when the tab becomes
 * visible again, and on focus (throttled to one check per minute). Never
 * reloads automatically: the update is user-initiated and loop-protected via
 * a sessionStorage marker.
 */
export function useAppVersionCheck(): AppVersionState {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [persistentMismatch, setPersistentMismatch] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const lastCheckAt = useRef<number | null>(null);
  const checking = useRef(false);
  const detectedVersion = useRef<string | null>(null);

  const check = useCallback(async () => {
    if (checking.current) return;
    checking.current = true;
    try {
      const local = getAppVersion();
      const remote = await fetchRemoteVersion();
      lastCheckAt.current = Date.now();
      if (!remote) return;
      const mismatch = isVersionMismatch(local, remote.version);
      if (!mismatch) {
        // Running build matches the deployed build: clear any stale marker
        // and any stale banner.
        clearReloadMarker();
        detectedVersion.current = null;
        setUpdateAvailable(false);
        setPersistentMismatch(false);
        return;
      }
      const marker = readReloadMarker(Date.now());
      const persistent = isMismatchPersistent(marker, remote.version);
      if (detectedVersion.current !== remote.version) {
        // One detection event per remote version per page lifecycle.
        detectedVersion.current = remote.version;
        trackEvent('stale_app_version_detected', {
          route: normalizeRoute(window.location.pathname),
          target_version: remote.version,
        });
      }
      setPersistentMismatch(persistent);
      setUpdateAvailable(true);
      // A fresh check (app start, tab back to visible, focus after the 60s
      // throttle) re-shows the banner even if the user dismissed it earlier:
      // "later" means "not now", not "never".
      setDismissed(false);
    } finally {
      checking.current = false;
    }
  }, []);

  useEffect(() => {
    // Initial check, delayed so it never competes with app boot / auth.
    const initial = setTimeout(() => {
      void check();
    }, VERSION_CHECK_INITIAL_DELAY_MS);

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && shouldCheckVersion(lastCheckAt.current, Date.now())) {
        void check();
      }
    };
    const onFocus = () => {
      if (shouldCheckVersion(lastCheckAt.current, Date.now())) {
        void check();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    return () => {
      clearTimeout(initial);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [check]);

  const requestUpdate = useCallback(async () => {
    // Loop protection: mark, then reload once. If the mismatch persists
    // after the reload the banner switches to manual instructions and NO
    // further automatic reload ever happens.
    trackEvent('app_update_requested', {
      route: normalizeRoute(window.location.pathname),
      recovery_action: 'update_app',
    });
    writeReloadMarker(detectedVersion.current ?? 'unknown', Date.now());
    // Best-effort telemetry flush so the update request is not lost in the
    // controlled reload (fail-open: the reload always proceeds).
    await flushObservability();
    window.location.reload();
  }, []);

  const dismiss = useCallback(() => setDismissed(true), []);

  return {
    updateAvailable,
    persistentMismatch,
    dismissed,
    requestUpdate,
    dismiss,
  };
}
