import {currentRows, gridValue, projectConcentration} from './current-transport.js';

const number = new Intl.NumberFormat(undefined, {maximumFractionDigits: 1});
const utc = new Intl.DateTimeFormat(undefined, {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit', timeZone:'UTC', timeZoneName:'short'});

export function mountCurrentTimeline(root, loadGrid) {
  const document = root.ownerDocument;
  const form = root.querySelector('form');
  const latitude = form.elements.latitude;
  const longitude = form.elements.longitude;
  const status = root.querySelector('[role="status"]');
  const results = root.querySelector('.current-results');
  const chart = results.querySelector('svg');
  const slider = results.querySelector('input');
  const output = results.querySelector('output');
  let request;

  function reset() {
    request?.abort();
    request = undefined;
    results.hidden = true;
  }

  function plot(rows) {
    const valid = rows.filter(row => row.density !== null);
    const min = Math.min(...valid.map(row => row.density));
    const max = Math.max(...valid.map(row => row.density));
    const padding = Math.max((max - min) * 0.12, 1);
    const low = Math.max(0, min - padding);
    const high = max + padding;
    const x = row => 92 + 530 * row.hour / (rows.length - 1);
    const y = row => 16 + 138 * (high - row.density) / (high - low);
    const svg = (tag, attributes, label) => {
      const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
      for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
      if (label) element.textContent = label;
      return element;
    };
    chart.replaceChildren();
    for (const value of [low, (low + high) / 2, high]) {
      const level = y({density: value});
      chart.append(svg('line', {x1:92, x2:622, y1:level, y2:level, stroke:'#cbdde5'}),
        svg('text', {x:84, y:level + 4, 'text-anchor':'end'}, number.format(value)));
    }
    chart.append(svg('text', {x:92, y:176}, 'Start'),
      svg('text', {x:622, y:176, 'text-anchor':'end'}, `+${rows.length - 1} h`));
    let path = '';
    let connect = false;
    for (const row of rows) {
      if (row.density === null) { connect = false; continue; }
      path += `${connect ? 'L' : 'M'} ${x(row)},${y(row)} `;
      connect = true;
    }
    const marker = svg('circle', {r:5, fill:'#145b75', stroke:'white', 'stroke-width':2});
    chart.append(svg('path', {d:path, fill:'none', stroke:'#077e86', 'stroke-width':3}), marker);
    slider.max = rows.length - 1;
    slider.value = '0';
    slider.oninput = () => {
      const row = rows[Number(slider.value)];
      marker.style.display = row.density === null ? 'none' : '';
      if (row.density !== null) {
        marker.setAttribute('cx', x(row));
        marker.setAttribute('cy', y(row));
      }
      const density = row.density === null ? 'Estimate unavailable' : `${number.format(row.density)} pieces/km²`;
      const current = row.speed === null ? 'Current unavailable' : `Flow ${number.format(row.speed)} km/h toward ${number.format(row.direction)}°`;
      output.textContent = `+${row.hour} h · ${utc.format(row.timestamp)} · ${density} · ${current}`;
      slider.setAttribute('aria-valuetext', output.textContent);
    };
    slider.oninput();
    results.hidden = false;
  }

  form.addEventListener('input', () => {
    reset();
    status.textContent = 'Run the scenario to update the timeline.';
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    reset();
    const controller = new AbortController();
    request = controller;
    const start = [longitude.valueAsNumber, latitude.valueAsNumber];
    const hours = Number(form.elements.horizon.value);
    status.textContent = 'Loading the baseline and marine currents…';
    const timeout = setTimeout(() => controller.abort(), 16000);
    try {
      const grid = await loadGrid();
      controller.signal.throwIfAborted();
      if (gridValue(grid, ...start) === null) {
        status.textContent = 'No offshore baseline here. Pick a colored offshore location in the global microplastics layer.';
        return;
      }
      const query = new URLSearchParams({
        longitude:start[0], latitude:start[1], hourly:'ocean_current_velocity,ocean_current_direction',
        forecast_hours:hours + 1, timezone:'GMT', wind_speed_unit:'kmh', cell_selection:'sea',
      });
      const response = await fetch(`https://marine-api.open-meteo.com/v1/marine?${query}`, {signal:controller.signal});
      if (!response.ok) throw new Error('The current provider is unavailable.');
      const data = await response.json();
      const rows = projectConcentration(grid, start, currentRows(data, hours));
      controller.signal.throwIfAborted();
      if (!rows.slice(1).some(row => row.density !== null)) {
        status.textContent = 'There is no supported transport estimate after the starting hour. Choose an offshore point or try again later.';
        return;
      }
      plot(rows);
      const hasGridCell = Number.isFinite(data.latitude) && Number.isFinite(data.longitude);
      const cell = hasGridCell ? ` Current grid cell: ${data.latitude.toFixed(2)}°, ${data.longitude.toFixed(2)}°.` : '';
      status.textContent = `Showing ${rows.length - 1} forecast hours from ${utc.format(rows[0].timestamp)}.${cell} Gaps indicate missing current or baseline coverage.`;
    } catch {
      if (request === controller) status.textContent = 'The timeline could not load. Check your connection and try again.';
    } finally { clearTimeout(timeout); }
  });

  return {
    selectPoint([lng, lat]) {
      reset();
      longitude.value = (((lng + 180) % 360 + 360) % 360 - 180).toFixed(4);
      latitude.value = lat.toFixed(4);
      status.textContent = 'Map location filled in. Choose a time window and run the scenario.';
      root.querySelector('h2').focus();
    },
    destroy: reset,
  };
}
