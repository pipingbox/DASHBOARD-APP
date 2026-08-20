// PB-030: Pipe inner diameter data by NPS + Schedule
// Source: ASME B36.10M / B36.19M

export interface PipeSize {
  nps: string;
  dn: number;
  od_mm: number;
}

export const PIPE_SIZES: PipeSize[] = [
  { nps: '1/2', dn: 15, od_mm: 21.3 },
  { nps: '3/4', dn: 20, od_mm: 26.7 },
  { nps: '1', dn: 25, od_mm: 33.4 },
  { nps: '1-1/4', dn: 32, od_mm: 42.2 },
  { nps: '1-1/2', dn: 40, od_mm: 48.3 },
  { nps: '2', dn: 50, od_mm: 60.3 },
  { nps: '2-1/2', dn: 65, od_mm: 73.0 },
  { nps: '3', dn: 80, od_mm: 88.9 },
  { nps: '4', dn: 100, od_mm: 114.3 },
  { nps: '5', dn: 125, od_mm: 141.3 },
  { nps: '6', dn: 150, od_mm: 168.3 },
  { nps: '8', dn: 200, od_mm: 219.1 },
  { nps: '10', dn: 250, od_mm: 273.0 },
  { nps: '12', dn: 300, od_mm: 323.8 },
  { nps: '14', dn: 350, od_mm: 355.6 },
  { nps: '16', dn: 400, od_mm: 406.4 },
  { nps: '18', dn: 450, od_mm: 457.2 },
  { nps: '20', dn: 500, od_mm: 508.0 },
  { nps: '24', dn: 600, od_mm: 609.6 },
  { nps: '30', dn: 750, od_mm: 762.0 },
  { nps: '36', dn: 900, od_mm: 914.4 },
];

export type Schedule = 'STD' | 'XS' | 'XXS' | 'SCH10' | 'SCH20' | 'SCH40' | 'SCH60' | 'SCH80' | 'SCH100' | 'SCH120' | 'SCH140' | 'SCH160';

export const SCHEDULES: Schedule[] = ['SCH10', 'SCH20', 'SCH40', 'STD', 'SCH60', 'SCH80', 'XS', 'SCH100', 'SCH120', 'SCH140', 'SCH160', 'XXS'];

