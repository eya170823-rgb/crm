// 브리즈 CRM 서비스워커
// 2026-09-07: 앱을 켜면 항상 최신 화면이 뜼도록 고침.
//   문제였던 것 — fetch(request) 는 브라우저 HTTP 캐시를 그대로 탄다.
//   GitHub Pages 가 Cache-Control: max-age=600 을 주기 때문에 배포해도
//   폰에서는 예전 화면이 그대로 떴다. → HTML·JSON 은 no-store 로 받아 캐시를 건너뛴다.
// 🔴 2026-09-19 대표 지시 — 폰에 옛 화면(index.html)이 뜨던 것을 고친다.
//   ① manifest.json 의 start_url 을 saas.html 로 바꿨다(홈 화면 아이콘이 업무화면을 연다).
//   ② 여기 오프라인 폴백도 index.html → saas.html 로 바꾼다.
//      종전에는 신호가 잠깐 끊기면 구 CRM 화면으로 떨어져 "예전 화면"으로 보였다.
//   ③ 캐시 이름을 v3 으로 올린다 — activate 에서 v2 캐시(옛 index.html)가 전부 지워진다.
const CACHE_NAME = 'breeze-crm-v3';   // 이름을 바꾸면 activate 에서 예전 캐시가 전부 지워진다
// 폴백으로 쓰려면 미리 받아 둬야 한다. index.html 도 남긴다(그 주소로 들어오는 사람이 있다).
const CORE_ASSETS = ['./saas.html', './index.html', './manifest.json'];

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
        // 🔴 2026-09-21 대표 지시(배포 직후 옛 화면이 여러 번 스쳐감) — 캐시 쓰기를
        //   event.waitUntil 밖에서 하면 응답을 돌려준 직후 브라우저가 SW를 끝낼 수 있어
        //   쓰기가 중간에 끊길 위험이 있다(표준 문서화된 위험). waitUntil 로 감싸
        //   캐시가 실제로 다 쓰일 때까지 SW 를 살려 둔다 — 응답 자체는 그대로 즉시 돌아간다.
        event.waitUntil(caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {}));
        return res;
      })
      // 🔴 2026-09-19 — 폴백을 업무화면으로. 종전 './index.html' 은 구 CRM 이라 "옛 화면" 으로 보였다.
      .catch(() => caches.match(req).then((c) => c || caches.match('./saas.html')))
  );
});
