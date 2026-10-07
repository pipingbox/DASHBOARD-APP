import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlignHorizontalDistributeCenter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  solvePipeCombStagger,
  type PipeCombStaggerSolution,
} from '@/tools/core/geometry/pipe-comb-stagger';
import { fromMm } from '@/tools/core/units';
import type { UnitSystem } from '../shared';
import {
  createLengthField,
  lengthFieldOnEdit,
  lengthFieldOnUnitChange,
  lengthFieldIsValid,
  parseDecimalInput,
  type LengthFieldState,
} from './number-input';
import {
  buildPipeCombStaggerScreenLayout,
} from './pipe-comb-stagger-svg';

/**
 * PB-PIPE-COMB-CORRECTION-001 / P2 — genuine pipe comb (peines de tubería) UI.
 *
 * Primary workflow: number of pipes, initial/final centre-to-centre spacing
 * and elbow angle. All geometry (A, sign, direction, cumulative stagger)
 * comes exclusively from the P1 kernel `solvePipeCombStagger`; this
 * component never reproduces the core equation. NPS/Schedule/LR/SR/CLR are
 * deferred to P3 optional fabrication enrichment.
 *
 * Final-review fixes:
 *  - H1: Di/Df are kept as CANONICAL millimetre values (full precision) in
 *    `LengthFieldState`; a unit toggle only re-renders the display text and
 *    can never change the physical geometry.
 *  - H2/H3: the SVG consumes the pure screen layout
 *    (`buildPipeCombStaggerScreenLayout`), which centres the angle arc on
 *    the elbow and keeps text at a constant legible CSS-px size at any
 *    viewport via the measured container width.
 *  - Decimal input policy: one point OR one comma; ambiguous mixes are
 *    rejected with a localized error instead of being guessed.
 */

/** UX/readability limit only — NOT a geometric or fabrication limit. */
const MAX_UI_PIPES = 12;
const ANGLE_PRESETS = [15, 22.5, 30, 45, 60, 90];

const KERNEL_ERROR_KEYS: Record<string, string> = {
  non_finite_input: 'tools.prefab.pipeComb.errorNonFinite',
  initial_spacing_positive: 'tools.prefab.pipeComb.errorInitialSpacing',
  final_spacing_positive: 'tools.prefab.pipeComb.errorFinalSpacing',
  elbow_angle_range: 'tools.prefab.pipeComb.errorAngle',
  pipe_count_range: 'tools.prefab.pipeComb.errorPipeCount',
  pipe_count_resource_limit: 'tools.prefab.pipeComb.errorResourceLimit',
};

interface DiagramLabels {
  svgTitle: string;
  pipeLabel: string;
  dimInitial: string;
  dimFinal: string;
  dimStagger: string;
  angle: string;
}

interface PipeCombStaggerDiagramProps {
  solution: PipeCombStaggerSolution;
  fmt: (v: number | undefined) => string;
  labels: DiagramLabels;
}

