/** Preview-only test dependencies; never a runtime requirement of the static app. */
import {mkdirSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {isAbsolute} from 'node:path';

export const packageRoot=fileURLToPath(new URL('../',import.meta.url)).replaceAll('\\','/').replace(/\/$/,'');
export const qaRoot=packageRoot+'/qa/generated';
mkdirSync(qaRoot,{recursive:true});
let browserType;
for(const specifier of [process.env.UAT_PLAYWRIGHT,'playwright'].filter(Boolean)){
  try{
    const module=await import(isAbsolute(specifier)?pathToFileURL(specifier).href:specifier);
    browserType=module.chromium||module.default?.chromium;
    if(browserType)break;
  }catch{/* Try the installed package after the explicit path. */}
}
if(!browserType)throw new Error('Playwright is required. Set UAT_PLAYWRIGHT to its index.js or install it outside the production app.');
export const chromium=browserType;
export const launchOptions={headless:true,...(process.env.UAT_CHROMIUM?{executablePath:process.env.UAT_CHROMIUM}:{})};
