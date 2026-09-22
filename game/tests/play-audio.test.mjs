/* THE ENGINE, RUN WITHOUT A SOUND CARD.
 *
 * Every failure this guards against is a silent one. A bus that is not connected, a bed that
 * restarts on every poll, a 404 refetched once per cast, a mute that forgets the volume a player
 * chose -- none of those throw, and none of them are visible in a screenshot. So the AudioContext
 * is a fake that writes down what it was asked to do, and the tests read that back.
 *
 * The fake is deliberately dumb. It implements what the Web Audio API actually offers and nothing
 * more, so a call the engine makes up would fail here rather than in Rob's browser.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createPlayAudio, readAudioPrefs, AUDIO_DEFAULTS} from "../ui/play-audio.mjs";

const index = JSON.parse(readFileSync("game/ui/assets/audio/sound-index.json", "utf8"));

function fakeContext() {
  const log = {gains: [], sources: [], started: [], stopped: [], resumed: 0};
  const destination = {kind: "destination"};
  const context = {
    state: "suspended", currentTime: 0, destination,
    resume() { log.resumed += 1; this.state = "running"; return Promise.resolve(); },
    close() { this.state = "closed"; },
    createGain() {
      const node = {
        kind: "gain", connectedTo: null,
        gain: {value: 1, ramps: [],
          cancelScheduledValues() {}, setValueAtTime() {},
          linearRampToValueAtTime(value) { this.ramps.push(value); this.value = value; }},
        connect(target) { node.connectedTo = target; },
      };
      log.gains.push(node);
      return node;
    },
    createBufferSource() {
      const node = {
        kind: "source", buffer: null, loop: false, connectedTo: null, running: false,
        connect(target) { node.connectedTo = target; },
        start() { node.running = true; log.started.push(node); },
        stop() { node.running = false; log.stopped.push(node); },
      };
      log.sources.push(node);
      return node;
    },
    decodeAudioData(bytes) { return Promise.resolve({decoded: bytes}); },
  };
  return {context, log};
}

/* A storage that behaves like localStorage, including the part where it can simply not be there. */
const fakeStorage = () => {
  const map = new Map();
  return {getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), map};
};

function harness({storage = fakeStorage(), missing = new Set(), warn = () => {}} = {}) {
  const {context, log} = fakeContext();
  const fetched = [];
  const fetchImpl = (url) => {
    fetched.push(url);
    const slug = url.split("/").pop().replace(/\.mp3$/, "");
    if (missing.has(slug)) return Promise.resolve({ok: false, status: 404});
    return Promise.resolve({ok: true, status: 200, arrayBuffer: () => Promise.resolve(url)});
  };
  const audio = createPlayAudio({index, storage, fetchImpl, warn, makeContext: () => context});
  return {audio, context, log, fetched, storage};
}

/* play() is deliberately not async -- a cast must not wait on a speaker -- so the fetch and the
   decode happen on promises nobody is holding. Yielding to the macrotask queue drains them all,
   which counting microtask ticks does not: miscount by one and a passing test proves nothing. */
const settle = async () => { for (let i = 0; i < 2; i += 1) await new Promise((r) => setTimeout(r, 0)); };

test("nothing exists until it is armed, because a browser will not play before a gesture", async () => {
  const {audio, log} = harness();
  assert.equal(audio.isArmed(), false);
  assert.equal(audio.play("sfx_cast_instant"), false, "a sound before the gesture is dropped, not queued");
  await settle();
  assert.deepEqual(log.started, [], "and nothing was started behind the player's back");
  assert.equal(await audio.arm(), true);
  assert.equal(audio.isArmed(), true);
});

test("two buses, both wired to the destination", async () => {
  const {audio, context, log} = harness();
  await audio.arm();
  assert.equal(log.gains.length, 2, "one bus for SFX and one for BGM, per the pack's Integration Notes");
  for (const bus of log.gains) assert.equal(bus.connectedTo, context.destination);
  const [sfx, bgm] = log.gains;
  assert.equal(sfx.gain.value, AUDIO_DEFAULTS.sfx);
  assert.equal(bgm.gain.value, AUDIO_DEFAULTS.bgm);
  assert.ok(bgm.gain.value < sfx.gain.value, "the pack's BGM rows all say the bed ducks under SFX");
});

test("a clip is fetched once and decoded once, however often it plays", async () => {
  const {audio, fetched, log} = harness();
  await audio.arm();
  assert.equal(audio.play("sfx_cast_instant", {when: 1000}), true);
  await settle();
  assert.equal(audio.play("sfx_cast_instant", {when: 5000}), true);
  await settle();
  assert.deepEqual(fetched, ["/audio/sfx/sfx_cast_instant.mp3"], "the second play reuses the buffer");
  assert.equal(log.started.length, 2, "but it does sound both times");
  for (const source of log.started) assert.equal(source.connectedTo, log.gains[0], "SFX goes to the SFX bus");
});

