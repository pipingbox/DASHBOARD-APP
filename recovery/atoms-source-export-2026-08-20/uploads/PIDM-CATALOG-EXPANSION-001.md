# PIDM-CATALOG-EXPANSION-001 — Expansion del Catalogo PIDM a Gran Escala

> **Estado:** EXECUTING
> **Prioridad:** P0
> **Dominio:** Catalog / PIDM
> **Agente:** Verdent
> **Fecha creacion:** 2026-07-25
> **Origen:** PO directive post PIDM-MIGRATION-001

---

## Objetivo

Completar la cobertura del catalogo PIDM con todas las normas, componentes y validaciones cruzadas necesarias para que el catalogo sea autosuficiente y verificable.

## Lineas de trabajo

### Fase A — Standards + Migration | DONE

| # | Tarea | Archivos | Estado | Commit |
|---|-------|----------|--------|--------|
| A1 | Crear PB-STD para B16.5, B16.11, B16.20, B16.48 | 4 YAML | DONE | `51e29a4` |
| A2 | Crear PB-STD para MSS-SP-97 | 1 YAML | DONE | `51e29a4` |
| A3 | Crear PB-STD para API-594, API-600, API-602, API-608 | 4 YAML | DONE | `51e29a4` |
| A4 | Crear PB-STD-MANUFACTURER-GENERIC (placeholder) | 1 YAML | DONE | `51e29a4` |
| A5 | Migrar 28 PB-COMP a formato PIDM-001 | 28 YAML | DONE | `51e29a4` |
| A6 | Cross-validation: PB-DIM -> PB-COMP + PB-STD | Script | DONE | 184 PASS 0 FAIL |

### Fase B — Expansion de familias | DONE

| # | Tarea | Resultado | Estado | Commit |
|---|-------|-----------|--------|--------|
| B1 | SW fittings: tee, coupling, half-coupling, cap, union | 5 COMP + 5 DIM | DONE | `de87d0d` |
| B2 | THD fittings: tee, coupling, union, bushing, cap | 5 COMP + 5 DIM | DONE | `de87d0d` |
| B3 | Flanges: SO, BL, SW, THD, LJ (Class 150) | 5 COMP + 5 DIM | DONE | `de87d0d` |
| B4 | Olets: sockolet, thredolet, elbolet, latrolet, nipolet | 5 COMP + 5 DIM | DONE | `de87d0d` |
| B5 | Cross-validation expandida | 304 PASS 0 FAIL 21 WARN | DONE | `de87d0d` |

### Fase C — Supabase + Frontend | DONE

| # | Tarea | Resultado | Estado | Commit |
|---|-------|-----------|--------|--------|
| C1 | Migration SQL (4 tablas + RLS + 3 RPC + triggers) | `supabase_migration.sql` | DONE | `84437a8` |
| C2 | Loader YAML -> Supabase | 11 STD + 48 COMP + 48 DIM sets + 799 dim rows | DONE | `9f9fdfd` |
| C3 | IndexedDB cache layer (offline-first) | `catalogCache.ts` | DONE | frontend `acf9ca9` |
| C4 | useCatalog hooks (TanStack Query + delta sync) | 6 hooks | DONE | frontend `acf9ca9` |
| C5 | Tipos TS + adapters PIDM -> FittingEntry/FlangeSpec | `catalogTypes.ts` | DONE | frontend `acf9ca9` |
| C6 | Refactorizar AccessoriesLibrary + FlangeLibrary + PipeDataTables | Fallback graceful | DONE | frontend `8d51ed6` |
| C7 | Documentacion tecnica | `CATALOG_API.md` | DONE | `84437a8` |

### Fase D — Pendiente (requiere ampliacion de datos)

| # | Tarea | Notas | Estado |
|---|-------|-------|--------|
| D1 | Tuberia: PB-DIM-PIPE schedules (B36.10M/B36.19M) | OD, WT, peso por schedule | PENDING |
| D2 | Flanges multi-class (300, 600, 900, 1500, 2500) | 5 clases x 5 tipos x 19 sizes | PENDING |
| D3 | Valvulas multi-class (300, 600) | Ampliar gate, globe, ball, check | PENDING |
| D4 | Juntas completas (spiral wound, ring joint) | Faltan tipos | PENDING |
| D5 | Tornilleria clases adicionales | Solo hay Class 150 | PENDING |
| D6 | Materials + schedules + ratings | Nuevas entidades | PENDING |
| D7 | Equivalencias ASME <> DIN/EN | Fase 3 | PENDING |

## Metricas actuales

| Metrica | Valor |
|---------|-------|
| PB-STD (normas) | 11 |
| PB-COMP (componentes) | 48 |
| PB-DIM (conjuntos dimensionales) | 48 |
| Filas dimensionales en Supabase | 799 |
| Cross-validation PASS | 304 |
| Cross-validation FAIL | 0 |
| Cross-validation WARN | 21 (normas secundarias sin PB-STD propio) |
| Snapshot Supabase | 627 KB |
| Frontend source | PIDM con fallback hardcoded |

## Acceptance criteria (Fase A) — CUMPLIDOS

- [x] 11 PB-STD validan contra standard.schema.yaml
- [x] 48 PB-COMP validan contra component.schema.yaml
- [x] Cross-validation: cada PB-DIM referencia PB-COMP y PB-STD existentes — 0 broken refs
- [x] cross_validate.js reporta 0 FAIL

## Acceptance criteria (Fase C) — CUMPLIDOS

- [x] 4 tablas PostgreSQL en Supabase (pidm_standards, pidm_components, pidm_dimension_sets, pidm_dimensions)
- [x] RLS public read configurado
- [x] 3 RPC functions operativas (get_catalog_snapshot, get_dimensions, get_components_by_category)
- [x] 799 filas dimensionales cargadas y verificadas
- [x] Frontend conectado con fallback graceful
- [x] IndexedDB offline cache funcional
- [x] CATALOG_API.md documentado
