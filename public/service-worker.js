const CACHE = 'apk-site-shell-v2';
const ASSETS = ['/', '/css/style.css', '/js/main.js', '/images/favicon.svg', '/images/app-icon.jpg', '/manifest.json'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.pathname === '/download' || url.pathname.startsWith('/apk/') || url.pathname.startsWith('/api/')) return;
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => { const copy = response.clone(); if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, copy)); return response; }).catch(() => caches.match('/'))));
});
