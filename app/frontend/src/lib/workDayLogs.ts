// Shared types and helpers for the Work Day Log / Salary Log feature.
import { CurrencyCode } from './currency';

export interface RatePreset {
  id: string;
  user_id: string;
  name: string;
  location: string | null;
  normal_rate: number;
  extra_rate: number;
  kilometer_rate: number | null;
  currency: CurrencyCode;
  created_at: string;
}

export interface WorkDayLog {
  id: string;
  user_id: string;
  log_date: string; // YYYY-MM-DD
  location: string;
  normal_hours: number;
  extra_hours: number;
  normal_rate: number;
  extra_rate: number;
  normal_salary: number;
  extra_salary: number;
  total_salary: number;
  kilometers: number | null;
  kilometer_rate: number | null;
  travel_allowance: number | null;
  final_total: number;
  currency: CurrencyCode;
  notes: string | null;
  preset_id: string | null;
  created_at: string;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

export interface SalaryBreakdown {
  normalSalary: number;
  extraSalary: number;
  totalSalary: number;
  travelAllowance: number;
  finalTotal: number;
}

export function computeSalary(args: {
  normalHours: number;
  extraHours: number;
  normalRate: number;
  extraRate: number;
  kilometers?: number;
  kilometerRate?: number;
  travelAllowanceOverride?: number | null;
}): SalaryBreakdown {
  const ns = round2(args.normalHours * args.normalRate);
  const es = round2(args.extraHours * args.extraRate);
  const ts = round2(ns + es);
  const computedTravel = round2((args.kilometers || 0) * (args.kilometerRate || 0));
  const travel =
    args.travelAllowanceOverride != null && !Number.isNaN(args.travelAllowanceOverride)
      ? round2(args.travelAllowanceOverride)
      : computedTravel;
  return {
    normalSalary: ns,
    extraSalary: es,
    totalSalary: ts,
    travelAllowance: travel,
    finalTotal: round2(ts + travel),
  };
}

export function todayIso(): string {
  const d = new Date();
  return toIsoDate(d);
}

export function toIsoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function monthBounds(year: number, monthIndex: number): { start: string; end: string } {
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 0);
  return { start: toIsoDate(start), end: toIsoDate(end) };
}