from pagekit import *
from ui import *
from glyphs import svg
P = PAL
REG = '<div class="cm" style="padding:20px;border-radius:var(--radius-card);border:1px solid var(--color-line);background:var(--color-bg);color:var(--color-ink);display:grid;gap:16px;align-content:start"{t}><span class="cm-label">{lbl}</span>{body}</div>'
def both(body_fn, min_w=520):
    return f'<div class="grid" style="--min:{min_w}px">' + REG.format(t='', lbl='Dark', body=body_fn('dark')) + REG.format(t=' data-theme="light"', lbl='Light', body=body_fn('light')) + '</div>'
def page(path, card, title, lede, sections):
    html = f'<!-- @dsCard {card} -->\n' + head(title, root='..') + f'<body class="cm"><main class="doc"><header class="doc-head"><span class="cm-label">CrankMagic r4 · guidelines</span><h1>{title}</h1><p>{lede}</p></header>'
    for h, p, body in sections:
        html += f'<section><h2>{h}</h2>' + (f'<p>{p}</p>' if p else '') + body + '</section>'
    html += '<script src="../glyphs.js"></script></main></body></html>'
    write('project/guidelines/' + path, html)

# ---------- colors-surfaces ----------
def ladder(reg):
    p = P['skins']['sapphire-obsidian'][reg]
    keys = [('bg','Ground','--color-bg'),('panel','Panel','--color-panel'),('raised','Raised','--color-raised'),('line','Line','--color-line'),('line_strong','Line strong','--color-line-strong'),('field_line','Field line','--color-field-line'),('faint','Faint','--color-faint'),('muted','Muted','--color-muted'),('ink','Ink','--color-ink')]
    rows = ''.join(f'<tr><td><span class="chip-sw" style="background:var({t})"></span>{n}</td><td class="mono">{t}</td><td class="n">{hex_to_oklch(p[k])[0]:.3f}</td><td><div style="height:10px;width:{hex_to_oklch(p[k])[0]*100:.1f}%;background:var(--color-ink);border-radius:5px;opacity:.85"></div></td></tr>' for k,n,t in keys)
    return f'<table class="data"><tr><th>Token</th><th>Name</th><th class="n">oklab L</th><th style="width:40%">ladder</th></tr>{rows}</table>'
def planes(reg):
    return '''<div style="background:var(--color-bg);padding:18px;border-radius:var(--radius-card);border:1px dashed var(--color-line-strong)"><span class="cm-label">Ground</span>
  <div class="cm-panel" style="margin-top:10px;padding:16px;display:grid;gap:12px"><span class="cm-label">Panel</span>
    <div class="row">''' + btn('Raised control') + btn('Buy list · 13','primary') + '''<input class="cm-input" style="width:180px" placeholder="Field"></div>
    <hr class="cm-rule"><span class="cm-small">1px line between rows</span><hr class="cm-rule cm-rule--strong"><span class="cm-small">1px strong line for a section break</span></div></div>'''
page('colors-surfaces.html', 'group="Colors" viewport="1100x760" subtitle="Ground, panel, raised control; lines; ink, muted, faint" name="Surfaces & ink"',
     'Surfaces and ink', 'Three planes, three lines, three inks. A control is always lighter than its panel. In the light register a white control on a near-white panel cannot reach 1.3:1 by fill, so its 3:1 field line carries the separation.',
     [('The three planes', 'Ground holds the page, a panel holds a group, a raised control is something you press or type into.', both(planes)),
      ('Lightness ladder', 'oklab L for each neutral, Sapphire & Obsidian. Even steps are what make the planes read in a screenshot.', both(ladder))])

# ---------- colors-accents ----------
def accents(reg):
    sw = ''.join(f'<div class="sw"><i style="background:var({t})"></i><b>{n}</b><code>{t}</code></div>' for t,n in [('--color-accent','Accent: press this'),('--color-accent-hover','Accent hover'),('--color-accent-soft','Accent soft'),('--color-money','Money: answer this'),('--color-required','Required: you missed this'),('--color-aether','Aether: focus, turn, graph')])
    demo = f'''<div class="cm-panel" style="padding:16px;display:grid;gap:12px"><div class="row" style="justify-content:space-between"><h3>The three signals</h3><span class="cm-figure cm-money" style="font-size:24px">$57.33</span></div>
      <div class="row">{btn("Buy list · 13","primary")}{btn("Log a game")}</div>
      <div style="padding:12px;border-radius:var(--radius-control);background:var(--color-decision-bg);border:1px solid var(--color-decision-line);color:var(--color-decision-ink);display:grid;gap:8px"><b>Which copy goes in the box?</b><span class="cm-small" style="color:inherit">Two foils and a regular are free. The app is waiting on you.</span></div>
      {field("Bracket", state="danger", err="Bracket is required. Pick 1 to 5.")}</div>'''
    return f'<div class="grid" style="--min:120px">{sw}</div>{demo}'
