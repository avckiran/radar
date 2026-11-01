// Registers the service worker that keeps RADAR's own files for offline use. Only in the built app (not while developing).
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => {
      /* RADAR works without it, just not offline */
    });
  });
}
