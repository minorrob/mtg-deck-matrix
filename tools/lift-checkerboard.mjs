#!/usr/bin/env node
/* LIFT ART OFF A PAINTED CHECKERBOARD.
 *
 *   node tools/lift-checkerboard.mjs <source.png> <out-base> [width=1120]      writes <out-base>.webp and <out-base>.png
 *
 * Image generators asked for a transparent background often paint the transparency checkerboard into the pixels
 * (Rob's landing art of 2026-09-30, design/art-source/landing/, arrived 2752x1536 RGB with no alpha). The card backs had
 * the same trouble, and game/tools/prep-art.py crops them tight, which works for an opaque card; this is for art whose
 * glow and haze fade into the checker. In a browser's canvas (Playwright's Chromium, as the browser suites use):
 *
 *   1. the grid is the MEASURED edges along the image's borders, not a straight fit: a painted grid wanders;
 *   2. each pixel's alpha and color are the smallest that explain it over its cell's checker color (color-to-alpha),
 *      with both cells' colors tried within 2.5px of a boundary, where the painting blends them;
 *   3. the soft parts (alpha under .97) are smoothed across two cells, which cancels the checker's repeat where it showed
 *      through a painted glow, while the hard parts (the cards, the sparkles' cores) keep their edges;
 *   4. the result is cropped to what is left, with a margin, and scaled to the width asked for (twice the width it is
 *      shown at is the rule), WebP at quality .8.
 *
 * Traces remain where a glow was painted over the checker unevenly; a source on solid black needs none of this. */
import {readFileSync, writeFileSync} from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {findPlaywright} from "../tests/uat/browser-runner.mjs";

