// Admin > Audit Log page. Read-only, append-only log — no create/edit/delete
// actions on this page by design (matches audit_logs table intent).

let allLogs = [];

document.getElementById('brand-icon-fallback').innerHTML = SVG_ICONS.pill;
document.getElementById('nav-dashboard').innerHTML = `${SVG_ICONS.dashboard} Dashboard`;
document.getElementById('nav-inventory').innerHTML = `${SVG_ICONS.box} Inventory`;
document.getElementById('nav-reports').innerHTML = `${SVG_ICONS.fileText} Reports`;
document.getElementById('nav-suppliers').innerHTML = `${SVG_ICONS.truck} Suppliers`;
document.getElementById('nav-staff').innerHTML = `${SVG_ICONS.users} Staff`;
document.getElementById('nav-audit').innerHTML = `${SVG_ICONS.history} Audit Log`;
document.getElementById('nav-settings').innerHTML = `${SVG_ICONS.settings} Settings`;
document.getElementById('logout-link').innerHTML = `${SVG_ICONS.logout} Log Out`;

const searchWrap = document.querySelector('.admin-toolbar .search-input-wrap');
searchWrap.innerHTML = `${SVG_ICONS.search}<input id="audit-search-box" placeholder="Filter by user or action type…" />`;
const auditSearchBox = document.getElementById('audit-search-box');

// action_type strings are admin-defined constants from the backend
// (e.g. MEDICINE_CREATED, STAFF_CREATED) — safe to render directly, but we
// still use textContent throughout for consistency with the rest of the admin UI.
function actionBadgeClass(actionType) {
  if (actionType.includes('CREATED') || actionType.includes('IMPORT')) return 'badge-yellow';
  if (actionType.includes('UPDATED') || actionType.includes('SETTINGS')) return 'badge-red';
  return 'badge-yellow';
}

function buildLogRow(log) {
  const tr = document.createElement('tr');

  const timeTd = document.createElement('td');
  timeTd.textContent = new Date(log.timestamp).toLocaleString();
  timeTd.className = 'muted';

  const userTd = document.createElement('td');
  userTd.textContent = log.user_name || 'System';

  const actionTd = document.createElement('td');
  const badge = document.createElement('span');
  badge.className = 'badge ' + actionBadgeClass(log.action_type);
  badge.textContent = log.action_type;
  actionTd.appendChild(badge);

  const detailsTd = document.createElement('td');
  detailsTd.style.fontSize = '0.78rem';
  detailsTd.style.color = 'var(--text-muted)';
  detailsTd.style.maxWidth = '360px';
  detailsTd.style.overflowWrap = 'break-word';
  // details is JSONB — stringify for display, never innerHTML (it can
  // contain admin-entered strings like brand_name from MEDICINE_CREATED).
  detailsTd.textContent = log.details ? JSON.stringify(log.details) : '—';

  tr.append(timeTd, userTd, actionTd, detailsTd);
  return tr;
}

function renderAuditTable(list) {
  const tbody = document.getElementById('audit-tbody');
  tbody.innerHTML = '';
  if (list.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.className = 'muted';
    td.textContent = 'No audit events yet.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  for (const log of list) tbody.appendChild(buildLogRow(log));
}

async function loadAuditLogs() {
  try {
    allLogs = await apiRequest('/admin/audit-logs');
    renderAuditTable(allLogs);
  } catch (err) {
    showToast(err.message || 'Could not load audit logs', 'error');
  }
}

auditSearchBox.addEventListener('input', () => {
  const q = auditSearchBox.value.trim().toLowerCase();
  if (!q) { renderAuditTable(allLogs); return; }
  renderAuditTable(allLogs.filter((l) =>
    (l.action_type || '').toLowerCase().includes(q) ||
    (l.user_name || '').toLowerCase().includes(q)
  ));
});

document.getElementById('logout-link').addEventListener('click', (e) => { e.preventDefault(); logout(); });

(async function init() {
  const session = await requireSession();
  if (!session) return;
  if (session.role !== 'admin') { window.location.href = 'pos.html'; return; }
  document.getElementById('admin-name').textContent = session.name;

  await loadAuditLogs();

  const branding = await loadPharmacyBranding();
  applyBrandingToSidebar(branding);
})();