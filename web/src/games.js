// Optional virtual cleanup; identification and reasoning live in the case flow.
const TRASH_TYPES = [
  {label: 'Virtual plastic bottle', icon: '🧴'},
  {label: 'Virtual drink can', icon: '🥫'},
  {label: 'Virtual discarded bag', icon: '🛍️'},
  {label: 'Virtual takeaway cup', icon: '🥤'},
];

export const CLEANUP_ITEMS = Object.freeze(Array.from({length: 12}, (_, index) => Object.freeze({
  id: `cleanup-${index + 1}`,
  ...TRASH_TYPES[index % TRASH_TYPES.length],
  x: [0.03, 0.34, 0.65, 0.96][index % 4],
  y: [0.1, 0.45, 0.8][Math.floor(index / 4)],
})));

export function collectCleanupItem(collectedIds, id) {
  if (collectedIds.includes(id) || !CLEANUP_ITEMS.some(item => item.id === id)) return collectedIds;
  return [...collectedIds, id];
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function controls() {
  const controller = new AbortController();
  return {
    listen(target, event, callback) {
      target.addEventListener(event, callback, {signal: controller.signal});
    },
    button(text, className, callback) {
      const node = el('button', className, text);
      node.type = 'button';
      node.addEventListener('click', callback, {signal: controller.signal});
      return node;
    },
    cleanup() { controller.abort(); },
  };
}

function rewardMessage(onAward, notify, gameId) {
  const result = onAward(gameId) ?? {};
  const text = result.reward > 0
    ? `You earned ${result.reward} sand dollars. Come back tomorrow for another game reward.`
    : result.alreadyClaimed
      ? 'Today’s reward for this game is already collected. Keep practicing whenever you like.'
      : 'Practice complete. Your learning progress is what counts.';
  notify(text);
  return text;
}

function focus(node) {
  node.tabIndex = -1;
  node.focus();
}

const defaults = {onAward: () => ({reward: 0}), notify: () => {}, navigate: () => {}};

export function mountCleanupGame(container, options = {}) {
  const {onAward, notify, navigate} = {...defaults, ...options};
  const ui = controls();
  let started = false;
  let collected = [];
  let keys = '';
  let awardText = '';

  function start() { started = true; render('item'); }

  function render(focusTarget) {
    const panel = el('section', 'quiz-panel panel');
    const complete = collected.length === CLEANUP_ITEMS.length;
    const heading = el('h2', '', complete ? 'Virtual shoreline cleared' : 'The SEA cleanup');
    panel.append(
      heading,
      el('p', 'notice', 'This is a cleanup simulation. Collecting these virtual items does not remove real ocean debris or establish a real environmental benefit.'),
    );
    if (!started) {
      panel.append(el('p', '', 'Type SEA while this screen is open, or use the button below. Every virtual item can also be reached with Tab and collected with Enter or Space.'));
      const actions = el('div', 'button-row');
      actions.append(
        ui.button('Start cleanup', 'button button-primary', start),
        ui.button('Back to games', 'button button-secondary', () => navigate('play')),
      );
      panel.append(actions);
      container.replaceChildren(panel);
      return;
    }

    const counter = el('p', 'stat-value', `${collected.length} / ${CLEANUP_ITEMS.length} virtual items collected`);
    counter.setAttribute('role', 'status');
    panel.append(counter);
    const scene = el('div', 'cleanup-scene');
    scene.setAttribute('role', 'group');
    scene.setAttribute('aria-label', 'Simulated shoreline. Collect each virtual litter item.');
    let firstItem;
    for (const [index, item] of CLEANUP_ITEMS.entries()) {
      if (collected.includes(item.id)) continue;
      const button = ui.button(item.icon, 'cleanup-item', () => {
        const next = collectCleanupItem(collected, item.id);
        if (next === collected) return;
        collected = next;
        if (collected.length === CLEANUP_ITEMS.length) awardText = rewardMessage(onAward, notify, 'cleanup');
        render(collected.length === CLEANUP_ITEMS.length ? 'heading' : 'item');
      });
      button.setAttribute('aria-label', `Collect ${item.label.toLowerCase()} ${index + 1} of ${CLEANUP_ITEMS.length}`);
      button.style.left = `calc(${item.x * 100}% - ${item.x * 55}px)`;
      button.style.top = `calc(${item.y * 100}% - ${item.y * 55}px)`;
      scene.append(button);
      firstItem ??= button;
    }
    panel.append(scene);
    if (complete) panel.append(el('p', 'notice notice-success', awardText));
    else panel.append(el('p', '', 'Collect every item to finish this practice scene. Each item counts once.'));
    const actions = el('div', 'button-row');
    if (complete) actions.append(ui.button('Practice again', 'button button-primary', () => {
      collected = []; awardText = ''; render('item');
    }));
    actions.append(ui.button('Back to games', 'button button-secondary', () => navigate('play')));
    panel.append(actions);
    container.replaceChildren(panel);
    if (focusTarget === 'item' && firstItem) firstItem.focus();
    else if (focusTarget) focus(heading);
  }

  ui.listen(document, 'keydown', event => {
    if (started || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
    const target = event.target;
    if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)) return;
    if (event.key.length !== 1 || !/[a-z]/i.test(event.key)) { keys = ''; return; }
    keys = `${keys}${event.key.toLowerCase()}`.slice(-3);
    if (keys === 'sea') start();
  });
  render();
  return ui.cleanup;
}
