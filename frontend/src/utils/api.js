import axios from 'axios';

const resolveApiUrl = () => {
  // Force local requests to this project's backend to avoid collisions with other local APIs.
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'http://127.0.0.1:5050/api';
  }
  if (process.env.REACT_APP_API_URL) return process.env.REACT_APP_API_URL.replace(/\/+$/, '');
  return '/api';
};

const API_URL = resolveApiUrl();
const DEFAULT_TIMEOUT_MS = Number(process.env.REACT_APP_API_TIMEOUT_MS || 8000);
const shouldDebugAuth = () => (
  process.env.REACT_APP_AUTH_DEBUG === 'true' ||
  (typeof window !== 'undefined' && window.localStorage?.getItem('debug_auth') === '1')
);

// Warn in production when REACT_APP_API_URL is not set and API_URL will point to
// same-origin `/api`. This often causes 405/HTML responses when the static host
// serves the request instead of the backend API.
if (typeof window !== 'undefined') {
  if (API_URL === '/api' && window.location && !['localhost', '127.0.0.1'].includes(window.location.hostname) && !process.env.REACT_APP_API_URL) {
    console.warn('[API] REACT_APP_API_URL is not set; frontend will call /api on the frontend host. In production set REACT_APP_API_URL to your backend API base URL (for example https://api.example.com/api) to avoid 405/HTML responses.');
  }
}

const api = axios.create({
  baseURL: API_URL,
  timeout: DEFAULT_TIMEOUT_MS,
  timeoutErrorMessage: 'API request timed out',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle response errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Detect cases where the response is HTML (served by static frontend) or
    // a 405 from the host — these typically indicate that the request was
    // handled by the static/frontend host instead of the backend API.
    if (error.response) {
      const ct = (error.response.headers || {})['content-type'] || '';
      const bodyIsHtml = typeof error.response.data === 'string' && (ct.includes('text/html') || error.response.data.trim().startsWith('<'));
      if (bodyIsHtml || error.response.status === 405) {
        console.error('[API] Possible misconfigured API endpoint: request appears to be served by the frontend host (HTML or 405).\n  - Current API_URL:', API_URL, '\n  - Request URL:', error?.config?.url, '\n  - Fix: set REACT_APP_API_URL to your backend (include /api) or configure host proxy/rewrite so /api routes to the backend.');
      }
    }
    if (error.response?.status === 401) {
      if (shouldDebugAuth()) {
        console.warn('[auth] 401 intercepted', {
          url: error?.config?.url,
          method: error?.config?.method,
          path: window.location?.pathname
        });
      }
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('auth:logout'));
      }
    }
    return Promise.reject(error);
  }
);

export default api;
