#!/usr/bin/env node
/**
 * PB-PDI-004 — envío del correo de recuperación de cuenta vía Resend
 * (proveedor SMTP server-side existente, mismo que cert-expiry-alerts).
 *
 * SEGURIDAD (doble cerrojo):
 * - Sin `--real-go`, el ÚNICO destinatario permitido es support@pipingbox.com
 *   (modo TEST). Cualquier otro destinatario aborta el proceso.
 * - `--real-go` exige además la variable de entorno PO_GO=1 (GO explícito del
 *   PO) y que la corrección PB-PDI-004 esté verificada en producción
 *   (PROD_SHA_VERIFIED=1).
 *
 * Uso TEST:
 *   RESEND_API_KEY=... node send.mjs --to support@pipingbox.com --name Edward --test
 *
 * Uso REAL (bloqueado hasta doble GO del PO):
 *   RESEND_API_KEY=... PO_GO=1 PROD_SHA_VERIFIED=1 node send.mjs --to <email> --name <Nombre> --real-go
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

const FROM = 'PipingBox <noreply@pipingbox.com>';
const REPLY_TO = 'support@pipingbox.com';
const TEST_RECIPIENT = 'support@pipingbox.com';
const SUBJECT_REAL = 'Hemos corregido un problema en tu cuenta de PipingBox';
const SUBJECT_TEST = `[TEST] ${SUBJECT_REAL}`;

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : process.argv[i + 1];
}
const hasFlag = (name) => process.argv.includes(`--${name}`);

const to = arg('to');
const name = arg('name') ?? 'Edward';
const isTest = hasFlag('test');
const isRealGo = hasFlag('real-go');

if (!to) {
  console.error('Falta --to <email>');
  process.exit(1);
}
if (!isTest && !isRealGo) {
  console.error('Modo requerido: --test (solo support@pipingbox.com) o --real-go (doble GO del PO).');
  process.exit(1);
}
if (isRealGo) {
  if (process.env.PO_GO !== '1' || process.env.PROD_SHA_VERIFIED !== '1') {
    console.error('BLOQUEADO: --real-go exige PO_GO=1 y PROD_SHA_VERIFIED=1 (GO del PO + fix verificado en producción).');
    process.exit(1);
  }
}
if (!isRealGo && to.trim().toLowerCase() !== TEST_RECIPIENT) {
  console.error(`BLOQUEADO: en modo TEST el único destinatario permitido es ${TEST_RECIPIENT}. Recibido: ${to}`);
  process.exit(1);
}

const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) {
  console.error('Falta RESEND_API_KEY en el entorno.');
  process.exit(1);
}

const html = readFileSync(join(HERE, 'template.html'), 'utf8').replaceAll('{{NAME}}', name);
const text = readFileSync(join(HERE, 'template.txt'), 'utf8').replaceAll('{{NAME}}', name);

const res = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    from: FROM,
    to: [to],
    reply_to: REPLY_TO,
    subject: isRealGo ? SUBJECT_REAL : SUBJECT_TEST,
    html,
    text,
  }),
});

const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`Resend rechazó el envío: HTTP ${res.status}`, JSON.stringify(body));
  process.exit(1);
}
console.log(JSON.stringify({
  accepted: true,
  provider: 'resend',
  message_id: body.id ?? null,
  from: FROM,
  reply_to: REPLY_TO,
  to,
  subject: isRealGo ? SUBJECT_REAL : SUBJECT_TEST,
  mode: isRealGo ? 'REAL' : 'TEST',
}, null, 2));
