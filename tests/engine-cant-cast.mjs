/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 63 (THE CATALOG'S ORDER): "CAN'T CAST" (Forge's CantBeCast) AND "WHENEVER YOU ATTACK" (attackers
 * declared).
 *
 * A static ability forbids some players' casts: from anywhere but their hands, during its controller's turn (on its own
 * condition), or more than one spell -- of a kind -- each turn; a free cast as an effect resolves too. "Whenever you
 * attack" is the attack as a whole: by whom, with how many, at whom, once for each player attacked. And "lands you control
 * enter untapped", "nonbasic lands your opponents control enter tapped", "each color among permanents you control".
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {castForbidden} from "../game/engine/rules/statics.mjs";
import {castChoicesNow} from "../game/engine/rules/actions.mjs";
import {collectTriggers} from "../game/engine/rules/trigger.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {amountOf} from "../game/engine/script/amount.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const table = (seats = 2) => createState({matchId: "m", seed: "cant", players: Array.from({length: seats}, (_, i) => ({name: `P${i}`}))});
const put = (s, o, seat, zone = "battlefield") => addObject(s, {...o, owner: seat, controller: seat}, zone, ["battlefield", "exile"].includes(zone) ? null : seat);
const ELF = {card: "Elf", types: ["Creature"], manaCost: "{G}", colors: ["G"], power: 1, toughness: 1};
const RELIC = {card: "Relic", types: ["Artifact"], manaCost: "{1}", colors: []};
const TAPLAND = (name, more = {}) => ({card: name, types: ["Land"], ...more, abilities: [{id: "r", kind: "replacement", text: "This land enters tapped.", watches: {event: "enters", who: "self"}, change: {entersTapped: true}}]});

