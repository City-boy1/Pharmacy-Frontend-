// Client-side FEFO logic — mirrors backend/src/utils/fefo.js exactly, so an
// offline sale computed on the device reconciles with what the server would
// have computed, per spec Section 7 ("same function, same rule, everywhere").

// Given a medicine_id and quantity, picks batches from the LOCAL cache,
// soonest expiry first, and returns the lines to record + updates local stock.
async function localFefoDeduct(medicine_id, quantity_needed) {
  const batches = await db.batches
    .where('medicine_id')
    .equals(medicine_id)
    .and((b) => b.quantity_in_stock > 0)
    .sortBy('expiry_date');

  const lines = [];
  let remaining = quantity_needed;

  for (const batch of batches) {
    if (remaining <= 0) break;
    const take = Math.min(batch.quantity_in_stock, remaining);
    if (take <= 0) continue;

    // Optimistically decrement local stock so the cashier's next search reflects it.
    await db.batches.update(batch.batch_id, { quantity_in_stock: batch.quantity_in_stock - take });

    lines.push({
      batch_id: batch.batch_id,
      medicine_id,
      quantity: take,
      unit_price: batch.unit_price,
      subtotal: (Number(batch.unit_price) * take).toFixed(2),
    });
    remaining -= take;
  }

  // Never block a paying customer: if local stock ran out, still record the
  // sale against the last known batch and flag it — server reconciles + audits on sync.
  const oversold = remaining > 0;
  if (oversold && batches.length > 0) {
    const lastBatch = batches[batches.length - 1];
    lines.push({
      batch_id: lastBatch.batch_id,
      medicine_id,
      quantity: remaining,
      unit_price: lastBatch.unit_price,
      subtotal: (Number(lastBatch.unit_price) * remaining).toFixed(2),
      oversold_portion: true,
    });
  }

  return { lines, oversold };
}