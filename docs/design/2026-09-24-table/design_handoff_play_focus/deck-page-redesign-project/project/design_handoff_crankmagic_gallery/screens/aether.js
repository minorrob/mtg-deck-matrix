// Aether mist for the CrankMagic wordmark — a compact port of crankmagic-brand.js.
// A loose helix coils along the wordmark, opens into fine tendrils and dust to the right.
export function startAether(canvas, {thread='#68bcff', core='#8dddff', width=200, height=64, axisY=34, start=0, join=120} = {}) {
  const ctx = canvas.getContext('2d'); if (!ctx) return () => {};
  const dpr = 2; canvas.width = width*dpr; canvas.height = height*dpr; ctx.setTransform(dpr,0,0,dpr,0,0);
  const end = width - 4, radius = 8, pitch = Math.max(120, (join-start)/1.35), rise = 18;
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)), smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
  const rgb=c=>{const n=parseInt(c.slice(1),16);return [(n>>16)&255,(n>>8)&255,n&255];};
  const tint=(c,a)=>`rgba(${rgb(c).join(',')},${a})`;
  const brush=document.createElement('canvas'); brush.width=brush.height=64;
  const b=brush.getContext('2d'), g=b.createRadialGradient(32,32,0,32,32,32);
  g.addColorStop(0,tint(core,.75)); g.addColorStop(.23,tint(thread,.44)); g.addColorStop(.55,tint(thread,.12)); g.addColorStop(1,tint(thread,0));
  b.fillStyle=g; b.fillRect(0,0,64,64);
  const helix=(x,t)=>{const a=Math.PI/2+(x-start)/pitch*Math.PI*2-t*.52, rel=1-smooth((x-join+28)/28);return {y:axisY+(Math.sin(a)*radius+Math.sin((x-start)*.013-t*.34)*.65)*rel, depth:Math.cos(a)};};
  const branchAt=i=>{const span=Math.min(90,(join-start)*.48);return join-span+(span-14)*Math.pow(i/27,.86);};
  const branchBlend=(x,i)=>{const at=branchAt(i);return smooth((x-at)/Math.max(14,join-at));};
  const tailY=(x,i,t,tip,onset=join)=>{const p=clamp((x-onset)/Math.max(1,tip-onset)),ph=i*9.413;const bend=Math.sin(ph+t*(.34+(i%7)*.065))*.46+Math.sin(p*(2.7+(i%6)*.63)-t*.86+ph*1.37)*.42+Math.sin(p*9.2-t*1.7+ph*.63)*.12;return axisY+smooth(p*4.5)*(bend*rise+Math.sin(x*.028-t*2.1+i)*.23+((i*.618034)%1-.5)*.48);};
  function draw(t){
    ctx.clearRect(0,0,width,height);
    for(let x=start;x<join;x+=1.7){const p=helix(x,t);let rel=0;for(let i=0;i<28;i++)rel+=branchBlend(x,i)/28;const fade=smooth((x-start)/9)*(1-rel),billow=.76+.24*Math.sin(x*.061-t*.8)**2,w=10+Math.sin(x*.042-t*.75)*2.2,h=6.5+Math.sin(x*.051-t*.63)*1.2;ctx.globalAlpha=fade*billow*.3;ctx.drawImage(brush,x-w/2,p.y-h/2,w,h);}
    ctx.globalAlpha=1;
    for(let i=0;i<28;i++){const tip=join+(end-join)*(.55+((i*.618034)%1)*.45),fork=branchAt(i),len=tip-fork,post=Math.min(tip-4,fork+32);const gr=ctx.createLinearGradient(fork,0,tip,0);gr.addColorStop(0,tint(thread,0));gr.addColorStop(clamp((post-fork)/len),tint(i%4===0?core:thread,.09+(i%5)*.021));gr.addColorStop(1,tint(thread,0));ctx.strokeStyle=gr;ctx.lineWidth=.38+(i%3)*.08;ctx.beginPath();for(let x=fork;x<=tip;x+=1.8){const bl=branchBlend(x,i),y=helix(x,t).y*(1-bl)+tailY(x,i,t,tip,fork)*bl;x===fork?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.stroke();}
    for(let i=0;i<38;i++){const u=(i*.618034+t*(.055+(i%4)*.008))%1,x=join+u*(end-join),p=clamp((x-join)/Math.max(1,end-join)),y=tailY(x,i,t,end);ctx.globalAlpha=smooth(u*8)*Math.pow(1-p,1.7)*(.17+(i%4)*.06);ctx.fillStyle=i%3===0?core:thread;ctx.beginPath();ctx.ellipse(x,y,.85,.28+(i%2)*.09,-.08,0,Math.PI*2);ctx.fill();}
    ctx.globalAlpha=1;
  }
  let frame=0,last=0,time=0;const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tick=now=>{if(!last)last=now;if(now-last>=32){time+=Math.min(now-last,70)/1000;last=now;draw(time);}frame=requestAnimationFrame(tick);};
  draw(0); if(!reduced) frame=requestAnimationFrame(tick);
  return ()=>cancelAnimationFrame(frame);
}
