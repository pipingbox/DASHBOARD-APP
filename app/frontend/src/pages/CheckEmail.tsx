import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Clock3, MailCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { CONFIRMATION_RESEND_COOLDOWN_SECONDS, maskEmail } from '@/lib/authFlow';
import { Button } from '@/components/ui/button';

interface CheckEmailState {
  email?: string;
  isNewUser?: boolean;
}

export default function CheckEmail() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { resendConfirmation, hasActiveSession } = useAuth();
  const state = (location.state as CheckEmailState | null) ?? {};
  const email = state.email ?? '';
  const isNewUser = state.isNewUser === true;
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const handleResend = async () => {
    if (!email || resending || cooldown > 0) return;
    setResending(true);
    const { errorCode } = await resendConfirmation(email);
    setResending(false);
    setCooldown(CONFIRMATION_RESEND_COOLDOWN_SECONDS);
    if (errorCode === 'rate_limit') {
      toast.error(t('auth.confirmationRateLimited'));
      return;
    }
    if (errorCode) {
      toast.error(t('auth.confirmationResendNeutral'));
      return;
    }
    toast.success(t('auth.confirmationResent'));
  };

  const handleAlreadyConfirmed = async () => {
    if (await hasActiveSession()) {
      navigate('/dashboard', { replace: true });
      return;
    }
    toast.info(t('auth.confirmationSignInRequired'));
    navigate('/login', { replace: true });
  };

  return (
    <main className="min-h-screen bg-[#0a0a0a] px-5 py-10 text-zinc-100">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-lg items-center">
        <section className="w-full rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-6 shadow-2xl sm:p-8">
          <img
            src="/assets/logos/logo-horizontal.png"
            alt="PipingBox"
            width={180}
            height={72}
            className="mb-6 h-auto w-[180px] object-contain"
          />

          <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-full border border-[#f59e0b]/30 bg-[#f59e0b]/10">
            <MailCheck className="h-7 w-7 text-[#f59e0b]" />
          </div>

          {isNewUser && (
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-[#f59e0b]">
              {t('auth.registrationCompleted')}
            </p>
          )}

          <h1 className="text-2xl font-bold sm:text-3xl">
            {t(isNewUser ? 'auth.accountCreatedTitle' : 'auth.checkEmailTitle')}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            {t(isNewUser ? 'auth.accountCreatedDescription' : 'auth.checkEmailDescription')}
          </p>

          {email && (
            <p className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-300">
              {t('auth.confirmationSentTo', { email: maskEmail(email) })}
            </p>
          )}

          <p className="mt-4 text-xs leading-relaxed text-zinc-500">
            {t('auth.confirmationCheckSpam')}
          </p>

          <div className="mt-5 flex items-center gap-2 text-xs text-amber-300">
            <Clock3 className="h-4 w-4" />
            <span>{t('auth.waitingForConfirmation')}</span>
          </div>

          <div className="mt-7 space-y-3">
            <Button
              type="button"
              onClick={() => {
                window.location.href = 'mailto:';
              }}
              className="h-11 w-full bg-[#f59e0b] font-semibold text-black hover:bg-[#d97706]"
            >
              {t('auth.openEmail')}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!email || resending || cooldown > 0}
              onClick={handleResend}
              className="h-11 w-full border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
            >
              {cooldown > 0
                ? t('auth.resendCountdown', { seconds: cooldown })
                : t('auth.resendConfirmation')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={handleAlreadyConfirmed}
              className="h-11 w-full text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100"
            >
              {t('auth.alreadyConfirmed')}
            </Button>
          </div>

          <div className="mt-6 flex flex-col items-center gap-3 text-sm sm:flex-row sm:justify-center sm:gap-5">
            <Link to="/register" className="text-[#f59e0b] hover:underline">
              {t('auth.changeEmail')}
            </Link>
            <Link to="/login" className="text-zinc-400 hover:text-zinc-200 hover:underline">
              {t('auth.backToLogin')}
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}