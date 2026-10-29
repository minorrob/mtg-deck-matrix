# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
SUITES = ['tests/engine-battles.mjs']
SCHEMA = 'game/engine/script/schema.mjs'
COMPILER = 'game/engine/cards/index.mjs'
STATE = 'game/engine/state/index.mjs'
LAYERS = 'game/engine/rules/layers.mjs'
ENTRY = 'game/engine/rules/pre-entry.mjs'
VIEW = 'game/engine/projection.mjs'
BREAKS = [
    ('Oracle compiler identity omits defense', 'game/engine/cards/compile.mjs', '    ...(num(face.defense) !== null ? {defense: num(face.defense)} : {}),\n', ''),
    ('Python writer identity omits defense', 'game/tools/batch/cardlib.py', "            **({'defense': num(face['defense'])} if face.get('defense') is not None else {}),\n", ''),
    ('malformed printed defense admitted', SCHEMA, 'if (identity.defense !== undefined && identity.defense !== null && !(Number.isInteger(identity.defense) && identity.defense >= 0))', 'if (false)'),
    ('Battle may omit printed defense', SCHEMA, 'if ((identity.types ?? []).includes("Battle") && identity.defense == null)', 'if (false)'),
    ('compiler drops printed defense', COMPILER, '    ...(Number.isInteger(identity.defense) ? {defense: identity.defense} : {}),\n', ''),
    ('compiled face drops defense', COMPILER, '...(Number.isInteger(d.defense) ? {defense: d.defense} : {}), ', ''),
    ('state constructor drops defense', STATE, '    ...(Number.isInteger(object.defense) ? {defense: object.defense} : {}),\n', ''),
    ('face switch drops defense', STATE,
     'const FACE_KEYS = ["card", "types", "subtypes", "supertypes", "manaCost", "colors", "power", "toughness", "loyalty", "defense", "keywords", "abilities", "spell", "enchant"];',
     'const FACE_KEYS = ["card", "types", "subtypes", "supertypes", "manaCost", "colors", "power", "toughness", "loyalty", "keywords", "abilities", "spell", "enchant"];'),
    ('copy application drops defense', STATE,
     'export const COPY_KEYS = Object.freeze(["card", "manaCost", "types", "subtypes", "supertypes", "colors", "keywords", "abilities", "power", "toughness", "loyalty", "defense", "spell", "enchant", "preparation"]);',
     'export const COPY_KEYS = Object.freeze(["card", "manaCost", "types", "subtypes", "supertypes", "colors", "keywords", "abilities", "power", "toughness", "loyalty", "spell", "enchant", "preparation"]);'),
    ('hidden card identity drops defense', STATE,
     'const CARD_KEYS = ["card", "types", "subtypes", "supertypes", "manaCost", "colors", "power", "toughness", "loyalty", "defense", "keywords", "abilities", "spell", "enchant", "mdfc", "preparation", "adventurer"];',
     'const CARD_KEYS = ["card", "types", "subtypes", "supertypes", "manaCost", "colors", "power", "toughness", "loyalty", "keywords", "abilities", "spell", "enchant", "mdfc", "preparation", "adventurer"];'),
    ('zone change drops defense', STATE, 'loyalty: from.loyalty, defense: from.defense, keywords:', 'loyalty: from.loyalty, keywords:'),
    ('derived printed defense absent', LAYERS, '    ...(Number.isInteger(object.defense) ? {defense: object.defense} : {}),\n', ''),
    ('current defense stays printed', LAYERS, '    if (state.objects[id].zone === "battlefield") current.defense = current.counters.defense ?? 0;\n', ''),
    ('non-Battle retains defense characteristic', LAYERS, '  } else delete current.defense;', '  }'),
    ('last-known current defense absent', LAYERS, '    ...(Number.isInteger(current.defense) ? {defense: current.defense} : {}),\n', ''),
    ('last-known printed defense absent', LAYERS, '    ...(Number.isInteger(current.printedDefense) ? {printedDefense: current.printedDefense} : {}),\n', ''),
    ('last-known copiable defense absent', LAYERS,
     'const COPIED_KEYS = Object.freeze(["card", "manaCost", "types", "subtypes", "supertypes", "colors", "keywords", "abilities", "power", "toughness", "loyalty", "defense", "spell", "enchant", "preparation"]);',
     'const COPIED_KEYS = Object.freeze(["card", "manaCost", "types", "subtypes", "supertypes", "colors", "keywords", "abilities", "power", "toughness", "loyalty", "spell", "enchant", "preparation"]);'),
    ('copy construction drops defense', 'game/engine/script/effects/permanents.mjs', '    ...(Number.isInteger(object.defense) ? {defense: object.defense} : {}),\n', ''),
    ('redirected entrant asks protector', ENTRY, 'if (!frame.to && current.types.includes("Battle")) {', 'if (current.types.includes("Battle")) {'),
    ('no protector question', ENTRY, 'else if (eligible.length && !eligible.includes(frame.selectedProtector)) {', 'else if (false) {'),
    ('departed opponents remain eligible', ENTRY, 'state.players.filter(player => !player.lost && (!siege || player.id !== frame.player))', 'state.players.filter(player => (!siege || player.id !== frame.player))'),
    ('Siege controller eligible', ENTRY, '(!siege || player.id !== frame.player)', 'true'),
    ('untyped Battle gets an opponent', ENTRY, 'if (!siege) frame.objectPatch.set.protector = frame.player;', 'if (!siege) frame.objectPatch.set.protector = (frame.player + 1) % state.players.length;'),
    ('explicit protector replaced by first opponent', ENTRY, 'else if (eligible.length) frame.objectPatch.set.protector = frame.selectedProtector;', 'else if (eligible.length) frame.objectPatch.set.protector = eligible[0];'),
    ('saved protector answer forgotten', ENTRY, '    frame.selectedProtector = frame.battleOptions[frame.answer.indices[0]];\n', ''),
    ('non-Battle gets defense counters', ENTRY, 'if (current.types.includes("Battle") && !current.lostAbilities && Number.isInteger(object.defense))', 'if (!current.lostAbilities && Number.isInteger(object.defense))'),
    ('lost intrinsic ability still gives defense', ENTRY, 'if (current.types.includes("Battle") && !current.lostAbilities && Number.isInteger(object.defense))', 'if (current.types.includes("Battle") && Number.isInteger(object.defense))'),
    ('printed entry defense omitted', ENTRY, '  if (current.types.includes("Battle") && !current.lostAbilities && Number.isInteger(object.defense)) counters.defense = (counters.defense ?? 0) + object.defense;\n', ''),
    ('entry defense read from empty prospective counters', ENTRY, 'counters.defense = (counters.defense ?? 0) + object.defense;', 'counters.defense = (counters.defense ?? 0) + current.defense;'),
    ('face-down Battle fields exposed', VIEW, '...(named && object.zone === "battlefield" && current.types.includes("Battle") ? {', '...(object.zone === "battlefield" && current.types.includes("Battle") ? {'),
    ('private card gets battlefield Battle fields', VIEW, '...(named && object.zone === "battlefield" && current.types.includes("Battle") ? {', '...(named && current.types.includes("Battle") ? {'),
    ('non-Battle gets Battle projection', VIEW, '...(named && object.zone === "battlefield" && current.types.includes("Battle") ? {', '...(named && object.zone === "battlefield" ? {'),
    ('projection omits printed defense', VIEW, '      ...(Number.isInteger(current.printedDefense) ? {printedDefense: current.printedDefense} : {}), ', '      '),
    ('projection reports printed as current defense', VIEW, 'defense: current.defense,', 'defense: current.printedDefense,'),
    ('projection omits protector', VIEW, '      ...(Number.isInteger(object.protector) ? {protector: object.protector} : {}),\n', ''),
]
