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
