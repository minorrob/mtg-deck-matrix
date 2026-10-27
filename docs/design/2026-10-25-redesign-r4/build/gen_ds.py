"""Writes the Design System artifact's files (project/...) from the same spec and components as the pack."""
import os as _os
from pathlib import Path as _P
PACK = str(_P(__file__).resolve().parents[1]) + '/'
REPO = _os.environ.get('CM_REPO', str(_P(__file__).resolve().parents[4])) + '/'
SCRATCH = _os.environ.get('CM_SCRATCH', '/tmp/cm-r4') + '/'
import json, os, re, shutil, datetime
from spec import full, SKINS
from gen_tokens import COLOR_TOKENS, STATUS, MANA, TYPE, SHAPE, TABLE
from glyphs import svg
import ui
S = PACK
OUT = SCRATCH + 'ds/project/'
BLOB = {'reference': '/_blob/65e8f9bd0d5b28fed7a2c2842723171f', 'logo': '/_blob/fbab4486e4856c1d2985105814a756a9', 'W': '/_blob/7a288c7839e68898815623b26f3d76c3', 'U': '/_blob/2b17b4bdbd2318249c90194e3f9f9a0b',
        'B': '/_blob/e97376e2888e2d39922c02b36f018c1a', 'R': '/_blob/16f2737dce102fa516105a665ac2cdfc', 'G': '/_blob/5ad7eba10def3213b2d2e66b20c20c59',
        '2': '/_blob/507f0526c751d448fbbaefe45086af52', 'krenko': '/_blob/475acd15c262d9251bed350746f059e0', 'chulane': '/_blob/5ae02b9ad871607e0bb5be472f16b756',
        'shadrix': '/_blob/6841a3cc3e5f8835a277f314605625a8', 'tymna': '/_blob/3603f0676034fdc58bf00e52b3a3cd44', 'giada': '/_blob/4b733f0644263f84f48f3f5973e666a2',
        'night-citadel': '/_blob/0a16e2382a20011f218fd85a4ff66b6b', 'ember-serpent': '/_blob/07f3a15c6673f372d33d5c76f0a7334b'}
SIZES = {'reference': 284378, 'logo': 40838, 'W': 3414, 'U': 766, 'B': 2646, 'R': 2664, 'G': 2926, '2': 797, 'krenko': 37144, 'chulane': 28094, 'shadrix': 19240, 'tymna': 128262, 'giada': 36306, 'night-citadel': 92690, 'ember-serpent': 118662}
def w(path, text):
    p = OUT + path; os.makedirs(os.path.dirname(p), exist_ok=True); open(p, 'w').write(text)
if os.path.exists(SCRATCH + 'ds'): shutil.rmtree(SCRATCH + 'ds')

# ---------- tokens.json ----------
THEMES = [('dark', 'Sapphire & Obsidian · dark', 'sapphire-obsidian', 'dark'), ('light', 'Sapphire & Obsidian · light', 'sapphire-obsidian', 'light'),
          ('bronze-dark', 'Bronze & Basalt · dark', 'bronze-basalt', 'dark'), ('bronze-light', 'Bronze & Basalt · light', 'bronze-basalt', 'light'),
          ('chalk-dark', 'Chalk & Coal · dark', 'chalk-coal', 'dark'), ('chalk-light', 'Chalk & Coal · light', 'chalk-coal', 'light')]
PAL = {tid: full(skin, reg) for tid, _, skin, reg in THEMES}
colors = []
for t, k, usage in COLOR_TOKENS:
    colors.append({'name': t[2:], 'value': {tid: PAL[tid][k] for tid, *_ in THEMES}, 'usage': usage})
for m in 'WUBRG':
    colors.append({'name': f'mana-{m}', 'value': {tid: MANA[reg][m] for tid, _, _, reg in THEMES}, 'usage': f'Tint for decks whose identity includes {m}; mix 22% into the panel. Never text.'})
for t, k, fam, word, usage in STATUS:
    colors.append({'name': t[2:], 'value': {tid: PAL[tid][k] for tid, *_ in THEMES}, 'usage': f'{word}. {usage} Family: {fam}. Always with its word or glyph.'})
for t, v in [('surface-page', 'color-bg'), ('surface-card', 'color-panel'), ('surface-control', 'color-raised'), ('border-default', 'color-line'), ('action-primary', 'color-accent'), ('action-primary-text', 'color-on-accent')]:
    colors.append({'name': t, 'value': '{' + v + '}', 'usage': f'Alias of {v}, kept for the app\'s older names.'})
for t, v, u in TABLE:
    if t in ('--font-callout', '--tray', '--focus-ring', '--table-grain', '--table-felt-nap'): continue
    if t == '--table-light': v = 'rgba(255,184,108,0.20)'
    if t == '--table-shade': v = 'rgba(12,6,2,0.88)'
    if t == '--focus-halo': v = '{table-ink}'
    if t == '--mat-scrim': v = 'rgba(0,0,0,0.8)'
    colors.append({'name': t[2:], 'value': v, 'usage': (u or 'The table: fixed in every skin and register.') + ('' if 'fixed' in (u or '') else ' Fixed in every skin.')})
shadow_pop = {tid: f"0 0 0 1px {PAL[tid]['line']}, 0 18px 48px -20px rgba(0,0,0,0.55)" for tid, *_ in THEMES}
fonts = [{'family': 'Cinzel', 'file': 'fonts/cinzel-600.woff2', 'weight': '600'}, {'family': 'Lato', 'file': 'fonts/lato-400.woff2', 'weight': '400'},
         {'family': 'Lato', 'file': 'fonts/lato-700.woff2', 'weight': '700'}, {'family': 'Barlow Condensed', 'file': 'fonts/barlowcondensed-800.woff2', 'weight': '800'}]
