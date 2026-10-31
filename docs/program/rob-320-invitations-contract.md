# ROB-320 contract: invitations without steps

*Rob, 2026-10-29 (the flow) and 2026-10-30 (the groups, the Settings window, the cap, the table). Written by Claude (agent) on
`claude/rob-320-invitations`, before either half was built. Supersedes the "a table's link never adds anyone" line of
`game/room/table.mjs` (Rob, 2026-09-26): Rob's words of 2026-10-29 are the newer rule. Nothing in this document has been run
against real Cloudflare Access or real Resend; every claim about them is from the code and a faked `fetch`.*

## 1. The flow

1. **Create game** (the New game pop-up, `crankmagic-lounge.js`): two or more human seats. A seat is a CrankMagic user picked by
   name from the dropdown (`GET /api/users/search`, names and handles, never an address) or a name and an email typed in.
   *Create game* makes the table and sends each invitee the invitation email (name, lobby link). The organizer does nothing
   in the lobby: no Invite, no Confirm, no answer to a request.
2. **By email**: the link `/api/join/<tableId>` goes through Cloudflare's sign-in and opens the lobby (`#table?id=<id>&join=1`);
   the app posts `join` with no code and the person is in the seat held for their address. No other confirmation.
3. **From the pre-lobby**: a public table is in Live games; one press posts `join` and opens the lobby, in a seat. No host answer.
4. **Refusals only where the rules need them**, each saying what is wrong and what to do instead: the table is full; the
   seat is taken; the table has started or ended; a private table holding no seat for this address. (There is no ban list in the
   code: a banned address is one Cloudflare Access refuses at sign-in, so it never reaches a table.)

## 2. Wire contract

### `POST /api/tables` (create), additive

A human seat after the first is `{kind: "human", name, email}` (typed in) or `{kind: "human", name, user}` (a dropdown pick;
`user` is the display name or `handle` the search returned) with an optional `group: "general" | "insider"` (see §4).

Worker steps, in this order, so a refusal leaves nothing behind:

1. **Plan** (no side effects): resolve each `user` to an address on the server; refuse an unknown name, a duplicate person, the
   host's own address, an invalid address; count the addresses that would be *new accounts* and refuse the whole create if
   they would take the inviter past the cap (§5) or if a non-owner asked for `insider`.
