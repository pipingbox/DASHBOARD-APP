import type { LucideIcon } from 'lucide-react';

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

export interface TrustMetric {
  label: string;
  value: number;
  icon: LucideIcon;
}

export interface ActivityItem {
  text: string;
  time: string;
  type: 'application' | 'filled' | 'closed' | 'new';
}

export interface FilterTag {
  type: string;
  label: string;
  value: string;
}

export interface JobFilters {
  query: string;
  selectedCountries: string[];
  selectedDisciplines: string[];
  selectedWorkTypes: string[];
  selectedContractTypes: string[];
  urgentOnly: boolean;
}
