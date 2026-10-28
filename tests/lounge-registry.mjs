/* THE LOUNGE'S LISTS AND THE WAYS TO MAKE A TABLE (docs/ui-lane/lounge-contract.md §1 and §2), through the Worker's real front door.
 *
 *   live      public tables in their lobby or being played, the caller's private ones, every one for the admin; newest first;
 *             a roster of public facts only; finished and canceled tables are not listed; an entry a day old is gone
 *   mine      the caller's own unfinished tables, on any device
 *   create    privacy (default private), Observe AI game (the admin's alone, AI seats only), a person's seat by email or name,
 *             an AI seat's persona and level (Hard is not open), houseRules and privacy in the rules
 *   ai-seat   gains `levels`;   users/search   people by name, never an address
 *   Nowhere an address: every answer is searched for the addresses the suite used.
 */
import {ROB, MAYA, SAM, EVE, AVERY, ok, eq, count, world, deckFor, everyString} from "./helpers/lounge-harness.mjs";

const noAddress = (value, message) => ok(![...everyString(value)].some((s) => /[\w.+-]+@[\w-]+\.[a-z]/i.test(s)), message);

/* 1. LIVE: who sees which table. Rob is CrankMagic's owner (OWNER_EMAIL), so the admin; Maya hosts. */
{
  const w = await world();
  const pub = await w.make(MAYA, {hostName: "Maya", privacy: "public", seats: [{kind: "human", name: "Sam"}, {kind: "ai", name: "Sable", level: "easy", persona: "sable"}]});
  eq([pub.status, pub.json.table.privacy, pub.json.table.seats[2].persona, pub.json.table.seats[2].level], [201, "public", "sable", "easy"], "a public table is made, and an AI seat's persona and level are echoed");
  clockStep(w, 1000);
  const hidden = await w.make(MAYA, {hostName: "Maya", seats: [{kind: "ai", name: "Moss"}]});
  eq(hidden.json.table.privacy, "private", "a table is private unless the host says public");
  clockStep(w, 1000);
  const newer = await w.make(SAM, {hostName: "Sam", privacy: "public", seats: [{kind: "ai", name: "Ember"}, {kind: "ai", name: "Gale"}]});

  const seen = (await w.call("GET", "/api/tables/live", {as: EVE})).json;
  eq(seen.games.map((g) => g.tableId), [newer.id, pub.id], "a stranger sees the public tables, newest first, and not the private one");
  const first = seen.games[1];
  eq([first.location, first.organizer, first.privacy, first.ai, first.human, first.open, first.startedAt, first.mine], ["lobby", "Maya", "public", 1, 1, 1, null, false],
    "a table in its lobby: its organizer, one AI, the host as the one person, Sam's chair still open, not started, not the caller's");
  eq(first.roster, [{name: "Maya", ai: false, commander: null, mechanic: ""}, {name: "Sable", ai: true, commander: null, mechanic: ""}], "the roster is the occupied seats, public facts only");
  eq(seen.games[0].open, 0, "a table of AI seats has no open chair");
  noAddress(seen, "no address in the lounge's list");

  eq((await w.call("GET", "/api/tables/live", {as: MAYA})).json.games.map((g) => [g.tableId, g.mine]), [[newer.id, false], [hidden.id, true], [pub.id, true]],
    "the host sees their private table too, and marks both of theirs as theirs");
  eq((await w.call("GET", "/api/tables/live", {as: ROB})).json.games.length, 3, "the admin sees every table, private or not");
  eq((await w.call("GET", "/api/tables/live", {as: SAM})).json.games.map((g) => g.tableId), [newer.id, pub.id], "a person with no seat at the private table does not see it");

  /* Inviting and seating moves the counts; a seat held by an invitation is not open. */
  const code = (await w.call("POST", `/api/tables/${pub.id}/invite`, {as: MAYA, body: {seatId: 1}})).json.invite.code;
  eq((await w.call("GET", "/api/tables/live", {as: EVE})).json.games.find((g) => g.tableId === pub.id).open, 0, "an invited chair is no longer open");
  await w.call("POST", `/api/tables/${pub.id}/join`, {as: SAM, body: {code}});
  const joined = (await w.call("GET", "/api/tables/live", {as: EVE})).json.games.find((g) => g.tableId === pub.id);
  eq([joined.human, joined.roster.map((r) => r.name)], [2, ["Maya", "Sam", "Sable"]], "a person who joined is on the roster by name");
  /* The commander is named once the seat has chosen its deck, and never a card of the deck. */
  await w.call("POST", `/api/tables/${pub.id}/deck`, {as: MAYA, body: {seatId: 0, deck: deckFor("maya")}});
  const named = (await w.call("GET", "/api/tables/live", {as: EVE})).json.games.find((g) => g.tableId === pub.id);
  eq([named.commander, named.roster[0].commander], ["General maya", "General maya"], "the organizer's commander is named once chosen");
  ok(![...everyString(named)].some((s) => /Bear maya|Grove maya/.test(s)), "and no other card of the deck is in the list");

  /* mine: the caller's own unfinished tables. */
  const mine = (await w.call("GET", "/api/tables/mine", {as: MAYA})).json.tables;
  eq(mine.map((t) => [t.tableId, t.phase, t.organizer]), [[hidden.id, "selecting", "Maya"], [pub.id, "selecting", "Maya"]], "Resume game: the caller's tables, newest first, private ones included");
  ok(typeof mine[0].summary === "string" && mine[0].summary.length > 0, "each says in a line what it is");
  eq((await w.call("GET", "/api/tables/mine", {as: EVE})).json.tables, [], "a stranger has none");
  eq((await w.call("GET", "/api/tables/mine", {as: SAM})).json.tables.map((t) => t.tableId).sort(), [newer.id, pub.id].sort(), "a seat held at a table puts it on that person's list, from any device");
  noAddress(mine, "no address in Resume game");

  /* A canceled or ended table leaves both lists; a day of silence drops an entry. */
  await w.call("POST", `/api/tables/${hidden.id}/quit`, {as: MAYA, body: {}});
  eq((await w.call("GET", "/api/tables/mine", {as: MAYA})).json.tables.map((t) => t.tableId), [pub.id], "an ended table is not on the list");
  w.clock.t += 24 * 3600 * 1000 + 1;
  eq([(await w.call("GET", "/api/tables/live", {as: EVE})).json.games, (await w.call("GET", "/api/tables/mine", {as: MAYA})).json.tables], [[], []], "an entry nobody reported for a day expires");
  await w.call("POST", `/api/tables/${pub.id}/mat`, {as: MAYA, body: {mat: "night"}});
  eq((await w.call("GET", "/api/tables/live", {as: EVE})).json.games.map((g) => g.tableId), [pub.id], "and a table that reports again is listed again");

  eq([(await w.call("POST", "/api/tables/live", {as: EVE, body: {}})).status, (await w.call("GET", "/api/tables/lounge-registry")).status], [405, 404], "live is a GET, and the registry's name is no table");
}
function clockStep(w, ms) {w.clock.t += ms;}

