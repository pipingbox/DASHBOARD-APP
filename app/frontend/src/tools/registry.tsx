import { lazy, ComponentType, Suspense } from 'react';
import {
  Ruler,
  Calculator,
  Gauge,
  Thermometer,
  CircuitBoard,
  Table2,
  GitBranch,
  Scissors,
  BookOpen,
  Library,
  Wrench,
  Droplets,
  Weight,
  type LucideIcon,
} from 'lucide-react';

// ARCH-002: Tool registry. Each tool is a lazy-loaded module.
// To add a new tool: create src/tools/<name>/<Component>.tsx, add entry here.
// Tools.tsx iterates this registry — no switch/case needed.

export interface ToolDefinition {
  key: string;
  nameKey: string;
  icon: LucideIcon;
  block: 'fabrication' | 'design' | 'library' | 'inspection' | 'utility';
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
const ThermalExpansion = lazy(() => import('@/tools/thermal-expansion/ThermalExpansion'));
const FlangeRating = lazy(() => import('@/tools/flange-rating/FlangeRating'));
const FittingTakeOff = lazy(() => import('@/tools/fitting-takeoff/FittingTakeOff'));
const FlangeLibrary = lazy(() => import('@/tools/flange-library/FlangeLibrary').then((m) => ({ default: m.FlangeLibrary })));
const BranchTemplate = lazy(() => import('@/tools/branch-template/BranchTemplate').then((m) => ({ default: m.BranchTemplate })));
const AccessoriesLibrary = lazy(() => import('@/components/tools/AccessoriesLibrary'));
const PrefabSuite = lazy(() => import('@/tools/prefab-suite/PrefabSuite'));
const PipeVolume = lazy(() => import('@/tools/pipe-volume/PipeVolume'));
const WeightCalculator = lazy(() => import('@/tools/weight-calc/WeightCalculator'));

export const TOOL_REGISTRY: ToolDefinition[] = [
  // 🏭 Fabrication
  {
    key: 'elbow-cut',
    nameKey: 'tools.elbowCut',
    icon: Scissors,
    block: 'fabrication',
    component: () => null, // rendered directly in Tools.tsx (FEAT-001)
  },
  {
    key: 'fitting-takeoff',
    nameKey: 'tools.fittingTakeOff',
    icon: GitBranch,
    block: 'fabrication',
    component: FittingTakeOff,
    isNew: true,
  },
  {
    key: 'branch-template',
    nameKey: 'tools.branchTemplate',
    icon: Scissors,
    block: 'fabrication',
    component: BranchTemplate,
    isNew: true,
  },
  {
    key: 'prefab-suite',
    nameKey: 'tools.prefabSuite',
    icon: Wrench,
    block: 'fabrication',
    component: PrefabSuite,
    isNew: true,
  },
  // 📐 Design & Calculation
  {
    key: 'wall-thickness',
    nameKey: 'tools.wallThickness',
    icon: Ruler,
    block: 'design',
    component: WallThickness,
  },
  {
    key: 'pressure-drop',
    nameKey: 'tools.pressureDrop',
    icon: Gauge,
    block: 'design',
    component: PressureDrop,
    isNew: true,
  },
  {
    key: 'pipe-volume',
    nameKey: 'tools.pipeVolume',
    icon: Droplets,
    block: 'design',
    component: PipeVolume,
    isNew: true,
  },
  {
    key: 'weight-calc',
    nameKey: 'tools.weightCalc',
    icon: Weight,
    block: 'design',
    component: WeightCalculator,
    isNew: true,
  },
  {
    key: 'thermal-expansion',
    nameKey: 'tools.thermalExpansion',
    icon: Thermometer,
    block: 'design',
    component: ThermalExpansion,
    isNew: true,
  },
  // 📚 Technical Library
  {
    key: 'pipe-dimensions',
    nameKey: 'tools.pipeDataTables',
    icon: Table2,
    block: 'library',
    component: PipeDataTables,
    isNew: true,
  },
  {
    key: 'flange-library',
    nameKey: 'tools.flangeLibrary',
    icon: BookOpen,
    block: 'library',
    component: FlangeLibrary,
    isNew: true,
  },
  {
    key: 'accessories-library',
    nameKey: 'tools.accessoriesLibrary',
    icon: Library,
    block: 'library',
    component: AccessoriesLibrary,
    isNew: true,
  },
  // 🔍 Inspection & Codes
  {
    key: 'flange-rating',
    nameKey: 'tools.flangeRating',
    icon: CircuitBoard,
    block: 'inspection',
    component: FlangeRating,
    isNew: true,
  },
  // 🔧 Utilities
  {
    key: 'unit-converter',
    nameKey: 'tools.unitConverter',
    icon: Calculator,
    block: 'utility',
    component: UnitConverter,
    isNew: true,
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
