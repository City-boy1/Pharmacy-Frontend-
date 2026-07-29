// In-memory cart for the active sale. Batch-level FEFO deduction happens
// only at checkout time (see checkout.js) — the cart itself just tracks
// medicine_id + quantity + a display price.

let cart = []; // [{ medicine_id, brand_name, quantity, unit_price }]

function addToCart(item) {
  const existing = cart.find((c) => c.medicine_id === item.medicine_id);
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({
      medicine_id: item.medicine_id,
      brand_name: item.brand_name,
      unit_price: item.unit_price || 0,
      quantity: 1,
    });
  }
  renderCart();
}

function updateCartQuantity(medicine_id, quantity) {
  const item = cart.find((c) => c.medicine_id === medicine_id);
  if (!item) return;
  if (quantity <= 0) {
    cart = cart.filter((c) => c.medicine_id !== medicine_id);
  } else {
    item.quantity = quantity;
  }
  renderCart();
}

function clearCart() {
  cart = [];
  renderCart();
}

function cartTotal() {
  return cart.reduce((sum, c) => sum + c.quantity * Number(c.unit_price || 0), 0);
}

function renderCart() {
  const container = document.getElementById('cart-items');
  container.innerHTML = '';

  if (cart.length === 0) {
    container.innerHTML = '<p class="muted">Cart is empty. Search and tap a product to add it.</p>';
  }

  for (const item of cart) {
    const row = document.createElement('div');
    row.className = 'cart-item';
    row.innerHTML = `
      <div>
        <strong>${item.brand_name}</strong>
        <div class="muted" style="font-size:0.8rem;">₵ ${formatCurrency(item.unit_price)} each</div>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <button class="btn-secondary" data-action="dec">−</button>
        <span>${item.quantity}</span>
        <button class="btn-secondary" data-action="inc">+</button>
        <button class="btn-danger" data-action="remove">✕</button>
      </div>
    `;
    row.querySelector('[data-action="inc"]').addEventListener('click', () =>
      updateCartQuantity(item.medicine_id, item.quantity + 1)
    );
    row.querySelector('[data-action="dec"]').addEventListener('click', () =>
      updateCartQuantity(item.medicine_id, item.quantity - 1)
    );
    row.querySelector('[data-action="remove"]').addEventListener('click', () =>
      updateCartQuantity(item.medicine_id, 0)
    );
    container.appendChild(row);
  }

  document.getElementById('cart-total').textContent = '₵ ' + formatCurrency(cartTotal());
}

// ---------------- Held orders (parked carts) ----------------
// Stored in the meta table as a simple array, keyed separately from sales.

async function holdCurrentOrder() {
  if (cart.length === 0) return;
  const held = (await getMeta('held_orders', [])) || [];
  held.push({ id: crypto.randomUUID(), cart: [...cart], held_at: new Date().toISOString() });
  await setMeta('held_orders', held);
  clearCart();
  showToast('Order held');
}

async function listHeldOrders() {
  return (await getMeta('held_orders', [])) || [];
}

async function recallHeldOrder(id) {
  const held = await listHeldOrders();
  const order = held.find((h) => h.id === id);
  if (!order) return;
  cart = [...order.cart];
  const remaining = held.filter((h) => h.id !== id);
  await setMeta('held_orders', remaining);
  renderCart();
}