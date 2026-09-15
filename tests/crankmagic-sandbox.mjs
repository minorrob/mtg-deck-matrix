/* THE SANDBOX, on the committed live library. The four promises the play space rests on:
 * staging never touches the library, one row holds one move, a move the model would refuse is
 * reported by name and left out of the batch, and Confirm's batch is the staged moves in order.
 * Persistence is exercised through an injected store, so the whole life-cycle — write, reload,
 * revalidate against a library that moved on — runs without a browser. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import path from "node:path";
import {ROOT} from "../schema/index.mjs";
const require = createRequire(import.meta.url);
const S = require(path.join(ROOT, "crankmagic-sandbox.js"));
const M = require(path.join(ROOT, "collection-model.js"));

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const throws = (fn, m) => { assert.throws(fn); checks++; };

const live = JSON.parse(readFileSync(path.join(ROOT, "data/live-state.json"), "utf8")).payload.state;
const frozen = JSON.stringify(live);
const make = (store) => S.create({model: M, storage: store || S.memoryStore(), key: "test-sitting"});
const name = (id) => (live.cards[id] || {}).name || id;

/* The rows a reader actually drags: the model's own projection, which is what the Cards page
   reads before the sandbox lays a sitting over it. */
const rows = M.projection(live);
const benched = rows.filter((r) => r.kind === "lot" && r.source === "owned" && !r.allocation && r.placement === "Bench");
const reserved = rows.filter((r) => r.kind === "lot" && r.allocation && r.placement === "Reserved");
const needs = rows.filter((r) => r.kind === "need");
ok(benched.length > 3, `the live library has a Bench to play with (${benched.length} rows)`);
ok(reserved.length > 0, `and reserved copies to move (${reserved.length} rows)`);
ok(needs.length > 0, `and seats still to buy (${needs.length} rows)`);

const moveFor = (r, extra) => Object.assign({
  rowId: r.recordId, cardId: r.cardId, cardName: name(r.cardId), quantity: r.quantity,
  kind: r.kind, lotId: r.kind === "lot" ? r.id : "", deckId: r.deckId || "", slotId: r.slotId || "",
}, extra);

/* ---- staging never mutates, and one row holds one move ---- */
{
  const sb = make();
  sb.stage(moveFor(benched[0], {action: "source", arg: "watching", to: "Watched", toStatus: "Watched"}));
  eq(sb.size, 1, "one move staged");
  eq(JSON.stringify(live), frozen, "staging did not touch the library");
  sb.stage(moveFor(benched[0], {action: "source", arg: "watching", to: "Watched", toStatus: "Watched"}));
  eq(sb.size, 1, "the same move twice is still one move");
  sb.stage(moveFor(benched[0], {action: "source", arg: "ordered", to: "Ordered", toStatus: "Ordered"}));
  eq(sb.size, 1, "a different destination for the same row replaces it rather than queueing a second");
  eq(sb.moves[0].action + ":" + sb.moves[0].arg, "source:ordered", "and the replacement is what is held");
  sb.stage(moveFor(benched[1], {action: "source", arg: "watching", to: "Watched", toStatus: "Watched"}));
  eq(sb.size, 2, "a second row is a second move");
  eq(sb.moves.map((m) => m.rowId), [benched[0].recordId, benched[1].recordId], "moves keep the order they were staged in");

  /* The preview is the library as it would be — never the library itself. */
  const preview = sb.preview(live);
  ok(preview !== live, "the preview is a copy");
  eq(JSON.stringify(live), frozen, "and folding it left the library alone");
  const before = M.counters(live), after = M.counters(preview);
  ok(after.owned < before.owned, `two owned copies left the owned count (${before.owned} → ${after.owned})`);
  eq(sb.build(live).commands.length, 2, "two moves, two commands");
  eq(sb.build(live).refusals, [], "and nothing refused");

  /* Step back, and discard. */
  const stepped = sb.stepBack();
  eq(stepped.rowId, benched[1].recordId, "step back takes the last move");
  eq(sb.size, 1, "and leaves the rest");
  eq(sb.discard(), 1, "discard reports what it dropped");
  eq(sb.size, 0, "and the sitting is empty");
  eq(sb.preview(live), live, "with no moves the preview is the library itself, not a clone");
}

