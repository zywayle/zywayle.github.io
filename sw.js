/**
 * Wayle Service Worker v3
 * Fixed: inference_worker.js filename, removed app.jsx (now inlined)
 */

const CACHE = 'wayle-v3';
const ASSETS_CACHE = 'wayle-assets-v3';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/inference_worker.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.2/babel.min.js',
  'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/ort.min.js',
];

const CACHE_DOMAINS = [
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'i.ibb.co',
];

const SKIP_PATTERNS = ['.onnx', '.bin', '.ort', 'huggingface.co', 'hf.co'];

function shouldSkip(url) { return SKIP_PATTERNS.some(p => url.includes(p)); }

function isCacheable(url) {
  try {
    const u = new URL(url);
    return CACHE_DOMAINS.some(d => u.hostname.includes(d)) || u.hostname === self.location.hostname;
  } catch { return false; }
}

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.allSettled(PRECACHE_URLS.map(url =>
        cache.add(url).catch(err => console.warn('[SW] Miss:', url, err.message))
      ))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== ASSETS_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return;
  if (shouldSkip(request.url)) return;

  if (isCacheable(request.url) || request.url.includes(self.location.origin)) {
    e.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(res => {
          if (!res.ok) return res;
          caches.open(CACHE).then(c => c.put(request, res.clone())).catch(() => {});
          return res;
        }).catch(() => {
          if (request.destination === 'document') return caches.match('/index.html');
        });
      })
    );
  }
});

self.addEventListener('message', ({ data }) => {
  if (data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (data?.type === 'CLEAR_CACHE') caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
});
