/* The Deck Lab: choose a commander, define the deck, draft the 99, measure it, and only
 * then -- on a click that says so -- make it a deck.
 *
 * THE DRAFT IS A PREVIEW. "Run initial draft" used to create a deck in My Decks as a side
 * effect, so trying three budgets left three drafts behind. Now it builds a preview the
 * Lab keeps (and remembers across a reload, in preferences.labPreview, with the cards
 * themselves saved as identities -- never as copies you own). "Save this deck" is the
 * only thing that writes to My Decks, and it is available from the moment the starting
 * point is filled in: a commander alone can be saved and drafted later.
 *
 * MEASUREMENT AND REFINEMENT ARE BOTH CONNECTED. "Measure" runs the real engine through
 * crankmagic-sim.js, in a worker, on the published protocol, against the preview or the
 * saved deck, and files a comparable report. A card the engine cannot read is fetched from
 * Scryfall first -- two requests for a hundred cards -- rather than handed back to the
 * reader as a wall. The two steps between the draft and the report are a measured hill
 * climb: the weakest cards come out of the report's per-card rows, the candidates come
 * out of the graph's relations to the commander, and a swap survives only if a fresh
 * measurement says so. A step that did not happen never lights up: the orb state is
 * derived from stored evidence, and every dark step says what would light it.
 *
 * THE PICKER REACHES EVERY LEGAL COMMANDER. The catalog registers 3,411 of them; the old
 * pane showed the 45 most popular and nothing said so, which read as "only the commanders
 * we already worked with". Now it says how many match, pages through them, filters by
 * colour identity as well as name, play style and rank, and inspects any of them. */
