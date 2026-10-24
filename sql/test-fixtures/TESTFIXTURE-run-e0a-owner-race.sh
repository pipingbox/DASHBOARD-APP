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
# Tests (PO acceptance criteria + PO review of PR #98, 2026-10-24):
#   A. Two owners degrade themselves simultaneously  -> exactly one succeeds,
#      the other fails with last_owner; company keeps >= 1 owner.
#   B. Two owners remove themselves simultaneously   -> idem (never 0 owners).
#   C1. CANONICAL (PO review): 1 owner A + admin B; transfer A->B concurrent
#       with remove(B) -> active_owner_count = 1 ALWAYS, explicit final state
#       of A and B asserted, no deadlock. This is the documented contract of
#       pb_company_transfer_ownership (target = active NON-owner).
#   C2. Legacy 2-owner variant kept as additional evidence: transfer A->B (B
#       already owner) concurrent with remove(B) -> with 060 the transfer is
#       rejected (target_already_owner) or finds the target gone (not_found);
#       owners = 1, no deadlock.
#   D. Operations on DIFFERENT companies do not block each other globally.
#   E. Re-running the operations keeps idempotency (no error storms, state
#      stays consistent).
#   F. Canonical contract (sequential): transfer to an already-owner target is
#      rejected with target_already_owner; transfer to removed membership ->
#      not_found; transfer to self -> cannot_transfer_to_self; transfer by a
#      non-owner -> forbidden; happy path A(owner)->C(recruiter) succeeds.
#   F6. G1 (PO review iteración 2): authenticated OUTSIDER (sin membership)
#       con IDs válidos -> forbidden; cero cambios de roles/status; owner
#       count inalterado. (058/059/060: bypass — NULL <> 'owner' = NULL.)
#   C3. G2 (PO review iteración 2): autorización stale. A/C owners, B admin.
#       T2 (C) toma el mutex primero; T1 (A) inicia transfer A→B y bloquea;
#       T2 degrada (C3a) o retira (C3b) a A y commitea; T1 reanuda.
#       061: forbidden, B sigue admin/active, T1 no muta nada.
#
# Usage: ./TESTFIXTURE-run-e0a-owner-race.sh <dbname> [before|before060|before061|after]
#   before    = 058 only: the ORIGINAL A-race is VISIBLE (0 owners possible).
#   before060 = 058+059 (PR #98 as first reviewed): A/B/C2/D/E hold, but the
#               C1 race is still reachable, F1 does not raise, and the F6/C3
#               authorization bypasses exist.
#   before061 = 058+059+060 (PR #98 iteración 1): C1/F contract hold, pero G1
#               (F6 outsider bypass) y G2 (C3 stale auth) se REPRODUCEN.
#   after     = 058+059+060+061: everything holds (A/B/C1/C2/C3/D/E/F/F6).
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

# ── TEST C1 (CANONICAL, PO review PR #98): transfer to NON-OWNER + remove ────
# Company RACE-C1: exactly 1 owner A + 1 active admin B (the documented
# transfer scenario of sql/058: target = active non-owner).
# T1: A transfers ownership to B.  T2: A removes B concurrently.
# With 059, remove(B) sees B as admin -> takes NO company lock -> can commit
# after the transfer leaves B as owner -> A admin + B owner/removed = 0 owners.
COMPANY5=$("${PSQL[@]}" -c "SELECT testfixture_e0a_seed_company_mixed('RACE-C1', '{admin}')")
M5A=$("${PSQL[@]}" -c "SELECT testfixture_e0a_role_membership('$COMPANY5', 'owner', 1)")
M5B=$("${PSQL[@]}" -c "SELECT testfixture_e0a_role_membership('$COMPANY5', 'admin', 1)")
U5A=$("${PSQL[@]}" -c "SELECT testfixture_e0a_membership_user('$M5A')")
[ -n "$COMPANY5" ] && [ -n "$M5A" ] && [ -n "$M5B" ] || fail "seed RACE-C1 incomplete"

