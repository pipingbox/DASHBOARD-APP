#!/usr/bin/env python3
"""Rewrite tools.prefab block with full translations in all 7 locales (W1.B.1)."""
import json
from collections import OrderedDict

LOCALES = ['en', 'es', 'de', 'fr', 'it', 'nl', 'pt']

EN = OrderedDict([
    ("common", OrderedDict([
        ("na", "N/A"),
        ("noResult", "Enter valid parameters to see results"),
        ("selectMode", "Select a mode"),
        ("engineBadge", "Pure geometry engine — CROSS_REFERENCE"),
        ("results", "Numerical results"),
        ("drawing", "Technical drawing"),
    ])),
    ("elbowCut", OrderedDict([
        ("title", "Elbow Cut Calculator"),
        ("nps", "NPS"),
        ("schedule", "Schedule"),
        ("elbowType", "Elbow type"),
        ("totalAngle", "Total elbow angle"),
        ("betaAngle", "Angle to keep (β)"),
        ("clrOverride", "CLR override"),
        ("cutIntrados", "Cut intrados"),
        ("cutCenterline", "Cut centerline"),
        ("cutExtrados", "Cut extrados"),
        ("keptArc", "Kept arc length"),
        ("discardedArc", "Discarded arc length"),
        ("noteGeometry", "The cut plane is perpendicular to the elbow bisector. Distances are measured from the tangent line along each surface."),
        ("noteProvenance", "OD/WT from ASME B36.10M (CROSS_REFERENCE). CLR defaults from ASME B16.9 long/short radius tables (CROSS_REFERENCE)."),
        ("drawPlaceholder", "Enter parameters to draw the elbow cut"),
        ("cutLabel", "cut"),
    ])),
    ("offset", OrderedDict([
        ("title", "Pipe Offset"),
        ("tabWithElbows", "With elbows"),
        ("tabWithoutElbows", "Without elbows"),
        ("tabVerify", "Verify"),
        ("a", "A (advance)"),
        ("b", "B (offset)"),
        ("h", "H (travel)"),
        ("theta", "θ (angle)"),
        ("nps", "NPS"),
        ("schedule", "Schedule"),
        ("elbowType", "Elbow type"),
        ("elbowAngle", "Elbow angle"),
        ("clrOverride", "CLR override"),
        ("errorAngle", "Elbow angle must be between 0° and 90°"),
        ("errorClr", "Could not determine elbow radius"),
        ("verifyHint", "Enter exactly two of A, B, H or θ to solve the triangle."),
        ("diagramPlaceholder", "Select a mode to draw the offset"),
        ("travel", "H (travel)"),
        ("takeOut", "Take-out per elbow"),
        ("straightCut", "Straight cut"),
        ("centerToCenter", "Center-to-center"),
        ("diagonal", "H (diagonal)"),
        ("cutAngleEnd", "Cut angle per end"),
    ])),
    ("miteredElbow", OrderedDict([
        ("title", "Mitered Elbow"),
        ("nps", "NPS"),
        ("schedule", "Schedule"),
        ("totalAngle", "Total angle"),
        ("segments", "Number of pieces (N)"),
        ("elbowType", "Radius type"),
        ("clrOverride", "CLR override"),
        ("noteGeometry", "N straight pieces joined by J = N − 1 miter joints. Joint deflection δ = total angle / J; cut angle per mating end φ = δ / 2."),
        ("noteProvenance", "Piece lengths follow the tangent model T = R·tan(δ/2) (end piece = T, middle piece = 2T). OD from ASME B36.10M (CROSS_REFERENCE). CLR defaults from ASME B16.9 (CROSS_REFERENCE)."),
        ("notes", "N straight pieces joined by J = N − 1 miter joints. δ = total/J, φ = δ/2. Tangent model: T = R·tan(δ/2); end piece = T, middle piece = 2T."),
        ("drawPlaceholder", "Enter parameters to draw the mitered elbow"),
        ("nPieces", "N (pieces)"),
        ("jJoints", "J (miter joints)"),
        ("jointDeflection", "Deflection per joint (δ)"),
        ("cutAngleEnd", "Cut angle per end (φ)"),
        ("tangentLength", "Tangent length T"),
        ("totalCenterline", "Total straight centerline"),
        ("piece", "Piece"),
        ("kind", "Type"),
        ("centerline", "Centerline"),
        ("intrados", "Intrados"),
        ("extrados", "Extrados"),
        ("endPiece", "End"),
        ("middlePiece", "Middle"),
    ])),
    ("pipeComb", OrderedDict([
        ("title", "Pipe Comb"),
        ("lineCount", "Number of lines"),
        ("initialSpacing", "Initial center spacing"),
        ("finalSpacing", "Final center spacing"),
        ("elbowAngle", "Elbow angle"),
        ("nps", "NPS"),
        ("schedule", "Schedule"),
        ("elbowType", "Elbow type"),
        ("clrOverride", "CLR override"),
        ("noteGeometry", "Every offset line uses two elbows of the same selected angle: travel = offset / sin(θ), advance = offset / tan(θ), straight cut = travel − 2·take-out. The reference line is straight. Negative cuts are rejected explicitly."),
        ("drawPlaceholder", "Enter parameters to draw the pipe comb"),
        ("startSpacing", "Start spacing"),
        ("endSpacing", "End spacing"),
        ("angleLabel", "Elbow angle"),
        ("travelSpread", "Travel spread"),
        ("line", "Line"),
        ("offset", "Offset"),
        ("advance", "Advance"),
        ("travel", "Travel"),
        ("straightCut", "Straight cut"),
        ("diff", "Diff"),
    ])),
    ("errors", OrderedDict([
        ("line_count_range", "Line count must be an integer between {{min}} and {{max}}"),
        ("spacing_positive", "Center spacing must be a positive finite length ({{field}})"),
        ("elbow_angle_range", "Elbow angle must be between 0° and {{max}}°"),
        ("clr_positive", "CLR must be a positive finite radius"),
        ("per_line_specs_count", "Per-line specs must match the number of lines"),
        ("per_line_clr_invalid", "Line {{line}}: per-line CLR must be a positive finite radius"),
        ("advance_invalid", "Line {{line}}: computed advance is invalid"),
        ("negative_cut", "Straight cut length is negative ({{value}} mm): the elbow radius is too large for this geometry"),
        ("ab_positive", "{{field}} must be a positive finite length"),
        ("angle_mismatch", "Geometry requires a {{required}}° elbow; the selected {{selected}}° elbow is incompatible for a 2D parallel-line offset"),
        ("verify_two_values", "Provide exactly two of A, B, H or θ"),
        ("verify_h_smaller", "H cannot be smaller than {{side}}"),
        ("verify_invalid", "Unable to solve the verification triangle"),
        ("segments_min", "N must be an integer ≥ {{min}} straight pieces"),
        ("total_angle_range", "Total angle must be between 0° and {{max}}°"),
        ("radius_positive", "Radius must be a positive finite length"),
        ("od_positive", "OD must be a positive finite length"),
        ("radius_gt_half_od", "Radius ({{radius}} mm) must be greater than OD/2 ({{halfOd}} mm)"),
        ("piece_lengths_invalid", "Computed piece lengths are invalid"),
        ("clr_gt_half_od", "CLR must be greater than OD/2"),
        ("beta_range", "Cut angle must be between 0° and {{max}}°"),
    ])),
])

