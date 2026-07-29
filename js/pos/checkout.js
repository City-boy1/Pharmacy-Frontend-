// Checkout flow (spec Section 6 core principle: "Front Desk device never
// waits on network to complete a sale").
//
// 1. Always write the sale to the LOCAL database first, with is_synced = false.
// 2. Apply FEFO deduction locally so stock displayed to the cashier stays accurate.
// 3. Kick off an async sync attempt in the background — the UI does not wait for it.

async function completeCheckout({ payment_method, amount_tendered, mobile_money_provider, mobile_money_ref, shift_id }) {
  if (cart.length === 0) throw new Error('Cart is empty');

  const session = await getSession();
  const client_transaction_id = newClientTransactionId();
  const device_id = getDeviceId();

  // Apply local FEFO deduction for every cart line, building sale_items.
  const allLines = [];
  let anyOversold = false;
  for (const item of cart) {
    const { lines, oversold } = await localFefoDeduct(item.medicine_id, item.quantity);
    if (oversold) anyOversold = true;
    allLines.push(...lines);
  }

  const total_amount = allLines.reduce((sum, l) => sum + Number(l.subtotal), 0);
  const change_given = payment_method === 'cash' && amount_tendered != null
    ? Number(amount_tendered) - total_amount
    : null;

  const saleRecord = {
    client_transaction_id,
    device_id,
    shift_id: shift_id || null,
    cashier_id: session.user_id,
    payment_method,
    amount_tendered: amount_tendered || null,
    mobile_money_provider: mobile_money_provider || null,
    mobile_money_ref: mobile_money_ref || null,
    change_given,
    total_amount: total_amount.toFixed(2),
    is_synced: 0,
    oversell_flag: anyOversold ? 1 : 0,
    timestamp: new Date().toISOString(),
  };

  await db.transaction('rw', db.sales, db.sale_items, async () => {
    await db.sales.put(saleRecord);
    for (const line of allLines) {
      await db.sale_items.add({ client_transaction_id, ...line });
    }
  });

  clearCart();

  // Fire-and-forget sync attempt — UI already has its receipt, no waiting.
  runSyncCycle();

  return { ...saleRecord, lines: allLines };
}