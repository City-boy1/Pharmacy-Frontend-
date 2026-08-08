// Admin > Inventory page logic. Medicines list, Add/Edit Medicine, Add/Edit
// Batch, view batches per medicine, CSV/XLSX import, export, archive/restore.
// All dynamic content built via DOM methods (textContent), never innerHTML with
// server-supplied strings — this is the fix for the XSS gap flagged in PROJECT_STATUS.md.

// ---------- State ----------
let session = null;
let allMedicines = [];
let editingMedicineId = null;   // null = Add Medicine mode, set = Edit Medicine mode
let batchTargetMedicineId = null; // which medicine a batch modal action applies to
let batchTargetMedicineType = null; // that medicine's product_type, drives whether expiry is required
let editingBatchId = null; 
let currentMedicineType = 'medicine'; // tracks the modal's selected type toggle     // null = Add Batch mode, set = Edit Batch mode

// ---------- Static icon-bearing chrome ----------
document.getElementById('brand-icon-fallback').innerHTML = SVG_ICONS.pill;
document.getElementById('nav-dashboard').innerHTML = `${SVG_ICONS.dashboard} Dashboard`;
document.getElementById('nav-inventory').innerHTML = `${SVG_ICONS.box} Inventory`;
document.getElementById('nav-reports').innerHTML = `${SVG_ICONS.fileText} Reports`;
document.getElementById('nav-suppliers').innerHTML = `${SVG_ICONS.truck} Suppliers`;
document.getElementById('nav-staff').innerHTML = `${SVG_ICONS.users} Staff`;
document.getElementById('nav-audit').innerHTML = `${SVG_ICONS.history} Audit Log`;
document.getElementById('nav-settings').innerHTML = `${SVG_ICONS.settings} Settings`;
document.getElementById('logout-link').innerHTML = `${SVG_ICONS.logout} Log Out`;
document.getElementById('import-btn').innerHTML = `${SVG_ICONS.upload} Import`;
document.getElementById('export-btn').innerHTML = `${SVG_ICONS.download} Export CSV`;
document.getElementById('add-medicine-btn').innerHTML = `${SVG_ICONS.plus} Add Medicine`;
document.getElementById('medicine-modal-close').innerHTML = SVG_ICONS.x;
document.getElementById('batch-modal-close').innerHTML = SVG_ICONS.x;
document.getElementById('batch-list-modal-close').innerHTML = SVG_ICONS.x;
document.getElementById('import-modal-close').innerHTML = SVG_ICONS.x;
document.getElementById('med-barcode-scan-btn').innerHTML = SVG_ICONS.barcode;
document.getElementById('med-type-medicine').innerHTML = `${SVG_ICONS.pill} Medicine`;
document.getElementById('med-type-goods').innerHTML = `${SVG_ICONS.basket} General Goods`;

initActiveNavScroll();

const searchWrap = document.querySelector('.admin-toolbar .search-input-wrap');
searchWrap.innerHTML = `${SVG_ICONS.search}<input id="inv-search-box" placeholder="Filter by name, generic name, or barcode…" />`;
const invSearchBox = document.getElementById('inv-search-box');

// ==================== Medicines table ====================

function stockClass(total, minLevel) {
  const threshold = minLevel && minLevel > 0 ? minLevel : 10; // mirrors settings.low_stock_default fallback server-side
  return total <= threshold ? 'low' : 'ok';
}

