/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* LIVING WEAPON (CR 702.92; Bitterthorn, Nissa's Animus, Train B X11).
 *
 * The keyword is a triggered ability (cards/index.mjs): when this Equipment enters, create a 0/0 black Phyrexian Germ
 * creature token, then attach this Equipment to it -- the token remembered by the resolution, the Equipment attached as
 * equip attaches it (effects/permanents.mjs). An Equipment gone before it resolves attaches to nothing, and the Germ, a 0/0,
 * is put into its owner's graveyard (CR 704.5f) and ceases to exist (704.5d). It is its controller's, whoever cast it.
 */
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {characteristicsOf} from "../game/engine/rules/layers.mjs";
import {play, drive, at, compiled, missing, keywordBuilt, index, checks} from "./helpers/x11-keywords.mjs";

const {eq, ok, done} = checks("engine-x11-living-weapon");
const BT = "Bitterthorn, Nissa's Animus", GERM = "Phyrexian Germ";
const germs = (s) => s.zones.battlefield.filter((id) => s.objects[id].card === GERM);
const CAST = [{tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: BT}, {resolve: true}];

{
  /* Cast and resolved: the trigger on the stack, then the Germ, equipped. */
  const s = play([at(0, "battlefield", "Wastes", "Wastes", "Wastes"), at(0, "hand", BT)], CAST);
  eq(s.stack.length + (s.pendingTriggers ?? []).length, 1, "the Equipment entered: its living weapon trigger, and nothing else, waits");
  drive(s, (st) => germs(st).length === 1 && st.stack.length === 0);
  const [germ] = germs(s), equipment = s.zones.battlefield.find((id) => s.objects[id].card === BT);
  const c = characteristicsOf(s, germ);
  eq([c.types, c.subtypes, c.colors, s.objects[germ].power, s.objects[germ].toughness, s.objects[germ].token], [["Creature"], ["Phyrexian", "Germ"], ["B"], 0, 0, true],
    "a 0/0 black Phyrexian Germ creature token");
  eq([s.objects[equipment].attachedTo, [c.power, c.toughness]], [germ, [1, 1]], "Bitterthorn attached to it: a 1/1");
}
{
  /* The Equipment destroyed in response: the Germ is made, nothing is attached, and the 0/0 is gone. */
  const s = play([at(0, "battlefield", "Wastes", "Wastes", "Wastes"), at(0, "hand", BT)], CAST);
  drive(s, (st) => st.stack.length === 1 && st.stack[0].kind === "trigger");
  const equipment = s.zones.battlefield.find((id) => s.objects[id].card === BT);
  runEffect(s, {effect: "destroy", targets: [equipment]}, {controller: 1, source: null});
  drive(s, (st) => st.stack.length === 0 && st.phase === "MAIN1" && st.priorityPlayer !== null);
  eq([germs(s).length, s.zones.graveyard[0].map((id) => s.objects[id].card)], [0, [BT]], "nothing to attach: the Germ, 0/0, is put into the graveyard and ceases to exist");
}
{
  /* Cast by Maya on her turn, three players: the Germ is Maya's. */
  const s = play([at(1, "battlefield", "Wastes", "Wastes", "Wastes"), at(1, "hand", BT)],
    [{to: {turn: 2, phase: "MAIN1"}}, {tap: "Wastes", seat: 1}, {tap: "Wastes", seat: 1}, {tap: "Wastes", seat: 1}, {cast: BT, seat: 1}, {resolve: true}], {seats: 3});
  drive(s, (st) => germs(st).length === 1 && st.stack.length === 0);
  eq(characteristicsOf(s, germs(s)[0]).controller, 1, "Maya's Equipment makes Maya's Germ");
}
{
  /* Equipped to another creature: the Germ is a 0/0 again and goes. */
  const s = play([at(0, "battlefield", "Bear", "Wastes", "Wastes", "Wastes", "Wastes", "Wastes", "Wastes"), at(0, "hand", BT)],
    [...CAST, {resolve: true}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {activate: BT, targets: [{card: "Bear"}]}, {resolve: true}]);
  eq(germs(s), [], "re-equipped to the Bear: the Germ is gone");
}
{
  /* Only its own entering: a land played, or a creature cast, beside it makes no Germ. */
  const s = play([at(0, "battlefield", "Wastes", "Wastes", "Wastes"), at(0, "hand", BT, "Forest", "Bear")], [...CAST, {resolve: true}, {play: "Forest"}]);
  const bear = s.zones.hand[0].find((id) => s.objects[id].card === "Bear");
  runEffect(s, {effect: "moveZone", targets: [bear], to: "battlefield"}, {controller: 0, source: null});
  drive(s, (st) => st.stack.length === 0 && !(st.pendingTriggers ?? []).length && st.priorityPlayer !== null);
  eq(germs(s).length, 1, "a land and a Bear entered after it: still the one Germ");
}
ok(compiled([{kind: "keyword", text: "Living weapon", keyword: "living weapon"}], {types: ["Artifact"], subtypes: []}).problems
  .some((p) => p.includes("living weapon on a card that is not an Equipment")), "living weapon on an artifact that is no Equipment is refused");
eq(index.definition(BT).keywords, ["Living Weapon"], "Bitterthorn's keyword");
ok(keywordBuilt("Living Weapon"), "Living Weapon is built (engine-constructs: its primitive createToken)");
eq(missing(BT), [], `${BT} needs nothing the engine lacks`);
ok(index.resolve(BT)?.playable === true, `${BT} is defined and playable`);

done("the Germ made and equipped as the Equipment enters, its controller's; nothing attached once the Equipment is gone; re-equipped, the Germ goes.");
