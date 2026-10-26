/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* CH-52 presentation only. The board owns availability, messages, requests, draft, caret and scroll restoration. */
(() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const list = value => Array.isArray(value) ? value : [];
  const button = (label, action, index) => `<button type="button" class="v-button compact" data-action="${action}"${index === undefined ? '' : ` data-i="${index}"`}>${label}</button>`;
  const said = text => esc(text).replace(/\[\[([^\]]{1,200})\]\]/g, '<b>$1</b>');
  function extras(message, index, tableId) {
    if (message.signIn) return `<div class="cm-coach-chips"><a class="v-button compact" href="/api/ai/login?to=${encodeURIComponent(`#table?id=${tableId}`)}">Sign in to the Coach</a></div>`;
    const controls = [list(message.show).length ? button('Show me', 'board-coach-show', index) : '',
      list(message.plays).length || message.threat ? button(message.open ? 'Hide why' : 'Why?', 'board-coach-why', index) : ''].join('');
    const why = message.open ? `<ul class="cm-coach-why">${list(message.plays).map(play => `<li><b>${esc(play.action)} ${esc(play.card)}</b> · ${esc(play.why)}</li>`).join('')}${message.threat ? `<li><b>The threat: ${esc(message.threat.seat)}</b> · ${esc(message.threat.why)}</li>` : ''}</ul>` : '';
    return controls ? `<div class="cm-coach-chips">${controls}</div>${why}` : '';
  }
  function render({open = true, available = false, thread = [], typing = false, prompts = [], moreOpen = false, questionsOpen = false, tableId = '', context = ''} = {}) {
    if (!open) return '';
    const header = `<header class="cm-coach-head"><h2 class="cm-section-title">CrankMagic Coach</h2><details class="cm-coach-more"${moreOpen ? ' open' : ''}><summary aria-label="More Coach options" aria-expanded="${!!moreOpen}">⋯</summary><div>${button('Clear chat', 'board-coach-clear')}</div></details><button type="button" class="v-button compact" data-action="board-coach" aria-label="Close the Coach">✕</button></header>`;
    if (available !== true) return header + `<section class="cm-coach-unavailable"><p>The Coach isn't at this table yet. Rules help and bound keys are under Help.</p><a class="v-button compact" href="#help">Help</a></section>`;
    const bubbles = list(thread).map((message, index) => message.divider ? `<li class="cm-coach-divider"><span>${esc(message.divider)}</span></li>`
      : message.from === 'coach' ? `<li class="cm-coach-msg is-coach"><span class="cm-coach-avatar" aria-hidden="true">✦</span><div class="cm-coach-said"><p>${said(message.text)}</p>${extras(message, index, tableId)}</div></li>`
      : `<li class="cm-coach-msg is-${message.from === 'you' ? 'you' : 'system'}"><p>${esc(message.text)}</p></li>`).join('');
    const questions = list(prompts).length ? `<details class="cm-coach-questions"${questionsOpen ? ' open' : ''}><summary aria-expanded="${!!questionsOpen}" aria-controls="cm-coach-question-list">Questions to Ask <span aria-hidden="true">▴</span></summary><div class="cm-coach-question-list" id="cm-coach-question-list">${list(prompts).map(question => `<button type="button" data-action="board-coach-ask" data-q="${esc(question)}">${esc(question)}</button>`).join('')}</div></details>` : '';
    return header + `<ol class="cm-coach-thread" aria-label="Coach conversation">${bubbles || '<li class="cm-coach-empty cm-muted">Ask about your board, your hand, or the table.</li>'}${typing ? '<li class="cm-coach-msg is-coach is-typing" role="status" aria-label="The Coach is typing"><p><i></i><i></i><i></i></p></li>' : ''}</ol><p class="cm-coach-context cm-muted" id="cm-coach-context">${esc(context)}</p>${questions}<form class="cm-coach-compose" data-coach-form><textarea class="cm-coach-input" rows="1" placeholder="Ask the coach…" aria-label="Ask the coach" aria-describedby="cm-coach-context"></textarea><button type="submit" class="cm-coach-send" aria-label="Send">➤</button></form>`;
  }
  const bound = new WeakSet();
  function bind(panel) {
    if (!panel) return;
    const sync = () => panel.querySelectorAll('.cm-coach-questions, .cm-coach-more').forEach(details => details.querySelector('summary')?.setAttribute('aria-expanded', String(details.open)));
    sync();
    if (bound.has(panel)) return;
    bound.add(panel);
    panel.addEventListener('toggle', sync, true);
    panel.addEventListener('keydown', event => {
      const details = event.target.closest?.('.cm-coach-questions, .cm-coach-more');
      if (event.key !== 'Escape' || !details?.open) return;
      event.preventDefault(); event.stopPropagation(); details.open = false; sync(); details.querySelector('summary')?.focus();
    });
    panel.addEventListener('click', event => {
      const prompt = event.target.closest?.('[data-action="board-coach-ask"]');
      const details = prompt?.closest('.cm-coach-questions');
      if (details) {details.open = false; sync(); panel.querySelector('.cm-coach-input')?.focus();}
    });
  }
  globalThis.CrankCoach = Object.freeze({render, bind});
})();