/** Screen schematic of the genuine pipe comb. NOT a 1:1 fabrication drawing. */
function PipeCombStaggerDiagram({ solution, fmt, labels }: PipeCombStaggerDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [displayWidth, setDisplayWidth] = useState(640);

  // Re-layout with the real rendered width so text stays at a constant,
  // legible CSS-px size at every viewport (H3).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setDisplayWidth(w);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(
    () => buildPipeCombStaggerScreenLayout(solution, displayWidth),
    [solution, displayWidth],
  );
  const upx = layout.unitsPerPx;

  const axisColor = '#FF8C00';
  const dimColor = '#8FB8E8';
  const guideColor = '#3A4454';

  // Background-colour halo behind every label: any pipe/dimension line
  // crossing a text is knocked out behind it, so dense geometries stay
  // readable at small display widths (P2 final review, H3).
  const textHalo = {
    paintOrder: 'stroke',
    stroke: '#151A22',
    strokeWidth: layout.fontSize * 0.5,
    strokeLinejoin: 'round' as const,
  };

  const tickV = (x: number, y: number) => (
    <line x1={x} y1={y - layout.tick} x2={x} y2={y + layout.tick} stroke={dimColor} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
  );
  const tickH = (x: number, y: number) => (
    <line x1={x - layout.tick} y1={y} x2={x + layout.tick} y2={y} stroke={dimColor} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
  );

  return (
    <div ref={containerRef}>
      <svg
        viewBox={`${layout.viewBox.x} ${layout.viewBox.y} ${layout.viewBox.w} ${layout.viewBox.h}`}
        className="block w-full"
        role="img"
        aria-labelledby="pipe-comb-svg-title pipe-comb-svg-desc"
        data-testid="pipe-comb-stagger-svg"
        data-direction={solution.staggerDirection}
        data-pipe-count={solution.pipeCount}
      >
        <title id="pipe-comb-svg-title">{labels.svgTitle}</title>
        <desc id="pipe-comb-svg-desc">{solution.pipeCount} × θ = {solution.elbowAngleDeg}°</desc>

        {/* Dashed level guide linking elbow 1 to the stagger dimension. */}
        {layout.dimStagger.visible && (
          <line
            x1={layout.pipes[0].elbow.x}
            y1={layout.pipes[0].elbow.y}
            x2={layout.pipes[1].elbow.x}
            y2={layout.pipes[0].elbow.y}
            stroke={guideColor}
            strokeWidth={1}
            strokeDasharray={`${4 * upx} ${4 * upx}`}
            vectorEffect="non-scaling-stroke"
          />
        )}

        {layout.pipes.map((p) => (
          <g key={p.pipeNumber}>
            <polyline
              points={`${p.start.x},${p.start.y} ${p.elbow.x},${p.elbow.y} ${p.end.x},${p.end.y}`}
              fill="none"
              stroke={axisColor}
              strokeWidth={2.4}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={p.elbow.x} cy={p.elbow.y} r={3 * upx} fill="#F5F7FA" />
            {p.labelPos && (
              <text
                x={p.labelPos.x}
                y={p.labelPos.y}
                textAnchor={p.labelAnchor}
                fill="#A3A9B3"
                fontSize={layout.fontSize}
                {...textHalo}
                data-testid="pipe-comb-pipe-label"
              >
                {labels.pipeLabel} {p.pipeNumber}
              </text>
            )}
          </g>
        ))}

        {/* Di dimension between the first two initial axes. */}
        <g>
          <line
            x1={layout.dimInitial.from.x}
            y1={layout.dimInitial.from.y}
            x2={layout.dimInitial.to.x}
            y2={layout.dimInitial.to.y}
            stroke={dimColor}
            strokeWidth={1.2}
            vectorEffect="non-scaling-stroke"
          />
          {tickV(layout.dimInitial.from.x, layout.dimInitial.from.y)}
          {tickV(layout.dimInitial.to.x, layout.dimInitial.to.y)}
          <text
            x={layout.dimInitial.labelPos.x}
            y={layout.dimInitial.labelPos.y}
            textAnchor={layout.dimInitial.labelAnchor}
            fill={dimColor}
            fontSize={layout.fontSize}
            {...textHalo}
            data-testid="pipe-comb-dim-initial"
          >
            {labels.dimInitial} {fmt(layout.dimInitial.valueMm)}
          </text>
        </g>

        {/* Df dimension between the first two final axes. */}
        <g>
          <line
            x1={layout.dimFinal.from.x}
            y1={layout.dimFinal.from.y}
            x2={layout.dimFinal.to.x}
            y2={layout.dimFinal.to.y}
            stroke={dimColor}
            strokeWidth={1.2}
            vectorEffect="non-scaling-stroke"
          />
          {tickH(layout.dimFinal.from.x, layout.dimFinal.from.y)}
          {tickH(layout.dimFinal.to.x, layout.dimFinal.to.y)}
          <text
            x={layout.dimFinal.labelPos.x}
            y={layout.dimFinal.labelPos.y}
            textAnchor={layout.dimFinal.labelAnchor}
            fill={dimColor}
            fontSize={layout.fontSize}
            {...textHalo}
            data-testid="pipe-comb-dim-final"
          >
            {labels.dimFinal} {fmt(layout.dimFinal.valueMm)}
          </text>
        </g>

        {/* Signed stagger A between elbows 1 and 2. */}
        {layout.dimStagger.visible ? (
          <g>
            <line
              x1={layout.dimStagger.from.x}
              y1={layout.dimStagger.from.y}
              x2={layout.dimStagger.to.x}
              y2={layout.dimStagger.to.y}
              stroke={dimColor}
              strokeWidth={1.4}
              vectorEffect="non-scaling-stroke"
            />
            {tickH(layout.dimStagger.from.x, layout.dimStagger.from.y)}
            {tickH(layout.dimStagger.to.x, layout.dimStagger.to.y)}
            <text
              x={layout.dimStagger.labelPos.x}
              y={layout.dimStagger.labelPos.y}
              textAnchor={layout.dimStagger.labelAnchor}
              fill={dimColor}
              fontSize={layout.fontSize}
              {...textHalo}
              data-testid="pipe-comb-dim-stagger"
            >
              {labels.dimStagger} {fmt(layout.dimStagger.valueMm)}
            </text>
          </g>
        ) : (
          <text
            x={layout.dimStagger.labelPos.x}
            y={layout.dimStagger.labelPos.y}
            textAnchor={layout.dimStagger.labelAnchor}
            fill={dimColor}
            fontSize={layout.fontSize}
            {...textHalo}
            data-testid="pipe-comb-dim-stagger"
          >
            {labels.dimStagger} {fmt(0)}
          </text>
        )}

        {/* Elbow angle arc near pipe 1 (path from the pure layout, H2). */}
        <g>
          <path
            d={layout.angleArcPath}
            fill="none"
            stroke={dimColor}
            strokeWidth={1.2}
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={layout.angleLabelPos.x}
            y={layout.angleLabelPos.y}
            textAnchor={layout.angleLabelAnchor}
            fill={dimColor}
            fontSize={layout.fontSize}
            {...textHalo}
            data-testid="pipe-comb-angle-label"
          >
            {labels.angle} {solution.elbowAngleDeg}°
          </text>
        </g>
      </svg>
    </div>
  );
}

