#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# TESTFIXTURE-run-e0b-extractor — PB-ENT-E0B-BASELINE-DDL-001
#
# Prueba el extractor docs/baseline/extract-ddl-baseline.sql contra un esquema
# sintético (TESTFIXTURE-006) en una base scratch local de PostgreSQL 17.
#
# Pasos:
#   1. Recrea la base scratch pbe0bh.
#   2. Aplica TESTFIXTURE-006 (esquema sintético con todas las categorías DDL).
#   3. Genera una copia del extractor con la lista de objetivos sustituida por
#      las tablas sintéticas e0bh_* (bloque entre marcadores E0B TARGET LIST).
#   4. Ejecuta el extractor con GUCs de provenance de test.
#   5. Verifica la salida JSON con TESTFIXTURE-007-e0b-extractor-assert.py.
#
# Uso: bash sql/test-fixtures/TESTFIXTURE-run-e0b-extractor.sh
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
FIX="$REPO/sql/test-fixtures"
PGBIN="$HOME/pg-local/root/usr/lib/postgresql/17/bin"
export LD_LIBRARY_PATH="$HOME/pg-local/root/usr/lib/aarch64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
DB=pbe0bh
# Mismo patrón que los demás harness del repo: socket /tmp, puerto 55432.
PSQL="$PGBIN/psql -h /tmp -p 55432 -U postgres -d $DB -v ON_ERROR_STOP=1 -q -t -A"

echo "==================================================================="
echo "E0b — TEST EXTRACTOR BASELINE DDL — $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "==================================================================="

echo "[1/5] Recreando base scratch $DB"
"$PGBIN/dropdb" -h /tmp -p 55432 -U postgres --if-exists "$DB"
"$PGBIN/createdb" -h /tmp -p 55432 -U postgres "$DB"

echo "[2/5] Aplicando esquema sintético TESTFIXTURE-006"
"$PGBIN/psql" -h /tmp -p 55432 -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -f "$FIX/TESTFIXTURE-006-e0b-extractor-harness.sql"

echo "[3/5] Generando copia del extractor con objetivos sintéticos"
TMP_EXTRACTOR="$(mktemp /tmp/e0b-extractor-harness.XXXXXX.sql)"
python3 - "$REPO/docs/baseline/extract-ddl-baseline.sql" "$TMP_EXTRACTOR" <<'PYEOF'
import re, sys
src = open(sys.argv[1], encoding="utf-8").read()
replacement = """INSERT INTO e0b_target_tables(relname) VALUES
  ('e0bh_main'),
  ('e0bh_parent');"""
pattern = re.compile(
    r"-- >>> E0B TARGET LIST >>>.*?-- <<< E0B TARGET LIST <<<",
    re.DOTALL,
)
new, n = pattern.subn(
    "-- >>> E0B TARGET LIST >>>\n" + replacement + "\n-- <<< E0B TARGET LIST <<<",
    src,
)
if n != 1:
    print("ERROR: marcadores E0B TARGET LIST no encontrados o ambiguos", file=sys.stderr)
    sys.exit(1)
open(sys.argv[2], "w", encoding="utf-8").write(new)
PYEOF

echo "[4/5] Ejecutando extractor (GUCs environment=harness, repo_commit=test)"
OUT="$(mktemp /tmp/e0b-baseline-harness.XXXXXX.json)"
{
  echo "SET e0b.environment = 'harness';"
  echo "SET e0b.commit = 'test';"
  cat "$TMP_EXTRACTOR"
} | "$PGBIN/psql" -h /tmp -p 55432 -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -t -A -o "$OUT" -f -

echo "[5/5] Aserciones sobre el JSON extraído"
python3 "$FIX/TESTFIXTURE-007-e0b-extractor-assert.py" "$OUT"

rm -f "$TMP_EXTRACTOR" "$OUT"
echo "==================================================================="
echo "E0b EXTRACTOR HARNESS: PASS"
echo "==================================================================="
