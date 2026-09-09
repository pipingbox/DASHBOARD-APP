# PB-TOOLS-STUDBOLT-REVISION-001 — Normative Validation Gate

**Status:** DATA VALIDATION REQUIRED

**Ticket:** PB-TOOLS-STUDBOLT-REVISION-001
**Branch:** feat/pb-tools-studbolt-revision-001
**Commit:** d9cf11e06317fcd928efbaf35a4dd187a2a85188

## Target standards

| Standard | Edition | Purpose |
|---|---|---|
| ASME B16.5 | 2025 | Flange bolting dimensions (qty, diameter, RF/RTJ length) |
| ASME B1.1 | 2024 Table 6 | Unified inch screw threads (UNC/8UN, TPI, pitch, tensile area) |
| ASME B18.2.2 | 2022 | Heavy hex nut dimensions (AF, height) |
| ASME PCC-1 | project edition | Torque calculation and tightening sequence |

## Current validation status

All 136 rows in the canonical Brain YAML are currently marked:

```
verification_status: cross_reference_only
confidence: 0.55
```

This means:
- Values were compiled from publicly available cross-reference tables (Texas Flange, Wermac, Projectmaterials, etc.).
- They have **NOT** been validated against the licensed primary ASME text.
- They must **NOT** be relabeled as `VERIFIED` until primary-source comparison is completed.

## Fields requiring primary-source validation

For every NPS × Class × Facing combination:

- [ ] Bolt/stud quantity
- [ ] Stud diameter (nominal)
- [ ] RF stud length
- [ ] RTJ stud length (where applicable)
- [ ] Applicable NPS/Class coverage
- [ ] Heavy hex nut width across flats (AF)
- [ ] Heavy hex nut thickness/height (H)

For thread data:

- [ ] Thread designation per ASME B1.1-2024 Table 6
- [ ] TPI
- [ ] Pitch (mm)
- [ ] Tensile stress area

## Known discrepancies vs legacy dataset

See `audit-bolting-dimensions.md` for the full audit.

Summary:
- 72 dimensional discrepancies identified between legacy `BOLT_DATA` and the new canonical dataset.
- Legacy lengths were systematically shorter.
- Legacy dataset omitted Class 400 and NPS 3-1/2", 5", 22".

These discrepancies remain unresolved against a primary ASME source.

## Gate closure criteria

This gate may be closed only after:

1. A licensed copy of ASME B16.5-2025 (and B1.1-2024 / B18.2.2-2022 where applicable) is obtained.
2. Every field listed above is compared against the primary source.
3. Discrepancies are resolved and documented.
4. `verification_status` is updated to `verified_primary_source` for validated rows.
5. `confidence` is raised to `1.0` for verified rows.
6. Any rows that cannot be verified remain `cross_reference_only` or `not_verified`.

## Production recommendation

**DO NOT deploy to production until this normative validation gate is closed.**

The implementation is architecturally sound and passes build/typecheck/tests, but the underlying dimensional data has not yet been proven against primary ASME material.
