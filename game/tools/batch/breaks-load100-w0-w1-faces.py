# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Elspeth's emblem and copiable preparation characteristics, plus the legacy anchors they move."""
import json
from pathlib import Path
import runpy

SUITES = ['tests/engine-load100-w1-faces.mjs', 'tests/engine-prepare.mjs']
STATE = 'game/engine/state/index.mjs'
LAYERS = 'game/engine/rules/layers.mjs'
PERMANENTS = 'game/engine/script/effects/permanents.mjs'
REPLACEMENT = 'game/engine/rules/replacement.mjs'
ENTERING = 'game/engine/rules/entering.mjs'

def effects_block(effects):
    lines = json.dumps(effects, indent=2, ensure_ascii=False).splitlines()
    return '      "effects": ' + '\n'.join(line if i == 0 else '      ' + line for i, line in enumerate(lines))

ELSPETH_STATICS = [
    {'kind': 'static', 'text': 'Creatures you control get +2/+2 and have flying.',
     'layer': 7, 'sublayer': 'c', 'affects': {'what': 'permanent', 'types': ['Creature'], 'controller': 'you'},
     'apply': {'power': 2, 'toughness': 2}},
    {'kind': 'static', 'text': 'Creatures you control get +2/+2 and have flying.',
     'layer': 6, 'affects': {'what': 'permanent', 'types': ['Creature'], 'controller': 'you'},
     'apply': {'addKeywords': ['Flying']}},
]
EMBLEM = effects_block([{'effect': 'emblem', 'abilities': ELSPETH_STATICS}])
ANONYMOUS = effects_block([{'effect': 'effectUntil', 'until': 'ever', **{k: v for k, v in ability.items() if k not in ('kind', 'text')}}
                           for ability in ELSPETH_STATICS])
OWN_DESIGNATIONS = '''  /* Copied preparation cards also enter with their designation (CR 614.12, 722.3a). */
  return {tapped: proposal.tapped === true, counters, asks: withChoiceCounters(proposal), designations: proposal.designations ?? []};'''

BREAKS = [
    ('Elspeth makes an actual emblem', 'game/engine/cards/e/elspeth-suns-champion.json', EMBLEM, ANONYMOUS),
    ('copy effects replace preparation characteristics', STATE,
     '"spell", "enchant", "preparation"]);', '"spell", "enchant"]);'),
    ('copy names override inset source names', STATE,
     'card: (object.preparation ? (object.card ?? object.preparation.of)?.split(" // ")[0] : object.card) ?? null,',
     'card: object.preparation?.of ?? object.card ?? null,'),
    ('last known copies keep their inset', LAYERS,
     '"spell", "enchant", "preparation"]);', '"spell", "enchant"]);'),
    ('the inset is a copiable value', PERMANENTS,
     '    ...(object.preparation ? {preparation: structuredClone(object.preparation)} : {}),\n', ''),
    ('token copies apply their prepared entry', PERMANENTS,
     '      if (values.preparation) {', '      if (false) {'),
    ('token-copy entry gives the prepared designation', PERMANENTS,
     '        if ((entering.designations ?? []).includes("prepared")) prepare(state, copy, events);', ''),
    ('literal preparation tokens retain the inset', PERMANENTS,
     '    ...(spec.preparation ? {preparation: structuredClone(spec.preparation)} : {}),\n', ''),
    ('literal preparation tokens apply entry', PERMANENTS,
     '  if (state.objects[id].preparation) {', '  if (false) {'),
    ('tapped preparation tokens still prepare', PERMANENTS,
     '    const preparedEntry = entering ?? enteringModifications(state, {objectId: id, player: controller, types: state.objects[id].types, abilities: state.objects[id].abilities});',
     '    const preparedEntry = entering ?? {designations: []};'),
    ('literal-token entry gives the prepared designation', PERMANENTS,
     '    if ((preparedEntry.designations ?? []).includes("prepared")) prepare(state, id, events);', ''),
    ('a copied entering card carries designations', REPLACEMENT, OWN_DESIGNATIONS,
     '  return {tapped: proposal.tapped === true, counters, asks: withChoiceCounters(proposal), designations: []};'),
    ('a Clone becomes prepared as it enters', ENTERING,
     '      if ((own.designations ?? []).includes("prepared")) prepare(state, awaiting.objectId, events);', ''),
]

# Prove the exact legacy mutations after re-anchoring, with their original suites retained. The suite union runs one
# unbroken baseline, avoiding repeated full card sweeps just to validate four moved anchors.
for filename, labels in [
    ('breaks-wave4a-h3.py', {'copied planeswalker: loyalty counters', 'COPY_KEYS: loyalty', 'last known copiable: loyalty'}),
    ('breaks-wave4c-k3.py', {'chosen counters: a copy entering'}),
]:
    spec = runpy.run_path(str(Path(__file__).with_name(filename)))
    SUITES.extend(suite for suite in spec['SUITES'] if suite not in SUITES)
    BREAKS.extend(item for item in spec['BREAKS'] if item[0] in labels)
