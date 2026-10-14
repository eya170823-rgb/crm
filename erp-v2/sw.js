// 2026-10-14 — 설치(PWA) 요건만 채우는 최소 서비스워커. 아무것도 캐시하지 않는다.
// 로그인·GAS 호출은 항상 네트워크로 그대로 보낸다(오래된 데이터로 보일 위험 없음).
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (event) => { event.respondWith(fetch(event.request)); });