rm -f "$A_READY" "$B_READY"
: > "$A_OUT"; : > "$B_OUT"
# T1: owner A transfers ownership to admin B.
"${PSQL[@]}" >"$A_OUT" 2>&1 <<SQL &
BEGIN;
SET LOCAL request.jwt.claim.sub = '$U5A';
SELECT 1;
\! touch $A_READY
\! bash -c 'while [ ! -e $B_READY ]; do sleep 0.05; done'
SELECT public.pb_company_transfer_ownership('$COMPANY5', '$M5B');
COMMIT;
SQL
PIDA=$!
# T2: owner A removes B concurrently.
"${PSQL[@]}" >"$B_OUT" 2>&1 <<SQL &
BEGIN;
SET LOCAL request.jwt.claim.sub = '$U5A';
SELECT 1;
\! touch $B_READY
\! bash -c 'while [ ! -e $A_READY ]; do sleep 0.05; done'
SELECT public.pb_company_member_remove('$M5B');
COMMIT;
SQL
PIDB=$!
wait "$PIDA" "$PIDB"

OWNERS_AFTER_C1=$("${PSQL[@]}" -c "SELECT testfixture_e0a_owner_count('$COMPANY5')")
C1_STATE_A=$("${PSQL[@]}" -c "SELECT testfixture_e0a_membership_state('$M5A')")
C1_STATE_B=$("${PSQL[@]}" -c "SELECT testfixture_e0a_membership_state('$M5B')")
C1_DEADLOCK=$(cat "$A_OUT" "$B_OUT" | rg -ci "deadlock" || echo 0)
# El perdedor es rechazado de forma controlada: si ganó el remove, el transfer
# encuentra el target no activo (not_found); si ganó el transfer, A ya es admin
# y no puede retirar al nuevo owner (forbidden) — o choca con last_owner.
C1_ERR=$(cat "$A_OUT" "$B_OUT" | rg -o "last_owner|not_found|forbidden" | wc -l)
echo "TEST C1: owners_after=$OWNERS_AFTER_C1 state_A=$C1_STATE_A state_B=$C1_STATE_B errors(last_owner|not_found|forbidden)=$C1_ERR deadlocks=$C1_DEADLOCK"

# ── TEST C2 (legacy, kept as additional evidence): 2 owners, transfer to ─────
# an ALREADY-OWNER target concurrent with remove of that target.
# After 060 the transfer must be rejected (target_already_owner) or find the
# target already gone (not_found); the tenant keeps exactly 1 owner.
COMPANY4=$("${PSQL[@]}" -c "SELECT testfixture_e0a_seed_company('RACE4', 2)")
M4A=$("${PSQL[@]}" -c "SELECT testfixture_e0a_owner_membership('$COMPANY4', 1)")
M4B=$("${PSQL[@]}" -c "SELECT testfixture_e0a_owner_membership('$COMPANY4', 2)")
U4A=$("${PSQL[@]}" -c "SELECT testfixture_e0a_membership_user('$M4A')")
U4B=$("${PSQL[@]}" -c "SELECT testfixture_e0a_membership_user('$M4B')")

rm -f "$A_READY" "$B_READY"
: > "$A_OUT"; : > "$B_OUT"
# Session 1: owner A transfers ownership to B (already owner -> contract breach).
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
C2_STATE_A=$("${PSQL[@]}" -c "SELECT testfixture_e0a_membership_state('$M4A')")
C2_STATE_B=$("${PSQL[@]}" -c "SELECT testfixture_e0a_membership_state('$M4B')")
C_DEADLOCK=$(cat "$A_OUT" "$B_OUT" | rg -ci "deadlock" || echo 0)
C2_CONTRACT_ERR=$(rg -o "target_already_owner|not_found" "$A_OUT" | wc -l)
echo "TEST C2: owners_after=$OWNERS_AFTER_C state_A=$C2_STATE_A state_B=$C2_STATE_B transfer_errors=$C2_CONTRACT_ERR deadlocks=$C_DEADLOCK"

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

