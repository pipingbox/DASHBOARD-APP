import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowRightLeft, AlertTriangle } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   TAB 1: PIPE DIMENSIONS (ASME B36.10M / B36.19M)
   ═══════════════════════════════════════════════════════════════ */

const SCHEDULES = ['5S', '10S', '10', '20', '30', 'STD', '40', '60', 'XS', '80', '100', '120', '140', '160', 'XXS'] as const;

interface PipeRow {
  nps: string;
  dn: number;
  od_mm: number;
  wt: Record<string, number | null>;
}

const PIPE_DATA: PipeRow[] = [
  { nps: '1/8"', dn: 6, od_mm: 10.3, wt: { '10S': 0.89, '10': 0.89, 'STD': 1.24, '40': 1.24, 'XS': 1.73, '80': 1.73 } },
  { nps: '1/4"', dn: 8, od_mm: 13.7, wt: { '10S': 1.24, '10': 1.24, 'STD': 1.65, '40': 1.65, 'XS': 2.24, '80': 2.24 } },
  { nps: '3/8"', dn: 10, od_mm: 17.1, wt: { '10S': 1.24, '10': 1.24, 'STD': 1.65, '40': 1.65, 'XS': 2.31, '80': 2.31 } },
  { nps: '1/2"', dn: 15, od_mm: 21.3, wt: { '5S': 1.65, '10S': 2.11, '10': 2.11, 'STD': 2.77, '40': 2.77, 'XS': 3.73, '80': 3.73, '160': 4.78, 'XXS': 7.47 } },
  { nps: '3/4"', dn: 20, od_mm: 26.7, wt: { '5S': 1.65, '10S': 2.11, '10': 2.11, 'STD': 2.87, '40': 2.87, 'XS': 3.91, '80': 3.91, '160': 5.56, 'XXS': 7.82 } },
  { nps: '1"', dn: 25, od_mm: 33.4, wt: { '5S': 1.65, '10S': 2.77, '10': 2.77, 'STD': 3.38, '40': 3.38, 'XS': 4.55, '80': 4.55, '160': 6.35, 'XXS': 9.09 } },
  { nps: '1-1/4"', dn: 32, od_mm: 42.2, wt: { '5S': 1.65, '10S': 2.77, '10': 2.77, 'STD': 3.56, '40': 3.56, 'XS': 4.85, '80': 4.85, '160': 6.35, 'XXS': 9.70 } },
  { nps: '1-1/2"', dn: 40, od_mm: 48.3, wt: { '5S': 1.65, '10S': 2.77, '10': 2.77, 'STD': 3.68, '40': 3.68, 'XS': 5.08, '80': 5.08, '160': 7.14, 'XXS': 10.15 } },
  { nps: '2"', dn: 50, od_mm: 60.3, wt: { '5S': 1.65, '10S': 2.77, '10': 2.77, 'STD': 3.91, '40': 3.91, 'XS': 5.54, '80': 5.54, '160': 8.74, 'XXS': 11.07 } },
  { nps: '2-1/2"', dn: 65, od_mm: 73.0, wt: { '5S': 2.11, '10S': 3.05, '10': 3.05, 'STD': 5.16, '40': 5.16, 'XS': 7.01, '80': 7.01, '160': 9.53, 'XXS': 14.02 } },
  { nps: '3"', dn: 80, od_mm: 88.9, wt: { '5S': 2.11, '10S': 3.05, '10': 3.05, 'STD': 5.49, '40': 5.49, 'XS': 7.62, '80': 7.62, '160': 11.13, 'XXS': 15.24 } },
  { nps: '3-1/2"', dn: 90, od_mm: 101.6, wt: { '5S': 2.11, '10S': 3.05, 'STD': 5.74, '40': 5.74, 'XS': 8.08, '80': 8.08 } },
  { nps: '4"', dn: 100, od_mm: 114.3, wt: { '5S': 2.11, '10S': 3.05, '10': 3.05, 'STD': 6.02, '40': 6.02, '60': 7.14, 'XS': 8.56, '80': 8.56, '100': 11.13, '120': 13.49, '140': 17.12, '160': 23.83, 'XXS': 17.12 } },
  { nps: '5"', dn: 125, od_mm: 141.3, wt: { '5S': 2.77, '10S': 3.40, '10': 3.40, 'STD': 6.55, '40': 6.55, '60': 7.92, 'XS': 9.53, '80': 9.53, '100': 12.70, '120': 15.88, '140': 19.05, '160': 23.83, 'XXS': 19.05 } },
  { nps: '6"', dn: 150, od_mm: 168.3, wt: { '5S': 2.77, '10S': 3.40, '10': 3.40, 'STD': 7.11, '40': 7.11, '60': 8.74, 'XS': 10.97, '80': 10.97, '100': 14.27, '120': 18.26, '140': 21.95, '160': 27.79, 'XXS': 21.95 } },
  { nps: '8"', dn: 200, od_mm: 219.1, wt: { '5S': 2.77, '10S': 3.76, '10': 3.76, '20': 6.35, '30': 7.04, 'STD': 8.18, '40': 8.18, '60': 10.31, 'XS': 12.70, '80': 12.70, '100': 15.09, '120': 18.26, '140': 20.62, '160': 23.01, 'XXS': 22.23 } },
  { nps: '10"', dn: 250, od_mm: 273.0, wt: { '5S': 3.40, '10S': 4.19, '10': 4.19, '20': 6.35, '30': 7.80, 'STD': 9.27, '40': 9.27, '60': 12.70, 'XS': 12.70, '80': 15.09, '100': 18.26, '120': 21.44, '140': 25.40, '160': 28.58, 'XXS': 25.40 } },
  { nps: '12"', dn: 300, od_mm: 323.8, wt: { '5S': 3.96, '10S': 4.57, '10': 4.57, '20': 6.35, '30': 8.38, 'STD': 9.52, '40': 10.31, '60': 14.27, 'XS': 12.70, '80': 17.48, '100': 21.44, '120': 25.40, '140': 28.58, '160': 33.32, 'XXS': 25.40 } },
  { nps: '14"', dn: 350, od_mm: 355.6, wt: { '5S': 3.96, '10S': 4.78, '10': 4.78, '20': 7.92, '30': 9.52, 'STD': 9.52, '40': 11.13, '60': 15.09, 'XS': 12.70, '80': 19.05, '100': 23.83, '120': 27.79, '140': 31.75, '160': 35.71 } },
  { nps: '16"', dn: 400, od_mm: 406.4, wt: { '5S': 4.19, '10S': 4.78, '10': 4.78, '20': 7.92, '30': 9.52, 'STD': 9.52, '40': 12.70, '60': 16.66, 'XS': 12.70, '80': 21.44, '100': 26.19, '120': 30.96, '140': 36.53, '160': 40.49 } },
  { nps: '18"', dn: 450, od_mm: 457.2, wt: { '5S': 4.19, '10S': 4.78, '10': 4.78, '20': 7.92, 'STD': 9.52, '30': 11.13, '40': 14.27, '60': 19.05, 'XS': 12.70, '80': 23.83, '100': 29.36, '120': 34.93, '140': 39.67, '160': 45.24 } },
  { nps: '20"', dn: 500, od_mm: 508.0, wt: { '5S': 4.78, '10S': 5.54, '10': 5.54, '20': 9.52, 'STD': 9.52, '30': 12.70, '40': 15.09, '60': 20.62, 'XS': 12.70, '80': 26.19, '100': 32.54, '120': 38.10, '140': 44.45, '160': 50.01 } },
  { nps: '24"', dn: 600, od_mm: 609.6, wt: { '5S': 5.54, '10S': 6.35, '10': 6.35, '20': 9.52, 'STD': 9.52, '30': 14.27, '40': 17.48, '60': 24.61, 'XS': 12.70, '80': 30.96, '100': 38.89, '120': 46.02, '140': 52.37, '160': 59.54 } },
];

