import { supabase, TABLES } from '@/lib/supabase';

export interface Referral {
  id: string;
  referrer_id: string;
  referred_id: string;
  referred_email: string;
  status: 'pending' | 'verified' | 'rejected';
  created_at: string;
  verified_at: string | null;
}

export interface ReferralStats {
  totalReferrals: number;
  verifiedReferrals: number;
  currentLevel: number;
  nextLevelTarget: number;
  unlockedRewards: string[];
}

// Reward tiers
export const REWARD_TIERS = [
  { level: 1, target: 3, rewards: ['profile_premium', 'cv_tools', 'advanced_profile'] },
  { level: 2, target: 10, rewards: ['ai_features', 'ambassador_badge', 'early_access'] },
  { level: 3, target: 25, rewards: ['elite_badge', 'exclusive_features', 'premium_perks'] },
];

// Storage keys for referral persistence
const STORAGE_KEYS = {
  referralCode: 'pipingbox_referral_code',
  referralEmail: 'pipingbox_referral_email',
  referralTimestamp: 'pipingbox_referral_timestamp',
} as const;

// Referral code validity period (30 days in ms)
const REFERRAL_VALIDITY_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Store referral code persistently (localStorage + sessionStorage + cookie fallback).
 * Survives page refresh and delayed registration.
 */
export function storeReferralCode(code: string): void {
  const timestamp = Date.now().toString();
  
  // Primary: localStorage
  try {
    localStorage.setItem(STORAGE_KEYS.referralCode, code);
    localStorage.setItem(STORAGE_KEYS.referralTimestamp, timestamp);
  } catch {
    // localStorage might be unavailable
  }

  // Backup: sessionStorage
  try {
    sessionStorage.setItem(STORAGE_KEYS.referralCode, code);
    sessionStorage.setItem(STORAGE_KEYS.referralTimestamp, timestamp);
  } catch {
    // sessionStorage might be unavailable
  }

  // Fallback: cookie (30 days expiry)
  try {
    const expires = new Date(Date.now() + REFERRAL_VALIDITY_MS).toUTCString();
    document.cookie = `pb_ref=${encodeURIComponent(code)};expires=${expires};path=/;SameSite=Lax`;
  } catch {
    // cookie might fail
  }
}

/**
 * Retrieve stored referral code from any available storage.
 * Returns null if expired or not found.
 */
export function getStoredReferralCode(): string | null {
  let code: string | null = null;
  let timestamp: string | null = null;

  // Try localStorage first
  try {
    code = localStorage.getItem(STORAGE_KEYS.referralCode);
    timestamp = localStorage.getItem(STORAGE_KEYS.referralTimestamp);
  } catch {
    // ignore
  }

  // Fallback to sessionStorage
  if (!code) {
    try {
      code = sessionStorage.getItem(STORAGE_KEYS.referralCode);
      timestamp = sessionStorage.getItem(STORAGE_KEYS.referralTimestamp);
    } catch {
      // ignore
    }
  }

  // Fallback to cookie
  if (!code) {
    try {
      const match = document.cookie.match(/pb_ref=([^;]+)/);
      if (match) {
        code = decodeURIComponent(match[1]);
        // Cookie has its own expiry, no need to check timestamp
        return code;
      }
    } catch {
      // ignore
    }
  }

  // Check if expired
  if (code && timestamp) {
    const storedTime = parseInt(timestamp, 10);
    if (Date.now() - storedTime > REFERRAL_VALIDITY_MS) {
      clearStoredReferralCode();
      return null;
    }
  }

  return code;
}

/**
 * Clear all stored referral data after processing.
 */
export function clearStoredReferralCode(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.referralCode);
    localStorage.removeItem(STORAGE_KEYS.referralEmail);
    localStorage.removeItem(STORAGE_KEYS.referralTimestamp);
  } catch {
    // ignore
  }
  try {
    sessionStorage.removeItem(STORAGE_KEYS.referralCode);
    sessionStorage.removeItem(STORAGE_KEYS.referralTimestamp);
  } catch {
    // ignore
  }
  try {
    document.cookie = 'pb_ref=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;SameSite=Lax';
  } catch {
    // ignore
  }
}

/**
 * Check if the referral widget should be visible based on user engagement.
 * Progressive visibility: only show after meaningful engagement.
 */
