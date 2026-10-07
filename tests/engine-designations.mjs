/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* CR 701.37, 722.3, 400.7: designations apply once and do not survive zone changes. */
import {table, on, creature, context, checks} from "./helpers/train-b6.mjs";
import {alterAttribute, prepare, unprepare, preparedCopyStays} from "../game/engine/script/effects/attributes.mjs";
import {moveObject} from "../game/engine/state/index.mjs";
const t = checks("engine-designations");
{
  const s = table(), id = on(s, creature("Monster"));
  const events = alterAttribute(s, {attribute: "monstrous", targets: [id], counters: 3}, context);
  alterAttribute(s, {attribute: "monstrous", targets: [id], counters: 8}, context);
  t.eq([s.objects[id].monstrous, s.objects[id].monstrosityX, s.objects[id].counters["+1/+1"]], [true, 3, 3], "a second monstrosity does not add counters or replace X");
  t.eq(events.filter(e => e.kind === "GameEventCardAttribute").length, 1, "becoming monstrous emits its event");
  alterAttribute(s, {attribute: "monstrous", targets: [id], value: false}, context);
  t.eq(s.objects[id].monstrous, true, "monstrous cannot be removed by a false designation");
  const next = moveObject(s, id, "graveyard", 0);
  t.eq(s.objects[next].monstrous, undefined, "a new object loses monstrous");
  alterAttribute(s, {attribute: "monstrous", targets: [next], counters: 3}, context);
  t.eq(s.objects[next].monstrous, undefined, "only a permanent becomes monstrous");
}
{
  const s = table(), plain = on(s, creature("Plain")), id = on(s, creature("Prepared", 2, 2, {preparation: {card: "Inset", types: ["Sorcery"], manaCost: "{R}", spell: {effects: []}}}));
  prepare(s, plain); t.eq(s.objects[plain].prepared, undefined, "a permanent without an inset spell never becomes prepared");
  prepare(s, id); const copy = s.objects[id].preparedCopy;
  prepare(s, id);
  t.eq([s.zones.exile, preparedCopyStays(s, copy), s.objects[copy].prepareOf], [[copy], true, id], "preparing twice retains exactly one linked copy");
  unprepare(s, id);
  t.eq([s.objects[id].prepared, s.objects[copy], s.zones.exile], [undefined, undefined, []], "unpreparing removes the exile copy");
}
t.done();