type_ = {'fonts': fonts,
  'families': {'display': 'Cinzel, "Trajan Pro", Georgia, serif', 'body': 'Lato, system-ui, sans-serif', 'hero': 'Cinzel, "Trajan Pro", Georgia, serif', 'callout': '"Barlow Condensed", Lato, sans-serif', 'wordmark': 'Cinzel, "Trajan Pro", Georgia, serif'},
  'groups': [
    {'name': 'Display', 'family': 'display', 'styles': [
      {'name': 'wordmark', 'family': 'wordmark', 'fontSize': '16px', 'lineHeight': 1.02, 'fontWeight': 600, 'letterSpacing': '0.08em', 'sample': 'CRANKMAGIC', 'usage': 'The app name only (Rob, 2026-10-26): CrankMagic in Cinzel 600 capitals at .08em, in color-brand gilt, beside the gear logo (cm-wordmark).'},
      {'name': 'hero', 'family': 'hero', 'fontSize': '56px', 'lineHeight': 1.08, 'fontWeight': 600, 'letterSpacing': '0.02em', 'sample': 'Krenko, Mob Boss', 'usage': 'Cinzel: the deck title and the landing headline. Token --text-hero clamps it to 36px at 390. Sentence case sets as capitals and small capitals.'},
      {'name': 'h1', 'fontSize': '40px', 'lineHeight': 1.05, 'fontWeight': 600, 'letterSpacing': '0.04em', 'sample': 'Decks', 'usage': 'Every page title, in Cinzel. Token --text-h1 clamps it from 30px at 390 to 40px at 1440; no rule restates the size.'}]},
    {'name': 'Text', 'family': 'body', 'styles': [
      {'name': 'h2', 'fontSize': '24px', 'lineHeight': 1.2, 'fontWeight': 700, 'letterSpacing': '-0.005em', 'sample': 'The hundred', 'usage': 'Section and dialog titles; the task in a decision ("Choose up to two players to mill").'},
      {'name': 'h3', 'fontSize': '18px', 'lineHeight': 1.25, 'fontWeight': 700, 'sample': 'Mana curve', 'usage': 'Panel titles.'},
      {'name': 'section', 'fontSize': '14px', 'lineHeight': 1, 'fontWeight': 700, 'letterSpacing': '0.14em', 'sample': 'ACTIONS', 'usage': 'Drawer and panel section titles: spaced capitals with a 16px icon (cm-section-title).'},
      {'name': 'figure', 'fontSize': '32px', 'lineHeight': 1, 'fontWeight': 700, 'letterSpacing': '-0.01em', 'sample': '$57.33', 'usage': 'Big figures, tabular numerals. Money figures in color-money.'},
      {'name': 'reading', 'fontSize': '16px', 'lineHeight': 1.6, 'fontWeight': 400, 'sample': 'Angels come down cheap and grow each other.', 'usage': 'Reading surfaces: deck guide, help, how it plays. Max 68ch.'},
      {'name': 'body', 'fontSize': '14px', 'lineHeight': 1.5, 'fontWeight': 400, 'sample': 'Lock the list when it is settled.', 'usage': 'UI body. The floor for anything a player reads.'},
      {'name': 'control', 'fontSize': '14px', 'lineHeight': 1, 'fontWeight': 700, 'sample': 'Log a game', 'usage': 'Button and chip labels.'},
      {'name': 'small', 'fontSize': '13px', 'lineHeight': 1.4, 'fontWeight': 400, 'sample': '100 in the box · Bracket 3', 'usage': 'Captions and meta lines, in color-muted.'},
      {'name': 'label', 'fontSize': '12px', 'lineHeight': 1.2, 'fontWeight': 700, 'letterSpacing': '0.12em', 'sample': 'PROGRESS', 'usage': 'Uppercase labels and eyebrows. The smallest size anywhere; legal footers too.'}]},
    {'name': 'Play HUD', 'family': 'body', 'styles': [
      {'name': 'hud-vital', 'fontSize': '28px', 'lineHeight': 1, 'fontWeight': 700, 'sample': '40', 'usage': 'Life, poison, turn. Times --hud-scale (1, 1.25, 1.5, 2).'},
      {'name': 'hud', 'fontSize': '18px', 'lineHeight': 1.25, 'fontWeight': 700, 'sample': 'Choose an action', 'usage': 'HUD text and the decision prompt. Times --hud-scale.'},
      {'name': 'hud-caption', 'fontSize': '15px', 'lineHeight': 1.2, 'fontWeight': 700, 'sample': 'Library 92', 'usage': 'Zone captions on the board. Times --hud-scale.'},
      {'name': 'callout', 'family': 'callout', 'fontSize': '48px', 'lineHeight': 1, 'fontWeight': 800, 'fontStyle': 'italic', 'sample': 'Your turn', 'usage': 'The neon callout word over the table, with a callout light. The one expressive face; never page type.'}]},
  ]}
tokens = {'name': 'CrankMagic', 'version': 4,
  'color': {'themes': [{'id': tid, 'name': n} for tid, n, *_ in THEMES], 'tokens': colors},
  'type': type_,
  'spacing': {'tokens': [{'name': t[2:], 'value': v, 'usage': u} for (t, v), u in zip([s for s in SHAPE if s[0].startswith('--space')], ['Icon to label gap.', 'Inside chips; gap in button rows.', 'Gap between related controls; row padding.', 'Panel padding on phones; gap between tiles on phones.', 'Panel padding.', 'Dialog body padding; gap between sections.', 'Page gutters at 1440.', 'Space above a page section.', 'Space above a page.'])]},
  'radius': {'tokens': [{'name': 'radius-control', 'value': '8px', 'usage': 'Buttons, inputs, segmented controls, menu items.'}, {'name': 'radius-card', 'value': '12px', 'usage': 'Panels, dialogs, menus, toasts.'},
                        {'name': 'radius-tile', 'value': '16px', 'usage': 'Deck tiles.'}, {'name': 'radius-pill', 'value': '999px', 'usage': 'Status chips, stage chips, pills, the seat header.'}]},
  'shadow': {'tokens': [{'name': 'shadow-card', 'value': '0 1px 2px rgba(0,0,0,0.10), 0 8px 24px -16px rgba(0,0,0,0.30)', 'usage': 'Panels. Barely shows in dark; the fill carries the plane there.'},
                        {'name': 'shadow-pop', 'value': shadow_pop, 'usage': 'Menus, dialogs, sheets, toasts: a 1px line ring plus a soft drop.'}]},
  'text': {'tokens': [{'name': t[2:], 'value': v, 'usage': u or ''} for t, v, u in TYPE if t.startswith('--text') or t.startswith('--leading') or t in ('--label-tracking', '--hud-scale')]},
  'font': {'tokens': [{'name': t[2:], 'value': v, 'usage': 'The display and hero settings. One value for every skin.'} for t, v, u in TYPE if t.startswith('--display') or t.startswith('--hero') or t.startswith('--heading')]},
  'size': {'tokens': [{'name': t[2:], 'value': v, 'usage': {'--line-width': 'Every line. No hairline under 1px.', '--control-height': 'Primary and secondary buttons.', '--control-height-lg': 'The touch primary.', '--control-height-compact': 'Compact buttons: tile Play it, row actions.', '--field-height': 'Inputs and selects.', '--check-size': 'Checkboxes and radios.', '--focus-width': 'Focus ring width, aether.', '--focus-offset': 'Focus ring offset.', '--card-ratio': 'A Magic card.'}.get(t, '')} for t, v in SHAPE if t in ('--line-width', '--control-height', '--control-height-lg', '--control-height-compact', '--field-height', '--check-size', '--focus-width', '--focus-offset', '--card-ratio')]},
}
w('tokens.json', json.dumps(tokens, indent=1))

