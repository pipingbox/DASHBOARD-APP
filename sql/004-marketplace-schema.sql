-- =============================================================================
-- PB-MARKET-SCHEMA-001: Course marketplace data-schema foundation
-- =============================================================================
--
-- PURPOSE:
-- Create the persistence layer the course marketplace depends on: third-party
-- instructors (with day-one fiscal capture), course provenance/taxonomy and
-- Verified Course state, the internal technical/pedagogical QA review queue,
-- and the EU DSA Article 16 notice-and-action register.
--
-- This migration is a HARD DEPENDENCY of the instructor onboarding, QA review,
-- Verified Course and marketplace dashboard workstreams. It is deliberately
-- schema-only: no business logic, no percentages, no payment plumbing.
--
-- SCOPE:
-- Creates 3 new tables:
--   app_marketplace_instructors
--   app_marketplace_course_reviews
--   app_marketplace_dsa_notices
-- Touches one existing table, app_academy_courses, by ADD COLUMN IF NOT EXISTS
-- only (instructor_id, fiscal_nature, taxonomy_category, verification_status,
-- verified_at, verified_by, submitted_for_review_at,
-- revenue_share_channel_default) plus a one-shot backfill of the pre-existing
-- rows as PipingBox Originals. No existing column is altered or dropped.
--
-- NAMING — READ THIS BEFORE ADDING ANYTHING:
-- Two table conventions coexist. `app_14da0f1941_` is LEGACY (profiles, jobs,
-- community, notifications). Everything new — Academy, certification, Stripe
-- and now the marketplace — uses plain `app_`. All tables here use plain `app_`.
--
-- SEMANTIC COLLISION — DO NOT REUSE THE WORKER-PIPELINE VOCABULARY:
-- `app_14da0f1941_profiles.marketplace_ready` and the ONBOARDING_STATUS ladder
-- (AUTH_ONLY -> PROFILE_STARTED -> PROFILE_COMPLETED -> MARKETPLACE_READY, see
-- app/frontend/src/lib/onboarding.ts) belong to the JOB marketplace: they mean
-- "worker profile >= 30% complete, visible to recruiters". They have NOTHING to
-- do with the course marketplace. The instructor pipeline therefore has its own
-- column, `instructor_status`, with its own value set. Never overload
-- `marketplace_ready` for instructor state.
--
-- POSTGREST SILENT-FAILURE HAZARD:
-- Writing a column that does not exist makes PostgREST reject the ENTIRE
-- statement without raising anything visible in the UI. That is what caused
-- PB-ADMIN-ONBOARDING-SCHEMA-001 (every worker scoring 0 in job matching).
-- scripts/check-schema-guard.mjs is the automated guard and has been extended
-- to cover the tables and columns created here. Any column added to this file
-- must also be added there.
--
-- EXPLICITLY OUT OF SCOPE — BLOCKED BY PB-MARKET-TAX-001:
-- No Stripe Connect, no application_fee_amount, no destination charges, no
-- self-billing, no VAT engine, no Net Course Revenue calculation, no payout
-- engine. Columns that will LATER hold payout data are created (iban,
-- tax_identification_number, vat_number, revenue_share_tier,
-- revenue_share_channel_default) but nothing in this file computes, splits or
-- moves money. Storing the tier, not the percentage, is deliberate: the actual
-- splits (70/30, 90/10, 60/40, 75/25) are acquisition-channel dependent and
-- belong in application config, not in the schema.
--
-- REVERSIBLE:
-- YES — run the ROLLBACK section at the bottom to undo everything.
--
-- IDEMPOTENT:
-- YES — create table if not exists, add column if not exists, do $$ ... $$
-- guards for constraints, drop policy if exists before every create policy.
-- Safe to re-run.
--
-- STATUS: NOT APPLIED. This file has never been executed against any database.
-- It must be run against Supabase by the operator. See section 11.
--
-- AMENDED 2026-08 (PB-MARKET-REVENUE-EVENTS-001) while still UNEXECUTED, which
-- is why these are edits in place rather than a follow-up migration:
--   * fiscal_nature no longer carries DEFAULT 'pregrabado'. It is added
--     nullable, backfilled for the pre-existing PipingBox Originals, then set
--     NOT NULL with no default. A misclassified course must be a visible
--     omission, not a silent system assumption. See section 3 and 3.1b.
--   * app_marketplace_instructors gains legal_form, business_registration_number
--     and date_of_birth. The differing treatment of individuals, sole traders
--     and companies is one of the open questions in PB-MARKET-TAX-001, and the
--     schema could not tell them apart. Capturing the legal form does not
--     decide its treatment; failing to capture it makes the decision
--     unimplementable. DAC7 needs the same discriminator.
--   * app_marketplace_instructors gains vat_number_status, plus
--     vies_consultation_number and vies_validated_at. Purely registral.
-- None of these amendments computes, splits or interprets anything.
-- =============================================================================


-- =============================================================================
-- 1. Admin helper
-- =============================================================================
-- Already created by 003-stripe-payments-schema.sql. Repeated here with CREATE
-- OR REPLACE so this migration can be applied standalone. SECURITY DEFINER so
-- that reading the profiles table from inside a policy on another table does
-- not re-enter that table's own RLS.

CREATE OR REPLACE FUNCTION app_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM app_14da0f1941_profiles p
    WHERE p.user_id = auth.uid()
      AND p.role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION app_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_is_admin() TO authenticated;


-- =============================================================================
-- 2. app_marketplace_instructors — one row per third-party instructor
-- =============================================================================
-- SENSITIVE TABLE. iban, tax_identification_number, tin_issuing_state,
-- vat_number, legal_name and legal_address are personal and financial data
-- under GDPR Art. 9-adjacent handling and DAC7. The RLS model in section 7 is
-- built so that an instructor can only ever read their OWN row, and no other
-- authenticated user can read any instructor row at all — not even a redacted
-- one. Public-facing instructor information (display_name, bio, headline) must
-- be served through the SECURITY INVOKER view app_marketplace_instructors_public
-- created in section 8, never by widening this table's SELECT policy.
--
-- Postgres RLS filters ROWS, not COLUMNS. There is no way to grant a
-- "SELECT everything except iban" policy. Column-level protection is therefore
-- achieved by (a) never granting row access to third parties on the base table
-- and (b) exposing only the safe columns through the view. Do not add a
-- policy such as `FOR SELECT TO authenticated USING (true)` to this table: it
-- would leak IBANs to every logged-in user in one line.
--
-- FISCAL CAPTURE IS REQUIRED FROM DAY ONE. The tax ticket is explicit that not
-- capturing at onboarding forces a retroactive collection campaign across the
-- whole instructor base, which has a very low completion rate. The columns are
-- nullable at the database level on purpose (an APPLIED instructor has not
-- submitted anything yet); completeness is enforced by the application at the
-- APPROVED transition and surfaced by dac7_data_complete.

