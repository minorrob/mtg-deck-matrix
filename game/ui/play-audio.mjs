/* THE THING THAT ACTUALLY MAKES A SOUND — and nothing that decides which sound.
 *
 * Which clip a card plays lives in play-audio-rules.mjs, which has never heard of a speaker. This
 * file is the other half: two Web Audio buses, a lazy decode, and the handful of rules that are
 * about playback rather than about Magic.
 *
 * The pack's own Integration Notes sheet asks for exactly this shape ("game/ui/play-audio.mjs",
 * "Prefer Web Audio API GainNodes for two buses", "Do not block UI on audio load failures;
 * console.warn once per missing file", "Persist volumes in existing prefs/local storage"), so it
 * is built to that rather than to a guess.
 *
 * NOTHING HERE ASSUMES A BROWSER. The AudioContext, fetch and storage are all injected, so the
 * whole engine runs in a test with no sound card: the fakes record what would have been played.
 */
import {resolveCardSounds, mayPlay} from "./play-audio-rules.mjs";

/* R12: "SFX bus and BGM bus separate; respect settings_sfx_volume / settings_bgm_volume /
 * mute_all." The pack states no starting numbers, but it does state the RELATIONSHIP between the
 * buses, in two places: every BGM index row says "Duck under SFX; user volume separate", and the
 * generated pack's README says the beds sit "~-6 to -12 dB relative". So the ratio is the pack's
 * and only the SFX number is chosen here.
 *
 * -9 dB is the middle of that range: 10^(-9/20) = 0.355, and 0.5 x 0.355 = 0.18.
 *
 * Not muted by default, and that is safe rather than startling, because a browser will not play
 * anything until the player has clicked something. The first sound anyone hears therefore arrives
 * after they have already reached for the board.
 */
export const AUDIO_DEFAULTS = {sfx: 0.5, bgm: 0.18, muted: false};
export const BGM_FADE_MS = 1200;

/* Alongside crankmagic-card-zoom and crankmagic-board-width, which the board already keeps. */
const PREF_KEYS = {sfx: "crankmagic-audio-sfx", bgm: "crankmagic-audio-bgm", muted: "crankmagic-audio-muted"};
const clamp01 = (value) => Math.max(0, Math.min(1, Number(value)));

/** The saved volumes, or the defaults. A storage that throws is a storage that has nothing. */
export function readAudioPrefs(storage) {
  const out = {...AUDIO_DEFAULTS};
  try {
    for (const bus of ["sfx", "bgm"]) {
      /* Number(null) is 0, and a storage that has never been written returns null. Reading that
         as "the player chose silence" is how a first game ends up with no sound and no reason. */
      const raw = storage?.getItem(PREF_KEYS[bus]);
      const saved = raw === null || raw === undefined || raw === "" ? NaN : Number(raw);
      if (Number.isFinite(saved) && saved >= 0 && saved <= 1) out[bus] = saved;
    }
    out.muted = storage?.getItem(PREF_KEYS.muted) === "true";
  } catch { /* a private window, or no storage at all; the defaults still work */ }
  return out;
}

export function writeAudioPref(storage, name, value) {
  try { storage?.setItem(PREF_KEYS[name], String(value)); } catch { /* not worth failing over */ }
}

/* A clip's file is named by its own index row: the row says whether it is a bed or an effect, and
   that is the only thing that decides which folder it is in. Hand-written paths would drift. */
const urlFor = (basePath, row) => basePath + (row.kind === "bgm" ? "bgm/" : "sfx/") + row.slug + ".mp3";

