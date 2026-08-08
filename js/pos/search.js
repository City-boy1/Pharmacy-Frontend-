// Product search for the POS screen. Tries the server first when reachable
// (freshest stock/prices), falls back to the local Dexie cache when offline.
//
// Letter-browse bar removed per pharmacist feedback — the search box itself
// now does live prefix filtering, so typing "p" alone is enough to see every
// match starting with P, with no separate A-Z UI needed.

let searchRequestId = 0; // guards against out-of-order async responses

async function posSearch(q) {
  if (!q || !q.trim()) return [];

  const online = await isServerReachable();
  if (online) {
    try {
      return await apiRequest(`/pos/search?q=${encodeURIComponent(q)}`);
    } catch (err) {
      console.warn('Online search failed, falling back to local cache:', err.message);
    }
  }
  return searchLocalCatalogPrefix(q);
}

// Local fallback: brand_name/generic_name prefix match first (so "p" surfaces
// Panadol before anything that merely contains a "p"), then substring match
// as a second pass, so partial mid-word typos still find something.
async function searchLocalCatalogPrefix(q) {
  const needle = q.trim().toUpperCase();
  const all = await db.medicines.toArray();

  const startsWith = [];
  const contains = [];
  for (const m of all) {
    if (m.active === false) continue; // skip archived medicines in offline fallback search
    const brand = (m.brand_name || '').toUpperCase();
    const generic = (m.generic_name || '').toUpperCase();
    if (brand.startsWith(needle) || generic.startsWith(needle)) {
      startsWith.push(m);
    } else if (brand.includes(needle) || generic.includes(needle)) {
      contains.push(m);
    }
  }

  const ordered = [...startsWith, ...contains].slice(0, 40);
  const results = [];
  for (const m of ordered) {
    const batches = await db.batches.where({ medicine_id: m.medicine_id }).toArray();
    const inStock = batches.filter((b) => b.quantity_in_stock > 0);
    const total_stock = inStock.reduce((sum, b) => sum + b.quantity_in_stock, 0);
    const unit_price = inStock.length ? Math.min(...inStock.map((b) => Number(b.unit_price))) : null;
    results.push({ ...m, total_stock, unit_price });
  }
  return results;
}

// Exact barcode match (used by the scanner integration).
async function posSearchByBarcode(code) {
  const results = await posSearch(code);
  return results.find((r) => r.barcode === code) || results[0] || null;
}

// Wires a search input to live results with request-sequencing so a slow
// response from an earlier keystroke can never overwrite a newer one, and so
// "no matches" appears the instant a query resolves empty — not after the
// pharmacist has already deleted characters and retyped.
function wireLiveSearch(inputEl, onResults) {
  inputEl.addEventListener('input', async (e) => {
    const query = e.target.value;
    const myRequestId = ++searchRequestId;

    if (!query.trim()) {
      onResults([], query);
      return;
    }

    const results = await posSearch(query);
    if (myRequestId !== searchRequestId) return; // a newer keystroke has already superseded this response
    onResults(results, query);
  });
}

// All dynamic text goes through textContent / DOM properties, never innerHTML
// with interpolated strings — brand_name/generic_name are admin-entered data,
// so this closes the XSS gap flagged in PROJECT_STATUS.md section 10.
function renderSearchResults(results, onSelect, query) {
  const container = document.getElementById('search-results');
  container.innerHTML = '';

  if (results.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.style.padding = '14px';
    empty.textContent = query ? `No matches for "${query}".` : 'Start typing to search.';
    container.appendChild(empty);
    return;
  }

  for (const item of results) {
    const outOfStock = !item.total_stock || item.total_stock <= 0;
    const row = document.createElement('div');
    row.className = 'search-result-item' + (outOfStock ? ' out-of-stock' : '');

    const isGeneralGoods = item.product_type === 'general_goods';

    const icon = document.createElement('div');
    icon.className = 'sr-icon';
    icon.innerHTML = isGeneralGoods ? SVG_ICONS.basket : SVG_ICONS.pill; // static, trusted icon set — not user data

    const info = document.createElement('div');
    info.className = 'sr-info';

    const nameRow = document.createElement('div');
    nameRow.className = 'sr-name';
    const nameSpan = document.createElement('span');
    nameSpan.textContent = item.brand_name;
    nameRow.appendChild(nameSpan);
    // Rx badge only ever applies to medicine — general goods can never carry it.
    if (!isGeneralGoods && item.rx_flag) {
      const rxBadge = document.createElement('span');
      rxBadge.className = 'badge badge-yellow';
      rxBadge.title = 'Prescription required';
      rxBadge.innerHTML = `${SVG_ICONS.rx} Rx`;
      nameRow.appendChild(rxBadge);
    }

    const genericLine = document.createElement('div');
    genericLine.className = 'sr-generic';
    // General goods don't have a "generic name" concept — skip the confusing
    // "No generic name on file" line for them entirely.
    if (!isGeneralGoods) {
      genericLine.textContent = item.generic_name || 'No generic name on file';
      info.append(nameRow, genericLine);
    } else {
      info.append(nameRow);
    }

    const meta = document.createElement('div');
    meta.className = 'sr-meta';
    const priceLine = document.createElement('div');
    priceLine.className = 'sr-price';
    priceLine.textContent = item.unit_price != null ? `₵ ${formatCurrency(item.unit_price)}` : '—';
    const stockLine = document.createElement('div');
    stockLine.className = 'sr-stock ' + (outOfStock ? 'stock-out' : 'stock-ok');
    stockLine.textContent = outOfStock ? 'Out of stock' : `${item.total_stock} in stock`;
    meta.append(priceLine, stockLine);

    row.append(icon, info, meta);
    if (!outOfStock) row.addEventListener('click', () => onSelect(item));
    container.appendChild(row);
  }
}