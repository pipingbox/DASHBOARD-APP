import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlignHorizontalDistributeCenter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  solvePipeCombStagger,
  type PipeCombStaggerSolution,
} from '@/tools/core/geometry/pipe-comb-stagger';
import { toMm, fromMm } from '@/tools/core/units';
import { useUnitFieldConversion, type UnitSystem } from '../shared';
import {
  buildPipeCombStaggerViewModel,
  type PipeCombStaggerViewModel,
} from './pipe-comb-stagger-svg';

/**
 * PB-PIPE-COMB-CORRECTION-001 / P2 — genuine pipe comb (peines de tubería) UI.
 *
 * Primary workflow: number of pipes, initial/final centre-to-centre spacing
 * and elbow angle. All geometry (A, sign, direction, cumulative stagger)
 * comes exclusively from the P1 kernel `solvePipeCombStagger`; this
 * component never reproduces the core equation. NPS/Schedule/LR/SR/CLR are
 * deferred to P3 optional fabrication enrichment.
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
  const vm: PipeCombStaggerViewModel = useMemo(() => buildPipeCombStaggerViewModel(solution), [solution]);

  const W = 640;
  const H = 440;
  const pad = 46;
  const spanX = Math.max(vm.bounds.maxX - vm.bounds.minX, 1e-6);
  const spanY = Math.max(vm.bounds.maxY - vm.bounds.minY, 1e-6);
  const scale = Math.min((W - 2 * pad) / spanX, (H - 2 * pad) / spanY);
  // Model space is +Y up; SVG is +Y down, so Y is flipped.
  const X = (x: number) => pad + (x - vm.bounds.minX) * scale;
  const Y = (y: number) => H - pad - (y - vm.bounds.minY) * scale;

  const axisColor = '#FF8C00';
  const dimColor = '#8FB8E8';
  const guideColor = '#3A4454';

  const tick = (x: number, y: number, vertical: boolean) =>
    vertical ? (
      <line x1={x} y1={y - 3} x2={x} y2={y + 3} stroke={dimColor} strokeWidth={1.2} />
    ) : (
      <line x1={x - 3} y1={y} x2={x + 3} y2={y} stroke={dimColor} strokeWidth={1.2} />
    );

  // Angle arc between the final direction v and the initial direction u at
  // the elbow of pipe 1 (math degrees; screen Y is flipped).
  const arc = vm.angleArc;
  const arcStart = {
    x: X(arc.center.x + arc.radiusMm * Math.cos((arc.startDeg * Math.PI) / 180)),
    y: Y(arc.center.y + arc.radiusMm * Math.sin((arc.startDeg * Math.PI) / 180)),
  };
  const arcEnd = {
    x: X(arc.center.x + arc.radiusMm * Math.cos((arc.endDeg * Math.PI) / 180)),
    y: Y(arc.center.y + arc.radiusMm * Math.sin((arc.endDeg * Math.PI) / 180)),
  };
  const arcMid = {
    x: arc.center.x + (arc.radiusMm + 26 / scale) * Math.cos((((arc.startDeg + arc.endDeg) / 2) * Math.PI) / 180),
    y: arc.center.y + (arc.radiusMm + 26 / scale) * Math.sin((((arc.startDeg + arc.endDeg) / 2) * Math.PI) / 180),
  };

  const staggerVisible = Math.abs(vm.dimStagger.valueMm) > 1e-9;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full max-w-2xl"
      role="img"
      aria-labelledby="pipe-comb-svg-title pipe-comb-svg-desc"
      data-testid="pipe-comb-stagger-svg"
      data-direction={solution.staggerDirection}
      data-pipe-count={solution.pipeCount}
    >
      <title id="pipe-comb-svg-title">{labels.svgTitle}</title>
      <desc id="pipe-comb-svg-desc">{solution.pipeCount} × θ = {solution.elbowAngleDeg}°</desc>

      {/* Dashed level guide linking elbow 1 to the stagger dimension. */}
      {staggerVisible && (
        <line
          x1={X(vm.pipes[0].elbow.x)}
          y1={Y(vm.pipes[0].elbow.y)}
          x2={X(vm.pipes[1].elbow.x)}
          y2={Y(vm.pipes[0].elbow.y)}
          stroke={guideColor}
          strokeWidth={1}
          strokeDasharray="4 4"
        />
      )}

      {vm.pipes.map((p) => (
        <g key={p.pipeNumber}>
          <polyline
            points={`${X(p.start.x)},${Y(p.start.y)} ${X(p.elbow.x)},${Y(p.elbow.y)} ${X(p.end.x)},${Y(p.end.y)}`}
            fill="none"
            stroke={axisColor}
            strokeWidth={2.4}
            strokeLinejoin="round"
          />
          <circle cx={X(p.elbow.x)} cy={Y(p.elbow.y)} r={3} fill="#F5F7FA" />
          <text
            x={X(p.elbow.x) - 8}
            y={Y(p.elbow.y) + (vm.dimStagger.valueMm >= 0 ? 16 : -10)}
            textAnchor="end"
            fill="#A3A9B3"
            fontSize="10"
            data-testid="pipe-comb-pipe-label"
          >
            {labels.pipeLabel} {p.pipeNumber}
          </text>
        </g>
      ))}

      {/* Di dimension between the first two initial axes. */}
      <g>
        <line
          x1={X(vm.dimInitial.from.x)}
          y1={Y(vm.dimInitial.from.y)}
          x2={X(vm.dimInitial.to.x)}
          y2={Y(vm.dimInitial.to.y)}
          stroke={dimColor}
          strokeWidth={1.2}
        />
        {tick(X(vm.dimInitial.from.x), Y(vm.dimInitial.from.y), true)}
        {tick(X(vm.dimInitial.to.x), Y(vm.dimInitial.to.y), true)}
        <text
          x={(X(vm.dimInitial.from.x) + X(vm.dimInitial.to.x)) / 2}
          y={Y(vm.dimInitial.from.y) + 14}
          textAnchor="middle"
          fill={dimColor}
          fontSize="10"
          data-testid="pipe-comb-dim-initial"
        >
          {labels.dimInitial} {fmt(vm.dimInitial.valueMm)}
        </text>
      </g>

      {/* Df dimension between the first two final axes. */}
      <g>
        <line
          x1={X(vm.dimFinal.from.x)}
          y1={Y(vm.dimFinal.from.y)}
          x2={X(vm.dimFinal.to.x)}
          y2={Y(vm.dimFinal.to.y)}
          stroke={dimColor}
          strokeWidth={1.2}
        />
        {tick(X(vm.dimFinal.from.x), Y(vm.dimFinal.from.y), false)}
        {tick(X(vm.dimFinal.to.x), Y(vm.dimFinal.to.y), false)}
        <text
          x={(X(vm.dimFinal.from.x) + X(vm.dimFinal.to.x)) / 2 + 12}
          y={(Y(vm.dimFinal.from.y) + Y(vm.dimFinal.to.y)) / 2 - 6}
          fill={dimColor}
          fontSize="10"
          data-testid="pipe-comb-dim-final"
        >
          {labels.dimFinal} {fmt(vm.dimFinal.valueMm)}
        </text>
      </g>

      {/* Signed stagger A between elbows 1 and 2. */}
      {staggerVisible && (
        <g>
          <line
            x1={X(vm.dimStagger.from.x)}
            y1={Y(vm.dimStagger.from.y)}
            x2={X(vm.dimStagger.to.x)}
            y2={Y(vm.dimStagger.to.y)}
            stroke={dimColor}
            strokeWidth={1.4}
          />
          {tick(X(vm.dimStagger.from.x), Y(vm.dimStagger.from.y), false)}
          {tick(X(vm.dimStagger.to.x), Y(vm.dimStagger.to.y), false)}
          <text
            x={X(vm.dimStagger.from.x) + 8}
            y={(Y(vm.dimStagger.from.y) + Y(vm.dimStagger.to.y)) / 2}
            fill={dimColor}
            fontSize="10"
            data-testid="pipe-comb-dim-stagger"
          >
            {labels.dimStagger} {fmt(vm.dimStagger.valueMm)}
          </text>
        </g>
      )}
      {!staggerVisible && (
        <text
          x={X(vm.pipes[1].elbow.x) + 10}
          y={Y(vm.pipes[1].elbow.y) - 8}
          fill={dimColor}
          fontSize="10"
          data-testid="pipe-comb-dim-stagger"
        >
          {labels.dimStagger} {fmt(0)}
        </text>
      )}

      {/* Elbow angle arc near pipe 1. */}
      <g>
        <path
          d={`M ${arcStart.x} ${arcStart.y} A ${arc.radiusMm * scale} ${arc.radiusMm * scale} 0 0 1 ${arcEnd.x} ${arcEnd.y}`}
          fill="none"
          stroke={dimColor}
          strokeWidth={1.2}
        />
        <text
          x={X(arcMid.x)}
          y={Y(arcMid.y)}
          textAnchor="middle"
          fill={dimColor}
          fontSize="10"
          data-testid="pipe-comb-angle-label"
        >
          {labels.angle} {solution.elbowAngleDeg}°
        </text>
      </g>
    </svg>
  );
}

