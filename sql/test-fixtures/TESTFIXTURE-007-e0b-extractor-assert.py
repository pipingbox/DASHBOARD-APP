#!/usr/bin/env python3
"""TESTFIXTURE-007 — PB-ENT-E0B-BASELINE-DDL-001.

Aserciones sobre la salida JSON del extractor docs/baseline/extract-ddl-baseline.sql
ejecutado contra el esquema sintético TESTFIXTURE-006. Verifica que TODAS las
categorías exigidas por el PO quedan capturadas. Exit 0 = PASS; exit 1 = FAIL.
"""
import json
import sys

path = sys.argv[1]
with open(path, encoding="utf-8") as f:
    doc = json.load(f)

failures = []


def check(label, cond):
    if cond:
        print(f"  PASS {label}")
    else:
        failures.append(label)
        print(f"  FAIL {label}")


# ── Provenance ────────────────────────────────────────────────────────────────
prov = doc.get("provenance", {})
check("format_version=1.0", doc.get("baseline_format_version") == "1.0")
check("provenance.captured_at_utc", bool(prov.get("captured_at_utc")))
check("provenance.environment=harness", prov.get("environment") == "harness")
check("provenance.repo_commit=test", prov.get("repo_commit") == "test")
check("provenance.read_only", prov.get("read_only") is True)
check("provenance.contains_data_rows=false", prov.get("contains_data_rows") is False)

# ── Targets / missing ─────────────────────────────────────────────────────────
check("target_tables=2 sinteticas",
      doc.get("target_tables") == ["e0bh_main", "e0bh_parent"])
check("missing_tables vacio", doc.get("missing_tables") == [])

tables = {t["name"]: t for t in doc.get("tables", [])}
main = tables.get("e0bh_main", {})
parent = tables.get("e0bh_parent", {})

# ── Columnas ──────────────────────────────────────────────────────────────────
cols = {c["name"]: c for c in main.get("columns", [])}
check("columna qty: type integer", cols.get("qty", {}).get("type") == "integer")
check("columna qty: not_null", cols.get("qty", {}).get("not_null") is True)
check("columna notes: nullable", cols.get("notes", {}).get("not_null") is False)
check("columna qty: default 0", cols.get("qty", {}).get("default") == "0")
check("columna code: default funcion", "e0bh_default_code()" in (cols.get("code", {}).get("default") or ""))
check("columna seq: identity=d", cols.get("seq", {}).get("identity") == "d")
check("columna seq: sequence capturada",
      bool(cols.get("seq", {}).get("sequence")) and "e0bh_main_seq_seq" in cols["seq"]["sequence"])
check("columna code_upper: generated=s", cols.get("code_upper", {}).get("generated") == "s")
check("columna tags: array type", cols.get("tags", {}).get("type") == "text[]")
check("columna status: udt enum",
      cols.get("status", {}).get("udt_name") == "e0bh_status"
      and cols.get("status", {}).get("type") == "e0bh_status")
check("columna email: udt domain", cols.get("email", {}).get("udt_name") == "e0bh_email")
check("columna id: default gen_random_uuid", "gen_random_uuid()" in (cols.get("id", {}).get("default") or ""))

# ── Constraints ───────────────────────────────────────────────────────────────
ctypes = {c["type"]: c for c in main.get("constraints", [])}
check("constraint PK", ctypes.get("p", {}).get("name") == "e0bh_main_pkey")
check("constraint FK", ctypes.get("f", {}).get("fk_referenced_table") == "e0bh_parent")
check("constraint FK on_update=CASCADE", ctypes.get("f", {}).get("fk_on_update") == "c")
check("constraint FK on_delete=RESTRICT", ctypes.get("f", {}).get("fk_on_delete") == "r")
check("constraint UNIQUE", ctypes.get("u", {}).get("name") == "e0bh_main_code_uniq")
check("constraint CHECK", "qty >= 0" in (ctypes.get("c", {}).get("definition") or ""))

# ── Índices ───────────────────────────────────────────────────────────────────
idx = {i["name"]: i for i in main.get("indexes", [])}
check("indice plano qty", idx.get("e0bh_main_qty_idx", {}).get("partial") is False)
pidx = idx.get("e0bh_main_lowercode_active_idx", {})
check("indice parcial detectado", pidx.get("partial") is True)
check("indice parcial: definicion con WHERE", "WHERE" in (pidx.get("definition") or ""))
check("indice parcial: unique", pidx.get("unique") is True)
check("indice valid", all(i.get("valid") for i in main.get("indexes", [])))

