/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* Typed presentation facts for one legal alternative. Never split a rendered sentence to recover rules.
   The consumer filters complete alternatives, so restrictions across modes, targets and costs survive. */
import {targetName} from '../engine/script/bind.mjs';
import {paymentWords} from '../engine/rules/mana.mjs';
import {castTapPlans} from '../engine/rules/actions.mjs';

export function decisionPath(state, choice, option, action, script) {
  const path=[];
  const add=(key,value,label,kind=key)=>path.push({key,value,label:String(label),kind});
  const name=id=>state.objects[id]?.faceDown ? 'Face-down card' : state.objects[id]?.card ?? 'Card';
  const card=(key,id,kind)=>add(key,id,name(id),kind);
  if (action) {
    if(action.objectId!==undefined)card('source',action.objectId,'source');
    add('action',action.kind,({cast:'Cast',activate:'Activate','activate-mana':'Tap for mana','play-land':'Play'})[action.kind] || option.label);
    if(action.abilityId!==undefined)add('ability',action.abilityId,action.text || option.label);
    if(action.kind==='cast'){
      const methods=['convoke','delve'].filter(key=>action[key]);
      add('payment-method',methods,methods.length ? methods.map(key=>({convoke:'Convoke',delve:'Delve'})[key]).join(' / ') : 'Mana cost','casting');
    }
    // These facts choose a spell's face or its alternative casting method before its modes.
    for(const field of ['adventure','face','disguise','alternative','free','flashback','escape']) if(action[field]!==undefined && action[field]!==false) {
      const ability=field==='alternative' ? state.objects[action.objectId]?.abilities?.[action[field]] : null;
      add(`cast:${field}`,action[field],ability?.text || ({adventure:option.label,face:option.label,disguise:'Face down',free:'Without paying its mana cost',flashback:'Flashback',escape:'Escape'})[field] || field,'casting');
    }
  }
  const modes=action?.modes ?? option.modes;
  if(Array.isArray(modes)) {
    add('mode-count',modes.length,modes.length ? `Choose ${modes.length}` : 'Choose none','count');
    modes.forEach((mode,i)=>add(`mode:${i}`,mode,script?.modal?.modes?.[mode]?.text || `Mode ${mode+1}`,'mode'));
  }
  if(action?.x!==undefined)add('x',action.x,`X = ${action.x}`,'amount');
  if(action?.gift!==undefined)add('gift',action.gift,state.players[action.gift]?.name || 'Opponent','player');
  const targets=action?.targets ?? option.targets;
  (targets || []).forEach((group,i)=>{
    const list=Array.isArray(group)?group:[group];
    // A counted target is a later server question, never a fabricated target here.
    if(list.some(t=>t?.kind==='choose'))return;
    if(!list.length)add(`target:${i}:count`,0,'No targets','target');
    list.forEach((target,j)=>{
      if(target){
        const owner=target.kind==='object' ? state.players[state.objects[target.id]?.controller]?.name : null;
        add(`target:${i}:${j}`,[target.kind,target.id],`${targetName(state,target)}${owner?` · ${owner}`:''}`,'target');
      }
    });
  });
  for(const [kind,ids] of Object.entries(action?.costChoice || {})) {
    if(kind==='counter')add('cost:counter',ids,`${ids} counter`,'cost');
    else [].concat(ids).forEach((id,i)=>card(`cost:${kind}:${i}`,id,kind));
  }
  if(action?.extraMana)add('extra-mana',action.extraMana,action.extraMana,'mana');
  if(action?.produce!==undefined)add('produce',action.produce,paymentWords({mana:action.mana || {},life:0}),'mana');
  if(action?.payWith!==undefined)add('payment',action.payWith,paymentWords(action.payment || {mana:{},life:0}),'mana');
  // Cost questions carry their exact tap plan. Source identity and output are separate layers.
  const onlyPlans=action?.autoTap ? castTapPlans(state,state.priorityPlayer ?? state.awaiting?.player,action,2) : [];
  const taps=option.taps || (onlyPlans.length===1 ? onlyPlans[0].taps : []);
  taps.forEach((tap,i)=>{
    card(`mana-source:${i}`,tap.id,'mana-source');
    // tapUnits encodes a multi-mana source as C:2 or W:1+U:1. This is an engine key, not display text.
    const mana=Object.fromEntries(String(tap.color).split('+').map(part=>{const [color,count='1']=part.split(':');return [color,Number(count)];}));
    add(`mana-color:${i}`,tap.color,paymentWords({mana,life:0}),'mana');
    path.at(-1).mana=mana;
  });
  if(option.payment){
    const produced={};for(const n of path)for(const [color,count] of Object.entries(n.mana || {}))produced[color]=(produced[color] || 0)+count;
    const pool=Object.fromEntries(Object.entries(option.payment.mana || {}).map(([color,count])=>[color,Math.max(0,count-(produced[color] || 0))]).filter(([,count])=>count));
    // Exact source outputs need no repeated total. Surplus output still needs the chosen spending shown.
    const extra={mana:pool,life:option.payment.life || 0};
    add('mana-payment',option.payment,paymentWords(option.payment),'mana');
    const surplus=Object.entries(produced).some(([color,count])=>count>(option.payment.mana?.[color] || 0));
    path.at(-1).reviewLabel=surplus ? paymentWords(option.payment) : Object.keys(pool).length || extra.life ? paymentWords(extra) : '';
  }
  if(!action && !modes && !targets && !option.taps) {
    add('option',option.index,option.label,choice.cost==='pool'?'mana':'option');
  }
  return path;
}