# ---------- fonts ----------
os.makedirs(OUT + 'fonts', exist_ok=True)
for f in ['cinzel-600.woff2', 'lato-400.woff2', 'lato-700.woff2', 'barlowcondensed-800.woff2']:
    shutil.copy(S + 'project/assets/fonts/' + f, OUT + 'fonts/' + f)

# ---------- bundle.css ----------
css = open(S + 'project/components.css').read()
bundle = ("/* CrankMagic r4 components. Tokens come from tokens.json; this sheet only reads them, plus the motion it may declare. */\n"
          ":root{--motion-fast:160ms;--motion-slow:280ms;--motion-ease:cubic-bezier(.2,.8,.2,1)}\n"
          "/* The Study's two textures, drawn from noise: walnut grain and felt nap. Declared here because they are images, not colors. */\n"
          ":root{" + ''.join(f"{tk}:{tv};" for tk, tv, _ in TABLE if tk in ('--table-grain', '--table-felt-nap')) + "}\n" + css.split('*/', 1)[1])
bundle = bundle.replace('var(--poster-ink,#f3f1ee)', 'var(--poster-ink)')
w('components/bundle.css', bundle)

# ---------- previews ----------
def fix(html):
    html = re.sub(r'ROOT/assets/art/([\w-]+)\.webp', lambda m: BLOB[m.group(1)], html)
    html = re.sub(r'ROOT/assets/mana/(\w)\.svg', lambda m: BLOB[m.group(1)], html)
    html = re.sub(r'ROOT/assets/mats/([\w-]+)\.webp', lambda m: BLOB[m.group(1)], html)
    return html
def preview(comp, group, height, body, subtitle='', pad=20, bg='var(--color-bg)'):
    sub = f' subtitle="{subtitle}"' if subtitle else ''
    html = (f'<!-- @dsCard group="{group}" height={height}{sub} -->\n<!doctype html>\n<html><head><meta charset="utf-8"><title>{comp}</title>'
            f'<style>html,body{{margin:0;background:{bg}}}.stage{{padding:{pad}px;display:grid;gap:16px}}.lab{{font:700 12px/1.2 Lato,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--color-muted)}}'
            f'.grid5{{display:grid;grid-template-columns:96px repeat(6,minmax(0,1fr));gap:12px;align-items:center}}.row{{display:flex;flex-wrap:wrap;gap:12px;align-items:center}}</style></head>\n'
            f'<body><div class="cm stage">{fix(body)}</div>\n<script>document.documentElement.style.colorScheme=/light/.test(document.documentElement.dataset.theme||"")?"light":"dark"</script>\n</body></html>\n')
    assert len(html) < 250_000, comp
    w(f'components/{comp}/preview.html', html)
def readme(comp, text): w(f'components/{comp}/README.md', text.strip() + '\n')
U = ui
STL = ['rest', 'hover', 'focus', 'active', 'disabled', 'selected']
# Button
g = '<div class="grid5"><span></span>' + ''.join(f'<span class="lab">{s}</span>' for s in STL)
for kind, lbl, label in [('primary', 'Primary', 'Buy list · 13'), ('', 'Secondary', 'Log a game'), ('quiet', 'Quiet', 'Clear'), ('danger', 'Danger', 'Delete deck')]:
    g += f'<span class="lab">{lbl}</span>' + ''.join((U.btn(label, kind, s) if not (s == 'selected' and kind) else '<span class="lab">·</span>') for s in STL)
g += '<span class="lab">Compact</span>' + ''.join(U.btn('Play it', '', s, icon='play', size='compact') for s in STL) + '</div>'
g += f'<div class="row">{U.btn("Confirm delete","danger-fill")}{U.btn("Start","primary",icon="play",size="lg")}{U.btn("","",icon="more",size="icon",extra=" aria-label=More title=More")}<span style="padding:8px;border-radius:12px;background:url(ROOT/assets/art/krenko.webp) center/cover">{U.btn("Play it","on-art",icon="play",size="compact")}</span></div>'
preview('Button', 'Actions', 360, g, 'Primary, secondary, quiet, danger, compact; every state')
readme('Button', """
The button family: one primary per screen in the accent, everything else secondary, quiet or danger.

- **Provide** a verb label, with its count when there is one ("Buy list · 13"); an icon only beside a word, or alone with an `aria-label` and a tooltip.
- **Primary** (`cm-btn cm-btn--primary`): `color-accent` fill, `color-on-accent` words, 40px. One per screen, for the next stage of the journey. 44px (`cm-btn--lg`) when it is the touch primary.
- **Secondary** (`cm-btn`): `color-raised` fill, `color-line-strong` edge. **Quiet** (`cm-btn--quiet`): no fill until hover (`color-hover`). **Danger** (`cm-btn--danger`): `color-required` words and edge; the filled `cm-btn--danger-fill` only inside a confirm dialog.
- **Compact** (`cm-btn--compact`): 32px, for tile Play it and row actions. Over commander art add `cm-btn--on-art`, which keeps the fixed poster pair in every skin.
- **States**: hover shifts the fill, focus visible is the 2px `color-aether` ring 2px out, active darkens, disabled drops to `color-faint` on no fill, selected (`aria-pressed="true"`) inverts to `color-ink`. Selected is never the accent.
- Do not put two primaries on a screen, and do not use the accent for Bought, Ready or any other state. In the app this is `.v-button` and `.v-button.primary`.
""")
# StatusChip
body = '<div class="row">' + ''.join(U.status(s) for s in ['inbox', 'physical', 'pull', 'reserved', 'ordered', 'buy', 'standin', 'remove', 'watch', 'draft']) + '</div>'
body += '<div style="display:grid;gap:8px;max-width:640px">' + U.bar([("inbox", 38), ("pull", 22), ("ordered", 12), ("standin", 6), ("buy", 22)]) + '<span class="cm-small">38 in box · 22 pull · 12 ordered · 6 stand-in · 22 to buy</span></div>'
body += f'<div class="row"><span class="cm-pill">Goblin tribal</span><span class="cm-pill cm-pill--outline">Bracket 3</span><span class="cm-count">46</span></div>'
body += f'<div style="padding:12px;border-radius:12px;background:url(ROOT/assets/art/chulane.webp) center/cover" class="row">{U.status("inbox","Boxed",True)}{U.status("buy","12 to buy",True)}{U.status("ordered","1 ordered",True)}</div>'
body += '<div style="filter:grayscale(1)" class="row">' + ''.join(U.status(s) for s in ['inbox', 'pull', 'ordered', 'buy', 'standin', 'remove', 'watch']) + '<span class="lab">grayscale check</span></div>'
preview('StatusChip', 'Status', 320, body, 'Ten rungs, four families, a glyph on each')
readme('StatusChip', """
A status chip says where a card is: a glyph, a word and a hue, so it never relies on color alone.

- **Provide** the rung (`data-st`: inbox, physical, pull, reserved, ordered, buy, standin, remove, watch, draft) and its word. The glyph comes with the rung.
- Four hue families plus gray: owned (`st-inbox`, `st-physical`, and the lighter `st-pull`, `st-reserved`), coming (`st-ordered`), needed (`st-buy`, and the hatched `st-standin`), out (`st-remove`), intent (`st-watch`, `st-draft`). Inside a family the rungs differ by lightness and glyph.
- The chip sits on `color-raised` with `color-ink` words; only the glyph takes the rung's hue. Over art use `cm-status--on-art`.
- The segmented bar (`cm-bar`) takes the same rungs in a fixed order: in box, pull, ordered, stand-in, to buy. Give it an `aria-label` with the counts and print the counts beside it.
- A deck's stage chip on a tile takes the family of what the deck still needs (Boxed is owned, Defined with cards to buy is needed).
- In the app this is `.cm-pill` with its status dot.
""")
# StageChips
body = '<div class="cm-chips">' + U.chip('All', 6, 'selected') + U.chip('Boxed', 5) + U.chip('Defined', 1, 'hover') + U.chip('Building', 0, 'focus') + U.chip('Playable', 6) + U.chip('Shared', 0, 'disabled') + '</div>'
body += '<span class="cm-small">All selected · Defined hovered · Building focused · Shared disabled</span>'
preview('StageChips', 'Navigation', 140, body, 'All, Boxed, Defined, Building, Playable, Shared')
readme('StageChips', """
The filter row over the Decks hub: one chip per deck stage, with its count.

- **Provide** the six stages in this order: All, Boxed, Defined, Building, Playable, Shared, each with its count; one is selected.
- 36px pills with a `color-line-strong` edge (44px on touch). The selected chip inverts to `color-ink` with `color-bg` words, never the accent, so the page's one primary stays the only accent.
- A stage with nothing in it stays enabled and shows 0; disable a chip only when the stage cannot apply (Shared on a copy without sharing).
- On phones the row scrolls sideways; it does not wrap.
""")
# DeckTile
def T(**k):
    base = dict(name='Krenko, Mob Boss', eyebrow='D6 · Krenko', tags='Goblin tribal · Tokens · Sacrifice', art='krenko', st='inbox', st_word='Boxed', parts=[('inbox', 100)], meta_l='100 in the box', meta_r='B3', colors=['R'], root='ROOT')
    base.update(k); return U.tile(**base)
