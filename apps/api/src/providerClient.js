const crypto = require('crypto');

const { wsRequest } = require('./wsClient');

const REST_BASE = process.env.PROVIDER_REST_BASE || 'https://app.beanbag.online/api/UserRestAPI';
const WS_URL = process.env.PROVIDER_WS_URL || 'wss://app.beanbag.online/api/TransactionRestAPI/ConnectWebSocket';
const WS_PROTOCOL = process.env.PROVIDER_WS_PROTOCOL || 'BB-BO-01';

function md5Hex(input) {
  return crypto.createHash('md5').update(input).digest('hex').toLowerCase();
}

async function httpJson({ method, url, headers, body }) {
  if (typeof fetch === 'undefined') {
    throw new Error('Global fetch is unavailable. Use Node 20 as required by .nvmrc');
  }

  const response = await fetch(url, {
    method,
    headers: headers || {},
    body,
  });

  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch (_err) {
    parsed = text;
  }

  return {
    statusCode: response.status,
    body: parsed,
  };
}

async function login(email, password, oi = 1550005) {
  const payload = {
    ULC: {
      OI: oi,
      P: md5Hex(password),
      NT: 'SetLogin',
      UEI: email,
    },
  };

  const response = await httpJson({
    method: 'POST',
    url: `${REST_BASE}/LoginRequest`,
    headers: {
      'Content-Type': 'application/json',
      'Request-id': '1',
    },
    body: JSON.stringify(payload),
  });

  if (response.statusCode !== 200) {
    throw new Error(`Provider login failed: HTTP ${response.statusCode}`);
  }

  const body = response.body;
  if (!body || body.RI !== '1' || !body.D) {
    throw new Error('Provider login failed: invalid response');
  }

  const token = body.D.JT;
  const sessionId = String(body.D.SI || '');
  const systems = (Array.isArray(body.D.GD) ? body.D.GD : [])
    .map((gateway, index) => {
      const gatewayId = String((gateway && gateway.GMI) || '');
      if (!gatewayId) return null;
      return {
        gatewayId,
        name: String(
          (gateway && (gateway.HN || gateway.LI || gateway.DN))
          || `Heating system ${index + 1}`
        ),
        serialNumber: gateway && (gateway.GSN || gateway.SN)
          ? String(gateway.GSN || gateway.SN)
          : null,
        raw: gateway,
      };
    })
    .filter(Boolean);

  if (!token || !sessionId) {
    throw new Error('Provider login failed: missing JT/SI');
  }
  if (systems.length === 0) {
    throw new Error('Provider account has no heating systems available');
  }

  return {
    token,
    sessionId,
    gatewayId: null,
    systems,
    userId: body.D.UI || null,
    raw: body,
  };
}

function selectGateway(providerSession, gatewayId) {
  const requestedId = String(gatewayId || '');
  const system = (providerSession.systems || []).find((item) => item.gatewayId === requestedId);
  if (!system) {
    throw new Error('Heating system is not available for this account');
  }
  providerSession.gatewayId = system.gatewayId;
  return system;
}

function nextMessageId(providerSession, state) {
  state.sequence += 1;
  return `${providerSession.sessionId}-${state.sequence}`;
}

