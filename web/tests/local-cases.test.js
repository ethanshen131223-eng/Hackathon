import test from 'node:test';
import assert from 'node:assert/strict';

const photo = 'data:image/png;base64,aGVsbG8=';
const manualCase = {
  id: 'local-case-1', title: 'Shoreline review', source: 'manual', mode: 'surface',
  createdAt: '2026-11-21T14:00:00.000Z', imageDataUrl: photo,
  findings: [{id: 'finding-1', label: 'Possible film', category: 'film', sizeMm: null,
    quantity: 2, notes: 'Unmeasured; possibly a leaf.', x: 0.25, y: 0.7, radius: 0.04}],
};

function durableStorage(initial = {cases: [], puzzles: []}) {
  const records = JSON.parse(JSON.stringify(initial));
  return {
    async list(kind) { return JSON.parse(JSON.stringify(records[kind])); },
    async put(kind, entry) {
      const index = records[kind].findIndex(item => item.id === entry.id);
      const copy = JSON.parse(JSON.stringify(entry));
      if (index < 0) records[kind].push(copy);
      else records[kind][index] = copy;
    },
  };
}

test('a manual review survives a JSON storage round trip with unknown size and its photo', async () => {
  const {createLocalRepository} = await import('../src/local-cases.js');
  const persistence = durableStorage();
  const repository = createLocalRepository({persistence});
  const result = await repository.saveCase(manualCase);
  assert.equal(result.persisted, true);
  const reopened = createLocalRepository({persistence});
  const saved = await reopened.loadCase('local-case-1');
  assert.deepEqual(saved, manualCase);
  saved.findings[0].notes = 'Changed outside the repository';
  assert.equal((await reopened.loadCase('local-case-1')).findings[0].notes, 'Unmeasured; possibly a leaf.');
});

test('saving an edited case updates its stable id without creating a duplicate', async () => {
  const {createLocalRepository} = await import('../src/local-cases.js');
  const repository = createLocalRepository({persistence: durableStorage()});
  await repository.saveCase(manualCase);
  await repository.saveCase({...manualCase, title: 'Updated review'});
  const records = await repository.listCases();
  assert.equal(records.length, 1);
  assert.equal(records[0].id, 'local-case-1');
  assert.equal(records[0].title, 'Updated review');
});

test('a denied persistent write retains the case in memory and reports that it is temporary', async () => {
  const {createLocalRepository} = await import('../src/local-cases.js');
  const repository = createLocalRepository({persistence: {
    async list() { return []; },
    async put() { throw new Error('Quota exceeded'); },
  }});
  const result = await repository.saveCase(manualCase);
  assert.equal(result.persisted, false);
  assert.equal(result.status.persistent, false);
  assert.match(result.status.reason, /Quota exceeded/);
  assert.deepEqual(await repository.loadCase('local-case-1'), manualCase);
});

test('unavailable browser storage keeps authored puzzles separate from manual cases', async () => {
  const {createLocalRepository} = await import('../src/local-cases.js');
  const repository = createLocalRepository({persistence: null});
  const puzzle = {id: 'puzzle-1', title: 'Find the fiber', source: 'user-authored',
    createdAt: '2026-11-21T14:05:00.000Z', imageDataUrl: photo,
    targets: [{id: 'target-1', label: 'Fiber', clue: 'Look near the corner',
      category: 'fiber', x: 0.2, y: 0.3, radius: 0.06}]};
  const result = await repository.savePuzzle(puzzle);
  assert.equal(result.persisted, false);
  assert.deepEqual(await repository.loadPuzzle('puzzle-1'), puzzle);
  assert.deepEqual(await repository.listCases(), []);
  assert.deepEqual(await repository.listPuzzles(), [puzzle]);
});

test('a corrupt stored record is skipped while valid records remain available', async () => {
  const {createLocalRepository} = await import('../src/local-cases.js');
  const repository = createLocalRepository({persistence: durableStorage({
    cases: [manualCase, {id: 'broken', title: 'Missing image and findings'}], puzzles: [],
  })});
  assert.deepEqual(await repository.listCases(), [manualCase]);
});