/* ═══════════════════════════════════════════════════════════════
   TAB 2: FLANGE DIMENSIONS (ASME B16.5)
   ═══════════════════════════════════════════════════════════════ */

interface FlangeRow {
  nps: string;
  odFlange: number;
  thickness: number;
  bcd: number;
  bolts: number;
  boltDia: string;
  rfDia: number;
}

const FLANGE_150: FlangeRow[] = [
  { nps: '1/2"', odFlange: 89.0, thickness: 11.2, bcd: 60.5, bolts: 4, boltDia: '1/2"', rfDia: 34.9 },
  { nps: '3/4"', odFlange: 98.5, thickness: 12.7, bcd: 69.9, bolts: 4, boltDia: '1/2"', rfDia: 42.9 },
  { nps: '1"', odFlange: 108.0, thickness: 14.2, bcd: 79.2, bolts: 4, boltDia: '1/2"', rfDia: 50.8 },
  { nps: '1-1/4"', odFlange: 117.5, thickness: 15.7, bcd: 88.9, bolts: 4, boltDia: '1/2"', rfDia: 63.5 },
  { nps: '1-1/2"', odFlange: 127.0, thickness: 17.5, bcd: 98.6, bolts: 4, boltDia: '1/2"', rfDia: 73.2 },
  { nps: '2"', odFlange: 152.4, thickness: 19.0, bcd: 120.7, bolts: 4, boltDia: '5/8"', rfDia: 92.1 },
  { nps: '2-1/2"', odFlange: 177.8, thickness: 22.4, bcd: 139.7, bolts: 4, boltDia: '5/8"', rfDia: 104.6 },
  { nps: '3"', odFlange: 190.5, thickness: 23.8, bcd: 152.4, bolts: 4, boltDia: '5/8"', rfDia: 127.0 },
  { nps: '3-1/2"', odFlange: 215.9, thickness: 23.8, bcd: 177.8, bolts: 8, boltDia: '5/8"', rfDia: 139.7 },
  { nps: '4"', odFlange: 228.6, thickness: 23.8, bcd: 190.5, bolts: 8, boltDia: '5/8"', rfDia: 157.2 },
  { nps: '5"', odFlange: 254.0, thickness: 23.8, bcd: 215.9, bolts: 8, boltDia: '3/4"', rfDia: 185.7 },
  { nps: '6"', odFlange: 279.4, thickness: 25.4, bcd: 241.3, bolts: 8, boltDia: '3/4"', rfDia: 215.9 },
  { nps: '8"', odFlange: 342.9, thickness: 28.4, bcd: 298.5, bolts: 8, boltDia: '3/4"', rfDia: 269.7 },
  { nps: '10"', odFlange: 406.4, thickness: 30.2, bcd: 362.0, bolts: 12, boltDia: '7/8"', rfDia: 323.9 },
  { nps: '12"', odFlange: 482.6, thickness: 31.8, bcd: 431.8, bolts: 12, boltDia: '7/8"', rfDia: 381.0 },
  { nps: '14"', odFlange: 533.4, thickness: 34.9, bcd: 476.3, bolts: 12, boltDia: '1"', rfDia: 412.8 },
  { nps: '16"', odFlange: 596.9, thickness: 36.5, bcd: 539.8, bolts: 16, boltDia: '1"', rfDia: 469.9 },
  { nps: '18"', odFlange: 635.0, thickness: 39.6, bcd: 577.9, bolts: 16, boltDia: '1-1/8"', rfDia: 533.4 },
  { nps: '20"', odFlange: 698.5, thickness: 42.9, bcd: 635.0, bolts: 20, boltDia: '1-1/8"', rfDia: 584.2 },
  { nps: '24"', odFlange: 812.8, thickness: 47.6, bcd: 749.3, bolts: 20, boltDia: '1-1/4"', rfDia: 692.2 },
];

