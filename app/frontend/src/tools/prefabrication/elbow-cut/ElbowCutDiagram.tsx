import type { ElbowCutResult } from './engine';

interface ElbowCutDiagramProps {
  result: ElbowCutResult | null;
  placeholder: string;
  cutLabel: string;
  /** Localized, unit-aware length formatter supplied by the tool. */
  fmt: (v: number) => string;
}

export function ElbowCutDiagram({ result, placeholder, cutLabel, fmt }: ElbowCutDiagramProps) {
  if (!result) {
    return (
      <svg viewBox="0 0 400 300" className="w-full max-w-md">
        <text x="200" y="150" textAnchor="middle" fill="#A3A9B3" fontSize="12">
          {placeholder}
        </text>
      </svg>
    );
  }

  const { odMm, clrMm, totalAngleDeg, betaDeg, cutCenterlineMm } = result;

  const svgW = 400;
  const svgH = 320;
  const cx = 80;
  const cy = 260;
  // Scale so the elbow fits comfortably
  const maxR = clrMm + odMm / 2;
  const scale = Math.min((svgW - 120) / maxR, (svgH - 80) / maxR);

  const rOuter = (clrMm + odMm / 2) * scale;
  const rInner = Math.max((clrMm - odMm / 2) * scale, 0);
  const rCenter = clrMm * scale;

  const p = (r: number, deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
  };

  const outerStart = p(rOuter, 0);
  const outerEnd = p(rOuter, totalAngleDeg);
  const innerStart = p(rInner, 0);
  const innerEnd = p(rInner, totalAngleDeg);

  const cutOuter = p(rOuter, betaDeg);
  const cutInner = p(rInner, betaDeg);
  const cutCenter = p(rCenter, betaDeg);

  const arc = (r: number, startDeg: number, endDeg: number) => {
    const start = p(r, startDeg);
    const end = p(r, endDeg);
    const largeArc = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
  };

  const keptOutline = `
    M ${outerStart.x} ${outerStart.y}
    A ${rOuter} ${rOuter} 0 0 0 ${cutOuter.x} ${cutOuter.y}
    L ${cutInner.x} ${cutInner.y}
    A ${rInner} ${rInner} 0 0 1 ${innerStart.x} ${innerStart.y}
    Z`;

  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full max-w-md">
      {/* Original elbow outline (ghost) */}
      <path
        d={`
          M ${outerStart.x} ${outerStart.y}
          A ${rOuter} ${rOuter} 0 0 0 ${outerEnd.x} ${outerEnd.y}
          L ${innerEnd.x} ${innerEnd.y}
          A ${rInner} ${rInner} 0 0 1 ${innerStart.x} ${innerStart.y}
          Z`}
        fill="#232A36"
        stroke="#3A4454"
        strokeWidth={1}
      />
      {/* Kept section */}
      <path d={keptOutline} fill="#FF8C00" fillOpacity={0.15} stroke="#FF8C00" strokeWidth={2} />
      {/* Centerline arc */}
      <path d={arc(rCenter, 0, betaDeg)} fill="none" stroke="#F5F7FA" strokeWidth={1} strokeDasharray="4 4" />
      {/* Cut line */}
      <line
        x1={cutOuter.x}
        y1={cutOuter.y}
        x2={cutInner.x}
        y2={cutInner.y}
        stroke="#F5F7FA"
        strokeWidth={2}
      />
      {/* Labels */}
      <text x={cx + 10} y={cy - 10} fill="#A3A9B3" fontSize="10">
        R = {fmt(clrMm)}
      </text>
      <text x={outerStart.x + 8} y={outerStart.y - 6} fill="#A3A9B3" fontSize="10">
        OD
      </text>
      <text x={cutCenter.x + 10} y={cutCenter.y - 10} fill="#F5F7FA" fontSize="11">
        β = {betaDeg}°
      </text>
      <text x={cutCenter.x + 10} y={cutCenter.y + 6} fill="#FF8C00" fontSize="10">
        {cutLabel} = {fmt(cutCenterlineMm)}
      </text>
    </svg>
  );
}
