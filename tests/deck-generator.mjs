/* The page-wiring block that used to sit at the end of this file read matrix.html, app.js
   and app.css -- the retired viewer, its script and its stylesheet. What it was protecting
   is now protected by construction: the generator is not loaded by any page at all. It is
   a Node module the simulator toolchain requires directly (tools/sim/lib.mjs), so a
   load-order bug is no longer expressible. Everything above still measures the generator
   itself, which is the part that was ever doing work. */
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";

const require = createRequire(import.meta.url);
const Lineup = require("../lineup-model.js");
const Compliance = require("../compliance-model.js");
const Scryfall = require("../scryfall-client.js");
const Custom = require("../custom-model.js");
const Generator = require("../deck-generator.js");
const Edhrec = require("../edhrec-client.js");
const fixture = JSON.parse(await readFile(new URL("./fixtures/scryfall/cards.json", import.meta.url), "utf8"));

import {makeScryfallStub, makeClient} from "./helpers/stub-scryfall.mjs";

/* No EDHREC, deliberately. These assertions pin the deck the generator builds
   from Scryfall alone, which is also the deck a commander with no EDHREC page
   gets -- and running them against the live site would make the suite depend on
   somebody else's uptime and on data that changes weekly. The case where the
   signal IS present is covered in tests/edhrec-client.mjs and below. */
const noEdhrec = async () => ({ok: false, status: 404, json: async () => ({})});
// The stub Scryfall these tests run against now lives in helpers/, because
// tests/deck-build.mjs needs the same generator output to map from.

// ---------------------------------------------------------------------------
// TCGplayer link parsing
// ---------------------------------------------------------------------------
const affiliate = "https://partner.tcgplayer.com/c/4931599/1830156/21018?subId1=api&u=https%3A%2F%2Fwww.tcgplayer.com%2Fproduct%2F507105%3Fpage%3D1";
assert.equal(Scryfall.parseTcgplayerUrl(affiliate).productId, 507105, "affiliate wrappers must yield the wrapped product id");
assert.equal(Scryfall.parseTcgplayerUrl(affiliate).affiliate, true, "affiliate wrappers must be reported as such");
assert.equal(Scryfall.parseTcgplayerUrl("https://www.tcgplayer.com/product/687386?page=1").productId, 687386);
assert.equal(Scryfall.parseTcgplayerUrl("https://www.tcgplayer.com/product/687386/magic-blood-artist").slug, "magic-blood-artist");
assert.equal(Scryfall.parseTcgplayerUrl("https://partner.tcgplayer.com/c/1/2/3?u=https%3A%2F%2Fwww.tcgplayer.com%2Fsearch%2Fmagic%2Fproduct%3Fq%3DSol%2BRing").name, "Sol Ring");
assert.equal(Scryfall.parseTcgplayerUrl("https://example.com/product/1"), null, "non-TCGplayer links must be rejected");
assert.equal(Scryfall.parseTcgplayerUrl(""), null);
assert.deepEqual(Scryfall.slugNameCandidates("magic-bloomburrow-blood-artist")[0], "magic bloomburrow blood artist");
assert.ok(Scryfall.slugNameCandidates("magic-bloomburrow-blood-artist").includes("blood artist"), "slug candidates must trim leading set words");

// ---------------------------------------------------------------------------
// Client behavior: caching, retries, and TCGplayer resolution
// ---------------------------------------------------------------------------
{
  const {client, calls} = makeClient(fixture.data);
  const first = await client.search("legal:commander id<=bg type:creature", {maxPages: 1});
  const second = await client.search("legal:commander id<=bg type:creature", {maxPages: 1});
  assert.ok(first.length > 0, "the stub must answer a basic search");
  assert.equal(first.length, second.length);
  assert.equal(calls.length, 1, "an identical search must be served from cache");
  assert.equal(client.stats().cacheHits, 1);
  const missing = await client.named("Not A Real Card Name At All");
  assert.equal(missing, null, "a 404 must resolve to null rather than throw");
  const resolved = await client.resolveTcgplayerUrl(affiliate);
  assert.ok(resolved.card === null || resolved.card.name, "affiliate resolution must return a card or an explained miss");
}

