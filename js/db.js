// Local offline database (IndexedDB via Dexie.js).
// Mirrors: Medicines, Batches, Sales (pending), Sale_Items (pending),
// Users (cached for offline PIN login) — per spec Section 5/6.

const db = new Dexie('PharmacyOfflineDB');

db.version(1).stores({
  medicines: 'medicine_id, brand_name, generic_name, barcode',
  batches: 'batch_id, medicine_id, expiry_date',
  users: 'user_id, role',
  sales: 'client_transaction_id, is_synced, timestamp, shift_id',
  sale_items: '++local_id, client_transaction_id',
  meta: 'key',
});

// v2: adds local shift tracking so an offline-started or offline-closed
// shift survives a page reload / app restart instead of only living in a
// single 'active_shift_id' meta string with nowhere to hold counted values.
db.version(2).stores({
  medicines: 'medicine_id, brand_name, generic_name, barcode',
  batches: 'batch_id, medicine_id, expiry_date',
  users: 'user_id, role',
  sales: 'client_transaction_id, is_synced, timestamp, shift_id',
  sale_items: '++local_id, client_transaction_id',
  meta: 'key',
  // shift_id: real server UUID once known, or 'local-shift-<uuid>' placeholder until synced.
  // start_synced / end_synced let the sync loop push each half independently,
  // since a shift can be started online and closed offline (or vice versa).
  shifts: '++local_id, shift_id, start_synced, end_synced',
});

// ---------------- Meta helpers ----------------

async function getMeta(key, fallback = null) {
  const row = await db.meta.get(key);
  return row ? row.value : fallback;
}

async function setMeta(key, value) {
  await db.meta.put({ key, value });
}

// ---------------- Session helpers ----------------

async function getSession() {
  return getMeta('session', null); // { token, user_id, name, role, pharmacy_id }
}

async function setSession(session) {
  await setMeta('session', session);
}

async function clearSession() {
  await db.meta.delete('session');
}

// ---------------- Catalog helpers ----------------

async function replaceCatalog({ medicines, batches, users }) {
  await db.transaction('rw', db.medicines, db.batches, db.users, async () => {
    if (medicines) {
      for (const m of medicines) await db.medicines.put(m);
    }
    if (batches) {
      for (const b of batches) await db.batches.put(b);
    }
    if (users) {
      for (const u of users) await db.users.put(u);
    }
  });
}

async function applyStockSnapshot(stockSnapshot) {
  await db.transaction('rw', db.batches, async () => {
    for (const s of stockSnapshot) {
      await db.batches.update(s.batch_id, { quantity_in_stock: s.quantity_in_stock });
    }
  });
}

// Search local catalog (used when offline). Mirrors server ILIKE search loosely.
// Search local catalog (used when offline). Mirrors server ILIKE search loosely.
async function searchLocalCatalog(q) {
  const query = q.trim().toLowerCase();
  if (!query) return [];
  const all = await db.medicines.toArray();
  const matches = all.filter(
    (m) =>
      m.active !== false && (
        (m.brand_name || '').toLowerCase().includes(query) ||
        (m.generic_name || '').toLowerCase().includes(query) ||
        m.barcode === q.trim()
      )
  );

  const results = [];
  for (const m of matches.slice(0, 30)) {
    const batches = await db.batches.where({ medicine_id: m.medicine_id }).toArray();
    const inStock = batches.filter((b) => b.quantity_in_stock > 0);
    const total_stock = inStock.reduce((sum, b) => sum + b.quantity_in_stock, 0);
    const unit_price = inStock.length ? Math.min(...inStock.map((b) => Number(b.unit_price))) : null;
    results.push({ ...m, total_stock, unit_price });
  }
  return results;
}

// ---------------- Local shift helpers ----------------

// Called when starting a shift, online or offline. Always writes a local
// row first so counted-cash/card/momo values always have somewhere to live,
// even if the device never reconnects before the next app restart.
async function startLocalShift({ shift_id, cashier_id, opening_cash, opened_at, start_synced }) {
  const local_id = await db.shifts.add({
    shift_id,
    cashier_id,
    opening_cash,
    opened_at,
    closed_at: null,
    counted_cash: null,
    counted_card: null,
    counted_mobile_money: null,
    start_synced: start_synced ? 1 : 0,
    end_synced: 0, // not yet closed
  });
  await setMeta('active_shift_id', shift_id);
  await setMeta('active_shift_opened_at', opened_at);
  return local_id;
}

