/**
 * PB-CE-COMPANY-CORE-001 — active company selector. Rendered only when the
 * actor belongs to more than one company. The selection is a UI convenience
 * (localStorage); it is NEVER an authorization claim — every operation is
 * re-validated server-side against memberships.
 */

import { useTranslation } from 'react-i18next';
import { Building2 } from 'lucide-react';
import { CompanyContext, selectCompanyContext } from '@/lib/companyCore';

interface Props {
  contexts: CompanyContext[];
  active: CompanyContext;
}

export function CompanyContextSwitcher({ contexts, active }: Props) {
  const { t } = useTranslation();

  if (contexts.length < 2) return null;

  return (
    <label className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2">
      <Building2 className="h-4 w-4 text-[#f59e0b]" />
      <span className="text-xs text-zinc-400">{t('companyCore.switcher.label')}</span>
      <select
        className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-200"
        value={active.company_id}
        onChange={(e) => {
          const next = contexts.find((c) => c.company_id === e.target.value);
          if (next) selectCompanyContext(next);
        }}
      >
        {contexts.map((c) => (
          <option key={c.company_id} value={c.company_id}>
            {c.company_name}
          </option>
        ))}
      </select>
    </label>
  );
}
