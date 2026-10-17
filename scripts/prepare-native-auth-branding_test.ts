import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { prepareNativeAuthTemplates } from "./prepare-native-auth-branding.ts";

Deno.test("plantillas Auth nativas conservan Go-template y tienen una cabecera oficial", () => {
  const result = prepareNativeAuthTemplates({
    mailer_templates_confirmation_content: "<html><body><a href=\"{{ .ConfirmationURL }}\">Confirm</a></body></html>",
    mailer_templates_recovery_content: "<p>{{ .Token }}</p>",
    smtp_password: "not-exported",
  });
  assertEquals(Object.keys(result).length, 2);
  for (const html of Object.values(result)) {
    assertEquals((html.match(/<img\b/g) ?? []).length, 1);
    assertEquals(html.includes("logo-horizontal-email.png"), true);
    assertEquals(html.includes("not-exported"), false);
  }
  assertEquals(result.mailer_templates_confirmation_content.includes("{{ .ConfirmationURL }}"), true);
  assertEquals(result.mailer_templates_recovery_content.includes("{{ .Token }}"), true);
});

Deno.test("plantilla nativa con imagen preexistente exige revisión manual", () => {
  assertThrows(() => prepareNativeAuthTemplates({ mailer_templates_confirmation_content: '<img src="legacy.png">' }));
});
