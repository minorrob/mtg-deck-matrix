"""renders/index.html: every frame in every skin and register, with a picker. Lists only files that exist."""
from pathlib import Path
P = Path(__file__).resolve().parents[1]; R = P / 'renders'
SK = [('sapphire-obsidian', 'Sapphire & Obsidian'), ('bronze-basalt', 'Bronze & Basalt'), ('chalk-coal', 'Chalk & Coal')]
FR = ['decks-hub', 'deck-overview', 'deck-hundred', 'play-lobby', 'play-fullscreen']
opts = ''.join(f'<option value="{s}-{r}">{n} · {r}</option>' for s, n in SK for r in ('dark', 'light'))
sections = ''
for s, n in SK:
    for r in ('dark', 'light'):
        k = f'{s}-{r}'; figs = ''
        for f in FR:
            for w in (1440, 390):
                if (R / k / f'{f}-{w}.png').exists():
                    figs += f'<figure class="w{w}"><a href="{k}/{f}-{w}.png"><img loading="lazy" src="{k}/{f}-{w}.png" alt="{f} at {w}, {n} {r}"></a><figcaption>{f} · {w}</figcaption></figure>'
        sections += f'<section data-k="{k}"{" hidden" if k != "sapphire-obsidian-dark" else ""}><h2>{n} · {r}</h2><div class="shots">{figs}</div></section>'
html = f'''<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>r4 renders</title>
<link rel="stylesheet" href="../project/styles.css"><link rel="stylesheet" href="../project/components.css"><link rel="stylesheet" href="../project/doc.css">
<style>.shots{{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px;align-items:start}}figure{{margin:0;display:grid;gap:6px}}figure img{{width:100%;border-radius:8px;border:1px solid var(--color-line)}}figure.w390 img{{max-width:220px}}figcaption{{font-size:13px;color:var(--color-muted)}}</style></head>
<body class="cm"><main class="doc"><header class="doc-head"><span class="cm-label">CrankMagic r4 · renders</span><h1>Five frames, every skin</h1><p>Decks hub, deck overview, The hundred, Play lobby and the 3D board, at 1440 and 390, rendered from project/frames with Playwright. The before and after of the Decks hub is in before-after/.</p>
<label class="row" style="gap:10px"><span class="cm-label">Skin</span><select class="cm-select" style="width:280px" id="pick">{opts}</select></label>
<a class="cm-link" href="before-after/decks-hub-before-after.png">Decks hub, before and after</a></header>{sections}</main>
<script>document.getElementById('pick').onchange=e=>document.querySelectorAll('section[data-k]').forEach(s=>s.hidden=s.dataset.k!==e.target.value)</script></body></html>'''
(R / 'index.html').write_text(html); print('gallery ok')
