"""Extract the user-supplied game into a scoped, local-only arcade module.

Usage: python scripts/integrate_shore_cleaner.py path/to/shore-cleaner.html
The input is read as source, never executed. Product theme/mount are separate.
"""
from pathlib import Path
import hashlib
import json
import re
import sys

source = Path(sys.argv[1]).read_text(encoding='utf-8-sig')
root = Path(__file__).resolve().parents[1] / 'web/src/shore-cleaner'
root.mkdir(exist_ok=True)
style = re.search(r'<style>(.*?)</style>', source, re.S).group(1)
markup = re.search(r'<body>(.*?)<script>', source, re.S).group(1)
engine = re.search(r'<script>\s*\(\(\) => \{(.*?)\}\)\(\);\s*</script>', source, re.S).group(1)

# Keep source selectors inside Shadow DOM. The theme supplies the page styling.
style = re.sub(r':root\s*\{.*?\}', '', style, count=1, flags=re.S)
style = re.sub(r'html,body\s*\{.*?\}', '', style, count=1, flags=re.S)
style = re.sub(r'\bbody\s*\{.*?\}', '', style, count=1, flags=re.S)
markup = markup.replace('class="app"', 'class="shore-app"')
markup = re.sub(r'<div class="brand">.*?</div>\s*</div>', '', markup, count=1, flags=re.S)
markup = re.sub(r'<button class="btn" id="(?:admin|trade)-btn">.*?</button>', '', markup)
markup = re.sub(r'<div class="quests admin-panel".*?</div>', '', markup)
markup = markup.replace('🌐 Multiplayer', 'Local race')
markup = markup.replace('or hit <b>🌐 Multiplayer</b> for local 2P or cloud play', 'try the <b>local two-player race</b>')
markup = markup.replace('id="game" width', 'id="game" tabindex="0" role="application" aria-label="Shore Cleaner beach. Arrow keys or WASD move; click or drag to choose a destination. Bring your bag to the blue bin at the lower left. P pauses." width')
markup = markup.replace('Money</div>', 'Shore coins</div>').replace('id="sound-btn">🔊 Sound', 'id="sound-btn">Sound off')
markup = markup.replace('id="stat-collected">', 'id="stat-collected" aria-live="off">')
markup = markup.replace('<h2>Welcome to Shore Cleaner!</h2>', '<h2>Make room for a cleaner shore.</h2>')
markup = markup.replace('Keep the beach tidy — the sea creatures are counting on you!', 'A virtual cleanup adventure')
markup = markup.replace('P2: <kbd>I</kbd><kbd>J</kbd><kbd>K</kbd><kbd>L</kbd> in Battle', 'Local race P2: <kbd>I</kbd><kbd>J</kbd><kbd>K</kbd><kbd>L</kbd>')
(root/'view.js').write_text('// Adapted from the user-supplied Shore Cleaner HTML. Styles stay in Shadow DOM.\n'+
    'export const SHORE_MARKUP='+json.dumps(markup,ensure_ascii=False)+';\n'+
    'export const SHORE_BASE_STYLES='+json.dumps(style,ensure_ascii=False)+';\n',encoding='utf-8')

engine = engine.replace('document.getElementById(', 'root.getElementById(')
engine = engine.replace('  "use strict";', '')
engine = engine.replace('  const ctx = canvas.getContext("2d");','  const ctx = canvas.getContext("2d");\n  if (!ctx) throw new Error("Canvas 2D is unavailable in this browser.");')
engine = engine.replace('  const W = canvas.width, H = canvas.height;', '''  const W=820,H=600,pixelRatio=Math.min(2,window.devicePixelRatio||1);
  canvas.width=Math.round(W*pixelRatio);canvas.height=Math.round(H*pixelRatio);
  ctx.setTransform(pixelRatio,0,0,pixelRatio,0,0);''')