# ── TEST F: canonical transfer contract (sequential, deterministic) ──────────
# PO review PR #98: sql/058 documents the transfer target as "active non-owner"
# but the code did not enforce it. 060 canonicalizes: target already owner ->
# target_already_owner. Evidence of the discrepancy: in before/before060 mode
# F1 does NOT raise.
# F1: transfer to an ALREADY-OWNER target.
CF1=$("${PSQL[@]}" -c "SELECT testfixture_e0a_seed_company('RACE-F1', 2)")
F1A=$("${PSQL[@]}" -c "SELECT testfixture_e0a_owner_membership('$CF1', 1)")
F1B=$("${PSQL[@]}" -c "SELECT testfixture_e0a_owner_membership('$CF1', 2)")
F1U=$("${PSQL[@]}" -c "SELECT testfixture_e0a_membership_user('$F1A')")
F1_OUT=$("${PSQL[@]}" 2>&1 <<SQL
BEGIN;
SET LOCAL request.jwt.claim.sub = '$F1U';
SELECT public.pb_company_transfer_ownership('$CF1', '$F1B');
ROLLBACK;
SQL
)
echo "$F1_OUT" | rg -q "target_already_owner" && F1_CONTRACT=raised || F1_CONTRACT=not_raised

# F2: transfer to a REMOVED membership -> not_found.
CF2=$("${PSQL[@]}" -c "SELECT testfixture_e0a_seed_company_mixed('RACE-F2', '{admin}')")
F2A=$("${PSQL[@]}" -c "SELECT testfixture_e0a_role_membership('$CF2', 'owner', 1)")
F2B=$("${PSQL[@]}" -c "SELECT testfixture_e0a_role_membership('$CF2', 'admin', 1)")
F2U=$("${PSQL[@]}" -c "SELECT testfixture_e0a_membership_user('$F2A')")
"${PSQL[@]}" -c "UPDATE public.app_company_memberships SET status='removed' WHERE id='$F2B'" >/dev/null
F2_OUT=$("${PSQL[@]}" 2>&1 <<SQL
BEGIN;
SET LOCAL request.jwt.claim.sub = '$F2U';
SELECT public.pb_company_transfer_ownership('$CF2', '$F2B');
ROLLBACK;
SQL
)
echo "$F2_OUT" | rg -q "not_found" && F2_CONTRACT=raised || F2_CONTRACT=not_raised

# F3: transfer to self -> cannot_transfer_to_self (regression).
CF3=$("${PSQL[@]}" -c "SELECT testfixture_e0a_seed_company_mixed('RACE-F3', '{recruiter}')")
F3A=$("${PSQL[@]}" -c "SELECT testfixture_e0a_role_membership('$CF3', 'owner', 1)")
F3U=$("${PSQL[@]}" -c "SELECT testfixture_e0a_membership_user('$F3A')")
F3_OUT=$("${PSQL[@]}" 2>&1 <<SQL
BEGIN;
SET LOCAL request.jwt.claim.sub = '$F3U';
SELECT public.pb_company_transfer_ownership('$CF3', '$F3A');
ROLLBACK;
SQL
)
echo "$F3_OUT" | rg -q "cannot_transfer_to_self" && F3_CONTRACT=raised || F3_CONTRACT=not_raised

# F4: transfer attempted by a NON-OWNER actor -> forbidden (regression).
CF4=$("${PSQL[@]}" -c "SELECT testfixture_e0a_seed_company_mixed('RACE-F4', '{admin,recruiter}')")
F4B=$("${PSQL[@]}" -c "SELECT testfixture_e0a_role_membership('$CF4', 'admin', 1)")
F4C=$("${PSQL[@]}" -c "SELECT testfixture_e0a_role_membership('$CF4', 'recruiter', 1)")
F4U=$("${PSQL[@]}" -c "SELECT testfixture_e0a_membership_user('$F4B')")
F4_OUT=$("${PSQL[@]}" 2>&1 <<SQL
BEGIN;
SET LOCAL request.jwt.claim.sub = '$F4U';
SELECT public.pb_company_transfer_ownership('$CF4', '$F4C');
ROLLBACK;
SQL
)
echo "$F4_OUT" | rg -q "forbidden" && F4_CONTRACT=raised || F4_CONTRACT=not_raised

