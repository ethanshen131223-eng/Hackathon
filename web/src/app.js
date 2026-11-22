import {CASES, classifySize, dailyCase, hitTest, scoreFindings} from './case-content.js';
import {loadProfile, saveProfile, completeCase, claimDaily, awardGame, buyCosmetic, equipCosmetic, SHOP, dateKey} from './progress.js';
import {mountWorkbench, mountCreator} from './workbench.js';
import {listLocalCases, listLocalPuzzles} from './local-cases.js';
import {EVIDENCE_CHOICES,EVIDENCE_LIMITS,checkReasoning} from './case-reasoning.js';
import {matchOutline} from './outlines.js';
import {mountOutlineTools} from './outline-tools.js';
import {hostedDocument,chooseHostedCase} from './hosted-data.js';
import {mountShoreCleaner} from './shore-cleaner.js';
import './app.css';
import './bottom-bar.css';

const main = document.getElementById('main-content');
let profile = loadProfile(), toastTimer, cleanup = null, routeVersion = 0;
const recentCases = [];
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
};
const button = (text, action, type = 'primary') => {
  const b = el('button', `button button-${type}`, text); b.type = 'button'; b.onclick = action; return b;
};
const link = (text, href, type = 'primary') => {
  const a = el('a', `button button-${type}`, text); a.href = href; return a;
};
const sourceLink = (text, href) => {
  const a = el('a', '', text); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a;
};
const image = (url, alt, className) => {
  const img = el('img', className); img.src = url; img.alt = alt; return img;
};
function notify(message) {
  const toast = document.getElementById('app-toast'); clearTimeout(toastTimer);
  toast.textContent = message; toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 5500);
}
function save(next) {
  profile = next;
  const result = saveProfile(profile);
  document.getElementById('wallet-balance').textContent = String(profile.balance);
  const cosmetic = SHOP.find(item => item.id === profile.equippedCosmetic);
  document.documentElement.style.setProperty('--personal-accent', cosmetic?.accent ?? '#1fb4ad');
  if (!result.persisted) notify('Progress is kept for this session. Browser storage is unavailable.');
  return result;
}
function navigate(route) { location.hash = route; }
function heading(title, description) {
  const h = el('div', 'page-heading'); h.append(el('h1', '', title), el('p', '', description)); return h;
}
function sectionHeading(title, description, action) {
  const h = el('div', 'section-heading'), words = el('div');
  words.append(el('h2', '', title)); if (description) words.append(el('p', '', description)); h.append(words);
  if (action) h.append(action); return h;
}
function caseCard(item) {
  const index = CASES.indexOf(item);
  const mission = [{title:'Surface scout',difficulty:'Beginner',key:'beginner',count:'1–3'}, {title:'Follow the drift',difficulty:'Explorer',key:'explorer',count:'4–6'}, {title:'Keen-eye challenge',difficulty:'Challenge',key:'challenge',count:'7–12'}][index];
  const card = el('article', 'case-card'), body = el('div', 'case-card-content');
  card.append(image(item.sceneUrl, `${item.title}: FML open-dataset photo`, 'case-cover'));
  const meta = el('div', 'case-meta');
  meta.append(el('span', 'tag', mission.difficulty), el('span', '', `${mission.count} regions`));
  body.append(meta, el('h3', '', mission.title), el('p', '', 'Open a random real FML photo and match the researchers’ litter annotations. A new photo each visit.'));
  const bottom = el('div', 'card-bottom');
  bottom.append(link('Draw a field photo', `#case/random-${mission.key}`, 'secondary'), el('span', 'reward-note', '+20 for an unseen photo'));
  body.append(bottom); card.append(body); return card;
}
function stats() {
  const strip = el('div', 'stats-strip');
  for (const [icon, value, label] of [['⌕', Object.keys(profile.completedCases).length, 'cases completed'], ['✦', profile.balance, 'sand dollars'], ['♧', profile.streak, 'day streak']]) {
    const item = el('div', 'stat'), words = el('div');
    words.append(el('strong', 'stat-value', value), el('small', '', label)); item.append(el('span', 'stat-icon', icon), words); strip.append(item);
  }
  return strip;
}
function renderHome() {
  const welcome = el('div', 'welcome-line');
  welcome.append(el('p', '', 'Your ocean field station'), el('span', 'welcome-tag', 'Observe. Identify. Understand.'));
  const hero = el('section', 'hero'), copy = el('div', 'hero-copy'), art = el('div', 'hero-art');
  copy.append(el('h1', '', 'Ocean Explorer'), el('p', '', 'Explore where floating plastic has been recorded, discover marine protected areas, and compare sites for a shoreline cleanup.'));
  const actions = el('div', 'hero-actions');
  actions.append(link('Open Ocean Explorer', '/map.html', 'light'), link('Start a field case', '#case/random-beginner', 'ghost')); copy.append(actions);
  const preview = el('a', 'hero-map-preview');
  preview.href = '/map.html';
  preview.setAttribute('aria-label', 'Open Ocean Explorer map');
  preview.append(image('/globe/earth-map.jpg', '', 'hero-map-base'),
    image('/hosted/global-plastic-2014.png', '', 'hero-map-overlay'),
    el('span', 'hero-map-caption', 'Modeled surface microplastics · 2014'));
  art.append(preview);
  hero.append(copy, art); main.append(welcome, hero, stats());
  main.append(sectionHeading('Choose your next field case', 'Short, guided investigations. No expertise needed.', link('View all cases', '#cases', 'secondary')));
  const grid = el('div', 'case-grid'); CASES.forEach(item => grid.append(caseCard(item))); main.append(grid);
  const daily = el('section', 'daily-banner'), words = el('div');
  words.append(el('h2', '', 'A little observation, every day.'), el('p', '', 'Find the pollution in today’s scene. Keep a streak and earn more sand dollars as you learn.'));
  daily.append(words, link(profile.lastDailyDate === dateKey() ? 'Practice today’s puzzle' : 'Play the daily puzzle', '#daily')); main.append(daily);
}
async function renderCases(version) {
  main.append(heading('A field guide you can play.', 'Choose a practice scene or open your own photo. Observe first, classify with evidence, then discover why it matters.'));
  const actions = el('div', 'page-actions'); actions.append(link('Review your own photo', '#workbench'), link('Create a spotting puzzle', '#creator', 'secondary')); main.append(actions);
  const notice = el('p', 'notice', 'These cases use real FML photos and the researchers’ published litter regions. A box can group several objects, and unmarked areas are not proven clean. Your own photos are reviewed manually.');
  main.append(notice); const grid = el('div', 'case-grid'); CASES.forEach(item => grid.append(caseCard(item))); main.append(grid);
  const puzzles = await listLocalPuzzles(); if (version !== routeVersion || !puzzles.length) return;
  main.append(sectionHeading('Your spotting puzzles', 'Authored and stored on this device.'));
  const saved = el('div', 'saved-puzzles');
  for (const puzzle of puzzles) {
    const row = el('article', 'saved-puzzle'), words = el('div');
    words.append(el('h3', '', puzzle.title), el('small', 'muted', `${puzzle.targets.length} authored clues`));
    row.append(image(puzzle.imageDataUrl, 'Your puzzle preview'), words, link('Play puzzle', `#puzzle/${puzzle.id}`, 'secondary')); saved.append(row);
  }
  main.append(saved);
}

