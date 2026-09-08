// A diffuse, long-pitch helix wraps the subline, then opens into fine tendrils.
// The canvas overlays existing header space and must never add layout height.
(()=>{
 const root=document.getElementById('matrix-v2'),block=root.querySelector('.v-brand-block');
 const canvas=block.querySelector('.v-aether'),control=block.querySelector('.v-aether-toggle');
 const front=block.querySelector('.v-aether-front');
 const sub=block.querySelector('.v-brand-subline');
 const ctx=canvas.getContext('2d'),frontCtx=front.getContext('2d');if(!ctx||!frontCtx)return;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let width=440,height=70,frame=0,last=0,time=0,visible=true,paused=false;
 let thread='',core='',start=62,join=387,end=560,base=56,rise=24,axis=47,radius=9,pitch=240,mistBrush;
 const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
 const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
 const tint=(color,alpha)=>'rgba('+color.match(/[\d.]+/g).slice(0,3).join(',')+','+alpha+')';
 function colors(){
  if(!root.isConnected)return;
  const probe=document.createElement('span');root.append(probe);
  probe.style.color='var(--v-aether-thread)';thread=getComputedStyle(probe).color;
  probe.style.color='var(--v-aether-core)';core=getComputedStyle(probe).color;probe.remove();
  // Gaussian-like translucent stamps create fuzzy mist with no stroked core.
  mistBrush=document.createElement('canvas');mistBrush.width=64;mistBrush.height=64;
  const brush=mistBrush.getContext('2d'),gradient=brush.createRadialGradient(32,32,0,32,32,32);
  gradient.addColorStop(0,tint(core,.75));gradient.addColorStop(.23,tint(thread,.44));gradient.addColorStop(.55,tint(thread,.12));gradient.addColorStop(1,tint(thread,0));
  brush.fillStyle=gradient;brush.fillRect(0,0,64,64);
 }
 function helix(x,t){
  const angle=Math.PI/2+(x-start)/pitch*Math.PI*2-t*.52;
  const release=1-smooth((x-join+28)/28);
  return {y:axis+(Math.sin(angle)*radius+Math.sin((x-start)*.013-t*.34)*.65)*release,depth:Math.cos(angle)};
 }
 // Fibers peel away across the last stretch of the coil. Their individual
 // release points preserve continuity instead of creating one visible seam.
 function branchAt(i){const span=Math.min(140,(join-start)*.48);return join-span+(span-14)*Math.pow(i/27,.86);}
 function branchBlend(x,i){const at=branchAt(i);return smooth((x-at)/Math.max(14,join-at));}
 function tailY(x,i,t,tip,onset=join){
  const p=clamp((x-onset)/Math.max(1,tip-onset)),phase=i*9.413;
  const bend=Math.sin(phase+t*(.34+(i%7)*.065))*.46+Math.sin(p*(2.7+(i%6)*.63)-t*.86+phase*1.37)*.42+Math.sin(p*9.2-t*1.7+phase*.63)*.12;
  // Symmetric free drift about the text center: no lower baseline or floor.
  return base+smooth(p*4.5)*(bend*rise+Math.sin(x*.028-t*2.1+i)*.23+((i*.618034)%1-.5)*.48);
 }
 function draw(t){
  if(!root.isConnected||!mistBrush)return;
  ctx.clearRect(0,0,width,height);frontCtx.clearRect(0,0,width,height);
  if(end<=start||join<=start)return;
  // Alternating depth layers make one loose coil pass behind and in front of
  // the text. The front veil stays translucent so the words remain readable.
  for(let x=start;x<Math.min(end,join);x+=1.7){
   const position=helix(x,t),y=position.y;
   let released=0;for(let i=0;i<28;i++)released+=branchBlend(x,i)/28;
   const fade=smooth((x-start)/9)*(1-released);
   const billow=.76+.24*Math.sin(x*.061-t*.8)**2;
   const w=10+Math.sin(x*.042-t*.75)*2.2,h=6.5+Math.sin(x*.051-t*.63)*1.2;
   const near=smooth((position.depth+.18)/.36);
   // Feather the depth handoff rather than switching layers at a sharp seam.
   ctx.globalAlpha=fade*billow*(1-near)*.18;ctx.drawImage(mistBrush,x-w/2,y-h/2,w,h);
   frontCtx.globalAlpha=fade*billow*near*.28;frontCtx.drawImage(mistBrush,x-w/2,y-h/2,w,h);
  }
  ctx.globalAlpha=1;frontCtx.globalAlpha=1;
  // Each fiber starts on the coil, then separates smoothly before the old join.
  for(let i=0;i<28;i++){
   const tip=join+(end-join)*(.55+((i*.618034)%1)*.45);
   const fork=branchAt(i),length=tip-fork,post=Math.min(tip-4,fork+32);
   const grad=ctx.createLinearGradient(fork,0,tip,0);
   grad.addColorStop(0,tint(thread,0));
   grad.addColorStop(clamp((post-fork)/length),tint(i%4===0?core:thread,.09+(i%5)*.021));
   grad.addColorStop(1,tint(thread,0));
   ctx.strokeStyle=grad;ctx.lineWidth=.38+(i%3)*.08;ctx.globalAlpha=1;
   ctx.beginPath();
   for(let x=fork;x<=tip;x+=1.8){const blend=branchBlend(x,i),y=helix(x,t).y*(1-blend)+tailY(x,i,t,tip,fork)*blend;if(x===fork)ctx.moveTo(x,y);else ctx.lineTo(x,y);}
   ctx.stroke();
  }
  // Only the expanded tail has individual dust flecks; the coil stays diffuse.
  for(let i=0;i<38;i++){
   const u=(i*.618034+t*(.055+(i%4)*.008))%1,x=join+u*(end-join);
   const p=clamp((x-join)/Math.max(1,end-join));
   const y=tailY(x,i,t,end);
   ctx.globalAlpha=smooth(u*8)*Math.pow(1-p,1.7)*(.17+(i%4)*.06);
   ctx.fillStyle=i%3===0?core:thread;ctx.beginPath();
   ctx.ellipse(x,y,.85,.28+(i%2)*.09,-.08,0,Math.PI*2);ctx.fill();
  }
  ctx.globalAlpha=1;
 }
 function running(){return !paused&&!reduced.matches&&visible&&!document.hidden;}
 function tick(now){frame=0;if(!running()){sync();return;}if(!last)last=now;if(now-last>=32){time+=Math.min(now-last,70)/1000;last=now;draw(time);}frame=requestAnimationFrame(tick);}
 function sync(){cancelAnimationFrame(frame);frame=0;last=0;canvas.dataset.motion=paused||reduced.matches?'still':running()?'running':'suspended';control.hidden=reduced.matches;control.setAttribute('aria-label',paused?'Resume aether animation':'Pause aether animation');control.title=paused?'Resume aether animation':'Pause aether animation';control.textContent=paused?'▷':'Ⅱ';draw(time);if(running())frame=requestAnimationFrame(tick);}
 function resize(){
  const b=block.getBoundingClientRect(),s=sub.getBoundingClientRect();
  // Standalone frame sizing can briefly measure an incomplete inline layout.
  // Keep the last valid drawing until there is space for both text and trail.
  if(s.width<=0||b.width-(s.left-b.left)<30)return;
  const range=document.createRange();range.selectNodeContents(sub);const lines=[...range.getClientRects()].filter(r=>r.width>0);const lastLine=lines.at(-1)||s;
  width=Math.max(1,b.width);height=Math.min(b.height+24,root.querySelector('.v-top').getBoundingClientRect().bottom-b.top-1);
  canvas.parentElement.style.height=height+'px';
  start=s.left-b.left;join=Math.min(width-18,lastLine.right-b.left+4);end=Math.min(width-4,join+230);
  // The coil rides the SEAM between the wordmark and the subline rather than the middle
  // of the subline. Centred on the subline it drew the main strand straight through the
  // words; on the seam it passes between 'CrankMagic' and the sentence under it, which is
  // where a wisp belongs. Anchored to the FIRST line so a wrapped subline does not drag it
  // down a row -- the tail still ends at the last line, which is what `join` measures.
  const firstLine=lines[0]||s;
  axis=firstLine.top-b.top;base=axis;radius=lastLine.height/2+1.3;pitch=Math.max(235,(join-start)/1.35);
  rise=lines.length>1?Math.min(13,lastLine.height-3):24;
  // Pause lives beside the wordmark, so it never covers the dissolving tail.
  const name=block.querySelector('.v-brand'),nameRange=document.createRange();nameRange.selectNodeContents(name);
  block.style.setProperty('--v-aether-control-x',Math.min(width-26,nameRange.getBoundingClientRect().right-b.left+8)+'px');
  const dpr=2;for(const layer of [canvas,front]){layer.width=Math.round(width*dpr);layer.height=Math.round(height*dpr);layer.getContext('2d').setTransform(dpr,0,0,dpr,0,0);}
  canvas.dataset.threadStart=String(start);canvas.dataset.textEnd=String(join);canvas.dataset.tailEnd=String(end);canvas.dataset.baseline=String(base);canvas.dataset.revision='mist-graduated';
  colors();sync();
 }
 control.addEventListener('click',()=>{paused=!paused;sync();});reduced.addEventListener('change',sync);document.addEventListener('visibilitychange',sync);
 const sizeObserver=new ResizeObserver(resize);sizeObserver.observe(block);sizeObserver.observe(sub);
 new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();}).observe(canvas);
 new MutationObserver(()=>{colors();draw(time);}).observe(root,{attributes:true,attributeFilter:['style','data-theme']});
 // The product is always dark; OS appearance changes do not recolor its mist.
 document.fonts.ready.then(resize);resize();
})();