test('previously read records remain available when browser storage later becomes unreadable', async () => {
  const {createLocalRepository} = await import('../src/local-cases.js');
  let unavailable = false;
  const repository = createLocalRepository({persistence: {
    async list() { if (unavailable) throw new Error('Access denied'); return [manualCase]; },
    async put() {},
  }});
  assert.deepEqual(await repository.listCases(), [manualCase]);
  unavailable = true;
  assert.deepEqual(await repository.loadCase('local-case-1'), manualCase);
  assert.equal(repository.getStatus().persistent, false);
});

test('invalid positions, unsupported images, and guessed negative measurements are rejected', async () => {
  const {createLocalRepository} = await import('../src/local-cases.js');
  const repository = createLocalRepository({persistence: null});
  await assert.rejects(repository.saveCase({...manualCase, findings: [
    {...manualCase.findings[0], x: 1.2},
  ]}), /position/i);
  await assert.rejects(repository.saveCase({...manualCase, findings: [
    {...manualCase.findings[0], sizeMm: -1},
  ]}), /size/i);
  await assert.rejects(repository.saveCase({...manualCase, imageDataUrl: 'https://example.com/image.png'}), /local image/i);
  await assert.rejects(repository.savePuzzle({id: 'empty', title: 'Empty',
    imageDataUrl: photo, createdAt: manualCase.createdAt, targets: []}), /target/i);
});

test('photo admission rejects oversized, empty, and unsupported local images', async () => {
  const {validateImageFile} = await import('../src/workbench.js');
  assert.doesNotThrow(() => validateImageFile({type: 'image/png', size: 1024}));
  assert.doesNotThrow(() => validateImageFile({type: 'image/webp', size: 12 * 1024 * 1024}));
  assert.throws(() => validateImageFile({type: 'image/jpeg', size: 12 * 1024 * 1024 + 1}), /12 MB/);
  assert.throws(() => validateImageFile({type: 'image/tiff', size: 1024}), /JPEG, PNG, or WebP/);
  assert.throws(() => validateImageFile({type: 'image/svg+xml', size: 1024}), /JPEG, PNG, or WebP/);
  assert.throws(() => validateImageFile({type: 'image/png', size: 0}), /empty/i);
});

test('image coordinates use the displayed image bounds and reject clicks outside them', async () => {
  const {imagePoint} = await import('../src/workbench.js');
  const bounds = {left: 100, top: 200, width: 400, height: 200};
  assert.deepEqual(imagePoint({clientX: 200, clientY: 350}, bounds), {x: 0.25, y: 0.75});
  assert.equal(imagePoint({clientX: 99, clientY: 350}, bounds), null);
  assert.equal(imagePoint({clientX: 200, clientY: 401}, bounds), null);
  assert.equal(imagePoint({clientX: 200, clientY: 350}, {...bounds, width: 0}), null);
});

test('preview resizing preserves aspect ratio and limits the longest side to 1400 pixels', async () => {
  const {previewDimensions} = await import('../src/workbench.js');
  assert.deepEqual(previewDimensions(4000, 2000), {width: 1400, height: 700});
  assert.deepEqual(previewDimensions(1000, 2000), {width: 700, height: 1400});
  assert.deepEqual(previewDimensions(600, 300), {width: 600, height: 300});
  assert.throws(() => previewDimensions(0, 100), /read/i);
});

test('authored puzzle testing finds actual targets and distinguishes repeated discoveries', async () => {
  const {targetAtPoint} = await import('../src/workbench.js');
  const targets = [{id: 'a', x: 0.3, y: 0.5, radius: 0.04},
    {id: 'b', x: 0.8, y: 0.2, radius: 0.05}];
  assert.equal(targetAtPoint(targets, {x: 0.31, y: 0.49})?.id, 'a');
  assert.equal(targetAtPoint(targets, {x: 0.31, y: 0.49}, new Set(['a'])), null);
  assert.equal(targetAtPoint(targets, {x: 0.5, y: 0.5}), null);
});
