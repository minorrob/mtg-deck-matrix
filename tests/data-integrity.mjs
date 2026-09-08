/* WHAT THE COMMITTED DATA MUST BE TRUE OF.
 *
 * This was two suites in one file. Half of it validated the committed catalog -- fifty
 * variants, their plans, their prices, their measured rungs and the shipped state file.
 * The other half, a thousand lines of it, read the source of matrix.html and its viewer:
 * the tab grid, the Shop page, the Compare controls, the stylesheet. Those pages were
 * retired, so the assertions describing their markup went with them; nothing they
 * protected can be broken by code that no longer exists.
 *
 * What is left is the half that was always the point, and it is unchanged.
 */
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";
import {existsSync} from "node:fs";

const require = createRequire(import.meta.url);
const Lineup = require("../lineup-model.js");
const variants = JSON.parse(await readFile(new URL("../data/archive/variants.json", import.meta.url), "utf8"));
const buyPlans = JSON.parse(await readFile(new URL("../data/buy-plans.json", import.meta.url), "utf8"));
const cards = JSON.parse(await readFile(new URL("../data/cards.json", import.meta.url), "utf8"));
const simulationSummary = JSON.parse(await readFile(new URL("../data/simulation-summary.json", import.meta.url), "utf8"));
const rungLists = JSON.parse(await readFile(new URL("../data/archive/rung-lists.json", import.meta.url), "utf8"));
const deckPageSource = await readFile(new URL("../deck-page.js", import.meta.url), "utf8");
const slotModelSource = await readFile(new URL("../slot-model.js", import.meta.url), "utf8");
const activeState = JSON.parse(await readFile(new URL("../data/active-state.json", import.meta.url), "utf8"));
const auditedByName = new Map(cards.cards.map((card) => [card.name.toLowerCase(), card]));
for (const card of cards.cards) for (const face of card.name.split(" // ")) auditedByName.set(face.toLowerCase(), card);

assert.equal(variants.decks.length, 10, "expected ten deck roles");
assert.equal(variants.variants.length, 50, "expected fifty variants");

const ids = new Set(variants.variants.map((variant) => variant.id));
assert.equal(ids.size, 50, "variant IDs must be unique");
assert.equal(Object.keys(buyPlans.plans).length, 50, "every Compare variant must have a Buy Picks profile");
assert.deepEqual(new Set(buyPlans.profileVariantIds), ids, "Buy Picks coverage must match the Compare catalog");

// The Compare "About" panel replaced a one-line carousel card with a full dossier per deck --
// every deck object must carry the extended fields it reads, not just title/objective.
const DECK_ABOUT_FIELDS = ["archetype", "whatItIs", "fitAmongTen", "playstyle", "mood", "winCondition", "asksOfYou", "whenToPickThis", "priorityNote"];
for (const deck of variants.decks) {
  const deckVariants = variants.variants.filter((variant) => variant.deckId === deck.id);
  assert.equal(
    deckVariants.length,
    5,
    `deck ${deck.id} must contain five variants`
  );
  for (const field of DECK_ABOUT_FIELDS) {
    assert(typeof deck[field] === "string" && deck[field].length > 20, `deck ${deck.id} must carry a real "${field}" for the About panel`);
  }
  assert(deck.complexity?.tier && deck.complexity?.why, `deck ${deck.id} must carry a complexity tier and rationale`);
  assert(Number.isInteger(deck.priorityRank?.rank) && deck.priorityRank.rank >= 1 && deck.priorityRank.rank <= variants.decks.length, `deck ${deck.id} priority rank must be within 1..${variants.decks.length}`);
  assert(typeof deck.priorityRank?.rationale === "string" && deck.priorityRank.rationale.length > 10, `deck ${deck.id} priority rank must carry a rationale`);
  for (const stageIndex of [0, 1, 2]) {
    assert.deepEqual(
      deckVariants.map((variant) => variant.ranks[stageIndex]).sort(),
      [1, 2, 3, 4, 5],
      `deck ${deck.id} stage ${stageIndex + 1} ranks must be complete`
    );
  }
}
{
  const ranks = variants.decks.map((deck) => deck.priorityRank.rank).sort((a, b) => a - b);
  assert.deepEqual(ranks, variants.decks.map((_, i) => i + 1), "priority ranks must be a complete 1..N ordering with no gaps or duplicates");
}

// Deck 8's "where it fits" and "when to pick this" both count its mono-red builds out loud.
// That copy first went stale silently when a variant was swapped under it, so the count is
// pinned here: swap a deck-8 commander, or give another slot more mono-color builds, and this
// fails rather than leaving the prose quietly wrong.
{
  const identityOf = new Map(cards.cards.map((card) => [card.name, card.colorIdentity]));
  const monoCount = (deckId) => variants.variants
    .filter((variant) => variant.deckId === deckId)
    .filter((variant) => (identityOf.get(variant.commander) || []).length === 1)
    .length;
  const counts = variants.decks.map((deck) => ({id: deck.id, mono: monoCount(deck.id)}));
  const eight = counts.find((entry) => entry.id === 8);
  assert.equal(eight.mono, 3, 'deck 8 says "three of its five builds are mono-red" — update that copy');
  for (const entry of counts) {
    if (entry.id === 8) continue;
    assert(
      entry.mono < eight.mono,
      `deck 8 claims the lineup's most mono-color builds, but deck ${entry.id} now has ${entry.mono}`
    );
    assert(entry.mono < 5, `deck ${entry.id} is now entirely mono-color; no deck record says that of itself`);
  }
}

