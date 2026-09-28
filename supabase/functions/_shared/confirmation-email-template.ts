// _shared/confirmation-email-template.ts
// Correo transaccional (rumano) para cuentas con email sin confirmar: explica
// cómo reenviar y usar el correo de confirmación más reciente.
//
// COPY EXACTO APROBADO POR EL PO (2026-09-28). No modificar el texto sin un
// nuevo GO del PO. Sin UUID, correlation IDs, IP, métricas, códigos internos,
// contraseñas ni datos analíticos. No afirma fallo de la plataforma: la causa
// es que el correo sigue sin confirmar.
//
// Diseño: plantilla responsive aprobada de PipingBox (negro/blanco/naranja,
// logotipo horizontal oficial), botón CONFIRMĂ CONTUL → /login.

export const CONFIRMATION_RO_TEMPLATE_ID = "confirmation_ro_v1";
export const CONFIRMATION_RO_SUBJECT = "Acțiune necesară: confirmă adresa de e-mail pentru contul PipingBox";

export function confirmationRoSubject(): string {
  return CONFIRMATION_RO_SUBJECT;
}

function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** HTML responsive con el copy exacto aprobado. {{NAME}} = solo nombre de pila. */
export function renderConfirmationRoHtml(name: string): string {
  const n = esc(name);
  return `<!DOCTYPE html>
<html lang="ro" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>PipingBox</title>
</head>
<body style="margin:0; padding:0; background-color:#09090b; -webkit-text-size-adjust:100%;">
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all;">
    Contul a fost creat corect, însă adresa de e-mail nu a fost încă confirmată.
  </div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#09090b;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px; max-width:100%;">

          <!-- Header: logo sobre negro -->
          <tr>
            <td align="center" style="padding:24px 24px 20px 24px; background-color:#000000; border-bottom:2px solid #f59e0b;">
              <img src="https://pipingbox.com/assets/logos/logo-horizontal.png"
                   alt="PipingBox" width="180"
                   style="display:block; width:180px; max-width:60%; height:auto; border:0;" />
            </td>
          </tr>

          <!-- Saludo + diagnóstico -->
          <tr>
            <td style="background-color:#ffffff; padding:32px 28px 16px 28px;">
              <h1 style="margin:0 0 16px 0; font-family:Arial,Helvetica,sans-serif; font-size:22px; line-height:28px; color:#09090b; font-weight:bold;">
                Bună, ${n},
              </h1>
              <p style="margin:0 0 16px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#27272a;">
                Am verificat contul tău PipingBox. Contul a fost creat corect, însă adresa de e-mail nu a fost încă confirmată. Din acest motiv, atunci când încerci să te autentifici, aplicația te redirecționează înapoi la pagina de conectare.
              </p>
              <p style="margin:0 0 24px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#27272a;">
                Pentru a finaliza înregistrarea, te rugăm să urmezi acești pași:
              </p>
            </td>
          </tr>

          <!-- Pasos numerados -->
          <tr>
            <td style="background-color:#ffffff; padding:0 28px 8px 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td width="36" valign="top" style="padding:0 8px 12px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#b45309; font-weight:bold;">1.</td>
                  <td valign="top" style="padding:0 0 12px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#27272a;">Accesează <a href="https://pipingbox.com/login" style="color:#b45309; text-decoration:underline;">https://pipingbox.com/login</a></td>
                </tr>
                <tr>
                  <td width="36" valign="top" style="padding:0 8px 12px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#b45309; font-weight:bold;">2.</td>
                  <td valign="top" style="padding:0 0 12px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#27272a;">Selectează opțiunea „Retrimite e-mailul de confirmare”.</td>
                </tr>
                <tr>
                  <td width="36" valign="top" style="padding:0 8px 12px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#b45309; font-weight:bold;">3.</td>
                  <td valign="top" style="padding:0 0 12px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#27272a;">Verifică mesajele primite la această adresă de e-mail.</td>
                </tr>
                <tr>
                  <td width="36" valign="top" style="padding:0 8px 12px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#b45309; font-weight:bold;">4.</td>
                  <td valign="top" style="padding:0 0 12px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#27272a;">Dacă nu găsești mesajul, verifică și folderul Spam sau Mesaje nedorite.</td>
                </tr>
                <tr>
                  <td width="36" valign="top" style="padding:0 8px 12px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#b45309; font-weight:bold;">5.</td>
                  <td valign="top" style="padding:0 0 12px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#27272a;">Deschide numai cel mai recent e-mail trimis de PipingBox.</td>
                </tr>
                <tr>
                  <td width="36" valign="top" style="padding:0 8px 12px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#b45309; font-weight:bold;">6.</td>
                  <td valign="top" style="padding:0 0 12px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#27272a;">Apasă pe butonul sau linkul de confirmare.</td>
                </tr>
                <tr>
                  <td width="36" valign="top" style="padding:0 8px 12px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#b45309; font-weight:bold;">7.</td>
                  <td valign="top" style="padding:0 0 12px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#27272a;">Revino la PipingBox și autentifică-te din nou.</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Nota enlaces caducados -->
          <tr>
            <td style="background-color:#ffffff; padding:8px 28px 8px 28px;">
              <p style="margin:0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#27272a;">
                Linkurile de confirmare mai vechi pot fi expirate, de aceea este important să folosești ultimul mesaj primit.
              </p>
            </td>
          </tr>

          <!-- Botón principal -->
          <tr>
            <td align="center" style="background-color:#ffffff; padding:24px 28px 32px 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" bgcolor="#f59e0b" style="border-radius:6px;">
                    <a href="https://pipingbox.com/login"
                       style="display:inline-block; padding:14px 32px; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:20px; font-weight:bold; letter-spacing:0.5px; color:#000000; text-decoration:none; border-radius:6px;">
                      CONFIRMĂ CONTUL
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:20px 0 0 0; font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:18px; color:#71717a;">
                Dacă butonul nu funcționează, copiază acest link în browserul tău:<br />
                <a href="https://pipingbox.com/login" style="color:#b45309; text-decoration:underline; word-break:break-all;">https://pipingbox.com/login</a>
              </p>
            </td>
          </tr>

          <!-- Ayuda -->
          <tr>
            <td style="background-color:#ffffff; padding:0 28px 32px 28px;">
              <p style="margin:0 0 16px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#27272a;">
                Dacă problema continuă după confirmarea adresei, răspunde direct la acest e-mail și te vom ajuta.
              </p>
              <p style="margin:0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#27272a;">
                Cu stimă,
              </p>
            </td>
          </tr>

          <!-- Pie -->
          <tr>
            <td style="background-color:#000000; padding:24px 28px;">
              <p style="margin:0 0 8px 0; font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:20px; color:#ffffff; font-weight:bold;">
                Echipa PipingBox
              </p>
              <p style="margin:0; font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:18px; color:#a1a1aa;">
                <a href="https://pipingbox.com" style="color:#f59e0b; text-decoration:none;">https://pipingbox.com</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Texto plano equivalente (copy exacto). */
export function renderConfirmationRoText(name: string): string {
  return `Bună, ${name},

Am verificat contul tău PipingBox. Contul a fost creat corect, însă adresa de e-mail nu a fost încă confirmată. Din acest motiv, atunci când încerci să te autentifici, aplicația te redirecționează înapoi la pagina de conectare.

Pentru a finaliza înregistrarea, te rugăm să urmezi acești pași:

1. Accesează https://pipingbox.com/login
2. Selectează opțiunea „Retrimite e-mailul de confirmare”.
3. Verifică mesajele primite la această adresă de e-mail.
4. Dacă nu găsești mesajul, verifică și folderul Spam sau Mesaje nedorite.
5. Deschide numai cel mai recent e-mail trimis de PipingBox.
6. Apasă pe butonul sau linkul de confirmare.
7. Revino la PipingBox și autentifică-te din nou.

Linkurile de confirmare mai vechi pot fi expirate, de aceea este important să folosești ultimul mesaj primit.

CONFIRMĂ CONTUL:
https://pipingbox.com/login

Dacă problema continuă după confirmarea adresei, răspunde direct la acest e-mail și te vom ajuta.

Cu stimă,

Echipa PipingBox
https://pipingbox.com
`;
}
