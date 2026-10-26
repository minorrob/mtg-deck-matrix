# The invitation email: the design, taken in (October 26, 2026)

Rob, 2026-10-26: *"You're creating an HTML email file that will be the invite that gets auto-sent from CrankMagic when I
invite someone to the game from the Invite function in the Admin pane. The admin pane will have an option where I
select: General or Game Theory Insiders. If Game Theory Insiders, it will also indicate that it's AI powered."*

The design canvas (three artboards: General on a desktop, Game Theory Insiders on a desktop, Insiders on a phone) is
the Claude Design artifact "CrankMagic Invite Email". These files are its output, in the CrankMagic design system
(Sapphire & Obsidian, dark): Cinzel for the headline, Lato for the words, the gear logo with the gilt wordmark, the
sapphire button.

## The two templates

| File | Audience | What differs |
| --- | --- | --- |
| `invite-general.html` | General | Eyebrow "You are invited"; three highlights (Build decks, Keep your library, Play at the table); no mention of AI. |
| `invite-insiders.html` | Game Theory Insiders | Eyebrow "Game Theory Insiders · AI powered" in the decision gold; an "AI powered" band with the coach icon; the third highlight is "Play with a coach"; the feedback line says insiders' notes carry the most weight. |

Both share: the logo and wordmark, "Your seat at the table is ready", "Hi {{name}},", the one-paragraph pitch, the
sign-in line (this email address, no other), the **Open CrankMagic** button to https://staging.crankmagic.com, the
copy-this-link fallback, a feedback panel pointing at admin@crankmagic.com, and the footer (the administrator notice,
the Fan Content line verbatim, the site).

## Tokens

- `{{name}}`: the invitee's name as typed in Admin › Share, HTML-escaped by `inviteHtml` in `cloud/invite-email.mjs`.
- `{{assets}}`: the image host, `https://crankmagic.com/assets` (production's public pages; staging sits behind Access
  and a mail client could not load it).
- The link is **not** a token: Rob asked for https://staging.crankmagic.com on the button, so it is written in. The
  Worker's `{{link}}` filler simply finds nothing to fill; switch the two `href`s and the fallback text back to
  `{{link}}` when the invitation should sign the invitee in at `INVITE_LINK_ORIGIN`.

## The pictures

In `assets/email/`, all PNG, all at 2x for the size they are shown at:

| File | Shown at | What it is |
| --- | --- | --- |
| `invite-logo.png` (256×256) | 104×104 | The gear logo, `assets/crankmagic/crankmagic-logo-gear-v4-256.webp` as PNG. |
| `invite-wordmark.png` (525×78) | 182×27 | CRANKMAGIC in Cinzel 600 at .08em, in `color-brand` gilt (#d2a973), rendered from the design system's own font file so no mail client needs the web font. |
| `icon-build.png`, `icon-library.png`, `icon-table.png`, `icon-coach.png` (80×80) | 40×40 | The highlight icons: 16-unit grid, 1.75 stroke, round caps, gilt. The coach icon is on the Insiders band only. |

They reach production (crankmagic.com) **with a release before** a template that names them, so no email points at a
missing picture (`docs/design/invite-email/BRIEF.md`, "Taking the design in").

## Email-safe on purpose

Tables with `role="presentation"`, inline styles, 600 px content on a full-width ground, a small `<style>` block only
for the phone (columns stack, side padding 20 px, the headline 26 px) and client resets, no JavaScript, no forms, PNG
only, a hidden preheader, `<title>` "You are invited to CrankMagic". The Google Fonts link is an enhancement: Cinzel
falls back to Georgia and Lato to Arial where a client strips it, and the wordmark is a picture so the name holds.

## Wiring (not done here)

`cloud/invite-email.mjs` still carries the placeholder `INVITE_HTML`. To use these: load each file as a string (or
inline them as two exported constants), add an audience field to Admin › Share (`general` | `insiders`) that
`cloud/sharing.mjs` stores on the invitation's row and passes to `inviteHtml`, pick the template by it, and extend
`tests/sharing.mjs` to check both audiences fill every token and that the Insiders template, and only it, says "AI
powered". Those files are the Codex · Workshop lane's.
