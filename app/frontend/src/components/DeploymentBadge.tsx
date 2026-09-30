import { useTranslation } from 'react-i18next';
import { getAppVersion, getEnvironment } from '@/lib/observability';

/**
 * PB-PWA-IDENTITY-001: shows which deployment and which build the current
 * surface is actually running.
 *
 * Preview and production are intentionally on different commits, and the
 * installed PWA and the browser can each be pinned to a different one. Without
 * a visible build marker a tester cannot tell whether a difference is a bug or
 * simply an older deployment — which is exactly what happened during the
 * Layer 3 language validation.
 *
 * Rendered ONLY outside production, so the canonical production UI is
 * unchanged. The SHA is truncated to 7 chars, matching how the deploy runs and
 * Brain tickets quote it.
 */
export function DeploymentBadge() {
  const { t } = useTranslation();
  const environment = getEnvironment();

  if (environment === 'production') return null;

  const version = getAppVersion();
  const shortVersion = /^[0-9a-f]{40}$/i.test(version) ? version.slice(0, 7) : version;
  const label = t('deploymentBadge.label', { environment, build: shortVersion });

  return (
    <div
      data-testid="deployment-badge"
      title={label}
      aria-label={label}
      className="pointer-events-none fixed bottom-1 left-1 z-[100] select-none rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] leading-none tracking-tight text-amber-300/80 ring-1 ring-amber-500/25 backdrop-blur-sm"
    >
      {environment.toUpperCase()} · {shortVersion}
    </div>
  );
}