body = '<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px">' + \
    f'<div style="display:grid;gap:6px"><span class="lab">Rest · favorite</span>{T(fav=True)}</div>' + \
    f'<div style="display:grid;gap:6px"><span class="lab">Hover</span>{T(state="hover",name="Chulane, Teller of Tales",eyebrow="D2 · Chulane",art="chulane",colors=["G","W","U"],tags="Landfall · Ramp · Blink")}</div>' + \
    f'<div style="display:grid;gap:6px"><span class="lab">Focus</span>{T(state="focus",name="Shadrix Silverquill",eyebrow="D5 · Shadrix",art="shadrix",colors=["W","B"],tags="Counters · Drain and burn")}</div>' + \
    f'<div style="display:grid;gap:6px"><span class="lab">Selected</span>{T(state="selected",name="Tymna + Kraum",eyebrow="D1 · Tymna + Kraum",art="tymna",colors=["W","B","U","R"],st="buy",st_word="12 to buy",parts=[("inbox",41),("pull",47),("buy",12)],meta_l="41 in · 47 to pull",ready="Stand-ins in",tags="Draw · Lifegain")}</div></div>'
preview('DeckTile', 'Decks', 460, body, 'Rest, hover, focus visible, selected for bulk')
readme('DeckTile', """
A deck on the Decks hub: the commander's art full bleed, the deck's name, where its cards are, and Play it.

- **Provide** the commander art (Scryfall art crop), the deck number and short name for the eyebrow, the deck name, up to three strategy tags, the rung counts for the bar, the bracket, the stage, and the identity colors for the pips.
- 3:4, `radius-tile`, the art under a gradient that ends at `poster-ground`. Every word and chip on it uses the fixed poster pair (`poster-ink`, the on-art chips and bar), because the art does not change with the skin.
- The top row is the stage pill, then the favorite star beside it (Rob, 2026-10-26), then the pips at the right. A favorite's filled star always shows, in ink; an outline star shows on hover or focus. In the app it is a toggle button (`aria-pressed`).
- The tick and the deck menu wait at the right, under the pips, and show on hover, focus or when ticked. Nothing on the tile moves to make room.
- Hover lifts 3px with a shadow; focus visible is the aether ring 3px out; selected for bulk rings it in `color-ink` and ticks its checkbox.
- The New deck tile is the same size, dashed `color-line-strong`, no art.
- On phones two tiles a row; the tags, the meta line and Play it drop, the name, stage and bar stay.
""")
# TableRow
head_ = '<div class="cm-rowhead cm-label"><span>Qty</span><span>Card</span><span>Cost</span><span style="text-align:right">Price</span><span>Status</span><span>Action</span><span></span></div>'
rows = (U.row(1, 'Access Tunnel', [], '$0.56', 'pull', 'Put it in the box', root='ROOT') + U.row(1, 'Emeria, the Sky Ruin', ['W'], '$7.20', 'pull', 'Put it in the box', root='ROOT', state='hover')
        + U.row(1, 'Evolving Wilds', [], '$0.26', 'ordered', 'Mark arrived', root='ROOT', state='focus') + U.row(1, 'Cathar Commando', ['W'], '$0.23', 'buy', 'Buy', root='ROOT', state='selected')
        + U.row(1, 'Grateful Apparition', ['W'], '$0.37', 'standin', 'Swap in real', root='ROOT') + U.row(1, 'Selfless Spirit', ['W'], '$0.41', 'remove', 'Take it out', root='ROOT', action_kind='danger')
        + U.row(32, 'Plains', [], '$0.09', 'inbox', 'In the box', root='ROOT', state='disabled'))
