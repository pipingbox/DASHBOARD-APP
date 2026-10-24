# PB-CE-COMPANY-CORE-001 — Informe QA

Estado: **PASS QA / NO MERGE / NO PRODUCCIÓN**  
Fecha: 2026-10-16  
Base autorizada: `5e1da21fb69fb2748dee84fbd151cb2a0b22ea11`  
Rama: `pb-ce-company-core-001`  
SHA candidato: `c6479ba1d57a9dc64c1f55acc2841f0db8554481`  
PR: [#82](https://github.com/pipingbox/DASHBOARD-APP/pull/82)  
Preview: [pipingbox-app.pipingbox.workers.dev](https://pipingbox-app.pipingbox.workers.dev)  
Deploy preview: run `38963359007` — PASS

## 1. ADR y modelo

ADR y diagrama: `docs/PB-CE-COMPANY-CORE-001-ADR.md`. El tenant es
independiente de `profiles`; memberships many-to-many y `company_id` activo en
cliente son solo selección de contexto, nunca autorización.

## 2. Inventario legacy

La empresa legacy está en `profiles` (`account_type`, `company`,
`company_verified`, `company_status` y campos relacionados). Jobs y applications
siguen siendo propiedad de `company_user_id` en esta fase. Hay 4 cuentas
`account_type='company'`: 2 verificadas/aprobadas y 2 pendientes. El proveedor
de correo reutilizable es `_shared/email-provider.ts` con i18n de 11 locales.

## 3. Artefactos y SHA

Forward: `sql/058-pb-ce-company-core-001.sql` (renumerado desde `041` en la reconciliación con main del 2026-10-23 por colisión de numeración con `sql/041-pb-cv-auto-profile.sql`; contenido byte-idéntico al validado en QA).  
Rollback: `sql/058b-pb-ce-company-core-rollback.sql` (renumerado desde `041b`; contenido byte-idéntico).  
Frontend: `companyCore.ts`, `CompanyTenant`, `CompanyTeam`, `InviteAccept`,
selector multiempresa e i18n de 11 locales.

## 4. Migración forward

Aplicada de forma idempotente en QA. Resultado: 3 tablas nuevas, 4 tenants
legacy, 4 memberships `owner`, 0 invitaciones residuales. Los nombres
legacy estaban vacíos y se usó el fallback documentado; no se modificaron
profiles, jobs ni applications.

## 5. RLS

Las tres tablas tienen `ENABLE ROW LEVEL SECURITY` y `FORCE ROW LEVEL
SECURITY`. `anon` no tiene SELECT. `authenticated` solo tiene SELECT directo;
las mutaciones pasan por RPCs. Las policies se basan en memberships activas.

## 6. RPCs privilegiadas

12 funciones Company Core presentes (helpers, auditoría, 9 RPCs operativas),
`SECURITY DEFINER`, `search_path='public','pg_temp'`, grants explícitos mínimos.
`pb_company_audit` no es ejecutable por `authenticated`.

## 7. Invitaciones

PASS para token backend-only, hash SHA-256 únicamente, expiración, revocación,
email binding, anti-enumeración, replay y token manipulado. Se corrigió en QA
la re-invitación tras expiración temporal: una fila `pending` caducada se
transiciona perezosamente a `expired` antes de emitir la nueva invitación.

## 8. Aislamiento A/B

PASS: Owner A ve una empresa y sus memberships; no ve B ni siquiera con UUID
conocido. Owner B obtiene el resultado simétrico. Usuario autenticado sin
membership obtiene 0 empresas, 0 memberships y 0 invitaciones.

## 9. Invariantes de ownership

PASS: no se puede degradar o retirar al último owner; admin no puede gestionar
owners/admins; transferencia es atómica y deja al anterior como admin.

## 10. Acceso directo

PASS: SELECT REST sin bearer no devuelve datos y `anon` recibe `permission
denied`; las escrituras directas de `authenticated` no están concedidas.

## 11. Regresión legacy

PASS: 4 cuentas legacy intactas, 87 applications intactas, 4 jobs intactos,
drift de contadores `0`. No hay `DELETE CASCADE` en el modelo nuevo.

## 12. Tests

- `company-core-contract.spec.ts`: **27/27 PASS**.
- Matriz viva QA: **16/16 PASS**.
- Ciclo de vida de invitaciones: **8/8 PASS**.
- Batería negativa/positiva de ACL/RLS: **9/9 PASS**.
- Observabilidad: **70/70 PASS**.
- Suites enterprise existentes: **55/55 PASS**.

## 13. Typecheck, lint y build

Typecheck: PASS. Lint: 0 errores, 1 warning preexistente de `any` en
`AppShell.tsx`. Route-contract guard: PASS. Build Vite: bundle y 10 páginas
prerenderizadas generadas; el proceso post-build de red no termina dentro del
sandbox, sin afectar al artefacto. Los guards i18n: schema PASS y cobertura
estricta **11/11 locales al 100%**.

## 14. Preview y smoke

Deploy preview PASS en run `38963359007`, con SHA embebido
`c6479ba1d57a9dc64c1f55acc2841f0db8554481`. La ruta de login se abrió en el
navegador sin errores de consola. La validación funcional autenticada se hizo
por la matriz RPC/RLS viva; el navegador no se usó para introducir credenciales
reales.

## 15. PostHog y PII

Los 8 eventos requeridos están en la allowlist cerrada. Solo transportan UUIDs
técnicos y enums de rol; no email, nombre, teléfono, token, VAT ni datos
fiscales. Tests de observabilidad PASS.

## 16. Rollback y limitaciones

Rollback probado en QA: **PASS**, 0 tablas, 0 funciones y 0 policies
residuales; 87 applications, 4 cuentas legacy y 23 filas de audit log
preservadas. Se corrigió el orden real de dependencias: RPCs → tablas →
helpers → auditoría.

Limitaciones pendientes:

1. La BD usada para QA es el proyecto Supabase disponible en el entorno; no
   existe un proyecto Supabase staging separado.
2. La entrega de email de invitación queda fuera de este corte; el frontend
   permite compartir el enlace de un solo uso manualmente.
3. Jobs/applications todavía usan `company_user_id`; el remapeo de datos de
   trabajo al tenant queda para una fase posterior.
4. El nombre legacy vacío requiere completar el perfil antes de presentar el
   tenant a usuarios reales.

## Diff propuesto para PIPINGBOX-BRAIN

Marcar `PB-CE-COMPANY-CORE-001` como **IN PROGRESS / QA PASS**, no DONE.
Añadir que Company Core ya está implementado en rama y preview, con migración
legacy paralela reversible, RLS FORCE y aislamiento A/B verificado. Mantener
fuera de alcance billing, compliance, private pools, matching, WhatsApp, SSO,
API pública y producción. Registrar como riesgos: staging Supabase separado,
email delivery, remapeo posterior de jobs/applications y completar nombres
legacy.