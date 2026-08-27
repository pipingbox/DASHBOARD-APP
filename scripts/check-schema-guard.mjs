#!/usr/bin/env node
/**
 * Static guard — PB-ADMIN-ONBOARDING-SCHEMA-001.
 *
 * Fails the build if a non-existent database column is written from the frontend.
 *
 * Why this exists: `onboarding_completed` was written into the same UPDATE as
 * `onboarding_status` and `marketplace_ready`. PostgREST rejects the whole statement when any
 * column is unknown, so both canonical fields were silently dropped and job matching returned 0
 * for every worker. Nothing failed loudly — not the build, not the UI, not CI.
 *
 * This guard is deliberately dumb and fast: a grep with an allowlist. It runs without network,
 * credentials or a database, so it can never be skipped for lack of configuration — which is
 * exactly how the original defect survived.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', 'app', 'frontend', 'src');

/** Columns that do not exist in the database and must never be written again. */
const FORBIDDEN = [
  {
    name: 'onboarding_completed',
    reason: 'does not exist; use onboarding_status (see src/lib/onboarding.ts)',
  },
  // ---------------------------------------------------------------------------
  // PB-MARKET-SCHEMA-001 — course marketplace (sql/004-marketplace-schema.sql).
  //
  // Two distinct hazards are covered here.
  //
  // (a) SEMANTIC COLLISION. The course marketplace and the JOB marketplace use
  //     confusingly similar words. `marketplace_ready` and the ONBOARDING_STATUS
  //     ladder belong to the WORKER pipeline on app_14da0f1941_profiles. Names
  //     like instructor_marketplace_ready or instructor_onboarding_status read
  //     as if they existed, but they do not: the instructor pipeline column is
  //     `instructor_status` on app_marketplace_instructors.
  //
  // (b) GENERATED COLUMNS. dac7_data_complete is GENERATED ALWAYS ... STORED.
  //     Postgres refuses any write to it, so including it in an insert/update
  //     payload makes PostgREST reject the WHOLE statement — the exact
  //     PB-ADMIN-ONBOARDING-SCHEMA-001 failure mode, silent and total.
  {
    name: 'instructor_marketplace_ready',
    reason:
      'does not exist; the instructor pipeline column is instructor_status on ' +
      'app_marketplace_instructors. marketplace_ready is the WORKER/job marketplace flag ' +
      'on app_14da0f1941_profiles and is a different concept entirely.',
  },
  {
    name: 'instructor_onboarding_status',
    reason:
      'does not exist; use instructor_status on app_marketplace_instructors. ' +
      'ONBOARDING_STATUS belongs to the worker pipeline (see src/lib/onboarding.ts).',
  },
  {
    name: 'revenue_share_percentage',
    reason:
      'does not exist and must not be created; the schema stores revenue_share_tier ' +
      '(STANDARD | FOUNDING | STRATEGIC). Percentages are channel-dependent and live in ' +
      'application config, never in the database.',
  },
  {
    name: 'revenue_share_percent',
    reason:
      'does not exist; use revenue_share_tier. See sql/004-marketplace-schema.sql section 2.',
  },
  {
    name: 'dac7_data_complete',
    reason:
      'is GENERATED ALWAYS AS ... STORED and cannot be written. Including it in an ' +
      'insert/update payload makes PostgREST reject the entire statement. Read it, never write it.',
  },
  {
    name: 'course_rating',
    reason:
      'does not exist; app_marketplace_course_reviews is the INTERNAL technical/pedagogical ' +
      'QA queue, not student ratings. A learner-facing rating feature needs its own table.',
  },
  {
    name: 'application_fee_amount',
    reason:
      'Stripe Connect is blocked by PB-MARKET-TAX-001. No destination charges, no ' +
      'application fees, no payout engine until that ticket closes.',
  },
  {
    name: 'net_course_revenue',
    reason:
      'Net Course Revenue calculation is blocked by PB-MARKET-TAX-001. Do not introduce ' +
      'a column or a client-side computation for it.',
  },
];

