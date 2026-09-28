# DELTA — Appearance: four palettes, Moss & Iron default

Apply on top of `IMPLEMENTATION-GUIDE.md` §1 (tokens) and §5 (theme switch). Where this file and the guide disagree, this file wins.

## What changes
1. **Appearance becomes a palette pick, not a dark/light toggle.** Four palettes, each self-contained (its own dark and light face):
   - **Moss & Iron** — DEFAULT for new and unset accounts
   - **Brass & Slate** (dark) / **Felt & Cream** (light) — one palette named "Brass & Slate" whose light face is Felt & Cream
   - **Steel & Cobalt**
2. Each palette has a **Mode**: Dark · Light · Match system.
3. Preference model: `preferences.appearance = { palette: 'moss-iron' | 'brass-slate' | 'steel-cobalt', mode: 'dark' | 'light' | 'system' }`. Migrate the old `preferences.theme` ('dark'|'light'|'system') → `{ palette:'moss-iron', mode:<old value> }`. Missing → `{ palette:'moss-iron', mode:'dark' }`.
4. Attributes on `#matrix-v2`: `data-palette="moss-iron"` and `data-theme="dark|light"` (resolved — `system` is resolved via `prefers-color-scheme` and re-resolved on change). `color-scheme` follows `data-theme`. `<meta name="theme-color">` is set from the resolved `--v-bg`.

## Token blocks (paste after the Brass & Slate block in `crankmagic-design.css`)
The existing `#matrix-v2{…}` block is Brass & Slate dark and `#matrix-v2[data-theme="light"]{…}` is Felt & Cream. Keep them but scope them: `#matrix-v2[data-palette="brass-slate"]` / `#matrix-v2[data-palette="brass-slate"][data-theme="light"]`. Then add:

```css
/* Moss & Iron — DEFAULT. Unscoped :root-level fallback so an unset attribute still renders this palette. */
#matrix-v2, #matrix-v2[data-palette="moss-iron"]{
  --v-bg:#121511; --v-panel:#181d17; --v-raised:#22291f; --v-field:#22291f; --v-field-line:#3a453a;
  --v-line:#2f382c; --v-line-strong:#44503f;
  --v-ink:#eef1e8; --v-muted:#97a391;
  --v-accent:#5fae5c; --v-on:#0d120c; --v-soft:#1f3320;
  --v-aether:#6fb7d9; --v-money:#c9a24a;
  --v-decision:#c9a24a; --v-decision-bg:#1e2118; --v-decision-line:#5a5a2e; --v-decision-ink:#eee6c8; --v-decision-field:#262a1c;
  --v-required:#e0655a;
  --st-inbox:#5fae5c; --st-pull:#3fa9a4; --st-ordered:#4f86c9; --st-buy:#c9a24a; --st-standin:#a486d6; --st-watch:#8a95a3; --st-draft:#7f8b86; --st-remove:#e0655a; --st-reserved:#7fa6dd; --st-physical:#4a9a4a;
  --mana-W:#d9c98c; --mana-U:#5f9fd6; --mana-B:#8c8aa0; --mana-R:#d66a4a; --mana-G:#5fae5c;
  --v-radius:6px; --v-radius-card:9px; --v-radius-tile:11px;
  --v-shadow-card:inset 0 1px 0 rgba(255,255,255,.05), inset 0 0 0 1px var(--v-line);
  --v-motion:150ms; --v-ease:ease;
  --v-display:'Barlow Condensed',Satoshi,system-ui,sans-serif; --v-display-weight:800; --v-display-tracking:.01em; --v-display-case:uppercase;
  --v-hero:'Barlow Condensed',Satoshi,system-ui,sans-serif; /* no serif hero in this palette */
  --v-body:Satoshi,system-ui,sans-serif;
  color-scheme:dark;
}
#matrix-v2[data-palette="moss-iron"][data-theme="light"]{
  --v-bg:#efece3; --v-panel:#faf8f2; --v-raised:#e3dfd3; --v-field:#e3dfd3; --v-field-line:#bcb5a5;
  --v-line:#cfc9ba; --v-line-strong:#aaa392;
  --v-ink:#1a1f18; --v-muted:#66705f;
  --v-accent:#2e7d3a; --v-on:#f4f9f2; --v-soft:#d9e6d4;
  --v-aether:#3f8fb8; --v-money:#9a7420;
  --v-decision:#9a7420; --v-decision-bg:#f3efe0; --v-decision-line:#cdbf8a; --v-decision-ink:#3f3410; --v-decision-field:#ebe5d0;
  --v-required:#c0392f;
  --st-inbox:#2e7d3a; --st-pull:#1f8c88; --st-ordered:#2d6cb8; --st-buy:#b0842a; --st-standin:#7a5ad0; --st-watch:#66705f; --st-remove:#c0392f; --st-reserved:#3f6fd0; --st-physical:#2e7d3a;
  --mana-W:#b89a2a; --mana-U:#2d78c4; --mana-B:#6a6486; --mana-R:#c25a3a; --mana-G:#2e7d3a;
  color-scheme:light;
}

/* Steel & Cobalt */
#matrix-v2[data-palette="steel-cobalt"]{
  --v-bg:#0f1217; --v-panel:#151a21; --v-raised:#1e252e; --v-field:#1e252e; --v-field-line:#35414e;
  --v-line:#2b3540; --v-line-strong:#3d4a58;
  --v-ink:#eef3f8; --v-muted:#8f9db0;
  --v-accent:#2f7ee8; --v-on:#ffffff; --v-soft:#182a44;
  --v-aether:#5fe0ff; --v-money:#e6a23c;
  --v-decision:#e6a23c; --v-decision-bg:#1c1a14; --v-decision-line:#6a5626; --v-decision-ink:#f3e1bd; --v-decision-field:#25211a;
  --v-required:#ef6b60;
  --st-inbox:#4fb27a; --st-pull:#3fbdc4; --st-ordered:#4f9cf5; --st-buy:#e6a23c; --st-standin:#b18cf0; --st-watch:#8f9db0; --st-draft:#7f8ba0; --st-remove:#ef6b60; --st-reserved:#7fb0ff; --st-physical:#3f9a68;
  --mana-W:#e3d597; --mana-U:#4f9cf5; --mana-B:#8b86a6; --mana-R:#e8664a; --mana-G:#4fb27a;
  --v-radius:4px; --v-radius-card:6px; --v-radius-tile:8px;
  --v-shadow-card:0 0 0 1px var(--v-line), 0 1px 2px rgba(0,0,0,.6);
  --v-motion:120ms; --v-ease:linear;
  --v-display:Satoshi,system-ui,sans-serif; --v-display-weight:900; --v-display-tracking:-.035em; --v-display-case:none;
  --v-hero:'Young Serif',Georgia,serif; /* ≥48px headlines only, as in Brass & Slate */
  --v-body:Satoshi,system-ui,sans-serif;
  color-scheme:dark;
}
#matrix-v2[data-palette="steel-cobalt"][data-theme="light"]{
  --v-bg:#eef1f5; --v-panel:#ffffff; --v-raised:#e1e6ee; --v-field:#e1e6ee; --v-field-line:#b4c0cf;
  --v-line:#c7d0dc; --v-line-strong:#a3b1c2;
  --v-ink:#141a22; --v-muted:#5c6a7c;
  --v-accent:#2160c4; --v-on:#ffffff; --v-soft:#dbe6f7;
  --v-aether:#1f9fd0; --v-money:#b8781a;
  --v-decision:#b8781a; --v-decision-bg:#f6f1e6; --v-decision-line:#d9c08c; --v-decision-ink:#4a3a10; --v-decision-field:#efe8d8;
  --v-required:#c0392f;
  --st-inbox:#2f8a5a; --st-pull:#1f8c92; --st-ordered:#2160c4; --st-buy:#b8781a; --st-standin:#6d48d0; --st-watch:#5c6a7c; --st-remove:#c0392f; --st-reserved:#3f6fd0; --st-physical:#2f8a5a;
  --mana-W:#b89a2a; --mana-U:#2160c4; --mana-B:#665e86; --mana-R:#c8502f; --mana-G:#2f8a5a;
  color-scheme:light;
}
```