# F5: happy path regression — A(owner) transfers to C(recruiter, active
# non-owner): succeeds; A becomes admin, C becomes owner.
CF5=$("${PSQL[@]}" -c "SELECT testfixture_e0a_seed_company_mixed('RACE-F5', '{recruiter}')")
F5A=$("${PSQL[@]}" -c "SELECT testfixture_e0a_role_membership('$CF5', 'owner', 1)")
F5C=$("${PSQL[@]}" -c "SELECT testfixture_e0a_role_membership('$CF5', 'recruiter', 1)")
F5U=$("${PSQL[@]}" -c "SELECT testfixture_e0a_membership_user('$F5A')")
F5_OUT=$("${PSQL[@]}" 2>&1 <<SQL
BEGIN;
SET LOCAL request.jwt.claim.sub = '$F5U';
SELECT public.pb_company_transfer_ownership('$CF5', '$F5C');
COMMIT;
SQL
)
F5_STATE_A=$("${PSQL[@]}" -c "SELECT testfixture_e0a_membership_state('$F5A')")
F5_STATE_C=$("${PSQL[@]}" -c "SELECT testfixture_e0a_membership_state('$F5C')")
echo "$F5_OUT" | rg -q "^t$|^true$" && [ "$F5_STATE_A" = "admin/active" ] && [ "$F5_STATE_C" = "owner/active" ] && F5_CONTRACT=ok || F5_CONTRACT=bad
echo "TEST F: F1(already-owner)=$F1_CONTRACT F2(removed)=$F2_CONTRACT F3(self)=$F3_CONTRACT F4(non-owner)=$F4_CONTRACT F5(happy)=$F5_CONTRACT"

# ── TEST F6: AUTH NULL BYPASS (G1, PO review iteración 2) ─────────────────────
# Authenticated OUTSIDER (sin membership) con company_id y target válidos.
# 058/059/060: `pb_company_role() <> 'owner'` con NULL → el guard no se levanta
# y la función promueve al target (bypass). 061: forbidden, cero cambios.
CF6=$("${PSQL[@]}" -c "SELECT testfixture_e0a_seed_company_mixed('RACE-F6', '{admin}')")
F6A=$("${PSQL[@]}" -c "SELECT testfixture_e0a_role_membership('$CF6', 'owner', 1)")
F6B=$("${PSQL[@]}" -c "SELECT testfixture_e0a_role_membership('$CF6', 'admin', 1)")
F6X=$("${PSQL[@]}" -c "SELECT testfixture_e0a_seed_outsider()")
F6_OWNERS_BEFORE=$("${PSQL[@]}" -c "SELECT testfixture_e0a_owner_count('$CF6')")
F6_OUT=$("${PSQL[@]}" 2>&1 <<SQL
BEGIN;
SET LOCAL request.jwt.claim.sub = '$F6X';
SELECT public.pb_company_transfer_ownership('$CF6', '$F6B');
COMMIT;
SQL
)
F6_STATE_A=$("${PSQL[@]}" -c "SELECT testfixture_e0a_membership_state('$F6A')")
F6_STATE_B=$("${PSQL[@]}" -c "SELECT testfixture_e0a_membership_state('$F6B')")
F6_OWNERS_AFTER=$("${PSQL[@]}" -c "SELECT testfixture_e0a_owner_count('$CF6')")
echo "$F6_OUT" | rg -q "forbidden" && F6_RESULT=forbidden || F6_RESULT=bypassed
echo "TEST F6 (outsider): result=$F6_RESULT owners:$F6_OWNERS_BEFORE->$F6_OWNERS_AFTER A=$F6_STATE_A B=$F6_STATE_B"

