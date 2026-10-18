/* Isolated renderer adapter: projected CrankRoomView@1 -> meshes. All edits are local. */
(async()=>{
  'use strict';
  const $=s=>document.querySelector(s), B=globalThis.BABYLON, canvas=$('#table');
  if(!B){$('#status').textContent='Engine unavailable. Run the prototype setup, then reload.';return;}
  const mobile=matchMedia('(max-width:700px), (pointer:coarse)');
  const reduced=matchMedia('(prefers-reduced-motion:reduce)');
  const engine=new B.Engine(canvas,true,{preserveDrawingBuffer:true,stencil:true,alpha:true},true);
  engine.setHardwareScalingLevel(Math.max(1,devicePixelRatio/1.5));
  const scene=new B.Scene(engine);scene.clearColor=new B.Color4(0,0,0,0);
  const camera=new B.ArcRotateCamera('camera',-Math.PI/2,Math.PI*40/180,33,new B.Vector3(0,0,-2.2),scene);
  camera.minZ=.1;camera.maxZ=100;camera.fov=.72;
  const ambient=new B.HemisphericLight('sky',new B.Vector3(0,1,0),scene);ambient.intensity=.95;ambient.groundColor=new B.Color3(.17,.2,.22);
  const sun=new B.DirectionalLight('key',new B.Vector3(.3,-1,.5),scene);sun.position=new B.Vector3(-8,16,-12);sun.intensity=2;
  const shadows=new B.ShadowGenerator(1024,sun);shadows.useBlurExponentialShadowMap=true;shadows.blurKernel=24;shadows.darkness=.32;
  const materials=new Map(), cards=[], labels=[], persistent=[];
  let view,frame=13,total=0,seat=0,selected=null,pointer=null,inspectionCard=null,serial=0;
  const say=t=>$('#status').textContent=t;
  const color=h=>B.Color3.FromHexString(h);
  function material(id,hex,rough=.8){const m=new B.StandardMaterial(id,scene);m.diffuseColor=color(hex);m.specularColor=new B.Color3(1-rough,1-rough,1-rough);return m;}
  const edge=material('card edges','#dfd7bf',.8),back=material('card sleeve','#142d33',.6),rim=material('brass trim','#b59861',.45);
  function texture(name,paint){const t=new B.DynamicTexture(name,{width:512,height:716},scene,false);paint(t.getContext());t.update();return t;}
  const backTexture=texture('sleeve',ctx=>{ctx.fillStyle='#102d36';ctx.fillRect(0,0,512,716);ctx.strokeStyle='#b19b67';ctx.lineWidth=6;ctx.strokeRect(22,22,468,672);ctx.translate(256,358);for(let i=0;i<9;i++){ctx.rotate(Math.PI/9);ctx.strokeRect(-95,-95,190,190);}ctx.fillStyle='#d4c290';ctx.font='bold 27px Georgia';ctx.textAlign='center';ctx.setTransform(1,0,0,1,0,0);ctx.fillText('CRANKMAGIC',256,620);});back.diffuseTexture=backTexture;
  /* The table is a design from the catalog (tables.js), remembered per device; the mats sit on its top. */
  const TABLE_KEY='cm-lab-table-design';let tableDesign=(()=>{try{return CrankTables.resolve(localStorage.getItem(TABLE_KEY)).id;}catch{return 'tavern-plank';}})(),tableObject=null;
  function buildTableObject(){const focused=mobile.matches,width=focused?10.5:25,depth=focused?34.5:23;tableObject?.dispose();tableObject=CrankTables.build(B,scene,tableDesign,{width,depth,reduced:focused,shadows});
    const tag=new B.TransformNode('table tag',scene);tag.parent=tableObject.root;tag.position.set(-width/2+1.2,-.2,depth/2-.6);tableObject.parts.push(tag);label(tag,'TB0'+(CrankTables.designs.findIndex(d=>d.id===tableDesign)+1));}
  function setTableDesign(id){tableDesign=CrankTables.resolve(id).id;try{localStorage.setItem(TABLE_KEY,tableDesign);}catch{}$('#table-design').value=tableDesign;build();}
  const highlight=new B.HighlightLayer('selected outline',scene);highlight.innerGlow=false;highlight.blurHorizontalSize=.3;highlight.blurVerticalSize=.3;
  function assetURL(c){return '/art/'+encodeURIComponent(c.name);}
  function faceMaterial(c){
    if(c.hidden||c.faceDown)return back;
    if(materials.has(c.name))return materials.get(c.name);
    const m=material('face '+c.name,'#ffffff',.94);
    const t=texture(c.name,ctx=>{ctx.fillStyle='#192f38';ctx.fillRect(0,0,512,716);ctx.strokeStyle='#c5b47d';ctx.lineWidth=8;ctx.strokeRect(12,12,488,692);ctx.fillStyle='#d7e9df';ctx.font='bold 29px Georgia';let y=65,line='';for(const word of c.name.split(' ')){if(ctx.measureText(line+' '+word).width>440){ctx.fillText(line,30,y);y+=36;line=word;}else line+=(line?' ':'')+word;}ctx.fillText(line,30,y);ctx.font='20px Segoe UI';ctx.fillStyle='#a8bdba';ctx.fillText((c.types||[]).join(' · '),30,540);ctx.fillText('Card art unavailable',30,585);if(c.power!=null)ctx.fillText(`${c.power} / ${c.toughness}`,390,670);});
    m.diffuseTexture=t;m.metadata={artReady:false};materials.set(c.name,m);
    const img=new Image();img.onload=()=>{const context=t.getContext();context.drawImage(img,0,0,512,716);t.update();m.metadata.artReady=true;};img.src=assetURL(c);return m;
  }
  function label(node,text,y=0){const el=document.createElement('span');el.className='object-id';el.textContent=text;$('#object-labels').append(el);labels.push({node,el,y});return el;}
  function mat(name,x,z,w,d,art){
    const m=B.MeshBuilder.CreateGround(name,{width:w,height:d},scene);m.position.set(x,-.15,z);m.isPickable=false;m.receiveShadows=true;
    const key='mat '+art+(mobile.matches?' focused':' table');let material_=materials.get(key);if(!material_){material_=material(key,'#9fb0ad',1);material_.diffuseTexture=new B.Texture('/assets/playmats/'+art+'.webp',scene);if(mobile.matches){material_.diffuseTexture.uScale=.22;material_.diffuseTexture.uOffset=.39;}materials.set(key,material_);}m.material=material_;persistent.push(m);label(m,name);return m;
  }
  function addCard(c,zone,player,x,z,scale=1,bounds=null){
    const id=c.hidden?`H${player}-${c.index}`:`K${c.cardId}`;
    const root=new B.TransformNode(id,scene);root.position.set(x,0,z);root.scaling.setAll(scale);root.rotation.y=c.tapped?Math.PI/2:0;
    const body=B.MeshBuilder.CreateBox(id+' edge',{width:1.42,height:.045,depth:1.99},scene);body.parent=root;body.material=edge;body.isPickable=false;shadows.addShadowCaster(body);
    const face=B.MeshBuilder.CreateGround(id+' face',{width:1.4,height:1.97},scene);face.parent=root;face.position.y=.025;face.material=faceMaterial(c);
    const card={id,c,zone,player,root,face,body,bounds,tapped:!!c.tapped,home:new B.Vector3(x,0,z),goal:new B.Vector3(x,0,z),angle:root.rotation.y,lift:0,own:player===view.seat&&!c.hidden,hidden:!!(c.hidden||c.faceDown)};
    face.metadata={card};body.metadata={card};cards.push(card);if(!c.hidden)label(root,id,.1);return card;
  }
  function section(c){return c.types?.includes('Creature')?0:c.types?.includes('Land')?2:1;}
  function build(){
    serial++;clearTimeout(pointer?.timer);pointer=null;pinch=null;touches.clear();canvas.dataset.dragging='false';closeInspect();selected=null;highlight.removeAllMeshes();for(const c of cards){shadows.removeShadowCaster(c.body);c.root.dispose();}cards.length=0;for(const m of persistent)m.dispose();persistent.length=0;for(const l of labels)l.el.remove();labels.length=0;
    const focused=mobile.matches;$('#view-label').textContent=focused?'Focused':'Table';
    buildTableObject();
    const art=['falls-tree','cloud-wolf','sand-lion','ember-serpent'];
    mat('B01',0,focused?-2:-2.6,focused?8.7:22,focused?25:11.4,art[seat]);
    const p=view.state.players.find(p=>p.playerId===seat), columns=focused?3:6;
    let rowZ=focused?6.4:.7;
    for(let group=0;group<3;group++){
      const groupCards=(p.zones.Battlefield.cards||[]).filter(c=>section(c)===group);
      const rows=Math.max(1,Math.ceil(groupCards.length/columns));
      const bounds={xmin:focused?-3:-8.7,xmax:focused?3:6.8,zmin:rowZ-(rows-1)*2.5-.35,zmax:rowZ+.35};
      groupCards.forEach((c,i)=>addCard(c,'Battlefield',p.playerId,(focused?-2.3:-7.3)+(i%columns)*(focused?2.3:2.65),rowZ-Math.floor(i/columns)*2.5,1,bounds));
      rowZ-=rows*2.5;
    }
    const hand=p.zones.Hand;const handCards=seat===view.seat?hand.cards:Array.from({length:hand.count},(_,index)=>({hidden:true,index}));
    handCards.forEach((c,i)=>{const x=focused?-2.2+i%3*2.2:(i-(handCards.length-1)/2)*1.6;const z=focused?rowZ-1-Math.floor(i/3)*2.4:-9;const card=addCard(c,'Hand',p.playerId,x,z,.95,{xmin:focused?-3:-8,xmax:focused?3:8,zmin:z-.45,zmax:z+.45});if(!focused){card.angle=(i-(handCards.length-1)/2)*-.07;card.root.rotation.y=card.angle;}});
    for(const [i,zone] of ['Library','Graveyard','Exile','Command'].entries()){
      const x=focused?(i%2===0?-2.2:2.2):9+(i%2)*1.7;const z=focused?rowZ-6-Math.floor(i/2)*2.5:1-Math.floor(i/2)*3;
      const pile=p.zones[zone];if(!pile.count){const slot=B.MeshBuilder.CreateGround(zone,{width:1.02,height:1.42},scene);slot.position.set(x,-.07,z);slot.material=back;slot.isPickable=false;persistent.push(slot);label(slot,`${zone} · 0`);continue;}const top=pile.cards?.at(-1);const c=top||{hidden:true,index:zone};
      const card=addCard(c,zone,p.playerId,x,z,.72);label(card.root,`${zone} · ${pile.count}`,1.1);
    }
    if(!focused){
      const others=view.state.players.filter(p=>p.playerId!==seat);
      others.forEach((p,i)=>{const x=(i-1)*8;mat('B0'+(i+2),x,6.4,7.5,5.7,art[p.playerId]);p.zones.Battlefield.cards.forEach((c,n)=>addCard(c,'Battlefield',p.playerId,x-2.5+(n%5)*1.2,7.5-Math.floor(n/5)*1.6,.6));Array.from({length:p.zones.Hand.count},(_,n)=>addCard({hidden:true,index:n},'Hand',p.playerId,x-1.8+n*.48,4.4,.4));});
    }
    $('#seats').replaceChildren();for(const player of view.state.players){const b=document.createElement('button');b.setAttribute('aria-pressed',String(seat===player.playerId));const life=document.createElement('b');life.textContent=player.health?.life??player.life;b.append(life,document.createTextNode(player.playerId===view.seat?'You':player.name));b.onclick=()=>{seat=player.playerId;build();};$('#seats').append(b);}
    $('#accessible-cards').replaceChildren();for(const c of cards.filter(c=>c.player===seat&&!c.hidden)){const b=document.createElement('button');b.textContent=`${c.id} · ${c.c.name} · ${c.zone}`;b.onclick=()=>{select(c);camera.target.x=c.root.position.x;camera.target.z=c.root.position.z;$('#card-list').open=false;};$('#accessible-cards').append(b);}
    $('#game-label').textContent=`Round ${Math.ceil(view.state.turn/view.state.players.length)} · ${view.state.phase} · Frame ${frame+1}/${total}`;
    $('#previous').disabled=frame===0;$('#next').disabled=frame===total-1;updateSelection();homeCamera();say(mobile.matches?'Drag cards to move · Drag empty space to pan':'Select a card. Drag to move; Inspect to read; Tap to rotate.');
  }
  function select(c){if(selected)highlight.removeMesh(selected.face);selected=c;if(c)highlight.addMesh(c.face,new B.Color3(.5,1,.75));updateSelection();}
  function updateSelection(){const c=selected;$('#card-name').textContent=c?(c.hidden?'Face-down card':c.c.name):'Pick a card';$('#card-meta').textContent=c?`${c.id} · ${c.zone} · ${c.player===view.seat?'Your card':'View only'}${c.zone==='Battlefield'?' · '+(c.tapped?'Tapped':'Untapped'):''}`:'Drag to lift and move. Select to inspect or tap.';$('#inspect').disabled=!c||c.hidden;$('#tap').disabled=!c||!c.own||c.zone!=='Battlefield';$('#tap').textContent=c?.tapped?'Untap':'Tap';$('#return').disabled=!c||!c.own||!c.bounds;}
  function tap(){const c=selected;if(!c?.own||c.zone!=='Battlefield')return;c.tapped=!c.tapped;c.angle=c.tapped?Math.PI/2:0;updateSelection();say(`${c.c.name} ${c.tapped?'tapped':'untapped'} · preview only`);}
  function closeInspect(){if(inspectionCard){inspectionCard.lift=0;inspectionCard=null;}if($('#inspection').open)$('#inspection').close();}
  function inspect(){const c=selected;if(!c||c.hidden)return;inspectionCard=c;c.lift=1.5;$('#inspection-name').textContent=c.c.name;const image=$('#inspection-image');image.alt=c.c.name;image.src=c.face.material.diffuseTexture.getContext().canvas.toDataURL('image/png');$('#inspection-detail').textContent=`${c.id} · ${(c.c.types||[]).join(' · ')}${c.c.power!=null?' · '+c.c.power+'/'+c.c.toughness:''} · Close to return to its position.`;$('#inspection').showModal();say('Inspecting '+c.c.name);}
  function restore(){if(!selected?.own||!selected.bounds)return;selected.goal.copyFrom(selected.home);selected.lift=0;say('Returned to its recorded position.');}
  function planePoint(x,y){const ray=scene.createPickingRay(x,y,B.Matrix.Identity(),camera);const d=ray.intersectsPlane(new B.Plane(0,1,0,0));return d===null?null:ray.origin.add(ray.direction.scale(d));}
  function coords(e){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
  function moveCard(c,p){if(!c?.own||!c.bounds)return;const b=c.bounds;c.goal.x=Math.max(b.xmin,Math.min(b.xmax,p.x));c.goal.z=Math.max(b.zmin,Math.min(b.zmax,p.z));}
  const touches=new Map();let pinch=null;
  canvas.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);touches.set(e.pointerId,coords(e));
    if(touches.size===2){if(pointer?.card)pointer.card.lift=0;clearTimeout(pointer?.timer);pointer=null;const a=[...touches.values()];pinch={distance:Math.hypot(a[1].x-a[0].x,a[1].y-a[0].y),zoom:+$('#zoom').value};return;}
    const q=coords(e),hit=scene.pick(q.x,q.y,m=>!!m.metadata?.card),c=hit?.pickedMesh?.metadata?.card;
    if(c)select(c);pointer={id:e.pointerId,x:q.x,y:q.y,world:planePoint(q.x,q.y),card:c,origin:c?.goal.clone(),camera:camera.target.clone(),moved:false};
    if(e.pointerType==='touch'&&c&&!c.hidden)pointer.timer=setTimeout(()=>{if(pointer&&!pointer.moved){inspect();pointer=null;}},500);
  });
  canvas.addEventListener('pointermove',e=>{
    const q=coords(e);if(touches.has(e.pointerId))touches.set(e.pointerId,q);
    if(pinch&&touches.size===2){const a=[...touches.values()],distance=Math.hypot(a[1].x-a[0].x,a[1].y-a[0].y);$('#zoom').value=Math.max(60,Math.min(180,pinch.zoom*distance/pinch.distance));setCamera();return;}
    if(!pointer||pointer.id!==e.pointerId)return;
    if(Math.hypot(q.x-pointer.x,q.y-pointer.y)>7){pointer.moved=true;clearTimeout(pointer.timer);}
    if(!pointer.moved)return;const point=planePoint(q.x,q.y);if(!point||!pointer.world)return;
    if(pointer.card){if(pointer.card.own&&pointer.card.bounds){pointer.card.lift=.7;canvas.dataset.dragging='true';moveCard(pointer.card,pointer.origin.add(point.subtract(pointer.world)));}}
    else {const dx=(q.x-pointer.x)*camera.radius/canvas.clientHeight*.65,dz=(q.y-pointer.y)*camera.radius/canvas.clientHeight*.65;camera.target.x=Math.max(-10,Math.min(10,pointer.camera.x-dx));camera.target.z=Math.max(-15,Math.min(9,pointer.camera.z+dz));}
  });
  function finish(e,cancel=false){touches.delete(e.pointerId);if(touches.size<2)pinch=null;if(pointer?.id!==e.pointerId)return;clearTimeout(pointer.timer);if(pointer.card){const c=pointer.card;if(cancel&&pointer.origin)c.goal.copyFrom(pointer.origin);else if(pointer.moved&&c.own&&c.bounds){moveCard(c,new B.Vector3(Math.round(c.goal.x*4)/4,0,Math.round(c.goal.z*4)/4));say(`${c.c.name} moved within ${c.zone}.`);}c.lift=0;}pointer=null;canvas.dataset.dragging='false';}
  canvas.addEventListener('pointerup',e=>finish(e));canvas.addEventListener('pointercancel',e=>finish(e,true));canvas.addEventListener('lostpointercapture',e=>finish(e,true));
  canvas.addEventListener('dblclick',()=>inspect());canvas.addEventListener('wheel',e=>{e.preventDefault();$('#zoom').value=+$('#zoom').value-e.deltaY*.07;setCamera();},{passive:false});
  canvas.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='t'){tap();e.preventDefault();}if(e.key==='Enter'){inspect();e.preventDefault();}if(e.key==='Escape'){restore();e.preventDefault();}if(e.key===' '&&selected?.own&&selected.bounds){selected.lift=selected.lift?0:.7;e.preventDefault();}const delta={ArrowLeft:[-.25,0],ArrowRight:[.25,0],ArrowUp:[0,.25],ArrowDown:[0,-.25]}[e.key];if(delta&&selected?.own){moveCard(selected,selected.goal.add(new B.Vector3(delta[0],0,delta[1])));e.preventDefault();}});
  function setCamera(){camera.beta=mobile.matches?.13:Math.max(.001,+$('#tilt').value*Math.PI/180);camera.radius=(mobile.matches?(innerWidth>innerHeight?11:24):33)*100/Number($('#zoom').value);$('#tilt-value').textContent=$('#tilt').value+'°';$('#zoom-value').textContent=$('#zoom').value+'%';}
  function homeCamera(){const landscape=mobile.matches&&innerWidth>innerHeight;camera.target.set(landscape?-2.8:0,0,mobile.matches?(landscape?5.7:1.6):-2.2);$('#zoom').value=100;setCamera();}
  $('#table-design').replaceChildren(...CrankTables.designs.map(d=>{const o=document.createElement('option');o.value=d.id;o.textContent=d.name;o.title=d.reads;return o;}));$('#table-design').value=tableDesign;$('#table-design').onchange=e=>setTableDesign(e.target.value);
  $('#tilt').oninput=setCamera;$('#zoom').oninput=setCamera;$('#home-camera').onclick=homeCamera;
  $('#camera-toggle').onclick=()=>{const p=$('#camera-panel');p.hidden=!p.hidden;$('#camera-toggle').setAttribute('aria-expanded',String(!p.hidden));};
  $('#ids').onclick=()=>{const off=document.body.classList.toggle('hide-ids');$('#ids').textContent='IDs '+(off?'off':'on');$('#ids').setAttribute('aria-pressed',String(!off));};
  $('#tap').onclick=tap;$('#inspect').onclick=inspect;$('#return').onclick=restore;$('#close-inspection').onclick=closeInspect;$('#inspection').addEventListener('close',closeInspect);
  async function load(next){const token=++serial;const response=await fetch('/view?frame='+next);if(!response.ok)throw Error('Recorded state unavailable');const data=await response.json();if(token!==serial)return;view=data.view;frame=data.frame;total=data.total;if(!view.state.players.some(p=>p.playerId===seat))seat=view.seat;build();}
  $('#reset').onclick=()=>build();$('#previous').onclick=()=>load(frame-1).catch(e=>say(e.message));$('#next').onclick=()=>load(frame+1).catch(e=>say(e.message));
  mobile.addEventListener('change',()=>{build();engine.resize();});let wasLandscape=innerWidth>innerHeight;window.addEventListener('resize',()=>{engine.resize();const landscape=innerWidth>innerHeight;if(mobile.matches&&landscape!==wasLandscape)homeCamera();wasLandscape=landscape;});
  function videoPolicy(){const video=$('#environment');if(reduced.matches||document.hidden)video.pause();else video.play().catch(()=>{});}document.addEventListener('visibilitychange',videoPolicy);reduced.addEventListener('change',videoPolicy);videoPolicy();
  const project=(node)=>{const p=B.Vector3.Project(node.getAbsolutePosition(),B.Matrix.Identity(),scene.getTransformMatrix(),camera.viewport.toGlobal(engine.getRenderWidth(),engine.getRenderHeight()));return{x:p.x*canvas.clientWidth/engine.getRenderWidth(),y:p.y*canvas.clientHeight/engine.getRenderHeight(),z:p.z};};
  engine.runRenderLoop(()=>{const blend=reduced.matches?1:Math.min(1,engine.getDeltaTime()/90);for(const c of cards){const target=c.goal.clone();target.y=c.lift;c.root.position=B.Vector3.Lerp(c.root.position,target,blend);c.root.rotation.y+=(c.angle-c.root.rotation.y)*blend;}scene.render();const rect=canvas.getBoundingClientRect();for(const l of labels){const p=project(l.node);l.el.style.left=(p.x+rect.left)+'px';l.el.style.top=(p.y+rect.top+16)+'px';l.el.hidden=p.z<0||p.z>1||p.x<0||p.y<0||p.x>rect.width||p.y>rect.height;}});
  canvas.addEventListener('webglcontextlost',()=>say('Graphics paused. Reload the preview to recover.'));
  await load(13);
  // Read-only diagnostics for interaction proofs. Actions are driven through pointer/keyboard input.
  globalThis.tabletopLab={get frame(){return frame;},get view(){return structuredClone(view);},get selected(){return selected?.id;},get focused(){return mobile.matches;},snapshot:()=>cards.map(c=>({id:c.id,name:c.hidden?null:c.c.name,player:c.player,zone:c.zone,hidden:c.hidden,own:c.own,tapped:c.tapped,artReady:!!c.face.material.metadata?.artReady,position:{x:c.root.position.x,y:c.root.position.y,z:c.root.position.z},goal:{x:c.goal.x,z:c.goal.z},bounds:c.bounds,screen:project(c.root)})),get fps(){return engine.getFps();}};
  globalThis.tabletopLab.tableInfo=()=>({design:tableDesign,parts:tableObject.parts.filter(p=>p.metadata?.part).map(p=>({name:p.name,part:p.metadata.part,alpha:p.material?.alpha??1,visible:p.isVisible}))});
  globalThis.tabletopLab.setTableDesign=setTableDesign;
  globalThis.tabletopLab.pickTablePart=(x,y)=>{const hit=scene.pick(x,y,m=>!!m.metadata?.part);return hit?.pickedMesh?{part:hit.pickedMesh.metadata.part,name:hit.pickedMesh.name}:null;};
})().catch(e=>{console.error(e);document.querySelector('#status').textContent='Preview could not load: '+e.message;});
