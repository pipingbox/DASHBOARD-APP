# Verificación Stripe test-mode → `app_marketplace_revenue_events`

**Ticket:** PB-MARKET-REVENUE-LIVEMODE-001
**Objetivo:** ejecutar una VENTA → REEMBOLSO PARCIAL → DISPUTA en Stripe **test
mode** y confirmar que las filas aterrizan en `app_marketplace_revenue_events`
con `livemode = false`, con las comisiones reales de Stripe y con el estado de
`app_orders` correctamente transicionado.

Este documento es un **procedimiento ejecutable**, no una guía. Cada paso trae
su comando exacto, su resultado esperado y qué hacer si falla. Está escrito para
ejecutarse de arriba abajo sin improvisar nada en caliente.

---

> ## ⛔ BLOQUEANTE — LEA ESTO ANTES DE TOCAR NADA
>
> **`sql/006-revenue-events-livemode.sql` DEBE estar aplicado antes de crear la
> primera transacción de prueba.**
>
> `app_marketplace_revenue_events` es **append-only por diseño**: no tiene
> política de UPDATE ni de DELETE, para ningún rol. Una fila escrita ahí **no se
> puede corregir y no se puede borrar, nunca**.
>
> Si ejecuta esta prueba **antes** de aplicar `006`, las tres filas de prueba
> quedan escritas en el libro mayor de ingresos de producción **sin columna que
> las distinga del dinero real**, de forma **permanente**. El dato sobrevive
> dentro de `raw_payload` en JSON, pero eso obliga a que *todas* las consultas
> financieras futuras recuerden excavar en JSONB para excluirlas — exactamente
> la trampa que produce una cifra equivocada en un P&L un año después, cuando ya
> nadie recuerda que hubo una prueba.
>
> **No hay limpieza posterior posible.** Ver la sección 7.

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

La comprobación de `sk_test_` no es decorativa: es la única barrera automática
entre este procedimiento y una transacción con dinero real.

---

## 1. Precondiciones — compruebe LAS CUATRO antes de crear nada

El objetivo de esta sección es que un fallo posterior se **diagnostique** en
lugar de adivinarse. Si las cuatro pasan y aun así no aparece una fila, el
problema está en el handler, no en la configuración — y eso reduce el espacio de
búsqueda enormemente.

### 1.1 Los dos eventos de disputa están suscritos

El código maneja `charge.dispute.created` y `charge.dispute.closed` desde
PB-MARKET-REVENUE-EVENTS-001, **pero manejarlos en código no hace nada hasta que
Stripe recibe la orden de entregarlos**. Esta es la causa más probable de que la
parte de disputa de esta prueba no produzca ninguna fila.

```bash
stripe webhook_endpoints list --api-key "$STRIPE_API_KEY"
```

Localice el endpoint cuya URL sea:

```
https://mwdauubztjxkbrefirbg.supabase.co/functions/v1/stripe-webhook
```

**Esperado:** que `enabled_events` incluya, como mínimo:

```
checkout.session.completed
charge.refunded
charge.dispute.created      <-- suscribir si falta
charge.dispute.closed       <-- suscribir si falta
```

Si faltan los dos de disputa, añádalos en Dashboard → Developers → Webhooks →
(endpoint) → *Update details* → *Select events*. También sirve:

```bash
stripe webhook_endpoints update <we_id> \
  --api-key "$STRIPE_API_KEY" \
  -d "enabled_events[]=checkout.session.completed" \
  -d "enabled_events[]=charge.refunded" \
  -d "enabled_events[]=charge.dispute.created" \
  -d "enabled_events[]=charge.dispute.closed"
```

> `enabled_events` se **reemplaza entero**, no se añade. Incluya en la llamada
> todos los eventos que el endpoint ya tenía, o los perderá silenciosamente.

### 1.2 El secreto de firma coincide

Si `STRIPE_WEBHOOK_SECRET` en Supabase no es el de **este** endpoint, la función
devuelve `400 invalid signature` y **no escribe absolutamente nada**. Desde la
base de datos esto es indistinguible de "el webhook no está suscrito": en ambos
casos no hay fila. Se distinguen mirando los intentos de entrega en Stripe.

