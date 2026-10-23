/**
 * PB-TOOLS-NAV-REORG-001 — per-tool schematic thumbnails for the catalog.
 *
 * Each prefabrication tool gets its own line drawing so the card identifies
 * the geometry the tool solves. Reference/utility tools keep their lucide
 * icons. Strokes follow the app palette: pipes in currentColor (the card
 * icon slot provides the #FF8C00 tone), auxiliary/dimension lines in the
 * neutral gray used across the tool panels.
 *
 * Schematics are indicative, not to scale: they label the geometry family
 * (rolling offset, two-elbow Z, gored bend, comb, elbow cut, branch) and
 * never substitute the tool's own engineering diagram.
 */
import type { ReactElement } from 'react';

export type ToolSchematicId =
  | 'pipe-offset'
  | 'two-elbow-offset'
  | 'mitered-elbow'
  | 'pipe-comb'
  | 'elbow-cut'
  | 'branch-layout';

const AUX = '#A3A9B3';

function Svg({ className, children }: { className?: string; children: ReactElement | ReactElement[] }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/* Quiebro de tubería: two elbows rolling the line to a parallel run. */
function PipeOffset({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M2 8h6l7 8h7" />
      <path d="M8.5 5.5 15 13" stroke={AUX} strokeWidth={1} strokeDasharray="2 2" opacity={0.7} />
    </Svg>
  );
}

/* Desplazamiento con dos codos: coplanar Z, two 90° elbows. */
function TwoElbowOffset({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M2 18h7V6h13" />
      <circle cx="9" cy="18" r="0.6" fill={AUX} stroke="none" />
      <circle cx="9" cy="6" r="0.6" fill={AUX} stroke="none" />
    </Svg>
  );
}

/* Codo a gajos: segmented bend with visible joint lines. */
function MiteredElbow({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M3 21v-6l3-4 4-3h11" />
      <path d="M3 15h4M4.6 13.4l1.8 3.2M6 11l3 2.6" stroke={AUX} strokeWidth={1} opacity={0.7} />
    </Svg>
  );
}

/* Peine de tuberías: parallel runs with staggered terminals. */
function PipeComb({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M2 5h12M2 10h17M2 15h14M2 20h19" />
      <path d="M14 5v15" stroke={AUX} strokeWidth={1} strokeDasharray="2 2" opacity={0.6} />
    </Svg>
  );
}

/* Corte de codos: commercial elbow with a cut plane. */
function ElbowCut({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M3 21v-9c0-4 3-7 7-7h11" />
      <path d="M6 9l7 7" stroke={AUX} strokeWidth={1} strokeDasharray="3 2" opacity={0.8} />
    </Svg>
  );
}

/* Injertos: header with an angled branch. */
function BranchLayout({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M2 9h20" />
      <path d="M13 9l5 9" />
      <path d="M13 9l5-6" stroke={AUX} strokeWidth={1} strokeDasharray="2 2" opacity={0.6} />
    </Svg>
  );
}

const SCHEMATICS: Record<ToolSchematicId, (props: { className?: string }) => ReactElement> = {
  'pipe-offset': PipeOffset,
  'two-elbow-offset': TwoElbowOffset,
  'mitered-elbow': MiteredElbow,
  'pipe-comb': PipeComb,
  'elbow-cut': ElbowCut,
  'branch-layout': BranchLayout,
};

export function ToolSchematic({ id, className }: { id: ToolSchematicId; className?: string }) {
  const Schematic = SCHEMATICS[id];
  return <Schematic className={className} />;
}