def cvd_table(reg):
    rows = ''
    for skin in P['order']:
        p = P['skins'][skin][reg]
        for a,b,la,lb in [('accent','money','accent','money'),('accent','required','accent','required'),('money','required','money','required')]:
            vals = [delta_e(p[a],p[b])] + [delta_e(simulate(p[a],k),simulate(p[b],k)) for k in ('protan','deutan','tritan')]
            rows += f'<tr><td>{P["skins"][skin]["name"]}</td><td>{la} vs {lb}</td>' + ''.join(f'<td class="n {"pass" if v>=.08 else "fail"}">{v:.3f}</td>' for v in vals) + '</tr>'
    return f'<table class="data"><tr><th>Skin</th><th>Pair</th><th class="n">Typical</th><th class="n">Protan</th><th class="n">Deutan</th><th class="n">Tritan</th></tr>{rows}</table><p class="note">oklab ΔE between the two colors as each kind of color vision sees them (Machado 2009, full severity). 0.08 and up reads as two different colors.</p>'
page('colors-accents.html', 'group="Colors" viewport="1100x820" subtitle="Press this, answer this, you missed this" name="Accents"',
     'Accents', 'Three signals and three hues, never one: the accent is the one thing to press, money and decision are what the app is waiting on you to answer, required is what you missed. Selection is not a signal: a selected chip, tab or checkbox inverts to ink.',
     [('The three signals', '', both(accents)), ('Told apart in every kind of color vision', '', both(cvd_table, 560))])

# ---------- colors-status ----------
def statuses(reg):
    fam = [('Owned', ['inbox','physical','pull','reserved']), ('Coming', ['ordered']), ('Needed', ['buy','standin']), ('Out', ['remove']), ('Intent, not a copy', ['watch','draft'])]
    rows = ''.join(f'<div style="display:grid;grid-template-columns:150px 1fr;gap:10px;align-items:center"><span class="cm-label">{f}</span><div class="row">{"".join(status(s) for s in ss)}</div></div>' for f, ss in fam)
    b = f'''<div class="cm-panel" style="padding:16px;display:grid;gap:10px"><div class="row" style="justify-content:space-between"><b>Krenko, Mob Boss</b><span class="cm-small">38 in box · 22 pull · 12 ordered · 6 stand-in · 22 to buy</span></div>{bar([("inbox",38),("pull",22),("ordered",12),("standin",6),("buy",22)])}</div>'''
    return rows + b
def gray(reg):
    return '<div style="filter:grayscale(1);display:grid;gap:10px">' + statuses(reg) + '</div>'
page('colors-status.html', 'group="Colors" viewport="1100x900" subtitle="Ten rungs, four hue families, a glyph on every one" name="Status"',
     'Status', 'Ten rungs keep their meanings; the screen shows four hue families and a gray for intentions. Inside a family the rungs differ in lightness and glyph, and the stand-in is hatched. Every chip carries its word, so nothing relies on color alone (G9).',
     [('Families', 'Owned is emerald, coming is aether teal (never the sapphire of the button), needed is the money gold, out is the required crimson. The glyph shape is the second channel: disc, ring with dot, arrow, hollow ring, hatched square, cross, dashed ring.', both(statuses, 560)),
      ('With no color at all', 'The same chips and bar in grayscale. Every rung still reads by its glyph, its word and its lightness step.', both(gray, 560))])

# ---------- colors-mana ----------
def mana(reg):
    sym = ''.join(f'<div class="sw"><i style="background:var(--mana-{c});display:grid;place-items:center"><img src="../assets/mana/{c}.svg" alt="{c}" style="width:28px;height:28px"></i><b>{c}</b><code>--mana-{c}</code></div>' for c in 'WUBRG')
    tint = ''.join(f'<div style="height:56px;border-radius:var(--radius-control);background:linear-gradient(90deg,color-mix(in oklab,var(--mana-{a}) 22%,var(--color-panel)),color-mix(in oklab,var(--mana-{b}) 22%,var(--color-panel)));display:flex;align-items:center;padding:0 14px;gap:6px;border:1px solid var(--color-line)"><img src="../assets/mana/{a}.svg" style="width:18px"><img src="../assets/mana/{b}.svg" style="width:18px"><b style="margin-left:6px">{n}</b></div>' for a,b,n in [('G','U','Chulane'),('R','R','Krenko'),('W','B','Shadrix')])
    return f'<div class="grid" style="--min:84px">{sym}</div><div style="display:grid;gap:8px">{tint}</div>'
