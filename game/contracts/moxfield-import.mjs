function row(line,lineNumber){
  const cells=[];let value='',quoted=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){cells.push(value.trim());value='';}else value+=c;
  }
  if(quoted)throw Error(`Unclosed quote on line ${lineNumber}`);cells.push(value.trim());if(cells.length!==2)throw Error(`Expected card name and count on line ${lineNumber}`);return cells;
}
const count=value=>/^\d+$/.test(value)&&Number(value)>0?Number(value):null;

/** Parse the two-column Moxfield-style export requested by the multiplayer lobby. */
export function parseMoxfieldTwoColumn(text,{name='Uploaded Commander deck'}={}){
  if(typeof text!=='string'||!text.trim()||text.length>1_000_000)throw Error('Deck CSV is empty or too large');
  const lines=text.replace(/^\uFEFF/,'').replaceAll('\r\n','\n').replaceAll('\r','\n').split('\n');let section=0,seenMain=false,seenGap=false,columns=null;const main=[],commanders=[];
  for(let i=0;i<lines.length;i++){
    const line=lines[i];if(!line.trim()){if(seenMain){seenGap=true;section=1;}continue;}
    const cells=row(line,i+1);
    if(!columns&&cells.some(c=>/^(?:card )?name$|^(?:count|quantity)$/i.test(c))){
      const nameIndex=cells.findIndex(c=>/^(?:card )?name$/i.test(c)),countIndex=cells.findIndex(c=>/^(?:count|quantity)$/i.test(c));if(nameIndex<0||countIndex<0)throw Error('CSV header must contain card name and count');columns={nameIndex,countIndex};continue;
    }
    const quantityIndex=columns?.countIndex??(count(cells[0])!==null?0:1),nameIndex=columns?.nameIndex??1-quantityIndex,quantity=count(cells[quantityIndex]),cardName=cells[nameIndex];
    if(quantity===null||!cardName||cardName.length>200||/[\r\n]/.test(cardName))throw Error(`Invalid card row on line ${i+1}`);
    (section?commanders:main).push({name:cardName,quantity});seenMain=true;
  }
  if(!seenGap||!commanders.length)throw Error('Put one blank line between the 99-card library and commander');
  if(commanders.length>2||commanders.some(c=>c.quantity!==1))throw Error('Commander section must contain one commander, or two single-card partner commanders');
  if(main.reduce((n,c)=>n+c.quantity,0)+commanders.length!==100)throw Error('Commander deck must contain exactly 100 cards including commander(s)');
  const commanderNames=commanders.map(c=>c.name);if(new Set(commanderNames).size!==commanderNames.length||main.some(c=>commanderNames.includes(c.name)))throw Error('Commander appears twice in the deck');
  return {schema:'CrankMagicDeckHandoff@1',name:String(name).trim().slice(0,180)||'Uploaded Commander deck',commanders:commanderNames,rows:main};
}
