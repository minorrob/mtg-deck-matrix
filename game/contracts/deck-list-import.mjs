/* A PASTED DECK, IN WHATEVER SHAPE IT ARRIVED IN.
 *
 * The lobby accepted exactly one format: two comma-separated columns, header row optional, with
 * the commander after a blank line at the END. The invitation email asked guests for something
 * else entirely -- "[Count] [Card Name]", space separated, commander FIRST:
 *
 *     1 Chulane, Teller of Tales
 *
 *     1 Soul Stone
 *     13 Plains
 *
 * Three mismatches at once. Space separation went to the comma splitter, which read that first
 * line as the two cells "1 Chulane" and "Teller of Tales" and rejected it. Commander-first went to
 * a parser that only looked last. And "export it to excel", which the same email suggests, pastes
 * as tabs. Every instruction in that email produced a parse failure, so the paste path could not
 * work for anybody who followed it.
 *
 * So: read the line, do not dictate it. Quantity with or without an x, comma or tab or space
 * separated, quoted cells, set codes and collector numbers and foil markers trailing, section
 * headers, bare names meaning one copy. The commander is whichever side of the blank line is
 * small, or whatever a Commander header names, so first and last both work.
 *
 * WHAT IS NOT GUESSED AT. If a list has no commander header and no blank line, this does not pick
 * a commander for you -- with a hundred cards and no marker there is nothing to go on but a guess,
 * and guessing the commander is how somebody ends up playing the wrong deck.
 */

