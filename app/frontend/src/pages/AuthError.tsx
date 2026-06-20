import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function AuthErrorPage() {
  const [searchParams] = useSearchParams();
  const [countdown, setCountdown] = useState(5);
  const { t } = useTranslation();
  const errorMessage =
    searchParams.get('msg') ||
    t('auth.errorGeneric', 'Sorry, your authentication information is invalid or has expired');

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          window.location.href = '/login';
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const handleReturnLogin = () => {
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a0a0a] p-6 text-center">
      <div className="space-y-6 max-w-md">
        <div className="space-y-4">
          {/* Error icon */}
          <div className="flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-red-500/20 blur-xl rounded-full" />
              <AlertCircle
                className="relative h-12 w-12 text-red-500"
                strokeWidth={1.5}
              />
            </div>
          </div>

          {/* Error title */}
          <h1 className="text-2xl font-bold text-zinc-100">
            {t('auth.errorTitle', 'Authentication Error')}
          </h1>

          {/* Error description */}
          <p className="text-base text-zinc-400">{errorMessage}</p>

          {/* Countdown message */}
          <div className="pt-2">
            <p className="text-sm text-zinc-500">
              {countdown > 0 ? (
                <>
                  {t('auth.errorRedirectCountdown', 'Redirecting to login in')}{' '}
                  <span className="text-[#f59e0b] font-semibold text-base">
                    {countdown}
                  </span>{' '}
                  {t('auth.errorSeconds', 'seconds')}
                </>
              ) : (
                t('auth.redirecting', 'Redirecting...')
              )}
            </p>
          </div>
        </div>

        {/* Return to login button */}
        <div className="flex justify-center pt-2">
          <Button
            onClick={handleReturnLogin}
            className="px-6 bg-[#f59e0b] hover:bg-[#d97706] text-black font-medium"
          >
            {t('auth.backToLogin', 'Return to Login')}
          </Button>
        </div>
      </div>
    </div>
  );
}
