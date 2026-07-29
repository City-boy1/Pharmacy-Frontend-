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

const searchWrap = document.querySelector('.admin-toolbar .search-input-wrap');
searchWrap.innerHTML = `${SVG_ICONS.search}<input id="sup-search-box" placeholder="Filter by name…" />`;
const supSearchBox = document.getElementById('sup-search-box');

function buildSupplierRow(sup) {
  const tr = document.createElement('tr');
  if (sup.active === false) tr.style.opacity = '0.55';

  const nameTd = document.createElement('td');
  nameTd.style.fontWeight = '600';
  nameTd.textContent = sup.name;

  const contactTd = document.createElement('td');
  contactTd.textContent = sup.contact_info || '—';
  contactTd.className = 'muted';

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
