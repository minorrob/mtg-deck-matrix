/* THE TABLE'S SOUND (B8, docs/plan-to-done-2026-09-30.md): Rob's audio pack (docs/plan-play-audio.md, 88 clips in
 * assets/audio/) played by the cloud board.
 *
 * Three parts, which do not know about each other, ported from the local game host's three modules (game/ui/
 * play-audio-rules.mjs, play-audio.mjs, play-audio-events.mjs). This app has no build step and loads classic scripts,
 * so it is one file exposing CrankAudio on the global, as crankmagic-sea.js does:
 *
 *   RULES    which clip a CARD makes, from its type line (the pack's Resolution Rules R1-R7, and R13's throttle);
 *   PLAYER   two Web Audio buses, a lazy decode, the beds' crossfade (R11, R12), volumes remembered on the device;
 *   MOMENTS  which clips a MOMENT makes. The local host read Forge's telemetry rows; the cloud room sends each seat
 *            its view of the public state instead, so a moment is what changed between two views: a spell on the
 *            stack, a land or a permanent arriving, one leaving, a life total, poison, your turn, your draw, the
 *            game's end. The room's contract is unchanged: everything read here is already in the view.
 *
 * THE GESTURE IS THE WHOLE DIFFICULTY (docs/plan-play-audio.md): a browser refuses to play anything on a page nobody
 * has clicked, and refuses silently. The context is built and resumed synchronously inside the first press on the
 * board -- one await before that call and the permission is gone. Nothing is fetched before then.
 */
