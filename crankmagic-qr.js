/* CrankQR -- the QR Code behind Share -> Show a QR code. A static site on GitHub Pages has
   no server to draw one and the app loads no third-party script, so the symbol is built here:
   byte mode, versions 1 to 10, error levels L M Q H, the eight ISO masks scored the standard
   way. Everything in this file is checked module for module against segno (a mature Python
   encoder) in tests/qr.mjs, on the app's own link and on strings that reach every table row
   used. The tables are ISO/IEC 18004 values, copied from segno 1.6.6. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.CrankQR=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
/* Per version and level: [blocks, total codewords per block, data codewords per block] for
   each block group, in the order the codewords are laid out. */
const ECC={"1":{"L":[[1,26,19]],"M":[[1,26,16]],"Q":[[1,26,13]],"H":[[1,26,9]]},"2":{"L":[[1,44,34]],"M":[[1,44,28]],"Q":[[1,44,22]],"H":[[1,44,16]]},"3":{"L":[[1,70,55]],"M":[[1,70,44]],"Q":[[2,35,17]],"H":[[2,35,13]]},"4":{"L":[[1,100,80]],"M":[[2,50,32]],"Q":[[2,50,24]],"H":[[4,25,9]]},"5":{"L":[[1,134,108]],"M":[[2,67,43]],"Q":[[2,33,15],[2,34,16]],"H":[[2,33,11],[2,34,12]]},"6":{"L":[[2,86,68]],"M":[[4,43,27]],"Q":[[4,43,19]],"H":[[4,43,15]]},"7":{"L":[[2,98,78]],"M":[[4,49,31]],"Q":[[2,32,14],[4,33,15]],"H":[[4,39,13],[1,40,14]]},"8":{"L":[[2,121,97]],"M":[[2,60,38],[2,61,39]],"Q":[[4,40,18],[2,41,19]],"H":[[4,40,14],[2,41,15]]},"9":{"L":[[2,146,116]],"M":[[3,58,36],[2,59,37]],"Q":[[4,36,16],[4,37,17]],"H":[[4,36,12],[4,37,13]]},"10":{"L":[[2,86,68],[2,87,69]],"M":[[4,69,43],[1,70,44]],"Q":[[6,43,19],[2,44,20]],"H":[[6,43,15],[2,44,16]]}};
const ALIGN={"2":[6,18],"3":[6,22],"4":[6,26],"5":[6,30],"6":[6,34],"7":[6,22,38],"8":[6,24,42],"9":[6,26,46],"10":[6,28,50]};
const LEVELS=['L','M','Q','H'],LEVEL_BITS={L:1,M:0,Q:3,H:2};
/* GF(256) on the QR primitive polynomial x^8+x^4+x^3+x^2+1. */
const EXP=new Array(512),LOG=new Array(256).fill(0);
(function(){let x=1;for(let i=0;i<255;i++){EXP[i]=x;LOG[x]=i;x<<=1;if(x&0x100)x^=0x11D;}for(let i=255;i<512;i++)EXP[i]=EXP[i-255];})();
const mul=(a,b)=>a&&b?EXP[LOG[a]+LOG[b]]:0;
/* The Reed-Solomon divisor of the given degree, highest power first, leading 1 implied. */
function generator(degree){const g=new Array(degree).fill(0);g[degree-1]=1;let root=1;
  for(let i=0;i<degree;i++){for(let j=0;j<degree;j++){g[j]=mul(g[j],root);if(j+1<degree)g[j]^=g[j+1];}root=mul(root,2);}return g;}
function remainder(data,degree){const div=generator(degree),out=new Array(degree).fill(0);
  for(const b of data){const factor=b^out.shift();out.push(0);for(let i=0;i<degree;i++)out[i]^=mul(div[i],factor);}return out;}
const dataCapacity=(v,ecl)=>ECC[v][ecl].reduce((n,[blocks,,data])=>n+blocks*data,0);
const bitsNeeded=(n,v)=>4+(v<10?8:16)+8*n;
function pick(n,ecl,boost){let version=0;for(let v=1;v<=10;v++)if(bitsNeeded(n,v)<=dataCapacity(v,ecl)*8){version=v;break;}
  if(!version)throw Error('That text is too long for a QR code this module draws (version 10 at level '+ecl+').');
  if(boost)for(const lvl of LEVELS.slice(LEVELS.indexOf(ecl)+1)){if(bitsNeeded(n,version)<=dataCapacity(version,lvl)*8)ecl=lvl;else break;}
  return {version,ecl};}
