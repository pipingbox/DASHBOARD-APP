# PB-AUTH-LOCK-ONBOARDING-STALL-001 — Diagnóstico y corrección de bloqueos de sesión, onboarding y subida

**Ticket:** PB-AUTH-LOCK-ONBOARDING-STALL-001 (P1)
**Issue:** pipingbox/DASHBOARD-APP#67
**PR relacionada:** #66 (PB-DOCUMENT-UPLOAD-RELIABILITY-001) — se mantiene sin merge
**Rama:** `pb-auth-lock-onboarding-stall-001` (base: `98c4a32`, head candidato de la PR #66)
**SHA inicial:** `98c4a32` · **SHA rev.1:** `cae4f00` · **SHA rev.2:** `70fdc2f` · **Merge con main:** `10f3733` · **SHA rev.3 (código):** `25955aa`
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

---

# Rev.2 — Respuesta a la revisión NO-GO de la PR #68 (13/10/2026)

La revisión técnica del SHA `cae4f00` (NO-GO, 5 observaciones) queda abordada
así. Todos los cambios están en la **misma rama**; producción intacta.

## R2.1 Observación 1 (BLOQUEANTE) — 8 errores TypeScript en CI

**Causa:** `withTimeout` estaba tipado `Promise<T>`; los builders de PostgREST
son **thenables** (`PromiseLike`), no `Promise` nativos. Mi verificación local
usaba el tsconfig raíz de referencias (que no chequea nada); el workflow
`typecheck-regression` usa `tsc -p tsconfig.app.json`.

**Corrección:** la firma acepta ahora `PromiseLike<T>`
(`app/frontend/src/lib/withTimeout.ts`), preservando la inferencia.
**Verificación:** `npm run typecheck` (comando exacto del workflow) → exit 0.
El CI del SHA final debe terminar PASS (verificado tras el push, ver §R2.6).

## R2.2 Observación 2 (P1) — seguridad cross-tab del bypass

**Riesgo señalado:** dos pestañas en bypass podían refrescar concurrentemente;
la continuacion perdedora (con estado leído ANTES del lock, token ya rotado)
falla 400 y auth-js reacciona con `_removeSession()` — borrando los tokens
frescos de la ganadora. Además `steal:true` podía interrumpir un holder
legítimo simplemente lento.

**Corrección — capa de coordinación advisory** (`app/frontend/src/lib/authLockCrossTab.ts`,
nueva, ~290 líneas):

1. **Heartbeat**: toda ejecución de la función bajo lock — sana o en bypass —
   anuncia vida por `BroadcastChannel` (1 Hz) y `release` al terminar. La
   vida se mide por tiempo LOCAL de recepción (sin sesgo de reloj).
2. **Guardia de steal**: antes de `steal:true` se comprueba si existe un
   holder vivo; si existe (aunque sea lento), la pestaña espera su release y
   reintenta la adquisición NORMAL — el steal solo se alcanza sin holder vivo
   (zombi real). Un holder remoto aún vivo tras el plazo deriva a la
   contención serializada (nunca a robarle el lock).
3. **Contención de bypass**: los bypass entre pestañas se serializan por
   ronda de claims (ventana 150 ms, ganador determinista por
   `(timestamp, id)` con eco de claims para pares que se suscriben tarde).
   La pestaña **suplantada NO ejecuta su continuación** (potencialmente
   obsoleta): recibe un `AuthRetryableFetchError` sintético — clase que
   auth-js trata como reintentable y a la que **NO** responde con
   `_removeSession()`. El siguiente intento lee los tokens frescos de la
   ganadora. La contención misma-pestaña se serializa sin suplantar.
4. **Liveness**: holder caído = sin heartbeat > 2,5 s; todo espera acotada
   por presupuesto; sin `BroadcastChannel` degrada al comportamiento rev.1
   (riesgo documentado, no silenciado).

`resilientAuthLock` ejecuta ahora TODO (adquisición sana, steal y bypass)
dentro de esta capa. **El lock exclusivo multi-pestaña sigue siendo el camino
normal; nada se desactiva.**

**Pruebas (nuevas):**
- `tests/auth-lock-cross-tab.spec.ts` — **9/9 PASS**: holder anunciado +
  espera de release; dos pestañas → exactamente una corre, la otra
  `superseded`; pestaña sola corre tras la ventana; holder caído →
  `superseded` y recuperación en la siguiente llamada; misma pestaña
  serializada sin suplantar; degradación sin canal; integración con
  `resilientAuthLock` (dos pestañas zombi → exactamente UNA continuación, la
  perdedora lanza `AuthRetryableFetchError`); guardia de steal (nunca se
  interrumpe un holder vivo remoto; acción estrictamente posterior al
  release o suplantada); pestaña zombi sola → bypass sigue resolviendo.
- `tests/auth-lock-multi-tab-e2e.spec.ts` — **1/1 PASS (E2E real,
  Chromium)**: dos pestañas reales, `navigator.locks` colgado en ambas,
  sesión EXPIRADA sembrada (ambas deciden refrescar el mismo token):
  exactamente **1 POST de refresh** en toda la corrida, sesión **jamás
  borrada** (access_token presente en ambas), la perdedora muestra el estado
  recuperable y el Reintentar autentica **sin un segundo refresh**.

## R2.3 Observación 3 (P1) — E2E de Finalizar onboarding en QA

**Aprovisionamiento QA (solo QA):** GRANTs de tabla/secuencia a
`service_role` (replicando producción, leídos del esquema) + despliegue de la
edge `complete-onboarding` vía Management API. Verificado 200 con transición
canónica real. Producción sin cambios.

**Hallazgo relevante:** el RPC `pb_complete_onboarding` desplegado en QA
**difiere del fuente del repo** (`sql/010`): puntúa `title 5 + location 5 +
skills 10 + avatar 10 + bio 5` (sin `professional_title`, que no existe en la
tabla QA) y el umbral `MARKETPLACE_READY` exige ≥ 50 Y visibilidad pública.
Con los datos mínimos del wizard (Pipefitter + Piping + Madrid/Spain + avatar)
se alcanza completion 30 → `PROFILE_COMPLETED`; el wizard pide marketplace
con perfil público y el RPC concede `MARKETPLACE_READY`. Ambos estados
terminales son válidos; el E2E acepta la pareja coherente.

**Prueba:** `tests/onboarding-finish-e2e.spec.ts` — **1/1 PASS (~12 s)**:
recorre los 8 pasos con datos mínimos + avatar sintético, Finish exige
**2xx del profile write Y 2xx de la edge** (sin éxito falso), verificación
**lado servidor** con el token del propio usuario (`AUTH_ONLY` → estado
terminal canónico, `marketplace_ready` coherente, `profile_completion ≥ 30`,
`title`/`location`/`avatar_url` persistidos), reload sin trampa del gate,
borrado de la cuenta sintética al final. Queda desbloqueado el anterior
BLOCKED "completar onboarding".

## R2.4 Observación 4 (P2) — escrituras tardías inconsistentes

**Riesgo señalado:** `withTimeout` no cancela la consulta; un UPDATE del
wizard vencido podía confirmar TARDE y sobrescribir un reintento posterior.

**Corrección — `ProfileWriteCoordinator`** (`app/frontend/src/lib/profileWriteCoordinator.ts`,
nueva, ~155 líneas), integrada en el wizard (autosave, Finish y Postpone):

1. **Single-flight por carril**: iniciar una escritura ABORTA la anterior en
   vuelo (`AbortController` + `.abortSignal(signal)` de postgrest-js —
   cancelación REAL del fetch subyacente).
2. **Prioridad explícita**: Finish/Postpone aborta y suprime autosaves
   mientras corre; un autosave durante una escritura explícita se DESCARTA
   (nunca se envía — su payload es obsoleto por definición; el debounce se
   rearma con la siguiente edición).
3. **Acotada con cancelación**: timeout → abort de la petición; resultado
   `timeout`/`superseded`/`dropped` = estado recuperable con el borrador
   intacto; nunca éxito falso (solo 2xx sin `error` es `saved`).
4. **Guard de generación**: la resolución tardía de una escritura abortada se
   ignora aunque el thenable resuelva.

**Pruebas:** `tests/profile-write-coordinator.spec.ts` — **8/8 PASS**:
guardado limpio; error PostgREST reportado; timeout ABORTA la petición;
suplantación aborta la anterior y su éxito tardío se ignora; la escritura
   explícita aborta el autosave obsoleto ANTES de tocar la red; autosave
   durante explícita se descarta sin enviarse; throw síncrono y rechazo de
   promesa son `error` sin crashear. El E2E de postpone (1/1 PASS) ejercita
   la integración real.

## R2.5 Observación 5 — matriz de pruebas y conteos

Ver §R2.6 (matriz final de la rev.2). iOS Safari sigue **BLOCKED** hasta
prueba manual en dispositivo. Los timeouts PostgREST de producción siguen
como **hipótesis paralela H1** (sin investigar en origen; recomendado revisar
statement_timeout/logs antes del GO).

### Hallazgos de QA ajenos a la rama (documentados, no corregidos salvo el locator)

- `tools-dom-mutation` estaba **roto en `main`** desde el reconcile `a9fdd53`
  (renombró la herramienta a "Calculadora de Injertos"/"Branch Connection
  Calculator" y el locator `/branch|trazado|layout/` dejó de coincidir
  jamás). Se corrigió el locator del spec en esta rama (comentario con
  referencia); la app no cambió.
- `schema-contract` espera que un PATCH de usuario escriba
  `onboarding_status`/`marketplace_ready` — la política QA de **columnas
  protegidas** (trigger P0001, preexistente) lo rechaza con 400. Contrato
  del test desalineado con la política canónica; verificado directamente.
- `referrals T1`: **0/6 perfiles de QA** tienen `referral_code` (bootstrap
  de referidos no activo en QA). Preexistente.
- `preview-smoke` (8): el `/api/config` local responde 500 (backend
  inalcanzable desde el entorno; ruido conocido) y el smoke cuenta los
  recursos fallidos como errores JS no capturados.
- Namespace `qa*@pipingbox.com` (7 suites) y contratos del Worker de
  producción (6) siguen BLOCKED como en la entrega anterior.
- El build local de QA REQUIERE `VITE_POSTHOG_KEY`/`VITE_APP_VERSION`/
  `VITE_APP_ENV`; sin ellos, posthog es no-op y las aserciones de wire
  fallan (causó falsos FAIL en la primera pasada; corregido en la final).

## R2.6 Matriz final rev.2 (SHA `70fdc2f`, build QA completo, Supabase QA real)

**CI:** el workflow `TypeScript Regression Gate` NO llegó a ejecutarse para
`107b196`/`70fdc2f` — GitHub no creó ningún run tras 3 disparadores (push,
close/reopen de la PR, push de commit vacío); Actions habilitado, workflow
activo, 0 runs en cola/progreso; último run creado 08:28Z (cae4f00).
Compatible con cuota de Actions agotada o incidencia de plataforma.
**Evidencia equivalente:** réplica del workflow en worktree prístino de
`70fdc2f` (`tsc -p tsconfig.app.json --noEmit --skipLibCheck` — comando
exacto del gate) → **exit 0, cero errores**; la rama no toca
`package.json`/`package-lock.json`. El gate oficial debe re-ejecutarse cuando
Actions vuelva a crear runs (el head de la PR es `70fdc2f`).

**Regresión completa (todas las suites menos los smokes de producción
`prod-stale-smoke`/`stale-crossdeploy`, excluidos como siempre en QA local):**

| Resultado | Conteos |
|-----------|---------|
| **PASS** | **742** |
| FAIL ambientales/preexistentes (desglose abajo) | 27 |
| Skipped (puertas de entorno dentro de los specs) | 22 |
| Did not run (dependencias seriales tras los BLOCKED) | 26 |
| **FAIL atribuibles a la rama** | **0** |

**Desglose de los 27 FAIL (todos con causa verificada, ninguno de la rama):**
- `preview-smoke` ×8 — `/api/config` 500 local (backend inalcanzable; ruido
  conocido; único request fallido verificado en `/`).
- `public-routes`/`tool landing` ×6 — contratos HTTP del **Worker de
  producción** (`pipingbox.com`); no ejercitables desde preview QA.
- Namespace `qa*@pipingbox.com` ×7 (`completion-journey`, `workforce-activation`,
  `onboarding/dashboard/profile-dom-mutation`, `observability-onboarding`,
  `referral-aldo`) — precondición de cuentas interna no disponible.
- `secure-file-access-broker` ×2 — requiere `E2E_WORKER_EMAIL` (fixture
  determinista no disponible).
- `schema-contract` ×2 — el test espera PATCH de usuario sobre columnas
  protegidas (trigger P0001 preexistente lo rechaza; verificado directamente).
- `referrals T1` ×1 — 0/6 perfiles de QA tienen `referral_code`.
- `document-upload-e2e` CV ×1 — **flaky bajo carga** (aserción de wire
  PostHog ≥ 2 `document_upload_started`; llegó 1). **PASS 2× en la misma
  build** (tanda serial y re-ejecución aislada, 30,8 s, ZERO DIFF).

**Nuevas pruebas de la rev.2:** `auth-lock-cross-tab` 9/9, 
`profile-write-coordinator` 8/8, `auth-lock-multi-tab-e2e` 1/1 (E2E real
2 pestañas), `onboarding-finish-e2e` 1/1 (canonical), locator de
`tools-dom-mutation` reparado (1/1). Las suites de la rev.1 siguen PASS
(`resilient-auth-lock` 17/17, `resumable-upload` 27/27,
`document-upload-validation` 34/34, `cert-upload-ux`, `open-first-click` ×12 y ×8,
`rls-worker-experiences` 8/8, `cv-upload-smoke`, `onboarding-postpone-e2e`,
`auth-callback` 3/3, `library-e2e`, `observability-identity`).

**Recomendación rev.2:** lista para **revisión**; NO-GO para merge automático
hasta: (a) gate TypeScript oficial en PASS sobre `70fdc2f` cuando Actions
dispare, (b) validación manual iOS Safari, (c) decisión sobre H1. NO MERGE /
NO DEPLOY.

---

# Rev.3 — Resolución de las 5 observaciones de la revisión 2 de la PR #68 (13/10/2026, tarde)

**SHA rev.3 (código):** `25955aa` (sobre el merge con main `10f3733`).
La PR #68 quedó **MERGEABLE/CLEAN** tras el merge; todos los cambios de la
PR #66 se conservan (verificado: el merge-base real con main es `16682d0`;
main solo trajo la PR #61 — notificaciones/catálogo — y **no toca** ningún
archivo de subidas ni del lock de sesión).