2. **Create the table** with each invitee's seat held for their address (`reserved`) and marked invited.
3. **Invite each person**: §3, then the email (the lobby link and the invitee's name). The response gains
   `invitations: [{seatId, name, status: "sent" | "failed" | "pending", error?}]`, never an address. A failure is per seat; the
   table is already made.

### `POST /api/tables/:id/reinvite` `{seatId}` (host only): the idempotent retry

Reads the address held for that seat (inside the table's object, never returned) and runs §3 again. Nothing is duplicated: the
invitation row is keyed by invitee, the Access admission reads before it writes, the email has one queued job per
(table, address). Answers `{invitation: {seatId, name, status, error?}}`.

### `POST /api/tables/:id/join` `{code?}`, changed

* With `code`: as before (a host-sent link, kept for older links and the host's own `invite` route).
* Without `code`: 
  1. already seated: answers the table (idempotent);
  2. a seat held for this address: seated there, named as the host typed it;
  3. a **public** table with an open seat: seated in the first open seat, named by their profile;
  4. otherwise refused (409 table full / started / ended; 403 private table holding nothing for you), with the way out.
* `GET /api/join/:table` (no code) redirects to `#table?id=<table>&join=1`. `GET /api/join/:table/:code` is unchanged.

`request-join` and `request` (the host's answer) are no longer used by the app. They stay on the server so older pages answer
instead of failing; they are marked superseded and are the next thing to delete once no page sends them.

## 3. Admitting an address, and the record

`inviteAddress` (`cloud/invitations.mjs`), the one place an address is admitted. Settings and Create game both call it.

1. Decide the **group**: asked for, else the inviter's default (owner: `insider`, anyone else: `general`). `insider` from a
   non-owner is refused (403): *only the owner can give AI access; invite them as General, the owner can upgrade them later.*
2. If the address is already invited at that group or higher, or already a registered account, nothing is admitted and no row
   is spent (no admission without a row, and no row for an admission that did not happen). An owner choosing `insider` for
   a registered `general` person upgrades them.
3. **Cap check and row, one statement**: `INSERT ... SELECT ... WHERE (count of this inviter's rows) < 5`, status `pending`.
   Zero rows changed: refused with the cap (§5). The legacy `account_invitations` row (names, Admin's list) is written in the
   same batch.
4. **Admission**: `admitAddress` writes the address into the Access policy for the group on every configured application and
   reads it back (§6). Insider: also a row in `ai_allowlist` (the Worker's own AI gate, `groupOf`).
5. Row to `admitted`. Then, and only then, the email.

**If admission fails after the row**: the row stays `pending`, no email is sent, the error says so and says what to do
(*send the same invitation again; it finishes the rest and uses no second slot*). A pending row counts toward the cap, so a
person cannot be admitted anywhere without a row, and a retry is the same row. Sending again, from Settings, from
`reinvite`, or by creating another game with the same person, resumes at step 4.

## 4. Groups

| Group | AI | Admin | Who can create the invitation |
| --- | --- | --- | --- |
| General | no | no | anyone signed in |
| Game Theory Insider | yes (`ai_allowlist`) | no | the owner only (server-enforced) |
| Owner | yes | yes | `OWNER_EMAIL`, never invited |

## 5. The cap and the table

**Five invitees per user, the owner too** (Rob's issue says the owner is not exempt; ROB-320's comment reads "5 invitees per
user"). Counted over the inviter's rows in `invitations`, any status. `INVITE_CAP` (a Worker variable, positive integer) overrides the 5.
Refusal (409): *You have already invited 5 people, the most one person can invite, so nothing was sent. Pick someone who already
has a CrankMagic account (the dropdown), or ask the owner to invite this person or to raise the limit.* A game's create is
refused whole, before the table exists, when its new accounts would cross the cap.
Only a **new account** costs a slot: a person who already has an account, or was invited before, costs none.

`cloud/migrations/0011_invitations.sql` (the next free number on `origin/main` at 2026-10-31: 0001-0006, 0009, 0010 exist; 0007
and 0008 are unused numbers on main and are not reused here, as Claude · Engine owns the numbering, ROB-11):

```
invitations(id TEXT PK, invitee_email TEXT UNIQUE, invitee_name, inviter_id INTEGER, inviter_email, grp ('general'|'insider'),
            source ('settings'|'game'), table_id NULL, status ('pending'|'admitted'), created_at, admitted_at NULL)
```

## 6. Cloudflare configuration (unverified)

Existing: `ACCESS_INVITE_APP_IDS` (comma list of Access application ids) with `ACCESS_INVITE_POLICY_ID` (same-length list of
reusable policy ids), read in pairs.

New, optional, **each the same length as `ACCESS_INVITE_APP_IDS`**, one reusable policy per application per group:

* `ACCESS_INVITE_POLICY_ID_GENERAL`: the policies a General invitee is added to.
* `ACCESS_INVITE_POLICY_ID_INSIDER`: the policies an Insider invitee is added to (the Insider policy carries the AI door).

A group's list is used when set; otherwise `ACCESS_INVITE_POLICY_ID` (today's behavior) is the fallback for both groups. A
group list that is set but malformed refuses the invitation (503) rather than falling back, so a typo cannot silently put an
Insider on the General policy. The policy ids are **Rob's to supply**; none is invented here. `tools/release-pages.mjs` passes
`profile.sharing.accessPolicyIdGeneral` / `accessPolicyIdInsider` through when the release profile has them.

## 7. Settings window

The invite form (Admin > Share, `crankmagic-sharing.js`) gains a Group choice: *Game Theory Insider (AI)* or *General*; the
Insider option is rendered for the owner only, and the server refuses it for anyone else. After a send the window closes and a
dialog says *Your email has been successfully sent* with one Confirm button. A failure keeps the window open with the reason.
`GET /api/social/me` says `canInvite` for any signed-in person (the cap is the limit), `isAdmin` for the owner/administrator
alone; the Admin pane's operational tabs stay the administrator's (ROB-338 builds that pane; this change touches only the Share form).

## 8. Out of scope

The admin pane and model choice (ROB-338); the per-group email designs on PR #899 (design files only; the Worker keeps one
template and adds a game-invitation one); deleting `request-join`; revoking an invitation (a `revoked` status is the next step).

## 9. As built (2026-10-31): where the build differs from, or adds to, the text above

* The table's view gains `held: true` on a human seat that is waiting for a named guest (never the address). The lobby shows such a
  seat as "invited, takes the seat on arrival" and offers the host **Resend** (`reinvite`) alone: no Invite, New link, Withdraw or
  answer. The older Invite / New link / Withdraw controls remain for a human seat *no one is named for* (a seat that became open
  when an AI seat was removed); Create game cannot make one, so the flow Rob described has none of them.
* `GET /api/join/:table` (no code) is answered by `joinLocation` in `cloud/worker.mjs` as `#table?id=<table>&join=1`; the app posts
  `join` with `{}` once and then cleans the address.
* A seat's group is kept in the table (`reservedGroups`) only so `reinvite` can send the same invitation again as it was first asked.
* The Settings window: anyone with `canInvite` gets an "Invite" Menu entry (no Admin) that opens the form alone; the administrator's
  Admin window keeps General and Share.
* Not changed: `not-invited.html`, `docs/decisions-2026-09-25.md` and `tests/release-pages.mjs` still say "a link never adds anyone to
  the list"; that is true of *opening* a link (an invitation adds), but the page's wording should be revisited by the Workshop lane.
