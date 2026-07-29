// Admin > Staff page logic. List + add form. No deactivate/edit endpoint
// exists server-side yet (listStaff/createStaff only) — "Active" column is
// display-only until a PATCH /admin/staff/:id endpoint is added.

let allStaff = [];

document.getElementById('brand-icon-fallback').innerHTML = SVG_ICONS.pill;
document.getElementById('nav-dashboard').innerHTML = `${SVG_ICONS.dashboard} Dashboard`;
document.getElementById('nav-inventory').innerHTML = `${SVG_ICONS.box} Inventory`;
document.getElementById('nav-reports').innerHTML = `${SVG_ICONS.fileText} Reports`;
document.getElementById('nav-suppliers').innerHTML = `${SVG_ICONS.truck} Suppliers`;
document.getElementById('nav-staff').innerHTML = `${SVG_ICONS.users} Staff`;
document.getElementById('nav-audit').innerHTML = `${SVG_ICONS.history} Audit Log`;
document.getElementById('nav-settings').innerHTML = `${SVG_ICONS.settings} Settings`;
document.getElementById('logout-link').innerHTML = `${SVG_ICONS.logout} Log Out`;
document.getElementById('add-staff-btn').innerHTML = `${SVG_ICONS.plus} Add Staff`;
document.getElementById('staff-modal-close').innerHTML = SVG_ICONS.x;

const searchWrap = document.querySelector('.admin-toolbar .search-input-wrap');
searchWrap.innerHTML = `${SVG_ICONS.search}<input id="staff-search-box" placeholder="Filter by name…" />`;
const staffSearchBox = document.getElementById('staff-search-box');

function buildStaffRow(u) {
  const tr = document.createElement('tr');

  const nameTd = document.createElement('td');
  nameTd.style.fontWeight = '600';
  nameTd.textContent = u.name;

  const roleTd = document.createElement('td');
  const roleBadge = document.createElement('span');
  roleBadge.className = 'badge ' + (u.role === 'admin' ? 'badge-yellow' : 'badge-red');
  roleBadge.style.color = u.role === 'admin' ? '#8a6100' : '#1c6b3d';
  roleBadge.style.background = u.role === 'admin' ? '#fdf1cf' : 'var(--green-pale)';
  roleBadge.textContent = u.role;
  roleTd.appendChild(roleBadge);

  const shiftTd = document.createElement('td');
  shiftTd.textContent = u.shift_status;
  shiftTd.className = 'muted';

  const activeTd = document.createElement('td');
  const activeBadge = document.createElement('span');
  activeBadge.className = 'badge ' + (u.active ? 'badge-success' : 'badge-red');
  activeBadge.textContent = u.active ? 'Active' : 'Deactivated';
  activeTd.appendChild(activeBadge);

  const dateTd = document.createElement('td');
  dateTd.textContent = new Date(u.created_at).toLocaleDateString();
  dateTd.className = 'muted';

  const actionTd = document.createElement('td');
  const actionBtn = document.createElement('button');
  actionBtn.className = 'btn-secondary';
  actionBtn.style.fontSize = '0.78rem';
  actionBtn.style.padding = '6px 10px';
  actionBtn.textContent = u.active ? 'Deactivate' : 'Reactivate';
  actionBtn.addEventListener('click', () => toggleStaffActive(u));
  actionTd.appendChild(actionBtn);

  tr.append(nameTd, roleTd, shiftTd, activeTd, dateTd, actionTd);
  return tr;
}

async function toggleStaffActive(u) {
  const action = u.active ? 'deactivate' : 'reactivate';
  const confirmMsg = u.active
    ? `Deactivate ${u.name}? They won't be able to log in until reactivated. Their past sales stay intact.`
    : `Reactivate ${u.name}? They'll be able to log in again.`;
  if (!confirm(confirmMsg)) return;

  try {
    await apiRequest(`/admin/staff/${u.user_id}/${action}`, { method: 'PATCH' });
    showToast(`${u.name} ${action}d`);
    await loadStaff();
  } catch (err) {
    showToast(err.message || `Could not ${action} staff member`, 'error');
  }
}

function renderStaffTable(list) {
  const tbody = document.getElementById('staff-tbody');
  tbody.innerHTML = '';
  if (list.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.className = 'muted';
    td.textContent = 'No staff members yet.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  for (const u of list) tbody.appendChild(buildStaffRow(u));
}

async function loadStaff() {
  try {
    allStaff = await apiRequest('/admin/staff');
    renderStaffTable(allStaff);
  } catch (err) {
    showToast(err.message || 'Could not load staff', 'error');
  }
}

staffSearchBox.addEventListener('input', () => {
  const q = staffSearchBox.value.trim().toLowerCase();
  if (!q) { renderStaffTable(allStaff); return; }
  renderStaffTable(allStaff.filter((u) => (u.name || '').toLowerCase().includes(q)));
});

function openStaffModal() {
  document.getElementById('staff-name').value = '';
  document.getElementById('staff-role').value = 'cashier';
  document.getElementById('staff-pin').value = '';
  document.getElementById('staff-modal').style.display = 'flex';
}
function closeStaffModal() {
  document.getElementById('staff-modal').style.display = 'none';
}
document.getElementById('add-staff-btn').addEventListener('click', openStaffModal);
document.getElementById('staff-modal-close').addEventListener('click', closeStaffModal);
document.getElementById('staff-cancel-btn').addEventListener('click', closeStaffModal);

document.getElementById('staff-save-btn').addEventListener('click', async () => {
  const name = document.getElementById('staff-name').value.trim();
  const role = document.getElementById('staff-role').value;
  const pin = document.getElementById('staff-pin').value.trim();

  if (!name) { showToast('Name is required', 'error'); return; }
  if (!/^\d{4}$/.test(pin)) { showToast('PIN must be exactly 4 digits', 'error'); return; }

  try {
    await apiRequest('/admin/staff', { method: 'POST', body: { name, role, pin } });
    showToast(`${name} added as ${role}`);
    closeStaffModal();
    await loadStaff();
  } catch (err) {
    showToast(err.message || 'Could not save staff member', 'error');
  }
});

document.getElementById('logout-link').addEventListener('click', (e) => { e.preventDefault(); logout(); });

(async function init() {
  const session = await requireSession();
  if (!session) return;
  if (session.role !== 'admin') { window.location.href = 'pos.html'; return; }
  document.getElementById('admin-name').textContent = session.name;

  await loadStaff();

  const branding = await loadPharmacyBranding();
  applyBrandingToSidebar(branding);
})();