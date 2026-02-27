const http = require('http');
const fs = require('fs');
const path = require('path');

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('\"') && value.endsWith('\"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(path.resolve(__dirname, '../../../.env'));
loadEnvFile(path.resolve(process.cwd(), '.env'));

const {
  login,
  getDevices,
  getState,
  writeZoneTargetTemp,
  setHotWaterBoost,
  getZoneSchedule,
  setZoneSchedule,
} = require('./providerClient');
const { sendJson, readJson } = require('./http');
const { appendSnapshot, queryZoneSeries } = require('./statsStore');
const {
  createSession,
  deleteSession,
  extractTokenFromRequest,
  sanitizeProviderLogin,
  touchSession,
  stats,
} = require('./sessionStore');

const PORT = process.env.API_PORT ? Number(process.env.API_PORT) : 3001;
const STATS_POLL_MINUTES = process.env.STATS_POLL_MINUTES ? Number(process.env.STATS_POLL_MINUTES) : 15;
const STATS_PROVIDER_EMAIL = process.env.STATS_PROVIDER_EMAIL || '';
const STATS_PROVIDER_PASSWORD = process.env.STATS_PROVIDER_PASSWORD || '';

const collectorState = {
  providerSession: null,
  seqState: { sequence: 0 },
};

function requireSession(req, res) {
  const token = extractTokenFromRequest(req);
  if (!token) {
    sendJson(res, 401, { ok: false, error: 'Unauthorized' });
    return null;
  }

  const session = touchSession(token);
  if (!session) {
    sendJson(res, 401, { ok: false, error: 'Unauthorized' });
    return null;
  }

  return { token, session };
}

function extractResponsePayload(message) {
  if (!message || typeof message !== 'object') return null;
  if (message.R !== undefined) return message.R;
  if (Array.isArray(message.P) && message.P.length > 1) return message.P[1];
  return null;
}

function parseDevices(providerResponse) {
  const payload = extractResponsePayload(providerResponse);
  if (!Array.isArray(payload)) return [];

  return payload
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const rawId = item.CN ?? item.I ?? item.ZN ?? item.id;
      const id = Number(rawId);
      if (!Number.isFinite(id)) return null;

      const zoneType = Number(item.ZT ?? item.zoneType ?? 0);
      return {
        id,
        name: String(item.ZNM || item.name || `Device ${id}`),
        type: zoneType === 1 ? 'hotWater' : 'zone',
        raw: item,
      };
    })
    .filter(Boolean);
}

function mapTemp(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.abs(n) > 60 ? n / 10 : n;
}

function mapBool(value) {
  const n = Number(value);
  if (Number.isFinite(n)) return n !== 0;
  if (typeof value === 'boolean') return value;
  return undefined;
}

function parseState(providerResponse) {
  const payload = extractResponsePayload(providerResponse);
  const blocks = payload && payload.V && Array.isArray(payload.V) ? payload.V : [];
  const byDeviceId = {};

  for (const block of blocks) {
    const deviceId = Number(block.I);
    if (!Number.isFinite(deviceId) || !Array.isArray(block.V)) continue;

    const next = byDeviceId[deviceId] || { deviceId };
    for (const char of block.V) {
      const charId = Number(char.I);
      if (charId === 1) next.targetTemp = mapTemp(char.V);
      if (charId === 2) next.currentTemp = mapTemp(char.V);
      if (charId === 3) next.heatingOn = mapBool(char.V);
      if (charId === 4) next.hotWaterOn = mapBool(char.V);
      if (charId === 6) next.mode = Number(char.V);
    }
    byDeviceId[deviceId] = next;
  }

  return byDeviceId;
}

