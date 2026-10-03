/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 76 (AN ITEM OF ITS OWN): GRANTING ABILITIES (Forge's AddAbility and AddTrigger; CR 613.1f) -- AND
 * "BECOMES THE TARGET OF A SPELL" (Forge's BecomesTarget).
 *
 * "Lands you control have '{T}: Add one mana of any color'", "equipped creature has 'Whenever this creature attacks,
 * create a Treasure token'", "other creatures you control have 'Ward--Pay 2 life'", "until end of turn, target creature
 * gains 'When this creature dies, return it ...'": the abilities, compiled as a card's own are, given in layer 6 by a
 * static (`apply.addAbilities`) or a pump (`abilities`), and read wherever a permanent's activated, mana and triggered
 * abilities are (rules/layers.mjs, abilitiesOf) -- its last known abilities too. "Loses all abilities" takes the ones
 * given before it, not after. Each grant is an ability of its own: two Gemhide Slivers, two mana abilities.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {legalActions, applyAction, nothingToDo} from "../game/engine/rules/actions.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {abilitiesOf, lastKnown} from "../game/engine/rules/layers.mjs";
import {canPayGeneric} from "../game/engine/rules/mana.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const at = (seat, zone, ...names) => ({seat, zone, cards: names});
const creature = (cost, subtypes, more = {}) => ({types: ["Creature"], subtypes, manaCost: cost, colors: ["G"], power: 2, toughness: 2, ...more});
const ANY = {kind: "activated", text: "{T}: Add one mana of any color.", cost: [{atom: "{T}"}], effects: [{effect: "addMana", anyColor: true}]};
const DRAW = {kind: "activated", text: "{1}, {T}: Draw a card.", cost: [{atom: "mana", cost: "{1}"}, {atom: "{T}"}], effects: [{effect: "draw", count: 1}]};
const FIX = {Bear: creature("{1}{G}", ["Bear"]), Ogre: creature("{2}{R}", ["Ogre"], {colors: ["R"]}), Sliver: creature("{1}", ["Sliver"]), Relic: {types: ["Artifact"], manaCost: "{1}", colors: []},
  Pinger: creature("{1}", ["Wizard"], {abilities: [{id: "p", kind: "activated", text: "{T}: 1 damage to target creature.", cost: [{atom: "{T}"}],
    targets: [{what: "permanent", types: ["Creature"]}], effects: [{effect: "dealDamage", amount: 1, targets: {target: 0}}]}]}),
  Bolt: {types: ["Instant"], manaCost: "{C}", colors: ["R"], spell: {id: "s", text: "3 damage to target creature.", targets: [{what: "permanent", types: ["Creature"]}],
    effects: [{effect: "dealDamage", amount: 3, targets: {target: 0}}]}}};
const play = (setup, seats = 2) => runScenario({name: "grants", seats, setup, steps: [], expect: []}, cards.definition, FIX).state;
const named = (s, name, seat) => s.zones.battlefield.filter((id) => s.objects[id].card === name && (seat === undefined || s.objects[id].controller === seat));
const manaOffers = (s, player, id) => legalActions(s, player).filter((a) => a.kind === "activate-mana" && a.objectId === id);
/* On to that player's first main phase, every question answered with nothing. */
const toMain = (s, player) => { for (let n = 0; n < 200 && !(s.activePlayer === player && s.priorityPlayer === player && s.phase === "MAIN1"); n += 1) { if (s.awaiting) resolveAwaiting(s, []); else if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s); } };
const settle = (s) => { for (let n = 0; n < 60 && (s.stack.length || s.awaiting); n += 1) { if (s.awaiting) resolveAwaiting(s, [0]); else passPriority(s); } };

/* ---- compiling what is given ---- */
const script = (abilities, types = ["Artifact"]) => ({schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "test", types}, oracleText: "", abilities});
const grant = (abilities, more = {}) => ({kind: "static", text: "They have it.", layer: 6, affects: {what: "permanent", types: ["Land"], controller: "you"}, apply: {addAbilities: abilities}, ...more});
{
  const {definition} = compileScript(script([grant([ANY, {kind: "keyword", text: "Ward—Pay 2 life.", keyword: "ward", cost: [{atom: "payLife", amount: 2}]}])]));
  const [given] = definition.abilities;
  eq([given.apply.addAbilities.map((a) => a.kind), given.apply.addKeywords], [["mana", "triggered"], ["Ward"]],
    "a mana ability compiled as one, and ward as its triggered ability and its keyword");
  const problems = (s) => compileScript(s).problems;
  eq(problems(script([grant([{kind: "static", text: "x", layer: 7, affects: {what: "permanent"}, apply: {power: 1}}])])).some((p) => /only activated, triggered, keyword/.test(p)), true,
    "a static given: refused");
  eq(problems(script([grant([{kind: "replacement", text: "x", watches: {event: "enters"}, change: {tapped: true}}])])).some((p) => /only activated/.test(p)), true, "a replacement given: refused");
  eq(problems(script([grant([ANY], {layer: 7})])).some((p) => /layer 6/.test(p)), true, "abilities given outside layer 6: refused");
  eq(problems(script([grant([])])).some((p) => /at least one/.test(p)), true, "nothing given: refused");
  eq(problems(script([grant([{kind: "triggered", text: "x", trigger: {on: "chapter", chapter: 0}, effects: [{effect: "draw", count: 1}]}])])).some((p) => /^They have it\.: /.test(p)), true,
    "a given ability's own problem, named with the static that gives it");
  const pump = (effect) => script([{kind: "spell", text: "It gains it.", targets: [{what: "permanent", types: ["Creature"]}], effects: [{effect, targets: {target: 0}, abilities: [DRAW]}]}], ["Instant"]);
  eq(compileScript(pump("pump")).definition.spell.effects[0].abilities.map((a) => a.kind), ["activated"], "a pump's abilities compiled");
  eq(compileScript(pump("tap")).problems.some((p) => /tap gives no abilities/.test(p)), true, "another effect's abilities: refused");
  /* Wherever a pump is: in an activated ability's effects, in a mode; ward given by a pump is its keyword too. */
  const activated = compileScript(script([{kind: "activated", text: "{1}: It gains it.", cost: [{atom: "mana", cost: "{1}"}], targets: [{what: "permanent", types: ["Creature"]}],
    effects: [{effect: "pump", targets: {target: 0}, abilities: [{kind: "keyword", text: "ward {1}", keyword: "ward", cost: [{atom: "mana", cost: "{1}"}]}]}]}])).definition.abilities[0].effects[0];
  eq([activated.abilities.map((a) => a.kind), activated.keywords], [["triggered"], ["Ward"]], "an activated ability's pump: ward compiled, and its keyword");
  const modal = compileScript(script([{kind: "spell", text: "Choose one.", effects: [{effect: "modal", modes: [{text: "Draw.", effects: [{effect: "draw", count: 1}]},
    {text: "It gains it.", effects: [{effect: "pump", targets: "self", abilities: [ANY]}]}]}]}], ["Sorcery"])).definition.spell.effects[0].modes[1].effects[0];
  eq(modal.abilities.map((a) => a.kind), ["mana"], "a mode's pump compiled");
  const nested = compileScript(script([{kind: "spell", text: "Each player's.", effects: [{effect: "repeatFor", each: "player", effects: [{effect: "pump", targets: "self", abilities: [ANY]}]}]}],
    ["Sorcery"])).definition.spell.effects[0].effects[0];
  eq(nested.abilities.map((a) => a.kind), ["mana"], "a pump nested in another effect compiled");
  /* The script itself is never changed by compiling it. */
  const original = pump("pump"), before = JSON.stringify(original);
  compileScript(original);
  eq(JSON.stringify(original), before, "the script unchanged");
}