# ── TEST C3: TOCTOU de autorización del actor (G2, PO review iteración 2) ─────
# A owner, C segundo owner, B admin. T2 (C) adquiere el mutex de empresa
# PRIMERO; T1 (A) inicia transfer A→B (guard temprano pasa: A aún es owner) y
# bloquea en el mutex; T2 degrada (C3a) o retira (C3b) a A y COMMIT; T1
# reanuda. 061: la revalidación post-lock rechaza con forbidden y B sigue
# no-owner. 058/059/060: la transferencia se completa con autorización stale.
run_c3() {
  local NAME="$1" OP="$2"   # OP: demote | remove
  local C3 M_A M_C M_B U_A U_C
  C3=$("${PSQL[@]}" -c "SELECT testfixture_e0a_seed_company('$NAME', 2)")
  M_A=$("${PSQL[@]}" -c "SELECT testfixture_e0a_role_membership('$C3', 'owner', 1)")
  M_C=$("${PSQL[@]}" -c "SELECT testfixture_e0a_role_membership('$C3', 'owner', 2)")
  M_B=$("${PSQL[@]}" -c "SELECT testfixture_e0a_add_member('$C3', 'admin')")
  U_A=$("${PSQL[@]}" -c "SELECT testfixture_e0a_membership_user('$M_A')")
  U_C=$("${PSQL[@]}" -c "SELECT testfixture_e0a_membership_user('$M_C')")

  rm -f "$A_READY" "$B_READY"; : > "$A_OUT"; : > "$B_OUT"
  # T2 (C): adquiere el mutex PRIMERO, espera a que T1 esté bloqueado, muta A y commitea.
  "${PSQL[@]}" >"$A_OUT" 2>&1 <<SQL &
BEGIN;
SET LOCAL request.jwt.claim.sub = '$U_C';
SELECT 1 FROM public.app_companies WHERE id = '$C3' FOR UPDATE;
\! touch $A_READY
\! bash -c 'while [ ! -e $B_READY ]; do sleep 0.05; done'
SELECT pg_sleep(1);
$( [ "$OP" = "demote" ] && echo "SELECT public.pb_company_member_change_role('$M_A', 'admin');" || echo "SELECT public.pb_company_member_remove('$M_A');" )
COMMIT;
SQL
  local PIDT2=$!
  # T1 (A): espera el mutex tomado por T2, inicia transfer y bloquea.
  "${PSQL[@]}" >"$B_OUT" 2>&1 <<SQL &
\! bash -c 'while [ ! -e $A_READY ]; do sleep 0.05; done'
BEGIN;
SET LOCAL request.jwt.claim.sub = '$U_A';
\! touch $B_READY
SELECT public.pb_company_transfer_ownership('$C3', '$M_B');
COMMIT;
SQL
  local PIDT1=$!
  wait "$PIDT2" "$PIDT1"

  C3_B_STATE=$("${PSQL[@]}" -c "SELECT testfixture_e0a_membership_state('$M_B')")
  C3_OWNERS=$("${PSQL[@]}" -c "SELECT testfixture_e0a_owner_count('$C3')")
  if echo " $(cat "$B_OUT") " | rg -q "forbidden"; then C3_T1=forbidden; else C3_T1=completed; fi
  echo "TEST $NAME ($OP): T1=$C3_T1 B=$C3_B_STATE owners=$C3_OWNERS A=$("${PSQL[@]}" -c "SELECT testfixture_e0a_membership_state('$M_A')")"
  # export para el veredicto
  if [ "$OP" = "demote" ]; then C3A_T1=$C3_T1; C3A_B=$C3_B_STATE; C3A_OWNERS=$C3_OWNERS;
  else C3B_T1=$C3_T1; C3B_B=$C3_B_STATE; C3B_OWNERS=$C3_OWNERS; fi
}
run_c3 "RACE-C3A" demote
run_c3 "RACE-C3B" remove

