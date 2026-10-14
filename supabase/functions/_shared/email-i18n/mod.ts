// _shared/email-i18n/mod.ts — punto de entrada del módulo PB-I18N-EMAIL-001.
export * from "./languages.ts";
export * from "./types.ts";
export { LOCALES, getLocale } from "./locales.ts";
export {
  BRAND,
  escapeHtml,
  safeUrl,
  renderActionEmail,
  renderNoticeEmail,
  type ActionRenderInput,
  type NoticeRenderInput,
  type RenderedEmail,
  type Vars,
} from "./render.ts";
