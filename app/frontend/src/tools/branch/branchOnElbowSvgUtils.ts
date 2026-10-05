/* ───────────────────────────────────────────────────────────────────────────
   Shared helpers for the SCREEN previews of both elbow branch families:
   tubo→codo (U3) and codo→tubo (U5.3). Nothing here is family specific.

   These previews are RESPONSIVE SCREEN GRAPHICS, never physical templates:
   the emitted <svg> carries a viewBox plus width:100% so it adapts to the
   viewport. Physical 1:1 output (page formats, tiling, calibration bar)
   belongs to the existing tube→tube pipeline and to a later unit — nothing
   here may be printed as a fabrication template.

   Geometry is NEVER computed here. Every millimetre value originates in a
   kernel — branchOnElbowGeometry.ts (U1) or elbowOnPipeGeometry.ts (U5.1);
   this module only maps mm → screen px with documented affine transforms and
   exposes the transform parameters so the tests can prove that each plotted
   point is the image of a kernel value.
   ─────────────────────────────────────────────────────────────────────────── */

export const ELBOW_SVG = {
  background: '#0a0a0a',
  panel: '#111114',
  grid: '#27272a',
  gridSoft: '#1d1d21',
  axis: '#52525b',
  text: '#d4d4d8',
  muted: '#a1a1aa',
  faint: '#71717a',
  curve: '#f59e0b',
  marker: '#fbbf24',
  closure: '#10b981',
  datum: '#38bdf8',
} as const;

/** XML-escape text content emitted inside <text> nodes. */
export function escSvg(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Screen-space px, 2 decimals — display only. */
export function px(value: number): string {
  return value.toFixed(2);
}

/**
 * Exact round-trip representation of a U1 millimetre value, emitted in
 * data-* attributes so tests can compare the rendered point with the kernel
 * output without any loss of precision. Normalizes -0 to 0.
 */
export function exactMm(value: number): string {
  return String(value === 0 ? 0 : value);
}

export interface AffineScale {
  /** px per mm. */
  factor: number;
  /** mm value mapped to the range origin. */
  domainOrigin: number;
  /** px coordinate of the domain origin. */
  rangeOrigin: number;
  /** +1 when mm grows with px, −1 when the axis is flipped (screen y). */
  direction: 1 | -1;
  map: (mm: number) => number;
}

/** Build a documented 1-D affine mm → px transform. */
export function affine(
  domainMin: number, domainMax: number,
  rangeOrigin: number, rangeSpan: number,
  direction: 1 | -1,
): AffineScale {
  const span = domainMax - domainMin;
  const factor = span > 0 ? rangeSpan / span : 0;
  const map = (mm: number) => rangeOrigin + direction * (mm - domainMin) * factor;
  return { factor, domainOrigin: domainMin, rangeOrigin, direction, map };
}

/** Pad a [min, max] mm domain by a fraction of its span (never zero-width). */
export function padDomain(min: number, max: number, fraction: number, minimumSpan = 1): [number, number] {
  const span = Math.max(max - min, minimumSpan);
  const pad = span * fraction;
  return [min - pad, max + pad];
}

/** Label every k-th station so dense N stays legible; markers are never dropped. */
export function labelStride(stationCount: number, maxLabels = 12): number {
  return Math.max(1, Math.ceil(stationCount / maxLabels));
}

export interface SvgTextOptions {
  size?: number;
  fill?: string;
  anchor?: 'start' | 'middle' | 'end';
  weight?: 'normal' | 'bold';
  /** Rotation in degrees applied around the text anchor (e.g. vertical axis captions). */
  rotate?: number;
}

export function svgText(x: number, y: number, content: string, options: SvgTextOptions = {}): string {
  const { size = 10, fill = ELBOW_SVG.muted, anchor = 'start', weight = 'normal', rotate } = options;
  const anchorAttr = anchor === 'start' ? '' : ` text-anchor="${anchor}"`;
  const weightAttr = weight === 'bold' ? ' font-weight="bold"' : '';
  const rotateAttr = rotate === undefined ? '' : ` transform="rotate(${px(rotate)} ${px(x)} ${px(y)})"`;
  return `<text x="${px(x)}" y="${px(y)}" font-size="${size}" font-family="monospace" fill="${fill}"${anchorAttr}${weightAttr}${rotateAttr}>${escSvg(content)}</text>`;
}

/**
 * Wrap generated content in a RESPONSIVE svg root: viewBox + width:100% and
 * height:auto, so the preview scales to the viewport without overflowing a
 * 360 px phone. No fixed pixel width is emitted.
 */
export function responsiveSvg(
  viewBoxWidth: number, viewBoxHeight: number, body: string, dataAttributes: Record<string, string> = {},
): string {
  const attributes = Object.entries(dataAttributes)
    .map(([key, value]) => ` ${key}="${escSvg(value)}"`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxWidth} ${viewBoxHeight}"`
    + ` preserveAspectRatio="xMidYMid meet" role="img"`
    + ` style="width:100%;height:auto;display:block;background:${ELBOW_SVG.background}"`
    + ` data-screen-preview="true"${attributes}>${body}</svg>`;
}
