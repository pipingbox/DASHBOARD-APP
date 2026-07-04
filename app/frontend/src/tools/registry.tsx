import { lazy, ComponentType, Suspense } from 'react';
import {
  Ruler,
  Calculator,
  Gauge,
  Thermometer,
  Beaker,
  CircuitBoard,
  Table2,
  GitBranch,
  Scissors,
  type LucideIcon,
} from 'lucide-react';

// ARCH-002: Tool registry. Each tool is a lazy-loaded module.
// To add a new tool: create src/tools/<name>/<Component>.tsx, add entry here.
// Tools.tsx iterates this registry — no switch/case needed.

export interface ToolDefinition {
  key: string;
  nameKey: string;
  icon: LucideIcon;
  categoryKey: string;
  component: ComponentType<{ user?: { id: string } | null }>;
  isPremium?: boolean;
  isNew?: boolean;
  isBeta?: boolean;
}

// Lazy-loaded tool components for better bundle splitting
const WallThickness = lazy(() => import('@/pages/Tools').then((m) => ({ default: m.default })));
const UnitConverter = lazy(() => import('@/tools/unit-converter/UnitConverter'));
const PipeDataTables = lazy(() => import('@/tools/pipe-data-tables/PipeDataTables'));
const PressureDrop = lazy(() => import('@/tools/pressure-drop/PressureDrop'));
const ReynoldsCalculator = lazy(() => import('@/tools/reynolds/ReynoldsCalculator'));
const ThermalExpansion = lazy(() => import('@/tools/thermal-expansion/ThermalExpansion'));
const FlangeRating = lazy(() => import('@/tools/flange-rating/FlangeRating'));
const FittingTakeOff = lazy(() => import('@/tools/fitting-takeoff/FittingTakeOff'));

export const TOOL_REGISTRY: ToolDefinition[] = [
  {
    key: 'wall-thickness',
    nameKey: 'tools.wallThickness',
    icon: Ruler,
    categoryKey: 'tools.categoryDesign',
    component: WallThickness,
  },
  {
    key: 'unit-converter',
    nameKey: 'tools.unitConverter',
    icon: Calculator,
    categoryKey: 'tools.categoryUtility',
    component: UnitConverter,
    isNew: true,
  },
  {
    key: 'pipe-dimensions',
    nameKey: 'tools.pipeDataTables',
    icon: Table2,
    categoryKey: 'tools.categoryReference',
    component: PipeDataTables,
    isNew: true,
  },
  {
    key: 'pressure-drop',
    nameKey: 'tools.pressureDrop',
    icon: Gauge,
    categoryKey: 'tools.categoryHydraulics',
    component: PressureDrop,
    isNew: true,
  },
  {
    key: 'reynolds',
    nameKey: 'tools.reynolds',
    icon: Beaker,
    categoryKey: 'tools.categoryHydraulics',
    component: ReynoldsCalculator,
    isNew: true,
  },
  {
    key: 'thermal-expansion',
    nameKey: 'tools.thermalExpansion',
    icon: Thermometer,
    categoryKey: 'tools.categoryStress',
    component: ThermalExpansion,
    isNew: true,
  },
  {
    key: 'flange-rating',
    nameKey: 'tools.flangeRating',
    icon: CircuitBoard,
    categoryKey: 'tools.categoryReference',
    component: FlangeRating,
    isNew: true,
  },
  {
    key: 'fitting-takeoff',
    nameKey: 'tools.fittingTakeOff',
    icon: GitBranch,
    categoryKey: 'tools.categoryReference',
    component: FittingTakeOff,
    isNew: true,
  },
  {
    key: 'elbow-cut',
    nameKey: 'tools.elbowCut',
    icon: Scissors,
    categoryKey: 'tools.categoryDesign',
    // Placeholder until FEAT-001 is implemented
    component: () => null,
  },
];

export function ToolLoader({
  tool,
  user,
}: {
  tool: ToolDefinition;
  user?: { id: string } | null;
}) {
  const Component = tool.component;
  return (
    <Suspense fallback={<div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[#f59e0b] border-t-transparent" /></div>}>
      <Component user={user} />
    </Suspense>
  );
}
