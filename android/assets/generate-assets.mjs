import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
const SRC = fileURLToPath(new URL('../../app/frontend/public/assets/logos/logo-icon.png', import.meta.url));
const OUT = fileURLToPath(new URL('.', import.meta.url));
const ORANGE = '#E8611A', BLACK = '#0B0B0D';
// Trim transparent padding of the source mark, recolour to corporate orange.
const mark = await sharp(SRC).trim().toBuffer();
async function recolor(buf, hex) {
  // use alpha of mark as mask over flat colour
  const { width, height } = await sharp(buf).metadata();
  const flat = await sharp({ create: { width, height, channels: 3, background: hex } }).raw().toBuffer();
  const alpha = await sharp(buf).ensureAlpha().extractChannel(3).raw().toBuffer();
  return sharp(flat, { raw: { width, height, channels: 3 } }).joinChannel(alpha, { raw: { width, height, channels: 1 } }).png().toBuffer();
}
const orangeMark = await recolor(mark, ORANGE);
const whiteMark = await recolor(mark, '#FFFFFF');
async function compose(size, bg, markBuf, markRatio, out, rounded = 0) {
  const m = Math.round(size * markRatio);
  const resized = await sharp(markBuf).resize({ width: m, height: m, fit: 'inside' }).toBuffer();
  const rm = await sharp(resized).metadata();
  let base = sharp({ create: { width: size, height: size, channels: 4, background: bg } });
  if (rounded) {
    const svg = `<svg width="${size}" height="${size}"><rect x="0" y="0" width="${size}" height="${size}" rx="${rounded}" fill="${bg}"/></svg>`;
    base = sharp(Buffer.from(svg));
  }
  await base.composite([{ input: resized, left: Math.round((size - rm.width) / 2), top: Math.round((size - rm.height) / 2) }]).png().toFile(out);
}
// Play Store icon 512 (no transparency): black background, orange mark
await compose(512, BLACK, orangeMark, 0.68, `${OUT}/icon-512.png`);
// Maskable/adaptive icon 512: orange background, white mark inside 80% safe zone
await compose(512, ORANGE, whiteMark, 0.52, `${OUT}/icon-maskable-512.png`);
// Monochrome icon (themed icons Android 13+): white mark on transparent
await compose(512, { r: 0, g: 0, b: 0, alpha: 0 }, whiteMark, 0.52, `${OUT}/icon-monochrome-512.png`);
// Splash: Bubblewrap uses splashScreen with background color + icon; provide 1024 mark on black
await compose(1024, BLACK, orangeMark, 0.42, `${OUT}/splash-1024.png`);
// Feature graphic 1024x500 draft
const fg = `<svg width="1024" height="500" xmlns="http://www.w3.org/2000/svg">
<rect width="1024" height="500" fill="${BLACK}"/>
<rect x="0" y="470" width="1024" height="30" fill="${ORANGE}"/>
<text x="330" y="215" font-family="Inter, Arial, Helvetica, sans-serif" font-size="64" font-weight="700" fill="#FFFFFF">PIPINGBOX</text>
<text x="330" y="285" font-family="Inter, Arial, Helvetica, sans-serif" font-size="40" font-weight="500" fill="${ORANGE}">Industrial Tools</text>
<text x="330" y="345" font-family="Inter, Arial, Helvetica, sans-serif" font-size="24" fill="#A3A9B3">Pipefitting calculators · ASME references · No sign-up required</text>
</svg>`;
const fgMark = await sharp(orangeMark).resize({ width: 220, height: 220, fit: 'inside' }).toBuffer();
const fm = await sharp(fgMark).metadata();
await sharp(Buffer.from(fg)).composite([{ input: fgMark, left: Math.round(80 + (220 - fm.width) / 2), top: Math.round(140 + (220 - fm.height) / 2) }]).png().toFile(`${OUT}/feature-graphic-1024x500.png`);
