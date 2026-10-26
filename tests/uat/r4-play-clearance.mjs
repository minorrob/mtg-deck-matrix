/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
export async function tableClearance(page) {return page.evaluate(()=>{
 const root=document.getElementById('cm-board');if(!root)return [];const table=root.dataset.view==='table'&&!root.dataset.phone;
 const visible=el=>{const css=getComputedStyle(el);if(!el.getClientRects().length||css.visibility==='hidden'||el.closest('[hidden],[inert]'))return null;let r=el.getBoundingClientRect(),b={left:Math.max(0,r.left),right:Math.min(innerWidth,r.right),top:Math.max(0,r.top),bottom:Math.min(innerHeight,r.bottom)};for(let p=el.parentElement;p&&p!==root;p=p.parentElement){const s=getComputedStyle(p),q=p.getBoundingClientRect();if(/auto|scroll|hidden|clip/.test(s.overflowX)){b.left=Math.max(b.left,q.left);b.right=Math.min(b.right,q.right);}if(/auto|scroll|hidden|clip/.test(s.overflowY)){b.top=Math.max(b.top,q.top);b.bottom=Math.min(b.bottom,q.bottom);}}return b.right>b.left+1&&b.bottom>b.top+1?b:null;};
 const overlaps=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
 const facts=[...root.querySelectorAll('.cm-stage-caption,.cm-stage-actions .v-button,.cm-stage-side>header,.cm-stage-rail>header,.cm-mat-head .cm-seat-identity,.cm-mat-head .cm-seat-hand,.cm-mat-head .cm-vitals,.cm-mat-head .cm-seat-state,.cm-mat-head [data-action=board-focus],.cm-phone-seats .cm-seat-identity,.cm-phone-seats .cm-vitals,.cm-phone-seats .cm-seat-state,.cm-other-seats .cm-seat--stack,.cm-stage-seat-label,.cm-mat .cm-mat-label,.cm-mat .cm-board-group>h3,.cm-mat .cm-board-pile figcaption,.cm-mat .cm-bcard-count,.cm-mat .cm-bcard-pt')],problems=[];
 const hud=[...root.querySelectorAll('.cm-stage-top>.cm-stage-self,.cm-stage-top>.cm-board-turnsteps,.cm-stage-top>.cm-stage-priority,.cm-stage-top>.cm-full-pill,.cm-stage-top>.cm-profile-avatar,.cm-stage-top>.cm-table-menu,.cm-stage-top>.cm-stage-camera')];
 for(let i=0;i<hud.length;i++)for(let j=i+1;j<hud.length;j++){const a=visible(hud[i]),b=visible(hud[j]);if(a&&b&&overlaps(a,b))problems.push({hud:hud[i].className,other:hud[j].className,a,b});}
 for(const ribbon of root.querySelectorAll('.cm-stage-top .cm-board-ribbon')){const box=ribbon.getBoundingClientRect();for(const item of ribbon.children){const r=item.getBoundingClientRect();if(r.left<box.left-1||r.right>box.right+1)problems.push({hud:'phase strip overflows its group',text:item.textContent.trim(),left:r.left,right:r.right,group:{left:box.left,right:box.right}});}}
 for(const button of root.querySelectorAll('.cm-stage-actions .v-button,.cm-stage-camera>button,.cm-table-menu>button,.cm-stage-handle')){const a=visible(button);if(!a)continue;for(const fact of facts){if(fact===button)continue;const b=visible(fact);if(b&&overlaps(a,b))problems.push({control:button.textContent.trim(),fact:fact.textContent.trim(),a,b});}}
 if(!table)return problems;
 const dial=[...root.querySelectorAll('.cm-board-pie-life>b,.cm-board-pie-life>small,.cm-board-pie-priority')],labels=[...root.querySelectorAll('.cm-mat .cm-mat-label,.cm-mat .cm-board-group>h3,.cm-mat .cm-board-pile figcaption,.cm-mat .cm-bcard-count,.cm-mat .cm-bcard-pt')];
 for(const text of dial){const a=visible(text);if(!a)continue;for(const label of labels){const b=visible(label);if(b&&overlaps(a,b))problems.push({dial:text.textContent.trim(),fact:label.textContent.trim(),a,b});}}
 for(let i=0;i<dial.length;i++)for(let j=i+1;j<dial.length;j++){const a=visible(dial[i]),b=visible(dial[j]);if(a&&b&&overlaps(a,b))problems.push({dial:dial[i].textContent.trim(),other:dial[j].textContent.trim(),a,b});}
 return problems;
 });}