{
  let attempts = 0;
  const client = Scryfall.createClient({
    delayMs: 0,
    sleep: async () => undefined,
    cache: {get: () => null, set: () => undefined},
    fetchImpl: async () => {
      attempts += 1;
      if (attempts < 3) return {ok: false, status: 429, json: async () => ({})};
      return {ok: true, status: 200, json: async () => ({object: "card", name: "Sol Ring", type_line: "Artifact", legalities: {commander: "legal"}})};
    }
  });
  const card = await client.named("Sol Ring");
  assert.equal(card.name, "Sol Ring", "a 429 must be retried, not surfaced");
  assert.equal(attempts, 3);
  assert.equal(client.stats().retries, 2);
}

// ---------------------------------------------------------------------------
// Role classification
// ---------------------------------------------------------------------------
const fixtureByName = new Map(fixture.data.map((card) => [card.name, Scryfall.normalizeCard(card)]));
const rolesOf = (name) => Generator.classifyRoles(fixtureByName.get(name) || {});
assert.ok(rolesOf("Sol Ring").includes("ramp"), "Sol Ring must classify as ramp");
assert.ok(rolesOf("Swords to Plowshares").includes("removal"), "Swords to Plowshares must classify as removal");
assert.ok(rolesOf("Farewell").includes("wipe"), "Farewell must classify as a board wipe");
assert.ok(rolesOf("Rhystic Study").includes("draw"), "Rhystic Study must classify as draw");
assert.ok(rolesOf("Command Tower").includes("land"), "lands must classify by type line");
assert.ok(!rolesOf("Command Tower").includes("ramp"), "a land may not double as a ramp spell");

// ---------------------------------------------------------------------------
// Query construction
// ---------------------------------------------------------------------------
const identityContext = {identity: new Set(["B", "G"]), themes: ["Sacrifice / Aristocrats"], preferSet: ""};
assert.match(Generator.buildRoleQuery("ramp", identityContext, true), /otag:ramp/);
assert.match(Generator.buildRoleQuery("ramp", identityContext, false), /search your library for a basic land card/);
assert.match(Generator.buildRoleQuery("ramp", identityContext, true), /id<=bg/);
assert.match(Generator.buildRoleQuery("draw", identityContext, true), /-type:land/);
assert.equal(Generator.identityClause([]), "id<=wubrg", "an unset color choice must not narrow the search");

// ---------------------------------------------------------------------------
// Full generation against the stub
// ---------------------------------------------------------------------------
const {client, calls} = makeClient(fixture.data);
const bloodArtist = fixture.data.find((card) => card.name === "Blood Artist");
const inputs = {
  slotId: 101,
  colors: ["B", "G"],
  themes: ["Sacrifice / Aristocrats", "Tokens / Go-wide"],
  playstyle: "midrange",
  budgetUsd: 250,
  variantCount: 3,
  commanderName: "Slimefoot, the Stowaway",
  seedLinks: [`https://www.tcgplayer.com/product/${bloodArtist.tcgplayer_id}?page=1`, "https://www.tcgplayer.com/product/99999999"],
  preferSet: ""
};
const progress = [];
const generated = await Generator.generateForSlot(inputs, {client, fetchImpl: noEdhrec, onProgress: (event) => progress.push(event), createdAt: "2026-08-23T00:00:00.000Z"});