body = f'<div class="cm-panel" style="padding:4px 8px"><div class="cm-group"><h3>Loading</h3><span class="cm-count">53</span><span class="cm-small">Owned, not in the box yet</span></div>{head_}<div class="cm-rows" role="table">{rows}</div></div>'
preview('TableRow', 'Decks', 470, body, 'Rest, hover, focus, selected, stand-in, danger, disabled')
readme('TableRow', """
A card in a list (The hundred, the buy list, the pull sheet) with its trailing action and overflow menu.

- **Provide** quantity, card name, mana cost pips, price, the status rung, one trailing action named as a verb, and the overflow menu's items.
- 48px, a 1px `color-line` below; price in `color-money`, tabular. The trailing action is a compact secondary button; the overflow is a 32px quiet icon button with a name and a tooltip.
- Hover fills `color-hover`; focus visible rings the row in aether; selected tints it `color-accent-soft` (ink still reads at well over 7:1); a remove row's action is the danger button; disabled drops to `color-faint`.
- Group rows under an h3 with a count and a one-line caption ("Loading 53 · Owned, not in the box yet").
- On phones the pips and the action button drop to the overflow menu, and the status shows its glyph with the word kept for screen readers.
""")
# FormControls
body = ('<div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:16px">' + U.field('Deck name', 'Krenko Goblins') + U.field('Search', '', state='hover', placeholder="A commander's name")
        + U.field('Budget', '225', state='focus', hint='Only informs.') + U.field('Bracket', '', state='danger', err='Pick a bracket from 1 to 5.') + U.field('Seats', '4', state='disabled') + '</div>'
        + '<div class="row" style="gap:20px">' + U.check('Show archived') + U.check('Bought', checked=True) + U.check('Hover', 'hover') + U.check('Focus', 'focus') + U.check('Required', 'danger') + U.check('Disabled', 'disabled') + '</div>'
        + '<div class="row" style="gap:20px">' + U.check('Bracket 2', radio=True) + U.check('Bracket 3', radio=True, checked=True) + U.check('Focus', state='focus', radio=True) + U.check('Disabled', state='disabled', radio=True) + '</div>'
        + '<div class="row">' + U.seg(['Table', 'Focus', '3D'], 2) + U.seg(['Dark', 'Light', 'System'], 0, {1: 'hover'}) + U.seg(['Grid', 'List'], 0, {1: 'disabled'}) + '<select class="cm-select" style="width:220px" aria-label="Sort"><option>Closest to finished</option></select></div>')
preview('FormControls', 'Forms', 330, body, 'Inputs, checkboxes, radios, segmented control, select')
readme('FormControls', """
Everything you type into or tick: inputs, selects, checkboxes, radios and the segmented control.

- **Provide** a visible label for every field, a hint when the field needs one, and an error that says how to fix it.
- Inputs and selects are 42px with a 1px `color-field-line` edge (3:1 or better on panel and raised in every skin). Hover darkens the edge to `color-muted`; focus visible draws the aether ring at the edge.
- Errors sit under the field, with the alert glyph, in `color-required`, and the field's edge turns `color-required`. Never only a dot on a tab.
- Checkboxes and radios are 20px. Checked inverts to `color-ink`, not the accent. A required box that was missed takes the `color-required` edge.
- The segmented control's chosen segment inverts to `color-ink`. Use it for two to four views of the same thing (Table, Focus, 3D).
""")
# Tabs
items = [('Overview', None), ('The hundred', 100), ('Upgrades', None), ('Explore', None), ('Acquire', 46)]
body = U.tabs(items, 1) + U.tabs(items, 0, {2: 'hover', 3: 'focus', 4: 'disabled'}) + '<span class="cm-small">Top: The hundred selected. Bottom: Upgrades hovered, Explore focused, Acquire disabled.</span>'
preview('Tabs', 'Navigation', 170, body, 'The deck page tabs in every state')
readme('Tabs', """
Tabs switch views of one deck: Overview, The hundred, Upgrades, Explore, Acquire.

- **Provide** the tab labels, an optional count per tab, and the selected tab.
- 44px tabs on a `color-line-strong` rule. The selected tab has `color-ink` words and a 3px ink bar; the rest are `color-muted` and turn ink on hover. Counts ride in a muted pill.
- Not the accent: the deck page's primary stays the only accent on the screen.
- On phones the row scrolls sideways.
""")
# Dialog
dbody = (f'<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">{U.field("Deck name","Krenko Goblins")}{U.field("Budget","225",hint="Only informs; nothing is refused for money.")}</div>'
         f'<div class="cm-field"><span class="lbl">Bracket</span><div class="row" style="gap:18px">{U.check("2 Core",radio=True)}{U.check("3 Upgraded",radio=True,checked=True)}{U.check("4 Optimized",radio=True)}</div></div>'
         f'<div class="cm-field"><span class="lbl">Seats at the table</span>{U.seg(["2","3","4"],2)}</div>')
body = (f'<div style="position:relative;height:500px;display:grid;place-items:center;background:url(ROOT/assets/art/krenko.webp) center/cover;border-radius:12px;overflow:hidden"><div class="cm-scrim"></div>'
        f'<div class="cm-dialog" role="dialog" aria-labelledby="t" style="height:440px"><div class="cm-dialog__head"><h2 id="t">Define the deck</h2><span class="cm-small">Step 2 of 4</span>{U.btn("","quiet",icon="x",size="icon",extra=" aria-label=Close")}</div>'
        f'<div class="cm-dialog__body">{dbody}</div><div class="cm-dialog__foot"><span class="lead">Saved as you go</span>{U.btn("Back")}{U.btn("Next: cards","primary")}</div></div></div>')
preview('Dialog', 'Surfaces', 540, body, '900px shell, sticky title, one primary bottom right')
readme('Dialog', """
The dialog shell: a sticky title, a scrolling body and a sticky footer with the one primary bottom right.

- **Provide** a title, the body, the secondary actions and exactly one primary. A destructive confirm swaps the primary for `cm-btn--danger-fill` and names what will happen ("Delete Krenko Goblins").
- At most 900px wide and 720px tall, `radius-card`, `shadow-pop`, on a `color-bg` scrim. The head is 64px with the close button at its end; the foot holds a muted lead line on the left and the buttons on the right, secondary before primary.
- Escape closes, Enter confirms the primary, focus starts on the first field and returns to the control that opened it.
""")
# Toast
body = U.toast_ok('Auto-created 99 cards for Giada deck') + U.toast_err('Sharing is not on for this copy yet. Nothing was sent.')
preview('Toast', 'Feedback', 170, body, 'Success with Undo, error with dismiss')
readme('Toast', """
A toast answers an action that has no place on the page to answer it.

- **Provide** one sentence that says what happened, and Undo when the action can be undone.
- Success inverts to `color-ink` with `color-bg` words, a check glyph and Undo; it stays while Undo applies. Errors sit on `color-panel` with a `color-required` edge and alert glyph, offer dismiss, and never time out.
- Prefer an inline change at the point of action (G2); use a toast when the result lands somewhere else. Bottom center, above the content, one at a time.
""")
# SideSheet
sbody = (f'<div style="position:relative;height:460px;background:var(--color-bg);border-radius:12px;overflow:hidden;border:1px solid var(--color-line)"><div style="padding:24px;opacity:.45"><h1 class="cm-h1">Library</h1></div>'
         f'<div class="cm-sheet" role="dialog" aria-label="Filters"><div class="cm-sheet__head"><h2>Filters</h2>{U.btn("","quiet",icon="x",size="icon",extra=" aria-label=Close")}</div>'
         f'<div class="cm-sheet__body">{U.field("Card name","",placeholder="Any card")}<div class="cm-field"><span class="lbl">Where it is</span><div style="display:grid;gap:4px">{U.check("In a box",checked=True)}{U.check("Ordered")}{U.check("To buy",checked=True)}</div></div></div>'
         f'<div class="cm-sheet__foot">{U.btn("Clear","quiet")}{U.btn("Show 46 cards","primary")}</div></div></div>')
