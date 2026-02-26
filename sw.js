const CACHE_NAME = 'codetrack-v3';
const ASSETS = [
    './',
    './index.html',
    './index.css',
    './sheets.js',
    './app.js',
    './manifest.json'
];

// Install — cache assets
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Fetch — cache-first, then network
self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then(cached => cached || fetch(e.request))
    );
});

// Notification click — open/focus the app
self.addEventListener('notificationclick', (e) => {
    e.notification.close();
    e.waitUntil(
        clients.matchAll({ type: 'window' }).then(list => {
            for (const client of list) {
                if (client.url.includes('index.html') || client.url.endsWith('/')) {
                    return client.focus();
                }
            }
            return clients.openWindow('./');
        })
    );
});
