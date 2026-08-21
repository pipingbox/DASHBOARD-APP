import { FormEvent, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Lock, CheckCircle2, Eye, EyeOff } from 'lucide-react';

export default function ResetPassword() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState(false);

  useEffect(() => {
    // Supabase automatically handles the token exchange from the URL hash
    // We just need to verify a session exists
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setSessionReady(true);
      } else {
        // Listen for auth state change (token exchange may be in progress)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
          if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
            setSessionReady(true);
          }
        });

        // Timeout after 5 seconds
        const timeout = setTimeout(() => {
          if (!sessionReady) {
            setSessionError(true);
          }
        }, 5000);

        return () => {
          subscription.unsubscribe();
          clearTimeout(timeout);
        };
      }
    };

    checkSession();
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (password.length < 6) {
      toast.error(t('auth.passwordTooShort'));
      return;
    }

    if (password !== confirmPassword) {
      toast.error(t('auth.passwordsDoNotMatch'));
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    setSuccess(true);
    toast.success(t('auth.passwordUpdated'));

    // Redirect to dashboard after 3 seconds
    setTimeout(() => {
      navigate('/dashboard', { replace: true });
    }, 3000);
  };

  if (sessionError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-zinc-100 p-6">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
              <Lock className="w-8 h-8 text-red-500" />
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">{t('auth.resetLinkExpired')}</h2>
            <p className="text-sm text-zinc-400">{t('auth.resetLinkExpiredDesc')}</p>
          </div>
          <Button
            onClick={() => navigate('/forgot-password')}
            className="w-full h-11 bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold"
          >
            {t('auth.requestNewLink')}
          </Button>
        </div>
      </div>
    );
  }

  if (!sessionReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-zinc-100">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-[#f59e0b] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-zinc-400">{t('auth.verifyingLink')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-[#0a0a0a] text-zinc-100">
      {/* Left panel */}
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
              src="https://mgx-backend-cdn.metadl.com/generate/images/747553/2026-05-19/o3szcmyaagqa/logo-horizontal_variant_2.png"
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

      {/* Right panel */}
      <div className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md space-y-6">
          <div className="lg:hidden mb-4">
            <img
              src="https://mgx-backend-cdn.metadl.com/generate/images/747553/2026-05-19/o3szzryaagnq/logo-horizontal_variant_3.png"
              alt="PipingBox"
              width={200}
              height={200}
              className="w-[200px] h-[200px] object-contain"
            />
          </div>

          {success ? (
            <div className="space-y-6 text-center">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                </div>
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">{t('auth.passwordUpdatedTitle')}</h2>
                <p className="text-sm text-zinc-400">{t('auth.passwordUpdatedDesc')}</p>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-1 overflow-hidden">
                <div className="bg-[#f59e0b] h-full animate-pulse w-full" />
              </div>
              <p className="text-xs text-zinc-500">{t('auth.redirectingToDashboard')}</p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-6">
              <div className="space-y-3">
                <p className="text-[10px] uppercase tracking-[0.3em] text-[#f59e0b]">
                  {t('auth.secureAccess')}
                </p>
                <h2 className="text-3xl font-bold">{t('auth.resetPasswordTitle')}</h2>
                <p className="text-sm text-zinc-400">{t('auth.resetPasswordDesc')}</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-xs uppercase tracking-wider text-zinc-400">
                    {t('auth.newPassword')}
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-11 pl-10 pr-10 bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b] focus-visible:border-[#f59e0b]"
                      placeholder={t('auth.passwordPlaceholder')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password" className="text-xs uppercase tracking-wider text-zinc-400">
                    {t('auth.confirmPassword')}
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <Input
                      id="confirm-password"
                      type={showConfirm ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="h-11 pl-10 pr-10 bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b] focus-visible:border-[#f59e0b]"
                      placeholder={t('auth.confirmPasswordPlaceholder')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                    >
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Password strength indicator */}
              {password.length > 0 && (
                <div className="space-y-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((level) => (
                      <div
                        key={level}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          password.length >= level * 3
                            ? password.length >= 12
                              ? 'bg-emerald-500'
                              : password.length >= 8
                              ? 'bg-[#f59e0b]'
                              : 'bg-red-500'
                            : 'bg-zinc-800'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-[10px] text-zinc-500">
                    {password.length < 6
                      ? t('auth.passwordWeak')
                      : password.length < 8
                      ? t('auth.passwordFair')
                      : password.length < 12
                      ? t('auth.passwordGood')
                      : t('auth.passwordStrong')}
                  </p>
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold tracking-wide transition-all duration-200 hover:shadow-lg hover:shadow-amber-500/20"
              >
                {loading ? t('common.saving') : t('auth.updatePassword')}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}