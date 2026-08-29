#!/usr/bin/env node
/**
 * render-catalog-3d.mjs — rasterizador PBR offline para el catalogo de accesorios
 * Ticket: PB-TOOLS-CATALOG-3D
 *
 * Sustituye los renders de Blender Cycles del Brain, que el Product Owner
 * rechazo por "parecer generados con IA". No lo eran: eran Cycles a 256
 * samples. Se veian sinteticos por tres defectos concretos del shading, que
 * este script corrige:
 *
 *   1. No habia iluminacion de entorno. El material es Metallic 0.95, o sea un
 *      metal casi puro, y en PBR un metal no tiene difusa propia: se ve
 *      EXCLUSIVAMENTE por lo que refleja. El entorno era un color plano mas 3
 *      area lights, asi que el metal solo podia reflejar tres manchas y gris
 *      uniforme. Aqui se reemplaza por un entorno procedural de estudio con
 *      gradiente vertical, softboxes y banda de horizonte: la radiancia varia
 *      de forma continua con la direccion, que es lo que produce los gradientes
 *      creibles sobre superficie curva.
 *   2. No habia bevel en las aristas. Las aristas del STL son matematicamente
 *      afiladas y no producen la linea especular que tiene toda pieza real.
 *      Se sustituye por un realce de arista en post, detectando discontinuidad
 *      de normal y de profundidad.
 *   3. Rugosidad constante 0.28 en toda la superficie. Aqui se modula con value
 *      noise sobre coordenadas de objeto en un rango contenido.
 *
 * Blender no se puede ejecutar en el contenedor de build (falta el loader de
 * glibc y no hay root), de ahi que esto sea un rasterizador en Node puro. La
 * unica dependencia nativa es `sharp`, y solo para el downsample Lanczos y la
 * codificacion WebP.
 *
 * `sharp` NO es dependencia del proyecto a proposito, igual que en
 * sync-catalog-assets.mjs: este script se ejecuta a mano cuando cambian los
 * STL y su salida se commitea. Se resuelve con createRequire apuntando a
 * app/frontend/package.json. Instalalo transitoriamente si falta:
 *
 *   npm i sharp --no-save --prefix app/frontend
 *   node scripts/render-catalog-3d.mjs
 *
 * Uso:
 *   node scripts/render-catalog-3d.mjs                  # las 28 piezas
 *   node scripts/render-catalog-3d.mjs weldolet         # solo las que casen
 *   node scripts/render-catalog-3d.mjs --out /tmp/x     # otro destino
 *   node scripts/render-catalog-3d.mjs --png            # PNG ademas de WebP
 *   node scripts/render-catalog-3d.mjs --size 512       # otra resolucion
 *
 * Determinista: el ruido usa semilla fija y no hay ninguna fuente de
 * aleatoriedad sin semilla, asi que dos ejecuciones dan bytes identicos.
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, '..');
const BRAIN_ROOT = resolve(APP_ROOT, '..');
const STL_DIR = join(BRAIN_ROOT, 'brain', '07-DESIGN', '02-ASSETS', 'CAD_REFERENCE');
const OUT_DIR_DEFAULT = join(APP_ROOT, 'app', 'frontend', 'public', 'catalog', '3d');

const require = createRequire(join(APP_ROOT, 'app', 'frontend', 'package.json'));

let sharp;
try {
  sharp = require('sharp');
} catch {
  console.error(
    '\nFalta `sharp`, necesario para el downsample Lanczos y la codificacion WebP.\n\n' +
      '  npm i sharp --no-save --prefix app/frontend\n\n' +
      'No se instala como dependencia del proyecto a proposito: este script se\n' +
      'ejecuta a mano y su salida se commitea.\n',
  );
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Configuracion
// ---------------------------------------------------------------------------

const CONFIG = {
  size: 1024, // resolucion final
  ss: 3, // supersampling: se rasteriza a size*ss y se reduce con Lanczos
  background: [0x30, 0x31, 0x31], // #303131, el que ya usa la ficha del catalogo
  webpQuality: 82,

  // Camara. Lente larga para que la perspectiva sea suave y no distorsione la
  // pieza: la convencion de fotografia de producto, no un 35 mm.
  focalMM: 90,
  sensorMM: 36,
  margin: 0.82, // fraccion del frame que ocupa la pieza tras el encuadre

  // Vista tres cuartos elevada: se ve la forma y las dos caras de conexion.
  // La direccion azimutal la fija el PCA de cada pieza (ver buildCamera); esto
  // es solo la elevacion minima sobre el horizonte.
  pitchDeg: 26,

  // Shading
  smoothAngleDeg: 35, // por encima de esto NO se promedia: preserva arista viva
  roughMin: 0.16,
  roughMax: 0.4,
  f0: [0.56, 0.57, 0.58], // acero, lineal
  envSamples: 5, // muestras jitteadas del entorno por pixel
  exposure: 0.85,

  // Post
  edgeStrength: 0.16,
  aoStrength: 0.5,
  noiseSeed: 0x50_49_50_42, // "PIPB". Semilla fija => salida determinista.
};

// ---------------------------------------------------------------------------
// Mapeo STL -> fichero de salida
// ---------------------------------------------------------------------------

/*
 * AVISO: hay una desalineacion documentada entre los IDs canonicos
 * PB-ASSET-XXXX de ASSET_SET.md y el contenido real de los ficheros. Por
 * ejemplo, ASSET_SET.md asigna el weldolet a PB-ASSET-0016, pero el fichero
 * real en disco y el que referencia catalog.generated.json es
 * PB-ASSET-0021_weldolet_3d.webp, y PB-ASSET-0016 es en realidad la cruz.
 *
 * Por eso el mapeo se hace SIEMPRE por slug y NUNCA por numero de ID. El
 * prefijo PB-ASSET-XXXX del nombre de salida se lee del directorio destino, no
 * se calcula. Si un STL no casa con exactamente un fichero existente, se
 * reporta y se omite: no se adivina.
 *
 * El slug del STL se obtiene quitando el sufijo de medida (_4in, _4x2in, _2in)
 * y cambiando _ por -. El del fichero de salida, quitando el prefijo
 * PB-ASSET-XXXX_ y el sufijo _3d.webp, y ademas el sufijo -bw cuando lo lleva
 * (es la connection type, no forma parte de la geometria).
 */

const SIZE_SUFFIX = /_(\d+(?:x\d+)?)in$/;

/*
 * STL excluidos por defecto de malla en el CAD de origen.
 *
 * Estos ficheros producen un render que NO representa la pieza que describe la
 * ficha del catalogo. Publicar un render asi es peor que no publicar ninguno:
 * el catalogo ya tolera componentes sin render 3D y la ficha cae correctamente
 * al plano 2D, que es el asset que realmente sostiene la informacion tecnica.
 *
 * El defecto esta en la geometria de entrada, no en el renderizador: ningun
 * ajuste de shading, camara o iluminacion puede reconstruir una superficie que
 * no existe en la malla. La reparacion exige regenerar el CAD de origen.
 *
 * Deuda registrada en PB-CAD-STL-REPAIR-001.
 *
 * Para volver a incluir uno, basta con borrar su entrada de esta tabla una vez
 * el STL este regenerado y verificado.
 */
const EXCLUDED_STL = new Map([
  [
    'return_180_lr_4in.stl',
    // No es la pieza: bounding box 10.3 x 102.3 x 102.2 mm con 900 triangulos.
    // Es una lamina plana (un disco), no un tubo curvado 180 grados de radio
    // 1.5 x NPS. Afecta a PB-COMP-RETURN-180-LR-BW-ASME-B16-9.
    'geometria incorrecta: lamina plana 10x102x102 mm, no es una curva de retorno',
  ],
  [
    'return_180_sr_4in.stl',
    // 47 aristas non-manifold (soldando vertices a 1e-4 de la diagonal) y 7683
    // pares de triangulos no adyacentes que se autointersecan. Normales
    // incoherentes y superficies que se atraviesan.
    // Afecta a PB-COMP-RETURN-180-SR-BW-ASME-B16-9.
    'malla corrupta: 47 aristas non-manifold y autointerseccion masiva',
  ],
  [
    'lateral_45_4in.stl',
    // 101 aristas abiertas (agujeros reales en la superficie) y 6815 pares de
    // triangulos autointersecantes en la union del ramal con el run.
    // Afecta a PB-COMP-LATERAL-45-BW-ASME-B16-9.
    'malla abierta: 101 aristas abiertas, agujeros reales en la superficie',
  ],
]);


function stlSlug(filename) {
  return basename(filename, '.stl').replace(SIZE_SUFFIX, '').replace(/_/g, '-');
}

function outputSlug(filename) {
  const m = /^PB-ASSET-\d{4}_(.+)_3d\.webp$/.exec(filename);
  if (!m) return null;
  return m[1].replace(/-bw$/, '');
}

/** Empareja cada STL con su fichero de salida existente. Nunca inventa nombres. */
function buildMapping(stlFiles, outDir) {
  const existing = existsSync(outDir)
    ? readdirSync(outDir).filter((f) => f.endsWith('_3d.webp'))
    : [];

  const bySlug = new Map();
  for (const f of existing) {
    const slug = outputSlug(f);
    if (!slug) continue;
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug).push(f);
  }

  const mapped = [];
  const unmapped = [];
  for (const stl of stlFiles) {
    const slug = stlSlug(stl);
    const candidates = bySlug.get(slug) ?? [];
    if (candidates.length === 1) {
      mapped.push({ stl, slug, out: candidates[0] });
    } else if (candidates.length === 0) {
      unmapped.push({ stl, slug, reason: 'no existe fichero de salida con ese slug' });
    } else {
      unmapped.push({
        stl,
        slug,
        reason: `slug ambiguo, casa con ${candidates.length}: ${candidates.join(', ')}`,
      });
    }
  }

  const usedOut = new Set(mapped.map((m) => m.out));
  const orphans = existing.filter((f) => !usedOut.has(f));

  return { mapped, unmapped, orphans };
}

