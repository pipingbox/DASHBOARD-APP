import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowRightLeft, AlertTriangle, Ruler, Link2, BookOpen, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase, TABLES } from '@/lib/supabase';
import { SocketWeldSVG, ThreadedSVG, LapJointSVG } from './flange-svg-types';

// ═══════════════════════════════════════════════════════════════
// FLANGE DATA (ASME B16.5)
// ═══════════════════════════════════════════════════════════════

type FlangeType = 'WN' | 'SO' | 'BL' | 'SW' | 'THR' | 'LJ';

interface FlangeSpec {
  type: FlangeType;
  typeLabel: string;
  nps: string;
  pipeOD: number;
  od: number;
  flangeThickness: number;
  boltCircleDiameter: number;
  numBolts: number;
  boltHoleDiameter: number;
  boltSize: string;
  hubDiameterEnd?: number;
  hubDiameterBase?: number;
  hubLength?: number;
  boreDiameter?: number;
  rfDia: number;
  rfHeight: number;
  weight: number;
  socketDepth?: number;
  threadLength?: number;
}

// Data for all six flange types
const generateFlangeSpecs = (
  nps: string,
  pipeOD: number,
  od: number,
  thickness: number,
  bcd: number,
  bolts: number,
  boltDia: string,
  boltHoleDia: number,
  rfDia: number,
  hubLength: number,
  weight: number
): FlangeSpec[] => {
  const bore = pipeOD - 2 * 7.1;
  return [
    {
      type: 'WN', typeLabel: 'Weld Neck', nps, pipeOD, od, flangeThickness: thickness,
      boltCircleDiameter: bcd, numBolts: bolts, boltHoleDiameter: boltHoleDia, boltSize: boltDia,
      hubDiameterEnd: pipeOD + 6, hubDiameterBase: pipeOD + 20, hubLength,
      boreDiameter: bore > 0 ? bore : pipeOD * 0.8, rfDia, rfHeight: 1.6, weight,
    },
    {
      type: 'SO', typeLabel: 'Slip-On', nps, pipeOD, od, flangeThickness: thickness,
      boltCircleDiameter: bcd, numBolts: bolts, boltHoleDiameter: boltHoleDia, boltSize: boltDia,
      hubLength: hubLength * 0.6, boreDiameter: pipeOD + 1.6, rfDia, rfHeight: 1.6, weight: weight * 0.75,
    },
    {
      type: 'BL', typeLabel: 'Blind', nps, pipeOD, od, flangeThickness: thickness * 1.3,
      boltCircleDiameter: bcd, numBolts: bolts, boltHoleDiameter: boltHoleDia, boltSize: boltDia,
      rfDia, rfHeight: 1.6, weight: weight * 1.4,
    },
    {
      type: 'SW', typeLabel: 'Socket Weld', nps, pipeOD, od, flangeThickness: thickness,
      boltCircleDiameter: bcd, numBolts: bolts, boltHoleDiameter: boltHoleDia, boltSize: boltDia,
      hubLength: hubLength * 0.7, boreDiameter: pipeOD + 1.6,
      socketDepth: pipeOD * 0.6, rfDia, rfHeight: 1.6, weight: weight * 0.85,
    },
    {
      type: 'THR', typeLabel: 'Threaded', nps, pipeOD, od, flangeThickness: thickness,
      boltCircleDiameter: bcd, numBolts: bolts, boltHoleDiameter: boltHoleDia, boltSize: boltDia,
      hubLength: hubLength * 0.5, boreDiameter: pipeOD - 2,
      threadLength: pipeOD * 0.5, rfDia, rfHeight: 1.6, weight: weight * 0.8,
    },
    {
      type: 'LJ', typeLabel: 'Lap Joint', nps, pipeOD, od, flangeThickness: thickness * 0.9,
      boltCircleDiameter: bcd, numBolts: bolts, boltHoleDiameter: boltHoleDia, boltSize: boltDia,
      hubLength: hubLength * 0.4, boreDiameter: pipeOD + 3, rfDia, rfHeight: 0, weight: weight * 0.7,
    },
  ];
};

const ALL_FLANGES_150: FlangeSpec[] = [
  ...generateFlangeSpecs('1/2"', 21.3, 89.0, 11.2, 60.5, 4, '1/2"', 15.8, 34.9, 15.7, 0.9),
  ...generateFlangeSpecs('3/4"', 26.7, 98.5, 12.7, 69.9, 4, '1/2"', 15.8, 42.9, 15.7, 1.1),
  ...generateFlangeSpecs('1"', 33.4, 108.0, 14.2, 79.2, 4, '1/2"', 15.8, 50.8, 17.5, 1.4),
  ...generateFlangeSpecs('1-1/2"', 48.3, 127.0, 17.5, 98.6, 4, '1/2"', 15.8, 73.2, 22.4, 2.5),
  ...generateFlangeSpecs('2"', 60.3, 152.4, 19.0, 120.7, 4, '5/8"', 19.0, 92.1, 25.4, 3.6),
  ...generateFlangeSpecs('3"', 88.9, 190.5, 23.8, 152.4, 4, '5/8"', 19.0, 127.0, 30.2, 5.9),
  ...generateFlangeSpecs('4"', 114.3, 228.6, 23.8, 190.5, 8, '5/8"', 19.0, 157.2, 33.3, 8.2),
  ...generateFlangeSpecs('6"', 168.3, 279.4, 25.4, 241.3, 8, '3/4"', 22.3, 215.9, 36.5, 12.3),
  ...generateFlangeSpecs('8"', 219.1, 342.9, 28.4, 298.5, 8, '3/4"', 22.3, 269.7, 39.6, 18.6),
  ...generateFlangeSpecs('10"', 273.0, 406.4, 30.2, 362.0, 12, '7/8"', 25.4, 323.9, 42.9, 27.3),
  ...generateFlangeSpecs('12"', 323.8, 482.6, 31.8, 431.8, 12, '7/8"', 25.4, 381.0, 47.6, 39.1),
  ...generateFlangeSpecs('16"', 406.4, 596.9, 36.5, 539.8, 16, '1"', 28.6, 469.9, 50.8, 60.8),
  ...generateFlangeSpecs('20"', 508.0, 698.5, 42.9, 635.0, 20, '1-1/8"', 31.8, 584.2, 54.0, 93.5),
  ...generateFlangeSpecs('24"', 609.6, 812.8, 47.6, 749.3, 20, '1-1/4"', 35.0, 692.2, 57.2, 135.0),
];

const ALL_FLANGES_300: FlangeSpec[] = [
  ...generateFlangeSpecs('1/2"', 21.3, 95.3, 14.2, 66.5, 4, '1/2"', 15.8, 34.9, 22.4, 1.3),
  ...generateFlangeSpecs('3/4"', 26.7, 117.5, 15.7, 82.6, 4, '5/8"', 19.0, 42.9, 25.4, 1.8),
  ...generateFlangeSpecs('1"', 33.4, 123.8, 17.5, 88.9, 4, '5/8"', 19.0, 50.8, 25.4, 2.1),
  ...generateFlangeSpecs('1-1/2"', 48.3, 155.4, 20.6, 114.3, 4, '3/4"', 22.3, 73.2, 30.2, 3.6),
  ...generateFlangeSpecs('2"', 60.3, 165.1, 22.4, 127.0, 8, '5/8"', 19.0, 92.1, 33.3, 4.5),
  ...generateFlangeSpecs('3"', 88.9, 209.6, 28.4, 168.1, 8, '3/4"', 22.3, 127.0, 38.1, 8.2),
  ...generateFlangeSpecs('4"', 114.3, 254.0, 31.8, 200.0, 8, '3/4"', 22.3, 157.2, 44.5, 12.7),
  ...generateFlangeSpecs('6"', 168.3, 317.5, 36.5, 269.7, 12, '3/4"', 22.3, 215.9, 47.6, 20.4),
  ...generateFlangeSpecs('8"', 219.1, 381.0, 41.1, 330.2, 12, '7/8"', 25.4, 269.7, 50.8, 32.7),
  ...generateFlangeSpecs('10"', 273.0, 444.5, 47.6, 387.4, 16, '1"', 28.6, 323.9, 54.0, 49.0),
  ...generateFlangeSpecs('12"', 323.8, 520.7, 50.8, 450.8, 16, '1-1/8"', 31.8, 381.0, 57.2, 68.0),
  ...generateFlangeSpecs('16"', 406.4, 647.7, 57.2, 571.5, 20, '1-1/4"', 35.0, 469.9, 63.5, 108.0),
  ...generateFlangeSpecs('20"', 508.0, 774.7, 63.5, 685.8, 24, '1-1/4"', 35.0, 584.2, 69.9, 170.0),
  ...generateFlangeSpecs('24"', 609.6, 914.4, 69.9, 812.8, 24, '1-1/2"', 41.3, 692.2, 76.2, 250.0),
];