assert.equal(generated.commander.name, "Slimefoot, the Stowaway", "the typed commander name must win");
assert.equal(generated.variants.length, 3, "variantCount must decide how many lenses are built");
assert.ok(progress.some((event) => event.phase === "pool"), "pool progress must be reported");
assert.ok(progress.some((event) => event.phase === "done"), "completion must be reported");
assert.ok(generated.warnings.some((warning) => warning.includes("99999999") || /no card matched/i.test(warning)), "a dead seed link must be reported, not silently dropped");
assert.ok(calls.some((call) => /otag%3A/.test(call.url)), "tagged searches must be attempted");
assert.ok(calls.some((call) => /draw%20a%20card|draw\+a\+card/.test(call.url)), "an untagged role must fall back to an oracle-text search");

const seedKey = Custom.cardKey("Blood Artist");
generated.builds.forEach((build) => {
  assert.ok(build.variant.base.some((ref) => ref.key === seedKey), `${build.variant.id} must force-include the resolved seed card`);
});

// Every stage of every variant must be a legal, complete Commander deck.
generated.builds.forEach((build) => {
  build.stages.forEach((entries, stageIndex) => {
    const result = Generator.evaluateEntries(entries);
    assert.equal(result.total, 100, `${build.variant.id} stage ${stageIndex + 1} must contain exactly 100 cards`);
    assert.deepEqual(result.tier3.map((issue) => `${issue.card}: ${issue.rule}`), [], `${build.variant.id} stage ${stageIndex + 1} must be Tier 3 legal`);
    assert.ok(result.selectedGameChangers.length <= 3, `${build.variant.id} stage ${stageIndex + 1} must respect the three Game Changer cap`);
    assert.deepEqual(result.compositionWarnings, [], `${build.variant.id} stage ${stageIndex + 1} must land inside the 33-42 land band`);
    entries.forEach((entry) => {
      assert.ok(
        (entry.card.colorIdentity || []).every((color) => generated.commander.colorIdentity.includes(color)),
        `${entry.card.name} must fit the commander's color identity`
      );
    });
  });
});

const baseSpend = generated.builds[0].stages[0].reduce((sum, entry) => sum + Number(entry.card.price || 0) * Math.max(1, Number(entry.quantity || 1)), 0);
assert.ok(baseSpend <= inputs.budgetUsd * 1.05, `the Base build must respect the budget (spent $${baseSpend.toFixed(2)} of $${inputs.budgetUsd})`);

const namesOf = (entries) => new Set(entries.map((entry) => Custom.cardKey(entry.card.name)));
const first = namesOf(generated.builds[0].stages[1]);
const second = namesOf(generated.builds[1].stages[1]);
const shared = [...first].filter((key) => second.has(key)).length;
assert.ok(first.size - shared >= 20, `two lenses must differ by at least 20 cards (differ by ${first.size - shared})`);

// A commander that arrives as a TCGplayer link must beat the search path.
{
  const {client: linkClient} = makeClient(fixture.data);
  const commanderCard = fixture.data.find((card) => card.name === "Slimefoot, the Stowaway");
  const linked = await Generator.generateForSlot({
    ...inputs,
    commanderName: "",
    seedLinks: [],
    variantCount: 1,
    commanderLink: `https://partner.tcgplayer.com/c/1/2/3?u=${encodeURIComponent(`https://www.tcgplayer.com/product/${commanderCard.tcgplayer_id}?page=1`)}`
  }, {client: linkClient, fetchImpl: noEdhrec});
  assert.equal(linked.commander.name, "Slimefoot, the Stowaway", "a commander link must resolve through the affiliate wrapper");
  assert.equal(linked.variants.length, 1);
}

// A search-only slot (no commander named at all) still has to produce a deck.
{
  const {client: searchClient} = makeClient(fixture.data);
  const searched = await Generator.generateForSlot({
    slotId: 102,
    colors: ["G"],
    themes: ["Counters / Proliferate"],
    budgetUsd: 120,
    variantCount: 1
  }, {client: searchClient, fetchImpl: noEdhrec});
  assert.ok(searched.commander, "an inputs-only slot must still resolve a commander");
  assert.equal(Generator.evaluateEntries(searched.builds[0].stages[0]).total, 100);
}

