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
 *
 * WHAT IT PLAYS. Only cards the `cards` resolver can define. A pod with any other card is refused before
 * anything is written, naming every card it cannot play (docs/decisions-2026-09-25.md, M4: "refused by name;
 * compiled once M7 lands"). Today that is the basic lands, as it is for the engine itself.
 */
import {createState, addObject} from "../engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../engine/rules/turn.mjs";
import {legalActions, applyAction, nothingToDo, escapeWays} from "../engine/rules/actions.mjs";
import {passPriority} from "../engine/rules/priority.mjs";
import {gameOver, concede} from "../engine/rules/sba.mjs";
import {beginMulligans} from "../engine/rules/mulligan.mjs";
import {projectFor} from "../engine/projection.mjs";
import {controllerOf, characteristicsOf} from "../engine/rules/layers.mjs";
import {countWords, inWords} from "../engine/script/bind.mjs";
import {createRng} from "../engine/rng.mjs";
import {createJournal, hashState} from "../engine/journal.mjs";
import {createController} from "../engine/controller.mjs";
import {createMatchStore} from "../engine/storage.mjs";
import {housePilot} from "../engine/pilots/house-pilot.mjs";
import {addToHistory} from "./history.mjs";

export const ROOM_PROTOCOL = 1;
export const ROOM_SCHEMA = "CrankRoom@1";
export const VIEW_SCHEMA = "CrankRoomView@1";
const SEAT_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const MAX_CARDS = 250;           // a Commander deck is 100; this is only a bound on what a pod may carry
const DRIVE_LIMIT = 100000;      // engine steps between two human decisions before the room calls it a hang
const HISTORY_KEEP = 300;         // lines of the table's history kept with the room
const HISTORY_VIEW = 120;         // the newest of them, in every view
/* The steps as the history names them when one passes by itself (the untap and cleanup steps give no priority). */
const QUIET_STEP = {UPKEEP: "Upkeep", DRAW: "Draw step", MAIN1: "Main 1", COMBAT_BEGIN: "Beginning of combat", COMBAT_DECLARE_ATTACKERS: "Declare attackers",
  COMBAT_DECLARE_BLOCKERS: "Declare blockers", COMBAT_FIRST_STRIKE_DAMAGE: "First-strike damage", COMBAT_DAMAGE: "Combat damage", COMBAT_END: "End of combat",
  MAIN2: "Main 2", END_OF_TURN: "End step"};

export class RoomError extends Error {
  constructor(status, message, extra = {}) {super(message); this.status = status; Object.assign(this, extra);}
}

/* The one kind of card the engine can play with no definition: a basic land is a land with a mana ability. */
const BASIC_COLORS = {Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G", Wastes: "C"};
export function basicCards(name) {
  const color = BASIC_COLORS[name];
  return color ? {types: ["Land"], abilities: [{id: `t-${color.toLowerCase()}`, kind: "mana", tapSelf: true, produces: {[color]: 1}}]} : null;
}

/* Public facts the house pilot may read about a named card: what anyone reads off the card itself. */
const manaValueOf = (cost) => (String(cost || "").match(/\{([^}]+)\}/g) || []).reduce((n, s) => {const x = s.slice(1, -1); return n + (/^\d+$/.test(x) ? Number(x) : x === "X" ? 0 : 1);}, 0);
const factsFrom = (cards) => (name) => {
  const c = cards(name);
  /* `x`: a cost with {X} (CR 107.3), so the house pilot taps everything before it casts. */
  return c ? {manaValue: manaValueOf(c.manaCost), types: c.types || [], power: c.power ?? null, toughness: c.toughness ?? null, ...(/\{X\}/.test(c.manaCost || "") ? {x: true} : {})} : null;
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
    const commander = (Array.isArray(s.commander) ? s.commander : []).map(String);
    const library = (Array.isArray(s.cards) ? s.cards : []).map(String);
    if (commander.length > 2 || commander.length + library.length > MAX_CARDS) throw new RoomError(400, `${seatId}'s deck is not one a table can hold.`);
    for (const name of [...commander, ...library]) if (!cards(name)) missing.add(name);
    return {seatId, name: String(s.name || `Seat ${index + 1}`).slice(0, 60), pilot, commander, cards: library};
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
  if (choice.mode === "damage" || choice.mode === "amount") {
    const amounts = options.map(() => choice.minEach ?? 0);
    let left = (choice.total ?? 0) - amounts.reduce((a, b) => a + b, 0);
    for (let i = 0; i < options.length && left > 0; i += 1) {
      const room = choice.mode === "damage" ? Math.max(0, options[i].lethal ?? 0) : Math.max(0, (options[i].max ?? left) - amounts[i]);
      const take = Math.min(left, room);
      amounts[i] += take; left -= take;
    }
    if (left > 0 && amounts.length) amounts[amounts.length - 1] += left;
    return {indices: [], amounts};
  }
  if (choice.mode === "integer") return {indices: [], value: choice.min ?? 0};
  return {indices: options.slice(0, Math.max(choice.min ?? 0, choice.mode === "one" || choice.mode === "boolean" ? 1 : 0)).map((o) => o.index)};
}

export function offerDetails(state, seat, actions) {
  const player = (id) => (id === seat ? `${state.players[id]?.name ?? "you"} (you)` : state.players[id]?.name ?? `Seat ${id + 1}`);
  const object = (id, plain) => {
    const o = state.objects[id];
    if (!o) return "";
    let holder = o.controller;
    try { if (o.zone === "battlefield") holder = controllerOf(state, id); } catch { /* the base controller */ }
    const whose = holder === seat || holder === undefined || holder === null ? "" : ` (${state.players[holder]?.name ?? `Seat ${holder + 1}`}'s)`;
    if (plain) return `${o.card}${whose}`;
    let shape = "";
    try { const c = characteristicsOf(state, id); if (c.power !== null && c.power !== undefined) shape = ` ${c.power}/${c.toughness}`; } catch { /* no shape */ }
    return `${o.card}${whose}${shape}${o.tapped ? ", tapped" : ""}`;
  };
  const MANA = ["W", "U", "B", "R", "G", "C"];
  const manaText = (mana) => MANA.flatMap((k) => Array.from({length: mana?.[k] ?? 0}, () => `{${k}}`)).join("");
  const abilities = new Map();
  for (const a of actions) if (a.kind === "activate") abilities.set(a.objectId, new Set([...(abilities.get(a.objectId) ?? []), a.abilityId]));
  const say = (a, plain) => {
    const parts = [];
    if (a.kind === "activate" && (abilities.get(a.objectId)?.size ?? 0) > 1 && a.text) parts.push(`“${a.text}”`);
    /* The modes chosen as it is cast (CR 700.2), in the card's words. */
    if (Array.isArray(a.modes)) parts.push(a.modes.map((i) => state.objects[a.objectId]?.spell?.modal?.modes?.[i]?.text ?? `mode ${i + 1}`).join(" + "));
    if (a.x !== undefined) parts.push(`X = ${a.x}`);
    /* A counted target (script/bind.mjs): what is still to be picked ("up to two targets"), or the ones picked. */
    const aimed = (t) => (!t ? "" : Array.isArray(t) ? (t.length ? t.map(aimed).join(" and ") : "no target") : t.kind === "choose" ? countWords(t)
      : t.kind === "player" ? player(t.id) : object(t.id, plain));
    if ((a.targets ?? []).length) parts.push(`→ ${a.targets.map(aimed).join(", ")}`);
    /* What the cost takes: one card, or a set of them ("sacrificing Bear and Wolf", "discarding Ponder and Opt"), each
       said with what it does to them. */
    const DOING = {discard: "discarding", returnToHand: "returning", exile: "exiling", crew: "crewing with", tap: "tapping", untap: "untapping"};
    for (const [kind, id] of Object.entries(a.costChoice ?? {})) parts.push(`${DOING[kind] ?? "sacrificing"} ${[].concat(id).map((x) => object(x, plain)).join(" and ")}`);
    /* An alternative cost (CR 118.9): what is paid instead of the mana cost. */
    if (a.alternative !== undefined) {
      const cost = state.objects[a.objectId]?.abilities?.[a.alternative]?.cost ?? [];
      const mana = cost.find((c) => c.atom === "mana")?.cost, life = cost.filter((c) => c.atom === "payLife").reduce((n, c) => n + (c.amount ?? 0), 0);
      parts.push([mana ? `for ${mana} instead` : (life || cost.length ? "instead of its mana cost" : "without paying its mana cost"), life ? `paying ${life} life` : null].filter(Boolean).join(", "));
    }
    /* "Without paying its mana cost", beside the paid cast of the same card (rules/actions.mjs). */
    if (a.free) parts.push("without paying its mana cost");
    /* Flashback (CR 702.34a): from the graveyard for its flashback cost, exiled after. */
    if (a.flashback) parts.push("flashback");
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

/* A priority decision, as a §12.1 choice: one of the seat's legal actions, passing included. */
function priorityChoice(id, actions, state = null, seat = null) {
  const details = state ? offerDetails(state, seat, actions) : [];
  return {id, title: "Your priority", mode: "one", min: 1, max: 1, kind: "priority",
    options: actions.map((a, index) => ({index, label: a.kind === "pass" ? "Pass priority" : (a.label || a.kind), act: a.kind, ...(a.objectId !== undefined ? {cardId: a.objectId} : {}),
      ...(details[index] ? {detail: details[index]} : {})}))};
}

/**
 * The room over its storage. `start` a new match on empty storage, or `open` the one stored there.
 *
 * @param {object} storage  the M4 storage contract (get/put/delete/list); a Durable Object's own, in the cloud
 * @param {(name: string) => ?object} cards  a card's definition for `addObject`, or null when the engine
 *   cannot play it
 */
function roomOn(storage, matchId, cards) {
  const store = createMatchStore(storage, matchId);
  const ROOM_KEY = `room/${matchId}`;
  const facts = factsFrom(cards);
  let seats, state, rng, journal, controller, pilots, pendingSeat = null, pendingActions = null, saved = 0;
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
  /* THE TABLE'S HISTORY (game/room/history.mjs): public lines only, the same for every seat, kept with the room. */
  let history = [];
  /* ITEM 11: whether a person with nothing to do passes by itself, and what the step in progress has seen -- a pass
     the room made for someone, and anything anyone chose to do (a person's pass counts: they could have acted). */
  let passEmpty = false, step = {key: null, quiet: false, acted: false};
  const track = () => {const key = `${state.turn}:${state.stepIndex}`; if (key !== step.key) step = {key, quiet: false, acted: false};};
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
  const tape = (entry) => {unsaved.push({n: tapeN, turn: state ? state.turn : 0, ...entry}); tapeN += 1;};
  const note = (text) => {history.push({turn: state ? state.turn : 0, text}); if (history.length > HISTORY_KEEP) history.splice(0, history.length - HISTORY_KEEP);};
  const finished = () => Boolean(ended) || Boolean(gameOver(state));
  const pilotFor = (seat) => pilots[seat] || (pilots[seat] = housePilot({seat, cards: facts}));

  const write = (events) => {
    const names = seats.map((s) => s.name);
    for (const e of events) {journal.write(e.kind, e.data); addToHistory(history, e, names);}
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
      const least = leastAnswer(choice);
      return resolveAwaiting(state, least.indices, least.amounts, rng, least);
    }
  }

  function drive() {
    for (let steps = 0; steps < DRIVE_LIMIT; steps += 1) {
      if (finished()) {pendingSeat = null; pendingActions = null; return;}
      if (state.stepIndex !== undefined && leaving.length) {
        for (const seat of leaving) if (!state.players[seat].lost) write(concede(state, seat));
        leaving = [];
        continue;
      }
      if (state.stepIndex !== undefined) track();
      if (state.awaiting) {
        const seat = state.awaiting.player, choice = awaitingChoice(state);
        if (seats[seat].pilot === "house" || leaving.includes(seat)) {
          const a = pilotFor(seat).answer(projectFor(state, seat), choice);
          step.acted = true;
          write(answerForPilot(seat, choice, a));
          continue;
        }
        controller.offer(choice); pendingSeat = seat; pendingActions = null; return;
      }
      if (state.stepIndex === undefined) {write(beginGame(state)); continue;}
      if (state.priorityPlayer === null) {write(advance(state)); continue;}
      const seat = state.priorityPlayer, actions = legalActions(state, seat);
      if (seats[seat].pilot === "house") {apply(seat, pilots[seat].choose(projectFor(state, seat), actions), "pilot"); continue;}
      if (passEmpty && nothingToDo(state, seat, actions)) {apply(seat, actions.find((a) => a.kind === "pass"), "room"); continue;}
      controller.offer(priorityChoice(`priority:${state.turn}:${state.stepIndex}:${controller.revision}`, actions, state, seat));
      pendingSeat = seat; pendingActions = actions; return;
    }
    throw new RoomError(500, "The game stopped moving: the engine took too many steps without a decision. Nothing further was applied.");
  }
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
     and by a replay of the tape, so the two cannot drift apart. */
  function answerWith(seat, answer) {
    if (pendingActions) {
      const action = pendingActions[answer.indices[0]];
      pendingActions = null;
      apply(seat, action);
    } else {step.acted = true; write(resolveAwaiting(state, answer.indices, answer.amounts, rng, answer));}
    pendingSeat = null;
    drive();
  }
  /* `by`: a person, the house pilot, or the room passing for a person with nothing to do (item 11). */
  function apply(seat, action, by = "person") {
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
    } else {step.acted = true; write(applyAction(state, seat, action));}
  }

  /* Everything since the last save, then the checkpoint, then the room's own record (which names it). */
  async function persist() {
    const events = journal.events();
    await store.appendEvents(events.slice(saved));
    saved = events.length;
    await store.appendTape(unsaved);
    unsaved = [];
    const point = journal.checkpoint(state, rng.checkpoint());
    await store.saveCheckpoint(point);
    await store.pruneCheckpoints();
    await storage.put(ROOM_KEY, JSON.stringify({schema: ROOM_SCHEMA, protocol: ROOM_PROTOCOL, matchId, seats, pendingSeat, pendingActions, sequence: point.sequence, controller: controller.checkpoint(), receipts, leaving, departures, ended, history, ...(passEmpty ? {passEmpty, step} : {})}));
  }

  const api = {
    matchId,
    get seats() {return seats.map(({seatId, name, pilot}) => ({seatId, name, pilot}));},
    get status() {return finished() ? "finished" : "playing";},
    get revision() {return controller.revision;},
    get waitingOn() {return pendingSeat === null ? null : seats[pendingSeat].seatId;},
    /** Every line of the table's history the room keeps (a view shows the newest): public, the same for every seat. */
    get history() {return history.map(({turn, text, mark}) => ({turn, text, ...(mark ? {mark} : {})}));},

    async start(pod, seed) {
      seats = readPod(pod, cards);
      if (typeof seed !== "string" || !seed) throw new RoomError(400, "A match needs its seed.");
      if (await storage.get(ROOM_KEY) !== null) throw new RoomError(409, "This table already has a game.");
      /* The table's starting life (its host's rule), kept with the match so a replay deals the same game. */
      const startingLife = pod && pod.startingLife !== undefined ? pod.startingLife : undefined;
      const beats = {...(pod && pod.drawBeat === true ? {drawBeat: true} : {}), ...(pod && pod.passEmpty === true ? {passEmpty: true} : {})};
      passEmpty = beats.passEmpty === true;
      try {state = createState({matchId, seed, players: seats.map((s) => ({name: s.name})), ...(startingLife !== undefined ? {startingLife} : {}), ...(beats.drawBeat ? {drawBeat: true} : {})});}
      catch (error) {throw new RoomError(400, error.message);}
      seats.forEach((s, seat) => {
        for (const name of s.commander) addObject(state, {...cards(name), card: name, owner: seat, controller: seat, commander: true}, "command", seat);
        for (const name of s.cards) addObject(state, {...cards(name), card: name, owner: seat, controller: seat}, "library", seat);
      });
      rng = createRng(seed);
      journal = createJournal({matchId, seed});
      controller = createController();
      pilots = seats.map((s, seat) => (s.pilot === "house" ? housePilot({seat, cards: facts}) : null));
      await store.saveMatch({pod: {seats, ...(startingLife !== undefined ? {startingLife} : {}), ...beats}, seed});
      write(beginMulligans(state, rng));
      drive();
      await persist();
      return api;
    },

    async open() {
      const record = JSON.parse(await storage.get(ROOM_KEY) || "null");
      if (!record || record.schema !== ROOM_SCHEMA) throw new RoomError(404, "There is no game at this table.");
      const point = await store.latestCheckpoint();
      if (!point || point.sequence !== record.sequence) throw new RoomError(500, "This table's saved game does not match its record, so it was not resumed.");
      passEmpty = record.passEmpty === true; step = record.step || {key: null, quiet: false, acted: false};
      seats = record.seats; pendingSeat = record.pendingSeat; pendingActions = record.pendingActions; receipts = record.receipts || []; leaving = record.leaving || []; departures = record.departures || {}; ended = record.ended || null; history = record.history || [];
      state = structuredClone(point.state);
      rng = createRng(point.seed, point.rng);
      journal = createJournal({matchId, seed: point.seed}, point);
      controller = createController(record.controller);
      pilots = seats.map((s, seat) => (s.pilot === "house" ? housePilot({seat, cards: facts}) : null));
      saved = 0;
      tapeN = (await store.readTape()).length;
      return api;
    },

    /** What one seat may see: its projection, and the decision it is being asked, if it is the one asked. */
    view(seatId) {
      const seat = seatIndex(seatId);
      if (seat < 0) throw new RoomError(403, "That seat is not at this table.");
      const mine = pendingSeat === seat && controller.pending;
      const over = ended ? {winner: null, reason: "ended early"} : gameOver(state);
      return {
        schema: VIEW_SCHEMA, protocol: ROOM_PROTOCOL, matchId, seatId, seat,
        revision: controller.revision,
        status: over ? "finished" : "playing",
        result: over ? {winner: over.winner === null ? null : seats[over.winner].seatId, reason: over.reason, ...(ended ? {endedBy: ended.by} : {})} : null,
        departures: structuredClone(departures),
        seats: api.seats,
        waitingOn: pendingSeat === null ? null : seats[pendingSeat].seatId,
        decision: mine ? structuredClone(controller.pending) : null,
        state: projectFor(state, seat),
        history: history.slice(-HISTORY_VIEW).map(({turn, text, mark}) => ({turn, text, ...(mark ? {mark} : {})})),
      };
    },

    /**
     * A FINGERPRINT OF THE GAME, never the game: the state's hash, how many events the journal holds, and the
     * tape's length (the stored journal itself is compared by game/room/replay.mjs). Two rooms with the same fingerprint are the same game, which is how a replay is proved; nothing about
     * a hidden card can be read back out of it.
     */
    fingerprint() {
      return {hash: hashState(state), events: journal.checkpoint(state, rng.checkpoint()).sequence, tape: tapeN, status: finished() ? "finished" : "playing"};
    },

    /**
     * One tape entry, applied as the person gave it (game/room/replay.mjs). An answer must come from the seat the
     * room is waiting on; otherwise the tape and this game have parted, and that is said, with where.
     */
    async replay(entry) {
      if (entry.kind === "leave") return api.leave(entry.seat, entry.why);
      if (entry.kind === "end") return api.end(entry.seat);
      if (entry.kind !== "answer") throw new RoomError(400, `Tape entry ${entry.n} is not an answer, a leave or an end.`);
      const seat = seatIndex(entry.seat);
      if (seat < 0 || pendingSeat !== seat) throw new RoomError(409, `The tape parts from the game at entry ${entry.n}: it answers for ${entry.seat}, and the game is waiting on ${pendingSeat === null ? "no one" : seats[pendingSeat].seatId}.`);
      withdrawKeeping();
      tape({kind: "answer", seat: entry.seat, answer: entry.answer});
      answerWith(seat, entry.answer);
      await persist();
      return api;
    },

    /**
     * A seat leaves the game in play: "conceded" when they choose to, "timed-out" when a dropped player's
     * time ran out. Whatever was being asked is withdrawn and asked afresh, because the board it was asked
     * about has changed; the engine concedes them (CR 104.3a) and play goes on without them.
     */
    async leave(seatId, why = "conceded") {
      const seat = seatIndex(seatId);
      if (seat < 0) throw new RoomError(403, "That seat is not at this table.");
      if (seats[seat].pilot === "house") throw new RoomError(409, "An AI seat does not leave a game.");
      if (!["conceded", "timed-out"].includes(why)) throw new RoomError(400, "A seat leaves by conceding or by timing out.");
      if (finished()) throw new RoomError(409, "This game is over.");
      if (departures[seatId]) throw new RoomError(409, "That seat has already left the game.");
      withdraw();
      departures[seatId] = why;
      tape({kind: "leave", seat: seatId, why});
      note(why === "timed-out" ? `${seats[seat].name} ran out of time · not finished` : `${seats[seat].name} conceded`);
      leaving = [...leaving, seat];
      drive();
      await persist();
      return api;
    },

    /** Someone at the table ends the game for everyone. Nothing more is played, and the record says it ended early. */
    async end(seatId) {
      const seat = seatIndex(seatId);
      if (seat < 0) throw new RoomError(403, "That seat is not at this table.");
      if (finished()) throw new RoomError(409, "This game is over.");
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
     * §12.1 action envelope. A retry with the same action id returns the same receipt and applies nothing.
     */
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
      const before = controller.revision;
      try {receipt = controller.answer(request);}
      catch (error) {throw new RoomError(/Invalid action id/.test(error.message) ? 400 : 409, error.message);}
      if (controller.revision === before) return {receipt, changed: false};  /* a retry older than this room's receipts */
      receipts = [...receipts, {actionId, seatId, body, receipt}].slice(-RECEIPTS);
      const answer = controller.take();
      tape({kind: "answer", seat: seatId, answer});
      answerWith(seat, answer);
      await persist();
      return {receipt, changed: true};
    },
  };
  return api;
}

export const startRoom = ({storage, matchId, cards = basicCards, pod, seed}) => roomOn(storage, matchId, cards).start(pod, seed);
export const openRoom = ({storage, matchId, cards = basicCards}) => roomOn(storage, matchId, cards).open();
