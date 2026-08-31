/**
 * Regenera los iconos de PIPINGBOX desde el master icon-1024.png.
 *
 * Problema detectado (PB-BRAND-001 seguimiento): el simbolo ocupaba solo ~30% del
 * ancho y ~37% del alto del lienzo. El resto era aire transparente, asi que tanto
 * la pestana del navegador como el icono de aplicacion se veian pequenos. No era
 * un problema de CSS ni de tamanos declarados: era el propio asset.
 *
 * Estrategia: recortar el padding transparente del master y recomponer con un
 * margen deliberado y distinto segun destino.
 */
const sharp = require('sharp');
const path = require('path');

const DIR = 'app/frontend/public/assets/favicons/';
const MASTER = path.join(DIR, 'icon-1024.png');
const BG = { r: 10, g: 10, b: 10, alpha: 1 }; // #0a0a0a, background_color del manifest

// margen = proporcion del lienzo que queda libre alrededor del simbolo
const TARGETS = [
  // Favicons de navegador: el simbolo debe llenar el lienzo. A 16 px cada pixel cuenta.
  { name: 'favicon-16.png', size: 16, margin: 0.04, bg: null },
  { name: 'favicon-32.png', size: 32, margin: 0.04, bg: null },
  { name: 'favicon-48.png', size: 48, margin: 0.05, bg: null },
  // PWA "any": margen algo mayor porque el SO puede aplicar su propio recorte.
  { name: 'favicon-192.png', size: 192, margin: 0.08, bg: null },
  { name: 'favicon-512.png', size: 512, margin: 0.08, bg: null },
  // iOS no respeta transparencia en apple-touch-icon: fondo opaco explicito.
  { name: 'apple-touch-icon-180.png', size: 180, margin: 0.10, bg: BG },
  // Android maskable: el simbolo debe caber en la "safe zone" central del 80%,
  // porque el SO recorta a circulo o squircle. Margen grande a proposito.
  { name: 'icon-maskable-512.png', size: 512, margin: 0.21, bg: BG },
];

(async () => {
  const trimmed = await sharp(MASTER).trim({ threshold: 1 }).toBuffer();
  const tm = await sharp(trimmed).metadata();
  console.log('simbolo recortado del master: ' + tm.width + 'x' + tm.height);

  for (const t of TARGETS) {
    const box = Math.round(t.size * (1 - 2 * t.margin));
    const resized = await sharp(trimmed)
      .resize(box, box, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();
    const rm = await sharp(resized).metadata();
    const left = Math.round((t.size - rm.width) / 2);
    const top = Math.round((t.size - rm.height) / 2);

    await sharp({
      create: {
        width: t.size,
        height: t.size,
        channels: 4,
        background: t.bg || { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: resized, left, top }])
      .png({ compressionLevel: 9 })
      .toFile(path.join(DIR, t.name));

    console.log(t.name.padEnd(26) + ' ' + t.size + 'px  simbolo ' + rm.width + 'x' + rm.height +
      '  ocupa ' + Math.round((100 * rm.width) / t.size) + '% x ' + Math.round((100 * rm.height) / t.size) + '%' +
      (t.bg ? '  fondo opaco' : ''));
  }
})();
