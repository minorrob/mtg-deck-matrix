import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const files=new Map([['/',['game/ui/review.html','text/html']],['/review.css',['game/ui/review.css','text/css']],['/review.mjs',['game/ui/review.mjs','text/javascript']],['/match.json',['game/.local/review/match.json','application/json']]]);
files.set('/mats.css',['game/ui/mats.css','text/css']);
files.set('/rob-playmat.png',['game/ui/assets/rob-playmat.png','image/png']);
createServer(async(req,res)=>{
  const entry=files.get(new URL(req.url,'http://127.0.0.1').pathname);
  if(req.method!=='GET'||!entry){res.writeHead(404);res.end();return;}
  try {const body=await readFile(resolve(root,entry[0]));res.writeHead(200,{'Content-Type':entry[1]+'; charset=utf-8','Cache-Control':'no-store',
    'Content-Security-Policy':"default-src 'self'; img-src 'self' https://cards.scryfall.io; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'"});res.end(body);}
  catch{res.writeHead(404);res.end('Build the local replay preview first.');}
}).listen(8768,'127.0.0.1',()=>console.log('Commander replay preview: http://127.0.0.1:8768'));
