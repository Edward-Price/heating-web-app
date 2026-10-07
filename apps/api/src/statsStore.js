const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DEFAULT_DB_PATH = path.resolve(__dirname, '../../data/stats.sqlite');
const LEGACY_JSONL_PATH = path.resolve(__dirname, '../../data/stats.jsonl');
const DB_PATH = process.env.STATS_DB_PATH || DEFAULT_DB_PATH;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TZ_OFFSET_MINUTES = 14 * 60;

function ensureDbDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

ensureDbDir();
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS zone_samples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    collected_at TEXT NOT NULL,
    device_id INTEGER NOT NULL,
    name TEXT,
    type TEXT,
    current_temp REAL,
    target_temp REAL
  );

  CREATE INDEX IF NOT EXISTS idx_zone_samples_device_ts
    ON zone_samples(device_id, ts);
`);

function migrateLegacyJsonlIfNeeded() {
  const hasRows = db.prepare('SELECT COUNT(1) AS c FROM zone_samples').get().c > 0;
  if (hasRows || !fs.existsSync(LEGACY_JSONL_PATH)) return;

  const text = fs.readFileSync(LEGACY_JSONL_PATH, 'utf8');
  if (!text.trim()) return;

  const insert = db.prepare(`
    INSERT INTO zone_samples (ts, collected_at, device_id, name, type, current_temp, target_temp)
    VALUES (@ts, @collected_at, @device_id, @name, @type, @current_temp, @target_temp)
  `);

  const rows = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (_err) {
        return null;
      }
    })
    .filter(Boolean)
    .map((row) => ({
      ts: Number(row.ts),
      collected_at: typeof row.collectedAt === 'string' ? row.collectedAt : new Date(Number(row.ts)).toISOString(),
      device_id: Number(row.deviceId),
      name: row.name ? String(row.name) : null,
      type: row.type ? String(row.type) : null,
      current_temp: Number.isFinite(Number(row.currentTemp)) ? Number(row.currentTemp) : null,
      target_temp: Number.isFinite(Number(row.targetTemp)) ? Number(row.targetTemp) : null,
    }))
    .filter((row) => Number.isFinite(row.ts) && Number.isFinite(row.device_id));

  if (!rows.length) return;

  const tx = db.transaction((batch) => {
    for (const row of batch) insert.run(row);
  });
  tx(rows);

  const backupPath = `${LEGACY_JSONL_PATH}.migrated`;
  fs.renameSync(LEGACY_JSONL_PATH, backupPath);
  console.log(`[api][stats] migrated ${rows.length} legacy JSONL samples to sqlite (${backupPath})`);
}

migrateLegacyJsonlIfNeeded();

function startOfUtcDay(ts) {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function startOfUtcMonth(ts) {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

function parseAnchor(range, anchor) {
  if (!anchor || typeof anchor !== 'string') return Date.now();
  if (range === 'month') {
    const m = anchor.match(/^(\d{4})-(\d{2})$/);
    if (m) {
      return Date.UTC(Number(m[1]), Number(m[2]) - 1, 1);
    }
  }
  const d = anchor.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (d) {
    return Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]));
  }
  return Date.now();
}

function formatDayAnchor(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

function formatMonthAnchor(ts) {
  return new Date(ts).toISOString().slice(0, 7);
}

const insertSampleStmt = db.prepare(`
  INSERT INTO zone_samples (ts, collected_at, device_id, name, type, current_temp, target_temp)
  VALUES (@ts, @collected_at, @device_id, @name, @type, @current_temp, @target_temp)
