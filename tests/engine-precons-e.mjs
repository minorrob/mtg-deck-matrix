/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE PRECON LOAD, LANE E (WRETCHED RANKS; the card load of 2026-10-25): what the cards' scenarios cannot say.
 *
 * - The rules the lane built, at their edges: Kalitas's death replacement for each opponent at a table of three, an
 *   opponent's Kalitas against Rob's creature, and Kalitas beside another "exile it instead" (the game goes on); Josu Vess's
 *   "if he was kicked" read off the permanent; a sacrifice remembered for every player who made it (Syphon Flesh).
 * - What the schema and the compiler refuse of each new key: `kicked` a condition of true or false, a replacement's `then`
 *   beside a prevention or a zone change's new destination only, and a spell's `promised` script only with gift and effects.
 * - And every card of Wretched Ranks the lane wrote, played through its scenarios.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {loadCardIndex, loadCardScenarios, loadCardScripts} from "../game/tools/engine-cards.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {conditionProblems} from "../game/engine/script/condition.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";

let checks = 0;
const check = (name, fn) => { try { fn(); checks += 1; } catch (e) { e.message = `${name}: ${e.message}`; throw e; } };
const index = loadCardIndex();
const creature = (cost, subtypes, p = 1, t = 1, colors = ["G"]) => ({types: ["Creature"], subtypes, manaCost: cost, colors, power: p, toughness: t});
const FIXTURES = {
  Bear: creature("{1}{G}", ["Bear"], 2, 2), Ghoul: creature("{1}{B}", ["Zombie"], 2, 2, ["B"]),
  Murder: {types: ["Instant"], manaCost: "{C}", colors: [], spell: {id: "s", text: "Destroy target creature.", targets: [{what: "permanent", types: ["Creature"]}],
    effects: [{effect: "destroy", targets: {target: 0}}]}},
};
const play = (scenario) => runScenario({name: "precons-e", expect: [], ...scenario}, index.definition, FIXTURES).state;
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const named = (s, name, zone, seat) => s.zones[zone].flat().filter((id) => s.objects[id].card === name && (seat === undefined || s.objects[id].controller === seat));
const scriptOf = (name) => structuredClone(loadCardScripts().find((e) => e.script.identity.name === name).script);
const refused = (script) => compileScript(script).definition === null;
const MURDER = (who, seat) => [{tap: "Wastes", seat}, {cast: "Murder", seat, targets: [{card: who}]}, {resolve: true}];

check("Kalitas at a table of three: each opponent's nontoken creature is exiled, and the Zombie is Rob's", () => {
  const s = play({seats: 3, setup: [at(0, "battlefield", "Kalitas, Traitor of Ghet", "Wastes", "Wastes"), at(0, "hand", "Murder", "Murder"),
    at(1, "battlefield", "Bear"), at(2, "battlefield", "Ghoul")], steps: [...MURDER("Bear", 0), ...MURDER("Ghoul", 0)]});
  assert.equal(named(s, "Bear", "exile").length, 1, "Maya's Bear exiled");
  assert.equal(named(s, "Ghoul", "exile").length, 1, "Trey's Zombie exiled");
  assert.equal(named(s, "Zombie", "battlefield", 0).length, 2, "two Zombie tokens, both Rob's (CR 111.2)");
  assert.equal(s.zones.graveyard[1].length + s.zones.graveyard[2].length, 0, "neither went to a graveyard");
});

check("Maya's Kalitas exiles Rob's creature and gives Maya the Zombie; Rob's own Kalitas does nothing for his", () => {
  const s = play({setup: [at(0, "battlefield", "Kalitas, Traitor of Ghet", "Bear", "Wastes"), at(0, "hand", "Murder"), at(1, "battlefield", "Kalitas, Traitor of Ghet")],
    steps: MURDER("Bear", 0)});
  assert.equal(named(s, "Bear", "exile").length, 1);
  assert.equal(named(s, "Zombie", "battlefield", 1).length, 1, "the token is Maya's: her Kalitas's replacement made it");
  assert.equal(named(s, "Zombie", "battlefield", 0).length, 0);
});

