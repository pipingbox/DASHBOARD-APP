/**
 * PB-CE-COMPANY-CORE-001 — Accept/reject a company invitation by token.
 *
 * Public route: an invitee may not have a session yet. Without a session we
 * explain the next step (sign in or register with the invited email, then
 * reopen this link) — the token stays in the URL and remains valid until it
 * expires or is revoked. All validation (single use, expiry, revocation,
 * recipient match, anti-enumeration) happens in the RPCs, never here.
 */

import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  acceptCompanyInvitation,
  CompanyCoreRpcError,
  rejectCompanyInvitation,
} from '@/lib/companyCore';

export default function InviteAccept() {
  const { t } = useTranslation();
  const { token = '' } = useParams<{ token: string }>();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<'accepted' | 'rejected' | null>(null);

  const mapError = (err: unknown) => {
    const code = err instanceof CompanyCoreRpcError ? err.code : 'unknown';
    setError(t(`companyCore.errors.${code}`));
  };

  const handleAccept = async () => {
    setBusy(true);
    setError(null);
    try {
      await acceptCompanyInvitation(token);
      setDone('accepted');
      trackAndGo();
    } catch (err) {
      mapError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    setBusy(true);
    setError(null);
    try {
      await rejectCompanyInvitation(token);
      setDone('rejected');
    } catch (err) {
      mapError(err);
    } finally {
      setBusy(false);
    }
  };

  const trackAndGo = () => {
    window.setTimeout(() => navigate('/company/team', { replace: true }), 1500);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <p className="text-sm text-zinc-400">{t('companyCore.loading')}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-md space-y-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-8 text-center">
        <h1 className="text-xl font-bold text-zinc-100">{t('companyCore.accept.title')}</h1>

        {!user && (
          <div className="space-y-3">
            <p className="text-sm text-zinc-400">{t('companyCore.accept.sessionRequired')}</p>
            <div className="flex justify-center gap-3">
              <Link
                to="/login"
                className="rounded-md bg-[#f59e0b] px-4 py-2 text-sm font-semibold text-zinc-950"
              >
                {t('companyCore.accept.signIn')}
              </Link>
              <Link
                to="/register"
                className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-200"
              >
                {t('companyCore.accept.register')}
              </Link>
            </div>
          </div>
        )}

        {user && done === null && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">{t('companyCore.accept.question')}</p>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex justify-center gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={handleAccept}
                className="rounded-md bg-[#f59e0b] px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50"
              >
                {busy ? t('companyCore.accept.processing') : t('companyCore.accept.accept')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleReject}
                className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-200 disabled:opacity-50"
              >
                {t('companyCore.accept.reject')}
              </button>
            </div>
          </div>
        )}

        {done === 'accepted' && (
          <div className="space-y-2">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
            <p className="text-sm text-emerald-400">{t('companyCore.accept.success')}</p>
          </div>
        )}

        {done === 'rejected' && (
          <div className="space-y-2">
            <XCircle className="mx-auto h-10 w-10 text-zinc-500" />
            <p className="text-sm text-zinc-400">{t('companyCore.accept.rejected')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
