#!/usr/bin/env bash
# =============================================================================
# ####  T E S T   H A R N E S S  —  N O T   P R O D U C T I O N   C O D E  ####
# =============================================================================
#
# Concurrency driver for PB-ENT-E0A-COMPANY-CORE-CONCURRENCY-001.
#
# Runs TWO REAL CONCURRENT psql SESSIONS against the same company, both trying
# to degrade/remove an owner (or transfer ownership) at the same time. A flag
# -file barrier guarantees both transactions are open and past their snapshot
# point before either commits — a genuine race, not two sequential calls.
#
# Tests (PO acceptance criteria):
#   A. Two owners degrade themselves simultaneously  -> exactly one succeeds,
#      the other fails with last_owner; company keeps >= 1 owner.
#   B. Two owners remove themselves simultaneously   -> idem (never 0 owners).
#   C. transfer_ownership concurrent with a remove of the target -> tenant
#      keeps >= 1 active owner and a consistent state.
#   D. Operations on DIFFERENT companies do not block each other globally.
#   E. Re-running the operations keeps idempotency (no error storms, state
#      stays consistent).
#
# Usage: ./TESTFIXTURE-run-e0a-owner-race.sh <dbname> [before|after]
#   before = expect the race to be VISIBLE (058 without the fix) — both
#            operations may succeed and the invariant can break.
#   after  = expect the fix (059) to hold — exactly one operation wins.
#
# Exit code: 0 if the observed behaviour matches the mode, 1 otherwise.
# =============================================================================
set -u

DB="${1:-e0a_race_003}"
MODE="${2:-after}"
PSQL=(psql -h /tmp -p 55432 -U postgres -d "$DB" -v ON_ERROR_STOP=0 -q -t -A)

WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

fail() { echo "E0A-HARNESS-FAIL: $*" >&2; exit 1; }

# ── Seed ──────────────────────────────────────────────────────────────────────
# Company RACE1 with 2 owners (A and B); company RACE2 with 2 owners (for test D).
COMPANY1=$("${PSQL[@]}" -c "SELECT testfixture_e0a_seed_company('RACE1', 2)")
M1A=$("${PSQL[@]}" -c "SELECT testfixture_e0a_owner_membership('$COMPANY1', 1)")
M1B=$("${PSQL[@]}" -c "SELECT testfixture_e0a_owner_membership('$COMPANY1', 2)")
U1A=$("${PSQL[@]}" -c "SELECT testfixture_e0a_membership_user('$M1A')")
U1B=$("${PSQL[@]}" -c "SELECT testfixture_e0a_membership_user('$M1B')")
COMPANY2=$("${PSQL[@]}" -c "SELECT testfixture_e0a_seed_company('RACE2', 2)")

[ -n "$COMPANY1" ] && [ -n "$M1A" ] && [ -n "$M1B" ] || fail "seed RACE1 incomplete"
[ -n "$COMPANY2" ] || fail "seed RACE2 incomplete"
echo "seed: RACE1=$COMPANY1 owners=[$M1A,$M1B] RACE2=$COMPANY2"

# ── Barrier helpers (flag files; see founding-cap harness for rationale) ──────
A_READY="$WORKDIR/a_ready"; B_READY="$WORKDIR/b_ready"
A_DONE="$WORKDIR/a_done";   B_DONE="$WORKDIR/b_done"
A_OUT="$WORKDIR/a_out";     B_OUT="$WORKDIR/b_out"

waitfor() { local f="$1" n=0; while [ ! -e "$f" ]; do n=$((n+1)); [ $n -gt 600 ] && return 1; sleep 0.1; done; }

# ── TEST A: two owners degrade themselves concurrently ───────────────────────
# Both sessions: BEGIN, set actor, touch a barrier row, signal ready, wait for
# the peer, then change_role(owner -> admin) and COMMIT.
run_change_role_session() { # $1=membership $2=actor_user $3=ready_flag $4=peer_flag $5=out_file $6=done_flag
  "${PSQL[@]}" >"$5" 2>&1 <<SQL
BEGIN;
SET LOCAL request.jwt.claim.sub = '$2';
-- Barrier: open txn + snapshot taken before signalling.
SELECT 1;
SELECT pg_notify('e0a', 'x');
\! touch $3
\! bash -c 'while [ ! -e $4 ]; do sleep 0.05; done'
SELECT public.pb_company_member_change_role('$1', 'admin');
COMMIT;
SQL
  touch "$6"
}

: > "$A_OUT"; : > "$B_OUT"
run_change_role_session "$M1A" "$U1A" "$A_READY" "$B_READY" "$A_OUT" "$A_DONE" &
PIDA=$!
run_change_role_session "$M1B" "$U1B" "$B_READY" "$A_READY" "$B_OUT" "$B_DONE" &
PIDB=$!
wait "$PIDA" "$PIDB"

