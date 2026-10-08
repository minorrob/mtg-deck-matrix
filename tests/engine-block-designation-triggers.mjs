/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* CR 509.3, 701.37: one blocks trigger, or one per attacker; monstrous only on becoming so. */
import {table, on, creature, context, checks} from "./helpers/train-b6.mjs";
import {collectTriggers} from "../game/engine/rules/trigger.mjs";
import {event, cardRef} from "../game/engine/script/effects/zones.mjs";
import {alterAttribute} from "../game/engine/script/effects/attributes.mjs";
const t = checks("engine-block-designation-triggers");
const ability = (id, trigger) => ({id, kind: "triggered", trigger, effects: [{effect: "gainLife", amount: 1}]});
{
  const s = table(), blocker = on(s, creature("Blocker", 3, 4, {abilities: [ability("once", {on: "GameEventBlockersDeclared", who: "self"}), ability("each", {on: "GameEventBlockersDeclared", who: "self", eachBlocked: true})]}), 1);
  const a = on(s, creature("A")), b = on(s, creature("B"));
  s.combat = {attackingPlayerId: 0};
  collectTriggers(s, [event("GameEventBlockersDeclared", s, {blockers: [a, b].map(id => ({card: cardRef(s, blocker), blocking: cardRef(s, id)}))})]);
  t.eq(s.pendingTriggers.length, 3, "one creature blocking two attackers triggers blocks once and blocks-a-creature twice");
  t.eq(s.pendingTriggers.filter(e => e.about.blocked !== undefined).map(e => e.about.blocked), [a, b], "each trigger remembers its own attacker");
  t.ok(s.pendingTriggers.every(e => e.about.player === 0), "the trigger remembers the attacking player");
}
{
  const s = table(), id = on(s, creature("Monster", 2, 2, {abilities: [ability("m", {on: "GameEventCardAttribute", attribute: "monstrous", who: "self"})]}));
  collectTriggers(s, alterAttribute(s, {targets: [id], attribute: "monstrous", counters: 2}, context));
  t.eq(s.pendingTriggers.length, 1, "becoming monstrous triggers once");
  collectTriggers(s, [event("GameEventCardAttribute", s, {card: cardRef(s, id), attribute: "prepared", value: true}), event("GameEventCardAttribute", s, {card: cardRef(s, id), attribute: "monstrous", value: false})]);
  t.eq(s.pendingTriggers.length, 1, "other attributes and losing an attribute do not trigger monstrous");
}
t.done();
