/* THE LANDING PAGE (R3.8; docs/design/2026-09-25-redesign-r3, "Landing Page.dc.html").
 *
 * WHO SEES IT (Rob, 2026-09-29: "when I go to crankmagic.com that should go to the landing page", and the CrankMagic
 * name and logo "should take me back to the landing page"): everyone, at `/` with no route and at #welcome, which the
 * rail's name and logo link to. It was a signed-out first visit's only (M1·3). For someone with a library, or signed
 * in, its header says Open your decks instead of Start without an account.
 *
 * WHAT IT PROMISES (M1·2): accounts are invite-only, so the page says Sign in and "Start without an account",
 * never "Start free" or "Free account". Step one takes a commander's name or a pasted list, or a CSV (M1·4);
 * an Archidekt link comes through the app's own importer (R3.10a), and a precon is one of Wizards' (R3.10b). Play is Coming soon, with no
 * mailing list (M1·5).
 *
 * WHAT IT LOADS: its hero art (Rob's, 2026-09-30: three leather card backs in a ring of light, lifted off the checkerboard
 * its generator painted in; design/art-source/landing/) and the small commander images already in assets/; the graph
 * (16 MB) is only ever fetched by Explore.
 */
(globalThis.CrankFeatures ||= []).push(function (C) {
  const {views, actions, esc: e} = C;
  const accounts = () => document.querySelector('meta[name="crankmagic-accounts"]')?.content === "on";
  const ART = "assets/crankmagic/";

  /* The four doors: [page, route, who it is for, what it does, the button, the mana color it wears, a badge]. */
  const DOORS = [
    ["Decks", "#decks", "I have a commander in mind", "Build the hundred, check bracket and budget, and see exactly what is still missing from the box.", "Start a deck", "R", ""],
    ["Library", "#cards", "I have a pile of cards", "Import what you own once. Every deck pulls from it first, so the buy list is only what you truly lack.", "Import my cards", "G", ""],
    ["Explore", "#discover", "I want ideas", "Every card is joined to the cards it works with. Follow a commander, or fill the gap a deck runs light on.", "Explore a commander", "U", ""],
    ["Play", "#game", "I want to play it", "A four-seat table with friends or AI pilots. Your deck, your mat, your life totals in the middle.", "See the table", "W", "Coming soon"],
  ];
  const STEPS = [
    ["1", "Plan", "Pick a commander, fill the hundred, set a bracket and a budget cap. The deck page tells you the next move.", "plan"],
    ["2", "Collect", "Real copies, substitutes, orders and a priced buy list, all on one bar per deck. Buy only what you lack.", "collect"],
    ["3", "Play", "Sit four at the table with friends or AI pilots, choose your mat, and log how it went.", "play"],
  ];
  const promises = () => [
    ["Yours, on any device", accounts()
      ? "Your library lives in this browser. Sign in and it saves itself to the cloud and follows you to any device."
      : "Your library lives in this browser, and a backup file carries it anywhere you like."],
    ["Real prices, dated", "Scryfall price snapshots with the date shown. Set a cap per deck and see what goes over."],
    ["Built for Commander", "Color identity, singleton, brackets and Game Changers checked as you build."],
  ];

  /* A readiness bar in the app's own colors: in the box, ordered, to buy. Decoration: it names no one's cards. */
  const bar = (box, ordered, buy) => `<span class="cm-landing-bar" aria-hidden="true"><i style="flex:${box}"></i><i style="flex:${ordered}"></i><i style="flex:${buy}"></i></span>`;
  const visual = {
    plan: `<div class="cm-landing-vis cm-landing-vis-plan"><img src="${ART}commander-krenko.webp?v=1" alt=""><div><strong>Krenko Goblins</strong><span>Goblin tribal · Tokens · Bracket 3</span></div><div class="cm-landing-fig"><span>Cap $225</span><strong>$156</strong><span>69% of cap</span></div></div>`,
    collect: `<div class="cm-landing-vis cm-landing-vis-collect">${[["Krenko Goblins", 85, 2, 13], ["Chulane Value Loop", 78, 0, 22], ["Atraxa Proliferate", 87, 0, 13]].map(([name, a, b, c]) => `<div><span>${e(name)}</span>${bar(a, b, c)}</div>`).join("")}</div>`,
    play: `<div class="cm-landing-vis cm-landing-vis-play">${["Chulane", "Atraxa", "Shadrix", "You · Krenko"].map((n) => `<span>${e(n)}</span>`).join("")}<img src="${ART}crankmagic-logo-wand-v3-256.webp" alt=""></div>`,
  };

  views.welcome = () => {
    const signedIn = !!(C.signedIn && C.signedIn()), s = C.state || {};
    const known = signedIn || !!((s.decks || []).length || (s.lots || []).length);
    /* THE ACCOUNT CHIP (Rob, 2026-09-30): the app's own menu, left of the way in. Signed in it shows who; signed out,
       where accounts are on, it says Sign in; either way it opens the menu the rail's chip opens -- Account at its
       head (Sign in, or Sync now), then Settings and the rest -- not a second one. */
    const email = signedIn && C.signedInAs ? C.signedInAs() : "";
    const chipLabel = email || (accounts() ? "Sign in" : "Menu");
    const avatar = email ? e(email.charAt(0).toUpperCase()) : `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="5.5" r="2.75" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2.75 13.5c.6-2.6 2.7-4 5.25-4s4.65 1.4 5.25 4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;
    const signIn = `<button type="button" class="cm-landing-chip${email ? " is-signed-in" : ""}" popovertarget="cm-user-menu" aria-haspopup="menu" aria-label="${e(email ? `Account: ${email}` : accounts() ? "Sign in, settings and backup" : "Menu, settings and backup")}"><span class="cm-chip-avatar" aria-hidden="true">${avatar}</span><span class="cm-landing-chip-name">${e(chipLabel)}</span><svg class="cm-caret cm-btn-chevron" viewBox="0 0 10 10" aria-hidden="true" focusable="false"><path d="M2 3.5 5 6.5 8 3.5"/></svg></button>`;
    const go = known ? `<a class="v-button primary" href="#decks">Open your decks</a>` : `<button type="button" class="v-button primary" data-action="landing-start">Start without an account</button>`;
    const playSoon = document.querySelector('meta[name="crankmagic-play"]')?.content !== "cloud";
    C.main.innerHTML = `<div class="cm-landing">
<header class="cm-landing-head">
  <span class="cm-landing-brand"><img src="assets/crankmagic/crankmagic-logo-wand-v3-256.webp" alt="" width="36" height="36"><span>CrankMagic</span></span>
  <nav class="cm-landing-nav" aria-label="Main pages"><a href="#decks">Decks</a><a href="#cards">Library</a><a href="#discover">Explore</a><a href="#game">Play${playSoon ? ` <span class="cm-landing-soon">Soon</span>` : ""}</a></nav>
  <div class="cm-landing-account">${signIn}${go}</div>
</header>
<section class="cm-landing-hero">
  <div class="cm-landing-copy">
    <span class="cm-landing-eyebrow">Your Commander workshop</span>
    <h1>Build the deck. Own the cards. Bring it to the table.</h1>
    <p class="cm-landing-lede">Plan a hundred, track what’s really in the box, find the cards that fit, and play it. On any device.</p>
    <form class="cm-landing-start" id="cm-landing-start">
      <div class="cm-landing-step"><span aria-hidden="true">1</span><strong>${known ? "Start a new deck" : "Step one: start your first deck"}</strong></div>
      <div class="cm-landing-row"><label class="cm-landing-field"><span aria-hidden="true">⌕</span><input id="cm-landing-query" name="query" autocomplete="off" aria-label="A commander’s name, or a pasted deck list" placeholder="Name a commander, or paste a deck list…"></label><button type="submit" class="v-button primary">Start my deck →</button></div>
      <p class="cm-landing-or"><span>Or:</span><button type="button" class="cm-landing-link" data-action="import-archidekt">Import from Archidekt</button><button type="button" class="cm-landing-link" data-action="landing-list">Upload a CSV</button><button type="button" class="cm-landing-link" data-action="start-precon">Start from a precon</button><button type="button" class="cm-landing-link" data-action="restore">Restore a backup</button></p>
    </form>
    <p class="cm-landing-fine">No account needed: your library stays in this browser${accounts() ? ". Sign in to keep it in the cloud" : ""}.</p>
  </div>
  <div class="cm-landing-art" aria-hidden="true">
    <img class="cm-landing-hero-art" src="${ART}landing-cards.webp?v=1" alt="" width="1120" height="995" decoding="async" fetchpriority="high">
    <div class="cm-landing-sample"><div><strong>Krenko Goblins</strong><span>Bracket 3</span></div>${bar(85, 2, 13)}<p><span><b>85</b> in the box</span><span><b class="cm-landing-buy">13</b> to buy</span><span><b>$22</b> to finish</span></p></div>
  </div>
</section>
<section class="cm-landing-section">
  <div class="cm-landing-section-head"><h2>Where do you want to start?</h2><p>Four ways in. Each one starts with a single step, and they all share the same library.</p></div>
  <ul class="cm-landing-doors">${DOORS.map(([page, href, title, body, cta, tint, badge]) => [page, href, title, body, cta, tint, page === "Play" && !playSoon ? "" : badge]).map(([page, href, title, body, cta, tint, badge]) => `<li><a class="cm-landing-door" href="${href}" style="--tint:var(--mana-${tint})"><span class="cm-landing-door-top"><span>${e(page)}</span>${badge ? `<span>${e(badge)}</span>` : ""}</span><h3>${e(title)}</h3><p>${e(body)}</p><span class="cm-landing-cta">${e(cta)} <span aria-hidden="true">→</span></span></a></li>`).join("")}</ul>
  <section class="cm-precon-latest is-landing" id="cm-landing-precons" aria-label="New from Wizards" hidden></section>
</section>
<section class="cm-landing-band"><div class="cm-landing-section">
  <h2>From an idea to a deck you can shuffle</h2>
  <ol class="cm-landing-steps">${STEPS.map(([n, title, body, key]) => `<li>${visual[key]}<div class="cm-landing-step-name"><span>${n}</span><h3>${e(title)}</h3></div><p>${e(body)}</p></li>`).join("")}</ol>
</div></section>
<section class="cm-landing-section cm-landing-promises">${promises().map(([title, body]) => `<div><strong>${e(title)}</strong><span>${e(body)}</span></div>`).join("")}</section>
<section class="cm-landing-section"><div class="cm-landing-close"><h2>Your first deck is one commander away.</h2><button type="button" class="v-button" data-action="landing-start">Start my deck →</button></div></section>
</div>`;
    const form = C.main.querySelector("#cm-landing-start"), input = form.querySelector("input");
    /* A single line is a commander to search for; more than one is a list, and goes where lists go -- the same rule
       as the card picker's search. An input keeps one line, so a pasted list is caught on its way in. */
    const lines = (text) => String(text || "").split(/\r?\n/).filter((l) => l.trim()).length;
    /* A deck site's link goes to the importer, not to the name search. */
    const start = (text) => lines(text) > 1 ? C.startDeck.list(text) : C.startDeck.isLink(text) ? C.startDeck.link(text) : C.startDeck.commander(text);
    const run = (fn) => Promise.resolve().then(fn).catch((err) => C.notice(err.message, true));
    const onSubmit = (ev) => {ev.preventDefault(); run(() => start(input.value));};
    const onPaste = (ev) => {const text = ev.clipboardData?.getData("text") || ""; if (lines(text) < 2) return; ev.preventDefault(); run(() => C.startDeck.list(text));};
    /* New from Wizards: the newest release's precons, filled in once their few kilobytes arrive (crankmagic-decks.js). */
    if (C.preconLatest) C.preconLatest("cm-landing-precons");
    form.addEventListener("submit", onSubmit);
    input.addEventListener("paste", onPaste);
    return () => {form.removeEventListener("submit", onSubmit); input.removeEventListener("paste", onPaste);};
  };
  /* The page's two calls to action lead to Step one: the box, in view, with the cursor in it. */
  actions["landing-start"] = () => {
    const input = document.getElementById("cm-landing-query");
    if (!input) return C.go("decks");
    input.closest("form").scrollIntoView({block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"});
    input.focus({preventScroll: true});
  };
  actions["landing-list"] = () => C.startDeck.list("");
});
