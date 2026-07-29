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
  const tbody = document.getElementById('sales-tbody');
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

document.getElementById('apply-filter-btn').addEventListener('click', loadReport);
document.getElementById('logout-link').addEventListener('click', (e) => { e.preventDefault(); logout(); });

(async function init() {
  const session = await requireSession();
  if (!session) return;
  if (session.role !== 'admin') { window.location.href = 'pos.html'; return; }
  document.getElementById('admin-name').textContent = session.name;

  await loadCashiers();
  await loadReport();

  const branding = await loadPharmacyBranding();
  applyBrandingToSidebar(branding);
})();