const FLANGE_300: FlangeRow[] = [
  { nps: '1/2"', odFlange: 95.3, thickness: 14.2, bcd: 66.5, bolts: 4, boltDia: '1/2"', rfDia: 34.9 },
  { nps: '3/4"', odFlange: 117.5, thickness: 15.7, bcd: 82.6, bolts: 4, boltDia: '5/8"', rfDia: 42.9 },
  { nps: '1"', odFlange: 123.8, thickness: 17.5, bcd: 88.9, bolts: 4, boltDia: '5/8"', rfDia: 50.8 },
  { nps: '1-1/4"', odFlange: 133.4, thickness: 19.0, bcd: 98.6, bolts: 4, boltDia: '5/8"', rfDia: 63.5 },
  { nps: '1-1/2"', odFlange: 155.4, thickness: 20.6, bcd: 114.3, bolts: 4, boltDia: '3/4"', rfDia: 73.2 },
  { nps: '2"', odFlange: 165.1, thickness: 22.4, bcd: 127.0, bolts: 8, boltDia: '5/8"', rfDia: 92.1 },
  { nps: '2-1/2"', odFlange: 190.5, thickness: 25.4, bcd: 149.4, bolts: 8, boltDia: '3/4"', rfDia: 104.6 },
  { nps: '3"', odFlange: 209.6, thickness: 28.4, bcd: 168.1, bolts: 8, boltDia: '3/4"', rfDia: 127.0 },
  { nps: '3-1/2"', odFlange: 228.6, thickness: 30.2, bcd: 184.2, bolts: 8, boltDia: '3/4"', rfDia: 139.7 },
  { nps: '4"', odFlange: 254.0, thickness: 31.8, bcd: 200.0, bolts: 8, boltDia: '3/4"', rfDia: 157.2 },
  { nps: '5"', odFlange: 279.4, thickness: 34.9, bcd: 235.0, bolts: 8, boltDia: '3/4"', rfDia: 185.7 },
  { nps: '6"', odFlange: 317.5, thickness: 36.5, bcd: 269.7, bolts: 12, boltDia: '3/4"', rfDia: 215.9 },
  { nps: '8"', odFlange: 381.0, thickness: 41.1, bcd: 330.2, bolts: 12, boltDia: '7/8"', rfDia: 269.7 },
  { nps: '10"', odFlange: 444.5, thickness: 47.6, bcd: 387.4, bolts: 16, boltDia: '1"', rfDia: 323.9 },
  { nps: '12"', odFlange: 520.7, thickness: 50.8, bcd: 450.8, bolts: 16, boltDia: '1-1/8"', rfDia: 381.0 },
  { nps: '14"', odFlange: 584.2, thickness: 53.8, bcd: 514.4, bolts: 20, boltDia: '1-1/8"', rfDia: 412.8 },
  { nps: '16"', odFlange: 647.7, thickness: 57.2, bcd: 571.5, bolts: 20, boltDia: '1-1/4"', rfDia: 469.9 },
  { nps: '18"', odFlange: 711.2, thickness: 60.5, bcd: 628.6, bolts: 24, boltDia: '1-1/4"', rfDia: 533.4 },
  { nps: '20"', odFlange: 774.7, thickness: 63.5, bcd: 685.8, bolts: 24, boltDia: '1-1/4"', rfDia: 584.2 },
  { nps: '24"', odFlange: 914.4, thickness: 69.9, bcd: 812.8, bolts: 24, boltDia: '1-1/2"', rfDia: 692.2 },
];

