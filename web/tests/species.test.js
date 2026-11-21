import test from 'node:test';
import assert from 'node:assert/strict';
import {searchTaxa} from '../src/species.js';

// Hand-checked WoRMS-shaped fixtures; do not derive expected names/taxonomy
// with production normalization code.
const accepted = {
  AphiaID: 137206, url: 'https://www.marinespecies.org/aphia.php?p=taxdetails&id=137206',
  scientificname: 'Chelonia mydas', authority: '(Linnaeus, 1758)', status: 'accepted',
  unacceptreason: null, taxonRankID: 220, rank: 'Species', valid_AphiaID: 137206,
  valid_name: 'Chelonia mydas', valid_authority: '(Linnaeus, 1758)',
  parentNameUsageID: 137067, originalNameUsageID: 1375871,
  kingdom: 'Animalia', phylum: 'Chordata', class: null, order: 'Testudines',
  family: 'Cheloniidae', genus: 'Chelonia', citation: 'WoRMS fixture citation',
  lsid: 'urn:lsid:marinespecies.org:taxname:137206', isMarine: 1,
  isBrackish: null, isFreshwater: null, isTerrestrial: null, isExtinct: null,
  match_type: 'exact', modified: '2019-09-09T20:15:59.473Z',
};
const synonym = {
  ...accepted, AphiaID: 1375871, scientificname: 'Testudo mydas',
  authority: 'Linnaeus, 1758', status: 'unaccepted', parentNameUsageID: 1298343,
  url: 'https://www.marinespecies.org/aphia.php?p=taxdetails&id=1375871',
  family: 'Testudinidae', genus: 'Testudo', isBrackish: 0, isFreshwater: 0,
  isTerrestrial: 0, isExtinct: 0,
};
const json = value => new Response(JSON.stringify(value), {status: 200});

test('accepted scientific-name search exposes source taxonomy without filling unknown class', async t => {
  t.mock.method(globalThis, 'fetch', async () => json([accepted]));
  const results = await searchTaxa('Chelonia mydas');
  assert.equal(results.length, 1);
  assert.equal(results[0].acceptedScientificName, 'Chelonia mydas');
  assert.equal(results[0].aphiaId, 137206);
  assert.equal(results[0].authority, '(Linnaeus, 1758)');
  assert.deepEqual(results[0].classification, {kingdom: 'Animalia', phylum: 'Chordata',
    class: null, order: 'Testudines', family: 'Cheloniidae', genus: 'Chelonia'});
  assert.equal(results[0].url, 'https://www.marinespecies.org/aphia.php?p=taxdetails&id=137206');
});

test('a synonym resolves to accepted identity and accepted family instead of old taxonomy', async t => {
  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(input);
    return json(url.pathname.endsWith('/AphiaRecordByAphiaID/137206') ? accepted : [synonym]);
  });
  const [result] = await searchTaxa('Testudo mydas');
  assert.equal(result.acceptedScientificName, 'Chelonia mydas');
  assert.equal(result.aphiaId, 137206);
  assert.equal(result.originalName, 'Testudo mydas');
  assert.equal(result.status, 'unaccepted');
  assert.equal(result.classification.family, 'Cheloniidae');
  assert.equal(result.classification.genus, 'Chelonia');
});

test('a common name falls back to the official vernacular endpoint', async t => {
  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(input);
    return url.pathname.includes('/AphiaRecordsByVernacular/green%20turtle')
      ? json([accepted]) : new Response(null, {status: 204});
  });
  assert.equal((await searchTaxa('green turtle'))[0].acceptedScientificName, 'Chelonia mydas');
});

test('no matches remains distinct from an unavailable service', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(null, {status: 204}));
  assert.deepEqual(await searchTaxa('no-such-marine-taxon'), []);
  t.mock.method(globalThis, 'fetch', async () => {throw new TypeError('Failed to fetch');});
  await assert.rejects(searchTaxa('Chelonia mydas'), error => error.code === 'NETWORK');
});

test('a failed service response is surfaced instead of being called no matches', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('Unavailable', {status: 503}));
  await assert.rejects(searchTaxa('Chelonia mydas'), error => error.code === 'HTTP');
});

test('malformed success payload is rejected instead of being called no matches', async t => {
  t.mock.method(globalThis, 'fetch', async () => json({error: 'not a records array'}));
  await assert.rejects(searchTaxa('Chelonia mydas'), error => error.code === 'INVALID_RESPONSE');
});

test('cancellation remains an AbortError', async t => {
  const controller = new AbortController();
  controller.abort();
  t.mock.method(globalThis, 'fetch', async () => {throw new DOMException('Aborted', 'AbortError');});
  await assert.rejects(searchTaxa('Chelonia mydas', {signal: controller.signal}), {name: 'AbortError'});
});

test('repeated accepted IDs are deduplicated and broad results are bounded', async t => {
  const records = Array.from({length: 20}, (_, i) => ({...accepted,
    AphiaID: 300000 + i, valid_AphiaID: 300000 + i,
    scientificname: `Marine species${i}`, valid_name: `Marine species${i}`}));
  t.mock.method(globalThis, 'fetch', async () => json([records[0], records[0], ...records]));
  const results = await searchTaxa('Marine');
  assert.equal(results.length, 8);
  assert.equal(new Set(results.map(result => result.aphiaId)).size, 8);
});

test('empty or overlong queries do not trigger a remote search', async t => {
  t.mock.method(globalThis, 'fetch', async () => {throw new Error('Unexpected request');});
  assert.deepEqual(await searchTaxa('  '), []);
  await assert.rejects(searchTaxa('a'.repeat(201)), error => error.code === 'INVALID_QUERY');
});