/* ---- read where a permanent's abilities are ---- */
{
  /* Nothing in play gives or takes: a permanent's abilities are its own, read without deriving. */
  const s = play([at(0, "battlefield", "Pinger")]);
  const [pinger] = named(s, "Pinger");
  eq(abilitiesOf(s, pinger) === s.objects[pinger].abilities, true, "no grants in play: its own abilities, as they are");
}
{
  /* Two Gemhide Slivers: each Sliver has two mana abilities, ids of their own; Maya's Sliver too (all Slivers). */
  const s = play([at(0, "battlefield", "Gemhide Sliver", "Gemhide Sliver", "Sliver"), at(1, "battlefield", "Sliver")]);
  const [mine] = named(s, "Sliver", 0), [hers] = named(s, "Sliver", 1);
  const granted = abilitiesOf(s, mine).filter((a) => a.id.startsWith("granted:"));
  eq([granted.length, new Set(granted.map((a) => a.id)).size, manaOffers(s, 0, mine).length], [2, 2, 10], "two grants, two abilities, ten offers");
  eq(abilitiesOf(s, hers).filter((a) => a.kind === "mana").length, 2, "an opponent's Sliver has them too");
  /* A card in a hand has its own abilities only. */
  const t = play([at(0, "battlefield", "Gemhide Sliver"), at(0, "hand", "Sliver")]);
  eq(abilitiesOf(t, Object.values(t.objects).find((o) => o.card === "Sliver" && o.zone === "hand").id).length, 0, "in a hand: nothing given");
}
{
  /* One source giving the same ability twice ("{1}: target creature gains ..." activated twice): two abilities. */
  const s = play([at(0, "battlefield", "Bear")]);
  const [bear] = named(s, "Bear");
  const given = compileScript(script([ANY])).definition.abilities;
  runEffects(s, [{effect: "pump", targets: [bear], abilities: given}, {effect: "pump", targets: [bear], abilities: given}], {controller: 0, source: 77});
  eq(new Set(abilitiesOf(s, bear).map((a) => a.id)).size, 2, "two grants from one source: two ids");
  /* One permanent with two statics that give (one timestamp, CR 613.7d): two abilities. */
  const t = play([at(0, "battlefield", "Bear", "Relic")]);
  const [tb] = named(t, "Bear"), [relic] = named(t, "Relic");
  t.objects[relic].abilities = compileScript(script([grant([ANY], {affects: {what: "permanent", types: ["Creature"], controller: "you"}}),
    grant([DRAW], {affects: {what: "permanent", types: ["Creature"], controller: "you"}})])).definition.abilities;
  eq(abilitiesOf(t, tb).map((a) => a.text), [ANY.text, DRAW.text], "both given");
  eq(new Set(abilitiesOf(t, tb).map((a) => a.id)).size, 2, "two statics of one permanent: two ids");
}
{
  /* "Nothing to do" counts a granted mana ability at what it adds less what it costs: "{1}, {T}: Add {G}{G}" is one. */
  const s = play([at(0, "battlefield", "Bear"), at(0, "hand", "Ogre")]);
  const [bear] = named(s, "Bear");
  s.effects = [...(s.effects ?? []), {id: "x", layer: 6, affects: {ids: [bear]}, apply: {addAbilities: [{id: "g", kind: "mana", tapSelf: true, cost: "{1}", produces: {G: 2}, text: "{1}, {T}: Add {G}{G}."}]},
    until: null, sourceController: 0, timestamp: s.nextTimestamp++}];
  s.players[0].manaPool.C = 1;
  eq(nothingToDo(s, 0), true, "a pool of one and a source netting one: the three-mana Ogre is out of reach");
}
{
  /* "Loses all abilities" with nothing given anywhere: its own gone all the same. */
  const s = play([at(0, "battlefield", "Pinger")]);
  const [pinger] = named(s, "Pinger");
  s.effects = [...(s.effects ?? []), {id: "silence", layer: 6, affects: {ids: [pinger]}, apply: {removeAllAbilities: true}, until: null, sourceController: 0, timestamp: s.nextTimestamp++}];
  eq([abilitiesOf(s, pinger), legalActions(s, 0).filter((a) => a.objectId === pinger)], [[], []], "no ping, nothing offered");
}
{
  /* "Loses all abilities" takes its own and the ones given before; one given after, it keeps (CR 613.1f, 613.7). */
  const s = play([at(0, "battlefield", "Gemhide Sliver", "Pinger")]);
  const [pinger] = named(s, "Pinger");
  const later = (apply) => { s.effects = [...(s.effects ?? []), {id: `x${s.nextTimestamp}`, layer: 6, affects: {ids: [pinger]}, apply, until: null, sourceController: 0, timestamp: s.nextTimestamp++}]; };
  later({addAbilities: [{...compileScript(script([ANY])).definition.abilities[0]}]});
  later({removeAllAbilities: true});
  eq(abilitiesOf(s, pinger), [], "its own ping and the mana given before: gone");
  later({addAbilities: [{id: "d", kind: "activated", text: DRAW.text, cost: DRAW.cost, targets: [], effects: DRAW.effects}]});
  eq(abilitiesOf(s, pinger).map((a) => a.text), [DRAW.text], "the one given after: kept");
  eq(legalActions(s, 0).filter((a) => a.objectId === pinger).map((a) => a.kind), [], "and nothing it lost is offered (the draw wants {1})");
}
{
  /* A static working from a graveyard that gives abilities is read too. */
  const s = play([at(0, "battlefield", "Bear")]);
  const [bear] = named(s, "Bear");
  const grave = Object.values(s.objects).find((o) => o.zone === "graveyard") ?? null;
  eq(grave, null, "an empty graveyard to start");
  s.objects[bear].abilities = [];
  const id = Object.keys(s.objects).length + 100;
  s.objects[id] = {id, card: "Ghost", types: ["Creature"], owner: 0, controller: 0, zone: "graveyard", counters: {}, keywords: [], timestamp: s.nextTimestamp++,
    abilities: [{id: "g", kind: "static", worksFrom: "graveyard", layer: 6, affects: {what: "permanent", types: ["Creature"], controller: "you"}, apply: {addAbilities: [{id: "m", kind: "mana", tapSelf: true, anyColor: true, text: ANY.text}]}}]};
  s.zones.graveyard[0].push(id);
  eq(manaOffers(s, 0, bear).length, 5, "from a graveyard: the Bear taps for any color");
}
{
  /* What pays: a granted mana ability is a plain source -- generic mana it can pay. */
  const s = play([at(0, "battlefield", "Bear")]);
  const t = play([at(0, "battlefield", "Enduring Vitality", "Bear")]);
  eq([canPayGeneric(s, 0, 1), canPayGeneric(t, 0, 2)], [false, true], "without it, the Bear pays nothing; with it, it and the Vitality pay two");
}
{
  /* Its last known abilities are the ones it had, the given ones included ("when this creature dies", Feign Death). */
  const s = play([at(0, "battlefield", "Paradise Mantle", "Bear")]);
  const [mantle] = named(s, "Paradise Mantle"), [bear] = named(s, "Bear");
  s.objects[mantle].attachedTo = bear; s.objects[bear].attachments = [mantle];
  eq(lastKnown(s, bear).abilities.map((a) => a.kind), ["mana"], "as it last was: the mana ability given");
}
{
  /* Activated by its own id; the source is the permanent that has it: Bootleggers' Stash's Treasure is the land's
     controller's. */
  const s = play([at(0, "battlefield", "Bootleggers' Stash", "Wastes")]);
  const [wastes] = named(s, "Wastes");
  const [offer] = legalActions(s, 0).filter((a) => a.kind === "activate" && a.objectId === wastes);
  eq(offer.abilityId.startsWith("granted:"), true, "offered by the id of what was given");
  applyAction(s, 0, offer);
  settle(s);
  eq(named(s, "Treasure", 0).length, 1, "the Treasure made, his");
}
{
  /* Three players: Maya's Sliver enters under Rob's Harmonic Sliver -- her ability, she aims it. */
  const s = play([at(0, "battlefield", "Harmonic Sliver"), at(1, "hand", "Sliver"), at(1, "battlefield", "Wastes"), at(2, "battlefield", "Relic")], 3);
  toMain(s, 1);
  applyAction(s, 1, legalActions(s, 1).find((a) => a.kind === "activate-mana"));
  applyAction(s, 1, legalActions(s, 1).find((a) => a.kind === "cast" && a.label === "Sliver"));
  for (let n = 0; n < 20 && !s.awaiting; n += 1) passPriority(s);
  const choice = awaitingChoice(s);
  eq([s.awaiting?.player, choice?.options.map((o) => o.label)], [1, ["Relic"]], "her trigger, her target");
}

