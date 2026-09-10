import { supabase, TABLES } from '@/lib/supabase';
import {
  createWorkerExperienceOperations,
  type WorkerExperiencePayload,
  type WorkerExperienceRepository,
} from '@/lib/workerExperienceOperations';
import { recalculateAndSaveProfileCompletion } from '@/lib/profileCompletion';

const repository: WorkerExperienceRepository = {
  async list(userId) {
    const { data, error } = await supabase
      .from(TABLES.workerExperiences)
      .select('*')
      .eq('user_id', userId)
      .order('start_date', { ascending: false, nullsFirst: false });
    return { data, error: error?.message ?? null };
  },

  async insert(userId, payload) {
    const { data, error } = await supabase
      .from(TABLES.workerExperiences)
      .insert({ ...payload, user_id: userId })
      .select()
      .single();
    return { data, error: error?.message ?? null };
  },

  async update(experienceId, userId, payload) {
    const { data, error } = await supabase
      .from(TABLES.workerExperiences)
      .update(payload)
      .eq('id', experienceId)
      .eq('user_id', userId)
      .select()
      .single();
    return { data, error: error?.message ?? null };
  },

  async setVisibility(experienceId, userId, visible) {
    const { data, error } = await supabase
      .from(TABLES.workerExperiences)
      .update({ visible_to_companies: visible })
      .eq('id', experienceId)
      .eq('user_id', userId)
      .select('id')
      .single();
    return { data, error: error?.message ?? null };
  },

  async remove(experienceId, userId) {
    const { data, error } = await supabase
      .from(TABLES.workerExperiences)
      .delete()
      .eq('id', experienceId)
      .eq('user_id', userId)
      .select('id')
      .single();
    return { data, error: error?.message ?? null };
  },
};

const operations = createWorkerExperienceOperations(
  repository,
  recalculateAndSaveProfileCompletion,
);

export const loadWorkerExperiences = operations.list;
export const insertWorkerExperience = operations.insert;
export const updateWorkerExperience = operations.update;
export const setWorkerExperienceVisibility = operations.setVisibility;
export const deleteWorkerExperience = operations.remove;

export type { WorkerExperiencePayload };
