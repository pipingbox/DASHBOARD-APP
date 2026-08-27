# Verificación Stripe test-mode → `app_marketplace_revenue_events`

**Ticket:** PB-MARKET-REVENUE-LIVEMODE-001
**Objetivo:** ejecutar VENTA → REEMBOLSO PARCIAL → DISPUTA → CIERRE DE DISPUTA en
Stripe **test mode** y confirmar que las filas aterrizan en
`app_marketplace_revenue_events` con `livemode = false`, con las comisiones
reales de Stripe, con los `event_type` correctos y con `app_orders`
correctamente transicionado — y demostrar, con cifras, que la consulta canónica
de ingreso real **excluye la prueba entera**.

Este documento es un **procedimiento ejecutable**, no una guía. Cada paso trae
su comando exacto, su resultado esperado y qué hacer si falla. Está escrito para
ejecutarse de arriba abajo sin improvisar nada en caliente. Toda ambigüedad que
quede aquí se convierte en una improvisación en tiempo de ejecución contra datos
de producción en una tabla append-only que **no se puede corregir después**.

---

## A. QUIÉN PUEDE EJECUTAR ESTO — Y QUIÉN NO

> ### El peor resultado posible no es que la prueba falle. Es que se ejecute a medias.
>
> Crear los cargos y **no poder leer el libro mayor** deja filas no verificadas,
> para siempre, en una tabla que no admite UPDATE ni DELETE. Nadie podrá decir
> después si aquella prueba salió bien. Esto se previene **por construcción**,
> comprobando el acceso ANTES de crear la primera transacción — no con cuidado.

**Necesita las DOS mitades. Ninguna sirve sin la otra:**

| Mitad | Qué exige | Sin ella |
| --- | --- | --- |
| **Escritura** | `sk_test_...` de Stripe del proyecto canónico | No puede crear las transacciones |
| **Lectura** | `SUPABASE_DB_URL` (conexión directa, rol `postgres`) **o** una sesión `authenticated` cuyo `app_is_admin()` sea `true` | Puede crear filas y **no puede verificarlas** |

**Por qué la lectura es el cuello de botella real.** La única política SELECT de
`app_marketplace_revenue_events` (`sql/005-revenue-events.sql` §4.1) admite
exclusivamente:

- `app_is_admin()`, o
- el instructor propietario, vía `app_marketplace_instructors.user_id = auth.uid()`.

Y `anon` **no tiene ningún GRANT** (`REVOKE ALL ... FROM anon`, §4.3). En
consecuencia:

- ❌ Una cuenta E2E de QA corriente: **no puede leer nada**. No es admin y no es
  el instructor de la orden.
- ❌ La clave `VITE_SUPABASE_ANON_KEY`: **no puede leer nada**.
- ✅ `SUPABASE_DB_URL` con el usuario `postgres`: salta RLS. Es el camino de este
  kit y todas las consultas SQL de abajo lo asumen.
- ✅ `service_role`: también salta RLS, pero **solo para SELECT** en esta prueba.
  Ver la sección 8: usarlo para escribir o borrar aquí destruye la propiedad por
  la que existe la tabla.

El bloqueo RLS que protege el libro mayor es, exactamente, lo que impide
verificarlo desde un entorno sin credenciales canónicas. Eso es correcto: la
tabla está bien diseñada. Significa que este kit **solo puede ejecutarlo un
agente con ambas mitades**.

```bash
# PUERTA DE ACCESO. Ejecútela ANTES que nada. Si falla, no cree ninguna transacción.
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -tAc \
  "SELECT count(*) FROM app_marketplace_revenue_events;" \
  && echo "OK: hay lectura del libro mayor. Puede continuar." \
  || echo "PARE: sin lectura del libro mayor. NO cree transacciones: quedarían sin verificar para siempre."
```

---

> ## ⛔ REGLAS DURAS — NO NEGOCIABLES
>
> **R1. `sql/006-revenue-events-livemode.sql` debe estar aplicado antes de crear
> la primera transacción.** Confirmado como aplicado por el PO, y aun así se
> re-verifica en el paso 1: confirmar un estado y re-verificarlo justo antes de
> una prueba irreversible son cosas distintas.
>
> **R2. Cualquier `livemode = NULL` en un evento generado por esta ejecución es
> STOP / FAIL inmediato.** No es un aviso ni una nota al pie. Se detiene la
> prueba, no se crean más transacciones y se diagnostica. Ver paso 9.
>
> **R3. NO SE BORRA NI SE MODIFICA NINGUNA FILA DEL LIBRO MAYOR.** Es
> append-only. Las filas de esta prueba **se quedan para siempre** y eso es lo
> correcto: son evidencia de prueba, clasificada como tal por `livemode = false`.
> No hay sección de limpieza en este documento porque no debe haberla. Ver §8.
>
> **R4. Solo `sk_test_`.** La comprobación automática del paso 0 es la única
> barrera entre este procedimiento y una transacción con dinero real.

---

## 0. Convenciones y variables de entorno

Este kit **no contiene credenciales** y no debe contener ninguna nunca. Todo se
lee del entorno. Ejecute primero este bloque: aborta con un mensaje claro si
falta algo, en lugar de fallar a mitad de la prueba con un error opaco.

```bash
# --- Rellene estas cuatro variables en su shell antes de continuar ---------
# export STRIPE_API_KEY='sk_test_...'          # CLAVE DE TEST. Debe empezar por sk_test_
# export STRIPE_WEBHOOK_SECRET='whsec_...'     # el del endpoint de Supabase, no el de `stripe listen`
# export SUPABASE_DB_URL='postgresql://...'    # conexión directa a la BD canónica
# export SUPABASE_PROJECT_REF='mwdauubztjxkbrefirbg'

set -u
missing=0
for v in STRIPE_API_KEY STRIPE_WEBHOOK_SECRET SUPABASE_DB_URL SUPABASE_PROJECT_REF; do
  if [ -z "${!v:-}" ]; then
    echo "FALTA: $v no está definida. Expórtela antes de continuar." >&2
    missing=1
  fi
done

case "${STRIPE_API_KEY:-}" in
  sk_test_*) ;;
  "") ;;
  *) echo "PELIGRO: STRIPE_API_KEY no empieza por sk_test_. Esto parece una clave LIVE." >&2
     echo "         Aborte. Esta prueba SOLO se ejecuta en test mode." >&2
     missing=1 ;;
esac

[ "$missing" -eq 0 ] || { echo "Precondiciones de entorno no satisfechas. No continúe."; return 1 2>/dev/null || exit 1; }
echo "OK: entorno completo y la clave es de test."
```

---

## PASO 1 — Precondiciones: compruebe LAS CUATRO antes de crear nada

**Estado: el PO confirma que las cuatro están ya en su sitio.** Se re-verifican
igualmente, y no por desconfianza: una precondición es barata (segundos, solo
lecturas) frente al coste de una mala ejecución (filas permanentes e
incorregibles). Un estado confirmado ayer no es un estado observado ahora.

El objetivo secundario es que un fallo posterior se **diagnostique** en lugar de
adivinarse: si las cuatro pasan y aun así no aparece una fila, el problema está
en el handler, no en la configuración.

### 1.1 El endpoint está ACTIVO y suscrito a los cuatro eventos relevantes

Confirmado por el PO: endpoint ACTIVO, escuchando 9 eventos, incluidos los
cuatro que esta prueba ejercita. Re-verifíquelo:

