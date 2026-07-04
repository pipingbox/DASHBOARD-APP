import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { AppShell } from '@/components/layout/AppShell';
import { OnboardingGate } from '@/components/OnboardingGate';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import Tools from '@/pages/Tools';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * FEAT-005 (DEC-16/DEC-24): Public tools route.
 *
 * Engineering tools are accessible WITHOUT login. This is the primary
 * acquisition channel (SEO). Traffic converts to registrations via the
 * CTA banner shown to anonymous users.
 *
 * - Anonymous user: sees Tools content + CTA banner (no AppShell, no save).
 * - Authenticated user: sees Tools inside AppShell (with save to DB).
 *
 * The underlying Tools component already guards DB writes with `if (user)`,
 * so no changes to Tools.tsx were needed for the public path.
 *
 * Rate limiting (3 calculations per anonymous session) is enforced via
 * localStorage to encourage registration without hard-blocking.
 */

const ANON_CALC_LIMIT = 3;
const ANON_CALC_KEY = 'pipingbox_anon_calc_count';

export function getAnonCalcCount(): number {
  try {
    return Number(localStorage.getItem(ANON_CALC_KEY) || '0');
  } catch {
    return 0;
  }
}

export function incrementAnonCalcCount(): number {
  const next = getAnonCalcCount() + 1;
  try {
    localStorage.setItem(ANON_CALC_KEY, String(next));
  } catch {
    // ignore storage errors
  }
  return next;
}

export function resetAnonCalcCount() {
  try {
    localStorage.removeItem(ANON_CALC_KEY);
  } catch {
    // ignore
  }
}

function AnonCtaBanner() {
  const { t } = useTranslation();
  const count = getAnonCalcCount();
  const remaining = Math.max(0, ANON_CALC_LIMIT - count);
  const showLimit = count > 0;

  return (
    <div className="border border-[#f59e0b]/30 bg-[#f59e0b]/5 p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f59e0b]/15">
          <Sparkles className="h-5 w-5 text-[#f59e0b]" />
        </div>
        <div className="flex-1 space-y-1">
          <p className="text-sm font-semibold text-zinc-100">
            {t('tools.anonCtaTitle', {
              defaultValue: 'Create a free account to save your calculations',
            })}
          </p>
          <p className="text-xs text-zinc-400">
            {showLimit
              ? t('tools.anonCtaLimit', {
                  defaultValue: '{{remaining}} free calculations remaining today.',
                  remaining,
                })
              : t('tools.anonCtaSubtitle', {
                  defaultValue:
                    'Registered users get unlimited calculations, history, and job matching.',
                })}
          </p>
        </div>
        <Link
          to="/register"
          className="shrink-0 rounded-md bg-[#f59e0b] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#d97706]"
        >
          {t('tools.anonCtaButton', { defaultValue: 'Sign up free' })}
        </Link>
      </div>
    </div>
  );
}

export default function ToolsPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#f59e0b] border-t-transparent" />
      </div>
    );
  }

  // Authenticated: full app shell with navigation
  if (user) {
    return (
      <ProtectedRoute allowedRoles={['admin', 'worker', 'company']}>
        <AppShell>
          <Tools />
        </AppShell>
      </ProtectedRoute>
    );
  }

  // Anonymous: public layout with CTA banner, no save to DB
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100">
      <header className="border-b border-zinc-800/80 bg-[#0d0d0d]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-lg font-bold tracking-tight">
              Piping<span className="text-[#f59e0b]">Box</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="text-sm text-zinc-400 transition hover:text-zinc-100"
            >
              Sign in
            </Link>
            <Link
              to="/register"
              className="rounded-md bg-[#f59e0b] px-3 py-1.5 text-sm font-semibold text-black transition hover:bg-[#d97706]"
            >
              Sign up free
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="space-y-6">
          <AnonCtaBanner />
          <Tools />
        </div>
      </main>
    </div>
  );
}
