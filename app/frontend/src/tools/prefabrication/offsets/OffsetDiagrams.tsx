interface OffsetWithElbowsDiagramProps {
  a: number;
  b: number;
  h: number;
  thetaDeg: number;
}

export function OffsetWithElbowsDiagram({ a, b, h, thetaDeg }: OffsetWithElbowsDiagramProps) {
  const svgW = 360;
  const svgH = 260;
  const padding = 40;
  const max = Math.max(a, b, h);
  const scale = Math.min((svgW - 2 * padding) / a, (svgH - 2 * padding) / b) * 0.85;

  const x0 = padding;
  const y0 = svgH - padding;
  const x1 = x0 + a * scale;
  const y1 = y0 - b * scale;

  // Draw right triangle, two small elbow arcs at ends, straight segment
  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full max-w-md">
      {/* triangle legs */}
      <line x1={x0} y1={y0} x2={x1} y2={y0} stroke="#3A4454" strokeWidth={1} />
      <line x1={x1} y1={y0} x2={x1} y2={y1} stroke="#3A4454" strokeWidth={1} />
      {/* diagonal / center-to-center */}
      <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="#FF8C00" strokeWidth={2} />
      {/* end elbow ticks */}
      <circle cx={x0} cy={y0} r={4} fill="#FF8C00" />
      <circle cx={x1} cy={y1} r={4} fill="#FF8C00" />
      {/* labels */}
      <text x={(x0 + x1) / 2} y={y0 + 16} textAnchor="middle" fill="#A3A9B3" fontSize="10">A</text>
      <text x={x1 + 14} y={(y0 + y1) / 2} fill="#A3A9B3" fontSize="10">B</text>
      <text x={(x0 + x1) / 2 - 20} y={(y0 + y1) / 2 - 10} fill="#F5F7FA" fontSize="11">H = {h.toFixed(1)}</text>
      <text x={x0 + 8} y={y0 - 12} fill="#F5F7FA" fontSize="10">θ = {thetaDeg.toFixed(1)}°</text>
    </svg>
  );
}

export function OffsetWithoutElbowsDiagram({ a, b, h, thetaDeg }: OffsetWithElbowsDiagramProps) {
  const svgW = 360;
  const svgH = 200;
  const padding = 40;
  const scale = Math.min((svgW - 2 * padding) / a, (svgH - 2 * padding) / b) * 0.85;

  const x0 = padding;
  const y0 = svgH - padding;
  const x1 = x0 + a * scale;
  const y1 = y0 - b * scale;

  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full max-w-md">
      {/* fabricated pipe */}
      <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="#FF8C00" strokeWidth={14} strokeLinecap="butt" />
      <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="#151A22" strokeWidth={10} strokeLinecap="butt" />
      {/* end cut marks */}
      <line x1={x0 - 8} y1={y0} x2={x0 + 8} y2={y0} stroke="#F5F7FA" strokeWidth={1} />
      <line x1={x1 - 8} y1={y1} x2={x1 + 8} y2={y1} stroke="#F5F7FA" strokeWidth={1} />
      <text x={(x0 + x1) / 2} y={(y0 + y1) / 2 - 12} fill="#F5F7FA" fontSize="11" textAnchor="middle">
        H = {h.toFixed(1)} · θ = {thetaDeg.toFixed(1)}°
      </text>
    </svg>
  );
}

export function OffsetVerificationDiagram({ a, b, h, thetaDeg }: OffsetWithElbowsDiagramProps) {
  return <OffsetWithElbowsDiagram a={a} b={b} h={h} thetaDeg={thetaDeg} />;
}
