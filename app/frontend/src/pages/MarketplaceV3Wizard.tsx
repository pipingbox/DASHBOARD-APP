/**
 * PR-V3-02 — PB-MARKETPLACE-V3-RECRUITMENT-001 / TRACK C
 * Wizard de aceptación del contrato Marketplace Ready v3.
 *
 * Contrato del componente:
 *   - Muestra los requisitos v3 (CV, profesión, ubicación, disponibilidad) con
 *     su estado, derivado de datos canónicos del perfil (nunca de flags
 *     editables por el usuario como marketplace_ready).
 *   - El consentimiento NUNCA está premarcado. Aceptar llama al RPC canónico
 *     pb_accept_marketplace_contract_v3 (actor = auth.uid() por diseño; sin
 *     parámetro de sujeto). La versión del texto es constante de servidor
 *     (v3-2026-10-17) — el cliente no envía wording.
 *   - Certificados: opcionales (informativo, no bloqueante).
 *   - Reintentos seguros: already_accepted se muestra como estado final
 *     idempotente, sin acciones destructivas.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Circle, Loader2, ShieldCheck } from 'lucide-react';

type RequirementKey = 'cv' | 'profession' | 'location' | 'availability';
type AcceptOutcome =
  | 'promoted'
  | 'not_eligible'
  | 'already_accepted'
  | 'already_ready'
  | 'legacy_protected'
  | 'consent_required'
  | 'contract_version_required'
  | 'consent_v3_required'
  | 'error';

interface AcceptRow {
  out_status: AcceptOutcome;
  out_marketplace_ready: boolean | null;
  out_activated_count: number;
}

interface ProfileRequirements {
  hasCv: boolean;
  hasProfession: boolean;
  hasLocation: boolean;
  hasAvailability: boolean;
  contractVersion: number | null;
  consentVersion: number | null;
  marketplaceReady: boolean;
}

const MarketplaceV3Wizard = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [outcome, setOutcome] = useState<AcceptOutcome | null>(null);
  const [reqs, setReqs] = useState<ProfileRequirements | null>(null);

  const loadRequirements = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data: profile } = await supabase
        .from('app_14da0f1941_profiles')
        .select(
          'title, location, availability_status, cv_storage_path, marketplace_ready, marketplace_contract_version, marketplace_consent_version',
        )
        .eq('user_id', user.id)
        .maybeSingle();

      setReqs({
        hasCv: !!profile?.cv_storage_path?.trim(),
        hasProfession: !!profile?.title?.trim(),
        hasLocation: !!profile?.location?.trim(),
        hasAvailability: !!profile?.availability_status?.trim(),
        contractVersion: profile?.marketplace_contract_version ?? null,
        consentVersion: profile?.marketplace_consent_version ?? null,
        marketplaceReady: profile?.marketplace_ready === true,
      });
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadRequirements();
  }, [loadRequirements]);

  const requirements = useMemo(() => {
    if (!reqs) return [];
    const list: { key: RequirementKey; met: boolean }[] = [
      { key: 'cv', met: reqs.hasCv },
      { key: 'profession', met: reqs.hasProfession },
      { key: 'location', met: reqs.hasLocation },
      { key: 'availability', met: reqs.hasAvailability },
    ];
    return list;
  }, [reqs]);

  const alreadyAccepted =
    (reqs?.contractVersion === 3 && reqs?.consentVersion === 3) ||
    outcome === 'already_accepted';

  const handleAccept = async () => {
    if (!consentChecked || accepting) return;
    setAccepting(true);
    try {
      const { data, error } = await supabase.rpc('pb_accept_marketplace_contract_v3');
      if (error) {
        setOutcome('error');
        return;
      }
      const row: AcceptRow | undefined = Array.isArray(data) ? data[0] : data;
      setOutcome((row?.out_status as AcceptOutcome) ?? 'error');
      await loadRequirements();
    } finally {
      setAccepting(false);
    }
  };

  const readyNow =
    reqs?.marketplaceReady === true || outcome === 'promoted' || outcome === 'already_ready';

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            {t('marketplaceV3.title')}
          </CardTitle>
          <CardDescription>{t('marketplaceV3.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('common.loading')}
            </div>
          ) : (
            <>
              <section className="space-y-2">
                <h3 className="text-sm font-medium">{t('marketplaceV3.requirementsTitle')}</h3>
                <ul className="space-y-1.5">
                  {requirements.map((req) => (
                    <li key={req.key} className="flex items-center gap-2 text-sm">
                      {req.met ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className={req.met ? '' : 'text-muted-foreground'}>
                        {t(`marketplaceV3.requirements.${req.key}`)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  {t('marketplaceV3.certificatesOptional')}
                </p>
              </section>

              <section className="space-y-3 rounded-md border p-4">
                <p className="text-sm">{t('marketplaceV3.consentText')}</p>
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={consentChecked}
                    onCheckedChange={(v) => setConsentChecked(v === true)}
                    disabled={alreadyAccepted || accepting}
                  />
                  <span>{t('marketplaceV3.consentCheckbox')}</span>
                </label>
              </section>

              {readyNow ? (
                <p className="text-sm font-medium text-green-700">
                  {t('marketplaceV3.resultReady')}
                </p>
              ) : outcome === 'not_eligible' ? (
                <p className="text-sm text-muted-foreground">
                  {t('marketplaceV3.resultNotEligible')}
                </p>
              ) : outcome === 'legacy_protected' ? (
                <p className="text-sm text-muted-foreground">
                  {t('marketplaceV3.resultLegacy')}
                </p>
              ) : outcome === 'error' ? (
                <p className="text-sm text-destructive">{t('marketplaceV3.resultError')}</p>
              ) : null}

              {!alreadyAccepted && !readyNow && (
                <Button onClick={handleAccept} disabled={!consentChecked || accepting}>
                  {accepting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('marketplaceV3.acceptCta')}
                </Button>
              )}

              <p className="text-xs text-muted-foreground">
                <Link to="/profile" className="underline">
                  {t('marketplaceV3.completeProfileLink')}
                </Link>
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MarketplaceV3Wizard;
