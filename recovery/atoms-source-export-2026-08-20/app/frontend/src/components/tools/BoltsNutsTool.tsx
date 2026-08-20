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
interface BoltSpec {
  nps: string;
  class150: { qty: number; dia: string; length: number };
  class300: { qty: number; dia: string; length: number };
  class600: { qty: number; dia: string; length: number };
  class900: { qty: number; dia: string; length: number };
}

const BOLT_DATA: BoltSpec[] = [
  { nps: '1/2"', class150: { qty: 4, dia: '1/2"', length: 57 }, class300: { qty: 4, dia: '1/2"', length: 70 }, class600: { qty: 4, dia: '1/2"', length: 70 }, class900: { qty: 4, dia: '3/4"', length: 89 } },
  { nps: '3/4"', class150: { qty: 4, dia: '1/2"', length: 63 }, class300: { qty: 4, dia: '5/8"', length: 76 }, class600: { qty: 4, dia: '5/8"', length: 76 }, class900: { qty: 4, dia: '3/4"', length: 95 } },
  { nps: '1"', class150: { qty: 4, dia: '1/2"', length: 63 }, class300: { qty: 4, dia: '5/8"', length: 82 }, class600: { qty: 4, dia: '5/8"', length: 82 }, class900: { qty: 4, dia: '7/8"', length: 102 } },
  { nps: '1-1/4"', class150: { qty: 4, dia: '1/2"', length: 70 }, class300: { qty: 4, dia: '5/8"', length: 82 }, class600: { qty: 4, dia: '5/8"', length: 89 }, class900: { qty: 4, dia: '7/8"', length: 108 } },
  { nps: '1-1/2"', class150: { qty: 4, dia: '1/2"', length: 70 }, class300: { qty: 4, dia: '3/4"', length: 89 }, class600: { qty: 4, dia: '3/4"', length: 89 }, class900: { qty: 4, dia: '1"', length: 114 } },
  { nps: '2"', class150: { qty: 4, dia: '5/8"', length: 76 }, class300: { qty: 8, dia: '5/8"', length: 89 }, class600: { qty: 8, dia: '5/8"', length: 95 }, class900: { qty: 8, dia: '7/8"', length: 127 } },
  { nps: '2-1/2"', class150: { qty: 4, dia: '5/8"', length: 82 }, class300: { qty: 8, dia: '3/4"', length: 95 }, class600: { qty: 8, dia: '3/4"', length: 102 }, class900: { qty: 8, dia: '1"', length: 140 } },
  { nps: '3"', class150: { qty: 4, dia: '5/8"', length: 82 }, class300: { qty: 8, dia: '3/4"', length: 102 }, class600: { qty: 8, dia: '3/4"', length: 108 }, class900: { qty: 8, dia: '7/8"', length: 133 } },
  { nps: '4"', class150: { qty: 8, dia: '5/8"', length: 82 }, class300: { qty: 8, dia: '3/4"', length: 108 }, class600: { qty: 8, dia: '7/8"', length: 127 }, class900: { qty: 8, dia: '1-1/8"', length: 152 } },
  { nps: '6"', class150: { qty: 8, dia: '3/4"', length: 89 }, class300: { qty: 12, dia: '3/4"', length: 114 }, class600: { qty: 12, dia: '1"', length: 152 }, class900: { qty: 12, dia: '1-1/8"', length: 178 } },
  { nps: '8"', class150: { qty: 8, dia: '3/4"', length: 95 }, class300: { qty: 12, dia: '7/8"', length: 127 }, class600: { qty: 12, dia: '1-1/8"', length: 178 }, class900: { qty: 12, dia: '1-3/8"', length: 203 } },
  { nps: '10"', class150: { qty: 12, dia: '7/8"', length: 102 }, class300: { qty: 16, dia: '1"', length: 140 }, class600: { qty: 16, dia: '1-1/4"', length: 203 }, class900: { qty: 16, dia: '1-3/8"', length: 222 } },
  { nps: '12"', class150: { qty: 12, dia: '7/8"', length: 108 }, class300: { qty: 16, dia: '1-1/8"', length: 152 }, class600: { qty: 20, dia: '1-1/4"', length: 216 }, class900: { qty: 20, dia: '1-3/8"', length: 254 } },
  { nps: '14"', class150: { qty: 12, dia: '1"', length: 114 }, class300: { qty: 20, dia: '1-1/8"', length: 159 }, class600: { qty: 20, dia: '1-3/8"', length: 229 }, class900: { qty: 20, dia: '1-1/2"', length: 267 } },
  { nps: '16"', class150: { qty: 16, dia: '1"', length: 120 }, class300: { qty: 20, dia: '1-1/4"', length: 171 }, class600: { qty: 20, dia: '1-1/2"', length: 248 }, class900: { qty: 20, dia: '1-5/8"', length: 286 } },
  { nps: '18"', class150: { qty: 16, dia: '1-1/8"', length: 127 }, class300: { qty: 24, dia: '1-1/4"', length: 178 }, class600: { qty: 20, dia: '1-5/8"', length: 267 }, class900: { qty: 20, dia: '1-7/8"', length: 318 } },
  { nps: '20"', class150: { qty: 20, dia: '1-1/8"', length: 133 }, class300: { qty: 24, dia: '1-1/4"', length: 184 }, class600: { qty: 24, dia: '1-5/8"', length: 286 }, class900: { qty: 20, dia: '2"', length: 343 } },
  { nps: '24"', class150: { qty: 20, dia: '1-1/4"', length: 140 }, class300: { qty: 24, dia: '1-1/2"', length: 203 }, class600: { qty: 24, dia: '1-7/8"', length: 330 }, class900: { qty: 20, dia: '2-1/2"', length: 432 } },
];

