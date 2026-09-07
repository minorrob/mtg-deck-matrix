function putInDeck(r,deck,replacementId=null){
 const cross=r.deck!==deck,needsReceipt=r.source!=='Owned';
 let target=cross?rows.find(x=>x!==r&&x.deck===deck&&x.name===r.name&&x.source==='To buy'):null;
 if(replacementId)target=rows.find(x=>x.id===replacementId&&x.deck===deck&&x!==r);
 if(cross&&!target){
  const choices=rows.filter(x=>x.deck===deck&&x!==r);
  dialog('Choose a replacement slot',`<p class="v-dialog-note">${esc(deck)} has no open commitment for ${esc(r.name)}. Choose the slot it will replace so the deck stays at 100.</p><label class="v-field">Replace in ${esc(deck)}<select class="v-select" id="v-placement-slot">${choices.map(x=>`<option value="${x.id}">${esc(x.name)} · ${x.source}</option>`).join('')}</select></label><p class="v-small">This preview exposes selected sample slots. Owned outgoing cards remain in the library; physical moves stay pending until confirmed.</p><button class="v-button v-primary" id="v-review-placement" type="button" ${choices.length?'':'disabled'}>Review this move</button>`);
  q('#v-review-placement').onclick=()=>{const selected=q('#v-placement-slot').value;q('#v-dialog').close();putInDeck(r,deck,selected);};return;
 }
 const apply=()=>transact(`${r.name}: put in ${deck}.${needsReceipt?' Receipt recorded.':''}${cross?' Donor and destination commitments updated.':''}`,()=>{
  const destinationSlot=target?.slot;
  if(cross&&r.deck)rows.push({id:'need'+(++serial),name:r.name,source:'To buy',deck:r.deck,placement:'Reserved',location:'Not acquired',purpose:r.purpose,slot:r.slot});
  if(cross){delete r.slot;if(target)releaseOld(target);if(destinationSlot)r.slot=destinationSlot;}
  r.deck=deck;r.source='Owned';r.placement='In deck';r.location=deck+' box';r.purpose='Main deck';
 });
 if(cross||needsReceipt)confirmChange('Review deck placement',`${r.name} → ${deck}.${needsReceipt?' This also confirms you now own this copy.':''}${r.deck&&cross?' '+r.deck+' will need another copy; its current '+r.placement+' allocation moves.':''}${target?' '+target.name+' leaves the destination slot'+(target.source==='Owned'?' and remains owned, with its physical move pending.':'.'):''}${locks[r.deck]||locks[deck]?' A locked allocation is affected; this is an explicit override.':''}`,apply);else apply();
}
