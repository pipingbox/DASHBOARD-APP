import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { normalizeContaminatedPath } from '@/lib/pathNormalize';
import { normalizeRoute, trackEvent } from '@/lib/observability';

/**
 * PB-AUTH-CALLBACK-STALE-APP-001 (Fase 4) — client-side guard for links
 * contaminated with invisible Unicode format characters (e.g. WhatsApp
 * appending U+2060 WORD JOINER: "/profile%E2%81%A0"). When stripping those
 * characters at path boundaries yields a KNOWN canonical route, redirect
 * (replace, no history entry) to the clean path preserving the query string.
 * Unknown contaminated paths keep rendering the regular 404 — nothing
 * arbitrary is turned into a valid route.
 */
export function PathNormalizer() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const target = normalizeContaminatedPath(location.pathname);
    if (target === null) return;
    trackEvent('invalid_path_normalized', {
      route_normalized: normalizeRoute(target),
    });
    navigate(
      { pathname: target, search: location.search },
      { replace: true },
    );
  }, [location.pathname, location.search, navigate]);

  return null;
}