// ---------------------------------------------------------------------------
// Custom store: persistence, catalog merge, and lineup parity with baked plans
// ---------------------------------------------------------------------------
function fakeStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => void map.set(key, String(value)),
    removeItem: (key) => void map.delete(key)
  };
}

const storage = fakeStorage();
let store = Custom.blankStore();
assert.equal(store.slots.length, 6, "the Choose page owns exactly six placeholders");
assert.deepEqual(store.slots.map((slot) => slot.slotId), [101, 102, 103, 104, 105, 106]);
Custom.putCards(store, generated.cards);
store.slots[0] = {...store.slots[0], title: "Aristocrats testbed", inputs: {...Custom.blankInputs(), ...inputs}, status: "ready", generatedAt: "2026-08-23T00:00:00.000Z"};
Custom.replaceSlotVariants(store, 101, generated.variants);
const saved = Custom.save(storage, store);
assert.equal(saved.saved, true, "the custom store must persist");
assert.ok(saved.bytes < Custom.BLOCK_BYTES, "three generated variants must fit well inside the storage budget");
store = Custom.load(storage);
assert.equal(store.variants.length, 3, "variants must survive a save/load round trip");
assert.equal(store.slots[0].title, "Aristocrats testbed");

for (const variant of store.variants) {
  [1, 2, 3].forEach((stage) => {
    const cards = Custom.stageCards(store, variant, stage);
    const total = cards.reduce((sum, card) => sum + Number(card.quantity || 1), 0);
    assert.equal(total, 100, `${variant.id} stage ${stage} must round-trip as exactly 100 cards`);
  });
}

const merged = Custom.mergeIntoCatalogs(store, {decks: [{id: 1, title: "Baked"}], variants: [{id: "1o", deckId: 1}]}, {plans: {"1o": {}}, profileVariantIds: ["1o"]});
assert.equal(merged.catalog.decks.length, 2, "the generated deck joins the baked decks");
assert.equal(merged.catalog.decks[0].id, 101, "generated decks lead the Compare list");
assert.equal(merged.catalog.variants.length, 4);
assert.equal(Object.keys(merged.buyCatalog.plans).length, 4);
assert.deepEqual(merged.customVariantIds, ["c101-1", "c101-2", "c101-3"]);

for (const variantId of merged.customVariantIds) {
  const plan = merged.buyCatalog.plans[variantId];
  assert.equal(plan.startingShellKind, "custom-shell", "generated plans must route around the precon-only code paths");
  assert.equal(plan.precon, null);
  assert.deepEqual(Lineup.unresolvedEntries(plan), [], `${variantId} must not leave a replacement slot unresolved`);
  const defaults = Lineup.defaultSelection(plan);
  const literal = Lineup.selectedEntries(plan, defaults).map((entry) => ({
    ...entry.item,
    quantity: Number(entry.item.quantity || 1),
    lineupKind: entry.kind
  }));
  const result = Compliance.evaluateCardList(literal);
  assert.equal(result.total, 100, `${variantId}: the default Buy Picks lineup must total 100`);
  assert.deepEqual(result.tier3.map((issue) => `${issue.card}: ${issue.rule}`), [], `${variantId}: the default Buy Picks lineup must be Tier 3 clean`);
  assert.ok(plan.required.length > 0, `${variantId} must publish a Tuned ladder`);
  plan.required.concat(plan.enhance, plan.max).forEach((item) => {
    assert.ok(item.replaces, `${item.name} must name the card it replaces`);
    assert.equal(Number(item.quantity), 1, "generated swaps are always one-for-one");
  });
  plan.enhance.forEach((item) => assert.ok(item.price <= 20, `${item.name} may not exceed the $20 Enhance ceiling`));
}

