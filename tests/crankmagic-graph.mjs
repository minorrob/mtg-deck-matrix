// What joins two cards on the graph, and in which direction.
//
// The graph used to link cards that had the same words in them. That is a fact about
// vocabulary, and it is not what a Commander deck is: a deck is a chain -- this makes
// creatures enter, that fires when they do, this third one makes it happen twice. Those
// relations were already in data/graph.json as causes/triggers, and nothing read one
// against the other; multiplies/grants/extends were not there at all until
// tools/graph-amplifiers.mjs baked them.
//
// The scoring is exercised through CrankGraph.relate, which is the same code path the
// canvas takes -- mount() only wraps it in a per-card term cache. So a rule that passes
// here is the rule the reader sees on a line, and the reason strings asserted below are
// the sentences the pop-up prints.
//
// The cards are named rather than synthesised. A hand-built pair proves the arithmetic
// and nothing about Magic; Krenko and Purphoros prove the model works on the corpus the
// app actually ships.
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const graph = JSON.parse(await readFile(new URL("../data/graph.json", import.meta.url), "utf8"));
const source = await readFile(new URL("../crankmagic-graph.js", import.meta.url), "utf8");

/* The module is a browser file with no export of its own: it assigns onto globalThis and
   is loaded by a <script> tag. Evaluating it with globalThis shadowed by a plain object
   gets at it without a bundler and without leaving CrankGraph on this process's globals.
   It is run in THIS realm rather than node:vm's so the arrays it returns are ordinary
   arrays -- a cross-realm array fails deepStrictEqual on its prototype alone, which is a
   confusing way to learn nothing. It never touches the DOM until mount() is called. */
const root = {};
new Function("globalThis", "window", "self", source)(root, root, root);
const Graph = root.CrankGraph;

let checks = 0;
const ok = (label, fn) => { fn(); checks += 1; process.stdout.write(`  ok  ${label}\n`); };

const byName = new Map(graph.cards.map((c) => [c.name, c]));
function card(name) {
  const found = byName.get(name);
  assert.ok(found, `${name} is not in data/graph.json — pick a card the bake actually carries`);
  return found;
}
const relate = (a, b) => Graph.relate(card(a), card(b));

/* ------------------------------------------------------------------ the trigger chain */

ok("a card that causes an event is joined to one that fires on it", () => {
  /* Krenko makes creatures enter. Purphoros fires when they do. Neither card mentions
     the other and they share no mechanic; the join is the event they sit either side of. */
  const r = relate("Krenko, Mob Boss", "Purphoros, God of the Forge");
  assert.ok(r, "Krenko and Purphoros must be joined");
  assert.ok(r.fires.includes("creature-etb"), `fires was ${JSON.stringify(r.fires)}`);
  assert.equal(r.kind, "Causes → triggers on");
  assert.match(r.reason, /^Causes → triggers on · a creature entering/);
});

ok("the same pair read the other way round is the other sentence", () => {
  const forward = relate("Krenko, Mob Boss", "Purphoros, God of the Forge");
  const back = relate("Purphoros, God of the Forge", "Krenko, Mob Boss");
  assert.deepEqual(back.firedBy, forward.fires, "the event is the same; the arrow is not");
  assert.equal(back.kind, "Triggers on ← caused");
  assert.equal(back.score, forward.score, "direction changes the sentence, never the strength");
});

ok("a shared word scores below a relation", () => {
  /* Two cards that both say "flying" are joined; a card that feeds another is joined
     harder. If that ordering ever inverts, the top of every fan-out becomes vocabulary. */
  const chain = relate("Krenko, Mob Boss", "Purphoros, God of the Forge");
  const onlyWords = (r) => r && r.shared.length === 1 && !r.fires.length && !r.firedBy.length
    && !r.feeds.length && !r.fed.length && !r.multiplied.length && !r.multiplies.length
    && !r.extended.length && !r.extendedBy.length;
  let words = null;
  for (const a of graph.cards.slice(0, 400)) {
    for (const b of graph.cards.slice(0, 400)) {
      const r = a === b ? null : Graph.relate(a, b);
      if (onlyWords(r)) { words = r; break; }
    }
    if (words) break;
  }
  assert.ok(words, "the corpus must hold a shared-word-only pair to compare against");
  assert.ok(chain.score > words.score, `an event chain scored ${chain.score}, a shared word ${words.score}`);
});