```bash
# El secreto vive en Stripe; compare su PREFIJO con el configurado en Supabase.
stripe webhook_endpoints retrieve <we_id> --api-key "$STRIPE_API_KEY"
```

En Supabase: Dashboard → Edge Functions → `stripe-webhook` → Secrets. Confirme
que `STRIPE_WEBHOOK_SECRET` empieza por `whsec_` y corresponde a **este**
endpoint, no al que genera `stripe listen` en local (son distintos).

### 1.3 `006` está aplicado — EL BLOQUEANTE

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -c "
SELECT column_name, data_type, is_nullable, COALESCE(column_default,'(ninguno)') AS column_default
  FROM information_schema.columns
 WHERE table_schema='public'
   AND table_name='app_marketplace_revenue_events'
   AND column_name='livemode';"
```

**Esperado exactamente:**

```
 column_name | data_type | is_nullable | column_default
-------------+-----------+-------------+----------------
 livemode    | boolean   | YES         | (ninguno)
```

**Si devuelve 0 filas: PARE.** `006` no está aplicado. Aplíquelo antes de
continuar; si crea la transacción ahora, genera filas no marcables para siempre.

Confirme también el índice parcial:

```bash
psql "$SUPABASE_DB_URL" -c "
SELECT indexname, indexdef FROM pg_indexes
 WHERE schemaname='public'
   AND tablename='app_marketplace_revenue_events'
   AND indexname='idx_app_marketplace_revenue_events_livemode_true';"
```

**Esperado:** una fila cuyo `indexdef` termine en
`WHERE (livemode IS DISTINCT FROM false)`.

### 1.4 La Edge Function desplegada es la que captura `livemode`

Aplicar `006` sin redesplegar la función deja la columna siempre en NULL: el SQL
está pero nadie escribe el valor. Y al revés es peor — desplegar la función
**antes** de aplicar `006` hace que PostgREST rechace la fila entera por columna
inexistente, y como la captura está envuelta en try/catch, **el fallo es
invisible**: el pago funciona y la telemetría se pierde en silencio.

**Orden correcto: primero `006`, después el deploy.**

```bash
supabase functions deploy stripe-webhook --no-verify-jwt --project-ref "$SUPABASE_PROJECT_REF"
```

Verifique que el código desplegado contiene la captura (4 sitios de llamada, uno
por tipo de evento):

```bash
grep -c 'livemode: event.livemode' supabase/functions/stripe-webhook/index.ts
# Esperado: 4
```

> `--no-verify-jwt` es obligatorio: Stripe no envía JWT de Supabase. La
> autenticación aquí es la firma, que es más fuerte.

### 1.5 Línea base — cuente ANTES de empezar

Sin esto no podrá distinguir una fila nueva de una que ya estaba.

```bash
psql "$SUPABASE_DB_URL" -c "
SELECT COALESCE(livemode::text,'unknown (pre-006)') AS provenance,
       count(*) AS filas
  FROM app_marketplace_revenue_events
 GROUP BY 1 ORDER BY 1;"
