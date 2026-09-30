/* THE TABLE'S SOUND, AS RULES (B8; crankmagic-audio.js): the pack's card rules, the throttle, the moments a change of
 * view makes, the bed, and the player's arming and volumes -- all without a sound card: the script is run in a vm with
 * a fake audio context and a fake fetch, and what would have been played is read back.
 *
 *   Rules    one voice per card: a tribe over a bare creature, a subtype over its type, overlays for legendary and
 *            snow, a double-faced card by its front (R1-R7); the same clip twice within 80ms is one (R13).
 *   Moments  your turn; your draw (another seat's is not voiced); a spell on the stack, by its card; a land played; a
 *            permanent arriving that was no spell; a card the records do not know voiced when it arrives; tokens once;
 *            a creature dying, a permanent destroyed, one exiled; a wipe once; life gained, lost, lost in combat,
 *            to a commander; poison; attackers and blockers; the game's end; the first view silent.
 *   Bed      the game's; combat's through the combat steps; tension at 7 poison or 14 from one commander; the
 *            victory linger once it is over.
 *   Player   nothing until arm(); arming builds two buses; a clip fetched from its folder once; the throttle; the
 *            volumes and the mute remembered; muted, nothing plays.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
/* what the script returns was made in the vm's own realm: compared as plain data */
const eq = (a, b, m) => {assert.deepEqual(JSON.parse(JSON.stringify(a)), b, m); checks += 1;};

const box = {console, setTimeout, clearTimeout};
box.globalThis = box;
vm.runInNewContext(readFileSync(new URL("../crankmagic-audio.js", import.meta.url), "utf8"), box);
const A = box.CrankAudio;
ok(A && typeof A.momentsFor === "function", "crankmagic-audio.js puts CrankAudio on the global, as the app's classic scripts do");

/* RULES */
eq(A.resolveCardSounds("Creature — Goblin Warrior"), ["sfx_tribe_goblin"], "a creature is voiced by its tribe");
eq(A.resolveCardSounds("Creature — Human Dragon"), ["sfx_tribe_dragon"], "and by the most distinctive of its tribes (R7: Dragon over Human)");
eq(A.resolveCardSounds("Creature — Mutant"), ["sfx_cast_creature"], "a creature of no tribe the pack voices is a creature summoned");
eq(A.resolveCardSounds("Artifact — Equipment"), ["sfx_subtype_equipment"], "a subtype more specific than its type replaces the type's voice (R4)");
eq(A.resolveCardSounds("Legendary Snow Land"), ["sfx_play_land", "sfx_legendary_emphasis", "sfx_snow_emphasis"], "a land, with its overlays (R2)");
eq(A.resolveCardSounds("Instant // Sorcery"), ["sfx_cast_instant"], "a double-faced card is cast by its front");
eq(A.resolveCardSounds(""), [], "no type line, no sound");
const last = new Map();
ok(A.mayPlay("x", last, 1000) && !A.mayPlay("x", last, 1050) && A.mayPlay("x", last, 1081), "the same clip within 80ms is one clip (R13)");

/* MOMENTS: two views, the second made from the first */
const card = (cardId, name, types, extra = {}) => ({cardId, name, types, ...extra});
const player = (playerId, {life = 40, poison = 0, cmd = {}, hand = 5, library = 80, field = [], exile = []} = {}) =>
  ({playerId, health: {life, poison, commanderDamage: cmd}, zones: {Hand: {count: hand, cards: []}, Library: {count: library, cards: []}, Battlefield: {cards: field}, Exile: {cards: exile}, Graveyard: {cards: []}}});
const viewOf = (players, {turnPlayerId = 0, phase = "MAIN1", stack = [], combat = null, status = "playing"} = {}) => ({matchId: "m", status, state: {turnPlayerId, phase, stack, combat, players}});
const moments = (before, after, extra = {}) => A.momentsFor(before, after, {seat: 0, ...extra});
const base = () => viewOf([player(0), player(1)]);

