import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, TABLES } from '@/lib/supabase';
import { getStoredReferralCode, clearStoredReferralCode, validateReferralCode } from '@/lib/referrals';
import { notifyReferralJoined } from '@/lib/notifications';
import { getAppBaseUrl, getAuthRedirectUrl } from '@/lib/constants';
import { ONBOARDING_STATUS } from '@/lib/onboarding';
import { edgeFunctionUrl } from '@/lib/supabase';

export interface Profile {
  id: string;
  user_id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  role: string;
  title: string | null;
  position: string | null;
  company: string | null;
  location: string | null;
  years_experience: number | null;
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
  phone_e164: string | null;
  phone_country_code: string | null;
  phone_verified_at: string | null;
  whatsapp_opt_in: boolean | null;
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

const PRIMARY_ADMIN_EMAIL = 'gaspardelhierromata@gmail.com';

/**
 * Complete the referral assignment via backend Edge Function.
 * This is the SINGLE source of truth for referral processing.
 * Called after profile creation succeeds.
 */
async function completeReferralAssignment(
  userId: string,
  userEmail: string | undefined,
  referrerId: string,
  referralCode: string,
): Promise<boolean> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) return false;

    const res = await fetch(edgeFunctionUrl('referrals-apply'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ referred_id: userId, referrer_id: referrerId }),
    });

    if (!res.ok) {
      return false;
    }

    notifyReferralJoined(referrerId, userEmail?.split('@')[0] || 'Someone').catch(() => {});

    try {
      localStorage.setItem('pipingbox_last_referral_debug', JSON.stringify({
        userId,
        referrerId,
        referralCode,
        success: true,
        timestamp: new Date().toISOString(),
        source: 'ensureProfile',
      }));
    } catch { /* ignore */ }

    return true;
  } catch {
    return false;
  }
}

