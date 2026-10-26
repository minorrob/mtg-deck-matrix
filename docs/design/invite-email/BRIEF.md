# The invitation email: brief for Claude Design (October 26, 2026)

Rob, 2026-10-26: *"we want a professional-looking HTML email to be sent to them, inviting them to log in to
CrankMagic ... Claude Design will then create the HTML email, which I'll then get back to you to store and use."*

Admin › Share sends this email after the invitee's address has been added to Cloudflare Access for staging and
production and each one is confirmed. Until Claude Design's version comes back, the email is the repository's own
placeholder, `INVITE_HTML` in `cloud/invite-email.mjs`. The returned HTML replaces that string whole.

Read `docs/design/BRIEF.md` first: US English and US formats, always.

## The prompt to give Claude Design

> Design a single transactional HTML email for **CrankMagic**: an invitation that tells a new player they have been
> invited and gets them to sign in. CrankMagic is an intelligent Magic: The Gathering Commander deck builder, card
> library and online table, with an AI coach. The audience is a friend of the administrator, a Commander player in
> the US, opening it on a phone or in Gmail on a desktop.
>
> **Content, in this order**
> 1. The CrankMagic logo mark and wordmark (attached).
> 2. A short, warm headline (for example "Your seat at the table is ready").
> 3. "Hi {{name}}," then one or two sentences: they are invited to CrankMagic, to build and tune Commander decks,
>    track their collection and play at the table, with an AI coach beside them.
> 4. One line: sign in with **this email address** (the invitation is tied to it; another address will not work).
> 5. One primary button, **Sign in to CrankMagic**, linking to `{{link}}`.
> 6. Under it, small: "If the button does not work, copy this link into your browser:" and `{{link}}` as text.
> 7. Optional: three small feature highlights with an icon each (Build decks · Track your library · Play with an AI
>    coach). Keep words few: symbols first, words last.
> 8. Footer, small and muted: "You received this because the CrankMagic administrator invited this address. If you
>    were not expecting it, you can ignore this email." Then the Fan Content line, verbatim: "CrankMagic is unofficial
>    Fan Content permitted under the Wizards of the Coast Fan Content Policy. Not approved or endorsed by Wizards.
>    Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC."
>
> **Look:** CrankMagic's dark arcane-tech brand: deep navy background (about #0b1220), a slightly raised panel
> (about #121b2e) with a fine border, the brand blue (#1456b8 for the button; #86cdff for the wordmark and links)
> and the blue-to-light "shine" of the wordmark. Restrained, premium, game-adjacent; not busy. It must also read well
> when a mail client forces light mode.
>
> **Technical rules (it must survive Gmail, Apple Mail and Outlook):**
> - One self-contained HTML document, 600 px wide content on a full-width background; responsive down to 320 px.
> - Layout with `<table role="presentation">` and **inline styles** only. No `<style>` dependence for layout (a small
>   `<style>` block for dark-mode and mobile tweaks is fine as an enhancement), no JavaScript, no forms, no external
>   CSS, no web fonts relied on (fall back to Arial/Helvetica; the wordmark may be an image).
> - Images **PNG or JPEG only** (no WebP, no SVG), each with `width`, `height` and meaningful `alt`. The email must
>   still make sense with images off; the button must be a real HTML link with a bulletproof background color, not an
>   image.
> - Every image `src` must start with `{{assets}}/email/` (for example `{{assets}}/email/invite-logo.png`). Deliver
>   each image file alongside the HTML with that exact file name, at 2x resolution.
> - Use exactly these three tokens and no others: `{{name}}` (invitee's name), `{{link}}` (sign-in URL, used in the
>   button's `href` and in the fallback text), `{{assets}}` (the image host). Do not hard-code a URL or a name.
> - Include a hidden preheader: "Your seat at the table is ready. Sign in to build decks and play Commander."
> - `<title>` and subject line: "You are invited to CrankMagic".
> - US English and US formats throughout (color, center, gray; never UK spellings).
>
> **Deliver:** the HTML file, the image files it names, and a phone and desktop preview.

## The assets to attach with the prompt

| File in this repository | What it is | Why |
| --- | --- | --- |
| `design/crankmagic/assets/crankmagic-logo-wand-v3.png` | The approved logo mark (1254×1254, transparent PNG) | The logo; the source for an email-sized PNG |
| `assets/crankmagic/og-card.jpg` | The social card: logo, wordmark, tagline on navy (1200×630) | Shows the wordmark, its shine and the brand's colors together |
| `assets/crankmagic/apple-touch-icon.png` | The app icon (180×180) | A small, email-safe mark (the placeholder uses it today) |
| `design/crankmagic/src/crankmagic-brand.css` | The wordmark's font and brand blues (`--v-brand-blue`, `--v-brand-shine`) | Exact colors |
| `docs/design/BRIEF.md` | The standing rules for every CrankMagic design | US English and formats |
| A screenshot of the placeholder email (`docs/design/invite-email/placeholder.png`) | What is sent today | The starting point to improve on |

Not to attach: `design/art-source/crankmagic_logo.png` (the brass gear) is an earlier concept, not the approved logo.

## Taking the design in

1. Its images go in `assets/email/`, and reach production (crankmagic.com) **with a release before** the template
   that names them, so no email ever points at a missing picture.
2. The HTML replaces `INVITE_HTML` in `cloud/invite-email.mjs`, its three tokens kept.
3. `tests/sharing.mjs` checks every token is filled, the name escaped, the link and the pictures' host.