async function checkGatewayConnected(providerSession) {
  const url = `${REST_BASE}/IsGatewayConnected?gatewayMacId=${encodeURIComponent(providerSession.gatewayId)}`;
  try {
    const result = await httpJson({
      method: 'GET',
      url,
      headers: {
        Accept: '*/*',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${providerSession.token}`,
        'Session-id': providerSession.sessionId,
        'Request-id': '1',
      },
    });
    console.log(`[api] gateway connectivity status=${result.statusCode}`);
  } catch (err) {
    console.warn('[api] IsGatewayConnected failed ->', err && err.message ? err.message : err);
  }
}

function buildPacket({ providerSession, SI, HI, payload, useStringGmi, omitPayload }) {
  const gmi = useStringGmi ? String(providerSession.gatewayId) : Number(providerSession.gatewayId);
  const header = { GMI: gmi, SI, HI };
  if (omitPayload) {
    return [header];
  }
  return [header, payload];
}

const requestQueues = new WeakMap();

function sendProviderRequest(providerSession, state, options) {
  // Each operation opens its own socket. Keep requests on a provider session from
  // overlapping, including dashboard, schedule and user-triggered requests.
  const previous = requestQueues.get(providerSession) || Promise.resolve();
  // Capture the selected system now so queued work cannot switch to another gateway.
  const requestSession = { ...providerSession };
  const pending = previous.catch(() => {}).then(async () => {
    if (options.keepaliveBeforeRead) {
      // The official app sends a clock/keepalive tick during its refresh burst.
      // Prepare the gateway before reads, including after a period of inactivity.
      const ready = await sendProviderRequestNow(requestSession, state, {
        SI: 103, HI: 2, payload: [Math.floor(Date.now() / 1000)],
      });
      if (ready && ready.E) return ready;
    }
    return sendProviderRequestNow(requestSession, state, options);
  });
  requestQueues.set(providerSession, pending);
  return pending.finally(() => {
    if (requestQueues.get(providerSession) === pending) requestQueues.delete(providerSession);
  });
}

async function sendProviderRequestNow(providerSession, state, { SI, HI, payload, timeoutMs = 12000 }) {
  if (!providerSession.gatewayId) {
    throw new Error('No heating system selected');
  }
  await checkGatewayConnected(providerSession);
  const canOmitPayload = Array.isArray(payload) && payload.length === 0;

  const variants = [
    { useStringGmi: false, omitPayload: false },
    { useStringGmi: true, omitPayload: false },
  ];
  if (canOmitPayload) {
    variants.push({ useStringGmi: false, omitPayload: true });
    variants.push({ useStringGmi: true, omitPayload: true });
  }

  let lastErr = null;
  let lastErrorResponse = null;
  for (let round = 0; round < 2; round += 1) {
    for (const variant of variants) {
      const request = {
        V: '1.0',
        DTS: Math.floor(Date.now() / 1000),
        I: nextMessageId(providerSession, state),
        M: 'Request',
        P: buildPacket({
          providerSession,
          SI,
          HI,
          payload,
          useStringGmi: variant.useStringGmi,
          omitPayload: variant.omitPayload,
        }),
      };

      try {
        const response = await wsRequest({
          wsUrl: WS_URL,
          subprotocol: WS_PROTOCOL,
          headers: {
            Authorization: `Bearer ${providerSession.token}`,
            'Session-id': providerSession.sessionId,
            'Request-id': '1',
          },
          request,
          timeoutMs,
        });
        if (response && response.E) {
          lastErrorResponse = response;
          continue;
        }
        return response;
      } catch (err) {
        lastErr = err;
        const msg = err && err.message ? err.message : String(err);
        const is708 = msg.includes('reason=708');
        const isTimeout = msg.includes('WS request timeout');
        const isEarlyClose = msg.includes('WS closed before response');
        if (!is708 && !isTimeout && !isEarlyClose) {
          throw err;
        }
      }
    }
    await checkGatewayConnected(providerSession);
    await new Promise((resolve) => setTimeout(resolve, 160));
  }

  if (lastErrorResponse) return lastErrorResponse;
  throw lastErr || new Error('Provider request failed');
}

async function getDevices(providerSession, state) {
  return sendProviderRequest(providerSession, state, {
    keepaliveBeforeRead: true,
    SI: 11,
    HI: 49,
    payload: [],
  });
}

async function getState(providerSession, state) {
  return sendProviderRequest(providerSession, state, {
    keepaliveBeforeRead: true,
    SI: 1,
    HI: 3,
    payload: [],
  });
}

async function writeZoneTargetTemp(providerSession, state, deviceId, tempC) {
  const scaled = Math.round(Number(tempC) * 10);
  return sendProviderRequest(providerSession, state, {
    SI: 15,
    HI: 2,
    payload: [Number(deviceId), { I: 1, V: scaled, OT: 1, D: 0 }],
  });
}

async function setHotWaterBoost(providerSession, state, deviceId, minutes) {
  const requestedMinutes = Number(minutes);
  const isOff = requestedMinutes === 0;
  const safeMinutes = isOff ? 0 : requestedMinutes;

  return sendProviderRequest(providerSession, state, {
    SI: 16,
    HI: 2,
    payload: [
      Number(deviceId),
      {
        I: 4,
        V: isOff ? 0 : 1,
        OT: isOff ? 0 : 2,
        D: safeMinutes,
      },
    ],
  });
}

async function getZoneSchedule(providerSession, state, zoneIdOrIndex) {
  const n = Number(zoneIdOrIndex);
  const primary = Number.isFinite(n) ? n : 1;
  const fallbacks = Array.from(new Set([primary, 1, 2]));
  let lastErr = null;

  for (const idx of fallbacks) {
    try {
      return await sendProviderRequest(providerSession, state, {
        SI: 17,
        HI: 22,
        payload: [idx],
        timeoutMs: 18000,
      });
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr || new Error('Provider schedule read failed');
}

async function setZoneSchedule(providerSession, state, schedulePayload) {
  return sendProviderRequest(providerSession, state, {
    SI: 17,
    HI: 21,
    payload: schedulePayload,
    timeoutMs: 20000,
  });
}

async function timeTick(providerSession, state) {
  return sendProviderRequest(providerSession, state, {
    SI: 103,
    HI: 2,
    payload: [Math.floor(Date.now() / 1000)],
  });
}

async function getInstallations(providerSession) {
  return httpJson({
    method: 'GET',
    url: `${REST_BASE}/GetInstallations`,
    headers: {
      Accept: '*/*',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${providerSession.token}`,
      'Session-id': providerSession.sessionId,
      'Request-id': '1',
    },
  });
}

async function getUserInformation(providerSession) {
  return httpJson({
    method: 'GET',
    url: `${REST_BASE}/GetUserInformation`,
    headers: {
      Accept: '*/*',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${providerSession.token}`,
      'Session-id': providerSession.sessionId,
      'Request-id': '1',
    },
  });
}

async function getHome(providerSession, gatewayId) {
  return httpJson({
    method: 'GET',
    url: `${REST_BASE}/GetHome?GatewayMACID=${encodeURIComponent(gatewayId)}`,
    headers: {
      Accept: '*/*',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${providerSession.token}`,
      'Session-id': providerSession.sessionId,
      'Request-id': '1',
    },
  });
}

async function getUserList(providerSession) {
  return httpJson({
    method: 'GET',
    url: `${REST_BASE}/GetUserList`,
    headers: {
      Accept: '*/*',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${providerSession.token}`,
      'Session-id': providerSession.sessionId,
      'Request-id': '1',
    },
  });
}

module.exports = {
  login,
  selectGateway,
  getDevices,
  getState,
  writeZoneTargetTemp,
  setHotWaterBoost,
  getUserInformation,
  getHome,
  getUserList,
  timeTick,
  getInstallations,
  getZoneSchedule,
  setZoneSchedule,
};