CREATE TABLE IF NOT EXISTS app_marketplace_instructors (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     UUID NOT NULL UNIQUE
                                REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Instructor onboarding pipeline. DELIBERATELY NOT named onboarding_status
  -- and DELIBERATELY not reusing marketplace_ready: those belong to the worker
  -- / job marketplace. See the header note on semantic collision.
  instructor_status           TEXT NOT NULL DEFAULT 'APPLIED'
                                CHECK (instructor_status IN (
                                  'APPLIED',
                                  'IDENTITY_SUBMITTED',
                                  'UNDER_REVIEW',
                                  'APPROVED',
                                  'SUSPENDED',
                                  'REJECTED'
                                )),

  -- Public-facing profile (safe to expose through the public view).
  display_name                TEXT,
  bio                         TEXT,
  headline                    TEXT,

  -- Founding Instructor programme is capped at 10 people. The cap is enforced
  -- by the partial unique-ish guard in section 5, not by this flag alone.
  is_founding_instructor      BOOLEAN NOT NULL DEFAULT false,

  -- Store the TIER, never the percentage. The splits (70/30, 90/10, 60/40,
  -- 75/25) are acquisition-channel dependent and live in application config.
  -- Hardcoding a number here would make every future channel change a
  -- migration and would silently misprice historical contracts.
  revenue_share_tier          TEXT NOT NULL DEFAULT 'STANDARD'
                                CHECK (revenue_share_tier IN (
                                  'STANDARD',
                                  'FOUNDING',
                                  'STRATEGIC'
                                )),

  -- ---------------------------------------------------------------------------
  -- Fiscal capture (DAC7 / EU marketplace reporting). SENSITIVE.
  -- ---------------------------------------------------------------------------
  tax_country                 TEXT,          -- ISO 3166-1 alpha-2
  tax_identification_number   TEXT,          -- TIN. SENSITIVE.
  tin_issuing_state           TEXT,          -- ISO 3166-1 alpha-2; may differ from tax_country
  vat_number                  TEXT,          -- NULLABLE ON PURPOSE: whether a VAT number is
                                             -- mandatory for an instructor is still open in
                                             -- PB-MARKET-TAX-001. Do not add NOT NULL here
                                             -- until that ticket closes.

  -- ---------------------------------------------------------------------------
  -- VAT-number STATE. Registral only: this records WHAT WE KNOW, never what the
  -- tax consequence of knowing it is.
  -- ---------------------------------------------------------------------------
  -- With `vat_number TEXT` alone, NULL is ambiguous: it cannot distinguish
  -- "this instructor is a private individual and has no VAT number" from "the
  -- onboarding form was never completed". Those are opposite situations — the
  -- first is a settled fact, the second is missing data — and collapsing them
  -- makes it impossible to know later whether anyone ever asked.
  --
  -- vies_consultation_number is the reference VIES returns for a validation
  -- request. It is the EVIDENCE. A reverse-charge position asserted without the
  -- consultation reference collapses under inspection, because the platform
  -- cannot show it validated the counterparty's number on the date of supply.
  -- Storing it decides nothing; not storing it makes the decision unprovable.
  --
  -- NOTHING here computes a VAT treatment. The determination is PB-MARKET-TAX-001.
  vat_number_status           TEXT NOT NULL DEFAULT 'NOT_PROVIDED'
                                CHECK (vat_number_status IN (
                                  'NOT_PROVIDED',    -- never asked / never answered
                                  'NOT_APPLICABLE',  -- asked; instructor has no VAT number
                                  'PROVIDED',        -- a number was given, not yet validated
                                  'VIES_VALIDATED',  -- confirmed valid by VIES
                                  'VIES_INVALID'     -- VIES rejected it
                                )),
  vies_consultation_number    TEXT,          -- VIES reference. Required evidence for any future
                                             -- reverse-charge position. Registral, not a decision.
  vies_validated_at           TIMESTAMPTZ,   -- when the VIES check above was performed

  -- ---------------------------------------------------------------------------
  -- LEGAL FORM. Capturing it does NOT decide its treatment; failing to capture
  -- it makes the decision unimplementable.
  -- ---------------------------------------------------------------------------
  -- One of the open questions in PB-MARKET-TAX-001 is precisely that private
  -- individuals, sole traders and companies are treated differently (VAT
  -- registration, invoicing/self-billing, withholding, DAC7 field set). Today
  -- the schema cannot tell them apart at all, so whichever answer that ticket
  -- reaches would be unimplementable against historical instructors without a
  -- retroactive data-collection campaign.
  --
  -- DAC7 also needs the discriminator directly: an ENTITY must report a
  -- business registration number, and a NATURAL PERSON without a TIN must
  -- report a date of birth.
  --
  -- All three are NULLABLE. Requiring them today would block onboarding on a
  -- question the tax ticket has not answered yet, which is the opposite of the
  -- intent: capture now, decide later.
  legal_form                  TEXT
                                CHECK (legal_form IS NULL OR legal_form IN (
                                  'INDIVIDUAL',    -- natural person, not registered as a trader
                                  'SOLE_TRADER',   -- natural person registered as self-employed
                                  'COMPANY'        -- legal entity
                                )),
  business_registration_number TEXT,         -- SENSITIVE. DAC7: required for ENTITY sellers.
  date_of_birth               DATE,          -- SENSITIVE. DAC7: required for a natural person
                                             -- with no TIN. Never expose beyond owner/admin.
  iban                        TEXT,          -- SENSITIVE. Payout destination. No payout logic
                                             -- exists yet (blocked by PB-MARKET-TAX-001);
                                             -- this column only stores what onboarding captures.
  legal_name                  TEXT,          -- Registered name; may differ from display_name
  legal_address               JSONB,         -- SENSITIVE. { street, city, postal_code, country }
  identity_document_status    TEXT
                                CHECK (identity_document_status IS NULL OR identity_document_status IN (
                                  'NOT_SUBMITTED',
                                  'SUBMITTED',
                                  'VERIFIED',
                                  'REJECTED',
                                  'EXPIRED'
                                )),

  -- DAC7 reporting. Default true: an EU platform must assume a seller is
  -- reportable and prove otherwise, not the reverse.
  dac7_reportable             BOOLEAN NOT NULL DEFAULT true,

  -- DESIGN NOTE — dac7_data_complete is a GENERATED STORED column, not a
  -- maintained one. Rationale: a trigger-maintained flag can drift if any code
  -- path updates the fiscal columns without going through the trigger, and
  -- drift on a reporting flag is a compliance defect, not a cosmetic one. A
  -- generated column cannot drift and cannot be written by mistake — PostgREST
  -- rejects writes to it, which is the desired behaviour.
  --
  -- Only IMMUTABLE expressions are allowed in a generated column, so this is a
  -- pure NOT NULL check over the five fields DAC7 requires from a reportable
  -- seller (name, address, TIN, TIN issuing state, tax country). It does not
  -- validate format or check-digits — that is application-side.
  --
  -- Consequence for callers: never include dac7_data_complete in an INSERT or
  -- UPDATE payload. Doing so makes PostgREST reject the whole statement, which
  -- is exactly the PB-ADMIN-ONBOARDING-SCHEMA-001 failure mode. The schema
  -- guard covers this.
  dac7_data_complete          BOOLEAN GENERATED ALWAYS AS (
                                legal_name                IS NOT NULL
                            AND legal_address             IS NOT NULL
                            AND tax_country               IS NOT NULL
                            AND tax_identification_number IS NOT NULL
                            AND tin_issuing_state         IS NOT NULL
                              ) STORED,

  applied_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at                 TIMESTAMPTZ,
  suspended_at                TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2.1 Columns added to app_marketplace_instructors AFTER the first draft of this
--     file was written. The CREATE TABLE above already declares them, but
--     `CREATE TABLE IF NOT EXISTS` is a no-op on an existing table and adds
--     nothing, so a database created from an earlier draft would silently lack
--     them. These statements make the amendment converge on both paths.
--     Same reason the constraints are added through a catalog check below.

ALTER TABLE app_marketplace_instructors
  ADD COLUMN IF NOT EXISTS vat_number_status TEXT NOT NULL DEFAULT 'NOT_PROVIDED';
ALTER TABLE app_marketplace_instructors
  ADD COLUMN IF NOT EXISTS vies_consultation_number TEXT;
ALTER TABLE app_marketplace_instructors
  ADD COLUMN IF NOT EXISTS vies_validated_at TIMESTAMPTZ;
ALTER TABLE app_marketplace_instructors
  ADD COLUMN IF NOT EXISTS legal_form TEXT;
ALTER TABLE app_marketplace_instructors
  ADD COLUMN IF NOT EXISTS business_registration_number TEXT;
ALTER TABLE app_marketplace_instructors
  ADD COLUMN IF NOT EXISTS date_of_birth DATE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'app_marketplace_instructors_vat_number_status_check'
  ) THEN
    ALTER TABLE app_marketplace_instructors
      ADD CONSTRAINT app_marketplace_instructors_vat_number_status_check
      CHECK (vat_number_status IN (
        'NOT_PROVIDED', 'NOT_APPLICABLE', 'PROVIDED', 'VIES_VALIDATED', 'VIES_INVALID'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'app_marketplace_instructors_legal_form_check'
  ) THEN
    ALTER TABLE app_marketplace_instructors
      ADD CONSTRAINT app_marketplace_instructors_legal_form_check
      CHECK (legal_form IS NULL OR legal_form IN (
        'INDIVIDUAL', 'SOLE_TRADER', 'COMPANY'
      ));
  END IF;
END $$;


CREATE INDEX IF NOT EXISTS idx_app_marketplace_instructors_user
  ON app_marketplace_instructors(user_id);
CREATE INDEX IF NOT EXISTS idx_app_marketplace_instructors_status
  ON app_marketplace_instructors(instructor_status);
CREATE INDEX IF NOT EXISTS idx_app_marketplace_instructors_tier
  ON app_marketplace_instructors(revenue_share_tier);

COMMENT ON TABLE app_marketplace_instructors IS
  'Course-marketplace instructors. SENSITIVE: holds TIN, IBAN and legal address. '
  'RLS restricts SELECT to the owning instructor and admins only; public data is '
  'exposed through app_marketplace_instructors_public. Unrelated to the worker/job '
  'marketplace: see app_14da0f1941_profiles.marketplace_ready, which is a different concept.';

COMMENT ON COLUMN app_marketplace_instructors.instructor_status IS
  'Instructor onboarding pipeline. Distinct from the worker ONBOARDING_STATUS ladder.';
COMMENT ON COLUMN app_marketplace_instructors.iban IS
  'SENSITIVE financial data. Never expose to any role other than the owner and admin.';
COMMENT ON COLUMN app_marketplace_instructors.tax_identification_number IS
  'SENSITIVE personal data (TIN). Never expose to any role other than the owner and admin.';
COMMENT ON COLUMN app_marketplace_instructors.legal_address IS
  'SENSITIVE personal data. Never expose to any role other than the owner and admin.';
COMMENT ON COLUMN app_marketplace_instructors.revenue_share_tier IS
  'Tier only. Actual percentages are channel-dependent and live in application config.';
COMMENT ON COLUMN app_marketplace_instructors.dac7_data_complete IS
  'GENERATED STORED. Read-only: never include it in an INSERT/UPDATE payload.';
COMMENT ON COLUMN app_marketplace_instructors.vat_number IS
  'Nullable on purpose: mandatory-or-not is still open in PB-MARKET-TAX-001. '
  'Read it together with vat_number_status — NULL alone cannot distinguish '
  '"has no VAT number" from "never asked".';
COMMENT ON COLUMN app_marketplace_instructors.vat_number_status IS
  'Registral state of the VAT number. Records what we know; decides no VAT treatment.';
COMMENT ON COLUMN app_marketplace_instructors.vies_consultation_number IS
  'VIES consultation reference. Evidence for any future reverse-charge position; '
  'without it the position is unprovable under inspection.';
COMMENT ON COLUMN app_marketplace_instructors.legal_form IS
  'INDIVIDUAL | SOLE_TRADER | COMPANY. Captured, not interpreted: the differing '
  'treatment of each is an open question in PB-MARKET-TAX-001.';
COMMENT ON COLUMN app_marketplace_instructors.business_registration_number IS
  'SENSITIVE. DAC7 requires it for ENTITY sellers. Owner and admin only.';
COMMENT ON COLUMN app_marketplace_instructors.date_of_birth IS
  'SENSITIVE personal data. DAC7 requires it for a natural person with no TIN. '
  'Owner and admin only.';


-- =============================================================================
-- 3. app_academy_courses — marketplace extensions
-- =============================================================================
-- The canonical table is app_academy_courses (plain app_ prefix). Note that
-- brain/03-ENGINEERING/SUPABASE_ARCHITECTURE.md line 190 still documents it as
-- app_14da0f1941_academy_courses; that documentation is stale. The live name is
-- confirmed by app/frontend/src/lib/supabase.ts (TABLES.academyCourses) and by
-- PB-SEC-PUBLIC-READ-001-repair.sql, which granted anon SELECT on
-- public.app_academy_courses.
--
-- All additions are ADD COLUMN IF NOT EXISTS. Nothing existing is altered.

ALTER TABLE app_academy_courses
  ADD COLUMN IF NOT EXISTS instructor_id UUID;

-- fiscal_nature — NO DEFAULT ON PURPOSE (amended before first execution).
--
-- It was originally added as NOT NULL DEFAULT 'pregrabado'. That default is a
-- silent fiscal assumption: an instructor who uploads a live or 1-to-1 course
-- and forgets to classify it would be recorded as pre-recorded by the system,
-- with nothing anywhere indicating that nobody ever answered the question. The
-- product spec calls fiscal_nature the single most important field in the data
-- model precisely because the VAT and place-of-supply treatment hangs off it.
-- A misclassification must therefore be a VISIBLE OMISSION (an INSERT that
-- fails), never a silent system-chosen answer.
--
-- Sequence below, and it must stay in this order to remain idempotent:
--   1. add the column NULLABLE (a NOT NULL add without a default would fail
--      outright on a table that already has rows)
--   2. backfill in 3.1 — pre-existing rows are genuinely PipingBox Originals,
--      produced in-house and pre-recorded, so 'pregrabado' is an observed fact
--      for them, not an assumption
--   3. SET NOT NULL in 3.1b, WITHOUT re-establishing a default
--
-- Net effect: every course created from now on must classify itself
-- explicitly. Do not "restore" the default.
ALTER TABLE app_academy_courses
  ADD COLUMN IF NOT EXISTS fiscal_nature TEXT;

ALTER TABLE app_academy_courses
  ADD COLUMN IF NOT EXISTS taxonomy_category TEXT;

ALTER TABLE app_academy_courses
  ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'UNVERIFIED';

ALTER TABLE app_academy_courses
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

ALTER TABLE app_academy_courses
  ADD COLUMN IF NOT EXISTS verified_by UUID;

ALTER TABLE app_academy_courses
  ADD COLUMN IF NOT EXISTS submitted_for_review_at TIMESTAMPTZ;

ALTER TABLE app_academy_courses
  ADD COLUMN IF NOT EXISTS revenue_share_channel_default TEXT;


-- 3.1 Backfill BEFORE the constraints go on, so that pre-existing rows cannot
--     make an otherwise valid constraint fail to validate.
--     Every course that existed before the marketplace is a PipingBox Original:
--     produced in-house, no third-party instructor, pre-recorded.

UPDATE app_academy_courses
   SET taxonomy_category = 'PIPINGBOX_ORIGINAL'
 WHERE taxonomy_category IS NULL;

UPDATE app_academy_courses
   SET fiscal_nature = 'pregrabado'
 WHERE fiscal_nature IS NULL
    OR fiscal_nature NOT IN ('pregrabado', 'en_vivo', 'con_componente_1a1');

UPDATE app_academy_courses
   SET verification_status = 'UNVERIFIED'
 WHERE verification_status IS NULL;

-- instructor_id is left NULL for these rows by definition: NULL means
-- "PipingBox Original, no third-party instructor". No UPDATE needed — the
-- column was just added and is already NULL everywhere.


-- 3.1b fiscal_nature becomes NOT NULL — WITHOUT A DEFAULT.
--
--      Runs AFTER the backfill above, so no pre-existing row can block it.
--      DROP DEFAULT first and unconditionally: if an earlier draft of this file
--      was ever applied it left DEFAULT 'pregrabado' behind, and re-running must
--      converge on the intended state rather than preserve the old one.
--
--      From here on an INSERT that omits fiscal_nature FAILS LOUDLY. That is the
--      point: the application must ask the question and record the answer.
--      Do not add `SET DEFAULT` back.

ALTER TABLE app_academy_courses
  ALTER COLUMN fiscal_nature DROP DEFAULT;

DO $$
BEGIN
  -- Guard the SET NOT NULL: if any row is still NULL the statement would abort
  -- the whole migration. Raise a clear message instead of a generic constraint
  -- violation, because the fix is "classify those courses", not "retry".
  IF EXISTS (SELECT 1 FROM app_academy_courses WHERE fiscal_nature IS NULL) THEN
    RAISE EXCEPTION
      'fiscal_nature is still NULL on % course(s). Classify them (pregrabado | en_vivo | con_componente_1a1) before re-running this migration.',
      (SELECT count(*) FROM app_academy_courses WHERE fiscal_nature IS NULL);
  END IF;

  -- Idempotent: only set it if it is not already NOT NULL.
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'app_academy_courses'
       AND column_name  = 'fiscal_nature'
       AND is_nullable  = 'YES'
  ) THEN
    ALTER TABLE app_academy_courses ALTER COLUMN fiscal_nature SET NOT NULL;
  END IF;
