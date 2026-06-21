import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const APP_CACHE_VERSION = '2026-03-05-1';
const CACHE_VERSION_KEY = 'app_cache_version';
const CACHE_CLEAR_SESSION_KEY = 'app_cache_clear_in_progress';
const DEV_CACHE_CLEAR_SESSION_KEY = 'dev_cache_clear_in_progress';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const SHOULD_CLEAR_DEV_CACHE = process.env.REACT_APP_CLEAR_DEV_CACHE === 'true';

const clearAppCaches = async () => {
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((reg) => reg.unregister()));
  }
};

const readStorage = (storage, key) => {
  try {
    return storage?.getItem(key) || null;
  } catch {
    return null;
  }
};

const writeStorage = (storage, key, value) => {
  try {
    storage?.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

const removeStorage = (storage, key) => {
  try {
    storage?.removeItem(key);
  } catch {
    // noop
  }
};

const maybeHardClearCaches = async () => {
  // In development, clear any stale service worker/cache once per tab session.
  if (!IS_PRODUCTION) {
    if (!SHOULD_CLEAR_DEV_CACHE) return;
    const alreadyClearingInDev = readStorage(window.sessionStorage, DEV_CACHE_CLEAR_SESSION_KEY);
    if (alreadyClearingInDev) return;

    writeStorage(window.sessionStorage, DEV_CACHE_CLEAR_SESSION_KEY, '1');
    try {
      await clearAppCaches();
    } catch {
      // Best-effort cleanup in development.
    }
    return;
  }

  const storedVersion = readStorage(window.localStorage, CACHE_VERSION_KEY);
  const alreadyClearing = readStorage(window.sessionStorage, CACHE_CLEAR_SESSION_KEY);
  if (storedVersion === APP_CACHE_VERSION || alreadyClearing) {
    return;
  }

  writeStorage(window.sessionStorage, CACHE_CLEAR_SESSION_KEY, '1');
  writeStorage(window.localStorage, CACHE_VERSION_KEY, APP_CACHE_VERSION);

  try {
    await clearAppCaches();
  } catch {
    // Best-effort cleanup; app should continue even if cache APIs fail.
  } finally {
    removeStorage(window.sessionStorage, CACHE_CLEAR_SESSION_KEY);
  }
};

const scheduleBackgroundTask = (task) => {
  if (typeof window === 'undefined') return;
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(() => {
      void task();
    }, { timeout: 1500 });
    return;
  }
  window.setTimeout(() => {
    void task();
  }, 0);
};

const shouldEnableStrictMode = () => {
  if (IS_PRODUCTION || process.env.REACT_APP_STRICT_MODE === 'true') {
    return true;
  }
  return readStorage(window.localStorage, 'react_strict_mode') === '1';
};

const root = ReactDOM.createRoot(document.getElementById('root'));
const appTree = shouldEnableStrictMode()
  ? (
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
  : <App />;

root.render(appTree);

scheduleBackgroundTask(maybeHardClearCaches);

if (IS_PRODUCTION && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .catch((error) => console.error('Service worker registration failed:', error));
  });
}
