import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { NATIVE_AUTH_HEADER, prepareNativeAuthTemplates } from "./prepare-native-auth-branding.ts";

function prepared(content: string): string {
  return prepareNativeAuthTemplates({ mailer_templates_confirmation_content: content }).mailer_templates_confirmation_content;
}

Deno.test("plantillas Auth nativas conservan Go-template y excluyen secretos", () => {
  const original = `<html><body class="mail"><a href="{{ .ConfirmationURL }}">{{ if .Data.company }}{{ .Token }}{{ end }}</a></body></html>`;
  const result = prepareNativeAuthTemplates({
    mailer_templates_confirmation_content: original,
    mailer_templates_recovery_content: "<p>{{ .Token }}</p>",
    smtp_password: "not-exported",
  });
  assertEquals(Object.keys(result).length, 2);
  for (const html of Object.values(result)) {
    assertEquals((html.match(/<img\b/g) ?? []).length, 1);
    assertEquals(html.includes("logo-horizontal-email.png"), true);
    assertEquals(html.includes("not-exported"), false);
  }
  assertEquals(result.mailer_templates_confirmation_content, original.replace('<body class="mail">', `<body class="mail">${NATIVE_AUTH_HEADER}`));
  assertEquals(result.mailer_templates_recovery_content, `${NATIVE_AUTH_HEADER}<p>{{ .Token }}</p>`);
  assertEquals(result.mailer_templates_confirmation_content.match(/{{.*?}}/gs), original.match(/{{.*?}}/gs));
});

Deno.test("un body falso en comentario HTML no determina la inserción", () => {
  const original = '<!-- <body> -->\n<html><body><p>{{ .ConfirmationURL }}</p></body></html>';
  assertEquals(prepared(original), original.replace("<body><p>", `<body>${NATIVE_AUTH_HEADER}<p>`));
});

Deno.test("un body dentro de literal Go no determina la inserción", () => {
  const original = '{{ printf "<body>" }}<html><body><p>{{ .Token }}</p></body></html>';
  const result = prepared(original);
  assertEquals(result, original.replace("<body><p>", `<body>${NATIVE_AUTH_HEADER}<p>`));
  assertEquals(result.match(/{{.*?}}/gs), original.match(/{{.*?}}/gs));
});

Deno.test("plantilla fragmentaria sin body recibe cabecera al principio", () => {
  assertEquals(prepared("<p>Confirmar {{ .ConfirmationURL }}</p>"), `${NATIVE_AUTH_HEADER}<p>Confirmar {{ .ConfirmationURL }}</p>`);
});

Deno.test("markup ambiguo aborta para revisión manual", () => {
  for (const content of [
    "<html><p>Sin body</p></html>",
    "<html><body>uno</body><body>dos</body></html>",
    '<html><body data-dynamic="{{ .Token }}">texto</body></html>',
    "<!-- <body> sin cierre",
    '{{ printf "<body>" ',
  ]) assertThrows(() => prepared(content));
});

Deno.test("plantilla nativa con imagen preexistente exige revisión manual", () => {
  assertThrows(() => prepared('<img src="legacy.png">'));
});
