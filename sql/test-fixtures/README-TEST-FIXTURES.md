# sql/test-fixtures/ — NOT PRODUCTION SQL. NEVER RUN AGAINST SUPABASE.

Everything in this directory exists to make `sql/004-marketplace-schema.sql` and
`sql/005-revenue-events.sql` executable against a **throwaway local PostgreSQL**
so that their behaviour can be *tested* instead of *asserted*.

## The rule

**No file in this directory may ever be applied to Supabase, staging or
production.** They create stub objects (`auth.users`, `app_14da0f1941_profiles`,
`app_academy_courses`, `app_orders`, the `anon` / `authenticated` /
`service_role` roles) that ALREADY EXIST in the real database with a completely
different and much richer definition. Running these against the canonical
database would at best be a no-op and at worst shadow a real table.

Every file here is named `TESTFIXTURE-*` and opens with a banner repeating this
warning. The migrations themselves (`004`, `005`) contain no reference to this
directory and do not depend on it.

## Contents

| File | Purpose |
| --- | --- |
| `TESTFIXTURE-000-stubs.sql` | Minimal stand-ins for the FK targets and Supabase roles that do not exist in a bare local PostgreSQL. |
| `TESTFIXTURE-001-founding-cap-race.sql` | Two-session concurrency harness for the Founding Instructor cap (`PB-MARKET-SCHEMA-001` section 5). |
| `TESTFIXTURE-002-reverse-charge-check.sql` | Truth-table test for `app_invoices_reverse_charge_determination_check` (`005` section 3). |
| `TESTFIXTURE-003-revenue-events.sql` | SALE / REFUND / CHARGEBACK insert + append-only probing as an unprivileged role. |
| `TESTFIXTURE-BAD-reverse-charge.ts.txt` | Deliberately non-compliant TypeScript, used to prove the static guard fires. Stored as `.txt` so it is not compiled or scanned in place. |

## Why the stubs are minimal

They declare only the columns the migrations actually touch. A faithful copy of
the production tables would be a second source of truth that drifts silently;
a deliberately minimal stub cannot be mistaken for one.
