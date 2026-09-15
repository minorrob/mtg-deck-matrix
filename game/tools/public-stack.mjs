// Reconstruct only announced stack objects. Raw choice text and private zones never leave this module.
export function publicStack(events){
  const pending=new Map();
  for(const e of events){
    const f=e.data?.fields||{};
    if(e.kind==='GameEventCardChangeZone'&&f.card&&f.to?.zoneType!=='Stack'&&f.to!=='Stack'){
      for(const [id,item]of pending)if(item.kind==='spell'&&item.cardId===f.card.cardId)pending.delete(id);
    }
    if(e.kind==='GameEventZone'&&f.zoneType==='Stack'&&f.card){
      const key='card:'+f.card.cardId;
      if(f.mode==='Added'&&f.sa?.isSpell!==false){
        if(![...pending.values()].some(x=>x.cardId===f.card.cardId&&x.kind==='spell'&&x.stage==='stack'))pending.set(key,{cardId:f.card.cardId,name:f.card.faceDown?null:f.card.name,faceDown:!!f.card.faceDown,playerId:f.player?.playerId??null,kind:'spell',stage:'casting',sequence:e.sequence});
      }else if(f.mode==='Removed')for(const [id,item]of pending)if(item.kind==='spell'&&item.cardId===f.card.cardId)pending.delete(id);
    }else if(e.kind==='GameEventSpellAbilityCast'&&f.sa&&f.si){
      const c=f.sa.host||f.si.source;
      if(f.sa.isSpell)pending.delete('card:'+c?.cardId);
      const targets=(f.si.targets||[]).filter(t=>t.kind==='card'||t.kind==='player').map(t=>t.kind==='player'?{kind:'player',playerId:t.playerId,name:t.name}:{kind:'card',cardId:t.cardId,name:t.hidden?null:t.name,hidden:!!t.hidden});
      pending.set('stack:'+f.si.stackId,{stackId:f.si.stackId,abilityId:f.sa.abilityId,cardId:c?.cardId,name:c?.faceDown?null:c?.name,faceDown:!!c?.faceDown,playerId:f.si.actor?.playerId??null,kind:f.sa.isSpell?'spell':f.si.isTrigger?'trigger':'ability',stage:'stack',sequence:e.sequence,targets});
    }else if(e.kind==='GameEventSpellResolved'||e.kind==='GameEventSpellRemovedFromStack'){
      const sa=f.spell||f.sa;for(const [id,item]of pending)if(item.abilityId===sa?.abilityId)pending.delete(id);
    }
  }
  return [...pending.values()].sort((a,b)=>b.sequence-a.sequence);
}
