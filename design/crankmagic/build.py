"""Optional review-artifact builder. Python standard library only.

This does not build or modify the production app. Edit src/ modules and the
canonical repo glossary, then rebuild the self-contained review file here.
"""
from pathlib import Path
from collections import Counter
import json,re,base64
package=Path(__file__).resolve().parent
repo=package.parents[1]
text=(package/'src/base-v3.html').read_text(encoding='utf-8')
text=text.replace('function renderTable(key){','function renderBaseTable(key){',1)
text,n=re.subn(r'<span class="v-study">.*?</span><button class="v-button" id="v-theme".*?</button>',lambda m:(package/'src/crankmagic-user-functions.html').read_text(encoding='utf-8'),text,count=1)
assert n==1, 'Expected the study label and theme picker in the header'
text,n=re.subn(r"const design=\{appearance:'system'[\s\S]*?(?=renderAll\(\);)","const design={density:'comfortable'};function style(){root.style.colorScheme='dark';root.dataset.density=design.density;}style();if(globalThis.Tweak){const t=new Tweak({container:root,onChange:style});t.addSelect(design,'density',{label:'Density',options:['comfortable','compact']});}",text,count=1)
assert n==1, 'Expected one appearance controller'
text=text.replace('color-scheme:light dark','color-scheme:dark')
text,nav_count=re.subn(r'(<nav class="v-nav"[^>]*>)([\s\S]*?)(<div class="v-navnote">)',lambda m:m.group(1)+'<div class="v-nav-track"><div class="v-nav-links">'+m.group(2)+'</div></div>'+m.group(3),text,count=1)
assert nav_count==1, 'Expected one sidebar navigation group'
text=re.sub(r'<section data-screen="lab"[\s\S]*?</section>',lambda m:(package/'src/matrix-entry-v4.html').read_text(encoding='utf-8'),text,count=1)
brand_css=(package/'src/crankmagic-brand.css').read_text(encoding='utf-8').replace('__OXANIUM_WORDMARK_FONT__',base64.b64encode((package/'assets/oxanium-wordmark-700.ttf').read_bytes()).decode('ascii'))
text=text.replace('<header class="v-top">','<style>\n'+((package/'src/matrix-v4.css').read_text(encoding='utf-8')+'\n'+(package/'src/crankmagic-lab-progress.css').read_text(encoding='utf-8')+'\n'+(package/'src/crankmagic-roster.css').read_text(encoding='utf-8')).replace('--v-on-accent','--v-on').replace('--v-text','--v-ink')+'\n'+brand_css+'\n</style>\n<header class="v-top">',1)
text=text.replace('<div class="v-small">Sample roster · one record per copy or commitment</div>','<div class="v-groups-bar"><label class="v-field">Collection group<select class="v-select" id="v-collection-group"></select></label><button class="v-button" id="v-create-group" type="button">Create group</button><button class="v-button" id="v-show-all-collection" type="button">Clear filters</button></div><div class="v-small">Sample roster · one record per copy or commitment. Draft groups make no ownership claim.</div>',1)
text=text.replace('<div id="v-shop"></div>','<div class="v-shop-tabs" aria-label="Shop view"><button class="v-button" type="button" data-shop-mode="buying" aria-pressed="true">Buying & orders</button><button class="v-button" type="button" data-shop-mode="assembly" aria-pressed="false">Ready to assemble</button></div><div id="v-shop"></div>',1)
text=text.replace('</main>','<section data-screen="overview" hidden><div id="v-overview"></div></section><dialog class="v-dialog" id="v-dialog" aria-label="Review action"></dialog></main>',1)
for slug,label,mechanic in [('atraxa','Atraxa','Counters · Proliferate'),('krenko','Krenko','Goblins · Tokens'),('shadrix','Shadrix','Counters · Tokens')]:
 pattern=r'(<button class="v-deck" data-art="'+slug+r'"[\s\S]*?</button>)'
 def tile(m):
  content=re.sub(r'<p class="v-small">Finalized · .*?</p>','<p class="v-small">'+mechanic+'</p>',m.group(1),count=1)
  return '<div class="v-deck-wrap" data-deck-tile="'+label+'">'+content+'<button class="v-archive-action" type="button" data-archive-deck="'+label+'">Archive deck</button></div>'
 text=re.sub(pattern,tile,text,count=1)
