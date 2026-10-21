import assert from 'node:assert/strict';
import test from 'node:test';
import { boostProgress, formatRefreshAge } from './refreshStatus.js';

test('refresh age handles missing, recent and stale readings', () => {
  assert.equal(formatRefreshAge(null, 100000), 'Waiting for first refresh');
  assert.equal(formatRefreshAge(100000, 120000), 'Last refreshed just now');
  assert.equal(formatRefreshAge(100000, 280000), 'Last refreshed 3 min ago');
  assert.equal(formatRefreshAge(100000, 7300000), 'Last refreshed 2 hr ago');
});

test('boost countdown uses absolute times so reopening does not restart it', () => {
  const boost = { startedAt: 100000, endsAt: 3700000 };
  assert.deepEqual(boostProgress(boost, 100000), { elapsedMinutes: 0, remainingMinutes: 60 });
  assert.deepEqual(boostProgress(JSON.parse(JSON.stringify(boost)), 1000000), { elapsedMinutes: 15, remainingMinutes: 45 });
  assert.deepEqual(boostProgress(boost, 4000000), { elapsedMinutes: 60, remainingMinutes: 0 });
  assert.equal(boostProgress(null, 1000000), null);
  assert.equal(boostProgress({ startedAt: 5, endsAt: 1 }, 10), null);
});
