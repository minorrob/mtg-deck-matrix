// Only the configured reusable invitation policy is writable. Other app policies remain untouched.
const fields = ['name','decision','include','exclude','require','approval_groups','approval_required',
  'connection_rules','isolation_required','mfa_config','purpose_justification_prompt',
  'purpose_justification_required','session_duration'];
const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
/* ONE INVITATION, EVERY SIGN-IN (Rob, 2026-10-26: "adds their email address to the Cloudflare staging and production
   access ... and it has to be confirmed that they are added there"). ACCESS_INVITE_APP_IDS and ACCESS_INVITE_POLICY_ID
   are comma-separated lists read in pairs: application i is admitted through its reusable policy i. Each pair is
   written and read back in turn, and the address counts as admitted only when every one confirms it. The AI door needs
   no list of its own: it takes the same sign-in (AI_EVERYONE). */
export function inviteTargets(env) {
  const list=v=>String(v||'').split(',').map(x=>x.trim()).filter(Boolean);
  const apps=list(env.ACCESS_INVITE_APP_IDS),policies=list(env.ACCESS_INVITE_POLICY_ID);
  if(!apps.length||apps.length!==policies.length||![...apps,...policies].every(x=>uuid.test(x)))return [];
  return apps.map((app,i)=>({app,policy:policies[i]}));
}
/** Admits `to` through every configured Access application and returns what each confirmed:
    [{app, name, domain, added}] -- `added` false where the address was already on that policy. */
export async function admitAddress(db,env,to,{now,fetchImpl,fail}) {
  const targets=inviteTargets(env);
  if(!env.ACCESS_INVITE_TOKEN||!targets.length||!/^[\da-f]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID||''))
    fail('Cloudflare Access invitation permissions are not configured. Your sign-in is unchanged.',503);
  const confirmed=[];
  for(const target of targets){
    try{confirmed.push(await admitOne(db,env,to,target,{now,fetchImpl,fail}));}
    catch(error){
      // Name what already holds, so a retry (which is idempotent) is understood as finishing the rest.
      if(confirmed.length)error.message+=` Already admitted: ${confirmed.map(x=>x.domain||x.name).join(', ')}.`;
      throw error;
    }
  }
  return confirmed;
}
async function admitOne(db,env,to,{app,policy:policyId},{now,fetchImpl,fail}) {
  const base=`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/access`;
  const error='Access did not admit this address. No invitation email was sent; ask the administrator to check invitation permissions.';
  const call=async(path,method='GET',body)=>{
    try {
      const response=await fetchImpl(base+path,{method,redirect:'manual',signal:AbortSignal.timeout(10000),
        headers:{authorization:`Bearer ${env.ACCESS_INVITE_TOKEN}`,'content-type':'application/json'},
        ...(body?{body:JSON.stringify(body)}:{})});
      // workerd rejects redirect:'error'. Never follow redirects with the bearer token.
      if(!response.ok){await response.body?.cancel();fail(error,502);}
      const value=await response.json();if(value.success!==true||!value.result)fail(error,502);
      return value.result;
    } catch {fail(error,502);}
  };
  const holder=crypto.randomUUID(),stamp=now(),expires=new Date(Date.parse(stamp)+90000).toISOString();
  const lease=await db.prepare(`INSERT INTO access_invite_locks(id,holder,expires_at) VALUES (?,?,?)
    ON CONFLICT(id) DO UPDATE SET holder=excluded.holder,expires_at=excluded.expires_at
    WHERE access_invite_locks.expires_at<=? RETURNING holder`).bind(policyId,holder,expires,stamp).first();
  if(lease?.holder!==holder)fail('Another invitation is being processed. Please try again shortly.',409);
  try {
    const appState=await call(`/apps/${app}`),policy=await call(`/policies/${policyId}`);
    if(!appState.policies?.some(p=>p.id===policyId)||policy.id!==policyId||policy.reusable!==true||policy.app_count!==1||policy.decision!=='allow'||!Array.isArray(policy.include))
      fail('The invitation policy must be reusable and attached only to this application. Ask the administrator to check its configuration.',503);
    const done=added=>({app,name:String(appState.name||''),domain:String(appState.domain||''),added});
    if(policy.include.some(r=>r.email?.email?.toLowerCase()===to))return done(false);
    const body=Object.fromEntries(fields.filter(k=>Object.hasOwn(policy,k)).map(k=>[k,policy[k]]));
    body.include=[...policy.include,{email:{email:to}}];
    // The lease must still cover the bounded update/readback before sending a credentialed request.
    const current=await db.prepare('SELECT holder,expires_at FROM access_invite_locks WHERE id=?').bind(policyId).first();
    if(current?.holder!==holder||Date.parse(current.expires_at)-Date.parse(now())<30000)fail('Invitation processing expired. Please retry.',409);
    await call(`/policies/${policyId}`,'PUT',body);
    const confirmed=await call(`/policies/${policyId}`);
    if(!confirmed.include?.some(r=>r.email?.email?.toLowerCase()===to))fail(error,502);
    return done(true);
  } finally {
    await db.prepare('DELETE FROM access_invite_locks WHERE id=? AND holder=?').bind(policyId,holder).run();
  }
}
