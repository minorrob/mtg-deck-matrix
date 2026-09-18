/* WHAT FORGE CALLS A CARD, READ FROM FORGE.
 *
 * The check this replaces guessed a filename. It lowercased the Scryfall name, deleted every
 * character outside [a-z0-9 ], turned runs of spaces into underscores, and looked for that file
 * under cardsfolder/<first letter>/. On a deck of Sol Rings it worked. On anything else:
 *
 *   Malakir Rebirth // Malakir Mire  ->  malakir_rebirth_malakir_mire.txt   (Forge: malakir_rebirth)
 *   Lim-Dul's Vault                  ->  lim_dls_vault.txt                  (Forge: lim_duls_vault)
 *   AEtherize                        ->  therize.txt                        (Forge: aetherize)
 *   Jotun Grunt                      ->  jtun_grunt.txt                     (Forge: jotun_grunt)
 *
 * Two bugs in one expression. Diacritics were DELETED rather than folded to their base letter,
 * so every accented card missed. Both faces of a double-faced card were concatenated, where
 * Forge names the file after the front face alone.
 *
 * The third bug was the one that mattered: nothing read the answer. The miss came back as
 * status:'script-location-unresolved', the only consumer looked at a different field, and a deck
 * Forge could not load sailed through preparation, through Ready Up, through the countdown, and
 * failed at engine load with four people waiting on it.
 *
 * So this does not guess. It reads every card script Forge ships, takes the Name: lines out of
 * each one, and indexes what it finds. A card either has a script or it does not, and saying
 * which is not a matter of string luck.
 *
 * ON FACES. A Forge script holds one card, but a split or modal card carries a second Name: after
 * its ALTERNATE line. Both faces are indexed under their own names, and the pair is also indexed
 * joined with " // " so a Scryfall name arrives whole and resolves on the first try.
 *
 * ON NORMALIZATION. The normalized key exists for the gap between how a name is written and how
 * it is spelled: NFD decomposition drops combining marks so u-circumflex folds to u, AE folds to
 * ae, and punctuation and case stop counting. It is the last rung of the ladder, never the first;
 * an exact match always wins so two genuinely different cards cannot collapse into one.
 */
import {readdirSync, readFileSync, existsSync, statSync} from 'node:fs';
import {resolve, join} from 'node:path';

const FOLDER = 'forge-gui/res/cardsfolder';

/** Fold a printed name to its comparison key: no marks, no case, no punctuation, single spaces. */
export function normalizeCardName(name) {
  return String(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // combining marks, so "Lim-Dûl" -> "Lim-Dul"
    .toLowerCase()
    // Ligatures and the Norse letters carry no combining mark, so NFD leaves them whole.
    .replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/ð/g, 'd').replace(/þ/g, 'th').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9 /]+/g, ' ')        // punctuation is not identity; "//" is kept as a separator
    .replace(/\s+/g, ' ')
    .trim();
}

function scriptFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, {withFileTypes: true})) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.txt')) out.push(path);
    }
  };
  walk(root);
  return out;
}

/** Every Name: in one script. More than one means a split or modal card; order is face order. */
export function scriptNames(text) {
  return [...text.matchAll(/^Name:(.+)$/gm)].map((m) => m[1].trim()).filter(Boolean);
}

/**
 * Read Forge's card scripts into a lookup.
 * Throws when the scripts cannot be read -- an unreadable database must be loud, because the
 * failure it replaces was a silent one that reported every card as fine.
 */
export function buildForgeCardIndex(forgeRoot) {
  const folder = resolve(forgeRoot, FOLDER);
  if (!existsSync(folder)) {
    const archive = folder + '.zip';
    if (existsSync(archive)) {
      throw new Error(`Forge ships its card scripts as ${archive}. Extract it to ${folder} so CrankMagic can read which cards this engine knows.`);
    }
    throw new Error(`No Forge card scripts at ${folder}. Check the Forge checkout beside this repository.`);
  }
  if (!statSync(folder).isDirectory()) throw new Error(`${folder} is not a directory`);

  const exact = new Map(), normal = new Map();
  const put = (map, key, value) => { if (key && !map.has(key)) map.set(key, value); };
  let scripts = 0;

  for (const path of scriptFiles(folder)) {
    const names = scriptNames(readFileSync(path, 'utf8'));
    if (!names.length) continue;
    scripts++;
    const script = path.slice(path.indexOf(FOLDER));
    const faces = [...names, ...(names.length > 1 ? [names.join(' // ')] : [])];
    for (const face of faces) {
      put(exact, face, script);
      put(normal, normalizeCardName(face), script);
    }
  }
  if (!scripts) throw new Error(`No card scripts found under ${folder}`);

  /** Resolve a printed card name. Returns how it matched, or null when Forge has no such card. */
  function resolveCard(name) {
    const raw = String(name || '').trim();
    if (!raw) return null;
    const front = raw.split(' // ')[0].trim();
    const ladder = [
      ['exact', () => exact.get(raw)],
      ['front-face', () => exact.get(front)],
      ['normalized', () => normal.get(normalizeCardName(raw))],
      ['normalized-front-face', () => normal.get(normalizeCardName(front))],
    ];
    for (const [matchedBy, look] of ladder) {
      const script = look();
      if (script) return {name: raw, script, matchedBy};
    }
    return null;
  }

  /** Names worth offering when a card does not resolve. Cheap on purpose: shared leading word. */
  function suggest(name, limit = 5) {
    const key = normalizeCardName(name), head = key.split(' ')[0];
    if (!head) return [];
    const hits = [];
    for (const candidate of normal.keys()) {
      if (candidate !== key && candidate.startsWith(head)) hits.push(candidate);
      if (hits.length >= limit * 4) break;
    }
    return hits.sort((a, b) => a.length - b.length).slice(0, limit);
  }

  return {schema: 'ForgeCardIndex@1', forgeRoot, scripts, names: exact.size, resolve: resolveCard, suggest};
}

const cache = new Map();
/**
 * The index for a Forge checkout, built once per process.
 * Never throws: a missing engine is a reportable state, not a crash, because the deck catalog is
 * assembled at import time and a machine without Forge must still be able to browse its decks.
 */
export function loadForgeCardIndex(forgeRoot) {
  const key = resolve(forgeRoot);
  if (!cache.has(key)) {
    try { cache.set(key, {available: true, index: buildForgeCardIndex(key), reason: null}); }
    catch (error) { cache.set(key, {available: false, index: null, reason: error.message}); }
  }
  return cache.get(key);
}

export function resetForgeCardIndexCache() { cache.clear(); }