// ---------------------------------------------------------------------------
// Lectura de STL binario
// ---------------------------------------------------------------------------

/*
 * Header de 80 bytes, uint32 con el numero de triangulos, y 50 bytes por
 * triangulo: 12 floats little-endian (normal + 3 vertices) y 2 bytes de
 * atributo que se ignoran.
 *
 * La normal almacenada se ignora deliberadamente: muchos de estos STL la
 * tienen a cero o mal orientada. Se recalcula por producto vectorial, que es
 * la unica fuente fiable.
 */
function readBinarySTL(path) {
  const buf = readFileSync(path);
  if (buf.length < 84) throw new Error(`STL demasiado corto: ${path}`);

  const header = buf.subarray(0, 80).toString('ascii');
  if (header.trimStart().toLowerCase().startsWith('solid') && buf.length < 84 + 50) {
    throw new Error(`Parece un STL ASCII, no soportado: ${path}`);
  }

  const triCount = buf.readUInt32LE(80);
  const expected = 84 + triCount * 50;
  if (buf.length < expected) {
    throw new Error(
      `STL truncado: ${path} declara ${triCount} triangulos (${expected} bytes) y tiene ${buf.length}`,
    );
  }

  const positions = new Float32Array(triCount * 9);
  for (let i = 0; i < triCount; i++) {
    const src = 84 + i * 50 + 12; // +12 salta la normal del fichero
    const dst = i * 9;
    for (let k = 0; k < 9; k++) {
      positions[dst + k] = buf.readFloatLE(src + k * 4);
    }
  }

  return { triCount, positions };
}

// ---------------------------------------------------------------------------
// Normales suaves preservando aristas vivas
// ---------------------------------------------------------------------------

/*
 * Los STL no comparten indices: cada triangulo repite sus tres vertices. Para
 * suavizar hay que agrupar los vertices coincidentes por posicion, con
 * tolerancia (cuantizacion a rejilla).
 *
 * Pero promediar todo redondearia tambien el bisel de soldadura y las caras
 * planas, que es justo lo que da la lectura de pieza mecanizada. Asi que el
 * promedio se restringe por angulo: dentro de cada grupo de vertices
 * coincidentes se forman subgrupos de caras cuyas normales estan dentro del
 * umbral (35 grados por defecto), y cada subgrupo promedia por separado. Una
 * arista de mas de 35 grados queda viva.
 */
function computeSmoothNormals(positions, triCount, smoothAngleDeg) {
  const faceNormals = new Float32Array(triCount * 3);
  const faceAreas = new Float32Array(triCount);

  for (let i = 0; i < triCount; i++) {
    const o = i * 9;
    const ax = positions[o], ay = positions[o + 1], az = positions[o + 2];
    const bx = positions[o + 3], by = positions[o + 4], bz = positions[o + 5];
    const cx = positions[o + 6], cy = positions[o + 7], cz = positions[o + 8];

    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;

    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;

    const len = Math.hypot(nx, ny, nz);
    faceAreas[i] = len * 0.5; // el modulo del producto vectorial es 2*area
    if (len > 1e-12) {
      faceNormals[i * 3] = nx / len;
      faceNormals[i * 3 + 1] = ny / len;
      faceNormals[i * 3 + 2] = nz / len;
    }
  }

  // Cuantizacion a rejilla relativa al tamano de la pieza. Con 1e-4 de la
  // diagonal se unifican vertices que el CAD escribio con error de redondeo
  // sin llegar a fusionar detalle real.
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < triCount * 9; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const diag = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) || 1;
  const cell = diag * 1e-4;
  const inv = 1 / cell;

  const buckets = new Map();
  for (let i = 0; i < triCount; i++) {
    for (let v = 0; v < 3; v++) {
      const o = i * 9 + v * 3;
      const kx = Math.round(positions[o] * inv);
      const ky = Math.round(positions[o + 1] * inv);
      const kz = Math.round(positions[o + 2] * inv);
      const key = `${kx},${ky},${kz}`;
      let list = buckets.get(key);
      if (!list) buckets.set(key, (list = []));
      list.push(i * 3 + v); // corner id
    }
  }

  const cosThreshold = Math.cos((smoothAngleDeg * Math.PI) / 180);
  const normals = new Float32Array(triCount * 9);

  for (const corners of buckets.values()) {
    if (corners.length === 1) {
      const c = corners[0];
      const f = (c / 3) | 0;
      normals[c * 3] = faceNormals[f * 3];
      normals[c * 3 + 1] = faceNormals[f * 3 + 1];
      normals[c * 3 + 2] = faceNormals[f * 3 + 2];
      continue;
    }

    // Subgrupos por similitud de normal. Los grupos son pequenos (valencia de
    // vertice tipica 4-8), asi que el O(n^2) es irrelevante.
    const groups = []; // { nx, ny, nz, members: [] } acumulado ponderado por area
    for (const c of corners) {
      const f = (c / 3) | 0;
      const fx = faceNormals[f * 3], fy = faceNormals[f * 3 + 1], fz = faceNormals[f * 3 + 2];

      let target = null;
      for (const g of groups) {
        const gl = Math.hypot(g.nx, g.ny, g.nz) || 1;
        const dot = (g.nx * fx + g.ny * fy + g.nz * fz) / gl;
        if (dot >= cosThreshold) { target = g; break; }
      }
      if (!target) {
        target = { nx: 0, ny: 0, nz: 0, members: [] };
        groups.push(target);
      }
      const w = faceAreas[f];
      target.nx += fx * w;
      target.ny += fy * w;
      target.nz += fz * w;
      target.members.push(c);
    }

    for (const g of groups) {
      const len = Math.hypot(g.nx, g.ny, g.nz);
      for (const c of g.members) {
        const f = (c / 3) | 0;
        if (len > 1e-12) {
          normals[c * 3] = g.nx / len;
          normals[c * 3 + 1] = g.ny / len;
          normals[c * 3 + 2] = g.nz / len;
        } else {
          normals[c * 3] = faceNormals[f * 3];
          normals[c * 3 + 1] = faceNormals[f * 3 + 1];
          normals[c * 3 + 2] = faceNormals[f * 3 + 2];
        }
      }
    }
  }

  return { normals, faceNormals, bounds: { minX, minY, minZ, maxX, maxY, maxZ } };
}

// ---------------------------------------------------------------------------
// Ruido: value noise con semilla fija
// ---------------------------------------------------------------------------

/*
 * Value noise de 3D con interpolacion quintica y dos octavas. Hash entero puro,
 * sin Math.random, para que el resultado sea reproducible bit a bit.
 */
function makeNoise(seed) {
  function hash(ix, iy, iz) {
    let h = seed ^ Math.imul(ix, 0x8d_a6_b3_43) ^ Math.imul(iy, 0xd8_16_3841) ^ Math.imul(iz, 0xcb_1a_b3_1f);
    h = Math.imul(h ^ (h >>> 15), 0x2c_1b_3c_6d);
    h = Math.imul(h ^ (h >>> 12), 0x29_7a_2d_39);
    h ^= h >>> 15;
    return (h >>> 0) / 4294967295;
  }

  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + (b - a) * t;

  function value(x, y, z) {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const fx = fade(x - ix), fy = fade(y - iy), fz = fade(z - iz);

    const c000 = hash(ix, iy, iz), c100 = hash(ix + 1, iy, iz);
    const c010 = hash(ix, iy + 1, iz), c110 = hash(ix + 1, iy + 1, iz);
    const c001 = hash(ix, iy, iz + 1), c101 = hash(ix + 1, iy, iz + 1);
    const c011 = hash(ix, iy + 1, iz + 1), c111 = hash(ix + 1, iy + 1, iz + 1);

    return lerp(
      lerp(lerp(c000, c100, fx), lerp(c010, c110, fx), fy),
      lerp(lerp(c001, c101, fx), lerp(c011, c111, fx), fy),
      fz,
    );
  }

  return function fbm(x, y, z) {
    return value(x, y, z) * 0.65 + value(x * 2.7, y * 2.7, z * 2.7) * 0.35;
  };
}

// ---------------------------------------------------------------------------
// Entorno procedural de estudio
// ---------------------------------------------------------------------------

/*
 * Esto es lo que arregla el defecto principal.
 *
 * Un metal con Metallic 0.95 no tiene color difuso: lo que se ve es
 * literalmente la imagen del entorno reflejada. Con un color plano de fondo
 * mas tres luces puntuales, el metal solo puede devolver tres manchas
 * especulares sobre gris uniforme, y eso es exactamente lo que el ojo lee como
 * "render sintetico".
 *
 * La solucion es que sampleEnvironment(direccion) devuelva radiancia que varie
 * de forma continua y rica con la direccion:
 *   - gradiente vertical: techo claro -> horizonte medio -> suelo oscuro, que
 *     es lo que da el contraste arriba/abajo sobre una superficie curva;
 *   - tres paneles rectangulares brillantes (softboxes) en posiciones
 *     distintas, con bordes suavizados, que son los reflejos que dan la
 *     lectura de estudio;
 *   - una banda de horizonte ligeramente mas oscura, que separa la zona que
 *     refleja techo de la que refleja suelo y produce la linea de transicion
 *     caracteristica del metal pulido;
 *   - una leve variacion azimutal, para que no haya simetria perfecta.
 */

