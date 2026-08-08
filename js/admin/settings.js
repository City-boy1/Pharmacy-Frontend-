// Admin > Settings page: pharmacy branding (name/logo), alert thresholds,
// mobile money config. Three independent save actions since they hit two
// different endpoints (pharmacy profile vs. settings table).

const ALL_MOMO_PROVIDERS = ['MTN MoMo', 'Vodafone Cash', 'AirtelTigo Money'];

document.getElementById('brand-icon-fallback').innerHTML = SVG_ICONS.pill;
document.getElementById('nav-dashboard').innerHTML = `${SVG_ICONS.dashboard} Dashboard`;
document.getElementById('nav-inventory').innerHTML = `${SVG_ICONS.box} Inventory`;
document.getElementById('nav-reports').innerHTML = `${SVG_ICONS.fileText} Reports`;
document.getElementById('nav-suppliers').innerHTML = `${SVG_ICONS.truck} Suppliers`;
document.getElementById('nav-staff').innerHTML = `${SVG_ICONS.users} Staff`;
document.getElementById('nav-audit').innerHTML = `${SVG_ICONS.history} Audit Log`;
document.getElementById('nav-settings').innerHTML = `${SVG_ICONS.settings} Settings`;
document.getElementById('logout-link').innerHTML = `${SVG_ICONS.logout} Log Out`;
document.getElementById('branding-title').innerHTML = `${SVG_ICONS.pill} Pharmacy Branding`;
document.getElementById('alerts-title').innerHTML = `${SVG_ICONS.alertTriangle} Alert Thresholds`;
document.getElementById('momo-title').innerHTML = `${SVG_ICONS.mobile} Mobile Money`;
document.getElementById('logo-upload-btn').innerHTML = `${SVG_ICONS.upload} Upload Logo`;
document.getElementById('logo-preview-fallback').innerHTML = SVG_ICONS.pill;

let pendingLogoDataUrl = null;

// ---------- Branding ----------
async function loadBranding() {
  try {
    const profile = await apiRequest('/pharmacy/profile');
    document.getElementById('pharm-name').value = profile.name || '';
    if (profile.theme_color) {
      document.getElementById('theme-color-input').value = profile.theme_color;
      document.getElementById('theme-color-hex').textContent = profile.theme_color;
    }
    if (profile.logo_url) {
      const img = document.getElementById('logo-preview');
      img.src = profile.logo_url;
      img.style.display = 'block';
      document.getElementById('logo-preview-fallback').style.display = 'none';
    }
  } catch (err) {
    showToast(err.message || 'Could not load pharmacy profile', 'error');
  }
}

document.getElementById('logo-upload-btn').addEventListener('click', () => {
  document.getElementById('logo-file-input').click();
});

document.getElementById('logo-file-input').addEventListener('change', () => {
  const file = document.getElementById('logo-file-input').files[0];
  if (!file) return;
  if (file.size > 500 * 1024) {
    showToast('That logo is quite large — consider a smaller image for faster loading', 'error');
  }
  const reader = new FileReader();
  reader.onload = () => {
    pendingLogoDataUrl = reader.result; // base64 data URL — matches schema's TEXT column note
    const img = document.getElementById('logo-preview');
    img.src = pendingLogoDataUrl;
    img.style.display = 'block';
    document.getElementById('logo-preview-fallback').style.display = 'none';
  };
  reader.readAsDataURL(file);
});

document.getElementById('branding-save-btn').addEventListener('click', async () => {
  const name = document.getElementById('pharm-name').value.trim();
  if (!name) { showToast('Pharmacy name is required', 'error'); return; }

  const payload = { name, theme_color: document.getElementById('theme-color-input').value };
  if (pendingLogoDataUrl) payload.logo_url = pendingLogoDataUrl;

  try {
    const saved = await apiRequest('/admin/pharmacy/profile', { method: 'PUT', body: payload });
    showToast('Branding saved');
    pendingLogoDataUrl = null;

    // Apply from what we already have instead of re-fetching — no second
    // round-trip before the sidebar/theme visibly updates.
    const branding = { ...payload, ...(saved || {}) };
    applyBrandingToSidebar(branding);
    await setMeta('pharmacy_profile', branding); // keep the offline cache in sync too
  } catch (err) {
    showToast(err.message || 'Could not save branding', 'error');
  }
});

