import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { blockedHelp, deviceHashOf, deviceLabelOf, platformOf, pushSupport, urlBase64ToUint8Array } from '../src/lib/push.js';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD_AS_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const MAC = IPAD_AS_MAC;
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';

test('the device is recognised: iPhone, an iPad that says it is a Mac, a Mac, Android', () => {
  assert.equal(platformOf(IPHONE, 5), 'ios');
  assert.equal(platformOf(IPAD_AS_MAC, 5), 'ios');
  assert.equal(platformOf(MAC, 0), 'mac');
  assert.equal(platformOf(ANDROID, 5), 'android');
  assert.equal(platformOf('Mozilla/5.0 (X11; Linux x86_64)', 0), 'other');
  assert.equal(platformOf(), 'other');
});

test('devices are named so they can be told apart in Settings', () => {
  assert.equal(deviceLabelOf('ios', true, IPHONE), 'iPhone');
  assert.equal(deviceLabelOf('ios', true, IPAD_AS_MAC), 'iPad');
  assert.equal(deviceLabelOf('mac', true, MAC), 'Mac app');
  assert.equal(deviceLabelOf('mac', false, MAC), 'Mac browser');
  assert.equal(deviceLabelOf('android', false, ANDROID), 'Android');
  assert.equal(deviceLabelOf('other', false, ''), 'This device');
});

test('what the device can do: iPhone needs the Home Screen app first', () => {
  const can = { hasApis: true, built: true };
  assert.equal(pushSupport({ platform: 'ios', installed: true, ...can }), 'ok');
  assert.equal(pushSupport({ platform: 'mac', installed: true, ...can }), 'ok');
  assert.equal(pushSupport({ platform: 'ios', installed: false, hasApis: false, built: true }), 'needs-install');
  assert.equal(pushSupport({ platform: 'mac', installed: false, hasApis: false, built: true }), 'unsupported');
  assert.equal(pushSupport({ platform: 'mac', installed: true, hasApis: true, built: false }), 'dev');
});

test('help for a blocked device names the right place on iPhone and on the Mac', () => {
  assert.match(blockedHelp('ios', true), /Settings app.*Notifications.*RADAR/);
  assert.match(blockedHelp('mac', true), /System Settings.*Notifications.*RADAR/);
  assert.match(blockedHelp('mac', false), /Safari.*Websites.*Notifications/);
  assert.match(blockedHelp('other', false), /browser/);
});

test('the server key is turned into the bytes the browser wants', () => {
  const bytes = crypto.randomBytes(65);
  const text = bytes.toString('base64url');
  assert.deepEqual(Buffer.from(urlBase64ToUint8Array(text)), bytes);
  assert.deepEqual(Buffer.from(urlBase64ToUint8Array('AQID')), Buffer.from([1, 2, 3]));
  assert.equal(urlBase64ToUint8Array('').length, 0);
});

test('this device’s tag matches the one the server makes (first 16 characters of the SHA-256)', async () => {
  const endpoint = 'https://web.push.apple.com/QDMy-example';
  const expected = crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 16);
  assert.equal(await deviceHashOf(endpoint), expected);
});