const SOFTBOXES = [
  // dir: centro del panel. w/h: semianchos angulares. i: intensidad. c: tinte.
  // Paneles anchos: un softbox real es grande respecto a la pieza, y por eso
  // su reflejo es una banda con gradiente, no un punto especular.
  { dir: normalize([0.52, -0.66, 0.54]), w: 0.58, h: 0.30, i: 6.4, c: [1.0, 0.985, 0.955] }, // key, calida
  { dir: normalize([-0.74, -0.30, 0.24]), w: 0.40, h: 0.62, i: 3.0, c: [0.93, 0.96, 1.0] }, // fill, fria
  { dir: normalize([-0.10, 0.80, 0.48]), w: 0.70, h: 0.20, i: 4.0, c: [1.0, 1.0, 1.0] }, // rim/kicker
  // Rebote inferior: panel muy ancho y debil dirigido desde delante-abajo. No
  // se lee como reflejo propio, pero levanta las superficies interiores (bore
  // del tubo, pared interna del cuello), que de otro modo solo pueden reflejar
  // el suelo oscuro y salen como una mancha negra plana. En un estudio real
  // esto es la mesa o el reflector inferior.
  { dir: normalize([0.18, -0.42, -0.89]), w: 1.5, h: 1.2, i: 0.85, c: [0.96, 0.97, 1.0] },
  // Relleno bajo-lateral. Es el panel que resuelve las piezas conicas.
  //
  // Una reduccion o un stub end tienen la pared inclinada hacia ABAJO: su
  // vector de reflexion cae en el hemisferio inferior, donde antes solo habia
  // gradiente de suelo (radiancia ~0.45) y ningun emisor. Resultado: la pieza
  // se quedaba en gris medio y su maximo especular no llegaba a 230, o sea que
  // literalmente no tenia reflejo, que es lo que la hacia parecer plana.
  //
  // A diferencia del rebote de mesa de arriba, este esta desplazado al lado
  // (componente X e Y marcadas) y es bastante mas intenso, de modo que produce
  // un reflejo con forma sobre la pared del cono en vez de una subida uniforme.
  // Es el reflector lateral bajo de una mesa de bodegon: la luz que rebota del
  // suelo y entra por el lado de la pieza.
  { dir: normalize([0.42, -0.55, -0.72]), w: 0.95, h: 0.75, i: 2.3, c: [0.97, 0.975, 1.0] },
];

function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function sampleEnvironment(dx, dy, dz, out) {
  // --- gradiente vertical -------------------------------------------------
  // dz = +1 cenit, -1 nadir.
  //
  // Los niveles son ALTOS a proposito. Un metal casi puro no tiene difusa: su
  // luminancia es literalmente la radiancia del entorno filtrada por Fresnel.
  // Con un entorno oscuro la pieza sale casi negra y solo se ve el highlight,
  // que es justo el aspecto sintetico que hay que evitar. Un estudio real es
  // mayoritariamente claro: techo grande y luminoso, paredes medias, suelo
  // oscuro pero nunca negro.
  const up = dz * 0.5 + 0.5;

  let r, g, b;
  if (dz >= 0) {
    // horizonte (0.30) -> techo (1.45)
    const t = Math.pow(up * 2 - 1, 0.85);
    r = 0.30 + t * 1.15;
    g = 0.304 + t * 1.165;
    b = 0.313 + t * 1.19;
  } else {
    // horizonte (0.30) -> suelo (0.185). El suelo es la MESA del estudio, y una
    // mesa real devuelve una fraccion apreciable de la luz que recibe: no es un
    // agujero negro. Antes caia a 0.055, practicamente nada, y eso condenaba a
    // cualquier superficie cuya normal mirase hacia abajo (la pared de una
    // reduccion, el faldon de un stub end) a reflejar oscuridad: salian en gris
    // medio plano y sin especular.
    //
    // El exponente subio de 0.75 a 1.15. Ese cambio es lo que evita convertir
    // esto en niebla gris: con 0.75 la caida era muy rapida al salir del
    // horizonte y luego casi constante, asi que subir el suelo habria levantado
    // todo el hemisferio por igual. Con 1.15 la transicion horizonte->suelo es
    // progresiva, o sea que sigue habiendo GRADIENTE hacia abajo (la lectura de
    // metal), simplemente centrado en un nivel mas alto.
    //
    // El techo NO se toca: las piezas que ya estaban bien (flange-wn, gasket-sw,
    // spectacle-blind) reflejan el hemisferio superior y deben quedar igual.
    const t = Math.pow(1 - up * 2, 1.15);
    r = 0.30 - t * 0.125;
    g = 0.304 - t * 0.126;
    b = 0.313 - t * 0.129;
  }

  // --- banda de horizonte -------------------------------------------------
  // Ligeramente mas oscura que el gradiente base y bastante estrecha: es la
  // que crea la transicion nitida que delata al metal.
  // Se rebajo de 0.34 a 0.30 al subir el suelo: con un hemisferio inferior mas
  // claro, una banda demasiado marcada partia la pieza en dos con una linea
  // dura en lugar de una transicion.
  const horiz = Math.exp(-(dz * dz) / 0.012);
  const dim = 1 - 0.30 * horiz;
  r *= dim; g *= dim; b *= dim;

  // --- variacion azimutal -------------------------------------------------
  // Rompe la simetria de revolucion para que dos zonas de la pieza que miran a
  // lados opuestos no reflejen exactamente lo mismo.
  // La modulacion crece con la elevacion: un techo de estudio no es una cupula
  // uniforme, tiene estructura (paneles, vigas, zonas de caida) y esa
  // estructura es lo que da textura al reflejo en las caras que miran arriba.
  // Sin esto las caras superiores salen planas y lavadas.
  const az = Math.atan2(dy, dx);
  const swirl =
    1 +
    (0.20 * Math.sin(az * 2.0 + 0.7) + 0.10 * Math.sin(az * 3.0 - 1.9)) *
      (0.55 + 0.45 * Math.abs(dz));
  r *= swirl; g *= swirl; b *= swirl;

  // --- softboxes ----------------------------------------------------------
  // Paneles rectangulares en espacio angular: se proyecta la direccion sobre la
  // base tangente del panel y se aplica una caida suave en cada eje. Da un
  // reflejo con forma y borde blando, no un punto.
  for (const box of SOFTBOXES) {
    const d = box.dir;
    const cosA = dx * d[0] + dy * d[1] + dz * d[2];
    if (cosA <= 0) continue;

    // base tangente estable
    let ux, uy, uz;
    if (Math.abs(d[2]) < 0.9) { ux = -d[1]; uy = d[0]; uz = 0; }
    else { ux = 0; uy = -d[2]; uz = d[1]; }
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul; uy /= ul; uz /= ul;
    const vx = d[1] * uz - d[2] * uy;
    const vy = d[2] * ux - d[0] * uz;
    const vz = d[0] * uy - d[1] * ux;

    const su = (dx * ux + dy * uy + dz * uz) / box.w;
    const sv = (dx * vx + dy * vy + dz * vz) / box.h;

    // Perfil de caja con bordes blandos: 1 dentro, cae rapido fuera.
    const fu = 1 / (1 + Math.pow(Math.abs(su), 8));
    const fv = 1 / (1 + Math.pow(Math.abs(sv), 8));
    const face = Math.max(0, cosA);
    const e = box.i * fu * fv * face * face;

    r += e * box.c[0];
    g += e * box.c[1];
    b += e * box.c[2];
  }

  out[0] = r; out[1] = g; out[2] = b;
  return out;
}

/*
 * Prefiltrado del entorno por niveles de rugosidad.
 *
 * Muestrear el entorno con N muestras jitteadas por pixel es correcto pero
 * caro. En su lugar se precalcula una piramide latitud/longitud del entorno y
 * se difumina progresivamente: cada nivel corresponde a una rugosidad, igual
 * que un mapa de reflexion prefiltrado. En shading basta con interpolar entre
 * los dos niveles que rodean la rugosidad del pixel.
 *
 * Se conserva ademas el entorno analitico sin filtrar para el nivel 0, de modo
 * que las zonas mas pulidas mantengan el reflejo nitido de los softboxes sin
 * que la resolucion de la piramide lo emborrone.
 */
function buildEnvMips(levels) {
  const W = 256, H = 128;
  const base = new Float32Array(W * H * 3);
  const tmp = [0, 0, 0];

  for (let y = 0; y < H; y++) {
    const theta = ((y + 0.5) / H) * Math.PI; // 0 = cenit
    const sz = Math.cos(theta);
    const st = Math.sin(theta);
    for (let x = 0; x < W; x++) {
      const phi = ((x + 0.5) / W) * Math.PI * 2 - Math.PI;
      sampleEnvironment(st * Math.cos(phi), st * Math.sin(phi), sz, tmp);
      const o = (y * W + x) * 3;
      base[o] = tmp[0]; base[o + 1] = tmp[1]; base[o + 2] = tmp[2];
    }
  }

  const mips = [{ W, H, data: base, roughness: 0 }];
  let cur = base;

  for (let l = 1; l < levels; l++) {
    const rough = l / (levels - 1);
    // El radio de blur crece con el cuadrado de la rugosidad, que aproxima
    // razonablemente el ensanchamiento del lobulo GGX.
    const radius = Math.max(1, Math.round(rough * rough * 26));
    cur = blurLatLong(cur, W, H, radius);
    mips.push({ W, H, data: cur, roughness: rough });
  }

  return mips;
}

/** Blur separable con envoltura horizontal y espejo vertical. */
function blurLatLong(src, W, H, radius) {
  const tmp = new Float32Array(W * H * 3);
  const dst = new Float32Array(W * H * 3);
  const n = radius * 2 + 1;

  // Paso horizontal: envoltura, porque la longitud es ciclica.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0;
      for (let k = -radius; k <= radius; k++) {
        const sx = ((x + k) % W + W) % W;
        const o = (y * W + sx) * 3;
        r += src[o]; g += src[o + 1]; b += src[o + 2];
      }
      const o = (y * W + x) * 3;
      tmp[o] = r / n; tmp[o + 1] = g / n; tmp[o + 2] = b / n;
    }
  }

  // Paso vertical sobre el resultado horizontal: espejo en los polos, porque
  // la latitud no es ciclica.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0;
      for (let k = -radius; k <= radius; k++) {
        let sy = y + k;
        if (sy < 0) sy = -sy - 1;
        if (sy >= H) sy = 2 * H - sy - 1;
        sy = Math.max(0, Math.min(H - 1, sy));
        const o = (sy * W + x) * 3;
        r += tmp[o]; g += tmp[o + 1]; b += tmp[o + 2];
      }
      const o = (y * W + x) * 3;
      dst[o] = r / n; dst[o + 1] = g / n; dst[o + 2] = b / n;
    }
  }

  return dst;
}

