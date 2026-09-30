#!/usr/bin/env python3
"""H-001 final hardening: update contactConvention (SET-ON) and add closure360 +
isometricNote keys in all 11 locales. Point insertion, no reformatting."""
import json
from collections import OrderedDict
import io

LOCALES = {
    'en': {
        'contactConvention': 'SET-ON (branch resting on the header): branch cut on branch OD against header OD. Header hole (picaje): branch ID. Template wrap and station spacing: branch OD.',
        'closure360': '360° closure = P1',
        'isometricNote': 'Set-on: the branch rests on the header OD. The amber curve is the cut saddle from the calculation engine.',
    },
    'es': {
        'contactConvention': 'SET-ON (ramal apoyado sobre el colector): corte del ramal sobre el OD del ramal contra el OD del colector. Picaje del colector: ID del ramal. Desarrollo de plantilla y paso entre puntos: OD del ramal.',
        'closure360': 'CIERRE 360° = P1',
        'isometricNote': 'Set-on: el ramal se apoya sobre el OD del colector. La curva ámbar es la silla de corte del motor de cálculo.',
    },
    'pt': {
        'contactConvention': 'SET-ON (ramal apoiado sobre o coletor): corte do ramal sobre o OD do ramal contra o OD do coletor. Picagem do coletor: ID do ramal. Desenvolvimento do gabarito e passo entre pontos: OD do ramal.',
        'closure360': 'FECHO 360° = P1',
        'isometricNote': 'Set-on: o ramal apoia-se sobre o OD do coletor. A curva âmbar é a sela de corte do motor de cálculo.',
    },
    'fr': {
        'contactConvention': 'SET-ON (piquage posé sur le collecteur) : coupe du piquage sur le OD du piquage contre le OD du collecteur. Traçage du collecteur (picaje) : ID du piquage. Développé du gabarit et pas entre points : OD du piquage.',
        'closure360': 'FERMETURE 360° = P1',
        'isometricNote': 'Set-on : le piquage repose sur le OD du collecteur. La courbe ambre est la selle de coupe du moteur de calcul.',
    },
    'de': {
        'contactConvention': 'SET-ON (Abzweig aufliegend auf dem Sammler): Abzweigschnitt auf Abzweig-Außendurchmesser gegen Sammler-Außendurchmesser. Sammler-Anriss (Picaje): Abzweig-Innendurchmesser. Abwicklung der Schablone und Punkt Abstand: Abzweig-Außendurchmesser.',
        'closure360': '360°-ABSCHLUSS = P1',
        'isometricNote': 'Set-on: der Abzweig ruht auf dem Außendurchmesser des Sammlers. Die amberfarbene Kurve ist die Schnittsattel-Kurve der Berechnungs-Engine.',
    },
    'it': {
        'contactConvention': 'SET-ON (ramo appoggiato sul collettore): taglio del ramo sull\'OD del ramo contro l\'OD del collettore. Piccaggio del collettore: ID del ramo. Sviluppo del template e passo tra punti: OD del ramo.',
        'closure360': 'CHIUSURA 360° = P1',
        'isometricNote': 'Set-on: il ramo poggia sull\'OD del collettore. La curva ambra è la sella di taglio del motore di calcolo.',
    },
    'nl': {
        'contactConvention': 'SET-ON (tak steunend op de collector): snede van de tak op de OD van de tak tegen de OD van de collector. Picaje (uitslag) van de collector: ID van de tak. Ontwikkeling van het sjabloon en puntafstand: OD van de tak.',
        'closure360': '360°-SLUITING = P1',
        'isometricNote': 'Set-on: de tak rust op de OD van de collector. De amberkleurige kromme is de snijzadel-kromme van de rekenmotor.',
    },
    'pl': {
        'contactConvention': 'SET-ON (odgałęzienie oparte na kolektorze): cięcie odgałęzienia po OD odgałęzienia względem OD kolektora. Trasowanie otworu kolektora (picaje): ID odgałęzienia. Rozwinięcie szablonu i krok między punktami: OD odgałęzienia.',
        'closure360': 'ZAMKNIĘCIE 360° = P1',
        'isometricNote': 'Set-on: odgałęzienie opiera się na OD kolektora. Bursztynowa krzywa to siodło cięcia z silnika obliczeniowego.',
    },
    'ro': {
        'contactConvention': 'SET-ON (ramură sprijinită pe colector): tăierea ramurii pe OD-ul ramurii contra OD-ului colectorului. Picajul colectorului: ID-ul ramurii. Dezvoltarea șablonului și pasul dintre puncte: OD-ul ramurii.',
        'closure360': 'ÎNCHIDERE 360° = P1',
        'isometricNote': 'Set-on: ramura se sprijină pe OD-ul colectorului. Curba amber este șaua de tăiere a motorului de calcul.',
    },
    'bg': {
        'contactConvention': 'SET-ON (клон, опрян на колектора): срез на клона по OD на клона срещу OD на колектора. Трасиране на отвора на колектора (picaje): ID на клона. Разгъване на шаблона и стъпка между точките: OD на клона.',
        'closure360': 'ЗАТВАРЯНЕ 360° = P1',
        'isometricNote': 'Set-on: клонът опира на OD на колектора. Кехлибарената крива е срезното седло от изчислителния двигател.',
    },
    'uk': {
        'contactConvention': 'SET-ON (відгалуження, що спирається на колектор): розріз відгалуження по OD відгалуження проти OD колектора. Розмічання отвору колектора (picaje): ID відгалуження. Розгортка шаблону та крок між точками: OD відгалуження.',
        'closure360': 'ЗАМИКАННЯ 360° = P1',
        'isometricNote': 'Set-on: відгалуження спирається на OD колектора. Бурштинова крива — сідло розрізу від обчислювального рушія.',
    },
}

BASE = 'src/i18n/locales/{}.json'

for loc, vals in LOCALES.items():
    path = BASE.format(loc)
    with io.open(path, encoding='utf-8') as f:
        data = json.load(f, object_pairs_hook=OrderedDict)
    bl = data['tools']['branchLayout']
    changed = []
    if 'contactConvention' in bl:
        bl['contactConvention'] = vals['contactConvention']
        changed.append('contactConvention')
    # Insert new keys right after calibrationNote (keeps related keys together).
    new_bl = OrderedDict()
    for k, v in bl.items():
        new_bl[k] = v
        if k == 'calibrationNote':
            new_bl['closure360'] = vals['closure360']
            new_bl['isometricNote'] = vals['isometricNote']
    if 'closure360' not in new_bl:
        new_bl['closure360'] = vals['closure360']
        new_bl['isometricNote'] = vals['isometricNote']
    data['tools']['branchLayout'] = new_bl
    with io.open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(f'{loc}: updated {changed} + added closure360/isometricNote')
print('done')
