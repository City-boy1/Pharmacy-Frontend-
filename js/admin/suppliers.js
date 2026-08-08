// Admin > Suppliers page logic. Simple list + add form, no edit/delete yet —
// backend has no PUT/DELETE for suppliers (matches the "no DELETE endpoints
// anywhere" gap noted in PROJECT_STATUS.md section 6.7).

let allSuppliers = [];

document.getElementById('brand-icon-fallback').innerHTML = SVG_ICONS.pill;
document.getElementById('nav-dashboard').innerHTML = `${SVG_ICONS.dashboard} Dashboard`;
document.getElementById('nav-inventory').innerHTML = `${SVG_ICONS.box} Inventory`;
document.getElementById('nav-reports').innerHTML = `${SVG_ICONS.fileText} Reports`;
document.getElementById('nav-suppliers').innerHTML = `${SVG_ICONS.truck} Suppliers`;
document.getElementById('nav-staff').innerHTML = `${SVG_ICONS.users} Staff`;
document.getElementById('nav-audit').innerHTML = `${SVG_ICONS.history} Audit Log`;
document.getElementById('nav-settings').innerHTML = `${SVG_ICONS.settings} Settings`;
document.getElementById('logout-link').innerHTML = `${SVG_ICONS.logout} Log Out`;
document.getElementById('add-supplier-btn').innerHTML = `${SVG_ICONS.plus} Add Supplier`;
document.getElementById('supplier-modal-close').innerHTML = SVG_ICONS.x;
document.getElementById('supplier-stock-modal-close').innerHTML = SVG_ICONS.x;

initActiveNavScroll();

const searchWrap = document.querySelector('.admin-toolbar .search-input-wrap');
searchWrap.innerHTML = `${SVG_ICONS.search}<input id="sup-search-box" placeholder="Filter by name…" />`;
const supSearchBox = document.getElementById('sup-search-box');

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied to clipboard');
  } catch (err) {
    // Clipboard API can fail on non-HTTPS/non-localhost origins or if the
    // browser denies permission — fall back so it still works either way.
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      showToast('Copied to clipboard');
    } catch {
      showToast('Could not copy — please copy manually', 'error');
    }
    textarea.remove();
  }
}

function buildSupplierRow(sup) {
  const tr = document.createElement('tr');
  if (sup.active === false) tr.style.opacity = '0.55';

  const nameTd = document.createElement('td');
  nameTd.style.fontWeight = '600';
  nameTd.textContent = sup.name;

  const contactTd = document.createElement('td');
  contactTd.className = 'muted';
  contactTd.style.display = 'flex';
  contactTd.style.alignItems = 'center';
  contactTd.style.gap = '6px';
  const contactText = document.createElement('span');
  contactText.textContent = sup.contact_info || '—';
  contactTd.appendChild(contactText);
  if (sup.contact_info) {
    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn-secondary btn-icon';
    copyBtn.style.padding = '3px 6px';
    copyBtn.innerHTML = SVG_ICONS.copy;
    copyBtn.title = 'Copy';
    copyBtn.addEventListener('click', () => copyToClipboard(sup.contact_info));
    contactTd.appendChild(copyBtn);
  }

  const dateTd = document.createElement('td');
  dateTd.textContent = new Date(sup.created_at).toLocaleDateString();
  dateTd.className = 'muted';

  const actionTd = document.createElement('td');
  actionTd.style.display = 'flex';
  actionTd.style.gap = '6px';

  const editBtn = document.createElement('button');
  editBtn.className = 'btn-secondary';
  editBtn.style.fontSize = '0.78rem';
  editBtn.style.padding = '6px 10px';
  editBtn.textContent = 'Edit';
  editBtn.addEventListener('click', () => openSupplierModal(sup));
  actionTd.appendChild(editBtn);

  const stockBtn = document.createElement('button');
  stockBtn.className = 'btn-secondary';
  stockBtn.style.fontSize = '0.78rem';
  stockBtn.style.padding = '6px 10px';
  stockBtn.textContent = 'Stock';
  stockBtn.addEventListener('click', () => openSupplierStockModal(sup));
  actionTd.appendChild(stockBtn);

  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'btn-secondary';
  toggleBtn.style.fontSize = '0.78rem';
  toggleBtn.style.padding = '6px 10px';
  toggleBtn.textContent = sup.active === false ? 'Reactivate' : 'Deactivate';
  toggleBtn.addEventListener('click', () => toggleSupplierActive(sup));
  actionTd.appendChild(toggleBtn);

  tr.append(nameTd, contactTd, dateTd, actionTd);
  return tr;
}

async function toggleSupplierActive(sup) {
  const action = sup.active === false ? 'reactivate' : 'deactivate';
  const msg = action === 'deactivate'
    ? `Deactivate ${sup.name}? It'll be hidden from new batch entry but past batches keep this supplier on record.`
    : `Reactivate ${sup.name}?`;
  if (!confirm(msg)) return;

  try {
    await apiRequest(`/admin/suppliers/${sup.supplier_id}/${action}`, { method: 'PATCH' });
    showToast(`${sup.name} ${action}d`);
    await loadSuppliers();
  } catch (err) {
    showToast(err.message || `Could not ${action} supplier`, 'error');
  }
}

