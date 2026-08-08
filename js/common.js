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

// Builds one reconciliation row (expected vs counted vs variance) for the
// shift-close result card. `key` matches the shifts table column suffix
function reconLine(label, result, key) {
  const system = Number(result[`system_${key}`] || 0);
  const countedRaw = result[`counted_${key}`];
  const varianceRaw = result[`variance_${key}`];
  const counted = countedRaw != null ? Number(countedRaw) : null;
  const variance = varianceRaw != null ? Number(varianceRaw) : null;

  const row = document.createElement('div');
  row.className = 'recon-line';
  row.style.cssText = 'display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--cream-border); font-size:0.9rem;';

  let rightSide;
  if (variance === null) {
    rightSide = `Expected ₵ ${formatCurrency(system)} &nbsp;•&nbsp; <strong style="color:var(--alert-yellow)">Not counted — needs review</strong>`;
  } else {
    const varianceColor = variance === 0 ? 'var(--text-muted)' : (variance < 0 ? 'var(--alert-red)' : 'var(--alert-yellow)');
    const varianceSign = variance > 0 ? '+' : '';
    rightSide = `Expected ₵ ${formatCurrency(system)} &nbsp;•&nbsp; Counted ₵ ${formatCurrency(counted)} &nbsp;•&nbsp; <strong style="color:${varianceColor}">${varianceSign}${formatCurrency(variance)}</strong>`;
  }

  row.innerHTML = `<span>${label}</span><span>${rightSide}</span>`;
  return row;
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
  const session = await getSession();
  if (session) {
    const activeShiftId = await getMeta('active_shift_id', null);
    if (activeShiftId) {
      const shiftRow = await db.shifts.where('shift_id').equals(activeShiftId).first();
      if (shiftRow && shiftRow.cashier_id === session.user_id) {
        const choice = await confirmShiftCloseModal();
        if (choice === 'cancel') return;
        if (choice === 'close') {
          window.location.href = 'shift.html';
          return;
        }
        // choice === 'leave': fall through and log out, shift stays open
        // for the next cashier's force-close prompt on shift.html
      }
    }
  }
  await clearSession();
  window.location.href = 'login.html';
}

// Lightweight modal, styled off the app's existing CSS variables — no new
// dependency. Resolves 'close' | 'leave' | 'cancel'.
function confirmShiftCloseModal() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card">
        <h3 style="margin-top:0;">You have an open shift</h3>
        <p class="muted">Count your drawer and close it now, or leave it open for the next
          cashier to review — either way it stays safe, but closing now keeps the record clean.</p>
        <div class="modal-actions">
          <button class="btn-secondary" data-choice="cancel">Cancel</button>
          <button class="btn-secondary" data-choice="leave">Log Out Anyway</button>
          <button data-choice="close">Close Shift First</button>
        </div>
      </div>`;
    overlay.addEventListener('click', (e) => {
      const choice = e.target.dataset.choice;
      if (choice) { overlay.remove(); resolve(choice); }
    });
    document.body.appendChild(overlay);
  });
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
  localStorage.setItem('pharmacy_brand_cache', JSON.stringify({ name: profile.name, logo_url: profile.logo_url }));
}

// Overrides the app's default green with this pharmacy's chosen color, by
// setting the CSS variable every button/badge/sidebar already reads from.
// Also derives a slightly darker shade for hover/emphasis states, so the
// pharmacy only has to pick ONE color, not maintain a whole palette.
function applyThemeColor(hex) {
  const dark = shadeColor(hex, -20);
  const light = shadeColor(hex, 30);
  const pale = shadeColor(hex, 85);
  document.documentElement.style.setProperty('--green-primary', hex);
  document.documentElement.style.setProperty('--green-dark', dark);
  document.documentElement.style.setProperty('--green-light', light);
  document.documentElement.style.setProperty('--green-pale', pale);
  localStorage.setItem('pharmacy_theme_color', hex);
  localStorage.setItem('pharmacy_theme_dark', dark);
  localStorage.setItem('pharmacy_theme_light', light);
  localStorage.setItem('pharmacy_theme_pale', pale);
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