export async function shouldShowReferralWidget(userId: string): Promise<boolean> {
  try {
    // Check profile completeness (has full_name, title, skills)
    const { data: profile } = await supabase
      .from(TABLES.profiles)
      .select('full_name, title, skills, cv_url, cv_file_url')
      .eq('user_id', userId)
      .single();

    if (!profile) return false;

    const hasProfile = !!(profile.full_name && profile.title);
    const hasCV = !!(profile.cv_url || profile.cv_file_url);
    const hasSkills = !!(profile.skills && (profile.skills as string[]).length > 0);

    // Check tool usage
    const { count: toolCount } = await supabase
      .from(TABLES.toolUsage)
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    const hasToolUsage = (toolCount ?? 0) >= 1;

    // Check certifications
    const { count: certCount } = await supabase
      .from(TABLES.certifications)
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    const hasCerts = (certCount ?? 0) >= 1;

    // Show widget if user has completed profile basics OR has meaningful engagement
    return hasProfile && (hasCV || hasSkills || hasToolUsage || hasCerts);
  } catch {
    return false;
  }
}

/**
 * Generate a unique referral code for a user.
 * Format: PB-XXXXXXXX (8 alphanumeric chars)
 */
export function generateReferralCode(userId: string): string {
  const prefix = userId.replace(/-/g, '').substring(0, 6).toUpperCase();
  const suffix = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `PB-${prefix}${suffix}`;
}

/**
 * Get or create referral code for a user (stored in profile).
 */
export async function getUserReferralCode(userId: string): Promise<string> {
  const { data: profile } = await supabase
    .from(TABLES.profiles)
    .select('referral_code')
    .eq('user_id', userId)
    .single();

  if (profile?.referral_code) {
    return profile.referral_code as string;
  }

  // Generate and store new code
  const code = generateReferralCode(userId);
  await supabase
    .from(TABLES.profiles)
    .update({ referral_code: code })
    .eq('user_id', userId);

  return code;
}

/**
 * Validate a referral code exists and return the referrer's user_id.
 */
export async function validateReferralCode(code: string): Promise<string | null> {
  if (!code || !code.startsWith('PB-')) return null;

  const { data } = await supabase
    .from(TABLES.profiles)
    .select('user_id')
    .eq('referral_code', code)
    .single();

  return data?.user_id ?? null;
}

/**
 * Get referral statistics for a user.
 * Primary source: profiles.referred_by_user_id (set by admin manual assignment or signup flow).
 * Fallback: also checks the referrals table for legacy entries.
 */
export async function getReferralStats(userId: string): Promise<ReferralStats> {
  // Primary: count profiles where referred_by_user_id = current user
  const { count: profileReferralCount } = await supabase
    .from(TABLES.profiles)
    .select('*', { count: 'exact', head: true })
    .eq('referred_by_user_id', userId);

  // Fallback: count from legacy referrals table (verified only)
  const { count: legacyVerifiedCount } = await supabase
    .from(TABLES.referrals)
    .select('*', { count: 'exact', head: true })
    .eq('referrer_id', userId)
    .eq('status', 'verified');

  // Use the higher count between profiles-based and legacy table
  // This ensures both admin-assigned and organic referrals are counted
  const profileCount = profileReferralCount ?? 0;
  const legacyCount = legacyVerifiedCount ?? 0;
  const verified = Math.max(profileCount, legacyCount);

  // Total includes pending from legacy table + profile-based count
  const { count: legacyTotalCount } = await supabase
    .from(TABLES.referrals)
    .select('*', { count: 'exact', head: true })
    .eq('referrer_id', userId);

  const totalFromLegacy = legacyTotalCount ?? 0;
  const total = Math.max(profileCount, totalFromLegacy);

  // Determine current level and rewards
  let currentLevel = 0;
  let nextLevelTarget = REWARD_TIERS[0].target;
  const unlockedRewards: string[] = [];

  for (const tier of REWARD_TIERS) {
    if (verified >= tier.target) {
      currentLevel = tier.level;
      unlockedRewards.push(...tier.rewards);
    } else {
      nextLevelTarget = tier.target;
      break;
    }
  }

  if (currentLevel === 3) {
    nextLevelTarget = verified; // Already at max
  }

  return {
    totalReferrals: total,
    verifiedReferrals: verified,
    currentLevel,
    nextLevelTarget,
    unlockedRewards,
  };
}

