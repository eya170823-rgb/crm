// 2026-11-27 — 당근부동산 지도 목록(로그인 불필요)을 받아 브리즈 ERP(구글 스크립트 dgnIngest)로 보낸다.
// 거르기·주소 찾기·중복 합치기·시트 쓰기는 ERP 서버가 한다(같은 규칙). 여기서는 목록만 받는다.
const GAS = process.env.GAS_URL, KEY = process.env.DGN_INGEST_KEY;
const HASH = 'fe0d66638e6508da75bd156a54a2f11624fdce3c575b06ff86f4ebfd8c3a31e3';
const GQL = 'https://realty.kr.karrotmarket.com/graphql';
const MAX_PAGES = 12;   // 50건 × 12쪽 = 최신 600건(30분마다라 충분)
if (!GAS || !KEY) { console.log('GAS_URL / DGN_INGEST_KEY 없음'); process.exit(1); }
const pick = (a) => ({ originalId: a.originalId, region: a.region, trades: a.trades, salesTypeV3: a.salesTypeV3, salesType: a.salesType,
  area: a.area, floor: a.floor, topFloor: a.topFloor, publicCoordinate: a.publicCoordinate, writerTypeV2: a.writerTypeV2,
  writer: { nickname: (a.writer || {}).nickname }, buildingName: a.buildingName, complex: a.complex ? { name: a.complex.name } : null, addressInfo: a.addressInfo });
let after = null; const all = [];
for (let p = 0; p < MAX_PAGES; p++) {
  const body = { variables: { first: 50, after, input: {
    locationFilter: { neCoordinate: { lat: '33.60', lon: '127.00' }, swCoordinate: { lat: '33.20', lon: '126.10' } },
    propertyFilter: { salesTypes: [], tradeTypes: ['MONTH', 'YEAR'] }, resolution: 9, surface: 'MAP' } },
    extensions: { persistedQuery: { version: 1, sha256Hash: HASH } } };
  const r = await fetch(GQL, { method: 'POST', headers: { 'content-type': 'application/json', accept: '*/*', 'accept-language': 'ko-KR',
    origin: 'https://realty.daangn.com', referer: 'https://realty.daangn.com/', 'x-realty-platform': 'realty-web' }, body: JSON.stringify(body) });
  if (!r.ok) { console.log('당근 HTTP', r.status); break; }
  const j = await r.json(); const f = j && j.data && j.data.articleFeed;
  if (!f) { console.log('당근 목록 없음', JSON.stringify(j.errors || '').slice(0, 300)); break; }
  for (const e of f.edges || []) { const a = e && e.node && e.node.article; if (a && a.originalId) all.push(pick(a)); }
  if (!f.pageInfo || !f.pageInfo.hasNextPage || !f.pageInfo.endCursor) break;
  after = f.pageInfo.endCursor; await new Promise((ok) => setTimeout(ok, 400));
}
const kinds = {}; all.forEach((a) => { const k = (a.salesTypeV3 || {}).type || a.salesType || '?'; kinds[k] = (kinds[k] || 0) + 1; });
console.log('당근 받은 글', all.length, JSON.stringify(kinds));
if (!all.length) process.exit(1);
const res = await fetch(GAS, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ action: 'dgnIngest', key: KEY, articles: all }), redirect: 'follow' });
const txt = await res.text();
console.log('ERP', res.status, txt.slice(0, 400));
if (!/"ok":\s*true/.test(txt)) process.exit(1);