function formatBits(ecl,mask){const data=LEVEL_BITS[ecl]<<3|mask;let rem=data;for(let i=0;i<10;i++)rem=(rem<<1)^((rem>>>9)*0x537);return ((data<<10)|rem)^0x5412;}
function versionBits(v){let rem=v;for(let i=0;i<12;i++)rem=(rem<<1)^((rem>>>11)*0x1F25);return (v<<12)|rem;}
const MASKS=[(r,c)=>(r+c)%2===0,(r,c)=>r%2===0,(r,c)=>c%3===0,(r,c)=>(r+c)%3===0,(r,c)=>(Math.floor(r/2)+Math.floor(c/3))%2===0,(r,c)=>(r*c)%2+(r*c)%3===0,(r,c)=>((r*c)%2+(r*c)%3)%2===0,(r,c)=>((r+c)%2+(r*c)%3)%2===0];
/* ISO/IEC 18004 7.8.3, table 11, scored the way segno scores it so the chosen mask matches. */
function penalty(m,size){let n1=0,n2=0,n3=0,dark=0;const pat=[1,0,1,1,1,0,1];
  const find=(seq,from)=>{outer:for(let i=Math.max(from,0);i<=size-7;i++){for(let k=0;k<7;k++)if(seq[i+k]!==pat[k])continue outer;return i;}return -1;};
  const any=(seq,a,b)=>{for(let i=Math.max(a,0);i<Math.min(b,size);i++)if(seq[i])return true;return false;};
  const occurrences=seq=>{let count=0,idx=find(seq,0);while(idx!==-1){let off=idx+7;if(idx===0||idx===size-7||!any(seq,idx-4,idx)||!any(seq,off,off+4))count+=40;else off=idx+4;idx=find(seq,off);}return count;};
  let last=null;const column=new Uint8Array(size);
  for(let i=0;i<size;i++){const row=m[i];let rowPrev=-1,colPrev=-1,rowRun=0,colRun=0;
    for(let j=0;j<size;j++){const rb=row[j],cb=m[j][i];column[j]=cb;dark+=rb;
      if(rb===rowPrev)rowRun++;else{if(rowRun>=5)n1+=rowRun-2;rowRun=1;}
      if(cb===colPrev)colRun++;else{if(colRun>=5)n1+=colRun-2;colRun=1;}
      if(last&&j&&rb===rowPrev&&rb===last[j]&&rb===last[j-1])n2+=3;
      rowPrev=rb;colPrev=cb;}
    last=row;n3+=occurrences(row)+occurrences(column);if(rowRun>=5)n1+=rowRun-2;if(colRun>=5)n1+=colRun-2;}
  const n4=10*Math.floor(Math.abs(dark/(size*size)*100-50)/5);return n1+n2+n3+n4;}
