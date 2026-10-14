import {readFileSync, writeFileSync} from "node:fs";
const [,, root, themesPath, out] = process.argv;
const {tableCards} = await import(root + "/cloud/game-room.mjs");
const t = JSON.parse(readFileSync(themesPath, "utf8"));
const free = (list) => list.filter((c) => !tableCards(c.name));
const lanes = {
  k1: [...free(t.lands), ...free(t.other)],
  k2: [...free(t.graveyard), ...free(t["combat-creatures"])],
  k3: free(t["tokens-counters"]),
  k4: free(t["draw-spells"]),
};
for (const [k, v] of Object.entries(lanes)) { v.sort((a, b) => a.rank - b.rank); console.log(k, v.length); }
writeFileSync(out, JSON.stringify(lanes, null, 1));
