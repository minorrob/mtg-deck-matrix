import {randomUUID} from 'node:crypto';
import {pilotPolicy} from '../contracts/pilot-policy.mjs';

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const cardText=card=>[card?.name,card?.typeLine,card?.oracleText].filter(Boolean).join(' · ');
const clip=(value,max=360)=>String(value||'').slice(0,max);
const pilotCard=card=>({cardId:card.cardId,name:card.name,manaCost:card.manaCost,typeLine:card.typeLine,oracleText:card.oracleText});
const publicPilotCard=card=>({cardId:card.cardId,name:card.name,manaCost:card.manaCost,typeLine:card.typeLine,tapped:card.tapped,power:card.power,toughness:card.toughness,counters:card.counters});
const unique=values=>[...new Set(values)];

export function publicThreatAssessment(state,seatId,difficulty=3){
  const attention=pilotPolicy(difficulty).opponentAttention;
  if(attention===0)return [];
  const patterns=[
    [/create (?:twice|double)|twice that many|additional .*token/i,9,'token multiplier'],
    [/whenever .* (?:dies|sacrificed)|sacrifice another|return .*graveyard/i,8,'sacrifice or recursion engine'],
    [/whenever .*draw|draw (?:a|two|three) cards|no maximum hand size/i,7,'repeatable card advantage'],
    [/untap target|doesn.t untap|additional untap/i,7,'untap engine'],
    [/add (?:one|two|three|an amount of) mana|double .*mana/i,6,'mana engine'],
    [/proliferate|additional counter|double .*counter/i,6,'counter or proliferate engine'],
    [/you win the game|loses the game|infinite/i,10,'explicit game-ending engine']
  ];
  const threats=[];
  for(const player of state?.players||[]){if(player.playerId===seatId)continue;for(const card of player.zones?.Battlefield?.cards||[]){if(card.faceDown)continue;const text=cardText(card);let score=0,signals=[];for(const [re,value,label]of patterns)if(re.test(text)){score+=value;signals.push(label);}score+=Math.max(0,Number(card.power)||0)/3;score*=attention;if(score>=2)threats.push({playerId:player.playerId,cardId:card.cardId,name:card.name,score:Number(score.toFixed(2)),signals});}}
  return threats.sort((a,b)=>b.score-a.score||a.cardId-b.cardId).slice(0,pilotPolicy(difficulty).threatLimit);
}

export function compactPilotObservation(view,seatId,difficulty=3){
  const state=view.state||{},own=state.players?.find(p=>p.playerId===seatId);
  return {schema:'CrankMagicPilotObservation@1',seatId,revision:view.revision,turn:state.turn,phase:state.phase,turnPlayerId:state.turnPlayerId,priorityPlayerId:state.priorityPlayerId,stack:state.stack||[],combat:state.combat||null,
    own:own?{life:own.life,health:own.health,mana:own.mana,hand:own.zones?.Hand?.cards?.map(pilotCard)||[],battlefield:own.zones?.Battlefield?.cards?.map(c=>({...pilotCard(c),tapped:c.tapped,power:c.power,toughness:c.toughness,counters:c.counters}))||[]}:null,
    // Forge publishes these private search/tutor candidates only in this seat's view.
    // They are legal offered choices, not a projection of any hidden zone or deck order.
    offeredCards:(view.ui?.selectableCards||[]).map(pilotCard),
    decision:{prompt:view.ui?.prompt,inputType:view.ui?.inputType,choice:view.ui?.choice,selectedCardIds:view.ui?.highlightedCards||[],selectedPlayerIds:view.ui?.highlightedPlayers||[]},
    opponents:(state.players||[]).filter(p=>p.playerId!==seatId).map(p=>({playerId:p.playerId,name:p.name,health:p.health,handCount:p.zones?.Hand?.count,battlefield:p.zones?.Battlefield?.cards?.filter(c=>!c.faceDown).map(publicPilotCard)||[]})),
    threats:publicThreatAssessment(state,seatId,difficulty),policy:pilotPolicy(difficulty)};
}