async function runStatsCollectorTick() {
  if (!STATS_PROVIDER_EMAIL || !STATS_PROVIDER_PASSWORD) {
    return;
  }

  try {
    if (!collectorState.providerSession) {
      collectorState.providerSession = await login(STATS_PROVIDER_EMAIL, STATS_PROVIDER_PASSWORD);
      collectorState.seqState = { sequence: 0 };
      console.log('[api][stats] collector logged in');
    }

    const devicesResponse = await getDevices(collectorState.providerSession, collectorState.seqState);
    const stateResponse = await getState(collectorState.providerSession, collectorState.seqState);
    const devices = parseDevices(devicesResponse);
    const stateByDeviceId = parseState(stateResponse);

    const points = devices
      .filter((d) => d && (d.type === 'zone' || d.type === 'hotWater'))
      .map((d) => {
        const state = stateByDeviceId[d.id] || stateByDeviceId[String(d.id)] || {};
        return {
          deviceId: Number(d.id),
          name: d.name,
          type: d.type,
          currentTemp: state.currentTemp,
          targetTemp: state.targetTemp,
        };
      })
      .filter((p) => Number.isFinite(Number(p.currentTemp)) || Number.isFinite(Number(p.targetTemp)));

    const inserted = appendSnapshot({
      collectedAt: new Date().toISOString(),
      points,
    });

    if (inserted > 0) {
      console.log(`[api][stats] collector wrote ${inserted} points`);
    }
  } catch (err) {
    collectorState.providerSession = null;
    collectorState.seqState = { sequence: 0 };
    console.warn('[api][stats] collector tick failed', err && err.message ? err.message : err);
  }
}

function extractProviderError(message) {
  if (!message || typeof message !== 'object' || !message.E || typeof message.E !== 'object') {
    return null;
  }
  const details = message.E.D && typeof message.E.D === 'object' ? message.E.D : {};
  const ec = Number(details.EC);
  const es = Number(details.ES);
  if (!Number.isFinite(ec) && !Number.isFinite(es)) {
    return { code: null, serviceId: null };
  }
  return {
    code: Number.isFinite(ec) ? ec : null,
    serviceId: Number.isFinite(es) ? es : null,
  };
}

function mapScheduleTemp(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 18;
  return Math.abs(n) > 60 ? n / 10 : n;
}

function normalizeDayEntries(entries) {
  const toHourPrecision = (minutes) => Math.round((Number(minutes) / 60) * 100) / 100;
  const points = Array.isArray(entries)
    ? entries
        .map((item) => ({ O: Number(item && item.O), T: item && item.T }))
        .filter((item) => Number.isFinite(item.O))
        .sort((a, b) => a.O - b.O)
    : [];

  const periods = [];
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[i + 1];
    const startMin = Math.max(0, Math.min(1440, current.O));
    const endMin = Math.max(startMin, Math.min(1440, next ? next.O : 1440));
    if (startMin >= endMin) continue;
    const startHour = Math.max(0, Math.min(24, toHourPrecision(startMin)));
    let endHour = Math.max(startHour, Math.min(24, toHourPrecision(endMin)));
    if (endHour <= startHour) {
      endHour = Math.min(24, startHour + (10 / 60));
    }

    periods.push({
      start: startHour,
      end: endHour,
      temp: mapScheduleTemp(current.T),
    });
  }

  if (!periods.length) {
    return [{ start: 0, end: 24, temp: 18 }];
  }
  return periods;
}

