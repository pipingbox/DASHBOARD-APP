import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { supabase, TABLES } from '@/lib/supabase';
import { AlertCircle, Briefcase } from 'lucide-react';
import {
  countQualifyingExperiences,
  isCanonicalWorker,
  isMatchable,
  readinessGaps,
  type WorkforceReadinessInput,
} from '@/lib/workforceReadiness';
import { useWorkforceReadinessTracking } from '@/lib/workforceReadinessEvents';
import { ExperienceQuickCapture } from '@/components/profile/ExperienceQuickCapture';

/**
 * Banner contextual que indica qué dato exacto falta para progresar en el
 * funnel D11 (COMPLETE → WORKFORCE READY → MATCHABLE).
 *
 * PB-MATCHING-NOTIFICATIONS-001 · PB-WORKFORCE-ACTIVATION WFA-004 (D18):
 * este componente NO contiene lógica propia de readiness. Todos los
 * predicates provienen exclusivamente de `@/lib/workforceReadiness.ts`
 * (single source of truth). Un test arquitectónico
 * (tests/match-ready-arch.spec.ts) falla si reaparecen predicates locales.
 *
 * WFA-001: cuando el gap canónico es `experience`, el banner ofrece un CTA
 * directo al Quick Experience Capture (sin buscar la sección manualmente).
 */
export function MatchReadyBanner() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [counts, setCounts] = useState<{
    qualifyingExperience: number;
    certification: number;
    loaded: boolean;
  }>({ qualifyingExperience: 0, certification: 0, loaded: false });
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const userId = profile?.user_id ?? null;

  // Counts refresh on mount, whenever the profile is refreshed after a
  // section save (profile_completion is recalculated on every save), and
  // after a Quick Experience Capture save (refreshKey).
  // The experience count uses the canonical QUALIFYING EXPERIENCE predicate
  // from workforceReadiness.ts — raw row counts are never used.
  useEffect(() => {
    if (!userId) {
      setCounts({ qualifyingExperience: 0, certification: 0, loaded: false });
      return;
    }
    let cancelled = false;
    (async () => {
      const [exp, cert] = await Promise.all([
        supabase
          .from(TABLES.workerExperiences)
          .select('position, company_name')
          .eq('user_id', userId),
        supabase
          .from(TABLES.workerCertifications)
          .select('user_id', { count: 'exact', head: true })
          .eq('user_id', userId),
      ]);
      if (cancelled) return;
      setCounts({
        qualifyingExperience: countQualifyingExperiences(exp.data ?? []),
        certification: cert.count ?? 0,
        loaded: true,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, profile?.profile_completion, refreshKey]);

  // Canonical D11 input — data only, no predicates here.
  const input: WorkforceReadinessInput = useMemo(
    () => ({
      role: profile?.role ?? null,
      full_name: profile?.full_name ?? null,
      title: profile?.title ?? null,
      location: profile?.location ?? null,
      years_experience: profile?.years_experience ?? null,
      bio: profile?.bio ?? null,
      skills: profile?.skills ?? null,
      availability_status: profile?.availability_status ?? null,
      profile_visibility: profile?.profile_visibility ?? null,
      cv_visible: profile?.cv_visible ?? null,
      qualifying_experience_count: counts.qualifyingExperience,
      certification_count: counts.certification,
      verified_certification_count: 0,
    }),
    [profile, counts.qualifyingExperience, counts.certification],
  );

  // GA4 transitions: only real D11 state changes emit events; the baseline
  // snapshot is recorded once async data has loaded, without emitting.
  useWorkforceReadinessTracking(input, Boolean(profile) && counts.loaded);

  if (!profile || isMatchable(input)) return null;

  const gaps = readinessGaps(input);
  const topGaps = gaps.slice(0, 3);
  // CTA condition comes from the canonical gap list, never a local predicate.
  const experienceGapPresent =
    isCanonicalWorker(input) && gaps.some((g) => g.key === 'experience');

  return (
    <div className="flex items-start gap-3 border border-amber-900/50 bg-amber-950/30 p-4 text-amber-200">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
      <div className="flex-1">
        <p className="text-sm font-medium text-amber-100">
          {t(
            'profile.matchReadyTitle',
            'Complete your profile to receive more accurate job matches.',
          )}
        </p>
        {topGaps.length > 0 ? (
          <ul className="mt-1 space-y-0.5">
            {topGaps.map((gap) => (
              <li key={gap.key} className="text-xs text-amber-200/70">
                {t(`profile.matchReadyGap.${gap.key}`, gap.key)}{' '}
                <span className="text-amber-300/80">
                  → {gap.unlocks === 'WORKFORCE_READY'
                    ? t('profile.matchReadyUnlocks.workforceReady', 'Workforce Ready')
                    : gap.unlocks === 'MATCHABLE'
                      ? t('profile.matchReadyUnlocks.matchable', 'Matchable')
                      : t('profile.matchReadyUnlocks.complete', 'Complete')}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-amber-200/70">
            {t(
              'profile.matchReadyHint',
              'Name, profession, location, availability, experience and skills are required for reliable matching.',
            )}
          </p>
        )}
        {experienceGapPresent && (
          <button
            type="button"
            onClick={() => setQuickCaptureOpen(true)}
            className="mt-3 inline-flex items-center gap-2 bg-[#f59e0b] px-3 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-black hover:bg-[#d97706]"
          >
            <Briefcase className="h-3.5 w-3.5" />
            {t('profile.matchReadyAddExperience', 'Add work experience')}
          </button>
        )}
      </div>
      <ExperienceQuickCapture
        open={quickCaptureOpen}
        onOpenChange={setQuickCaptureOpen}
        onSaved={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  );
}
