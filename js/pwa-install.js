// ---------- PWA install handling ----------
// Shows a branded install banner instead of relying on the browser's own
// generic prompt. Works on Chrome/Edge/Android (real install prompt) and
// falls back to on-screen instructions on iOS Safari (which has no install API).

let deferredInstallPrompt = null;
const DISMISS_KEY = 'pwa_install_dismissed_at';
const DISMISS_COOLDOWN_DAYS = 7;

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true; // iOS Safari flag
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function recentlyDismissed() {
  const ts = localStorage.getItem(DISMISS_KEY);
  if (!ts) return false;
  const days = (Date.now() - Number(ts)) / (1000 * 60 * 60 * 24);
  return days < DISMISS_COOLDOWN_DAYS;
}

function buildBanner({ onInstall, onDismiss, iosMode }) {
  const banner = document.createElement('div');
  banner.id = 'pwa-install-banner';
  banner.innerHTML = `
    <div class="pwa-install-inner">
      <div class="pwa-install-icon">
        <img src="/icons/icon-192.png" alt="App icon" />
      </div>
      <div class="pwa-install-text">
        <strong>Install this app</strong>
        <span>${iosMode
          ? 'Tap the Share icon, then "Add to Home Screen".'
          : 'Add it to your desktop or home screen for quick access.'}</span>
      </div>
      <div class="pwa-install-actions">
        ${iosMode ? '' : '<button class="pwa-install-btn" id="pwa-install-confirm">Install</button>'}
        <button class="pwa-install-dismiss" id="pwa-install-dismiss" aria-label="Dismiss">&times;</button>
      </div>
    </div>
  `;
  document.body.appendChild(banner);
  requestAnimationFrame(() => banner.classList.add('visible'));

  if (!iosMode) {
    document.getElementById('pwa-install-confirm').addEventListener('click', onInstall);
  }
  document.getElementById('pwa-install-dismiss').addEventListener('click', onDismiss);
}

function removeBanner() {
  const banner = document.getElementById('pwa-install-banner');
  if (!banner) return;
  banner.classList.remove('visible');
  setTimeout(() => banner.remove(), 250);
}

function dismissBanner() {
  localStorage.setItem(DISMISS_KEY, String(Date.now()));
  removeBanner();
}

// Chrome/Edge/Android fire this instead of auto-showing their own prompt,
// as long as we call event.preventDefault().
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  if (!isStandalone() && !recentlyDismissed()) {
    buildBanner({
      iosMode: false,
      onDismiss: dismissBanner,
      onInstall: async () => {
        removeBanner();
        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice; // resolves once user accepts/declines
        deferredInstallPrompt = null;
      },
    });
  }
});

window.addEventListener('appinstalled', () => {
  removeBanner();
});

// iOS has no beforeinstallprompt — show manual instructions instead, once.
document.addEventListener('DOMContentLoaded', () => {
  if (isIOS() && !isStandalone() && !recentlyDismissed()) {
    buildBanner({ iosMode: true, onDismiss: dismissBanner, onInstall: () => {} });
  }
});

// NOTE: service worker registration now happens in pwa-update.js (it needs
// the registration object to detect and manage updates). Load both scripts.