/**
 * RECOVERY: Process a stored referral code after user registration/login.
 * This is a FALLBACK mechanism — the primary referral assignment happens in ensureProfile (useAuth.tsx).
 * Called on Dashboard load to catch any referrals that were missed during signup
 * (e.g. OAuth redirect cleared storage, race conditions, etc.)
 */
export async function processStoredReferral(userId: string, userEmail?: string): Promise<void> {
  console.log('[REFERRAL_RECOVERY] Dashboard recovery check for user:', userId);

  // Step 1: Check if user already has a referral assigned
  try {
    const { data: profile } = await supabase
      .from(TABLES.profiles)
      .select('referred_by_user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (profile?.referred_by_user_id) {
      console.log('[REFERRAL_RECOVERY] User already has referral assigned:', profile.referred_by_user_id);
      // Clean up any leftover stored codes
      clearStoredReferralCode();
      return;
    }
  } catch {
    // Continue with recovery attempt
  }

  // Step 2: Check for stored referral code
  const code = getStoredReferralCode();

  if (!code) {
    console.log('[REFERRAL_RECOVERY] No stored referral code found');
    return;
  }

  console.log('[REFERRAL_RECOVERY] Found unprocessed referral code:', code);

  try {
    // Validate the referral code and get referrer
    const referrerId = await validateReferralCode(code);

    if (!referrerId || referrerId === userId) {
      console.log('[REFERRAL_RECOVERY] Code invalid or self-referral, clearing');
      clearStoredReferralCode();
      return;
    }

    console.log('[REFERRAL_RECOVERY] Valid referrer found:', referrerId, '— assigning now');

    // Update profile with referred_by_user_id
    const { error: updateErr } = await supabase
      .from(TABLES.profiles)
      .update({ referred_by_user_id: referrerId })
      .eq('user_id', userId);

    if (updateErr) {
      console.error('[REFERRAL_RECOVERY] Failed to update profile:', updateErr.message);
    } else {
      console.log('[REFERRAL_RECOVERY] ✅ Profile referred_by_user_id set');
    }

    // Check if referral record already exists (prevent duplicates)
    const { data: existing } = await supabase
      .from(TABLES.referrals)
      .select('id')
      .eq('referrer_id', referrerId)
      .eq('referred_id', userId)
      .maybeSingle();

    if (!existing) {
      const { error: insertErr } = await supabase.from(TABLES.referrals).insert({
        referrer_id: referrerId,
        referred_id: userId,
        referred_email: userEmail || '',
        status: 'pending',
      });

      if (insertErr) {
        console.error('[REFERRAL_RECOVERY] Failed to create referral record:', insertErr.message);
      } else {
        console.log('[REFERRAL_RECOVERY] ✅ Referral record created');
      }
    }

    // Increment referrer stats
    try {
      const { data: referrerProfile } = await supabase
        .from(TABLES.profiles)
        .select('referral_count')
        .eq('user_id', referrerId)
        .maybeSingle();

      const currentCount = (referrerProfile?.referral_count as number) || 0;
      await supabase
        .from(TABLES.profiles)
        .update({ referral_count: currentCount + 1 })
        .eq('user_id', referrerId);
      console.log('[REFERRAL_RECOVERY] ✅ Referrer count incremented');
    } catch {
      // Non-critical
    }

    // Store debug info
    try {
      localStorage.setItem('pipingbox_last_referral_debug', JSON.stringify({
        userId,
        referrerId,
        referralCode: code,
        success: true,
        timestamp: new Date().toISOString(),
        source: 'dashboard_recovery',
      }));
    } catch { /* ignore */ }

    // Clear stored code after successful processing
    clearStoredReferralCode();
    console.log('[REFERRAL_RECOVERY] ✅ Recovery complete');

  } catch (err) {
    console.error('[REFERRAL_RECOVERY] Recovery failed:', err);
    // Don't clear the code on failure — next Dashboard load will retry
  }
}

/**
 * Verify a pending referral when conditions are met.
 * Conditions: email verified + profile has basic info (onboarding completed).
 */
