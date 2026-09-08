/* Public card facts are not holdings. This adapter deliberately drops the own,
 * bench and deck flags baked into the historical graph. Names have stable local
 * IDs; Oracle and printing IDs remain separate metadata, so hydration never
 * duplicates a physical copy. Search suggestions never auto-resolve an import.
 */
(function(root,factory){const classifier=typeof module==='object'&&module.exports?require('./card-classify.js'):root.MtgCardClassify;const api=factory(classifier);if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.CrankCatalog=api;})(typeof globalThis!=='undefined'?globalThis:this,function(Classify){
  'use strict';
  const folded=s=>String(s||'').normalize('NFKC').trim().toLowerCase();
  function key(name){return 'card:'+btoa(String.fromCharCode(...new TextEncoder().encode(folded(name)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');}
  function safeURL(raw){try{const u=new URL(raw);return u.protocol==='https:'?u.href:'';}catch{return '';}}
  function normalize(raw,prior={}){const c={...prior,...raw},name=String(c.name||'').trim();if(!name)throw Error('A card needs a name.');const type=c.typeLine||c.type_line||c.type||'',oracle=c.oracleText||c.oracle_text||'',identity=c.colorIdentity||c.color_identity||String(c.ci||'').split('');const tags=Classify.classify({typeLine:type,oracleText:oracle,keywords:c.keywords||[],card_faces:c.faces||c.card_faces||[]});const price=c.price===null?null:Number(c.price);return {id:key(name),oracleId:c.oracleId||c.oracle_id||'',scryfallId:c.scryfallId||'',name,typeLine:type,oracleText:oracle,manaCost:c.manaCost||c.mana_cost||'',manaValue:c.manaValue??c.cmc??c.mv??null,colorIdentity:identity,colors:c.colors||[],keywords:c.keywords||[],power:c.power??null,toughness:c.toughness??null,rarity:c.rarity||'',commander:!!(c.commander||c.isCommander||c.canBeCommander||(/Legendary/.test(type)&&/Creature/.test(type))||/can be your commander/i.test(oracle)),verified:c.verified??!!c.legalities?.commander,legalities:c.legalities||{},mechanics:raw.mechanics||tags.mechanics||[],roles:raw.roles||tags.roles||[],tribes:raw.tribes||tags.tribes||[],requires:raw.requires||tags.requires||[],causes:raw.causes||tags.causes||[],triggers:raw.triggers||tags.triggers||[],produces:raw.produces||tags.produces||[],price:Number.isFinite(price)&&price>0?price:null,priceUpdated:c.priceUpdated||'',priceSource:c.priceSource||'Scryfall snapshot',image:safeURL(c.imageLarge||c.normal||c.image||c.small||('https://api.scryfall.com/cards/named?exact='+encodeURIComponent(name)+'&format=image&version=normal')),set:c.setCode||c.set||'',setName:c.setName||'',collector:c.collector||c.collectorNumber||c.collector_number||'',cheapestSet:c.cheapestSet||'',cheapestSetCode:c.cheapestSetCode||'',printings:c.printings||null,flavorName:c.flavorName||c.flavor_name||'',commanderRank:c.commanderRank??null,rank:c.edhrecRank||c.rank||null,source:c.source||'Bundled Scryfall snapshot',updatedAt:c.updatedAt||'',url:safeURL(c.url||c.scryfallUri||c.scryfall_uri||''),gameChanger:!!(c.gameChanger||c.game_changer),layout:c.layout||'',faces:c.faces||c.card_faces||[]};}
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
    ['Combo',/\bstorm\b|copy target|untap target (?:permanent|artifact|creature|land)|infinite|without paying (?:its|their) mana cost/]
  ];
  function haystack(c){return [c.oracleText,...(c.keywords||[]),...(c.mechanics||[]),...(c.roles||[]),...(c.causes||[]),...(c.triggers||[])].join(' ').toLowerCase();}
  function matchesMechanic(c,label){const entry=MECHANICS.find(([l])=>folded(l)===folded(label));if(!entry)return folded(haystack(c)).includes(folded(label));return entry[1].test(haystack(c));}
  /* The labels a card earns, for "plays as" lines and picker rows. */
  function playStyles(c){return MECHANICS.filter(([l])=>matchesMechanic(c,l)).map(([l])=>l);}
  async function create(options){const byName=new Map(),byId=new Map();let graph=null,universeDate='',rankDate='',graphLoading=null;const fetcher=options.fetchImpl||fetch;
    function add(raw){const prior=byName.get(folded(raw.name)),next=normalize(raw,prior);byName.set(folded(next.name),next);byId.set(next.id,next);return next;}
    async function load(url){const cached=await options.repository?.cacheGet(url);try{const response=await fetcher(url,{cache:'default'});if(!response.ok)throw Error('HTTP '+response.status);const data=await response.json();options.repository?.cachePut(url,data).catch(()=>{});return data;}catch(error){if(cached)return cached;throw Error('The public card catalog is unavailable offline. Reconnect once to download it, or import a backup containing your cards. '+error.message);}}
    const settled=await Promise.allSettled([load(options.urls.universe),load(options.urls.cards),load(options.urls.facts),options.urls.ranks?load(options.urls.ranks):Promise.resolve(null)]);
    if(settled[0].status==='fulfilled'){const data=settled[0].value;universeDate=data.generatedAt;for(const [name,ci,rarity,mv,type,rank,commander] of data.cards)add({name,ci,rarity,mv,type,rank,commander:!!commander,verified:true,legalities:{commander:'legal'},updatedAt:universeDate});}
    if(settled[1].status==='fulfilled')for(const c of settled[1].value.cards)add(c);
    if(settled[2].status==='fulfilled')for(const [name,c] of Object.entries(settled[2].value.cards))add({name,...c});
    for(const c of Object.values(options.savedCards||{}))add(c);
    if(settled[3].status==='fulfilled'&&settled[3].value){const ranks=settled[3].value;rankDate=ranks.generatedAt;const ranked=new Map(ranks.cards.map(c=>[folded(c.name),c]));for(const c of [...byId.values()]){const match=ranked.get(folded(c.name))||ranked.get(folded(c.name.split(' // ')[0]));if(match)add({...c,commanderRank:match.rank});}}
    // An empty offline catalog must not prevent opening backup restore or User Functions.
    function search(query,{commander=false,mechanic='',rankMax=null,limit=80,colors=null}={}){const q=folded(query),m=folded(mechanic),within=colors&&colors.length?new Set(colors):null;return [...byId.values()].filter(c=>(!commander||c.commander&&c.legalities.commander==='legal')&&(!q||folded(c.name).includes(q)||(c.flavorName&&folded(c.flavorName).includes(q)))&&(!m||matchesMechanic(c,m))&&(!within||(c.colorIdentity||[]).every(x=>within.has(x)))&&(rankMax===null||c.commanderRank!==null&&c.commanderRank<=rankMax)).sort((a,b)=>((folded(a.name)===q||folded(a.flavorName)===q)?-1:(folded(b.name)===q||folded(b.flavorName)===q)?1:0)||((commander?a.commanderRank:a.rank)||Infinity)-((commander?b.commanderRank:b.rank)||Infinity)||a.name.localeCompare(b.name)).slice(0,limit);}
    async function resolve(value,{signal,printing}={}){const name=String(value||'').trim();if(printing?.set&&printing?.collector){const found=await options.client.bySetNumber(printing.set,printing.collector,{signal});if(!found)return null;if(folded(found.name)!==folded(name))throw Error(`That printing is ${found.name}, not ${name}. Review the row before import.`);return add({...found,collector:printing.collector,verified:true,source:'Scryfall exact printing',updatedAt:new Date().toISOString()});}const local=byName.get(folded(name));if(local)return local;if(/^https?:\/\//i.test(name)){const result=await options.link.resolveLink(name,{client:options.client,allowManual:false,signal});return result.card?add({...result.card,verified:true,source:name,updatedAt:new Date().toISOString()}):null;}const found=await options.client.named(name,{exact:true,signal});return found?add({...found,verified:true,source:'Scryfall exact name',updatedAt:new Date().toISOString()}):null;}
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
    async function details(c,{signal,cheapest:wantCheapest=true}={}){
      let out=c;
      if(!(c.verified&&c.oracleText&&c.manaCost!==undefined)){try{const raw=await options.client.named(c.name,{exact:true,signal});if(raw)out=add({...raw,verified:true,source:'Scryfall exact name',updatedAt:new Date().toISOString()});}catch{return c;}}
      if(wantCheapest&&out.verified&&out.priceSource!==CHEAPEST)out=await cheapest(out,{signal});
      return out;
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
    async function loadGraph(){if(graph)return graph;if(!graphLoading)graphLoading=load(options.urls.graph).then(data=>{graph=data;for(const c of data.cards){const prior=byName.get(folded(c.name));add({...c,oracleId:c.id,legalities:prior?.legalities||{commander:'legal'},verified:true});}return data;}).catch(error=>{graphLoading=null;throw error;});return graphLoading;}
    return {add,search,resolve,details,cheapest,hydrate,loadGraph,exact:name=>byName.get(folded(name))||null,get:id=>byId.get(id)||null,all:()=>[...byId.values()],load,universeDate,rankDate,available:()=>byId.size};
  }
  return {key,folded,normalize,safeURL,create,MECHANICS,matchesMechanic,playStyles};
});