```

Anote el resultado. Lo normal antes de la primera prueba es que **no exista
ninguna fila con `livemode = false`**.

---

## 2. Las tres transacciones

Se usan las tarjetas de prueba documentadas por Stripe. **Todo en test mode.**

| Tarjeta | Efecto |
| --- | --- |
| `4242424242424242` | Pago correcto. Se usa para VENTA + REEMBOLSO PARCIAL. |
| `4000000000000259` | Pago correcto y **disputa automática** poco después. |

`4000000000000259` es la vía limpia para la disputa: produce un
`charge.dispute.created` **real**, generado por Stripe, en lugar de uno forzado
con `stripe trigger`. Un evento forzado no lleva `payment_intent` asociado a una
orden nuestra, así que `loadOrderAttribution` no encuentra nada y la fila sale
con `order_id = NULL` — lo cual no prueba lo que queremos probar.

### 2.1 VENTA

Cree un checkout real por el flujo normal del producto (`create-checkout`), de
modo que la orden lleve `course_id`, `instructor_id` y la atribución. Pague con
`4242424242424242`, fecha futura, CVC cualquiera.

Anote de la sesión:

```bash
export PI_SALE='pi_...'      # payment_intent
export CH_SALE='ch_...'      # charge
```

Si necesita localizarlos:

```bash
stripe payment_intents list --limit 3 --api-key "$STRIPE_API_KEY"
stripe charges list --limit 3 --api-key "$STRIPE_API_KEY"
```

**Esperado:** una fila `SALE` con `livemode = false` y `app_orders.status = 'paid'`.

### 2.2 REEMBOLSO — **PARCIAL, no total**

**Reembolse PARCIALMENTE, deliberadamente.** El esquema distingue `REFUND` de
`PARTIAL_REFUND`, y el total es el camino fácil: `isFullRefund` sale `true` casi
por construcción y no ejercita nada. El parcial es donde la lógica de
`refunded_amount_cents` puede estar mal de verdad, y además es el único caso que
comprueba que una orden parcialmente reembolsada **sigue en `paid`** (el
comprador conserva lo que pagó; solo el reembolso total deshace la venta).

Reembolse **una fracción estricta** del importe. Para un curso de 149,00 €:

```bash
stripe refunds create \
  --api-key "$STRIPE_API_KEY" \
  --payment-intent "$PI_SALE" \
  --amount 5000            # 50,00 € de 149,00 €
```

> `--amount` va en **céntimos** y debe ser **estrictamente menor** que el cargo.
> Si iguala el total, obtendrá `REFUND` y no `PARTIAL_REFUND`, y esta parte de la
> prueba pierde su sentido.

**Esperado:** fila `PARTIAL_REFUND`, `gross_amount_cents = -5000` (negativo: el
dinero sale), `app_orders.status` **sigue** `paid`, `refunded_amount_cents = 5000`.

### 2.3 DISPUTA

Nuevo checkout, esta vez con `4000000000000259`. El pago se aprueba y Stripe
abre la disputa automáticamente a los pocos minutos.

```bash
export PI_DISPUTE='pi_...'
```

Espere a que llegue el evento y compruebe:

```bash
stripe disputes list --limit 3 --api-key "$STRIPE_API_KEY"
stripe events list --type charge.dispute.created --limit 3 --api-key "$STRIPE_API_KEY"
```

**Esperado:** fila `CHARGEBACK` con `gross_amount_cents` negativo y
`app_orders.status = 'disputed'`.

> `disputed` y no `chargeback`: la disputa está **abierta** y el resultado se
> desconoce. El acceso **no** se revoca aquí a propósito — una disputa se puede
> ganar.

**Cierre de la disputa (opcional, más lento).** Si quiere ejercitar también
`charge.dispute.closed`, envíe evidencia y Stripe la resuelve en test mode:

```bash
stripe disputes update <dp_id> --api-key "$STRIPE_API_KEY" \
  -d "evidence[uncategorized_text]=test evidence"
stripe disputes close <dp_id> --api-key "$STRIPE_API_KEY"   # fuerza 'lost'
```

`lost` → fila `CHARGEBACK` y `app_orders.status = 'chargeback'`.
Ganada → fila `CHARGEBACK_REVERSAL` y la orden vuelve a `paid`.

---

## 3. SQL de verificación — copiar y pegar

### 3.1 Panorama: las tres filas de prueba

```sql
SELECT
  e.event_type,
  e.livemode,
  e.gross_amount_cents,
  e.stripe_fee_cents,
  e.net_settled_cents,
  e.currency,
  e.stripe_event_id,
  e.stripe_object_id,
  o.status        AS order_status,
  o.refunded_amount_cents,
  e.occurred_at