const FLANGE_600: FlangeRow[] = [
  { nps: '1/2"', odFlange: 95.3, thickness: 14.2, bcd: 66.5, bolts: 4, boltDia: '1/2"', rfDia: 34.9 },
  { nps: '3/4"', odFlange: 117.5, thickness: 15.7, bcd: 82.6, bolts: 4, boltDia: '5/8"', rfDia: 42.9 },
  { nps: '1"', odFlange: 123.8, thickness: 17.5, bcd: 88.9, bolts: 4, boltDia: '5/8"', rfDia: 50.8 },
  { nps: '1-1/4"', odFlange: 133.4, thickness: 20.6, bcd: 98.6, bolts: 4, boltDia: '5/8"', rfDia: 63.5 },
  { nps: '1-1/2"', odFlange: 155.4, thickness: 22.4, bcd: 114.3, bolts: 4, boltDia: '3/4"', rfDia: 73.2 },
  { nps: '2"', odFlange: 165.1, thickness: 25.4, bcd: 127.0, bolts: 8, boltDia: '5/8"', rfDia: 92.1 },
  { nps: '2-1/2"', odFlange: 190.5, thickness: 28.4, bcd: 149.4, bolts: 8, boltDia: '3/4"', rfDia: 104.6 },
  { nps: '3"', odFlange: 209.6, thickness: 31.8, bcd: 168.1, bolts: 8, boltDia: '3/4"', rfDia: 127.0 },
  { nps: '3-1/2"', odFlange: 228.6, thickness: 34.9, bcd: 184.2, bolts: 8, boltDia: '7/8"', rfDia: 139.7 },
  { nps: '4"', odFlange: 273.1, thickness: 38.1, bcd: 215.9, bolts: 8, boltDia: '7/8"', rfDia: 157.2 },
  { nps: '5"', odFlange: 330.2, thickness: 44.5, bcd: 266.7, bolts: 8, boltDia: '1"', rfDia: 185.7 },
  { nps: '6"', odFlange: 355.6, thickness: 47.6, bcd: 292.1, bolts: 12, boltDia: '1"', rfDia: 215.9 },
  { nps: '8"', odFlange: 419.1, thickness: 55.6, bcd: 349.3, bolts: 12, boltDia: '1-1/8"', rfDia: 269.7 },
  { nps: '10"', odFlange: 508.0, thickness: 63.5, bcd: 431.8, bolts: 16, boltDia: '1-1/4"', rfDia: 323.9 },
  { nps: '12"', odFlange: 558.8, thickness: 66.5, bcd: 489.0, bolts: 20, boltDia: '1-1/4"', rfDia: 381.0 },
  { nps: '14"', odFlange: 603.3, thickness: 69.9, bcd: 527.1, bolts: 20, boltDia: '1-3/8"', rfDia: 412.8 },
  { nps: '16"', odFlange: 685.8, thickness: 76.2, bcd: 603.3, bolts: 20, boltDia: '1-1/2"', rfDia: 469.9 },
  { nps: '18"', odFlange: 742.9, thickness: 82.6, bcd: 654.1, bolts: 20, boltDia: '1-5/8"', rfDia: 533.4 },
  { nps: '20"', odFlange: 812.8, thickness: 88.9, bcd: 723.9, bolts: 24, boltDia: '1-5/8"', rfDia: 584.2 },
  { nps: '24"', odFlange: 939.8, thickness: 101.6, bcd: 838.2, bolts: 24, boltDia: '1-7/8"', rfDia: 692.2 },
];

