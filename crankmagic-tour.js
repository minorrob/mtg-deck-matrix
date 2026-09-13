/* THE GUIDED TOUR. Seven journeys, one engine, and a chooser in front of them.
 *
 * You do not pick a screen, you pick a JOB -- "buy what a deck still needs", "move your
 * library between devices" -- and the tour navigates the app on your behalf, spotlighting
 * real controls on the real page with your real data. Every tour ends on a card that says
 * what the journey actually got you, because a tour that ends with "that is the end of the
 * tour" has taught you where the buttons are and not what the app is for.
 *
 * THE ENGINE IS PORTED FROM the retired matrix.html viewer, which had already paid
 * for four lessons. They are carried over deliberately and each one is a bug that shipped:
 *
 *   1. FIND AND MEASURE IN THE SAME BREATH, and decide the retry on the MEASUREMENT rather
 *      than on the find. Positioning once inside a double rAF is right for a rendered view
 *      and wrong for one still arriving. The first fix was worse in an instructive way: it
 *      found the "Loading…" box, confirmed it was solid, stopped retrying because it had
 *      succeeded -- and forty milliseconds later the box was replaced and it measured a node
 *      no longer in the document. Every rect on a detached element is zero, so the spotlight
 *      collapsed to a pixel and stayed there with the thing it named plainly on screen.
 *   2. SCOPE SELECTORS TO THE STEP'S OWN VIEW FIRST. querySelector returns the first match in
 *      document order, so once two views both had an empty-state block, a step in one
 *      spotlighted the other's hidden copy and drew a 1px box.
 *   3. RECORD WHICH SELECTOR WON, on the layer, as data-tour-hit. A tour pointing at the
 *      wrong thing is otherwise undebuggable from outside: the only symptom is a box in the
 *      wrong place, and every explanation for that looks equally plausible until you can see
 *      what matched. tests/uat/journeys.mjs asserts it is never "none".
 *   4. ACTS: a step may open the thing it is about to describe. Deck Lab's sections and the
 *      Collection's filter panel are collapsed by default -- right for reading, wrong for a
 *      tour that is about to point inside one.
 *
 * Two things are new, because this app is not that one. The CHOOSER, since the legacy tour
 * started from whatever tab you were on. And a PRECONDITION step: four of the seven tours
 * describe work on a deck you have, and someone who takes "read a deck's performance" with an
 * empty library would otherwise get six steps about an empty state. Those tours open by
 * saying what is missing and pointing at the control that fixes it, then carry on.
 *
 * design/crankmagic/tour-plan.md is the written plan this implements.
 */
