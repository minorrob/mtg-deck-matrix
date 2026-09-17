import {execFileSync} from 'node:child_process';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const DEFAULT_OPENAI_MODEL='gpt-5-mini';
export const OPENAI_FALLBACK_MODEL='gpt-5';
export const OPENAI_MODELS=Object.freeze([DEFAULT_OPENAI_MODEL,OPENAI_FALLBACK_MODEL]);

const helper=resolve(dirname(fileURLToPath(import.meta.url)),'read-windows-credential.ps1');
const validTarget=value=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,256}$/.test(value);

export function readWindowsGenericCredential(target,{platform=process.platform,run=execFileSync}={}){
  if(platform!=='win32'||!validTarget(target))return null;
  try{
    const value=run('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',helper,'-TargetName',target],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
    return value.length>=20&&value.length<=1000?value:null;
  }catch{return null;}
}

export function loadOpenAiCredential(target=process.env.COMMANDER_OPENAI_CREDENTIAL,options){
  if(!target)return null;
  const key=readWindowsGenericCredential(target,options);
  return key?{provider:'openai',model:DEFAULT_OPENAI_MODEL,key,source:'windows-credential-manager'}:null;
}

