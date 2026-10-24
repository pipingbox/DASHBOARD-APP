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
  // PB-JOBS-MARKETPLACE-READY-ACTIVATION-001
  renderApplicationPendingProfileEmail,
  renderMarketplaceReadyEmail,
  PENDING_PROFILE_ITEM_KEYS,
  // PB-WELCOME-EMAIL-001
  renderWelcomeEmail,
  WELCOME_ROUTES,
  type WelcomeRenderInput,
  type WelcomeVariant,
  type ActionRenderInput,
  type NoticeRenderInput,
  type ApplicationPendingProfileRenderInput,
  type MarketplaceReadyRenderInput,
  type RenderedEmail,
  type Vars,
} from "./render.ts";
