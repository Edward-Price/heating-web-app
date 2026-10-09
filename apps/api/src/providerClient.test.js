const assert = require('node:assert/strict');
const test = require('node:test');

let active = 0;
let maxActive = 0;
let failNext = false;
let packets = [];
let rejectKeepalive = false;
let argumentsSent = [];
const wsClientPath = require.resolve('./wsClient');
require.cache[wsClientPath] = {
  id: wsClientPath, filename: wsClientPath, loaded: true,
  exports: { wsRequest: async ({ request }) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    packets.push(request.P[0]);
    argumentsSent.push(request.P[1]);
    await new Promise((resolve) => setImmediate(resolve));
    active -= 1;
    if (failNext) { failNext = false; throw new Error('Fixture transport failure'); }
    if (rejectKeepalive && request.P[0].SI === 103) return { I: request.I, E: { D: { EC: 2, ES: 203 } } };
    return { I: request.I, R: request.P[0].SI === 103 ? 0 : [] };
  } },
};
global.fetch = async () => ({ status: 200, text: async () => '{"RI":"1","D":1701}' });
const { getDevices, getState } = require('./providerClient');
const session = () => ({ gatewayId: '123', sessionId: 'fixture', token: 'fixture' });
function reset() { active = 0; maxActive = 0; packets = []; argumentsSent = []; failNext = false; rejectKeepalive = false; }

test('device and state requests on the same session never overlap', async () => {
  reset();
  const s = session();
  const seq = { sequence: 0 };
  await Promise.all([getDevices(s, seq), getState(s, seq), getDevices(s, seq)]);
  assert.equal(maxActive, 1);
  assert.deepEqual(packets.map((p) => p.SI), [103, 11, 103, 1, 103, 11]);
  assert.equal(seq.sequence, 6);
});

test('a failed operation does not block later requests', async () => {
  reset(); failNext = true;
  const s = session();
  const seq = { sequence: 0 };
  const results = await Promise.allSettled([getDevices(s, seq), getState(s, seq)]);
  assert.equal(results[0].status, 'rejected');
  assert.equal(results[1].status, 'fulfilled');
  assert.equal(maxActive, 1);
});

test('queued work keeps the gateway selected when it was requested', async () => {
  reset();
  const s = session();
  const seq = { sequence: 0 };
  const first = getDevices(s, seq);
  const second = getState(s, seq);
  s.gatewayId = '456';
  await Promise.all([first, second]);
  assert.deepEqual(packets.map((p) => p.GMI), [123, 123, 123, 123]);
});

test('different provider sessions can operate independently', async () => {
  reset();
  await Promise.all([getDevices(session(), { sequence: 0 }), getState(session(), { sequence: 0 })]);
  assert.equal(maxActive, 2);
});

test('startup sends a current clock tick before devices and temperature reads', async () => {
  reset();
  const s = session();
  const seq = { sequence: 0 };
  const before = Math.floor(Date.now() / 1000);
  await getDevices(s, seq);
  await getState(s, seq);
  const after = Math.floor(Date.now() / 1000);
  assert.deepEqual(packets.map(p => [p.HI, p.SI]), [[2, 103], [49, 11], [2, 103], [3, 1]]);
  for (const i of [0, 2]) {
    assert.equal(argumentsSent[i].length, 1);
    assert.ok(argumentsSent[i][0] >= before && argumentsSent[i][0] <= after);
  }
});

test('a rejected keepalive is returned and a later refresh can recover', async () => {
  reset(); rejectKeepalive = true;
  const s = session();
  const seq = { sequence: 0 };
  const response = await getState(s, seq);
  assert.equal(response.E.D.ES, 203);
  assert.ok(packets.every(p => p.SI === 103));
  rejectKeepalive = false;
  await getState(s, seq);
  assert.deepEqual(packets.slice(-2).map(p => p.SI), [103, 1]);
});
