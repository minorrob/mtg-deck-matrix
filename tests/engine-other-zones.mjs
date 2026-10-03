/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 16 (THE CATALOG'S ORDER): PLAYING A CARD FROM ANOTHER ZONE.
 *
 * "You may play lands from your graveyard" and "from the top of your library" use the land drop (CR 305.2); "you may
 * play an additional land" adds one; "you may cast artifact spells and colorless spells from the top of your library"
 * offers only what fits. The top card is seen by whom the rules say and nobody else (CR 401.4): revealed, by everyone;
 * "you may look at the top card any time", by its owner alone; otherwise by nobody -- never more than that one card.
 * "You may cast this card from your graveyard or from exile" is the card's own.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction, nothingToDo} from "../game/engine/rules/actions.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const land = (name, color) => ({card: name, types: ["Land"], supertypes: ["Basic"], subtypes: color === "C" ? [] : [name], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {[color]: 1}}]});
const WASTES = land("Wastes", "C"), FOREST = land("Forest", "G");
const pod = {matchId: "m", seed: "zones", players: [{name: "Rob"}, {name: "Maya"}]};
/* A library whose top cards are `top`, the rest Wastes. */
function table(top = [[], []]) {
  const s = createState(pod);
  for (let seat = 0; seat < 2; seat += 1) {
    for (const c of top[seat]) addObject(s, {...c, owner: seat, controller: seat}, "library", seat);
    for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  }
  return s;
}
const on = (s, o, seat, zone = "battlefield") => addObject(s, {...o, owner: seat, controller: seat}, zone, ["battlefield", "exile"].includes(zone) ? null : seat);
function main(s) { beginGame(s); for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s); return s; }
const lands = (s) => legalActions(s, 0).filter((a) => a.kind === "play-land").map((a) => `${a.label}${a.from ? ` (${a.from})` : ""}`).sort();
const casts = (s) => legalActions(s, 0).filter((a) => a.kind === "cast").map((a) => a.label).sort();

/* ---- lands from the graveyard; an additional land ---- */
{
  const s = table();
  on(s, FOREST, 0, "graveyard");
  main(s);
  eq(lands(s), [], "a land in the graveyard is not playable by itself");
  on(s, card("Crucible of Worlds"), 0);
  eq(lands(s), ["Forest (graveyard)"], "with Crucible of Worlds it is");
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "play-land"));
  on(s, FOREST, 0, "graveyard");
  eq(lands(s), [], "and it used the land drop: no second land (CR 305.2)");
}
{
  const s = table();
  on(s, card("Icetill Explorer"), 0); on(s, FOREST, 0, "hand"); on(s, land("Island", "U"), 0, "hand");
  main(s);
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "play-land" && a.label === "Forest"));
  eq(lands(s), [], "while its landfall trigger is on the stack, no land may be played (CR 305.1)");
  passPriority(s); passPriority(s);
  ok(lands(s).includes("Island"), "\"you may play an additional land\": once it resolves, a second land drop");
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "play-land" && a.label === "Island"));
  passPriority(s); passPriority(s);
  on(s, FOREST, 0, "hand");
  eq(lands(s), [], "and no third");
}

