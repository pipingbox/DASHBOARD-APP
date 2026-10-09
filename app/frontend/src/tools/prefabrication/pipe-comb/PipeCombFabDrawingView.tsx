import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { PipeCombFabricationSolution } from './pipe-comb-fabrication';
import {
  buildPipeCombFabDrawing,
  projectPoint,
  PROJECTION,
  type Vec2,
} from './pipe-comb-fab-drawing';
import type { LengthUnit } from '@/tools/core/units';
import { formatLengthForUnit } from './number-input';

/**
 * PB-PIPE-COMB-CORRECTION-001 / P3-C — on-screen fabrication view.
 *
 * Renders the SAME pure drawing model the PDF exporter consumes
 * (`buildPipeCombFabDrawing`): identical coordinates, identifiers and
 * values — screen, drawing and PDF share one source. This component only
 * projects and places labels; it never recomputes fabrication numbers.
 *
 * The view is a dimensioned representation, NOT a 1:1 template: the fixed
 * oblique projection does not preserve visual angles/lengths, so every
 * label carries the real model value and the "do not scale" note is
 * always visible.
 */

interface PipeCombFabDrawingViewProps {
  solution: PipeCombFabricationSolution;
  unit: LengthUnit;
}

const VB_W = 960;
const VB_H = 540;
const PAD = 46;

