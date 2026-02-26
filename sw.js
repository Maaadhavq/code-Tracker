const CACHE_NAME = 'codetrack-v5';
const ASSETS = [
    './',
    './index.html',
    './index.css',
    './manifest.json'
];

// Install — cache assets (but NOT JS files — we always want fresh JS)
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

// Activate — delete ALL old caches immediately
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Fetch — network-first for JS/API, cache-first for CSS/HTML
self.addEventListener('fetch', (e) => {
    const url = e.request.url;

    // Always go to network for JS files and API calls
    if (url.endsWith('.js') || url.includes('/api/')) {
        e.respondWith(
            fetch(e.request).catch(() => caches.match(e.request))
        );
        return;
    }

    // Cache-first for everything else
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
