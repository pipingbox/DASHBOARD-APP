// AUTO-001: Job-Worker matching algorithm (client-side scoring).
// Calculates a match score (0-100) between a job and a worker profile.
// This is the deterministic scoring logic. AI-based NLP matching (IA-003) is future.
//
// IMPORTANT: this file must stay in sync with the Edge Function core at
// supabase/functions/_shared/matching.ts (PB-MATCHING-NOTIFICATIONS-001).
// Any change to weights, hard requirements or scoring must be mirrored there.
//
// Schema real (produccion):
//   - profiles no tiene position, country ni languages.
//   - profiles.preferred_regions es text.
//   - availability_status: available_immediately, not_specified, not_currently_available.

// Weights per DEC-AUTO-001:
// - Specialty match: 30%
// - Required certifications: 25%
// - Location / travel availability: 15%
// - Experience (years): 15%
// - Languages: 10%
// - Profile completion: 5%

export const WEIGHTS = {
  specialty: 0.30,
  certifications: 0.25,
  location: 0.15,
  experience: 0.15,
  languages: 0.10,
  completion: 0.05,
} as const;

export interface WorkerProfileForMatching {
  role: string | null;
  title: string | null;
  years_experience: number | null;
  location: string | null;
  availability_status: string | null;
  skills: string[];
  profile_completion: number | null;
  willing_to_travel: boolean | null;
  willing_to_relocate: boolean | null;
  preferred_regions: string | null;
  certifications: string[];
}

export interface JobForMatching {
  category: string | null;
  discipline: string | null;
  title: string;
  location: string | null;
  country: string | null;
  job_type: string;
  description: string | null;
  salary_min: number | null;
  salary_max: number | null;
  required_certifications?: string[] | null;
  mandatory_location?: string | null;
  accepts_remote?: boolean | null;
}

export interface MatchBreakdown {
  specialty: number;
  certifications: number;
  location: number;
  experience: number;
  languages: number;
  completion: number;
}

export interface MatchResult {
  eligible: boolean;
  score: number;
  breakdown: MatchBreakdown;
  hard_fail_reasons: string[];
}

function normalize(str: string | null | undefined): string {
  return (str || '').toLowerCase().trim();
}

function parsePreferredRegions(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;|]/)
    .map((s) => normalize(s))
    .filter((s) => s.length > 0);
}

function hasOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a.map(normalize));
  const setB = new Set(b.map(normalize));
  let matches = 0;
  for (const item of setB) {
    if (setA.has(item)) matches++;
  }
  return matches / setB.size;
}

function hasAnyOverlap(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const setA = new Set(a.map(normalize));
  return b.map(normalize).some((item) => setA.has(item));
}

function arrayValue(value: string[] | null | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [];
}

function extractKnownCertsFromText(text: string | null | undefined): string[] {
  const knownCerts = ['vca', 'weld', 'cswip', 'asnt', 'pssr', 'atex', 'bosiet', 'huet', 'gwo'];
  const t = normalize(text);
  return knownCerts.filter((c) => t.includes(c));
}

export function isWorkerRole(role: string | null | undefined): boolean {
  const r = normalize(role);
  return r === 'worker' || r === 'user';
}

export function isWorkerAvailable(availability: string | null | undefined): boolean {
  const a = normalize(availability);
  if (a === 'not_currently_available') return false;
  return true;
}

/**
 * Evalua hard requirements de una oferta contra un worker.
 * PB-MATCHING-NOTIFICATIONS-001
 */
export function evaluateHardRequirements(
  job: JobForMatching,
  worker: WorkerProfileForMatching,
): string[] {
  const reasons: string[] = [];

  if (!isWorkerRole(worker.role)) {
    reasons.push('invalid_role');
  }

  if (!isWorkerAvailable(worker.availability_status)) {
    reasons.push('worker_not_available');
  }

  const requiredCerts = arrayValue(job.required_certifications);
  if (requiredCerts.length > 0 && !hasAnyOverlap(worker.certifications, requiredCerts)) {
    reasons.push('missing_required_certification');
  }

  const mandatoryLoc = normalize(job.mandatory_location);
  if (mandatoryLoc) {
    const workerLoc = normalize(worker.location);
    const preferredRegions = parsePreferredRegions(worker.preferred_regions);
    const acceptsRemote = job.accepts_remote ?? false;
    const willingToTravel = worker.willing_to_travel ?? false;
    const willingToRelocate = worker.willing_to_relocate ?? false;

    const matchesLocation =
      workerLoc === mandatoryLoc ||
      workerLoc.includes(mandatoryLoc) ||
      mandatoryLoc.includes(workerLoc) ||
      preferredRegions.some((r) =>
        r === mandatoryLoc || r.includes(mandatoryLoc) || mandatoryLoc.includes(r)
      );

    if (!matchesLocation && !acceptsRemote && !willingToTravel && !willingToRelocate) {
      reasons.push('location_incompatible');
    }
  }

  return reasons;
}