export default function PipeCombFabDrawingView({ solution, unit }: PipeCombFabDrawingViewProps) {
  const { t } = useTranslation();
  const drawing = useMemo(() => buildPipeCombFabDrawing(solution), [solution]);
  const fmt = (v: number) => `${formatLengthForUnit(v, unit)} ${unit}`;
  /* A dense N=12 overview remains useful for topology and reference planes,
   * but individual labels/dimensions belong to the cut-list/detail pages.
   * Omitting them here prevents the overview from becoming unreadable while
   * preserving every value in the shared drawing model and PDF tables. */
  const overviewIsDense = drawing.pipeCount > 6;

  // Fit projected bounds into the viewBox (y flipped for screen coords).
  const { map } = useMemo(() => {
    const corners = [
      projectPoint({ x: drawing.bounds.min.x, y: drawing.bounds.min.y }),
      projectPoint({ x: drawing.bounds.min.x, y: drawing.bounds.max.y }),
      projectPoint({ x: drawing.bounds.max.x, y: drawing.bounds.min.y }),
      projectPoint({ x: drawing.bounds.max.x, y: drawing.bounds.max.y }),
    ];
    const minX = Math.min(...corners.map((c) => c.x));
    const maxX = Math.max(...corners.map((c) => c.x));
    const minY = Math.min(...corners.map((c) => c.y));
    const maxY = Math.max(...corners.map((c) => c.y));
    const w = Math.max(maxX - minX, 1e-6);
    const h = Math.max(maxY - minY, 1e-6);
    const scale = Math.min((VB_W - 2 * PAD) / w, (VB_H - 2 * PAD) / h);
    const mapFn = (p: Vec2): Vec2 => {
      const q = projectPoint(p);
      return {
        x: PAD + (q.x - minX) * scale,
        y: VB_H - PAD - (q.y - minY) * scale,
      };
    };
    return { map: mapFn };
  }, [drawing]);

  const dimLabel = (measureKey: string, ownerId: string, valueMm: number): string => {
    switch (measureKey) {
      case 'lin': return `Lin = ${fmt(valueMm)}`;
      case 'lout': return `Lout = ${fmt(valueMm)}`;
      case 'di': return `Di = ${fmt(valueMm)}`;
      case 'df': return `Df = ${fmt(valueMm)}`;
      case 'staggerA': return `A = ${fmt(valueMm)}`;
      case 'finishedLength': return `${ownerId} ${t('tools.prefab.pipeComb.fab.draw.finished')} ${fmt(valueMm)}`;
      case 'cutLength': return `${ownerId} ${t('tools.prefab.pipeComb.fab.draw.cut')} ${fmt(valueMm)}`;
      case 'straightInlet': return `${t('tools.prefab.pipeComb.fab.draw.straightInlet')} ${fmt(valueMm)}`;
      case 'straightOutlet': return `${t('tools.prefab.pipeComb.fab.draw.straightOutlet')} ${fmt(valueMm)}`;
      case 'arcDeveloped': return `${t('tools.prefab.pipeComb.fab.draw.arcDeveloped')} ${fmt(valueMm)}`;
      default: return fmt(valueMm);
    }
  };

  return (
    <div data-testid="pipe-comb-fab-drawing" className="space-y-2">
      <p className="text-[11px] font-medium text-[#F5F7FA]">{t('tools.prefab.pipeComb.fab.draw.title')}</p>
      <div className="overflow-x-auto rounded-md border border-[#232A36] bg-[#0E1117]">
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          className="block h-auto w-full min-w-[560px]"
          role="img"
          aria-label={t('tools.prefab.pipeComb.fab.draw.title')}
          data-projection={`tilt=${PROJECTION.tiltDeg};squash=${PROJECTION.squash}`}
        >
          {/* Reference planes (dashed). */}
          {drawing.referencePlanes.map((ref) => {
            const half = (drawing.bounds.max.y - drawing.bounds.min.y) * 0.62 + 20;
            const a = map({ x: ref.point.x - ref.direction.x * half, y: ref.point.y - ref.direction.y * half });
            const b = map({ x: ref.point.x + ref.direction.x * half, y: ref.point.y + ref.direction.y * half });
            const lp = map({ x: ref.point.x + ref.direction.x * (half + 6), y: ref.point.y + ref.direction.y * (half + 6) });
            return (
              <g key={ref.id} data-testid={`fab-draw-${ref.id}`}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#8a93a0" strokeWidth={0.8} strokeDasharray="6 4" />
                <text x={lp.x} y={lp.y} fill="#8a93a0" fontSize={13} fontWeight={700}>{ref.id}</text>
              </g>
            );
          })}

          {/* Pieces: solid finished, dashed allowance over-length. */}
          {drawing.segments.map((seg, i) => {
            const a = map(seg.from);
            const b = map(seg.to);
            return (
              <line
                key={`${seg.pieceId}-${i}`}
                data-testid={seg.finished ? `fab-draw-seg-${seg.pieceId}` : `fab-draw-allow-${seg.pieceId}`}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={seg.finished ? '#F5F7FA' : '#8a93a0'}
                strokeWidth={seg.finished ? 2.4 : 1}
                strokeDasharray={seg.finished ? undefined : '4 3'}
              />
            );
          })}

          {/* Elbow / bend arcs. */}
          {drawing.arcs.map((arc) => {
            const steps = Math.max(16, Math.ceil(Math.abs(arc.endRad - arc.startRad) / (Math.PI / 72)));
            const pts: string[] = [];
            for (let i = 0; i <= steps; i++) {
              const ang = arc.startRad + ((arc.endRad - arc.startRad) * i) / steps;
              const p = map({
                x: arc.center.x + arc.radiusMm * Math.cos(ang),
                y: arc.center.y + arc.radiusMm * Math.sin(ang),
              });
              pts.push(`${p.x},${p.y}`);
            }
            const midAng = (arc.startRad + arc.endRad) / 2;
            const lp = map({
              x: arc.center.x + arc.radiusMm * Math.cos(midAng),
              y: arc.center.y + arc.radiusMm * Math.sin(midAng),
            });
            return (
              <g key={arc.pieceId}>
                <polyline data-testid={`fab-draw-arc-${arc.pieceId}`} points={pts.join(' ')} fill="none" stroke="#F5F7FA" strokeWidth={2.4} />
                {!overviewIsDense && (
                  <text x={lp.x} y={lp.y - 6} fill="#F5F7FA" fontSize={12} fontWeight={700} textAnchor="middle">{arc.pieceId}</text>
                )}
              </g>
            );
          })}

          {/* Axis intersections E_i. */}
          {drawing.elbowDetails.map((det) => {
            const e = map(det.axisIntersection);
            return (
              <g key={`E${det.pipeNumber}`} data-testid={`fab-draw-E${det.pipeNumber}`}>
                <line x1={e.x - 5} y1={e.y} x2={e.x + 5} y2={e.y} stroke="#8a93a0" strokeWidth={0.8} />
                <line x1={e.x} y1={e.y - 5} x2={e.x} y2={e.y + 5} stroke="#8a93a0" strokeWidth={0.8} />
                {!overviewIsDense && (
                  <text x={e.x + 7} y={e.y - 4} fill="#8a93a0" fontSize={12}>{`E${det.pipeNumber}`}</text>
                )}
              </g>
            );
          })}

          {/* Joint markers: two ticks when g > 0. */}
          {drawing.joints.map((j) => {
            const a = map(j.pupFace);
            const b = map(j.elbowFace);
            const n = { x: -(b.y - a.y), y: b.x - a.x };
            const nl = Math.hypot(n.x, n.y) || 1;
            const off = 4;
            return (
              <g key={j.jointId} data-testid={`fab-draw-joint-${j.jointId}`} data-gap={j.gapMm}>
                <line x1={a.x - (n.x / nl) * off} y1={a.y - (n.y / nl) * off} x2={a.x + (n.x / nl) * off} y2={a.y + (n.y / nl) * off} stroke="#F5F7FA" strokeWidth={1.6} />
                {j.gapMm > 0 && (
                  <line x1={b.x - (n.x / nl) * off} y1={b.y - (n.y / nl) * off} x2={b.x + (n.x / nl) * off} y2={b.y + (n.y / nl) * off} stroke="#F5F7FA" strokeWidth={1.6} />
                )}
              </g>
            );
          })}

          {/* Dimensions. */}
          {drawing.dimensions.filter((dim) => !overviewIsDense).map((dim) => {
            const a = map(dim.from);
            const b = map(dim.to);
            const l = map(dim.labelAt);
            const dir = { x: b.x - a.x, y: b.y - a.y };
            const len = Math.hypot(dir.x, dir.y) || 1;
            const u = { x: dir.x / len, y: dir.y / len };
            const tStar = (l.x - a.x) * u.x + (l.y - a.y) * u.y;
            const proj = { x: a.x + u.x * tStar, y: a.y + u.y * tStar };
            const offVec = { x: l.x - proj.x, y: l.y - proj.y };
            const a2 = { x: a.x + offVec.x, y: a.y + offVec.y };
            const b2 = { x: b.x + offVec.x, y: b.y + offVec.y };
            return (
              <g key={dim.id} data-testid={`fab-draw-dim-${dim.id}`} data-value-mm={dim.valueMm}>
                <line x1={a.x} y1={a.y} x2={a2.x} y2={a2.y} stroke="#8a93a0" strokeWidth={0.5} />
                <line x1={b.x} y1={b.y} x2={b2.x} y2={b2.y} stroke="#8a93a0" strokeWidth={0.5} />
                <line x1={a2.x} y1={a2.y} x2={b2.x} y2={b2.y} stroke="#8a93a0" strokeWidth={0.5} />
                <text x={l.x} y={l.y} fill="#F5F7FA" fontSize={12} textAnchor="middle">{dimLabel(dim.measureKey, dim.ownerId, dim.valueMm)}</text>
              </g>
            );
          })}

          {/* Pup identifiers near segment midpoints. */}
          {drawing.segments.filter((s) => s.finished && !overviewIsDense).map((seg) => {
            const mid = map({ x: (seg.from.x + seg.to.x) / 2, y: (seg.from.y + seg.to.y) / 2 });
            return (
              <text key={`lbl-${seg.pieceId}`} x={mid.x} y={mid.y - 5} fill="#F5F7FA" fontSize={12} fontWeight={700} textAnchor="middle">
                {seg.pieceId}
              </text>
            );
          })}
        </svg>
      </div>
      <p className="text-[10px] text-[#A3A9B3]" data-testid="pipe-comb-fab-drawing-note">
        {t('tools.prefab.pipeComb.fab.draw.notToScale')} · {t('tools.prefab.pipeComb.fab.draw.projectionNote')}
      </p>
    </div>
  );
}
