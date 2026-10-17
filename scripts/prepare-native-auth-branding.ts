import { renderEmailHeader } from "../supabase/functions/_shared/email-header.ts";

export const NATIVE_AUTH_HEADER = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${renderEmailHeader()}</table>`;

export function prepareNativeAuthTemplates(snapshot: Record<string, unknown>): Record<string, string> {
  const templates = Object.entries(snapshot).filter(([key]) => /^mailer_templates_[a-z_]+_content$/.test(key));
  if (templates.length === 0) throw new Error("auth_snapshot_missing_templates");
  const prepared: Record<string, string> = {};
  for (const [key, content] of templates) {
    if (typeof content !== "string" || !content.trim()) throw new Error(`auth_template_empty:${key}`);
    if (/<img\b/i.test(content)) throw new Error(`auth_template_existing_image_review_required:${key}`);
    prepared[key] = /<body\b[^>]*>/i.test(content)
      ? content.replace(/<body\b[^>]*>/i, (body) => `${body}${NATIVE_AUTH_HEADER}`)
      : `${NATIVE_AUTH_HEADER}${content}`;
  }
  return prepared;
}

if (import.meta.main) {
  const path = Deno.args[0];
  if (!path) throw new Error("auth_snapshot_path_required");
  const snapshot = JSON.parse(await Deno.readTextFile(path)) as Record<string, unknown>;
  console.log(JSON.stringify(prepareNativeAuthTemplates(snapshot), null, 2));
}
