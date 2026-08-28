import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Wrench } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import ToolBase from './ToolBase';

// ═══ BOLT DATA (ASME B16.5 / ANSI B16.5) ═══
// Class 1500 and 2500 stud data: bolt qty/diameter per ASME B16.5 Table 2,
// stud lengths for raised-face (RF) flanges.
// NOTE: ASME B16.5 only defines Class 2500 up to NPS 12. Rows above NPS 12
// are intentionally `null` (not available) rather than estimated.
type BoltEntry = { qty: number; dia: string; length: number } | null;

interface BoltSpec {
  nps: string;
  class150: { qty: number; dia: string; length: number };
  class300: { qty: number; dia: string; length: number };
  class600: { qty: number; dia: string; length: number };
  class900: { qty: number; dia: string; length: number };
  class1500: BoltEntry;
  class2500: BoltEntry;
}

const BOLT_DATA: BoltSpec[] = [
  { nps: '1/2"', class150: { qty: 4, dia: '1/2"', length: 57 }, class300: { qty: 4, dia: '1/2"', length: 70 }, class600: { qty: 4, dia: '1/2"', length: 70 }, class900: { qty: 4, dia: '3/4"', length: 89 }, class1500: { qty: 4, dia: '3/4"', length: 110 }, class2500: { qty: 4, dia: '3/4"', length: 120 } },
  { nps: '3/4"', class150: { qty: 4, dia: '1/2"', length: 63 }, class300: { qty: 4, dia: '5/8"', length: 76 }, class600: { qty: 4, dia: '5/8"', length: 76 }, class900: { qty: 4, dia: '3/4"', length: 95 }, class1500: { qty: 4, dia: '3/4"', length: 115 }, class2500: { qty: 4, dia: '3/4"', length: 125 } },
  { nps: '1"', class150: { qty: 4, dia: '1/2"', length: 63 }, class300: { qty: 4, dia: '5/8"', length: 82 }, class600: { qty: 4, dia: '5/8"', length: 82 }, class900: { qty: 4, dia: '7/8"', length: 102 }, class1500: { qty: 4, dia: '7/8"', length: 125 }, class2500: { qty: 4, dia: '7/8"', length: 140 } },
  { nps: '1-1/4"', class150: { qty: 4, dia: '1/2"', length: 70 }, class300: { qty: 4, dia: '5/8"', length: 82 }, class600: { qty: 4, dia: '5/8"', length: 89 }, class900: { qty: 4, dia: '7/8"', length: 108 }, class1500: { qty: 4, dia: '7/8"', length: 125 }, class2500: { qty: 4, dia: '1"', length: 150 } },
  { nps: '1-1/2"', class150: { qty: 4, dia: '1/2"', length: 70 }, class300: { qty: 4, dia: '3/4"', length: 89 }, class600: { qty: 4, dia: '3/4"', length: 89 }, class900: { qty: 4, dia: '1"', length: 114 }, class1500: { qty: 4, dia: '1"', length: 140 }, class2500: { qty: 4, dia: '1-1/8"', length: 170 } },
  { nps: '2"', class150: { qty: 4, dia: '5/8"', length: 76 }, class300: { qty: 8, dia: '5/8"', length: 89 }, class600: { qty: 8, dia: '5/8"', length: 95 }, class900: { qty: 8, dia: '7/8"', length: 127 }, class1500: { qty: 8, dia: '7/8"', length: 145 }, class2500: { qty: 8, dia: '1"', length: 180 } },
  { nps: '2-1/2"', class150: { qty: 4, dia: '5/8"', length: 82 }, class300: { qty: 8, dia: '3/4"', length: 95 }, class600: { qty: 8, dia: '3/4"', length: 102 }, class900: { qty: 8, dia: '1"', length: 140 }, class1500: { qty: 8, dia: '1"', length: 160 }, class2500: { qty: 8, dia: '1-1/8"', length: 195 } },
  { nps: '3"', class150: { qty: 4, dia: '5/8"', length: 82 }, class300: { qty: 8, dia: '3/4"', length: 102 }, class600: { qty: 8, dia: '3/4"', length: 108 }, class900: { qty: 8, dia: '7/8"', length: 133 }, class1500: { qty: 8, dia: '1-1/8"', length: 180 }, class2500: { qty: 8, dia: '1-1/4"', length: 220 } },
  { nps: '4"', class150: { qty: 8, dia: '5/8"', length: 82 }, class300: { qty: 8, dia: '3/4"', length: 108 }, class600: { qty: 8, dia: '7/8"', length: 127 }, class900: { qty: 8, dia: '1-1/8"', length: 152 }, class1500: { qty: 8, dia: '1-1/4"', length: 195 }, class2500: { qty: 8, dia: '1-1/2"', length: 255 } },
  { nps: '6"', class150: { qty: 8, dia: '3/4"', length: 89 }, class300: { qty: 12, dia: '3/4"', length: 114 }, class600: { qty: 12, dia: '1"', length: 152 }, class900: { qty: 12, dia: '1-1/8"', length: 178 }, class1500: { qty: 12, dia: '1-3/8"', length: 260 }, class2500: { qty: 8, dia: '2"', length: 345 } },
  { nps: '8"', class150: { qty: 8, dia: '3/4"', length: 95 }, class300: { qty: 12, dia: '7/8"', length: 127 }, class600: { qty: 12, dia: '1-1/8"', length: 178 }, class900: { qty: 12, dia: '1-3/8"', length: 203 }, class1500: { qty: 12, dia: '1-5/8"', length: 290 }, class2500: { qty: 12, dia: '2"', length: 380 } },
  { nps: '10"', class150: { qty: 12, dia: '7/8"', length: 102 }, class300: { qty: 16, dia: '1"', length: 140 }, class600: { qty: 16, dia: '1-1/4"', length: 203 }, class900: { qty: 16, dia: '1-3/8"', length: 222 }, class1500: { qty: 12, dia: '1-7/8"', length: 335 }, class2500: { qty: 12, dia: '2-1/2"', length: 490 } },
  { nps: '12"', class150: { qty: 12, dia: '7/8"', length: 108 }, class300: { qty: 16, dia: '1-1/8"', length: 152 }, class600: { qty: 20, dia: '1-1/4"', length: 216 }, class900: { qty: 20, dia: '1-3/8"', length: 254 }, class1500: { qty: 16, dia: '2"', length: 375 }, class2500: { qty: 12, dia: '2-3/4"', length: 540 } },
  { nps: '14"', class150: { qty: 12, dia: '1"', length: 114 }, class300: { qty: 20, dia: '1-1/8"', length: 159 }, class600: { qty: 20, dia: '1-3/8"', length: 229 }, class900: { qty: 20, dia: '1-1/2"', length: 267 }, class1500: { qty: 16, dia: '2-1/4"', length: 405 }, class2500: null },
  { nps: '16"', class150: { qty: 16, dia: '1"', length: 120 }, class300: { qty: 20, dia: '1-1/4"', length: 171 }, class600: { qty: 20, dia: '1-1/2"', length: 248 }, class900: { qty: 20, dia: '1-5/8"', length: 286 }, class1500: { qty: 16, dia: '2-1/2"', length: 445 }, class2500: null },
  { nps: '18"', class150: { qty: 16, dia: '1-1/8"', length: 127 }, class300: { qty: 24, dia: '1-1/4"', length: 178 }, class600: { qty: 20, dia: '1-5/8"', length: 267 }, class900: { qty: 20, dia: '1-7/8"', length: 318 }, class1500: { qty: 16, dia: '2-3/4"', length: 495 }, class2500: null },
  { nps: '20"', class150: { qty: 20, dia: '1-1/8"', length: 133 }, class300: { qty: 24, dia: '1-1/4"', length: 184 }, class600: { qty: 24, dia: '1-5/8"', length: 286 }, class900: { qty: 20, dia: '2"', length: 343 }, class1500: { qty: 16, dia: '3"', length: 540 }, class2500: null },
  { nps: '24"', class150: { qty: 20, dia: '1-1/4"', length: 140 }, class300: { qty: 24, dia: '1-1/2"', length: 203 }, class600: { qty: 24, dia: '1-7/8"', length: 330 }, class900: { qty: 20, dia: '2-1/2"', length: 432 }, class1500: { qty: 16, dia: '3-1/2"', length: 615 }, class2500: null },
];

