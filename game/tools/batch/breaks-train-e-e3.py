# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Train E, worker e3: fourteen of Rob's v43 library cards (Arni, Humble Scribe; Artistic Process; Colorstorm Stallion; Deduce;
Eternal Student; Gideon's Memorial; Kiora of Fire and Ashes; Lyra, Tolarian Archangel; Memnarch, the Warden; Pia, Determined
Rebuilder; Queen Allenal of Ruadach; Restless Anchorage; Saheeli, Consul of Oversight; Seedship Impact). One break for each
engine change they needed -- each guard, each branch -- and the suite that catches it:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-train-e-e3.py
"""
SUITES = [
    'tests/engine-tokens-replaced.mjs',
    'tests/engine-explore.mjs',
    'tests/engine-copy-memory.mjs',
    'tests/engine-filter.mjs',
    'tests/engine-equip.mjs',
    'tests/engine-vocabulary.mjs',
    'tests/engine-cards.mjs',
]

LAYERS = 'game/engine/rules/layers.mjs'
STATICS = 'game/engine/rules/statics.mjs'
PERM = 'game/engine/script/effects/permanents.mjs'
ASKING = 'game/engine/script/effects/asking.mjs'
INDEX = 'game/engine/script/effects/index.mjs'
RESOLUTION = 'game/engine/script/resolution.mjs'
FILTER = 'game/engine/script/filter.mjs'
SCHEMA = 'game/engine/script/schema.mjs'
VOCAB = 'game/engine/vocabulary.mjs'
PILOT = 'game/engine/pilots/house-pilot.mjs'

GONE = '\n  const gone = params.lastKnown === true && !originals.length && context.lastKnown?.copiable ? [{values: context.lastKnown.copiable}] : null;'
APPLYING = '''const applying = (rest, event) => rest.filter(({ability}) => live(event).some((g) => (ability.rule === "more-tokens" ? true
  : ability.rule === "tokens-each" ? Boolean(kindOf(ability, g.token)) : describes(ability.affects, g.token))));'''
TOKENS_CHANGED = 'const TOKENS_CHANGED = ["tokens-instead", "tokens-plus", "tokens-each"];'
EXPLORE_PLAYER = 'const player = here ? controllerOf(state, id) : context.lastKnown?.cardId === id ? context.lastKnown.controller : context.controller;'

BREAKS = [
    # Colorstorm Stallion's Opus: "create a token that's a copy of this creature", this creature gone since its ability went
    # on the stack (rules/layers.mjs, lastKnown's copiable; effects/permanents.mjs, copyPermanent's `lastKnown`).
    ('lki copiable: kept for an ability on the stack', LAYERS,
     ' || state.stack.some((entry) => entry.cardId === id) ? {copiable:', ' ? {copiable:'),
    ('lki copiable: only then', LAYERS,
     ' || state.stack.some((entry) => entry.cardId === id) ? {copiable:', ' || true ? {copiable:'),
    ('lastKnown copy: made', PERM, GONE, '\n  const gone = null;'),
    ('lastKnown copy: only when the script says so', PERM, GONE,
     '\n  const gone = !originals.length && context.lastKnown?.copiable ? [{values: context.lastKnown.copiable}] : null;'),
    ('lastKnown copy: only with no original there', PERM, GONE,
     '\n  const gone = params.lastKnown === true && context.lastKnown?.copiable ? [{values: context.lastKnown.copiable}] : null;'),
    ('lastKnown copy: only with something known', PERM, GONE,
     '\n  const gone = params.lastKnown === true && !originals.length ? [{values: context.lastKnown.copiable}] : null;'),
    ('lastKnown copy: its values read', PERM,
     'const original = id?.values ?? (params.asItLastWas', 'const original = (params.asItLastWas'),

    # Gideon's Memorial: "target attacking or blocking creature" (script/filter.mjs, `blocking`).
    ('blocking: a key of the grammar', FILTER, '  "blocking",\n', ''),
    ('blocking: read', FILTER,
     '    if (selector.blocking === true && !(state.combat?.attacks ?? []).some((attack) => (attack.blockers ?? []).includes(id))) return false;\n', ''),
    ('blocking: the blockers, not the attackers', FILTER,
     '(state.combat?.attacks ?? []).some((attack) => (attack.blockers ?? []).includes(id))) return false;',
     '(state.combat?.attacks ?? []).some((attack) => attack.attacker === id)) return false;'),

    # Queen Allenal of Ruadach: "those tokens plus a 1/1 white Soldier creature token are created instead" (rules/statics.mjs,
    # tokensCreated's `tokens-plus`; the order beside a doubler asked, effects/asking.mjs orderTokens). Wave 4a rewrote the
    # token event as groups (breaks-wave4a-h4.py breaks the rest of it): these are the Queen's own, on that code. And her
    # ruling of 2022-09-09 there: the Soldier is made as the effect makes its tokens (tapped, hasty), no longer bare.
    ('tokens-plus: read', STATICS, TOKENS_CHANGED, TOKENS_CHANGED.replace('"tokens-plus", ', '')),
    ('tokens-plus: its controller\'s tokens only', STATICS,
     '      if (!TOKENS_CHANGED.includes(ability.rule) || holder.controller !== controller) continue;\n', '      if (!TOKENS_CHANGED.includes(ability.rule)) continue;\n'),
    ('tokens-plus: a doubler always applies', STATICS, APPLYING, APPLYING.replace('(ability.rule === "more-tokens" ? true', '(ability.rule === "more-tokens" ? false')),
    ('tokens-plus: an adder to the tokens it names only', STATICS, APPLYING, APPLYING.replace(': describes(ability.affects, g.token))));', ': true)));')),
    ('tokens-plus: none made, none added to', STATICS, APPLYING, APPLYING.replace('live(event).some(', 'event.some(')),
    ('tokens-plus: a token another added counts', STATICS, APPLYING, APPLYING.replace('live(event).some(', 'live(event).filter((g) => g.own).some(')),
    ('tokens-plus: a doubler doubles the added ones', STATICS,
     'if (ability.rule === "more-tokens") return event.map((g) => (multiplies(ability, g.token) ? {...g, count: g.count * ability.times} : g));',
     'if (ability.rule === "more-tokens") return event.map((g) => (g.own && multiplies(ability, g.token) ? {...g, count: g.count * ability.times} : g));'),
    ('tokens-plus: asked only when the order matters', STATICS,
     'if (now.length > 1 && tokenEnds(rest, event).size > 1) {', 'if (now.length > 1) {'),
    ('tokens-plus: an answer replayed', STATICS,
     'const answered = orders[used] === undefined ? undefined : now.find((c) => tokenEffectKey(c) === orders[used]);',
     'const answered = undefined;'),
    ('tokens-plus: asked where it can be', STATICS,
     '      else if (askable) return {event, rest, question: {player: controller, options: now.map(tokenEffectKey)}};\n', ''),
    ('tokens-plus: unasked, the most', STATICS,
     '      else next = now.reduce((top, c) => (mostAfter(rest, c, event) > mostAfter(rest, top, event) ? c : top), now[0]);\n', ''),
    ('tokens-plus: the choice\'s numbers', STATICS,
     'return {index, label: `${nameOfHolder(c)} first: ${ranges.get(index)} token${hi === 1 ? "" : "s"}`, cardId: c.holderId, makes: hi};',
     'return {index, label: `${nameOfHolder(c)} first: ${hi} tokens`, cardId: c.holderId, makes: lo};'),
    ('tokens-plus: the choice replays the answers', STATICS,
     'tokenEvent(state, awaiting.controller, awaiting.count, awaiting.values, awaiting.answered ?? [], true);',
     'tokenEvent(state, awaiting.controller, awaiting.count, awaiting.values, [], true);'),
    ('createToken: the added ones made', PERM,
     '  for (const {token, count: many} of groups) for', '  for (const {token, count: many} of groups.slice(0, 1)) for'),
    ('createToken: the added ones given the effect\'s words', PERM,
     '  for (const {token, count: many} of groups) for (let i = 0; i < many; i += 1) made.push(makeToken(state, token, controller, params, context, events));',
     '  for (const {token, count: many, own} of groups) for (let i = 0; i < many; i += 1) made.push(makeToken(state, token, controller, own ? params : {}, context, events));'),
    ('createToken: the added ones remembered', PERM,
     'among them (CR 614.6). */\n  if (params.remember) context.remembered = made;', 'among them (CR 614.6). */\n  if (params.remember) context.remembered = made.slice(0, groups[0]?.count ?? 0);'),
    ('createToken: its answers', PERM,
     '{orders: params.tokenOrders?.[TOKEN_EVENT] ?? []}', '{orders: []}'),
    ('copies: the added ones made', PERM,
     '      if (!own) { made.push(makeToken(state, token, controller, params, context, events)); continue; }',
     '      if (false) { made.push(makeToken(state, token, controller, params, context, events)); continue; }'),
    ('copies: their answers, by original', PERM,
     '{orders: params.tokenOrders?.[copyEventKey(id)] ?? []}', '{orders: params.tokenOrders?.[String(id)] ?? []}'),
    ('question: a createToken asked about', PERM,
     '  if (effect?.effect === "createToken" && effect.linked !== true)\n', '  if (false)\n'),
    ('question: not linked tokens', PERM,
     '  if (effect?.effect === "createToken" && effect.linked !== true)\n', '  if (effect?.effect === "createToken")\n'),
    ('question: a copy of targets asked about', PERM,
     '      const asked = ask(controller, effect.count ?? 1, copiable(state.objects[id], effect.except), copyEventKey(id));\n      if (asked) return asked;\n', ''),
    ('question: a copy of a source gone asked about', PERM,
     '    if (effect.lastKnown === true && !effect.targets.length && context.lastKnown?.copiable)\n', '    if (false)\n'),
    ('resolution: asks before tokens are made', RESOLUTION,
     '    else if ((asked = tokenQuestion(state, effect, resolving.context, effect?.tokenOrders ?? {})))\n', '    else if (false)\n'),
    ('orderTokens: an answer kept', ASKING,
     '    const answers = {...awaiting.answers, [awaiting.key]: [...(awaiting.answers[awaiting.key] ?? []), chosen]};\n    return {events: [], splice: [{...awaiting.make, tokenOrders: answers}]};',
     '    return {events: [], splice: [{...awaiting.make, tokenOrders: awaiting.answers}]};'),
    ('orderTokens: one who left', ASKING,
     '  /* The tokens\' controller has left the game: none is made under their control (CR 800.4a; effects/permanents.mjs). */\n  left(state, awaiting) {\n    return {events: [], splice: [{...awaiting.make, tokenOrders: awaiting.answers}]};',
     '  /* The tokens\' controller has left the game: none is made under their control (CR 800.4a; effects/permanents.mjs). */\n  left(state, awaiting) {\n    return {events: []};'),
    ('orderTokens: registered', ASKING, 'orderCounters, orderTokens, orderDraws,', 'orderCounters, orderDraws,'),
    ('schema: tokens-plus by card types', SCHEMA,
     '        errors.push({path: `${path}.affects`, message: "The tokens another is added to are told by their card types and subtypes, or any token: affects {types?, subtypes?}"});',
     '        void 0;'),
    ('schema: tokens-plus adds a token', SCHEMA,
     'if (!tokenSpec(ability.token)) errors.push({path: `${path}.token`, message: "What is added is a token',
     'if (false) errors.push({path: `${path}.token`, message: "What is added is a token'),
    ('pilot: the most tokens', PILOT,
     'const best = options.reduce((b, o) => ((o.makes ?? 0) > (b.makes ?? 0) ? o : b));\n', 'const best = options[0];\n'),

    # Restless Anchorage: the Map token (CR 111.10s) and explore (CR 701.44; effects/asking.mjs).
    ('Map: predefined', PERM, '  Map: {name: "Map", types: ["Artifact"], subtypes: ["Map"],', '  Mapx: {name: "Map", types: ["Artifact"], subtypes: ["Map"],'),
    ('Map: as a sorcery', PERM,
     '      timing: "sorcery", targets: [{what: "permanent", types: ["Creature"], controller: "you"}],\n      cost: [{atom: "mana", cost: "{1}"}, {atom: "{T}"}, {atom: "sacrifice", self: true}], effects: [{effect: "explore"',
     '      targets: [{what: "permanent", types: ["Creature"], controller: "you"}],\n      cost: [{atom: "mana", cost: "{1}"}, {atom: "{T}"}, {atom: "sacrifice", self: true}], effects: [{effect: "explore"'),
    ('explore: a land to hand', ASKING,
     '    if (top !== undefined && typesOf(state, top).includes("Land")) {\n      moveOne(state, top, "hand", events, {owner: player});',
     '    if (false) {\n      moveOne(state, top, "hand", events, {owner: player});'),
    ('explore: whose -- its controller', ASKING, EXPLORE_PLAYER, 'const player = context.controller;'),
    ('explore: whose -- gone, as it last was', ASKING, EXPLORE_PLAYER, 'const player = here ? controllerOf(state, id) : context.controller;'),
    ('explore: one who left explores nothing', ASKING,
     '    if (!state.players[player] || state.players[player].lost) return false;\n    const [top] = cardsIn(state, "library", player);',
     '    const [top] = cardsIn(state, "library", player);'),
    ('explore: the counter', ASKING, '    if (here) addCounters(state, id, "+1/+1", 1, events, player);\n', ''),
    ('explore: an empty library asks nothing', ASKING, '    if (top === undefined) return {events};\n    state.resolving?.events.push(...events);',
     '    state.resolving?.events.push(...events);'),
    ('explore: the card shown while asked', ASKING, '    showRevealed(state, player, [top]);\n    state.awaiting = {kind: "effect-choice", effect: "explore"',
     '    state.awaiting = {kind: "effect-choice", effect: "explore"'),
    ('explore: into the graveyard', ASKING,
     '    for (const id of chosen) moveOne(state, id, "graveyard", events, {owner: state.objects[id].owner});\n    return events;\n  },\n  /* The exploring player',
     '    return events;\n  },\n  /* The exploring player'),
    ('explore: shown no longer once answered', ASKING,
     '    const events = [];\n    unshowRevealed(state, awaiting.player);\n    const chosen = (indices ?? []).map((index) => awaiting.cards[index])',
     '    const events = [];\n    const chosen = (indices ?? []).map((index) => awaiting.cards[index])'),
    ('explore: shown no longer once its player left', ASKING,
     '  left(state, awaiting) {\n    unshowRevealed(state, awaiting.player);\n    return [];\n  },', '  left(state, awaiting) {\n    return [];\n  },'),
    ('explore: registered', ASKING, 'orderDraws, explore,', 'orderDraws,'),
    ('explore: one that asks', INDEX, '  /* Explore (CR 701.44): whether the revealed nonland card goes to the graveyard. */\n  "explore",\n', ''),
    ('explore: declared', VOCAB, '"digUntil", "manifest", "explore",', '"digUntil", "manifest",'),
]