for (const variant of variants.variants) {
  assert(variant.detailHtml.length > 1000, `${variant.id} must retain its long-form report`);
  assert(!variant.detailHtml.includes("data:image"), `${variant.id} detail must use external card art`);
  assert(variant.mechanics.length > 0, `${variant.id} must expose at least one filterable mechanic`);
  assert.equal(variant.scores.playstyle.length, 3);
  assert.equal(variant.scores.engine.length, 3);
  assert(variant.scores.playstyle.every((stage) => stage.length === 6), `${variant.id} must retain six playstyle scores per stage`);
  assert(variant.scores.engine.every((stage) => stage.length === 6), `${variant.id} must retain six engine scores per stage`);
  assert.equal(variant.scores.growth.length, 2, `${variant.id} must retain growth scoring`);
}

for (const [variantId, plan] of Object.entries(buyPlans.plans)) {
  assert(ids.has(variantId), `${variantId} must map to a Compare variant`);
  assert.equal(plan.variantId, variantId);
  assert.equal(plan.precon.category, "precon");
  assert.equal(plan.precon.typeLine, "Precon", `${variantId} precon must use the compact type label`);
  assert(plan.precon.manaCost, `${variantId} precon must carry its commander's mana cost`);
  if (plan.sourceKind === "original-shopping-guide") assert(plan.planHtml.length > 1000, `${variantId} must retain its complete shopping-guide plan`);
  else assert.equal(plan.sourceKind, "variant-detail-profile", `${variantId} must identify its profile source`);
  assert(plan.baseCards.length > 0, `${variantId} must retain its modeled starting list`);
  assert(plan.baseCards.reduce((sum, card) => sum + card.quantity, 0) > 70, `${variantId} starting list must be substantial enough for deck checks`);
  assert.equal(plan.startingShell.reduce((sum, card) => sum + card.quantity, 0), 100, `${variantId} must model exactly 100 starting cards`);
  assert.equal(plan.startingShell.filter((card) => card.isCommander).reduce((sum, card) => sum + card.quantity, 0), 1, `${variantId} must identify exactly one commander`);
  assert.equal(plan.startingShell.filter((card) => card.isCommander || card.tags.some((tag) => String(tag).toLowerCase() === "commander")).reduce((sum, card) => sum + card.quantity, 0), 1, `${variantId} must expose exactly one commander to the compliance check`);
  if (plan.startingShellKind === "official-precon") assert(!plan.startingShell.some((card) => card.isFlexibleSlot), `${variantId} official precon may not contain unspecified slots`);
  assert(plan.precon.buyRank && plan.precon.buyStrategy && plan.precon.buyFirst, `${variantId} precon must retain its buying plan`);
  assert(plan.precon.commanderNote && plan.precon.tcgplayerUrl, `${variantId} precon must retain commander and purchase detail`);
  assert(plan.required.every((item) => item.category === "tuned"));
  assert.equal(plan.upgrade.length, 0, `${variantId} must merge legacy Upgrade cards into Enhance`);
  assert(plan.enhance.every((item) => item.category === "enhance"));
  assert(plan.enhance.every((item) => !item.price || item.price <= 20), `${variantId} Enhance cards must stay at or below $20`);
  assert(plan.enhance.every((item) => !item.ceiling || item.ceiling <= 20), `${variantId} Enhance ceiling prices must stay at or below $20`);
  assert([...plan.required, ...plan.upgrade, ...plan.enhance, ...plan.max].every((item) => Number.isFinite(item.price)), `${variantId} purchase options must have a current floor price`);
  assert([plan.precon, ...plan.startingShell, ...plan.required, ...plan.upgrade, ...plan.enhance, ...plan.max].every((item) => !Number.isFinite(Number(item.ceiling)) || Number(item.ceiling) <= 0 || Number(item.price) <= Number(item.ceiling)), `${variantId} floor prices may not exceed user-supplied ceilings`);
  assert(plan.max.every((item) => item.category === "max"));
  assert(plan.max.every((item) => item.maxReason && !/market price|purchase cost|card price|dollar/i.test(item.maxReason)), `${variantId} Max cards must have capability-based rationale`);
  assert([...plan.required, ...plan.enhance].every((item) => item.replaces), `${variantId} Tuned and Enhance purchases must name a one-for-one cut`);
  const allItems = [plan.precon, ...plan.required, ...plan.upgrade, ...plan.enhance, ...plan.max];
  // Basic lands are the one card a deck may legally run many copies of, and the only
  // card a plan may therefore carry as more than one row. It has to be able to: a slot
  // holds exactly one card, so "the Bracket 3 build runs one fewer Mountain" can only be
  // said by giving that Mountain a row of its own for the Tier 3 land to take. Every
  // other card is a singleton, and offering one twice is the bug this line catches.
  const singletonChoiceNames = [...plan.startingShell, ...plan.required, ...plan.enhance, ...plan.max]
    .filter((item) => !Lineup.isBasicLandName(item.name))
    .map((item) => item.name.split(" // ")[0].toLowerCase());
  assert.equal(new Set(singletonChoiceNames).size, singletonChoiceNames.length, `${variantId} may not offer the same singleton card in two lineup slots`);
  assert(allItems.every((item) => !String(item.image).startsWith("data:")), `${variantId} must not embed images`);
  assert([...plan.required, ...plan.upgrade, ...plan.enhance, ...plan.max].every((item) => item.brief && item.why !== undefined), `${variantId} purchases must retain detail fields`);
  const commander = plan.startingShell.find((card) => card.isCommander);
  const identity = new Set(auditedByName.get(commander.name.toLowerCase()).colorIdentity);
  for (const item of [...plan.startingShell, ...plan.required, ...plan.enhance, ...plan.max].filter((card) => !card.isFlexibleSlot)) {
    const audited = auditedByName.get(item.name.toLowerCase());
    assert(audited, `${variantId}: ${item.name} must exist in the authoritative audit`);
    assert.equal(audited.legalities.commander, "legal", `${variantId}: ${item.name} must be Commander legal`);
    assert(audited.colorIdentity.every((color) => identity.has(color)), `${variantId}: ${item.name} must fit ${commander.name}'s color identity`);
    assert.equal(item.typeLine, audited.typeLine, `${variantId}: ${item.name} must use its audited type line`);
  }
}

