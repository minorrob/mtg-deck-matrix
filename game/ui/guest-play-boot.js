// Guest /play early boot — runs as classic script before ES module evaluation
// Must be external file (CSP blocks inline scripts)
(function(){
  if(location.pathname!=='/play'&&location.pathname!=='/play/')return;
  
  function boot(){
    try{
      var preview=document.getElementById('preview');
      var phase=document.getElementById('phase');
      if(preview)preview.textContent='CONNECTING TO TABLE…';
      if(phase)phase.textContent='Connecting to your live table…';
      
      var scrubber=document.querySelector('.scrubber');
      if(scrubber)scrubber.hidden=true;
      
      var brand=document.querySelector('.brand');
      if(brand)brand.remove();
      
      var workshop=document.querySelector('.workshop-link');
      if(workshop)workshop.remove();
    }catch(e){
      console.error('Guest early boot error:',e);
    }
  }
  
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',boot);
  }else{
    boot();
  }
})();
