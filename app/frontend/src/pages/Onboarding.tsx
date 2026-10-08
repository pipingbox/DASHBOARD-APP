import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { hasCompletedOnboarding } from '@/lib/onboarding';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';

/**
 * PB-GROWTH-GATE-ONBOARDING-001 — explicit resume entry point.
 *
 * A postponed user ("Completar después") reaches the app shell normally and
 * re-enters the guided wizard from the dashboard CTA (/onboarding). The
 * wizard restores the draft/profile data, so onboarding resumes from a
 * sensible state. Users who already finished are sent to their dashboard.
 */
export default function Onboarding() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  if (profile && hasCompletedOnboarding(profile.onboarding_status)) {
    const target = profile.role === 'company' ? '/company-dashboard' : '/dashboard';
    return <Navigate to={target} replace />;
  }

  const handleComplete = (selectedAccountType?: string) => {
    // The postpone path already navigates to /dashboard itself; this covers
    // the canonical completion path.
    const target = selectedAccountType === 'company' ? '/company-dashboard' : '/dashboard';
    navigate(target, { replace: true });
  };

  return <OnboardingWizard onComplete={handleComplete} />;
}