test("R13: the same clip twice inside 80ms sounds once", async () => {
  const {audio, log} = harness();
  await audio.arm();
  assert.equal(audio.play("sfx_cast_instant", {when: 1000}), true);
  assert.equal(audio.play("sfx_cast_instant", {when: 1040}), false);
  assert.equal(audio.play("sfx_cast_creature", {when: 1040}), true, "a different clip is not a stack");
  await settle();
  assert.equal(log.started.length, 2);
});

test("a clip that will not load warns once and never asks again", async () => {
  const warnings = [];
  const {audio, fetched} = harness({missing: new Set(["sfx_cast_instant"]), warn: (m) => warnings.push(m)});
  await audio.arm();
  audio.play("sfx_cast_instant", {when: 1000});
  await settle();
  audio.play("sfx_cast_instant", {when: 9000});
  await settle();
  assert.equal(warnings.length, 1, "one warning, not one per cast");
  assert.match(warnings[0], /sfx_cast_instant/);
  assert.equal(fetched.length, 1, "a 404 is remembered; refetching it would be one dead request per cast");
});

test("a slug the pack does not ship is refused by name, not by a silent 404", async () => {
  const warnings = [];
  const {audio, fetched} = harness({warn: (m) => warnings.push(m)});
  await audio.arm();
  assert.equal(audio.play("sfx_tribe_werewolf"), false);
  assert.deepEqual(fetched, []);
  assert.equal(warnings.length, 1);
});

test("playForCard runs the resolution rules and plays what they chose", async () => {
  const {audio, fetched} = harness();
  await audio.arm();
  assert.deepEqual(audio.playForCard("Legendary Creature — Dragon", {when: 1000}),
    ["sfx_tribe_dragon", "sfx_legendary_emphasis"]);
  await settle();
  assert.deepEqual(fetched.sort(),
    ["/audio/sfx/sfx_legendary_emphasis.mp3", "/audio/sfx/sfx_tribe_dragon.mp3"]);
});

test("the beds loop, crossfade, and never stack", async () => {
  const {audio, log} = harness();
  await audio.arm();
  assert.equal(await audio.startBgm("bgm_lobby_mythic_calm"), true);
  await settle();
  const lobby = log.started.at(-1);
  assert.equal(lobby.loop, true, "a bed loops; a sound effect does not");
  assert.equal(lobby.connectedTo.connectedTo, log.gains[1], "beds reach the BGM bus through their own gain");
  assert.equal(lobby.connectedTo.gain.ramps.at(-1), 1, "and fade in rather than snapping on");

  assert.equal(await audio.startBgm("bgm_lobby_mythic_calm"), false,
    "asking for the bed that is already playing does nothing; otherwise every poll restarts the music");

  assert.equal(await audio.startBgm("bgm_combat_battle_shimmer"), true);
  await settle();
  assert.equal(log.started.length, 2);
  assert.equal(lobby.connectedTo.gain.ramps.at(-1), 0, "the outgoing bed fades out (R11's crossfade)");
  assert.equal(audio.bed(), "bgm_combat_battle_shimmer");
});

test("volumes persist, and muting does not forget them", async () => {
  const storage = fakeStorage();
  const {audio, log} = harness({storage});
  await audio.arm();
  audio.setBusVolume("sfx", 0.8);
  audio.setBusVolume("bgm", 2);
  assert.deepEqual(audio.volumes(), {sfx: 0.8, bgm: 1, muted: false}, "out-of-range values are clamped");
  assert.equal(log.gains[0].gain.value, 0.8);

  audio.setMuted(true);
  assert.equal(log.gains[0].gain.value, 0, "muted is silent on both buses");
  assert.equal(log.gains[1].gain.value, 0);
  assert.equal(audio.play("sfx_cast_instant"), false, "and nothing is decoded while muted");

  audio.setMuted(false);
  assert.equal(log.gains[0].gain.value, 0.8, "unmuting returns the mix the player chose, not the default");

  /* A second session reads back what the first one saved. */
  assert.deepEqual(readAudioPrefs(storage), {sfx: 0.8, bgm: 1, muted: false});
});

test("no storage at all is not an error", () => {
  assert.deepEqual(readAudioPrefs(null), AUDIO_DEFAULTS);
  assert.deepEqual(readAudioPrefs({getItem() { throw new Error("blocked"); }}), AUDIO_DEFAULTS);
});