/* 2. MAKING A TABLE. */
{
  const w = await world();
  eq((await w.make(MAYA, {hostName: "Maya", privacy: "secret", seats: [{kind: "ai"}]})).status, 400, "a privacy that is neither is refused");
  eq((await w.make(MAYA, {hostName: "Maya", seats: [{kind: "ai", level: "hard"}]})).json.error, "Hard is not open yet. Choose Normal or Easy.", "Hard answers 'Hard is not open yet'");
  eq((await w.make(MAYA, {hostName: "Maya", seats: [{kind: "ai", level: "hard"}]})).status, 422, "with a 422");
  eq((await w.make(MAYA, {hostName: "Maya", seats: [{kind: "ai", level: "llm"}]})).status, 403, "the AI on Claude stays behind the AI door");
  eq((await w.make(MAYA, {hostName: "Maya", seats: [{kind: "ai", persona: "Sable!"}]})).status, 400, "a persona is one to twenty lower-case letters");
  eq((await w.make(MAYA, {hostName: "Maya", seats: [{kind: "human", name: "Avery", email: "not an address"}]})).status, 400, "a person's email must be one");

  const withPeople = await w.make(MAYA, {hostName: "Maya", privacy: "public", seats: [{kind: "human", name: "Avery Chen", email: AVERY}, {kind: "human", name: "Sam", user: "Sam Rivers"}, {kind: "ai", name: "Sable", persona: "sable"}]});
  eq(withPeople.status, 201, "seats for people carry an email, or a user's name");
  noAddress(withPeople.json, "the address a host typed is kept and never returned");
  eq([withPeople.json.table.seats[1].name, withPeople.json.table.seats[2].name], ["Avery Chen", "Sam"], "the seat bears the name given");
  const live = (await w.call("GET", "/api/tables/live", {as: EVE})).json.games[0];
  eq([live.human, live.open], [2, 1], "a seat reserved for an address is a person invited, not an open chair; one named for a user is still to be invited");
  eq((await w.call("POST", `/api/tables/${withPeople.id}/rules`, {as: MAYA, body: {houseRules: false, privacy: "private"}})).json.table.rules,
    {startingLife: 40, bracketLimit: null, skipFirstDraw: true, passStack: true, houseRules: false, privacy: "private"}, "the rules take houseRules and privacy, and say them");
  eq((await w.call("GET", "/api/tables/live", {as: EVE})).json.games, [], "a table made private leaves the public list");
  eq((await w.call("POST", `/api/tables/${withPeople.id}/rules`, {as: MAYA, body: {houseRules: "yes"}})).status, 400, "houseRules is a boolean");
  eq((await w.call("POST", `/api/tables/${withPeople.id}/rules`, {as: MAYA, body: {privacy: "public"}})).json.table.privacy, "public", "privacy alone can be changed in the lobby");

  /* Observe AI game: the admin's alone. */
  eq((await w.make(MAYA, {hostName: "Maya", observe: true, seats: [{kind: "ai"}, {kind: "ai"}]})).status, 403, "only the admin may ask to observe");
  eq((await w.make(ROB, {hostName: "Rob", observe: true, seats: [{kind: "ai"}]})).status, 400, "an observed game needs two AI seats");
  eq((await w.make(ROB, {hostName: "Rob", observe: true, seats: [{kind: "ai"}, {kind: "human"}]})).status, 400, "and no one else");
  const watched = await w.make(ROB, {hostName: "Rob", observe: true, privacy: "public", seats: [{kind: "ai", name: "Sable"}, {kind: "ai", name: "Ember"}, {kind: "ai", name: "Gale", level: "easy"}]});
  eq([watched.status, watched.json.table.observe, watched.json.table.yourSeat, watched.json.table.youAreHost, watched.json.table.youAreAdmin,
    watched.json.table.seats.map((s) => [s.kind, s.name, s.occupied])], [201, true, null, true, true, [["ai", "Sable", true], ["ai", "Ember", true], ["ai", "Gale", true]]],
    "an observed table seats AI only, and the admin sits at none of them");
  eq((await w.call("GET", "/api/tables/live", {as: EVE})).json.games.find((g) => g.tableId === watched.id).human, 0, "and counts no one");

  /* ai-seat: the levels a table may seat now. */
}

