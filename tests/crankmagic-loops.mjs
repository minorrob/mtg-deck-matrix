/* The loop finder, held to the loops that motivated it.
 *
 * D6 Krenko Goblins already holds a verified infinite combo -- Krenko, Mob Boss, Thornbite
 * Staff and Goblin Bombardment (Skirk Prospector in Bombardment's place) -- and the graph
 * could not see it until the untap vocabulary landed. This suite asks the finder for the
 * cycles through Krenko over the deck's own hundred, and for the two-card draw–damage shape
 * (Niv-Mizzet, Parun with Curiosity) over graph rows. It also pins what must NOT be a loop:
 * Sol Ring, which taps for mana and nothing else, closes nothing with anyone.
 */
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const Loops = require("../crankmagic-loops.js");
const graph = require("../graph-payload.js").unpack(JSON.parse(await readFile(new URL("../data/graph.json", import.meta.url), "utf8")));
const source = await readFile(new URL("../crankmagic-graph.js", import.meta.url), "utf8");
const root = {};
new Function("globalThis", "window", "self", source)(root, root, root);
const Graph = root.CrankGraph;
const byName = new Map(graph.cards.map((c) => [c.name, c]));
const row = (name) => { const c = byName.get(name); assert.ok(c, `${name} is in the graph`); return c; };

let checks = 0;
const ok = (label, fn) => { fn(); checks += 1; process.stdout.write(`  ok  ${label}\n`); };

/* D6's hundred, as graph rows, from the committed live state. */
const backup = JSON.parse(await readFile(new URL("../data/live-state.json", import.meta.url), "utf8"));
const live = backup.payload.state || backup.payload;
const d6 = live.decks.find((d) => /Krenko/.test(d.name));
assert.ok(d6, "the live state holds the Krenko deck");
const d6Names = new Set(d6.slots.filter((s) => s.purpose === "main").map((s) => live.cards[s.cardId] && live.cards[s.cardId].name).filter(Boolean));
const d6Rows = [...d6Names].map((n) => byName.get(n)).filter(Boolean).filter((c) => !c.isLand);
const krenko = row("Krenko, Mob Boss");

ok("the Krenko loop is found in D6: Krenko, an outlet, Thornbite Staff, and back", () => {
  const loops = Loops.find(d6Rows, Graph.relate, krenko.id);
  assert.ok(loops.length >= 1, "at least one loop through Krenko");
  const names = loops.map((l) => l.steps.map((s) => s.name));
  const withStaff = loops.filter((l) => l.steps.some((s) => s.name === "Thornbite Staff"));
  assert.ok(withStaff.length >= 1, `a loop runs through Thornbite Staff; found ${JSON.stringify(names)}`);
  const outlet = withStaff.some((l) => l.steps.some((s) => s.name === "Goblin Bombardment" || s.name === "Skirk Prospector"));
  assert.ok(outlet, `the loop's outlet is Goblin Bombardment or Skirk Prospector; found ${JSON.stringify(names)}`);
  assert.ok(withStaff.every((l) => l.closed), "a loop with an untap on it is closed");
  const staff = withStaff[0].steps.find((s) => s.name === "Thornbite Staff");
  assert.equal(staff.via.kind, "resets", "the step that leaves Thornbite Staff is the untap");
  assert.equal(withStaff[0].steps[(withStaff[0].steps.indexOf(staff) + 1) % withStaff[0].steps.length].name, "Krenko, Mob Boss", "and it lands on Krenko");
});

ok("the loop's payoffs are the cards that turn each pass into damage or cards", () => {
  const loops = Loops.find(d6Rows, Graph.relate, krenko.id);
  const payoffs = new Set(loops.flatMap((l) => l.payoffs.map((p) => p.name)));
  for (const name of ["Purphoros, God of the Forge", "Impact Tremors"]) {
    if (d6Names.has(name)) assert.ok(payoffs.has(name), `${name} is a payoff of the Krenko loop`);
  }
  for (const l of loops) for (const p of l.payoffs) assert.ok(!l.steps.some((s) => s.id === p.id), "a payoff is not a member of its own cycle");
});

ok("Niv-Mizzet and Curiosity close a two-card cycle on graph rows alone", () => {
  const niv = row("Niv-Mizzet, Parun"), cur = row("Curiosity"), sol = row("Sol Ring");
  const loops = Loops.find([niv, cur, sol], Graph.relate, niv.id);
  assert.equal(loops.length, 1, `one loop, found ${loops.length}`);
  assert.deepEqual(loops[0].steps.map((s) => s.name), ["Niv-Mizzet, Parun", "Curiosity"]);
  assert.ok(loops[0].closed, "every step fires, so it is closed");
  assert.match(Loops.sentence(loops[0]), /Niv-Mizzet, Parun → life loss → Curiosity → a draw → Niv-Mizzet, Parun/);
});

ok("Sol Ring and Arcane Signet are on no loop, in D6 or anywhere", () => {
  for (const name of ["Sol Ring", "Arcane Signet"]) {
    const c = row(name);
    assert.equal(Loops.find(d6Rows.concat(d6Rows.some((x) => x.id === c.id) ? [] : [c]), Graph.relate, c.id).length, 0, `${name} closes nothing`);
    assert.ok(!Loops.find(d6Rows, Graph.relate, krenko.id).some((l) => l.steps.some((s) => s.name === name)), `${name} is on no Krenko loop`);
  }
});

ok("the finder is deterministic and never exceeds the length it was given", () => {
  const a = Loops.find(d6Rows, Graph.relate, krenko.id, {maxLen: 4});
  const b = Loops.find(d6Rows, Graph.relate, krenko.id, {maxLen: 4});
  assert.deepEqual(a, b);
  assert.ok(a.every((l) => l.length <= 4));
  const short = Loops.find(d6Rows, Graph.relate, krenko.id, {maxLen: 2});
  assert.ok(short.every((l) => l.length <= 2));
  assert.equal(Loops.find(d6Rows, Graph.relate, "not-a-card").length, 0);
});

console.log(`crankmagic-loops: ${checks} checks passed · D6 read as ${d6Rows.length} nonland rows`);