const variantView = Custom.toVariant(store, store.variants[0]);
assert.equal(variantView.deckId, 101);
assert.equal(variantView.summaries.length, 3);
assert.equal(variantView.scores.playstyle.length, 3);
assert.equal(variantView.scores.playstyle[0].length, 6, "generated variants must answer the same six play-style filters");
assert.equal(variantView.scores.engine[0].length, 6);
assert.equal(variantView.scores.growth.length, 2);
assert.equal(variantView.costs.length, 3);
assert.equal(variantView.ranks.length, 3);
assert.ok(variantView.detailHtml.length > 200, "a generated variant must ship a readable detail report");
assert.ok(variantView.image, "the commander art must carry through to Compare");
variantView.scores.playstyle.flat().concat(variantView.scores.engine.flat()).forEach((row) => {
  assert.ok(row.score >= 1 && row.score <= 5, `${row.label} must score on the same 1-5 scale as the baked catalog`);
});

// Optimizer overlays replace the list in place and can be reverted.
const optimized = Custom.stageCards(store, store.variants[0], 3).map((card) => ({name: card.name, quantity: card.quantity, isCommander: card.isCommander}));
const applied = Custom.applyResultAsOverlay(store, "c101-1", {id: "sim-1", finalCards: optimized, appliedAt: "2026-08-24T10:00:00.000Z"});
assert.equal(applied.applied, true, "a 100-card simulator result must apply as an overlay");
const overlaidPlan = Custom.toPlan(store, store.variants[0]);
assert.equal(overlaidPlan.startingShell.reduce((sum, card) => sum + card.quantity, 0), 100);
assert.deepEqual(overlaidPlan.required, [], "an optimized list has no ladder left to climb");
assert.ok(Custom.toVariant(store, store.variants[0]).tags.some((tag) => tag.startsWith("Optimized")), "an optimized variant must say so on its card");
assert.equal(Custom.applyResultAsOverlay(store, "c101-1", {id: "bad", finalCards: optimized.slice(0, 40)}).applied, false, "a short result must be refused");
Custom.removeOverlay(store, "c101-1");
assert.equal(Custom.toPlan(store, store.variants[0]).required.length > 0, true, "reverting an overlay restores the generated ladder");

Custom.clearSlot(store, 101);
assert.equal(Custom.slotVariants(store, 101).length, 0, "clearing a slot drops its variants");
assert.equal(Object.keys(store.cardPool).length, 0, "clearing the last slot prunes the shared card pool");
assert.deepEqual(Custom.load(fakeStorage()).variants, [], "an empty browser starts with no generated variants");
assert.deepEqual(Custom.load({getItem: () => "{{{not json"}).variants, [], "a corrupted store must degrade to empty, never throw");

// ---------------------------------------------------------------------------
// Play style moves the role mix
// ---------------------------------------------------------------------------
const fortress = Generator.quotasFor(Generator.LENSES[0], 63, "Fortress");
const flavor = Generator.quotasFor(Generator.LENSES[0], 63, "Flavor");
const neutral = Generator.quotasFor(Generator.LENSES[0], 63, "");
[fortress, flavor, neutral].forEach((quotas) => {
  assert.equal(Generator.ROLE_ORDER.reduce((sum, role) => sum + quotas[role], 0), 63, "role quotas must always add up to the spell count");
});
assert.ok(fortress.protection > neutral.protection, "Fortress must ask for more protection");
assert.ok(fortress.finisher < neutral.finisher, "Fortress must ask for fewer finishers");
assert.ok(flavor.theme > fortress.theme, "Flavor must lean further into the theme than Fortress does");
{
  const {client: styleClient, fetchImpl: noEdhrec} = makeClient(fixture.data);
  const styled = await Generator.generateForSlot({...inputs, variantCount: 1, seedLinks: [], playstyle: "Fortress"}, {client: styleClient, fetchImpl: noEdhrec});
  const protectionCount = styled.builds[0].stages[0].filter((entry) => entry.role === "protection").length;
  assert.ok(protectionCount >= 6, `a Fortress build must actually fill the extra protection slots (filled ${protectionCount})`);
  assert.equal(Generator.evaluateEntries(styled.builds[0].stages[0]).total, 100);
}