eq(moments(null, base()), [], "the first view of a game is history, and makes no sound");
eq(moments(viewOf([player(0), player(1)], {turnPlayerId: 1}), base()), ["sfx_event_your_turn"], "the turn coming to you is your turn");
eq(moments(base(), viewOf([player(0, {hand: 6, library: 79}), player(1)])), ["sfx_event_draw"], "your hand growing as your library shrinks is your draw");
eq(moments(base(), viewOf([player(0), player(1, {hand: 6, library: 79})])), [], "another seat's draw is a count, and is not voiced");
const goblin = {"Krenko, Mob Boss": "Legendary Creature — Goblin Warrior"};
const typeLineOf = (c) => goblin[c.name] || (c.types || []).join(" ");
eq(moments(base(), viewOf([player(0), player(1)], {stack: [{stackId: 1, name: "Krenko, Mob Boss"}]}), {typeLineOf}), ["sfx_tribe_goblin", "sfx_legendary_emphasis"], "a spell cast is voiced by its card as it goes on the stack");
const onStack = viewOf([player(0), player(1)], {stack: [{stackId: 1, name: "Krenko, Mob Boss"}]});
eq(moments(onStack, viewOf([player(0, {field: [card(9, "Krenko, Mob Boss", ["Creature"])]}), player(1)]), {typeLineOf}), [], "and not a second time when it resolves into a permanent");
const unknown = viewOf([player(0), player(1)], {stack: [{stackId: 2, name: "Maya Secret 20"}]});
eq(moments(base(), unknown, {typeLineOf}), [], "a spell the records do not know has no types on the stack, and waits");
eq(moments(unknown, viewOf([player(0), player(1, {field: [card(10, "Maya Secret 20", ["Creature"])]})]), {typeLineOf}), ["sfx_cast_creature"], "and is voiced by its types when it arrives");
eq(moments(base(), viewOf([player(0, {field: [card(3, "Forest", ["Land"])]}), player(1)]), {typeLineOf}), ["sfx_play_land"], "a land played is voiced as a land");
eq(moments(base(), viewOf([player(0, {field: [card(4, "Bear", ["Creature"])]}), player(1)])), ["sfx_event_etb"], "a permanent arriving that was never a spell is an entering (R8)");
eq(moments(base(), viewOf([player(0, {field: [card(5, "Goblin", ["Creature"], {token: true}), card(6, "Goblin", ["Creature"], {token: true})]}), player(1)])), ["sfx_event_create_tokens"], "tokens once a batch, however many (R10)");
const two = viewOf([player(0, {field: [card(7, "Bear", ["Creature"]), card(8, "Signet", ["Artifact"])]}), player(1)]);
eq(moments(two, viewOf([player(0, {field: [card(8, "Signet", ["Artifact"])]}), player(1)])), ["sfx_event_dies"], "a creature leaving for the graveyard dies");
eq(moments(two, viewOf([player(0, {field: [card(7, "Bear", ["Creature"])]}), player(1)])), ["sfx_event_destroy"], "any other permanent is destroyed");
eq(moments(two, viewOf([player(0, {field: [card(8, "Signet", ["Artifact"])], exile: [card(20, "Bear", ["Creature"])]}), player(1)])), ["sfx_event_exile"], "one that went to exile is exiled");
const five = viewOf([player(0, {field: [1, 2, 3].map((i) => card(i, `B${i}`, ["Creature"]))}), player(1, {field: [4, 5].map((i) => card(i, `B${i}`, ["Creature"]))})]);
eq(moments(five, viewOf([player(0), player(1, {field: [card(5, "B5", ["Creature"])]})])), ["sfx_event_board_wipe"], "most of a board of three or more going at once is a wipe, voiced once (R9)");
eq(moments(base(), viewOf([player(0, {life: 43}), player(1)])), ["sfx_event_life_gain"], "life gained");
eq(moments(base(), viewOf([player(0, {life: 37}), player(1)])), ["sfx_event_life_loss"], "life lost");
eq(moments(base(), viewOf([player(0), player(1, {life: 35})], {phase: "COMBAT_DAMAGE"})), ["sfx_event_combat_damage"], "life lost in the damage step is combat damage");
eq(moments(base(), viewOf([player(0), player(1, {life: 35, cmd: {9: 5}})], {phase: "COMBAT_DAMAGE"})), ["sfx_event_commander_damage"], "and to a commander, commander damage");
eq(moments(base(), viewOf([player(0, {poison: 2}), player(1)])), ["sfx_event_poison"], "poison");
eq(moments(base(), viewOf([player(0), player(1)], {combat: {attacks: [{attacker: 7, blockers: []}]}})), ["sfx_event_attack"], "attackers declared");
eq(moments(viewOf([player(0), player(1)], {combat: {attacks: [{attacker: 7, blockers: []}]}}), viewOf([player(0), player(1)], {combat: {attacks: [{attacker: 7, blockers: [8]}]}})), ["sfx_event_block"], "blockers declared");
eq([moments(base(), viewOf([player(0), player(1)], {status: "finished"}), {over: "won"}), moments(base(), viewOf([player(0), player(1)], {status: "finished"}), {over: "lost"})], [["sfx_event_victory"], ["sfx_event_defeat"]], "the game's end, as the seat's victory or defeat");