FROM app_marketplace_revenue_events e
LEFT JOIN app_orders o ON o.id = e.order_id
WHERE e.livemode = false
ORDER BY e.occurred_at;
```

**Esperado:** 3 filas (4 si cerró la disputa) — `SALE`, `PARTIAL_REFUND`,
`CHARGEBACK` — **todas con `livemode = false`**.

### 3.2 Ninguna fila de prueba quedó sin marcar

La comprobación más importante del documento. Si `006` estuviera aplicado pero la
función desplegada fuera la antigua, las filas entrarían con `livemode = NULL` y
serían indistinguibles del histórico.

```sql
SELECT id, event_type, occurred_at, stripe_event_id,
       raw_payload ->> 'livemode' AS livemode_en_payload
  FROM app_marketplace_revenue_events
 WHERE livemode IS NULL
   AND created_at >= now() - interval '2 hours'
 ORDER BY created_at DESC;
```

**Esperado: 0 filas.**

> La ventana de 2 horas es deliberada: acota la consulta a **lo que acaba de
> escribir esta prueba**. Las filas anteriores a `006` también tienen `livemode`
> NULL y son correctas — su provenance es genuinamente desconocida y no se
> rellena con una conjetura. Sin el filtro por `created_at`, esta comprobación
> daría un falso positivo por cada fila histórica. Si su prueba dura más de dos
> horas, amplíe el intervalo.

Cualquier fila aquí es una fila **no marcable de forma permanente**. Si aparece:
la función desplegada no captura `livemode` (ver 1.4). La columna
`livemode_en_payload` le dirá qué decía Stripe realmente, pero **no la use para
hacer un UPDATE**: la tabla es append-only y corregirla a mano normaliza justo la
operación que el diseño prohíbe.

### 3.3 `event_type` correcto por transacción

```sql
SELECT event_type, count(*) AS filas
  FROM app_marketplace_revenue_events
 WHERE livemode = false
 GROUP BY 1 ORDER BY 1;
```

**Esperado:** `SALE` 1, `PARTIAL_REFUND` 1, `CHARGEBACK` 1.

Si ve `REFUND` en lugar de `PARTIAL_REFUND`, reembolsó el importe completo:
repita 2.2 con un importe estrictamente menor.

### 3.4 Comisiones reales, no NULL

`stripe_fee_cents` y `net_settled_cents` deben venir de la **balance
transaction**, no calculados. NULL significa "no se pudo observar", y es
justamente lo que esta prueba tiene que descartar.

```sql
SELECT event_type, stripe_event_id, stripe_fee_cents, net_settled_cents
  FROM app_marketplace_revenue_events
 WHERE livemode = false
   AND (stripe_fee_cents IS NULL OR net_settled_cents IS NULL);
```

**Esperado: 0 filas.**

Si aparece la fila `SALE` con NULL, la llamada extra a la API para leer la
balance transaction falló (permisos de la clave, o expansión no disponible). En
test mode Stripe sí publica comisiones simuladas, así que NULL aquí es un
defecto real, no una peculiaridad del entorno.

> Matiz esperable en el reembolso: Stripe **no devuelve** la comisión original
> del cargo. Un `stripe_fee_cents = 0` en el `PARTIAL_REFUND` es correcto y no un
> fallo; lo que no debe ocurrir es NULL.

### 3.5 `stripe_event_id` único

```sql
SELECT stripe_event_id, count(*)
  FROM app_marketplace_revenue_events
 WHERE stripe_event_id IS NOT NULL
 GROUP BY 1 HAVING count(*) > 1;
```

**Esperado: 0 filas.** Es la garantía de idempotencia del webhook.

### 3.6 Transición de estado de `app_orders`

```sql
SELECT o.id, o.status, o.amount_cents, o.refunded_amount_cents, o.refunded_at,
       string_agg(e.event_type, ', ' ORDER BY e.occurred_at) AS eventos
  FROM app_orders o
  JOIN app_marketplace_revenue_events e ON e.order_id = o.id
 WHERE e.livemode = false
 GROUP BY o.id, o.status, o.amount_cents, o.refunded_amount_cents, o.refunded_at
 ORDER BY o.id;
