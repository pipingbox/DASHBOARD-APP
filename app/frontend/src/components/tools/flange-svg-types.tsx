import React from 'react';

// Shared types
interface FlangeSVGProps {
  spec: {
    od: number;
    pipeOD: number;
    rfDia: number;
    flangeThickness: number;
    boltCircleDiameter: number;
    boltHoleDiameter: number;
    rfHeight: number;
    boreDiameter?: number;
    socketDepth?: number;
    threadLength?: number;
    type: string;
  };
  scale: number;
  cx: number;
  cy: number;
  showDimensions: boolean;
  showCenter: boolean;
  showBoltHoles: boolean;
  showFill: boolean;
  fmt: (v: number) => string;
  unit: string;
}

function DimLine({
  x1, y1, x2, y2, label, color = '#f59e0b', fontSize = 9,
}: {
  x1: number; y1: number; x2: number; y2: number;
  label: string; color?: string; fontSize?: number;
}) {
  const isHorizontal = Math.abs(y2 - y1) < Math.abs(x2 - x1);
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const arrowSize = 4;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const ux = dx / len;
  const uy = dy / len;

  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="0.8" />
      <polygon
        points={`${x1},${y1} ${x1 + ux * arrowSize + uy * arrowSize * 0.5},${y1 + uy * arrowSize - ux * arrowSize * 0.5} ${x1 + ux * arrowSize - uy * arrowSize * 0.5},${y1 + uy * arrowSize + ux * arrowSize * 0.5}`}
        fill={color}
      />
      <polygon
        points={`${x2},${y2} ${x2 - ux * arrowSize + uy * arrowSize * 0.5},${y2 - uy * arrowSize - ux * arrowSize * 0.5} ${x2 - ux * arrowSize - uy * arrowSize * 0.5},${y2 - uy * arrowSize + ux * arrowSize * 0.5}`}
        fill={color}
      />
      <text
        x={isHorizontal ? midX : midX + 8}
        y={isHorizontal ? midY - 4 : midY + 3}
        fill={color} fontSize={fontSize} textAnchor="middle" fontWeight="bold" fontFamily="monospace"
      >
        {label}
      </text>
    </g>
  );
}

function ExtLine({ x, y, length, direction }: { x: number; y: number; length: number; direction: 'up' | 'down' | 'left' | 'right' }) {
  const x2 = direction === 'left' ? x - length : direction === 'right' ? x + length : x;
  const y2 = direction === 'up' ? y - length : direction === 'down' ? y + length : y;
  return <line x1={x} y1={y} x2={x2} y2={y2} stroke="#f59e0b" strokeWidth="0.4" opacity="0.7" />;
}

// ═══════════════════════════════════════════════════════════════
// SOCKET WELD FLANGE SVG
// ═══════════════════════════════════════════════════════════════