## R3.1 Observación 1 (BLOQUEANTE) — conflictos con main

El único conflicto fue `tests/tools-dom-mutation.spec.ts`. Main (PR #61) ya
había reparado el mismo locator roto de forma **superior** (atributo estable
`data-tool-key`, independiente del locale, fallo ruidoso con locator real de
Playwright). Se tomó el lado de `origin/main` completo; verificado que
`data-tool-key={tool.key}` existe en `Tools.tsx:202`. El arreglo propio de la
rama quedó obsoleto. Suite resultante: 1/1 PASS.

## R3.2 Observación 2 (BLOQUEANTE) — TypeScript Regression Gate oficial

**PASS oficial en `10f3733`** (run `TypeScript Regression Gate` del
2026-10-13T13:11:42Z→13:12:28Z, listado vía API `actions/runs`; PR #68 en
estado MERGEABLE/CLEAN con check verde).

Causa raíz de los runs ausentes: **indeterminada (plataforma)**. La hipótesis
previa de "cuota agotada" quedó descartada (el repo es público ⇒ Actions
gratuito). Los pushes anteriores (`107b196`, `70fdc2f`, commit vacío,
close/reopen) no dispararon runs por causa no atribuible; el push del merge
`10f3733` sí disparó y pasó. El gate debe ejecutarse de nuevo sobre el head
final de esta revisión (ver R3.6).

## R3.3 Observación 3 (P1) — degradación segura sin BroadcastChannel + coordinación en segundo plano

**Fail-closed implementado** (`authLockCrossTab.ts` + `resilientAuthLock.ts` +
`observability.ts`):
- `contendBypass` sin canal devuelve `'uncoordinated'` (antes `'run'` =
  fail-open): un bypass sin coordinación entre pestañas es exactamente el
  wipe de tokens por refresh concurrente que esta capa previene.
- `runBypass` ante `'uncoordinated'` lanza `AuthRetryableFetchError`
  sintético (reintentable, **sin** `_removeSession()`); el usuario ve la
  pantalla auth-unavailable con Reintentar. Evento nuevo tipificado
  `auth_lock_bypass_denied_uncoordinated` (propiedades `lock_path`,
  `correlation_id`).
- Trade-off documentado: una pestaña zombi sin canal ya no se autorecupera
  vía bypass (conjunto casi vacío: navegadores con Web Locks pero sin
  BroadcastChannel).

**Throttling en segundo plano** (semántica decidida y verificada): el primer
heartbeat del holder es síncrono al iniciar (sin timer), y un holder
vivo-pero-atascado responde claims con eco `held` síncrono y suplanta
contendientes hasta su `release`; un "cadáver" (event loop congelado, sin
eco) deja de bloquear tras expirar el heartbeat (2,5 s). No se mitiga con
wake-locks: un holder que no puede latir >2,5 s se considera muerto
intencionalmente.

**Pruebas:** `auth-lock-cross-tab` 12/12 (uncoordinated, background-throttling
con la semántica real, tabs aisladas, integración fail-closed),
`resilient-auth-lock` + `withTimeout` 32/32 → 44/44 PASS en las 4 suites unit
de la rama. **E2E real multi-tab 2/2** contra QA con build `25955aa`:
- Zombie `navigator.locks` + sesión expirada: la pestaña activa coordina y
  autentica sola; la sesión sobrevive (sin wipe).
- **Pestaña congelada real** vía CDP `Page.setWebLifecycleState(frozen)`:
  la pestaña activa autentica con exactamente **1 refresh** mientras la peer
  está suspendida; al reanudar, la congelada reusa la sesión fresca **sin
  segunda rotación** y sin borrado de sesión.

## R3.4 Observación 4 (P2) — escritura obsoleta pre-abort no puede sobrescribir

### Defecto demostrado empíricamente (antes del fix)

Sonda de proxy de reordenación contra **PostgreSQL QA real** (cuenta
sintética desechable `pb-write-probe-*`): el cliente lanza el UPDATE obsoleto
(#1), lo aborta inmediatamente (AbortController, lo que hace
`ProfileWriteCoordinator` al superseder), escribe el payload fresco (#2,
204), y el proxy libera después la petición #1 retenida. **Resultado: la
escritura abortada se commit-eó DESPUÉS de la fresca y la sobrescribió**
(`title`/`skills` obsoletos + `location` fresco — fila con campos mezclados
de dos escrituras). Es exactamente el escenario de la observación: el abort
del cliente no detiene una petición ya en la red.

### Corrección — guardia CAS servidor-side

- **Migración `sql/029-pb-profile-write-seq.sql`**: columna
  `profile_write_seq bigint NOT NULL DEFAULT 0` (aditiva, sin backfill).
  Aplicada a QA vía Management API ( tracked: `029-pb-profile-write-seq`) y
  verificada: trigger `pb_profiles_privilege_guard` **no** la protege (solo
  columnas de privilegio/estado), `authenticated` tiene grant UPDATE sobre
  ella.
- **`profileWriteGuard.ts`** (nuevo, lógica pura inyectable): el seq se
  consume por **INTENTO** de escritura (monótono por pestaña, avanza aunque
  la escritura se aborte) → una escritura nueva siempre lleva seq mayor que
  cualquier escritura abortada anterior; UPDATE con guardia
  `WHERE profile_write_seq < :next_seq` + `RETURNING profile_write_seq`;
  **0 filas = superseded en el servidor** (nunca éxito falso): resync
  (SELECT seq) + reintento único; perder dos veces = error recuperable.
  Degradación segura: si la BD no tiene la columna (PGRST204), pasa a modo
  legacy sin guardia — idéntico al comportamiento de main, el guardado jamás
  se rompe.
- **Cableado**: los tres writes del wizard (autosave, Finish, Postpone) van
  por la guardia cuando hay usuario autenticado.
- **Orden seguro de deploy**: migración PRIMERO, frontend después (acoplamiento
  documentado; producción solo con GO).

### Pruebas

- **Unit 7/7** (`profile-write-guard.spec.ts`): escenario exacto de
  reordenación (abort → write fresco → entrega tardía del obsoleto → fila
  intacta), supersede cross-tab con resync+reintento único, doble derrota =
  error (nunca éxito falso), degradación PGRST204, error de lectura no-204,
  fila ausente, seq monotónico con una sola lectura.
- **Integración 2/2 contra PostgreSQL QA real**
  (`profile-write-guard-integration.spec.ts`, proxy de retención + cliente
  supabase-js real + cuentas desechables):
  1. El UPDATE obsoleto abortado, retenido en la red y entregado DESPUÉS
     del write fresco, es rechazado por el CAS (0 filas): fila fresca
     intacta, `profile_write_seq=2`.
  2. Dos pestañas compiten con el mismo seq: el servidor arbitra limpio —
     la perdedora resyncea, reintenta y gana; la fila queda con todos los
     campos de UNA escritura, nunca mezcla.
- Nota de comportamiento real descubierta: supabase-js **resuelve** (no
  rechaza) las peticiones abortadas con `{ error: AbortError }`; la guardia
  lo trata como error truthy (nunca éxito) y el coordinator lo mapea a
  superseded.

## R3.5 Observación 5 — iOS Safari y H1

- **iOS Safari: BLOCKED** (sin dispositivo/emulador Apple en el entorno).
  Se mantiene como pendiente de validación manual con checklist definido en
  rev.2 §R2.5 (Get Latest PIN, flujo completo con Web Locks reales, freeze
  en background).
- **H1 (timeouts PostgREST)**: se mantiene como **hipótesis monitorizada**,
  no causa demostrada del caso concreto. Esta revisión añade un dato: el
  proxy de retención contra PostgREST QA mostró latencias normales (<1 s
  con entrega controlada), sin evidencia de timeouts del gateway; H1 queda
  para observación en producción (logs ya instrumentados via eventos de
  timeout tipificados).

## R3.6 Regresión post-reconciliación (build `25955aa`, Supabase QA real)

**Integridad de las tres rutas:** onboarding **Finish** 1/1 PASS (transición
canónica persistida y sobrevive reload, con la guardia CAS activa);
**Postpone** 1/1 PASS (resolución acotada, persistencia, wizard reanuda);
**CV** (upload → persistence → replace → remove, ZERO DIFF) **PASS 2×**
consecutivas; documentos profesionales y PNG PASS.

**Causa raíz del flaky de telemetría CV (rev.2) identificada:** la app emite
ambos `document_upload_started` (verificado con sonda instrumentada), pero el
lote del primer upload puede irse en el flush de `pagehide` durante el reload
que hace el spec — invisible para la captura `page.on('request')` de
Playwright. El spec pasa cuando el flush periódico (~9 s) dispara antes del
reload (carrera ~50-70%). No es un defecto de la app; quedará como nota para
endurecer la ventana de sondeo del spec en una iteración futura (fuera de
alcance de esta revisión).

**Desvío del entorno QA detectado y corregido (ajeno a la rama):**
`pb_create_client_notification` había perdido el `REVOKE EXECUTE` de sql/027
(ACL por defecto = PUBLIC; anon recibía 400 P0001 en vez de 401). Restaurado
el ACL exacto de sql/027 vía migración trackeada
(`pb_auth_lock_rev3_restore_027_rpc_acl`); verificado con curl anon → 401;
`notifications-hardening` 11/11 PASS. Sin relación con los cambios de la
rama (verificado por diff); la restauración re-aplica hardening ya revisado
del repo, no lo relaja.

**Matriz final rev.3 (todas las suites salvo `prod-stale-smoke`/
`stale-crossdeploy`, excluidos como siempre en QA local):**

| Resultado | Conteos |
|-----------|---------|
| **PASS** | **766 + 11 (notifications restauradas) + 1 (CV re-ejecutada) = 778 efectivos** |
| FAIL ambientales/preexistentes (desglose abajo) | 26 |
| Skipped (puertas de entorno dentro de los specs) | 11 |
| Did not run (dependencias seriales tras los BLOCKED) | 26 |
| **FAIL atribuibles a la rama** | **0** |

Desglose de los 26 FAIL (todos con causa verificada, ninguno de la rama):
preview-smoke ×8 (`/api/config` 500 local), public-routes/tool-landing ×6
(contratos del Worker de producción), namespace `qa*@pipingbox.com` ×7
(precondición de cuentas interna), `secure-file-access-broker` ×2
(`E2E_WORKER_EMAIL` no disponible), schema-contract ×2 (columnas protegidas
P0001 preexistente), referrals T1 ×1 (0/6 `referral_code`).

**Nuevas suites rev.3:** `profile-write-guard` 7/7,
`profile-write-guard-integration` 2/2 (QA real), `auth-lock-cross-tab` 12/12,
E2E multi-tab 2/2 (incluida pestaña congelada), `onboarding-finish-e2e` 1/1
con CAS activo. Todas las suites de rev.1/rev.2 siguen PASS.

## R3.7 Recomendación de integración

1. **Orden seguro:** migración `sql/029` → frontend PR #68 → PR #66 (o
   conjuntas si se prefiere, respetando migración-primero). La PR #68 ya
   incluye main; la PR #66 debe rebasarse sobre la #68 al fusionar.
2. **GO para revisión/merge de la PR #68** tras: gate TypeScript oficial en
   PASS sobre el head final de esta revisión (25955aa + informe) — el gate
   de `10f3733` ya pasó y el diff posterior es el descrito en R3.3/R3.4
   (typecheck local exit 0, 0 errores).
3. **Pendientes fuera de esta revisión:** validación manual iOS Safari
   (BLOCKED), decisión sobre H1, endurecimiento de la ventana de sondeo del
   spec de telemetría CV.
4. **NO MERGE / NO DEPLOY** sin GO explícito. Producción sin tocar; cuentas
   reales sin tocar (solo cuentas sintéticas desechables).