/* 3. USERS SEARCH and AI-SEAT, against the Worker's own routes (a database with the sharing tables). */
{
  const w = await world({db: true});
  const raw = w.db.raw;
  const user = (email, name, invited) => {
    raw.prepare("INSERT INTO users (email, created_at, seen_at) VALUES (?, 't', 't')").run(email);
    const id = raw.prepare("SELECT id FROM users WHERE email = ?").get(email).id;
    if (name) raw.prepare("INSERT INTO profiles (user_id, name, avatar, updated_at) VALUES (?, ?, '', 't')").run(id, name);
    if (invited) raw.prepare("INSERT INTO account_invitations (email, name, invited_by, created_at, status) VALUES (?, ?, ?, 't', 'admitted')").run(email, invited, id);
    return id;
  };
  user(MAYA, "Maya Lin"); user(AVERY, "Avery Chen"); user("averil.k@example.com", "", "Averil Kerr"); user("ava.stone@example.com", ""); user(`service:abc123@example.com`, "Avery Bot");
  for (let i = 0; i < 10; i += 1) user(`avi${i}@example.com`, `Avi Number ${i}`);
  const found = await w.call("GET", "/api/users/search?q=av", {as: MAYA});
  eq(found.status, 200, "a signed-in person searches");
  ok(found.json.users.length === 8, "at most 8");
  const names = (await w.call("GET", "/api/users/search?q=aver", {as: MAYA})).json.users;
  eq(names.map((u) => u.name), ["Averil Kerr", "Avery Chen"], "matched on a profile's name and on the name an invitation was sent under");
  eq(names.map((u) => u.handle), ["averil-kerr", "avery-chen"], "a handle is a slug of the name");
  noAddress(names, "never an address");
  eq((await w.call("GET", "/api/users/search?q=ava.s", {as: MAYA})).json.users.map((u) => u.name), ["Ava Stone"], "matched on the start of the part before the @; a person with no name is shown as one, never their address");
  eq((await w.call("GET", "/api/users/search?q=maya", {as: MAYA})).json.users, [], "never the caller");
  eq((await w.call("GET", "/api/users/search?q=a", {as: MAYA})).json.users, [], "one letter finds no one");
  eq((await w.call("GET", "/api/users/search?q=bot", {as: MAYA})).json.users, [], "a service identity is nobody to invite");

  eq((await w.call("GET", "/api/ai-seat", {as: MAYA})).json, {open: false, levels: ["easy", "normal"]}, "ai-seat names the levels a table may seat now: Hard is not among them, nor the AI on Claude while it is shut");
  const bare = await world({db: false});
  eq([(await bare.call("GET", "/api/tables/live", {as: MAYA})).status], [200], "the lounge answers without a database");
}

console.log(`lounge-registry: ${count()} checks passed — the lounge's lists (live, mine), private tables kept to their seats, organizer and the owner, entries that expire, the new create fields, users/search and ai-seat's levels, and no address anywhere.`);
