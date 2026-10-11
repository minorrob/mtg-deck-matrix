/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "{T}: ADD {C}. THIS MANA CAN'T BE SPENT TO CAST SPELLS FROM YOUR HAND" (Heartwood Crafter // Soul Tether; Train C phase 2,
 * w2a-selectors; CR 106.4, 106.6, 118.12, 601.2h, 722.3c).
 *
 * The mana is in the pool like any other (rules/restricted-mana.mjs, addPoolMana) and pays for everything but a spell cast
 * from its player's hand: an ability, a spell cast from another zone -- a prepare spell's copy in exile, a commander from the
 * command zone -- an "unless" cost. Beside the pool, `withheldMana` says how much of it is such mana: a spell cast from the
 * hand sees the pool less it (poolFor) and spends none of it; anything else spends it first (spendFor), and a spend the
 * engine is not told of -- an "unless" cost, a mana ability's own cost -- is read as having spent it first too (withheldOf),
 * settled before mana is added again. The card's scenarios play the Crafter; this suite holds the rest: the commander,
 * each spend the engine is not told of and each way mana is added after one, the effect's own form, the pool emptying,
 * tapping for a cast, and the compile.
 */
import assert from "node:assert/strict";
import {readdirSync, readFileSync} from "node:fs";
import {join, relative} from "node:path";
import {fileURLToPath} from "node:url";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {awaitingChoice, resolveAwaiting, advance} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction, tapUnits} from "../game/engine/rules/actions.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {poolFor, withheldOf} from "../game/engine/rules/restricted-mana.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {payGeneric} from "../game/engine/rules/mana.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {collectTriggers} from "../game/engine/rules/trigger.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const CRAFTER = "Heartwood Crafter // Soul Tether", HC = "Heartwood Crafter";
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const gain = (cost, n = 3) => ({types: ["Sorcery"], manaCost: cost, colors: [], spell: {id: "s", text: `You gain ${n} life.`, targets: [], effects: [{effect: "gainLife", amount: n}]}});
const FIX = {
  Rite: gain("{1}"),
  Pair: gain("{2}"),
  Relic: {types: ["Artifact"], manaCost: "{1}", colors: [], abilities: [{id: "r", kind: "activated", text: "{1}: You gain 1 life.", cost: [{atom: "mana", cost: "{1}"}], targets: [], effects: [{effect: "gainLife", amount: 1}]}]},
  Toll: {types: ["Artifact"], manaCost: "{1}", colors: [], abilities: [{id: "t", kind: "activated", text: "{T}: You lose 2 life unless you pay {1}.", cost: [{atom: "{T}"}], targets: [],
    effects: [{effect: "unlessPays", who: "you", amount: 1, effects: [{effect: "loseLife", amount: 2}]}]}]},
  Battery: {types: ["Artifact"], manaCost: "{1}", colors: [], abilities: [{id: "b", kind: "mana", tapSelf: true, cost: "{1}", produces: {C: 2}, text: "{1}, {T}: Add {C}{C}."}]},
  Echo: {types: ["Enchantment"], manaCost: "{1}", colors: [], abilities: [{id: "e", kind: "triggered", text: "Whenever you tap a land for mana, add an additional {C}.",
    trigger: {on: "GameEventManaPool", tapper: "you", filter: {types: ["Land"]}, manaAbility: {mana: {C: 1}}}, effects: [{effect: "addMana", mana: {C: 1}}]}]},
  Bargain: {types: ["Sorcery"], manaCost: "{1}", colors: [], spell: {id: "s", text: "You lose 2 life unless you pay {1}. Add {C}{C}.", targets: [],
    effects: [{effect: "unlessPays", who: "you", amount: 1, effects: [{effect: "loseLife", amount: 2}]}, {effect: "addMana", mana: {C: 2}}]}},
  Ritual: {types: ["Sorcery"], manaCost: "{1}", colors: [], spell: {id: "s", text: "Add {C}{C}. This mana can't be spent to cast spells from your hand.", targets: [],
    effects: [{effect: "addMana", mana: {C: 2}, cantSpend: {castFrom: "hand"}}]}},
  Chief: {types: ["Creature"], supertypes: ["Legendary"], manaCost: "{1}", colors: [], power: 1, toughness: 1},
};
const play = (setup, steps = [], seats = 2) => runScenario({name: "heartwood", seats, setup, steps}, index.definition, FIX).state;
const named = (s, card, seat = 0) => [...s.zones.battlefield, ...s.zones.hand[seat], ...s.zones.exile[seat] ?? [], ...s.zones.command[seat] ?? []]
  .find((id) => s.objects[id].card === card && s.objects[id].owner === seat);
