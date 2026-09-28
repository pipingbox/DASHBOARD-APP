import type { LucideIcon } from 'lucide-react';

/**
 * Localized content associated with one canonical job (PB-JOBS-PILOT-FOLLOWUP-002).
 * One row per (job_id, language). The source-language row lives on the job
 * itself — translations never overwrite it.
 */
export interface JobTranslation {
  id: string;
  job_id: string;
  language: string;
  title: string;
  summary: string | null;
  description: string | null;
  requirements: string | null;
  source_language: string;
  /** FNV-1a of the source title|summary|description|requirements at translation time. */
  source_content_hash: string;
  translation_status: 'machine' | 'human_reviewed';
  created_at: string;
  updated_at: string;
}

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string | null;
  job_type: string;
  category: string | null;
  description: string | null;
  salary_min: number | null;
  salary_max: number | null;
  currency: string;
  is_remote: boolean;
  created_at: string;
  posted_by: string | null;
  /* Columns present in the DB but historically absent from this interface.
     All nullable/optional so legacy rows keep rendering unchanged. */
  status?: string;
  country?: string | null;
  company_name?: string | null;
  contract_type?: string | null;
  requirements?: string | null;
  company_user_id?: string | null;
  applications_count?: number | null;
  /* PB-JOBS-PILOT-FOLLOWUP-002 — localization + structured public fields. */
  source_language?: string;
  vacancies?: number | null;
  salary_period?: string | null;
  hours_per_day?: number | null;
  schedule?: string | null;
  saturdays?: string | null;
  vca_required?: boolean | null;
  accommodation_included?: boolean | null;
  transport_included?: boolean | null;
  period?: string | null;
  summary?: string | null;
  /** Joined translations (listing/detail pages fetch them separately). */
  translations?: JobTranslation[];
}

export interface TrustMetric {
  label: string;
  value: number;
  icon: LucideIcon;
}

export interface FilterTag {
  type: string;
  label: string;
  value: string;
}
