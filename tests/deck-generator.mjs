import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";

const require = createRequire(import.meta.url);
const Lineup = require("../lineup-model.js");
const Compliance = require("../compliance-model.js");
const Scryfall = require("../scryfall-client.js");
const Custom = require("../custom-model.js");
const Generator = require("../deck-generator.js");
const fixture = JSON.parse(await readFile(new URL("./fixtures/scryfall/cards.json", import.meta.url), "utf8"));
// The full app moved to matrix.html when the simplified viewer took over
// index.html. These assertions are about the full app, so they follow it.
const indexSource = await readFile(new URL("../matrix.html", import.meta.url), "utf8");
const appSource = await readFile(new URL("../app.js", import.meta.url), "utf8");

import {makeScryfallStub, makeClient} from "./helpers/stub-scryfall.mjs";
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
const generated = await Generator.generateForSlot(inputs, {client, onProgress: (event) => progress.push(event), createdAt: "2026-08-23T00:00:00.000Z"});

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
  }, {client: linkClient});
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
  }, {client: searchClient});
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
  const {client: styleClient} = makeClient(fixture.data);
  const styled = await Generator.generateForSlot({...inputs, variantCount: 1, seedLinks: [], playstyle: "Fortress"}, {client: styleClient});
  const protectionCount = styled.builds[0].stages[0].filter((entry) => entry.role === "protection").length;
  assert.ok(protectionCount >= 6, `a Fortress build must actually fill the extra protection slots (filled ${protectionCount})`);
  assert.equal(Generator.evaluateEntries(styled.builds[0].stages[0]).total, 100);
}

// ---------------------------------------------------------------------------
// Page wiring
// ---------------------------------------------------------------------------
for (const module of ["lineup-model.js", "compliance-model.js", "scryfall-client.js", "custom-model.js", "deck-generator.js"]) {
  assert.ok(indexSource.includes(module), `matrix.html must load ${module}`);
}
assert.ok(indexSource.indexOf("compliance-model.js") < indexSource.indexOf("deck-generator.js"), "the generator must load after the compliance model it depends on");
assert.ok(indexSource.indexOf("deck-generator.js") < indexSource.indexOf("app.js?"), "generator modules must load before app.js");
// Choose is withdrawn from the page for now, so the tab and section are gone on
// purpose. What must stay true is that withdrawing it is a two-element change
// and nothing else: the generator, the Scryfall client, the custom store and the
// renderer are all still wired, so putting the tab and section back in
// matrix.html brings the whole step back with them.
assert.doesNotMatch(indexSource, /data-view="choose"/, "the Choose tab is withdrawn for now");
assert.doesNotMatch(indexSource, /id="view-choose"/, "the Choose section is withdrawn for now");
assert.match(appSource, /function renderChooseView\(\)/, "the Choose renderer must survive the tab being withdrawn");
assert.match(appSource, /if \(!\$\("#view-choose"\)\) return;/, "renderChoose must no-op rather than throw while its section is absent");
assert.match(appSource, /Generator\.generateForSlot/, "the generator must still be wired to the slot runner");

const cssSource = await readFile(new URL("../app.css", import.meta.url), "utf8");
// Derive the count instead of hard-coding it: the tab bar and its grid must agree,
// and that guard should survive tabs being added or withdrawn.
const tabCount = (indexSource.match(/class="main-tab[ "]/g) || []).length;
const gridMatch = cssSource.match(/\.main-tabs \{[^}]*repeat\((\d+), minmax\(0, 1fr\)\)/);
assert.ok(gridMatch, "the tab bar must declare a fixed-column grid");
assert.equal(Number(gridMatch[1]), tabCount,
  `the tab bar grid (${gridMatch[1]} columns) must make room for exactly the ${tabCount} tabs in matrix.html`);
assert.match(cssSource, /\.choose-grid \{/, "the Choose grid must be styled");
assert.match(cssSource, /\.deck-group-divider \{/, "the generated-deck divider must be styled");

assert.match(appSource, /const Custom = window\.MtgCustomModel/, "app.js must bind the custom deck model");
assert.match(appSource, /const Generator = window\.MtgDeckGenerator/, "app.js must bind the deck generator");
assert.match(appSource, /function renderChoose\(\)/, "app.js must render the Choose view");
assert.match(appSource, /if \(view === "choose"\) renderChoose\(\);/, "switchView must route the Choose tab");
assert.match(appSource, /Custom\.mergeIntoCatalogs\(customStore, bakedCatalog, bakedBuyCatalog\)/, "generated decks must merge into copies of the baked catalog, never into the files");
assert.match(appSource, /\$\{visibleTotal\} of \$\{catalog\.variants\.length\} shown/, "the Compare counter must follow the merged catalog");
assert.match(appSource, /\$\{selected\.length\}\/\$\{catalog\.decks\.length\}/, "the Compare selection meter must follow the merged deck count");
assert.match(appSource, /\$\{variants\.length\} of \$\{deckTotal\} shown/, "each deck row must count its own variants");
assert.match(appSource, /deck-group-divider/, "generated decks must be separated from the curated ones");
assert.match(appSource, /String\(item\?\.name \|\| ""\)/, "itemKey must tolerate plans that carry no precon");
// The Choose tour steps go with the withdrawn tab; the tour must not offer a
// walkthrough of a page nobody can reach.
assert.doesNotMatch(appSource, /^\s{4}choose: \[/m, "the tour must not walk through a withdrawn view");

console.log(`Generated ${generated.variants.length} compliant variants from ${fixture.data.length} fixture cards in ${calls.length} stubbed Scryfall calls.`);