preview('SideSheet', 'Surfaces', 500, sbody, '420px, same head and foot as the dialog')
readme('SideSheet', """
A side sheet holds filters or details beside the page instead of over it.

- **Provide** a title, the body and the footer actions (one primary, bottom right).
- 420px from the right edge (full width on phones), `color-panel`, a `color-line-strong` edge on its left, `shadow-pop`. Head and foot match the dialog.
- The page behind stays readable and scrollable; Escape closes the sheet.
""")
# AccountMenu
preview('AccountMenu', 'Surfaces', 980, f'<div class="row" style="align-items:flex-start">{U.account_menu(hover="Settings")}</div>', 'Grouped sections and a danger group')
readme('AccountMenu', """
The account menu from the rail: who you are, this device, your data, the skin, help, and the one dangerous item.

- **Provide** the account name and sync state, and the items for each group: You (Profile, Invite, Settings), This device (Sync now, Reload), Your data (Save a backup, Restore), Skin (the three skins and a Dark, Light, System control), Help (Help and glossary, Take a tour, Send feedback, Show a QR code), Careful (Reset all data), then Sign out on its own.
- 300px, `color-panel`, `radius-card`, `shadow-pop`; each group under a 12px uppercase label in `color-muted` and a 1px `color-line` above it. Items are 40px with a 16px icon.
- The Careful group is in `color-required` and its item opens a confirm; it never acts on one click.
- The chosen skin carries a dot; the Dark, Light, System control is the segmented control.
""")
# Play components
def board(inner, mat='night-citadel', h=260):
    return f'<div style="position:relative;min-height:{h}px;border-radius:12px;overflow:hidden;background:#101014 url(ROOT/assets/mats/{mat}.webp) center/cover;padding:18px;display:grid;gap:14px;align-content:start">{inner}</div>'
body = board(U.seat('Rob', 'Krenko, Mob Boss', 40, 0, 7, 'Your turn', turn=True, priority=True, portrait='ROOT/assets/art/krenko.webp') + U.seat('AI · Normal', 'Chulane, Teller of Tales', 38, 0, 6, 'Waiting', portrait='ROOT/assets/art/chulane.webp') + U.seat('Rob', 'Krenko, Mob Boss', 9, 3, 4, 'Deciding', turn=True, danger=True, stack=True), 'night-citadel', 300)
preview('SeatHeader', 'Play', 340, body, 'One seat header for 3D, Table and Focus', pad=12)
readme('SeatHeader', """
One seat header for every Play view: who sits there, their vitals, and what they are doing.

- **Provide** the seat name, the commander, life, poison, hand count, a state word (Your turn, Deciding, Waiting) and whether this seat has the turn or priority.
- One scrim pill (`mat-scrim`), no panel, so the board stays open. Life is the display face at `text-hud-vital` times `--hud-scale`; the rest at `text-hud` and `text-hud-caption`.
- The portrait is the commander's art in a `table-brass` ring (`cm-portrait`); without art, a disc with the initial. Whose turn: an aether ring on the portrait. Priority: the state chip takes an aether dot. Low life: the life figure turns the harm red and the word "life" stays.
- `cm-seat--stack` is the two-row form for corners (the 3D view's bottom left, the opponent's top left).
""")
body = board('<div style="display:grid;justify-items:center;gap:16px">' + U.phases('Main 1') + U.decide('Choose an action', 'Select one to review it. Nothing happens until you confirm.', ['Play Mountain ×2', 'Play Path of Ancestry', 'Cast Goblin Matron'], sel='Play Mountain ×2') + '</div>', 'ember-serpent', 330)
preview('DecisionSlot', 'Play', 370, body, 'The one place every choice lands', pad=12)
readme('DecisionSlot', """
The center decision slot: every choice the game asks for lands here, top center, in every view.

- **Provide** the question, one line of help, the choices, and the step forward (primary) with its alternative.
- A dark glass card with a light edge over the table. Choices are secondary buttons; the chosen one inverts to white. The step forward is the one accent on the board.
- Nothing is submitted until the primary is pressed. The phase strip sits above it and names the current step.
- Sizes multiply by `--hud-scale`, like the rest of the HUD.
""")
body = '<div style="display:grid;gap:10px">' + ''.join(board(f'<div style="--hud-scale:{s};display:grid;gap:6px"><span class="cm-pill" style="justify-self:start">HUD text {int(s*100)}%</span>' + U.seat('Rob', 'Krenko, Mob Boss', 40, 0, 7, 'Your turn', turn=True) + '</div>', 'night-citadel', 0) for s in (1, 1.25, 1.5, 2)) + '</div>'
preview('HudScale', 'Play', 620, body, '100, 125, 150 and 200 percent', pad=12)
readme('HudScale', """
The HUD text setting scales every word on the board together: seat headers, the decision slot, the phase strip and the callouts.

- **Provide** the setting's value on the board root as `--hud-scale`: 1, 1.25, 1.5 or 2. Every HUD size is a base token times that number, set where the size is used, so nothing else needs to change.
- At 100%: vitals 28px, HUD text 18px, captions 15px. At 200%: 56, 36 and 30.
- The setting lives in the Camera menu and in Settings, and follows the account.
""")
preview('CameraMenu', 'Play', 470, f'<div class="row" style="align-items:flex-start">{U.camera(2, 1)}</div>', 'View, tilt, zoom, card size, HUD text, table')
readme('CameraMenu', """
The Camera menu is the same in the 3D, Table and Focus views.

- **Provide** the current view, tilt, zoom, card size, HUD text scale and table design.
- View is a segmented control (Table, Focus, 3D), so the current view is always named. HUD text is a segmented control (100, 125, 150, 200). Sliders show their value beside the label.
- 320px, `color-panel`, `radius-card`, `shadow-pop`; it opens from the Camera button at the top right of the board.
""")
body = board('<div style="display:grid;place-items:center;height:200px;gap:10px"><span class="cm-hud"><span class="cm-neon cm-neon--answer">Your turn</span></span><span class="cm-hud"><span class="cm-neon cm-neon--harm" style="font-size:calc(30px * var(--hud-scale))">Krenko attacks you · 6</span></span></div>', 'night-citadel', 230)
preview('NeonCallout', 'Play', 270, body, 'The one expressive element', pad=12)
readme('NeonCallout', """
A neon callout is a light over the table for a moment that matters: your turn, an attack on you, a big swing.

- **Provide** a few words and the callout light: `callout-answer` (your turn, an answer), `callout-harm`, `callout-growth`, `callout-value`, `callout-fade`.
- Barlow Condensed 800 italic, the table's one expressive face, with a glow in the callout light. Fixed in every skin.
- One at a time, for a second or two; reduced motion shows it without the glow animation. It never replaces the decision slot or the seat header.
""")
AR = 'ROOT/assets/art/'
def study(inner, h=300, pad=18):
    return f'<div class="cm-study" style="position:relative;min-height:{h}px;border-radius:12px;overflow:hidden;padding:{pad}px;display:grid;gap:14px;align-content:start">{inner}</div>'
