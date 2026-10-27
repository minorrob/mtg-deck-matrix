# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
SUITES=['tests/r4-density-safety.mjs']
BREAKS=[
 ('writes reach network', 'tests/uat/r4-live-density.mjs', "if(!['GET','HEAD'].includes(method))return 'deny-write';", ''),
 ('credentials leak to other origins', 'tests/uat/r4-live-density.mjs', '&&new URL(raw).origin===STAGING', ''),
 ('artifacts enter Git', 'tests/uat/r4-live-density.mjs', "throw Error('Density artifacts must be outside every Git checkout');", 'return path.resolve(target);'),
]
