const CACHE_NAME = 'car-system-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon.svg',
  './js/db.js',
  './js/sync.js'
];

// 載入時進行快取
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

// 清除舊版快取
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 攔截請求，優先返回快取，無快取則請求網路並更新快取 (Stale-while-revalidate 取向，這裡用簡單的 Cache First + Network Fallback)
self.addEventListener('fetch', (event) => {
  // 避免攔截 API 或 Google Drive 相關的跨域請求，或直接攔截自己的靜態資源
  if (event.request.url.startsWith(self.location.origin)) {
    event.respondWith(
      caches.match(event.request)
        .then((cachedResponse) => {
          // 若有快取則返回快取，否則嘗試抓取
          return cachedResponse || fetch(event.request).then(
            (response) => {
              // 可選：抓到新資料後寫入快取
              // if (!response || response.status !== 200 || response.type !== 'basic') {
              //   return response;
              // }
              // const responseToCache = response.clone();
              // caches.open(CACHE_NAME)
              //   .then((cache) => {
              //     cache.put(event.request, responseToCache);
              //   });
              return response;
            }
          );
        })
    );
  }
});
