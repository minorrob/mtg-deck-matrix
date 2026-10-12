# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Wave 4b, lane j3: keywords not yet built -- exalted, extort, eternalize, gift, an opening hand's beginning on the
battlefield -- and the small rules the lane's most-played cards needed (Cyclonic Rift; Yavimaya, Cradle of Growth; Victimize;
Windfall; Sink into Stupor // Soporific Springs; The Great Henge; Simic Growth Chamber; Ornithopter of Paradise; Cascade
Bluffs; Snap; Azusa, Lost but Seeking; Buried Alive; Kutzil, Malamet Exemplar; Witch Enchanter // Witch-Blessed Meadow; Finale
of Devastation; Unnatural Growth; Fanatic of Rhonas; Warren Soultrader; Mox Opal; Crypt Ghast; Ancient Den; Ignoble Hierarch;
Gemstone Caverns; Felidar Retreat; Lotho, Corrupt Shirriff; Ohran Frostfang; Bayou; Dawn's Truce; Fabricate; Elemental Bond).
One break for each engine change they needed -- each guard, each branch, each credit -- and the suite that catches it:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-wave4b-j3.py
"""
SUITES = [
    'tests/engine-wave4b-j3.mjs',
    'tests/engine-cards.mjs',
    'tests/engine-compile.mjs',
]

COMPILE = 'game/engine/cards/compile.mjs'

INDEX = 'game/engine/cards/index.mjs'
SCENARIO = 'game/engine/cards/scenario.mjs'
ACTIONS = 'game/engine/rules/actions.mjs'
LAYERS = 'game/engine/rules/layers.mjs'
MANA = 'game/engine/rules/mana.mjs'
MULLIGAN = 'game/engine/rules/mulligan.mjs'
STACK = 'game/engine/rules/stack.mjs'
AMOUNT = 'game/engine/script/amount.mjs'
BIND = 'game/engine/script/bind.mjs'
CONDITION = 'game/engine/script/condition.mjs'
ASKING = 'game/engine/script/effects/asking.mjs'
PERMANENTS = 'game/engine/script/effects/permanents.mjs'
FILTER = 'game/engine/script/filter.mjs'
RESOLUTION = 'game/engine/script/resolution.mjs'
SCHEMA = 'game/engine/script/schema.mjs'
VOCAB = 'game/engine/vocabulary.mjs'
ROOM = 'game/room/room.mjs'
CONSTRUCTS = 'game/tools/engine-constructs.mjs'

BREAKS = [
    # Exalted (CR 702.83a): alone, a creature its controller controls, +1/+1.
    ('exalted: alone', INDEX, '''TRIGGERS.attacks({who: "any", alone: true, filter: {types: ["Creature"], controller: "you"}})''',
     '''TRIGGERS.attacks({who: "any", filter: {types: ["Creature"], controller: "you"}})'''),
    ('exalted: yours', INDEX, '''TRIGGERS.attacks({who: "any", alone: true, filter: {types: ["Creature"], controller: "you"}})''',
     '''TRIGGERS.attacks({who: "any", alone: true, filter: {types: ["Creature"]}})'''),
    ('exalted: +1/+1', INDEX, '''        effects: [{effect: "pump", targets: "that card", power: 1, toughness: 1}]});
      keywords.push("Exalted");''', '''        effects: [{effect: "pump", targets: "that card", power: 0, toughness: 0}]});
      keywords.push("Exalted");'''),
    # Extort (CR 702.101a): your spells, {W/B}, "if you do", each opponent's life, that much gained.
    ('extort: your spells', INDEX, '''TRIGGERS["spell cast"]({caster: "you"}),
        effects: [{effect: "unlessPays", who: "you", mana: "{W/B}"''', '''TRIGGERS["spell cast"]({caster: "any"}),
        effects: [{effect: "unlessPays", who: "you", mana: "{W/B}"'''),
    ('extort: {W/B}', INDEX, 'mana: "{W/B}", ifPaid: true,', 'mana: "{W}", ifPaid: true,'),
    ('extort: if you do', INDEX, 'mana: "{W/B}", ifPaid: true,', 'mana: "{W/B}",'),
    ('extort: each opponent', INDEX, '[{effect: "loseLife", who: "opponent", amount: 1}, {effect: "gainLife", amount: {lifeLostThisWay: true}}]',
     '[{effect: "loseLife", who: "you", amount: 1}, {effect: "gainLife", amount: {lifeLostThisWay: true}}]'),
    ('extort: that much', INDEX, '[{effect: "loseLife", who: "opponent", amount: 1}, {effect: "gainLife", amount: {lifeLostThisWay: true}}]',
     '[{effect: "loseLife", who: "opponent", amount: 1}, {effect: "gainLife", amount: 1}]'),
    # Eternalize (CR 702.129a): from the graveyard, as a sorcery, black, a Zombie, 4/4, no mana cost; a mana cost, a creature card.
    ('eternalize: black', INDEX, 'except: {setColors: ["B"], addSubtypes: ["Zombie"], setPower: 4', 'except: {setColors: ["G"], addSubtypes: ["Zombie"], setPower: 4'),
    ('eternalize: a Zombie', INDEX, 'except: {setColors: ["B"], addSubtypes: ["Zombie"], setPower: 4', 'except: {setColors: ["B"], addSubtypes: [], setPower: 4'),
    ('eternalize: 4/4', INDEX, 'setPower: 4, setToughness: 4, noManaCost: true}', 'setPower: 1, setToughness: 4, noManaCost: true}'),
    ('eternalize: no mana cost', INDEX, 'setPower: 4, setToughness: 4, noManaCost: true}', 'setPower: 4, setToughness: 4}'),
    ('eternalize: as a sorcery', INDEX, '''      abilities.push({id, kind: "activated", text: ability.text, zone: "graveyard", timing: "sorcery", cost: [...structuredClone(cost), {atom: "exileFromGraveyard", self: true}],
        effects: [{effect: "copyPermanent", targets: "that card", except: {setColors: ["B"]''', '''      abilities.push({id, kind: "activated", text: ability.text, zone: "graveyard", cost: [...structuredClone(cost), {atom: "exileFromGraveyard", self: true}],
        effects: [{effect: "copyPermanent", targets: "that card", except: {setColors: ["B"]'''),
    ('eternalize: from the graveyard', INDEX, '''      abilities.push({id, kind: "activated", text: ability.text, zone: "graveyard", timing: "sorcery", cost: [...structuredClone(cost), {atom: "exileFromGraveyard", self: true}],
        effects: [{effect: "copyPermanent", targets: "that card", except: {setColors: ["B"]''', '''      abilities.push({id, kind: "activated", text: ability.text, timing: "sorcery", cost: [...structuredClone(cost), {atom: "exileFromGraveyard", self: true}],
        effects: [{effect: "copyPermanent", targets: "that card", except: {setColors: ["B"]'''),
    ('eternalize: a mana cost', INDEX, '''      if (cost.length !== 1 || cost[0]?.atom !== "mana") problems.push(`${ability.text}: an eternalize cost is mana, once`);''', ''),
    ('eternalize: a creature card', INDEX, '''      if (!(identity.types ?? []).includes("Creature")) problems.push(`${ability.text}: eternalize makes a 4/4 token copy of a creature card`);''', ''),
    # Gift (CR 702.174): the compiler.
    ('gift: a kind there is', INDEX, '''      if (!given) problems.push(`${ability.text}: a gift is one of ${Object.keys(GIFTS).join(", ")} (CR 702.174d-i)`);''', ''),
    ('gift: one to a card', INDEX, '''      if (gift !== null) problems.push(`${ability.text}: one gift to a card`);''', ''),
    ('gift: no modes chosen as cast', INDEX, '    if (fleeting && (!spell || spell.modal)) problems.push(', '    if (fleeting && !spell) problems.push('),
    ('gift: first, on an instant', INDEX, '''effects: [...given, ...(spell.effects ?? [])]};''', '''effects: [...(spell.effects ?? []), ...given]};'''),
    ('gift: an instant\'s additional cost', INDEX, '''    else if (fleeting) spell = {...spell, additionalCost: [...(spell.additionalCost ?? []), {atom: "gift"}],''',
     '''    else if (fleeting) spell = {...spell, additionalCost: [...(spell.additionalCost ?? [])],'''),
    ('gift: only if promised', INDEX, '''    const given = gift.effects.map((effect) => ({...effect, condition: {giftPromised: true}}));''', '''    const given = gift.effects.map((effect) => ({...effect}));'''),
    ('gift: a permanent\'s cost', INDEX, '''      spell = {...(spell ?? {id: "gift", text: gift.text, targets: [], effects: []}), additionalCost: [...(spell?.additionalCost ?? []), {atom: "gift"}]};''',
     '''      spell = {...(spell ?? {id: "gift", text: gift.text, targets: [], effects: []}), additionalCost: [...(spell?.additionalCost ?? [])]};'''),
    ('gift: a permanent\'s trigger', INDEX, '''      abilities.push({id: gift.id, kind: "triggered", text: gift.text, trigger: TRIGGERS.enters({who: "self"}), condition: {giftPromised: true}, effects: gift.effects});''', ''),
    ('gift: a permanent\'s "if"', INDEX, '''trigger: TRIGGERS.enters({who: "self"}), condition: {giftPromised: true}, effects: gift.effects});''', '''trigger: TRIGGERS.enters({who: "self"}), effects: gift.effects});'''),
    ('gift: a card', INDEX, '''  "a card": [{effect: "draw", who: "the chosen player", count: 1}],''', '''  "a card": [{effect: "draw", who: "you", count: 1}],'''),
    ('gift: a Food', INDEX, '''controller: "the chosen player", count: 1, token: {predefined: "Food"}}],''', '''controller: "the chosen player", count: 1, token: {predefined: "Clue"}}],'''),
    ('gift: a tapped Fish', INDEX, '''  "a tapped Fish": [{effect: "createToken", controller: "the chosen player", count: 1, tapped: true,''', '''  "a tapped Fish": [{effect: "createToken", controller: "the chosen player", count: 1,'''),
    ('gift: an extra turn', INDEX, '''  "an extra turn": [{effect: "addTurn", who: "the chosen player"}],''', '''  "an extra turn": [{effect: "addTurn", who: "you"}],'''),
    ('gift: a Treasure', INDEX, '''controller: "the chosen player", count: 1, token: {predefined: "Treasure"}}],''', '''controller: "you", count: 1, token: {predefined: "Treasure"}}],'''),
    ('gift: an Octopus', INDEX, '''colors: ["U"], power: 8, toughness: 8}}],''', '''colors: ["U"], power: 1, toughness: 1}}],'''),
    # Gift: the offers, the action, the stack, the resolution.
    ('gift: its variant', ACTIONS, '      variants = variants.flatMap((v) => [v, {...v, gift: true}]);\n', '      variants = variants.flatMap((v) => [v]);\n'),
    ('gift: to an opponent', ACTIONS, 'state.players.filter((p) => p.id !== player && !p.lost).map((p) => p.id)', 'state.players.filter((p) => !p.lost).map((p) => p.id)'),
    ('gift: one in the game', ACTIONS, 'state.players.filter((p) => p.id !== player && !p.lost).map((p) => p.id)', 'state.players.filter((p) => p.id !== player).map((p) => p.id)'),
    ('gift: on the offer', ACTIONS, ' ...(gift !== undefined ? {gift} : {}),\n', '\n'),
    ('gift: another action', ACTIONS, '  && (a.gift ?? null) === (b.gift ?? null)\n', ''),
    ('gift: on the stack entry', ACTIONS, '    if (action.gift !== undefined) entry.gift = action.gift;\n', ''),
    ('gift: a copy\'s', STACK, '  if (original.gift !== undefined) entry.gift = original.gift;\n', ''),
    ('gift: the resolution\'s', STACK, '    ...(entry.gift !== undefined ? {gift: entry.gift} : {}),\n', ''),
    ('gift: the permanent\'s', STACK, '    if (to === "battlefield" && entry.gift !== undefined) state.objects[arrived].gift = entry.gift;\n', ''),
    ('gift: carried through the resolution', RESOLUTION, '      ...(context.gift !== undefined ? {gift: context.gift} : {}),\n', ''),
    ('gift: an effect\'s condition', RESOLUTION, '      resolvedBefore: resolving.context.resolvedBefore, gift: resolving.context.gift})) {', '      resolvedBefore: resolving.context.resolvedBefore})) {'),
    ('gift: a branch\'s condition', RESOLUTION, '''resolvedBefore: resolving.context.resolvedBefore,
        gift: resolving.context.gift});''', '''resolvedBefore: resolving.context.resolvedBefore});'''),
    ('gift: promised', CONDITION, '''    && Number.isInteger(gift ?? (source !== null && source !== undefined ? state.objects[source]?.gift : undefined)) !== condition.giftPromised) return false;''',
     '''    && false) return false;'''),
    ('gift: a permanent promised', CONDITION, '''Number.isInteger(gift ?? (source !== null && source !== undefined ? state.objects[source]?.gift : undefined))''', '''Number.isInteger(gift)'''),
    ('gift: the condition\'s key', CONDITION, '''  "giftPromised"];''', '''  ];'''),
    ('gift: the condition\'s value', CONDITION, '''  if ("giftPromised" in condition && typeof condition.giftPromised !== "boolean") problems.push("giftPromised is true or false: whether the gift was promised");\n''', ''),
    ('gift: the chosen player', BIND, '''    return Number.isInteger(gift) && !(state?.players[gift]?.lost) ? [gift] : [];''', '''    return [];'''),
    ('gift: a permanent\'s chosen player', BIND, '''    const gift = context.gift ?? (state && context.source !== null && context.source !== undefined ? state.objects[context.source]?.gift : undefined);''',
     '''    const gift = context.gift;'''),
    ('gift: not one gone', BIND, '''    return Number.isInteger(gift) && !(state?.players[gift]?.lost) ? [gift] : [];''', '''    return Number.isInteger(gift) ? [gift] : [];'''),
    ('gift: the token\'s controller', BIND, '''["that card's controller", "that player", "the chosen player"].includes(bound.controller)''', '''["that card's controller", "that player"].includes(bound.controller)'''),
    ('gift: said to the player', ROOM, '    if (a.gift !== undefined) parts.push(`promising ${player(a.gift)} a gift`);\n', ''),
    ('gift: the scenario runner', SCENARIO, '    found = found.filter((a) => (a.gift ?? null) === (step.gift ?? null));\n', ''),
    # "You gain hexproof until end of turn" (Dawn's Truce; CR 702.11c).
    ('player hexproof: its players', PERMANENTS, '"damage-doubled", "look-at-top", "player-hexproof"].includes(params.rule)', '"damage-doubled", "look-at-top"].includes(params.rule)'),
    ('player hexproof: read', FILTER, '''  || (state.effects ?? []).some((e) => e.rule === "player-hexproof" && (e.players ?? []).includes(player)); };''', '''; };'''),
    # A basic land type given (CR 305.7): its mana ability, a land's, the right mana, read. Lanes j1, j2 and j3 each built it;
    # j2's intrinsicMana, at the end of layer 4, is the one kept (wave 4b integration), and these break it.
    ('land type: its ability', LAYERS,
     '    current.granted.push({id: `intrinsic:${type}`, kind: "mana", tapSelf: true, produces: {[color]: 1}, text: `{T}: Add {${color}}.`});\n', ''),
    ('land type: a land\'s', LAYERS, '  if (!current.types.includes("Land")) return;\n', ''),
    ('land type: its mana', LAYERS, 'produces: {[color]: 1}', 'produces: {C: 1}'),
    ('land type: abilities read', LAYERS, '''    || [...(apply.addSubtypes ?? []), ...(apply.setSubtypes ?? [])].some((type) => BASIC_LAND_MANA[type])));''', '''    ));'''),
    # Base power (CR 208.4b).
    ('base power: kept', LAYERS, '      if (sublayer === "c") { current.basePower = current.power; current.baseToughness = current.toughness; }\n', ''),
    ('base power: after setting', LAYERS, '      if (sublayer === "c") { current.basePower', '      if (sublayer === "b") { current.basePower'),
    ('base power: the selector', FILTER, '      if (!((c.power ?? 0) > (c.basePower ?? 0))) return false;\n', ''),
    ('base power: off the battlefield', FILTER, ': {power: object.power, basePower: object.power};', ': {power: object.power, basePower: -1};'),
    ('base power: a key', FILTER, '  "powerAboveBase",\n', ''),
    ('base power: true', FILTER, '''  if (selector.powerAboveBase !== undefined && selector.powerAboveBase !== true) throw new Error("A selector's powerAboveBase is true: its power greater than its base power");\n''', ''),
    # Windfall's "the most any one player", and a power doubled below zero (CR 701.10c).
    ('most: the most', AMOUNT, '      : value.controlledBy === "most" ? Math.max(0, ...state.players.map((p) => remembered.filter((id) => whose(id) === p.id).length))\n', ''),
    ('most: allowed', AMOUNT, '["that player", "most"].includes(value.controlledBy)', '["that player"].includes(value.controlledBy)'),
    ('signed: below zero', AMOUNT, '  return times < 0 || value.signed === true ? total : Math.max(0, total);', '  return times < 0 ? total : Math.max(0, total);'),
    ('signed: a key', AMOUNT, '"named", "another", "signed"];', '"named", "another"];'),
    ('signed: beside a power', AMOUNT, '''  if ("signed" in value && !(value.signed === true && ("powerOf" in value || "toughnessOf" in value))) problems.push("signed is true, beside powerOf or toughnessOf: the number as it is, below zero too");\n''', ''),
    # Azusa's two more land drops (CR 305.2).
    ('land drops: count', ACTIONS, '    .reduce((n, {ability}) => n + (ability.count ?? 1), 0)', '    .reduce((n) => n + 1, 0)'),
    ('land drops: a count of 1 or more', SCHEMA, '''    if (ability.rule === "extra-land-drop" && ability.count !== undefined && !(Number.isInteger(ability.count) && ability.count >= 1))''',
     '''    if (false)'''),
    # Gemstone Caverns: begun on the battlefield from the opening hand (CR 103.6a).
    ('opening: not the starting player', MULLIGAN, '  && !(a.notStarting === true && player === state.mulligan.startingPlayer));', '  );'),
    ('opening: begun there', MULLIGAN, '    else if (ability.begin === "battlefield") {', '    else if (false) {'),
    ('opening: its counters', MULLIGAN, '...(ability.withCounters ? {withCounters: {...ability.withCounters}} : {})}],', '}],'),
    ('opening: then a card to exile', MULLIGAN, '      if (ability.exileFromHand && cardsIn(state, "hand", awaiting.player).length) m.exiling = {player: awaiting.player, name};', ''),
    ('opening: none to exile, none asked', MULLIGAN, '      if (ability.exileFromHand && cardsIn(state, "hand", awaiting.player).length) m.exiling', '      if (ability.exileFromHand) m.exiling'),
    ('opening: asked next', MULLIGAN, '  if (m.exiling) return {kind: "opening-hand", player: m.exiling.player, exile: true};\n', ''),
    ('opening: exiled', MULLIGAN, '    moveObject(state, option.cardId, "exile", null);\n', ''),
    ('opening: its question done', MULLIGAN, '    delete m.exiling;\n', ''),
    ('opening: an answer offered', MULLIGAN, '    if (!option) throw new Error("Choose a card from your hand to exile");\n', ''),
    ('opening: said so', MULLIGAN, '''`Begin the game with ${state.objects[id].card} on the battlefield` : `Reveal ${state.objects[id].card}`''', '''`Reveal ${state.objects[id].card}` : `Reveal ${state.objects[id].card}`'''),
    ('opening: a permanent card', INDEX, '''    if (beginning && !(ability.begin === "battlefield" && ability.effects === undefined && (identity.types ?? []).some((t) => ["Artifact", "Battle", "Creature", "Enchantment", "Land", "Planeswalker"].includes(t))''',
     '''    if (beginning && !(ability.begin === "battlefield" && ability.effects === undefined'''),
    ('opening: no effects beside it', INDEX, '    if (beginning && !(ability.begin === "battlefield" && ability.effects === undefined && ', '    if (beginning && !(ability.begin === "battlefield" && '),
    ('opening: counters a number', INDEX, '        && Object.values(ability.withCounters).every((n) => Number.isInteger(n) && n >= 1)))', '        ))'),
    ('opening: one card exiled', INDEX, '&& [undefined, 1].includes(ability.exileFromHand)))', '))'),
    ('opening: notStarting true', INDEX, '      && [undefined, true].includes(ability.notStarting) && ', '      && '),
    ('opening: begin is battlefield', INDEX, '    if (beginning && !(ability.begin === "battlefield" && ability.effects', '    if (beginning && !(ability.effects'),
    # Its mana "instead" while it has a luck counter.
    ('instead: while the counter is there', MANA, '  if (!ability?.instead || !((state.objects[id]?.counters?.[ability.instead.counter] ?? 0) > 0)) return ability;', '  if (!ability?.instead) return ability;'),
    ('instead: offered', ACTIONS, '  const ability = chosenFor(manaAbilityNow(state, source, given), state.objects[source]);', '  const ability = chosenFor(given, state.objects[source]);'),
    ('instead: a plain source', MANA, '    if (ability) out.push({id, ability: manaAbilityNow(state, id, ability)});', '    if (ability) out.push({id, ability});'),
    ('instead: compiled', INDEX, '...adds, ...(instead ? {instead} : {}), text: ability.text,', '...adds, text: ability.text,'),
    ('instead: a counter named', INDEX, '''    : adds.produces && !Array.isArray(adds.produces) && typeof first.instead?.counter === "string" && Object.keys(first.instead).length === 2''',
     '''    : adds.produces && !Array.isArray(adds.produces) && Object.keys(first.instead).length <= 2'''),
    ('instead: beside a fixed mana', INDEX, '''    : adds.produces && !Array.isArray(adds.produces) && typeof first.instead?.counter''', '''    : typeof first.instead?.counter'''),
    ('instead: nothing more', INDEX, '''typeof first.instead?.counter === "string" && Object.keys(first.instead).length === 2''', '''typeof first.instead?.counter === "string"'''),
    ('instead: a fixed mana', INDEX, '''{produces: {...first.instead.mana}})} : undefined;''', '''{anyColor: true})} : undefined;'''),
    # Finale of Devastation: two zones searched as one, the X of its spell.
    ('zones: both searched', ASKING, '    const pool = (zones ? zones.flatMap((z) => cardsIn(state, z, player)) : among', '    const pool = (zones ? cardsIn(state, zones[0], player) : among'),
    ('zones: each where it is', ASKING, '    const fits = (id) => (anywhere || zones ? alternatives', '    const fits = (id) => (anywhere ? alternatives'),
    ('zones: the library searched', ASKING, '    const zone = zones ? (zones.includes("library") ? "library" : zones[0]) : params.zone ?? "library";', '    const zone = zones ? "graveyard" : params.zone ?? "library";'),
    ('zones: named', ASKING, '''        : awaiting.zones ? `Search your ${awaiting.zones.map((z) => ZONE_WORD[z]).join(" and ")}`\n''', ''),
    ('zones: each card\'s said', ASKING, '''        if (awaiting.zones) return {...option, label: `${option.label}, in your ${ZONE_WORD[object?.zone] ?? object?.zone}`};\n''', ''),
    ('zones: kept on the question', ASKING, ' ...(zones ? {zones: [...zones]} : {}), cards, min,', ' cards, min,'),
    ('search: the X of its spell', ASKING, ', ...(context.x !== undefined ? {x: context.x} : {})}));', '}));'),
    # The smoke game's graveyard: as many creature cards as a counted target takes (Victimize).
    ('smoke: two creature cards', COMPILE, '.map((t) => (Number.isInteger(t?.count?.min) ? t.count.min : 1)));', '.map(() => 1));'),
    # The words a script may say, and the coverage tool's credits.
    ('vocabulary: the four keywords', VOCAB, '  "exalted", "extort", "eternalize", "gift"];', '  ];'),
    ('credit: Eternalize', CONSTRUCTS, '  Eternalize: "copyPermanent",\n', ''),
    ('credit: Exalted', CONSTRUCTS, '  Exalted: "pump",\n', ''),
    ('credit: Extort', CONSTRUCTS, '  Extort: "unlessPays",\n', ''),
    ('credit: Gift', CONSTRUCTS, '  Gift: "rules/actions.mjs", MayEffectFromOpeningHand: "rules/mulligan.mjs"};', '  MayEffectFromOpeningHand: "rules/mulligan.mjs"};'),
    ('credit: MayEffectFromOpeningHand', CONSTRUCTS, '  Gift: "rules/actions.mjs", MayEffectFromOpeningHand: "rules/mulligan.mjs"};', '  Gift: "rules/actions.mjs"};'),
    ('credit: PromisedGift', CONSTRUCTS, '  PromisedGift: {name: "A gift promised", status: "built",', '  PromisedGift: {name: "A gift promised", status: "missing",'),
]
