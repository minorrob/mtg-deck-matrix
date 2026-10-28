/* The New game pop-up (crankmagic-lounge.js), driven by its own controls for the UAT journeys: it replaced the New table page
   (Rob, 2026-10-28). `humans` are people to invite (a name each), `ai` the AI seats ({name, level}), `host` the organizer's name. */
export async function openNewGame(page, base, hash = "#game") {
  await page.goto(`${base}/index.html${hash}`);
  await page.locator("#cm-play-home").waitFor({timeout: 30000});
  if (!(await page.locator(".cm-ng-dialog").count())) await page.getByRole("button", {name: "Start a new game", exact: true}).click();
  await page.locator(".cm-ng-dialog").waitFor({timeout: 30000});
}
export async function fillNewGame(page, {host, humans = [], ai = [{}]}) {
  const hostInput = page.locator("[data-ng-field=host]");
  if (host !== undefined && await hostInput.count()) await hostInput.fill(host);
  await page.locator(`[data-ng=humans][data-n="${1 + humans.length}"]`).click();
  for (const [i, h] of humans.entries()) {
    await page.locator(`[data-ng-field=kind][data-row="${i}"]`).selectOption("new");
    await page.locator(`[data-ng-field=name][data-row="${i}"]`).fill(h.name);
    await page.locator(`[data-ng-field=email][data-row="${i}"]`).fill(h.email || `${h.name.toLowerCase()}@example.com`);
  }
  await page.locator(`[data-ng=ai][data-n="${ai.length}"]`).click();
  for (const [i, a] of ai.entries()) {
    if (a.name) await page.locator(`[data-ng-field=ainame][data-row="${i}"]`).fill(a.name);
    if (a.level) {await page.locator(`[data-ng=toggle-diff][data-row="${i}"]`).click(); await page.locator(`[data-ng=pick-diff][data-row="${i}"][data-id="${a.level}"]`).click();}
  }
}
export async function createGame(page, base, options, hash = "#game") {
  await openNewGame(page, base, hash);
  await fillNewGame(page, options);
  await page.locator("[data-ng=submit]").click();
}
