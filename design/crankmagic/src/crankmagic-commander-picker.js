// Four verified card identities, with dated EDHREC popularity ranks. This is a
// local design sample, not a live search or a measure of strength. Core labels
// summarize the cards; secondary mechanic tags remain searchable.
const commanders=[
 {name:"Atraxa, Praetors' Voice",colors:'WUBG',mechanic:'Proliferate',tags:['Proliferate','Counters'],rank:4},
 {name:'Krenko, Mob Boss',colors:'R',mechanic:'Goblin tokens',tags:['Goblins','Tokens'],rank:5},
 {name:'Chulane, Teller of Tales',colors:'WUG',mechanic:'Creature value',tags:['Creature value','Landfall','Blink'],rank:251},
 {name:'Shadrix Silverquill',colors:'WB',mechanic:'Counters & tokens',tags:['Counters','Tokens'],rank:785}
];
function commanderChoice(c){return `<span class="v-choice-name">${esc(c.name)}</span>${commanderMana([...c.colors].map(s=>'{'+s+'}').join('')).replace('Mana cost:','Color identity:')}<span class="v-choice-mechanic">${esc(c.mechanic)}</span>`;}
function filterCommanders(open=false){
 const term=q('#v-commander-name').value.trim().toLowerCase().replaceAll('’',"'"),mechanic=q('#v-commander-mechanic').value,rank=q('#v-commander-rank').value;
 const named=commanders.filter(c=>c.name.toLowerCase().includes(term));
 const matches=named.filter(c=>(mechanic==='all'||c.tags.includes(mechanic))&&(rank==='all'||(rank==='unknown'?c.rank==null:rank==='top'?c.rank!=null&&c.rank<=100:rank==='middle'?c.rank>100&&c.rank<=500:c.rank>500))).sort((a,b)=>(a.rank??Infinity)-(b.rank??Infinity)||a.name.localeCompare(b.name));
 q('#v-commander-match-count').textContent=matches.length+' match'+(matches.length===1?'':'es');
 q('#v-commander-options').innerHTML=matches.length?matches.map(c=>`<button type="button" class="v-commander-choice" data-commander-result="${commanders.indexOf(c)}">${commanderChoice(c)}</button>`).join(''):'<p class="v-small">'+(named.length?'No matches with these filters. Clear search & filters to browse again.':'No name match in the sample catalog. Try a different name or provide a card link.')+'</p>';
 q('#v-link-entry').hidden=!(term&&!named.length);
 if(open)q('#v-commander-picker').open=true;
 qa('[data-commander-result]').forEach(b=>b.onclick=()=>{
  chosenCommander={...commanders[Number(b.dataset.commanderResult)],verified:true};
  q('#v-commander-result').innerHTML='<div class="v-selected-commander"><span>Selected</span><div class="v-commander-choice">'+commanderChoice(chosenCommander)+'</div><span>EDHREC #'+chosenCommander.rank+' · popularity snapshot</span></div>';
  q('#v-commander-name').value='';filterCommanders();q('#v-commander-picker').open=false;q('#v-commander-picker summary').focus();entrySummary();
 });
}
q('#v-find-commander').onclick=()=>filterCommanders(true);
q('#v-commander-name').oninput=()=>{chosenCommander=null;q('#v-commander-result').textContent='';filterCommanders(true);entrySummary();};
q('#v-commander-name').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();filterCommanders(true);q('[data-commander-result]')?.focus();}};
for(const id of ['#v-commander-mechanic','#v-commander-rank'])q(id).onchange=()=>filterCommanders(true);
q('#v-clear-commanders').onclick=()=>{q('#v-commander-name').value='';q('#v-commander-mechanic').value='all';q('#v-commander-rank').value='all';filterCommanders(true);};
q('#v-commander-picker').onkeydown=e=>{
 const items=qa('[data-commander-result]'),at=items.indexOf(document.activeElement);
 if(e.key==='Escape'){q('#v-commander-picker').open=false;q('#v-commander-picker summary').focus();}
 else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)&&items.length){e.preventDefault();q('#v-commander-picker').open=true;items[e.key==='Home'?0:e.key==='End'?items.length-1:e.key==='ArrowDown'?(at+1)%items.length:(at-1+items.length)%items.length].focus();}
};
root.addEventListener('click',e=>{if(!e.target.closest('#v-commander-picker,#v-find-commander,#v-clear-commanders,#v-commander-name,#v-commander-mechanic,#v-commander-rank'))q('#v-commander-picker').open=false;});
q('#v-use-link').onclick=()=>{q('#v-link-entry').hidden=false;q('#v-commander-link').focus();};
q('#v-save-link').onclick=()=>{let url;try{url=new URL(q('#v-commander-link').value);if(!['https:','http:'].includes(url.protocol))throw Error();}catch{q('#v-commander-result').textContent='Use a complete http or https card link.';return;}const name=q('#v-commander-name').value.trim();if(!name){q('#v-commander-result').textContent='Enter a name to keep with this link.';return;}chosenCommander={name,url:url.href,verified:false};if(!supplemental.some(c=>c.url===url.href))supplemental.push({...chosenCommander});q('#v-commander-result').textContent='Saved to the temporary supplemental catalog · unverified. '+supplemental.length+' record'+(supplemental.length===1?'':'s')+'.';entrySummary();};
q('#v-autobuild').onclick=()=>{if(!chosenCommander?.verified)return;dialog('Auto-build 99 — intent preview',`<p><strong>${esc(chosenCommander.name)}</strong> stays as your commander. The build will choose the other 99 within your intent and collection preferences.</p><p>${esc(q('#v-intent').textContent)}</p><p>${esc(q('#v-entry-summary').textContent)}</p><p class="v-small">Design preview only. No cards have been generated, reserved or purchased, and no simulation has run.</p>`);};
filterCommanders();
