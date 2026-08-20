# ATOMS SOURCE EXPORT — `app.pipingbox.com` — 2026-08-20

Codigo **fuente** del proyecto de Atoms que sirve `app.pipingbox.com`, obtenido por
`Share → Export` y depositado por Gaspar. Primera copia del fuente real de produccion que
existe en Git.

Ticket: **PB-DRIFT-001**, fase **DRIFT-B.3**.
Rama: `atoms/source-export-2026-08-20`. **No mergeada a `main`.**

---

## 1. Procedencia e integridad

| Dato | Valor |
|---|---|
| Fichero entregado | `APLICACIÓN DE PANEL.zip` |
| Tamaño | 49.720.452 B |
| SHA-256 del zip | `900589ffc0d2230dff68ce5b67e47fdf4ee55e80f7aafc95bdfe3059918e2cb6` |
| Ficheros extraidos | 825 |
| Bytes extraidos | 54.226.045 |
| Obtenido por | Gaspar, manualmente (Atoms no puede escribir en Git — riesgo D10) |

El zip **no se versiona**: se versiona el arbol extraido. El contenedor queda en
`recovery/atoms-export/` (ignorado por `.gitignore`) y su hash queda anclado en esta tabla.
Hashes fichero a fichero en `../SHA256SUMS-atoms-source-export-2026-08-20.txt`.

### Es fuente, no build

Verificado antes de aceptarlo: **0 entradas** bajo `node_modules/`, `dist/`, `build/` o `.next/`.
El arbol trae `src/` con TSX legible. Es lo que se pidio.

---

## 2. Contenido

| Raiz | Ficheros | Que es |
|---|---:|---|
| `app/frontend/` | 633 | La aplicacion. Ver el desglose de abajo |
| `uploads/` | 157 | Adjuntos del chat con Atoms: capturas, imagenes de ChatGPT, 130 `paste-text (n).txt`. Ruido, no codigo |
| `pidm/catalog/` | 17 | YAML del catalogo PIDM |
| `assets/images/` | 12 | Imagenes sueltas |
| `.atoms/` | 3 | `ARCHITECTURE.md`, `ATOMS.md`, `PROGRESS.md` — notas internas de la herramienta |
| `supabase/functions/` | 1 | `backfill-profiles` |
| `.mgx/`, `.wiki.md` | 2 | Metadatos de Atoms |

Los 633 de `app/frontend/` **no son un solo arbol**, son dos (seccion 4).

---

## 3. Hallazgo F1 — las 7 rutas huerfanas estan aqui. **D1 tiene cierre.**

| Ruta | Fichero | Bytes |
|---|---|---:|
| `/forgot-password` | `app/frontend/src/pages/ForgotPassword.tsx` | 6.832 |
| `/reset-password` | `app/frontend/src/pages/ResetPassword.tsx` | 12.113 |
| `/company/billing` | `app/frontend/src/pages/company/CompanyBilling.tsx` | 3.038 |
| `/company/settings` | `app/frontend/src/pages/company/CompanySettings.tsx` | 3.053 |
| `/company/documentation` | `app/frontend/src/pages/company/CompanyDocumentation.tsx` | 14.269 |
| `/privacy` | `app/frontend/src/pages/Privacy.tsx` | 7.495 |
| `/terms` | `app/frontend/src/pages/Terms.tsx` | 7.573 |

Las 7 estan declaradas en `app/frontend/src/App.tsx` y **su fuente ya esta en Git**. El riesgo de
que un deploy automatico las borrase deja de depender de un unico proveedor.

### Deuda de verificacion — SALDADA

Quedaba pendiente descartar un tercer nivel de drift: que el fuente de Atoms no coincidiera con lo
que Atoms tiene *publicado*. Se ha comprobado.

Las **37 declaraciones `path=`** de `App.tsx` se han contrastado una a una contra el bundle
archivado de produccion (`index-BMTgXtS_.js`, rama `recovery/production-snapshot-2026-08-20`):

```
rutas declaradas en el fuente:      37
ausentes en el bundle publicado:     0
```

