/**
 * Premium Tools System (MON-002 + TICKET-001 Fase 6)
 *
 * Principle: "Free to consult, premium to export."
 *
 * FREE tier (acquisition engine):
 *   - All calculators (wall thickness, pressure drop, thermal expansion)
 *   - All library consultations (flange dimensions, pipe data tables)
 *   - All quick lookups (flange rating, unit converter)
 *   - Branch template (on-screen view)
 *
 * PREMIUM tier (€4.99/month or €39/year — MON-002):
 *   - PDF export of flange dimension sheets (with company logo)
 *   - Printable branch template at 1:1 scale
 *   - Torque report PDF (per flange, with tightening pattern)
 *   - BOM export (future — Fase 3+ fitting library)
 *   - Calculation history export
 *   - No ads (future)
 *
 * Unlock methods:
 *   1. Stripe subscription (when Stripe is activated — DEC-30)
 *   2. Referral rewards (3 referrals = profile_premium, includes tool premium)
 *   3. Academy course purchase (VCA course includes 1 year premium tools)
 *   4. Enterprise plan (company users get premium via enterprise subscription)
 *
 * Until Stripe is live, premium is unlocked via:
 *   - Admin manual flag (profiles.is_premium_tools = true)
 *   - Referral level >= 1 (3+ verified referrals)
 *   - Academy purchase (future)
 */

import { supabase, TABLES } from '@/lib/supabase';

export interface PremiumStatus {
  isPremium: boolean;
  source: 'stripe' | 'referral' | 'academy' | 'enterprise' | 'admin' | 'none';
  expiresAt?: string | null;
  referralLevel?: number;
}

export const PREMIUM_PRICE_MONTHLY = 4.99; // EUR
export const PREMIUM_PRICE_YEARLY = 39.00; // EUR
export const PREMIUM_FEATURES = [
  { key: 'pdf_export', label: 'PDF Export', description: 'Export flange dimension sheets, torque reports, and templates as PDF' },
  { key: 'printable_templates', label: 'Printable Templates (1:1)', description: 'Print branch templates and elbow cut patterns at true 1:1 scale' },
  { key: 'torque_report', label: 'Torque Report', description: 'Generate professional bolt torque reports per flange' },
  { key: 'calc_history', label: 'Calculation History Export', description: 'Export your calculation history as CSV/PDF' },
  { key: 'bom_export', label: 'BOM Export (Coming Soon)', description: 'Export Bill of Materials from component library' },
  { key: 'no_branding', label: 'Remove PipingBox Branding', description: 'PDFs exported without PipingBox watermark (enterprise)' },
];

// Tools that are entirely premium (none currently — all consultation is free)
export const PREMIUM_ONLY_TOOLS: string[] = [];

// Features that require premium
export const PREMIUM_FEATURES_REQUIRED = {
  flange_pdf_export: true,
  branch_template_print: true,
  torque_report_pdf: true,
  calc_history_export: true,
};

/**
 * Check if a user has premium tools access.
 * Checks multiple sources in order of priority.
 */
export async function checkPremiumStatus(userId: string): Promise<PremiumStatus> {
  try {
    // 1. Check profiles.is_premium_tools (admin manual flag / Stripe sync)
    const { data: profile } = await supabase
      .from(TABLES.profiles)
      .select('is_premium_tools, premium_expires_at, referral_count')
      .eq('user_id', userId)
      .maybeSingle();

    if (profile?.is_premium_tools) {
      const expires = profile.premium_expires_at as string | null;
      // Check if not expired
      if (!expires || new Date(expires) > new Date()) {
        return {
          isPremium: true,
          source: 'stripe',
          expiresAt: expires,
          referralLevel: (profile.referral_count as number) ?? 0,
        };
      }
    }

    // 2. Check referral level (3+ referrals = Level 1 = premium tools)
    const referralCount = (profile?.referral_count as number) ?? 0;
    if (referralCount >= 3) {
      return {
        isPremium: true,
        source: 'referral',
        referralLevel: referralCount,
      };
    }

    // 3. Check Academy purchases (VCA course = 1 year premium)
    // TODO: When Academy payment is live, check app_academy_certificates or purchases table
    // For now, this is a placeholder

    return {
      isPremium: false,
      source: 'none',
      referralLevel: referralCount,
    };
  } catch {
    return { isPremium: false, source: 'none' };
  }
}

/**
 * Synchronous check (for components that can't be async).
 * Uses cached value from localStorage.
 */
export function getCachedPremiumStatus(): PremiumStatus {
  try {
    const cached = localStorage.getItem('pipingbox_premium_tools');
    if (cached) {
      const parsed = JSON.parse(cached) as PremiumStatus;
      if (parsed.expiresAt && new Date(parsed.expiresAt) < new Date()) {
        return { isPremium: false, source: 'none' };
      }
      return parsed;
    }
  } catch {
    // ignore
  }
  return { isPremium: false, source: 'none' };
}

/**
 * Cache premium status (called after async check).
 */
export function cachePremiumStatus(status: PremiumStatus): void {
  try {
    localStorage.setItem('pipingbox_premium_tools', JSON.stringify(status));
  } catch {
    // ignore
  }
}

/**
 * Check if a specific feature is accessible.
 */
export function canAccessFeature(
  status: PremiumStatus,
  featureKey: keyof typeof PREMIUM_FEATURES_REQUIRED,
): boolean {
  if (status.isPremium) return true;
  return !PREMIUM_FEATURES_REQUIRED[featureKey];
}
