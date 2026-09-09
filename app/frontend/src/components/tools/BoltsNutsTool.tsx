import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Wrench, Maximize2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import ToolBase from './ToolBase';
import {
  resolveBoltingSpec,
  ASME_B16_5_PRESSURE_CLASSES,
  ASME_B16_5_NPS_ORDER,
  type FacingType,
  formatInchFraction,
  formatMm,
  formatLengthDisplay,
  formatDiameterDisplay,
} from '@/lib/bolting';

// ═══════════════════════════════════════════════════════════════
// CONFIGURACIÓN / MATERIALES / JUNTAS / FACTOR K
// ═══════════════════════════════════════════════════════════════

const NPS_OPTIONS = ASME_B16_5_NPS_ORDER;
const CLASSES = ASME_B16_5_PRESSURE_CLASSES.map(String);

interface BoltMaterial {
  id: string;
  studGrade: string;
  nutGrade: string;
  studStandard: string;
  nutStandard: string;
  tempRange: string;
  usageKey: string;
  usageDefault: string;
}

const BOLT_MATERIALS: BoltMaterial[] = [
  {
    id: 'b7',
    studGrade: 'ASTM A193 B7',
    nutGrade: 'ASTM A194 2H',
    studStandard: 'ASTM A193/A193M',
    nutStandard: 'ASTM A194/A194M',
    tempRange: '-29 °C … +427 °C',
    usageKey: 'tools.bolts.matUseB7',
    usageDefault:
      'Acero aleado cromo-molibdeno, templado y revenido. Espárrago de uso general para bridas de acero al carbono y de baja aleación. No apto para servicio criogénico y requiere protección en ambientes húmedos o marinos.',
  },
  {
    id: 'b8m2',
    studGrade: 'ASTM A193 B8M Cl. 2',
    nutGrade: 'ASTM A194 8M',
    studStandard: 'ASTM A193/A193M',
    nutStandard: 'ASTM A194/A194M',
    tempRange: '-196 °C … +538 °C',
    usageKey: 'tools.bolts.matUseB8M',
    usageDefault:
      'Acero inoxidable austenítico AISI 316 (Clase 2). Para servicio corrosivo, con cloruros, marino y criogénico. Propenso al gripado: lubricante anti-seize imprescindible.',
  },
  {
    id: 'b16',
    studGrade: 'ASTM A193 B16',
    nutGrade: 'ASTM A194 4 / 7',
    studStandard: 'ASTM A193/A193M',
    nutStandard: 'ASTM A194/A194M',
    tempRange: '-29 °C … +538 °C',
    usageKey: 'tools.bolts.matUseB16',
    usageDefault:
      'Acero aleado cromo-molibdeno-vanadio. Alta temperatura y resistencia a la fluencia lenta (creep), típicamente en vapor e hidrocarburos calientes.',
  },
];

interface GasketType {
  id: string;
  labelKey: string;
  labelDefault: string;
  sgT: number | null;
  noteKey: string;
  noteDefault: string;
}

const GASKET_TYPES: GasketType[] = [
  {
    id: 'spiralWound',
    labelKey: 'tools.bolts.gasketSpiral',
    labelDefault: 'Espiral metálica (spiral wound)',
    sgT: 30,
    noteKey: 'tools.bolts.gasketSpiralNote',
    noteDefault:
      'SgT = 30 ksi es el valor del ejemplo resuelto de ASME PCC-1 Ap. O-4.3 para una junta espirometálica según ASME B16.20. Verificar contra el dato del fabricante.',
  },
  {
    id: 'ringJoint',
    labelKey: 'tools.bolts.gasketRtj',
    labelDefault: 'Ring joint (RTJ, anillo metálico)',
    sgT: null,
    noteKey: 'tools.bolts.gasketRtjNote',
    noteDefault:
      'La junta RTJ sella por fluencia localizada del anillo metálico. ASME PCC-1 no publica un SgT genérico: obtener del fabricante y de la especificación del proyecto.',
  },
  {
    id: 'sheet',
    labelKey: 'tools.bolts.gasketSheet',
    labelDefault: 'Junta plana de lámina (sheet gasket)',
    sgT: null,
    noteKey: 'tools.bolts.gasketSheetNote',
    noteDefault:
      'Las juntas planas no metálicas asientan a tensiones inferiores y pueden aplastarse. El SgT y la tensión máxima admisible dependen del material y deben tomarse del fabricante.',
  },
];

interface NutFactor {
  id: string;
  value: number;
  key: 'k015' | 'k018' | 'k020';
  labelKey: string;
  labelDefault: string;
}

const NUT_FACTORS: NutFactor[] = [
  {
    id: '0.15',
    value: 0.15,
    key: 'k015',
    labelKey: 'tools.bolts.k015',
    labelDefault: 'K = 0.15 — lubricante de alto rendimiento (PTFE / moly)',
  },
  {
    id: '0.18',
    value: 0.18,
    key: 'k018',
    labelKey: 'tools.bolts.k018',
    labelDefault: 'K = 0.18 — antiseize convencional bien aplicado',
  },
  {
    id: '0.20',
    value: 0.20,
    key: 'k020',
    labelKey: 'tools.bolts.k020',
    labelDefault: 'K = 0.20 — roscas limpias con lubricación mínima',
  },
];

// ASME PCC-1 Appendix O — Target Torque Index Ti (ft-lb / ksi) for low-alloy bolting.
const TORQUE_INDEX: Record<string, { k015: number; k018: number; k020: number }> = {
  '1/2"': { k015: 0.79, k018: 0.94, k020: 1.05 },
  '5/8"': { k015: 1.58, k018: 1.89, k020: 2.10 },
  '3/4"': { k015: 2.83, k018: 3.40, k020: 3.78 },
  '7/8"': { k015: 4.58, k018: 5.50, k020: 6.11 },
  '1"': { k015: 6.89, k018: 8.27, k020: 9.18 },
  '1-1/8"': { k015: 10.2, k018: 12.3, k020: 13.7 },
  '1-1/4"': { k015: 14.5, k018: 17.4, k020: 19.4 },
  '1-3/8"': { k015: 19.9, k018: 23.8, k020: 26.5 },
  '1-1/2"': { k015: 26.3, k018: 31.6, k020: 35.1 },
  '1-5/8"': { k015: 34.1, k018: 41.0, k020: 45.5 },
  '1-3/4"': { k015: 43.3, k018: 52.0, k020: 57.8 },
  '1-7/8"': { k015: 53.9, k018: 64.7, k020: 71.9 },
  '2"': { k015: 66.3, k018: 79.5, k020: 88.3 },
  '2-1/4"': { k015: 96.2, k018: 115, k020: 128 },
  '2-1/2"': { k015: 134, k018: 161, k020: 179 },
  '2-3/4"': { k015: 181, k018: 217, k020: 241 },
  '3"': { k015: 237, k018: 284, k020: 316 },
  '3-1/4"': { k015: 304, k018: 365, k020: 406 },
  '3-1/2"': { k015: 383, k018: 459, k020: 510 },
};

