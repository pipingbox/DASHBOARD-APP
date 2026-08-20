# ATOMS PROMPT — Biblioteca de Accesorios V1

**Ticket:** PB-ASSETS-001 (reconciliado 2026-07-27)
**Estado:** READY FOR EXECUTION — PAQUETE ACTUALIZADO
**Version:** 2.0 | Actualizado: 2026-07-27
**Fuentes aprobadas:**
- `07-DESIGN/02-ASSETS/APPROVED/BIBLIOTECA_V1/ASSET_SET.md`
- `02-PRODUCT/ACCESSORY_LIBRARY_VISUAL_SPEC_V1.md`
- `07-DESIGN/01-DESIGN_SYSTEM/MASTER_VISUAL_PROMPT.md`
- `07-DESIGN/01-DESIGN_SYSTEM/STYLE_GUIDE.md`

**Restriccion:** Este prompt traduce fielmente el diseno aprobado. No reinterpreta estilo, perspectiva, iluminacion ni seleccion de componentes.

---

## ESTADO DE RECONCILIACION (2026-07-27)

### Que existe fisicamente

| Tipo de pieza | Cantidad | Ubicacion |
|---|---|---|
| Hero PNGs (`_3d.png`) | 28 | `hero/` — IDs 0001–0029 (sin 0004) |
| Multi-vista PNG completa (5 vistas) | 1 | `detail/` — solo PB-ASSET-0001 |
| SVGs dimensionales (`_2d.svg`) | 385 | `detail/` — por NPS, no por asset-ID |
| STL CAD reference | 28 | `CAD_REFERENCE/` |

### Definicion de asset completo (segun PB-ASSET-0001)

Un asset se considera COMPLETO cuando tiene las 7 piezas siguientes:
1. `_3d.png` — render hero isometrico (en `hero/`)
2. `_2d.svg` — plano dimensional (en `detail/`)
3. `_render.png` — render fotorrealista principal (en `detail/`)
4. `_front.png` — vista frontal (en `detail/`)
5. `_side.png` — vista lateral (en `detail/`)
6. `_top.png` — vista superior (en `detail/`)
7. `_3q_alt.png` — perspectiva 3/4 alternativa (en `detail/`)

### ADVERTENCIA CRITICA — Desalineacion de IDs

Los 28 renders hero en `hero/` usan IDs PB-ASSET-0001 a PB-ASSET-0029 (sin 0004) que NO mapean 1:1 al ASSET_SET.md canonico. Los renders Blender asignaron IDs propios a variantes adicionales (elbow-45-lr, elbow-90-sr, return-180, cross, lateral, stub-end-a/b, elbow-90-sw, elbow-90-thd) que no forman parte del set de 20 aprobado.

**El ASSET_SET.md es la fuente de verdad.** Los IDs PB-ASSET-0001 a PB-ASSET-0020 son los canonicos. Los renders Blender con IDs 0006–0029 son material de referencia CAD, no assets de produccion del set aprobado.

---

## TABLA DE RECONCILIACION — 20 ASSETS DEL SET CANONICO

| ID canonico | Elemento | Hero `_3d.png` | Multi-vista (5 PNGs) | SVG `_2d.svg` | Estado |
|---|---|---|---|---|---|
| PB-ASSET-0001 | Codo BW 90 LR | SI (`hero/PB-ASSET-0001_elbow-90-lr-bw_3d.png`) | SI (5 vistas en `detail/`) | SI (`detail/PB-ASSET-0001_elbow-90-lr-bw_2d.svg`) | **COMPLETO** |
| PB-ASSET-0002 | Tee BW | SI (`hero/PB-ASSET-0002_tee-equal-bw_3d.png`) | NO | SI (via `PB-DIM-TEE-EQUAL-NPS-*`) | **PARCIAL** — faltan 5 multi-vista |
| PB-ASSET-0003 | Reduccion concentrica BW | SI (`hero/PB-ASSET-0003_reducer-conc-bw_3d.png`) | NO | SI (via `PB-DIM-REDUCER-CONC-NPS-*`) | **PARCIAL** — faltan 5 multi-vista |
| PB-ASSET-0004 | Reduccion excentrica BW | NO (gap en numeracion) | NO | SI (via `PB-DIM-REDUCER-ECC-NPS-*`) | **PARCIAL** — falta hero + 5 multi-vista |
| PB-ASSET-0005 | Tapa BW (Cap) | SI (`hero/PB-ASSET-0005_cap-bw_3d.png`) | NO | SI (via `PB-DIM-CAP-NPS-*`) | **PARCIAL** — faltan 5 multi-vista |
| PB-ASSET-0006 | Stub End | NO (el `hero/PB-ASSET-0006` es elbow-45-lr, no stub end) | NO | SI (via `PB-DIM-STUB-END-A-NPS-*`) | **FALTA** — hero incorrecto + 5 multi-vista |
| PB-ASSET-0007 | Brida Weld Neck | NO (el `hero/PB-ASSET-0007` es elbow-90-sr, no brida) | NO | SI (via `PB-DIM-FLANGE-WN-NPS-*`) | **FALTA** — hero incorrecto + 5 multi-vista |
| PB-ASSET-0008 | Esparrago (Stud Bolt) | NO (el `hero/PB-ASSET-0008` es elbow-45-sr, no bolt) | NO | SI (via `PB-DIM-STUD-BOLT-NPS-*`) | **FALTA** — hero incorrecto + 5 multi-vista |
| PB-ASSET-0009 | Junta Spiral Wound | NO (el `hero/PB-ASSET-0009` es elbow-90-3d, no gasket) | NO | SI (via `PB-DIM-GASKET-SW-NPS-*`) | **FALTA** — hero incorrecto + 5 multi-vista |
| PB-ASSET-0010 | Gate Valve (bridada) | NO (el `hero/PB-ASSET-0010` es return-180-lr, no valve) | NO | SI (via `PB-DIM-VALVE-GATE-NPS-*`) | **FALTA** — hero incorrecto + 5 multi-vista |
| PB-ASSET-0011 | Globe Valve (bridada) | NO (el `hero/PB-ASSET-0011` es return-180-sr, no valve) | NO | SI (via `PB-DIM-VALVE-GLOBE-NPS-*`) | **FALTA** — hero incorrecto + 5 multi-vista |
| PB-ASSET-0012 | Check Valve (bridada) | NO (el `hero/PB-ASSET-0012` es tee-reducing, no valve) | NO | SI (via `PB-DIM-VALVE-CHECK-NPS-*`) | **FALTA** — hero incorrecto + 5 multi-vista |
| PB-ASSET-0013 | Ball Valve (bridada) | NO (el `hero/PB-ASSET-0013` es reducer-ecc, no valve) | NO | SI (via `PB-DIM-VALVE-BALL-NPS-*`) | **FALTA** — hero incorrecto + 5 multi-vista |
| PB-ASSET-0014 | Butterfly Valve (wafer/lug) | NO | NO | NO (no hay DIM YAML para butterfly) | **FALTA** — todo |
| PB-ASSET-0015 | Filtro Y (Y-Strainer, bridada) | NO (el `hero/PB-ASSET-0015` es stub-end-b, no strainer) | NO | SI (via `PB-DIM-Y-STRAINER-NPS-*`) | **FALTA** — hero incorrecto + 5 multi-vista |
| PB-ASSET-0016 | Weldolet (BW outlet) | NO (el `hero/PB-ASSET-0016` es cross-equal, no olet) | NO | SI (via `PB-DIM-WELDOLET-NPS-*`) | **FALTA** — hero incorrecto + 5 multi-vista |
| PB-ASSET-0017 | Sockolet (SW outlet) | NO | NO | NO (no hay DIM YAML para sockolet) | **FALTA** — todo |
| PB-ASSET-0018 | Threadolet (roscado outlet) | NO | NO | NO (no hay DIM YAML para threadolet) | **FALTA** — todo |
| PB-ASSET-0019 | Tee roscada | NO | NO | NO (no hay DIM YAML para tee roscada) | **FALTA** — todo |
| PB-ASSET-0020 | Spectacle Blind | NO (el `hero/PB-ASSET-0020` es gasket-sw, no blind) | NO | SI (via `PB-DIM-SPECTACLE-BLIND-NPS-*`) | **FALTA** — hero incorrecto + 5 multi-vista |