(function (root) {
  "use strict";

  /* ---- RULES: the sounds a card makes when it is cast or played (R1: one voice, then overlays) ---- */
  const TYPE_VOICE = [["Land", "sfx_play_land"], ["Creature", "sfx_cast_creature"], ["Planeswalker", "sfx_cast_planeswalker"], ["Battle", "sfx_cast_battle"],
    ["Artifact", "sfx_cast_artifact"], ["Enchantment", "sfx_cast_enchantment"], ["Instant", "sfx_cast_instant"], ["Sorcery", "sfx_cast_sorcery"], ["Kindred", "sfx_cast_kindred"]];
  /* R3-R5: a subtype more specific than its type replaces the type's voice. */
  const SUBTYPE_VOICE = new Map([["Vehicle", "sfx_subtype_vehicle"], ["Equipment", "sfx_subtype_equipment"], ["Aura", "sfx_subtype_aura"], ["Fortification", "sfx_subtype_fortification"],
    ["Saga", "sfx_subtype_saga"], ["Class", "sfx_subtype_class"], ["Treasure", "sfx_subtype_treasure"], ["Food", "sfx_subtype_food"], ["Clue", "sfx_subtype_clue"], ["Blood", "sfx_subtype_blood"]]);
  /* R6/R7: a creature's voice is its most distinctive tribe; the first seven are the workbook's, in its order. */
  const TRIBE_PRIORITY = ["Dragon", "Angel", "Demon", "Vampire", "Zombie", "Human", "Beast", "God", "Eldrazi", "Phyrexian", "Phoenix", "Kraken", "Giant", "Dinosaur",
    "Horror", "Spirit", "Skeleton", "Elemental", "Treefolk", "Ooze", "Golem", "Construct", "Merfolk", "Elf", "Goblin", "Dwarf",
    "Wolf", "Cat", "Bird", "Snake", "Spider", "Insect", "Fish", "Knight", "Wizard", "Cleric", "Rogue", "Warrior", "Soldier"];
  const TRIBE_RANK = new Map(TRIBE_PRIORITY.map((name, i) => [name, i]));
  const OVERLAYS = [["Legendary", "sfx_legendary_emphasis"], ["Snow", "sfx_snow_emphasis"]];   /* R2 */
  const SUPER = new Set(["Legendary", "Basic", "Snow", "World", "Ongoing", "Elite", "Host"]);

  function parseTypeLine(typeLine) {
    const text = String(typeLine || "").replace(/\s+/g, " ").trim();
    if (!text) return {supertypes: [], types: [], subtypes: []};
    const [head, tail = ""] = text.split("//")[0].trim().split(/\s[—–-]\s/);   /* a double-faced card is cast by its front */
    const words = head.split(" ").filter(Boolean);
    return {supertypes: words.filter((w) => SUPER.has(w)), types: words.filter((w) => !SUPER.has(w)), subtypes: tail.split(" ").filter(Boolean)};
  }
  function resolveCardSounds(typeLine) {
    const {supertypes, types, subtypes} = parseTypeLine(typeLine);
    if (!types.length) return [];
    const out = [];
    if (types.includes("Creature")) {
      const best = subtypes.filter((s) => TRIBE_RANK.has(s)).sort((a, b) => TRIBE_RANK.get(a) - TRIBE_RANK.get(b))[0];
      out.push(best ? `sfx_tribe_${best.toLowerCase()}` : "sfx_cast_creature");
    } else {
      const subtype = subtypes.find((s) => SUBTYPE_VOICE.has(s));
      if (subtype) out.push(SUBTYPE_VOICE.get(subtype));
      else {const match = TYPE_VOICE.find(([word]) => types.includes(word)); if (match) out.push(match[1]);}
    }
    if (!out.length) return [];
    for (const [word, slug] of OVERLAYS) if (supertypes.includes(word)) out.push(slug);
    return out;
  }
  /* R13: the same clip twice within 80ms is one clip. */
  const THROTTLE_MS = 80;
  function mayPlay(slug, lastPlayed, now, within = THROTTLE_MS) {
    const previous = lastPlayed.get(slug);
    if (previous !== undefined && now - previous < within) return false;
    lastPlayed.set(slug, now);
    return true;
  }

  /* ---- PLAYER: two buses; the beds at -9 dB under the effects (the pack's own ratio, R12) ---- */
  const DEFAULTS = {sfx: 0.5, bgm: 0.18, muted: false}, FADE_MS = 1200;
  const KEYS = {sfx: "crankmagic-audio-sfx", bgm: "crankmagic-audio-bgm", muted: "crankmagic-audio-muted"};
  const INDEX = "assets/audio/sound-index.json";
  /* The folder each clip is in is its row's kind; spelled out so the release carries both folders. */
  const urlFor = (row) => row.kind === "bgm" ? `assets/audio/bgm/${row.slug}.mp3` : `assets/audio/sfx/${row.slug}.mp3`;
  const clamp01 = (v) => Math.max(0, Math.min(1, Number(v)));

  function readPrefs(storage) {
    const out = {...DEFAULTS};
    try {
      for (const bus of ["sfx", "bgm"]) {
        const raw = storage && storage.getItem(KEYS[bus]), saved = raw === null || raw === undefined || raw === "" ? NaN : Number(raw);
        if (Number.isFinite(saved) && saved >= 0 && saved <= 1) out[bus] = saved;
      }
      out.muted = !!storage && storage.getItem(KEYS.muted) === "true";
    } catch (e) { /* a private window: the defaults */ }
    return out;
  }
  const writePref = (storage, name, value) => {try {storage && storage.setItem(KEYS[name], String(value));} catch (e) { /* not worth failing over */ }};

  function createPlayer({storage, fetchImpl, makeContext, warn = (m) => console.warn(m)} = {}) {
    const prefs = readPrefs(storage), buffers = new Map(), lastPlayed = new Map(), warned = new Set();
    let rows = null, rowsLoad = null, context = null, sfxBus = null, bgmBus = null, currentBed = null, playing = null;
    const get = fetchImpl || ((url) => fetch(url));
    const warnOnce = (key, message) => {if (!warned.has(key)) {warned.add(key); warn(message);}};
    const applyVolumes = () => {if (!context) return; sfxBus.gain.value = prefs.muted ? 0 : prefs.sfx; bgmBus.gain.value = prefs.muted ? 0 : prefs.bgm;};
    const index = () => rowsLoad || (rowsLoad = Promise.resolve().then(() => get(INDEX)).then((r) => r.json())
      .then((d) => {rows = new Map((d.rows || []).map((row) => [row.slug, row])); return rows;})
      .catch((error) => {warnOnce("index", `crankmagic-audio: the sound index did not load (${error.message}); the game goes on in silence.`); rows = new Map(); return rows;}));

    /* ARMING, inside the press: the context is made and resumed before anything is awaited. */
    function arm() {
      if (!context) {
        try {context = makeContext ? makeContext() : new (root.AudioContext || root.webkitAudioContext)();} catch (e) {return Promise.resolve(false);}
        if (!context) return Promise.resolve(false);
        sfxBus = context.createGain(); bgmBus = context.createGain();
        sfxBus.connect(context.destination); bgmBus.connect(context.destination);
        applyVolumes();
      }
      const resumed = context.state === "suspended" ? context.resume().catch(() => {}) : Promise.resolve();
      void index();
      return resumed.then(() => context && context.state === "running");
    }
    function load(slug) {
      if (buffers.has(slug)) return buffers.get(slug);
      const pending = index().then((r) => {
        const row = r.get(slug);
        if (!row) throw new Error("not in the pack");
        return get(urlFor(row));
      }).then((response) => {if (!response.ok) throw new Error(String(response.status)); return response.arrayBuffer();})
        .then((bytes) => context.decodeAudioData(bytes))
        .catch((error) => {warnOnce(slug, `crankmagic-audio: ${slug} is not playable (${error.message}); the game goes on without it.`); return null;});
      buffers.set(slug, pending);
      return pending;
    }
    /** One clip, once; whether it was allowed to sound, not whether it has been heard yet. */
    function play(slug, when = Date.now()) {
      if (!context || prefs.muted || !mayPlay(slug, lastPlayed, when)) return false;
      load(slug).then((buffer) => {
        if (!buffer || !context) return;
        const source = context.createBufferSource();
        source.buffer = buffer; source.connect(sfxBus); source.start();
      });
      return true;
    }
    const ramp = (param, value, fadeMs) => {
      try {param.cancelScheduledValues(context.currentTime); param.setValueAtTime(param.value, context.currentTime); param.linearRampToValueAtTime(value, context.currentTime + fadeMs / 1000);}
      catch (e) {param.value = value;}
    };
    const retire = (bed, fadeMs) => {ramp(bed.gain.gain, 0, fadeMs); setTimeout(() => {try {bed.source.stop();} catch (e) { /* already done */ }}, fadeMs);};
    /* R11 and the pack's rule 5: one bed at a time, crossfaded; asking for the bed already playing does nothing. */
    function startBgm(slug, fadeMs = FADE_MS) {
      if (!context || currentBed === slug || prefs.muted) return false;
      const previous = playing;
      currentBed = slug;
      load(slug).then((buffer) => {
        if (currentBed !== slug || !buffer || !context) {if (currentBed === slug) currentBed = null; return;}
        const gain = context.createGain(), source = context.createBufferSource();
        gain.gain.value = 0; gain.connect(bgmBus);
        source.buffer = buffer; source.loop = true; source.connect(gain); source.start();
        ramp(gain.gain, 1, fadeMs);
        playing = {source, gain, slug};
        if (previous) retire(previous, fadeMs);
      });
      return true;
    }
    function stopBgm(fadeMs = FADE_MS) {currentBed = null; if (!playing) return false; retire(playing, fadeMs); playing = null; return true;}
    function setBusVolume(bus, value) {
      if (bus !== "sfx" && bus !== "bgm") return null;
      prefs[bus] = clamp01(value); writePref(storage, bus, prefs[bus]); applyVolumes();
      return prefs[bus];
    }
    function setMuted(muted) {prefs.muted = !!muted; writePref(storage, "muted", prefs.muted); applyVolumes(); if (prefs.muted) stopBgm(200); return prefs.muted;}
    return {arm, play, startBgm, stopBgm, setBusVolume, setMuted, isArmed: () => !!context && context.state === "running", bed: () => currentBed, volumes: () => ({...prefs})};
  }

  /* ---- MOMENTS: what changed between two views of the table, as the clips it makes ---- */
  const COMBAT_DAMAGE = new Set(["COMBAT_FIRST_STRIKE_DAMAGE", "COMBAT_DAMAGE"]);
  const WIPE_FLOOR = 3;   /* R9: "most" of the board at once, and at least three, or a trade would sound like a Wrath */
  const field = (state) => {
    const out = new Map();
    for (const p of state.players || []) for (const c of ((p.zones || {}).Battlefield || {}).cards || []) out.set(c.cardId, {...c, seat: p.playerId});
    return out;
  };
  const zone = (state, seat, name) => (((state.players[seat] || {}).zones || {})[name]) || {cards: [], count: 0};

  /**
   * The clips for a change of view. `typeLineOf(card)` gives a card's type line (the shipped records know most; a
   * card they do not know is voiced by its types). The first view of a game is history, and makes no sound.
   */
  function momentsFor(before, after, {seat, typeLineOf = (c) => (c.types || []).join(" "), over = null} = {}) {
    if (!before || !after) return [];
    const out = [];
    const b = before.state, a = after.state;
    /* the game's end: the seat's own victory or defeat */
    if (over && before.status !== "finished") return [over === "won" ? "sfx_event_victory" : "sfx_event_defeat"];
    /* your turn */
    if (a.turnPlayerId === seat && b.turnPlayerId !== seat && a.turnPlayerId !== null && a.turnPlayerId !== undefined) out.push("sfx_event_your_turn");
    /* your draw: your hand grows as your library shrinks (another seat's draw is a count, and is not voiced) */
    const libDrop = zone(b, seat, "Library").count - zone(a, seat, "Library").count, handRise = zone(a, seat, "Hand").count - zone(b, seat, "Hand").count;
    if (libDrop > 0 && handRise > 0) out.push("sfx_event_draw");
    /* a spell cast: a new entry on the stack, voiced by its card's type line; a card the shipped records do not know
       has no types on the stack, and is voiced instead when it arrives as a permanent */
    const known = new Set((b.stack || []).map((s) => s.stackId)), cast = new Set();
    const byName = (name) => resolveCardSounds(typeLineOf({name, types: []}));
    for (const s of a.stack || []) {
      if (known.has(s.stackId) || !s.name) continue;
      cast.add(s.name);
      out.push(...byName(s.name));
    }
    const leftStack = new Set((b.stack || []).filter((s) => !(a.stack || []).some((x) => x.stackId === s.stackId)).map((s) => s.name));
    /* arrivals: a land played is voiced as the card; a permanent that was a spell was voiced on the stack; anything
       else arriving is an entering (R8), tokens once a batch (R10) */
    const bf = field(b), af = field(a);
    let tokens = false;
    for (const [id, c] of af) {
      if (bf.has(id)) continue;
      if ((c.types || []).includes("Land") && !leftStack.has(c.name)) {out.push(...resolveCardSounds(typeLineOf(c)).slice(0, 1)); continue;}
      if (leftStack.has(c.name) || cast.has(c.name)) {if (!byName(c.name).length) out.push(...resolveCardSounds(typeLineOf(c))); continue;}
      if (c.token) {if (!tokens) {tokens = true; out.push("sfx_event_create_tokens");} continue;}
      out.push("sfx_event_etb");
    }
    /* departures: a wipe once (R9); else where each went */
    const gone = [...bf.entries()].filter(([id]) => !af.has(id)).map(([, c]) => c);
    if (gone.length && gone.length >= WIPE_FLOOR && gone.length > af.size) out.push("sfx_event_board_wipe");
    else for (const c of gone) {
      const exiled = (a.players || []).some((p) => zone(a, p.playerId, "Exile").cards.some((x) => x.name === c.name) && !zone(b, p.playerId, "Exile").cards.some((x) => x.name === c.name));
      out.push(exiled ? "sfx_event_exile" : (c.types || []).includes("Creature") ? "sfx_event_dies" : "sfx_event_destroy");
    }
    /* life and poison: a gain; a loss in the damage step is combat damage (commander damage its own), else a loss */
    for (const p of a.players || []) {
      const old = (b.players || []).find((x) => x.playerId === p.playerId);
      if (!old) continue;
      const delta = p.health.life - old.health.life;
      if (delta > 0) out.push("sfx_event_life_gain");
      else if (delta < 0) {
        const cmd = (h) => Object.values(h.commanderDamage || {}).reduce((n, v) => n + v, 0);
        out.push(cmd(p.health) > cmd(old.health) ? "sfx_event_commander_damage" : COMBAT_DAMAGE.has(a.phase) ? "sfx_event_combat_damage" : "sfx_event_life_loss");
      }
      if ((p.health.poison || 0) > (old.health.poison || 0)) out.push("sfx_event_poison");
    }
    /* attackers and blockers declared */
    const attacks = (s) => (s.combat && s.combat.attacks) || [];
    if (attacks(a).length && !attacks(b).length) out.push("sfx_event_attack");
    const blocked = (s) => attacks(s).filter((x) => (x.blockers || []).length).length;
    if (blocked(a) > blocked(b)) out.push("sfx_event_block");
    return out;
  }

  /* R11: the bed for a view: the victory linger once it is over, combat's through the combat steps, tension when the
     seat is two-thirds of the way to a lethal clock (7 of 10 poison, 14 of 21 from one commander), else the game's. */
  function bedFor(view, seat) {
    if (!view) return null;
    if (view.status === "finished") return "bgm_victory_linger";
    const s = view.state, me = (s.players || []).find((p) => p.playerId === seat), h = me ? me.health : null;
    if (/^COMBAT_/.test(String(s.phase || ""))) return "bgm_combat_battle_shimmer";
    if (h && ((h.poison || 0) >= 7 || Object.values(h.commanderDamage || {}).some((v) => v >= 14))) return "bgm_tension_darkening_myth";
    return "bgm_game_aether_voyage";
  }

  root.CrankAudio = {createPlayer, resolveCardSounds, parseTypeLine, mayPlay, momentsFor, bedFor, THROTTLE_MS, DEFAULTS};
})(typeof globalThis !== "undefined" ? globalThis : this);
