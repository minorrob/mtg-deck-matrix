/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE DECISION ENVELOPE: §3.2.3 AND §12.1.
 *
 * The engine never asks a controller anything except through a choice record with an id, a mode,
 * bounds and labeled options; it validates the answer against that record before applying it; and
 * receipts make a retry idempotent. That is the whole of this file.
 *
 * THE ENVELOPE IS PINNED, NOT DESIGNED. `ForgeBrowserBridge.action` has been serving it to
 * `crankmagic-game.js`, `game/ui/*`, `ai-pilot.mjs`, `api-choice-provider.mjs`, `force-advance.mjs`
 * and the guest gateway for the whole life of the project. The same field names, the same modes and
 * the same refusal strings are reproduced here, because the transition plan's value is that none of
 * those files change when the engine underneath does. Where a message reads oddly, it reads oddly on
 * the board today and matching it is the point.
 *
 * WHY VALIDATION IS HERE. Answers arrive from a browser, from a model pilot and, once the cloud
 * host exists, from the network. An engine that trusts them can be driven into a position the rules
 * cannot produce, and every bug filed against it afterwards is unreproducible. So an answer that
 * does not fit the record it answers is refused, in words the board already knows how to show.
 *
 * TWO DELIBERATE DIFFERENCES FROM FORGE, both consequences of §3.2.3:
 *
 * 1. Forge accepts `ok`, `cancel`, `card` and `player` only while NO choice is pending — they drive
 *    its own input queue. This engine has no such state, because it asks nothing except through a
 *    record. Those kinds are answers to the pending choice, resolved against its options. The wire
 *    format is unchanged, which is the part the UI depends on.
 *
 * 2. Nothing here blocks. Forge's bridge parks a thread on `wait()`. The engine is a state machine
 *    that runs until it needs a decision, offers it and returns, which is what makes "resume from
 *    any decision" (§3.2.4) true rather than aspirational — and what lets the same code run in a
 *    browser Worker, where there is no thread to park.
 */

/** The modes §12.1 pins. A mode the board cannot draw is a decision nobody can answer. */
export const CHOICE_MODES = Object.freeze([
  "one", "many", "order", "boolean", "index", "integer", "text", "amount", "damage", "draw", "ack",
]);

/* Forge caps its receipt map at this and drops the oldest. A long game must not accumulate every
   action it ever took, and a receipt is only useful while a client might still retry. */
const RECEIPT_LIMIT = 1024;

const UUID = /^[a-fA-F0-9-]{36}$/;

/* The option-based modes answer with `indices`; the other three carry their own field. */
const BY_INDICES = (mode) => !["integer", "text", "amount", "damage"].includes(mode);

function validateChoice(choice) {
  if (!choice || typeof choice.id !== "string" || choice.id === "")
    throw new Error("A choice needs an id, because its answer names it");
  if (!CHOICE_MODES.includes(choice.mode))
    throw new Error(`Unknown choice mode ${JSON.stringify(choice.mode)}`);
  const min = choice.min ?? 0, max = choice.max ?? 0;
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < min)
    throw new Error("A choice needs a min and max that can be met");
  const options = choice.options ?? [];
  if (!Array.isArray(options)) throw new Error("A choice's options must be a list");
  if (BY_INDICES(choice.mode) && max > options.length)
    throw new Error("A choice cannot ask for more options than it offers; max exceeds the options");
}

/* ---- the mode-specific validators, ported from the bridge ---- */

/* CR 601.2d. Every recipient gets an amount, each within its own cap and at or above the minimum
   each, and the total is spent exactly. */
function validateGenericAmount(choice, request) {
  const targets = choice.options ?? [];
  const amounts = request.amounts;
  if (!Array.isArray(amounts) || amounts.length !== targets.length)
    throw new Error("Assign an amount to each listed recipient");
  let sum = 0;
  const minimum = choice.minEach ?? 0;
  for (let i = 0; i < targets.length; i += 1) {
    const amount = amounts[i];
    const cap = targets[i].max;
    if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < minimum || amount > cap)
      throw new Error("Use whole amounts within each recipient's allowed range");
    sum += amount;
  }
  if (sum !== choice.total) throw new Error("Assign the complete amount before confirming");
}

