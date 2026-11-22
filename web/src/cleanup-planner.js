import {cleanupSettings, selectCleanupMethod} from './cleanup-methods.js';

const STORAGE_KEY = 'marineguarder.cleanup-planner.v1';
const DAY = 86_400_000;

export function assessCleanup(site, today = Date.now()) {
  const valid = value => Number.isFinite(value) && value >= 0;
  const age = (Math.floor(today / DAY) * DAY - Date.parse(site.observedOn)) / DAY;
  const density = valid(site.items) && valid(site.length) && site.length > 0 ? site.items / site.length * 100 : null;
  const benefit = density !== null && age >= 0 && age <= 30
    ? Math.round(80 * Math.min(1, density / 100) + (site.habitat === 'near' ? 20 : 0)) : null;
  const paused = site.access === 'closed' || [site.wind, site.water].includes('unsafe');
  const complete = site.access === 'confirmed' && site.wind === 'suitable' && site.water === 'suitable'
    && ['near', 'no'].includes(site.habitat) && [site.distance, site.cost, site.budget].every(valid) && site.budget > 0;
  const overBudget = valid(site.cost) && site.budget > 0 && site.cost > site.budget;
  const feasibility = complete && !paused && !overBudget
    ? Math.round(100 - 50 * Math.min(1, site.distance / 50) - 50 * (site.cost / site.budget)) : null;
  let status = 'Ready for comparison';
  if (benefit === null) status = 'Needs a shoreline survey from the last 30 days';
  if (!complete) status = 'Confirm access, nearby habitat, conditions, distance and costs';
  if (overBudget) status = 'Estimated cost exceeds budget';
  if (paused) status = 'Hold for access or conditions';
  if (benefit !== null && density === 0 && !paused) status = 'No visible litter reported';
  return {
    density, benefit, feasibility, status,
    priority: density > 0 && benefit !== null && feasibility !== null ? Math.round((benefit + feasibility) / 2) : null,
  };
}

export function estimateCleanup(site, recovery, today = Date.now()) {
  const assessment = assessCleanup(site, today);
  const protectedSite = site.habitat === 'near' || (typeof site.context === 'string' && site.context.includes('Protected Planet:'));
  let suggestion;
  if (site.access === 'closed' || [site.wind, site.water].includes('unsafe')) {
    suggestion = 'Pause cleanup planning until access and conditions are suitable. Check with the site manager before choosing another date.';
  } else if (protectedSite) {
    suggestion = 'Coordinate with the protected-area manager. Ask which shoreline stretches can be cleaned and which habitats or wildlife areas to avoid.';
  } else if (assessment.benefit === null) {
    suggestion = 'Identify an accessible shoreline near the map location. Count visible litter along a measured stretch and record the survey date.';
  } else if (site.items === 0) {
    suggestion = 'Repeat the count on the same stretch after a period of accumulation to see whether litter is recurring.';
  } else if (assessment.status === 'Estimated cost exceeds budget' || site.distance > 25) {
    suggestion = 'Ask a local cleanup partner about shared transport or a closer authorized disposal point before setting a removal target.';
  } else if (site.access !== 'confirmed' || site.wind !== 'suitable' || site.water !== 'suitable') {
    suggestion = 'Verify shoreline access and check wind, tides, and water conditions with the cleanup organizer before scheduling.';
  } else {
    suggestion = 'Prioritize the most littered section of the surveyed shoreline, arrange disposal, and recount the same stretch immediately after cleanup.';
  }
  if (assessment.benefit === null || !Number.isFinite(recovery) || recovery < 0 || recovery > 100) {
    return {suggestion, result: null};
  }
  const removed = Math.floor(site.items * (recovery / 100));
  const remaining = site.items - removed;
  return {suggestion, result: {
    before: site.items, removed, remaining, beforeDensity: assessment.density, afterDensity: remaining * 100 / site.length,
  }};
}

const fields = [
  ['name', 'Site name', 'text'],
  ['setting', 'Cleanup setting', cleanupSettings],
  ['observedOn', 'Survey date', 'date'],
  ['items', 'Visible litter counted (items)', 'number'],
  ['length', 'Shoreline surveyed (m)', 'number', 1],
  ['habitat', 'Protected habitat nearby', [['near', 'Yes'], ['no', 'No']]],
  ['access', 'Site access and permission', [['confirmed', 'Confirmed'], ['closed', 'Restricted']]],
  ['wind', 'Wind for planned cleanup', [['suitable', 'Checked and suitable'], ['unsafe', 'Unsuitable']]],
  ['water', 'Currents, tide and water conditions', [['suitable', 'Checked and suitable'], ['unsafe', 'Unsuitable']]],
  ['distance', 'Travel to disposal facility (km)', 'number'],
  ['cost', 'Estimated cleanup cost', 'number'],
  ['budget', 'Available budget (same currency)', 'number', 1],
];