function buildRow(med) {
  const tr = document.createElement('tr');
  if (med.active === false) tr.style.opacity = '0.55';

  const nameTd = document.createElement('td');
  const nameWrap = document.createElement('div');
  nameWrap.style.display = 'flex';
  nameWrap.style.alignItems = 'center';
  nameWrap.style.gap = '6px';
  const nameSpan = document.createElement('span');
  nameSpan.style.fontWeight = '600';
  nameSpan.textContent = med.brand_name;
  nameWrap.appendChild(nameSpan);
  if (med.product_type === 'general_goods') {
    const goodsBadge = document.createElement('span');
    goodsBadge.className = 'badge';
    goodsBadge.style.background = 'var(--green-pale)';
    goodsBadge.style.color = 'var(--green-dark)';
    goodsBadge.textContent = 'Goods';
    nameWrap.appendChild(goodsBadge);
  } else if (med.rx_flag) {
    const rx = document.createElement('span');
    rx.className = 'rx-badge';
    rx.textContent = 'Rx';
    nameWrap.appendChild(rx);
  }
  nameTd.appendChild(nameWrap);

  const genericTd = document.createElement('td');
  genericTd.textContent = med.generic_name || '—';
  genericTd.className = 'muted';

  const categoryTd = document.createElement('td');
  categoryTd.textContent = med.category_id ? med.category_id : '—';
  categoryTd.className = 'muted';

  const barcodeTd = document.createElement('td');
  barcodeTd.textContent = med.barcode || '—';
  barcodeTd.className = 'muted';

  const stockTd = document.createElement('td');
  const stockPill = document.createElement('span');
  stockPill.className = 'stock-pill ' + stockClass(Number(med.total_stock), Number(med.min_reorder_level));
  stockPill.textContent = med.total_stock;
  stockTd.appendChild(stockPill);

  const reorderTd = document.createElement('td');
  reorderTd.textContent = med.min_reorder_level || 0;
  reorderTd.className = 'muted';

  const actionTd = document.createElement('td');
  actionTd.style.display = 'flex';
  actionTd.style.gap = '6px';

  const editBtn = document.createElement('button');
  editBtn.className = 'btn-secondary btn-icon';
  editBtn.innerHTML = `${SVG_ICONS.pencil} Edit`;
  editBtn.addEventListener('click', () => openMedicineModal(med));
  actionTd.appendChild(editBtn);

  if (med.active !== false) {
    const addBatchBtn = document.createElement('button');
    addBatchBtn.className = 'btn-secondary btn-icon';
    addBatchBtn.innerHTML = `${SVG_ICONS.plus} Batch`;
    addBatchBtn.addEventListener('click', () => openBatchModal(med));
    actionTd.appendChild(addBatchBtn);

    const viewBatchesBtn = document.createElement('button');
    viewBatchesBtn.className = 'btn-secondary btn-icon';
    viewBatchesBtn.innerHTML = `${SVG_ICONS.box} Batches`;
    viewBatchesBtn.addEventListener('click', () => openBatchListModal(med));
    actionTd.appendChild(viewBatchesBtn);

    const archiveBtn = document.createElement('button');
    archiveBtn.className = 'btn-secondary btn-icon';
    archiveBtn.innerHTML = `${SVG_ICONS.x} Archive`;
    archiveBtn.addEventListener('click', () => confirmArchive(med));
    actionTd.appendChild(archiveBtn);
  } else {
    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'btn-secondary btn-icon';
    restoreBtn.innerHTML = `${SVG_ICONS.check} Restore`;
    restoreBtn.addEventListener('click', () => restoreMedicineHandler(med));
    actionTd.appendChild(restoreBtn);
  }

  tr.append(nameTd, genericTd, categoryTd, barcodeTd, stockTd, reorderTd, actionTd);
  return tr;
}

