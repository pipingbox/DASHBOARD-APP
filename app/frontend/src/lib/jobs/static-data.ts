import type { Job, ActivityItem } from './types';
import { URGENT_INDICES, isOffshore } from '@/data/job-constants';

/* ─── Static Job Data (fictional industrial listings — DEC-42) ─── */
export const STATIC_JOBS: Omit<Job, 'id' | 'created_at' | 'posted_by'>[] = [
  {
    title: 'Senior Pipefitter',
    company: 'Atlas Industrial Solutions',
    location: 'Antwerp, Belgium',
    job_type: 'contract',
    category: 'Pipefitting',
    description:
      'Experienced pipefitter for petrochemical turnaround. Must hold VCA certificate. 10/4 rotation available.',
    salary_min: 3800,
    salary_max: 4600,
    currency: '€',
    is_remote: false,
  },
  {
    title: 'TIG Welder — 6GR Certified',
    company: 'Helix Marine Engineering',
    location: 'Stavanger, Norway',
    job_type: 'contract',
    category: 'Welding',
    description:
      'Offshore TIG welding on subsea manifolds. 3/3 rotation. Must have BOSIET + valid medical.',
    salary_min: 5200,
    salary_max: 6800,
    currency: '€',
    is_remote: false,
  },
  {
    title: 'QA/QC Inspector — Piping',
    company: 'Meridian Industrial Group',
    location: 'Rotterdam, Netherlands',
    job_type: 'contract',
    category: 'QA/QC',
    description:
      'Inspection of piping fabrication and installation per ASME B31.3. CSWIP 3.1 required.',
    salary_min: 4200,
    salary_max: 5400,
    currency: '€',
    is_remote: false,
  },
  {
    title: 'Mechanical Supervisor',
    company: 'Polaris Energy Services',
    location: 'Aberdeen, United Kingdom',
    job_type: 'full-time',
    category: 'Supervision',
    description:
      'Supervise mechanical installation crews on offshore platform upgrade. 2/2 rotation.',
    salary_min: 72000,
    salary_max: 95000,
    currency: '£',
    is_remote: false,
  },
  {
    title: 'Work Preparator — Piping',
    company: 'Bilfinger',
    location: 'Ludwigshafen, Germany',
    job_type: 'full-time',
    category: 'Planning',
    description:
      'Prepare work packages for piping maintenance at BASF site. SAP PM experience preferred.',
    salary_min: 48000,
    salary_max: 62000,
    currency: '€',
    is_remote: false,
  },
  {
    title: 'Rigger / Banksman',
    company: 'Vanguard Offshore Operations',
    location: 'Abu Dhabi, UAE',
    job_type: 'contract',
    category: 'Rigging',
    description:
      'Heavy lift rigging for offshore jacket installation. LEEA certification required. 8/4 rotation.',
    salary_min: 4000,
    salary_max: 5500,
    currency: '$',
    is_remote: false,
  },
  {
    title: 'Project Planner — Oil & Gas',
    company: 'Apex Technical Services',
    location: 'The Hague, Netherlands',
    job_type: 'full-time',
    category: 'Planning',
    description:
      'Primavera P6 planning for refinery expansion project. 5+ years O&G experience.',
    salary_min: 65000,
    salary_max: 85000,
    currency: '€',
    is_remote: false,
  },
  {
    title: 'Offshore Instrument Technician',
    company: 'Petrofac',
    location: 'Bergen, Norway',
    job_type: 'contract',
    category: 'Instrumentation',
    description:
      'Calibration and maintenance of process instrumentation on FPSO. 2/3 rotation.',
    salary_min: 5000,
    salary_max: 6500,
    currency: '€',
    is_remote: false,
  },
  {
    title: 'Piping Stress Engineer — CAESAR II',
    company: 'Trident Upstream Energy',
    location: 'Houston, TX',
    job_type: 'full-time',
    category: 'Stress',
    description:
      'Lead stress analysis for LNG facility projects. ASME B31.3 and B31.1 expertise.',
    salary_min: 120000,
    salary_max: 160000,
    currency: '$',
    is_remote: false,
  },
  {
    title: 'Piping Designer — AutoCAD Plant 3D',
    company: 'Meridian EPC',
    location: 'Remote',
    job_type: 'full-time',
    category: 'Design',
    description: 'Produce GA, iso, and BOM for refinery retrofits. Remote-friendly role.',
    salary_min: 70000,
    salary_max: 95000,
    currency: '$',
    is_remote: true,
  },
  {
    title: 'Scaffolder — Advanced',
    company: 'Brand Energy',
    location: 'Ghent, Belgium',
    job_type: 'contract',
    category: 'Scaffolding',
    description:
      'Complex industrial scaffolding for chemical plant shutdown. CISRS Advanced required.',
    salary_min: 3200,
    salary_max: 4200,
    currency: '€',
    is_remote: false,
  },
  {
    title: 'NDT Technician Level II',
    company: 'Applus+',
    location: 'Düsseldorf, Germany',
    job_type: 'full-time',
    category: 'QA/QC',
    description:
      'UT, MT, PT inspection of pressure vessels and piping. PCN Level II certification.',
    salary_min: 52000,
    salary_max: 68000,
    currency: '€',
    is_remote: false,
  },
  {
    title: 'Mechanical / Piping Engineer',
    company: 'Aurora Process',
    location: 'Rotterdam, Netherlands',
    job_type: 'contract',
    category: 'Mechanical',
    description: 'Chemical plant revamp, 12-month rolling contract. PED knowledge preferred.',
    salary_min: 90000,
    salary_max: 120000,
    currency: '€',
    is_remote: false,
  },
  {
    title: 'Welding Engineer',
    company: 'Cascade Dredging Marine',
    location: 'Papendrecht, Netherlands',
    job_type: 'full-time',
    category: 'Welding',
    description:
      'Develop WPS/PQR for offshore pipeline projects. IWE qualification required.',
    salary_min: 70000,
    salary_max: 92000,
    currency: '€',
    is_remote: false,
  },
  {
    title: 'Construction Manager — Piping',
    company: 'McDermott',
    location: 'Jebel Ali, UAE',
    job_type: 'contract',
    category: 'Supervision',
    description:
      'Manage piping construction on modular fabrication yard. 10+ years experience.',
    salary_min: 8000,
    salary_max: 12000,
    currency: '$',
    is_remote: false,
  },
  {
    title: 'Pipe Stress Analyst',
    company: 'Orion Engineering Partners',
    location: 'London, United Kingdom',
    job_type: 'full-time',
    category: 'Stress',
    description:
      'Perform thermal flexibility analysis for hydrogen pipeline project using AutoPIPE.',
    salary_min: 65000,
    salary_max: 85000,
    currency: '£',
    is_remote: false,
  },
];