// ---------------------------------------------------------------------------
// EDHREC synergy, when there is a page for the commander.
//
// Two builds off the same pool and the same seed, one with the signal and one
// without. The point of the whole feature is that they differ; a check that
// only proved "it does not crash" would have passed just as happily if the
// numbers were being read and thrown away.
// ---------------------------------------------------------------------------
{
  const edhPage = JSON.parse(await readFile(new URL("./fixtures/edhrec-atraxa.json", import.meta.url), "utf8"));
  const withEdh = async () => ({ok: true, json: async () => edhPage});
  const same = {...inputs, variantCount: 1, seedLinks: [], createdAt: "2026-08-23T00:00:00.000Z"};

  const {client: a} = makeClient(fixture.data);
  const plain = await Generator.generateForSlot(same, {client: a, fetchImpl: noEdhrec});
  const {client: b} = makeClient(fixture.data);
  const tilted = await Generator.generateForSlot(same, {client: b, fetchImpl: withEdh});

  const names = (r) => r.builds[0].stages[1].map((e) => e.card.name).sort();
  assert.equal(tilted.builds.length, 1, "the signal must not stop a deck being built");
  assert.equal(names(tilted).length, names(plain).length, "both are still a hundred cards");
  assert.notDeepEqual(names(tilted), names(plain),
    "EDHREC synergy must actually change which cards get picked, or it is being read and discarded");

  /* That last one on its own would pass for the wrong reason. Present-vs-absent
     also flips the weight fold-back, so the two builds would differ even if
     every synergy number were being discarded. This isolates it: a page whose
     cards are all outside the pool leaves the weights exactly as the real page
     does, and changes nothing else. If the real page still builds a different
     deck, the numbers -- not the weights -- are what moved it. */
  const irrelevant = {container: {json_dict: {cardlists: [{header: "Top Cards", cardviews: [
    {name: "A Card That Is In No Pool", synergy: 0.5, num_decks: 90, potential_decks: 100}
  ]}]}}};
  const {client: d} = makeClient(fixture.data);
  const weightsOnly = await Generator.generateForSlot(same,
    {client: d, fetchImpl: async () => ({ok: true, json: async () => irrelevant})});
  assert.notDeepEqual(names(tilted), names(weightsOnly),
    "with the weights held equal, the EDHREC numbers must still change the deck");
  const overlap = [...Edhrec.parse(edhPage).cards.values()]
    .filter((e) => fixture.data.some((c) => c.name.toLowerCase() === e.name.toLowerCase()));
  assert.ok(overlap.length > 20,
    `the EDHREC fixture must actually cover the card pool (${overlap.length} of ${fixture.data.length} overlap)`);

  // And it must not break the deck it changes.
  const legal = tilted.compliance || tilted.builds[0].compliance;
  assert.deepEqual(legal[1].tier3, [], "the tilted Tuned build must still be Bracket 3 legal");

  // A commander EDHREC has never heard of must build EXACTLY the deck it built
  // before this signal existed -- that is what the weight fold-back is for, and
  // a zeroed synergy term would silently cost the deck its whole swap ladder.
  const {client: c} = makeClient(fixture.data);
  const missing = await Generator.generateForSlot(same, {client: c, fetchImpl: noEdhrec});
  assert.deepEqual(names(missing), names(plain),
    "no EDHREC page must reproduce the old build card for card");
  assert.ok(missing.builds[0].variant.tuned.length > 0,
    "and must keep its Tuned ladder, which a zeroed weight silently emptied");
  assert.ok((tilted.warnings || []).every((w) => !/no page/i.test(w)),
    "a commander WITH a page must not be warned about");
  assert.ok((missing.warnings || []).some((w) => /EDHREC has no page/.test(w)),
    "a commander without one must say so, since it changes how cards were ranked");
}

console.log(`Generated ${generated.variants.length} compliant variants from ${fixture.data.length} fixture cards in ${calls.length} stubbed Scryfall calls.`);