```

**Esperado:**

| Escenario | `status` | `refunded_amount_cents` |
| --- | --- | --- |
| Venta pagada | `paid` | NULL |
| **Reembolso parcial** | **`paid`** (sigue pagada) | el importe parcial |
| Reembolso total | `refunded` | = `amount_cents` |
| Disputa abierta | `disputed` | NULL |
| Disputa perdida | `chargeback` | NULL |
| Disputa ganada | `paid` | NULL |

`paid` tras un reembolso parcial **no es un error**: el comprador conserva lo que
pagó y solo el reembolso total deshace la venta.

### 3.7 El ingreso real excluye la prueba — la consulta canónica

```sql
-- Ingreso REAL: incluye histórico previo a 006 (provenance desconocida) y
-- excluye solo lo OBSERVADO como test. Nótese "IS DISTINCT FROM false".
SELECT count(*) AS eventos, COALESCE(sum(gross_amount_cents),0) AS bruto_cents
  FROM app_marketplace_revenue_events
 WHERE livemode IS DISTINCT FROM false;

-- Solo la prueba.
SELECT count(*) AS eventos, COALESCE(sum(gross_amount_cents),0) AS bruto_cents
  FROM app_marketplace_revenue_events
 WHERE livemode = false;
```

**Esperado:** la primera cifra no varía respecto a la línea base de 1.5. Ese es
el resultado que da sentido a todo el ticket: la prueba existe en la tabla y **no
contamina el ingreso**.

> **Nunca escriba `WHERE livemode = true`** en un informe: descarta también todas
> las filas históricas anteriores a `006`, que tienen `livemode` NULL, e
> infravalora el ingreso en silencio.

---

## 4. Comprobación de idempotencia

Stripe reintenta entregas. Un reintento **no** debe crear una segunda fila.

```bash
# Tome un event id real de la prueba
stripe events list --limit 5 --api-key "$STRIPE_API_KEY"
export EVT='evt_...'

# Cuente ANTES
psql "$SUPABASE_DB_URL" -tAc \
  "SELECT count(*) FROM app_marketplace_revenue_events WHERE stripe_event_id='$EVT';"
# Esperado: 1

# Reenvíe la MISMA entrega
stripe events resend "$EVT" --api-key "$STRIPE_API_KEY"

# Cuente DESPUÉS (deje unos segundos)
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

---

## 5. Si algo falla — causa probable por síntoma

### 5.1 EL CASO IMPORTANTE: "no aparece la fila"

Desde la base de datos, **"el webhook no está suscrito" y "el webhook disparó
pero el INSERT falló" son idénticos**: en ambos no hay fila. Tienen arreglos
completamente distintos, así que hay que separarlos **antes** de tocar nada. El
discriminador es Stripe, no la base de datos.

```bash
# ¿Generó Stripe el evento siquiera?
stripe events list --type charge.dispute.created --limit 5 --api-key "$STRIPE_API_KEY"
```

**Árbol de decisión:**

| Stripe generó el evento | Hay intento de entrega al endpoint | Diagnóstico | Arreglo |
| --- | --- | --- | --- |
| No | — | La transacción no produjo el evento | Revise 2.3; ¿usó `4000000000000259`? |
| Sí | **No** | **NO SUSCRITO** | Añada el evento al endpoint (1.1) |
| Sí | Sí, `400` | Firma incorrecta | `STRIPE_WEBHOOK_SECRET` no coincide (1.2) |
| Sí | Sí, `500` | El handler explotó | Logs de la función; la fila de dedupe se borra y Stripe reintenta |
| Sí | Sí, `200` | **Disparó, pero el INSERT falló** | Logs: `revenue event insert failed` |

La distinción decisiva es la columna del medio: **si no hay ni intento de
entrega, el problema es de configuración en Stripe y ningún cambio de código lo
arregla.** Si hay intento con `200` y aun así no hay fila, el problema está en la
base de datos o en el propio INSERT — y como la captura está en try/catch, la
función responde `200` igualmente. Por eso el `200` no prueba que la fila exista.