export default function PipeCombTool() {
  const { t } = useTranslation();
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('metric');
  const [pipeCount, setPipeCount] = useState('4');
  const [initialSpacing, setInitialSpacing] = useState('200');
  const [finalSpacing, setFinalSpacing] = useState('400');
  const [elbowAngle, setElbowAngle] = useState('45');

  // Unit toggle converts the visible values, preserving the physical
  // dimensions; geometry is never recalculated from rounded displays.
  useUnitFieldConversion(unitSystem, [
    [initialSpacing, setInitialSpacing],
    [finalSpacing, setFinalSpacing],
  ]);

  const { result, errorCode } = useMemo(() => {
    const count = Number(pipeCount);
    const initial = Number(initialSpacing);
    const final = Number(finalSpacing);
    const angle = Number(elbowAngle);

    // Input-level validation mirrors the kernel domain; the kernel remains
    // the single source of geometry.
    if (!Number.isFinite(count) || !Number.isFinite(initial) || !Number.isFinite(final) || !Number.isFinite(angle)) {
      return { result: null, errorCode: 'non_finite_input' };
    }
    if (!(initial > 0)) return { result: null, errorCode: 'initial_spacing_positive' };
    if (!(final > 0)) return { result: null, errorCode: 'final_spacing_positive' };
    if (!(angle > 0 && angle <= 90)) return { result: null, errorCode: 'elbow_angle_range' };
    if (!Number.isInteger(count) || count < 2 || count > MAX_UI_PIPES) {
      return { result: null, errorCode: 'pipe_count_range' };
    }

    const unit = unitSystem === 'metric' ? 'mm' : 'in';
    const res = solvePipeCombStagger({
      pipeCount: count,
      initialSpacingMm: toMm(initial, unit),
      finalSpacingMm: toMm(final, unit),
      elbowAngleDeg: angle,
    });
    if (res.success === false) {
      return { result: null, errorCode: res.code ?? 'non_finite_input' };
    }
    return { result: res.result, errorCode: null };
  }, [pipeCount, initialSpacing, finalSpacing, elbowAngle, unitSystem]);

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
            value={initialSpacing}
            inputMode="decimal"
            onChange={(e) => setInitialSpacing(e.target.value)}
            className="bg-[#0E1117] border-[#232A36]"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pipe-comb-final-spacing" className="text-[10px] uppercase tracking-wider text-[#A3A9B3]">
            {t('tools.prefab.pipeComb.finalCenterSpacing')}
          </Label>
          <Input
            id="pipe-comb-final-spacing"
            value={finalSpacing}
            inputMode="decimal"
            onChange={(e) => setFinalSpacing(e.target.value)}
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
              variant={Number(elbowAngle) === preset ? 'default' : 'outline'}
              aria-pressed={Number(elbowAngle) === preset}
              data-testid={`pipe-comb-preset-${String(preset).replace('.', '-')}`}
              onClick={() => setElbowAngle(String(preset))}
              className={Number(elbowAngle) === preset ? 'bg-[#FF8C00] text-black' : 'border-[#232A36]'}
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
          <svg viewBox={`0 0 640 440`} className="w-full max-w-2xl">
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
