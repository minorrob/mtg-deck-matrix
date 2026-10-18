/* BUDGETS (docs/budgets.md; Rob, 2026-10-18): "Budgets should be set at per-deck AND account-wide. Neither is a
 * blocker, but a deck's budget does not inherit the account-wide budget. Both are purely informational.
 * Account-wide should be set by the player, then compared against the sum of the per-deck budgets, superseded by
 * the deck's actual cost if greater than the deck's budget." This suite pins, in the model:
 *
 *   1. a deck's cost is its list at recorded prices, and on Rob's library (no deck has a budget) every deck counts
 *      at its cost, so the decks plan exactly what their lists cost together;
 *   2. the worked example: a deck under its budget counts at its budget, a deck over it at its cost, a deck with
 *      none at its cost, and the account's budget is set against that sum -- left, then over;
 *   3. archived and lobby decks plan nothing;
 *   4. no inheritance: an account budget gives no deck a budget, and a deck's read-out never names it;
 *   5. never a blocker: a list over its budget and its per-card cap locks, and a locked list over both still takes
 *      a swap; the definition's read-out says why, and the Commander rules still refuse.
 *
 * The screens read these figures (Settings' Budget card, the Decks page's line, the deck page's Cost card), and
 * tests/settings-r3.mjs walks them in a browser.
 */
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
const require = createRequire(import.meta.url), M = require("../collection-model.js"), Catalog = require("../card-catalog.js");

let checks = 0;
const eq = (a, b, msg) => { checks++; assert.deepEqual(a, b, msg); };
const ok = (c, msg) => { checks++; assert.ok(c, msg); };
const cents = (n) => Math.round(n * 100) / 100;

/* Rob's library as committed, with the shipped catalog behind its card references -- prices and Commander legality --
   normalized as the app's catalog normalizes them. */
const records = JSON.parse(readFileSync(new URL("../data/cards.json", import.meta.url), "utf8")).cards;
const byName = new Map(records.map((c) => [Catalog.folded(c.name), c]));
const live = M.migrate(JSON.parse(readFileSync(new URL("../data/live-state.json", import.meta.url), "utf8")).payload.state);
const full = (id) => { const ref = live.cards[id]; const rec = ref && byName.get(Catalog.folded(ref.name)); return rec ? {...Catalog.normalize(rec), id} : null; };
M.setRecordSource(full);
const priceOf = (cardId) => { const ref = live.cards[cardId], rec = ref && byName.get(Catalog.folded(ref.name)); return Number.isFinite(ref?.price) ? ref.price : rec?.price; };