const offers = (s, kind, label) => legalActions(s, 0).filter((a) => a.kind === kind && a.label === label);
const C = (s) => s.players[0].manaPool.C;

/* ---- in the pool, and remembered beside it ---- */
{
  const s = play([at(0, "battlefield", CRAFTER, "Relic"), at(0, "hand", "Rite")], [{tap: HC}]);
  eq([C(s), s.players[0].withheldMana.map((e) => [e.key, s.objects[e.source].card, e.cantSpend])], [1, [["C", HC, {castFrom: "hand"}]]], "{C} in the pool, and beside it: the Crafter's, not for a spell from the hand");
  eq([poolFor(s, 0, {spell: named(s, "Rite")}).C, poolFor(s, 0, {ability: named(s, "Relic")}).C], [0, 1], "a spell in the hand sees none of it; an ability sees it");
  eq(offers(s, "cast", "Rite").length, 0, "Rite, in Rob's hand: not offered");
  eq(offers(s, "activate", "Relic").length, 1, "the Relic's {1}: offered");
  const t = play([at(0, "battlefield", "Wastes")], [{tap: "Wastes"}]);
  eq([C(t), "withheldMana" in t.players[0]], [1, false], "a Wastes' {C}: nothing kept beside the pool");
}

/* ---- an ability spends it first: what is left pays for a spell from the hand ---- */
{
  const s = play([at(0, "battlefield", CRAFTER, "Wastes", "Relic"), at(0, "hand", "Rite")], [{tap: HC}, {tap: "Wastes"}, {activate: "Relic"}, {resolve: true}]);
  eq([C(s), s.players[0].withheldMana], [1, []], "the Relic paid with the Crafter's {C}: the Wastes' is left, and none withheld");
  eq(offers(s, "cast", "Rite").length, 1, "so Rite can be cast");
}

/* ---- a commander, cast from the command zone (CR 903.8): not from the hand ---- */
{
  const s = play([at(0, "battlefield", CRAFTER), at(0, "command", "Chief")], [{tap: HC}]);
  eq(poolFor(s, 0, {spell: named(s, "Chief")}).C, 1, "the Chief in the command zone sees the Crafter's {C}");
  applyAction(s, 0, offers(s, "cast", "Chief")[0]);
  eq([C(s), s.players[0].withheldMana, s.stack.length], [0, [], 1], "cast with it");
}

