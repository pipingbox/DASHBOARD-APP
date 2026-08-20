import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowRightLeft, AlertTriangle, Calculator, BookOpen } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase, TABLES } from '@/lib/supabase';

// ═══ ASME B16.9 Elbow Data ═══
const NPS_OD_TABLE: { nps: string; od: number; dn: number }[] = [
  { nps: '1/2"', od: 21.3, dn: 15 },
  { nps: '3/4"', od: 26.7, dn: 20 },
  { nps: '1"', od: 33.4, dn: 25 },
  { nps: '1-1/4"', od: 42.2, dn: 32 },
  { nps: '1-1/2"', od: 48.3, dn: 40 },
  { nps: '2"', od: 60.3, dn: 50 },
  { nps: '2-1/2"', od: 73.0, dn: 65 },
  { nps: '3"', od: 88.9, dn: 80 },
  { nps: '4"', od: 114.3, dn: 100 },
  { nps: '5"', od: 141.3, dn: 125 },
  { nps: '6"', od: 168.3, dn: 150 },
  { nps: '8"', od: 219.1, dn: 200 },
  { nps: '10"', od: 273.0, dn: 250 },
  { nps: '12"', od: 323.8, dn: 300 },
  { nps: '14"', od: 355.6, dn: 350 },
  { nps: '16"', od: 406.4, dn: 400 },
  { nps: '18"', od: 457.0, dn: 450 },
  { nps: '20"', od: 508.0, dn: 500 },
  { nps: '24"', od: 609.6, dn: 600 },
];

// NPS numeric value in inches for radius calculation
const getNpsInches = (nps: string): number => {
  const map: Record<string, number> = {
    '1/2"': 0.5, '3/4"': 0.75, '1"': 1, '1-1/4"': 1.25, '1-1/2"': 1.5,
    '2"': 2, '2-1/2"': 2.5, '3"': 3, '4"': 4, '5"': 5, '6"': 6,
    '8"': 8, '10"': 10, '12"': 12, '14"': 14, '16"': 16, '18"': 18,
    '20"': 20, '24"': 24,
  };
  return map[nps] || 2;
};

const SCHEDULES = ['10', '40/STD', '80/XS', '160', 'XXS'];
const FIXED_ANGLES = [5, 10, 15, 20, 25, 30, 45, 60, 75, 90];

