/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from "node:assert/strict";
import {loadCardScripts, loadCardIndex} from "../game/tools/engine-cards.mjs";
import {smokeScenario, zoneProblems} from "../game/engine/cards/compile.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
let checks = 0;
const eq = (a, b, message) => {assert.deepEqual(a, b, message); checks++;};
const ok = (value, message) => {assert.ok(value, message); checks++;};
const scripts = loadCardScripts(), index = loadCardIndex();
for (const name of ["Artifact Blast", "Halt Order"]) {
  const script = scripts.find(({script}) => script.identity.name === name).script;
  const {scenario, fixtures} = smokeScenario(script);
  /* Stop after this actual spell's resolution, before later turn draws can mask its own instruction. */
  scenario.steps = scenario.steps.slice(0, scenario.steps.findIndex(step => step.to));
  const {state, events} = runScenario(scenario, index.definition, fixtures);
  const casts = events.filter(event => event.kind === "GameEventSpellAbilityCast").map(event => event.data.fields);
  eq(casts.map(fields => [fields.card.name, fields.si.actor.playerId, fields.castFrom]),
    [["Smoke Artifact Spell", 1, "hand"], [name, 0, "hand"]], "both real legal casts occur exactly once");
  eq(casts[1].targetDescription, "Smoke Artifact Spell", "the counterspell actually targets the artifact spell");
  const target = events.find(event => event.kind === "GameEventBecomesTarget" && event.data.fields.stackId === casts[1].sa.stackId)?.data.fields;
  ok(target?.targetId != null && state.objects[target.targetId]?.zone !== "battlefield", "the targeted stack object never resolves as an artifact permanent");
  const resolved = events.filter(event => event.kind === "GameEventSpellResolved").map(event => event.data.fields);
  eq(resolved.map(fields => [fields.stackId, fields.countered === true, fields.hasFizzled]),
    [[casts[0].sa.stackId, true, false], [casts[1].sa.stackId, false, false]], "the targeted stack entry is countered and the real counterspell resolves");
  eq(state.stack, [], "both stack entries finish");
  eq(state.zones.graveyard.map(ids => ids.map(id => state.objects[id].card)), [[name], ["Smoke Artifact Spell"]], "both spells reach their proper owners' graveyards");
  eq(zoneProblems(state), [], "every changed physical object belongs to exactly its actual zone");
  const draws = events.filter(event => event.kind === "GameEventCardChangeZone" && event.data.fields.drawn === true
    && event.data.fields.to?.player?.playerId === 0).map(event => event.data.fields);
  eq(draws.length, name === "Halt Order" ? 1 : 0, "only Halt Order executes its additional draw instruction");
  eq(state.zones.hand[0].length, name === "Halt Order" ? 1 : 0, "the exact resulting hand includes only the spell's actual draw");
  if (draws.length) eq([draws[0].from.zoneType, draws[0].to.zoneType, draws[0].to.player.playerId, state.zones.hand[0][0]],
    ["Library", "Hand", 0, draws[0].drewAs], "the real new draw object is in the caster's hand");
}
console.log(`engine-smoke-artifacts: ${checks} checks; actual artifact counterspell smoke casts, targets, counter outcomes and the Halt Order draw`);