CHK = '<span class="cm-mat__check">' + svg('check') + '</span>'
mat = lambda s, sel=False: f'<div class="cm-mat{" is-selected" if sel else ""}" style="padding:14px;min-height:120px">{CHK if sel else ""}{s}</div>'
body = study('<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:8px">' + mat(U.seatmini('AI · Normal', 38, AR + 'chulane.webp', 'Chulane'), True) + mat(U.seatmini('Dana', 36, AR + 'giada.webp', 'Giada'))
             + mat(U.seatmini('You · Rob', 40, AR + 'krenko.webp', 'Krenko', turn=True)) + mat(U.seatmini('Sam', 31, AR + 'shadrix.webp', 'Shadrix')) + '</div>', 330, 22)
preview('Study', 'Play', 370, body, 'The table as a place: walnut, lamp light, charcoal felt', pad=12)
readme('Study', """
The Study is the default table: a walnut table under a warm lamp, falling into shadow at its edges, with each seat on charcoal felt.

- `cm-study` on the board root: `table-wood` with `table-grain`, `table-light` over the middle, `table-shade` at the edges. Grain and felt nap are drawn by the browser from noise; there is no image file.
- `cm-mat` for each seat: `table-felt` with `table-felt-nap`, an inset edge and a soft drop. A selected seat (a target) takes a white ring and a check (`is-selected`, `cm-mat__check`): selection is ink, never a color.
- The felt is charcoal on purpose. No mana color owns the table, because players take their commander's colors as their own; a player's chosen mat replaces the Study.
- `cm-seatmini` is the seat as it sits on its mat: the commander's art as a portrait in a brass ring, the player's name, the commander, and life.
""")
drawer_actions = U.dsection('<span class="cm-small">Your spell</span>' + U.pick(AR + 'krenko.webp', "Krenko's Command", 'Instant · you') + '<h2>Choose up to two players to mill</h2>' + U.steps(['Mode', 'Target', 'Review'], 1)
                            + '<span class="cm-small">Selected target</span>' + U.pick(AR + 'chulane.webp', 'Chulane, Teller of Tales', 'AI · 38 life') + U.consequence('If it resolves', 'each target player mills three cards.')
                            + '<div class="cm-decide-actions">' + U.btn('Confirm target', 'primary', icon='check') + U.btn('Change target', icon='reload') + '</div>')
drawer_actions += U.dsection(U.disclosure('Boards', 'seats', U.boardrow(AR + 'krenko.webp', 'You', 40, None, True, '(Rob)') + U.boardrow(AR + 'chulane.webp', 'Chulane', 38, 1) + U.boardrow(AR + 'giada.webp', 'Giada', 36, 0)))
body = (f'<div class="cm-study" style="height:720px;border-radius:12px;overflow:hidden;display:flex;justify-content:space-between">'
        f'<div style="--drawer-w:320px;display:flex">{U.drawer("left", "Actions", drawer_actions, "scroll", did="pv-a")}</div>'
        f'<div style="display:flex;gap:24px;align-items:flex-start;padding:16px">{U.drawer("right", "Stack", "", "stack", collapsed=True, count=1, did="pv-s")}</div></div>')
preview('Drawer', 'Play', 760, body, 'Side panel with a collapse tab: open with the decision, folded with its name', pad=12)
readme('Drawer', """
A side panel that gives the table back. On the Play screen the left drawer holds the decision and the right drawer holds the stack and history.

- **Provide** the side (left, right, or bottom on a phone), the title and its icon, the sections, and whether it is open. Collapsed, also a count (the stack's size).
- The tab rides the drawer's inner edge: a 32px spine, rounded at its outer top corner and cut back into the panel at 45 degrees, with the chevron in a 48px cell at the top. Collapsed, the panel goes and the tab stays at the screen edge with the drawer's name in spaced capitals and the count.
- The chevron is a real button with `aria-expanded` and `aria-controls`; hover fills it with `color-hover`, the focus ring sits inside it, and the chevron turns when the drawer folds.
- A decision is never hidden: when the Actions drawer is folded, the decision shows in `DecisionSlot`.
- Inside, sections are separated by a 1px `color-line`; groups that fold (Boards, History) use `cm-disclosure` with a `cm-section-title`.
- The decision, said plainly: the spell (`cm-pick`), the task as an `h2` sentence, the step (`cm-steps`, the current step inverted to ink), the target (`cm-pick`), what happens if it resolves (`cm-consequence`), then one primary and one way back (`cm-decide-actions`). In the Boards list a seat the decision can reach shows a decision-gold count (`cm-legal`).
""")
print('previews ok')

# ---------- README ----------
t = open(S + 'build/ds_readme.tmpl.md').read()
from colormath import contrast
rows = ['| Theme | Ground | Panel | Ink | Accent | On-accent text |', '|---|---|---|---|---|---|']
for tid, n, skin, reg in THEMES:
    p = PAL[tid]; rows.append(f"| `{tid}` {n} | `{p['bg']}` | `{p['panel']}` | `{p['ink']}` | `{p['accent']}` | {contrast(p['on_accent'], p['accent']):.2f}:1 |")