const FLANGE_900: FlangeRow[] = [
  { nps: '1/2"', odFlange: 120.7, thickness: 22.4, bcd: 82.6, bolts: 4, boltDia: '3/4"', rfDia: 34.9 },
  { nps: '3/4"', odFlange: 130.2, thickness: 25.4, bcd: 88.9, bolts: 4, boltDia: '3/4"', rfDia: 42.9 },
  { nps: '1"', odFlange: 149.4, thickness: 27.0, bcd: 101.6, bolts: 4, boltDia: '7/8"', rfDia: 50.8 },
  { nps: '1-1/4"', odFlange: 158.8, thickness: 28.4, bcd: 111.3, bolts: 4, boltDia: '7/8"', rfDia: 63.5 },
  { nps: '1-1/2"', odFlange: 177.8, thickness: 30.2, bcd: 124.0, bolts: 4, boltDia: '1"', rfDia: 73.2 },
  { nps: '2"', odFlange: 215.9, thickness: 38.1, bcd: 165.1, bolts: 8, boltDia: '7/8"', rfDia: 92.1 },
  { nps: '2-1/2"', odFlange: 244.5, thickness: 41.1, bcd: 190.5, bolts: 8, boltDia: '1"', rfDia: 104.6 },
  { nps: '3"', odFlange: 241.3, thickness: 38.1, bcd: 190.5, bolts: 8, boltDia: '7/8"', rfDia: 127.0 },
  { nps: '4"', odFlange: 292.1, thickness: 44.5, bcd: 235.0, bolts: 8, boltDia: '1-1/8"', rfDia: 157.2 },
  { nps: '5"', odFlange: 349.3, thickness: 50.8, bcd: 279.4, bolts: 8, boltDia: '1-1/4"', rfDia: 185.7 },
  { nps: '6"', odFlange: 381.0, thickness: 55.6, bcd: 317.5, bolts: 12, boltDia: '1-1/8"', rfDia: 215.9 },
  { nps: '8"', odFlange: 469.9, thickness: 63.5, bcd: 393.7, bolts: 12, boltDia: '1-3/8"', rfDia: 269.7 },
  { nps: '10"', odFlange: 546.1, thickness: 69.9, bcd: 469.9, bolts: 16, boltDia: '1-3/8"', rfDia: 323.9 },
  { nps: '12"', odFlange: 609.6, thickness: 79.2, bcd: 533.4, bolts: 20, boltDia: '1-3/8"', rfDia: 381.0 },
  { nps: '14"', odFlange: 641.4, thickness: 85.9, bcd: 558.8, bolts: 20, boltDia: '1-1/2"', rfDia: 412.8 },
  { nps: '16"', odFlange: 704.9, thickness: 88.9, bcd: 616.0, bolts: 20, boltDia: '1-5/8"', rfDia: 469.9 },
  { nps: '18"', odFlange: 787.4, thickness: 101.6, bcd: 685.8, bolts: 20, boltDia: '1-7/8"', rfDia: 533.4 },
  { nps: '20"', odFlange: 857.3, thickness: 108.0, bcd: 749.3, bolts: 20, boltDia: '2"', rfDia: 584.2 },
  { nps: '24"', odFlange: 1041.4, thickness: 139.7, bcd: 914.4, bolts: 20, boltDia: '2-1/2"', rfDia: 692.2 },
];

const FLANGE_1500: FlangeRow[] = [
  { nps: '1/2"', odFlange: 120.7, thickness: 22.4, bcd: 82.6, bolts: 4, boltDia: '3/4"', rfDia: 34.9 },
  { nps: '3/4"', odFlange: 130.2, thickness: 25.4, bcd: 88.9, bolts: 4, boltDia: '3/4"', rfDia: 42.9 },
  { nps: '1"', odFlange: 149.4, thickness: 27.0, bcd: 101.6, bolts: 4, boltDia: '7/8"', rfDia: 50.8 },
  { nps: '1-1/4"', odFlange: 158.8, thickness: 28.4, bcd: 111.3, bolts: 4, boltDia: '7/8"', rfDia: 63.5 },
  { nps: '1-1/2"', odFlange: 177.8, thickness: 30.2, bcd: 124.0, bolts: 4, boltDia: '1"', rfDia: 73.2 },
  { nps: '2"', odFlange: 215.9, thickness: 38.1, bcd: 165.1, bolts: 8, boltDia: '7/8"', rfDia: 92.1 },
  { nps: '2-1/2"', odFlange: 244.5, thickness: 41.1, bcd: 190.5, bolts: 8, boltDia: '1"', rfDia: 104.6 },
  { nps: '3"', odFlange: 266.7, thickness: 47.6, bcd: 203.2, bolts: 8, boltDia: '1-1/8"', rfDia: 127.0 },
  { nps: '4"', odFlange: 311.2, thickness: 54.0, bcd: 241.3, bolts: 8, boltDia: '1-3/8"', rfDia: 157.2 },
  { nps: '5"', odFlange: 374.7, thickness: 73.2, bcd: 292.1, bolts: 8, boltDia: '1-5/8"', rfDia: 185.7 },
  { nps: '6"', odFlange: 393.7, thickness: 82.6, bcd: 317.5, bolts: 12, boltDia: '1-3/8"', rfDia: 215.9 },
  { nps: '8"', odFlange: 482.6, thickness: 91.9, bcd: 393.7, bolts: 12, boltDia: '1-5/8"', rfDia: 269.7 },
  { nps: '10"', odFlange: 584.2, thickness: 108.0, bcd: 482.6, bolts: 12, boltDia: '1-7/8"', rfDia: 323.9 },
  { nps: '12"', odFlange: 673.1, thickness: 123.8, bcd: 571.5, bolts: 16, boltDia: '2"', rfDia: 381.0 },
  { nps: '14"', odFlange: 749.3, thickness: 133.4, bcd: 635.0, bolts: 16, boltDia: '2-1/4"', rfDia: 412.8 },
  { nps: '16"', odFlange: 825.5, thickness: 146.1, bcd: 704.9, bolts: 16, boltDia: '2-1/2"', rfDia: 469.9 },
  { nps: '18"', odFlange: 914.4, thickness: 162.0, bcd: 787.4, bolts: 16, boltDia: '2-3/4"', rfDia: 533.4 },
  { nps: '20"', odFlange: 984.3, thickness: 177.8, bcd: 857.3, bolts: 16, boltDia: '3"', rfDia: 584.2 },
  { nps: '24"', odFlange: 1168.4, thickness: 203.2, bcd: 1022.4, bolts: 16, boltDia: '3-1/2"', rfDia: 692.2 },
];

