// TD-13 (CODE_STANDARDS §13 #4): No console.log in production.
// This logger is silenced in production builds and active in development.
// Use `logger.debug/info/warn/error` instead of `console.*` everywhere.
//
// Rationale:
// - console.log can leak PII (DEC-35) and bloat the bundle.
// - In production, all log methods are no-ops (tree-shaken by Vite).
// - In development, logs flow through to console with a [PipingBox] prefix.
//
// Usage:
//   import { logger } from '@/lib/logger';
//   logger.debug('Fetching jobs', { count: 10 });   // dev only
//   logger.error('Failed to fetch jobs', error);     // always (but no-op in prod)

type LogArgs = unknown[];

const isDev = import.meta.env.DEV;

function format(args: LogArgs): LogArgs {
  // Keep the [PipingBox] prefix only in dev to avoid noise.
  if (args.length === 0) return ['[PipingBox]'];
  if (typeof args[0] === 'string') {
    return [`[PipingBox] ${args[0]}`, ...args.slice(1)];
  }
  return ['[PipingBox]', ...args];
}

export const logger = {
  debug: (...args: LogArgs) => {
    if (isDev) console.debug(...format(args));
  },
  info: (...args: LogArgs) => {
    if (isDev) console.info(...format(args));
  },
  log: (...args: LogArgs) => {
    if (isDev) console.log(...format(args));
  },
  warn: (...args: LogArgs) => {
    // Warnings are kept in prod for now (useful for degraded UX), but
    // could be silenced by gating with `isDev` if they become noisy.
    console.warn(...format(args));
  },
  error: (...args: LogArgs) => {
    // Errors are always logged: they are critical for diagnosing issues.
    // PII must never be passed here (DEC-35).
    console.error(...format(args));
  },
};

export default logger;