text=text.replace('Your decks <span>03</span>','Your decks <span id="v-deck-count">03</span>')
text=text.replace('<div class="v-decks">','<div class="v-actions v-archive-tools"><button class="v-button" id="v-show-archived" type="button" aria-expanded="false">Archived decks</button><button class="v-button" id="v-archive-undo" type="button" disabled>Undo last action</button></div><div id="v-archived-list" hidden></div><div class="v-decks">',1)
text=text.replace("undo.push({rows:structuredClone(rows),locks:{...locks},history:[...history]})","undo.push({rows:structuredClone(rows),locks:{...locks},history:[...history],groups:structuredClone(groups),activeGroup,supplemental:structuredClone(supplemental)})")
text=text.replace('rows=prev.rows;locks=prev.locks;history=prev.history;','rows=prev.rows;locks=prev.locks;history=prev.history;groups=prev.groups;activeGroup=prev.activeGroup;supplemental=prev.supplemental;syncGroups();')
text=text.replace('supplemental:structuredClone(supplemental)})','supplemental:structuredClone(supplemental),archivedDecks:[...archivedDecks]})')
text=text.replace('supplemental=prev.supplemental;syncGroups();','supplemental=prev.supplemental;archivedDecks=prev.archivedDecks;syncGroups();')
text=text.replace("function renderRoster(){const total=","function renderRoster(){if(activeGroup!=='all'&&!groups.some(g=>g.id===activeGroup))activeGroup='all';q('#v-collection-group').value=activeGroup;const total=")
text=text.replace("unfulfilled commitments</span>`;renderTable('roster');","unfulfilled commitments</span>`;renderTable('roster');")
text=text.replace("renderTable('slots');renderRoster();renderShop();","syncGroups();renderTable('slots');renderRoster();renderShop();")
text=text.replace("syncGroups();renderTable('slots');","syncGroups();renderArchiveUI();renderTable('slots');")
text=text.replace("if(name==='discover')requestAnimationFrame(drawGraph);", "if(name==='collection')renderRoster();if(name==='discover')requestAnimationFrame(drawGraph);")
text=text.replace("host.querySelector('[data-clear-filters]').onclick=()=>{state.search='';","host.querySelector('[data-clear-filters]').onclick=()=>{if(key==='roster'){activeGroup='all';syncGroups();}state.search='';")
text=text.replace("r.source==='To buy'?'1 copy needed':'1 copy'","r.draft?(r.quantity+' planned'):r.source==='To buy'?'1 copy needed':'1 copy'")
text=text.replace("function intent(){['competitive','speed','salt'].forEach(k=>q('#v-'+k+'-label').textContent=q('#v-'+k).value+' / 5');","function intent(){['competitive','speed','salt'].forEach(k=>q('#v-'+k+'-label').textContent=q('#v-'+k).value+' / 5');q('#v-salt-description').textContent=['Extremely friendly.','Friendly, with light disruption.','Interactive, with disruptive options.','High pressure, within your restrictions.','Any legal mechanic; optimize to win.'][Number(q('#v-salt').value)-1]+' Your bracket ceiling and explicit restrictions still apply.';")
master=json.loads((repo/'data/master-v2.json').read_text(encoding='utf-8'))
facts=json.loads((repo/'data/card-facts.json').read_text(encoding='utf-8'))['cards']
catalog={c['name']:c for c in json.loads((repo/'data/cards.json').read_text(encoding='utf-8'))['cards']}
guides={
'Atraxa':{'strategy':'Seed counters, develop resources, then turn repeated proliferate triggers into a growing advantage. Preserve enough interaction to keep the engine working.','steps':['Keep an opening hand that can develop your colors and early resources.','Establish useful counters before investing in repeated proliferate effects.','Time Atraxa around available protection and a board that benefits from its end-step trigger.','Keep a recovery line instead of committing every threat into a likely wipe.'],'swot':[['Strengths','Recurring proliferate can compound existing counters.'],['Weaknesses','A four-color mana base and an undeveloped board can delay the engine.'],['Opportunities','Test support that seeds counters and protects the engine without crowding out interaction.'],['Threats','Repeated removal and faster opposing win attempts can interrupt setup.']]},
'Krenko':{'strategy':'Develop Goblins, activate Krenko to multiply the board, and convert that board into a decisive finish. Plan around summoning sickness and removal.','steps':['Develop early mana and Goblin bodies.','Find a safe activation window for Krenko.','Keep resources for rebuilding after removal.','Choose a finish that fits the board and your bracket restrictions.'],'swot':[['Strengths','Krenko scales token production with the Goblins you already control.'],['Weaknesses','Concentrated creature investment exposes the plan to wipes.'],['Opportunities','Test haste, protection and recovery alongside additional token payoffs.'],['Threats','Removal before activation can cost substantial tempo.']]},
'Shadrix':{'strategy':'Develop creatures that benefit from counters and evaluate Shadrix’s combat trigger in the context of every player’s board. Its choices create both value and negotiation.','steps':['Build mana and a board that can use counters.','Evaluate which two modes and players serve your position.','Use the flying double-striking commander when attacks are favorable.','Avoid granting an opponent the resource that completes their win.'],'swot':[['Strengths','Flexible modes support both your board and table negotiation.'],['Weaknesses','Trigger choices can benefit opponents as well as you.'],['Opportunities','Compare counter payoffs and token support against the actual list.'],['Threats','Opponents may convert gifted cards or creatures into a stronger turn.']]},
'Chulane':{'strategy':'Use creature casts to draw cards and develop lands, then reuse useful creatures to sustain the engine. Manage hand and mana so the deck can recover.','steps':['Keep early plays that develop your colors.','Sequence creature casts when Chulane can provide value.','Retain interaction rather than spending every available resource.','Use bounce and replay lines only when their tempo cost is worthwhile.'],'swot':[['Strengths','Creature casts can supply both cards and land development.'],['Weaknesses','The engine depends on resolving and retaining an expensive commander.'],['Opportunities','Test efficient creatures with useful enters abilities and recovery.'],['Threats','Commander removal and restrictions on casting or drawing can disrupt the plan.']]}}
colors={'W':'White','U':'Blue','B':'Black','R':'Red','G':'Green'}
commander_guides=json.loads((package/'src/commander-guides.json').read_text(encoding='utf-8'))
overview={}
for deck in master['decks']:
 if deck['label'] not in guides:continue
 counts=Counter()
 for c in master['cards']:
  n=c.get('target',{}).get(deck['id'],0)
  if not n:continue
  fact=facts.get(c['name'],catalog.get(c['name'],{}));typ=fact.get('typeLine',c.get('type',''))
  key=next((t for t in ['Land','Creature','Planeswalker','Artifact','Enchantment','Instant','Sorcery','Battle'] if t in typ),'Other')
  counts[key]+=n
 f=facts.get(deck['commander'],catalog.get(deck['commander'],{}))
 overview[deck['label']]={**guides[deck['label']],'commander':deck['commander'],'colors':' · '.join(colors[c] for c in ['W','U','B','R','G'] if c in f.get('colorIdentity',[])),'composition':dict(counts),'total':sum(counts.values())}
 detail={k:v for k,v in commander_guides[deck['label']].items() if k!='mana'}
 overview[deck['label']]['commanderGuide']={**detail,'stats':f"{f['power']}/{f['toughness']}",'typeLine':f['typeLine'],'manaCost':f['manaCost'],'set':f['setName'],'image':'data:image/webp;base64,'+base64.b64encode((package/f"art/commander-{deck['label'].lower()}.webp").read_bytes()).decode('ascii')}