export default function ElbowCutTool() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [npsIdx, setNpsIdx] = useState(5); // default 2"
  const [elbowType, setElbowType] = useState<'LR' | 'SR'>('LR');
  const [schedule, setSchedule] = useState('40/STD');
  const [angle, setAngle] = useState(45);
  const [showInches, setShowInches] = useState(false);

  // View toggles
  const [showCenter, setShowCenter] = useState(true);
  const [showCutLines, setShowCutLines] = useState(true);
  const [showDimensions, setShowDimensions] = useState(true);
  const [showFill, setShowFill] = useState(true);

  const pipeData = NPS_OD_TABLE[npsIdx];
  const OD = pipeData.od;
  const npsInches = getNpsInches(pipeData.nps);
  // R in mm: LR = 1.5 * NPS (in inches) * 25.4, SR = 1.0 * NPS * 25.4
  const R = elbowType === 'LR' ? 1.5 * npsInches * 25.4 : 1.0 * npsInches * 25.4;

  // Calculations
  const angleRad = (angle * Math.PI) / 180;
  const cutDistIntrados = (R - OD / 2) * Math.tan(angleRad / 2);
  const cutDistExtrados = (R + OD / 2) * Math.tan(angleRad / 2);
  const arcNeutral = R * angleRad;
  const arcExtrados = (R + OD / 2) * angleRad;
  const arcIntrados = (R - OD / 2) * angleRad;

  const fmt = (v: number) => {
    if (showInches) return (v / 25.4).toFixed(3);
    return v.toFixed(1);
  };
  const unit = showInches ? 'in' : 'mm';

  // Compute table row
  const computeRow = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return {
      angle: deg,
      cutInt: (R - OD / 2) * Math.tan(rad / 2),
      cutExt: (R + OD / 2) * Math.tan(rad / 2),
      arcNeu: R * rad,
      arcExt: (R + OD / 2) * rad,
      arcInt: (R - OD / 2) * rad,
    };
  };

  // Debounced logging
  const lastLogRef = useRef<number>(0);
  const logUsage = useCallback(() => {
    if (!user) return;
    const now = Date.now();
    if (now - lastLogRef.current < 2000) return;
    lastLogRef.current = now;
    supabase
      .from(TABLES.toolUsage)
      .insert({
        user_id: user.id,
        tool_name: 'Elbow Cut Calculator',
        tool_category: 'Layout',
        input_data: { nps: pipeData.nps, elbowType, schedule, angle },
        output_data: { cutDistIntrados, cutDistExtrados, arcNeutral, arcExtrados, arcIntrados, radius: R },
      })
      .then(() => {});
  }, [user, pipeData.nps, elbowType, schedule, angle, cutDistIntrados, cutDistExtrados, arcNeutral, arcExtrados, arcIntrados, R]);

  useEffect(() => {
    logUsage();
  }, [logUsage]);

  // ═══════════════════════════════════════════════════════════════
  // SVG DIAGRAM — Professional fabrication manual style
  // ═══════════════════════════════════════════════════════════════
  const svgW = 600;
  const svgH = 600;

  const svgContent = useMemo(() => {
    // Center of curvature at bottom-left
    const cx = 140;
    const cy = 480;

    // Scale to fit
    const maxR = R + OD / 2;
    const scale = 300 / maxR;

    const rOuter = (R + OD / 2) * scale;
    const rInner = (R - OD / 2) * scale;
    const rCenter = R * scale;

    // Polar to cartesian: 0° = RIGHT (horizontal inlet), 90° = UP (vertical outlet)
    const p = (r: number, deg: number) => {
      const rad = (deg * Math.PI) / 180;
      return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
    };

    // Full elbow arc points
    const outerStart = p(rOuter, 0);
    const outerEnd = p(rOuter, 90);
    const innerStart = p(rInner, 0);
    const innerEnd = p(rInner, 90);

    // Cut angle points
    const cutOuter = p(rOuter, angle);
    const cutInner = p(rInner, angle);

    // Arc SVG path helper
    const arcSvg = (r: number, startDeg: number, endDeg: number) => {
      const start = p(r, startDeg);
      const end = p(r, endDeg);
      const largeArc = (endDeg - startDeg) > 180 ? 1 : 0;
      return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
    };

    // Full elbow outline
    const elbowOutline = `
      M ${outerStart.x} ${outerStart.y}
      A ${rOuter} ${rOuter} 0 0 0 ${outerEnd.x} ${outerEnd.y}
      L ${innerEnd.x} ${innerEnd.y}
      A ${rInner} ${rInner} 0 0 1 ${innerStart.x} ${innerStart.y}
      Z`;

    // Kept section (0° to cut angle)
    const keptPath = `
      M ${outerStart.x} ${outerStart.y}
      A ${rOuter} ${rOuter} 0 0 0 ${cutOuter.x} ${cutOuter.y}
      L ${cutInner.x} ${cutInner.y}
      A ${rInner} ${rInner} 0 0 1 ${innerStart.x} ${innerStart.y}
      Z`;

    // Colored arcs (0° to cut angle)
    const extArc = arcSvg(rOuter, 0, angle);
    const cenArc = arcSvg(rCenter, 0, angle);
    const intArc = arcSvg(rInner, 0, angle);

    // Numbered marker positions (mid-angle)
    const midAngle = angle / 2;
    const extMid = p(rOuter, midAngle);
    const cenMid = p(rCenter, midAngle);
    const intMid = p(rInner, midAngle);

    // Inlet center for OD dimension
    const inletCenterY = (outerStart.y + innerStart.y) / 2;

    // Cut line extension
    const cutLineEnd = p(rOuter + 30, angle);

    return (
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="w-full h-full"
        style={{ maxWidth: '600px' }}
        role="img"
        aria-label={t('tools.elbowCut.svgAriaLabel', {
          defaultValue: `Codo de 90 grados con línea de corte a ${angle} grados`,
          angle,
        })}
      >
        {/* Background */}
        <rect width={svgW} height={svgH} fill="#0f172a" rx="8" />

        {/* Grid */}
        <defs>
          <pattern id="elbowGrid" width="30" height="30" patternUnits="userSpaceOnUse">
            <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#1e293b" strokeWidth="0.3" />
          </pattern>
        </defs>
        <rect width={svgW} height={svgH} fill="url(#elbowGrid)" opacity="0.4" />

        {/* ═══ ELBOW OUTLINE ═══ */}
        <path d={elbowOutline} fill={showFill ? '#1e3a5f18' : 'none'} stroke="#cbd5e1" strokeWidth="2" />

        {/* Kept section fill */}
        {showFill && angle < 90 && (
          <path d={keptPath} fill="#38bdf812" stroke="none" />
        )}

        {/* ═══ COLORED ARCS (0° to cut angle) ═══ */}
        {/* ① Exterior — Cyan */}
        <path d={extArc} fill="none" stroke="#22d3ee" strokeWidth="3" />
        {/* ② Central — White dashed */}
        <path d={cenArc} fill="none" stroke="#ffffff" strokeWidth="2" strokeDasharray="6 3" />
        {/* ③ Interior — Orange */}
        <path d={intArc} fill="none" stroke="#f97316" strokeWidth="3" />

        {/* ═══ NUMBERED MARKERS ═══ */}
        <circle cx={extMid.x} cy={extMid.y} r="11" fill="#22d3ee" />
        <text x={extMid.x} y={extMid.y + 1} fill="#0f172a" fontSize="12" fontWeight="bold"
          textAnchor="middle" dominantBaseline="middle">①</text>

        <circle cx={cenMid.x} cy={cenMid.y} r="11" fill="#ffffff" />
        <text x={cenMid.x} y={cenMid.y + 1} fill="#0f172a" fontSize="12" fontWeight="bold"
          textAnchor="middle" dominantBaseline="middle">②</text>

        <circle cx={intMid.x} cy={intMid.y} r="11" fill="#f97316" />
        <text x={intMid.x} y={intMid.y + 1} fill="#0f172a" fontSize="12" fontWeight="bold"
          textAnchor="middle" dominantBaseline="middle">③</text>

        {/* ═══ CUT LINE ═══ */}
        {showCutLines && angle > 0 && angle < 90 && (
          <>
            <line x1={cx} y1={cy} x2={cutLineEnd.x} y2={cutLineEnd.y}
              stroke="#ef4444" strokeWidth="2" strokeDasharray="4 2" />
            <circle cx={cutOuter.x} cy={cutOuter.y} r="4" fill="#ef4444" />
            <circle cx={cutInner.x} cy={cutInner.y} r="4" fill="#ef4444" />
            {/* Angle label near cut line */}
            <text x={cutLineEnd.x + 5} y={cutLineEnd.y - 8}
              fill="#ef4444" fontSize="10" fontWeight="bold">
              {t('tools.elbowCut.cutLineLabel', { defaultValue: 'LÍNEA DE CORTE' })}
            </text>
          </>
        )}

        {/* ═══ ANGLE LABEL (top-right) ═══ */}
        <text x={svgW - 15} y="28" fill="#f97316" fontSize="15" fontWeight="bold" textAnchor="end">
          {angle.toFixed(1)}° {t('tools.elbowCut.cutAngleLabel', { defaultValue: 'ÁNGULO DE CORTE' })}
        </text>

        {/* ═══ CENTER OF RADIUS ═══ */}
        {showCenter && (
          <>
            <circle cx={cx} cy={cy} r="5" fill="none" stroke="#f59e0b" strokeWidth="2" />
            <line x1={cx - 10} y1={cy} x2={cx + 10} y2={cy} stroke="#f59e0b" strokeWidth="1.5" />
            <line x1={cx} y1={cy - 10} x2={cx} y2={cy + 10} stroke="#f59e0b" strokeWidth="1.5" />
            <text x={cx} y={cy + 20} fill="#f59e0b" fontSize="10" textAnchor="middle" fontWeight="bold">
              CENTRO
            </text>
            {/* R dimension line from center to centerline at 0° */}
            <line x1={cx} y1={cy} x2={p(rCenter, 0).x} y2={p(rCenter, 0).y}
              stroke="#f59e0b" strokeWidth="1" strokeDasharray="4 2" />
            <text x={(cx + p(rCenter, 0).x) / 2} y={cy + 16}
              fill="#f59e0b" fontSize="11" textAnchor="middle" fontWeight="bold">
              R {fmt(R)} {unit}
            </text>
          </>
        )}

        {/* ═══ DIMENSIONS ═══ */}
        {showDimensions && (
          <>
            {/* OD dimension at inlet (vertical line with arrows) */}
            <line x1={outerStart.x + 18} y1={outerStart.y}
              x2={outerStart.x + 18} y2={innerStart.y}
              stroke="#22d3ee" strokeWidth="1.5" />
            {/* Arrow tips */}
            <polygon points={`${outerStart.x + 18},${outerStart.y} ${outerStart.x + 14},${outerStart.y + 6} ${outerStart.x + 22},${outerStart.y + 6}`}
              fill="#22d3ee" />
            <polygon points={`${outerStart.x + 18},${innerStart.y} ${outerStart.x + 14},${innerStart.y - 6} ${outerStart.x + 22},${innerStart.y - 6}`}
              fill="#22d3ee" />
            <text x={outerStart.x + 28} y={inletCenterY}
              fill="#22d3ee" fontSize="11" dominantBaseline="middle" fontWeight="bold">
              OD: {fmt(OD)} {unit}
            </text>

            {/* C-C dimension at bottom */}
            <text x={svgW / 2} y={svgH - 12} fill="#94a3b8" fontSize="10" textAnchor="middle">
              C-C: {fmt(arcNeutral)} {unit}
            </text>

            {/* Arc lengths (right side stacked) */}
            <rect x={svgW - 195} y={svgH - 120} width="185" height="100" fill="#0f172a90" rx="4" stroke="#334155" strokeWidth="1" />
            <text x={svgW - 185} y={svgH - 98} fill="#22d3ee" fontSize="11" fontWeight="bold">
              ① Ext: {fmt(arcExtrados)} {unit}
            </text>
            <text x={svgW - 185} y={svgH - 75} fill="#ffffff" fontSize="11" fontWeight="bold">
              ② Cen: {fmt(arcNeutral)} {unit}
            </text>
            <text x={svgW - 185} y={svgH - 52} fill="#f97316" fontSize="11" fontWeight="bold">
              ③ Int: {fmt(arcIntrados)} {unit}
            </text>
            <text x={svgW - 185} y={svgH - 32} fill="#94a3b8" fontSize="9">
              R = {fmt(R)} | OD = {fmt(OD)} {unit}
            </text>

            {/* Angle arc */}
            <path
              d={arcSvg(rCenter * 0.25, 0, angle)}
              fill="none" stroke="#f59e0b" strokeWidth="1.5"
            />
            <text x={p(rCenter * 0.25, angle / 2).x + 14} y={p(rCenter * 0.25, angle / 2).y}
              fill="#f59e0b" fontSize="13" fontWeight="bold"
              textAnchor="middle" dominantBaseline="middle">
              {angle}°
            </text>
          </>
        )}

        {/* ═══ LEGEND ═══ */}
        <rect x="12" y="12" width="210" height="82" fill="#0f172a90" rx="4" stroke="#334155" strokeWidth="1" />
        <circle cx="26" cy="32" r="7" fill="#22d3ee" />
        <text x="38" y="33" fill="#e2e8f0" fontSize="10" dominantBaseline="middle">
          ① {t('tools.elbowCut.arcExterior', { defaultValue: 'Arco exterior (extradós)' })}
        </text>
        <circle cx="26" cy="53" r="7" fill="#ffffff" />
        <text x="38" y="54" fill="#e2e8f0" fontSize="10" dominantBaseline="middle">
          ② {t('tools.elbowCut.arcCentral', { defaultValue: 'Arco central (neutro)' })}
        </text>
        <circle cx="26" cy="74" r="7" fill="#f97316" />
        <text x="38" y="75" fill="#e2e8f0" fontSize="10" dominantBaseline="middle">
          ③ {t('tools.elbowCut.arcInterior', { defaultValue: 'Arco interior (intradós)' })}
        </text>

        {/* Pipe size label */}
        <text x={svgW - 15} y={svgH - 5} fill="#475569" fontSize="9" textAnchor="end">
          {pipeData.nps} ({elbowType}) — Sch {schedule}
        </text>
      </svg>
    );
  }, [R, OD, angle, svgW, svgH, pipeData.nps, elbowType, schedule, fmt, unit, showCenter, showCutLines, showDimensions, showFill, t, arcNeutral, arcExtrados, arcIntrados]);

  // Validation messages
  const validationMsg = useMemo(() => {
    if (angle <= 0) return { type: 'error' as const, msg: t('tools.elbowCut.errorZero', { defaultValue: 'Introduce un ángulo mayor que 0' }) };
    if (angle >= 90) return { type: 'info' as const, msg: t('tools.elbowCut.fullElbow', { defaultValue: 'Codo completo, sin corte necesario' }) };
    return null;
  }, [angle, t]);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] uppercase tracking-[0.25em] text-[#f59e0b]">
          {t('tools.elbowCut.name', { defaultValue: 'Elbow Cut Calculator' })}
        </p>
        <h3 className="mt-1 text-xl font-semibold">
          {t('tools.elbowCut.subtitle', { defaultValue: 'Calculadora de Corte de Codo' })}
        </h3>
      </div>

      <Tabs defaultValue="calculator" className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-zinc-900 border border-zinc-800">
          <TabsTrigger value="calculator" className="flex items-center gap-2 data-[state=active]:bg-zinc-800">
            <Calculator className="h-4 w-4" />
            {t('tools.elbowCut.tabCalculator', { defaultValue: 'Calculadora' })}
          </TabsTrigger>
          <TabsTrigger value="formulas" className="flex items-center gap-2 data-[state=active]:bg-zinc-800">
            <BookOpen className="h-4 w-4" />
            {t('tools.elbowCut.tabFormulas', { defaultValue: 'Fórmulas y Notas' })}
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* TAB 1: CALCULADORA */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="calculator" className="mt-2">
          {/* Mobile: stacked (inputs → SVG → results). Desktop: 2-col */}
          <div className="grid gap-3 lg:gap-6 lg:grid-cols-[1fr_1fr]">

            {/* ═══ SECTION 1: INPUTS (always first on mobile & desktop-left) ═══ */}
            <div className="space-y-2 order-1 lg:order-1">
              {/* Line 1: Pipe Size — full width */}
              <div className="space-y-0.5">
                <Label className="text-[9px] uppercase tracking-wider text-zinc-400">
                  {t('tools.pipeSize', { defaultValue: 'NPS — Tamaño de tubería' })}
                </Label>
                <Select value={npsIdx.toString()} onValueChange={(v) => setNpsIdx(Number(v))}>
                  <SelectTrigger className="h-9 text-sm w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NPS_OD_TABLE.map((e, i) => (
                      <SelectItem key={e.nps} value={i.toString()}>
                        {e.nps} (DN{e.dn}) — OD {e.od} mm
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Line 2: Elbow Type — full width */}
              <div className="space-y-0.5">
                <Label className="text-[9px] uppercase tracking-wider text-zinc-400">
                  {t('tools.elbowType', { defaultValue: 'Tipo de codo' })}
                </Label>
                <Select value={elbowType} onValueChange={(v) => setElbowType(v as 'LR' | 'SR')}>
                  <SelectTrigger className="h-9 text-sm w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LR">{t('tools.longRadius', { defaultValue: 'Long Radius — LR (1.5D)' })}</SelectItem>
                    <SelectItem value="SR">{t('tools.shortRadius', { defaultValue: 'Short Radius — SR (1D)' })}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Line 3: Schedule — full width */}
              <div className="space-y-0.5">
                <Label className="text-[9px] uppercase tracking-wider text-zinc-400">
                  {t('tools.schedule', { defaultValue: 'Schedule' })}
                </Label>
                <Select value={schedule} onValueChange={setSchedule}>
                  <SelectTrigger className="h-9 text-sm w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCHEDULES.map((sch) => (
                      <SelectItem key={sch} value={sch}>
                        Sch {sch}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Line 4: mm/in toggle + suggested standard angles */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowInches(!showInches)}
                  className="border-zinc-800 !bg-transparent hover:!bg-zinc-900 text-[10px] h-7 px-2"
                >
                  <ArrowRightLeft className="h-3 w-3 mr-1" />
                  {showInches ? 'in → mm' : 'mm → in'}
                </Button>
                {FIXED_ANGLES.map((a) => (
                  <Button
                    key={a}
                    variant="outline"
                    size="sm"
                    onClick={() => setAngle(a)}
                    className={`text-[10px] h-7 px-2 border-zinc-800 !bg-transparent hover:!bg-zinc-900 ${
                      Math.abs(a - angle) < 0.5 ? '!border-[#f59e0b] text-[#f59e0b]' : ''
                    }`}
                  >
                    {a}°
                  </Button>
                ))}
              </div>

              {/* Line 5: Angle slider bar */}
              <div className="space-y-0.5 pt-1">
                <div className="flex justify-between text-[9px] text-zinc-500">
                  <span>0°</span>
                  <span className="text-[#f59e0b] font-bold text-sm">{angle}°</span>
                  <span>90°</span>
                </div>
                <Slider
                  value={[angle]}
                  onValueChange={(v) => setAngle(v[0])}
                  min={0}
                  max={90}
                  step={0.5}
                  aria-label={t('tools.elbowCut.sliderAriaLabel', { defaultValue: 'Ángulo de corte del codo' })}
                />
              </div>

              {/* Validation message */}
              {validationMsg && (
                <div className={`flex items-center gap-2 p-2 rounded text-xs ${
                  validationMsg.type === 'error'
                    ? 'bg-red-500/10 border border-red-500/30 text-red-400'
                    : 'bg-blue-500/10 border border-blue-500/30 text-blue-400'
                }`}>
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {validationMsg.msg}
                </div>
              )}
            </div>

            {/* ═══ SECTION 2: SVG DIAGRAM (middle on mobile, right on desktop) ═══ */}
            <div className="order-2 lg:order-2 lg:sticky lg:top-4 lg:self-start">
              {/* View toggles */}
              <div className="flex flex-wrap gap-2 mb-1">
                <label className="flex items-center gap-1 text-[9px] text-zinc-400 cursor-pointer">
                  <input type="checkbox" checked={showCenter} onChange={(e) => setShowCenter(e.target.checked)}
                    className="rounded border-zinc-700 bg-zinc-900 text-amber-500 w-3 h-3" />
                  {t('tools.elbowCut.showCenter', { defaultValue: 'Centro' })}
                </label>
                <label className="flex items-center gap-1 text-[9px] text-zinc-400 cursor-pointer">
                  <input type="checkbox" checked={showCutLines} onChange={(e) => setShowCutLines(e.target.checked)}
                    className="rounded border-zinc-700 bg-zinc-900 text-amber-500 w-3 h-3" />
                  {t('tools.elbowCut.showCutLines', { defaultValue: 'Corte' })}
                </label>
                <label className="flex items-center gap-1 text-[9px] text-zinc-400 cursor-pointer">
                  <input type="checkbox" checked={showDimensions} onChange={(e) => setShowDimensions(e.target.checked)}
                    className="rounded border-zinc-700 bg-zinc-900 text-amber-500 w-3 h-3" />
                  {t('tools.elbowCut.showDimensions', { defaultValue: 'Cotas' })}
                </label>
                <label className="flex items-center gap-1 text-[9px] text-zinc-400 cursor-pointer">
                  <input type="checkbox" checked={showFill} onChange={(e) => setShowFill(e.target.checked)}
                    className="rounded border-zinc-700 bg-zinc-900 text-amber-500 w-3 h-3" />
                  {t('tools.elbowCut.showFill', { defaultValue: 'Relleno' })}
                </label>
              </div>
              {/* SVG — compact on mobile, larger on desktop */}
              <div className="w-full min-h-[280px] sm:min-h-[350px] lg:min-h-[580px]">
                {svgContent}
              </div>
            </div>

            {/* ═══ SECTION 3: RESULTS (bottom on mobile, below inputs on desktop-left) ═══ */}
            <div className="space-y-3 order-3 lg:order-3 lg:col-span-2 xl:col-span-1">
              {/* Results */}
              {angle > 0 && angle < 90 && (
                <div className="border border-zinc-800 rounded-lg p-3 space-y-2 bg-zinc-900/30">
                  <p className="text-[9px] uppercase tracking-[0.2em] text-[#f59e0b] font-semibold">
                    {t('tools.elbowCut.results', { defaultValue: 'Resultados' })} — {angle}°
                  </p>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between items-center py-1 border-b border-zinc-800/50">
                      <span className="text-zinc-300">{t('tools.elbowCut.cutDistInt', { defaultValue: 'Dist. corte intradós:' })}</span>
                      <span className="font-mono text-[#f97316] font-bold">{fmt(cutDistIntrados)} {unit}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-zinc-800/50">
                      <span className="text-zinc-300">{t('tools.elbowCut.cutDistExt', { defaultValue: 'Dist. corte extradós:' })}</span>
                      <span className="font-mono text-[#22d3ee] font-bold">{fmt(cutDistExtrados)} {unit}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-zinc-800/50">
                      <span className="text-zinc-300">{t('tools.elbowCut.arcNeutral', { defaultValue: 'Arco neutro (C-C):' })}</span>
                      <span className="font-mono text-white font-bold">{fmt(arcNeutral)} {unit}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-zinc-800/50">
                      <span className="text-zinc-300">{t('tools.elbowCut.arcExt', { defaultValue: 'Arco extradós:' })}</span>
                      <span className="font-mono text-[#22d3ee]">{fmt(arcExtrados)} {unit}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-zinc-800/50">
                      <span className="text-zinc-300">{t('tools.elbowCut.arcInt', { defaultValue: 'Arco intradós:' })}</span>
                      <span className="font-mono text-[#f97316]">{fmt(arcIntrados)} {unit}</span>
                    </div>
                    <div className="flex justify-between items-center py-1">
                      <span className="text-zinc-400">{t('tools.elbowCut.radius', { defaultValue: 'Radio (R):' })}</span>
                      <span className="font-mono text-zinc-200">{fmt(R)} {unit}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Fixed angles table */}
              <div className="border border-zinc-800 rounded-lg p-2 bg-zinc-900/30">
                <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-500 mb-1.5">
                  {t('tools.elbowCut.fixedAnglesTable', { defaultValue: 'Tabla de ángulos fijos' })}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="border-b border-zinc-800 bg-zinc-900/50">
                        <th className="py-1 px-1.5 text-left text-zinc-400">°</th>
                        <th className="py-1 px-1.5 text-right text-[#f97316]">{t('tools.elbowCut.cutInt', { defaultValue: 'Corte Int' })}</th>
                        <th className="py-1 px-1.5 text-right text-[#22d3ee]">{t('tools.elbowCut.cutExt', { defaultValue: 'Corte Ext' })}</th>
                        <th className="py-1 px-1.5 text-right text-white">{t('tools.elbowCut.arcCen', { defaultValue: 'Arco C-C' })}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {FIXED_ANGLES.map((a) => {
                        const row = computeRow(a);
                        const isActive = Math.abs(a - angle) < 0.5;
                        return (
                          <tr
                            key={a}
                            className={`border-b border-zinc-800/30 cursor-pointer ${
                              isActive ? 'bg-[#f59e0b]/10' : 'hover:bg-zinc-800/30'
                            }`}
                            onClick={() => setAngle(a)}
                          >
                            <td className="py-1 px-1.5 text-[#f59e0b] font-medium">{a}°</td>
                            <td className="py-1 px-1.5 text-right font-mono text-zinc-200">{fmt(row.cutInt)}</td>
                            <td className="py-1 px-1.5 text-right font-mono text-zinc-200">{fmt(row.cutExt)}</td>
                            <td className="py-1 px-1.5 text-right font-mono text-zinc-200">{fmt(row.arcNeu)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* TAB 2: FÓRMULAS Y NOTAS */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="formulas" className="mt-4 space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Formulas */}
            <div className="space-y-6">
              <div className="border border-zinc-800 rounded-lg p-6 space-y-4 bg-zinc-900/30">
                <h4 className="text-sm font-semibold text-[#f59e0b] uppercase tracking-wider">
                  {t('tools.elbowCut.formulasTitle', { defaultValue: 'Fórmulas de Cálculo' })}
                </h4>
                <div className="space-y-4">
                  <div className="p-3 rounded bg-zinc-800/30 border border-zinc-700/50">
                    <p className="text-zinc-300 text-xs font-semibold mb-1">{t('tools.elbowCut.formulaRadius', { defaultValue: 'Radio del codo (R)' })}</p>
                    <p className="font-mono text-sm text-zinc-200">
                      LR: R = 1.5 × NPS × 25.4 mm
                    </p>
                    <p className="font-mono text-sm text-zinc-200">
                      SR: R = 1.0 × NPS × 25.4 mm
                    </p>
                  </div>
                  <div className="p-3 rounded bg-[#ef4444]/5 border border-[#ef4444]/20">
                    <p className="text-[#ef4444] text-xs font-semibold mb-1">{t('tools.elbowCut.formulaCutDist', { defaultValue: 'Distancias de corte' })}</p>
                    <p className="font-mono text-sm text-[#f97316]">
                      D<sub>int</sub> = (R - OD/2) × tan(θ/2)
                    </p>
                    <p className="font-mono text-sm text-[#22d3ee] mt-1">
                      D<sub>ext</sub> = (R + OD/2) × tan(θ/2)
                    </p>
                    <p className="text-[10px] text-zinc-500 mt-2">
                      {t('tools.elbowCut.formulaCutNote', { defaultValue: 'Distancia medida desde el extremo del codo' })}
                    </p>
                  </div>
                  <div className="p-3 rounded bg-[#22d3ee]/5 border border-[#22d3ee]/20">
                    <p className="text-[#22d3ee] text-xs font-semibold mb-1">{t('tools.elbowCut.formulaArcs', { defaultValue: 'Longitudes de arco' })}</p>
                    <p className="font-mono text-sm text-[#22d3ee]">
                      L<sub>ext</sub> = (R + OD/2) × π × θ / 180
                    </p>
                    <p className="font-mono text-sm text-white mt-1">
                      L<sub>cen</sub> = R × π × θ / 180
                    </p>
                    <p className="font-mono text-sm text-[#f97316] mt-1">
                      L<sub>int</sub> = (R - OD/2) × π × θ / 180
                    </p>
                  </div>
                </div>
              </div>

              {/* Variables */}
              <div className="border border-zinc-800 rounded-lg p-6 space-y-3 bg-zinc-900/30">
                <h4 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
                  {t('tools.elbowCut.variables', { defaultValue: 'Variables' })}
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between border-b border-zinc-800/50 pb-1">
                    <span className="font-mono text-[#f59e0b]">R</span>
                    <span className="text-zinc-400">{t('tools.elbowCut.varR', { defaultValue: 'Radio de curvatura del codo (mm)' })}</span>
                  </div>
                  <div className="flex justify-between border-b border-zinc-800/50 pb-1">
                    <span className="font-mono text-[#f59e0b]">OD</span>
                    <span className="text-zinc-400">{t('tools.elbowCut.varOD', { defaultValue: 'Diámetro exterior del tubo (mm)' })}</span>
                  </div>
                  <div className="flex justify-between border-b border-zinc-800/50 pb-1">
                    <span className="font-mono text-[#f59e0b]">θ</span>
                    <span className="text-zinc-400">{t('tools.elbowCut.varTheta', { defaultValue: 'Ángulo de corte deseado (grados)' })}</span>
                  </div>
                  <div className="flex justify-between border-b border-zinc-800/50 pb-1">
                    <span className="font-mono text-[#f59e0b]">NPS</span>
                    <span className="text-zinc-400">{t('tools.elbowCut.varNPS', { defaultValue: 'Nominal Pipe Size (pulgadas)' })}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-6">
              <div className="border-l-2 border-[#f59e0b] bg-[#f59e0b]/5 p-6 rounded-r-lg space-y-3">
                <h4 className="text-sm font-semibold text-[#f59e0b] uppercase tracking-wider">
                  {t('tools.elbowCut.notesTitle', { defaultValue: 'Notas de Referencia' })}
                </h4>
                <ul className="space-y-2.5 text-sm text-zinc-300">
                  <li className="flex items-start gap-2">
                    <span className="text-[#f59e0b] mt-0.5">•</span>
                    <span><strong className="text-zinc-100">LR = Long Radius (1.5D)</strong> — per ASME B16.9</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#f59e0b] mt-0.5">•</span>
                    <span><strong className="text-zinc-100">SR = Short Radius (1.0D)</strong> — per ASME B16.9</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#f59e0b] mt-0.5">•</span>
                    <span>{t('tools.elbowCut.noteTolerance', { defaultValue: 'Tolerancias de corte: ±2mm recomendado' })}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#f59e0b] mt-0.5">•</span>
                    <span>{t('tools.elbowCut.noteAngleMeasure', { defaultValue: 'El ángulo de corte se mide desde el extremo del codo' })}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#f59e0b] mt-0.5">•</span>
                    <span>{t('tools.elbowCut.noteSmallAngle', { defaultValue: 'Para ángulos < 30° usar plantilla física para mayor precisión' })}</span>
                  </li>
                </ul>
              </div>

              {/* Standards */}
              <div className="border border-zinc-800 rounded-lg p-6 space-y-3 bg-zinc-900/30">
                <h4 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
                  {t('tools.elbowCut.standards', { defaultValue: 'Estándares de Referencia' })}
                </h4>
                <div className="space-y-2 text-sm text-zinc-400">
                  <p><strong className="text-zinc-200">ASME B16.9</strong> — Factory-Made Wrought Buttwelding Fittings</p>
                  <p><strong className="text-zinc-200">ASME B36.10M</strong> — Welded and Seamless Wrought Steel Pipe</p>
                  <p><strong className="text-zinc-200">MSS SP-75</strong> — High Test Wrought BW Fittings</p>
                </div>
              </div>

              {/* Practical tips */}
              <div className="border border-zinc-800 rounded-lg p-6 space-y-3 bg-zinc-900/30">
                <h4 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
                  {t('tools.elbowCut.tips', { defaultValue: 'Consejos Prácticos' })}
                </h4>
                <ul className="space-y-2 text-sm text-zinc-400">
                  <li className="flex items-start gap-2">
                    <span className="text-green-400 mt-0.5">✓</span>
                    <span>{t('tools.elbowCut.tip1', { defaultValue: 'Marque siempre el extradós antes de cortar' })}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-400 mt-0.5">✓</span>
                    <span>{t('tools.elbowCut.tip2', { defaultValue: 'Use plantilla de cartón para ángulos no estándar' })}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-400 mt-0.5">✓</span>
                    <span>{t('tools.elbowCut.tip3', { defaultValue: 'Verifique con transportador digital después del corte' })}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-400 mt-0.5">✓</span>
                    <span>{t('tools.elbowCut.tip4', { defaultValue: 'Considere 2-3mm extra para biselado' })}</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Footer note */}
      <div className="flex items-start gap-2 text-xs text-zinc-500">
        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>{t('tools.elbowNote', { defaultValue: 'Valores teóricos según ASME B16.9. Verificar siempre con el estándar de fabricación aplicable.' })}</span>
      </div>
    </div>
  );
}