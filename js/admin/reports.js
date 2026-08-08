// Admin > Reports page. Date-range + cashier filter, summary stat cards, sales table.
// Mirrors salesReport() response shape: { summary: {...}, sales: [...] }.
// Note: summary from the backend only totals cash_revenue and card_revenue —
// mobile_money_revenue is NOT in the SQL FILTER clause yet (adminController.js
// salesReport), even though mobile_money is a valid payment_method. I compute
// it client-side from the sales rows below as a stopgap; see the flag at the
// end of this response for the proper backend fix.

document.getElementById('brand-icon-fallback').innerHTML = SVG_ICONS.pill;
document.getElementById('nav-dashboard').innerHTML = `${SVG_ICONS.dashboard} Dashboard`;
document.getElementById('nav-inventory').innerHTML = `${SVG_ICONS.box} Inventory`;
document.getElementById('nav-reports').innerHTML = `${SVG_ICONS.fileText} Reports`;
document.getElementById('nav-suppliers').innerHTML = `${SVG_ICONS.truck} Suppliers`;
document.getElementById('nav-staff').innerHTML = `${SVG_ICONS.users} Staff`;
document.getElementById('nav-audit').innerHTML = `${SVG_ICONS.history} Audit Log`;
document.getElementById('nav-settings').innerHTML = `${SVG_ICONS.settings} Settings`;
document.getElementById('logout-link').innerHTML = `${SVG_ICONS.logout} Log Out`;
document.getElementById('apply-filter-btn').innerHTML = `${SVG_ICONS.search} Apply`;

initActiveNavScroll();

const PAYMENT_ICON = { cash: SVG_ICONS.cash, card: SVG_ICONS.card, mobile_money: SVG_ICONS.mobile };
const PAYMENT_LABEL = { cash: 'Cash', card: 'Card', mobile_money: 'Mobile Money' };

