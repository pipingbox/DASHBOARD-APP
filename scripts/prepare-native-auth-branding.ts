import { renderEmailHeader } from "../supabase/functions/_shared/email-header.ts";

export const NATIVE_AUTH_HEADER = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${renderEmailHeader()}</table>`;

function maskTemplateRegions(content: string): string {
  const masked = content.split("");
  for (let index = 0; index < content.length;) {
    if (content.startsWith("<!--", index)) {
      const end = content.indexOf("-->", index + 4);
      if (end < 0) throw new Error("auth_template_unclosed_comment");
      for (let position = index; position < end + 3; position++) masked[position] = " ";
      index = end + 3;
    } else if (content.startsWith("{{", index)) {
      let position = index + 2;
      let quote = "";
      for (; position < content.length; position++) {
        const char = content[position];
        if (quote) {
          if (char === "\\" && quote !== "`") position++;
          else if (char === quote) quote = "";
        } else if (char === '"' || char === "'" || char === "`") {
          quote = char;
        } else if (content.startsWith("}}", position)) {
          break;
        }
      }
      if (position >= content.length) throw new Error("auth_template_unclosed_action");
      for (let cursor = index; cursor < position + 2; cursor++) masked[cursor] = " ";
      index = position + 2;
    } else {
      index++;
    }
  }
  return masked.join("");
}

function insertionPoint(content: string): number {
  const masked = maskTemplateRegions(content);
  let bodyEnd: number | undefined;
  let hasHtmlWrapper = false;
  for (let index = 0; index < masked.length;) {
    if (masked[index] !== "<") {
      index++;
      continue;
    }
    let position = index + 1;
    let quote = "";
    for (; position < masked.length; position++) {
      const char = masked[position];
      if (quote) {
        if (char === quote) quote = "";
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === ">") {
        break;
      }
    }
    if (position >= masked.length) throw new Error("auth_template_ambiguous_markup");
    const tag = masked.slice(index, position + 1);
    const match = /^<\s*(\/?)\s*([a-z][\w:-]*)\b/i.exec(tag);
    if (match && !match[1]) {
      const name = match[2].toLowerCase();
      if (name === "html" || name === "head" || name === "script" || name === "style") hasHtmlWrapper = true;
      if (name === "body") {
        if (bodyEnd !== undefined || content.slice(index, position + 1).includes("{{")) {
          throw new Error("auth_template_ambiguous_body");
        }
        bodyEnd = position + 1;
      }
    }
    index = position + 1;
  }
  if (bodyEnd !== undefined) return bodyEnd;
  if (hasHtmlWrapper || /<!doctype\s+html/i.test(masked)) throw new Error("auth_template_missing_body");
  return 0;
}

export function prepareNativeAuthTemplates(snapshot: Record<string, unknown>): Record<string, string> {
  const templates = Object.entries(snapshot).filter(([key]) => /^mailer_templates_[a-z_]+_content$/.test(key));
  if (templates.length === 0) throw new Error("auth_snapshot_missing_templates");
  const prepared: Record<string, string> = {};
  for (const [key, content] of templates) {
    if (typeof content !== "string" || !content.trim()) throw new Error(`auth_template_empty:${key}`);
    if (/<img\b/i.test(content)) throw new Error(`auth_template_existing_image_review_required:${key}`);
    const position = insertionPoint(content);
    prepared[key] = `${content.slice(0, position)}${NATIVE_AUTH_HEADER}${content.slice(position)}`;
  }
  return prepared;
}

if (import.meta.main) {
  const path = Deno.args[0];
  if (!path) throw new Error("auth_snapshot_path_required");
  const snapshot = JSON.parse(await Deno.readTextFile(path)) as Record<string, unknown>;
  console.log(JSON.stringify(prepareNativeAuthTemplates(snapshot), null, 2));
}