export function mountCleanupPlanner(root) {
  let sites = [];
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (Array.isArray(stored)) sites = stored.filter(site => site && typeof site.name === 'string').slice(0, 30);
  } catch { /* Comparisons are still available for this session. */ }
  const form = root.querySelector('form');
  const inputs = new Map();
  const fieldset = form.querySelector('.cleanup-fields');
  const results = root.querySelector('.cleanup-results');
  const status = root.querySelector('[role="status"]');
  const estimateSite = root.querySelector('#cleanup-estimate-site');
  const recovery = root.querySelector('#cleanup-recovery');
  const estimateResults = root.querySelector('#cleanup-estimate-results');
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  let context = null;
  let editing = null;
  let dirty = false;
  let pendingTile = null;

  function node(tag, content) {
    const element = document.createElement(tag);
    element.textContent = content;
    return element;
  }
  function showTab(index, focus = false) {
    for (const [i, tab] of tabs.entries()) {
      tab.tabIndex = i === index ? 0 : -1;
      tab.setAttribute('aria-selected', String(i === index));
      root.querySelector(`#${tab.getAttribute('aria-controls')}`).hidden = i !== index;
    }
    if (index === 1) renderEstimate();
    if (focus) tabs[index].focus();
  }
  for (const [i, tab] of tabs.entries()) {
    tab.addEventListener('click', () => showTab(i));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      showTab(event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - i, true);
    });
  }
  for (const [key, label, type, minimum = 0] of fields) {
    const wrapper = node('label', label);
    const select = Array.isArray(type);
    const input = document.createElement(select ? 'select' : 'input');
    if (select) {
      for (const [value, text] of [['', 'Unknown'], ...type]) {
        const option = node('option', text);
        option.value = value;
        input.append(option);
      }
    } else {
      input.type = type;
      if (type === 'number') {
        input.min = minimum;
        input.step = key === 'items' ? '1' : 'any';
      }
    }
    if (key === 'name') { input.required = true; input.maxLength = 100; }
    if (key === 'observedOn') input.max = new Date().toISOString().slice(0, 10);
    wrapper.append(input);
    inputs.set(key, input);
    fieldset.append(wrapper);
  }
  function reset() {
    form.reset();
    context = null;
    editing = null;
    dirty = false;
    pendingTile = null;
    root.querySelector('.cleanup-context').textContent = '';
    form.querySelector('[type="submit"]').textContent = 'Save candidate';
  }
  function formValues() {
    return Object.fromEntries([...inputs].map(([key, input]) =>
      [key, input.type === 'number' ? input.valueAsNumber : input.value.trim()]));
  }
  function renderEstimate() {
    const site = estimateSite.value === '' ? {...formValues(), context} : sites[Number(estimateSite.value)];
    if (!site) return;
    const percent = recovery.valueAsNumber;
    root.querySelector('#cleanup-recovery-label').textContent = `${percent}%`;
    recovery.setAttribute('aria-valuetext', `${percent} percent`);
    const {suggestion, result} = estimateCleanup(site, percent);
    estimateResults.replaceChildren(node('h3', site.name || 'Current candidate'));
    if (result) {
      estimateResults.append(node('p', `${result.before} before → ${result.remaining} remaining · ${result.removed} items removed`),
        node('p', `${result.beforeDensity.toFixed(1)} before → ${result.afterDensity.toFixed(1)} after · visible items per 100 m`));
    } else {
      estimateResults.append(node('p', 'Enter a visible litter count, the distance surveyed, and a survey date from the last 30 days to estimate improvement.'));
    }
    estimateResults.append(node('h4', 'Suggested next step'), node('p', suggestion));
    const method = selectCleanupMethod(site);
    const process = node('section', '');
    process.className = 'cleanup-method';
    process.append(node('h4', method.title), node('p', method.basis),
      node('p', `Field evidence: ${method.validation}`), node('p', `Drones: ${method.drones}`));
    if (method.hold) process.append(node('p', 'Planning only. Resolve the reported access or conditions issue before any fieldwork.'));
    const steps = node('ol', '');
    steps.append(...method.steps.map(step => node('li', step)));
    const sources = node('ul', '');
    for (const [label, url] of method.sources) {
      const row = node('li', '');
      const link = node('a', label);
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      row.append(link);
      sources.append(row);
    }
    process.append(node('h4', 'Cleanup process'), steps, sources);
    root.querySelector('#cleanup-method-result').replaceChildren(process);
  }
  function updateEstimateSites() {
    const active = estimateSite.value;
    estimateSite.replaceChildren(...[['', 'Current candidate'], ...sites.map((site, index) => [index, site.name])]
      .map(([value, label]) => {
        const option = node('option', label);
        option.value = value;
        return option;
      }));
    estimateSite.value = sites[Number(active)] ? active : '';
    renderEstimate();
  }
  estimateSite.addEventListener('change', renderEstimate);
  recovery.addEventListener('input', renderEstimate);
  function update() {
    const ranked = sites.map((site, index) => ({site, index, score: assessCleanup(site)}))
      .sort((a, b) => (b.score.priority ?? -1) - (a.score.priority ?? -1));
    results.replaceChildren();
    if (!ranked.length) results.append(node('p', 'Add a candidate to start your comparison.'));
    let rank = 0;
    for (const {site, index, score} of ranked) {
      const card = document.createElement('li');
      const title = score.priority === null ? site.name : `${++rank}. ${site.name}`;
      card.append(node('h3', title), node('p', score.status));
      card.append(node('p', `Priority ${score.priority ?? 'pending'} · Environmental priority ${score.benefit ?? 'pending'} · Feasibility ${score.feasibility ?? 'pending'}`));
      if (score.density !== null) card.append(node('p', `${score.density.toFixed(1)} visible items per 100 m · ${site.items} counted`));
      if (site.context) card.append(node('p', site.context));
      for (const [label, handler] of [
        ['Edit', () => {
          editing = index;
          dirty = true;
          context = site.context ?? null;
          for (const [key, input] of inputs) input.value = site[key] ?? '';
          root.querySelector('.cleanup-context').textContent = context ?? '';
          form.querySelector('[type="submit"]').textContent = 'Update candidate';
          estimateSite.value = '';
          renderEstimate();
          inputs.get('name').focus();
        }],
        ['Estimate improvement', () => {
          estimateSite.value = String(index);
          showTab(1, true);
        }],
        ['Remove', () => {
          sites.splice(index, 1);
          if (estimateSite.value !== '') {
            const selected = Number(estimateSite.value);
            if (selected === index) estimateSite.value = '';
            else if (selected > index) estimateSite.value = String(selected - 1);
          }
          if (editing === index) reset();
          else if (editing !== null && editing > index) editing--;
          save('Candidate removed.');
        }],
      ]) {
        const button = node('button', label);
        button.type = 'button';
        button.className = 'text-button';
        button.addEventListener('click', handler);
        card.append(button);
      }
      results.append(card);
    }
    updateEstimateSites();
  }
  function save(message) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sites));
      status.textContent = message;
    } catch { status.textContent = `${message} This session only. Browser storage is unavailable.`; }
    update();
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    const values = formValues();
    if (!values.name) { status.textContent = 'Enter a site name.'; return; }
    if (editing === null && sites.length >= 30) { status.textContent = 'Remove a candidate before adding another.'; return; }
    const site = {...values, context};
    const savedIndex = editing ?? sites.length;
    if (editing === null) sites.push(site);
    else sites[editing] = site;
    reset();
    save('Candidate saved.');
    estimateSite.value = String(savedIndex);
    renderEstimate();
  });
  form.addEventListener('input', () => {
    dirty = true;
    if (estimateSite.value === '') renderEstimate();
  });
  form.querySelector('[data-new-candidate]').addEventListener('click', () => {
    reset();
    estimateSite.value = '';
    renderEstimate();
    inputs.get('name').focus();
  });
  update();
  function fillTile(name, tileContext) {
    reset();
    inputs.get('name').value = name.slice(0, 100);
    context = tileContext;
    const inferred = selectCleanupMethod({context});
    inputs.get('setting').value = inferred.setting === 'unknown' ? '' : inferred.setting;
    root.querySelector('.cleanup-context').textContent = context;
    status.textContent = 'Location and map evidence filled in. Add your shoreline survey and logistics before ranking.';
    estimateSite.value = '';
    renderEstimate();
  }
  return {
    stageTile(name, tileContext) {
      if (dirty) {
        pendingTile = {name, tileContext};
        return false;
      }
      fillTile(name, tileContext);
      return true;
    },
    reviewTile(improvement = false) {
      if (pendingTile) fillTile(pendingTile.name, pendingTile.tileContext);
      if (improvement) {
        estimateSite.value = '';
        showTab(1, true);
        return;
      }
      inputs.get('name').focus();
    },
  };
}