try {
  /* 1. The cost, and Rob's library. */
  const alive = live.decks.filter((d) => !d.archived && !M.isLobbyDeck(d));
  ok(alive.length >= 7, `Rob's library has its decks (${alive.length})`);
  eq(alive.filter((d) => d.definition.budget !== null), [], "no deck of Rob's has a budget of its own");
  const acct = M.budgets(live);
  for (const d of alive) {
    const mine = cents(d.slots.filter((r) => r.purpose === "main").reduce((n, r) => n + (Number.isFinite(priceOf(r.cardId)) ? priceOf(r.cardId) * r.quantity : 0), 0));
    const row = acct.decks.find((x) => x.deckId === d.id);
    eq([row.budget, row.cost, row.counted, row.over], [null, mine, mine, false], `${d.name}: no budget, so it counts at its cost, the list at recorded prices ($${mine})`);
  }
  eq(acct.planned, cents(acct.decks.reduce((n, x) => n + x.cost, 0)), `so the decks plan what their lists cost together ($${acct.planned})`);
  ok(acct.planned > 0, "and that is a real sum");
  eq([acct.budget, acct.left, acct.over, acct.unbudgeted], [null, null, false, alive.length], "with no account budget, nothing to be left of or over, and every deck unbudgeted");

  /* 2. The worked example, on three of Rob's decks. */
  const [a, b, c] = alive, costA = M.deckBudget(live, a).cost, costB = M.deckBudget(live, b).cost, costC = M.deckBudget(live, c).cost;
  const s = M.clone(live);
  s.decks = s.decks.filter((d) => [a.id, b.id, c.id].includes(d.id));
  s.decks.find((d) => d.id === a.id).definition.budget = cents(costA + 50);
  s.decks.find((d) => d.id === b.id).definition.budget = cents(costB - 20);
  s.preferences = {...s.preferences, accountBudget: 1000};
  const ex = M.budgets(s), row = (d) => ex.decks.find((x) => x.deckId === d.id);
  eq([row(a).counted, row(a).over, row(a).by], [cents(costA + 50), false, 0], `${a.name} is under its budget, so it counts at its budget`);
  eq([row(b).counted, row(b).over, row(b).by], [costB, true, 20], `${b.name} costs $20 more than its budget, so its cost supersedes it`);
  eq([row(c).budget, row(c).counted], [null, costC], `${c.name} has no budget, so it counts at its cost`);
  const planned = cents(costA + 50 + costB + costC);
  eq([ex.budget, ex.planned, ex.left, ex.over], [1000, planned, cents(1000 - planned), false], `the account's $1,000 against $${planned} planned: $${cents(1000 - planned)} left`);
  eq([ex.budgeted, ex.overDecks, ex.unbudgeted], [cents(costA + 50 + costB - 20), 1, 1], "the decks' own budgets, one deck over, one with none");
  s.preferences.accountBudget = 100;
  const tight = M.budgets(s);
  eq([tight.left, tight.over], [cents(100 - planned), true], "a smaller account budget is over by the difference, and says so");
  s.preferences.accountBudget = 0;
  eq(M.budgets(s).budget, null, "an account budget of zero is no budget");

  /* 3. Archived and lobby decks plan nothing. */
  const shelf = M.clone(s);
  shelf.decks.find((d) => d.id === c.id).archived = true;
  shelf.decks.find((d) => d.id === b.id).kind = "lobby";
  eq(M.budgets(shelf).decks.map((x) => x.deckId), [a.id], "an archived deck and a lobby deck are left out of the sum");

  /* 4. No inheritance. */
  const rich = M.clone(live);
  rich.preferences = {...rich.preferences, accountBudget: 5};
  eq(rich.decks.map((d) => M.deckBudget(rich, d).budget).filter((x) => x !== null), [], "an account budget gives no deck a budget");
  eq(rich.decks.flatMap((d) => M.definitionIssues(rich, d)), [], "and no deck's read-out mentions money it was never given");

  /* 5. Never a blocker. A draft copy of a deck, over its budget and its per-card cap, locks. */
  const draft = M.clone(live), d0 = draft.decks.find((d) => d.id === a.id);
  d0.status = "draft";
  d0.definition = {...d0.definition, budget: 1, perCardCap: 0.01};
  const says = M.definitionIssues(draft, d0);
  ok(says.some((x) => /over its \$1\.00 budget/.test(x)), `the read-out says the list is over its budget: ${says.find((x) => /budget/.test(x))}`);
  ok(says.some((x) => /more than the per-card cap/.test(x)), "and names a card over the per-card cap");
  eq(M.legality(draft, d0), [], `${a.name}'s list is legal, so only money could have stood in the way`);
  const locked = M.apply(draft, {type: "finalize", id: "budgets-lock", deckId: d0.id}).state;
  eq(M.deck(locked, d0.id).status, "final", "and Lock list locks it anyway");
  const main = M.deck(locked, d0.id).slots.find((r) => r.purpose === "main" && !M.deck(locked, d0.id).commanders.includes(r.cardId));
  const dear = Object.keys(locked.cards).map(full).find((x) => x && x.verified && x.legalities?.commander === "legal" && !x.typeLine.includes("Land") && x.colorIdentity.length === 0 && x.price > 1 && !M.deck(locked, d0.id).slots.some((r) => r.cardId === x.id));
  ok(dear, `a colorless card worth more than a dollar to swap in (${dear && dear.name})`);
  const swapped = M.apply(locked, {type: "swap", id: "budgets-swap", deckId: d0.id, slotId: main.id, cardId: dear.id}).state;
  ok(M.deck(swapped, d0.id).slots.some((r) => r.cardId === dear.id), "a locked list over its budget still takes a swap");
  const twice = M.clone(draft), dt = twice.decks.find((d) => d.id === a.id);
  dt.slots.push({...dt.slots.find((r) => r.purpose === "main" && !dt.commanders.includes(r.cardId) && !/Basic/.test(twice.cards[r.cardId]?.typeLine || "")), id: "budgets-dup"});
  assert.throws(() => M.apply(twice, {type: "finalize", id: "budgets-illegal", deckId: dt.id}), /allowed number of copies|must|Commander/, "the Commander rules still refuse a list");
  checks++;
} finally {
  M.setRecordSource(null);
}

console.log(`budgets: ${checks} checks passed — a deck's budget is its own, the account's is set against the decks' budgets or costs, and neither refuses anything.`);
