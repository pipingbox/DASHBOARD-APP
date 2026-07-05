/**
 * Technical Search Parser — "The Google of Piping"
 *
 * Parses natural language queries from pipefitters/welders/engineers into
 * structured intent, then matches against the Technical Library.
 *
 * Supports: EN, ES, PT, NL, FR, DE
 *
 * Examples it understands:
 *   "brida 6 pulgadas 300 libras"         → flange, NPS 6", class 300#
 *   "6 inch flange 300#"                  → flange, NPS 6", class 300#
 *   "2\" weld neck 150"                   → flange WN, NPS 2", class 150#
 *   "elbow 90 LR 4"                       → fitting: elbow 90° LR, NPS 4"
 *   "wall thickness 168mm 5 bar"          → wall thickness calculator
 *   "convert 5 inches to mm"              → unit converter
 *   "pipe data 6 sch 40"                  → pipe tables, NPS 6", schedule 40
 *   "cuanto dilata 6 metros a 200 grados" → thermal expansion
 *
 * Rule-based NLU — zero API cost, instant results.
 * LLM can be added later for truly ambiguous queries (Fase 5b).
 */

import { FLANGE_SPECS, type FlangeType, type PressureClass } from './flange-data';

export type ComponentCategory = 'flange' | 'fitting' | 'pipe' | 'tool';

export interface SearchResult {
  type: 'flange' | 'fitting' | 'pipe' | 'tool' | 'ambiguous';
  title: string;
  subtitle: string;
  category: ComponentCategory | 'tool';
  route?: string;
  toolKey?: string;
  flangeType?: FlangeType;
  pressureClass?: PressureClass;
  nps?: string;
  metadata?: Record<string, string>;
  score: number;
}

// ─── NPS parsing ───

const NPS_MAP: Record<string, string> = {
  // Numeric forms
  '1/2': '1/2"', '0.5': '1/2"',
  '3/4': '3/4"', '0.75': '3/4"',
  '1': '1"', '1 1/4': '1-1/4"', '1-1/4': '1-1/4"', '1.25': '1-1/4"',
  '1 1/2': '1-1/2"', '1-1/2': '1-1/2"', '1.5': '1-1/2"',
  '2': '2"',
  '2 1/2': '2-1/2"', '2-1/2': '2-1/2"', '2.5': '2-1/2"',
  '3': '3"',
  '4': '4"',
  '6': '6"',
  '8': '8"',
  '10': '10"',
  '12': '12"',
  '14': '14"',
  '16': '16"',
  '18': '18"',
  '20': '20"',
  '24': '24"',
  // Spanish: "pulgadas" variants
  '2 pulgadas': '2"', '3 pulgadas': '3"', '4 pulgadas': '4"',
  '6 pulgadas': '6"', '8 pulgadas': '8"', '10 pulgadas': '10"',
  '12 pulgadas': '12"', '14 pulgadas': '14"', '16 pulgadas': '16"',
  '18 pulgadas': '18"', '20 pulgadas': '20"', '24 pulgadas': '24"',
};

// ─── Pressure class parsing ───

const CLASS_MAP: Record<string, PressureClass> = {
  '150': '150#', '150#': '150#', '150 libras': '150#', '150 lb': '150#', 'class 150': '150#',
  '300': '300#', '300#': '300#', '300 libras': '300#', '300 lb': '300#', 'class 300': '300#',
  '600': '600#', '600#': '600#', '600 libras': '600#', '600 lb': '600#', 'class 600': '600#',
  '900': '900#', '900#': '900#', '900 libras': '900#', '900 lb': '900#', 'class 900': '900#',
  '1500': '1500#', '1500#': '1500#', '1500 libras': '1500#', '1500 lb': '1500#', 'class 1500': '1500#',
};

// ─── Flange type parsing ───

const FLANGE_TYPE_MAP: Record<string, FlangeType> = {
  'wn': 'WN', 'weld neck': 'WN', 'cuello soldado': 'WN', 'brida cuello': 'WN',
  'so': 'SO', 'slip on': 'SO', 'slip-on': 'SO', 'deslizante': 'SO',
  'bl': 'BL', 'blind': 'BL', 'ciega': 'BL',
};

// ─── Component keyword detection ───

const FLANGE_KEYWORDS = [
  'flange', 'brida', 'bride', 'flansch', 'flensa',
  'weld neck', 'slip on', 'slip-on', 'blind', 'cuello soldado', 'deslizante', 'ciega',
  'wn', 'so', 'bl',
];

const FITTING_KEYWORDS = [
  'elbow', 'codo', 'coude', 'rohrbogen',
  'tee', 'tê', 'tes',
  'reducer', 'reducción', 'reduccion', 'reduction',
  'cap', 'tapón', 'tapon',
  'fitting', 'accesorio', 'accessoire',
  'lr', 'sr', 'long radius', 'short radius',
];