/* ----------------------------------------------------------------- make and multiply */

ok("a token maker is joined to a token doubler", () => {
  const r = relate("Krenko, Mob Boss", "Parallel Lives");
  assert.ok(r.multiplied.includes("token"), `multiplied was ${JSON.stringify(r.multiplied)}`);
  assert.equal(r.kind, "Makes → multiplies");
  assert.match(r.reason, /Makes → multiplies · token/);
  const back = relate("Parallel Lives", "Krenko, Mob Boss");
  assert.deepEqual(back.multiplies, ["token"]);
  assert.equal(back.kind, "Multiplies ← makes");
});

ok("a card whose ability fires is joined to the doubler of that trigger", () => {
  /* Purphoros triggers on a creature entering; Panharmonicon makes that trigger happen
     twice. The multiplier pairs with the LISTENER, which is the rules-correct side. */
  const r = relate("Purphoros, God of the Forge", "Panharmonicon");
  assert.ok(r.multiplied.includes("creature-etb"));
  assert.match(r.reason, /Makes → multiplies · a creature entering/);
});

ok("a multiply edge only ever names what the left card actually makes or fires", () => {
  /* The join is directed and the arrow has to be earned: every term on the "multiplied"
     side must be something the left card produces or triggers on. Without this the label
     could read "Makes → multiplies · token" over a card that makes no tokens, which is
     the kind of confident wrongness a picture is very good at hiding. */
  const focus = card("Krenko, Mob Boss");
  const offered = new Set([...(focus.produces || []), ...(focus.triggers || [])]);
  const wrong = [];
  for (const c of graph.cards) {
    if (c.id === focus.id) continue;
    const r = Graph.relate(focus, c);
    if (!r) continue;
    for (const term of r.multiplied) {
      if (term !== "trigger" && !offered.has(term)) wrong.push(`${c.name}: ${term}`);
    }
  }
  assert.deepEqual(wrong.slice(0, 5), [], `${wrong.length} multiply edges name something Krenko does not do`);
});

ok("a doubler that names no event still reaches cards that have triggers", () => {
  const generic = graph.cards.filter((c) => (c.multiplies || []).includes("trigger"));
  assert.ok(generic.length > 0, "the bake must carry generic trigger doublers");
  const r = Graph.relate(card("Purphoros, God of the Forge"), generic[0]);
  assert.ok(r && r.multiplied.includes("trigger"), `${generic[0].name} did not reach a card with a trigger`);
  assert.ok(r.score <= 4, `the generic pairing scored ${r.score}; it is the weakest of these and must stay so`);
});

/* --------------------------------------------------------------- grant and extend */

ok("a card that grants a quality is joined to one that spreads it", () => {
  const r = relate("Swiftfoot Boots", "Heroic Intervention");
  assert.ok(r.extended.includes("hexproof"), `extended was ${JSON.stringify(r.extended)}`);
  assert.match(r.reason, /Grants → extends across your board/);
});

ok("having a keyword is not being joined by it", () => {
  /* Every flier in Magic says "flying". If that were a grant edge the graph would draw
     a thousand-card blob and call it a protection package. */
  const fliers = graph.cards.filter((c) => (c.mechanics || []).includes("flying") && !(c.grants || []).length);
  assert.ok(fliers.length > 50, "the corpus must hold plenty of plain fliers");
  const r = Graph.relate(fliers[0], fliers[1]);
  assert.ok(!r || (!r.extended.length && !r.extendedBy.length),
    `${fliers[0].name} and ${fliers[1].name} were joined by a quality neither hands out`);
});

/* ------------------------------------------------------------------- the whole corpus */

