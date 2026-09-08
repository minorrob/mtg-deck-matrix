// The mock embeds a projection of data/commander-glossary.json. Definitions are
// never authored here. Only explicit explanatory text is annotated: product
// navigation such as Discover and app actions such as Assemble are not rules.
const glossaryById=new Map(glossaryData.map(e=>[e.id,e]));
const glossaryAliases=new Map();
for(const entry of glossaryData)for(const alias of [entry.term,...entry.aliases]){
 const key=alias.toLocaleLowerCase();if(!glossaryAliases.has(key))glossaryAliases.set(key,entry.id);
}
const glossaryPattern=new RegExp('(?<![\\p{L}\\p{N}])('+[...glossaryAliases.keys()].sort((a,b)=>b.length-a.length).map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')(?![\\p{L}\\p{N}])','giu');
function glossaryTerm(id,label){return glossaryById.has(id)?`<button class="v-term" type="button" data-term="${esc(id)}" aria-label="${esc(label)}: definition">${esc(label)}</button>`:esc(label);}
function glossaryText(value){const text=String(value);let html='',at=0;for(const match of text.matchAll(glossaryPattern)){html+=esc(text.slice(at,match.index))+glossaryTerm(glossaryAliases.get(match[0].toLocaleLowerCase()),match[0]);at=match.index+match[0].length;}return html+esc(text.slice(at));}
function commanderMana(cost){const labels={W:'white',U:'blue',B:'black',R:'red',G:'green'};const tokens=cost.match(/\{([^}]+)\}/g)||[];return `<span class="v-mana-cost" role="img" aria-label="Mana cost: ${esc(tokens.map(t=>labels[t.slice(1,-1)]||t.slice(1,-1)+' generic').join(', '))}">${tokens.map(t=>{const symbol=t.slice(1,-1);return manaSymbols[symbol]?`<img src="${manaSymbols[symbol]}" alt="" width="18" height="18">`:esc(t);}).join('')}</span>`;}
const definitionTip=document.createElement('div');definitionTip.id='v-definition-tip';definitionTip.className='v-glossary-tip';definitionTip.setAttribute('role','tooltip');definitionTip.setAttribute('popover','manual');definitionTip.hidden=true;root.append(definitionTip);
let definitionAnchor=null,definitionMode='',lastDefinitionPointer='mouse';
function hideDefinition(){if(definitionAnchor)definitionAnchor.removeAttribute('aria-describedby');definitionAnchor=null;definitionMode='';if(definitionTip.hidePopover&&definitionTip.matches(':popover-open'))definitionTip.hidePopover();definitionTip.hidden=true;}
function showDefinition(anchor,mode){
 const entry=glossaryById.get(anchor.dataset.term);if(!entry)return;
 if(definitionAnchor&&definitionAnchor!==anchor)definitionAnchor.removeAttribute('aria-describedby');
 definitionAnchor=anchor;definitionMode=mode;
 definitionTip.replaceChildren();const title=document.createElement('strong'),kind=document.createElement('span'),copy=document.createElement('p');
 title.textContent=entry.term;kind.className='v-tip-kind';kind.textContent=entry.category.replaceAll('-',' ');copy.textContent=entry.definition;definitionTip.append(title,kind,copy);
 definitionTip.hidden=false;definitionTip.style.maxHeight='none';if(definitionTip.showPopover&&!definitionTip.matches(':popover-open'))definitionTip.showPopover();
 const a=anchor.getBoundingClientRect(),pad=12,gap=8;definitionTip.style.width=Math.min(340,innerWidth-pad*2)+'px';
 const natural=definitionTip.getBoundingClientRect().height,below=innerHeight-a.bottom-pad-gap,above=a.top-pad-gap;
 const bottom=below>=natural||below>=above,space=Math.max(48,bottom?below:above);definitionTip.style.maxHeight=space+'px';
 const b=definitionTip.getBoundingClientRect();definitionTip.style.left=Math.max(pad,Math.min(a.left,innerWidth-b.width-pad))+'px';definitionTip.style.top=Math.max(pad,Math.min(bottom?a.bottom+gap:a.top-b.height-gap,innerHeight-b.height-pad))+'px';definitionTip.dataset.placement=bottom?'below':'above';anchor.setAttribute('aria-describedby',definitionTip.id);
}
root.addEventListener('pointerover',e=>{if(e.pointerType==='touch')return;const a=e.target.closest('[data-term]');if(a&&!a.contains(e.relatedTarget))showDefinition(a,'hover');});
root.addEventListener('pointerout',e=>{const a=e.target.closest('[data-term]');if(a&&a===definitionAnchor&&!a.contains(e.relatedTarget)&&definitionMode==='hover')hideDefinition();});
root.addEventListener('pointerdown',e=>{lastDefinitionPointer=e.pointerType;});
root.addEventListener('focusin',e=>{const a=e.target.closest('[data-term]');if(a)showDefinition(a,'focus');});
root.addEventListener('focusout',e=>{if(e.target.closest('[data-term]')===definitionAnchor)hideDefinition();});
root.addEventListener('click',e=>{const a=e.target.closest('[data-term]');if(!a)return;if(lastDefinitionPointer==='touch'||e.detail===0){if(definitionAnchor===a&&definitionMode==='pinned')hideDefinition();else showDefinition(a,'pinned');}else showDefinition(a,'hover');});
document.addEventListener('pointerdown',e=>{if(!e.target.closest('[data-term]'))hideDefinition();},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&definitionAnchor){hideDefinition();e.preventDefault();}});
addEventListener('scroll',()=>hideDefinition(),{capture:true,passive:true});addEventListener('resize',()=>hideDefinition());