function sampleMip(mip, dx, dy, dz, out) {
  const { W, H, data } = mip;
  const theta = Math.acos(Math.max(-1, Math.min(1, dz)));
  const phi = Math.atan2(dy, dx);

  const fy = (theta / Math.PI) * H - 0.5;
  const fx = ((phi + Math.PI) / (Math.PI * 2)) * W - 0.5;

  const y0 = Math.floor(fy), x0 = Math.floor(fx);
  const ty = fy - y0, tx = fx - x0;

  const cy0 = Math.max(0, Math.min(H - 1, y0));
  const cy1 = Math.max(0, Math.min(H - 1, y0 + 1));
  const cx0 = ((x0 % W) + W) % W;
  const cx1 = ((x0 + 1) % W + W) % W;

  const o00 = (cy0 * W + cx0) * 3, o01 = (cy0 * W + cx1) * 3;
  const o10 = (cy1 * W + cx0) * 3, o11 = (cy1 * W + cx1) * 3;

  for (let c = 0; c < 3; c++) {
    const a = data[o00 + c] + (data[o01 + c] - data[o00 + c]) * tx;
    const b = data[o10 + c] + (data[o11 + c] - data[o10 + c]) * tx;
    out[c] = a + (b - a) * ty;
  }
  return out;
}

/**
 * Radiancia reflejada para una direccion y una rugosidad. Mezcla el entorno
 * analitico (nitido) con los niveles prefiltrados segun la rugosidad, mas unas
 * pocas muestras jitteadas deterministas que rompen el banding del prefiltrado.
 */
function prefilteredEnv(mips, dx, dy, dz, roughness, out) {
  const levels = mips.length;
  const f = Math.max(0, Math.min(1, roughness)) * (levels - 1);
  const l0 = Math.floor(f);
  const l1 = Math.min(levels - 1, l0 + 1);
  const t = f - l0;

  const a = [0, 0, 0], b = [0, 0, 0];
  sampleMip(mips[l0], dx, dy, dz, a);
  sampleMip(mips[l1], dx, dy, dz, b);

  // Con rugosidad muy baja la piramide (256x128) no resuelve el borde del
  // softbox, asi que se inyecta el entorno analitico exacto.
  const sharpW = Math.max(0, 1 - roughness * 5);
  if (sharpW > 0) {
    const s = [0, 0, 0];
    sampleEnvironment(dx, dy, dz, s);
    for (let c = 0; c < 3; c++) {
      const filtered = a[c] + (b[c] - a[c]) * t;
      out[c] = filtered + (s[c] - filtered) * sharpW;
    }
    return out;
  }

  for (let c = 0; c < 3; c++) out[c] = a[c] + (b[c] - a[c]) * t;
  return out;
}

// ---------------------------------------------------------------------------
// BRDF: GGX / Trowbridge-Reitz, Schlick, Smith
// ---------------------------------------------------------------------------

/*
 * Metal puro: sin componente difusa. F0 es el color base del acero
 * (0.56, 0.57, 0.58 lineal). Lo unico que aporta color es el entorno filtrado
 * por la Fresnel, que es fisicamente lo correcto para un conductor.
 *
 * Se usa la aproximacion split-sum de Karis: la integral se separa en la
 * radiancia prefiltrada por el lobulo y un termino DFG que solo depende de
 * NdotV y la rugosidad, y que aqui se evalua con la aproximacion analitica de
 * Lazarov en lugar de una LUT.
 */
function envDFG(NdotV, roughness, out) {
  // Karis / Lazarov, "Physically Based Shading in Mobile"
  const c0 = [-1, -0.0275, -0.572, 0.022];
  const c1 = [1, 0.0425, 1.04, -0.04];
  const rx = roughness * c0[0] + c1[0];
  const ry = roughness * c0[1] + c1[1];
  const rz = roughness * c0[2] + c1[2];
  const rw = roughness * c0[3] + c1[3];
  const a004 = Math.min(rx * rx, Math.pow(2, -9.28 * NdotV)) * rx + ry;
  out[0] = a004 * -1.04 + rz;
  out[1] = a004 * 1.04 + rw;
  return out;
}

/** GGX especular directo, para el highlight nitido de los softboxes. */
function specularGGX(N, V, L, roughness, F0, out) {
  const hx = V[0] + L[0], hy = V[1] + L[1], hz = V[2] + L[2];
  const hl = Math.hypot(hx, hy, hz) || 1;
  const Hx = hx / hl, Hy = hy / hl, Hz = hz / hl;

  const NdotL = Math.max(0, N[0] * L[0] + N[1] * L[1] + N[2] * L[2]);
  const NdotV = Math.max(1e-4, N[0] * V[0] + N[1] * V[1] + N[2] * V[2]);
  const NdotH = Math.max(0, N[0] * Hx + N[1] * Hy + N[2] * Hz);
  const VdotH = Math.max(0, V[0] * Hx + V[1] * Hy + V[2] * Hz);

  if (NdotL <= 0) { out[0] = out[1] = out[2] = 0; return out; }

  const a = roughness * roughness;
  const a2 = a * a;

  // D: Trowbridge-Reitz
  const denom = NdotH * NdotH * (a2 - 1) + 1;
  const D = a2 / (Math.PI * denom * denom);

  // G: Smith, altura correlacionada
  const k = a / 2;
  const gv = NdotV / (NdotV * (1 - k) + k);
  const gl = NdotL / (NdotL * (1 - k) + k);
  const G = gv * gl;

  // F: Schlick
  const fc = Math.pow(1 - VdotH, 5);
  const spec = (D * G) / (4 * NdotV * NdotL + 1e-6);

  for (let c = 0; c < 3; c++) {
    const F = F0[c] + (1 - F0[c]) * fc;
    out[c] = spec * F * NdotL;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Camara
// ---------------------------------------------------------------------------

/*
 * Ejes principales de la pieza (PCA sobre la nube de vertices).
 *
 * Los STL del set no comparten convencion de orientacion: unos tienen el eje
 * del tubo en Z, otros en X, y las piezas planas (gasket, spectacle blind, y la
 * lamina de return_180_lr) tienen su plano en orientaciones distintas. Con una
 * direccion de camara fija en coordenadas de mundo, varias piezas quedan vistas
 * de canto y se leen como un aro o un disco, que es un fallo de catalogo.
 *
 * La solucion es definir la vista respecto a los ejes propios de cada pieza: e0
 * es la direccion de maxima extension (el eje del tubo, la diagonal del codo),
 * e2 la de minima (la normal del disco en una pieza plana). Situando la camara
 * en una combinacion de los tres se garantiza que ninguna pieza se vea por su
 * dimension degenerada.
 */
function principalAxes(positions, count) {
  const n = count * 3;
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) {
    cx += positions[i * 3];
    cy += positions[i * 3 + 1];
    cz += positions[i * 3 + 2];
  }
  cx /= n; cy /= n; cz /= n;

  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (let i = 0; i < n; i++) {
    const dx = positions[i * 3] - cx;
    const dy = positions[i * 3 + 1] - cy;
    const dz = positions[i * 3 + 2] - cz;
    xx += dx * dx; xy += dx * dy; xz += dx * dz;
    yy += dy * dy; yz += dy * dz; zz += dz * dz;
  }
  xx /= n; xy /= n; xz /= n; yy /= n; yz /= n; zz /= n;

  // Eigenvectores por iteracion de potencia con deflacion. La matriz es 3x3 y
  // simetrica, y solo se necesita precision moderada, asi que basta.
  const C = [[xx, xy, xz], [xy, yy, yz], [xz, yz, zz]];

  const mul = (M, v) => [
    M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
    M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
    M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2],
  ];

  function dominant(M, seed) {
    let v = normalize(seed);
    for (let it = 0; it < 64; it++) {
      const w = mul(M, v);
      const len = Math.hypot(w[0], w[1], w[2]);
      if (len < 1e-20) return { vec: v, val: 0 };
      v = [w[0] / len, w[1] / len, w[2] / len];
    }
    const w = mul(M, v);
    return { vec: v, val: v[0] * w[0] + v[1] * w[1] + v[2] * w[2] };
  }

  // Semillas fijas (no aleatorias) para que el resultado sea determinista.
  const a = dominant(C, [0.7071, 0.5, 0.5]);

  // Deflacion: se resta la componente ya extraida.
  const C2 = C.map((row, i) => row.map((val, j) => val - a.val * a.vec[i] * a.vec[j]));
  let seed2 = [0.3, -0.8, 0.52];
  // La semilla debe tener componente fuera del primer eje.
  const d = seed2[0] * a.vec[0] + seed2[1] * a.vec[1] + seed2[2] * a.vec[2];
  seed2 = normalize([seed2[0] - d * a.vec[0], seed2[1] - d * a.vec[1], seed2[2] - d * a.vec[2]]);
  const b = dominant(C2, seed2);

  // El tercero es el producto vectorial: garantiza base ortonormal dextrogira.
  const c = normalize([
    a.vec[1] * b.vec[2] - a.vec[2] * b.vec[1],
    a.vec[2] * b.vec[0] - a.vec[0] * b.vec[2],
    a.vec[0] * b.vec[1] - a.vec[1] * b.vec[0],
  ]);

  // Extension real a lo largo de cada eje (mas robusto que el autovalor para
  // decidir si una pieza es plana).
  const ext = [0, 0, 0];
  const axes = [a.vec, b.vec, c];
  for (let k = 0; k < 3; k++) {
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < n; i++) {
      const dx = positions[i * 3] - cx;
      const dy = positions[i * 3 + 1] - cy;
      const dz = positions[i * 3 + 2] - cz;
      const p = dx * axes[k][0] + dy * axes[k][1] + dz * axes[k][2];
      if (p < mn) mn = p;
      if (p > mx) mx = p;
    }
    ext[k] = mx - mn;
  }

  // Los autovalores ordenan por varianza, pero lo que interesa aqui es la
  // EXTENSION real, que para una pieza hueca no coincide (un tubo corto y
  // ancho tiene mas varianza en el diametro que en su longitud). Se reordena
  // por extension descendente para que e0 sea siempre la dimension mayor.
  const order = [0, 1, 2].sort((a, b) => ext[b] - ext[a]);
  const sortedAxes = order.map((i) => axes[i]);
  const sortedExt = order.map((i) => ext[i]);

  // Se rehace la ortonormalidad dextrogira tras el reordenado.
  sortedAxes[2] = normalize([
    sortedAxes[0][1] * sortedAxes[1][2] - sortedAxes[0][2] * sortedAxes[1][1],
    sortedAxes[0][2] * sortedAxes[1][0] - sortedAxes[0][0] * sortedAxes[1][2],
    sortedAxes[0][0] * sortedAxes[1][1] - sortedAxes[0][1] * sortedAxes[1][0],
  ]);

  return { axes: sortedAxes, ext: sortedExt, centroid: [cx, cy, cz] };
}

