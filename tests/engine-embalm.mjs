/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* EMBALM (CR 702.128; Anointer Priest, Train C phase 2).
 *
 * "[Cost], Exile this card from your graveyard: Create a token that's a copy of this card, except it's white, it has no mana
 * cost, and it's a Zombie in addition to its other types. Activate only as a sorcery" (702.128a): an activated ability of
 * the card in its owner's graveyard (cards/index.mjs; rules/actions.mjs offers it there, at sorcery speed), its cost
 * exiling it -- "this card" is then that card in exile (CR 400.7), what the ability is about -- and the copy made with those
 * exceptions, which are part of its copiable values (CR 707.9b; effects/permanents.mjs, copiable: `setColors`,
 * `addSubtypes`, `noManaCost`). With no mana cost its mana value is 0 (CR 202.3).
 */
import {legalActions} from "../game/engine/rules/actions.mjs";
import {characteristicsOf} from "../game/engine/rules/layers.mjs";
import {valueCostOf} from "../game/engine/state/index.mjs";
import {play, drive, happen, at, idOf, compiled, keywordBuilt, index, checks} from "./helpers/x11-keywords.mjs";

const {eq, ok, done} = checks("engine-embalm");
const AP = "Anointer Priest";
const PAY = [{tap: "Plains"}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}];
const LANDS = at(0, "battlefield", "Plains", "Wastes", "Wastes", "Wastes");
const embalms = (s, seat = 0) => legalActions(s, seat).filter((a) => a.kind === "activate" && s.objects[a.objectId].card === AP && s.objects[a.objectId].zone === "graveyard");
const settled = (st) => st.stack.length === 0 && !(st.pendingTriggers ?? []).length && st.priorityPlayer !== null && !st.awaiting;

{
  const s = play([at(0, "graveyard", AP), LANDS], [...PAY, {activate: AP}]);
  const exiled = s.zones.exile.find((id) => s.objects[id].card === AP);
  eq([s.zones.graveyard[0].length, exiled !== undefined, s.stack.at(-1).about?.card === exiled], [0, true, true],
    "activated: the card exiled as its cost, and the ability about that card in exile");
  drive(s, settled);
  const token = idOf(s, AP);
  const c = characteristicsOf(s, token);
  eq([s.objects[token].token, c.colors, [...c.subtypes].sort(), c.types, s.objects[token].manaCost, valueCostOf(s.objects[token]), c.power, c.toughness],
    [true, ["W"], ["Cleric", "Human", "Zombie"], ["Creature"], null, null, 1, 3], "the token: a white Zombie Human Cleric 1/3 with no mana cost");
  eq([s.objects[token].controller, s.players[0].life], [0, 41], "Rob's, and its own trigger saw it enter: Rob at 41");
  ok(s.objects[token].abilities.some((a) => a.kind === "triggered") && s.objects[token].abilities.some((a) => a.zone === "graveyard"), "the copy has the card's abilities, embalm among them");
}
{
  /* As a sorcery only: not with something on the stack, not in combat, not on another player's turn. */
  const s = play([at(0, "graveyard", AP), LANDS], PAY);
  eq(embalms(s).length, 1, "his main phase, the stack empty: offered");
  const t = play([at(0, "graveyard", AP), LANDS], [{to: {turn: 1, phase: "COMBAT_BEGIN"}}, ...PAY]);
  eq(embalms(t).length, 0, "in combat: not");
  const u = play([at(1, "graveyard", AP), at(1, "battlefield", "Plains", "Wastes", "Wastes", "Wastes")], [{to: {turn: 2, phase: "MAIN1"}}, ...PAY.map((p) => ({...p, seat: 1}))]);
  eq(embalms(u, 1).length, 1, "Maya's own main phase: hers is offered to her");
  const v = play([at(1, "graveyard", AP), LANDS], PAY);
  eq([embalms(v).length, embalms(v, 1).length], [0, 0], "Maya's card in her graveyard on Rob's turn: not his to use, and not hers now");
  const w = play([at(0, "battlefield", AP), LANDS], PAY);
  eq(legalActions(w, 0).filter((a) => a.kind === "activate").length, 0, "a Priest on the battlefield: nothing to activate");
}
{
  /* "It's white": a green card's token is white, and white alone (not "in addition to its colors"). */
  const mummy = compiled([{kind: "keyword", text: "Embalm {G}", keyword: "embalm", cost: [{atom: "mana", cost: "{G}"}]}],
    {name: "Green Mummy", types: ["Creature"], subtypes: ["Elf"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2});
  eq(mummy.problems, [], "a green creature with embalm compiles");
  const s = play([at(0, "graveyard", "Green Mummy"), at(0, "battlefield", "Forest")], [{tap: "Forest"}, {activate: "Green Mummy"}, {resolve: true}], {}, {"Green Mummy": {...mummy.definition, card: "Green Mummy"}});
  const c = characteristicsOf(s, idOf(s, "Green Mummy"));
  eq([c.colors, [...c.subtypes].sort()], [["W"], ["Elf", "Zombie"]], "its token: white, an Elf Zombie");
}
{
  /* The exceptions are copiable values, nothing else: the token copies the card as it is, and "no mana cost" alone takes the
     cost; a copy made without it keeps its cost. */
  const s = play([at(0, "battlefield", "Bear")]);
  happen(s, {effect: "copyPermanent", targets: [idOf(s, "Bear")], except: {noManaCost: true}}, {controller: 0, source: null});
  happen(s, {effect: "copyPermanent", targets: [idOf(s, "Bear")]}, {controller: 0, source: null});
  const tokens = s.zones.battlefield.filter((id) => s.objects[id].token).map((id) => s.objects[id].manaCost);
  eq(tokens, [null, "{2}"], "a copy with no mana cost, and one with the Bear's {2}");
}
ok(compiled([{kind: "keyword", text: "Embalm--Pay 3 life", keyword: "embalm", cost: [{atom: "payLife", amount: 3}]}]).problems.some((p) => p.includes("an embalm cost is mana")), "an embalm cost that is not mana is refused");
ok(compiled([{kind: "keyword", text: "Embalm {1}", keyword: "embalm", cost: [{atom: "mana", cost: "{1}"}]}], {types: ["Sorcery"], power: null, toughness: null}).problems.some((p) => p.includes("a permanent card")),
  "embalm on a sorcery is refused");
eq(index.definition(AP).keywords, ["Embalm"], `${AP}'s keyword`);
ok(keywordBuilt("Embalm"), "Embalm is built (engine-constructs, an ability keyword: copyPermanent)");
ok(index.resolve(AP)?.playable === true, `${AP} is defined and playable`);

done("embalm: from its owner's graveyard as a sorcery, the card exiled, a white Zombie token copy of it with no mana cost.");
