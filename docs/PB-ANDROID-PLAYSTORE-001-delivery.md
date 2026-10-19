# PB-ANDROID-PLAYSTORE-001 — PIPINGBOX Industrial Tools (Android / Google Play)

**Estado: GO DESARROLLO EJECUTADO — PROYECTO TWA + AAB DE PRUEBA GENERADOS — NO-GO PUBLICACIÓN / NO MERGE / NO DEPLOY / NO CUENTAS / NO PAGOS**

Rama: `feat/pb-android-playstore-001` (base `main` = `54632cee` merge PR #85).
Carpeta Android: `android/twa/` (Bubblewrap). Assets de marca: `android/assets/`.
Documentos hermanos: `docs/PB-ANDROID-PLAYSTORE-001-play-listing.md` (ficha, privacidad, Data Safety), `docs/PB-ANDROID-PLAYSTORE-001-qa.md` (evidencias).

---

## A. Auditoría de viabilidad Android — veredicto

**TWA es viable y es la opción recomendada.** Fundamentos verificados en código y en producción:

| Requisito TWA | Estado en `pipingbox.com` | Evidencia |
|---|---|---|
| HTTPS + dominio estable | OK | `https://pipingbox.com` (Cloudflare Worker `src/worker.ts`) |
| Web App Manifest | OK (`/site.webmanifest`, `display: standalone`, iconos 192/512 + maskable) | `app/frontend/public/site.webmanifest`, PB-PWA-IDENTITY-001 |
| Digital Asset Links | **Fichero servido pero vacío (`[]`)** → bloqueante hasta tener SHA-256 de Play App Signing | `app/frontend/public/.well-known/assetlinks.json`; `curl https://pipingbox.com/.well-known/assetlinks.json` → `[]` |
| Service worker / offline | Antes: ninguno (`/sw.js` → 404). Ahora: fallback offline navigation-only, registrado SOLO desde el canal Android | `public/sw.js`, `public/offline.html`, `src/lib/registerOfflineFallback.ts` |
| Rutas de herramientas | `/tools?t=<key>` (query param; 13 herramientas operativas) | `src/pages/Tools.tsx`, `SPA_ROUTE_CONTRACT.ts` |
| Checkout externo para bienes digitales | **Bloqueado en dos capas** en el canal Android: banner de `/tools` oculto y paywall premium completo sin precios ni CTA de pago; `redirectToCheckout()` sale en corto antes de cualquier llamada a Stripe | `Tools.tsx` (`!androidApp && !premiumStatus.isPremium`), `src/lib/stripe.ts` (`if (isAndroidTwa()) return { ok: false, reason: 'not_available' }`), `components/premium/PremiumGate.tsx` |
| Permisos Android | **Cero permisos declarados** (ni `INTERNET`: la red la gestiona el navegador del dispositivo; sin notificaciones, ubicación ni cámara). El único `uses-permission` del manifest fusionado es `com.pipingbox.tools.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`, auto-generado por `androidx.core` con nivel de protección "signature" | `android/twa/app/src/main/AndroidManifest.xml`; `aapt2 dump permissions app-release.apk` |

Riesgos de la política "Minimum functionality / webview wrapper": una TWA es un formato soportado por Google (Chrome Custom Tabs verificadas), pero Play exige que la app sea funcional y estable, y rechaza apps cuya experiencia es "una web en un marco". Mitigación: start URL directa a `/tools` (no a la landing), shortcuts Android a 4 herramientas, splash/iconos nativos, página offline y catálogo filtrado solo a herramientas operativas. Ver dossier regulatorio en `PIPINGBOX-BRAIN` (sección 4).

## B. Comparativa TWA frente a alternativas

| Opción | Reutiliza web | Esfuerzo | Riesgo política Play | Offline real | Coste mantenimiento | Veredicto |
|---|---|---|---|---|---|---|
| **TWA (Bubblewrap)** | 100 % | Bajo (hecho en este ticket) | Medio (webview-wrapper; mitigado) | Parcial (SW; cálculos puros podrían cachearse en fase 2) | Muy bajo (una sola base de código) | **Recomendada v1** |
| Capacitor (WebView + plugins) | 100 % del frontend, bundle embebido | Medio (2-4 semanas: build nativo, plugins, actualizaciones por tienda) | Bajo | Total (bundle local) | Medio (dos pipelines de release) | Alternativa si Play rechaza TWA |
| React Native / Flutter | 0 % UI; motores TS reutilizables parcialmente | Alto (3-6 meses) | Bajo | Total | Alto | Descartada para v1 |
| Kotlin nativo | 0 % | Muy alto | Bajo | Total | Muy alto | Descartada |

Decisión propuesta: TWA. No se cambia de tecnología sin revisión PO; si Play rechazara la app por "minimum functionality", la ruta de escape es Capacitor con el bundle Vite embebido (mismo código, misma identidad, mismo package name `com.pipingbox.tools`).

## C. Inventario real de herramientas utilizables (auditoría de código)

13 herramientas con `implemented: true` en `src/pages/Tools.tsx`; 2 "coming soon" (`thermal-expansion`, `reynolds`) que la app Android **oculta** (`visibleTools`).

| Key | Categoría PO | Motor canónico | Red | Login/premium | Veredicto v1 |
|---|---|---|---|---|---|
| `pipe-dimensions` | A Tuberías | `src/tools/core` (B36.10/B36.19 embebido) | No | No | GO |
| `wall-thickness` | A Tuberías | inline `Tools.tsx` (B31.3 §304.1.2) | No | No | GO (instrumentado) |
| `flanges` | B Bridas | `src/tools/data` (B16.5 150/300) | No | Export premium | GO (consulta gratis) |
| `bolts-nuts` | C Stud Bolts | `src/tools/data` (B16.5 stud bolts) | No | Export premium | GO |
| `mitered-elbow` | D Codos | `src/tools/miters` | No | No | GO |
| `elbow-cut` | D Codos | `src/tools/elbow-cut` | No | PDF premium | GO |
| `pipe-offset` | D Codos/offsets | `src/tools/prefabrication/offsets` | No | No | GO |
| `pipe-comb` | D Accesorios | `src/tools/pipe-comb` | No | No | GO |
| `accessories-library` | D Accesorios | `src/tools/catalog` + `public/catalog/*.json` (fetch) | **Sí (catálogo)** | No | CON RESERVAS (requiere red; informar) |
| `branch-layout` | E Branch | `src/tools/branch/*` | No | Plantilla PDF premium | GO |
| `unit-converter` | F Conversor | `src/tools/core/units` | No | No | GO |
| `pressure-drop` | (extra) | `src/tools/core` | No | No | GO |
| `color-lookup` | (extra) | `src/tools/color-lookup` (RAL) | No | No | GO |

Gaps frente a lo que pide el PO (no se inventan): no existe "compatibilidad automática espárrago↔brida" como asistente guiado (hoy son tablas por clase/NPS); el conversor no tiene conversión de caudal/par de apriete; `thermal-expansion` y `reynolds` no están implementados y quedan fuera. Informe detallado de la auditoría (archivo:línea, riesgos móvil, decimales) en PIPINGBOX-BRAIN `brain/06-EXECUTION/TICKETS/PENDING/PB-ANDROID-PLAYSTORE-001.md`.

Premium: principio actual "free to consult, premium to export" (`src/lib/premium.ts`). En la app Android se consulta todo gratis; la exportación premium muestra una variante del paywall **sin precios ni botón de compra**, con el mensaje `tools.androidExportUnavailable` (11 idiomas) que remite a la web. El `useEffect` que carga precios de Stripe no se ejecuta en Android (ver §G riesgos).

## D. Arquitectura propuesta e implementada

```
Google Play (AAB com.pipingbox.tools, Play App Signing)
   │ instala
   ▼
TWA LauncherActivity (androidbrowserhelper 2.6.x, minSdk 24, target/compile 36)
   │ abre en Chrome (fallback Custom Tabs) con Digital Asset Links verificados
   ▼
https://pipingbox.com/tools?pb_app=android   ← start URL (ABRIR → CALCULAR → RESULTADO)
   │  shortcuts: branch-layout · pipe-offset · bolts-nuts · unit-converter
   ▼
SPA existente (React/Vite)
   ├─ src/lib/appChannel.ts        canal web | android_twa (query ?pb_app, referrer android-app://, flag sticky)
   ├─ src/pages/Tools.tsx          oculta banner Stripe + tools no implementadas si android_twa
   ├─ src/lib/stripe.ts            redirectToCheckout() → not_available si android_twa (kill switch de pago)
   ├─ src/components/premium/PremiumGate.tsx  paywall sin precios ni CTA en android_twa
   ├─ src/lib/observability.ts     super-property app_channel + eventos tool_opened/calculation_*/*_cta_clicked
   ├─ src/lib/registerOfflineFallback.ts → public/sw.js (navigation-only) → public/offline.html (11 idiomas)
   └─ Auth/Supabase/i18n            SIN CAMBIOS (misma sesión, mismos usuarios, mismo i18n)
```

Decisiones técnicas:
- `packageId` definitivo propuesto: **`com.pipingbox.tools`**. `versionCode 1`, `versionName 0.1.0`.
- Detección de canal sin cookies ni PII: marcador de query en start URL y shortcuts, `document.referrer` `android-app://com.pipingbox.tools/`, flag sticky en **`sessionStorage`** (no `localStorage`): así el marcador de canal Android no se filtra a pestañas normales de Chrome que comparten el mismo origen, evitando que un usuario que luego abre `pipingbox.com` en el navegador quede clasificado como `android_twa` y pierda el acceso al checkout web.
- No se crea segunda base de usuarios ni nuevos métodos de auth. Google OAuth en TWA funciona en el Chrome del dispositivo (misma sesión que el navegador); el callback `/auth/callback` ya está en el contrato de rutas.
- El SW es deliberadamente mínimo para no interferir con PB-PWA-UPDATE-CACHE-001 (pendiente) ni con la detección de versión estancada (`appVersion.ts`): nunca cachea `index.html`, bundles ni `/version.json`.
- `compileSdk`/`targetSdk` **36** canónico en `android/twa/app/build.gradle`, sin parches ni propiedades condicionales en el repositorio. La verificación local se hizo en un sandbox `aarch64` cuyo único `aapt2` ejecutable (Debian 2.19) no puede leer el `resources.arsc` de `platforms/android-36` ni `android-35` (`RES_TABLE_TYPE_TYPE entry offsets overlap actual entry data`); para ese entorno se usa un **init script de Gradle externo al repo** (`-I sandbox-init.gradle`) que baja `compileSdk` a 34 y degrada `androidx.browser`/`androidx.core`. **El AAB candidato a Play debe compilarse en CI x86_64 sin ese init script**, con `compileSdk 36` y las versiones canónicas.

## E. Prototipo de navegación Android

Flujo: icono → splash (fondo `#0B0B0D`, marca naranja) → `/tools?pb_app=android` (catálogo de 13 tarjetas, tema oscuro) → tarjeta → herramienta → resultado. Botón atrás de Android = historial del SPA. Shortcuts de launcher (pulsación larga) a 4 herramientas. Enlaces a `/jobs`, `/register`, `/login` permanecen accesibles desde el shell existente y se abren dentro de la TWA (mismo origen, `fullScopeUrl https://pipingbox.com/`). Enlaces a otros orígenes (p. ej. OAuth de Google) se abren como Custom Tab y regresan al scope.

## F. Diseño visual inicial (para revisión PO)

Assets generados desde la marca oficial (`public/assets/logos/logo-icon.png`) con script reproducible `android/assets/generate-assets.mjs`:
- `icon-512.png` — icono Play (fondo negro `#0B0B0D`, marca `#E8611A`).
- `icon-maskable-512.png` — icono adaptable (fondo naranja, marca blanca, zona segura 80 %).
- `icon-monochrome-512.png` — icono temático Android 13+.
- `splash-1024.png` — splash.
- `feature-graphic-1024x500.png` — gráfico destacado (borrador).

Nombre en launcher: **PIPINGBOX Tools**; nombre completo: **PIPINGBOX Industrial Tools**. Tipografía Inter (ya en la web). Pendiente PO: aprobar paleta de iconos (negro/naranja vs naranja/blanco) y texto del feature graphic.

## G. Riesgos y dependencias

| # | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| 1 | `assetlinks.json` vacío → la TWA abre con barra de URL (parece web) | Alta hasta publicar | Alto | Rellenar con SHA-256 de Play App Signing (se obtiene en Play Console tras crear la app, antes de la primera release) y desplegar web — **requiere deploy web autorizado** |
| 2 | Rechazo por "minimum functionality" | Media | Alto | Start URL en `/tools`, shortcuts, offline page, catálogo filtrado; plan B Capacitor |
| 3 | Gating premium sin camino de compra en Android (export/print) | Media | Medio | Mitigado en v1: paywall sin precios ni CTA, copy "disponible en pipingbox.com" sin enlace a checkout. Fase 2: Play Billing (PB-ANDROID-MONETIZATION-001) |
| 4 | `accessories-library` necesita red | Baja | Bajo | Mensaje de error existente; informar en ficha |
| 5 | Decimales con coma (locales ES/PT/DE…) en inputs `type=number` | Media | Medio | Auditar inputs (`inputMode="decimal"`); Android teclado numérico ya aparece con `type=number` |
| 6 | Dependencia de PR #85/#86 | — | — | Rama parte de `main` tras merge #85; no toca Marketplace/Auth/Email |
| 7 | Deploy web necesario para `sw.js`, `offline.html`, assetlinks | — | Bloqueante publicación | Fuera del GO actual; coordinar con release normal |

## H. Estimación de esfuerzo y costes

- Hecho en este ticket: toolchain, proyecto TWA, AAB/APK de prueba, canal + analítica + offline, tests, documentación.
- Pendiente técnico: firma definitiva + assetlinks (0,5 d), QA en dispositivos reales (1-2 d), capturas finales (0,5 d), CI job `android-aab` (0,5 d).
- Costes externos: Google Play Console organización **25 USD únicos**; D-U-N-S gratuito (plazo semanas); dominio/hosting ya existentes; sin SDKs nuevos. Sin costes recurrentes.

## I. Plan de implementación por fases

1. **F0 (este ticket):** viabilidad, proyecto TWA, AAB de prueba, canal, analítica, offline fallback, docs. ✅
2. **F1 (PO + legal):** entidad belga → cuenta Play de organización → D-U-N-S → perfil de pagos → crear app → obtener SHA-256 → rellenar `assetlinks.json` → deploy web (release ordinaria).
3. **F2 (técnico, tras F1):** build AAB con firma de subida definitiva (clave en gestor de contraseñas del PO), closed testing, pre-launch report, capturas reales, Data Safety.
4. **F3:** publicación (decisión PO), medición PostHog por `app_channel`, iteración de UX móvil (inputs decimales, tablas).
5. **F4 (opcional, PB-ANDROID-MONETIZATION-001):** Play Billing / derechos unificados.

## J. Checklist Google Play Console empresarial (acciones manuales PO)

- [ ] Entidad jurídica belga constituida (nombre legal, dirección, nº empresa KBO/BCE).
- [ ] Obtener D-U-N-S (gratuito, Dun & Bradstreet; puede tardar hasta 30 días).
- [ ] Cuenta Google corporativa dedicada (no personal) con 2FA.
- [ ] Registro Play Console tipo **Organización**, pago 25 USD, verificación de identidad de la organización y del representante.
- [ ] Datos públicos de desarrollador: nombre legal, email de contacto, teléfono, dirección (visibles al público en la UE; obligaciones DSA/"trader").
- [ ] Perfil de pagos (solo necesario si en el futuro hay IAP).
- [ ] Crear app `com.pipingbox.tools`, activar Play App Signing, copiar SHA-256 del certificado de firma → entregar a ingeniería para `assetlinks.json`.
- [ ] Generar y custodiar la clave de subida (upload key) fuera de Git; nunca usar la clave de desarrollo de este ticket.
- [ ] Aprobar iconos, feature graphic, capturas y textos de la ficha (`docs/PB-ANDROID-PLAYSTORE-001-play-listing.md`).
- [ ] Publicar URL de política de privacidad actualizada (`/privacy`) con mención a PostHog y al canal Android.
- [ ] Rellenar Data Safety con el borrador adjunto; clasificación de contenido IARC (herramienta profesional, sin UGC).
- [ ] Decidir GO/NO-GO de closed testing → producción.

## K. Evidencias QA (ejecutadas en esta rama)

| Verificación | Comando | Resultado |
|---|---|---|
| Contrato de rutas SPA | `node scripts/route-contract-guard.ts` (dentro de `npm run build`) | PASS — 63 declaraciones `App.tsx` ↔ 62 entradas del contrato alineadas, con `/offline.html` añadido a `STATIC_WELL_KNOWN_PATHS` |
| Build web de producción | `npm run build` (`app/frontend`) | ✅ `built in 34.62s`; genera `dist/index.html`, `dist/sw.js`, `dist/offline.html` |
| Typecheck | `npm run typecheck` (`tsc -p tsconfig.app.json --noEmit`) | ✅ sin errores |
| Lint de archivos tocados | `npx eslint --quiet` sobre `appChannel`, `registerOfflineFallback`, `stripe`, `observability`, `PremiumGate`, `Tools`, `main` | ✅ sin hallazgos |
| Pruebas de guarda | `npx playwright test tests/android-twa-channel.spec.ts tests/monetization-guard.spec.ts tests/onboarding-postpone.spec.ts tests/phone-whatsapp-foundation.spec.ts` | ✅ **32/32 passed** |
| Build Android (AAB + APK) | `./gradlew bundleRelease assembleRelease` (sandbox arm64 con init script externo) | ✅ `BUILD SUCCESSFUL`; AAB 1 604 258 B, APK 1 525 093 B |
| Firma del AAB | `jarsigner -verify` | ✅ `jar verified` (clave de **desarrollo**, no de producción) |
| Validación del bundle | `bundletool validate --bundle app-release.aab` | ✅ módulo base válido |
| Identidad del paquete | `aapt2 dump badging app-release.apk` | `com.pipingbox.tools`, `versionCode 1`, `versionName 0.1.0`, `minSdk 24`, `targetSdk 36`, label `PIPINGBOX Industrial Tools`, launcher `PIPINGBOX Tools` |
| Permisos | `aapt2 dump permissions app-release.apk` + manifest fusionado | Cero permisos declarados; solo `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` (signature) |
| Secretos de firma | `git status` / `.gitignore` de `android/twa` | Keystore y contraseña fuera del repo (contraseña solo en el entorno local del sandbox) |

Notas de QA: el `compileSdkVersion` reportado por `badging` es 34 **solo** porque el binario local se compiló con el init script del sandbox arm64 (ver §D); `targetSdk` permanece en 36. Pendiente de F2: instalación y navegación en dispositivos Android reales, deep links verificados con `assetlinks.json` real, pre-launch report de Play.

## Estado GO/NO-GO

| Ítem | Estado |
|---|---|
| Investigación, arquitectura, desarrollo, AAB de prueba, QA estática | **GO ejecutado** |
| Publicación Play / cuentas / pagos / merge a main / deploy web / cambios auth / Marketplace | **NO-GO (sin tocar)** |