/* ---- the batch is the moves, in order, as commands the model accepts ---- */
{
  const sb = make();
  const picks = benched.slice(0, 4);
  for (const r of picks) sb.stage(moveFor(r, {action: "source", arg: "watching", to: "Watched", toStatus: "Watched"}));
  const {commands, refusals} = sb.build(live);
  eq(refusals, [], "four Bench copies can all become Watched");
  eq(commands.length, 4, "four moves, four commands");
  eq(commands.map((c) => c.lotIds[0]), picks.map((r) => r.id), "the batch is the staged rows, in order");
  ok(commands.every((c) => c.type === "bulk" && c.op === "source" && c.source === "watching"), "and each is the command the drop target named");
  /* The batch the app sends is these commands under one id: one revision, one undo. */
  const batch = {id: "batch-test", confirmed: true, type: "batch", commands};
  const out = M.apply(live, batch);
  eq(M.counters(out.state).owned, M.counters(sb.preview(live)).owned, "the batch lands exactly where the preview said it would");
  eq(JSON.stringify(live), frozen, "and applying a batch to a copy left the library alone");
}

/* ---- a refused move is reported by name and left out ---- */
{
  const sb = make();
  const good = benched[0];
  sb.stage(moveFor(good, {action: "source", arg: "watching", to: "Watched", toStatus: "Watched"}));
  /* A copy that is not in the library at all: the model throws, the fold names it. */
  sb.stage({rowId: "lot:ghost", cardId: good.cardId, cardName: "A copy that is gone", quantity: 1, kind: "lot", lotId: "lot:ghost", action: "bench", to: "Bench", toStatus: "Bench"});
  /* A deck that does not exist. */
  sb.stage({rowId: "lot:ghost2", cardId: good.cardId, cardName: "A copy with no deck", quantity: 1, kind: "lot", lotId: good.id, deckId: "deck:ghost", action: "reserve", to: "Reserved", toStatus: "Reserved"});
  const {commands, refusals} = sb.build(live);
  eq(commands.length, 1, "only the move that holds is in the batch");
  eq(refusals.length, 2, "and both refusals are reported");
  ok(refusals.every((r) => r.why && r.cardName), "each refusal names the card and says why");
  ok(refusals.some((r) => r.cardName === "A copy that is gone"), "the missing copy is named");
  eq(sb.size, 3, "build reports without dropping anything");
  const {dropped} = sb.revalidate(live);
  eq(dropped.length, 2, "revalidate drops exactly the refused moves");
  eq(sb.size, 1, "and keeps the one that holds");
  eq(sb.build(live).refusals, [], "after which nothing is refused");
}

/* ---- reserve picks the seat at the fold, not at the drop ---- */
{
  const need = needs[0];
  const deck = live.decks.find((d) => d.id === need.deckId);
  const spare = benched.find((r) => r.cardId === need.cardId);
  const sb = make();
  if (spare) {
    sb.stage(moveFor(spare, {action: "reserve", deckId: deck.id, deckName: deck.name, to: "Reserved", toStatus: "Reserved"}));
    const {commands, refusals} = sb.build(live);
    eq(refusals, [], `${name(need.cardId)} can be reserved for ${deck.name}`);
    eq(commands[0].type, "allocate", "reserving is an allocate");
    ok(deck.slots.some((s) => s.id === commands[0].slotId), "onto a seat that deck's list actually holds");
  } else {
    /* No Bench copy happens to fill a seat in the live library; assert the refusal instead, which
       is the same promise seen from the other side. */
    sb.stage(moveFor(benched[0], {action: "reserve", deckId: deck.id, deckName: deck.name, to: "Reserved", toStatus: "Reserved"}));
    const {commands, refusals} = sb.build(live);
    eq(commands.length, 0, "a copy no seat calls for is not reserved");
    ok(/does not call for/.test(refusals[0].why), "and the refusal says the list does not call for it");
  }
}

