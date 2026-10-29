/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* Native battle rules, using generic fixtures without adding final card definitions (CR 310). */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {compileScript} from "../game/engine/cards/index.mjs";
import {identityOf} from "../game/engine/cards/compile.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {resolveTop} from "../game/engine/rules/stack.mjs";
import {afterResolving} from "../game/engine/rules/priority.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {createState, addObject, moveObject, transformObject, COPY_KEYS} from "../game/engine/state/index.mjs";
import {characteristicsOf, lastKnown} from "../game/engine/rules/layers.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {beginRuleOperation} from "../game/engine/rules/operations.mjs";
import {copyOnto} from "../game/engine/script/effects/permanents.mjs";
import {concede} from "../game/engine/rules/sba.mjs";

let checks = 0;
const eq = (actual, expected, why) => {assert.deepEqual(actual, expected, why); checks++;};
const script = {schema: "CrankCardScript@1", layout: "transform", source: "hand",
  identity: {name: "Smoke Siege // Smoke Prize", oracleId: "smoke-battle", types: ["Battle"], subtypes: ["Siege"], manaCost: "{2}", colors: [], colorIdentity: [], defense: 4},
  oracleText: "When this battle enters, you gain 1 life.", abilities: [{kind: "triggered", text: "When this battle enters, you gain 1 life.",
    trigger: {on: "enters", who: "self"}, effects: [{effect: "gainLife", amount: 1}]}],
  back: {identity: {name: "Smoke Prize", types: ["Creature"], subtypes: [], manaCost: "", colors: [], power: 3, toughness: 3},
    oracleText: "When this creature enters, you gain 3 life.", abilities: [{kind: "triggered", text: "When this creature enters, you gain 3 life.",
      trigger: {on: "enters", who: "self"}, effects: [{effect: "gainLife", amount: 3}]}]}};
const compiled = compileScript(script);
eq(compiled.problems, [], "the generic transforming Siege fixture compiles");
const cards = loadCardIndex();
const resolver = (name) => name === script.identity.name ? compiled.definition : cards.definition(name);
function castBattle() {
  const {state} = runScenario({name: "An actual battle spell waits for its protector before entry", seats: 3,
    setup: [{seat: 0, zone: "battlefield", cards: ["Wastes", "Wastes"]}, {seat: 0, zone: "hand", cards: [script.identity.name]}],
    steps: [{tap: "Wastes"}, {tap: "Wastes"}, {cast: "Smoke Siege"}], expect: []}, resolver);
  return state;
}
function castVariant(value = script, extraSetup = [], fixtures = {}, seats = 3) {
  const compiledValue = compileScript(value);
  eq(compiledValue.problems, [], "the native entry fixture compiles in the shared grammar");
  const lookup = name => name === value.identity.name ? compiledValue.definition : cards.definition(name);
  return runScenario({name: `Native entry ${value.identity.name}`, seats,
    setup: [{seat: 0, zone: "battlefield", cards: ["Wastes", "Wastes"]}, {seat: 0, zone: "hand", cards: [value.identity.name]}, ...extraSetup],
    steps: [{tap: "Wastes"}, {tap: "Wastes"}, {cast: value.identity.name.split(" // ")[0]}], expect: []}, lookup, fixtures).state;
}
const variant = edit => {const value = structuredClone(script); edit(value); return value;};
const copyAbility = JSON.parse(readFileSync(new URL("../game/engine/cards/c/clever-impersonator.json", import.meta.url))).abilities[0];
const battleOn = s => s.zones.battlefield.find(id => s.objects[id].types.includes("Battle"));
const publicCard = (s, viewer, id) => projectFor(s, viewer).players.flatMap(p => p.zones.Battlefield?.cards ?? []).find(card => card.cardId === id);
eq([compiled.definition.defense, compiled.definition.mdfc.front.defense], [4, 4], "printed defense survives compilation and the transforming front face");
for (const defense of [-1, 1.5, "4", true])
  eq(compileScript(variant(value => {value.identity.defense = defense;})).problems.some(p => /defense/.test(p)), true, "invalid printed defense is refused");
