// ---------- PWA update handling ----------
// New service worker versions install in the background but wait until the
// user confirms before taking over — safer for a POS app mid-transaction.

function buildUpdateBanner(onReload) {
  if (document.getElementById('pwa-update-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'pwa-update-banner';
  banner.innerHTML = `
    <div class="pwa-install-inner">
      <div class="pwa-install-text">
        <strong>Update available</strong>
        <span>Refresh to get the latest version.</span>
      </div>
      <div class="pwa-install-actions">
        <button class="pwa-install-btn" id="pwa-update-reload">Refresh</button>
      </div>
    </div>
  `;
  document.body.appendChild(banner);
  requestAnimationFrame(() => banner.classList.add('visible'));
  document.getElementById('pwa-update-reload').addEventListener('click', onReload);
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js').then((registration) => {
    // Case 1: an update was already found and is waiting (e.g. user had the
    // tab open when you deployed).
    if (registration.waiting) {
      buildUpdateBanner(() => {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      });
    }

    // Case 2: a new worker starts installing while the page is open.
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          buildUpdateBanner(() => {
            newWorker.postMessage({ type: 'SKIP_WAITING' });
          });
        }
      });
    });
  }).catch((err) => console.warn('Service worker registration failed:', err));

  // Once the new worker takes control, reload once to run the fresh code.
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}