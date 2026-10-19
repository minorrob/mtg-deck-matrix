/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE SENTENCE LIBRARY AND ITS CALIBRATION (card load step 2; Linear ROB-87; docs/engine/plan-card-load-program.md;
 * game/engine/cards/sentences.mjs, game/tools/sentence-library.mjs).
 *
 *   1. A sentence's template: reminder text out, the card's name as `~`, numbers as slots of their kind (a mana number,
 *      a power/toughness change, a number), a "+1/+1 counter" a name; at level 2 colors, types and keywords too.
 *   2. A body and back: a number reaches only a number slot and a mana number only a mana string (or a number no other
 *      slot claims); a target's index is never a slot; a quoted ability keeps its text in the new card's words; a grant
 *      writes a keyword back as the definitions do.
 *   3. A card's text in pieces, each the card's own words: sentences never split inside reminder text, keyword lines
 *      split by word.
 *   4. The library on the directory: one sentence that is several abilities stays several; the better evidenced cover
 *      wins; one spell per card; a card held out is out of its own templates. A spell of several sentences, one effect
 *      each, learned sentence by sentence only where its parts put back together are the spell; composed again only
 *      from plain spell sentences next to each other.
 *   5. The calibration: every defined card held out, translated, compiled and played; the rates reproducible; a template
 *      deliberately broken drops its rate to nothing.
 *   6. The report: every template once, with its count, and its rate where it was tried.
 */
import assert from "node:assert/strict";
import {loadCardScripts, loadCardScenarios, loadCardIndex} from "../game/tools/engine-cards.mjs";
import {templateOf, abstractBody, fillBody, atomsOf, createLibrary, templateWithout, segment, translate, isSimple, spellParts, composeSpell}
  from "../game/engine/cards/sentences.mjs";
import {calibrate, calibrateCard, report, reportMarkdown, wilsonLow, minimumCountOf, BANDS, CALIBRATION_SCHEMA} from "../game/tools/sentence-library.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const kinds = (t) => t.slots.map((s) => s.kind);

/* ---- 1. templates ---- */
{
  const bolt = templateOf("Lightning Bolt deals 3 damage to any target.", "Lightning Bolt");
  eq([bolt.key, bolt.slots], ["~ deals N damage to any target", [{kind: "num", v: 3, raw: "3"}]], "Lightning Bolt: its name ~, its 3 a number slot");
  const pump = templateOf("{1}{B}: This creature gets +1/+1 until end of turn.", "Burrog Banemaker");
  eq([pump.key, kinds(pump)], ["{N}{b}: this creature gets +N/+N until end of turn", ["mana", "pt", "pt"]], "a mana number and a power/toughness change are slots of their own kinds");
  eq(templateOf("Put a +1/+1 counter on target creature.", "X"), {key: "put a +1/+1 counter on target creature", slots: []}, "a +1/+1 counter is a name, never a slot");
  eq(templateOf("Create a 2/2 black Zombie creature token.", "X").key, "create a N/N black zombie creature token", "a token's size is a slot at level 1; its color and type words are not");
  eq(templateOf("Create a 2/2 black Zombie creature token.", "X", 2).key, "create a N/N COLOR zombie TYPE token", "at level 2 they are");
  eq(templateOf("Target creature gains first strike until end of turn.", "X", 2).slots.map((s) => s.v), ["creature", "first strike"], "a two-word keyword is one slot");
  eq(templateOf("Draw two cards.", "X").slots, [{kind: "num", v: 2, raw: "two"}], "a number word is a number, its word kept");
  eq(templateOf("Flying (This creature can't be blocked except by creatures with flying or reach.)", "X").key, "flying", "reminder text is out");
  eq(templateOf("({T}: Add {G}.)", "Forest").key, "{t}: add {g}", "unless it is the whole line");
  eq([templateOf("Krenko, Mob Boss deals 1 damage.", "Krenko, Mob Boss").key, templateOf("Krenko deals 1 damage.", "Krenko, Mob Boss").key],
    ["~ deals N damage", "~ deals N damage"], "a legend's whole name and its short name are both ~");
  eq(templateOf("−2: Draw a card.", "X").key, "-N: draw a card", "a loyalty cost's minus is a plain minus");
}