example_decks={d['label']:{'label':d['label'],'commander':d['commander'],'cards':[{'name':c['name'],'quantity':c['target'][d['id']]} for c in master['cards'] if c.get('target',{}).get(d['id'],0)]} for d in master['decks'] if d['label'] in overview}
sample_names={'Sol Ring','Arcane Signet',"Commander's Sphere",'Evolution Sage','Flux Channeler','Everflowing Chalice','Astral Cornucopia','Mind Stone'}
sample_names.update(c['name'] for d in example_decks.values() for c in d['cards'])
roster_meta=[]
color_names={'W':'White','U':'Blue','B':'Black','R':'Red','G':'Green','C':'Colorless'}
master_by_name={c['name']:c for c in master['cards']}
for name in sorted(sample_names):
 c=master_by_name.get(name,{});f=facts.get(name,catalog.get(name,{}));types=f.get('typeLine',c.get('type','')).split(' — ')
 typ=' · '.join(t for t in ['Artifact','Creature','Enchantment','Instant','Land','Planeswalker','Sorcery','Battle'] if t in types[0]) or 'Unknown'
 subtype=' · '.join(types[1].split()) if len(types)>1 else 'None'
 mechanic=' · '.join(f.get('keywords',[])) or ('Mana production' if 'Add {' in f.get('oracleText','') else 'Unclassified')
 color=' · '.join(color_names[x] for x in 'WUBRG' if x in c.get('color','')) if c else 'Unknown'
 if c and not color:color='Colorless' if c.get('color') in ['C','',None] else 'Unknown'
 roster_meta.append([name,typ,subtype,mechanic,color,f.get('manaCost','—'),c.get('mv'),f.get('price',c.get('price'))])
