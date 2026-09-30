import {
  normalizeExperience,
  type WorkExperience,
  type WorkExperienceInput,
} from './workerProfile';

export interface WorkerExperiencePayload {
  position: string;
  company_name: string;
  project_name: string | null;
  city_region: string | null;
  country: string | null;
  start_date: string | null;
  end_date: string | null;
  currently_working: boolean;
  description_original: string | null;
  description_en: string | null;
  description_es: string | null;
  description_fr: string | null;
  description_nl: string | null;
  description_de: string | null;
  language_original: string | null;
  responsibilities: string | null;
  visible_to_companies: boolean;
}

interface RepositoryResult<T> {
  data: T | null;
  error: string | null;
}

export interface WorkerExperienceRepository {
  list(userId: string): Promise<RepositoryResult<Record<string, unknown>[]>>;
  insert(
    userId: string,
    payload: WorkerExperiencePayload,
  ): Promise<RepositoryResult<Record<string, unknown>>>;
  update(
    experienceId: string,
    userId: string,
    payload: WorkerExperiencePayload,
  ): Promise<RepositoryResult<Record<string, unknown>>>;
  setVisibility(
    experienceId: string,
    userId: string,
    visible: boolean,
  ): Promise<RepositoryResult<Record<string, unknown>>>;
  remove(
    experienceId: string,
    userId: string,
  ): Promise<RepositoryResult<Record<string, unknown>>>;
}

export type ExperienceSaveResult =
  | { ok: true; data: WorkExperience }
  | { ok: false; error: string };

export type ExperienceListResult =
  | { ok: true; data: WorkExperience[] }
  | { ok: false; error: string };

export type ExperienceMutationResult =
  | { ok: true }
  | { ok: false; error: string };

export function validateExperienceInput(input: {
  position: string;
  company_name: string;
}): string | null {
  if (!input.position.trim() || !input.company_name.trim()) {
    return 'workerProfile.experience.titleCompanyRequired';
  }
  return null;
}

export function buildWorkerExperiencePayload(
  input: WorkExperienceInput,
): WorkerExperiencePayload {
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

export function createWorkerExperienceOperations(
  repository: WorkerExperienceRepository,
  onProfileDataChanged: (userId: string) => Promise<void> = async () => {},
) {
  const notifyProfileChanged = (userId: string) => {
    void onProfileDataChanged(userId).catch(() => {});
  };

  return {
    async list(userId: string): Promise<ExperienceListResult> {
      const result = await repository.list(userId);
      if (result.error) return { ok: false, error: result.error };
      return {
        ok: true,
        data: (result.data ?? []).map((row) => normalizeExperience(row)),
      };
    },

    async insert(
      userId: string,
      input: WorkExperienceInput,
    ): Promise<ExperienceSaveResult> {
      const validationError = validateExperienceInput(input);
      if (validationError) return { ok: false, error: validationError };

      const result = await repository.insert(
        userId,
        buildWorkerExperiencePayload(input),
      );
      if (result.error) return { ok: false, error: result.error };
      if (!result.data) return { ok: false, error: 'common.unexpectedError' };

      notifyProfileChanged(userId);
      return { ok: true, data: normalizeExperience(result.data) };
    },

    async update(
      experienceId: string,
      userId: string,
      input: WorkExperienceInput,
    ): Promise<ExperienceSaveResult> {
      const validationError = validateExperienceInput(input);
      if (validationError) return { ok: false, error: validationError };

      const result = await repository.update(
        experienceId,
        userId,
        buildWorkerExperiencePayload(input),
      );
      if (result.error) return { ok: false, error: result.error };
      if (!result.data) return { ok: false, error: 'common.unexpectedError' };

      notifyProfileChanged(userId);
      return { ok: true, data: normalizeExperience(result.data) };
    },

    async setVisibility(
      experienceId: string,
      userId: string,
      visible: boolean,
    ): Promise<ExperienceMutationResult> {
      const result = await repository.setVisibility(
        experienceId,
        userId,
        visible,
      );
      if (result.error) return { ok: false, error: result.error };
      if (!result.data) return { ok: false, error: 'common.unexpectedError' };
      return { ok: true };
    },

    async remove(
      experienceId: string,
      userId: string,
    ): Promise<ExperienceMutationResult> {
      const result = await repository.remove(experienceId, userId);
      if (result.error) return { ok: false, error: result.error };
      if (!result.data) return { ok: false, error: 'common.unexpectedError' };

      notifyProfileChanged(userId);
      return { ok: true };
    },
  };
}