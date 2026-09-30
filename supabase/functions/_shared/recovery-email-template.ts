// _shared/recovery-email-template.ts
// PB-PDI-004 / PB-UI-DOM-INSERTBEFORE-001 — plantilla del correo de
// recuperación (cuenta afectada por los errores de renderizado del 25/09,
// corregidos y desplegados en producción).
//
// COPY EXACTO APROBADO POR EL PO (2026-09-26). No modificar el texto sin un
// nuevo GO del PO. Sin UUIDs, correlation IDs, códigos PB-ERR, analítica,
// dispositivo ni referencias al seguimiento.
//
// Diseño: responsive (tabla anidada 600px máx.), negro/blanco/naranja
// PipingBox, logotipo canónico y botón VOLVER A MI PERFIL.

export const RECOVERY_EMAIL_SUBJECT = "Hemos corregido un problema en tu cuenta de PipingBox";
export const RECOVERY_EMAIL_TEST_SUBJECT_PREFIX = "[TEST] ";
export const RECOVERY_EMAIL_TEMPLATE_ID = "recovery_v1";

/** Asunto final: con prefijo [TEST] en modo prueba. */
export function recoverySubject(isTest: boolean): string {
  return isTest ? RECOVERY_EMAIL_TEST_SUBJECT_PREFIX + RECOVERY_EMAIL_SUBJECT : RECOVERY_EMAIL_SUBJECT;
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
export function renderRecoveryEmailHtml(name: string): string {
  const n = esc(name);
  return `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>PipingBox</title>
</head>
<body style="margin:0; padding:0; background-color:#09090b; -webkit-text-size-adjust:100%;">
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all;">
    Tu cuenta y tu información guardada siguen disponibles.
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

          <!-- Cuerpo -->
          <tr>
            <td style="background-color:#ffffff; padding:32px 28px 8px 28px;">
              <h1 style="margin:0 0 16px 0; font-family:Arial,Helvetica,sans-serif; font-size:22px; line-height:28px; color:#09090b; font-weight:bold;">
                Hola ${n}:
              </h1>
              <p style="margin:0 0 16px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#27272a;">
                Hemos detectado que el 25 de septiembre se produjeron varios errores t&eacute;cnicos cuando intentaste acceder a tu panel de PipingBox.
              </p>
              <p style="margin:0 0 16px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#27272a;">
                Lamentamos las molestias. Tu cuenta se cre&oacute; correctamente y la informaci&oacute;n que ya hab&iacute;as introducido contin&uacute;a guardada.
              </p>
              <p style="margin:0 0 24px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#27272a;">
                Hemos corregido el problema detectado. Cuando puedas, vuelve a iniciar sesi&oacute;n y revisa tu perfil para completar los datos que falten, especialmente tu experiencia laboral, cualificaciones, certificados y disponibilidad. Esta informaci&oacute;n nos permitir&aacute; identificar mejor las oportunidades profesionales que encajen contigo.
              </p>
            </td>
          </tr>

          <!-- Botón principal -->
          <tr>
            <td align="center" style="background-color:#ffffff; padding:0 28px 32px 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" bgcolor="#f59e0b" style="border-radius:6px;">
                    <a href="https://pipingbox.com/profile"
                       style="display:inline-block; padding:14px 32px; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:20px; font-weight:bold; letter-spacing:0.5px; color:#000000; text-decoration:none; border-radius:6px;">
                      VOLVER A MI PERFIL
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:20px 0 0 0; font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:18px; color:#71717a;">
                Si el bot&oacute;n no funciona, copia este enlace en tu navegador:<br />
                <a href="https://pipingbox.com/profile" style="color:#b45309; text-decoration:underline; word-break:break-all;">https://pipingbox.com/profile</a>
              </p>
            </td>
          </tr>

          <!-- Cierre -->
          <tr>
            <td style="background-color:#ffffff; padding:0 28px 32px 28px;">
              <p style="margin:0 0 16px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#27272a;">
                Si vuelve a aparecer alg&uacute;n error, responde directamente a este correo envi&aacute;ndonos una captura de pantalla o el c&oacute;digo de incidencia que aparezca. Lo revisaremos personalmente.
              </p>
              <p style="margin:0 0 16px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#27272a;">
                Gracias por ayudarnos a mejorar PipingBox.
              </p>
              <p style="margin:0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:#27272a;">
                Un saludo,
              </p>
            </td>
          </tr>

          <!-- Pie -->
          <tr>
            <td style="background-color:#000000; padding:24px 28px;">
              <p style="margin:0 0 8px 0; font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:20px; color:#ffffff; font-weight:bold;">
                Equipo PipingBox
              </p>
              <p style="margin:0 0 8px 0; font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:18px; color:#a1a1aa;">
                <a href="mailto:support@pipingbox.com" style="color:#f59e0b; text-decoration:none;">support@pipingbox.com</a><br />
                <a href="https://pipingbox.com" style="color:#f59e0b; text-decoration:none;">https://pipingbox.com</a>
              </p>
              <p style="margin:0; font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; color:#52525b;">
                Has recibido este correo porque tienes una cuenta en PipingBox.
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
export function renderRecoveryEmailText(name: string): string {
  return `Hola ${name}:

Hemos detectado que el 25 de septiembre se produjeron varios errores técnicos cuando intentaste acceder a tu panel de PipingBox.

Lamentamos las molestias. Tu cuenta se creó correctamente y la información que ya habías introducido continúa guardada.

Hemos corregido el problema detectado. Cuando puedas, vuelve a iniciar sesión y revisa tu perfil para completar los datos que falten, especialmente tu experiencia laboral, cualificaciones, certificados y disponibilidad. Esta información nos permitirá identificar mejor las oportunidades profesionales que encajen contigo.

VOLVER A MI PERFIL:
https://pipingbox.com/profile

Si vuelve a aparecer algún error, responde directamente a este correo enviándonos una captura de pantalla o el código de incidencia que aparezca. Lo revisaremos personalmente.

Gracias por ayudarnos a mejorar PipingBox.

Un saludo,

Equipo PipingBox
support@pipingbox.com
https://pipingbox.com
`;
}
