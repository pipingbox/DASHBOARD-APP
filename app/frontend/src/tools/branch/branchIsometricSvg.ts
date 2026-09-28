/* ───────────────────────────────────────────────────────────────────────────
   Branch isometric (side elevation in the plane of the two axes) — pure
   generator. H-001 final hardening §9 (PO): the view must clearly read as
   ONE TUBE GRAFTED ONTO ANOTHER TUBE.

   Projection (no independent geometry — every coordinate comes from the
   canonical BranchIntersectionResult stations):
     Header axis = x (horizontal on screen). Branch axis â = (cosβ, sinβ),
     in-plane normal n̂ = (−sinβ, cosβ). The cut point of station θ lives at
     branch-axial distance s(θ) with in-plane transverse offset rB·cosθ:
       C(θ) = s(θ)·â + rB·cosθ·n̂
     which is the projected saddle mouth. The near half is θ ∈ [0°, 180°]
     (z > 0, facing the viewer); the far half θ ∈ [180°, 360°] projects
     behind it (identical at β = 90°).

   The header is drawn clearly longer than its diameter (a TUBE, not a disc).
   No reinforcement pad is drawn here: the PAD belongs to the ENGINEERING
   section (ASME B31.3), not to the basic fabrication view.
   ─────────────────────────────────────────────────────────────────────────── */

import type { BranchIntersectionResult } from './branchIntersectionGeometry';

export interface BranchIsometricOptions {
  /** SVG width in px. Default 480. */
  width?: number;
  /** SVG height in px. Default 300. */
  height?: number;
  /** Header drawn length as a multiple of its diameter. Default 3.0 (a long tube). */
  headerLengthFactor?: number;
  /** Branch drawn length beyond the cut as a multiple of the branch OD. Default 2.0. */
  branchLengthFactor?: number;
}

export interface BranchIsometricResult {
  svg: string;
  /** Projected saddle mouth, near half — screen px [x, y], stations 0..N/2. */
  saddleNear: [number, number][];
  /** Projected saddle mouth, far half — screen px [x, y], stations N/2..N. */
  saddleFar: [number, number][];
  /** Total drawn header length — mm. */
  headerSpanMm: number;
  /** px per mm actually used. */
  scale: number;
}