t = t.replace('{{SKIN_TABLE}}', '\n'.join(rows))
assert '{{' not in t
w('README.md', t)
# asset group READMEs (text files)
w('assets/Brand/README.md', "The CrankMagic gear logo (256px WebP). Full color; use it at 28 to 52px beside the `cm-wordmark`, on any ground. Do not recolor or redraw it.\n")
w('assets/Mana/README.md', "The app's mana symbols (SVG), at their Scryfall hues: W, U, B, R, G and the generic 2. Each symbol carries its own colors; size them at 16px in rows and 18px on tiles. Never recolor them to a skin.\n")
w('assets/Art/README.md', "Sample commander art crops for the previews: Krenko, Mob Boss; Chulane, Teller of Tales; Shadrix Silverquill; Tymna the Weaver; Giada, Font of Hope. Card art is Wizards of the Coast's, from Scryfall, shown under the Fan Content Policy. In the app the art comes from Scryfall at run time.\n")
w('assets/Mats/README.md', "Two of Rob's own playmats (Night Citadel, Ember Serpent), downscaled WebP. A player can choose one in place of the Study, the default walnut table; words over them go on `mat-scrim`.\n")
w('assets/Reference/README.md', "Rob's reference for the feel of the app, 2026-10-25: \"Concept B · Table Companion\", a proposed Play screen on a wooden table. The template takes its type (Cinzel, Lato), its drawer tabs, its room and its voice; it does not take its green, because no mana color owns the frame. The ten principles are in the README under The warm table. Use it as the mood reference for new screens and wireframes.\n")
print('readme ok')

# ---------- Cover ----------
cards = ''
n = 9
for i in range(n):
    ang = -24 + i * 6
    x = 232 + i * 22
    cls = 'top' if i == n - 1 else ('soft' if i % 2 == 0 else 'panel')
    cards += f'<rect class="card {cls}" x="{x}" y="132" width="48" height="67" transform="rotate({ang} {x+24} 260)"/>\n'
cover = f'''<!-- @dsCard height=288 -->
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>CrankMagic</title>
<style>
  html,body{{margin:0;height:100%}}
  body{{background:var(--color-bg);color:var(--color-ink);font-family:var(--font-body);overflow:hidden}}
  .cover{{position:relative;width:960px;height:288px;overflow:hidden}}
  .art{{position:absolute;top:0;left:480px;width:480px;height:288px;overflow:hidden}}
  .art svg{{display:block;width:480px;height:288px}}
  .sapphire{{fill:var(--color-accent);rx:var(--radius-tile)}}
  .stone{{fill:var(--color-line-strong);rx:var(--radius-card)}}
  .gold{{fill:var(--color-money);rx:var(--radius-card)}}
  .aether{{fill:var(--color-aether);rx:var(--space-2)}}
  .card{{rx:var(--radius-control);stroke:var(--color-bg);stroke-width:2}}
  .card.soft{{fill:var(--color-accent-soft)}} .card.panel{{fill:var(--color-panel)}} .card.top{{fill:var(--color-accent)}}
  .words{{position:absolute;left:var(--space-6);bottom:var(--space-6);max-width:440px}}
  .name{{margin:0;font:600 54px/1 var(--font-wordmark);letter-spacing:.08em;text-transform:uppercase;color:var(--color-brand)}}
  .tag{{margin:var(--space-2) 0 0 2px;font-size:14px;line-height:20px;color:var(--color-muted)}}
</style></head>
<body><div class="cover">
<div class="art" aria-hidden="true">
<svg viewBox="0 0 480 288" width="480" height="288">
<!--
  blocks      color-accent (sapphire) 136x190, a 5:7 card slab bled off the top, the biggest block · color-money (gold) 136x82 under it · color-line-strong (iron) 320x208 bled off the right, the stone the hand rests on (color-raised vanished on the light grounds) · color-aether one space-4-tall pill · together about 40% of 960x288
  arrangement one tall card slab with satellites on a space-4 gutter, bottoms on one line space-6 above the edge
  pattern     a literal motif: a fanned hand of nine 5:7 cards (--card-ratio) over the iron, cut with radius-control, in color-accent-soft and color-panel, the top card in color-accent; chosen because CrankMagic is about cards in a hand and a box
  scales      gutters space-4; slab radius-tile, blocks radius-card, cards radius-control, pill rx space-2 (half of space-4); card size 48x67 = 5:7
-->
<rect class="sapphire" x="24" y="-24" width="136" height="190" rx="16"/>
<rect class="gold" x="24" y="182" width="136" height="82" rx="12"/>
<rect class="stone" x="176" y="56" width="320" height="208" rx="12"/>
<rect class="aether" x="176" y="24" width="96" height="16" rx="8"/>
{cards}</svg></div>
<div class="words"><h1 class="name">CrankMagic</h1><p class="tag">Plan a hundred, own the cards, bring the deck to the table.</p></div>
</div></body></html>
'''
w('components/Cover/preview.html', cover)

# ---------- index ----------
now = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')
TYPES = {'webp': 'image/webp', 'svg': 'image/svg+xml'}
def rec(key, fname):
    return {'name': fname, 'blob': BLOB[key].split('/')[-1], 'size': SIZES[key], 'type': TYPES[fname.rsplit('.', 1)[1]]}
groups = {
  'Brand': {'name': 'Brand', 'tile': 'm', 'order': ['crankmagic-logo-gear-v4-256.webp'], 'files': {'crankmagic-logo-gear-v4-256.webp': rec('logo', 'crankmagic-logo-gear-v4-256.webp')}},
  'Mana': {'name': 'Mana', 'tile': 'xs', 'order': [f'{c}.svg' for c in 'WUBRG2'], 'files': {f'{c}.svg': rec(c, f'{c}.svg') for c in 'WUBRG2'}},
  'Art': {'name': 'Art', 'tile': 'l', 'order': [f'{a}.webp' for a in ('krenko', 'chulane', 'shadrix', 'tymna', 'giada')], 'files': {f'{a}.webp': rec(a, f'{a}.webp') for a in ('krenko', 'chulane', 'shadrix', 'tymna', 'giada')}},
  'Mats': {'name': 'Mats', 'tile': 'l', 'order': ['night-citadel.webp', 'ember-serpent.webp'], 'files': {m + '.webp': rec(m, m + '.webp') for m in ('night-citadel', 'ember-serpent')}},
  'Reference': {'name': 'Reference', 'tile': 'l', 'order': ['concept-b-table-companion.webp'], 'files': {'concept-b-table-companion.webp': rec('reference', 'concept-b-table-companion.webp')}},
}
index = {'v': 3, 'layout': 'files', 'createdOnFiles': {'v': 1, 'at': '2026-10-25T21:37:35Z'}, 'title': 'CrankMagic', 'namespace': 'CrankMagic', 'libraries': [],
         'sections': {}, 'groups': ['Brand', 'Mana', 'Art', 'Mats', 'Reference'], 'assetGroups': groups, 'blobs': {}, 'docs': {'readme': 'project/README.md', 'sections': []},
         'lastChange': {'by': 'Rob', 'at': now, 'via': 'Claude (Cowork)', 'note': 'r4: Cinzel and Lato from Rob\'s reference; the warm table principles; the Study table; Drawer and Study components; the reference image.'}}
w('design-system.json', json.dumps(index, indent=1))
print('cover + index ok')
