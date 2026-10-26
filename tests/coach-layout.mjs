/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* Isolated presenter fixture: no account, table, provider or external network. Board state is intentionally absent. */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {openBrowser} from './uat/browser-runner.mjs';
const {browser, base, close} = await openBrowser({name:'coach-layout',flag:'GEOMETRY_REQUIRED'});
let checks = 0;
const ok = (value, message) => {assert.ok(value, message); checks++;};
const eq = (actual, expected, message) => {assert.deepEqual(actual, expected, message); checks++;};
const context = await browser.newContext({viewport:{width:800,height:700},reducedMotion:'reduce',serviceWorkers:'block'});
const page = await context.newPage(), errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route(`${base}/coach-fixture`, route => route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="crankmagic-design.css"><link rel="stylesheet" href="crankmagic.css"><link rel="stylesheet" href="crankmagic-stage.css"><link rel="stylesheet" href="crankmagic-coach.css"><script src="crankmagic-coach.js"></script></head><body><main id="matrix-v2"><aside class="cm-board-coach is-module" id="cm-board-coach" style="width:320px;height:440px"></aside></main></body></html>`}));
try {
  await page.goto(`${base}/coach-fixture`);
  await page.evaluate(() => document.fonts.ready);
  for (const skin of ['sapphire-obsidian','bronze-basalt','chalk-coal']) for (const register of ['dark','light']) for (const width of [320,240]) {
    await page.evaluate(({skin,register,width}) => {
      for(const root of [document.documentElement,document.getElementById('matrix-v2')]) {root.dataset.palette=skin;root.dataset.theme=register;}
      const host = document.getElementById('cm-board-coach'); host.style.width = `${width}px`;
      host.innerHTML = CrankCoach.render({available:true,context:'Sees your board (your hand withheld)',prompts:['Explain the stack','What can I cast?','Which seat is the threat?'],thread:[{from:'you',text:'Help me understand this turn.'},{from:'coach',text:'Read [[Sol Ring]] on your board.'}]});
      CrankCoach.bind(host); CrankCoach.bind(host);
    }, {skin,register,width});
    await page.evaluate(() => document.fonts.ready);
    const head = await page.locator('.cm-coach-head').boundingBox();
    eq(head.height,36,`${skin}/${register}/${width}: compact header is exactly 36px`);
    const title = await page.locator('.cm-coach-head h2').evaluate(el => ({lines:el.getBoundingClientRect().height/parseFloat(getComputedStyle(el).lineHeight),fits:el.scrollWidth <= el.clientWidth+1,text:el.textContent,family:getComputedStyle(el).fontFamily,weight:getComputedStyle(el).fontWeight}));
    ok(title.lines <= 1.05 && title.fits && title.text === 'CrankMagic Coach' && title.family.includes('Lato') && title.weight === '700',`${skin}/${register}/${width}: whole title stays on one line`);
    const summary = page.locator('.cm-coach-questions>summary'), input = page.locator('.cm-coach-input');
    await input.fill('Draft stays here');
    const before = await input.boundingBox();
    await summary.focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('.cm-coach-questions>summary').getAttribute('aria-expanded') === 'true');
    eq(await input.boundingBox(),before,`${skin}/${register}/${width}: opening Questions does not move the composer`);
    const geometry = await page.evaluate(() => {const head=document.querySelector('.cm-coach-questions>summary'),list=document.querySelector('.cm-coach-question-list'),row=list.querySelector('button');return {summary:head.getBoundingClientRect().height,upward:list.getBoundingClientRect().bottom<=head.getBoundingClientRect().top+1,row:row.getBoundingClientRect().height,font:parseFloat(getComputedStyle(row).fontSize)};});
    eq([geometry.summary,geometry.upward,geometry.row],[22,true,30],`${skin}/${register}/${width}: 22px disclosure overlays upward with 30px question rows`);
    const contrasts = await page.evaluate(() => {
      const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');
      const rgb=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].slice(0,3).map(n=>n/255);};
      const luminance=color=>rgb(color).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
      const panel=getComputedStyle(document.getElementById('cm-board-coach')),background=luminance(panel.backgroundColor);
      return ['.cm-coach-question-list>button','.cm-coach-context','.cm-coach-head h2'].map(selector=>{const foreground=luminance(getComputedStyle(document.querySelector(selector)).color);return (Math.max(background,foreground)+.05)/(Math.min(background,foreground)+.05);});
    });
    ok(contrasts.every(ratio=>ratio>=4.5),`${skin}/${register}/${width}: question, sharing context and header text meet 4.5:1 contrast`);
    ok(geometry.font>=12,`${skin}/${register}/${width}: question text respects its floor`);
    await page.keyboard.press('Escape');
    eq(await summary.getAttribute('aria-expanded'),'false',`${skin}/${register}/${width}: Escape closes the overlay`);
    ok(await summary.evaluate(el=>el===document.activeElement),`${skin}/${register}/${width}: Escape restores summary focus`);
    await page.keyboard.press('Space');
    await page.waitForFunction(() => document.querySelector('.cm-coach-questions').open);
    await page.getByRole('button',{name:'Explain the stack',exact:true}).click();
    eq(await summary.getAttribute('aria-expanded'),'false',`${skin}/${register}/${width}: selection folds the questions`);
    ok(await input.evaluate(el=>el===document.activeElement),`${skin}/${register}/${width}: choosing a question returns focus to composer`);
    eq(await input.inputValue(),'Draft stays here',`${skin}/${register}/${width}: local disclosure events retain draft`);
    if (process.env.UAT_SHOTS) {mkdirSync(process.env.UAT_SHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.UAT_SHOTS,`coach-${skin}-${register}-${width}.png`)});}
  }
  await page.evaluate(() => {const host=document.getElementById('cm-board-coach');host.innerHTML=CrankCoach.render({available:false});CrankCoach.bind(host);});
  eq(await page.locator('textarea').count(),0,'unavailable backend has no composer in the real DOM');
  eq(await page.getByRole('link',{name:'Help',exact:true}).getAttribute('href'),'#help','unavailable backend exposes the real Help path');
  eq(errors,[],'the presenter fixture has no browser exceptions');
  console.log(`coach-layout: ${checks} checks passed`);
} finally {await context.close();await close();}
