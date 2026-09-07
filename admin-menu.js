/**
 * The Admin menu, shared by My Decks and the Deck Matrix.
 *
 * Export, Import, Load Active, Undo load and Reset All were five buttons in the banner:
 * five things nobody presses in a normal session, taking the space of the two they press
 * every time. They fold behind one button here, which is also where the two that did not
 * exist yet now live -- Load default and Clear session.
 *
 * The items are rebuilt every time the menu OPENS rather than once at mount, because
 * three of them describe state that moves: whether there is an undo to offer, when you
 * last exported, and how much this browser is holding. A menu that answered those once at
 * page load would be wrong by the second time you opened it.
 *
 * No page knowledge here. Each page hands over its own list; this owns the button, the
 * popup, the outside-click, Escape, and the shape of a row.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MtgAdminMenu = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"]/g, function (c) {
      return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c];
    });
  }

  /**
   * items() returns an array of:
   *   {kind: "note", text, stale}                        a line of status, not a control
   *   {kind: "sep"}                                      a rule
   *   {kind: "item", label, hint, run, warn}             a button
   *   {kind: "file", label, hint, accept, onFile}        a button that opens a file picker
   * Anything falsy in the array is dropped, so a caller can write `cond && {...}`.
   */
  function mount(options) {
    var button = document.getElementById(options.button || "admin-button");
    var pop = document.getElementById(options.menu || "admin-menu");
    if (!button || !pop) return null;
    var handlers = [];

    function close() {
      pop.hidden = true;
      button.setAttribute("aria-expanded", "false");
    }

    function open() {
      var items = (options.items() || []).filter(Boolean);
      handlers = [];
      pop.innerHTML = items.map(function (item, i) {
        if (item.kind === "sep") return '<div class="admin-sep"></div>';
        if (item.kind === "note") {
          return '<p class="admin-note' + (item.stale ? " is-stale" : "") + '">' + esc(item.text) + "</p>";
        }
        handlers[i] = item;
        var body = "<b>" + esc(item.label) + "</b>" + (item.hint ? "<span>" + esc(item.hint) + "</span>" : "");
        if (item.kind === "file") {
          /* A label wrapping a hidden input, not a button that clicks one: a real file
             control is the only thing a browser will open a picker for, and wrapping it
             keeps the row a single target with the same shape as its neighbours. */
          return '<label class="admin-item is-file" data-admin-i="' + i + '">' + body +
            '<input type="file" accept="' + esc(item.accept || "") + '"></label>';
        }
        return '<button type="button" role="menuitem" class="admin-item' +
          (item.warn ? " is-warn" : "") + '" data-admin-i="' + i + '">' + body + "</button>";
      }).join("");
      pop.hidden = false;
      button.setAttribute("aria-expanded", "true");
      var first = pop.querySelector(".admin-item");
      if (first && first.focus) first.focus();
    }

    button.addEventListener("click", function () {
      if (pop.hidden) open(); else close();
    });
    pop.addEventListener("click", function (event) {
      var row = event.target.closest("[data-admin-i]");
      if (!row) return;
      var item = handlers[Number(row.dataset.adminI)];
      if (!item || item.kind === "file") return;      // the file input answers for itself
      close();
      item.run();
    });
    pop.addEventListener("change", function (event) {
      var row = event.target.closest("[data-admin-i]");
      if (!row || event.target.type !== "file") return;
      var item = handlers[Number(row.dataset.adminI)];
      var file = event.target.files && event.target.files[0];
      event.target.value = "";
      close();
      if (item && file) item.onFile(file);
    });
    document.addEventListener("click", function (event) {
      if (!pop.hidden && !event.target.closest(".admin")) close();
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !pop.hidden) { close(); button.focus(); }
    });
    return {open: open, close: close};
  }

  /* HOW LONG AGO, in the words somebody would use out loud. Shared because both pages show
     it and a backup that reads "3 hr ago" on one page and "180 min ago" on the other
     invites the question of whether they mean the same thing. */
  function ago(then) {
    if (!then) return null;
    var minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
    if (minutes < 1) return "just now";
    if (minutes < 60) return minutes + " min ago";
    var hours = Math.round(minutes / 60);
    if (hours < 24) return hours + " hr ago";
    return Math.round(hours / 24) + " d ago";
  }

  /**
   * CLEAR SESSION, offered the same way on both pages.
   *
   * It destroys everything this browser knows about you, so it asks twice and offers the
   * way out in between: the first prompt is "shall I download a backup first", and taking
   * it is one click rather than a trip to another menu. Somebody who says no is told,
   * plainly and by count, what is about to go.
   *
   * `onExport` is the page's own export, so the backup file is the same file the Export
   * item writes -- there is no second, lesser format for the "before you clear" copy.
   */
  function clearSession(options) {
    /* `root` is the UMD wrapper's argument and is not in scope inside the factory, so
       reaching for it here threw "root is not defined" and Clear session did nothing on
       either page. The global is looked up the way every other browser-side call in this
       file does it. */
    var User = (typeof window !== "undefined" && window.MtgUserState)
      || (typeof globalThis !== "undefined" && globalThis.MtgUserState);
    if (!User) {
      if (options.say) options.say("The list of saved keys did not load, so nothing was cleared.");
      return;
    }
    var held = User.present(window.localStorage);
    if (!held.length) {
      if (options.say) options.say("Nothing is saved in this browser — it is already a clean slate.");
      return;
    }
    var lines = held.slice(0, 6).map(function (k) { return "• " + k.what; }).join("\n");
    var more = held.length > 6 ? "\n• and " + (held.length - 6) + " more" : "";
    if (options.onExport && window.confirm(
      "Download a backup first?\n\nClearing removes everything below and cannot be undone:\n" +
      lines + more + "\n\nOK downloads a backup file, then asks again before clearing.\n" +
      "Cancel skips the backup.")) {
      options.onExport();
    }
    if (!window.confirm("Clear this session now?\n\n" + held.length +
      " saved thing" + (held.length === 1 ? "" : "s") +
      " will be removed and this browser will look like one that has never opened the app.")) {
      if (options.say) options.say("Nothing was cleared.");
      return;
    }
    var gone = User.clearAll(window.localStorage, window.sessionStorage);
    if (options.onCleared) options.onCleared(gone);
  }

  return {mount: mount, ago: ago, clearSession: clearSession};
});