function renderTable(list) {
  const tbody = document.getElementById('medicines-tbody');
  tbody.innerHTML = '';
  if (list.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 7;
    td.className = 'muted';
    td.textContent = 'No medicines match your search.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  for (const med of list) tbody.appendChild(buildRow(med));
}

async function loadMedicines() {
  const includeArchived = document.getElementById('show-archived-toggle').checked;
  try {
    allMedicines = await apiRequest(`/admin/medicines${includeArchived ? '?include_archived=true' : ''}`);
    applyFilters();
  } catch (err) {
    showToast(err.message || 'Could not load medicines', 'error');
  }
}

// Combines the text search and the type filter into one pass, so changing
// either one always reflects the current state of both — not just whichever
// control was touched last.
function applyFilters() {
  const q = invSearchBox.value.trim().toLowerCase();
  const typeFilter = document.getElementById('type-filter-select').value;

  let filtered = allMedicines;
  if (typeFilter !== 'all') {
    filtered = filtered.filter((m) => (m.product_type || 'medicine') === typeFilter);
  }
  if (q) {
    filtered = filtered.filter((m) =>
      (m.brand_name || '').toLowerCase().includes(q) ||
      (m.generic_name || '').toLowerCase().includes(q) ||
      (m.barcode || '').toLowerCase().includes(q)
    );
  }
  renderTable(filtered);
}

async function confirmArchive(med) {
  if (!confirm(`Archive "${med.brand_name}"? It will stop appearing in checkout search, but past sales history is kept.`)) return;
  try {
    await apiRequest(`/admin/medicines/${med.medicine_id}/archive`, { method: 'PATCH' });
    showToast(`${med.brand_name} archived`);
    await loadMedicines();
  } catch (err) {
    showToast(err.message || 'Could not archive medicine', 'error');
  }
}

async function restoreMedicineHandler(med) {
  try {
    await apiRequest(`/admin/medicines/${med.medicine_id}/restore`, { method: 'PATCH' });
    showToast(`${med.brand_name} restored`);
    await loadMedicines();
  } catch (err) {
    showToast(err.message || 'Could not restore medicine', 'error');
  }
}

document.getElementById('show-archived-toggle').addEventListener('change', loadMedicines);

invSearchBox.addEventListener('input', applyFilters);
document.getElementById('type-filter-select').addEventListener('change', applyFilters);

function setMedicineType(type) {
  currentMedicineType = type;
  document.getElementById('med-type-medicine').classList.toggle('active', type === 'medicine');
  document.getElementById('med-type-goods').classList.toggle('active', type === 'general_goods');
  document.getElementById('med-medicine-only-fields').style.display = type === 'medicine' ? 'block' : 'none';
  document.getElementById('med-rx-field').style.display = type === 'medicine' ? 'flex' : 'none';
  document.getElementById('med-brand-label').textContent = type === 'medicine' ? 'Brand Name *' : 'Product Name *';
}
document.getElementById('med-type-medicine').addEventListener('click', () => setMedicineType('medicine'));
document.getElementById('med-type-goods').addEventListener('click', () => setMedicineType('general_goods'));

// ==================== Add / Edit Medicine modal ====================

function openMedicineModal(existingMed = null) {
  editingMedicineId = existingMed ? existingMed.medicine_id : null;
  document.querySelector('#medicine-modal h3').textContent = existingMed ? 'Edit Product' : 'Add Product';
  document.getElementById('med-brand').value = existingMed?.brand_name || '';
  document.getElementById('med-generic').value = existingMed?.generic_name || '';
  document.getElementById('med-barcode').value = existingMed?.barcode || '';
  document.getElementById('med-reorder').value = existingMed?.min_reorder_level || '';
  document.getElementById('med-rx').checked = !!existingMed?.rx_flag;
  setMedicineType(existingMed?.product_type === 'general_goods' ? 'general_goods' : 'medicine');
  document.getElementById('medicine-save-btn').textContent = existingMed ? 'Save Changes' : 'Save Medicine';
  document.getElementById('medicine-modal').style.display = 'flex';
}
function closeMedicineModal() {
  document.getElementById('medicine-modal').style.display = 'none';
  editingMedicineId = null;
}
document.getElementById('add-medicine-btn').addEventListener('click', () => openMedicineModal());
document.getElementById('medicine-modal-close').addEventListener('click', closeMedicineModal);
document.getElementById('medicine-cancel-btn').addEventListener('click', closeMedicineModal);

// Reuse the same HID-scanner detection as the POS search box, so an admin
// can scan a barcode straight into the Add/Edit Medicine form.
attachBarcodeScanner(document.getElementById('med-barcode'), (code) => {
  document.getElementById('med-barcode').value = code;
});

document.getElementById('medicine-save-btn').addEventListener('click', async () => {
  const brand_name = document.getElementById('med-brand').value.trim();
  if (!brand_name) { showToast(currentMedicineType === 'medicine' ? 'Brand name is required' : 'Product name is required', 'error'); return; }

  const payload = {
    brand_name,
    product_type: currentMedicineType,
    // Generic name and Rx only make sense for medicine — force-clear them for
    // general goods so a stale value from a prior edit can't linger unseen.
    generic_name: currentMedicineType === 'medicine' ? (document.getElementById('med-generic').value.trim() || null) : null,
    barcode: document.getElementById('med-barcode').value.trim() || null,
    min_reorder_level: Number(document.getElementById('med-reorder').value) || 0,
    rx_flag: currentMedicineType === 'medicine' ? document.getElementById('med-rx').checked : false,
  };

  try {
    if (editingMedicineId) {
      await apiRequest(`/admin/medicines/${editingMedicineId}`, { method: 'PUT', body: payload });
      showToast(`${brand_name} updated`);
    } else {
      await apiRequest('/admin/medicines', { method: 'POST', body: payload });
      showToast(`${brand_name} added`);
    }
    closeMedicineModal();
    await loadMedicines();
  } catch (err) {
    showToast(err.message || 'Could not save medicine', 'error');
  }
});

// ==================== Add / Edit Batch modal ====================

function openBatchModal(med, existingBatch = null) {
  batchTargetMedicineId = med.medicine_id;
  batchTargetMedicineType = med.product_type === 'general_goods' ? 'general_goods' : 'medicine';
  document.getElementById('batch-expiry-label').textContent = batchTargetMedicineType === 'medicine' ? 'Expiry Date *' : 'Expiry Date (optional)';
  editingBatchId = existingBatch ? existingBatch.batch_id : null;
  document.getElementById('batch-modal-title').textContent = existingBatch ? 'Edit Batch' : 'Add Batch';
  document.getElementById('batch-medicine-label').textContent = `For: ${med.brand_name}`;
  document.getElementById('batch-supplier').value = existingBatch?.supplier_id || '';
  document.getElementById('batch-number').value = existingBatch?.batch_number || '';
  document.getElementById('batch-expiry').value = existingBatch?.expiry_date ? existingBatch.expiry_date.slice(0, 10) : '';
  document.getElementById('batch-qty').value = existingBatch?.quantity_in_stock ?? '';
  document.getElementById('batch-cost').value = existingBatch?.cost_price ?? '';
  document.getElementById('batch-unit-price').value = existingBatch?.unit_price ?? '';
  document.getElementById('batch-save-btn').textContent = existingBatch ? 'Save Changes' : 'Save Batch';
  document.getElementById('batch-modal').style.display = 'flex';
}
function closeBatchModal() {
  document.getElementById('batch-modal').style.display = 'none';
  batchTargetMedicineId = null;
  editingBatchId = null;
}
document.getElementById('batch-modal-close').addEventListener('click', closeBatchModal);
document.getElementById('batch-cancel-btn').addEventListener('click', closeBatchModal);

document.getElementById('batch-save-btn').addEventListener('click', async () => {
  const expiry_date = document.getElementById('batch-expiry').value || null;
  const quantity_in_stock = Number(document.getElementById('batch-qty').value);
  const unit_price = Number(document.getElementById('batch-unit-price').value);

  // Expiry is only mandatory for medicine — general goods may legitimately
  // have none (e.g. cornflakes, canned goods with no tracked expiry).
  if (!expiry_date && batchTargetMedicineType === 'medicine') {
    showToast('Expiry date is required for medicine', 'error');
    return;
  }
  if (quantity_in_stock < 0) { showToast('Enter a valid quantity', 'error'); return; }
  if (!unit_price || unit_price <= 0) { showToast('Enter a valid selling price', 'error'); return; }

  const payload = {
    supplier_id: document.getElementById('batch-supplier').value || null,
    batch_number: document.getElementById('batch-number').value.trim() || null,
    expiry_date,
    quantity_in_stock,
    cost_price: Number(document.getElementById('batch-cost').value) || 0,
    unit_price,
  };

  try {
    if (editingBatchId) {
      await apiRequest(`/admin/batches/${editingBatchId}`, { method: 'PATCH', body: payload });
      showToast('Batch updated');
    } else {
      await apiRequest('/admin/batches', { method: 'POST', body: { ...payload, medicine_id: batchTargetMedicineId } });
      showToast('Batch added');
    }
    closeBatchModal();
    await loadMedicines();
  } catch (err) {
    showToast(err.message || 'Could not save batch', 'error');
  }
});

// ==================== View Batches modal ====================

async function openBatchListModal(med) {
  const modal = document.getElementById('batch-list-modal');
  document.getElementById('batch-list-medicine-label').textContent = med.brand_name;
  const body = document.getElementById('batch-list-body');
  body.innerHTML = '<p class="muted">Loading…</p>';
  modal.style.display = 'flex';

  try {
    const batches = await apiRequest(`/admin/medicines/${med.medicine_id}/batches`);
    body.innerHTML = '';
    if (batches.length === 0) {
      body.innerHTML = '<p class="muted">No batches yet for this medicine.</p>';
      return;
    }
    for (const b of batches) body.appendChild(buildBatchListRow(b, med));
  } catch (err) {
    body.innerHTML = '';
    showToast(err.message || 'Could not load batches', 'error');
  }
}

function buildBatchListRow(b, med) {
  const row = document.createElement('div');
  row.className = 'admin-alert-row';

  const info = document.createElement('span');
  const expiry = b.expiry_date ? new Date(b.expiry_date).toLocaleDateString() : 'No expiry';
  const supplierPart = b.supplier_name ? ` — Supplier: ${b.supplier_name}` : '';
  info.textContent = `${b.batch_number || 'No batch #'} — Qty: ${b.quantity_in_stock} — Expires: ${expiry} — ₵${Number(b.unit_price).toFixed(2)}/unit${supplierPart}`;

  const editBtn = document.createElement('button');
  editBtn.className = 'btn-secondary';
  editBtn.style.fontSize = '0.78rem';
  editBtn.style.padding = '6px 10px';
  editBtn.textContent = 'Edit';
  editBtn.addEventListener('click', () => {
    document.getElementById('batch-list-modal').style.display = 'none';
    openBatchModal(med, b); // reuse the Add/Edit Batch modal, pre-filled, in edit mode
  });

  row.append(info, editBtn);
  return row;
}

document.getElementById('batch-list-modal-close').addEventListener('click', () => {
  document.getElementById('batch-list-modal').style.display = 'none';
});

// ==================== Import (CSV/XLSX) ====================

const importFileInput = document.getElementById('import-file-input');
document.getElementById('import-btn').addEventListener('click', () => importFileInput.click());

importFileInput.addEventListener('change', async () => {
  const file = importFileInput.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);

  try {
    showToast('Importing…');
    const result = await apiRequest('/admin/batches/import', { method: 'POST', body: formData, isFormData: true });
    showImportResult(result);
    await loadMedicines();
  } catch (err) {
    showToast(err.message || 'Import failed', 'error');
  } finally {
    importFileInput.value = '';
  }
});

