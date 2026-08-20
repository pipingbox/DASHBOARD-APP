import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, TABLES } from '@/lib/supabase';
import { getStoredReferralCode, clearStoredReferralCode, validateReferralCode } from '@/lib/referrals';
import { getAppBaseUrl, getAuthRedirectUrl } from '@/lib/constants';
import { isPrimaryAdmin } from '@/lib/admin';

export interface Profile {
  id: string;
  user_id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  role: string;
  title: string | null;
  company: string | null;
  location: string | null;
  years_experience: number;
  skills: string[];
  cv_url: string | null;
  cv_file_url: string | null;
  cv_file_name: string | null;
  cv_visible: boolean;
  show_avatar: boolean;
  profile_completion: number;
  onboarding_status: string | null;
  marketplace_ready: boolean;
  profile_visibility: string | null;
  availability_status: string | null;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    accountType?: 'worker' | 'company',
  ) => Promise<{ error: string | null }>;
  signInWithGoogle: (accountType?: 'worker' | 'company') => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// TD-02: primary admin email now comes from lib/admin.ts (VITE_PRIMARY_ADMIN_EMAIL env var).

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (userId: string) => {
    const { data } = await supabase
      .from(TABLES.profiles)
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    setProfile((data as Profile) ?? null);
  };

  const ensureProfile = async (authUser: User, fallbackName?: string, attempt = 1) => {
    const MAX_RETRIES = 3;
    try {
      // Step 1: Check if profile already exists
      const { data: existing, error: fetchError } = await supabase
        .from(TABLES.profiles)
        .select('*')
        .eq('user_id', authUser.id)
        .maybeSingle();

      if (fetchError) {
        console.error('PROFILE FETCH ERROR:', fetchError.message);
        // CRITICAL FALLBACK: If we can't read the profile but this is the primary admin,
        // create a synthetic profile so the app doesn't lock them out
        if (isPrimaryAdmin(authUser.email)) {
          setProfile({
            id: authUser.id,
            user_id: authUser.id,
            full_name: authUser.user_metadata?.full_name || 'Admin',
            username: authUser.email?.split('@')[0] ?? null,
            avatar_url: null,
            bio: null,
            role: 'admin',
            title: null,
            company: null,
            location: null,
            years_experience: 0,
            skills: [],
            cv_url: null,
            cv_file_url: null,
            cv_file_name: null,
            cv_visible: false,
            show_avatar: true,
            profile_completion: 100,
            onboarding_status: 'MARKETPLACE_READY',
            marketplace_ready: true,
            profile_visibility: 'public',
            availability_status: 'available',
          });
          return;
        }
        // For non-admin users, attempt to create profile anyway (RLS might block SELECT but allow INSERT)
        // Fall through to creation logic below
      }

      if (existing) {
        console.log('PROFILE EXISTS', existing.user_id);
        const profileData = existing as Profile;
        // Force admin role for primary admin account
        if (isPrimaryAdmin(authUser.email) && profileData.role !== 'admin') {
          supabase
            .from(TABLES.profiles)
            .update({ role: 'admin' })
            .eq('user_id', authUser.id)
            .then(() => {});
          profileData.role = 'admin';
        }
        setProfile(profileData);
        return;
      }

      // Step 2: No existing profile — create one with ALL required fields
      // Determine account type from: stored preference > user metadata > default
      const storedAccountType = localStorage.getItem('pipingbox_account_type') as 'worker' | 'company' | null;
      const metaAccountType = authUser.user_metadata?.account_type as 'worker' | 'company' | undefined;
      const resolvedAccountType = storedAccountType || metaAccountType || 'worker';
      const assignedRole = isPrimaryAdmin(authUser.email) ? 'admin' : (resolvedAccountType === 'company' ? 'company' : 'worker');
      const fullName = fallbackName || authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'Engineer';

      // Check for referral code from URL/localStorage/sessionStorage
      let referredBy: string | null = null;
      try {
        const storedCode = getStoredReferralCode();
        if (storedCode) {
          const referrerUserId = await validateReferralCode(storedCode);
          if (referrerUserId && referrerUserId !== authUser.id) {
            referredBy = referrerUserId;
          }
        }
      } catch (refErr) {
        console.error('Referral code processing error:', refErr);
      }

      const newProfile: Record<string, unknown> = {
        user_id: authUser.id,
        full_name: fullName,
        username: authUser.email?.split('@')[0] ?? null,
        role: assignedRole,
        account_type: assignedRole === 'admin' ? 'admin' : resolvedAccountType,
        cv_visible: false,
        availability_status: 'not_specified',
        profile_completion: 10,
        referral_code: `PB-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      };

      // Clear stored account type after use
      try { localStorage.removeItem('pipingbox_account_type'); } catch { /* ignore */ }

      // Add referral info if available
      if (referredBy) {
        newProfile.referred_by = referredBy;
      }

      const { data: inserted, error: insertError } = await supabase
        .from(TABLES.profiles)
        .insert(newProfile)
        .select('*')
        .maybeSingle();

      if (insertError) {
        console.error('PROFILE CREATION ERROR:', insertError.message);

        // Retry without optional fields in case some columns don't exist yet
        const minimalProfile = {
          user_id: authUser.id,
          full_name: fullName,
          username: authUser.email?.split('@')[0] ?? null,
          role: assignedRole,
        };

        const { data: retryInserted, error: retryError } = await supabase
          .from(TABLES.profiles)
          .insert(minimalProfile)
          .select('*')
          .maybeSingle();

        if (retryError) {
          console.error('PROFILE CREATION ERROR (retry):', retryError.message);
          // Fallback: use synthetic profile so user isn't stuck
          setProfile({
            id: authUser.id,
            user_id: authUser.id,
            full_name: fullName,
            username: authUser.email?.split('@')[0] ?? null,
            avatar_url: null,
            bio: null,
            role: assignedRole,
            title: null,
            company: null,
            location: null,
            years_experience: 0,
            skills: [],
            cv_url: null,
            cv_file_url: null,
            cv_file_name: null,
            cv_visible: false,
            show_avatar: true,
            profile_completion: 10,
            onboarding_status: null,
            marketplace_ready: false,
            profile_visibility: null,
            availability_status: 'not_specified',
          });
          return;
        }

        console.log('PROFILE CREATED (minimal)', retryInserted?.user_id);
        setProfile((retryInserted as Profile) ?? null);

        // Clear referral code after successful profile creation
        try { clearStoredReferralCode(); } catch { /* ignore */ }
        return;
      }

      console.log('PROFILE CREATED', inserted?.user_id);
      setProfile((inserted as Profile) ?? null);

      // Clear referral code after successful profile creation
      try { clearStoredReferralCode(); } catch { /* ignore */ }

      // If referral was processed, increment referrer stats (non-blocking)
      if (referredBy) {
        try {
          const { data: referrerProfile } = await supabase
            .from(TABLES.profiles)
            .select('referral_count')
            .eq('user_id', referredBy)
            .maybeSingle();

          const currentCount = (referrerProfile?.referral_count as number) || 0;
          await supabase
            .from(TABLES.profiles)
            .update({ referral_count: currentCount + 1 })
            .eq('user_id', referredBy);
        } catch (statsErr) {
          console.error('Referral stats update error:', statsErr);
        }
      }
    } catch (err) {
      console.error(`PROFILE CREATION ERROR (unexpected, attempt ${attempt}):`, err);

      // Retry with exponential backoff if we haven't exceeded max retries
      if (attempt < MAX_RETRIES) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(`[ensureProfile] Retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return ensureProfile(authUser, fallbackName, attempt + 1);
      }

      // Ultimate fallback after all retries exhausted
      console.error('[ensureProfile] All retries exhausted, using synthetic profile');
      if (isPrimaryAdmin(authUser.email)) {
        setProfile({
          id: authUser.id,
          user_id: authUser.id,
          full_name: 'Admin',
          username: 'admin',
          avatar_url: null,
          bio: null,
          role: 'admin',
          title: null,
          company: null,
          location: null,
          years_experience: 0,
          skills: [],
          cv_url: null,
          cv_file_url: null,
          cv_file_name: null,
          cv_visible: false,
          show_avatar: true,
          profile_completion: 100,
          onboarding_status: 'MARKETPLACE_READY',
          marketplace_ready: true,
          profile_visibility: 'public',
          availability_status: 'available',
        });
      } else {
        setProfile({
          id: authUser.id,
          user_id: authUser.id,
          full_name: authUser.email?.split('@')[0] || 'User',
          username: authUser.email?.split('@')[0] ?? null,
          avatar_url: null,
          bio: null,
          role: 'worker',
          title: null,
          company: null,
          location: null,
          years_experience: 0,
          skills: [],
          cv_url: null,
          cv_file_url: null,
          cv_file_name: null,
          cv_visible: false,
          show_avatar: true,
          profile_completion: 10,
          onboarding_status: null,
          marketplace_ready: false,
          profile_visibility: null,
          availability_status: 'not_specified',
        });
      }
    }
  };

  useEffect(() => {
    let mounted = true;

    (async () => {
      const {
        data: { session: initial },
      } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(initial);
      setUser(initial?.user ?? null);
      if (initial?.user) {
        await ensureProfile(initial.user);
      }
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, next) => {
      setSession(next);
      setUser(next?.user ?? null);
      // Only (re)load profile on meaningful auth changes — skip TOKEN_REFRESHED and
      // USER_UPDATED to avoid unnecessary re-renders that can disrupt in-flight
      // component fetches (e.g. when returning to the Dashboard via sidebar nav).
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        if (next?.user) await ensureProfile(next.user);
      } else if (event === 'SIGNED_OUT') {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUp = async (email: string, password: string, fullName: string, accountType?: 'worker' | 'company') => {
    // Store account type in localStorage so ensureProfile can read it
    if (accountType) {
      localStorage.setItem('pipingbox_account_type', accountType);
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: getAppBaseUrl(),
        data: { full_name: fullName, account_type: accountType || 'worker' },
      },
    });
    if (error) return { error: error.message };
    if (data.user) {
      await ensureProfile(data.user, fullName);
    }
    return { error: null };
  };

  const signInWithGoogle = async (accountType?: 'worker' | 'company') => {
    // Store account type before redirect so we can use it after OAuth callback
    if (accountType) {
      localStorage.setItem('pipingbox_account_type', accountType);
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getAuthRedirectUrl('/dashboard'),
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  const refreshProfile = async () => {
    if (user) await loadProfile(user.id);
  };

  return (
    <AuthContext.Provider
      value={{ session, user, profile, loading, signIn, signUp, signInWithGoogle, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}