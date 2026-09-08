// 브리즈 CRM 서비스워커
// 2026-09-07: 앱을 켜면 항상 최신 화면이 뜼도록 고침.
//   문제였던 것 — fetch(request) 는 브라우저 HTTP 캐시를 그대로 탄다.
//   GitHub Pages 가 Cache-Control: max-age=600 을 주기 때문에 배포해도
//   폰에서는 예전 화면이 그대로 떴다. → HTML·JSON 은 no-store 로 받아 캐시를 건너뛴다.
const CACHE_NAME = 'breeze-crm-v2';   // 이름을 바꾸면 activate 에서 예전 캐시가 전부 지워진다
const CORE_ASSETS = ['./index.html', './manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

// 화면 자체(HTML)와 version.json 은 항상 새로 받는다.
function alwaysFresh(req) {
  if (req.mode === 'navigate' || req.destination === 'document') return true;
  return /\.(?:html|json)$/i.test(new URL(req.url).pathname);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // GAS 웹앱 호출 등은 건드리지 않는다

  const opts = alwaysFresh(req) ? { cache: 'no-store' } : {};
  event.respondWith(
    fetch(req, opts)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((c) => c || caches.match('./index.html')))
  );
});