/* ─── Featured Jobs (premium / high-paying) ─── */
export const FEATURED_INDICES = [1, 3, 8, 14];

/* ─── Activity Feed Data ─── */
export const ACTIVITY_FEED: ActivityItem[] = [
  { text: '3 new candidates applied to Atlas Industrial Solutions — Pipefitter role', time: '5 min ago', type: 'application' },
  { text: 'QA/QC Inspector role filled in Rotterdam', time: '18 min ago', type: 'filled' },
  { text: 'Offshore TIG Welder position closed in Norway', time: '42 min ago', type: 'closed' },
  { text: '7 applications received for Mechanical Supervisor — Aberdeen', time: '1h ago', type: 'application' },
  { text: 'New urgent listing: Rigger/Banksman — Abu Dhabi', time: '2h ago', type: 'new' },
  { text: 'Scaffolder role in Ghent received 5 applications', time: '3h ago', type: 'application' },
  { text: 'Construction Manager position updated — salary increased', time: '4h ago', type: 'new' },
];

/* ─── Filter Options ─── */
export const COUNTRIES = ['Belgium', 'Netherlands', 'Germany', 'Norway', 'UAE', 'United Kingdom'];
export const DISCIPLINES = ['Pipefitter', 'TIG Welder', 'QA/QC', 'Supervisor', 'Planner', 'Rigger', 'Offshore Technician'];
export const WORK_TYPES = ['Offshore', 'Onshore', 'Shutdown', 'Long-term', 'Rotation'];
export const CONTRACT_TYPES_OPTIONS = ['Freelance', 'Employee', 'Contract', 'Full-time'];

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

/* ─── Helper functions ─── */

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

export function getWorkType(idx: number): string[] {
  const types: string[] = [];
  if (isOffshore(idx)) types.push('Offshore');
  else types.push('Onshore');
  if (URGENT_INDICES.includes(idx)) types.push('Shutdown');
  if ([3, 4, 6, 8, 9, 11, 12, 13, 15].includes(idx)) types.push('Long-term');
  if ([1, 3, 5, 7, 14].includes(idx)) types.push('Rotation');
  return types;
}

export function getContractTypeLabel(jobType: string): string {
  if (jobType === 'full-time') return 'Full-time';
  if (jobType === 'contract') return 'Contract';
  return 'Freelance';
}

export function getStaticIndex(job: Job): number {
  return STATIC_JOBS.findIndex((s) => s.title === job.title && s.company === job.company);
}

export function formatSalary(job: Job): string | null {
  if (!job.salary_min && !job.salary_max) return null;
  const min = job.salary_min ?? 0;
  const max = job.salary_max ?? 0;
  if (min >= 10000) {
    return `${job.currency}${(min / 1000).toFixed(0)}k–${(max / 1000).toFixed(0)}k /yr`;
  }
  return `${job.currency}${min.toLocaleString()}–${max.toLocaleString()} /mo`;
}
