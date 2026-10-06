import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, CircleAlert, Copy, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { safeAuthNextPath } from '@/lib/authFlow';
import {
  AUTH_CALLBACK_TIMEOUT_MS,
  processAuthCallbackOnce,
  probeSession,
  resetAuthCallbackRun,
} from '@/lib/authCallbackFlow';
import { getCorrelationId, trackEvent } from '@/lib/observability';
import { Button } from '@/components/ui/button';

type CallbackScreen = 'processing' | 'success' | 'recovery';

/**
 * PB-AUTH-CALLBACK-STALE-APP-001 (Fase 2) — deterministic, bounded callback.
 *
 * The previous implementation had no timeout, so a hanging supabase-js call
 * (getSession/exchangeCodeForSession acquire navigator.locks with no timeout
 * while the client's own detectSessionInUrl races for the same OAuth code)
 * left users on an infinite "Completando el acceso" spinner even though the
 * session had been created server-side. Now:
 *
 * - the return is processed EXACTLY once per page lifecycle (memoized
 *   in-flight promise — StrictMode-safe, no double code exchange);
 * - an overall ~9 s deadline cuts any hang, then re-checks the canonical
 *   session once before declaring failure (late sessions still navigate);
 * - failure shows a recoverable screen (recheck / home / login + copiable
 *   incident code) instead of an infinite spinner;
 * - `next` is validated against the closed internal allowlist;
 * - navigation is an immediate replace to the allowed destination.
 */
export default function AuthCallback() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [screen, setScreen] = useState<CallbackScreen>('processing');
  const [provider, setProvider] = useState<'email' | 'google'>('email');
  const [recheckBusy, setRecheckBusy] = useState(false);
  const [recheckFailed, setRecheckFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const startedTracked = useRef(false);

  const correlationId = getCorrelationId();

  useEffect(() => {
    const nextPath = safeAuthNextPath(searchParams.get('next'));
    const language = searchParams.get('lng');
    const flow = searchParams.get('flow');
    const code = searchParams.get('code');
    const authProvider: 'email' | 'google' = flow === 'google' ? 'google' : 'email';

    // Clean the URL immediately (idempotent re-runs and refreshes must never
    // re-exchange the one-shot OAuth code). Query is preserved for sharing.
    const cleanParams = new URLSearchParams();
    if (language) cleanParams.set('lng', language);
    if (flow === 'confirmation' || flow === 'google') cleanParams.set('flow', flow);
    const cleanQuery = cleanParams.size > 0 ? `?${cleanParams.toString()}` : '';
    window.history.replaceState({}, document.title, `/auth/callback${cleanQuery}`);

    if (!startedTracked.current) {
      startedTracked.current = true;
      trackEvent('auth_callback_started', {
        route: '/auth/callback',
        correlation_id: correlationId,
        provider: authProvider,
      });
    }

    let active = true;

    void processAuthCallbackOnce(
      { nextPath, code, provider: authProvider },
      {
        getSession: () => supabase.auth.getSession(),
        exchangeCodeForSession: (oauthCode) => supabase.auth.exchangeCodeForSession(oauthCode),
      },
    ).then((outcome) => {
      if (!active) return;
      if (outcome.status === 'navigating') {
        setProvider(outcome.provider);
        trackEvent('auth_callback_completed', {
          route: '/auth/callback',
          correlation_id: correlationId,
          provider: outcome.provider,
          duration_ms: outcome.durationMs,
        });
        // Brief success confirmation, then immediate replace navigation.
        setScreen('success');
        window.setTimeout(() => {
          if (active) navigate(outcome.nextPath, { replace: true });
        }, 600);
        return;
      }
      // Failure: closed category, safe UI, recoverable actions.
      const timedOut = outcome.errorCategory === 'callback_timeout';
      trackEvent(timedOut ? 'auth_callback_timeout' : 'auth_callback_failed', {
        route: '/auth/callback',
        correlation_id: correlationId,
        provider: outcome.provider,
        duration_ms: outcome.durationMs,
        error_category: outcome.errorCategory,
        recovery_action: 'recheck_or_relogin',
      });
      setProvider(outcome.provider);
      setScreen('recovery');
    });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const handleRecheck = async () => {
    setRecheckBusy(true);
    setRecheckFailed(false);
    const hasSession = await probeSession({ getSession: () => supabase.auth.getSession() });
    if (hasSession) {
      trackEvent('auth_callback_completed', {
        route: '/auth/callback',
        correlation_id: correlationId,
        provider,
        duration_ms: AUTH_CALLBACK_TIMEOUT_MS,
      });
      resetAuthCallbackRun();
      navigate(safeAuthNextPath(searchParams.get('next')), { replace: true });
      return;
    }
    setRecheckBusy(false);
    setRecheckFailed(true);
  };

  const handleCopyIncident = async () => {
    try {
      await navigator.clipboard.writeText(correlationId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable: the code stays selectable on screen.
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0a0a0a] p-5 text-zinc-100">
      <section className="w-full max-w-md rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-8 text-center shadow-2xl">
        {screen === 'processing' && (
          <>
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-[#f59e0b] border-t-transparent" />
            <h1 className="mt-6 text-xl font-bold">{t('auth.authCallbackProcessing')}</h1>
            <p className="mt-2 text-sm text-zinc-400">{t('auth.authCallbackProcessingDesc')}</p>
          </>
        )}

        {screen === 'success' && (
          <>
            <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-400" />
            <h1 className="mt-6 text-2xl font-bold">
              {t(
                provider === 'google'
                  ? 'auth.oauthSuccessTitle'
                  : 'auth.confirmationSuccessTitle',
              )}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              {t(
                provider === 'google'
                  ? 'auth.oauthSuccessDescription'
                  : 'auth.confirmationSuccessDescription',
              )}
            </p>
          </>
        )}

        {screen === 'recovery' && (
          <>
            <CircleAlert className="mx-auto h-14 w-14 text-amber-400" />
            <h1 className="mt-6 text-2xl font-bold">{t('auth.callbackRecoveryTitle')}</h1>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              {t('auth.callbackRecoveryDescription')}
            </p>

            {recheckFailed && (
              <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
                {t('auth.callbackRecheckFailed')}
              </p>
            )}

            <div className="mt-5 space-y-2">
              <Button
                type="button"
                disabled={recheckBusy}
                onClick={() => void handleRecheck()}
                className="h-11 w-full bg-[#f59e0b] font-semibold text-black hover:bg-[#d97706]"
              >
                {recheckBusy ? t('auth.authCallbackProcessing') : t('auth.callbackRecheck')}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/', { replace: true })}
                className="h-11 w-full border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-800"
              >
                {t('auth.callbackGoHome')}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/login', { replace: true })}
                className="h-11 w-full border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-800"
              >
                {t('auth.callbackRelogin')}
              </Button>
            </div>

            <button
              type="button"
              onClick={() => void handleCopyIncident()}
              className="mt-5 inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 font-mono text-xs text-zinc-400 transition-colors hover:text-zinc-200"
              title={t('auth.callbackIncidentCode')}
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              {correlationId.slice(0, 18)}…
            </button>
          </>
        )}
      </section>
    </main>
  );
}