const CLASS_MAP: Record<string, FlangeSpec[]> = { '150': ALL_FLANGES_150, '300': ALL_FLANGES_300 };
const CLASSES = ['150', '300'] as const;
const TYPES: FlangeType[] = ['WN', 'SO', 'BL', 'SW', 'THR', 'LJ'];
const NPS_LIST = ['1/2"', '3/4"', '1"', '1-1/2"', '2"', '3"', '4"', '6"', '8"', '10"', '12"', '16"', '20"', '24"'];

// ═══════════════════════════════════════════════════════════════
// SVG HELPER COMPONENTS
// ═══════════════════════════════════════════════════════════════

function DimensionLine({
  x1, y1, x2, y2, label, color = '#f59e0b', fontSize = 9,
}: {
  x1: number; y1: number; x2: number; y2: number;
  label: string; color?: string; fontSize?: number;
}) {
  const isHorizontal = Math.abs(y2 - y1) < Math.abs(x2 - x1);
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const arrowSize = 4;

  // Calculate angle for arrows
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const ux = dx / len;
  const uy = dy / len;

  return (
    <g>
      {/* Main line */}
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="0.8" />
      {/* Arrow at start */}
      <polygon
        points={`${x1},${y1} ${x1 + ux * arrowSize + uy * arrowSize * 0.5},${y1 + uy * arrowSize - ux * arrowSize * 0.5} ${x1 + ux * arrowSize - uy * arrowSize * 0.5},${y1 + uy * arrowSize + ux * arrowSize * 0.5}`}
        fill={color}
      />
      {/* Arrow at end */}
      <polygon
        points={`${x2},${y2} ${x2 - ux * arrowSize + uy * arrowSize * 0.5},${y2 - uy * arrowSize - ux * arrowSize * 0.5} ${x2 - ux * arrowSize - uy * arrowSize * 0.5},${y2 - uy * arrowSize + ux * arrowSize * 0.5}`}
        fill={color}
      />
      {/* Label */}
      <text
        x={isHorizontal ? midX : midX + 8}
        y={isHorizontal ? midY - 4 : midY + 3}
        fill={color}
        fontSize={fontSize}
        textAnchor="middle"
        fontWeight="bold"
        fontFamily="monospace"
      >
        {label}
      </text>
    </g>
  );
}

function ExtensionLine({
  x, y, length, direction,
}: {
  x: number; y: number; length: number; direction: 'up' | 'down' | 'left' | 'right';
}) {
  const x2 = direction === 'left' ? x - length : direction === 'right' ? x + length : x;
  const y2 = direction === 'up' ? y - length : direction === 'down' ? y + length : y;
  return <line x1={x} y1={y} x2={x2} y2={y2} stroke="#f59e0b" strokeWidth="0.4" opacity="0.7" />;
}

// ═══════════════════════════════════════════════════════════════
// FLANGE SVG RENDERERS
// ═══════════════════════════════════════════════════════════════

function WeldNeckSVG({
  spec, scale, cx, cy, showDimensions, showCenter, showBoltHoles, showFill, fmt, unit,
}: {
  spec: FlangeSpec; scale: number; cx: number; cy: number;
  showDimensions: boolean; showCenter: boolean; showBoltHoles: boolean; showFill: boolean;
  fmt: (v: number) => string; unit: string;
}) {
  const flangeR = (spec.od / 2) * scale;
  const pipeR = (spec.pipeOD / 2) * scale;
  const rfR = (spec.rfDia / 2) * scale;
  const thick = spec.flangeThickness * scale;
  const hubL = (spec.hubLength || 30) * scale;
  const hubBaseR = ((spec.hubDiameterBase || spec.pipeOD + 20) / 2) * scale;
  const hubEndR = ((spec.hubDiameterEnd || spec.pipeOD + 6) / 2) * scale;
  const bcdR = (spec.boltCircleDiameter / 2) * scale;
  const boltHoleR = (spec.boltHoleDiameter / 2) * scale;
  const rfH = spec.rfHeight * scale * 2; // exaggerated for visibility
  const pipeStub = 25 * scale;

  // Flange face is at cx, body extends to the left
  const faceX = cx + thick / 2;
  const backX = cx - thick / 2;

  return (
    <g>
      {/* Pipe stub extending left */}
      <rect x={backX - hubL - pipeStub} y={cy - pipeR} width={pipeStub} height={pipeR * 2}
        fill={showFill ? '#18181b' : 'none'} stroke="#52525b" strokeWidth="1" />

      {/* Hub taper (WN specific) — trapezoid from pipe to flange */}
      <path
        d={`M ${backX - hubL} ${cy - hubEndR} L ${backX} ${cy - hubBaseR} L ${backX} ${cy + hubBaseR} L ${backX - hubL} ${cy + hubEndR} Z`}
        fill={showFill ? '#1c1917' : 'none'} stroke="#f97316" strokeWidth="1.5"
      />

      {/* Weld prep bevel at hub end */}
      <line x1={backX - hubL - 2} y1={cy - hubEndR + 2} x2={backX - hubL} y2={cy - hubEndR}
        stroke="#f97316" strokeWidth="1" />
      <line x1={backX - hubL - 2} y1={cy + hubEndR - 2} x2={backX - hubL} y2={cy + hubEndR}
        stroke="#f97316" strokeWidth="1" />

      {/* Flange body */}
      <rect x={backX} y={cy - flangeR} width={thick} height={flangeR * 2}
        fill={showFill ? '#27272a' : 'none'} stroke="#a1a1aa" strokeWidth="1.5" />

      {/* Raised face */}
      <rect x={faceX} y={cy - rfR} width={rfH} height={rfR * 2}
        fill={showFill ? '#22d3ee10' : 'none'} stroke="#22d3ee" strokeWidth="1" />

      {/* Bolt holes in side view (shown as small circles on BCD) */}
      {showBoltHoles && (
        <>
          <circle cx={cx} cy={cy - bcdR} r={boltHoleR} fill="#18181b" stroke="#f59e0b" strokeWidth="0.8" />
          <circle cx={cx} cy={cy + bcdR} r={boltHoleR} fill="#18181b" stroke="#f59e0b" strokeWidth="0.8" />
        </>
      )}

      {/* Center line */}
      {showCenter && (
        <line x1={backX - hubL - pipeStub - 10} y1={cy} x2={faceX + rfH + 10} y2={cy}
          stroke="#52525b" strokeWidth="0.6" strokeDasharray="4 2" />
      )}

      {/* Dimensions */}
      {showDimensions && (
        <>
          {/* OD dimension — right side vertical */}
          <ExtensionLine x={faceX + rfH + 5} y={cy - flangeR} length={15} direction="right" />
          <ExtensionLine x={faceX + rfH + 5} y={cy + flangeR} length={15} direction="right" />
          <DimensionLine
            x1={faceX + rfH + 18} y1={cy - flangeR}
            x2={faceX + rfH + 18} y2={cy + flangeR}
            label={`Ø${fmt(spec.od)}`} color="#f59e0b"
          />

          {/* Thickness — bottom horizontal */}
          <ExtensionLine x={backX} y={cy + flangeR + 5} length={12} direction="down" />
          <ExtensionLine x={faceX} y={cy + flangeR + 5} length={12} direction="down" />
          <DimensionLine
            x1={backX} y1={cy + flangeR + 15}
            x2={faceX} y2={cy + flangeR + 15}
            label={`T=${fmt(spec.flangeThickness)}`} color="#3ea6ff"
          />

          {/* Hub length */}
          <ExtensionLine x={backX - hubL} y={cy - flangeR - 5} length={8} direction="up" />
          <ExtensionLine x={backX} y={cy - flangeR - 5} length={8} direction="up" />
          <DimensionLine
            x1={backX - hubL} y1={cy - flangeR - 12}
            x2={backX} y2={cy - flangeR - 12}
            label={`H=${fmt(spec.hubLength || 30)}`} color="#f97316"
          />

          {/* Pipe OD */}
          <text x={backX - hubL - pipeStub / 2} y={cy - pipeR - 6}
            fill="#a1a1aa" fontSize="8" textAnchor="middle" fontFamily="monospace">
            OD {fmt(spec.pipeOD)}
          </text>

          {/* BCD indicator */}
          {showBoltHoles && (
            <text x={cx + 2} y={cy - bcdR - 5}
              fill="#f59e0b" fontSize="7" textAnchor="middle" fontFamily="monospace">
              BCD {fmt(spec.boltCircleDiameter)}
            </text>
          )}

          {/* RF diameter */}
          <text x={faceX + rfH + 4} y={cy + rfR + 10}
            fill="#22d3ee" fontSize="7" textAnchor="start" fontFamily="monospace">
            RF Ø{fmt(spec.rfDia)}
          </text>
        </>
      )}
    </g>
  );
}

