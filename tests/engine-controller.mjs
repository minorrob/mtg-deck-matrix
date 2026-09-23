/* EVERY DECISION IS AN OFFERED CHOICE, AND EVERY ANSWER IS CHECKED AGAINST IT.
 *
 * `docs/engine/PLAN.md` §3.2.3 and §12.1, which pins the envelope as the one `ForgeBrowserBridge`
 * already serves: the same choice record, the same action body, the same refusal messages. The
 * board, the guest gateway, the API pilots and `force-advance.mjs` all speak it today, and the
 * transition plan depends on none of them changing.
 *
 * WHY VALIDATION LIVES HERE AND NOT IN THE CALLER. The answers arrive from a browser, from a model
 * pilot and, once the cloud host exists, from the network. An engine that trusts them is an engine
 * whose state can be driven into a position the rules cannot produce, and every later bug report
 * against it is unreproducible. The rule is: an answer that does not fit the record it answers is
 * refused, with the message the board already knows how to show.
 *
 * THE ONE DELIBERATE DIFFERENCE FROM FORGE. Forge accepts `ok`, `cancel`, `card` and `player` only
 * while NO choice is pending — they drive its own input queue. This engine never asks anything
 * except through a choice record (§3.2.3), so there is no such state; those kinds are answers to
 * the pending choice, resolved against its options. The wire format is unchanged, which is the part
 * the UI depends on.
 *
 * RECEIPTS EXIST BECAUSE THE NETWORK RETRIES. The same actionId twice returns the same receipt and
 * applies nothing twice; the same actionId with different content is refused, because that is a
 * client bug and silently accepting it loses a decision.
 */
import assert from "node:assert/strict";
import {createController, CHOICE_MODES} from "../game/engine/controller.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const refuses = (fn, pattern, m) => { assert.throws(fn, pattern, m); checks += 1; };