function encode(text,options={}){
  const bytes=typeof TextEncoder!=='undefined'?new TextEncoder().encode(String(text)):Uint8Array.from(Buffer.from(String(text),'utf8'));
  const want=String(options.ecl||'M').toUpperCase();if(!LEVELS.includes(want))throw Error('Error level must be L, M, Q or H.');
  const {version,ecl}=pick(bytes.length,want,options.boost!==false);
  const capacityBytes=dataCapacity(version,ecl),bits=[];const put=(val,len)=>{for(let i=len-1;i>=0;i--)bits.push((val>>>i)&1);};
  put(4,4);put(bytes.length,version<10?8:16);for(const b of bytes)put(b,8);
  /* Terminator, then zeros to the codeword boundary. segno writes a whole zero codeword when
     the terminator already lands on the boundary; a decoder never reads past the terminator,
     and matching it keeps every fixture byte-identical, so that is what happens here too. */
  put(0,Math.min(4,capacityBytes*8-bits.length));for(let z=8-bits.length%8;z>0;z--)bits.push(0);
  const data=[];for(let i=0;i<bits.length;i+=8)data.push(bits.slice(i,i+8).reduce((n,b)=>n*2+b,0));data.length=Math.min(data.length,capacityBytes);
  for(let pad=0xEC;data.length<capacityBytes;pad^=0xEC^0x11)data.push(pad);
  const blocks=[];let k=0;for(const [count,total,dlen] of ECC[version][ecl])for(let i=0;i<count;i++){const d=data.slice(k,k+dlen);k+=dlen;blocks.push({d,e:remainder(d,total-dlen)});}
  const out=[];const maxD=Math.max(...blocks.map(b=>b.d.length)),maxE=Math.max(...blocks.map(b=>b.e.length));
  for(let i=0;i<maxD;i++)for(const b of blocks)if(i<b.d.length)out.push(b.d[i]);
  for(let i=0;i<maxE;i++)for(const b of blocks)if(i<b.e.length)out.push(b.e[i]);
  const size=17+4*version,mod=Array.from({length:size},()=>new Uint8Array(size)),fn=Array.from({length:size},()=>new Uint8Array(size));
  const set=(r,c,v)=>{mod[r][c]=v?1:0;fn[r][c]=1;};
  const finder=(r0,c0)=>{for(let r=-1;r<=7;r++)for(let c=-1;c<=7;c++){const rr=r0+r,cc=c0+c;if(rr<0||cc<0||rr>=size||cc>=size)continue;const d=Math.max(Math.abs(r-3),Math.abs(c-3));set(rr,cc,d!==2&&d!==4);}};
  finder(0,0);finder(0,size-7);finder(size-7,0);
  for(let i=8;i<size-8;i++){set(6,i,i%2===0);set(i,6,i%2===0);}
  const pos=ALIGN[version]||[];const lastPos=pos[pos.length-1];
  for(const a of pos)for(const b of pos){if((a===6&&b===6)||(a===6&&b===lastPos)||(a===lastPos&&b===6))continue;for(let dr=-2;dr<=2;dr++)for(let dc=-2;dc<=2;dc++)set(a+dr,b+dc,Math.max(Math.abs(dr),Math.abs(dc))!==1);}
  for(let i=0;i<=8;i++){fn[8][i]=1;fn[i][8]=1;}for(let i=0;i<8;i++){fn[8][size-1-i]=1;fn[size-1-i][8]=1;}
  if(version>=7){const vb=versionBits(version);for(let i=0;i<18;i++){const bit=(vb>>>i)&1,a=Math.floor(i/3),b=size-11+i%3;set(a,b,bit);set(b,a,bit);}}
  let i=0;const total=out.length*8;
  for(let right=size-1;right>=1;right-=2){if(right===6)right=5;for(let vert=0;vert<size;vert++)for(let j=0;j<2;j++){const c=right-j,upward=((right+1)&2)===0,r=upward?size-1-vert:vert;if(!fn[r][c]&&i<total){mod[r][c]=(out[i>>>3]>>>(7-(i&7)))&1;i++;}}}
  /* Masks are judged on the symbol as the spec says to judge it: data masked, format and
     version areas still blank (ISO/IEC 18004 7.8, and the way segno does it), so the choice
     here is the choice segno makes. The finished symbol then gets its format word. */
  const maskOnly=mask=>{const m=mod.map(row=>Uint8Array.from(row));for(let r=0;r<size;r++)for(let c=0;c<size;c++)if(!fn[r][c]&&MASKS[mask](r,c))m[r][c]^=1;return m;};
  const judged=mask=>{const m=maskOnly(mask);if(version>=7)for(let x=0;x<18;x++){const a=Math.floor(x/3),b=size-11+x%3;m[a][b]=0;m[b][a]=0;}return m;};
  const finished=mask=>{const m=maskOnly(mask),f=formatBits(ecl,mask),bit=x=>(f>>>x)&1;for(let x=0;x<=5;x++)m[x][8]=bit(x);m[7][8]=bit(6);m[8][8]=bit(7);m[8][7]=bit(8);for(let x=9;x<15;x++)m[8][14-x]=bit(x);
    for(let x=0;x<8;x++)m[8][size-1-x]=bit(x);for(let x=8;x<15;x++)m[size-15+x][8]=bit(x);m[size-8][8]=1;return m;};
  let mask=options.mask;if(!(Number.isInteger(mask)&&mask>=0&&mask<8)){let best=Infinity;mask=0;for(let x=0;x<8;x++){const score=penalty(judged(x),size);if(score<best){best=score;mask=x;}}}
  const modules=finished(mask);
  return {version,ecl,mask,size,modules,codewords:out,rows:modules.map(row=>Array.from(row).join(''))};}
const escapeAttr=s=>String(s).replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
/* An SVG with the four-module quiet zone the spec asks for, drawn light on purpose: the app
   is dark and a phone camera wants the symbol on white. */
function svg(text,options={}){const q=encode(text,options),quiet=options.quiet??4,n=q.size+quiet*2;let d='';
  for(let r=0;r<q.size;r++)for(let c=0;c<q.size;c++)if(q.modules[r][c])d+=`M${c+quiet} ${r+quiet}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="${escapeAttr(options.label||'QR code for '+text)}"><rect width="${n}" height="${n}" fill="${options.light||'#ffffff'}"/><path d="${d}" fill="${options.dark||'#000000'}"/></svg>`;}
return {encode,svg,generator,remainder,formatBits,versionBits,penalty,LOG,EXP,ECC,ALIGN};
});