export function SocketWeldSVG({
  spec, scale, cx, cy, showDimensions, showCenter, showBoltHoles, showFill, fmt,
}: FlangeSVGProps) {
  const flangeR = (spec.od / 2) * scale;
  const pipeR = (spec.pipeOD / 2) * scale;
  const rfR = (spec.rfDia / 2) * scale;
  const thick = spec.flangeThickness * scale;
  const bcdR = (spec.boltCircleDiameter / 2) * scale;
  const boltHoleR = (spec.boltHoleDiameter / 2) * scale;
  const rfH = spec.rfHeight * scale * 2;
  const boreR = ((spec.boreDiameter || spec.pipeOD + 1.6) / 2) * scale;
  const socketD = (spec.socketDepth || spec.pipeOD * 0.6) * scale;
  const pipeStub = 30 * scale;

  const faceX = cx + thick / 2;
  const backX = cx - thick / 2;

  return (
    <g>
      {/* Pipe entering socket from left */}
      <rect x={backX - pipeStub} y={cy - pipeR} width={pipeStub} height={pipeR * 2}
        fill={showFill ? '#18181b' : 'none'} stroke="#52525b" strokeWidth="1" />

      {/* Flange body */}
      <rect x={backX} y={cy - flangeR} width={thick} height={flangeR * 2}
        fill={showFill ? '#27272a' : 'none'} stroke="#a1a1aa" strokeWidth="1.5" />

      {/* Socket bore (larger than pipe OD) */}
      <rect x={backX} y={cy - boreR} width={socketD} height={boreR * 2}
        fill={showFill ? '#0f0f0f' : 'none'} stroke="#71717a" strokeWidth="0.8" strokeDasharray="2 1" />

      {/* Socket shoulder */}
      <line x1={backX + socketD} y1={cy - boreR} x2={backX + socketD} y2={cy - pipeR * 0.6}
        stroke="#a1a1aa" strokeWidth="1" />
      <line x1={backX + socketD} y1={cy + boreR} x2={backX + socketD} y2={cy + pipeR * 0.6}
        stroke="#a1a1aa" strokeWidth="1" />

      {/* Inner bore */}
      <rect x={backX + socketD} y={cy - pipeR * 0.6} width={thick - socketD} height={pipeR * 1.2}
        fill={showFill ? '#0a0a0a' : 'none'} stroke="#52525b" strokeWidth="0.5" />

      {/* Fillet weld at back face */}
      <path d={`M ${backX} ${cy - pipeR - 2} Q ${backX - 4} ${cy - pipeR} ${backX - 4} ${cy - pipeR + 4}`}
        fill="none" stroke="#f97316" strokeWidth="1.5" />
      <path d={`M ${backX} ${cy + pipeR + 2} Q ${backX - 4} ${cy + pipeR} ${backX - 4} ${cy + pipeR - 4}`}
        fill="none" stroke="#f97316" strokeWidth="1.5" />

      {/* 1/16 inch gap indicator */}
      <line x1={backX + socketD - 1} y1={cy - boreR + 2} x2={backX + socketD - 1} y2={cy + boreR - 2}
        stroke="#f59e0b" strokeWidth="0.5" strokeDasharray="1 1" />

      {/* Raised face */}
      <rect x={faceX} y={cy - rfR} width={rfH} height={rfR * 2}
        fill={showFill ? '#22d3ee10' : 'none'} stroke="#22d3ee" strokeWidth="1" />

      {/* Bolt holes */}
      {showBoltHoles && (
        <>
          <circle cx={cx} cy={cy - bcdR} r={boltHoleR} fill="#18181b" stroke="#f59e0b" strokeWidth="0.8" />
          <circle cx={cx} cy={cy + bcdR} r={boltHoleR} fill="#18181b" stroke="#f59e0b" strokeWidth="0.8" />
        </>
      )}

      {/* Center line */}
      {showCenter && (
        <line x1={backX - pipeStub - 10} y1={cy} x2={faceX + rfH + 10} y2={cy}
          stroke="#52525b" strokeWidth="0.6" strokeDasharray="4 2" />
      )}

      {/* Dimensions */}
      {showDimensions && (
        <>
          <ExtLine x={faceX + rfH + 5} y={cy - flangeR} length={15} direction="right" />
          <ExtLine x={faceX + rfH + 5} y={cy + flangeR} length={15} direction="right" />
          <DimLine
            x1={faceX + rfH + 18} y1={cy - flangeR}
            x2={faceX + rfH + 18} y2={cy + flangeR}
            label={`Ø${fmt(spec.od)}`} color="#f59e0b"
          />

          <ExtLine x={backX} y={cy + flangeR + 5} length={12} direction="down" />
          <ExtLine x={faceX} y={cy + flangeR + 5} length={12} direction="down" />
          <DimLine
            x1={backX} y1={cy + flangeR + 15}
            x2={faceX} y2={cy + flangeR + 15}
            label={`T=${fmt(spec.flangeThickness)}`} color="#3ea6ff"
          />

          {/* Socket depth — highlighted in amber as advance */}
          <ExtLine x={backX} y={cy - flangeR - 5} length={8} direction="up" />
          <ExtLine x={backX + socketD} y={cy - flangeR - 5} length={8} direction="up" />
          <DimLine
            x1={backX} y1={cy - flangeR - 12}
            x2={backX + socketD} y2={cy - flangeR - 12}
            label={`SD=${fmt(spec.socketDepth || spec.pipeOD * 0.6)}`} color="#f59e0b"
          />

          <text x={backX + socketD / 2} y={cy + boreR + 8}
            fill="#71717a" fontSize="7" textAnchor="middle" fontFamily="monospace">
            Bore Ø{fmt(spec.boreDiameter || spec.pipeOD + 1.6)}
          </text>

          <text x={backX - pipeStub / 2} y={cy - pipeR - 6}
            fill="#a1a1aa" fontSize="8" textAnchor="middle" fontFamily="monospace">
            OD {fmt(spec.pipeOD)}
          </text>

          {showBoltHoles && (
            <text x={cx + 2} y={cy - bcdR - 5}
              fill="#f59e0b" fontSize="7" textAnchor="middle" fontFamily="monospace">
              BCD {fmt(spec.boltCircleDiameter)}
            </text>
          )}

          <text x={faceX + rfH + 4} y={cy + rfR + 10}
            fill="#22d3ee" fontSize="7" textAnchor="start" fontFamily="monospace">
            RF Ø{fmt(spec.rfDia)}
          </text>
        </>
      )}
    </g>
  );
}