```bash
stripe webhook_endpoints list --api-key "$STRIPE_API_KEY"
```

Localice el endpoint cuya URL sea:

```
https://mwdauubztjxkbrefirbg.supabase.co/functions/v1/stripe-webhook
```

**Esperado:** `status = "enabled"` y que `enabled_events` incluya los cuatro:

```
checkout.session.completed    <-- paso 2 (SALE)
charge.refunded               <-- paso 4 (PARTIAL_REFUND)
charge.dispute.created        <-- paso 6 (CHARGEBACK)
charge.dispute.closed         <-- paso 8 (cierre)
```

**Si el endpoint está `disabled` o falta cualquiera de los cuatro: PARE.**
Manejar un evento en código no hace nada hasta que Stripe recibe la orden de
entregarlo; la mitad de la prueba no produciría ninguna fila y el diagnóstico
sería confuso. Corríjalo en Dashboard → Developers → Webhooks → (endpoint) →
*Update details* → *Select events*, o:

```bash
stripe webhook_endpoints update <we_id> \
  --api-key "$STRIPE_API_KEY" \
  -d "enabled_events[]=checkout.session.completed" \
  -d "enabled_events[]=charge.refunded" \
  -d "enabled_events[]=charge.dispute.created" \
  -d "enabled_events[]=charge.dispute.closed"
```

> `enabled_events` se **reemplaza entero**, no se añade. Si el endpoint escucha
> 9 eventos y usted envía 4, pierde los otros 5 silenciosamente. Enumere los 9.

### 1.2 El secreto de firma coincide

Si `STRIPE_WEBHOOK_SECRET` en Supabase no es el de **este** endpoint, la función
devuelve `400 invalid signature` y **no escribe absolutamente nada**. Desde la
base de datos esto es indistinguible de "el webhook no está suscrito": en ambos
casos no hay fila. Se distinguen mirando los intentos de entrega en Stripe.

```bash
stripe webhook_endpoints retrieve <we_id> --api-key "$STRIPE_API_KEY"
```

En Supabase: Dashboard → Edge Functions → `stripe-webhook` → Secrets. Confirme
que `STRIPE_WEBHOOK_SECRET` empieza por `whsec_` y corresponde a **este**
endpoint, no al que genera `stripe listen` en local (son distintos).

### 1.3 `006` está aplicado — columna, nulabilidad, ausencia de default e índice

Confirmado por el PO: `livemode` es BOOLEAN nullable sin default, y el índice
parcial existe. Re-verifíquelo con una sola consulta que devuelve un veredicto:

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -c "
SELECT column_name,
       data_type,
       is_nullable,
       COALESCE(column_default, '(ninguno)') AS column_default,
       CASE
         WHEN data_type = 'boolean'
          AND is_nullable = 'YES'
          AND column_default IS NULL THEN 'OK'
         ELSE 'FAIL - PARE'
       END AS veredicto
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name   = 'app_marketplace_revenue_events'
   AND column_name  = 'livemode';"
```

**Esperado exactamente:**

```
 column_name | data_type | is_nullable | column_default | veredicto
-------------+-----------+-------------+----------------+-----------
 livemode    | boolean   | YES         | (ninguno)      | OK
```

**Si devuelve 0 filas: PARE.** `006` no está aplicado. Si crea la transacción
ahora, genera filas no marcables para siempre.
**Si `column_default` no es `(ninguno)`: PARE.** Un default es una observación
fabricada en una tabla que solo admite hechos observados; con append-only, el
error sería permanente (ver `006` §1).

Índice parcial:

```bash
psql "$SUPABASE_DB_URL" -c "
SELECT indexname,
       indexdef,
       CASE WHEN indexdef ILIKE '%WHERE (livemode IS DISTINCT FROM false)%'
            THEN 'OK' ELSE 'FAIL - predicado incorrecto' END AS veredicto
  FROM pg_indexes
 WHERE schemaname = 'public'
   AND tablename  = 'app_marketplace_revenue_events'
   AND indexname  = 'idx_app_marketplace_revenue_events_livemode_true';"
```

**Esperado:** una fila con `veredicto = OK`. Un índice sobre `livemode = true`
excluiría toda fila histórica NULL y premiaría escribir el predicado equivocado
para acertarle al índice.

### 1.4 Append-only sigue intacto

Confirmado por el PO. Es la precondición cuyo incumplimiento haría que esta
prueba fuera *reversible* — y toda la disciplina de este documento asume que no
lo es. Verifíquelo antes de fiarse de ella:

```bash
psql "$SUPABASE_DB_URL" -c "
SELECT policyname, cmd, roles
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename  = 'app_marketplace_revenue_events'
 ORDER BY policyname;"
```

**Esperado: exactamente UNA política, `mre_instructor_select`, con `cmd =
'SELECT'`.** Cualquier fila con `cmd` en `INSERT`/`UPDATE`/`DELETE`/`ALL`
significa que append-only se ha roto.

```bash
psql "$SUPABASE_DB_URL" -c "
SELECT grantee, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND table_name   = 'app_marketplace_revenue_events'
   AND grantee IN ('anon', 'authenticated')
 ORDER BY grantee, privilege_type;"
```

**Esperado:** una única fila, `authenticated | SELECT`. `anon` no debe aparecer.

### 1.5 La Edge Function desplegada es la v2 que captura `livemode`

Confirmado por el PO: redesplegada como v2 escribiendo `event.livemode`.

Aplicar `006` sin redesplegar deja la columna siempre en NULL: el SQL está pero
nadie escribe el valor. Y al revés es peor — desplegar la función **antes** de
aplicar `006` hace que PostgREST rechace la fila entera por columna inexistente
y, como la captura está envuelta en try/catch, **el fallo es invisible**: el pago
funciona y la telemetría se pierde en silencio.

**Orden correcto: primero `006`, después el deploy.** Ambos ya hechos.

Verificación del código fuente (4 sitios de llamada, uno por tipo de evento):

```bash
cd /workspace/PIPINGBOX-BRAIN/DASHBOARD-APP
grep -c 'livemode: event.livemode' supabase/functions/stripe-webhook/index.ts
# Esperado: 4
```

Verificación de que lo **desplegado** es esa versión (no basta con el repo):

```bash
supabase functions list --project-ref "$SUPABASE_PROJECT_REF"
# Esperado: stripe-webhook con version >= 2 y una fecha de despliegue
# POSTERIOR a la de aplicación de 006.
```

Si tuviera que redesplegar:

```bash
supabase functions deploy stripe-webhook --no-verify-jwt --project-ref "$SUPABASE_PROJECT_REF"
```

> `--no-verify-jwt` es obligatorio: Stripe no envía JWT de Supabase. La
> autenticación aquí es la firma, que es más fuerte.

### 1.6 LÍNEA BASE — mídala ANTES de crear nada. El paso 10 depende de esto.

Sin estas cifras el paso 10 es una afirmación, no una demostración. **Anótelas
literalmente**, no de memoria.

```bash
psql "$SUPABASE_DB_URL" -c "
-- (a) Censo de procedencia. Estado del libro mayor antes de la prueba.
SELECT COALESCE(livemode::text, 'unknown (pre-006)') AS procedencia,
       count(*)                                       AS filas,
       COALESCE(sum(gross_amount_cents), 0)           AS bruto_cents
  FROM app_marketplace_revenue_events
 GROUP BY 1
 ORDER BY 1;"

