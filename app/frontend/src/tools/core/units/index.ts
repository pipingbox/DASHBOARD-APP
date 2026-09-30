/**
 * Core unit conversion system for PipingBox Tools.
 *
 * Convention:
 * - Base units are SI: m, Pa, kg, m³, m², m³/s, N·m, °C.
 * - Every unit has a physical dimension/category.
 * - `convert(value, from, to)` rejects dimensionally incompatible units at runtime.
 * - Prefer category-specific helpers (`convertLength`, etc.) for type safety.
 *
 * No UI labels here — only symbols and factors.
 * Ticket: PB-TOOLS-FUNCTIONAL-PARITY-001 / W1.A.1
 */

export * from './fractions.ts';

export type UnitSystem = 'metric' | 'imperial';

export type LengthUnit = 'mm' | 'cm' | 'm' | 'in' | 'ft';
export type PressureUnit = 'Pa' | 'kPa' | 'bar' | 'psi';
export type WeightUnit = 'g' | 'kg' | 'lb' | 'oz' | 'ton_m' | 'ton_us' | 'ton_uk';
export type VolumeUnit = 'ml' | 'l' | 'm3' | 'gal_us' | 'gal_uk' | 'ft3' | 'bbl';
export type AreaUnit = 'mm2' | 'cm2' | 'm2' | 'in2' | 'ft2';
export type FlowRateUnit = 'm3h' | 'lmin' | 'gpm' | 'cfm';
export type TorqueUnit = 'Nm' | 'ftlb';
export type AngleUnit = 'deg' | 'rad';
export type TemperatureUnit = 'C' | 'F' | 'K';

export type Unit =
  | LengthUnit
  | PressureUnit
  | WeightUnit
  | VolumeUnit
  | AreaUnit
  | FlowRateUnit
  | TorqueUnit
  | AngleUnit
  | TemperatureUnit;

export type UnitCategory =
  | 'length'
  | 'pressure'
  | 'weight'
  | 'volume'
  | 'area'
  | 'flowRate'
  | 'torque'
  | 'angle'
  | 'temperature';

interface UnitDef {
  /** Physical dimension/category of the unit. */
  category: UnitCategory;
  /** Factor to convert from this unit to the base SI unit. */
  toBase: number;
  /** Unit system the unit belongs to. */
  system: UnitSystem | 'both';
}

const LENGTH: Record<LengthUnit, UnitDef> = {
  mm: { category: 'length', toBase: 0.001, system: 'metric' },
  cm: { category: 'length', toBase: 0.01, system: 'metric' },
  m: { category: 'length', toBase: 1, system: 'metric' },
  in: { category: 'length', toBase: 0.0254, system: 'imperial' },
  ft: { category: 'length', toBase: 0.3048, system: 'imperial' },
};

const PRESSURE: Record<PressureUnit, UnitDef> = {
  Pa: { category: 'pressure', toBase: 1, system: 'metric' },
  kPa: { category: 'pressure', toBase: 1000, system: 'metric' },
  bar: { category: 'pressure', toBase: 100000, system: 'metric' },
  psi: { category: 'pressure', toBase: 6894.75729, system: 'imperial' },
};

const WEIGHT: Record<WeightUnit, UnitDef> = {
  g: { category: 'weight', toBase: 0.001, system: 'metric' },
  kg: { category: 'weight', toBase: 1, system: 'metric' },
  lb: { category: 'weight', toBase: 0.45359237, system: 'imperial' },
  oz: { category: 'weight', toBase: 0.02834952, system: 'imperial' },
  ton_m: { category: 'weight', toBase: 1000, system: 'metric' },
  ton_us: { category: 'weight', toBase: 907.18474, system: 'imperial' },
  ton_uk: { category: 'weight', toBase: 1016.04691, system: 'imperial' },
};

