import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, TABLES } from '@/lib/supabase';
import { getStoredReferralCode, clearStoredReferralCode, validateReferralCode, isDefinitiveReferralOutcome, type ReferralsBootstrapOutcome } from '@/lib/referrals';
import { notifyReferralJoined } from '@/lib/notifications';
import { getAuthCallbackUrl } from '@/lib/constants';
import { classifyAuthError, isNewSignupIdentity, type AuthErrorCode } from '@/lib/authFlow';
import { getTrafficProps } from '@/lib/jobs/attribution';
import { ONBOARDING_STATUS } from '@/lib/onboarding';
import { edgeFunctionUrl } from '@/lib/supabase';
import { withTimeout } from '@/lib/withTimeout';
import {
  identifyUser,
  resetObservabilityUser,
  trackEvent,
  detectOrigin,
  getCorrelationId,
} from '@/lib/observability';
import i18n, { toSupportedCode, DEFAULT_LANGUAGE } from '@/i18n';
import {
  USER_METADATA_LANG_KEY,
  PROFILE_LANGUAGE_COLUMN,
  readUserLanguage,
  applyUserLanguageFromSession,
} from '@/lib/userLanguage';

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
  // PB-STORAGE-SECURITY-001: canonical CV location; cv_file_url is the legacy fallback.
  cv_storage_bucket: string | null;
  cv_storage_path: string | null;
  cv_visible: boolean;
  show_avatar: boolean;
  profile_completion: number;
  onboarding_status: string | null;
  onboarding_postponed_at: string | null;
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
  /**
   * PB-AUTH-LOCK-ONBOARDING-STALL-001: true when the initial session check
   * could not complete within its deadline. This is NOT a logout: the UI must
   * offer a recoverable retry instead of redirecting to /login.
   */
  authUnavailable: boolean;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ error: string | null; errorCode: AuthErrorCode | null }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    accountType?: 'worker' | 'company',
  ) => Promise<{
    error: string | null;
    errorCode: AuthErrorCode | null;
    confirmationRequired: boolean;
    isNewUser: boolean;
  }>;
  signInWithGoogle: (
    accountType?: 'worker' | 'company',
  ) => Promise<{ error: string | null; errorCode: AuthErrorCode | null }>;
  resendConfirmation: (
    email: string,
  ) => Promise<{ error: string | null; errorCode: AuthErrorCode | null }>;
  hasActiveSession: () => Promise<boolean>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const PRIMARY_ADMIN_EMAIL = 'gaspardelhierromata@gmail.com';

// PB-AUTH-LOCK-ONBOARDING-STALL-001 — bootstrap deadlines. The lock ladder
// (5 s acquire + 3 s steal) resolves in ~8 s worst case; these caps sit
// safely above it and only fire when something beyond the lock is broken.
const SESSION_BOOTSTRAP_TIMEOUT_MS = 12_000;
const PROFILE_BOOTSTRAP_TIMEOUT_MS = 20_000;

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

    const applyBody = await res.json().catch(() => null) as { referral_id?: string | null } | null;
    if (applyBody?.referral_id) {
      notifyReferralJoined(referrerId, applyBody.referral_id).catch(() => {});
    }

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