export async function verifyReferralIfEligible(userId: string): Promise<void> {
  try {
    // Check if user has a pending referral where they are the referred
    const { data: pendingReferral } = await supabase
      .from(TABLES.referrals)
      .select('id, referrer_id')
      .eq('referred_id', userId)
      .eq('status', 'pending')
      .maybeSingle();

    if (!pendingReferral) return;

    // Check verification conditions:
    // 1. Profile has full_name (onboarding completed)
    // 2. Has at least one meaningful action (tool usage, cert, or experience)
    const { data: profile } = await supabase
      .from(TABLES.profiles)
      .select('full_name, title, skills')
      .eq('user_id', userId)
      .single();

    if (!profile?.full_name) return;

    // Check for minimum activity
    const { count: activityCount } = await supabase
      .from(TABLES.toolUsage)
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    const { count: certCount } = await supabase
      .from(TABLES.certifications)
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    const hasActivity = (activityCount ?? 0) >= 1 || (certCount ?? 0) >= 1;
    const hasOnboarding = !!(profile.full_name && (profile.title || (profile.skills as string[] | null)?.length));

    if (!hasOnboarding && !hasActivity) return;

    // Verify the referral
    await supabase
      .from(TABLES.referrals)
      .update({
        status: 'verified',
        verified_at: new Date().toISOString(),
      })
      .eq('id', pendingReferral.id);

  } catch {
    console.warn('[Referrals] Failed to verify referral');
  }
}

/**
 * Get the referral link for sharing.
 */
export function getReferralLink(code: string): string {
  const baseUrl = window.location.origin;
  return `${baseUrl}/register?ref=${code}`;
}

/**
 * Copy referral link to clipboard with proper error handling.
 */
export async function copyReferralLink(code: string): Promise<boolean> {
  const link = getReferralLink(code);
  try {
    await navigator.clipboard.writeText(link);
    return true;
  } catch {
    // Fallback for older browsers or insecure contexts
    try {
      const textArea = document.createElement('textarea');
      textArea.value = link;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      textArea.style.top = '-9999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textArea);
      return success;
    } catch {
      return false;
    }
  }
}

/**
 * Copy referral code to clipboard.
 */
export async function copyReferralCode(code: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(code);
    return true;
  } catch {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = code;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      textArea.style.top = '-9999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textArea);
      return success;
    } catch {
      return false;
    }
  }
}

/**
 * Share referral link using Web Share API with fallback.
 */
export async function shareReferralLink(code: string, title: string, message: string): Promise<boolean> {
  const link = getReferralLink(code);

  // Try native Web Share API first
  if (navigator.share) {
    try {
      await navigator.share({
        title,
        text: message,
        url: link,
      });
      return true;
    } catch (err) {
      // User cancelled or share failed - fall back to copy
      if ((err as Error).name === 'AbortError') {
        return false; // User cancelled, don't fallback
      }
    }
  }

  // Fallback: copy to clipboard
  return copyReferralLink(code);
}

/**
 * Build WhatsApp share URL.
 */
export function getWhatsAppShareUrl(code: string, message: string): string {
  const link = getReferralLink(code);
  const text = encodeURIComponent(`${message}\n${link}`);
  return `https://wa.me/?text=${text}`;
}

/**
 * Diagnostic info for admin referral debugging.
 */
export interface ReferralDiagnostic {
  userId: string;
  email: string | null;
  fullName: string | null;
  hasProfile: boolean;
  referredByUserId: string | null;
  referredByName: string | null;
  referralCode: string | null;
  referralRecordExists: boolean;
  referralRecordStatus: string | null;
  storedReferralCode: string | null;
  lastDebugInfo: Record<string, unknown> | null;
  issues: string[];
  lifecycle: string;
}

/**
 * Get comprehensive referral diagnostics for a specific user.
 * Used by admin diagnostic panel.
 */
