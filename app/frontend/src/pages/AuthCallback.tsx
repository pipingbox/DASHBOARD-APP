import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, CircleAlert } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { safeAuthNextPath } from '@/lib/authFlow';
import { getCorrelationId, trackEvent } from '@/lib/observability';
import { Button } from '@/components/ui/button';

export default function AuthCallback() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [provider, setProvider] = useState<'email' | 'google'>('email');

  useEffect(() => {
    let active = true;
    let redirectTimer: number | undefined;

    const completeCallback = async () => {
      const nextPath = safeAuthNextPath(searchParams.get('next'));
      const language = searchParams.get('lng');
      const flow = searchParams.get('flow');
      const code = searchParams.get('code');
      let sessionResult = await supabase.auth.getSession();

      if (!sessionResult.data.session && code) {
        const exchangeResult = await supabase.auth.exchangeCodeForSession(code);
        sessionResult = {
          data: { session: exchangeResult.data.session },
          error: exchangeResult.error,
        };
      }

      const cleanParams = new URLSearchParams();
      if (language) cleanParams.set('lng', language);
      if (flow === 'confirmation' || flow === 'google') cleanParams.set('flow', flow);
      const cleanQuery = cleanParams.size > 0 ? `?${cleanParams.toString()}` : '';
      window.history.replaceState({}, document.title, `/auth/callback${cleanQuery}`);

      if (!active) return;
      if (sessionResult.error || !sessionResult.data.session) {
        trackEvent('email_confirmation_completed', {
          route: '/auth/callback',
          correlation_id: getCorrelationId(),
          provider: 'email',
          status: 'failed',
          reason_code: 'invalid_callback',
        });
        setStatus('error');
        return;
      }

      const authenticatedProvider = flow === 'google' ? 'google' : 'email';
      setProvider(authenticatedProvider);
      setStatus('success');
      if (authenticatedProvider === 'email') {
        trackEvent('email_confirmation_completed', {
          route: '/auth/callback',
          correlation_id: getCorrelationId(),
          provider: 'email',
          status: 'completed',
        });
      }
      redirectTimer = window.setTimeout(() => {
        navigate(nextPath, { replace: true });
      }, 2200);
    };

    void completeCallback();
    return () => {
      active = false;
      if (redirectTimer) window.clearTimeout(redirectTimer);
    };
  }, [navigate, searchParams]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0a0a0a] p-5 text-zinc-100">
      <section className="w-full max-w-md rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-8 text-center shadow-2xl">
        {status === 'processing' && (
          <>
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-[#f59e0b] border-t-transparent" />
            <h1 className="mt-6 text-xl font-bold">{t('auth.authCallbackProcessing')}</h1>
            <p className="mt-2 text-sm text-zinc-400">{t('auth.authCallbackProcessingDesc')}</p>
          </>
        )}

        {status === 'success' && (
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

        {status === 'error' && (
          <>
            <CircleAlert className="mx-auto h-14 w-14 text-red-400" />
            <h1 className="mt-6 text-2xl font-bold">{t('auth.authCallbackErrorTitle')}</h1>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              {t('auth.authCallbackErrorDescription')}
            </p>
            <Button
              type="button"
              onClick={() => navigate('/login', { replace: true })}
              className="mt-6 h-11 w-full bg-[#f59e0b] font-semibold text-black hover:bg-[#d97706]"
            >
              {t('auth.backToLogin')}
            </Button>
          </>
        )}
      </section>
    </main>
  );
}