// ═══════════════════════════════════════════════════════════════
// THREADED FLANGE SVG
// ═══════════════════════════════════════════════════════════════

export function ThreadedSVG({
  spec, scale, cx, cy, showDimensions, showCenter, showBoltHoles, showFill, fmt,
}: FlangeSVGProps) {
  const flangeR = (spec.od / 2) * scale;
  const pipeR = (spec.pipeOD / 2) * scale;
  const rfR = (spec.rfDia / 2) * scale;
  const thick = spec.flangeThickness * scale;
  const bcdR = (spec.boltCircleDiameter / 2) * scale;
  const boltHoleR = (spec.boltHoleDiameter / 2) * scale;
  const rfH = spec.rfHeight * scale * 2;
  const boreR = ((spec.boreDiameter || spec.pipeOD - 2) / 2) * scale;
  const threadL = (spec.threadLength || spec.pipeOD * 0.5) * scale;
  const pipeStub = 30 * scale;

  const faceX = cx + thick / 2;
  const backX = cx - thick / 2;

  // Thread lines (zigzag pattern)
  const threadLines: React.ReactElement[] = [];
  const threadPitch = 2.5;
  const numThreads = Math.floor(threadL / threadPitch);
  for (let i = 0; i < numThreads; i++) {
    const tx = backX + i * threadPitch;
    threadLines.push(
      <line key={`tt${i}`}
        x1={tx} y1={cy - boreR - 1}
        x2={tx + threadPitch * 0.5} y2={cy - boreR + 1}
        stroke="#a78bfa" strokeWidth="0.6"
      />
    );
    threadLines.push(
      <line key={`tb${i}`}
        x1={tx} y1={cy + boreR + 1}
        x2={tx + threadPitch * 0.5} y2={cy + boreR - 1}
        stroke="#a78bfa" strokeWidth="0.6"
      />
    );
  }

  return (
    <g>
      {/* Pipe approaching from left */}
      <rect x={backX - pipeStub} y={cy - pipeR} width={pipeStub} height={pipeR * 2}
        fill={showFill ? '#18181b' : 'none'} stroke="#52525b" strokeWidth="1" />

      {/* Flange body */}
      <rect x={backX} y={cy - flangeR} width={thick} height={flangeR * 2}
        fill={showFill ? '#27272a' : 'none'} stroke="#a1a1aa" strokeWidth="1.5" />

      {/* Threaded bore */}
      <rect x={backX} y={cy - boreR} width={threadL} height={boreR * 2}
        fill={showFill ? '#0f0f0f' : 'none'} stroke="#a78bfa" strokeWidth="0.8" />

      {/* Thread pattern */}
      {threadLines}

      {/* Through bore after threads */}
      <rect x={backX + threadL} y={cy - boreR * 0.8} width={thick - threadL} height={boreR * 1.6}
        fill={showFill ? '#0a0a0a' : 'none'} stroke="#52525b" strokeWidth="0.5" />

      {/* Thread engagement end */}
      <line x1={backX + threadL} y1={cy - boreR} x2={backX + threadL} y2={cy + boreR}
        stroke="#a78bfa" strokeWidth="0.8" strokeDasharray="2 1" />

      {/* Raised face */}
      <rect x={faceX} y={cy - rfR} width={rfH} height={rfR * 2}
        fill={showFill ? '#22d3ee10' : 'none'} stroke="#22d3ee" strokeWidth="1" />

      {/* Bolt holes */}
      {showBoltHoles && (
        <>
          <circle cx={cx} cy={cy - bcdR} r={boltHoleR} fill="#18181b" stroke="#f59e0b" strokeWidth="0.8" />
          <circle cx={cx} cy={cy + bcdR} r={boltHoleR} fill="#18181b" stroke="#f59e0b" strokeWidth="0.8" />
        </>
      )}

      {/* Center line */}
      {showCenter && (
        <line x1={backX - pipeStub - 10} y1={cy} x2={faceX + rfH + 10} y2={cy}
          stroke="#52525b" strokeWidth="0.6" strokeDasharray="4 2" />
      )}

      {/* Dimensions */}
      {showDimensions && (
        <>
          <ExtLine x={faceX + rfH + 5} y={cy - flangeR} length={15} direction="right" />
          <ExtLine x={faceX + rfH + 5} y={cy + flangeR} length={15} direction="right" />
          <DimLine
            x1={faceX + rfH + 18} y1={cy - flangeR}
            x2={faceX + rfH + 18} y2={cy + flangeR}
            label={`Ø${fmt(spec.od)}`} color="#f59e0b"
          />

          <ExtLine x={backX} y={cy + flangeR + 5} length={12} direction="down" />
          <ExtLine x={faceX} y={cy + flangeR + 5} length={12} direction="down" />
          <DimLine
            x1={backX} y1={cy + flangeR + 15}
            x2={faceX} y2={cy + flangeR + 15}
            label={`T=${fmt(spec.flangeThickness)}`} color="#3ea6ff"
          />

          {/* Thread length — highlighted in amber as advance */}
          <ExtLine x={backX} y={cy - flangeR - 5} length={8} direction="up" />
          <ExtLine x={backX + threadL} y={cy - flangeR - 5} length={8} direction="up" />
          <DimLine
            x1={backX} y1={cy - flangeR - 12}
            x2={backX + threadL} y2={cy - flangeR - 12}
            label={`TL=${fmt(spec.threadLength || spec.pipeOD * 0.5)}`} color="#f59e0b"
          />

          <text x={backX + threadL / 2} y={cy + boreR + 8}
            fill="#a78bfa" fontSize="7" textAnchor="middle" fontFamily="monospace">
            Bore Ø{fmt(spec.boreDiameter || spec.pipeOD - 2)}
          </text>

          <text x={backX - pipeStub / 2} y={cy - pipeR - 6}
            fill="#a1a1aa" fontSize="8" textAnchor="middle" fontFamily="monospace">
            OD {fmt(spec.pipeOD)}
          </text>

          {showBoltHoles && (
            <text x={cx + 2} y={cy - bcdR - 5}
              fill="#f59e0b" fontSize="7" textAnchor="middle" fontFamily="monospace">
              BCD {fmt(spec.boltCircleDiameter)}
            </text>
          )}

          <text x={faceX + rfH + 4} y={cy + rfR + 10}
            fill="#22d3ee" fontSize="7" textAnchor="start" fontFamily="monospace">
            RF Ø{fmt(spec.rfDia)}
          </text>
        </>
      )}
    </g>
  );
}