/* ---- the top of the library ---- */
{
  const s = table([[{...FOREST}], []]);
  on(s, card("Courser of Kruphix"), 0);
  main(s);
  eq(lands(s), ["Forest (library)"], "Courser of Kruphix: the top card, a Forest, may be played");
  const [mine, hers] = [projectFor(s, 0), projectFor(s, 1)];
  eq([mine.players[0].zones.Library.cards.map((c) => c.name), hers.players[0].zones.Library.cards.map((c) => c.name)], [["Forest"], ["Forest"]],
    "\"play with the top card revealed\": Rob and Maya both see it");
  eq([mine.players[0].zones.Library.count, mine.players[0].zones.Library.hiddenCount], [13, 12], "and only that one: the rest of the library is a count");
  eq(hers.players[1].zones.Library.cards, [], "Maya's own library stays hidden: Courser is Rob's");
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "play-land"));
  eq(projectFor(s, 1).players[0].zones.Library.cards.map((c) => c.name), ["Wastes"], "the next top card is revealed in its turn");
}
{
  const rock = {card: "Rock", types: ["Artifact"], manaCost: "{1}"};
  const s = table([[rock], []]);
  on(s, card("Mystic Forge"), 0); on(s, WASTES, 0);
  main(s);
  eq([projectFor(s, 0).players[0].zones.Library.cards.map((c) => c.name), projectFor(s, 1).players[0].zones.Library.cards], [["Rock"], []],
    "\"you may look at the top card any time\": Rob sees it; Maya does not");
  eq(projectFor(s, null).players[0].zones.Library.cards, [], "nor does a spectator");
  eq(nothingToDo(s, 0), false, "an artifact castable from the top with a land untapped is something to do");
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana"));
  eq(casts(s), ["Rock"], "the artifact on top may be cast");
  const events = applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "cast"));
  ok(events.some((e) => e.kind === "GameEventCardChangeZone" && e.data.fields.from?.zoneType === "Library"), "and the history says it came from the library");
}
{
  const bear = {card: "Bear", types: ["Creature"], manaCost: "{1}", colors: ["G"], power: 2, toughness: 2};
  const eldrazi = {card: "Eldrazi", types: ["Creature"], manaCost: "{1}", colors: [], power: 2, toughness: 2};
  for (const [top, want, why] of [[bear, [], "a green creature is neither an artifact nor colorless"], [eldrazi, ["Eldrazi"], "a colorless creature is"]]) {
    const s = table([[top], []]);
    on(s, card("Mystic Forge"), 0); on(s, WASTES, 0);
    main(s);
    applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana"));
    eq(casts(s), want, `Mystic Forge: ${why}`);
  }
}
{
  /* Without any such permanent, nobody sees the top card. */
  const s = table([[{...FOREST}], []]);
  main(s);
  eq([projectFor(s, 0).players[0].zones.Library.cards, projectFor(s, 1).players[0].zones.Library.cards, lands(s)], [[], [], []], "without such a permanent the library is a count to everyone, and nothing on top is offered");
}

{
  /* Nothing in hand, a Dragon on top, two lands untapped: Korlessa has no ability of its own, so only the top card
     makes the step one with something to do -- it must not pass itself. */
  const whelp = {card: "Whelp", types: ["Creature"], subtypes: ["Dragon"], manaCost: "{1}{R}", colors: ["R"], power: 1, toughness: 1};
  const s = table([[whelp], []]);
  on(s, card("Korlessa, Scale Singer"), 0); on(s, land("Mountain", "R"), 0); on(s, WASTES, 0);
  main(s);
  eq(nothingToDo(s, 0), false, "a Dragon castable from the top of the library with lands untapped: the step does not pass itself");
}

/* ---- a card's own permission ---- */
{
  const s = table();
  on(s, card("Squee, the Immortal"), 0, "graveyard");
  on(s, {card: "Ogre", types: ["Creature"], manaCost: "{1}", power: 3, toughness: 3}, 0, "graveyard");
  for (let i = 0; i < 3; i += 1) on(s, land("Mountain", "R"), 0);
  main(s);
  for (let i = 0; i < 3; i += 1) applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana"));
  eq(casts(s), ["Squee, the Immortal"], "Squee may be cast from the graveyard; another creature card there may not");
  const s2 = table();
  on(s2, card("Squee, the Immortal"), 0, "exile");
  for (let i = 0; i < 3; i += 1) on(s2, land("Mountain", "R"), 0);
  main(s2);
  for (let i = 0; i < 3; i += 1) applyAction(s2, 0, legalActions(s2, 0).find((a) => a.kind === "activate-mana"));
  eq(casts(s2), ["Squee, the Immortal"], "and from exile");
}

console.log(`engine-other-zones: ${checks} checks passed — lands from the graveyard and the top of the library on the land drop, the top card seen only by whom the rules say, spells from the top by what they are, a card cast from its graveyard or exile.`);