# ── Triggers ──────────────────────────────────────────────────────────────────
trg = {t["name"]: t for t in main.get("triggers", [])}
check("trigger enabled=O", trg.get("e0bh_main_touch_trg", {}).get("enabled") == "O")
check("trigger disabled=D", trg.get("e0bh_main_touch_disabled_trg", {}).get("enabled") == "D")
check("trigger function", "e0bh_touch" in (trg.get("e0bh_main_touch_trg", {}).get("function") or ""))

# ── RLS ───────────────────────────────────────────────────────────────────────
check("main rls_enabled", main.get("rls_enabled") is True)
check("main rls_forced=false", main.get("rls_forced") is False)
check("parent rls_enabled", parent.get("rls_enabled") is True)
check("parent rls_forced", parent.get("rls_forced") is True)

# ── Policies ──────────────────────────────────────────────────────────────────
pols = {p["name"]: p for p in main.get("policies", [])}
check("policy SELECT qual", "e0bh_is_allowed" in (pols.get("e0bh_main_select", {}).get("qual") or ""))
check("policy SELECT cmd", pols.get("e0bh_main_select", {}).get("cmd") == "SELECT")
check("policy SELECT roles", pols.get("e0bh_main_select", {}).get("roles") == ["authenticated"])
check("policy INSERT with_check", "qty >= 0" in (pols.get("e0bh_main_insert", {}).get("with_check") or ""))
check("parent policy", bool(parent.get("policies")))

# ── Grants ────────────────────────────────────────────────────────────────────
grants = {(g["grantee"], g["privilege"]) for g in main.get("grants", [])}
check("grant authenticated SELECT", ("authenticated", "SELECT") in grants)
check("grant service_role INSERT", ("service_role", "INSERT") in grants)
pgrants = {(g["grantee"], g["privilege"]) for g in parent.get("grants", [])}
check("grant anon SELECT parent", ("anon", "SELECT") in pgrants)
check("acl_default=false (grants explicitos)", main.get("acl_default") is False)

# ── Funciones dependientes ────────────────────────────────────────────────────
fns = {f["name"]: f for f in doc.get("dependent_functions", [])}
check("funcion policy (e0bh_is_allowed)", "e0bh_is_allowed" in fns)
check("funcion trigger (e0bh_touch)", "e0bh_touch" in fns)
check("funcion default (e0bh_default_code)", "e0bh_default_code" in fns)
check("funcion definition capturada", "BEGIN" in (fns.get("e0bh_touch", {}).get("definition") or ""))
check("funcion external=false", fns.get("e0bh_is_allowed", {}).get("external") is False)
check("funcion security_definer flag", fns.get("e0bh_touch", {}).get("security_definer") is False)

# ── Tipos dependientes ────────────────────────────────────────────────────────
typs = {t["name"]: t for t in doc.get("dependent_types", [])}
check("enum e0bh_status", typs.get("e0bh_status", {}).get("kind") == "e")
check("enum labels ordenados",
      typs.get("e0bh_status", {}).get("enum_labels") == ["active", "suspended", "archived"])
check("domain e0bh_email", typs.get("e0bh_email", {}).get("kind") == "d")
check("domain base text", typs.get("e0bh_email", {}).get("domain_base_type") == "text")
check("composite e0bh_address", typs.get("e0bh_address", {}).get("kind") == "c")
check("composite attrs", [a["name"] for a in typs.get("e0bh_address", {}).get("composite_attrs", [])] == ["street", "city", "zip"])

# ── Discovery / extensions ────────────────────────────────────────────────────
check("candidate_tables incluye sonda e0bh_job_probe", "e0bh_job_probe" in (doc.get("candidate_tables") or []))
check("candidate_tables excluye tabla sin patron", "e0bh_parent" not in (doc.get("candidate_tables") or []))
check("extensions presente", isinstance(doc.get("extensions"), list))

print()
if failures:
    print(f"RESULTADO: FAIL ({len(failures)} aserciones)")
    sys.exit(1)
print("RESULTADO: PASS (todas las aserciones)")