engine = engine.replace('money: 0,', 'money: 0,\n    recycled: 0,',1)
engine = engine.replace('soundOn = true', 'soundOn = false')
engine = engine.replace('      state.upgrades[u.id] = 0;', '      state.upgrades[u.id] ??= 0;')
engine = engine.replace('Trebuchet MS', 'Manrope')
engine = engine.replace('for (const k of PET_EXPORT_KEYS) o[k] = p[k];', 'for (const k of PET_EXPORT_KEYS) if(p[k]!==undefined) o[k] = p[k];')
engine = engine.replace('  // Owner-only admin code. Change this before sharing if you want a different one.\n  const ADMIN_CODE = "shore-owner-2026";\n', '')
start=engine.index('  // -------------------------------------------------------- Cloud multiplayer')
end=engine.index('  function updateAscendButton()',start)
engine=engine[:start]+'''  // Local two-player racing uses the existing keyboard simulation only.
  function openMultiplayerDialog() {
    if (!state.started) return;
    showDialog('<h2>Local two-player race</h2><p>Player one uses WASD or arrows; player two uses IJKL on the same keyboard. Race scores stay separate from your cleanup run.</p>',
      state.battle.active ? 'End race' : 'Start race', () => { if (state.battle.active) endBattle(true); else startBattle(); canvas.focus(); });
  }
  function cloudSend() {} // Legacy offline bookkeeping calls have no network side effects.
  function leaveCloud() {}

'''+engine[end:]
start=engine.index('  // -------------------------------------------------------- Admin mode')
end=engine.index('  function selectedEgg()',start)
engine=engine[:start]+engine[end:]
engine=re.sub(r'    admin: root\.getElementById\("admin-btn"\),\n|    adminPanel: root\.getElementById\("admin-panel"\),\n','',engine)
engine=engine.replace('  el.admin.addEventListener("click", toggleAdmin);\n','').replace('  el.tradeBtn.addEventListener("click", openTradeDialog);\n','')
engine=engine.replace('  buildAdminPanel();\n','')
engine=engine.replace('  const META_KEY = "shoreCleaner.meta.v1";\n','')
start=engine.index('  function loadMeta() {');end=engine.index('  function recordText(',start)
engine=engine[:start]+'''  let lastSave = -Infinity;
  const runFields = ['money','collected','recycled','bag','upgrades','ascensions','shards','lifetime','ascendProgress','eggs','player','zoneCollected'];
  function loadMeta() {
    const m=readShoreSave(storage);
    for (const key of ['records','achievements','collection']) if(m[key] && typeof m[key]==='object' && !Array.isArray(m[key])) state[key]=m[key];
    for (const key of ['relics','collectorXp','collectorLevel','lifetimeEggs']) if(Number.isFinite(m[key]) && m[key]>=0) state[key]=m[key];
    state.collectorLevel=Math.max(1,state.collectorLevel);
    if(Number.isFinite(m.bestMini))state.mini.best=m.bestMini;
    const run=m.run;
    if (!run) return;
    for(const key of runFields) {
      if(['bag','upgrades','player'].includes(key))continue;
      if(Number.isFinite(run[key]) && run[key]>=0)state[key]=run[key];
    }
    if(Array.isArray(run.bag))state.bag=run.bag.filter(item=>Number.isFinite(item?.value)&&item.value>=0).slice(0,100);
    for(const upgrade of UPGRADE_DEFS)if(Number.isFinite(run.upgrades?.[upgrade.id]))state.upgrades[upgrade.id]=Math.max(0,Math.min(upgrade.max,Math.floor(run.upgrades[upgrade.id])));
    if(Number.isFinite(run.player?.x)&&Number.isFinite(run.player?.y))Object.assign(state.player,{x:Math.max(24,Math.min(W-24,run.player.x)),y:Math.max(208,Math.min(H-26,run.player.y)),target:null});
    if(Array.isArray(run.petBox))state.petBox=run.petBox.slice(0,16).map(importPet).filter(Boolean);
    if(Array.isArray(run.equippedIndexes))for(const index of run.equippedIndexes)if(Number.isInteger(index))equipPet(state.petBox[index]);
    state.companion=state.equipped[0]||null;
  }
  function saveMeta(force=false) {
    const now=performance.now();if(!force&&now-lastSave<2500)return;
    lastSave=now;
    const run=Object.fromEntries(runFields.map(key=>[key,state[key]]));
    run.petBox=state.petBox.map(exportPet);run.equippedIndexes=state.equipped.map(pet=>state.petBox.indexOf(pet)).filter(index=>index>=0);
    const persisted=writeShoreSave(storage,{records:state.records,achievements:state.achievements,relics:state.relics,
      collectorXp:state.collectorXp,collectorLevel:state.collectorLevel,lifetimeEggs:state.lifetimeEggs,
      collection:state.collection,bestMini:state.mini.best,run});
    onSave?.(persisted);
  }
'''+engine[end:]
engine=engine.replace('    state.bag.length = 0;','    state.recycled += state.bag.length;\n    state.bag.length = 0;\n    onProgress?.({...getStatus(),reason:"deposit"});',1)
engine=engine.replace('    const k = e.key.toLowerCase();','''    const target=e.composedPath()[0];
    if(target!==canvas || e.ctrlKey || e.metaKey || e.altKey || e.repeat)return;
    const k = e.key.toLowerCase();''',1)
