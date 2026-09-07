// Keep sticky navigation inside its track and out of the footer. In very short
// windows, let the link list scroll instead of pushing its first items offscreen.
(()=>{
 const root=document.getElementById('matrix-v2'),track=root.querySelector('.v-nav-track'),links=root.querySelector('.v-nav-links');
 const desktop=matchMedia('(min-width:761px)');let pending=0;
 function fit(){pending=0;if(!desktop.matches){links.style.removeProperty('max-height');return;}
  const available=Math.max(44,Math.min(innerHeight-32,track.getBoundingClientRect().bottom-16));
  const value=Math.floor(available)+'px';if(links.style.maxHeight!==value)links.style.maxHeight=value;
 }
 function schedule(){if(!pending)pending=requestAnimationFrame(fit);}
 addEventListener('scroll',schedule,{passive:true});addEventListener('resize',schedule);desktop.addEventListener('change',schedule);
 new ResizeObserver(schedule).observe(track);fit();
})();