/* CR 510.1c. Damage may not be assigned past a blocker that has not been assigned lethal damage,
   unless the attacker divides damage as it chooses or the assignment order is being overridden —
   and even then, not past a blocker to the defending player. */
/**
 * What is wrong with a division of combat damage, or null -- the one statement of the rule, which the engine's combat
 * (rules/combat.mjs) holds its own answers to as well. Whole amounts, none more than the total, adding up to it. Among
 * the blockers as the attacking creature's controller chooses (CR 510.1c: there is no damage assignment order). To the
 * player -- a trampler's `defender` option -- only once every blocker has at least its lethal (CR 702.19b). A choice that
 * does not say `divide` is held to the old order, lethal to each before the damage moves on, as it always was.
 */
export function damageAssignmentProblem(choice, amounts) {
  const targets = choice.options ?? [];
  if (!Array.isArray(amounts) || amounts.length !== targets.length) return "Assign damage to each listed recipient";
  if (amounts.some((n) => !Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > choice.total)) return "Use whole, nonnegative damage amounts";
  const short = targets.some((t, i) => t.defender !== true && amounts[i] < (t.lethal ?? 0));
  if (short && targets.some((t, i) => t.defender === true && amounts[i] > 0)) return "Assign lethal damage to every blocker before assigning any to the player";
  if (choice.divide !== true) {
    let priorNeedsLethal = false;
    for (let i = 0; i < targets.length; i += 1) {
      if (amounts[i] > 0 && priorNeedsLethal && (choice.overrideOrder !== true || targets[i].defender === true))
        return "Assign lethal damage to the required blockers before assigning damage onward";
      priorNeedsLethal = priorNeedsLethal || amounts[i] < targets[i].lethal;
    }
  }
  if (amounts.reduce((a, b) => a + b, 0) !== choice.total) return `Assign exactly ${choice.total} damage before confirming`;
  return null;
}

function validateCombatDamage(choice, request) {
  if (request.skip === true) {
    if (choice.maySkip !== true) throw new Error("This damage assignment cannot be skipped");
    return;
  }
  const problem = damageAssignmentProblem(choice, request.amounts);
  if (problem) throw new Error(problem);
}

/* Reordering the top of a library, where some cards may not be moved (a revealed card that must
   stay put, for instance). The fixed cards keep their relative order, and a movable card may only
   go where the effect allows. */
function validateManipulateOrder(choice, request) {
  const options = choice.options ?? [];
  const submitted = request.indices;
  const originalFixed = [];
  const submittedFixed = [];
  let firstFixed = options.length;
  let lastFixed = -1;
  for (let i = 0; i < options.length; i += 1) if (options[i].movable !== true) originalFixed.push(i);
  for (let position = 0; position < submitted.length; position += 1) {
    const index = submitted[position];
    if (options[index].movable !== true) {
      submittedFixed.push(index);
      firstFixed = Math.min(firstFixed, position);
      lastFixed = Math.max(lastFixed, position);
    }
  }
  if (submittedFixed.length !== originalFixed.length
      || submittedFixed.some((n, i) => n !== originalFixed[i]))
    throw new Error("Cards that cannot move must remain in their original order");
  if (choice.toAnywhere === true) return;
  const toTop = choice.toTop === true, toBottom = choice.toBottom === true;
  for (let position = 0; position < submitted.length; position += 1) {
    const index = submitted[position];
    if (options[index].movable !== true) continue;
    const legal = (toTop && position < firstFixed)
      || (toBottom && position > lastFixed)
      || (!toTop && !toBottom && position === index);
    if (!legal) throw new Error("Move selectable cards only to the allowed top or bottom area");
  }
}

