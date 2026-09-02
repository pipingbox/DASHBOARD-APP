// _shared/matching.ts
// Core compartido de candidate matching para job-match-notify y workforce-match-notify.
// PB-MATCHING-NOTIFICATIONS-001
//
// Diseñado contra el schema real de produccion (2026-09-02):
//   - profiles NO tiene position, country ni languages.
//   - profiles.preferred_regions es text (no text[]).
//   - workforce_requests NO tiene title, location, description ni requirements.
//   - workforce_requests tiene worker_type, country, message.
//   - Taxonomia real availability_status: available_immediately, not_specified,
//     not_currently_available, NULL.
//
// Responsabilidades:
//   1. Hard-requirements filter: descalifica candidatos que no cumplen requisitos
//      obligatorios declarados por la oferta.
//   2. Scoring determinista con los pesos aprobados.
//   3. Devuelve score, breakdown y razones de descalificacion.

export const WEIGHTS = {
  specialty: 0.30,
  certifications: 0.25,
  location: 0.15,
  experience: 0.15,
  languages: 0.10,
  completion: 0.05,
} as const;

export type MatchingWeights = typeof WEIGHTS;

export interface OpportunityForMatching {
  id: string;
  title: string;
  category: string | null;
  discipline: string | null;
  location: string | null;
  country: string | null;
  description: string | null;
  requirements: string | null;
  required_certifications?: string[] | null;
  mandatory_location?: string | null;
  accepts_remote?: boolean | null;
}

export interface ValidCertification {
  name: string;
  is_verified: boolean;
  is_expired: boolean;
}

export interface WorkerProfileForMatching {
  user_id: string;
  role: string | null;
  title: string | null;
  years_experience: number | null;
  location: string | null;
  availability_status: string | null;
  skills: string[] | null;
  profile_completion: number | null;
  willing_to_travel: boolean | null;
  willing_to_relocate: boolean | null;
  preferred_regions: string | null;
  certifications: ValidCertification[];
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

function norm(s: string | null | undefined): string {
  return (s || "").toLowerCase().trim();
}

function parsePreferredRegions(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;|]/)
    .map((s) => norm(s))
    .filter((s) => s.length > 0);
}

function hasOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a.map(norm));
  const setB = new Set(b.map(norm));
  let matches = 0;
  for (const item of setB) {
    if (setA.has(item)) matches++;
  }
  return matches / setB.size;
}

function hasAnyOverlap(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const setA = new Set(a.map(norm));
  return b.map(norm).some((item) => setA.has(item));
}

function extractKnownCertsFromText(text: string | null | undefined): string[] {
  const knownCerts = ["vca", "weld", "cswip", "asnt", "pssr", "atex", "bosiet", "huet", "gwo"];
  const t = norm(text);
  return knownCerts.filter((c) => t.includes(c));
}

function arrayValue(value: string[] | null | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [];
}

/**
 * Determina si un candidato esta disponible para matching.
 * Taxonomia real de produccion:
 *   - available_immediately: disponible
 *   - not_specified / NULL: asumir disponible para scoring, penalizar levemente
 *   - not_currently_available: no disponible (hard fail)
 */
export function isWorkerAvailable(availability: string | null | undefined): boolean {
  const a = norm(availability);
  if (a === "not_currently_available") return false;
  return true;
}

/**
 * Roles que se consideran trabajadores candidatos a matching.
 * Admin y company nunca deben entrar en el motor.
 */
export function isWorkerRole(role: string | null | undefined): boolean {
  const r = norm(role);
  return r === "worker" || r === "user";
}

/**
 * MATCH READY basado en campos reales.
 * No usa profile_completion ni marketplace_ready.
 * Debe mantenerse sincronizado con pb_is_match_ready() en SQL.
 */
export function isMatchReady(p: {
  role: string | null;
  full_name: string | null;
  title: string | null;
  location: string | null;
  availability_status: string | null;
  years_experience: number | null;
  skills: string[] | null;
}): boolean {
  return (
    isWorkerRole(p.role) &&
    p.full_name !== null && btrim(p.full_name) !== "" &&
    p.title !== null && btrim(p.title) !== "" &&
    p.location !== null && btrim(p.location) !== "" &&
    p.availability_status !== null && btrim(p.availability_status) !== "" &&
    norm(p.availability_status) !== "not_currently_available" &&
    p.years_experience !== null &&
    p.skills !== null && Array.isArray(p.skills) && p.skills.length > 0
  );
}