eq(compileScript(variant(value => {value.identity.defense = 0;})).problems, [], "zero printed defense remains a valid characteristic");
eq(compileScript(variant(value => {delete value.identity.defense;})).problems.some(p => /printed defense/.test(p)), true, "a Battle definition cannot silently omit its printed defense");
const bothBattles = compileScript(variant(value => {value.back.identity = {...value.back.identity, types: ["Battle"], subtypes: ["Siege"], defense: 9};}));
eq(bothBattles.definition.mdfc.back.defense, 9, "a Battle back face keeps its own printed defense");
eq(COPY_KEYS.includes("defense") && !COPY_KEYS.includes("protector"), true, "printed defense is copiable but the protector designation is not");
{
  const face = {name: "Oracle Siege", type: "Battle — Siege", mana: "{2}", colors: [], power: null, toughness: null, defense: "4"};
  const other = {...face, name: "Oracle Prize", type: "Creature", defense: null};
  const card = {...face, name: "Oracle Siege // Oracle Prize", id: "oracle-fixture", layout: "transform", ci: [], defense: null, faces: [face, other]};
  eq(identityOf(card).defense, 4, "compiler identity reads printed defense from the actual Oracle front face rather than the DFC outer record");
  eq(identityOf({...face, id: "zero-defense", layout: "normal", defense: "0"}).defense, 0, "compiler identity preserves zero defense");
  eq(Object.hasOwn(identityOf({...other, id: "not-a-battle", layout: "normal"}), "defense"), false, "compiler identity does not invent defense for a face without it");
  const input = [face, {...face, name: "Zero Battle", defense: "0"}, other];
  const program = "import json, sys\nsys.path.insert(0, 'game/tools/batch')\nfrom cardlib import Batch\nfaces=json.load(sys.stdin)\nprint(json.dumps([Batch._identity(face, face['name']) for face in faces]))";
  const python = process.platform === "win32" ? "python" : "python3";
  const identities = JSON.parse(execFileSync(python, ["-B", "-c", program], {input: JSON.stringify(input), encoding: "utf8"}));
  eq(identities.map(value => value.defense ?? null), [4, 0, null], "the actual Python writer identity helper preserves positive/zero defense and omits an absent field without writing cards");
}
{
  let s = castBattle();
  const spell = s.stack.at(-1).objectId;
  resolveTop(s);
  eq(s.awaiting?.kind, "rule-operation", "resolving a Siege asks its controller to choose an opponent as protector before entry");
  eq(s.objects[spell].zone, "stack", "the unanswered battle remains a spell and has not entered");
  const q = awaitingChoice(s);
  eq([q.min, q.max, q.options.map((option) => option.playerId)], [1, 1, [1, 2]], "every eligible opponent is offered, with no default protector");
  s = JSON.parse(JSON.stringify(s));
  resolveAwaiting(s, [1]);
  const battle = s.zones.battlefield.find((id) => s.objects[id].card === "Smoke Siege");
  eq([s.objects[battle].protector, s.objects[battle].counters.defense], [2, 4], "the explicit saved answer enters with the chosen protector and printed defense counters");
  eq(s.stack.at(-1)?.cardId, battle, "the actual entering ability triggers from the arrived battle identity");
  afterResolving(s, resolveTop(s));
  eq(s.players[0].life, 41, "the actual battle entering ability resolves after its protector choice");
  for (const viewer of [0, 1, 2]) {
    const shown = publicCard(s, viewer, battle);
    eq([shown.printedDefense, shown.defense, shown.protector], [4, 4, 2], "controller, protector and other player see the same public Battle facts");
  }
  s.objects[battle].counters.defense = 2;
  eq([characteristicsOf(s, battle).printedDefense, characteristicsOf(s, battle).defense, lastKnown(s, battle).defense, lastKnown(s, battle).printedDefense], [4, 2, 2, 4], "current and last-known defense follow counters rather than the printed number");
  eq(publicCard(s, 2, battle).defense, 2, "the public current defense updates with the actual counters");
  const grave = moveObject(s, battle, "graveyard", 0);
  eq([grave !== battle, s.objects[grave].defense, s.objects[grave].protector], [true, 4, undefined], "leaving makes a new card identity with printed defense and no protector");
  const out = beginRuleOperation(s, {kind: "move-one", id: grave, to: "battlefield", options: {controller: 0}});
  eq([out.status, s.objects[grave].zone, awaitingChoice(s).options.map(o => o.playerId)], ["waiting", "graveyard", [1, 2]], "a native return also asks before leaving its original zone");
  s = JSON.parse(JSON.stringify(s)); resolveAwaiting(s, [0]);
  const returned = battleOn(s);
  eq([returned !== battle, returned !== grave, s.objects[returned].protector, s.objects[returned].counters.defense], [true, true, 1, 4], "the reloaded return chooses a new protector and fresh printed counters");
}
{
  let s = castBattle(); resolveTop(s);
  const before = JSON.stringify(s);
  eq(awaitingChoice(s).cancellation.allowed, false, "a resolving spell's committed mandatory protector choice cannot be abandoned");
  assert.throws(() => resolveAwaiting(s, [], null, null, {cancel: true}), /required choice/); checks++;
  eq(JSON.stringify(s), before, "refused Cancel preserves the committed cast and pending protector question exactly");
  for (const answer of [[], [0, 1], [2], [-1], [true]]) {
    assert.throws(() => resolveAwaiting(s, answer), /Invalid selection/); checks++;
    eq(JSON.stringify(s), before, "invalid protector answers change no state, resources or operation progress");
  }
  const first = awaitingChoice(s).id, spell = s.stack.at(-1).objectId;
  concede(s, 2);
  const departed = JSON.stringify(s);
  assert.throws(() => resolveAwaiting(s, [1]), /Invalid selection/); checks++;
  eq(JSON.stringify(s), departed, "the stale departed-opponent index is refused unchanged");
  eq([s.objects[spell].zone, awaitingChoice(s).options.map(o => o.playerId), awaitingChoice(s).id !== first], ["stack", [1], true], "a departed selected opponent causes a fresh explicit choice, with the spell still held");
  s = JSON.parse(JSON.stringify(s)); resolveAwaiting(s, [0]);
  eq(s.objects[battleOn(s)].protector, 1, "the new saved answer selects the surviving eligible opponent");
}
{
  const s = castBattle(); resolveTop(s); concede(s, 0);
  eq(s.zones.battlefield.some(id => s.objects[id].types.includes("Battle")), false, "the controller's actual departure cannot enter its abandoned spell");
  eq(s.stack.some(entry => entry.name === "Smoke Siege"), false, "departure removes the exact unfinished spell rather than reviving it later");
}
{
  const s = castVariant(variant(value => {value.identity.subtypes = [];}));
  resolveTop(s);
  const battle = battleOn(s);
  eq([s.awaiting, s.objects[battle].protector, s.objects[battle].counters.defense], [null, 0, 4], "a Battle with no battle type has its controller as protector without inventing an opponent choice");
}
{
  const s = castVariant(script, [], {}, 4);
  resolveTop(s);
  eq([s.awaiting.player, awaitingChoice(s).options.map(o => o.playerId)], [0, [1, 2, 3]], "all three live opponents, and never the controller, are explicit in a four-player Siege entry");
  resolveAwaiting(s, [2]);
  eq(s.objects[battleOn(s)].protector, 3, "the fourth seat can be chosen as the actual protector");
}
{
  const s = castVariant(script, [{seat: 0, zone: "battlefield", cards: ["Doubling Season"]}]);
  resolveTop(s); resolveAwaiting(s, [1]);
  eq(s.objects[battleOn(s)].counters.defense, 8, "the actual existing counter modifier doubles the Battle's printed entry counters");
}
{
  const s = castVariant(script, [{seat: 1, zone: "battlefield", cards: ["Doubling Season"]}]);
  resolveTop(s); resolveAwaiting(s, [1]);
  eq(s.objects[battleOn(s)].counters.defense, 4, "another player's counter modifier does not double the controller's Battle");
}
{
  let s = castBattle(); resolveTop(s); resolveAwaiting(s, [0]); afterResolving(s, resolveTop(s));
  const old = battleOn(s), grave = moveObject(s, old, "graveyard", 0);
  const result = beginRuleOperation(s, {kind: "move-one", id: grave, to: "battlefield", options: {controller: 2}});
  eq([result.status, s.awaiting.player, awaitingChoice(s).options.map(o => o.playerId)], ["waiting", 2, [0, 1]], "a native return controlled by another player asks that controller and its opponents");
  s = JSON.parse(JSON.stringify(s)); resolveAwaiting(s, [1]);
  const battle = battleOn(s);
  eq([s.objects[battle].owner, s.objects[battle].controller, s.objects[battle].protector, s.objects[battle].counters.defense], [0, 2, 1, 4], "owner, current entry controller and independently chosen protector stay distinct after reload");
}
{
  const mute = {types: ["Enchantment"], abilities: [{id: "mute", kind: "static", layer: 6, affects: {types: ["Battle"]}, apply: {removeAllAbilities: true}}]};
  const s = castVariant(script, [{seat: 1, zone: "battlefield", cards: ["Smoke Mute"]}], {"Smoke Mute": mute});
  resolveTop(s); eq(awaitingChoice(s).options.map(o => o.playerId), [1, 2], "losing intrinsic abilities does not remove the protector rule choice");
  const entered = resolveAwaiting(s, [0]);
  eq([entered.filter(e => e.kind === "GameEventCardCounters" && e.data.fields.type === "defense" && e.data.fields.newValue > 0).length, s.stack.length, s.players[0].life], [0, 0, 40],
    "the prospective ability-removal effect emits no defense counters or entering trigger; it does not assert survival of a zero-defense Battle");
}
{
  const typeLoss = {types: ["Enchantment"], abilities: [{id: "land", kind: "static", layer: 4, affects: {types: ["Battle"]}, apply: {setTypes: ["Land"]}}]};
  const s = castVariant(script, [{seat: 1, zone: "battlefield", cards: ["Smoke Type Loss"]}], {"Smoke Type Loss": typeLoss});
  resolveTop(s);
  const arrived = battleOn(s);
  eq([s.awaiting, characteristicsOf(s, arrived).types, s.objects[arrived].protector, s.objects[arrived].counters.defense], [null, ["Land"], undefined, undefined],
    "a prospective type-changing effect removes both the Battle entry rule and its intrinsic defense ability");
}
{
  const diamond = JSON.parse(readFileSync(new URL("../game/engine/cards/m/mox-diamond.json", import.meta.url))).abilities.find(a => a.kind === "replacement");
  const diverted = variant(value => {value.identity.types.push("Artifact"); value.abilities.unshift(diamond);});
  const s = castVariant(diverted);
  resolveTop(s);
  eq(awaitingChoice(s).id.startsWith("entering-discard:"), true, "the replacement's own discard decision is asked before any Battle protector");
  resolveAwaiting(s, [awaitingChoice(s).options.find(o => o.discard === null).index]);
  eq([s.awaiting, battleOn(s), s.zones.graveyard[0].map(id => s.objects[id].card), s.stack.length], [null, undefined, ["Smoke Siege"], 0],
    "an entry redirected to its graveyard neither asks for a protector nor emits an entering trigger");
}
{
  const mirror = {schema: "CrankCardScript@1", source: "hand", identity: {name: "Smoke Mirror", oracleId: "smoke-mirror", types: ["Creature"], manaCost: "{0}", power: 1, toughness: 1},
    oracleText: copyAbility.text, abilities: [copyAbility]};
  let s = castVariant(mirror);
  const target = addObject(s, {card: "Smoke Other Siege", types: ["Battle"], subtypes: ["Siege"], defense: 7, owner: 1, controller: 1}, "battlefield");
  s.objects[target].protector = 2; s.objects[target].counters.defense = 1;
  const spell = s.stack.at(-1).objectId;
  resolveTop(s);
  eq(awaitingChoice(s).id.startsWith("entering-copy:"), true, "entry-copy replacement is decided before any prospective Battle protector");
  const pick = awaitingChoice(s).options.find(o => o.copyOf === target).index;
  resolveAwaiting(s, [pick]);
  eq([s.objects[spell].zone, awaitingChoice(s).options.map(o => o.playerId)], ["stack", [1, 2]], "copying the Siege creates its own explicit protector question without moving the real spell");
  s = JSON.parse(JSON.stringify(s)); resolveAwaiting(s, [0]);
  const copied = s.zones.battlefield.find(id => id !== target && s.objects[id].types.includes("Battle"));
  eq([s.objects[copied].defense, s.objects[copied].counters.defense, s.objects[copied].protector], [7, 7, 1], "entry-copy uses copied printed defense, fresh counters and a separately chosen protector");
  eq([s.objects[target].counters.defense, s.objects[target].protector], [1, 2], "the source Battle's counters and designation are unchanged");
  const uncopy = moveObject(s, copied, "graveyard", 0);
  eq([uncopy !== copied, s.objects[uncopy].card, s.objects[uncopy].defense, s.objects[uncopy].protector], [true, "Smoke Mirror", undefined, undefined], "a copied Battle leaves as its original single-faced physical card with no copied defense or protector");
}
{
  const copiedOut = variant(value => {value.abilities.unshift(structuredClone(copyAbility));});
  const s = castVariant(copiedOut);
  const bear = addObject(s, {card: "Smoke Ground Bear", types: ["Creature"], power: 2, toughness: 2, owner: 1, controller: 1}, "battlefield");
  const before = s.zones.battlefield.length;
  resolveTop(s); resolveAwaiting(s, [awaitingChoice(s).options.find(o => o.copyOf === bear).index]);
  const arrived = s.zones.battlefield.find(id => id !== bear && s.objects[id].card === "Smoke Ground Bear");
  eq([s.awaiting, s.zones.battlefield.length, s.objects[arrived].types, s.objects[arrived].defense, s.objects[arrived].protector, s.objects[arrived].counters.defense],
    [null, before + 1, ["Creature"], undefined, undefined, undefined], "a Battle entering as a creature copy has no Battle protector or intrinsic defense counters");
}
{
  const s = createState({players: [{name: "A"}, {name: "B"}, {name: "C"}]});
  const own = addObject(s, {...compiled.definition, card: "Smoke Siege", owner: 0, controller: 0}, "battlefield");
  s.objects[own].protector = 2; s.objects[own].counters.defense = 3;
  const other = addObject(s, {card: "Other Siege", types: ["Battle"], subtypes: ["Siege"], defense: 7, owner: 1, controller: 1}, "battlefield");
  s.objects[other].protector = 0; s.objects[other].counters.defense = 1;
  eq(copyOnto(s, own, other), true, "the existing copy operation accepts the Battle's copiable characteristics");
  eq([s.objects[own].defense, s.objects[own].protector, s.objects[own].counters.defense], [7, 2, 3], "becoming another Battle copies printed defense but neither its protector nor its counters");
  eq([publicCard(s, 1, own).printedDefense, publicCard(s, 1, own).defense, publicCard(s, 1, own).protector], [7, 3, 2], "the copied Battle's public view distinguishes printed and current defense");
  eq(lastKnown(s, own).copiable.defense, 7, "a copied Battle's departure snapshot retains its printed copiable number");
  (s.effects ??= []).push({id: "smoke-type-loss", layer: 4, affects: {ids: [own]}, apply: {setTypes: ["Land"]}, sourceController: 0, timestamp: s.nextTimestamp++});
  eq([characteristicsOf(s, own).defense, publicCard(s, 1, own).defense, publicCard(s, 1, own).protector, s.objects[own].protector], [undefined, undefined, undefined, 2], "losing the Battle type removes the characteristic but preserves its protector designation");
  const hand = addObject(s, {...compiled.definition, owner: 0, controller: 0}, "hand", 0);
  for (const viewer of [0, 1, 2]) {
    const hidden = projectFor(s, viewer).players[0].zones.Hand.cards?.find(card => card.cardId === hand);
    eq(hidden ? [hidden.printedDefense, hidden.defense, hidden.protector] : [], viewer === 0 ? [undefined, undefined, undefined] : [], "no battlefield-only Battle fields reveal a private card");
  }
  const down = moveObject(s, hand, "battlefield", null, {faceDown: true});
  for (const viewer of [0, 1, 2]) {
    const hidden = publicCard(s, viewer, down);
    eq([hidden.printedDefense, hidden.defense, hidden.protector], [undefined, undefined, undefined], "face-down public characteristics do not expose a hidden Battle face");
  }
  (s.effects ??= []).push({id: "smoke-facedown-battle", layer: 4, affects: {ids: [down]}, apply: {addTypes: ["Battle"]}, sourceController: 0, timestamp: s.nextTimestamp++});
  for (const viewer of [0, 1, 2]) {
    const hidden = publicCard(s, viewer, down);
    eq([hidden.printedDefense, hidden.defense, hidden.protector], [undefined, undefined, undefined], "a public type effect does not expose a face-down card's hidden Battle identity fields");
  }
  const hiddenGrave = moveObject(s, down, "graveyard", 0);
  eq(s.objects[hiddenGrave].defense, 4, "the actual hidden card retains its printed defense when it leaves face down");
  const face = addObject(s, {...bothBattles.definition, owner: 0, controller: 0}, "battlefield");
  eq(transformObject(s, face), true, "a native transformation uses the compiled back face");
  eq(s.objects[face].defense, 9, "the transformed object takes the back face's printed defense");
}
{
  const plain = variant(value => {delete value.back; delete value.layout; value.identity.name = "Smoke Plain Battle"; value.identity.subtypes = []; value.identity.defense = 5;});
  const definition = compileScript(plain).definition;
  const s = castVariant(plain); resolveTop(s);
  const battle = battleOn(s);
  eq([s.objects[battle].defense, s.objects[battle].counters.defense, s.objects[battle].protector], [5, 5, 0], "a single-faced Battle preserves defense through actual casting and entry without DFC face restoration");
  const left = moveObject(s, battle, "graveyard", 0);
  eq([s.objects[left].defense, s.objects[left].protector], [5, undefined], "a single-faced Battle retains its printed characteristic across a real zone change");
  const hand = addObject(s, {...definition, owner: 0, controller: 0}, "hand", 0);
  const down = moveObject(s, hand, "battlefield", null, {faceDown: true});
  const concealed = s.objects[down].defense;
  const revealed = moveObject(s, down, "graveyard", 0);
  eq([concealed, s.objects[revealed].defense], [undefined, 5], "single-faced hidden identity retains defense without a DFC's separate face data");
}
console.log(`engine-battles: ${checks} checks passed`);
