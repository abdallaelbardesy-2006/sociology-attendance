const CACHE_NAME = 'soc-attendance-v9-secure';
const STATIC_ASSETS = ['/', '/admin', '/dashboard', '/css/app.css', '/js/common.js', '/js/login.js', '/js/dashboard.js', '/js/register.js', '/manifest.json', '/icons/icon-192.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(STATIC_ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // نتعامل فقط مع ملفات نفس الموقع (GET) ولا نخزن الـ API أبداً
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Network-first: أحدث نسخة دائماً، والكاش للعمل عند انقطاع الإنترنت فقط
  event.respondWith(
    fetch(event.request)
      .then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
