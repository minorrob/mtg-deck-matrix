/* HOW A DECK COMES TOGETHER. One screen, reached from a plain link beside "Your decks": the
   six steps as a flow, and the card status ladder as a line. Each step's title is the way
   in to that step. The first step is split -- build one in the Deck Lab, or bring one you
   already have -- and the two halves meet at the second. Few words, none of them the game's
   own jargon, so a reader who has never sleeved a deck can follow it. */
(globalThis.CrankFeatures ||= []).push(function(C){const {esc:e,views}=C;
const STEPS=[
  {n:2,title:'Test',href:'#lab',text:'Measure it in Build. Swap what underperforms.'},
  {n:3,title:'Lock the list',href:'#decks',text:'Lock in the hundred. Note upgrades to try later.'},
  {n:4,title:'Acquire',href:'#cards?tab=buy',text:'Buy or order what you don’t own, inside the budget.'},
  {n:5,title:'Assemble',href:'#cards',text:'Add the cards you own to the physical deck. Substitutes hold seats until the real ones arrive.'},
  {n:6,title:'Play',href:'#decks',text:'All 100 in the physical deck: the deck is done. Log your games.'}];
/* The card status (docs/card-states.md, Rob 2026-10-18): the ownership a card climbs, then the uses that bring it into a
   deck -- Upgrade and Reserved on the way, Final and Substitute in the box, the only two that count toward the hundred. */
const LADDER=[['Watch','Looked at, not decided. No copy yet.'],['To buy','Decided: on your To Buy list, or a deck\u2019s Reserved card.'],['Ordered','Bought, not yet in hand.'],['Own','In hand: on the Bench, Loading into a deck, or in its box.'],['Upgrade','Being considered to improve a deck. It names the card it would replace and changes nothing until you reserve it.'],['Reserved','Committed to take a seat: to buy, ordered, or in another deck\u2019s box. The card it replaces stays in the box as its Substitute.'],['Substitute','In the box, holding a Reserved card\u2019s seat. It counts toward the hundred.'],['Final','The list\u2019s own card, in the deck\u2019s box. Final and Substitute are the hundred you play.']];
views.how=async()=>{
  C.main.innerHTML=C.pageHead('How a deck comes together',`<a class="v-button" href="#decks">Back to Decks</a>`)
   +`<ol class="cm-how-flow" aria-label="The six steps">
      <li class="cm-how-step cm-how-split">
        <a class="cm-how-path cm-how-path-a" href="#lab"><strong>Build one</strong><span>Pick a commander. Build drafts the other 99.</span></a>
        <span class="cm-how-node cm-how-node-split" aria-hidden="true">1</span>
        <a class="cm-how-path cm-how-path-b" href="#decks"><strong>Bring one</strong><span>Create a deck and paste a list you already have.</span></a>
        <p class="cm-how-shared">Either way: name it, set the bracket and the budget.</p>
      </li>
      ${STEPS.map(s=>`<li class="cm-how-step"><span class="cm-how-above"></span><span class="cm-how-node${s.n===6?' cm-how-node-done':''}" aria-hidden="true">${s.n}</span><a class="cm-how-title" href="${e(s.href)}">${e(s.title)}</a><p>${e(s.text)}</p></li>`).join('')}
    </ol>
    <section class="cm-how-ladder" aria-label="What a card's status means">
      <h2>A card’s status, in order</h2>
      <ol class="cm-how-rungs">${LADDER.map(([k,t])=>`<li><strong>${e(k)}</strong><span>${e(t)}</span></li>`).join('')}</ol>
      <p class="cm-muted cm-how-note">A <strong>Substitute</strong> is an owned card in a deck’s box, holding a Reserved card’s seat until it arrives. The <strong>Bench</strong> is every owned card that is for no deck.</p>
    </section>`;
};
});