/** One comma-separated line, honouring quotes. Returns cells, or null when it is not CSV-shaped. */
function csvCells(line) {
  const cells = [];
  let value = '', quoted = false, sawQuote = false, sawComma = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { sawQuote = true; if (quoted && line[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { sawComma = true; cells.push(value.trim()); value = ''; }
    else value += c;
  }
  if (quoted) throw Error('Unclosed quote');
  cells.push(value.trim());
  return sawComma || sawQuote ? cells : null;
}

const isCount = (v) => /^\d+$/.test(v) && Number(v) > 0;
const HEADER = /^(?:\/\/\s*)?(commanders?|deck|decklist|mainboard|main|creatures?|lands?|spells?|sideboard|maybeboard|considering|about|companion)\s*:?\s*(?:\(\d+\))?$/i;
const HEADER_CELL = /^(?:card )?name$|^(?:count|quantity|qty)$/i;

/** Set codes, collector numbers and foil markers that trail a name in most exports. */
function stripPrinting(name) {
  return name
    .replace(/\s*\*[^*]*\*\s*$/, '')            // *F*, *E*
    .replace(/\s*\[[^\]]*\]\s*$/, '')           // [M10]
    .replace(/\s*\((?:[A-Za-z0-9]{2,6})\)(?:\s+[A-Za-z0-9-]+)?\s*$/, '')  // (M10) 123
    .trim();
}

/** One line to {quantity, name}, or null when the line carries no card. */
function readLine(line) {
  const text = line.trim();
  if (!text || text.startsWith('#') || HEADER.test(text)) return null;

  // "1 Sol Ring", "1x Sol Ring", "4 Forest" -- checked first, so a comma inside the NAME survives.
  const spaced = text.match(/^(\d+)\s*[xX]?\s+(.+)$/);
  if (spaced) return {quantity: Number(spaced[1]), name: stripPrinting(spaced[2])};

  const tab = text.includes('\t') ? text.split('\t').map((c) => c.trim()) : null;
  const cells = tab && tab.length === 2 ? tab : csvCells(text);
  if (cells && cells.length === 2) {
    const countFirst = isCount(cells[0]);
    if (countFirst || isCount(cells[1])) {
      const quantity = Number(countFirst ? cells[0] : cells[1]);
      const name = stripPrinting(countFirst ? cells[1] : cells[0]);
      return name ? {quantity, name} : null;
    }
  }
  // A bare name is one copy. "Sol Ring" and "Temple, Garden" both land here.
  const name = stripPrinting(cells && cells.length === 2 ? cells.join(', ') : text);
  return name ? {quantity: 1, name} : null;
}

/**
 * Parse a pasted Commander list.
 * Throws with `lineErrors` attached when individual lines cannot be read, so a page can point at
 * the line rather than making somebody re-read a hundred of them.
 */
export function parseDeckList(text, {name = 'Uploaded Commander deck'} = {}) {
  if (typeof text !== 'string' || !text.trim() || text.length > 1_000_000) throw Error('Deck list is empty or too large');
  const lines = text.replace(/^﻿/, '').replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');

  const groups = [[]];              // blank lines separate groups
  const declared = [];              // cards under an explicit Commander header
  const lineErrors = [];
  let inCommanderHeader = false, ignoring = false, sawHeaderRow = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i], text0 = raw.trim();
    if (!text0) { if (groups.at(-1).length) groups.push([]); inCommanderHeader = false; ignoring = false; continue; }

    const header = text0.match(HEADER);
    if (header) {
      const kind = header[1].toLowerCase();
      inCommanderHeader = kind.startsWith('commander');
      ignoring = ['sideboard', 'maybeboard', 'considering', 'about', 'companion'].includes(kind);
      continue;
    }
    if (ignoring) continue;

    // A spreadsheet header row ("Card Name,Count") is a header, not a card called "Card Name".
    if (!sawHeaderRow) {
      let cells = null;
      try { cells = text0.includes('\t') ? text0.split('\t').map((c) => c.trim()) : csvCells(text0); } catch { cells = null; }
      if (cells && cells.length === 2 && cells.every((c) => HEADER_CELL.test(c))) { sawHeaderRow = true; continue; }
    }

    let card;
    try { card = readLine(raw); }
    catch (error) { lineErrors.push({line: i + 1, text: text0.slice(0, 120), reason: error.message}); continue; }
    if (!card) continue;
    if (card.name.length > 200) { lineErrors.push({line: i + 1, text: text0.slice(0, 120), reason: 'Card name is too long'}); continue; }
    if (card.quantity > 100) { lineErrors.push({line: i + 1, text: text0.slice(0, 120), reason: 'Quantity is above 100'}); continue; }
    (inCommanderHeader ? declared : groups.at(-1)).push(card);
  }

  if (lineErrors.length) {
    throw Object.assign(
      Error(`${lineErrors.length} line${lineErrors.length === 1 ? '' : 's'} could not be read: ${lineErrors.slice(0, 3).map((e) => `line ${e.line} (${e.reason})`).join(', ')}`),
      {lineErrors});
  }

  const filled = groups.filter((g) => g.length);
  let commanders = declared, main;
  if (commanders.length) {
    main = filled.flat();
  } else if (filled.length >= 2) {
    // The commander side is the small one, whichever end of the list it was pasted at.
    const small = filled.findIndex((g) => g.reduce((n, c) => n + c.quantity, 0) <= 2);
    if (small < 0) throw Error('Put one blank line between your commander and your other 99 cards, or head the commander with a "Commander" line');
    commanders = filled[small];
    main = filled.filter((_, index) => index !== small).flat();
  } else {
    throw Error('Put one blank line between your commander and your other 99 cards, or head the commander with a "Commander" line');
  }

  if (!commanders.length) throw Error('No commander found in this list');
  if (commanders.length > 2 || commanders.some((c) => c.quantity !== 1)) throw Error('Commander must be one card, or two single-card partner commanders');
  const commanderNames = commanders.map((c) => c.name);
  if (new Set(commanderNames).size !== commanderNames.length || main.some((c) => commanderNames.includes(c.name))) throw Error('Commander appears twice in the deck');

  const total = main.reduce((n, c) => n + c.quantity, 0) + commanders.length;
  if (total !== 100) throw Error(`Commander deck must contain exactly 100 cards including commander(s); this list has ${total}`);

  return {schema: 'CrankMagicDeckHandoff@1', name: String(name).trim().slice(0, 180) || 'Uploaded Commander deck',
    commanders: commanderNames, rows: main};
}
