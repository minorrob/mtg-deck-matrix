/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE SEATS, DRAWN (the lobby's quadrants, 2b and DELTA B). One place for how a seat looks at a table -- its status
 * pill, its quadrant with the element's sea behind and the commander's color-identity fan over it, its commander
 * card, and that card enlarged -- shared by the two tables that draw seats:
 *
 *   crankmagic-game.js    the local game host's lobby (never in a release)
 *   crankmagic-table.js   Play in the cloud's lobby (staging's Play release, 2026-09-29)
 *
 * It lived inside crankmagic-game.js, and the cloud lobby borrowed it from there as C.seatArt; the Play release
 * leaves the local host's modules out, so the cloud lobby opened on "Cannot read properties of undefined (reading
 * 'statusPill')" (Rob, 2026-09-29). Now it is its own module, loaded before both, and the Play release carries it.
 * The seas are CrankSea's (crankmagic-sea.js), drawn only where it is loaded.
 */
(globalThis.CrankFeatures ||= []).push(function (C) {
  const {esc: e, actions} = C;

  /* 2b's status pill: a dot in the state's color and one word for it, at the end of the label
     bar. The words are the wireframe's -- Ready, Pending deck, Invite sent -- so the table
     says the same thing the design says. */
  const STATE_WORD = {empty: 'Open', invited: 'Invite sent', pending: 'Pending', deck: 'Pending deck', ready: 'Ready', error: 'Blocked'};
  function statusPill(state, ready, check) {
    const word = (check && !check.ok) ? 'Blocked' : (STATE_WORD[state] || 'Open');
    return `<span class="cm-seat-pill" data-state="${e(state)}"><i aria-hidden="true"></i>${e(word)}</span>`;
  }

  /* THE COLOR-IDENTITY FAN (DELTA B.2). Ninety degrees from the quadrant's inner corner --
     the one touching the center panel -- one wedge per color of the commander's identity in
     WUBRG order, a thin light seam between them, and a single wash for a mono-color seat
     because a fan of one wedge is just a wash. The wedges are --mana-* tokens, so a seat's
     colors are the same colors its deck's tile wears. */
  const WUBRG = ['W', 'U', 'B', 'R', 'G'];
  function identityFan(colors, corner) {
    const ci = WUBRG.filter((c) => (colors || []).includes(c));
    if (!ci.length) return '';
    /* the inner corner in unit coordinates, and the quarter-turn the fan sweeps from it */
    /* The quarter-turn each corner sweeps INTO its own quadrant. pt() measures from (deg-90),
       so `from` is the angle whose cosine and sine both point at the box interior from that
       corner. Every entry here was 90 degrees short, which drew all four fans outside their
       quadrants where they were clipped away -- a fan that is present in the DOM, correct in
       its colors, and invisible. tests/wireframe-conformance.mjs holds the four angles now. */
    const at = {tl: [0, 0, 90], tr: [1, 0, 180], bl: [0, 1, 0], br: [1, 1, 270]}[corner] || [1, 1, 270];
    const [cx, cy, from] = at;
    const R = 1.45, step = 90 / ci.length;
    const pt = (deg) => {
      const r = (deg - 90) * Math.PI / 180;
      return [(cx + Math.cos(r) * R).toFixed(4), (cy + Math.sin(r) * R).toFixed(4)];
    };
    const wedges = ci.map((c, i) => {
      const a0 = from + step * i, a1 = from + step * (i + 1);
      const [x0, y0] = pt(a0), [x1, y1] = pt(a1);
      return `<path d="M${cx} ${cy} L${x0} ${y0} A${R} ${R} 0 0 1 ${x1} ${y1} Z" fill="var(--mana-${c})"></path>`;
    }).join('');
    const seams = ci.length > 1 ? ci.slice(1).map((c, i) => {
      const [x, y] = pt(from + step * (i + 1));
      return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="var(--poster-ink)" stroke-width=".006" opacity=".45"></line>`;
    }).join('') : '';
    return `<svg class="cm-seat-fan" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">${wedges}${seams}</svg>`;
  }

  /* A quadrant: the sea behind, the fan over it, the seat's own content above both. `corner`
     is where the quadrant's INNER corner is -- the one that touches the center panel -- which
     is what the fan radiates from and what the label and card are placed away from. */
  function quadrant(corner, cls, colors, state, inner) {
    return `<article class="cm-seat-q cm-q-${corner}${cls ? ' ' + cls : ''}" data-state="${e(state)}">
      <canvas class="cm-seat-sea" data-sea="${e(state)}" aria-hidden="true"></canvas>
      ${identityFan(colors, corner)}
      <div class="cm-seat-shade" aria-hidden="true"></div>
      <div class="cm-seat-body">${inner}</div>
    </article>`;
  }

  /* Each quadrant's canvas is painted by CrankSea with the element its state names. The
     handles are kept so a redraw stops the old animations rather than leaving four more
     requestAnimationFrame loops running behind the new ones -- which is how a lobby that is
     redrawn on every ready toggle ends up with twenty. */
  /* HOW TALL THE TABLE CAN BE. Whatever is left between its own top and the bottom of the
     window, so the whole table is in view without scrolling. Measured rather than guessed at
     in CSS, because what sits above it changes -- the host-offline banner alone is ~190px. */
  function sizeTable() {
    const table = C.main.querySelector('.cm-lobby-table');
    if (!table) return;
    const top = table.getBoundingClientRect().top;
    const room = Math.round(window.innerHeight - top - 24);
    table.style.setProperty('--cm-table-h', Math.max(320, room) + 'px');
  }
  /* A resize changes the room and the canvases with it, so both are redone together. */
  let sizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(sizeTimer);
    sizeTimer = setTimeout(() => { sizeTable(); startSeas(); }, 150);
  });

  /* MEASURING ONCE IS NOT ENOUGH. crankmagic-online.js inserts the host-offline banner ABOVE
     the table after this view has already drawn, which pushed the table ~190px down the page
     while it kept the height measured from where it used to be -- so it ran off the bottom of
     the window by exactly the banner's height. Web fonts landing late do a smaller version of
     the same thing. So the table's room is observed rather than measured once. */
  let roomObserver = null;
  function watchTableRoom() {
    if (roomObserver) roomObserver.disconnect();
    if (typeof ResizeObserver === 'undefined') return;
    const table = C.main.querySelector('.cm-lobby-table');
    if (!table) return;
    let last = -1;
    roomObserver = new ResizeObserver(() => {
      const top = Math.round(table.getBoundingClientRect().top);
      if (top === last) return;   /* only when the table actually moved */
      last = top;
      sizeTable();
    });
    roomObserver.observe(C.main);
  }

  let seaStops = [];
  function startSeas() {
    sizeTable();
    watchTableRoom();
    seaStops.forEach((stop) => { try { stop(); } catch (err) { /* already gone */ } });
    seaStops = [];
    if (typeof CrankSea === 'undefined') return;
    for (const canvas of C.main.querySelectorAll('.cm-seat-sea')) {
      const box = canvas.getBoundingClientRect();
      const w = Math.max(80, Math.round(box.width || 320)), h = Math.max(60, Math.round(box.height || 200));
      seaStops.push(CrankSea.startSea(canvas, {width: w, height: h, element: CrankSea.elementFor(canvas.dataset.sea), opacity: .8}));
    }
  }

  function commanderArtUrl(seat) {
    const cmd = (seat.commanders && seat.commanders[0]) || null;
    if (!cmd) return "";
    if (cmd.cardId && C.card) {
      const c = C.card(cmd.cardId);
      if (c && c.image) {
        return String(c.image)
          .replace("/small/", "/normal/")
          .replace("/large/", "/normal/");
      }
    }
    if (cmd.name) return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cmd.name)}&format=image&version=normal`;
    return "";
  }

  /* THE SEAT'S FIGURE (wireframe 2b). The card and the reading beside it, as one row that
     sits in the quadrant's outer bottom corner. 2b gives the card `height:144` in a 190px
     quadrant and the aspect 488:680 -- about three quarters of the quadrant's height -- so
     the height is a proportion here rather than a pixel count, and the card stays a card at
     every table size. An empty seat gets the same frame, dashed, carrying a question mark:
     the chair is drawn whether or not anyone is in it. */
  function seatFigure(seat, detail, controls) {
    const art = seat ? commanderArtUrl(seat) : '';
    const name = seat ? (((seat.commanders && seat.commanders[0]) || {}).name || seat.name || 'Commander') : '';
    const card = seat
      ? (art
        ? `<button type="button" class="cm-seat-card" data-action="lobby-art-zoom" data-art="${e(art)}" data-name="${e(name)}" aria-label="Enlarge ${e(name)}"><img src="${e(art)}" alt="" loading="lazy" referrerpolicy="no-referrer"></button>`
        : `<div class="cm-seat-card is-blank" aria-hidden="true"><span>${e(name.slice(0, 2))}</span></div>`)
      : `<div class="cm-seat-card is-empty" aria-hidden="true"><span>?</span></div>`;
    return `<div class="cm-seat-figure">${card}<div class="cm-seat-detail">${detail}${controls || ''}</div></div>`;
  }

  actions["lobby-art-zoom"] = (el) => {
    const src = el.dataset.art || (el.querySelector && el.querySelector("img") && el.querySelector("img").src) || "";
    const name = el.dataset.name || "Commander";
    if (!src) return;
    document.querySelectorAll(".cm-lobby-art-pop").forEach((n) => n.remove());
    /* Rob: the pop-up should be 80-110% of the card on the table. It had no width at all, so it
       took the image's natural size and bore no relation to the card that opened it. 105% of the
       measured card, with a floor of 300px: at 105% of a small quadrant's card the oracle text
       would be the size it is on the table, and reading the card is what a pop-up is for. */
    const from = el.getBoundingClientRect();
    /* 105% of the card, then Rob asked for another 40% on top of that: 1.47. The floor moves
       with it so a small table still gives a readable card. */
    const popWidth = Math.round(Math.max(420, Math.min(from.width * 1.47, window.innerWidth - 48)));
    const pop = document.createElement("div");
    pop.className = "cm-lobby-art-pop";
    pop.style.setProperty("--cm-pop-w", popWidth + "px");
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", name);
    pop.innerHTML = `<button type="button" class="cm-lobby-art-pop-backdrop" data-action="lobby-art-close" aria-label="Close"></button><button type="button" class="cm-lobby-art-pop-card" data-action="lobby-art-close" aria-label="Close enlarged art"><img src="${e(src)}" alt="${e(name)}"></button>`;
    document.body.appendChild(pop);
    /* Size pop card to 1.5× the seat art that was clicked. */
    const img = el.tagName === "IMG" ? el : el.querySelector("img");
    const seatArt = img || el;
    const r = seatArt.getBoundingClientRect();
    const card = pop.querySelector(".cm-lobby-art-pop-card");
    /* By its width alone: the CSS's 5:7 gives the height (R3.9). */
    if (card && r.width) card.style.width = Math.round(r.width * 1.5) + "px";
  };
  actions["lobby-art-close"] = () => {
    document.querySelectorAll(".cm-lobby-art-pop").forEach((n) => n.remove());
  };
  C.seatArt = {statusPill, identityFan, quadrant, sizeTable, startSeas, commanderArtUrl, seatFigure};
});