function mountCase(item, {daily = false, custom = false} = {}) {
  const today = dateKey(), selected = new Set(); let checked = false, finished = false, stageNumber = 1, reasoningNote='';
  const pointSelections = new Set(); let drawnOutlines = [];
  const allItems = [...item.targets, ...(item.distractors ?? [])];
  const top = heading(daily ? 'Today’s pollution puzzle' : item.title, daily ? 'A fresh chance to sharpen your eye. Complete today’s scene to build your streak.' : item.intro);
  if (daily) top.append(el('span', 'streak-chip', `${profile.streak} day streak · today ${today}`));
  else top.append(el('span', 'tag', custom ? 'Your authored puzzle' : item.label));
  if (!custom && !daily) top.append(button('Draw another photo', () => renderRoute(), 'secondary'));
  if (item.source?.poolSize) top.append(el('p', 'muted', `Drawn from ${item.source.drawPoolSize??item.source.poolSize} photos matching this difficulty, within a ${item.source.poolSize.toLocaleString()}-photo catalog. Regions are reference labels, not verified individual-item counts.`));
  if(item.source?.hostedSnapshot)top.append(el('p','notice',`Hosted photo collection: ${item.source.poolSize} bundled FML photos, exported ${item.source.exportedAt?.slice(0,10)??'with this release'}. The full local dataset contains ${item.source.fullCatalogSize??3636} eligible photos. This is a sourced practice collection, not a live survey.`));
  main.append(top);
  const stepper = el('ol', 'stepper');
  for (const [i, label] of ['Identify', 'Explain your reasoning', 'Review & save'].entries()) {
    const li = el('li', i === 0 ? 'active' : ''); li.append(el('span', '', i + 1), document.createTextNode(label)); stepper.append(li);
  }
  if (!custom) main.append(stepper);
  const layout = el('div', 'case-layout'), scenePanel = el('section', 'panel case-stage-panel'), side = el('aside', 'panel clue-panel');
  const sceneHeading = el('div', 'scene-heading'); sceneHeading.append(el('h2', '', item.title), el('span', 'scene-label', custom ? 'Authored answer key' : 'FML field photo'));
  const stage = el('div', 'scene-stage');
  stage.setAttribute('aria-label', 'Draw around an object, select a point, or use the checklist beside the photo.');
  let photoReady = false;
  const photo = image(item.sceneUrl, 'Pollution identification scene. Use the object checklist as a keyboard alternative.');
  photo.draggable = false;
  stage.append(photo);
  const markers = el('div', 'scene-markers'); stage.append(markers);
  const drawing = mountOutlineTools(stage,{
    onOutline(points){
      if(drawnOutlines.length>=100){drawing.setStatus('Clear or undo an outline before adding more.');return;}
      const match=matchOutline(item,points);drawnOutlines.push({points,objectId:match?.id??null});
      refreshSelections();checked=false;feedback.replaceChildren();paint();
      drawing.setStatus(match?'Outline matched a reference region. You can keep tracing or check your findings.':'Unmatched outline. Trace closer around one reference region, or undo and try again.');
    },
    onPoint(point){
      const match=hitTest(item,point.x,point.y);
      if(match)toggle(match.id);else notify('That point is outside the supplied answer key. Use the checklist to locate a labeled region.');
    },
    onUndo(){drawnOutlines.pop();refreshSelections();checked=false;feedback.replaceChildren();paint();drawing.setStatus('Last outline removed.');},
    onClear(){drawnOutlines=[];refreshSelections();checked=false;feedback.replaceChildren();paint();drawing.setStatus('Outlines cleared. Point and checklist selections are kept.');},
  });
  drawing.setEnabled(false);
  const bottom = el('div', 'scene-bottom'); bottom.append(el('p', '', custom ? 'Outline possible litter, or choose Point / select to toggle a marker.' : 'Trace one published litter region at a time. Outline matching is approximate practice feedback. A region can group multiple objects; unmarked water is not confirmed clean.'));
  if (item.source) {
    const credit = el('div', 'photo-credit');
    credit.append(el('p', '', item.source.attribution), sourceLink('Dataset record', item.source.url), document.createTextNode(' · '), sourceLink(item.source.license, item.source.licenseUrl));
    credit.append(el('p', '', `Source image: ${item.source.imageFile}. Precise location and capture date are not separately supplied in the annotation record.`));
    bottom.append(credit);
    bottom.append(sourceLink('Open the source photo at full resolution',item.sceneUrl));
  }
  const feedback = el('div'); feedback.setAttribute('aria-live', 'polite');
  const checkButton = button('Check my findings', checkFindings), hintButton = button('Give me a hint', giveHint, 'secondary');
  checkButton.disabled = true;
  photo.onload = () => { photoReady = true; checkButton.disabled = stageNumber > 1; drawing.setEnabled(stageNumber === 1); };
  photo.onerror = () => {
    photoReady = false; checkButton.disabled = true;
    drawing.setEnabled(false);
    feedback.replaceChildren(el('p','notice notice-warning','The source photo could not load. Draw another photo or return to Field cases; this unloaded case cannot issue rewards.'));
    if(!custom)feedback.append(button('Use a cached dataset photo',()=>{
      const fallback=daily?dailyCase(today):CASES.find(c=>c.id!==item.id)??CASES[0];
      if(typeof cleanup==='function')cleanup();main.replaceChildren();cleanup=mountCase(fallback,{daily});
      notify('Using the small local FML photo cache. Source and annotation credits remain visible.');
    },'secondary'));
  };
  const actions = el('div', 'button-row'); actions.append(checkButton, hintButton); bottom.append(actions, feedback);
  scenePanel.append(sceneHeading, drawing.toolbar, stage, bottom);
  const information=el('section','case-field-note');
  information.setAttribute('aria-label','Quick field note');
  information.append(el('span','eyebrow','QUICK FIELD NOTE'),el('h3','','What to look for'),
    el('p','','Follow the object’s edges, shape and texture. Compare it with nearby foam, reflections or natural material before marking it.'),
    el('p','','A photo alone cannot confirm polymer type, true size or trash concentration. Explain your visual evidence after identifying the regions.'));
  if(!custom&&item.impact){information.append(el('h4','','Why it matters'),el('p','',item.impact));if(item.sourceUrls?.[0])information.append(sourceLink('Read the NOAA guide',item.sourceUrls[0]));}
  side.append(information);
  side.append(el('h3', '', 'Your observation checklist'), el('p', '', 'Prefer a keyboard? Select the matching objects here. Names are clues, not answers.'));
  const list = el('ul', 'clue-list');
  const inputs = new Map();
  for (const object of [...allItems].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const li = el('li'), label = el('label', 'clue-option'), input = el('input'); input.type = 'checkbox';
    input.onchange = () => toggle(object.id); inputs.set(object.id, input);
    label.append(input, el('span', '', object.clue ?? `Object near ${Math.round(object.x * 100)}%, ${Math.round(object.y * 100)}%`)); li.append(label); list.append(li);
  }
  side.append(list, el('p', 'muted', 'Training progress is saved when you finish a case.'));
  layout.append(scenePanel, side); main.append(layout);
  const results = el('section', 'panel result-panel'); results.hidden = true; main.append(results);
  function updateSteps(number) { [...stepper.children].forEach((li, i) => li.classList.toggle('active', i + 1 <= number)); }
  function paint() {
    markers.replaceChildren();
    drawing.setOutlines(drawnOutlines.map(outline=>({...outline,state:!outline.objectId?'unmatched':checked?'correct':''})));
    for (const object of allItems) {
      const input = inputs.get(object.id); input.checked = selected.has(object.id); input.disabled = stageNumber > 1;
      if (!selected.has(object.id)) continue;
      if(drawnOutlines.some(outline=>outline.objectId===object.id))continue;
      const ring = el('span', `scene-marker${checked ? item.targets.some(t => t.id === object.id) ? ' correct' : ' incorrect' : ''}`);
      ring.style.left = `${object.x * 100}%`; ring.style.top = `${object.y * 100}%`; markers.append(ring);
      if (object.bbox) {
        ring.style.width = `${object.bbox[2] * 100}%`; ring.style.height = `${object.bbox[3] * 100}%`;
        ring.style.aspectRatio = 'auto'; ring.style.borderRadius = '8px';
      }
    }
  }
  function refreshSelections(){
    selected.clear();for(const id of pointSelections)selected.add(id);
    for(const outline of drawnOutlines)if(outline.objectId)selected.add(outline.objectId);
  }
  function toggle(id) {
    if (stageNumber > 1) return;
    if(selected.has(id)){pointSelections.delete(id);drawnOutlines=drawnOutlines.filter(outline=>outline.objectId!==id);}
    else pointSelections.add(id);
    refreshSelections();checked = false; feedback.replaceChildren(); paint();
  }
  function giveHint() {
    const missing = item.targets.find(target => !selected.has(target.id));
    const wrong = (item.distractors ?? []).find(target => selected.has(target.id));
    feedback.replaceChildren(el('p', 'notice', wrong ? `Look again: ${wrong.clue}. Could it be natural?` : missing ? `Look closer: ${missing.clue ?? missing.label}.` : 'You have marked every clue. Check your findings.'));
  }
  function checkFindings() {
    if (!photoReady) return;
    if(drawnOutlines.some(outline=>!outline.objectId)){
      feedback.replaceChildren(el('p','notice notice-warning','You have an unmatched outline. Undo it or clear outlines, then trace more closely around one reference region.'));return;
    }
    const score = scoreFindings(item, [...selected]); checked = true; paint();
    if (!score.complete) {
      feedback.replaceChildren(el('p', 'notice notice-warning', `${score.correct} of ${score.total} litter clues found${score.falsePositives ? `, with ${score.falsePositives} natural object${score.falsePositives === 1 ? '' : 's'} marked` : ''}. Take another look, or ask for a hint.`)); return;
    }
    feedback.replaceChildren(el('p', 'notice notice-success', custom ? 'You matched the creator’s answer key.' : 'Good eye! You matched every published annotation region. This is not a claim that every visible piece has been counted.'));
    stageNumber = 2; updateSteps(2); checkButton.disabled = true; hintButton.disabled = true; paint();
    drawing.setEnabled(false);
    if(custom)renderReview();else renderReasoning();
  }
  function renderReasoning(){
    results.hidden=false;results.replaceChildren(el('h2','','Explain what the evidence supports.'),el('p','muted','You matched the reference regions. Now distinguish an observation from an inference. Your own note will be saved, not automatically graded for scientific correctness.'));
    const evidence=el('fieldset','reasoning-question');evidence.append(el('legend','','Which statement is best supported?'));
    for(const choice of EVIDENCE_CHOICES){const label=el('label','reasoning-option'),input=el('input');input.type='radio';input.name='evidence-choice';input.value=choice.id;label.append(input,el('span','',choice.label));evidence.append(label);}
    const limits=el('fieldset','reasoning-question');limits.append(el('legend','','What still needs additional evidence? Select all that apply.'));
    for(const choice of EVIDENCE_LIMITS){const label=el('label','reasoning-option'),input=el('input');input.type='checkbox';input.name='evidence-limit';input.value=choice.id;label.append(input,el('span','',choice.label));limits.append(label);}
    const field=el('div','field'),label=el('label','','Your observation and reasoning'),note=el('textarea');
    note.id='reasoning-note';note.maxLength=2000;note.rows=4;label.htmlFor=note.id;
    note.placeholder='What visual clue did you use? Could there be another explanation? What would you need to know to be more certain?';
    field.append(label,note,el('small','muted','Saved on this device with your findings. Your wording is not automatically verified.'));
    const response=el('div');response.setAttribute('aria-live','polite');
    const next=button('Review my reasoning',()=>{
      const answer=results.querySelector('input[name="evidence-choice"]:checked')?.value;
      const selectedLimits=[...results.querySelectorAll('input[name="evidence-limit"]:checked')].map(input=>input.value);
      const result=checkReasoning({evidenceChoice:answer,limitChoices:selectedLimits,note:note.value});
      if(!result.ready){response.replaceChildren(...result.issues.map(issue=>el('p','notice notice-warning',issue)));return;}
      reasoningNote=note.value.trim();renderReview();
    });
    results.append(evidence,limits,field,response,next);results.scrollIntoView({behavior:'auto',block:'start'});
  }
  function renderReview() {
    stageNumber = 3; updateSteps(3); results.hidden = false;
    results.replaceChildren(el('h2', '', custom ? 'Your authored clues are complete.' : 'Your case findings'));
    const grid = el('div', 'findings-grid');
    for (const target of item.targets) {
      const card = el('article', 'finding-card'); card.append(el('h3', '', target.label));
      if (target.explanation) card.append(el('p', '', target.explanation));
      card.append(el('p', '', custom ? 'User-authored target; not an automated identification.' : `${target.material} · ${classifySize(target.measuredMm)?.label ?? 'Size unknown'}`)); grid.append(card);
    }
    results.append(grid);
    if(reasoningNote){const reasoning=el('div','learning-card');reasoning.append(el('h3','','Your reasoning'),el('p','',reasoningNote),el('small','muted','Your observation note. Not automatically graded or independently verified.'));results.append(reasoning);}
    if (!custom) {
      const learning = el('div', 'learning-card'); learning.append(el('h3', '', 'Why the finding matters'), el('p', '', item.impact));
      for (const species of item.species ?? []) { const p = el('p'); p.append(sourceLink(species.name, species.sourceUrl), document.createTextNode(` — ${species.context}`)); learning.append(p); }
      learning.append(el('p', 'muted', 'FML supplies real camera imagery and litter annotations, not a species survey. Possible hazards do not establish local animal presence, actual injury, or current pollution levels.'));
      const sources = el('div', 'source-links'); item.sourceUrls.forEach((url, i) => sources.append(sourceLink(`NOAA learning source ${i + 1}`, url))); learning.append(sources); results.append(learning);
    }
    const final = el('div', 'button-row'); final.style.marginTop = '22px';
    const finish = button(custom ? 'Finish practice puzzle' : daily ? 'Finish daily puzzle' : 'Save case & earn sand dollars', () => {
      if (finished) return; finished = true;
      let earned = 0;
      if (custom) { const award = awardGame(profile, 'authored-puzzles'); save(award.profile); earned = award.reward; }
      else {
        const findings = item.targets.map(target => ({...target, ...(drawnOutlines.find(outline=>outline.objectId===target.id)?{userOutline:drawnOutlines.find(outline=>outline.objectId===target.id).points}:{}), sizeMm: target.measuredMm, quantity: 1, unit: 'annotated region', sourceRecord: item.source, reasoning:reasoningNote,notes: 'Published FML annotation region; not a measured individual-item count or polymer identification.'}));
        const complete = completeCase(profile, {id: daily ? `daily-${today}` : item.id, title: daily ? `Daily puzzle ${today}: ${item.title}` : item.title, findings, reward: daily ? 0 : 20, source: 'dataset'});
        profile = complete.profile; earned = complete.reward;
        if (daily) { const award = claimDaily(profile, today); profile = award.profile; earned += award.reward; }
        save(profile);
      }
      finish.disabled = true;
      final.prepend(el('p', 'notice notice-success', earned ? `Case complete! +${earned} sand dollars. Your observations are in your collection.` : 'Practice complete. This reward has already been claimed; your existing progress is saved.'));
      final.append(link('View my collection', '#collection', 'secondary'), link('Choose another case', '#cases', 'secondary'));
      notify(earned ? `Nice observation! +${earned} sand dollars.` : 'Practice complete. Keep exploring.');
    });
    final.append(finish); results.append(final); results.scrollIntoView({behavior: 'auto', block: 'start'});
  }
  return () => { drawing.destroy();photo.onload=null;photo.onerror=null; };
}

