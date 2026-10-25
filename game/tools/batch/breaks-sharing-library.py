"""ROB-37: prove the library permission, privacy, and stale-save assertions can fail.

Run from the repository root with the existing breaks runner. Every mutation is
restored by that runner; the suite uses isolated SQLite and simulated email only.
"""
SUITES = ['tests/sharing.mjs']
BREAKS = [
    ('library private metadata leaks', 'cloud/sharing.mjs',
     '({id:l.id,cardId:l.cardId,quantity:l.quantity,source:l.source,assigned:',
     '({notes:l.notes,id:l.id,cardId:l.cardId,quantity:l.quantity,source:l.source,assigned:'),
    ('library Reviewer may write', 'cloud/sharing.mjs',
     "(write&&!['owner','collaborator'].includes(access))",
     "(write&&s.kind!=='library'&&!['owner','collaborator'].includes(access))"),
    ('library accepts stale edits', 'cloud/sharing.mjs',
     'if(input.head!==head.id)',
     "if(s.kind!=='library'&&input.head!==head.id)"),
    ('revoked library stays readable', 'cloud/sharing.mjs',
     "grant?.role||s.public_role;",
     "grant?.role||s.public_role||(s.kind==='library'?'reviewer':null);"),
]
