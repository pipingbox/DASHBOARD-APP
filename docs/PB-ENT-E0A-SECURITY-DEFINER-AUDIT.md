# PB-ENT-E0A — Auditoría SECURITY DEFINER (Company Core)

**Fecha:** 2026-10-23 · **Ámbito:** sql/058 + sql/059 · **Base:** main `5ab08ea` + rama E0a `1063e30`
**Addendum 2026-10-24:** ámbito ampliado a **sql/060** (PO review PR #98) — ver §5.

## 1. Inventario SECURITY DEFINER

14 funciones `SECURITY DEFINER` en Company Core:

| Función | Tipo | search_path fijo | EXECUTE authenticated | EXECUTE anon/PUBLIC | Validación interna actor |
|---|---|---|---|---|---|
| `pb_company_role` | helper (STABLE) | ✅ `public, pg_temp` | ✅ | ❌ | implícita (`auth.uid()`) |
| `pb_is_company_member` | helper (STABLE) | ✅ | ✅ | ❌ | implícita |
| `pb_is_company_admin_or_owner` | helper (STABLE) | ✅ | ✅ | ❌ | implícita |
| `pb_company_audit` | auditoría | ✅ | ❌ **revocado** | ❌ | solo invocable por otros RPCs |
| `pb_company_create` | mutación | ✅ | ✅ | ❌ | `auth.uid()` + not_authenticated |
| `pb_company_invite` | mutación | ✅ | ✅ | ❌ | `auth.uid()` + rol owner/admin |
| `pb_company_invitation_accept` | mutación | ✅ | ✅ | ❌ | `auth.uid()` + token hash + destinatario |
| `pb_company_invitation_reject` | mutación | ✅ | ✅ | ❌ | `auth.uid()` + token hash |
| `pb_company_invitation_revoke` | mutación | ✅ | ✅ | ❌ | `auth.uid()` + rol owner/admin |
| `pb_company_member_change_role` | mutación | ✅ | ✅ | ❌ | `auth.uid()` + rol + lock empresa (E0a) |
| `pb_company_member_remove` | mutación | ✅ | ✅ | ❌ | `auth.uid()` + rol + lock empresa (E0a) |
| `pb_company_transfer_ownership` | mutación | ✅ | ✅ | ❌ | `auth.uid()` + rol owner + lock empresa (E0a) |
| `pb_company_members` | lectura (STABLE) | ✅ | ✅ | ❌ | `pb_is_company_member` interno |
| `pb_company_my_context` | lectura (STABLE) | ✅ | ✅ | ❌ | `auth.uid()` en WHERE |

Verificado contra la DB de test (PostgreSQL 17, `pg_proc.proconfig` + `aclexplode(proacl)`): las 14 tienen `search_path=public, pg_temp` y ninguna tiene EXECUTE a `PUBLIC`/`anon`.

## 2. Findings estilo Security Advisors (análisis estático)

### F1 — `SECURITY DEFINER` ejecutable por `authenticated` (13 funciones)

- **Finding:** las funciones SECURITY DEFINER con GRANT EXECUTE a `authenticated` son invocables vía PostgREST/Data API por cualquier usuario autenticado.
- **Exposición real:** el endpoint RPC existe, pero cada función valida internamente al actor (`auth.uid()`), la empresa y el rol vía `pb_company_role()` antes de cualquier mutación. Un `authenticated` sin membership activa recibe `forbidden`/`not_authenticated` sin filtrar datos.
- **Actor autorizado:** miembros activos con el rol requerido por cada operación (matriz owner/admin/recruiter/viewer de sql/058).
- **Validación interna:** presente en las 13 (ver columna anterior).
- **Riesgo:** bajo residual — la superficie RPC es intencional (es el mecanismo de mutación de Company Core; las tablas tienen INSERT/UPDATE/DELETE revocados a `authenticated`, líneas 143-145 de sql/058).
- **Decisión:** **ACCEPTED EXCEPTION** — RPCs privilegiados intencionales con autorización interna demostrada (contract tests 27/27 + harness de concurrencia E0a). No se cambia la arquitectura.

### F2 — `mutable search_path`

- **Finding:** funciones SECURITY DEFINER con `search_path` mutable serían secuestrables vía objetos maliciosos en esquemas del path.
- **Exposición real:** **ninguna** — las 14 funciones fijan `SET search_path TO 'public', 'pg_temp'`.
- **Decisión:** **NO APLICA / PASS** (sin finding real).

### F3 — `anon` / `PUBLIC` con EXECUTE

- **Finding:** PostgreSQL otorga EXECUTE a PUBLIC por defecto en funciones nuevas.
- **Exposición real:** **ninguna** — sql/058 revoca explícitamente (`REVOKE ALL ... FROM PUBLIC` individual + bloque DO sobre `pb_company_%`), y el GRANT es solo a `authenticated`. Verificado con `aclexplode`: cero grants a `PUBLIC`/`anon`.
- **Decisión:** **NO APLICA / PASS**.

### F4 — `pb_company_audit` expuesta

- **Finding:** una función de auditoría invocable directamente permitiría inyectar entradas falsas.
- **Exposición real:** **ninguna** — `REVOKE EXECUTE ... FROM authenticated` (sql/058 línea 266); solo la invocan los RPCs SECURITY DEFINER (mismo owner `postgres`).
- **Decisión:** **PASS** (mitigado en diseño).

### F5 — RLS / FORCE ROW LEVEL SECURITY

- **Finding:** tablas tenant sin FORCE RLS permitirían al owner de la tabla (o vía funciones) saltarse policies.
- **Exposición real:** `app_companies`, `app_company_memberships`, `app_company_invitations` tienen RLS habilitada + `FORCE ROW LEVEL SECURITY` (sql/058 sección 2). Las mutaciones pasan exclusivamente por RPCs con validación interna.
- **Decisión:** **PASS** (verificado en contract tests y matriz RLS del QA report de #82).

## 3. Supabase Security Advisors (live) — LIMITACIÓN

Los Security Advisors del dashboard de Supabase requieren acceso directo a la base de datos QA (`uqfbilyfpflrlthnyijj`). Las credenciales QA fueron retiradas del workspace en R9 (correctamente) y no están disponibles en este entorno.

**Acción requerida (bloqueante para GO producción, no para E0a):** ejecutar Supabase Security Advisors sobre QA tras aplicar sql/058 + sql/059 en QA, y contrastar los findings live con esta tabla. Cualquier finding live adicional se documentará con FIX o ACCEPTED EXCEPTION justificado antes del GO de producción (sección 8 de la decisión PO).

## 4. Conclusión

Arquitectura SECURITY DEFINER **intencional y defendida**: search_path fijo en 14/14, cero EXECUTE a PUBLIC/anon, auditoría no expuesta, validación interna de actor/empresa/rol en cada mutación, RLS FORCE en las tres tablas tenant. Sin findings estáticos abiertos. Pendiente únicamente la pasada live de Security Advisors en QA como gate pre-producción.

## 5. Addendum 2026-10-24 — sql/060 (PO review PR #98, RCA-2)

sql/060 reemplaza por segunda vez las definiciones de `pb_company_member_change_role`, `pb_company_member_remove` y `pb_company_transfer_ownership` (PO review: carrera transfer↔remove de target no-owner + discrepancia de contrato).

**Verificación post-cambio (misma metodología que §1-§3, sobre DB local PG17 con 058+059+060 aplicados):**

- **Firmas y grants:** idénticos (`CREATE OR REPLACE`, mismos tipos de argumentos; re-assert defensivo de los mismos tres GRANT a `authenticated`; cero grants nuevos, cero a `PUBLIC`/`anon`).
- **search_path:** las tres funciones mantienen `SET search_path TO 'public', 'pg_temp'` (14/14 sin cambios).
- **Validación interna:** reforzada — las decisiones de autorización e invariante se evalúan ahora sobre estado re-leído **post-lock** (mutex incondicional por empresa), nunca sobre snapshots previos al lock. Nuevo código de error `target_already_owner` (contrato canónico de transferencia: target activo no-owner), mapeado en `companyCore.ts` + 11 locales i18n.
- **Superficie:** sin cambios — ni funciones nuevas ni nuevos callers privilegiados.
- **Hallazgos F1–F5:** sin variación (F1 sigue ACCEPTED EXCEPTION con autorización interna ahora más estricta; F2–F5 PASS).

**Evidencia de la corrección (harness `TESTFIXTURE-run-e0a-owner-race.sh`, modos before/before060/after):**

| Modo | DB | Resultado |
|---|---|---|
| `before` (058) | A-race original reproducida (0 owners tras degradación concurrente) | ✅ esperado |
| `before060` (058+059) | **C1 reproducida 3/3**: `owners_after=0, A=admin/active, B=owner/removed`; F1 no levanta (discrepancia de contrato confirmada); A/B/C2/D/E se mantienen | ✅ evidencia PO |
| `after` (058+059+060) | **4/4 PASS A/B/C1/C2/D/E/F**; C1 ejercitado en ambos órdenes (gana remove → `not_found`; gana transfer → `forbidden` al retirar al nuevo owner siendo ya admin); D: 32-34ms sin bloqueo global; F1–F5 contract PASS | ✅ fix |
| `after` + 060b (rollback) | C1 reproducida de nuevo (0 owners) + F1 no levanta → 060b restaura exactamente 059 | ✅ rollback verificado |

RCA completo de la segunda carrera: cabecera de `sql/060-pb-ent-e0a-company-core-concurrency-002.sql`.