async function drawDatasetCase(difficulty = 'beginner', daily = false) {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const params = new URLSearchParams({difficulty,exclude:recentCases.slice(-10).join(',')});
    if (daily) params.set('day',dateKey());
    const response = await fetch(`/api/practice-case?${params}`,{signal:controller.signal});
    if (!response.ok) throw new Error('Source service unavailable');
    const item = await response.json();
    if (!Array.isArray(item.targets) || !item.sceneUrl || !item.source) throw new Error('Invalid source response');
    recentCases.push(item.id);return item;
  } catch {
    try {
      const item=chooseHostedCase(await hostedDocument('cases'),{difficulty,exclude:recentCases.slice(-10),...(daily?{day:dateKey()}:{})});
      recentCases.push(item.id);return item;
    }catch{ /* The three original credited photos remain the final offline fallback. */ }
    const candidates=CASES.filter(item=>item.id!==recentCases.at(-1));
    const item=daily ? dailyCase(dateKey()) : (candidates.length?candidates:CASES)[Math.floor(Math.random()*(candidates.length||CASES.length))];
    recentCases.push(item.id);
    notify('Dataset service unavailable. Using one of three locally cached, credited FML photos.');
    return item;
  } finally { clearTimeout(timeout); }
}

function renderPlay() {
  main.append(heading('The ocean arcade.', 'Sharpen your observation skills, take on a daily challenge, or spend a little time cleaning a virtual shore.'));
  const featured=el('section','shore-arcade-feature'),featureWords=el('div');
  featureWords.append(el('span','tag','New arcade game'),el('h2','','Shore Cleaner'),el('p','','Walk the beach, scoop up litter, and recycle your haul. Unlock upgrades, hatch sea companions, and discover new shores.'),el('small','','Keyboard, pointer & touch · Progress saved on this device'));
  const featureActions=el('div','shore-arcade-actions');featureActions.append(el('span','shore-arcade-icon','🏖️'),link('Play Shore Cleaner','#shore-cleaner'));
  featured.append(featureWords,featureActions);main.append(featured);
  const grid = el('div', 'game-grid');
  for (const [icon, title, description, path, action] of [
    ['◈', 'Random field case', 'Draw a real FML photo and find the published litter regions. Build a collection of sourced observations.', '#case/random-beginner', 'Draw a field photo'],
    ['⌕', 'Daily spotting challenge', 'One fixed photo for the day. Find its annotated regions and keep a daily learning streak.', '#daily', 'Open today’s challenge'],
  ]) {
    const card = el('article', 'game-card'); card.append(el('div', 'game-icon', icon), el('h2', '', title), el('p', '', description), link(action, path)); grid.append(card);
  }
  main.append(grid);
  const creator = el('section', 'daily-banner'), words = el('div'); words.append(el('h2', '', 'Have an eye for a good puzzle?'), el('p', '', 'Use your own image, mark your answer key, and test a spotting challenge. It stays on this device.'));
  creator.append(words, link('Create a puzzle', '#creator', 'secondary')); main.append(creator);
}