const VOLUME: Record<VolumeUnit, UnitDef> = {
  ml: { category: 'volume', toBase: 0.000001, system: 'metric' },
  l: { category: 'volume', toBase: 0.001, system: 'metric' },
  m3: { category: 'volume', toBase: 1, system: 'metric' },
  gal_us: { category: 'volume', toBase: 0.00378541, system: 'imperial' },
  gal_uk: { category: 'volume', toBase: 0.00454609, system: 'imperial' },
  ft3: { category: 'volume', toBase: 0.0283168, system: 'imperial' },
  bbl: { category: 'volume', toBase: 0.158987, system: 'imperial' },
};

const AREA: Record<AreaUnit, UnitDef> = {
  mm2: { category: 'area', toBase: 0.000001, system: 'metric' },
  cm2: { category: 'area', toBase: 0.0001, system: 'metric' },
  m2: { category: 'area', toBase: 1, system: 'metric' },
  in2: { category: 'area', toBase: 0.00064516, system: 'imperial' },
  ft2: { category: 'area', toBase: 0.092903, system: 'imperial' },
};

const FLOW_RATE: Record<FlowRateUnit, UnitDef> = {
  m3h: { category: 'flowRate', toBase: 1 / 3600, system: 'metric' },
  lmin: { category: 'flowRate', toBase: 0.001 / 60, system: 'metric' },
  gpm: { category: 'flowRate', toBase: 0.00378541 / 60, system: 'imperial' },
  cfm: { category: 'flowRate', toBase: 0.0283168 / 60, system: 'imperial' },
};

const TORQUE: Record<TorqueUnit, UnitDef> = {
  Nm: { category: 'torque', toBase: 1, system: 'metric' },
  ftlb: { category: 'torque', toBase: 1.35581795, system: 'imperial' },
};

const ANGLE: Record<AngleUnit, UnitDef> = {
  deg: { category: 'angle', toBase: 1, system: 'both' },
  rad: { category: 'angle', toBase: 180 / Math.PI, system: 'both' },
};

const TEMPERATURE: Record<TemperatureUnit, UnitDef> = {
  C: { category: 'temperature', toBase: 1, system: 'both' },
  F: { category: 'temperature', toBase: 1, system: 'both' },
  K: { category: 'temperature', toBase: 1, system: 'both' },
};

const REGISTRY: Record<Unit, UnitDef> = {
  ...LENGTH,
  ...PRESSURE,
  ...WEIGHT,
  ...VOLUME,
  ...AREA,
  ...FLOW_RATE,
  ...TORQUE,
  ...ANGLE,
  ...TEMPERATURE,
};

export function isKnownUnit(unit: string): unit is Unit {
  return unit in REGISTRY;
}

export function getUnitCategory(unit: Unit): UnitCategory {
  const def = REGISTRY[unit];
  if (!def) throw new Error(`Unknown unit: ${unit}`);
  return def.category;
}

export function getUnitSystem(unit: Unit): UnitSystem {
  const def = REGISTRY[unit];
  if (!def) throw new Error(`Unknown unit: ${unit}`);
  if (def.system !== 'both') return def.system;
  return 'metric';
}

/**
 * Convert a scalar value between any two known units of the SAME dimension.
 * Rejects dimensionally incompatible units at runtime.
 * Temperature uses offset-aware conversion and can only convert to temperature.
 */
export function convert(value: number, from: Unit, to: Unit): number {
  if (from === to) return value;

  const fromDef = REGISTRY[from];
  const toDef = REGISTRY[to];
  if (!fromDef || !toDef) throw new Error(`Unknown unit conversion: ${from} → ${to}`);
  if (fromDef.category !== toDef.category) {
    throw new Error(`Incompatible dimensions: ${from} (${fromDef.category}) → ${to} (${toDef.category})`);
  }

  if (fromDef.category === 'temperature') {
    return convertTemperature(value, from as TemperatureUnit, to as TemperatureUnit);
  }

  return (value * fromDef.toBase) / toDef.toBase;
}

