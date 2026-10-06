/**
 * PB-AUTH-CALLBACK-STALE-APP-001 (Fase 4) — safe path normalization.
 *
 * WhatsApp and other messengers append invisible Unicode format characters
 * (category Cf: U+2060 WORD JOINER, U+200B..U+200D zero-width family,
 * U+FEFF BOM, U+00AD soft hyphen...) to shared links. React Router compares
 * pathnames literally, so "/profile%E2%81%A0" misses the "/profile" route
 * and renders the 404 UI.
 *
 * Rules (deliberately narrow):
 * - The pathname is decoded once (percent-encoded Cf chars like %E2%81%A0
 *   are the incident's exact form), then Cf characters are stripped ONLY at
 *   path boundaries: the start, the end, and the edges around "/"
 *   separators. Characters INSIDE a segment are never touched, so an
 *   arbitrary contaminated path is never transformed into a different valid
 *   route.
 * - A redirect happens only when the cleaned path is a KNOWN canonical route
 *   (validated against the shared SPA route contract) AND the original was
 *   not.
 * - Query strings are preserved untouched by the caller.
 */

import { matchSpaRoute } from '../../../../SPA_ROUTE_CONTRACT';

/** Unicode "Format" (Cf) characters that render as nothing. */
const FORMAT_CHARS_RE = /[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u206A-\u206F\uFEFF]/;

function isFormatChar(ch: string): boolean {
  return FORMAT_CHARS_RE.test(ch);
}

function safeDecode(pathname: string): string {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

/**
 * Strip invisible format characters from path boundaries only:
 * path start, path end, and both sides of every "/" separator.
 */
export function stripBoundaryFormatChars(pathname: string): string {
  if (!pathname) return pathname;
  let start = 0;
  while (start < pathname.length && isFormatChar(pathname[start])) start++;
  let end = pathname.length;
  while (end > start && isFormatChar(pathname[end - 1])) end--;
  if (start === end) return '';
  const middle = pathname.slice(start, end);
  // Remove format chars hugging "/" separators: "/\u2060profile" and
  // "profile\u2060/" both normalize; chars INSIDE a segment stay.
  return middle.replace(
    /[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u206A-\u206F\uFEFF]*\/[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u206A-\u206F\uFEFF]*/g,
    '/',
  );
}

/**
 * Decide whether a contaminated pathname should redirect to a canonical
 * route. Returns the clean target (pathname only) or null when the path
 * must be left alone (already canonical, or unknown after cleaning).
 */
export function normalizeContaminatedPath(pathname: string): string | null {
  if (!pathname || pathname === '/') return null;
  // Already a known canonical route: nothing to do.
  if (matchSpaRoute(pathname)) return null;
  const decoded = safeDecode(pathname);
  const cleaned = stripBoundaryFormatChars(decoded);
  if (!cleaned || cleaned === decoded) return null;
  // Only redirect when the cleaned path is a KNOWN route — arbitrary
  // contaminated paths keep rendering the regular 404.
  if (!matchSpaRoute(cleaned)) return null;
  return cleaned;
}