(globalThis.CrankFeatures ||= []).push(function(C){
const {M,esc:e,button:b,field:f,select:s,note,form,modal,actions,views,$}=C;
let leader=null,partner=null,mode='commander',groupId='',deckId='',draftName='',definition=M.defaultDefinition(),pool='all',includeInDeck=false,includeReserved=false;
let preview=null;          // the drafted list that is not yet a deck
let shownLimit=45;         // how many picker rows are drawn before "Show more"
let pickerColors=[];       // the picker's colour-identity filter
let runner=null;
const choices=CrankCatalog.MECHANICS.map(([label])=>label);
const STEPS=['User Input Captured','Initial 99 Cards Chosen','Simulator & 99 Refined','Simulator loops complete','Simulation Report','Completed Deck'];
const COLORS=[['W','White'],['U','Blue'],['B','Black'],['R','Red'],['G','Green']];
const total=rows=>(rows||[]).reduce((n,r)=>n+Number(r.quantity||1),0);
const cardOf=id=>C.state.cards[id]||C.catalog.get(id)||null;
const leadersOf=p=>(p?.commanders||[]).map(cardOf).filter(Boolean);

/* A preview survives a reload only if every card it names is still known. */
function restorePreview(){
  const p=C.state.preferences.labPreview;
  if(!p||!Array.isArray(p.slots)||!p.slots.length)return null;
  if(!p.slots.every(r=>cardOf(r.cardId))||!leadersOf(p).length)return null;
  return p;
}
async function keepPreview(next){preview=next;await C.commit({type:'preferences',values:{labPreview:next}},{renderView:false});}

/* SHARED WITH THE DECK PAGE. The targets, the report renderer and the measuring run used to
   live inside the Lab view, which meant the deck page could show a report only as raw JSON
   until the Lab had been opened once in the session. They sit at module scope now and are
   handed over on C, so Simulation history on My Decks draws the same report the Lab does and
   can run the same measurement without sending the reader here. */
let simInputsCache=null;
let simConfig=null;   // the sim config once fetched; report targets fall back to the config defaults without it
const simInputs=()=>(simInputsCache||=Promise.all([fetch(CrankAssets.simConfig).then(r=>r.json()),fetch(CrankAssets.simOpponents).then(r=>r.json())]).then(pair=>{simConfig=pair[0];return pair;}));
const pct=v=>`${(Number(v||0)*100).toFixed(1)}%`;
  /* WHAT "GOOD ENOUGH" MEANS, and the fact that a person chose it rather than measured it.
   *
   * "Run until the stats are in the target range" needs a target, and the engine has none:
   * it returns a 0-100 composite and a set of rates. So the targets come from the Deck
   * Definition the reader already filled in, and they are a DECLARED CONVENTION -- written
   * here in the open so they can be argued with, not buried in a weighting.
   *
   * Win rate: every seat of a four-player pod has a 25% share of the wins. Competitiveness
   * 3 is "hold your own", so its target is that share; 1 is a deck not trying to beat the
   * table and 5 is one that is. Clock: speed is how soon you want the game over, read off
   * the average winning turn. Everything else is sim/config.json's own targets -- the same
   * numbers the score is already computed against, so the pass and the score agree. */
  const WIN_TARGET={1:.15,2:.20,3:.25,4:.30,5:.35};
  const CLOCK_TARGET={1:16,2:14,3:12,4:11,5:10};
  const band=(n,fallback)=>Math.min(5,Math.max(1,Number(n)||fallback));
  function targetsFor(result,def,config){
    if(!result)return [];
    const t=(config&&config.targets)||{},comp=band(def.competitiveness,3),speed=band(def.speed,3);
    const winWant=WIN_TARGET[comp],clockWant=CLOCK_TARGET[speed];
    const screwWant=t.screwPct??.1,floodWant=t.floodPct??.08,deadWant=t.deadCardsAtT8??2;
    return [
      {key:'winRate',label:'Wins its share',ok:result.winRate>=winWant,
       reads:`${pct(result.winRate)} of games won · target ${pct(winWant)} at competitiveness ${comp}`},
      {key:'clock',label:'Closes on time',ok:!result.avgWinTurn||result.avgWinTurn<=clockWant,
       reads:result.avgWinTurn?`wins on turn ${result.avgWinTurn.toFixed(1)} · target turn ${clockWant} at speed ${speed}`:'no game was won, so there is no clock'},
      {key:'commander',label:'Gets the commander down',ok:result.commanderCastRate>=.9,
       reads:`commander cast in ${pct(result.commanderCastRate)} of games · target 90%`},
      {key:'screw',label:'Casts its spells',ok:result.screwPct<=screwWant,
       reads:`mana screwed in ${pct(result.screwPct)} · target ${pct(screwWant)}`},
      {key:'flood',label:'Draws action, not lands',ok:result.floodPct<=floodWant,
       reads:`flooded in ${pct(result.floodPct)} · target ${pct(floodWant)}`},
      {key:'deadCards',label:'Keeps its hand live',ok:result.deadCardsAtT8<=deadWant,
       reads:`${Number(result.deadCardsAtT8||0).toFixed(1)} uncastable cards in hand at turn 8 · target ${deadWant}`}
    ];
  }

  /* THE REPORT, ON THE STEP THAT NAMES IT. "Simulation Report" was a label; the numbers
     behind the score badge were in a different view, or nowhere for a preview. */
  /* The evidence pack stores every rate as a percentage in a {value, unit} box, because
     that is what gets exported and read a month later. The targets are computed on rates.
     One adapter, here, rather than a second copy of the target table in report shape. */
  const rawFrom=m=>({winRate:(m.winRate&&m.winRate.value||0)/100,avgWinTurn:m.averageWinTurn&&m.averageWinTurn.value||0,
    commanderCastRate:(m.commanderCastRate&&m.commanderCastRate.value||0)/100,screwPct:(m.manaScrew&&m.manaScrew.value||0)/100,
    floodPct:(m.manaFlood&&m.manaFlood.value||0)/100,deadCardsAtT8:m.deadCardsAtTurnEight&&m.deadCardsAtTurnEight.value||0});
  /* The engine writes a loss cause as "<seat key> combo" or a bare word like "damage".
     "Combo combo" is what the first reading of that gives you, which is nobody's idea of
     a sentence. */
  const title=t=>String(t||'').replace(/^\w/,ch=>ch.toUpperCase());
  const lossLabel=cause=>{
    const text=String(cause||'').trim();
    const seat=text.match(/^(.*)\s+combo$/);
    return seat?`${title(seat[1])} seat's combo`:title(text)||'Unknown';
  };
  function reportHTML(r,def){
    if(!r)return '<p>No measurement has been run on this list yet.</p>';
    const m=r.metrics||{};
    const targets=r.targets||targetsFor(rawFrom(m),def||definition,simConfig);
    const row=(label,metric,suffix)=>metric&&metric.value!==null&&metric.value!==undefined
      ? `<span>${e(label)} <strong>${e(String(metric.value))}${e(suffix||metric.unit&&(' '+metric.unit)||'')}</strong></span>` : '';
    /* SAID BEFORE THE SCORE, NOT AFTER IT. A reader who scrolls to a number and stops
       has to meet this first, because it is the sentence that says what the number
       leaves out. */
    const blind=(m.winPathsTheEngineCannotWatch&&m.winPathsTheEngineCannotWatch.value)||0;
    const blindNote=blind?note(`This list carries ${blind} card${blind===1?'':'s'} that say "you win the game"${(r.unwatchedWinCards||[]).length?' — '+(r.unwatchedWinCards||[]).join(', '):''}. The engine reads the card and not the condition on it, so the way this deck really wins is not in the score below; it is scored as the creatures and spells around that card. Rank it against another combo list, not against a creature deck.`,true):'';
    return blindNote+`<div class="cm-count-list">
        ${row('Score',m.score)}${row('Standard error',m.scoreStandardError)}${row('Win rate',m.winRate)}
        ${row('Average winning turn',m.averageWinTurn)}${row('Commander cast rate',m.commanderCastRate)}
        ${row('Average commander turn',m.averageCommanderTurn)}${row('Turn-capped games',m.incompleteGames)}
        ${row('Mana screw',m.manaScrew)}${row('Mana flood',m.manaFlood)}${row('Dead cards by turn 8',m.deadCardsAtTurnEight)}
        ${row('Pod experience',m.podExperience)}${row('Answer in hand',m.answerInHand)}
        ${row('Idle turns for the other seats',m.idleTurnsForOthers)}${row('Seats still playing at the end',m.seatsStillPlayingAtTheEnd)}
        ${row('First elimination',m.firstEliminationTurn)}${row('Spells cast per game',m.spellsCastPerGame)}
        ${row('Biggest turn',m.biggestTurn)}${row('Cards the engine could read',m.cardsTheEngineCouldRead)}
      </div>
      <p class="cm-muted">${e(r.protocol)} · ${(r.conditions&&r.conditions.seedCount)||'?'} seeds of ${((r.conditions&&r.conditions.gamesPerSeed)||0).toLocaleString()} games · ${((r.run&&r.run.games)||0).toLocaleString()} games in ${(((r.run&&r.run.elapsedMs)||0)/1000).toFixed(1)}s</p>
      ${(r.scoreParts||[]).length?`<h3 class="cm-section-heading">How the score was made</h3>
        <div class="cm-table-wrap"><table class="cm-table"><thead><tr><th>What it measures</th><th>Scored</th><th>Of</th><th>What the engine saw</th></tr></thead><tbody>${r.scoreParts.map(x=>`<tr><td>${e(x.label)}</td><td>${e(String(x.points))}</td><td>${e(String(x.max))}</td><td class="cm-muted">${e(x.reads||'')}</td></tr>`).join('')}</tbody></table></div>
        <p class="cm-muted">Ordered by points lost, so the row that costs this deck the most is first. These are the nine terms the composite is built from; nothing else moves the number.</p>`:''}
      ${targets.length?`<h3 class="cm-section-heading">Against the targets for this build</h3>
        <div class="cm-count-list">${targets.map(t=>`<span>${t.ok?'✓':'✕'} ${e(t.label)} <strong>${e(t.reads)}</strong></span>`).join('')}</div>`:''}
      ${(r.lossCauses||[]).length?`<h3 class="cm-section-heading">What ended the games this deck lost</h3>
        <div class="cm-count-list">${r.lossCauses.map(x=>`<span>${e(lossLabel(x.cause))} <strong>${(x.rate*100).toFixed(1)}% of games</strong></span>`).join('')}</div>
        <p class="cm-muted">The one figure here that answers "why did I lose" rather than "how often". A deck losing to one seat's combo needs a different card than a deck losing to damage.</p>`:''}
      ${(r.perCard||[]).length?`<details class="cm-details"><summary>Per-card: what the engine drew, played and won with (${r.perCard.length} rows)</summary>
        <p class="cm-muted">Ranked by the figure that actually separates one card from another here: how often a card was drawn and still sat uncastable in hand on turn eight. Cast rate cannot rank a list — a game runs long enough that nearly every drawn spell is eventually cast, so almost the whole list sits near 100%. Lands are marked; a land's cast rate is how often a drawn copy reached the battlefield. "Dead" is exactly 100% minus cast, which is why it is not a column.</p>
        <div class="cm-table-wrap"><table class="cm-table"><thead><tr><th>Card</th><th>Seen</th><th>Played when seen</th><th>Average turn</th><th>Stuck at turn 8</th><th>Win rate when cast</th></tr></thead><tbody>${r.perCard.slice().sort((a,b)=>(b.stuckRate||0)-(a.stuckRate||0)||a.castRate-b.castRate).map(x=>`<tr><td>${e(x.name)}${x.isCommander?' <small class="cm-muted">commander</small>':x.isLand?' <small class="cm-muted">land</small>':''}</td><td>${((x.drawnRate||0)*100).toFixed(0)}%</td><td>${(x.castRate*100).toFixed(0)}%</td><td>${x.avgCastTurn||'—'}</td><td>${((x.stuckRate||0)*100).toFixed(0)}%</td><td>${(x.winRateWhenCast*100).toFixed(0)}%</td></tr>`).join('')}</tbody></table></div></details>`:''}
      ${(r.perSeedScores||[]).length>1?`<h3 class="cm-section-heading">How much of this is seed noise</h3>
        <div class="cm-count-list">${r.perSeedScores.map((x,i)=>`<span>Seed ${i+1} <strong>${Number(x).toFixed(2)}</strong></span>`).join('')}<span>Spread <strong>${(Math.max(...r.perSeedScores)-Math.min(...r.perSeedScores)).toFixed(2)} points</strong></span></div>
        <p class="cm-muted">Each seed is an independent set of games on the same hundred. A spread wider than the standard error above means the difference you are looking at between two lists may be the shuffle rather than the list.</p>`:''}
      ${(r.endTurnCounts||[]).length?(()=>{const rows=r.endTurnCounts,total=rows.reduce((n,x)=>n+x.games,0),peak=Math.max(...rows.map(x=>x.games));
        return `<h3 class="cm-section-heading">When the games ended</h3>
        <div class="cm-turn-hist">${rows.map(x=>`<div><i style="height:${Math.max(2,Math.round(x.games/peak*100))}%"></i><span>${x.turn}</span></div>`).join('')}</div>
        <p class="cm-muted">Games by the turn they finished, out of ${total.toLocaleString()}. An average of ${m.averageWinTurn?m.averageWinTurn.value:'—'} means something different for one hump than for two, and only this says which it is.</p>`;})():''}
      ${(r.coverage&&(r.coverage.unreadable||[]).length)?`<details class="cm-details"><summary>${r.coverage.unreadable.length} card${r.coverage.unreadable.length===1?'':'s'} the engine could not read</summary>
        <p class="cm-muted">These carry no oracle text the engine could classify, so they were played as blanks. The score above is a claim about the other ${(r.coverage.known||0)} cards.</p>
        <div class="cm-count-list">${r.coverage.unreadable.slice(0,60).map(x=>`<span>${e(typeof x==='string'?x:(x&&x.name)||'Unknown')}</span>`).join('')}</div></details>`:''}
      ${note((r.limits||[]).join(' '))}`;
  }
  /* MEASURE A SAVED DECK FROM WHEREVER IT IS SHOWN. The Lab's Measure step and the deck
     page's Measure again are the same run on the same protocol; this is that run without the
     Lab's preview bookkeeping. `say` is wherever progress should be written. The report is
     filed with the deck the moment the run ends. */
  async function measureDeck(deckId,say=()=>{}){
    const d=M.deck(C.state,deckId);
    let lineup=CrankSim.lineupFor(C.state,d),cover=CrankSim.coverage(lineup);
    if(!cover.total)throw Error('This deck has no cards to measure yet. Add cards with Edit card list first.');
    if(cover.ratio<.95){
      say(`Fetching card text for ${cover.unreadable.length} cards…`);
      const need=cover.unreadable.map(n=>C.catalog.exact(n)||{name:n});let missing=[];
      try{const got=await C.catalog.hydrate(need,{onProgress:m=>say(`Fetching card text · ${m.done} of ${m.total}`)});missing=got.missing;if(got.hydrated.length)await C.commit({type:'cards',cards:got.hydrated},{renderView:false});}
      catch(err){throw Error('The engine cannot read '+cover.unreadable.length+' cards and Scryfall could not be reached to fetch their text ('+err.message+'). Reconnect and measure again.');}
      lineup=CrankSim.lineupFor(C.state,d);cover=CrankSim.coverage(lineup);
      if(cover.ratio<.95)throw Error(`After asking Scryfall the engine still cannot read ${cover.unreadable.length} card${cover.unreadable.length===1?'':'s'}: ${cover.unreadable.slice(0,6).join(', ')}${cover.unreadable.length>6?' and '+(cover.unreadable.length-6)+' more':''}.${missing.length?' Scryfall did not know: '+missing.slice(0,4).join(', ')+'.':''}`);
    }
    CrankSim.assertMeasurable(cover,'published');
    const plan=CrankSim.protocolFor('published');
    runner=runner||CrankSim.createRunner();
    if(runner.busy)throw Error('A measurement is already running.');
    const [config,opponents]=await simInputs();
    say('Measuring… seed 0 of '+plan.seedCount);
    const result=await runner.measure({protocol:'published',lineup,config,opponents,table:config.table,onProgress:m=>say(`Measuring… seed ${m.done} of ${m.total} · ${m.mean} points so far`)});
    const report=CrankSim.packFor(result,{protocol:'published',table:config.table,seatCount:(opponents.tables[config.table]||[]).length,cardsVersion:CrankAssets.cards,coverage:cover});
    await C.commit({type:'report',deckId:d.id,report});
    return {report,result};
  }
C.reportHTML=(r,def)=>reportHTML(r,def);
C.measureDeck=measureDeck;

views.lab=async()=>{
  preview=preview||restorePreview();
  const last=C.state.preferences.lastLabRun,saved=last?C.state.decks.find(x=>x.id===last.deckId):null;
  if(preview&&!leader)leader=leadersOf(preview)[0]||null;
  C.main.innerHTML=C.head('Deck Lab · Find a commander → build the 99','The deck you want to play.','Start with a commander or an existing list. Define the deck, draft the initial cards, measure them, then save what you decide to keep.',b('?','lab-help'))
    +`<div class="cm-lab-grid"><section class="v-panel"><form id="cm-lab-form"><div class="cm-lab-start"><h2>Starting point</h2>
    <!-- Written out rather than built by select(), because the required mark belongs on the
         CONTROL here, not trailing the sentence. The shared helper puts the mark after the
         label text, which is right for a short field label and wrong for a whole instruction:
         at full width the select drops to its own line and the mark was left stranded at the
         far right of a line it had nothing to do with. As the select's own next sibling it
         sits on the select's top-right corner wherever the select ends up. -->
    <label class="cm-start-label">Select to proceed by defining the Commander or uploading an Existing Build
      <span class="cm-start-control">
        <select name="mode" aria-label="Select to proceed by defining the Commander or uploading an Existing Build" required aria-required="true">${C.options([['commander','Select Commander → Auto-build 99'],['list','Existing deck']],mode)}</select>
        <span class="cm-req" aria-hidden="true" title="Required">*</span>
      </span>
    </label>
    <!-- One control, both modes. It used to be an "Initial card pool" select buried in Deck
         Definition, which is closed by default and only had any effect on the commander
         path -- so a reader building from a list had no way to say "only what I own" at
         all. Here it is a checkbox in the one section that is always open, and it means the
         same thing on both roads: the draft may only use copies you actually have. -->
    <label class="cm-checkbox cm-start-owned"><input name="ownedOnly" type="checkbox" ${pool==='owned'?'checked':''}>Use only cards I own</label>
    <p class="cm-error cm-full" id="cm-lab-error" hidden role="alert"></p></div>
    <details class="cm-lab-section" id="cm-lab-commander" ${mode==='commander'?'open':''} ${mode==='commander'?'':'hidden'}><summary class="cm-section-heading">Commander choice</summary><p class="cm-muted">Search or enter a commander from among the ${(Math.floor(C.catalog.all().filter(c=>c.commander&&c.legalities?.commander==='legal').length/100)*100).toLocaleString()}+ legal commanders in MtG. You can paste a Scryfall link instead of a name. These filters only choose the commander.</p>
    <div class="cm-form-grid">${f('Search commander name','commanderQuery',leader?.name||'',`${mode==='commander'?'required ':''}autocomplete="off" placeholder="Name, printed variant name, or a Scryfall link"`)}${s('Play style filter','commanderMechanic',[['','Any play style'],...choices],'')}${s('EDHREC rank filter','rank',[['','Any rank'],['100','Top 100'],['500','Top 500'],['1000','Top 1,000']],'')}
    <div><span class="cm-muted" style="font-size:13px">Colour identity within</span><div class="cm-color-pills">${COLORS.map(([k,name])=>`<label class="cm-color-pill" title="${e(name)}"><input type="checkbox" name="commanderColor" value="${k}" ${pickerColors.includes(k)?'checked':''}><img src="assets/mana/${k}.svg?v=1" alt="">${k}</label>`).join('')}<label class="cm-color-pill" title="Colorless commanders only"><input type="checkbox" name="commanderColor" value="C" ${pickerColors.includes('C')?'checked':''}>C</label></div></div></div>
    <details class="cm-lab-section cm-lab-subsection" id="cm-lab-picker" open><summary class="cm-section-heading">Matching commanders</summary><div class="cm-commander-results" id="cm-lab-results"></div></details>
    <div class="cm-actions">${b('Record an unlisted commander','lab-manual')}${b('Add partner / second commander','lab-partner')}${b('Remove second commander','lab-unpartner')}</div>
    <div id="cm-lab-selected"></div>
    <p class="cm-muted">EDHREC commander popularity · past 2 years · snapshot: ${e(C.catalog.rankDate?.slice(0,10)||'date unavailable')}. Results are ordered by rank; unranked commanders follow. A rank filter excludes unknown and combined-pair ranks.</p></details>
    <details class="cm-lab-section" id="cm-existing-list" ${mode==='list'?'open':''} ${mode==='list'?'':'hidden'}><summary class="cm-section-heading">Existing deck</summary><p class="cm-start-pick">Start from a deck you already have<span class="cm-req" aria-hidden="true" title="Required">*</span></p>${s('Existing deck','existingDeck',[['','Choose a deck'],...C.state.decks.filter(x=>!x.archived).map(x=>[x.id,x.name])],deckId,mode==='list'?'required':'')}<div id="cm-list-commander">${listCommanderField()}</div><div class="cm-actions" style="margin-top:12px">${b('Create a deck','new-deck')}${b('Import a list','import-list')}</div></details>
    <details class="cm-lab-section" id="cm-lab-definition"><summary class="cm-section-heading">Deck Definition</summary><p class="cm-muted">These inputs apply to the full list and the way you want it to play.</p>
    <div class="cm-form-grid">${f('Deck name','deckName',draftName,'placeholder="Named for you if you leave it blank"')}${s('Primary play style','mechanic',[['','Open to exploration'],...choices],definition.mechanics[0]||'')}${s('Base bracket','baseBracket',[1,2,3,4,5],definition.baseBracket)}${s('Bracket ceiling','bracketCeiling',[1,2,3,4,5],definition.bracketCeiling)}${f('Total deck price cap ($)','budget',definition.budget??'','type="number" min="0" step="0.01" placeholder="No cap"')}${f('Per-card cap ($)','perCardCap',definition.perCardCap??'','type="number" min="0" step="0.01" placeholder="No cap"')}${s('Play style','playStyle',['Balanced','Aggressive','Reactive','Value engine','Combo'],definition.playStyle)}${s('Speed','speed',[1,2,3,4,5],definition.speed)}${s('Competitiveness','competitiveness',[1,2,3,4,5],definition.competitiveness)}${s('Saltiness','saltiness',[[1,'1 · Extremely friendly'],[2,'2 · Friendly'],[3,'3 · Assertive'],[4,'4 · Disruptive'],[5,'5 · Any legal winning mechanic']],definition.saltiness)}<label class="cm-checkbox"><input name="inDeck" type="checkbox" ${includeInDeck?'checked':''}>Consider cards currently In deck</label><label class="cm-checkbox"><input name="reserved" type="checkbox" ${includeReserved?'checked':''}>Consider unlocked reserved copies</label><label class="cm-checkbox"><input name="sellTrade" type="checkbox" ${definition.reuse.includeSellTrade!==false?'checked':''}>Include available Sell / Trade copies</label><label class="cm-full">Restrictions and preferences<textarea name="restrictions">${e(definition.restrictions)}</textarea></label></div>
    ${note('A total price cap is planned, not merely obeyed: basics do the cheap work, no single card takes more than a few times an even share of the cap, and the list always completes or says what cap would complete it. Unknown prices are excluded when a cap is set. Bracket ceiling limits Game Changers (none below 3, three at 3). Play style, speed and saltiness still require your review: the simulator measures a finished list, it does not yet refine one against these inputs.')}</details>
    </form></section>${runPane(saved)}</div>`;

  const results=$('#cm-lab-results'),lab=$('#cm-lab-form');
  function search(){
    const q=lab.elements.commanderQuery.value,mech=lab.elements.commanderMechanic.value,rankMax=lab.elements.rank.value?Number(lab.elements.rank.value):null;
    const colorless=pickerColors.includes('C');
    let rows=C.catalog.search(q,{commander:true,mechanic:mech,rankMax,limit:Infinity,colors:pickerColors.filter(k=>k!=='C')});
    if(colorless)rows=rows.filter(c=>!(c.colorIdentity||[]).length);
    const shown=rows.slice(0,shownLimit),narrowed=q||mech||rankMax||pickerColors.length;
    results.innerHTML=rows.length?`<p class="cm-muted cm-picker-count">${rows.length.toLocaleString()} legal commander${rows.length===1?'':'s'} match · showing ${shown.length} by EDHREC popularity${narrowed?'':' — type a name, or filter by play style or colour'}. Only the most-played thousand carry a rank; the rest follow, marked unranked.</p>`
      +shown.map(c=>{const styles=CrankCatalog.playStyles(c).slice(0,2).join(' · ');return `<div class="cm-commander-result cm-picker-row"><button type="button" class="cm-picker-choose" data-lab-commander="${e(c.id)}"><strong>${e(c.name)}</strong>${c.flavorName?`<em>${e(c.flavorName)}</em>`:''}</button><span class="cm-picker-cost">${c.manaValue!==null&&c.manaValue!==undefined?`<small class="cm-muted">MV ${e(String(c.manaValue))}</small>`:''}</span>${C.colors(c.colorIdentity)}<span class="cm-picker-meta">${c.commanderRank?'#'+Number(c.commanderRank).toLocaleString()+' · ':'<span class="cm-unranked" title="EDHREC publishes the most-played thousand; this commander is not among them.">unranked</span> · '}${e(styles||c.mechanics[0]||c.keywords[0]||'Explore abilities')}</span><button type="button" class="cm-text-button" data-lab-inspect="${e(c.id)}">Inspect</button></div>`;}).join('')
      +(rows.length>shown.length?`<button type="button" class="v-button" data-lab-more>Show ${Math.min(45,rows.length-shown.length)} more of ${rows.length.toLocaleString()}</button>`:'')
      :'<p>No matching local commander. Search the exact name or provide its Scryfall link.</p>';
  }
  function chosen(){
    document.querySelector('[data-action=lab-unpartner]').hidden=!partner;
    const leaders=[leader,partner].filter(Boolean);
    $('#cm-lab-selected').innerHTML=leaders.map(c=>`<div class="cm-selected-commander">${c.image?`<img class="cm-card-thumb cm-card-thumb-lg" src="${e(c.image)}" alt="">`:'<span class="cm-card-thumb cm-card-thumb-lg"></span>'}<div><strong>${e(c.name)}</strong> ${C.colors(c.colorIdentity)} ${c.manaCost?C.mana(c.manaCost):''}<p>${e(c.typeLine)}${CrankCatalog.playStyles(c).length?' · '+e(CrankCatalog.playStyles(c).slice(0,4).join(' · ')):''}</p><div class="cm-actions">${b('Inspect commander','card',{card:c.id})}</div></div></div>`).join('')||note('Choose a commander above.');
    syncStartButtons();
  }
  /* WHICH CARD IS THE COMMANDER, ASKED WHERE YOU CAN ANSWER IT.
   *
   * A group is a box of cards; nothing about it says which one leads. The build refused
   * without a commander and told the reader to "choose one above" -- above being the
   * commander section, which this mode HIDES. So the instruction pointed at nothing and the
   * road ended.
   *
   * The list itself usually knows: exactly one legal commander among the cards is the
   * answer, and it is taken without asking. When the list holds several, they are offered
   * here, in the section the reader is already looking at. When it holds none, the picker
   * that reaches all 3,400 is one button away. */
  /* The same two sources the build reads, resolved the same way -- including the fallback
     to the group's own lots when it holds copies rather than planned entries. Reading them
     differently here is how the picker ends up offering a commander the build cannot see. */
  /* Queried rather than closed over: this runs while the form's own markup is being built,
     which is before `lab` is bound, and a const in its dead zone throws on the identifier --
     `?.` does not save you from that. Before the form exists the module's last values stand
     in, which is what a restored render wants anyway. */
  /* THE LIST IS A DECK'S HUNDRED. A collection group used to be the other way in, which
     meant the Lab had to guess a leader out of whatever the group held -- twelve candidates
     and no way to know. A deck already names its commander and already carries the group it
     draws from, so choosing a deck answers both questions and there is one road, not two. */
  function chosenDeck(){
    const form=document.getElementById('cm-lab-form');
    const id=form?form.elements.existingDeck.value:deckId;
    return id&&C.state.decks.some(d=>d.id===id)?M.deck(C.state,id):null;
  }
  function listRows(){
    const d=chosenDeck();
    if(!d)return [];
    return d.slots.filter(r=>r.purpose==='main');
  }
  function listCards(){
    const ids=[...new Set(listRows().map(r=>r.cardId))];
    return ids.map(id=>C.catalog.get(id)||C.state.cards[id]).filter(Boolean);
  }
  /* A declaration, not a const arrow: the markup above calls this while it is being built,
     and a const in its dead zone throws where a hoisted function simply works. */
  function legalCommanders(){return listCards().filter(c=>c.commander&&c.legalities?.commander==='legal');}
  /* ONE CONTROL FOR ONE QUESTION. This used to be a dropdown of the list's legal commanders
     beside a button that opened every commander in Magic -- two fields doing one job, and the
     button's list did not contain the deck's own leader, which read as the dropdown being
     wrong. The deck declares its commander, so that is the answer; the dropdown offers the
     other legal commanders in the same deck, and nothing offers anything outside it. */
  /* MATCH ON THE NAME, NOT ONLY THE ID. A card reaches this list through the catalog, whose
     id for a card is not the id the library filed it under, so comparing ids alone put the
     deck's own commander in the dropdown twice -- once as itself and once as its catalog
     twin. The name is the identity these two agree on. */
  const sameCard=(c,name)=>!!c&&!!name&&c.name===name;
  function listCommanderField(){
    const d=chosenDeck(),found=legalCommanders();
    const declaredName=d&&d.commanders.length?(C.state.cards[d.commanders[0]]||{}).name||'':'';
    const chosen=(leader&&found.find(c=>c.id===leader.id||c.name===leader.name))||found.find(c=>sameCard(c,declaredName))||null;
    const options=found.map(c=>[c.id,c.name]);
    if(!options.length)options.push(['','No legal commander in this deck yet']);
    return s('Commander for this deck','listCommander',options,chosen?chosen.id:'')
      +`<p class="cm-muted cm-list-commander-note">${!d?'Choose a deck above and its commander appears here.'
        :sameCard(chosen,declaredName)?`${e(declaredName)} leads, as this deck declares. Change it to any other legal commander in the deck.`
        :found.length?'Any legal commander in this deck can lead it.'
        :'This deck holds no Commander-legal creature yet.'}</p>`;
  }
  function refreshListCommander(){
    const host=document.getElementById('cm-list-commander');if(!host)return;
    const found=legalCommanders();
    if(!leader&&found.length===1)leader=found[0];
    if(leader&&found.length&&!found.some(c=>c.id===leader.id||c.name===leader.name)&&!document.getElementById('cm-lab-form')?.elements.listCommander?.value)leader=found[0];
    host.innerHTML=listCommanderField();
    syncStartButtons();
  }

  function canSave(){return mode==='list'?Boolean(lab.elements.existingDeck.value):Boolean(leader);}
  /* Step 1's button and step 5's answer the same question -- is there a starting point --
     and the form can change that without a re-render, so both are re-checked wherever it
     does. Reading the form rather than the module's copy of it is deliberate: the module
     learns about a picked commander a beat later. */
  function syncStartButtons(){
    const ready=canSave();
    for(const id of ['#cm-lab-run','#cm-lab-save']){
      const el=$(id);if(!el)continue;
      el.disabled=!ready;
      const row=el.closest('li'),small=row&&row.querySelector('[data-step-note]');
      /* The reason moves with the button. Flipping `disabled` alone left "Choose a
         commander" printed under a step you had just chosen a commander for. */
      if(ready)el.removeAttribute('title');else if(small)el.title=small.dataset.stepWhy;
      if(small){const text=ready?small.dataset.stepNote:small.dataset.stepWhy;small.textContent=text;small.hidden=!text;}
    }
  }
  /* The deck says who leads it. Choosing a deck adopts that commander outright, rather than
     leaving the reader to find it among the hundred cards the deck happens to contain. */
  function adoptDeckCommander(){
    const d=chosenDeck();
    leader=null;
    if(d&&d.commanders.length){
      const card=C.state.cards[d.commanders[0]];
      if(card)leader=C.catalog.get(card.id)||C.catalog.exact(card.name)||card;
    }
    if(leader&&lab.elements.commanderQuery)lab.elements.commanderQuery.value=leader.name;
    chosen();
  }
  results.addEventListener('click',ev=>{
    const more=ev.target.closest('[data-lab-more]');if(more){shownLimit+=45;search();return;}
    const inspect=ev.target.closest('[data-lab-inspect]');if(inspect){C.inspector(inspect.dataset.labInspect).catch(err=>C.notice(err.message,true));return;}
    const el=ev.target.closest('[data-lab-commander]');if(el){leader=C.catalog.get(el.dataset.labCommander);lab.elements.commanderQuery.value=leader.name;chosen();results.innerHTML='';}
  });
  for(const name of ['commanderQuery','commanderMechanic','rank'])lab.elements[name].addEventListener('input',()=>{shownLimit=45;search();});
  /* THE LINK IS PART OF THE SEARCH BOX NOW. This used to be a separate "Search exact name /
     link" button, which read as broken: the field beside it already searched live as you
     typed, so for any name in the list the button did visibly nothing, and its one unique
     power -- pasting a Scryfall URL for a printing the list cannot rank -- was advertised
     nowhere a reader would look. The capability is what matters, not the button: paste a
     link and it resolves, press Enter and the exact name resolves. */
  const resolveTyped=()=>{
    const typed=lab.elements.commanderQuery.value.trim();
    if(!typed||typed===leader?.name)return;   // nothing to look up, or already looked up
    actions['lab-resolve']().catch(err=>C.notice(err.message,true));
  };
  lab.elements.commanderQuery.addEventListener('keydown',ev=>{
    if(ev.key!=='Enter')return;
    ev.preventDefault();   // Enter in a single-field form would otherwise submit it
    resolveTyped();
  });
  lab.elements.commanderQuery.addEventListener('paste',ev=>{
    const text=(ev.clipboardData||{}).getData?.('text')||'';
    if(/^\s*https?:\/\//i.test(text))setTimeout(resolveTyped,0);   // after the paste lands in the field
  });
  lab.addEventListener('change',ev=>{if(ev.target.name==='commanderColor'){pickerColors=[...lab.querySelectorAll('[name=commanderColor]:checked')].map(i=>i.value);shownLimit=45;search();}if(ev.target.name==='existingDeck'){adoptDeckCommander();refreshListCommander();syncStartButtons();}
    if(ev.target.name==='listCommander'){const id=ev.target.value;leader=id?(C.catalog.get(id)||C.state.cards[id]||null):null;refreshListCommander();}});
  /* ONE SECTION OPEN AT A TIME, AND THE OTHER ONE NOT THERE AT ALL. The form asks two
     different questions depending on the starting point, and it used to ask both at once:
     a full commander picker sitting above an Existing cards block that did nothing, or
     the reverse. Now the half that does not apply is removed rather than dimmed, the half
     that does is open, and Deck Definition folds away until it is wanted -- it is the same
     set of inputs either way, and it is the longest thing on the page. */
  function applyMode(){
    const commander=$('#cm-lab-commander'),existing=$('#cm-existing-list'),definition=$('#cm-lab-definition');
    if(commander){commander.hidden=mode!=='commander';commander.open=mode==='commander';}
    if(existing){existing.hidden=mode!=='list';existing.open=mode==='list';}
    if(definition)definition.open=false;
    /* THE HIDDEN FIELD THAT ATE THE RUN BUTTON. Search commander name is `required`, and in
       list mode it sits in a section that is `hidden` -- so the form was invalid, the
       browser could not focus the control to say why, reportValidity() returned false, and
       Run did nothing at all. Chrome logs "An invalid form control with name='commanderQuery'
       is not focusable" and shows the reader nothing. The requirement follows the mode now:
       a commander name is required when you are starting from a commander. */
    const query=lab.elements.commanderQuery,pick=lab.elements.existingDeck;
    if(query)query.required=mode==='commander';
    if(pick)pick.required=mode==='list';
    if(mode==='list')refreshListCommander();
    syncStartButtons();
  }
  lab.elements.mode.addEventListener('change',ev=>{mode=ev.target.value;applyMode();});
  lab.elements.existingDeck.addEventListener('change',()=>{adoptDeckCommander();refreshListCommander();});
  if(mode==='list'){adoptDeckCommander();refreshListCommander();}
  applyMode();search();chosen();
  C.catalog.loadGraph().then(()=>{if(C.main.contains(lab))search();}).catch(()=>{});

  actions['lab-resolve']=async()=>{const c=await C.catalog.resolve(lab.elements.commanderQuery.value);if(!c||!c.commander||c.legalities.commander!=='legal')throw Error('No verified legal commander found. Check the name or provide its Scryfall link.');if(!C.state.cards[c.id])await C.commit({type:'cards',cards:[c]},{renderView:false});leader=c;lab.elements.commanderQuery.value=c.name;chosen();};
  actions['lab-manual']=()=>C.manualCard(lab.elements.commanderQuery.value,c=>{leader=c;$('#cm-dialog').close();chosen();});
  actions['lab-unpartner']=()=>{partner=null;chosen();};
  actions['lab-partner']=()=>C.cardPicker('Select a legal partner / second commander',c=>{partner=c;$('#cm-dialog').close();chosen();},{commander:true});

  /* WHAT YOU ACTUALLY HAVE. "Use only cards I own" had no meaning on the list road: the
     rows were copied out of the group verbatim, owned or not. A group is a plan as much as
     a shelf -- it can hold cards you mean to buy -- so this drops the rows no owned copy
     backs, and trims the ones you own fewer of than the list asks for. Ordered and incoming
     copies do not count: they are not in your hands, which is the whole question. */
  function ownedOnly(rows){
    const have={};
    for(const l of C.state.lots)if(l.source==='owned')have[l.cardId]=(have[l.cardId]||0)+l.quantity;
    const left={...have};
    return rows.map(r=>{
      const n=Math.min(r.quantity,left[r.cardId]||0);
      if(!n)return null;
      left[r.cardId]-=n;
      return {...r,quantity:n};
    }).filter(Boolean);
  }

  /* A COMPLAINT NOBODY CAN SEE IS NOT A COMPLAINT. Deck Definition is folded shut by
     default and it holds a required field, so an empty deck name failed validation inside a
     closed <details>: the browser cannot focus what is not rendered, so it logged to the
     console and gave the reader a button that did nothing. Any fold hiding an invalid
     control is opened first, and only then is the form asked to report itself. */
  function showInvalid(){
    for(const el of lab.elements){
      if(!el.willValidate||el.checkValidity())continue;
      for(let node=el.closest('details');node;node=node.parentElement?.closest('details'))node.open=true;
    }
    return lab.reportValidity();
  }

  /* Read the whole form once, into the module state the next render rebuilds it from. */
  function readForm(){
    const v=Object.fromEntries(new FormData(lab));
    definition=M.defaultDefinition({baseBracket:Number(v.baseBracket),bracketCeiling:Number(v.bracketCeiling),budget:v.budget===''?null:Number(v.budget),perCardCap:v.perCardCap===''?null:Number(v.perCardCap),mechanics:v.mechanic?[v.mechanic]:[],playStyle:v.playStyle,speed:Number(v.speed),competitiveness:Number(v.competitiveness),saltiness:Number(v.saltiness),restrictions:v.restrictions,reuse:{includeSellTrade:!!v.sellTrade}});
    deckId=v.existingDeck;groupId=chosenDeck()?.groupId||'';draftName=v.deckName;pool=v.ownedOnly?'owned':'all';includeInDeck=!!v.inDeck;includeReserved=!!v.reserved;
    return v;
  }

  /* RUN INITIAL DRAFT: build, fetch the printed text, keep as a preview. Nothing is
     saved to My Decks. */
  async function runDraft(){
    const run=$('#cm-lab-run'),error=$('#cm-lab-error'),status=$('#cm-lab-sim-status');run.disabled=true;error.hidden=true;
    try{
      if(!showInvalid())return;
      if(!leader)throw Error(mode==='list'?'No commander chosen for this list. Pick one under Commander for this list — the box right below the group you selected.':'Select a commander before running.');
      const v=readForm();
      const leaders=await Promise.all([leader,partner].filter(Boolean).map(c=>C.catalog.details(c)));
      let built;
      if(mode==='list'){
        let rows;
        if(!deckId)throw Error('Choose the deck to start from.');
        rows=M.deck(C.state,deckId).slots.filter(r=>r.purpose==='main').map(r=>({...r,id:undefined}));
        if(!rows.length)throw Error('That deck has no cards in its main list yet. Edit its card list first.');
        if(pool==='owned'){const all=rows.length;rows=ownedOnly(rows);
          if(!rows.length)throw Error(`Use only cards I own is ticked and none of the ${all} cards in this list are recorded as owned. Untick it, or mark those copies Received / Owned in Collection.`);}
        built={slots:rows,cards:rows.map(r=>C.state.cards[r.cardId]),issues:[],notes:[],method:'Existing list copied exactly into a new draft; no simulation executed',estimatedPrice:null,unknownPrices:0};
      }else{
        status.textContent='Drafting…';
        await C.catalog.loadGraph();
        const available={};for(const l of C.state.lots)if(M.eligibility(C.state,l,{includeInDeck,includeReserved,includeSellTrade:!!v.sellTrade}).eligible)available[l.cardId]=(available[l.cardId]||0)+l.quantity;
        built=CrankDraft.build({commanders:leaders,cards:C.catalog.all(),definition,available,benchOnly:pool==='owned'});
      }
      /* REFUSE THE EMPTY DRAFT. Zero of the 99 is an error with the builder's own reasons;
         fewer than 99 is kept as a partial preview and said out loud. */
      const chosen99=built.slots.filter(r=>!leaders.some(c=>c.id===r.cardId)).reduce((n,r)=>n+r.quantity,0);
      if(!chosen99)throw Error('The builder could not choose any of the 99. '+(built.issues.join(' ')||'Check the pool and price limits.'));
      /* THE PRINTED TEXT, NOW. A graph row has no rules text; the engine cannot read it
         and neither can the reader reviewing the draft. Two requests, not a wall later. */
      let fetchNote='';
      try{
const {missing,reachable}=await C.catalog.recheck([...built.cards,...leaders],{onProgress:m=>{status.textContent=`Reading card text and legality · ${m.done} of ${m.total}`;}});
        if(missing.length)fetchNote=`Scryfall did not return ${missing.length} card${missing.length===1?'':'s'}: ${missing.slice(0,5).join(', ')}${missing.length>5?'…':''}.`;
        if(!reachable)fetchNote='Scryfall could not be reached, so this draft was built and checked against the card catalog as it was last refreshed.';
        const banned=[...built.cards,...leaders].map(c=>C.catalog.get(c.id)||c).filter(c=>c.legalities&&c.legalities.commander&&c.legalities.commander!=='legal');
        if(banned.length)fetchNote=`${banned.map(c=>c.name).join(', ')} ${banned.length===1?'is':'are'} no longer Commander-legal. Replace ${banned.length===1?'it':'them'} before saving this deck.`;
      }catch(err){fetchNote='Card text could not be fetched now ('+err.message+'). Measure will ask again.';}
      const cards=[...built.cards,...leaders].filter(Boolean).map(c=>C.catalog.get(c.id)||c);
      /* Null-safe on the list road: a group can be chosen before any commander is known,
         and `leader.name` there was a crash waiting for the first reader to leave the name
         blank. The list's own name is the better default anyway. */
      const source=deckId&&C.state.decks.some(d=>d.id===deckId)?M.deck(C.state,deckId).name:null;
      const name=draftName||(leader?leader.name+' · '+(definition.mechanics[0]||'new draft'):(source||'New draft'));
      const next={commanders:leaders.map(c=>c.id),slots:built.slots.map(r=>({cardId:r.cardId,quantity:r.quantity,purpose:r.purpose||'main',pinned:!!r.pinned,option:!!r.option,optionWhy:r.optionWhy||''})),definition,name,method:built.method,notes:built.notes||[],issues:[...built.issues,...(fetchNote?[fetchNote]:[])],estimatedPrice:built.estimatedPrice,unknownPrices:built.unknownPrices||0,at:new Date().toISOString(),report:null};
      /* Legality of the list as it would be saved, checked on a copy of the state. */
      const probe=M.apply(C.state,{id:C.uid(),type:'createDeck',deckId:'deck:preview',name,commanders:next.commanders,cards,slots:next.slots,definition}).state;
      next.issues.push(...M.legality(probe,M.deck(probe,'deck:preview')));
      const count=total(next.slots);
      preview=next;
      await C.commit({type:'batch',commands:[{type:'cards',cards},{type:'preferences',values:{labPreview:next}}],summary:count===100?'Drafted a starting list. Nothing is saved to My Decks until you choose Save this deck.':`Drafted a PARTIAL list — ${count} of 100 cards. Loosen the limits and run again, or save it and edit by hand.`},{renderView:false});
      redrawRun();
      if(count!==100)C.notice(next.issues.filter(x=>/could be chosen/.test(x)).join(' ')||`Only ${count} of 100 cards were chosen.`,true);
    }catch(err){error.textContent=err.message;error.hidden=false;}
    finally{const again=$('#cm-lab-run');if(again)again.disabled=false;}
  }
  /* The run pane is redrawn in place after a draft or a measurement, so the Run button is
     a new element each time and is wired again each time. */
  function wireRun(){const run=$('#cm-lab-run');if(run)run.onclick=runDraft;}
  function redrawRun(){const last=C.state.preferences.lastLabRun,saved=last?C.state.decks.find(x=>x.id===last.deckId):null;const pane=$('#cm-lab-run-pane');if(pane)pane.outerHTML=runPane(saved);syncStartButtons();wireRun();}
  wireRun();

  /* SAVE THIS DECK: the one write to My Decks. From a preview when there is one, from the
     commander alone when there is not. A measured preview brings its report along. */
  /* CLEAR IS A FRESH RUN, NOT A DELETION. It puts the form back to its opening state and
     lets the pane go with it -- the commander, the definition, the unsaved draft and the
     pointer at whatever was last saved. A deck already in My Decks is not touched: this
     forgets that the Lab was looking at it, which is the thing that made every new run
     start inside the last one. */
  actions['lab-clear']=async()=>{
    const had=preview?preview.name:null;
    leader=null;partner=null;mode='commander';groupId='';deckId='';draftName='';
    definition=M.defaultDefinition();pool='all';includeInDeck=false;includeReserved=false;
    preview=null;shownLimit=45;pickerColors=[];
    await C.commit({type:'preferences',values:{labPreview:null,lastLabRun:null}},{renderView:false});
    C.go('lab');
    C.notice(had?`Cleared. The unsaved draft of ${e(had)} is gone; anything already saved is untouched in My Decks.`:'Cleared. Anything already saved is untouched in My Decks; the Lab is back to a blank run.');
  };

  actions['lab-save']=async()=>{
    const v=readForm();
    const leaders=preview?leadersOf(preview):[leader,partner].filter(Boolean);
    if(!leaders.length&&mode!=='list')throw Error('Choose a commander first.');
    let slots,cards,name,notes,method,issues;
    if(preview){
      slots=preview.slots;cards=[...slots.map(r=>cardOf(r.cardId)),...leaders].filter(Boolean);name=(v.deckName||'').trim()||preview.name;method=preview.method;notes=preview.notes||[];issues=preview.issues||[];
    }else if(mode==='list'){
      let rows;
      if(!deckId)throw Error('Choose the deck to start from.');
      rows=M.deck(C.state,deckId).slots.filter(r=>r.purpose==='main').map(r=>({...r,id:undefined}));
      if(!rows.length)throw Error('That deck has no cards in its main list yet. Edit its card list first.');
      slots=rows;cards=[...rows.map(r=>C.state.cards[r.cardId]),...leaders].filter(Boolean);name=(v.deckName||'').trim()||(leaders[0]?.name||'New deck');method='Existing list copied exactly into a new deck; no simulation executed';notes=[];issues=[];
    }else{
      slots=leaders.map(c=>({cardId:c.id,quantity:1,purpose:'main'}));cards=leaders;name=(v.deckName||'').trim()||leaders[0].name+' · new deck';method='Saved from the Deck Lab before any draft was run';notes=[];issues=[];
    }
    const id='deck:'+C.uid();
    /* A deck built from a collection group stays attached to it: the group it came from is
       the group it draws from, and saying so here saves the reader attaching it by hand. Any
       other deck gets a group made with it and named for it -- saving here used to opt out,
       which left a Lab deck's cards with no home in the Collection. */
    const commands=[{type:'createDeck',deckId:id,name,commanders:leaders.map(c=>c.id),cards,slots,definition:preview?preview.definition:definition,notes:[method,...notes].join('\n'),...(groupId?{groupId}:{})}];
    if(preview?.report)commands.push({type:'report',deckId:id,report:preview.report});
    commands.push({type:'preferences',values:{lastLabRun:{deckId:id,method,issues,at:new Date().toISOString(),previewAt:preview?.at||null,refine:preview?.refine||null},labPreview:null}});
    preview=null;
    await C.commit({type:'batch',commands,summary:`Saved ${name} to My Decks`+(commands.some(c=>c.type==='report')?' with its measurement':'')});
  };
  actions['lab-discard']=async()=>{await keepPreview(null);C.notice('Draft discarded. Nothing was saved.');redrawRun();};

  /* REVIEW THE DRAFT without saving it: the hundred, by role, with prices. */
  actions['lab-review']=()=>{
    if(!preview)throw Error('Run a draft first.');
    const rows=preview.slots.map(r=>({c:cardOf(r.cardId),q:r.quantity})).filter(x=>x.c);
    const groups=new Map();
    for(const x of rows){const r=preview.commanders.includes(x.c.id)?'commander':CrankDraft.role(x.c);if(!groups.has(r))groups.set(r,[]);groups.get(r).push(x);}
    const order=['commander','land','ramp','draw','interaction','engine'],label={commander:'Commander',land:'Lands',ramp:'Ramp',draw:'Card draw',interaction:'Interaction',engine:'Engine & threats'};
    const priced=rows.filter(x=>x.c.price>0).reduce((n,x)=>n+x.c.price*x.q,0),unknown=rows.filter(x=>!(x.c.price>0)&&!/\bBasic\b/.test(x.c.typeLine||'')).length;
    modal('Draft · '+preview.name,`<div class="cm-preview-total"><span><strong>${total(preview.slots)}</strong> cards</span><span><strong>${C.money(priced)}</strong> at recorded prices${unknown?` · ${unknown} without a price`:''}</span><span><strong>${rows.filter(x=>/Land/.test(x.c.typeLine||'')).reduce((n,x)=>n+x.q,0)}</strong> lands</span></div>
      ${note(preview.method)}${preview.issues.length?`<div class="cm-note cm-warning">${preview.issues.map(x=>`<p>${e(x)}</p>`).join('')}</div>`:''}
      <div class="cm-table-wrap"><table class="cm-table"><thead><tr><th>Card</th><th>Type</th><th>Qty</th><th>Price</th></tr></thead><tbody>${order.filter(r=>groups.has(r)).map(r=>`<tr class="cm-group-row"><td colspan="4">${e(label[r])} · ${groups.get(r).reduce((n,x)=>n+x.q,0)}</td></tr>`+groups.get(r).sort((a,b)=>a.c.name.localeCompare(b.c.name)).map(x=>`<tr><td><button type="button" class="cm-card-name" data-action="card" data-card="${e(x.c.id)}">${e(x.c.name)}</button></td><td>${e(x.c.typeLine||'')}</td><td>${x.q}</td><td>${x.c.price>0?e(C.money(x.c.price)):'<span class="cm-muted">—</span>'}</td></tr>`).join('')).join('')}</tbody></table></div>
      <details class="cm-details"><summary>How this list was built</summary>${(preview.notes||[]).map(x=>`<p class="cm-muted">${e(x)}</p>`).join('')}</details>
      <div class="cm-actions" style="margin-top:14px">${b('Save this deck','lab-save',{},true)}${b('Discard draft','lab-discard')}</div>`);
  };

  /* MEASURE the preview or the saved deck. What the engine cannot read is fetched first. */
  /* ------------------------------------------------------- STEPS THREE AND FOUR
   *
   * "Simulator & 99 Refined" and "Simulator loops complete" had never run. They sat dark
   * under a sentence saying a candidate search had not been built -- a dead end dressed as
   * an explanation, because the reader has a drafted list, a measured score and nowhere
   * to go from either.
   *
   * THIS IS A MEASURED HILL CLIMB, and each of its three questions is answered with
   * evidence the app already holds:
   *
   *   which card to drop    a per-card readout from the pass's own baseline run. A card
   *                         the engine drew and could not cast, or cast and never won
   *                         with, is the weakest card in the list -- not the cheapest one
   *                         and not the lowest ranked. It measures that baseline itself,
   *                         so refining never waits on a published measurement: the
   *                         report is step five and this is step three.
   *   what to try instead   the graph. CrankGraph.relate scores a candidate against the
   *                         commander on the same directed relations Discover draws, so
   *                         the pass proposes cards that DO something with this commander
   *                         rather than cards that are good in the abstract.
   *   whether it worked     a measurement. A swap is kept only when the new score beats
   *                         the old by more than that run's own standard error.
   *
   * ON THE PROTOCOL. The search runs on `preview` -- one seed of 2,000 games -- because
   * `published` is 120,000 games a try and a search needs dozens of tries. Preview scores
   * are not comparable with published ones and the protocol name says so; nothing here
   * writes a published number. Measure again when the list settles.
   *
   * ON THE BUDGET. Tries are bounded by TIME, not by count, so a round takes about as
   * long on a phone as on a laptop, and the pane says how many swaps it managed.
   *
   * ON THE REPORT. A kept swap changes the hundred, so the report describing the old
   * hundred is dropped rather than left to look current. That is the same rule the rest
   * of the app follows: a list change makes a result historical.
   */
  /* THE BUDGET, AND WHY IT IS A BUDGET. The first version was bounded by "twelve weak
     slots, and for each one take the first candidate that beats the baseline" -- so it
     spent three seconds of its forty-five, kept nine swaps and stopped. Bounded by time
     instead: a round is thirty seconds of measured search, and it uses them. */
  const REFINE_MS=30000, LOOP_MS=150000, MAX_ROUNDS=5;
  /* Which exact hundred the reader has already been warned about. Keyed on the list, so
     changing a card asks again rather than inheriting a stale acknowledgement. */
  let blindOk=null;
  const signatureOf=slots=>slots.map(r=>r.cardId).sort().join('|');
  const PER_SLOT=14;      // candidates screened against one weak slot before moving on
  const SCREEN_KEEP=2;    // of those, how many earn a confirmation run
  const MIN_GAIN=0.5;     // points a swap must add on top of the run's own noise
  const sayStatus=t=>{const el=$('#cm-lab-sim-status');if(el)el.textContent=t;};

  /* The engine cannot read a card with no rules text, and a swap that quietly drops
     coverage changes the number for the wrong reason. */
  async function ensureReadable(cards){
    const need=(cards||[]).filter(c=>c&&!c.oracleText&&!/\bLand\b/.test(c.typeLine||''));
    if(!need.length)return [];
    const got=await C.catalog.hydrate(need,{onProgress:m=>sayStatus(`Fetching card text · ${m.done} of ${m.total}`)});
    if(got.hydrated.length)await C.commit({type:'cards',cards:got.hydrated},{renderView:false});
    return got.missing;
  }
  async function scoreSlots(slots,commanders,protocol,onProgress){
    const lineup=CrankSim.lineupFor(C.state,{id:null,commanders,slots});
    const [config,opponents]=await simInputs();
    runner=runner||CrankSim.createRunner();
    return runner.measure({protocol:protocol||'refine',lineup,config,opponents,table:config.table,onProgress});
  }

  /* Worth trying: legal in the commander's colours, not already in the list, not a basic,
     and joined to the commander on the graph's own relations. Ordered by the strength of
     that join, then by how much the format plays the card. */
  function candidatesFor(leaders,slots,limit){
    const identity=new Set(leaders.flatMap(c=>c.colorIdentity||[]));
    const inDeck=new Set(slots.map(r=>r.cardId));
    const rows=[];
    for(const c of C.catalog.all()){
      if(inDeck.has(c.id)||/\bBasic\b/.test(c.typeLine||''))continue;
      if(c.legalities&&c.legalities.commander==='banned')continue;
      if((c.colorIdentity||[]).some(x=>!identity.has(x)))continue;
      let score=0;
      for(const leader of leaders){const r=CrankGraph.relate(leader,c);if(r)score+=r.score;}
      if(score)rows.push({card:c,score});
    }
    return rows.sort((a,b)=>b.score-a.score||((a.card.rank||1e9)-(b.card.rank||1e9))).slice(0,limit||120).map(r=>r.card);
  }

  /* THE WEAKEST CARDS, ON A FIGURE THAT ACTUALLY VARIES.
   *
   * This used to rank on cast rate and dead rate. Neither discriminates: a game in this
   * model runs long enough that essentially every drawn spell is eventually cast, so the
   * whole nonland list sits at 99-100% cast and 0% dead, and the ranking was noise wearing
   * a formula. What varies is being STRANDED -- drawn, and still uncastable in hand on
   * turn eight -- which is exactly "too expensive, or off-colour for these sources", and
   * how the deck's own win rate moves in the games a card was cast in. A card with no
   * measured row is treated as average: absence of evidence is not evidence of weakness.
   * Lands, the commander and pinned slots are never dropped. */
  function weakestSlots(result,slots,leaders,limit){
    const byName=new Map((result.perCard||[]).map(r=>[r.name,r]));
    const leaderIds=new Set(leaders.map(c=>c.id));
    const deckWin=Number(result.winRate)||0;
    return slots.filter(r=>!leaderIds.has(r.cardId)&&!r.pinned)
      .map(r=>({slot:r,card:cardOf(r.cardId)}))
      .filter(x=>x.card&&!/\bLand\b/.test(x.card.typeLine||''))
      .map(x=>{const m=byName.get(x.card.name);
        const stuck=m&&m.stuckRate!=null?m.stuckRate:.1;
        const cast=m&&m.castRate!=null?m.castRate:.95;
        const lift=(m&&m.winRateWhenCast!=null?m.winRateWhenCast:deckWin)-deckWin;
        const late=Math.max(0,((m&&m.avgCastTurn)||0)-6)/12;
        return {...x,weak:stuck*3+(1-cast)*2-lift*4+late,stat:m||null};})
      /* The owner's own ranking comes first: a slot flagged Option is the first to go. */
      .sort((a,b)=>(b.slot.option?1:0)-(a.slot.option?1:0)||b.weak-a.weak).slice(0,limit||16);
  }

  /* ONE ROUND: measure, rank the weak slots, then SCREEN CHEAPLY AND CONFIRM PROPERLY.
   *
   * The acceptance test used to be `trial.score > base.score + max(base.se, 0.25)` on a
   * one-seed run. A one-seed run has a standard error of exactly zero -- there is nothing
   * to take a variance over -- so the bar was a flat quarter point against a measurement
   * whose real spread is two or three, and every "kept" swap was a coin flip. Now the
   * cheap one-seed runs only RANK candidates, and the decision is made on three seeds of
   * 4,000 games against a three-seed baseline, by more than twice that run's own error. */
  async function refineRound(budgetMs,label){
    if(!preview)throw Error('Run the initial draft first; the pass refines a list, not an idea.');
    if(runner&&runner.busy)throw Error('A measurement is already running.');
    const leaders=preview.commanders.map(cardOf).filter(Boolean);
    if(!leaders.length)throw Error('This draft has no commander to refine around.');
    /* THE CANDIDATE POOL IS THE GRAPH, and the graph is a 7 MB fetch the Lab starts and
       never waits for. Clicking Refine before it landed left candidatesFor with nothing to
       relate anything to: an empty pool, "no swap out of 0 tried", and a second of running
       time. That reads as a search that ran and found nothing, which is the one thing it
       must not do. Wait for it here, and say what the wait is for. */
    sayStatus('Loading the card relationship graph…');
    await C.catalog.loadGraph();
    const [config]=await simInputs();
    const startedAt=Date.now(),budget=Number(budgetMs)||REFINE_MS;
    const left=()=>budget-(Date.now()-startedAt);
    const clock=()=>`${Math.max(0,Math.round(left()/1000))}s left`;
    let slots=preview.slots.map(r=>({...r}));
    await ensureReadable(slots.map(r=>cardOf(r.cardId)));
    sayStatus('Looking for cards that fit this commander…');
    const pool=candidatesFor(leaders,slots,320);
    if(!pool.length)throw Error('Nothing in the catalog is joined to this commander on the graph, so there is no candidate to try. Open Discover once so the graph loads, then refine again.');
    await C.commit({type:'cards',cards:pool},{renderView:false});
    await ensureReadable(pool);

    sayStatus(`${label||'Measuring'} the list as it stands…`);
    let base=await scoreSlots(slots,preview.commanders,'refine',m=>sayStatus(`${label||'Measuring'} the list as it stands · ${m.done} of ${m.total}`));
    /* THE ENGINE WILL NOT RANK A DECK IT CANNOT SEE WIN. Refine keeps the swap that
       raises the score, so on a list whose win is a card saying "you win the game" --
       Thassa's Oracle, Approach, Aetherflux -- it optimizes the creatures and spells
       AROUND the combo and calls the result better. That is not a search that failed;
       it is a search that answered a different question, confidently. It stops once,
       says which cards it cannot read, and continues if you ask again with the same
       list, because sometimes tuning the shell is exactly what you wanted. */
    if(base.unwatchedWinPaths&&blindOk!==signatureOf(slots)){
      blindOk=signatureOf(slots);
      const names=(base.unwatchedWinCards||[]).join(', ');
      throw Error(`This list wins through ${base.unwatchedWinPaths} card${base.unwatchedWinPaths===1?'':'s'} the engine cannot watch${names?' ('+names+')':''}: it reads "you win the game" but not the condition attached to it. Ranking swaps on this score tunes everything except the way the deck actually wins. Click again to search the shell anyway.`);
    }
    let screenBase=await scoreSlots(slots,preview.commanders,'preview');
    const kept=[];let tried=0,confirmed=0,next=0;
    for(const out of weakestSlots(base,slots,leaders,20)){
      if(left()<=1200||next>=pool.length)break;
      if(!slots.some(r=>r.cardId===out.slot.cardId))continue;   // already swapped this round
      const shortlist=[];
      for(let n=0;n<PER_SLOT&&next<pool.length&&left()>1200;n+=1){
        const cand=pool[next++];
        if(slots.some(r=>r.cardId===cand.id))continue;
        const swapped=slots.map(r=>r.cardId===out.slot.cardId?{...r,cardId:cand.id}:r);
        tried+=1;
        sayStatus(`Screening ${cand.name} for ${out.card.name} · ${tried} tried · ${clock()}`);
        let t=null;try{t=await scoreSlots(swapped,preview.commanders,'preview');}catch{continue;}
        if(t.score>screenBase.score)shortlist.push({cand,swapped,screen:t.score});
      }
      shortlist.sort((a,b)=>b.screen-a.screen);
      for(const pick of shortlist.slice(0,SCREEN_KEEP)){
        if(left()<=800)break;
        confirmed+=1;
        sayStatus(`Confirming ${pick.cand.name} for ${out.card.name} on three seeds · ${clock()}`);
        let trial=null;try{trial=await scoreSlots(pick.swapped,preview.commanders,'refine');}catch{continue;}
        const bar=base.score+Math.max((base.se||0)*2,MIN_GAIN);
        if(trial.score>bar){
          kept.push({out:out.card.name,in:pick.cand.name,from:base.score,to:trial.score});
          slots=pick.swapped;base=trial;
          screenBase=await scoreSlots(slots,preview.commanders,'preview');
          break;
        }
      }
    }
    const targets=targetsFor(base,definition,config);
    const missed=targets.filter(t=>!t.ok);
    const outOfTime=left()<=1200;
    const prior=preview.refine||null;
    const refine={rounds:(prior&&prior.rounds||0)+1,tried:(prior&&prior.tried||0)+tried,
      confirmed:(prior&&prior.confirmed||0)+confirmed,
      swaps:[...(prior&&prior.swaps||[]),...kept],score:base.score,se:base.se,protocol:'refine',
      targets,targetsMet:missed.length===0,
      stopped:missed.length?(kept.length?(outOfTime?'time':'more to try'):'converged'):'targets met',
      at:new Date().toISOString()};
    /* The hundred changed, so the report about the old hundred is not this deck's report. */
    await keepPreview({...preview,slots,refine,report:kept.length?null:preview.report});
    redrawRun();
    return {kept:kept.length,tried,confirmed,score:base.score,outOfTime,targets,missed};
  }

  const targetLine=missed=>missed.length
    ? `Still short on ${missed.length===1?'one target':missed.length+' targets'}: ${missed.map(t=>t.label.toLowerCase()).join(', ')}.`
    : 'Every target for this build is met.';

  actions['lab-refine']=async()=>{
    const r=await refineRound(REFINE_MS);
    C.notice(r.kept
      ? `Refined: ${r.kept} swap${r.kept===1?'':'s'} kept from ${r.tried} screened and ${r.confirmed} confirmed. Score ${r.score}. ${targetLine(r.missed)}`
      : `No swap out of ${r.tried} screened and ${r.confirmed} confirmed beat the current list${r.outOfTime?' in the time allowed':''}. The 99 stands. ${targetLine(r.missed)}`);
  };

  /* THE LOOP: rounds until the targets are met, the budget is gone, or a round changes
     nothing. Each round re-measures first, so every swap is judged against the list as it
     actually stands rather than against the list the search started from. */
  actions['lab-loop']=async()=>{
    const began=Date.now();let rounds=0,kept=0,tried=0,last=null;
    while(rounds<MAX_ROUNDS&&Date.now()-began<LOOP_MS){
      const budget=Math.min(REFINE_MS,LOOP_MS-(Date.now()-began));
      if(budget<5000)break;
      last=await refineRound(budget,`Round ${rounds+1} of up to ${MAX_ROUNDS} ·`);
      rounds+=1;kept+=last.kept;tried+=last.tried;
      if(!last.missed.length||!last.kept)break;
    }
    const met=last&&!last.missed.length;
    if(preview)await keepPreview({...preview,refine:{...preview.refine,stopped:met?'targets met':(last&&last.kept?'rounds':'converged'),loopedAt:new Date().toISOString()}});
    redrawRun();
    C.notice(met
      ? `Looped ${rounds} round${rounds===1?'':'s'}: ${kept} swap${kept===1?'':'s'} kept from ${tried} screened, and every target for this build is now met. Measure it for a publishable score.`
      : last&&!last.kept
        ? `Looped ${rounds} round${rounds===1?'':'s'}: ${kept} swap${kept===1?'':'s'} kept from ${tried} screened, and the last round found nothing better. ${targetLine(last.missed)} The engine cannot see every way a deck wins — read the report before trusting this.`
        : `Stopped after ${rounds} round${rounds===1?'':'s'} with ${kept} swap${kept===1?'':'s'} kept from ${tried} screened — it was still improving. ${targetLine((last&&last.missed)||[])} Loop again to keep going.`);
  };

  actions['lab-report']=el=>{
    const saved=el.dataset.deck?C.state.decks.find(x=>x.id===el.dataset.deck):null;
    const r=saved?C.state.reports.filter(x=>x.deckId===saved.id&&x.origin==='measured').slice(-1)[0]:preview&&preview.report;
    modal('Simulation report'+(saved?' · '+saved.name:preview?' · '+preview.name:''),reportHTML(r));
  };

  actions['lab-measure']=async el=>{
    const status=$('#cm-lab-sim-status');
    const saved=el.dataset.deck?M.deck(C.state,el.dataset.deck):null;
    const subject=saved||(preview?{id:null,commanders:preview.commanders,slots:preview.slots}:null);
    if(!subject)throw Error('Run a draft or save a deck first.');
    let lineup=CrankSim.lineupFor(C.state,subject),cover=CrankSim.coverage(lineup);
    if(!cover.total){
      const last=C.state.preferences.lastLabRun;
      const why=saved&&last&&last.deckId===saved.id&&(last.issues||[]).length?' The builder reported: '+last.issues.join(' '):'';
      throw Error('This deck has no cards to measure yet.'+why+' Add cards with Edit card list, or run the draft again with looser limits.');
    }
    if(cover.ratio<.95){
      status.textContent=`Fetching card text for ${cover.unreadable.length} cards…`;
      const need=cover.unreadable.map(n=>C.catalog.exact(n)||{name:n});
      let missing=[];
      try{const got=await C.catalog.hydrate(need,{onProgress:m=>{status.textContent=`Fetching card text · ${m.done} of ${m.total}`;}});missing=got.missing;if(got.hydrated.length)await C.commit({type:'cards',cards:got.hydrated},{renderView:false});}
      catch(err){status.textContent='';throw Error('The engine cannot read '+cover.unreadable.length+' cards and Scryfall could not be reached to fetch their text ('+err.message+'). Reconnect and measure again.');}
      lineup=CrankSim.lineupFor(C.state,subject);cover=CrankSim.coverage(lineup);
      if(cover.ratio<.95){status.textContent='';throw Error(`After asking Scryfall the engine still cannot read ${cover.unreadable.length} card${cover.unreadable.length===1?'':'s'}: ${cover.unreadable.slice(0,6).join(', ')}${cover.unreadable.length>6?' and '+(cover.unreadable.length-6)+' more':''}.${missing.length?' Scryfall did not know: '+missing.slice(0,4).join(', ')+'.':''} Check those names in Collection, or replace them with Edit card list.`);}
    }
    CrankSim.assertMeasurable(cover,'published');
    const plan=CrankSim.protocolFor('published');
    runner=runner||CrankSim.createRunner();
    if(runner.busy)throw Error('A measurement is already running.');
    const [config,opponents]=await Promise.all([fetch(CrankAssets.simConfig).then(r=>r.json()),fetch(CrankAssets.simOpponents).then(r=>r.json())]);
    status.textContent='Measuring… seed 0 of '+plan.seedCount;
    /* The preview this run is about. A reader may save or discard it while the engine is
       running; the report then goes to the deck that was saved from it, or nowhere, never to
       whatever preview happens to be current when the worker returns. */
    const startedAt=preview?.at||null;
    try{
      const result=await runner.measure({protocol:'published',lineup,config,opponents,table:config.table,onProgress:m=>{const el=$('#cm-lab-sim-status');if(el)el.textContent=`Measuring… seed ${m.done} of ${m.total} · ${m.mean} points so far`;}});
      const report=CrankSim.packFor(result,{protocol:'published',table:config.table,seatCount:(opponents.tables[config.table]||[]).length,cardsVersion:CrankAssets.cards,coverage:cover});
      const score=`Measured ${report.metrics.score.value} points from ${result.games.toLocaleString()} games in ${(result.elapsedMs/1000).toFixed(1)}s.`;
      if(saved){await C.commit({type:'report',deckId:saved.id,report});C.notice(score+' Filed under Simulation history in My Decks.');return;}
      if(preview&&preview.at===startedAt){await keepPreview({...preview,report});redrawRun();C.notice(score+' Save this deck to keep the report with it.');return;}
      const last=C.state.preferences.lastLabRun,savedFrom=last&&last.previewAt&&last.previewAt===startedAt?C.state.decks.find(x=>x.id===last.deckId):null;
      if(savedFrom){await C.commit({type:'report',deckId:savedFrom.id,report});C.notice(score+` Filed with ${savedFrom.name}, which was saved while it ran.`);return;}
      C.notice(score+' The draft it measured was discarded before it finished, so the report was not kept.',true);
    }catch(err){const el=$('#cm-lab-sim-status');if(el)el.textContent=err.message;throw err;}
  };
};

/* THE RUN PANE. Its state is read, not set: a step lights up because a preview, a report or
   a saved deck exists. */
function runPane(saved){
  const subject=preview||saved;
  const count=preview?total(preview.slots):saved?M.readiness(C.state,saved).target:0;
  const measuredSaved=saved?C.state.reports.filter(r=>r.deckId===saved.id&&r.origin==='measured').slice(-1)[0]:null;
  const measured=preview?preview.report:measuredSaved;
  const refine=preview?preview.refine:(saved&&C.state.preferences.lastLabRun&&C.state.preferences.lastLabRun.deckId===saved.id?C.state.preferences.lastLabRun.refine:null);
  const stepState=i=>{
    if(i===0)return (leader||subject)?'complete':'active';
    if(i===1)return count===100?'complete':subject?'active':'waiting';
    if(i===2)return refine&&refine.rounds?'complete':subject&&count>1?'active':'waiting';
    if(i===3)return refine&&(refine.stopped==='converged'||refine.stopped==='targets met')?'complete':refine&&refine.rounds?'active':'waiting';
    if(i===4)return measured?'complete':subject?'active':'waiting';
    if(i===5)return saved&&!preview?'complete':'waiting';
    return 'waiting';
  };
  /* WHAT WOULD LIGHT THIS ONE. A dark step with no explanation is a dead end; the reader
     should never have to guess which button they have not pressed yet. */
  const stepNote=i=>{
    const st=stepState(i);
    if(i===1&&subject&&count!==100)return `${count} of 100`;
    if(i===2)return st==='waiting'?'Run the initial draft first — there has to be a 99 to refine'
      :st==='active'?'Refine the 99: it measures the list, drops what the engine could not cast, and keeps only swaps that score better'
      :`${refine.rounds} round${refine.rounds===1?'':'s'} · ${refine.swaps.length} swap${refine.swaps.length===1?'':'s'} kept of ${refine.tried} screened`;
    if(i===3)return st==='waiting'?'Refines over and over until a whole round finds nothing better'
      :st==='active'?`Loop until every target for this build is met${refine&&refine.targets?` — ${refine.targets.filter(t=>!t.ok).length} still short`:''}`
      :refine&&refine.stopped==='targets met'?'Every target for this build is met'
      :'A whole round found no improvement';
    if(i===4)return st==='waiting'?'Measure this draft to produce one':st==='active'?'Not measured yet':'';
    if(i===5)return st==='complete'?'':'Save this deck to finish';
    return '';
  };
  /* THE ORDER, ON THE BUTTONS THEMSELVES.
     Six buttons in a row, every one of them enabled, told a new reader nothing: not which
     to press first, not which would fail, and not why. Refine even sat AFTER Measure while
     belonging before it -- measuring is the publishable run you do once the list has
     stopped moving, and refining is what stops it moving. So each button now sits in the
     step it advances, in the list that was already tracking exactly this, carrying the
     number of its turn and disabled with the reason showing until the step before it has
     happened. One sequence, told once, instead of an unordered row above a list of the
     same thing.

     Ready is not the same question as complete. A step is COMPLETE when its work is done;
     its button is READY when the work it needs has been done. Refine is ready the moment
     there is a 99 and stays ready after it has run, because refining twice is a real
     thing to want. */
  const started=mode==='list'?Boolean(deckId):Boolean(leader);
  const NEEDS_START='Choose a commander, or an existing list, on the left';
  const NEEDS_DRAFT='Run the initial draft first';
  const doFor=i=>{
    if(i===1)return {label:'Run initial draft',id:'cm-lab-run',ready:started,why:NEEDS_START};
    if(i===2)return {label:'Refine the 99',action:'lab-refine',ready:Boolean(preview&&count>1),why:NEEDS_DRAFT};
    if(i===3)return {label:'Loop until it settles',action:'lab-loop',ready:Boolean(preview&&count>1),
      why:`${NEEDS_DRAFT} — looping is refining over and over`};
    if(i===4)return {label:preview?'Measure this draft':'Measure this deck',action:'lab-measure',
      data:!preview&&saved?{deck:saved.id}:null,ready:Boolean(subject),
      why:`${NEEDS_DRAFT} — there has to be a list to measure`};
    if(i===5)return {label:'Save this deck',id:'cm-lab-save',action:'lab-save',ready:Boolean(leader||preview),why:NEEDS_START};
    return null;
  };
  /* The number a reader counts by is the button's turn, not the step's index: step one is
     the form on the left and has no button, so numbering steps would start the buttons at
     two. */
  const turnOf=i=>i;   // steps 1-5 carry buttons 1-5; step 0 carries none
  /* EXACTLY ONE BUTTON IS BLUE, and it is the one to press next: the lowest-numbered step
     that can be run and has not already happened. It starts on 1 and walks down the list as
     each step completes, so the pane answers "what now" without being read. Falling back to
     1 when nothing is runnable keeps the class on the button through the disabled state --
     syncStartButtons only flips `disabled`, so a button that is not already marked primary
     could not turn blue when the form makes it live. */
  const nextTurn=(()=>{for(let i=1;i<=5;i+=1){const d=doFor(i);if(d&&d.ready&&stepState(i)!=='complete')return i;}return 1;})();
  const doButton=i=>{
    const spec=doFor(i);
    if(!spec)return '';
    const attrs=[`type="button"`,`class="v-button cm-run-do${i===nextTurn?' primary':''}"`,
      spec.id?`id="${spec.id}"`:'',spec.action?`data-action="${spec.action}"`:'',
      ...(spec.data?Object.entries(spec.data).map(([k,v])=>`data-${k}="${e(v)}"`):[]),
      `aria-label="${e(spec.label)}"`,
      spec.ready?'':'disabled',
      spec.ready?'':`title="${e(spec.why)}"`].filter(Boolean).join(' ');
    return `<button ${attrs}><span class="cm-run-num" aria-hidden="true">${turnOf(i)}</span>Run</button>`;
  };

  const simLabel=measured?`Measured ${measured.metrics.score.value} points · ${measured.protocol}`:subject?'Not measured yet':'Build a draft first';
  const last=C.state.preferences.lastLabRun;
  return `<aside class="v-panel cm-run-panel" id="cm-lab-run-pane"><div class="cm-actions cm-run-top"><span class="cm-pause-pill" id="cm-lab-sim-status">${e(simLabel)}</span>${leader||preview||saved?b('Clear and start again','lab-clear'):''}</div>
    <p class="cm-muted cm-run-lede">Five steps, in order. A step you cannot take yet says what it is waiting for.</p>
    <ol class="cm-run-steps">${STEPS.map((label,i)=>{const st=stepState(i),spec=doFor(i);
      /* Whatever blocks the button is said ON THE PAGE, not only in its title: a title is a
         hover, and the phone layout -- where this pane sits under the form and is the first
         thing a new reader meets -- has no hover to give. The blocker WINS over the step's
         own note, because a note that describes a step you cannot take yet reads as an
         instruction to take it. Once the button is live the note takes over and says what
         pressing it does. */
      const note=stepNote(i),why=spec&&spec.why||'',hint=(spec&&!spec.ready&&why)||note;
      /* The report step is the report: its own name opens it once one exists. */
      const name=i===4&&measured?`<button type="button" class="cm-text-button" data-action="lab-report"${saved&&!preview?` data-deck="${e(saved.id)}"`:''}>${e(label)}</button>`:e(label);
      return `<li><span class="cm-run-orb ${st}" id="cm-step-${i}" aria-label="${st==='complete'?'Complete':st==='active'?'Active':'Waiting'}"><i></i><i></i><i></i><img src="assets/mana/G.svg?v=1" alt=""></span><span class="cm-run-step-body">${name}</span>${doButton(i)}${note||why?`<small class="cm-muted cm-run-why" data-step-note="${e(note)}" data-step-why="${e(why)}"${hint?'':' hidden'}>${e(hint)}</small>`:''}</li>`;}).join('')}</ol>
    <p class="cm-muted cm-run-lede">${preview?'Saving writes this draft to My Decks.':'Saving writes the commander and definition to My Decks; draft or edit the 99 any time after.'}</p>
    <div id="cm-lab-result">${preview?`<h3>${e(preview.name)} <span class="cm-badge">Draft · not saved</span></h3>${note(preview.method)}<p>${count} of 100 cards${preview.estimatedPrice!==null&&preview.estimatedPrice!==undefined?` · about ${e(C.money(preview.estimatedPrice))} at recorded prices`:''}${preview.unknownPrices?` · ${preview.unknownPrices} without a price`:''}.</p>${preview.definition&&preview.definition.budget!==null&&preview.definition.budget!==undefined&&preview.estimatedPrice>preview.definition.budget?note(`About ${C.money(preview.estimatedPrice)} against the ${C.money(preview.definition.budget)} total cap in Deck Definition: the builder treats the cap as a target and could not get under it with these limits. Save the deck and Finalize will offer to raise or remove the cap, or trim the list first.`,true):''}${(preview.issues||[]).map(x=>`<p class="cm-muted">${e(x)}</p>`).join('')}<div class="cm-actions">${b('Review draft cards','lab-review')}${b('Discard draft','lab-discard')}</div>`
      :saved?`<h3>${e(saved.name)} <span class="cm-badge good">Saved</span></h3>${note(last.method)}${(last.issues||[]).map(x=>`<p class="cm-muted">${e(x)}</p>`).join('')}<div class="cm-actions">${b('Open in My Decks','deck',{deck:saved.id})}${b('Review deck cards','deck-cards',{deck:saved.id})}${b('Reports & advice','deck-evidence',{deck:saved.id})}</div>`
      :'<p class="cm-muted">Run initial draft builds a list you can review and measure here. Nothing reaches My Decks until you choose Save this deck; no cards are purchased, owned or reserved by any step.</p>'}</div>
    <p class="cm-muted">Measuring runs the engine in the background on the published protocol — six seeds of 20,000 games — and stores a report you can compare with another run of the same protocol. Refining searches on the quick protocol instead (one seed of 2,000 games, fast enough to try dozens of swaps and too small to publish): it drops the cards the engine drew and could not cast, tries cards the graph joins to your commander, and keeps a swap only when the score beats the old one by more than that run's own error. A kept swap changes the hundred, so the published report is dropped with it — measure again when the list settles. Finalize the saved list in My Decks when you accept it.</p></aside>`;
}

actions['lab-help']=()=>modal('Explore · Test · Decide',`<h3>Built around your game</h3><p>Choose a commander from the legal catalog — every one of them, by name, printed variant name, play style, colour identity or rank — or begin with a list you already have. Deck Definition records your hard limits and play preferences.</p><p><strong>Run initial draft</strong> builds a starting list from card metadata and keeps it here as a preview; a total price cap is planned so the list completes, or it tells you what cap would. <strong>Measure</strong> runs the simulator on the preview or a saved deck — real games, in the background, on the same protocol as every published rating — fetching any card text the engine lacks first. <strong>Save this deck</strong> is the only step that writes to My Decks, and it works from the commander alone.</p><p>The simulator's three opponents are sampled archetype profiles, not four real decks with hands and boards, so a score compares lists under one model rather than predicting an evening. Every report carries that caveat with it.</p>${note('No AI API key or paid model call is required for current workflows. Reports belong to the exact list they describe.')}`);
});
