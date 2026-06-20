import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { ArrowLeft, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a0a0a] text-zinc-100 px-6">
      {/* Logo */}
      <Link to="/" className="mb-12">
        <img
          src="/assets/logos/logo-horizontal.png"
          alt="PipingBox"
          className="w-[180px] h-auto opacity-60 hover:opacity-100 transition"
        />
      </Link>

      {/* 404 visual */}
      <div className="text-center space-y-4">
        <h1 className="text-8xl font-black text-[#f59e0b]/20 select-none">404</h1>
        <h2 className="text-2xl font-bold">
          {t('errors.pageNotFound', 'Page not found')}
        </h2>
        <p className="text-sm text-zinc-500 max-w-md">
          {t(
            'errors.pageNotFoundDesc',
            "The page you're looking for doesn't exist or has been moved."
          )}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4 mt-10">
        <Button
          asChild
          variant="outline"
          className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:border-zinc-600"
        >
          <Link to={user ? '/dashboard' : '/login'}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {user
              ? t('errors.backToDashboard', 'Back to dashboard')
              : t('auth.backToLogin', 'Back to login')}
          </Link>
        </Button>
        <Button asChild className="bg-[#f59e0b] text-black hover:bg-[#d97706] font-semibold">
          <Link to="/">
            <Home className="h-4 w-4 mr-2" />
            {t('common.home', 'Home')}
          </Link>
        </Button>
      </div>

      {/* Footer accent */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#f59e0b]/20 to-transparent" />
    </div>
  );
}
