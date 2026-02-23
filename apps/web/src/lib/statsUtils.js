const DAY_MS = 24 * 60 * 60 * 1000;

function formatDayAnchor(dateLike) {
  return new Date(dateLike).toISOString().slice(0, 10);
}

function formatMonthAnchor(dateLike) {
  return new Date(dateLike).toISOString().slice(0, 7);
}

export function shiftAnchor(anchor, range, delta) {
  if (range === 'month') {
    const [y, m] = String(anchor).split('-').map((n) => Number(n));
    const base = new Date(Date.UTC(Number.isFinite(y) ? y : new Date().getUTCFullYear(), (Number.isFinite(m) ? m : 1) - 1, 1));
    base.setUTCMonth(base.getUTCMonth() + delta);
    return formatMonthAnchor(base);
  }

  const base = new Date(`${anchor}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + delta);
  return formatDayAnchor(base);
}

export function createStatsConfig(range = 'day') {
  const now = new Date();
  return {
    range,
    anchor: range === 'month' ? formatMonthAnchor(now) : formatDayAnchor(now),
  };
}

export function getStatsDomainBounds(config, fallbackPoints = []) {
  if (!config || !config.anchor) {
    if (fallbackPoints.length) {
      const first = Number(fallbackPoints[0].ts);
      const last = Number(fallbackPoints[fallbackPoints.length - 1].ts);
      return {
        startTs: Number.isFinite(first) ? first : Date.now(),
        endTs: Number.isFinite(last) && last > first ? last : (Number.isFinite(first) ? first + 1 : Date.now() + 1),
      };
    }
    const now = Date.now();
    return { startTs: now - DAY_MS, endTs: now };
  }

  if (config.range === 'month') {
    const [yRaw, mRaw] = String(config.anchor).split('-').map((n) => Number(n));
    const year = Number.isFinite(yRaw) ? yRaw : new Date().getUTCFullYear();
    const month = Number.isFinite(mRaw) ? mRaw : new Date().getUTCMonth() + 1;
    const startTs = Date.UTC(year, month - 1, 1, 0, 0, 0, 0);
    const endTs = Date.UTC(year, month, 1, 0, 0, 0, 0) - 1;
    return { startTs, endTs };
  }

  const startTs = Date.parse(`${config.anchor}T00:00:00.000Z`);
  const endTs = Date.parse(`${config.anchor}T23:59:59.999Z`);
  if (Number.isFinite(startTs) && Number.isFinite(endTs) && endTs > startTs) {
    return { startTs, endTs };
  }

  const now = Date.now();
  return { startTs: now - DAY_MS, endTs: now };
}

export function buildSeriesPath(points, width, height, getValue, minY, maxY, domainStartTs, domainEndTs) {
  if (!points.length || !Number.isFinite(minY) || !Number.isFinite(maxY) || minY === maxY) {
    return '';
  }

  const firstTs = Number.isFinite(domainStartTs) ? Number(domainStartTs) : Number(points[0].ts);
  const lastTs = Number.isFinite(domainEndTs) ? Number(domainEndTs) : Number(points[points.length - 1].ts);
  const spanTs = Math.max(1, lastTs - firstTs);
  const innerW = width - 24;
  const innerH = height - 4;
  const topPad = 2;
  const leftPad = 12;

  let path = '';
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const pointTs = Number(p.ts);
    if (!Number.isFinite(pointTs) || pointTs < firstTs || pointTs > lastTs) continue;
    const value = getValue(p);
    if (!Number.isFinite(value)) continue;
    const x = leftPad + ((pointTs - firstTs) / spanTs) * innerW;
    const y = topPad + (1 - (value - minY) / (maxY - minY)) * innerH;
    path += path ? ` L ${x} ${y}` : `M ${x} ${y}`;
  }
  return path;
}

export function buildSeriesCoordinates(points, width, height, getValue, minY, maxY, domainStartTs, domainEndTs) {
  if (!points.length || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return [];
  }

  const firstTs = Number.isFinite(domainStartTs) ? Number(domainStartTs) : Number(points[0].ts);
  const lastTs = Number.isFinite(domainEndTs) ? Number(domainEndTs) : Number(points[points.length - 1].ts);
  const spanTs = Math.max(1, lastTs - firstTs);
  const innerW = width - 24;
  const innerH = height - 4;
  const topPad = 2;
  const leftPad = 12;
  const ySpan = Math.max(0.01, maxY - minY);

  const coords = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const pointTs = Number(p.ts);
    if (!Number.isFinite(pointTs) || pointTs < firstTs || pointTs > lastTs) continue;
    const value = getValue(p);
    if (!Number.isFinite(value)) continue;
    const x = leftPad + ((pointTs - firstTs) / spanTs) * innerW;
    const y = topPad + (1 - (value - minY) / ySpan) * innerH;
    coords.push({ x, y, value });
  }
  return coords;
}

export function buildSeriesAreaPath(coords, baselineY) {
  if (!Array.isArray(coords) || coords.length < 2) return '';
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (!first || !last) return '';

  let path = `M ${first.x} ${baselineY} L ${first.x} ${first.y}`;
  for (let i = 1; i < coords.length; i += 1) {
    const pt = coords[i];
    path += ` L ${pt.x} ${pt.y}`;
  }
  path += ` L ${last.x} ${baselineY} Z`;
  return path;
}

export function formatStatsTimestamp(ts, range) {
  const date = new Date(Number(ts));
  if (Number.isNaN(date.getTime())) return '--';
  if (range === 'month') {
    return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatStatsAxisLabel(ts, range) {
  const date = new Date(Number(ts));
  if (Number.isNaN(date.getTime())) return '--';
  if (range === 'month') {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