assert.equal(cards.missing.length, 0, "all modeled cards must resolve in the authoritative audit");
/* The catalog is shared: the legacy buy plans audited it, and CrankMagic now grows it
   whenever an imported deck names a card it did not hold. So an equality here would
   fail every time somebody imports a real decklist, which is not a defect. What must
   still hold is that the catalog never loses a card the audit verified -- the audit's
   conclusions are only good while every card it checked is still there. */
assert.ok(cards.cards.length >= buyPlans.cardAudit.cardsVerified,
  `the catalog holds ${cards.cards.length} cards but the audit verified ${buyPlans.cardAudit.cardsVerified} — cards have been removed, so the audit no longer describes it`);
assert.match(buyPlans.enhanceDefinition, /\$20/, "Enhance definition must state the $20 limit");
assert.match(buyPlans.maxDefinition, /Tier 3/i, "Max must be defined by the Tier 3 capability ceiling");
assert.match(buyPlans.maxDefinition, /rather than card price/i, "Max may not be classified by cost");

// Ladder shape, checked on the six decks the workbook originally described.
// Every variant now carries every category as an array, because the sweep bakes
// a Tuned and a Pod Fun ladder for all fifty (tools/sim/bake-ladders.mjs); an
// empty array is a rung the sweep found nothing to change at, which is a real
// answer and not a missing one.
const NEW_CATEGORIES = ["tuned2", "enhance2", "max2", "funTuned", "funMax", "altTuned", "altMax"];
const ALT_DECKS = new Set(["1o", "3e", "5o"]);
for (const variantId of ["1o", "2c", "3e", "4c", "5o", "6f"]) {
  const plan = buyPlans.plans[variantId];
  for (const category of NEW_CATEGORIES) {
    if ((category === "altTuned" || category === "altMax") && !ALT_DECKS.has(variantId)) {
      assert.equal((plan[category] || []).length, 0, `${variantId} has no alternative commander -- ${category} must stay empty`);
      continue;
    }
    const items = plan[category];
    assert(Array.isArray(items), `${variantId} must have a ${category} array, even if a given rung had no further changes`);
    for (const item of items) {
      assert.equal(item.category, category, `${variantId} ${item.name} (${category}) must self-report its own category`);
      assert(Number.isFinite(item.price), `${variantId} ${item.name} (${category}) must have a finite price`);
      assert(auditedByName.has(item.name.toLowerCase()), `${variantId} ${item.name} (${category}) must exist in the authoritative audit`);
      assert.equal(auditedByName.get(item.name.toLowerCase()).legalities.commander, "legal", `${variantId} ${item.name} (${category}) must be Commander legal`);
    }
  }
  const commanderCandidates = (plan.altTuned || []).filter((item) => item.isCommander);
  if (ALT_DECKS.has(variantId)) assert.equal(commanderCandidates.length, 1, `${variantId} must flag exactly one Alt Tuned item as the alternative commander`);
  else assert.equal(commanderCandidates.length, 0, `${variantId} has no alternative commander to flag`);
}

// Real simulation results (tools/sim/run-sim.mjs --init, ingested into this file). Every
// rung is measured as the exact card list the site publishes for it -- no hill-climbing
// optimizer runs -- so a score describes the deck you would actually buy. Base is never
// simulated; Fun Tuned/Fun Max exist only where the workbook carries a fun-weighted ladder,
// and read as an explicit unmeasured entry (all-null metrics) everywhere else rather than
// silently vanishing. Every measured key carries a finite games/score/winPct and the engine
// generation that actually measured it -- never inferred at render time.
// The published numbers. Every rung either reports a full measurement or says
// plainly that it was not measured; nothing is inferred at render time, and no
// figure survives from an engine that asked a different question.
/* READ, NOT TYPED. This said "v2.6" while the engine had moved twice, so the assertion
   below was pinning the summary to a generation nobody was running any more -- and would
   have gone on passing after a sweep that re-badged the file without re-measuring it.
   Reading it from crankmagic-sim.js makes the assertion mean what it says: the summary
   names the engine the code in this tree would produce. */
const ENGINE = createRequire(import.meta.url)("../crankmagic-sim.js").ENGINE_GENERATION;
const MEASURED_RUNGS = ["Base", "Tuned", "Pod Fun", "Max"];
assert.equal(simulationSummary.engine, ENGINE, `the summary must name the engine that produced it`);
assert(simulationSummary.engineNotes?.[ENGINE], "simulation summary must document the engine generation it references");
assert(typeof simulationSummary.engineBoundaryNote === "string" && simulationSummary.engineBoundaryNote.length > 0, "simulation summary must carry an engine-boundary caveat");
assert(simulationSummary.winRateBand?.floor > 0 && simulationSummary.winRateBand.ceiling > simulationSummary.winRateBand.floor, "the summary must publish the win-rate band its Pod Fun rung was scored against");
assert.deepEqual(Object.keys(simulationSummary.builds).sort(), Object.keys(buyPlans.plans).sort(), "simulation summary's builds must cover every variant with a buy plan");
assert.equal(Object.keys(simulationSummary.builds).length, 50, "the sweep covers exactly 50 variants");

