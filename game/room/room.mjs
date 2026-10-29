/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE GAME ROOM (M5, docs/plan-to-100.md; the engine's §3.8 cloud-host readiness).
 *
 * One match, run by CME, with the only copy of the whole state. Everything a seat ever receives is its
 * own view: `projectFor(state, seat)` (hands are owner-only, libraries hidden from everyone) plus the
 * decision that seat is being asked, if any. There is no call here that returns the state itself.
 *
 * IT DRIVES THE GAME, WHICH THE LOCAL RUNTIME NEVER QUITE DID. The engine runs until it needs a decision;
 * the room asks the house pilot when the seat is an AI and answers at once, and offers the decision to the
 * seat's person through the controller (§12.1) when it is not. So priority is a decision like any other: a
 * seat is offered its legal actions as a "one" choice, and passing is one of them.
 *
 * IT KEEPS NO TRANSPORT AND NO IDENTITY. A seat is a seat id the caller has already authenticated; who the
 * person is stays in the Worker's front door (cloud/), never in the engine or here. The Durable Object in
 * cloud/game-room.mjs carries the views over WebSockets; tests carry them in memory.
 *
 * IT RESUMES FROM ANY DECISION. After every human decision it persists, through the M4 storage adapter
 * (game/engine/storage.mjs), the journal events since the last save, a checkpoint of the state and the rng,
 * and its own record (the seats, and the controller's checkpoint, which holds the pending question and the
 * receipts that make a retried action idempotent). A room reopened on the same storage -- the Durable Object
 * evicted and woken, say -- is the same game at the same question.
 *
 * THE TABLE'S TWO BEATS (Rob, 2026-09-30; docs/plan-to-done-2026-09-30.md, items 11 and 13), each asked for by the pod
 * and kept with the match, so a game made before them replays exactly as it was played:
 *   `drawBeat`   the draw step's draw waits for its player's Draw a card (the engine holds it, CR 504.1);
 *   `passEmpty`  a person whose only legal action is to pass, with the stack empty, passes by itself -- there was no
 *                choice to make (AGENTS.md: decisions belong to the players, and this is not one) -- and a step that
 *                passes by itself says so in the history: "Draw step: nothing to do".
 * And a third, Rob's of 2026-10-06, kept with the match the same way:
 *   `endWhenNoPerson`  once every person at the table is out of the game -- lost, conceded or out of time -- the game
 *                ends there, its record saying so, rather than the AI seats playing it out for nobody.
 * And a fourth, Rob's of 2026-10-09 ("resolve all"), kept the same way:
 *   `resolveAll`  a run of identical triggers on top of the stack is let resolve by one decision, Resolve all, rather
 *                than a pass for each (CR 732.2a, a shortcut; `triggerRun`).
 * And a fifth, Rob's of 2026-10-09 ("When I play a card to the board from my hand, I don't want to have to click a pop-up
 * to resolve it"), kept the same way:
 *   `passAfterCast`  a person who casts a spell or activates an ability passes the priority it brings back to them (CR
 *                117.3c) by doing so, so what they put on the stack resolves unless someone responds. To hold priority
 *                instead -- the caster's choice, CR 117.3c -- the answer that casts carries `hold: true` (the board's
 *                Tools, "Hold priority after I cast"). One pass, for that cast: a response on top asks them again.
 * And a sixth, Rob's of 2026-10-11 ("passing the turn to the next player should always require player confirmation, never
 * happen automatically"), kept the same way:
 *   `endAsks`    a person's own end step is asked of them whether or not there is anything to do in it, so their turn
 *                ends only with their pass there (the board's End turn; priorityChoice, `endsTurn`).
 * And a seventh, Rob's of the same day ("I should also be able to click the card to untap it again"), kept the same way:
 *   `untapMana`  a person who taps a land for mana may untap it while its mana is unspent and nothing else has happened
 *                (game/engine/rules/untap-mana.mjs), and is not passed for while they may: "Untap Forest", beside the pass.
 * And two of the Oct 16 handoff's (Linear ROB-13), kept the same way:
 *   `passStack`  `passEmpty` with something on the stack too: a person with no response they could make passes by itself
 *                (rules/actions.mjs, nothingToDo with `stack`) -- unless they cast holding priority (`heldBy`), play step
 *                by step, or may untap mana, when they are asked as before.
 *   `yieldTurn`  a person may yield the rest of an opponent's turn (`yieldTurn`, on the tape): each priority of theirs
 *                in it is passed for them, whatever they hold. What the rules ask of them is still asked -- targets, modes,
 *                a "may", blockers, discards, trigger order, payments -- and the yield holds on after their answer. It ends
 *                with that turn (the game's turn number: an extra turn is a new one), when that turn's player leaves the
 *                game, or when they stop it; it never carries into their own turn or another match.
 * And one of Rob's one-person, three-AI table (Oct 21), kept the same way:
 *   `blocksNone` a person attacked with no creature that could block any attacker on them is not asked to declare
 *                blockers: the declaration is empty (CR 509.1a), so there is no choice to make, and the room makes it, the
 *                history saying why. A person with a block they could make is asked as ever, yielding or not.
 * And three of Rob's fullscreen notes (Oct 21), kept the same way:
 *   `landAnyStep`  a person plays their land drop in any step of their own turn they hold priority in, the stack empty --
 *                a house rule, not CR 305.1's main phase (rules/actions.mjs); the AI seats play by the book.
 *   `takeBackLand` a person who played a land, and has done nothing since, may put it back in their hand and have their
 *                land drop again ("Oh wait, I didn't mean to lay that land down"): the game put back exactly as it was
 *                before the land (`landBack`, a copy taken as it was played), and asked while they may, as `untapMana` is.
 *   `askAimed`   another player's spell or ability on top of the stack aimed at a person -- them, a permanent or spell of
 *                theirs, a card in their graveyard -- is asked of them before it resolves, response or not, so they may
 *                read what is being done to them (`passStack` passes it otherwise). And a person's way of playing may say
 *                `askStack`, Skip my priority if no response possible turned off: asked whenever anything is on the stack.
 *
 * WHAT IT PLAYS. Only cards the `cards` resolver can define. A pod with any other card is refused before
 * anything is written, naming every card it cannot play (docs/decisions-2026-09-25.md, M4: "refused by name;
 * compiled once M7 lands"). Today that is the basic lands, as it is for the engine itself.
 * AND HOW ITS AI SEATS ANSWER, kept the same way: `pilotPicks` (Linear ROB-164, 2026-10-19) has every AI seat's
 * pilot take what a choice it may answer with none is for -- the land a search finds, the counters proliferate adds --
 * where a match launched before it took none (game/engine/pilots/house-pilot.mjs, `picks`). The room tapes no AI answer,
 * so the match keeps the key and its pilots answer as they did.
 *
 * A pod that says `candidates` (a playtest table's, Rob's decision 2) also plays the card compiler's candidates, where
 * `cards` has no definition: each object made from one says `candidate`, which the board labels (projection.mjs). A
 * match keeps the key, so it reopens and replays with the same cards; a pod without it never seats one.
 */
import {createState, addObject, shownName, shownFaceUp} from "../engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../engine/rules/turn.mjs";
import {legalActions, applyAction, nothingToDo, whyNot, escapeWays, flashbackCost, tappersInWords, castTapPlans, tapWords, manaSources} from "../engine/rules/actions.mjs";
import {paymentWords} from "../engine/rules/mana.mjs";
import {beforeTap, tapTaken, untappable, untapTaken} from "../engine/rules/untap-mana.mjs";
import {beforePlay, observePlay, finishPlay, mayUndoPlay, undoPlay} from "../engine/rules/undo-play.mjs";
import {passPriority} from "../engine/rules/priority.mjs";
import {gameOver, concede} from "../engine/rules/sba.mjs";
import {beginMulligans} from "../engine/rules/mulligan.mjs";
import {projectFor} from "../engine/projection.mjs";
import {controllerOf, characteristicsOf, deriving} from "../engine/rules/layers.mjs";
import {blockers} from "../engine/rules/combat.mjs";
import {countWords, inWords, targetName} from "../engine/script/bind.mjs";
import {createRng} from "../engine/rng.mjs";
import {createJournal, hashState} from "../engine/journal.mjs";
import {createController} from "../engine/controller.mjs";
import {createMatchStore} from "../engine/storage.mjs";
import {housePilot, meetRequirements, manaColors, combatSourceAnswer, combatDamageAnswer} from "../engine/pilots/house-pilot.mjs";
import {scoredPilot, SETTINGS} from "../engine/pilots/scored-pilot.mjs";
import {combatMemoryFor, rememberDamage} from "../engine/pilots/provocation.mjs";
import {personaOf, dispositionFor} from "../engine/pilots/roster.mjs";
import {flagsOf, commanderClassOf} from "../engine/pilots/roles.mjs";
import {agentPilot} from "../engine/pilots/agent-pilot.mjs";
import {addToHistory} from "./history.mjs";
import {tableEvent, eventsFor, keep, EVENTS_SCHEMA} from "./events.mjs";
import {endingOf} from "./ending.mjs";
import {describeDecision} from "./decision.mjs";
import {beginCastDraft,beginActionDraft,offerCastDraft,castDraftChoice,castDraftSignature,answerCastDraft} from "./cast-stages.mjs";

export const ROOM_PROTOCOL = 1;
export const ROOM_SCHEMA = "CrankRoom@1";
export const VIEW_SCHEMA = "CrankRoomView@1";
const SEAT_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const MAX_CARDS = 250;           // a Commander deck is 100; this is only a bound on what a pod may carry
const DRIVE_LIMIT = 100000;      // engine steps between two human decisions before the room calls it a hang
const HISTORY_KEEP = 300;         // lines of the table's history kept with the room
const HISTORY_VIEW = 120;         // the newest of them, in every view
const REFUSALS_SAID = 20;
/** How a game that ended because every person was out says so (`endWhenNoPerson`). */
export const NO_PERSON_REASON = "every person had left the game, so it ended there";         // refused pilot answers kept in full with the match's tally; the count itself is never trimmed
/* The steps as the history names them when one passes by itself (the untap and cleanup steps give no priority). */
const QUIET_STEP = {UPKEEP: "Upkeep", DRAW: "Draw step", MAIN1: "Main 1", COMBAT_BEGIN: "Beginning of combat", COMBAT_DECLARE_ATTACKERS: "Declare attackers",
  COMBAT_DECLARE_BLOCKERS: "Declare blockers", COMBAT_FIRST_STRIKE_DAMAGE: "First-strike damage", COMBAT_DAMAGE: "Combat damage", COMBAT_END: "End of combat",
  MAIN2: "Main 2", END_OF_TURN: "End step"};

export class RoomError extends Error {
  constructor(status, message, extra = {}) {super(message); this.status = status; Object.assign(this, extra);}
}

/* The one kind of card the engine can play with no definition: a basic land -- Basic, a Land, its land type, and the mana
   ability that type gives it (CR 205.4c, 305.6; Wastes has no land type and its own {T}: Add {C}). Its supertype and type
   are what "search your library for a basic land card" and "unless you control a Forest or an Island" read: without them
   (Rob, 2026-10-11: Rampant Growth found nothing in a library of nineteen basics), every such search and check failed. */
const BASIC_COLORS = {Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G", Wastes: "C"};
export function basicCards(name) {
  const color = BASIC_COLORS[name];
  return color ? {types: ["Land"], supertypes: ["Basic"], subtypes: name === "Wastes" ? [] : [name],
    abilities: [{id: `t-${color.toLowerCase()}`, kind: "mana", tapSelf: true, produces: {[color]: 1}}]} : null;
}

/* Public facts the house pilot may read about a named card: what anyone reads off the card itself. */
const manaValueOf = (cost) => (String(cost || "").match(/\{([^}]+)\}/g) || []).reduce((n, s) => {const x = s.slice(1, -1); return n + (/^\d+$/.test(x) ? Number(x) : x === "X" ? 0 : 1);}, 0);
/** The pilots' `cards`: a named card's public facts, over a definition resolver -- what a table hands its AI seats. */
export const factsFrom = (cards) => {
  /* Read once a name: a card's facts do not change in a match. */
  const known = new Map();
  return (name) => (known.has(name) ? known.get(name) : known.set(name, withRoles(name, factsOf(cards(name)))).get(name));
};
/* What a card does to a game (game/engine/pilots/roles.mjs): its role flags and, as a commander, its class -- public facts, as
   a card's own text is, so the threat table and the urgency read them alike for every seat. */
const withRoles = (name, facts) => (facts ? {...facts, flags: flagsOf(name), commanderClass: commanderClassOf(name)} : facts);
const factsOf = (c) => {
  /* `x`: a cost with {X} (CR 107.3), so the house pilot taps everything before it casts. `subtypes`, and what each activated
     ability costs and does (`activated`), as the card says: L1 weighs an ability by them (scored-pilot.mjs). Its `colors`
     and the mana it `makes`: which land a search should find for the spells a pilot holds (house-pilot.mjs, `picks`). */
  return c ? {manaValue: manaValueOf(c.manaCost), types: c.types || [], subtypes: c.subtypes || [], power: c.power ?? null, toughness: c.toughness ?? null,
    colors: c.colors || [], makes: manaColors(c),
    ...(/\{X\}/.test(c.manaCost || "") ? {x: true} : {}),
    activated: (c.abilities || []).filter((a) => a.kind === "activated").map((a) => ({id: a.id, cost: a.cost || [], effects: a.effects || []}))} : null;
};

/* A pod, checked before anything is created: its seats, and every card named by name. */
function readPod(pod, cards) {
  const seats = pod && Array.isArray(pod.seats) ? pod.seats : [];
  if (seats.length < 2 || seats.length > 4) throw new RoomError(400, "A table seats two to four players.");
  const ids = new Set(), missing = new Set();
  const read = seats.map((s, index) => {
    const seatId = String(s && s.seatId || "");
    if (!SEAT_ID.test(seatId) || ids.has(seatId)) throw new RoomError(400, `Seat ${index + 1} needs its own seat id.`);
    ids.add(seatId);
    const pilot = s.pilot === "house" ? "house" : "human";
    /* An AI seat's setting (AI-2): "easy" or "normal", L1 (game/engine/pilots/scored-pilot.mjs), or "llm", the LLM seat
       (game/engine/pilots/agent-pilot.mjs). A seat without one, as every match launched before it, is L0, the house pilot,
       and replays as it was played. */
    const level = pilot === "house" && [...SETTINGS, LLM].includes(s.level) ? s.level : null;
    const commander = (Array.isArray(s.commander) ? s.commander : []).map(String);
    const library = (Array.isArray(s.cards) ? s.cards : []).map(String);
    if (commander.length > 2 || commander.length + library.length > MAX_CARDS) throw new RoomError(400, `${seatId}'s deck is not one a table can hold.`);
    for (const name of [...commander, ...library]) if (!cards(name)) missing.add(name);
    /* An AI seat's persona (game/engine/pilots/roster.mjs): an id on the roster, or none; carried with the seat, replayed with it. */
    const persona = level && personaOf(s.persona) ? s.persona : null;
    return {seatId, name: String(s.name || `Seat ${index + 1}`).slice(0, 60), pilot, ...(level ? {level} : {}), ...(persona ? {persona} : {}), commander, cards: library};
  });
  if (missing.size) {
    const names = [...missing].sort();
    throw new RoomError(422, `The table cannot play ${names.length === 1 ? "this card" : `these ${names.length} cards`} yet: ${names.join(", ")}.`, {unsupported: names});
  }
  return read;
}

/* WHAT TELLS ONE OFFER FROM ANOTHER OF THE SAME CARD (Rob, 2026-10-01: a choice is a pop-up where the player selects).
   The engine offers a spell once per way to aim it, an ability once per permanent that could pay its sacrifice, a mana
   ability once per color it can add (rules/actions.mjs); each option's `label` is still the card's name, and `detail`
   says which way this one is -- "→ Maya", "→ Llanowar Elves (Maya's)", "sacrificing Bear", "{G}" -- so the board can
   ask which. Without it, a spell with five legal targets was five buttons reading the same, and a press aimed it at
   the first. Everything named is the deciding seat's to see: what is on the battlefield or the stack, the players,
   and the seat's own hand for a discard. Two things that would read the same are told apart by power and toughness
   and whether they are tapped, then numbered. */
/** The least legal answer to a question (room drive, answerForPilot): the minimum of options, in the order offered; an
    amount or a division filled lethal-first, then the rest on the last; a number at its minimum. */
export function leastAnswer(choice) {
  const options = choice.options ?? [];
  const combatSource = combatSourceAnswer(choice);
  if (combatSource) return combatSource;
  if (choice.mode === "damage") return combatDamageAnswer(choice);
  if (choice.mode === "amount") {
    const amounts = options.map(() => choice.minEach ?? 0);
    let left = (choice.total ?? 0) - amounts.reduce((a, b) => a + b, 0);
    for (let i = 0; i < options.length && left > 0; i += 1) {
      const room = Math.max(0, (options[i].max ?? left) - amounts[i]);
      const take = Math.min(left, room);
      amounts[i] += take; left -= take;
    }
    if (left > 0 && amounts.length) amounts[amounts.length - 1] += left;
    return {indices: [], amounts};
  }
  if (choice.mode === "integer") return {indices: [], value: choice.min ?? 0};
  /* What the record requires ("attacks each combat if able", CR 508.1d), and no more: each where it is free first, and
     never past what the player can pay for (an attack tax, CR 508.1h; `budget`). */
  if (Array.isArray(choice.requires) && choice.requires.length) return {indices: meetRequirements(choice, [])};
  return {indices: options.slice(0, Math.max(choice.min ?? 0, choice.mode === "one" || choice.mode === "boolean" ? 1 : 0)).map((o) => o.index)};
}

/* WHOSE SIDE AN OFFER IS ON (Rob, 2026-10-12: Valorous Stance's indestructible aimed at an opponent's creature "should be
   distinguished from spells that are negative"). What it does to each target it is aimed at -- its chosen modes', or its
   own -- read off the effects bound to that target: one that helps it (a pump, indestructible, life, a +1/+1 counter, an
   untap, a draw, a land found) aimed at an opponent's permanent or at an opponent "helps" them; one that harms it (destroy,
   damage, a -1/-1 counter, a discard, a sacrifice, a mill, a counterspell) aimed at your own permanent or at you is
   "against your own" -- "against you". Either may be what a player means, so it is said, never refused. */
const HELPS = (e) => (e.effect === "pump" && (e.power ?? 0) >= 0 && (e.toughness ?? 0) >= 0 && ((e.power ?? 0) > 0 || (e.toughness ?? 0) > 0 || (e.keywords ?? []).length > 0))
  || ["gainLife", "untap", "regenerate", "draw", "chooseCard"].includes(e.effect) || (e.effect === "putCounter" && ["+1/+1", "loyalty", "shield"].includes(e.counter));
const HARMS = (e) => ["destroy", "dealDamage", "loseLife", "discard", "sacrifice", "mill", "counterSpell", "poison"].includes(e.effect)
  || (e.effect === "pump" && ((e.power ?? 0) < 0 || (e.toughness ?? 0) < 0)) || (e.effect === "putCounter" && e.counter === "-1/-1");
/* Each effect of a list, nested ones too ("then", a branch's), with the target it is bound to: `targets` or `who`. */
function aimedEffects(effects, offset, out = []) {
  for (const e of effects ?? []) {
    if (!e || typeof e !== "object") continue;
    for (const ref of [e.targets, e.who]) if (ref && typeof ref === "object" && Number.isInteger(ref.target)) out.push({e, at: offset + ref.target});
    for (const nested of [e.effects, e.then, e.else, e.otherwise]) if (Array.isArray(nested)) aimedEffects(nested, offset, out);
  }
  return out;
}
/* Who holds a target: a permanent's controller now (the layers), any other object's controller. */
function holderIn(state, id) {
  const o = state.objects[id];
  if (!o) return null;
  try { return o.zone === "battlefield" ? controllerOf(state, id) : o.controller; } catch { return o.controller; }
}
export function leaning(state, seat, a) {
  if (!(a.targets ?? []).length || (a.kind !== "cast" && a.kind !== "activate")) return "";
  const object = state.objects[a.objectId];
  const source = a.kind === "activate" ? (object?.abilities ?? []).find((b) => b.id === a.abilityId) : object?.spell;
  if (!source) return "";
  /* A modal one's chosen modes, their targets one after another in the order chosen (CR 700.2c). */
  let aimed = [];
  if (Array.isArray(a.modes) && source.modal?.modes) {
    let offset = 0;
    for (const i of a.modes) {const mode = source.modal.modes[i]; if (!mode) continue; aimed = aimed.concat(aimedEffects(mode.effects, offset)); offset += (mode.targets ?? []).length;}
  } else aimed = aimedEffects(source.effects, 0);
  for (const {e, at} of aimed) {
    const t = a.targets[at];
    if (!t || Array.isArray(t) || (t.kind !== "object" && t.kind !== "player")) continue;
    const holder = t.kind === "player" ? t.id : holderIn(state, t.id);
    if (holder === undefined || holder === null) continue;
    if (HELPS(e) && holder !== seat) return `helps ${state.players[holder]?.name ?? `Seat ${holder + 1}`}`;
    if (HARMS(e) && holder === seat) return t.kind === "player" ? "against you" : "against your own";
  }
  return "";
}

export function offerDetails(state, seat, actions) {
  const player = (id) => (id === seat ? `${state.players[id]?.name ?? "you"} (you)` : state.players[id]?.name ?? `Seat ${id + 1}`);
  const object = (id, plain) => {
    const o = state.objects[id];
    if (!o) return "";
    const holder = holderIn(state, id);
    const whose = holder === seat || holder === undefined || holder === null ? "" : ` (${state.players[holder]?.name ?? `Seat ${holder + 1}`}'s)`;
    /* A face-down permanent has no name (CR 708.2a): it is said to be face down. */
    const name = shownName(o);
    if (plain) return `${name}${whose}`;
    let shape = "";
    try { const c = characteristicsOf(state, id); if (c.power !== null && c.power !== undefined) shape = ` ${c.power}/${c.toughness}`; } catch { /* no shape */ }
    return `${name}${whose}${shape}${o.tapped ? ", tapped" : ""}`;
  };
  /* A card exiled face down that the seat may play, said as the card it is -- its modes, its alternative costs (CR 406.3a;
     rules/actions.mjs, withFaceUp): only a player who may look at it is offered it. */
  const card = (id) => { const o = state.objects[id]; return o?.faceDown === true && o.zone === "exile" ? shownFaceUp(o) : o; };
  const MANA = ["W", "U", "B", "R", "G", "C"];
  const manaText = (mana) => MANA.flatMap((k) => Array.from({length: mana?.[k] ?? 0}, () => `{${k}}`)).join("");
  const abilities = new Map();
  for (const a of actions) if (a.kind === "activate") abilities.set(a.objectId, new Set([...(abilities.get(a.objectId) ?? []), a.abilityId]));
  const say = (a, plain) => {
    const parts = [];
    /* Which ability: one of several, or one a card has in a graveyard (encore), which its name alone does not say. */
    if (a.kind === "activate" && a.text && ((abilities.get(a.objectId)?.size ?? 0) > 1 || state.objects[a.objectId]?.zone === "graveyard")) parts.push(`“${a.text}”`);
    /* The modes chosen as it is cast (CR 700.2), in the card's words. */
    /* And an activated ability's, chosen as it is activated (Aetheric Amplifier): its own modes' words. */
    const modal = a.kind === "activate" ? (state.objects[a.objectId]?.abilities ?? []).find((b) => b.id === a.abilityId)?.modal : card(a.objectId)?.spell?.modal;
    /* None at all ("choose up to four", Moment of Reckoning): said so. */
    if (Array.isArray(a.modes)) parts.push(a.modes.length ? a.modes.map((i) => modal?.modes?.[i]?.text ?? `mode ${i + 1}`).join(" + ") : "no modes");
    if (a.x !== undefined) parts.push(`X = ${a.x}`);
    /* A manifested permanent of the seat's own turned face up for its card's mana cost (CR 701.40b): the label is the card,
       which only this seat is offered (CR 708.5). */
    /* Or for its disguise cost (CR 702.168d), said as its card says it -- or its morph cost (CR 702.37e). */
    const faceDownWay = (abilities) => (abilities ?? []).find((b) => b.kind === "static" && (b.rule === "disguise" || b.rule === "morph"));
    if (a.kind === "turn-face-up") {
      const way = a.disguise ? faceDownWay(state.objects[a.objectId]?.faceDownCard?.abilities) : null;
      parts.push(a.disguise ? `turn face up for its ${way?.rule ?? "disguise"} cost, ${way?.cost?.[0]?.cost ?? ""}`
        : `turn face up for ${state.objects[a.objectId]?.faceDownCard?.manaCost ?? "its mana cost"}`);
    }
    /* Cast face down with disguise (CR 702.168a): as a 2/2 with ward {2}, for {3}; with morph (CR 702.37a), a 2/2 with no text. */
    if (a.kind === "cast" && a.disguise) parts.push(faceDownWay(state.objects[a.objectId]?.abilities)?.rule === "morph" ? "face down for {3}, a 2/2 with no text" : "face down for {3}, a 2/2 with ward {2}");
    /* Suspended from the hand (CR 702.62a): its words ("Suspend 5--{W}"), and the mana that pays, when that is a choice. */
    if (a.kind === "suspend") parts.push(a.payWith !== undefined ? `${a.text ?? "suspend"}, paying ${paymentWords(a.payment)}` : a.text ?? "suspend");
    /* Plotted from the hand (CR 702.170a): its words without their reminder ("Plot {1}{B}"), and the mana that pays, when that is
       a choice. */
    if (a.kind === "plot") {
      const words = (a.text ?? "Plot").replace(/\s*\([^)]*\)\s*$/, "");
      parts.push(a.payWith !== undefined ? `${words}, paying ${paymentWords(a.payment)}` : words);
    }
    /* A counted target (script/bind.mjs): what is still to be picked ("up to two targets"), or the ones picked. */
    const aimed = (t) => (!t ? "" : Array.isArray(t) ? (t.length ? t.map(aimed).join(" and ") : "no target") : t.kind === "choose" ? countWords(t)
      : t.kind === "player" ? player(t.id) : t.kind === "ability" ? targetName(state, t) : object(t.id, plain));
    if ((a.targets ?? []).length) parts.push(`→ ${a.targets.map(aimed).join(", ")}`);
    const lean = leaning(state, seat, a);
    if (lean) parts.push(lean);
    /* What the cost takes: one card, or a set of them ("sacrificing Bear and Wolf", "discarding Ponder and Opt"), each
       said with what it does to them. */
    /* "Blight 1" puts its counters on the creature (CR 701.68a); "tap three untapped creatures you control", a set tapped; and
       "remove a counter from this creature" names the kind of counter, not a card. */
    const DOING = {discard: "discarding", returnToHand: "returning", exile: "exiling", crew: "crewing with", tap: "tapping", tapAll: "tapping", untap: "untapping",
      blight: "blighting"};
    for (const [kind, id] of Object.entries(a.costChoice ?? {}))
      parts.push(kind === "counter" ? `removing a ${id} counter` : `${DOING[kind] ?? "sacrificing"} ${[].concat(id).map((x) => object(x, plain)).join(" and ")}`);
    /* An alternative cost (CR 118.9): what is paid instead of the mana cost -- an evoke cost by its name (CR 702.74a), as
       the permanent will be sacrificed as it enters. */
    if (a.alternative !== undefined) {
      const ability = card(a.objectId)?.abilities?.[a.alternative];
      const cost = ability?.cost ?? [];
      const mana = cost.find((c) => c.atom === "mana")?.cost, life = cost.filter((c) => c.atom === "payLife").reduce((n, c) => n + (c.amount ?? 0), 0);
      /* Surge and freerunning by their names too (CR 702.117a, 702.173a): what it is cast for is what its text asks about. */
      parts.push([ability?.evoke ? (mana ? `evoke for ${mana}` : "evoke") : ability?.paidFor && mana ? `${ability.paidFor} for ${mana}` : mana ? `for ${mana} instead` : (life || cost.length ? "instead of its mana cost" : "without paying its mana cost"),
        life ? `paying ${life} life` : null].filter(Boolean).join(", "));
    }
    /* "Without paying its mana cost", beside the paid cast of the same card (rules/actions.mjs). */
    if (a.free) parts.push("without paying its mana cost");
    /* An additional cost's mana, beside its other choice ("blight 1 or pay {3}"). */
    if (a.extraMana) parts.push(`paying ${a.extraMana} more`);
    /* A gift promised (CR 702.174a): to whom, the caster's choice of opponent. */
    if (a.gift !== undefined) parts.push(`promising ${player(a.gift)} a gift`);
    /* Tapped for as it is cast (the board's one click): the sources, or that the caster picks them. */
    if (a.autoTap) {
      const ways = castTapPlans(state, seat, a, 2);
      parts.push(ways.length === 1 ? `tapping ${tapWords(state, ways[0])}` : "tapping what you choose");
    }
    /* Convoke (CR 702.51a): creatures help pay, picked once it is taken. */
    if (a.convoke) parts.push("convoking, tapping creatures you choose");
    /* Delve (CR 702.66a): cards of the graveyard help pay, picked once it is taken (wave 4c, k2). */
    if (a.delve) parts.push("delving, exiling cards you choose from your graveyard");
    /* Flashback (CR 702.34a): from the graveyard for its flashback cost, exiled after -- and the creatures it taps, picked
       once it is taken. */
    /* And the permanents it sacrifices ("Flashback--Sacrifice three creatures", Dread Return), picked once it is taken too. */
    if (a.flashback) {
      const back = flashbackCost(state, seat, a.objectId), tap = back?.tap, sacrifice = back?.sacrifice;
      parts.push(`flashback${tap ? `, tapping ${tappersInWords(tap)}` : ""}${sacrifice ? `, sacrificing ${inWords(sacrifice.count)} you choose` : ""}`);
    }
    /* Escape (CR 702.138a): from the graveyard for its escape cost -- its mana, and the other cards it will take. */
    if (a.escape !== undefined) {
      const way = escapeWays(state, seat, a.objectId).find((w) => w.kind === a.escape);
      parts.push(way ? `escape for ${way.mana}, exiling ${inWords(way.exile)} other card${way.exile === 1 ? "" : "s"}` : "escape");
    }
    if (a.kind === "activate-mana" && a.produce !== undefined) parts.push(manaText(a.mana));
    return parts.join(" · ");
  };
  const details = actions.map((a) => (a.kind === "pass" ? "" : say(a, true)));
  /* Same card, same words: say more, then number what is still alike. */
  const key = (a, i) => `${a.kind}|${a.objectId}|${details[i]}`;
  const clash = (i) => details[i] && actions.some((b, j) => j !== i && key(b, j) === key(actions[i], i));
  const fuller = details.map((d, i) => (clash(i) ? say(actions[i], false) : d));
  const seen = new Map();
  return fuller.map((d, i) => {
    if (!d || !actions.some((b, j) => j !== i && b.kind === actions[i].kind && b.objectId === actions[i].objectId && fuller[j] === d)) return d;
    const k = `${actions[i].kind}|${actions[i].objectId}|${d}`, n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return `${d} · ${n}`;
  });
}

/* SAME NAME, TWO CREATURES (Linear ROB-168): a Krenko swarm's Declare blockers offered "Wall blocks Goblin" once per Goblin
   token, and Declare attackers "Goblin → Maya", with nothing to tell them apart. Where a creature's words are another's in the
   same choice, they say more -- its power and toughness, as a priority offer's do (offerDetails) -- and what is still alike is
   numbered, each creature its own number in every option it is in, so "blocks Goblin #2" is the same Goblin whichever
   blocker is picked; a block on an attack at a planeswalker says so. The words only: every option keeps its index and ids,
   so answers and replays are the engine's own. A choice with no two alike is left word for word as it was. */
export function combatWords(state, choice) {
  const id = String(choice && choice.id || "");
  const blocks = id.startsWith("declare-blockers:"), attacks = id.startsWith("declare-attackers:");
  if (!blocks && !attacks) return choice;
  const shape = (cardId) => {try {const c = characteristicsOf(state, cardId); return c.power === null || c.power === undefined ? "" : ` ${c.power}/${c.toughness}`;} catch {return "";}};
  /* Every creature the choice names, in the order the options first name it. */
  const ids = [];
  for (const o of choice.options || []) for (const c of blocks ? [o.cardId, o.attackerId] : [o.cardId]) if (c !== undefined && !ids.includes(c)) ids.push(c);
  const named = new Map(ids.map((c) => [c, shownName(state.objects[c])]));
  const count = (map) => {const n = new Map(); for (const w of map.values()) n.set(w, (n.get(w) || 0) + 1); return n;};
  let clash = count(named);
  if (![...clash.values()].some((n) => n > 1)) return choice;
  const words = new Map([...named].map(([c, w]) => [c, clash.get(w) > 1 ? `${w}${shape(c)}` : w]));
  clash = count(words);
  const seen = new Map();
  for (const c of ids) {
    const w = words.get(c);
    if (clash.get(w) > 1) {const k = (seen.get(w) || 0) + 1; seen.set(w, k); words.set(c, `${w} #${k}`);}
  }
  const attackOn = new Map(((state.combat && state.combat.attacks) || []).map((a) => [a.attacker, a]));
  const options = choice.options.map((o) => {
    if (attacks) {
      const at = String(o.label).indexOf(" → ");
      return at < 0 ? o : {...o, label: `${words.get(o.cardId)}${String(o.label).slice(at)}`};
    }
    const on = attackOn.get(o.attackerId), pw = on && on.planeswalker !== undefined ? state.objects[on.planeswalker] : null;
    return {...o, label: `${words.get(o.cardId)} blocks ${words.get(o.attackerId)}${pw ? ` (attacking ${shownName(pw)})` : ""}`};
  });
  return {...choice, options};
}

/* A priority decision, as a §12.1 choice: one of the seat's legal actions, passing included -- and Resolve all, when
   a run of identical triggers is on top of the stack (`triggerRun`). */
function priorityChoice(id, actions, state = null, seat = null) {
  const details = state ? offerDetails(state, seat, actions) : [];
  return {id, title: "Your priority", mode: "one", min: 1, max: 1, kind: "priority",
    options: actions.map((a, index) => (a.kind === "resolve-all" ? {index, label: `Resolve all ${a.n}`, act: a.kind, count: a.n, detail: `${a.name} triggers`}
      /* A tap taken back, its mana unspent (`untapMana`). */
      : a.kind === "undo-mana" ? {index, label: `Untap ${a.name}`, act: a.kind, cardId: a.objectId, detail: "its mana unspent"}
      /* A land put back in the hand, nothing since (`takeBackLand`). */
      : a.kind === "undo-land" ? {index, label: `Return ${a.name} to your hand`, act: a.kind, cardId: a.objectId, detail: "your land drop back"}
      : a.kind === "undo-play" ? {index, label: `Undo ${a.name}`, act: a.kind, cardId: a.objectId, detail: "the play and its mana back"}
      : {index, label: a.kind === "pass" ? "Pass priority" : (a.label || a.kind), act: a.kind, ...(a.objectId !== undefined ? {cardId: a.objectId} : {}),
        /* The pass that ends the seat's own turn: its end step, nothing on the stack (the board says "End turn"). */
        ...(a.kind === "pass" && state && seat === state.activePlayer && state.phase === "END_OF_TURN" && !state.stack.length ? {endsTurn: true} : {}),
        ...(details[index] ? {detail: details[index]} : {}),
        /* Whose side it is on, when it is not the usual one (`leaning`): "helps Maya", "against your own" -- the board marks it. */
        ...((lean) => (lean ? {lean} : {}))(state ? leaning(state, seat, a) : "")}))};
}

/* RESOLVE ALL (Rob, 2026-10-09). Krenko, Mob Boss with Intruder Alarm puts thousands of one trigger on the stack, and
   every one was a pass for each person, a question and a save, so a real table would stall as two of G1's games did.
   A run is the entries from the top of the stack that are the same trigger: the same ability of the same source,
   controlled by the same player, with the same targets. What each is about (which creature entered) may differ; letting
   them all resolve is the person's choice, as it is at a table. The seat that takes it passes for each, no more than were
   there when it chose, and is asked again as soon as anything else is on top or the stack is empty. */
const RUN_LEAST = 2;
/* AND THE SAME ANSWER FOR THE SAME QUESTION (Rob, 2026-10-09: "Yes to all"). A run's triggers can each ask their
   controller the same thing -- "you may put a quest counter on this enchantment", once per Goblin. Asked during the run,
   the person answers once; each time the very same question comes again in that run (its words, its mode and limits,
   every option's words and card), the room gives that answer. A question that differs in any of them is asked. */
export const questionKey = (choice) => JSON.stringify([choice.title, choice.mode, choice.min ?? null, choice.max ?? null,
  (choice.options ?? []).map((o) => [o.label, o.cardId ?? null, o.detail ?? null])]);
const runKey = (e) => (e && e.kind === "trigger" && e.stage === "waiting" ? JSON.stringify([e.playerId, e.cardId, e.name, e.abilityId, e.targets]) : null);
/* AIMED AT A PERSON (`askAimed`): the top of the stack is another player's, and among its targets is this player, a
   permanent they control, a spell of theirs, or a card in their graveyard or hand -- the same reading as a crime's (CR 700.13;
   rules/stack.mjs, crimeCommitted), from the other side. */
export function aimedAt(state, seat) {
  const top = state.stack[state.stack.length - 1];
  if (!top || top.playerId === seat) return false;
  return (top.targets ?? []).flat().some((t) => {
    if (t?.kind === "player") return t.id === seat;
    const object = t?.kind === "object" ? state.objects[t.id] : undefined;
    if (!object) return false;
    if (object.zone === "battlefield") return deriving(state, () => controllerOf(state, t.id)) === seat;
    if (object.zone === "stack") return object.controller === seat;
    return ["graveyard", "hand"].includes(object.zone) && object.owner === seat;
  });
}
export function triggerRun(stack) {
  const key = runKey(stack[stack.length - 1]);
  if (key === null) return null;
  let n = 0;
  while (n < stack.length && runKey(stack[stack.length - 1 - n]) === key) n += 1;
  return n >= RUN_LEAST ? {key, n, name: stack[stack.length - 1].name} : null;
}

/**
 * The room over its storage. `start` a new match on empty storage, or `open` the one stored there.
 *
 * @param {object} storage  the M4 storage contract (get/put/delete/list); a Durable Object's own, in the cloud
 * @param {(name: string) => ?object} cards  a card's definition for `addObject`, or null when the engine
 *   cannot play it
 * @param {Function} makePilot  what answers for an AI seat: `seatPilot`, given {seat, cards, deck, level, seed, picks}. A suite may
 *   pass its own (one that answers wrongly on purpose, to prove the refusal tally); the table never does
 * @param {number} slice  engine steps one call may take before it stops, saved, for `resume` (the Durable Object's
 *   alarm) to play on from; unbounded unless given
 * @param {(name: string) => ?object} candidates  a candidate's definition (game/engine/cards/candidates.mjs), consulted
 *   only for a pod that says `candidates`; none unless given
 */
/**
 * WHAT ANSWERS FOR AN AI SEAT: L1 at its setting, handed its own deck list (which its player knows) and the match's seed
 * (easy's chance); without a setting, L0. Both see only the seat's projection. `picks`: the match's `pilotPicks`.
 */
export function seatPilot({seat, cards, deck = [], level = null, persona = null, seed = "", picks = false, provocation = true}) {
  /* A PERSONA'S OVERRIDES (roster.mjs `dispositionFor`): the pilot is made with them, so the seat plays its difficulty as that persona
     would; a seat without one plays the plain difficulty, as every table has. */
  const given = persona && level ? dispositionFor(level, persona) : null;
  const disposition = given && !provocation ? {...given,grudge:0} : given;
  if (level === LLM) return agentPilot({seat, cards, deck, seed, picks, disposition});
  return level ? scoredPilot({seat, cards, deck, setting: level, seed, picks, disposition}) : housePilot({seat, cards, picks});
}
/** The LLM seat's setting: L1, but its close calls are offered to the seat, for its model to answer (`consults`). */
export const LLM = "llm";

function roomOn(storage, matchId, cards, makePilot = seatPilot, slice = Infinity, candidates = () => null) {
  const store = createMatchStore(storage, matchId);
  const ROOM_KEY = `room/${matchId}`;
  const LAND_KEY = `room/${matchId}/land-back`;
  const PLAY_KEY = `room/${matchId}/last-play`;
  /* The cards this match plays: `cards`, and for a pod that says `candidates`, a candidate where `cards` has none, marked. */
  const withCandidates = (name) => cards(name) ?? ((c) => (c ? {...c, candidate: true} : null))(candidates(name));
  let seated = false;
  const look = (name) => (seated ? withCandidates : cards)(name);
  const facts = factsFrom(look);
  let seats, state, rng, journal, controller, pilots, pendingSeat = null, pendingActions = null, saved = 0;
  let castDraft = null;
  const draftOptions = {describeActions: (seat, actions) => offerDetails(state, seat, actions)};
  /* Accepted actions by id, with the seat that sent them: a retry is answered from here, and never reaches
     another seat's question. The newest RECEIPTS are kept, which is ample for a client's retries. */
  let receipts = [];
  const RECEIPTS = 256;
  /* LEAVING (Rob, 2026-09-26). `leaving`: seats that have left and are yet to be conceded in the engine -- a seat
     that leaves before the first turn has its opening hand kept for it by the house pilot, and concedes the
     moment the game begins. `departures`: who left, and why ("conceded", or "timed-out" when a dropped player's
     five minutes ran out, which their record shows as not finished). `ended`: someone ended the game for
     everyone. */
  let leaving = [], departures = {}, ended = null;
  /* THE SEATS OUT OF THE GAME, IN THE ORDER THEY WENT OUT (Linear ROB-166): seat ids, from the engine's own "lost" events as
     they are written, so a game that ends once every person is out says how the last of them went (ending.mjs). Kept with
     the room, so a game played in slices or woken in between says the same; empty in a room saved before it was kept. */
  let outs = [];
  /* THE TABLE'S HISTORY (game/room/history.mjs): public lines only, the same for every seat, kept with the room. */
  let history = [];
  /* EVERY REFUSED PILOT ANSWER, COUNTED FOR THE WHOLE MATCH (the independent review of 2026-10-05, F-1). The history keeps
     its newest HISTORY_KEEP lines, so a refusal said there early in a long game is gone by its end, and a count read off
     the history is a count of the lines that survived -- a game of four house pilots runs from its first turn to its last
     inside one call, far past 300 lines. This is the match's own tally, saved with the room and never trimmed: `total`,
     and the first REFUSALS_SAID of them in full. `since` is the journal sequence the tally began at: 0 for a match counted
     from its first event. A room saved before the tally existed counts from where it is reopened and says so, rather
     than claiming a zero it never measured. */
  let refusals = {total: 0, since: 0, first: []};
  /* PLAYED IN SLICES WHERE A REQUEST'S TIME IS CAPPED (the review of 2026-10-05; Cloudflare gives a Durable Object 30 s of
     CPU per request or alarm). Between two people's decisions the AI seats play inside one call, and a room of AI seats
     alone plays a whole game in one: four house pilots ran 3 to 100 s to a game's end in the review. (At a table the
     game now ends once every person is out, `endWhenNoPerson`, so the long stretch left is the AI seats' turns between
     two people's decisions.)
     So a room given a `slice` stops after that many engine steps with nobody asked (`continuing`), saved like any other
     point of the game, and `resume` plays on from there. The engine and its pilots are deterministic and the house pilot
     keeps nothing between calls, so a game played in slices is the game played in one go -- its replay, which never
     stops, reaches the same journal. `driven` is the steps since a person was last asked, across slices, so a game that
     never asks anyone still stops at DRIVE_LIMIT. While the AI seats play on, a person can neither leave nor end the
     game: the tape would place that where a replay cannot (after the AI seats, not among them), so it is refused, with
     when to try again. Time is counted in steps, not milliseconds, because a Worker's clock does not move while it
     computes. */
  let continuing = false, driven = 0;
  /* ITEM 11: whether a person with nothing to do passes by itself, and what the step in progress has seen -- a pass
     the room made for someone, and anything anyone chose to do (a person's pass counts: they could have acted). */
  let passEmpty = false, step = {key: null, quiet: false, acted: false};
  let endAsks = false;
  /* The run of a person's taps for mana that may still be taken back (`untapMana`; rules/untap-mana.mjs), or null. */
  let untapMana = false, taken = null;
  let undoLastPlay = false, playBack = null, playBackSaved = false;
  let resultRecords = false;
  /* Each person's way of playing (`prefer`), by seat id: `stepByStep`, asked at every step of their own turn. */
  let prefs = {};
  /* Each seat's own turns so far, by seat id, and the game turn last counted (`at`); null in a room saved before they were
     counted, which says nothing rather than a wrong number. */
  let turnsOf = {at: 0};
  /* Rob, 2026-10-06: when every person is out, the game ends; the AI seats do not play it out. */
  let endWhenNoPerson = false;
  /* Rob, 2026-10-09: Resolve all is offered (`resolveAll`), and the seats that took it, each with the run it is passing
     through and how many passes it has left (`standing`). */
  let resolveAll = false, standing = {};
  /* Rob, 2026-10-09: the pass a person's cast or activation makes for them (`passAfterCast`), and the seat whose cast it
     waits on until priority comes back to them (`castBy`). */
  let passAfterCast = false, castBy = null;
  /* ROB-13: the stack passed for a person with no response (`passStack`), and the seat that cast holding priority, asked when
     it comes back to them (`heldBy`); the yields (`yieldTurn`), by seat id: the turn yielded and whose it is. */
  let passStack = false, heldBy = null, yieldable = false, yielding = {};
  /* Oct 21: Declare blockers made for a person with no creature that could block (`blocksNone`). */
  let blocksNone = false;
  /* Oct 21 (Rob's fullscreen notes): a land in any step of a person's own turn (`landAnyStep`, in the engine's state); a land
     put back in the hand while nothing has happened since (`takeBackLand`), with the game as it was before it (`landBack`:
     {player, objectId, name, before, taken, after}, saved under its own key, LAND_KEY, as it is a whole game); and a person
     asked about a spell or ability aimed at them (`askAimed`). */
  let landAnyStep = false, takeBackLand = false, landBack = null, landBackSaved = false, askAimed = false;
  /* A yield holds for the turn it was made in (the game's turn number: an extra turn is a new one), while that turn's player
     is in the game. One left over from a turn gone holds nothing, and the next yield of that seat replaces it. */
  const holds = (seatId) => {
    const y = yielding[seatId];
    return Boolean(y) && state.turn === y.turn && !state.players[y.active].lost;
  };
  /* Whether a seat may start one now: a person in the game, in an opponent's turn, whose player is in it too. */
  const mayYield = (seat) => yieldable && seats[seat].pilot !== "house" && !finished() && state.stepIndex !== undefined
    && state.activePlayer !== seat && !state.players[seat].lost && !state.players[state.activePlayer].lost;
  const nobodyLeft = () => seats.some((s) => s.pilot === "human") && seats.every((s, i) => s.pilot !== "human" || state.players[i].lost);
  const track = () => {
    const key = `${state.turn}:${state.stepIndex}`; if (key !== step.key) step = {key, quiet: false, acted: false};
    /* Whose turn this is of theirs (Rob, 2026-10-11: "it says we are on turn 3, but I only played one land" -- the game's
       turn 3, his second): each seat's own turns, counted as each begins. */
    if (turnsOf && state.turn !== turnsOf.at) {const seatId = seats[state.activePlayer]?.seatId; turnsOf = {...turnsOf, at: state.turn, [seatId]: (turnsOf[seatId] ?? 0) + 1};}
  };
  /* A step that passed by itself, said once; the quiet steps of a turn in a row share one line. */
  function quietly(phase) {
    const name = QUIET_STEP[phase] || String(phase).toLowerCase(), last = history[history.length - 1];
    if (last && last.mark === "quiet" && last.turn === state.turn) {last.steps = [...(last.steps || [last.text.replace(/: nothing to do$/, "")]), name]; last.text = `${last.steps.join(", ")}: nothing to do`; return;}
    history.push({turn: state.turn, text: `${name}: nothing to do`, mark: "quiet", steps: [name]});
    if (history.length > HISTORY_KEEP) history.splice(0, history.length - HISTORY_KEEP);
  }
  /* THE DECISION TAPE (M8): every input a person gives -- an answer, leaving, ending the game -- in order, numbered
     from the match's first. The journal is what the engine did; the tape is what people told it; with the seed the
     two replay the game (game/room/replay.mjs). House-pilot answers are not taped: the pilot is deterministic and
     answers again on replay. `tapeN` is the next number; `unsaved` waits for persist(). */
  let tapeN = 0, unsaved = [];
  /* THE TABLE'S EVENTS (events.mjs; ROB-77): the newest, kept for a seat that reconnects; where the change being shown began
     (`eventsMark`, a journal sequence), so a view carries what it did; the journal's next sequence; and the decision whose
     answer is being applied (`answering`), which each event it makes names. */
  let tableEvents = [], eventsMark = 0, eventsFloor = -1, nextSeq = 0, answering = null;
  const begin = () => {eventsMark = nextSeq;};
  const tape = (entry) => {unsaved.push({n: tapeN, turn: state ? state.turn : 0, ...entry}); tapeN += 1;};
  const note = (text) => {history.push({turn: state ? state.turn : 0, text}); if (history.length > HISTORY_KEEP) history.splice(0, history.length - HISTORY_KEEP);};
  const finished = () => Boolean(ended) || Boolean(gameOver(state));
  /* What a seat's pilot is made with: public card facts, and its seat's own deck list, setting and the match's seed. */
  let matchSeed = "";
  /* And whether they take what a choice they may answer with none is for (`pilotPicks`), as the match was launched. */
  let pilotPicks = false;
  let pilotProvocation = false;
  /* Match-scoped public damage only, persisted independently of the trimmed display history. A recreated pilot sees
     its public pressure summary; it never receives another player's cards or an unfiltered journal. */
  let pilotCombatMemory = null;
  const pilotView = (seat) => ({...projectFor(state, seat), ...(pilotProvocation?{pilotCombat: combatMemoryFor(pilotCombatMemory, seat, state.turn, seats.length)}:{})});
  const pilotMade = (seat) => makePilot({seat, cards: facts, deck: seats[seat].cards, level: seats[seat].level ?? null, persona: seats[seat].persona ?? null, seed: matchSeed, picks: pilotPicks, provocation:pilotProvocation});
  const pilotFor = (seat) => pilots[seat] || (pilots[seat] = pilotMade(seat));
  /* Whether the LLM seat asks for this decision (agent-pilot.mjs `consult`): never a seat that has left. */
  const consults = (seat, view, offer) => seats[seat].level === LLM && !leaving.includes(seat) && pilotFor(seat).consult?.(view, offer) === true;

  const write = (events) => {
    observePlay(playBack, events);
    const names = seats.map((s) => s.name);
    for (const e of events) {
      const id = journal.write(e.kind, e.data);
      if(pilotProvocation)pilotCombatMemory = rememberDamage(pilotCombatMemory, e, id, seats.length);
      nextSeq = Number(id.slice("event:".length)) + 1;
      addToHistory(history, e, names);
      const said = tableEvent(e, id);
      if (said) tableEvents.push(answering ? {...said, decisionId: answering} : said);
      if (said && said.kind === "lost") outs = [...outs, seats[said.player].seatId];
    }
    eventsFloor = keep(tableEvents, eventsFloor);
  };
  const seatIndex = (seatId) => seats.findIndex((s) => s.seatId === seatId);

  /* Run the game until a person has to decide, or it is over. AI seats are answered on the way. */
  /* A PILOT'S ANSWER THE RULES REFUSE IS THE PILOT'S MISTAKE, NEVER THE GAME'S END (the plan review's C2; probe R's seed
     11 stopped a table this way). The rules check an answer before they change anything, so a refused one leaves the game
     as it was: the refusal is said in the history, and the least legal answer is given instead -- nothing chosen where
     nothing need be, the first options up to the minimum, damage lethal-first. Were that refused too, the game really
     could not go on, and that is thrown as before. */
  function answerForPilot(seat, choice, a) {
    try {
      return resolveAwaiting(state, a.indices, a.amounts, rng, a);
    } catch (error) {
      note(`${seats[seat].name}'s answer to "${choice.title}" was refused: ${error.message}. The least answer was given instead.`);
      refusals.total += 1;
      if (refusals.first.length < REFUSALS_SAID) refusals.first.push({turn: state.turn, seatId: seats[seat].seatId, question: choice.title, reason: error.message});
      const least = leastAnswer(choice);
      return resolveAwaiting(state, least.indices, least.amounts, rng, least);
    }
  }

  function drive() {
    continuing = false;
    for (let steps = 0; ; steps += 1) {
      if (playBack && !playBack.pending) {
        const previous = playBack;
        playBack = finishPlay(state, playBack, rng.checkpoint());
        if (!playBack && previous.autoPass) castBy = previous.player;
      }
      if (finished()) {castDraft = null; pendingSeat = null; pendingActions = null; driven = 0; return;}
      if (driven >= DRIVE_LIMIT) throw new RoomError(500, "The game stopped moving: the engine took too many steps without a decision. Nothing further was applied.");
      if (steps >= slice) {continuing = true; pendingSeat = null; pendingActions = null; return;}
      driven += 1;
      if (state.stepIndex !== undefined && leaving.length) {
        for (const seat of leaving) if (!state.players[seat].lost) write(concede(state, seat, rng));
        leaving = [];
        continue;
      }
      if (endWhenNoPerson && state.stepIndex !== undefined && nobodyLeft()) {
        ended = {by: null, why: "no-person"};
        note("Every person is out of the game, so it ends here · not finished");
        pendingSeat = null; pendingActions = null; driven = 0;
        return;
      }
      if (state.stepIndex !== undefined) track();
      if (castDraft) {
        try {
          const choice = offerCastDraft(state, castDraft, draftOptions);
          controller.offer(choice); pendingSeat = castDraft.actor; pendingActions = null; driven = 0; return;
        } catch (error) {
          if (!error.castDraftExpired) throw error;
          castDraft = null;
        }
      }
      if (state.awaiting) {
        const seat = state.awaiting.player, choice = awaitingChoice(state);
        if (seats[seat].pilot === "house" || leaving.includes(seat)) {
          const seen = pilotView(seat);
          /* The LLM seat's close call: offered to the seat as to a person, for the table to answer through its model. */
          if (consults(seat, seen, {choice})) {controller.offer(choice); pendingSeat = seat; pendingActions = null; driven = 0; return;}
          const a = pilotFor(seat).answer(seen, choice);
          step.acted = true;
          write(answerForPilot(seat, choice, a));
          continue;
        }
        /* NO CREATURE THAT COULD BLOCK (`blocksNone`): Declare blockers with no block on offer has one answer, none, and it
           is no choice (CR 509.1a) -- against three AI seats, a press of No blocks for most of their attacks. The room
           gives it, as `passEmpty` passes a pass with nothing else to do, and the history says why. Not taped: a replay
           on the same pod gives it again. */
        if (blocksNone && choice.id.startsWith("declare-blockers:") && choice.options.length === 0) {
          note(`${seats[seat].name} has no creature that can block: no blockers`);
          write(resolveAwaiting(state, [], undefined, rng, {indices: []}));
          step.acted = true;
          continue;
        }
        /* In a run they let resolve: the same question as one already answered in it is answered the same way; the
           first of its kind is asked, saying the answer will go for the rest. Refused this time, it is asked. */
        const run = standing[seat];
        if (run) {
          const key = questionKey(choice), given = run.answers?.[key];
          if (given) {
            try {write(resolveAwaiting(state, given.indices, given.amounts, rng, given)); step.acted = true; driven = 0; continue;}
            catch {delete run.answers[key];}
          }
          run.asking = key;
          choice.forRun = true;
        }
        controller.offer(choice); pendingSeat = seat; pendingActions = null; driven = 0; return;
      }
      if (state.stepIndex === undefined) {write(beginGame(state)); continue;}
      if (state.priorityPlayer === null) {write(advance(state)); continue;}
      const seat = state.priorityPlayer;
      /* Having cast, the caster passes: a spell cast or an ability activated is on the stack at once (CR 601.2a, 602.2a)
         and its caster has priority first (CR 117.3c), so the pass is theirs, made by the cast. Priority first to anyone
         else -- the caster out of the game -- and nobody is passed for. */
      if (castBy !== null) {
        const caster = castBy;
        castBy = null;
        if (caster === seat && !mayUndoPlay(state, playBack, seat, rng.checkpoint())) {driven = 0; apply(seat, {kind: "pass"}, "cast"); continue;}
      }
      /* A seat that yielded the rest of this turn (`yieldTurn`) passes. Counted toward a hang as the room's own passes are:
         the yield was one decision, not one per pass. */
      if (holds(seats[seat].seatId)) {apply(seat, {kind: "pass"}, "yield"); continue;}
      /* Resolve all, taken: the seat passes while the same run is on top, as many times as it chose; each pass is a
         decision of theirs, so it is not counted toward a hang. Anything else on top, and they are asked again. A pass
         is always legal, so what else the seat could do is not worked out: on a board of hundreds that is most of the
         cost of each pass. */
      if (standing[seat] && seats[seat].pilot !== "house") {
        const run = standing[seat];
        if (run.left > 0 && runKey(state.stack[state.stack.length - 1]) === run.key) {run.left -= 1; driven = 0; apply(seat, {kind: "pass"}, "standing"); continue;}
        delete standing[seat];
      }
      const actions = legalActions(state, seat);
      /* The house pilot passes whatever it sees when nothing it would take is on offer (house-pilot.mjs, `passes`):
         its view of the board is not worked out for that, which on a big board is most of an AI seat's pass. */
      /* Whose turn and which step go with it, which everyone sees: L1 uses an ability only in its own main phase. */
      if (seats[seat].pilot === "house") {
        if (pilots[seat].passes?.(actions, state.stack.length, {ownTurn: state.activePlayer === seat, phase: state.phase})) {apply(seat, actions.find((a) => a.kind === "pass"), "pilot"); continue;}
        const seen = pilotView(seat);
        if (consults(seat, seen, {actions})) {
          controller.offer(priorityChoice(`priority:${state.turn}:${state.stepIndex}:${controller.revision}`, actions, state, seat));
          pendingSeat = seat; pendingActions = actions; driven = 0; return;
        }
        apply(seat, pilots[seat].choose(seen, actions), "pilot"); continue;
      }
      /* A PERSON'S OWN TURN ENDS ONLY WHEN THEY SAY SO (Rob, 2026-10-11: "passing the turn to the next player should always
         require player confirmation, never happen automatically"): their end step is asked, with nothing to do or not, its
         pass the end of their turn (priorityChoice, `endsTurn`). And one who plays step by step (`prefs`, Settings) is asked
         at every step of their own turn. */
      /* A land just tapped for mana, its mana unspent and nothing since, may be untapped (`untapMana`) -- and the person is not
         passed for while it may: tapped for the wrong mana, nothing they hold can be cast with it (rules/actions.mjs,
         nothingToDo), and that is when they would want the tap back. */
      const untaps = untappable(state, taken) ? taken.takes.map((t) => ({kind: "undo-mana", objectId: t.objectId, name: t.card})) : [];
      /* A land just played, nothing since, may go back to the hand (`takeBackLand`) -- and, as with a tap, they are asked while
         it may: "Next step" moves the game on and the land stays. */
      const undo = mayUndoPlay(state, playBack, seat, rng.checkpoint()) ? [{kind: "undo-play", objectId: playBack.objectId, name: playBack.name}] : [];
      const backs = !undo.length && landBack && landBack.player === seat && hashState(state) === landBack.after ? [{kind: "undo-land", objectId: landBack.objectId, name: landBack.name}] : [];
      /* One who cast holding priority (CR 117.3c) is asked when it comes back to them, nothing else to do or not (`passStack`). */
      const held = heldBy === seat;
      heldBy = null;
      /* Something aimed at them on top of the stack (`askAimed`): asked, to read it, response or not. */
      const aimed = askAimed && aimedAt(state, seat);
      const asked = held || aimed || undo.length > 0 || untaps.length > 0 || backs.length > 0 || (seat === state.activePlayer && ((endAsks && state.phase === "END_OF_TURN") || prefs[seats[seat].seatId]?.stepByStep === true));
      /* Skip my priority if no response possible, turned off (`askStack`, their way of playing): asked whenever anything is on the stack. */
      if (passEmpty && !asked && nothingToDo(state, seat, actions, {stack: passStack && prefs[seats[seat].seatId]?.askStack !== true})) {apply(seat, actions.find((a) => a.kind === "pass"), "room"); continue;}
      const run = resolveAll ? triggerRun(state.stack) : null;
      const offered = [...actions, ...(run ? [{kind: "resolve-all", key: run.key, n: run.n, name: run.name}] : []), ...untaps, ...backs, ...undo];
      controller.offer(priorityChoice(`priority:${state.turn}:${state.stepIndex}:${controller.revision}`, offered, state, seat));
      pendingSeat = seat; pendingActions = offered; driven = 0; return;
    }
  }
  /* Leaving or ending while the AI seats play on is refused, with when to try again (see `continuing`). */
  const notWhileContinuing = (what) => {
    if (continuing) throw new RoomError(409, `The AI players are still taking their turns (turn ${state.turn}). ${what} once they stop, in a few seconds.`, {continuing: true});
  };
  /* The open question, withdrawn: the controller keeps its receipts and moves its revision on, so an answer
     already in flight to the withdrawn question is refused as stale rather than applied to a changed board. */
  /* A taped answer stands in for the controller's: the question is closed and the revision moves on, but what was
     being asked (the seat, the actions offered) stays for the answer to be applied to. */
  function withdrawKeeping() {
    const point = controller.checkpoint();
    controller = createController({...point, pending: null, answered: null, revision: point.revision + 1});
  }
  function withdraw() {
    const point = controller.checkpoint();
    controller = createController({...point, pending: null, answered: null, revision: point.revision + 1});
    pendingSeat = null; pendingActions = null;
  }
  /* A person's answer applied: a priority action by its index, or the awaited decision resolved. Shared by `act`
     and by a replay of the tape, so the two cannot drift apart.
     AN ANSWER THE RULES REFUSE IS THE PERSON'S TO GIVE AGAIN (AGENTS.md, "refused, with instructions"). The envelope
     (the controller) checks an answer's shape; the rules check what it means -- creatures that cannot pay for a convoke
     (rules/actions.mjs, convoked), a target the spell can no longer have -- and say what is wrong and what to do
     instead. That refusal is the person's, a RoomError (422) in the engine's own words; the caller puts the room back
     as it was (`act`, `restore`). */
  function answerWith(seat, answer, decisionId = null) {
    answering = decisionId;
    try {
      if (answer.back === true && !castDraft) throw new RoomError(422, "Back is available only in an action's mode and target stages. Use Cancel when the pending action can still be abandoned.", {refused: true});
      if (pendingActions && answer.cancel === true) throw new RoomError(422, "No action proposal is pending. Choose an action or pass priority.", {refused: true});
      if (pendingActions) {
        const action = pendingActions[answer.indices[0]];
        pendingActions = null;
        if (answer.staged === true) castDraft = action.kind === "cast"
          ? beginCastDraft(state, seat, action, `${matchId}/cast:${tapeN}/${action.objectId}`)
          : beginActionDraft(state, seat, action, `${matchId}/activate:${tapeN}/${action.objectId}/${action.abilityId}`);
        else apply(seat, action, "person", answer.hold === true);
      } else if (castDraft) {
        const result = answerCastDraft(state, castDraft, answer, draftOptions);
        castDraft = result.draft;
        if (result.action) apply(seat, result.action, "person", answer.hold === true);
      } else {
        const cancelledProposal = answer.cancel === true && awaitingChoice(state)?.cancellation?.kind === "abandon-action";
        step.acted = true; write(resolveAwaiting(state, answer.indices, answer.amounts, rng, answer));
        if (cancelledProposal) {castBy = null; heldBy = null; playBack = null;}
        if (playBack?.pending) {
          const previous = playBack;
          playBack = finishPlay(state, playBack, rng.checkpoint());
          if (!playBack && previous.autoPass) castBy = previous.player;
        }
        /* Asked in a run they let resolve: the answer goes for the same question in the rest of it. */
        const run = standing[seat];
        if (run?.asking) {
          run.answers = {...run.answers, [run.asking]: {indices: answer.indices ?? [], ...(answer.amounts ? {amounts: answer.amounts} : {}), ...(answer.value !== undefined ? {value: answer.value} : {})}};
          delete run.asking;
        }
      }
    } catch (error) {
      if (error instanceof RoomError) throw error;
      throw new RoomError(422, error.message, {refused: true});
    } finally {
      answering = null;
    }
    pendingSeat = null;
    drive();
  }
  /* THE ROOM PUT BACK AS IT WAS SAVED (its own checkpoint, `persist`; its own restore, `open`). Every call that changes the
     game saves before it returns, so what storage holds when a person's input arrives is the room as it stood: an input
     that fails part-way -- an answer the rules refuse, an engine failure in the AI seats' play after it -- is undone by
     reading that back. Nothing of it stays: not the state, the journal's events, the history's lines, the tape entry or
     the receipt; the question is pending again, at the revision the person answered. */
  async function restore() {
    const record = JSON.parse(await storage.get(ROOM_KEY) || "null");
    if (!record || record.schema !== ROOM_SCHEMA) throw new RoomError(404, "There is no game at this table.");
    const point = await store.latestCheckpoint();
    if (!point || point.sequence !== record.sequence) throw new RoomError(500, "This table's saved game does not match its record, so it was not resumed.");
    passEmpty = record.passEmpty === true; step = record.step || {key: null, quiet: false, acted: false}; prefs = record.prefs || {}; turnsOf = record.turnsOf || null;
    resolveAll = record.resolveAll === true; standing = record.standing || {}; endAsks = record.endAsks === true;
    untapMana = record.untapMana === true; taken = record.taken ?? null;
    undoLastPlay = record.undoLastPlay === true; resultRecords = record.resultRecords === true;
    playBack = undoLastPlay && record.playBack === true ? JSON.parse(await storage.get(PLAY_KEY) || "null") : null;
    playBackSaved = playBack !== null;
    passAfterCast = record.passAfterCast === true; castBy = record.castBy ?? null;
    passStack = record.passStack === true; heldBy = record.heldBy ?? null; yieldable = record.yieldTurn === true; yielding = record.yielding || {};
    blocksNone = record.blocksNone === true;
    landAnyStep = record.landAnyStep === true; askAimed = record.askAimed === true; takeBackLand = record.takeBackLand === true;
    landBack = takeBackLand && record.landBack === true ? JSON.parse(await storage.get(LAND_KEY) || "null") : null;
    landBackSaved = landBack !== null;
    if (landBack) landBack.saved = true;
    tableEvents = record.events || []; eventsMark = record.eventsMark ?? 0; eventsFloor = record.eventsFloor ?? -1;
    pilotCombatMemory = record.pilotCombatMemory ?? null;
    seats = record.seats; pendingSeat = record.pendingSeat; pendingActions = record.pendingActions; receipts = record.receipts || []; leaving = record.leaving || []; departures = record.departures || {}; ended = record.ended || null; outs = record.outs || []; history = record.history || [];
    refusals = record.refusals || {total: 0, since: point.sequence, first: []};
    continuing = record.continuing === true; driven = record.driven || 0; endWhenNoPerson = record.endWhenNoPerson === true;
    seated = record.candidates === true;
    pilotPicks = record.pilotPicks === true;
    pilotProvocation = record.pilotProvocation === true;
    castDraft = record.castDraft ?? null;
    state = structuredClone(point.state);
    rng = createRng(point.seed, point.rng);
    journal = createJournal({matchId, seed: point.seed}, point);
    nextSeq = point.sequence;
    controller = createController(record.controller);
    matchSeed = point.seed;
    pilots = seats.map((s, seat) => (s.pilot === "house" ? pilotMade(seat) : null));
    saved = 0; unsaved = [];
    tapeN = (await store.readTape()).length;
  }
  /* WHY NOT (Linear ROB-24): while a seat holds priority, each card of its own hand and command zone that nothing offered
     plays says why, in words (rules/actions.mjs, whyNot): the board shows it where it would show what the card can do. Its
     own cards only, and only the reason -- nothing another seat could not already see. */
  function whyNotFor(projected, seat, pending) {
    if (!pending || pending.kind !== "priority" || state.priorityPlayer !== seat) return projected;
    const actions = legalActions(state, seat), zones = projected.players[seat]?.zones ?? {};
    for (const zone of [zones.Hand, zones.Command]) for (const card of zone?.cards ?? []) {
      const why = whyNot(state, seat, card.cardId, actions);
      if (why) card.why = why;
    }
    return projected;
  }
  /* A person's input that failed part-way, undone (`restore`) and refused: the rules' refusal as they said it, and any other
     failure -- the engine's, in the play that followed -- as the room's, with what the person can still do. */
  async function undone(error) {
    await restore();
    if (error instanceof RoomError) return error;
    return new RoomError(500, `The rules engine failed after that (${error.message}), so it was not taken: nothing changed, and the game is where it was. Try another choice, or end the game.`);
  }
  /* `by`: a person, the house pilot, the room passing for a person with nothing to do (item 11), for one who chose
     Resolve all ("standing"), for one whose cast passes (`passAfterCast`, "cast"), or for one who yielded the turn
     ("yield"); `hold`, a person casting who holds priority. */
  function apply(seat, action, by = "person", hold = false) {
    if (action.kind === "undo-play") {
      const previous = playBack;
      state = undoPlay(state, previous, seat, rng.checkpoint());
      playBack = null; landBack = null; taken = null; castBy = null;
      note(`${seats[seat].name}: ${previous.name} undone`);
      return;
    }
    playBack = null;
    /* The land put back (`takeBackLand`): the game exactly as it was before it was played -- the land in the hand, the land
       drop unused, any taps before it still to be taken back -- checked first, as an untap is. */
    if (action.kind === "undo-land") {
      if (!landBack || landBack.player !== seat || hashState(state) !== landBack.after) throw new RoomError(422, "That land can't go back to your hand now: something has happened since you played it.", {refused: true});
      step.acted = true;
      state = landBack.before;
      taken = landBack.taken ?? null;
      landBack = null;
      note(`${seats[seat].name} took back ${action.name}: it is in their hand again, and their land drop unused`);
      return;
    }
    landBack = null;
    if (action.kind === "undo-mana") {
      step.acted = true;
      const back = untapTaken(state, taken, action.objectId);
      taken = back.run;
      write(back.events);
      note(`${seats[seat].name} untapped ${action.name}, its mana unspent`);
      return;
    }
    if (action.kind === "resolve-all") {
      standing[seat] = {key: action.key, left: action.n - 1, answers: {}};
      note(`${seats[seat].name} let ${action.n} ${action.name} triggers resolve`);
      return apply(seat, {kind: "pass"}, by);
    }
    const run = taken;
    if (action.kind === "pass") {
      if (by === "room") step.quiet = true; else if (by === "person") step.acted = true;
      /* The game's random stream, for what resolves ("then shuffle", "in a random order"): the room's own, so a replay
         of the tape draws the same (game/room/replay.mjs). */
      const result = passPriority(state, null, rng);
      write(result.events);
      if (result.outcome === "step-ends") {
        if (step.quiet && !step.acted) quietly(state.phase);
        write(advance(state));
      }
    } else {
      step.acted = true;
      /* A tap for mana, kept to be taken back while nothing else happens (`untapMana`): a person's only is ever offered. */
      const was = untapMana && action.kind === "activate-mana" ? {mark: beforeTap(state), run} : null;
      /* A person's land, kept to be put back while nothing else happens (`takeBackLand`): the game as it was, and the land as
         it now is on the battlefield. */
      const before = takeBackLand && by === "person" && action.kind === "play-land" ? structuredClone(state) : null;
      const play = undoLastPlay && by === "person" ? beforePlay(state, seat, action, rng.checkpoint(), run) : null;
      if (play) {play.autoPass = passAfterCast && !hold && action.kind === "cast"; playBack = play;}
      const events = applyAction(state, seat, action);
      write(events);
      if (playBack) playBack = finishPlay(state, playBack, rng.checkpoint());
      taken = was ? tapTaken(state, seat, action, was.mark, events, was.run) : null;
      if (before) {
        const there = new Set(before.zones.battlefield), id = state.zones.battlefield.find((x) => !there.has(x) && state.objects[x]?.controller === seat);
        /* Not one that asked anything or put anything on the stack as it entered (a landfall trigger): that has happened since. */
        if (id !== undefined && !state.awaiting && state.stack.length === before.stack.length) landBack = {player: seat, objectId: id, name: state.objects[id].card, before, taken: run, after: hashState(state)};
      }
      if (passAfterCast && by === "person" && !hold && !playBack && (action.kind === "cast" || action.kind === "activate")) castBy = seat;
      if (passStack && by === "person" && hold && (action.kind === "cast" || action.kind === "activate")) heldBy = seat;
    }
  }

  /* Everything since the last save, then the checkpoint, then the room's own record (which names it). */
  async function persist() {
    if (playBack) {await storage.put(PLAY_KEY, JSON.stringify(playBack)); playBackSaved = true;}
    else if (playBackSaved) {await storage.delete(PLAY_KEY); playBackSaved = false;}
    /* The land that may go back (`landBack`): a whole game, so under its own key, written when there is one and gone when not. */
    if (landBack && landBack.saved !== true) {await storage.put(LAND_KEY, JSON.stringify(landBack)); landBack.saved = true; landBackSaved = true;}
    else if (!landBack && landBackSaved) {await storage.delete(LAND_KEY); landBackSaved = false;}
    const fresh = journal.events(saved);
    await store.appendEvents(fresh);
    saved += fresh.length;
    await store.appendTape(unsaved);
    unsaved = [];
    const point = journal.checkpoint(state, rng.checkpoint());
    await store.saveCheckpoint(point);
    await store.pruneCheckpoints();
    await storage.put(ROOM_KEY, JSON.stringify({schema: ROOM_SCHEMA, protocol: ROOM_PROTOCOL, matchId, seats, pendingSeat, pendingActions, sequence: point.sequence, controller: controller.checkpoint(), receipts, leaving, departures, ended, ...(outs.length ? {outs} : {}), history, refusals, ...(castDraft ? {castDraft} : {}), ...(pilotProvocation ? {pilotProvocation: true} : {}), ...(pilotCombatMemory?.lastEvent > 0 ? {pilotCombatMemory} : {}), ...(continuing ? {continuing, driven} : {}), ...(endWhenNoPerson ? {endWhenNoPerson} : {}), ...(passEmpty ? {passEmpty, step} : {}), ...(resolveAll ? {resolveAll, standing} : {}), ...(passAfterCast ? {passAfterCast, castBy} : {}), ...(endAsks ? {endAsks} : {}), ...(untapMana ? {untapMana, taken} : {}), ...(undoLastPlay ? {undoLastPlay, playBack: playBack !== null} : {}), ...(resultRecords ? {resultRecords: true} : {}), ...(Object.keys(prefs).length ? {prefs} : {}), ...(turnsOf ? {turnsOf} : {}), ...(passStack ? {passStack, heldBy} : {}), ...(blocksNone ? {blocksNone} : {}), ...(landAnyStep ? {landAnyStep} : {}), ...(takeBackLand ? {takeBackLand, landBack: landBack !== null} : {}), ...(askAimed ? {askAimed} : {}), ...(yieldable ? {yieldTurn: true, yielding} : {}), ...(tableEvents.length ? {events: tableEvents, eventsMark, eventsFloor} : {}), ...(seated ? {candidates: true} : {}), ...(pilotPicks ? {pilotPicks: true} : {})}));
  }

  const api = {
    matchId,
    get seats() {return seats.map(({seatId, name, pilot, level, persona}) => ({seatId, name, pilot, ...(level ? {level} : {}), ...(persona ? {persona} : {})}));},
    get status() {return finished() ? "finished" : "playing";},
    get revision() {return controller.revision;},
    get waitingOn() {return pendingSeat === null ? null : seats[pendingSeat].seatId;},
    /** Every line of the table's history the room keeps (a view shows the newest): public, the same for every seat. */
    get history() {return history.map(({turn, text, mark}) => ({turn, text, ...(mark ? {mark} : {})}));},
    /** The match's tally of refused pilot answers, whatever the history still holds: `{total, since, first}`. */
    get refusals() {return structuredClone(refusals);},
    /** True when a slice ran out with nobody asked: `resume` plays on. */
    get continuing() {return continuing && !finished();},

    async start(pod, seed) {
      seated = pod?.candidates === true;
      seats = readPod(pod, look);
      if (typeof seed !== "string" || !seed) throw new RoomError(400, "A match needs its seed.");
      begin();
      if (await storage.get(ROOM_KEY) !== null) throw new RoomError(409, "This table already has a game.");
      /* The table's starting life (its host's rule), kept with the match so a replay deals the same game. */
      const startingLife = pod && pod.startingLife !== undefined ? pod.startingLife : undefined;
      /* And whether the starting player of a two-player game skips their first draw step (CR 103.8a), which the host may
         turn off: only a pod that turns it off says so, and the match keeps it the same way. */
      const rules = {...(startingLife !== undefined ? {startingLife} : {}), ...(pod && pod.skipFirstDraw === false ? {skipFirstDraw: false} : {})};
      const beats = {...(pod && pod.drawBeat === true ? {drawBeat: true} : {}), ...(pod && pod.passEmpty === true ? {passEmpty: true} : {}),
        ...(pod && pod.endWhenNoPerson === true ? {endWhenNoPerson: true} : {}), ...(pod && pod.resolveAll === true ? {resolveAll: true} : {}),
        ...(pod && pod.passAfterCast === true ? {passAfterCast: true} : {}), ...(pod && pod.endAsks === true ? {endAsks: true} : {}),
        ...(pod && pod.untapMana === true ? {untapMana: true} : {}), ...(pod?.resultRecords === true ? {resultRecords: true} : {}),
        ...((pod?.houseRules?.undoLastPlay === true || pod?.undoLastPlay === true) ? {houseRules: {undoLastPlay: true}} : {}),
        /* And whether its AI seats take what a choice they may answer with none is for (`pilotPicks`), kept the same way. */
        ...(pod && pod.pilotPicks === true ? {pilotPicks: true} : {}),
        ...(pod?.pilotProvocation === true ? {pilotProvocation: true} : {}),
        ...(pod && pod.passStack === true ? {passStack: true} : {}), ...(pod && pod.yieldTurn === true ? {yieldTurn: true} : {}),
        ...(pod && pod.blocksNone === true ? {blocksNone: true} : {}),
        ...(pod && pod.keepStepMana === true ? {keepStepMana: true} : {}),
        ...(pod && pod.landAnyStep === true ? {landAnyStep: true} : {}), ...(pod && pod.takeBackLand === true ? {takeBackLand: true} : {}),
        ...(pod && pod.askAimed === true ? {askAimed: true} : {})};
      passEmpty = beats.passEmpty === true; endWhenNoPerson = beats.endWhenNoPerson === true; resolveAll = beats.resolveAll === true; passAfterCast = beats.passAfterCast === true; endAsks = beats.endAsks === true; untapMana = beats.untapMana === true; undoLastPlay = beats.houseRules?.undoLastPlay === true; resultRecords = beats.resultRecords === true;
      passStack = beats.passStack === true; yieldable = beats.yieldTurn === true; blocksNone = beats.blocksNone === true;
      landAnyStep = beats.landAnyStep === true; takeBackLand = beats.takeBackLand === true; askAimed = beats.askAimed === true;
      /* The people at the table, by seat, who may play a land in any step of their own turn (`landAnyStep`). */
      const anyStep = landAnyStep ? {landAnyStep: seats.flatMap((s, seat) => (s.pilot === "house" ? [] : [seat]))} : {};
      /* And the people whose mana made in their upkeep or draw step stays for the turn (`keepStepMana`, rules/turn.mjs; Rob, 2026-10-28): a house rule, for people. */
      const keepMana = beats.keepStepMana === true ? {keepStepMana: seats.flatMap((s, seat) => (s.pilot !== "house" ? [seat] : []))} : {};
      /* And whether a cast tapped for tops up floating mana and taps a source for all it makes (`pooledTaps`, rules/actions.mjs):
         a match launched before it lacks the key, and so offers what it offered then. */
      const pooled = {...(pod && pod.pooledTaps === true ? {pooledTaps: true} : {}), ...(pod && pod.xTaps === true ? {xTaps: true} : {}), ...(pod?.preparedTaps === true ? {preparedTaps: true} : {}), ...(pod?.sourceChoices === true ? {sourceChoices: true} : {}), ...(pod?.effectPlayVersion===1?{effectPlayVersion:1}:{})};
      pilotPicks = beats.pilotPicks === true;
      pilotProvocation = beats.pilotProvocation === true;
      try {state = createState({matchId, seed, players: seats.map((s) => ({name: s.name})), ...rules, ...(beats.drawBeat ? {drawBeat: true} : {}), ...pooled, ...anyStep, ...keepMana});}
      catch (error) {throw new RoomError(400, error.message);}
      seats.forEach((s, seat) => {
        for (const name of s.commander) addObject(state, {...look(name), card: name, owner: seat, controller: seat, commander: true}, "command", seat);
        for (const name of s.cards) addObject(state, {...look(name), card: name, owner: seat, controller: seat}, "library", seat);
      });
      rng = createRng(seed);
      journal = createJournal({matchId, seed});
      controller = createController();
      matchSeed = seed;
      pilots = seats.map((s, seat) => (s.pilot === "house" ? pilotMade(seat) : null));
      await store.saveMatch({pod: {seats, ...rules, ...beats, ...pooled, ...(seated ? {candidates: true} : {})}, seed});
      write(beginMulligans(state, rng));
      drive();
      await persist();
      return api;
    },

    async open() {
      await restore();
      if (castDraft) {
        let changed = false;
        try {const choice = castDraftChoice(state, castDraft, draftOptions); changed = !controller.pending || controller.pending.id !== choice.id || castDraftSignature(choice) !== castDraft.offeredSignature;}
        catch (error) {if (!error.castDraftExpired) throw error; castDraft = null; changed = true;}
        if (changed) {withdraw(); drive(); await persist();}
      }
      return api;
    },

    /** What one seat may see: its projection, and the decision it is being asked, if it is the one asked. */
    view(seatId, {after} = {}) {
      const seat = seatIndex(seatId);
      if (seat < 0) throw new RoomError(403, "That seat is not at this table.");
      const mine = pendingSeat === seat && controller.pending;
      const over = ended ? {winner: null, reason: ended.why === "no-person" ? NO_PERSON_REASON : "ended early"} : gameOver(state);
      const canUndo = Boolean(mine && mayUndoPlay(state, playBack, seat, rng.checkpoint()));
      const projected = whyNotFor(projectFor(state, seat), seat, mine ? controller.pending : null);
      if (canUndo) {
        for (const player of projected.players) for (const zone of Object.values(player.zones ?? {}))
          for (const card of zone.cards ?? []) if (card.cardId === playBack.objectId) card.undoable = true;
        for (const entry of projected.stack) if (entry.cardId === playBack.objectId || entry.objectId === playBack.objectId) entry.undoable = true;
      }
      return {
        schema: VIEW_SCHEMA, protocol: ROOM_PROTOCOL, matchId, seatId, seat,
        revision: controller.revision,
        status: over ? "finished" : "playing",
        ...(resultRecords ? {resultRecordExpected: true} : {}),
        result: over ? {winner: over.winner === null ? null : seats[over.winner].seatId, reason: over.reason, ...(ended ? {endedBy: ended.by} : {}),
          /* And how it ended, as data (ending.mjs; Linear ROB-166): who lost and why, beside the words, which stay as they were. */
          ending: endingOf({over, ended, seats, players: state.players, departures, outs})} : null,
        departures: structuredClone(departures),
        seats: api.seats,
        waitingOn: pendingSeat === null ? null : seats[pendingSeat].seatId,
        decision: mine ? describeDecision(state, combatWords(state, structuredClone(controller.pending)), pendingActions, projected) : null,
        state: projected,
        /* What this seat's permanents could tap for (actions.mjs, manaSources): the board's Mana Pool. */
        manaSources: deriving(state, () => manaSources(state, seat)),
        ...(canUndo ? {canUndo: true, undoablePlay: {cardId: playBack.objectId, name: playBack.name, kind: playBack.kind}} : {}),
        history: history.slice(-HISTORY_VIEW).map(({turn, text, mark}) => ({turn, text, ...(mark ? {mark} : {})})),
        /* What happened, as this seat may know it (events.mjs): the change this view shows -- or, asked with `after` (the last
           event id the seat has), everything since; `eventsReset` when that is older than the room keeps. */
        ...((said) => ({eventsSchema: EVENTS_SCHEMA, events: said.events, ...(said.reset ? {eventsReset: true} : {})}))(
          eventsFor(tableEvents, seat, {...(after !== undefined && after !== null ? {after, floor: eventsFloor} : {from: `event:${eventsMark}`}),
            /* A card drawn, while it is still in a hand: whose, events.mjs's `forSeat` says. */
            knows: (id) => state.objects[id]?.zone === "hand"})),
        ...(api.continuing ? {continuing: true} : {}),
        /* This seat's own way of playing, as the room holds it (prefer). */
        ...(prefs[seatId]?.stepByStep === true ? {stepByStep: true} : {}),
        /* And whether they are asked whenever anything is on the stack (`askStack`: Skip my priority if no response possible, off). */
        ...(prefs[seatId]?.askStack === true ? {askStack: true} : {}),
        /* Its yield (`yieldTurn`), its own and no one else's: on, or one it may start now. */
        ...(holds(seatId) ? {yielding: true} : mayYield(seat) ? {mayYield: true} : {}),
        /* Which of its own turns this is, when the turn is this seat's (the board says "your 2nd"). */
        ...(turnsOf && state.activePlayer === seat && turnsOf[seatId] ? {yourTurn: turnsOf[seatId]} : {}),
      };
    },

    /**
     * WHAT A SPECTATOR MAY SEE (the lounge's Watch, docs/ui-lane/lounge-contract.md §4): the game as nobody in it sees it. Built
     * from the public projection alone (projection.mjs, viewer null: no hand, no library, a count each) and listed field by
     * field, so a field added to a seat's view later is not a field a watcher gets by accident: no decision, no mana
     * sources, no undo, no way of playing, and the events with no card a seat was told in secret.
     */
    watch({after} = {}) {
      const over = ended ? {winner: null, reason: ended.why === "no-person" ? NO_PERSON_REASON : "ended early"} : gameOver(state);
      return {
        schema: VIEW_SCHEMA, protocol: ROOM_PROTOCOL, matchId, seatId: null, seat: null, spectator: true,
        revision: controller.revision,
        status: over ? "finished" : "playing",
        result: over ? {winner: over.winner === null ? null : seats[over.winner].seatId, reason: over.reason, ...(ended ? {endedBy: ended.by} : {}),
          ending: endingOf({over, ended, seats, players: state.players, departures, outs})} : null,
        departures: structuredClone(departures),
        seats: api.seats,
        waitingOn: pendingSeat === null ? null : seats[pendingSeat].seatId,
        decision: null,
        state: projectFor(state, null),
        manaSources: [],
        history: history.slice(-HISTORY_VIEW).map(({turn, text, mark}) => ({turn, text, ...(mark ? {mark} : {})})),
        ...((said) => ({eventsSchema: EVENTS_SCHEMA, events: said.events, ...(said.reset ? {eventsReset: true} : {})}))(
          eventsFor(tableEvents, null, {...(after !== undefined && after !== null ? {after, floor: eventsFloor} : {from: `event:${eventsMark}`}), knows: () => false})),
        ...(api.continuing ? {continuing: true} : {}),
      };
    },

    /** Play on from where a slice stopped, to the next person's decision, the end, or the next slice. */
    async resume() {
      if (!api.continuing) return api;
      begin();
      drive();
      await persist();
      return api;
    },

    /**
     * A FINGERPRINT OF THE GAME, never the game: the state's hash, how many events the journal holds, the
     * tape's length (the stored journal itself is compared by game/room/replay.mjs), and how many pilot answers the rules
     * refused (F-1: a replay that reaches the same state by another road is not the same game). Two rooms with the same fingerprint are the same game, which is how a replay is proved; nothing about
     * a hidden card can be read back out of it.
     */
    fingerprint() {
      return {hash: hashState(state), events: journal.checkpoint(state, rng.checkpoint()).sequence, tape: tapeN, refused: refusals.total, status: finished() ? "finished" : "playing"};
    },

    /**
     * One tape entry, applied as the person gave it (game/room/replay.mjs). An answer must come from the seat the
     * room is waiting on; otherwise the tape and this game have parted, and that is said, with where.
     */
    async replay(entry) {
      if (entry.kind === "leave") return api.leave(entry.seat, entry.why);
      if (entry.kind === "end") return api.end(entry.seat);
      if (entry.kind === "prefer") return api.prefer(entry.seat, entry);
      if (entry.kind === "yield") return api.yieldTurn(entry.seat, entry);
      if (entry.kind !== "answer") throw new RoomError(400, `Tape entry ${entry.n} is not an answer, a leave, an end, a way of playing or a yield.`);
      const seat = seatIndex(entry.seat);
      if (seat < 0 || pendingSeat !== seat) throw new RoomError(409, `The tape parts from the game at entry ${entry.n}: it answers for ${entry.seat}, and the game is waiting on ${pendingSeat === null ? "no one" : seats[pendingSeat].seatId}.`);
      const decisionId = controller.pending?.id ?? null;
      begin();
      withdrawKeeping();
      tape({kind: "answer", seat: entry.seat, answer: entry.answer});
      answerWith(seat, entry.answer, decisionId);
      await persist();
      return api;
    },

    /**
     * A seat leaves the game in play: "conceded" when they choose to, "timed-out" when a dropped player's
     * time ran out. Whatever was being asked is withdrawn and asked afresh, because the board it was asked
     * about has changed; the engine concedes them (CR 104.3a) and play goes on without them.
     */
    /**
     * A person's way of playing (Rob, 2026-10-11): `stepByStep`, to be asked at every step of their own turn rather than
     * have a step with nothing to do pass itself. On the tape, as a leave is, so a replay asks where the game asked; the
     * same as it was, it changes nothing and is not taped. It takes effect from the next step on.
     */
    /* And `askStack` (Oct 21): Skip my priority if no response possible, turned off -- asked whenever anything is on the
       stack. Left out, it stays as it was, so a tape entry from before it, or a board that does not send it, changes nothing. */
    async prefer(seatId, {stepByStep, askStack} = {}) {
      const seat = seatIndex(seatId);
      if (seat < 0) throw new RoomError(403, "That seat is not at this table.");
      if (seats[seat].pilot === "house") throw new RoomError(409, "An AI seat has no way of playing to set.");
      if (finished()) throw new RoomError(409, "This game is over.");
      const on = stepByStep === true, was = prefs[seatId] || {};
      const ask = typeof askStack === "boolean" ? askStack : was.askStack === true;
      if ((was.stepByStep === true) === on && (was.askStack === true) === ask) return api;
      notWhileContinuing("Your way of playing can be changed");
      prefs = {...prefs, [seatId]: {stepByStep: on, ...(ask ? {askStack: true} : {})}};
      tape({kind: "prefer", seat: seatId, stepByStep: on, ...(typeof askStack === "boolean" ? {askStack: ask} : {})});
      await persist();
      return api;
    },

    /**
     * YIELD TURN (Linear ROB-13; `yieldTurn`): `on`, the rest of this opponent's turn passed for the seat -- each priority
     * of theirs in it, whatever they hold -- and not `on`, Stop yielding. On the tape, as a way of playing is; the same as
     * it was, it changes nothing and is not taped. Asked for priority as they yield, that priority is passed at once; a
     * decision the rules ask of them stays theirs to answer, and the yield holds on after it. Private: no history line.
     */
    async yieldTurn(seatId, {on} = {}) {
      const seat = seatIndex(seatId);
      if (seat < 0) throw new RoomError(403, "That seat is not at this table.");
      if (seats[seat].pilot === "house") throw new RoomError(409, "An AI seat does not yield.");
      if (finished()) throw new RoomError(409, "This game is over.");
      if (!yieldable) throw new RoomError(409, "This game was started before Yield turn, so it plays as it did: you are asked for each priority.");
      const want = on === true;
      if (holds(seatId) === want) return api;
      if (want && !mayYield(seat)) throw new RoomError(409, state.stepIndex === undefined ? "The game has not begun: there is no turn to yield yet."
        : state.activePlayer === seat ? "It is your own turn: Yield turn passes for you in an opponent's turn only."
        : "You can't yield now: you are out of the game, or this turn's player is.");
      notWhileContinuing(want ? "You can yield the turn" : "You can stop yielding");
      begin();
      if (want) yielding = {...yielding, [seatId]: {turn: state.turn, active: state.activePlayer}};
      else {const {[seatId]: _gone, ...rest} = yielding; yielding = rest;}
      tape({kind: "yield", seat: seatId, on: want});
      if (want && pendingSeat === seat && pendingActions) {
        withdraw();
        try {drive();} catch (error) {throw await undone(error);}
      }
      await persist();
      return api;
    },

    async leave(seatId, why = "conceded") {
      const seat = seatIndex(seatId);
      if (seat < 0) throw new RoomError(403, "That seat is not at this table.");
      if (seats[seat].pilot === "house") throw new RoomError(409, "An AI seat does not leave a game.");
      if (!["conceded", "timed-out"].includes(why)) throw new RoomError(400, "A seat leaves by conceding or by timing out.");
      if (finished()) throw new RoomError(409, "This game is over.");
      if (departures[seatId]) throw new RoomError(409, "That seat has already left the game.");
      notWhileContinuing(why === "timed-out" ? "Their time runs out" : "You can leave the game");
      begin();
      withdraw();
      departures[seatId] = why;
      tape({kind: "leave", seat: seatId, why});
      note(why === "timed-out" ? `${seats[seat].name} ran out of time · not finished` : `${seats[seat].name} conceded`);
      leaving = [...leaving, seat];
      delete standing[seat];
      /* Conceded in the engine, and the AI seats play on: should that fail, they have not left, and nothing changed. */
      try {drive();} catch (error) {throw await undone(error);}
      await persist();
      return api;
    },

    /** Someone at the table ends the game for everyone. Nothing more is played, and the record says it ended early. */
    async end(seatId) {
      const seat = seatIndex(seatId);
      if (seat < 0) throw new RoomError(403, "That seat is not at this table.");
      if (finished()) throw new RoomError(409, "This game is over.");
      notWhileContinuing("You can end the game");
      begin();
      withdraw();
      ended = {by: seatId};
      tape({kind: "end", seat: seatId});
      note(`${seats[seat].name} ended the game for everyone · not finished`);
      pendingSeat = null; pendingActions = null;
      await persist();
      return api;
    },

    /**
     * A seat's answer to the decision it was asked: `{actionId, revision, kind, choiceId, indices?, ...}`, the
     * §12.1 action envelope. A retry with the same action id returns the same receipt and applies nothing. An answer
     * the rules refuse is refused (422, in the rules' words) with nothing changed, and may be given again otherwise.
     */
    /**
     * WHAT THE SEAT'S OWN PILOT WOULD ANSWER to the decision it is being asked, as a person's answer (`{indices}`): the LLM
     * seat's when its model cannot answer (the game's cap reached, a failure, an option that was not offered). The table
     * gives it through `act`, so it is on the tape like any other answer and a replay does not ask again.
     */
    houseAnswer(seatId) {
      const seat = seatIndex(seatId);
      if (seat < 0 || seats[seat].pilot !== "house") throw new RoomError(403, "That is not an AI seat at this table.");
      if (pendingSeat !== seat || !controller.pending) throw new RoomError(409, "That seat is not being asked anything.");
      const pilot = pilotFor(seat), seen = pilotView(seat);
      if (pendingActions) {
        const chosen = pilot.choose(seen, pendingActions);
        return {indices: [Math.max(0, pendingActions.indexOf(chosen))]};
      }
      const given = pilot.answer(seen, castDraft ? castDraftChoice(state, castDraft, draftOptions) : awaitingChoice(state));
      return {indices: given.indices ?? [], ...(given.amounts ? {amounts: given.amounts} : {}), ...(given.value !== undefined ? {value: given.value} : {}), ...(given.cancel ? {cancel: true} : {})};
    },

    /**
     * WHAT THE SEAT'S PILOT WORKED OUT for the decision it is being asked (the Veteran's brief reads it; game/room/agent-brief.mjs):
     * the table's threats, what is urgent on it, the creatures kept home, its top plans as this decision's own option indices, and the
     * seat's own persona. Read-only: it answers nothing and changes nothing. Null for a pilot that does not explain.
     */
    analysis(seatId) {
      const seat = seatIndex(seatId);
      if (seat < 0 || seats[seat].pilot !== "house") throw new RoomError(403, "That is not an AI seat at this table.");
      if (pendingSeat !== seat || !controller.pending) throw new RoomError(409, "That seat is not being asked anything.");
      const pilot = pilotFor(seat);
      if (typeof pilot.explain !== "function") return null;
      const seen = pilotView(seat);
      const explained = pilot.explain(seen, pendingActions ? {actions: pendingActions} : {choice: castDraft ? castDraftChoice(state, castDraft, draftOptions) : awaitingChoice(state)});
      const p = personaOf(seats[seat].persona);
      return {...explained, persona: p ? {name: p.name, blurb: p.blurb, ...p.disposition} : null};
    },

    /**
     * A draft of the seat's answer, checked whole and changing nothing (Linear ROB-75): `{ok, open, reasons}`. A draft of
     * blocks is told every reason the rules would refuse it for (rules/combat.mjs, `blockers.check`, what an answer is
     * refused by too); any other question, the first, as its answer would be. Nothing is kept, sent to another seat, taped
     * or journalled: only the answer makes blocks public. A question no longer open says so (`open: false`), and the
     * seat's view has the one that is.
     */
    check(seatId, {choiceId, indices} = {}) {
      const seat = seatIndex(seatId);
      if (seat < 0) throw new RoomError(403, "That seat is not at this table.");
      const pending = controller.pending;
      if (finished() || pendingSeat !== seat || !pending || pending.id !== choiceId)
        return {ok: false, open: false, reasons: ["That question is no longer open. Answer the one your view shows now."]};
      if (castDraft) {
        try {answerCastDraft(state, structuredClone(castDraft), {indices}, draftOptions); return {ok: true, open: true, reasons: []};}
        catch (error) {return {ok: false, open: true, reasons: [error.message]};}
      }
      const checked = state.awaiting?.kind === "declare-blockers" ? deriving(state, () => blockers.check(state, state.awaiting, indices)) : null;
      const reasons = checked ? checked.reasons : [controller.check({choiceId, indices})].filter(Boolean);
      return {ok: reasons.length === 0, open: true, reasons, ...(checked?.byAttacker?.length ? {byAttacker: checked.byAttacker} : {})};
    },
    async act(seatId, request) {
      const seat = seatIndex(seatId);
      if (seat < 0) throw new RoomError(403, "That seat is not at this table.");
      if (finished()) throw new RoomError(409, "This game is over.");
      /* A retry of an accepted action is answered from its receipt, whoever is being asked now; the same id
         from another seat, or with other content, is refused. */
      const body = JSON.stringify(request ?? null), actionId = request && request.actionId;
      const known = receipts.find((r) => r.actionId === actionId);
      if (known) {
        if (known.seatId !== seatId || known.body !== body) throw new RoomError(409, "Action id was reused with different content");
        return {receipt: known.receipt, changed: false};
      }
      if (pendingSeat !== seat) throw new RoomError(409, "It is not your decision.");
      let receipt;
      const before = controller.revision, decisionId = controller.pending?.id ?? null;
      try {receipt = controller.answer(request);}
      catch (error) {throw new RoomError(/Invalid action id/.test(error.message) ? 400 : 409, error.message);}
      if (controller.revision === before) return {receipt, changed: false};  /* a retry older than this room's receipts */
      receipts = [...receipts, {actionId, seatId, body, receipt}].slice(-RECEIPTS);
      const answer = controller.take();
      begin();
      tape({kind: "answer", seat: seatId, answer});
      /* Refused by the rules, or failed in the play after it: undone -- no receipt, no tape entry, the same question still
         theirs -- and refused, saying why. A saved tape so never holds an answer that cannot be applied again. */
      try {answerWith(seat, answer, decisionId);} catch (error) {throw await undone(error);}
      await persist();
      return {receipt, changed: true};
    },
  };
  return api;
}

export const startRoom = ({storage, matchId, cards = basicCards, candidates, pod, seed, pilot, slice}) => roomOn(storage, matchId, cards, pilot, slice, candidates).start(pod, seed);
export const openRoom = ({storage, matchId, cards = basicCards, candidates, pilot, slice}) => roomOn(storage, matchId, cards, pilot, slice, candidates).open();
