import { useTranslation } from 'react-i18next';
import { RefreshCw, TriangleAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppVersionCheck } from '@/hooks/useAppVersionCheck';

/**
 * PB-AUTH-CALLBACK-STALE-APP-001 (Fase 3) — non-blocking banner shown when
 * the running bundle differs from the deployed /version.json. The update is
 * always user-initiated; after a controlled reload that did NOT fix the
 * mismatch it switches to manual recovery instructions instead of reloading
 * again (sessionStorage marker — no reload loops).
 */
export function AppUpdateBanner() {
  const { t } = useTranslation();
  const { updateAvailable, persistentMismatch, dismissed, requestUpdate, dismiss } =
    useAppVersionCheck();

  if (!updateAvailable || dismissed) return null;

  return (
    <div
      role="alert"
      data-testid="app-update-banner"
      className="fixed inset-x-0 bottom-0 z-[100] border-t border-amber-500/40 bg-[#16110a]/95 px-4 py-3 backdrop-blur"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          {persistentMismatch ? (
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          ) : (
            <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          )}
          <div>
            <p className="text-sm font-semibold text-zinc-100">
              {persistentMismatch
                ? t('appUpdate.persistedTitle')
                : t('appUpdate.title')}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">
              {persistentMismatch
                ? t('appUpdate.persistedDescription')
                : t('appUpdate.description')}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!persistentMismatch && (
            <Button
              type="button"
              size="sm"
              onClick={() => void requestUpdate()}
              className="bg-[#f59e0b] font-semibold text-black hover:bg-[#d97706]"
            >
              {t('appUpdate.updateButton')}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label={t('appUpdate.later')}
            onClick={dismiss}
            className="h-8 w-8 p-0 text-zinc-400 hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
