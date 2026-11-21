import {
  saveLocalCase, saveLocalPuzzle, listLocalCases, listLocalPuzzles,
  getLocalStorageStatus,
} from './local-cases.js';
import {containsPoint,outlineBounds,matchOutline} from './outlines.js';
import {mountOutlineTools} from './outline-tools.js';

const CATEGORIES = [
  ['uncertain', 'Uncertain / possible debris'], ['fragment', 'Fragment'], ['film', 'Film / sheet'],
  ['fiber', 'Fiber / line'], ['pellet', 'Pellet'], ['foam', 'Foam'], ['other', 'Other'],
];
const MAX_FILE_SIZE = 12 * 1024 * 1024;

export function validateImageFile(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Choose a JPEG, PNG, or WebP photo. TIFF and other formats are not supported here.');
  }
  if (!file.size) throw new Error('This image is empty. Choose another photo.');
  if (file.size > MAX_FILE_SIZE) throw new Error('Choose an image no larger than 12 MB.');
}

export function previewDimensions(width, height) {
  if (![width, height].every(value => Number.isFinite(value) && value > 0)) throw new Error('This image could not be read.');
  const scale = Math.min(1, 1400 / Math.max(width, height));
  return {width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale))};
}

export function imagePoint(event, bounds) {
  if (!bounds.width || !bounds.height) return null;
  const x = (event.clientX - bounds.left) / bounds.width;
  const y = (event.clientY - bounds.top) / bounds.height;
  return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? {x, y} : null;
}

export function targetAtPoint(targets, point, excluded = new Set()) {
  return targets.find(target => !excluded.has(target.id) && containsPoint(target,point)) || null;
}

async function readPhoto(file) {
  validateImageFile(file);
  const url = URL.createObjectURL(file);
  try {
    const photo = new Image();
    await new Promise((resolve, reject) => {
      photo.onload = resolve;
      photo.onerror = () => reject(new Error('This image could not be read. Try another JPEG, PNG, or WebP photo.'));
      photo.src = url;
    });
    const {width, height} = previewDimensions(photo.naturalWidth, photo.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser could not prepare the image.');
    context.drawImage(photo, 0, 0, width, height);
    // A bounded preview is the only photo persisted; original files are never uploaded.
    const imageDataUrl = canvas.toDataURL('image/webp', 0.9);
    if (!imageDataUrl.startsWith('data:image/')) throw new Error('This image could not be prepared.');
    return imageDataUrl;
  } finally { URL.revokeObjectURL(url); }
}

function element(tag, className = '', text = '') {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text) result.textContent = text;
  return result;
}

function field(label, control, hint = '') {
  const wrapper = element('label', 'field');
  wrapper.append(element('span', 'field-label', label), control);
  if (hint) wrapper.append(element('span', 'muted field-help', hint));
  return wrapper;
}

function input(type, value, attributes = {}) {
  const result = document.createElement('input');
  result.type = type;
  result.value = value;
  for (const [name, setting] of Object.entries(attributes)) result.setAttribute(name, String(setting));
  return result;
}

function button(text, action, primary = false) {
  const result = element('button', `button ${primary ? 'button-primary' : 'button-secondary'}`, text);
  result.type = 'button';
  result.addEventListener('click', action);
  return result;
}

function freshRecord(creator) {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {
    id: `${creator ? 'puzzle' : 'manual'}-${id}`, title: '',
    source: creator ? 'user-authored' : 'manual', createdAt: new Date().toISOString(),
    imageDataUrl: '', ...(creator ? {targets: []} : {mode: 'surface', findings: []}),
  };
}

export async function mountWorkbench(container, {onSaveCase, notify} = {}) {
  return mountEditor(container, {creator: false, onSaved: onSaveCase, notify});
}

export async function mountCreator(container, {onPuzzleSaved, notify} = {}) {
  return mountEditor(container, {creator: true, onSaved: onPuzzleSaved, notify});
}

