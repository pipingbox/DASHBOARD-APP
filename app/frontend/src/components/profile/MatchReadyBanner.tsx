import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { AlertCircle } from 'lucide-react';

/**
 * Banner contextual que indica cuando faltan datos esenciales para matching fiable.
 * PB-MATCHING-NOTIFICATIONS-001
 */
export function MatchReadyBanner() {
  const { t } = useTranslation();
  const { profile } = useAuth();

  if (!profile) return null;

  const hasName = Boolean(profile.full_name?.trim());
  const hasProfession = Boolean(profile.title?.trim() || profile.position?.trim());
  const hasLocation = Boolean(profile.location?.trim());
  const hasAvailability = Boolean(profile.availability_status?.trim());
  const hasExperience = profile.years_experience !== null && profile.years_experience !== undefined;
  const hasSkills = Array.isArray(profile.skills) && profile.skills.length > 0;

  const isMatchReady = hasName && hasProfession && hasLocation && hasAvailability && hasExperience && hasSkills;

  if (isMatchReady) return null;

  return (
    <div className="flex items-start gap-3 border border-amber-900/50 bg-amber-950/30 p-4 text-amber-200">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
      <div>
        <p className="text-sm font-medium text-amber-100">
          {t('profile.matchReadyTitle', 'Complete your profile to receive more accurate job matches.')}
        </p>
        <p className="mt-1 text-xs text-amber-200/70">
          {t(
            'profile.matchReadyHint',
            'Name, profession, location, availability, experience and skills are required for reliable matching.',
          )}
        </p>
      </div>
    </div>
  );
}