async function renderCollection(version) {
  const h = el('div', 'collection-heading'); h.append(heading('Your field collection', 'A record of what you’ve learned and observed. Practice answers and manual findings are kept distinct.'));
  h.append(el('span', 'streak-chip', `${profile.balance} sand dollars · ${profile.streak} day streak`)); main.append(h);
  const count = Object.keys(profile.completedCases).length, badges = el('div', 'badge-row');
  for (const [label, earned] of [['First observer', count >= 1], ['Three-case explorer', count >= 3], ['Keen eye', profile.inventory.length >= 10], ['Three-day rhythm', profile.streak >= 3]]) badges.append(el('span', `badge${earned ? ' earned' : ''}`, `${earned ? '✓ ' : ''}${label}`));
  main.append(badges);
  const layout = el('div', 'collection-grid'), inventory = el('section', 'panel'), shop = el('aside', 'panel');
  inventory.append(el('h2', '', 'Saved findings'));
  if (!profile.inventory.length) {
    const empty = el('div', 'empty-state'); empty.append(el('h3', '', 'Your first discovery is waiting.'), el('p', '', 'Complete a field case to start a collection, or save observations from your own photo.'), link('Start a case', '#cases')); inventory.append(empty);
  } else {
    const list = el('div', 'inventory-list');
    for (const finding of profile.inventory) {
      const row = el('article', 'inventory-item'), text = el('div');
      text.append(el('strong', '', finding.label ?? 'Manual finding'));
      const size = classifySize(finding.sizeMm)?.label ?? 'Size unknown';
      text.append(el('small', '', `${finding.caseTitle} · ${finding.source === 'manual' ? 'Manual observation' : finding.source === 'dataset' ? 'Published dataset region' : 'Training observation'} · ${size} · ${finding.quantity ?? 1} ${finding.unit ?? 'finding'}`));
      if(finding.reasoning){const details=el('details'),summary=el('summary','','My reasoning');details.append(summary,el('p','',finding.reasoning));text.append(details);}
      row.append(el('span', 'item-icon', finding.source === 'manual' ? '⌕' : '◈'), text); list.append(row);
    }
    inventory.append(list, el('p', 'notice', 'A saved finding is an observation or training answer, not laboratory confirmation of a material.'));
    inventory.append(button('Export my collection', () => downloadJson({exportedAt: new Date().toISOString(), profile, interpretation: 'Local learning progress and manually authored findings; not verified environmental measurements.'}, 'marineguarder-collection.json'), 'secondary'));
  }
  shop.append(el('h2', '', 'Make it your own'), el('p', 'muted', 'Spend earned sand dollars on a field-station color. These are local game points, not real money.'));
  for (const item of SHOP) {
    const row = el('article', 'shop-item'), swatch = el('div', 'shop-swatch'), text = el('div');
    swatch.style.background = `linear-gradient(135deg,#1d55a8,${item.accent})`;
    text.append(el('h3', '', item.name), el('p', '', item.description));
    if (profile.ownedCosmetics.includes(item.id)) {
      const b = button(profile.equippedCosmetic === item.id ? 'Equipped' : 'Use this color', () => {
        const next = equipCosmetic(profile, item.id); if (next.error) notify(next.error); else { save(next.profile); renderRoute(); }
      }, 'secondary'); b.disabled = profile.equippedCosmetic === item.id; text.append(b);
    } else {
      const b = button(`${item.price} sand dollars`, () => {
        const result = buyCosmetic(profile, item.id);
        if (!result.purchased) { notify(result.error); return; }
        const equipped = equipCosmetic(result.profile, item.id); save(equipped.profile); notify(`${item.name} is yours. Your field-station gradient is updated.`); renderRoute();
      }, 'secondary'); b.disabled = profile.balance < item.price;
      text.append(b); if (profile.balance < item.price) text.append(el('small', 'muted', `${item.price - profile.balance} more to unlock`));
    }
    row.append(swatch, text); shop.append(row);
  }
  layout.append(inventory, shop); main.append(layout);
  main.append(sectionHeading('Your case history', 'Saved locally in this browser.'));
  const history = el('div', 'saved-puzzles');
  for (const completed of Object.values(profile.completedCases)) {
    const row = el('article', 'saved-puzzle'), text = el('div');
    text.append(el('h3', '', completed.title), el('small', 'muted', `${completed.findingCount} findings · ${completed.source === 'manual' ? 'Manual review' : completed.source === 'dataset' ? 'Open-dataset practice' : 'Training case'}`)); row.append(text); history.append(row);
  }
  if (!history.children.length) history.append(el('p', 'muted', 'No completed cases yet.'));
  main.append(history);
  const photos = await listLocalCases(); if (version !== routeVersion || !photos.length) return;
  main.append(sectionHeading('Your photo investigations', 'Open the workbench to review or update a saved photo.'));
  const saved = el('div', 'saved-puzzles');
  for (const entry of photos) {
    const row = el('article', 'saved-puzzle'), text = el('div'); text.append(el('h3', '', entry.title), el('small', 'muted', `${entry.findings.length} manual findings`));
    row.append(image(entry.imageDataUrl, 'Saved manual investigation'), text, link('Open workbench', '#workbench', 'secondary')); saved.append(row);
  }
  main.append(saved);
}

