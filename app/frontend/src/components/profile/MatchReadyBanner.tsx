import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { supabase, TABLES } from '@/lib/supabase';
import { AlertCircle, ArrowRight, Briefcase } from 'lucide-react';
import {
  countQualifyingExperiences,
  isCanonicalWorker,
  isMatchable,
  readinessGaps,
  type WorkforceReadinessInput,
} from '@/lib/workforceReadiness';
import { useWorkforceReadinessTracking } from '@/lib/workforceReadinessEvents';
import { journeySignature, toJourneyItems, type JourneyItem } from '@/lib/completionJourney';
import { trackWorkforceEvent } from '@/lib/analytics';
import { ExperienceQuickCapture } from '@/components/profile/ExperienceQuickCapture';
import type { WorkExperience } from '@/lib/workerProfile';

/**
 * PROFILE COMPLETION JOURNEY (WFA-002, P0-B) — single canonical journey that
 * shows the worker exactly which readiness requirements are missing, why each
 * one matters and the direct action that fixes it.
 *
 * PB-MATCHING-NOTIFICATIONS-001 · PB-WORKFORCE-ACTIVATION WFA-004 (D18):
 * this component contains NO readiness predicates. All predicates come
 * exclusively from `@/lib/workforceReadiness.ts` (single source of truth);
 * `@/lib/completionJourney.ts` only maps the canonical gaps to presentation
 * targets. The architectural test (tests/match-ready-arch.spec.ts) fails if
 * predicates reappear here.
 *
 * Post-action feedback: after any section save the profile context refreshes
 * (profile_completion is recalculated server-side on every save) and the
 * counts effect below re-runs, so completed items disappear and readiness
 * transitions update without a logout/login cycle. A failed save leaves the
 * profile untouched, so the gap item simply stays — no false completion.
 *
 * WFA-001: when the canonical gap is `experience`, the action opens the
 * Quick Experience Capture directly.
 */
export function MatchReadyBanner({
  onAddExperienceDetails,
  onNavigateToTarget,
}: {
  onAddExperienceDetails: (experience: WorkExperience) => void;
  /** Deep-link: scroll to (and focus, for fields) a remediation target. */
  onNavigateToTarget?: (elementId: string, focus: boolean) => void;
}) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [counts, setCounts] = useState<{
    qualifyingExperience: number;
    certification: number;
    loaded: boolean;
  }>({ qualifyingExperience: 0, certification: 0, loaded: false });
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const lastJourneySigRef = useRef<string>('');

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

  const gaps = useMemo(() => (profile ? readinessGaps(input) : []), [profile, input]);
  const canonicalWorker = isCanonicalWorker(input);
  const matchable = isMatchable(input);
  // Quick Capture opens only while the canonical experience gap still exists
  // (re-checked at click time — state may have changed since the render).
  const experienceGapPresent = gaps.some((g) => g.key === 'experience');

  const journeyItems = useMemo(() => {
    // Canonical worker gate (WFA-001/D11): non-canonical roles never see the
    // journey — the `cohort` gap has no in-journey remediation.
    if (!profile || !canonicalWorker || matchable) return [];
    return toJourneyItems(gaps);
  }, [profile, canonicalWorker, matchable, gaps]);

  // completion_journey_viewed: once per gap-set change (re-renders with the
  // same gaps never re-emit — same dedupe rule as the D18 transition events).
  useEffect(() => {
    if (!counts.loaded || journeyItems.length === 0) return;
    const sig = journeySignature(journeyItems);
    if (sig === lastJourneySigRef.current) return;
    lastJourneySigRef.current = sig;
    trackWorkforceEvent('completion_journey_viewed');
  }, [counts.loaded, journeyItems]);

  if (!profile || !canonicalWorker || matchable || journeyItems.length === 0) return null;

  const handleAction = (item: JourneyItem) => {
    trackWorkforceEvent('completion_gap_selected', { field: item.key });
    if (item.target.kind === 'quick_capture') {
      if (experienceGapPresent) setQuickCaptureOpen(true);
      return;
    }
    onNavigateToTarget?.(item.target.elementId, item.target.kind === 'field');
  };

  return (
    <div
      data-testid="completion-journey"
      className="border border-amber-900/50 bg-amber-950/30 p-4 text-amber-200"
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-100">
            {t('profile.journey.title', 'Complete your profile to unlock workforce readiness')}
          </p>
          <p className="mt-0.5 text-xs text-amber-200/70">
            {t(
              'profile.journey.subtitle',
              'Each item below is a real requirement. Completing it updates your status immediately.',
            )}
          </p>
          <ul className="mt-3 space-y-2">
            {journeyItems.map((item, index) => (
              <li
                key={item.key}
                data-testid={`journey-item-${item.key}`}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border border-amber-900/40 bg-amber-950/20 px-3 py-2"
              >
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-amber-400/80">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-amber-100">
                    {t(`profile.matchReadyGap.${item.key}`, item.key)}
                  </p>
                  <p className="text-[11px] text-amber-200/60">
                    {t(`profile.journey.current.${item.key}`, 'Missing')}
                    {' → '}
                    {t(`profile.journey.required.${item.key}`, 'Required')}
                  </p>
                  <p className="text-[11px] text-amber-300/80">
                    {t('profile.journey.unlocks', 'Unlocks')}:{' '}
                    {item.unlocks === 'WORKFORCE_READY'
                      ? t('profile.matchReadyUnlocks.workforceReady', 'Workforce Ready')
                      : item.unlocks === 'MATCHABLE'
                        ? t('profile.matchReadyUnlocks.matchable', 'Matchable')
                        : t('profile.matchReadyUnlocks.complete', 'Complete')}
                  </p>
                </div>
                <button
                  type="button"
                  data-testid={`journey-action-${item.key}`}
                  onClick={() => handleAction(item)}
                  className="inline-flex items-center gap-1.5 border border-amber-700/60 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-100 hover:border-[#f59e0b] hover:text-[#f59e0b]"
                >
                  {item.target.kind === 'quick_capture' ? (
                    <Briefcase className="h-3 w-3" />
                  ) : (
                    <ArrowRight className="h-3 w-3" />
                  )}
                  {t(`profile.journey.action.${item.key}`, 'Fix now')}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <ExperienceQuickCapture
        open={quickCaptureOpen}
        onOpenChange={setQuickCaptureOpen}
        onSaved={() => setRefreshKey((k) => k + 1)}
        onAddDetails={(experience) => {
          setQuickCaptureOpen(false);
          onAddExperienceDetails(experience);
        }}
      />
    </div>
  );
}
