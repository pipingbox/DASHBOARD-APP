// PB-I18N-EMAIL-001 — Genera previsualizaciones HTML/TXT de las plantillas en
// los 11 idiomas (sin enviar nada). Uso:
//   deno run --allow-read --allow-write scripts/email-previews.ts <dir-salida>
import { SUPPORTED_EMAIL_LANGUAGES, renderActionEmail, renderNoticeEmail } from "../supabase/functions/_shared/email-i18n/mod.ts";

const out = Deno.args[0] ?? "./email-previews";
await Deno.mkdir(out, { recursive: true });
const url = "https://auth.pipingbox.com/auth/v1/verify?token=EXAMPLE_TOKEN_HASH&type=signup&redirect_to=https%3A%2F%2Fpipingbox.com%2Fauth%2Fcallback";
const rows: string[] = [];
for (const lang of SUPPORTED_EMAIL_LANGUAGES) {
  const c = renderActionEmail({ template: "confirmation", lang, actionUrl: url, vars: { email: "worker@example.com" } });
  const r = renderActionEmail({ template: "recovery", lang, actionUrl: url.replace("signup", "recovery"), vars: { email: "worker@example.com" } });
  const j = renderActionEmail({ template: "job_match", lang, actionUrl: "https://pipingbox.com/jobs/123", vars: { score: 87, jobTitle: "TIG Welder 6G", company: "ACME Industrial" }, showExpiry: false });
  const n = renderNoticeEmail({ template: "password_changed_notification", lang, vars: { email: "worker@example.com" } });
  await Deno.writeTextFile(`${out}/confirmation.${lang}.html`, c.html);
  await Deno.writeTextFile(`${out}/recovery.${lang}.html`, r.html);
  await Deno.writeTextFile(`${out}/job_match.${lang}.html`, j.html);
  await Deno.writeTextFile(`${out}/password_changed.${lang}.html`, n.html);
  await Deno.writeTextFile(`${out}/confirmation.${lang}.txt`, c.text);
  rows.push(`| ${lang} | ${c.subject} | ${r.subject} | ${j.subject} | ${n.subject} |`);
}
await Deno.writeTextFile(
  `${out}/ASUNTOS.md`,
  `# PB-I18N-EMAIL-001 — Asuntos por idioma (generado por scripts/email-previews.ts)\n\n| Idioma | Confirmación | Recuperación | Oferta compatible | Contraseña cambiada |\n|---|---|---|---|---|\n${rows.join("\n")}\n`,
);
console.log(`previews: ${rows.length} idiomas en ${out}`);