function showImportResult(result) {
  const body = document.getElementById('import-result-body');
  body.innerHTML = '';

  const summary = document.createElement('p');
  summary.innerHTML = `<strong>${result.inserted}</strong> row(s) imported, <strong>${result.skipped}</strong> skipped.`;
  body.appendChild(summary);

  if (result.errors && result.errors.length > 0) {
    const list = document.createElement('ul');
    list.style.maxHeight = '200px';
    list.style.overflowY = 'auto';
    list.style.fontSize = '0.82rem';
    list.style.color = 'var(--text-muted)';
    for (const e of result.errors) {
      const li = document.createElement('li');
      li.textContent = e; // textContent — error strings may echo back file content, never innerHTML
      list.appendChild(li);
    }
    body.appendChild(list);
  }

  document.getElementById('import-modal').style.display = 'flex';
}
document.getElementById('import-modal-close').addEventListener('click', () => {
  document.getElementById('import-modal').style.display = 'none';
});
document.getElementById('import-modal-ok-btn').addEventListener('click', () => {
  document.getElementById('import-modal').style.display = 'none';
});

// ==================== Export ====================
// This is a GET behind a JWT, not a plain <a href>, so we fetch with the auth
// header ourselves and turn the response into a downloadable blob.
document.getElementById('export-btn').addEventListener('click', async () => {
  try {
    const s = await getSession();
    const res = await fetch(`${API_BASE_URL}/admin/inventory/export`, {
      headers: { Authorization: `Bearer ${s.token}` },
    });
    if (!res.ok) throw new Error(`Export failed (${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'inventory_export.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    showToast(err.message || 'Export failed', 'error');
  }
});

// ==================== Logout & Init ====================

document.getElementById('logout-link').addEventListener('click', (e) => { e.preventDefault(); logout(); });

async function loadSupplierOptions() {
  try {
    const suppliers = await apiRequest('/admin/suppliers');
    const select = document.getElementById('batch-supplier');
    select.innerHTML = '<option value="">— Not specified —</option>';
    for (const s of suppliers) {
      const opt = document.createElement('option');
      opt.value = s.supplier_id;
      opt.textContent = s.name;
      select.appendChild(opt);
    }
  } catch (err) {
    console.warn('Could not load suppliers for batch form:', err.message);
  }
}

(async function init() {
  session = await requireSession();
  if (!session) return;
  if (session.role !== 'admin') { window.location.href = 'pos.html'; return; }
  document.getElementById('admin-name').textContent = session.name;

  await loadMedicines();
  await loadSupplierOptions();

  const branding = await loadPharmacyBranding();
  applyBrandingToSidebar(branding);
})();