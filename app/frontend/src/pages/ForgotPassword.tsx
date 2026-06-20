import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { getAuthRedirectUrl } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { PipingBoxLogo } from '@/components/PipingBoxLogo';
import { ArrowLeft, Mail, CheckCircle2 } from 'lucide-react';

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: getAuthRedirectUrl('/dashboard'),
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSent(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-zinc-100 p-6">
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="mb-2">
          <img
            src="/assets/logos/logo-horizontal.png"
            alt="PipingBox"
            className="w-[200px] h-auto"
          />
        </div>

        {sent ? (
          /* ─── Success state ─── */
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-emerald-500 shrink-0" />
              <h2 className="text-2xl font-bold">{t('auth.resetEmailSentTitle', 'Check your email')}</h2>
            </div>
            <p className="text-sm text-zinc-400 leading-relaxed">
              {t('auth.resetEmailSentDesc', 'We sent a password reset link to')}
              {' '}<span className="text-zinc-200 font-medium">{email}</span>.
              {' '}{t('auth.resetEmailSentCheck', 'Check your inbox and spam folder.')}
            </p>
            <div className="border border-zinc-800/60 rounded-sm bg-[#0d0d0d] p-4">
              <p className="text-xs text-zinc-500 leading-relaxed">
                {t('auth.resetEmailSentNote', "Didn't receive it? Check your spam folder or try again with a different email.")}
              </p>
            </div>
            <div className="flex flex-col gap-3 pt-2">
              <Button
                onClick={() => setSent(false)}
                variant="outline"
                className="w-full h-11 border-zinc-800 bg-zinc-950 hover:bg-zinc-900 text-zinc-300"
              >
                <Mail className="h-4 w-4 mr-2" />
                {t('auth.tryAnotherEmail', 'Try another email')}
              </Button>
              <Link
                to="/login"
                className="text-center text-sm text-[#f59e0b] hover:underline font-medium"
              >
                <ArrowLeft className="inline h-3.5 w-3.5 mr-1" />
                {t('auth.backToLogin', 'Return to Login')}
              </Link>
            </div>
          </div>
        ) : (
          /* ─── Form state ─── */
          <form onSubmit={onSubmit} className="space-y-6">
            <div className="space-y-3">
              <p className="text-[10px] uppercase tracking-[0.3em] text-[#f59e0b]">
                {t('auth.passwordRecovery', 'Password recovery')}
              </p>
              <h2 className="text-3xl font-bold">
                {t('auth.forgotPasswordTitle', 'Forgot your password?')}
              </h2>
              <p className="text-sm text-zinc-400">
                {t('auth.forgotPasswordSubtitle', "Enter your email and we'll send you a link to reset your password.")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs uppercase tracking-wider text-zinc-400">
                {t('common.email')}
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b] focus-visible:border-[#f59e0b]"
                placeholder={t('auth.emailPlaceholder')}
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold tracking-wide transition-all duration-200 hover:shadow-lg hover:shadow-amber-500/20"
            >
              {loading
                ? t('common.sending', 'Sending...')
                : t('auth.sendResetLink', 'Send reset link')}
            </Button>

            <p className="text-center text-sm text-zinc-400">
              <Link
                to="/login"
                className="text-[#f59e0b] hover:underline font-medium"
              >
                <ArrowLeft className="inline h-3.5 w-3.5 mr-1" />
                {t('auth.backToLogin', 'Return to Login')}
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
