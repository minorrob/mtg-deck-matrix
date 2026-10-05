/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE KEYWORDS THAT GIVE A PLAYER A DESIGNATION (Rob's Priority Batch 10.3, its seventeenth slice).
 *
 * STORIED (CR 702.195a) is a static ability: its controller, once they control three or more artifacts, Sagas and
 * legendary permanents in any mix, has an enduring story from then on, if they did not already. Read where the game is
 * checked, as state-based actions are (rules/sba.mjs): a permanent with it on the battlefield, and three such
 * permanents its controller controls -- the storied one among them when it is legendary. The designation is the player's,
 * for the rest of the game: it stays when the permanents go, and any number of players may have it (702.195b). Nothing
 * else in the rules reads it; "as long as you have an enduring story" is the condition `enduringStory`
 * (script/condition.mjs). A player who has it carries `enduringStory: true`; nobody else carries the key, so a game made
 * before it hashes and replays as it did.
 */
import {keywordsOf, controllerOf, deriving} from "../rules/layers.mjs";
import {matchesSelector} from "../script/filter.mjs";

/** The family of §3.1, so `engine-coverage` counts these as behavior and not as words. */
export const KEYWORD_FAMILIES = Object.freeze({
  /** What a player comes to have: Storied's enduring story (CR 702.195). */
  designations: Object.freeze(["Storied"]),
});

/* An artifact, a Saga or a legendary permanent, as it is now (layers 4 and its supertypes). */
const STORY = [{what: "permanent", types: ["Artifact"]}, {what: "permanent", subtypes: ["Saga"]}, {what: "permanent", supertypes: ["Legendary"]}];
const tells = (state, id) => STORY.some((selector) => matchesSelector(selector, state, id, {controller: controllerOf(state, id)}));

/**
 * CR 702.195a: each player who controls a permanent with storied, three or more artifacts, Sagas and legendaries, and no
 * enduring story yet, has one now.
 *
 * @returns {Array} an event for each player who gained one
 */
export function enduringStories(state) {
  /* Nobody left who could gain one: nothing to read. */
  if (state.players.every((player) => player.enduringStory === true || player.lost)) return [];
  /* One question, each permanent derived once in it (rules/layers.mjs, deriving), as the rest of the check is. */
  return deriving(state, () => {
    const events = [];
    const storied = state.zones.battlefield.filter((id) => keywordsOf(state, id).includes("Storied"));
    for (const player of state.players) {
      if (player.enduringStory === true || player.lost) continue;
      if (!storied.some((id) => controllerOf(state, id) === player.id)) continue;
      if (state.zones.battlefield.filter((id) => controllerOf(state, id) === player.id && tells(state, id)).length < 3) continue;
      player.enduringStory = true;
      events.push({kind: "GameEventEnduringStory", data: {turn: state.turn, phase: state.phase, fields: {player: {playerId: player.id}}}});
    }
    return events;
  });
}