/*
 * Vista tres cuartos elevada, la convencion de catalogo: se ve la forma y las
 * dos caras de conexion.
 *
 * La direccion de vista se expresa en la base propia de la pieza (ver
 * principalAxes), no en coordenadas de mundo, para que ninguna pieza quede
 * vista por su dimension degenerada. Para una pieza plana (disco, brida ciega)
 * se inclina mas hacia su normal, de modo que se vea la cara y a la vez el
 * canto, en lugar de un rectangulo de canto o un circulo perfectamente frontal.
 *
 * El encuadre se calcula proyectando los 8 vertices del bounding box y
 * ajustando la distancia hasta que la pieza ocupa `margin` del frame. Como se
 * hace por proyeccion real y no por radio, todas las piezas salen con un tamano
 * visual coherente independientemente de su forma.
 */
function buildCamera(bounds, cfg, pca) {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;

  // FOV a partir de la focal equivalente en full frame
  const fov = 2 * Math.atan(cfg.sensorMM / (2 * cfg.focalMM));
  const tanHalf = Math.tan(fov / 2);

  const [e0, e1, e2] = pca.axes;
  const [x0, x1, x2] = pca.ext;

  // Aplanamiento: 0 = pieza volumetrica, 1 = lamina.
  const flat = 1 - Math.min(1, x2 / Math.max(x0 * 0.35, 1e-6));
  // Pieza plana de verdad (disco, ciego, junta): su menor extension es una
  // fraccion minima de la mayor. En estas SI interesa mirar hacia la normal.
  const isFlat = x2 < x0 * 0.18;

  // Coeficientes de la direccion de vista en la base propia.
  //
  // Para una pieza volumetrica la componente sobre el eje mayor se mantiene
  // BAJA: mirar a lo largo del eje del tubo es justo lo que produce la vista
  // "de morro" en la que un codo se lee como un aro. Lo que se quiere es verlo
  // de lado, con algo de escorzo, que es la vista de catalogo.
  //
  // Para una pieza plana se invierte el criterio: hay que ganar componente
  // sobre e2 (la normal del disco) para que la cara sea visible, porque si no
  // el disco se ve de canto y se lee como una barra.
  const cA = 0.30 + 0.10 * flat; // eje mayor: escorzo, nunca vista axial
  const cB = 0.62 - 0.25 * flat; // eje intermedio: la direccion dominante
  const cC = 0.48 + 0.55 * flat; // eje menor / normal en piezas planas

  // Direccion desde la pieza hacia la camara, en mundo.
  let toEye = normalize([
    e0[0] * cA + e1[0] * cB + e2[0] * cC,
    e0[1] * cA + e1[1] * cB + e2[1] * cC,
    e0[2] * cA + e1[2] * cB + e2[2] * cC,
  ]);

  // Vista de perfil para piezas planares (codos, curvas, laterales).
  //
  // Un codo es una pieza esencialmente PLANAR: su linea de centros vive en un
  // plano. La vista de catalogo de un codo es de frente a ese plano, porque es
  // la unica en la que se ve el angulo (que es la caracteristica que define la
  // pieza) y las dos bocas.
  //
  // El plano lo da e2 cuando la extension sobre e2 es sensiblemente menor que
  // sobre e0 y e1: entonces e2 es la normal del plano del codo. Mirar a lo
  // largo de e2 (con algo de escorzo) da exactamente la vista buena; cualquier
  // otra cosa produce la vista "dentro de la boca".
  //
  // Se excluyen las piezas planas de verdad (discos), que ya se tratan aparte,
  // y las de revolucion pura, donde e1 y e2 son intercambiables por simetria y
  // la nocion de plano no significa nada.
  // El plano debe ser claramente dominante respecto a AMBOS ejes del plano: si
  // solo lo es respecto a e1, la pieza es un cilindro corto (una tapa, un
  // stub end) y no tiene plano de codo que mostrar.
  const planarRatio = x2 / Math.max(x1, 1e-6);
  const planarRatio0 = x2 / Math.max(x0, 1e-6);
  const revolution = Math.abs(x1 - x2) < Math.max(x1, x2) * 0.12;
  if (!isFlat && !revolution && planarRatio < 0.72 && planarRatio0 < 0.55) {
    // Mirar mayoritariamente a lo largo de la normal del plano, inclinando algo
    // sobre los ejes del plano para que no sea una vista ortogonal plana.
    toEye = normalize([
      e2[0] * 0.86 + e0[0] * 0.20 + e1[0] * 0.34,
      e2[1] * 0.86 + e0[1] * 0.20 + e1[1] * 0.34,
      e2[2] * 0.86 + e0[2] * 0.20 + e1[2] * 0.34,
    ]);
  }

  // Garantia dura contra la vista axial.
  //
  // En una pieza de revolucion (codo, tubo, reduccion) mirar cerca del eje
  // produce la vista "de morro": la pieza se proyecta como un anillo y pierde
  // toda la lectura de forma. El PCA por si solo no lo evita, porque en un codo
  // el eje principal no coincide con el eje de ninguna de las dos bocas.
  //
  // Se impone por tanto un angulo minimo entre la direccion de vista y el eje
  // mayor: si la camara cae dentro de ese cono, se empuja hacia fuera sobre el
  // plano que forman el eje y la propia direccion de vista.
  if (!isFlat) {
    const MIN_COS = Math.cos((90 - 32) * Math.PI / 180); // >= 32 grados del eje
    let along = toEye[0] * e0[0] + toEye[1] * e0[1] + toEye[2] * e0[2];
    if (Math.abs(along) > MIN_COS) {
      const sign = along >= 0 ? 1 : -1;
      // Componente perpendicular al eje mayor.
      let perp = [
        toEye[0] - along * e0[0],
        toEye[1] - along * e0[1],
        toEye[2] - along * e0[2],
      ];
      if (Math.hypot(perp[0], perp[1], perp[2]) < 1e-6) perp = e1.slice();
      perp = normalize(perp);
      const keep = MIN_COS * sign;
      const rest = Math.sqrt(Math.max(0, 1 - MIN_COS * MIN_COS));
      toEye = normalize([
        e0[0] * keep + perp[0] * rest,
        e0[1] * keep + perp[1] * rest,
        e0[2] * keep + perp[2] * rest,
      ]);
    }
  }

  // La camara siempre debe quedar por encima del horizonte: es la convencion de
  // catalogo (vista elevada) y ademas coloca la pieza bajo los softboxes.
  if (toEye[2] < 0) toEye = [-toEye[0], -toEye[1], -toEye[2]];
  const targetZ = Math.sin((cfg.pitchDeg * Math.PI) / 180);
  if (toEye[2] < targetZ) {
    toEye = normalize([toEye[0], toEye[1], 0]);
    const h = Math.sqrt(Math.max(0, 1 - targetZ * targetZ));
    toEye = normalize([toEye[0] * h, toEye[1] * h, targetZ]);
  }

  const fwd = [-toEye[0], -toEye[1], -toEye[2]];

  const worldUp = [0, 0, 1];
  let right = [
    fwd[1] * worldUp[2] - fwd[2] * worldUp[1],
    fwd[2] * worldUp[0] - fwd[0] * worldUp[2],
    fwd[0] * worldUp[1] - fwd[1] * worldUp[0],
  ];
  if (Math.hypot(right[0], right[1], right[2]) < 1e-6) right = [1, 0, 0];
  right = normalize(right);
  const up = normalize([
    right[1] * fwd[2] - right[2] * fwd[1],
    right[2] * fwd[0] - right[0] * fwd[2],
    right[0] * fwd[1] - right[1] * fwd[0],
  ]);

  const corners = [];
  for (const x of [bounds.minX, bounds.maxX])
    for (const y of [bounds.minY, bounds.maxY])
      for (const z of [bounds.minZ, bounds.maxZ]) corners.push([x - cx, y - cy, z - cz]);

  // Distancia inicial holgada, luego se ajusta iterando: se proyecta el bbox y
  // se corrige la distancia por la razon entre extension obtenida y deseada.
  const radius = Math.max(...corners.map((c) => Math.hypot(c[0], c[1], c[2])));
  let dist = radius / tanHalf * 1.6;

  let extent = 1;
  for (let iter = 0; iter < 24; iter++) {
    const eye = [cx - fwd[0] * dist, cy - fwd[1] * dist, cz - fwd[2] * dist];
    let maxAbs = 0;
    let ok = true;
    for (const c of corners) {
      const wx = c[0] + cx - eye[0], wy = c[1] + cy - eye[1], wz = c[2] + cz - eye[2];
      const vz = wx * fwd[0] + wy * fwd[1] + wz * fwd[2];
      if (vz <= 1e-4) { ok = false; break; }
      const vx = wx * right[0] + wy * right[1] + wz * right[2];
      const vy = wx * up[0] + wy * up[1] + wz * up[2];
      maxAbs = Math.max(maxAbs, Math.abs(vx / (vz * tanHalf)), Math.abs(vy / (vz * tanHalf)));
    }
    if (!ok) { dist *= 1.4; continue; }
    extent = maxAbs;
    const err = maxAbs / cfg.margin;
    if (Math.abs(err - 1) < 0.002) break;
    dist *= err > 1 ? Math.min(err, 1.5) : Math.max(err, 0.7);
  }

  const eye = [cx - fwd[0] * dist, cy - fwd[1] * dist, cz - fwd[2] * dist];
  return { eye, fwd, right, up, tanHalf, center: [cx, cy, cz], dist, radius };
}

