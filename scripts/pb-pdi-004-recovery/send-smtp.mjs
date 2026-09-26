#!/usr/bin/env node
/**
 * PB-PDI-004 — TEST del correo de recuperación vía el proveedor SMTP
 * server-side existente (one.com, mismo adaptador que
 * supabase/functions/_shared/email-provider.ts / notification-dispatcher).
 *
 * DOBLE CERROJO (igual que send.mjs):
 * - Solo funciona en modo TEST: el ÚNICO destinatario permitido es
 *   support@pipingbox.com. Cualquier otro destinatario aborta el proceso.
 * - El envío REAL al usuario queda fuera de este script (requiere el
 *   segundo GO explícito del PO y credenciales con permiso para ello).
 *
 * Uso (GitHub Actions o local):
 *   SMTP_HOST=... SMTP_USER=... SMTP_PASSWORD=... [SMTP_FROM=...] \
 *     node send-smtp.mjs --to support@pipingbox.com --name Edward
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import nodemailer from 'nodemailer';

const HERE = dirname(fileURLToPath(import.meta.url));

const FROM_NAME = 'PipingBox';
const FROM_DEFAULT = 'noreply@pipingbox.com';
const REPLY_TO = 'support@pipingbox.com';
const TEST_RECIPIENT = 'support@pipingbox.com';
const SUBJECT = '[TEST] Hemos corregido un problema en tu cuenta de PipingBox';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : process.argv[i + 1];
}

const to = (arg('to') ?? TEST_RECIPIENT).trim().toLowerCase();
const name = arg('name') ?? 'Edward';

if (to !== TEST_RECIPIENT) {
  console.error(
    `BLOQUEADO: este script solo envía TESTs a ${TEST_RECIPIENT} (recibido: ${to}). ` +
      'El envío real requiere el segundo GO explícito del PO.',
  );
  process.exit(1);
}

const host = process.env.SMTP_HOST;
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASSWORD;
const from = process.env.SMTP_FROM || FROM_DEFAULT;
if (!host || !user || !pass) {
  console.error('Faltan SMTP_HOST / SMTP_USER / SMTP_PASSWORD en el entorno.');
  process.exit(1);
}

const html = readFileSync(join(HERE, 'template.html'), 'utf8').replaceAll('{{NAME}}', name);
const text = readFileSync(join(HERE, 'template.txt'), 'utf8').replaceAll('{{NAME}}', name);

const transporter = nodemailer.createTransport({
  host,
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE !== 'false',
  auth: { user, pass },
});

try {
  const result = await transporter.sendMail({
    from: { name: FROM_NAME, address: from },
    to,
    replyTo: REPLY_TO,
    subject,
    text,
    html,
  });
  // Sanitized output: message id without internal host details if present.
  const sanitizedId = (result.messageId ?? '').replace(/<[^\s>]+@([^\s>]+)>/, '<$1>');
  console.log(
    JSON.stringify(
      {
        accepted: true,
        provider: 'smtp_onecom',
        from: `${FROM_NAME} <${from}>`,
        reply_to: REPLY_TO,
        to,
        subject,
        mode: 'TEST',
        message_id: sanitizedId || null,
        accepted_envelopes: (result.accepted ?? []).length,
      },
      null,
      2,
    ),
  );
} catch (err) {
  console.error(`SMTP rechazó el envío: ${String(err && err.message ? err.message : err)}`);
  process.exit(1);
}