const CLASSES = ['150', '300', '600', '900', '1500', '2500'] as const;

// Parse bolt diameter to mm
const boltDiaToMm = (dia: string): number => {
  const map: Record<string, number> = {
    '1/2"': 12.7, '5/8"': 15.9, '3/4"': 19.1, '7/8"': 22.2,
    '1"': 25.4, '1-1/8"': 28.6, '1-1/4"': 31.8, '1-3/8"': 34.9,
    '1-1/2"': 38.1, '1-5/8"': 41.3, '1-3/4"': 44.5, '1-7/8"': 47.6,
    '2"': 50.8, '2-1/4"': 57.2, '2-1/2"': 63.5, '2-3/4"': 69.9, '3"': 76.2,
    '3-1/4"': 82.6, '3-1/2"': 88.9,
  };
  return map[dia] || 25.4;
};

// ═══════════════════════════════════════════════════════════════
// BOLTING MATERIALS — ASTM/ASME A193 (studs) + A194 (nuts)
// ═══════════════════════════════════════════════════════════════
// Temperature ranges reflect the usual application envelope for each grade.
// They are guidance for material selection only: the governing limits are the
// allowable stresses of the applicable code (e.g. ASME B31.3 / BPVC Sec. II-D)
// and the project piping material specification.
interface BoltMaterial {
  id: string;
  studGrade: string;
  nutGrade: string;
  tempRange: string;
  usageKey: string;
  usageDefault: string;
  standard: string;
}

const BOLT_MATERIALS: BoltMaterial[] = [
  {
    id: 'b7',
    studGrade: 'ASTM A193 B7',
    nutGrade: 'ASTM A194 2H',
    tempRange: '-29 °C … +427 °C',
    usageKey: 'tools.bolts.matUseB7',
    usageDefault:
      'Acero aleado cromo-molibdeno, templado y revenido. Es el esparrago de uso general para bridas de acero al carbono y de baja aleacion. No apto para servicio criogenico (usar A320 L7) y sin resistencia a la corrosion: requiere recubrimiento o proteccion en ambientes humedos o marinos.',
    standard: 'ASTM A193/A193M — ASTM A194/A194M',
  },
  {
    id: 'b8m2',
    studGrade: 'ASTM A193 B8M Cl. 2',
    nutGrade: 'ASTM A194 8M',
    tempRange: '-196 °C … +538 °C',
    usageKey: 'tools.bolts.matUseB8M',
    usageDefault:
      'Acero inoxidable austenitico AISI 316 (2–3 % Mo), endurecido por deformacion Clase 2. Para servicio corrosivo, con cloruros, marino y criogenico, y para acompanar bridas inoxidables. La resistencia de la Clase 2 disminuye al aumentar el diametro. Propenso al gripado de rosca: el lubricante antiseize es imprescindible.',
    standard: 'ASTM A193/A193M — ASTM A194/A194M',
  },
  {
    id: 'b16',
    studGrade: 'ASTM A193 B16',
    nutGrade: 'ASTM A194 4 / 7',
    tempRange: '-29 °C … +538 °C',
    usageKey: 'tools.bolts.matUseB16',
    usageDefault:
      'Acero aleado cromo-molibdeno-vanadio. Se elige frente al B7 en servicio de alta temperatura, donde se requiere resistencia a la fluencia lenta (creep) y a la relajacion, tipicamente en vapor e hidrocarburos calientes por encima del rango practico del B7.',
    standard: 'ASTM A193/A193M — ASTM A194/A194M',
  },
];