**Atoms-fuente = Atoms-publicado.** No hay tercer nivel de drift. El fuente que tenemos es el que
corre. Lo contrario habria significado que ni siquiera Atoms sabia que estaba sirviendo.

---

## 4. Hallazgo F2 — hay un arbol fosil del repositorio dentro del proyecto de Atoms

`app/frontend/` contiene **dos** arboles completos:

| Arbol | Ficheros | Que es |
|---|---:|---|
| `app/frontend/` | 358 | El proyecto **vivo**. Es lo que se compila y sirve |
| `app/frontend/app/frontend/` | 275 | Una **copia integra del repositorio Git**, anidada por error |

No es una suposicion. Comparado con `main` normalizando finales de linea:

```
copia anidada vs repositorio (sin dist/):   269 identicos | 6 distintos | 5 solo en el repo
```

Los 5 que faltan y los 6 que difieren son exactamente los tocados por `acf9ca9`, `8d51ed6` y
`a3f5c64`. Verificado fichero a fichero: la copia anidada **es el repositorio en su estado del
2026-07-08, commit `1286c8f`**.

### Que significa

Alguien intento en julio llevar el repositorio a Atoms subiendo el proyecto, y **aterrizo un nivel
por debajo**. Vite compila desde `app/frontend/`, asi que esos 275 ficheros nunca han entrado en
ningun build: son peso muerto invisible.

Explica el drift sin necesidad de mala fe ni de fallo del proveedor. Se creyo que la
sincronizacion se habia hecho. Nadie comprobo el destino. Desde entonces los dos arboles llevan
seis semanas divergiendo, y el que se publica es el que nadie estaba mirando.

Es el mismo patron que F0: **el trabajo se dio por hecho sin verificar donde habia caido.**

---

## 5. Hallazgo F3 — el repositorio y produccion son dos aplicaciones distintas

Comparacion del arbol **vivo** de Atoms contra `main`, sin `dist/` y normalizando saltos de linea:

| | Ficheros |
|---|---:|
| Identicos | 120 |
| Distintos | 82 |
| Solo en Atoms (= solo en produccion) | 156 |
| Solo en el repositorio (= nunca publicado) | 78 |

De 358 ficheros, **solo 120 coinciden**. Esto ya no es "el repo va un poco atrasado".

### Solo en produccion (156)

Modulos enteros que Git no conoce: `AcademyExam.tsx`, `AcademyModule.tsx`, `LessonRenderer.tsx`,
`lib/vca-lessons.ts`, `lib/vca-questions.ts`, `lib/academy-*.ts`, `certificate-generator.ts`,
6 componentes de `workforce/`, 4 de `beta/`, `betaFeedback.ts`, las Edge Functions
`cert-expiry-alerts`, `apply-rls-certifications` y `beta-feedback`, 3 migraciones SQL, 2 scripts
`sql/`, 3 articulos en `seo/content/`, mas las 7 paginas de F1.

**El motor del Academy con examenes y generacion de certificados vive solo en produccion.**

### Solo en el repositorio (78)

Trabajo terminado, commiteado y **jamas publicado**: `PricingPage.tsx`,
`EnterpriseDashboard.tsx`, `PublicWorkerProfile.tsx`, `VCAExamBookingPage.tsx`,
`PRLCoursePage.tsx`, `SCCCoursePage.tsx`, `academy/CourseDetail.tsx`, `academy/LessonView.tsx`,
los 15 ficheros de `lib/fittingsData/`, `lib/stripe.ts`, `lib/premium.ts`, `hooks/useCatalog.ts`,
`catalogCache.ts` y **once herramientas** de `src/tools/`.

Sobre las herramientas, comprobado en el bundle publicado: produccion sirve la implementacion
**antigua** (`components/tools/*Tool.tsx`, con "Bolts & Nuts"). `PrefabSuite`, `FlangeRating` y
`FittingTakeOff` **no aparecen**. `src/tools/registry.tsx` existe en el proyecto de Atoms, es
identico al del repo, importa modulos que alli no existen — y **nadie lo importa**, por eso el
build no rompe. Es otro fosil.

Consecuencia documental: la entrada de Brain v1.34 ("11 tools complete") es cierta *en Git* y
falsa *en produccion*. No se reescribe; se corrige con esta adenda.

