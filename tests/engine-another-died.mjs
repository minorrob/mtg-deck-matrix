/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "DESTROY TARGET CREATURE. IF ANOTHER CREATURE DIED THIS TURN, DRAW A CARD" (Chain Assassination; Train C phase 2, its
 * freerunning p5's, the deaths this turn p2's).
 *
 * "Another" is another than the one it destroys: the deaths this turn, every player's (script/amount.mjs,
 * creaturesDiedThisTurn), counted against what the destroy put into a graveyard -- `remember` on `destroy` keeps each as it
 * last existed on the battlefield (effects/zones.mjs, `movedWas`, CR 608.2h), and a counted comparison may count them
 * ({movedCount}; script/condition.mjs passes them on). One the destroy did not kill -- indestructible, or exiled instead by
 * a replacement (Liesa, Forgotten Archangel) -- did not die, and is not counted out (CR 700.4).
 */
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {conditionHolds} from "../game/engine/script/condition.mjs";
import {play, at, later, idOf, index, checks} from "./helpers/x11-keywords.mjs";

const {eq, ok, done} = checks("engine-another-died");
const CA = "Chain Assassination";
const FIX = {
  "Iron Wall": {types: ["Creature"], subtypes: ["Wall"], manaCost: "{2}", colors: [], power: 0, toughness: 4, keywords: ["Indestructible"]},
  Shock: {types: ["Instant"], manaCost: "{R}", colors: ["R"], spell: {id: "s", text: "Shock deals 2 damage to any target.",
    targets: [{anyOf: [{what: "permanent", types: ["Creature"]}, {what: "player"}]}], effects: [{effect: "dealDamage", amount: 2, targets: {target: 0}, who: {target: 0}}]}},
};
const destroying = (s, id, remember = true) => {
  const context = {controller: 0, source: null};
  runEffect(s, {effect: "destroy", targets: [id], ...(remember ? {remember: true} : {})}, context);
  return context;
};

{
  /* What a destroy remembers: what it put into a graveyard, as it last was. */
  const s = play([at(1, "battlefield", "Bear", "Iron Wall")], [], {}, FIX);
  const bear = idOf(s, "Bear");
  const context = destroying(s, bear);
  eq([context.remembered.map((id) => [s.objects[id].card, s.objects[id].zone]), context.movedWas.map((w) => [w.types, w.controller])],
    [[["Bear", "graveyard"]], [[["Creature"], 1]]], "the Bear: in Maya's graveyard, remembered as the creature of hers it was");
  const wall = destroying(s, idOf(s, "Iron Wall"));
  eq([wall.remembered, wall.movedWas], [[], []], "indestructible, it was not destroyed: nothing remembered");
  const t = play([at(1, "battlefield", "Bear")], [], {}, FIX);
  const plain = destroying(t, idOf(t, "Bear"), false);
  eq([plain.remembered, plain.movedWas, t.zones.graveyard[1].length], [undefined, undefined, 1], "without `remember`, destroyed and nothing kept");
  const u = play([at(0, "battlefield", "Liesa, Forgotten Archangel"), at(1, "battlefield", "Bear")], [], {}, FIX);
  const exiled = destroying(u, idOf(u, "Bear"));
  eq([exiled.remembered, exiled.movedWas, u.zones.exile.map((id) => u.objects[id].card)], [[], [], ["Bear"]], "exiled instead by Liesa: it did not die, nothing remembered");
}
{
  /* The comparison counts what the destroy remembered. */
  const s = play([at(1, "battlefield", "Bear", "Big Bear")], [], {}, FIX);
  const {movedWas} = destroying(s, idOf(s, "Bear"));
  const another = index.definition(CA).spell.effects[1].condition;
  eq([conditionHolds(s, another, {controller: 0, movedWas}), conditionHolds(s, another, {controller: 0, movedWas: []})], [false, true],
    "one death this turn, the Bear's: not another when the Bear is what was destroyed, another when nothing was");
  destroying(s, idOf(s, "Big Bear"), false);
  ok(conditionHolds(s, another, {controller: 0, movedWas}), "two deaths, one of them the one destroyed: another died");
}
{
  /* Played: Liesa exiles the target instead; Rob's own Bear died to his Shock, so he draws. */
  const s = play([at(0, "hand", "Shock", CA), later(0, "battlefield", "Liesa, Forgotten Archangel"), at(0, "battlefield", "Bear", "Mountain", "Swamp", "Swamp", "Wastes", "Wastes"),
    at(1, "battlefield", "Big Bear")], [{tap: "Mountain"}, {cast: "Shock", targets: [{card: "Bear", seat: 0}]}, {resolve: true},
    {tap: "Swamp"}, {tap: "Swamp"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: CA, alternative: false, targets: [{card: "Big Bear"}]}, {resolve: true}], {}, FIX);
  eq([s.zones.exile.map((id) => s.objects[id].card), s.zones.hand[0].length, s.players.map((p) => p.diedThisTurn ?? 0)], [["Big Bear"], 1, [1, 0]],
    "the Big Bear exiled, not dead; Rob's Bear the one death this turn: another, and a card drawn");
}

done("another creature died this turn: the deaths this turn less what the destroy killed -- not the indestructible, nor one exiled instead.");
