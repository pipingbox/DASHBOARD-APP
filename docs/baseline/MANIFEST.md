# MANIFEST — capturas del baseline DDL legacy (PB-ENT-E0B-BASELINE-DDL-001)

Registro de artefactos de `artifacts/`. Una fila por captura live. Formato de
artefacto: `legacy-ddl-<env>-<yyyymmdd>.json` (salida íntegra de
`extract-ddl-baseline.sql`, columna `e0b_baseline`).

| Artefacto | Entorno/source | Captura UTC | Commit repo | Extractor sha256 | Artefacto sha256 | Incluidos | Excluidos |
|---|---|---|---|---|---|---|---|
| _(sin capturas todavía — primera captura live pendiente de regeneración de credenciales, gate PO §8.3)_ | | | | | | | |

Reglas:

- Nunca editar un artefacto a mano: se regenera ejecutando el extractor.
- Si una captura se repite el mismo día, añadir sufijo `-HHMM` al nombre.
- `Artefacto sha256` = `sha256sum` del fichero tal cual se commitea.
- `Incluidos`/`Excluidos`: desviaciones respecto a `OBJECT-MANIFEST.md`
  (p.ej. tabla añadida al target list en esa captura); "según OBJECT-MANIFEST"
  si no hay desviación.