function validateIndices(choice, request) {
  const indices = request.indices;
  const size = (choice.options ?? []).length;
  const min = choice.min ?? 0, max = choice.max ?? 0;
  if (!Array.isArray(indices) || indices.length < min || indices.length > max)
    throw new Error("Select the required number of options");
  const seen = new Set();
  for (const n of indices) {
    if (!Number.isInteger(n) || n < 0 || n >= size || seen.has(n)) throw new Error("Invalid selection");
    seen.add(n);
  }
  /* SOME CHOICES OFFER THE SAME THING SEVERAL WAYS. Declaring attackers lists one option per
     creature per defender, so two distinct indices can name the same creature — and a creature
     attacks once (CR 508.1a). The record says which field has to stay unique, and every answerer is
     held to it here rather than each being trusted to work it out. */
  if (choice.exclusiveBy) {
    const used = new Set();
    for (const n of indices) {
      const key = (choice.options ?? [])[n]?.[choice.exclusiveBy];
      if (key !== undefined && used.has(key)) throw new Error("Invalid selection");
      used.add(key);
    }
  }
  /* AND SOME OPTIONS MAY BE TAKEN ONLY SO MANY TIMES BETWEEN THEM: "no more than one creature can attack The Eternal
     Wanderer each combat" (CR 508.1c) -- at most `most[value]` of the options whose `by` field has that value. Refused with
     the record's own words for it (`why`), which say what to do instead. */
  if (choice.capped) {
    const counts = new Map();
    for (const n of indices) {
      const key = (choice.options ?? [])[n]?.[choice.capped.by];
      if (key === undefined || choice.capped.most?.[key] === undefined) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (counts.get(key) > choice.capped.most[key]) throw new Error(choice.capped.why?.[key] ?? "Invalid selection");
    }
  }
  /* AND SOME OPTIONS MUST BE AMONG THOSE TAKEN: "other Goblin creatures you control attack each combat if able" (CR 508.1d)
     -- at least `least` of the options whose `by` field is one of `values`, each value once. Refused with the record's own
     words (`why`): which, and what to do instead. */
  for (const need of Array.isArray(choice.requires) ? choice.requires : []) {
    const met = new Set(indices.map((n) => (choice.options ?? [])[n]?.[need.by]).filter((value) => (need.values ?? []).includes(value)));
    if (met.size < (need.least ?? 0)) throw new Error(need.why ?? "Invalid selection");
  }
  if (choice.choiceKind === "manipulate") validateManipulateOrder(choice, request);
}

/* ---- ok / cancel / card / player, translated onto the pending choice ---- */

function translate(choice, request) {
  if (request.kind === "answer") return request;
  if (request.kind === "cancel") {
    if (choice.maySkip !== true && choice.mode !== "text")
      throw new Error("Cancel is unavailable on this choice");
    return {...request, kind: "answer", choiceId: choice.id, cancel: true};
  }
  if (request.kind === "ok") {
    /* The board's OK button confirms the obvious answer: nothing for an acknowledgment, and the
       first option for a yes-or-no, which is how the bridge orders them. */
    const indices = choice.mode === "ack" ? [] : [0];
    return {...request, kind: "answer", choiceId: choice.id, indices};
  }
  /* A card or player click names the thing, not its position. Finding which option it is here is
     what lets the board keep sending exactly what it sends today. */
  const key = request.kind === "card" ? "cardId" : "playerId";
  const at = (choice.options ?? []).findIndex((option) => option[key] === request.targetId);
  if (at < 0) throw new Error("Invalid selection");
  return {...request, kind: "answer", choiceId: choice.id, indices: [at]};
}

/**
 * A controller: the one place a decision is offered, answered and checked.
 *
 * @param {?object} resume  a `checkpoint()` to continue from, so a game resumes mid-decision
 */
