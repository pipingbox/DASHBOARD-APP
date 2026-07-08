// PB-031: Materials and geometric profile data for weight calculator

export interface Material {
  key: string;
  name_en: string;
  name_es: string;
  density: number; // kg/m³
}

export const MATERIALS: Material[] = [
  { key: 'carbon-steel', name_en: 'Carbon Steel', name_es: 'Acero Carbono', density: 7850 },
  { key: 'ss304', name_en: 'Stainless 304', name_es: 'Inox 304', density: 7930 },
  { key: 'ss316', name_en: 'Stainless 316', name_es: 'Inox 316', density: 7980 },
  { key: 'aluminum', name_en: 'Aluminum', name_es: 'Aluminio', density: 2700 },
  { key: 'copper', name_en: 'Copper', name_es: 'Cobre', density: 8940 },
  { key: 'pvc', name_en: 'PVC', name_es: 'PVC', density: 1400 },
  { key: 'pe', name_en: 'Polyethylene (PE)', name_es: 'Polietileno (PE)', density: 950 },
  { key: 'pp', name_en: 'Polypropylene (PP)', name_es: 'Polipropileno (PP)', density: 910 },
];

export type ProfileType =
  | 'round-tube' | 'square-tube' | 'rect-tube' | 'plate'
  | 'round-bar' | 'square-bar' | 'hollow-sphere' | 'solid-sphere';

export interface ProfileDefinition {
  key: ProfileType;
  name_en: string;
  name_es: string;
  /** SVG viewBox path for cross-section */
  fields: ProfileField[];
}

export interface ProfileField {
  key: string;
  label_en: string;
  label_es: string;
  unit: 'mm';
  min: number;
}

export const PROFILE_DEFINITIONS: ProfileDefinition[] = [
  {
    key: 'round-tube',
    name_en: 'Round Tube',
    name_es: 'Tubo Redondo',
    fields: [
      { key: 'od', label_en: 'Outer Ø', label_es: 'Ø Exterior', unit: 'mm', min: 1 },
      { key: 'wt', label_en: 'Wall Thickness', label_es: 'Espesor', unit: 'mm', min: 0.1 },
    ],
  },
  {
    key: 'square-tube',
    name_en: 'Square Tube',
    name_es: 'Tubo Cuadrado',
    fields: [
      { key: 'side', label_en: 'Side', label_es: 'Lado', unit: 'mm', min: 1 },
      { key: 'wt', label_en: 'Wall Thickness', label_es: 'Espesor', unit: 'mm', min: 0.1 },
    ],
  },
  {
    key: 'rect-tube',
    name_en: 'Rectangular Tube',
    name_es: 'Tubo Rectangular',
    fields: [
      { key: 'width', label_en: 'Width', label_es: 'Ancho', unit: 'mm', min: 1 },
      { key: 'height', label_en: 'Height', label_es: 'Alto', unit: 'mm', min: 1 },
      { key: 'wt', label_en: 'Wall Thickness', label_es: 'Espesor', unit: 'mm', min: 0.1 },
    ],
  },
  {
    key: 'plate',
    name_en: 'Plate / Sheet',
    name_es: 'Chapa / Plancha',
    fields: [
      { key: 'width', label_en: 'Width', label_es: 'Ancho', unit: 'mm', min: 1 },
      { key: 'thickness', label_en: 'Thickness', label_es: 'Espesor', unit: 'mm', min: 0.1 },
    ],
  },
  {
    key: 'round-bar',
    name_en: 'Round Bar',
    name_es: 'Redondo Macizo',
    fields: [
      { key: 'od', label_en: 'Diameter', label_es: 'Diámetro', unit: 'mm', min: 1 },
    ],
  },
  {
    key: 'square-bar',
    name_en: 'Square Bar',
    name_es: 'Cuadrado Macizo',
    fields: [
      { key: 'side', label_en: 'Side', label_es: 'Lado', unit: 'mm', min: 1 },
    ],
  },
  {
    key: 'solid-sphere',
    name_en: 'Solid Sphere',
    name_es: 'Esfera Maciza',
    fields: [
      { key: 'od', label_en: 'Diameter', label_es: 'Diámetro', unit: 'mm', min: 1 },
    ],
  },
  {
    key: 'hollow-sphere',
    name_en: 'Hollow Sphere',
    name_es: 'Esfera Hueca',
    fields: [
      { key: 'od', label_en: 'Outer Ø', label_es: 'Ø Exterior', unit: 'mm', min: 1 },
      { key: 'wt', label_en: 'Wall Thickness', label_es: 'Espesor', unit: 'mm', min: 0.1 },
    ],
  },
];

/**
 * Calculate cross-sectional area in mm² for a given profile type.
 * Returns the metal area (for hollow profiles, only the material area).
 */
export function crossSectionArea(profile: ProfileType, dims: Record<string, number>): number {
  switch (profile) {
    case 'round-tube': {
      const od = dims.od ?? 0;
      const wt = dims.wt ?? 0;
      const id = od - 2 * wt;
      return (Math.PI / 4) * (od * od - Math.max(0, id * id));
    }
    case 'square-tube': {
      const s = dims.side ?? 0;
      const wt = dims.wt ?? 0;
      const inner = s - 2 * wt;
      return s * s - Math.max(0, inner * inner);
    }
    case 'rect-tube': {
      const w = dims.width ?? 0;
      const h = dims.height ?? 0;
      const wt = dims.wt ?? 0;
      return w * h - Math.max(0, (w - 2 * wt) * (h - 2 * wt));
    }
    case 'plate': {
      const w = dims.width ?? 0;
      const t = dims.thickness ?? 0;
      return w * t;
    }
    case 'round-bar': {
      const d = dims.od ?? 0;
      return (Math.PI / 4) * d * d;
    }
    case 'square-bar': {
      const s = dims.side ?? 0;
      return s * s;
    }
    case 'solid-sphere':
    case 'hollow-sphere':
      return 0; // Not linear — handled separately
    default:
      return 0;
  }
}

/**
 * Calculate weight per meter (kg/m) for linear profiles.
 * weight_per_m = area_mm² × density_kg/m³ / 1e6
 */
export function weightPerMeter(profile: ProfileType, dims: Record<string, number>, density: number): number {
  const area = crossSectionArea(profile, dims);
  return (area * density) / 1e6;
}

/**
 * Calculate total weight for a sphere (kg).
 */
export function sphereWeight(profile: 'solid-sphere' | 'hollow-sphere', dims: Record<string, number>, density: number): number {
  if (profile === 'solid-sphere') {
    const d = dims.od ?? 0;
    const r = d / 2;
    const volume_mm3 = (4 / 3) * Math.PI * r * r * r;
    return (volume_mm3 * density) / 1e9; // mm³ to m³ = /1e9, then × density
  } else {
    const od = dims.od ?? 0;
    const wt = dims.wt ?? 0;
    const ro = od / 2;
    const ri = Math.max(0, ro - wt);
    const volume_mm3 = (4 / 3) * Math.PI * (ro * ro * ro - ri * ri * ri);
    return (volume_mm3 * density) / 1e9;
  }
}