export async function phoneChromeContrast(page){return page.evaluate(()=>{
 const rgba=text=>{const n=(text.match(/[\d.]+/g)||[]).map(Number);return [n[0]||0,n[1]||0,n[2]||0,n.length>3?n[3]:1];};
 const blend=(f,b)=>f.slice(0,3).map((c,i)=>c*f[3]+b[i]*(1-f[3]));
 const light=c=>c.map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((n,x,i)=>n+x*[.2126,.7152,.0722][i],0);
 return [...document.querySelectorAll('.cm-phone-pill>b,.cm-phone-icon[data-action=board-history] circle,.cm-phone-icon[data-action=board-coach] path:first-child')].map(el=>{
  const chain=[];for(let p=el;p;p=p.parentElement)chain.unshift(p);let bg=[255,255,255],opacity=1;for(const p of chain){const s=getComputedStyle(p);bg=blend(rgba(s.backgroundColor),bg);opacity*=Number(s.opacity);}
  const s=getComputedStyle(el),icon=el instanceof SVGElement,fg=rgba(icon?s.stroke:s.color);fg[3]*=opacity*(icon?Number(s.strokeOpacity):1);const painted=blend(fg,bg),a=light(painted),b=light(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  return {element:icon?el.closest('button').dataset.action:el.textContent.trim(),ratio,minimum:icon?3:4.5,foreground:painted,background:bg};
 });
});}

export async function cardBadgeBounds(page){return page.evaluate(()=>[...document.querySelectorAll('.cm-mat .cm-bcard-pt,.cm-mat .cm-bcard-count,.cm-mat .cm-bcard-tax')].flatMap(el=>{
 const card=el.closest('.cm-bcard'),style=getComputedStyle(el);if(!card||!el.getClientRects().length||style.visibility==='hidden')return [];
 const clip=getComputedStyle(card);if(!/hidden|clip/.test(clip.overflowX))return [];
 const left=el.offsetLeft+(el.matches('.cm-bcard-count')?-el.offsetWidth/2:0)+parseFloat(style.paddingLeft),width=el.scrollWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
 return left<-.5||left+width>card.clientWidth+.5?[{seat:card.closest('.cm-mat').dataset.seat,card:card.dataset.card||card.getAttribute('aria-label'),text:el.textContent.trim(),textLeft:left,textRight:left+width,cardWidth:card.clientWidth}]:[];
}));}

export async function zoneCaptionBounds(page){return page.evaluate(()=>{
 const problems=[],texts=[];
 for(const el of document.querySelectorAll('.cm-mat .cm-mat-label,.cm-mat .cm-board-pile figcaption em,.cm-mat .cm-board-pile figcaption b')){
  if(!el.getClientRects().length||getComputedStyle(el).visibility==='hidden')continue;const frame=el.closest('.cm-mat-zone'),box=frame.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(el);
  for(const r of range.getClientRects()){if(r.width<1||r.height<1)continue;if(r.left<box.left-.5||r.right>box.right+.5)problems.push({text:el.textContent.trim(),zone:frame.dataset.zone,bounds:{left:r.left,right:r.right},frame:{left:box.left,right:box.right}});texts.push({el,frame,r});}
 }
 for(let i=0;i<texts.length;i++)for(let j=i+1;j<texts.length;j++){const a=texts[i],b=texts[j];if(a.frame===b.frame||a.el.closest('.cm-mat')!==b.el.closest('.cm-mat'))continue;if(Math.min(a.r.right,b.r.right)-Math.max(a.r.left,b.r.left)>1&&Math.min(a.r.bottom,b.r.bottom)-Math.max(a.r.top,b.r.top)>1)problems.push({overlap:[a.el.textContent.trim(),b.el.textContent.trim()]});}
 return problems;
});}

export async function firstCardHorizontalBounds(page){return page.locator('.cm-board-table .cm-board-field').evaluateAll(fields=>fields.flatMap(field=>{const card=field.querySelector('.cm-bcard');if(!card||card.classList.contains('is-tapped'))return [];const f=field.getBoundingClientRect(),r=card.getBoundingClientRect(),slot=card.parentElement,section=card.closest('[data-card-section]');return r.left<f.left-.5||r.right>f.right+.5?[{card:card.dataset.card,field:{left:f.left,right:f.right},cardRect:{left:r.left,right:r.right},width:card.offsetWidth,transform:getComputedStyle(card).transform,slot:{width:slot.offsetWidth,left:getComputedStyle(slot).left,rect:slot.getBoundingClientRect().toJSON()},cell:section?.style.cssText}]:[];}));}
