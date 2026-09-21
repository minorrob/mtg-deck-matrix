/* The notice feed decides what interrupts a player, so the two ways it can be useless are the two
 * things to pin: saying nothing when something mattered, and saying everything until nobody reads
 * any of it.
 *
 * From Rob's four-player pod, 2026-09-21: "I would like to see the actions the other players
 * take" and "I just had a creature eliminated from my board. I don't know why."
 */
import test from "node:test";
import assert from "node:assert/strict";
import {noticesFor, isWorthANotice, lifeDelta} from "../ui/table-notices.mjs";

const row = (over) => ({id: "e" + Math.random(), turn: 3, playerId: 1, kind: "GameEventSpellAbilityCast", name: "Odric", label: "Spell cast", ...over});
const ME = 0;

test("what another player did is announced; what you did is not announced back at you", () => {
  assert.equal(isWorthANotice(row({playerId: 1, label: "Spell cast"}), ME), true, "an opponent's spell");
  assert.equal(isWorthANotice(row({playerId: 1, kind: "GameEventLandPlayed", label: "Land played"}), ME), true, "an opponent's land");
  assert.equal(isWorthANotice(row({playerId: ME, label: "Spell cast"}), ME), false, "you just cast it");
  assert.equal(isWorthANotice(row({playerId: ME, kind: "GameEventLandPlayed", label: "Land played"}), ME), false, "you just played it");
});

test("what happened to you is announced whoever caused it", () => {
  const died = row({playerId: ME, kind: "GameEventCardChangeZone", label: "Died · battlefield → graveyard · earlier this turn: 3 damage from Odric"});
  assert.equal(isWorthANotice(died, ME), true, "your own creature dying is the case Rob could not explain");
  assert.equal(isWorthANotice(row({playerId: ME, kind: "GameEventPlayerDamaged", label: "3 combat damage to You"}), ME), true);
  assert.equal(isWorthANotice(row({playerId: ME, kind: undefined, label: "Life 40 → 37"}), ME), true);
  assert.equal(isWorthANotice(row({playerId: ME, kind: "GameEventCardCounters", label: "2 counters added"}), ME), true);
});

test("the constant background of a game is not a notice", () => {
  for (const [kind, label] of [["GameEventCardTapped", "Tapped"], ["GameEventSpellResolved", "Resolved"],
                               [undefined, "main1"], [undefined, "Library shuffled"]]) {
    assert.equal(isWorthANotice(row({kind, label}), ME), false, `${label} should stay quiet`);
  }
  /* A creature entering play follows the cast that put it there; announcing both says it twice. */
  assert.equal(isWorthANotice(row({playerId: 1, kind: "GameEventCardChangeZone", label: "Entered battlefield"}), ME), false);
});

test("a player connecting mid-game is not shown the whole game", () => {
  const seen = new Set();
  const feed = [row({id: "a"}), row({id: "b"}), row({id: "c"})];
  assert.deepEqual(noticesFor(feed, seen, ME, {priming: true}), [], "the first poll is history, not news");
  assert.equal(seen.size, 3, "and it is all marked seen, so it never arrives late");
  assert.deepEqual(noticesFor(feed, seen, ME), [], "the same feed again is not new");
});

test("only rows never seen before are announced, and in the order they happened", () => {
  const seen = new Set();
  noticesFor([row({id: "old"})], seen, ME, {priming: true});
  /* The feed is newest first and arrives whole on every poll. */
  const feed = [row({id: "new2", label: "Land played", kind: "GameEventLandPlayed"}), row({id: "new1"}), row({id: "old"})];
  const out = noticesFor(feed, seen, ME);
  assert.deepEqual(out.map((r) => r.id), ["new1", "new2"], "oldest first, and the seen one is gone");
  assert.deepEqual(noticesFor(feed, seen, ME), [], "a second poll of the same feed repeats nothing");
});

test("a life change reports how far it moved, not the two numbers", () => {
  assert.equal(lifeDelta({label: "Life 40 → 37"}), -3);
  assert.equal(lifeDelta({label: "Life 37 → 40"}), 3);
  assert.equal(lifeDelta({label: "Spell cast"}), null);
});
