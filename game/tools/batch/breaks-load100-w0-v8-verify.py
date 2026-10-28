# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
# V8's pool and journal-evidence checkpoint. No card or rule module is changed by these mutations.
SUITES = ['tests/fuzz-pool.mjs']
FUZZ = 'tools/fuzz-live.mjs'
EVIDENCE = 'game/tools/ability-evidence.mjs'
BREAKS = [
    ('a throwing definition stays a finding', FUZZ, 'const definition = cards(n);', 'let definition; try {definition = cards(n);} catch {definition = null;}'),
    ('pool rejects missing table definitions', FUZZ, 'if (!definition && requireAll) throw', 'if (false) throw'),
    ('pool rejects missing oracle records', FUZZ, 'if (!oracle(n)) {if (requireAll) throw', 'if (!oracle(n)) {if (false) throw'),
    ('printed commander permission is respected', FUZZ, 'commanderLegal(definitions.get(n))', '/Legendary/.test(oracle(n).type) && /Creature/.test(front(n))'),
    ('favored names belong to the population', FUZZ, 'if (!playable.includes(name)) throw', 'if (false) throw'),
    ('favored cards have compatible commanders', FUZZ, 'if (!commanders.some((n) => within(oracle(n).ci || [], name))) throw', 'if (false) throw'),
    ('favored cards are actually dealt', FUZZ, '[...orderedFavor.filter((name) => list.includes(name)), ...shuffle(list.filter((name) => !favored.includes(name)))]', 'shuffle(list.filter((name) => !favored.includes(name)))'),
    ('pool demands its whole final population', FUZZ, 'namespace: "pool", requireAll: true', 'namespace: "pool", requireAll: false'),
    ('pool demands enough legal commanders', FUZZ, 'if (decks.length !== (given.count ?? 4)) throw', 'if (false) throw'),
    ('pool inventory has oracle records', FUZZ, 'if (!record) throw new Error(`Final definition ${name} has no oracle record.`);', 'if (!record) continue;'),
    ('pool excludes banned and nondeck cards', FUZZ, 'if (deckCard(record) && !banned.has(name)) library.push(name);', 'library.push(name);'),
    ('strict verdict counts human refusals', FUZZ, 'if (game.strictRefusals && game.personRefused?.length) problems.push', 'if (false) problems.push'),
    ('pool evidence is strict by default', FUZZ, 'argv.includes("--pool") || argv.includes("--strict-refusals")', 'argv.includes("--strict-refusals")'),
    ('library strict evidence is explicit', FUZZ, 'argv.includes("--pool") || argv.includes("--strict-refusals")', 'argv.includes("--pool")'),
    ('provider levels are refused', FUZZ, 'if (level !== null && !["easy", "normal"].includes(level))', 'if (false)'),
    ('ascending seed ranges are required', FUZZ, 'b < a', 'false'),
    ('duplicate seeds do not inflate evidence', FUZZ, 'export const seedsFrom = (spec) => [...new Set(spec.split(",").flatMap((part) => {', 'export const seedsFrom = (spec) => [...(spec.split(",").flatMap((part) => {'),
    ('invalid favored entries fail', FUZZ, 'if (names.some((name) => typeof name !== "string" || !name.trim())) throw', 'if (false) throw'),
    ('unclean games supply no evidence', EVIDENCE, 'if (game !== null && !clean) return false;', ''),
    ('evidence identifies a scenario or game', EVIDENCE, 'if (game === null && scenario === null) throw', 'if (false) throw'),
    ('face-local ability ambiguity is retained', EVIDENCE, 'if (matches.length !== 1) {', 'if (matches.length === 0) {'),
    ('only stack-observable printed abilities receive ids', EVIDENCE, '!a.mana && ["spell", "activated", "triggered"].includes(a.kind)', 'true'),
    ('a fizzle is not a resolution', EVIDENCE, 'if (f.hasFizzled !== false) continue;', ''),
    ('a copy is not a successfully cast card', EVIDENCE, 'casts.get(f.stackId) === full && game !== null', 'game !== null'),
    ('land play is recorded', EVIDENCE, 'card.played += 1; card.resolved += 1; successful.add(full);', 'card.played += 1;'),
    ('scenario evidence is not whole-game exercise', EVIDENCE, 'if (f.kind === "spell" && casts.get(f.stackId) === full && game !== null)', 'if (f.kind === "spell" && casts.get(f.stackId) === full)'),
    ('ability evidence names its scenario', EVIDENCE, 'if (scenario !== null) addName(hit.scenarios, scenario);', ''),
    ('unobserved applications keep the gate unmet', EVIDENCE, 'complete: unreached.length === 0', 'complete: true'),
]
