/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* CR 118.12a, 400.3: choose which other creature to return, or decline, and return it to its owner. */
import assert from "node:assert/strict";
import {table, on, bear} from "./helpers/b4-table.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const effect = {effect: "unlessPays", who: "you", returnToHand: {types: ["Creature"], another: true}, effects: [{effect: "gainLife", amount: 5}]};
for (const pay of [true, false]) {
  const s = table(); const source = on(s, {...bear, card: "Source"}); const first = on(s, {...bear, card: "First"}); const stolen = on(s, {...bear, card: "Stolen"}, 1); s.objects[stolen].controller = 0;
  on(s, bear, 2); on(s, {card: "Rock", types: ["Artifact"]});
  beginResolution(s, [effect], {controller: 0, source});
  const choice = awaitingChoice(s);
  eq(choice.options.map((o) => o.cardId ?? null), [first, stolen, null], "each other controlled creature is offered separately, followed by declining");
  resolveAwaiting(s, [pay ? 1 : 2]);
  eq([s.players[0].life, s.objects[source].zone, s.objects[first].zone, Object.values(s.objects).find((o) => o.card === "Stolen").zone], [pay ? 40 : 45, "battlefield", "battlefield", pay ? "hand" : "battlefield"], "only the chosen creature returns; paying skips the unless effects, declining runs them");
  if (pay) eq(s.zones.hand[1].some((id) => s.objects[id].card === "Stolen"), true, "a borrowed creature returns to its owner's hand");
}
{
  const s = table(); const source = on(s, bear);
  beginResolution(s, [effect], {controller: 0, source});
  eq(awaitingChoice(s).options.map((o) => o.label), ["Don't pay"], "with no other creature the only option is declining");
  resolveAwaiting(s, [0]); eq(s.players[0].life, 45, "declining with no payable creature still executes the effect");
}
{
  const s = table(); const source = on(s, bear); on(s, bear);
  beginResolution(s, [{...effect, ifPaid: true}], {controller: 0, source});
  resolveAwaiting(s, [0]);
  eq(s.players[0].life, 45, "the if-paid branch runs the effect after returning the chosen creature");
}
{
  const script = (extra) => ({schema: "CrankCardScript@1", source: "hand", identity: {name: "Test", oracleId: "00000000-0000-4000-8000-000000000000", types: ["Sorcery"], manaCost: "{U}"}, oracleText: "Test.", abilities: [{kind: "spell", text: "Test.", effects: [{...effect, ...extra}]}]});
  eq(validateScript(script({})).valid, true, "the schema admits the return cost");
  eq(validateScript(script({sacrifice: {types: ["Creature"]}})).valid, false, "the schema refuses combining return and sacrifice costs");
}
console.log(`engine-unless-return: ${checks} checks passed`);
