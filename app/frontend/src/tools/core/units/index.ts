/**
 * Core unit conversion system for PipingBox Tools.
 *
 * Convention:
 * - Base units are SI: m, Pa, kg, m³, m², m³/s, N·m, °C.
 * - `convert(value, from, to)` works across any supported units.
 * - `UnitSystem` is a user-facing preference (metric vs imperial).
 *
 * No UI labels here — only symbols and factors.
 * Ticket: PB-TOOLS-FUNCTIONAL-PARITY-001 / W1.A
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

interface UnitDef {
  /** Factor to convert from this unit to the base SI unit. */
  toBase: number;
  /** Unit system the unit belongs to. */
  system: UnitSystem | 'both';
}

const LENGTH: Record<LengthUnit, UnitDef> = {
  mm: { toBase: 0.001, system: 'metric' },
  cm: { toBase: 0.01, system: 'metric' },
  m: { toBase: 1, system: 'metric' },
  in: { toBase: 0.0254, system: 'imperial' },
  ft: { toBase: 0.3048, system: 'imperial' },
};

const PRESSURE: Record<PressureUnit, UnitDef> = {
  Pa: { toBase: 1, system: 'metric' },
  kPa: { toBase: 1000, system: 'metric' },
  bar: { toBase: 100000, system: 'metric' },
  psi: { toBase: 6894.75729, system: 'imperial' },
};

const WEIGHT: Record<WeightUnit, UnitDef> = {
  g: { toBase: 0.001, system: 'metric' },
  kg: { toBase: 1, system: 'metric' },
  lb: { toBase: 0.45359237, system: 'imperial' },
  oz: { toBase: 0.02834952, system: 'imperial' },
  ton_m: { toBase: 1000, system: 'metric' },
  ton_us: { toBase: 907.18474, system: 'imperial' },
  ton_uk: { toBase: 1016.04691, system: 'imperial' },
};

const VOLUME: Record<VolumeUnit, UnitDef> = {
  ml: { toBase: 0.000001, system: 'metric' },
  l: { toBase: 0.001, system: 'metric' },
  m3: { toBase: 1, system: 'metric' },
  gal_us: { toBase: 0.00378541, system: 'imperial' },
  gal_uk: { toBase: 0.00454609, system: 'imperial' },
  ft3: { toBase: 0.0283168, system: 'imperial' },
  bbl: { toBase: 0.158987, system: 'imperial' },
};

const AREA: Record<AreaUnit, UnitDef> = {
  mm2: { toBase: 0.000001, system: 'metric' },
  cm2: { toBase: 0.0001, system: 'metric' },
  m2: { toBase: 1, system: 'metric' },
  in2: { toBase: 0.00064516, system: 'imperial' },
  ft2: { toBase: 0.092903, system: 'imperial' },
};

const FLOW_RATE: Record<FlowRateUnit, UnitDef> = {
  m3h: { toBase: 1 / 3600, system: 'metric' },
  lmin: { toBase: 0.001 / 60, system: 'metric' },
  gpm: { toBase: 0.00378541 / 60, system: 'imperial' },
  cfm: { toBase: 0.0283168 / 60, system: 'imperial' },
};

const TORQUE: Record<TorqueUnit, UnitDef> = {
  Nm: { toBase: 1, system: 'metric' },
  ftlb: { toBase: 1.35581795, system: 'imperial' },
};

const ANGLE: Record<AngleUnit, UnitDef> = {
  deg: { toBase: 1, system: 'both' },
  rad: { toBase: 180 / Math.PI, system: 'both' },
};

const TEMPERATURE: Record<TemperatureUnit, UnitDef> = {
  C: { toBase: 1, system: 'both' },
  F: { toBase: 1, system: 'both' },
  K: { toBase: 1, system: 'both' },
};

const REGISTRY: Record<string, UnitDef> = {
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

export function getUnitSystem(unit: Unit): UnitSystem {
  const def = REGISTRY[unit];
  if (!def) throw new Error(`Unknown unit: ${unit}`);
  if (def.system !== 'both') return def.system;
  return 'metric';
}

/**
 * Convert a scalar value between any two known units.
 * Temperature uses offset-aware conversion.
 */
export function convert(value: number, from: Unit, to: Unit): number {
  if (from === to) return value;

  // Temperature requires offset handling.
  if ((from === 'C' || from === 'F' || from === 'K') && (to === 'C' || to === 'F' || to === 'K')) {
    return convertTemperature(value, from, to);
  }

  const fromDef = REGISTRY[from];
  const toDef = REGISTRY[to];
  if (!fromDef || !toDef) throw new Error(`Unknown unit conversion: ${from} → ${to}`);
  // value_in_base = value * fromDef.toBase
  // value_out = value_in_base / toDef.toBase
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

/**
 * Convert a length in the given unit to millimetres.
 */
export function toMm(value: number, unit: LengthUnit): number {
  return convert(value, unit, 'mm');
}

/**
 * Convert a length from millimetres to the given unit.
 */
export function fromMm(value: number, unit: LengthUnit): number {
  return convert(value, 'mm', unit);
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