// Wall thickness by NPS and Schedule (mm) — ASME B36.10M
// Key: "NPS|Schedule" → wall thickness in mm
const WALL_THICKNESS: Record<string, number> = {
  // 1/2"
  '1/2|SCH10': 1.65, '1/2|SCH40': 2.77, '1/2|STD': 2.77, '1/2|SCH80': 3.73, '1/2|XS': 3.73, '1/2|SCH160': 4.75, '1/2|XXS': 7.47,
  // 3/4"
  '3/4|SCH10': 1.65, '3/4|SCH40': 2.87, '3/4|STD': 2.87, '3/4|SCH80': 3.91, '3/4|XS': 3.91, '3/4|SCH160': 5.56, '3/4|XXS': 7.82,
  // 1"
  '1|SCH10': 1.65, '1|SCH40': 3.38, '1|STD': 3.38, '1|SCH80': 4.55, '1|XS': 4.55, '1|SCH160': 6.35, '1|XXS': 9.09,
  // 1-1/4"
  '1-1/4|SCH10': 1.65, '1-1/4|SCH40': 3.56, '1-1/4|STD': 3.56, '1-1/4|SCH80': 4.85, '1-1/4|XS': 4.85, '1-1/4|SCH160': 6.35, '1-1/4|XXS': 9.70,
  // 1-1/2"
  '1-1/2|SCH10': 1.65, '1-1/2|SCH40': 3.68, '1-1/2|STD': 3.68, '1-1/2|SCH80': 5.08, '1-1/2|XS': 5.08, '1-1/2|SCH160': 7.14, '1-1/2|XXS': 10.15,
  // 2"
  '2|SCH10': 1.65, '2|SCH40': 3.91, '2|STD': 3.91, '2|SCH80': 5.54, '2|XS': 5.54, '2|SCH160': 8.74, '2|XXS': 11.07,
  // 2-1/2"
  '2-1/2|SCH10': 2.11, '2-1/2|SCH40': 5.16, '2-1/2|STD': 5.16, '2-1/2|SCH80': 7.01, '2-1/2|XS': 7.01, '2-1/2|SCH160': 9.53, '2-1/2|XXS': 14.02,
  // 3"
  '3|SCH10': 2.11, '3|SCH40': 5.49, '3|STD': 5.49, '3|SCH80': 7.62, '3|XS': 7.62, '3|SCH160': 11.13, '3|XXS': 15.24,
  // 4"
  '4|SCH10': 2.11, '4|SCH20': 3.05, '4|SCH40': 6.02, '4|STD': 6.02, '4|SCH60': 7.92, '4|SCH80': 8.56, '4|XS': 8.56, '4|SCH100': 11.13, '4|SCH120': 13.49, '4|SCH140': 17.12, '4|SCH160': 17.12, '4|XXS': 17.12,
  // 5"
  '5|SCH10': 2.77, '5|SCH20': 3.40, '5|SCH40': 6.55, '5|STD': 6.55, '5|SCH60': 9.53, '5|SCH80': 9.53, '5|XS': 9.53, '5|SCH100': 12.70, '5|SCH120': 15.88, '5|SCH140': 19.05, '5|SCH160': 19.05, '5|XXS': 19.05,
  // 6"
  '6|SCH10': 2.77, '6|SCH20': 3.40, '6|SCH40': 7.11, '6|STD': 7.11, '6|SCH60': 10.97, '6|SCH80': 10.97, '6|XS': 10.97, '6|SCH100': 14.27, '6|SCH120': 18.26, '6|SCH140': 21.95, '6|SCH160': 21.95, '6|XXS': 21.95,
  // 8"
  '8|SCH10': 2.77, '8|SCH20': 3.76, '8|SCH40': 8.18, '8|STD': 8.18, '8|SCH60': 10.31, '8|SCH80': 12.70, '8|XS': 12.70, '8|SCH100': 15.09, '8|SCH120': 18.26, '8|SCH140': 20.62, '8|SCH160': 23.01, '8|XXS': 22.23,
  // 10"
  '10|SCH10': 3.40, '10|SCH20': 4.78, '10|SCH40': 9.27, '10|STD': 9.27, '10|SCH60': 12.70, '10|SCH80': 15.09, '10|XS': 12.70, '10|SCH100': 18.26, '10|SCH120': 21.44, '10|SCH140': 25.40, '10|SCH160': 28.58, '10|XXS': 25.40,
  // 12"
  '12|SCH10': 3.96, '12|SCH20': 6.35, '12|SCH40': 10.31, '12|STD': 9.53, '12|SCH60': 14.27, '12|SCH80': 17.48, '12|XS': 12.70, '12|SCH100': 21.44, '12|SCH120': 25.40, '12|SCH140': 28.58, '12|SCH160': 33.32, '12|XXS': 25.40,
  // 14"
  '14|SCH10': 3.96, '14|SCH20': 6.35, '14|SCH40': 11.13, '14|STD': 9.53, '14|SCH60': 15.09, '14|SCH80': 19.05, '14|XS': 12.70, '14|SCH100': 23.83, '14|SCH120': 27.79, '14|SCH140': 31.75, '14|SCH160': 35.71,
  // 16"
  '16|SCH10': 3.96, '16|SCH20': 6.35, '16|SCH40': 12.70, '16|STD': 9.53, '16|SCH60': 16.66, '16|SCH80': 21.44, '16|XS': 12.70, '16|SCH100': 26.19, '16|SCH120': 30.96, '16|SCH140': 36.53, '16|SCH160': 40.49,
  // 18"
  '18|SCH10': 3.96, '18|SCH20': 6.35, '18|SCH40': 14.27, '18|STD': 9.53, '18|SCH60': 19.05, '18|SCH80': 23.83, '18|XS': 12.70, '18|SCH100': 29.36, '18|SCH120': 34.93, '18|SCH140': 39.67, '18|SCH160': 45.24,
  // 20"
  '20|SCH10': 3.96, '20|SCH20': 6.35, '20|SCH40': 15.09, '20|STD': 9.53, '20|SCH60': 20.62, '20|SCH80': 26.19, '20|XS': 12.70, '20|SCH100': 32.54, '20|SCH120': 38.10, '20|SCH140': 44.45, '20|SCH160': 49.99,
  // 24"
  '24|SCH10': 3.96, '24|SCH20': 6.35, '24|SCH40': 17.48, '24|STD': 9.53, '24|SCH60': 24.61, '24|SCH80': 30.96, '24|XS': 12.70, '24|SCH100': 38.89, '24|SCH120': 46.02, '24|SCH140': 52.37, '24|SCH160': 59.54,
  // 30"
  '30|SCH10': 4.78, '30|SCH20': 7.92, '30|STD': 9.53, '30|XS': 12.70, '30|SCH40': 15.88, '30|SCH60': 23.83, '30|SCH80': 31.75, '30|SCH100': 38.10, '30|SCH120': 44.45, '30|SCH140': 49.99, '30|SCH160': 55.56,
  // 36"
  '36|SCH10': 4.78, '36|SCH20': 7.92, '36|STD': 9.53, '36|XS': 12.70, '36|SCH40': 19.05, '36|SCH60': 28.58, '36|SCH80': 38.10, '36|SCH100': 44.45, '36|SCH120': 49.99, '36|SCH140': 55.56, '36|SCH160': 63.50,
};

/**
 * Get wall thickness for a given NPS + Schedule.
 * Returns undefined if the combination doesn't exist.
 */
export function getWallThickness(nps: string, schedule: Schedule): number | undefined {
  return WALL_THICKNESS[`${nps}|${schedule}`];
}

/**
 * Get inner diameter from NPS + Schedule.
 * ID = OD - 2 × wall thickness.
 */
export function getInnerDiameter(nps: string, schedule: Schedule): number | undefined {
  const pipe = PIPE_SIZES.find((p) => p.nps === nps);
  if (!pipe) return undefined;
  const wt = getWallThickness(nps, schedule);
  if (!wt) return undefined;
  return pipe.od_mm - 2 * wt;
}

/**
 * Get available schedules for a given NPS.
 */
export function getAvailableSchedules(nps: string): Schedule[] {
  return SCHEDULES.filter((sch) => WALL_THICKNESS[`${nps}|${sch}`] !== undefined);
}

export interface VolumeSegment {
  id: number;
  nps: string;
  schedule: Schedule;
  length_mm: number;
  id_mm: number;
  volume_liters: number;
}

/**
 * Calculate volume of a pipe segment.
 * V = π × (ID/2)² × L (in mm³) → liters = mm³ / 1e6
 */
export function calculateVolume(id_mm: number, length_mm: number): number {
  const r = id_mm / 2;
  return (Math.PI * r * r * length_mm) / 1e6; // liters
}

/** Convert liters to m³ */
export function litersToM3(liters: number): number {
  return liters / 1000;
}

/** Convert liters to US gallons */
export function litersToGallons(liters: number): number {
  return liters * 0.264172;
}
