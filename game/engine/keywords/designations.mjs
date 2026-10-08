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
 *
 * ASCEND (CR 702.131; Wayward Swordtooth) gives the city's blessing. On a permanent it is a static ability (702.131b): any
 * time its controller controls ten or more permanents and has no city's blessing, they get it for the rest of the game --
 * recorded as the game is checked, as storied's is (citysBlessings), and read this moment by whatever asks whether a player
 * has it, before any check records it (hasCitysBlessing). On an instant or sorcery it is a spell ability (702.131a), done as
 * the spell resolves (rules/stack.mjs, ascendAsItResolves). Ten permanents and no ascend give nothing. The blessing has no
 * rules meaning of its own (702.131c), stays when the permanents go, and any number of players may have it; "unless you
 * have the city's blessing" is the condition `citysBlessing` (script/condition.mjs). Its holder carries `citysBlessing:
 * true`, and no one else the key. Continuous effects are applied again after it is gained (702.131d): the layers here
 * derive every characteristic as it is asked, and the check that records it derives afresh after.
 */
import {keywordsOf, controllerOf, deriving} from "../rules/layers.mjs";
import {matchesSelector} from "../script/filter.mjs";

/** The family of §3.1, so `engine-coverage` counts these as behavior and not as words. */
export const KEYWORD_FAMILIES = Object.freeze({
  /** What a player comes to have: Storied's enduring story (CR 702.195), ascend's city's blessing (CR 702.131). */
  designations: Object.freeze(["Storied", "Ascend"]),
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

/* ---- the city's blessing (CR 702.131) ---- */

/** How many permanents a player must control for ascend to give the city's blessing (CR 702.131a-b). */
export const ASCEND_AT = 10;
/* Whether a player controls ten or more permanents now -- tokens and lands among them, every permanent there is. */
const tenPermanents = (state, player) => state.zones.battlefield.filter((id) => controllerOf(state, id) === player).length >= ASCEND_AT;
const blessed = (state, player) => ({kind: "GameEventCitysBlessing", data: {turn: state.turn, phase: state.phase, fields: {player: {playerId: player}}}});

/** Whether a player has the city's blessing: gained already, or theirs this moment by a permanent's ascend (CR 702.131b). */
export function hasCitysBlessing(state, player) {
  return state.players[player].citysBlessing === true || deriving(state, () => tenPermanents(state, player)
    && state.zones.battlefield.some((id) => controllerOf(state, id) === player && keywordsOf(state, id).includes("Ascend")));
}

/**
 * CR 702.131b: each player who controls a permanent with ascend, ten or more permanents, and no city's blessing yet, gets it
 * now -- for the rest of the game. Asked inside the check's one question (rules/sba.mjs).
 *
 * @returns {Array} an event for each player who gained it
 */
export function citysBlessings(state) {
  const ascending = state.zones.battlefield.filter((id) => keywordsOf(state, id).includes("Ascend"));
  const events = [];
  for (const player of state.players) {
    if (player.citysBlessing === true || !ascending.some((id) => controllerOf(state, id) === player.id) || !tenPermanents(state, player.id)) continue;
    player.citysBlessing = true;
    events.push(blessed(state, player.id));
  }
  return events;
}

/**
 * Ascend on an instant or sorcery (CR 702.131a): a spell ability of its own -- "if you control ten or more permanents and
 * you don't have the city's blessing, you get the city's blessing for the rest of the game" -- done as the spell resolves,
 * before the rest of what it does, as it is printed first (rules/stack.mjs), for whoever controls the resolving spell.
 *
 * @returns {Array} its event, when the blessing was gained
 */
export function ascendAsItResolves(state, player) {
  if (state.players[player].citysBlessing === true || !deriving(state, () => tenPermanents(state, player))) return [];
  state.players[player].citysBlessing = true;
  return [blessed(state, player)];
}
