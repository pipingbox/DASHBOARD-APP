# PB-ANDROID-PLAYSTORE-001 — Ficha Google Play, privacidad y Data Safety (borradores)

**Estado: BORRADOR PARA REVISIÓN PO — nada publicado.**

## 1. Identidad de la app

| Campo | Valor propuesto |
|---|---|
| Package name | `com.pipingbox.tools` |
| Nombre en Play (máx. 30) | `PIPINGBOX Industrial Tools` (26) |
| Nombre en launcher | `PIPINGBOX Tools` |
| versionCode / versionName | `1` / `0.1.0` |
| Categoría | Herramientas (alternativa: Productividad) |
| Público objetivo | Adultos (18+), profesionales |
| Clasificación de contenido | IARC — sin contenido sensible, sin UGC, sin compras (v1) |
| Precio | Gratis, sin anuncios, sin compras in-app en v1 |
| Política de privacidad | `https://pipingbox.com/privacy` |
| Contacto | `support@pipingbox.com` |

## 2. Descripción corta (máx. 80 caracteres)

- **EN:** `Pipefitting calculators: branch layout, offsets, bolts, flanges. No sign-up.` (78)
- **ES:** `Calculadoras de tubería: branch layout, offsets, espárragos, bridas. Sin registro.` (80)

## 3. Descripción completa (EN, máx. 4000)

```
PIPINGBOX Industrial Tools brings the free professional calculators of pipingbox.com to your Android device. Built for pipefitters, welders, tube fitters, piping supervisors and QA/QC technicians.

Open the app, pick a tool, enter your data, get the result. No account required.

TOOLS INCLUDED
• Branch layout — pipe-to-pipe, pipe-to-elbow and elbow-to-elbow intersections with developed templates.
• Elbow cut — cut angles and dimensions for elbow segments.
• Pipe offsets — simple and rolling offsets, travel and run.
• Mitered elbows — segment geometry for fabricated miters.
• Pipe comb — multi-pipe layout spacing.
• Stud bolts — ASME B16.5 stud bolt sizes and lengths by flange class.
• Flanges — ASME B16.5 Class 150 / 300 dimensions.
• Pipe dimensions — ASME B36.10 / B36.19 schedules, NPS/DN, wall thickness and weight.
• Wall thickness — ASME B31.3 minimum required thickness.
• Pressure drop — quick hydraulic estimate.
• Unit converter — length, diameter (NPS/DN), pressure, temperature.
• RAL colour lookup.
• Accessories library — ASME B16.9 fittings catalog (requires connection).

METRIC AND IMPERIAL
Work in mm or inches. Results are shown with the units you choose.

11 LANGUAGES
English, Spanish, Portuguese, Dutch, French, German, Italian, Polish, Romanian, Bulgarian, Ukrainian.

PART OF THE PIPINGBOX ECOSYSTEM
Optionally create a free professional profile, browse industrial job offers and access the PIPINGBOX platform. Calculators stay free without an account.

Results are engineering aids. Always verify against the applicable code, drawings and your company procedures.
```

## 4. Capturas de pantalla propuestas (teléfono, 9:16, mín. 2, máx. 8)

1. Catálogo `/tools` (tema oscuro, 13 tarjetas).
2. Branch layout con diagrama SVG y resultado.
3. Pipe offset con resultado.
4. Stud bolts — tabla por clase/NPS.
5. Pipe dimensions — NPS/DN/schedule.
6. Unit converter.
7. Página offline (opcional, muestra robustez).

Las capturas definitivas se toman en dispositivo real / emulador tras la F1 (ver QA). Icono 512×512 y feature graphic 1024×500 en `android/assets/`.

## 5. Política de privacidad — adenda propuesta para `/privacy`

Añadir en "4. Cookies and Analytics" y "6. Third-Party Services":

> **Product analytics (PostHog).** We use PostHog to measure which tools are used and whether calculations complete, so we can improve them. IP addresses are anonymised, session recordings are disabled, and we never send the values you enter or the results you obtain. Events include a technical channel marker (`web` or `android_twa`) to distinguish the Android app from the website.

> **Android app.** PIPINGBOX Industrial Tools for Android is a Trusted Web Activity that displays pipingbox.com inside the app. It requests no Android permissions other than Internet access, stores no data on your device beyond standard browser storage (language preference, session if you sign in, channel marker), and contains no advertising SDKs.

> **Account deletion.** You can request deletion of your account and associated data at support@pipingbox.com. *(Play requiere además una URL web de eliminación de cuenta si la app permite crear cuentas: propuesta `https://pipingbox.com/privacy#delete-account`; implementar sección/ancla en la página antes de publicar.)*

## 6. Data Safety — borrador

| Pregunta | Respuesta propuesta | Base |
|---|---|---|
| ¿Recopila o comparte datos de usuario? | Sí (analítica y, opcionalmente, cuenta) | PostHog, GA4, Supabase Auth |
| ¿Todos los datos se cifran en tránsito? | Sí (HTTPS) | Cloudflare/Supabase |
| ¿Permite solicitar eliminación de datos? | Sí (email + URL) | Pendiente ancla `/privacy#delete-account` |
| **Información personal** — email, nombre | Recopilado, **opcional** (solo si el usuario crea cuenta), finalidad: funcionalidad de la app / gestión de cuenta. No compartido. | Supabase Auth |
| **Actividad en la app** — interacciones (herramienta abierta, cálculo completado) | Recopilado, finalidad: analítica. No compartido con terceros para publicidad. No vinculado a identidad si no hay login. | PostHog (`tool_key` enum, nunca inputs) |
| **IDs de dispositivo u otros** | Recopilado (identificador anónimo de analítica) | PostHog distinct_id / GA client id |
| Ubicación, contactos, fotos, archivos, salud, financieros | **No se recopilan** | Sin permisos |
| Datos usados para publicidad/segmentación | **No** | Sin SDKs publicitarios |
| ¿Hay compras? | No (v1) | — |

Nota: GA4 (`gtag`) ya está en la web; si el PO prefiere declarar solo PostHog, hay que desactivar GA4 en el canal Android (cambio frontend pequeño, no incluido).

## 7. Checklist de cumplimiento Google Play (resumen)

- [x] Target SDK 36 (≥ 35 exigido para apps nuevas en 2025-2026).
- [x] Android App Bundle (AAB) — formato obligatorio.
- [x] Cero permisos declarados (ni `INTERNET`; la red la gestiona el navegador). Único `uses-permission` fusionado: `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` (signature, `androidx.core`). Sin notificaciones, sin ubicación.
- [x] Sin anuncios, sin SDKs comerciales nuevos.
- [ ] Digital Asset Links publicados con SHA-256 de Play App Signing (requiere F1 + deploy web).
- [ ] URL de política de privacidad actualizada (adenda §5).
- [ ] Data Safety enviado (borrador §6).
- [ ] Clasificación IARC completada.
- [ ] Closed testing + pre-launch report sin crashes.
- [ ] Capturas, icono 512, feature graphic aprobados por PO.
- [x] Sin enlaces a checkout externo para bienes digitales dentro de la app: banner Stripe de `/tools` oculto, `redirectToCheckout()` deshabilitado por canal en `src/lib/stripe.ts`, y `PremiumGate` renderiza el paywall sin precios ni CTA de pago (`tools.androidExportUnavailable`, 11 idiomas).