Brass & Slate additionally needs `--v-shadow-card:0 1px 0 rgba(255,255,255,.04) inset; --v-motion:250ms; --v-ease:ease; --v-display:Satoshi…; --v-display-weight:900; --v-display-tracking:-.035em; --v-display-case:none; --v-hero:'Young Serif',Georgia,serif;` added to its block (light face: `--v-shadow-card:0 10px 30px -18px rgba(40,30,20,.35); --v-ease:cubic-bezier(.2,.9,.3,1.2)`).

## Rules that must read the new tokens
- **Radius**: every `border-radius` literal → `var(--v-radius)` (controls), `var(--v-radius-card)` (panels/dialogs), `var(--v-radius-tile)` (deck tiles). Pills stay `999px`.
- **Display type**: headings, deck names, big figures use `font-family:var(--v-display); font-weight:var(--v-display-weight); letter-spacing:var(--v-display-tracking); text-transform:var(--v-display-case)`. Hero headlines ≥48px (landing hero, deck title, landing closing CTA) use `var(--v-hero)` — in Moss & Iron that resolves to Barlow Condensed, so the serif simply disappears there.
- **Card shadow**: `.v-panel`, dialogs, deck tiles → `box-shadow:var(--v-shadow-card)`.
- **Motion**: transitions → `var(--v-motion) var(--v-ease)`; `prefers-reduced-motion` zeroes it.
- **Aether mist** (`aether.js`): read `--v-aether` from the computed style of `#matrix-v2` on init and on palette change (dispatch `crank:appearance` and re-init). Steel & Cobalt's cyan is intentionally brighter.
- **Play**: tabletop fans and quadrant fills use `--mana-*`; vitals pill red uses `--v-required`; Coach aether uses `--v-aether`.

## Fonts
Add to `index.html` (and CSP `style-src`/`font-src` as in the guide): `https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Young+Serif&display=swap` plus the Satoshi 400/500/700/900 faces already self-hosted. Barlow Condensed loads for every user (it is the default palette).

## Settings UI — Appearance (Settings page and Global menu › Appearance)
```
APPEARANCE
Palette   ( ● Moss & Iron   ○ Brass & Slate   ○ Steel & Cobalt )
Mode      ( ● Dark   ○ Light   ○ Match system )
```
- Palette is a row of three **swatch cards** (140×88): five stacked bands (bg · panel · raised · line · ink) with the accent as a dot and the palette's display face rendering its own name ("MOSS & IRON" in Barlow caps; "Brass & Slate" and "Steel & Cobalt" in Satoshi Black). Selected card gets a 2px `--v-accent` ring. Below each: one line — Moss & Iron "The armory · default"; Brass & Slate "Warm graphite; light mode is Felt & Cream"; Steel & Cobalt "The forge; cobalt and cyan".
- Mode is a 3-segment control under it. Changing either applies instantly (no Save), persists to the account, and animates via a 200ms crossfade of `#matrix-v2` opacity .85→1.
- Global menu › Appearance shows the same two rows compactly (palette names as radio items, then Dark / Light / System).
- Settings › Appearance also keeps "Card size" (slider, 60–160%, Play) and "Reduce motion" (toggle) as today.

## Palette reference (design source)
`design-systems/moss-iron/` and `design-systems/steel-cobalt/` in the handoff carry the full token files, readme (shape/motion/art rules) and specimen cards; `Palette Options.dc.html` boards 3d and 3e are the visual reference. Brass & Slate / Felt & Cream are the root design system.

## Definition of done
- Fresh account with no preference renders Moss & Iron dark; `data-palette` absent still renders Moss & Iron (unscoped fallback block).
- Switching palette recolors every page, dialog, menu, toast, Play surface and the aether mist with no page reload and no leftover literal colors (grep `#[0-9a-f]{6}` in the stylesheets returns only the token blocks).
- Radii, display face, card shadow and motion timing visibly change between palettes (6px caps-condensed / 12px serif-hero / 4px machined).
- Mode = Match system follows OS changes live.
- Old `preferences.theme` values migrate silently.