// ═══════════════════════════════════════════════════════════════
// LAP JOINT FLANGE SVG
// ═══════════════════════════════════════════════════════════════

export function LapJointSVG({
  spec, scale, cx, cy, showDimensions, showCenter, showBoltHoles, showFill, fmt,
}: FlangeSVGProps) {
  const flangeR = (spec.od / 2) * scale;
  const pipeR = (spec.pipeOD / 2) * scale;
  const rfR = (spec.rfDia / 2) * scale;
  const thick = spec.flangeThickness * scale;
  const bcdR = (spec.boltCircleDiameter / 2) * scale;
  const boltHoleR = (spec.boltHoleDiameter / 2) * scale;
  const boreR = ((spec.boreDiameter || spec.pipeOD + 3) / 2) * scale;
  const pipeStub = 30 * scale;
  const lapWidth = 8 * scale;
  const stubEndR = rfR;

  const faceX = cx + thick / 2;
  const backX = cx - thick / 2;

  return (
    <g>
      {/* Pipe stub extending left */}
      <rect x={backX - pipeStub} y={cy - pipeR} width={pipeStub + thick + 5} height={pipeR * 2}
        fill={showFill ? '#18181b' : 'none'} stroke="#52525b" strokeWidth="1" />

      {/* Flange body (flat face backing flange) */}
      <rect x={backX} y={cy - flangeR} width={thick} height={flangeR * 2}
        fill={showFill ? '#27272a' : 'none'} stroke="#a1a1aa" strokeWidth="1.5" />

      {/* Large bore (flange slips over pipe freely) */}
      <rect x={backX + 1} y={cy - boreR} width={thick - 2} height={boreR * 2}
        fill={showFill ? '#0a0a0a' : 'none'} stroke="#52525b" strokeWidth="0.5" strokeDasharray="2 1" />

      {/* Stub end lap */}
      <rect x={faceX} y={cy - stubEndR} width={lapWidth} height={stubEndR * 2}
        fill={showFill ? '#3f3f46' : 'none'} stroke="#10b981" strokeWidth="1.5" />

      {/* Stub end pipe continuation */}
      <rect x={faceX + lapWidth} y={cy - pipeR} width={pipeStub * 0.5} height={pipeR * 2}
        fill={showFill ? '#18181b' : 'none'} stroke="#52525b" strokeWidth="1" />

      {/* Butt weld between stub end and pipe */}
      <line x1={faceX + lapWidth + pipeStub * 0.5} y1={cy - pipeR - 1}
        x2={faceX + lapWidth + pipeStub * 0.5} y2={cy - pipeR + 3}
        stroke="#f97316" strokeWidth="1.5" />
      <line x1={faceX + lapWidth + pipeStub * 0.5} y1={cy + pipeR + 1}
        x2={faceX + lapWidth + pipeStub * 0.5} y2={cy + pipeR - 3}
        stroke="#f97316" strokeWidth="1.5" />

      {/* Gap between flange and stub end */}
      <line x1={faceX - 0.5} y1={cy - stubEndR + 2} x2={faceX - 0.5} y2={cy + stubEndR - 2}
        stroke="#10b981" strokeWidth="0.4" strokeDasharray="1 1" />

      {/* Bolt holes */}
      {showBoltHoles && (
        <>
          <circle cx={cx} cy={cy - bcdR} r={boltHoleR} fill="#18181b" stroke="#f59e0b" strokeWidth="0.8" />
          <circle cx={cx} cy={cy + bcdR} r={boltHoleR} fill="#18181b" stroke="#f59e0b" strokeWidth="0.8" />
        </>
      )}

      {/* Center line */}
      {showCenter && (
        <line x1={backX - pipeStub - 10} y1={cy} x2={faceX + lapWidth + pipeStub * 0.5 + 10} y2={cy}
          stroke="#52525b" strokeWidth="0.6" strokeDasharray="4 2" />
      )}

      {/* Dimensions */}
      {showDimensions && (
        <>
          <ExtLine x={faceX + lapWidth + 5} y={cy - flangeR} length={20} direction="right" />
          <ExtLine x={faceX + lapWidth + 5} y={cy + flangeR} length={20} direction="right" />
          <DimLine
            x1={faceX + lapWidth + 22} y1={cy - flangeR}
            x2={faceX + lapWidth + 22} y2={cy + flangeR}
            label={`Ø${fmt(spec.od)}`} color="#f59e0b"
          />

          <ExtLine x={backX} y={cy + flangeR + 5} length={12} direction="down" />
          <ExtLine x={faceX} y={cy + flangeR + 5} length={12} direction="down" />
          <DimLine
            x1={backX} y1={cy + flangeR + 15}
            x2={faceX} y2={cy + flangeR + 15}
            label={`T=${fmt(spec.flangeThickness)}`} color="#3ea6ff"
          />

          {/* Lap width — highlighted in amber as advance */}
          <ExtLine x={faceX} y={cy - flangeR - 5} length={8} direction="up" />
          <ExtLine x={faceX + lapWidth} y={cy - flangeR - 5} length={8} direction="up" />
          <DimLine
            x1={faceX} y1={cy - flangeR - 12}
            x2={faceX + lapWidth} y2={cy - flangeR - 12}
            label="Lap" color="#f59e0b"
          />

          {/* Stub end label */}
          <text x={faceX + lapWidth / 2} y={cy - stubEndR - 5}
            fill="#10b981" fontSize="7" textAnchor="middle" fontFamily="monospace">
            Stub End
          </text>

          <text x={cx} y={cy + boreR + 8}
            fill="#71717a" fontSize="7" textAnchor="middle" fontFamily="monospace">
            Bore Ø{fmt(spec.boreDiameter || spec.pipeOD + 3)}
          </text>

          <text x={backX - pipeStub / 2} y={cy - pipeR - 6}
            fill="#a1a1aa" fontSize="8" textAnchor="middle" fontFamily="monospace">
            OD {fmt(spec.pipeOD)}
          </text>

          {showBoltHoles && (
            <text x={cx + 2} y={cy - bcdR - 5}
              fill="#f59e0b" fontSize="7" textAnchor="middle" fontFamily="monospace">
              BCD {fmt(spec.boltCircleDiameter)}
            </text>
          )}
        </>
      )}
    </g>
  );
}