function damageActions(q){
  const base=Array(q.options.length).fill(0),blockers=q.options.map((o,i)=>[o,i]).filter(([o])=>!o.defender),defender=q.options.findIndex(o=>o.defender);let remaining=q.total;
  for(let j=0;j<blockers.length;j++){const [target,i]=blockers[j],last=j===blockers.length-1&&defender<0,amount=last?remaining:Math.min(remaining,target.lethal);base[i]=amount;remaining-=amount;}
  if(defender>=0)base[defender]=remaining;else if(remaining&&blockers.length)base[blockers.at(-1)[1]]+=remaining;
  const actions=[base];if(q.divide)for(let i=0;i<q.options.length;i++){const all=Array(q.options.length).fill(0);all[i]=q.total;actions.push(all);}
  return unique(actions.map(JSON.stringify)).map(text=>({label:'Assign '+JSON.parse(text).map((n,i)=>`${n} to ${q.options[i].label}`).join(', '),action:{kind:'answer',choiceId:q.id,amounts:JSON.parse(text)}}));
}
function amountActions(q){
  const allocate=indices=>{const values=q.options.map(()=>q.minEach||0);let left=q.total-values.reduce((a,b)=>a+b,0);for(const i of indices){const room=q.options[i].max-values[i],add=Math.min(room,left);values[i]+=add;left-=add;}return left?null:values;};
  const orders=[q.options.map((_,i)=>i),q.options.map((_,i)=>i).reverse()],actions=orders.map(allocate).filter(Boolean);
  return unique(actions.map(JSON.stringify)).map(text=>({label:'Allocate '+JSON.parse(text).map((n,i)=>`${n} to ${q.options[i].label}`).join(', '),action:{kind:'answer',choiceId:q.id,amounts:JSON.parse(text)}}));
}
function selectionActions(q){
  const ids=q.options.map(o=>o.index),sets=[];
  if(q.mode==='one'||q.mode==='boolean'||q.mode==='index')for(const i of ids)sets.push([i]);
  else if(q.mode==='order'){
    const prior=(q.selectedIndices||[]).filter(i=>ids.includes(i));if(prior.length>=q.min&&prior.length<=q.max)sets.push(prior);
    if(q.min===ids.length)sets.push(ids,[...ids].reverse());else{sets.push(ids.slice(0,q.min),ids.slice(-q.min));for(const i of ids)if(q.min<=1&&q.max>=1)sets.push([i]);if(q.max===ids.length)sets.push(ids);}
  }else{if(q.min===0)sets.push([]);for(const i of ids)if(q.min<=1&&q.max>=1)sets.push([i]);sets.push(ids.slice(0,q.min));if(q.max===ids.length)sets.push(ids);}
  return unique(sets.map(JSON.stringify)).map(text=>{const indices=JSON.parse(text),names=indices.map(i=>q.options.find(o=>o.index===i)?.label).filter(Boolean);return {label:names.length?`Choose ${names.join(' then ')}`:'Choose none',action:{kind:'answer',choiceId:q.id,indices}};});
}
function isManaAbilityText(value){
  const text=String(value||'').replace(/[()]/g,' ').replace(/\s+/g,' ').trim();
  return /(?:\{T\}|\btap\b|sacrifice [^:]+)\s*:\s*add\b/i.test(text)||/^add\s+(?:\{|one\b|two\b|three\b|an?\b|mana\b)/i.test(text);
}
function isPureManaActivation(candidate,cards,ui){
  if(ui.payment||candidate.action.kind!=='card'||!/:\s*activate ability\b/i.test(candidate.label))return false;
  const card=cards.get(candidate.action.targetId),lines=String(card?.oracleText||'').split(/\r?\n/).map(line=>line.trim()).filter(line=>line.includes(':'));
  return lines.length>0&&lines.every(isManaAbilityText);
}
export function buildPilotCandidates(view,seatId,difficulty=3){
  if(view.state?.gameOver)return [];
  const ui=view.ui||{},rawChoice=ui.choice,policy=pilotPolicy(difficulty),cards=new Map([
    ...(view.state?.players||[]).flatMap(p=>Object.values(p.zones||{}).flatMap(z=>z.cards||[])),
    ...(ui.selectableCards||[])
  ].map(c=>[c.cardId,c]));
  const q=rawChoice&&!ui.payment&&rawChoice.title==='Choose an ability'?{...rawChoice,options:(rawChoice.options||[]).filter(option=>!isManaAbilityText(option.label))}:rawChoice;
  let result=[];
  if(q){
    if(['draw','ack'].includes(q.mode))result=[{label:q.mode==='draw'?'Take the required draw':'Continue after reviewing the message',action:{kind:'answer',choiceId:q.id,indices:[]},automatic:true}];
    else if(['one','boolean','index','many','order'].includes(q.mode))result=selectionActions(q);
    else if(q.mode==='integer'){for(const value of unique([q.min,q.max,Math.floor((q.min+q.max)/2),1]).filter(n=>n>=q.min&&n<=q.max))result.push({label:`Choose ${value}`,action:{kind:'answer',choiceId:q.id,value}});}
    else if(q.mode==='damage')result=damageActions(q);
    else if(q.mode==='amount')result=amountActions(q);
    else if(q.mode==='text'){
      const suggestions=unique([q.initial,...(q.options||[]).map(o=>o.label),...(view.state?.players||[]).flatMap(p=>Object.values(p.zones||{}).flatMap(z=>(z.cards||[]).filter(c=>!c.faceDown).map(c=>c.name))),'Forest']).filter(Boolean);
      result=suggestions.slice(0,policy.candidateLimit).map(text=>({label:`Enter “${text}”`,action:{kind:'answer',choiceId:q.id,text}}));if(!q.numeric)result.push({label:'Cancel this optional text choice',action:{kind:'answer',choiceId:q.id,cancel:true}});
    }
  }else if(ui.payment?.automaticEligible&&ui.ok==='Auto'&&ui.okEnabled)result=[{label:'Pay the offered mana cost automatically',action:{kind:'ok'},automatic:true}];
  else{
    for(const [id,description]of Object.entries(ui.cardActions||{})){const card=cards.get(Number(id));result.push({label:`Use ${card?.name||'card '+id}: ${description}${card?.oracleText?' · '+clip(card.oracleText):''}`,action:{kind:'card',targetId:Number(id)}});}
    for(const id of ui.selectables||[]){const card=cards.get(id);if(!result.some(c=>c.action.kind==='card'&&c.action.targetId===id))result.push({label:`Select ${card?.name||'card '+id}${card?.typeLine?' · '+card.typeLine:''}${card?.manaCost?' · '+card.manaCost:''}${card?.oracleText?' · '+card.oracleText:''}`,action:{kind:'card',targetId:id}});}
    let players=ui.inputType?(ui.highlightedPlayers||[]):[];
    const choosingStart=/who would you like to start|starting player|start this game/i.test(ui.prompt||'');
    if(!players.length&&ui.inputType&&(choosingStart||/player|opponent|defender|attack/i.test(ui.prompt||''))){
      players=(view.state?.players||[]).filter(p=>choosingStart||p.playerId!==seatId).map(p=>p.playerId);
    }
    for(const id of players)result.push({label:`Select player ${(view.state?.players||[]).find(p=>p.playerId===id)?.name||id}`,action:{kind:'player',targetId:id}});
    if(ui.okEnabled)result.push({label:ui.ok==='OK'?'Confirm or pass priority':ui.ok,action:{kind:'ok'}});if(ui.cancelEnabled)result.push({label:ui.cancel||'Cancel',action:{kind:'cancel'}});
  }
  result=result.filter(candidate=>!isPureManaActivation(candidate,cards,ui));
  const failedThisTurn=new Set((view.telemetry?.recent||[]).filter(event=>event.kind==='browser-cast-cancelled'&&event.turn===view.state?.turn).map(event=>event.cardId));
  if(failedThisTurn.size)result=result.filter(candidate=>candidate.action.kind!=='card'||!failedThisTurn.has(candidate.action.targetId));
  if(result.length&&result.every(c=>['ok','cancel'].includes(c.action.kind))&&ui.ok==='OK'&&/^Priority:/m.test(ui.prompt||'')){
    const pass=result.find(c=>c.action.kind==='ok');if(pass)return [{...pass,automatic:true}];
  }
  // Competency limits search effort, not access to Forge's legal choices. Truncating
  // here hid Confirm/Cancel and later tutor targets behind the first few cards.
  return result;
}

function localFallback(candidates){return candidates.findIndex(c=>!/(cancel|pass priority|end turn|choose none)/i.test(c.label));}

export function createApiPilotRunner({seats,bridge,providerForSeat,onEvent=()=>{},pollMs=100}){
  let stopped=false;const abort=new AbortController();
  const state=new Map(seats.map(seat=>[seat.seatId,{seat,policy:pilotPolicy(seat.pilot.difficultyRequested||3),calls:0,lastRevision:-1,errors:0,rejected:new Set(),context:null,pending:null,paused:false}]));
  const actionKey=action=>JSON.stringify(action);
  const contextKey=view=>JSON.stringify([view.state,view.ui?.prompt,view.ui?.inputType,view.ui?.choice,view.ui?.selectables,view.ui?.cardActions,view.ui?.highlightedCards,view.ui?.highlightedPlayers,view.ui?.okEnabled,view.ui?.cancelEnabled]);
  const changedDecision=error=>/board changed|decision changed|choice.*expired|no active decision|current decision|button is unavailable/i.test(error.message||'');
  const transportFailure=error=>error.name==='TimeoutError'||error.name==='AbortError'||/fetch failed|failed to fetch|network|timed? ?out|ECONN|HTTP 50[234]/i.test(error.message||'');
  function failedAction(entry,pending,message){
    entry.errors++;entry.rejected.add(actionKey(pending.action));entry.lastRevision=-1;entry.pending=null;
    onEvent({kind:'ai-action-rejected',seatId:entry.seat.seatId,actionId:pending.request.actionId,message,label:pending.label});
  }
  async function submit(entry,pending){
    pending.attempts++;pending.retryAt=Date.now()+500;entry.pending=pending;
    try{
      await bridge(entry.seat.seatId,'action',pending.request);
      pending.uncertain=false;
      onEvent({kind:'ai-action-submitted',seatId:entry.seat.seatId,revision:pending.request.revision,actionId:pending.request.actionId,source:pending.source,label:pending.label,difficulty:entry.policy.level});
      // Answers are validated/stored synchronously by Forge; card/button clicks
      // are queued on its UI thread and require the separate final outcome.
      if(pending.action.kind==='answer'){entry.answeredChoiceId=pending.action.choiceId;entry.pending=null;}
    }catch(error){
      if(stopped)return;
      if(transportFailure(error)){pending.uncertain=true;return;}
      if(changedDecision(error)){entry.pending=null;entry.lastRevision=-1;return;}
      failedAction(entry,pending,String(error.message||error));
    }
  }
  async function step(entry){
    if(stopped||entry.paused)return;
    const {seat,policy}=entry,view=await bridge(seat.seatId,'view');if(stopped||view.state?.gameOver)return;
    const context=contextKey(view);
    if(context!==entry.context){entry.context=context;entry.rejected.clear();}
    if(entry.pending){
      const pending=entry.pending,result=view.ui?.lastAction;
      if(result?.id===pending.request.actionId&&result.status==='error'){
        // Ignore rejected actions only while the actual decision is unchanged.
        if(context===pending.context)failedAction(entry,pending,result.message||'Forge rejected the action');
        else{entry.pending=null;entry.lastRevision=-1;onEvent({kind:'ai-action-rejected',seatId:seat.seatId,actionId:pending.request.actionId,message:result.message});}
      }else if(result?.id===pending.request.actionId&&result.status==='completed'){
        entry.pending=null;onEvent({kind:'ai-action-completed',seatId:seat.seatId,actionId:pending.request.actionId,label:pending.label});
      }else{
        if(pending.uncertain&&Date.now()>=pending.retryAt&&pending.attempts<3&&!view.ui?.actionInFlight){await submit(entry,pending);return;}
        if(Date.now()-pending.startedAt>8000){entry.paused=true;onEvent({kind:'ai-pilot-paused',seatId:seat.seatId,reason:'Forge has not confirmed the last action; inspect the pending decision before resuming.',actionId:pending.request.actionId});}
        return;
      }
    }
    if(view.revision===entry.lastRevision||view.ui?.actionInFlight||entry.answeredChoiceId&&entry.answeredChoiceId===view.ui?.choice?.id)return;
    const candidates=buildPilotCandidates(view,seat.seatId,policy.level).filter(c=>!entry.rejected.has(actionKey(c.action)));if(!candidates.length)return;
    entry.lastRevision=view.revision;let selected=0,source='automatic';
    if(!(candidates.length===1&&candidates[0].automatic)){
      source='provider';try{if(entry.calls>=policy.modelCallBudget)throw Error('AI model call budget reached');entry.provider??=providerForSeat(seat,policy);onEvent({kind:'ai-provider-requested',seatId:seat.seatId,revision:view.revision,candidateCount:candidates.length,difficulty:policy.level});entry.calls++;selected=await entry.provider({seatId:seat.seatId,revision:view.revision,choice:{mode:'one',min:1,max:1,options:candidates.map((c,index)=>({index,label:c.label}))},observation:compactPilotObservation(view,seat.seatId,policy.level),signal:abort.signal});if(!Number.isInteger(selected)||!candidates[selected])throw Error('AI provider selected an unavailable action');entry.errors=0;}
      catch(error){entry.errors++;source='bounded-local-fallback';selected=Math.max(0,localFallback(candidates));onEvent({kind:'ai-provider-failure',seatId:seat.seatId,revision:view.revision,message:String(error.message||error),fallback:candidates[selected].label});}
    }
    if(stopped)return;
    const chosen=candidates[selected];
    await submit(entry,{...chosen,request:{...chosen.action,revision:view.revision,actionId:randomUUID()},context,source,startedAt:Date.now(),attempts:0});
  }
  const done=(async()=>{while(!stopped){await Promise.all([...state.values()].map(async entry=>{try{await step(entry);}catch(error){entry.errors++;onEvent({kind:'ai-pilot-error',seatId:entry.seat.seatId,message:String(error.message||error)});}}));await wait(pollMs);}})();
  return {stop(){stopped=true;abort.abort();},done,status(){return [...state.values()].map(x=>({seatId:x.seat.seatId,difficulty:x.policy.level,providerCalls:x.calls,errors:x.errors,paused:x.paused,pendingActionId:x.pending?.request.actionId}));}};
}
