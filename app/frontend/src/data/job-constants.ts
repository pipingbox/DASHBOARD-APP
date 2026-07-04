// TD-10: Extracted job constants from Jobs.tsx to reduce monolith size.
// Shared between Jobs.tsx and FeaturedJobCard.tsx component.

export const URGENT_INDICES = [0, 1, 5, 10, 14];

export const ROTATIONS: Record<number, string> = {
  1: '3/3 weeks',
  3: '2/2 weeks',
  5: '8/4 weeks',
  7: '2/3 weeks',
  14: '10/4 weeks',
};

export function isOffshore(idx: number): boolean {
  return [1, 3, 5, 7, 14].includes(idx);
}

export const POSTED_TIMES = [
  '2h ago', '4h ago', '6h ago', '8h ago', '12h ago',
  '1d ago', '1d ago', '2d ago', '2d ago', '3d ago',
  '3d ago', '4d ago', '5d ago', '5d ago', '6d ago', '1w ago',
];