T = {
    "es": {
        "common": {"na": "N/D", "noResult": "Introduce parámetros válidos para ver resultados", "selectMode": "Selecciona un modo", "engineBadge": "Motor geométrico puro — CROSS_REFERENCE", "results": "Resultados numéricos", "drawing": "Plano técnico"},
        "elbowCut": {"title": "Calculadora de corte de codos", "nps": "NPS", "schedule": "Schedule", "elbowType": "Tipo de codo", "totalAngle": "Ángulo total del codo", "betaAngle": "Ángulo a conservar (β)", "clrOverride": "CLR personalizado", "cutIntrados": "Corte intradós", "cutCenterline": "Corte línea de centros", "cutExtrados": "Corte extradós", "keptArc": "Longitud de arco conservada", "discardedArc": "Longitud de arco descartada", "noteGeometry": "El plano de corte es perpendicular a la bisectriz del codo. Las distancias se miden desde la línea tangente a lo largo de cada superficie.", "noteProvenance": "OD/WT de ASME B36.10M (CROSS_REFERENCE). CLR por defecto de tablas ASME B16.9 radio largo/corto (CROSS_REFERENCE).", "drawPlaceholder": "Introduce parámetros para dibujar el corte del codo", "cutLabel": "corte"},
        "offset": {"title": "Quiebro de tubería", "tabWithElbows": "Con codos", "tabWithoutElbows": "Sin codos", "tabVerify": "Comprobar", "a": "A (avance)", "b": "B (desplazamiento)", "h": "H (recorrido)", "theta": "θ (ángulo)", "nps": "NPS", "schedule": "Schedule", "elbowType": "Tipo de codo", "elbowAngle": "Ángulo del codo", "clrOverride": "CLR personalizado", "errorAngle": "El ángulo del codo debe estar entre 0° y 90°", "errorClr": "No se pudo determinar el radio del codo", "verifyHint": "Introduce exactamente dos valores de A, B, H o θ para resolver el triángulo.", "diagramPlaceholder": "Selecciona un modo para dibujar el quiebro", "travel": "H (recorrido)", "takeOut": "Take-out por codo", "straightCut": "Corte recto", "centerToCenter": "Centro a centro", "diagonal": "H (diagonal)", "cutAngleEnd": "Ángulo de corte por extremo"},
        "miteredElbow": {"title": "Codo a gajos", "nps": "NPS", "schedule": "Schedule", "totalAngle": "Ángulo total", "segments": "Número de piezas (N)", "elbowType": "Tipo de radio", "clrOverride": "CLR personalizado", "noteGeometry": "N piezas rectas unidas por J = N − 1 juntas a inglete. Deflexión de junta δ = ángulo total / J; ángulo de corte por extremo φ = δ / 2.", "noteProvenance": "Las longitudes de pieza siguen el modelo de tangentes T = R·tan(δ/2) (pieza extrema = T, pieza intermedia = 2T). OD de ASME B36.10M (CROSS_REFERENCE). CLR por defecto de ASME B16.9 (CROSS_REFERENCE).", "notes": "N piezas rectas unidas por J = N − 1 juntas a inglete. δ = total/J, φ = δ/2. Modelo de tangentes: T = R·tan(δ/2); pieza extrema = T, intermedia = 2T.", "drawPlaceholder": "Introduce parámetros para dibujar el codo a gajos", "nPieces": "N (piezas)", "jJoints": "J (juntas)", "jointDeflection": "Deflexión por junta (δ)", "cutAngleEnd": "Ángulo de corte por extremo (φ)", "tangentLength": "Longitud de tangente T", "totalCenterline": "Línea de centros recta total", "piece": "Pieza", "kind": "Tipo", "centerline": "Línea de centros", "intrados": "Intradós", "extrados": "Extradós", "endPiece": "Extrema", "middlePiece": "Intermedia"},
        "pipeComb": {"title": "Peine de tuberías", "lineCount": "Número de líneas", "initialSpacing": "Separación inicial entre ejes", "finalSpacing": "Separación final entre ejes", "elbowAngle": "Ángulo del codo", "nps": "NPS", "schedule": "Schedule", "elbowType": "Tipo de codo", "clrOverride": "CLR personalizado", "noteGeometry": "Cada línea desplazada usa dos codos del mismo ángulo seleccionado: recorrido = offset / sin(θ), avance = offset / tan(θ), corte recto = recorrido − 2·take-out. La línea de referencia es recta. Los cortes negativos se rechazan explícitamente.", "drawPlaceholder": "Introduce parámetros para dibujar el peine", "startSpacing": "Separación inicial", "endSpacing": "Separación final", "angleLabel": "Ángulo del codo", "travelSpread": "Diferencia máx. de recorrido", "line": "Línea", "offset": "Offset", "advance": "Avance", "travel": "Recorrido", "straightCut": "Corte recto", "diff": "Dif."},
        "errors": {"line_count_range": "El número de líneas debe ser un entero entre {{min}} y {{max}}", "spacing_positive": "La separación entre ejes debe ser una longitud positiva y finita ({{field}})", "elbow_angle_range": "El ángulo del codo debe estar entre 0° y {{max}}°", "clr_positive": "El CLR debe ser un radio positivo y finito", "per_line_specs_count": "Las especificaciones por línea deben coincidir con el número de líneas", "per_line_clr_invalid": "Línea {{line}}: el CLR por línea debe ser un radio positivo y finito", "advance_invalid": "Línea {{line}}: el avance calculado no es válido", "negative_cut": "La longitud de corte recto es negativa ({{value}} mm): el radio del codo es demasiado grande para esta geometría", "ab_positive": "{{field}} debe ser una longitud positiva y finita", "angle_mismatch": "La geometría requiere un codo de {{required}}°; el codo seleccionado de {{selected}}° es incompatible para un quiebro 2D de líneas paralelas", "verify_two_values": "Introduce exactamente dos valores de A, B, H o θ", "verify_h_smaller": "H no puede ser menor que {{side}}", "verify_invalid": "No se pudo resolver el triángulo de comprobación", "segments_min": "N debe ser un entero ≥ {{min}} piezas rectas", "total_angle_range": "El ángulo total debe estar entre 0° y {{max}}°", "radius_positive": "El radio debe ser una longitud positiva y finita", "od_positive": "El OD debe ser una longitud positiva y finita", "radius_gt_half_od": "El radio ({{radius}} mm) debe ser mayor que OD/2 ({{halfOd}} mm)", "piece_lengths_invalid": "Las longitudes de pieza calculadas no son válidas", "clr_gt_half_od": "El CLR debe ser mayor que OD/2", "beta_range": "El ángulo de corte debe estar entre 0° y {{max}}°"},
    },
    "de": {
        "common": {"na": "k. A.", "noResult": "Gültige Parameter eingeben, um Ergebnisse zu sehen", "selectMode": "Modus auswählen", "engineBadge": "Reine Geometrie-Engine — CROSS_REFERENCE", "results": "Numerische Ergebnisse", "drawing": "Technische Zeichnung"},
        "elbowCut": {"title": "Bogenschnitt-Rechner", "nps": "NPS", "schedule": "Schedule", "elbowType": "Bogentyp", "totalAngle": "Gesamtbogenwinkel", "betaAngle": "Beizubehaltender Winkel (β)", "clrOverride": "CLR-Überschreibung", "cutIntrados": "Schnitt Innenseite", "cutCenterline": "Schnitt Mittellinie", "cutExtrados": "Schnitt Außenseite", "keptArc": "Verbleibende Bogenlänge", "discardedArc": "Abgeschnittene Bogenlänge", "noteGeometry": "Die Schnittebene steht senkrecht zur Winkelhalbierenden des Bogens. Abstände werden ab der Tangentenlinie entlang jeder Oberfläche gemessen.", "noteProvenance": "OD/WT aus ASME B36.10M (CROSS_REFERENCE). CLR-Standardwerte aus ASME B16.9 (langer/kurzer Radius, CROSS_REFERENCE).", "drawPlaceholder": "Parameter eingeben, um den Bogenschnitt zu zeichnen", "cutLabel": "Schnitt"},
        "offset": {"title": "Rohrversatz", "tabWithElbows": "Mit Bögen", "tabWithoutElbows": "Ohne Bögen", "tabVerify": "Prüfen", "a": "A (Vorlauf)", "b": "B (Versatz)", "h": "H (Weg)", "theta": "θ (Winkel)", "nps": "NPS", "schedule": "Schedule", "elbowType": "Bogentyp", "elbowAngle": "Bogenwinkel", "clrOverride": "CLR-Überschreibung", "errorAngle": "Der Bogenwinkel muss zwischen 0° und 90° liegen", "errorClr": "Bogenradius konnte nicht bestimmt werden", "verifyHint": "Genau zwei Werte von A, B, H oder θ eingeben, um das Dreieck zu lösen.", "diagramPlaceholder": "Modus auswählen, um den Versatz zu zeichnen", "travel": "H (Weg)", "takeOut": "Take-out pro Bogen", "straightCut": "Gerader Schnitt", "centerToCenter": "Mitte zu Mitte", "diagonal": "H (Diagonale)", "cutAngleEnd": "Schnittwinkel pro Ende"},
        "miteredElbow": {"title": "Segmentbogen", "nps": "NPS", "schedule": "Schedule", "totalAngle": "Gesamtwinkel", "segments": "Anzahl der Stücke (N)", "elbowType": "Radiustyp", "clrOverride": "CLR-Überschreibung", "noteGeometry": "N gerade Stücke, verbunden durch J = N − 1 Gehrungsstöße. Stoßablenkung δ = Gesamtwinkel / J; Schnittwinkel pro Ende φ = δ / 2.", "noteProvenance": "Stücklängen nach dem Tangentenmodell T = R·tan(δ/2) (Endstück = T, Mittelstück = 2T). OD aus ASME B36.10M (CROSS_REFERENCE). CLR-Standardwerte aus ASME B16.9 (CROSS_REFERENCE).", "notes": "N gerade Stücke, verbunden durch J = N − 1 Gehrungsstöße. δ = Gesamt/J, φ = δ/2. Tangentenmodell: T = R·tan(δ/2); Endstück = T, Mittelstück = 2T.", "drawPlaceholder": "Parameter eingeben, um den Segmentbogen zu zeichnen", "nPieces": "N (Stücke)", "jJoints": "J (Gehrungsstöße)", "jointDeflection": "Ablenkung pro Stoß (δ)", "cutAngleEnd": "Schnittwinkel pro Ende (φ)", "tangentLength": "Tangentenlänge T", "totalCenterline": "Gesamte gerade Mittellinie", "piece": "Stück", "kind": "Typ", "centerline": "Mittellinie", "intrados": "Innenseite", "extrados": "Außenseite", "endPiece": "Endstück", "middlePiece": "Mittelstück"},
        "pipeComb": {"title": "Rohrkamm", "lineCount": "Anzahl der Leitungen", "initialSpacing": "Anfänglicher Mittenabstand", "finalSpacing": "Endgültiger Mittenabstand", "elbowAngle": "Bogenwinkel", "nps": "NPS", "schedule": "Schedule", "elbowType": "Bogentyp", "clrOverride": "CLR-Überschreibung", "noteGeometry": "Jede versetzte Leitung verwendet zwei Bögen mit demselben gewählten Winkel: Weg = Versatz / sin(θ), Vorlauf = Versatz / tan(θ), gerader Schnitt = Weg − 2·Take-out. Die Referenzleitung ist gerade. Negative Schnitte werden explizit zurückgewiesen.", "drawPlaceholder": "Parameter eingeben, um den Rohrkamm zu zeichnen", "startSpacing": "Anfangsabstand", "endSpacing": "Endabstand", "angleLabel": "Bogenwinkel", "travelSpread": "Weg-Differenz", "line": "Leitung", "offset": "Versatz", "advance": "Vorlauf", "travel": "Weg", "straightCut": "Gerader Schnitt", "diff": "Diff."},
        "errors": {"line_count_range": "Die Leitungsanzahl muss eine ganze Zahl zwischen {{min}} und {{max}} sein", "spacing_positive": "Der Mittenabstand muss eine positive endliche Länge sein ({{field}})", "elbow_angle_range": "Der Bogenwinkel muss zwischen 0° und {{max}}° liegen", "clr_positive": "CLR muss ein positiver endlicher Radius sein", "per_line_specs_count": "Die Angaben pro Leitung müssen zur Leitungsanzahl passen", "per_line_clr_invalid": "Leitung {{line}}: CLR pro Leitung muss ein positiver endlicher Radius sein", "advance_invalid": "Leitung {{line}}: berechneter Vorlauf ist ungültig", "negative_cut": "Gerade Schnittlänge ist negativ ({{value}} mm): der Bogenradius ist zu groß für diese Geometrie", "ab_positive": "{{field}} muss eine positive endliche Länge sein", "angle_mismatch": "Die Geometrie erfordert einen {{required}}°-Bogen; der gewählte {{selected}}°-Bogen ist für einen 2D-Parallelversatz unverträglich", "verify_two_values": "Genau zwei Werte von A, B, H oder θ angeben", "verify_h_smaller": "H kann nicht kleiner als {{side}} sein", "verify_invalid": "Prüfdreieck konnte nicht gelöst werden", "segments_min": "N muss eine ganze Zahl ≥ {{min}} gerade Stücke sein", "total_angle_range": "Der Gesamtwinkel muss zwischen 0° und {{max}}° liegen", "radius_positive": "Der Radius muss eine positive endliche Länge sein", "od_positive": "OD muss eine positive endliche Länge sein", "radius_gt_half_od": "Radius ({{radius}} mm) muss größer als OD/2 ({{halfOd}} mm) sein", "piece_lengths_invalid": "Berechnete Stücklängen sind ungültig", "clr_gt_half_od": "CLR muss größer als OD/2 sein", "beta_range": "Der Schnittwinkel muss zwischen 0° und {{max}}° liegen"},
    },
    "fr": {
        "common": {"na": "N/D", "noResult": "Saisir des paramètres valides pour voir les résultats", "selectMode": "Sélectionner un mode", "engineBadge": "Moteur géométrique pur — CROSS_REFERENCE", "results": "Résultats numériques", "drawing": "Plan technique"},
        "elbowCut": {"title": "Calculateur de coupe de coude", "nps": "NPS", "schedule": "Schedule", "elbowType": "Type de coude", "totalAngle": "Angle total du coude", "betaAngle": "Angle à conserver (β)", "clrOverride": "CLR personnalisé", "cutIntrados": "Coupe intrados", "cutCenterline": "Coupe ligne médiane", "cutExtrados": "Coupe extrados", "keptArc": "Longueur d'arc conservée", "discardedArc": "Longueur d'arc supprimée", "noteGeometry": "Le plan de coupe est perpendiculaire à la bissectrice du coude. Les distances sont mesurées depuis la tangente le long de chaque surface.", "noteProvenance": "OD/WT d'après ASME B36.10M (CROSS_REFERENCE). CLR par défaut d'après les tables ASME B16.9 rayon long/court (CROSS_REFERENCE).", "drawPlaceholder": "Saisir les paramètres pour dessiner la coupe du coude", "cutLabel": "coupe"},
        "offset": {"title": "Saut de tuyauterie", "tabWithElbows": "Avec coudes", "tabWithoutElbows": "Sans coudes", "tabVerify": "Vérifier", "a": "A (avance)", "b": "B (décalage)", "h": "H (course)", "theta": "θ (angle)", "nps": "NPS", "schedule": "Schedule", "elbowType": "Type de coude", "elbowAngle": "Angle du coude", "clrOverride": "CLR personnalisé", "errorAngle": "L'angle du coude doit être compris entre 0° et 90°", "errorClr": "Impossible de déterminer le rayon du coude", "verifyHint": "Saisir exactement deux valeurs parmi A, B, H ou θ pour résoudre le triangle.", "diagramPlaceholder": "Sélectionner un mode pour dessiner le saut", "travel": "H (course)", "takeOut": "Take-out par coude", "straightCut": "Coupe droite", "centerToCenter": "Axe à axe", "diagonal": "H (diagonale)", "cutAngleEnd": "Angle de coupe par extrémité"},
        "miteredElbow": {"title": "Coude à segments", "nps": "NPS", "schedule": "Schedule", "totalAngle": "Angle total", "segments": "Nombre de pièces (N)", "elbowType": "Type de rayon", "clrOverride": "CLR personnalisé", "noteGeometry": "N pièces droites jointes par J = N − 1 joints d'onglet. Déviation du joint δ = angle total / J ; angle de coupe par extrémité φ = δ / 2.", "noteProvenance": "Les longueurs de pièces suivent le modèle tangent T = R·tan(δ/2) (pièce d'extrémité = T, pièce intermédiaire = 2T). OD d'après ASME B36.10M (CROSS_REFERENCE). CLR par défaut d'après ASME B16.9 (CROSS_REFERENCE).", "notes": "N pièces droites jointes par J = N − 1 joints d'onglet. δ = total/J, φ = δ/2. Modèle tangent : T = R·tan(δ/2) ; extrémité = T, intermédiaire = 2T.", "drawPlaceholder": "Saisir les paramètres pour dessiner le coude à segments", "nPieces": "N (pièces)", "jJoints": "J (joints d'onglet)", "jointDeflection": "Déviation par joint (δ)", "cutAngleEnd": "Angle de coupe par extrémité (φ)", "tangentLength": "Longueur de tangente T", "totalCenterline": "Ligne médiane droite totale", "piece": "Pièce", "kind": "Type", "centerline": "Ligne médiane", "intrados": "Intrados", "extrados": "Extrados", "endPiece": "Extrémité", "middlePiece": "Intermédiaire"},
        "pipeComb": {"title": "Peigne de tuyauteries", "lineCount": "Nombre de lignes", "initialSpacing": "Écartement initial des axes", "finalSpacing": "Écartement final des axes", "elbowAngle": "Angle du coude", "nps": "NPS", "schedule": "Schedule", "elbowType": "Type de coude", "clrOverride": "CLR personnalisé", "noteGeometry": "Chaque ligne décalée utilise deux coudes du même angle choisi : course = décalage / sin(θ), avance = décalage / tan(θ), coupe droite = course − 2·take-out. La ligne de référence est droite. Les coupes négatives sont rejetées explicitement.", "drawPlaceholder": "Saisir les paramètres pour dessiner le peigne", "startSpacing": "Écartement initial", "endSpacing": "Écartement final", "angleLabel": "Angle du coude", "travelSpread": "Écart de course", "line": "Ligne", "offset": "Décalage", "advance": "Avance", "travel": "Course", "straightCut": "Coupe droite", "diff": "Diff."},
        "errors": {"line_count_range": "Le nombre de lignes doit être un entier entre {{min}} et {{max}}", "spacing_positive": "L'écartement des axes doit être une longueur positive et finie ({{field}})", "elbow_angle_range": "L'angle du coude doit être compris entre 0° et {{max}}°", "clr_positive": "Le CLR doit être un rayon positif et fini", "per_line_specs_count": "Les spécifications par ligne doivent correspondre au nombre de lignes", "per_line_clr_invalid": "Ligne {{line}} : le CLR par ligne doit être un rayon positif et fini", "advance_invalid": "Ligne {{line}} : l'avance calculée est invalide", "negative_cut": "La longueur de coupe droite est négative ({{value}} mm) : le rayon du coude est trop grand pour cette géométrie", "ab_positive": "{{field}} doit être une longueur positive et finie", "angle_mismatch": "La géométrie exige un coude de {{required}}° ; le coude sélectionné de {{selected}}° est incompatible pour un saut 2D de lignes parallèles", "verify_two_values": "Fournir exactement deux valeurs parmi A, B, H ou θ", "verify_h_smaller": "H ne peut pas être inférieur à {{side}}", "verify_invalid": "Impossible de résoudre le triangle de vérification", "segments_min": "N doit être un entier ≥ {{min}} pièces droites", "total_angle_range": "L'angle total doit être compris entre 0° et {{max}}°", "radius_positive": "Le rayon doit être une longueur positive et finie", "od_positive": "L'OD doit être une longueur positive et finie", "radius_gt_half_od": "Le rayon ({{radius}} mm) doit être supérieur à OD/2 ({{halfOd}} mm)", "piece_lengths_invalid": "Les longueurs de pièces calculées sont invalides", "clr_gt_half_od": "Le CLR doit être supérieur à OD/2", "beta_range": "L'angle de coupe doit être compris entre 0° et {{max}}°"},
    },
    "it": {
        "common": {"na": "N/D", "noResult": "Inserisci parametri validi per vedere i risultati", "selectMode": "Seleziona una modalità", "engineBadge": "Motore geometrico puro — CROSS_REFERENCE", "results": "Risultati numerici", "drawing": "Disegno tecnico"},
        "elbowCut": {"title": "Calcolatore di taglio curve", "nps": "NPS", "schedule": "Schedule", "elbowType": "Tipo di curva", "totalAngle": "Angolo totale della curva", "betaAngle": "Angolo da mantenere (β)", "clrOverride": "CLR personalizzato", "cutIntrados": "Taglio intradosso", "cutCenterline": "Taglio linea d'asse", "cutExtrados": "Taglio estradosso", "keptArc": "Lunghezza arco mantenuta", "discardedArc": "Lunghezza arco scartata", "noteGeometry": "Il piano di taglio è perpendicolare alla bisettrice della curva. Le distanze sono misurate dalla tangente lungo ciascuna superficie.", "noteProvenance": "OD/WT da ASME B36.10M (CROSS_REFERENCE). CLR predefiniti da tabelle ASME B16.9 raggio lungo/corto (CROSS_REFERENCE).", "drawPlaceholder": "Inserisci i parametri per disegnare il taglio della curva", "cutLabel": "taglio"},
        "offset": {"title": "Dislivello tubazione", "tabWithElbows": "Con curve", "tabWithoutElbows": "Senza curve", "tabVerify": "Verifica", "a": "A (avanzamento)", "b": "B (disassamento)", "h": "H (corsa)", "theta": "θ (angolo)", "nps": "NPS", "schedule": "Schedule", "elbowType": "Tipo di curva", "elbowAngle": "Angolo della curva", "clrOverride": "CLR personalizzato", "errorAngle": "L'angolo della curva deve essere tra 0° e 90°", "errorClr": "Impossibile determinare il raggio della curva", "verifyHint": "Inserisci esattamente due valori tra A, B, H o θ per risolvere il triangolo.", "diagramPlaceholder": "Seleziona una modalità per disegnare il dislivello", "travel": "H (corsa)", "takeOut": "Take-out per curva", "straightCut": "Taglio diritto", "centerToCenter": "Asse ad asse", "diagonal": "H (diagonale)", "cutAngleEnd": "Angolo di taglio per estremità"},
        "miteredElbow": {"title": "Curva a settori", "nps": "NPS", "schedule": "Schedule", "totalAngle": "Angolo totale", "segments": "Numero di pezzi (N)", "elbowType": "Tipo di raggio", "clrOverride": "CLR personalizzato", "noteGeometry": "N pezzi diritti uniti da J = N − 1 giunti a sesto. Deviazione del giunto δ = angolo totale / J; angolo di taglio per estremità φ = δ / 2.", "noteProvenance": "Le lunghezze dei pezzi seguono il modello tangente T = R·tan(δ/2) (pezzo estremo = T, pezzo intermedio = 2T). OD da ASME B36.10M (CROSS_REFERENCE). CLR predefiniti da ASME B16.9 (CROSS_REFERENCE).", "notes": "N pezzi diritti uniti da J = N − 1 giunti a sesto. δ = totale/J, φ = δ/2. Modello tangente: T = R·tan(δ/2); estremo = T, intermedio = 2T.", "drawPlaceholder": "Inserisci i parametri per disegnare la curva a settori", "nPieces": "N (pezzi)", "jJoints": "J (giunti a sesto)", "jointDeflection": "Deviazione per giunto (δ)", "cutAngleEnd": "Angolo di taglio per estremità (φ)", "tangentLength": "Lunghezza tangente T", "totalCenterline": "Linea d'asse diritta totale", "piece": "Pezzo", "kind": "Tipo", "centerline": "Linea d'asse", "intrados": "Intradosso", "extrados": "Estradosso", "endPiece": "Estremo", "middlePiece": "Intermedio"},
        "pipeComb": {"title": "Pettine di tubazioni", "lineCount": "Numero di linee", "initialSpacing": "Interasse iniziale", "finalSpacing": "Interasse finale", "elbowAngle": "Angolo della curva", "nps": "NPS", "schedule": "Schedule", "elbowType": "Tipo di curva", "clrOverride": "CLR personalizzato", "noteGeometry": "Ogni linea disassata usa due curve dello stesso angolo selezionato: corsa = disassamento / sin(θ), avanzamento = disassamento / tan(θ), taglio diritto = corsa − 2·take-out. La linea di riferimento è diritta. I tagli negativi sono rifiutati esplicitamente.", "drawPlaceholder": "Inserisci i parametri per disegnare il pettine", "startSpacing": "Interasse iniziale", "endSpacing": "Interasse finale", "angleLabel": "Angolo della curva", "travelSpread": "Differenza di corsa", "line": "Linea", "offset": "Disassamento", "advance": "Avanzamento", "travel": "Corsa", "straightCut": "Taglio diritto", "diff": "Diff."},
        "errors": {"line_count_range": "Il numero di linee deve essere un intero tra {{min}} e {{max}}", "spacing_positive": "L'interasse deve essere una lunghezza positiva e finita ({{field}})", "elbow_angle_range": "L'angolo della curva deve essere tra 0° e {{max}}°", "clr_positive": "Il CLR deve essere un raggio positivo e finito", "per_line_specs_count": "Le specifiche per linea devono corrispondere al numero di linee", "per_line_clr_invalid": "Linea {{line}}: il CLR per linea deve essere un raggio positivo e finito", "advance_invalid": "Linea {{line}}: l'avanzamento calcolato non è valido", "negative_cut": "La lunghezza di taglio diritto è negativa ({{value}} mm): il raggio della curva è troppo grande per questa geometria", "ab_positive": "{{field}} deve essere una lunghezza positiva e finita", "angle_mismatch": "La geometria richiede una curva di {{required}}°; la curva selezionata di {{selected}}° è incompatibile per un dislivello 2D di linee parallele", "verify_two_values": "Fornisci esattamente due valori tra A, B, H o θ", "verify_h_smaller": "H non può essere minore di {{side}}", "verify_invalid": "Impossibile risolvere il triangolo di verifica", "segments_min": "N deve essere un intero ≥ {{min}} pezzi diritti", "total_angle_range": "L'angolo totale deve essere tra 0° e {{max}}°", "radius_positive": "Il raggio deve essere una lunghezza positiva e finita", "od_positive": "L'OD deve essere una lunghezza positiva e finita", "radius_gt_half_od": "Il raggio ({{radius}} mm) deve essere maggiore di OD/2 ({{halfOd}} mm)", "piece_lengths_invalid": "Le lunghezze dei pezzi calcolate non sono valide", "clr_gt_half_od": "Il CLR deve essere maggiore di OD/2", "beta_range": "L'angolo di taglio deve essere tra 0° e {{max}}°"},
    },
    "nl": {
        "common": {"na": "n.v.t.", "noResult": "Voer geldige parameters in om resultaten te zien", "selectMode": "Selecteer een modus", "engineBadge": "Pure geometrie-engine — CROSS_REFERENCE", "results": "Numerieke resultaten", "drawing": "Technische tekening"},
        "elbowCut": {"title": "Bochtsnede-calculator", "nps": "NPS", "schedule": "Schedule", "elbowType": "Bochttype", "totalAngle": "Totale bochthoek", "betaAngle": "Te behouden hoek (β)", "clrOverride": "CLR-override", "cutIntrados": "Snede binnenzijde", "cutCenterline": "Snede hartlijn", "cutExtrados": "Snede buitenzijde", "keptArc": "Behouden booglengte", "discardedArc": "Verwijderde booglengte", "noteGeometry": "Het snijvlak staat loodrecht op de bissectrice van de bocht. Afstanden worden gemeten vanaf de raaklijn langs elk oppervlak.", "noteProvenance": "OD/WT uit ASME B36.10M (CROSS_REFERENCE). CLR-standaardwaarden uit ASME B16.9 (lange/korte radius, CROSS_REFERENCE).", "drawPlaceholder": "Voer parameters in om de bochtsnede te tekenen", "cutLabel": "snede"},
        "offset": {"title": "Buissprong", "tabWithElbows": "Met bochten", "tabWithoutElbows": "Zonder bochten", "tabVerify": "Controleren", "a": "A (aanloop)", "b": "B (verspringing)", "h": "H (weg)", "theta": "θ (hoek)", "nps": "NPS", "schedule": "Schedule", "elbowType": "Bochttype", "elbowAngle": "Bochthoek", "clrOverride": "CLR-override", "errorAngle": "De bochthoek moet tussen 0° en 90° liggen", "errorClr": "Kon de bochtradius niet bepalen", "verifyHint": "Voer exact twee waarden van A, B, H of θ in om de driehoek op te lossen.", "diagramPlaceholder": "Selecteer een modus om de sprong te tekenen", "travel": "H (weg)", "takeOut": "Take-out per bocht", "straightCut": "Rechte snede", "centerToCenter": "Hart-op-hart", "diagonal": "H (diagonaal)", "cutAngleEnd": "Snijhoek per uiteinde"},
        "miteredElbow": {"title": "Gesegmenteerde bocht", "nps": "NPS", "schedule": "Schedule", "totalAngle": "Totale hoek", "segments": "Aantal stukken (N)", "elbowType": "Radiustype", "clrOverride": "CLR-override", "noteGeometry": "N rechte stukken verbonden door J = N − 1 verstekverbindingen. Verbindingshoek δ = totale hoek / J; snijhoek per uiteinde φ = δ / 2.", "noteProvenance": "Stuklengtes volgen het raaklijnmodel T = R·tan(δ/2) (eindstuk = T, tussenstuk = 2T). OD uit ASME B36.10M (CROSS_REFERENCE). CLR-standaardwaarden uit ASME B16.9 (CROSS_REFERENCE).", "notes": "N rechte stukken verbonden door J = N − 1 verstekverbindingen. δ = totaal/J, φ = δ/2. Raaklijnmodel: T = R·tan(δ/2); eindstuk = T, tussenstuk = 2T.", "drawPlaceholder": "Voer parameters in om de gesegmenteerde bocht te tekenen", "nPieces": "N (stukken)", "jJoints": "J (verstekverbindingen)", "jointDeflection": "Afbuiging per verbinding (δ)", "cutAngleEnd": "Snijhoek per uiteinde (φ)", "tangentLength": "Raaklijnlengte T", "totalCenterline": "Totale rechte hartlijn", "piece": "Stuk", "kind": "Type", "centerline": "Hartlijn", "intrados": "Binnenzijde", "extrados": "Buitenzijde", "endPiece": "Eindstuk", "middlePiece": "Tussenstuk"},
        "pipeComb": {"title": "Buiskam", "lineCount": "Aantal leidingen", "initialSpacing": "Begin hart-op-hartafstand", "finalSpacing": "Eind hart-op-hartafstand", "elbowAngle": "Bochthoek", "nps": "NPS", "schedule": "Schedule", "elbowType": "Bochttype", "clrOverride": "CLR-override", "noteGeometry": "Elke versprongen leiding gebruikt twee bochten met dezelfde gekozen hoek: weg = verspringing / sin(θ), aanloop = verspringing / tan(θ), rechte snede = weg − 2·take-out. De referentieleiding is recht. Negatieve sneden worden expliciet afgewezen.", "drawPlaceholder": "Voer parameters in om de buiskam te tekenen", "startSpacing": "Beginafstand", "endSpacing": "Eindafstand", "angleLabel": "Bochthoek", "travelSpread": "Wegverschil", "line": "Leiding", "offset": "Verspringing", "advance": "Aanloop", "travel": "Weg", "straightCut": "Rechte snede", "diff": "Verschil"},
        "errors": {"line_count_range": "Het aantal leidingen moet een geheel getal tussen {{min}} en {{max}} zijn", "spacing_positive": "De hart-op-hartafstand moet een positieve eindige lengte zijn ({{field}})", "elbow_angle_range": "De bochthoek moet tussen 0° en {{max}}° liggen", "clr_positive": "CLR moet een positieve eindige radius zijn", "per_line_specs_count": "De specificaties per leiding moeten overeenkomen met het aantal leidingen", "per_line_clr_invalid": "Leiding {{line}}: CLR per leiding moet een positieve eindige radius zijn", "advance_invalid": "Leiding {{line}}: berekende aanloop is ongeldig", "negative_cut": "Rechte snijlengte is negatief ({{value}} mm): de bochtradius is te groot voor deze geometrie", "ab_positive": "{{field}} moet een positieve eindige lengte zijn", "angle_mismatch": "De geometrie vereist een bocht van {{required}}°; de gekozen bocht van {{selected}}° is onverenigbaar voor een 2D-parallelsprong", "verify_two_values": "Geef exact twee waarden van A, B, H of θ op", "verify_h_smaller": "H kan niet kleiner zijn dan {{side}}", "verify_invalid": "Kan de controledriehoek niet oplossen", "segments_min": "N moet een geheel getal ≥ {{min}} rechte stukken zijn", "total_angle_range": "De totale hoek moet tussen 0° en {{max}}° liggen", "radius_positive": "De radius moet een positieve eindige lengte zijn", "od_positive": "OD moet een positieve eindige lengte zijn", "radius_gt_half_od": "Radius ({{radius}} mm) moet groter zijn dan OD/2 ({{halfOd}} mm)", "piece_lengths_invalid": "Berekende stuklengtes zijn ongeldig", "clr_gt_half_od": "CLR moet groter zijn dan OD/2", "beta_range": "De snijhoek moet tussen 0° en {{max}}° liggen"},
    },
    "pt": {
        "common": {"na": "N/D", "noResult": "Introduza parâmetros válidos para ver resultados", "selectMode": "Selecionar um modo", "engineBadge": "Motor geométrico puro — CROSS_REFERENCE", "results": "Resultados numéricos", "drawing": "Desenho técnico"},
        "elbowCut": {"title": "Calculadora de corte de curvas", "nps": "NPS", "schedule": "Schedule", "elbowType": "Tipo de curva", "totalAngle": "Ângulo total da curva", "betaAngle": "Ângulo a manter (β)", "clrOverride": "CLR personalizado", "cutIntrados": "Corte intradorso", "cutCenterline": "Corte linha de centro", "cutExtrados": "Corte extradorso", "keptArc": "Comprimento de arco mantido", "discardedArc": "Comprimento de arco descartado", "noteGeometry": "O plano de corte é perpendicular à bissetriz da curva. As distâncias são medidas a partir da tangente ao longo de cada superfície.", "noteProvenance": "OD/WT da ASME B36.10M (CROSS_REFERENCE). CLR predefinido das tabelas ASME B16.9 raio longo/curto (CROSS_REFERENCE).", "drawPlaceholder": "Introduza parâmetros para desenhar o corte da curva", "cutLabel": "corte"},
        "offset": {"title": "Desvio de tubagem", "tabWithElbows": "Com curvas", "tabWithoutElbows": "Sem curvas", "tabVerify": "Verificar", "a": "A (avanço)", "b": "B (desvio)", "h": "H (percurso)", "theta": "θ (ângulo)", "nps": "NPS", "schedule": "Schedule", "elbowType": "Tipo de curva", "elbowAngle": "Ângulo da curva", "clrOverride": "CLR personalizado", "errorAngle": "O ângulo da curva deve estar entre 0° e 90°", "errorClr": "Não foi possível determinar o raio da curva", "verifyHint": "Introduza exatamente dois valores de A, B, H ou θ para resolver o triângulo.", "diagramPlaceholder": "Selecione um modo para desenhar o desvio", "travel": "H (percurso)", "takeOut": "Take-out por curva", "straightCut": "Corte reto", "centerToCenter": "Centro a centro", "diagonal": "H (diagonal)", "cutAngleEnd": "Ângulo de corte por extremidade"},
        "miteredElbow": {"title": "Curva segmentada", "nps": "NPS", "schedule": "Schedule", "totalAngle": "Ângulo total", "segments": "Número de peças (N)", "elbowType": "Tipo de raio", "clrOverride": "CLR personalizado", "noteGeometry": "N peças retas unidas por J = N − 1 juntas de esquadria. Deflexão da junta δ = ângulo total / J; ângulo de corte por extremidade φ = δ / 2.", "noteProvenance": "Os comprimentos das peças seguem o modelo de tangentes T = R·tan(δ/2) (peça de extremidade = T, peça intermédia = 2T). OD da ASME B36.10M (CROSS_REFERENCE). CLR predefinido da ASME B16.9 (CROSS_REFERENCE).", "notes": "N peças retas unidas por J = N − 1 juntas de esquadria. δ = total/J, φ = δ/2. Modelo de tangentes: T = R·tan(δ/2); extremidade = T, intermédia = 2T.", "drawPlaceholder": "Introduza parâmetros para desenhar a curva segmentada", "nPieces": "N (peças)", "jJoints": "J (juntas)", "jointDeflection": "Deflexão por junta (δ)", "cutAngleEnd": "Ângulo de corte por extremidade (φ)", "tangentLength": "Comprimento de tangente T", "totalCenterline": "Linha de centro reta total", "piece": "Peça", "kind": "Tipo", "centerline": "Linha de centro", "intrados": "Intradorso", "extrados": "Extradorso", "endPiece": "Extremidade", "middlePiece": "Intermédia"},
        "pipeComb": {"title": "Pente de tubagens", "lineCount": "Número de linhas", "initialSpacing": "Espaçamento inicial entre eixos", "finalSpacing": "Espaçamento final entre eixos", "elbowAngle": "Ângulo da curva", "nps": "NPS", "schedule": "Schedule", "elbowType": "Tipo de curva", "clrOverride": "CLR personalizado", "noteGeometry": "Cada linha desviada usa duas curvas do mesmo ângulo selecionado: percurso = desvio / sin(θ), avanço = desvio / tan(θ), corte reto = percurso − 2·take-out. A linha de referência é reta. Cortes negativos são rejeitados explicitamente.", "drawPlaceholder": "Introduza parâmetros para desenhar o pente", "startSpacing": "Espaçamento inicial", "endSpacing": "Espaçamento final", "angleLabel": "Ângulo da curva", "travelSpread": "Diferença de percurso", "line": "Linha", "offset": "Desvio", "advance": "Avanço", "travel": "Percurso", "straightCut": "Corte reto", "diff": "Dif."},
        "errors": {"line_count_range": "O número de linhas deve ser um inteiro entre {{min}} e {{max}}", "spacing_positive": "O espaçamento entre eixos deve ser um comprimento positivo e finito ({{field}})", "elbow_angle_range": "O ângulo da curva deve estar entre 0° e {{max}}°", "clr_positive": "O CLR deve ser um raio positivo e finito", "per_line_specs_count": "As especificações por linha devem corresponder ao número de linhas", "per_line_clr_invalid": "Linha {{line}}: o CLR por linha deve ser um raio positivo e finito", "advance_invalid": "Linha {{line}}: o avanço calculado é inválido", "negative_cut": "O comprimento de corte reto é negativo ({{value}} mm): o raio da curva é demasiado grande para esta geometria", "ab_positive": "{{field}} deve ser um comprimento positivo e finito", "angle_mismatch": "A geometria requer uma curva de {{required}}°; a curva selecionada de {{selected}}° é incompatível para um desvio 2D de linhas paralelas", "verify_two_values": "Forneça exatamente dois valores de A, B, H ou θ", "verify_h_smaller": "H não pode ser menor que {{side}}", "verify_invalid": "Não foi possível resolver o triângulo de verificação", "segments_min": "N deve ser um inteiro ≥ {{min}} peças retas", "total_angle_range": "O ângulo total deve estar entre 0° e {{max}}°", "radius_positive": "O raio deve ser um comprimento positivo e finito", "od_positive": "O OD deve ser um comprimento positivo e finito", "radius_gt_half_od": "O raio ({{radius}} mm) deve ser maior que OD/2 ({{halfOd}} mm)", "piece_lengths_invalid": "Os comprimentos de peça calculados são inválidos", "clr_gt_half_od": "O CLR deve ser maior que OD/2", "beta_range": "O ângulo de corte deve estar entre 0° e {{max}}°"},
    },
}


def build_prefab(locale: str) -> OrderedDict:
    if locale == 'en':
        return EN
    tr = T[locale]
    out = OrderedDict()
    for section, keys in EN.items():
        out[section] = OrderedDict()
        for key in keys:
            out[section][key] = tr[section][key]
    return out


def flatten(d, prefix=''):
    items = {}
    for k, v in d.items():
        if isinstance(v, dict):
            items.update(flatten(v, f'{prefix}{k}.'))
        else:
            items[f'{prefix}{k}'] = v
    return items


for locale in LOCALES:
    path = f'src/i18n/locales/{locale}.json'
    with open(path, encoding='utf-8') as f:
        data = json.load(f, object_pairs_hook=OrderedDict)
    data['tools']['prefab'] = build_prefab(locale)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write('\n')

# Parity check: every locale must expose exactly the same prefab key set.
ref = flatten(build_prefab('en'))
for locale in LOCALES[1:]:
    keys = flatten(build_prefab(locale))
    missing = set(ref) - set(keys)
    extra = set(keys) - set(ref)
    assert not missing and not extra, f'{locale}: missing={missing} extra={extra}'
print(f'OK: prefab rewritten in {len(LOCALES)} locales, {len(ref)} keys each, parity PASS')
