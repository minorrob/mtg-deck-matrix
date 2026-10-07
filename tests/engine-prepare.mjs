/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* CR 722.3: the entering replacement, casting permission, and copy lifetime. */
import {table, on, creature, checks, scenarios} from "./helpers/train-b6.mjs";
import {prepare} from "../game/engine/script/effects/attributes.mjs";
import {checkStateBasedActions} from "../game/engine/rules/sba.mjs";
import {moveObject} from "../game/engine/state/index.mjs";
const t = checks("engine-prepare");
t.ok(scenarios("g/goblin-glasswright-craft-with-pride") >= 3, "real prepare card: enters prepared, only its exile copy casts, then unprepares");
{
  const s = table(), id = on(s, creature("Prepared", 2, 2, {preparation: {card: "Inset", types: ["Sorcery"], manaCost: "{R}", spell: {effects: []}}}), 1);
  prepare(s, id); const copy = s.objects[id].preparedCopy;
  checkStateBasedActions(s);
  t.eq([s.objects[copy].owner, s.objects[copy].controller, s.objects[copy].zone], [1, 1, "exile"], "the prepared copy belongs to its controller and survives state-based actions");
  moveObject(s, id, "hand", 1); checkStateBasedActions(s);
  t.eq(s.objects[copy], undefined, "the copy ceases once its permanent leaves");
}
t.done();