psql "$SUPABASE_DB_URL" -c "
-- (b) LA CIFRA CANÓNICA DE INGRESO REAL, ANTES. Cópiela tal cual.
SELECT count(*)                             AS eventos_reales_antes,
       COALESCE(sum(gross_amount_cents), 0) AS bruto_real_cents_antes
  FROM app_marketplace_revenue_events
 WHERE livemode IS DISTINCT FROM false;"
```

Guárdelas en el shell, porque el paso 10 las compara aritméticamente:

```bash
export BASE_EVENTOS_REALES=$(psql "$SUPABASE_DB_URL" -tAc \
  "SELECT count(*) FROM app_marketplace_revenue_events WHERE livemode IS DISTINCT FROM false;")
export BASE_BRUTO_REAL=$(psql "$SUPABASE_DB_URL" -tAc \
  "SELECT COALESCE(sum(gross_amount_cents),0) FROM app_marketplace_revenue_events WHERE livemode IS DISTINCT FROM false;")
echo "LÍNEA BASE — eventos reales: $BASE_EVENTOS_REALES | bruto real (cents): $BASE_BRUTO_REAL"
```

Marque también el instante de arranque: acota todas las consultas posteriores a
lo que escribe **esta** ejecución y evita falsos positivos por filas históricas.

```bash
export T0=$(psql "$SUPABASE_DB_URL" -tAc \
  "SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"');")
echo "T0 = $T0"
```

> `to_char` en lugar de `now()` a secas: fija el formato ISO 8601 en UTC y lo
> hace independiente del `DateStyle` del servidor. Todas las consultas
> posteriores comparan `created_at >= '$T0'`, y una fecha ambigua ahí acotaría
> mal la ventana — dejando fuera filas de esta ejecución, o metiendo dentro filas
> históricas. Ambas cosas rompen los pasos 9 y 10.

**Esperado antes de la primera prueba:** ninguna fila con `livemode = false`.

---

## PASO 2 — VENTA en Stripe test mode

Tarjetas de prueba usadas en todo el kit. **Todo en test mode.**

| Tarjeta | Efecto | Se usa en |
| --- | --- | --- |
| `4242424242424242` | Pago correcto | Pasos 2–5 (venta + reembolso parcial) |
| `4000000000000259` | Pago correcto y **disputa automática** poco después | Pasos 6–8 (disputa) |

`4000000000000259` es la vía limpia para la disputa: produce un
`charge.dispute.created` **real**, generado por Stripe, en lugar de uno forzado
con `stripe trigger`. Un evento forzado no lleva `payment_intent` asociado a una
orden nuestra, así que `loadOrderAttribution` no encuentra nada y la fila sale
con `order_id = NULL` — lo cual no prueba lo que queremos probar.

### 2.1 Fije el importe: 149,00 € — y no lo cambie

**La aritmética del paso 5 depende de este número.** El kit fija los importes
para que `refunded_amount_cents` tenga **un único valor correcto esperado**, no
"lo que usted haya reembolsado".

```
Importe de la venta ..... 14900 céntimos (149,00 €)
Reembolso parcial ....... 5000  céntimos (50,00 €)
```

Si su catálogo no tiene un curso a 149,00 €, use el importe real y **recalcule
las cifras esperadas antes de reembolsar**, con las reglas del paso 5. Lo que no
puede hacer es reembolsar un importe arbitrario y decidir después qué esperaba.

### 2.2 Cree la venta

Cree un checkout real por el flujo normal del producto (`create-checkout`), de
modo que la orden lleve `course_id`, `instructor_id` y la atribución. Pague con
`4242424242424242`, fecha futura, CVC cualquiera.

Anote de la sesión:

```bash
export PI_SALE='pi_...'      # payment_intent
export CH_SALE='ch_...'      # charge
export CS_SALE='cs_...'      # checkout session
```

Si necesita localizarlos:

```bash
stripe payment_intents list --limit 3 --api-key "$STRIPE_API_KEY"
stripe charges list --limit 3 --api-key "$STRIPE_API_KEY"
```

**Esperado:** una fila `SALE` y `app_orders.status = 'paid'`.

---

## PASO 3 — Verifique que el evento SALE tiene `livemode = false`

```bash
psql "$SUPABASE_DB_URL" -c "
SELECT e.event_type,
       e.livemode,
       e.gross_amount_cents,
       e.stripe_fee_cents,
       e.net_settled_cents,
       e.currency,
       e.stripe_event_id,
       e.stripe_object_id,
       o.status AS order_status,
       CASE WHEN e.livemode IS FALSE THEN 'OK'
            WHEN e.livemode IS NULL  THEN 'STOP / FAIL - livemode NULL'
            ELSE 'STOP / FAIL - livemode TRUE, esto NO es test mode'
       END AS veredicto
  FROM app_marketplace_revenue_events e
  LEFT JOIN app_orders o ON o.id = e.order_id
 WHERE e.event_type = 'SALE'
   AND e.created_at >= '$T0'
 ORDER BY e.occurred_at;"
```

**Esperado: exactamente 1 fila.**

| Campo | Valor esperado |
| --- | --- |
| `event_type` | `SALE` |
| `livemode` | `f` (false) |
| `gross_amount_cents` | `14900` |
| `currency` | `EUR` |
| `stripe_fee_cents` | poblado, **no NULL** |
| `net_settled_cents` | poblado, **no NULL** |
| `order_status` | `paid` |
| `veredicto` | `OK` |

> **`veredicto = STOP / FAIL - livemode NULL` → detenga la prueba aquí mismo.**
> No cree el reembolso ni la disputa. Regla R2. Diagnóstico en el paso 1.5: la
> función desplegada no es la v2. La fila NULL ya es permanente; crear tres más
> multiplica el daño por cuatro sin aportar información nueva.

`gross_amount_cents = 14900` sale de `session.amount_total`, transcrito tal cual
(webhook, caso `checkout.session.completed`). No se recalcula desde líneas.

---

## PASO 4 — REEMBOLSO **PARCIAL**, no total

**Reembolse parcialmente, deliberadamente.** El esquema distingue `REFUND` de
`PARTIAL_REFUND`, y el total es el camino fácil: `isFullRefund` sale `true` casi
por construcción y no ejercita nada. El parcial es donde la lógica puede estar
mal de verdad, y además es el único caso que comprueba que una orden
parcialmente reembolsada **sigue en `paid`**.

```bash
stripe refunds create \
  --api-key "$STRIPE_API_KEY" \
  --payment-intent "$PI_SALE" \
  --amount 5000
```

> `--amount` va en **céntimos** y debe ser **estrictamente menor** que el cargo:
> 5000 < 14900. **Un solo reembolso, no dos.** El paso 5 explica por qué un
> segundo reembolso cambiaría los valores esperados de forma no obvia.

Confirme en Stripe antes de leer la base de datos:

```bash
stripe charges retrieve "$CH_SALE" --api-key "$STRIPE_API_KEY" | \
  grep -E '"amount"|"amount_refunded"|"refunded"'
# Esperado: amount 14900, amount_refunded 5000, refunded false
```

---

## PASO 5 — Verifique `PARTIAL_REFUND` y `refunded_amount_cents`

### 5.1 Lo que hace el código, literalmente

Del webhook, caso `charge.refunded`:

```ts
const refundedCents = charge.amount_refunded ?? 0;   // ACUMULADO de Stripe
const chargedCents  = charge.amount ?? 0;
const isFullRefund  = chargedCents > 0 && refundedCents >= chargedCents;
```

Tres consecuencias que fijan los valores esperados. Se enuncian a partir de lo
que el código **hace**, no de lo que debería hacer:

1. **`refunded_amount_cents` se SOBRESCRIBE, no se acumula.** El `UPDATE` escribe
   `refunded_amount_cents: refundedCents`. Pero `refundedCents` es
   `charge.amount_refunded`, que **es ya el acumulado de Stripe** sobre todos los
   reembolsos del cargo. El resultado neto es correcto —la columna acaba con el
   total reembolsado— pero el mecanismo no es una suma nuestra: es una
   transcripción del acumulado de Stripe. Consecuencia práctica: con dos
   reembolsos de 5000, la columna diría `10000` (no `5000`), y llegarían **dos**
   filas `PARTIAL_REFUND` con `gross_amount_cents` `-5000` y `-10000`
   respectivamente. Por eso el paso 4 exige **un solo reembolso**.
2. **La discriminación `REFUND` vs `PARTIAL_REFUND` compara con el importe del
   CARGO (`charge.amount`), no con `app_orders.amount_cents`.** Coinciden en el
   caso normal, pero la regla que gobierna es la de Stripe.
3. **`gross_amount_cents` del evento es `-refundedCents`**, es decir, el
   acumulado en negativo, no el delta de este reembolso concreto. Con un único
   reembolso ambos coinciden: `-5000`.

```bash
psql "$SUPABASE_DB_URL" -c "
SELECT e.event_type,
       e.livemode,
       e.gross_amount_cents,
       e.stripe_fee_cents,
       e.net_settled_cents,
       o.status                AS order_status,
       o.amount_cents          AS order_amount_cents,
       o.refunded_amount_cents,
       o.refunded_at IS NOT NULL AS refunded_at_sellado,
       CASE
         WHEN e.event_type         = 'PARTIAL_REFUND'
          AND e.livemode           IS FALSE
          AND e.gross_amount_cents = -5000
          AND o.status             = 'paid'
          AND o.refunded_amount_cents = 5000
         THEN 'OK'
         ELSE 'FAIL - ver tabla de valores esperados'
       END AS veredicto
  FROM app_marketplace_revenue_events e
  LEFT JOIN app_orders o ON o.id = e.order_id
 WHERE e.event_type IN ('PARTIAL_REFUND', 'REFUND')
   AND e.created_at >= '$T0'
 ORDER BY e.occurred_at;"
```

### 5.2 Valores esperados — un único valor correcto por campo

| Campo | Valor esperado | De dónde sale |
| --- | --- | --- |
| `event_type` | `PARTIAL_REFUND` | `5000 >= 14900` es falso → `isFullRefund = false` |
| `livemode` | `f` | `event.livemode` |
| `gross_amount_cents` | `-5000` | `-refundedCents`; negativo = dinero que sale |
| `stripe_fee_cents` | poblado, **no NULL** — típicamente `0` | balance transaction del reembolso |
| `net_settled_cents` | poblado, **no NULL** — típicamente `-5000` | balance transaction del reembolso |
| `order_status` | **`paid`** | `isFullRefund ? 'refunded' : 'paid'` |
| `order_amount_cents` | `14900` | la orden original |
| `refunded_amount_cents` | **`5000`** | `charge.amount_refunded` transcrito |
| `refunded_at_sellado` | `t` | se sella siempre, también en parcial |

`paid` tras un reembolso parcial **no es un error**: el comprador conserva lo que
pagó y solo el reembolso total deshace la venta.

> **`stripe_fee_cents = 0` en el reembolso es correcto, no un fallo.** Stripe no
> devuelve la comisión original del cargo. Lo que no debe ocurrir es `NULL`:
> NULL significa "no se pudo observar la balance transaction" y eso sí es un
> defecto (ver paso 11.4).

**Si sale `REFUND` en lugar de `PARTIAL_REFUND`:** reembolsó el importe completo.
La fila `REFUND` ya es permanente. **No la borre** (R3). Documéntela como
desviación y, si quiere ejercitar el parcial, hágalo sobre una venta nueva.

---

## PASO 6 — Genere una disputa con `4000000000000259`

Nuevo checkout, por el mismo flujo normal, esta vez con `4000000000000259`. El
pago se aprueba y Stripe abre la disputa automáticamente a los pocos minutos.

```bash
export PI_DISPUTE='pi_...'
export CH_DISPUTE='ch_...'
```

Espere a que llegue el evento:

```bash
stripe disputes list --limit 3 --api-key "$STRIPE_API_KEY"
stripe events list --type charge.dispute.created --limit 3 --api-key "$STRIPE_API_KEY"

export DP_ID='dp_...'   # anote el id de la disputa: los pasos 7 y 8 lo necesitan
```

Confirme el importe disputado, porque el paso 7 lo espera exacto:

```bash
stripe disputes retrieve "$DP_ID" --api-key "$STRIPE_API_KEY" | \
  grep -E '"amount"|"status"|"reason"|"livemode"'
# Esperado: amount 14900, status "needs_response", livemode false
```

---

## PASO 7 — Verifique `CHARGEBACK`

```bash
psql "$SUPABASE_DB_URL" -c "
SELECT e.event_type,
       e.livemode,
       e.gross_amount_cents,
       e.stripe_fee_cents,
       e.net_settled_cents,
       e.stripe_object_id,
       e.order_id IS NOT NULL AS atribuida_a_orden,
       o.status               AS order_status,
       CASE
         WHEN e.event_type         = 'CHARGEBACK'
          AND e.livemode           IS FALSE
          AND e.gross_amount_cents = -14900
          AND e.order_id           IS NOT NULL
          AND o.status             = 'disputed'
         THEN 'OK'
         ELSE 'FAIL - ver tabla de valores esperados'
       END AS veredicto
  FROM app_marketplace_revenue_events e
  LEFT JOIN app_orders o ON o.id = e.order_id
 WHERE e.event_type = 'CHARGEBACK'
   AND e.created_at >= '$T0'
 ORDER BY e.occurred_at;"
```

**Esperado: exactamente 1 fila** (en este punto; el paso 8 puede añadir otra).

| Campo | Valor esperado | De dónde sale |
| --- | --- | --- |
| `event_type` | `CHARGEBACK` | caso `charge.dispute.created` |
| `livemode` | `f` | `event.livemode` |
| `gross_amount_cents` | `-14900` | `-(dispute.amount)`; los fondos se retiran ya |
| `stripe_fee_cents` | poblado, **no NULL** | `dispute.balance_transactions[0]`, incluye la tasa de disputa |
| `atribuida_a_orden` | `t` | si es `f`, la disputa no casó con ninguna orden |
| `order_status` | **`disputed`** | no `chargeback`: la disputa está ABIERTA |

> `disputed` y no `chargeback` a propósito: la disputa está abierta y el
> resultado se desconoce. El acceso **no** se revoca aquí — una disputa se puede
> ganar, y cortar el acceso a quien puede tener razón es una incidencia de
> soporte, no un control.

> `atribuida_a_orden = f` significa casi siempre que la disputa se forzó con
> `stripe trigger` en vez de con la tarjeta. Ver paso 6.

---

## PASO 8 — Cierre la disputa y verifique el evento final

Este paso es **obligatorio**, no opcional. Es el único que ejercita
`charge.dispute.closed`, y es donde el webhook tiene el comportamiento menos
obvio del kit.

### 8.1 Qué hace el webhook al cerrarse la disputa — verificado en el código

Del caso `charge.dispute.closed`:

```ts
const won  = dispute.status === "won";
const lost = dispute.status === "lost";

// app_orders:
.update({ status: lost ? "chargeback" : "paid" })

// evento:
event_type:         lost ? "CHARGEBACK" : "CHARGEBACK_REVERSAL",
gross_amount_cents: won  ? (dispute.amount ?? 0) : 0,
```

Mapeo real, exhaustivo:

| `dispute.status` al cierre | `event_type` | `gross_amount_cents` | `app_orders.status` |
| --- | --- | --- | --- |
| `lost` | `CHARGEBACK` | `0` | `chargeback` |
| `won` | `CHARGEBACK_REVERSAL` | `+dispute.amount` | `paid` |
| cualquier otro (p. ej. `warning_closed`) | `CHARGEBACK_REVERSAL` | `0` | `paid` |

### 8.2 ⚠️ DEFECTO CONOCIDO en la tercera fila — léalo antes de ejecutar

`won` y `lost` se calculan de forma **independiente**, y las tres consecuencias
usan predicados distintos (`lost` para el tipo y el estado de la orden, `won`
para el importe). Para cualquier estado terminal que no sea ni `won` ni `lost`,
las dos banderas son `false` y el webhook escribe un **`CHARGEBACK_REVERSAL` con
`gross_amount_cents = 0`** y devuelve la orden a `paid`.

Eso es una afirmación falsa en un libro mayor de hechos: un `CHARGEBACK_REVERSAL`
afirma que la retirada de fondos se revirtió, y el `0` afirma que se revirtió por
cero — mientras el `CHARGEBACK` de `-14900` del paso 7 sigue en pie. La
combinación deja el neto en `-14900` **y además** una fila que dice que hubo
reversión. El comentario del código lo presenta como intencionado
("`warning_closed` y similares … se tratan como reversión de la retirada
provisional"), pero el efecto contable no coincide con esa intención: una
reversión de importe cero no revierte nada.

**Esto se documenta aquí como defecto, no como comportamiento correcto.** No es
un fallo que esta prueba deba provocar ni arreglar. La ruta elegida en 8.3 lo
esquiva de forma determinista.

### 8.3 RUTA A TOMAR: acepte la disputa (cierre como `lost`)

**Ejecute esta, y solo esta.**

```bash
stripe disputes close "$DP_ID" --api-key "$STRIPE_API_KEY"
```

**Por qué esta ruta y no la otra:**

- **Es determinista.** La API de Stripe define `POST /v1/disputes/{id}/close`
  como "aceptar la disputa": el estado pasa de `needs_response` a **`lost`**,
  siempre, de inmediato y de forma **irreversible**. No depende de heurísticas ni
  de temporizadores.
- **Ejercita la rama que importa.** `lost` es la única rama que produce
  `CHARGEBACK` desde `charge.dispute.closed` y la única que lleva la orden a
  `chargeback`. Es el resultado con consecuencia económica real.
- **Evita por completo el defecto de 8.2.** `lost` es una de las dos ramas bien
  definidas.
- **Ganar exigiría evidencia y espera.** El camino `won` obliga a enviar
  `evidence[uncategorized_text]=winning_evidence` y a esperar la resolución de
  Stripe, con un resultado que llega más tarde y por una vía menos predecible.

### 8.4 Verifique el evento final

```bash
psql "$SUPABASE_DB_URL" -c "
SELECT e.event_type,
       e.livemode,
       e.gross_amount_cents,
       e.stripe_fee_cents,
       e.net_settled_cents,
       e.stripe_object_id,
       o.status AS order_status,
       CASE
         WHEN e.event_type         = 'CHARGEBACK'
          AND e.livemode           IS FALSE
          AND e.gross_amount_cents = 0
          AND o.status             = 'chargeback'
         THEN 'OK - ruta lost, la esperada'
         WHEN e.event_type = 'CHARGEBACK_REVERSAL' AND e.gross_amount_cents > 0
         THEN 'INESPERADO - la disputa se GANO (won). Ver 8.5'
         WHEN e.event_type = 'CHARGEBACK_REVERSAL' AND e.gross_amount_cents = 0
         THEN 'INESPERADO - estado terminal ni won ni lost. Ver el defecto en 8.2'
         ELSE 'FAIL - ver tabla de valores esperados'
       END AS veredicto
  FROM app_marketplace_revenue_events e
  LEFT JOIN app_orders o ON o.id = e.order_id
 WHERE e.stripe_object_id = '$DP_ID'
   AND e.created_at >= '$T0'
 ORDER BY e.occurred_at;"
```

**Esperado: 2 filas para esta disputa** — la de apertura (paso 7) y la de cierre.

Fila de cierre esperada:

| Campo | Valor esperado |
| --- | --- |
| `event_type` | **`CHARGEBACK`** |
| `livemode` | `f` |
| `gross_amount_cents` | **`0`** |
| `stripe_fee_cents` | poblado, **no NULL** |
| `order_status` | **`chargeback`** |
| `veredicto` | `OK - ruta lost, la esperada` |

> **`gross_amount_cents = 0` en el cierre es correcto y es la clave del diseño.**
> El dinero ya se retiró al abrirse la disputa y quedó registrado como `-14900`
> en el paso 7. Repetir el importe aquí lo contaría dos veces. El evento de
> cierre no aporta importe: aporta el **desenlace** y los hechos finales de
> liquidación.

### 8.5 Qué habría producido la otra ruta — para que un resultado inesperado sea diagnosticable

| Si hubiera enviado | `dispute.status` | `event_type` | `gross_amount_cents` | `app_orders.status` |
| --- | --- | --- | --- | --- |
| `disputes close` (**la ruta de este kit**) | `lost` | `CHARGEBACK` | `0` | `chargeback` |
| `evidence[uncategorized_text]=winning_evidence` | `won` | `CHARGEBACK_REVERSAL` | `+14900` | `paid` |

Si obtiene `CHARGEBACK_REVERSAL` con `+14900` tras haber ejecutado
`stripe disputes close`, alguien envió evidencia a esa disputa antes que usted, o
está mirando otra disputa: compruebe `stripe_object_id` contra `$DP_ID`.

Si obtiene `CHARGEBACK_REVERSAL` con `0`, la disputa cerró en un estado terminal
que no es `won` ni `lost` y **está viendo el defecto de 8.2 en producción**.
Regístrelo. No intente corregir la fila (R3).

**Total de filas de prueba tras el paso 8: 4** — `SALE`, `PARTIAL_REFUND`,
`CHARGEBACK` (apertura) y `CHARGEBACK` (cierre).

---

## PASO 9 — Ninguna fila de esta ejecución puede tener `livemode = NULL`

**La comprobación más importante del documento.** Si `006` estuviera aplicado
pero la función desplegada fuera la antigua, las filas entrarían con
`livemode = NULL` y serían indistinguibles del histórico, **para siempre**.

### 9.1 La comprobación NULL — regla R2

```bash
psql "$SUPABASE_DB_URL" -c "
SELECT id,
       event_type,
       occurred_at,
       stripe_event_id,
       raw_payload ->> 'livemode' AS livemode_en_payload
  FROM app_marketplace_revenue_events
 WHERE livemode IS NULL
   AND created_at >= '$T0'
 ORDER BY created_at DESC;"
```

> ### **Esperado: 0 filas. Una sola fila aquí es STOP / FAIL inmediato.**
>
> No es un aviso. No es una nota al pie. **Detenga la ejecución.** No cree más
> transacciones. Cada fila que aparezca aquí es una fila **no marcable de forma
> permanente** en el libro mayor de ingresos de producción, y cada transacción
> adicional añade otra.
>
> **Causa:** la función desplegada no captura `livemode` (paso 1.5).
> **Remedio:** ninguno para las filas ya escritas. La tabla es append-only.
> `livemode_en_payload` le dirá qué decía Stripe, pero **no la use para un
> UPDATE**: corregir a mano normaliza justo la operación que el diseño prohíbe
> (R3). Redespliegue la función y ejecute una prueba **nueva**; documente las
> filas NULL como daño permanente de esta ejecución.

`$T0` acota la consulta a **lo que acaba de escribir esta prueba**. Las filas
anteriores a `006` también tienen `livemode` NULL y son correctas: su procedencia
es genuinamente desconocida y no se rellena con una conjetura. Sin el filtro por
`created_at`, esta comprobación daría un falso positivo por cada fila histórica.

### 9.2 Censo positivo — las 4 filas están marcadas como test

Comprobar que no hay NULL no basta: hay que comprobar que las 4 filas esperadas
existen y están marcadas.

```bash
psql "$SUPABASE_DB_URL" -c "
SELECT event_type,
       count(*)                                     AS filas,
       count(*) FILTER (WHERE livemode IS FALSE)    AS marcadas_test,
       count(*) FILTER (WHERE livemode IS NULL)     AS sin_marcar_FAIL,
       count(*) FILTER (WHERE livemode IS TRUE)     AS marcadas_real_FAIL,
       sum(gross_amount_cents)                      AS bruto_cents
  FROM app_marketplace_revenue_events
 WHERE created_at >= '$T0'
 GROUP BY 1
 ORDER BY 1;"
```

**Esperado exactamente:**

| `event_type` | `filas` | `marcadas_test` | `sin_marcar_FAIL` | `marcadas_real_FAIL` | `bruto_cents` |
| --- | --- | --- | --- | --- | --- |
| `CHARGEBACK` | 2 | 2 | 0 | 0 | `-14900` |
| `PARTIAL_REFUND` | 1 | 1 | 0 | 0 | `-5000` |
| `SALE` | 1 | 1 | 0 | 0 | `14900` |

`bruto_cents` de `CHARGEBACK` es `-14900 + 0 = -14900`: la apertura retira, el
cierre no repite el importe (paso 8.4).

**Cualquier valor distinto de 0 en `sin_marcar_FAIL` o en `marcadas_real_FAIL`
es un fallo de la ejecución.**

### 9.3 Comisiones observadas, no NULL

`stripe_fee_cents` y `net_settled_cents` deben venir de la **balance
transaction**, no calculados. NULL significa "no se pudo observar", y es
justamente lo que esta prueba tiene que descartar.

```bash
psql "$SUPABASE_DB_URL" -c "
SELECT event_type, stripe_event_id, stripe_fee_cents, net_settled_cents
  FROM app_marketplace_revenue_events
 WHERE created_at >= '$T0'
   AND (stripe_fee_cents IS NULL OR net_settled_cents IS NULL);"
```

**Esperado: 0 filas.** En test mode Stripe publica comisiones simuladas, así que
un NULL aquí es un defecto real, no una peculiaridad del entorno: la llamada a
la balance transaction falló (permisos de la clave, o expansión no disponible).
Revise `fetchSettlementFacts` en los logs.

### 9.4 `stripe_event_id` sin duplicados

```bash
psql "$SUPABASE_DB_URL" -c "
SELECT stripe_event_id, count(*)
  FROM app_marketplace_revenue_events
 WHERE stripe_event_id IS NOT NULL
 GROUP BY 1 HAVING count(*) > 1;"
```

**Esperado: 0 filas.** Es la garantía de idempotencia del webhook.

### 9.5 Transiciones de `app_orders`

```bash
psql "$SUPABASE_DB_URL" -c "
SELECT o.id,
       o.status,
       o.amount_cents,
       o.refunded_amount_cents,
       o.refunded_at IS NOT NULL AS refunded_at_sellado,
       string_agg(e.event_type, ', ' ORDER BY e.occurred_at) AS eventos
  FROM app_orders o
  JOIN app_marketplace_revenue_events e ON e.order_id = o.id
 WHERE e.livemode = false
   AND e.created_at >= '$T0'
 GROUP BY o.id, o.status, o.amount_cents, o.refunded_amount_cents, o.refunded_at
 ORDER BY o.id;"
```

**Esperado: 2 órdenes.**

| Orden | `status` | `amount_cents` | `refunded_amount_cents` | `eventos` |
| --- | --- | --- | --- | --- |
| venta + reembolso parcial | `paid` | `14900` | `5000` | `SALE, PARTIAL_REFUND` |
| disputa cerrada como perdida | `chargeback` | `14900` | NULL | `CHARGEBACK, CHARGEBACK` |

Tabla de referencia completa de transiciones, para diagnóstico:

| Escenario | `status` | `refunded_amount_cents` |
| --- | --- | --- |
| Venta pagada | `paid` | NULL |
| **Reembolso parcial** | **`paid`** (sigue pagada) | el importe reembolsado |
| Reembolso total | `refunded` | = `amount_cents` |
| Disputa abierta | `disputed` | NULL |
| Disputa perdida | `chargeback` | NULL |
| Disputa ganada | `paid` | NULL |

---

## PASO 10 — Demuestre que la consulta canónica excluye la prueba

**Esto tiene que ser una demostración, no una afirmación.** Una consulta que
devuelve cero filas no prueba nada: podría devolver cero por el motivo
equivocado. Lo que hay que enseñar es que **las filas de prueba existen** y que
**la cifra de ingreso real no se ha movido**, lado a lado.

### 10.1 Antes / después de la cifra canónica

```bash
psql "$SUPABASE_DB_URL" -c "
WITH real_ahora AS (
  SELECT count(*)                             AS eventos,
         COALESCE(sum(gross_amount_cents), 0) AS bruto_cents
    FROM app_marketplace_revenue_events
   WHERE livemode IS DISTINCT FROM false
),
test_ahora AS (
  SELECT count(*)                             AS eventos,
         COALESCE(sum(gross_amount_cents), 0) AS bruto_cents
    FROM app_marketplace_revenue_events
   WHERE livemode = false
)
SELECT 'INGRESO REAL antes (linea base 1.6)'::text        AS medida,
       ${BASE_EVENTOS_REALES}::bigint                      AS eventos,
       ${BASE_BRUTO_REAL}::bigint                          AS bruto_cents
UNION ALL
SELECT 'INGRESO REAL ahora (consulta canonica)'::text,
       r.eventos::bigint,
       r.bruto_cents::bigint                               FROM real_ahora r
UNION ALL
SELECT 'DELTA del ingreso real (debe ser 0 y 0)'::text,
       (r.eventos     - ${BASE_EVENTOS_REALES})::bigint,
       (r.bruto_cents - ${BASE_BRUTO_REAL})::bigint        FROM real_ahora r
UNION ALL
SELECT 'FILAS DE PRUEBA que SI existen en la tabla'::text,
       t.eventos::bigint,
       t.bruto_cents::bigint                               FROM test_ahora t;"
```

> El predicado `livemode IS DISTINCT FROM false` de la primera CTE **es** la
> consulta canónica de ingreso real, sin modificar. Los `::bigint` no son
> decoración: `count(*)` devuelve `bigint` y `sum()` devuelve `numeric`, y sin el
> cast explícito el `UNION ALL` mezcla tipos y la resta contra la línea base sale
> con decimales. Los `${...}` van entre llaves para que el shell no se coma el
> carácter siguiente.


**Esperado:**

```
                  medida                    | eventos | bruto_cents
--------------------------------------------+---------+-------------
 INGRESO REAL antes (línea base 1.6)        |     N   |      B
 INGRESO REAL ahora (misma consulta)        |     N   |      B      <-- idéntico
 DELTA del ingreso real (debe ser 0 y 0)    |     0   |      0      <-- LA PRUEBA
 FILAS DE PRUEBA que SÍ existen en la tabla |     4   |    -5000    <-- existen
```

**Esto es lo que da sentido al ticket entero.** Las dos afirmaciones tienen que
sostenerse a la vez:

- El **delta es exactamente `0` y `0`**: la consulta canónica devuelve lo mismo
  que antes de la prueba. El ingreso real no se movió ni un céntimo.
- Hay **4 filas de prueba con bruto `-5000`** dentro de la tabla. No están
  ocultas ni borradas. **Están ahí y quedan excluidas.**

`-5000` es la suma: `14900 (SALE) − 5000 (PARTIAL_REFUND) − 14900 (CHARGEBACK
apertura) + 0 (CHARGEBACK cierre)`.

> Si el delta **no** es 0, la exclusión no funciona y hay que investigar antes de
> publicar cualquier cifra financiera. La causa más probable es una fila de esta
> ejecución con `livemode` NULL o `true` — que el paso 9.2 ya debería haber
> detenido.

### 10.2 Descomposición: las tres poblaciones suman el total

Demuestra que `IS DISTINCT FROM false` particiona la tabla correctamente y que
no se pierde ni se duplica ninguna fila entre ambos predicados.

```bash
psql "$SUPABASE_DB_URL" -c "
SELECT COALESCE(livemode::text, 'unknown (pre-006)') AS procedencia,
       count(*)                                       AS filas,
       COALESCE(sum(gross_amount_cents), 0)           AS bruto_cents,
       (livemode IS DISTINCT FROM false)              AS cuenta_como_ingreso_real
  FROM app_marketplace_revenue_events
 GROUP BY livemode
 ORDER BY 1;"
```

**Esperado:** la fila `false` debe tener `cuenta_como_ingreso_real = f` y
`filas = 4` (más las de ejecuciones anteriores, si las hubo). Las filas `true` y
`unknown (pre-006)` deben tener `cuenta_como_ingreso_real = t`: **las históricas
de procedencia desconocida siguen contando como ingreso real**, que es
precisamente lo que `= true` habría roto.

### 10.3 Contraejemplo: por qué NUNCA se escribe `livemode = true`

```bash
psql "$SUPABASE_DB_URL" -c "
SELECT 'CORRECTO  livemode IS DISTINCT FROM false' AS predicado,
       count(*) AS eventos, COALESCE(sum(gross_amount_cents),0) AS bruto_cents
  FROM app_marketplace_revenue_events WHERE livemode IS DISTINCT FROM false
UNION ALL
SELECT 'ERRÓNEO   livemode = true',
       count(*), COALESCE(sum(gross_amount_cents),0)
  FROM app_marketplace_revenue_events WHERE livemode = true;"
```

**Esperado:** si existen filas históricas anteriores a `006`, la fila `ERRÓNEO`
muestra **menos** eventos y **menos** bruto. Esa diferencia es exactamente el
ingreso real que `= true` borra en silencio, sin ningún error. Si las dos filas
coinciden es solo porque todavía no hay histórico NULL — no porque el predicado
erróneo sea seguro.

> **Nunca escriba `WHERE livemode = true` en un informe.** Descarta todas las
> filas históricas anteriores a `006`, que tienen `livemode` NULL, e infravalora
> el ingreso sin avisar de nada.

---

## PASO 11 — Idempotencia y diagnóstico

### 11.1 Un reintento no debe crear una segunda fila

Stripe reintenta entregas.

```bash
stripe events list --limit 5 --api-key "$STRIPE_API_KEY"
export EVT='evt_...'   # un event id real de ESTA prueba

psql "$SUPABASE_DB_URL" -tAc \
  "SELECT count(*) FROM app_marketplace_revenue_events WHERE stripe_event_id='$EVT';"
# Esperado: 1

stripe events resend "$EVT" --api-key "$STRIPE_API_KEY"
sleep 10

psql "$SUPABASE_DB_URL" -tAc \
  "SELECT count(*) FROM app_marketplace_revenue_events WHERE stripe_event_id='$EVT';"
# Esperado: 1  <-- sigue siendo 1
```

**Dos defensas independientes, y conviene saber cuál actuó:**

1. **Puerta de deduplicación.** La función inserta en `app_stripe_events` antes
   de procesar; el reintento choca con la constraint única, responde
   `200 {"duplicate":true}` y **no llega al handler**.
2. **UNIQUE en `stripe_event_id`.** Si aun así llegase, el INSERT falla con
   23505, que `recordRevenueEvent` registra como *info* y no como error.

En la práctica actúa la primera, así que en los logs verá el `duplicate: true` y
**no** el mensaje de "already recorded". Ambos resultados son correctos.

```bash
supabase functions logs stripe-webhook --project-ref "$SUPABASE_PROJECT_REF"
```

### 11.2 EL CASO IMPORTANTE: "no aparece la fila"

Desde la base de datos, **"el webhook no está suscrito" y "el webhook disparó
pero el INSERT falló" son idénticos**: en ambos no hay fila. Tienen arreglos
completamente distintos, así que hay que separarlos **antes** de tocar nada. El
discriminador es Stripe, no la base de datos.

```bash
stripe events list --type charge.dispute.created --limit 5 --api-key "$STRIPE_API_KEY"
```

| Stripe generó el evento | Hay intento de entrega al endpoint | Diagnóstico | Arreglo |
| --- | --- | --- | --- |
| No | — | La transacción no produjo el evento | Revise el paso 6; ¿usó `4000000000000259`? |
| Sí | **No** | **NO SUSCRITO** | Añada el evento al endpoint (1.1) |
| Sí | Sí, `400` | Firma incorrecta | `STRIPE_WEBHOOK_SECRET` no coincide (1.2) |
| Sí | Sí, `500` | El handler explotó | Logs; la fila de dedupe se borra y Stripe reintenta |
| Sí | Sí, `200` | **Disparó, pero el INSERT falló** | Logs: `revenue event insert failed` |

La distinción decisiva es la columna del medio: **si no hay ni intento de
entrega, el problema es de configuración en Stripe y ningún cambio de código lo
arregla.** Si hay intento con `200` y aun así no hay fila, el problema está en el
INSERT — y como la captura está en try/catch, la función responde `200`
igualmente. Por eso el `200` no prueba que la fila exista.

```bash
supabase functions logs stripe-webhook --project-ref "$SUPABASE_PROJECT_REF" | \
  grep -E "revenue event insert failed|revenue event insert threw|capture failed"
```

### 11.3 Resto de síntomas

| Síntoma | Causa probable | Arreglo |
| --- | --- | --- |
| Fila con `livemode = NULL` | La función desplegada es anterior a la captura | **STOP (R2).** Redespliegue (1.5). **La fila NULL no se puede corregir** |
| `PGRST204` / "column does not exist" en logs | La función se desplegó **antes** de aplicar `006` | Aplique `006` y reintente; el pago no se vio afectado |
| `event_type = REFUND` en vez de `PARTIAL_REFUND` | Reembolsó el importe completo | Paso 5. La fila es permanente; no la borre |
| `refunded_amount_cents` ≠ 5000 | Hubo más de un reembolso; la columna lleva el acumulado de Stripe | Paso 5.1, consecuencia 1 |
| `stripe_fee_cents` NULL | No se pudo leer la balance transaction | Permisos de la clave y logs de `fetchSettlementFacts` |
| `order_id` NULL en la fila | La disputa se forzó con `stripe trigger` | Use `4000000000000259` (paso 6) |
| `CHARGEBACK_REVERSAL` con importe 0 al cerrar | Estado terminal ni `won` ni `lost` | **Defecto conocido, ver 8.2.** Regístrelo |
| `app_orders.status` no cambió | El `payment_intent` no casa con ninguna orden | Compruebe `stripe_payment_intent_id` en `app_orders` |
| Fila duplicada | La garantía de idempotencia se rompió | **Incidencia grave**: revise el UNIQUE de `stripe_event_id` |
| `400 invalid signature` en todas | Secreto equivocado | 1.2. El de `stripe listen` **no** es el del endpoint |

---

## PASO 12 — Lista de comprobación final

Los 10 pasos exigidos, en orden:

- [ ] **1.** Precondiciones: acceso de lectura (§A), endpoint activo con los 4
      eventos (1.1), secreto (1.2), `006` + índice (1.3), append-only (1.4),
      función v2 (1.5), línea base y `$T0` anotados (1.6)
- [ ] **2.** VENTA creada en test mode por 14900 con `4242424242424242` (paso 2)
- [ ] **3.** Fila `SALE` con `livemode = false` y `gross_amount_cents = 14900`
- [ ] **4.** Reembolso **PARCIAL** de 5000 sobre 14900 — un solo reembolso
- [ ] **5.** `PARTIAL_REFUND` con `gross = -5000`, `refunded_amount_cents = 5000`,
      orden en `paid`
- [ ] **6.** Disputa generada con `4000000000000259`
- [ ] **7.** `CHARGEBACK` con `gross = -14900` y orden en `disputed`
- [ ] **8.** Disputa cerrada con `stripe disputes close` → `CHARGEBACK` con
      `gross = 0` y orden en `chargeback`
- [ ] **9.** **0 filas con `livemode IS NULL` desde `$T0`** + censo positivo de
      4 filas marcadas (9.1, 9.2)
- [ ] **10.** Delta del ingreso real **exactamente 0 y 0**, con las 4 filas de
      prueba existiendo y excluidas (10.1)

Verificaciones de apoyo:

- [ ] `stripe_fee_cents` y `net_settled_cents` poblados en las 4 filas (9.3)
- [ ] `stripe_event_id` sin duplicados (9.4)
- [ ] Transiciones de `app_orders` correctas, incluido `paid` tras parcial (9.5)
- [ ] El reenvío del mismo evento no creó fila nueva (11.1)
- [ ] **Ninguna fila del libro mayor fue borrada ni modificada** (R3, §13)

---

## 13. Limpieza — **no la hay, y es una regla, no un descuido**

> ### REGLA R3: LAS FILAS DE ESTA PRUEBA NO SE BORRAN NI SE MODIFICAN. NUNCA.
>
> `app_marketplace_revenue_events` es **append-only por diseño**: no existe
> política de UPDATE ni de DELETE para ningún rol, y `authenticated` solo tiene
> SELECT. No es un descuido que se pueda "arreglar" — es la propiedad que hace
> que el libro mayor sirva como evidencia. Un registro que se puede editar a
> posteriori no prueba nada.
>
> Las 4 filas **se quedan para siempre**, y eso es el resultado correcto de esta
> prueba, no un efecto secundario a tolerar. Son **evidencia de prueba,
> clasificada como tal** por `livemode = false`.

Ninguna de estas operaciones está permitida, ni "solo por esta vez":

- ❌ `DELETE FROM app_marketplace_revenue_events WHERE livemode = false;`
- ❌ `UPDATE ... SET livemode = true` para "normalizar" una fila NULL
- ❌ `UPDATE ... SET gross_amount_cents = ...` para "arreglar" el cierre de disputa
- ❌ Añadir una política de DELETE
- ❌ Usar `service_role` para cualquiera de las anteriores

`service_role` **puede** físicamente saltarse RLS. Eso es una salida de
emergencia operativa, no un permiso: usarla para borrar historial destruye
exactamente la propiedad por la que existe la tabla. En esta prueba `service_role`
y `postgres` se usan **solo para SELECT**. Una corrección se registra como un
**evento nuevo** de tipo `ADJUSTMENT`, nunca como una edición del pasado.

**`livemode = false` es precisamente lo que hace esto aceptable.** Las filas se
quedan para siempre, pero quedan marcadas de forma barata, indexada y permanente,
y se excluyen con un predicado trivial:

```sql
WHERE livemode IS DISTINCT FROM false
```

Ese es el trato completo: **no borramos nada, y no hace falta.**

---

## 14. Referencia rápida — columnas reales de la tabla

Verificado contra `sql/005-revenue-events.sql` §2 y
`sql/006-revenue-events-livemode.sql` §1. **Ninguna consulta de este kit nombra
una columna fuera de esta lista.** Una columna inexistente hace fallar la
consulta en tiempo de ejecución y desperdicia una transacción que no se puede
deshacer.

```
id                        UUID     PK
order_id                  UUID     FK -> app_orders(id)
course_id                 UUID     FK -> app_academy_courses(id)
instructor_id             UUID     FK -> app_marketplace_instructors(id)
event_type                TEXT     NOT NULL  CHECK: SALE | REFUND | PARTIAL_REFUND |
                                             CHARGEBACK | CHARGEBACK_REVERSAL | ADJUSTMENT
occurred_at               TIMESTAMPTZ NOT NULL   -- cuándo pasó, según Stripe
currency                  TEXT     NOT NULL DEFAULT 'EUR'
gross_amount_cents        INTEGER
tax_amount_cents          INTEGER
discount_amount_cents     INTEGER
stripe_fee_cents          INTEGER
net_settled_cents         INTEGER
coupon_code               TEXT
promotion_id              TEXT
discount_funded_by        TEXT
buyer_country             TEXT
buyer_country_evidence    JSONB
buyer_vat_number          TEXT
buyer_is_business         BOOLEAN            -- tres estados
instructor_tier_at_event  TEXT
acquisition_channel       TEXT
stripe_event_id           TEXT     UNIQUE    -- clave de idempotencia
stripe_object_id          TEXT
raw_payload               JSONB
created_at                TIMESTAMPTZ NOT NULL   -- cuándo lo escribimos nosotros
livemode                  BOOLEAN            -- (006) tres estados, sin default
```

`occurred_at` y `created_at` **no son lo mismo**: difieren en reintentos y
backfills. Las consultas de este kit filtran por `created_at >= $T0` porque lo
que se acota es "lo que escribió esta ejecución", no "lo que pasó en Stripe".

Columnas de `app_orders` usadas aquí, añadidas por `005` §1: `course_id`,
`instructor_id`, `instructor_tier_at_sale`, `acquisition_channel`,
`referral_code`, `referring_user_id`, `refunded_amount_cents`. Más las de `003`
que este kit consulta: `status`, `amount_cents`, `refunded_at`,
`stripe_payment_intent_id`, `stripe_checkout_session_id`.
