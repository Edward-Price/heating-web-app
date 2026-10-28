import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeriesPath } from './statsUtils.js';

test('daily target changes at the recorded sample rather than gradually between samples', () => {
  const points = [{ ts: 0, targetTemp: 18 }, { ts: 10, targetTemp: 19 }];
  assert.equal(buildSeriesPath(points, 124, 104, p => p.targetTemp, 18, 19, 0, 10, true), 'M 12 102 H 112 V 2');
  assert.equal(buildSeriesPath(points, 124, 104, p => p.targetTemp, 18, 19, 0, 10), 'M 12 102 L 112 2');
});
