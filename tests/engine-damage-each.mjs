/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* CR 120.1: each selected creature is its own damage source. */
import {table, on, creature, context, checks} from "./helpers/train-b6.mjs";
import {damageEach} from "../game/engine/script/effects/resources.mjs";
import {checkStateBasedActions} from "../game/engine/rules/sba.mjs";
const t = checks("engine-damage-each");
{
  const s = table(), a = on(s, creature("Linked", 2, 4, {keywords: ["Lifelink"]})), b = on(s, creature("Touch", 1, 5, {keywords: ["Deathtouch"]}), 1);
  const c = on(s, creature("Infect", 2, 5, {keywords: ["Infect"]}), 2), zero = on(s, creature("Zero", 0, 4), 2);
  const events = damageEach(s, {dealt: {powerOf: "that card"}, to: "itself"}, context);
  t.eq([s.objects[a].damage, s.objects[b].damage, s.objects[c].damage, s.objects[c].counters["-1/-1"], s.objects[zero].damage], [2, 1, 0, 2, 0], "power and infect are read for each individual source");
  t.eq(s.players.map(p => p.life), [42, 40, 40], "self damage grants only its source's controller lifelink");
  t.eq(events.filter(e => e.kind === "GameEventCardDamaged").map(e => [e.data.fields.source.cardId, e.data.fields.card.cardId]), [[a, a], [b, b], [c, c]], "zero power deals no damage and every source hits itself");
  checkStateBasedActions(s);
  t.eq(Boolean(s.objects[b]), false, "its own deathtouch kills the 1/5");
}
{
  const s = table(), a = on(s, creature("Both", 2, 5, {types: ["Artifact", "Creature"]}));
  damageEach(s, {selector: {anyOf: [{types: ["Creature"]}, {types: ["Artifact"]}]}, dealt: 1, who: [1]}, context);
  t.eq([s.players[1].life, s.objects[a].damage], [39, 0], "overlapping selector alternatives deal only once and support a named recipient");
}
t.done();