const FLANGE_2500: FlangeRow[] = [
  { nps: '1/2"', odFlange: 133.4, thickness: 30.2, bcd: 88.9, bolts: 4, boltDia: '3/4"', rfDia: 34.9 },
  { nps: '3/4"', odFlange: 139.7, thickness: 31.8, bcd: 95.3, bolts: 4, boltDia: '3/4"', rfDia: 42.9 },
  { nps: '1"', odFlange: 158.8, thickness: 34.9, bcd: 108.0, bolts: 4, boltDia: '7/8"', rfDia: 50.8 },
  { nps: '1-1/4"', odFlange: 184.2, thickness: 38.1, bcd: 133.4, bolts: 4, boltDia: '1"', rfDia: 63.5 },
  { nps: '1-1/2"', odFlange: 203.2, thickness: 44.5, bcd: 149.4, bolts: 4, boltDia: '1-1/8"', rfDia: 73.2 },
  { nps: '2"', odFlange: 235.0, thickness: 50.8, bcd: 177.8, bolts: 8, boltDia: '1"', rfDia: 92.1 },
  { nps: '2-1/2"', odFlange: 266.7, thickness: 57.2, bcd: 203.2, bolts: 8, boltDia: '1-1/8"', rfDia: 104.6 },
  { nps: '3"', odFlange: 304.8, thickness: 66.5, bcd: 235.0, bolts: 8, boltDia: '1-1/4"', rfDia: 127.0 },
  { nps: '4"', odFlange: 355.6, thickness: 76.2, bcd: 279.4, bolts: 8, boltDia: '1-1/2"', rfDia: 157.2 },
  { nps: '5"', odFlange: 419.1, thickness: 92.1, bcd: 330.2, bolts: 8, boltDia: '1-3/4"', rfDia: 185.7 },
  { nps: '6"', odFlange: 482.6, thickness: 108.0, bcd: 387.4, bolts: 8, boltDia: '2"', rfDia: 215.9 },
  { nps: '8"', odFlange: 552.5, thickness: 127.0, bcd: 450.8, bolts: 12, boltDia: '2"', rfDia: 269.7 },
  { nps: '10"', odFlange: 673.1, thickness: 165.1, bcd: 558.8, bolts: 12, boltDia: '2-1/2"', rfDia: 323.9 },
  { nps: '12"', odFlange: 762.0, thickness: 184.2, bcd: 635.0, bolts: 12, boltDia: '2-3/4"', rfDia: 381.0 },
];

const FLANGE_CLASSES = ['150', '300', '600', '900', '1500', '2500'] as const;

/* ═══════════════════════════════════════════════════════════════
   TAB 3: BOLT TORQUE (ASME PCC-1)
   ═══════════════════════════════════════════════════════════════ */

interface BoltTorqueRow {
  size: string;
  metric: string;
  b7Lub: number;
  b7Dry: number;
  b8Lub: number;
  b8Dry: number;
}

const BOLT_TORQUE: BoltTorqueRow[] = [
  { size: '1/2"', metric: 'M12', b7Lub: 47, b7Dry: 68, b8Lub: 26, b8Dry: 38 },
  { size: '5/8"', metric: 'M16', b7Lub: 95, b7Dry: 136, b8Lub: 54, b8Dry: 78 },
  { size: '3/4"', metric: 'M20', b7Lub: 169, b7Dry: 244, b8Lub: 95, b8Dry: 136 },
  { size: '7/8"', metric: 'M22', b7Lub: 271, b7Dry: 390, b8Lub: 149, b8Dry: 214 },
  { size: '1"', metric: 'M24', b7Lub: 406, b7Dry: 583, b8Lub: 224, b8Dry: 322 },
  { size: '1-1/8"', metric: 'M27', b7Lub: 583, b7Dry: 840, b8Lub: 325, b8Dry: 468 },
  { size: '1-1/4"', metric: 'M30', b7Lub: 813, b7Dry: 1170, b8Lub: 447, b8Dry: 644 },
  { size: '1-3/8"', metric: 'M33', b7Lub: 1085, b7Dry: 1560, b8Lub: 597, b8Dry: 861 },
  { size: '1-1/2"', metric: 'M36', b7Lub: 1424, b7Dry: 2049, b8Lub: 779, b8Dry: 1120 },
  { size: '1-5/8"', metric: 'M39', b7Lub: 1810, b7Dry: 2605, b8Lub: 990, b8Dry: 1424 },
  { size: '1-3/4"', metric: 'M42', b7Lub: 2278, b7Dry: 3278, b8Lub: 1234, b8Dry: 1776 },
];

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */

export default function PipeDimensionsTool() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [showInches, setShowInches] = useState(false);
  const [flangeClass, setFlangeClass] = useState<string>('150');

  // Pipe dimensions filter
  const filteredPipes = useMemo(() => {
    if (!search.trim()) return PIPE_DATA;
    const q = search.toLowerCase().trim();
    return PIPE_DATA.filter(
      (row) =>
        row.nps.toLowerCase().includes(q) ||
        row.dn.toString().includes(q) ||
        row.od_mm.toString().includes(q)
    );
  }, [search]);

  // Weight calculation: W = (OD - WT) * WT * 0.02466 kg/m
  const calcWeight = (od: number, wt: number | null): string => {
    if (!wt) return '-';
    return ((od - wt) * wt * 0.02466).toFixed(2);
  };

  const flangeData = flangeClass === '150' ? FLANGE_150
    : flangeClass === '300' ? FLANGE_300
    : flangeClass === '600' ? FLANGE_600
    : flangeClass === '900' ? FLANGE_900
    : flangeClass === '1500' ? FLANGE_1500
    : flangeClass === '2500' ? FLANGE_2500
    : null;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] uppercase tracking-[0.25em] text-[#f59e0b]">
          {t('tools.pipeDim.name')}
        </p>
        <h3 className="mt-1 text-xl font-semibold">
          {t('tools.pipeDim.subtitle')}
        </h3>
      </div>

      <Tabs defaultValue="pipe-dim" className="w-full">
        <TabsList className="w-full flex flex-wrap">
          <TabsTrigger value="pipe-dim" className="flex-1 min-w-[120px]">
            {t('tools.tabPipeDimensions')}
          </TabsTrigger>
          <TabsTrigger value="flange-dim" className="flex-1 min-w-[120px]">
            {t('tools.tabFlangeDimensions')}
          </TabsTrigger>
          <TabsTrigger value="bolt-torque" className="flex-1 min-w-[120px]">
            {t('tools.tabBoltTorque')}
          </TabsTrigger>
        </TabsList>

        {/* ─── TAB 1: PIPE DIMENSIONS ─── */}
        <TabsContent value="pipe-dim" className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('tools.searchSize')}
              className="bg-zinc-950 border-zinc-800 focus-visible:ring-[#f59e0b] max-w-xs"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowInches(!showInches)}
              className="border-zinc-800 !bg-transparent hover:!bg-zinc-900 text-xs"
            >
              <ArrowRightLeft className="h-3 w-3 mr-1" />
              {showInches ? 'in → mm' : 'mm → in'}
            </Button>
          </div>

          <div className="overflow-x-auto border border-zinc-800/80 rounded">
            <table className="w-full text-xs whitespace-nowrap">
              <thead className="sticky top-0 z-10">
                <tr className="bg-zinc-900 border-b border-zinc-800">
                  <th className="sticky left-0 z-20 bg-zinc-900 py-2 px-2 text-left text-zinc-400 font-medium">NPS</th>
                  <th className="py-2 px-2 text-left text-zinc-400 font-medium">DN</th>
                  <th className="py-2 px-2 text-left text-zinc-400 font-medium">
                    OD ({showInches ? 'in' : 'mm'})
                  </th>
                  {SCHEDULES.map((sch) => (
                    <th key={sch} className="py-2 px-2 text-center text-zinc-400 font-medium">
                      {sch}
                    </th>
                  ))}
                  <th className="py-2 px-2 text-center text-zinc-400 font-medium">kg/m</th>
                </tr>
              </thead>
              <tbody>
                {filteredPipes.map((row) => {
                  // Find first available WT for weight calc
                  const firstWt = SCHEDULES.reduce<number | null>((acc, sch) => {
                    if (acc !== null) return acc;
                    return row.wt[sch] ?? null;
                  }, null);
                  return (
                    <tr key={row.nps} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                      <td className="sticky left-0 bg-[#0d0d0d] py-1.5 px-2 text-[#f59e0b] font-medium">
                        {row.nps}
                      </td>
                      <td className="py-1.5 px-2 text-zinc-300">{row.dn}</td>
                      <td className="py-1.5 px-2 text-zinc-300 font-mono">
                        {showInches ? (row.od_mm / 25.4).toFixed(3) : row.od_mm.toFixed(1)}
                      </td>
                      {SCHEDULES.map((sch) => {
                        const val = row.wt[sch];
                        return (
                          <td key={sch} className="py-1.5 px-2 text-center font-mono">
                            {val ? (
                              <span className="text-zinc-200">{val.toFixed(2)}</span>
                            ) : (
                              <span className="text-zinc-700">-</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="py-1.5 px-2 text-center font-mono text-zinc-400">
                        {calcWeight(row.od_mm, firstWt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ─── TAB 2: FLANGE DIMENSIONS ─── */}
        <TabsContent value="flange-dim" className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-xs uppercase tracking-wider text-zinc-400">
              {t('tools.flangeClass')}:
            </span>
            <Select value={flangeClass} onValueChange={setFlangeClass}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FLANGE_CLASSES.map((cls) => (
                  <SelectItem key={cls} value={cls}>
                    Class {cls}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {flangeData ? (
            <div className="overflow-x-auto border border-zinc-800/80 rounded">
              <table className="w-full text-xs whitespace-nowrap">
                <thead>
                  <tr className="bg-zinc-900 border-b border-zinc-800">
                    <th className="py-2 px-2 text-left text-zinc-400 font-medium">NPS</th>
                    <th className="py-2 px-2 text-center text-zinc-400 font-medium">OD Flange (mm)</th>
                    <th className="py-2 px-2 text-center text-zinc-400 font-medium">Thickness (mm)</th>
                    <th className="py-2 px-2 text-center text-zinc-400 font-medium">BCD (mm)</th>
                    <th className="py-2 px-2 text-center text-zinc-400 font-medium">No. Bolts</th>
                    <th className="py-2 px-2 text-center text-zinc-400 font-medium">Bolt Dia</th>
                    <th className="py-2 px-2 text-center text-zinc-400 font-medium">RF Dia (mm)</th>
                  </tr>
                </thead>
                <tbody>
                  {flangeData.map((row) => (
                    <tr key={row.nps} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                      <td className="py-1.5 px-2 text-[#f59e0b] font-medium">{row.nps}</td>
                      <td className="py-1.5 px-2 text-center font-mono text-zinc-200">{row.odFlange.toFixed(1)}</td>
                      <td className="py-1.5 px-2 text-center font-mono text-zinc-200">{row.thickness.toFixed(1)}</td>
                      <td className="py-1.5 px-2 text-center font-mono text-zinc-200">{row.bcd.toFixed(1)}</td>
                      <td className="py-1.5 px-2 text-center text-zinc-200">{row.bolts}</td>
                      <td className="py-1.5 px-2 text-center text-zinc-200">{row.boltDia}</td>
                      <td className="py-1.5 px-2 text-center font-mono text-zinc-200">{row.rfDia.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex min-h-[200px] items-center justify-center border border-zinc-800/80 rounded">
              <p className="text-sm text-zinc-500">{t('tools.comingSoonData')}</p>
            </div>
          )}
        </TabsContent>

        {/* ─── TAB 3: BOLT TORQUE ─── */}
        <TabsContent value="bolt-torque" className="space-y-4">
          <div className="overflow-x-auto border border-zinc-800/80 rounded">
            <table className="w-full text-xs whitespace-nowrap">
              <thead>
                <tr className="bg-zinc-900 border-b border-zinc-800">
                  <th className="py-2 px-3 text-left text-zinc-400 font-medium" rowSpan={2}>
                    {t('tools.boltSize')}
                  </th>
                  <th className="py-1 px-3 text-center text-zinc-400 font-medium border-b border-zinc-800" colSpan={2}>
                    Grade B7
                  </th>
                  <th className="py-1 px-3 text-center text-zinc-400 font-medium border-b border-zinc-800" colSpan={2}>
                    Grade B8
                  </th>
                </tr>
                <tr className="bg-zinc-900 border-b border-zinc-800">
                  <th className="py-1 px-3 text-center text-zinc-500 font-normal text-[10px]">
                    {t('tools.lubricated')} (Nm)
                  </th>
                  <th className="py-1 px-3 text-center text-zinc-500 font-normal text-[10px]">
                    {t('tools.dry')} (Nm)
                  </th>
                  <th className="py-1 px-3 text-center text-zinc-500 font-normal text-[10px]">
                    {t('tools.lubricated')} (Nm)
                  </th>
                  <th className="py-1 px-3 text-center text-zinc-500 font-normal text-[10px]">
                    {t('tools.dry')} (Nm)
                  </th>
                </tr>
              </thead>
              <tbody>
                {BOLT_TORQUE.map((row) => (
                  <tr key={row.size} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="py-1.5 px-3 text-[#f59e0b] font-medium">
                      {row.size} <span className="text-zinc-500">({row.metric})</span>
                    </td>
                    <td className="py-1.5 px-3 text-center font-mono text-zinc-200">{row.b7Lub}</td>
                    <td className="py-1.5 px-3 text-center font-mono text-zinc-200">{row.b7Dry}</td>
                    <td className="py-1.5 px-3 text-center font-mono text-zinc-200">{row.b8Lub}</td>
                    <td className="py-1.5 px-3 text-center font-mono text-zinc-200">{row.b8Dry}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-start gap-2 border border-[#f59e0b]/30 bg-[#f59e0b]/5 rounded p-3">
            <AlertTriangle className="h-4 w-4 text-[#f59e0b] mt-0.5 shrink-0" />
            <p className="text-xs text-zinc-300">
              {t('tools.torqueWarning')}
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}