async function bootstrapReferrals(userId: string, storedCode: string | null): Promise<ReferralsBootstrapOutcome | null> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) return null;
    const res = await fetch(edgeFunctionUrl('referrals-bootstrap'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ referral_code: storedCode }),
    });
    if (!res.ok) return null;
    return (await res.json()) as ReferralsBootstrapOutcome;
  } catch {
    // Non-critical; dashboard recovery will retry.
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authUnavailable, setAuthUnavailable] = useState(false);

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
            cv_storage_bucket: null,
            cv_storage_path: null,
            cv_visible: false,
            show_avatar: true,
            profile_completion: 100,
            onboarding_status: 'MARKETPLACE_READY',
            onboarding_postponed_at: null,
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
              // Resolve SERVER-SIDE via referrals-bootstrap: the profiles
              // table has no cross-user select policy, so client-side
              // validation always returned zero rows and the stored code was
              // then cleared, losing the attribution (PB-REFERRAL-ALDO-001).
              // Only clear on DEFINITIVE outcomes; keep on transient ones.
              const boot = await bootstrapReferrals(authUser.id, storedCode);
              const attribution = String(boot?.attribution ?? '');
              if (isDefinitiveReferralOutcome(attribution)) {
                console.log('[REFERRAL_RECOVERY] Recovery outcome (definitive):', attribution);
                clearStoredReferralCode();
              } else {
                // Transient/unknown (network, 5xx, 'none') — keep the code;
                // the Dashboard recovery will retry.
                console.warn('[REFERRAL_RECOVERY] Recovery inconclusive, keeping code:', attribution || 'no-response');
              }
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
      // PB-I18N-EMAIL-001: réplica de user_metadata.lang (fuente de verdad).
      // Sin valor en el servidor no se infiere nada (la columna queda NULL).
      const metaLang = readUserLanguage(authUser);
      if (metaLang) newProfile[PROFILE_LANGUAGE_COLUMN] = metaLang;

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
              cv_storage_bucket: null,
              cv_storage_path: null,
              cv_visible: false,
              show_avatar: true,
              profile_completion: 10,
              onboarding_status: null,
              onboarding_postponed_at: null,
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
          {
            const boot = await bootstrapReferrals(authUser.id, referralCode);
            // Only consume the stored code on a definitive backend outcome;
            // a transient bootstrap failure keeps it for Dashboard recovery.
            if (!referralCode || isDefinitiveReferralOutcome(boot?.attribution)) {
              clearStoredReferralCode();
            }
          }
          return;
        }

        console.log('PROFILE CREATED (minimal)', retryInserted?.user_id);
        setProfile((retryInserted as Profile) ?? null);
        {
          const boot = await bootstrapReferrals(authUser.id, referralCode);
          if (!referralCode || isDefinitiveReferralOutcome(boot?.attribution)) {
            clearStoredReferralCode();
          }
        }
        return;
      }

      console.log('PROFILE CREATED', inserted?.user_id);
      setProfile((inserted as Profile) ?? null);

      // Bootstrap referral code and assignment via backend.
      const boot = await bootstrapReferrals(authUser.id, referralCode);

      // Only consume the stored code on a definitive backend outcome; a
      // transient bootstrap failure keeps it for Dashboard recovery.
      if (!referralCode || isDefinitiveReferralOutcome(boot?.attribution)) {
        clearStoredReferralCode();
      }

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
          cv_storage_bucket: null,
          cv_storage_path: null,
          cv_visible: false,
          show_avatar: true,
          profile_completion: 100,
          onboarding_status: 'MARKETPLACE_READY',
          onboarding_postponed_at: null,
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
          cv_storage_bucket: null,
          cv_storage_path: null,
          cv_visible: false,
          show_avatar: true,
          profile_completion: 10,
          onboarding_status: null,
          onboarding_postponed_at: null,
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
        // PB-AUTH-LOCK-ONBOARDING-STALL-001: bound the bootstrap getSession.
        // The resilient auth lock (lib/resilientAuthLock) makes a permanent
        // hang nearly impossible (worst case ~8 s: 5 s acquire + 3 s steal),
        // so a deadline miss here means something is deeply wrong — but a
        // timeout is NEVER proof of "no session". The previous behaviour
        // (resolve session:null on timeout) produced silent logouts of real
        // users; now the UI gets a recoverable `authUnavailable` state and
        // keeps any session that arrives late via onAuthStateChange.
        const race = await withTimeout(supabase.auth.getSession(), SESSION_BOOTSTRAP_TIMEOUT_MS);

        if (!mounted) return;

        if (race.timedOut) {
          console.warn('[useAuth] Initial session check exceeded its deadline — NOT treating as logout.');
          trackEvent('auth_session_resolution_timeout', {
            route: window.location.pathname,
            correlation_id: getCorrelationId(),
          });
          setAuthUnavailable(true);
          return;
        }

        const initial = race.value?.data.session ?? null;
        setSession(initial);
        setUser(initial?.user ?? null);
        if (initial?.user) {
          // PB-I18N-EMAIL-001: la preferencia guardada en el servidor prevalece
          // sobre la UI local (sincronización entre dispositivos). Síncrono y
          // sin red: seguro antes del bootstrap del perfil.
          applyUserLanguageFromSession(initial.user);
          // Bound the profile bootstrap as well: a stalled PostgREST call
          // must not hold the whole app on the loading screen. The shell
          // renders with profile=null and refreshes recover later.
          await withTimeout(ensureProfile(initial.user), PROFILE_BOOTSTRAP_TIMEOUT_MS);
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

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      setUser(next?.user ?? null);
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        // PB-I18N-EMAIL-001: la preferencia guardada en el servidor prevalece
        // sobre la UI local (sincronización entre dispositivos). Síncrono y
        // sin red: seguro dentro del callback de auth.
        if (next?.user) applyUserLanguageFromSession(next.user);
        // A late INITIAL_SESSION resolves a prior bootstrap timeout.
        if (next?.user) setAuthUnavailable(false);
        // PB-AUTH-LOCK-ONBOARDING-STALL-001: NEVER await PostgREST work
        // inside the auth-state callback. auth-js notifies subscribers while
        // holding its internal lock queue, and every supabase-js REST call
        // re-enters auth.getSession() for the token: awaiting ensureProfile
        // here self-deadlocks the whole client (demonstrated in QA — boot
        // stuck past the 12 s deadline with a perfectly healthy lock; the
        // React state updated synchronously but the profile stayed empty).
        // Detach + bound the refresh instead; the UI tolerates profile=null.
        if (next?.user) {
          const u = next.user;
          void withTimeout(ensureProfile(u), PROFILE_BOOTSTRAP_TIMEOUT_MS).then(({ timedOut }) => {
            if (timedOut) console.warn('[useAuth] Detached profile refresh exceeded its deadline.');
          });
        }
        // PB-OBSERVABILITY-001: link anonymous session to technical user id.
        if (next?.user) identifyUser(next.user.id);
      } else if (event === 'SIGNED_OUT') {
        setProfile(null);
        resetObservabilityUser();
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    const errorCode = classifyAuthError(error);
    if (errorCode === 'email_not_confirmed') {
      trackEvent('signin_blocked_unconfirmed', {
        route: '/login',
        correlation_id: getCorrelationId(),
        provider: 'email',
        status: 'blocked',
        reason_code: 'email_not_confirmed',
      });
    }
    return { error: error?.message ?? null, errorCode };
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

    // PB-OBSERVABILITY-001: funnel signup_started (closed schema, origin only).
    // PB-JOBS-ATTRIBUTION-001: campaign attribution snapshot (traffic_* /
    // first_touch_*), persisted pre-registration in localStorage.
    trackEvent(
      'signup_started',
      { origin: detectOrigin(), account_type: accountType || 'worker', ...getTrafficProps() },
      { dedupeKey: 'signup' },
    );

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: getAuthCallbackUrl('/dashboard', i18n.language, 'confirmation'),
        data: {
          full_name: fullName,
          account_type: accountType || 'worker',
          // PB-I18N-EMAIL-001: idioma elegido en la UI durante el registro,
          // normalizado a languages.json. Lo lee el Send Email Auth Hook para
          // localizar asunto y cuerpo del correo de confirmación.
          [USER_METADATA_LANG_KEY]: toSupportedCode(i18n.resolvedLanguage || i18n.language) ?? DEFAULT_LANGUAGE,
        },
      },
    });
    if (error) {
      return {
        error: error.message,
        errorCode: classifyAuthError(error),
        confirmationRequired: false,
        isNewUser: false,
      };
    }
    const confirmationRequired = !data.session;
    const isNewUser = isNewSignupIdentity(data.user);
    if (data.user && isNewUser) {
      trackEvent(
        'auth_created',
        { origin: detectOrigin(), account_type: accountType || 'worker', ...getTrafficProps() },
        { dedupeKey: `auth:${data.user.id}` },
      );
    }
    if (data.user && data.session) {
      await ensureProfile(data.user, fullName);
    }
    if (confirmationRequired) {
      trackEvent('signup_confirmation_required', {
        route: '/register',
        correlation_id: getCorrelationId(),
        provider: 'email',
        status: isNewUser ? 'created' : 'neutral',
        attempt_bucket: isNewUser ? 'first' : 'retry',
      });
    }
    return {
      error: null,
      errorCode: null,
      confirmationRequired,
      isNewUser,
    };
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
        redirectTo: getAuthCallbackUrl('/dashboard', i18n.language, 'google'),
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });
    return {
      error: error?.message ?? null,
      errorCode: classifyAuthError(error),
    };
  };

  const resendConfirmation = async (email: string) => {
    trackEvent('confirmation_resend_requested', {
      route: window.location.pathname,
      correlation_id: getCorrelationId(),
      provider: 'email',
      status: 'requested',
    });
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: getAuthCallbackUrl('/dashboard', i18n.language, 'confirmation'),
      },
    });
    const errorCode = classifyAuthError(error);
    if (error) {
      trackEvent('confirmation_resend_failed', {
        route: window.location.pathname,
        correlation_id: getCorrelationId(),
        provider: 'email',
        status: 'failed',
        reason_code: errorCode === 'rate_limit' ? 'rate_limited' : 'unknown',
      });
      return { error: error.message, errorCode };
    }
    trackEvent('confirmation_resend_succeeded', {
      route: window.location.pathname,
      correlation_id: getCorrelationId(),
      provider: 'email',
      status: 'succeeded',
    });
    return { error: null, errorCode: null };
  };

  const hasActiveSession = async () => {
    const { data } = await supabase.auth.getSession();
    return Boolean(data.session);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  const refreshProfile = async () => {
    // Bounded (PB-AUTH-LOCK-ONBOARDING-STALL-001): callers await this inside
    // finalize/postpone paths; a stalled read must not hold them hostage.
    if (user) await withTimeout(loadProfile(user.id), PROFILE_BOOTSTRAP_TIMEOUT_MS);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        loading,
        authUnavailable,
        signIn,
        signUp,
        signInWithGoogle,
        resendConfirmation,
        hasActiveSession,
        signOut,
        refreshProfile,
      }}
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