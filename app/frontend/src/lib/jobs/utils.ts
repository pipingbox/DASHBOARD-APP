import type { Job } from './types';

export interface FormattedSalary {
  amount: string;
  period: 'year' | 'month';
}

export function formatSalary(job: Job): FormattedSalary | null {
  if (!job.salary_min && !job.salary_max) return null;
  const min = job.salary_min ?? 0;
  const max = job.salary_max ?? 0;
  if (min >= 10000) {
    return {
      amount: `${job.currency}${(min / 1000).toFixed(0)}k–${(max / 1000).toFixed(0)}k`,
      period: 'year',
    };
  }
  return {
    amount: `${job.currency}${min.toLocaleString()}–${max.toLocaleString()}`,
    period: 'month',
  };
}

export type PostedTimeKey = 'justNow' | 'h_ago' | 'd_ago' | 'w_ago';

export interface PostedTime {
  key: PostedTimeKey;
  count: number;
}

export function formatPostedTime(createdAt: string): PostedTime | null {
  if (!createdAt) return null;
  const posted = new Date(createdAt).getTime();
  if (Number.isNaN(posted)) return null;
  const diffMs = Date.now() - posted;
  const diffHours = Math.floor(diffMs / 3600000);
  if (diffHours < 1) return { key: 'justNow', count: 0 };
  if (diffHours < 24) return { key: 'h_ago', count: diffHours };
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return { key: 'd_ago', count: diffDays };
  return { key: 'w_ago', count: Math.floor(diffDays / 7) };
}

/* ─── Filter Options ─── */
export const COUNTRIES = ['Belgium', 'Netherlands', 'Germany', 'Norway', 'UAE', 'United Kingdom', 'USA'];
export const DISCIPLINES = ['Pipefitter', 'TIG Welder', 'QA/QC', 'Supervisor', 'Planner', 'Rigger', 'Offshore Technician'];
export const CONTRACT_TYPES_OPTIONS = ['Freelance', 'Employee', 'Contract', 'Full-time'];

/* ─── Option label keys (internal value → i18n key) ─── */
export type OptionGroup = 'countries' | 'disciplines' | 'contractTypes';

const OPTION_LABEL_KEYS: Record<OptionGroup, Record<string, string>> = {
  countries: {
    'Belgium': 'belgium',
    'Netherlands': 'netherlands',
    'Germany': 'germany',
    'Norway': 'norway',
    'UAE': 'uae',
    'United Kingdom': 'unitedKingdom',
    'USA': 'usa',
  },
  disciplines: {
    'Pipefitter': 'pipefitter',
    'TIG Welder': 'tigWelder',
    'QA/QC': 'qaqc',
    'Supervisor': 'supervisor',
    'Planner': 'planner',
    'Rigger': 'rigger',
    'Offshore Technician': 'offshoreTechnician',
  },
  contractTypes: {
    'Freelance': 'freelance',
    'Employee': 'employee',
    'Contract': 'contract',
    'Full-time': 'fullTime',
  },
};

/**
 * Maps an internal option value (matched against DB strings, never translated)
 * to its i18n key `jobs.options.<group>.<camelKey>`. Unknown values fall back
 * to the raw value so callers can pass the result straight to `t()`.
 */
export function optionLabelKey(group: OptionGroup, value: string): string {
  const camelKey = OPTION_LABEL_KEYS[group][value];
  return camelKey ? `jobs.options.${group}.${camelKey}` : value;
}

/* ─── Discipline mapping (category → discipline label) ─── */
export const DISCIPLINE_MAP: Record<string, string> = {
  'Pipefitting': 'Pipefitter',
  'Welding': 'TIG Welder',
  'QA/QC': 'QA/QC',
  'Supervision': 'Supervisor',
  'Planning': 'Planner',
  'Rigging': 'Rigger',
  'Instrumentation': 'Offshore Technician',
  'Stress': 'Pipefitter',
  'Design': 'Planner',
  'Scaffolding': 'Rigger',
  'Mechanical': 'Pipefitter',
};

export function getCountry(location: string | null): string {
  if (!location) return 'Other';
  if (location.includes('Belgium')) return 'Belgium';
  if (location.includes('Netherlands')) return 'Netherlands';
  if (location.includes('Germany')) return 'Germany';
  if (location.includes('Norway')) return 'Norway';
  if (location.includes('UAE')) return 'UAE';
  if (location.includes('United Kingdom') || location.includes('UK')) return 'United Kingdom';
  if (location.includes('Houston') || location.includes('TX')) return 'USA';
  if (location.includes('Remote')) return 'Remote';
  return 'Other';
}

export function getContractTypeLabel(jobType: string): string {
  if (jobType === 'full-time') return 'Full-time';
  if (jobType === 'contract') return 'Contract';
  return 'Freelance';
}