let ids = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`;

const choiceOf = (over = {}) => ({
  id: "c1", title: "Choose a card", mode: "one", min: 1, max: 1,
  options: [{index: 0, label: "Forest"}, {index: 1, label: "Island"}],
  ...over,
});

/* ---- the modes are the ones the board can draw ---- */
{
  eq(CHOICE_MODES, ["one", "many", "order", "boolean", "index", "integer", "text", "amount", "damage", "draw", "ack"],
    "the choice modes §12.1 pins — a mode the board cannot draw is a decision nobody can answer");
}

/* ---- offering ---- */
{
  const c = createController();
  eq(c.revision, 0, "a fresh controller is at revision zero");
  eq(c.pending, null, "with nothing pending");

  const offered = c.offer(choiceOf());
  eq(c.revision, 1, "offering a choice moves the revision, so a stale board is detectable");
  eq(c.pending.id, "c1", "and the choice is pending");
  eq(offered.options.length, 2, "the record is handed back as offered");

  refuses(() => c.offer(choiceOf({id: "c2"})), /pending|one at a time/i,
    "a second choice cannot be offered over an unanswered one — two open questions is how an answer lands on the wrong one");
}
{
  const c = createController();
  refuses(() => c.offer(choiceOf({mode: "vibes"})), /mode/i, "an unknown mode is refused at the source");
  refuses(() => c.offer(choiceOf({id: ""})), /id/i, "a choice needs an id, because the answer names it");
  refuses(() => c.offer(choiceOf({min: 2, max: 1})), /min|max|range/i, "and bounds that cannot be met");
  refuses(() => c.offer(choiceOf({min: 1, max: 3})), /options|max/i,
    "asking for more options than exist would be unanswerable");
}

/* ---- a plain answer ---- */
{
  const c = createController();
  c.offer(choiceOf());
  const id = uuid();
  const receipt = c.answer({actionId: id, revision: c.revision, kind: "answer", choiceId: "c1", indices: [1]});
  eq(receipt, {accepted: true, actionId: id}, "an accepted answer returns the receipt the bridge returns");
  eq(c.answered.indices, [1], "and the answer is held for the engine to take");
  const taken = c.take();
  eq(taken.indices, [1], "the engine takes it");
  eq(c.pending, null, "which clears the choice");
  eq(c.answered, null, "and the answer with it");
  eq(c.revision, 3, "and moves the revision again, so the board knows to re-read — once on accepting the answer, once on taking it");
}

/* ---- the refusals, in the bridge's own words ---- */
{
  const c = createController();
  c.offer(choiceOf());
  const body = (over = {}) => ({actionId: uuid(), revision: c.revision, kind: "answer", choiceId: "c1", indices: [0], ...over});

  refuses(() => c.answer(body({actionId: "not-a-uuid"})), /Invalid action id/,
    "an action id that is not a uuid is refused before anything is read");
  refuses(() => c.answer(body({revision: 99})), /The board changed/,
    "an answer against a revision that has moved is stale — the player answered a question that is no longer on screen");
  refuses(() => c.answer(body({choiceId: "other"})), /expired/,
    "an answer naming a different choice");
  refuses(() => c.answer(body({indices: []})), /required number/,
    "too few selections");
  refuses(() => c.answer(body({indices: [0, 1]})), /required number/,
    "too many");
  refuses(() => c.answer(body({indices: [5]})), /Invalid selection/,
    "an option that does not exist");
  refuses(() => c.answer(body({indices: [1.5]})), /Invalid selection/,
    "a fractional index");
  eq(c.pending.id, "c1", "and after all of that the choice is still pending, unanswered");
}
{
  const c = createController();
  c.offer(choiceOf({mode: "many", min: 0, max: 2}));
  refuses(() => c.answer({actionId: uuid(), revision: c.revision, kind: "answer", choiceId: "c1", indices: [1, 1]}),
    /Invalid selection/, "the same option twice is not two selections");
  eq(c.answer({actionId: uuid(), revision: c.revision, kind: "answer", choiceId: "c1", indices: []}).accepted, true,
    "and a minimum of zero really does allow none");
}

/* ---- receipts make a retry harmless ---- */
{
  const c = createController();
  c.offer(choiceOf());
  const id = uuid();
  const body = {actionId: id, revision: c.revision, kind: "answer", choiceId: "c1", indices: [0]};
  const first = c.answer(body);
  const again = c.answer({...body});
  eq(again, first, "the same action id with the same content returns the same receipt");
  eq(c.revision, 2, "and changes nothing — a retried request is not a second decision");
  refuses(() => c.answer({...body, indices: [1]}), /reused with different content/,
    "the same id with different content is a client bug, and accepting it would lose a decision");
}

/* ---- integer, text, ack ---- */
{
  const c = createController();
  c.offer({id: "n", title: "How many?", mode: "integer", min: 0, max: 3, options: []});
  const at = () => ({actionId: uuid(), revision: c.revision, kind: "answer", choiceId: "n"});
  refuses(() => c.answer({...at(), value: 4}), /outside allowed range/, "above the maximum");
  refuses(() => c.answer({...at(), value: -1}), /outside allowed range/, "below the minimum");
  refuses(() => c.answer({...at(), value: 1.5}), /outside allowed range/, "not a whole number");
  refuses(() => c.answer({...at(), value: Infinity}), /outside allowed range/, "not finite");
  eq(c.answer({...at(), value: 2}).accepted, true, "and a number in range is taken");
}
{
  const c = createController();
  c.offer({id: "t", title: "Name a card", mode: "text", min: 0, max: 0, options: [], numeric: false});
  const at = () => ({actionId: uuid(), revision: c.revision, kind: "answer", choiceId: "t"});
  refuses(() => c.answer({...at(), text: "x".repeat(1001)}), /at most 1000/, "a thousand characters is the cap");
  refuses(() => c.answer({...at(), text: 7}), /at most 1000/, "and it has to be text");
  eq(c.answer({...at(), text: "Sol Ring"}).accepted, true, "a card name is fine");
  c.take();
  c.offer({id: "t2", title: "How many?", mode: "text", min: 0, max: 0, options: [], numeric: true});
  refuses(() => c.answer({actionId: uuid(), revision: c.revision, kind: "answer", choiceId: "t2", text: "two"}),
    /whole number/, "a numeric text prompt wants digits");
  eq(c.answer({actionId: uuid(), revision: c.revision, kind: "answer", choiceId: "t2", cancel: true}).accepted, true,
    "and cancelling a text prompt is allowed without one");
}
{
  const c = createController();
  c.offer({id: "a", title: "The spell resolves", mode: "ack", min: 0, max: 0, options: []});
  eq(c.answer({actionId: uuid(), revision: c.revision, kind: "answer", choiceId: "a", indices: []}).accepted, true,
    "an acknowledgement takes no selection");
}

/* ---- generic amounts (CR 601.2d, divided among recipients) ---- */
{
  const c = createController();
  c.offer({
    id: "amt", title: "Divide 3 damage", mode: "amount", min: 0, max: 0, total: 3, minEach: 1,
    options: [{index: 0, label: "Krenko", max: 3}, {index: 1, label: "Atraxa", max: 3}],
  });
  const at = () => ({actionId: uuid(), revision: c.revision, kind: "answer", choiceId: "amt"});
  refuses(() => c.answer({...at(), amounts: [3]}), /each listed recipient/, "every recipient needs an amount");
  refuses(() => c.answer({...at(), amounts: [3, 0]}), /allowed range/,
    "a minimum of one each means zero is not a legal share (CR 601.2d)");
  refuses(() => c.answer({...at(), amounts: [1, 1]}), /complete amount/, "and the whole amount must be spent");
  refuses(() => c.answer({...at(), amounts: [2, 2]}), /complete amount/, "no more than it, either");
  eq(c.answer({...at(), amounts: [2, 1]}).accepted, true, "two and one is three");
}

/* ---- combat damage assignment order (CR 510.1c) ---- */
{
  const lethalFirst = () => ({
    id: "dmg", title: "Assign 4 damage", mode: "damage", min: 0, max: 0, total: 4, maySkip: false,
    divide: false, overrideOrder: false,
    options: [{index: 0, label: "Wall", lethal: 3}, {index: 1, label: "Bear", lethal: 2}],
  });
  const c = createController();
  c.offer(lethalFirst());
  const at = () => ({actionId: uuid(), revision: c.revision, kind: "answer", choiceId: "dmg"});
  refuses(() => c.answer({...at(), amounts: [2, 2]}), /lethal damage to the required blockers/,
    "damage cannot move past a blocker that has not been assigned lethal (CR 510.1c)");
  refuses(() => c.answer({...at(), amounts: [4, 1]}), /exactly 4/, "and the total is exact");
  refuses(() => c.answer({...at(), amounts: [-1, 5]}), /nonnegative/, "no negative assignments");
  refuses(() => c.answer({...at(), skip: true}), /cannot be skipped/,
    "and a required assignment cannot be skipped");
  eq(c.answer({...at(), amounts: [3, 1]}).accepted, true, "lethal to the first, the rest onward");
}

/* ---- ordering the top of a library, with cards that may not move ---- */
{
  const c = createController();
  c.offer({
    id: "ord", title: "Put them back", mode: "order", min: 4, max: 4, choiceKind: "manipulate",
    toTop: true, toBottom: false, toAnywhere: false,
    options: [
      {index: 0, label: "A", movable: true},
      {index: 1, label: "B", movable: false},
      {index: 2, label: "C", movable: false},
      {index: 3, label: "D", movable: true},
    ],
  });
  const at = () => ({actionId: uuid(), revision: c.revision, kind: "answer", choiceId: "ord"});
  refuses(() => c.answer({...at(), indices: [0, 2, 1, 3]}), /cannot move must remain/,
    "two cards that cannot move may not be swapped with each other");
  refuses(() => c.answer({...at(), indices: [0, 1, 3, 2]}), /allowed top or bottom/,
    "and a movable card may not drop below the fixed ones when only the top is allowed");
  eq(c.answer({...at(), indices: [3, 0, 1, 2]}).accepted, true,
    "the movable ones may be reordered above the fixed ones when the choice allows the top");
}

/* ---- clicking a card is an answer to the pending choice ---- */
{
  const c = createController();
  c.offer(choiceOf({options: [{index: 0, label: "Forest", cardId: 11}, {index: 1, label: "Island", cardId: 12}]}));
  eq(c.answer({actionId: uuid(), revision: c.revision, kind: "card", targetId: 12}).accepted, true,
    "a card click names the card, and the controller finds which option it is");
  eq(c.take().indices, [1], "and answers the choice with that option");
}
{
  const c = createController();
  c.offer(choiceOf({options: [{index: 0, label: "Rob", playerId: 0}, {index: 1, label: "Krenko", playerId: 1}]}));
  c.answer({actionId: uuid(), revision: c.revision, kind: "player", targetId: 1});
  eq(c.take().indices, [1], "so does clicking a player");
  const d = createController();
  d.offer(choiceOf({options: [{index: 0, label: "Forest", cardId: 11}]}));
  refuses(() => d.answer({actionId: uuid(), revision: d.revision, kind: "card", targetId: 99}),
    /Invalid selection/, "a card that is not among the options is not a selection");
}

/* ---- ok and cancel ---- */
{
  const c = createController();
  c.offer({id: "y", title: "Pay 2 life?", mode: "boolean", min: 1, max: 1,
    options: [{index: 0, label: "Yes"}, {index: 1, label: "No"}]});
  c.answer({actionId: uuid(), revision: c.revision, kind: "ok"});
  eq(c.take().indices, [0], "ok on a yes-or-no answers yes, which is the first option");
}
{
  const c = createController();
  c.offer({id: "s", title: "Choose a target", mode: "one", min: 1, max: 1, maySkip: true,
    options: [{index: 0, label: "Krenko"}]});
  c.answer({actionId: uuid(), revision: c.revision, kind: "cancel"});
  eq(c.take().cancel, true, "cancel declines a choice that may be skipped");
  const d = createController();
  d.offer(choiceOf());
  refuses(() => d.answer({actionId: uuid(), revision: d.revision, kind: "cancel"}), /unavailable|cannot/i,
    "and is refused on one that may not");
}

/* ---- a controller checkpoints with the game ---- */
{
  const c = createController();
  c.offer(choiceOf());
  c.answer({actionId: uuid(), revision: c.revision, kind: "answer", choiceId: "c1", indices: [0]});
  const point = c.checkpoint();
  eq(JSON.parse(JSON.stringify(point)), point, "a controller checkpoint is plain data");

  const resumed = createController(point);
  eq(resumed.revision, c.revision, "a resumed controller is at the same revision");
  eq(resumed.pending.id, "c1", "holding the same pending choice");
  eq(resumed.take().indices, [0], "and the same answer, so a game resumes mid-decision (§3.2.4)");
}

/* ---- receipts do not grow without bound ---- */
{
  const c = createController();
  for (let i = 0; i < 1100; i += 1) {
    c.offer(choiceOf({id: `c${i}`}));
    c.answer({actionId: uuid(), revision: c.revision, kind: "answer", choiceId: `c${i}`, indices: [0]});
    c.take();
  }
  ok(c.receiptCount <= 1024,
    "old receipts are dropped — a long game must not accumulate every action it ever took");
}

console.log(`engine-controller: ${checks} checks passed — every decision is an offered choice, every answer is checked against it, and a retry is not a second decision.`);
