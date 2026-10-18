import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CheckCircle2, XCircle, Loader2, FileText, ShieldCheck } from 'lucide-react';

type RequirementKey = 'cv' | 'profession' | 'location' | 'availability';

interface CanonicalRequirements {
  ok_cv: boolean;
  ok_profession: boolean;
  ok_location: boolean;
  ok_availability: boolean;
  ok_minimums: boolean;
  already_ready: boolean;
  consent_version: number | null;
  account_type: string | null;
  role: string | null;
  account_allowed: boolean;
  acceptance_open: boolean;
  text_status: string | null;
  contract_lang: string;
  text_version: string;
  canonical_hash: string;
  body_md: string;
}

interface AcceptResult {
  out_status: string;
  out_marketplace_ready: boolean;
  out_activated_count: number;
}

/**
 * PR-V3-02 (rondas 3-4): wizard de aceptación del contrato Marketplace Ready v3.
 *
 * P1 ronda 3:
 *  - Los requisitos se consumen del RPC canónico pb_marketplace_v3_requirements
 *    (predicado de sql/047: exige objeto Storage REAL con owner correcto y
 *    excluye availability 'not_specified'/'unknown'). El frontend NO duplica
 *    las reglas SQL ni deriva nada de columnas editables.
 *  - El texto contractual mostrado es la versión PRESERVADA en backend
 *    (pb_marketplace_contract_texts, con hash SHA-256). La versión que se
 *    muestra es exactamente la que registra la aceptación.
 *  - La restricción por tipo de cuenta vive en el RPC (account_type=worker);
 *    este componente solo refleja el resultado (account_type_not_allowed).
 */
