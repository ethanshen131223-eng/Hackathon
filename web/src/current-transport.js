const HOUR_MS = 3_600_000;
const KM_PER_DEGREE = 111.195;
const RAD = Math.PI / 180;
const wrap = longitude => ((longitude + 180) % 360 + 360) % 360 - 180;
const column = longitude => ((longitude % 360) + 360) % 360;

export function gridValue(grid, longitude, latitude) {
  const [west, south, east, north] = grid.bounds;
  longitude = wrap(longitude);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || latitude <= south || latitude > north) return null;
  const x = Math.floor((longitude - west) * grid.maskWidth / (east - west));
  const y = Math.floor((north - latitude) * grid.maskHeight / (north - south));
  const index = y * grid.maskWidth + x;
  if (!(grid.mask.charCodeAt(index >> 3) & (128 >> (index % 8)))) return null;
  const r = 90 - latitude;
  const row = Math.floor(r);
  const col = Math.floor(longitude);
  const dr = r - row;
  const dc = longitude - col;
  const corners = [
    [grid.values[row][column(col)], (1 - dr) * (1 - dc)],
    [grid.values[row][column(col + 1)], (1 - dr) * dc],
    [grid.values[row + 1][column(col)], dr * (1 - dc)],
    [grid.values[row + 1][column(col + 1)], dr * dc],
  ].filter(([, weight]) => weight > 0);
  if (corners.every(([value]) => Number.isFinite(value))) {
    return corners.reduce((total, [value, weight]) => total + value * weight, 0);
  }
  return grid.values[Math.round(r)][column(Math.floor(longitude + 0.5))] ?? null;
}

export function currentRows(data, hours) {
  const {time, ocean_current_velocity: speeds, ocean_current_direction: directions} = data.hourly ?? {};
  if (data.hourly_units?.ocean_current_velocity !== 'km/h' ||
    ![time, speeds, directions].every(Array.isArray) || time.length < 2) {
    throw new Error('The current provider did not return an hourly series in km/h.');
  }
  return time.slice(0, hours + 1).map((iso, i) => {
    const timestamp = Date.parse(`${iso}Z`);
    const speed = speeds[i];
    const direction = directions[i];
    const valid = Number.isFinite(speed) && speed >= 0 && speed <= 25 &&
      ((Number.isFinite(direction) && direction >= 0 && direction <= 360) || speed === 0);
    if (!Number.isFinite(timestamp)) throw new Error('The current provider returned an invalid time.');
    return {timestamp, speed: valid ? speed : null, direction: valid ? (direction ?? 0) : null};
  });
}

export function projectConcentration(grid, start, currents) {
  return currents.map(({timestamp, speed, direction}, hour) => {
    let [longitude, latitude] = start;
    let density = gridValue(grid, longitude, latitude);
    let distance = 0;
    for (let step = hour - 1; step >= 0 && density !== null; step--) {
      const current = currents[step];
      if (current.speed === null || currents[step + 1].timestamp - current.timestamp !== HOUR_MS) {
        density = null;
        break;
      }
      const substeps = Math.max(1, Math.ceil(current.speed / 5));
      const km = current.speed / substeps;
      for (let i = 0; i < substeps; i++) {
        const midLatitude = latitude - Math.cos(current.direction * RAD) * km / KM_PER_DEGREE / 2;
        longitude = wrap(longitude - Math.sin(current.direction * RAD) * km / (KM_PER_DEGREE * Math.cos(midLatitude * RAD)));
        latitude -= Math.cos(current.direction * RAD) * km / KM_PER_DEGREE;
        distance += km;
        density = gridValue(grid, longitude, latitude);
        if (density === null) break;
      }
    }
    return {timestamp, speed, direction, hour, density, distance};
  });
}