/** The player. Nothing is created until `arm()` — see the note on arming below. */
export function createPlayAudio({
  index, basePath = "/audio/", storage, fetchImpl, makeContext, warn = console.warn,
} = {}) {
  const rows = new Map((index?.rows || []).map((row) => [row.slug, row]));
  const prefs = readAudioPrefs(storage);
  const buffers = new Map();   /* slug -> Promise<AudioBuffer|null>, resolved once and kept */
  const lastPlayed = new Map();/* slug -> when, for R13 */
  const warned = new Set();
  let context = null, sfxBus = null, bgmBus = null;
  let currentBed = null, playing = null;

  const warnOnce = (slug, message) => { if (!warned.has(slug)) { warned.add(slug); warn(message); } };

  const applyVolumes = () => {
    if (!context) return;
    sfxBus.gain.value = prefs.muted ? 0 : prefs.sfx;
    bgmBus.gain.value = prefs.muted ? 0 : prefs.bgm;
  };

  /* ARMING. A browser refuses to play anything on a page the player has not interacted with, and
   * refuses SILENTLY -- the promise rejects and the bed never starts. R11 says to start the bed
   * "when the live game becomes ready/playing", which on a freshly loaded page is exactly when it
   * cannot. So the whole engine stays unbuilt until somebody calls arm() from a real interaction,
   * and everything before that is a no-op rather than a queue of stale sounds waiting to burst.
   */
  async function arm() {
    if (!context) {
      try { context = makeContext ? makeContext() : new AudioContext(); } catch { return false; }
      if (!context) return false;
      sfxBus = context.createGain();
      bgmBus = context.createGain();
      sfxBus.connect(context.destination);
      bgmBus.connect(context.destination);
      applyVolumes();
    }
    if (context.state === "suspended") {
      try { await context.resume(); } catch { return false; }
    }
    return context.state === "running";
  }

  function load(slug) {
    if (buffers.has(slug)) return buffers.get(slug);
    const row = rows.get(slug);
    const get = fetchImpl || ((url) => fetch(url));
    /* The FAILURE is cached too, on purpose. A clip that 404s once will 404 every time, and a
       cast that retries the fetch would mean one dead request per cast for the rest of the game. */
    const pending = Promise.resolve()
      .then(() => get(urlFor(basePath, row)))
      .then((response) => { if (!response.ok) throw new Error(response.status + " " + urlFor(basePath, row)); return response.arrayBuffer(); })
      .then((bytes) => context.decodeAudioData(bytes))
      .catch((error) => {
        warnOnce(slug, `play-audio: ${slug} is not playable (${error.message}). The game continues without it.`);
        return null;
      });
    buffers.set(slug, pending);
    return pending;
  }

  async function sound(slug, bus) {
    const buffer = await load(slug);
    if (!buffer || !context) return null;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(bus);
    source.start();
    return source;
  }

  /** One clip, once. Returns whether it was allowed to sound, not whether it has been heard yet. */
  function play(slug, {when = Date.now()} = {}) {
    if (!context || prefs.muted) return false;
    if (!rows.has(slug)) { warnOnce(slug, `play-audio: nothing in the pack is called ${slug}.`); return false; }
    /* R13: "ignore duplicate identical SFX within 80ms to avoid machine-gun stacking." */
    if (!mayPlay(slug, lastPlayed, when)) return false;
    void sound(slug, sfxBus);
    return true;
  }

  /** R1-R7, applied. Returns the slugs the rules chose, whether or not they were allowed to play. */
  function playForCard(typeLine, options) {
    const slugs = resolveCardSounds(typeLine);
    for (const slug of slugs) play(slug, options);
    return slugs;
  }

  /* A ramp is how a bed arrives without a click at the front of it. A fake gain param in a test
     may not implement one, and a missing ramp should not stop the sound. */
  const ramp = (param, value, fadeMs) => {
    try {
      param.cancelScheduledValues?.(context.currentTime);
      param.setValueAtTime?.(param.value, context.currentTime);
      param.linearRampToValueAtTime(value, context.currentTime + fadeMs / 1000);
    } catch { param.value = value; }
  };

  const retire = (bed, fadeMs) => {
    ramp(bed.gain.gain, 0, fadeMs);
    setTimeout(() => { try { bed.source.stop(); } catch { /* already finished */ } }, fadeMs);
  };

  /* R11 and the pack's rule 5: "Do not stack multiple BGM beds." Each bed gets its own gain into
   * the shared bus so one can fade out while the next fades in, and asking for the bed that is
   * already playing does nothing at all -- otherwise every poll would restart the music.
   */
  async function startBgm(slug, {fadeMs = BGM_FADE_MS} = {}) {
    if (!context || currentBed === slug) return false;
    if (!rows.has(slug)) { warnOnce(slug, `play-audio: nothing in the pack is called ${slug}.`); return false; }
    const previous = playing;
    currentBed = slug;
    const buffer = await load(slug);
    /* A decode takes time, and a crossfade can be asked for twice inside it. Whoever asked last
       wins, and the loser must not leave a bed running that nothing is holding. */
    if (currentBed !== slug) return false;
    if (!buffer) { currentBed = null; return false; }
    const gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(bgmBus);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain);
    source.start();
    ramp(gain.gain, 1, fadeMs);
    playing = {source, gain, slug};
    if (previous) retire(previous, fadeMs);
    return true;
  }

  function stopBgm({fadeMs = BGM_FADE_MS} = {}) {
    currentBed = null;
    if (!playing) return false;
    retire(playing, fadeMs);
    playing = null;
    return true;
  }

  function setBusVolume(bus, value) {
    if (bus !== "sfx" && bus !== "bgm") return prefs[bus];
    prefs[bus] = clamp01(value);
    writeAudioPref(storage, bus, prefs[bus]);
    applyVolumes();
    return prefs[bus];
  }

  /* Muting zeroes the buses without touching the saved volumes, so unmuting returns a player to
     the mix they chose rather than to a default. */
  function setMuted(muted) {
    prefs.muted = !!muted;
    writeAudioPref(storage, "muted", prefs.muted);
    applyVolumes();
    if (prefs.muted) stopBgm({fadeMs: 200});
    return prefs.muted;
  }

  function dispose() {
    stopBgm({fadeMs: 0});
    try { context?.close?.(); } catch { /* nothing to close */ }
    context = null; sfxBus = null; bgmBus = null;
    buffers.clear(); lastPlayed.clear();
  }

  return {
    arm, play, playForCard, startBgm, stopBgm, setBusVolume, setMuted, dispose,
    isArmed: () => context?.state === "running",
    bed: () => currentBed,
    volumes: () => ({...prefs}),
  };
}