### Resumen de estado

| Estado | Cantidad | Assets |
|---|---|---|
| COMPLETO (7/7 piezas) | 1 | PB-ASSET-0001 |
| PARCIAL (hero + SVG, faltan 5 multi-vista) | 4 | 0002, 0003, 0005 + 0004 sin hero |
| FALTA (hero incorrecto o ausente + multi-vista) | 15 | 0006–0020 |

**Piezas pendientes de generacion por Atoms: 19 heroes + 95 multi-vista (19 x 5) = 114 imagenes PNG.**

> Nota: PB-ASSET-0004 (reduccion excentrica) no tiene hero en `hero/` — hay un gap en la numeracion. Necesita hero generado.

---

## PARTE 1 — ESTILO VISUAL GLOBAL

Aplicar a los 20 assets sin excepcion. Ancla de consistencia: **PB-ASSET-0001** (`brain/07-DESIGN/02-ASSETS/APPROVED/BIBLIOTECA_V1/hero/PB-ASSET-0001_elbow-90-lr-bw_3d.png`).

El tratamiento visual de PB-ASSET-0001 es: render fotorrealista de codo de acero inoxidable satinado/arenado, perspectiva 3/4 desde ligeramente arriba, iluminacion de estudio difusa desde arriba-izquierda, fondo negro tecnico #111111, sombra de contacto sutil debajo de la pieza, sin texto ni marcas, pieza centrada con margen de seguridad, geometria industrial reconocible a tamano de tarjeta.

