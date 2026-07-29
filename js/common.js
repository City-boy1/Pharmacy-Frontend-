// Shared small utilities used across pages.

function getDeviceId() {
  let id = localStorage.getItem('pharmacy_device_id');
  if (!id) {
    id = 'device-' + crypto.randomUUID();
    localStorage.setItem('pharmacy_device_id', id);
  }
  return id;
}

function newClientTransactionId() {
  return crypto.randomUUID();
}

function formatCurrency(amount) {
  const n = Number(amount || 0);
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function showToast(message, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type === 'error' ? 'error' : ''}`;
  const icon = type === 'error' ? SVG_ICONS.info : SVG_ICONS.check;
  el.innerHTML = `${icon}<span></span>`;
  el.querySelector('span').textContent = message; // textContent, not innerHTML, to avoid any injection
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// Redirects to login if there's no local session. Call at the top of every
// protected page. Returns the session object if present.
async function requireSession() {
  const session = await getSession();
  if (!session) {
    window.location.href = 'login.html';
    return null;
  }
  return session;
}

async function logout() {
  await clearSession();
  window.location.href = 'login.html';
}

// Asks the browser to treat this site's storage as "persistent" — meaning the
// browser won't silently evict IndexedDB data under storage pressure. Critical
// for a device that may stay offline for weeks with sales piling up locally.
async function requestPersistentStorage() {
  if (navigator.storage && navigator.storage.persist) {
    const already = await navigator.storage.persisted();
    if (!already) await navigator.storage.persist();
  }
}

// Loads pharmacy branding (name/logo) for the sidebar. Tries the server when
// reachable and caches it; falls back to the cached copy when offline, so
// branding still shows correctly even after weeks offline.
async function loadPharmacyBranding() {
  const online = await isServerReachable();
  if (online) {
    try {
      const profile = await apiRequest('/pharmacy/profile');
      await setMeta('pharmacy_profile', profile);
      return profile;
    } catch (e) {
      console.warn('Could not fetch pharmacy profile, using cached copy:', e.message);
    }
  }
  return getMeta('pharmacy_profile', null);
}

function applyBrandingToSidebar(profile) {
  const nameEl = document.getElementById('brand-name');
  const logoEl = document.getElementById('brand-logo');
  if (!profile) return;
  if (nameEl) nameEl.textContent = profile.name || 'Pharmacy';
  if (logoEl && profile.logo_url) {
    logoEl.src = profile.logo_url;
    logoEl.style.display = 'block';
    const fallbackIcon = document.getElementById('brand-icon-fallback');
    if (fallbackIcon) fallbackIcon.style.display = 'none';
  }
  if (profile.theme_color) applyThemeColor(profile.theme_color);
}

// Overrides the app's default green with this pharmacy's chosen color, by
// setting the CSS variable every button/badge/sidebar already reads from.
// Also derives a slightly darker shade for hover/emphasis states, so the
// pharmacy only has to pick ONE color, not maintain a whole palette.
function applyThemeColor(hex) {
  document.documentElement.style.setProperty('--green-primary', hex);
  document.documentElement.style.setProperty('--green-dark', shadeColor(hex, -20));
  document.documentElement.style.setProperty('--green-pale', shadeColor(hex, 85));
  localStorage.setItem('pharmacy_theme_color', hex); // synchronous cache, read before first paint next load
}

function shadeColor(hex, percent) {
  const num = parseInt(hex.slice(1), 16);
  let r = (num >> 16) + Math.round(255 * (percent / 100));
  let g = ((num >> 8) & 0x00ff) + Math.round(255 * (percent / 100));
  let b = (num & 0x0000ff) + Math.round(255 * (percent / 100));
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1)}`;
}