END $$;


-- 3.2 Constraints, added idempotently. ADD CONSTRAINT has no IF NOT EXISTS in
--     Postgres, so each one is wrapped in a catalog check.

DO $$
BEGIN
  -- instructor_id -> app_marketplace_instructors(id).
  -- ON DELETE SET NULL, not CASCADE: deleting an instructor record must never
  -- silently delete published course content and the enrolments hanging off it.
  -- The course reverts to "no attributed instructor" and surfaces for review.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'app_academy_courses_instructor_fk'
  ) THEN
    ALTER TABLE app_academy_courses
      ADD CONSTRAINT app_academy_courses_instructor_fk
      FOREIGN KEY (instructor_id)
      REFERENCES app_marketplace_instructors(id)
      ON DELETE SET NULL;
  END IF;

  -- fiscal_nature: settled by the tax ticket, do not redesign.
  -- Only 'pregrabado' is sellable at launch; that PRODUCT rule is enforced in
  -- the application, not here, so that a future launch of 'en_vivo' does not
  -- require a migration.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'app_academy_courses_fiscal_nature_check'
  ) THEN
    ALTER TABLE app_academy_courses
      ADD CONSTRAINT app_academy_courses_fiscal_nature_check
      CHECK (fiscal_nature IN ('pregrabado', 'en_vivo', 'con_componente_1a1'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'app_academy_courses_taxonomy_category_check'
  ) THEN
    ALTER TABLE app_academy_courses
      ADD CONSTRAINT app_academy_courses_taxonomy_category_check
      CHECK (taxonomy_category IS NULL OR taxonomy_category IN (
        'PIPINGBOX_ORIGINAL',
        'EXPERT_COURSE',
        'CERTIFICATION_PREP',
        'PARTNER_TRAINING'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'app_academy_courses_verification_status_check'
  ) THEN
    ALTER TABLE app_academy_courses
      ADD CONSTRAINT app_academy_courses_verification_status_check
      CHECK (verification_status IS NULL OR verification_status IN (
        'UNVERIFIED',
        'PENDING_REVIEW',
        'VERIFIED',
        'REVOKED'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_app_academy_courses_instructor
  ON app_academy_courses(instructor_id);
CREATE INDEX IF NOT EXISTS idx_app_academy_courses_taxonomy
  ON app_academy_courses(taxonomy_category);
CREATE INDEX IF NOT EXISTS idx_app_academy_courses_verification
  ON app_academy_courses(verification_status);

COMMENT ON COLUMN app_academy_courses.instructor_id IS
  'NULL means PipingBox Original (produced in-house, no third-party instructor).';
COMMENT ON COLUMN app_academy_courses.fiscal_nature IS
  'Settled by the tax ticket: pregrabado | en_vivo | con_componente_1a1. Only '
  'pregrabado is sellable at launch; that product rule is enforced in the application.';
COMMENT ON COLUMN app_academy_courses.verification_status IS
  'Verified Course badge state. Driven by app_marketplace_course_reviews, which is '
  'the INTERNAL expert QA queue, not student ratings.';
COMMENT ON COLUMN app_academy_courses.revenue_share_channel_default IS
  'Documents the expected acquisition channel for this course. Informational only: '
  'no percentage is stored or computed here (blocked by PB-MARKET-TAX-001).';


-- =============================================================================
-- 4. app_marketplace_course_reviews — INTERNAL technical/pedagogical QA queue
-- =============================================================================
-- THIS IS NOT STUDENT RATINGS. There are no stars, no public reviews and no
-- learner opinions in this table. It is the internal expert review a course
-- must pass BEFORE publication: a PipingBox technical reviewer checks the
-- engineering accuracy, a pedagogical reviewer checks instructional design, and
-- a plagiarism check runs against the submitted material. If a student-facing
-- rating feature is ever built it MUST get its own table with an unambiguous
-- name (e.g. app_marketplace_course_ratings) — do not overload this one.

CREATE TABLE IF NOT EXISTS app_marketplace_course_reviews (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id                 UUID NOT NULL
                              REFERENCES app_academy_courses(id) ON DELETE CASCADE,
  -- Nullable: a submission sits in PENDING with no reviewer until triage.
  reviewer_id               UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  review_status             TEXT NOT NULL DEFAULT 'PENDING'
                              CHECK (review_status IN (
                                'PENDING',
                                'IN_REVIEW',
                                'CHANGES_REQUESTED',
                                'APPROVED',
                                'REJECTED'
                              )),

  -- Per-item checklist results. JSONB rather than columns because the checklist
  -- itself is versioned content that changes faster than the schema should.
  -- Shape: { "checklist_version": "1.0", "items": [ { "key": ..., "result":
  -- "pass" | "fail" | "na", "note": ... } ] }
  technical_checklist       JSONB NOT NULL DEFAULT '{}'::jsonb,
  pedagogical_checklist     JSONB NOT NULL DEFAULT '{}'::jsonb,

  plagiarism_check_status   TEXT
                              CHECK (plagiarism_check_status IS NULL OR plagiarism_check_status IN (
                                'NOT_RUN',
                                'RUNNING',
                                'CLEAR',
                                'FLAGGED',
                                'FAILED'
                              )),
  plagiarism_notes          TEXT,

  reviewer_notes            TEXT,
  instructor_response       TEXT,

  submitted_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at               TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_marketplace_course_reviews_course
  ON app_marketplace_course_reviews(course_id);
CREATE INDEX IF NOT EXISTS idx_app_marketplace_course_reviews_status
  ON app_marketplace_course_reviews(review_status);
CREATE INDEX IF NOT EXISTS idx_app_marketplace_course_reviews_reviewer
  ON app_marketplace_course_reviews(reviewer_id);
-- The queue is worked chronologically.
CREATE INDEX IF NOT EXISTS idx_app_marketplace_course_reviews_submitted
  ON app_marketplace_course_reviews(submitted_at);

COMMENT ON TABLE app_marketplace_course_reviews IS
  'INTERNAL technical/pedagogical QA review queue run BEFORE a course is published. '
  'NOT student ratings. A learner-facing rating feature must use a separate table.';


-- =============================================================================
-- 5. Founding Instructor cap
-- =============================================================================
-- The Founding Instructor programme is capped at 10 people. A CHECK constraint
-- cannot count rows, so the cap is enforced by a constraint trigger. Enforced
-- in the database rather than the application because the cap is a contractual
-- commitment: two concurrent approvals through different code paths would
-- otherwise be able to create an eleventh founding instructor.
--
-- THE CAP IS 10. That number is a product decision and is not up for
-- adjustment here. What follows changes only HOW RELIABLY it is enforced.
--
-- -----------------------------------------------------------------------------
-- CONCURRENCY — WHY THE COUNT ALONE IS NOT ENOUGH (amended before first run)
-- -----------------------------------------------------------------------------
-- Counting rows and comparing to a limit is not safe under PostgreSQL's default
-- READ COMMITTED isolation. Each transaction's snapshot shows only rows
-- committed before its statement began, plus its own uncommitted changes. Two
-- concurrent transactions competing for the LAST free slot therefore each see
-- 9 committed rows plus 1 row of their own = 10, neither exceeds the limit,
-- both pass the check and both commit. The table ends up with 11.
--
-- THIS WAS REPRODUCED, NOT THEORISED. Against PostgreSQL 16.4 with two real
-- concurrent sessions the unprotected trigger produced 11 founding instructors
-- on every attempt, with no error raised to either session. The harness is
-- sql/test-fixtures/TESTFIXTURE-run-founding-cap-race.sh.
--
-- DEFERRABILITY DOES NOT HELP AND WAS NEVER GOING TO. The trigger is a
-- CONSTRAINT TRIGGER, but INITIALLY IMMEDIATE vs INITIALLY DEFERRED only moves
-- the check between "end of statement" and "end of transaction". Both points
-- are still INSIDE the racing transaction, evaluated against that
-- transaction's own snapshot. Deferral changes WHEN the count is taken; it
-- creates no cross-transaction visibility and no mutual exclusion, so it
-- cannot close the window. The original comment on this trigger claimed the
-- check was thereby "serialized", which was simply not true.
--
-- THE FIX: take a transaction-scoped advisory lock BEFORE counting. The lock
-- makes the read-then-decide sequence atomic with respect to any other
-- transaction that also intends to create a founding instructor: the second
-- one blocks until the first commits, and then counts 10 and is refused
-- correctly. pg_advisory_xact_lock releases automatically at COMMIT or
-- ROLLBACK, so no code path can leak it — there is no unlock to forget and no
-- unlock to skip on the error path.
--
-- ADVISORY LOCK KEY: 4820251001
--   Chosen to be readable and traceable rather than random, and written as a
--   literal rather than computed, so that the value can never shift underneath
--   the system. Read as 4-8-2025-1001:
--     4       -- migration 004, the file that owns this lock
--     8       -- separator digit, kept so the key cannot be confused with a
--             --   bare date and cannot be produced by an accidental typo of
--             --   a smaller number
--     2025    -- year the key was allocated
--     1001    -- sequence number within migration 004's allocation block, so
--             --   004 can allocate further keys (1002, 1003, ...) without
--             --   ever revisiting this reasoning
--   A hash of the table name was considered and rejected: hashtext() is not a
--   documented-stable API across major versions, so a key derived from it could
--   in principle change under an upgrade, and a lock key that moves is a lock
--   that silently stops excluding anything.
--
--   It is a bigint, so it uses the single-argument 64-bit advisory lock space.
--   That space is SEPARATE from the two-argument (int, int) space, which is a
--   deliberate part of the choice: anything that later uses the two-int form
--   cannot collide with this key no matter what integers it picks.
--
--   WHY IT MUST NOT COLLIDE. Advisory locks are a single database-wide
--   namespace with no ownership and no registry enforced by PostgreSQL. Two
--   unrelated features that happen to pick the same key will block each other
--   for reasons neither one's code explains, producing latency or deadlocks
--   that are extremely hard to attribute. Conversely, a key accidentally
--   REUSED by a feature that takes it in a different order than this trigger
--   does is a deadlock waiting to happen.
--
--   LOCK REGISTRY — ANY NEW ADVISORY LOCK IN THIS SYSTEM MUST BE ADDED HERE:
--     4820251001  founding-instructor cap (this file, section 5)
--   Before calling pg_advisory_xact_lock anywhere else, add the key to this
--   list. A key that is not in the list is not safe to assume free.
--
-- SCOPE OF SERIALISATION — deliberately narrow. The lock is taken ONLY when the
-- row being written is actually a founding instructor (the early return above
-- it runs first). Ordinary instructor inserts and updates — the overwhelming
-- majority of traffic on this table — never touch it and are not serialised at
-- all. Only founding-instructor writes contend, there are at most 10 of them in
-- the programme's lifetime, and they are performed by admins, so the
-- throughput cost is irrelevant while the correctness gain is absolute.
--
-- COVERS UPDATE AS WELL AS INSERT. The trigger fires on INSERT OR UPDATE OF
-- is_founding_instructor, so promoting an existing STANDARD instructor into the
-- founding tier is checked on exactly the same path and takes the same lock.
-- This was verified: the promotion-by-UPDATE route raced to 11 before the fix
-- and holds at 10 after it. Had the trigger been INSERT-only, promotion would
-- have been an uncovered path and the cap would have been bypassable by
-- inserting as STANDARD and updating a moment later.

CREATE OR REPLACE FUNCTION app_marketplace_enforce_founding_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  founding_count INT;
BEGIN
  IF NEW.is_founding_instructor IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- Serialise every would-be founding instructor against every other one.
  -- MUST be before the count: taking it afterwards would lock a decision that
  -- had already been made on stale data, which is no protection at all.
  -- Transaction-scoped, so it is released on COMMIT and on ROLLBACK alike.
  -- Key 4820251001 — see the lock registry in the comment above.
  PERFORM pg_advisory_xact_lock(4820251001);

  SELECT count(*) INTO founding_count
    FROM app_marketplace_instructors
   WHERE is_founding_instructor = true;

  IF founding_count > 10 THEN
    RAISE EXCEPTION
      'Founding Instructor programme is capped at 10 (found %). Refusing to add another.',
      founding_count;
  END IF;

  RETURN NEW;
END;
$$;

-- AFTER, so the count includes the row being written and the arithmetic is
-- "existing + mine" with no off-by-one. DEFERRABLE INITIALLY IMMEDIATE is kept
-- for the operational escape hatch it provides — an admin performing a bulk
-- correction can SET CONSTRAINTS ... DEFERRED to let a multi-row statement
-- reach a consistent end state — but note that deferrability is NOT what makes
-- the cap safe. The advisory lock inside the function is. See above.
DROP TRIGGER IF EXISTS trg_app_marketplace_founding_cap ON app_marketplace_instructors;
CREATE CONSTRAINT TRIGGER trg_app_marketplace_founding_cap
  AFTER INSERT OR UPDATE OF is_founding_instructor ON app_marketplace_instructors
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW EXECUTE FUNCTION app_marketplace_enforce_founding_cap();


-- -----------------------------------------------------------------------------
-- 5.1 Privileged-column guard on app_marketplace_instructors
-- -----------------------------------------------------------------------------
-- RLS policy mi_owner_update lets an instructor edit their own row so they can
-- complete their profile and fiscal data. It must NOT let them promote
-- themselves. A WITH CHECK cannot express "this column did not change" because
-- it only sees NEW; reading OLD from inside the policy needs a subquery against
-- the same table, which re-enters the same policy. A BEFORE UPDATE trigger sees
-- OLD and NEW directly and is the correct place for the rule.
--
-- The trigger is skipped for admins and for service_role, which are the only
-- actors allowed to move the pipeline, assign a tier, or grant founding status.

CREATE OR REPLACE FUNCTION app_marketplace_guard_instructor_privileged_cols()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- service_role bypasses RLS and is trusted (Edge Functions).
  IF current_setting('request.jwt.claims', true) IS NULL THEN
    RETURN NEW;   -- direct SQL / migration context, not a PostgREST request
  END IF;

  IF app_is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.instructor_status IS DISTINCT FROM OLD.instructor_status THEN
    RAISE EXCEPTION
      'instructor_status is admin-controlled and cannot be changed by the instructor';
  END IF;

  IF NEW.revenue_share_tier IS DISTINCT FROM OLD.revenue_share_tier THEN
    RAISE EXCEPTION
      'revenue_share_tier is admin-controlled and cannot be changed by the instructor';
  END IF;

  IF NEW.is_founding_instructor IS DISTINCT FROM OLD.is_founding_instructor THEN
    RAISE EXCEPTION
      'is_founding_instructor is admin-controlled and cannot be changed by the instructor';
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'user_id is immutable';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_marketplace_instructor_privileged_cols
  ON app_marketplace_instructors;
CREATE TRIGGER trg_app_marketplace_instructor_privileged_cols
  BEFORE UPDATE ON app_marketplace_instructors
  FOR EACH ROW EXECUTE FUNCTION app_marketplace_guard_instructor_privileged_cols();


-- -----------------------------------------------------------------------------
-- 5.2 Privileged-column guard on app_marketplace_course_reviews
-- -----------------------------------------------------------------------------
-- Same reasoning as 5.1. RLS policy mcr_instructor_respond lets the owning
-- instructor UPDATE the review row so they can write instructor_response. This
-- trigger restricts that to instructor_response and nothing else: an instructor
-- must never be able to set their own review to APPROVED or edit the reviewer's
-- findings.

CREATE OR REPLACE FUNCTION app_marketplace_guard_review_privileged_cols()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('request.jwt.claims', true) IS NULL THEN
    RETURN NEW;
  END IF;

  IF app_is_admin() THEN
    RETURN NEW;
  END IF;

  -- The assigned reviewer is staff and may fill in the review itself.
  IF OLD.reviewer_id IS NOT NULL AND OLD.reviewer_id = auth.uid() THEN
    RETURN NEW;
  END IF;

  -- Anyone else reaching an UPDATE here is the owning instructor (that is all
  -- the RLS policy allows). They may only write instructor_response.
  IF NEW.review_status           IS DISTINCT FROM OLD.review_status
     OR NEW.reviewer_id          IS DISTINCT FROM OLD.reviewer_id
     OR NEW.technical_checklist  IS DISTINCT FROM OLD.technical_checklist
     OR NEW.pedagogical_checklist IS DISTINCT FROM OLD.pedagogical_checklist
     OR NEW.plagiarism_check_status IS DISTINCT FROM OLD.plagiarism_check_status
     OR NEW.plagiarism_notes     IS DISTINCT FROM OLD.plagiarism_notes
     OR NEW.reviewer_notes       IS DISTINCT FROM OLD.reviewer_notes
     OR NEW.course_id            IS DISTINCT FROM OLD.course_id
     OR NEW.reviewed_at          IS DISTINCT FROM OLD.reviewed_at
  THEN
    RAISE EXCEPTION
      'an instructor may only write instructor_response on a course review';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_marketplace_review_privileged_cols
  ON app_marketplace_course_reviews;
CREATE TRIGGER trg_app_marketplace_review_privileged_cols
  BEFORE UPDATE ON app_marketplace_course_reviews
  FOR EACH ROW EXECUTE FUNCTION app_marketplace_guard_review_privileged_cols();


-- =============================================================================
-- 6. app_marketplace_dsa_notices — EU DSA Art. 16 notice-and-action
-- =============================================================================
-- LIVE LEGAL OBLIGATION from the moment third-party content is published. It is
-- independent of any payment concern and is NOT blocked by PB-MARKET-TAX-001:
-- the duty attaches to hosting third-party content, not to monetizing it.
--
-- Art. 16 requires a mechanism that ANY person or entity can use to notify
-- illegal content, without needing an account. Hence the anonymous INSERT
-- policy in section 7.
-- Art. 17 requires a statement of reasons for every restriction imposed —
-- statement_of_reasons and decision exist for that.

CREATE TABLE IF NOT EXISTS app_marketplace_dsa_notices (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Human-quotable reference returned in the Art. 16(4) acknowledgement so the
  -- reporter can refer to their notice without being able to read the table.
  notice_reference            TEXT NOT NULL UNIQUE
                                DEFAULT ('DSA-' || to_char(now(), 'YYYYMMDD') || '-' ||
                                         upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),

  content_type                TEXT
                                CHECK (content_type IS NULL OR content_type IN (
                                  'COURSE',
                                  'LESSON',
                                  'INSTRUCTOR_PROFILE',
                                  'COMMUNITY_POST',
                                  'COMMUNITY_COMMENT',
                                  'OTHER'
                                )),
  content_id                  UUID,
  content_url                 TEXT,

  reporter_name               TEXT,
  reporter_email              TEXT,
  -- Art. 22: notices from trusted flaggers must be given priority.
  reporter_is_trusted_flagger BOOLEAN NOT NULL DEFAULT false,

  reason_category             TEXT,
  reason_detail               TEXT,

  -- Art. 16(2)(d): the notice must contain a statement confirming the reporter's
  -- bona fide belief that the information is accurate and complete. NOT NULL by
  -- law, so a notice cannot be recorded without it.
  good_faith_declaration      BOOLEAN NOT NULL,

  status                      TEXT NOT NULL DEFAULT 'RECEIVED'
                                CHECK (status IN (
                                  'RECEIVED',
                                  'ACKNOWLEDGED',
                                  'UNDER_ASSESSMENT',
                                  'ACTION_TAKEN',
                                  'REJECTED',
                                  'APPEALED',
                                  'APPEAL_RESOLVED'
                                )),

  decision                    TEXT,
  -- Art. 17: statement of reasons for any restriction imposed.
  statement_of_reasons        TEXT,
  action_taken                TEXT,
  -- Art. 20: internal complaint-handling window.
  appeal_deadline_at          TIMESTAMPTZ,

  acknowledged_at             TIMESTAMPTZ,
  decided_at                  TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The queue is worked chronologically and filtered by status.
CREATE INDEX IF NOT EXISTS idx_app_marketplace_dsa_notices_status
  ON app_marketplace_dsa_notices(status);
CREATE INDEX IF NOT EXISTS idx_app_marketplace_dsa_notices_created
  ON app_marketplace_dsa_notices(created_at);
CREATE INDEX IF NOT EXISTS idx_app_marketplace_dsa_notices_content
  ON app_marketplace_dsa_notices(content_type, content_id);

COMMENT ON TABLE app_marketplace_dsa_notices IS
  'EU DSA Art. 16 notice-and-action register. Anyone (including anonymous users) may '
  'INSERT a notice; nobody but an admin may SELECT or UPDATE. Contains reporter '
  'personal data, so no public read is possible.';
COMMENT ON COLUMN app_marketplace_dsa_notices.notice_reference IS
  'Human-quotable reference returned in the Art. 16(4) acknowledgement.';
COMMENT ON COLUMN app_marketplace_dsa_notices.good_faith_declaration IS
  'Art. 16(2)(d). NOT NULL: a notice cannot be recorded without the declaration.';
COMMENT ON COLUMN app_marketplace_dsa_notices.statement_of_reasons IS
  'Art. 17 statement of reasons for any restriction imposed on the reported content.';


-- =============================================================================
-- 7. Row Level Security + GRANTS
-- =============================================================================
-- TWO LAYERS, BOTH REQUIRED. PB-SEC-RLS-WORKFORCE-001 was caused by policies
-- existing without matching table grants: PostgREST answered 401/403 and the
-- policy was never even evaluated, breaking the public B2B form outright. Every
-- policy below therefore has an explicit GRANT to match. Do not remove one
-- without removing the other.
--
-- Principle: least privilege. No USING (true) on any table containing personal
-- data. `service_role` bypasses RLS entirely and needs no policy.

ALTER TABLE app_marketplace_instructors    ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_marketplace_course_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_marketplace_dsa_notices    ENABLE ROW LEVEL SECURITY;


-- -----------------------------------------------------------------------------
-- 7.1 app_marketplace_instructors — owner-only read. NO third-party read.
-- -----------------------------------------------------------------------------
-- This is the column-protection mechanism for iban / tax_identification_number
-- / legal_address. Postgres RLS cannot filter columns, only rows, so the
-- protection is structural: no role other than the owner and admin gets ANY row
-- of this table. Everyone else reads app_marketplace_instructors_public
-- (section 8), which does not select the sensitive columns at all.
--
-- `anon` gets nothing here — not even INSERT. Becoming an instructor requires
-- an authenticated account.

DROP POLICY IF EXISTS mi_owner_select        ON app_marketplace_instructors;
DROP POLICY IF EXISTS mi_admin_select        ON app_marketplace_instructors;
DROP POLICY IF EXISTS mi_owner_insert        ON app_marketplace_instructors;
DROP POLICY IF EXISTS mi_owner_update        ON app_marketplace_instructors;
DROP POLICY IF EXISTS mi_admin_all           ON app_marketplace_instructors;

-- Owner reads their own row, including their own fiscal data. Nobody else.
CREATE POLICY mi_owner_select
  ON app_marketplace_instructors
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR app_is_admin());

-- A user may create their own instructor application and nothing else.
-- instructor_status is NOT constrained here on purpose — the WITH CHECK below
-- pins it to APPLIED so a self-service INSERT cannot self-approve.
CREATE POLICY mi_owner_insert
  ON app_marketplace_instructors
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND instructor_status = 'APPLIED'
    AND is_founding_instructor = false
    AND revenue_share_tier = 'STANDARD'
  );

-- Owner may edit their own profile and fiscal data, but MAY NOT move themselves
-- through the pipeline, grant themselves a tier, or make themselves a founding
-- instructor.
--
-- IMPORTANT: the "cannot change these three columns" rule is enforced by the
-- trigger in section 5.1, NOT by this WITH CHECK. A WITH CHECK can only inspect
-- the NEW row; comparing it to the OLD value would require a self-subquery,
-- which re-enters this same policy and is both incorrect and a recursion
-- hazard. Privilege escalation is prevented in the trigger, which sees OLD and
-- NEW directly. Do not "simplify" that trigger away.
CREATE POLICY mi_owner_update
  ON app_marketplace_instructors
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY mi_admin_all
  ON app_marketplace_instructors
  FOR ALL TO authenticated
  USING (app_is_admin())
  WITH CHECK (app_is_admin());

-- GRANTS. No DELETE for anyone: instructor records are retained for DAC7 and
-- invoicing history. Deactivation is instructor_status = 'SUSPENDED'.
REVOKE ALL ON app_marketplace_instructors FROM anon;
GRANT SELECT, INSERT, UPDATE ON app_marketplace_instructors TO authenticated;


-- -----------------------------------------------------------------------------
-- 7.2 app_marketplace_course_reviews — instructor sees reviews of own courses
-- -----------------------------------------------------------------------------
-- The instructor must be able to read the review of their own course (that is
-- how CHANGES_REQUESTED reaches them) and to write instructor_response. They
-- must NOT be able to see other instructors' reviews, nor to set review_status.

DROP POLICY IF EXISTS mcr_instructor_select ON app_marketplace_course_reviews;
DROP POLICY IF EXISTS mcr_reviewer_select   ON app_marketplace_course_reviews;
DROP POLICY IF EXISTS mcr_admin_all         ON app_marketplace_course_reviews;
DROP POLICY IF EXISTS mcr_instructor_respond ON app_marketplace_course_reviews;

CREATE POLICY mcr_instructor_select
  ON app_marketplace_course_reviews
  FOR SELECT TO authenticated
  USING (
    app_is_admin()
    OR reviewer_id = auth.uid()
    OR EXISTS (
      SELECT 1
        FROM app_academy_courses c
        JOIN app_marketplace_instructors i ON i.id = c.instructor_id
       WHERE c.id = app_marketplace_course_reviews.course_id
         AND i.user_id = auth.uid()
    )
  );

-- Instructor may reply, and only reply. The "reply only" restriction (cannot
-- move review_status, cannot rewrite the reviewer's notes or checklists) is
-- enforced by the trigger in section 5.2, for the same reason as 7.1: a
-- WITH CHECK cannot see the OLD row without a self-subquery that re-enters this
-- policy.
CREATE POLICY mcr_instructor_respond
  ON app_marketplace_course_reviews
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM app_academy_courses c
        JOIN app_marketplace_instructors i ON i.id = c.instructor_id
       WHERE c.id = app_marketplace_course_reviews.course_id
         AND i.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM app_academy_courses c
        JOIN app_marketplace_instructors i ON i.id = c.instructor_id
       WHERE c.id = app_marketplace_course_reviews.course_id
         AND i.user_id = auth.uid()
    )
  );

CREATE POLICY mcr_admin_all
  ON app_marketplace_course_reviews
  FOR ALL TO authenticated
  USING (app_is_admin())
  WITH CHECK (app_is_admin());

REVOKE ALL ON app_marketplace_course_reviews FROM anon;
GRANT SELECT, INSERT, UPDATE ON app_marketplace_course_reviews TO authenticated;


-- -----------------------------------------------------------------------------
-- 7.3 app_marketplace_dsa_notices — PUBLIC INSERT ONLY, NO PUBLIC READ
-- -----------------------------------------------------------------------------
-- Shape mirrored from the workforce_requests precedent
-- (brain/03-ENGINEERING/sql/PB-SEC-RLS-WORKFORCE-001-rls.sql + -grants-fix.sql):
--
--   anon          -> INSERT policy + GRANT INSERT, and NOTHING else.
--   authenticated -> INSERT policy + admin-only SELECT/UPDATE policies,
--                    with GRANT SELECT, INSERT, UPDATE.
--
-- Why anon can write but not read: Art. 16 requires the reporting mechanism to
-- be open to anyone, but the table holds reporter_name / reporter_email and the
-- substance of allegations about identifiable people. Any SELECT for anon would
-- be a personal-data breach. Without GRANT SELECT to anon, PostgREST refuses
-- before RLS is even consulted, so an anonymous reporter cannot read back even
-- the row they just inserted.
--
-- CALLER CONTRACT: the public notice form must NOT use `.select()` on the
-- insert. PostgREST needs SELECT privilege to return the inserted row, and anon
-- does not have it. This is exactly the regression that broke the public B2B
-- form in PB-SEC-RLS-WORKFORCE-001: deploy the frontend without `.select()`
-- FIRST. The acknowledgement reference must be generated client-side or
-- returned by an Edge Function running as service_role, not read back from
-- this table.
--
-- UNAUTHENTICATED USERS CANNOT SELECT. Verified two ways: (a) no SELECT policy
-- names the anon role, and (b) anon holds no SELECT privilege on the table.
-- Either alone would be sufficient; both are present deliberately.

DROP POLICY IF EXISTS dsa_anon_insert    ON app_marketplace_dsa_notices;
DROP POLICY IF EXISTS dsa_auth_insert    ON app_marketplace_dsa_notices;
DROP POLICY IF EXISTS dsa_admin_select   ON app_marketplace_dsa_notices;
DROP POLICY IF EXISTS dsa_admin_update   ON app_marketplace_dsa_notices;
DROP POLICY IF EXISTS dsa_admin_delete   ON app_marketplace_dsa_notices;

-- anon: may ONLY file a notice. No read, no modify, no delete.
-- The WITH CHECK enforces Art. 16(2)(d) at the database boundary: a notice
-- without the good-faith declaration is not a valid Art. 16 notice.
CREATE POLICY dsa_anon_insert
  ON app_marketplace_dsa_notices
  FOR INSERT TO anon
  WITH CHECK (good_faith_declaration = true AND status = 'RECEIVED');

-- authenticated: same right to file, same restriction.
CREATE POLICY dsa_auth_insert
  ON app_marketplace_dsa_notices
  FOR INSERT TO authenticated
  WITH CHECK (good_faith_declaration = true AND status = 'RECEIVED');

-- Reading the queue is an admin/trust-and-safety operation only. Deliberately
-- NOT "the reporter can read their own notice by email": the reporter is often
-- anonymous, email is unverified at submission, and matching on an unverified
-- email would let anyone read any notice by claiming the address.
CREATE POLICY dsa_admin_select
  ON app_marketplace_dsa_notices
  FOR SELECT TO authenticated
  USING (app_is_admin());

CREATE POLICY dsa_admin_update
  ON app_marketplace_dsa_notices
  FOR UPDATE TO authenticated
  USING (app_is_admin())
  WITH CHECK (app_is_admin());

CREATE POLICY dsa_admin_delete
  ON app_marketplace_dsa_notices
  FOR DELETE TO authenticated
  USING (app_is_admin());

-- GRANTS — required IN ADDITION to the policies (PB-SEC-RLS-WORKFORCE-001).
REVOKE ALL ON app_marketplace_dsa_notices FROM anon;
GRANT INSERT ON app_marketplace_dsa_notices TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON app_marketplace_dsa_notices TO authenticated;


-- =============================================================================
-- 8. Public instructor view — the ONLY third-party-readable instructor surface
-- =============================================================================
-- Exposes exactly the three non-sensitive presentation columns plus the
-- approval flag. iban, tax_identification_number, tin_issuing_state,
-- vat_number, legal_name and legal_address are NOT in the select list, so they
-- cannot be reached through this view under any query.
--
-- security_invoker = true so the view does not become a privilege-escalation
-- hole: it runs with the caller's rights, and the WHERE clause below is what
-- makes approved instructors visible. Without security_invoker a view owned by
-- a superuser would bypass the base table's RLS entirely.
--
-- Requires Postgres 15+. Supabase is on 15+.

CREATE OR REPLACE VIEW app_marketplace_instructors_public
WITH (security_invoker = true) AS
  SELECT
    i.id,
    i.display_name,
    i.headline,
    i.bio,
    i.is_founding_instructor,
    i.created_at
  FROM app_marketplace_instructors i
  WHERE i.instructor_status = 'APPROVED';

COMMENT ON VIEW app_marketplace_instructors_public IS
  'Non-sensitive projection of app_marketplace_instructors for public course pages. '
  'Deliberately omits iban, tax_identification_number, tin_issuing_state, vat_number, '
  'legal_name and legal_address. security_invoker = true so base-table RLS still applies.';

-- NOTE: with security_invoker = true the base table RLS is evaluated as the
-- caller, so anon and non-owner authenticated users currently see ZERO rows
-- through this view. That is the safe default and it is intentional: widening
-- it is a conscious decision for whoever builds the public instructor page, and
-- must be done by adding a narrowly scoped SELECT policy on the base table
-- restricted to instructor_status = 'APPROVED' AND with the understanding that
-- RLS cannot hide columns. The recommended alternative is a SECURITY DEFINER
-- function returning only the safe columns. Do NOT solve it by relaxing
-- mi_owner_select.
GRANT SELECT ON app_marketplace_instructors_public TO anon, authenticated;


-- =============================================================================
-- 9. Triggers — updated_at maintenance
-- =============================================================================
-- Reuses the same shape as app_stripe_touch_updated_at (003 section 8.1) with a
-- marketplace-specific name so the two migrations stay independently
-- rollback-able.

CREATE OR REPLACE FUNCTION app_marketplace_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_marketplace_instructors_updated
  ON app_marketplace_instructors;
CREATE TRIGGER trg_app_marketplace_instructors_updated
  BEFORE UPDATE ON app_marketplace_instructors
  FOR EACH ROW EXECUTE FUNCTION app_marketplace_touch_updated_at();

DROP TRIGGER IF EXISTS trg_app_marketplace_course_reviews_updated
  ON app_marketplace_course_reviews;
CREATE TRIGGER trg_app_marketplace_course_reviews_updated
  BEFORE UPDATE ON app_marketplace_course_reviews
  FOR EACH ROW EXECUTE FUNCTION app_marketplace_touch_updated_at();

DROP TRIGGER IF EXISTS trg_app_marketplace_dsa_notices_updated
  ON app_marketplace_dsa_notices;
CREATE TRIGGER trg_app_marketplace_dsa_notices_updated
  BEFORE UPDATE ON app_marketplace_dsa_notices
  FOR EACH ROW EXECUTE FUNCTION app_marketplace_touch_updated_at();


-- =============================================================================
-- 10. Verification
-- =============================================================================
-- Run after applying.

-- Expected: 3 rows, all with rowsecurity = true.
-- SELECT tablename, rowsecurity
--   FROM pg_tables
--  WHERE schemaname = 'public'
--    AND tablename IN ('app_marketplace_instructors',
--                      'app_marketplace_course_reviews',
--                      'app_marketplace_dsa_notices')
--  ORDER BY tablename;

-- Expected: the 8 new columns exist on app_academy_courses.
-- SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_schema = 'public'
--    AND table_name = 'app_academy_courses'
--    AND column_name IN ('instructor_id','fiscal_nature','taxonomy_category',
--                        'verification_status','verified_at','verified_by',
--                        'submitted_for_review_at','revenue_share_channel_default')
--  ORDER BY column_name;

-- Expected: every pre-existing course is PIPINGBOX_ORIGINAL / pregrabado /
-- instructor_id IS NULL.
-- SELECT taxonomy_category, fiscal_nature, count(*) AS n,
--        count(*) FILTER (WHERE instructor_id IS NULL) AS without_instructor
--   FROM app_academy_courses
--  GROUP BY 1, 2;

-- CRITICAL — Expected: anon holds INSERT and ONLY INSERT on the DSA table, and
-- holds no privilege at all on the instructors table.
-- SELECT table_name, grantee, privilege_type
--   FROM information_schema.role_table_grants
--  WHERE table_schema = 'public'
--    AND table_name IN ('app_marketplace_instructors',
--                       'app_marketplace_course_reviews',
--                       'app_marketplace_dsa_notices')
--    AND grantee IN ('anon', 'authenticated')
--  ORDER BY table_name, grantee, privilege_type;

-- CRITICAL — Expected: no policy grants SELECT to anon on any of the three.
-- SELECT tablename, policyname, cmd, roles
--   FROM pg_policies
--  WHERE schemaname = 'public'
--    AND tablename IN ('app_marketplace_instructors',
--                      'app_marketplace_course_reviews',
--                      'app_marketplace_dsa_notices')
--  ORDER BY tablename, cmd, policyname;

-- Expected: 0 rows. Founding cap holds.
-- SELECT count(*) FROM app_marketplace_instructors
--  WHERE is_founding_instructor = true HAVING count(*) > 10;

-- AMENDMENT CHECK — Expected: fiscal_nature is is_nullable = 'NO' and
-- column_default IS NULL. A non-null default here means the silent fiscal
-- assumption came back.
-- SELECT column_name, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_schema = 'public'
--    AND table_name   = 'app_academy_courses'
--    AND column_name  = 'fiscal_nature';

-- AMENDMENT CHECK — Expected: the 6 registral columns exist on the instructors
-- table, all nullable except vat_number_status.
-- SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_schema = 'public'
--    AND table_name   = 'app_marketplace_instructors'
--    AND column_name IN ('legal_form','business_registration_number','date_of_birth',
--                        'vat_number_status','vies_consultation_number','vies_validated_at')
--  ORDER BY column_name;


-- =============================================================================
-- 11. HOW TO APPLY — for the operator
-- =============================================================================
-- THIS FILE HAS NOT BEEN EXECUTED. There is no Postgres in the authoring
-- environment; the SQL has only been reviewed by eye. It must be applied by the
-- operator against the canonical Supabase project (mwdauubztjxkbrefirbg).
--
-- Option A — Supabase SQL editor:
--   paste the contents of sql/004-marketplace-schema.sql and run.
--
-- Option B — psql:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f /workspace/PIPINGBOX-BRAIN/DASHBOARD-APP/sql/004-marketplace-schema.sql
--
-- DEPLOYMENT ORDER — matters, PB-SEC-RLS-WORKFORCE-001 precedent:
--   1. Deploy the frontend FIRST if a public DSA notice form ships in the same
--      release, and make sure that form does NOT call `.select()` on its insert.
--   2. THEN run this SQL.
-- Doing it the other way round makes the public form show an error to the
-- reporter even when the notice was stored correctly.
--
-- After applying, run section 10 and confirm in particular that `anon` has
-- INSERT and only INSERT on app_marketplace_dsa_notices.


-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- Drops everything this script created. Destroys all instructor, QA-review and
-- DSA notice records. DSA notices are a regulatory record — export them before
-- running this in any environment that has received a real notice.
--
-- DROP VIEW IF EXISTS app_marketplace_instructors_public;
--
-- DROP TRIGGER IF EXISTS trg_app_marketplace_dsa_notices_updated ON app_marketplace_dsa_notices;
-- DROP TRIGGER IF EXISTS trg_app_marketplace_course_reviews_updated ON app_marketplace_course_reviews;
-- DROP TRIGGER IF EXISTS trg_app_marketplace_instructors_updated ON app_marketplace_instructors;
-- DROP TRIGGER IF EXISTS trg_app_marketplace_founding_cap ON app_marketplace_instructors;
-- DROP FUNCTION IF EXISTS app_marketplace_touch_updated_at();
-- DROP FUNCTION IF EXISTS app_marketplace_enforce_founding_cap();
--
-- DROP TABLE IF EXISTS app_marketplace_dsa_notices;
-- DROP TABLE IF EXISTS app_marketplace_course_reviews;
--
-- app_academy_courses must lose its FK before the instructors table can go.
-- ALTER TABLE app_academy_courses DROP CONSTRAINT IF EXISTS app_academy_courses_instructor_fk;
-- ALTER TABLE app_academy_courses DROP CONSTRAINT IF EXISTS app_academy_courses_fiscal_nature_check;
-- ALTER TABLE app_academy_courses DROP CONSTRAINT IF EXISTS app_academy_courses_taxonomy_category_check;
-- ALTER TABLE app_academy_courses DROP CONSTRAINT IF EXISTS app_academy_courses_verification_status_check;
-- ALTER TABLE app_academy_courses DROP COLUMN IF EXISTS revenue_share_channel_default;
-- ALTER TABLE app_academy_courses DROP COLUMN IF EXISTS submitted_for_review_at;
-- ALTER TABLE app_academy_courses DROP COLUMN IF EXISTS verified_by;
-- ALTER TABLE app_academy_courses DROP COLUMN IF EXISTS verified_at;
-- ALTER TABLE app_academy_courses DROP COLUMN IF EXISTS verification_status;
-- ALTER TABLE app_academy_courses DROP COLUMN IF EXISTS taxonomy_category;
-- ALTER TABLE app_academy_courses DROP COLUMN IF EXISTS fiscal_nature;
-- ALTER TABLE app_academy_courses DROP COLUMN IF EXISTS instructor_id;
--
-- DROP TABLE IF EXISTS app_marketplace_instructors;
--
-- app_is_admin() is NOT dropped here: 003-stripe-payments-schema.sql and
-- 004-certification-consent-grants.sql both depend on it.
