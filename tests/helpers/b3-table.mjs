/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import {createState, addObject} from "../../game/engine/state/index.mjs";
export const table = () => createState({matchId: "b3", seed: "memory", players: [{name: "Rob"}, {name: "Maya"}, {name: "Sam"}]});
export const creature = (card, extra = {}) => ({card, types: ["Creature"], subtypes: ["Bear"], power: 2, toughness: 3, manaCost: "{1}{G}", ...extra});
export const put = (s, card, zone = "battlefield", owner = 0) => addObject(s, {...card, owner, controller: owner}, zone, ["battlefield", "exile"].includes(zone) ? null : owner);
