/* Public card facts are not holdings. This adapter deliberately drops the own,
 * bench and deck flags baked into the historical graph. Names have stable local
 * IDs; Oracle and printing IDs remain separate metadata, so hydration never
 * duplicates a physical copy. Search suggestions never auto-resolve an import.
 */
(function(root,factory){const classifier=typeof module==='object'&&module.exports?require('./card-classify.js'):root.MtgCardClassify;const payload=typeof module==='object'&&module.exports?require('./graph-payload.js'):root.CrankGraphPayload;const api=factory(classifier,payload);if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.CrankCatalog=api;})(typeof globalThis!=='undefined'?globalThis:this,function(Classify,Payload){
  'use strict';
  const folded=s=>String(s||'').normalize('NFKC').trim().toLowerCase();
  function key(name){return 'card:'+btoa(String.fromCharCode(...new TextEncoder().encode(folded(name)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');}
  function safeURL(raw){try{const u=new URL(raw);return u.protocol==='https:'?u.href:'';}catch{return '';}}
  function normalize(raw,prior={}){const c={...prior,...raw},name=String(c.name||'').trim();if(!name)throw Error('A card needs a name.');const type=c.typeLine||c.type_line||c.type||'',oracle=c.oracleText||c.oracle_text||'',identity=c.colorIdentity||c.color_identity||String(c.ci||'').split('');const tags=Classify.classify({typeLine:type,oracleText:oracle,keywords:c.keywords||[],card_faces:c.faces||c.card_faces||[]});const price=c.price===null?null:Number(c.price);return {id:key(name),oracleId:c.oracleId||c.oracle_id||'',scryfallId:c.scryfallId||'',name,typeLine:type,oracleText:oracle,manaCost:c.manaCost||c.mana_cost||'',manaValue:c.manaValue??c.cmc??c.mv??null,colorIdentity:identity,colors:c.colors||[],keywords:c.keywords||[],power:c.power??null,toughness:c.toughness??null,rarity:c.rarity||'',commander:!!(c.commander||c.isCommander||c.canBeCommander||(/Legendary/.test(type)&&/Creature/.test(type))||/can be your commander/i.test(oracle)),verified:c.verified??!!c.legalities?.commander,legalities:c.legalities||{},mechanics:raw.mechanics||tags.mechanics||[],roles:raw.roles||tags.roles||[],tribes:raw.tribes||tags.tribes||[],requires:raw.requires||tags.requires||[],causes:raw.causes||tags.causes||[],triggers:raw.triggers||tags.triggers||[],produces:raw.produces||tags.produces||[],multiplies:raw.multiplies||tags.multiplies||[],grants:raw.grants||tags.grants||[],extends:raw.extends||tags.extends||[],price:Number.isFinite(price)&&price>0?price:null,priceUpdated:c.priceUpdated||'',priceSource:c.priceSource||'Scryfall snapshot',image:safeURL(c.imageLarge||c.normal||c.image||c.small||('https://api.scryfall.com/cards/named?exact='+encodeURIComponent(name)+'&format=image&version=normal')),set:c.setCode||c.set||'',setName:c.setName||'',collector:c.collector||c.collectorNumber||c.collector_number||'',cheapestSet:c.cheapestSet||'',cheapestSetCode:c.cheapestSetCode||'',printings:c.printings||null,flavorName:c.flavorName||c.flavor_name||'',flavorNames:[...new Set([...(c.flavorNames||[]),...(c.flavorName||c.flavor_name?[c.flavorName||c.flavor_name]:[])])],commanderRank:c.commanderRank??null,rank:c.edhrecRank||c.rank||null,source:c.source||'Bundled Scryfall snapshot',updatedAt:c.updatedAt||'',url:safeURL(c.url||c.scryfallUri||c.scryfall_uri||''),buy:safeURL(c.buy||c.tcgplayerUrl||''),gameChanger:!!(c.gameChanger||c.game_changer),layout:c.layout||'',faces:c.faces||c.card_faces||[]};}
  /* THE PLAY-STYLE VOCABULARY. Each entry is a label a reader recognises and the rules
     text that earns it, matched against oracle text, keywords, mechanics, roles and the
     classifier's cause/trigger tags -- so a card the graph knows only as tags still
     answers. Purphoros ("whenever another creature you control enters, ... deals 2 damage
     to each opponent") is ETB triggers and Drain & burn; the old twelve-word list, matched
     as substrings, found nothing for him. */
  const MECHANICS=[
    ['Counters',/\bcounters?\b|proliferate|counter-placed/],
    ['Tokens',/\btokens?\b/],
    ['ETB triggers',/(?:creature|permanent|artifact|enchantment)s?[^.]{0,40}\benters?\b|enters the battlefield|creature-etb/],
    ['Blink',/exile [^.]{0,60}return (?:it|that card|them|those cards)[^.]{0,30}(?:to the battlefield|under)|\bblink\b|\bflicker\b/],
    ['Drain & burn',/damage to each opponent|each opponent loses \d+ life|loses? \d+ life|\bextort\b|life-loss|damage to each player/],
    ['Aristocrats',/whenever [^.]{0,40}\bdies\b|sacrifice (?:a|an|another|two) creatures?|creature-dies|sac-outlet/],
    ['Sacrifice',/\bsacrifice\b|sac-outlet/],
    ['Lifegain',/gains? [^.]{0,12}life|lifelink|life-gain/],
    ['Spellslinger',/instants? (?:and|or) sorcer(?:y|ies)|whenever you cast (?:a|an|your) (?:instant|sorcery|noncreature)|\bprowess\b|magecraft|\bstorm\b|cast-spell/],
    ['Artifacts',/\bartifacts?\b|affinity|improvise|metalcraft/],
    ['Enchantress',/\benchantments?\b|constellation|\bauras?\b/],
    ['Voltron',/\bequip\b|\bequipment\b|\bauras?\b|\battach\b|double strike|commander damage/],
    ['Graveyard',/\bgraveyard\b|\bdredge\b|\bdelve\b|\bescape\b|flashback|\bunearth\b|graveyard-entry|recursion/],
    ['Reanimator',/return [^.]{0,60}from (?:your|a) graveyard to the battlefield|reanimate|\bunearth\b|\bpersist\b|\bundying\b/],
    ['Mill',/\bmills?\b|top [^.]{0,30}cards? of (?:their|your|that player's|target player's) library into (?:their|your|that player's) graveyard/],
    ['Discard & wheels',/\bdiscards?\b/],
    ['Poison',/\bpoison\b|\btoxic\b|\binfect\b/],
    ['Landfall',/landfall|whenever a land (?:you control )?enters|additional land|land-drop/],
    ['Ramp',/add \{|search your library for a[^.]{0,40}land|\bramp\b|\btreasure\b/],
    ['Treasure',/\btreasure\b/],
    ['Combat',/\battacks?\b|\bcombat\b|\bblocks?\b|combat-begin/],
    ['Extra combats & turns',/additional combat|extra turn|additional turn|untap all creatures/],
    ['Tribal',/creatures? you control of the chosen type|share a creature type|choose a creature type|other [a-z]+s? (?:creatures? )?you control (?:get|have)|[a-z]+ spells you cast cost \{1\} less/],
    ['Draw',/\bdraws? (?:a|one|two|three|x|\d+) cards?\b|whenever you draw|draw-card/],
    ['Superfriends',/\bplaneswalkers?\b|\bloyalty\b/],
    ['Stax & control',/counter target|can't (?:cast|attack|block|untap|be cast)|each opponent sacrifices|opponents? can't|costs? \{\d\} more/],
    ['Group hug',/each player (?:draws|may|creates|gains)|each other player/],
    ['Doublers & multipliers',/multiplies-|twice that many|twice as much|triple that|double the (?:number|amount)|\bproliferate\b|triggers an additional time|additional combat phase|draws? an additional card/],
    ['Protection & granting',/grants-|gains? (?:hexproof|indestructible|protection|shroud|ward)|(?:creatures|permanents) you control (?:gain|have)[^.]{0,40}(?:hexproof|indestructible|protection|ward)|\bward \{/],
    ['Combo',/\bstorm\b|copy target|untap target (?:permanent|artifact|creature|land)|infinite|without paying (?:its|their) mana cost/]
  ];
  function haystack(c){return [c.oracleText,...(c.keywords||[]),...(c.mechanics||[]),...(c.roles||[]),...(c.causes||[]),...(c.triggers||[]),...(c.produces||[]),...(c.requires||[]),...(c.multiplies||[]).map(m=>'multiplies-'+m),...(c.grants||[]).map(g=>'grants-'+g)].join(' ').toLowerCase();}
  function matchesMechanic(c,label){const entry=MECHANICS.find(([l])=>folded(l)===folded(label));if(!entry)return folded(haystack(c)).includes(folded(label));return entry[1].test(haystack(c));}
  /* The labels a card earns, for "plays as" lines and picker rows. */
  function playStyles(c){return MECHANICS.filter(([l])=>matchesMechanic(c,l)).map(([l])=>l);}
  async function create(options){const byName=new Map(),byAlias=new Map(),byId=new Map();let graph=null,universeDate='',rankDate='',priceDate='',graphDate='',graphLoading=null;const fetcher=options.fetchImpl||fetch;
    /* THE NAME ON THE CARD IN YOUR HAND. byName is keyed on the ORACLE name, which is the
       name the rules use and not always the name printed on the card: a Secret Lair prints
       Jodah, the Unifier as "SpongeBob SquarePants". search() has matched flavour names
       for a while, but resolve() and exact() did not -- they missed locally and fell
       through to Scryfall, so a pasted list or an import carrying a printed name needed
       the network, and offline it simply failed. The catalog ships all 513 of them; it
       should answer for them too. Kept in a SEPARATE map so an oracle name always wins:
       a flavour name can never shadow a real card. */
    function add(raw){const prior=byName.get(folded(raw.name)),next=normalize(raw,prior);byName.set(folded(next.name),next);byId.set(next.id,next);
      for(const alias of next.flavorNames||[]){const a=folded(alias);if(a&&!byName.has(a))byAlias.set(a,next);}
      return next;}
    const named=name=>{const n=folded(name);return byName.get(n)||byAlias.get(n)||null;};
    async function load(url){const cached=await options.repository?.cacheGet(url);try{const response=await fetcher(url,{cache:'default'});if(!response.ok)throw Error('HTTP '+response.status);const data=await response.json();options.repository?.cachePut(url,data).catch(()=>{});return data;}catch(error){if(cached)return cached;throw Error('The public card catalog is unavailable offline. Reconnect once to download it, or import a backup containing your cards. '+error.message);}}
    const settled=await Promise.allSettled([load(options.urls.universe),load(options.urls.cards),load(options.urls.facts),options.urls.ranks?load(options.urls.ranks):Promise.resolve(null),options.urls.flavorNames?load(options.urls.flavorNames):Promise.resolve(null)]);
    if(settled[0].status==='fulfilled'){const data=settled[0].value;universeDate=data.generatedAt;for(const [name,ci,rarity,mv,type,rank,commander] of data.cards)add({name,ci,rarity,mv,type,rank,commander:!!commander,verified:true,legalities:{commander:'legal'},updatedAt:universeDate});}
    if(settled[1].status==='fulfilled'){priceDate=settled[1].value.generatedAt||'';for(const c of settled[1].value.cards)add(c);}
    if(settled[2].status==='fulfilled')for(const [name,c] of Object.entries(settled[2].value.cards))add({name,...c});
    for(const c of Object.values(options.savedCards||{}))add(c);
    if(settled[3].status==='fulfilled'&&settled[3].value){const ranks=settled[3].value;rankDate=ranks.generatedAt;const ranked=new Map(ranks.cards.map(c=>[folded(c.name),c]));for(const c of [...byId.values()]){const match=ranked.get(folded(c.name))||ranked.get(folded(c.name.split(' // ')[0]));if(match)add({...c,commanderRank:match.rank});}}
    /* THE NAME ON THE CARD, WHICH IS NOT ALWAYS THE NAME IN THE RULES. A Secret Lair
       prints Jodah, the Unifier as "SpongeBob SquarePants". Somebody typing what is
       written on the card they are holding found nothing here, because the universe bake
       carries oracle names only -- they had to press "Search exact name / link" and wait
       on Scryfall. 513 cards carry a printed name of their own, which is small enough to
       ship, so the search box answers on the first keystroke and offline. Every printed
       name is kept, not just the first: the reader types the one in front of them. */
    if(settled[4].status==='fulfilled'&&settled[4].value){const byOracle=new Map();
      for(const [flavor,name] of settled[4].value.cards||[]){const key=folded(name);if(!byOracle.has(key))byOracle.set(key,[]);byOracle.get(key).push(flavor);}
      for(const [key,names] of byOracle){const c=byName.get(key);if(c)add({...c,flavorName:c.flavorName||names[0],flavorNames:[...new Set([...(c.flavorNames||[]),...names])]});}}
    // An empty offline catalog must not prevent opening backup restore or User Functions.
    function search(query,{commander=false,mechanic='',rankMax=null,limit=80,colors=null}={}){const q=folded(query),m=folded(mechanic),within=colors&&colors.length?new Set(colors):null;return [...byId.values()].filter(c=>(!commander||c.commander&&c.legalities.commander==='legal')&&(!q||folded(c.name).includes(q)||(c.flavorNames||[]).some(f=>folded(f).includes(q)))&&(!m||matchesMechanic(c,m))&&(!within||(c.colorIdentity||[]).every(x=>within.has(x)))&&(rankMax===null||c.commanderRank!==null&&c.commanderRank<=rankMax)).sort((a,b)=>((folded(a.name)===q||(a.flavorNames||[]).some(f=>folded(f)===q))?-1:(folded(b.name)===q||(b.flavorNames||[]).some(f=>folded(f)===q))?1:0)||((commander?a.commanderRank:a.rank)||Infinity)-((commander?b.commanderRank:b.rank)||Infinity)||a.name.localeCompare(b.name)).slice(0,limit);}
    /* LIKE FOR LIKE. A replacement picker that offers the catalog's most popular cards is
       offering nothing: the reader is not replacing a card with a good card, they are
       replacing it with THIS card's understudy -- about this price, doing about this job,
       legal where this one was. Ranked in that order, and every row says why it is there.
         colours   a hard filter. An illegal card is not a replacement.
         price     closeness, not cheapness. A $30 card is a bad answer for a $2 slot and
                   so is a bulk common; both change what the deck costs to build.
         what it does   shared mechanics, roles, triggers, causes, multipliers, grants --
                   the terms the graph joins cards on, which is what makes a swap a swap.
         what it is     the same primary type, weighed last: a sorcery that does the
                   creature's job is often the better card. */
    const LIKE_FIELDS=['mechanics','roles','causes','triggers','multiplies','grants','extends','tribes','wants','makes','wantsStat','offersStat'];
    const GENERIC_ROLE=new Set(['creatures','lands','artifacts','enchantments','instants','sorceries','planeswalkers']);
    function likeTerms(c){const out=new Set();for(const field of LIKE_FIELDS)for(const t of c[field]||[]){if(field==='roles'&&GENERIC_ROLE.has(t))continue;out.add(field+':'+t);}return out;}
    const primaryType=c=>String(c.typeLine||'').split('—')[0].trim().replace(/^(Legendary|Basic|Snow|Artifact |Enchantment )+/,'').trim()||String(c.typeLine||'').split('—')[0].trim();
    function likeness(target,terms,c){
      if(c.id===target.id)return null;
      const shared=[];for(const t of likeTerms(c))if(terms.has(t))shared.push(t.split(':')[1]);
      const p=Number(c.price),p0=Number(target.price);
      /* Closeness on a log scale: within a factor of two is close, a factor of ten is not.
         A card with no recorded price is neither rewarded nor ruled out. */
      const near=p>0&&p0>0?Math.max(0,1-Math.abs(Math.log(p/p0))/Math.log(8)):.35;
      const sameType=primaryType(c)===primaryType(target);
      const score=Math.min(5,shared.length)*3+near*12+(sameType?3:0)
        +(Number.isFinite(c.rank)&&c.rank>0?Math.max(0,3-Math.log10(c.rank)):0);
      const why=[p>0&&p0>0?(Math.abs(p-p0)<=Math.max(.5,p0*.25)?'about the same price':p<p0?'cheaper':'dearer'):'price unknown',
        shared.length?shared.slice(0,3).join(', '):'no shared terms',sameType?primaryType(c):'different type'].filter(Boolean);
      return {card:c,score,shared,near,sameType,why:why.join(' · ')};
    }
    function similar(target,{colors=null,query='',limit=30}={}){
      if(!target)return search(query,{limit}).map(c=>({card:c,score:0,shared:[],why:''}));
      const within=colors&&colors.length?new Set(colors):null,q=folded(query),terms=likeTerms(target);
      const out=[];
      for(const c of byId.values()){
        if(q&&!folded(c.name).includes(q)&&!(c.flavorNames||[]).some(f=>folded(f).includes(q)))continue;
        if(within&&!(c.colorIdentity||[]).every(x=>within.has(x)))continue;
        if(c.legalities&&c.legalities.commander==='banned')continue;
        const row=likeness(target,terms,c);
        if(row)out.push(row);
      }
      return out.sort((a,b)=>b.score-a.score||a.card.name.localeCompare(b.card.name)).slice(0,limit);
    }
    async function resolve(value,{signal,printing}={}){const name=String(value||'').trim();if(printing?.set&&printing?.collector){const found=await options.client.bySetNumber(printing.set,printing.collector,{signal});if(!found)return null;if(folded(found.name)!==folded(name))throw Error(`That printing is ${found.name}, not ${name}. Review the row before import.`);return add({...found,collector:printing.collector,verified:true,source:'Scryfall exact printing',updatedAt:new Date().toISOString()});}const local=named(name);if(local)return local;if(/^https?:\/\//i.test(name)){const result=await options.link.resolveLink(name,{client:options.client,allowManual:false,signal});return result.card?add({...result.card,verified:true,source:name,updatedAt:new Date().toISOString()}):null;}const found=await options.client.named(name,{exact:true,signal});return found?add({...found,verified:true,source:'Scryfall exact name',updatedAt:new Date().toISOString()}):null;}
    /* THE LOWEST-COST PAPER PRINTING. A Scryfall name lookup answers with one printing and
       that printing's price, which is whichever edition Scryfall considers canonical -- often
       not the cheap one. A buyer wants the cheap one. One prints search, cheapest first,
       paper only, and the record carries that price and the set it came from. Best-effort:
       offline or rate-limited, the record keeps the price it had. */
    const CHEAPEST='Scryfall cheapest paper printing';
    async function cheapest(c,{signal}={}){
      if(!c||!options.client?.search)return c;
      try{
        const prints=await options.client.search(`!"${c.name}" game:paper`,{unique:'prints',order:'usd',direction:'asc',maxPages:1,signal});
        const priced=(prints||[]).filter(p=>Number(p.price)>0&&folded(p.name)===folded(c.name)).sort((a,b)=>a.price-b.price);
        if(!priced.length)return c;
        const low=priced[0];
        return add({...c,price:low.price,priceSource:CHEAPEST,priceUpdated:new Date().toISOString().slice(0,10),cheapestSet:low.setName||low.set||'',cheapestSetCode:low.set||'',printings:priced.length});
      }catch{return c;}
    }
    async function details(c,{signal,cheapest:wantCheapest=true,onFail}={}){
      let out=c;
      if(!(c.verified&&c.oracleText&&c.manaCost!==undefined)){try{const raw=await options.client.named(c.name,{exact:true,signal});if(raw)out=add({...raw,verified:true,source:'Scryfall exact name',updatedAt:new Date().toISOString()});}catch(error){onFail?.(error,c);return c;}}
      if(wantCheapest&&out.verified&&out.priceSource!==CHEAPEST)out=await cheapest(out,{signal});
      return out;
    }
    /* LEGALITY IS NOT A FACT YOU BAKE ONCE. The catalog ships the ban list as it stood the
       day it was built, and hydrate() deliberately skips a card that already carries its
       text -- so the best-known cards, which are exactly the ones a ban list moves, are the
       ones never read again. This re-reads a whole list from Scryfall regardless, in one
       request per 75 names, and it is called where the answer starts costing money.
       Unreachable is reported and never guessed: the caller says which facts it stood on. */
    async function recheck(cards,{signal,onProgress}={}){
      const want=[],seen=new Set();
      for(const c of cards||[]){const n=folded(c&&c.name);if(!n||seen.has(n))continue;seen.add(n);want.push(c);}
      if(!want.length)return {checked:[],missing:[],reachable:true};
      if(!options.client?.collection)return {checked:[],missing:[],reachable:false};
      const checked=[],missing=[],stamp=new Date().toISOString();
      try{
        for(let i=0;i<want.length;i+=75){
          const batch=want.slice(i,i+75);
          const result=await options.client.collection(batch.map(c=>({name:c.name})),{signal});
          for(const raw of result.cards||[])checked.push(add({...raw,verified:true,source:'Scryfall legality check',updatedAt:stamp}));
          missing.push(...(result.missing||[]));
          onProgress?.({done:Math.min(want.length,i+75),total:want.length});
        }
      }catch(error){return {checked,missing,reachable:false,error:error.message};}
      return {checked,missing,reachable:true};
    }
    /* THE PRINTED BODY, FOR CARDS THE CATALOG KNOWS ONLY AS ROWS. A graph row has roles and
       mechanics but no rules text; the engine cannot read it and a reader cannot review it.
       /cards/collection takes 75 names a request, so a hundred-card draft is two requests
       and not a hundred. Returns what was filled in and what Scryfall did not know. */
    async function hydrate(cards,{signal,onProgress}={}){
      const need=[],seen=new Set();
      for(const c of cards||[]){if(!c||seen.has(folded(c.name)))continue;seen.add(folded(c.name));const cur=byName.get(folded(c.name))||c;if(!(cur.verified&&cur.oracleText&&cur.typeLine&&cur.manaCost!==undefined))need.push(cur);}
      const hydrated=[],missing=[];
      if(!need.length||!options.client?.collection)return {hydrated,missing};
      const stamp=new Date().toISOString();
      for(let i=0;i<need.length;i+=75){
        const batch=need.slice(i,i+75);
        const result=await options.client.collection(batch.map(c=>({name:c.name})),{signal});
        for(const raw of result.cards||[])hydrated.push(add({...raw,verified:true,source:'Scryfall collection lookup',updatedAt:stamp}));
        missing.push(...(result.missing||[]));
        onProgress?.({done:Math.min(need.length,i+75),total:need.length});
      }
      return {hydrated,missing};
    }
    async function loadGraph(){if(graph)return graph;if(!graphLoading)graphLoading=load(options.urls.graph).then(raw=>{const data=Payload?Payload.unpack(raw):raw;graph=data;graphDate=data.generatedAt||'';/* The catalog's own price wins over the bake's: data/cards.json is refreshed on its own schedule and every total in the app reads it, so a bake with a different day's prices must not move the Shop strip under a deck that was priced before the graph loaded. */for(const c of data.cards){const prior=byName.get(folded(c.name));const keep=prior&&Number.isFinite(prior.price)&&prior.price>0?{price:prior.price,priceFoil:prior.priceFoil,priceUpdated:prior.priceUpdated,priceSource:prior.priceSource,cheapestSet:prior.cheapestSet}:{};add({...c,...keep,oracleId:c.id,legalities:prior?.legalities||{commander:'legal'},verified:true});}return data;}).catch(error=>{graphLoading=null;throw error;});return graphLoading;}
    return {add,search,similar,resolve,details,cheapest,hydrate,recheck,loadGraph,exact:named,get:id=>byId.get(id)||named(id),all:()=>[...byId.values()],load,universeDate,rankDate,dates:()=>({catalog:universeDate,prices:priceDate,ranks:rankDate,graph:graphDate}),available:()=>byId.size};
  }
  /* WHAT A DECK IS ABOUT, READ OFF ITS LIST. definition.mechanics is the owner's word and
     wins when it is set; when it is blank this says what the hundred cards themselves say.
     Three sources, one score per term: the shared MECHANICS labels, counted over the
     non-land cards that match them (halved, since "Counters" matches a lot of text) and
     boosted when the commander plays that way; the classifier's own terms on the cards --
     proliferate, defender, landfall -- counted whole, minus the evergreen keywords and the
     generic roles that describe every deck; and a creature type that a third of the list
     shares, as "<Type> tribal". The top three, the commander's styles breaking ties. */
  const EVERGREEN=new Set(['flying','vigilance','haste','trample','first strike','double strike','deathtouch','lifelink','reach','menace','flash','hexproof','indestructible','ward','scry','cycling','kicker','equip','double','flashback','escape','evoke','surveil','blight']);
  const GENERIC=new Set(['enters-untapped','enters-tapped','enters-tapped-unless','creatures','lands','artifacts','enchantments','instants','sorceries','planeswalkers','ramp','draw','removal','wipe','protection','tokens','counters','sac-outlet','graveyard','treasure']);
  const RAW_LABEL={'sac-outlet':'Sacrifice',graveyard:'Graveyard',recursion:'Recursion',proliferate:'Proliferate',defender:'Defender',landfall:'Landfall',mill:'Mill',treasure:'Treasure',tokens:'Tokens',counters:'Counters',storm:'Storm',lifegain:'Lifegain'};
  const titled=t=>RAW_LABEL[t]||String(t).replace(/-/g,' ').replace(/^\w/,ch=>ch.toUpperCase());
  function deckMechanics(cards,leader,limit=3){
    const list=(cards||[]).filter(c=>c&&!(/\bLand\b/.test(c.typeLine||'')&&!/Creature/.test(c.typeLine||'')));
    if(!list.length)return [];
    const styles=new Set(leader?playStyles(leader):[]),score=new Map(),bump=(label,n)=>score.set(label,(score.get(label)||0)+n);
    /* A label that fits four cards in ten fits most decks -- "ETB triggers", "Combat" -- and
       says little; it counts at a fifth so a real theme outranks it. */
    for(const [label] of MECHANICS){const n=list.filter(c=>matchesMechanic(c,label)).length;if(n||styles.has(label))bump(label,n*(n>list.length*0.4?0.2:0.5)+(styles.has(label)?8:0));}
    const raw=new Map();for(const c of list)for(const t of new Set([...(c.mechanics||[]),...(c.roles||[])]))if(!EVERGREEN.has(t))raw.set(t,(raw.get(t)||0)+1);
    for(const [t,n] of raw){if(GENERIC.has(t)&&!RAW_LABEL[t])continue;if(n>=3)bump(titled(t),n);}
    const tribes=new Map();for(const c of list)for(const t of c.tribes||[])tribes.set(t,(tribes.get(t)||0)+1);
    for(const [t,n] of tribes)if(n>=Math.max(8,Math.round(list.length/3)))bump(t+' tribal',n+4);
    const seen=new Set(),out=[];
    for(const [label] of [...score].sort((a,b)=>b[1]-a[1]||(styles.has(b[0])?1:0)-(styles.has(a[0])?1:0)||a[0].localeCompare(b[0]))){const k=folded(label);if(seen.has(k))continue;seen.add(k);out.push(label);if(out.length>=limit)break;}
    return out;
  }
  return {key,folded,normalize,safeURL,create,MECHANICS,matchesMechanic,playStyles,deckMechanics};
});
