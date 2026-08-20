/**
 * Centralized Profile Completion Engine
 *
 * Single source of truth for profile completion calculation across the platform.
 * Used by: OnboardingWizard, ProfileCompleteness widget, ProfileCompletionCard,
 * CompanyWorkersSearch, AdminRegistros, ProfileCompletenessBadge.
 *
 * Weight distribution (total = 100%):
 *   Photo:          10%
 *   Full Name:       5%
 *   Position/Title:  5%
 *   Company:         5%
 *   Location:        5%
 *   Years Exp:       5%
 *   Skills:         10%
 *   Bio:            10%
 *   CV:             15%
 *   Experience:     15%
 *   Certification:  10%
 *   Documents:       5%
 */

export interface ProfileCompletionWeights {
  photo: number;
  fullName: number;
  position: number;
  company: number;
  location: number;
  yearsExperience: number;
  skills: number;
  bio: number;
  cv: number;
  experience: number;
  certification: number;
  documents: number;
}

export const COMPLETION_WEIGHTS: ProfileCompletionWeights = {
  photo: 10,
  fullName: 5,
  position: 5,
  company: 5,
  location: 5,
  yearsExperience: 5,
  skills: 10,
  bio: 10,
  cv: 15,
  experience: 15,
  certification: 10,
  documents: 5,
};

/** Thresholds for status levels */
export const COMPLETION_THRESHOLDS = {
  /** Minimum to appear in marketplace/worker search */
  MARKETPLACE_MIN: 30,
  /** Good start - profile has meaningful content */
  GOOD_START: 40,
  /** Almost ready for recruiters */
  ALMOST_READY: 70,
  /** Fully recruiter-ready */
  RECRUITER_READY: 90,
} as const;

export type CompletionStatusLevel = 'incomplete' | 'good_start' | 'almost_ready' | 'recruiter_ready';

/**
 * Get the status level based on completion percentage.
 */
export function getCompletionStatus(percentage: number): CompletionStatusLevel {
  if (percentage >= COMPLETION_THRESHOLDS.RECRUITER_READY) return 'recruiter_ready';
  if (percentage >= COMPLETION_THRESHOLDS.ALMOST_READY) return 'almost_ready';
  if (percentage >= COMPLETION_THRESHOLDS.GOOD_START) return 'good_start';
  return 'incomplete';
}

/**
 * Input data for profile completion calculation.
 * All fields are optional - missing fields count as incomplete.
 */
export interface ProfileCompletionInput {
  /** Profile fields */
  avatar_url?: string | null;
  full_name?: string | null;
  title?: string | null;       // position/role
  company?: string | null;
  location?: string | null;
  years_experience?: number | null;
  skills?: string[] | null;
  bio?: string | null;
  cv_file_url?: string | null;
  cv_url?: string | null;

  /** Related record counts (from joined tables) */
  experience_count?: number;
  certification_count?: number;
  document_count?: number;
}

export interface CompletionItem {
  key: keyof ProfileCompletionWeights;
  weight: number;
  completed: boolean;
}

export interface ProfileCompletionResult {
  /** Total percentage (0-100) */
  percentage: number;
  /** Status level */
  status: CompletionStatusLevel;
  /** Individual item results */
  items: CompletionItem[];
  /** Items that are not yet completed */
  missingItems: CompletionItem[];
  /** Items that are completed */
  completedItems: CompletionItem[];
  /** Whether profile meets marketplace minimum */
  isMarketplaceReady: boolean;
}

/**
 * Calculate profile completion from input data.
 * This is the SINGLE source of truth for all completion calculations.
 */
