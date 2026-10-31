import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cell, toCsv } from '../src/csv.js';
import { crc32, makeZip } from '../src/zip.js';
import { validTimeZone } from '../src/settings.js';
import { cleanSegmentName } from '../src/segmentAdmin.js';
import { isSegmentColor, SEGMENT_COLORS } from '../src/segmentColors.js';

test('csv quotes commas, quotes and line breaks', () => {
  assert.equal(cell('a,b'), '"a,b"');
  assert.equal(cell('say "hi"'), '"say ""hi"""');
  assert.equal(cell('two\nlines'), '"two\nlines"');
  assert.equal(cell(null), '');
  assert.equal(cell(7), '7');
  assert.equal(cell(new Date('2026-10-26T15:00:00Z')), '2026-10-26T15:00:00.000Z');
});

test('csv stops spreadsheet formulas but keeps normal text', () => {
  assert.equal(cell('=SUM(A1:A2)'), "'=SUM(A1:A2)");
  assert.equal(cell('@cmd'), "'@cmd");
  assert.equal(cell('-cmd'), "'-cmd");
  assert.equal(cell('- milk'), '- milk');
  assert.equal(cell('-5'), '-5');
});

test('csv starts with a byte order mark and uses CRLF rows', () => {
  const text = toCsv([{ key: 'a', header: 'A' }, { key: 'b', header: 'B' }], [{ a: 1, b: 'x' }]);
  assert.equal(text, '﻿A,B\r\n1,x\r\n');
});

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
});

test('zip has the right entries and sizes', () => {
  const zip = makeZip([{ name: 'a.csv', data: 'hello' }, { name: 'b.csv', data: 'é' }], new Date('2026-10-26T15:00:00Z'));
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  const end = zip.length - 22;
  assert.equal(zip.readUInt32LE(end), 0x06054b50);
  assert.equal(zip.readUInt16LE(end + 10), 2);
  const centralAt = zip.readUInt32LE(end + 16);
  assert.equal(zip.readUInt32LE(centralAt), 0x02014b50);
  assert.equal(zip.readUInt32LE(centralAt + 24), 5);
});

test('time zones are checked', () => {
  assert.equal(validTimeZone('America/New_York'), true);
  assert.equal(validTimeZone('America/Argentina/Buenos_Aires'), true);
  assert.equal(validTimeZone('UTC'), true);
  assert.equal(validTimeZone('Mars/Base'), false);
  assert.equal(validTimeZone('x; drop table'), false);
  assert.equal(validTimeZone(5), false);
});

test('segment names are trimmed and limited', () => {
  assert.equal(cleanSegmentName('  Home   repairs '), 'Home repairs');
  assert.throws(() => cleanSegmentName('   '), /name/);
  assert.throws(() => cleanSegmentName('x'.repeat(41)), /name/);
});

test('there are exactly twelve approved colors', () => {
  assert.equal(SEGMENT_COLORS.length, 12);
  assert.equal(isSegmentColor('emerald'), true);
  assert.equal(isSegmentColor('pink'), false);
});