# The preview exposes three deck overviews. Keep Chulane's list/metadata for Lab,
# without embedding its unused fourth full-card image.
overview['Chulane']['commanderGuide'].pop('image',None)
glossary=json.loads((repo/'data/commander-glossary.json').read_text(encoding='utf-8'))
# Compile the terms demonstrated in this mock; the full canonical dataset stays in the repo.
term_ids={'power-toughness','mana-cost','creature','artifact','enchantment','land','instant','sorcery','planeswalker','legendary','creature-subtype','flying','vigilance','deathtouch','lifelink','double-strike','haste','activated-ability','triggered-ability','summoning-sickness','end-step','beginning-of-combat','mode','keyword','permanent','proliferate','counters-general','tokens-general','tap-and-untap','cast','board-wipe','target','resolve','enters-the-battlefield','combat-damage','spell','counter','color-identity'}
glossary_data=[{k:e[k] for k in ['id','term','aliases','definition','category']} for e in glossary['entries'] if e['id'] in term_ids]
assert len(glossary_data)==len(term_ids), 'Missing glossary term in canonical data'
# Counter as a verb is not automatically linked in noun-heavy prose; annotate by meaning.
glossary_data=[e for e in glossary_data if e['id']!='counter']
mana_symbols={s:'data:image/svg+xml;base64,'+base64.b64encode((repo/f'assets/mana/{s}.svg').read_bytes()).decode('ascii') for s in ['W','U','B','R','G','2','3']}
insert='const glossaryData='+json.dumps(glossary_data,ensure_ascii=False,separators=(',',':'))+';\nconst manaSymbols='+json.dumps(mana_symbols,separators=(',',':'))+';\n'+(package/'src/crankmagic-glossary.js').read_text(encoding='utf-8')+'\nconst overviewData='+json.dumps(overview,ensure_ascii=False)+';\n'+(package/'src/matrix-v4.js').read_text(encoding='utf-8')+'\n'
insert=insert.replace('Pinned target list at e5810ed · commander included; primary card types counted once.','Example target list · commander included; primary card types counted once.').replace('The existing Copilot capability continues here: findings, evidence, cost and a direct path to the affected cards. No invented performance delta.','Review costs, card availability and evidence before accepting a change.')
insert=re.sub(r'const commanders=\[[\s\S]*?(?=\nq\(\x27#v-start\x27\).onchange)',lambda m:(package/'src/crankmagic-commander-picker.js').read_text(encoding='utf-8'),insert,count=1)
insert+='\nconst exampleDecks='+json.dumps(example_decks,separators=(',',':'))+';\nconst rosterMetadata=Object.fromEntries('+json.dumps(roster_meta,ensure_ascii=False,separators=(',',':'))+'.map(([name,type,subtype,mechanic,color,mana,mv,price])=>[name,{type,subtype,mechanic,color,mana,mv,price}]));\n'+(package/'src/crankmagic-roster.js').read_text(encoding='utf-8')+'\n'+'\n'+(package/'src/crankmagic-lab-progress.js').read_text(encoding='utf-8')+'\n'+'\n'
insert=re.sub(r"q\('#v-autobuild'\)\.onclick=\(\)=>\{if\(!chosenCommander\?\.verified\)return;[\s\S]*?\nfilterCommanders\(\);",'filterCommanders();',insert,count=1)
# Every deck-to-Collection navigation clears all roster facets, not just the old three.
insert=insert.replace("Object.assign(tableState.roster,{search:","clearRosterFilters();Object.assign(tableState.roster,{search:")
insert=insert.replace("q('#v-show-all-collection').onclick=()=>{activeGroup='all';","q('#v-show-all-collection').onclick=()=>{activeGroup='all';clearRosterFilters();")
# Run remains available for either entry path, with readiness controlled by the run pane.
insert=insert.replace("q('#v-autobuild').hidden=mode!=='commander';q('#v-autobuild').disabled=!chosenCommander?.verified;","")
insert=insert.replace('Select a commander to enable Auto-build 99.','Select a commander, then complete your Deck Definition and press Run.')
insert=insert.replace('ready to preview your intent for the other 99.','ready to define the other 99.')
insert=insert.replace("q('#v-list-readiness').textContent=line;}","q('#v-list-readiness').textContent=line;syncRunInput();}")
insert=re.sub(r'function putInDeck\([\s\S]*?\nfunction bindMenus',lambda m:(package/'src/matrix-placement-v4.js').read_text(encoding='utf-8')+'\nfunction bindMenus',insert,count=1)
insert=insert.replace("groups.map(g=>`<option", "groups.filter(g=>includeAll||!archivedDecks.includes(g.deck)).map(g=>`<option")
insert=insert.replace("Object.keys(locks).map(deck=>", "Object.keys(locks).filter(deck=>!archivedDecks.includes(deck)).map(deck=>")
insert=insert.replace("input.value=groups.some(g=>g.id===previous)?previous:'deck:Atraxa';", "input.value=[...input.options].some(o=>o.value===previous)?previous:input.options[0]?.value||'';")
insert=insert.replace("syncGroups();entrySummary();",(package/'src/matrix-archive-v4.js').read_text(encoding='utf-8'))
text=text.replace('renderAll();\n})();',insert+'syncGroups();entrySummary();renderAll();\n'+(package/'src/crankmagic-brand.js').read_text(encoding='utf-8')+'\n'+(package/'src/crankmagic-sidebar.js').read_text(encoding='utf-8')+'\n'+(package/'src/crankmagic-user-functions.js').read_text(encoding='utf-8')+'\n})();',1)
text=text.replace('DESIGN STUDY 03','DESIGN STUDY 04').replace('Design study 03','Design study 04')
text=text.replace('Deck Matrix','CrankMagic')
text=text.replace('<div class="v-brand"><span>✦</span> CrankMagic</div>','<div class="v-brand-block"><div class="v-brand"><span>✦</span> CrankMagic</div><div class="v-brand-subline">An Intelligent MtG: Commander Deck Creator &amp; Card Libary</div></div>')
if 'v-brand-subline">' not in text:
 text=re.sub(r'(<div class="v-brand">.*?</div>)',lambda m:'<div class="v-brand-block">'+m.group(1)+"<div class=\"v-brand-subline\">An Intelligent MtG: Commander Deck Creator &amp; Card Libary</div></div>",text,count=1)
