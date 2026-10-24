// PB-WELCOME-EMAIL-001 — Genera previsualizaciones HTML/TXT del correo de
// bienvenida en las dos variantes (profesional / empresa) y los 11 idiomas.
// No envía nada, no toca la base de datos y no necesita red. Uso:
//   deno run --node-modules-dir=none --allow-read --allow-write \
//     scripts/welcome-email-previews.ts <dir-salida>
import { EMAIL_LOGO_URL } from "../supabase/functions/_shared/email-header.ts";
import {
  renderWelcomeEmail,
  SUPPORTED_EMAIL_LANGUAGES,
  WELCOME_ROUTES,
} from "../supabase/functions/_shared/email-i18n/mod.ts";
import type { WelcomeVariant } from "../supabase/functions/_shared/email-i18n/mod.ts";

const out = Deno.args[0] ?? "./welcome-previews";
const appBaseUrl = Deno.args[1] ?? "https://pipingbox.com";
await Deno.mkdir(out, { recursive: true });
const logo = new URL("../app/frontend/public/assets/logos/logo-horizontal-email.png", import.meta.url);
await Deno.copyFile(logo, `${out}/logo-horizontal-email.png`);

const VARIANTS: WelcomeVariant[] = ["worker", "company"];
const LABEL: Record<WelcomeVariant, string> = {
  worker: "Profesional",
  company: "Empresa",
};

const rows: string[] = [];
const cards: string[] = [];

for (const lang of SUPPORTED_EMAIL_LANGUAGES) {
  const subjects: string[] = [];
  for (const variant of VARIANTS) {
    const r = renderWelcomeEmail({ variant, lang, appBaseUrl });
    const base = `welcome_${variant}.${lang}`;
    await Deno.writeTextFile(`${out}/${base}.html`, r.html.replaceAll(EMAIL_LOGO_URL, "./logo-horizontal-email.png"));
    await Deno.writeTextFile(`${out}/${base}.txt`, r.text);
    subjects.push(r.subject);
    cards.push(
      `<li><code>${lang}</code> · <strong>${LABEL[variant]}</strong> — ` +
        `<a href="./${base}.html">HTML</a> · <a href="./${base}.txt">texto</a>` +
        `<br><span class="s">${r.subject}</span></li>`,
    );
  }
  rows.push(`| ${lang} | ${subjects[0]} | ${subjects[1]} |`);
}

await Deno.writeTextFile(
  `${out}/ASUNTOS.md`,
  "# PB-WELCOME-EMAIL-001 — Asuntos por idioma " +
    "(generado por scripts/welcome-email-previews.ts)\n\n" +
    "| Idioma | Profesional | Empresa |\n|---|---|---|\n" +
    `${rows.join("\n")}\n`,
);

await Deno.writeTextFile(
  `${out}/index.html`,
  `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PB-WELCOME-EMAIL-001 — previews</title>
<style>
 body{font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
      margin:0;padding:32px;background:#111;color:#f5f5f5}
 h1{font-size:20px;margin:0 0 4px} h2{font-size:15px;margin:28px 0 8px;color:#E8611A}
 p.m{color:#9b9b9b;margin:0 0 8px}
 ul{list-style:none;padding:0;margin:0;display:grid;gap:10px;
    grid-template-columns:repeat(auto-fill,minmax(320px,1fr))}
 li{background:#1b1b1b;border:1px solid #2a2a2a;border-radius:8px;padding:12px 14px}
 a{color:#E8611A} code{color:#fff;background:#000;padding:1px 6px;border-radius:4px}
 .s{color:#9b9b9b;font-size:13px}
</style></head><body>
<h1>PIPINGBOX · correo de bienvenida — previews</h1>
<p class="m">PB-WELCOME-EMAIL-001 · 2 variantes × ${SUPPORTED_EMAIL_LANGUAGES.length} idiomas
 · base pública <code>${appBaseUrl}</code> · sin envíos reales.</p>
<p class="m">El HTML de preview usa el PNG optimizado local; los correos enviados usarán ${EMAIL_LOGO_URL} una vez publicado.</p>
<p class="m">Rutas enlazadas — profesional: <code>${
    Object.values(WELCOME_ROUTES.worker).join("</code> <code>")
  }</code><br>empresa: <code>${
    Object.values(WELCOME_ROUTES.company).join("</code> <code>")
  }</code></p>
<h2>Previsualizaciones</h2>
<ul>${cards.join("")}</ul>
</body></html>`,
);

console.log(
  `previews: ${SUPPORTED_EMAIL_LANGUAGES.length} idiomas × ${VARIANTS.length} variantes en ${out}`,
);
