/**
 * Wayle Service Worker
 * - Pre-caches all static assets on install
 * - Cache-first for JS/CSS/fonts/images
 * - Network-first for API calls
 * - Skips large model binary files (cached separately by ONNX runtime)
 */

const CACHE = 'wayle-v2';
const ASSETS_CACHE = 'wayle-assets-v2';
const BABEL_CACHE = 'wayle-babel-v1'; // Compiled Babel output

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/app.jsx',
  '/manifest.json',
  '/inference.worker.js',
  // React + Babel
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.2/babel.min.js',
  // ONNX Runtime Web
  'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/ort.min.js',
  'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/ort-wasm-simd-threaded.wasm',
  'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/ort-wasm-simd.wasm',
  // Fonts (logo cached separately via fetch)
  'https://i.ibb.co/xSFJxP7F/wayle-dark.png',
];

// Domains to always cache (static assets)
const CACHE_DOMAINS = [
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'i.ibb.co',
];

// Never cache (model weights, API calls)
const SKIP_PATHS = [
  '/v1/messages',
  '.bin',
  '.onnx',        // large model files — let ONNX runtime manage
  '.ort',
  'huggingface.co',
  'hf.co',
];

function shouldSkip(url) {
  return SKIP_PATHS.some(p => url.includes(p));
}

function isCacheable(url) {
  try {
    const u = new URL(url);
    return CACHE_DOMAINS.some(d => u.hostname.includes(d)) ||
           u.hostname === self.location.hostname;
  } catch { return false; }
}

// ─── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.allSettled(PRECACHE_URLS.map(url =>
        cache.add(url).catch(err => console.warn('[SW] Precache miss:', url, err.message))
      ))
    ).then(() => self.skipWaiting())
  );
});

// ─── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE && k !== ASSETS_CACHE && k !== BABEL_CACHE)
          .map(k => { console.log('[SW] Purging old cache:', k); return caches.delete(k); })
      )
    ).then(() => self.clients.claim())
  );
});

// ─── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const { request } = e;
  const url = request.url;

  // Only handle GET
  if (request.method !== 'GET') return;

  // Skip model weights and API
  if (shouldSkip(url)) return;

  // Cache-first strategy for cacheable assets
  if (isCacheable(url) || url.includes(self.location.origin)) {
    e.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;

        return fetch(request).then(res => {
          if (!res.ok) return res;

          // Cache the response
          const clone = res.clone();
          const cacheName = url.includes('babel') ? BABEL_CACHE : CACHE;
          caches.open(cacheName).then(c => c.put(request, clone)).catch(() => {});
          return res;
        }).catch(() => {
          // Offline fallback
          if (request.destination === 'document') {
            return caches.match('/index.html');
          }
        });
      })
    );
    return;
  }

  // Network-first for everything else (with cache fallback)
  e.respondWith(
    fetch(request).then(res => {
      if (res.ok && request.destination !== 'document') {
        const clone = res.clone();
        caches.open(ASSETS_CACHE).then(c => c.put(request, clone)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(request))
  );
});

// ─── Message handling ─────────────────────────────────────────────────────────
self.addEventListener('message', ({ data }) => {
  if (data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (data?.type === 'CLEAR_CACHE') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
});