/* ---- releasing a reservation, and putting a copy in a box ---- */
{
  const sb = make();
  sb.stage(moveFor(reserved[0], {action: "release", to: "Bench", toStatus: "Bench"}));
  const {commands, refusals} = sb.build(live);
  eq(refusals, [], "a reserved copy can be released");
  eq(commands[0].op, "release", "release is a bulk release");
  const finals = live.decks.filter((d) => d.status === "final" && !d.archived);
  const sb2 = make();
  sb2.stage(moveFor(benched[0], {action: "standin", deckId: finals[0].id, deckName: finals[0].name, box: "Box A", to: "Substitute", toStatus: "Substitute"}));
  const built = sb2.build(live);
  eq(built.refusals, [], "a Bench copy can stand in for a seat in a finalized deck");
  eq(built.commands[0].asStandIn, true, "and the command says so");
  eq(built.commands[0].box, "Box A", "carrying the box label the form collected");
}

/* ---- the sitting survives a reload, stamped with the revision it was staged against ---- */
{
  const store = S.memoryStore();
  const sb = make(store);
  sb.stage(moveFor(benched[0], {action: "source", arg: "watching", to: "Watched", toStatus: "Watched"}));
  sb.stage(moveFor(benched[1], {action: "bench", to: "Bench", toStatus: "Bench"}));
  sb.save(live.revision);
  ok(store.get("test-sitting"), "the sitting is written to storage");
  ok(!/"lots"/.test(store.get("test-sitting")), "as intentions, never as a copy of the library");

  const back = make(store);
  const loaded = back.load(live);
  eq(loaded.restored, 2, "both moves come back after a reload");
  eq(loaded.dropped, [], "and neither is dropped against the same library");
  eq(back.revision, live.revision, "the sitting is stamped with the revision it holds against");
  eq(back.build(live).commands.length, 2, "and it still builds the same batch");

  /* The library moves on under an open sitting: the copy one move names is spent. */
  const spent = M.apply(live, {id: "spend", confirmed: true, type: "bulk", op: "source", source: "watching", lotIds: [benched[1].id]}).state;
  const after = make(store);
  const reloaded = after.load(spent);
  ok(reloaded.moved, "a library that moved on is noticed");
  eq(after.size + reloaded.dropped.length, 2, "every staged move is either kept or named as dropped");
  ok(reloaded.dropped.every((d) => d.cardName && d.why), "a dropped move says which card and why");

  /* A sitting written by an older shape of the module is dropped rather than guessed at. */
  const stale = S.memoryStore();
  stale.set("test-sitting", JSON.stringify({version: 0, revision: 1, moves: [{rowId: "x", action: "bench"}]}));
  const fresh = S.create({model: M, storage: stale, key: "test-sitting"});
  eq(fresh.load(live).restored, 0, "a sitting from an older version is not restored");
  eq(stale.get("test-sitting"), null, "and it is cleared rather than left to rot");
}

/* ---- the guards on staging itself ---- */
{
  const sb = make();
  throws(() => sb.stage({rowId: "r", action: "teleport"}), "an unknown destination is refused at staging");
  throws(() => sb.stage({action: "bench"}), "a move with no row is refused");
  eq(sb.size, 0, "and neither one is held");
  for (let i = 0; i < sb.LIMIT; i++) sb.stage({rowId: "row" + i, cardName: "Card " + i, action: "bench", lotId: "lot" + i, to: "Bench"});
  eq(sb.size, sb.LIMIT, `a sitting holds ${sb.LIMIT} moves`);
  throws(() => sb.stage({rowId: "one-too-many", action: "bench", lotId: "l"}), "and says so rather than overflowing the model's batch");
  ok(sb.LIMIT < 100, "the limit leaves room under the model's hundred-command batch");
}

