import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { supabase, TABLES } from '@/lib/supabase';
import { AlertCircle } from 'lucide-react';
import {
  isMatchable,
  readinessGaps,
  type WorkforceReadinessInput,
} from '@/lib/workforceReadiness';
import { useWorkforceReadinessTracking } from '@/lib/workforceReadinessEvents';

/**
 * Banner contextual que indica qué dato exacto falta para progresar en el
 * funnel D11 (COMPLETE → WORKFORCE READY → MATCHABLE).
 *
 * PB-MATCHING-NOTIFICATIONS-001 · PB-WORKFORCE-ACTIVATION WFA-004 (D18):
 * este componente NO contiene lógica propia de readiness. Todos los
 * predicates provienen exclusivamente de `@/lib/workforceReadiness.ts`
 * (single source of truth). Un test arquitectónico
 * (tests/match-ready-arch.spec.ts) falla si reaparecen predicates locales.
 */
export function MatchReadyBanner() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [counts, setCounts] = useState<{
    experience: number;
    certification: number;
    loaded: boolean;
  }>({ experience: 0, certification: 0, loaded: false });

  const userId = profile?.user_id ?? null;

  // Counts refresh on mount and whenever the profile is refreshed after a
  // section save (profile_completion is recalculated on every save).
  useEffect(() => {
    if (!userId) {
      setCounts({ experience: 0, certification: 0, loaded: false });
      return;
    }
    let cancelled = false;
    (async () => {
      const [exp, cert] = await Promise.all([
        supabase
          .from(TABLES.workerExperiences)
          .select('user_id', { count: 'exact', head: true })
          .eq('user_id', userId),
        supabase
          .from(TABLES.workerCertifications)
          .select('user_id', { count: 'exact', head: true })
          .eq('user_id', userId),
      ]);
      if (cancelled) return;
      setCounts({
        experience: exp.count ?? 0,
        certification: cert.count ?? 0,
        loaded: true,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, profile?.profile_completion]);

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
      experience_count: counts.experience,
      certification_count: counts.certification,
      verified_certification_count: 0,
    }),
    [profile, counts.experience, counts.certification],
  );

  // GA4 transitions: only real D11 state changes emit events; the baseline
  // snapshot is recorded once async data has loaded, without emitting.
  useWorkforceReadinessTracking(input, Boolean(profile) && counts.loaded);

  if (!profile || isMatchable(input)) return null;

  const gaps = readinessGaps(input).slice(0, 3);

  return (
    <div className="flex items-start gap-3 border border-amber-900/50 bg-amber-950/30 p-4 text-amber-200">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
      <div>
        <p className="text-sm font-medium text-amber-100">
          {t(
            'profile.matchReadyTitle',
            'Complete your profile to receive more accurate job matches.',
          )}
        </p>
        {gaps.length > 0 ? (
          <ul className="mt-1 space-y-0.5">
            {gaps.map((gap) => (
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
      </div>
    </div>
  );
}