export function calculateMatchScore(
  job: JobForMatching,
  worker: WorkerProfileForMatching,
): MatchResult {
  const hardFailReasons = evaluateHardRequirements(job, worker);

  if (hardFailReasons.length > 0) {
    return {
      eligible: false,
      score: 0,
      breakdown: {
        specialty: 0,
        certifications: 0,
        location: 0,
        experience: 0,
        languages: 0,
        completion: 0,
      },
      hard_fail_reasons: hardFailReasons,
    };
  }

  // 1. Specialty match (30%) — job category vs worker title/skills
  const jobCat = normalize(job.category || job.discipline);
  const workerTitle = normalize(worker.title);
  const workerSkills = arrayValue(worker.skills).map(normalize);
  const specialtyScore =
    jobCat && workerSkills.includes(jobCat) ? 1.0 :
    jobCat && workerTitle.includes(jobCat) ? 0.8 :
    jobCat && workerSkills.some((s) => s.includes(jobCat) || jobCat.includes(s)) ? 0.5 :
    0.2;

  // 2. Certifications (25%)
  const requiredCertsFromField = arrayValue(job.required_certifications);
  const requiredCertsFromText = extractKnownCertsFromText(job.description);
  const requiredCerts = requiredCertsFromField.length > 0
    ? requiredCertsFromField
    : requiredCertsFromText;
  const certScore = requiredCerts.length > 0
    ? hasOverlap(worker.certifications, requiredCerts)
    : 0.5;

  // 3. Location (15%)
  const jobLoc = normalize(job.location);
  const workerLoc = normalize(worker.location);
  const isAvailableImmediately = normalize(worker.availability_status) === 'available_immediately';
  const locationScore =
    !jobLoc ? 0.5 :
    jobLoc === workerLoc ? 1.0 :
    jobLoc && workerLoc && (jobLoc.includes(workerLoc) || workerLoc.includes(jobLoc)) ? 0.7 :
    isAvailableImmediately ? 0.4 : 0.1;

  // 4. Experience (15%)
  const years = worker.years_experience ?? 0;
  const experienceScore =
    years >= 10 ? 1.0 :
    years >= 5 ? 0.8 :
    years >= 2 ? 0.5 :
    years > 0 ? 0.3 : 0.1;

  // 5. Languages (10%) — neutral hasta que exista modelo real
  const langScore = 0.5;

  // 6. Profile completion (5%)
  const completionScore = Math.min(1, (worker.profile_completion || 0) / 100);

  const breakdown: MatchBreakdown = {
    specialty: specialtyScore * WEIGHTS.specialty * 100,
    certifications: certScore * WEIGHTS.certifications * 100,
    location: locationScore * WEIGHTS.location * 100,
    experience: experienceScore * WEIGHTS.experience * 100,
    languages: langScore * WEIGHTS.languages * 100,
    completion: completionScore * WEIGHTS.completion * 100,
  };

  const score = Math.round(
    breakdown.specialty +
    breakdown.certifications +
    breakdown.location +
    breakdown.experience +
    breakdown.languages +
    breakdown.completion
  );

  return {
    eligible: true,
    score: Math.min(100, Math.max(0, score)),
    breakdown,
    hard_fail_reasons: [],
  };
}

export function matchLabel(score: number): { text: string; color: string } {
  if (score >= 80) return { text: `${score}% match`, color: 'text-emerald-400' };
  if (score >= 60) return { text: `${score}% match`, color: 'text-[#f59e0b]' };
  if (score >= 40) return { text: `${score}% match`, color: 'text-zinc-400' };
  return { text: `${score}%`, color: 'text-zinc-600' };
}
