import { supabase, TABLES } from '@/lib/supabase';
import { getAppBaseUrl } from '@/lib/constants';

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
 * Works for both workers and companies (different engagement signals).
 */
export async function shouldShowReferralWidget(userId: string): Promise<boolean> {
  try {
    const { data: profile } = await supabase
      .from(TABLES.profiles)
      .select('full_name, title, skills, cv_url, cv_file_url, account_type, role, company, bio')
      .eq('user_id', userId)
      .single();

    if (!profile) return false;

    const accountType = (profile as Record<string, unknown>).account_type as string | undefined;
    const role = (profile as Record<string, unknown>).role as string | undefined;
    const isCompany = accountType === 'company' || role === 'company';

    const hasProfile = !!(profile.full_name && profile.title);

    if (isCompany) {
      // Company engagement: has profile + (company name OR bio OR has posted jobs)
      const hasCompanyInfo = !!(profile.company || profile.bio);
      // Check if company has posted jobs (engagement signal).
      // posted_by stores email, not user_id — fetch profile email via auth or skip.
      // Simpler: use company name presence as engagement signal for companies.
      return hasProfile && hasCompanyInfo;
    }

    // Worker engagement signals
    const hasCV = !!(profile.cv_url || profile.cv_file_url);
    const hasSkills = !!(profile.skills && (profile.skills as string[]).length > 0);

    const { count: toolCount } = await supabase
      .from(TABLES.toolUsage)
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    const hasToolUsage = (toolCount ?? 0) >= 1;

    const { count: certCount } = await supabase
      .from(TABLES.certifications)
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    const hasCerts = (certCount ?? 0) >= 1;

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
 * Sources (in priority order):
 *   1. profiles.referral_count (set/incremented by admin manual assignment)
 *   2. profiles.referred_by_user_id (set by signup flow or admin)
 *   3. referrals table (legacy, verified entries)
 * Uses the MAX across all sources to ensure no referral is missed.
 */
export async function getReferralStats(userId: string): Promise<ReferralStats> {
  // Fetch the referrer's own profile to get referral_count
  const { data: ownProfile } = await supabase
    .from(TABLES.profiles)
    .select('referral_count')
    .eq('user_id', userId)
    .maybeSingle();

  const manualCount = (ownProfile?.referral_count as number) || 0;

  // Count profiles where referred_by_user_id = current user (organic + admin-assigned)
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

  // Use the maximum across all sources so nothing is missed
  const profileCount = profileReferralCount ?? 0;
  const legacyCount = legacyVerifiedCount ?? 0;
  const verified = Math.max(manualCount, profileCount, legacyCount);

  // Total includes pending from legacy table too
  const { count: legacyTotalCount } = await supabase
    .from(TABLES.referrals)
    .select('*', { count: 'exact', head: true })
    .eq('referrer_id', userId);

  const totalFromLegacy = legacyTotalCount ?? 0;
  const total = Math.max(verified, totalFromLegacy);

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
 * Process a stored referral code after user registration/login.
 * Called once when user first lands on Dashboard after signup.
 * Handles: validate code → identify referrer → create relationship → mark profile.
 */
export async function processStoredReferral(userId: string, userEmail?: string): Promise<void> {
  const code = getStoredReferralCode();

  if (!code) return;

  // Clear immediately to prevent double-processing
  clearStoredReferralCode();

  try {
    // Validate the referral code and get referrer
    const referrerId = await validateReferralCode(code);

    if (!referrerId || referrerId === userId) return;

    // Check if referral already exists (prevent duplicates)
    const { data: existing } = await supabase
      .from(TABLES.referrals)
      .select('id')
      .eq('referrer_id', referrerId)
      .eq('referred_id', userId)
      .maybeSingle();

    if (existing) return;

    // Create the referral record with pending status
    await supabase.from(TABLES.referrals).insert({
      referrer_id: referrerId,
      referred_id: userId,
      referred_email: userEmail || '',
      status: 'pending',
    });

    // Update the referred user's profile with who referred them
    await supabase
      .from(TABLES.profiles)
      .update({ referred_by_user_id: referrerId })
      .eq('user_id', userId);

    // Increment referrer's referral_count so the widget reflects it immediately
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

  } catch {
    // Silently fail - referral tracking shouldn't break the app
    console.warn('[Referrals] Failed to process referral');
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
  return `${getAppBaseUrl()}/register?ref=${code}`;
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