function downloadJson(data, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}));
  const a = el('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function onAward(gameId) {
  const result = awardGame(profile, gameId); save(result.profile);
  if (result.reward) notify(`Game complete! +${result.reward} sand dollars.`);
  return result;
}

async function renderRoute() {
  const version = ++routeVersion;
  if (typeof cleanup === 'function') cleanup(); cleanup = null;
  const [route = 'home', id] = location.hash.slice(1).split('/');
  main.replaceChildren();
  document.querySelectorAll('[data-nav]').forEach(a => {
    const active = a.dataset.nav === route || (a.dataset.nav === 'cases' && ['case', 'workbench', 'creator', 'puzzle'].includes(route)) || (a.dataset.nav === 'play' && ['size-game', 'food-web','shore-cleaner'].includes(route));
    if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  try {
    let mounted;
    if (route === 'cases') await renderCases(version);
    else if (route === 'case') {
      main.append(heading('Choosing your field photo…','Loading an annotated open-dataset image.'));
      const item = id?.startsWith('random-') ? await drawDatasetCase(id.slice(7)) : CASES.find(c => c.id === id);
      if (version !== routeVersion) return;
      if (!item) { navigate('cases'); return; } main.replaceChildren(); mounted = mountCase(item);
    } else if (route === 'daily') {
      main.append(heading('Preparing today’s puzzle…','The same dataset photo stays available throughout this local calendar day.'));
      const item = await drawDatasetCase('beginner',true);if(version!==routeVersion)return;
      main.replaceChildren();mounted = mountCase(item, {daily: true});
    }
    else if (route === 'play') renderPlay();
    else if (route === 'shore-cleaner') mounted = mountShoreCleaner(main,{onAward,notify,navigate});
    else if (['size-game','food-web','sea'].includes(route)) {navigate('play');return;}
    else if (route === 'collection') await renderCollection(version);
    else if (route === 'workbench') mounted = await mountWorkbench(main, {notify, onSaveCase: entry => {
      const result = completeCase(profile, {...entry, source: 'manual', reward: 0}); save(result.profile); notify('Manual findings saved to your collection.');
    }});
    else if (route === 'creator') mounted = await mountCreator(main, {notify, onPuzzleSaved: () => notify('Puzzle saved on this device. Find it under Field cases.')});
    else if (route === 'puzzle') {
      const puzzles = await listLocalPuzzles(); if (version !== routeVersion) return;
      const puzzle = puzzles.find(p => p.id === id); if (!puzzle) { navigate('cases'); return; }
      mounted = mountCase({...puzzle, intro: 'Find the targets in your own authored puzzle. The answer key was supplied by its creator, not an AI system.', sceneUrl: puzzle.imageDataUrl, distractors: []}, {custom: true});
    } else renderHome();
    if (version !== routeVersion) { if (typeof mounted === 'function') mounted(); return; }
    cleanup = mounted;
    main.focus({preventScroll: true});
    window.scrollTo({top: 0, behavior: 'auto'});
  } catch (error) {
    if (version !== routeVersion) return;
    main.replaceChildren(heading('This view couldn’t load.', 'Your saved progress is still on this device. Return to the field station and try again.'), link('Back to field station', '#home'));
    console.error('MarineGUARDer view failed:', error);
  }
}

window.addEventListener('hashchange', renderRoute);
save(profile);
renderRoute();