/* ---- spends the engine is not told of: the withheld mana went first ---- */
{
  /* An "unless" cost (CR 118.12): Toll's {1}, from a pool of the Crafter's {C} and the Wastes'. */
  const s = play([at(0, "battlefield", CRAFTER, "Wastes", "Toll"), at(0, "hand", "Rite")], [{tap: HC}, {tap: "Wastes"}, {activate: "Toll"}, {resolve: true}, {choose: ["Pay {1}"]}]);
  eq([s.players[0].life, C(s), withheldOf(s, 0)], [40, 1, []], "Toll paid from the pool: the {C} left is the Wastes'");
  eq(offers(s, "cast", "Rite").length, 1, "and pays for Rite");
  applyAction(s, 0, offers(s, "cast", "Rite")[0]);
  eq([C(s), s.players[0].withheldMana], [0, []], "cast with it: nothing withheld left");
}
{
  /* A mana ability's own cost, then {C}{C} from it (activate-mana): the {C} paid was the Crafter's, the two made are not. */
  const s = play([at(0, "battlefield", CRAFTER, "Battery"), at(0, "hand", "Pair")], [{tap: HC}, {tap: "Battery"}]);
  eq([C(s), s.players[0].withheldMana], [2, []], "the Battery's {1} paid with the Crafter's {C}: {C}{C}, none withheld");
  eq(offers(s, "cast", "Pair").length, 1, "Pair, {2}, can be cast");
}
{
  /* The Great Hall's {1} from the pool, its mana restricted, and the Echo's {C} added to the pool as a triggered mana ability. */
  const s = play([at(0, "battlefield", CRAFTER, "Great Hall of the Citadel", "Echo"), at(0, "hand", "Rite")], [{tap: HC}]);
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana" && a.objectId === named(s, "Great Hall of the Citadel") && a.abilityId === "a1"));
  eq([C(s), s.players[0].restrictedMana.length, s.players[0].withheldMana], [1, 2, []], "the Hall's {1} paid with the Crafter's {C}; the Echo's {C} is not withheld");
  eq(offers(s, "cast", "Rite").length, 1, "so Rite can be cast with it");
}
{
  /* "You lose 2 life unless you pay {1}. Add {C}{C}" (an effect adds it): the {1} paid with the Crafter's {C}. */
  const s = play([at(0, "battlefield", CRAFTER, "Wastes"), at(0, "hand", "Bargain", "Pair")], [{tap: HC}, {tap: "Wastes"}, {cast: "Bargain"}, {resolve: true}, {choose: ["Pay {1}"]}]);
  eq([s.players[0].life, C(s), s.players[0].withheldMana], [40, 2, []], "Bargain cast with the Wastes', its {1} paid with the Crafter's: {C}{C} added, none withheld");
  eq(offers(s, "cast", "Pair").length, 1, "Pair can be cast");
}
{
  /* Not paid: the Crafter's {C} is still the Crafter's. */
  const s = play([at(0, "battlefield", CRAFTER, "Wastes"), at(0, "hand", "Bargain", "Pair", "Rite")], [{tap: HC}, {tap: "Wastes"}, {cast: "Bargain"}, {resolve: true}, {choose: ["Don't pay"]}]);
  eq([s.players[0].life, C(s), withheldOf(s, 0).length], [38, 3, 1], "Bargain's {1} not paid: {C}{C} added, the Crafter's {C} still withheld");
  eq([offers(s, "cast", "Pair").length, offers(s, "cast", "Rite").length], [1, 1], "two of the three pay for a spell from the hand");
  applyAction(s, 0, offers(s, "cast", "Pair")[0]);
  eq([C(s), withheldOf(s, 0).length, offers(s, "cast", "Rite").length], [1, 1, 0], "Pair paid with the other two: the Crafter's is left, and Rite can't be cast with it");
}

/* ---- the effect's own form: "Add {C}{C}. This mana can't be spent to cast spells from your hand" ---- */
{
  const s = play([at(0, "battlefield", "Wastes", "Relic"), at(0, "hand", "Ritual", "Rite")], [{tap: "Wastes"}, {cast: "Ritual"}, {resolve: true}]);
  eq([C(s), s.players[0].withheldMana.map((e) => [e.key, e.cantSpend])], [2, [["C", {castFrom: "hand"}], ["C", {castFrom: "hand"}]]], "{C}{C} in the pool, both withheld");
  eq([offers(s, "cast", "Rite").length, offers(s, "activate", "Relic").length], [0, 1], "Rite can't be cast with it; the Relic can be activated");
  applyAction(s, 0, offers(s, "activate", "Relic")[0]);
  eq([C(s), withheldOf(s, 0).length], [1, 1], "the Relic's {1} paid with one of them: the other still withheld");
}

/* ---- it empties with the pool (CR 106.4) ---- */
{
  const s = play([at(0, "battlefield", CRAFTER)], [{tap: HC}]);
  for (let n = 0; n < 20 && s.phase === "MAIN1"; n += 1) { if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s); }
  eq([s.phase !== "MAIN1", C(s), s.players[0].withheldMana], [true, 0, []], "the main phase over: the pool empty, and nothing withheld");
}