```bash
supabase functions logs stripe-webhook --project-ref "$SUPABASE_PROJECT_REF" | \
  grep -E "revenue event insert failed|revenue event insert threw|capture failed"
```

### 5.2 Resto de síntomas

| Síntoma | Causa probable | Arreglo |
| --- | --- | --- |
| Fila con `livemode = NULL` | La función desplegada es la anterior a la captura | Redespliegue (1.4). **La fila NULL no se puede corregir** |
| Fila creada pero `PGRST204` / "column does not exist" en logs | La función se desplegó **antes** de aplicar `006` | Aplique `006` y reintente; el pago no se vio afectado |
| `event_type = REFUND` en vez de `PARTIAL_REFUND` | Reembolsó el importe completo | Repita con importe estrictamente menor (2.2) |
| `stripe_fee_cents` NULL | No se pudo leer la balance transaction | Revise permisos de la clave y los logs de `fetchSettlementFacts` |
| `order_id` NULL en la fila | La disputa se forzó con `stripe trigger` | Use `4000000000000259` (2.3) |
| `app_orders.status` no cambió | El `payment_intent` no casa con ninguna orden | Compruebe `stripe_payment_intent_id` en `app_orders` |
| Fila duplicada | La garantía de idempotencia se rompió | **Incidencia grave**: revise que el UNIQUE de `stripe_event_id` siga existiendo |
| `400 invalid signature` en todas | Secreto equivocado | 1.2. Ojo: el de `stripe listen` **no** es el del endpoint |

---

## 6. Lista de comprobación final

- [ ] `006` aplicado: `livemode` existe, nullable, sin default (1.3)
- [ ] Índice parcial con `WHERE (livemode IS DISTINCT FROM false)` (1.3)
- [ ] `charge.dispute.created` y `charge.dispute.closed` suscritos (1.1)
- [ ] Función desplegada con captura de `livemode`, 4 sitios (1.4)
- [ ] 3 filas con `livemode = false`: SALE, PARTIAL_REFUND, CHARGEBACK (3.1)
- [ ] **0 filas recientes con `livemode IS NULL`** (3.2)
- [ ] `stripe_fee_cents` y `net_settled_cents` poblados (3.4)
- [ ] `stripe_event_id` sin duplicados (3.5)
- [ ] Estados de `app_orders` correctos, incluido `paid` tras parcial (3.6)
- [ ] El total de ingreso real no varió respecto a la línea base (3.7)
- [ ] El reenvío no creó fila nueva (4)

---

## 7. Limpieza — **no la hay, y es a propósito**

> ### Estas filas NO SE PUEDEN BORRAR.
>
> `app_marketplace_revenue_events` es **append-only por diseño**: no existe
> política de UPDATE ni de DELETE para ningún rol, y `authenticated` solo tiene
> SELECT. No es un descuido que se pueda "arreglar" — es la propiedad que hace
> que el libro mayor sirva como evidencia. Un registro que se puede editar a
> posteriori no prueba nada.

No intente ninguna de estas cosas:

- ❌ `DELETE FROM app_marketplace_revenue_events WHERE livemode = false;`
- ❌ `UPDATE ... SET livemode = true` para "normalizar" una fila NULL
- ❌ Añadir una política de DELETE "solo por esta vez"

`service_role` **puede** físicamente saltarse RLS. Eso es una salida de
emergencia operativa, no un permiso: usarla para borrar historial destruye
exactamente la propiedad por la que existe la tabla. Una corrección se registra
como un **evento nuevo** de tipo `ADJUSTMENT`, nunca como una edición del pasado.

**`livemode = false` es precisamente lo que hace esto aceptable.** Las filas se
quedan para siempre, pero quedan marcadas de forma barata, indexada y permanente,
y se excluyen con un predicado trivial:

```sql
WHERE livemode IS DISTINCT FROM false
```

Ese es el trato completo: **no borramos nada, y no hace falta.**

Y por eso, una última vez: **ejecutar esta prueba antes de aplicar `006` crea
filas no marcables**, sin columna que las separe del ingreso real, para siempre.
El orden no es una recomendación.