/* ---- becomes the target ---- */
{
  eq(missingFor({triggers: ["BecomesTarget"]}), [], "BecomesTarget built");
  eq(missingFor({options: ["AddTriggers"]}), [], "AddTriggers built");
  const trigger = (t) => compileScript(script([{kind: "triggered", text: "x", trigger: {on: "becomes target", ...t}, effects: [{effect: "draw", count: 1}]}], ["Creature"]));
  eq([trigger({}).problems, trigger({by: "you"}).problems.length > 0, trigger({who: "another", spell: true}).definition.abilities[0].trigger],
    [[], true, {on: "GameEventBecomesTarget", who: "another", spell: true}], "self by anyone; by you not yet; another's, a spell's");
}
{
  /* Thunderbreak Regent: Maya's ability at Rob's Dragon triggers it ("a spell or ability"); at his non-Dragon, nothing. */
  const s = play([at(0, "battlefield", "Thunderbreak Regent", "Bear"), at(1, "battlefield", "Pinger")]);
  toMain(s, 1);
  const [regent] = named(s, "Thunderbreak Regent"), [bear] = named(s, "Bear");
  const ping = (target) => legalActions(s, 1).find((a) => a.kind === "activate" && a.label === "Pinger" && a.targets?.[0]?.id === target);
  applyAction(s, 1, ping(bear));
  passPriority(s);
  eq(s.stack.length, 1, "at the Bear: no trigger");
  settle(s);
  s.objects[named(s, "Pinger")[0]].tapped = false;
  applyAction(s, 1, ping(regent));
  settle(s);
  eq(s.players[1].life, 37, "at the Dragon, by her ability: 3 damage to her");
}
{
  /* Goldspan Dragon: "of a spell" -- Maya's Bolt triggers it; it is about the target, not the player. */
  const s = play([at(0, "battlefield", "Goldspan Dragon"), at(1, "battlefield", "Wastes"), at(1, "hand", "Bolt")]);
  toMain(s, 1);
  applyAction(s, 1, legalActions(s, 1).find((a) => a.kind === "activate-mana"));
  applyAction(s, 1, legalActions(s, 1).find((a) => a.kind === "cast" && a.label === "Bolt"));
  settle(s);
  eq(named(s, "Treasure", 0).length, 1, "her spell at it: a Treasure, his");
}

console.log(`engine-grants: ${checks} checks passed`);