export default function PipeCombTool() {
  const { t } = useTranslation();
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('metric');
  const unit = unitSystem === 'metric' ? ('mm' as const) : ('in' as const);
  const [pipeCount, setPipeCount] = useState('4');
  const [elbowAngle, setElbowAngle] = useState('45');
  // Canonical physical values (mm, full precision). Unit toggles only
  // re-render the display text; they NEVER rewrite these values (H1).
  const [diField, setDiField] = useState<LengthFieldState>(() => createLengthField(200, 'mm'));
  const [dfField, setDfField] = useState<LengthFieldState>(() => createLengthField(400, 'mm'));

  useEffect(() => {
    setDiField((f) => lengthFieldOnUnitChange(f, unit));
    setDfField((f) => lengthFieldOnUnitChange(f, unit));
  }, [unit]);

  const { result, errorCode } = useMemo(() => {
    const count = parseDecimalInput(pipeCount);
    const angle = parseDecimalInput(elbowAngle);
    const diValid = lengthFieldIsValid(diField);
    const dfValid = lengthFieldIsValid(dfField);

    // Input-level validation mirrors the kernel domain; the kernel remains
    // the single source of geometry.
    if (count === null || angle === null || !diValid || !dfValid || diField.canonicalMm === null || dfField.canonicalMm === null) {
      return { result: null, errorCode: 'non_finite_input' };
    }
    const initialMm = diField.canonicalMm;
    const finalMm = dfField.canonicalMm;
    if (!(initialMm > 0)) return { result: null, errorCode: 'initial_spacing_positive' };
    if (!(finalMm > 0)) return { result: null, errorCode: 'final_spacing_positive' };
    if (!(angle > 0 && angle <= 90)) return { result: null, errorCode: 'elbow_angle_range' };
    if (!Number.isInteger(count) || count < 2 || count > MAX_UI_PIPES) {
      return { result: null, errorCode: 'pipe_count_range' };
    }

    const res = solvePipeCombStagger({
      pipeCount: count,
      initialSpacingMm: initialMm,
      finalSpacingMm: finalMm,
      elbowAngleDeg: angle,
    });
    if (res.success === false) {
      return { result: null, errorCode: res.code ?? 'non_finite_input' };
    }
    return { result: res.result, errorCode: null };
  }, [pipeCount, diField, dfField, elbowAngle]);

  /** Human-readable formatting; the kernel itself never rounds. */
  const fmt = (v: number | undefined) => {
    if (v === undefined || !Number.isFinite(v)) return '—';
    if (unitSystem === 'metric') return `${Number(v.toFixed(2))} mm`;
    return `${fromMm(v, 'in').toFixed(3)} in`;
  };

  const directionText =
    result?.staggerDirection === 'positive'
      ? t('tools.prefab.pipeComb.directionPositive')
      : result?.staggerDirection === 'negative'
        ? t('tools.prefab.pipeComb.directionNegative')
        : t('tools.prefab.pipeComb.directionAligned');

  const errorText = errorCode
    ? t(KERNEL_ERROR_KEYS[errorCode] ?? 'tools.prefab.pipeComb.errorNonFinite', { max: MAX_UI_PIPES })
    : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 border-b border-[#232A36] pb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#FF8C00]/10 text-[#FF8C00]">
          <AlignHorizontalDistributeCenter className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-[#F5F7FA]">{t('tools.prefab.pipeComb.title')}</h3>
          <p className="text-xs text-[#A3A9B3]">{t('tools.prefab.pipeComb.subtitle')}</p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          size="sm"
          aria-pressed={unitSystem === 'metric'}
          onClick={() => setUnitSystem('metric')}
          className={unitSystem === 'metric' ? 'bg-[#FF8C00] text-black' : 'border-[#232A36]'}
        >
          mm
        </Button>
        <Button
          type="button"
          size="sm"
          aria-pressed={unitSystem === 'imperial'}
          onClick={() => setUnitSystem('imperial')}
          className={unitSystem === 'imperial' ? 'bg-[#FF8C00] text-black' : 'border-[#232A36]'}
        >
          in
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="pipe-comb-pipe-count" className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">
            {t('tools.prefab.pipeComb.pipeCount')}
          </Label>
          <Input
            id="pipe-comb-pipe-count"
            value={pipeCount}
            inputMode="numeric"
            onChange={(e) => setPipeCount(e.target.value)}
            className="bg-[#0E1117] border-[#232A36]"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pipe-comb-initial-spacing" className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">
            {t('tools.prefab.pipeComb.initialCenterSpacing')}
          </Label>
          <Input
            id="pipe-comb-initial-spacing"
            value={diField.text}
            inputMode="decimal"
            onChange={(e) => setDiField((f) => lengthFieldOnEdit(f, e.target.value, unit))}
            className="bg-[#0E1117] border-[#232A36]"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pipe-comb-final-spacing" className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">
            {t('tools.prefab.pipeComb.finalCenterSpacing')}
          </Label>
          <Input
            id="pipe-comb-final-spacing"
            value={dfField.text}
            inputMode="decimal"
            onChange={(e) => setDfField((f) => lengthFieldOnEdit(f, e.target.value, unit))}
            className="bg-[#0E1117] border-[#232A36]"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pipe-comb-angle" className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">
            {t('tools.prefab.pipeComb.elbowAngle')}
          </Label>
          <Input
            id="pipe-comb-angle"
            value={elbowAngle}
            inputMode="decimal"
            onChange={(e) => setElbowAngle(e.target.value)}
            className="bg-[#0E1117] border-[#232A36]"
          />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">
          {t('tools.prefab.pipeComb.commonAngles')}
        </p>
        <div className="flex flex-wrap gap-2">
          {ANGLE_PRESETS.map((preset) => (
            <Button
              key={preset}
              type="button"
              size="sm"
              variant={parseDecimalInput(elbowAngle) === preset ? 'default' : 'outline'}
              aria-pressed={parseDecimalInput(elbowAngle) === preset}
              data-testid={`pipe-comb-preset-${String(preset).replace('.', '-')}`}
              onClick={() => setElbowAngle(String(preset))}
              className={parseDecimalInput(elbowAngle) === preset ? 'bg-[#FF8C00] text-black' : 'border-[#232A36]'}
            >
              {preset}°
            </Button>
          ))}
        </div>
        <p className="text-[11px] text-[#A3A9B3]">
          {t('tools.prefab.pipeComb.customAngle')} · {t('tools.prefab.pipeComb.maxPipesNote')}
        </p>
      </div>

      {errorText && (
        <p
          role="alert"
          data-testid="pipe-comb-error"
          data-code={errorCode}
          className="text-xs text-red-400"
        >
          {errorText}
        </p>
      )}

      <div className="rounded-lg border border-[#232A36] bg-[#151A22] p-4">
        <h4 className="mb-3 text-[11px] uppercase tracking-wider text-[#A3A9B3]">
          {t('tools.prefab.common.drawing')}
        </h4>
        {result ? (
          <PipeCombStaggerDiagram
            solution={result}
            fmt={fmt}
            labels={{
              svgTitle: t('tools.prefab.pipeComb.title'),
              pipeLabel: t('tools.prefab.pipeComb.pipe'),
              dimInitial: t('tools.prefab.pipeComb.dimensionInitial'),
              dimFinal: t('tools.prefab.pipeComb.dimensionFinal'),
              dimStagger: t('tools.prefab.pipeComb.dimensionA'),
              angle: t('tools.prefab.pipeComb.angleLabel'),
            }}
          />
        ) : (
          <svg viewBox="0 0 640 440" className="w-full max-w-2xl">
            <text x="320" y="220" textAnchor="middle" fill="#A3A9B3" fontSize="12">
              {t('tools.prefab.pipeComb.drawPlaceholder')}
            </text>
          </svg>
        )}
        <p className="mt-2 text-[11px] text-[#A3A9B3]">{t('tools.prefab.pipeComb.schematicNote')}</p>
      </div>

      <div className="rounded-lg border border-[#232A36] bg-[#151A22] p-4" data-testid="pipe-comb-stagger-results">
        <h4 className="mb-3 text-[11px] uppercase tracking-wider text-[#A3A9B3]">
          {t('tools.prefab.common.results')}
        </h4>
        {result ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-md border border-[#232A36] bg-[#0E1117] p-3">
                <p className="text-[11px] text-[#A3A9B3]">{t('tools.prefab.pipeComb.cotaA')}</p>
                <p className="break-words text-lg font-semibold text-[#F5F7FA]" data-testid="pipe-comb-stagger-metric" data-metric="cotaA">
                  {fmt(result.adjacentStaggerMm)}
                </p>
                <p className="text-[10px] text-[#A3A9B3]">{t('tools.prefab.pipeComb.adjacentStagger')}</p>
              </div>
              <div className="rounded-md border border-[#232A36] bg-[#0E1117] p-3">
                <p className="text-[11px] text-[#A3A9B3]">{t('tools.prefab.pipeComb.totalStagger')}</p>
                <p className="break-words text-lg font-semibold text-[#F5F7FA]" data-testid="pipe-comb-stagger-metric" data-metric="totalStagger">
                  {fmt(result.pipes[result.pipeCount - 1].cumulativeStaggerMm)}
                </p>
                <p className="text-[10px] text-[#A3A9B3]">P{result.pipeCount} − P1</p>
              </div>
              <div className="rounded-md border border-[#232A36] bg-[#0E1117] p-3">
                <p className="text-[11px] text-[#A3A9B3]">{t('tools.prefab.pipeComb.staggerDirection')}</p>
                <p className="text-base font-semibold text-[#F5F7FA]" data-testid="pipe-comb-stagger-metric" data-metric="direction">
                  {directionText}
                </p>
              </div>
              <div className="rounded-md border border-[#232A36] bg-[#0E1117] p-3">
                <p className="text-[11px] text-[#A3A9B3]">{t('tools.prefab.pipeComb.elbowAngle')}</p>
                <p className="text-lg font-semibold text-[#F5F7FA]" data-testid="pipe-comb-stagger-metric" data-metric="angle">
                  {result.elbowAngleDeg}°
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-[#A3A9B3]">
                    <th scope="col" className="py-2 pr-4">{t('tools.prefab.pipeComb.pipe')}</th>
                    <th scope="col" className="py-2 pr-4">{t('tools.prefab.pipeComb.cumulativeStagger')}</th>
                    <th scope="col" className="py-2">{t('tools.prefab.pipeComb.adjacentStep')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232A36]">
                  {result.pipes.map((pipe, i) => (
                    <tr key={pipe.pipeNumber} data-testid="pipe-comb-stagger-row" data-pipe={pipe.pipeNumber}>
                      <td className="py-2 pr-4 text-[#F5F7FA]">
                        {t('tools.prefab.pipeComb.pipe')} {pipe.pipeNumber}
                      </td>
                      <td className="py-2 pr-4 text-[#F5F7FA]">{fmt(pipe.cumulativeStaggerMm)}</td>
                      <td className="py-2 text-[#F5F7FA]">
                        {i === 0 ? t('tools.prefab.pipeComb.reference') : fmt(result.adjacentStaggerMm)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] text-[#A3A9B3]">{t('tools.prefab.pipeComb.unitNote')}</p>
          </div>
        ) : (
          <p className="text-sm text-[#A3A9B3]">{t('tools.prefab.common.noResult')}</p>
        )}
      </div>
    </div>
  );
}
