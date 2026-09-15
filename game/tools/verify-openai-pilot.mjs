import {createOpenAIChoiceProvider} from './api-choice-provider.mjs';
import {DEFAULT_OPENAI_MODEL,loadOpenAiCredential} from './windows-credential.mjs';

const target=process.argv[2]||'crankmagic_openai_api';
const session=loadOpenAiCredential(target);
if(!session)throw Error('The Windows OpenAI credential could not be loaded');

const options=[
  {index:0,label:'Play the offered basic Forest during main phase 1'},
  {index:1,label:'Pass without developing the board'}
];
const provider=createOpenAIChoiceProvider({apiKey:session.key,model:DEFAULT_OPENAI_MODEL,maxCalls:1});
const selected=await provider({
  seatId:1,
  revision:1,
  choice:{mode:'one',min:1,max:1,options},
  observation:{
    schema:'CrankMagicPilotObservation@1',
    turn:1,
    phase:'MAIN1',
    own:{life:40,hand:[{name:'Forest',typeLine:'Basic Land — Forest'}],battlefield:[]},
    opponents:[{playerId:0,life:40,battlefield:[]}],
    threats:[],
    policy:{level:3,label:'Focused'}
  }
});

console.log(JSON.stringify({ok:true,provider:'openai',model:DEFAULT_OPENAI_MODEL,selectedAction:options.find(option=>option.index===selected)?.label||'valid engine option'}));
