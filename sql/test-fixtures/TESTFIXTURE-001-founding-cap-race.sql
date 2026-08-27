-- =============================================================================
-- ####  T E S T   F I X T U R E  —  N O T   P R O D U C T I O N   S Q L  ####
-- =============================================================================
--
--   ######################################################################
--   #   DO NOT RUN THIS FILE AGAINST SUPABASE, STAGING OR PRODUCTION.    #
--   #   It inserts and deletes founding instructors on purpose.          #
--   ######################################################################
--
-- PURPOSE:
-- Concurrency harness for the Founding Instructor cap enforced by
-- app_marketplace_enforce_founding_cap() / trg_app_marketplace_founding_cap
-- (sql/004-marketplace-schema.sql section 5).
--
-- THE HYPOTHESIS UNDER TEST:
-- The trigger counts rows and raises when the count exceeds 10. Under the
-- default READ COMMITTED isolation each transaction sees only rows committed
-- BEFORE its statement started, plus its own. Two concurrent transactions
-- inserting the 11th founding instructor therefore each count 10 existing + 1
-- of their own = 11 ... which is NOT > 10, so both pass, both commit, and the
-- table ends with 11 rows. The cap is a contractual commitment to a closed
-- cohort of 10, so this is a real commercial defect.
--
-- WHY THE RACE IS NOT FIXED BY `DEFERRABLE INITIALLY IMMEDIATE`:
-- Deferral changes WHEN inside the transaction the check fires (end of
-- statement vs end of transaction). It does not create any cross-transaction
-- visibility or mutual exclusion. Neither setting helps.
--
-- HOW TO RUN: driven by the harness in this directory; see the report. The
-- helper routines below are what both the "before" and "after" runs call, so
-- the two runs are provably the same test.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Seed helper: reset to exactly N founding instructors.
-- -----------------------------------------------------------------------------
-- Deletes every instructor and recreates N founding ones. Used to put the table
-- in the precondition state "10 founding instructors already exist".
CREATE OR REPLACE FUNCTION testfixture_seed_founding(n INT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  i   INT;
  uid UUID;
BEGIN
  DELETE FROM app_marketplace_instructors;
  DELETE FROM auth.users WHERE email LIKE 'fixture-%@example.test';

  FOR i IN 1..n LOOP
    INSERT INTO auth.users (email)
      VALUES (format('fixture-%s@example.test', i))
      RETURNING id INTO uid;

    INSERT INTO app_marketplace_instructors
      (user_id, display_name, is_founding_instructor, revenue_share_tier)
      VALUES (uid, format('Founding %s', i), true, 'FOUNDING');
  END LOOP;
END;
$$;


-- -----------------------------------------------------------------------------
-- Candidate helper: create a NON-founding user + instructor row to promote,
-- or just a spare auth.users row to insert against.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION testfixture_new_user(tag TEXT)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  uid UUID;
BEGIN
  DELETE FROM auth.users WHERE email = format('fixture-%s@example.test', tag);
  INSERT INTO auth.users (email)
    VALUES (format('fixture-%s@example.test', tag))
    RETURNING id INTO uid;
  RETURN uid;
END;
$$;


-- -----------------------------------------------------------------------------
-- Observation helper.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION testfixture_founding_count()
RETURNS INT
LANGUAGE sql
STABLE
AS $$
  SELECT count(*)::int
    FROM app_marketplace_instructors
   WHERE is_founding_instructor = true;
$$;