/* CR 616.1: both replacements exile the Bear, but only Kalitas creates a Zombie. The affected controller chooses. */
check("Kalitas beside Liesa on one death: both explicit replacement orders complete with their actual outcomes", () => {
  for (const chosen of ["Kalitas, Traitor of Ghet", "Liesa, Forgotten Archangel"]) {
    let s = play({setup: [at(0, "battlefield", "Kalitas, Traitor of Ghet", "Liesa, Forgotten Archangel", "Wastes"), at(0, "hand", "Murder"), at(1, "battlefield", "Bear")],
      steps: MURDER("Bear", 0)});
    assert.equal(s.awaiting?.kind, "rule-operation", "the replacement choice is saved before the destruction finishes");
    assert.equal(s.awaiting.player, 1, "the Bear's controller chooses the replacement");
    assert.deepEqual(awaitingChoice(s).options.map(option => s.objects[option.cardId].card).sort(),
      ["Kalitas, Traitor of Ghet", "Liesa, Forgotten Archangel"].sort(), "both actual replacement source identities are offered");
    assert.equal(named(s, "Bear", "battlefield").length, 1, "the original Bear stays until the explicit answer");
    s = JSON.parse(JSON.stringify(s));
    resolveAwaiting(s, [awaitingChoice(s).options.findIndex(option => s.objects[option.cardId].card === chosen)]);
    assert.equal(s.awaiting ?? null, null, "nothing is waiting");
    assert.equal(named(s, "Bear", "exile").length, 1, "exiled, as either effect does");
    assert.equal(s.stack.length, 0);
    assert.equal(named(s, "Zombie", "battlefield", 0).length, chosen.startsWith("Kalitas") ? 1 : 0,
      "Kalitas creates exactly one Zombie; choosing Liesa creates none");
  }
});

check("Josu Vess remembers being kicked on the permanent; unkicked, he does not", () => {
  const kicked = play({setup: [at(0, "battlefield", "Swamp", "Swamp", "Swamp", ...Array(7).fill("Wastes")), at(0, "hand", "Josu Vess, Lich Knight")],
    steps: [...["Swamp", "Swamp", "Swamp", ...Array(7).fill("Wastes")].map((tap) => ({tap})), {cast: "Josu Vess, Lich Knight", extraMana: "{5}{B}"}, {resolve: true}]});
  assert.equal(kicked.objects[named(kicked, "Josu Vess, Lich Knight", "battlefield")[0]].kicked, 1);
  const plain = play({setup: [at(0, "battlefield", "Swamp", "Swamp", "Wastes", "Wastes"), at(0, "hand", "Josu Vess, Lich Knight")],
    steps: [{tap: "Swamp"}, {tap: "Swamp"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: "Josu Vess, Lich Knight", extraMana: ""}, {resolve: true}]});
  assert.equal(plain.objects[named(plain, "Josu Vess, Lich Knight", "battlefield")[0]].kicked, undefined);
});

check("Syphon Flesh at a table of four: a token for each creature every other player sacrificed", () => {
  const s = play({seats: 4, setup: [at(0, "battlefield", "Swamp", "Wastes", "Wastes", "Wastes", "Wastes", "Ghoul"), at(0, "hand", "Syphon Flesh"),
    at(1, "battlefield", "Bear"), at(2, "battlefield", "Ghoul"), at(3, "battlefield", "Bear")],
    steps: [{tap: "Swamp"}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: "Syphon Flesh"}, {resolve: true}, {settle: true}]});
  assert.equal(named(s, "Zombie", "battlefield", 0).length, 3);
  assert.equal(named(s, "Ghoul", "battlefield", 0).length, 1, "Rob sacrifices nothing");
});

check("the schema and the compiler: what each new key may be", () => {
  assert.ok(conditionProblems({kicked: "yes"}).length > 0, "kicked is true or false");
  assert.deepEqual(conditionProblems({kicked: true}), []);
  const kalitas = scriptOf("Kalitas, Traitor of Ghet");
  assert.ok(!refused(kalitas), "a zone change's new destination, and what follows it");
  const nowhere = scriptOf("Kalitas, Traitor of Ghet");
  delete nowhere.abilities[1].change.to;
  assert.ok(refused(nowhere), "what follows, beside no destination and no prevention, is refused");
  const greed = scriptOf("Consumed by Greed");
  assert.ok(!refused(greed));
  const giftless = scriptOf("Consumed by Greed");
  giftless.abilities.shift();
  assert.ok(refused(giftless), "a promised script is a card with gift's");
  const empty = scriptOf("Consumed by Greed");
  empty.abilities[1].promised.effects = [];
  assert.ok(refused(empty), "a promised script says its effects");
});

/* Every card the lane wrote, through its scenarios. */
const LANE = JSON.parse(readFileSync(new URL("../docs/engine/card-load-precons-2026-10-25/lane-E-zombies.json", import.meta.url), "utf8")).cards.map((c) => c.name);
const files = loadCardScenarios().filter((f) => LANE.includes(f.scenarios.card));
assert.equal(files.length, LANE.length, "each card the lane wrote has its scenarios");
for (const {scenarios: file} of files) for (const scenario of file.scenarios)
  check(`${file.card}: ${scenario.name}`, () => runScenario(scenario, index.definition, file.fixtures ?? {}));

console.log(`engine-precons-e: ${checks} checks passed — Kalitas's exile and Zombie for each opponent and beside Liesa, Josu Vess kicked, a sacrifice remembered for everyone, the new keys refused where they do not belong, and Wretched Ranks's ${LANE.length} cards through their scenarios.`);
