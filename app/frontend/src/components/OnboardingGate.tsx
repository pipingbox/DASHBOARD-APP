import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { supabase, TABLES } from '@/lib/supabase';
import { hasCompletedOnboarding } from '@/lib/onboarding';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';

interface OnboardingGateProps {
  children: React.ReactNode;
}

/**
 * Wraps protected routes. If the user hasn't completed onboarding,
 * shows the onboarding wizard instead of the normal content.
 */
export function OnboardingGate({ children }: OnboardingGateProps) {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
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

    // Read the canonical onboarding_status column (see lib/onboarding.ts)
    const checkOnboarding = async () => {
      const { data, error } = await supabase
        .from(TABLES.profiles)
        .select('onboarding_status, title, skills, location, role, account_type')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        // Fail closed on the wizard, not open: if we cannot read the status we must not
        // assume the user still needs onboarding, or a transient error would trap an
        // already-onboarded user in the wizard on every load.
        console.error('[OnboardingGate] Failed to read onboarding status:', error);
        setChecked(true);
        return;
      }

      if (data) {
        // Show onboarding if:
        // 1. onboarding is not completed, AND
        // 2. Profile is essentially empty (no title+location) OR role is 'user' (no account type selected)
        const hasOnboarded = hasCompletedOnboarding(data.onboarding_status);
        const hasBasicInfo = !!(data.title && data.location);
        const needsRoleSelection = data.role === 'user' || !data.account_type;
        
        if (!hasOnboarded && (!hasBasicInfo || needsRoleSelection)) {
          setShowOnboarding(true);
        }
      }
      setChecked(true);
    };

    checkOnboarding();
  }, [user, profile]);

  const handleOnboardingComplete = async (selectedAccountType?: string) => {
    setShowOnboarding(false);
    
    // If user selected a role during onboarding, update profile and navigate accordingly
    if (selectedAccountType && user) {
      const newRole = selectedAccountType === 'company' ? 'company' : 'worker';
      
      // Update profile in DB.
      // Only role/account_type here: OnboardingWizard already persisted the canonical
      // onboarding_status in its own UPDATE, and rewriting it here would risk downgrading
      // MARKETPLACE_READY back to a weaker state.
      const { error } = await supabase
        .from(TABLES.profiles)
        .update({
          role: newRole,
          account_type: selectedAccountType,
        })
        .eq('user_id', user.id);

      if (error) {
        console.error('[OnboardingGate] Failed to persist selected role:', error);
      }

      // Refresh profile from DB to update local state
      await refreshProfile();

      // Navigate to the correct dashboard
      if (newRole === 'company') {
        navigate('/company/dashboard', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    }
  };

  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#f59e0b] border-t-transparent" />
      </div>
    );
  }

  if (showOnboarding) {
    return <OnboardingWizard onComplete={handleOnboardingComplete} />;
  }

  return <>{children}</>;
}