// Thin fetch wrapper. Centralizes base URL + auth header + error handling.
// Every online API call in the app should go through apiRequest().


const PRODUCTION_API_BASE_URL = 'https://pharmacy-backend-u6xl.onrender.com/api/v1';
const isLocalDev = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const API_BASE_URL = window.PHARMACY_API_BASE_URL || (isLocalDev ? 'http://localhost:4000/api/v1' : PRODUCTION_API_BASE_URL);
async function apiRequest(path, { method = 'GET', body, isFormData = false } = {}) {
  const session = await getSession();
  const headers = {};
  if (session && session.token) headers['Authorization'] = `Bearer ${session.token}`;
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
    // A 401 from the server (not from being offline) means the token is invalid/expired.
    // Force a fresh login rather than letting the app run in a broken half-authenticated state.
    if (response.status === 401 && session && !session.offline_login) {
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