export function createController(resume = null) {
  let revision = resume?.revision ?? 0;
  let pending = resume?.pending ? structuredClone(resume.pending) : null;
  let answered = resume?.answered ? structuredClone(resume.answered) : null;
  const receipts = new Map(resume?.receipts ?? []);
  const payloads = new Map(resume?.payloads ?? []);

  function receiptFor(actionId) {
    const value = {accepted: true, actionId};
    receipts.set(actionId, value);
    if (receipts.size > RECEIPT_LIMIT) {
      const oldest = receipts.keys().next().value;
      receipts.delete(oldest);
      payloads.delete(oldest);
    }
    return value;
  }

  const api = {
    get revision() { return revision; },
    get pending() { return pending; },
    get answered() { return answered; },
    get receiptCount() { return receipts.size; },

    /**
     * Offer a choice. One at a time: two open questions is how an answer lands on the wrong one.
     */
    offer(choice) {
      if (pending) throw new Error("A choice is already pending; the engine asks one at a time");
      validateChoice(choice);
      pending = structuredClone(choice);
      answered = null;
      revision += 1;
      return pending;
    },

    /**
     * Answer the pending choice. Returns the receipt, or throws with the board's own message.
     */
    answer(request) {
      const actionId = request?.actionId;
      if (typeof actionId !== "string" || !UUID.test(actionId)) throw new Error("Invalid action id");

      /* A retry is not a second decision. The same id with the same content returns the same
         receipt and applies nothing; with different content it is a client bug, and accepting it
         silently would lose whichever decision came second. */
      const body = JSON.stringify(request);
      if (receipts.has(actionId)) {
        if (payloads.get(actionId) !== body) throw new Error("Action id was reused with different content");
        return receipts.get(actionId);
      }

      if (request.revision !== revision)
        throw new Error("The board changed. Review the refreshed choice and try again.");
      if (!pending || answered) throw new Error("This choice has expired");

      const answer = translate(pending, request);
      if (answer.choiceId !== pending.id) throw new Error("This choice has expired");

      if (answer.cancel !== true || pending.mode !== "text") {
        if (pending.mode === "damage") validateCombatDamage(pending, answer);
        else if (pending.mode === "amount") validateGenericAmount(pending, answer);
        else if (pending.mode === "integer") {
          const value = answer.value;
          const min = pending.min ?? 0, max = pending.max ?? 0;
          if (!Number.isFinite(value) || !Number.isInteger(value) || value < min || value > max)
            throw new Error("Number outside allowed range");
        } else if (pending.mode === "text") {
          if (typeof answer.text !== "string" || answer.text.length > 1000)
            throw new Error("Enter a response of at most 1000 characters");
          if (pending.numeric === true && !/^[0-9]+$/.test(answer.text))
            throw new Error("Enter a whole number");
        } else if (answer.cancel !== true) {
          validateIndices(pending, answer);
        }
      }

      answered = structuredClone(answer);
      payloads.set(actionId, body);
      /* The bridge moves the revision on acceptance as well as on consumption, so a board that
         re-reads between the two sees its answer in flight rather than the question again. A
         retried action returns from the receipt cache above and moves nothing. */
      revision += 1;
      return receiptFor(actionId);
    },

    /**
     * The engine takes the answer and the choice closes. Throws if nothing has answered yet, which
     * would otherwise be a silent "the engine carried on without being told".
     */
    take() {
      if (!answered) throw new Error("There is no answer to take");
      const value = answered;
      pending = null;
      answered = null;
      revision += 1;
      return value;
    },

    /** The controller's half of a checkpoint (§3.2.4). Plain data, like everything else. */
    checkpoint() {
      return {
        schema: "CrankEngineController@1",
        revision,
        pending: pending ? structuredClone(pending) : null,
        answered: answered ? structuredClone(answered) : null,
        receipts: [...receipts.entries()],
        payloads: [...payloads.entries()],
      };
    },
  };

  return api;
}
