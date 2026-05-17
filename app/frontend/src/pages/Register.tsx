import { FormEvent, useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { storeReferralCode, getStoredReferralCode } from '@/lib/referrals';
import { PipingBoxLogo } from '@/components/PipingBoxLogo';

type AccountType = 'worker' | 'company';

export default function Register() {
  const { t } = useTranslation();
  const { signUp, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [accountType, setAccountType] = useState<AccountType>('worker');
  const [referralCode, setReferralCode] = useState<string | null>(null);

  // Capture referral code from URL and persist it
  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref) {
      setReferralCode(ref);
      storeReferralCode(ref);
    } else {
      const stored = getStoredReferralCode();
      if (stored) {
        setReferralCode(stored);
      }
    }
  }, [searchParams]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error(t('auth.passwordTooShort'));
      return;
    }
    setLoading(true);

    if (referralCode) {
      storeReferralCode(referralCode);
    }

    const { error } = await signUp(email, password, fullName, accountType);
    setLoading(false);
    if (error) {
      toast.error(error);
      return;
    }

    toast.success(t('auth.accountCreatedToast'));
    navigate('/dashboard', { replace: true });
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    if (referralCode) {
      storeReferralCode(referralCode);
    }
    const { error } = await signInWithGoogle(accountType);
    setGoogleLoading(false);
    if (error) {
      toast.error(error);
    }
  };

  const features = [
    t('auth.featureAcademy'),
    t('auth.featureTools'),
    t('auth.featureJobs'),
    t('auth.featureCommunity'),
  ];

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-[#0a0a0a] text-zinc-100">
      {/* Left side - Form */}
      <div className="flex items-center justify-center p-6 lg:p-12 order-2 lg:order-1">
        <div className="w-full max-w-md space-y-6">
          <div className="space-y-3">
            <div className="lg:hidden mb-4">
              <img
                src="/assets/logos/logo-horizontal.png"
                alt="PipingBox"
                className="w-[200px] h-auto"
              />
            </div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-[#f59e0b]">
              {t('auth.joinPipingBox')}
            </p>
            <h2 className="text-3xl font-bold">{t('auth.signUpTitle')}</h2>
            <p className="text-sm text-zinc-400">
              {t('auth.signUpSubtitle')}
            </p>
          </div>

          {/* Account Type Selector */}
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-wider text-zinc-400 font-medium">
              {t('auth.selectAccountType')}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setAccountType('worker')}
                className={`relative p-4 rounded-lg border text-left transition-all duration-200 ease-out hover:scale-[1.02] hover:shadow-lg hover:shadow-amber-500/5 ${
                  accountType === 'worker'
                    ? 'border-[#f59e0b] bg-[#f59e0b]/5 shadow-md shadow-amber-500/10'
                    : 'border-zinc-800 bg-zinc-950/50 hover:border-zinc-700'
                }`}
              >
                <div className="text-2xl mb-2">👷</div>
                <p className="text-sm font-semibold text-zinc-100">
                  {t('auth.accountTypeWorker')}
                </p>
                <p className="text-[11px] text-zinc-400 mt-1 leading-snug">
                  {t('auth.accountTypeWorkerDesc')}
                </p>
                {accountType === 'worker' && (
                  <div className="absolute top-2 right-2 h-2 w-2 rounded-full bg-[#f59e0b] animate-pulse" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setAccountType('company')}
                className={`relative p-4 rounded-lg border text-left transition-all duration-200 ease-out hover:scale-[1.02] hover:shadow-lg hover:shadow-amber-500/5 ${
                  accountType === 'company'
                    ? 'border-[#f59e0b] bg-[#f59e0b]/5 shadow-md shadow-amber-500/10'
                    : 'border-zinc-800 bg-zinc-950/50 hover:border-zinc-700'
                }`}
              >
                <div className="text-2xl mb-2">🏢</div>
                <p className="text-sm font-semibold text-zinc-100">
                  {t('auth.accountTypeCompany')}
                </p>
                <p className="text-[11px] text-zinc-400 mt-1 leading-snug">
                  {t('auth.accountTypeCompanyDesc')}
                </p>
                {accountType === 'company' && (
                  <div className="absolute top-2 right-2 h-2 w-2 rounded-full bg-[#f59e0b] animate-pulse" />
                )}
              </button>
            </div>
          </div>

          {/* Google Sign-In Button */}
          <Button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading}
            className="w-full h-11 bg-zinc-900 border border-zinc-700 text-zinc-100 hover:bg-zinc-800 hover:border-zinc-600 hover:shadow-md transition-all duration-200 font-medium tracking-wide flex items-center justify-center gap-3"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
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

          {/* Email/Password Form */}
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label
                htmlFor="fullName"
                className="text-xs uppercase tracking-wider text-zinc-400"
              >
                {t('common.fullName')}
              </Label>
              <Input
                id="fullName"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="h-11 bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b] focus-visible:border-[#f59e0b]"
                placeholder={t('auth.fullNamePlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs uppercase tracking-wider text-zinc-400">
                {t('common.email')}
              </Label>
              <Input
                id="email"
                type="email"
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
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b] focus-visible:border-[#f59e0b]"
                placeholder={t('auth.passwordPlaceholder')}
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold tracking-wide transition-all duration-200 hover:shadow-lg hover:shadow-amber-500/20"
            >
              {loading ? t('common.creatingAccount') : t('common.signUp')}
            </Button>
          </form>

          <p className="text-center text-sm text-zinc-400">
            {t('auth.alreadyHaveAccount')}{' '}
            <Link to="/login" className="text-[#f59e0b] hover:underline font-medium">
              {t('common.signIn')}
            </Link>
          </p>
        </div>
      </div>

      {/* Right side - Branding */}
      <div className="hidden lg:flex flex-col justify-center border-l border-zinc-800/80 bg-[#0d0d0d] px-12 py-10 order-1 lg:order-2 relative overflow-hidden">
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
            {t('auth.registerHeadline')}
          </h1>

          {/* Features list */}
          <ul className="space-y-3 text-sm text-zinc-400">
            {features.map((line) => (
              <li key={line} className="flex items-start gap-3">
                <span className="mt-1.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-[#f59e0b]" />
                <span>{line}</span>
              </li>
            ))}
          </ul>

          {/* Footer tagline */}
          <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-600 pt-4">
            {t('auth.footerTagline')}
          </p>
        </div>
      </div>
    </div>
  );
}