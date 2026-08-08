// Thin fetch wrapper. Centralizes base URL + auth header + error handling.
// Every online API call in the app should go through apiRequest().


const PRODUCTION_API_BASE_URL = 'https://pharmacy-backend-u6xl.onrender.com/api/v1';
const LOCAL_API_BASE_URL = 'http://localhost:4000/api/v1';

const isLocalDev = ['localhost', '127.0.0.1'].includes(window.location.hostname);

let API_BASE_URL = window.PHARMACY_API_BASE_URL || (isLocalDev ? LOCAL_API_BASE_URL : PRODUCTION_API_BASE_URL);

// On Live Server, check whether a local backend is actually running.
// If not reachable within 1.5s, silently fall back to the live Render backend.
const apiBaseUrlReady = (async () => {
  if (isLocalDev && !window.PHARMACY_API_BASE_URL) {
    try {
      const res = await fetch('http://localhost:4000/health', {
        cache: 'no-store',
        signal: AbortSignal.timeout(1500),
      });
      if (!res.ok) throw new Error('local backend not healthy');
    } catch {
      API_BASE_URL = PRODUCTION_API_BASE_URL;
    }
  }
})();
async function apiRequest(path, { method = 'GET', body, isFormData = false, tokenOverride } = {}) {
  await apiBaseUrlReady;
  const session = await getSession();
  const token = tokenOverride || (session && session.token);
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!isFormData) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
  });

  let data;
  const contentType = response.headers.get('content-type') || '';
  data = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    const message = (data && data.error) || `Request failed (${response.status})`;
    const err = new Error(message);
    err.status = response.status;
    // A 401 means the token used for THIS request is invalid/expired. Only force
    // a logout when it was the device's own active session token that failed —
    // a background sync using an older queued sale's own token snapshot must
    // never log out whoever is actually using the device right now.
    if (response.status === 401 && !tokenOverride && session && !session.offline_login) {
      await clearSession();
      window.location.href = 'login.html';
    }
    throw err;
  }
  return data;
}

// Simple connectivity check. navigator.onLine is a hint, not a guarantee, so
// we also verify with a lightweight ping before trusting "online" for sync.
async function isServerReachable() {
  await apiBaseUrlReady;
  if (!navigator.onLine) return false;
  try {
    const res = await fetch(`${API_BASE_URL.replace('/api/v1', '')}/health`, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}