/* ---- 2. bodies and back ---- */
{
  const from = templateOf("{1}{B}: This creature gets +1/+1 until end of turn.", "Burrog Banemaker");
  const body = abstractBody({kind: "activated", text: "{1}{B}: This creature gets +1/+1 until end of turn.", cost: [{atom: "mana", cost: "{1}{B}"}],
    effects: [{effect: "pump", targets: "self", power: 1, toughness: 1}]}, from.slots, "Burrog Banemaker");
  eq(body.effects[0], {effect: "pump", targets: "self", power: {$slot: 1}, toughness: {$slot: 2}}, "the +1/+1 is the power/toughness slots, never the {1}");
  eq(body.cost, [{atom: "mana", cost: "{$0}{B}"}], "the {1} is the mana slot, in the mana string");
  ok(!("text" in body), "the sentence itself is not in the body");
  const to = templateOf("{2}{B}: This creature gets +3/+0 until end of turn.", "Thirsting Shade");
  eq(fillBody(body, to.slots, "Thirsting Shade"), {kind: "activated", cost: [{atom: "mana", cost: "{2}{B}"}], effects: [{effect: "pump", targets: "self", power: 3, toughness: 0}]},
    "filled with another card's slots, it is that card's ability");

  const more = templateOf("Spells your opponents cast cost {2} more to cast.", "X");
  const tax = abstractBody({kind: "static", text: "x", rule: "spells-cost-more", amount: 2, caster: "opponent"}, more.slots, "X");
  eq(tax.amount, {$slot: 0}, "a mana number written as a number is its slot when nothing else claims it");
  eq(fillBody(tax, templateOf("Spells your opponents cast cost {1} more to cast.", "Y").slots).amount, 1, "and fills back as the other card's");

  const sac = templateOf("{1}, {T}, Sacrifice this land: Draw a card.", "Sunbaked Canyon");
  const draw = abstractBody({kind: "activated", text: "x", cost: [{atom: "mana", cost: "{1}"}, {atom: "{T}"}, {atom: "sacrifice", self: true}],
    effects: [{effect: "draw", count: 1}]}, sac.slots, "Sunbaked Canyon");
  eq(fillBody(draw, templateOf("{4}, {T}, Sacrifice this land: Draw a card.", "Airship Engine Room").slots).effects, [{effect: "draw", count: 1}],
    "but where the mana string took it, \"draw a card\" stays one card");

  const flourish = templateOf("Target creature you control gets +1/+0 and gains indestructible until end of turn.", "X", 2);
  const aimed = abstractBody({kind: "spell", text: "x", targets: [{what: "permanent"}], effects: [{effect: "pump", targets: {target: 0}, power: 1, toughness: 0}]}, flourish.slots, "X", 2);
  eq(aimed.effects[0].targets, {target: 0}, "a target's index is never a slot, though the sentence has a 0");

  const chorus = templateOf("Creatures you control have \"{T}: Add one mana of any color.\"", "Elven Chorus");
  const granted = abstractBody({kind: "static", text: "x", grant: [{kind: "mana", text: "{T}: Add one mana of any color."}]}, chorus.slots, "Elven Chorus");
  eq(granted.grant[0].text, "{T}: Add [$0] mana of any color.", "a quoted ability keeps its text, its numbers as the outer sentence's slots");
  eq(fillBody(granted, templateOf("Creatures you control have \"{T}: Add two mana of any color.\"", "Y").slots).grant[0].text,
    "{T}: Add two mana of any color.", "and fills back in the new card's own words");

  const strike = templateOf("Target creature gets +2/+2 and gains first strike until end of turn.", "A", 2);
  const grant = abstractBody({kind: "spell", text: "x", effects: [{effect: "pump", power: 2, toughness: 2, keywords: ["First Strike"]}]}, strike.slots, "A", 2);
  eq(fillBody(grant, templateOf("Target creature gets +2/+2 and gains reach until end of turn.", "B", 2).slots).effects[0].keywords, ["Reach"],
    "a granted keyword is written back as grants write it");
  const reach = abstractBody({kind: "spell", text: "x", effects: [{effect: "pump", power: 2, toughness: 2, keywords: ["Reach"]}]},
    templateOf("Target creature gets +2/+2 and gains reach until end of turn.", "B", 2).slots, "B", 2);
  eq(fillBody(reach, strike.slots).effects[0].keywords, ["First Strike"], "both ways: \"First Strike\", as 84 grants write it, not \"First strike\"");
}

/* ---- 3. a card's text in pieces ---- */
{
  const text = "Flying, vigilance\nScry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card.";
  const atoms = atomsOf(text);
  eq(atoms.map((a) => a.text), ["Flying", "vigilance", "Scry 1. (Look at the top card of your library. You may put that card on the bottom.)", "Draw a card."],
    "a keyword line by word, a sentence with its reminder whole, never split inside the parentheses");
  eq(atoms.map((a) => text.slice(a.start, a.end)), atoms.map((a) => a.text), "each piece is the card's own words, at its place");
  eq(atomsOf("When this creature enters, draw a card. Then discard a card.").map((a) => a.text),
    ["When this creature enters, draw a card.", "Then discard a card."], "two sentences of a line are two pieces");
}