for (const [variantId, deckBuilds] of Object.entries(simulationSummary.builds)) {
  assert.deepEqual(Object.keys(deckBuilds), MEASURED_RUNGS, `${variantId}: simulation summary must report exactly the four rungs`);
  for (const buildName of MEASURED_RUNGS) {
    const metrics = deckBuilds[buildName];
    if (metrics.score == null) {
      assert.equal(metrics.games, null, `${variantId} ${buildName}: an unmeasured rung must not report a game count`);
      continue;
    }
    assert(Number.isFinite(metrics.games) && metrics.games > 0, `${variantId} ${buildName}: a measured build must report a positive game count`);
    assert(Number.isFinite(metrics.score), `${variantId} ${buildName}: a measured build must report a finite score`);
    assert(Number.isFinite(metrics.powerScore), `${variantId} ${buildName}: every rung must report its power on the shared performance vector, or the rungs cannot be compared`);
    assert(Number.isFinite(metrics.winPct) && metrics.winPct > 0 && metrics.winPct < 1, `${variantId} ${buildName}: win rate must be a fraction between 0 and 1`);
    assert(Number.isFinite(metrics.podFunPct), `${variantId} ${buildName}: every rung must report how the table's night went`);
    assert.equal(metrics.engine, ENGINE, `${variantId} ${buildName}: rung scores must come from the ${ENGINE} sweep`);
    assert([2, 3].includes(metrics.tier), `${variantId} ${buildName}: every rung must name the bracket it was measured against`);
  }
  // Base is Tier 2 except where the commander is itself a Game Changer, which
  // makes Tier 2 permanently unreachable and the whole deck published as Tier 3.
  const shellCommander = buyPlans.plans[variantId].startingShell.find((card) => card.isCommander);
  assert.equal(deckBuilds.Base.tier, shellCommander?.gameChanger ? 3 : 2, `${variantId}: Base is a Tier 2 rung unless the commander is a Game Changer`);
  assert.equal(deckBuilds.Max.tier, 3, `${variantId}: Max is the Tier 3 rung`);
}

// The invariant the whole constrained-rung design exists to hold: the deck
// optimized to win must be at least as able to win as the one optimized for the
// table's night. It is enforced during the search by a power floor and a
// reconciliation pass, and any variant where it still fails has to be named in
// the summary's own caveats rather than quietly averaged into the medians.
const declaredInversions = new Set((simulationSummary.caveats?.inversions || []).map((row) => row.variantId));
for (const [variantId, deckBuilds] of Object.entries(simulationSummary.builds)) {
  const tuned = deckBuilds.Tuned;
  const podFun = deckBuilds["Pod Fun"];
  if (tuned?.powerScore == null || podFun?.powerScore == null) continue;
  if (podFun.powerScore <= tuned.powerScore + 0.05) continue;
  assert(declaredInversions.has(variantId), `${variantId}: Pod Fun out-powers Tuned by ${(podFun.powerScore - tuned.powerScore).toFixed(1)} and the summary does not admit it in caveats.inversions`);
}
// And the other half of the same promise: a Pod Fun rung that stayed above the
// ceiling is a deck that wins too much to be a good guest, which is exactly the
// thing a reader is spending a hundred dollars to avoid.
const declaredOver = new Set((simulationSummary.caveats?.podFunOverCeiling || []).map((row) => row.variantId));
for (const [variantId, deckBuilds] of Object.entries(simulationSummary.builds)) {
  const podFun = deckBuilds["Pod Fun"];
  if (podFun?.winPct == null) continue;
  if (podFun.winPct <= simulationSummary.winRateBand.ceiling + 0.005) continue;
  assert(declaredOver.has(variantId), `${variantId}: Pod Fun wins ${(podFun.winPct * 100).toFixed(0)}% against a ${(simulationSummary.winRateBand.ceiling * 100).toFixed(0)}% ceiling and the summary does not admit it in caveats.podFunOverCeiling`);
}

/* Compare reads its per-stage figures out of variants.json by index, and those
   arrays are written by tools rather than by the page. When the Max rung gained
   Game Changers, the Maxed column went on showing Tuned's cost, Tuned's card
   count and "0 GC" -- and nothing here noticed, because nothing tied the arrays
   to the hundreds they describe. The stage-note counts had in fact been wrong at
   the Tuned rung since Base was rebuilt, months before that. These four tie them
   together. tools/sim/resync-compare.mjs and tools/sim/reprice.mjs fix a break. */
{
  const STAGE_RUNG = ["Base", "Tuned", "Max"];
  const gameChangerNames = new Set(cards.cards.filter((card) => card.gameChanger).map((card) => card.name.toLowerCase()));
  const priceOf = (name) => Number(auditedByName.get(name.toLowerCase())?.price) || 0;
  const dollars = (text) => Number(String(text).replace(/[^0-9.]/g, ""));
  const held = (list) => (list || []).reduce((sum, entry) => sum + (gameChangerNames.has(entry.name.toLowerCase()) ? (entry.quantity || 1) : 0), 0);

  for (const variant of variants.variants) {
    const pinned = rungLists.variants[variant.id];
    assert.ok(pinned, `${variant.id} has no pinned rung lists`);
    const baseNames = new Set((pinned.Base || []).map((entry) => entry.name.toLowerCase()));

    STAGE_RUNG.forEach((rung, index) => {
      const count = held(pinned[rung]);
      assert.equal(variant.brackets[index].gameChangers, `${count} GC`,
        `${variant.id} ${rung}: the Compare chip says ${variant.brackets[index].gameChangers} but the pinned hundred holds ${count}`);
      // compliance-model refuses a Game Changer at Tier 2, so a rung holding one
      // cannot be labeled Bracket 2 whatever a density estimate scored it.
      if (count > 0) {
        assert.doesNotMatch(variant.brackets[index].label, /^B2/,
          `${variant.id} ${rung} is labeled ${variant.brackets[index].label} while holding ${count} Game Changer(s)`);
      }
    });

    [1, 2].forEach((index) => {
      const stated = /·\s*(\d+)\s*(?:upgrade cards|spells)/.exec(variant.stageNotes?.[index] || "");
      if (!stated) return;
      const beyond = (pinned[STAGE_RUNG[index]] || []).filter((entry) => !baseNames.has(entry.name.toLowerCase())).length;
      assert.equal(Number(stated[1]), beyond,
        `${variant.id} ${STAGE_RUNG[index]} note claims ${stated[1]} cards beyond Base; the pinned hundred has ${beyond}`);
    });

    // The reported bug: Maxed showed Tuned's number. Max is Tuned plus bought
    // Game Changers, so its total is strictly the larger of the two.
    assert.ok(dollars(variant.costs[2]) > dollars(variant.costs[1]),
      `${variant.id} publishes a Maxed build cost of ${variant.costs[2]} against a Tuned cost of ${variant.costs[1]}`);
    // Plan items carry the price they were priced at, which drifts a little from
    // the catalog, so this is a drift check rather than a second calculation.
    const summed = (pinned.Max || []).reduce((sum, entry) => sum + priceOf(entry.name) * (entry.quantity || 1), 0);
    const published = dollars(variant.costs[2]);
    assert.ok(Math.abs(summed - published) <= Math.max(5, published * 0.05),
      `${variant.id} publishes ${variant.costs[2]} for Maxed but its pinned hundred prices at $${summed.toFixed(0)}`);
  }
}



