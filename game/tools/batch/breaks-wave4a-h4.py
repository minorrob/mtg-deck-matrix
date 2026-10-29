# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Wave 4a, lane h4: replacement effects on creating tokens and on putting counters, and "whenever one or more counters are
put" triggers -- nineteen of the most-played Commander cards (Doubling Season; Academy Manufactor; Kami of Whispered Hopes;
Parallel Lives; Mondrak, Glory Dominus; Ozolith, the Shattered Spire; Xorn; Elspeth, Storm Slayer; Peregrin Took; Evolution
Witness; Exemplar of Light; Adrix and Nev, Twincasters; Corpsejack Menace; Exalted Sunborn; Primal Vigor; Stridehangar
Automaton; Lae'zel, Vlaakith's Champion; Winding Constrictor; Divine Visitation). One break for each engine change they
needed -- each guard, each branch, each credit -- and the suite that catches it:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-wave4a-h4.py

The token event's rewrite (rules/statics.mjs, tokensCreated) replaces the code Train E's e3 broke for Queen Allenal of
Ruadach: those of its breaks are proved here again, on the new code (breaks-train-e-e3.py keeps the rest of its own).
"""
SUITES = [
    'tests/engine-tokens-counters-4a.mjs',
    'tests/engine-tokens-replaced.mjs',
    'tests/engine-counters-replaced.mjs',
    'tests/engine-counters-put.mjs',
    'tests/engine-x11-turns-counters.mjs',
    'tests/engine-ability-loss.mjs',
    'tests/engine-catalog.mjs',
    'tests/engine-cards.mjs',
    'tests/generators.mjs',
]

STATICS = 'game/engine/rules/statics.mjs'
PERM = 'game/engine/script/effects/permanents.mjs'
RES = 'game/engine/script/effects/resources.mjs'
ZONES = 'game/engine/script/effects/zones.mjs'
STACK = 'game/engine/rules/stack.mjs'
ENTERING = 'game/engine/rules/entering.mjs'
ENTRY_COUNTERS = 'game/engine/rules/pre-entry.mjs'
ACTIONS = 'game/engine/rules/actions.mjs'
TRIGGER = 'game/engine/rules/trigger.mjs'
CARDS = 'game/engine/cards/index.mjs'
SCHEMA = 'game/engine/script/schema.mjs'
CONSTRUCTS = 'game/tools/engine-constructs.mjs'
CATALOG = 'game/tools/engine-catalog.mjs'

APPLYING = '''const applying = (rest, event) => rest.filter(({ability}) => live(event).some((g) => (ability.rule === "more-tokens" ? true
  : ability.rule === "tokens-each" ? Boolean(kindOf(ability, g.token)) : describes(ability.affects, g.token))));'''
DOUBLES = 'if (ability.rule === "more-tokens") return event.map((g) => (multiplies(ability, g.token) ? {...g, count: g.count * ability.times} : g));'
INSTEAD = 'if (ability.rule === "tokens-instead") return event.map((g) => (g.count > 0 && describes(ability.affects, g.token) ? {token: ability.token, count: g.count} : g));'
EACH = 'return kind ? [g, ...ability.each.filter((k) => k !== kind).map((k) => ({token: k, count: g.count}))] : [g];'
ADDS = '  return [...event, {token: ability.token, count: ability.thatMany === true ? tokensIn(live(event)) : 1}];\n}'
MAKES = '''  for (const g of live(event)) by.set(nameOf(g.token) ?? "token", (by.get(nameOf(g.token) ?? "token") ?? 0) + g.count);
  return [...by].map(([name, n]) => `${n} ${name}`).sort().join(", ");'''
ASKED = 'if (now.length > 1 && tokenEnds(rest, event).size > 1) {'
REPLAYED = 'const answered = orders[used] === undefined ? undefined : now.find((c) => tokenEffectKey(c) === orders[used]);'
CAN_ASK = '      else if (askable) return {event, rest, question: {player: controller, options: now.map(tokenEffectKey)}};\n'
MOST = '      else next = now.reduce((top, c) => (mostAfter(rest, c, event) > mostAfter(rest, top, event) ? c : top), now[0]);\n'
CHOICE_REPLAY = 'const {event, rest} = tokenEvent(state, awaiting.controller, awaiting.count, awaiting.values, awaiting.answered ?? [], true);'
TELLING = '''  const telling = options.filter((o) => ends.has(o.index) && options.some((other) => ends.has(other.index)
    && ranges.get(other.index) === ranges.get(o.index) && ends.get(other.index) !== ends.get(o.index)));'''
TITLE = 'const name = kinds.size === 1 && [...kinds][0] ? `${[...kinds][0]} ` : "";'
GUARD = '      if ([ability.token, ...(ability.each ?? [])].some((token) => token?.predefined)) throw new Error('
OWN_ONLY = '      if (!TOKENS_CHANGED.includes(ability.rule) || holder.controller !== controller) continue;\n'
CHANGED = 'const TOKENS_CHANGED = ["tokens-instead", "tokens-plus", "tokens-each"];'
SEEN = '  if (seen.has(key)) return out;\n'

MADE = '  for (const {token, count: many} of groups) for (let i = 0; i < many; i += 1) made.push(makeToken(state, token, controller, params, context, events));'
ATTACHED = '  if (params.attachedTo !== undefined) for (const id of made) if (state.objects[id].enchant) attachTo(state, id, host);'
NOT_OWN = '      if (!own) { made.push(makeToken(state, token, controller, params, context, events)); continue; }'

PREDEFINED = '    return structuredClone(PREDEFINED_TOKENS[token.predefined]);'
UNKNOWN = "    if (!Object.hasOwn(PREDEFINED_TOKENS, token.predefined)) { problems.push(`${ability.text}: no predefined token named ${token.predefined}`); return token; }"
EACH_COMPILED = '...(Array.isArray(ability.each) ? {each: ability.each.map(spec)} : {})'

TOKEN_SPEC = 'const tokenSpec = (token) => Boolean(token) && (isText(token.predefined) ? Object.keys(token).length === 1 : isText(token.name) && Array.isArray(token.types));'
PLUS_KEYS = 'if (Object.keys(ability.affects ?? {}).some((key) => !["types", "subtypes"].includes(key)) || Object.values(ability.affects ?? {}).some((v) => !Array.isArray(v) || !v.length))'
EACH_SCHEMA = 'if (ability.rule === "tokens-each" && !(Array.isArray(ability.each) && ability.each.length >= 2 && ability.each.every((kind) => isText(kind?.predefined) && Object.keys(kind).length === 1)))'
PLAYERS_SCHEMA = 'if (ability.players !== undefined && ![true, "you"].includes(ability.players))'
PLAYER_ALONE_SCHEMA = 'if (ability.affects?.what === "player" && (ability.players === undefined || Object.keys(ability.affects).length !== 1))'
BY_EFFECT_SCHEMA = '      if (ability.byEffect !== undefined && ability.byEffect !== true) errors.push('

NOT_COST = '  && !(cost && ability.byEffect === true)\n'
WHOSE = 'if (player !== null ? !(ability.players === true || (ability.players === "you" && player === holder.controller))'
ALONE = '        : ability.affects?.what === "player" || !matchesSelector('
ENTERING_SELF = '      if (entering && holderId === id && ability.affects?.self !== true) continue;\n'
PASSED_ON = 'let rest = [...counterCandidates(state, {id, player}, kind, by, {cost, entering}), ...extraCandidates]'
ENTERING_FN = 'export const enteringCountersPlaced = (state, id, kind, count, by = null) => placeCounters(state, {id}, kind, count, by, {entering: true}).count;'

BREAKS = [
    # ---- The token event in groups, each replacement rewriting it as it stands (rules/statics.mjs, tokensCreated). ----
    ('tokens: the replacements of their own controller only', STATICS, OWN_ONLY, '      if (!TOKENS_CHANGED.includes(ability.rule)) continue;\n'),
    ('tokens: one of each among them', STATICS, CHANGED, 'const TOKENS_CHANGED = ["tokens-instead", "tokens-plus"];'),
    ('tokens: a predefined token never made nameless', STATICS, GUARD, '      if (false) throw new Error('),
    ('tokens: a doubler applies to any tokens', STATICS, APPLYING, APPLYING.replace('(ability.rule === "more-tokens" ? true', '(ability.rule === "more-tokens" ? false')),
    ('tokens: one of each only once one of its kinds is made', STATICS, APPLYING, APPLYING.replace('? Boolean(kindOf(ability, g.token)) :', '? true :')),
    ('tokens: an adder only while a token it describes is made', STATICS, APPLYING, APPLYING.replace(': describes(ability.affects, g.token))));', ': true)));')),
    ('tokens: only tokens being made, one or more', STATICS, APPLYING, APPLYING.replace('live(event).some(', 'event.some(')),
    ('tokens: a doubler doubles every group', STATICS, DOUBLES, 'if (ability.rule === "more-tokens") return event.map((g) => (g.own && multiplies(ability, g.token) ? {...g, count: g.count * ability.times} : g));'),
    ('tokens: that many made instead', STATICS, INSTEAD, INSTEAD.replace('{token: ability.token, count: g.count}', '{token: ability.token, count: 1}')),
    ('tokens: instead only of what it describes', STATICS, INSTEAD, INSTEAD.replace('g.count > 0 && describes(ability.affects, g.token) ?', 'g.count > 0 ?')),
    ('tokens: made instead, no longer the effect\'s own', STATICS, INSTEAD, INSTEAD.replace('{token: ability.token, count: g.count}', '{...g, token: ability.token, count: g.count}')),
    ('tokens: one of each beside its kind', STATICS, EACH, 'return kind ? [g] : [g];'),
    ('tokens: one of each, that many', STATICS, EACH, EACH.replace('({token: k, count: g.count})', '({token: k, count: 1})')),
    ('tokens: one of each, its own kind not again', STATICS, EACH, EACH.replace('ability.each.filter((k) => k !== kind)', 'ability.each')),
    ('tokens: an adder adds one', STATICS, ADDS, '  return [...event, {token: ability.token, count: ability.thatMany === true ? tokensIn(live(event)) : 2}];\n}'),
    ('tokens: ends told by what they make', STATICS, MAKES, MAKES.replace('by.set(nameOf(g.token) ?? "token", (by.get(nameOf(g.token) ?? "token") ?? 0) + g.count)', 'by.set("token", (by.get("token") ?? 0) + g.count)')),
    ('tokens: a name\'s tokens told together', STATICS, MAKES,
     '  for (const g of live(event)) by.set(`${by.size}`, `${g.count} ${nameOf(g.token) ?? "token"}`);\n  return [...by.values()].sort().join(", ");'),
    ('tokens: every order followed once', STATICS, SEEN, ''),
    ('tokens: asked only where orders end differently', STATICS, ASKED, 'if (now.length > 1) {'),
    ('tokens: an answer replayed', STATICS, REPLAYED, 'const answered = undefined;'),
    ('tokens: asked where it can be', STATICS, CAN_ASK, ''),
    ('tokens: unasked, the order that makes the most', STATICS, MOST, ''),
    ('tokens: the choice replays the answers so far', STATICS, CHOICE_REPLAY, CHOICE_REPLAY.replace('awaiting.answered ?? []', '[]')),
    ('tokens: the choice says what each makes when counts agree', STATICS, TELLING, '  const telling = [];'),
    ('tokens: the choice says what each makes only when they end differently', STATICS, TELLING, TELLING.replace(' && ends.get(other.index) !== ends.get(o.index)', ' && other !== o')),
    ('tokens: the choice\'s title names their kind', STATICS, TITLE, 'const name = "";'),
    ('tokens-each: a rule a static may change', STATICS, '  "tokens-each": "script/effects/permanents.mjs",\n', ''),

    # ---- What is made (effects/permanents.mjs): every token, as the effect says its tokens are. ----
    ('createToken: every group made', PERM, MADE, MADE.replace('of groups)', 'of groups.slice(0, 1))')),
    ('createToken: each as the effect says', PERM, MADE,
     '  for (const {token, count: many, own} of groups) for (let i = 0; i < many; i += 1) made.push(makeToken(state, token, controller, own ? params : {}, context, events));'),
    ('createToken: an Aura attached, a Food beside it not', PERM, ATTACHED, '  if (params.attachedTo !== undefined) for (const id of made) attachTo(state, id, host);'),
    ('copies: what is not the effect\'s own made as its token', PERM, NOT_OWN, '      if (false) { made.push(makeToken(state, token, controller, params, context, events)); continue; }'),
    ('copies: ... as the effect makes its tokens', PERM, NOT_OWN, NOT_OWN.replace('makeToken(state, token, controller, params, context, events)', 'makeToken(state, token, controller, {}, context, events)')),

    # ---- A predefined token a replacement makes, compiled into its definition (cards/index.mjs, predefinedIn). ----
    ('compile: a predefined token given its definition', CARDS, PREDEFINED, '    return token;'),
    ('compile: an unknown predefined token refused', CARDS, UNKNOWN, "    if (!Object.hasOwn(PREDEFINED_TOKENS, token.predefined)) return token;"),
    ('compile: one of each given its definitions', CARDS, EACH_COMPILED, '...{}'),

    # ---- The schema (script/schema.mjs). ----
    ('schema: a predefined token is its name alone', SCHEMA, TOKEN_SPEC, TOKEN_SPEC.replace('? Object.keys(token).length === 1 :', '? true :')),
    ('schema: tokens-plus by subtypes', SCHEMA, PLUS_KEYS, PLUS_KEYS.replace('!["types", "subtypes"].includes(key)', 'key !== "types"')),
    ('schema: tokens-plus told by nothing else', SCHEMA, PLUS_KEYS, PLUS_KEYS.replace('.some((key) => !["types", "subtypes"].includes(key))', '.some(() => false)')),
    ('schema: tokens-plus of any token', SCHEMA, PLUS_KEYS, PLUS_KEYS.replace('if (Object.keys(', 'if (!ability.affects?.types || Object.keys(')),
    ('schema: one of each, two or more', SCHEMA, EACH_SCHEMA, EACH_SCHEMA.replace('ability.each.length >= 2', 'ability.each.length >= 1')),
    ('schema: one of each, predefined tokens', SCHEMA, EACH_SCHEMA, EACH_SCHEMA.replace('ability.each.every((kind) => isText(kind?.predefined) && Object.keys(kind).length === 1)', 'true')),
    ('schema: players true or "you"', SCHEMA, PLAYERS_SCHEMA, 'if (ability.players !== undefined && ![true, "you", "opponent"].includes(ability.players))'),
    ('schema: a player\'s counters alone say whose', SCHEMA, PLAYER_ALONE_SCHEMA, 'if (false)'),
    ('schema: byEffect is true', SCHEMA, BY_EFFECT_SCHEMA, '      if (false) errors.push('),

    # ---- Counters (rules/statics.mjs, placeCounters): whose, by an effect, as a permanent enters. ----
    ('counters: an effect\'s, not a cost\'s', STATICS, NOT_COST, ''),
    ('counters: its controller\'s counters, not another player\'s', STATICS, WHOSE, 'if (player !== null ? !(ability.players === true || ability.players === "you")'),
    ('counters: "you" a player of them', STATICS, WHOSE, 'if (player !== null ? !(ability.players === true)'),
    ('counters: a player\'s alone never a permanent\'s', STATICS, ALONE, '        : !matchesSelector('),
    ('counters: entering, not its own effect over a set (CR 614.12)', STATICS, ENTERING_SELF, ''),
    ('counters: entering, its own of itself alone still', STATICS, ENTERING_SELF, '      if (entering && holderId === id) continue;\n'),
    ('counters: cost and entering passed on', STATICS, PASSED_ON, PASSED_ON.replace('{cost, entering}', '{}')),
    ('counters: entering counters put as entering', STATICS, ENTERING_FN, ENTERING_FN.replace('{entering: true}', '{}')),
    ('counters: a cost\'s counters said to be one', ACTIONS, 'placeCounters(state, {id}, c.counter, c.count, by, {cost: true}).count', 'placeCounters(state, {id}, c.counter, c.count, by).count'),
    ('entering: as a spell resolves', ENTRY_COUNTERS, 'frame.counts[counter] = placed.count;', 'frame.counts[counter] = state.objects[frame.objectId]?.zone === "stack" ? frame.counts[counter] : placed.count;'),
    ('entering: impending\'s time counters', STACK, '+ enteringCountersPlaced(state, arrived, "time", entry.impending, entry.playerId);', '+ entry.impending;'),
    ('entering: put onto the battlefield by an effect', ENTRY_COUNTERS, 'frame.counts[counter] = placed.count;', 'frame.counts[counter] = state.objects[frame.objectId]?.zone !== "stack" ? frame.counts[counter] : placed.count;'),
    ('entering: an additional counter as it returns', ZONES, '+ enteringCountersPlaced(state, id, params.withCounter, 1, state.objects[id].controller);', '+ 1;'),
    ('entering: as a copy', ENTERING, '+ enteringCountersPlaced(state, awaiting.objectId, counter, count, object.controller);', '+ count;'),
    ('entering: riot\'s counter', ENTERING, 'riot.counters["+1/+1"] = was + enteringCountersPlaced(state, awaiting.objectId, "+1/+1", 1, riot.controller);',
     'riot.counters["+1/+1"] = was + 1;'),
    ('entering: a token with counters', PERM, 'const placed = enteringCountersPlaced(state, id, counter, n, controller);', 'const placed = countersPlaced(state, id, counter, n, controller);'),

    # ---- "Whenever YOU put": who put them (the counters event), and the trigger's putBy. ----
    ('putBy: an effect\'s counters say who', RES, '    ...(Number.isInteger(by) ? {by} : {}),\n', ''),
    ('putBy: entering counters are the controller\'s', ENTERING, 'newValue: object.counters[counter] ?? 0, by: object.controller}}}));', 'newValue: object.counters[counter] ?? 0}}}));'),
    ('putBy: riot\'s counter is the controller\'s', ENTERING, 'newValue: riot.counters["+1/+1"], by: riot.controller}}});', 'newValue: riot.counters["+1/+1"]}}});'),
    ('putBy: earthbend\'s counters are its controller\'s', PERM, 'newValue: before + count, by: context.controller}));', 'newValue: before + count}));'),
    ('putBy: read as it triggers', TRIGGER, '\n      && (condition.putBy !== "you" || fields.by === controller);', ';'),
    ('putBy: compiled on this one\'s trigger', CARDS, '...(t.each === true ? {each: true} : {}), ...(t.putBy ? {putBy: t.putBy} : {})}', '...(t.each === true ? {each: true} : {})}'),
    ('putBy: compiled on any one\'s trigger', CARDS, '      ...(t.putBy ? {putBy: t.putBy} : {})} : null),', '      } : null),'),
    ('putBy: only "you"', CARDS, '|| ![undefined, "you"].includes(t.putBy) ? null', '? null'),

    # ---- The credits (game/tools/engine-constructs.mjs, engine-catalog.mjs). ----
    ('credit: CounterAddedOnce is counter added', CONSTRUCTS, '  CounterAddedOnce: "counter added",\n', '  CounterAddedOnce: "counter added once",\n'),
    ('credit: ReplaceCounter is AddCounter\'s instead', CONSTRUCTS, '  ReplaceCounter: "AddCounter"});', '});'),
    ('credit: an instead read as its replacement', CONSTRUCTS, '    if (FORGE_REPLACING_API[api]) continue;\n', ''),
    ('catalog: an instead listed as its replacement', CATALOG, '    if (replacing) return entry(', '    if (false) return entry('),
]