function parseSchedule(providerResponse) {
  const payload = extractResponsePayload(providerResponse);
  const list = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object'
      ? [payload]
      : [];

  const top = list.find((item) => item && typeof item === 'object' && Array.isArray(item.D)) || null;
  if (!top && !list.length) {
    return { scheduleId: null, week: [] };
  }

  const scheduleId = Number((top && top.I) ?? (list[0] && list[0].I));

  const isEntryPoint = (entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const o = Number(entry.O);
    return Number.isFinite(o);
  };

  const extractDayIndex = (entry) => {
    if (!entry || typeof entry !== 'object') return null;
    const candidates = [entry.DI, entry.DW, entry.W, entry.DAY, entry.Day, entry.day, entry.N];
    for (const candidate of candidates) {
      const n = Number(candidate);
      if (!Number.isFinite(n)) continue;
      if (n >= 0 && n <= 6) return Math.floor(n);
      if (n >= 1 && n <= 7) return Math.floor(n - 1);
    }
    return null;
  };

  const mapWeek = (dayBlocks) => ({
    scheduleId,
    week: dayBlocks.slice(0, 7).map((day, idx) => ({
      dayIndex: idx,
      periods: normalizeDayEntries(day.D),
    })),
  });

  // Shape A: top.D = [{ D:[{O,T}, ...] }, ...] (Mon..Sun)
  if (top && Array.isArray(top.D)) {
    const weekBlocks = top.D.filter((day) => day && typeof day === 'object' && Array.isArray(day.D));
    if (weekBlocks.length >= 7) {
      return mapWeek(weekBlocks);
    }
  }

  // Shape B: payload itself is day blocks, each with D:[{O,T},...]
  const listWeekBlocks = list.filter(
    (item) => item && typeof item === 'object' && Array.isArray(item.D) && item.D.some(isEntryPoint)
  );
  if (listWeekBlocks.length >= 7) {
    return mapWeek(listWeekBlocks);
  }

  // Shape C: flat entries in top.D
  if (top && Array.isArray(top.D) && top.D.length && top.D.every(isEntryPoint)) {
    const grouped = Array.from({ length: 7 }, () => []);
    let hasDayIndex = false;

    for (const entry of top.D) {
      const dayIndex = extractDayIndex(entry);
      if (dayIndex !== null) {
        grouped[dayIndex].push(entry);
        hasDayIndex = true;
      }
    }

    if (hasDayIndex) {
      return {
        scheduleId,
        week: grouped.map((entries, dayIndex) => ({
          dayIndex,
          periods: entries.length ? normalizeDayEntries(entries) : [{ start: 0, end: 24, temp: 18 }],
        })),
      };
    }

    // Shape C2: flat weekly stream split by sentinel markers (O/T = 65535).
    const isSentinel = (entry) => {
      const o = Number(entry && entry.O);
      const t = Number(entry && entry.T);
      return (Number.isFinite(o) && o >= 65535) || (Number.isFinite(t) && t >= 65535);
    };

    const dayBuckets = [];
    let currentBucket = [];
    for (const entry of top.D) {
      if (isSentinel(entry)) {
        if (currentBucket.length) {
          dayBuckets.push(currentBucket);
          currentBucket = [];
        }
        continue;
      }
      currentBucket.push(entry);
    }
    if (currentBucket.length) {
      dayBuckets.push(currentBucket);
    }

    if (dayBuckets.length >= 2) {
      return {
        scheduleId,
        week: Array.from({ length: 7 }, (_v, dayIndex) => ({
          dayIndex,
          periods: dayBuckets[dayIndex]?.length ? normalizeDayEntries(dayBuckets[dayIndex]) : [{ start: 0, end: 24, temp: 18 }],
        })),
      };
    }

    const shared = normalizeDayEntries(top.D);
    return {
      scheduleId,
      week: Array.from({ length: 7 }, (_v, dayIndex) => ({
        dayIndex,
        periods: shared,
      })),
    };
  }

  return { scheduleId, week: [] };
}

function toProviderScheduleTemp(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 180;
  if (Math.abs(n) <= 1) return Math.round(n);
  return Math.round(n * 10);
}

function normalizePeriodsForWrite(periods) {
  const normalized = Array.isArray(periods)
    ? periods
        .map((period) => ({
          start: Number(period && period.start),
          end: Number(period && period.end),
          temp: Number(period && period.temp),
        }))
        .filter((period) => Number.isFinite(period.start) && Number.isFinite(period.end) && Number.isFinite(period.temp))
        .map((period) => ({
          start: Math.max(0, Math.min(24, period.start)),
          end: Math.max(0, Math.min(24, period.end)),
          temp: period.temp,
        }))
        .filter((period) => period.end > period.start)
        .sort((a, b) => a.start - b.start)
    : [];

  if (!normalized.length) {
    return [{ O: 0, T: 180 }];
  }

  const entries = [];
  for (const period of normalized) {
    const offset = Math.max(0, Math.min(1440, Math.round(period.start * 60)));
    if (!entries.length || entries[entries.length - 1].O !== offset) {
      entries.push({ O: offset, T: toProviderScheduleTemp(period.temp) });
    } else {
      entries[entries.length - 1].T = toProviderScheduleTemp(period.temp);
    }
  }

  if (!entries.length) {
    return [{ O: 0, T: 180 }];
  }
  return entries;
}

