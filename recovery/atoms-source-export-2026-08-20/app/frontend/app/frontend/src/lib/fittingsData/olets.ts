import type { FittingEntry } from './types';

/**
 * MSS SP-97 — Integrally Reinforced Forged Branch Outlet Fittings (Olets)
 * Weldolet, Sockolet, Thredolet dimensions.
 * Primary advance: height (center of run to top of olet).
 */

interface OletRaw {
  type: 'Weldolet' | 'Sockolet' | 'Thredolet';
  headerNPS: string;
  branchNPS: string;
  height: number; // mm — center of header to top of outlet
  baseDia: number; // mm — base opening diameter
}

const RAW: OletRaw[] = [
  // ─── Weldolets (run × branch) ───
  { type: 'Weldolet', headerNPS: '2"',   branchNPS: '1/2"',   height: 51,  baseDia: 21.3 },
  { type: 'Weldolet', headerNPS: '2"',   branchNPS: '3/4"',   height: 51,  baseDia: 26.7 },
  { type: 'Weldolet', headerNPS: '2"',   branchNPS: '1"',     height: 57,  baseDia: 33.4 },
  { type: 'Weldolet', headerNPS: '3"',   branchNPS: '1/2"',   height: 57,  baseDia: 21.3 },
  { type: 'Weldolet', headerNPS: '3"',   branchNPS: '3/4"',   height: 57,  baseDia: 26.7 },
  { type: 'Weldolet', headerNPS: '3"',   branchNPS: '1"',     height: 57,  baseDia: 33.4 },
  { type: 'Weldolet', headerNPS: '3"',   branchNPS: '1-1/2"', height: 64,  baseDia: 48.3 },
  { type: 'Weldolet', headerNPS: '3"',   branchNPS: '2"',     height: 70,  baseDia: 60.3 },
  { type: 'Weldolet', headerNPS: '4"',   branchNPS: '1/2"',   height: 64,  baseDia: 21.3 },
  { type: 'Weldolet', headerNPS: '4"',   branchNPS: '1"',     height: 64,  baseDia: 33.4 },
  { type: 'Weldolet', headerNPS: '4"',   branchNPS: '1-1/2"', height: 70,  baseDia: 48.3 },
  { type: 'Weldolet', headerNPS: '4"',   branchNPS: '2"',     height: 76,  baseDia: 60.3 },
  { type: 'Weldolet', headerNPS: '4"',   branchNPS: '3"',     height: 83,  baseDia: 88.9 },
  { type: 'Weldolet', headerNPS: '6"',   branchNPS: '1"',     height: 70,  baseDia: 33.4 },
  { type: 'Weldolet', headerNPS: '6"',   branchNPS: '2"',     height: 83,  baseDia: 60.3 },
  { type: 'Weldolet', headerNPS: '6"',   branchNPS: '3"',     height: 89,  baseDia: 88.9 },
  { type: 'Weldolet', headerNPS: '6"',   branchNPS: '4"',     height: 95,  baseDia: 114.3 },
  { type: 'Weldolet', headerNPS: '8"',   branchNPS: '1"',     height: 76,  baseDia: 33.4 },
  { type: 'Weldolet', headerNPS: '8"',   branchNPS: '2"',     height: 89,  baseDia: 60.3 },
  { type: 'Weldolet', headerNPS: '8"',   branchNPS: '3"',     height: 95,  baseDia: 88.9 },
  { type: 'Weldolet', headerNPS: '8"',   branchNPS: '4"',     height: 102, baseDia: 114.3 },
  { type: 'Weldolet', headerNPS: '8"',   branchNPS: '6"',     height: 114, baseDia: 168.3 },
  { type: 'Weldolet', headerNPS: '10"',  branchNPS: '2"',     height: 95,  baseDia: 60.3 },
  { type: 'Weldolet', headerNPS: '10"',  branchNPS: '4"',     height: 108, baseDia: 114.3 },
  { type: 'Weldolet', headerNPS: '10"',  branchNPS: '6"',     height: 121, baseDia: 168.3 },
  { type: 'Weldolet', headerNPS: '10"',  branchNPS: '8"',     height: 133, baseDia: 219.1 },
  { type: 'Weldolet', headerNPS: '12"',  branchNPS: '2"',     height: 102, baseDia: 60.3 },
  { type: 'Weldolet', headerNPS: '12"',  branchNPS: '4"',     height: 114, baseDia: 114.3 },
  { type: 'Weldolet', headerNPS: '12"',  branchNPS: '6"',     height: 127, baseDia: 168.3 },
  { type: 'Weldolet', headerNPS: '12"',  branchNPS: '8"',     height: 140, baseDia: 219.1 },
  { type: 'Weldolet', headerNPS: '12"',  branchNPS: '10"',    height: 152, baseDia: 273.1 },

  // ─── Sockolets (common sizes) ───
  { type: 'Sockolet', headerNPS: '2"',   branchNPS: '1/2"',   height: 44,  baseDia: 21.3 },
  { type: 'Sockolet', headerNPS: '2"',   branchNPS: '3/4"',   height: 44,  baseDia: 26.7 },
  { type: 'Sockolet', headerNPS: '3"',   branchNPS: '1/2"',   height: 48,  baseDia: 21.3 },
  { type: 'Sockolet', headerNPS: '3"',   branchNPS: '1"',     height: 51,  baseDia: 33.4 },
  { type: 'Sockolet', headerNPS: '4"',   branchNPS: '1/2"',   height: 51,  baseDia: 21.3 },
  { type: 'Sockolet', headerNPS: '4"',   branchNPS: '1"',     height: 54,  baseDia: 33.4 },
  { type: 'Sockolet', headerNPS: '6"',   branchNPS: '1/2"',   height: 57,  baseDia: 21.3 },
  { type: 'Sockolet', headerNPS: '6"',   branchNPS: '1"',     height: 60,  baseDia: 33.4 },
  { type: 'Sockolet', headerNPS: '8"',   branchNPS: '1"',     height: 64,  baseDia: 33.4 },
  { type: 'Sockolet', headerNPS: '8"',   branchNPS: '2"',     height: 70,  baseDia: 60.3 },

  // ─── Thredolets (common sizes) ───
  { type: 'Thredolet', headerNPS: '2"',   branchNPS: '1/2"',   height: 44,  baseDia: 21.3 },
  { type: 'Thredolet', headerNPS: '2"',   branchNPS: '3/4"',   height: 44,  baseDia: 26.7 },
  { type: 'Thredolet', headerNPS: '3"',   branchNPS: '1/2"',   height: 48,  baseDia: 21.3 },
  { type: 'Thredolet', headerNPS: '3"',   branchNPS: '1"',     height: 51,  baseDia: 33.4 },
  { type: 'Thredolet', headerNPS: '4"',   branchNPS: '1/2"',   height: 51,  baseDia: 21.3 },
  { type: 'Thredolet', headerNPS: '4"',   branchNPS: '1"',     height: 54,  baseDia: 33.4 },
  { type: 'Thredolet', headerNPS: '6"',   branchNPS: '1"',     height: 60,  baseDia: 33.4 },
  { type: 'Thredolet', headerNPS: '8"',   branchNPS: '1"',     height: 64,  baseDia: 33.4 },
];

export const OLET_ENTRIES: FittingEntry[] = RAW.map((o) => ({
  category: 'olet',
  standard: 'MSS SP-97',
  nps: `${o.headerNPS} x ${o.branchNPS}`,
  type: o.type,
  dimensions: [
    { key: 'height', value_mm: o.height, isPrimaryAdvance: true },
    { key: 'base_diameter', value_mm: o.baseDia },
  ],
}));

export const OLET_TYPES = ['Weldolet', 'Sockolet', 'Thredolet'] as const;

export const OLET_RAW = RAW;