- **Material:** Acero inoxidable o metal satinado neutro.
- **Fondo:** Negro o gris carbon uniforme (#111111). Sin degradados, sin escenas, sin suelo visible.
- **Iluminacion:** Estudio, suave y controlada. Sin reflejos duros. Sin sombras dramaticas.
- **Perspectiva:** 3/4, consistente en los 20 assets. Misma altura de camara y angulo.
- **Encuadre:** Pieza centrada con margen de seguridad alrededor. Espacio suficiente para que la pieza no toque los bordes.
- **Escala visual:** Misma proporcion aparente en toda la familia. Una brida no debe parecer del tamano de un esparrago.
- **Temperatura de color:** Neutra, uniforme en los 20 assets.

### Prohibiciones absolutas

- Sin logotipos ni marcas de fabricante.
- Sin texto, numeros, normas ni grabados sobre la pieza.
- Sin rotulos debajo del elemento dentro del asset.
- Sin decoraciones, escenas de taller ni fondos complejos.
- Sin branding PIPINGBOX.
- Sin texto generado por IA sobre la superficie metalica.

---

## PARTE 2 — PROMPT BASE (heredar en todos los assets)

```
Realistic industrial pipe fitting photograph,
stainless steel with satin sandblasted finish,
neutral professional appearance conforming to ASME and DIN/EN standards,
3/4 perspective view from slightly above,
soft diffused studio lighting from upper left,
dark technical background (#111111),
subtle contact shadow below the fitting,
high definition, sharp detail on metal surface texture,
no commercial brands, no text overlays, no labels,
no icons, no diagrams, no CAD symbols,
clean professional product photography style,
consistent with an industrial piping equipment catalog.
Visual reference: match the exact style of PB-ASSET-0001 (90-degree long radius butt weld elbow in satin stainless steel, 3/4 view, dark background, studio lighting, no text).
```

---

## PARTE 3 — PROMPTS INDIVIDUALES POR ASSET

Ordenados por prioridad de desbloqueo para PB-ASSETS-IMPLEMENT-001 (frontend).
Prioridad 1: assets de categorias principales de la biblioteca (BW fittings, bridas, valvulas).
Prioridad 2: elementos de union y especiales.
Prioridad 3: olets y roscados.

---

### PRIORIDAD 1 — Accesorios Butt Weld (completar set principal)

---

#### PB-ASSET-0004 — Reduccion excentrica BW
**Archivo de salida:** `PB-ASSET-0004_reducer-ecc-bw_3d.png`
**Ruta de destino:** `brain/07-DESIGN/02-ASSETS/APPROVED/BIBLIOTECA_V1/hero/`
**Piezas a generar:** hero `_3d.png` + 5 multi-vista (`_render.png`, `_front.png`, `_side.png`, `_top.png`, `_3q_alt.png`) en `detail/`

**PROMPT (copiar completo en Atoms):**
```
Realistic industrial pipe fitting photograph,
stainless steel with satin sandblasted finish,
neutral professional appearance conforming to ASME and DIN/EN standards,
3/4 perspective view from slightly above,
soft diffused studio lighting from upper left,
dark technical background (#111111),
subtle contact shadow below the fitting,
high definition, sharp detail on metal surface texture,
no commercial brands, no text overlays, no labels,
no icons, no diagrams, no CAD symbols,
clean professional product photography style,
consistent with an industrial piping equipment catalog.
Visual reference: match the exact style of PB-ASSET-0001 (90-degree long radius butt weld elbow in satin stainless steel, 3/4 view, dark background, studio lighting, no text).
Subject: eccentric reducer butt weld fitting.
Tapered pipe reducer transitioning from larger diameter to smaller diameter with one flat side (flat bottom edge, offset alignment). Both beveled butt weld ends clearly visible. The flat bottom generatrix is the key visual differentiator from a concentric reducer.
```

---

#### PB-ASSET-0002 — Tee BW (multi-vista faltante)
**Archivo de salida:** `PB-ASSET-0002_tee-equal-bw_render.png`, `_front.png`, `_side.png`, `_top.png`, `_3q_alt.png`
**Ruta de destino:** `brain/07-DESIGN/02-ASSETS/APPROVED/BIBLIOTECA_V1/detail/`
**Piezas a generar:** 5 multi-vista (el hero `_3d.png` ya existe en `hero/`)

**PROMPT (copiar completo en Atoms):**
```
Realistic industrial pipe fitting photograph,
stainless steel with satin sandblasted finish,
neutral professional appearance conforming to ASME and DIN/EN standards,
3/4 perspective view from slightly above,
soft diffused studio lighting from upper left,
dark technical background (#111111),
subtle contact shadow below the fitting,
high definition, sharp detail on metal surface texture,
no commercial brands, no text overlays, no labels,
no icons, no diagrams, no CAD symbols,
clean professional product photography style,
consistent with an industrial piping equipment catalog.
Visual reference: match the exact style of PB-ASSET-0001 (90-degree long radius butt weld elbow in satin stainless steel, 3/4 view, dark background, studio lighting, no text).
Subject: equal tee butt weld fitting, three-way pipe junction.
All three beveled butt weld openings clearly visible showing the symmetric T-shaped profile. Branch outlet perpendicular to the run pipe. All three ends same diameter.
```
*Generar 5 variantes de encuadre: render (3/4 principal), front (vista frontal del run), side (vista lateral mostrando branch), top (vista superior), 3q_alt (3/4 alternativo desde el otro lado).*

---

#### PB-ASSET-0003 — Reduccion concentrica BW (multi-vista faltante)
**Archivo de salida:** `PB-ASSET-0003_reducer-conc-bw_render.png`, `_front.png`, `_side.png`, `_top.png`, `_3q_alt.png`
**Ruta de destino:** `brain/07-DESIGN/02-ASSETS/APPROVED/BIBLIOTECA_V1/detail/`
**Piezas a generar:** 5 multi-vista (el hero `_3d.png` ya existe en `hero/`)

**PROMPT (copiar completo en Atoms):**
```
Realistic industrial pipe fitting photograph,
stainless steel with satin sandblasted finish,
neutral professional appearance conforming to ASME and DIN/EN standards,
3/4 perspective view from slightly above,
soft diffused studio lighting from upper left,
dark technical background (#111111),
subtle contact shadow below the fitting,
high definition, sharp detail on metal surface texture,
no commercial brands, no text overlays, no labels,
no icons, no diagrams, no CAD symbols,
clean professional product photography style,
consistent with an industrial piping equipment catalog.
Visual reference: match the exact style of PB-ASSET-0001 (90-degree long radius butt weld elbow in satin stainless steel, 3/4 view, dark background, studio lighting, no text).
Subject: concentric reducer butt weld fitting.
Tapered cylindrical shape transitioning smoothly from larger diameter to smaller diameter with coaxial alignment (both axes coincide). Both beveled butt weld ends clearly visible. Smooth conical taper.
```
*Generar 5 variantes de encuadre: render (3/4 principal), front (vista frontal extremo mayor), side (vista lateral mostrando taper), top (vista superior), 3q_alt (3/4 alternativo).*

---

#### PB-ASSET-0005 — Tapa BW / Cap (multi-vista faltante)
**Archivo de salida:** `PB-ASSET-0005_cap-bw_render.png`, `_front.png`, `_side.png`, `_top.png`, `_3q_alt.png`
**Ruta de destino:** `brain/07-DESIGN/02-ASSETS/APPROVED/BIBLIOTECA_V1/detail/`
**Piezas a generar:** 5 multi-vista (el hero `_3d.png` ya existe en `hero/`)

**PROMPT (copiar completo en Atoms):**
```
Realistic industrial pipe fitting photograph,
stainless steel with satin sandblasted finish,
neutral professional appearance conforming to ASME and DIN/EN standards,
3/4 perspective view from slightly above,
soft diffused studio lighting from upper left,
dark technical background (#111111),
subtle contact shadow below the fitting,
high definition, sharp detail on metal surface texture,
no commercial brands, no text overlays, no labels,
no icons, no diagrams, no CAD symbols,
clean professional product photography style,
consistent with an industrial piping equipment catalog.
Visual reference: match the exact style of PB-ASSET-0001 (90-degree long radius butt weld elbow in satin stainless steel, 3/4 view, dark background, studio lighting, no text).
Subject: butt weld cap, domed end closure for pipe.
Half-ellipsoidal dome shape closing one end of a pipe. Single beveled butt weld open end visible. The closed dome end is smooth and rounded. No openings on the dome side.
```
*Generar 5 variantes de encuadre: render (3/4 principal), front (vista frontal del extremo abierto), side (vista lateral mostrando perfil del domo), top (vista superior), 3q_alt (3/4 alternativo).*

---

### PRIORIDAD 1 — Bridas y elementos de union

---

#### PB-ASSET-0007 — Brida Weld Neck
**Archivo de salida:** `PB-ASSET-0007_flange-wn_3d.png`
**Ruta de destino:** `brain/07-DESIGN/02-ASSETS/APPROVED/BIBLIOTECA_V1/hero/`
**Piezas a generar:** hero `_3d.png` + 5 multi-vista en `detail/`

> NOTA: El archivo `hero/PB-ASSET-0018_flange-wn_3d.png` existe con el render Blender de la brida WN, pero su ID (0018) no corresponde al ID canonico (0007). Atoms debe generar el asset con el ID correcto PB-ASSET-0007.

**PROMPT (copiar completo en Atoms):**
```
Realistic industrial pipe fitting photograph,
stainless steel with satin sandblasted finish,
neutral professional appearance conforming to ASME and DIN/EN standards,
3/4 perspective view from slightly above,
soft diffused studio lighting from upper left,
dark technical background (#111111),
subtle contact shadow below the fitting,
high definition, sharp detail on metal surface texture,
no commercial brands, no text overlays, no labels,
no icons, no diagrams, no CAD symbols,
clean professional product photography style,
consistent with an industrial piping equipment catalog.
Visual reference: match the exact style of PB-ASSET-0001 (90-degree long radius butt weld elbow in satin stainless steel, 3/4 view, dark background, studio lighting, no text).
Subject: welding neck flange, raised face, ASME B16.5.
Circular disc with long tapered hub ending in a beveled weld end. Raised face sealing surface visible. Bolt holes evenly distributed around the circumference. The tapered hub is the key visual differentiator. Both the face with bolt holes and the welding neck hub must be clearly visible in the 3/4 view.
```
*Generar 5 variantes de encuadre: render (3/4 principal), front (vista frontal de la cara con taladros), side (vista lateral mostrando el cuello), top (vista superior de la cara), 3q_alt (3/4 alternativo).*

---

#### PB-ASSET-0006 — Stub End
**Archivo de salida:** `PB-ASSET-0006_stub-end_3d.png`
**Ruta de destino:** `brain/07-DESIGN/02-ASSETS/APPROVED/BIBLIOTECA_V1/hero/`
**Piezas a generar:** hero `_3d.png` + 5 multi-vista en `detail/`

> NOTA: Los renders Blender `PB-ASSET-0014_stub-end-a_3d.png` y `PB-ASSET-0015_stub-end-b_3d.png` existen pero con IDs incorrectos. El ASSET_SET.md define un solo Stub End en PB-ASSET-0006 (lap-joint stub end). Atoms debe generar con ID correcto.

**PROMPT (copiar completo en Atoms):**
```
Realistic industrial pipe fitting photograph,
stainless steel with satin sandblasted finish,
neutral professional appearance conforming to ASME and DIN/EN standards,
3/4 perspective view from slightly above,
soft diffused studio lighting from upper left,
dark technical background (#111111),
subtle contact shadow below the fitting,
high definition, sharp detail on metal surface texture,
no commercial brands, no text overlays, no labels,
no icons, no diagrams, no CAD symbols,
clean professional product photography style,
consistent with an industrial piping equipment catalog.
Visual reference: match the exact style of PB-ASSET-0001 (90-degree long radius butt weld elbow in satin stainless steel, 3/4 view, dark background, studio lighting, no text).
Subject: stub end, lap joint fitting, ASME B16.9.
Short cylindrical pipe stub with one beveled butt weld end and one flared lap at the other end. The flared lap (collar) is the key visual element — it is a flat annular ring that protrudes radially outward from the pipe body. The lap allows a loose lap-joint flange to rotate around it.
```
*Generar 5 variantes de encuadre: render (3/4 principal), front (vista frontal del extremo biselado), side (vista lateral mostrando el reborde lap), top (vista superior), 3q_alt (3/4 alternativo).*

---

#### PB-ASSET-0008 — Esparrago (Stud Bolt)
**Archivo de salida:** `PB-ASSET-0008_stud-bolt_3d.png`
**Ruta de destino:** `brain/07-DESIGN/02-ASSETS/APPROVED/BIBLIOTECA_V1/hero/`
**Piezas a generar:** hero `_3d.png` + 5 multi-vista en `detail/`

> NOTA: El render Blender `PB-ASSET-0019_stud-bolt_3d.png` existe pero con ID incorrecto. Atoms debe generar con ID canonico PB-ASSET-0008.

**PROMPT (copiar completo en Atoms):**
```
Realistic industrial fastener photograph,
alloy steel with clean machined finish,
neutral professional appearance conforming to ASME B18.2.1 standards,
3/4 perspective view from slightly above,
soft diffused studio lighting from upper left,
dark technical background (#111111),
subtle contact shadow below the fitting,
high definition, sharp detail on metal surface texture,
no commercial brands, no text overlays, no labels,
no icons, no diagrams, no CAD symbols,
clean professional product photography style,
consistent with an industrial piping equipment catalog.
Visual reference: match the exact style of PB-ASSET-0001 (satin stainless steel, 3/4 view, dark background, studio lighting, no text).
Subject: stud bolt with two heavy hex nuts installed on both ends.
Fully threaded steel rod (stud bolt) with one heavy hex nut threaded onto each end. The threads are visible along the full length of the rod. The hex nuts are seated at both ends. No grade markings, no text, no manufacturer stamps on the metal surface.
```
*Generar 5 variantes de encuadre: render (3/4 principal), front (vista frontal mostrando perfil del bolt), side (vista lateral), top (vista superior mostrando hexagono de tuerca), 3q_alt (3/4 alternativo).*

---

#### PB-ASSET-0009 — Junta Spiral Wound
**Archivo de salida:** `PB-ASSET-0009_gasket-sw_3d.png`
**Ruta de destino:** `brain/07-DESIGN/02-ASSETS/APPROVED/BIBLIOTECA_V1/hero/`
**Piezas a generar:** hero `_3d.png` + 5 multi-vista en `detail/`

> NOTA: El render Blender `PB-ASSET-0020_gasket-sw_3d.png` existe pero con ID incorrecto. Atoms debe generar con ID canonico PB-ASSET-0009.

**PROMPT (copiar completo en Atoms):**
```
Realistic industrial gasket photograph,
stainless steel outer ring with graphite filler spiral,
neutral professional appearance conforming to ASME B16.20 standards,
3/4 perspective view from slightly above,
soft diffused studio lighting from upper left,
dark technical background (#111111),
subtle contact shadow below the fitting,
high definition, sharp detail on metal surface texture,
no commercial brands, no text overlays, no labels,
no icons, no diagrams, no CAD symbols,
clean professional product photography style,
consistent with an industrial piping equipment catalog.
Visual reference: match the exact style of PB-ASSET-0001 (satin stainless steel, 3/4 view, dark background, studio lighting, no text).
Subject: spiral wound gasket with inner ring and outer centering ring, ASME B16.20.
Flat annular ring with three concentric zones: solid outer centering ring (stainless steel), spiral wound metallic strip with graphite filler (the wound pattern is visible as alternating metallic and dark bands), and solid inner ring. The spiral wound pattern is the key visual element.
```
*Generar 5 variantes de encuadre: render (3/4 principal), front (vista frontal de la cara mostrando patron espiral), side (vista lateral mostrando el perfil delgado del anillo), top (vista superior), 3q_alt (3/4 alternativo).*

---

### PRIORIDAD 1 — Valvulas (critico para frontend)

---

#### PB-ASSET-0010 — Gate Valve (bridada)
**Archivo de salida:** `PB-ASSET-0010_valve-gate_3d.png`
**Ruta de destino:** `brain/07-DESIGN/02-ASSETS/APPROVED/BIBLIOTECA_V1/hero/`
**Piezas a generar:** hero `_3d.png` + 5 multi-vista en `detail/`

> NOTA: El render Blender `PB-ASSET-0025_valve-gate_3d.png` existe pero con ID incorrecto. Atoms debe generar con ID canonico PB-ASSET-0010. QA CRITICO: debe ser bridada, no SW ni roscada.

**PROMPT (copiar completo en Atoms):**
```
Realistic industrial valve photograph,
carbon steel or stainless steel with clean industrial finish,
neutral professional appearance conforming to ASME B16.34 and API 600 standards,
3/4 perspective view from slightly above,
soft diffused studio lighting from upper left,
dark technical background (#111111),
subtle contact shadow below the fitting,
high definition, sharp detail on metal surface texture,
no commercial brands, no text overlays, no labels,
no icons, no diagrams, no CAD symbols,
clean professional product photography style,
consistent with an industrial piping equipment catalog.
Visual reference: match the exact style of PB-ASSET-0001 (satin stainless steel, 3/4 view, dark background, studio lighting, no text).
Subject: gate valve with rising stem, wedge gate design, FLANGED body.
Robust valve body with FLANGED connections on both ends (flanges with visible bolt holes, NOT plain ends, NOT socket weld, NOT threaded). Bolted bonnet on top. Rising stem with handwheel on top. The flanges with bolt holes are the critical visual element — they must be clearly visible.
QA CHECK: Verify flanges with bolt holes are visible on both ends before approving.
```
*Generar 5 variantes de encuadre: render (3/4 principal), front (vista frontal mostrando brida y volante), side (vista lateral mostrando perfil del cuerpo), top (vista superior mostrando volante), 3q_alt (3/4 alternativo).*

---

#### PB-ASSET-0011 — Globe Valve (bridada)
**Archivo de salida:** `PB-ASSET-0011_valve-globe_3d.png`
**Ruta de destino:** `brain/07-DESIGN/02-ASSETS/APPROVED/BIBLIOTECA_V1/hero/`
**Piezas a generar:** hero `_3d.png` + 5 multi-vista en `detail/`

> NOTA: El render Blender `PB-ASSET-0026_valve-globe_3d.png` existe pero con ID incorrecto.

**PROMPT (copiar completo en Atoms):**
```
Realistic industrial valve photograph,
carbon steel or stainless steel with clean industrial finish,
neutral professional appearance conforming to ASME B16.34 and API 602 standards,
3/4 perspective view from slightly above,
soft diffused studio lighting from upper left,
dark technical background (#111111),
subtle contact shadow below the fitting,
high definition, sharp detail on metal surface texture,
no commercial brands, no text overlays, no labels,
no icons, no diagrams, no CAD symbols,
clean professional product photography style,
consistent with an industrial piping equipment catalog.
Visual reference: match the exact style of PB-ASSET-0001 (satin stainless steel, 3/4 view, dark background, studio lighting, no text).
Subject: globe valve with handwheel, flanged body, ASME B16.34.
Valve with a distinctly spherical or globe-shaped body (the body is rounder and bulkier than a gate valve). Flanged connections on both ends with visible bolt holes. Bolted bonnet. Rising stem with handwheel on top. The globe-shaped body is the key visual differentiator from the gate valve.
```
*Generar 5 variantes de encuadre: render (3/4 principal), front, side, top, 3q_alt.*

---

#### PB-ASSET-0012 — Check Valve (bridada)
**Archivo de salida:** `PB-ASSET-0012_valve-check_3d.png`
**Ruta de destino:** `brain/07-DESIGN/02-ASSETS/APPROVED/BIBLIOTECA_V1/hero/`
**Piezas a generar:** hero `_3d.png` + 5 multi-vista en `detail/`

> NOTA: El render Blender `PB-ASSET-0027_valve-check_3d.png` existe pero con ID incorrecto.

**PROMPT (copiar completo en Atoms):**
```
Realistic industrial valve photograph,
carbon steel or stainless steel with clean industrial finish,
neutral professional appearance conforming to ASME B16.34 and API 594 standards,
3/4 perspective view from slightly above,
soft diffused studio lighting from upper left,
dark technical background (#111111),
subtle contact shadow below the fitting,
high definition, sharp detail on metal surface texture,
no commercial brands, no text overlays, no labels,
no icons, no diagrams, no CAD symbols,
clean professional product photography style,
consistent with an industrial piping equipment catalog.
Visual reference: match the exact style of PB-ASSET-0001 (satin stainless steel, 3/4 view, dark background, studio lighting, no text).
Subject: swing check valve, flanged body, ASME B16.34.
Compact valve body with flanged connections on both ends (bolt holes visible). Bolted bonnet cover on top. NO handwheel, NO stem, NO lever — the valve is automatic (no manual operator). The absence of a handwheel is the key visual differentiator from gate and globe valves. Compact horizontal profile.
```
*Generar 5 variantes de encuadre: render (3/4 principal), front, side, top, 3q_alt.*

---

#### PB-ASSET-0013 — Ball Valve (bridada)
**Archivo de salida:** `PB-ASSET-0013_valve-ball_3d.png`
**Ruta de destino:** `brain/07-DESIGN/02-ASSETS/APPROVED/BIBLIOTECA_V1/hero/`
**Piezas a generar:** hero `_3d.png` + 5 multi-vista en `detail/`

> NOTA: El render Blender `PB-ASSET-0028_valve-ball_3d.png` existe pero con ID incorrecto.

**PROMPT (copiar completo en Atoms):**
```
Realistic industrial valve photograph,
carbon steel or stainless steel with clean industrial finish,
neutral professional appearance conforming to ASME B16.34 and API 608 standards,
3/4 perspective view from slightly above,
soft diffused studio lighting from upper left,
dark technical background (#111111),
subtle contact shadow below the fitting,
high definition, sharp detail on metal surface texture,
no commercial brands, no text overlays, no labels,
no icons, no diagrams, no CAD symbols,
clean professional product photography style,
consistent with an industrial piping equipment catalog.
Visual reference: match the exact style of PB-ASSET-0001 (satin stainless steel, 3/4 view, dark background, studio lighting, no text).
Subject: floating ball valve with lever handle, flanged body, ASME B16.34.
Compact valve body with flanged connections on both ends (bolt holes visible). Lever handle on top (NOT a handwheel — the lever is the key visual differentiator). The lever is typically flat and perpendicular to the flow direction when open. Compact body compared to gate and globe valves.
```
*Generar 5 variantes de encuadre: render (3/4 principal), front, side, top, 3q_alt.*

---

#### PB-ASSET-0014 — Butterfly Valve (wafer/lug)
**Archivo de salida:** `PB-ASSET-0014_valve-butterfly_3d.png`
**Ruta de destino:** `brain/07-DESIGN/02-ASSETS/APPROVED/BIBLIOTECA_V1/hero/`
**Piezas a generar:** hero `_3d.png` + 5 multi-vista en `detail/`

> NOTA: No existe ningun render Blender para butterfly valve. Asset completamente nuevo.

**PROMPT (copiar completo en Atoms):**
```
Realistic industrial valve photograph,
carbon steel or ductile iron with clean industrial finish,
neutral professional appearance conforming to ASME B16.34 standards,
3/4 perspective view from slightly above,
soft diffused studio lighting from upper left,
dark technical background (#111111),
subtle contact shadow below the fitting,
high definition, sharp detail on metal surface texture,
no commercial brands, no text overlays, no labels,
no icons, no diagrams, no CAD symbols,
clean professional product photography style,
consistent with an industrial piping equipment catalog.
Visual reference: match the exact style of PB-ASSET-0001 (satin stainless steel, 3/4 view, dark background, studio lighting, no text).
Subject: butterfly valve, wafer/lug body style.
Very thin disc-shaped valve body (significantly thinner than gate, globe, check or ball valves — this thinness is the key visual differentiator). Wafer or lug body with through-holes or lugs for bolting between flanges. Lever or gear actuator on top. The disc (butterfly plate) may be partially visible through the body opening. The extreme thinness of the body compared to other valves must be immediately apparent.
```
*Generar 5 variantes de encuadre: render (3/4 principal), front, side (mostrando el perfil delgado), top, 3q_alt.*

---

### PRIORIDAD 2 — Filtro Y

---

#### PB-ASSET-0015 — Filtro Y (Y-Strainer, bridada)
**Archivo de salida:** `PB-ASSET-0015_y-strainer_3d.png`
**Ruta de destino:** `brain/07-DESIGN/02-ASSETS/APPROVED/BIBLIOTECA_V1/hero/`
**Piezas a generar:** hero `_3d.png` + 5 multi-vista en `detail/`

> NOTA: El render Blender `PB-ASSET-0029_y-strainer_3d.png` existe pero con ID incorrecto.

**PROMPT (copiar completo en Atoms):**
```
Realistic industrial pipe component photograph,
cast steel or stainless steel with clean industrial finish,
neutral professional appearance conforming to industry standards,
3/4 perspective view from slightly above,
soft diffused studio lighting from upper left,
dark technical background (#111111),
subtle contact shadow below the fitting,
high definition, sharp detail on metal surface texture,
no commercial brands, no text overlays, no labels,
no icons, no diagrams, no CAD symbols,
clean professional product photography style,
consistent with an industrial piping equipment catalog.
Visual reference: match the exact style of PB-ASSET-0001 (satin stainless steel, 3/4 view, dark background, studio lighting, no text).
Subject: Y-type strainer, flanged connections.
Y-shaped body with two flanged connections on the main run (in and out, with visible bolt holes) and one angled branch pointing downward at approximately 45 degrees (the strainer basket housing). The angled branch has a removable end cap or cover. The Y-shape is the unmistakable visual identifier.
```
*Generar 5 variantes de encuadre: render (3/4 principal), front, side (mostrando la rama Y), top, 3q_alt.*

---

#### PB-ASSET-0020 — Spectacle Blind (Ciego de linea)
**Archivo de salida:** `PB-ASSET-0020_spectacle-blind_3d.png`
**Ruta de destino:** `brain/07-DESIGN/02-ASSETS/APPROVED/BIBLIOTECA_V1/hero/`
**Piezas a generar:** hero `_3d.png` + 5 multi-vista en `detail/`

> NOTA: El render Blender `PB-ASSET-0024_spectacle-blind_3d.png` existe pero con ID incorrecto.

**PROMPT (copiar completo en Atoms):**
```
Realistic industrial pipe fitting photograph,
stainless steel or carbon steel with clean industrial finish,
neutral professional appearance conforming to ASME B16.48 standards,
3/4 perspective view from slightly above,
soft diffused studio lighting from upper left,
dark technical background (#111111),
subtle contact shadow below the fitting,
high definition, sharp detail on metal surface texture,
no commercial brands, no text overlays, no labels,
no icons, no diagrams, no CAD symbols,
clean professional product photography style,
consistent with an industrial piping equipment catalog.
Visual reference: match the exact style of PB-ASSET-0001 (satin stainless steel, 3/4 view, dark background, studio lighting, no text).
Subject: spectacle blind, figure-8 blind, ASME B16.48.
Flat metal plate with a figure-8 or spectacles shape: two circular sections connected by a central bar. One circular section is a solid disc (the blind plate, for blocking flow). The other circular section is an open ring (the spacer, for allowing flow). Bolt holes around each circular section. The piece is thin and flat. Both the solid disc and the open ring must be clearly visible.
```
*Generar 5 variantes de encuadre: render (3/4 principal), front (mostrando la forma de gafas), side (mostrando el perfil plano), top, 3q_alt.*

---

### PRIORIDAD 3 — Olets y roscados

---

#### PB-ASSET-0016 — Weldolet (BW outlet)
**Archivo de salida:** `PB-ASSET-0016_weldolet_3d.png`
**Ruta de destino:** `brain/07-DESIGN/02-ASSETS/APPROVED/BIBLIOTECA_V1/hero/`
**Piezas a generar:** hero `_3d.png` + 5 multi-vista en `detail/`

> NOTA: El render Blender `PB-ASSET-0021_weldolet_3d.png` existe pero con ID incorrecto.

**PROMPT (copiar completo en Atoms):**
```
Realistic industrial pipe fitting photograph,
stainless steel with satin sandblasted finish,
neutral professional appearance conforming to MSS SP-97 standards,
3/4 perspective view from slightly above,
soft diffused studio lighting from upper left,
dark technical background (#111111),
subtle contact shadow below the fitting,
high definition, sharp detail on metal surface texture,
no commercial brands, no text overlays, no labels,
no icons, no diagrams, no CAD symbols,
clean professional product photography style,
consistent with an industrial piping equipment catalog.
Visual reference: match the exact style of PB-ASSET-0001 (satin stainless steel, 3/4 view, dark background, studio lighting, no text).
Subject: weldolet branch connection fitting, MSS SP-97.
Self-reinforced branch outlet fitting. Contoured saddle-shaped base that curves to match the outside diameter of a run pipe. Branch outlet on top with a BEVELED end (butt weld connection — NOT a socket, NOT threaded). The beveled butt weld outlet is the key visual differentiator from sockolet and threadolet.
QA CHECK: The outlet end must show a beveled edge (butt weld), not a socket cavity or threads.
```
*Generar 5 variantes de encuadre: render (3/4 principal), front, side (mostrando la base contorneada), top, 3q_alt.*

---

#### PB-ASSET-0017 — Sockolet (SW outlet)
**Archivo de salida:** `PB-ASSET-0017_sockolet_3d.png`
**Ruta de destino:** `brain/07-DESIGN/02-ASSETS/APPROVED/BIBLIOTECA_V1/hero/`
**Piezas a generar:** hero `_3d.png` + 5 multi-vista en `detail/`

> NOTA: No existe ningun render Blender para sockolet. Asset completamente nuevo.

**PROMPT (copiar completo en Atoms):**
```
Realistic industrial pipe fitting photograph,
stainless steel with satin sandblasted finish,
neutral professional appearance conforming to MSS SP-97 standards,
3/4 perspective view from slightly above,
soft diffused studio lighting from upper left,
dark technical background (#111111),
subtle contact shadow below the fitting,
high definition, sharp detail on metal surface texture,
no commercial brands, no text overlays, no labels,
no icons, no diagrams, no CAD symbols,
clean professional product photography style,
consistent with an industrial piping equipment catalog.
Visual reference: match the exact style of PB-ASSET-0001 (satin stainless steel, 3/4 view, dark background, studio lighting, no text).
Subject: sockolet branch connection fitting, socket weld outlet, MSS SP-97.
Self-reinforced branch outlet fitting similar to a weldolet in its contoured saddle base. Branch outlet on top with a SOCKET WELD connection: a cylindrical cavity (socket) into which a small pipe is inserted before welding. The socket cavity (cylindrical hole) at the top is the key visual differentiator from the weldolet (beveled) and threadolet (threaded).
QA CHECK: The outlet end must show a cylindrical socket cavity (socket weld), not a beveled edge or threads.
```
*Generar 5 variantes de encuadre: render (3/4 principal), front, side, top, 3q_alt.*

---

#### PB-ASSET-0018 — Threadolet (roscado outlet)
**Archivo de salida:** `PB-ASSET-0018_threadolet_3d.png`
**Ruta de destino:** `brain/07-DESIGN/02-ASSETS/APPROVED/BIBLIOTECA_V1/hero/`
**Piezas a generar:** hero `_3d.png` + 5 multi-vista en `detail/`

> NOTA: No existe ningun render Blender para threadolet. Asset completamente nuevo.

**PROMPT (copiar completo en Atoms):**
```
Realistic industrial pipe fitting photograph,
stainless steel with satin sandblasted finish,
neutral professional appearance conforming to MSS SP-97 standards,
3/4 perspective view from slightly above,
soft diffused studio lighting from upper left,
dark technical background (#111111),
subtle contact shadow below the fitting,
high definition, sharp detail on metal surface texture,
no commercial brands, no text overlays, no labels,
no icons, no diagrams, no CAD symbols,
clean professional product photography style,
consistent with an industrial piping equipment catalog.
Visual reference: match the exact style of PB-ASSET-0001 (satin stainless steel, 3/4 view, dark background, studio lighting, no text).
Subject: threadolet branch connection fitting, threaded outlet, MSS SP-97.
Self-reinforced branch outlet fitting similar to weldolet and sockolet in its contoured saddle base. Branch outlet on top with INTERNAL FEMALE THREADS (NPT threaded connection). The thread helix pattern inside the outlet bore is the key visual differentiator from weldolet (beveled) and sockolet (socket). The threads should be visible or strongly suggested inside the outlet opening.
QA CHECK: The outlet end must show internal thread helix pattern (threaded connection), not a beveled edge or socket cavity.
```
*Generar 5 variantes de encuadre: render (3/4 principal), front, side, top, 3q_alt.*

---

#### PB-ASSET-0019 — Tee roscada
**Archivo de salida:** `PB-ASSET-0019_tee-threaded_3d.png`
**Ruta de destino:** `brain/07-DESIGN/02-ASSETS/APPROVED/BIBLIOTECA_V1/hero/`
**Piezas a generar:** hero `_3d.png` + 5 multi-vista en `detail/`

> NOTA: No existe ningun render Blender para tee roscada. Asset completamente nuevo.

**PROMPT (copiar completo en Atoms):**
```
Realistic industrial pipe fitting photograph,
forged steel with clean machined finish,
neutral professional appearance conforming to ASME B16.11 standards,
3/4 perspective view from slightly above,
soft diffused studio lighting from upper left,
dark technical background (#111111),
subtle contact shadow below the fitting,
high definition, sharp detail on metal surface texture,
no commercial brands, no text overlays, no labels,
no icons, no diagrams, no CAD symbols,
clean professional product photography style,
consistent with an industrial piping equipment catalog.
Visual reference: match the exact style of PB-ASSET-0001 (satin stainless steel, 3/4 view, dark background, studio lighting, no text).
Subject: threaded tee fitting, small bore forged steel, ASME B16.11.
T-shaped fitting with three threaded connections (female NPT threads). More compact and thicker-walled than a butt weld tee. The body is heavier and shorter relative to its diameter. Internal female threads visible or suggested at all three openings. Clearly different from a butt weld tee: no beveled ends, thicker walls, smaller overall size.
```
*Generar 5 variantes de encuadre: render (3/4 principal), front, side, top, 3q_alt.*

---

## PARTE 4 — ESPECIFICACIONES DE EXPORTACION

### Formato de archivo

- **Formato preferido:** PNG con fondo oscuro integrado (#111111), o WebP.
- **Alternativa:** PNG con fondo transparente si se necesita adaptar a la UI.
- **Resolucion minima:** 1024x1024 para hero y detail. 512x512 para card. 128x128 para mobile.

### Variantes por asset

Generar 3 variantes de cada asset sin alterar la geometria ni el estilo:

| Variante | Uso | Resolucion | Fondo |
|---|---|---|---|
| `_3d.png` (hero) | Tarjeta de categoria en la biblioteca | 1024x1024 | #111111 |
| `_render.png` (detail) | Pagina de detalle del accesorio | 1024x1024 | #111111 |
| `_front.png` | Vista frontal para ficha tecnica | 1024x1024 | #111111 |
| `_side.png` | Vista lateral para ficha tecnica | 1024x1024 | #111111 |
| `_top.png` | Vista superior para ficha tecnica | 1024x1024 | #111111 |
| `_3q_alt.png` | Perspectiva 3/4 alternativa | 1024x1024 | #111111 |

### Nomenclatura de archivos

```
PB-ASSET-0007_flange-wn_3d.png          ← hero (en hero/)
PB-ASSET-0007_flange-wn_render.png      ← render principal (en detail/)
PB-ASSET-0007_flange-wn_front.png       ← vista frontal (en detail/)
PB-ASSET-0007_flange-wn_side.png        ← vista lateral (en detail/)
PB-ASSET-0007_flange-wn_top.png         ← vista superior (en detail/)
PB-ASSET-0007_flange-wn_3q_alt.png      ← 3/4 alternativo (en detail/)
```

Patron: `{ID}_{slug}_{variante}.{extension}`

---

## PARTE 5 — CHECKLIST QA POR ASSET

Antes de aprobar cada asset, verificar:

| # | Verificacion | Criterio |
|---|---|---|
| 1 | Componente correcto | El accesorio representado coincide con su nombre |
| 2 | Conexion correcta | BW, SW, roscada, bridada o wafer/lug segun la tabla |
| 3 | Sin texto | Ningun texto, numero o grabado sobre la pieza |
| 4 | Bridas con taladros | Si es bridada, los taladros son visibles y coherentes |
| 5 | Valvulas diferenciables | Gate, Globe, Check, Ball y Butterfly son distintas entre si |
| 6 | Olets diferenciables | Weldolet (BW), Sockolet (SW) y Threadolet (rosca) se distinguen |
| 7 | Estilo coherente | Mismo material, fondo, luz y perspectiva que PB-ASSET-0001 |
| 8 | Legible en movil | Reconocible a tamano de tarjeta pequena |
| 9 | Contraste dark mode | La pieza se distingue del fondo en modo oscuro |
| 10 | Gate Valve bridada | Asset 0010 muestra bridas, no SW ni roscada |
| 11 | ID correcto | El nombre de archivo usa el ID canonico del ASSET_SET.md |

---

## PARTE 6 — SECUENCIA DE EJECUCION RECOMENDADA

1. Generar primero los 19 heroes `_3d.png` faltantes (prioridad 1: valvulas y BW fittings).
2. QA contra checklist Parte 5 — especialmente puntos 1, 2, 5, 6, 10, 11.
3. Corregir los assets que no pasen QA.
4. Generar las 95 multi-vista (19 assets x 5 vistas) para `detail/`.
5. Registrar rutas finales en el indice de assets.
6. Presentar capturas desktop y mobile al Product Owner.

---

## RESTRICCIONES FINALES

- No redisenar como iconos lineales.
- No usar fotografias de stock de fabricantes reales.
- No cambiar el tipo de conexion durante la implementacion.
- No fusionar tees iguales y reductoras en un mismo visual.
- No usar los IDs de los renders Blender (0006–0029) como IDs canonicos — usar siempre los IDs del ASSET_SET.md.
- Terminologia obligatoria: `eje` (no `centro de tubo`), `eje a extremo`, `avance`, `descuento`, `longitud de corte`, `cara a cara`.
