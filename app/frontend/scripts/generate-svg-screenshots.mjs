/**
 * Generate standalone SVG screenshots of the stud bolt drawing.
 *
 * Run from app/frontend: node scripts/generate-svg-screenshots.mjs
 *
 * Output: ../../screenshots/stud-bolt-{desktop,mobile}.svg
 */

import { mkdir, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { resolveBoltingSpec } from '../src/lib/bolting/resolve-bolting-spec.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OUT_DIR = join(__dirname, '..', '..', '..', 'screenshots');

function fmtFrac(inches) {
  const map = {
    0.5: '1/2"', 0.625: '5/8"', 0.75: '3/4"', 0.875: '7/8"', 1: '1"',
    1.125: '1-1/8"', 1.25: '1-1/4"', 1.375: '1-3/8"', 1.5: '1-1/2"',
    1.625: '1-5/8"', 1.75: '1-3/4"', 1.875: '1-7/8"', 2: '2"',
  };
  return map[inches] || `${inches.toFixed(3)}"`;
}

function generateSVG(spec, expanded = false) {
  if (!spec.available || !spec.stud || !spec.nut) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200"><text x="200" y="100" text-anchor="middle" fill="#999">No data</text></svg>`;
  }

  const { stud, nut } = spec;
  const viewW = expanded ? 900 : 760;
  const viewH = expanded ? 340 : 280;
  const margin = 50;
  const drawW = viewW - margin * 2;

  const scale = (drawW * 0.65) / stud.lengthMm;
  const cy = viewH / 2;
  const studLen = stud.lengthMm * scale;
  const studDia = Math.max(stud.diameterIn * 25.4 * scale, 6);
  const nutH = Math.max(nut.heightMm * scale, 10);
  const nutW = Math.max(nut.afMm * scale, 12);
  const protrusion = stud.minProtrusionMm * scale;
  const pitchPx = stud.pitchMm * scale;

  const studLeft = (viewW - studLen) / 2;
  const studRight = studLeft + studLen;
  const studTop = cy - studDia / 2;

  const flangeW = studLen * 0.16;
  const gasketW = Math.max(studLen * 0.04, 8);
  const cx = viewW / 2;

  const flangeLeftX = cx - flangeW - gasketW / 2;
  const flangeRightX = cx + gasketW / 2;
  const flangeH = Math.max(studDia * 4.5, 70);

  const gasketX = cx - gasketW / 2;
  const gasketH = flangeH - 24;

  const leftNutCx = studLeft + protrusion + nutW / 2;
  const rightNutCx = studRight - protrusion - nutW / 2;

  const orange = '#FF8C00';
  const blue = '#3EA6FF';
  const zinc = '#A3A9B3';
  const dark = '#0E1117';
  const flangeFill = '#27272a';
  const nutFill = '#232A36';

  function hexPoints(cx0, cy0, w, h) {
    const hw = w / 2;
    const hh = h / 2;
    return `${cx0 - hw * 0.8},${cy0 - hh} ${cx0 + hw * 0.8},${cy0 - hh} ${cx0 + hw},${cy0} ${cx0 + hw * 0.8},${cy0 + hh} ${cx0 - hw * 0.8},${cy0 + hh} ${cx0 - hw},${cy0}`;
  }

  function threads(x1, x2) {
    const length = x2 - x1;
    if (length <= 0) return '';
    const minThreads = 3;
    const threads = Math.max(minThreads, Math.floor(length / Math.max(pitchPx, 2)));
    const step = length / threads;
    let s = '';
    for (let i = 0; i < threads; i++) {
      const xi = x1 + (i + 0.5) * step;
      const xo = xi - Math.min(step * 0.35, studDia * 0.4);
      s += `<line x1="${xi}" y1="${studTop}" x2="${xo}" y2="${studTop + studDia}" stroke="${blue}" stroke-width="0.7" opacity="0.85" />`;
    }
    return s;
  }

  const Ltext = `${fmtFrac(stud.lengthMm / 25.4)} (${stud.lengthMm} mm)`;
  const dtext = `${fmtFrac(stud.diameterIn)} (${(stud.diameterIn * 25.4).toFixed(3)} mm)`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewW} ${viewH}" width="100%" height="auto" role="img" aria-label="Stud bolt ${stud.threadDesignation}, NPS ${spec.nps} Class ${spec.pressureClass} ${spec.facing}">
    <rect width="${viewW}" height="${viewH}" fill="${dark}" rx="6" />
    <defs>
      <pattern id="studGrid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="#1a2030" stroke-width="0.3"/></pattern>
      <marker id="arrL" markerWidth="6" markerHeight="6" refX="0" refY="3" orient="auto"><path d="M6,0 L0,3 L6,6" fill="none" stroke="${orange}" stroke-width="1"/></marker>
      <marker id="arrR" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="none" stroke="${orange}" stroke-width="1"/></marker>
      <marker id="arrLB" markerWidth="5" markerHeight="5" refX="0" refY="2.5" orient="auto"><path d="M5,0 L0,2.5 L5,5" fill="none" stroke="${blue}" stroke-width="0.8"/></marker>
      <marker id="arrRB" markerWidth="5" markerHeight="5" refX="5" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5" fill="none" stroke="${blue}" stroke-width="0.8"/></marker>
    </defs>
    <rect width="${viewW}" height="${viewH}" fill="url(#studGrid)" opacity="0.5" />

    <rect x="${flangeLeftX}" y="${cy - flangeH / 2}" width="${flangeW}" height="${flangeH}" fill="${flangeFill}" stroke="${zinc}" stroke-width="1.5" rx="2" />
    <text x="${flangeLeftX + flangeW / 2}" y="${cy + 4}" fill="#71717a" font-size="9" text-anchor="middle">FLANGE</text>

    <rect x="${gasketX}" y="${cy - gasketH / 2}" width="${gasketW}" height="${gasketH}" fill="#22d3ee15" stroke="#22d3ee" stroke-width="1" />
    <text x="${cx}" y="${cy - gasketH / 2 - 6}" fill="#22d3ee" font-size="8" text-anchor="middle">GASKET</text>

    <rect x="${flangeRightX}" y="${cy - flangeH / 2}" width="${flangeW}" height="${flangeH}" fill="${flangeFill}" stroke="${zinc}" stroke-width="1.5" rx="2" />
    <text x="${flangeRightX + flangeW / 2}" y="${cy + 4}" fill="#71717a" font-size="9" text-anchor="middle">FLANGE</text>

    <rect x="${studLeft}" y="${studTop}" width="${studLen}" height="${studDia}" fill="#1a2030" stroke="${orange}" stroke-width="1.2" />

    ${threads(studLeft, leftNutCx - nutW / 2)}
    ${threads(rightNutCx + nutW / 2, studRight)}

    <polygon points="${hexPoints(leftNutCx, cy, nutW, nutH)}" fill="${nutFill}" stroke="${orange}" stroke-width="1.5" />
    <line x1="${leftNutCx - nutW / 4}" y1="${cy - nutH / 3}" x2="${leftNutCx + nutW / 4}" y2="${cy - nutH / 3}" stroke="#3f3f46" stroke-width="0.5" />
    <line x1="${leftNutCx - nutW / 4}" y1="${cy + nutH / 3}" x2="${leftNutCx + nutW / 4}" y2="${cy + nutH / 3}" stroke="#3f3f46" stroke-width="0.5" />

    <polygon points="${hexPoints(rightNutCx, cy, nutW, nutH)}" fill="${nutFill}" stroke="${orange}" stroke-width="1.5" />
    <line x1="${rightNutCx - nutW / 4}" y1="${cy - nutH / 3}" x2="${rightNutCx + nutW / 4}" y2="${cy - nutH / 3}" stroke="#3f3f46" stroke-width="0.5" />
    <line x1="${rightNutCx - nutW / 4}" y1="${cy + nutH / 3}" x2="${rightNutCx + nutW / 4}" y2="${cy + nutH / 3}" stroke="#3f3f46" stroke-width="0.5" />

    <text x="${cx}" y="${viewH - 10}" fill="#71717a" font-size="8" text-anchor="middle">L no incluye los chaflanes/puntas de los extremos</text>

    <line x1="${studLeft}" y1="${cy + flangeH / 2 + 18}" x2="${studRight}" y2="${cy + flangeH / 2 + 18}" stroke="${orange}" stroke-width="1.2" marker-start="url(#arrL)" marker-end="url(#arrR)" />
    <line x1="${studLeft}" y1="${cy + flangeH / 2 + 6}" x2="${studLeft}" y2="${cy + flangeH / 2 + 24}" stroke="${orange}" stroke-width="0.6" />
    <line x1="${studRight}" y1="${cy + flangeH / 2 + 6}" x2="${studRight}" y2="${cy + flangeH / 2 + 24}" stroke="${orange}" stroke-width="0.6" />
    <text x="${cx}" y="${cy + flangeH / 2 + 32}" fill="${orange}" font-size="11" text-anchor="middle" font-weight="bold">L = ${Ltext}</text>

    <line x1="${studLeft}" y1="${cy + flangeH / 2 + 42}" x2="${leftNutCx - nutW / 2}" y2="${cy + flangeH / 2 + 42}" stroke="${orange}" stroke-width="1" marker-start="url(#arrL)" marker-end="url(#arrR)" />
    <text x="${(studLeft + leftNutCx - nutW / 2) / 2}" y="${cy + flangeH / 2 + 52}" fill="${orange}" font-size="9" text-anchor="middle">e₁ ≥ 3P (${stud.minProtrusionMm.toFixed(1)} mm)</text>

    <line x1="${rightNutCx + nutW / 2}" y1="${cy + flangeH / 2 + 42}" x2="${studRight}" y2="${cy + flangeH / 2 + 42}" stroke="${orange}" stroke-width="1" marker-start="url(#arrL)" marker-end="url(#arrR)" />
    <text x="${(rightNutCx + nutW / 2 + studRight) / 2}" y="${cy + flangeH / 2 + 52}" fill="${orange}" font-size="9" text-anchor="middle">e₂ ≥ 3P (${stud.minProtrusionMm.toFixed(1)} mm)</text>

    <text x="${cx}" y="${studTop - 28}" fill="${blue}" font-size="10" text-anchor="middle">TPI = ${stud.tpi} · P = ${stud.pitchMm.toFixed(3)} mm</text>
    <line x1="${cx - pitchPx / 2}" y1="${studTop - 22}" x2="${cx + pitchPx / 2}" y2="${studTop - 22}" stroke="${blue}" stroke-width="0.8" marker-start="url(#arrLB)" marker-end="url(#arrRB)" />

    <line x1="${cx}" y1="${studTop - 10}" x2="${cx}" y2="${studTop + studDia + 4}" stroke="${blue}" stroke-width="0.8" stroke-dasharray="3 2" />
    <text x="${cx + 6}" y="${studTop - 14}" fill="${blue}" font-size="10" text-anchor="start">Ø${dtext}</text>

    <line x1="${leftNutCx - nutW / 2 - 6}" y1="${cy - nutH / 2 - 8}" x2="${leftNutCx + nutW / 2 + 6}" y2="${cy - nutH / 2 - 8}" stroke="${blue}" stroke-width="0.8" marker-start="url(#arrLB)" marker-end="url(#arrRB)" />
    <text x="${leftNutCx}" y="${cy - nutH / 2 - 14}" fill="${blue}" font-size="9" text-anchor="middle">AF ${nut.afMm.toFixed(1)} mm</text>

    <line x1="${rightNutCx + nutW / 2 + 12}" y1="${cy - nutH / 2}" x2="${rightNutCx + nutW / 2 + 12}" y2="${cy + nutH / 2}" stroke="${blue}" stroke-width="0.8" marker-start="url(#arrLB)" marker-end="url(#arrRB)" />
    <text x="${rightNutCx + nutW / 2 + 18}" y="${cy + 3}" fill="${blue}" font-size="9" text-anchor="start">H ${nut.heightMm.toFixed(1)} mm</text>

    <text x="${viewW - 10}" y="18" fill="#A3A9B3" font-size="9" text-anchor="end">${spec.nps} — Class ${spec.pressureClass} — ${spec.facing}</text>
  </svg>`;
}

async function main() {
  const spec = resolveBoltingSpec('2"', 150, 'RF');

  mkdir(OUT_DIR, { recursive: true }, () => {});

  const desktopSVG = generateSVG(spec, true);
  const mobileSVG = generateSVG(spec, false);

  writeFileSync(join(OUT_DIR, 'stud-bolt-desktop.svg'), desktopSVG);
  writeFileSync(join(OUT_DIR, 'stud-bolt-mobile.svg'), mobileSVG);
  console.log('SVG screenshots written to', OUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
