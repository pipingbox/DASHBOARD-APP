import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { PipingBoxLogo } from '@/components/PipingBoxLogo';

export default function Login() {
  const { t } = useTranslation();
  const { signIn, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      setErrorMsg(error);
      toast.error(error);
      return;
    }
    toast.success(t('auth.welcomeBackToast'));
    navigate('/dashboard', { replace: true });
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg('');
    setGoogleLoading(true);
    const { error } = await signInWithGoogle();
    setGoogleLoading(false);
    if (error) {
      setErrorMsg(error);
      toast.error(error);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-[#0a0a0a] text-zinc-100">
      <div className="hidden lg:flex flex-col justify-center border-r border-zinc-800/80 bg-[#0d0d0d] px-12 py-10 relative overflow-hidden">
        {/* Industrial grid background */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(#f59e0b 1px, transparent 1px), linear-gradient(90deg, #f59e0b 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        {/* Radial glow behind logo */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-[#f59e0b]/[0.03] blur-3xl pointer-events-none" />

        <div className="relative flex flex-col items-start space-y-8">
          {/* Logo - dominant visual element */}
          <div className="w-full flex justify-start">
            <img
              src="/assets/logos/logo-horizontal.png"
              alt="PipingBox"
              className="w-[310px] h-auto drop-shadow-[0_0_30px_rgba(245,158,11,0.15)]"
            />
          </div>

          {/* Accent line */}
          <div className="h-px w-20 bg-gradient-to-r from-[#f59e0b] to-transparent" />

          {/* Headline */}
          <h1 className="text-4xl font-bold leading-tight tracking-tight">
            {t('auth.heroHeadline')}
          </h1>

          {/* Subline */}
          <p className="max-w-md text-sm text-zinc-400 leading-relaxed">
            {t('auth.heroSubline')}
          </p>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-6 pt-6 border-t border-zinc-800/60 w-full">
            {[
              { label: 'Academy', value: '120+' },
              { label: 'Tools', value: '30+' },
              { label: 'Jobs', value: 'Live' },
            ].map((s) => (
              <div key={s.label}>
                <p className="text-2xl font-bold text-[#f59e0b]">{s.value}</p>
                <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                  {s.label}
                </p>
              </div>
            ))}
          </div>

          {/* Footer tagline */}
          <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-600 pt-4">
            {t('auth.footerTagline')}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center p-6 lg:p-12">
        <form onSubmit={onSubmit} className="w-full max-w-md space-y-6">
          <div className="space-y-3">
            {/* Mobile branding — compact version of the desktop sidebar */}
            <div className="lg:hidden mb-6 space-y-4">
              <img
                src="/assets/logos/logo-horizontal.png"
                alt="PipingBox"
                className="w-[200px] h-auto"
              />
              <h1 className="text-lg font-bold leading-snug">
                {t('auth.heroHeadline')}
              </h1>
              <div className="flex items-center gap-4 text-xs">
                {[
                  { label: 'Academy', value: '120+' },
                  { label: 'Tools', value: '30+' },
                  { label: 'Jobs', value: 'Live' },
                ].map((s) => (
                  <div key={s.label} className="flex items-center gap-1.5">
                    <span className="text-[#f59e0b] font-bold">{s.value}</span>
                    <span className="text-zinc-500 uppercase tracking-wider text-[9px]">{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-[#f59e0b]">
              {t('auth.secureAccess')}
            </p>
            <h2 className="text-3xl font-bold">{t('auth.signInTitle')}</h2>
            <p className="text-sm text-zinc-400">
              {t('auth.signInSubtitle')}
            </p>
          </div>

          {/* Google Sign-In Button */}
          <Button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading}
            aria-label={t('auth.continueWithGoogle')}
            className="w-full h-11 bg-zinc-900 border border-zinc-700 text-zinc-100 hover:bg-zinc-800 hover:border-zinc-600 hover:shadow-md transition-all duration-200 font-medium tracking-wide flex items-center justify-center gap-3"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            {googleLoading ? '...' : t('auth.continueWithGoogle')}
          </Button>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-800" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-[#0a0a0a] px-3 text-zinc-500 uppercase tracking-wider">
                {t('auth.orContinueWith')}
              </span>
            </div>
          </div>

          <div className="space-y-4">
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
            <div className="space-y-2">
              <Label
                htmlFor="password"
                className="text-xs uppercase tracking-wider text-zinc-400"
              >
                {t('common.password')}
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b] focus-visible:border-[#f59e0b]"
                placeholder="••••••••"
              />
              <div className="flex justify-end">
                <Link
                  to="/forgot-password"
                  className="text-xs text-zinc-500 hover:text-[#f59e0b] transition-colors"
                >
                  {t('auth.forgotPassword', 'Forgot password?')}
                </Link>
              </div>
            </div>
          </div>

          {/* Accessible error announcement */}
          <div aria-live="assertive" aria-atomic="true" className="sr-only">
            {errorMsg}
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-11 bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold tracking-wide transition-all duration-200 hover:shadow-lg hover:shadow-amber-500/20"
          >
            {loading ? t('common.signingIn') : t('common.signIn')}
          </Button>

          <p className="text-center text-sm text-zinc-400">
            {t('auth.noAccount')}{' '}
            <Link
              to="/register"
              className="text-[#f59e0b] hover:underline font-medium"
            >
              {t('auth.createOne')}
            </Link>
          </p>

          {/* Legal footer links */}
          <p className="text-center text-[11px] text-zinc-600 pt-2">
            <Link to="/terms" className="hover:text-zinc-400 transition">
              {t('auth.termsOfService')}
            </Link>
            <span className="mx-2">·</span>
            <Link to="/privacy" className="hover:text-zinc-400 transition">
              {t('auth.privacyPolicy')}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}