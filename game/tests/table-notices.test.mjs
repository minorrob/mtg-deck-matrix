/* The notice feed decides what interrupts a player, so the two ways it can be useless are the two
 * things to pin: saying nothing when something mattered, and saying everything until nobody reads
 * any of it.
 *
 * From Rob's four-player pod, 2026-09-21: "I would like to see the actions the other players
 * take" and "I just had a creature eliminated from my board. I don't know why."
 */
import test from "node:test";
import assert from "node:assert/strict";
import {noticesFor, isWorthANotice, lifeDelta, eventKindLabel, historyScopes} from "../ui/table-notices.mjs";

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

test("an engine event name is turned into English, including ones nobody listed", () => {
  assert.equal(eventKindLabel("GameEventCardChangeZone"), "moved between zones");
  assert.equal(eventKindLabel("GameEventPlayerDamaged"), "damage dealt to a player");
  /* An unlisted kind must still read as words rather than as a Java class name -- Forge adds
     events and the history pane should degrade into English, not into "GameEventFlipCoin". */
  assert.equal(eventKindLabel("GameEventFlipCoin"), "flip coin");
  assert.equal(eventKindLabel(undefined), "table event");
});

/* Rob's alert list, 2026-09-21. These two were in the feed all along and never reached anybody. */
test("poison and your own draw are announced", () => {
  assert.equal(isWorthANotice(row({playerId: ME, kind: "GameEventPlayerPoisoned", label: "Poison 0 → 3"}), ME), true,
    "ten poison counters ends a game; it is not a footnote");
  assert.equal(isWorthANotice(row({playerId: ME, kind: "GameEventCardChangeZone", label: "Drew a card"}), ME), true);
  /* An opponent's draw does not reach the viewer's feed at all -- match-telemetry.mjs drops it --
     so this only has to be true for rows that do arrive. */
  assert.equal(isWorthANotice(row({playerId: ME, kind: "GameEventCardChangeZone", label: "Hand → Graveyard"}), ME), false,
    "an ordinary zone shuffle is still not a notice");
});

/* Rob asked for a history filter: All History, My History, Targeting Me. `row.playerId` alone
 * cannot separate the last two, because telemetry sets it to whoever the row is ABOUT — the actor
 * for a cast, the victim for damage. */
test("a history row knows whether you did it or it was done to you", () => {
  const S = (over) => [...historyScopes(row({playerId: ME, ...over}), ME)].sort();
  assert.deepEqual(S({kind: "GameEventSpellAbilityCast", label: "Spell cast"}), ["all", "mine"]);
  assert.deepEqual(S({kind: "GameEventLandPlayed", label: "Land played"}), ["all", "mine"]);
  assert.deepEqual(S({kind: "GameEventCardChangeZone", label: "Drew a card"}), ["all", "at-me", "mine"],
    "a draw is both: you did it, and it changed your hand");
  assert.deepEqual(S({kind: "GameEventCardChangeZone", label: "Died · battlefield → graveyard"}), ["all", "at-me"],
    "your own creature dying is something done to you");
  assert.deepEqual(S({kind: "GameEventPlayerDamaged", label: "3 combat damage to You"}), ["all", "at-me"]);
  assert.deepEqual(S({kind: "GameEventPlayerPoisoned", label: "Poison 0 → 3"}), ["all", "at-me"]);
  assert.deepEqual(S({kind: undefined, label: "Life 40 → 37"}), ["all", "at-me"]);
  /* Somebody else's row is in "all" and nothing else, whatever kind it is. */
  assert.deepEqual([...historyScopes(row({playerId: 2, kind: "GameEventSpellAbilityCast"}), ME)], ["all"]);
  assert.deepEqual([...historyScopes(null, ME)], ["all"], "a missing row does not throw");
});

/* Rob's correction, 2026-09-21: "Maybe not targeting me, but I (as a player) want to filter to the
 * events that had an effect on me, done by myself and other players." Who caused it is not the
 * question; whether the viewer was changed is. */
test("the third filter is everything that changed you, whoever caused it", () => {
  const S = (over) => [...historyScopes(row({playerId: ME, ...over}), ME)].sort();
  assert.ok(S({kind: "GameEventCardChangeZone", label: "Entered battlefield"}).includes("at-me"),
    "your permanent arriving changed you as much as it leaving did");
  assert.ok(S({kind: "GameEventCardCounters", label: "2 counters added"}).includes("at-me"));
  /* An opponent killing your creature and you sacrificing it are the same row shape; both count. */
  assert.ok(S({kind: "GameEventCardChangeZone", label: "Died · battlefield → graveyard"}).includes("at-me"));
  /* And a cast is still only an action, not a change to you. */
  assert.deepEqual(S({kind: "GameEventSpellAbilityCast", label: "Spell cast"}), ["all", "mine"]);
});
