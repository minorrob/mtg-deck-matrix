/* The queue comes from Forge's own dialog, so the shape below is copied out of a real match
 * journal (game/.local/games/2026-09-22T01-04-04-144Z) rather than invented — including the
 * double space before "Deck", which a tidier fixture would have hidden.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {parseOnboardingChoice, onboardingSeat, onboardingHeadline, spinnerWindow} from "../ui/card-onboarding.mjs";

const REAL = {
  mode: "ack", min: 0, max: 0,
  title: "AI can't play these cards well from D5 Shadrix Aristocrats'  Deck",
  options: [{index: 0, label: "=== Main Deck ==="}, {index: 1, label: "Orzhov Signet"}, {index: 2, label: "Psychosis Crawler"}],
};

test("the cards Forge cannot pilot are a queue, and the headings are not cards", () => {
  const q = parseOnboardingChoice(REAL);
  assert.deepEqual(q.cards, ["Orzhov Signet", "Psychosis Crawler"]);
  assert.equal(q.total, 2, "the separator is a heading, not a third card");
  assert.equal(q.deck, "D5 Shadrix Aristocrats", "the trailing possessive and the double space go");
});

test("nothing else is mistaken for this dialog", () => {
  assert.equal(parseOnboardingChoice(null), null);
  assert.equal(parseOnboardingChoice({mode: "one", title: REAL.title, options: []}), null, "only an acknowledgment");
  assert.equal(parseOnboardingChoice({mode: "ack", title: "Choose a card", options: []}), null);
  /* A list with only headings is a real match with nothing to do, not a parse failure. */
  assert.deepEqual(parseOnboardingChoice({...REAL, options: [{label: "=== Main Deck ==="}]}).cards, []);
});

test("the seat is found by name, so the wording knows whose deck it is", () => {
  const seats = [{playerId: 0, name: "D1 Quintorius Spirits", kind: "human"},
                 {playerId: 1, name: "D5 Shadrix Aristocrats", kind: "ai"}];
  const seat = onboardingSeat("D5 Shadrix Aristocrats", seats);
  assert.equal(seat.playerId, 1);
  assert.equal(onboardingHeadline("D5 Shadrix Aristocrats", seat, 0), "Onboarding D5 Shadrix Aristocrats's cards · AI seat");
  assert.equal(onboardingHeadline("D5 Shadrix Aristocrats", seat, 1), "Onboarding your cards", "your own seat is not addressed in the third person");
  const human = {playerId: 2, name: "Keith", kind: "human"};
  assert.equal(onboardingHeadline("Keith", human, 0), "Onboarding Keith's cards");
  /* A deck that matches no seat still gets named rather than becoming "cards". */
  assert.equal(onboardingHeadline("Some Deck", null, 0), "Onboarding Some Deck's cards");
  assert.equal(onboardingSeat("", seats), null);
});

test("the reel shows two behind and two ahead, and runs out rather than looping", () => {
  const cards = ["A", "B", "C", "D", "E"];
  assert.deepEqual(spinnerWindow(cards, 2).map((r) => r.name), ["A", "B", "C", "D", "E"]);
  assert.equal(spinnerWindow(cards, 2).find((r) => r.current).name, "C", "the one being processed is the middle");
  /* At the start there is nothing behind it, and at the end nothing ahead — blanks, not wraps,
     because a reel that wraps shows cards it has already finished as if they were pending. */
  assert.deepEqual(spinnerWindow(cards, 0).map((r) => r.name), ["", "", "A", "B", "C"]);
  assert.deepEqual(spinnerWindow(cards, 4).map((r) => r.name), ["C", "D", "E", "", ""]);
  assert.deepEqual(spinnerWindow([], 0).map((r) => r.name), ["", "", "", "", ""]);
  assert.deepEqual(spinnerWindow(cards, 2).map((r) => r.distance), [2, 1, 0, 1, 2], "distance drives the fade");
});
