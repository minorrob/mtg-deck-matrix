function releaseOld(old){
 const previousDeck=old.deck,wasInDeck=old.placement==='In deck';
 delete old.slot;
 if(old.source==='To buy'){rows=rows.filter(r=>r!==old);return;}
 const need=old.source==='Owned'?rows.find(r=>r!==old&&r.name===old.name&&r.source==='To buy'&&r.deck&&r.deck!==previousDeck&&!archivedDecks.includes(r.deck)):null;
 if(need){old.deck=need.deck;old.slot=need.slot;old.placement='Reserved';old.purpose=need.purpose;rows=rows.filter(r=>r!==need);}
 else{old.deck='';old.placement=old.source==='Owned'?(wasInDeck?'Move pending':'Bench'):'Unassigned';old.purpose='Unassigned';}
 if(wasInDeck&&!old.location.includes('pending'))old.location+=' / move pending';
}
function applySwap(second){
 const r=rows.find(x=>x.id===candidate),old=slot3();
 if(!r||r===old)return;
 const name=r.name,donor=r.deck,wasInDeck=r.placement==='In deck';
 const execute=()=>{
  candidate=null;
  const destination=old.source==='Owned'?rows.find(x=>x!==old&&x.name===old.name&&x.source==='To buy'&&x.deck&&x.deck!==old.deck&&!archivedDecks.includes(x.deck)):null;
  const releaseNote=old.source==='Owned'?` ${old.name} remains owned and ${destination?'fulfills the need in '+destination.deck:'returns to the bench'}; any physical move stays pending.`:old.source==='Ordered'?` ${old.name} remains an unassigned order.`:'';
  transact((second?`${name}: added a separate To buy commitment for Atraxa; original copy unchanged.`:`${name}: allocation moved from ${donor||'Bench'} to Atraxa${donor?'; '+donor+' now needs a replacement copy':''}. Physical location unchanged.`)+releaseNote,()=>{
   releaseOld(old);
   if(second)rows.push({id:'new'+(++serial),name,source:'To buy',deck:'Atraxa',placement:'Reserved',location:'Not acquired',purpose:'Main deck',slot:3});
   else{if(donor)rows.push({id:'need'+(++serial),name,source:'To buy',deck:donor,placement:'Reserved',location:'Not acquired',purpose:'Main deck'});r.deck='Atraxa';r.placement='Reserved';r.purpose='Main deck';r.slot=3;if(wasInDeck&&!r.location.includes('pending'))r.location+=' / transfer pending';}
  });
  q('#v-swap-panel').hidden=true;
 };
 if(!second&&donor&&(wasInDeck||locks[donor]))confirmChange('Review transfer from '+donor,`${name} is ${r.placement} in ${donor}${locks[donor]?', a locked deck':''}. Transferring this allocation leaves ${donor} needing another copy. Its physical location stays recorded until you move it. This overrides protection for this copy only; the deck stays locked. You can keep the current card or acquire another copy instead.`,execute);
 else execute();
}
