# PB-ASSET-FICHA-MOCKUP-001 — Prompt Técnico para Atoms

**Ticket relacionado:** PB-DESIGN-0015  
**Estado:** Architecture Review APROBADO  
**Versión:** 1.0.0  
**Fecha:** 2026-07-19  
**Responsable de arquitectura:** Verdent  
**Destinatario:** Atoms  

---

## 1. OBJETIVO

Generar un **mockup visual de alta fidelidad** de la ficha técnica de un accesorio de tubería, usando como caso piloto el **Codo 90° LR BW ASME B16.9**.

El mockup debe servir como **referencia visual definitiva** para la implementación de la ficha en la Biblioteca de Accesorios V1.

---

## 2. FUENTES OBLIGATORIAS (no reinterpretar)

1. `07-DESIGN/01-DESIGN_SYSTEM/STYLE_GUIDE.md`
2. `07-DESIGN/01-DESIGN_SYSTEM/DESIGN_SYSTEM.md`
3. `07-DESIGN/03-COMPONENTS/PB-COMP-0001_Accessory_Card.md`
4. `07-DESIGN/03-COMPONENTS/PB-COMP-0002_Technical_Table.md`
5. `07-DESIGN/06-HANDOFF/VERDENT/BIBLIOTECA_DEFINITIVA_V1.md` sección 2.7

---

## 3. CONTEXTO DEL ACCESORIO PILOTO

| Campo | Valor |
|---|---|
| Nombre técnico | Codo 90° LR BW |
| ID PIDM | PB-COMP-ELBOW-90-LR-BW-ASME-B16-9 |
| Familia | Butt Weld |
| Tipo | Elbow |
| Conexión | BW |
| Norma | ASME B16.9 |
| Estado | approved |

**Datos de ejemplo para la tabla resumen:**

| NPS | DN | OD (mm) | WT (mm) | A (mm) |
|---|---|---|---|---|
| 2" | 50 | 60.33 | 3.91 | 76.20 |
| 3" | 80 | 88.90 | 5.49 | 114.30 |
| 4" | 100 | 114.30 | 6.02 | 152.40 |
| 6" | 150 | 168.28 | 7.11 | 228.60 |

---

## 4. ESTRUCTURA DE LA FICHA A DISEÑAR

### 4.1 Zona A — Cabecera fija

Debe contener, de izquierda a derecha / de arriba a abajo:

1. **Breadcrumb:** `Biblioteca / Butt Weld / Elbows`
2. **Título principal:** `Codo 90° LR BW`
3. **Subtítulo / ID:** `PB-COMP-ELBOW-90-LR-BW-ASME-B16-9`
4. **Badge de estado:** `APROBADO` (color verde discreto, no neón)
5. **Selector de unidades:** toggle `[Métrico | Imperial]` con `Métrico` activo
6. **Miniatura principal:** imagen del codo 90° LR BW (asset detail), fondo #111, 1:1

### 4.2 Zona B — Pestañas

Mostrar las pestañas en estado desktop:

```
[Vista Rápida] [Dimensiones] [Normativa] [Compatibilidades] [Descargas]
```

`Vista Rápida` debe aparecer activa.

### 4.3 Contenido de "Vista Rápida" (Modo Obra default)

| Bloque | Descripción |
|---|---|
| Imagen principal | Asset detail del codo, grande, a la izquierda (desktop) o arriba (mobile) |
| Datos clave | NPS 2" / DN 50 · OD 60.33 mm · Conexión BW · Radio LR 1.5D |
| Tabla resumen | 4 filas con schedules comunes (ver sección 3) |
| Acordeón colapsado | "Consejo del tubero" con texto: "No usar en líneas de alto pulso sin análisis adicional." |
| Botón primario | "Ver ficha completa" (Modo Ingeniería) |

### 4.4 Contenido de "Dimensiones" (segunda pestaña, boceto)

Mostrar un boceto parcial o indicativo de esta pestaña:

- Selector NPS: dropdown con "2" seleccionado.
- Selector Schedule: dropdown con "Sch 40" seleccionado.
- Tabla completa con columnas: NPS, DN, OD, WT, A (centro a extremo), Radio LR.
- Plano técnico 2D placeholder con leyenda "Plano técnico SVG".
- Área reservada para modelo 3D con leyenda "Modelo 3D — disponible en MVP 2".

### 4.5 Contenido de "Compatibilidades" (boceto)

Lista jerárquica:

```
Este codo se conecta con:
├── Pipe (BW)        → ver tabla de schedules
├── Flange (WN/SO)   → clases 150 / 300 / 600
├── Valve (BW)       → tipos compatibles
└── Gasket           → según rating
```

### 4.6 Modo Obra vs Modo Ingeniería

El mockup principal debe representar **Modo Obra**.

Incluir una **segunda variante** del mismo layout en **Modo Ingeniería**, con todas las pestañas visibles y la pestaña "Dimensiones" activa.

---

## 5. ESPECIFICACIONES VISUALES

