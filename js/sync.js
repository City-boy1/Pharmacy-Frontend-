// Offline sync engine (spec Section 6).
// - Sales are always written locally FIRST; the UI never waits on network.
// - A background loop pushes unsynced sales and pulls catalog/stock updates
//   whenever the server is reachable.

const SYNC_INTERVAL_MS = 15000; // "every X seconds when online"
let syncTimer = null;
let syncInProgress = false;
const listeners = new Set();

function onSyncStatusChange(fn) {
  listeners.add(fn);
}

async function currentSyncStatus() {
  const pendingCount = await db.sales.where('is_synced').equals(0).count();
  const online = await isServerReachable();
  return { online, pendingCount };
}

async function notifyListeners() {
  const status = await currentSyncStatus();
  listeners.forEach((fn) => fn(status));
}

// Pull full (or incremental) catalog from server and refresh local cache.
// A device offline for weeks could otherwise drift (e.g. a medicine edited
// twice, or a rare edge case in the incremental diff) — so once every 24h we
// force a FULL pull regardless of "since", as a self-healing safety net.
async function pullCatalog() {
  const lastSync = await getMeta('last_catalog_sync', null);
  const lastFullSync = await getMeta('last_full_catalog_sync', null);
  const dueForFullSync = !lastFullSync || (Date.now() - new Date(lastFullSync).getTime()) > 24 * 60 * 60 * 1000;

  const query = (lastSync && !dueForFullSync) ? `?since=${encodeURIComponent(lastSync)}` : '';
  const data = await apiRequest(`/pos/catalog/sync${query}`);

  await replaceCatalog({ medicines: data.medicines, batches: data.batches, users: data.users });
  await applyStockSnapshot(data.stock_snapshot || []);
  await setMeta('last_catalog_sync', data.server_time);
  if (dueForFullSync) await setMeta('last_full_catalog_sync', data.server_time);
}

// Push all locally pending sales, one at a time, idempotently.
async function pushPendingSales() {
  const pending = await db.sales.where('is_synced').equals(0).toArray();

  for (const sale of pending) {
    try {
      const items = await db.sale_items.where('client_transaction_id').equals(sale.client_transaction_id).toArray();
      const cart = items.map((i) => ({ medicine_id: i.medicine_id, quantity: i.quantity }));

      const result = await apiRequest('/sales/checkout', {
        method: 'POST',
        body: {
          client_transaction_id: sale.client_transaction_id,
          device_id: sale.device_id,
          shift_id: sale.shift_id,
          payment_method: sale.payment_method,
          amount_tendered: sale.amount_tendered,
          mobile_money_provider: sale.mobile_money_provider,
          mobile_money_ref: sale.mobile_money_ref,
          cart,
        },
      });

      await db.sales.update(sale.client_transaction_id, {
        is_synced: 1,
        server_sale_id: result.sale_id,
        oversell_flag: !!result.oversell_flag,
      });
    } catch (err) {
      // Leave it pending; will retry next cycle. Log for visibility.
      console.warn('Sync: failed to push sale', sale.client_transaction_id, err.message);
    }
  }
}

async function runSyncCycle() {
  if (syncInProgress) return;
  syncInProgress = true;
  try {
    const reachable = await isServerReachable();
    if (reachable) {
      await pushPendingShifts();
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

function startSyncLoop() {
  if (syncTimer) return;
  requestPersistentStorage(); // protects locally-queued sales during long offline stretches
  runSyncCycle(); // fire immediately, then on interval
  syncTimer = setInterval(runSyncCycle, SYNC_INTERVAL_MS);
  window.addEventListener('online', runSyncCycle);
}

function stopSyncLoop() {
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = null;
}