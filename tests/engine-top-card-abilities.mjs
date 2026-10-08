/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* CR 613.1f: Conspicuous Snoop gains the matching top card's activated and mana abilities only. */
import assert from "node:assert/strict";
import {table, on, ready, card, bear} from "./helpers/b4-table.mjs";
import {abilitiesOf} from "../game/engine/rules/layers.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {resolveTop} from "../game/engine/rules/stack.mjs";
let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const grant = {...bear, card: "Goblin donor", subtypes: ["Goblin"], abilities: [{id: "donor-life", kind: "activated", cost: [{atom: "{T}"}], effects: [{effect: "gainLife", amount: 3}]}, {id: "donor-mana", kind: "mana", tapSelf: true, produces: {R: 1}}, {id: "donor-trigger", kind: "triggered", trigger: "enters", effects: [{effect: "gainLife", amount: 9}]}]};
{
  const s = table(); const snoop = ready(s, on(s, card("Conspicuous Snoop"))); const donor = on(s, grant, 0, "library");
  s.zones.library[0] = [donor, ...s.zones.library[0].filter((id) => id !== donor)];
  eq(abilitiesOf(s, snoop).filter((a) => a.id?.includes("donor-")).map((a) => a.kind), ["activated", "mana"], "the Goblin top card grants both activated kinds, never its triggered ability");
  const action = legalActions(s, 0).find((a) => a.kind === "activate" && a.objectId === snoop);
  assert.ok(action); checks += 1; applyAction(s, 0, action); resolveTop(s);
  eq([s.objects[snoop].tapped, s.objects[donor].zone, s.players[0].life], [true, "library", 43], "the gained ability uses Snoop as its source and pays its tap cost");
  s.zones.library[0].shift();
  eq(abilitiesOf(s, snoop).some((a) => a.id?.includes("donor-")), false, "changing the top card removes the granted abilities immediately");
  s.zones.library[0] = [];
  eq(abilitiesOf(s, snoop).some((a) => a.kind === "activated"), false, "an empty library grants no abilities");
}
{
  const s = table(); const snoop = on(s, card("Conspicuous Snoop")); const donor = on(s, {...grant, subtypes: ["Elf"]}, 0, "library"); s.zones.library[0] = [donor];
  eq(abilitiesOf(s, snoop).some((a) => a.id?.endsWith("donor-life")), false, "a non-Goblin top card does not grant abilities");
  s.objects[donor].keywords = ["Changeling"];
  eq(abilitiesOf(s, snoop).some((a) => a.id?.endsWith("donor-life")), true, "changeling on the top card satisfies the Goblin condition");
  s.objects[snoop].controller = 1;
  eq(abilitiesOf(s, snoop).some((a) => a.id?.endsWith("donor-life")), false, "a change of control switches which player's library grants abilities");
}
console.log(`engine-top-card-abilities: ${checks} checks passed`);