/**
 * Tables that exist in the database, and the exact column set each one has.
 *
 * Mechanism: for every `TABLES.<key>` referenced in the frontend, any string
 * literal appearing in a `.select(...)`, `.eq(...)`, `.insert(...)` or
 * `.update(...)` chain is impossible to attribute statically with a grep. So
 * this map is NOT used to validate call sites — it is the canonical, reviewable
 * record of what sql/004-marketplace-schema.sql creates, kept next to the
 * FORBIDDEN list so that the two cannot drift.
 *
 * MAINTENANCE RULE: adding a column to sql/004-marketplace-schema.sql without
 * adding it here is a review defect. The consistency check below fails the
 * build if a table listed here is missing from src/lib/supabase.ts TABLES.
 */
const MARKETPLACE_SCHEMA = {
  app_marketplace_instructors: [
    'id',
    'user_id',
    'instructor_status',
    'display_name',
    'bio',
    'headline',
    'is_founding_instructor',
    'revenue_share_tier',
    'tax_country',
    'tax_identification_number',
    'tin_issuing_state',
    'vat_number',
    'iban',
    'legal_name',
    'legal_address',
    'identity_document_status',
    'dac7_reportable',
    'dac7_data_complete', // GENERATED — read-only
    'applied_at',
    'approved_at',
    'suspended_at',
    'created_at',
    'updated_at',
  ],
  app_marketplace_course_reviews: [
    'id',
    'course_id',
    'reviewer_id',
    'review_status',
    'technical_checklist',
    'pedagogical_checklist',
    'plagiarism_check_status',
    'plagiarism_notes',
    'reviewer_notes',
    'instructor_response',
    'submitted_at',
    'reviewed_at',
    'created_at',
    'updated_at',
  ],
  app_marketplace_dsa_notices: [
    'id',
    'notice_reference',
    'content_type',
    'content_id',
    'content_url',
    'reporter_name',
    'reporter_email',
    'reporter_is_trusted_flagger',
    'reason_category',
    'reason_detail',
    'good_faith_declaration',
    'status',
    'decision',
    'statement_of_reasons',
    'action_taken',
    'appeal_deadline_at',
    'acknowledged_at',
    'decided_at',
    'created_at',
    'updated_at',
  ],
};

/** Columns added to the pre-existing app_academy_courses by migration 004. */
const ACADEMY_COURSES_ADDED_COLUMNS = [
  'instructor_id',
  'fiscal_nature',
  'taxonomy_category',
  'verification_status',
  'verified_at',
  'verified_by',
  'submitted_for_review_at',
  'revenue_share_channel_default',
];

/** Columns that exist but must never be sent to the browser. */
const SENSITIVE_COLUMNS = [
  'iban',
  'tax_identification_number',
  'tin_issuing_state',
  'legal_address',
  'legal_name',
];

/** Files allowed to mention a forbidden name (documentation of why it is forbidden). */
const ALLOWLIST = new Set(['lib/onboarding.ts', 'lib/marketplace.ts']);

const EXTENSIONS = ['.ts', '.tsx'];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (EXTENSIONS.some((e) => full.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

const violations = [];

for (const file of walk(SRC)) {
  const rel = relative(SRC, file).split('\\').join('/');
  if (ALLOWLIST.has(rel)) continue;

  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const { name, reason } of FORBIDDEN) {
      if (line.includes(name)) {
        violations.push({ file: rel, line: i + 1, name, reason, text: line.trim() });
      }
    }
  });
}