OWNERS_AFTER_A=$("${PSQL[@]}" -c "SELECT testfixture_e0a_owner_count('$COMPANY1')")
A_ERR=$(rg -c "last_owner" "$A_OUT" "$B_OUT" 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
A_OK=$(rg -c "pb_company_member_change_role" "$A_OUT" "$B_OUT" 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
echo "TEST A: owners_after=$OWNERS_AFTER_A last_owner_errors=$A_ERR"

# ── TEST D: operations on different companies must not block globally ─────────
# While RACE1 is being mutated, an independent change on RACE2 must complete
# without waiting on RACE1's lock. We measure that a change_role on RACE2
# finishes quickly while a deliberately slow (pg_sleep) lock-holder sits on
# RACE1's app_companies row.
M2=$("${PSQL[@]}" -c "SELECT testfixture_e0a_owner_membership('$COMPANY2', 1)")
U2=$("${PSQL[@]}" -c "SELECT testfixture_e0a_membership_user('$M2')")

"${PSQL[@]}" >"$WORKDIR/slow_out" 2>&1 <<SQL &
BEGIN;
SELECT 1 FROM public.app_companies WHERE id = '$COMPANY1' FOR UPDATE;
SELECT pg_sleep(3);
ROLLBACK;
SQL
SLOWPID=$!
sleep 0.5  # let the slow session take RACE1's lock

D_START=$(date +%s%N)
"${PSQL[@]}" >"$WORKDIR/d_out" 2>&1 <<SQL
BEGIN;
SET LOCAL request.jwt.claim.sub = '$U2';
SELECT public.pb_company_member_change_role('$M2', 'admin');
COMMIT;
SQL
D_END=$(date +%s%N)
wait "$SLOWPID"
D_MS=$(( (D_END - D_START) / 1000000 ))
echo "TEST D: independent-company op completed in ${D_MS}ms while RACE1 locked (must be < 3000ms)"

# ── TEST B: two owners remove themselves concurrently (fresh company) ─────────
COMPANY3=$("${PSQL[@]}" -c "SELECT testfixture_e0a_seed_company('RACE3', 2)")
M3A=$("${PSQL[@]}" -c "SELECT testfixture_e0a_owner_membership('$COMPANY3', 1)")
M3B=$("${PSQL[@]}" -c "SELECT testfixture_e0a_owner_membership('$COMPANY3', 2)")
U3A=$("${PSQL[@]}" -c "SELECT testfixture_e0a_membership_user('$M3A')")
U3B=$("${PSQL[@]}" -c "SELECT testfixture_e0a_membership_user('$M3B')")

rm -f "$A_READY" "$B_READY" "$A_DONE" "$B_DONE"
run_remove_session() { # $1=membership $2=actor_user $3=ready_flag $4=peer_flag $5=out_file
  "${PSQL[@]}" >"$5" 2>&1 <<SQL
BEGIN;
SET LOCAL request.jwt.claim.sub = '$2';
SELECT 1;
\! touch $3
\! bash -c 'while [ ! -e $4 ]; do sleep 0.05; done'
SELECT public.pb_company_member_remove('$1');
COMMIT;
SQL
}

: > "$A_OUT"; : > "$B_OUT"
run_remove_session "$M3A" "$U3A" "$A_READY" "$B_READY" "$A_OUT" &
PIDA=$!
run_remove_session "$M3B" "$U3B" "$B_READY" "$A_READY" "$B_OUT" &
PIDB=$!
wait "$PIDA" "$PIDB"

OWNERS_AFTER_B=$("${PSQL[@]}" -c "SELECT testfixture_e0a_owner_count('$COMPANY3')")
B_ERR=$(rg -c "last_owner" "$A_OUT" "$B_OUT" 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
echo "TEST B: owners_after=$OWNERS_AFTER_B last_owner_errors=$B_ERR"

# ── TEST C: transfer_ownership concurrent with remove of the target ───────────
# Company RACE4: owner O + second owner P. Session 1: O transfers to P.
# Session 2: P removes himself concurrently. Outcome must leave >= 1 owner and
# a consistent state (no error storm, no 0 owners).
COMPANY4=$("${PSQL[@]}" -c "SELECT testfixture_e0a_seed_company('RACE4', 2)")
M4A=$("${PSQL[@]}" -c "SELECT testfixture_e0a_owner_membership('$COMPANY4', 1)")
M4B=$("${PSQL[@]}" -c "SELECT testfixture_e0a_owner_membership('$COMPANY4', 2)")
U4A=$("${PSQL[@]}" -c "SELECT testfixture_e0a_membership_user('$M4A')")
U4B=$("${PSQL[@]}" -c "SELECT testfixture_e0a_membership_user('$M4B')")

rm -f "$A_READY" "$B_READY"
: > "$A_OUT"; : > "$B_OUT"
# Session 1: owner A transfers ownership to B.
"${PSQL[@]}" >"$A_OUT" 2>&1 <<SQL &
BEGIN;
SET LOCAL request.jwt.claim.sub = '$U4A';
SELECT 1;
\! touch $A_READY
\! bash -c 'while [ ! -e $B_READY ]; do sleep 0.05; done'
SELECT public.pb_company_transfer_ownership('$COMPANY4', '$M4B');
COMMIT;
SQL
PIDA=$!
# Session 2: owner B removes himself.
"${PSQL[@]}" >"$B_OUT" 2>&1 <<SQL &
BEGIN;
SET LOCAL request.jwt.claim.sub = '$U4B';
SELECT 1;
\! touch $B_READY
\! bash -c 'while [ ! -e $A_READY ]; do sleep 0.05; done'
SELECT public.pb_company_member_remove('$M4B');
COMMIT;
SQL
PIDB=$!
wait "$PIDA" "$PIDB"

OWNERS_AFTER_C=$("${PSQL[@]}" -c "SELECT testfixture_e0a_owner_count('$COMPANY4')")
C_DEADLOCK=$(rg -ci "deadlock" "$A_OUT" "$B_OUT" 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
echo "TEST C: owners_after=$OWNERS_AFTER_C deadlock_errors=$C_DEADLOCK"

# ── TEST E: idempotency — re-run a remove on an already-removed membership ────
# pb_company_member_remove on a non-active membership must return true (no-op),
# not raise. The loser of test B is the membership already 'removed': removing
# it again (twice) must be a silent no-op.
LOSER_B=$("${PSQL[@]}" -c "SELECT id FROM public.app_company_memberships WHERE company_id='$COMPANY3' AND status='removed' LIMIT 1")
if [ -z "$LOSER_B" ]; then echo "TEST E: no removed membership found (unexpected)"; E_ERR=1; else
E_RAW=$("${PSQL[@]}" <<SQL
BEGIN;
SET LOCAL request.jwt.claim.sub = '$U3A';
SELECT public.pb_company_member_remove('$LOSER_B');
SELECT public.pb_company_member_remove('$LOSER_B');
COMMIT;
SQL
)
E_ERR=$(echo "$E_RAW" | rg -c "ERROR" || true)
E_ERR=${E_ERR:-0}
fi
echo "TEST E: idempotent re-remove errors=$E_ERR"

# ── Verdict ───────────────────────────────────────────────────────────────────
echo "---"
if [ "$MODE" = "after" ]; then
  # With the fix: exactly one winner in A and B (owners_after = 1), no global
  # blocking in D, C consistent (>= 1 owner, no deadlock), E idempotent.
  PASS=1
  [ "$OWNERS_AFTER_A" = "1" ] || { echo "A FAIL: expected exactly 1 owner left, got $OWNERS_AFTER_A"; PASS=0; }
  [ "$A_ERR" -ge 1 ] || { echo "A FAIL: expected a last_owner error on the loser"; PASS=0; }
  [ "$OWNERS_AFTER_B" = "1" ] || { echo "B FAIL: expected exactly 1 owner left, got $OWNERS_AFTER_B"; PASS=0; }
  [ "$B_ERR" -ge 1 ] || { echo "B FAIL: expected a last_owner error on the loser"; PASS=0; }
  [ "$OWNERS_AFTER_C" -ge 1 ] || { echo "C FAIL: expected >= 1 owner, got $OWNERS_AFTER_C"; PASS=0; }
  [ "$C_DEADLOCK" = "0" ] || { echo "C FAIL: deadlock detected"; PASS=0; }
  [ "$D_MS" -lt 3000 ] || { echo "D FAIL: independent company blocked ${D_MS}ms (global lock?)"; PASS=0; }
  [ "$E_ERR" = "0" ] || { echo "E FAIL: idempotent re-remove raised"; PASS=0; }
  [ "$PASS" = "1" ] && { echo "E0A-HARNESS: AFTER-FIX PASS (A/B/C/D/E)"; exit 0; } || { echo "E0A-HARNESS: AFTER-FIX FAIL"; exit 1; }
else
  # Before the fix: the race is observable — both A operations can succeed and
  # the company can end with 0 owners (invariant broken).
  if [ "$OWNERS_AFTER_A" = "0" ]; then
    echo "E0A-HARNESS: BEFORE-FIX race REPRODUCED (0 owners after concurrent degrade)"
    exit 0
  fi
  echo "E0A-HARNESS: BEFORE-FIX race not reproduced this run (owners_after=$OWNERS_AFTER_A)"
  exit 1
fi
