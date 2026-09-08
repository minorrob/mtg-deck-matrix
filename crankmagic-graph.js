/* A bounded, navigable neighborhood of actual catalog relationships. Typed
 * structural edges and EDHREC co-play are kept distinct from simulated evidence.
 * Canvas has an equivalent keyboard-accessible neighbor list supplied by UI. */
(function(root){'use strict';root.CrankGraph={mount({canvas,cards,played=[],focus,onSelect,onNeighbors,type='mechanic'}){const ctx=canvas.getContext('2d'),byId=new Map(cards.map(c=>[c.id,c])),trail=[];let center=focus||cards[0]?.id,nodes=[],scale=1,pan={x:0,y:0},drag=null,width=600,height=550,frame=0,disposed=false;
const pointers=new Map();let pinch=null,lastTap={at:0,x:0,y:0},touched=false;
const clampScale=v=>Math.max(.35,Math.min(4,v));
/* The ring the neighbours sit on, in canvas units. Kept inside the shorter axis so a
   tall narrow phone gets a circle rather than an ellipse running off both sides. */
function ringX(){return Math.max(150,Math.min(240,width*.30));}
function ringY(){return Math.max(120,Math.min(200,height*.30));}
/* Zoom so the whole neighbourhood is on screen. Labels sit outside the nodes and names
   under them, so the margin is generous on purpose: fitting the circles exactly still
   clips the words, and the words are the point. */
function fit(){
  if(!nodes.length){scale=1;pan={x:0,y:0};return;}
  const rx=Math.max(...nodes.map(n=>Math.abs(n.x)+n.r))+70,ry=Math.max(...nodes.map(n=>Math.abs(n.y)+n.r))+42;
  scale=clampScale(Math.min(1,Math.min(width/2/rx,height/2/ry)));
  pan={x:0,y:0};
}
/* The midpoint of the two active pointers and the distance between them. */
function span(){const [a,b]=[...pointers.values()];return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,d:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y))};}
function links(c){if(!c)return[];if(type==='played')return played.filter(e=>e.from===c.id||e.to===c.id).map(e=>({card:byId.get(e.from===c.id?e.to:e.from),kind:'EDHREC co-play',tag:`${(e.inclusion*100).toFixed(1)}% of decks`,reason:`EDHREC co-play · ${e.decks} decks · ${(e.inclusion*100).toFixed(1)}% inclusion`})).filter(e=>e.card).slice(0,12);const generic=new Set(['creatures','lands','artifacts','enchantments','instants','sorceries','planeswalkers']),terms=new Set([...(c.mechanics||[]),...(c.roles||[]).filter(x=>!generic.has(x))]);return cards.filter(x=>x.id!==c.id).map(x=>{const shared=[...(x.mechanics||[]),...(x.roles||[]).filter(t=>!generic.has(t))].filter(t=>terms.has(t)),feeds=(c.produces||[]).filter(t=>(x.requires||[]).includes(t)),fed=(c.requires||[]).filter(t=>(x.produces||[]).includes(t));const kind=feeds.length?'Produces → needs':fed.length?'Needs ← produces':'Shared mechanics / roles';
   const tag=feeds.length?'→ '+feeds[0]:fed.length?'← '+fed[0]:shared.slice(0,2).join(', ');
   return {card:x,shared,kind,tag,score:shared.length*2+(feeds.length+fed.length)*3,reason:feeds.length?'Produces → needs · '+feeds.join(', '):fed.length?'Needs ← produces · '+fed.join(', '):'Shared mechanics / roles · '+shared.slice(0,3).join(', ')};}).filter(x=>x.score).sort((a,b)=>b.score-a.score||a.card.name.localeCompare(b.card.name)).slice(0,12);}
function layout(){const c=byId.get(center),neighbors=links(c);nodes=c?[{card:c,x:0,y:0,r:39},...neighbors.map((n,i)=>({card:n.card,reason:n.reason,kind:n.kind,tag:n.tag,x:Math.cos(i/neighbors.length*Math.PI*2)*ringX(),y:Math.sin(i/neighbors.length*Math.PI*2)*ringY(),r:22}))]:[];onNeighbors?.(c,neighbors,trail.length);draw();}
function resize(){const r=canvas.getBoundingClientRect();const first=!width||!height;width=r.width;height=r.height;const d=Math.min(devicePixelRatio||1,2);canvas.width=width*d;canvas.height=height*d;ctx.setTransform(d,0,0,d,0,0);
 /* The ring is a function of the canvas, so a rotation or a pane opening has to move the
    nodes, not just repaint them at the old radius. */
 layout();if(first||!touched)fit();draw();}
function draw(){if(disposed)return;cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{ctx.clearRect(0,0,width,height);ctx.save();ctx.translate(width/2+pan.x,height/2+pan.y);ctx.scale(scale,scale);for(const n of nodes.slice(1)){ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(n.x,n.y);ctx.strokeStyle=type==='played'?'#c6a86d88':'#5384b677';ctx.lineWidth=1;ctx.stroke();}
  /* The edge labels, drawn after every line so no line crosses a label. Skipped when
     zoomed out past legibility -- an unreadable smear of text is worse than none, and
     the reader can pinch in to get them back. */
  if(scale>=.95)for(const n of nodes.slice(1)){
   const tag=String(n.tag||'').trim();if(!tag)continue;
   const text=tag.length>20?tag.slice(0,19)+'…':tag;
   const mx=n.x*.62,my=n.y*.62;
   ctx.font='10px Satoshi, sans-serif';ctx.textAlign='center';
   const w=ctx.measureText(text).width+10;
   ctx.fillStyle='#0f1826d9';ctx.beginPath();ctx.roundRect(mx-w/2,my-8,w,16,8);ctx.fill();
   ctx.strokeStyle=type==='played'?'#c6a86d55':'#5384b655';ctx.lineWidth=1;ctx.stroke();
   ctx.fillStyle=type==='played'?'#e6cf9d':'#a8cdf0';ctx.fillText(text,mx,my+3.5);}for(const [i,n] of nodes.entries()){const glow=ctx.createRadialGradient(n.x,n.y,0,n.x,n.y,n.r+12);glow.addColorStop(0,i?'#385b83':'#638abd');glow.addColorStop(1,'#263c5700');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(n.x,n.y,n.r+12,0,Math.PI*2);ctx.fill();ctx.fillStyle=i?'#203a58':'#386794';ctx.strokeStyle=i?'#71b6e3':'#c0e8ff';ctx.beginPath();ctx.arc(n.x,n.y,n.r,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#edf7ff';ctx.font=(i?'11':'bold 13')+'px Satoshi, sans-serif';ctx.textAlign='center';const name=n.card.name;ctx.fillText(name.length>28?name.slice(0,26)+'…':name,n.x,n.y+n.r+17);ctx.fillStyle='#bddbff';ctx.font='12px Satoshi, sans-serif';ctx.fillText((n.card.ci||'C').split('').join(' '),n.x,n.y+4);}ctx.restore();});}
function pick(e){const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left-width/2-pan.x)/scale,y=(e.clientY-r.top-height/2-pan.y)/scale;return nodes.find(n=>Math.hypot(n.x-x,n.y-y)<n.r+8);}
function select(id,history=true){if(!byId.has(id))return;if(history&&id!==center)trail.push(center);center=id;layout();fit();draw();onSelect?.(byId.get(id));}
function wheel(e){e.preventDefault();const r=canvas.getBoundingClientRect(),x=e.clientX-r.left-width/2,y=e.clientY-r.top-height/2,old=scale;touched=true;scale=clampScale(scale*Math.exp(-e.deltaY*.001));pan.x=x-(x-pan.x)*scale/old;pan.y=y-(y-pan.y)*scale/old;draw();}
function down(e){pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 /* Capture is an optimisation, not a requirement, and it THROWS -- on a pointer the
    browser no longer considers active, and on synthetic events. Letting that escape
    skipped everything below it, which is how the second finger of a pinch ended up
    registering no pinch at all. */
 try{canvas.setPointerCapture(e.pointerId);}catch(err){/* keep going without it */}
 if(pointers.size===2){/* second finger down: freeze the current view and remember the span between them */
  pinch=span();pinch.scale=scale;pinch.pan={x:pan.x,y:pan.y};drag=null;return;}
 if(pointers.size===1)drag={x:e.clientX,y:e.clientY,px:pan.x,py:pan.y,moved:false};}
function move(e){
 if(pointers.has(e.pointerId))pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(pinch&&pointers.size===2){
  const now=span(),r=canvas.getBoundingClientRect();
  /* Zoom about the point BETWEEN the fingers, so the card you pinched over stays under
     them. Anchoring at the canvas centre instead is the thing that makes a pinch feel
     like it is fighting you. */
  const cx=now.x-r.left-width/2,cy=now.y-r.top-height/2;
  touched=true;scale=clampScale(pinch.scale*(now.d/pinch.d));
  const k=scale/pinch.scale;
  pan.x=cx-(cx-pinch.pan.x)*k+(now.x-pinch.x);
  pan.y=cy-(cy-pinch.pan.y)*k+(now.y-pinch.y);
  draw();return;}
 if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.moved=drag.moved||Math.hypot(dx,dy)>5;pan={x:drag.px+dx,y:drag.py+dy};draw();}
function up(e){
 pointers.delete(e.pointerId);
 if(pointers.size<2)pinch=null;
 if(drag&&!drag.moved){
  /* A phone has no keyboard, so the '0' reset needs a gesture. Two taps in the same
     spot inside 300ms resets the view; a single tap still selects. */
  const now=Date.now();
  if(now-lastTap.at<300&&Math.hypot(e.clientX-lastTap.x,e.clientY-lastTap.y)<24){lastTap={at:0,x:0,y:0};fit();draw();drag=null;return;}
  lastTap={at:now,x:e.clientX,y:e.clientY};
  const n=pick(e);if(n)select(n.card.id);}
 drag=null;}
function key(e){if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','0'].includes(e.key)){e.preventDefault();if(e.key==='0'){fit();}else if(e.key==='+')scale=clampScale(scale*1.2);else if(e.key==='-')scale=clampScale(scale/1.2);else {pan.x+=e.key==='ArrowLeft'?25:e.key==='ArrowRight'?-25:0;pan.y+=e.key==='ArrowUp'?25:e.key==='ArrowDown'?-25:0;}draw();}}
canvas.addEventListener('wheel',wheel,{passive:false});canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);canvas.addEventListener('keydown',key);const observer=new ResizeObserver(resize);observer.observe(canvas);layout();resize();return {select,back(){if(trail.length)select(trail.pop(),false);},setType(value){type=value;layout();},reset(){fit();draw();},destroy(){disposed=true;cancelAnimationFrame(frame);observer.disconnect();for(const [name,fn] of [['wheel',wheel],['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',up],['keydown',key]])canvas.removeEventListener(name,fn);}};}};})(globalThis);