ok("both sides of every relation are reachable from the cards that carry them", () => {
  /* A term that only one side of a join ever names is a column nobody can walk. */
  const side = (field) => new Set(graph.cards.flatMap((c) => c[field] || []));
  const causes = side("causes"), triggers = side("triggers");
  const shared = [...causes].filter((t) => triggers.has(t));
  assert.ok(shared.length >= 8, `only ${shared.length} events have a card on both sides`);
  const produces = side("produces"), multiplies = side("multiplies");
  const compounded = [...multiplies].filter((t) => t === "trigger" || produces.has(t) || triggers.has(t));
  assert.equal(compounded.length, multiplies.size, "a multiplier names something no card makes or fires");
});

ok("the directed relations reach cards the shared-word graph never linked", () => {
  /* The point of the change, measured: how many of one card's neighbours exist only
     because of an arrow. If this ever drops to zero the new edges are decorative. */
  const focus = card("Purphoros, God of the Forge");
  let onlyDirected = 0, total = 0;
  for (const c of graph.cards) {
    if (c.id === focus.id) continue;
    const r = Graph.relate(focus, c);
    if (!r) continue;
    total += 1;
    if (!r.shared.length && !r.feeds.length && !r.fed.length) onlyDirected += 1;
  }
  assert.ok(onlyDirected > 50,
    `only ${onlyDirected} of ${total} neighbours of Purphoros come from a directed relation`);
});

ok("relate is honest about a pair with nothing between them", () => {
  assert.equal(Graph.relate(null, card("Sol Ring")), null);
  assert.equal(Graph.relate(card("Sol Ring"), card("Sol Ring")), null, "a card is not joined to itself");
});


/* ------------------------------------------------- what the bake stopped claiming */

ok("proliferate is a multiplier, not an event anything fires on", () => {
  /* The old bake modelled proliferate as an EVENT: a card that put counters "caused" it
     and a card that says proliferate "listened" for it. Neither is what happens. Putting
     counters does not fire Atraxa; proliferate makes more of the counters already there.
     So the pseudo-event is gone and the pair is produces(counter) x multiplies(counter). */
  const named = graph.cards.filter((c) => (c.causes || []).includes("proliferate") || (c.triggers || []).includes("proliferate"));
  assert.deepEqual(named.slice(0, 3).map((c) => c.name), [],
    `${named.length} cards still carry the retired proliferate event`);
  const doubling = card("Doubling Season"), atraxa = card("Atraxa, Praetors' Voice");
  assert.ok(atraxa.multiplies.includes("counter"), "Atraxa multiplies counters");
  assert.ok(doubling.produces.includes("counter"), "Doubling Season makes them");
  const r = Graph.relate(doubling, atraxa);
  assert.equal(r.kind, "Makes → multiplies");
  assert.match(r.reason, /Makes → multiplies · counter/);
});

ok("a counter is a counter, not only a +1/+1 counter", () => {
  /* Proliferate compounds loyalty, charge and shield counters too, so the resource has to
     mean all of them -- while the +1/+1-specific role and requirement stay specific. */
  const makers = graph.cards.filter((c) => (c.produces || []).includes("counter")).length;
  const plusOne = graph.cards.filter((c) => (c.roles || []).includes("counters")).length;
  assert.ok(makers > plusOne, `${makers} counter makers against ${plusOne} +1/+1 payoffs — the resource is still narrow`);
});

ok("the bake says what bracket a card commits a deck to", () => {
  /* The page holds a graph row and no rules text for most cards, so this cannot be a
     regex in the browser: it reported "no restriction" for Armageddon. */
  assert.equal(card("Rhystic Study").bracket, "gameChanger");
  assert.equal(card("Rhystic Study").gameChanger, true);
  assert.equal(card("Armageddon").bracket, "massLand");
  assert.equal(card("Time Warp").bracket, "extraTurns");
  assert.equal(card("Sol Ring").bracket, undefined, "an unrestricted card carries no bracket signal at all");
  const changers = graph.cards.filter((c) => c.gameChanger).length;
  assert.ok(changers > 20 && changers < 200, `${changers} Game Changers is not the shape of a curated list`);
});

ok("every card carries a TCGplayer link to buy it by", () => {
  const without = graph.cards.filter((c) => !c.buy);
  assert.ok(without.length < graph.cards.length * .02,
    `${without.length} of ${graph.cards.length} cards have nowhere to buy them`);
});

console.log(`crankmagic-graph: ${checks} checks passed over ${graph.cards.length} cards`);