document.getElementById('theme-color-input').addEventListener('input', (e) => {
  document.getElementById('theme-color-hex').textContent = e.target.value;
  applyThemeColor(e.target.value); // live preview as they pick, before saving
});

document.getElementById('theme-color-reset-btn').addEventListener('click', () => {
  const defaultColor = '#2E6F52';
  document.getElementById('theme-color-input').value = defaultColor;
  document.getElementById('theme-color-hex').textContent = defaultColor;
  applyThemeColor(defaultColor);
});

// ---------- Alert thresholds ----------
async function loadSettings() {
  try {
    const settings = await apiRequest('/admin/settings');
    document.getElementById('low-stock-default').value = settings.low_stock_default;
    document.getElementById('expiry-red').value = settings.near_expiry_red_days;
    document.getElementById('expiry-yellow').value = settings.near_expiry_yellow_days;
    document.getElementById('momo-enabled').checked = settings.mobile_money_enabled;
    renderMomoProviderChecks(settings.mobile_money_providers || []);
  } catch (err) {
    showToast(err.message || 'Could not load settings', 'error');
  }
}

document.getElementById('alerts-save-btn').addEventListener('click', async () => {
  const low_stock_default = Number(document.getElementById('low-stock-default').value);
  const near_expiry_red_days = Number(document.getElementById('expiry-red').value);
  const near_expiry_yellow_days = Number(document.getElementById('expiry-yellow').value);

  if (near_expiry_red_days >= near_expiry_yellow_days) {
    showToast('Red alert days should be lower than yellow alert days', 'error');
    return;
  }

  try {
    await patchSettings({ low_stock_default, near_expiry_red_days, near_expiry_yellow_days });
    showToast('Alert thresholds saved');
  } catch (err) {
    showToast(err.message || 'Could not save thresholds', 'error');
  }
});

// ---------- Mobile Money ----------
function renderMomoProviderChecks(enabledProviders) {
  const wrap = document.getElementById('momo-provider-checks');
  wrap.innerHTML = '';
  for (const provider of ALL_MOMO_PROVIDERS) {
    const label = document.createElement('label');
    label.style.display = 'flex';
    label.style.alignItems = 'center';
    label.style.gap = '8px';
    label.style.margin = '0';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.style.width = 'auto';
    cb.value = provider;
    cb.checked = enabledProviders.includes(provider);
    label.append(cb);
    const span = document.createElement('span');
    span.textContent = provider;
    label.appendChild(span);
    wrap.appendChild(label);
  }
}

document.getElementById('momo-save-btn').addEventListener('click', async () => {
  const mobile_money_enabled = document.getElementById('momo-enabled').checked;
  const mobile_money_providers = Array.from(
    document.querySelectorAll('#momo-provider-checks input[type=checkbox]:checked')
  ).map((cb) => cb.value);

  if (mobile_money_enabled && mobile_money_providers.length === 0) {
    showToast('Enable at least one provider, or turn off Mobile Money entirely', 'error');
    return;
  }

  try {
    await patchSettings({ mobile_money_enabled, mobile_money_providers });
    showToast('Mobile money settings saved');
  } catch (err) {
    showToast(err.message || 'Could not save mobile money settings', 'error');
  }
});

// Fetch-merge-save so one form's save doesn't clobber the other form's fields
// (PUT /admin/settings replaces the whole row).
async function patchSettings(partial) {
  const current = await apiRequest('/admin/settings');
  const merged = { ...current, ...partial };
  await apiRequest('/admin/settings', { method: 'PUT', body: merged });
}

document.getElementById('logout-link').addEventListener('click', (e) => { e.preventDefault(); logout(); });

(async function init() {
  const session = await requireSession();
  if (!session) return;
  if (session.role !== 'admin') { window.location.href = 'pos.html'; return; }
  document.getElementById('admin-name').textContent = session.name;

  await loadBranding();
  await loadSettings();

  const branding = await loadPharmacyBranding();
  applyBrandingToSidebar(branding);
})();