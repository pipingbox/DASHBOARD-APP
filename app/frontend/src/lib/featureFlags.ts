/**
 * PB-MATCHING-NOTIFICATIONS-001 — Feature flags.
 *
 * Central source of truth for flags that gate matching, notifications and
 * multichannel delivery. Flags are compile-time constants until the backend
 * capabilities they depend on are deployed and verified.
 */

/** Matching engine + notification queue. False until Edge Functions are deployed. */
export const MATCHING_NOTIFICATIONS_ENABLED = false;

/** WhatsApp Business Platform integration. False until provider is contracted. */
export const WHATSAPP_BUSINESS_ENABLED = false;