/* ---- 4. the library on the directory ---- */
const scripts = loadCardScripts().map((f) => f.script);
const library = createLibrary(scripts);
const byName = new Map(scripts.map((s) => [s.identity.name, s]));
{
  ok(library.cards >= 2400 && library.templates.size >= 5000, `${library.templates.size} templates from the ${library.cards} cards with only abilities`);
  eq(scripts.filter((s) => !isSimple(s)).every((s) => s.adventure || s.back || s.prepare || s.layout), true,
    "a card with an Adventure, a back face, a prepare spell or a layout is the only kind left out");
  const sledge = translate(byName.get("Behemoth Sledge"), library, {except: "Behemoth Sledge"});
  eq(sledge.script.abilities.map((a) => [a.kind, a.layer ?? null]), [["static", 7], ["static", 6], ["activated", null]],
    "a sentence the definitions write as two abilities (a layer 7c pump and a layer 6 grant) translates as both");
  eq(sledge.script.abilities[0].apply, {power: 2, toughness: 2}, "with this card's own +2/+2, from Loxodon Warhammer's +3/+0");
  const strix = segment(byName.get("Baleful Strix").oracleText, "Baleful Strix", library, "Baleful Strix");
  eq(strix.spans.map((s) => s.text), ["Flying", "deathtouch", "When this creature enters, draw a card."],
    "the better evidenced cover wins: \"Flying\" and \"deathtouch\" apart, not one card's \"Flying, deathtouch\"");
  const bolt = templateWithout(library, "1:~ deals N damage to any target", null);
  ok(bolt && bolt.cards >= 2 && JSON.parse(bolt.body)[0].kind === "spell", `"~ deals N damage to any target" is written by ${bolt?.cards} cards, as a spell`);
  const only = [...library.templates.values()].find((t) => t.level === 1 && new Set(t.examples.map((e) => e.card)).size === 1);
  const owner = only.examples[0].card;
  eq([templateWithout(library, only.id, owner), templateWithout(library, only.id, null)?.cards], [null, 1],
    `a template only ${owner} writes is not in the library with ${owner} held out`);
}

/* ---- 4b. a spell of several sentences ---- */
function canonical(v) {
  return JSON.stringify(v, (k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((key) => [key, x[key]])) : x));
}
{
  const spellOf = (name) => byName.get(name).abilities.find((a) => a.kind === "spell");
  const unmaking = spellOf("Anguished Unmaking"), parts = spellParts(unmaking);
  eq(parts?.map((p) => [p.text, p.targets?.length ?? 0, p.effects.map((e) => e.effect)]), [["Exile target nonland permanent.", 1, ["moveZone"]], ["You lose 3 life.", 0, ["loseLife"]]],
    "Anguished Unmaking's spell is two parts: the exile with its target, the life loss with none");
  eq(canonical(composeSpell(parts, unmaking.text)), canonical(unmaking), "put back together, they are its spell");
  eq(spellParts(spellOf("An Offer You Can't Refuse")), null, "a sentence that refers to an earlier one's target (\"Its controller creates two Treasure tokens.\") keeps the spell whole");
  eq(spellParts({...unmaking, additionalCost: [{atom: "sacrifice"}]}), null, "a spell with more than targets and effects is not split");
  eq(spellParts({...unmaking, text: "Exile target nonland permanent and you lose 3 life."}), null, "nor one whose sentences are not one effect each");
  eq(spellParts({kind: "spell", text: "Draw a card. You lose 3 life.", targets: [], effects: [{effect: "draw", count: 1}, {effect: "loseLife", amount: 3}]}), null,
    "nor one that its parts put back together would not write the same way (an empty target list)");
  eq(spellParts({kind: "spell", text: "Tap target creature. Target player draws a card.", targets: [{what: "player"}, {what: "permanent", types: ["Creature"]}],
    effects: [{effect: "tap", targets: {target: 1}}, {effect: "draw", count: 1, player: {target: 0}}]}), null, "nor one whose targets are not listed in the order its sentences name them");
  eq(spellParts({kind: "spell", text: "Draw a card. You lose 3 life.", targets: [{what: "player"}], effects: [{effect: "draw", count: 1}, {effect: "loseLife", amount: 3}]}), null,
    "nor one with a target no sentence uses");
  const two = composeSpell([{kind: "spell", targets: [{what: "permanent"}], effects: [{effect: "tap", targets: {target: 0}}]},
    {kind: "spell", targets: [{what: "player"}], effects: [{effect: "draw", count: 1, player: {target: 0}}]}], "Tap target permanent. Target player draws a card.");
  eq([two.targets.length, two.effects[1].player], [2, {target: 1}], "composed, a later part's target is moved past the earlier part's");
  const draw = templateWithout(library, `1:${templateOf("Draw a card.", "X", 1).key}`);
  ok(draw && draw.cards >= 3 && JSON.parse(draw.body)[0].kind === "spell", `"Draw a card." alone, which no card writes as its whole spell, is learned from ${draw?.cards} cards' spells`);
  const split = scripts.filter(isSimple).flatMap((x) => x.abilities).filter((a) => spellParts(a));
  ok(split.length >= 70 && split.every((a) => canonical(composeSpell(spellParts(a), a.text)) === canonical(a)), `${split.length} of the directory's spells learned sentence by sentence, each put back together exactly`);
  const across = translate({identity: {name: "Test Spell"}, oracleText: "Exile target nonland permanent.\nCycling {2}\nYou lose 3 life."}, library);
  eq(across.ok, false, "spell sentences with another ability between them are not composed");
  const costly = [...library.templates.values()].map((t) => templateWithout(library, t.id)).find((t) => t && t.level === 1 && t.cards >= 2
    && JSON.parse(t.body).length === 1 && JSON.parse(t.body)[0].kind === "spell" && JSON.parse(t.body)[0].additionalCost);
  const example = library.templates.get(costly.id).examples[0].card, text = byName.get(example).abilities.find((a) => a.kind === "spell").text;
  eq(translate({identity: {name: example}, oracleText: `${text}\nDraw a card.`}, library).ok, false, `nor is a spell with an additional cost (${example}'s) composed with another`);
}