/* ---- PR 3b: the middle of the table, and the trays ----
   The play space's two destinations. `hold` is a card in your hand: it lets go of whatever held
   the copy and files it in the deck's group, which is what makes it Watched FOR that deck --
   the definition PR 3a shipped. `tray` is Reserved, and it builds the deck's list to do it. */
{
  const deck = live.decks.find((d) => !d.archived && d.status === "final" && d.groupId);
  ok(deck, `a finalized deck with a group to calibrate (${deck && deck.name})`);
  const inThisBox = rows.find((r) => r.kind === "lot" && r.source === "owned" && r.allocation && r.allocation.deckId === deck.id);
  ok(inThisBox, "and a reserved copy of its own to pick up");

  /* Picking a reserved copy up: the reservation goes, the box goes, the deck's group stays. */
  const sb = make();
  sb.stage(moveFor(inThisBox, {action: "hold", arg: deck.groupId, deckId: deck.id, deckName: deck.name, to: "In hand", toStatus: "Watched"}));
  const held = sb.build(live);
  eq(held.refusals, [], "picking up a reserved copy is never refused");
  eq(JSON.stringify(live), frozen, "and it did not touch the library");
  ok(held.commands.some((c) => c.op === "release"), "the reservation is let go of");
  ok(held.commands.some((c) => c.type === "groupLots" && c.groupId === deck.groupId), "and the copy is filed in the deck's group");
  const lifted = M.projection(sb.preview(live)).find((r) => r.id === inThisBox.id);
  ok(lifted && !lifted.allocation, "in the preview the copy is reserved for nothing");
  eq(M.statusOf(lifted), "Watched", "and it reads as Watched — considered for this deck, held by it no longer");

  /* A tray is Reserved, and it puts the card on the list to make the seat. */
  const offList = rows.find((r) => r.kind === "lot" && r.source === "owned" && !r.allocation && r.placement === "Bench"
    && !deck.slots.some((x) => x.cardId === r.cardId)
    && !(live.cards[r.cardId].colorIdentity || []).some((c) => !new Set(deck.commanders.flatMap((id) => live.cards[id].colorIdentity || [])).has(c)));
  ok(offList, `a bench copy in colour that ${deck.name}'s list does not name (${offList && name(offList.cardId)})`);
  const tray = make();
  tray.stage(moveFor(offList, {action: "tray", tray: 2, deckId: deck.id, deckName: deck.name, to: "Tray 2", toStatus: "Reserved"}));
  const built = tray.build(live);
  eq(built.refusals, [], "a tray card the list does not name is not refused — the tray builds the list");
  eq(built.commands.map((c) => c.type), ["target"], "with one command: the deck's list now names it");
  const was = M.readiness(live, deck), now = M.readiness(tray.preview(live), M.deck(tray.preview(live), deck.id));
  eq(now.target, was.target + offList.quantity, `the list grows by the copy (${was.target} → ${now.target})`);
  const seated = M.projection(tray.preview(live)).find((r) => r.id === offList.id);
  eq(M.statusOf(seated), "Reserved", "and the copy is reserved for the seat the tray just made");
  eq(JSON.stringify(live), frozen, "the library is still untouched");

  /* Where the list already calls for the card and still lacks it, the tray reserves and leaves
     the list alone: the same drop, the smaller change. */
  const wanted = rows.find((r) => r.kind === "lot" && r.source === "owned" && !r.allocation && r.placement === "Bench"
    && deck.slots.some((x) => x.committed && x.cardId === r.cardId && M.shortfall(live, deck, x) >= r.quantity));
  if (wanted) {
    const t2 = make();
    t2.stage(moveFor(wanted, {action: "tray", tray: 1, deckId: deck.id, deckName: deck.name, to: "Tray 1", toStatus: "Reserved"}));
    eq(t2.build(live).commands.map((c) => c.type), ["allocate"], "an open seat is filled without touching the list");
  } else ok(true, "no open seat on the bench to fill without a list change today");

  /* The guards. A watched card is not a copy you can pick up or reserve; a plan row is a line. */
  const watching = rows.find((r) => r.kind === "lot" && r.source === "watching");
  if (watching) {
    const w = make();
    w.stage(moveFor(watching, {action: "hold", arg: deck.groupId, deckId: deck.id, deckName: deck.name, to: "In hand"}));
    ok(w.build(live).refusals.length === 1, "a watched card cannot be picked up — it is not a copy");
  } else ok(true, "no watched card in the live library today");
  const need = make();
  need.stage(moveFor(needs[0], {action: "tray", tray: 1, deckId: deck.id, deckName: deck.name, to: "Tray 1"}));
  eq(need.build(need.preview(live)).refusals.length, 1, "a To buy seat is not a copy a tray can hold");

  /* The tray number travels with the move, because the middle has four of them. */
  eq(tray.moves[0].tray, 2, "a staged tray move remembers which tray");
  eq(make().stage({rowId: "r", action: "hold", lotId: "l"}).tray, 0, "and a card in hand is in no tray");
  ok(/tray 2/i.test(S.describe(tray.moves[0])), "the sentence says which tray");
  ok(/in hand/i.test(S.describe(sb.moves[0])), "and a card in the middle says it is in hand");
}