// ═══════════════════════════════════════════════════════════════
// TORQUE — ASME PCC-1 Nonmandatory Appendix O
// ═══════════════════════════════════════════════════════════════
// Table O-3.2-1 "Target Torque Index" Ti, in ft-lb per ksi of bolt prestress,
// for low-alloy steel bolting, based on the bolt ROOT area, at nut factors
// K = 0.15 / 0.18 / 0.20. Target torque Tb = Sb_sel x Ti  [eq. (O-3)].
// Root areas: coarse-thread (UNC) up to 1 in., 8-pitch series from 1-1/8 in.
// Values are reproduced from the standard; sizes not listed are omitted.
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

const NUT_FACTORS = [
  { id: '0.15', value: 0.15, key: 'k015' as const, labelKey: 'tools.bolts.k015', labelDefault: 'K = 0.15 — lubricante de alto rendimiento (base PTFE / moly)' },
  { id: '0.18', value: 0.18, key: 'k018' as const, labelKey: 'tools.bolts.k018', labelDefault: 'K = 0.18 — antiseize convencional bien aplicado' },
  { id: '0.20', value: 0.20, key: 'k020' as const, labelKey: 'tools.bolts.k020', labelDefault: 'K = 0.20 — roscas limpias con lubricación mínima' },
];

// Gasket types. Target seating stress SgT must come from the gasket
// manufacturer; PCC-1 Appendix O requires the user to supply it. Only the
// value used in the PCC-1 worked example (spiral wound, 30 ksi) is a figure
// published in the standard itself — the others are deliberately left blank.
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
      'SgT = 30 ksi (207 MPa) es el valor del ejemplo resuelto de ASME PCC-1 Ap. O-4.3 para una junta espirometálica según ASME B16.20. Verificar contra el dato del fabricante de la junta.',
  },
  {
    id: 'ringJoint',
    labelKey: 'tools.bolts.gasketRtj',
    labelDefault: 'Ring joint (RTJ, anillo metálico)',
    sgT: null,
    noteKey: 'tools.bolts.gasketRtjNote',
    noteDefault:
      'La junta RTJ sella por fluencia localizada del anillo metálico sobre las ranuras, con un área de contacto muy pequeña, por lo que su tensión de asiento no se deduce de la espirometálica. ASME PCC-1 no publica un SgT genérico: debe obtenerse del fabricante y de la especificación del proyecto.',
  },
  {
    id: 'sheet',
    labelKey: 'tools.bolts.gasketSheet',
    labelDefault: 'Junta plana de lámina (sheet gasket)',
    sgT: null,
    noteKey: 'tools.bolts.gasketSheetNote',
    noteDefault:
      'Las juntas planas no metálicas asientan a tensiones muy inferiores y pueden aplastarse si se aprietan al nivel de una espirometálica. El SgT y la tensión máxima admisible dependen del material concreto y deben tomarse del fabricante.',
  },
];

// ═══════════════════════════════════════════════════════════════
// TIGHTENING SEQUENCE — ASME PCC-1 Table 3 (Legacy cross-pattern)
// ═══════════════════════════════════════════════════════════════
// Bolts are numbered 1..N clockwise around the flange; each group below is
// one cross-pattern pass. Only bolt counts occurring in ASME B16.5 are listed.
const CROSS_PATTERN: Record<number, number[][]> = {
  4: [[1, 3, 2, 4]],
  8: [[1, 5, 3, 7], [2, 6, 4, 8]],
  12: [[1, 7, 4, 10], [2, 8, 5, 11], [3, 9, 6, 12]],
  16: [[1, 9, 5, 13], [3, 11, 7, 15], [2, 10, 6, 14], [4, 12, 8, 16]],
  20: [[1, 11, 6, 16], [3, 13, 8, 18], [5, 15, 10, 20], [2, 12, 7, 17], [4, 14, 9, 19]],
  24: [[1, 13, 7, 19], [4, 16, 10, 22], [2, 14, 8, 20], [5, 17, 11, 23], [3, 15, 9, 21], [6, 18, 12, 24]],
};

// ASME PCC-1 Table 1 — Torque increments for the Legacy cross-pattern.
const TORQUE_ROUNDS = [
  { id: 'install', pct: null, labelKey: 'tools.bolts.roundInstall', labelDefault: 'Instalación', descKey: 'tools.bolts.roundInstallDesc', descDefault: 'Apretar a mano y "snug up" a 15–30 N·m (10–20 ft-lb), sin superar el 20 % del par objetivo. Verificar uniformidad del hueco entre bridas.' },
  { id: 'r1', pct: '20–30 %', labelKey: 'tools.bolts.round1', labelDefault: 'Ronda 1', descKey: 'tools.bolts.round1Desc', descDefault: 'Apretar al 20–30 % del par objetivo en secuencia cruzada. Verificar uniformidad del hueco.' },
  { id: 'r2', pct: '50–70 %', labelKey: 'tools.bolts.round2', labelDefault: 'Ronda 2', descKey: 'tools.bolts.round2Desc', descDefault: 'Apretar al 50–70 % del par objetivo en secuencia cruzada. Verificar uniformidad del hueco.' },
  { id: 'r3', pct: '100 %', labelKey: 'tools.bolts.round3', labelDefault: 'Ronda 3', descKey: 'tools.bolts.round3Desc', descDefault: 'Apretar al 100 % del par objetivo en secuencia cruzada. Verificar uniformidad del hueco.' },
  { id: 'r4', pct: '100 %', labelKey: 'tools.bolts.round4', labelDefault: 'Ronda 4', descKey: 'tools.bolts.round4Desc', descDefault: 'Continuar al 100 % del par objetivo pero en patrón circular horario, hasta que ninguna tuerca gire más.' },
  { id: 'r5', pct: '100 %', labelKey: 'tools.bolts.round5', labelDefault: 'Ronda 5', descKey: 'tools.bolts.round5Desc', descDefault: 'Si el tiempo lo permite, esperar un mínimo de 4 h y repetir la ronda 4 para recuperar las pérdidas por relajación y embebido a corto plazo.' },
];