/* BED */
eq([A.bedFor(base(), 0), A.bedFor(viewOf([player(0), player(1)], {phase: "COMBAT_DECLARE_ATTACKERS"}), 0), A.bedFor(viewOf([player(0, {poison: 7}), player(1)]), 0),
  A.bedFor(viewOf([player(0, {cmd: {9: 14}}), player(1)]), 0), A.bedFor(viewOf([player(0), player(1)], {status: "finished"}), 0)],
["bgm_game_aether_voyage", "bgm_combat_battle_shimmer", "bgm_tension_darkening_myth", "bgm_tension_darkening_myth", "bgm_victory_linger"], "the bed: the game's, combat's, tension at 7 poison or 14 from a commander, the victory linger (R11)");

/* PLAYER, over a fake context and fetch */
const fetched = [], started = [];
const param = () => ({value: 0, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime(v) {this.value = v;}});
const makeContext = () => ({state: "suspended", currentTime: 0, destination: {}, resume() {this.state = "running"; return Promise.resolve();},
  createGain() {return {gain: param(), connect() {}};}, createBufferSource() {return {connect() {}, start() {started.push(this.buffer);}, stop() {}};},
  decodeAudioData(bytes) {return Promise.resolve({bytes});}});
const index = {rows: [{slug: "sfx_play_land", kind: "card_type"}, {slug: "bgm_game_aether_voyage", kind: "bgm"}]};
const fetchImpl = (url) => {fetched.push(url); return Promise.resolve(url.endsWith(".json") ? {ok: true, json: () => Promise.resolve(index)} : {ok: true, arrayBuffer: () => Promise.resolve(url)});};
const store = new Map(), storage = {getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v))};
const player1 = A.createPlayer({storage, fetchImpl, makeContext, warn: () => {}});
ok(!player1.play("sfx_play_land") && fetched.length === 0, "before arm(), nothing plays and nothing is fetched");
ok(await player1.arm() && player1.isArmed(), "arm() builds the context and resumes it");
ok(player1.play("sfx_play_land", 5000) && !player1.play("sfx_play_land", 5040), "a clip plays once, and the same clip within 80ms does not");
ok(player1.startBgm("bgm_game_aether_voyage") && !player1.startBgm("bgm_game_aether_voyage"), "a bed starts once; asking for the bed that is playing does nothing");
await new Promise((r) => setTimeout(r, 20));
ok(fetched.includes("assets/audio/sound-index.json") && fetched.includes("assets/audio/sfx/sfx_play_land.mp3") && fetched.includes("assets/audio/bgm/bgm_game_aether_voyage.mp3") && started.length === 2,
  `each clip is fetched from its own folder, once (${fetched.join(", ")})`);
player1.setBusVolume("sfx", 0.3); player1.setMuted(true);
eq([store.get("crankmagic-audio-sfx"), store.get("crankmagic-audio-muted")], ["0.3", "true"], "the volumes and the mute are remembered on the device");
ok(!player1.play("sfx_play_land", 9000) && A.createPlayer({storage, fetchImpl, makeContext}).volumes().sfx === 0.3, "muted, nothing plays; and the next page reads the volume back");

console.log(`crankmagic-audio: ${checks} checks passed — the pack's card rules, the moments a change of view makes, the bed, and a player that plays nothing before it is armed.`);