{
  /* Drannith Magistrate (Maya's): Rob can't cast from his graveyard or the command zone, can from his hand; Maya can. */
  const s = table();
  put(s, card("Drannith Magistrate"), 1);
  const [hand, grave, command, hers] = [put(s, ELF, 0, "hand"), put(s, ELF, 0, "graveyard"), put(s, {...ELF, commander: true}, 0, "command"), put(s, {...ELF, commander: true}, 1, "command")];
  eq([hand, grave, command].map((id) => castForbidden(s, 0, id)).concat(castForbidden(s, 1, hers)), [false, true, true, false], "his hand yes; his graveyard and command zone no; Maya's own commander yes");
  /* Nor as an effect lets him cast it free. */
  eq(castChoicesNow(s, 0, grave), [], "a free cast from his graveyard: refused too");
}
{
  /* Conqueror's Flail (Maya's), attached: Rob can't cast during her turn, can during his; unattached, it stops nothing. */
  const s = table();
  const flail = put(s, card("Conqueror's Flail"), 1), bear = put(s, {...ELF, card: "Bear"}, 1), elf = put(s, ELF, 0, "hand");
  s.activePlayer = 1;
  eq(castForbidden(s, 0, elf), false, "unattached: nothing stopped");
  s.objects[flail].attachedTo = bear;
  eq([castForbidden(s, 0, elf), (s.activePlayer = 0, castForbidden(s, 0, elf))], [true, false], "attached: not during her turn; during his, yes");
}
{
  /* More than one each turn: Deafening Silence, noncreature only -- after a Relic, no second artifact, a creature still. Archon:
     any spell, its controller's too. */
  const s = table();
  put(s, card("Deafening Silence"), 1);
  const relic = put(s, RELIC, 0, "hand"), elf = put(s, ELF, 0, "hand");
  s.players[0].castThisTurn = [{types: ["Artifact"], colors: []}];
  eq([castForbidden(s, 0, relic), castForbidden(s, 0, elf)], [true, false], "Deafening Silence: a second noncreature no, a creature yes");
  const t = table();
  put(t, card("Archon of Emeria"), 0);
  const mine = put(t, ELF, 0, "hand");
  eq(castForbidden(t, 0, mine), false, "Archon: his first spell yes");
  t.players[0].castThisTurn = [{types: ["Creature"], colors: ["G"]}];
  eq(castForbidden(t, 0, mine), true, "a second, his own Archon's controller: no");
}
{
  /* Archon of Emeria (Rob's): Maya's nonbasic land enters tapped, her basic does not, nor his own nonbasic. Horizon Explorer
     (Rob's): his land that enters tapped enters untapped -- "onto the battlefield tapped" too -- Maya's still tapped. */
  const s = table();
  put(s, card("Archon of Emeria"), 0);
  const arrive = (o, seat) => { const id = put(s, o, seat, "hand"); runEffects(s, [{effect: "moveZone", targets: [id], to: "battlefield"}], {controller: seat, source: null}); return s.zones.battlefield.find((x) => s.objects[x].card === o.card); };
  eq([arrive({card: "Grove", types: ["Land"]}, 1), arrive({card: "Forest", types: ["Land"], supertypes: ["Basic"]}, 1), arrive({card: "Glade", types: ["Land"]}, 0)].map((id) => s.objects[id].tapped === true),
    [true, false, false], "Maya's Grove tapped; her Forest and his Glade untapped");
  const t = table();
  put(t, card("Horizon Explorer"), 0);
  const land = (o, seat, more = {}) => { const id = put(t, o, seat, "hand"); runEffects(t, [{effect: "moveZone", targets: [id], to: "battlefield", ...more}], {controller: seat, source: null}); return t.zones.battlefield.find((x) => t.objects[x].card === o.card); };
  eq([land(TAPLAND("Vale"), 0), land({card: "Field", types: ["Land"]}, 0, {tapped: true}), land(TAPLAND("Marsh"), 1), land({...ELF, card: "Scout"}, 0, {tapped: true})].map((id) => t.objects[id].tapped === true),
    [false, false, true, true], "his Vale untapped, his Field put tapped untapped; Maya's Marsh tapped; his Scout, a creature put tapped, tapped");
}
{
  /* "Whenever you attack": Firemane Commando's -- he attacks with two, once; with one, not; Maya attacks Bob with two, she
     draws; Maya attacks him, not. Horizon Explorer's: once for each player attacked. */
  const s = table(3);
  const firemane = put(s, card("Firemane Commando"), 0);
  const attack = (attacker, targets) => ({kind: "GameEventAttackersDeclared", data: {turn: 1, phase: "COMBAT_DECLARE_ATTACKERS", fields: {player: {playerId: attacker},
    attackers: targets.map((defender, i) => ({card: {cardId: 100 + i}, defender: {playerId: defender}}))}}});
  const fired = (event) => { s.pendingTriggers = []; collectTriggers(s, [event]); return s.pendingTriggers.filter((p) => p.source.cardId === firemane).map((p) => [p.text.slice(0, 20), p.about?.player]); };
  eq([fired(attack(0, [1, 2])).length, fired(attack(0, [1])).length], [1, 0], "his two attackers: one card; one attacker: none");
  eq([fired(attack(1, [2, 2])).map((f) => f[1]), fired(attack(1, [0, 2]))], [[1], []], "Maya at Bob with two: she draws; with one at him: nothing");
  const t = table(3);
  const explorer = put(t, card("Horizon Explorer"), 0);
  t.pendingTriggers = [];
  collectTriggers(t, [attack(0, [1, 2, 2])].map((e) => ({...e})));
  eq(t.pendingTriggers.filter((p) => p.source.cardId === explorer).map((p) => p.about.player).sort(), [1, 2], "two players attacked: two Landers");
}
{
  /* "Each color among permanents you control": green and red among his, white among Maya's not counted. */
  const s = table();
  put(s, ELF, 0); put(s, {...ELF, card: "Ogre", colors: ["R"]}, 0); put(s, {...ELF, card: "Bear"}, 0); put(s, {...ELF, card: "Knight", colors: ["W"]}, 1);
  eq(amountOf(s, {colorsAmong: {what: "permanent", controller: "you"}}, {controller: 0, source: null}), 2, "two colors among his");
  eq([missingFor({statics: ["CantBeCast"]}), missingFor({triggers: ["AttackersDeclared"]})], [[], []], "the catalog credits CantBeCast and attackers declared");
}

console.log(`engine-cant-cast: ${checks} checks passed — not from anywhere but a hand, not during its controller's turn, not more than one each turn; free casts too; whenever you attack, by whom, with how many, at whom; lands entering untapped and tapped; colors among permanents.`);