function formatCurrency(n) {
  return Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderStatGrid(summary, sales) {
  const mobileMoneyRevenue = sales
    .filter((s) => s.payment_method === 'mobile_money')
    .reduce((sum, s) => sum + Number(s.total_amount), 0);

  const stats = [
    { label: 'Total Sales', value: summary.total_sales, icon: SVG_ICONS.receipt },
    { label: 'Total Revenue', value: `₵ ${formatCurrency(summary.total_revenue)}`, icon: SVG_ICONS.check },
    { label: 'Cash', value: `₵ ${formatCurrency(summary.cash_revenue)}`, icon: SVG_ICONS.cash },
    { label: 'Card', value: `₵ ${formatCurrency(summary.card_revenue)}`, icon: SVG_ICONS.card },
    { label: 'Mobile Money', value: `₵ ${formatCurrency(mobileMoneyRevenue)}`, icon: SVG_ICONS.mobile },
  ];
  const grid = document.getElementById('report-stat-grid');
  grid.innerHTML = '';
  for (const s of stats) {
    const card = document.createElement('div');
    card.className = 'card admin-stat-card';
    const iconEl = document.createElement('div');
    iconEl.className = 'admin-stat-icon';
    iconEl.innerHTML = s.icon;
    const valueEl = document.createElement('div');
    valueEl.className = 'admin-stat-value';
    valueEl.textContent = s.value;
    const labelEl = document.createElement('div');
    labelEl.className = 'admin-stat-label';
    labelEl.textContent = s.label;
    card.append(iconEl, valueEl, labelEl);
    grid.appendChild(card);
  }
}

function buildSaleRow(sale) {
  const tr = document.createElement('tr');

  const dateTd = document.createElement('td');
  dateTd.textContent = new Date(sale.timestamp).toLocaleString();

  const refTd = document.createElement('td');
  refTd.className = 'muted';
  refTd.textContent = sale.transaction_ref;

  const cashierTd = document.createElement('td');
  cashierTd.textContent = sale.cashier_name;

  const paymentTd = document.createElement('td');
  paymentTd.innerHTML = PAYMENT_ICON[sale.payment_method] || '';
  const paymentLabel = document.createElement('span');
  paymentLabel.style.marginLeft = '6px';
  paymentLabel.textContent = PAYMENT_LABEL[sale.payment_method] || sale.payment_method;
  paymentTd.appendChild(paymentLabel);

  const totalTd = document.createElement('td');
  totalTd.style.fontWeight = '600';
  totalTd.textContent = `₵ ${formatCurrency(sale.total_amount)}`;

  const flagTd = document.createElement('td');
  if (sale.oversell_flag) {
    const tag = document.createElement('span');
    tag.className = 'oversell-tag';
    tag.textContent = 'Oversell';
    flagTd.appendChild(tag);
  }

  tr.append(dateTd, refTd, cashierTd, paymentTd, totalTd, flagTd);
  return tr;
}

function renderSalesTable(sales) {
  const tbody = document.getElementById('report-tbody');
  tbody.innerHTML = '';
  if (sales.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.className = 'muted';
    td.textContent = 'No sales in this range.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  for (const sale of sales) tbody.appendChild(buildSaleRow(sale));
}

let activeTab = 'sales';

function switchTab(tab) {
  activeTab = tab;
  document.getElementById('tab-sales').classList.toggle('active', tab === 'sales');
  document.getElementById('tab-shifts').classList.toggle('active', tab === 'shifts');
  document.getElementById('page-title').textContent = tab === 'sales' ? 'Sales Reports' : 'Shift Reconciliation';
  document.getElementById('flagged-field').style.display = tab === 'shifts' ? 'block' : 'none';
  document.getElementById('report-stat-grid').style.display = tab === 'sales' ? 'grid' : 'none';
  setTableHeaders(tab);
  loadCurrentTab();
}

function setTableHeaders(tab) {
  document.getElementById('report-thead').innerHTML = tab === 'sales'
    ? '<tr><th>Date/Time</th><th>Ref</th><th>Cashier</th><th>Payment</th><th>Total</th><th></th></tr>'
    : '<tr><th>Cashier</th><th>Opened</th><th>Closed</th><th>Cash</th><th>Card</th><th>Mobile Money</th><th>Status</th></tr>';
}

function loadCurrentTab() {
  return activeTab === 'sales' ? loadReport() : loadShifts();
}

function methodCell(counted, variance) {
  if (counted == null) return '<span class="muted">— not counted</span>';
  const v = Number(variance);
  const cls = v === 0 ? 'muted' : (v < 0 ? 'badge badge-red' : 'badge badge-yellow');
  return `₵${formatCurrency(counted)} <span class="${cls}">${v > 0 ? '+' : ''}${formatCurrency(v)}</span>`;
}

function statusBadge(shift) {
  if (shift.forced_closed_by) {
    return `<span class="badge badge-red">Force-closed by ${shift.forced_closed_by_name || '—'}</span>`;
  }
  const hasVariance = [shift.variance_cash, shift.variance_card, shift.variance_mobile_money]
    .some((v) => v != null && Number(v) !== 0);
  return hasVariance ? '<span class="badge badge-yellow">Variance</span>' : '<span class="muted">Clean</span>';
}

function buildShiftRow(shift) {
  const tr = document.createElement('tr');
  const cells = [
    shift.cashier_name,
    new Date(shift.opened_at).toLocaleString(),
    shift.closed_at ? new Date(shift.closed_at).toLocaleString() : '—',
  ];
  for (const c of cells) {
    const td = document.createElement('td');
    td.textContent = c;
    tr.appendChild(td);
  }
  const cashTd = document.createElement('td'); cashTd.innerHTML = methodCell(shift.counted_cash, shift.variance_cash);
  const cardTd = document.createElement('td'); cardTd.innerHTML = methodCell(shift.counted_card, shift.variance_card);
  const momoTd = document.createElement('td'); momoTd.innerHTML = methodCell(shift.counted_mobile_money, shift.variance_mobile_money);
  const statusTd = document.createElement('td');
  statusTd.innerHTML = statusBadge(shift);
  if (shift.forced_closed_reason) {
    const reasonEl = document.createElement('div');
    reasonEl.className = 'muted';
    reasonEl.style.fontSize = '0.75rem';
    reasonEl.textContent = shift.forced_closed_reason;
    statusTd.appendChild(reasonEl);
  }
  tr.append(cashTd, cardTd, momoTd, statusTd);
  return tr;
}

function renderShiftsTable(shifts) {
  const tbody = document.getElementById('report-tbody');
  tbody.innerHTML = '';
  if (shifts.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 7;
    td.className = 'muted';
    td.textContent = 'No shifts in this range.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  for (const s of shifts) tbody.appendChild(buildShiftRow(s));
}

async function loadShifts() {
  const from = document.getElementById('filter-from').value;
  const to = document.getElementById('filter-to').value;
  const cashier_id = document.getElementById('filter-cashier').value;
  const flagged = document.getElementById('filter-flagged').checked;

  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (cashier_id) params.set('cashier_id', cashier_id);
  if (flagged) params.set('flagged', 'true');

  try {
    const shifts = await apiRequest(`/admin/shifts${params.toString() ? '?' + params.toString() : ''}`);
    renderShiftsTable(shifts);
  } catch (err) {
    showToast(err.message || 'Could not load shifts', 'error');
  }
}

async function loadCashiers() {
  try {
    const staff = await apiRequest('/admin/staff');
    const select = document.getElementById('filter-cashier');
    for (const u of staff) {
      const opt = document.createElement('option');
      opt.value = u.user_id;
      opt.textContent = u.name;
      select.appendChild(opt);
    }
  } catch (err) {
    // Non-fatal — filter still works without the cashier dropdown populated.
    console.error(err);
  }
}

async function loadReport() {
  const from = document.getElementById('filter-from').value;
  const to = document.getElementById('filter-to').value;
  const cashier_id = document.getElementById('filter-cashier').value;

  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (cashier_id) params.set('cashier_id', cashier_id);

  try {
    const result = await apiRequest(`/admin/reports/sales${params.toString() ? '?' + params.toString() : ''}`);
    renderStatGrid(result.summary, result.sales);
    renderSalesTable(result.sales);
  } catch (err) {
    showToast(err.message || 'Could not load report', 'error');
  }
}

document.getElementById('apply-filter-btn').addEventListener('click', loadCurrentTab);

document.getElementById('tab-sales').addEventListener('click', () => switchTab('sales'));
document.getElementById('tab-shifts').addEventListener('click', () => switchTab('shifts'));
document.getElementById('logout-link').addEventListener('click', (e) => { e.preventDefault(); logout(); });

(async function init() {
  const session = await requireSession();
  if (!session) return;
  if (session.role !== 'admin') { window.location.href = 'pos.html'; return; }
  document.getElementById('admin-name').textContent = session.name;

  await loadCashiers();
  await loadCurrentTab();

  const branding = await loadPharmacyBranding();
  applyBrandingToSidebar(branding);
})();