function convertTemperature(value: number, from: TemperatureUnit, to: TemperatureUnit): number {
  let celsius: number;
  switch (from) {
    case 'C':
      celsius = value;
      break;
    case 'F':
      celsius = (value - 32) * (5 / 9);
      break;
    case 'K':
      celsius = value - 273.15;
      break;
  }
  switch (to) {
    case 'C':
      return celsius;
    case 'F':
      return celsius * (9 / 5) + 32;
    case 'K':
      return celsius + 273.15;
  }
}

/** Type-safe length conversion. */
export function convertLength(value: number, from: LengthUnit, to: LengthUnit): number {
  return convert(value, from, to);
}

/** Type-safe pressure conversion. */
export function convertPressure(value: number, from: PressureUnit, to: PressureUnit): number {
  return convert(value, from, to);
}

/** Type-safe weight conversion. */
export function convertWeight(value: number, from: WeightUnit, to: WeightUnit): number {
  return convert(value, from, to);
}

/** Type-safe volume conversion. */
export function convertVolume(value: number, from: VolumeUnit, to: VolumeUnit): number {
  return convert(value, from, to);
}

/** Type-safe area conversion. */
export function convertArea(value: number, from: AreaUnit, to: AreaUnit): number {
  return convert(value, from, to);
}

/** Type-safe flow-rate conversion. */
export function convertFlowRate(value: number, from: FlowRateUnit, to: FlowRateUnit): number {
  return convert(value, from, to);
}

/** Type-safe torque conversion. */
export function convertTorque(value: number, from: TorqueUnit, to: TorqueUnit): number {
  return convert(value, from, to);
}

/** Type-safe angle conversion. */
export function convertAngle(value: number, from: AngleUnit, to: AngleUnit): number {
  return convert(value, from, to);
}

/** Type-safe temperature conversion. */
export function convertTemperatureTyped(value: number, from: TemperatureUnit, to: TemperatureUnit): number {
  return convert(value, from, to);
}

/**
 * Convert a length in the given unit to millimetres.
 */
export function toMm(value: number, unit: LengthUnit): number {
  return convertLength(value, unit, 'mm');
}

/**
 * Convert a length from millimetres to the given unit.
 */
export function fromMm(value: number, unit: LengthUnit): number {
  return convertLength(value, 'mm', unit);
}

/**
 * Return the preferred display unit for a dimension category and unit system.
 */
export function defaultLengthUnit(system: UnitSystem): LengthUnit {
  return system === 'metric' ? 'mm' : 'in';
}

export function defaultPressureUnit(system: UnitSystem): PressureUnit {
  return system === 'metric' ? 'bar' : 'psi';
}

export function defaultWeightUnit(system: UnitSystem): WeightUnit {
  return system === 'metric' ? 'kg' : 'lb';
}

export function defaultVolumeUnit(system: UnitSystem): VolumeUnit {
  return system === 'metric' ? 'l' : 'gal_us';
}

export function defaultTorqueUnit(system: UnitSystem): TorqueUnit {
  return system === 'metric' ? 'Nm' : 'ftlb';
}

/**
 * List units of a given system for a dimension category.
 * Used by UI selectors.
 */
export const LENGTH_UNITS: LengthUnit[] = ['mm', 'cm', 'm', 'in', 'ft'];
export const PRESSURE_UNITS: PressureUnit[] = ['Pa', 'kPa', 'bar', 'psi'];
export const WEIGHT_UNITS: WeightUnit[] = ['g', 'kg', 'lb', 'oz', 'ton_m', 'ton_us', 'ton_uk'];
export const VOLUME_UNITS: VolumeUnit[] = ['ml', 'l', 'm3', 'gal_us', 'gal_uk', 'ft3', 'bbl'];
export const AREA_UNITS: AreaUnit[] = ['mm2', 'cm2', 'm2', 'in2', 'ft2'];
export const FLOW_RATE_UNITS: FlowRateUnit[] = ['m3h', 'lmin', 'gpm', 'cfm'];
export const TORQUE_UNITS: TorqueUnit[] = ['Nm', 'ftlb'];
export const ANGLE_UNITS: AngleUnit[] = ['deg', 'rad'];
export const TEMPERATURE_UNITS: TemperatureUnit[] = ['C', 'F', 'K'];