// Tightening sequence — ASME PCC-1 Table 3 Legacy cross-pattern.
const CROSS_PATTERN: Record<number, number[][]> = {
  4: [[1, 3, 2, 4]],
  8: [[1, 5, 3, 7], [2, 6, 4, 8]],
  12: [[1, 7, 4, 10], [2, 8, 5, 11], [3, 9, 6, 12]],
  16: [[1, 9, 5, 13], [3, 11, 7, 15], [2, 10, 6, 14], [4, 12, 8, 16]],
  20: [[1, 11, 6, 16], [3, 13, 8, 18], [5, 15, 10, 20], [2, 12, 7, 17], [4, 14, 9, 19]],
  24: [[1, 13, 7, 19], [4, 16, 10, 22], [2, 14, 8, 20], [5, 17, 11, 23], [3, 15, 9, 21], [6, 18, 12, 24]],
};

const TORQUE_ROUNDS = [
  { id: 'install', pct: null, labelKey: 'tools.bolts.roundInstall', labelDefault: 'Instalación', descKey: 'tools.bolts.roundInstallDesc', descDefault: 'Apretar a mano y "snug up" a 15–30 N·m, sin superar el 20 % del par objetivo.' },
  { id: 'r1', pct: '20–30 %', labelKey: 'tools.bolts.round1', labelDefault: 'Ronda 1', descKey: 'tools.bolts.round1Desc', descDefault: 'Apretar al 20–30 % del par objetivo en secuencia cruzada.' },
  { id: 'r2', pct: '50–70 %', labelKey: 'tools.bolts.round2', labelDefault: 'Ronda 2', descKey: 'tools.bolts.round2Desc', descDefault: 'Apretar al 50–70 % del par objetivo en secuencia cruzada.' },
  { id: 'r3', pct: '100 %', labelKey: 'tools.bolts.round3', labelDefault: 'Ronda 3', descKey: 'tools.bolts.round3Desc', descDefault: 'Apretar al 100 % del par objetivo en secuencia cruzada.' },
  { id: 'r4', pct: '100 %', labelKey: 'tools.bolts.round4', labelDefault: 'Ronda 4', descKey: 'tools.bolts.round4Desc', descDefault: 'Continuar al 100 % en patrón circular hasta que ninguna tuerca gire más.' },
  { id: 'r5', pct: '100 %', labelKey: 'tools.bolts.round5', labelDefault: 'Ronda 5', descKey: 'tools.bolts.round5Desc', descDefault: 'Esperar mínimo 4 h y repetir para recuperar relajación/empotramiento.' },
];

// ═══════════════════════════════════════════════════════════════
// SVG — STUD BOLT ASSEMBLY
// ═══════════════════════════════════════════════════════════════

interface StudBoltSVGProps {
  spec: ReturnType<typeof resolveBoltingSpec>;
  expanded?: boolean;
}

