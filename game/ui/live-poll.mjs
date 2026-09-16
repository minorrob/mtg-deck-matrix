/** Retry interrupted reads without letting an old match overwrite a new one. */
export function createLivePoller({read,apply,onError,interval=()=>750,retryDelay=n=>Math.min(5000,500*2**Math.min(n-1,3))}){
  let generation=0,running=false,timer=null,controller=null,failures=0;
  const current=id=>running&&id===generation;
  async function refresh(id=generation){
    if(!current(id))return;
    const value=await read(controller.signal);
    if(current(id))apply(value);
  }
  async function tick(id){
    if(!current(id))return;
    let delay;
    try{await refresh(id);if(!current(id))return;failures=0;delay=interval();}
    catch(error){
      if(!current(id))return;
      const fatal=[401,403,404,410].includes(error.status);
      onError(error,{fatal,failures:++failures});
      if(fatal){stop();return;}delay=retryDelay(failures);
    }
    if(current(id))timer=setTimeout(()=>tick(id),delay);
  }
  function stop(){running=false;generation++;clearTimeout(timer);timer=null;controller?.abort();}
  return {
    async start(){if(running)return;running=true;failures=0;controller=new AbortController();await tick(++generation);},
    stop,refresh,isRunning:()=>running
  };
}