// ---------------------------------------------------------------------------
// Rasterizado
// ---------------------------------------------------------------------------

/*
 * Z-buffer clasico con backface culling y coordenadas baricentricas con
 * correccion de perspectiva. Se rellenan G-buffers (normal, profundidad,
 * posicion de objeto) y el shading se hace en un pase diferido, que permite
 * aplicar despues SSAO y realce de arista leyendo vecindad.
 */
function rasterize(mesh, cam, W, H) {
  const { positions, normals, triCount } = mesh;

  const depth = new Float32Array(W * H).fill(Infinity);
  const gNormal = new Float32Array(W * H * 3);
  const gObject = new Float32Array(W * H * 3);
  const gView = new Float32Array(W * H * 3);
  const coverage = new Uint8Array(W * H);

  // Proyeccion de todos los vertices a espacio de pantalla
  const sx = new Float32Array(triCount * 3);
  const sy = new Float32Array(triCount * 3);
  const sw = new Float32Array(triCount * 3); // 1/z de vista
  const vzArr = new Float32Array(triCount * 3);

  const { eye, fwd, right, up, tanHalf } = cam;
  const halfW = W / 2, halfH = H / 2;

  for (let i = 0; i < triCount * 3; i++) {
    const o = i * 3;
    const wx = positions[o] - eye[0];
    const wy = positions[o + 1] - eye[1];
    const wz = positions[o + 2] - eye[2];

    const vz = wx * fwd[0] + wy * fwd[1] + wz * fwd[2];
    const vx = wx * right[0] + wy * right[1] + wz * right[2];
    const vy = wx * up[0] + wy * up[1] + wz * up[2];

    vzArr[i] = vz;
    const invz = 1 / Math.max(vz, 1e-5);
    sx[i] = halfW + (vx * invz / tanHalf) * halfW;
    sy[i] = halfH - (vy * invz / tanHalf) * halfH;
    sw[i] = invz;
  }

  for (let t = 0; t < triCount; t++) {
    const i0 = t * 3, i1 = t * 3 + 1, i2 = t * 3 + 2;
    if (vzArr[i0] <= 1e-5 || vzArr[i1] <= 1e-5 || vzArr[i2] <= 1e-5) continue;

    const x0 = sx[i0], y0 = sy[i0];
    const x1 = sx[i1], y1 = sy[i1];
    const x2 = sx[i2], y2 = sy[i2];

    // Area con signo en pantalla. Negativa => cara trasera (culling).
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (area >= -1e-9) continue; // el eje Y esta invertido, las frontales son negativas
    const invArea = 1 / area;

    let minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
    let maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
    let minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
    let maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
    if (minX > maxX || minY > maxY) continue;

    for (let py = minY; py <= maxY; py++) {
      const cy = py + 0.5;
      for (let px = minX; px <= maxX; px++) {
        const cxp = px + 0.5;

        let w0 = ((x1 - cxp) * (y2 - cy) - (x2 - cxp) * (y1 - cy)) * invArea;
        let w1 = ((x2 - cxp) * (y0 - cy) - (x0 - cxp) * (y2 - cy)) * invArea;
        let w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;

        // Correccion de perspectiva
        const iw = w0 * sw[i0] + w1 * sw[i1] + w2 * sw[i2];
        const z = 1 / iw;

        const idx = py * W + px;
        if (z >= depth[idx]) continue;

        const p0 = (w0 * sw[i0]) / iw;
        const p1 = (w1 * sw[i1]) / iw;
        const p2 = (w2 * sw[i2]) / iw;

        depth[idx] = z;
        coverage[idx] = 1;

        const n0 = i0 * 3, n1 = i1 * 3, n2 = i2 * 3;
        let nx = normals[n0] * p0 + normals[n1] * p1 + normals[n2] * p2;
        let ny = normals[n0 + 1] * p0 + normals[n1 + 1] * p1 + normals[n2 + 1] * p2;
        let nz = normals[n0 + 2] * p0 + normals[n1 + 2] * p1 + normals[n2 + 2] * p2;
        const nl = Math.hypot(nx, ny, nz) || 1;

        const o = idx * 3;
        gNormal[o] = nx / nl; gNormal[o + 1] = ny / nl; gNormal[o + 2] = nz / nl;

        gObject[o] = positions[n0] * p0 + positions[n1] * p1 + positions[n2] * p2;
        gObject[o + 1] = positions[n0 + 1] * p0 + positions[n1 + 1] * p1 + positions[n2 + 1] * p2;
        gObject[o + 2] = positions[n0 + 2] * p0 + positions[n1 + 2] * p1 + positions[n2 + 2] * p2;

        // Posicion en espacio de vista, util para SSAO
        const vx = ((cxp - halfW) / halfW) * tanHalf * z;
        const vy = -((cy - halfH) / halfH) * tanHalf * z;
        gView[o] = vx; gView[o + 1] = vy; gView[o + 2] = z;
      }
    }
  }

  return { depth, gNormal, gObject, gView, coverage };
}

// ---------------------------------------------------------------------------
// SSAO
// ---------------------------------------------------------------------------

/*
 * Oclusion ambiental de contacto en espacio de pantalla, a partir del z-buffer
 * y las normales. Da peso y volumen a las zonas donde dos superficies se
 * encuentran (la union del outlet con el run del weldolet, la garganta de una
 * te, el hueco entre bridas). Deliberadamente sutil: si se pasa, ensucia.
 *
 * Kernel de direcciones fijo con offsets deterministas, sin aleatoriedad.
 */
function computeSSAO(gbuf, W, H, radiusPx, strength) {
  const { depth, gNormal, gView, coverage } = gbuf;
  const ao = new Float32Array(W * H).fill(1);

  const DIRS = 12;
  const STEPS = 4;
  const dirs = [];
  for (let i = 0; i < DIRS; i++) {
    const a = (i / DIRS) * Math.PI * 2 + 0.37; // offset fijo
    dirs.push([Math.cos(a), Math.sin(a)]);
  }

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (!coverage[idx]) continue;

      const z = depth[idx];
      const o = idx * 3;
      const px = gView[o], py = gView[o + 1], pz = gView[o + 2];
      const nx = gNormal[o], ny = gNormal[o + 1], nz = gNormal[o + 2];

      let occlusion = 0;
      let samples = 0;

      for (const [dx, dy] of dirs) {
        for (let s = 1; s <= STEPS; s++) {
          const r = (radiusPx * s) / STEPS;
          const qx = Math.round(x + dx * r);
          const qy = Math.round(y + dy * r);
          samples++;
          if (qx < 0 || qy < 0 || qx >= W || qy >= H) continue;
          const qidx = qy * W + qx;
          if (!coverage[qidx]) continue;

          const qo = qidx * 3;
          const vx = gView[qo] - px, vy = gView[qo + 1] - py, vz = gView[qo + 2] - pz;
          const dist = Math.hypot(vx, vy, vz);
          if (dist < 1e-6) continue;

          const cosine = (vx * nx + vy * ny + vz * nz) / dist;
          if (cosine <= 0.12) continue; // ignora coplanar y por detras

          // Atenuacion por distancia en espacio de vista: solo ocluye lo cercano
          const worldRadius = z * radiusPx * 0.004;
          const atten = 1 / (1 + Math.pow(dist / Math.max(worldRadius, 1e-5), 2));
          occlusion += (cosine - 0.12) * atten;
        }
      }

      const v = 1 - (occlusion / Math.max(samples, 1)) * strength * 9;
      ao[idx] = Math.max(0, Math.min(1, v));
    }
  }

  return blurMasked(ao, coverage, W, H, 3);
}

/** Blur de caja que respeta la mascara de cobertura, para no sangrar al fondo. */
function blurMasked(src, mask, W, H, radius) {
  const tmp = new Float32Array(W * H);
  const dst = new Float32Array(W * H);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (!mask[idx]) { tmp[idx] = src[idx]; continue; }
      let sum = 0, n = 0;
      for (let k = -radius; k <= radius; k++) {
        const sxp = x + k;
        if (sxp < 0 || sxp >= W) continue;
        const q = y * W + sxp;
        if (!mask[q]) continue;
        sum += src[q]; n++;
      }
      tmp[idx] = n ? sum / n : src[idx];
    }
  }

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (!mask[idx]) { dst[idx] = tmp[idx]; continue; }
      let sum = 0, n = 0;
      for (let k = -radius; k <= radius; k++) {
        const syp = y + k;
        if (syp < 0 || syp >= H) continue;
        const q = syp * W + x;
        if (!mask[q]) continue;
        sum += tmp[q]; n++;
      }
      dst[idx] = n ? sum / n : tmp[idx];
    }
  }

  return dst;
}

