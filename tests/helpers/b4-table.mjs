/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import {createState, addObject} from "../../game/engine/state/index.mjs";
import {beginGame, advance} from "../../game/engine/rules/turn.mjs";
import {loadCardIndex} from "../../game/tools/engine-cards.mjs";
export const cards = loadCardIndex();
export const card = (name) => ({...cards.definition(name), card: name});
export const bear = {card: "Bear", types: ["Creature"], subtypes: ["Bear"], power: 2, toughness: 3};
export const on = (s, o, seat = 0, zone = "battlefield") => addObject(s, {...o, owner: seat, controller: seat}, zone, zone === "battlefield" ? null : seat);
export function table(seats = 3) {
  const s = createState({matchId: "b4", seed: "permissions", players: ["Rob", "Maya", "Trey", "Sam"].slice(0, seats).map((name) => ({name}))});
  for (let seat = 0; seat < seats; seat += 1) for (let i = 0; i < 30; i += 1) on(s, {card: "Wastes", types: ["Land"]}, seat, "library");
  beginGame(s);
  for (let i = 0; i < 50 && s.phase !== "MAIN1"; i += 1) advance(s);
  return s;
}
export function ready(s, id) { s.objects[id].controlledSinceTurn = 0; return id; }
