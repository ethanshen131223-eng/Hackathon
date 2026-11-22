import {ScatterplotLayer} from '@deck.gl/layers';
import {hostedDocument} from './hosted-data.js';

function zoomStep(zoom) {
  return zoom < 3 ? 6 : zoom < 5 ? 2 : zoom < 7 ? 0.5 : zoom < 9 ? 0.1 : 0;
}
export function groupObservations(samples, zoom) {
  const step = zoomStep(zoom);
  const groups = new Map();
  for (const sample of samples) {
    const [longitude, latitude] = sample;
    const key = step
      ? `${Math.floor((longitude + 180) / step)}:${Math.floor((latitude + 90) / step)}`
      : `${longitude}:${latitude}`;
    if (!groups.has(key)) groups.set(key, {position: [longitude, latitude], samples: []});
    groups.get(key).samples.push(sample);
  }
  return [...groups.values()];
}

const catalogs = {
  noaa: {file: 'noaa-microplastics', title: 'NOAA field sample'},
  river: {file: 'river-plastic', title: 'Modeled river outfall'},
};
const number = new Intl.NumberFormat(undefined, {maximumSignificantDigits: 5});

export function mountWasteObservations(document, {redraw, focusWorld}) {
  const kind = document.getElementById('waste-evidence');
  const medium = document.getElementById('waste-medium');
  const mediumLabel = document.getElementById('waste-medium-label');
  const status = document.getElementById('waste-status');
  const popup = document.getElementById('tile-info');
  let catalog, filtered = [], grouped = [], step, generation = 0;
  const node = (tag, text) => {
    const element = document.createElement(tag);
    element.textContent = text;
    return element;
  };
  function sourceLink(label, url) {
    const link = node('a', label);
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return link;
  }
  function updateFilter() {
    if (!catalog) return;
    filtered = kind.value === 'noaa' && medium.value
      ? catalog.samples.filter(sample => sample[3] === medium.value)
      : catalog.samples;
    step = undefined;
    const statement = kind.value === 'noaa'
      ? `${filtered.length.toLocaleString()} NOAA field samples. Click a teal marker for a measurement. Larger markers group more records.`
      : `${filtered.length.toLocaleString()} modeled river outfalls. Click an amber marker for an annual emissions estimate. Larger markers group more outfalls.`;
    status.replaceChildren(document.createTextNode(`${statement} `), sourceLink('Dataset and methods', catalog.source));
    popup.hidden = true;
    redraw();
  }
  async function selectKind(value) {
    const ticket = ++generation;
    kind.value = value;
    catalog = null;
    popup.hidden = true;
    medium.hidden = true;
    mediumLabel.hidden = true;
    status.hidden = !catalogs[value];
    redraw();
    if (!catalogs[value]) return;
    status.textContent = 'Loading waste records…';
    try {
      const data = await hostedDocument(catalogs[value].file);
      if (ticket !== generation) return;
      catalog = data;
      if (value === 'noaa') {
        const settings = [...new Set(catalog.samples.map(sample => sample[3]).filter(Boolean))].sort();
        medium.replaceChildren(...[['', 'All settings'], ...settings.map(name => [name, name])].map(([value, label]) => {
          const option = node('option', label);
          option.value = value;
          return option;
        }));
        medium.hidden = false;
        mediumLabel.hidden = false;
      }
      focusWorld();
      updateFilter();
    } catch {
      if (ticket === generation) status.textContent = 'This source could not load. Select another source or try again.';
    }
  }
  function show(group, type) {
    let index = 0;
    const source = catalog.source;
    function render() {
      const [lng, lat, id, ...fields] = group.samples[index];
      popup.replaceChildren(node('h2', catalogs[type].title), node('p', `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`));
      if (type === 'noaa') {
        const [setting, measurement, unit, date, method, ocean, beach, depth, mesh, reference, accession] = fields;
        popup.append(node('p', measurement == null
          ? 'Concentration unavailable'
          : `${number.format(measurement)} ${unit || '(unit unreported)'}`));
        popup.append(node('p', [setting, ocean, beach].filter(Boolean).join(' · ')),
          node('p', `Collected: ${date || 'Date unavailable'}`));
        if (method) popup.append(node('p', `Sampling method: ${method}`));
        if (Number.isFinite(depth)) popup.append(node('p', `Sample depth: ${depth} m`));
        if (Number.isFinite(mesh)) popup.append(node('p', `Mesh size: ${mesh} mm`));
        if (reference) popup.append(node('p', reference));
        if (Number.isInteger(accession) && accession > 0) popup.append(sourceLink('NOAA archive record',
          `https://www.ncei.noaa.gov/access/metadata/landing-page/bin/iso?id=gov.noaa.nodc:${accession}`));
      } else {
        popup.append(node('p', `${number.format(fields[0])} metric tonnes per year`),
          node('p', `Midpoint scenario from Meijer et al. (2021), outfall ${id}. This estimates plastic entering the ocean.`));
      }
      const links = node('p', '');
      links.append(sourceLink('Dataset and methods', source));
      popup.append(links);
      const controls = node('div', '');
      controls.className = 'waste-record-controls';
      for (const [label, offset] of [['Previous record', -1], ['Next record', 1]]) {
        if (group.samples.length === 1) break;
        const button = node('button', label);
        button.type = 'button';
        button.className = 'text-button';
        button.disabled = index + offset < 0 || index + offset >= group.samples.length;
        button.onclick = () => { index += offset; render(); };
        controls.append(button);
      }
      const close = node('button', 'Close details');
      close.type = 'button';
      close.className = 'text-button';
      close.onclick = () => { popup.hidden = true; };
      if (group.samples.length > 1) popup.append(node('p', `Record ${index + 1} of ${group.samples.length} grouped nearby`), controls);
      popup.append(close);
    }
    render();
    popup.hidden = false;
  }
  kind.onchange = () => selectKind(kind.value);
  medium.onchange = updateFilter;
  return {
    selectKind,
    needsRedraw: zoom => Boolean(catalog) && step !== zoomStep(zoom),
    layer(zoom) {
      if (!catalog) return [];
      if (step !== zoomStep(zoom)) {
        step = zoomStep(zoom);
        grouped = groupObservations(filtered, zoom);
      }
      return [createWasteObservationLayer({groups: grouped, kind: kind.value, onSelect: show})];
    },
  };
}

export function createWasteObservationLayer({groups, kind, onSelect}) {
  const color = kind === 'noaa' ? [39, 246, 209, 235] : [255, 171, 62, 235];
  return new ScatterplotLayer({
    id: `waste-observations-${kind}`,
    data: groups,
    pickable: true,
    radiusUnits: 'pixels',
    stroked: true,
    lineWidthUnits: 'pixels',
    getLineWidth: 1,
    getLineColor: [14, 39, 54, 220],
    getFillColor: color,
    getPosition: group => group.position,
    getRadius: group => Math.min(13, 3.5 + Math.log2(group.samples.length) * 1.35),
    onClick: ({object}) => {
      if (object) onSelect(object, kind);
    },
  });
}
