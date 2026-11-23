const CACHE = 'cg-v13';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'config.js', 'manifest.json', 'terrgeo.js', 'icons/icon-192.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
// rede primeiro (para sempre pegar a versão nova), cache como reserva offline
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
});

// ---- notificações (Firebase Cloud Messaging) ----
try {
  importScripts('config.js');
  if (self.FIREBASE_CONFIG && self.FCM_VAPID) {
    importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js', 'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
    firebase.initializeApp(self.FIREBASE_CONFIG);
    const messaging = firebase.messaging();
    // mensagens só com "data" (as com "notification" o Firebase já mostra sozinho)
    messaging.onBackgroundMessage(p => {
      if (p.notification) return;
      const d = p.data || {};
      if (d.title) self.registration.showNotification(d.title, { body: d.body || '', icon: 'icons/icon-192.png', badge: 'icons/favicon-48.png', data: { url: d.url || './' } });
    });
  }
} catch (e) { /* sem notificações neste navegador */ }
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && (e.notification.data.url || (e.notification.data.FCM_MSG && e.notification.data.FCM_MSG.data && e.notification.data.FCM_MSG.data.url))) || './';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => { for (const w of ws) if ('focus' in w) return w.focus(); return clients.openWindow(url); }));
});
