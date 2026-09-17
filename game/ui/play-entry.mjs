// Conditional module loader for /play path
// Guest /play → lightweight guest-live.mjs
// Host/recorded → full review.mjs with workshop features
if(location.pathname==='/play'||location.pathname==='/play/'){
  import('/guest-live.mjs');
}else{
  import('/review.mjs');
}