/* ---- tapped for a cast: never the Crafter -- its mana would pay nothing for a spell from the hand ---- */
{
  const s = play([at(0, "battlefield", CRAFTER), at(0, "hand", "Rite")]);
  eq([tapUnits(s, 0).length, offers(s, "cast", "Rite").length], [0, 0], "the Crafter untapped, Rite in hand: nothing to tap for it, no cast");
  const t = play([at(0, "battlefield", CRAFTER, "Wastes"), at(0, "hand", "Rite")]);
  eq(tapUnits(t, 0).map((u) => t.objects[u.id].card), ["Wastes"], "a Wastes beside it: the Wastes is what a cast taps");
}

/* ---- an "unless" cost may tap it: its {C} pays for that ---- */
{
  const s = play([at(0, "battlefield", CRAFTER, "Toll")], [{activate: "Toll"}, {resolve: true}]);
  ok(awaitingChoice(s).options.some((o) => o.label === "Pay {1}"), "Toll asks, and paying is offered: the Crafter can be tapped for it");
  resolveAwaiting(s, [awaitingChoice(s).options.find((o) => o.label === "Pay {1}").index]);
  eq([s.players[0].life, s.objects[named(s, HC)].tapped], [40, true], "paid: the Crafter tapped");
}

/* ---- EVERY ADD TO A POOL GOES THROUGH addPoolMana, which settles the withheld mana first ----
   Read from the source: the pool's raw add (rules/mana.mjs, addMana) is imported by rules/restricted-mana.mjs alone and called
   there only in addPoolMana; nothing else in the engine writes a pool up -- by `+=`, `++` or `=` on a pool or a name for one,
   by handing one to anything but what spends or reads it -- but the step's emptying (rules/turn.mjs, which keeps
   firebending's mana and never adds). */
{
  const engine = fileURLToPath(new URL("../game/engine/", import.meta.url));
  const files = [];
  const walk = (dir) => { for (const e of readdirSync(dir, {withFileTypes: true})) { const p = join(dir, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith(".mjs") && e.name !== "definitions.mjs") files.push(p); } };
  walk(engine);
  const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
  const rel = (p) => relative(engine, p).split("\\").join("/");
  const importers = [], namespaces = [], writes = [], handed = [];
  const READERS = ["spend", "poolSize", "paymentOptions", "chosenPayment", "automaticPayment", "Object.entries", "Object.keys", "Object.values", "addMana"];
  for (const file of files) {
    const text = code(readFileSync(file, "utf8"));
    for (const [, names, from] of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*"([^"]*)"/g))
      if (/(^|\/)mana\.mjs$/.test(from) && names.split(",").some((n) => n.trim().split(/\s+as\s+/)[0] === "addMana")) importers.push(rel(file));
    for (const [, from] of text.matchAll(/import\s*\*\s*as\s+\w+\s+from\s*"([^"]*)"/g)) if (/(^|\/)mana\.mjs$/.test(from)) namespaces.push(rel(file));
    if (/\{[^{}]*\bmanaPool\b[^{}]*\}\s*=[^=]/.test(text)) writes.push(`${rel(file)}: a pool destructured`);
    /* Each top-level statement on its own: a local name for a pool (`const pool = ...manaPool;`) is that function's. */
    for (const chunk of text.split(/\n(?=\S)/)) {
      const aliases = [...new Set([...chunk.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*[\w.[\]()]*\.manaPool\s*;/g)].map((m) => m[1]))];
      for (const name of ["manaPool", ...aliases]) {
        /* A pool as `...manaPool`, or a local name for one standing alone (not `e.pool`). */
        const at = name === "manaPool" ? "\\bmanaPool" : `(?<![\\w.])${name}`;
        for (const m of chunk.matchAll(new RegExp(`${at}\\s*(\\[[^\\]]*\\]|\\.[WUBRGC]\\b)\\s*(\\+=|\\+\\+|=(?!=))[^;\\n]*`, "g"))) writes.push(`${rel(file)}: ${m[0].trim()}`);
        for (const m of chunk.matchAll(new RegExp(`\\+\\+\\s*[\\w.\\[\\]]*${at}`, "g"))) writes.push(`${rel(file)}: ${m[0].trim()}`);
        for (const m of chunk.matchAll(new RegExp(`([\\w.]+)\\(\\s*[\\w.\\[\\]]*?(?:\\.manaPool|${at})\\s*[,)]`, "g"))) if (!READERS.includes(m[1])) handed.push(`${rel(file)}: ${m[0]}`);
      }
    }
    for (const m of text.matchAll(/\.manaPool\s*=(?!=)[^;\n]*/g)) writes.push(`${rel(file)}: ${m[0].trim()}`);
    for (const m of text.matchAll(/Object\.assign\(\s*[\w.[\]]*\.manaPool/g)) writes.push(`${rel(file)}: ${m[0]}`);
  }
  eq([importers, namespaces], [["rules/restricted-mana.mjs"], []], "the pool's raw add is imported by rules/restricted-mana.mjs alone");
  const restricted = code(readFileSync(join(engine, "rules/restricted-mana.mjs"), "utf8"));
  const body = restricted.slice(restricted.indexOf("export function addPoolMana"), restricted.indexOf("\n}\n", restricted.indexOf("export function addPoolMana")));
  eq([(restricted.match(/\baddMana\(/g) ?? []).length, (body.match(/\baddMana\(/g) ?? []).length, /^\s*export function addPoolMana[^{]*\{\s*settleWithheld\(state, player\);/.test(body)], [1, 1, true],
    "and called once, in addPoolMana, after the withheld mana is settled");
  eq(writes, ["rules/turn.mjs: manaPool[color] = kept[color] ?? 0"], "nothing else writes a pool up: the step's emptying alone sets one");
  eq(handed, [], "nor hands a pool to anything that might");
}

/* ---- and the constructs that add mana since (firebending; two mana of one color; a delayed triggered mana ability): each
   settles the Crafter's {C}, spent unsaid by an "unless" cost, before it adds ---- */
{
  const spentUnsaid = (setup = []) => {
    const s = play([at(0, "battlefield", CRAFTER, ...setup), at(0, "hand", "Rite")], [{tap: HC}]);
    payGeneric(s, 0, 1);
    eq([C(s), s.players[0].withheldMana.length, withheldOf(s, 0)], [0, 1, []], "the Crafter's {C} spent on an \"unless\" cost: still listed, read as gone");
    return s;
  };
  const firebent = spentUnsaid();
  runEffects(firebent, [{effect: "addMana", mana: {C: 1}, untilEndOfCombat: true}], {controller: 0, source: null});
  eq([C(firebent), firebent.players[0].withheldMana, firebent.players[0].combatMana, offers(firebent, "cast", "Rite").length], [1, [], {C: 1}, 1],
    "mana kept until end of combat (firebending): settled first -- its {C} is not withheld, and pays for Rite");
  const ashling = spentUnsaid();
  beginResolution(ashling, [{effect: "addMana", anyColor: true, oneColor: true, count: 2}], {controller: 0, source: null});
  resolveAwaiting(ashling, [awaitingChoice(ashling).options.find((o) => o.label === "Green").index]);
  eq([ashling.players[0].manaPool.G, ashling.players[0].withheldMana], [2, []], "two mana of any one color (Ashling, Rimebound's): settled as it is added");
  const tide = compileScript({schema: "CrankCardScript@1", identity: {name: "Tide", oracleId: "x", types: ["Instant"], subtypes: [], manaCost: "{R}", colors: ["R"], colorIdentity: ["R"]},
    oracleText: "x", abilities: [{kind: "spell", text: "x", targets: [], effects: [{effect: "delayedTrigger", when: {on: "tapped for mana", tapper: "you", filter: {types: ["Land"]}}, thisTurn: true,
      text: "Until end of turn, whenever you tap a land for mana, add an additional {C}.", effects: [{effect: "addMana", mana: {C: 1}}]}]}]}).definition.spell.effects[0];
  eq(tide.on.manaAbility, {mana: {C: 1}}, "a delayed triggered mana ability (Molten Tide's form)");
  /* The Great Hall's {1} paid with the Crafter's {C} (a mana ability's own cost, unsaid), its mana restricted -- so nothing but
     the delayed ability's {C} goes into the pool. */
  const hall = play([at(0, "battlefield", CRAFTER, "Great Hall of the Citadel")], [{tap: HC}]);
  collectTriggers(hall, runEffects(hall, [tide], {controller: 0, source: null}));
  applyAction(hall, 0, legalActions(hall, 0).find((a) => a.kind === "activate-mana" && a.objectId === named(hall, "Great Hall of the Citadel") && a.abilityId === "a1"));
  eq([C(hall), hall.players[0].restrictedMana.length, hall.players[0].withheldMana], [1, 2, []], "the Hall's restricted mana, and the delayed ability's {C}: settled, not withheld");
}

/* ---- the compile ---- */
{
  const mana = index.definition(CRAFTER).abilities.find((a) => a.kind === "mana");
  eq([mana.produces, mana.cantSpend], [{C: 1}, {castFrom: "hand"}], "the Crafter's mana ability carries what its mana can't be spent on");
  const land = (addMana, trigger = null) => compileScript({schema: "CrankCardScript@1", identity: {name: "Odd", oracleId: "x", types: ["Land"], subtypes: [], manaCost: "", colors: [], colorIdentity: []},
    oracleText: "x", source: "hand", abilities: [trigger ? {kind: "triggered", text: "x", trigger, effects: [{effect: "addMana", mana: {C: 1}, ...addMana}]}
      : {kind: "activated", text: "x", cost: [{atom: "{T}"}], effects: [{effect: "addMana", mana: {C: 1}, ...addMana}]}]});
  const refused = (problems) => problems.some((p) => p.includes("cantSpend {castFrom: \"hand\"}"));
  eq(land({cantSpend: {castFrom: "hand"}}).problems, [], "spells cast from the hand: built");
  ok(refused(land({cantSpend: {castFrom: "graveyard"}}).problems), "from another zone: not built, and said");
  ok(refused(land({cantSpend: {castFrom: "hand", also: true}}).problems), "with anything else said of it: not built");
  ok(refused(land({cantSpend: {castFrom: "hand"}, spendOnly: {spell: {types: ["Creature"]}}}).problems), "with a spending restriction besides: not built");
  ok(refused(land({cantSpend: {castFrom: "hand"}, whenSpent: {spell: {types: ["Creature"]}, effects: [{effect: "scry", count: 1}], text: "x"}}).problems), "with a rider besides: not built");
  ok(land({cantSpend: {castFrom: "hand"}}, {on: "tapped for mana", filter: {types: ["Land"]}}).problems.some((p) => p.includes("triggered mana ability whose mana may pay for only some things")),
    "a triggered mana ability's: not built, and said");
  ok(refused(land({cantSpend: {castFrom: "hand"}, untilEndOfCombat: true}).problems) && refused(compileScript({schema: "CrankCardScript@1",
    identity: {name: "Odd", oracleId: "x", types: ["Creature"], subtypes: [], manaCost: "{1}", colors: [], colorIdentity: [], power: 1, toughness: 1}, oracleText: "x", source: "hand",
    abilities: [{kind: "triggered", text: "x", trigger: {on: "upkeep"}, effects: [{effect: "addMana", anyColor: true, oneColor: true, count: 2, cantSpend: {castFrom: "hand"}}]}]}).problems),
  "kept until end of combat, or of one color chosen as it resolves: neither carries it, so not built");
  const delayed = compileScript({schema: "CrankCardScript@1", identity: {name: "Odd", oracleId: "x", types: ["Instant"], subtypes: [], manaCost: "{R}", colors: ["R"], colorIdentity: ["R"]},
    oracleText: "x", abilities: [{kind: "spell", text: "x", targets: [], effects: [{effect: "delayedTrigger", when: {on: "tapped for mana", tapper: "you", filter: {types: ["Land"]}}, thisTurn: true,
      text: "x", effects: [{effect: "addMana", mana: {C: 1}, cantSpend: {castFrom: "hand"}}]}]}]});
  ok(delayed.problems.some((p) => p.includes("delayed triggered mana ability whose mana can't be spent on some things")), "a delayed triggered mana ability's: not built, and said");
}

console.log(`engine-mana-withheld: ${checks} checks passed -- mana that can't be spent to cast spells from the hand, in the pool, spent first on anything else and kept from those, gone with its pool.`);
