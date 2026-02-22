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

async function login(email, password) {
  const payload = {
    ULC: {
      OI: 1550005,
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
  const gatewayId = body.D.GD && body.D.GD[0] ? String(body.D.GD[0].GMI || '') : '';

  if (!token || !sessionId || !gatewayId) {
    throw new Error('Provider login failed: missing JT/SI/GMI');
  }

  return {
    token,
    sessionId,
    gatewayId,
    userId: body.D.UI || null,
    raw: body,
  };
}

function nextMessageId(providerSession, state) {
  state.sequence += 1;
  return `${providerSession.sessionId}-${state.sequence}`;
}

async function checkGatewayConnected(providerSession) {
  const url = `${REST_BASE}/IsGatewayConnected?gatewayMacId=${encodeURIComponent(providerSession.gatewayId)}`;
  try {
    await httpJson({
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
  } catch (_err) {
    // Non-fatal preflight.
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

async function sendProviderRequest(providerSession, state, { SI, HI, payload }) {
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
        return await wsRequest({
          wsUrl: WS_URL,
          subprotocol: WS_PROTOCOL,
          headers: {
            Authorization: `Bearer ${providerSession.token}`,
            'Session-id': providerSession.sessionId,
            'Request-id': '1',
          },
          request,
          timeoutMs: 12000,
        });
      } catch (err) {
        lastErr = err;
        const msg = err && err.message ? err.message : String(err);
        const is708 = msg.includes('reason=708');
        if (!is708) {
          throw err;
        }
      }
    }
    await checkGatewayConnected(providerSession);
    await new Promise((resolve) => setTimeout(resolve, 160));
  }

  throw lastErr || new Error('Provider request failed');
}

async function getDevices(providerSession, state) {
  return sendProviderRequest(providerSession, state, {
    SI: 11,
    HI: 49,
    payload: [],
  });
}

async function getState(providerSession, state) {
  return sendProviderRequest(providerSession, state, {
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
      });
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr || new Error('Provider schedule read failed');
}

module.exports = {
  login,
  getDevices,
  getState,
  writeZoneTargetTemp,
  setHotWaterBoost,
  getZoneSchedule,
};
