// Only the configured reusable invitation policy is writable. Other app policies remain untouched.
const fields = ['name','decision','include','exclude','require','approval_groups','approval_required',
  'connection_rules','isolation_required','mfa_config','purpose_justification_prompt',
  'purpose_justification_required','session_duration'];
const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
export async function admitAddress(db,env,to,{now,fetchImpl,fail}) {
  const app=env.ACCESS_INVITE_APP_IDS,policyId=env.ACCESS_INVITE_POLICY_ID;
  if(!env.ACCESS_INVITE_TOKEN||!uuid.test(app||'')||!uuid.test(policyId||'')||!/^[\da-f]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID||''))
    fail('Cloudflare Access invitation permissions are not configured. Your sign-in is unchanged.',503);
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
    if(policy.include.some(r=>r.email?.email?.toLowerCase()===to))return;
    const body=Object.fromEntries(fields.filter(k=>Object.hasOwn(policy,k)).map(k=>[k,policy[k]]));
    body.include=[...policy.include,{email:{email:to}}];
    // The lease must still cover the bounded update/readback before sending a credentialed request.
    const current=await db.prepare('SELECT holder,expires_at FROM access_invite_locks WHERE id=?').bind(policyId).first();
    if(current?.holder!==holder||Date.parse(current.expires_at)-Date.parse(now())<30000)fail('Invitation processing expired. Please retry.',409);
    await call(`/policies/${policyId}`,'PUT',body);
    const confirmed=await call(`/policies/${policyId}`);
    if(!confirmed.include?.some(r=>r.email?.email?.toLowerCase()===to))fail(error,502);
  } finally {
    await db.prepare('DELETE FROM access_invite_locks WHERE id=? AND holder=?').bind(policyId,holder).run();
  }
}
