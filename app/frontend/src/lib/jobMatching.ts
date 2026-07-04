// AUTO-001: Job-Worker matching algorithm (client-side scoring).
// Calculates a match score (0-100) between a job and a worker profile.
// This is the deterministic scoring logic. AI-based NLP matching (IA-003) is future.

// Weights per DEC-AUTO-001:
// - Specialty match: 30%
// - Required certifications: 25%
// - Location / travel availability: 15%
// - Experience (years): 15%
// - Languages: 10%
// - Profile completion: 5%

export interface WorkerProfileForMatching {
  role: string;
  title: string | null;
  years_experience: number | null;
  location: string | null;
  availability_status: string | null;
  skills: string[];
  languages: string[];
  profile_completion: number;
  marketplace_ready: boolean;
  certifications: string[];
}

export interface JobForMatching {
  category: string | null;
  title: string;
  location: string | null;
  job_type: string;
  description: string | null;
  salary_min: number | null;
  salary_max: number | null;
}

export interface MatchResult {
  score: number;
  breakdown: {
    specialty: number;
    certifications: number;
    location: number;
    experience: number;
    languages: number;
    completion: number;
  };
}

const WEIGHTS = {
  specialty: 0.30,
  certifications: 0.25,
  location: 0.15,
  experience: 0.15,
  languages: 0.10,
  completion: 0.05,
};

function normalize(str: string | null | undefined): string {
  return (str || '').toLowerCase().trim();
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

export function calculateMatchScore(
  job: JobForMatching,
  worker: WorkerProfileForMatching,
  requiredCerts: string[] = []
): MatchResult {
  if (!worker.marketplace_ready) {
    return {
      score: 0,
      breakdown: { specialty: 0, certifications: 0, location: 0, experience: 0, languages: 0, completion: 0 },
    };
  }

  // 1. Specialty match (30%) — job category vs worker title/skills
  const jobCat = normalize(job.category);
  const workerTitle = normalize(worker.title);
  const workerSkills = worker.skills.map(normalize);
  const specialtyScore =
    jobCat && workerSkills.includes(jobCat) ? 1.0 :
    jobCat && workerTitle.includes(jobCat) ? 0.8 :
    jobCat && workerSkills.some((s) => s.includes(jobCat) || jobCat.includes(s)) ? 0.5 :
    0.2; // baseline

  // 2. Certifications (25%) — required certs vs worker certs
  const certScore = requiredCerts.length > 0
    ? hasOverlap(worker.certifications, requiredCerts)
    : 0.5; // no certs required = neutral

  // 3. Location (15%) — job location vs worker location + availability
  const jobLoc = normalize(job.location);
  const workerLoc = normalize(worker.location);
  const isAvailable = worker.availability_status === 'available' || worker.availability_status === 'in_2_weeks';
  const locationScore =
    !jobLoc ? 0.5 :
    jobLoc === workerLoc ? 1.0 :
    jobLoc && workerLoc && (jobLoc.includes(workerLoc) || workerLoc.includes(jobLoc)) ? 0.7 :
    isAvailable ? 0.4 : 0.1;

  // 4. Experience (15%) — years of experience
  const years = worker.years_experience ?? 0;
  const experienceScore =
    years >= 10 ? 1.0 :
    years >= 5 ? 0.8 :
    years >= 2 ? 0.5 :
    years > 0 ? 0.3 : 0.1;

  // 5. Languages (10%) — overlap
  const langScore = worker.languages.length > 0 ? Math.min(1, worker.languages.length / 3) : 0.2;

  // 6. Profile completion (5%)
  const completionScore = Math.min(1, (worker.profile_completion || 0) / 100);

  const breakdown = {
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

  return { score: Math.min(100, Math.max(0, score)), breakdown };
}

// Helper: format score as a colored badge label
export function matchLabel(score: number): { text: string; color: string } {
  if (score >= 80) return { text: `${score}% match`, color: 'text-emerald-400' };
  if (score >= 60) return { text: `${score}% match`, color: 'text-[#f59e0b]' };
  if (score >= 40) return { text: `${score}% match`, color: 'text-zinc-400' };
  return { text: `${score}%`, color: 'text-zinc-600' };
}