/* ---------------------------------------------------------------------------
   Cards you own that would fill a slot, the mobile Shop, and the basics pool.
   Every assertion below was checked by breaking the code it names and watching
   this file fail; none of them can pass against an empty match.
   --------------------------------------------------------------------------- */

// The basics are a pool, and the note has to say what the pool is made of, because the
// number is a claim about a physical box that nothing in the app can re-derive.
for (const basic of ["plains", "island", "swamp", "mountain", "forest"]) {
  assert.ok((activeState.state.boughtQuantities[basic] || 0) >= 80,
    `${basic} should carry at least the box of eighty`);
}
/* The note has to name the workbook the ledger came from, and that workbook has to be in
   the repository -- otherwise "where did these numbers come from" is answerable only by
   whoever ran the import. Checked by looking the filename up on disk rather than against
   a fixed phrase: the source changes, and a test pinned to the name of the last one fails
   for the wrong reason the first time it does. */
{
  const named = [...activeState.note.matchAll(/([A-Za-z0-9_.-]+\.xlsx)/g)].map((m) => m[1]);
  assert.ok(named.length, "the note must record where ownership came from, by naming the workbook");
  const missing = named.filter((f) => !existsSync(new URL(`../data/source/${f}`, import.meta.url)));
  assert.deepEqual(missing, [],
    `the note names ${missing.join(", ")}, which is not in data/source/ -- commit the sheet or correct the note`);
}
/* Same rule for the pull list: it is the one thing on the Shop that is not derived from
   anything, so the document behind it has to be in the repository, and the tool that reads
   it has to be too. A list nobody can regenerate is a list nobody can correct. */
{
  const pullList = JSON.parse(await readFile(new URL("../data/pull-list.json", import.meta.url), "utf8"));
  assert.ok(existsSync(new URL(`../${pullList.source}`, import.meta.url)),
    `the pull list names ${pullList.source}, which is not in the repository`);
  assert.ok(existsSync(new URL(`../${pullList.generatedBy}`, import.meta.url)),
    `the pull list names ${pullList.generatedBy} as its importer, which is not in the repository`);
  assert.ok(pullList.note && /Max \$/.test(pullList.note),
    "the list must carry the sentence explaining what its ceilings mean");
  /* Every card has to be shoppable: a name to ask for, a count, and a price you will pay.
     A row missing any of the three is one you cannot act on at a booth. */
  const broken = (pullList.cards || []).filter((c) => !c.name || !(c.quantity >= 1) || !(Number(c.ceiling) > 0));
  assert.deepEqual(broken.map((c) => c.name || "(unnamed)"), [],
    "every card on the pull list needs a name, a count and a ceiling");
}
/* The audit is per deck, so where each copy sits is recorded as well as how many there
   are -- a global count cannot say which box holds which copy. */
assert.ok(Object.keys(activeState.state.deckHolds || {}).length === 6,
  "every active deck should carry its audited holdings");
/* Ownership is one record per card now, and the two legacy fields are derived from it
   rather than kept alongside it. Nothing else in the app writes them independently, so a
   drift here means a second writer has appeared. */
const ownedRecords = activeState.state.owned || {};
assert.ok(Object.keys(ownedRecords).length > 300, "the state should carry explicit ownership for every card");
assert.equal(activeState.state.ownershipSchema, 3, "explicit ownership is schema 3");
const derived = Object.entries(ownedRecords).filter(([key, rec]) =>
  (activeState.state.boughtQuantities[key] || 0) !== rec.inHand
  || Boolean(activeState.state.found[key]) !== rec.inHand > 0);
assert.equal(derived.length, 0,
  `found/boughtQuantities disagree with owned on ${derived.length} cards, e.g. ${derived.slice(0, 3).map(([k]) => k).join(", ")}`);
// The manifest and the ownership records have to name the same set of cards.
{
  const slugged = (name) => String(name).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const fromRecords = new Set(Object.entries(ownedRecords).filter(([, r]) => r.ordered > 0).map(([k]) => k));
  const fromManifest = new Set((activeState.orderedNotYetInHand || []).map(slugged));
  const onlyRecords = [...fromRecords].filter((k) => !fromManifest.has(k));
  const onlyManifest = [...fromManifest].filter((k) => !fromRecords.has(k));
  assert.equal(onlyRecords.length + onlyManifest.length, 0,
    `the ordered manifest and the ownership records disagree: ${onlyRecords.slice(0, 3).join(", ")} | ${onlyManifest.slice(0, 3).join(", ")}`);
}

