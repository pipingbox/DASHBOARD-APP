// PB-CV-EXPERIENCE-DERIVATION-001 — Cálculo canónico de experiencia derivada
// a partir de las fechas de proposed_experiences.
//
// Diseño (ticket FASE 2):
// - Cada experiencia válida se convierte en un intervalo temporal en meses
//   (formatos soportados: YYYY-MM-DD → mes, YYYY-MM, YYYY → punto medio
//   documentado: 1 de julio; currently_working → fin = mes actual inyectado).
// - Los intervalos se FUSIONAN antes de sumar: dos empleos simultáneos de
//   2 años cuentan 2, no 4; un contrato contenido no suma (QA §7.3/§7.4).
// - Política de conversión documentada: years_experience =
//   floor(total_meses / 12). Nunca redondeo hacia arriba (1 año y 7 meses
//   → 1). El total de meses se conserva en metadata para diagnóstico.
// - Sin fechas suficientes (sin inicio, o sin fin y no es trabajo actual):
//   intervalo ignorado, jamás inventado.
// - Relación con años explícitos (FASE 2E): el llamador compara el valor
//   explícito con el derivado; EXPLICIT_DERIVED_DISCREPANCY_YEARS es el
//   umbral centralizado a partir del cual hay discrepancia material que
//   exige revisión (el campo explícito pasa a confidence low + metadata
//   de discrepancia). Zona intermedia (|diff| == 2): explícito se mantiene
//   pero baja a medium por inconsistencia potencial.

import type { ProposedExperience } from './types.ts';

/** Umbral centralizado de discrepancia material explícito vs derivado. */
export const EXPLICIT_DERIVED_DISCREPANCY_YEARS = 3;

export interface ExperienceDerivation {
  /** Meses totales sobre la unión de intervalos (fusión anti-doble-conteo). */
  totalMonths: number;
  /** floor(totalMonths / 12) — política documentada. */
  derivedYears: number;
  /** Intervalos utilizables (con inicio y fin/actualidad). */
  intervalsUsed: number;
  /** Experiencias totales propuestas. */
  intervalsTotal: number;
  /** true si TODA fecha usada tiene precisión mes (o día); false si alguna
   *  es solo-año (punto medio 1 de julio) — baja la confianza a medium. */
  fullPrecision: boolean;
}

interface MonthInterval {
  /** Mes absoluto (year * 12 + monthIndex 0..11), inicio inclusive. */
  start: number;
  /** Mes absoluto, fin inclusive. */
  end: number;
  fullPrecision: boolean;
}

/** Parsea una fecha del CV ("YYYY" | "YYYY-MM" | "YYYY-MM-DD") a mes
 *  absoluto. Devuelve null si no es interpretable con seguridad. YYYY usa
 *  el punto medio del año (mes 6, base 0) — política documentada. */
function parseToAbsoluteMonth(date: string): { month: number; fullPrecision: boolean } | null {
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(date.trim());
  if (!m) return null;
  const year = parseInt(m[1], 10);
  if (year < 1950 || year > 2100) return null;
  if (m[2] !== undefined) {
    const mm = parseInt(m[2], 10);
    if (mm < 1 || mm > 12) return null;
    return { month: year * 12 + (mm - 1), fullPrecision: true };
  }
  // Solo año: punto medio (julio). No inventamos día; el error máximo es
  // ±6 meses y se degrada la confianza global a medium.
  return { month: year * 12 + 6, fullPrecision: false };
}

function toInterval(exp: ProposedExperience, nowAbsMonth: number): MonthInterval | null {
  const start = exp.start_date ? parseToAbsoluteMonth(exp.start_date) : null;
  if (!start) return null;
  let end: { month: number; fullPrecision: boolean } | null = null;
  if (exp.currently_working) {
    end = { month: nowAbsMonth, fullPrecision: true };
  } else if (exp.end_date) {
    end = parseToAbsoluteMonth(exp.end_date);
  }
  if (!end || end.month < start.month) return null;
  return {
    start: start.month,
    end: end.month,
    fullPrecision: start.fullPrecision && end.fullPrecision,
  };
}

/** Deriva la experiencia total desde las experiencias propuestas.
 *  `nowIso` es inyectable para tests deterministas. Devuelve null si no hay
 *  ningún intervalo utilizable. */
export function deriveExperienceMonths(
  experiences: ProposedExperience[],
  nowIso: string,
): ExperienceDerivation | null {
  const nowDate = new Date(nowIso);
  if (Number.isNaN(nowDate.getTime())) return null;
  const nowAbsMonth = nowDate.getUTCFullYear() * 12 + nowDate.getUTCMonth();

  const intervals: MonthInterval[] = [];
  for (const exp of experiences) {
    const interval = toInterval(exp, nowAbsMonth);
    if (interval) intervals.push(interval);
  }
  if (intervals.length === 0) return null;

  // Fusión de intervalos (anti-doble-conteo): ordenar por inicio y unir
  // cualquier intervalo que solape (o toque) el actual. Compartir el mes
  // frontera cuenta como continuo: 2010-01→2015-01 + 2015-01→2020-01 = un
  // único intervalo de 121 meses; al hacer floor(/12) ambas lecturas dan
  // 10 años (QA §7.2) y evita sumar el mes frontera dos veces.
  intervals.sort((a, b) => a.start - b.start);
  const merged: MonthInterval[] = [];
  for (const iv of intervals) {
    const last = merged[merged.length - 1];
    if (last && iv.start <= last.end) {
      if (iv.end > last.end) last.end = iv.end;
      last.fullPrecision = last.fullPrecision && iv.fullPrecision;
    } else {
      merged.push({ ...iv });
    }
  }

  // Duración en meses, inclusiva en ambos extremos. floor(total/12) hace
  // la política invariante ante el mes frontera compartido.
  let totalMonths = 0;
  let fullPrecision = true;
  for (const iv of merged) {
    totalMonths += iv.end - iv.start + 1;
    fullPrecision = fullPrecision && iv.fullPrecision;
  }

  return {
    totalMonths,
    derivedYears: Math.floor(totalMonths / 12),
    intervalsUsed: intervals.length,
    intervalsTotal: experiences.length,
    fullPrecision,
  };
}

/** Clasifica la coherencia entre años explícitos y derivados (FASE 2E).
 *  Determinista: diff ≤ 1 → 'coherent'; diff ≥ umbral → 'discrepant';
 *  zona intermedia → 'uncertain'. */
export function classifyExplicitDerived(
  explicitYears: number,
  derivedYears: number,
): 'coherent' | 'uncertain' | 'discrepant' {
  const diff = Math.abs(explicitYears - derivedYears);
  if (diff <= 1) return 'coherent';
  if (diff >= EXPLICIT_DERIVED_DISCREPANCY_YEARS) return 'discrepant';
  return 'uncertain';
}