`);

const insertSamplesTx = db.transaction((rows) => {
  for (const row of rows) {
    insertSampleStmt.run(row);
  }
});

function appendSnapshot({ collectedAt, points }) {
  const at = collectedAt || new Date().toISOString();
  const ts = Date.parse(at);
  if (!Number.isFinite(ts)) return 0;

  const safePoints = Array.isArray(points) ? points : [];
  const rows = safePoints
    .map((point) => ({
      ts,
      collected_at: at,
      device_id: Number(point && point.deviceId),
      name: point && point.name ? String(point.name) : null,
      type: point && point.type ? String(point.type) : null,
      current_temp: Number.isFinite(Number(point && point.currentTemp)) ? Number(point.currentTemp) : null,
      target_temp: Number.isFinite(Number(point && point.targetTemp)) ? Number(point.targetTemp) : null,
    }))
    .filter((row) => Number.isFinite(row.device_id))
    .filter((row) => row.current_temp !== null || row.target_temp !== null);

  if (!rows.length) return 0;
  insertSamplesTx(rows);
  return rows.length;
}

const readRangeStmt = db.prepare(`
  SELECT ts, current_temp AS currentTemp, target_temp AS targetTemp
  FROM zone_samples
  WHERE device_id = ?
    AND ts >= ?
    AND ts < ?
  ORDER BY ts ASC
`);

// `tzOffsetMinutes` uses Date#getTimezoneOffset semantics (UTC minus local, e.g. -60 for BST), so day and
// month windows line up with the viewer's local midnight rather than UTC midnight.
function queryZoneSeries({ zoneId, range = 'day', anchor, tzOffsetMinutes = 0 }) {
  const id = Number(zoneId);
  if (!Number.isFinite(id)) {
    return {
      zoneId: id,
      range,
      anchor: null,
      points: [],
      pointCount: 0,
      from: null,
      to: null,
    };
  }

  const offsetMinutes = Number(tzOffsetMinutes);
  const offsetMs = Number.isFinite(offsetMinutes) && Math.abs(offsetMinutes) <= MAX_TZ_OFFSET_MINUTES
    ? offsetMinutes * 60 * 1000
    : 0;
  const anchorTs = parseAnchor(range, anchor);
  let from = startOfUtcDay(anchorTs);
  let to = from + DAY_MS;

  if (range === 'month') {
    from = startOfUtcMonth(anchorTs);
    const d = new Date(from);
    to = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  }
  from += offsetMs;
  to += offsetMs;

  // Only return genuine recorded samples. No fabricated/dummy data.
  const dbRows = readRangeStmt.all(id, from, to);

  let points = dbRows.map((row) => ({
    timestamp: new Date(Number(row.ts)).toISOString(),
    ts: Number(row.ts),
    currentTemp: Number.isFinite(Number(row.currentTemp)) ? Number(row.currentTemp) : null,
    targetTemp: Number.isFinite(Number(row.targetTemp)) ? Number(row.targetTemp) : null,
  }));

  if (range === 'month') {
    const byDay = new Map();
    for (const row of points) {
      const dayKey = formatDayAnchor(Number(row.ts) - offsetMs);
      if (!byDay.has(dayKey)) {
        byDay.set(dayKey, { current: [], target: [] });
      }
      const bucket = byDay.get(dayKey);
      if (Number.isFinite(Number(row.currentTemp))) bucket.current.push(Number(row.currentTemp));
      if (Number.isFinite(Number(row.targetTemp))) bucket.target.push(Number(row.targetTemp));
    }

    points = Array.from(byDay.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([dayKey, values]) => {
        const currentAvg = values.current.length
          ? values.current.reduce((sum, n) => sum + n, 0) / values.current.length
          : null;
        const targetAvg = values.target.length
          ? values.target.reduce((sum, n) => sum + n, 0) / values.target.length
          : null;
        const noonTs = Date.parse(`${dayKey}T12:00:00.000Z`) + offsetMs;
        return {
          timestamp: new Date(noonTs).toISOString(),
          ts: noonTs,
          currentTemp: currentAvg,
          targetTemp: targetAvg,
        };
      });
  }

  return {
    zoneId: id,
    range,
    anchor: range === 'month' ? formatMonthAnchor(anchorTs) : formatDayAnchor(anchorTs),
    points,
    pointCount: points.length,
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
  };
}

module.exports = {
  appendSnapshot,
  queryZoneSeries,
};