async function bootstrapReferrals(userId: string, storedCode: string | null): Promise<void> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) return;
    await fetch(edgeFunctionUrl('referrals-bootstrap'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ referral_code: storedCode }),
    });
  } catch {
    // Non-critical; dashboard recovery will retry.
  }
}

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
        if (authUser.email === PRIMARY_ADMIN_EMAIL) {
          // Promote to admin via backend; local synthetic profile reflects it immediately.
          try {
            const { data: sessionData } = await supabase.auth.getSession();
            const accessToken = sessionData.session?.access_token;
            if (accessToken) {
              await fetch(edgeFunctionUrl('ensure-admin-role'), {
                method: 'POST',
                headers: { Authorization: `Bearer ${accessToken}` },
              });
            }
          } catch {
            // Non-blocking; the next load will retry.
          }
          setProfile({
            id: authUser.id,
            user_id: authUser.id,
            full_name: authUser.user_metadata?.full_name || 'Admin',
            username: authUser.email?.split('@')[0] ?? null,
            avatar_url: null,
            bio: null,
            role: 'admin',
            title: null,
            position: null,
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
            phone_e164: null,
            phone_country_code: null,
            phone_verified_at: null,
            whatsapp_opt_in: false,
          });
          return;
        }
      }

      if (existing) {
        console.log('PROFILE EXISTS', existing.user_id);
        const profileData = existing as Profile;
        if (authUser.email === PRIMARY_ADMIN_EMAIL && profileData.role !== 'admin') {
          // Promote to admin via backend instead of direct UPDATE.
          try {
            const { data: sessionData } = await supabase.auth.getSession();
            const accessToken = sessionData.session?.access_token;
            if (accessToken) {
              await fetch(edgeFunctionUrl('ensure-admin-role'), {
                method: 'POST',
                headers: { Authorization: `Bearer ${accessToken}` },
              });
            }
          } catch (err) {
            console.error('[ensureProfile] ensure-admin-role failed:', err);
          }
          profileData.role = 'admin';
        }
        setProfile(profileData);

        // RECOVERY: If existing profile has no referred_by_user_id, check if there's
        // a stored referral code that was never processed (e.g. OAuth redirect lost it)
        const existingReferredBy = (existing as Record<string, unknown>).referred_by_user_id;
        if (!existingReferredBy) {
          try {
            const storedCode = getStoredReferralCode();
            if (storedCode) {
              console.log('[REFERRAL_RECOVERY] Found unprocessed referral code for existing profile:', storedCode);
              const referrerId = await validateReferralCode(storedCode);
              if (referrerId && referrerId !== authUser.id) {
                await completeReferralAssignment(authUser.id, authUser.email, referrerId, storedCode);
                console.log('[REFERRAL_RECOVERY] ✅ Referral recovered for existing profile');
              }
              clearStoredReferralCode();
            }
          } catch (recoveryErr) {
            console.error('[REFERRAL_RECOVERY] Recovery failed:', recoveryErr);
          }
        }
        return;
      }

      // Step 2: No existing profile — create one with ALL required fields
      const storedAccountType = localStorage.getItem('pipingbox_account_type') as 'worker' | 'company' | null;
      const metaAccountType = authUser.user_metadata?.account_type as 'worker' | 'company' | undefined;
      const resolvedAccountType = storedAccountType || metaAccountType || null;
      // Admin assignment is backend-only. If this is the primary admin, create as
      // 'user' first and then call ensure-admin-role Edge Function.
      const isPrimaryAdmin = authUser.email === PRIMARY_ADMIN_EMAIL;
      const assignedRole = isPrimaryAdmin
        ? 'user'
        : (resolvedAccountType === 'company' ? 'company' : (resolvedAccountType === 'worker' ? 'worker' : 'user'));
      const assignedAccountType = isPrimaryAdmin
        ? 'user'
        : (resolvedAccountType || 'worker');
      const fullName = fallbackName || authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'Engineer';

      // Check for referral code from URL/localStorage/sessionStorage/cookie
      let referrerId: string | null = null;
      let referralCode: string | null = null;
      try {
        referralCode = getStoredReferralCode();
        if (referralCode) {
          console.log('[REFERRAL] Found stored referral code during profile creation:', referralCode);
          const validatedId = await validateReferralCode(referralCode);
          if (validatedId && validatedId !== authUser.id) {
            referrerId = validatedId;
            console.log('[REFERRAL] Validated referrer:', referrerId);
          } else {
            console.log('[REFERRAL] Code invalid or self-referral, ignoring');
          }
        }
      } catch (refErr) {
        console.error('[REFERRAL] Code processing error:', refErr);
      }

      const newProfile: Record<string, unknown> = {
        user_id: authUser.id,
        full_name: fullName,
        username: authUser.email?.split('@')[0] ?? null,
        role: assignedRole,
        account_type: assignedAccountType,
        cv_visible: false,
        availability_status: 'not_specified',
        // profile_completion, marketplace_ready y onboarding_status usan defaults de backend.
      };

      // Clear stored account type after use
      try { localStorage.removeItem('pipingbox_account_type'); } catch { /* ignore */ }

      const { data: inserted, error: insertError } = await supabase
        .from(TABLES.profiles)
        .insert(newProfile)
        .select('*')
        .maybeSingle();

      if (insertError) {
        console.error('PROFILE CREATION ERROR:', insertError.message);

        // Retry without optional fields.
        const minimalProfile: Record<string, unknown> = {
          user_id: authUser.id,
          full_name: fullName,
          username: authUser.email?.split('@')[0] ?? null,
          role: assignedRole,
          account_type: newProfile.account_type,
        };

        const { data: retryInserted, error: retryError } = await supabase
          .from(TABLES.profiles)
          .insert(minimalProfile)
          .select('*')
          .maybeSingle();

        if (retryError) {
          console.error('PROFILE CREATION ERROR (retry):', retryError.message);

          // Last resort: try absolute minimal.
          const bareMinimal = {
            user_id: authUser.id,
            full_name: fullName,
            username: authUser.email?.split('@')[0] ?? null,
            role: assignedRole,
          };

          const { data: bareInserted, error: bareError } = await supabase
            .from(TABLES.profiles)
            .insert(bareMinimal)
            .select('*')
            .maybeSingle();

          if (bareError) {
            console.error('PROFILE CREATION ERROR (bare):', bareError.message);
            setProfile({
              id: authUser.id,
              user_id: authUser.id,
              full_name: fullName,
              username: authUser.email?.split('@')[0] ?? null,
              avatar_url: null,
              bio: null,
              role: assignedRole,
              title: null,
              position: null,
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
              phone_e164: null,
              phone_country_code: null,
              phone_verified_at: null,
              whatsapp_opt_in: false,
            });
            // DON'T clear referral code — Dashboard recovery will try again
            return;
          }

          console.log('PROFILE CREATED (bare)', bareInserted?.user_id);
          setProfile((bareInserted as Profile) ?? null);
          await bootstrapReferrals(authUser.id, referralCode);
          clearStoredReferralCode();
          return;
        }

        console.log('PROFILE CREATED (minimal)', retryInserted?.user_id);
        setProfile((retryInserted as Profile) ?? null);
        await bootstrapReferrals(authUser.id, referralCode);
        clearStoredReferralCode();
        return;
      }

      console.log('PROFILE CREATED', inserted?.user_id);
      setProfile((inserted as Profile) ?? null);

      // Bootstrap referral code and assignment via backend.
      await bootstrapReferrals(authUser.id, referralCode);

      // Only clear referral code AFTER everything is done
      clearStoredReferralCode();

    } catch (err) {
      console.error(`PROFILE CREATION ERROR (unexpected, attempt ${attempt}):`, err);

      if (attempt < MAX_RETRIES) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(`[ensureProfile] Retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return ensureProfile(authUser, fallbackName, attempt + 1);
      }

      console.error('[ensureProfile] All retries exhausted, using synthetic profile');
      if (authUser.email === PRIMARY_ADMIN_EMAIL) {
        setProfile({
          id: authUser.id,
          user_id: authUser.id,
          full_name: 'Admin',
          username: 'admin',
          avatar_url: null,
          bio: null,
          role: 'admin',
          title: null,
          position: null,
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
          phone_e164: null,
          phone_country_code: null,
          phone_verified_at: null,
          whatsapp_opt_in: false,
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
          position: null,
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
          phone_e164: null,
          phone_country_code: null,
          phone_verified_at: null,
          whatsapp_opt_in: false,
        });
      }
      // DON'T clear referral code on failure — let Dashboard recovery handle it
    }
  };

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        // Race getSession against an 8-second timeout to prevent infinite loading in iframes
        const sessionResult = await Promise.race([
          supabase.auth.getSession(),
          new Promise<{ data: { session: null }; error: null }>((resolve) =>
            setTimeout(() => resolve({ data: { session: null }, error: null }), 8000)
          ),
        ]);

        if (!mounted) return;

        const initial = sessionResult.data.session;
        setSession(initial);
        setUser(initial?.user ?? null);
        if (initial?.user) {
          await ensureProfile(initial.user);
        }
      } catch (err) {
        console.warn('Auth session initialization failed:', err);
        if (!mounted) return;
        setSession(null);
        setUser(null);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, next) => {
      setSession(next);
      setUser(next?.user ?? null);
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
    // Re-store referral code to ensure it survives the signup process
    try {
      const storedRef = getStoredReferralCode();
      if (storedRef) {
        console.log('[SIGNUP] Referral code preserved before signup:', storedRef);
      }
    } catch { /* ignore */ }

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
    // Re-store referral code before OAuth redirect to ensure persistence
    try {
      const storedRef = getStoredReferralCode();
      if (storedRef) {
        // Force re-store to refresh timestamp and ensure all storage backends have it
        const { storeReferralCode } = await import('@/lib/referrals');
        storeReferralCode(storedRef);
        console.log('[OAUTH] Referral code re-stored before Google redirect:', storedRef);
      }
    } catch { /* ignore */ }

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