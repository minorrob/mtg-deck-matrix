import {parseDeckList} from './deck-list-import.mjs';

/* Kept as the name the lobby and the guest gateway already call. The two-column Moxfield export is
 * one of the shapes parseDeckList reads; it stopped being the only one when it turned out the
 * invitation email had been asking guests for a different one all along. */
export function parseMoxfieldTwoColumn(text, options) {
  return parseDeckList(text, options);
}
export {parseDeckList};
