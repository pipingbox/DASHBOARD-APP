# ATOMS PROMPT — Verificar e Integrar Biblioteca de Accesorios

> Ejecutar en el directorio: `DASHBOARD-APP/app/frontend`
> Rama activa: `fix/profile-visibility-completion-upload`

---

## Contexto

Se ha implementado una nueva herramienta llamada **Biblioteca de Accesorios** que reemplaza la antigua "Fitting Take-Off" en el catálogo de Herramientas de PipingBox. Los archivos ya existen en el repo:

### Archivos de datos (ya creados):
- `src/lib/fittingsData/types.ts` — Tipos base + FITTING_CATEGORIES (14 categorías, todas available: true)
- `src/lib/fittingsData/elbows.ts` — Codos BW ASME B16.9
- `src/lib/fittingsData/tees.ts` — Tés BW ASME B16.9
- `src/lib/fittingsData/reducers.ts` — Reducciones BW ASME B16.9
- `src/lib/fittingsData/caps.ts` — Caps BW ASME B16.9
- `src/lib/fittingsData/valves.ts` — Válvulas ASME B16.10
- `src/lib/fittingsData/flanges.ts` — Bridas WN/SO/BL ASME B16.5
- `src/lib/fittingsData/studBolts.ts` — Pernos y tuercas ASME B16.5
- `src/lib/fittingsData/gaskets.ts` — Juntas SWG ASME B16.20
- `src/lib/fittingsData/stubEnds.ts` — Stub Ends ASME B16.9
- `src/lib/fittingsData/olets.ts` — Weldolet/Sockolet/Thredolet MSS SP-97
- `src/lib/fittingsData/fittingSW.ts` — Accesorios Socket Weld ASME B16.11
- `src/lib/fittingsData/fittingThreaded.ts` — Accesorios roscados ASME B16.11
- `src/lib/fittingsData/specials.ts` — Discos ciegos ASME B16.48 + Filtros Y MSS SP-59
- `src/lib/fittingsData/index.ts` — Re-exports centralizados

### Componente principal (ya creado):
- `src/components/tools/AccessoriesLibrary.tsx` — Grid de 14 categorías + vista detalle con tablas

### Registry (ya actualizado):
- `src/lib/toolRegistry.ts` — Entry `accessories-library` con `React.lazy(() => import('@/components/tools/AccessoriesLibrary'))`, icono `Library` de lucide-react

### i18n (ya actualizado):
- `src/i18n/locales/es.json` — Keys `tools.accessories.*` con 14 categorías
- `src/i18n/locales/en.json` — Keys `tools.accessories.*` con 14 categorías

---

## Tarea para Atoms

### 1. Verificar que todo compila

```bash
npx tsc --noEmit --skipLibCheck
```

### 2. Verificar que la herramienta aparece en el catálogo

Revisar `src/pages/Tools.tsx`:
- Debe importar y usar `TOOL_REGISTRY` de `@/lib/toolRegistry`
- El componente activo debe renderizarse con `<activeDef.component />` dentro de `<Suspense>`
- Si Tools.tsx NO usa el toolRegistry, actualizarlo para que lo haga

Revisar `src/pages/ToolsPublic.tsx`:
- Debe importar `PUBLIC_TOOLS` de `@/lib/toolRegistry`
- `accessories-library` tiene `isPublic: true`, así que debe aparecer también en `/free-tools`

### 3. Verificar navegación

Revisar `src/App.tsx`:
- Debe existir la ruta `/tools` que renderiza `<Tools />`
- Debe existir la ruta `/free-tools` que renderiza `<ToolsPublic />`
- Si alguna ruta falta, agregarla

### 4. Verificar que el menú lateral incluye "Herramientas"

Revisar el componente de navegación/sidebar:
- Buscar dónde se define el menú lateral (probablemente `AppShell.tsx`, `Sidebar.tsx` o similar)
- Verificar que existe un link a `/tools` con label "Herramientas"/"Tools"
- Si falta, agregarlo con icono `Wrench` de lucide-react

### 5. Si algo falta, corregirlo

El objetivo es que al navegar a Herramientas, la "Biblioteca de Accesorios" aparezca en el catálogo con badge NEW, y al hacer click muestre el grid de 14 categorías de accesorios.

### 6. Verificar resultado final

```bash
npx tsc --noEmit --skipLibCheck
npm run build
```

---

## Decisión de producto (referencia)

La Biblioteca de Accesorios es el punto único para consultar dimensiones y avances de accesorios de piping para prefabricación. El dato más importante es el **avance** (cuánto suma cada accesorio al largo total de la prefabricación). Este dato se muestra destacado en color amber (#f59e0b).

Las 14 categorías son:
1. Codos BW (90° LR/SR, 45° LR)
2. Tés BW (Equal, Reducing)
3. Reducciones BW (Concéntrica, Excéntrica)
4. Caps BW
5. Válvulas (Gate, Globe, Check — cl. 150/300/600)
6. Bridas (WN, SO, Blind — cl. 150/300)
7. Pernos y Tuercas (cl. 150/300)
8. Juntas SWG (cl. 150/300)
9. Stub Ends
10. Olets (Weldolet, Sockolet, Thredolet)
11. Accesorios SW (Codos, Tés, Couplings)
12. Accesorios Roscados (Codos, Tés, Couplings, Nipples)
13. Discos Ciegos (cl. 150/300)
14. Filtros en Y

Esta herramienta reemplaza la antigua "Fitting Take-Off" (`fitting-takeoff`) en el catálogo.
