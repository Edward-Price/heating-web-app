const assert = require('node:assert/strict');
const test = require('node:test');
const { connectionErrorMessage, providerReadErrorMessage } = require('./providerErrors');

test('a 708 socket closure produces a useful message without exposing diagnostics', () => {
  const error = new Error('WS closed before response (code=1011, reason=708, requestId=fixture-20, req={"SI":1}, lastFrame=none)');
  const message = connectionErrorMessage(error);
  assert.match(message, /connection was interrupted/);
  assert.doesNotMatch(message, /708|requestId|lastFrame/);
});

test('read rejection 2/203 does not claim that credentials are invalid', () => {
  assert.equal(providerReadErrorMessage('devices', { code: 2, serviceId: 203 }),
    'The heating provider could not read this system. Please wait a moment and try again.');
});

test('unrecognised provider rejections retain their diagnostic codes', () => {
  assert.equal(providerReadErrorMessage('devices', { code: 4, serviceId: 11 }),
    'Provider rejected devices request (EC:4, ES:11)');
});
