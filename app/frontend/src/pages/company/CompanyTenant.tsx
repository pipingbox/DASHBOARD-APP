/**
 * PB-CE-COMPANY-CORE-001 — Company tenant page: initialize the company (first
 * cut) or view its basic operational/verification state. Creating a company
 * never marks it verified — verification stays a separate, manual process.
 */

import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Building2, ShieldCheck, Users } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { CompanyContextSwitcher } from '@/components/company/CompanyContextSwitcher';
import { useCompanyContexts } from '@/hooks/useCompanyContexts';
import { CompanyCoreRpcError, createCompany, fetchMyCompanyContexts, selectCompanyContext } from '@/lib/companyCore';

const VERIFICATION_BADGE: Record<string, string> = {
  unverified: 'bg-zinc-700/40 text-zinc-300',
  pending: 'bg-amber-500/10 text-amber-400',
  verified: 'bg-emerald-500/10 text-emerald-400',
  rejected: 'bg-red-500/10 text-red-400',
};

export default function CompanyTenant() {
  const { t } = useTranslation();
  const { contexts, active, loadError, reload } = useCompanyContexts();
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const companyId = await createCompany(name, country || undefined);
      const list = await fetchMyCompanyContexts();
      const ctx = list.find((c) => c.company_id === companyId);
      if (ctx) selectCompanyContext(ctx);
      await reload();
      setName('');
      setCountry('');
    } catch (err) {
      const code = err instanceof CompanyCoreRpcError ? err.code : 'unknown';
      setError(t(`companyCore.errors.${code}`));
    } finally {
      setBusy(false);
    }
  };

  if (contexts === null) {
    return <p className="text-sm text-zinc-400">{t('companyCore.loading')}</p>;
  }

  if (contexts.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t('companyCore.create.title')}
          description={t('companyCore.create.description')}
        />
        <form
          onSubmit={handleCreate}
          className="max-w-lg space-y-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-6"
        >
          <div>
            <label className="mb-1 block text-xs text-zinc-400" htmlFor="company-name">
              {t('companyCore.create.nameLabel')}
            </label>
            <input
              id="company-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-400" htmlFor="company-country">
              {t('companyCore.create.countryLabel')}
            </label>
            <input
              id="company-country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          {loadError && <p className="text-sm text-red-400">{t('companyCore.errors.unknown')}</p>}
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-[#f59e0b] px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50"
          >
            {busy ? t('companyCore.create.submitting') : t('companyCore.create.submit')}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={active?.company_name ?? t('companyCore.view.title')}
        description={t('companyCore.view.description')}
        actions={
          contexts.length > 1 && active ? (
            <CompanyContextSwitcher contexts={contexts} active={active} />
          ) : undefined
        }
      />

      {active && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f59e0b]/10">
                <ShieldCheck className="h-5 w-5 text-[#f59e0b]" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-zinc-200">
                  {t('companyCore.view.verificationTitle')}
                </h3>
                <span
                  className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs ${VERIFICATION_BADGE[active.verification_status]}`}
                >
                  {t(`companyCore.verification.${active.verification_status}`)}
                </span>
              </div>
            </div>
          </div>

          <Link
            to="/company/team"
            className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6 transition-colors hover:border-zinc-700"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f59e0b]/10">
                <Users className="h-5 w-5 text-[#f59e0b]" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-zinc-200">
                  {t('companyCore.view.teamTitle')}
                </h3>
                <p className="text-xs text-zinc-500">{t('companyCore.view.teamDescription')}</p>
              </div>
            </div>
          </Link>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f59e0b]/10">
                <Building2 className="h-5 w-5 text-[#f59e0b]" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-zinc-200">
                  {t('companyCore.view.yourRoleTitle')}
                </h3>
                <p className="text-xs text-zinc-500">{t(`companyCore.roles.${active.role}`)}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