function renderSuppliersTable(list) {
  const tbody = document.getElementById('suppliers-tbody');
  tbody.innerHTML = '';
  if (list.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 3;
    td.className = 'muted';
    td.textContent = 'No suppliers yet.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  for (const sup of list) tbody.appendChild(buildSupplierRow(sup));
}

async function loadSuppliers() {
  const includeInactive = document.getElementById('show-inactive-toggle')?.checked;
  try {
    allSuppliers = await apiRequest(`/admin/suppliers${includeInactive ? '?include_inactive=true' : ''}`);
    renderSuppliersTable(allSuppliers);
  } catch (err) {
    showToast(err.message || 'Could not load suppliers', 'error');
  }
}

supSearchBox.addEventListener('input', () => {
  const q = supSearchBox.value.trim().toLowerCase();
  if (!q) { renderSuppliersTable(allSuppliers); return; }
  renderSuppliersTable(allSuppliers.filter((s) => (s.name || '').toLowerCase().includes(q)));
});

let editingSupplierId = null;

function openSupplierModal(existingSupplier = null) {
  editingSupplierId = existingSupplier ? existingSupplier.supplier_id : null;
  document.querySelector('#supplier-modal h3').textContent = existingSupplier ? 'Edit Supplier' : 'Add Supplier';
  document.getElementById('sup-name').value = existingSupplier?.name || '';
  document.getElementById('sup-contact').value = existingSupplier?.contact_info || '';
  document.getElementById('supplier-save-btn').textContent = existingSupplier ? 'Save Changes' : 'Save Supplier';
  document.getElementById('supplier-modal').style.display = 'flex';
}
function closeSupplierModal() {
  document.getElementById('supplier-modal').style.display = 'none';
  editingSupplierId = null;
}
document.getElementById('add-supplier-btn').addEventListener('click', openSupplierModal);
document.getElementById('supplier-modal-close').addEventListener('click', closeSupplierModal);
document.getElementById('supplier-cancel-btn').addEventListener('click', closeSupplierModal);
document.getElementById('show-inactive-toggle')?.addEventListener('change', loadSuppliers);

document.getElementById('supplier-save-btn').addEventListener('click', async () => {
  const name = document.getElementById('sup-name').value.trim();
  if (!name) { showToast('Supplier name is required', 'error'); return; }
  const payload = { name, contact_info: document.getElementById('sup-contact').value.trim() || null };

  try {
    if (editingSupplierId) {
      await apiRequest(`/admin/suppliers/${editingSupplierId}`, { method: 'PUT', body: payload });
      showToast(`${name} updated`);
    } else {
      await apiRequest('/admin/suppliers', { method: 'POST', body: payload });
      showToast(`${name} added`);
    }
    closeSupplierModal();
    await loadSuppliers();
  } catch (err) {
    showToast(err.message || 'Could not save supplier', 'error');
  }
});

async function openSupplierStockModal(sup) {
  const modal = document.getElementById('supplier-stock-modal');
  document.getElementById('supplier-stock-label').textContent = sup.name;
  const body = document.getElementById('supplier-stock-body');
  body.innerHTML = '<p class="muted">Loading…</p>';
  modal.style.display = 'flex';

  try {
    const batches = await apiRequest(`/admin/suppliers/${sup.supplier_id}/batches`);
    body.innerHTML = '';
    if (batches.length === 0) {
      body.innerHTML = '<p class="muted">No stock recorded from this supplier yet.</p>';
      return;
    }
    for (const b of batches) {
      const row = document.createElement('div');
      row.className = 'admin-alert-row';
      const info = document.createElement('span');
      const receivedDate = new Date(b.received_at).toLocaleDateString();
      info.textContent = `${b.brand_name} — Qty: ${b.quantity_in_stock} — Cost: ₵${Number(b.cost_price).toFixed(2)}/unit — Received: ${receivedDate}`;
      row.appendChild(info);
      body.appendChild(row);
    }
  } catch (err) {
    body.innerHTML = '';
    showToast(err.message || 'Could not load supplier stock', 'error');
  }
}
document.getElementById('supplier-stock-modal-close').addEventListener('click', () => {
  document.getElementById('supplier-stock-modal').style.display = 'none';
});

document.getElementById('logout-link').addEventListener('click', (e) => { e.preventDefault(); logout(); });

(async function init() {
  const session = await requireSession();
  if (!session) return;
  if (session.role !== 'admin') { window.location.href = 'pos.html'; return; }
  document.getElementById('admin-name').textContent = session.name;

  await loadSuppliers();

  const branding = await loadPharmacyBranding();
  applyBrandingToSidebar(branding);
})();
