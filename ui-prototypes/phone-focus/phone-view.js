// Recorded-view prototype fragment, inserted by preview.mjs only.
  function phoneView() {
    const s = view.state, me = players()[view.seat], p = players()[focus] || me, mine = p.playerId === view.seat;
    const {step, next} = stepInfo();
    const icon = (glyph, action, label, extra = "") => `<button type="button" class="cm-phone-icon" data-action="${action}" aria-label="${e(label)}" title="${e(label)}">${glyph}${extra}</button>`;
    const rail = `<nav class="cm-phone-rail" aria-label="Board">
      ${icon("✋", "board-show-hand", "Your hand", `<span class="cm-phone-badge">${me.zones.Hand.count}</span>`)}
      <span class="cm-board-tools">${icon(CLOCK, "board-history", "History")}${historyOpen ? historyMenu() : ""}</span>
      ${icon(COACH, "board-coach", "CrankMagic Coach")}
      <span class="cm-board-tools">${stageProfile(me)}</span></nav>`;
    const pill = mine
      ? `<div class="cm-phone-pill"><b>T${s.turn}</b><span class="cm-board-step">${e(step)}</span>${next ? `<span class="cm-board-next">Next: ${e(next)}</span>` : ""}
          ${passButton()}</div>`
      : `<div class="cm-phone-pill"><span>Viewing ${e(p.name)}</span>${b("My board", "board-focus", {seat: String(view.seat)}, true, {cls: "compact"})}</div>`;
    const seats = [me, ...players().filter((x) => x.playerId !== view.seat)];
    const strip = `<aside class="cm-phone-seats" aria-label="Seats">
      ${seats.map((x) => `<button type="button" class="cm-phone-seat${x.playerId === p.playerId ? " is-focus" : ""}" data-action="board-focus" data-seat="${x.playerId}" aria-pressed="${x.playerId === p.playerId}" style="--seat:${seatColor(x.playerId)}">
        <span>${e(x.playerId === view.seat ? "You" : x.name)}</span><b>${x.health.life}</b><small>${e(seatFlag(x))}</small></button>`).join("")}
      <div class="cm-phone-rotate">${b("‹", "board-rotate", {by: "-1"}, false, {cls: "compact"})}${b("›", "board-rotate", {by: "1"}, false, {cls: "compact"})}</div></aside>`;
    return `${rail}${cameraMenu()}${strip}<div class="cm-phone-center">${pill}<div class="cm-phone-battlefield" tabindex="0" aria-label="Battlefield, scroll to explore">${mat(p, {size: "phone", head: "none"})}</div><div class="cm-phone-ask">${went()}${decision()}${stack()}</div></div>`;
  }
