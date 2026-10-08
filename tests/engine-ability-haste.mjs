/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* CR 702.10c and 302.6: permission for abilities leaves the attack timing rule intact. */
import assert from "node:assert/strict";
import {table, on, card, bear} from "./helpers/b4-table.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {canAttack} from "../game/engine/rules/combat.mjs";
import {canPayGeneric, payGeneric} from "../game/engine/rules/mana.mjs";
import {sickForAbilities} from "../game/engine/keywords/timing.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const tapper = {...bear, abilities: [{id: "a0", kind: "activated", cost: [{atom: "{T}"}], effects: [{effect: "gainLife", amount: 2}]}]};
const elf = {...bear, abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {G: 1}}]};
{
  const s = table(); const t = on(s, tapper), e = on(s, elf), enemy = on(s, elf, 1);
  eq(legalActions(s, 0).filter((a) => [t, e].includes(a.objectId)).length, 0, "new creatures cannot tap for either type of ability");
  on(s, card("Thousand-Year Elixir"));
  eq([sickForAbilities(s, t), sickForAbilities(s, enemy), canAttack(s, t, 0)], [false, true, false], "permission applies only to our creatures' abilities, never their attacks");
  const mana = legalActions(s, 0).find((a) => a.kind === "activate-mana" && a.objectId === e);
  assert.ok(mana); checks += 1; applyAction(s, 0, mana);
  eq([s.objects[e].tapped, s.players[0].manaPool.G], [true, 1], "the newly entered mana creature actually taps and produces mana");
  const ability = legalActions(s, 0).find((a) => a.kind === "activate" && a.objectId === t);
  assert.ok(ability); checks += 1; applyAction(s, 0, ability);
  eq([s.objects[t].tapped, s.stack.length], [true, 1], "the ordinary tap ability pays its cost and goes on the stack");
  eq(legalActions(s, 0).some((a) => a.objectId === t), false, "permission does not allow tapping an already tapped creature");
}
{
  const s = table(); const e = on(s, elf, 1);
  eq(canPayGeneric(s, 1, 1), false, "a sick creature cannot pay an unless cost");
  on(s, card("Thousand-Year Elixir"), 1);
  eq(canPayGeneric(s, 1, 1), true, "Elixir also permits a newly entered creature to pay while its player has no priority");
  payGeneric(s, 1, 1);
  eq(s.objects[e].tapped, true, "paying the generic cost taps that creature");
}
eq(missingFor({statics: ["ActivateAbilityAsIfHaste"]}), [], "the catalog credits haste permission for abilities");
console.log(`engine-ability-haste: ${checks} checks passed`);
