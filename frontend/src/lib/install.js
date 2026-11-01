// The one-time "Add RADAR to your Home Screen" prompt: shown once, only on a phone or tablet browser (not once installed)
const KEY = 'radar.install.seen';

export function installSeen() {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return true; // storage blocked: better never to nag than to nag every time
  }
}

export function markInstallSeen() {
  try {
    window.localStorage.setItem(KEY, '1');
  } catch {
    /* ignore */
  }
}

export function isInstalled() {
  return Boolean(window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone);
}

export function shouldShowInstallPrompt() {
  if (installSeen() || isInstalled()) return false;
  // A touch screen: iPhone, iPad (which says it is a Mac, so the browser name is no use) and Android
  return Boolean(window.matchMedia?.('(pointer: coarse)').matches);
}