export default function MarketplaceV3Wizard() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [canonical, setCanonical] = useState<CanonicalRequirements | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [result, setResult] = useState<AcceptResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lang = (i18n.language || 'es').split('-')[0];

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const { data, error: rpcError } = await supabase.rpc('pb_marketplace_v3_requirements', {
          p_lang: lang,
        });
        if (rpcError) throw rpcError;
        const row = (data as CanonicalRequirements[] | null)?.[0] ?? null;
        if (mounted) setCanonical(row);
      } catch (e) {
        if (mounted) setError((e as Error).message);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    if (user) load();
    return () => {
      mounted = false;
    };
  }, [user, lang]);

  const handleAccept = async () => {
    if (!consentChecked || !user) return;
    setAccepting(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('pb_accept_marketplace_contract_v3', {
        p_lang: canonical?.contract_lang ?? lang,
      });
      if (rpcError) throw rpcError;
      const row = (data as AcceptResult[] | null)?.[0] ?? null;
      setResult(row);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAccepting(false);
    }
  };

  if (!user) return null;

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#E8611A]" />
      </div>
    );
  }

  const requirements: { key: RequirementKey; ok: boolean }[] = canonical
    ? [
        { key: 'cv', ok: canonical.ok_cv },
        { key: 'profession', ok: canonical.ok_profession },
        { key: 'location', ok: canonical.ok_location },
        { key: 'availability', ok: canonical.ok_availability },
      ]
    : [];

  const allMet = canonical?.ok_minimums ?? false;
  const alreadyConsented = canonical?.consent_version === 3;
  // P1 ronda 3 (5-8): la restricción por tipo de cuenta vive en el RPC de
  // aceptación; el wizard la refleja DE ENTRADA (sin invitar a una empresa a
  // aceptar condiciones de candidato). Nunca se convierte una cuenta
  // empresarial en candidata Marketplace Ready.
  // P1 ronda 4: política canónica de cuenta (account_type Y role) calculada
  // en backend; el wizard solo refleja el resultado.
  const accountBlocked = canonical != null && canonical.account_allowed === false;
  // P1 ronda 4: gate jurídica fail-closed. Con el contrato en DRAFT o la
  // activación técnica cerrada (acceptance_open=false) no se ofrece el acto
  // de aceptación: ningún texto no aprobado genera consentimientos.
  const contractBlocked =
    canonical != null &&
    !accountBlocked &&
    !canonical.already_ready &&
    canonical.consent_version !== 3 &&
    canonical.acceptance_open === false;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <ShieldCheck className="h-6 w-6 text-[#E8611A]" />
            {t('marketplaceV3.title')}
          </CardTitle>
          <CardDescription>{t('marketplaceV3.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertTitle>{t('marketplaceV3.resultError')}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {result ? (
            <ResultView result={result} />
          ) : accountBlocked ? (
            <Alert variant="destructive">
              <ShieldCheck className="h-4 w-4" />
              <AlertTitle>{t('marketplaceV3.resultAccountType')}</AlertTitle>
            </Alert>
          ) : contractBlocked ? (
            <Alert>
              <FileText className="h-4 w-4" />
              <AlertTitle>{t('marketplaceV3.contractNotActive')}</AlertTitle>
              <AlertDescription>{t('marketplaceV3.contractNotActiveBody')}</AlertDescription>
            </Alert>
          ) : (
            <>
              {/* Requisitos canónicos (resultado backend, no derivado en cliente) */}
              <div>
                <h3 className="mb-3 font-semibold">{t('marketplaceV3.requirementsTitle')}</h3>
                <ul className="space-y-2">
                  {requirements.map((req) => (
                    <li key={req.key} className="flex items-center gap-2 text-sm">
                      {req.ok ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      ) : (
                        <XCircle className="h-5 w-5 text-muted-foreground" />
                      )}
                      <span className={req.ok ? '' : 'text-muted-foreground'}>
                        {t(`marketplaceV3.requirements.${req.key}`)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-sm text-muted-foreground">
                  {t('marketplaceV3.certificatesOptional')}
                </p>
              </div>

              {/* Texto contractual preservado (versión que realmente se acepta) */}
              <div className="rounded-md border bg-muted/40 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <FileText className="h-4 w-4 text-[#E8611A]" />
                  {t('marketplaceV3.consentText')}
                </div>
                {canonical?.body_md && (
                  <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded bg-background p-3 text-sm leading-relaxed">
                    {canonical.body_md}
                  </div>
                )}
                {canonical && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t('marketplaceV3.contractVersion', {
                      version: canonical.text_version,
                      lang: canonical.contract_lang,
                    })}
                  </p>
                )}
              </div>

              {/* Consentimiento: nunca premarcado; deshabilitado si ya consintió */}
              <label className="flex cursor-pointer items-start gap-3">
                <Checkbox
                  checked={consentChecked}
                  onCheckedChange={(v) => setConsentChecked(v === true)}
                  disabled={alreadyConsented}
                  aria-label={t('marketplaceV3.consentCheckbox')}
                />
                <span className="text-sm leading-snug">{t('marketplaceV3.consentCheckbox')}</span>
              </label>

              <div className="flex items-center gap-3">
                <Button
                  onClick={handleAccept}
                  disabled={!consentChecked || accepting || alreadyConsented}
                  className="bg-[#E8611A] hover:bg-[#c94f12]"
                >
                  {accepting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('marketplaceV3.acceptCta')}
                </Button>
                {!allMet && (
                  <Button variant="outline" onClick={() => navigate('/profile')}>
                    {t('marketplaceV3.completeProfileLink')}
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ResultView({ result }: { result: AcceptResult }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const status = result.out_status;
  const isReady = result.out_marketplace_ready === true;

  let title: string;
  let tone: 'success' | 'info' | 'warn';
  if (isReady || status === 'promoted' || status === 'already_ready') {
    title = t('marketplaceV3.resultReady');
    tone = 'success';
  } else if (status === 'legacy_protected') {
    title = t('marketplaceV3.resultLegacy');
    tone = 'info';
  } else if (status === 'account_type_not_allowed') {
    title = t('marketplaceV3.resultAccountType');
    tone = 'warn';
  } else if (status === 'contract_not_active') {
    title = t('marketplaceV3.contractNotActive');
    tone = 'warn';
  } else {
    title = t('marketplaceV3.resultNotEligible');
    tone = 'info';
  }

  return (
    <Alert variant={tone === 'warn' ? 'destructive' : 'default'}>
      {tone === 'success' ? (
        <CheckCircle2 className="h-4 w-4 text-green-600" />
      ) : (
        <ShieldCheck className="h-4 w-4" />
      )}
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="mt-2">
        {status === 'account_type_not_allowed' || status === 'contract_not_active' ? null : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(isReady ? '/dashboard' : '/profile')}
          >
            {isReady ? t('marketplaceV3.goDashboard') : t('marketplaceV3.completeProfileLink')}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
