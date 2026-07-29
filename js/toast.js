function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position:fixed;top:16px;right:16px;z-index:200;display:flex;flex-direction:column;gap:8px;';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `card toast-${type}`;
  toast.style.cssText = 'max-width:320px;padding:var(--sp-3) var(--sp-4);box-shadow:var(--shadow-md);';
  const colors = {
    info: 'var(--green-dark)',
    success: 'var(--green-primary)',
    warning: 'var(--alert-yellow)',
    danger: 'var(--alert-red)'
  };
  toast.style.borderLeft = `4px solid ${colors[type] || colors.info}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity 0.2s ease';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 200);
  }, 3500);
}
window.showToast = showToast;