/* ABOUT DECK BUILDING (Rob, 2026-10-23: the Decks requirements' ABT-1 to ABT-5, renamed from "How a deck comes together").
   One screen, at #about-deck-building (#how still opens it): the steps as a flow, the four deck stages, the card status
   ladder and the two tools that work across decks. Each step's title is the way in to that step. The first step is
   split -- build one in the Lab, bring a list, or create one -- and the paths meet at the second. Few words, none of
   them the game's own jargon. The stage words and the ladder come from the model (deckStatus, M.LADDER), so a label
   changed there changes here. */
(globalThis.CrankFeatures ||= []).push(function(C){const {M,esc:e,views}=C;
const TITLE='About Deck Building';
const STEPS=[
  {n:2,title:'Building',href:'#decks?stage=building',text:'Fill the seats. Test it in the Lab and swap what underperforms.'},
  {n:3,title:'Defined',href:'#decks?stage=defined',text:'All 100 seats are on the list. Lock list when it’s right; that puts what’s missing on the buy list.'},
  {n:4,title:'Acquire',href:'#cards?tab=buy',text:'Buy or order what’s Reserved · To buy, inside the budget.'},
  {n:5,title:'Box',href:'#decks',text:'Put owned cards in the physical box, one by one in Planned Changes or a whole deck at once with Box deck. Substitutes hold seats until the real cards arrive.'},
  {n:6,title:'Boxed and Playable',href:'#decks?stage=boxed',text:'Boxed when 100 are in the box. Playable when the table knows every card. Log your games.'}];
views['about-deck-building']=async()=>{
  C.main.innerHTML=C.pageHead(TITLE,`<a class="v-button" href="#decks">Back to Decks</a>`)
   +`<ol class="cm-how-flow" aria-label="The steps">
      <li class="cm-how-step cm-how-split">
        <a class="cm-how-path cm-how-path-a" href="#lab"><strong>Build one</strong><span>Pick a commander in the Lab.</span></a>
        <span class="cm-how-node cm-how-node-split" aria-hidden="true">1</span>
        <a class="cm-how-path cm-how-path-b" href="#new"><strong>Bring a list, or create one</strong><span>Import a list, or start from a commander.</span></a>
        <p class="cm-how-shared">Either way: name it, set the bracket and the budget.</p>
      </li>
      ${STEPS.map(s=>`<li class="cm-how-step"><span class="cm-how-above"></span><span class="cm-how-node${s.n===6?' cm-how-node-done':''}" aria-hidden="true">${s.n}</span><a class="cm-how-title" href="${e(s.href)}">${e(s.title)}</a><p>${e(s.text)}</p></li>`).join('')}
    </ol>
    <section class="cm-how-ladder cm-how-stages" aria-label="A deck's stage" id="cm-how-stages">
      <h2>A deck’s stage</h2>
      <ol class="cm-how-rungs">${M.STAGES.map(x=>`<li><strong>${e(x.label)}</strong><span>${e(x.text)}</span></li>`).join('')}</ol>
      <p class="cm-muted cm-how-note">Every deck is Building or Defined. Boxed and Playable are both kinds of Defined, and a deck can be both.</p>
    </section>
    <section class="cm-how-ladder" aria-label="What a card's status means" id="cm-how-ladder">
      <h2>A card’s status, in order</h2>
      <ol class="cm-how-rungs">${M.LADDER.map(x=>`<li><strong>${e(x.label)}</strong><span>${e(x.text)}</span></li>`).join('')}</ol>
      <p class="cm-muted cm-how-note">The <strong>Bench</strong> is every owned card that is for no deck.</p>
    </section>
    <section class="cm-how-ladder cm-how-across" aria-label="Across decks" id="cm-how-across">
      <h2>Across decks</h2>
      <ul class="cm-how-rungs">
        <li><strong>Bulk actions</strong><span>Tick decks on the Decks page to compare, box, group, favorite or remove them together.</span></li>
        <li><strong>Favorites</strong><span>Star a deck to keep it at hand under Favorites.</span></li>
      </ul>
    </section>`;
};
/* The old address still opens the page (ABT-2). */
views.how=views['about-deck-building'];
});
