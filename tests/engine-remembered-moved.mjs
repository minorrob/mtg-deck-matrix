/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 48 (THE CATALOG'S ORDER): WHAT AN EFFECT MOVED, REMEMBERED (Forge's RememberChanged), AND A CONDITION
 * ABOUT A NAMED OBJECT (Forge's ConditionDefined).
 *
 * A search remembers what it found ("untap that land"), and may choose from what an earlier effect moved ("a creature
 * card from among them") -- which it must, from cards face up. moveZone takes the top cards of a library, a player's,
 * revealed if it says. "Its mana value" reads what was moved. "If it would leave the battlefield, exile it instead" stays
 * with that permanent, and not with what it becomes. A condition may ask about the card remembered, a target, or "that
 * card": "if it was a creature card", "if it's blue". And a layer static's `affects` reads supertypes now -- any key its
 * matcher does not read is refused, not ignored.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {conditionHolds, conditionProblems} from "../game/engine/script/condition.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const BEAR = {card: "Bear", types: ["Creature"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2};
const OGRE = {card: "Ogre", types: ["Creature"], manaCost: "{3}{R}", colors: ["R"], power: 4, toughness: 4};
const BOLT = {card: "Bolt", types: ["Instant"], manaCost: "{R}", colors: ["R"]};
const table = () => createState({matchId: "m", seed: "remembered", players: [{name: "Rob"}, {name: "Maya"}]});
const put = (s, o, seat, zone) => addObject(s, {...o, owner: seat, controller: seat}, zone, ["battlefield", "exile"].includes(zone) ? null : seat);
const names = (s, ids) => ids.map((id) => s.objects[id].card);
const you = {controller: 0, source: null};

{
  /* A search that remembers: "untap that land". Without `remember`, nothing is remembered to untap. */
  const s = table();
  put(s, WASTES, 0, "library"); put(s, WASTES, 0, "library");
  beginResolution(s, [{effect: "chooseCard", zone: "library", selector: {types: ["Land"]}, to: "battlefield", tapped: true, remember: true}, {effect: "untap", targets: "remembered"}], you);
  resolveAwaiting(s, [0]);
  eq(s.zones.battlefield.map((id) => s.objects[id].tapped), [false], "found, put onto the battlefield tapped, and untapped: the land it found");
  const t = table();
  put(t, WASTES, 0, "library");
  beginResolution(t, [{effect: "chooseCard", zone: "library", selector: {types: ["Land"]}, to: "battlefield", tapped: true}, {effect: "untap", targets: "remembered"}], you);
  resolveAwaiting(t, [0]);
  eq(t.zones.battlefield.map((id) => t.objects[id].tapped), [true], "without remembering: it stays tapped");
}
{
  /* The top cards of Maya's library, exiled and remembered; a creature card from among them -- not the Ogre already in
     exile -- and one must be chosen; under Rob's control. */
  const s = table();
  for (const o of [BOLT, BEAR, WASTES, OGRE]) put(s, o, 1, "library");
  const old = put(s, OGRE, 1, "exile");
  beginResolution(s, [{effect: "moveZone", fromTop: 3, who: [1], to: "exile", remember: true},
    {effect: "chooseCard", zone: "exile", among: "remembered", selector: {types: ["Creature"]}, to: "battlefield", controller: "you"}], you);
  eq([names(s, s.zones.exile).sort(), names(s, s.zones.library[1])], [["Bear", "Bolt", "Ogre", "Wastes"], ["Ogre"]], "her top three exiled -- Bolt, Bear, Wastes -- and her fourth card stays");
  const choice = awaitingChoice(s);
  eq([choice.options.map((o) => o.label), choice.min], [["Bear"], 1], "the question: the Bear, from among them -- not the Ogre exiled before -- and it must be chosen");
  resolveAwaiting(s, [0]);
  const bear = s.zones.battlefield.find((id) => s.objects[id].card === "Bear");
  eq([s.objects[bear].owner, s.objects[bear].controller, s.zones.exile.includes(old)], [1, 0, true], "her Bear, on the battlefield under Rob's control");
}
{
  /* Revealed if it says; "its mana value" is the remembered card's. */
  const s = table();
  put(s, OGRE, 0, "library"); put(s, WASTES, 0, "library");
  const {events} = beginResolution(s, [{effect: "moveZone", fromTop: 1, to: "hand", reveal: true, remember: true}, {effect: "loseLife", amount: {manaValueOf: "remembered"}}], you);
  eq([names(s, s.zones.hand[0]), events.filter((e) => e.kind === "GameEventCardRevealed").length, s.players[0].life], [["Ogre"], 1, 36], "the Ogre, revealed and put into his hand: he loses 4");
  runEffects(s, [{effect: "moveZone", fromTop: 1, to: "hand"}], you);
  eq(names(s, s.zones.hand[0]).sort(), ["Ogre", "Wastes"], "not revealed when it does not say: the next card, quietly");
}
{
  /* "If it would leave the battlefield, exile it instead": destroyed or bounced, exiled. What it becomes keeps nothing. */
  const s = table();
  const bear = put(s, BEAR, 0, "graveyard");
  runEffects(s, [{effect: "moveZone", targets: [bear], to: "battlefield", exileIfLeaves: true}], you);
  const back = s.zones.battlefield[0];
  runEffects(s, [{effect: "destroy", targets: [back]}], you);
  eq([names(s, s.zones.exile), names(s, s.zones.graveyard[0])], [["Bear"], []], "destroyed: exiled instead");
  const t = table();
  runEffects(t, [{effect: "moveZone", targets: [put(t, BEAR, 0, "graveyard")], to: "battlefield", exileIfLeaves: true}], you);
  runEffects(t, [{effect: "moveZone", targets: [t.zones.battlefield[0]], to: "hand"}], you);
  eq([names(t, t.zones.exile), names(t, t.zones.hand[0])], [["Bear"], []], "returned to his hand: exiled instead");
  const exiled = t.zones.exile[0];
  runEffects(t, [{effect: "moveZone", targets: [exiled], to: "battlefield"}], you);
  runEffects(t, [{effect: "destroy", targets: [t.zones.battlefield[0]]}], you);
  eq(names(t, t.zones.graveyard[0]), ["Bear"], "back from exile it is a new object (CR 400.7): destroyed, to the graveyard");
}
{
  /* A named object: remembered, a target, "that card" -- read where it is now. */
  const s = table();
  const bear = put(s, BEAR, 1, "exile"), bolt = put(s, BOLT, 1, "exile");
  const creature = {about: "remembered", is: {types: ["Creature"]}};
  eq([conditionHolds(s, creature, {controller: 0, remembered: [bear]}), conditionHolds(s, creature, {controller: 0, remembered: [bolt]}), conditionHolds(s, creature, {controller: 0, remembered: []})],
    [true, false, false], "remembered: the Bear is a creature card, the Bolt is not, and nothing remembered is not");
  const drake = put(s, {card: "Drake", types: ["Creature"], colors: ["U"]}, 1, "battlefield");
  const blue = {about: "target", is: {colors: ["U"]}};
  eq([conditionHolds(s, blue, {controller: 0, targets: [{kind: "object", id: drake}]}), conditionHolds(s, blue, {controller: 0, targets: [{kind: "object", id: bear}]}), conditionHolds(s, blue, {controller: 0, targets: [null]})],
    [true, false, false], "a target: the Drake is blue, the Bear is not, and a target gone is not");
  eq(conditionHolds(s, {about: "that card", is: {types: ["Creature"]}}, {controller: 0, about: {card: drake}}), true, "\"that card\": the trigger's subject");
  eq([conditionProblems({about: "remembered"}).length > 0, conditionProblems({about: "it", is: {}}).length > 0, conditionProblems(creature)], [true, true, []], "the schema: both keys, and a known object");
}
{
  /* A layer static's affects reads supertypes; a key the layers' matcher does not read is refused. */
  const script = (affects) => ({schema: "CrankCardScript@1", identity: {name: "Banner", oracleId: "x", types: ["Enchantment"], subtypes: [], manaCost: "{1}", colors: [], colorIdentity: [], power: null, toughness: null},
    oracleText: "Creatures you control get +1/+1.", source: "hand", abilities: [{kind: "static", text: "Creatures you control get +1/+1.", layer: 7, sublayer: "c", affects, apply: {power: 1, toughness: 1}}]});
  eq(compileScript(script({what: "permanent", types: ["Creature"], supertypes: ["Legendary"], controller: "you"})).problems, [], "supertypes: read");
  eq(compileScript(script({what: "permanent", types: ["Creature"], power: {min: 2}})).problems.some((p) => /no key "power"/.test(p)), true, "power: refused, not ignored");
}

/* WAVE 4A, LANE H2: THE CARDS AN EFFECT MOVED, REFERRED TO AFTER IT -- "exile two target ..., then return those cards"
   (Ghostly Flicker, Brago), "put all artifact cards from among them" (Tezzeret, Master of the Bridge), "put all land cards
   from among them" (Animist's Awakening), "you may attach it" (Armored Skyhunter), "exiled with this Vehicle" (Nautiloid
   Ship). What the cards' scenarios cannot reach: each grammar's refusals, and the edges of a move of several at once. */
const RELIC = {card: "Relic", types: ["Artifact"], manaCost: "{1}", colors: []};
const AURA = {card: "Aura", types: ["Enchantment"], subtypes: ["Aura"], manaCost: "{W}", colors: ["W"], enchant: {what: "permanent", types: ["Creature"]}};
const TOKEN = {card: "Treasure", types: ["Artifact"], subtypes: ["Treasure"], colors: [], token: true};
const zoneOf = (s, card) => Object.values(s.objects).filter((o) => o.card === card).map((o) => o.zone).sort();
{
  /* Then return those cards (CR 608.2c): every card exiled first, then every one returned -- never one exiled and returned
     before the next is exiled. */
  const s = table();
  const bear = put(s, BEAR, 0, "battlefield"), relic = put(s, RELIC, 0, "battlefield");
  const events = runEffects(s, [{effect: "moveZone", targets: [bear, relic], to: "exile", andReturn: "now"}], you)
    .filter((e) => e.kind === "GameEventCardChangeZone").map((e) => `${e.data.fields.card.name} to ${e.data.fields.to.zoneType}`);
  eq(events, ["Bear to Exile", "Relic to Exile", "Bear to Battlefield", "Relic to Battlefield"], "both exiled, then both returned");
  /* "Under your control" (Ghostly Flicker): its controller's, whoever owns it. */
  const t = table();
  const theirs = put(t, BEAR, 1, "battlefield");
  t.objects[theirs].controller = 0;
  runEffects(t, [{effect: "moveZone", targets: [theirs], to: "exile", andReturn: "now", under: "you"}], you);
  eq(t.zones.battlefield.map((id) => [t.objects[id].owner, t.objects[id].controller]), [[1, 0]], "Maya's Bear Rob controlled, returned under his control");
}
{
  /* A token exiled this way stays in exile (CR 111.8): it does not return, and is gone at the next state-based actions. */
  const s = table();
  const treasure = put(s, TOKEN, 0, "battlefield"), relic = put(s, RELIC, 0, "battlefield");
  const ctx = {...you};
  runEffects(s, [{effect: "moveZone", targets: [treasure, relic], to: "exile", andReturn: "now", remember: true}], ctx);
  eq([zoneOf(s, "Treasure"), zoneOf(s, "Relic"), names(s, ctx.remembered)], [["exile"], ["battlefield"], ["Relic"]], "the Treasure stays in exile; the Relic comes back, and is what is remembered");
  const exiled = s.zones.exile.find((id) => s.objects[id].card === "Treasure");
  runEffects(s, [{effect: "moveZone", targets: [exiled], to: "battlefield"}], you);
  eq(zoneOf(s, "Treasure"), ["exile"], "nor can any effect bring it back from there");
}
{
  /* Cards entering the battlefield together (CR 303.4f): an Aura among them enchants none of the others -- one of this move's,
     or one a flicker returns beside it. Here Maya's Ogre is the one creature it may enchant; without it, the Aura has nothing
     to enchant and stays where it was (CR 303.4g). */
  const s = table();
  const ogre = put(s, OGRE, 1, "battlefield");
  const bear = put(s, BEAR, 0, "graveyard"), aura = put(s, AURA, 0, "graveyard");
  beginResolution(s, [{effect: "moveZone", targets: [bear, aura], to: "battlefield"}], you);
  const onIt = s.zones.battlefield.find((id) => s.objects[id].card === "Aura");
  eq([onIt !== undefined, s.objects[onIt]?.attachedTo], [true, ogre], "the Bear and the Aura put onto the battlefield at once: the Aura on the Ogre, not the Bear");
  const t = table();
  const lone = put(t, BEAR, 0, "graveyard"), charm = put(t, AURA, 0, "graveyard");
  beginResolution(t, [{effect: "moveZone", targets: [lone, charm], to: "battlefield"}], you);
  eq([zoneOf(t, "Bear"), zoneOf(t, "Aura")], [["battlefield"], ["graveyard"]], "with only the Bear entering beside it, the Aura stays in the graveyard");
}
{
  /* "Put all artifact cards from among them" (`only`): of what it names, those a selector fits where each now is -- nobody
     asked; on the battlefield, as permanents. */
  const s = table();
  const relic = put(s, RELIC, 0, "exile"), bear = put(s, BEAR, 0, "exile");
  runEffects(s, [{effect: "moveZone", targets: [relic, bear], only: {types: ["Artifact"]}, to: "battlefield"}], you);
  eq([zoneOf(s, "Relic"), zoneOf(s, "Bear"), s.awaiting ?? null], [["battlefield"], ["exile"], null], "the Relic onto the battlefield, the Bear left in exile");
  const t = table();
  const a = put(t, RELIC, 0, "battlefield"), b = put(t, BEAR, 0, "battlefield");
  runEffects(t, [{effect: "moveZone", targets: [a, b], only: {types: ["Creature"]}, to: "hand"}], you);
  eq([zoneOf(t, "Relic"), zoneOf(t, "Bear")], [["battlefield"], ["hand"]], "a permanent read as a permanent: the creature returned, the artifact not");
  /* As it now is, through the layers: a Wastes animated into a creature (layer 4) is one -- its card's types say land. */
  const u = table();
  const land = put(u, WASTES, 0, "battlefield");
  runEffects(u, [{effect: "animate", targets: [land], power: 1, toughness: 1}], you);
  runEffects(u, [{effect: "moveZone", targets: [land], only: {types: ["Creature"]}, to: "hand"}], you);
  eq(zoneOf(u, "Wastes"), ["hand"], "the animated Wastes, a creature now, returned");
}
{
  /* "Exile target player's graveyard" kept for "exiled with this Vehicle" (moveZoneAll's `link`): what reached exile. A card
     a replacement sends elsewhere ("put it into its owner's hand instead") was never exiled, and is not linked. */
  const s = table();
  const ship = put(s, RELIC, 0, "battlefield");
  put(s, BEAR, 1, "graveyard"); put(s, OGRE, 1, "graveyard");
  runEffects(s, [{effect: "moveZoneAll", selector: {what: "card", zone: "graveyard", controller: 1}, to: "exile", link: true}], {controller: 0, source: ship});
  eq(names(s, s.links[ship]).sort(), ["Bear", "Ogre"], "her two creature cards exiled, linked to the source");
  const t = table();
  const vehicle = put(t, RELIC, 0, "battlefield");
  put(t, {card: "Warden", types: ["Enchantment"], abilities: [{id: "w", kind: "replacement", text: "If a card would be put into exile from a graveyard, put it into its owner's hand instead.",
    watches: {event: "zone-change", from: "graveyard", to: "exile"}, change: {to: "hand"}}]}, 1, "battlefield");
  put(t, BEAR, 1, "graveyard");
  runEffects(t, [{effect: "moveZoneAll", selector: {what: "card", zone: "graveyard", controller: 1}, to: "exile", link: true}], {controller: 0, source: vehicle});
  eq([zoneOf(t, "Bear"), (t.links?.[vehicle] ?? []).length], [["hand"], 0], "put into her hand instead: nothing linked");
}
{
  /* "{R}{W}, Unattach this Equipment" (Sunforger; CR 701.3d): off the creature it equipped, which no longer lists it. */
  const index = loadCardIndex();
  const fixtures = {Bear: {types: ["Creature"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2}};
  const {state: s} = runScenario({name: "unattach", setup: [{seat: 0, zone: "battlefield", cards: ["Sunforger", "Bear", "Wastes", "Wastes", "Wastes", "Mountain", "Plains"]}],
    steps: [{tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {activate: "Sunforger", ability: "a2", targets: [{card: "Bear"}]}, {resolve: true},
      {tap: "Mountain"}, {tap: "Plains"}, {activate: "Sunforger", ability: "a1"}]}, index.definition, fixtures);
  const bear = s.zones.battlefield.find((id) => s.objects[id].card === "Bear"), sunforger = s.zones.battlefield.find((id) => s.objects[id].card === "Sunforger");
  eq([s.objects[sunforger].attachedTo ?? null, s.objects[bear].attachments ?? []], [null, []], "unattached as the cost is paid, and off the Bear's list");
}
{
  /* "Exile the top X cards ... you may attach it": the Equipment the effect before it put onto the battlefield. None there,
     nobody is asked. "Put all land cards from among them" (dig's `all`): nobody is asked, and what it took is remembered. */
  const s = table();
  put(s, BEAR, 0, "battlefield");
  const ctx = {...you, remembered: []};
  const outcome = beginResolution(s, [{effect: "chooseCard", zone: "battlefield", selector: {types: ["Creature"], controller: "you"}, upTo: true, to: "stay", attach: "remembered"}], ctx);
  eq([outcome.status, s.awaiting ?? null], ["done", null], "nothing remembered on the battlefield to attach: no question");
  const t = table();
  for (const o of [BEAR, WASTES, BOLT, WASTES]) put(t, o, 0, "library");
  const dug = beginResolution(t, [{effect: "dig", count: 3, selector: {types: ["Land"]}, all: true, toByType: [{types: ["Land"], to: "battlefield", tapped: true}], remember: true},
    {effect: "untap", targets: "remembered"}], you);
  eq([dug.status, names(t, t.zones.battlefield), t.zones.battlefield.map((id) => t.objects[id].tapped), names(t, t.zones.library[0])],
    ["done", ["Wastes"], [false], ["Wastes", "Bear", "Bolt"]], "the one land of the top three onto the battlefield and remembered (untapped after); the rest to the bottom");
}
{
  /* Each new word's grammar, refused when it is misused rather than read as something else. */
  const script = (effects, kind = "spell") => ({schema: "CrankCardScript@1", identity: {name: "Probe", oracleId: "x", types: ["Sorcery"], subtypes: [], manaCost: "{1}", colors: [], colorIdentity: [], power: null, toughness: null},
    oracleText: "Probe.", source: "hand", abilities: [{kind, text: "Probe.", effects}]});
  const refused = (effects, pattern) => compileScript(script(effects)).problems.some((p) => pattern.test(p));
  eq(compileScript(script([{effect: "moveZone", targets: "remembered", only: {types: ["Artifact"]}, to: "battlefield"}])).problems, [], "`only`, a selector: read");
  eq(refused([{effect: "moveZone", targets: "remembered", only: {mana: 3}, to: "battlefield"}], /only/), true, "`only` with a key no selector has: refused");
  eq(refused([{effect: "moveZone", targets: "remembered", to: "exile", returnTapped: true}], /returnTapped/), true, "returnTapped without andReturn: refused");
  eq(refused([{effect: "moveZoneAll", selector: {what: "card", zone: "graveyard"}, to: "hand", link: true}], /link/), true, "a move of all kept as linked, not to exile: refused");
  eq(refused([{effect: "chooseCard", zone: "battlefield", selector: {types: ["Creature"]}, to: "hand", attach: "remembered"}], /attach/), true, "attach with a chosen card that moves: refused");
  eq(refused([{effect: "dig", count: 3, selector: {types: ["Land"]}, all: true, take: 2}], /all/), true, "dig's all beside a take: refused");
  eq(refused([{effect: "dig", count: 3, all: true}], /all/), true, "dig's all with nothing to fit: refused");
  eq(refused([{effect: "dig", count: 3, selector: {types: ["Land"]}, all: true, upTo: true}], /all/), true, "dig's all beside a \"you may\": refused");
  eq(compileScript(script([{effect: "dig", count: 3, selector: {types: ["Land"]}, all: true, toByType: [{types: ["Land"], to: "battlefield", tapped: true}]}])).problems, [], "dig's all beside a selector: read");
  eq(refused([{effect: "modal", choose: 1, sameMode: true, modes: [{text: "A", effects: [{effect: "draw", count: 1}]}, {text: "B", effects: [{effect: "draw", count: 2}]}]}], /sameMode/), true,
    "the same mode more than once, choosing one: refused");
  eq(compileScript(script([{effect: "modal", choose: 3, sameMode: true, modes: [{text: "A", effects: [{effect: "draw", count: 1}]}, {text: "B", effects: [{effect: "draw", count: 2}]}]}])).problems, [],
    "choose three, the same mode more than once (Eldrazi Confluence): read");
}

console.log(`engine-remembered-moved: ${checks} checks passed — a search remembers; from among what was moved, chosen; the top of a library, revealed if it says; its mana value; exiled if it would leave; a named object's condition; a layer's affects read in full or refused; those cards exiled, then returned, a token never, an Aura entering beside them enchanting none of them; all of a kind from among them; an Equipment attached as it says; each new word refused when misused.`);
