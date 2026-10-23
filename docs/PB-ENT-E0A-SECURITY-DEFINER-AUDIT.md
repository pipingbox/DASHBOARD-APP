# PB-ENT-E0A — Auditoría SECURITY DEFINER (Company Core)

**Fecha:** 2026-10-23 · **Ámbito:** sql/058 + sql/059 · **Base:** main `5ab08ea` + rama E0a `1063e30`

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