function buildProviderWeekPayload(week) {
  return Array.from({ length: 7 }, (_v, dayIndex) => {
    const day = Array.isArray(week)
      ? week.find((item) => Number(item && item.dayIndex) === dayIndex)
      : null;
    return {
      D: normalizePeriodsForWrite(day && day.periods),
    };
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const reqUrl = req.url || '/';
    const pathOnly = reqUrl.split('?')[0] || '/';
    const searchParams = new URLSearchParams(reqUrl.includes('?') ? reqUrl.slice(reqUrl.indexOf('?') + 1) : '');

    if (req.method === 'OPTIONS') {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && pathOnly === '/health') {
      sendJson(res, 200, {
        ok: true,
        service: 'api',
        version: '0.4.0',
        now: new Date().toISOString(),
        runtime: {
          node: process.version,
          ...stats(),
        },
      });
      return;
    }

    if (req.method === 'POST' && pathOnly === '/auth/login') {
      const body = await readJson(req);
      const email = typeof body.email === 'string' ? body.email.trim() : '';
      const password = typeof body.password === 'string' ? body.password : '';

      if (!email || !password) {
        sendJson(res, 400, { ok: false, error: 'email and password are required' });
        return;
      }

      const providerSession = await login(email, password);
      const appSessionToken = createSession(providerSession);

      sendJson(res, 200, {
        ok: true,
        appSessionToken,
        provider: {
          userId: providerSession.userId,
          sessionId: providerSession.sessionId,
          gatewayId: providerSession.gatewayId,
          loginResponse: sanitizeProviderLogin(providerSession.raw),
        },
      });
      return;
    }

    if (req.method === 'POST' && pathOnly === '/auth/logout') {
      const token = extractTokenFromRequest(req);
      if (token) deleteSession(token);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && pathOnly === '/devices') {
      const auth = requireSession(req, res);
      if (!auth) return;

      const providerResponse = await getDevices(auth.session.providerSession, auth.session.seqState);
      const devices = parseDevices(providerResponse);
      sendJson(res, 200, { ok: true, devices, providerResponse });
      return;
    }

    if (req.method === 'GET' && pathOnly === '/state') {
      const auth = requireSession(req, res);
      if (!auth) return;

      const providerResponse = await getState(auth.session.providerSession, auth.session.seqState);
      const stateByDeviceId = parseState(providerResponse);
      sendJson(res, 200, { ok: true, stateByDeviceId, providerResponse });
      return;
    }

    const zoneWriteMatch = pathOnly.match(/^\/zones\/(\d+)\/target-temp$/);
    if (req.method === 'POST' && zoneWriteMatch) {
      const auth = requireSession(req, res);
      if (!auth) return;

      const body = await readJson(req);
      const targetTemp = Number(body.targetTemp);
      if (!Number.isFinite(targetTemp)) {
        sendJson(res, 400, { ok: false, error: 'targetTemp must be a number' });
        return;
      }

      const deviceId = Number(zoneWriteMatch[1]);
      const providerResponse = await writeZoneTargetTemp(auth.session.providerSession, auth.session.seqState, deviceId, targetTemp);
      const providerError = extractProviderError(providerResponse);
      if (providerError) {
        sendJson(res, 502, {
          ok: false,
          error: `Provider rejected zone write (EC:${providerError.code ?? 'n/a'}, ES:${providerError.serviceId ?? 'n/a'})`,
          providerResponse,
        });
        return;
      }
      sendJson(res, 200, { ok: true, providerResponse });
      return;
    }

    const zoneScheduleMatch = pathOnly.match(/^\/zones\/(\d+)\/schedule$/);
    if (req.method === 'GET' && zoneScheduleMatch) {
      const auth = requireSession(req, res);
      if (!auth) return;

      const zoneId = Number(zoneScheduleMatch[1]);
      const providerResponse = await getZoneSchedule(auth.session.providerSession, auth.session.seqState, zoneId);
      const parsed = parseSchedule(providerResponse);
      sendJson(res, 200, {
        ok: true,
        zoneId,
        scheduleId: parsed.scheduleId,
        week: parsed.week,
        providerResponse,
      });
      return;
    }

    const zoneScheduleDayWriteMatch = pathOnly.match(/^\/zones\/(\d+)\/schedule\/day\/(\d+)$/);
    if ((req.method === 'PUT' || req.method === 'POST') && zoneScheduleDayWriteMatch) {
      const auth = requireSession(req, res);
      if (!auth) return;

      const zoneId = Number(zoneScheduleDayWriteMatch[1]);
      const dayIndex = Number(zoneScheduleDayWriteMatch[2]);
      if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) {
        sendJson(res, 400, { ok: false, error: 'dayIndex must be between 0 and 6' });
        return;
      }

      const body = await readJson(req);
      let scheduleId = Number(body.scheduleId);
      let week = Array.isArray(body.week) ? body.week : null;

      if (!week || !Number.isFinite(scheduleId)) {
        const currentResponse = await getZoneSchedule(auth.session.providerSession, auth.session.seqState, zoneId);
        const currentParsed = parseSchedule(currentResponse);
        if (!week) {
          week = currentParsed.week;
        }
        if (!Number.isFinite(scheduleId)) {
          scheduleId = Number(currentParsed.scheduleId);
        }
      }

      if (!Array.isArray(week) || !Number.isFinite(scheduleId)) {
        sendJson(res, 400, { ok: false, error: 'Unable to resolve schedule week/scheduleId for save' });
        return;
      }

      const payload = [{ I: scheduleId, D: buildProviderWeekPayload(week) }];
      const providerResponse = await setZoneSchedule(auth.session.providerSession, auth.session.seqState, payload);
      const providerError = extractProviderError(providerResponse);
      if (providerError) {
        sendJson(res, 502, {
          ok: false,
          error: `Provider rejected schedule write (EC:${providerError.code ?? 'n/a'}, ES:${providerError.serviceId ?? 'n/a'})`,
          providerResponse,
        });
        return;
      }

      const updatedProviderResponse = await getZoneSchedule(auth.session.providerSession, auth.session.seqState, zoneId);
      const parsed = parseSchedule(updatedProviderResponse);
      sendJson(res, 200, {
        ok: true,
        zoneId,
        dayIndex,
        scheduleId: parsed.scheduleId,
        week: parsed.week,
        providerResponse,
      });
      return;
    }

    const hwWriteMatch = pathOnly.match(/^\/hot-water\/(\d+)\/boost$/);
    if (req.method === 'POST' && hwWriteMatch) {
      const auth = requireSession(req, res);
      if (!auth) return;

      const body = await readJson(req);
      const minutes = Number(body.minutes);
      if (!Number.isFinite(minutes) || ![0, 60, 120].includes(minutes)) {
        sendJson(res, 400, { ok: false, error: 'minutes must be one of: 0, 60, 120' });
        return;
      }

      const deviceId = Number(hwWriteMatch[1]);
      const providerResponse = await setHotWaterBoost(auth.session.providerSession, auth.session.seqState, deviceId, minutes);
      const providerError = extractProviderError(providerResponse);
      if (providerError) {
        sendJson(res, 502, {
          ok: false,
          error: `Provider rejected hot-water write (EC:${providerError.code ?? 'n/a'}, ES:${providerError.serviceId ?? 'n/a'})`,
          providerResponse,
        });
        return;
      }
      sendJson(res, 200, { ok: true, providerResponse });
      return;
    }

    const statsZoneMatch = pathOnly.match(/^\/stats\/zone\/(\d+)$/);
    if (req.method === 'GET' && statsZoneMatch) {
      const auth = requireSession(req, res);
      if (!auth) return;

      const zoneId = Number(statsZoneMatch[1]);
      const range = searchParams.get('range') === 'month' ? 'month' : 'day';
      const anchor = searchParams.get('anchor') || undefined;
      const series = queryZoneSeries({ zoneId, range, anchor });
      sendJson(res, 200, {
        ok: true,
        ...series,
      });
      return;
    }

    sendJson(res, 404, { ok: false, error: 'Not found' });
  } catch (err) {
    sendJson(res, 500, {
      ok: false,
      error: err && err.message ? err.message : 'Unexpected server error',
    });
  }
});

server.listen(PORT, () => {
  console.log(`[api] listening on http://localhost:${PORT}`);
  if (!STATS_PROVIDER_EMAIL || !STATS_PROVIDER_PASSWORD) {
    console.log('[api][stats] collector disabled (set STATS_PROVIDER_EMAIL and STATS_PROVIDER_PASSWORD)');
    return;
  }

  console.log(`[api][stats] collector interval=${STATS_POLL_MINUTES}m`);
  void runStatsCollectorTick();
  setInterval(() => {
    void runStatsCollectorTick();
  }, STATS_POLL_MINUTES * 60 * 1000);
});
