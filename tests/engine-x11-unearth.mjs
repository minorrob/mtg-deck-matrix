/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* UNEARTH (CR 702.84), AND ENERGY AS A COST (CR 107.14; Salvation Colossus, Train B X11).
 *
 * Unearth is an activated ability of the card in its owner's graveyard, at sorcery speed (cards/index.mjs): the card
 * returned to the battlefield with haste, exiled at the beginning of the next end step, and exiled instead if it would leave
 * the battlefield any other way -- a replacement every departure asks (rules/replacement.mjs): an effect, a sacrifice,
 * lethal damage. Its cost is mana, or energy: "Pay eight {E}" removes eight energy counters from the player (CR 107.14),
 * who must have them (CR 118.3; rules/actions.mjs). Gone from the graveyard before it resolves, the card is a new object and
 * nothing returns (CR 400.7).
 */
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {checkStateBasedActions} from "../game/engine/rules/sba.mjs";
import {keywordsOf} from "../game/engine/rules/layers.mjs";
import {play, drive, happen, at, idOf, compiled, missing, keywordBuilt, index, checks} from "./helpers/x11-keywords.mjs";

const {eq, ok, done} = checks("engine-x11-unearth");
const SC = "Salvation Colossus";
const unearths = (s, name = SC) => legalActions(s, 0).filter((a) => a.kind === "activate" && s.objects[a.objectId]?.card === name && s.objects[a.objectId].zone === "graveyard");
const where = (s, name = SC) => Object.values(s.objects).filter((o) => o.card === name).map((o) => o.zone);
const settled = (st) => st.stack.length === 0 && !(st.pendingTriggers ?? []).length && st.priorityPlayer !== null;
const FIX = {Ghoul: {...compiled([{kind: "keyword", text: "Unearth {B}", keyword: "unearth", cost: [{atom: "mana", cost: "{B}"}]}], {name: "Ghoul", power: 2, toughness: 2, colors: ["B"]}).definition, card: "Ghoul"}};
/* Rob, his Colossus in his graveyard, with this much energy; unearthed if `go`. */
function unearthed(energy = 8, go = true) {
  const s = play([at(0, "graveyard", SC)], [], {}, FIX);
  s.players[0].counters.energy = energy;
  if (go) { applyAction(s, 0, unearths(s)[0]); drive(s, settled); }
  return s;
}

eq(unearths(unearthed(7, false)).length, 0, "seven energy: unearth is not offered");
{
  const s = unearthed(8, false);
  eq(unearths(s).length, 1, "eight energy: offered");
  applyAction(s, 0, unearths(s)[0]);
  eq(s.players[0].counters.energy, 0, "paid: eight energy counters removed from Rob");
  drive(s, settled);
  const colossus = idOf(s, SC);
  ok(colossus !== undefined && keywordsOf(s, colossus).includes("Haste"), "returned to the battlefield, with haste");
  drive(s, (st) => st.phase === "END_OF_TURN" && settled(st));
  eq(where(s), ["exile"], "exiled at the beginning of the next end step");
}
{
  const s = unearthed();
  happen(s, {effect: "destroy", targets: [idOf(s, SC)]}, {controller: 1, source: null});
  eq(where(s), ["exile"], "destroyed: exiled instead");
  const t = unearthed();
  happen(t, {effect: "moveZone", targets: [idOf(t, SC)], to: "hand"}, {controller: 1, source: null});
  eq(where(t), ["exile"], "returned to its owner's hand: exiled instead");
  const u = unearthed();
  u.objects[idOf(u, SC)].damage = 9;
  checkStateBasedActions(u);
  eq(where(u), ["exile"], "lethal damage, a state-based action: exiled instead");
}
{
  /* Sorcery speed: not with something on the stack, nor on Maya's turn. */
  const s = play([at(0, "graveyard", SC), at(0, "hand", "Ghoul"), at(0, "battlefield", "Swamp")], [{tap: "Swamp"}], {}, FIX);
  s.players[0].counters.energy = 8;
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "cast" && s.objects[a.objectId].card === "Ghoul"));
  eq([s.stack.length, unearths(s).length], [1, 0], "a spell on the stack: no unearth");
  const t = play([at(0, "graveyard", SC)], [{to: {turn: 2, phase: "MAIN1"}}]);
  t.players[0].counters.energy = 8;
  eq(legalActions(t, 0).filter((a) => a.kind === "activate").length, 0, "Maya's turn: no unearth for Rob");
}
{
  /* The card exiled from the graveyard in response: a new object, and nothing returns. */
  const s = unearthed(8, false);
  applyAction(s, 0, unearths(s)[0]);
  const card = s.zones.graveyard[0].find((id) => s.objects[id].card === SC);
  happen(s, {effect: "moveZone", targets: [card], to: "exile"}, {controller: 1, source: null});
  drive(s, settled);
  eq(where(s), ["exile"], "exiled from the graveyard before it resolves: it stays in exile");
}
{
  /* A mana unearth cost: paid as mana. */
  const s = play([at(0, "graveyard", "Ghoul"), at(0, "battlefield", "Swamp")], [{tap: "Swamp"}], {}, FIX);
  applyAction(s, 0, unearths(s, "Ghoul")[0]);
  drive(s, settled);
  ok(idOf(s, "Ghoul") !== undefined && s.players[0].manaPool.B === 0, "Unearth {B}: the Swamp's mana paid, the Ghoul returned");
}
ok(compiled([{kind: "keyword", text: "Unearth {1}", keyword: "unearth", cost: [{atom: "mana", cost: "{1}"}]}, {kind: "spell", text: "x", effects: [{effect: "draw", count: 1}]}],
  {types: ["Sorcery"], power: null, toughness: null}).problems.some((p) => p.includes("unearth returns a permanent card")), "unearth on a sorcery is refused");
const costRefused = (cost) => compiled([{kind: "keyword", text: "Unearth", keyword: "unearth", cost}]).problems.some((p) => p.includes("an unearth cost of mana or energy"));
eq([[{atom: "payLife", amount: 2}], [], [{atom: "mana", cost: "{X}{B}"}], [{atom: "mana", cost: ""}], [{atom: "payEnergy", count: 0}]].map(costRefused), [true, true, true, true, true],
  "refused: a life cost, no cost, {X}, an empty mana cost, no energy");
eq([[{atom: "mana", cost: "{B}"}], [{atom: "payEnergy", count: 8}]].map(costRefused), [false, false], "and not mana or eight {E}");
eq(index.definition(SC).keywords, ["Flying", "Vigilance", "Trample", "Unearth"], "the Colossus's keywords");
ok(keywordBuilt("Unearth"), "Unearth is built (keywords/timing.mjs, the zones family)");
eq(missing(SC), [], `${SC} needs nothing the engine lacks`);
ok(index.resolve(SC)?.playable === true, `${SC} is defined and playable`);

done("unearth from the graveyard at sorcery speed for mana or energy, the energy removed; haste, exiled at the end step or instead of leaving any other way; nothing if the card has moved.");