# ── Verdict ───────────────────────────────────────────────────────────────────
echo "---"
if [ "$MODE" = "after" ]; then
  # With 060: exactly one winner in A and B; C1 leaves exactly 1 owner with a
  # consistent final state (transfer won: A admin/active + B owner/active, or
  # remove won: A owner/active + B admin/removed) and exactly one controlled
  # error; C2 keeps 1 owner with the transfer rejected; D no global blocking;
  # E idempotent; F contract enforced.
  PASS=1
  [ "$OWNERS_AFTER_A" = "1" ] || { echo "A FAIL: expected exactly 1 owner left, got $OWNERS_AFTER_A"; PASS=0; }
  [ "$A_ERR" -ge 1 ] || { echo "A FAIL: expected a last_owner error on the loser"; PASS=0; }
  [ "$OWNERS_AFTER_B" = "1" ] || { echo "B FAIL: expected exactly 1 owner left, got $OWNERS_AFTER_B"; PASS=0; }
  [ "$B_ERR" -ge 1 ] || { echo "B FAIL: expected a last_owner error on the loser"; PASS=0; }
  [ "$OWNERS_AFTER_C1" = "1" ] || { echo "C1 FAIL: expected exactly 1 active owner, got $OWNERS_AFTER_C1"; PASS=0; }
  { [ "$C1_STATE_A" = "admin/active" ] && [ "$C1_STATE_B" = "owner/active" ]; } \
    || { [ "$C1_STATE_A" = "owner/active" ] && [ "$C1_STATE_B" = "admin/removed" ]; } \
    || { echo "C1 FAIL: inconsistent final state A=$C1_STATE_A B=$C1_STATE_B"; PASS=0; }
  [ "$C1_ERR" -ge 1 ] || { echo "C1 FAIL: expected a last_owner/not_found error on the loser"; PASS=0; }
  [ "$C1_DEADLOCK" = "0" ] || { echo "C1 FAIL: deadlock detected"; PASS=0; }
  [ "$OWNERS_AFTER_C" = "1" ] || { echo "C2 FAIL: expected exactly 1 owner, got $OWNERS_AFTER_C"; PASS=0; }
  [ "$C2_STATE_A" = "owner/active" ] || { echo "C2 FAIL: A must remain owner/active, got $C2_STATE_A"; PASS=0; }
  case "$C2_STATE_B" in */removed) : ;; *) echo "C2 FAIL: B must end removed, got $C2_STATE_B"; PASS=0;; esac
  [ "$C2_CONTRACT_ERR" -ge 1 ] || { echo "C2 FAIL: transfer must be rejected (target_already_owner|not_found)"; PASS=0; }
  [ "$C_DEADLOCK" = "0" ] || { echo "C2 FAIL: deadlock detected"; PASS=0; }
  [ "$D_MS" -lt 3000 ] || { echo "D FAIL: independent company blocked ${D_MS}ms (global lock?)"; PASS=0; }
  [ "$E_ERR" = "0" ] || { echo "E FAIL: idempotent re-remove raised"; PASS=0; }
  [ "$F1_CONTRACT" = "raised" ] || { echo "F1 FAIL: transfer to already-owner must raise target_already_owner"; PASS=0; }
  [ "$F2_CONTRACT" = "raised" ] || { echo "F2 FAIL: transfer to removed membership must raise not_found"; PASS=0; }
  [ "$F3_CONTRACT" = "raised" ] || { echo "F3 FAIL: transfer to self must raise cannot_transfer_to_self"; PASS=0; }
  [ "$F4_CONTRACT" = "raised" ] || { echo "F4 FAIL: transfer by non-owner must raise forbidden"; PASS=0; }
  [ "$F5_CONTRACT" = "ok" ] || { echo "F5 FAIL: happy path transfer broken (A=$F5_STATE_A C=$F5_STATE_C)"; PASS=0; }
  # G1: outsider -> forbidden, cero cambios (roles/status y owner count inalterados)
  [ "$F6_RESULT" = "forbidden" ] || { echo "F6 FAIL: outsider transfer must raise forbidden (G1 bypass!)"; PASS=0; }
  [ "$F6_STATE_A" = "owner/active" ] && [ "$F6_STATE_B" = "admin/active" ] || { echo "F6 FAIL: state changed by outsider (A=$F6_STATE_A B=$F6_STATE_B)"; PASS=0; }
  [ "$F6_OWNERS_AFTER" = "$F6_OWNERS_BEFORE" ] || { echo "F6 FAIL: owner count changed ($F6_OWNERS_BEFORE->$F6_OWNERS_AFTER)"; PASS=0; }
  # G2: autorización stale -> forbidden; B sigue no-owner; T1 no realiza cambios
  [ "$C3A_T1" = "forbidden" ] || { echo "C3a FAIL: stale-auth transfer (demote) must raise forbidden, got $C3A_T1"; PASS=0; }
  [ "$C3A_B" = "admin/active" ] || { echo "C3a FAIL: B must stay admin/active, got $C3A_B"; PASS=0; }
  [ "$C3B_T1" = "forbidden" ] || { echo "C3b FAIL: stale-auth transfer (remove) must raise forbidden, got $C3B_T1"; PASS=0; }
  [ "$C3B_B" = "admin/active" ] || { echo "C3b FAIL: B must stay admin/active, got $C3B_B"; PASS=0; }
  [ "$PASS" = "1" ] && { echo "E0A-HARNESS: AFTER-FIX PASS (A/B/C1/C2/C3/D/E/F+F6)"; exit 0; } || { echo "E0A-HARNESS: AFTER-FIX FAIL"; exit 1; }
