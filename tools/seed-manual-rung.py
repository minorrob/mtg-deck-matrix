# Seeds data/active-state.json's manualCards with the 32 hand-picked options that
# opened the Manual rung: the alternates to the singles shared across decks, and the
# further pulls from the Salvage yard.
#
#   REPO=/path/to/mtg-deck-matrix python3 tools/seed-manual-rung.py
#
# Needs network access -- card data is fetched live from Scryfall's collection
# endpoint so nothing here is a stale transcription.
#
# This writes state, never data/buy-plans.json. That is the point: the buy catalog is
# regenerated from the build kit, so a card written into it is lost on the next
# rebuild, while state travels with Load Active and survives regeneration. It
# supersedes the earlier apply-deck-swaps.py, which hard-swapped nineteen cards out of
# five decks in the catalog. Nothing is swapped out any more -- every alternate is
# offered as a choice inside the slot it would fill, and the pick is made in the app.
#
# Every option is pre-flighted before a byte is written: colour identity inside the
# commander's, Commander-legal, the card it replaces actually present in that deck,
# and, for a Salvage pick, actually in the yard. A single failure aborts the run.
#
# The six commodity cards (Sol Ring, Arcane Signet, Command Tower, Exotic Orchard,
# Fellwar Stone, Terramorphic Expanse) are deliberately absent: they stay in every deck
# and are resolved by buying the 17 duplicate copies recorded in duplicateCopiesToBuy.
import json,re,os,urllib.request,time
def key(n): return re.sub(r'^-|-$','',re.sub(r'[^a-z0-9]+','-',str(n).lower()))
REPO=os.environ.get('REPO',os.getcwd())
H={'Content-Type':'application/json','User-Agent':'MtgDeckMatrix/1.0','Accept':'application/json'}
NAME={'1b':'Felothar','2c':'Atraxa','3o':'Obuun','4e':'Roon','7e':'Danitha'}
CI={'1b':set('BGW'),'2c':set('BGUW'),'3o':set('GRW'),'4e':set('GUW'),'7e':set('W')}

# (deck, replaces, card, source, why)
SEED=[
 # --- set 1: the shared singles that needed a distinct card per deck ---
 ('1b','Swords to Plowshares','Winds of Abandon','salvage','One-mana exile now, a one-sided wrath for {4}{W} later.'),
 ('1b','Sun Titan',"Sevinne's Reclamation",'salvage','Same recursion job at a third the mana, and flashback gets it twice.'),
 ('1b','Swiftfoot Boots',"Tyvar's Stand",'buy','Protection that also grows the creature. Boots gave haste this deck never needed.'),
 ('2c','Path to Exile','Anguished Unmaking','buy','Instant-speed exile for any nonland permanent, not just creatures.'),
 ('2c','Swords to Plowshares','Vanishing Verse','buy','Exiles a monocolored permanent of any type. No graveyard, no regrowth.'),
 ('2c','Skyclave Relic','Mind Stone','buy','Ramps on three, cashes in for a card once the lands are online.'),
 ('3o','Path to Exile','Beast Within','buy','Answers any permanent at instant speed.'),
 ('3o',"Bitterthorn, Nissa's Animus","Commander's Sphere",'buy','Fixes all three colors and draws a card when it is no longer needed.'),
 ('3o','Skyclave Relic','Prophetic Prism','salvage','Any-color fixing plus a card, the half of Skyclave Relic that mattered.'),
 ('3o','Fall of the First Civilization','Retreat to Kazandu','buy','Enchantment for enchantment, and every land drop becomes a counter or four life.'),
 ('4e','Path to Exile','Reality Shift','buy','Two-mana exile in blue, and manifest usually hands them a worse body.'),
 ('4e','Swords to Plowshares','March of Otherworldly Light','buy','Scales to exile any nonland permanent at instant speed.'),
 ('4e','Sun Titan','Knight of the White Orchid','salvage','A white body with an ETB, which is exactly what Roon wants to blink.'),
 ('4e','Skyclave Relic','Coldsteel Heart','buy','Three-color fixing on two mana instead of three.'),
 ('4e','Swiftfoot Boots','Blossoming Defense','buy','One-mana hexproof protects the blink engine mid-combat.'),
 ('7e','Sun Titan','Ao, the Dawn Sky','salvage','Flying vigilance body that pays out again when it dies.'),
 ('7e',"Bitterthorn, Nissa's Animus",'Dwarven Shortsword','salvage','Equipment that brings its own carrier, and Danitha discounts it.'),
 ('7e','Swiftfoot Boots',"Alseid of Life's Bounty",'buy','Protection that saves the creature and the auras on it. Boots do not.'),
 ('7e','Fall of the First Civilization','All That Glitters','buy','Grows with every aura and equipment already in the deck.'),
 # --- set 2: further pulls from the Salvage yard ---
 ('1b','Blight Pile','Moonshaker Cavalry','salvage','Felothar makes the walls attack for their toughness. Flying and +X/+X is the kill.'),
 ('1b','Evolving Wilds','Mirkwood','salvage','Repeatable B or G instead of a one-shot fetch, and it drains late.'),
 ('2c',"Explorer's Scope",'Gollum, Riddle Master','salvage','The Scope is a coin-flip land in a deck that does not attack. Gollum taxes every opponent.'),
 ('2c',"Siren's Ruse",'Jungle Barrier','salvage','Spare copy. Defender plus a card, blocking while Atraxa proliferates.'),
 ('3o','Perpetual Timepiece','Akoum Hellhound','salvage','Milling does nothing here. The Hellhound grows +2/+2 on every land drop.'),
 ('3o','Currency Converter','Excava, the Risen Past','salvage','No discard theme to enable it. Excava flies, has haste, and recurs a permanent on attack.'),
 ('3o','Drogskol Shieldmate','Atsushi, the Blazing Sky','salvage','Same slot, but flies, tramples, and pays out again when it dies.'),
 ('3o','Intangible Virtue','Conspiracy Theorist','salvage','Virtue only pumps tokens. Obuun animates lands, which are not tokens.'),
 ('3o','Mulch','Naktamun Lorespinner','salvage','A body that keeps working, over a one-shot land dig.'),
 ('4e',"Pilgrim's Eye",'Kor Cartographer','salvage','Puts the land onto the battlefield rather than into hand, and is a better blink target.'),
 ('4e','Negate','Claim Jumper','salvage','Spare copy. Roon wants ETB bodies to blink, not narrow counterspells.'),
 ('4e','Wall of Mulch','Patchwork Banner','salvage','Name Wall: an anthem for the board Arcades draws off, plus any-color fixing.'),
 ('7e',"Explorer's Scope","Archaeomancer's Map",'salvage','Fetches two Plains and grants an extra land drop. This deck runs 26 Plains.'),
]