page('colors-mana.html', 'group="Colors" viewport="1100x600" subtitle="Scryfall symbols at their own hues; deck tints from identity" name="Mana"',
     'Mana', 'Mana symbols are the app\'s own Scryfall-matching SVGs and keep their canonical hues in every skin. The --mana-* tints color a deck\'s surfaces from its commander\'s identity, mixed 22% into the panel so text stays on the panel\'s contrast.',
     [('Symbols and tints', '', both(mana))])

# ---------- type-display ----------
def tdisplay(reg):
    return f'''<div style="display:grid;gap:14px">
  <div><span class="cm-label">Wordmark · the app\'s own Oxanium mark in aether, unchanged</span><div style="margin-top:8px"><span class="cm-wordmark">CrankMagic</span></div></div>
  <div><span class="cm-label">--text-hero · Cinzel 600 · the deck title, the landing</span><p class="cm-hero" style="margin-top:6px">Krenko, Mob Boss</p></div>
  <div><span class="cm-label">--text-h1 · Cinzel 600 · every page title</span><h1 style="margin-top:6px">Decks</h1></div>
  <div><span class="cm-label">--text-h2 · Lato 700</span><h2 style="margin-top:6px">The hundred</h2></div>
  <div><span class="cm-label">--text-h3 · Lato 700</span><h3 style="margin-top:6px">Mana curve</h3></div>
  <div><span class="cm-label">Section title · Lato 700 · spaced capitals · icon</span><div style="margin-top:8px">''' + section_title('Actions', 'scroll', 'span') + '''</div></div>
  <div><span class="cm-label">--text-figure · Lato 700 tabular</span><div class="cm-figure cm-money" style="margin-top:6px">$57.33</div></div></div>'''
def scale_table(reg):
    rows = [(t, v, u) for t, v, u in P['type'] if t.startswith('--text-') or t.startswith('--leading')]
    return '<table class="data"><tr><th>Token</th><th>Value</th><th>Use</th></tr>' + ''.join(f'<tr><td class="mono">{t}</td><td class="mono">{v}</td><td>{u}</td></tr>' for t, v, u in rows) + '</table>'
page('type-display.html', 'group="Type" viewport="1100x1000" subtitle="Cinzel for names; Lato for headings and figures" name="Display"',
     'Display type', 'Two voices. Cinzel 600, roman capitals at .04em, names places and things: every page title, the deck title and the landing hero. The app name keeps its own CrankMagic wordmark. Lato 700 carries h2, h3, section titles and every figure, so the work stays plain. Sentence-case text in Cinzel sets as capitals and small capitals. The h1 is one token that holds its own clamp: 40px at 1440, 30px at 390. No rule restates it.',
     [('Specimens', '', both(tdisplay)), ('The scale', 'Nothing under 12px. Body is 14px; reading surfaces are 16px.', scale_table('dark'))])

# ---------- type-body ----------
def tbody(reg):
    return f'''<p class="cm-reading" style="margin:0"><span class="cm-label" style="display:block;margin-bottom:6px">--text-reading 16/1.6 · deck guide, help</span>Goblin go-wide. Krenko doubles the board every activation, then a damage payoff converts bodies into a win. Keep two haste enablers in the hundred so the first activation lands the turn he comes down.</p>
<p style="margin:0"><span class="cm-label" style="display:block;margin-bottom:6px">--text-body-size 14/1.5 · UI</span>Lock the list when it is settled. Its copies are already reserved and the rest are on the buy list.</p>
<p class="cm-small" style="margin:0"><span class="cm-label" style="display:block;margin-bottom:6px">--text-small 13 · captions</span>100 in the physical deck · Bracket 3 · 72.98 pts</p>
<span class="cm-label">--text-label 12 · uppercase · .12em</span>'''
def hud_scales(reg):
    out = ''
    for s in (1, 1.25, 1.5, 2):
        out += f'<div style="--hud-scale:{s};display:grid;gap:8px;padding:14px;border-radius:var(--radius-card);background:url(../assets/mats/night-citadel.webp) center/cover"><span class="cm-pill" style="justify-self:start">HUD text {int(s*100)}%</span>{seat("Rob","Krenko, Mob Boss",40,0,7,"Your turn",turn=True)}</div>'
    return out
