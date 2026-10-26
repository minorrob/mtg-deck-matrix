/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
export async function tableClearance(page) {return page.evaluate(()=>{
 const root=document.getElementById('cm-board');if(!root)return [];const table=root.dataset.view==='table'&&!root.dataset.phone;
 const visible=el=>{const css=getComputedStyle(el);if(!el.getClientRects().length||css.visibility==='hidden'||el.closest('[hidden],[inert]'))return null;let r=el.getBoundingClientRect(),b={left:Math.max(0,r.left),right:Math.min(innerWidth,r.right),top:Math.max(0,r.top),bottom:Math.min(innerHeight,r.bottom)};for(let p=el.parentElement;p&&p!==root;p=p.parentElement){const s=getComputedStyle(p),q=p.getBoundingClientRect();if(/auto|scroll|hidden|clip/.test(s.overflowX)){b.left=Math.max(b.left,q.left);b.right=Math.min(b.right,q.right);}if(/auto|scroll|hidden|clip/.test(s.overflowY)){b.top=Math.max(b.top,q.top);b.bottom=Math.min(b.bottom,q.bottom);}}return b.right>b.left+1&&b.bottom>b.top+1?b:null;};
 const overlaps=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
 const facts=[...root.querySelectorAll('.cm-mat-head .cm-seat-identity,.cm-mat-head .cm-seat-hand,.cm-mat-head .cm-vitals,.cm-mat-head .cm-seat-state,.cm-mat-head [data-action=board-focus],.cm-phone-seats .cm-seat-identity,.cm-phone-seats .cm-vitals,.cm-phone-seats .cm-seat-state,.cm-other-seats .cm-seat--stack,.cm-stage-seat-label')],problems=[];
 for(const button of root.querySelectorAll('.cm-stage-camera>button,.cm-table-menu>button')){const a=visible(button);if(!a)continue;for(const fact of facts){const b=visible(fact);if(b&&overlaps(a,b))problems.push({control:button.textContent.trim(),fact:fact.textContent.trim(),a,b});}}
 if(!table)return problems;
 const dial=[...root.querySelectorAll('.cm-board-pie-life>b,.cm-board-pie-life>small,.cm-board-pie-priority')],labels=[...root.querySelectorAll('.cm-mat .cm-mat-label,.cm-mat .cm-board-group>h3,.cm-mat .cm-board-pile figcaption,.cm-mat .cm-bcard-count,.cm-mat .cm-bcard-pt')];
 for(const text of dial){const a=visible(text);if(!a)continue;for(const label of labels){const b=visible(label);if(b&&overlaps(a,b))problems.push({dial:text.textContent.trim(),fact:label.textContent.trim(),a,b});}}
 for(let i=0;i<dial.length;i++)for(let j=i+1;j<dial.length;j++){const a=visible(dial[i]),b=visible(dial[j]);if(a&&b&&overlaps(a,b))problems.push({dial:dial[i].textContent.trim(),other:dial[j].textContent.trim(),a,b});}
 return problems;
 });}
