/* Transactional delivery only. Credentials remain in Worker secrets; callers persist the job ID. */
export const INVITE_SENDER = 'CrankMagic <invite@crankmagic.com>';
export const mailReady = env => typeof env.RESEND_API_KEY === 'string' && !!env.RESEND_API_KEY.trim();
export async function sendMail(env, job, fetchImpl = fetch) {
  if (!mailReady(env)) throw new Error('Email is not configured.');
  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: {authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json',
      'Idempotency-Key': `crankmagic-mail/${job.id}`},
    body: JSON.stringify({from: INVITE_SENDER, to: [job.recipient], subject: job.subject, text: job.text}),
  });
  // Never propagate provider responses: they can contain recipient or credential details.
  if (!response.ok) {await response.body?.cancel(); throw new Error('Email provider refused delivery.');}
  const result = await response.json();
  if (typeof result.id !== 'string' || !result.id) throw new Error('Email provider did not confirm acceptance.');
  return {messageId: result.id};
}
