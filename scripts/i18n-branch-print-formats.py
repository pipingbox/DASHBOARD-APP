#!/usr/bin/env python3
"""PB-BRANCH-PRINT-FORMATS-001 — add tools.branchLayout.printFormat to all locales."""
import json
from collections import OrderedDict
from pathlib import Path

LOCALES_DIR = Path(__file__).resolve().parent.parent / "app/frontend/src/i18n/locales"

TRANSLATIONS = {
    "en": "Print format",
    "es": "Formato de impresión",
    "fr": "Format d'impression",
    "de": "Druckformat",
    "it": "Formato di stampa",
    "pt": "Formato de impressão",
    "nl": "Afdrukformaat",
    "pl": "Format wydruku",
    "bg": "Формат за печат",
    "ro": "Format de imprimare",
    "uk": "Формат друку",
}

for loc, value in TRANSLATIONS.items():
    path = LOCALES_DIR / f"{loc}.json"
    data = json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=OrderedDict)
    bl = data["tools"]["branchLayout"]
    if "printFormat" in bl:
        print(f"{loc}: already present, skipping")
        continue
    # Insert right after printPicaje1to1 to keep key ordering consistent.
    out = OrderedDict()
    for k, v in bl.items():
        out[k] = v
        if k == "printPicaje1to1":
            out["printFormat"] = value
    if "printFormat" not in out:
        out["printFormat"] = value
    data["tools"]["branchLayout"] = out
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{loc}: added printFormat = {value!r}")
