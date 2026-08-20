/* ─── Job Interface ─── */
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
}