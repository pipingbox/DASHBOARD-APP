/* ───────────────────────────────────────────────────────────────────────────
   Deterministic physical PDF writer for the H-001 fabrication artifacts.

   Consumes the mm-based SVG pages produced by our own template generators
   (rect / line / polyline / polygon / circle / text subset only) and emits
   a PDF whose pages keep the exact physical size in mm — no browser
   window.print() scaling, no fit-to-page, no timestamps (byte-deterministic:
   building the same artifact twice yields identical bytes).

   Text uses the base-14 Courier family (monospace, matching the SVG) with
   WinAnsiEncoding. Glyphs outside Latin-1 are transliterated (π→pi, β→beta,
   Δ→delta, θ→theta, ≡→=, …) so a physical print never depends on embedded
   fonts. `pdfLatin1Safe()` lets callers detect locales that cannot be
   encoded and fall back to a Latin-1 label set.
   ─────────────────────────────────────────────────────────────────────────── */

export interface PdfPageInput {
  svg: string;
  widthMm: number;
  heightMm: number;
}

const MM2PT = 72 / 25.4;

/* ── Transliteration for WinAnsi-unrepresentable glyphs ── */
const GLYPH_MAP: Record<string, string> = {
  'π': 'pi', 'Δ': 'delta', 'θ': 'theta', 'β': 'beta', 'Σ': 'Sum',
  '≡': '=', '×': 'x', '÷': '/', '→': '->', '←': '<-', '↔': '<->',
  '—': '-', '–': '-', '’': "'", '‘': "'", '“': '"', '”': '"',
  '≈': '~', '≤': '<=', '≥': '>=', '±': '±', '·': '·', '°': '°',
};

/** True when every character survives PDF Latin-1 encoding unchanged. */
export function pdfLatin1Safe(s: string): boolean {
  for (const ch of s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')) {
    if (ch in GLYPH_MAP) continue;
    if (ch.charCodeAt(0) > 0xff) return false;
  }
  return true;
}

function toLatin1(s: string): string {
  let out = '';
  for (const ch of s) {
    out += ch in GLYPH_MAP ? GLYPH_MAP[ch] : ch.charCodeAt(0) <= 0xff ? ch : '?';
  }
  return out;
}

const escapePdfString = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

/* ── Minimal SVG subset parser (our own generated markup only) ── */
interface SvgEl {
  tag: string;
  attrs: Record<string, string>;
  content: string;
}

const EL_RE = /<(rect|line|polyline|polygon|circle|text)((?:\s+[\w-]+="[^"]*")*)\s*(?:\/>|>([\s\S]*?)<\/\1\s*>)/g;
const ATTR_RE = /([\w-]+)="([^"]*)"/g;

function parseSvg(svg: string): SvgEl[] {
  const els: SvgEl[] = [];
  let m: RegExpExecArray | null;
  EL_RE.lastIndex = 0;
  while ((m = EL_RE.exec(svg)) !== null) {
    const attrs: Record<string, string> = {};
    let a: RegExpExecArray | null;
    ATTR_RE.lastIndex = 0;
    while ((a = ATTR_RE.exec(m[2])) !== null) attrs[a[1]] = a[2];
    els.push({ tag: m[1], attrs, content: (m[3] ?? '').trim() });
  }
  return els;
}

/* ── Color / geometry helpers ── */
function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h || '000000', 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const f = (v: number) => Number(v.toFixed(3));

function parsePoints(pts: string): [number, number][] {
  return pts.trim().split(/\s+/).filter(Boolean).map(p => {
    const [x, y] = p.split(',');
    return [parseFloat(x), parseFloat(y)] as [number, number];
  });
}

