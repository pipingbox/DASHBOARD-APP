import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertCircle, ArrowRight, CheckCircle2, FileText, Loader2, ShieldAlert } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/hooks/useAuth';
import { trackEvent } from '@/lib/observability';
import {
  applyCvDraft,
  dismissDraft,
  getPendingDraft,
  CV_FIELD_LABEL_KEYS,
  CV_INFO_ONLY_FIELDS,
  type CvDraft,
  type CvExtractedField,
  type ApplyDraftResult,
} from '@/lib/cvDrafts';

/**
 * PB-CV-AUTO-PROFILE-001 — Revisión del perfil preparado a partir del CV.
 *
 * UX PRINCIPAL (ticket §3): "Hemos preparado tu perfil a partir de tu CV.
 * Revisa los datos y confirma." Revisión de 1-2 minutos, mobile-first,
 * pensada para usuarios con poca familiaridad tecnológica:
 *   - campos NUEVOS → pre-marcados (un toque basta);
 *   - campos CONFLICTIVOS → sin marcar, mostrando perfil vs CV (elección
 *     explícita; nunca sobrescritura silenciosa — ticket §4);
 *   - certificaciones → SIEMPRE con distintivo "declarada / no verificada"
 *     (ticket §6);
 *   - low confidence → nunca autoaceptado (ticket §13).
 */

/** Columnas de perfil por campo, para detectar conflictos (espejo del backend). */
const FIELD_TO_PROFILE_KEY: Record<string, string> = {
  full_name: 'full_name',
  title: 'title',
  location: 'location',
  summary: 'bio',
  years_experience: 'years_experience',
  availability: 'availability_status',
  willing_to_travel: 'willing_to_travel',
  willing_to_relocate: 'willing_to_relocate',
};

const PROFILE_TO_FIELD: Record<string, string> = {
  availability: 'availability',
};

type FieldState = {
  field: CvExtractedField;
  kind: 'new' | 'equal' | 'conflict' | 'info';
  profileValue: unknown;
  accepted: boolean;
  overwrite: boolean;
};

