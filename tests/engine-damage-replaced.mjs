/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 47 (THE CATALOG'S ORDER): DAMAGE REPLACED (Forge's DamageDone replacement), IN THE FORMS THAT CHANGE
 * HOW MUCH (CR 614.1a, 615).
 *
 * "It deals double that damage instead", "triple", "that much damage plus 2", "prevent all combat damage that would be
 * dealt to attacking creatures you control" -- watched by what deals it (a source you control, a red one, a creature),
 * to whom (an opponent or their permanent, or anything), combat or not. When several apply to one damage event, the
 * order that leaves the least damage: the affected player's choice for damage they take (CR 616.1), asked of no one yet
 * because damage cannot wait mid-resolution. And each effect once (CR 614.5) even when two cards' share an ability id.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {applyReplacements} from "../game/engine/rules/replacement.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const table = () => createState({matchId: "m", seed: "damage-replaced", players: [{name: "Rob"}, {name: "Maya"}]});
const on = (s, o, seat) => addObject(s, {...o, owner: seat, controller: seat}, "battlefield", null);
const BEAR = {card: "Bear", types: ["Creature"], colors: ["G"], power: 2, toughness: 2};
const IMP = {card: "Imp", types: ["Creature"], colors: ["R"], power: 1, toughness: 1};
const ROCK = {card: "Rock", types: ["Artifact"]};
/* What a source would deal: the amount after every replacement, or 0 if prevented. */
const dealt = (s, source, to, amount = 2, combat = false) => {
  const {proposal} = applyReplacements(s, {event: "damage", ...to, amount, sourceId: source, combat});
  return proposal.prevented ? 0 : proposal.amount;
};

{
  /* Twinflame Tyrant: a source Rob controls, to an opponent or their permanent -- doubled. Not to himself or his own, not
     Maya's source. */
  const s = table();
  on(s, card("Twinflame Tyrant"), 0);
  const imp = on(s, IMP, 0), hers = on(s, BEAR, 1), mine = on(s, BEAR, 0), mayas = on(s, IMP, 1);
  eq([dealt(s, imp, {toPlayer: 1}), dealt(s, imp, {toCard: hers}), dealt(s, imp, {toPlayer: 0}), dealt(s, imp, {toCard: mine}), dealt(s, mayas, {toPlayer: 0})],
    [4, 4, 2, 2, 2], "his Imp to Maya or her Bear: 4; to himself or his own Bear: 2; Maya's Imp to Rob: 2");
}
{
  /* Torbran: a red source, plus 2. Gratuitous Violence: a creature, doubled. Fiery Emancipation: his, to anything, tripled. */
  const s = table();
  on(s, card("Torbran, Thane of Red Fell"), 0);
  const imp = on(s, IMP, 0), bear = on(s, BEAR, 0);
  eq([dealt(s, imp, {toPlayer: 1}), dealt(s, bear, {toPlayer: 1})], [4, 2], "Torbran: a red Imp, 2 plus 2; a green Bear, 2");
  const t = table();
  on(t, card("Gratuitous Violence"), 0);
  eq([dealt(t, on(t, BEAR, 0), {toPlayer: 1}), dealt(t, on(t, ROCK, 0), {toPlayer: 1})], [4, 2], "Gratuitous Violence: a creature, doubled; an artifact, not");
  const u = table();
  on(u, card("Fiery Emancipation"), 0);
  const rock = on(u, ROCK, 0);
  eq([dealt(u, rock, {toPlayer: 1}), dealt(u, rock, {toPlayer: 0}), dealt(u, on(u, ROCK, 1), {toPlayer: 0})], [6, 6, 2], "Fiery Emancipation: his, to Maya or to himself, tripled; Maya's, not");
}
{
  /* Dolmen Gate: combat damage to his attacking creatures -- not noncombat, not a creature not attacking. */
  const s = table();
  on(s, card("Dolmen Gate"), 0);
  const attacker = on(s, BEAR, 0), home = on(s, BEAR, 0), blocker = on(s, BEAR, 1);
  s.combat = {attacks: [{attacker, defender: {playerId: 1}}]};
  eq([dealt(s, blocker, {toCard: attacker}, 2, true), dealt(s, blocker, {toCard: attacker}, 2, false), dealt(s, blocker, {toCard: home}, 2, true)], [0, 2, 2],
    "combat damage to his attacking Bear: prevented; noncombat damage to it, or combat damage to one at home: dealt");
}
{
  /* Two at once, the order that leaves the least: Torbran and Fiery Emancipation on Maya's 2 -- tripled, then plus 2, is
     8; plus 2, then tripled, would be 12. A shield of 3 and a doubler on 2: the shield first, 0. */
  const s = table();
  on(s, card("Torbran, Thane of Red Fell"), 0); on(s, card("Fiery Emancipation"), 0);
  const imp = on(s, IMP, 0);
  eq(dealt(s, imp, {toPlayer: 1}), 8, "Torbran and Fiery Emancipation, 2 to Maya: 8, the least of 8 and 12");
  const events = runEffects(s, [{effect: "dealDamage", amount: 2, who: [1]}], {controller: 0, source: imp});
  eq([s.players[1].life, events.find((e) => e.kind === "GameEventPlayerDamaged").data.fields.amount], [32, 8], "dealt by an effect: Maya at 32, the event says 8");
  const t = table();
  on(t, card("Dictate of the Twin Gods"), 0);
  const shield = on(t, {card: "Shield", types: ["Artifact"], abilities: [{id: "a1", kind: "replacement", text: "Prevent the next 3 damage that would be dealt to you.", watches: {event: "damage", toPlayer: "controller"}, prevent: 3}]}, 1);
  eq([dealt(t, on(t, IMP, 0), {toPlayer: 1}), t.objects[shield].abilities[0].prevent], [0, 1], "a shield of 3 and Dictate, 2 to Maya: the shield first -- 0, and 1 of the shield left");
}
{
  /* Each effect once (CR 614.5), even when two cards' effects share an id: Dictate and Twinflame are each "a1". */
  const s = table();
  on(s, card("Dictate of the Twin Gods"), 0); on(s, card("Twinflame Tyrant"), 0);
  eq(dealt(s, on(s, IMP, 0), {toPlayer: 1}), 8, "Dictate and Twinflame Tyrant: 2, doubled by each, 8");
}
{
  eq(missingFor({replacements: ["DamageDone"]}), [{kind: "replacement", name: "DamageDone", why: "no engine support yet"}],
    "the catalog keeps DamageDone unbuilt: redirecting damage (Pariah) and prevention with a consequence (Vigor) are not built");
}

console.log(`engine-damage-replaced: ${checks} checks passed — doubled, tripled, plus 2, prevented in combat; by whose source, to whom; the least of two orders; each effect once by holder.`);