/* ── Content-stream emission (mm input, pt output; y flipped) ── */
function pageContent(svg: string, pageHpt: number): string {
  const ops: string[] = ['q'];
  const num = (attr: string, def = 0) => parseFloat(attr) || def; // '' → def

  for (const el of parseSvg(svg)) {
    const { attrs } = el;
    const stroke = attrs.stroke && attrs.stroke !== 'none' ? attrs.stroke : null;
    const fill = attrs.fill && attrs.fill !== 'none' ? attrs.fill : null;
    const lw = attrs['stroke-width'] ? parseFloat(attrs['stroke-width']) * MM2PT : 0.3;
    const dash = attrs['stroke-dasharray'] ? attrs['stroke-dasharray'].split(',').map(d => f(parseFloat(d) * MM2PT)).join(' ') : null;

    if (stroke) {
      const [r, g, b] = hexToRgb(stroke);
      ops.push(`${f(r)} ${f(g)} ${f(b)} RG`);
      ops.push(`${f(lw)} w`);
      ops.push(dash ? `[${dash}] 0 d` : '[] 0 d');
    }
    if (fill) {
      const [r, g, b] = hexToRgb(fill);
      ops.push(`${f(r)} ${f(g)} ${f(b)} rg`);
    }

    const X = (v: string) => f(num(v) * MM2PT);
    const Y = (v: string) => f(pageHpt - num(v) * MM2PT); // SVG y-down → PDF y-up

    switch (el.tag) {
      case 'line': {
        ops.push(`${X(attrs.x1)} ${Y(attrs.y1)} m ${X(attrs.x2)} ${Y(attrs.y2)} l ${paint(stroke, fill)}`);
        break;
      }
      case 'rect': {
        const x = num(attrs.x), y = num(attrs.y), w = num(attrs.width), h = num(attrs.height);
        // PDF rect: from bottom-left corner.
        ops.push(`${X(String(x))} ${Y(String(y + h))} ${f(w * MM2PT)} ${f(h * MM2PT)} re ${paint(stroke, fill)}`);
        break;
      }
      case 'polyline':
      case 'polygon': {
        const pts = parsePoints(attrs.points);
        if (pts.length < 2) break;
        ops.push(`${X(String(pts[0][0]))} ${Y(String(pts[0][1]))} m`);
        for (let i = 1; i < pts.length; i++) ops.push(`${X(String(pts[i][0]))} ${Y(String(pts[i][1]))} l`);
        if (el.tag === 'polygon') ops.push('h');
        ops.push(paint(stroke, fill));
        break;
      }
      case 'circle': {
        const cx = num(attrs.cx), cy = num(attrs.cy), r = num(attrs.r);
        const k = 0.5523 * r;
        const px = (dx: number) => f((cx + dx) * MM2PT);
        const py = (dy: number) => f(pageHpt - (cy + dy) * MM2PT);
        ops.push(`${px(-r)} ${py(0)} m`);
        ops.push(`${px(-r)} ${py(k)} ${px(-k)} ${py(r)} ${px(0)} ${py(r)} c`);
        ops.push(`${px(k)} ${py(r)} ${px(r)} ${py(k)} ${px(r)} ${py(0)} c`);
        ops.push(`${px(r)} ${py(-k)} ${px(k)} ${py(-r)} ${px(0)} ${py(-r)} c`);
        ops.push(`${px(-k)} ${py(-r)} ${px(-r)} ${py(-k)} ${px(-r)} ${py(0)} c`);
        ops.push(paint(stroke, fill));
        break;
      }
      case 'text': {
        const fs = num(attrs['font-size'], 3) * MM2PT;
        const bold = attrs['font-weight'] === 'bold';
        const raw = attrs.content ?? el.content;
        const txt = toLatin1(raw.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
        const w = txt.length * 0.6 * fs; // Courier advance
        const anchor = attrs['text-anchor'] ?? 'start';
        let x = num(attrs.x) * MM2PT;
        if (anchor === 'middle') x -= w / 2;
        else if (anchor === 'end') x -= w;
        const y = pageHpt - num(attrs.y) * MM2PT;
        ops.push(`BT /${bold ? 'F2' : 'F1'} ${f(fs)} Tf ${f(x)} ${f(y)} Td (${escapePdfString(txt)}) Tj ET`);
        break;
      }
    }
  }
  ops.push('Q');
  return ops.join('\n');
}

const paint = (stroke: string | null, fill: string | null) =>
  stroke && fill ? 'B' : fill ? 'f' : 'S';

/* ── PDF assembly (deterministic: fixed object order, no dates) ── */
export function svgPagesToPdf(pages: PdfPageInput[]): Uint8Array {
  const n = pages.length;
  // Object layout: 1 catalog, 2 pages, 3..(n+2) page objects,
  // (n+3) F1 Courier, (n+4) F2 Courier-Bold, (n+5)..(n+4+n) content streams.
  const fontF1 = n + 3;
  const fontF2 = n + 4;
  const firstContent = n + 5;

  const chunks: string[] = [];
  const offsets: number[] = [];
  let pos = 0;
  const push = (s: string) => {
    chunks.push(s);
    pos += s.length;
  };

  push('%PDF-1.4\n');
  offsets[0] = 0; // object 1 written immediately after header

  // Object numbering: obj i is at offsets[i-1].
  offsets[1 - 1] = pos;
  push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
  offsets[2 - 1] = pos;
  const kids = pages.map((_, i) => `${3 + i} 0 R`).join(' ');
  push(`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${n} >>\nendobj\n`);
  pages.forEach((p, i) => {
    offsets[3 + i - 1] = pos;
    const wpt = f(p.widthMm * MM2PT);
    const hpt = f(p.heightMm * MM2PT);
    push(`${3 + i} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${wpt} ${hpt}] /Resources << /Font << /F1 ${fontF1} 0 R /F2 ${fontF2} 0 R >> >> /Contents ${firstContent + i} 0 R >>\nendobj\n`);
  });
  offsets[fontF1 - 1] = pos;
  push(`${fontF1} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>\nendobj\n`);
  offsets[fontF2 - 1] = pos;
  push(`${fontF2} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>\nendobj\n`);
  pages.forEach((p, i) => {
    offsets[firstContent + i - 1] = pos;
    const content = pageContent(p.svg, p.heightMm * MM2PT);
    push(`${firstContent + i} 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
  });

  const xrefPos = pos;
  // Objects: 1 catalog + 1 pages + n pages + 2 fonts + n streams = 2n + 4.
  const total = firstContent + n - 1;
  let xref = `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= total; i++) {
    xref += String(offsets[i - 1]).padStart(10, '0') + ' 00000 n \n';
  }
  push(xref);
  push(`trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`);

  // Latin-1 byte assembly (char codes ≤ 0xFF by construction).
  const out = new Uint8Array(pos);
  let cursor = 0;
  for (const c of chunks) {
    for (let i = 0; i < c.length; i++) out[cursor++] = c.charCodeAt(i) & 0xff;
  }
  return out;
}
