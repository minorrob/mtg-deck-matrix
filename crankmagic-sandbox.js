/* THE SANDBOX (Rob, 14 September; plan §2.6–2.8). A table you play on is a table where picking a
 * card up and putting it somewhere else is not a decision yet. Until this module the Cards page
 * had the opposite contract: every drop, every Status fly-out, every Move to… opened a receipt
 * and wrote a revision, so trying an arrangement out meant forty confirmations and forty undos.
 *
 * WHAT IT HOLDS. An ordered list of intended moves, one per row at most:
 *
 *   {id, rowId, cardId, cardName, quantity, kind, lotId, deckId, slotId,
 *    action, arg, box, asStandIn, from, to, toStatus, label, at}
 *
 * `action` is the verb the drop target named (the same seven `accepts()` returns), `arg` its
 * argument, and `from`/`to` are what the reader sees. Staging the same row again REPLACES its
 * move, because a card can only be going to one place; that is what makes staging idempotent.
 *
 * WHAT IT NEVER DOES. It never writes to the library. `preview(state)` folds the moves through
 * the model's own `apply` on a *copy* and hands back the state as it would be, which is what
 * every lens on the Cards page reads: List, Table and Sheet are then three drawings of one
 * pending truth rather than three views that can disagree (Rob: "never independently manipulated
 * out of sync with one another"). `build(state)` returns the same fold as commands, in order,
 * for Confirm to send as ONE batch — one revision, one undo, one receipt.
 *
 * WHY THE FOLD IS THE VALIDATION. Between staging and Confirm the model's guards can start
 * refusing: a deck's requirement was filled by something else, a lot was merged away, a deck
 * left `final`. Rather than guess, every move is applied to the working copy as it is built, and
 * a move the model throws on is recorded as a refusal with the model's own sentence and left out
 * of the batch. So the preview and the receipt can never promise something Confirm would fail to
 * do, and nothing is ever half-applied.
 *
 * THE SITTING SURVIVES A RELOAD, AND STILL NEVER TOUCHES THE LIBRARY (§2.7). The moves are
 * written to `localStorage` — the same place the card size and the Bench fold already live —
 * stamped with the library revision they were staged against. On load the fold runs again and
 * anything the library has moved past is dropped BY NAME rather than silently. Storage is
 * injected, so the Node suite runs the whole life-cycle without a browser.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CrankSandbox = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = 1;
  const KEY = "cm-sandbox";
  const LIMIT = 90;   /* the model's batch takes 100; leave room for a move that needs two commands */
  /* `hold` and `tray` are the play space's two (plan §2.1, §2.3): the middle of the table, and one
     of the four trays beside it. They are separate verbs from `release` and `reserve` rather than
     the same ones with a flag, because they mean different things. Dropping a card in the middle
     takes it out of whatever held it AND files it in the deck's group, which is what makes it
     Watched for that deck; dropping one in a tray BUILDS THE DECK'S LIST as well as reserving the
     copy, which plain Reserved must never do. */
  const ACTIONS = new Set(["source", "bench", "release", "place", "standin", "reserve", "group", "hold", "tray"]);

  /* The one place a move's destination is spelled, so the pile, the badge and the receipt
     cannot disagree about what a drop meant. */
  const SOURCE_STATUS = { owned: "Bench", ordered: "Ordered", watching: "Watched" };

  function memoryStore() {
    const map = new Map();
    return {
      get: (k) => (map.has(k) ? map.get(k) : null),
      set: (k, v) => { map.set(k, String(v)); },
      remove: (k) => { map.delete(k); },
    };
  }

  /* localStorage throws in a private window and in some embedded views; a sitting that cannot be
     remembered is still a sitting, so every call is guarded and failure is silent by design. */
  function browserStore() {
    return {
      get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
      set(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) { /* not remembered, still staged */ } },
      remove(k) { try { localStorage.removeItem(k); } catch (e) { /* nothing to do */ } },
    };
  }

  function defaultStore() {
    return typeof localStorage !== "undefined" ? browserStore() : memoryStore();
  }

  const uid = () => "mv" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  function create(options) {
    const opts = options || {};
    const model = opts.model || (typeof globalThis !== "undefined" ? globalThis.CrankCollection : null);
    if (!model) throw Error("The sandbox needs the collection model.");
    const store = opts.storage || defaultStore();
    const key = opts.key || KEY;

    let moves = [];
    let stamp = null;          /* the library revision the sitting was last folded against */
    let held = 0;              /* > 0 while a Confirm is in flight: see hold() */
    let cache = null;          /* {signature, state, commands, refusals} */

    const signature = (state) =>
      String(state && state.revision) + "|" + moves.map((m) => m.id + ":" + m.action + ":" + (m.arg || "") + ":" + (m.deckId || "")).join(",");

    /* THE FOLD. One pass, in order, over a working copy: build each move's commands against the
       state the moves before it produced, apply them, and keep going. A throw anywhere in a move
       takes the whole move out — never half of it — with the model's own sentence as the reason. */
    function fold(state) {
      const commands = [];
      const refusals = [];
      let work = state;
      let n = 0;
      for (const mv of moves) {
        let made;
        try {
          made = commandsFor(model, work, mv);
        } catch (error) {
          refusals.push({ id: mv.id, cardName: mv.cardName, to: mv.to, why: error.message });
          continue;
        }
        let next = work;
        let ok = true;
        for (const part of made) {
          try {
            next = model.apply(next, Object.assign({ id: "sandbox:" + mv.id + ":" + ++n, confirmed: true }, part)).state;
          } catch (error) {
            refusals.push({ id: mv.id, cardName: mv.cardName, to: mv.to, why: error.message });
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        work = next;
        for (const part of made) commands.push(part);
      }
      return { state: work, commands, refusals };
    }

    function run(state) {
      const sig = signature(state);
      if (!cache || cache.signature !== sig) cache = Object.assign({ signature: sig }, fold(state));
      return cache;
    }

    function save(revision) {
      if (revision !== undefined) stamp = revision;
      if (!moves.length) { store.remove(key); return; }
      store.set(key, JSON.stringify({ version: VERSION, revision: stamp, moves }));
    }

    const api = {
      get moves() { return moves.slice(); },
      get size() { return moves.length; },
      get revision() { return stamp; },
      get open() { return moves.length > 0; },

      /* Stage a move. The row's own facts travel with it, so the fold can rebuild the command
         without the UI's derived rows; the model decides later whether it still holds. */
      stage(move) {
        const mv = move || {};
        if (!ACTIONS.has(mv.action)) throw Error("That destination is not one a card can be moved to.");
        if (!mv.rowId) throw Error("A staged move needs the row it is moving.");
        const at = mv.at || new Date().toISOString();
        const staged = {
          id: uid(), rowId: String(mv.rowId), cardId: mv.cardId || "", cardName: mv.cardName || "This card",
          quantity: Number(mv.quantity) || 1, kind: mv.kind || "lot", lotId: mv.lotId || "",
          deckId: mv.deckId || "", deckName: mv.deckName || "", slotId: mv.slotId || "",
          action: mv.action, arg: mv.arg || "", box: mv.box || "", asStandIn: !!mv.asStandIn,
          tray: Math.max(0, Math.min(4, Number(mv.tray) || 0)),
          from: mv.from || "", to: mv.to || "", toStatus: mv.toStatus === undefined ? mv.to || "" : mv.toStatus,
          label: mv.label || "", at,
        };
        const already = moves.findIndex((m) => m.rowId === staged.rowId);
        if (already >= 0) moves[already] = Object.assign(staged, { id: moves[already].id });
        else {
          if (moves.length >= LIMIT) throw Error(`A sitting holds ${LIMIT} moves. Confirm or discard what is staged before staging more.`);
          moves.push(staged);
        }
        cache = null;
        save();
        return staged;
      },

      /* One row, one pending move — so a lens can ask a row what it is doing without a search. */
      pendingFor(rowId) { return moves.find((m) => m.rowId === String(rowId)) || null; },
      pendingCard(cardId) { return moves.find((m) => m.cardId === cardId) || null; },
      get cards() { return new Set(moves.map((m) => m.cardId).filter(Boolean)); },

      remove(id) {
        const at = moves.findIndex((m) => m.id === id);
        if (at < 0) return null;
        const [gone] = moves.splice(at, 1);
        cache = null;
        save();
        return gone;
      },
      /* Step back inside the sandbox (§2.14): the last thing you did, undone, without a revision. */
      stepBack() { return moves.length ? api.remove(moves[moves.length - 1].id) : null; },
      discard() { const n = moves.length; moves = []; cache = null; stamp = null; store.remove(key); return n; },

      /* THE ONE OVERLAY EVERY LENS READS THROUGH. Not a per-row patch -- the whole library as it
         would be, so a count, a matrix cell and a pile all come from the same arithmetic. */
      preview(state) { return moves.length ? run(state).state : state; },
      build(state) { const r = run(state); return { commands: r.commands.slice(), refusals: r.refusals.slice(), state: r.state }; },
      refusals(state) { return moves.length ? run(state).refusals.slice() : []; },

      /* Fold once and forget what no longer applies, naming it. Called on load and whenever the
         library moves under an open sitting (another tab confirmed; a backup was restored). */
      revalidate(state) {
        if (held) return { dropped: [] };
        if (!moves.length) { stamp = state ? state.revision : null; return { dropped: [] }; }
        const { refusals } = run(state);
        const dropped = [];
        for (const r of refusals) {
          const gone = moves.find((m) => m.id === r.id);
          if (gone && !dropped.some((d) => d.id === r.id)) dropped.push({ id: r.id, cardName: gone.cardName, to: gone.to, why: r.why });
        }
        if (dropped.length) moves = moves.filter((m) => !dropped.some((d) => d.id === m.id));
        cache = null;
        save(state ? state.revision : null);
        return { dropped };
      },

      /* A sitting written by an older shape of this module is dropped rather than guessed at. */
      load(state) {
        let raw = null;
        try { raw = JSON.parse(store.get(key) || "null"); } catch (error) { raw = null; }
        if (!raw || raw.version !== VERSION || !Array.isArray(raw.moves)) { moves = []; stamp = state ? state.revision : null; cache = null; store.remove(key); return { dropped: [], restored: 0, moved: false }; }
        moves = raw.moves.filter((m) => m && ACTIONS.has(m.action) && m.rowId).slice(0, LIMIT);
        stamp = raw.revision === undefined ? null : raw.revision;
        cache = null;
        const restored = moves.length;
        const moved = !!state && stamp !== null && stamp !== state.revision;
        const { dropped } = api.revalidate(state);
        return { dropped, restored, moved };
      },

      /* HOLD STILL WHILE A CONFIRM IS IN FLIGHT. Applying the sitting's own batch makes every
         move in it refusable a moment later -- the copy has already moved -- and the app
         re-validates after every save. Without this the reader would be told their sitting was
         dropped at the instant it succeeded. Held is released when the dialog closes, whichever
         way it closed, so a cancelled Confirm leaves the sitting exactly as it was. */
      hold() { held += 1; },
      release() { held = Math.max(0, held - 1); },
      get held() { return held > 0; },
      save,
      VERSION, LIMIT,
    };
    return api;
  }

  /* THE SEVEN DESTINATIONS, AS COMMANDS. One move makes one command wherever the model allows it,
     so a refusal names one card rather than a group of them. `reserve` is the exception that has
     to look at the state: which seat in the deck's list this copy fills is decided by what is
     still short AT THE MOMENT OF THE FOLD, not at the moment of the drop. */
  function commandsFor(model, state, mv) {
    const plan = mv.kind === "need" || mv.kind === "draft";
    switch (mv.action) {
      case "source": {
        const source = mv.arg;
        if (!source) throw Error("That move has no source.");
        if (plan) {
          if (!mv.deckId || !mv.slotId) throw Error(`${mv.cardName} is no longer a seat in a deck's list.`);
          return [{ type: "acquireSlots", deckId: mv.deckId, source, slotIds: [mv.slotId], quantities: { [mv.slotId]: mv.quantity } }];
        }
        return [{ type: "bulk", op: "source", source, lotIds: [lotOf(model, state, mv)] }];
      }
      case "bench": return [{ type: "bulk", op: "bench", lotIds: [lotOf(model, state, mv)] }];
      case "release": return [{ type: "bulk", op: "release", lotIds: [lotOf(model, state, mv)] }];
      case "place":
      case "standin": {
        const deck = deckOf(model, state, mv);
        const command = { type: "bulk", op: "place", deckId: deck.id, box: mv.box || "", lotIds: [lotOf(model, state, mv)] };
        if (mv.action === "standin" || mv.asStandIn) command.asStandIn = true;
        return [command];
      }
      case "reserve": {
        const deck = deckOf(model, state, mv);
        const lot = model.lot(state, lotOf(model, state, mv));
        const seat = deck.slots.find((x) => x.committed && model.compatible(lot, x) && model.shortfall(state, deck, x) >= lot.quantity);
        if (!seat) throw Error(`${deck.name}’s list does not call for ${mv.cardName}, or already has it.`);
        return [{ type: "allocate", lotId: lot.id, quantity: lot.quantity, deckId: deck.id, slotId: seat.id }];
      }
      case "group": {
        const group = (state.groups || []).find((g) => g.id === mv.arg);
        if (!group) throw Error(`The group ${mv.to || "you chose"} is gone.`);
        return [{ type: "groupLots", groupId: group.id, lotIds: [lotOf(model, state, mv)] }];
      }
      /* THE MIDDLE OF THE TABLE (plan §2.1). "All statuses except owned are cleared" is not a
         field you can set -- status is derived from the copy's source, its reservation and where
         it physically sits. Read as the physical truth it describes, picking a card up means:
         let go of whatever claimed it, take it out of the box it was in, and keep it in view for
         the deck being calibrated. That last part is what the group does -- an owned, unreserved,
         unboxed copy filed in a deck's group IS Watched for that deck (§2.2, shipped in 3a) --
         so the card in your hand reads as considered rather than as nothing at all.

         An ordered copy keeps saying Ordered and a reserved one keeps saying Reserved until the
         release lands: the middle never claims a card arrived that has not (§2.1's second row),
         because filing changes no source. */
      case "hold": {
        const lot = model.lot(state, lotOf(model, state, mv));
        if (lot.source === "watching") throw Error(`${mv.cardName} is a card you are considering, not a copy you can pick up.`);
        const out = [];
        if (lot.allocation) out.push({ type: "bulk", op: "release", lotIds: [lot.id] });
        if (lot.location && lot.location.kind === "deck") out.push({ type: "bulk", op: "bench", lotIds: [lot.id] });
        if (!mv.arg) {
          if (!out.length) throw Error(`${mv.cardName} is already free — there is nothing to let go of.`);
          return out;
        }
        const group = (state.groups || []).find((g) => g.id === mv.arg);
        if (!group) throw Error(`The group ${mv.to || "this deck keeps"} is gone.`);
        out.push({ type: "groupLots", groupId: group.id, lotIds: [lot.id] });
        return out;
      }
      /* A TRAY BUILDS THE LIST (plan §2.3). Reserving needs a seat, and while a hundred is being
         assembled most tray cards are ones the list does not name yet -- so a tray does two
         things where plain Reserved does one: put the card on the deck's main list, then hold
         your copy for that seat. The second half comes free: `target` on a finalized deck runs
         the model's own `satisfy`, which reserves an eligible copy for the seat it just made.
         Where a seat already stands open the copy goes straight into it and the list is left
         alone -- the same drop, the smaller change. */
      case "tray": {
        const deck = deckOf(model, state, mv);
        const lot = model.lot(state, lotOf(model, state, mv));
        const seat = deck.slots.find((x) => x.committed && model.compatible(lot, x) && model.shortfall(state, deck, x) >= lot.quantity);
        if (seat) return [{ type: "allocate", lotId: lot.id, quantity: lot.quantity, deckId: deck.id, slotId: seat.id }];
        if (lot.source === "watching") throw Error(`${mv.cardName} is a card you are considering, not a copy that can be reserved.`);
        const listed = deck.slots.find((x) => x.purpose === "main" && x.cardId === lot.cardId);
        return [{ type: "target", deckId: deck.id, cardId: lot.cardId, quantity: (listed ? listed.quantity : 0) + lot.quantity, confirmed: true }];
      }
      default: throw Error("That destination is not one a card can be moved to.");
    }
  }

  function lotOf(model, state, mv) {
    if (!mv.lotId) throw Error(`${mv.cardName} is not a copy that can be moved.`);
    model.lot(state, mv.lotId);   /* throws, by name, when the copy has been merged or spent */
    return mv.lotId;
  }

  function deckOf(model, state, mv) {
    if (!mv.deckId) throw Error(`${mv.cardName} has no deck to move to.`);
    const deck = model.deck(state, mv.deckId);
    if (deck.archived) throw Error(`${deck.name} is archived.`);
    return deck;
  }

  /* The sentence the bar, the badge and the receipt all use for one move. */
  function describe(mv) {
    switch (mv.action) {
      case "source": return `${mv.cardName} → ${SOURCE_STATUS[mv.arg] || mv.to}`;
      case "bench": return `${mv.cardName} → the Bench`;
      case "release": return `${mv.cardName} → reservation released`;
      case "place": return `${mv.cardName} → ${mv.deckName || "a physical deck"}`;
      case "standin": return `${mv.cardName} → ${mv.deckName || "a physical deck"} as a substitute`;
      case "reserve": return `${mv.cardName} → reserved for ${mv.deckName || "a deck"}`;
      case "group": return `${mv.cardName} → ${mv.to || "a group"}`;
      case "hold": return `${mv.cardName} → in hand${mv.deckName ? `, watched for ${mv.deckName}` : ""}`;
      case "tray": return `${mv.cardName} → tray ${mv.tray || 1}: on ${mv.deckName || "the deck"}’s list and reserved`;
      default: return `${mv.cardName} → ${mv.to}`;
    }
  }

  return { create, describe, commandsFor, VERSION, KEY, LIMIT, ACTIONS, SOURCE_STATUS, memoryStore };
});
