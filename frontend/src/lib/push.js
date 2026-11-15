// The pure helpers at the top can be tested without a browser; the API module is loaded only when a button is used.
const api = () => import('./api.js');

// Turning notifications on for THIS phone or computer. Each device (an iPhone, the Mac's Dock app, a browser) is separate:
// it has to be turned on in that device's own RADAR window.

// The server's key arrives as text; the browser wants bytes
export function urlBase64ToUint8Array(text) {
  const padded = text + '='.repeat((4 - (text.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function toBase64Url(buffer) {
  let text = '';
  for (const byte of new Uint8Array(buffer)) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// 'ios' (iPhone and iPad, including an iPad that says it is a Mac), 'mac', 'android' or 'other'
export function platformOf(userAgent = '', touchPoints = 0) {
  if (/iPhone|iPod/.test(userAgent)) return 'ios';
  if (/iPad/.test(userAgent)) return 'ios';
  if (/Macintosh/.test(userAgent)) return touchPoints > 1 ? 'ios' : 'mac';
  if (/Android/.test(userAgent)) return 'android';
  return 'other';
}

export function currentPlatform() {
  return platformOf(navigator.userAgent, navigator.maxTouchPoints ?? 0);
}

export function isInstalledApp() {
  return navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

// The name shown in Settings for this device
export function deviceLabelOf(platform, installed, userAgent = '') {
  if (platform === 'ios') return /iPad/.test(userAgent) || !/iPhone|iPod/.test(userAgent) ? 'iPad' : 'iPhone';
  if (platform === 'mac') return installed ? 'Mac app' : 'Mac browser';
  if (platform === 'android') return 'Android';
  return 'This device';
}

// ok | needs-install (iPhone/iPad outside the Home Screen app) | unsupported | dev (not the built app)
export function pushSupport({ platform, installed, hasApis, built }) {
  if (!built) return 'dev';
  if (!hasApis) return platform === 'ios' && !installed ? 'needs-install' : 'unsupported';
  return 'ok';
}

export function currentSupport() {
  return pushSupport({
    platform: currentPlatform(),
    installed: isInstalledApp(),
    hasApis: 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
    built: import.meta.env.PROD,
  });
}

// Where the person switches notifications back on after saying no (the word for the app differs on each device)
export function blockedHelp(platform, installed) {
  if (platform === 'ios') return 'Open the iPhone’s Settings app, tap Notifications, choose RADAR, and turn on Allow Notifications.';
  if (platform === 'mac' && installed) return 'Open System Settings on the Mac, choose Notifications, pick RADAR in the list, and turn on Allow Notifications.';
  if (platform === 'mac') return 'In Safari, open Settings, choose Websites, then Notifications, and set this website to Allow. Also check System Settings > Notifications > Safari.';
  return 'Allow notifications for this site in the browser’s site settings, then try again.';
}

// Same short tag the server makes for a device (first 16 characters of the SHA-256 of its address)
export async function deviceHashOf(endpoint) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

async function currentSubscription() {
  const registration = await navigator.serviceWorker.ready;
  return { registration, subscription: await registration.pushManager.getSubscription() };
}

// The endpoint tag of this device's subscription, or null when this device is not subscribed
export async function thisDeviceHash() {
  if (currentSupport() !== 'ok') return null;
  try {
    const { subscription } = await currentSubscription();
    return subscription ? deviceHashOf(subscription.endpoint) : null;
  } catch {
    return null;
  }
}

export function notificationPermission() {
  return 'Notification' in window ? Notification.permission : 'denied';
}

// Must run straight from a tap: the permission question is only allowed after one.
// Returns { ok: true } or { ok: false, reason: 'denied' | 'dismissed' | 'error', error? }
export async function turnOnHere(publicKey) {
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'denied') return { ok: false, reason: 'denied' };
    if (permission !== 'granted') return { ok: false, reason: 'dismissed' };
    const { apiPost } = await api();
    const { registration, subscription: existing } = await currentSubscription();
    let subscription = existing;
    const wanted = urlBase64ToUint8Array(publicKey);
    // A subscription made for different server keys can never receive anything: start again
    if (subscription?.options?.applicationServerKey && toBase64Url(subscription.options.applicationServerKey) !== toBase64Url(wanted)) {
      await subscription.unsubscribe();
      subscription = null;
    }
    subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: wanted });
    await apiPost('/api/push/subscribe', {
      subscription: subscription.toJSON(),
      label: deviceLabelOf(currentPlatform(), isInstalledApp(), navigator.userAgent),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: 'error', error: err?.message || 'Could not turn notifications on.' };
  }
}

export async function turnOffHere() {
  try {
    const { apiPost } = await api();
    const { subscription } = await currentSubscription();
    if (!subscription) return { ok: true };
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    await apiPost('/api/push/unsubscribe', { endpoint });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || 'Could not turn notifications off.' };
  }
}

// If this device is subscribed in the browser but the server forgot it (removed from another device), save it again quietly
export async function registerAgain() {
  try {
    const { apiPost } = await api();
    const { subscription } = await currentSubscription();
    if (!subscription || notificationPermission() !== 'granted') return false;
    await apiPost('/api/push/subscribe', {
      subscription: subscription.toJSON(),
      label: deviceLabelOf(currentPlatform(), isInstalledApp(), navigator.userAgent),
    });
    return true;
  } catch {
    return false;
  }
}