function StudBoltSVG({ spec, expanded = false }: StudBoltSVGProps) {
  const { t } = useTranslation();

  if (!spec.available || !spec.stud || !spec.nut) {
    return (
      <div className="flex min-h-[160px] items-center justify-center rounded border border-zinc-800 bg-[#0E1117] text-xs text-zinc-500">
        {spec.reason || t('tools.bolts.noData', { defaultValue: 'Sin datos para esta combinación' })}
      </div>
    );
  }

  const { stud, nut } = spec;

  const viewW = expanded ? 900 : 760;
  const viewH = expanded ? 340 : 280;
  const margin = 50;
  const drawW = viewW - margin * 2;

  const scale = (drawW * 0.65) / stud.lengthMm;

  const cy = viewH / 2;
  const studLen = stud.lengthMm * scale;
  const studDia = Math.max(stud.diameterIn * 25.4 * scale, 6);
  const nutH = Math.max(nut.heightMm * scale, 10);
  const nutW = Math.max(nut.afMm * scale, 12);
  const protrusion = stud.minProtrusionMm * scale;
  const pitchPx = stud.pitchMm * scale;

  const studLeft = (viewW - studLen) / 2;
  const studRight = studLeft + studLen;
  const studTop = cy - studDia / 2;

  const flangeW = studLen * 0.16;
  const gasketW = Math.max(studLen * 0.04, 8);
  const cx = viewW / 2;

  const flangeLeftX = cx - flangeW - gasketW / 2;
  const flangeRightX = cx + gasketW / 2;
  const flangeH = Math.max(studDia * 4.5, 70);

  const gasketX = cx - gasketW / 2;
  const gasketH = flangeH - 24;

  const leftNutCx = studLeft + protrusion + nutW / 2;
  const rightNutCx = studRight - protrusion - nutW / 2;

  const orange = '#FF8C00';
  const blue = '#3EA6FF';
  const zinc = '#A3A9B3';
  const dark = '#0E1117';
  const flangeFill = '#27272a';
  const nutFill = '#232A36';

  const hexPoints = (cx0: number, cy0: number, w: number, h: number): string => {
    const hw = w / 2;
    const hh = h / 2;
    return `${cx0 - hw * 0.8},${cy0 - hh} ${cx0 + hw * 0.8},${cy0 - hh} ${cx0 + hw},${cy0} ${cx0 + hw * 0.8},${cy0 + hh} ${cx0 - hw * 0.8},${cy0 + hh} ${cx0 - hw},${cy0}`;
  };

  const renderThreads = (x1: number, x2: number) => {
    const length = x2 - x1;
    if (length <= 0) return null;
    // Show at least 3 full threads in the visible protrusion.
    const minThreads = 3;
    const threads = Math.max(minThreads, Math.floor(length / Math.max(pitchPx, 2)));
    const step = length / threads;
    const lines: JSX.Element[] = [];
    for (let i = 0; i < threads; i++) {
      const xi = x1 + (i + 0.5) * step;
      lines.push(
        <line
          key={`t-${i}`}
          x1={xi}
          y1={studTop}
          x2={xi - Math.min(step * 0.35, studDia * 0.4)}
          y2={studTop + studDia}
          stroke={blue}
          strokeWidth="0.7"
          opacity="0.85"
        />
      );
    }
    return lines;
  };

  const ariaLabel = t('tools.bolts.svgAria', {
    defaultValue: 'Stud bolt {{dia}} with two heavy hex nuts, NPS {{nps}} Class {{cls}} {{facing}}',
    dia: stud.threadDesignation,
    nps: spec.nps,
    cls: spec.pressureClass,
    facing: spec.facing,
  });

  return (
    <svg
      viewBox={`0 0 ${viewW} ${viewH}`}
      className="w-full h-auto"
      role="img"
      aria-label={ariaLabel}
    >
      <rect width={viewW} height={viewH} fill={dark} rx="6" />

      <defs>
        <pattern id="studGrid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#1a2030" strokeWidth="0.3" />
        </pattern>
        <marker id="arrL" markerWidth="6" markerHeight="6" refX="0" refY="3" orient="auto">
          <path d="M6,0 L0,3 L6,6" fill="none" stroke={orange} strokeWidth="1" />
        </marker>
        <marker id="arrR" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6" fill="none" stroke={orange} strokeWidth="1" />
        </marker>
        <marker id="arrLB" markerWidth="5" markerHeight="5" refX="0" refY="2.5" orient="auto">
          <path d="M5,0 L0,2.5 L5,5" fill="none" stroke={blue} strokeWidth="0.8" />
        </marker>
        <marker id="arrRB" markerWidth="5" markerHeight="5" refX="5" refY="2.5" orient="auto">
          <path d="M0,0 L5,2.5 L0,5" fill="none" stroke={blue} strokeWidth="0.8" />
        </marker>
      </defs>
      <rect width={viewW} height={viewH} fill="url(#studGrid)" opacity="0.5" />

      {/* Left flange */}
      <rect
        x={flangeLeftX}
        y={cy - flangeH / 2}
        width={flangeW}
        height={flangeH}
        fill={flangeFill}
        stroke={zinc}
        strokeWidth="1.5"
        rx="2"
      />
      <text x={flangeLeftX + flangeW / 2} y={cy + 4} fill="#71717a" fontSize="9" textAnchor="middle">FLANGE</text>

      {/* Gasket */}
      <rect
        x={gasketX}
        y={cy - gasketH / 2}
        width={gasketW}
        height={gasketH}
        fill="#22d3ee15"
        stroke="#22d3ee"
        strokeWidth="1"
      />
      <text x={cx} y={cy - gasketH / 2 - 6} fill="#22d3ee" fontSize="8" textAnchor="middle">GASKET</text>

      {/* Right flange */}
      <rect
        x={flangeRightX}
        y={cy - flangeH / 2}
        width={flangeW}
        height={flangeH}
        fill={flangeFill}
        stroke={zinc}
        strokeWidth="1.5"
        rx="2"
      />
      <text x={flangeRightX + flangeW / 2} y={cy + 4} fill="#71717a" fontSize="9" textAnchor="middle">FLANGE</text>

      {/* Stud shank */}
      <rect
        x={studLeft}
        y={studTop}
        width={studLen}
        height={studDia}
        fill="#1a2030"
        stroke={orange}
        strokeWidth="1.2"
      />

      {/* Thread symbols on both ends */}
      {renderThreads(studLeft, leftNutCx - nutW / 2)}
      {renderThreads(rightNutCx + nutW / 2, studRight)}

      {/* Left heavy hex nut */}
      <polygon
        points={hexPoints(leftNutCx, cy, nutW, nutH)}
        fill={nutFill}
        stroke={orange}
        strokeWidth="1.5"
      />
      <line x1={leftNutCx - nutW / 4} y1={cy - nutH / 3} x2={leftNutCx + nutW / 4} y2={cy - nutH / 3} stroke="#3f3f46" strokeWidth="0.5" />
      <line x1={leftNutCx - nutW / 4} y1={cy + nutH / 3} x2={leftNutCx + nutW / 4} y2={cy + nutH / 3} stroke="#3f3f46" strokeWidth="0.5" />

      {/* Right heavy hex nut */}
      <polygon
        points={hexPoints(rightNutCx, cy, nutW, nutH)}
        fill={nutFill}
        stroke={orange}
        strokeWidth="1.5"
      />
      <line x1={rightNutCx - nutW / 4} y1={cy - nutH / 3} x2={rightNutCx + nutW / 4} y2={cy - nutH / 3} stroke="#3f3f46" strokeWidth="0.5" />
      <line x1={rightNutCx - nutW / 4} y1={cy + nutH / 3} x2={rightNutCx + nutW / 4} y2={cy + nutH / 3} stroke="#3f3f46" strokeWidth="0.5" />

      {/* Chamfer note: L excludes chamfers/points */}
      <text x={cx} y={viewH - 10} fill="#71717a" fontSize="8" textAnchor="middle">
        {t('tools.bolts.lengthDefinitionNote', {
          defaultValue: 'L no incluye los chaflanes/puntas de los extremos',
        })}
      </text>

      {/* Dimension lines */}
      <line
        x1={studLeft}
        y1={cy + flangeH / 2 + 18}
        x2={studRight}
        y2={cy + flangeH / 2 + 18}
        stroke={orange}
        strokeWidth="1.2"
        markerStart="url(#arrL)"
        markerEnd="url(#arrR)"
      />
      <line x1={studLeft} y1={cy + flangeH / 2 + 6} x2={studLeft} y2={cy + flangeH / 2 + 24} stroke={orange} strokeWidth="0.6" />
      <line x1={studRight} y1={cy + flangeH / 2 + 6} x2={studRight} y2={cy + flangeH / 2 + 24} stroke={orange} strokeWidth="0.6" />
      <text x={cx} y={cy + flangeH / 2 + 32} fill={orange} fontSize="11" textAnchor="middle" fontWeight="bold">
        L = {formatLengthDisplay(stud.lengthMm)}
      </text>

      {/* Protrusion left e1 (orange) */}
      <line
        x1={studLeft}
        y1={cy + flangeH / 2 + 42}
        x2={leftNutCx - nutW / 2}
        y2={cy + flangeH / 2 + 42}
        stroke={orange}
        strokeWidth="1"
        markerStart="url(#arrL)"
        markerEnd="url(#arrR)"
      />
      <text x={(studLeft + leftNutCx - nutW / 2) / 2} y={cy + flangeH / 2 + 52} fill={orange} fontSize="9" textAnchor="middle">
        e₁ ≥ 3P ({formatMm(stud.minProtrusionMm)} mm)
      </text>

      {/* Protrusion right e2 (orange) */}
      <line
        x1={rightNutCx + nutW / 2}
        y1={cy + flangeH / 2 + 42}
        x2={studRight}
        y2={cy + flangeH / 2 + 42}
        stroke={orange}
        strokeWidth="1"
        markerStart="url(#arrL)"
        markerEnd="url(#arrR)"
      />
      <text x={(rightNutCx + nutW / 2 + studRight) / 2} y={cy + flangeH / 2 + 52} fill={orange} fontSize="9" textAnchor="middle">
        e₂ ≥ 3P ({formatMm(stud.minProtrusionMm)} mm)
      </text>

      {/* Pitch / TPI callout (blue) */}
      <text x={cx} y={studTop - 28} fill={blue} fontSize="10" textAnchor="middle">
        TPI = {stud.tpi} · P = {formatMm(stud.pitchMm)} mm
      </text>
      <line
        x1={cx - pitchPx / 2}
        y1={studTop - 22}
        x2={cx + pitchPx / 2}
        y2={studTop - 22}
        stroke={blue}
        strokeWidth="0.8"
        markerStart="url(#arrLB)"
        markerEnd="url(#arrRB)"
      />

      {/* Diameter d (blue) */}
      <line x1={cx} y1={studTop - 10} x2={cx} y2={studTop + studDia + 4} stroke={blue} strokeWidth="0.8" strokeDasharray="3 2" />
      <text x={cx + 6} y={studTop - 14} fill={blue} fontSize="10" textAnchor="start">
        Ø{formatDiameterDisplay(stud.diameterIn)}
      </text>

      {/* Nut AF (blue) */}
      <line
        x1={leftNutCx - nutW / 2 - 6}
        y1={cy - nutH / 2 - 8}
        x2={leftNutCx + nutW / 2 + 6}
        y2={cy - nutH / 2 - 8}
        stroke={blue}
        strokeWidth="0.8"
        markerStart="url(#arrLB)"
        markerEnd="url(#arrRB)"
      />
      <text x={leftNutCx} y={cy - nutH / 2 - 14} fill={blue} fontSize="9" textAnchor="middle">
        AF {formatMm(nut.afMm)} mm
      </text>

      {/* Nut height H (blue) */}
      <line
        x1={rightNutCx + nutW / 2 + 12}
        y1={cy - nutH / 2}
        x2={rightNutCx + nutW / 2 + 12}
        y2={cy + nutH / 2}
        stroke={blue}
        strokeWidth="0.8"
        markerStart="url(#arrLB)"
        markerEnd="url(#arrRB)"
      />
      <text x={rightNutCx + nutW / 2 + 18} y={cy + 3} fill={blue} fontSize="9" textAnchor="start">
        H {formatMm(nut.heightMm)} mm
      </text>

      {/* Title */}
      <text x={viewW - 10} y={18} fill="#A3A9B3" fontSize="9" textAnchor="end">
        {spec.nps} — Class {spec.pressureClass} — {spec.facing}
      </text>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════
// STAR / CROSS PATTERN DIAGRAM
// ═══════════════════════════════════════════════════════════════

interface StarPatternProps {
  qty: number;
  nps: string;
  flangeClass: string;
}

function StarPattern({ qty, nps, flangeClass }: StarPatternProps) {
  const { t } = useTranslation();
  const passes = CROSS_PATTERN[qty];
  const size = 320;
  const c = size / 2;
  const r = size * 0.36;

  const posOf = (boltNo: number) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * (boltNo - 1)) / qty;
    return { x: c + r * Math.cos(angle), y: c + r * Math.sin(angle) };
  };

  const passColors = ['#FF8C00', '#3EA6FF', '#22d3ee', '#f97316', '#a3e635', '#c084fc'];

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-auto" style={{ maxWidth: '320px' }}
      role="img" aria-label={t('tools.bolts.starPatternAria', { defaultValue: 'Diagrama de secuencia de apriete en estrella' })}>
      <rect width={size} height={size} fill="#0E1117" rx="6" />

      <circle cx={c} cy={c} r={r + 26} fill="none" stroke="#232A36" strokeWidth="1.5" />
      <circle cx={c} cy={c} r={r} fill="none" stroke="#232A36" strokeWidth="1" strokeDasharray="3 3" />
      <circle cx={c} cy={c} r={r - 30} fill="none" stroke="#232A36" strokeWidth="1.5" />

      {passes ? (
        <>
          {passes.map((pass, pi) => (
            <g key={pi}>
              {pass.slice(0, -1).map((b, bi) => {
                const p1 = posOf(b);
                const p2 = posOf(pass[bi + 1]);
                return (
                  <line key={bi} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                    stroke={passColors[pi % passColors.length]} strokeWidth="1.2" opacity="0.75" />
                );
              })}
            </g>
          ))}
        </>
      ) : null}

      {Array.from({ length: qty }, (_, i) => {
        const no = i + 1;
        const p = posOf(no);
        return (
          <g key={no}>
            <circle cx={p.x} cy={p.y} r="11" fill="#232A36" stroke="#FF8C00" strokeWidth="1.2" />
            <text x={p.x} y={p.y} fill="#F5F7FA" fontSize="10" textAnchor="middle" dominantBaseline="central" fontWeight="bold">{no}</text>
          </g>
        );
      })}

      <text x={c} y={c - 6} fill="#A3A9B3" fontSize="10" textAnchor="middle">{nps} — Class {flangeClass}</text>
      <text x={c} y={c + 10} fill="#FF8C00" fontSize="11" textAnchor="middle" fontWeight="bold">
        {qty} {t('tools.bolts.boltsShort', { defaultValue: 'pernos' })}
      </text>
      <text x={size - 8} y={size - 8} fill="#A3A9B3" fontSize="8" textAnchor="end">
        {passes
          ? t('tools.bolts.starPatternSource', { defaultValue: 'ASME PCC-1 Tabla 3 (patrón Legacy)' })
          : t('tools.bolts.starPatternNoData', { defaultValue: 'Patrón no tabulado para esta cantidad' })}
      </text>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function BoltsNutsTool() {
  const { t } = useTranslation();
  const [nps, setNps] = useState<string>('2"');
  const [flangeClass, setFlangeClass] = useState<string>('150');
  const [facing, setFacing] = useState<FacingType>('RF');
  const [materialId, setMaterialId] = useState<string>('b7');
  const [nutFactorId, setNutFactorId] = useState<string>('0.18');
  const [gasketId, setGasketId] = useState<string>('spiralWound');
  const [boltStress, setBoltStress] = useState<string>('');
  const [expanded, setExpanded] = useState(false);

  const spec = useMemo(
    () => resolveBoltingSpec(nps, Number(flangeClass), facing),
    [nps, flangeClass, facing]
  );

  const material = BOLT_MATERIALS.find((m) => m.id === materialId) ?? BOLT_MATERIALS[0];
  const gasket = GASKET_TYPES.find((g) => g.id === gasketId) ?? GASKET_TYPES[0];
  const nutFactor = NUT_FACTORS.find((n) => n.id === nutFactorId) ?? NUT_FACTORS[1];

  const torque = useMemo(() => {
    if (!spec.available || !spec.stud) return null;
    const sb = parseFloat(boltStress);
    if (!Number.isFinite(sb) || sb <= 0) return null;
    const idx = TORQUE_INDEX[spec.stud.diameterDisplay];
    if (!idx) return null;
    if (material.id === 'b8m2') return null;
    const ti = idx[nutFactor.key];
    const ftlb = sb * ti;
    return { ftlb, nm: ftlb * 1.35582, ti };
  }, [spec, boltStress, material.id, nutFactor.key]);

  const hasTorqueIndex = spec.stud ? TORQUE_INDEX[spec.stud.diameterDisplay] !== undefined : false;

  const inputsContent = (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">NPS</label>
        <Select value={nps} onValueChange={setNps}>
          <SelectTrigger className="h-9 bg-[#0E1117] border-[#232A36]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {NPS_OPTIONS.map((opt) => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">
          {t('tools.flangeClass', { defaultValue: 'Clase' })}
        </label>
        <Select value={flangeClass} onValueChange={setFlangeClass}>
          <SelectTrigger className="h-9 bg-[#0E1117] border-[#232A36]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CLASSES.map((cls) => (
              <SelectItem key={cls} value={cls}>Class {cls}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">
          {t('tools.bolts.facingLabel', { defaultValue: 'Flange facing' })}
        </label>
        <Select value={facing} onValueChange={(v) => setFacing(v as FacingType)}>
          <SelectTrigger className="h-9 bg-[#0E1117] border-[#232A36]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="RF">RF — Raised Face</SelectItem>
            <SelectItem value="RTJ">RTJ — Ring Type Joint</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">
          {t('tools.bolts.materialLabel', { defaultValue: 'Material del espárrago' })}
        </label>
        <Select value={materialId} onValueChange={setMaterialId}>
          <SelectTrigger className="h-9 bg-[#0E1117] border-[#232A36]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BOLT_MATERIALS.map((m) => (
              <SelectItem key={m.id} value={m.id}>{m.studGrade}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">
          {t('tools.bolts.gasketLabel', { defaultValue: 'Tipo de junta' })}
        </label>
        <Select value={gasketId} onValueChange={setGasketId}>
          <SelectTrigger className="h-9 bg-[#0E1117] border-[#232A36]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GASKET_TYPES.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {t(g.labelKey, { defaultValue: g.labelDefault })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">
          {t('tools.bolts.nutFactorLabel', { defaultValue: 'Factor de tuerca K' })}
        </label>
        <Select value={nutFactorId} onValueChange={setNutFactorId}>
          <SelectTrigger className="h-9 bg-[#0E1117] border-[#232A36]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {NUT_FACTORS.map((n) => (
              <SelectItem key={n.id} value={n.id}>
                K = {n.value.toFixed(2)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1 sm:col-span-2 lg:col-span-3">
        <label className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">
          {t('tools.bolts.boltStressLabel', { defaultValue: 'Tensión de montaje objetivo Sb (ksi)' })}
        </label>
        <input
          type="number"
          min="1"
          step="1"
          value={boltStress}
          placeholder={t('tools.bolts.boltStressPlaceholder', {
            defaultValue: 'Introducir Sb calculada / especificación del proyecto',
          })}
          onChange={(e) => setBoltStress(e.target.value)}
          className="h-9 w-full rounded-md border border-[#232A36] bg-[#0E1117] px-3 text-xs text-[#F5F7FA] font-mono focus:outline-none focus:ring-1 focus:ring-[#FF8C00]"
        />
        <p className="text-[10px] text-[#A3A9B3] leading-relaxed">
          {t('tools.bolts.boltStressHelp', {
            defaultValue:
              'Sb debe calcularse según ASME PCC-1 Ap. O a partir de la junta, la brida y el perno concretos. Dejar vacío para no generar par objetivo.',
          })}
        </p>
      </div>
    </div>
  );

  const svgContent = (
    <div className="relative w-full">
      <div className="rounded border border-zinc-800 bg-[#0E1117] p-2">
        <StudBoltSVG spec={spec} />
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setExpanded(true)}
        className="absolute top-3 right-3 h-8 w-8 p-0 border-[#232A36] !bg-[#151A22] hover:!bg-[#232A36]"
        aria-label={t('tools.bolts.expandDrawing', { defaultValue: 'Expandir dibujo' })}
      >
        <Maximize2 className="h-3.5 w-3.5 text-[#F5F7FA]" />
      </Button>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-5xl w-[95vw] border-[#232A36] bg-[#0E1117] p-4">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-sm text-[#F5F7FA]">
              {t('tools.bolts.drawingTitle', { defaultValue: 'Dibujo técnico — Stud Bolt' })}
            </DialogTitle>
          </DialogHeader>
          <div className="rounded border border-zinc-800 bg-[#0E1117] p-2">
            <StudBoltSVG spec={spec} expanded />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );

  const resultsContent = (
    <div className="space-y-5">
      {!spec.available && (
        <div className="rounded-lg border border-[#f59e0b]/40 bg-[#f59e0b]/10 p-3">
          <p className="text-xs text-[#f59e0b]">
            <strong>{t('tools.bolts.notAvailable', { defaultValue: 'No disponible' })}:</strong>{' '}
            {spec.reason}
          </p>
        </div>
      )}

      {spec.available && spec.verificationStatus && (
        <div className="rounded-lg border border-[#3EA6FF]/40 bg-[#3EA6FF]/10 p-2">
          <p className="text-[10px] text-[#3EA6FF]">
            {t('tools.bolts.verificationStatus', { defaultValue: 'Estado de verificación' })}: {spec.verificationStatus}
          </p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#232A36]">
              <th className="py-2 px-3 text-left text-[#A3A9B3]">
                {t('tools.bolts.description', { defaultValue: 'Descripción' })}
              </th>
              <th className="py-2 px-3 text-left text-[#A3A9B3]">
                {t('tools.bolts.symbol', { defaultValue: 'Símbolo' })}
              </th>
              <th className="py-2 px-3 text-right text-[#A3A9B3]">
                {t('tools.bolts.value', { defaultValue: 'Valor' })}
              </th>
              <th className="py-2 px-3 text-right text-[#A3A9B3]">
                {t('tools.bolts.unit', { defaultValue: 'Unidad' })}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-[#232A36]/50 hover:bg-[#232A36]/20">
              <td className="py-2 px-3 text-[#F5F7FA]">
                {t('tools.bolts.quantity', { defaultValue: 'Cantidad de studs' })}
              </td>
              <td className="py-2 px-3 text-[#3EA6FF] font-mono">n</td>
              <td className="py-2 px-3 text-right font-mono text-[#F5F7FA] font-bold">
                {spec.stud?.quantity ?? '—'}
              </td>
              <td className="py-2 px-3 text-right text-[#A3A9B3]">pcs</td>
            </tr>
            <tr className="border-b border-[#232A36]/50 hover:bg-[#232A36]/20">
              <td className="py-2 px-3 text-[#F5F7FA]">
                {t('tools.bolts.diameter', { defaultValue: 'Diámetro nominal' })}
              </td>
              <td className="py-2 px-3 text-[#3EA6FF] font-mono">d</td>
              <td className="py-2 px-3 text-right font-mono text-[#FF8C00] font-bold">
                {spec.stud ? formatDiameterDisplay(spec.stud.diameterIn) : '—'}
              </td>
              <td className="py-2 px-3 text-right text-[#A3A9B3]">—</td>
            </tr>
            <tr className="border-b border-[#232A36]/50 hover:bg-[#232A36]/20">
              <td className="py-2 px-3 text-[#F5F7FA]">
                {t('tools.bolts.threadDesignation', { defaultValue: 'Designación de rosca' })}
              </td>
              <td className="py-2 px-3 text-[#3EA6FF] font-mono">—</td>
              <td className="py-2 px-3 text-right font-mono text-[#F5F7FA]">
                {spec.stud?.threadDesignation ?? '—'}
              </td>
              <td className="py-2 px-3 text-right text-[#A3A9B3]">—</td>
            </tr>
            <tr className="border-b border-[#232A36]/50 hover:bg-[#232A36]/20">
              <td className="py-2 px-3 text-[#F5F7FA]">
                {t('tools.bolts.tpi', { defaultValue: 'TPI' })}
              </td>
              <td className="py-2 px-3 text-[#3EA6FF] font-mono">—</td>
              <td className="py-2 px-3 text-right font-mono text-[#F5F7FA]">
                {spec.stud?.tpi ?? '—'}
              </td>
              <td className="py-2 px-3 text-right text-[#A3A9B3]">—</td>
            </tr>
            <tr className="border-b border-[#232A36]/50 hover:bg-[#232A36]/20">
              <td className="py-2 px-3 text-[#F5F7FA]">
                {t('tools.bolts.pitch', { defaultValue: 'Pitch' })}
              </td>
              <td className="py-2 px-3 text-[#3EA6FF] font-mono">P</td>
              <td className="py-2 px-3 text-right font-mono text-[#F5F7FA]">
                {spec.stud ? formatMm(spec.stud.pitchMm) : '—'}
              </td>
              <td className="py-2 px-3 text-right text-[#A3A9B3]">mm</td>
            </tr>
            <tr className="border-b border-[#232A36]/50 hover:bg-[#232A36]/20">
              <td className="py-2 px-3 text-[#F5F7FA]">
                {t('tools.bolts.length', { defaultValue: 'Longitud del stud' })}
              </td>
              <td className="py-2 px-3 text-[#3EA6FF] font-mono">L</td>
              <td className="py-2 px-3 text-right font-mono text-[#FF8C00] font-bold">
                {spec.stud ? formatLengthDisplay(spec.stud.lengthMm) : '—'}
              </td>
              <td className="py-2 px-3 text-right text-[#A3A9B3]">—</td>
            </tr>
            <tr className="border-b border-[#232A36]/50 hover:bg-[#232A36]/20">
              <td className="py-2 px-3 text-[#F5F7FA]">
                {t('tools.bolts.facing', { defaultValue: 'Facing' })}
              </td>
              <td className="py-2 px-3 text-[#3EA6FF] font-mono">—</td>
              <td className="py-2 px-3 text-right font-mono text-[#F5F7FA]">
                {spec.facing}
              </td>
              <td className="py-2 px-3 text-right text-[#A3A9B3]">—</td>
            </tr>
            <tr className="border-b border-[#232A36]/50 hover:bg-[#232A36]/20">
              <td className="py-2 px-3 text-[#F5F7FA]">
                {t('tools.bolts.nutType', { defaultValue: 'Tipo de tuerca' })}
              </td>
              <td className="py-2 px-3 text-[#3EA6FF] font-mono">—</td>
              <td className="py-2 px-3 text-right font-mono text-[#F5F7FA]">
                {spec.nut?.type ?? '—'}
              </td>
              <td className="py-2 px-3 text-right text-[#A3A9B3]">—</td>
            </tr>
            <tr className="border-b border-[#232A36]/50 hover:bg-[#232A36]/20">
              <td className="py-2 px-3 text-[#F5F7FA]">
                {t('tools.bolts.nutAf', { defaultValue: 'Ancho de tuerca (AF)' })}
              </td>
              <td className="py-2 px-3 text-[#3EA6FF] font-mono">AF</td>
              <td className="py-2 px-3 text-right font-mono text-[#F5F7FA]">
                {spec.nut ? formatMm(spec.nut.afMm) : '—'}
              </td>
              <td className="py-2 px-3 text-right text-[#A3A9B3]">mm</td>
            </tr>
            <tr className="border-b border-[#232A36]/50 hover:bg-[#232A36]/20">
              <td className="py-2 px-3 text-[#F5F7FA]">
                {t('tools.bolts.nutHeight', { defaultValue: 'Altura de tuerca' })}
              </td>
              <td className="py-2 px-3 text-[#3EA6FF] font-mono">H</td>
              <td className="py-2 px-3 text-right font-mono text-[#F5F7FA]">
                {spec.nut ? formatMm(spec.nut.heightMm) : '—'}
              </td>
              <td className="py-2 px-3 text-right text-[#A3A9B3]">mm</td>
            </tr>
            <tr className="hover:bg-[#232A36]/20">
              <td className="py-2 px-3 text-[#F5F7FA]">
                {t('tools.bolts.minProtrusion', { defaultValue: 'Protrusión mínima' })}
              </td>
              <td className="py-2 px-3 text-[#3EA6FF] font-mono">3P</td>
              <td className="py-2 px-3 text-right font-mono text-[#FF8C00] font-bold">
                {spec.stud ? formatMm(spec.stud.minProtrusionMm) : '—'}
              </td>
              <td className="py-2 px-3 text-right text-[#A3A9B3]">
                {t('tools.bolts.perSide', { defaultValue: '/ lado' })}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Materials summary */}
      <div className="rounded-lg border border-[#232A36] bg-[#0E1117] p-3">
        <p className="text-[10px] uppercase tracking-wider text-[#3EA6FF] font-semibold mb-2">
          {t('tools.bolts.materialsTitle', { defaultValue: 'Materiales' })}
        </p>
        <div className="grid gap-2 sm:grid-cols-2 text-xs">
          <div className="flex justify-between border-b border-[#232A36]/50 py-1">
            <span className="text-[#A3A9B3]">{t('tools.bolts.studGrade', { defaultValue: 'Espárrago' })}</span>
            <span className="font-mono text-[#F5F7FA]">{material.studGrade}</span>
          </div>
          <div className="flex justify-between border-b border-[#232A36]/50 py-1">
            <span className="text-[#A3A9B3]">{t('tools.bolts.nutGrade', { defaultValue: 'Tuerca' })}</span>
            <span className="font-mono text-[#F5F7FA]">{material.nutGrade}</span>
          </div>
          <div className="flex justify-between border-b border-[#232A36]/50 py-1">
            <span className="text-[#A3A9B3]">{t('tools.bolts.tempRange', { defaultValue: 'Rango orientativo' })}</span>
            <span className="font-mono text-[#3EA6FF]">{material.tempRange}</span>
          </div>
          <div className="flex justify-between border-b border-[#232A36]/50 py-1">
            <span className="text-[#A3A9B3]">{t('tools.bolts.standardRef', { defaultValue: 'Norma' })}</span>
            <span className="font-mono text-[#F5F7FA]">{material.studStandard} / {material.nutStandard}</span>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-[#A3A9B3] leading-relaxed">
          {t(material.usageKey, { defaultValue: material.usageDefault })}
        </p>
        <p className="mt-1 text-[10px] text-[#A3A9B3]">
          {t('tools.bolts.tempRangeNote', {
            defaultValue:
              'Los rangos de temperatura son ORIENTATIVOS. Gobernantes: tensiones admisibles del código aplicable y especificación de materiales del proyecto.',
          })}
        </p>
      </div>

      {/* Torque */}
      <div>
        <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-[#FF8C00]">
          {t('tools.bolts.torqueTitle', { defaultValue: 'Par de apriete objetivo' })}
        </p>

        <div className="rounded-lg border border-[#232A36] bg-[#0E1117] p-3 space-y-2">
          <p className="text-[11px] text-[#A3A9B3] font-mono">
            T<sub>b</sub> = Sb<sub>sel</sub> × T<sub>i</sub>(K, d) — ASME PCC-1 Ap. O, ec. (O-3)
          </p>
          <div className="grid gap-2 sm:grid-cols-3 text-xs">
            <div className="flex justify-between border-b border-[#232A36]/50 py-1">
              <span className="text-[#A3A9B3]">{t('tools.bolts.assumedK', { defaultValue: 'Factor K' })}</span>
              <span className="text-[#FF8C00] font-mono font-bold">{nutFactor.value.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-b border-[#232A36]/50 py-1">
              <span className="text-[#A3A9B3]">{t('tools.bolts.assumedStress', { defaultValue: 'Sb' })}</span>
              <span className="text-[#FF8C00] font-mono font-bold">{boltStress || '—'} ksi</span>
            </div>
            <div className="flex justify-between border-b border-[#232A36]/50 py-1">
              <span className="text-[#A3A9B3]">{t('tools.bolts.torqueIndex', { defaultValue: 'Índice Ti' })}</span>
              <span className="text-[#3EA6FF] font-mono">{torque ? torque.ti : '—'}</span>
            </div>
          </div>

          {torque ? (
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 pt-1">
              <span className="text-[#F5F7FA] text-sm">
                <span className="text-[#A3A9B3] text-xs">{t('tools.bolts.targetTorque', { defaultValue: 'Par objetivo' })}: </span>
                <span className="font-mono font-bold text-[#FF8C00] text-base">{torque.nm.toFixed(0)}</span> N·m
              </span>
              <span className="font-mono text-[#A3A9B3] text-xs">({torque.ftlb.toFixed(0)} ft-lb)</span>
            </div>
          ) : (
            <p className="text-xs text-[#f59e0b] pt-1">
              {!boltStress
                ? t('tools.bolts.torqueNeedsSb', {
                    defaultValue: 'Introduce Sb para calcular el par objetivo.',
                  })
                : material.id === 'b8m2'
                ? t('tools.bolts.torqueNoStainless', {
                    defaultValue:
                      'La tabla O-3.2-1 de ASME PCC-1 está publicada para pernería de acero de baja aleación. Para A193 B8M obtener el valor del fabricante del lubricante o mediante ensayo.',
                  })
                : !hasTorqueIndex
                ? t('tools.bolts.torqueNoIndex', {
                    defaultValue: 'No hay índice de par tabulado para este diámetro.',
                  })
                : t('tools.bolts.torqueInvalidSb', {
                    defaultValue: 'Sb no válida. Debe ser un número mayor que 0.',
                  })}
            </p>
          )}
        </div>

        <div className="mt-3 rounded-lg border border-[#232A36] bg-[#0E1117] p-3">
          <p className="text-[10px] uppercase tracking-wider text-[#3EA6FF] font-semibold mb-2">
            {t('tools.bolts.gasketDependence', { defaultValue: 'Dependencia de la junta' })}
          </p>
          <div className="space-y-1.5 text-xs">
            {GASKET_TYPES.map((g) => (
              <div key={g.id} className="flex justify-between gap-3">
                <span className={g.id === gasket.id ? 'text-[#FF8C00]' : 'text-[#A3A9B3]'}
                >
                  {t(g.labelKey, { defaultValue: g.labelDefault })}
                </span>
                <span className="font-mono text-[#F5F7FA] whitespace-nowrap">
                  {g.sgT !== null
                    ? `SgT ${g.sgT} ksi`
                    : t('tools.bolts.perManufacturer', { defaultValue: 'según fabricante' })}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-[#A3A9B3] leading-relaxed">
            {t(gasket.noteKey, { defaultValue: gasket.noteDefault })}
          </p>
        </div>

        <div className="mt-3 rounded-lg border border-[#f59e0b]/40 bg-[#f59e0b]/10 p-3">
          <p className="text-xs text-[#f59e0b] leading-relaxed">
            <strong>{t('tools.bolts.torqueWarningTitle', { defaultValue: 'Aviso' })}:</strong>{' '}
            {t('tools.bolts.torqueWarning', {
              defaultValue:
                'Los valores son orientativos. Verificar contra especificación del proyecto, fabricante de la junta y lubricación real. K depende del lubricante/recubrimiento/acabado: variar K entre 0.10 y 0.30 cambia la carga obtenida en un 200 %. No aplicar sin confirmar.',
            })}
          </p>
        </div>
      </div>

      {/* Tightening sequence */}
      <div>
        <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-[#FF8C00]">
          {t('tools.bolts.sequenceTitle', { defaultValue: 'Secuencia de apriete' })}
        </p>

        {spec.stud && CROSS_PATTERN[spec.stud.quantity] ? (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-[#232A36] bg-[#0E1117] p-3 flex items-center justify-center">
              <StarPattern qty={spec.stud.quantity} nps={spec.nps} flangeClass={flangeClass} />
            </div>

            <div className="rounded-lg border border-[#232A36] bg-[#0E1117] p-3">
              <p className="text-[10px] uppercase tracking-wider text-[#3EA6FF] font-semibold mb-2">
                {t('tools.bolts.passes', { defaultValue: 'Pasadas de par (PCC-1 Tabla 1)' })}
              </p>
              <div className="space-y-1.5">
                {TORQUE_ROUNDS.map((r) => (
                  <div key={r.id} className="border-b border-[#232A36]/50 pb-1.5 last:border-0">
                    <div className="flex justify-between gap-2">
                      <span className="text-xs text-[#F5F7FA] font-medium">
                        {t(r.labelKey, { defaultValue: r.labelDefault })}
                      </span>
                      {r.pct && <span className="text-xs font-mono text-[#FF8C00] whitespace-nowrap">{r.pct}</span>}
                    </div>
                    <p className="text-[10px] text-[#A3A9B3] leading-relaxed">
                      {t(r.descKey, { defaultValue: r.descDefault })}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-[#f59e0b]">
            {t('tools.bolts.patternNotAvailable', {
              defaultValue: 'Patrón de apriete no tabulado para esta cantidad de studs. Consultar procedimiento del proyecto.',
            })}
          </p>
        )}

        {spec.stud && CROSS_PATTERN[spec.stud.quantity] && (
          <div className="mt-3 rounded-lg border border-[#232A36] bg-[#0E1117] p-3">
            <p className="text-[10px] uppercase tracking-wider text-[#3EA6FF] font-semibold mb-2">
              {t('tools.bolts.crossPatternOrder', { defaultValue: 'Orden de apriete cruzado' })} — {spec.stud.quantity} {t('tools.bolts.boltsShort', { defaultValue: 'studs' })}
            </p>
            <div className="space-y-1">
              {CROSS_PATTERN[spec.stud.quantity].map((pass, i) => (
                <div key={i} className="flex items-baseline gap-2 text-xs">
                  <span className="text-[#A3A9B3] whitespace-nowrap">
                    {t('tools.bolts.pass', { defaultValue: 'Pasada' })} {i + 1}:
                  </span>
                  <span className="font-mono text-[#F5F7FA]">{pass.join(' — ')}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-[#A3A9B3]">
              {t('tools.bolts.numberingNote', {
                defaultValue: 'Los studs se numeran 1..N en sentido horario alrededor de la brida.',
              })}
            </p>
          </div>
        )}
      </div>
    </div>
  );

  const notesContent = (
    <div className="space-y-3 text-xs text-[#A3A9B3]">
      <p>
        <strong className="text-[#F5F7FA]">{t('tools.bolts.dimensionalStandard', { defaultValue: 'Dimensional' })}:</strong>{' '}
        ASME B16.5-2025 (tabla de pernería / Table E-1)
      </p>
      <p>
        <strong className="text-[#F5F7FA]">{t('tools.bolts.threadStandard', { defaultValue: 'Rosca' })}:</strong>{' '}
        ASME B1.1-2024 Table 6. {t('tools.bolts.threadNote', {
          defaultValue: 'UNC para diámetros ≤ 1"; 8UN para diámetros > 1". Clase 2A en el espárrago; 2B en la tuerca.',
        })}
      </p>
      <p>
        <strong className="text-[#F5F7FA]">{t('tools.bolts.nutStandard', { defaultValue: 'Tuercas' })}:</strong>{' '}
        ASME B18.2.2-2022 Heavy Hex Nut
      </p>
      <p>
        <strong className="text-[#F5F7FA]">{t('tools.bolts.materialStandard', { defaultValue: 'Materiales' })}:</strong>{' '}
        {material.studStandard} ({t('tools.bolts.studs', { defaultValue: 'espárragos' })}), {material.nutStandard} ({t('tools.bolts.nuts', { defaultValue: 'tuercas' })})
      </p>
      <p>
        <strong className="text-[#F5F7FA]">{t('tools.bolts.torqueStandard', { defaultValue: 'Par y montaje' })}:</strong>{' '}
        ASME PCC-1 — Guidelines for Pressure Boundary Bolted Flange Joint Assembly (Tabla 1, Tabla 3, Apéndice O)
      </p>
      <p>
        <strong className="text-[#F5F7FA]">{t('tools.bolts.lengthDefinitionNote', { defaultValue: 'Definición de L' })}:</strong>{' '}
        {spec.source.lengthDefinition}
      </p>
      <p>
        <strong className="text-[#F5F7FA]">{t('tools.bolts.datasetRevision', { defaultValue: 'Revisión del dataset' })}:</strong>{' '}
        PB-TOOLS-STUDBOLT-REVISION-001 — confidence 0.55 (cross-reference verified, pending official ASME B16.5-2025 PDF validation).
      </p>
    </div>
  );

  return (
    <ToolBase
      title={t('tools.bolts.name', { defaultValue: 'Stud Bolts y Tuercas' })}
      standard="ASME B16.5 / B1.1 / B18.2.2 — ASTM A193/A194 — ASME PCC-1"
      icon={<Wrench className="h-5 w-5" />}
      inputs={inputsContent}
      svg={svgContent}
      results={resultsContent}
      notes={notesContent}
    />
  );
}
