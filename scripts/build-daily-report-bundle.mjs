// scripts/build-daily-report-bundle.mjs
// PB-PDI-004 — genera el bundle single-file para desplegar la Edge Function
// daily-intelligence-report vía Supabase Management API (create/update solo
// admite un body de un único fichero; los módulos _shared se inlinean aquí de
// forma determinista). Los imports por URL (esm.sh/npm:) quedan externos tal
// cual: los resuelve el runtime de Edge Functions en el despliegue.
//
// Uso: node scripts/build-daily-report-bundle.mjs [outfile]
//      (default: /tmp/daily-intelligence-report.bundle.ts)
import { build } from "esbuild";

const outfile = process.argv[2] || "/tmp/daily-intelligence-report.bundle.ts";

await build({
  entryPoints: ["supabase/functions/daily-intelligence-report/index.ts"],
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  outfile,
  external: ["https://*", "npm:*"],
  legalComments: "none",
  logLevel: "info",
});

console.log(`bundle -> ${outfile}`);