engine=engine.replace('    const pt = canvasPoint(e);','    if(e.isPrimary===false || e.button!==0)return;\n    canvas.focus();\n    const pt = canvasPoint(e);',1)
engine=engine.replace('    state.started = true; state.paused = false;','    state.started = true; state.paused = false;\n    canvas.focus();',1)
engine=engine.replace('soundOn ? "🔊 Sound" : "🔇 Muted"','soundOn ? "Sound on" : "Sound off"')
engine=engine.replace('    state.paused = !state.paused;','    state.paused = !state.paused;\n    saveMeta(true);',1)
engine=engine.replace('      pips.innerHTML = "";\n      for (let i = 0; i < u.max; i++) {', '''      if(pips.dataset.level!==String(l)) {
      pips.replaceChildren();pips.dataset.level=String(l);
      for (let i = 0; i < u.max; i++) {''')
engine=engine.replace('        pips.appendChild(p);\n      }','        pips.appendChild(p);\n      }\n      }',1)
engine=engine.replace('  let last = performance.now(), hudTick = 0;','  let last = null, hudTick = 0;')
engine=engine.replace('    const dt = Math.min(0.05, (now - last) / 1000);','    if(!alive)return;\n    const dt = last===null?0:Math.min(0.05, Math.max(0,(now-last)/1000));')
engine=engine.replace('if (state.started && !state.paused) update(dt);','if (state.started && !state.paused && el.dialog.classList.contains("hidden")) update(dt);')
engine=re.sub(r'(card\.querySelector\("button"\)|[\w.]+)\.addEventListener\(',r'listen(\1,',engine)
engine=re.sub(r'\bsetTimeout\(', 'schedule(',engine)
engine=re.sub(r'\brequestAnimationFrame\(', 'scheduleFrame(',engine)
prefix='''// Adapted from the user-supplied Shore Cleaner game; original mechanics retained.
import {readShoreSave,writeShoreSave} from './storage.js';
export function startShoreCleaner(root,{storage,onProgress,onSave}={}) {
  const document=root.ownerDocument,window=document.defaultView,performance=window.performance;
  const events=new window.AbortController(),timers=new Set();let alive=true,animation=null;
  function listen(target,type,callback,options={}){target.addEventListener(type,callback,{...options,signal:events.signal});}
  function schedule(callback,delay){const id=window.setTimeout(()=>{timers.delete(id);if(alive)callback();},delay);timers.add(id);return id;}
  function scheduleFrame(callback){if(alive)animation=window.requestAnimationFrame(callback);}
'''
suffix='''
  function getStatus(){return {started:state.started,paused:state.paused,collected:state.collected,recycled:state.recycled,
    money:state.money,bagCount:state.bag.length,player:{x:state.player.x,y:state.player.y}};}
  function clearKeys(){for(const key of Object.keys(keys))delete keys[key];}
  listen(canvas,'blur',clearKeys);
  listen(window,'blur',()=>{clearKeys();if(state.started&&!state.paused){state.paused=true;el.pause.textContent='Resume';saveMeta(true);}});
  listen(document,'visibilitychange',()=>{if(document.hidden){clearKeys();if(state.started&&!state.paused){state.paused=true;el.pause.textContent='Resume';saveMeta(true);}}});
  return {getStatus,destroy(){if(!alive)return;saveMeta(true);alive=false;events.abort();window.cancelAnimationFrame(animation);
    for(const timer of timers)window.clearTimeout(timer);timers.clear();clearKeys();
    try{audioCtx?.close()?.catch(()=>{});}catch{} }};
}
'''
(root/'engine.js').write_text(prefix+engine+suffix,encoding='utf-8')
(root/'provenance.json').write_text(json.dumps({'source':'User-supplied shore-cleaner.html','sha256':hashlib.sha256(Path(sys.argv[1]).read_bytes()).hexdigest(),'integration':'Native scoped arcade module; original beach drawing/gameplay retained, cloud/admin entry points removed and lifecycle/persistence hooks added.'},indent=2),encoding='utf-8')
print('Extracted scoped game source:',len(engine),'characters')