export default function CVReview() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { profile, refreshProfile } = useAuth();

  const [draft, setDraft] = useState<CvDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [conflicts, setConflicts] = useState<ApplyDraftResult['conflicts']>([]);
  const [done, setDone] = useState<ApplyDraftResult | null>(null);

  useEffect(() => {
    let alive = true;
    getPendingDraft().then((d) => {
      if (!alive) return;
      setDraft(d);
      setLoading(false);
      if (d) {
        trackEvent('cv_profile_review_started', {
          draft_id: d.id,
          source_channel: d.source_channel,
          fields_count: d.extracted_fields.length,
          experiences_count: d.proposed_experiences.length,
        }, { dedupeKey: d.id });
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const profileValues = useMemo(() => {
    const p = (profile ?? {}) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [field, key] of Object.entries(FIELD_TO_PROFILE_KEY)) {
      out[field] = p[key] ?? null;
    }
    return out;
  }, [profile]);

  const classify = useCallback(
    (f: CvExtractedField): FieldState => {
      if (CV_INFO_ONLY_FIELDS.has(f.field)) {
        return { field: f, kind: 'info', profileValue: null, accepted: false, overwrite: false };
      }
      if (f.field === 'skills' || f.field === 'welding_processes' || f.field === 'disciplines') {
        // Merge de skills: siempre añaditivo, sin conflicto posible.
        const existing = Array.isArray(profile?.skills) ? (profile?.skills as string[]) : [];
        const incoming = Array.isArray(f.value) ? (f.value as string[]) : [];
        const allNew = incoming.every((s) => !existing.includes(s));
        return {
          field: f,
          kind: incoming.length === 0 ? 'equal' : allNew ? 'new' : 'equal',
          profileValue: existing,
          accepted: incoming.length > 0 && allNew,
          overwrite: false,
        };
      }
      const pv = profileValues[f.field];
      const cvValue = normalizeForCompare(f.field, f.value);
      const profileEmpty = pv === null || pv === undefined || pv === '' ||
        (Array.isArray(pv) && pv.length === 0);
      if (profileEmpty) {
        return { field: f, kind: 'new', profileValue: pv, accepted: true, overwrite: false };
      }
      if (cvValue !== null && String(cvValue) === String(normalizeForCompare(f.field, pv))) {
        return { field: f, kind: 'equal', profileValue: pv, accepted: true, overwrite: false };
      }
      return { field: f, kind: 'conflict', profileValue: pv, accepted: false, overwrite: false };
    },
    [profile, profileValues],
  );

  const fieldStates = useMemo(
    () => (draft ? draft.extracted_fields.map(classify) : []),
    [draft, classify],
  );

  const [overrides, setOverrides] = useState<Record<string, { accepted: boolean; overwrite: boolean }>>({});
  const stateOf = (s: FieldState) => overrides[s.field.field] ?? { accepted: s.accepted, overwrite: s.overwrite };
  const setAccepted = (s: FieldState, accepted: boolean) =>
    setOverrides((prev) => ({
      ...prev,
      [s.field.field]: {
        accepted,
        // Aceptar un conflicto ES la elección explícita del valor del CV.
        overwrite: accepted && s.kind === 'conflict',
      },
    }));

  const [acceptedExperiences, setAcceptedExperiences] = useState<Record<string, boolean>>({});
  const [acceptedCerts, setAcceptedCerts] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!draft) return;
    setAcceptedExperiences(
      Object.fromEntries(draft.proposed_experiences.map((e) => [e.local_id, e.confidence !== 'low'])),
    );
    setAcceptedCerts(
      Object.fromEntries(draft.proposed_certifications.map((c) => [c.local_id, c.confidence !== 'low'])),
    );
  }, [draft]);

  const handleApply = async () => {
    if (!draft) return;
    setApplying(true);
    setConflicts([]);

    const fields = fieldStates
      .filter((s) => {
        const st = stateOf(s);
        return st.accepted && s.kind !== 'info' && s.kind !== 'equal' && s.field.confidence !== 'low';
      })
      .map((s) => {
        const st = stateOf(s);
        return {
          field: s.field.field,
          action: 'accept' as const,
          value: s.field.value ?? undefined,
          overwrite: st.overwrite || undefined,
        };
      });

    const experiences = draft.proposed_experiences
      .filter((e) => acceptedExperiences[e.local_id])
      .map((e) => ({ local_id: e.local_id, action: 'accept' as const }));

    const certifications = draft.proposed_certifications
      .filter((c) => acceptedCerts[c.local_id])
      .map((c) => c.local_id);

    const result = await applyCvDraft({ draftId: draft.id, fields, experiences, certificationIds: certifications });
    setApplying(false);

    if (result.ok) {
      setDone(result);
      await refreshProfile();
      toast.success(t('cvReview.confirmSuccess'));
      return;
    }
    if (result.error === 'conflict') {
      setConflicts(result.conflicts ?? []);
      toast.error(t('cvReview.conflictPrompt'));
      return;
    }
    if (result.error === 'profile_not_ready') {
      // Auth-only sin perfil aún: ensureProfile corre en el hook de auth;
      // reintentar una vez tras refrescar.
      await refreshProfile();
      toast.error(t('cvReview.retryProfileNotReady'));
      return;
    }
    toast.error(t('cvReview.applyError'));
  };

  const handleDismiss = async () => {
    if (!draft) return;
    const ok = await dismissDraft(draft.id);
    if (ok) {
      toast.success(t('cvReview.dismissed'));
      navigate('/profile');
    } else {
      toast.error(t('cvReview.applyError'));
    }
  };

  // ─── Estados de carga / vacío ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#f59e0b]" />
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center">
        <CheckCircle2 className="mx-auto mb-4 h-14 w-14 text-green-500" />
        <h1 className="mb-2 text-2xl font-bold text-zinc-100">{t('cvReview.doneTitle')}</h1>
        <p className="mb-6 text-zinc-400">{t('cvReview.doneBody')}</p>
        <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-left text-sm text-zinc-300">
          <p>{t('cvReview.doneApplied', { fields: done.fields_confirmed_count ?? 0, experiences: (done.experiences_applied_count ?? 0) + (done.experiences_merged_count ?? 0) })}</p>
        </div>
        <Button onClick={() => navigate('/profile')} className="bg-[#f59e0b] text-zinc-950 hover:bg-[#d97706]">
          {t('cvReview.goToProfile')} <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center">
        <FileText className="mx-auto mb-4 h-12 w-12 text-zinc-600" />
        <h1 className="mb-2 text-xl font-bold text-zinc-100">{t('cvReview.noDraftTitle')}</h1>
        <p className="mb-6 text-zinc-400">{t('cvReview.noDraftBody')}</p>
        <Button variant="outline" onClick={() => navigate('/profile')} className="border-zinc-700 text-zinc-200">
          {t('cvReview.goToProfile')}
        </Button>
      </div>
    );
  }

  if (draft.extraction_status === 'extraction_failed') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center">
        <AlertCircle className="mx-auto mb-4 h-12 w-12 text-amber-500" />
        <h1 className="mb-2 text-xl font-bold text-zinc-100">{t('cvReview.failedTitle')}</h1>
        <p className="mb-6 text-zinc-400">{t('cvReview.failedBody')}</p>
        <Button onClick={() => navigate('/profile')} className="bg-[#f59e0b] text-zinc-950 hover:bg-[#d97706]">
          {t('cvReview.completeManually')}
        </Button>
      </div>
    );
  }

  // ─── Revisión ──────────────────────────────────────────────────────────────
  const newOrConflict = fieldStates.filter((s) => s.kind === 'new' || s.kind === 'conflict');
  const equalFields = fieldStates.filter((s) => s.kind === 'equal');

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <PageHeader
        title={t('cvReview.title')}
        description={t('cvReview.subtitle', { file: draft.file_name })}
      />

      {conflicts && conflicts.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-700/50 bg-amber-950/30 p-3 text-sm text-amber-200">
          <div className="mb-1 flex items-center gap-2 font-medium">
            <ShieldAlert className="h-4 w-4" /> {t('cvReview.conflictPrompt')}
          </div>
          <ul className="list-inside list-disc text-amber-200/80">
            {conflicts.map((c) => (
              <li key={c.field}>{t(CV_FIELD_LABEL_KEYS[c.field] ?? c.field)}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-6">
        {/* Campos propuestos */}
        {newOrConflict.length > 0 && (
          <section className="rounded-lg border border-zinc-800 bg-zinc-900/40">
            <header className="border-b border-zinc-800 px-4 py-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
                {t('cvReview.sections.proposed')}
              </h2>
            </header>
            <ul className="divide-y divide-zinc-800">
              {newOrConflict.map((s) => {
                const st = stateOf(s);
                const low = s.field.confidence === 'low';
                return (
                  <li key={s.field.field} className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={st.accepted}
                        onCheckedChange={(v) => setAccepted(s, v === true)}
                        disabled={low}
                        className="mt-1"
                        aria-label={t(CV_FIELD_LABEL_KEYS[s.field.field] ?? s.field.field)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-zinc-200">
                            {t(CV_FIELD_LABEL_KEYS[s.field.field] ?? s.field.field)}
                          </span>
                          {low && (
                            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-400">
                              {t('cvReview.lowConfidence')}
                            </span>
                          )}
                          {s.kind === 'conflict' && (
                            <span className="rounded bg-amber-950/60 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-400">
                              {t('cvReview.conflictBadge')}
                            </span>
                          )}
                        </div>
                        {s.kind === 'conflict' ? (
                          <div className="mt-1 space-y-1 text-sm">
                            <p className="text-zinc-400">
                              <span className="text-zinc-500">{t('cvReview.yourProfile')}:</span>{' '}
                              {formatValue(PROFILE_TO_FIELD[s.field.field] ?? s.field.field, s.profileValue, i18n.language)}
                            </p>
                            <p className="text-zinc-200">
                              <span className="text-zinc-500">{t('cvReview.fromCv')}:</span>{' '}
                              {formatValue(s.field.field, s.field.value, i18n.language)}
                            </p>
                            <p className="text-xs text-zinc-500">{t('cvReview.conflictHint')}</p>
                          </div>
                        ) : (
                          <p className="mt-0.5 truncate text-sm text-zinc-300">
                            {formatValue(s.field.field, s.field.value, i18n.language)}
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Experiencias propuestas */}
        {draft.proposed_experiences.length > 0 && (
          <section className="rounded-lg border border-zinc-800 bg-zinc-900/40">
            <header className="border-b border-zinc-800 px-4 py-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
                {t('cvReview.sections.experience')}
              </h2>
            </header>
            <ul className="divide-y divide-zinc-800">
              {draft.proposed_experiences.map((e) => (
                <li key={e.local_id} className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={acceptedExperiences[e.local_id] ?? false}
                      onCheckedChange={(v) =>
                        setAcceptedExperiences((prev) => ({ ...prev, [e.local_id]: v === true }))}
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-zinc-200">{e.position || '—'}</p>
                      <p className="text-sm text-zinc-400">{e.company_name || '—'}</p>
                      <p className="text-xs text-zinc-500">{formatRange(e, t)}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Certificaciones declaradas (SIEMPRE unverified) */}
        {draft.proposed_certifications.length > 0 && (
          <section className="rounded-lg border border-zinc-800 bg-zinc-900/40">
            <header className="border-b border-zinc-800 px-4 py-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
                {t('cvReview.sections.certifications')}
              </h2>
            </header>
            <ul className="divide-y divide-zinc-800">
              {draft.proposed_certifications.map((c) => (
                <li key={c.local_id} className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={acceptedCerts[c.local_id] ?? false}
                      onCheckedChange={(v) => setAcceptedCerts((prev) => ({ ...prev, [c.local_id]: v === true }))}
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-zinc-200">{c.name}</p>
                      <p className="mt-0.5 text-xs text-amber-400/90">{t('cvReview.declaredUnverified')}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Ya coincidentes con el perfil (solo lectura) */}
        {equalFields.length > 0 && (
          <section className="rounded-lg border border-zinc-800/60 bg-zinc-900/20">
            <header className="px-4 pt-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                {t('cvReview.sections.alreadyMatching')}
              </h2>
            </header>
            <ul className="px-4 py-2 text-sm text-zinc-500">
              {equalFields.map((s) => (
                <li key={s.field.field} className="flex items-center gap-2 py-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                  {t(CV_FIELD_LABEL_KEYS[s.field.field] ?? s.field.field)}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* CTA principal */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            onClick={handleApply}
            disabled={applying}
            className="flex-1 bg-[#f59e0b] text-zinc-950 hover:bg-[#d97706]"
            size="lg"
          >
            {applying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('cvReview.confirmCta')}
          </Button>
          <Button onClick={handleDismiss} variant="outline" disabled={applying} className="border-zinc-700 text-zinc-300" size="lg">
            {t('cvReview.dismissCta')}
          </Button>
        </div>
        <p className="text-center text-xs text-zinc-600">{t('cvReview.footerNote')}</p>
      </div>
    </div>
  );
}

// ─── Formateo de valores ─────────────────────────────────────────────────────

function normalizeForCompare(field: string, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (field === 'availability') {
    const v = String(value).toLowerCase();
    if (v === 'immediately') return 'available_immediately';
    const m = v.match(/^from\s+(.+)$/);
    if (m) return 'available_from_date';
    return v;
  }
  return String(value);
}

function formatValue(field: string, value: unknown, lang: string): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.join(', ');
  if (field === 'willing_to_travel' || field === 'willing_to_relocate') {
    return value === true ? '✓' : '—';
  }
  if (field === 'availability') {
    const v = String(value);
    if (v === 'immediately') return lang.startsWith('es') ? 'Inmediata' : 'Immediately';
    return v.replace(/^from\s+/i, '');
  }
  if (field === 'years_experience') return `${value} ${lang.startsWith('es') ? 'años' : 'years'}`;
  return String(value);
}

function formatRange(
  e: { start_date: string | null; end_date: string | null; currently_working: boolean },
  t: (k: string) => string,
): string {
  const start = e.start_date ?? '';
  const end = e.currently_working ? t('cvReview.present') : (e.end_date ?? '');
  return [start, end].filter(Boolean).join(' — ');
}
