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

const fields = [
  ['name', 'Site name', 'text'],
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
  let context = null;
  let editing = null;
  let dirty = false;
  let pendingTile = null;

  function node(tag, content) {
    const element = document.createElement(tag);
    element.textContent = content;
    return element;
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
          inputs.get('name').focus();
        }],
        ['Remove', () => {
          sites.splice(index, 1);
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
    const values = Object.fromEntries([...inputs].map(([key, input]) =>
      [key, input.type === 'number' ? input.valueAsNumber : input.value.trim()]));
    if (!values.name) { status.textContent = 'Enter a site name.'; return; }
    if (editing === null && sites.length >= 30) { status.textContent = 'Remove a candidate before adding another.'; return; }
    const site = {...values, context};
    if (editing === null) sites.push(site);
    else sites[editing] = site;
    reset();
    save('Candidate saved.');
  });
  form.addEventListener('input', () => { dirty = true; });
  form.querySelector('[data-new-candidate]').addEventListener('click', () => {
    reset();
    inputs.get('name').focus();
  });
  update();
  function fillTile(name, tileContext) {
    reset();
    inputs.get('name').value = name.slice(0, 100);
    context = tileContext;
    root.querySelector('.cleanup-context').textContent = context;
    status.textContent = 'Location and map evidence filled in. Add your shoreline survey and logistics before ranking.';
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
    reviewTile() {
      if (pendingTile) fillTile(pendingTile.name, pendingTile.tileContext);
      inputs.get('name').focus();
    },
  };
}