/* ---- shelf mode's move: a card the library has never seen, planned into a group (PR 4) ---- */
{
  const group = live.groups[0];
  ok(group, "the live library has a collection group to sort into");
  /* A card in the catalog but not in this library. The move carries the record, because
     `groupEntries` has to add it before it can file an entry for it. */
  const record = {id: "sandbox-test-card", name: "A Card This Library Has Never Seen", typeLine: "Artifact",
    manaValue: 2, colorIdentity: [], oracleText: "", keywords: [], legalities: {commander: "legal"}, price: 1.5};
  ok(!live.cards[record.id], "and does not already hold it");
  const sb = make();
  sb.stage({rowId: "catalog:" + record.id, cardId: record.id, cardName: record.name, quantity: 1, kind: "catalog",
    action: "plan", arg: group.id, to: group.name, toStatus: "Planned", card: record});
  const built = sb.build(live);
  eq(built.refusals, [], "a catalog card files into a group without a refusal");
  eq(built.commands.length, 1, "as one command");
  eq(built.commands[0].type, "groupEntries", "the model's own planned-entry command");
  eq(built.commands[0].cards.length, 1, "carrying the card record, because the library has never seen it");
  eq(built.commands[0].entries[0].cardId, record.id, "and an entry for it");
  const after = built.state.groups.find((g) => g.id === group.id);
  ok(after.entries.some((r) => r.cardId === record.id), "the preview shows it planned in the group");
  ok(!built.state.lots.some((l) => l.cardId === record.id), "and nothing anywhere claims a copy is owned");
  ok(/planned in/.test(S.describe(sb.moves[0])), "the sentence says planned, not owned");
  /* Twice is refused by name rather than filed twice. */
  const twice = make();
  twice.stage({rowId: "catalog:a", cardId: record.id, cardName: record.name, quantity: 1, kind: "catalog", action: "plan", arg: group.id, to: group.name, card: record});
  twice.stage({rowId: "catalog:b", cardId: record.id, cardName: record.name, quantity: 1, kind: "catalog", action: "plan", arg: group.id, to: group.name, card: record});
  eq(twice.build(live).refusals.length, 1, "filing the same card in the same group twice is refused once, by name");
  ok(/already plans/.test(twice.build(live).refusals[0].why), "and says the group already plans it");
  /* A card with no record and no library entry is refused rather than invented. */
  const blind = make();
  blind.stage({rowId: "catalog:x", cardId: "no-such-card-anywhere", cardName: "Nothing", quantity: 1, kind: "catalog", action: "plan", arg: group.id, to: group.name});
  eq(blind.build(live).refusals.length, 1, "a card with no record is refused, not guessed at");
  /* A gone group is named rather than silently skipped. */
  const gone = make();
  gone.stage({rowId: "catalog:y", cardId: record.id, cardName: record.name, quantity: 1, kind: "catalog", action: "plan", arg: "group:gone", to: "Old shelf", card: record});
  ok(/Old shelf/.test(gone.build(live).refusals[0].why), "and a group that is gone is named in the refusal");
  /* Shelf mode's trays ride on the ordinary group move: the tray number travels, the command does not change. */
  const lot = benched[0];
  const trayed = make();
  trayed.stage(moveFor(lot, {action: "group", arg: group.id, to: group.name, tray: 3}));
  eq(trayed.moves[0].tray, 3, "a group move remembers which tray it was dropped in");
  eq(trayed.build(live).commands[0].type, "groupLots", "and is still the same filing command");
  ok(S.ACTIONS.has("plan"), "plan is one of the destinations a sitting can hold");
}

/* ---- the sentence every surface uses for a move ---- */
{
  const said = S.describe({cardName: "Sol Ring", action: "reserve", deckName: "Goblins", to: "Reserved"});
  ok(/Sol Ring/.test(said) && /Goblins/.test(said), "a move describes itself with the card and where it is going");
  ok(/substitute/.test(S.describe({cardName: "Wastes", action: "standin", deckName: "Goblins"})), "a substitute says it is standing in");
  eq(S.SOURCE_STATUS.owned, "Bench", "an owned copy with no deck reads as the Bench");
}

eq(JSON.stringify(live), frozen, "nothing in this suite changed the library");
console.log(`crankmagic-sandbox: ${checks} checks passed — staging, the preview fold, refusals by name, the batch in order, and a sitting that survives a reload.`);