// The manifest has to name cards the state carries a record for, or the list is
// decoration. What "owned" means for those cards -- ordered, not in hand -- is checked
// against the records themselves further down.
{
  const manifest = activeState.orderedNotYetInHand || [];
  assert.ok(manifest.length > 0, "the committed state should carry an ordered manifest");
  const slug = (name) => String(name).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const unmatched = manifest.filter((entry) => !(activeState.state.owned || {})[slug(entry)]);
  assert.equal(unmatched.length, 0,
    `${unmatched.length} ordered names match no owned card, e.g. ${unmatched.slice(0, 3).join(", ")}`);
}

assert.match(deckPageSource, /const SORT_BY = \[\["", "Deck order"\], \["name", "Name A–Z"\], \["name-desc", "Name Z–A"\],\n\s*\["cost-desc", "Cost high–low"\], \["cost", "Cost low–high"\]\];/,
  "Sort by must offer both directions on name and on cost, with deck order as the way back");
assert.match(deckPageSource, /sortSlots\(ctx, rows, \(ctx\.filters \|\| \{\}\)\.sortBy \|\| ""\)/,
  "sorting must happen inside a group, so choosing one never undoes the grouping");


/* Cards picked up and dropped on the bench, then offered on the slots they could fill.
   An option is only useful if it is legal, real, and not already chosen for you. */
{
  const Slot = (await import("../slot-model.js")).default || (await import("../slot-model.js"));
  const yard = activeState.state.liveSalvage || {};
  assert.ok(Object.keys(yard).length > 40, "the yard should hold the cards that were added to it");
  const thin = Object.entries(yard).filter(([, e]) => !e.card || !e.card.typeLine || !e.card.name);
  assert.equal(thin.length, 0,
    `${thin.length} yard cards carry no type line, e.g. ${thin.slice(0, 3).map(([k]) => k).join(", ")}`);

  // Every hand-added option has to be legal in the deck it is offered to. Getting this
  // wrong is silent -- the card simply sits there, illegal, until a game says so.
  const cardsByKey = new Map(cards.cards.map((c) => [Slot.ownedKey(c.name), c]));
  const illegal = [];
  const chosen = [];
  for (const [variantId, list] of Object.entries(activeState.state.manualCards || {})) {
    const plan = buyPlans.plans[variantId];
    if (!plan) continue;
    const grafted = {...plan, manual: list.map((c) => ({...c}))};
    const slots = Slot.deckSlots(grafted, activeState.state.buySelections[variantId] || {}, {});
    const seat = slots.find((s) => s.type === "Commander" && s.pick);
    const identity = (seat && (cardsByKey.get(Slot.ownedKey(seat.pick.name)) || {}).colorIdentity) || [];
    assert.ok(identity.length, `${variantId} should have a commander to take its colors from`);
    for (const entry of list) {
      const ci = entry.colorIdentity || [];
      if (!ci.every((c) => identity.indexOf(c) >= 0)) illegal.push(`${variantId}/${entry.name}`);

    }
  }
  assert.equal(illegal.length, 0,
    `${illegal.length} hand-added cards are outside their deck's colors, e.g. ${illegal.slice(0, 3).join(", ")}`);
  /* A card on the bench has to be a copy no box is holding. It may well ALSO be in a box
     -- the audit has Prophetic Prism boxed in deck 3 and a second copy loose -- so the
     test is not "is it in a deck" but "is there a copy left over". Without the spare, one
     of the two records is stale and the same card is being counted twice. */
  const shortBench = [];
  for (const [key, entry] of Object.entries(yard)) {
    const held = (activeState.state.owned[key] || {}).inHand || 0;
    const boxed = Object.values(activeState.state.deckHolds || {})
      .reduce((n, per) => n + ((per[key] || {}).inHand || 0), 0);
    if (held - boxed < (entry.card.quantity || 1)) shortBench.push(`${entry.card.name} (own ${held}, boxed ${boxed})`);
  }
  assert.equal(shortBench.length, 0,
    `${shortBench.length} bench cards have no spare copy behind them, e.g. ${shortBench.slice(0, 3).join(", ")}`);
  void chosen;
}


/* ---------- what a card actually cost ----------
   The Cost column of the master sheet is the record of money spent. It lands in
   state.purchasePrices, keyed by the same slug every other part of the app resolves a
   card by, so a price typed on a Shop row and a price read on a slot are one number. */
{
  const Slot = (await import("../slot-model.js")).default || (await import("../slot-model.js"));
  const prices = activeState.state.purchasePrices || {};
  assert.ok(Object.keys(prices).length > 250,
    `the paid-price ledger should carry the master sheet's costs, found ${Object.keys(prices).length}`);

  const badKey = Object.keys(prices).find((k) => k !== Slot.ownedKey(k));
  assert.equal(badKey, undefined,
    `every paid price must be filed under a slug the app resolves cards by, found ${badKey}`);

  const badValue = Object.entries(prices).find(([, v]) => !Number.isFinite(Number(v)) || Number(v) < 0);
  assert.equal(badValue, undefined, `a paid price must be a real non-negative number, found ${badValue}`);

  // Cents, not fractions of one. A price that will not round-trip through a two-decimal
  // input is a price the Paid box would silently rewrite the moment it was touched.
  const notCents = Object.entries(prices).find(([, v]) => Math.abs(Number(v) * 100 - Math.round(Number(v) * 100)) > 1e-9);
  assert.equal(notCents, undefined, `paid prices are money and must land on a cent, found ${notCents}`);

  /* The prices have to reach the cards actually in the decks, not sit beside them. A card
     the app knows is one in the catalog, on the bench, or hand-added to a slot -- the last
     of those lives only in the state file, so checking the catalog alone would call a
     legitimately priced manual card an orphan. */
  const known = new Set(cards.cards.map((c) => Slot.ownedKey(c.name)));
  Object.keys(activeState.state.liveSalvage || {}).forEach((k) => known.add(k));
  Object.values(activeState.state.manualCards || {})
    .forEach((list) => (list || []).forEach((e) => known.add(Slot.ownedKey(e.name))));
  const orphans = Object.keys(prices).filter((k) => !known.has(k));
  assert.equal(orphans.length, 0,
    `${orphans.length} paid prices name no card the app knows, e.g. ${orphans.slice(0, 3).join(", ")}`);
}

