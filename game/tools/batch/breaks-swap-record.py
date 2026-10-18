# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The swap record (2026-10-18, Linear ROB-117): tests/swap-record.mjs holds swap-record.js on Krenko's hundred and the
preview protocol. These breaks prove the checks can fail: a delta faked for an unmeasured record (the issue's own
break), the noise ignored so any delta is a gain, an unmeasured record ranked above a measured gain, a swap with no
evidence recommended, mixed protocols accepted, and measureTop faking a number for a record it did not reach. From
the repository root:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-swap-record.py
"""
SUITES = ['tests/swap-record.mjs']
BREAKS = [
    ('a delta faked for an unmeasured record', 'swap-record.js',
     '    const r = {out: {name: outName, price: price.out, owned: owned.out}, in: {name: inName, price: price.in, owned: owned.in}, evidence, composition, price, owned, measured: null, status: evidence.length ? "unmeasured" : "no-evidence", says: ""};',
     '    const r = {out: {name: outName, price: price.out, owned: owned.out}, in: {name: inName, price: price.in, owned: owned.in}, evidence, composition, price, owned, measured: {protocol: "preview", games: 0, seeds: null, before: {score: 0, se: 0}, after: {score: 1, se: 0}, delta: 1, se: 0, significant: true, noise: 2, at: null}, status: evidence.length ? "measured-gain" : "no-evidence", says: ""};'),
    ('the noise ignored', 'swap-record.js',
     '    const significant = Math.abs(delta) > NOISE * se && Math.abs(delta) >= (o.minGain === undefined ? 0 : o.minGain);',
     '    const significant = delta !== 0;'),
    ('an unmeasured record ranked above a measured gain', 'swap-record.js',
     '    const tier = (r) => (r.status === "measured-gain" ? 0 : r.status === "unmeasured" ? 1 : r.status === "measured-no-gain" ? 2 : r.status === "measured-loss" ? 3 : 4);',
     '    const tier = (r) => (r.status === "unmeasured" ? 0 : r.status === "measured-gain" ? 1 : r.status === "measured-no-gain" ? 2 : r.status === "measured-loss" ? 3 : 4);'),
    ('a swap with no evidence recommended', 'swap-record.js',
     '    const status = r.status === "no-evidence" ? "no-evidence" : !significant ? "measured-no-gain" : delta > 0 ? "measured-gain" : "measured-loss";',
     '    const status = !significant ? "measured-no-gain" : delta > 0 ? "measured-gain" : "measured-loss";'),
    ('mixed protocols accepted', 'swap-record.js',
     '    if (before.protocol && after.protocol && before.protocol !== after.protocol) throw new Error(`Before and after are on different protocols (${before.protocol}, ${after.protocol}); the delta would mean nothing.`);',
     ''),
    ('a number faked for a record not reached', 'swap-record.js',
     '    return records.map((r) => done.get(r) || r);',
     '    return records.map((r) => done.get(r) || withMeasurement(r, before, before, {protocol: o.protocol || before.protocol}));'),
]
