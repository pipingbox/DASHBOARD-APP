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
  // ---------------------------------------------------------------------------
  // PB-MARKET-REVENUE-EVENTS-001 — derived revenue names.
  //
  // app_marketplace_revenue_events (sql/005-revenue-events.sql) is an
  // APPEND-ONLY ledger of OBSERVED FACTS with ZERO derived columns. Every name
  // below is a DERIVATION: a function of other columns whose formula depends on
  // a Net Course Revenue definition that PB-MARKET-TAX-001 has not settled.
  //
  // Does NCR net the Stripe fee? The VAT? A refund? A chargeback fee? A coupon
  // the platform funded? Each answer produces a different number from the SAME
  // facts. Writing any of these into a column, or computing them in the client,
  // silently picks one answer for every historical row — and the choice becomes
  // invisible the day after it is made. Instructor Balance and Payout must be
  // views or computations over the event log, never stored values.
  {
    name: 'instructor_share',
    reason:
      'is a derived value and must not exist. app_marketplace_revenue_events stores only ' +
      'observed facts; any share depends on the Net Course Revenue definition, which is ' +
      'blocked by PB-MARKET-TAX-001.',
  },
  {
    name: 'instructor_earnings',
    reason:
      'is a derived value. Compute it from app_marketplace_revenue_events once the Net ' +
      'Course Revenue definition is settled (PB-MARKET-TAX-001); never store it.',
  },
  {
    name: 'instructor_balance',
    reason:
      'Instructor Balance is a DERIVED concept and is deliberately not a table or a column. ' +
      'A stored balance is a cached derivation that drifts; derive it from the append-only ' +
      'event log instead. Blocked by PB-MARKET-TAX-001.',
  },
  {
    name: 'platform_fee',
    reason:
      'is a derived value and implies a revenue split that has not been defined. ' +
      'Blocked by PB-MARKET-TAX-001.',
  },
  {
    name: 'platform_commission',
    reason:
      'is a derived value and implies a revenue split that has not been defined. ' +
      'Blocked by PB-MARKET-TAX-001.',
  },
  {
    name: 'take_rate',
    reason:
      'is a percentage and a derived value. Percentages are channel-dependent and live in ' +
      'application config, never in the database. Blocked by PB-MARKET-TAX-001.',
  },
  {
    name: 'revenue_split',
    reason:
      'is a derived value. The split is channel-dependent and its definition is blocked by ' +
      'PB-MARKET-TAX-001. app_marketplace_revenue_events records facts, not allocations.',
  },
  {
    name: 'payout_amount',
    reason:
      'Payout is a DERIVED concept and is deliberately not implemented. No payout engine, ' +
      'no Stripe Connect, no self-billing until PB-MARKET-TAX-001 closes.',
  },
];

/**
 * Tables that exist in the database, and the exact column set each one has.
 *
 * Mechanism: for every `TABLES.<key>` referenced in the frontend, any string
 * literal appearing in a `.select(...)`, `.eq(...)`, `.insert(...)` or
 * `.update(...)` chain is impossible to attribute statically with a grep. So
 * this map is NOT used to validate call sites — it is the canonical, reviewable
 * record of what the marketplace migrations create, kept next to the FORBIDDEN
 * list so that the two cannot drift.
 *
 * `migration` names the file each table must be created by, so that a table
 * introduced in a later migration can be checked precisely instead of weakening
 * the check into "appears in some SQL file somewhere".
 *
 * MAINTENANCE RULE: adding a column to a marketplace migration without adding
 * it here is a review defect. The consistency check below fails the build if a
 * table listed here is missing from src/lib/supabase.ts TABLES.
 */
