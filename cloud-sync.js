/* WHAT A DEVICE SHOULD DO NEXT, and nothing else: the decision at the heart of the cloud library, kept pure
 * so a suite can hold every case (tests/cloud-sync.mjs) -- the one place a mistake could lose a library.
 *
 * A device remembers, per signed-in person, the cloud version its library last matched (`headId`) and its
 * own revision at that moment (`syncedRevision`). Against the cloud's head, that is enough to know which of
 * the two moved:
 *
 *   neither moved                -> nothing
 *   only this device moved       -> save, from the head it last matched
 *   only the cloud moved         -> bring the cloud's version in
 *   both moved                   -> ask the person which to keep (Rob, 2026-09-24) -- never decided here
 *
 * and the first time a device meets an account: an empty library takes the cloud's; a library with
 * something in it, against a cloud that has something too, is asked about rather than overwritten either way.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CrankCloudSync = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /** A library with no decks and no card records has nothing a person could lose. */
  const isEmpty = (state) => !(state && ((state.decks || []).length || (state.lots || []).length));

  /**
   * @param {{head: object|null, sync: {email,headId,syncedRevision}|null, email: string, state: object}} input
   * @returns {{action: "none"|"save"|"pull"|"ask", parent?: string|null, why: string}}
   */
  function decide({head, sync, email, state}) {
    const mine = sync && sync.email === email ? sync : null;
    const revision = state ? state.revision : 0;
    if (!head) {
      if (isEmpty(state)) return {action: "none", why: "nothing saved in the cloud, and nothing here to save yet"};
      return {action: "save", parent: null, why: "the first save of this library to the cloud"};
    }
    if (!mine) {
      if (isEmpty(state)) return {action: "pull", why: "a new device for this account: it takes the cloud's library"};
      return {action: "ask", why: "this device has a library and so does the cloud, and they have never been matched"};
    }
    const here = revision !== mine.syncedRevision, there = head.id !== mine.headId;
    if (!here && !there) return {action: "none", why: "this device and the cloud already match"};
    if (here && !there) return {action: "save", parent: head.id, why: "changes made on this device"};
    if (!here && there) return {action: "pull", why: "changes saved from another device"};
    return {action: "ask", why: "changes on this device and on another since they last matched"};
  }

  /** "Chrome on Windows" -- how a device names itself to the others. No identifiers, nothing fingerprintable. */
  function deviceLabel(userAgent) {
    const ua = String(userAgent || "");
    const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "A browser";
    const system = /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
    return system ? `${browser} on ${system}` : browser;
  }

  /** "2 minutes ago", for a saved-at time. */
  function ago(iso, now = Date.now()) {
    const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
    if (!Number.isFinite(seconds)) return "at an unknown time";
    if (seconds < 45) return "just now";
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 36) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }

  /* Bytes <-> base64, and gzip through the browser's own streams (CompressionStream), so the library
     travels compressed and the Worker never has to touch its bytes. */
  function toBase64(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }
  function fromBase64(text) {
    const binary = atob(text), out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  }
  async function gzip(text) {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function gunzip(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).text();
  }

  return {decide, isEmpty, deviceLabel, ago, toBase64, fromBase64, gzip, gunzip};
});
