/* Picks the skin and register from the query string: ?skin=sapphire-obsidian|bronze-basalt|chalk-coal&theme=dark|light&hud=1|1.25|1.5|2
   Loaded in <head> after styles.css; swaps the colors file only, because a skin is colors only. */
(function(){
  var q = new URLSearchParams(location.search), skin = q.get('skin') || 'sapphire-obsidian', theme = q.get('theme') || 'dark', root = document.currentScript.dataset.root || '..';
  document.documentElement.dataset.theme = theme; document.documentElement.dataset.palette = skin;
  if (q.get('hud')) document.documentElement.style.setProperty('--hud-scale', q.get('hud'));
  if (skin !== 'sapphire-obsidian') document.write('<link rel="stylesheet" href="' + root + '/design-systems/' + skin + '/tokens/colors.css">');
})();
