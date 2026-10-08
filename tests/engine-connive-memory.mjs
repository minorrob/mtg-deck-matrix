/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* CR 701.50: players choose connive order, and only nonland discards add counters. */
import {table, on, creature, context, checks, scenarios} from "./helpers/train-b6.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
const t = checks("engine-connive-memory");
t.ok(scenarios("l/lethal-scheme") >= 3, "real convoke cast remembers exactly its convokers, offers order, and distinguishes land discards");
{
  const s = table(); s.activePlayer = 1;
  const a = on(s, creature("Rob's creature")), b = on(s, creature("Maya's first"), 1), c = on(s, creature("Maya's second"), 1);
  for (let p = 0; p < 3; p++) for (let n = 0; n < 3; n++) on(s, {card: `Land ${p}-${n}`, types: ["Land"]}, p, "library");
  beginResolution(s, [{effect: "connive", targets: [a, b, c]}], context);
  t.eq([s.awaiting.player, s.awaiting.effect, awaitingChoice(s).options.map(o => o.cardId)], [1, "conniveWhich", [b, c]], "the active player chooses among their two before a nonactive player");
  resolveAwaiting(s, [1]);
  t.eq([s.awaiting.player, s.awaiting.effect], [1, "discard"], "the chosen creature draws and asks its controller to discard first");
  resolveAwaiting(s, [0]); resolveAwaiting(s, [0]);
  t.eq([s.awaiting.player, s.awaiting.effect], [0, "discard"], "after Maya's creatures finish, Rob connives");
  resolveAwaiting(s, [0]);
  t.eq([s.objects[a].counters, s.objects[b].counters, s.objects[c].counters], [{}, {}, {}], "land discards add no counters");
}
{
  const s = table(), a = on(s, creature("Zero"));
  on(s, creature("Undrawn"), 0, "library");
  beginResolution(s, [{effect: "connive", targets: [a], count: 0}], context);
  t.eq([s.awaiting, s.zones.hand[0].length, s.zones.library[0].length, s.objects[a].counters], [null, 0, 1, {}], "connive zero draws and discards nothing");
}
t.done();