---

## 6. Auditoria de seguridad del export

Ejecutada antes del commit sobre los 825 ficheros.

| Comprobacion | Resultado |
|---|---|
| `sk_live_` / `sk_test_` / `whsec_` / claves de Stripe | **Ninguna** |
| Claves privadas PEM, tokens de GitHub, AWS, Slack | **Ninguna** |
| Claves `service_role` de Supabase | **Ninguna.** Solo referencias por nombre y `Deno.env.get()` |
| Ficheros `.env` reales | **Ninguno.** Solo `.env.example` con placeholders |
| Datos personales de terceros en `uploads/` | **Ninguno.** Solo correo propio y buzones corporativos |

**Apto para commit.** Ningun secreto entra en el repositorio.

### F4 — regresion de TD-01 / DEC-36 (severidad MEDIUM)

`app/frontend/src/lib/supabase.ts` y `src/components/admin/AdminRegistros.tsx` traen la URL de
Supabase y la **anon key incrustadas en el codigo**. El repositorio hace lo correcto desde TD-01:

```
repo:  export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
atoms: export const SUPABASE_URL = 'https://mwdauubztjxkbrefirbg.supabase.co';
```

No es una fuga: la anon key es publica por diseño y ya viaja en el bundle. Pero significa que
**la correccion TD-01, registrada como resuelta en Brain v1.29, nunca llego a produccion.**
Mismo patron que F2 y que F0.

No se corrige aqui: este commit es una copia fiel, no una version mejorada. Se anota como deuda.

### F5 — `vercel.json` tambien vive en Atoms

Confirma lo dicho en DRIFT-A: es un artefacto muerto. Ningun host se sirve desde Vercel.

---

## 7. Que se ha commiteado y que no

| | |
|---|---|
| **Se commitea** | Los 825 ficheros, verbatim, sin editar, sin reordenar, sin "limpiar" |
| **No se commitea** | El `.zip` contenedor (ignorado; su SHA-256 queda arriba) |
| **No se toca** | `main`, `app/frontend/` del repositorio, produccion, Atoms, Cloudflare, Supabase |

Se conservan a proposito el arbol fosil anidado y las carpetas `uploads/`: son la evidencia de F2
y del modo de trabajo real. Depurarlos ahora destruiria la prueba. Se depuran, si procede, cuando
se decida B o C.

---

## 8. Estado de los riesgos

| # | Riesgo | Antes | Ahora |
|---|---|---|---|
| D1 | Un deploy automatico borraria 7 rutas de `app` | CRITICAL | **Fuente en Git y contrastado contra produccion. Listo para cerrar al aprobar la rama** |
| D3 | 7 satelites solo en Atoms | HIGH | Sin cambio. Requiere 7 exports mas |
| D10 | Atoms no puede escribir en Git | HIGH estructural | Confirmado en la practica: esta entrega ha sido manual |
| **D11** | **Divergencia estructural repo↔produccion: 238 de 358 ficheros no coinciden. Hay funcionalidad viva solo en produccion y trabajo terminado nunca publicado** | — | **CRITICAL — nuevo** |
| **D12** | **Arbol fosil del repositorio anidado dentro del proyecto de Atoms desde el 2026-07-08** | — | **MEDIUM — nuevo, es la causa mecanica del drift** |
| **D13** | **TD-01 (credenciales fuera del codigo) figura resuelto en Brain pero no en produccion** | — | **MEDIUM — nuevo** |

---

## 9. Lo que este export **no** autoriza

Tener el fuente no significa poder desplegarlo. Un `git push` que publicara `main` sobre
`app.pipingbox.com` **retiraria hoy mismo** el Academy con examenes, los certificados, el modulo
de workforce, el canal de beta feedback y las 7 rutas — porque `main` no los tiene.

La prohibicion de automatizar el deploy de `app` **sigue en pie**. Se levanta cuando exista un
arbol unificado y revisado, no antes.

Siguiente decision de Gaspar, ya sin terceras opciones: **B** (migrar el hosting fuera de Atoms) o
**C permanente** (Atoms como fuente unica con exports periodicos).