function btrim(s: string | null | undefined): string {
  return (s || "").trim();
}

/**
 * Lista de certificaciones validas (no expiradas y, si aplica, verificadas).
 * is_verified: si la fila tiene el campo y es false, se excluye.
 * is_expired: si expiry_date/expiration_date existe y es pasada, se excluye.
 */
function validCertNames(certs: ValidCertification[]): string[] {
  return certs
    .filter((c) => !c.is_expired && c.is_verified)
    .map((c) => c.name);
}

/**
 * Evalua hard requirements de una oportunidad contra un worker.
 * Devuelve un array vacio si el worker es elegible.
 */
export function evaluateHardRequirements(
  opportunity: OpportunityForMatching,
  worker: WorkerProfileForMatching,
): string[] {
  const reasons: string[] = [];

  // 1. Rol valido
  if (!isWorkerRole(worker.role)) {
    reasons.push("invalid_role");
  }

  // 2. Disponibilidad
  if (!isWorkerAvailable(worker.availability_status)) {
    reasons.push("worker_not_available");
  }

  // 3. Certificacion obligatoria requerida por la oferta y no presente/valida
  const requiredCerts = arrayValue(opportunity.required_certifications);
  if (requiredCerts.length > 0) {
    const workerCerts = validCertNames(worker.certifications);
    if (!hasAnyOverlap(workerCerts, requiredCerts)) {
      reasons.push("missing_required_certification");
    }
  }

  // 4. Ubicacion obligatoria
  const mandatoryLoc = norm(opportunity.mandatory_location);
  if (mandatoryLoc) {
    const workerLoc = norm(worker.location);
    const preferredRegions = parsePreferredRegions(worker.preferred_regions);
    const acceptsRemote = opportunity.accepts_remote ?? false;
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
      reasons.push("location_incompatible");
    }
  }

  return reasons;
}

/**
 * Calcula el score de matching entre una oportunidad y un worker.
 * Si hardFailReasons no esta vacio, el score es 0 y eligible false.
 */
export function calculateMatchScore(
  opportunity: OpportunityForMatching,
  worker: WorkerProfileForMatching,
): MatchResult {
  const hardFailReasons = evaluateHardRequirements(opportunity, worker);

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

  // 1. Specialty match (30%)
  const jobCat = norm(opportunity.category || opportunity.discipline);
  const workerTitle = norm(worker.title);
  const workerSkills = arrayValue(worker.skills).map(norm);
  const specialtyScore =
    jobCat && workerSkills.includes(jobCat) ? 1.0 :
    jobCat && workerTitle.includes(jobCat) ? 0.8 :
    jobCat && workerSkills.some((s) => s.includes(jobCat) || jobCat.includes(s)) ? 0.5 :
    0.2;

  // 2. Certifications (25%)
  const requiredCertsFromField = arrayValue(opportunity.required_certifications);
  const requiredCertsFromText = extractKnownCertsFromText(opportunity.requirements || opportunity.description);
  const requiredCerts = requiredCertsFromField.length > 0
    ? requiredCertsFromField
    : requiredCertsFromText;
  const workerCertNames = validCertNames(worker.certifications);
  const certScore = requiredCerts.length > 0
    ? hasOverlap(workerCertNames, requiredCerts)
    : 0.5;

  // 3. Location (15%)
  const jobLoc = norm(opportunity.location);
  const workerLoc = norm(worker.location);
  const isAvailableImmediately = norm(worker.availability_status) === "available_immediately";
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

  // 5. Languages (10%) — placeholder: no hay modelo real en profiles todavia.
  // Se asigna un score neutral hasta que exista required_languages real.
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
  if (score >= 80) return { text: `${score}% match`, color: "text-emerald-400" };
  if (score >= 60) return { text: `${score}% match`, color: "text-[#f59e0b]" };
  if (score >= 40) return { text: `${score}% match`, color: "text-zinc-400" };
  return { text: `${score}%`, color: "text-zinc-600" };
}