bp=json.load(open(f'{REPO}/data/buy-plans.json'))
sp=f'{REPO}/data/active-state.json'; ex=json.load(open(sp)); st=ex['state']
ARRS=["startingShell","baseCards","required","upgrade","enhance","max","tuned2","enhance2","max2","funTuned","funMax","altTuned","altMax"]

names=sorted({c for _,_,c,_,_ in SEED})
I={}
for i in range(0,len(names),70):
    d=json.load(urllib.request.urlopen(urllib.request.Request('https://api.scryfall.com/cards/collection',
      data=json.dumps({"identifiers":[{"name":n} for n in names[i:i+70]]}).encode(),headers=H),timeout=30))
    for c in d['data']: I[c['name'].split(' // ')[0]]=c
    assert not d.get('not_found'), d['not_found']
    time.sleep(0.15)

yard={key(r['card']['name'].split(' // ')[0]) for r in st['liveSalvage'].values()}
bad=[]
for pid,repl,card,src,why in SEED:
    plan=bp['plans'][pid]
    have={key(it['name']) for a in ARRS for it in plan.get(a) or []}
    c=I[card]; ci=set(c.get('color_identity') or [])
    if key(repl) not in have: bad.append(f'{NAME[pid]}: "{repl}" is not in the deck, so nothing would anchor {card}')
    if not ci<=CI[pid]: bad.append(f'{NAME[pid]}: {card} colour identity {"".join(sorted(ci)) or "C"} outside {"".join(sorted(CI[pid]))}')
    if c['legalities']['commander']!='legal': bad.append(f'{NAME[pid]}: {card} is not Commander legal')
    if src=='salvage' and key(card) not in yard: bad.append(f'{NAME[pid]}: {card} is not in the Salvage yard')
if bad:
    print('SEED PRE-FLIGHT FAILED:'); [print('  -',b) for b in bad]; raise SystemExit(1)
print(f'pre-flight: {len(SEED)}/{len(SEED)} manual options verified\n')

man={}
for pid,repl,card,src,why in SEED:
    c=I[card]; f=(c.get('card_faces') or [{}])[0]
    price=float(c.get('prices',{}).get('usd') or 0)
    man.setdefault(pid,[]).append({
      'id':f'manual-{pid}-{key(card)}','name':c['name'],'quantity':1,
      'manaCost':c.get('mana_cost') or f.get('mana_cost','') or '',
      'typeLine':c.get('type_line') or f.get('type_line',''),
      'oracleText':c.get('oracle_text') or f.get('oracle_text','') or '',
      'keywords':c.get('keywords') or [],'colorIdentity':c.get('color_identity') or [],
      'commanderLegal':True,'rarity':c.get('rarity',''),'setName':c.get('set_name',''),
      'image':(c.get('image_uris') or f.get('image_uris') or {}).get('small',''),
      'price':price,'ceiling':price,
      'tcgplayerUrl':c.get('purchase_uris',{}).get('tcgplayer','').split('?')[0],
      'gameChanger':bool(c.get('game_changer')),'category':'manual','stage':'Manual',
      'replaces':repl,
      'purpose':why,'why':why,'whyPrimary':why,
      'whereToBuy':'Already owned · from Salvage' if src=='salvage' else 'Singles case',
      'source':src,'addedAt':'2026-08-27T00:00:00.000Z'})

st['manualCards']=man
ex['exportedAt']='2026-08-27T00:00:00.000Z'
ex['note']=("The active six: 1b Felothar, 2c Atraxa, 3o Obuun, 4e Roon, 5o Quintorius, 7e Danitha. "
 "Ownership from Rob's 2026-08-26 purchase checklist. 2026-08-27: nothing is swapped out any more. "
 "The cards that would have replaced a shared single, and the further pulls from the Salvage yard, "
 "are all filed as Manual options on the slot each one would fill, so the choice is made in the app. "
 "Sol Ring, Arcane Signet, Command Tower, Exotic Orchard, Fellwar Stone and Terramorphic Expanse stay "
 "in every deck and are resolved by buying duplicate copies instead.")
ex['duplicateCopiesToBuy']={"Sol Ring":4,"Arcane Signet":3,"Command Tower":2,"Exotic Orchard":3,"Fellwar Stone":3,"Terramorphic Expanse":2}
json.dump(ex,open(sp,'w'),indent=1,ensure_ascii=False); open(sp,'a').write('\n')
for pid,v in man.items(): print(f'  {NAME[pid]:10} {len(v)} manual options')
print(f'\ntotal {sum(len(v) for v in man.values())} · salvage-sourced {sum(1 for s in SEED if s[3]=="salvage")} · to buy {sum(1 for s in SEED if s[3]=="buy")}')