export function calculateProfileCompletion(input: ProfileCompletionInput): ProfileCompletionResult {
  const items: CompletionItem[] = [
    {
      key: 'photo',
      weight: COMPLETION_WEIGHTS.photo,
      completed: !!(input.avatar_url && input.avatar_url.trim().length > 0),
    },
    {
      key: 'fullName',
      weight: COMPLETION_WEIGHTS.fullName,
      completed: !!(input.full_name && input.full_name.trim().length > 0),
    },
    {
      key: 'position',
      weight: COMPLETION_WEIGHTS.position,
      completed: !!(input.title && input.title.trim().length > 0),
    },
    {
      key: 'company',
      weight: COMPLETION_WEIGHTS.company,
      completed: !!(input.company && input.company.trim().length > 0),
    },
    {
      key: 'location',
      weight: COMPLETION_WEIGHTS.location,
      completed: !!(input.location && input.location.trim().length > 0),
    },
    {
      key: 'yearsExperience',
      weight: COMPLETION_WEIGHTS.yearsExperience,
      completed: (input.years_experience ?? 0) > 0,
    },
    {
      key: 'skills',
      weight: COMPLETION_WEIGHTS.skills,
      completed: Array.isArray(input.skills) && input.skills.length > 0,
    },
    {
      key: 'bio',
      weight: COMPLETION_WEIGHTS.bio,
      completed: !!(input.bio && input.bio.trim().length > 10),
    },
    {
      key: 'cv',
      weight: COMPLETION_WEIGHTS.cv,
      completed: !!(input.cv_file_url || input.cv_url),
    },
    {
      key: 'experience',
      weight: COMPLETION_WEIGHTS.experience,
      completed: (input.experience_count ?? 0) > 0,
    },
    {
      key: 'certification',
      weight: COMPLETION_WEIGHTS.certification,
      completed: (input.certification_count ?? 0) > 0,
    },
    {
      key: 'documents',
      weight: COMPLETION_WEIGHTS.documents,
      completed: (input.document_count ?? 0) > 0,
    },
  ];

  const percentage = items.reduce((acc, item) => acc + (item.completed ? item.weight : 0), 0);
  const status = getCompletionStatus(percentage);
  const missingItems = items.filter((item) => !item.completed);
  const completedItems = items.filter((item) => item.completed);

  return {
    percentage,
    status,
    items,
    missingItems,
    completedItems,
    isMarketplaceReady: percentage >= COMPLETION_THRESHOLDS.MARKETPLACE_MIN,
  };
}

/**
 * Lightweight calculation that returns only the percentage.
 * Useful for list views where full result is not needed.
 */
export function calculateProfileCompletionPercent(input: ProfileCompletionInput): number {
  return calculateProfileCompletion(input).percentage;
}

/**
 * Onboarding-specific completion calculation.
 * During onboarding, we only have partial data (no experience/cert/doc counts yet).
 * This maps onboarding fields to the standard weights.
 */
export interface OnboardingCompletionInput {
  accountType?: string;
  mainRole?: string;
  specialties?: string[];
  country?: string;
  city?: string;
  availability?: string;
  willingToTravel?: boolean;
  willingToRelocate?: boolean;
  profileVisibility?: string;
  hasAvatar?: boolean;
  fullName?: string;
}

/**
 * Calculate completion during onboarding flow.
 * Maps onboarding steps to the standard weight system:
 * - fullName -> fullName (5%)
 * - mainRole -> position (5%)
 * - specialties -> skills (10%)
 * - country/city -> location (5%)
 * - availability -> bio equivalent (10%) [availability is key info for workers]
 * - travel/relocate -> yearsExperience equivalent (5%) [mobility info]
 * - profileVisibility -> company equivalent (5%) [profile setup]
 * - avatar -> photo (10%)
 *
 * Total achievable during onboarding: ~55%
 * Remaining 45% comes from CV, experience, certifications, documents (post-onboarding).
 */
export function calculateOnboardingCompletion(input: OnboardingCompletionInput): number {
  let score = 0;

  if (input.fullName && input.fullName.trim().length > 0) score += COMPLETION_WEIGHTS.fullName; // 5%
  if (input.mainRole) score += COMPLETION_WEIGHTS.position; // 5%
  if (input.specialties && input.specialties.length > 0) score += COMPLETION_WEIGHTS.skills; // 10%
  if (input.country || input.city) score += COMPLETION_WEIGHTS.location; // 5%
  if (input.availability) score += COMPLETION_WEIGHTS.bio; // 10%
  if (input.willingToTravel || input.willingToRelocate) score += COMPLETION_WEIGHTS.yearsExperience; // 5%
  if (input.profileVisibility) score += COMPLETION_WEIGHTS.company; // 5%
  if (input.hasAvatar) score += COMPLETION_WEIGHTS.photo; // 10%

  return Math.min(score, 100);
}