const CLASSES = ['150', '300', '600', '900'] as const;

// Parse bolt diameter to mm
const boltDiaToMm = (dia: string): number => {
  const map: Record<string, number> = {
    '1/2"': 12.7, '5/8"': 15.9, '3/4"': 19.1, '7/8"': 22.2,
    '1"': 25.4, '1-1/8"': 28.6, '1-1/4"': 31.8, '1-3/8"': 34.9,
    '1-1/2"': 38.1, '1-5/8"': 41.3, '1-3/4"': 44.5, '1-7/8"': 47.6,
    '2"': 50.8, '2-1/4"': 57.2, '2-1/2"': 63.5, '2-3/4"': 69.9, '3"': 76.2,
  };
  return map[dia] || 25.4;
};

export default function BoltsNutsTool() {
  const { t } = useTranslation();
  const [npsIdx, setNpsIdx] = useState(5); // default 2"
  const [flangeClass, setFlangeClass] = useState<string>('150');
  const [showInches, setShowInches] = useState(false);

  const boltRow = BOLT_DATA[npsIdx];
  const classKey = `class${flangeClass}` as keyof BoltSpec;
  const spec = boltRow[classKey] as { qty: number; dia: string; length: number };
  const diaMm = boltDiaToMm(spec.dia);
  const nutWidth = diaMm * 1.5; // Approximate nut width across flats

  const fmt = (v: number) => showInches ? (v / 25.4).toFixed(3) : v.toFixed(1);
  const unit = showInches ? 'in' : 'mm';

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

  // Results table
  const resultsContent = (
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
            <td className="py-2 px-3 text-right font-mono text-[#F5F7FA] font-bold">{spec.qty}</td>
            <td className="py-2 px-3 text-right text-[#A3A9B3]">pcs</td>
          </tr>
          <tr className="border-b border-[#232A36]/50 hover:bg-[#232A36]/20">
            <td className="py-2 px-3 text-[#F5F7FA]">{t('tools.bolts.diameter', { defaultValue: 'Diámetro del perno' })}</td>
            <td className="py-2 px-3 text-[#3EA6FF] font-mono">d</td>
            <td className="py-2 px-3 text-right font-mono text-[#FF8C00] font-bold">{spec.dia} ({fmt(diaMm)})</td>
            <td className="py-2 px-3 text-right text-[#A3A9B3]">{unit}</td>
          </tr>
          <tr className="border-b border-[#232A36]/50 hover:bg-[#232A36]/20">
            <td className="py-2 px-3 text-[#F5F7FA]">{t('tools.bolts.length', { defaultValue: 'Longitud del perno' })}</td>
            <td className="py-2 px-3 text-[#3EA6FF] font-mono">L</td>
            <td className="py-2 px-3 text-right font-mono text-[#FF8C00] font-bold">{fmt(spec.length)}</td>
            <td className="py-2 px-3 text-right text-[#A3A9B3]">{unit}</td>
          </tr>
          <tr className="border-b border-[#232A36]/50 hover:bg-[#232A36]/20">
            <td className="py-2 px-3 text-[#F5F7FA]">{t('tools.bolts.nutWidth', { defaultValue: 'Ancho de tuerca (AF)' })}</td>
            <td className="py-2 px-3 text-[#3EA6FF] font-mono">AF</td>
            <td className="py-2 px-3 text-right font-mono text-[#F5F7FA]">{fmt(nutWidth)}</td>
            <td className="py-2 px-3 text-right text-[#A3A9B3]">{unit}</td>
          </tr>
          <tr className="hover:bg-[#232A36]/20">
            <td className="py-2 px-3 text-[#F5F7FA]">{t('tools.bolts.threadPitch', { defaultValue: 'Paso de rosca (aprox)' })}</td>
            <td className="py-2 px-3 text-[#3EA6FF] font-mono">P</td>
            <td className="py-2 px-3 text-right font-mono text-[#F5F7FA]">{fmt(diaMm > 30 ? 3.5 : diaMm > 20 ? 2.5 : 2.0)}</td>
            <td className="py-2 px-3 text-right text-[#A3A9B3]">{unit}</td>
          </tr>
        </tbody>
      </table>
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
    </div>
  );

  // Notes
  const notesContent = (
    <div className="space-y-3 text-xs text-[#A3A9B3]">
      <p><strong className="text-[#F5F7FA]">Material:</strong> ASTM A193 Grade B7 (stud bolts), ASTM A194 Grade 2H (nuts)</p>
      <p><strong className="text-[#F5F7FA]">Norma:</strong> ANSI/ASME B16.5 — Pipe Flanges and Flanged Fittings</p>
      <p><strong className="text-[#F5F7FA]">Nota:</strong> Las longitudes incluyen 2 tuercas pesadas. Para espárragos (stud bolts), la longitud total = longitud efectiva + 2 × espesor de tuerca.</p>
      <p><strong className="text-[#F5F7FA]">Lubricación:</strong> Se recomienda lubricante anti-seize para evitar galling en acero inoxidable.</p>
    </div>
  );

  return (
    <ToolBase
      title={t('tools.bolts.name', { defaultValue: 'Pernos y Tuercas' })}
      standard="ANSI/ASME B16.5"
      icon={<Wrench className="h-5 w-5" />}
      inputs={inputsContent}
      svg={svgContent}
      results={resultsContent}
      notes={notesContent}
    />
  );
}