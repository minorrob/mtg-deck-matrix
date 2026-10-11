/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN C, PHASE 2 (p3-costs): BEHOLD (CR 701.4a) AS A COST.
 *
 * "Behold an Elf" is "reveal an Elf card from your hand or choose an Elf you control"; "behold three Elementals" three
 * different objects, of either. An additional cost ("behold an Elf or pay {2}", Lys Alana Dignitary) or a flashback cost's
 * ("Flashback--{1}{R}, Behold three Elementals", Kindle the Inner Flame): one offer while there are that many, which ones
 * asked once the cast is taken, a card from the hand revealed to every player as the cost is paid (CR 701.20a). What the
 * scenarios cannot reach: what may be beheld, the picks the cast refuses, an offer stripped of its behold, the reveal in
 * another seat's view, the house pilot's answer, and what the compiler refuses.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const ok = (v, m) => { assert.ok(v, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const land = (name, produces) => ({card: name, types: ["Land"], abilities: [{id: "m", kind: "mana", tapSelf: true, produces}]});
const WASTES = land("Wastes", {C: 1});
const creature = (name, subtypes, more = {}) => ({card: name, types: ["Creature"], subtypes, manaCost: "{1}", colors: ["G"], power: 1, toughness: 1, ...more});

function table() {
  const s = createState({matchId: "m", seed: "behold", players: [{name: "Rob"}, {name: "Maya"}]});
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  beginGame(s);
  for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s);
  return s;
}
const put = (s, o, seat, zone) => addObject(s, {...o, owner: seat, controller: seat}, zone, zone === "battlefield" ? null : seat);
const casts = (s, name) => legalActions(s, 0).filter((a) => a.kind === "cast" && a.label === name);
const beholdOffer = (s, name) => casts(s, name).find((a) => a.behold);

{
  /* What may be beheld: an Elf Rob controls, an Elf card in his hand, a changeling (CR 702.73a) -- never the spell itself,
     Maya's Elf, or an Elf card in his graveyard. */
  const s = table();
  const lys = put(s, card("Lys Alana Dignitary"), 0, "hand");
  put(s, creature("Her Elf", ["Elf"]), 1, "battlefield"); put(s, creature("Dead Elf", ["Elf"]), 0, "graveyard");
  put(s, creature("Goblin Card", ["Goblin"]), 0, "hand"); put(s, creature("Goblin", ["Goblin"]), 0, "battlefield");
  Object.assign(s.players[0].manaPool, {G: 1, C: 1});
  eq(beholdOffer(s, "Lys Alana Dignitary"), undefined, "only itself, Maya's Elf, a dead one and Goblins: no Elf to behold, so no {1}{G} cast");
  const mine = put(s, creature("My Elf", ["Elf"]), 0, "battlefield"), held = put(s, creature("Held Elf", ["Elf"]), 0, "hand");
  const shifter = put(s, creature("Shifter", ["Shapeshifter"], {keywords: ["Changeling"]}), 0, "battlefield");
  const offer = beholdOffer(s, "Lys Alana Dignitary");
  ok(offer && offer.behold === 1 && !offer.extraMana, "now: the {1}{G} cast that beholds one");
  applyAction(s, 0, offer);
  const choice = awaitingChoice(s);
  eq([choice.min, choice.max, choice.cost, choice.title], [1, 1, "behold", "Lys Alana Dignitary: behold one Elf"], "one to behold, asked once it is taken");
  eq(choice.options.map((o) => [o.cardId, o.fromHand === true]).sort(), [[mine, false], [held, true], [shifter, false]].sort(), "his Elf, the changeling, and the Elf card in his hand");
  ok(!choice.options.some((o) => o.cardId === lys), "never the spell itself");
  /* The house pilot chooses a permanent, which shows nothing, before a card from the hand. */
  const answer = housePilot({seat: 0, cards: (n) => cards.definition(n)}).answer(projectFor(s, 0), choice);
  ok(!choice.options[answer.indices[0]].fromHand, "the house pilot beholds a permanent rather than reveal a card");
  /* Revealed from the hand: an event every seat's view reads, the card staying where it was. */
  const events = resolveAwaiting(s, [choice.options.find((o) => o.cardId === held).index]);
  ok(events.some((e) => e.kind === "GameEventCardRevealed" && e.data.fields.card.cardId === held), "the Elf card revealed");
  eq(s.objects[held].zone, "hand", "and still in the hand");
  eq(s.stack.at(-1).cast.additionalPaid, true, "its additional cost paid (CR 601.2b)");
}
{
  /* Chosen, not revealed: a permanent beheld makes no reveal. */
  const s = table();
  put(s, card("Lys Alana Dignitary"), 0, "hand");
  const mine = put(s, creature("My Elf", ["Elf"]), 0, "battlefield");
  Object.assign(s.players[0].manaPool, {G: 1, C: 1});
  applyAction(s, 0, beholdOffer(s, "Lys Alana Dignitary"));
  const events = resolveAwaiting(s, [awaitingChoice(s).options.find((o) => o.cardId === mine).index]);
  eq(events.filter((e) => e.kind === "GameEventCardRevealed").length, 0, "nothing revealed");
  eq(s.stack.length, 1, "and cast");
}
{
  /* Picks the cast refuses before anything is paid: too few, twice the same, one it may not behold -- and an offer stripped of
     its behold is not an offer (it would cast it beholding nothing). */
  const s = table();
  put(s, card("Kindle the Inner Flame"), 0, "graveyard");
  const target = put(s, creature("Spark", ["Elemental"]), 0, "battlefield");
  const a = put(s, creature("Ember", ["Elemental"]), 0, "hand"), b = put(s, creature("Cinder", ["Elemental"]), 0, "hand");
  const goblin = put(s, creature("Goblin", ["Goblin"]), 0, "battlefield");
  Object.assign(s.players[0].manaPool, {R: 1, C: 1});
  const offer = casts(s, "Kindle the Inner Flame").find((o) => o.flashback && o.targets[0].id === target);
  ok(offer && offer.behold === 3, "flashback, beholding three");
  for (const [beheld, why] of [[[target, a], "two of three"], [[target, a, a], "one twice"], [[target, a, goblin], "a Goblin"]])
    assert.throws(() => applyAction(s, 0, {...offer, beheld}), /may behold: pick them again/, why);
  checks += 3;
  const {behold: _dropped, ...stripped} = offer;
  assert.throws(() => applyAction(s, 0, stripped), /not a legal action/, "without its behold, nothing it was offered");
  checks += 1;
  eq([s.stack.length, s.players[0].manaPool.R], [0, 1], "nothing cast, nothing paid");
  const events = applyAction(s, 0, {...offer, beheld: [target, a, b]});
  eq(events.filter((e) => e.kind === "GameEventCardRevealed").map((e) => e.data.fields.card.cardId).sort(), [a, b].sort(), "the two cards from the hand revealed, the Spark only chosen");
  eq(s.stack.at(-1).cast.additionalPaid, undefined, "a flashback cost is no additional cost");
  /* Revealed to every player (CR 701.20a): the history's event names each card. */
  eq(events.filter((e) => e.kind === "GameEventCardRevealed").map((e) => e.data.fields.card.name).sort(), ["Cinder", "Ember"], "named in the history");
}
{
  /* What the compiler refuses: a behold with no selector, of no cards, optional, or two to a card -- and a permanent card's
     spell ability with anything but an additional cost. */
  const id = (types) => ({name: "Odd", oracleId: "x", types, subtypes: [], manaCost: "{1}{G}", colors: ["G"], colorIdentity: ["G"]});
  const script = (types, abilities) => ({schema: "CrankCardScript@1", identity: id(types), oracleText: abilities.map((a) => a.text).join("\n"), abilities});
  const extra = (additionalCost, more = {}) => ({kind: "spell", text: "As an additional cost to cast this spell, behold an Elf.", targets: [], effects: [], additionalCost, ...more});
  const problems = (s) => (validateScript(s).valid ? compileScript(s).problems : ["invalid"]);
  const elf = {atom: "behold", selector: {subtypes: ["Elf"]}};
  eq(problems(script(["Creature"], [extra([elf])])), [], "a creature's \"behold an Elf\": built");
  eq(problems(script(["Creature"], [extra([{atom: "oneOf", options: [[elf], [{atom: "mana", cost: "{2}"}]]}])])), [], "\"behold an Elf or pay {2}\": built");
  for (const [atom, why] of [[{atom: "behold"}, "no selector"], [{...elf, count: 0}, "no cards"], [{...elf, optional: true}, "optional"], [{...elf, selector: {flavor: 1}}, "a selector the grammar has not"]])
    ok(problems(script(["Creature"], [extra([atom])])).some((p) => /behold:/.test(p)), `refused: ${why}`);
  ok(problems(script(["Creature"], [extra([{atom: "oneOf", options: [[{atom: "behold"}], [{atom: "mana", cost: "{2}"}]]}])])).some((p) => /behold:/.test(p)), "refused in a choice too");
  ok(problems(script(["Creature"], [extra([elf, {...elf, selector: {subtypes: ["Goblin"]}}])])).some((p) => /one behold to a card/.test(p)), "two beholds: refused");
  const sorcery = {kind: "spell", text: "Draw a card.", targets: [], effects: [{effect: "draw", count: 1}]};
  const fb = (cost) => ({kind: "keyword", text: "Flashback", keyword: "flashback", cost});
  eq(problems(script(["Sorcery"], [sorcery, fb([{atom: "mana", cost: "{R}"}, {...elf, count: 3}])])), [], "a flashback that beholds three: built");
  ok(problems(script(["Sorcery"], [sorcery, fb([{atom: "mana", cost: "{R}"}, {atom: "behold", count: 3}])])).some((p) => /flashback cost/.test(p)), "a flashback behold of nothing: refused");
  ok(problems(script(["Sorcery"], [sorcery, fb([{atom: "mana", cost: "{R}"}, {...elf, optional: true}])])).some((p) => /flashback cost/.test(p)), "a flashback behold that may be skipped: refused");
  ok(problems(script(["Sorcery"], [{...sorcery, additionalCost: [elf]}, fb([{atom: "mana", cost: "{R}"}, elf])])).some((p) => /one behold to a card/.test(p)), "one in each: refused");
  ok(problems(script(["Creature"], [extra([elf], {effects: [{effect: "draw", count: 1}]})])).some((p) => /says only its additional cost/.test(p)), "a creature's spell ability with an effect: refused");
  ok(problems(script(["Creature"], [extra([elf], {targets: [{what: "permanent"}]})])).some((p) => /says only its additional cost/.test(p)), "or with a target: refused");
  eq(problems(script(["Creature"], [extra([])])), ["invalid"], "and with no additional cost it is an unfinished spell ability");
  eq(problems(script(["Instant"], [extra([elf])])), ["invalid"], "an instant's spell ability has effects, whatever it costs");
}

console.log(`engine-behold: ${checks} checks passed`);
