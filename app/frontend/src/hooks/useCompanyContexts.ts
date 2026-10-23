/**
 * PB-CE-COMPANY-CORE-001 — shared hook: company contexts of the actor and the
 * currently selected active company (client-side selection only; the DB is the
 * authorization source via memberships + RLS).
 */

import { useCallback, useEffect, useState } from 'react';
import {
  CompanyContext,
  fetchMyCompanyContexts,
  getActiveCompanyId,
  onActiveCompanyChange,
} from '@/lib/companyCore';

export function useCompanyContexts() {
  const [contexts, setContexts] = useState<CompanyContext[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const reload = useCallback(async () => {
    try {
      setLoadError(false);
      const list = await fetchMyCompanyContexts();
      setContexts(list);
    } catch {
      setLoadError(true);
      setContexts([]);
    }
  }, []);

  useEffect(() => {
    void reload();
    return onActiveCompanyChange(() => void reload());
  }, [reload]);

  const active =
    contexts?.find((c) => c.company_id === getActiveCompanyId()) ?? contexts?.[0] ?? null;

  return { contexts, active, loadError, reload };
}
