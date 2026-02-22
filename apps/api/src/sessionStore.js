const crypto = require('crypto');

const sessions = new Map();

function createSession(providerSession) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, {
    providerSession,
    seqState: { sequence: 0 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  return token;
}

function getSession(token) {
  if (!token || typeof token !== 'string') {
    return null;
  }
  return sessions.get(token) || null;
}

function deleteSession(token) {
  if (!token || typeof token !== 'string') {
    return;
  }
  sessions.delete(token);
}

function extractTokenFromRequest(req) {
  const explicit = req.headers['x-session-token'];
  if (typeof explicit === 'string' && explicit.length > 0) {
    return explicit;
  }

  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    return auth.slice('Bearer '.length);
  }

  return null;
}

function sanitizeProviderLogin(raw) {
  const clone = JSON.parse(JSON.stringify(raw || {}));
  if (clone && clone.D && clone.D.JT) {
    clone.D.JT = '[REDACTED]';
  }
  return clone;
}

function touchSession(token) {
  const session = getSession(token);
  if (session) {
    session.updatedAt = Date.now();
  }
  return session;
}

function stats() {
  return {
    sessionsInMemory: sessions.size,
  };
}

module.exports = {
  createSession,
  getSession,
  deleteSession,
  extractTokenFromRequest,
  sanitizeProviderLogin,
  touchSession,
  stats,
};