/* ---- 5. the calibration ---- */
const scenarios = new Map(loadCardScenarios().map((f) => [f.scenarios.card, f.scenarios]));
const definition = loadCardIndex().definition;
const first = calibrate({scripts, scenarios, definition, library});
{
  const s = first.summary;
  ok(s.cards === scripts.length && s.structure + s.unknown + s.translated === s.cards, "every defined card is held out once, and counted once");
  ok(s.translated >= 500, `${s.translated} cards translated from the other cards' templates alone`);
  ok(s.passed / s.translated >= 0.99, `${s.passed} of them (${(100 * s.passed / s.translated).toFixed(1)}%) passed every one of their own scenarios`);
  eq(first.results.filter((r) => r.status === "failed" && !/^(compiles|fidelity|plays|no scenarios)/.test(r.why)), [], "each failure says why: it did not compile, was not its text, or played wrong");
  ok(first.results.every((r) => r.status !== "passed" || r.templates.length), "every card that passed names the templates it used");
  const translated = first.results.filter((r) => r.templates);
  ok(translated.every((r) => translate(byName.get(r.card), library, {except: r.card}).script.abilities.filter((a) => a.kind === "spell").length <= 1),
    `none of the ${translated.length} translations has two spell abilities`);
  const ransacking = translate(byName.get("Reckless Ransacking"), library, {except: "Reckless Ransacking"});
  eq([ransacking.script?.abilities.length, ransacking.script?.abilities[0].effects.map((e) => e.effect), ransacking.script?.abilities[0].text],
    [1, ["pump", "createToken"], byName.get("Reckless Ransacking").abilities[0].text], "Reckless Ransacking's two sentences, each from other cards, are composed into its one spell");
  eq(calibrateCard(byName.get("Reckless Ransacking"), {library, scenarios, definition}).status, "passed", "which plays every one of its own scenarios");
  const again = calibrate({scripts, scenarios, definition, library: createLibrary(scripts)});
  eq(JSON.stringify(again.results), JSON.stringify(first.results), "reproducible: the same directory, the same cards translated, the same rates");
  const uses = first.results.reduce((n, r) => n + (r.templates?.length ?? 0), 0);
  eq(first.pooled.reduce((n, b) => n + b.tried, 0), uses, "each use of a template is in exactly one band");
  eq(first.atLeast[0].tried, uses, "and the first \"k or more\" is every use");
  ok(first.minimumCount === null || BANDS.some(([a]) => a === first.minimumCount), `the minimum count is a band's start (${first.minimumCount})`);
  const at = BANDS.findIndex(([a]) => a === first.minimumCount);
  ok(at < 0 || (first.pooled.slice(at).every((b) => !b.tried || b.rate >= 0.99) && first.atLeast[at].low >= 0.99),
    "every band from it passed 99%, and together their lower bound is 99%");

  /* A template deliberately broken: "When this creature enters, draw a card." drawing two. */
  const id = "1:when this creature enters, draw a card";
  const users = first.results.filter((r) => r.templates?.some((t) => t.id === id));
  ok(users.length >= 3 && users.every((r) => r.status === "passed"), `${users.length} cards use "${id}" and pass with it whole`);
  const broken = createLibrary(scripts);
  for (const e of broken.templates.get(id).examples) e.body = e.body.replace(/"count":1/g, "\"count\":2");
  const after = calibrate({scripts, scenarios, definition, library: broken, only: users.map((r) => r.card)});
  eq([after.rates.get(id)?.tried, after.rates.get(id)?.passed], [users.length, 0], "broken, its rate drops to nothing: every card it translates now fails");
  eq(calibrateCard(byName.get("Baleful Strix"), {library: broken, scenarios, definition}).status, "failed", "Baleful Strix among them");
  const unbuilt = createLibrary(scripts);
  for (const e of unbuilt.templates.get(id).examples) e.body = e.body.replace(/"effect":"draw"/g, "\"effect\":\"drawSomehow\"");
  const refused = calibrateCard(byName.get("Baleful Strix"), {library: unbuilt, scenarios, definition});
  ok(refused.status === "failed" && /^compiles: /.test(refused.why), `a translation that does not compile is a failure, never played: "${refused.why}"`);
}

