# PRODUCTION SNAPSHOT — 2026-08-20 19:05 CEST

**Copia fiel de lo que PIPINGBOX servia en produccion el 2026-08-20, antes de tocar la
arquitectura de despliegue.** Generado en la fase DRIFT-B de PB-DRIFT-001, opcion C.

Produccion **no fue modificada** para obtener este snapshot. Todo es descarga HTTP.

## Que es y que NO es

**Es** el artefacto real publicado: HTML, bundles JS compilados, CSS, robots y sitemaps, con
hash SHA-256 de cada fichero en `SHA256SUMS.txt`.

**No es** codigo fuente. Los `.js` estan minificados y sin sourcemaps. No se puede reconstruir el
TSX original a partir de aqui.

Sirve para tres cosas concretas:

1. **Prueba forense.** Si un despliegue futuro rompe algo, esto demuestra que habia antes.
2. **Inventario de lo que existe solo en produccion.** Las 7 rutas huerfanas de `app` estan
   dentro de `index-BMTgXtS_.js` y su comportamiento es leible aunque el fuente no lo sea.
3. **Ultimo recurso si se pierde el acceso a Atoms.** Un sitio estatico puede volver a servirse
   desde estos ficheros tal cual. No es bonito, pero es la diferencia entre "degradado" y "perdido".

**No sustituye a exportar el codigo fuente desde Atoms.** Eso sigue pendiente y solo lo puede
hacer Gaspar.

## Contenido

| Host | Ficheros | Bundle principal | Observaciones |
|---|---|---|---|
| `app.pipingbox.com` | 7 | `index-BMTgXtS_.js` (2,24 MB) | Sin `robots.txt`. **Contiene las 7 rutas huerfanas** |
| `www.pipingbox.com` | 9 | `index-CENKXtUK.js` (208 KB) | Con gtag y sitemap propio (F0) |
| `academy.pipingbox.com` | 9 | `index-sWeqmfiY.js` (211 KB) | Con gtag y sitemap propio (F0) |
| `companies.pipingbox.com` | 9 | `index-BJGYX1i6.js` (242 KB) | Contiene el `LeadCapture` de PB-LEADFORM-001 |
| `tools.pipingbox.com` | 9 | `index-CI5zUedY.js` (223 KB) | — |
| `jobs.pipingbox.com` | 9 | `index-ErXewL_E.js` (211 KB) | Con `meta robots noindex` (F0). Se retira en F3 |
| `early.pipingbox.com` | 9 | `index-JjZBy7CN.js` (191 KB) | Se retira en F3 |
| `community.pipingbox.com` | 4 | HTML plano, sin Vite | **No tiene `robots.txt` ni `sitemap.xml`** |

**65 ficheros. Ninguno vacio.** Verificado uno a uno.

### Hallazgo nuevo — `community` no tiene robots ni sitemap

`community.pipingbox.com/robots.txt` y `/sitemap.xml` devuelven **200 con el `index.html`**, no un
404 y no el fichero esperado. Confirmado por hash: los dos coincidian byte a byte con `index.html`.

Se conservan renombrados como `NOT-FOUND-robots.html` y `NOT-FOUND-sitemap.html` para dejar
constancia de lo que respondia el servidor, sin fingir que son ficheros validos.

Severidad **LOW**: `community` se replantea en F3. Registrado para no volver a descubrirlo.

## Las 7 rutas que existen solo aqui

Estan en `app.pipingbox.com/assets/index-BMTgXtS_.js` y **no existen en ninguna rama de
`github.com/pipingbox/DASHBOARD-APP`**:

| Ruta | Por que importa |
|---|---|
| `/forgot-password` | Recuperacion de cuenta de 43 usuarios reales |
| `/reset-password` | Idem |
| `/company/billing` | Facturacion |
| `/company/settings` | Configuracion de empresa |
| `/company/documentation` | Documentacion de empresa |
| `/privacy` | Obligacion legal (RGPD) |
| `/terms` | Obligacion legal |

Verificado contra **todo** `src/`, no solo `App.tsx`. Cero coincidencias.

**Consecuencia operativa: mientras estas 7 rutas no esten en Git como codigo fuente, esta
prohibido conectar cualquier despliegue automatico a `app.pipingbox.com`.** Hacerlo las borraria
de produccion.

## Rutas que estan en Git y no en produccion

`/pricing`, `/enterprise-dashboard`, `/academy/vca-course` y previsiblemente el resto de
`/academy/*` y `/certifications/*`. El repositorio declara 43 rutas; produccion sirve 30.

Confirmado que **no hay lazy chunks de rutas** (solo 4 vendors), por lo que el router completo
esta en el bundle principal y las ausencias son concluyentes en ambas direcciones.

## Verificar la integridad del snapshot

```powershell
cd recovery/production-snapshot-2026-08-20
Get-ChildItem -Recurse -File | Where-Object { $_.Name -ne 'SHA256SUMS.txt' } | ForEach-Object {
  '{0}  {1}' -f (Get-FileHash $_ -Algorithm SHA256).Hash.Substring(0,32), $_.Name
}
```

## Que falta todavia

| Pendiente | Quien |
|---|---|
| Exportar el **codigo fuente** de los 7 satelites desde Atoms | **Gaspar** — no tengo acceso |
| Exportar el fuente de las 7 rutas huerfanas de `app` desde Atoms | **Gaspar** |
| Crear repositorio por satelite | pendiente de autorizacion |

Este snapshot cubre el artefacto compilado. La fuente sigue viviendo solo dentro de Atoms, y ese
es el riesgo D3 que aun no esta cerrado.
