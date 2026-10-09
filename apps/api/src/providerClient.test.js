const assert = require('node:assert/strict');
const test = require('node:test');

let active = 0;
let maxActive = 0;
let failNext = false;
let packets = [];
const wsClientPath = require.resolve('./wsClient');
require.cache[wsClientPath] = {
  id: wsClientPath, filename: wsClientPath, loaded: true,
  exports: { wsRequest: async ({ request }) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    packets.push(request.P[0]);
    await new Promise((resolve) => setImmediate(resolve));
    active -= 1;
    if (failNext) { failNext = false; throw new Error('Fixture transport failure'); }
    return { I: request.I, R: [] };
  } },
};
global.fetch = async () => ({ status: 200, text: async () => '{"RI":"1","D":1701}' });
const { getDevices, getState } = require('./providerClient');
const session = () => ({ gatewayId: '123', sessionId: 'fixture', token: 'fixture' });
function reset() { active = 0; maxActive = 0; packets = []; failNext = false; }

test('device and state requests on the same session never overlap', async () => {
  reset();
  const s = session();
  const seq = { sequence: 0 };
  await Promise.all([getDevices(s, seq), getState(s, seq), getDevices(s, seq)]);
  assert.equal(maxActive, 1);
  assert.deepEqual(packets.map((p) => p.SI), [11, 1, 11]);
  assert.equal(seq.sequence, 3);
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
  assert.deepEqual(packets.map((p) => p.GMI), [123, 123]);
});

test('different provider sessions can operate independently', async () => {
  reset();
  await Promise.all([getDevices(session(), { sequence: 0 }), getState(session(), { sequence: 0 })]);
  assert.equal(maxActive, 2);
});