// ---------------------------------------------------------------------------
// Realce de arista (sustituye al bevel)
// ---------------------------------------------------------------------------

/*
 * Toda pieza fabricada tiene un radio minimo en la arista, y ese radio produce
 * una linea especular brillante. Las aristas del STL son matematicamente
 * afiladas, asi que esa linea no existe y la pieza parece modelada, no
 * fabricada. Un bevel geometrico real no es viable aqui (habria que retesselar
 * la malla), asi que se aproxima en post.
 *
 * Se usan dos discontinuidades, con papeles distintos:
 *   - de NORMAL: es la que genera el realce. Localiza las aristas vivas reales
 *     (bisel de soldadura, cambio de cara, borde mecanizado), que es donde una
 *     pieza real tiene la linea de luz.
 *   - de PROFUNDIDAD: NO genera realce, solo lo SUPRIME. Un salto grande de z
 *     respecto a los vecinos significa que el pixel esta en la silueta contra
 *     el fondo, y realzar ahi produce un contorno blanco continuo alrededor de
 *     toda la pieza: el artefacto de dibujo animado que hay que evitar.
 */
function computeEdges(gbuf, W, H) {
  const { depth, gNormal, coverage } = gbuf;
  const edge = new Float32Array(W * H);

  const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];

  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const idx = y * W + x;
      if (!coverage[idx]) continue;

      const o = idx * 3;
      const nx = gNormal[o], ny = gNormal[o + 1], nz = gNormal[o + 2];
      const z = depth[idx];

      let maxNormalDiff = 0;
      let silhouette = 0;

      for (const [dx, dy] of NEIGHBOURS) {
        const q = (y + dy) * W + (x + dx);
        if (!coverage[q]) {
          silhouette = 1; // vecino en el fondo: estamos en el borde exterior
          continue;
        }
        const qo = q * 3;
        const dot = nx * gNormal[qo] + ny * gNormal[qo + 1] + nz * gNormal[qo + 2];
        maxNormalDiff = Math.max(maxNormalDiff, 1 - Math.max(-1, Math.min(1, dot)));

        // Salto de profundidad relativo: separa superficies que en pantalla son
        // vecinas pero en el espacio estan lejos (p.ej. el labio del bore
        // contra la pared interior que hay detras).
        const dz = Math.abs(depth[q] - z) / Math.max(z, 1e-5);
        if (dz * 220 > 0.55) silhouette = 1;
      }

      // Umbral alto: por debajo de ~35 grados entre normales vecinas es
      // curvatura suave, no arista. Solo se realza la arista viva de verdad.
      const nEdge = smoothstep(0.18, 0.62, maxNormalDiff);
      edge[idx] = silhouette ? nEdge * 0.15 : nEdge;
    }
  }

  // Un blur muy corto convierte el pico de 1 px en una linea de 1-2 px, que es
  // lo que se busca: una linea de luz, no un contorno grueso.
  return blurMasked(edge, coverage, W, H, 1);
}

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------
// Shading diferido
// ---------------------------------------------------------------------------

function shade(gbuf, cam, mips, noise, bounds, W, H, cfg) {
  const { gNormal, gObject, coverage, depth } = gbuf;
  const color = new Float32Array(W * H * 3);

  const ao = computeSSAO(gbuf, W, H, Math.max(6, Math.round(W * 0.018)), cfg.aoStrength);
  const edges = computeEdges(gbuf, W, H);

  const diag = Math.hypot(
    bounds.maxX - bounds.minX,
    bounds.maxY - bounds.minY,
    bounds.maxZ - bounds.minZ,
  ) || 1;
  const noiseScale = 7.5 / diag; // ~7 celdas de ruido a lo largo de la pieza

  const { eye } = cam;
  const F0 = cfg.f0;

  const env = [0, 0, 0];
  const dfg = [0, 0];
  const spec = [0, 0, 0];
  const N = [0, 0, 0], V = [0, 0, 0], L = [0, 0, 0];

  // Direcciones de los softboxes como luces directas, para el highlight nitido
  // que el prefiltrado no puede resolver por si solo.
  // Solo los TRES primeros paneles actuan ademas como luz directa. Los dos
  // ultimos (rebote de mesa y relleno bajo-lateral) se quedan solo en el
  // entorno: como luz directa produciran un highlight especular disparado desde
  // debajo de la pieza, que ninguna foto de estudio tiene y que delata el
  // render. Su funcion es aportar RADIANCIA al hemisferio inferior para que las
  // superficies que miran hacia abajo tengan algo que reflejar, no crear un
  // brillo propio.
  const keyLights = SOFTBOXES.slice(0, 3).map((b) => ({ dir: b.dir, i: b.i * 0.16, c: b.c }));

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (!coverage[idx]) continue;
      const o = idx * 3;

      N[0] = gNormal[o]; N[1] = gNormal[o + 1]; N[2] = gNormal[o + 2];

      // Vector a camara
      V[0] = eye[0] - gObject[o];
      V[1] = eye[1] - gObject[o + 1];
      V[2] = eye[2] - gObject[o + 2];
      const vl = Math.hypot(V[0], V[1], V[2]) || 1;
      V[0] /= vl; V[1] /= vl; V[2] /= vl;

      let NdotV = N[0] * V[0] + N[1] * V[1] + N[2] * V[2];
      // Normal interpolada puede quedar apuntando ligeramente hacia atras en
      // silueta; se corrige para no producir Fresnel negativo.
      if (NdotV < 0) {
        N[0] -= 2 * NdotV * V[0];
        N[1] -= 2 * NdotV * V[1];
        N[2] -= 2 * NdotV * V[2];
        NdotV = Math.abs(NdotV);
      }
      NdotV = Math.max(1e-3, NdotV);

      // --- rugosidad variable --------------------------------------------
      // Un accesorio real tiene zona mecanizada pulida, superficie forjada mate
      // y bisel de soldadura. El ruido lo aproxima sin parecer suciedad, porque
      // el rango es estrecho y la escala grande.
      const nz1 = noise(
        gObject[o] * noiseScale,
        gObject[o + 1] * noiseScale,
        gObject[o + 2] * noiseScale,
      );
      let roughness = cfg.roughMin + (cfg.roughMax - cfg.roughMin) * nz1;

      // Las aristas se leen como pulidas: el radio del bevel real es una
      // superficie mecanizada, mas brillante que la cara adyacente.
      roughness = Math.max(0.06, roughness - edges[idx] * 0.12);

      // --- reflexion de entorno (split-sum) -------------------------------
      const RdotN = 2 * NdotV;
      const Rx = RdotN * N[0] - V[0];
      const Ry = RdotN * N[1] - V[1];
      const Rz = RdotN * N[2] - V[2];
      const rl = Math.hypot(Rx, Ry, Rz) || 1;

      prefilteredEnv(mips, Rx / rl, Ry / rl, Rz / rl, roughness, env);
      envDFG(NdotV, roughness, dfg);

      let r = env[0] * (F0[0] * dfg[0] + dfg[1]);
      let g = env[1] * (F0[1] * dfg[0] + dfg[1]);
      let b = env[2] * (F0[2] * dfg[0] + dfg[1]);

      // --- especular directo de los softboxes -----------------------------
      for (const light of keyLights) {
        L[0] = light.dir[0]; L[1] = light.dir[1]; L[2] = light.dir[2];
        specularGGX(N, V, L, Math.max(roughness, 0.08), F0, spec);
        r += spec[0] * light.i * light.c[0];
        g += spec[1] * light.i * light.c[1];
        b += spec[2] * light.i * light.c[2];
      }

      // --- oclusion --------------------------------------------------------
      // La AO se aplica a la reflexion de entorno, que es la componente
      // ambiental. El especular directo se atenua menos.
      const a = ao[idx];
      const aoSpec = a * 0.55 + 0.45;
      r *= aoSpec; g *= aoSpec; b *= aoSpec;

      // --- realce de arista ------------------------------------------------
      // Linea de luz fina que sustituye al bevel geometrico. Se modula por la
      // reflexion local para que se integre en lugar de dibujar un contorno.
      // El realce es proporcional a la reflexion local, no aditivo puro: asi
      // la arista brilla donde la superficie ya recibe luz y se apaga donde la
      // pieza esta en sombra, que es como se comporta un bevel real. Un termino
      // aditivo constante produce el contorno blanco uniforme de dibujo
      // animado que hay que evitar.
      const e = edges[idx] * cfg.edgeStrength;
      if (e > 0) {
        const local = (r + g + b) / 3;
        const glow = e * (0.25 + 0.75 * local);
        r += glow * 0.95; g += glow * 0.97; b += glow * 1.0;
      }

      color[o] = r;
      color[o + 1] = g;
      color[o + 2] = b;
    }
  }

  return { color, ao, edges };
}

// ---------------------------------------------------------------------------
// Composicion final
// ---------------------------------------------------------------------------

/*
 * Fondo #303131 opaco y uniforme, que es el que ya usa la ficha del catalogo:
 * la UI lo espera y el marco de la tarjeta lo asume. NO se dibuja suelo con
 * horizonte visible (el render de Blender si lo hacia, y era parte del
 * problema). Solo una sombra de contacto eliptica difusa bajo la pieza, para
 * que la pieza tenga peso y no flote.
 */