// Called when closing a shift. Always writes counted values locally first —
// this is the fix for the bug where offline-closed shifts silently discarded
// the cashier's counted amounts.
async function closeLocalShiftValues(shift_id, { counted_cash, counted_card, counted_mobile_money }) {
  const row = await db.shifts.where('shift_id').equals(shift_id).first();
  if (!row) {
    // Defensive: shouldn't happen since startLocalShift always creates a row,
    // but don't lose the cashier's counted values if it somehow does.
    await db.shifts.add({
      shift_id, cashier_id: null, opening_cash: null, opened_at: null,
      closed_at: new Date().toISOString(),
      counted_cash, counted_card, counted_mobile_money,
      start_synced: 1, end_synced: 0,
    });
    return;
  }
  await db.shifts.update(row.local_id, {
    closed_at: new Date().toISOString(),
    counted_cash, counted_card, counted_mobile_money,
    end_synced: 0,
  });
}

async function markShiftEndSynced(shift_id, resultSummary) {
  const row = await db.shifts.where('shift_id').equals(shift_id).first();
  if (row) await db.shifts.update(row.local_id, { end_synced: 1, server_result: resultSummary });
}

// Re-point every local sale (and the local shift row itself) from a
// placeholder ID to the real server-issued shift_id, once the shift's
// /shifts/start push succeeds. Without this, sales sync fine individually
// but stay permanently orphaned from their real shift on the server.
async function reassignShiftId(oldShiftId, newShiftId) {
  await db.transaction('rw', db.sales, db.shifts, async () => {
    const salesToFix = await db.sales.where('shift_id').equals(oldShiftId).toArray();
    for (const s of salesToFix) {
      await db.sales.update(s.client_transaction_id, { shift_id: newShiftId });
    }
    const shiftRow = await db.shifts.where('shift_id').equals(oldShiftId).first();
    if (shiftRow) await db.shifts.update(shiftRow.local_id, { shift_id: newShiftId, start_synced: 1 });
  });
  const active = await getMeta('active_shift_id', null);
  if (active === oldShiftId) await setMeta('active_shift_id', newShiftId);
}

// Push any shift whose start and/or end hasn't reached the server yet.
// Two independent flags because a shift can be started online (real
// shift_id) and later closed offline, or started+closed entirely offline.
async function pushPendingShifts() {
  const pendingStarts = await db.shifts.where('start_synced').equals(0).toArray();

  for (const row of pendingStarts) {
    try {
      const result = await apiRequest('/shifts/start', {
        method: 'POST',
        body: { opening_cash: row.opening_cash },
      });
      // Backend note: /shifts/start currently sets opened_at = now() server-side.
      // For a shift that actually opened hours/days ago offline, this means the
      // server's opened_at won't match reality. If accurate backdating matters,
      // authController.startShift needs to accept an optional opened_at override.
      await reassignShiftId(row.shift_id, result.shift_id);
    } catch (err) {
      console.warn('Sync: failed to push shift start', row.shift_id, err.message);
      continue; // don't attempt the end-push below with a still-local shift_id
    }
  }

  // Re-read: shift_ids may have just been rewritten above.
  const pendingEnds = (await db.shifts.toArray()).filter(
    (r) => r.closed_at && !r.end_synced && !String(r.shift_id).startsWith('local-shift-')
  );

  for (const row of pendingEnds) {
    try {
      const result = await apiRequest('/shifts/end', {
        method: 'POST',
        body: {
          shift_id: row.shift_id,
          counted_cash: row.counted_cash,
          counted_card: row.counted_card,
          counted_mobile_money: row.counted_mobile_money,
        },
      });
      await markShiftEndSynced(row.shift_id, result);
    } catch (err) {
      console.warn('Sync: failed to push shift end', row.shift_id, err.message);
    }
  }
}

async function runSyncCycle() {
  if (syncInProgress) return;
  syncInProgress = true;
  try {
    const reachable = await isServerReachable();
    if (reachable) {
      await pushPendingShifts(); // before sales, so sales get the real shift_id if possible
      await pushPendingSales();
      await pullCatalog();
    }
  } catch (err) {
    console.warn('Sync cycle error:', err.message);
  } finally {
    syncInProgress = false;
    await notifyListeners();
  }
}