/* ---- 6. the report ---- */
{
  const r = report(first, {date: "2026-10-19"});
  eq([r.schema, r.columns], [CALIBRATION_SCHEMA, ["template", "cards", "agreement", "tried", "passed"]], "the report's schema and columns");
  eq(r.templates.length, library.templates.size, "every template is in it");
  eq(new Set(r.templates.map((t) => t[0])).size, r.templates.length, "each once");
  ok(r.templates.every(([, cards, agree, tried, passed]) => cards >= 1 && agree > 0 && agree <= 1 && passed <= tried), "each with how many cards write it, how far they agree, and its rate where tried");
  eq(r.failures.map((f) => f.card), first.results.filter((x) => x.status === "failed").map((x) => x.card), "every failure listed, with its templates");
  const md = reportMarkdown(r);
  ok(md.includes("**The minimum count:**") && md.includes("| k or more |") && md.includes("Low"), "the page gives the minimum count, the bands and their lower bounds");
}

/* ---- the minimum count, on bands made up ---- */
{
  const band = (tried, passed) => ({tried, passed, rate: tried ? passed / tried : null});
  eq(minimumCountOf([band(400, 400), band(300, 300), band(0, 0), band(0, 0), band(0, 0), band(0, 0)]).minimumCount, 1,
    "seven hundred perfect uses from one other card up: the minimum count is 1");
  eq(minimumCountOf([band(400, 380), band(300, 300), band(300, 300), band(0, 0), band(0, 0), band(0, 0)]).minimumCount, 2,
    "a band below 99% sets it above that band");
  eq(minimumCountOf([band(100, 100), band(50, 50), band(20, 20), band(0, 0), band(0, 0), band(0, 0)]).minimumCount, null,
    "and too few uses set none, however perfect");
  eq(minimumCountOf([band(10, 10), band(10, 9), band(400, 400), band(0, 0), band(0, 0), band(0, 0)]).minimumCount, 5,
    "a band below 99% stops it, whatever is pooled below");
  eq(minimumCountOf([band(50, 49), band(2000, 2000), band(0, 0), band(0, 0), band(0, 0), band(0, 0)]).minimumCount, 2,
    "even when the uses above it would carry the pooled lower bound past 99%");
}

/* ---- the lower bound ---- */
{
  eq(wilsonLow(0, 0), 0, "nothing tried trusts nothing");
  ok(Math.abs(wilsonLow(10, 10) - 0.7225) < 0.001, "ten of ten can be trusted to about 72%");
  ok(wilsonLow(299, 299) < 0.99 && wilsonLow(400, 400) > 0.99, "a perfect record needs about 380 tries to show 99%");
}

console.log(`sentence-library: ${checks} checks passed — ${library.templates.size} templates from ${library.cards} cards; ${first.summary.translated} cards translated with themselves held out, ${first.summary.passed} passed their own scenarios; reproducible; a broken template's rate drops to nothing.`);