function composite(shaded, gbuf, W, H, cfg) {
  const { color } = shaded;
  const { coverage, depth } = gbuf;
  const out = Buffer.alloc(W * H * 3);

  // Sombra de contacto. Se centra en la extension horizontal de la BASE de la
  // pieza (la banda inferior de la silueta), no en el centroide de toda el
  // area: el centroide se sesga hacia la parte mas voluminosa y deja la sombra
  // visiblemente descolocada respecto al punto de apoyo.
  let minPx = W, maxPx = 0, minPy = H, maxPy = 0;
  let count = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!coverage[y * W + x]) continue;
      count++;
      if (x < minPx) minPx = x;
      if (x > maxPx) maxPx = x;
      if (y < minPy) minPy = y;
      if (y > maxPy) maxPy = y;
    }
  }

  let shadow = null;
  if (count > 0) {
    // Banda inferior: el 12% mas bajo de la silueta.
    const bandTop = maxPy - Math.max(1, Math.round((maxPy - minPy) * 0.12));
    let bMin = W, bMax = 0;
    for (let y = bandTop; y <= maxPy; y++) {
      for (let x = 0; x < W; x++) {
        if (!coverage[y * W + x]) continue;
        if (x < bMin) bMin = x;
        if (x > bMax) bMax = x;
      }
    }
    if (bMin > bMax) { bMin = minPx; bMax = maxPx; }

    // El ancho combina la base real con la anchura total, para que la sombra no
    // salga ridiculamente estrecha en piezas que apoyan en un punto.
    const baseWidth = bMax - bMin;
    const fullWidth = maxPx - minPx;
    const width = Math.max(baseWidth * 0.75 + fullWidth * 0.25, W * 0.08);

    shadow = {
      cx: (bMin + bMax) / 2,
      cy: maxPy + Math.max(2, H * 0.004), // justo bajo el punto de apoyo
      rx: width * 0.70,
      ry: Math.max(H * 0.025, width * 0.16),
    };
  }

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      const o = idx * 3;

      if (coverage[idx]) {
        // Tonemap filmico (aproximacion ACES de Narkowicz) SOLO sobre la
        // pieza. Es necesario porque los softboxes producen radiancia muy por
        // encima de 1 y un clamp plano aplastaria el highlight a blanco puro,
        // que es otra de las cosas que el ojo lee como sintetico.
        const r = acesFilm(color[o] * cfg.exposure);
        const g = acesFilm(color[o + 1] * cfg.exposure);
        const b = acesFilm(color[o + 2] * cfg.exposure);
        out[o] = Math.round(linearToSrgb(r) * 255);
        out[o + 1] = Math.round(linearToSrgb(g) * 255);
        out[o + 2] = Math.round(linearToSrgb(b) * 255);
        continue;
      }

      // Fondo: el valor sRGB se escribe tal cual, SIN tonemap. Pasarlo por
      // ACES lo oscureceria (#303131 saldria como #262727) y el marco de la
      // tarjeta dejaria de casar con el render.
      let shade = 0;
      if (shadow) {
        const nx = (x - shadow.cx) / shadow.rx;
        const ny = (y - shadow.cy) / shadow.ry;
        const d = Math.hypot(nx, ny);
        if (d < 1) {
          // Caida suave, mas densa en el centro: sombra de contacto, no un disco.
          shade = Math.pow(1 - d, 1.8) * 0.55;
        }
      }

      for (let c = 0; c < 3; c++) {
        out[o + c] = Math.round(cfg.background[c] * (1 - shade));
      }
    }
  }

  return out;
}

function acesFilm(x) {
  const a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return Math.max(0, Math.min(1, (x * (a * x + b)) / (x * (c * x + d) + e)));
}

function linearToSrgb(c) {
  const v = Math.max(0, Math.min(1, c));
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

// ---------------------------------------------------------------------------
// Pipeline por pieza
// ---------------------------------------------------------------------------

async function renderPiece(stlPath, cfg, mips, noise) {
  const t0 = Date.now();

  const { triCount, positions } = readBinarySTL(stlPath);
  const { normals, bounds } = computeSmoothNormals(positions, triCount, cfg.smoothAngleDeg);

  const R = cfg.size * cfg.ss;
  const pca = principalAxes(positions, triCount);
  const cam = buildCamera(bounds, cfg, pca);
  const gbuf = rasterize({ positions, normals, triCount }, cam, R, R);
  const shaded = shade(gbuf, cam, mips, noise, bounds, R, R, cfg);
  const rgb = composite(shaded, gbuf, R, R, cfg);

  // Downsample con Lanczos: es el supersampling. Rasterizar a 3x y reducir da
  // el antialiasing de la silueta y de la linea de arista sin necesidad de
  // muestreo estocastico.
  const image = sharp(rgb, { raw: { width: R, height: R, channels: 3 } }).resize(
    cfg.size,
    cfg.size,
    { kernel: 'lanczos3', fit: 'fill' },
  );

  const webp = await image.clone().webp({ quality: cfg.webpQuality, effort: 6 }).toBuffer();
  const png = cfg.emitPng ? await image.clone().png({ compressionLevel: 9 }).toBuffer() : null;

  return { webp, png, triCount, ms: Date.now() - t0, bounds, cam };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const cfg = { ...CONFIG, emitPng: false };
  let outDir = OUT_DIR_DEFAULT;
  const filters = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') outDir = resolve(argv[++i]);
    else if (a === '--png') cfg.emitPng = true;
    else if (a === '--size') cfg.size = Number(argv[++i]);
    else if (a === '--ss') cfg.ss = Number(argv[++i]);
    else if (a === '--quality') cfg.webpQuality = Number(argv[++i]);
    else if (a.startsWith('--')) {
      console.error(`Opcion desconocida: ${a}`);
      process.exit(2);
    } else filters.push(a);
  }

  return { cfg, outDir, filters };
}

async function main() {
  const { cfg, outDir, filters } = parseArgs(process.argv.slice(2));

  if (!existsSync(STL_DIR)) {
    console.error(`\nNo encuentro los STL en:\n  ${STL_DIR}\n`);
    process.exit(2);
  }

  const allStlFiles = readdirSync(STL_DIR).filter((f) => f.endsWith('.stl')).sort();

  // Los STL con la malla defectuosa se descartan ANTES del mapeo, para que no
  // cuenten como huerfanos ni disparen el aviso de "sin mapeo seguro": su
  // problema no es el nombre, es la geometria.
  const excluded = allStlFiles.filter((f) => EXCLUDED_STL.has(f));
  const stlFiles = allStlFiles.filter((f) => !EXCLUDED_STL.has(f));

  if (excluded.length > 0) {
    console.warn('\nSTL excluidos por defecto de malla (NO se renderizan):');
    for (const f of excluded) console.warn(`  ${f.padEnd(26)} ${EXCLUDED_STL.get(f)}`);
    console.warn(
      '  -> Los componentes afectados quedan con render_3d: pending y caen a su\n' +
        '     plano 2D. Requiere regenerar el CAD. Ver PB-CAD-STL-REPAIR-001.',
    );
  }

  // El mapeo se resuelve contra el directorio de salida canonico aunque se
  // escriba en otro sitio (--out), porque los nombres deben ser exactamente
  // los que referencia catalog.generated.json.
  const { mapped, unmapped, orphans } = buildMapping(stlFiles, OUT_DIR_DEFAULT);

  if (unmapped.length > 0) {
    console.warn('\nSTL sin mapeo seguro (NO se renderizan, no se adivina):');
    for (const u of unmapped) console.warn(`  ${u.stl}  [slug=${u.slug}]  ${u.reason}`);
  }
  if (orphans.length > 0) {
    // Un huerfano legitimo es un render cuyo STL ya no existe. Si aparece aqui
    // uno de los STL excluidos, significa que su .webp sigue publicado y hay que
    // borrarlo: seria un render defectuoso vivo en el catalogo.
    console.warn('\nFicheros de salida sin STL de origen (se dejan intactos):');
    for (const o of orphans) {
      const stale = excluded.some((e) => stlSlug(e) === outputSlug(o));
      console.warn(`  ${o}${stale ? '   <- de un STL EXCLUIDO: deberia borrarse' : ''}`);
    }
  }

  const targets = filters.length
    ? mapped.filter((m) => filters.some((f) => m.stl.includes(f) || m.slug.includes(f)))
    : mapped;

  if (targets.length === 0) {
    console.error('\nNada que renderizar con esos filtros.\n');
    process.exit(1);
  }

  mkdirSync(outDir, { recursive: true });

  console.log(`\nEntorno: prefiltrando ${8} niveles de rugosidad...`);
  const mips = buildEnvMips(8);
  const noise = makeNoise(cfg.noiseSeed);

  console.log(
    `Renderizando ${targets.length} pieza(s) a ${cfg.size}x${cfg.size} ` +
      `(interno ${cfg.size * cfg.ss}x${cfg.size * cfg.ss}, ${cfg.ss}x SS)\n`,
  );

  let total = 0;
  const times = [];

  for (const { stl, out } of targets) {
    const stlPath = join(STL_DIR, stl);
    let result;
    try {
      result = await renderPiece(stlPath, cfg, mips, noise);
    } catch (err) {
      console.error(`  FALLO  ${stl}: ${err.message}`);
      continue;
    }

    writeFileSync(join(outDir, out), result.webp);
    if (result.png) {
      writeFileSync(join(outDir, out.replace(/\.webp$/, '.png')), result.png);
    }

    times.push(result.ms);
    total += result.ms;
    const kb = (result.webp.length / 1024).toFixed(0);
    console.log(
      `  ok  ${stl.padEnd(26)} -> ${out.padEnd(42)} ` +
        `${String(result.triCount).padStart(6)} tri  ${String(result.ms).padStart(6)} ms  ${kb} KB`,
    );
  }

  if (times.length) {
    const avg = Math.round(total / times.length);
    console.log(
      `\n${times.length} pieza(s) en ${(total / 1000).toFixed(1)} s ` +
        `(media ${avg} ms, min ${Math.min(...times)} ms, max ${Math.max(...times)} ms)`,
    );
  }
  console.log(`Salida: ${outDir}\n`);

  if (unmapped.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
