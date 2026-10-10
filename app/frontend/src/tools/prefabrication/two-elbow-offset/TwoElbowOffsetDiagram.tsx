import { useEffect, useRef, useState } from 'react';
import type {
  DiagramDimension,
  DiagramPoint,
  TwoElbowOffsetDiagramModel,
} from './two-elbow-offset-diagram.ts';

/**
 * PB-PIPE-COMB-CORRECTION-001 / P4 — SVG renderer for the two-elbow offset
 * diagram model. Pure presentation: all geometry comes from the model (mm
 * space); this component only scales, strokes and places labels.
 *
 * Visual contract:
 *   - Physical assembly (elbow–straight–elbow): orange, thick.
 *   - Reference straight run: neutral, medium.
 *   - Entry/exit stubs (decorative, NOT pipe to cut): dark, thin.
 *   - Theoretical axes through the intersection points: dashed.
 *   - Dimensions with explicit extension lines and arrowheads.
 *   - Legibility floor: the effective on-screen text size never drops
 *     below MIN_EFFECTIVE_FONT_CSS_PX. On narrow viewports the drawing
 *     keeps its scale and scrolls horizontally inside its container
 *     instead of shrinking annotations below the readable threshold.
 */

/** Minimum effective (on-screen) text size in CSS pixels. The renderer adds
 * a small tolerance so sub-pixel layout rounding never dips below it. */
const MIN_EFFECTIVE_FONT_CSS_PX = 11;
const MIN_EFFECTIVE_FONT_EPS_PX = 0.25;

const COLORS = {
  assembly: '#FF8C00',
  reference: '#A3A9B3',
  stub: '#3A4454',
  theoretical: '#566074',
  dim: '#7C8694',
  dimText: '#A3A9B3',
  marker: '#F5F7FA',
  id: '#A3A9B3',
};

interface TwoElbowOffsetDiagramViewProps {
  model: TwoElbowOffsetDiagramModel;
  /** Localized, unit-aware text for a dimension (label + formatted value). */
  dimText: (dim: DiagramDimension) => string;
  /** Localized angle annotation (e.g. "θ = 45°"). */
  angleText: (deg: number) => string;
  /** Localized line identifier (e.g. "L1"). */
  lineText: (id: string) => string;
}

