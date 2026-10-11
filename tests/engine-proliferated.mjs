/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN C, PHASE 2 (w2c-hands-triggers): "WHENEVER YOU PROLIFERATE" (CR 701.34a).
 *
 * Ezuri, Stalker of Spheres: "whenever you proliferate, draw a card". Proliferating is choosing any number of permanents
 * and players with counters -- none is a number too -- so each proliferate says it is done (GameEventProliferate,
 * effects/asking.mjs), counters given or not, and the trigger `proliferated` reads who did (rules/trigger.mjs). What the
 * scenarios cannot reach: the event itself, chosen none and nothing to choose, "proliferate twice instead" (Tekuthal,
 * Inquiry Dominus) as two, whose proliferate, and the catalog's credit.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const EZURI = "Ezuri, Stalker of Spheres";
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const WALKER = {card: "Walker", types: ["Planeswalker"], manaCost: "{3}", loyalty: 3};
/* "Whenever an opponent proliferates, you gain 1 life." */
const WATCHER = {card: "Watcher", types: ["Enchantment"], manaCost: "{1}", abilities: [{id: "w", kind: "triggered", text: "Whenever an opponent proliferates, you gain 1 life.",
  trigger: {on: "GameEventProliferate", proliferator: "opponent"}, effects: [{effect: "gainLife", amount: 1}]}]};
function table() {
  const s = createState({matchId: "m", seed: "proliferated", players: [{name: "Rob"}, {name: "Maya"}]});
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  beginGame(s);
  for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s);
  return s;
}
const on = (s, o, seat, zone = "battlefield") => {
  const id = addObject(s, {...o, owner: seat, controller: seat}, zone, ["battlefield", "exile"].includes(zone) ? null : seat);
  if (o.loyalty) s.objects[id].counters.loyalty = o.loyalty;
  return id;
};
const proliferateEvents = (events) => events.filter((e) => e.kind === "GameEventProliferate").map((e) => e.data.fields.player.playerId);
/* `seat` proliferates by an effect, choosing the candidates named by `pick` (indices), as the room answers it. */
function proliferate(s, seat, pick = []) {
  const out = beginResolution(s, [{effect: "proliferate"}], {controller: seat, source: null});
  const events = [...out.events];
  for (let n = 0; n < 4 && s.awaiting?.kind === "effect-choice"; n += 1) events.push(...resolveAwaiting(s, pick));
  return events;
}
const triggered = (s) => [...(s.pendingTriggers ?? []).map((t) => [t.source.name, t.controller]), ...s.stack.filter((e) => e.kind === "trigger").map((e) => [e.name, e.playerId])];

{
  /* Chosen: the Walker 3 to 4, and the event once, his. Chosen none: no counter, and the event all the same. Nothing with a
     counter: nobody asked, and the event. */
  const s = table();
  const walker = on(s, WALKER, 0);
  eq([proliferateEvents(proliferate(s, 0, [0])), s.objects[walker].counters.loyalty], [[0], 4], "the Walker chosen: a counter, and Rob proliferated");
  eq([proliferateEvents(proliferate(s, 0, [])), s.objects[walker].counters.loyalty], [[0], 4], "none chosen: no counter, and still he proliferated");
  const bare = table();
  const out = beginResolution(bare, [{effect: "proliferate"}], {controller: 1, source: null});
  eq([bare.awaiting ?? null, proliferateEvents(out.events)], [null, [1]], "nothing with a counter: nobody asked, and Maya proliferated");
}
{
  /* Ezuri, his: his proliferate draws, Maya's does not; Watcher, hers, sees his. */
  const s = table();
  on(s, card(EZURI), 0); on(s, WATCHER, 1); on(s, WALKER, 0);
  s.pendingTriggers = [];
  proliferate(s, 0, [0]);
  eq(triggered(s).sort(), [[EZURI, 0], ["Watcher", 1]], "Rob proliferates: his Ezuri, and Maya's Watcher (an opponent proliferated)");
  s.pendingTriggers = []; s.stack = [];
  proliferate(s, 1, [0]);
  eq(triggered(s), [], "Maya proliferates: neither -- not his, and not her opponent's");
}
{
  /* "If you would proliferate, proliferate twice instead" (Tekuthal): two proliferates, two triggers. */
  const s = table();
  on(s, card(EZURI), 0); on(s, card("Tekuthal, Inquiry Dominus"), 0); on(s, WALKER, 0);
  s.pendingTriggers = [];
  const events = proliferate(s, 0, [0]);
  eq([proliferateEvents(events), triggered(s).filter(([name]) => name === EZURI).length], [[0, 0], 2], "proliferated twice: Ezuri twice");
}
{
  /* The catalog: Ezuri's "Proliferate" trigger is one the engine builds. */
  eq(missingFor({apis: ["Proliferate", "Draw"], triggers: ["ChangesZone", "Proliferate"]}).filter((m) => m.kind === "trigger"), [], "nothing of its triggers missing");
}

console.log(`engine-proliferated: ${checks} checks passed -- every proliferate says it is done, counters given or none, and "whenever you proliferate" reads who did, twice when it is doubled.`);