/** mm-space projection of station i onto the view plane. */
export function projectStation(
  result: BranchIntersectionResult,
  i: number,
): { x: number; y: number; u: number; v: number } {
  const st = result.stations[i];
  const { betaDeg, branchOuterRadius: rB } = result.resolved;
  const beta = (betaDeg * Math.PI) / 180;
  const u = st.cutOrdinate; // along â
  const v = rB * Math.cos((st.thetaDeg * Math.PI) / 180); // in-plane transverse
  return {
    x: u * Math.cos(beta) - v * Math.sin(beta),
    y: u * Math.sin(beta) + v * Math.cos(beta),
    u,
    v,
  };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function buildBranchIsometric(
  result: BranchIntersectionResult,
  options: BranchIsometricOptions = {},
): BranchIsometricResult {
  const W = options.width ?? 480;
  const H = options.height ?? 300;
  const headerLenFactor = options.headerLengthFactor ?? 3.0;
  const branchLenFactor = options.branchLengthFactor ?? 2.0;

  const { headerOuterRadius: R, branchOuterRadius: rB, betaDeg } = result.resolved;
  const beta = (betaDeg * Math.PI) / 180;
  const cosB = Math.cos(beta);
  const sinB = Math.sin(beta);

  // Drawn extents (mm).
  const hh = (headerLenFactor * 2 * R) / 2; // header half-length
  const Lb = result.maxCutOrdinate + branchLenFactor * 2 * rB; // branch axial length

  // Branch silhouette extremes (tip ± rB·n̂).
  const tipXp = Lb * cosB - rB * sinB;
  const tipXm = Lb * cosB + rB * sinB;
  const tipYp = Lb * sinB + rB * cosB;
  const tipYm = Lb * sinB - rB * cosB;

  // Bounding box (mm) + label margins.
  const xMin = Math.min(-hh, tipXm, tipXp) - 0.06 * 2 * R;
  const xMax = Math.max(hh, tipXm, tipXp) + 0.10 * 2 * R;
  const yMin = -R - 0.10 * 2 * R;
  const yMax = Math.max(R, tipYm, tipYp) + 0.14 * 2 * R;

  const padX = 8;
  const padY = 8;
  const k = Math.min((W - 2 * padX) / (xMax - xMin), (H - 2 * padY) / (yMax - yMin));
  const sx = (x: number) => padX + (x - xMin) * k;
  const sy = (y: number) => H - padY - (y - yMin) * k;

  const parts: string[] = [];
  const P = (x: number, y: number) => `${sx(x).toFixed(1)},${sy(y).toFixed(1)}`;

  /* ── Header: a clearly LONG horizontal tube ── */
  const capRx = 0.16 * R; // end-cap ellipse semi-axis (pseudo-3D)
  parts.push(`<ellipse cx="${sx(-hh).toFixed(1)}" cy="${sy(0).toFixed(1)}" rx="${(capRx * k).toFixed(1)}" ry="${(R * k).toFixed(1)}" fill="#1b1b21" stroke="#4b4b55" stroke-width="1"/>`);
  parts.push(`<rect x="${sx(-hh).toFixed(1)}" y="${sy(R).toFixed(1)}" width="${(2 * hh * k).toFixed(1)}" height="${(2 * R * k).toFixed(1)}" fill="#1b1b21"/>`);
  parts.push(`<line x1="${sx(-hh).toFixed(1)}" y1="${sy(R).toFixed(1)}" x2="${sx(hh).toFixed(1)}" y2="${sy(R).toFixed(1)}" stroke="#5b5b66" stroke-width="1.4"/>`);
  parts.push(`<line x1="${sx(-hh).toFixed(1)}" y1="${sy(-R).toFixed(1)}" x2="${sx(hh).toFixed(1)}" y2="${sy(-R).toFixed(1)}" stroke="#4b4b55" stroke-width="1.2"/>`);
  // Visible right end cap (near end).
  parts.push(`<ellipse cx="${sx(hh).toFixed(1)}" cy="${sy(0).toFixed(1)}" rx="${(capRx * k).toFixed(1)}" ry="${(R * k).toFixed(1)}" fill="#22222a" stroke="#5b5b66" stroke-width="1.4"/>`);
  // Header axis centerline (dash-dot).
  parts.push(`<line x1="${sx(-hh - 12).toFixed(1)}" y1="${sy(0).toFixed(1)}" x2="${sx(hh + 12).toFixed(1)}" y2="${sy(0).toFixed(1)}" stroke="#3f3f46" stroke-width="0.8" stroke-dasharray="10,3,2,3"/>`);

  /* ── Branch: tube at β resting on the header, saddle from the engine ── */
  const N = result.stations.length - 1;
  const near: [number, number][] = [];
  const far: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const p = projectStation(result, i);
    if (i <= N / 2) near.push([sx(p.x), sy(p.y)]);
    if (i >= N / 2) far.push([sx(p.x), sy(p.y)]);
  }

  // Branch axis centerline (dash-dot) from the origin to the tip.
  parts.push(`<line x1="${sx(0).toFixed(1)}" y1="${sy(0).toFixed(1)}" x2="${sx(Lb * cosB).toFixed(1)}" y2="${sy(Lb * sinB).toFixed(1)}" stroke="#3f3f46" stroke-width="0.8" stroke-dasharray="10,3,2,3"/>`);

  // Branch body: silhouette at v = ±rB from the saddle ends to the tip,
  // closed along the near-half saddle arc (the visible cut).
  const p0 = projectStation(result, 0);        // (s(0), +rB)
  const pH = projectStation(result, N / 2);    // θ = 180° → (s(180), −rB)
  const tipP = { x: Lb * cosB - rB * sinB, y: Lb * sinB + rB * cosB };
  const tipM = { x: Lb * cosB + rB * sinB, y: Lb * sinB - rB * cosB };
  const bodyPts = [
    P(p0.x, p0.y),
    ...near.slice(1, near.length - 1).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`),
    P(pH.x, pH.y),
    P(tipM.x, tipM.y),
    P(tipP.x, tipP.y),
  ].join(' ');
  parts.push(`<polygon points="${bodyPts}" fill="#26262e" stroke="none"/>`);
  // Branch silhouette edges.
  parts.push(`<line x1="${sx(p0.x).toFixed(1)}" y1="${sy(p0.y).toFixed(1)}" x2="${sx(tipP.x).toFixed(1)}" y2="${sy(tipP.y).toFixed(1)}" stroke="#71717a" stroke-width="1.4"/>`);
  parts.push(`<line x1="${sx(pH.x).toFixed(1)}" y1="${sy(pH.y).toFixed(1)}" x2="${sx(tipM.x).toFixed(1)}" y2="${sy(tipM.y).toFixed(1)}" stroke="#71717a" stroke-width="1.4"/>`);
  // Branch top cap (ellipse perpendicular to â).
  const capR = { x: Lb * cosB, y: Lb * sinB };
  parts.push(`<ellipse cx="${sx(capR.x).toFixed(1)}" cy="${sy(capR.y).toFixed(1)}" rx="${(rB * k).toFixed(1)}" ry="${Math.max(2, 0.16 * rB * k).toFixed(1)}" fill="#2c2c35" stroke="#71717a" stroke-width="1.2" transform="rotate(${(-betaDeg).toFixed(1)} ${sx(capR.x).toFixed(1)} ${sy(capR.y).toFixed(1)})"/>`);

  // Far half of the saddle mouth (visible through the open cut, behind).
  if (betaDeg < 90 - 1e-9) {
    const farPts = far.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    parts.push(`<polyline points="${farPts}" fill="none" stroke="#b45309" stroke-width="1.4" opacity="0.65"/>`);
  }
  // Near half of the saddle mouth — THE cut, amber, engine-canonical.
  const nearPts = near.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  parts.push(`<polyline points="${nearPts}" fill="none" stroke="#f59e0b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`);

  /* ── β angle arc between the header axis and the branch axis ── */
  const rb = Math.min(0.55 * R * k, 52);
  const arcStart = { x: sx(0) + rb, y: sy(0) }; // on the header axis, +x side
  const arcEnd = { x: sx(0) + rb * Math.cos(beta), y: sy(0) - rb * Math.sin(beta) };
  const largeArc = 0;
  const sweep = 0; // counterclockwise on screen (upwards from the header axis)
  parts.push(`<path d="M ${arcStart.x.toFixed(1)} ${arcStart.y.toFixed(1)} A ${rb.toFixed(1)} ${rb.toFixed(1)} 0 ${largeArc} ${sweep} ${arcEnd.x.toFixed(1)} ${arcEnd.y.toFixed(1)}" fill="none" stroke="#a1a1aa" stroke-width="1"/>`);
  const midAng = -beta / 2;
  parts.push(`<text x="${(sx(0) + (rb + 14) * Math.cos(midAng)).toFixed(1)}" y="${(sy(0) + (rb + 14) * Math.sin(midAng) + 3).toFixed(1)}" fill="#d4d4d8" font-size="10" font-family="monospace" text-anchor="middle">β = ${esc(String(betaDeg))}°</text>`);

  /* ── Diameter labels (from the resolved engine values) ── */
  parts.push(`<text x="${sx(hh).toFixed(1)}" y="${(sy(-R) + 26).toFixed(1)}" fill="#a1a1aa" font-size="10" font-family="monospace" text-anchor="end">Ø ${(2 * R).toFixed(1)}</text>`);
  parts.push(`<text x="${sx(tipP.x).toFixed(1)}" y="${(sy(tipP.y) - 8).toFixed(1)}" fill="#f59e0b" font-size="10" font-family="monospace">Ø ${(2 * rB).toFixed(1)}</text>`);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="background:#0a0a0a">${parts.join('')}</svg>`;
  return { svg, saddleNear: near, saddleFar: far, headerSpanMm: 2 * hh, scale: k };
}