function pointsAttr(points: DiagramPoint[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(' ');
}

function Arrow({ at, dir, size }: { at: DiagramPoint; dir: DiagramPoint; size: number }) {
  const n = Math.hypot(dir.x, dir.y) || 1;
  const ux = dir.x / n;
  const uy = dir.y / n;
  const px = -uy;
  const py = ux;
  const p1 = `${at.x},${at.y}`;
  const p2 = `${at.x - ux * size + px * size * 0.45},${at.y - uy * size + py * size * 0.45}`;
  const p3 = `${at.x - ux * size - px * size * 0.45},${at.y - uy * size - py * size * 0.45}`;
  return <polygon points={`${p1} ${p2} ${p3}`} fill={COLORS.dim} />;
}

function DimensionView({ dim, text, fontH }: { dim: DiagramDimension; text: string; fontH: number }) {
  const arrow = fontH * 0.5;
  const over = fontH * 0.45;

  let ux: number;
  let uy: number;
  let nx: number;
  let ny: number;
  if (dim.kind === 'vertical') {
    ux = 0;
    uy = Math.sign(dim.to.y - dim.from.y) || 1;
    nx = Math.sign(dim.lane) || 1;
    ny = 0;
  } else if (dim.kind === 'horizontal') {
    ux = Math.sign(dim.to.x - dim.from.x) || 1;
    uy = 0;
    nx = 0;
    ny = Math.sign(dim.lane) || 1;
  } else {
    const dx = dim.to.x - dim.from.x;
    const dy = dim.to.y - dim.from.y;
    const len = Math.hypot(dx, dy) || 1;
    ux = dx / len;
    uy = dy / len;
    const lane = Math.sign(dim.lane) || 1;
    nx = (-dy / len) * lane;
    ny = (dx / len) * lane;
  }
  const laneAbs = Math.abs(dim.lane);
  const a = { x: dim.from.x + nx * laneAbs, y: dim.from.y + ny * laneAbs };
  const b = { x: dim.to.x + nx * laneAbs, y: dim.to.y + ny * laneAbs };
  // Label position along the dimension line (default: middle).
  const at = dim.labelAt ?? 0.5;
  const pos = { x: a.x + (b.x - a.x) * at, y: a.y + (b.y - a.y) * at };

  const common = { fill: COLORS.dimText, fontSize: fontH } as const;

  return (
    <g>
      {/* extension lines from the measured element to the dimension line */}
      <line
        x1={dim.from.x}
        y1={dim.from.y}
        x2={dim.from.x + nx * (laneAbs + over)}
        y2={dim.from.y + ny * (laneAbs + over)}
        stroke={COLORS.stub}
        strokeWidth={fontH * 0.07}
      />
      <line
        x1={dim.to.x}
        y1={dim.to.y}
        x2={dim.to.x + nx * (laneAbs + over)}
        y2={dim.to.y + ny * (laneAbs + over)}
        stroke={COLORS.stub}
        strokeWidth={fontH * 0.07}
      />
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={COLORS.dim} strokeWidth={fontH * 0.09} />
      <Arrow at={a} dir={{ x: -ux, y: -uy }} size={arrow} />
      <Arrow at={b} dir={{ x: ux, y: uy }} size={arrow} />
      {dim.kind === 'vertical' ? (
        /* Vertical dimensions are lettered ALONG the dimension line
           (technical-drawing convention): the long localized label runs
           vertically, so it never spills past the left/right SVG edges. */
        <text
          x={a.x + nx * fontH * 0.75}
          y={pos.y}
          textAnchor="middle"
          dominantBaseline="middle"
          transform={`rotate(-90 ${a.x + nx * fontH * 0.75} ${pos.y})`}
          {...common}
        >
          {text}
        </text>
      ) : (
        <text
          x={pos.x + nx * fontH * 0.5}
          y={pos.y + ny * fontH * 0.9 + fontH * 0.3}
          textAnchor="middle"
          {...common}
        >
          {text}
        </text>
      )}
    </g>
  );
}

export default function TwoElbowOffsetDiagramView({
  model,
  dimText,
  angleText,
  lineText,
}: TwoElbowOffsetDiagramViewProps) {
  const { bounds } = model;
  const w = Math.max(bounds.maxX - bounds.minX, 1);
  const h = Math.max(bounds.maxY - bounds.minY, 1);
  const maxLane = model.dimensions.reduce((m, d) => Math.max(m, Math.abs(d.lane)), 0);

  const fontH = Math.min(h / 22, w / 34);
  // Dimension labels: vertical ones are lettered along their dimension line
  // (technical-drawing convention), so the horizontal reserve only needs to
  // cover the rotated label height, the line identifiers and the arrow
  // clearance — not a full horizontal label width.
  const margin = maxLane + fontH * 4;
  const vx = bounds.minX - margin;
  const vy = bounds.minY - margin;
  const vw = w + 2 * margin;
  const vh = h + 2 * margin;

  // Effective legibility floor: rendered text must stay >= 11 CSS px.
  // scale = renderedWidth / vw, so the minimum rendered width that keeps
  // fontH readable is MIN_EFFECTIVE_FONT_CSS_PX * vw / fontH. Below that
  // container width the SVG keeps its minimum width and the wrapper
  // scrolls horizontally — the drawing is never shrunk into illegibility.
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const minRenderedWidth = ((MIN_EFFECTIVE_FONT_CSS_PX + MIN_EFFECTIVE_FONT_EPS_PX) * vw) / fontH;
  const renderedWidth = containerWidth === null ? null : Math.max(containerWidth, minRenderedWidth);
  const widthAttr = renderedWidth === null ? '100%' : renderedWidth;
  const heightAttr = renderedWidth === null ? undefined : (renderedWidth * vh) / vw;

  return (
    <div ref={containerRef} className="overflow-x-auto">
      <svg
        viewBox={`${vx} ${vy} ${vw} ${vh}`}
        width={widthAttr}
        height={heightAttr}
        role="img"
        aria-label="two-elbow-offset-diagram"
        data-testid="two-elbow-offset-diagram"
        data-min-effective-font-px={MIN_EFFECTIVE_FONT_CSS_PX}
      >
      {/* entry/exit stubs: decorative continuations, NOT pipe to cut */}
      {model.lines.map((line) => (
        <g key={`stubs-${line.id}`}>
          {line.entryStub && (
            <line
              x1={line.entryStub.from.x}
              y1={line.entryStub.from.y}
              x2={line.entryStub.to.x}
              y2={line.entryStub.to.y}
              stroke={COLORS.stub}
              strokeWidth={fontH * 0.14}
            />
          )}
          {line.exitStub && (
            <line
              x1={line.exitStub.from.x}
              y1={line.exitStub.from.y}
              x2={line.exitStub.to.x}
              y2={line.exitStub.to.y}
              stroke={COLORS.stub}
              strokeWidth={fontH * 0.14}
            />
          )}
        </g>
      ))}

      {/* theoretical axes through the intersection points (dashed) */}
      {model.lines.map((line) =>
        line.theoretical ? (
          <g key={`th-${line.id}`} stroke={COLORS.theoretical} strokeWidth={fontH * 0.08} strokeDasharray={`${fontH * 0.4} ${fontH * 0.28}`}>
            <line x1={line.theoretical.entryAxis.from.x} y1={line.theoretical.entryAxis.from.y} x2={line.theoretical.entryAxis.to.x} y2={line.theoretical.entryAxis.to.y} />
            <line x1={line.theoretical.diagonalAxis.from.x} y1={line.theoretical.diagonalAxis.from.y} x2={line.theoretical.diagonalAxis.to.x} y2={line.theoretical.diagonalAxis.to.y} />
            <line x1={line.theoretical.exitAxis.from.x} y1={line.theoretical.exitAxis.from.y} x2={line.theoretical.exitAxis.to.x} y2={line.theoretical.exitAxis.to.y} />
          </g>
        ) : null,
      )}

      {/* physical pieces */}
      {model.lines.map((line) => (
        <g key={`phys-${line.id}`}>
          {line.straightRun && (
            <line
              x1={line.straightRun.from.x}
              y1={line.straightRun.from.y}
              x2={line.straightRun.to.x}
              y2={line.straightRun.to.y}
              stroke={COLORS.reference}
              strokeWidth={fontH * 0.2}
              strokeLinecap="round"
            />
          )}
          {line.assembly.length > 1 && (
            <polyline
              points={pointsAttr(line.assembly)}
              fill="none"
              stroke={COLORS.assembly}
              strokeWidth={fontH * 0.22}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {line.pi1 && <circle cx={line.pi1.x} cy={line.pi1.y} r={fontH * 0.17} fill={COLORS.marker} />}
          {line.pi2 && <circle cx={line.pi2.x} cy={line.pi2.y} r={fontH * 0.17} fill={COLORS.marker} />}
          {line.tangentPoints.map((p, k) => (
            <circle key={k} cx={p.x} cy={p.y} r={fontH * 0.11} fill={COLORS.dimText} />
          ))}
        </g>
      ))}

      {/* angle mark at the representative PI1 */}
      {model.angleMark &&
        (() => {
          const am = model.angleMark;
          const start = { x: am.at.x + am.radiusMm * am.fromDir.x, y: am.at.y + am.radiusMm * am.fromDir.y };
          const end = { x: am.at.x + am.radiusMm * am.toDir.x, y: am.at.y + am.radiusMm * am.toDir.y };
          const sweep = am.toDir.y >= 0 ? 1 : 0;
          const bis = {
            x: am.fromDir.x + am.toDir.x,
            y: am.fromDir.y + am.toDir.y,
          };
          const bn = Math.hypot(bis.x, bis.y) || 1;
          const labelAt = {
            x: am.at.x + (bis.x / bn) * (am.radiusMm + fontH * 0.9),
            y: am.at.y + (bis.y / bn) * (am.radiusMm + fontH * 0.9) + fontH * 0.3,
          };
          return (
            <g>
              <path
                d={`M ${start.x} ${start.y} A ${am.radiusMm} ${am.radiusMm} 0 0 ${sweep} ${end.x} ${end.y}`}
                fill="none"
                stroke={COLORS.dim}
                strokeWidth={fontH * 0.09}
              />
              <text x={labelAt.x} y={labelAt.y} textAnchor="middle" fill={COLORS.dimText} fontSize={fontH}>
                {angleText(am.angleDeg)}
              </text>
            </g>
          );
        })()}

      {/* dimensions */}
      {model.dimensions.map((dim, i) => (
        <DimensionView key={i} dim={dim} text={dimText(dim)} fontH={fontH} />
      ))}

      {/* line identifiers, related to the results table. Placed inside the
          drawing just above each entry stub: the outer left lane belongs to
          the rotated spacing dimension, and stacking IDs there collides on
          crowded assemblies (N=12). */}
      {model.lines.map((line) => {
        const y = line.straightRun?.from.y ?? line.entryStub?.from.y ?? 0;
        return (
          <text
            key={`id-${line.id}`}
            x={bounds.minX + fontH * 0.5}
            y={y - fontH * 0.35}
            textAnchor="start"
            fill={COLORS.id}
            fontSize={fontH}
          >
            {lineText(line.id)}
          </text>
        );
      })}
      </svg>
    </div>
  );
}