elif [ "$MODE" = "before061" ]; then
  # 058+059+060 (PR #98 iteración 1, tal como se revisó en la iteración 2):
  # A-F se mantienen (060), PERO G1 (F6 outsider bypass) y G2 (C3 stale auth)
  # siguen presentes — este modo los REPRODUCE como evidencia.
  PASS=1
  [ "$OWNERS_AFTER_C1" = "1" ] || { echo "C1(060) FAIL: 060 debe mantener C1, got $OWNERS_AFTER_C1"; PASS=0; }
  [ "$F1_CONTRACT" = "raised" ] || { echo "F1(060) FAIL: 060 debe imponer el contrato non-owner"; PASS=0; }
  [ "$F5_CONTRACT" = "ok" ] || { echo "F5(060) FAIL: happy path roto"; PASS=0; }
  [ "$PASS" = "1" ] || { echo "E0A-HARNESS: BEFORE-061 baseline broken"; exit 1; }
  [ "$F6_RESULT" = "bypassed" ] \
    && echo "E0A-HARNESS: BEFORE-061 G1 outsider bypass REPRODUCED (B=$F6_STATE_B owners:$F6_OWNERS_BEFORE->$F6_OWNERS_AFTER)" \
    || echo "E0A-HARNESS: BEFORE-061 G1 bypass not reproduced this run (result=$F6_RESULT)"
  [ "$C3A_T1" = "completed" ] \
    && echo "E0A-HARNESS: BEFORE-061 G2 stale-auth transfer (demote) COMPLETED (B=$C3A_B)" \
    || echo "E0A-HARNESS: BEFORE-061 C3a not reproduced this run (T1=$C3A_T1)"
  [ "$C3B_T1" = "completed" ] \
    && echo "E0A-HARNESS: BEFORE-061 G2 stale-auth transfer (remove) COMPLETED (B=$C3B_B)" \
    || echo "E0A-HARNESS: BEFORE-061 C3b not reproduced this run (T1=$C3B_T1)"
  exit 0
elif [ "$MODE" = "before060" ]; then
  # 058+059 (PR #98 as reviewed): the FIRST fix holds (A/B/C2/D/E consistent)
  # but the C1 transfer<->remove-non-owner race is still reachable and the
  # transfer contract is not enforced (F1 must NOT raise target_already_owner).
  PASS=1
  [ "$OWNERS_AFTER_A" = "1" ] || { echo "A(059) FAIL: 059 must hold the A invariant, got $OWNERS_AFTER_A"; PASS=0; }
  [ "$OWNERS_AFTER_B" = "1" ] || { echo "B(059) FAIL: 059 must hold the B invariant, got $OWNERS_AFTER_B"; PASS=0; }
  [ "$OWNERS_AFTER_C" -ge 1 ] || { echo "C2(059) FAIL: owner-target path was already serialized, got $OWNERS_AFTER_C"; PASS=0; }
  [ "$C_DEADLOCK" = "0" ] || { echo "C2(059) FAIL: deadlock detected"; PASS=0; }
  [ "$D_MS" -lt 3000 ] || { echo "D(059) FAIL: independent company blocked ${D_MS}ms"; PASS=0; }
  [ "$E_ERR" = "0" ] || { echo "E(059) FAIL: idempotent re-remove raised"; PASS=0; }
  [ "$F1_CONTRACT" = "not_raised" ] || { echo "F1(059) FAIL: 059 must NOT enforce the non-owner contract (discrepancy evidence)"; PASS=0; }
  [ "$PASS" = "1" ] || { echo "E0A-HARNESS: BEFORE-060 baseline broken"; exit 1; }
  if [ "$OWNERS_AFTER_C1" = "0" ]; then
    echo "E0A-HARNESS: BEFORE-060 C1 race REPRODUCED (0 active owners: A=$C1_STATE_A B=$C1_STATE_B)"
  else
    echo "E0A-HARNESS: BEFORE-060 C1 race not reproduced this run (owners=$OWNERS_AFTER_C1 A=$C1_STATE_A B=$C1_STATE_B)"
  fi
  exit 0
else
  # Before any fix (058 only): the race is observable — both A operations can
  # succeed and the company can end with 0 owners (invariant broken).
  if [ "$OWNERS_AFTER_A" = "0" ]; then
    echo "E0A-HARNESS: BEFORE-FIX race REPRODUCED (0 owners after concurrent degrade)"
    exit 0
  fi
  echo "E0A-HARNESS: BEFORE-FIX race not reproduced this run (owners_after=$OWNERS_AFTER_A)"
  exit 1
fi