export async function getReferralDiagnostics(userId: string): Promise<ReferralDiagnostic> {
  const issues: string[] = [];
  let lifecycle = 'unknown';

  // Get profile
  const { data: profile } = await supabase
    .from(TABLES.profiles)
    .select('user_id, full_name, referral_code, referred_by_user_id')
    .eq('user_id', userId)
    .maybeSingle();

  const hasProfile = !!profile;
  const referredByUserId = (profile?.referred_by_user_id as string) ?? null;
  const referralCode = (profile?.referral_code as string) ?? null;

  // Get referrer name if exists
  let referredByName: string | null = null;
  if (referredByUserId) {
    const { data: referrer } = await supabase
      .from(TABLES.profiles)
      .select('full_name')
      .eq('user_id', referredByUserId)
      .maybeSingle();
    referredByName = (referrer?.full_name as string) ?? null;
  }

  // Check referral record in referrals table
  const { data: referralRecord } = await supabase
    .from(TABLES.referrals)
    .select('id, status')
    .eq('referred_id', userId)
    .maybeSingle();

  const referralRecordExists = !!referralRecord;
  const referralRecordStatus = referralRecord?.status ?? null;

  // Check stored referral code (client-side only)
  let storedReferralCode: string | null = null;
  try {
    storedReferralCode = getStoredReferralCode();
  } catch { /* ignore */ }

  // Check last debug info
  let lastDebugInfo: Record<string, unknown> | null = null;
  try {
    const raw = localStorage.getItem('pipingbox_last_referral_debug');
    if (raw) lastDebugInfo = JSON.parse(raw);
  } catch { /* ignore */ }

  // Diagnose issues
  if (!hasProfile) {
    issues.push('No profile found — user may be auth-only (orphan)');
    lifecycle = 'no_profile';
  } else if (referredByUserId && referralRecordExists) {
    lifecycle = 'complete';
  } else if (referredByUserId && !referralRecordExists) {
    issues.push('Profile has referred_by_user_id but no referral record in referrals table');
    lifecycle = 'partial_profile_only';
  } else if (!referredByUserId && referralRecordExists) {
    issues.push('Referral record exists but profile.referred_by_user_id is NULL');
    lifecycle = 'partial_record_only';
  } else if (storedReferralCode) {
    issues.push('Stored referral code exists but was never processed');
    lifecycle = 'unprocessed';
  } else if (!referredByUserId && !referralRecordExists) {
    lifecycle = 'no_referral';
  }

  if (!referralCode) {
    issues.push('User has no referral_code — cannot be a referrer');
  }

  // Get email from auth if possible (we can't query auth.users from client, use profile email)
  const email = null; // Would need edge function to get auth email

  return {
    userId,
    email,
    fullName: (profile?.full_name as string) ?? null,
    hasProfile,
    referredByUserId,
    referredByName,
    referralCode,
    referralRecordExists,
    referralRecordStatus,
    storedReferralCode,
    lastDebugInfo,
    issues,
    lifecycle,
  };
}

/**
 * Admin: manually assign a referral for a user who was missed.
 * Creates both the profile link and the referral record.
 */
export async function adminAssignReferral(
  userId: string,
  referrerId: string,
  userEmail?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('[ADMIN_REFERRAL] Assigning referral:', { userId, referrerId });

    // Update profile
    const { error: profileErr } = await supabase
      .from(TABLES.profiles)
      .update({ referred_by_user_id: referrerId })
      .eq('user_id', userId);

    if (profileErr) {
      return { success: false, error: `Profile update failed: ${profileErr.message}` };
    }

    // Create referral record (prevent duplicates)
    const { data: existing } = await supabase
      .from(TABLES.referrals)
      .select('id')
      .eq('referrer_id', referrerId)
      .eq('referred_id', userId)
      .maybeSingle();

    if (!existing) {
      const { error: insertErr } = await supabase.from(TABLES.referrals).insert({
        referrer_id: referrerId,
        referred_id: userId,
        referred_email: userEmail || '',
        status: 'pending',
      });

      if (insertErr) {
        return { success: false, error: `Referral record insert failed: ${insertErr.message}` };
      }
    }

    // Increment referrer stats
    const { data: referrerProfile } = await supabase
      .from(TABLES.profiles)
      .select('referral_count')
      .eq('user_id', referrerId)
      .maybeSingle();

    const currentCount = (referrerProfile?.referral_count as number) || 0;
    await supabase
      .from(TABLES.profiles)
      .update({ referral_count: currentCount + 1 })
      .eq('user_id', referrerId);

    console.log('[ADMIN_REFERRAL] ✅ Referral assigned successfully');
    return { success: true };
  } catch (err) {
    return { success: false, error: `Unexpected error: ${(err as Error).message}` };
  }
}