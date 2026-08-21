import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
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

    // Check if onboarding_completed flag exists on profile
    const checkOnboarding = async () => {
      const { data } = await supabase
        .from(TABLES.profiles)
        .select('onboarding_completed, title, skills, location, role, account_type')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data) {
        // Show onboarding if:
        // 1. onboarding_completed is not true, AND
        // 2. Profile is essentially empty (no title+location) OR role is 'user' (no account type selected)
        const hasOnboarded = data.onboarding_completed === true;
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
      
      // Update profile in DB
      await supabase
        .from(TABLES.profiles)
        .update({ 
          role: newRole, 
          account_type: selectedAccountType,
          onboarding_completed: true 
        })
        .eq('user_id', user.id);

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