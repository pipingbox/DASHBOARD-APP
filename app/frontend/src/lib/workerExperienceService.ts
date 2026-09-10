/**
 * Shared persistence for app_worker_experiences — SINGLE WRITE ROUTE.
 *
 * PB-WORKFORCE-ACTIVATION / WFA-001 (D18):
 * Quick Experience Capture and the full WorkExperienceSection must NOT have
 * two different insert/update implementations. Both consume this service.
 *
 * Ownership: every write pins user_id to the authenticated user (insert) or
 * the row id being edited (update, which RLS scopes to the owner). The
 * service never accepts a caller-supplied user_id override.
 *
 * The QUALIFYING EXPERIENCE predicate (position + company_name non-empty)
 * lives canonically in workforceReadiness.ts; this service enforces the same
 * requirement at the write boundary so a saved row always qualifies.
 */

import { supabase, TABLES } from '@/lib/supabase';
import {
  normalizeExperience,
  type WorkExperience,
  type WorkExperienceInput,
} from '@/lib/workerProfile';
import { recalculateAndSaveProfileCompletion } from '@/lib/profileCompletion';

export type ExperienceSaveResult =
  | { ok: true; data: WorkExperience }
  | { ok: false; error: string };

/** Validation shared by Quick Capture and the full section form. */
export function validateExperienceInput(input: {
  position: string;
  company_name: string;
}): string | null {
  if (!input.position.trim() || !input.company_name.trim()) {
    return 'workerProfile.experience.titleCompanyRequired';
  }
  return null;
}

function buildPayload(input: WorkExperienceInput) {
  return {
    position: input.position.trim(),
    company_name: input.company_name.trim(),
    project_name: input.project_name?.trim() || null,
    city_region: input.city_region?.trim() || null,
    country: input.country?.trim() || null,
    start_date: input.start_date || null,
    end_date: input.currently_working ? null : input.end_date || null,
    currently_working: input.currently_working ?? false,
    description_original: input.description_original?.trim() || null,
    description_en: input.description_en?.trim() || null,
    description_es: input.description_es?.trim() || null,
    description_fr: input.description_fr?.trim() || null,
    description_nl: input.description_nl?.trim() || null,
    description_de: input.description_de?.trim() || null,
    language_original: input.language_original?.trim() || null,
    responsibilities: input.responsibilities?.trim() || null,
    visible_to_companies: input.visible_to_companies ?? true,
  };
}

/**
 * Insert one experience row owned by `userId`.
 * Profile completion is recalculated (non-blocking) after a successful save.
 */
export async function insertWorkerExperience(
  userId: string,
  input: WorkExperienceInput,
): Promise<ExperienceSaveResult> {
  const validationError = validateExperienceInput(input);
  if (validationError) return { ok: false, error: validationError };

  const { data, error } = await supabase
    .from(TABLES.workerExperiences)
    .insert({ ...buildPayload(input), user_id: userId })
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'common.unexpectedError' };

  recalculateAndSaveProfileCompletion(userId).catch(() => {});
  return { ok: true, data: normalizeExperience(data as Record<string, unknown>) };
}

/**
 * Update an existing experience row by id (RLS scopes the write to the
 * owner; a mismatched id yields a Supabase error, not a cross-user write).
 */
export async function updateWorkerExperience(
  experienceId: string,
  userId: string,
  input: WorkExperienceInput,
): Promise<ExperienceSaveResult> {
  const validationError = validateExperienceInput(input);
  if (validationError) return { ok: false, error: validationError };

  const { data, error } = await supabase
    .from(TABLES.workerExperiences)
    .update(buildPayload(input))
    .eq('id', experienceId)
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'common.unexpectedError' };

  recalculateAndSaveProfileCompletion(userId).catch(() => {});
  return { ok: true, data: normalizeExperience(data as Record<string, unknown>) };
}
