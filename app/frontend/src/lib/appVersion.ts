/**
 * PB-AUTH-CALLBACK-STALE-APP-001 (Fase 3) — stale app version detection.
 *
 * There is NO service worker (proven during discovery: no registration code,
 * no sw.js asset is served — only a web manifest for install identity). A
 * stale app is therefore a long-lived tab still running an old in-memory
 * bundle: content-hashed assets mean a plain reload always fetches the new
 * index.html → new bundle. This module detects the mismatch against
 * /version.json (generated at build with the deployed SHA) and drives a
 * CONTROLLED, user-initiated, loop-safe update.
 */

export const VERSION_CHECK_MIN_INTERVAL_MS = 60_000;
export const VERSION_CHECK_INITIAL_DELAY_MS = 3_000;
const RELOAD_MARKER_KEY = 'pb_app_update_reload_marker';
/** A marker older than this is considered stale and ignored. */
const RELOAD_MARKER_MAX_AGE_MS = 10 * 60_000;

/** Semver, git SHA (40/7-hex), 'dev' — closed shape, never free text. */
const VERSION_VALUE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export interface RemoteVersionPayload {
  version: string;
}

/** Parse and validate the remote version payload. Null on anything odd. */
export function parseVersionPayload(text: string): RemoteVersionPayload | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const version = (parsed as Record<string, unknown>).version;
    if (typeof version !== 'string' || !VERSION_VALUE_RE.test(version)) return null;
    return { version };
  } catch {
    return null;
  }
}

export function isVersionMismatch(localVersion: string, remoteVersion: string): boolean {
  if (!localVersion || !remoteVersion) return false;
  return localVersion !== remoteVersion;
}

export function shouldCheckVersion(lastCheckAt: number | null, now: number): boolean {
  if (lastCheckAt === null) return true;
  return now - lastCheckAt >= VERSION_CHECK_MIN_INTERVAL_MS;
}

// ---------------------------------------------------------------------------
// Reload marker (sessionStorage) — loop protection for the controlled update.
// ---------------------------------------------------------------------------

export interface ReloadMarker {
  targetVersion: string;
  at: number;
}

export function readReloadMarker(now: number): ReloadMarker | null {
  try {
    const raw = sessionStorage.getItem(RELOAD_MARKER_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<ReloadMarker>;
      if (
        typeof parsed.targetVersion !== 'string' ||
        typeof parsed.at !== 'number' ||
        !VERSION_VALUE_RE.test(parsed.targetVersion) ||
        now - parsed.at > RELOAD_MARKER_MAX_AGE_MS ||
        now - parsed.at < 0
      ) {
        sessionStorage.removeItem(RELOAD_MARKER_KEY);
        return null;
      }
      return { targetVersion: parsed.targetVersion, at: parsed.at };
    } catch {
      // Corrupt payload: drop it so it can never block a future update.
      sessionStorage.removeItem(RELOAD_MARKER_KEY);
      return null;
    }
  } catch {
    return null;
  }
}

export function writeReloadMarker(targetVersion: string, now: number): void {
  try {
    sessionStorage.setItem(
      RELOAD_MARKER_KEY,
      JSON.stringify({ targetVersion, at: now } satisfies ReloadMarker),
    );
  } catch {
    // sessionStorage unavailable (private mode quirks): the update still
    // proceeds; the marker only guards against repeat reloads.
  }
}

export function clearReloadMarker(): void {
  try {
    sessionStorage.removeItem(RELOAD_MARKER_KEY);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Pending update-event relay. posthog-js 1.429.4 has no public flush() and
// its batch interval cannot deliver an event captured right before a
// location.reload() (empirically verified: the event never reaches the
// wire). So the user's update request is persisted and emitted exactly once
// on the next boot, where the normal flush cadence delivers it.
// ---------------------------------------------------------------------------

const PENDING_UPDATE_EVENT_KEY = 'pb_app_update_pending_event';

export function writePendingUpdateEvent(): boolean {
  try {
    sessionStorage.setItem(PENDING_UPDATE_EVENT_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

/** Consume the pending update request. True exactly once after a reload. */
export function consumePendingUpdateEvent(): boolean {
  try {
    if (sessionStorage.getItem(PENDING_UPDATE_EVENT_KEY) !== '1') return false;
    sessionStorage.removeItem(PENDING_UPDATE_EVENT_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * After a user-initiated reload, a persistent mismatch must NOT trigger
 * another automatic reload. True → show manual recovery instructions.
 */
export function isMismatchPersistent(marker: ReloadMarker | null, remoteVersion: string): boolean {
  return Boolean(marker && marker.targetVersion === remoteVersion);
}

/**
 * Fetch the remote version. `fetchImpl` injectable for tests.
 * `cache: 'no-store'` bypasses the browser HTTP cache; the URL also carries
 * a cache-busting timestamp because the preview deployment serves static
 * assets without going through the Worker (no custom headers there).
 */
export async function fetchRemoteVersion(
  fetchImpl: typeof fetch = fetch,
): Promise<RemoteVersionPayload | null> {
  try {
    const res = await fetchImpl(`/version.json?t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return parseVersionPayload(await res.text());
  } catch {
    return null;
  }
}
