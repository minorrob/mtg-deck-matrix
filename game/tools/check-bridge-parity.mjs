import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// Artwork and coaching may be added; every field supplied by Forge must survive unchanged.
export function assertEngineFieldsPreserved(engine,browser,path='view'){
  if(Array.isArray(engine)){
    assert.ok(Array.isArray(browser),`${path}: array lost`);
    assert.equal(browser.length,engine.length,`${path}: item count changed`);
    engine.forEach((value,index)=>assertEngineFieldsPreserved(value,browser[index],`${path}[${index}]`));return;
  }
  if(engine&&typeof engine==='object'){
    assert.ok(browser&&typeof browser==='object',`${path}: object lost`);
    for(const [key,value]of Object.entries(engine)){
      assert.ok(Object.hasOwn(browser,key),`${path}.${key}: field lost`);
      assertEngineFieldsPreserved(value,browser[key],`${path}.${key}`);
    }return;
  }
  assert.deepEqual(browser,engine,`${path}: engine value altered`);
}

export async function checkBridgeParity(directory,port=8768){
  const connection=JSON.parse(readFileSync(resolve(directory,'browser-bridge.json'),'utf8'));
  assert.ok(Number.isInteger(connection.port)&&connection.port>0&&connection.port<65536,'Invalid loopback bridge');
  const read=async(url,headers={})=>{const r=await fetch(url,{headers,signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error(`View read failed (${r.status})`);return r.json();};
  const engine=()=>read(`http://127.0.0.1:${connection.port}/view`,{'X-CrankMagic-Bridge':connection.token});
  for(let attempt=0;attempt<5;attempt++){
    const before=await engine(),browser=await read(`http://127.0.0.1:${port}/api/game-view`),after=await engine();
    if(before.revision!==browser.revision||after.revision!==browser.revision)continue;
    assertEngineFieldsPreserved(before,browser);
    return {passed:true,revision:before.revision,turn:before.state.turn,phase:before.state.phase,players:before.state.players.length,choiceMode:before.ui.choice?.mode||null};
  }
  throw Error('Engine changed during comparison; repeat at the next stable decision. No parity result recorded.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  if(!process.argv[2])throw Error('Provide the local match directory');
  console.log(JSON.stringify(await checkBridgeParity(process.argv[2],Number(process.argv[3]||8768))));
}