/* Nothing you still have to buy may be priced at zero. Zero reaches the Store two ways --
   a plan entry that was never priced and a catalog miss -- and standing at a table being
   told a ten-dollar card is free is the single most expensive thing this page could do. */
{
  const Slot = (await import("../slot-model.js")).default || (await import("../slot-model.js"));
  const byName = {};
  cards.cards.forEach((c) => { byName[c.name.split(" // ")[0].toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()] = c; });
  const owned = Slot.normalizeOwned(activeState.state);
  const decks = [];
  for (const [variantId, selection] of Object.entries(activeState.state.buySelections || {})) {
    const plan = buyPlans.plans[variantId];
    if (!plan) continue;
    const grafted = {...plan, manual: (activeState.state.manualCards[variantId] || []).map((c) => ({...c}))};
    decks.push({id: variantId, slots: Slot.deckSlots(grafted, selection, {owned, cards: byName})});
  }
  const prices = activeState.state.purchasePrices || {};
  const free = Slot.shopRows(decks, owned, null)
    .filter((r) => r.need > 0 && !(Number(r.price) > 0) && prices[r.key] === undefined);
  assert.equal(free.length, 0,
    `${free.length} cards you still have to buy carry no price at all, e.g. ${free.slice(0, 4).map((r) => r.name).join(", ")}`);
}

/* One rule about a zero price, applied in both places that read one. slot-model has
   always treated a plan price of exactly zero as missing data wearing a zero -- Cabal
   Ritual and City of Traitors are both in that set -- and the sweep's library did not,
   so the cost published under a deck and the cost quoted on its Shop rows disagreed by
   whatever those cards were really worth. */
{
  const libSource = await readFile(new URL("../tools/sim/lib.mjs", import.meta.url), "utf8");
  assert.match(libSource, /price: Number\(\(entry\.item\.price \|\| meta\.price\) \?\? 0\)/,
    "the sweep must fall back to the catalog on a zero plan price, as slot-model does");
  assert.doesNotMatch(libSource, /Number\(entry\.item\.price \?\? meta\.price \?\? 0\)/,
    "?? keeps a zero, which is the bug this replaced");
}