async function mountEditor(container, {creator, onSaved, notify}) {
  let alive = true;
  let uploadVersion = 0;
  let draft = freshRecord(creator);
  let selectedId = null;
  let selectedForm = null;
  let testing = false;
  let busy = false;
  let photoReady = false;
  let found = new Set();
  let testPointFound = new Set();
  let testOutlines = [];
  const key = creator ? 'targets' : 'findings';
  const noun = creator ? 'target' : 'finding';
  const listSaved = creator ? listLocalPuzzles : listLocalCases;
  const save = creator ? saveLocalPuzzle : saveLocalCase;
  const root = element('section', 'workbench');
  const heading = element('div', 'workbench-heading');
  heading.append(element('h2', '', creator ? 'Make a field puzzle' : 'Investigate your photo'),
    element('p', 'muted', creator ? 'Choose a photo, write clues, and mark your answer key. Test it before saving.' :
      'Mark possible debris and record what you can observe. Every finding is a manual annotation.'));
  const privacy = element('p', 'notice', 'Your photo stays on this device. Nothing is uploaded. Saved previews are resized to at most 1,400 pixels on their longest side.');
  const storageNotice = element('p', 'muted');
  storageNotice.setAttribute('role', 'status');
  const message = element('p', 'notice');
  message.setAttribute('role', 'status');
  message.setAttribute('aria-live', 'polite');
  message.hidden = true;
  function say(text, error = false) {
    if (!alive) return;
    message.textContent = text;
    message.hidden = false;
    message.classList.toggle('notice-error', error);
  }
  function updateStorage() {
    const state = getLocalStorageStatus();
    storageNotice.textContent = state.persistent ? 'Saved work is kept in this browser on this device. Export a copy to keep a separate backup.' : state.reason;
    storageNotice.className = state.persistent ? 'muted' : 'notice';
  }

  const setup = element('div', 'panel');
  const setupGrid = element('div', 'form-grid');
  const title = input('text', '', {maxlength: 100, placeholder: creator ? 'e.g. Find the shoreline fragments' : 'e.g. West beach, November 21'});
  setupGrid.append(field(creator ? 'Puzzle title' : 'Case title', title));
  let mode;
  if (!creator) {
    mode = element('select');
    for (const [value, text] of [['surface', 'Surface photo'], ['magnified', 'Magnified sample']]) {
      const option = element('option', '', text); option.value = value; mode.append(option);
    }
    setupGrid.append(field('Photo mode', mode, 'This label describes your view; it does not identify a material.'));
  }
  const file = input('file', '', {accept: 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp'});
  setupGrid.append(field('Choose a local photo', file, 'JPEG, PNG, or WebP · up to 12 MB. Choosing a photo starts a new record.'));
  setup.append(setupGrid);
  if (!creator) setup.append(element('p', 'muted', 'A photo alone cannot establish polymer identity, concentration, or ecological injury. Leave size unknown unless you have measured it.'));

  const workspace = element('div', 'workbench-grid');
  const imagePanel = element('div', 'panel workbench-image-panel');
  const empty = element('div', 'annotation-empty', 'Choose a photo to begin. Draw around an object, mark a point, or add a finding at the center.');
  const imageWrap = element('div', 'annotation-shell');
  imageWrap.style.textAlign = 'center';
  const stage = element('div', 'annotation-stage');
  Object.assign(stage.style, {position: 'relative', display: 'inline-block', maxWidth: '100%', verticalAlign: 'top', lineHeight: '0', cursor: 'crosshair'});
  stage.setAttribute('role', 'group');
  stage.setAttribute('aria-label', `Draw around an object on this photo, or use Add ${noun} at center.`);
  const photo = element('img');
  photo.alt = creator ? 'Your local puzzle photo' : 'Your local case photo';
  photo.draggable = false;
  Object.assign(photo.style, {display: 'block', width: '100%', height: 'auto'});
  const overlay = element('div', 'annotation-markers');
  Object.assign(overlay.style, {position: 'absolute', inset: '0', pointerEvents: 'none'});
  stage.append(photo, overlay);
  imageWrap.append(stage);
  imageWrap.hidden = true;
  const imageActions = element('div', 'button-row');
  const addButton = button(`Add ${noun} at center`, () => addItem({x: 0.5, y: 0.5}));
  const testButton = creator ? button('Test puzzle', () => toggleTest()) : null;
  imageActions.append(addButton);
  if (testButton) imageActions.append(testButton);
  const imageHelp = element('p', 'muted', `Drag around one object to add a ${noun}. Point / select adds or selects a marker. Undo and clear remove outlined ${noun}s; point markers are kept. Image areas are not physical measurements.`);
  const drawing=mountOutlineTools(stage,{
    onOutline(points){
      if(testing){
        const match=matchOutline({targets:draft.targets.filter(target=>!found.has(target.id))},points);
        if(match)foundTarget(match,points);
        else {
          testOutlines.push({points,objectId:null});
          testFeedback.textContent='No matching authored region. Trace closer around one target.';
          renderMarkers();
        }
        return;
      }
      const bounds=outlineBounds(points);
      addItem({x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2},points);
    },
    onPoint(point){
      if(testing){checkPoint(point);return;}
      const existing=targetAtPoint(draft[key],point);
      if(existing)selectItem(existing.id);else addItem(point);
    },
    onUndo(){removeOutlines(false);},onClear(){removeOutlines(true);},
  });
  const testControls = element('div', 'form-grid');
  const testX = input('number', 50, {required: true, min: 0, max: 100, step: 0.1});
  const testY = input('number', 50, {required: true, min: 0, max: 100, step: 0.1});
  testControls.append(field('Test position X (%)', testX), field('Test position Y (%)', testY),
    button('Check position', () => {
      if (testX.reportValidity() && testY.reportValidity()) checkPoint({x: Number(testX.value) / 100, y: Number(testY.value) / 100});
    }));
  testControls.hidden = true;
  const testFeedback = element('p', 'notice');
  testFeedback.setAttribute('role', 'status');
  testFeedback.hidden = true;
  const clueList = element('ol', 'finding-list');
  clueList.hidden = true;
  imagePanel.append(empty, drawing.toolbar, imageWrap, imageActions, imageHelp, testControls, testFeedback, clueList);

  const detailPanel = element('div', 'panel workbench-details');
  detailPanel.append(element('h3', '', creator ? 'Your answer key' : 'Manual findings'));
  const itemList = element('ol', 'finding-list');
  const editor = element('div', 'finding-editor');
  detailPanel.append(itemList, editor);
  workspace.append(imagePanel, detailPanel);

  const footer = element('div', 'panel');
  const actions = element('div', 'button-row');
  const saveButton = button(creator ? 'Save puzzle on this device' : 'Save case on this device', () => saveDraft(), true);
  const exportButton = button(creator ? 'Export puzzle JSON' : 'Export report JSON', () => exportDraft());
  const newButton = button(creator ? 'New puzzle' : 'New case', () => reset());
  actions.append(saveButton, exportButton, newButton);
  footer.append(actions, element('p', 'muted', creator ? 'Saved puzzles are user-authored and local to this browser. Saving does not publish them online.' :
    'Export contains the resized photo, marker positions, supplied measurements, and manual notes. No concentration is inferred.'));
  const library = element('div', 'panel');
  library.append(element('h3', '', creator ? 'Puzzles on this device' : 'Cases on this device'));
  const savedList = element('div', 'local-record-list');
  library.append(savedList);
  root.append(heading, privacy, storageNotice, message, setup, workspace, footer, library);
  container.replaceChildren(root);

  function controls() {
    const hasPhoto = Boolean(draft.imageDataUrl);
    drawing.setEnabled(hasPhoto && photoReady && !busy);
    addButton.disabled = !hasPhoto || testing || busy;
    saveButton.disabled = !hasPhoto || testing || busy;
    exportButton.disabled = !hasPhoto || testing || busy;
    file.disabled = testing || busy;
    title.disabled = testing || busy;
    if (mode) mode.disabled = testing || busy;
    if (testButton) testButton.disabled = !hasPhoto || !draft.targets.length || busy;
    newButton.disabled = busy;
    if (selectedForm) {
      for (const control of selectedForm.querySelectorAll('input,select,textarea,button')) control.disabled = busy || testing;
    }
  }
  function syncHeader() { draft.title = title.value.trim(); if (mode) draft.mode = mode.value; }
  function selected() { return draft[key].find(item => item.id === selectedId); }
  function applySelected(report = true) {
    if (!selectedForm) return true;
    if (!(report ? selectedForm.reportValidity() : selectedForm.checkValidity())) return false;
    const item = selected();
    if (!item) return true;
    const values = new FormData(selectedForm);
    Object.assign(item, {
      label: String(values.get('label')).trim(), category: String(values.get('category')),
      ...(!item.outline?{x: Number(values.get('x')) / 100, y: Number(values.get('y')) / 100,
        radius: Number(values.get('radius')) / 100}:{}),
      ...(creator ? {clue: String(values.get('clue')).trim()} : {
        sizeMm: values.get('sizeMm') === '' ? null : Number(values.get('sizeMm')),
        quantity: Number(values.get('quantity')), notes: String(values.get('notes')).trim(),
      }),
    });
    renderMarkers(); renderList();
    return true;
  }
  function renderMarkers() {
    overlay.replaceChildren();
    drawing.setOutlines(testing?testOutlines.map(outline=>({points:outline.points,state:outline.objectId?'correct':'unmatched'})):
      draft[key].filter(item=>item.outline).map(item=>({points:item.outline,state:item.id===selectedId?'is-selected':''})));
    draft[key].forEach((item, index) => {
      if (testing && !found.has(item.id)) return;
      const marker = element(testing ? 'span' : 'button', `marker${item.id === selectedId ? ' is-selected' : ''}`, String(index + 1));
      if (!testing) {
        marker.type = 'button';
        marker.setAttribute('aria-label', `Edit ${noun} ${index + 1}: ${item.label}`);
        marker.addEventListener('click', event => { event.stopPropagation(); selectItem(item.id); });
      }
      Object.assign(marker.style, {
        position: 'absolute', left: `${item.x * 100}%`, top: `${item.y * 100}%`,
        width: `${item.radius * 200}%`, height: `${item.radius * 200}%`,
        transform: 'translate(-50%, -50%)', borderRadius: '50%', border: '2px solid #ff976e',
        background: item.id === selectedId && !testing ? 'rgba(255,151,110,.4)' : 'rgba(18,56,77,.3)',
        color: '#fff', fontWeight: '800', lineHeight: '1', padding: '0',
        display: 'grid', placeItems: 'center', pointerEvents: testing ? 'none' : 'auto', cursor: 'pointer', minWidth: '0', minHeight: '0',
      });
      if(item.outline){marker.style.width='26px';marker.style.height='26px';}
      overlay.append(marker);
    });
  }
  function renderList() {
    itemList.replaceChildren();
    if (!draft[key].length) itemList.append(element('li', 'muted', `No ${noun}s yet. Add one on the photo or use the center button.`));
    draft[key].forEach((item, index) => {
      const row = element('li');
      const choice = button(`${index + 1}. ${item.label}`, () => selectItem(item.id));
      choice.setAttribute('aria-pressed', String(item.id === selectedId));
      row.append(choice);
      if (!creator) row.append(element('span', 'muted', ` ${item.quantity} × ${item.category} · ${item.sizeMm === null ? 'size unknown' : `${item.sizeMm} mm (supplied)`}`));
      itemList.append(row);
    });
    controls();
  }
  function selectItem(id) {
    if (busy || testing) return;
    if (!applySelected()) return;
    selectedId = id;
    renderEditor(); renderMarkers(); renderList();
  }
  function renderEditor() {
    editor.replaceChildren();
    selectedForm = null;
    const item = selected();
    if (!item) { editor.append(element('p', 'muted', `Select a ${noun} to edit its details.`)); return; }
    const form = element('form');
    const grid = element('div', 'form-grid');
    const addField = (name, label, control, hint = '') => {
      control.name = name;
      grid.append(field(label, control, hint));
    };
    addField('label', 'Label', input('text', item.label, {required: true, maxlength: 80}));
    const categories = element('select');
    for (const [value, text] of CATEGORIES) {
      const option = element('option', '', text); option.value = value; categories.append(option);
    }
    categories.value = item.category;
    addField('category', creator ? 'Answer category' : 'Observed category', categories);
    if(item.outline) {
      grid.append(element('p','muted',`Freehand outline · ${item.outline.length} points. Its shape will be saved with this ${noun}. Delete it and draw again to change the outline.`));
    } else {
      addField('x', 'Position X (%)', input('number', Number((item.x * 100).toFixed(3)), {required: true, min: 0, max: 100, step: 'any'}));
      addField('y', 'Position Y (%)', input('number', Number((item.y * 100).toFixed(3)), {required: true, min: 0, max: 100, step: 'any'}));
      addField('radius', 'Marker radius (%)', input('number', Number((item.radius * 100).toFixed(3)), {required: true, min: 0.5, max: 50, step: 'any'}), 'Fraction of the image axes; this is not a measured size.');
    }
    if (!creator) {
      addField('sizeMm', 'Measured size (mm, optional)', input('number', item.sizeMm ?? '', {min: 0.000001, step: 'any', placeholder: 'Unknown'}), 'Enter only a measurement you already know.');
      addField('quantity', 'Quantity', input('number', item.quantity, {required: true, min: 1, max: 1000000, step: 1}));
    }
    const notes = element('textarea');
    notes.value = creator ? item.clue : item.notes;
    notes.rows = 3;
    notes.maxLength = 1000;
    if(!creator)notes.placeholder='Describe the visual clue, a possible alternative explanation, and what remains uncertain.';
    addField(creator ? 'clue' : 'notes', creator ? 'Clue for the player' : 'Observation, reasoning & uncertainty', notes);
    const row = element('div', 'button-row');
    const apply = element('button', 'button button-secondary', 'Apply changes');
    apply.type = 'submit';
    row.append(apply, button(`Delete ${noun}`, () => {
      if (busy || testing) return;
      draft[key] = draft[key].filter(value => value.id !== item.id);
      selectedId = null; renderEditor(); renderMarkers(); renderList();
    }));
    form.append(element('h4', '', `Edit ${noun}`), grid, row);
    form.addEventListener('submit', event => { event.preventDefault(); if (applySelected()) say(`${creator ? 'Target' : 'Finding'} updated.`); });
    editor.append(form);
    selectedForm = form;
  }
  function addItem(point,outline=null) {
    if (!draft.imageDataUrl || testing || busy || !applySelected()) return;
    const next = draft[key].length + 1;
    const item = {id: `${draft.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ...point, radius: 0.04, label: `${creator ? 'Target' : 'Finding'} ${next}`, category: 'uncertain',
      ...(creator ? {clue: ''} : {sizeMm: null, quantity: 1, notes: ''})};
    if(outline)item.outline=outline;
    draft[key].push(item); selectedId = item.id;
    renderEditor(); renderMarkers(); renderList();
    say(`${creator ? 'Target' : 'Finding'} ${next} added. Edit its label and details below.`);
  }
  function removeOutlines(all) {
    if(busy)return;
    if(testing){
      if(all)testOutlines=[];else testOutlines.pop();
      found=new Set(testPointFound);
      for(const outline of testOutlines)if(outline.objectId)found.add(outline.objectId);
      testFeedback.textContent=`${found.size} of ${draft.targets.length} targets found.`;
      renderMarkers();
      drawing.setStatus(all?'Test outlines cleared. Point discoveries kept.':'Last test outline removed.');
      return;
    }
    const last=draft[key].findLast(item=>item.outline);
    draft[key]=draft[key].filter(item=>!item.outline||(!all&&item!==last));
    if(!selected()){selectedId=null;selectedForm=null;}else applySelected(false);
    renderEditor();renderMarkers();renderList();
    drawing.setStatus(all?`Outlined ${noun}s cleared. Point markers kept.`:`Last outlined ${noun} removed.`);
  }
  function showPhoto() {
    drawing.cancel();photoReady=false;
    photo.src = draft.imageDataUrl;
    const present = Boolean(draft.imageDataUrl);
    imageWrap.hidden = !present;
    empty.hidden = present;
    renderMarkers(); controls();
  }
  photo.addEventListener('load', () => {
    if (!alive) return;
    photoReady=true;controls();
    const width = Math.min(photo.naturalWidth, 900, photo.naturalWidth / photo.naturalHeight * 620);
    stage.style.width = `${width}px`;
  });
  photo.addEventListener('error',()=>{photoReady=false;controls();say('This photo could not load. Choose another local image.',true);});
  file.addEventListener('change', async () => {
    const chosen = file.files?.[0];
    if (!chosen) return;
    const version = ++uploadVersion;
    busy = true; controls(); say('Preparing your local photo…');
    try {
      const imageDataUrl = await readPhoto(chosen);
      if (!alive || version !== uploadVersion) return;
      const previousTitle = title.value.trim();
      draft = freshRecord(creator);
      draft.title = previousTitle || chosen.name.replace(/\.[^.]+$/, '');
      if (mode) draft.mode = mode.value;
      draft.imageDataUrl = imageDataUrl;
      title.value = draft.title; selectedId = null;
      renderEditor(); renderList(); showPhoto();
      say('Photo ready. Mark a possible finding or add one at the center.');
    } catch (error) { if (alive && version === uploadVersion) say(error.message, true); }
    finally { if (alive && version === uploadVersion) { busy = false; file.value = ''; controls(); } }
  });
  function toggleTest() {
    if (busy) return;
    if (!testing && !applySelected()) return;
    testing = !testing; found = new Set(); testPointFound = new Set(); testOutlines = [];
    testButton.textContent = testing ? 'Return to editor' : 'Test puzzle';
    detailPanel.hidden = testing;
    testControls.hidden = !testing;
    testFeedback.hidden = !testing;
    clueList.hidden = !testing;
    drawing.cancel();
    imageHelp.textContent = testing ? 'Find targets by outlining them, choosing Point / select, or entering a position below. The answer key is hidden until found.' :
      'Drag around an object to add a target. Point / select adds or selects a marker. Undo and clear remove outlined targets.';
    clueList.replaceChildren();
    if (testing) {
      draft.targets.forEach((target, index) => clueList.append(element('li', '', target.clue || `Target ${index + 1}: no clue supplied.`)));
      testFeedback.textContent = `0 of ${draft.targets.length} targets found.`;
    }
    renderMarkers(); controls();
  }
  function checkPoint(point) {
    if (!testing) return;
    const target = targetAtPoint(draft.targets, point, found);
    if (target) {
      foundTarget(target);
    } else {
      const repeated = targetAtPoint(draft.targets, point);
      testFeedback.textContent = repeated ? 'You already found that target. Try a different area.' : 'No authored target at that position. Try another area or use a clue.';
    }
  }
  function foundTarget(target,points=null){
    if(points)testOutlines.push({points,objectId:target.id});else testPointFound.add(target.id);
    found.add(target.id);
    testFeedback.textContent=`${target.label}: found. ${found.size} of ${draft.targets.length} targets found.${found.size===draft.targets.length?' Answer key complete!':''}`;
    renderMarkers();
  }
  function ready() {
    syncHeader();
    if (!draft.imageDataUrl) { say('Choose a photo first.', true); return false; }
    if (!draft.title) { say(`Give your ${creator ? 'puzzle' : 'case'} a title.`, true); title.focus(); return false; }
    if (!applySelected()) return false;
    if (creator && !draft.targets.length) { say('Add at least one target to your answer key.', true); return false; }
    return true;
  }
  async function saveDraft() {
    if (busy || !ready()) return;
    busy = true; controls();
    try {
      const result = await save(draft);
      if (!alive) return;
      draft = result.entry;
      updateStorage(); await renderSaved();
      say(result.persisted ? `${creator ? 'Puzzle' : 'Manual case'} saved on this device.` : `Saved for this session only. ${result.status.reason}`);
      if (onSaved) {
        try { await onSaved(result.entry); }
        catch { say('Your record is saved, but the collection could not refresh. Reopen Collection to try again.', true); }
      }
      notify?.(result.persisted ? `${creator ? 'Puzzle' : 'Manual case'} saved` : 'Saved for this session only — export a copy.');
    } catch (error) { say(error.message || 'This record could not be saved.', true); }
    finally { if (alive) { busy = false; controls(); } }
  }
  function exportDraft() {
    if (!ready()) return;
    const blob = new Blob([JSON.stringify({...draft, exportNote: creator ? 'Local, user-authored answer key. Not a scientific classification.' :
      'Manual annotations. Null size means unknown. A photo does not determine polymer identity, concentration, or ecological injury.'}, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const link = element('a');
    link.href = url;
    link.download = `${draft.title.replace(/[^a-z0-9_-]+/gi, '-').slice(0, 70) || 'casework'}.json`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    say('JSON export prepared. It includes your resized photo and manual answer data.');
  }
  function reset() {
    uploadVersion++;
    if (testing) toggleTest();
    draft = freshRecord(creator); title.value = ''; if (mode) mode.value = 'surface';
    selectedId = null; renderEditor(); renderList(); showPhoto();
    say(`New ${creator ? 'puzzle' : 'case'} started. Choose a local photo.`);
  }
  async function renderSaved() {
    const records = await listSaved();
    if (!alive) return;
    savedList.replaceChildren();
    if (!records.length) savedList.append(element('p', 'muted', `No saved ${creator ? 'puzzles' : 'cases'} in this browser yet.`));
    for (const record of records) {
      const open = button(`Open ${record.title} · ${record[key].length} ${noun}${record[key].length === 1 ? '' : 's'}`, () => {
        if (busy) return;
        uploadVersion++;
        if (testing) toggleTest();
        draft = JSON.parse(JSON.stringify(record)); title.value = draft.title;
        if (mode) mode.value = draft.mode;
        selectedId = null; renderEditor(); renderList(); showPhoto();
        say(`Opened ${draft.title}. Saving updates this same record.`);
      });
      savedList.append(open);
    }
    updateStorage();
  }
  renderEditor(); renderList(); updateStorage();
  await renderSaved();
  return () => { alive = false; uploadVersion++; drawing.destroy();root.remove(); };
}