const [srcArg, outBase, widthArg] = process.argv.slice(2);
if (!srcArg || !outBase) { console.error("usage: node tools/lift-checkerboard.mjs <source.png> <out-base> [width]"); process.exit(2); }
const entry = findPlaywright();
if (!entry) { console.error("lift-checkerboard: Playwright is not installed (npm install --no-save --no-package-lock playwright@1.56.0)"); process.exit(1); }
const pw = await import(path.isAbsolute(entry) ? pathToFileURL(entry).href : entry);
const chromium = pw.chromium || (pw.default && pw.default.chromium);
const b = await chromium.launch();
const p = await b.newPage();
await p.route("http://local.test/**", (r) => r.request().url().endsWith(".png") ? r.fulfill({body: readFileSync(srcArg), contentType: "image/png"}) : r.fulfill({body: "<html><body></body></html>", contentType: "text/html"}));
await p.goto("http://local.test/");
const out = await p.evaluate(async({width})=>{
    const img=new Image();img.src='http://local.test/src.png';await img.decode();
    const W=img.naturalWidth,H=img.naturalHeight,c=new OffscreenCanvas(W,H),x=c.getContext('2d');x.drawImage(img,0,0);
    const id=x.getImageData(0,0,W,H),d=id.data,g=(xx,y)=>{const i=(y*W+xx)*4;return (d[i]+d[i+1]+d[i+2])/3;};
    const edges=(n,at)=>{const e=[];let prev=at(0)>162.5;for(let i=1;i<n;i++){const v=at(i)>162.5;if(v!==prev)e.push(i);prev=v;}return e;};
    /* boundaries: average of the two opposite borders where both see the same count, else the one border */
    const xe1=edges(W,(i)=>g(i,3)),xe2=edges(W,(i)=>g(i,H-4)),ye1=edges(H,(i)=>g(3,i)),ye2=edges(H,(i)=>g(W-4,i));
    const pick=(a,b2)=>a.length===b2.length?a.map((v,i)=>(v+b2[i])/2):a;
    const xb=pick(xe1,xe2),yb=pick(ye1,ye2);
    const table=(n,bounds)=>{const cell=new Int32Array(n),dist=new Float32Array(n);let k=0;for(let i=0;i<n;i++){while(k<bounds.length&&i>=bounds[k])k++;cell[i]=k;const near=Math.min(k<bounds.length?Math.abs(bounds[k]-i):1e9,k>0?Math.abs(i-bounds[k-1]):1e9);dist[i]=near;}return {cell,dist};};
    const tx=table(W,xb),ty=table(H,yb);
    const mean=(x0,y0,x1,y1)=>{const s=[0,0,0];let n=0;for(let y=y0;y<y1;y++)for(let xx=x0;xx<x1;xx++){const i=(y*W+xx)*4;s[0]+=d[i];s[1]+=d[i+1];s[2]+=d[i+2];n++;}return s.map(v=>v/n);};
    /* the two checker colors: the inner pixels of whole cells along the top row, sorted by brightness -- a cell cut
       off at the image's edge, or a boundary at its very corner, would give a wrong or empty sample */
    const cells=[];for(let k=0;k+1<xb.length&&cells.length<12;k++){const x0=Math.ceil(xb[k])+2,x1=Math.floor(xb[k+1])-2,y0=yb[0]>6?2:Math.ceil(yb[0])+2,y1=yb[0]>6?Math.floor(yb[0])-2:Math.floor(yb[1])-2;if(x1>x0&&y1>y0)cells.push(mean(x0,y0,x1,y1));}
    const lum=(c)=>(c[0]+c[1]+c[2])/3,sorted=[...cells].sort((a,b2)=>lum(a)-lum(b2)),half=Math.floor(sorted.length/2);
    const avg=(list)=>[0,1,2].map((k)=>list.reduce((n,c)=>n+c[k],0)/list.length);
    const D=avg(sorted.slice(0,half)),L=avg(sorted.slice(sorted.length-half));
    const lightAt00=g(2,2)>162.5;
    const A=new Float32Array(W*H),R=new Float32Array(W*H),G=new Float32Array(W*H),Bl=new Float32Array(W*H);
    for(let y=0;y<H;y++)for(let xx=0;xx<W;xx++){
      const i=(y*W+xx)*4,P=[d[i],d[i+1],d[i+2]],even=((tx.cell[xx]+ty.cell[y])%2===0),base=(even===lightAt00)?L:D;
      const cands=(tx.dist[xx]<2.5||ty.dist[y]<2.5)?[0,.2,.4,.6,.8,1].map(t=>L.map((v,k)=>v*t+D[k]*(1-t))):[base];
      let best=1,bestB=base;
      for(const B of cands){let a=0;for(let k=0;k<3;k++){const q=P[k]>B[k]?(P[k]-B[k])/(255-B[k]):(B[k]-P[k])/B[k];if(q>a)a=q;}if(a<best){best=a;bestB=B;}}
      const j=y*W+xx;
      if(best<0.06){A[j]=0;continue;}
      const a=best;A[j]=a;R[j]=(bestB[0]+(P[0]-bestB[0])/a)*a;G[j]=(bestB[1]+(P[1]-bestB[1])/a)*a;Bl[j]=(bestB[2]+(P[2]-bestB[2])/a)*a;   /* premultiplied */
    }
    /* soft parts smoothed across one cell: a separable box blur of premultiplied color and alpha, radius ~ a cell */
    const rad=Math.round((xb.length>2?(xb[xb.length-1]-xb[0])/(xb.length-1):17));
    const blur=(src)=>{const t=new Float32Array(W*H),o=new Float32Array(W*H);
      for(let y=0;y<H;y++){let s=0;const row=y*W;for(let xx=-rad;xx<=rad;xx++)s+=src[row+Math.min(W-1,Math.max(0,xx))];for(let xx=0;xx<W;xx++){t[row+xx]=s/(2*rad+1);s+=src[row+Math.min(W-1,xx+rad+1)]-src[row+Math.max(0,xx-rad)];}}
      for(let xx=0;xx<W;xx++){let s=0;for(let y=-rad;y<=rad;y++)s+=t[Math.min(H-1,Math.max(0,y))*W+xx];for(let y=0;y<H;y++){o[y*W+xx]=s/(2*rad+1);s+=t[Math.min(H-1,y+rad+1)*W+xx]-t[Math.max(0,y-rad)*W+xx];}}
      return o;};
    const bA=blur(blur(A)),bR=blur(blur(R)),bG=blur(blur(G)),bB=blur(blur(Bl));
    let minX=W,minY=H,maxX=0,maxY=0;
    for(let j=0;j<W*H;j++){
      const a=A[j],w=Math.max(0,Math.min(1,(0.97-a)/0.42));   /* 1 for faint haze, 0 for anything near opaque */
      const oa=a*(1-w)+bA[j]*w, or=R[j]*(1-w)+bR[j]*w, og=G[j]*(1-w)+bG[j]*w, ob=Bl[j]*(1-w)+bB[j]*w;
      const fa=oa<0.035?0:Math.min(1,(oa-0.035)/0.965), i=j*4;
      if(fa>0){d[i]=Math.min(255,Math.round(or/oa));d[i+1]=Math.min(255,Math.round(og/oa));d[i+2]=Math.min(255,Math.round(ob/oa));
        if(fa>0.12){const yy=Math.floor(j/W),xx=j%W;if(xx<minX)minX=xx;if(xx>maxX)maxX=xx;if(yy<minY)minY=yy;if(yy>maxY)maxY=yy;}}
      d[i+3]=Math.round(fa*255);
    }
    x.putImageData(id,0,0);
    const m=32;minX=Math.max(0,minX-m);minY=Math.max(0,minY-m);maxX=Math.min(W-1,maxX+m);maxY=Math.min(H-1,maxY+m);
    const cw=maxX-minX+1,ch=maxY-minY+1,tw=Math.min(width,cw),th=Math.round(ch*tw/cw);
    const o=new OffscreenCanvas(tw,th),ox=o.getContext('2d');ox.imageSmoothingQuality='high';ox.drawImage(c,minX,minY,cw,ch,0,0,tw,th);
    const enc=async(type,q)=>{const bl=await o.convertToBlob({type,quality:q});const u=new Uint8Array(await bl.arrayBuffer());let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode(...u.subarray(i,i+0x8000));return btoa(s);};
    return {grid:[xb.length,yb.length,rad],L:L.map(Math.round),D:D.map(Math.round),crop:[minX,minY,cw,ch],size:[tw,th],png:await enc('image/png'),webp:await enc("image/webp",0.8)};
  },{width:Number(widthArg||1120)});
writeFileSync(outBase + ".png", Buffer.from(out.png, "base64"));
writeFileSync(outBase + ".webp", Buffer.from(out.webp, "base64"));
console.log(`lift-checkerboard: grid ${out.grid[0]}x${out.grid[1]} boundaries, checker ${out.L.join(",")} / ${out.D.join(",")}, crop ${out.crop.join(",")} -> ${out.size.join("x")}; wrote ${outBase}.webp and .png`);
await b.close();
