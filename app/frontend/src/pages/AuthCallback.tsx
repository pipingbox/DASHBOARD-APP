import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from 'react-i18next';

/**
 * OAuth callback handler.
 *
 * Supabase redirects here after Google OAuth.  The JS client automatically
 * picks up the hash-fragment tokens via onAuthStateChange, so this page
 * only needs to:
 *   1. Wait until the auth state resolves.
 *   2. Redirect to /dashboard on success.
 *   3. Redirect to /auth/error on failure (query-param error from Supabase).
 */
export default function AuthCallback() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    // Supabase appends ?error=...&error_description=... on OAuth failure
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (error) {
      setHasError(true);
      const msg = errorDescription || error;
      navigate(`/auth/error?msg=${encodeURIComponent(msg)}`, { replace: true });
      return;
    }

    // Wait until auth finishes loading, then redirect
    if (!loading) {
      if (session) {
        navigate('/dashboard', { replace: true });
      } else {
        // No session and no error — something unexpected happened
        navigate('/auth/error?msg=' + encodeURIComponent('Authentication session could not be established'), { replace: true });
      }
    }
  }, [loading, session, searchParams, navigate]);

  if (hasError) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#f59e0b] mx-auto mb-4" />
        <p className="text-zinc-400">{t('auth.processingAuth', 'Processing authentication...')}</p>
      </div>
    </div>
  );
}