(globalThis.CrankFeatures ||= []).push(function(C){
const {esc:e,$,actions}=C;

/* ------------------------------------------------------------------ the content */

/* A step is {view, selectors[], title, copy, act?, params?}. `selectors` is a list because
   the thing a step is about may be one of several elements depending on what the reader has:
   the first that matches inside the view wins, then the first that matches anywhere.
 *
 * `params` exists because a view is not always a page. Half of "read a deck's performance"
 * describes the deck DETAIL route, #decks?deck=<id>, and navigating to bare #decks lands on
 * the deck LIST -- so five of its six steps pointed at markup that only the sub-route renders
 * and were never going to match, deck or no deck. It is a function of the state rather than a
 * literal, since the id is whichever deck this reader actually has. */
/* Whichever deck this reader actually has. The tour cannot name one in advance. */
const firstDeck=()=>{const d=C.state.decks?.find(x=>!x.archived);return d?{deck:d.id}:{};};

const TOURS=[
  {id:'build',name:'Build a deck from scratch',icon:'🜂',
   job:'I have a commander in mind, or none at all, and I want a 100-card list.',
   promise:'A saved deck, its 99 chosen and priced.',
   have:'A commander, 99 cards chosen for it, and a saved plan with a price on it. Nothing has left your wallet, and the list is yours to edit.',
   steps:[
    {view:'decks',selectors:['[data-action=open-lab]','[data-action=new-deck]'],
     title:'Every deck starts in the Lab',
     copy:'The Lab takes a commander and builds the other 99 around it — or takes a list you already have and works from that.'},
    {view:'lab',selectors:['.cm-lab-start'],
     title:'One question first',
     copy:'And it changes everything below it: are you starting from a commander, or from cards you already have?'},
    {view:'lab',selectors:['#cm-lab-commander'],act:'openCommander',
     title:'Choosing the commander',
     copy:'Search or enter a commander from among the 3,400+ legal ones — a name, a printed variant name, or a pasted Scryfall link. These filters only choose the commander; they do not constrain the 99.'},
    {view:'lab',selectors:['#cm-lab-results','#cm-lab-picker'],
     title:'The matches',
     copy:'Ordered by how often people actually play them. Inspect shows you the card and what it wants to do before you commit to it.'},
    {view:'lab',selectors:['#cm-lab-definition'],act:'openDefinition',
     title:'Say what kind of deck you want',
     copy:'A price cap, a bracket, how fast, how mean. The draft obeys the caps and treats the rest as direction — it will tell you if a cap cannot be met.'},
    {view:'lab',selectors:['#cm-lab-run-pane'],
     title:'Five steps, in order',
     copy:'Exactly one button is blue and it is the one to press next. A step you cannot take yet says what it is waiting for.'},
    {view:'lab',selectors:['#cm-lab-run'],
     title:'Press 1',
     copy:'The Lab picks 99 cards, fetches their real printed text, and shows you the list. Nothing is saved yet — you can throw the whole thing away and try another budget.'},
    {view:'lab',selectors:['#cm-lab-save'],
     title:'Only this writes to My Decks',
     copy:'Nothing has been bought, owned or reserved along the way. A deck is a plan until you say otherwise.'}]},

  {id:'refine',name:'Refine a deck with the simulator',icon:'🜁',
   job:'I have a list. Make it better, and tell me how much better.',
   promise:'A measured score, a report, and swaps the engine proved.',
   needs:'draft',
   have:'A score you can put beside another deck’s, a list of swaps that each earned their place, and an honest note about what the engine cannot watch.',
   steps:[
    {view:'lab',selectors:['#cm-step-2','.cm-run-steps'],
     title:'Refining is measured, not guessed',
     copy:'It plays the deck, drops what it could never cast, and keeps a swap only when a fresh measurement says the score went up.'},
    {view:'lab',selectors:['[data-action=lab-refine]'],
     title:'One pass',
     copy:'A few dozen swaps screened on the quick protocol. Fast enough to try, and small enough that it is deliberately not the number you publish.'},
    {view:'lab',selectors:['[data-action=lab-loop]'],
     title:'Or leave it running',
     copy:'Loop until a whole round finds nothing better, or every target for the build is met. This is the one to start while you make coffee.'},
    {view:'lab',selectors:['[data-action=lab-measure]'],
     title:'The publishable run',
     copy:'Six seeds, 20,000 games each, against sampled opponents. This is the only score comparable with another deck’s.'},
    {view:'lab',selectors:['#cm-lab-sim-status'],
     title:'A score belongs to an exact list',
     copy:'Change a card and the published score is dropped with it. It never outlives the hundred it measured — which is why two numbers here can always be compared.'},
    {view:'lab',selectors:['#cm-step-4'],
     title:'What it cannot see is said first',
     copy:'A win the engine cannot model is disclosed above the score, not below it — before you read a number that ignores it.'}]},

  {id:'discover',name:'Find cards you didn’t know about',icon:'🜄',
   job:'Show me what actually works with my commander.',
   promise:'Cards found by how they interact, not by remembering them.',
   have:'Cards in your deck that you found by how they interact rather than by recalling them — and a recorded reason each one is in there.',
   steps:[
    {view:'discover',selectors:['#cm-graph-query'],
     title:'Start from a card you already play',
     copy:'Every Commander-legal card is in here, including printings that carry a different name on the front.'},
    {view:'discover',selectors:['#cm-graph'],
     title:'Lines are relationships, not similarity',
     copy:'This triggers that; that multiplies this. Direction is the point — it is why the graph finds cards a keyword search never would.'},
    {view:'discover',selectors:['#cm-depth','#cm-graph-size'],
     title:'How far to look',
     copy:'One step out is the obvious partners. Two or three is where the deck you had not thought of lives.'},
    {view:'discover',selectors:['#cm-facet-summary','#cm-facet-bar'],
     title:'Narrow it',
     copy:'By role, colour, type or mechanic — so "what goes with my commander" becomes "what goes with my commander and costs under three".'},
    {view:'discover',selectors:['#cm-card-view','#cm-graph-pop'],
     title:'Read it here',
     copy:'Click any card and the pane fills in: the printing itself, rules text and all, plus its set, its price and the bracket it puts a deck in. Inspect sits under the art and Add and/or Buy under the bracket line; Back — to whatever you were looking at before — waits above the graph, at its top-right corner, because it undoes a move on the canvas rather than anything about this card.'},
    {view:'discover',selectors:['.cm-stage-btn','.cm-graph-box'],
     title:'Give the graph the screen',
     copy:'The icon in the canvas corner collapses the nav, drops the page title and halves the card pane — the graph gets about 60% more width and runs past the bottom of the window, so you scroll into it. Search and filters fold behind the sliders button at the top right; the match count, depth and breadth stay on screen. Press the corner icon again, or Escape, to come back.'},
    {view:'discover',selectors:['.cm-term-chips','.cm-chips-head'],
     title:'What it is joined by',
     copy:'Every term this card shares with others, and all of them at once — no scrolling for the one that mattered. Tap one for only the cards that share it, again to hide those instead, a third time to clear. They stack, so two taps on two terms is an intersection.'},
    {view:'discover',selectors:['[data-action=add-card]'],
     title:'Take it with you',
     copy:'Add straight to a deck’s plan, a collection group, or your wish list, without leaving the graph.'}]},

  {id:'collect',name:'Organize what you own',icon:'🜃',
   job:'Get my collection into the app, and into groups that match how I store it.',
   promise:'A library the app knows, grouped, every card assigned.',
   have:'Every card you own known to the app, grouped the way you actually store them, and each one either assigned to a deck or explicitly on the bench.',
   steps:[
    {view:'collection',selectors:['[data-action=import-list]'],
     title:'Tell the app what you own',
     copy:'Paste a list, upload a CSV or a spreadsheet, or type names. It resolves each one to a real card with a real price.'},
    {view:'collection',selectors:['#cm-roster-table'],
     title:'One row per card',
     copy:'What it is, what it costs, and where it lives. Click a row to see the card itself.'},
    {view:'collection',selectors:['[data-action=roster-filters]'],act:'openFilters',
     title:'Filter and group',
     copy:'By deck, source, type, colour or allocation. Grouping is how you find the eleven copies of the same land spread across four decks.'},
    {view:'collection',selectors:['[data-action=new-group]'],
     title:'A group is a box that is not yet a deck',
     copy:'You start with four — Main Deck, Bench, To Trade, To Buy — and they are ordinary groups: rename them, delete the ones you do not use, add your own. A precon you took apart, a trade binder, the pile you came home from a convention with.'},
    {view:'collection',selectors:['.cm-toolbar','#cm-roster-table'],
     title:'Correct it where you read it',
     copy:'Paid and Quantity are cells you click and type in — the price on the receipt, the count in the envelope — no dialog. And One row per card folds every print of the same card into one line when you want a list of names rather than a list of purchases.'},
    {view:'collection',selectors:['[data-action=roster-columns]'],
     title:'Choose what the table shows',
     copy:'And what it shows is what an export carries — set the columns once and every export matches.'},
    {view:'collection',selectors:['[data-action=add-card]'],
     title:'One card at a time',
     copy:'Including cards you do not own yet: add them marked as wanted and they turn up on the Shop list.'}]},

  {id:'perform',name:'Read a deck’s performance',icon:'🜔',
   job:'Is this deck good — and good at what?',
   promise:'A read on power, speed and consistency, and what to change.',
   needs:'deck',
   have:'A read on whether the deck is good, at what, and against what — plus the specific cards to change and the evidence behind each one.',
   steps:[
    {view:'decks',selectors:['.cm-deck-grid','.cm-deck-tile'],
     title:'Every deck you have',
     copy:'With its score and what it still needs, so the list itself tells you where to spend the evening.'},
    {view:'decks',params:firstDeck,selectors:['.cm-deck-hero'],
     title:'The header is the summary',
     copy:'What the deck plays, what it costs, and how it measured — before you open anything else.'},
    {view:'decks',params:firstDeck,selectors:['.cm-stats'],
     title:'What the score is',
     copy:'Points on a fixed protocol: six seeds of 20,000 games against sampled opponents. Comparable only with another score from that same protocol, and the app says so when two differ.'},
    {view:'decks',params:firstDeck,selectors:['[data-action=deck-evidence]','[data-action=compare-reports]'],
     title:'The report is where the detail lives',
     copy:'How often you win, how fast, how much you cast in a turn, the turn the games ended — and the per-card cast rates. A card cast in 2% of games is a card to replace, and that list is the one the refiner works from.'},
    {view:'decks',params:firstDeck,selectors:['.cm-curve','.cm-count-list','.cm-grid-2'],
     title:'The shape, before any simulation',
     copy:'The curve and the counts tell you things a score cannot: too few lands, nothing to do on turn two, or eleven cards that all want the same slot.'},
    {view:'decks',params:firstDeck,selectors:['[data-action=deck-suggestions]','[data-action=compare-decks]'],
     title:'And what to do about it',
     copy:'Recommendations read the report and the card graph together, so a suggested swap comes with the measurement that argued for it.'}]},

  {id:'acquire',name:'Buy what a deck still needs',icon:'🜛',
   job:'Turn a list into cards in a box.',
   promise:'A priced buy list, and a way to shop it at a booth.',
   needs:'deck',
   have:'A priced list of exactly what is missing, filtered to what you are shopping for today, and one tap per card to mark it bought.',
   steps:[
    {view:'shop',selectors:['#cm-roster-table'],
     title:'What you owe',
     copy:'Everything your decks need and you do not have, priced at the cheapest paper printing the app could find.'},
    {view:'shop',selectors:['[data-action=shop-mode]'],
     title:'Two lists, one page',
     copy:'The acquisition list is what to buy. Deck assembly is what to pull off the shelf once it has arrived.'},
    {view:'shop',selectors:['[data-action=roster-filters]'],act:'openFilters',
     title:'Filter to today',
     copy:'At a booth you want the red cards under five dollars, not the whole list.'},
    {view:'shop',selectors:['[data-action=shop-buy]','.cm-row-actions','#cm-roster-table'],
     title:'Buy marks it owned',
     copy:'And assigns it to the deck that was waiting for it. On a phone this is the whole interface: name, colour, type, rarity, price, Buy.'},
    {view:'shop',selectors:['[data-action=export-view]'],
     title:'Take it with you',
     copy:'Export exactly what you are looking at — the filters, the grouping and the columns — as a list you can print or hand to a shop.'},
    {view:'shop',selectors:['.cm-user-menu','#cm-user-functions'],
     title:'Or mail it to yourself',
     copy:'Which is how the list gets from the desktop you built on into the pocket you shop with.'}]},

  {id:'portable',name:'Move your library between devices',icon:'🜍',
   job:'Back it up, take it to a convention, and bring the changes home.',
   promise:'A backup, an Excel export, and a phone and desktop that agree.',
   have:'A backup you can restore anywhere, a spreadsheet of your collection enriched with everything the app worked out about it, and a phone and desktop that can hand work back and forth without either forgetting what the other did.',
   steps:[
    {view:'decks',selectors:['#cm-user-functions'],act:'openMenu',
     title:'It all lives in one menu',
     copy:'Back it up, restore it, export it, and move it between machines. Your library is saved in this browser and nowhere else, which is exactly why this menu matters.'},
    {view:'decks',selectors:['[data-action=backup]'],act:'openMenu',
     title:'A backup is one file',
     copy:'Your whole library — decks, collection, groups, prices, every status. The file is the copy that outlives the browser.'},
    {view:'decks',selectors:['[data-action=share-export]'],act:'openMenu',
     title:'Desktop to phone',
     copy:'E-mail that file to yourself, open the mail on the phone, and restore from the attachment. That is the whole trip out.'},
    {view:'decks',selectors:['[data-action=restore]'],act:'openMenu',
     title:'Restoring replaces',
     copy:'This device’s library becomes the file’s. Do it on the phone before you leave, not after you have marked anything.'},
    {view:'shop',selectors:['#cm-roster-table'],
     title:'At the booth',
     copy:'You mark cards bought on the phone. Those changes live in the phone’s browser and nowhere else until you move them.'},
    {view:'decks',selectors:['[data-action=share-export]'],act:'openMenu',
     title:'Phone back to desktop',
     copy:'The same button, the other direction. Export from the phone, mail it home, restore on the desktop — and the statuses you set at the booth land on the machine you build on.'},
    {view:'decks',selectors:['[data-action=export-excel]'],act:'openMenu',
     title:'The other kind of export',
     copy:'Excel gives you your collection plus everything the app worked out about it: real prices, colours, types, what each card is for. Cards in, metadata out.'},
    {view:'decks',selectors:['[data-action=mirror]'],act:'openMenu',
     title:'Or never think about it again',
     copy:'Point it at a file once and it keeps that file current, so the backup is never the thing you forgot to do.'}]}];

/* A tour that describes work on a deck opens by saying what is missing rather than
   spotlighting six empty states in a row. */
const MISSING={
  draft:{step:{view:'lab',selectors:['#cm-lab-run','.cm-lab-start'],
      title:'Nothing to refine yet',
      copy:'This tour is about improving a list, and there is not one open. Choose a commander on the left and run the initial draft — the whole tour is about what happens next.'},
    have:'Nothing yet — and that is the honest answer. Run the initial draft here and take this tour again; every step after this one describes a real list, and there is not one to describe.'},
  deck:{step:{view:'decks',selectors:['[data-action=open-lab]','[data-action=new-deck]','[data-action=import-list]'],
      title:'No decks yet',
      copy:'This tour reads a deck you have already built, and your library is empty. Build one in the Lab, or import a list you already have.'},
    have:'Nothing yet — and that is the honest answer. Build or import a deck and take this tour again; the rest of it reads a real deck’s report, and there is not one to read.'}};

const has={
  draft:()=>Boolean(C.state.preferences?.labPreview?.slots?.length)||Boolean(C.state.decks?.length),
  deck:()=>Boolean(C.state.decks?.some(d=>!d.archived))};

/* ------------------------------------------------------------------ the acts */

/* A step may open the thing it is about to describe. Each act is a no-op when the thing is
   already open, so stepping backwards through a tour never closes what it opened. */
const ACTS={
  openCommander(){const d=$('#cm-lab-commander');if(d&&!d.hidden)d.open=true;},
  openDefinition(){const d=$('#cm-lab-definition');if(d)d.open=true;},
  openFilters(){const p=$('#cm-filter-host');if(p&&!p.children.length)$('[data-action=roster-filters]')?.click();},
  openMenu(){
    const m=$('#cm-user-menu');
    try{if(m&&!m.matches(':popover-open'))m.showPopover();}catch{/* unsupported, or already open */}
    raise();   // the menu just went above the tour card; put the card back on top
  }};

/* ------------------------------------------------------------------ the engine */

let tour=null;   // {steps, index, def} or null

const layer=()=>$('#cm-tour-layer');

/* THE TOUR CARD IS A POPOVER, and has to be.
 *
 * The user-functions menu is a popover, and a popover renders in the browser's TOP LAYER --
 * above every z-index on the page, including a tour layer sitting at 80. So the moment the
 * "move your library between devices" tour opened that menu to point inside it, the menu
 * covered the tour's own Next button and swallowed the click. Measured: Playwright sat on
 * "<button data-action=mirror> intercepts pointer events" until it timed out.
 *
 * Raising the z-index cannot fix this; nothing in the normal stacking context reaches the top
 * layer. The card has to be a popover too. Within the top layer the LAST one shown is on top,
 * so any act that opens another popover re-shows this one afterwards to get back above it. */
const card=()=>$('#cm-tour-popover');
function raise(){
  const el=card();if(!el)return;
  try{if(el.matches(':popover-open'))el.hidePopover();el.showPopover();}
  catch{/* no popover support: the layer's own z-index is then the whole story */}
}

function close(){
  tour=null;
  const el=layer();if(el)el.hidden=true;
  try{card()?.hidePopover();}catch{/* was not open */}
  try{$('#cm-user-menu')?.hidePopover();}catch{/* was not open */}
}

/* Look inside the step's own view first -- see lesson 2 at the top of this file. The app
   renders one view at a time into #cm-main, so "the step's view" is #cm-main whenever the
   router is already showing it; the unscoped pass is for the header and the menu, which are
   deliberately outside it. */
function findTarget(step){
  const onView=C.route().view===step.view;
  const scope=onView?$('#cm-main'):null;
  const hit=(selector,where)=>layer()?.setAttribute('data-tour-hit',`${where}:${selector}`);
  if(scope)for(const selector of step.selectors){
    const t=scope.querySelector(selector);
    if(t){hit(selector,'view');return t;}
  }
  for(const selector of step.selectors){
    const t=document.querySelector(selector);
    if(t){hit(selector,'page');return t;}
  }
  layer()?.setAttribute('data-tour-hit','none');
  return null;
}

/* No target, or nothing solid to point at: the popover goes to the middle of the screen and
   the spotlight shrinks out of the way. The finish card uses this state deliberately. */
function centre(){
  const spot=$('#cm-tour-spotlight'),pop=$('#cm-tour-popover');
  Object.assign(spot.style,{left:'50%',top:'50%',width:'1px',height:'1px'});
  const width=Math.min(420,innerWidth-24);
  Object.assign(pop.style,{left:`${Math.max(12,(innerWidth-width)/2)}px`,
    top:`${Math.max(12,(innerHeight-pop.offsetHeight)/2)}px`});
}

function position(target){
  if(!target)return centre();
  const r=target.getBoundingClientRect();
  if(r.width<8||r.height<8||r.bottom<0||r.top>innerHeight)return centre();
  const spot=$('#cm-tour-spotlight'),pop=$('#cm-tour-popover'),pad=7;
  Object.assign(spot.style,{
    left:`${Math.max(5,r.left-pad)}px`,top:`${Math.max(5,r.top-pad)}px`,
    width:`${Math.min(innerWidth-10,r.width+pad*2)}px`,
    height:`${Math.min(innerHeight-10,r.height+pad*2)}px`});
  const width=Math.min(420,innerWidth-24);
  const left=Math.min(innerWidth-width-12,Math.max(12,r.left+r.width/2-width/2));
  const below=r.bottom+14,above=r.top-pop.offsetHeight-14;
  const top=below>=12&&below+pop.offsetHeight<=innerHeight-12?below
    :above>=12?above:Math.max(12,innerHeight-pop.offsetHeight-12);
  Object.assign(pop.style,{left:`${left}px`,top:`${top}px`});
}

/* Find and measure in the same breath, and keep going until it holds -- lesson 1. The index
   check stops a slow step from repainting over a fast reader's next one. */
function place(step,index){
  let tries=0;
  const attempt=()=>{
    if(!tour||tour.index!==index)return;
    if(step.act)ACTS[step.act]?.();
    const target=findTarget(step);
    const rect=target&&target.isConnected?target.getBoundingClientRect():null;
    if(rect&&rect.width>=8&&rect.height>=8){
      target.scrollIntoView({behavior:'instant',block:'center',inline:'nearest'});
      position(target.isConnected?target:null);   // re-read: the page moved under that rect
      return;
    }
    centre();
    if((tries+=1)<30)setTimeout(attempt,200);
  };
  requestAnimationFrame(()=>requestAnimationFrame(attempt));
}

/* The finish card is a step with no target: same shape the engine already draws when there is
   nothing solid to point at, so it needs no special case beyond its own buttons. */
const finishStep=def=>({finish:true,view:null,selectors:[],
  title:`${def.name} · what you now have`,copy:def.have});

function show(){
  if(!tour)return;
  const step=tour.steps[tour.index];
  const total=tour.steps.length;
  $('#cm-tour-progress').textContent=step.finish
    ? `${tour.def.name} · finish`
    : `${tour.def.name} · ${tour.index+1} of ${total-1}`;
  $('#cm-tour-title').textContent=step.title;
  $('#cm-tour-copy').innerHTML=`<p>${e(step.copy)}</p>`;
  $('#cm-tour-back').disabled=tour.index===0;
  $('#cm-tour-next').textContent=step.finish?'Done':'Next';
  $('#cm-tour-again').hidden=!step.finish;
  if(step.finish){layer().setAttribute('data-tour-hit','finish');centre();return;}
  const params=typeof step.params==='function'?step.params():step.params||{};
  const here=C.route();
  const sameRoute=here.view===step.view&&Object.entries(params).every(([k,v])=>here.params.get(k)===v);
  if(!sameRoute)C.go(step.view,params);
  place(step,tour.index);
}

function start(id){
  const def=TOURS.find(t=>t.id===id);
  if(!def)return;
  /* A TOUR WITH NOTHING TO POINT AT SAYS SO AND STOPS, rather than walking a reader through
     six steps of empty screens. The browser walk measured exactly that failure: "read a
     deck's performance" on an empty library scored five consecutive steps that matched
     nothing, which teaches less than one honest sentence. The finish card then says what
     they need rather than what they have -- the promise this tour cannot keep today. */
  const gap=def.needs&&!has[def.needs]()?MISSING[def.needs]:null;
  const steps=gap
    ? [gap.step,finishStep({...def,have:gap.have})]
    : [...def.steps,finishStep(def)];
  tour={steps,index:0,def};
  const el=layer();el.hidden=false;el.dataset.tour=id;
  raise();
  show();
}

function move(direction){
  if(!tour)return;
  const next=tour.index+direction;
  if(next<0)return;
  if(next>=tour.steps.length)return close();
  tour.index=next;
  show();
}

/* ------------------------------------------------------------------ the chooser */

/* You pick a JOB, not a screen. The card leads with the job in the reader's own words and
   ends with what they will have, because that is what makes one of seven worth choosing. */
function chooser(){
  C.modal('Take a tour',
    `<p class="cm-muted cm-tour-lede">Seven guided walkthroughs, each one a thing you might be trying to do. Every tour runs on this page with your own data, and ends by saying what you have because of it.</p>
     <div class="cm-tour-picks">${TOURS.map(t=>
      `<button type="button" class="cm-tour-pick" data-action="tour-start" data-tour="${e(t.id)}">
        <span class="cm-tour-icon" aria-hidden="true">${t.icon}</span>
        <span class="cm-tour-pick-body">
          <strong>${e(t.name)}</strong>
          <small>${e(t.job)}</small>
          <em>You end with: ${e(t.promise)}</em>
        </span>
      </button>`).join('')}</div>`);
}

/* ------------------------------------------------------------------ wiring */

actions['tour']=()=>chooser();
actions['tour-start']=el=>{$('#cm-dialog')?.close();start(el.dataset.tour);};
actions['tour-next']=()=>move(1);
actions['tour-back']=()=>move(-1);
actions['tour-close']=()=>close();
actions['tour-again']=()=>{close();chooser();};

addEventListener('keydown',ev=>{
  if(!tour)return;
  if(ev.key==='Escape')return close();
  if(ev.key==='ArrowRight')return move(1);
  if(ev.key==='ArrowLeft')return move(-1);
});
/* A step's target moves when the window does, and the popover has to follow it. */
const reposition=()=>{if(tour&&!tour.steps[tour.index].finish)position(findTarget(tour.steps[tour.index]));else if(tour)centre();};
addEventListener('resize',reposition);
addEventListener('scroll',reposition,true);

/* Exported for tests: the content is the part worth holding honest. */
C.tours=TOURS;
});
