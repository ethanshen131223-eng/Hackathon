const UNKNOWN = 'Not reported by source';
const unknown = value => value == null || (typeof value === 'string' &&
  /^(?:\s*|not[ _-]?reported|unknown)$/i.test(value.trim()));
const text = value => unknown(value) ? UNKNOWN : String(value);
const area = value => typeof value !== 'number' || !Number.isFinite(value) || value < 0
  ? UNKNOWN : value > 0 && value < .001 ? '<0.001 km²'
    : `${value.toLocaleString('en-CA', {maximumFractionDigits: 3})} km²`;

/** Shared source record for the globe and ocean map; source strings are always text. */
export function createProtectedAreaDetails(document, properties = {}) {
  const node = (tag, value, className = '') => {
    const result = document.createElement(tag); result.textContent = value; result.className = className; return result;
  };
  const content = document.createDocumentFragment();
  content.append(node('span', 'Protected Planet record', 'area-source-label'), node('h2', properties.name || 'Unnamed protected area'));
  const list = node('dl', '', 'protected-area-facts');
  const rows = [
    ['Designation', text(properties.designation)], ['Source status', text(properties.status)],
    ['Realm', text(properties.realm)], ['IUCN management category', text(properties.iucnCategory)],
    ['Status year', properties.statusYear > 0 ? text(properties.statusYear) : UNKNOWN],
    ['Reported area', area(properties.reportedAreaKm2)], ['Reported marine area', area(properties.reportedMarineAreaKm2)],
    ['Governance', text(properties.governance)], ['Management authority', text(properties.managementAuthority)],
    ['No-take coverage', text(properties.noTake)],
    // A zero area is also supplied for sites with no reported no-take information.
    ['Reported no-take area', unknown(properties.noTake) ? UNKNOWN : area(properties.noTakeAreaKm2)],
    ['Country / territory codes', text(properties.countryCodes)], ['Parent country codes', text(properties.parentCountryCodes)],
  ];
  for (const [label, value] of rows) list.append(node('dt', label), node('dd', value));
  content.append(list);
  try {
    const url = new URL(properties.sourceUrl);
    if (url.protocol === 'https:' && url.hostname === 'www.protectedplanet.net' && !url.username && !url.password && !url.port) {
      const link = node('a', 'View the Protected Planet record');
      link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; content.append(link);
    }
  } catch { /* A missing or invalid source URL cannot become a clickable link. */ }
  content.append(node('p', 'UNEP-WCMC and IUCN source record. Areas are reported km², not calculations from the simplified boundary. A zero is a source value. Status and no-take reporting do not establish enforcement, ecosystem condition or pollution levels; check the original record for site rules.', 'area-limits'));
  return content;
}