/* ---------- the two ways of counting what you owe must agree ----------
   The Shop can work out what is still needed from the ledger (how many copies exist) or
   from state.deckHolds (which box is holding which copy). Those are the same question and
   have to give the same answer. They did not: the audit sheet recorded eleven Mountains in
   a deck whose plan sleeves twelve, so the holds path put a twelfth Mountain on the
   shopping list against a shelf of eighty of them. A hold is a claim on the pool, so it
   has to be the count the deck actually composes. */
{
  const Slot = (await import("../slot-model.js")).default || (await import("../slot-model.js"));
  const byName = {};
  cards.cards.forEach((c) => { byName[c.name.split(" // ")[0].toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()] = c; });
  const owned = Slot.normalizeOwned(activeState.state);
  const holds = activeState.state.deckHolds || {};

  const decks = [];
  for (const [variantId, selection] of Object.entries(activeState.state.buySelections || {})) {
    const plan = buyPlans.plans[variantId];
    if (!plan) continue;
    const grafted = {...plan, manual: (activeState.state.manualCards[variantId] || []).map((c) => ({...c}))};
    decks.push({id: variantId, slots: Slot.deckSlots(grafted, selection, {owned, cards: byName})});
  }
  assert.ok(decks.length >= 6, "the shipped state should carry the live decks");

  // No box may claim more copies of a card than the collection holds.
  const overclaimed = [];
  const claimTotals = {};
  for (const per of Object.values(holds)) {
    for (const [key, rec] of Object.entries(per)) {
      const t = claimTotals[key] || (claimTotals[key] = {inHand: 0, ordered: 0});
      t.inHand += rec.inHand || 0;
      t.ordered += rec.ordered || 0;
    }
  }
  for (const [key, t] of Object.entries(claimTotals)) {
    const have = owned[key] || {inHand: 0, ordered: 0};
    if (t.inHand > have.inHand) overclaimed.push(`${key}: boxes hold ${t.inHand}, you own ${have.inHand}`);
  }
  assert.equal(overclaimed.length, 0,
    `${overclaimed.length} cards are claimed by more boxes than you own copies, e.g. ${overclaimed.slice(0, 3).join("; ")}`);

  /* Basics are held against the pool, not against a per-deck line. A deck sleeving twelve
     Mountains off a shelf of eighty must be recorded as holding twelve: recording eleven
     put the twelfth on the shopping list, because the Shop reads the holds and not the
     shelf. Non-basics are exempt -- a deck can legitimately be short a copy, which is
     what "still to buy" means. */
  const BASIC = new Set(["plains", "island", "swamp", "mountain", "forest", "wastes"]);
  const shortBasics = [];
  for (const deck of decks) {
    const per = holds[deck.id] || {};
    for (const slot of deck.slots) {
      if (!slot.pick || !slot.isBasic) continue;
      const key = Slot.ownedKey(slot.pick.name);
      if (!BASIC.has(key)) continue;
      const claimed = (per[key] || {}).inHand || 0;
      const elsewhere = Object.entries(holds)
        .reduce((n, [other, map]) => n + (other === deck.id ? 0 : ((map[key] || {}).inHand || 0)), 0);
      const spare = Math.max(0, ((owned[key] || {}).inHand || 0) - elsewhere);
      const should = Math.min(slot.pick.quantity, spare);
      if (claimed < should) shortBasics.push(`${deck.id} ${slot.pick.name}: sleeves ${slot.pick.quantity}, holds ${claimed}, ${spare} free`);
    }
  }
  assert.equal(shortBasics.length, 0,
    `${shortBasics.length} decks hold fewer basics than they sleeve, which puts a card you own on the shopping list: ${shortBasics.join("; ")}`);

  /* A hold can only ever ADD to what you owe -- it says a box does not have a copy the
     collection does. It must never hide a purchase the ledger can see. */
  const owe = (rs) => rs.reduce((n, r) => n + r.need, 0);
  const fromLedger = owe(Slot.shopRows(decks, owned, null));
  const fromHolds = owe(Slot.shopRows(decks, owned, claimTotals));
  assert.ok(fromHolds >= fromLedger,
    `counting from the boxes owes ${fromHolds} but counting from the ledger owes ${fromLedger}; a hold must never hide a card you have to buy`);

  /* ---------- what a filter says must be what the row says ----------
     The Shop's Status filter matches on a row's acquisition, so a row that still owes a
     copy while calling itself "In hand" is a card the filter hides. That is how filtering
     to Obuun and asking for "Not in hand" showed two of the seven colorless cards still
     to buy: Sol Ring and Command Tower are owned once, wanted by several decks, and the
     status was read off the shelf instead of off the row. */
  const rows = Slot.shopRows(decks, owned, claimTotals, holds);
  const lying = rows.filter((r) => r.need > 0 && r.acquisition === Slot.ACQUISITION.HAND);
  assert.equal(lying.length, 0,
    `${lying.length} rows still owe a copy while claiming to be in hand, so the status filter hides them: ${
      lying.slice(0, 4).map((r) => `${r.name} needs ${r.need}`).join("; ")}`);

  /* Scoped to one deck, every card that deck is short has to be findable under "Not in
     hand" -- that is the whole question a shopper is asking at a vendor's table. */
  for (const deck of decks) {
    const scoped = rows.map((r) => Slot.scopeRow(r, [deck.id])).filter(Boolean);
    const owedHere = scoped.filter((r) => r.need > 0);
    const findable = owedHere.filter((r) => r.acquisition === Slot.ACQUISITION.NONE
      || r.acquisition === Slot.ACQUISITION.PARTIAL || r.acquisition === Slot.ACQUISITION.ORDERED);
    assert.equal(findable.length, owedHere.length,
      `${deck.id}: ${owedHere.length - findable.length} cards it still needs do not show as owed when the Shop is filtered to it`);
    const fully = owedHere.filter((r) => r.inHand === 0 && r.ordered === 0);
    const shown = fully.filter((r) => r.acquisition === Slot.ACQUISITION.NONE);
    assert.equal(shown.length, fully.length,
      `${deck.id}: ${fully.length - shown.length} cards it holds none of are not listed as "Not in hand"`);
  }
}

/* Whatever else changes, a deck is a hundred cards. A slot the audit could not fill is
   left empty on purpose and shows as one, so the count below it is the honest number. */
{
  const Slot = (await import("../slot-model.js")).default || (await import("../slot-model.js"));
  const short = [];
  for (const [variantId, selection] of Object.entries(activeState.state.buySelections || {})) {
    const plan = buyPlans.plans[variantId];
    if (!plan) continue;
    const grafted = {...plan, manual: (activeState.state.manualCards[variantId] || []).map((c) => ({...c}))};
    const slots = Slot.deckSlots(grafted, selection, {});
    const cards_ = slots.filter((s) => s.pick).reduce((n, s) => n + s.pick.quantity, 0);
    const holes = slots.filter((s) => !s.pick).length;
    if (cards_ + holes !== 100) short.push(`${variantId}: ${cards_} cards + ${holes} empty`);
  }
  assert.equal(short.length, 0,
    `${short.length} live decks do not account for a hundred slots: ${short.join(", ")}`);
}

/* The README named six suites when there were twenty-four, and four tabs that had
   not existed for months. A stale README is not a cosmetic problem in a repo with
   no build step and no package.json: it is the only place that says what to run.
   The suite list at least can be held to the directory. */
{
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  const {readdir} = await import("node:fs/promises");
  const suites = (await readdir(new URL("../tests", import.meta.url)))
    .filter((f) => f.endsWith(".mjs")).map((f) => f.slice(0, -4)).sort();
  const missing = suites.filter((name) => !readme.includes("`" + name + "`"));
  assert.deepEqual(missing, [],
    `README.md does not name ${missing.join(", ")} — a suite nobody knows to run is a suite nobody runs`);
  /* The count, in digits or in words. Derived for THIS many suites rather than pinned to
     a fixed string: the guard was written as `|| /Twenty-four/` and went on passing a
     README that said twenty-four when there were twenty-five, which is the exact staleness
     it exists to catch. */
  const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
    "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen",
    "eighteen", "nineteen", "twenty"];
  const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const inWords = (n) => n <= 20 ? ONES[n]
    : n < 100 ? TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : "")
    : String(n);
  const words = inWords(suites.length);
  assert.ok(new RegExp(`\\b(${suites.length}|${words})\\b`, "i").test(readme),
    `README.md must say there are ${suites.length} suites (in digits or as "${words}"), and mean it`);
  assert.ok(!/Buy Picks|Live Decks|Shop List|Step 0/.test(readme),
    "README.md still names a tab this app retired");
}

console.log(`Validated ${variants.variants.length} variants and ${Object.keys(buyPlans.plans).length} connected buy profiles.`);
