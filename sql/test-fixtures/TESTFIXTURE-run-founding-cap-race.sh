#!/usr/bin/env bash
# =============================================================================
# ####  T E S T   H A R N E S S  —  N O T   P R O D U C T I O N   C O D E  ####
# =============================================================================
#
# Concurrency driver for the Founding Instructor cap.
#
# Runs TWO REAL CONCURRENT psql SESSIONS that both try to take the LAST
# remaining founding slot. Both open a transaction, both do their insert, and
# only then does either commit — which is what makes the interleaving a genuine
# race rather than two sequential inserts dressed up as one.
#
# WHY THE TABLE IS SEEDED WITH 9 AND NOT 10:
# The trigger raises on `founding_count > 10` and it is an AFTER trigger, so the
# inserting transaction's own row is already visible to the count. With 10 rows
# committed, ONE insert alone already counts 11 and is correctly refused — there
# is no race to observe there. The contended slot is the TENTH. Two transactions
# each see 9 committed rows plus their own new row = 10, and 10 is not > 10, so
# BOTH pass the check and both commit. The table ends with 11.
#
# THE BARRIER, AND WHY IT IS SHAPED THIS WAY:
# Both sessions must be inside an open transaction and past the point of taking
# their snapshot BEFORE either one performs its insert. That is the condition
# that makes each one's row invisible to the other.
#
# The barrier therefore synchronises the two sessions BEFORE the insert, never
# between the insert and the commit. An earlier version of this harness made A
# wait for B *after* A's insert, which cannot work once the fix is in place: A
# would be holding the advisory lock while waiting for B, and B would be
# waiting for the advisory lock. That is a deadlock in the HARNESS, not in the
# trigger, and it would have been easy to misread as the fix failing.
#
# The rendezvous uses FLAG FILES polled in a loop, not FIFOs. A symmetric FIFO
# barrier self-deadlocks: opening a FIFO for writing blocks until a reader
# arrives, so two sessions that each announce before listening both hang on the
# announce. Flag files have no such coupling.
#
# After the barrier both sessions run free. Without the fix they interleave and
# both commit. With the fix the advisory lock orders them, and the loser sees
# the intended exception.
#
# Usage: ./TESTFIXTURE-run-founding-cap-race.sh <dbname>
# =============================================================================
set -u

DB="${1:-racetest}"
PSQL=(psql -h /tmp -p 55432 -U postgres -d "$DB" -v ON_ERROR_STOP=0 -q -t -A)

WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

A_READY="$WORKDIR/a_ready"   # A signals: transaction open, snapshot taken
B_READY="$WORKDIR/b_ready"   # B signals: transaction open, snapshot taken

# Blocks until the named flag file appears. Bounded so a genuine hang in the
# database surfaces as a harness timeout instead of running forever.
cat > "$WORKDIR/waitfor.sh" <<'WAITER'
#!/usr/bin/env bash
f="$1"; n=0
while [ ! -e "$f" ]; do
  sleep 0.05; n=$((n+1))
  [ "$n" -gt 400 ] && { echo "barrier timeout waiting for $f" >&2; exit 1; }
done
WAITER
chmod +x "$WORKDIR/waitfor.sh"

echo "--- seeding: exactly 9 founding instructors (one slot left of 10) ---"
"${PSQL[@]}" -c "SELECT testfixture_seed_founding(9);" >/dev/null
echo "count after seed = $("${PSQL[@]}" -c 'SELECT testfixture_founding_count();')"

UID_A=$("${PSQL[@]}" -c "SELECT testfixture_new_user('raceA');")
UID_B=$("${PSQL[@]}" -c "SELECT testfixture_new_user('raceB');")
echo "candidate A user_id = $UID_A"
echo "candidate B user_id = $UID_B"
echo

# --- Session A -------------------------------------------------------------
# BEGIN, then force the snapshot open with a real read of the table, then
# announce readiness and wait for B to be equally ready. Only then insert.
(
  {
    echo "BEGIN;"
    echo "SELECT testfixture_founding_count();"
    echo "\\! touch $A_READY"
    echo "\\! $WORKDIR/waitfor.sh $B_READY"
    echo "INSERT INTO app_marketplace_instructors (user_id, display_name, is_founding_instructor, revenue_share_tier) VALUES ('$UID_A', 'Race A', true, 'FOUNDING');"
    echo "COMMIT;"
  } | "${PSQL[@]}" 2>&1 | sed 's/^/[A] /'
) &
PID_A=$!

# --- Session B -------------------------------------------------------------
# Exactly symmetric. Both are past their snapshot before either inserts.
(
  {
    echo "BEGIN;"
    echo "SELECT testfixture_founding_count();"
    echo "\\! touch $B_READY"
    echo "\\! $WORKDIR/waitfor.sh $A_READY"
    echo "INSERT INTO app_marketplace_instructors (user_id, display_name, is_founding_instructor, revenue_share_tier) VALUES ('$UID_B', 'Race B', true, 'FOUNDING');"
    echo "COMMIT;"
  } | "${PSQL[@]}" 2>&1 | sed 's/^/[B] /'
) &
PID_B=$!

wait $PID_A $PID_B

echo
echo "--- RESULT ---"
FINAL=$("${PSQL[@]}" -c 'SELECT testfixture_founding_count();')
echo "founding instructor count = $FINAL   (cap is 10)"
if [ "$FINAL" -gt 10 ]; then
  echo "VERDICT: CAP BREACHED — the race produced $FINAL founding instructors."
else
  echo "VERDICT: cap held at $FINAL."
fi
"${PSQL[@]}" -c "SELECT display_name FROM app_marketplace_instructors WHERE is_founding_instructor AND display_name LIKE 'Race %' ORDER BY display_name;" \
  | sed 's/^/  committed race row: /'