logo='data:image/webp;base64,'+base64.b64encode((package/'assets/crankmagic-logo-wand-v3-256.webp').read_bytes()).decode('ascii')
text,n=re.subn(r'<div class="v-brand-block"><div class="v-brand"><span>✦</span>\s*CrankMagic</div>(<div class="v-brand-subline">.*?</div>)</div>',lambda m:'<div class="v-brand-block"><img class="v-brand-logo" data-logo="wand-v3" src="'+logo+'" width="48" height="48" alt=""><div class="v-brand-copy"><div class="v-brand">CrankMagic</div>'+m.group(1)+'</div></div>',text,count=1)
assert n==1, 'Expected one original brand diamond to replace'
text=text.replace('<div class="v-brand-subline">An Intelligent MtG: Commander Deck Creator &amp; Card Libary</div>','<div class="v-brand-subline">An Intelligent MtG: Commander Deck Creator &amp; Card Libary</div><div class="v-aether-wrap"><canvas class="v-aether" width="440" height="28" aria-hidden="true"></canvas><canvas class="v-aether-front" width="440" height="28" aria-hidden="true"></canvas><button class="v-aether-toggle" type="button" aria-label="Pause aether animation" title="Pause aether animation">Ⅱ</button></div>',1)
text=text.replace('This deck is protected. Its copy cannot be transferred.','This copy is in a protected deck. Review the donor shortfall before overriding this allocation.')
text=text.replace("id=\"v-transfer\" type=\"button\"${locked?' disabled':''}","id=\"v-transfer\" type=\"button\"")
text=re.sub(r'function releaseOld\([\s\S]*?\nfunction applySwap\([\s\S]*?\n',lambda m:(package/'src/matrix-swap-v4.js').read_text(encoding='utf-8')+'\n',text,count=1)
assert len(text.encode())<1000000, f'Fragment size: {len(text.encode())}'
assert 'const overviewData=' in text and 'id="v-dialog"' in text
(package/'fragment.html').write_text(text,encoding='utf-8',newline='\n')
print('Design v4:',len(text.encode()),'bytes; composition totals',[(k,v['total']) for k,v in overview.items()])

import html
export_fragment=text.replace('id="matrix-v2"','id="matrix-v2" data-export-storage="true"',1)
frame=(package/'src/frame-template.html').read_text(encoding='utf-8').replace('__CRANKMAGIC_FRAGMENT__',export_fragment)
shell=(package/'src/export-template.html').read_text(encoding='utf-8')
shell=shell.replace('__CRANKMAGIC_FRAME__',html.escape(frame,quote=True))
shell=shell.replace('__CRANKMAGIC_CACHE__',(package/'src/crankmagic-export-cache.js').read_text(encoding='utf-8'))
(package/'mtg-facelift-mockup.html').write_text(shell,encoding='utf-8',newline='\n')
print('Exported mtg-facelift-mockup.html with the existing sandbox and local preview cache.')
