import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { getAppBaseUrl } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${getAppBaseUrl()}/reset-password`,
    });
    setLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    setSent(true);
    toast.success(t('auth.resetEmailSent'));
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-[#0a0a0a] text-zinc-100">
      {/* Left panel - same branding as Login */}
      <div className="hidden lg:flex flex-col justify-center border-r border-zinc-800/80 bg-[#0d0d0d] px-12 py-10 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(#f59e0b 1px, transparent 1px), linear-gradient(90deg, #f59e0b 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-[#f59e0b]/[0.03] blur-3xl pointer-events-none" />

        <div className="relative flex flex-col items-start space-y-8">
          <div className="w-full flex justify-start">
            <img
              src="/assets/logos/logo-horizontal.png"
              alt="PipingBox"
              width={200}
              height={200}
              className="w-[200px] h-[200px] object-contain drop-shadow-[0_0_30px_rgba(245,158,11,0.15)]"
            />
          </div>
          <div className="h-px w-20 bg-gradient-to-r from-[#f59e0b] to-transparent" />
          <h1 className="text-4xl font-bold leading-tight tracking-tight">
            {t('auth.heroHeadline')}
          </h1>
          <p className="max-w-md text-sm text-zinc-400 leading-relaxed">
            {t('auth.heroSubline')}
          </p>
          <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-600 pt-4">
            {t('auth.footerTagline')}
          </p>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md space-y-6">
          <div className="lg:hidden mb-4">
            <img
              src="https://mgx-backend-cdn.metadl.com/generate/images/747553/2026-05-19/o3sycyqaagpa/logo-horizontal_variant_1.png"
              alt="PipingBox"
              width={200}
              height={200}
              className="w-[200px] h-[200px] object-contain"
            />
          </div>

          {sent ? (
            <div className="space-y-6 text-center">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                </div>
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">{t('auth.resetEmailSentTitle')}</h2>
                <p className="text-sm text-zinc-400">
                  {t('auth.resetEmailSentDesc', { email })}
                </p>
              </div>
              <div className="space-y-3 pt-4">
                <p className="text-xs text-zinc-500">{t('auth.checkSpamFolder')}</p>
                <Button
                  variant="outline"
                  onClick={() => setSent(false)}
                  className="w-full h-11 border-zinc-700 text-zinc-300 hover:bg-zinc-900"
                >
                  {t('auth.resendEmail')}
                </Button>
              </div>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 text-sm text-[#f59e0b] hover:underline font-medium"
              >
                <ArrowLeft className="w-4 h-4" />
                {t('auth.backToLogin')}
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-6">
              <div className="space-y-3">
                <p className="text-[10px] uppercase tracking-[0.3em] text-[#f59e0b]">
                  {t('auth.passwordRecovery')}
                </p>
                <h2 className="text-3xl font-bold">{t('auth.forgotPasswordTitle')}</h2>
                <p className="text-sm text-zinc-400">
                  {t('auth.forgotPasswordDesc')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs uppercase tracking-wider text-zinc-400">
                  {t('common.email')}
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11 pl-10 bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b] focus-visible:border-[#f59e0b]"
                    placeholder={t('auth.emailPlaceholder')}
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold tracking-wide transition-all duration-200 hover:shadow-lg hover:shadow-amber-500/20"
              >
                {loading ? t('common.sending') : t('auth.sendResetLink')}
              </Button>

              <p className="text-center">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 text-sm text-[#f59e0b] hover:underline font-medium"
                >
                  <ArrowLeft className="w-4 h-4" />
                  {t('auth.backToLogin')}
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}