import assert from 'node:assert/strict';
import test from 'node:test';
import { readApiResponse } from './apiResponse.js';

test('an nginx HTML timeout produces a useful error instead of a JSON syntax error', async () => {
  const response = new Response('<html><h1>504 Gateway Time-out</h1></html>', { status: 504 });
  await assert.rejects(readApiResponse(response), { message: 'The heating system took too long to respond. Please try again.' });
});

test('an empty gateway failure produces a useful error', async () => {
  await assert.rejects(readApiResponse(new Response('', { status: 502 })), {
    message: 'The heating service is temporarily unavailable. Please try again.',
  });
});

test('session expiry clears the session even when the response body is HTML', async () => {
  let cleared = false;
  await assert.rejects(readApiResponse(new Response('<html>Unauthorized</html>', { status: 401 }), () => { cleared = true; }), {
    message: 'Unauthorized',
  });
  assert.equal(cleared, true);
});

test('provider error details are preserved', async () => {
  const response = Response.json({ ok: false, error: 'Provider rejected devices request (EC:7, ES:11)' }, { status: 502 });
  await assert.rejects(readApiResponse(response), { message: 'Provider rejected devices request (EC:7, ES:11)' });
});

test('valid system responses are returned unchanged', async () => {
  const data = { ok: true, selectedGatewayId: 'fixture', systems: [{ gatewayId: 'fixture' }] };
  assert.deepEqual(await readApiResponse(Response.json(data)), data);
});

test('a misrouted HTML page or invalid JSON payload is reported clearly', async () => {
  for (const body of ['<html>App page</html>', 'null', '[]']) {
    await assert.rejects(readApiResponse(new Response(body)), {
      message: 'The server returned an unreadable response. Please try again.',
    });
  }
});