function SlipOnSVG({
  spec, scale, cx, cy, showDimensions, showCenter, showBoltHoles, showFill, fmt, unit,
}: {
  spec: FlangeSpec; scale: number; cx: number; cy: number;
  showDimensions: boolean; showCenter: boolean; showBoltHoles: boolean; showFill: boolean;
  fmt: (v: number) => string; unit: string;
}) {
  const flangeR = (spec.od / 2) * scale;
  const pipeR = (spec.pipeOD / 2) * scale;
  const rfR = (spec.rfDia / 2) * scale;
  const thick = spec.flangeThickness * scale;
  const bcdR = (spec.boltCircleDiameter / 2) * scale;
  const boltHoleR = (spec.boltHoleDiameter / 2) * scale;
  const rfH = spec.rfHeight * scale * 2;
  const pipeStub = 35 * scale;
  const boreR = ((spec.boreDiameter || spec.pipeOD + 1.6) / 2) * scale;

  const faceX = cx + thick / 2;
  const backX = cx - thick / 2;

  return (
    <g>
      {/* Pipe passing through */}
      <rect x={backX - pipeStub} y={cy - pipeR} width={pipeStub + thick + pipeStub * 0.3} height={pipeR * 2}
        fill={showFill ? '#18181b' : 'none'} stroke="#52525b" strokeWidth="1" />

      {/* Flange body */}
      <rect x={backX} y={cy - flangeR} width={thick} height={flangeR * 2}
        fill={showFill ? '#27272a' : 'none'} stroke="#a1a1aa" strokeWidth="1.5" />

      {/* Bore (gap between pipe and flange) */}
      <rect x={backX + 1} y={cy - boreR} width={thick - 2} height={boreR * 2}
        fill={showFill ? '#0f0f0f' : 'none'} stroke="none" />
      <rect x={backX + 1} y={cy - pipeR} width={thick - 2} height={pipeR * 2}
        fill={showFill ? '#18181b' : 'none'} stroke="#52525b" strokeWidth="0.5" />

      {/* Fillet welds (SO specific) */}
      <path d={`M ${backX} ${cy - pipeR - 2} Q ${backX - 3} ${cy - pipeR} ${backX - 3} ${cy - pipeR + 3}`}
        fill="none" stroke="#f97316" strokeWidth="1.5" />
      <path d={`M ${backX} ${cy + pipeR + 2} Q ${backX - 3} ${cy + pipeR} ${backX - 3} ${cy + pipeR - 3}`}
        fill="none" stroke="#f97316" strokeWidth="1.5" />
      <path d={`M ${faceX} ${cy - pipeR - 2} Q ${faceX + 3} ${cy - pipeR} ${faceX + 3} ${cy - pipeR + 3}`}
        fill="none" stroke="#f97316" strokeWidth="1.5" />
      <path d={`M ${faceX} ${cy + pipeR + 2} Q ${faceX + 3} ${cy + pipeR} ${faceX + 3} ${cy + pipeR - 3}`}
        fill="none" stroke="#f97316" strokeWidth="1.5" />

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
          <ExtensionLine x={faceX + rfH + 5} y={cy - flangeR} length={15} direction="right" />
          <ExtensionLine x={faceX + rfH + 5} y={cy + flangeR} length={15} direction="right" />
          <DimensionLine
            x1={faceX + rfH + 18} y1={cy - flangeR}
            x2={faceX + rfH + 18} y2={cy + flangeR}
            label={`Ø${fmt(spec.od)}`} color="#f59e0b"
          />

          <ExtensionLine x={backX} y={cy + flangeR + 5} length={12} direction="down" />
          <ExtensionLine x={faceX} y={cy + flangeR + 5} length={12} direction="down" />
          <DimensionLine
            x1={backX} y1={cy + flangeR + 15}
            x2={faceX} y2={cy + flangeR + 15}
            label={`T=${fmt(spec.flangeThickness)}`} color="#3ea6ff"
          />

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

function BlindSVG({
  spec, scale, cx, cy, showDimensions, showCenter, showBoltHoles, showFill, fmt, unit,
}: {
  spec: FlangeSpec; scale: number; cx: number; cy: number;
  showDimensions: boolean; showCenter: boolean; showBoltHoles: boolean; showFill: boolean;
  fmt: (v: number) => string; unit: string;
}) {
  const flangeR = (spec.od / 2) * scale;
  const rfR = (spec.rfDia / 2) * scale;
  const thick = spec.flangeThickness * scale;
  const bcdR = (spec.boltCircleDiameter / 2) * scale;
  const boltHoleR = (spec.boltHoleDiameter / 2) * scale;
  const rfH = spec.rfHeight * scale * 2;

  const faceX = cx + thick / 2;
  const backX = cx - thick / 2;

  // Cross-hatching lines for solid
  const hatchLines = [];
  const hatchSpacing = 5;
  for (let i = -flangeR; i <= flangeR; i += hatchSpacing) {
    hatchLines.push(
      <line key={`h${i}`}
        x1={backX + 2} y1={cy + i}
        x2={faceX - 2} y2={cy + i - thick * 0.4}
        stroke="#52525b" strokeWidth="0.3" opacity="0.5"
      />
    );
  }

  return (
    <g>
      {/* Flange body (solid — no bore) */}
      <rect x={backX} y={cy - flangeR} width={thick} height={flangeR * 2}
        fill={showFill ? '#27272a' : 'none'} stroke="#a1a1aa" strokeWidth="1.5" />

      {/* Cross-hatching to indicate solid */}
      {showFill && <g clipPath="url(#blindClip)">{hatchLines}</g>}
      <defs>
        <clipPath id="blindClip">
          <rect x={backX} y={cy - flangeR} width={thick} height={flangeR * 2} />
        </clipPath>
      </defs>

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
        <line x1={backX - 10} y1={cy} x2={faceX + rfH + 10} y2={cy}
          stroke="#52525b" strokeWidth="0.6" strokeDasharray="4 2" />
      )}

      {/* Dimensions */}
      {showDimensions && (
        <>
          <ExtensionLine x={faceX + rfH + 5} y={cy - flangeR} length={15} direction="right" />
          <ExtensionLine x={faceX + rfH + 5} y={cy + flangeR} length={15} direction="right" />
          <DimensionLine
            x1={faceX + rfH + 18} y1={cy - flangeR}
            x2={faceX + rfH + 18} y2={cy + flangeR}
            label={`Ø${fmt(spec.od)}`} color="#f59e0b"
          />

          <ExtensionLine x={backX} y={cy + flangeR + 5} length={12} direction="down" />
          <ExtensionLine x={faceX} y={cy + flangeR + 5} length={12} direction="down" />
          <DimensionLine
            x1={backX} y1={cy + flangeR + 15}
            x2={faceX} y2={cy + flangeR + 15}
            label={`T=${fmt(spec.flangeThickness)}`} color="#3ea6ff"
          />

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

// Front (top) view for all types
function FrontViewSVG({
  spec, scale, cx, cy, showBoltHoles, showCenter, showDimensions, showFill, fmt,
}: {
  spec: FlangeSpec; scale: number; cx: number; cy: number;
  showBoltHoles: boolean; showCenter: boolean; showDimensions: boolean; showFill: boolean;
  fmt: (v: number) => string;
}) {
  const flangeR = (spec.od / 2) * scale;
  const rfR = (spec.rfDia / 2) * scale;
  const bcdR = (spec.boltCircleDiameter / 2) * scale;
  const boltHoleR = (spec.boltHoleDiameter / 2) * scale;
  const pipeR = (spec.pipeOD / 2) * scale;

  const boltHoles = Array.from({ length: spec.numBolts }, (_, i) => {
    const angle = (2 * Math.PI * i) / spec.numBolts;
    return { x: cx + bcdR * Math.cos(angle), y: cy + bcdR * Math.sin(angle) };
  });

  return (
    <g>
      {/* Flange outer circle */}
      <circle cx={cx} cy={cy} r={flangeR}
        fill={showFill ? '#27272a' : 'none'} stroke="#a1a1aa" strokeWidth="1.5" />

      {/* RF circle */}
      <circle cx={cx} cy={cy} r={rfR}
        fill="none" stroke="#22d3ee" strokeWidth="1" strokeDasharray="3 2" />

      {/* BCD circle */}
      <circle cx={cx} cy={cy} r={bcdR}
        fill="none" stroke="#f59e0b" strokeWidth="0.5" strokeDasharray="2 1" opacity="0.6" />

      {/* Pipe bore (or solid for BL) */}
      {spec.type !== 'BL' ? (
        <circle cx={cx} cy={cy} r={pipeR}
          fill={showFill ? '#0f0f0f' : 'none'} stroke="#52525b" strokeWidth="1" />
      ) : (
        <>
          {/* Cross pattern for blind */}
          <line x1={cx - rfR * 0.5} y1={cy - rfR * 0.5} x2={cx + rfR * 0.5} y2={cy + rfR * 0.5}
            stroke="#52525b" strokeWidth="0.5" />
          <line x1={cx + rfR * 0.5} y1={cy - rfR * 0.5} x2={cx - rfR * 0.5} y2={cy + rfR * 0.5}
            stroke="#52525b" strokeWidth="0.5" />
        </>
      )}

      {/* Bolt holes */}
      {showBoltHoles && boltHoles.map((hole, i) => (
        <circle key={i} cx={hole.x} cy={hole.y} r={boltHoleR}
          fill={showFill ? '#18181b' : 'none'} stroke="#f59e0b" strokeWidth="0.8" />
      ))}

      {/* Center crosshair */}
      {showCenter && (
        <>
          <line x1={cx - 6} y1={cy} x2={cx + 6} y2={cy} stroke="#52525b" strokeWidth="0.5" />
          <line x1={cx} y1={cy - 6} x2={cx} y2={cy + 6} stroke="#52525b" strokeWidth="0.5" />
        </>
      )}

      {/* Dimensions */}
      {showDimensions && (
        <>
          {/* BCD radius line */}
          <line x1={cx} y1={cy} x2={cx + bcdR} y2={cy}
            stroke="#f59e0b" strokeWidth="0.5" strokeDasharray="2 1" />
          <text x={cx + bcdR / 2} y={cy - 5}
            fill="#f59e0b" fontSize="7" textAnchor="middle" fontFamily="monospace">
            BCD {fmt(spec.boltCircleDiameter)}
          </text>

          {/* RF label */}
          <text x={cx} y={cy + rfR + 10}
            fill="#22d3ee" fontSize="7" textAnchor="middle" fontFamily="monospace">
            RF Ø{fmt(spec.rfDia)}
          </text>

          {/* Bolt count */}
          <text x={cx} y={cy + flangeR + 12}
            fill="#a1a1aa" fontSize="7" textAnchor="middle" fontFamily="monospace">
            {spec.numBolts}×Ø{fmt(spec.boltHoleDiameter)}
          </text>
        </>
      )}
    </g>
  );
}

// ═══════════════════════════════════════════════════════════════
// MODAL COMPONENT
// ═══════════════════════════════════════════════════════════════

function FlangeDetailModal({
  spec, onClose, fmt, unit, showInches,
}: {
  spec: FlangeSpec; onClose: () => void; fmt: (v: number) => string; unit: string; showInches: boolean;
}) {
  const { t } = useTranslation();
  const [showDimensions, setShowDimensions] = useState(true);
  const [showCenter, setShowCenter] = useState(true);
  const [showBoltHoles, setShowBoltHoles] = useState(true);
  const [showFill, setShowFill] = useState(true);

  const svgW = 520;
  const svgH = 320;
  const sideScale = Math.min(0.38, 120 / spec.od);
  const frontScale = Math.min(0.28, 90 / spec.od);

  const sideCx = 180;
  const sideCy = svgH / 2;
  const frontCx = 410;
  const frontCy = svgH / 2;

  const renderSideView = () => {
    const props = { spec, scale: sideScale, cx: sideCx, cy: sideCy, showDimensions, showCenter, showBoltHoles, showFill, fmt, unit };
    switch (spec.type) {
      case 'WN': return <WeldNeckSVG {...props} />;
      case 'SO': return <SlipOnSVG {...props} />;
      case 'BL': return <BlindSVG {...props} />;
      case 'SW': return <SocketWeldSVG {...props} />;
      case 'THR': return <ThreadedSVG {...props} />;
      case 'LJ': return <LapJointSVG {...props} />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}>
      <div className="bg-[#0d0d0d] border border-zinc-800 rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-[#f59e0b]/10">
              <Ruler className="h-4 w-4 text-[#f59e0b]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">
                {spec.typeLabel} — {spec.nps} Class 150
              </h3>
              <p className="text-[10px] text-zinc-500">ASME B16.5-2020 | RF Facing</p>
            </div>
            <span className={`ml-2 px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
              spec.type === 'WN' ? 'bg-[#f97316]/20 text-[#f97316]' :
              spec.type === 'SO' ? 'bg-[#22d3ee]/20 text-[#22d3ee]' :
              'bg-zinc-700/50 text-zinc-300'
            }`}>
              {spec.type}
            </span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="dimensions" className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-zinc-900 border-b border-zinc-800 rounded-none">
            <TabsTrigger value="dimensions" className="flex items-center gap-1.5 text-xs data-[state=active]:bg-zinc-800">
              <Ruler className="h-3.5 w-3.5" /> Dimensions
            </TabsTrigger>
            <TabsTrigger value="crosslink" className="flex items-center gap-1.5 text-xs data-[state=active]:bg-zinc-800">
              <Link2 className="h-3.5 w-3.5" /> Cross-Link
            </TabsTrigger>
            <TabsTrigger value="notes" className="flex items-center gap-1.5 text-xs data-[state=active]:bg-zinc-800">
              <BookOpen className="h-3.5 w-3.5" /> Notes
            </TabsTrigger>
          </TabsList>

          {/* Tab: Dimensions */}
          <TabsContent value="dimensions" className="p-4 space-y-4">
            {/* Toggles */}
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-1.5 text-[10px] text-zinc-400 cursor-pointer">
                <input type="checkbox" checked={showDimensions} onChange={(e) => setShowDimensions(e.target.checked)}
                  className="rounded border-zinc-700 bg-zinc-900 text-amber-500 w-3 h-3" />
                Cotas
              </label>
              <label className="flex items-center gap-1.5 text-[10px] text-zinc-400 cursor-pointer">
                <input type="checkbox" checked={showCenter} onChange={(e) => setShowCenter(e.target.checked)}
                  className="rounded border-zinc-700 bg-zinc-900 text-amber-500 w-3 h-3" />
                Centro
              </label>
              <label className="flex items-center gap-1.5 text-[10px] text-zinc-400 cursor-pointer">
                <input type="checkbox" checked={showBoltHoles} onChange={(e) => setShowBoltHoles(e.target.checked)}
                  className="rounded border-zinc-700 bg-zinc-900 text-amber-500 w-3 h-3" />
                Agujeros
              </label>
              <label className="flex items-center gap-1.5 text-[10px] text-zinc-400 cursor-pointer">
                <input type="checkbox" checked={showFill} onChange={(e) => setShowFill(e.target.checked)}
                  className="rounded border-zinc-700 bg-zinc-900 text-amber-500 w-3 h-3" />
                Relleno
              </label>
            </div>

            {/* Large SVG */}
            <div className="bg-[#0a0a0a] border border-zinc-800 rounded-lg p-3">
              <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full" style={{ minHeight: '300px' }}>
                <rect width={svgW} height={svgH} fill="#0a0a0a" rx="6" />
                <defs>
                  <pattern id="modalGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                    <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#1a1a2e" strokeWidth="0.2" />
                  </pattern>
                </defs>
                <rect width={svgW} height={svgH} fill="url(#modalGrid)" opacity="0.3" />

                {/* Labels */}
                <text x={sideCx} y="18" fill="#a1a1aa" fontSize="9" textAnchor="middle" fontWeight="bold">
                  VISTA LATERAL
                </text>
                <text x={frontCx} y="18" fill="#a1a1aa" fontSize="9" textAnchor="middle" fontWeight="bold">
                  VISTA FRONTAL
                </text>

                {/* Side view */}
                {renderSideView()}

                {/* Front view */}
                <FrontViewSVG
                  spec={spec} scale={frontScale} cx={frontCx} cy={frontCy}
                  showBoltHoles={showBoltHoles} showCenter={showCenter}
                  showDimensions={showDimensions} showFill={showFill} fmt={fmt}
                />

                {/* Legend */}
                <rect x="8" y={svgH - 50} width="180" height="42" fill="#0a0a0a90" rx="3" stroke="#27272a" strokeWidth="0.5" />
                <circle cx="18" cy={svgH - 36} r="3" fill="#f59e0b" />
                <text x="26" y={svgH - 34} fill="#d4d4d8" fontSize="7" dominantBaseline="middle">Cotas principales (OD, BCD)</text>
                <circle cx="18" cy={svgH - 23} r="3" fill="#22d3ee" />
                <text x="26" y={svgH - 21} fill="#d4d4d8" fontSize="7" dominantBaseline="middle">Raised Face (RF)</text>
                <circle cx="18" cy={svgH - 12} r="3" fill="#f97316" />
                <text x="26" y={svgH - 10} fill="#d4d4d8" fontSize="7" dominantBaseline="middle">
                  {spec.type === 'WN' ? 'Hub / Weld prep' : spec.type === 'SO' ? 'Fillet welds' : 'Solid body'}
                </text>

                {/* Info */}
                <text x={svgW - 8} y={svgH - 8} fill="#52525b" fontSize="8" textAnchor="end">
                  {spec.nps} {spec.typeLabel} — {spec.numBolts}×{spec.boltSize} — {unit}
                </text>
              </svg>
            </div>

            {/* Dimensions table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="py-1.5 px-2 text-left text-zinc-500">Dimensión</th>
                    <th className="py-1.5 px-2 text-left text-zinc-500">Símbolo</th>
                    <th className="py-1.5 px-2 text-right text-zinc-500">Valor</th>
                    <th className="py-1.5 px-2 text-right text-zinc-500">Unidad</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-1.5 px-2 text-zinc-200">Outside Diameter</td>
                    <td className="py-1.5 px-2 text-[#f59e0b] font-mono">OD</td>
                    <td className="py-1.5 px-2 text-right font-mono text-[#f59e0b] font-bold">{fmt(spec.od)}</td>
                    <td className="py-1.5 px-2 text-right text-zinc-500">{unit}</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-1.5 px-2 text-zinc-200">Flange Thickness</td>
                    <td className="py-1.5 px-2 text-[#3ea6ff] font-mono">T</td>
                    <td className="py-1.5 px-2 text-right font-mono text-[#3ea6ff] font-bold">{fmt(spec.flangeThickness)}</td>
                    <td className="py-1.5 px-2 text-right text-zinc-500">{unit}</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-1.5 px-2 text-zinc-200">Bolt Circle Diameter</td>
                    <td className="py-1.5 px-2 text-[#f59e0b] font-mono">BCD</td>
                    <td className="py-1.5 px-2 text-right font-mono text-[#f59e0b] font-bold">{fmt(spec.boltCircleDiameter)}</td>
                    <td className="py-1.5 px-2 text-right text-zinc-500">{unit}</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-1.5 px-2 text-zinc-200">Raised Face Diameter</td>
                    <td className="py-1.5 px-2 text-[#22d3ee] font-mono">RF</td>
                    <td className="py-1.5 px-2 text-right font-mono text-[#22d3ee] font-bold">{fmt(spec.rfDia)}</td>
                    <td className="py-1.5 px-2 text-right text-zinc-500">{unit}</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-1.5 px-2 text-zinc-200">Number of Bolts</td>
                    <td className="py-1.5 px-2 text-zinc-400 font-mono">n</td>
                    <td className="py-1.5 px-2 text-right font-mono text-zinc-100 font-bold">{spec.numBolts}</td>
                    <td className="py-1.5 px-2 text-right text-zinc-500">pcs</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-1.5 px-2 text-zinc-200">Bolt Size</td>
                    <td className="py-1.5 px-2 text-zinc-400 font-mono">d</td>
                    <td className="py-1.5 px-2 text-right font-mono text-zinc-100">{spec.boltSize}</td>
                    <td className="py-1.5 px-2 text-right text-zinc-500">in</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-1.5 px-2 text-zinc-200">Bolt Hole Diameter</td>
                    <td className="py-1.5 px-2 text-zinc-400 font-mono">Ø<sub>h</sub></td>
                    <td className="py-1.5 px-2 text-right font-mono text-zinc-100">{fmt(spec.boltHoleDiameter)}</td>
                    <td className="py-1.5 px-2 text-right text-zinc-500">{unit}</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-1.5 px-2 text-zinc-200">Pipe OD</td>
                    <td className="py-1.5 px-2 text-zinc-400 font-mono">OD<sub>p</sub></td>
                    <td className="py-1.5 px-2 text-right font-mono text-zinc-300">{fmt(spec.pipeOD)}</td>
                    <td className="py-1.5 px-2 text-right text-zinc-500">{unit}</td>
                  </tr>
                  {spec.type === 'WN' && spec.hubLength && (
                    <tr className="border-b border-zinc-800/50">
                      <td className="py-1.5 px-2 text-zinc-200">Hub Length</td>
                      <td className="py-1.5 px-2 text-[#f97316] font-mono">H</td>
                      <td className="py-1.5 px-2 text-right font-mono text-[#f97316] font-bold">{fmt(spec.hubLength)}</td>
                      <td className="py-1.5 px-2 text-right text-zinc-500">{unit}</td>
                    </tr>
                  )}
                  <tr>
                    <td className="py-1.5 px-2 text-zinc-200">Weight (approx)</td>
                    <td className="py-1.5 px-2 text-zinc-400 font-mono">W</td>
                    <td className="py-1.5 px-2 text-right font-mono text-zinc-300">{spec.weight.toFixed(1)}</td>
                    <td className="py-1.5 px-2 text-right text-zinc-500">kg</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* Tab: Cross-Link */}
          <TabsContent value="crosslink" className="p-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              {/* Gasket */}
              <div className="border border-zinc-800 rounded-lg p-3 bg-zinc-900/30">
                <p className="text-[9px] uppercase tracking-wider text-[#22d3ee] font-semibold mb-2">Gasket</p>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Type</span>
                    <span className="text-zinc-200 font-mono">Spiral Wound</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">OD</span>
                    <span className="text-zinc-200 font-mono">{fmt(spec.rfDia - 3)} {unit}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">ID</span>
                    <span className="text-zinc-200 font-mono">{fmt(spec.pipeOD + 3)} {unit}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Material</span>
                    <span className="text-zinc-200 font-mono">SS304 + Graphite</span>
                  </div>
                </div>
              </div>

              {/* Bolts */}
              <div className="border border-zinc-800 rounded-lg p-3 bg-zinc-900/30">
                <p className="text-[9px] uppercase tracking-wider text-[#f59e0b] font-semibold mb-2">Bolts</p>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Size</span>
                    <span className="text-zinc-200 font-mono">{spec.boltSize}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Quantity</span>
                    <span className="text-zinc-200 font-mono">{spec.numBolts} pcs</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Material</span>
                    <span className="text-zinc-200 font-mono">ASTM A193 B7</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Nut</span>
                    <span className="text-zinc-200 font-mono">A194 2H</span>
                  </div>
                </div>
              </div>

              {/* Torque */}
              <div className="border border-zinc-800 rounded-lg p-3 bg-zinc-900/30">
                <p className="text-[9px] uppercase tracking-wider text-[#f97316] font-semibold mb-2">Torque</p>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Target</span>
                    <span className="text-zinc-200 font-mono">Per PCC-1</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Pattern</span>
                    <span className="text-zinc-200 font-mono">Star (cross)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Passes</span>
                    <span className="text-zinc-200 font-mono">3 min</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Lubricant</span>
                    <span className="text-zinc-200 font-mono">Moly paste</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-[#f59e0b]/5 border border-[#f59e0b]/20 rounded-lg p-3">
              <p className="text-xs text-[#f59e0b] font-semibold mb-1">⚠️ Premium Feature</p>
              <p className="text-[11px] text-zinc-400">
                Detailed torque tables, gasket selection guide, and bolt length calculator available in PRO plan.
              </p>
            </div>
          </TabsContent>

          {/* Tab: Notes */}
          <TabsContent value="notes" className="p-4 space-y-4">
            <div className="space-y-3 text-xs text-zinc-400">
              <div className="border-l-2 border-[#f59e0b] pl-3">
                <p className="text-zinc-200 font-semibold mb-1">Standard Reference</p>
                <p>ASME B16.5-2020 — Pipe Flanges and Flanged Fittings (NPS 1/2 through NPS 24)</p>
              </div>
              <div className="border-l-2 border-[#22d3ee] pl-3">
                <p className="text-zinc-200 font-semibold mb-1">Facing</p>
                <p>Raised Face (RF) — 1.6mm raised, serrated finish 125-250 AARH</p>
              </div>
              <div className="border-l-2 border-[#f97316] pl-3">
                <p className="text-zinc-200 font-semibold mb-1">Material</p>
                <p>ASTM A105 (Carbon Steel), A182 F304/F316 (Stainless Steel), A182 F11/F22 (Alloy)</p>
              </div>
              <div className="border-l-2 border-zinc-600 pl-3">
                <p className="text-zinc-200 font-semibold mb-1">Disclaimer</p>
                <p>Dimensions are nominal values per ASME B16.5. Always verify with manufacturer data sheets for actual procurement. Weight values are approximate.</p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// FLANGE CARD COMPONENT
// ═══════════════════════════════════════════════════════════════

function FlangeCard({
  spec, onClick, fmt, unit,
}: {
  spec: FlangeSpec; onClick: () => void; fmt: (v: number) => string; unit: string;
}) {
  const miniScale = Math.min(0.3, 50 / spec.od);
  const svgW = 140;
  const svgH = 90;
  const cx = svgW / 2;
  const cy = svgH / 2;

  return (
    <div
      className="border border-zinc-800 rounded-lg bg-zinc-900/40 hover:bg-zinc-900/70 hover:border-zinc-700 transition-all cursor-pointer p-3 group"
      onClick={onClick}
    >
      {/* Mini SVG */}
      <div className="bg-[#0a0a0a] rounded border border-zinc-800/50 mb-2 overflow-hidden">
        <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-[80px]">
          <rect width={svgW} height={svgH} fill="#0a0a0a" />
          {spec.type === 'WN' && (
            <WeldNeckSVG spec={spec} scale={miniScale} cx={cx - 10} cy={cy}
              showDimensions={false} showCenter={false} showBoltHoles={false} showFill={true} fmt={fmt} unit={unit} />
          )}
          {spec.type === 'SO' && (
            <SlipOnSVG spec={spec} scale={miniScale} cx={cx - 10} cy={cy}
              showDimensions={false} showCenter={false} showBoltHoles={false} showFill={true} fmt={fmt} unit={unit} />
          )}
          {spec.type === 'BL' && (
            <BlindSVG spec={spec} scale={miniScale} cx={cx - 10} cy={cy}
              showDimensions={false} showCenter={false} showBoltHoles={false} showFill={true} fmt={fmt} unit={unit} />
          )}
          {/* Overlaid key dimensions */}
          <text x={svgW - 4} y="12" fill="#f59e0b" fontSize="7" textAnchor="end" fontFamily="monospace" opacity="0.9">
            OD {fmt(spec.od)}
          </text>
          <text x={svgW - 4} y="22" fill="#3ea6ff" fontSize="7" textAnchor="end" fontFamily="monospace" opacity="0.9">
            T {fmt(spec.flangeThickness)}
          </text>
          <text x={svgW - 4} y={svgH - 4} fill="#a1a1aa" fontSize="6" textAnchor="end" fontFamily="monospace" opacity="0.7">
            BCD {fmt(spec.boltCircleDiameter)}
          </text>
        </svg>
      </div>

      {/* Info */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-zinc-200">{spec.nps}</span>
        <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
          spec.type === 'WN' ? 'bg-[#f97316]/20 text-[#f97316]' :
          spec.type === 'SO' ? 'bg-[#22d3ee]/20 text-[#22d3ee]' :
          'bg-zinc-700/50 text-zinc-400'
        }`}>
          {spec.type}
        </span>
      </div>
      <div className="flex items-center justify-between text-[10px] text-zinc-500">
        <span>{spec.weight.toFixed(1)} kg</span>
        <span>{spec.numBolts}×{spec.boltSize}</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function FlangesTool() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [flangeClass, setFlangeClass] = useState<string>('150');
  const [flangeType, setFlangeType] = useState<FlangeType | 'ALL'>('ALL');
  const [npsFilter, setNpsFilter] = useState<string>('ALL');
  const [showInches, setShowInches] = useState(false);
  const [selectedFlange, setSelectedFlange] = useState<FlangeSpec | null>(null);

  // View toggles for main SVG
  const [showDimensions, setShowDimensions] = useState(true);
  const [showCenter, setShowCenter] = useState(true);
  const [showBoltHoles, setShowBoltHoles] = useState(true);
  const [showFill, setShowFill] = useState(true);

  const fmt = useCallback((v: number) => showInches ? (v / 25.4).toFixed(3) : v.toFixed(1), [showInches]);
  const unit = showInches ? 'in' : 'mm';

  // Filter flanges
  const filteredFlanges = useMemo(() => {
    const data = CLASS_MAP[flangeClass] || ALL_FLANGES_150;
    return data.filter((f) => {
      if (flangeType !== 'ALL' && f.type !== flangeType) return false;
      if (npsFilter !== 'ALL' && f.nps !== npsFilter) return false;
      return true;
    });
  }, [flangeClass, flangeType, npsFilter]);

  // Selected flange for main SVG preview (first in filtered list)
  const previewFlange = filteredFlanges[0] || ALL_FLANGES_150[0];

  // Usage logging
  const lastLogRef = useRef<number>(0);
  const logUsage = useCallback(() => {
    if (!user) return;
    const now = Date.now();
    if (now - lastLogRef.current < 3000) return;
    lastLogRef.current = now;
    supabase
      .from(TABLES.toolUsage)
      .insert({
        user_id: user.id,
        tool_name: 'Flange Library',
        tool_category: 'Reference',
        input_data: { class: flangeClass, type: flangeType, nps: npsFilter },
        output_data: { count: filteredFlanges.length },
      })
      .then(() => {});
  }, [user, flangeClass, flangeType, npsFilter, filteredFlanges.length]);

  useEffect(() => { logUsage(); }, [logUsage]);

  // Main SVG
  const svgW = 560;
  const svgH = 340;
  const mainScale = Math.min(0.45, 140 / previewFlange.od);
  const sideCx = 190;
  const sideCy = svgH / 2;
  const frontCx = 430;
  const frontCy = svgH / 2;
  const frontScale = Math.min(0.32, 100 / previewFlange.od);

  const renderMainSideView = () => {
    const props = { spec: previewFlange, scale: mainScale, cx: sideCx, cy: sideCy, showDimensions, showCenter, showBoltHoles, showFill, fmt, unit };
    switch (previewFlange.type) {
      case 'WN': return <WeldNeckSVG {...props} />;
      case 'SO': return <SlipOnSVG {...props} />;
      case 'BL': return <BlindSVG {...props} />;
      case 'SW': return <SocketWeldSVG {...props} />;
      case 'THR': return <ThreadedSVG {...props} />;
      case 'LJ': return <LapJointSVG {...props} />;
    }
  };

  const mainSvgContent = useMemo(() => (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full" style={{ maxWidth: '560px' }}
      role="img" aria-label={`${previewFlange.typeLabel} flange ${previewFlange.nps} Class ${flangeClass}`}>
      <rect width={svgW} height={svgH} fill="#0a0a0a" rx="6" />
      <defs>
        <pattern id="flangeMainGrid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#1a1a2e" strokeWidth="0.2" />
        </pattern>
      </defs>
      <rect width={svgW} height={svgH} fill="url(#flangeMainGrid)" opacity="0.3" />

      {/* View labels */}
      <text x={sideCx} y="18" fill="#a1a1aa" fontSize="9" textAnchor="middle" fontWeight="bold">VISTA LATERAL</text>
      <text x={frontCx} y="18" fill="#a1a1aa" fontSize="9" textAnchor="middle" fontWeight="bold">VISTA FRONTAL</text>

      {/* Side view */}
      {renderMainSideView()}

      {/* Front view */}
      <FrontViewSVG
        spec={previewFlange} scale={frontScale} cx={frontCx} cy={frontCy}
        showBoltHoles={showBoltHoles} showCenter={showCenter}
        showDimensions={showDimensions} showFill={showFill} fmt={fmt}
      />

      {/* Legend */}
      <rect x="8" y={svgH - 48} width="170" height="40" fill="#0a0a0a90" rx="3" stroke="#27272a" strokeWidth="0.5" />
      <circle cx="18" cy={svgH - 34} r="3" fill="#f59e0b" />
      <text x="26" y={svgH - 32} fill="#d4d4d8" fontSize="7" dominantBaseline="middle">Cotas (OD, BCD, T)</text>
      <circle cx="18" cy={svgH - 22} r="3" fill="#22d3ee" />
      <text x="26" y={svgH - 20} fill="#d4d4d8" fontSize="7" dominantBaseline="middle">Raised Face</text>
      <circle cx="18" cy={svgH - 12} r="3" fill="#f97316" />
      <text x="26" y={svgH - 10} fill="#d4d4d8" fontSize="7" dominantBaseline="middle">
        {previewFlange.type === 'WN' ? 'Hub taper' : previewFlange.type === 'SO' ? 'Fillet welds' : 'Solid'}
      </text>

      {/* Info */}
      <text x={svgW - 8} y={svgH - 8} fill="#52525b" fontSize="8" textAnchor="end">
        {previewFlange.nps} {previewFlange.typeLabel} — Class {flangeClass} — {previewFlange.numBolts}×{previewFlange.boltSize}
      </text>
    </svg>
  ), [previewFlange, flangeClass, showDimensions, showCenter, showBoltHoles, showFill, fmt, unit, svgW, svgH, mainScale, frontScale, sideCx, sideCy, frontCx, frontCy, renderMainSideView]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <p className="text-[10px] uppercase tracking-[0.25em] text-[#f59e0b]">
          {t('tools.flanges.name', { defaultValue: 'Flange Library' })}
        </p>
        <h3 className="mt-1 text-xl font-semibold">
          {t('tools.flanges.subtitle', { defaultValue: 'Biblioteca de Bridas ASME B16.5' })}
        </h3>
      </div>

      <Tabs defaultValue="library" className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-zinc-900 border border-zinc-800">
          <TabsTrigger value="library" className="flex items-center gap-2 data-[state=active]:bg-zinc-800">
            <Ruler className="h-4 w-4" />
            {t('tools.flanges.tabLibrary', { defaultValue: 'Biblioteca' })}
          </TabsTrigger>
          <TabsTrigger value="notes" className="flex items-center gap-2 data-[state=active]:bg-zinc-800">
            <BookOpen className="h-4 w-4" />
            {t('tools.flanges.tabNotes', { defaultValue: 'Notas y Referencia' })}
          </TabsTrigger>
        </TabsList>

        {/* ═══ TAB 1: LIBRARY ═══ */}
        <TabsContent value="library" className="mt-2 space-y-4">
          {/* Filters */}
          <div className="border border-zinc-800 rounded-lg bg-zinc-900/30 p-3">
            <div className="grid gap-2 sm:grid-cols-4">
              <div className="space-y-0.5">
                <label className="text-[9px] uppercase tracking-wider text-zinc-500">Type</label>
                <Select value={flangeType} onValueChange={(v) => setFlangeType(v as FlangeType | 'ALL')}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Types</SelectItem>
                    <SelectItem value="WN">Weld Neck (WN)</SelectItem>
                    <SelectItem value="SO">Slip-On (SO)</SelectItem>
                    <SelectItem value="BL">Blind (BL)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-0.5">
                <label className="text-[9px] uppercase tracking-wider text-zinc-500">Class</label>
                <Select value={flangeClass} onValueChange={setFlangeClass}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CLASSES.map((cls) => (
                      <SelectItem key={cls} value={cls}>Class {cls}#</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-0.5">
                <label className="text-[9px] uppercase tracking-wider text-zinc-500">NPS</label>
                <Select value={npsFilter} onValueChange={setNpsFilter}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Sizes</SelectItem>
                    {NPS_LIST.map((nps) => (
                      <SelectItem key={nps} value={nps}>{nps}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowInches(!showInches)}
                  className="border-zinc-800 !bg-transparent hover:!bg-zinc-900 text-[10px] h-8 w-full"
                >
                  <ArrowRightLeft className="h-3 w-3 mr-1" />
                  {showInches ? 'in → mm' : 'mm → in'}
                </Button>
              </div>
            </div>
          </div>

          {/* Main SVG Preview */}
          <div className="border border-zinc-800 rounded-lg bg-[#0a0a0a] p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-500">
                {t('tools.technicalDrawing', { defaultValue: 'Dibujo Técnico' })} — {previewFlange.typeLabel}
              </p>
              {/* View toggles */}
              <div className="flex flex-wrap gap-2">
                <label className="flex items-center gap-1 text-[9px] text-zinc-400 cursor-pointer">
                  <input type="checkbox" checked={showDimensions} onChange={(e) => setShowDimensions(e.target.checked)}
                    className="rounded border-zinc-700 bg-zinc-900 text-amber-500 w-3 h-3" />
                  Cotas
                </label>
                <label className="flex items-center gap-1 text-[9px] text-zinc-400 cursor-pointer">
                  <input type="checkbox" checked={showCenter} onChange={(e) => setShowCenter(e.target.checked)}
                    className="rounded border-zinc-700 bg-zinc-900 text-amber-500 w-3 h-3" />
                  Centro
                </label>
                <label className="flex items-center gap-1 text-[9px] text-zinc-400 cursor-pointer">
                  <input type="checkbox" checked={showBoltHoles} onChange={(e) => setShowBoltHoles(e.target.checked)}
                    className="rounded border-zinc-700 bg-zinc-900 text-amber-500 w-3 h-3" />
                  Agujeros
                </label>
                <label className="flex items-center gap-1 text-[9px] text-zinc-400 cursor-pointer">
                  <input type="checkbox" checked={showFill} onChange={(e) => setShowFill(e.target.checked)}
                    className="rounded border-zinc-700 bg-zinc-900 text-amber-500 w-3 h-3" />
                  Relleno
                </label>
              </div>
            </div>
            <div className="flex items-center justify-center">
              {mainSvgContent}
            </div>
          </div>

          {/* Results Table */}
          <div className="border border-zinc-800 rounded-lg bg-zinc-900/30 p-3">
            <p className="text-[9px] uppercase tracking-[0.2em] text-[#f59e0b] mb-2 font-semibold">
              {t('tools.numericalResults', { defaultValue: 'Resultados Numéricos' })} — {previewFlange.nps} {previewFlange.typeLabel}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="py-1.5 px-2 text-left text-zinc-500">Dim</th>
                    <th className="py-1.5 px-2 text-right text-zinc-500">Valor</th>
                    <th className="py-1.5 px-2 text-left text-zinc-500">Dim</th>
                    <th className="py-1.5 px-2 text-right text-zinc-500">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-1 px-2 text-[#f59e0b] font-mono">OD</td>
                    <td className="py-1 px-2 text-right font-mono text-zinc-200">{fmt(previewFlange.od)} {unit}</td>
                    <td className="py-1 px-2 text-[#3ea6ff] font-mono">T</td>
                    <td className="py-1 px-2 text-right font-mono text-zinc-200">{fmt(previewFlange.flangeThickness)} {unit}</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-1 px-2 text-[#f59e0b] font-mono">BCD</td>
                    <td className="py-1 px-2 text-right font-mono text-zinc-200">{fmt(previewFlange.boltCircleDiameter)} {unit}</td>
                    <td className="py-1 px-2 text-[#22d3ee] font-mono">RF</td>
                    <td className="py-1 px-2 text-right font-mono text-zinc-200">{fmt(previewFlange.rfDia)} {unit}</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-1 px-2 text-zinc-400 font-mono">Bolts</td>
                    <td className="py-1 px-2 text-right font-mono text-zinc-200">{previewFlange.numBolts}×{previewFlange.boltSize}</td>
                    <td className="py-1 px-2 text-zinc-400 font-mono">Pipe OD</td>
                    <td className="py-1 px-2 text-right font-mono text-zinc-200">{fmt(previewFlange.pipeOD)} {unit}</td>
                  </tr>
                  <tr>
                    <td className="py-1 px-2 text-zinc-400 font-mono">Weight</td>
                    <td className="py-1 px-2 text-right font-mono text-zinc-200">{previewFlange.weight.toFixed(1)} kg</td>
                    {previewFlange.type === 'WN' && previewFlange.hubLength ? (
                      <>
                        <td className="py-1 px-2 text-[#f97316] font-mono">Hub L</td>
                        <td className="py-1 px-2 text-right font-mono text-zinc-200">{fmt(previewFlange.hubLength)} {unit}</td>
                      </>
                    ) : (
                      <>
                        <td className="py-1 px-2 text-zinc-400 font-mono">Hole Ø</td>
                        <td className="py-1 px-2 text-right font-mono text-zinc-200">{fmt(previewFlange.boltHoleDiameter)} {unit}</td>
                      </>
                    )}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Cards Grid */}
          <div>
            <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-500 mb-2">
              {filteredFlanges.length} {t('tools.flanges.results', { defaultValue: 'resultados' })} — Click para detalle
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
              {filteredFlanges.map((f, i) => (
                <FlangeCard
                  key={`${f.type}-${f.nps}-${i}`}
                  spec={f}
                  onClick={() => setSelectedFlange(f)}
                  fmt={fmt}
                  unit={unit}
                />
              ))}
            </div>
          </div>
        </TabsContent>

        {/* ═══ TAB 2: NOTES ═══ */}
        <TabsContent value="notes" className="mt-4 space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30 space-y-3">
                <h4 className="text-sm font-semibold text-[#f59e0b] uppercase tracking-wider">Tipos de Brida</h4>
                <div className="space-y-3">
                  <div className="p-3 rounded bg-[#f97316]/5 border border-[#f97316]/20">
                    <p className="text-[#f97316] text-xs font-bold mb-1">WN — Weld Neck</p>
                    <p className="text-zinc-400 text-xs">Hub taper provides gradual stress transition. Best for high-pressure, high-temperature, and cyclic service. Butt-welded to pipe.</p>
                  </div>
                  <div className="p-3 rounded bg-[#22d3ee]/5 border border-[#22d3ee]/20">
                    <p className="text-[#22d3ee] text-xs font-bold mb-1">SO — Slip-On</p>
                    <p className="text-zinc-400 text-xs">Pipe slides through and is fillet-welded on both sides. Lower cost, easier alignment. Suitable for low-pressure utility services.</p>
                  </div>
                  <div className="p-3 rounded bg-zinc-800/50 border border-zinc-700/50">
                    <p className="text-zinc-300 text-xs font-bold mb-1">BL — Blind</p>
                    <p className="text-zinc-400 text-xs">Solid disc to close pipe end or vessel nozzle. Used for testing, future connections, or permanent closure. No bore.</p>
                  </div>
                </div>
              </div>

              <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30 space-y-3">
                <h4 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Pressure Classes</h4>
                <div className="space-y-2 text-xs text-zinc-400">
                  <p><strong className="text-zinc-200">Class 150#</strong> — Up to ~20 bar (290 psi) @ ambient</p>
                  <p><strong className="text-zinc-200">Class 300#</strong> — Up to ~50 bar (720 psi) @ ambient</p>
                  <p><strong className="text-zinc-200">Class 600#</strong> — Up to ~100 bar (1440 psi) @ ambient</p>
                  <p className="text-[10px] text-zinc-500 mt-2">* Ratings decrease with temperature per ASME B16.5 Table 2</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="border-l-2 border-[#f59e0b] bg-[#f59e0b]/5 p-5 rounded-r-lg space-y-3">
                <h4 className="text-sm font-semibold text-[#f59e0b] uppercase tracking-wider">Referencia Rápida</h4>
                <ul className="space-y-2 text-xs text-zinc-300">
                  <li className="flex items-start gap-2">
                    <span className="text-[#f59e0b] mt-0.5">•</span>
                    <span><strong className="text-zinc-100">BCD</strong> = Bolt Circle Diameter — diámetro del círculo de pernos</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#f59e0b] mt-0.5">•</span>
                    <span><strong className="text-zinc-100">RF</strong> = Raised Face — cara elevada 1.6mm (Class 150/300)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#f59e0b] mt-0.5">•</span>
                    <span><strong className="text-zinc-100">RTJ</strong> = Ring Type Joint — para Class 600+</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#f59e0b] mt-0.5">•</span>
                    <span><strong className="text-zinc-100">Hub</strong> = Transición cónica entre pipe y flange (solo WN)</span>
                  </li>
                </ul>
              </div>

              <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30 space-y-3">
                <h4 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Standards</h4>
                <div className="space-y-2 text-xs text-zinc-400">
                  <p><strong className="text-zinc-200">ASME B16.5</strong> — Pipe Flanges and Flanged Fittings (NPS 1/2 - 24)</p>
                  <p><strong className="text-zinc-200">ASME B16.47</strong> — Large Diameter Steel Flanges (NPS 26 - 60)</p>
                  <p><strong className="text-zinc-200">ASME PCC-1</strong> — Guidelines for Pressure Boundary Bolted Flange Joint Assembly</p>
                  <p><strong className="text-zinc-200">ASME B16.20</strong> — Metallic Gaskets for Pipe Flanges</p>
                </div>
              </div>

              <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30 space-y-3">
                <h4 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Material</h4>
                <div className="space-y-2 text-xs text-zinc-400">
                  <p><strong className="text-zinc-200">A105</strong> — Carbon Steel (most common)</p>
                  <p><strong className="text-zinc-200">A182 F304/F316</strong> — Stainless Steel</p>
                  <p><strong className="text-zinc-200">A182 F11/F22</strong> — Chrome-Moly Alloy</p>
                  <p><strong className="text-zinc-200">A350 LF2</strong> — Low Temperature Carbon Steel</p>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Footer note */}
      <div className="flex items-start gap-2 text-xs text-zinc-500">
        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>{t('tools.flanges.disclaimer', { defaultValue: 'Dimensiones nominales según ASME B16.5-2020. Verificar siempre con datos del fabricante para adquisición.' })}</span>
      </div>

      {/* Modal */}
      {selectedFlange && (
        <FlangeDetailModal
          spec={selectedFlange}
          onClose={() => setSelectedFlange(null)}
          fmt={fmt}
          unit={unit}
          showInches={showInches}
        />
      )}
    </div>
  );
}