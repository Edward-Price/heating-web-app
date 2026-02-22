const WebSocket = require('ws');

function idSuffix(value) {
  const text = String(value || '');
  if (!text) return '';
  const parts = text.split('-');
  return parts[parts.length - 1] || text;
}

function matchesRequestId(incomingId, requestId) {
  const incoming = String(incomingId || '');
  const expected = String(requestId || '');
  if (!incoming || !expected) return false;
  if (incoming === expected) return true;
  return idSuffix(incoming) === idSuffix(expected);
}

function wsRequest({ wsUrl, subprotocol, headers, request, timeoutMs = 12000 }) {
  return new Promise((resolve, reject) => {
    const requestId = String(request.I || '');
    let settled = false;
    let lastFrame = null;

    const requestSummary = {
      I: request.I,
      SI: request && request.P && request.P[0] ? request.P[0].SI : null,
      HI: request && request.P && request.P[0] ? request.P[0].HI : null,
      hasArgs: Array.isArray(request && request.P) ? request.P.length > 1 : false,
    };

    const ws = new WebSocket(wsUrl, subprotocol, {
      headers,
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        ws.terminate();
      } catch (_err) {
        // ignore
      }
      reject(new Error(`WS request timeout (${requestId})`));
    }, timeoutMs);

    ws.on('open', () => {
      ws.send(JSON.stringify(request));
    });

    ws.on('message', (data) => {
      if (settled) return;
      try {
        const raw = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
        lastFrame = raw;
        const message = JSON.parse(raw);

        if (matchesRequestId(message.I, requestId)) {
          settled = true;
          clearTimeout(timer);
          ws.close();
          resolve(message);
          return;
        }

        const hasPayload = Object.prototype.hasOwnProperty.call(message, 'R');
        const hasError = Object.prototype.hasOwnProperty.call(message, 'E');
        const isNotify = message && message.M === 'Notify';
        if (!isNotify && (hasPayload || hasError)) {
          settled = true;
          clearTimeout(timer);
          ws.close();
          resolve(message);
        }
      } catch (_err) {
        // ignore malformed frames
      }
    });

    ws.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`WS error: ${err && err.message ? err.message : 'unknown'}; req=${JSON.stringify(requestSummary)}`));
    });

    ws.on('close', (code, reasonBuffer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const reason = Buffer.isBuffer(reasonBuffer) ? reasonBuffer.toString('utf8') : String(reasonBuffer || '');
      const preview = lastFrame ? String(lastFrame).slice(0, 240) : 'none';
      reject(new Error(`WS closed before response (code=${code}, reason=${reason || 'n/a'}, requestId=${requestId}, req=${JSON.stringify(requestSummary)}, lastFrame=${preview})`));
    });
  });
}

module.exports = {
  wsRequest,
};
