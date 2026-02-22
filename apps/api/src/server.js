const http = require('http');

const {
  login,
  getDevices,
  getState,
  writeZoneTargetTemp,
  setHotWaterBoost,
} = require('./providerClient');
const { sendJson, readJson } = require('./http');
const {
  createSession,
  deleteSession,
  extractTokenFromRequest,
  sanitizeProviderLogin,
  touchSession,
  stats,
} = require('./sessionStore');

const PORT = process.env.API_PORT ? Number(process.env.API_PORT) : 3001;

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

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && req.url === '/health') {
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

    if (req.method === 'POST' && req.url === '/auth/login') {
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

    if (req.method === 'POST' && req.url === '/auth/logout') {
      const token = extractTokenFromRequest(req);
      if (token) deleteSession(token);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && req.url === '/devices') {
      const auth = requireSession(req, res);
      if (!auth) return;

      const providerResponse = await getDevices(auth.session.providerSession, auth.session.seqState);
      const devices = parseDevices(providerResponse);
      sendJson(res, 200, { ok: true, devices, providerResponse });
      return;
    }

    if (req.method === 'GET' && req.url === '/state') {
      const auth = requireSession(req, res);
      if (!auth) return;

      const providerResponse = await getState(auth.session.providerSession, auth.session.seqState);
      const stateByDeviceId = parseState(providerResponse);
      sendJson(res, 200, { ok: true, stateByDeviceId, providerResponse });
      return;
    }

    const zoneWriteMatch = req.url && req.url.match(/^\/zones\/(\d+)\/target-temp$/);
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

    const hwWriteMatch = req.url && req.url.match(/^\/hot-water\/(\d+)\/boost$/);
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
});