const MARKETPLACE_SCHEMA = {
  app_marketplace_instructors: {
    migration: '004-marketplace-schema.sql',
    columns: [
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
      // PB-MARKET-REVENUE-EVENTS-001 — registral only, decides no treatment.
      'vat_number_status',
      'vies_consultation_number',
      'vies_validated_at',
      'legal_form',
      'business_registration_number',
      'date_of_birth',
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
  },
  app_marketplace_course_reviews: {
    migration: '004-marketplace-schema.sql',
    columns: [
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
  },
  app_marketplace_dsa_notices: {
    migration: '004-marketplace-schema.sql',
    columns: [
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
  },
  // ---------------------------------------------------------------------------
  // PB-MARKET-REVENUE-EVENTS-001 — APPEND-ONLY, OBSERVED FACTS ONLY.
  //
  // EVERY column below is a fact read off a Stripe object at the moment of the
  // transaction. NONE is a function of another column. If a column added here
  // could be COMPUTED from the others, it does not belong in the table. Check 5
  // below runs this list against the derived-name patterns, so declaring a
  // derived column here fails the build rather than legitimising it.
  // ---------------------------------------------------------------------------
  app_marketplace_revenue_events: {
    migration: '005-revenue-events.sql',
    columns: [
      'id',
      'order_id',
      'course_id',
      'instructor_id',
      'event_type',
      'occurred_at',
      'currency',
      'gross_amount_cents',
      'tax_amount_cents',
      'discount_amount_cents',
      'stripe_fee_cents',
      'net_settled_cents',
      'coupon_code',
      'promotion_id',
      'discount_funded_by',
      'buyer_country',
      'buyer_country_evidence',
      'buyer_vat_number',
      'buyer_is_business',
      'instructor_tier_at_event',
      'acquisition_channel',
      'stripe_event_id',
      'stripe_object_id',
      'raw_payload',
      'created_at',
    ],
    // PB-MARKET-REVENUE-LIVEMODE-001. Columns added to this table by a LATER
    // forward migration. 004 and 005 are APPLIED in production and are no
    // longer amendable in place, so anything new arrives in its own file and
    // must be checked against that file rather than against 005.
    laterColumns: {
      '006-revenue-events-livemode.sql': ['livemode'],
    },
  },
};

/** Columns added to the pre-existing app_orders by migration 005. */
const ORDERS_ADDED_COLUMNS = [
  'course_id',
  'instructor_id',
  'instructor_tier_at_sale',
  'acquisition_channel',
  'referral_code',
  'referring_user_id',
  'refunded_amount_cents',
];

/** Columns added to the pre-existing app_invoices by migration 005. */
const INVOICES_ADDED_COLUMNS = [
  'vat_determination_status',
  'customer_country_evidence',
  'customer_vat_number_status',
  'automatic_tax_enabled',
];

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
  // PB-MARKET-REVENUE-EVENTS-001. DAC7 identifiers for natural persons and
  // entities, plus the student personal data carried on a revenue event. The
  // product spec's hard GDPR rule is that instructors receive NO student
  // personal data, so any appearance of these in frontend code deserves a look:
  // instructor-facing code must go through
  // app_marketplace_revenue_events_instructor, which omits them entirely.
  'business_registration_number',
  'date_of_birth',
  'raw_payload',
  'buyer_country_evidence',
  'buyer_vat_number',
];

/**
 * Files allowed to mention a forbidden name (documentation of why it is forbidden).
 *
 * SECURITY PROPERTY — AN ALLOWLIST ENTRY IS A HOLE IN THE GUARD.
 * Every name here is a file that may write anything, unchecked. That is
 * acceptable only for files that exist and have been reviewed.
 *
 * PB-MARKET-REVENUE-EVENTS-001 removed 'lib/marketplace.ts' from this set. It
 * named a file that HAD NEVER EXISTED, which is strictly worse than a stale
 * entry: it was a pre-authorised exemption lying in wait for whoever created
 * that path next. They would have inherited a blanket bypass without ever
 * asking for one and without the review that granting an exemption is supposed
 * to require. Nothing would have failed — the guard would simply have stopped
 * looking at the one file most likely to write marketplace columns.
 *
 * BOTH remedies are applied, not one:
 *   (a) the dead entry is deleted, and
 *   (b) the integrity check below FAILS THE BUILD if any entry does not resolve
 *       to a real file.
 * (a) alone fixes today and leaves the mechanism free to rot again the moment a
 * file is renamed or deleted — which is exactly how this hole appeared. (b)
 * alone would have passed today with the hole still open, since the entry was
 * already there. Together, an exemption can be neither stale nor speculative:
 * it must name a file that exists at the moment the guard runs.
 */
const ALLOWLIST = new Set(['lib/onboarding.ts']);

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

// =============================================================================
// Allowlist integrity — PB-MARKET-REVENUE-EVENTS-001.
//
// Runs BEFORE the grep, because a stale or speculative entry silently disables
// the grep for that path, and there is no value in reporting a clean scan that
// was performed through a hole. See the comment on ALLOWLIST for why an entry
// naming a non-existent file is worse than a merely stale one.
// =============================================================================

const allowlistErrors = [];
for (const rel of ALLOWLIST) {
  let ok = false;
  try {
    ok = statSync(join(SRC, rel)).isFile();
  } catch {
    ok = false;
  }
  if (!ok) {
    allowlistErrors.push(
      `ALLOWLIST entry "${rel}" does not resolve to a file under app/frontend/src. ` +
        `An allowlist entry is an unchecked write permission: pointing it at a ` +
        `non-existent path pre-authorises whoever creates that file next, with no review. ` +
        `Delete the entry, or fix the path.`,
    );
  }
}

if (allowlistErrors.length > 0) {
  console.error('\nSchema-guard allowlist integrity failure:\n');
  for (const e of allowlistErrors) console.error(`  - ${e}`);
  console.error(`\n${allowlistErrors.length} problem(s). See PB-MARKET-REVENUE-EVENTS-001.\n`);
  process.exit(1);
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
// PB-MARKET-SCHEMA-001 / PB-MARKET-REVENUE-EVENTS-001 — consistency checks
// between the SQL migrations, the TABLES constant and this guard.
//
// The FORBIDDEN grep above catches columns that must never be written. The
// checks below catch the opposite failure: the migrations and the frontend
// drifting apart silently, which is how a non-existent column reference gets
// introduced in the first place.
// =============================================================================

const SQL_DIR = join(__dirname, '..', 'sql');
const SUPABASE_LIB = join(SRC, 'lib', 'supabase.ts');

const driftErrors = [];

/** Migration contents keyed by file name, read once and reused by every check. */
const migrations = {};
const REQUIRED_MIGRATIONS = new Set([
  ...Object.values(MARKETPLACE_SCHEMA).map((t) => t.migration),
  ...Object.values(MARKETPLACE_SCHEMA).flatMap((t) => Object.keys(t.laterColumns ?? {})),
  '004-marketplace-schema.sql',
  '005-revenue-events.sql',
  '006-revenue-events-livemode.sql',
]);

for (const file of REQUIRED_MIGRATIONS) {
  try {
    migrations[file] = readFileSync(join(SQL_DIR, file), 'utf8');
  } catch {
    migrations[file] = null;
    driftErrors.push(
      `sql/${file} is missing. Tables and columns declared in this guard against it ` +
        `have no migration backing them.`,
    );
  }
}

const supabaseLib = readFileSync(SUPABASE_LIB, 'utf8');

// 1. Every table this guard knows about must be created by ITS OWN migration.
//    Checking against "any SQL file" would let a table declared here be
//    satisfied by an unrelated file that merely mentions the name.
for (const [table, { migration }] of Object.entries(MARKETPLACE_SCHEMA)) {
  const sql = migrations[migration];
  if (!sql) continue;
  if (!sql.includes(`CREATE TABLE IF NOT EXISTS ${table}`)) {
    driftErrors.push(
      `"${table}" is declared in check-schema-guard.mjs but is not created by ` +
        `sql/${migration}.`,
    );
  }
}

// 2. Every column this guard knows about must appear in its migration. Catches
//    the case where a column is renamed in SQL but not here — the exact drift
//    that produces a write to a non-existent column.
for (const [table, { migration, columns }] of Object.entries(MARKETPLACE_SCHEMA)) {
  const sql = migrations[migration];
  if (!sql) continue;
  for (const col of columns) {
    if (!sql.includes(col)) {
      driftErrors.push(
        `column "${col}" of ${table} is declared in check-schema-guard.mjs but does ` +
          `not appear in sql/${migration}.`,
      );
    }
  }
}

// 2b. PB-MARKET-REVENUE-LIVEMODE-001 — columns added by a LATER forward
//     migration are checked against THAT file, not against the one that created
//     the table. Checking them against the creating migration would be wrong in
//     both directions: it would fail for a column that legitimately arrived
//     later, and it would pass if someone amended an already-applied file in
//     place, which is precisely what must not happen now that 004 and 005 are
//     live in production.
//
//     They must also be ADD COLUMN IF NOT EXISTS: the table already exists in
//     production, so a plain ADD COLUMN is not idempotent and breaks a re-run.
for (const [table, { laterColumns }] of Object.entries(MARKETPLACE_SCHEMA)) {
  for (const [migration, columns] of Object.entries(laterColumns ?? {})) {
    const sql = migrations[migration];
    if (!sql) continue;
    for (const col of columns) {
      if (!sql.includes(col)) {
        driftErrors.push(
          `column "${col}" of ${table} is declared in check-schema-guard.mjs as added by ` +
            `sql/${migration}, but does not appear in that file.`,
        );
      }
      if (!sql.includes(`ADD COLUMN IF NOT EXISTS ${col}`)) {
        driftErrors.push(
          `${table}.${col} is expected to be added by "ADD COLUMN IF NOT EXISTS ${col}" in ` +
            `sql/${migration}, but that statement was not found. ${table} already exists in ` +
            `production, so a plain ADD COLUMN is not idempotent and breaks a re-run.`,
        );
      }
    }
  }
}

// 3. Every column a migration adds to a PRE-EXISTING table must be an explicit
//    ADD COLUMN IF NOT EXISTS. A plain ADD COLUMN would make the migration
//    non-idempotent and fail on re-run.
const ADDED_COLUMN_CHECKS = [
  {
    table: 'app_academy_courses',
    migration: '004-marketplace-schema.sql',
    columns: ACADEMY_COURSES_ADDED_COLUMNS,
  },
  { table: 'app_orders', migration: '005-revenue-events.sql', columns: ORDERS_ADDED_COLUMNS },
  { table: 'app_invoices', migration: '005-revenue-events.sql', columns: INVOICES_ADDED_COLUMNS },
];

for (const { table, migration, columns } of ADDED_COLUMN_CHECKS) {
  const sql = migrations[migration];
  if (!sql) continue;
  for (const col of columns) {
    if (!sql.includes(`ADD COLUMN IF NOT EXISTS ${col}`)) {
      driftErrors.push(
        `${table}.${col} is expected to be added by "ADD COLUMN IF NOT EXISTS ${col}" in ` +
          `sql/${migration}, but that statement was not found. Non-idempotent migrations ` +
          `break re-runs.`,
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

// 5. PB-MARKET-REVENUE-EVENTS-001 — fiscal_nature must carry NO DEFAULT.
//    A default here is a SILENT FISCAL ASSUMPTION: a course nobody classified
//    would be recorded as pre-recorded by the system, with nothing indicating
//    the question went unanswered. A misclassification must be a visible
//    omission (a failing INSERT), never a system-chosen answer.
{
  const sql = migrations['004-marketplace-schema.sql'];
  if (sql && /fiscal_nature\s+TEXT[^;]*DEFAULT/i.test(sql)) {
    driftErrors.push(
      `sql/004-marketplace-schema.sql declares fiscal_nature with a DEFAULT. That default ` +
        `is a silent fiscal assumption: it answers, on the system's behalf, the single most ` +
        `important classification question in the data model. Add the column nullable, ` +
        `backfill, then SET NOT NULL without a default.`,
    );
  }
}

// 6. PB-MARKET-REVENUE-EVENTS-001 — NO DERIVED COLUMN ON THE EVENTS TABLE.
//
//    The declared column list is cross-checked against the derived-revenue
//    patterns. This is the structural half of the rule: FORBIDDEN stops the
//    frontend from REFERENCING such a name, and this stops the guard's own
//    schema record from ever DECLARING one as legitimate. Without it, someone
//    adding `instructor_share_cents` to both the migration and this list would
//    sail through.
const DERIVED_NAME_PATTERNS = [
  /net_course_revenue/i,
  /instructor_share/i,
  /instructor_earnings/i,
  /instructor_balance/i,
  /platform_fee/i,
  /platform_commission/i,
  /take_rate/i,
  /revenue_split/i,
  /payout/i,
  /percentage/i,
  /_percent$/i,
];

const eventsTable = MARKETPLACE_SCHEMA.app_marketplace_revenue_events;
if (eventsTable) {
  // Later-migration columns are scanned too: a derived column smuggled in via a
  // forward migration is exactly as much of a defect as one in the original.
  const allEventColumns = [
    ...eventsTable.columns,
    ...Object.values(eventsTable.laterColumns ?? {}).flat(),
  ];
  for (const col of allEventColumns) {
    const hit = DERIVED_NAME_PATTERNS.find((re) => re.test(col));
    if (hit) {
      driftErrors.push(
        `app_marketplace_revenue_events."${col}" matches the derived-revenue pattern ` +
          `${hit}. That table is an APPEND-ONLY ledger of OBSERVED FACTS with zero derived ` +
          `columns: a derived column silently picks a Net Course Revenue definition that ` +
          `PB-MARKET-TAX-001 has not made. Instructor Balance and Payout must be views or ` +
          `computations over the events, never stored columns.`,
      );
    }
  }

  // 7. Append-only is enforced by the ABSENCE of INSERT/UPDATE/DELETE policies
  //    and the absence of write grants. Absence is invisible in review and
  //    trivially undone, so both halves are asserted here rather than trusted.
  //
  //    Scoped to policies whose statement actually names the events table, so
  //    an unrelated policy in the same migration cannot trip it.
  //
  //    PB-MARKET-REVENUE-LIVEMODE-001: this now sweeps EVERY migration that
  //    touches the table, not just the one that created it. 005 is applied and
  //    frozen, so the only way append-only can be weakened from here on is a
  //    forward migration — which is exactly the file this loop has to read.
  const APPEND_ONLY_MIGRATIONS = [
    '005-revenue-events.sql',
    ...Object.keys(eventsTable.laterColumns ?? {}),
  ];

  for (const migration of APPEND_ONLY_MIGRATIONS) {
    const sql = migrations[migration];
    if (!sql) continue;

    for (const block of sql.split(/CREATE POLICY/i).slice(1)) {
      const statement = block.split(';')[0];
      if (!statement.includes('app_marketplace_revenue_events')) continue;

      const cmd = statement.match(/\bFOR\s+(SELECT|INSERT|UPDATE|DELETE|ALL)\b/i);
      if (cmd && cmd[1].toUpperCase() !== 'SELECT') {
        driftErrors.push(
          `sql/${migration} declares a "FOR ${cmd[1].toUpperCase()}" policy on ` +
            `app_marketplace_revenue_events. That table is APPEND-ONLY: it must have SELECT ` +
            `policies and nothing else. Writes come from service_role only, and a ` +
            `correction is a new ADJUSTMENT event, never an edit of a past one.`,
        );
      }
    }

    // The mirror image: a write grant would break append-only at the privilege
    // layer regardless of what the policies say.
    const overreaching = sql.match(
      /GRANT[^;]*\b(INSERT|UPDATE|DELETE)\b[^;]*ON app_marketplace_revenue_events[^;]*;/i,
    );
    if (overreaching) {
      driftErrors.push(
        `sql/${migration} grants a write privilege on ` +
          `app_marketplace_revenue_events: "${overreaching[0].trim()}". The table is ` +
          `APPEND-ONLY and authenticated must hold SELECT and nothing else.`,
      );
    }
  }

  // PB-SEC-RLS-WORKFORCE-001: a policy without a matching grant is never
  // evaluated at all, because PostgREST refuses the request first. Asserted
  // against the migration that creates the table and its grants.
  {
    const sql = migrations['005-revenue-events.sql'];
    if (sql && !/GRANT SELECT ON app_marketplace_revenue_events TO authenticated/.test(sql)) {
      driftErrors.push(
        `sql/005-revenue-events.sql has no "GRANT SELECT ON app_marketplace_revenue_events ` +
          `TO authenticated". PB-SEC-RLS-WORKFORCE-001: a policy without a matching grant ` +
          `is dead code.`,
      );
    }
  }

  // 8. PB-MARKET-REVENUE-LIVEMODE-001 — livemode must stay a THREE-STATE FACT.
  //
  //    The whole argument for the column is that it records only what Stripe
  //    reported. A DEFAULT would make the database assert a provenance it never
  //    observed: DEFAULT true fabricates "real money" for historical rows and
  //    overstates revenue, DEFAULT false reclassifies real revenue as test data
  //    and deletes it from every report. The table is APPEND-ONLY, so either
  //    mistake is permanent and uncorrectable. NULL means "written before the
  //    flag existed", and that is a true statement about the world.
  {
    const sql = migrations['006-revenue-events-livemode.sql'];
    if (sql) {
      // Matched against the ADD COLUMN STATEMENT itself for the same reason as
      // the index check below: this file argues at length about why a default
      // would be wrong, and a whole-file search would trip over its own
      // explanation. Anchored to a line start so a "--" comment cannot match.
      const addStatement = (sql.match(
        /^ALTER TABLE[^;]*ADD COLUMN IF NOT EXISTS livemode[^;]*;/im,
      ) ?? [])[0];

      if (!addStatement) {
        driftErrors.push(
          `sql/006-revenue-events-livemode.sql has no "ADD COLUMN IF NOT EXISTS livemode" ` +
            `statement. app_marketplace_revenue_events already exists in production, so the ` +
            `column must be added idempotently by a forward migration.`,
        );
      } else {
        if (/\bDEFAULT\b/i.test(addStatement)) {
          driftErrors.push(
            `sql/006-revenue-events-livemode.sql gives livemode a DEFAULT: ` +
              `"${addStatement.trim()}". That default is a fabricated observation: true ` +
              `would assert "real money" about rows nobody observed, false would reclassify ` +
              `real revenue as test data. The table is APPEND-ONLY, so the mistake could ` +
              `never be corrected. Keep it nullable with no default — NULL honestly means ` +
              `"written before the flag existed".`,
          );
        }

        if (/\bNOT\s+NULL\b/i.test(addStatement)) {
          driftErrors.push(
            `sql/006-revenue-events-livemode.sql declares livemode NOT NULL. Rows written ` +
              `before this migration genuinely have unknown provenance, and NOT NULL would ` +
              `force a back-filled guess into an APPEND-ONLY ledger.`,
          );
        }
      }

      // The partial index must not be keyed on "= true": that predicate excludes
      // every pre-006 NULL row, so the index would be unusable for the honest
      // query and would reward writing the wrong one in order to hit it.
      //
      // Matched against the actual CREATE INDEX STATEMENT, not against the file
      // as a whole. The prose in this migration discusses the correct predicate
      // at length, so a substring search over the whole file would be satisfied
      // by the explanation of the rule even if the statement itself broke it —
      // a guard that passes because the documentation is good is theatre.
      //
      // Anchored to the start of a line so the phrase "CREATE INDEX IF NOT
      // EXISTS" appearing inside a "--" comment cannot be mistaken for the
      // statement: comment lines begin with "--", real statements do not.
      const indexStatement = (sql.match(
        /^CREATE INDEX IF NOT EXISTS[^;]*livemode[^;]*;/im,
      ) ?? [])[0];

      if (!indexStatement) {
        driftErrors.push(
          `sql/006-revenue-events-livemode.sql has no CREATE INDEX statement for livemode. ` +
            `"Real revenue only" is the near-universal query over this table and needs a ` +
            `supporting partial index.`,
        );
      } else if (!/WHERE livemode IS DISTINCT FROM false/i.test(indexStatement)) {
        driftErrors.push(
          `sql/006-revenue-events-livemode.sql's livemode index is not predicated on ` +
            `"WHERE livemode IS DISTINCT FROM false": "${indexStatement.trim()}". The ` +
            `real-revenue query must include pre-006 rows of unknown provenance and exclude ` +
            `only rows OBSERVED to be test; an index on "livemode = true" would silently ` +
            `drop every historical row and would reward writing that wrong predicate in ` +
            `order to hit the index.`,
        );
      }
    }
  }
}

if (driftErrors.length > 0) {
  console.error('\nMarketplace schema drift detected:\n');
  for (const e of driftErrors) console.error(`  - ${e}`);
  console.error(`\n${driftErrors.length} problem(s). See PB-MARKET-SCHEMA-001.\n`);
  process.exit(1);
}

// =============================================================================
// PB-MARKET-REVENUE-EVENTS-001 — reverse_charge may never be read alone.
//
// THE SEMANTIC HAZARD.
// app_invoices.reverse_charge is a boolean, but `false` carries two completely
// different meanings depending on vat_determination_status beside it:
//
//   false + UNDETERMINED / AUTOMATIC_TAX_DISABLED  = "WE DO NOT KNOW."
//   false + AUTOMATIC_TAX / MANUAL_REVIEW          = "determined not to apply."
//
// Both are the literal value `false`. Code that reads the boolean on its own
// therefore silently converts "we never determined this" into "we determined it
// does not apply" — a positive fiscal conclusion nobody ever reached. That is
// the same class of defect as the original `taxCents === 0 && country !== "EE"`
// inference, just running in the other direction.
//
// The CHECK constraint in sql/005-revenue-events.sql section 3.1 makes the
// contradictory WRITE (true + undetermined) unrepresentable. It cannot do
// anything about a READ. This is the read-side half, and the two are deliberately
// independent: a constraint protects the data, this protects the interpretation.
//
// THE RULE: any TypeScript that mentions reverse_charge must also mention
// vat_determination_status within the same scope, so that whoever reads the
// boolean has the qualifier physically in front of them.
//
// FALSE-POSITIVE POSTURE — DELIBERATELY FORGIVING.
// A guard that cries wolf gets bypassed, and a bypassed guard is worse than no
// guard because it also carries false assurance. Three concessions:
//
//   1. SCOPE IS A GENEROUS WINDOW, NOT A PARSER. "Same scope" is approximated
//      as a +/- SCOPE_WINDOW-line neighbourhood rather than by parsing the AST.
//      Real call sites read and write these two fields within a few lines of
//      each other (the stripe-webhook upsert has them adjacent), so the window
//      is comfortably larger than the realistic distance. Being approximate
//      here costs nothing: the failure mode of a too-large window is letting a
//      borderline case through, which is the direction a guard should err in.
//
//   2. COMMENTS COUNT AS HANDLING. A line documenting why reverse_charge is not
//      being interpreted satisfies the rule. Discussing the hazard in prose is
//      exactly the awareness this check exists to force, and refusing to accept
//      it would punish the most careful authors.
//
//   3. AN EXPLICIT, GREPPABLE ESCAPE HATCH. See below.
//
// THE ESCAPE HATCH.
//   Put `schema-guard-allow-reverse-charge` in a comment on the line itself or
//   the line directly above it, with a reason:
//
//     // schema-guard-allow-reverse-charge: rendering the raw audit row, no
//     // fiscal interpretation is performed on this value.
//     const raw = invoice.reverse_charge;
//
//   It is deliberately verbose and deliberately greppable: silencing this check
//   should be a visible, reviewable act that a reviewer can find in one search,
//   never an accident. `rg schema-guard-allow-reverse-charge` enumerates every
//   exemption in the codebase.
// =============================================================================

const REVERSE_CHARGE_COL = 'reverse_charge';
const VAT_STATUS_COL = 'vat_determination_status';
const REVERSE_CHARGE_ESCAPE = 'schema-guard-allow-reverse-charge';
const SCOPE_WINDOW = 12;

const reverseChargeViolations = [];

// Scope note: SRC alone is NOT enough here. The only code in this repository
// that actually touches reverse_charge is supabase/functions/stripe-webhook,
// which lives outside app/frontend/src. A guard that skips the single file it
// exists to protect is theatre: it reports green while covering nothing. Every
// other check in this file is frontend-shaped, so the wider scope applies here
// only, and the reported path is repo-relative to keep the two roots distinct.
const EDGE_FUNCTIONS = join(__dirname, '..', 'supabase', 'functions');
const REPO_ROOT = join(__dirname, '..');
const reverseChargeRoots = [SRC, EDGE_FUNCTIONS].filter((dir) => {
  try {
    return statSync(dir).isDirectory();
  } catch {
    return false;
  }
});

for (const file of reverseChargeRoots.flatMap((root) => walk(root))) {
  const rel = relative(REPO_ROOT, file).split('\\').join('/');
  const lines = readFileSync(file, 'utf8').split('\n');

  lines.forEach((line, i) => {
    // \b so that vat_reverse_charge_note or reverse_charged do not trip it.
    if (!new RegExp(`\\b${REVERSE_CHARGE_COL}\\b`).test(line)) return;

    // Escape hatch: this line, or the line immediately above it.
    const hatch =
      line.includes(REVERSE_CHARGE_ESCAPE) ||
      (i > 0 && lines[i - 1].includes(REVERSE_CHARGE_ESCAPE));
    if (hatch) return;

    const from = Math.max(0, i - SCOPE_WINDOW);
    const to = Math.min(lines.length, i + SCOPE_WINDOW + 1);
    const scope = lines.slice(from, to).join('\n');
    if (scope.includes(VAT_STATUS_COL)) return;

    reverseChargeViolations.push({ file: rel, line: i + 1, text: line.trim() });
  });
}

if (reverseChargeViolations.length > 0) {
  console.error('\nreverse_charge read without vat_determination_status:\n');
  for (const v of reverseChargeViolations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.text}`);
  }
  console.error(
    `\n  reverse_charge = false means TWO different things: "we do not know"\n` +
      `  (vat_determination_status UNDETERMINED / AUTOMATIC_TAX_DISABLED) and\n` +
      `  "determined not to apply" (AUTOMATIC_TAX / MANUAL_REVIEW). Reading the\n` +
      `  boolean alone turns the first into the second — asserting a fiscal\n` +
      `  conclusion nobody reached.\n\n` +
      `  Handle ${VAT_STATUS_COL} in the same scope, or, if no fiscal\n` +
      `  interpretation is being made, annotate the line:\n\n` +
      `    // ${REVERSE_CHARGE_ESCAPE}: <why this read is not a determination>\n\n` +
      `  ${reverseChargeViolations.length} violation(s). See PB-MARKET-REVENUE-EVENTS-001 ` +
      `and sql/005-revenue-events.sql section 3.1.\n`,
  );
  process.exit(1);
}

// =============================================================================
// PB-MARKET-REVENUE-LIVEMODE-001 — every revenue-event write must record
// livemode.
//
// THE FAILURE THIS PREVENTS. app_marketplace_revenue_events is APPEND-ONLY: no
// UPDATE, no DELETE, ever. A row inserted without livemode is permanently
// indistinguishable from real revenue at the column level — it cannot be
// corrected and it cannot be removed, so a single forgotten call site puts
// unmarkable test money in the production ledger forever.
//
// The TypeScript interface already makes omission a compile error, but the
// guard runs in CI without a Deno type-check over the Edge Functions, so the
// property is asserted structurally here as well: every recordRevenueEvent call
// must carry a livemode field. Counting is enough and is deliberately simple —
// it cannot be satisfied by a comment, and it fails loudly when a fifth event
// type is added and the new call site forgets the flag.
// =============================================================================

const WEBHOOK = join(EDGE_FUNCTIONS, 'stripe-webhook', 'index.ts');

try {
  const webhookSrc = readFileSync(WEBHOOK, 'utf8');
  const calls = (webhookSrc.match(/recordRevenueEvent\(\{/g) ?? []).length;
  const flags = (webhookSrc.match(/^\s*livemode:\s*event\.livemode,\s*$/gm) ?? []).length;

  if (calls > 0 && flags !== calls) {
    console.error(
      `\nsupabase/functions/stripe-webhook/index.ts has ${calls} recordRevenueEvent(...) ` +
        `call(s) but ${flags} "livemode: event.livemode" assignment(s).\n\n` +
        `  Every revenue-event write must transcribe Stripe's livemode flag.\n` +
        `  app_marketplace_revenue_events is APPEND-ONLY, so a row written without it is\n` +
        `  permanently indistinguishable from real revenue: it cannot be updated and it\n` +
        `  cannot be deleted. Read it from the EVENT (event.livemode), which is the\n` +
        `  delivery Stripe signed, not from the nested object.\n\n` +
        `  See sql/006-revenue-events-livemode.sql and PB-MARKET-REVENUE-LIVEMODE-001.\n`,
    );
    process.exit(1);
  }
} catch {
  // The webhook is not present in every checkout shape; absence is not a
  // failure here, and the SQL-side checks above still hold.
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
  `Allowlist OK: ${ALLOWLIST.size} entr${ALLOWLIST.size === 1 ? 'y' : 'ies'}, all resolving ` +
    `to real files.`,
);
console.log(
  `Marketplace schema OK: ${Object.keys(MARKETPLACE_SCHEMA).length} tables, ` +
    `${Object.values(MARKETPLACE_SCHEMA).reduce(
      (n, t) => n + t.columns.length + Object.values(t.laterColumns ?? {}).flat().length,
      0,
    )} columns, ` +
    `${ACADEMY_COURSES_ADDED_COLUMNS.length} app_academy_courses + ` +
    `${ORDERS_ADDED_COLUMNS.length} app_orders + ${INVOICES_ADDED_COLUMNS.length} app_invoices ` +
    `additions verified against sql/004-marketplace-schema.sql, sql/005-revenue-events.sql ` +
    `and sql/006-revenue-events-livemode.sql.`,
);
console.log(
  'Revenue events OK: append-only (SELECT-only policies and grants) across 005 and every ' +
    'forward migration, zero derived columns, fiscal_nature carries no silent default.',
);
console.log(
  'Livemode OK: nullable with no default (three-state fact), partial index predicated on ' +
    '"IS DISTINCT FROM false", and every recordRevenueEvent call transcribes event.livemode.',
);
console.log(
  'Reverse-charge OK: no TypeScript reads reverse_charge without handling ' +
    'vat_determination_status in the same scope.',
);