### Paleta (obligatoria)

| Elemento | Valor |
|---|---|
| Fondo página | `#0a0a0a` |
| Fondo card | `#0d0d0d` |
| Fondo asset | `#111111` |
| Texto primario | `#f4f4f5` (zinc-100) |
| Texto secundario | `#a1a1aa` (zinc-400) |
| Texto terciario | `#71717a` (zinc-500) |
| Borde | `rgba(255,255,255,0.08)` (zinc-800/80) |
| Accent | `#f59e0b` (amber-500) |
| Accent hover | `#d97706` (amber-600) |
| Éxito / approved | `#22c55e` (green-500) |
| Fila hover tabla | `rgba(255,255,255,0.05)` |

### Tipografía

- Títulos: Inter, sans-serif, semibold.
- Datos técnicos: JetBrains Mono o similar, font-mono.
- Body: Inter, sans-serif.

### Layout desktop

```
┌─────────────────────────────────────────────────────────────────────┐
│ Breadcrumb                                                          │
│ Codo 90° LR BW                                       [Métrico|Imperial]
│ PB-COMP-ELBOW-90-LR-BW-ASME-B16-9    [APROBADO]                    │
├─────────────────────────────────────────────────────────────────────┤
│ [Vista Rápida] [Dimensiones] [Normativa] [Compatibilidades] [Descargas]│
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌───────────────┐   NPS 2" / DN 50                                │
│  │               │   OD 60.33 mm · BW · LR 1.5D                    │
│  │   Imagen      │                                                 │
│  │   codo BW     │   TABLA RESUMEN                                 │
│  │   detail      │   NPS | DN | OD | WT | A                        │
│  │               │   2"  | 50 | 60.33| 3.91| 76.20                 │
│  │  512x512      │   3"  | 80 | 88.90| 5.49| 114.30                │
│  │               │   4"  |100 |114.30| 6.02| 152.40                │
│  │               │   6"  |150 |168.28| 7.11| 228.60                │
│  └───────────────┘                                                 │
│                                                                     │
│  [▼] Consejo del tubero                                             │
│      No usar en líneas de alto pulso sin análisis adicional.        │
│                                                                     │
│  [Ver ficha completa]                                               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Layout mobile

- Cabecera apilada.
- Imagen a ancho completo.
- Pestañas transformadas en acordeón vertical.
- Tabla con scroll horizontal.

---

## 6. RESTRICCIONES ABSOLUTAS

1. **No reinterpretar el estilo visual.** Seguir STYLE_GUIDE.md y DESIGN_SYSTEM.md al pie de la letra.
2. **No usar iconos lineales como imagen principal.** La imagen principal debe ser realista.
3. **No incluir logos ni marcas de fabricante.**
4. **No incluir texto comercial ni normas grabadas sobre la pieza.**
5. **No mostrar todas las columnas dimensionales por defecto.** Tabla resumen limitada a 4-5 columnas.
6. **No inventar funcionalidades no aprobadas.** Respetar MVP 1 y secciones diferidas.
7. **La pestaña Uso no va en la barra principal.** Va como acordeón dentro de Vista Rápida.

---

## 7. ENTREGABLES ESPERADOS

1. Mockup desktop Modo Obra (PNG/WebP, 1440×900 mínimo).
2. Mockup desktop Modo Ingeniería (PNG/WebP, 1440×900 mínimo).
3. Mockup mobile Modo Obra (PNG/WebP, 375×812 mínimo).
4. Archivo fuente editable (Figma/Sketch/PSD) si es posible.

Guardar en:

```text
07-DESIGN/02-ASSETS/REVIEW/BIBLIOTECA_V1/
├── PB-ASSET-FICHA-MOCKUP-001_desktop_obra.png
├── PB-ASSET-FICHA-MOCKUP-001_desktop_ingenieria.png
├── PB-ASSET-FICHA-MOCKUP-001_mobile_obra.png
└── PB-ASSET-FICHA-MOCKUP-001.fig (o fuente equivalente)
```

---

## 8. CHECKLIST DE QA PARA ATOMS

| # | Verificación | Criterio |
|---|---|---|
| 1 | Estilo coherente | Coincide con STYLE_GUIDE.md y DESIGN_SYSTEM.md |
| 2 | Accesorio correcto | Se reconoce como codo 90° LR BW |
| 3 | Modo Obra default | La vista inicial es la simplificada |
| 4 | Miniatura = asset detail | Imagen realista, fondo #111 |
| 5 | Selector de unidades visible | Toggle Métrico/Imperial |
| 6 | Tabla resumen limitada | Máximo 4-5 columnas |
| 7 | Uso como acordeón | No aparece como pestaña principal |
| 8 | Sin logos ni marcas | Pieza limpia |
| 9 | Responsive contemplado | Versión mobile incluida |
| 10 | Layout desktop claro | Imagen + datos + tabla + CTA |

---

*Prompt generado por Verdent como Architecture Reviewer. No debe modificarse sin nueva revisión arquitectónica.*
