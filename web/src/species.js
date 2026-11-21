const API = 'https://www.marinespecies.org/rest';
const MAX_RESULTS = 8;
const RANKS = ['kingdom', 'phylum', 'class', 'order', 'family', 'genus'];

export class SpeciesSearchError extends Error {
  constructor(message, code, cause) {
    super(message, {cause});
    this.name = 'SpeciesSearchError';
    this.code = code;
  }
}

async function request(path, signal) {
  let response;
  try {
    response = await fetch(`${API}/${path}`, {signal, headers: {Accept: 'application/json'}});
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    if (error.name === 'TimeoutError') {
      throw new SpeciesSearchError('WoRMS took too long to respond. Please try again.', 'NETWORK', error);
    }
    throw new SpeciesSearchError('WoRMS could not be reached. Check your connection and try again.', 'NETWORK', error);
  }
  if (response.status === 204) return null;
  if (!response.ok) throw new SpeciesSearchError(`WoRMS returned HTTP ${response.status}. Please try again.`, 'HTTP');
  try {
    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new SpeciesSearchError('WoRMS returned an unreadable response. Please try again.', 'INVALID_RESPONSE', error);
  }
}

function validRecord(record) {
  return record && Number.isSafeInteger(record.AphiaID) && record.AphiaID > 0 &&
    typeof record.scientificname === 'string' && record.scientificname.length > 0;
}

async function records(path, signal) {
  const result = await request(path, signal);
  if (result === null) return [];
  if (!Array.isArray(result) || result.some(record => !validRecord(record))) {
    throw new SpeciesSearchError('WoRMS returned an unexpected records format.', 'INVALID_RESPONSE');
  }
  return result;
}

/**
 * Search official WoRMS names, exact vernacular names, then scientific prefixes.
 * An empty array means no matches; failures reject with SpeciesSearchError.
 * `status` and `originalName` describe the matched record. Classification,
 * authority, AphiaID and URL describe its accepted record when one exists.
 * Unknown classification ranks remain null. No occurrence/range is inferred.
 */
export async function searchTaxa(query, {signal} = {}) {
  const term = typeof query === 'string' ? query.trim().replace(/\s+/g, ' ') : '';
  if (!term) return [];
  if (term.length > 200) throw new SpeciesSearchError('Enter a species name of 200 characters or fewer.', 'INVALID_QUERY');
  signal?.throwIfAborted();
  const requestSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000);
  const name = encodeURIComponent(term);
  let found = await records(`AphiaRecordsByName/${name}?like=false&marine_only=true&offset=1`, requestSignal);
  if (!found.length) {
    found = await records(`AphiaRecordsByVernacular/${name}?like=false&offset=1`, requestSignal);
    found = found.filter(record => record.isMarine === 1);
  }
  if (!found.length) {
    found = await records(`AphiaRecordsByName/${name}?like=true&marine_only=true&offset=1`, requestSignal);
  }
  // Prefer an accepted record when the response also contains its synonyms.
  const unique = new Map();
  for (const record of found) {
    const id = record.valid_AphiaID || record.AphiaID;
    if (!unique.has(id) || record.status === 'accepted') unique.set(id, record);
  }
  return Promise.all([...unique.values()].slice(0, MAX_RESULTS).map(async original => {
    let record = original;
    if (original.valid_AphiaID && original.valid_AphiaID !== original.AphiaID) {
      record = await request(`AphiaRecordByAphiaID/${original.valid_AphiaID}`, requestSignal);
      if (!validRecord(record) || record.AphiaID !== original.valid_AphiaID) {
        throw new SpeciesSearchError('WoRMS could not resolve the accepted taxon.', 'INVALID_RESPONSE');
      }
    }
    return {
      acceptedScientificName: record.status === 'accepted' ? record.scientificname : null,
      aphiaId: record.AphiaID,
      status: original.status || 'unknown',
      acceptedStatus: record.status || 'unknown',
      authority: record.authority || null,
      classification: Object.fromEntries(RANKS.map(rank => [rank, record[rank] || null])),
      url: `https://www.marinespecies.org/aphia.php?p=taxdetails&id=${record.AphiaID}`,
      originalName: original.scientificname,
      originalAphiaId: original.AphiaID,
      citation: record.citation || null,
    };
  }));
}