const PIPE_KEYWORDS = [
  'pipe', 'tubo', 'tubería', 'tuberia', 'tube', 'rohr', 'canería', 'cañería',
  'schedule', 'sch', 'nps', 'od', 'outside diameter',
  'wall thickness', 'espesor', 'wall',
];

const TOOL_KEYWORDS = [
  'wall thickness', 'espesor', 'pressure drop', 'caida de presion', 'caída de presión',
  'thermal expansion', 'dilatación', 'dilatacion', 'reynolds',
  'unit converter', 'conversor', 'convertir', 'convert',
  'flange rating', 'rating',
  'elbow cut', 'corte de codo', 'codo',
  'branch', 'injerto', 'rama', 'plantilla',
  'torque', 'apriete',
];

// ─── Main parse function ───

export function parseQuery(query: string): SearchResult[] {
  const q = query.toLowerCase().trim();
  if (!q || q.length < 2) return [];

  const results: SearchResult[] = [];

  // Extract NPS
  let nps: string | undefined;
  for (const [key, value] of Object.entries(NPS_MAP)) {
    const pattern = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${pattern}\\b|"${key}"`, 'i');
    if (re.test(q) || q.includes(`"${key}"`) || q.includes(`${key}"`) || q.includes(`${key} pulgadas`)) {
      if (!nps || key.length > Object.entries(NPS_MAP).find(([, v]) => v === nps)?.[0].length) {
        nps = value;
      }
    }
  }
  // Also check for NPS" format like 6" or 6 inch
  const npsMatch = q.match(/(\d+(?:[.-]\d+)?)\s*(?:"|''|inch|inches|pulgadas?|inches?)/i);
  if (npsMatch && !nps) {
    const num = npsMatch[1];
    if (NPS_MAP[num]) nps = NPS_MAP[num];
  }

  // Extract pressure class
  let pressureClass: PressureClass | undefined;
  for (const [key, value] of Object.entries(CLASS_MAP)) {
    if (q.includes(key)) {
      pressureClass = value;
      break;
    }
  }

  // Extract flange type
  let flangeType: FlangeType | undefined;
  for (const [key, value] of Object.entries(FLANGE_TYPE_MAP)) {
    if (q.includes(key)) {
      flangeType = value;
      break;
    }
  }

  // Detect component category
  const isFlange = FLANGE_KEYWORDS.some((kw) => q.includes(kw));
  const isFitting = FITTING_KEYWORDS.some((kw) => q.includes(kw));
  const isPipe = PIPE_KEYWORDS.some((kw) => q.includes(kw));
  const isTool = TOOL_KEYWORDS.some((kw) => q.includes(kw));

  // ─── Flange results ───
  if (isFlange || (nps && pressureClass && !isFitting && !isTool)) {
    const matchingFlanges = FLANGE_SPECS.filter((spec) => {
      if (nps && spec.nps !== nps) return false;
      if (pressureClass && spec.pressureClass !== pressureClass) return false;
      if (flangeType && spec.type !== flangeType) return false;
      return true;
    });

    if (matchingFlanges.length > 0 && matchingFlanges.length <= 10) {
      matchingFlanges.forEach((spec) => {
        results.push({
          type: 'flange',
          title: `${spec.typeLabel} Flange — NPS ${spec.nps} ${spec.pressureClass}`,
          subtitle: `OD ${spec.od}mm · ${spec.numBolts}×${spec.boltSize} bolts · ${spec.weight}kg · ${spec.facing}`,
          category: 'flange',
          toolKey: 'flange-library',
          flangeType: spec.type,
          pressureClass: spec.pressureClass,
          nps: spec.nps,
          metadata: {
            'OD': `${spec.od} mm`,
            'Thickness': `${spec.flangeThickness} mm`,
            'Bolts': `${spec.numBolts}×${spec.boltSize}`,
            'Weight': `${spec.weight} kg`,
          },
          score: 100 - (results.length * 2),
        });
      });
    } else if (matchingFlanges.length > 10) {
      // Too many — show summary
      results.push({
        type: 'flange',
        title: `${flangeType ? FLANGE_TYPE_LABEL(flangeType) + ' ' : ''}Flanges${nps ? ` NPS ${nps}` : ''}${pressureClass ? ` ${pressureClass}` : ''}`,
        subtitle: `${matchingFlanges.length} matching flanges. Open Flange Library to filter.`,
        category: 'flange',
        toolKey: 'flange-library',
        score: 100,
      });
    }
  }

  // ─── Pipe / pipe data results ───
  if (isPipe && !isFlange) {
    if (q.includes('wall thickness') || q.includes('espesor')) {
      results.push({
        type: 'tool',
        title: 'Pipe Wall Thickness Calculator',
        subtitle: 'ASME B31.3 — calculate required wall thickness',
        category: 'tool',
        toolKey: 'wall-thickness',
        score: 95,
      });
    }
    if (q.includes('schedule') || q.includes('sch') || q.includes('nps') || q.includes('od') || q.includes('pipe data') || q.includes('tabla')) {
      results.push({
        type: 'tool',
        title: `Pipe Data Tables${nps ? ` — NPS ${nps}` : ''}`,
        subtitle: 'NPS, OD, wall thickness, weight per ASME B36.10M',
        category: 'tool',
        toolKey: 'pipe-dimensions',
        nps,
        score: 90,
      });
    }
  }

  // ─── Fitting results (not yet in library — placeholder) ───
  if (isFitting) {
    results.push({
      type: 'fitting',
      title: 'Fitting Library (Coming Soon)',
      subtitle: 'Elbows, tees, reducers, caps per ASME B16.9 — visual library under development',
      category: 'fitting',
      score: 50,
    });
  }

  // ─── Tool results ───
  if (isTool) {
    if (q.includes('pressure drop') || q.includes('caida de presion') || q.includes('caída de presión')) {
      results.push({
        type: 'tool',
        title: 'Pressure Drop Calculator (Darcy)',
        subtitle: 'Calculate pressure loss in piping — includes Reynolds Number',
        category: 'tool',
        toolKey: 'pressure-drop',
        score: 95,
      });
    }
    if (q.includes('thermal') || q.includes('dilata') || q.includes('expansion')) {
      results.push({
        type: 'tool',
        title: 'Thermal Expansion Calculator',
        subtitle: 'Calculate pipe expansion/contraction due to temperature change',
        category: 'tool',
        toolKey: 'thermal-expansion',
        score: 95,
      });
    }
    if (q.includes('convert') || q.includes('conversor') || q.includes('conversion')) {
      results.push({
        type: 'tool',
        title: 'Unit Converter',
        subtitle: 'Convert between metric and imperial units',
        category: 'tool',
        toolKey: 'unit-converter',
        score: 95,
      });
    }
    if (q.includes('rating')) {
      results.push({
        type: 'tool',
        title: 'Flange Rating Lookup (ASME B16.5)',
        subtitle: 'Pressure-temperature ratings for flanges',
        category: 'tool',
        toolKey: 'flange-rating',
        score: 90,
      });
    }
    if (q.includes('elbow cut') || (q.includes('codo') && q.includes('corte'))) {
      results.push({
        type: 'tool',
        title: 'Elbow Cut Calculator',
        subtitle: 'Calculate cut dimensions for elbow modifications',
        category: 'tool',
        toolKey: 'elbow-cut',
        score: 95,
      });
    }
    if (q.includes('branch') || q.includes('injerto') || q.includes('rama') || q.includes('plantilla')) {
      results.push({
        type: 'tool',
        title: 'Branch Template (Injerto)',
        subtitle: 'Generate printable cut template for branch connections',
        category: 'tool',
        toolKey: 'branch-template',
        score: 95,
      });
    }
    if (q.includes('torque') || q.includes('apriete')) {
      results.push({
        type: 'tool',
        title: 'Flange Library — Bolt Torque',
        subtitle: 'Stud bolt torque values per ASME PCC-1',
        category: 'tool',
        toolKey: 'flange-library',
        score: 85,
      });
    }
  }

  // ─── Fallback: if we detected NPS + class but no category, suggest flange ───
  if (results.length === 0 && nps && pressureClass) {
    results.push({
      type: 'flange',
      title: `Flanges NPS ${nps} ${pressureClass}`,
      subtitle: `${FLANGE_SPECS.filter((s) => s.nps === nps && s.pressureClass === pressureClass).length} matching flanges in library`,
      category: 'flange',
      toolKey: 'flange-library',
      nps,
      pressureClass,
      score: 80,
    });
  }

  return results.sort((a, b) => b.score - a.score);
}

function FLANGE_TYPE_LABEL(type: FlangeType): string {
  return type === 'WN' ? 'Weld Neck' : type === 'SO' ? 'Slip-On' : 'Blind';
}

// ─── Quick suggestions (when search bar is empty or focused) ───

export const SEARCH_SUGGESTIONS = [
  '6" flange 300#',
  'brida 6 pulgadas 300 libras',
  'weld neck 4" 150#',
  '2" blind flange',
  'wall thickness calculator',
  'espesor de tubería',
  'pressure drop',
  'thermal expansion',
  'branch template injerto',
  'unit converter',
];
