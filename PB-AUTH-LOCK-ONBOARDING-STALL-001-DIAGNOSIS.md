# PB-AUTH-LOCK-ONBOARDING-STALL-001 — Diagnóstico y corrección de bloqueos de sesión, onboarding y subida

**Ticket:** PB-AUTH-LOCK-ONBOARDING-STALL-001 (P1)
**Issue:** pipingbox/DASHBOARD-APP#67
**PR relacionada:** #66 (PB-DOCUMENT-UPLOAD-RELIABILITY-001) — se mantiene sin merge
**Rama:** `pb-auth-lock-onboarding-stall-001` (base: `98c4a32`, head candidato de la PR #66)
**SHA inicial:** `98c4a32` · **SHA candidato:** ver cabecera de la rama / PR
**Alcance:** diagnóstico + implementación + QA. **NO MERGE / NO DEPLOY sin GO explícito.**

---

## 1. Resumen ejecutivo

Las nuevas evidencias de producción (usuario real con onboarding bloqueado de forma
permanente, imposibilidad de omitirlo y subidas de CV/certificados detenidas en 0 %)
NO son tres problemas distintos: son tres síntomas de **dos mecanismos raíz** en la
capa de sesión, ambos **demostrados y reproducidos en QA** con cuentas sintéticas:

- **Mecanismo A — lock zombi de `navigator.locks`** (Chromium): una petición de lock
  encolada por un documento destruido en vuelo (popup de URL firmada cerrado,
  navegación de página completa mientras el login aún tiene trabajo de auth en curso)
  deja una entrada de cola **permanente** que bloquea toda adquisición posterior de
  `lock:sb-<ref>-auth-token`, incluida la recuperación `steal:true` de auth-js 2.106
  y **también el `AbortSignal`** (la entrada envenenada nunca se resuelve).
  `supabase.auth.getSession()` no resuelve nunca → el bootstrap de `useAuth`
  interpretaba el timeout de 8 s como "sin sesión" (**logout silencioso**), las
  subidas TUS esperaban `getSession()` antes de armar cualquier watchdog (**0 %
  indefinido**) y los guardados del onboarding esperaban sin límite.

- **Mecanismo B — autodeadlock de auth-js en la notificación a subscribers**:
  auth-js emite `SIGNED_IN`/`INITIAL_SESSION` **mientras mantiene su cola interna
  de lock** (`lockAcquired=true`, `pendingInLock`). El subscriber de `useAuth` hacía
  `await ensureProfile()` (PostgREST); **toda llamada REST de supabase-js reentra en
  `auth.getSession()`** para obtener el token, y esa llamada reentrante se encadena
  **detrás del propio `_recoverAndRefresh`** que la está esperando → ciclo perfecto.
  Demostrado en QA con `debug:true` de auth-js: arranque detenido > 12 s **con el
  lock del navegador completamente sano**; el estado React se actualizaba de forma
  síncrona (`setUser`) pero el perfil llegaba vacío → UI renderizada sin datos,
  wizard colgado en "saving" en las rutas de guardado que dependen de la misma cola.

Ambos mecanismos son **pre-existentes en `main`** (el flaky de `cv-upload-smoke`
reproducido en `main` durante PB-DOCUMENT-UPLOAD-RELIABILITY-001 era el mecanismo A;
el mecanismo B explica los arranques muertos intermitentes no atribuidos).

## 2. Evidencia de reproducción (QA, cuentas sintéticas, cero PII real)

| # | Escenario | Antes del fix | Después del fix |
|---|-----------|---------------|-----------------|
| R1 | Login → navegación completa con locks de auth en vuelo | **Logout silencioso** (redirect a `/login` con sesión válida en localStorage, lock `HELD_BY_OTHER` persistente, 0 peticiones a Supabase tras el reload) | Sesión preservada; la escalera acotada resuelve en ≤ ~8 s; si el presupuesto de arranque (12 s) se agota, pantalla **recuperable** ("No has cerrado sesión" + Reintentar), nunca logout |
| R2 | Popup de URL firmada + `reload()` (cv-upload-smoke) | Flaky: 1/5 PASS local, 4/4 FAIL en `main` | **3/3 PASS** consecutivas (~14 s) |
| R3 | Arranque con lock sano pero subscriber pesado | Bootstrap > 12 s, deadline de `useAuth`, perfil vacío (debug auth-js: `_notifyAllSubscribers(SIGNED_IN) begin` sin `end`) | Bootstrap ~1 s; subscriber desacoplado y acotado |
| R4 | Adquisiciones anidadas con lock zombi (getSession → refresh) | 8 s por nivel anidado → deadline de 12 s superado | Circuit breaker: primer bypass ~8 s, anidadas **instantáneas** durante el enfriamiento (60 s), re-sondeo posterior |
| R5 | Onboarding → "Completar después" | Spinner `saving` potencialmente infinito | Navegación a `/dashboard` en ≤ 45 s (observado ~2–9 s), `onboarding_postponed_at` verificado **lado servidor**, recarga sin trampa, wizard reanudable |

## 3. Causas demostradas vs hipótesis

**Demostradas (con evidencia de trace/consulta):**
1. El timeout de 8 s de `useAuth` interpretaba un `getSession()` colgado como ausencia
   de sesión (logout silencioso). — Corregido: `authUnavailable` recuperable.
2. `navigator.locks` puede quedar envenenado de forma permanente por documentos
   destruidos en vuelo; ni `steal:true` ni `AbortSignal` rescatan la cola. —
   Corregido: `resilientAuthLock` (escalera exclusivo→steal→bypass run-once, acotada
   por **temporizadores independientes**, no por la señal) + circuit breaker.
3. El subscriber `async` de `onAuthStateChange` en `useAuth` autodeadlockea auth-js
   al reentrar REST→getSession durante la notificación. — Corregido: callback
   síncrono, trabajo desacoplado y acotado.
4. `resumableUpload` esperaba `getSession()` antes de armar watchdogs (0 % infinito).
   — Corregido: adquisición de sesión acotada (15 s) con fallo clasificado
   `auth/timedOut` recuperable.
5. Las operaciones críticas del wizard (autosave, finish, postpone, avatar,
   lectura de estado, `refreshProfile`) no tenían deadline. — Corregido: deadlines
   por operación con telemetría cerrada `onboarding_save_timeout`.

**Hipótesis (no demostradas, marcadas como seguimiento):**
- H1. Los timeouts de PostgREST registrados en producción **no están demostrados**
  como causa de este caso; con los deadlines por operación, un PostgREST lento
  degrada a error recuperable en vez de spinner infinito. Seguimiento recomendado:
  revisar `pg_stat_statements`/statement_timeout del proyecto de producción y el
  endpoint `/api/config` (500 en preview local; inalcanzable desde este entorno).
- H2. iOS Safari/WebKit podría comportarse distinto con `navigator.locks`
  (implementación más reciente). Sin dispositivo/emulador iOS disponible → BLOCKED.

## 4. Cambios implementados

### Núcleo de sesión
- **`lib/resilientAuthLock.ts` (nuevo)** — lock compatible con supabase-js
  `(name, acquireTimeout, fn)`:
  1. adquisición exclusiva acotada por **carrera de temporizador** (la señal de
     aborto no basta: el zombi la ignora — demostrado);
  2. `steal:true` acotado (3 s);
  3. bypass de último recurso **run-once** (una concesión tardía del navegador
     jamás ejecuta `fn` dos veces — protege el refresco de tokens) con telemetría
     `auth_lock_bypassed` (sin PII);
  4. **circuit breaker**: tras un bypass, el nombre queda envenenado 60 s
     (adquisiciones anidadas instantáneas); el primer intento tras el enfriamiento
     re-sondea la escalera completa y una adquisición sana cierra el circuito.
- **`lib/withTimeout.ts` (nuevo)** — carrera mínima que nunca rechaza; el timeout se
  clasifica en el llamador como estado recuperable.
- **`lib/supabase.ts`** — `auth.lock = resilientAuthLock`. Sin cambios de seguridad:
  el lock exclusivo multi-pestaña sigue siendo el camino normal; no se leen tokens
  de localStorage; ninguna protección se desactiva.
- **`hooks/useAuth.tsx`**:
  - bootstrap acotado (12 s); un timeout **ya no resuelve `session: null`** → nuevo
    estado `authUnavailable` (no es logout); una `INITIAL_SESSION` tardía lo limpia;
  - `ensureProfile` del bootstrap acotado (20 s);
  - **subscriber de `onAuthStateChange` síncrono**: `ensureProfile` desacoplado y
    acotado (corrige el mecanismo B);
  - `refreshProfile()` acotado (lo esperan finish/postpone del wizard).
- **`components/ProtectedRoute.tsx`** — pantalla recuperable
  `AuthUnavailableScreen` (i18n ×11: "No hemos podido verificar tu sesión / No has
  cerrado sesión…") compartida por `ProtectedRoute` y `GuestRoute`.

### Subidas TUS
- **`lib/resumableUpload.ts`** — adquisición de sesión acotada (15 s) **antes** de
  cualquier transferencia; el fallo se clasifica `auth/timedOut` con la telemetría
  existente. TUS funciona tras la recuperación de sesión (la escalera la desbloquea).

### Onboarding
- **`components/onboarding/OnboardingWizard.tsx`** — deadlines para autosave (15 s),
  escritura de perfil finish/postpone (20 s), avatar (30 s), lecturas de sesión/
  estado (12 s) y llamada `complete-onboarding` (15 s, AbortController; también la
  best-effort del postpone). Un timeout deja el wizard en estado de error
  **recuperable con el borrador intacto** — nunca spinner infinito, nunca éxito
  falso. Telemetría cerrada `onboarding_save_timeout{operation}`.
- **`lib/observability.ts`** — 3 eventos nuevos en la taxonomía cerrada
  (`auth_lock_bypassed`, `auth_session_resolution_timeout`, `onboarding_save_timeout`)
  + enum cerrado `ONBOARDING_SAVE_OPERATIONS`. Sin PII (ruta, correlation id, enums).

### Tests
- `tests/resilient-auth-lock.spec.ts` (nuevo, 17): escalera, zombi a prueba de aborto
  (forma de producción), run-once ante concesión tardía, circuit breaker
  (bypass anidado instantáneo, cierre tras enfriamiento, re-envenenado),
  `withTimeout`.
- `tests/onboarding-postpone-e2e.spec.ts` (nuevo): skip real en QA con cuenta
  sintética `AUTH_ONLY` — navegación acotada, persistencia verificada por API,
  recarga, reanudación.
- `tests/cv-upload-smoke.spec.ts`: presupuestos de hidratación 10 s → 25 s en las dos
  comprobaciones post-navegación (la recuperación acotada ~8 s + hidratación supera
  el presupuesto anterior en estado degradado; la aserción sigue exigiendo
  persistencia REAL).

## 5. Resultados de pruebas (QA, build local contra Supabase QA real)

| Suite | Resultado |
|-------|-----------|
| resilient-auth-lock (unit) | **17/17 PASS** |
| resumable-upload (unit) | **27/27 PASS** |
| document-upload-validation | **35/35 PASS** |
| document-upload-e2e (TUS real, interrupción+resume) | **5/5 PASS** |
| cert-upload-ux | **9/9 PASS** |
| documents/certifications open-first-click | **12/12 + 8/8 PASS** |
| rls-worker-experiences (aislamiento cruzado A↔B) | **8/8 PASS** |
| cv-upload-smoke (era flaky pre-existente) | **3/3 PASS** consecutivas |
| onboarding-postpone (unit, modelo de estados) | **6/6 PASS** |
| onboarding-postpone-e2e (skip real QA) | **1/1 PASS** (~9 s) |
| onboarding-dom-mutation | **BLOCKED** — el spec exige cuentas `qa*@pipingbox.com`; las sintéticas disponibles usan otro dominio (precondición ajena al cambio) |
| observability-onboarding-e2e | **BLOCKED** — misma precondición de namespace |
| Registro (signup) E2E | **BLOCKED** — el alta real requiere confirmación de email; la cuenta usada se creó por admin API (sintética) |
| "Completar onboarding" canónico E2E | **BLOCKED** — la edge function `complete-onboarding` no está desplegada en QA (404); el camino de fallo acotado sí está cubierto |
| iOS Safari real | **BLOCKED** — no disponible en este entorno |

**Total: 106 PASS, 0 FAIL atribuibles, 4 BLOCKED** (con causa documentada).

## 6. Verificación de seguridad

- Buckets privados y políticas RLS intactos (suite RLS cruzada 8/8 PASS).
- Sin `service_role` ni secretos en el frontend; la anon key sigue protegida por RLS.
- El lock multi-pestaña sigue siendo el camino normal; el bypass solo actúa cuando la
  facilidad de locks del navegador está demostrada como no operativa, con telemetría.
- No se leen tokens directamente de localStorage; toda decisión de sesión pasa por
  supabase-js.
- Telemetría nueva sin PII (taxonomía cerrada, enums, sin nombres de archivo/UIDs).
- Cero mutaciones en producción; QA solo con cuentas sintéticas
  (`*@pipingbox-test.example`).

## 7. Riesgos residuales

1. **Bypass de lock en estado zombi**: mientras dura el envenenamiento, las
   operaciones de auth corren sin exclusión multi-pestaña en ESA pestaña (la
   alternativa es una pestaña permanentemente bloqueada). El run-once evita
   dobles refrescos; el circuito se cierra solo si el navegador se recupera.
   Prevalencia medible vía `auth_lock_bypassed` en PostHog.
2. **H1 (PostgREST prod)** sin investigar en origen: recomendado revisar
   statement_timeout/logs del proyecto de producción antes del GO.
3. **iOS Safari** sin validar (BLOCKED): la escalera usa solo APIs estándar
   (`navigator.locks`, `AbortController`), pero WebKit debe validarse en dispositivo.
4. `onboarding_completed` canónico no ejercido de extremo a extremo en QA (edge
   function ausente): el gate de 2xx y el camino recuperable sí están cubiertos.
5. Seguimiento upstream: el zombi de `navigator.locks` es un bug de Chromium;
   conviene vigilar supabase-js/auth-js por si publican mitigación oficial.

## 8. Orden seguro de integración con la PR #66

Esta rama parte del head de la PR #66 (`98c4a32`), por lo que **contiene** todos sus
cambios. Orden recomendado:

1. **Primero** revisar y fusionar esta PR (auth-lock/onboarding) — es la capa de la
   que dependen las subidas; sus tests incluyen la regresión completa de la #66
   (document-upload-e2e, validación, resumable, cert-ux, open-first-click, RLS).
2. La PR #66 quedará **contenida** en esta rama: si esta se fusiona primero, la #66
   puede cerrarse como integrada (o fusionarse después sin conflicto: base común).
3. En ningún caso fusionar antes de: nueva revisión del usuario, validación manual
   en iOS Safari (riesgo 3) y decisión sobre H1 (riesgo 2).

**Recomendación: NO-GO para merge automático.** Pendiente revisión expresa del
usuario. NO MERGE / NO DEPLOY.
