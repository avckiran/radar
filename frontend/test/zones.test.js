import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEND_TIMES, digestLabel, timeLabel, zoneLabel, zoneOptions } from '../src/lib/zones.js';

test('send times read like a clock', () => {
  assert.equal(timeLabel('08:00'), '8:00 AM');
  assert.equal(timeLabel('00:30'), '12:30 AM');
  assert.equal(timeLabel('12:00'), '12:00 PM');
  assert.equal(timeLabel('19:45'), '7:45 PM');
});

test('time zones get friendly names', () => {
  assert.equal(zoneLabel('America/New_York'), 'Eastern');
  assert.equal(zoneLabel('Europe/Paris'), 'Paris');
  assert.equal(zoneLabel('America/Argentina/Buenos_Aires'), 'Buenos Aires');
  assert.equal(digestLabel('08:00', 'America/New_York'), '8:00 AM Eastern');
});

test('the zone list always includes the current zone', () => {
  const { common, rest } = zoneOptions('Mars/Base');
  assert.ok([...common, ...rest].some((z) => z.value === 'Mars/Base'));
  assert.equal(common[0].value, 'America/New_York');
});

test('send times run every 30 minutes from 5 AM', () => {
  assert.equal(SEND_TIMES[0].value, '05:00');
  assert.equal(SEND_TIMES[1].value, '05:30');
  assert.equal(SEND_TIMES.at(-1).value, '23:30');
});
