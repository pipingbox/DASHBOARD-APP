// PB-WELCOME-EMAIL-001 — pruebas de contrato del correo de bienvenida.
//
// Cubre: las dos variantes (profesional / empresa), los 11 idiomas, los enlaces
// internos reales, las prohibiciones de producto (WhatsApp, certificados,
// cambio automático de tipo de cuenta), la seguridad del HTML y la versión en
// texto plano.

import {
  assert,
  assertEquals,
  assertStringIncludes,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { EMAIL_LOGO_URL } from "../email-header.ts";
import { BRAND, renderWelcomeEmail, WELCOME_ROUTES } from "./render.ts";
import type { WelcomeVariant } from "./render.ts";
import { SUPPORTED_EMAIL_LANGUAGES as EMAIL_LANGUAGES } from "./languages.ts";
import { LOCALES } from "./locales.ts";
import { WELCOME_TEMPLATES } from "./types.ts";
import type { WelcomeCompanyStrings } from "./types.ts";

const APP = "https://app.pipingbox.com";
const VARIANTS: WelcomeVariant[] = ["worker", "company"];

// ─────────────────────────────────────────────────────────────────────────────
// Cobertura de idiomas y variantes
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("welcome: las 2 variantes renderizan en los 11 idiomas", () => {
  assertEquals(EMAIL_LANGUAGES.length, 11);
  for (const lang of EMAIL_LANGUAGES) {
    for (const variant of VARIANTS) {
      const r = renderWelcomeEmail({ variant, lang, appBaseUrl: APP });
      assertEquals(r.lang, lang, `idioma devuelto para ${lang}/${variant}`);
      assertEquals(
        r.template,
        variant === "company" ? "welcome_company" : "welcome_worker",
        `plantilla para ${variant}`,
      );
      assert(r.subject.length > 0, `asunto vacío en ${lang}/${variant}`);
      assert(r.html.length > 500, `HTML demasiado corto en ${lang}/${variant}`);
      assert(r.text.length > 300, `texto plano demasiado corto en ${lang}/${variant}`);
      assertEquals(r.missing, [], `placeholders sin resolver en ${lang}/${variant}`);
    }
  }
});

Deno.test("welcome: todos los asuntos llevan el prefijo de marca", () => {
  for (const lang of EMAIL_LANGUAGES) {
    for (const variant of VARIANTS) {
      const { subject } = renderWelcomeEmail({ variant, lang, appBaseUrl: APP });
      assertStringIncludes(subject, "PIPINGBOX");
      assert(subject.startsWith("PIPINGBOX · "), `${lang}/${variant}: "${subject}"`);
    }
  }
});

Deno.test("welcome: el idioma no soportado cae a inglés sin romper", () => {
  for (const variant of VARIANTS) {
    for (const bad of ["zz", "", null, undefined, "klingon"]) {
      const r = renderWelcomeEmail({ variant, lang: bad, appBaseUrl: APP });
      assertEquals(r.lang, "en");
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Enlaces internos REALES y verificados
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("welcome: todos los enlaces apuntan a rutas internas reales del SPA", () => {
  // Rutas declaradas en app/frontend/src/App.tsx.
  const REAL_ROUTES = new Set([
    "/profile",
    "/jobs",
    "/tools",
    "/academy",
    "/community",
    "/company/profile",
    "/company/post-job",
  ]);

  for (const variant of VARIANTS) {
    for (const route of Object.values(WELCOME_ROUTES[variant])) {
      assert(REAL_ROUTES.has(route), `ruta inexistente en ${variant}: ${route}`);
    }
  }

  for (const lang of EMAIL_LANGUAGES) {
    for (const variant of VARIANTS) {
      const { html } = renderWelcomeEmail({ variant, lang, appBaseUrl: APP });
      const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
      assert(hrefs.length > 0, `sin enlaces en ${lang}/${variant}`);

      for (const href of hrefs) {
        const ok = href.startsWith(`${APP}/`) ||
          href === BRAND.site ||
          href === `mailto:${BRAND.support}`;
        assert(ok, `enlace no permitido en ${lang}/${variant}: ${href}`);
      }

      // El CTA principal debe llevar a completar el perfil de esa variante.
      assertStringIncludes(html, `${APP}${WELCOME_ROUTES[variant].profile}`);
      // Y deben estar los 5 accesos directos.
      for (const route of Object.values(WELCOME_ROUTES[variant])) {
        assertStringIncludes(html, `${APP}${route}`);
      }
    }
  }
});

Deno.test("welcome: la variante empresa no enlaza rutas de profesional", () => {
  for (const lang of EMAIL_LANGUAGES) {
    const { html } = renderWelcomeEmail({ variant: "company", lang, appBaseUrl: APP });
    assert(!html.includes(`href="${APP}/profile"`), `${lang}: empresa enlaza /profile`);
    assert(!html.includes(`href="${APP}/jobs"`), `${lang}: empresa enlaza /jobs`);
    assertStringIncludes(html, `${APP}/company/profile`);
    assertStringIncludes(html, `${APP}/company/post-job`);
  }
});

Deno.test("welcome: la base pública se respeta y no se fuerza un dominio fijo", () => {
  const r = renderWelcomeEmail({
    variant: "worker",
    lang: "es",
    appBaseUrl: "https://staging.pipingbox.com/",
  });
  assertStringIncludes(r.html, "https://staging.pipingbox.com/profile");
  assert(!r.html.includes("https://app.pipingbox.com"));
});

// ─────────────────────────────────────────────────────────────────────────────
// Prohibiciones de producto (ticket §2 y §4)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("welcome: no se activa ni se promete consentimiento de WhatsApp", () => {
  // El contenido puede MENCIONAR WhatsApp como canal en preparación, pero no
  // puede contener ningún enlace de activación ni de consentimiento.
  const FORBIDDEN_LINK = /href="[^"]*(whatsapp|wa\.me|consent|opt-?in)[^"]*"/i;
  for (const lang of EMAIL_LANGUAGES) {
    for (const variant of VARIANTS) {
      const { html } = renderWelcomeEmail({ variant, lang, appBaseUrl: APP });
      assert(!FORBIDDEN_LINK.test(html), `${lang}/${variant}: enlace de activación WhatsApp`);
    }
  }
});

Deno.test("welcome: ninguna cadena promete certificados oficiales", () => {
  // Se inspeccionan las cadenas de origen de los 11 idiomas, no el HTML.
  const FORBIDDEN = [
    /certificado oficial/i,
    /official certificate/i,
    /officieel certificaat/i,
    /certificat officiel/i,
    /offizielles zertifikat/i,
    /certificato ufficiale/i,
    /certificado oficial/i,
    /certificat oficial/i,
    /oficjalny certyfikat/i,
  ];
  for (const [code, locale] of Object.entries(LOCALES)) {
    for (const tpl of WELCOME_TEMPLATES) {
      const blob = JSON.stringify(locale.templates[tpl]);
      for (const re of FORBIDDEN) {
        assert(!re.test(blob), `${code}/${tpl} promete certificado oficial (${re})`);
      }
    }
  }
});

Deno.test("welcome: no ofrece cambio automático de tipo de cuenta, sólo revisión por soporte", () => {
  for (const lang of EMAIL_LANGUAGES) {
    for (const variant of VARIANTS) {
      const { html } = renderWelcomeEmail({ variant, lang, appBaseUrl: APP });
      // El aviso de tipo de cuenta debe resolverse en un mailto a soporte…
      assertStringIncludes(html, `mailto:${BRAND.support}`);
      // …y NO en una ruta de cambio/migración automática.
      assert(
        !/href="[^"]*(switch|change-account|account-type|migrate|convert)[^"]*"/i.test(html),
        `${lang}/${variant}: expone un cambio automático de tipo de cuenta`,
      );
    }
  }
});

Deno.test("welcome: la variante empresa explica las condiciones de acceso restringido", () => {
  for (const [code, locale] of Object.entries(LOCALES)) {
    const company = locale.templates.welcome_company as WelcomeCompanyStrings;
    assert(company.verification, `${code}: falta el bloque de verificación`);
    assert(
      company.verification.heading.trim().length > 0 &&
        company.verification.body.trim().length > 40,
      `${code}: bloque de verificación demasiado pobre`,
    );
  }
  // Y debe aparecer renderizado.
  for (const lang of EMAIL_LANGUAGES) {
    const locale = LOCALES[lang];
    const company = locale.templates.welcome_company as WelcomeCompanyStrings;
    const { html, text } = renderWelcomeEmail({ variant: "company", lang, appBaseUrl: APP });
    const head = company.verification.heading;
    assert(html.includes(head) || text.includes(head), `${lang}: verificación no renderizada`);
  }
});

Deno.test("welcome: la variante profesional NO incluye el bloque de verificación de empresa", () => {
  for (const lang of EMAIL_LANGUAGES) {
    const company = LOCALES[lang].templates.welcome_company as WelcomeCompanyStrings;
    const { html } = renderWelcomeEmail({ variant: "worker", lang, appBaseUrl: APP });
    assert(
      !html.includes(company.verification.heading),
      `${lang}: el profesional incluye el bloque de empresa`,
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Contenido obligatorio y marca
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("welcome: incluye marca, naranja corporativo, soporte y sitio", () => {
  for (const lang of EMAIL_LANGUAGES) {
    for (const variant of VARIANTS) {
      const { html, text } = renderWelcomeEmail({ variant, lang, appBaseUrl: APP });
      assertStringIncludes(html, "PIPING");
      assertStringIncludes(html, BRAND.orange);
      assertStringIncludes(html, `mailto:${BRAND.support}`);
      assertStringIncludes(html, BRAND.site);
      assertStringIncludes(text, BRAND.support);
      assertStringIncludes(text, BRAND.site);
    }
  }
});

Deno.test("welcome: la tipografía declara Inter con fallbacks compatibles", () => {
  const { html } = renderWelcomeEmail({ variant: "worker", lang: "es", appBaseUrl: APP });
  assertStringIncludes(html, "'Inter'");
  assertStringIncludes(html, "Helvetica");
  assertStringIncludes(html, "Arial");
});

Deno.test("welcome: responsive y compatible con modo oscuro", () => {
  for (const variant of VARIANTS) {
    const { html } = renderWelcomeEmail({ variant, lang: "es", appBaseUrl: APP });
    assertStringIncludes(html, 'name="viewport"');
    assertStringIncludes(html, "@media only screen and (max-width:620px)");
    assertStringIncludes(html, "prefers-color-scheme: dark");
    assertStringIncludes(html, 'name="color-scheme" content="light dark"');
    assertStringIncludes(html, 'name="supported-color-schemes"');
  }
});

Deno.test("welcome: estilos oscuros y móviles enlazan clases realmente presentes", () => {
  for (const variant of VARIANTS) {
    const { html } = renderWelcomeEmail({ variant, lang: "es", appBaseUrl: APP });
    assert(/<p class="pb-text"[^>]*>/.test(html), `${variant}: intro sin pb-text`);
    assert(/<p class="pb-muted"[^>]*>/.test(html), `${variant}: fallback sin pb-muted`);
    assert(/<td class="pb-btn"[^>]*>\s*<a /.test(html), `${variant}: CTA sin pb-btn`);
    assertStringIncludes(html, ".pb-text { color:#E4E4E7 !important; }");
    assertStringIncludes(html, ".pb-btn a { display:block !important; text-align:center !important; }");
  }
});

Deno.test("welcome: todas las secciones del contenido aparecen renderizadas", () => {
  for (const lang of EMAIL_LANGUAGES) {
    const t = LOCALES[lang].templates.welcome_worker;
    const { html } = renderWelcomeEmail({ variant: "worker", lang, appBaseUrl: APP });
    for (const key of ["profile", "opportunities", "comms", "tools", "academy", "community", "beta"] as const) {
      assertStringIncludes(html, t[key].heading);
    }
    assertStringIncludes(html, t.heading);
    assertStringIncludes(html, t.intro);
    assertStringIncludes(html, t.button);
    assertStringIncludes(html, t.signature);
  }
});

Deno.test("welcome: numeración industrial de secciones (6 profesional / 7 empresa)", () => {
  const worker = renderWelcomeEmail({ variant: "worker", lang: "es", appBaseUrl: APP });
  const company = renderWelcomeEmail({ variant: "company", lang: "es", appBaseUrl: APP });
  // El badge numerado se emite una vez por sección (beta va en bloque aparte).
  assertStringIncludes(worker.html, ">01<");
  assertStringIncludes(worker.html, ">06<");
  assert(!worker.html.includes(">07<"), "el profesional no debe tener 7 secciones numeradas");
  assertStringIncludes(company.html, ">07<");
});

// ─────────────────────────────────────────────────────────────────────────────
// Seguridad del HTML y texto plano
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("welcome: sólo la imagen oficial, sin scripts, iframes ni tracking", () => {
  for (const lang of EMAIL_LANGUAGES) {
    for (const variant of VARIANTS) {
      const { html } = renderWelcomeEmail({ variant, lang, appBaseUrl: APP });
      const images = [...html.matchAll(/<img\b[^>]*>/gi)].map(([tag]) => tag);
      assertEquals(images.length, 1, `${lang}/${variant}: una única cabecera oficial`);
      assertStringIncludes(images[0], `src="${EMAIL_LOGO_URL}"`);
      assertStringIncludes(images[0], 'alt="PIPINGBOX"');
      assertStringIncludes(images[0], 'max-width:100%');
      assert(!images[0].includes("?"), `${lang}/${variant}: imagen con identificador/tracking`);
      assert(!html.includes("PIPING<span"), `${lang}/${variant}: wordmark reconstruido`);
      assert(!/<script\b/i.test(html), `${lang}/${variant}: contiene <script>`);
      assert(!/<iframe\b/i.test(html), `${lang}/${variant}: contiene <iframe>`);
      // Atributo de evento inline: `on<evento>=` precedido de espacio (no
      // confundir con `content=`, que contiene la subcadena "ontent=").
      assert(!/\son[a-z]+\s*=/i.test(html), `${lang}/${variant}: handler inline`);
      assert(!/url\(\s*https?:/i.test(html), `${lang}/${variant}: recurso remoto en CSS`);
      // Ningún parámetro de tracking en los enlaces.
      assert(
        !/href="[^"]*[?&](utm_|fbclid|gclid|mc_eid|pk_campaign)/i.test(html),
        `${lang}/${variant}: parámetro de tracking`,
      );
    }
  }
});

Deno.test("welcome: el texto plano no contiene etiquetas HTML ni entidades", () => {
  for (const lang of EMAIL_LANGUAGES) {
    for (const variant of VARIANTS) {
      const { text } = renderWelcomeEmail({ variant, lang, appBaseUrl: APP });
      assert(!/<[a-z/][^>]*>/i.test(text), `${lang}/${variant}: etiqueta HTML en el texto`);
      assert(!/&(amp|lt|gt|quot|#39|rarr|nbsp);/.test(text), `${lang}/${variant}: entidad HTML en el texto`);
      assert(!text.includes("{support}"), `${lang}/${variant}: placeholder sin resolver`);
    }
  }
});

Deno.test("welcome: el texto plano incluye las URLs de los CTA", () => {
  for (const variant of VARIANTS) {
    const { text } = renderWelcomeEmail({ variant, lang: "es", appBaseUrl: APP });
    for (const route of Object.values(WELCOME_ROUTES[variant])) {
      assertStringIncludes(text, `${APP}${route}`);
    }
  }
});

Deno.test("welcome: una base pública maliciosa falla en cerrado y nunca se renderiza", () => {
  // Fail-closed: es preferible no emitir correo a emitir uno con un enlace
  // `javascript:` o `data:`. `safeUrl` sólo admite http/https absolutas.
  for (const bad of ["javascript:alert(1)", "data:text/html,<script>", "//evil.test", ""]) {
    assertThrows(
      () => renderWelcomeEmail({ variant: "worker", lang: "es", appBaseUrl: bad }),
      Error,
      "unsafe or invalid URL",
      `no se rechazó la base: ${bad}`,
    );
  }
});

Deno.test("welcome: el HTML está bien formado (etiquetas de bloque balanceadas)", () => {
  for (const variant of VARIANTS) {
    const { html } = renderWelcomeEmail({ variant, lang: "es", appBaseUrl: APP });
    for (const tag of ["table", "tr", "td", "html", "body", "h1", "h2", "p", "a"]) {
      const open = (html.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length;
      const close = (html.match(new RegExp(`</${tag}>`, "g")) ?? []).length;
      assertEquals(open, close, `${variant}: <${tag}> abiertas ${open} vs cerradas ${close}`);
    }
  }
});

Deno.test("welcome: el asunto es de una sola línea y de longitud razonable", () => {
  for (const lang of EMAIL_LANGUAGES) {
    for (const variant of VARIANTS) {
      const { subject } = renderWelcomeEmail({ variant, lang, appBaseUrl: APP });
      assert(!/[\r\n]/.test(subject), `${lang}/${variant}: salto de línea en el asunto`);
      assert(subject.length <= 120, `${lang}/${variant}: asunto de ${subject.length} caracteres`);
    }
  }
});

Deno.test("welcome: el preheader está oculto y no se repite como texto visible", () => {
  const { html } = renderWelcomeEmail({ variant: "worker", lang: "es", appBaseUrl: APP });
  assertStringIncludes(html, "display:none");
  assertStringIncludes(html, "max-height:0");
});