export default function BoltsNutsTool() {
  const { t } = useTranslation();
  const [npsIdx, setNpsIdx] = useState(5); // default 2"
  const [flangeClass, setFlangeClass] = useState<string>('150');
  const [showInches, setShowInches] = useState(false);

  const [materialId, setMaterialId] = useState<string>('b7');
  const [gasketId, setGasketId] = useState<string>('spiralWound');
  const [nutFactorId, setNutFactorId] = useState<string>('0.18');
  const [boltStress, setBoltStress] = useState<string>('50');

  const boltRow = BOLT_DATA[npsIdx];
  const classKey = `class${flangeClass}` as keyof BoltSpec;
  const rawSpec = boltRow[classKey] as BoltEntry;
  // ASME B16.5 does not define this NPS/class combination (e.g. Class 2500
  // above NPS 12). Fall back to a valid combination for the drawing and flag it.
  const specAvailable = rawSpec !== null;
  const spec = rawSpec ?? boltRow.class150;
  const diaMm = boltDiaToMm(spec.dia);
  const nutWidth = diaMm * 1.5; // Approximate nut width across flats

  const material = BOLT_MATERIALS.find((m) => m.id === materialId) ?? BOLT_MATERIALS[0];
  const gasket = GASKET_TYPES.find((g) => g.id === gasketId) ?? GASKET_TYPES[0];
  const nutFactor = NUT_FACTORS.find((n) => n.id === nutFactorId) ?? NUT_FACTORS[1];

  const fmt = (v: number) => showInches ? (v / 25.4).toFixed(3) : v.toFixed(1);
  const unit = showInches ? 'in' : 'mm';

  // ═══ TARGET TORQUE — ASME PCC-1 Appendix O, eq. (O-3) ═══
  // Tb [ft-lb] = Sb_sel [ksi] x Ti [ft-lb/ksi], with Ti read from Table O-3.2-1
  // for the selected nut factor K. Ti is tabulated for low-alloy steel bolting
  // on the ROOT area, so it is only applied here when such a grade is selected.
  const torque = useMemo(() => {
    const idx = TORQUE_INDEX[spec.dia];
    const sb = parseFloat(boltStress);
    if (!specAvailable || !idx || !Number.isFinite(sb) || sb <= 0) return null;
    // Table O-3.2-1 is published for low-alloy steel bolting (e.g. B7 / B16).
    // For austenitic stainless the nut factor differs materially, so no
    // torque is produced rather than reusing an inapplicable index.
    if (material.id === 'b8m2') return null;
    const ti = idx[nutFactor.key];
    const ftlb = sb * ti;
    return { ftlb, nm: ftlb * 1.35582, ti };
  }, [spec.dia, boltStress, specAvailable, material.id, nutFactor.key]);

  // SVG Drawing
  const svgContent = useMemo(() => {
    const w = 500;
    const h = 300;
    const boltLen = spec.length;
    const scale = 200 / Math.max(boltLen, 80);
    const cx = w / 2;
    const cy = h / 2;

    const sLen = boltLen * scale;
    const sDia = diaMm * scale;
    const sNut = nutWidth * scale;
    const headH = sDia * 0.7;

    // Bolt body
    const boltLeft = cx - sLen / 2;
    const boltRight = cx + sLen / 2;
    const boltTop = cy - sDia / 2;
    const boltBot = cy + sDia / 2;

    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ maxWidth: '500px' }}
        role="img" aria-label={`Bolt ${spec.dia} x ${spec.length}mm`}>
        <rect width={w} height={h} fill="#0E1117" rx="6" />

        {/* Grid */}
        <defs>
          <pattern id="boltGrid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#1a2030" strokeWidth="0.3" />
          </pattern>
        </defs>
        <rect width={w} height={h} fill="url(#boltGrid)" opacity="0.5" />

        {/* Hex head */}
        <rect x={boltLeft - headH} y={cy - sNut / 2} width={headH} height={sNut}
          fill="#232A36" stroke="#FF8C00" strokeWidth="1.5" rx="2" />
        {/* Head detail lines */}
        <line x1={boltLeft - headH + 3} y1={cy - sNut / 2 + 3} x2={boltLeft - headH + 3} y2={cy + sNut / 2 - 3}
          stroke="#3EA6FF" strokeWidth="0.5" strokeDasharray="2 1" />

        {/* Bolt shank */}
        <rect x={boltLeft} y={boltTop} width={sLen} height={sDia}
          fill="#1a2030" stroke="#A3A9B3" strokeWidth="1" />
        {/* Thread lines */}
        {Array.from({ length: Math.floor(sLen / 4) }, (_, i) => (
          <line key={i} x1={boltLeft + i * 4} y1={boltTop} x2={boltLeft + i * 4} y2={boltBot}
            stroke="#3EA6FF" strokeWidth="0.3" opacity="0.4" />
        ))}

        {/* Nut at end */}
        <rect x={boltRight} y={cy - sNut / 2} width={headH * 0.8} height={sNut}
          fill="#232A36" stroke="#FF8C00" strokeWidth="1.5" rx="2" />

        {/* ═══ DIMENSION LINES ═══ */}
        {/* Length dimension (orange - main) */}
        <line x1={boltLeft} y1={boltBot + 25} x2={boltRight} y2={boltBot + 25}
          stroke="#FF8C00" strokeWidth="1.5" markerStart="url(#arrowL)" markerEnd="url(#arrowR)" />
        <line x1={boltLeft} y1={boltBot + 5} x2={boltLeft} y2={boltBot + 30}
          stroke="#FF8C00" strokeWidth="0.5" />
        <line x1={boltRight} y1={boltBot + 5} x2={boltRight} y2={boltBot + 30}
          stroke="#FF8C00" strokeWidth="0.5" />
        <text x={cx} y={boltBot + 40} fill="#FF8C00" fontSize="11" textAnchor="middle" fontWeight="bold">
          L = {fmt(spec.length)} {unit}
        </text>

        {/* Diameter dimension (blue - secondary) */}
        <line x1={cx} y1={boltTop - 15} x2={cx} y2={boltBot + 5}
          stroke="#3EA6FF" strokeWidth="1" strokeDasharray="3 2" />
        <text x={cx + 5} y={boltTop - 20} fill="#3EA6FF" fontSize="10" textAnchor="start">
          Ø{fmt(diaMm)} {unit}
        </text>

        {/* Arrow markers */}
        <defs>
          <marker id="arrowL" markerWidth="6" markerHeight="6" refX="0" refY="3" orient="auto">
            <path d="M6,0 L0,3 L6,6" fill="none" stroke="#FF8C00" strokeWidth="1" />
          </marker>
          <marker id="arrowR" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6" fill="none" stroke="#FF8C00" strokeWidth="1" />
          </marker>
        </defs>

        {/* Legend */}
        <rect x="10" y="10" width="140" height="50" fill="#0E111790" rx="4" stroke="#232A36" strokeWidth="1" />
        <circle cx="22" cy="25" r="4" fill="#FF8C00" />
        <text x="30" y="27" fill="#F5F7FA" fontSize="9" dominantBaseline="middle">Dimensiones principales</text>
        <circle cx="22" cy="42" r="4" fill="#3EA6FF" />
        <text x="30" y="44" fill="#F5F7FA" fontSize="9" dominantBaseline="middle">Dimensiones secundarias</text>

        {/* Title */}
        <text x={w - 10} y={h - 10} fill="#A3A9B3" fontSize="9" textAnchor="end">
          {boltRow.nps} — Class {flangeClass}
        </text>
      </svg>
    );
  }, [spec, diaMm, nutWidth, boltRow.nps, flangeClass, fmt, unit]);

  // ═══ STAR (CROSS) PATTERN DIAGRAM ═══
  // Bolts numbered 1..N clockwise from the top, with the ASME PCC-1 Table 3
  // Legacy cross-pattern drawn as chords in the order the bolts are tightened.
  const starPattern = useMemo(() => {
    const n = spec.qty;
    const passes = CROSS_PATTERN[n];
    const size = 320;
    const c = size / 2;
    const r = size * 0.36;
    const posOf = (boltNo: number) => {
      // Bolt 1 at 12 o'clock, numbering clockwise.
      const angle = -Math.PI / 2 + (2 * Math.PI * (boltNo - 1)) / n;
      return { x: c + r * Math.cos(angle), y: c + r * Math.sin(angle) };
    };
    // Colour each pass distinctly so the order of the passes is readable.
    const passColors = ['#FF8C00', '#3EA6FF', '#22d3ee', '#f97316', '#a3e635', '#c084fc'];

    return (
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full" style={{ maxWidth: '320px' }}
        role="img" aria-label={t('tools.bolts.starPatternAria', { defaultValue: 'Diagrama de secuencia de apriete en estrella' })}>
        <rect width={size} height={size} fill="#0E1117" rx="6" />

        {/* Flange ring */}
        <circle cx={c} cy={c} r={r + 26} fill="none" stroke="#232A36" strokeWidth="1.5" />
        <circle cx={c} cy={c} r={r} fill="none" stroke="#232A36" strokeWidth="1" strokeDasharray="3 3" />
        <circle cx={c} cy={c} r={r - 30} fill="none" stroke="#232A36" strokeWidth="1.5" />

        {passes ? (
          <>
            {/* Cross-pattern chords, one colour per pass */}
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

        {/* Bolt positions */}
        {Array.from({ length: n }, (_, i) => {
          const no = i + 1;
          const p = posOf(no);
          return (
            <g key={no}>
              <circle cx={p.x} cy={p.y} r="11" fill="#232A36" stroke="#FF8C00" strokeWidth="1.2" />
              <text x={p.x} y={p.y} fill="#F5F7FA" fontSize="10" textAnchor="middle"
                dominantBaseline="central" fontWeight="bold">{no}</text>
            </g>
          );
        })}

        <text x={c} y={c - 6} fill="#A3A9B3" fontSize="10" textAnchor="middle">
          {boltRow.nps} — Class {flangeClass}
        </text>
        <text x={c} y={c + 10} fill="#FF8C00" fontSize="11" textAnchor="middle" fontWeight="bold">
          {n} {t('tools.bolts.boltsShort', { defaultValue: 'pernos' })}
        </text>
        <text x={size - 8} y={size - 8} fill="#A3A9B3" fontSize="8" textAnchor="end">
          {passes
            ? t('tools.bolts.starPatternSource', { defaultValue: 'ASME PCC-1 Tabla 3 (patrón Legacy)' })
            : t('tools.bolts.starPatternNoData', { defaultValue: 'Patrón no tabulado para esta cantidad' })}
        </text>
      </svg>
    );
  }, [spec.qty, boltRow.nps, flangeClass, t]);

  // Results table
  const resultsContent = (
    <div className="space-y-5">
      {!specAvailable && (
        <div className="rounded-lg border border-[#f59e0b]/40 bg-[#f59e0b]/10 p-3">
          <p className="text-xs text-[#f59e0b]">
            <strong>{t('tools.bolts.notAvailable', { defaultValue: 'No disponible' })}:</strong>{' '}
            {t('tools.bolts.classNotDefined', {
              defaultValue:
                'ASME B16.5 no define bridas Class {{cls}} en {{nps}}. La Class 2500 solo llega hasta NPS 12. No se muestran valores para esta combinación.',
              cls: flangeClass,
              nps: boltRow.nps,
            })}
          </p>
        </div>
      )}

      <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[#232A36]">
            <th className="py-2 px-3 text-left text-[#A3A9B3]">{t('tools.bolts.description', { defaultValue: 'Descripción' })}</th>
            <th className="py-2 px-3 text-left text-[#A3A9B3]">{t('tools.bolts.symbol', { defaultValue: 'Símbolo' })}</th>
            <th className="py-2 px-3 text-right text-[#A3A9B3]">{t('tools.bolts.value', { defaultValue: 'Valor' })}</th>
            <th className="py-2 px-3 text-right text-[#A3A9B3]">{t('tools.bolts.unit', { defaultValue: 'Unidad' })}</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-[#232A36]/50 hover:bg-[#232A36]/20">
            <td className="py-2 px-3 text-[#F5F7FA]">{t('tools.bolts.quantity', { defaultValue: 'Cantidad de pernos' })}</td>
            <td className="py-2 px-3 text-[#3EA6FF] font-mono">n</td>
            <td className="py-2 px-3 text-right font-mono text-[#F5F7FA] font-bold">{specAvailable ? spec.qty : '—'}</td>
            <td className="py-2 px-3 text-right text-[#A3A9B3]">pcs</td>
          </tr>
          <tr className="border-b border-[#232A36]/50 hover:bg-[#232A36]/20">
            <td className="py-2 px-3 text-[#F5F7FA]">{t('tools.bolts.diameter', { defaultValue: 'Diámetro del perno' })}</td>
            <td className="py-2 px-3 text-[#3EA6FF] font-mono">d</td>
            <td className="py-2 px-3 text-right font-mono text-[#FF8C00] font-bold">{specAvailable ? `${spec.dia} (${fmt(diaMm)})` : '—'}</td>
            <td className="py-2 px-3 text-right text-[#A3A9B3]">{unit}</td>
          </tr>
          <tr className="border-b border-[#232A36]/50 hover:bg-[#232A36]/20">
            <td className="py-2 px-3 text-[#F5F7FA]">{t('tools.bolts.length', { defaultValue: 'Longitud del perno' })}</td>
            <td className="py-2 px-3 text-[#3EA6FF] font-mono">L</td>
            <td className="py-2 px-3 text-right font-mono text-[#FF8C00] font-bold">{specAvailable ? fmt(spec.length) : '—'}</td>
            <td className="py-2 px-3 text-right text-[#A3A9B3]">{unit}</td>
          </tr>
          <tr className="border-b border-[#232A36]/50 hover:bg-[#232A36]/20">
            <td className="py-2 px-3 text-[#F5F7FA]">{t('tools.bolts.nutWidth', { defaultValue: 'Ancho de tuerca (AF)' })}</td>
            <td className="py-2 px-3 text-[#3EA6FF] font-mono">AF</td>
            <td className="py-2 px-3 text-right font-mono text-[#F5F7FA]">{specAvailable ? fmt(nutWidth) : '—'}</td>
            <td className="py-2 px-3 text-right text-[#A3A9B3]">{unit}</td>
          </tr>
          <tr className="hover:bg-[#232A36]/20">
            <td className="py-2 px-3 text-[#F5F7FA]">{t('tools.bolts.threadPitch', { defaultValue: 'Paso de rosca (aprox)' })}</td>
            <td className="py-2 px-3 text-[#3EA6FF] font-mono">P</td>
            <td className="py-2 px-3 text-right font-mono text-[#F5F7FA]">{specAvailable ? fmt(diaMm > 30 ? 3.5 : diaMm > 20 ? 2.5 : 2.0) : '—'}</td>
            <td className="py-2 px-3 text-right text-[#A3A9B3]">{unit}</td>
          </tr>
        </tbody>
      </table>
      </div>

      {/* ═══ MATERIALS ═══ */}
      <div>
        <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-[#FF8C00]">
          {t('tools.bolts.materialsTitle', { defaultValue: 'Materiales de pernos y tuercas' })}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#232A36]">
                <th className="py-2 px-3 text-left text-[#A3A9B3]">{t('tools.bolts.studGrade', { defaultValue: 'Espárrago (A193)' })}</th>
                <th className="py-2 px-3 text-left text-[#A3A9B3]">{t('tools.bolts.nutGrade', { defaultValue: 'Tuerca (A194)' })}</th>
                <th className="py-2 px-3 text-left text-[#A3A9B3]">{t('tools.bolts.tempRange', { defaultValue: 'Rango de temperatura' })}</th>
              </tr>
            </thead>
            <tbody>
              {BOLT_MATERIALS.map((m) => (
                <tr key={m.id}
                  className={`border-b border-[#232A36]/50 hover:bg-[#232A36]/20 ${m.id === material.id ? 'bg-[#FF8C00]/5' : ''}`}>
                  <td className={`py-2 px-3 font-mono ${m.id === material.id ? 'text-[#FF8C00] font-bold' : 'text-[#F5F7FA]'}`}>{m.studGrade}</td>
                  <td className="py-2 px-3 font-mono text-[#F5F7FA]">{m.nutGrade}</td>
                  <td className="py-2 px-3 font-mono text-[#3EA6FF]">{m.tempRange}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 rounded-lg border border-[#232A36] bg-[#0E1117] p-3">
          <p className="text-xs text-[#F5F7FA] font-mono mb-1">{material.studGrade} + {material.nutGrade}</p>
          <p className="text-xs text-[#A3A9B3] leading-relaxed">{t(material.usageKey, { defaultValue: material.usageDefault })}</p>
          <p className="mt-2 text-[10px] text-[#A3A9B3]">
            <span className="text-[#3EA6FF]">{t('tools.bolts.standardRef', { defaultValue: 'Norma' })}:</span> {material.standard}
          </p>
          <p className="mt-1 text-[10px] text-[#A3A9B3]">
            {t('tools.bolts.tempRangeNote', {
              defaultValue:
                'Los rangos de temperatura son orientativos para la selección del material. Los límites que gobiernan son las tensiones admisibles del código aplicable (ASME B31.3 / BPVC Sec. II-D) y la especificación de materiales del proyecto.',
            })}
          </p>
        </div>
      </div>

      {/* ═══ TORQUE ═══ */}
      <div>
        <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-[#FF8C00]">
          {t('tools.bolts.torqueTitle', { defaultValue: 'Par de apriete objetivo' })}
        </p>

        <div className="rounded-lg border border-[#232A36] bg-[#0E1117] p-3 space-y-2">
          <p className="text-[11px] text-[#A3A9B3] font-mono">
            T<sub>b</sub> = Sb<sub>sel</sub> × T<sub>i</sub>(K, d) &nbsp;— ASME PCC-1 Ap. O, ec. (O-3)
          </p>
          <div className="grid gap-2 sm:grid-cols-3 text-xs">
            <div className="flex justify-between border-b border-[#232A36]/50 py-1">
              <span className="text-[#A3A9B3]">{t('tools.bolts.assumedK', { defaultValue: 'Factor de tuerca K' })}</span>
              <span className="text-[#FF8C00] font-mono font-bold">{nutFactor.value.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-b border-[#232A36]/50 py-1">
              <span className="text-[#A3A9B3]">{t('tools.bolts.assumedStress', { defaultValue: 'Tensión objetivo Sb' })}</span>
              <span className="text-[#FF8C00] font-mono font-bold">{boltStress} ksi</span>
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
              <span className="font-mono text-[#A3A9B3] text-xs">
                ({torque.ftlb.toFixed(0)} ft-lb)
              </span>
            </div>
          ) : (
            <p className="text-xs text-[#f59e0b] pt-1">
              {material.id === 'b8m2'
                ? t('tools.bolts.torqueNoStainless', {
                    defaultValue:
                      'La tabla O-3.2-1 de ASME PCC-1 está publicada para pernería de acero de baja aleación. Para A193 B8M el factor de tuerca difiere de forma significativa (los ensayos citados por PCC-1 indican un aumento del orden del 30 % frente al B7), por lo que no se calcula un par: obtener el valor del fabricante del lubricante o mediante ensayo.',
                  })
                : t('tools.bolts.torqueNotAvailable', {
                    defaultValue: 'No hay índice de par tabulado para esta combinación de diámetro o clase.',
                  })}
            </p>
          )}
        </div>

        {/* Gasket dependence */}
        <div className="mt-3 rounded-lg border border-[#232A36] bg-[#0E1117] p-3">
          <p className="text-[10px] uppercase tracking-wider text-[#3EA6FF] font-semibold mb-2">
            {t('tools.bolts.gasketDependence', { defaultValue: 'Dependencia del tipo de junta' })}
          </p>
          <div className="space-y-1.5 text-xs">
            {GASKET_TYPES.map((g) => (
              <div key={g.id} className="flex justify-between gap-3">
                <span className={g.id === gasket.id ? 'text-[#FF8C00]' : 'text-[#A3A9B3]'}>
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
          <p className="mt-2 text-[10px] text-[#A3A9B3] leading-relaxed">
            {t('tools.bolts.sgtToSb', {
              defaultValue:
                'La tensión de asiento de la junta se traduce a tensión en el perno con Sb = SgT · Ag / (nb · Ab) [PCC-1 ec. (O-1)], donde Ag es el área de la junta y Ab el área de raíz del perno. Por eso una espirometálica, una RTJ y una junta plana no se aprietan igual.',
            })}
          </p>
        </div>

        {/* Mandatory verification warning */}
        <div className="mt-3 rounded-lg border border-[#f59e0b]/40 bg-[#f59e0b]/10 p-3">
          <p className="text-xs text-[#f59e0b] leading-relaxed">
            <strong>{t('tools.bolts.torqueWarningTitle', { defaultValue: 'Aviso' })}:</strong>{' '}
            {t('tools.bolts.torqueWarning', {
              defaultValue:
                'Los valores de par son orientativos y deben verificarse contra la especificación del proyecto y los datos del fabricante de la junta. El par depende por completo del factor de tuerca K supuesto: PCC-1 advierte que variar K entre 0,1 y 0,3 cambia la carga obtenida en un 200 %, no en un 20 %. No aplicar estos valores sin confirmar la lubricación real, el estado de las roscas y la tensión de asiento admisible de la junta.',
            })}
          </p>
        </div>
      </div>

      {/* ═══ TIGHTENING SEQUENCE ═══ */}
      <div>
        <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-[#FF8C00]">
          {t('tools.bolts.sequenceTitle', { defaultValue: 'Secuencia de apriete' })}
        </p>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-[#232A36] bg-[#0E1117] p-3 flex items-center justify-center">
            {starPattern}
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

        {specAvailable && CROSS_PATTERN[spec.qty] && (
          <div className="mt-3 rounded-lg border border-[#232A36] bg-[#0E1117] p-3">
            <p className="text-[10px] uppercase tracking-wider text-[#3EA6FF] font-semibold mb-2">
              {t('tools.bolts.crossPatternOrder', { defaultValue: 'Orden de apriete cruzado' })} — {spec.qty} {t('tools.bolts.boltsShort', { defaultValue: 'pernos' })}
            </p>
            <div className="space-y-1">
              {CROSS_PATTERN[spec.qty].map((pass, i) => (
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
                defaultValue:
                  'Los pernos se numeran 1..N en sentido horario alrededor de la brida. Cada pasada completa el patrón cruzado antes de incrementar el par.',
              })}
            </p>
          </div>
        )}
      </div>
    </div>
  );

  // Inputs
  const inputsContent = (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">NPS</label>
        <Select value={npsIdx.toString()} onValueChange={(v) => setNpsIdx(Number(v))}>
          <SelectTrigger className="h-9 bg-[#0E1117] border-[#232A36]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BOLT_DATA.map((row, i) => (
              <SelectItem key={row.nps} value={i.toString()}>{row.nps}</SelectItem>
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
      <div className="flex items-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowInches(!showInches)}
          className="border-[#232A36] !bg-[#0E1117] hover:!bg-[#232A36] text-[#F5F7FA] text-xs h-9 w-full"
        >
          {showInches ? 'in → mm' : 'mm → in'}
        </Button>
      </div>

      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">
          {t('tools.bolts.materialLabel', { defaultValue: 'Material' })}
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
              <SelectItem key={g.id} value={g.id}>{t(g.labelKey, { defaultValue: g.labelDefault })}</SelectItem>
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
              <SelectItem key={n.id} value={n.id}>K = {n.value.toFixed(2)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1 sm:col-span-3">
        <label className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">
          {t('tools.bolts.boltStressLabel', { defaultValue: 'Tensión de montaje objetivo Sb (ksi)' })}
        </label>
        <input
          type="number"
          min="1"
          step="1"
          value={boltStress}
          onChange={(e) => setBoltStress(e.target.value)}
          className="h-9 w-full rounded-md border border-[#232A36] bg-[#0E1117] px-3 text-xs text-[#F5F7FA] font-mono focus:outline-none focus:ring-1 focus:ring-[#FF8C00]"
        />
        <p className="text-[10px] text-[#A3A9B3] leading-relaxed">
          {t('tools.bolts.boltStressHelp', {
            defaultValue:
              'Valor a definir por el usuario. ASME PCC-1 advierte que el uso histórico de una única tensión para todas las bridas (p. ej. 50 ksi / 345 MPa) puede dejar la junta sin margen o superar el límite elástico del perno. Determinar Sb según el Apéndice O a partir de la junta, la brida y el perno concretos.',
          })}
        </p>
      </div>
    </div>
  );

  // Notes
  const notesContent = (
    <div className="space-y-3 text-xs text-[#A3A9B3]">
      <p><strong className="text-[#F5F7FA]">Material:</strong> {material.studGrade} ({t('tools.bolts.studs', { defaultValue: 'espárragos' })}), {material.nutGrade} ({t('tools.bolts.nuts', { defaultValue: 'tuercas' })})</p>
      <p><strong className="text-[#F5F7FA]">Norma:</strong> ANSI/ASME B16.5 — Pipe Flanges and Flanged Fittings</p>
      <p><strong className="text-[#F5F7FA]">{t('tools.bolts.torqueStandard', { defaultValue: 'Par y montaje' })}:</strong> ASME PCC-1 — Guidelines for Pressure Boundary Bolted Flange Joint Assembly (Tabla 1, Tabla 3, Apéndice O)</p>
      <p><strong className="text-[#F5F7FA]">{t('tools.bolts.materialStandard', { defaultValue: 'Materiales' })}:</strong> ASTM A193/A193M ({t('tools.bolts.studs', { defaultValue: 'espárragos' })}), ASTM A194/A194M ({t('tools.bolts.nuts', { defaultValue: 'tuercas' })})</p>
      <p><strong className="text-[#F5F7FA]">Nota:</strong> Las longitudes incluyen 2 tuercas pesadas. Para espárragos (stud bolts), la longitud total = longitud efectiva + 2 × espesor de tuerca. Las longitudes tabuladas corresponden a bridas de cara resaltada (RF).</p>
      <p><strong className="text-[#F5F7FA]">{t('tools.bolts.coverageNote', { defaultValue: 'Cobertura' })}:</strong> {t('tools.bolts.coverageNoteText', { defaultValue: 'ASME B16.5 cubre de NPS 1/2 a NPS 24. La Class 2500 solo está definida hasta NPS 12; por encima de ese tamaño no se muestran valores en lugar de estimarlos.' })}</p>
      <p><strong className="text-[#F5F7FA]">Lubricación:</strong> Se recomienda lubricante anti-seize para evitar galling en acero inoxidable. El lubricante empleado determina el factor de tuerca K y, con él, el par requerido.</p>
    </div>
  );

  return (
    <ToolBase
      title={t('tools.bolts.name', { defaultValue: 'Pernos y Tuercas' })}
      standard="ANSI/ASME B16.5 — ASME PCC-1 — ASTM A193/A194"
      icon={<Wrench className="h-5 w-5" />}
      inputs={inputsContent}
      svg={svgContent}
      results={resultsContent}
      notes={notesContent}
    />
  );
}