page('type-body.html', 'group="Type" viewport="1100x1100" subtitle="Lato for everything read; the HUD scale" name="Body, labels, HUD"',
     'Body, labels and the HUD', 'Lato 400 and 700 for everything that is read, chosen or counted: a warm humanist sans with open, rounded forms. The Play HUD has its own three sizes (vital 28, text 18, caption 15) multiplied by the HUD text setting: 100, 125, 150 or 200 percent.',
     [('Body', '', both(tbody)), ('HUD text at 100, 125, 150 and 200 percent', 'Vitals are 28px at 100% and 56px at 200%; HUD text is never under 18px at 100%.', '<div style="display:grid;gap:12px">' + hud_scales('dark') + '</div>')])

# ---------- controls ----------
STATE_LABEL = {'rest':'Rest','hover':'Hover','focus':'Focus visible','active':'Active','disabled':'Disabled','selected':'Selected','danger':'Danger'}
def btn_grid(reg):
    cols = ['rest','hover','focus','active','disabled','selected']
    h = '<div class="state-grid" style="grid-template-columns:110px repeat(6,minmax(0,1fr))"><span></span>' + ''.join(f'<span class="h">{STATE_LABEL[c]}</span>' for c in cols)
    for kind, lbl, label in [('primary','Primary 40','Buy list · 13'),('','Secondary 40','Log a game'),('quiet','Quiet','Clear'),('danger','Danger','Delete deck')]:
        h += f'<span class="h">{lbl}</span>' + ''.join((btn(label, kind, c) if not (c=='selected' and kind in ('primary','danger','quiet')) else '<span class="note">n/a</span>') for c in cols)
    h += f'<span class="h">Compact 32</span>' + ''.join(btn('Play it', '', c, icon='play', size='compact') for c in cols)
    h += '</div>'
    h += f'<div class="row" style="margin-top:6px">{btn("Confirm delete","danger-fill")}{btn("Start the game","primary",size="lg")}{btn("","",icon="more",size="icon",extra=" aria-label=More")}<span class="note">Danger fill only inside a confirm dialog. Large 44 for the one primary on touch.</span></div>'
    return h
def pills(reg):
    return f'''<div class="row">{"".join(status(s) for s in ["inbox","pull","ordered","buy","standin","remove","watch"])}</div>
<div class="row"><span class="cm-pill">Goblin tribal</span><span class="cm-pill">Tokens</span><span class="cm-pill cm-pill--outline">Bracket 3</span><span class="cm-count">46</span></div>
<div style="padding:12px;border-radius:var(--radius-control);background:url(../assets/art/krenko.webp) center/cover"><div class="row">{status("inbox","Boxed",True)}{status("buy","12 to buy",True)}{btn("Play it","on-art",icon="play",size="compact")}</div></div>'''
def chips_grid(reg):
    return f'''<div class="cm-chips">{chip("All",6,"selected")}{chip("Boxed",4)}{chip("Defined",1,"hover")}{chip("Building",0,"focus")}{chip("Playable",6)}{chip("Shared",0,"disabled")}</div>
<p class="note" style="margin:0">Selected inverts to ink, never the accent: the page's one primary stays the only accent on screen. Counts sit inside the chip in muted.</p>'''
def forms(reg):
    return f'''<div class="grid" style="--min:200px">{field("Deck name","Krenko Goblins")}{field("Search","",state="hover",placeholder="A commander's name")}{field("Budget","225",state="focus",hint="Only informs; nothing is refused for money.")}{field("Bracket","",state="danger",err="Pick a bracket from 1 to 5.")}{field("Seats","4",state="disabled")}</div>
<div class="row" style="gap:20px">{check("Show archived")}{check("Bought", checked=True)}{check("Hover","hover")}{check("Focus","focus")}{check("Required","danger")}{check("Disabled","disabled")}</div>
<div class="row" style="gap:20px">{check("Bracket 2",radio=True)}{check("Bracket 3",radio=True,checked=True)}{check("Focus",state="focus",radio=True)}{check("Disabled",state="disabled",radio=True)}</div>
<div class="row">{seg(["Table","Focus","3D"],2)}{seg(["Dark","Light","System"],0,{1:"hover"})}{seg(["Grid","List"],0,{1:"disabled"})}</div>
<select class="cm-select" style="width:240px" aria-label="Sort"><option>Closest to finished</option></select>'''
page('controls.html', 'group="Components" viewport="1200x1500" subtitle="Buttons, pills, chips and form controls in every state" name="Controls"',
     'Controls', 'Primary and secondary buttons are 40px (44 for the touch primary), compact is 32px. Inputs are 42px with a 3:1 field line; checkboxes and radios are 20px. Focus is always a 2px aether ring, 2px out.',
     [('Buttons', '', both(btn_grid, 640)), ('Pills and status chips', '', both(pills)), ('Stage chips', 'All, Boxed, Defined, Building, Playable, Shared.', both(chips_grid)), ('Form controls', '', both(forms, 640))])
print('guidelines A ok')