if (violations.length > 0) {
  console.error('\nForbidden database column reference detected:\n');
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.text}`);
    console.error(`    -> "${v.name}" ${v.reason}\n`);
  }
  console.error(
    `${violations.length} violation(s). See PB-ADMIN-ONBOARDING-SCHEMA-001.\n`,
  );
  process.exit(1);
}

// =============================================================================
// PB-MARKET-SCHEMA-001 — consistency checks between the SQL migration, the
// TABLES constant and this guard.
//
// The FORBIDDEN grep above catches columns that must never be written. These
// three checks catch the opposite failure: the migration and the frontend
// drifting apart silently, which is how a non-existent column reference gets
// introduced in the first place.
// =============================================================================

const SQL_MIGRATION = join(__dirname, '..', 'sql', '004-marketplace-schema.sql');
const SUPABASE_LIB = join(SRC, 'lib', 'supabase.ts');

const driftErrors = [];

let sql = '';
try {
  sql = readFileSync(SQL_MIGRATION, 'utf8');
} catch {
  driftErrors.push(
    `sql/004-marketplace-schema.sql is missing. The marketplace tables in this guard ` +
      `have no migration backing them.`,
  );
}

const supabaseLib = readFileSync(SUPABASE_LIB, 'utf8');

if (sql) {
  // 1. Every table this guard knows about must actually be created by the migration.
  for (const table of Object.keys(MARKETPLACE_SCHEMA)) {
    if (!sql.includes(`CREATE TABLE IF NOT EXISTS ${table}`)) {
      driftErrors.push(
        `"${table}" is declared in check-schema-guard.mjs but is not created by ` +
          `sql/004-marketplace-schema.sql.`,
      );
    }
  }

  // 2. Every column this guard knows about must appear in the migration. Catches
  //    the case where a column is renamed in SQL but not here — the exact drift
  //    that produces a write to a non-existent column.
  for (const [table, columns] of Object.entries(MARKETPLACE_SCHEMA)) {
    for (const col of columns) {
      if (!sql.includes(col)) {
        driftErrors.push(
          `column "${col}" of ${table} is declared in check-schema-guard.mjs but does ` +
            `not appear in sql/004-marketplace-schema.sql.`,
        );
      }
    }
  }

  // 3. Every column the migration adds to the pre-existing app_academy_courses
  //    must be an explicit ADD COLUMN IF NOT EXISTS. A plain ADD COLUMN would
  //    make the migration non-idempotent and fail on re-run.
  for (const col of ACADEMY_COURSES_ADDED_COLUMNS) {
    if (!sql.includes(`ADD COLUMN IF NOT EXISTS ${col}`)) {
      driftErrors.push(
        `app_academy_courses.${col} is expected to be added by ` +
          `"ADD COLUMN IF NOT EXISTS ${col}" in sql/004-marketplace-schema.sql, but that ` +
          `statement was not found. Non-idempotent migrations break re-runs.`,
      );
    }
  }
}

// 4. Every marketplace table must be reachable through TABLES, so that call
//    sites never hardcode a table name (hardcoded names bypass every rename).
for (const table of Object.keys(MARKETPLACE_SCHEMA)) {
  if (!supabaseLib.includes(`'${table}'`)) {
    driftErrors.push(
      `"${table}" is not present in the TABLES constant of src/lib/supabase.ts. ` +
        `Add it so call sites do not hardcode the table name.`,
    );
  }
}

if (driftErrors.length > 0) {
  console.error('\nMarketplace schema drift detected:\n');
  for (const e of driftErrors) console.error(`  - ${e}`);
  console.error(`\n${driftErrors.length} problem(s). See PB-MARKET-SCHEMA-001.\n`);
  process.exit(1);
}

// =============================================================================
// Advisory — sensitive columns leaving the database.
//
// iban, tax_identification_number, tin_issuing_state, legal_name and
// legal_address are protected at the RLS level (only the owning instructor and
// admins can read the row at all). This is a second, cheap tripwire: if one of
// those names shows up in frontend code, it is worth a human look, because the
// public instructor surface should be going through
// app_marketplace_instructors_public, which does not expose them.
//
// Warning, not a failure: the instructor's own fiscal-data form legitimately
// needs to reference these columns.
// =============================================================================

const sensitiveHits = [];
for (const file of walk(SRC)) {
  const rel = relative(SRC, file).split('\\').join('/');
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const col of SENSITIVE_COLUMNS) {
      if (new RegExp(`\\b${col}\\b`).test(line)) {
        sensitiveHits.push({ file: rel, line: i + 1, col, text: line.trim() });
      }
    }
  });
}

if (sensitiveHits.length > 0) {
  console.warn('\nAdvisory: sensitive instructor column referenced in frontend code.');
  console.warn('Confirm RLS still restricts the row to its owner, and that no');
  console.warn('third-party surface reads it (use app_marketplace_instructors_public).\n');
  for (const h of sensitiveHits) {
    console.warn(`  ${h.file}:${h.line}  [${h.col}]  ${h.text}`);
  }
  console.warn('');
}

console.log('Schema guard OK: no forbidden column references.');
console.log(
  `Marketplace schema OK: ${Object.keys(MARKETPLACE_SCHEMA).length} tables, ` +
    `${Object.values(MARKETPLACE_SCHEMA).reduce((n, c) => n + c.length, 0)} columns, ` +
    `${ACADEMY_COURSES_ADDED_COLUMNS.length} app_academy_courses additions verified ` +
    `against sql/004-marketplace-schema.sql.`,
);
