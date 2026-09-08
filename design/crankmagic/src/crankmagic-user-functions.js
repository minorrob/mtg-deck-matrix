/* The design study previews the existing Admin actions without touching user storage.
   The production build will use the shared state/export modules and explicit scope review. */
(()=>{
 const host=q('.v-user-functions'),button=q('#v-user-functions-button'),menu=q('#v-user-functions-menu');
 function close(restore=false){menu.hidden=true;button.setAttribute('aria-expanded','false');if(restore)button.focus();}
 button.onclick=()=>{const opening=menu.hidden;menu.hidden=!opening;button.setAttribute('aria-expanded',String(opening));if(opening)menu.querySelector('button:not(:disabled)').focus();};
 document.addEventListener('click',e=>{if(!host.contains(e.target))close();});
 host.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);}if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)&&!menu.hidden){e.preventDefault();const items=[...menu.querySelectorAll('button:not(:disabled)')],i=items.indexOf(document.activeElement);const n=e.key==='Home'?0:e.key==='End'?items.length-1:(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;items[n].focus();}});
 const descriptions={
  export:['Export a backup','One versioned JSON file will preserve your decks, exact owned copies and printings, orders, reservations, Collection groups, supplemental catalog, plans and history.'],
  import:['Import a backup','Choose a backup, validate its contents and review the replacement scope before restoring. Keep a recovery snapshot so a completed load can be undone.'],
  excel:['Export to Excel','Choose your card library, deck plans or current view. Include captured printing metadata, source, purpose, allocation and physical location, with clearly named sheets.'],
  default:['Load default','Preview the supplied example decks before loading. Example decklists do not establish ownership of any card. Existing records require an explicit replacement review.'],
  reset:['Reset picks','Review and reset deck picks, comments, purchase selections and filters. Your owned collection and added decks stay.'],
  clear:['Clear all data','Review all local CrankMagic records to be removed, including decks, owned copies, orders, groups and history. Offer a complete backup first, then require a separate confirmation. Only this app’s data is cleared.']
 };
 menu.addEventListener('click',e=>{const action=e.target.closest('[data-user-function]');if(!action||action.disabled)return;close();const [title,description]=descriptions[action.dataset.userFunction];const d=dialog(title,`<p class="v-dialog-note">${esc(description)}</p><p class="v-small">Design preview only. File operations and data reset will be connected during the approved build.</p>`);d.addEventListener('close',()=>button.focus(),{once:true});});
})();
