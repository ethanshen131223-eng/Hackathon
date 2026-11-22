import {startShoreCleaner} from './shore-cleaner/engine.js';
import {SHORE_MARKUP,SHORE_BASE_STYLES} from './shore-cleaner/view.js';
import {SHORE_THEME} from './shore-cleaner/theme.js';

export function mountShoreCleaner(container,{onAward=()=>({reward:0}),notify=()=>{},navigate=()=>{},storage}={}) {
  const document=container.ownerDocument,window=document.defaultView,events=new window.AbortController();
  const options={signal:events.signal};let engine=null,alive=true,claimed=false,reportedStorage=false;
  if(storage===undefined){try{storage=window.localStorage;}catch{storage=null;}}
  const el=(tag,className='',text='')=>{const node=document.createElement(tag);node.className=className;node.textContent=text;return node;};
  const section=el('section','shore-cleaner-page');
  const top=el('div','shore-heading'),words=el('div');words.append(el('h1','','Shore Cleaner'),el('p','muted','A little beach time. A lot of things to discover.'));
  const back=el('button','button button-secondary','Back to arcade');back.type='button';back.addEventListener('click',()=>navigate('play'),options);top.append(words,back);
  const info=el('div','shore-game-info');info.append(el('strong','','Walk, collect, recycle.'),el('p','','Move with arrows, WASD, or click and drag. Bring your bag to the blue bin at the lower left. Shore coins buy upgrades here; sand dollars belong to your MarineGUARDer collection.'));
  const reward=el('p','shore-reward-status','Recycle 10 virtual items to earn up to 5 sand dollars once per day.');reward.setAttribute('role','status');
  const host=el('div','shore-game-host'),shadow=host.attachShadow({mode:'open'}),styles=document.createElement('style');
  styles.textContent=SHORE_BASE_STYLES+SHORE_THEME;shadow.innerHTML=SHORE_MARKUP;shadow.prepend(styles);
  const storageNote=el('p','shore-storage-note','Run progress, records and discoveries are saved in this browser.');
  const note=el('p','shore-simulation-note','This is a virtual cleanup game. Companions and hazards are fictional arcade mechanics; playing does not remove real debris or measure environmental recovery.');
  section.append(top,info,reward,host,storageNote,note);container.replaceChildren(section);

  const stats=shadow.querySelector('.stats'),header=shadow.querySelector('header');
  const extra=el('details','run-details'),summary=el('summary','','More progress'),secondary=el('div','stats stats-secondary');
  [...stats.children].forEach((stat,index)=>{if(![0,1,2,5].includes(index))secondary.append(stat);});extra.append(summary,secondary);header.append(extra);
  const stage=shadow.querySelector('.stage'),stagebar=shadow.querySelector('.stage-bar');
  const primary=el('div','primary-controls'),hint=el('span','hint','Click the beach to move. Deposit at the blue bin.'),buttons=el('div','buttons');
  buttons.append(shadow.getElementById('pause-btn'),shadow.getElementById('sound-btn'));primary.append(hint,buttons);stage.prepend(primary);
  const activities=el('details','activities');activities.append(el('summary','','Controls & more activities'),stagebar);stage.append(activities);
  const shop=shadow.querySelector('.shop'),tabs=el('div','shop-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Shore Cleaner panels');
  shop.querySelector('h2').textContent='Your beach station';shop.querySelector('.sub').textContent='Spend shore coins, meet companions, and keep your cleanup moving.';
  const panes=[];shop.insertBefore(tabs,shadow.getElementById('hatch-panel'));
  for(const [index,[name,ids]]of [['Upgrades',['shop-list']],['Companions',['hatch-panel','petbox-panel']],['Quests',['quest-panel']]].entries()){
    const tab=el('button','',name),pane=el('section','shop-pane');tab.type='button';tab.id=`shore-tab-${index}`;tab.setAttribute('role','tab');tab.setAttribute('aria-controls',`shore-pane-${index}`);
    pane.id=`shore-pane-${index}`;pane.setAttribute('role','tabpanel');pane.setAttribute('aria-labelledby',tab.id);
    for(const id of ids)pane.append(shadow.getElementById(id));
    tabs.append(tab);shop.append(pane);panes.push({tab,pane});
    tab.addEventListener('click',()=>selectPanel(index),options);
    tab.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?2:(index+(event.key==='ArrowRight'?1:2))%3;selectPanel(next);panes[next].tab.focus();}},options);
  }
  function selectPanel(index){panes.forEach(({tab,pane},i)=>{tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1;pane.hidden=i!==index;});}
  selectPanel(0);

  const startModal=shadow.getElementById('start-overlay'),dialog=shadow.getElementById('dialog-overlay');
  for(const overlay of [startModal,dialog]){const modal=overlay.querySelector('.modal');modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label',overlay===startModal?'Start Shore Cleaner':'Shore Cleaner activity');}
  const observer=new window.MutationObserver(records=>{
    if(!alive)return;
    for(const record of records){if(record.target===dialog&&!dialog.classList.contains('hidden'))dialog.querySelector('button,input,select')?.focus();}
  });observer.observe(dialog,{attributes:true,attributeFilter:['class']});
  shadow.addEventListener('keydown',event=>{
    const overlay=!dialog.classList.contains('hidden')?dialog:!startModal.classList.contains('hidden')?startModal:null;if(!overlay)return;
    if(event.key==='Escape'&&overlay===dialog){event.preventDefault();dialog.classList.add('hidden');shadow.getElementById('game').focus();return;}
    if(event.key==='Tab'){
      const controls=[...overlay.querySelectorAll('button,input,select,[tabindex="0"]')].filter(node=>!node.disabled);
      const first=controls[0],last=controls.at(-1);if(!first)return;
      if(event.shiftKey&&shadow.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&shadow.activeElement===last){event.preventDefault();first.focus();}
    }
  },options);
  try {
    engine=startShoreCleaner(shadow,{storage,
      onProgress(status){
        if(!alive)return;
        if(!claimed&&status.reason==='deposit'&&status.recycled>=10){
          claimed=true;const result=onAward('shore-cleaner')??{};
          reward.textContent=result.reward?`Beach goal reached! +${result.reward} sand dollars.`:'Beach goal reached. Today’s Shore Cleaner reward has already been collected; keep playing for shore coins and discoveries.';
          if(result.reward)notify(`Shore Cleaner complete! +${result.reward} sand dollars.`);
        }else if(!claimed)reward.textContent=`${status.recycled} / 10 virtual items recycled. Reach 10 for up to 5 daily sand dollars.`;
      },
      onSave(persisted){if(!persisted&&!reportedStorage){reportedStorage=true;storageNote.textContent='Browser storage is unavailable. This run is temporary and cannot be restored after you leave.';}},
    });
  }catch{
    observer.disconnect();events.abort();host.replaceWith(el('p','notice notice-warning','Canvas drawing is unavailable in this browser. Try a browser with Canvas 2D enabled, or return to the arcade.'));
    // The parent route remains usable even when the canvas cannot initialize.
    back.addEventListener('click',()=>navigate('play'));
  }
  return ()=>{if(!alive)return;alive=false;engine?.destroy();observer.disconnect();events.abort();};
}
