from pagekit import *
from spec import GILT, SKINS, full
GD = {**full('sapphire-obsidian', 'dark'), **GILT['dark']}; GL = {**full('sapphire-obsidian', 'light'), **GILT['light']}
dirs = [
  ('sapphire-obsidian', full('sapphire-obsidian', 'dark'), full('sapphire-obsidian', 'light'), True,
   'Blue mana on the button, black mana on the ground, and the other three mana colors each given one job: gold for money and decisions, crimson for what you missed, emerald for what you own. Saturated jewels with white words, never pastels. The accent is the only blue control on the screen; "ordered" moves to an aether teal so it can never be read as the button.'),
  ('bronze-basalt', full('bronze-basalt', 'dark'), full('bronze-basalt', 'light'), False,
   'The same five jobs on warm stone. Basalt neutrals and bronze-tinted lines make the table feel like a hall instead of a night sky. It passes every target the pick does, because only the neutrals change. Kept as the alternate skin.'),
  ('gilt', GD, GL, False,
   'It fails the brief\'s own rule, because the button would share its gold with the to-buy rung and with every price. Moving money to blue clears the measurement and breaks the meaning: in every fantasy game, gold is treasure. Rejected.'),
]
def card(key, p, reg, name):
    sw = ''.join(f'<div class="sw"><i style="background:{p[k]}"></i><b>{lbl}</b><code>{p[k]}</code></div>' for k, lbl in
                 [('bg','Ground'),('panel','Panel'),('raised','Raised'),('line','Line'),('ink','Ink'),('muted','Muted'),('accent','Accent'),('money','Money'),('required','Required'),('aether','Aether')])
    facts = [('On-accent text', ratio(p['on_accent'], p['accent']), 4.5), ('Muted on panel', ratio(p['muted'], p['panel']), 4.5),
             ('Line on ground', ratio(p['line'], p['bg']), 1.3), ('Accent vs required, worst color vision (ΔE ok)', cvd_min(p['accent'], p['required']), 0.08),
             ('Accent vs money, worst color vision (ΔE ok)', cvd_min(p['accent'], p['money']), 0.08),
             ('Accent vs the to-buy rung, worst color vision (ΔE ok)', cvd_min(p['accent'], p['needed']), 0.08)]
    ft = ''.join(f'<tr><td>{n}</td><td class="n {"pass" if v>=t else "fail"}">{(fmt(v) if t>=1 else f"{v:.3f}")}</td><td class="n note">{("≥ "+str(t)) if t>=1 else "≥ 0.080"}</td></tr>' for n, v, t in facts)
    st = ''.join(f'<span class="cm-status" data-st="{s}">{svg("st-"+s)}{w}</span>' for s, w in [('inbox','In box'),('ordered','Ordered'),('buy','To buy'),('remove','Remove')]) if 'owned' in p else ''
    return f'''<div class="cm" style="{vars_for(p)};padding:18px;border-radius:var(--radius-card);background:var(--color-bg);border:1px solid var(--color-line);display:grid;gap:14px;color:var(--color-ink)">
  <div class="row" style="justify-content:space-between"><span class="cm-label">{reg} register</span></div>
  <div class="grid" style="--min:74px;gap:8px">{sw}</div>
  <div class="cm-panel" style="padding:16px;display:grid;gap:12px">
    <div class="row" style="justify-content:space-between"><h3>Krenko, Mob Boss</h3><span class="cm-figure cm-money" style="font-size:24px">$57.33</span></div>
    <div class="row">{st}</div>
    <div class="row"><button class="cm-btn cm-btn--primary">Buy list · 13</button><button class="cm-btn">Log a game</button>
      <span style="display:inline-flex;align-items:center;gap:6px;color:var(--color-required);font-weight:600;font-size:13px">{svg("alert")}Bracket is required</span></div>
  </div>
  <table class="data">{ft}</table></div>'''
html = head('Palette directions', root='.', skin_switch=False) + '<body class="cm"><main class="doc"><header class="doc-head"><span class="cm-label">CrankMagic r4 · step 1</span><h1>Three palette directions</h1><p>Each one is built from a named material or place, in a dark and a light register, and measured with the same script. The brief: high fantasy, the five mana colors, clean enough that nothing is confused with anything else. Each color gets exactly one job. Sapphire & Obsidian is the pick.</p></header>'
for key, d, l, picked, why in dirs:
    nm = SKINS[key]['name'] if key in SKINS else GILT['name']; place = SKINS[key]['place'] if key in SKINS else GILT['place']
    badge = '<span class="cm-pill" style="background:var(--color-ink);color:var(--color-bg);font-weight:700">Picked</span>' if picked else ('<span class="cm-pill cm-pill--outline">Kept as a skin</span>' if key in SKINS else '<span class="cm-pill cm-pill--outline">Rejected</span>')
    html += f'<section><div class="row" style="justify-content:space-between"><div style="display:grid;gap:4px"><h2>{nm}</h2><span class="cm-muted">{place}</span></div>{badge}</div><p>{why}</p><div class="grid" style="--min:460px">{card(key,d,"Dark",nm)}{card(key,l,"Light",nm)}</div></section>'
html += '</main></body></html>'
write('project/palette-directions.html', html); print('ok')
