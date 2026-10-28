const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const S = '/tmp/claude-0/-home-claude/be56a0b0-0e35-53a2-bcd9-d28c80a8623c/scratchpad/';
const BLOB = {'fbab4486e4856c1d2985105814a756a9':'r4/project/assets/brand/crankmagic-logo-gear-v4-256.webp','7a288c7839e68898815623b26f3d76c3':'r4/project/assets/mana/W.svg','2b17b4bdbd2318249c90194e3f9f9a0b':'r4/project/assets/mana/U.svg','e97376e2888e2d39922c02b36f018c1a':'r4/project/assets/mana/B.svg','16f2737dce102fa516105a665ac2cdfc':'r4/project/assets/mana/R.svg','5ad7eba10def3213b2d2e66b20c20c59':'r4/project/assets/mana/G.svg','507f0526c751d448fbbaefe45086af52':'r4/project/assets/mana/2.svg','475acd15c262d9251bed350746f059e0':'r4/project/assets/art/krenko.webp','5ae02b9ad871607e0bb5be472f16b756':'r4/project/assets/art/chulane.webp','6841a3cc3e5f8835a277f314605625a8':'r4/project/assets/art/shadrix.webp','3603f0676034fdc58bf00e52b3a3cd44':'r4/project/assets/art/tymna.webp','4b733f0644263f84f48f3f5973e666a2':'r4/project/assets/art/giada.webp','0a16e2382a20011f218fd85a4ff66b6b':'r4/project/assets/mats/night-citadel.webp','07f3a15c6673f372d33d5c76f0a7334b':'r4/project/assets/mats/ember-serpent.webp'};
(async () => {
  const b = await chromium.launch(); const names = process.argv.slice(2);
  for (const n of names) {
    const ctx = await b.newContext({ viewport: { width: n.startsWith('Cover') ? 960 : 1100, height: 300 } }); const p = await ctx.newPage();
    await p.route('**/_blob/*', r => { const id = r.request().url().split('/_blob/')[1]; r.fulfill({ path: S + BLOB[id] }); });
    const errs = []; p.on('requestfailed', r => errs.push(r.url()));
    await p.goto('http://localhost:8765/../ds/project/_harness/' + n + '.html').catch(()=>{});
    await p.goto('file://' + S + 'ds/project/_harness/' + n + '.html'); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(200);
    await p.screenshot({ path: S + 'dsp-' + n + '.png', fullPage: true }); if (errs.length) console.log(n, errs.slice(0,3));
    await ctx.close();
  }
  await b.close(); console.log('ok');
})();
