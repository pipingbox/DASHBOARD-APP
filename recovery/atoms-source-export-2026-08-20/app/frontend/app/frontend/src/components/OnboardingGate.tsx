import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase, TABLES } from '@/lib/supabase';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';

interface OnboardingGateProps {
  children: React.ReactNode;
}

/**
 * Wraps protected routes. If the user hasn't completed onboarding,
 * shows the onboarding wizard instead of the normal content.
 */
export function OnboardingGate({ children }: OnboardingGateProps) {
  const { user, profile } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!user || !profile) {
      setChecked(true);
      return;
    }

    // Admin users skip onboarding
    if (profile.role === 'admin') {
      setChecked(true);
      setShowOnboarding(false);
      return;
    }

    // Check if onboarding_completed flag exists on profile
    // We need to query the raw profile since our Profile interface might not include it
    const checkOnboarding = async () => {
      const { data } = await supabase
        .from(TABLES.profiles)
        .select('onboarding_completed, title, skills, location')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data) {
        // Show onboarding if not completed AND profile is essentially empty
        const hasOnboarded = data.onboarding_completed === true;
        const hasBasicInfo = !!(data.title && data.location);
        
        if (!hasOnboarded && !hasBasicInfo) {
          setShowOnboarding(true);
        }
      }
      setChecked(true);
    };

    checkOnboarding();
  }, [user, profile]);

  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#f59e0b] border-t-transparent" />
      </div>
    );
  }

  if (showOnboarding) {
    return <OnboardingWizard onComplete={() => setShowOnboarding(false)} />;
  }

  return <>{children}</>;
}