# A visible Admin row must never substitute for server authorization or read-only enforcement.
SUITES = ['tests/cloud-worker.mjs']
BREAKS = [
    ('ordinary person reads admin', 'cloud/worker.mjs',
     'if (!administrator(who,person,env)) return reply(403,', 'if (false) return reply(403,'),
    ('unconfigured account becomes admin', 'cloud/worker.mjs',
     "return !!env.INVITE_ADMIN_ID && String(person.id) === String(env.INVITE_ADMIN_ID);", 'return true;'),
    ('client can change feature configuration', 'cloud/worker.mjs',
     "if (method !== 'GET') return new Response(JSON.stringify({error:'Administration is read-only in this version.'}),",
     "if (false) return new Response(JSON.stringify({error:'Administration is read-only in this version.'}),"),
    ('admission misreported as delivery', 'cloud/worker.mjs',
     ') AS deliveryStatus', ") AS actualDeliveryStatus, i.status AS deliveryStatus"),
]
