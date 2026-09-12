// 드라이브 권한 승인용 — 편집기에서 1회 실행 후 지워도 됨 (2026-08-24, 파일 맨 위 = 드롭다운 맨 위)
// 쓰기 동작 포함(폴더 생성 후 즉시 휴지통) — 전체 drive 스코프를 확실히 요청하기 위함
function authDrive() {
  var f = DriveApp.createFolder('_권한확인_지워도됨');
  f.setTrashed(true);
  Logger.log('드라이브 쓰기 권한 OK');
}

/**
 * 브리즈부동산중개 CRM — Google Apps Script 백엔드 (완성본 v10)
 * v4 (2026-08-01): 날짜 표기 yyyy-MM-dd 통일 — fmtCell 추가, updatedAt/로그 형식 변경, 시트 날짜 자동변환 방지
 * v5 (2026-08-01): fmtCell에 구형 날짜 문자열(영문·한국식) 정규화 추가, builtYear(건축년도) 칼럼 삭제 — aprDate(사용승인일)로 일원화
 * v6 (2026-08-01): 시트 보강 확장 — 주소 지번 정규화(축약·도로명→정식 지번), 건물명 자동 채움(주소DB→대장 순)
 *                  + 임대인관리(landlords) 시트 타입 추가 (주기 연락 관리)
 * v7 (2026-08-01): 매물관리 헤더에 당근 필수입력 칼럼 연한 노랑 표시 — 저장·중복정리 때 자동 재적용, testColorHeaders로 즉시 적용 가능
 *                  + 중복 행(매물번호 또는 주소+호수 동일) 연한 빨강 배경 표시 — 저장·보강 때 자동 갱신
 * v8 (2026-08-01): 보강 시 주소에 건물명이 붙던 문제 수정 — juso 지번주소에서 건물명(bdNm) 제거 후 저장 (건물명은 apt 칼럼에만)
 * v9 (2026-08-01): 홈페이지 피드 추가(action=listings/news/board) — breeze 홈페이지가 통합매물장 대신 CRM 매물관리를 읽음
 *                  (개인정보·지번·호수 미노출, 계약완료·테스트 제외) + 방문예약 구글캘린더 등록(action=calendarAdd)
 * v10 (2026-08-01): 솔라피 문자 자동 발송(action=smsSend/smsBalance) — CRM 문자 발송 화면에서 실제 발송.
 *                  ⚠ 스크립트 속성 3개 필요: SOLAPI_API_KEY / SOLAPI_API_SECRET / SENDER_PHONE (카카오채널\.env 값)
 *                  + API 토큰 보호: 홈페이지 피드(listings/news/board)·ping 외 모든 요청은 스크립트 속성 API_TOKEN과
 *                  일치하는 token이 있어야 처리 (v9에서 웹앱 URL이 홈페이지에 공개되어 무인증이면 고객정보 조회·문자 발송이 뚫림)
 * =====================================================
 * ✅ SHEET_ID 설정 완료: "브리즈부동산중개 CRM DB" 스프레드시트 연결됨
 * ✅ CORS 문제 해결
 * ✅ 테스트 함수 3개 포함
 *
 * [설치 방법]
 * 1. script.google.com → 새 프로젝트 생성
 * 2. 기존 코드 전체 삭제 → 이 코드 전체 붙여넣기
 * 3. 💾 저장 (Ctrl+S)
 * 4. 상단 드롭다운 → "testSetup" 선택 → ▶ 실행
 *    (권한 승인 팝업 → "고급" → "안전하지 않은 페이지로 이동" → 허용)
 * 5. 하단 로그에서 ✅ 확인
 * 6. 배포 → 새 배포 → 웹앱
 *    - 실행 계정: 나
 *    - 액세스: 모든 사용자
 * 7. 배포 URL → CRM 사이드바 하단 ⚙️ 구글 시트 설정에 입력
 *
 * 연결된 스프레드시트: https://docs.google.com/spreadsheets/d/1B69qGMsO6BPZvGVPxTnVzYmgRCqDB4UkrJjOluFqsBA/edit
 */

// ══════════════════════════════════════════
// 설정
// ══════════════════════════════════════════
var GAS_BUILD = '2026-09-12 02:40';   // 배포 스크립트가 자동 갱신 — 화면 좌측 상단 버전 뱃지와 같은 값
// 🏢 2026-09-08 복제형 SaaS: 시트 ID는 스크립트 속성 SHEET_ID 를 먼저 본다(사무소마다 다른 시트).
//   기본값(브리즈 원본 시트)은 **API_TOKEN 이 설정된 배포(=브리즈 마스터)에서만** 쓴다.
//   🔴 새 사무소 GAS 는 초기 속성이 비어 있으므로, 기본값을 무조건 쓰면 남의 시트(브리즈 원본)를 열게 된다.
var SHEET_ID = (function () {
  var ps = PropertiesService.getScriptProperties();
  var v = String(ps.getProperty('SHEET_ID') || '').trim();
  if (v) return v;
  return ps.getProperty('API_TOKEN') ? '1B69qGMsO6BPZvGVPxTnVzYmgRCqDB4UkrJjOluFqsBA' : '';
})();

// ⚠️ 건축물대장 API 키 — 스크립트 속성 BLDG_API_KEY 에서 읽는다 (2026-08-12 방식 변경).
//    편집기 ⚙️ 프로젝트 설정 → 스크립트 속성에 BLDG_API_KEY 를 한 번 등록해 두면,
//    이 파일(키 없는 드라이브 저장본)을 통째로 붙여넣어 재배포해도 대장 조회가 살아남는다.
//    (예전 방식은 코드에 키를 직접 박아서, 통째 교체 때마다 키가 날아가는 사고의 원인이었음)
var BLDG_API_KEY = PropertiesService.getScriptProperties().getProperty('BLDG_API_KEY') || '';

// 공공데이터포털이 마지막으로 돌려준 오류(키 미등록·일일 트래픽 초과 등) — datagoFetch가 기록.
// "표제부가 없습니다"가 진짜 없음인지 포털 거부인지 구분하는 용도 (2026-08-12: 대장 3경로가
// 전부 빈 결과인데 원인을 못 읽는 상태를 실측하고 추가)
var DATAGO_LAST_ERR = '';

var SHEETS = {
  listings:  '매물관리',
  docReqs: '발급요청',
  customers: '고객관리',
  contracts: '계약완료',
  landlords: '임대인관리',
  leads:     '고객리드',
  // 🎙️ 회의·음성 메모: 음성 원본은 기기에 보관하고, 검색·업무용 텍스트만 CRM에 남긴다.
  voiceMemos: '음성메모',
  visits:    '임장기록',   // 📍 2026-09-08 임장 체크인·근태
  links:     '링크수집',   // 🔗 2026-09-08 카톡 링크 보관함
  bldgcache: '대장캐시',   // 🏢 2026-09-08 건축물대장 1일 캐시
  brand:     '브랜드자산',  // 🎨 2026-09-08 브랜드 스튜디오(캐릭터·로고·굿즈 자산)
  approvals: '결재함',      // 🗂 2026-09-08 승인·보고함(사람이 올린 요청과 대표의 결정만)
  // 📄 2026-09-10 G9 계약문서 — 그때 만든 계약서·확인설명서 **본문 그대로**를 계약 id 와 버전에 묶어 남긴다.
  //   왜 별도 탭인가: 계약(50칸)을 문서 창고로 만들지 않고, 초안/수정본/최종본을 버전으로 남기기 위해.
  contractDocuments: '계약문서',
  // 📎 2026-09-11 G10-B 매물 첨부 — 파일은 **비공개** 드라이브에, 여기엔 어느 매물의 무슨 파일인지만.
  //   종전에는 첨부가 브라우저(localStorage)에만 있어 기기를 바꾸면 사라졌다(08-14 사고).
  listingAttachments: '매물첨부',
  logs:      '변경이력'
};

var HEADERS = {
  listings: [
    'id','addr','addr2','apt','type','kind','price','rentAmt','area','floor',
    'totalFloor','rooms','baths','aprDate',
    'direction','availDate','feeType','feeAmt','feeItems','feeBasis','feeEvidence','feeNote',
    'parking','pets','loan','options',
    'desc','jimok','zone','premium','bldgUse','status',
    // 🗑 2026-08-27 사장님 지시로 'recvMethod'(접수방법)·'joint'(단독/공동) 제거.
    //   2026-08-14에 이미 화면에서 뺐던 칸이고, 당근 내보내기·광고문구·계약서·필터 어디에도
    //   쓰이지 않아 시트 칼럼만 차지하고 있었다. 다음 saveAll 이 시트를 새 칼럼 구성으로 다시 쓴다.
    'recvDate','moveDate',
    'cname','cphone','customerId','naverUrl',
    'contractDate','contractEnd','note','updatedAt',
    // 2026-08-05 추가: 광고 등록상태(45~47, 시트에 이미 있던 칼럼) + 건축물대장 조회결과(48~52)
    'adsFlat','adList','daangnNo',
    'parkTotal','parkPerHh','hhldCnt','elevator','bldgSyncAt',
    // 📈 2026-08-27 신설 — 광고 성과. 조회수·문의수는 당근·직방 **광고주 화면에만** 있는 값이라
    //   여기에 적어 두지 않으면 "어떤 광고문이 먹혔는지" 나중에 알 방법이 없다.
    //   descAt(광고문 생성일)과 함께 봐야 "이 문구로 며칠간 몇 명이 봤는지"가 성립한다.
    'adViews','adInq','adStatAt','descAt',

    // 2026-08-27 추가: 매물사진. 사진 파일은 드라이브에만 두고 시트엔 링크·장수만 든다.
    //   photoUrl = 그 매물의 사진 폴더 링크 / photoCnt = '원본3·보정완료3' 형태의 장수 표기
    'photoUrl','photoCnt',
    // 🌐 2026-08-28 신설 — 홈페이지 노출 스위치.
    //   종전에는 조건(거래유형·가격·위치 있고 계약 안 됨)만 맞으면 **전부 자동으로** 홈페이지에
    //   나갔다. 임대인이 온라인 노출을 원치 않거나 정보가 덜 채워진 매물도 막을 수 없었다.
    //   🔴 빈 칸 = 노출(종전과 같음). 끄고 싶은 것만 '숨김'.
    //     기본을 '숨김'으로 두면 배포되는 순간 홈페이지가 통째로 비어 버린다.
    //   🔴🔴 **새 칼럼은 반드시 이 목록의 맨 끝에 붙인다.**
    //     처음에 descAt 뒤(55번)에 넣었다가 사고가 날 뻔했다 — 시트에는 이미 다른 세션이
    //     추가한 photoUrl·photoCnt 가 55·56번에 있어서, HEADERS 순서와 시트 칼럼 순서가
    //     어긋났다. 저장은 HEADERS 순서로 행 전체를 다시 쓰므로(규칙 9), 그대로 저장했으면
    //     web 값이 photoUrl 칸에 들어가고 사진 주소가 밀렸다. 배포 직후 실측으로 잡았다.
    'web',
    // 🧩 2026-09-08 지시어 6건 — 대장 표제부 확장(대지·연면적·구조·내진·지하층)·지도 좌표·검수 도장. 🔴 맨 끝 유지.
    'platArea','totArea','strct','quake','ugFloor','lat','lon','verified','verifiedAt','auditNote',
    // 📌 2026-09-10 담당자. 🔴 맨 끝 유지 — 중간에 넣으면 upsertRow 가 뒤 칸을 밀어 읽는다.
    //    값은 사람 이름이 아니라 user.id ('admin' 또는 'staff_…') 다.
    'agent'   // 📌 2026-09-10
  ],
  docReqs: ['id','listingId','addr','addr2','apt','docTypes','status','requestedAt','doneAt','fileUrl','note','updatedAt'],
  customers: [
    'id','name','phone','role','type',
    'recvDate','deadline','budget','region','propType','areaSize',
    'step','progressStatus',
    'conApt','conMoveIn','conFloor','conUnit','conPrice','conRenewal',
    'note','updatedAt',
    // 2026-08-27 추가: 다음 연락 예정일(임대인관리 nextContact와 같은 개념 — "다음 행동
    // 날짜가 없으면 방치된다"는 걸 임대인 3,500명대 관리로 이미 검증했음, 고객에도 이식).
    // 끝에 붙여야 안전 — 기존 행이 있을 때 중간에 넣으면 upsertRow가 뒤 칸을 밀어 읽는다(위치 고정 방식).
    'nextAction',
    // 📌 2026-09-10 담당자(user.id). 🔴 맨 끝 유지.
    'agent'
  ],
  landlords: [
    'id','name','phone','addr','apt',
    'cycle','lastContact','nextContact','owner','ownerName','note','updatedAt',
    // 📌 2026-09-10 2차: 역할·연락상태·재확인일을 거래상태와 갈라 적는다. 🔴 맨 끝 유지(중간 삽입 금지).
    //   owner 는 예전부터 '담당 직원 ID' 다 — 소유자가 아니다. 뜻을 바꾸지 않는다.
    //   기존 4,075행은 빈칸으로 둔다(추측해서 채우지 않는다).
    'role',          // 소유자·임대인·매도인·관리인·관리업체·임차인·중개업소·미확인
    'roleEvidence',  // 그렇게 본 근거(원문 낱말·통화 시각). 근거 없으면 비워 둔다.
    'contactStatus', // 정상·번호틀림·연락금지·역할미확인
    'nextCheck',     // 거래상태를 다시 확인할 날 (nextContact 와 다르다)
    'banReason',     // 연락금지 사유. 비어 있으면 금지 아님.
    'source'         // 이 행이 어디서 왔는지
  
  ],
  contracts: [
    'id','apt','type','price',
    'landlordName','landlordPhone',
    'tenantName','tenantPhone',
    'start','end','note','updatedAt','listingId','addr2','rentAmt',
    // 2026-08-14 추가: 만기 '연장/종료' 확정과 '연락 완료' 표시.
    //   종전에는 localStorage(crm_expStatus·crm_contacted)에만 있어 폰과 PC가 다르게 보이고,
    //   브라우저 데이터를 지우면 그동안 정리한 만기 확정 내역이 통째로 사라졌다.
    'expStatus','contacted',
    // ⚖ 2026-09-08 추가 — 이상거래 탐지(계약서 작성 시 판정) + 매매 신고·해제·등기 추적. 🔴 맨 끝 유지.
    'riskGrade','riskCode','riskKind','riskN','riskM','riskQ1','riskQ3','riskV','riskAt','trackState','trackAt',
    // 💰 2026-09-08 수당 정산 — 계약별 중개보수(원). 🔴 맨 끝 유지.
    'feeAmt',
    // 🤝 2026-09-08 공동중개 정산(사무소명·우리 몫 %)·에스크로 상태·입금일·담당자. 🔴 맨 끝 유지.
    'coName','coRate','escrow','feePaidAt','agent',
    // 💵 2026-09-10 G6 수납 — 계약금·중도금·잔금. 🔴🔴 맨 끝 유지(중간 삽입 금지).
    //   왜 필요한가: 종전에는 이 값들이 **계약서 작성기 폼(cw-price2/3/4)** 에만 있었고
    //   계약 자료에는 칸이 없어, 계약 뒤 "오늘 무엇을 받아야 하는지" 를 볼 방법이 없었다.
    //   🔴 start(계약 시작일)·end(계약 만료일) 을 잔금일로 쓰지 않는다 — 뜻이 다르다.
    //   🔴 PaidAt 은 **사람이 확인해서 적는 날짜**다. 은행과 이어져 있지 않다.
    //   🔴 ConfirmedBy 는 그 확인을 한 사람(crmWho) 이다. 자동 입금확인이 아니다.
    //   빈 칸은 빈 칸이다 — 0원·오늘 날짜 같은 기본값을 넣지 않는다.
    'depositAmt','depositDue','depositPaidAt','depositConfirmedBy',
    'interimAmt','interimDue','interimPaidAt','interimConfirmedBy',
    'balanceAmt','balanceDue','balancePaidAt','balanceConfirmedBy',
    // 🧾 2026-09-10 G6 증빙 — **기록만** 한다. 자동 발행·API 연동은 하지 않는다.
    //   receiptType: 영수증 / 현금영수증 / 세금계산서 / 해당없음 (사람이 고른다)
    'receiptType','receiptNo','receiptIssuedAt',
    // 📝 2026-09-10 G8 특약 — 이 계약에 실제로 쓴 **최종 특약 문장 전체**. 🔴🔴 맨 끝 유지.
    //   왜 필요한가: 종전에는 특약이 계약서 작성기(cw-special)에만 있고 계약 자료에는
    //   칸이 없어, 계약을 다시 열면 **특약이 사라져 있었다**(G7 P0-2).
    //   특약은 분쟁의 핵심인데 무엇으로 계약했는지 기록이 남지 않았다.
    //   🔴 문고 번호가 아니라 **사람이 손댄 최종 문장 전체**를 그대로 담는다.
    //   🔴 줄바꿈을 그대로 보존한다(조항 사이 빈 줄이 의미를 가진다).
    //   🔴 이 칸이 비어 있으면 "저장된 특약 없음" 이다 — 기본 특약을 자동으로 채우지 않는다.
    'specialTerms'
  ],
  // 2026-08-14 추가: 고객리드(문의만 하고 아직 고객이 아닌 사람).
  //   고객관리(customers)와 성격이 달라 별도 시트로 둔다 — 인입경로·수신동의·발송횟수는
  //   계약 고객에게 의미가 없고, 반대로 고객관리의 계약 관련 열은 리드에게 늘 비어 있다.
  //   ⚠ 이 2줄이 배포돼 있어야 프런트의 고객리드 탭이 저장을 시도할 때 saveAll 이
  //     "알 수 없는 type: leads"로 던지지 않는다.
  leads: [
    'id','name','phone','source','interest','status',
    'createdAt','lastSentAt','sentCount','optIn','note','updatedAt'
  ],
  // 2026-09-07: 회의 녹음/빠른 음성 메모. 오디오 파일은 개인정보이므로 시트·공개 드라이브에
  // 자동 업로드하지 않는다. 필요하면 기기에 내려받아 기존 비토 변환 화면으로 별도 올린다.
  voiceMemos: [
    'id','kind','title','text','customerId','customerName','createdAt','updatedAt'
  ],
  // 📍 2026-09-08: 임장 체크인·근태(출근/복귀). 화면 p-visit 이 upsert 로 올린다. 위치는 체크인 시점 GPS.
  visits: [
    'id','kind','agent','listingId','listingName','customerId','customerName',
    'lat','lon','dist','at','rating','prob','memo','updatedAt',
    'outAt','stayMin'     // 📍 2026-09-08 체크아웃 시각·체류(분). 🔴 맨 끝 유지.
  ],
  // 🔗 2026-09-08 카톡 링크 보관함(kakao.txt → 제목·URL·업로드 날짜). 노션 DB 연동 시 notionId.
  links: ['id','title','url','at','sender','source','domain','memo','notionId','updatedAt'],
  // 🏢 2026-09-08 건축물대장 1일 캐시(같은 지번 재조회 방지). 07일 지나면 enrichDaily 가 정리.
  bldgcache: ['key','op','fetchedAt','json'],
  // 🎨 2026-09-08 브랜드 스튜디오 — 파일은 드라이브, 여기엔 링크·버전·상태·사용처만
  brand: ['id','name','category','kind','charRole','desc','fileUrl','fileId','thumbUrl','version',
          'status','approvedAt','approvedBy','createdBy','usedFor','usedAt','note','updatedAt'],
  // 🗂 2026-09-08 승인·보고함. '기한 초과'는 저장하지 않는다 — dueAt 과 오늘을 비교한 계산값이다.
  approvals: ['id','kind','title','deptFrom','targetType','targetId','amount','requester','requestedAt',
              'dueAt','status','decidedBy','decidedAt','reason','priority','note','updatedAt'],
  // 📄 2026-09-10 G9-B 계약문서 — 생성 당시 **렌더된 본문 그대로**를 보관한다.
  //   🔴 입력값을 다시 조합하거나 생성기를 다시 돌려 만든 것은 저장본이 아니다.
  //   contractId : contracts.id 완전일치로만 잇는다(주소·건물명·전화로 잇지 않는다)
  //   docType    : contract(계약서) / explanation(확인설명서) 둘뿐
  //   version    : 같은 contractId+docType 안에서만 1부터 센다. 🔴 기존 행을 고치지 않는다.
  //   body       : 그때 화면에 나온 글자 그대로
  //   source     : local(이 프로그램이 만든 초안) / ai(AI 응답) — 저장 당시 실제 경로
  //   status     : saved 만 쓴다. '법적 원본' 같은 말을 코드가 붙이지 않는다.
  contractDocuments: ['id', 'contractId', 'docType', 'version', 'body', 'source',
                      'createdAt', 'createdBy', 'status', 'note', 'updatedAt'],
  // 📎 2026-09-11 G10-B 매물 첨부 — 🔴🔴 맨 끝 유지.
  //   🔴 파일 내용(base64)은 여기 담지 않는다. 드라이브에 두고 fileId 로만 가리킨다.
  //   🔴 Drive URL 을 관계키로 쓰지 않는다 — listingId + fileId 를 명시적으로 관리한다.
  //   status: active / disabled  (지우지 않고 비활성으로 둔다 — 규칙 23)
  listingAttachments: ['id', 'listingId', 'fileId', 'fileName', 'mimeType', 'fileSize',
                       'createdAt', 'createdBy', 'status', 'note', 'updatedAt']
};

// ══════════════════════════════════════════
// GET 요청 (데이터 조회)
// ══════════════════════════════════════════
/* 🔒 2026-09-10 P0 — 이번 요청을 부른 사람. 자동응답 '발송' 판단에만 쓴다.
   문자 수집(smsIn·missedCall·callEnd)은 폰이 부르는 창구라 막지 않는다 —
   기록은 그대로 남기고, 실제로 문자를 '보내는' 것만 대표 토큰일 때 나간다.
   (직원이 수신을 위조해 임의 번호로 자동응답을 보내게 하는 우회를 막는다) */
var CUR_USER_ = null;

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'ping';
    // 🏢 초기 설정 전 사무소(API_TOKEN 없음)는 아무것도 하지 않는다 — 누구나 admin 이 되는 구멍 차단
    if (tenantLocked_()) return err('사무소 초기 설정 전입니다 — onboard-tenant 스크립트로 설정하세요');
    var type   = (e && e.parameter && e.parameter.type)   ? e.parameter.type   : 'listings';

    // 공개 액션(홈페이지 피드·연결 확인)만 무인증 — 나머지는 API_TOKEN 필요
    if (action === 'listings') return reply2_(e, { listings: getHomepageListings() });
    if (action === 'news') return reply2_(e, { news: getBlogPosts2_(NEWS_CATEGORY2) });
    if (action === 'board') return reply2_(e, { board: getBlogPosts2_([BOARD_CATEGORY2]) });
    var user = resolveUser_(e.parameter.token);
    // 2026-08-12: ping도 토큰 필수 — 이실장 ⚙시트연결 [연결 테스트]가 틀린 토큰을
    // "연결 성공"으로 오판하지 않게 한다 (원본 통합매물장 Code.gs도 전 action 토큰 선검사)
    if (!user) return err('인증 실패 — 토큰이 서버와 다릅니다 (CRM ⚙️ 구글 시트 설정 / 이실장 ⚙시트연결에서 확인)' + authFailNote_());
    CUR_USER_ = user;
    if (action === 'calendarAdd') return ok({ result: addCalendarEvent(e.parameter.title, e.parameter.date) });
    if (action === 'smsBalance') return ok({ result: smsBalance() });
    // ⚖ 이상거래 판정 (2026-09-08): 계약서 작성 화면이 GET 으로 묻는다. 읽기 전용.
    if (action === 'riskCheck') return ok({ result: riskCheck_(e.parameter) });
    // 🧩 2026-09-08 지시어 6건 — 벨 이벤트(웹훅)·화면 폴링·매물 감사·공통 설정. 전부 인증 뒤.
    if (action === 'callRing')      return callRingReply_(e, user);
    if (action === 'callRingPoll')  return ok({ result: callRingPoll_(user, e.parameter) });
    if (action === 'auditListings') return ok({ result: auditListings_(user, e.parameter) });
    if (action === 'cfgAll')        return ok({ result: cfgAll_(user) });
    // 🗂 2026-09-08 승인·보고함 — 결재함(사람이 올린 것) + 자동 감지 목록(기존 시트에서 파생, 읽기 전용)
    if (action === 'approvalList')  return ok({ result: approvalList_(user, e.parameter) });
    if (action === 'approvalFeed')  return ok({ result: approvalFeed_(user) });
    // 📞 CTI 팝업 (2026-09-08): 폰(MacroDroid)이 전화 수신 순간 GET 으로 묻는다 — 규칙 17 과 같은 쿼리 방식.
    //    fmt=text 면 글 그대로 돌려준다(폰이 파싱 없이 알림에 넣게). 인증(resolveUser_) 뒤에 있어야 한다.
    if (action === 'callPop') {
      var cp = callPop_(e.parameter, user);
      if (String(e.parameter.fmt || '') === 'text') return ContentService.createTextOutput(cp.text).setMimeType(ContentService.MimeType.TEXT);
      return ok({ result: cp });
    }
    // 🥕 매물 수집(당근·오일장) 진행상황 — 화면이 몇 초마다 물어본다 (대표만)
    //   🔴 이름을 gather* 로 쓴다. 'collectStatus' 는 이미 **문자수집 상태**가 쓰고 있어서
    //      같은 이름을 쓰면 고객관리 화면의 문자수집 표시를 통째로 가로챈다.
    //      (2026-09-07 검산 중에 실제로 가로채고 있던 것을 잡아 고쳤다)
    if (action === 'gatherStatus') return ok({ result: gatherStatus(user) });
    if (action === 'gatherList')   return ok({ data: gatherList(user, e.parameter) });
    // 📈 아파트 실거래가 조회·분석 (2026-09-07) — 공개 시세 데이터라 직원도 본다(토큰만 있으면).
    if (action === 'aptRegions')   return ok({ data: aptRegions_() });
    if (action === 'aptSearch')    return ok({ result: aptSearch_(e.parameter) });
    if (action === 'aptTrend')     return ok({ result: aptTrend_(e.parameter) });

    if (action === 'ping') {
      // title: 이실장 광고 프로그램의 연결 테스트가 시트 이름을 표시하는 데 사용
      // role: 화면이 대표 전용 메뉴(🥕 매물 수집)를 보일지 정하는 데 쓴다 (2026-09-07)
      //   서버가 어차피 막지만, 직원 화면에 눌러도 안 되는 버튼을 띄우지 않기 위한 것.
      return ok({ message: '연결 성공!', title: SpreadsheetApp.openById(SHEET_ID).getName(),
                  role: user.role, who: user.name,
                  // 📌 2026-09-10 담당자 비교의 기준값. 이름(who)이 아니라 이 id 로 맞춘다.
                  id: user.id,
                  time: Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss') });
    }
    if (action === 'getAll') {
      return ok({ data: getAllData(type, user) });
    }
    if (action === 'bldg') {
      return ok({ data: bldgLookup(e.parameter) });
    }
    if (action === 'bldgUnits') {
      return ok({ data: bldgUnits(e.parameter) });
    }
    if (action === 'enrich') {
      return ok({ result: enrichListings() });
    }
    if (action === 'docReqList') return ok({ result: getAllData('docReqs', user) });
    if (action === 'contractDocList') return ok({ result: contractDocList(user, e.parameter) });
    if (action === 'attachList') return ok({ result: listingAttachList(user, e.parameter) });
    if (action === 'attachGet')  return ok({ result: listingAttachGet(user, e.parameter) });
    // 📥 인입함 → CRM 고객 승격 (2026-08-22): 문자·통화 수집분을 CRM 화면에서 보고 고객으로 잇는다
    // 2026-08-26 확장: 상태·미등록 필터 + 일괄 표시 — 921건 적체를 60건짜리 창으로는 못 봐서 추가
    if (action === 'phoneFix') return ok({ result: phoneFix_(e.parameter.apply === '1') });
    if (action === 'inboxList') return ok({ result: inboxList_(parseInt(e.parameter.limit, 10) || 60, e.parameter.status || '', e.parameter.unreg === '1', parseInt(e.parameter.offset, 10) || 0) });
    // 🏢 공실현황(문자로 들어온 공실) 최근 것 — 매물로 만들 수 있게 화면으로 넘긴다 (2026-09-09, 읽기만)
    if (action === 'vacList') return ok({ result: vacList_(parseInt(e.parameter.limit, 10) || 120) });
    if (action === 'inboxMark') return ok({ result: inboxMark_(parseInt(e.parameter.row, 10), e.parameter.val) });
    if (action === 'memoIn') return ok({ result: memoIn_(e.parameter, user) });
    // 📥 무더기 정리 (2026-08-30) — mode=phone|registered|kind|rows, dry=1 이면 미리보기만
    if (action === 'inboxStat')  return ok({ result: inboxStat_() });
    if (action === 'inboxSweep') return ok({ result: withWriteLock_(function () {
      return inboxSweep_(e.parameter.mode, e.parameter.value, e.parameter.dry === '1', e.parameter.val);
    }) });
    // 🚫 그만 받을 번호 (2026-09-09 대표 지시) — 대표만. 등록하면 다음부터 인입함에 안 들어온다.
    if (action === 'excludeList') return ok({ result: excludeList_() });
    if (action === 'excludeAdd')  return ok({ result: withWriteLock_(function () {
      return excludeAdd_(user, e.parameter.key, e.parameter.memo);
    }) });
    if (action === 'excludeDel')  return ok({ result: withWriteLock_(function () {
      return excludeDel_(user, e.parameter.key);
    }) });
    // 📥 인입함에 쌓인 번호를 묶어 보여준다 — 무엇을 그만 받을지 고르는 화면용
    if (action === 'inboxSenders') return ok({ result: inboxSenders_() });
    if (action === 'inboxMarkBulk') {
      var _rows = String(e.parameter.rows || '').split(',').map(function (s) { return parseInt(s, 10); }).filter(function (n) { return !isNaN(n); });
      return ok({ result: inboxMarkBulk_(_rows, e.parameter.val) });
    }
    // 🏠 통합매물장 임대인 명부 일괄 이전 (2026-08-22): 08-01에 준비만 되고 실행 안 된
    //   임대인명부_이전.py 를 GAS로 이식 — 메인컴 없이 API 호출 1회로 실행 (멱등)
    if (action === 'importLandlords') return ok({ result: withWriteLock_(function () { return importLegacyLandlords(); }) });
    // 📈 실거래 시세 대조 (2026-08-22): 국토부 실거래가 API로 내 매물이 싼지 비싼지 판정
    if (action === 'priceCheck') return ok({ result: priceCheck_(e.parameter) });
    // 📬 공실확인 문자 대기열 (2026-08-28) — 오늘부터 새로 잡히는 공실 임대인에게만, 하루 50건씩.
    //   🔴 vacSmsRun 은 화면 버튼으로만 돈다(시간 트리거 없음). 사람이 매번 시작시킨다.
    if (action === 'vacSmsBuild') return ok({ result: withWriteLock_(function () { return vacSmsBuild(e.parameter.since, e.parameter.skip); }) });
    if (action === 'vacSmsStat')  return ok({ result: vacSmsStat() });
    // 💾 시트 자동 백업 (2026-08-28) — 매일 새벽 3시, 30일치 보관
    if (action === 'sheetsInfo')    return ok({ result: sheetsInfo() });
    if (action === 'backupField')  return ok({ result: backupField_(e.parameter.tab, e.parameter.date, e.parameter.field) });
    // 🛡 매물 소실 감시 (2026-09-02)
    if (action === 'guardCheck')     { adminOnly_(user, '매물 감시(알림 문자 발송)');
      return ok({ result: listingsGuard_() }); }
    if (action === 'restoreSnapshot') { adminOnly_(user, '스냅샷 복구'); return ok({ result: withWriteLock_(function () { return restoreFromSnapshot(); }) }); }
    if (action === 'fitColumns')   return ok({ result: withWriteLock_(function () { return fitSheetColumns(type); }) });
    if (action === 'backupPeek')   return ok({ result: backupPeek_(e.parameter.tab, e.parameter.date) });
    // 🆘 백업에서 탭 되살리기 (2026-09-02)
    if (action === 'restoreTab')   { adminOnly_(user, '탭 복구'); return ok({ result: withWriteLock_(function () {
      return restoreTabFromBackup(e.parameter.tab, e.parameter.date, e.parameter.dry === '1');
    }) }); }
    // 🔀 칼럼 옮기기 (2026-08-30) — dry=1 이면 계획만
    if (action === 'moveColumn')   { adminOnly_(user, '칼럼 이동'); return ok({ result: withWriteLock_(function () {
      return moveSheetColumn(type, e.parameter.name, e.parameter.to, e.parameter.dry === '1');
    }) }); }
    if (action === 'sheetsPrune')   { adminOnly_(user, '시트 정리'); return ok({ result: withWriteLock_(function () {
      return sheetsPrune(e.parameter.names, e.parameter.dry === '1', e.parameter.withData === '1');
    }) }); }
    if (action === 'backupStatus')  return ok({ result: backupStatus() });
    if (action === 'backupNow')     return ok({ result: backupSheetDaily() });
    if (action === 'backupInstall') return ok({ result: installBackupTrigger() });
    if (action === 'vacSmsClear') return ok({ result: withWriteLock_(function () {
      return vacSmsClearWaiting(e.parameter.before, e.parameter.source);
    }) });
    if (action === 'vacSmsRun')   { adminOnly_(user, '공실 문자 발송');
      return ok({ result: withWriteLock_(function () {
      return vacSmsRun(parseInt(e.parameter.limit, 10), e.parameter.dry === '1');
    }) }); }
    // 🔬 삭제 불능 행 진단 (2026-08-22, 임시): 특정 행에서 deleteRow가 무력화되는 원인 관찰
    if (action === 'diagDelete') { adminOnly_(user, '행 삭제'); return ok({ result: diagDelete_(e.parameter.id, e.parameter.really === '1') }); }
    // 🔴 2026-08-11: 폰(MacroDroid) 문자 수신 — PC가 꺼져 있어도 구글 서버가 24시간 받아둔다.
    //    GET/POST 어느 쪽으로 와도 받도록 양쪽에 뒀다(MacroDroid 설정 방식에 안 휘둘리게).
    if (action === 'smsIn') return ok({ result: smsInbound_(e.parameter) });
    // 🤖 2026-08-23: 부재중 전화 접수 + 자동응답, 검증·헬스체크 액션
    if (action === 'missedCall') return ok({ result: missedCallInbound_(e.parameter) });
    // 📞 통화 종료 피드백 (2026-08-23): MacroDroid "통화 종료" 트리거용 — 미등록 번호에만 상담 정리 문자
    if (action === 'callEnd') return ok({ result: callEndInbound_(e.parameter) });
    // 📝 블로그 발행 기록 (2026-08-23, 설계서 ④-3): 발행기가 발행 후 호출 — 광고관리에 발행일·URL 표시
    if (action === 'blogMark') return ok({ result: withWriteLock_(function () { return blogMark_(e.parameter); }) });
    // 📱 폰 유심 발송 확인 (2026-08-24): 폰(MacroDroid)이 문자를 보낸 직후 호출 — 쿼리 파라미터 전용(smsIn과 동일 방식)
    if (action === 'phoneSmsAck') return ok({ result: phoneSmsAck_(e.parameter.qid) });
    // 💛 카카오 채널 pfId 동기화 (2026-08-24): 솔라피 API에서 연동 채널 조회 → KAKAO_PF_ID 속성 저장
    if (action === 'kakaoPfSync') return ok({ result: kakaoPfSync_() });
    // 💛 알림톡 템플릿 상태 조회·자동 활성 (2026-08-24): 승인되면 속성 저장 + 테스트 1회
    // 👀 읽기 전용 현황 (2026-08-28) — kakaoTplSync 와 달리 저장·발송을 하지 않는다
    if (action === 'kakaoStatus') return ok({ result: kakaoStatus_() });
    if (action === 'kakaoTplSync') { adminOnly_(user, '알림톡 템플릿 동기화(테스트 발송 포함)');
      return ok({ result: kakaoTplSync_() }); }
    // 📅 일정 알림 (2026-08-24 사장님 지시 — 미팅·계약·잔금 리마인더)
    if (action === 'scheduleAdd') { adminOnly_(user, '예약 등록(확정 문자·리마인더 발송)');
      return ok({ result: withWriteLock_(function () { return scheduleAdd_(e.parameter); }) }); }
    if (action === 'scheduleList') return ok({ result: scheduleList_() });
    if (action === 'scheduleDone') return ok({ result: withWriteLock_(function () { return scheduleDone_(e.parameter.id, e.parameter.mode) }) });
    // ✍️ 계약 문자 (2026-08-24): 계약 저장 시 양측 안내 + 잔금·입주일 리마인더
    if (action === 'contractSms') { adminOnly_(user, '계약 문자 발송');
      return ok({ result: withWriteLock_(function () { return contractSms_(e.parameter); }) }); }
    if (action === 'smsQueueList') return ok({ result: smsQueueList_(parseInt(e.parameter.limit, 10) || 20) });
    // 📡 2026-08-27 신설 — 문자·통화 수집이 살아 있는지 CRM 화면에서 바로 보기 위한 상태 조회.
    //   수집 서버가 죽어도 며칠 뒤에야 "문자가 안 들어오네" 하고 발견하던 구조였다(08-13~17 공백).
    if (action === 'collectStatus') return ok({ result: collectStatus_() });
    // 🔧 2026-09-05 — 문자접수 서버(server.py)가 시트 403으로 기동 즉시 죽는 사고 진단·복구용
    if (action === 'checkSheetAccess') return ok({ result: checkSheetAccess_() });
    if (action === 'grantSheetAccess') { adminOnly_(user, '시트 공유 권한 부여'); return ok({ result: withWriteLock_(function () { return grantSheetAccess_(e.parameter.email); }) }); }
    if (action === 'autoReplyLog') return ok({ result: autoReplyLogList_(parseInt(e.parameter.limit, 10) || 20) });
    if (action === 'autoReplyDry') { adminOnly_(user, '자동응답 모의판정');
      return ok({ result: autoReplyDry_(e.parameter) }); }
    // 🧹 시험 흔적 청소 (2026-08-23): 문자수신함·인입함·자동응답로그·공실현황에서
    //   가짜 시험 번호(010-0000-00xx·10000000xx)와 클로드 테스트 표기 행만 제거.
    //   dry=1이면 지울 행을 세기만 한다. 실번호·실데이터는 패턴상 건드릴 수 없음.
    if (action === 'testCleanup') return ok({ result: withWriteLock_(function () { return testCleanup_(e.parameter.dry === '1'); }) });
    // 자동응답 모드 원격 전환 (2026-08-23): on(실발송)/dry(모의발송 — 로그만)/off
    if (action === 'autoReplySet') {
      var m = String(e.parameter.mode || '').toLowerCase();
      if (m !== 'on' && m !== 'off' && m !== 'dry') return err('mode는 on/off/dry 중 하나');
      PropertiesService.getScriptProperties().setProperty('AUTO_REPLY', m);
      return ok({ result: { mode: m } });
    }
    // 🏠 주소 변환 (2026-08-30) — 도로명(신주소) → 지번(구주소). 밴드 글에 도로명만 적힌 사진을
    //    제자리에 넣으려고 만들었다. 안에서 쓰는 jusoSearch 는 **제주 결과만** 통과시킨다
    //    (siNm 이 '제주'로 시작 안 하면 버림 — 같은 길 이름이 강원·서울에도 있어서).
    if (action === 'juso') {
      var jq = String(e.parameter.q || '').trim();
      if (!jq) return err('q(주소 또는 건물명)가 필요합니다');
      var jr = jusoSearch(jq);
      if (!jr) return ok({ result: { found: false, q: jq } });
      return ok({ result: {
        found: true, q: jq,
        jibun: pureJibun(jr),                          // 건물명 뗀 순수 지번주소
        road: String(jr.roadAddr || ''),
        bdNm: String(jr.bdNm || ''),                 // 건물명
        dong: String(jr.emdNm || ''),                // 읍면동
        sido: String(jr.siNm || '')
      } });
    }
    if (action === 'healthCheck') { adminOnly_(user, '헬스체크(알림 문자 발송)');
      return ok({ result: healthCheckDaily() }); }
    if (action === 'installHealthTrigger') return ok({ result: installHealthTrigger() });
    // 🕗 지금 걸려 있는 예약 보기 (2026-09-09) — 대표만
    if (action === 'triggerList') { adminOnly_(user, '예약 확인'); return ok({ result: triggerList() }); }
    if (action === 'installSmsSweepTrigger') { installSmsSweepTrigger(); return ok({ result: 'smsQueueSweep 10분 트리거 재설치' }); }
    // ── 이실장 광고 프로그램 호환 (tabs/list/row — 매물관리를 이실장 형식으로 제공) ──
    if (action === 'tabs') return ok(isjTabs_(user));
    if (action === 'list') return ok({ items: isjList_(user, e.parameter.tab, parseInt(e.parameter.limit || '0', 10)) });
    if (action === 'row')  return ok({ row: isjRow_(user, e.parameter.key) });
    return err('알 수 없는 action: ' + action);
  } catch(e) {
    return err(e.message);
  }
}

// ══════════════════════════════════════════
// POST 요청 (저장/수정/삭제)
// ══════════════════════════════════════════
function doPost(e) {
  try {
    if (tenantLocked_() && !(e && e.postData && /tenantSetup/.test(String(e.postData.contents || '')))) {
      return err('사무소 초기 설정 전입니다 — onboard-tenant 스크립트로 설정하세요');
    }
    // 🔴 문자 수신(smsIn)은 본문 없이 쿼리 파라미터로만 올 수 있다(MacroDroid) → JSON.parse 전에 먼저 처리
    if (e && e.parameter && e.parameter.action === 'smsIn') {
      if (!resolveUser_(e.parameter.token)) return err('인증 실패');
      return ok({ result: smsInbound_(e.parameter) });
    }
    if (e && e.parameter && e.parameter.action === 'missedCall') {
      if (!resolveUser_(e.parameter.token)) return err('인증 실패');
      return ok({ result: missedCallInbound_(e.parameter) });
    }
    // 📞 2026-09-08 CTI 웹훅(아톡비즈·MacroDroid) — 폼/쿼리/JSON 어느 쪽으로 와도 받게 JSON.parse 전에 처리. 토큰은 쿼리에.
    if (e && e.parameter && e.parameter.action === 'callRing') {
      var ringUser = resolveUser_(e.parameter.token);
      if (!ringUser) return err('인증 실패');
      return callRingReply_(e, ringUser);
    }
    var body   = JSON.parse(e.postData.contents);
    var action = body.action;
    var type   = body.type;
    // 🏢 초기 설정 전 사무소: tenantSetup 만 허용(1회), 나머지 전부 거절
    if (tenantLocked_()) {
      if (action === 'tenantSetup') return ok({ result: tenantSetup(body) });
      return err('사무소 초기 설정 전입니다 — onboard-tenant 스크립트로 설정하세요');
    }

    var user = resolveUser_(body.token);
    if (!user) return err('인증 실패 — CRM ⚙️ 구글 시트 설정에 API 토큰을 입력하세요' + authFailNote_());
    CUR_USER_ = user;
    // 🔴 2026-09-10 감사: 직원 토큰으로도 문자가 나가던 구멍 — 서버에서 막는다(화면 숨김 아님)
    if (action === 'smsSend')  { adminOnly_(user, '문자 발송'); return ok({ result: smsSendMany(body.messages) }); }
    // 🥕 매물 수집 (2026-09-07) — 전부 대표(마스터) 전용. 권한 검사는 각 함수 안의 colAdmin_ 이 한다.
    //   🔴 이름 앞머리는 gather 다. collect* 는 이미 문자수집 쪽이 쓰고 있다(위 doGet 주석 참고).
    if (action === 'gatherStart')  return ok({ result: gatherStart(user, body) });
    if (action === 'gatherStop')   return ok({ result: gatherStop(user) });
    if (action === 'gatherStatus') return ok({ result: gatherStatus(user) });
    if (action === 'gatherList')   return ok({ data: gatherList(user, body) });
    if (action === 'gatherMove')   return ok({ result: gatherToLandlords(user, body) });
    // 👥 직원 계정 관리 (2026-09-08) — 전부 대표 전용(adminOnly_ 이 각 함수 안에서 검사)
    if (action === 'staffList')    return ok({ data: staffList(user) });
    if (action === 'staffAdd')     return ok({ result: staffAdd(user, body.name) });
    if (action === 'staffRevoke')  return ok({ result: staffRevoke(user, body.id) });
    // ⚖ 매매 계약 신고·해제·등기 추적 수동 실행 (대표만). 평소엔 checkExpiryDaily 09시에 자동.
    if (action === 'riskSweep')    { adminOnly_(user, '이상거래 추적'); return ok({ result: riskSweepDaily() }); }
    // 🌅 아침 자동운영(2026-09-09) — 수동 실행·트리거 설치, 대표만. 평소엔 08:00 트리거(dailyOpsMorning).
    if (action === 'dailyOpsRun')            { adminOnly_(user, '아침 자동운영'); return ok({ result: dailyOpsMorning() }); }
    if (action === 'installDailyOpsTrigger') { adminOnly_(user, '아침 자동운영 설치'); return ok({ result: installDailyOpsTrigger() }); }
    // 🏢 복제형 SaaS: 새 사무소용 시트 사본(데이터 비움) — 대표만. onboard-tenant.ps1 이 부른다.
    if (action === 'tenantSheetCreate') return ok({ result: tenantSheetCreate(user, body.name) });
    // 🧩 2026-09-08 지시어 6건 — 설정 저장(대표)·검증 도장(대표)·중복 정제(대표)·링크 저장(모두)
    if (action === 'cfgSet')       return ok({ result: cfgSet(user, body.key, body.value) });
    if (action === 'auditApply')   return ok({ result: withWriteLock_(function () { return auditApply(user, body); }) });
    if (action === 'auditDedupe')  return ok({ result: withWriteLock_(function () { return auditDedupe(user, body); }) });
    if (action === 'linkImport')   return ok({ result: linkImport(user, body) });
    // 🎨 2026-09-08 브랜드 스튜디오 — 파일 업로드(드라이브)·목록 삭제(대표)
    if (action === 'brandUpload')  return ok({ result: brandUpload(user, body) });
    if (action === 'brandDelete')  return ok({ result: withWriteLock_(function () { return brandDelete(user, body.id); }) });
    // 🗂 2026-09-08 승인·보고함 — 올리기는 누구나, 결정(승인·반려·확인요청)은 대표만(approvalDecide 안에서 검사)
    if (action === 'approvalAdd')    return ok({ result: withWriteLock_(function () { return approvalAdd(user, body); }) });
    if (action === 'approvalDecide') return ok({ result: withWriteLock_(function () { return approvalDecide(user, body); }) });
    // 📈 아파트 실거래가 (POST 로도 — 긴 조건은 본문으로 보낸다)
    if (action === 'aptSearch')    return ok({ result: aptSearch_(body) });
    if (action === 'aptTrend')     return ok({ result: aptTrend_(body) });
    // 📁 드라이브 업로드 (2026-08-24): 밴드 매물 사진 → 구글드라이브 공유 링크
    //    2026-08-27: listingId 를 주면 매물의 동·건물·호수를 읽어 '원본' 폴더에 자동 분류해 넣는다
    if (action === 'drivePut') { photoOwnGuard_(user, body.listingId);
      return ok({ result: drivePut_(body) }); }
    // 📷 매물사진 현황 (2026-08-27): 원본 몇 장 / 워터마크 찍힌 보정완료 몇 장
    if (action === 'drivePhotos') return ok({ result: drivePhotos_(body) });
    // 🔴 2026-08-21: 시트를 고쳐 쓰는 4개 액션은 잠금으로 직렬화한다.
    //   saveAll 이 "전체 읽기 → 가공 → clearContents → 전체 다시쓰기"라, 그 사이에 delete 가
    //   끼어들면 지운 행이 통째로 복원됐다(끝난 삭제가 "다시 살아나는" 원인 — updatedAt 도
    //   원본 그대로 보존되므로 08-06 조사에서 saveAll 복원이 아니라고 오판했던 것).
    if (action === 'saveAll')  return ok({ result: withWriteLock_(function () { return saveAll(type, body.data, user, body); }) });
    // 🎨 2026-09-08 브랜드 자산은 상태 흐름·권한을 서버가 검사한 값만 저장한다(brandGuard_)
    if (action === 'upsert')   return ok({ result: withWriteLock_(function () { return upsertRow(type, type === 'brand' ? brandGuard_(user, body.data) : body.data, user); }) });
    if (action === 'delete')   return ok({ result: withWriteLock_(function () { if (type === 'brand') adminOnly_(user, '브랜드 자산 삭제'); return deleteRow(type, body.data.id, user); }) });
    if (action === 'syncAll')  return ok({ result: withWriteLock_(function () { return syncAll(body.payload); }) });
    if (action === 'bldgStat') return ok({ result: bldgStat(body.bldg || body.payload || body) });
    if (action === 'docReq') return ok({ result: withWriteLock_(function () { return upsertRow('docReqs', body.data, user); }) });
    if (action === 'contractDocSave') return ok({ result: contractDocSave(user, body) });
    if (action === 'attachUpload')  return ok({ result: listingAttachUpload(user, body) });
    if (action === 'attachDisable') return ok({ result: listingAttachDisable(user, body) });
    if (action === 'mark') {                            // 이실장 등록기록 → 광고관리 연동
      var mk = withWriteLock_(function () { return isjMark_(body); });
      // 실패를 ok로 감싸면 프로그램이 "기록 저장 완료"로 오판한다 — 실패는 반드시 err로
      return mk.marked ? ok(mk) : err(mk.error || '등록기록 실패');
    }
    return err('알 수 없는 action: ' + action);
  } catch(e) {
    return err(e.message);
  }
}

// ══════════════════════════════════════════
// 문자 수신함 — 폰이 보낸 문자를 구글 서버가 24시간 받아 적재 (2026-08-11 추가)
//   PC가 꺼져 있으면 로컬 문자접수 서버(192.168.0.21:5000)가 죽어 문자가 유실됐다.
//   구글 서버는 항상 켜져 있으므로 여기서 원문만 받아 쌓아두고,
//   PC를 켜면 server.py 의 '문자수신함 회수' 워커가 읽어가 분류·기록한다.
//   🔴 여기서는 분류·AI요약을 하지 않는다 — 6분 실행제한과 임대인 색인이 PC 쪽에 있기 때문.
// ══════════════════════════════════════════
var SMS_QUEUE = '문자수신함';
var SMS_QUEUE_HEADER = ['수신시각', '번호', '이름', '내용', '유형', '처리여부', '처리시각'];

function smsInbound_(p) {
  p = p || {};
  var phone = String(p.phone || p.sender || '').trim();
  var name  = String(p.name || '').trim();
  var text  = String(p.text || '').trim();
  var kind  = String(p.event_type || 'sms').trim();
  // 번호·이름·내용이 모두 빈 요청(매크로 수동 테스트 등)은 쌓지 않는다
  if (!phone && !name && !text) return { skipped: '빈 요청' };

  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(SMS_QUEUE);
  if (!sh) {
    sh = ss.insertSheet(SMS_QUEUE);
    sh.getRange(1, 1, 1, SMS_QUEUE_HEADER.length).setValues([SMS_QUEUE_HEADER]);
    styleHeader(sh, SMS_QUEUE_HEADER.length);
    sh.setColumnWidth(4, 420);
  }
  var now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
  sh.appendRow([now, phone, name, text, kind, '', '']);
  // 🤖 2026-08-23: 적재 직후 1차 자동응답 (실패해도 적재는 이미 끝났으므로 안전)
  var ar = (kind === 'call') ? { sent: false, reason: 'call' } : autoReply_('sms', phone, name, text);
  return { received: true, at: now, phone: phone, autoReply: ar };
}

// ══════════════════════════════════════════
// 핵심 함수
// ══════════════════════════════════════════
// 시트 셀 값 → 문자열 (시트가 날짜로 자동 변환한 셀은 yyyy-MM-dd, 시각이 있으면 yyyy-MM-dd HH:mm:ss로 통일)
function fmtCell(v) {
  if (v instanceof Date) {
    var t = v.getHours() + v.getMinutes() + v.getSeconds();
    return Utilities.formatDate(v, 'Asia/Seoul', t ? 'yyyy-MM-dd HH:mm:ss' : 'yyyy-MM-dd');
  }
  if (v === undefined || v === null) return '';
  var s = String(v);
  // 과거 버그로 텍스트로 저장된 영문 날짜("Wed Jan 18 2017 ...") 정규화
  var em = s.match(/^[A-Z][a-z]{2} ([A-Z][a-z]{2}) (\d{2}) (\d{4}) /);
  if (em) {
    var mm = { Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12' }[em[1]];
    if (mm) return em[3] + '-' + mm + '-' + em[2];
  }
  // 구형 한국식 표기("2026. 8. 1. 오후 12:09:19") 정규화
  var km = s.match(/^(\d{4})\. (\d{1,2})\. (\d{1,2})\.(?: (오전|오후) (\d{1,2}):(\d{2}):(\d{2}))?$/);
  if (km) {
    var pad = function(n){ return ('0' + n).slice(-2); };
    var base = km[1] + '-' + pad(km[2]) + '-' + pad(km[3]);
    if (!km[4]) return base;
    var hh = (parseInt(km[5], 10) % 12) + (km[4] === '오후' ? 12 : 0);
    return base + ' ' + pad(hh) + ':' + km[6] + ':' + km[7];
  }
  return s;
}

function getAllData(type, user) {
  var sheet = getOrCreateSheet(type);
  var rows  = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];

  var headers = rows[0].map(String);
  var out = rows.slice(1)
    .filter(function(r) { return String(r[0]).trim() !== ''; })
    .map(function(r) {
      var obj = {};
      headers.forEach(function(h, i) {
        obj[h] = fmtCell(r[i]);
      });
      return obj;
    });

  // 📌 2026-09-10 직원에게는 본인 담당 고객·계약만 돌려준다(서버에서 막는다 — 화면 숨김 아님).
  //   🔴 매물은 거르지 않는다. 직원이 영업하려면 매물장을 봐야 하고,
  //      미검증 매물 연락처는 이미 화면에서 가려진다(listingLocked).
  //   🔴 담당자 비교는 사람 이름이 아니라 user.id 로만 한다.
  if ((type === 'customers' || type === 'contracts') && user && user.role === 'staff') {
    out = out.filter(function(o) { return String((o || {}).agent || '') === user.id; });
  }
  // 📄 2026-09-10 G9-B 계약문서 — 계약을 볼 수 없으면 그 계약의 문서도 볼 수 없다.
  //   🔴 문서 행에는 담당자 칸이 없다. **contractId 로 계약을 찾아** 그 계약의 agent 로만 판단한다.
  //   🔴 주소·건물명·전화로 잇지 않는다. contractId 가 비었으면 직원에게 내려보내지 않는다.
  if (type === 'contractDocuments' && user && user.role === 'staff') {
    var mineC_ = {};
    try {
      var csh_ = getOrCreateSheet('contracts');
      var crow_ = csh_.getDataRange().getValues();
      if (crow_.length > 1) {
        var ch_ = crow_[0].map(String);
        var ci_ = ch_.indexOf('id'), ca_ = ch_.indexOf('agent');
        if (ci_ >= 0 && ca_ >= 0) {
          for (var r_ = 1; r_ < crow_.length; r_++) {
            if (String(crow_[r_][ca_] || '').trim() === user.id) {
              mineC_[String(crow_[r_][ci_] || '').trim()] = true;
            }
          }
        }
      }
    } catch (e) { mineC_ = {}; }   // 계약을 못 읽으면 아무것도 내려보내지 않는다(닫는 쪽으로 실패)
    out = out.filter(function (o) {
      var cid = String((o || {}).contractId || '').trim();
      return !!(cid && mineC_[cid]);
    });
  }
  if (type === 'landlords' && user && user.role === 'staff') {
    out = out.map(function(o) {
      if (String(o.owner || '') === user.id) { o.mine = true; return o; }
      return {
        id: o.id, owner: o.owner, ownerName: o.ownerName,
        name: maskName_(o.name), phone: '',
        addr: o.addr, apt: o.apt,
        cycle: '', lastContact: '', nextContact: '', note: '',
        updatedAt: o.updatedAt, mine: false, masked: true
      };
    });
  }
  return out;
}

// 병합 저장: CRM 데이터 우선 + 시트에만 있는 행 보존 + (매물) 중복 제거
/* ══════════════════════════════════════════════════════════════════════════
   🔴 2026-09-11 G10-3A — saveAll 사고방지 3중 장치
   무슨 일이 있었나: 09-11 13:53 에 201호 월세를 45→46 으로 고쳤는데, 15:27 에
   낡은 화면에서 [시트에 저장]을 누르자 그 화면의 옛 목록으로 시트가 통째로 덮여
   46 이 45 로 되돌아갔다. 같이 욕실수 8건·광고문 4건·건물명 1건도 옛값이 됐다.
   막는 방법: ⓐ 같은 요청 두 번 실행 금지 ⓑ 행마다 시각 비교 후 낡으면 전체 중단
             ⓒ 쓰기 직전 사본 보관(사본 실패하면 쓰지 않는다)
   ══════════════════════════════════════════════════════════════════════════ */

/** ⓐ 같은 전체저장 요청이 두 번 들어오면(재시도·더블클릭) 두 번째는 아무것도 쓰지 않는다. */
function saveAllOnce_(type, reqId) {
  var key = 'saveAllReq:' + type + ':' + String(reqId || '');
  if (!reqId) return { first: true, key: '' };          // 예전 화면(요청번호 없음)은 그대로 통과
  try {
    var c = CacheService.getScriptCache();
    if (c.get(key)) return { first: false, key: key };
    c.put(key, '1', 600);                                // 10분간 같은 요청번호를 막는다
    return { first: true, key: key };
  } catch (e) { return { first: true, key: '' }; }
}

/** ⓑ 행마다 시각 비교 — 시트가 더 최신이면 '낡은 화면'이다. 하나라도 걸리면 전체 중단.
 *    보내온 updatedAt 이 없거나 해석 불가여도 '안전하지 않음'으로 본다.               */
function saveAllFreshness_(type, dataArr, exById, opts) {
  var out = { safe: true, conflicts: [], missingLocal: 0, remoteOnlyNewer: 0 };
  var LABEL = { listings: ['apt', 'addr2'], customers: ['name'], landlords: ['name', 'apt'], contracts: ['apt'] };
  var lab = LABEL[type] || ['name'];
  var CMP = { listings: ['price', 'rentAmt', 'area', 'floor', 'rooms', 'baths', 'status', 'type', 'kind', 'apt', 'addr', 'addr2', 'desc'],
              customers: ['name', 'phone', 'budget', 'region', 'propType', 'step', 'progressStatus', 'nextAction'],
              landlords: ['name', 'phone', 'apt', 'addr', 'nextContact', 'contactStatus', 'role'],
              contracts: ['apt', 'price', 'start', 'end'] };
  var cmp = CMP[type] || [];
  for (var i = 0; i < (dataArr || []).length; i++) {
    var o = dataArr[i] || {};
    var id = String(o.id || '').trim();
    if (!id) continue;                                   // 새 행은 비교 대상 아님
    var ex = exById[id];
    if (!ex) continue;                                   // 시트에 없던 행 = 신규
    var lt = tsNum_(o.updatedAt), rt = tsNum_(ex.updatedAt);
    var why = '';
    if (!lt) { why = '이 화면 쪽 수정시각이 없습니다'; out.missingLocal++; }
    else if (rt > lt) { why = '시트 쪽이 더 최신입니다'; out.remoteOnlyNewer++; }
    if (!why) continue;
    var diff = [];
    for (var c = 0; c < cmp.length; c++) {
      var f = cmp[c];
      var lv = String(o[f] === undefined || o[f] === null ? '' : o[f]).trim();
      var rv = String(ex[f] === undefined || ex[f] === null ? '' : ex[f]).trim();
      if (o[f] !== undefined && lv !== rv) diff.push(f + ': 화면"' + lv.slice(0, 40) + '" ↔ 시트"' + rv.slice(0, 40) + '"');
    }
    var nm = [];
    for (var k = 0; k < lab.length; k++) if (ex[lab[k]]) nm.push(String(ex[lab[k]]));
    out.conflicts.push({ id: id, name: nm.join(' '), why: why,
                         localAt: String(o.updatedAt || ''), remoteAt: String(ex.updatedAt || ''),
                         fields: diff.slice(0, 8) });
  }
  if (out.conflicts.length) out.safe = false;
  return out;
}

/** ⓒ 덮어쓰기 직전 같은 파일 안에 사본 탭을 만든다. 실패하면 저장 자체를 중단한다. */
function saveAllSnapshot_(sheet, type) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var name = sheet.getName() + '_저장전_' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'MMdd_HHmmss');
  sheet.copyTo(ss).setName(name);
  // 오래된 자동 사본은 10개까지만 남긴다(시트가 무한히 불어나지 않게)
  try {
    var pre = sheet.getName() + '_저장전_';
    var mine = ss.getSheets().filter(function (sh) { return sh.getName().indexOf(pre) === 0; })
                 .sort(function (a, b) { return a.getName() < b.getName() ? -1 : 1; });
    while (mine.length > 10) { ss.deleteSheet(mine.shift()); }
  } catch (e) {}
  return name;
}

function saveAll(type, dataArr, user, opts) {
  if (!HEADERS[type]) throw new Error('알 수 없는 type: ' + type);
  var sheet   = getOrCreateSheet(type);
  var headers = HEADERS[type];
  var now     = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');

  // 기존 시트 행 읽기 (시트에만 있는 행 보존용)
  var existing = [];
  var rows = sheet.getDataRange().getValues();
  if (rows.length > 1) {
    var hs = rows[0].map(String);
    for (var i = 1; i < rows.length; i++) {
      var obj = {};
      var empty = true;
      for (var c = 0; c < hs.length; c++) {
        var v = rows[i][c];
        obj[hs[c]] = fmtCell(v);
        if (String(v === undefined || v === null ? '' : v).trim() !== '') empty = false;
      }
      if (!empty) { obj.__sheetOnly = true; existing.push(obj); }
    }
  }
  // 🔒 2026-09-10 P0-2: 이미 시트에 있던 행을 id 로 찾아 두었다가
  //   ⓐ 보내지 않은 칸을 지우지 않는 바탕으로 쓰고 ⓑ 담당자 도장을 신규행에만 찍는 데 쓴다.
  var exById_ = {};
  for (var xq = 0; xq < existing.length; xq++) {
    var xqid = String(existing[xq].id || '').trim();
    if (xqid) exById_[xqid] = existing[xq];
  }

  dataArr = dataArr || [];
  opts = opts || {};

  /* 🔴 G10-3A ⓐ 같은 요청 두 번 실행 금지 (재시도·더블클릭이 clearContents 를 반복하던 것) */
  var once_ = saveAllOnce_(type, opts.reqId);
  if (!once_.first) {
    logChange(type, 'saveAllDup', '같은 요청번호 재실행 차단 (' + String(opts.reqId).slice(0, 24) + ')');
    return { count: 0, skippedDuplicate: true, reqId: String(opts.reqId || '') };
  }

  /* 🔴 G10-3A ⓑ 낡은 화면이 최신 시트를 덮지 못하게 — 하나라도 걸리면 전체 중단 */
  var fresh_ = saveAllFreshness_(type, dataArr, exById_, opts);
  if (!fresh_.safe) {
    var forced_ = (opts.force === true && user && user.role === 'admin');
    if (!forced_) {
      try { if (once_.key) CacheService.getScriptCache().remove(once_.key); } catch (e) {}
      logChange(type, 'saveAllBlocked',
        '낡은 화면 감지 — 전체저장 중단. 충돌 ' + fresh_.conflicts.length + '건'
        + ' (시트가 더 최신 ' + fresh_.remoteOnlyNewer + ' · 화면 시각없음 ' + fresh_.missingLocal + ')'
        + ' 첫 건 ' + (fresh_.conflicts[0] ? fresh_.conflicts[0].id : ''));
      var e_ = new Error('STALE_CLIENT: 이 화면보다 시트가 최신입니다 — 전체저장을 중단했습니다 ('
        + fresh_.conflicts.length + '건 충돌). 먼저 [시트에서 불러오기]를 하세요.');
      e_.conflicts = fresh_.conflicts;
      e_.code = 'STALE_CLIENT';
      throw e_;
    }
    logChange(type, 'saveAllForced',
      '대표가 낡은 화면 경고를 무시하고 강제 저장 — 충돌 ' + fresh_.conflicts.length + '건'
      + ' 첫 건 ' + (fresh_.conflicts[0] ? fresh_.conflicts[0].id : ''));
  }

  // 🔴 2026-08-21 삭제 부활 차단: CRM 화면에서 지운 행을 아직 동기화 안 된 옛 기기가
  //   그대로 다시 밀어넣던 경로. 삭제로그(묘비)에 있는 id 는, 삭제 시각 이후에 수정된
  //   행("다시 만든 것")만 살리고 나머지는 버린다. 시트에 실제로 있는 행은 건드리지 않는다
  //   (시트 직접 입력이 항상 이긴다 — 사람이 손으로 되살린 행을 지우면 안 되므로).
  var tombs = getTombstones_(type);
  var skippedDeleted = 0;
  dataArr = dataArr.filter(function (o) {
    var did = String((o || {}).id || '').trim();
    if (!did || !tombs[did]) return true;
    if (tsNum_((o || {}).updatedAt) > tombs[did]) return true;
    skippedDeleted++;
    return false;
  });

  var merged;
  if (type === 'landlords' && user && user.role === 'staff') {
    var mine = [];
    for (var i = 0; i < dataArr.length; i++) {
      var o = dataArr[i] || {};
      var own = String(o.owner || '').trim();
      if (own && own !== user.id) continue;
      o.owner = user.id;
      o.ownerName = user.name;
      mine.push(o);
    }
    merged = existing.filter(function(o) { return String(o.owner || '') !== user.id; }).concat(mine);
  } else {
    var incomingIds = {};
    for (var i = 0; i < dataArr.length; i++) {
      var idv = String((dataArr[i] || {}).id || '').trim();
      if (idv) incomingIds[idv] = true;
    }
    merged = dataArr.slice();
    for (var i = 0; i < existing.length; i++) {
      var eid = String(existing[i].id || '').trim();
      if (eid && incomingIds[eid]) continue;
      merged.push(existing[i]);
    }
    if (type === 'landlords') {
      merged.forEach(function(o) {
        // 🔒 P0-2: 새로 들어온 행에만 기본 담당자를 넣는다.
        //   시트에 이미 있던 4천여 행을 저장 한 번으로 '대표'로 바꾸지 않는다.
        if (!o || o.__sheetOnly || exById_[String(o.id || '').trim()]) return;
        if (!String(o.owner || '').trim()) { o.owner = 'admin'; o.ownerName = '대표'; }
      });
    }
  }
  // 📌 2026-09-10 매물·고객 담당자 — **새로 들어온 행만** 지금 저장하는 사람으로 찍는다.
  //   🔒 P0-2: 시트에 이미 있던 행은 담당자가 비어 있어도 저장 때문에 바뀌지 않는다.
  if ((type === 'listings' || type === 'customers') && user) {
    merged.forEach(function(o) {
      if (!o || o.__sheetOnly || exById_[String(o.id || '').trim()]) return;
      if (!String(o.agent || '').trim()) o.agent = user.id;
    });
  }

  // 이실장 마크 보존 (2026-08-12): isjMark_(exe 등록기록)는 시트 adsFlat에만 남는다.
  // 마크 이후 '시트에서 불러오기'를 안 한 기기가 저장하면 그 기기의 adsFlat(isj 없음)이
  // 시트를 통째로 덮어써 마크가 사라진다 — 당근이 겪은 유형의 사고(당근은 프런트
  // daangnPreSyncFromSheet로 방어, isj는 프런트가 이미 라이브라 서버에서 보존한다).
  // 마크를 해제하려면 시트에서 해당 행 adsFlat의 isj~ 세그먼트를 직접 지울 것.
  if (type === 'listings') {
    // 2026-08-21: isj~ 만 보존하던 것을 외부 프로그램 기록 공통으로 확장.
    //   blog~ 는 블로그 발행기(매물_블로그_생성.py)가 앞으로 남길 발행기록 세그먼트 —
    //   설계서(_통합설계 ④)의 "saveAll 이 blog~ 를 지운다" 함정을 미리 제거해 둔다.
    var KEEP_SEGS = [['isj~', '이실장'], ['blog~', '블로그']];
    var exByIdIsj = {};
    for (var si = 0; si < existing.length; si++) {
      var xid = String(existing[si].id || '').trim();
      if (xid) exByIdIsj[xid] = existing[si];
    }
    merged.forEach(function (o) {
      if (!o || o.__sheetOnly) return;                       // 시트에만 있던 행은 원본 그대로라 손댈 필요 없음
      var ex = exByIdIsj[String(o.id || '').trim()];
      if (!ex) return;
      KEEP_SEGS.forEach(function (ks) {
        var prefix = ks[0], tag = ks[1];
        var exSegs = String(ex.adsFlat || '').split('|').filter(function (s) { return s.indexOf(prefix) === 0; });
        if (!exSegs.length) return;                          // 시트에 해당 마크가 없으면 보존할 것도 없음
        var segs = String(o.adsFlat || '').split('|').filter(Boolean);
        for (var sj = 0; sj < segs.length; sj++) {
          if (segs[sj].indexOf(prefix) === 0) return;        // 들어온 행에 이미 있으면 그대로 둠
        }
        segs.push(exSegs[0]);
        o.adsFlat = segs.join('|');
        var al = String(o.adList || '').split(',').filter(Boolean);
        if (al.indexOf(tag) < 0) al.push(tag);
        o.adList = al.join(',');
      });
    });
  }

  // 중복 제거 (매물만): 주소|상세주소|거래유형 동일 시 완성도 높은 행 유지
  var removedDup = 0;
  if (type === 'listings') {
    var byKey = {};
    var result = [];
    for (var i = 0; i < merged.length; i++) {
      var k = listingKey(merged[i]);
      if (!k) { result.push(merged[i]); continue; }
      if (byKey[k] === undefined) {
        byKey[k] = result.length;
        result.push(merged[i]);
      } else {
        if (rowScore(merged[i], headers) > rowScore(result[byKey[k]], headers)) {
          result[byKey[k]] = merged[i];
        }
        removedDup++;
      }
    }
    merged = result;
  }

  // 🔒 2026-09-10 P0-2: clearContents 는 머리글까지 지운다.
  //   그래서 사장님이 손으로 만든 열(코드가 모르는 칸)은 이름이 사라지고 그 열이 통째로 없어졌다.
  //   지우기 전에 이름을 적어 두었다가 표준 칸 뒤에 되살린다 — 값은 아래 exRow 가 되돌린다.
  var cmPre_ = sheetColMap_(sheet);
  var extraNames_ = [];
  for (var pn = 0; pn < cmPre_.width; pn++) {
    var pnm = cmPre_.names[pn];
    if (pnm && headers.indexOf(pnm) < 0 && extraNames_.indexOf(pnm) < 0) extraNames_.push(pnm);
  }
  var needW_ = headers.length + extraNames_.length;
  if (sheet.getMaxColumns() < needW_) sheet.insertColumnsAfter(sheet.getMaxColumns(), needW_ - sheet.getMaxColumns());
  /* 🔴 G10-3A ⓒ 되돌릴 사본을 먼저 만든다. 사본이 안 만들어지면 덮어쓰지 않는다. */
  var snapName_ = '';
  try { snapName_ = saveAllSnapshot_(sheet, type); }
  catch (eSnap_) {
    try { if (once_.key) CacheService.getScriptCache().remove(once_.key); } catch (e) {}
    logChange(type, 'saveAllAborted', '저장 전 사본 만들기 실패 — 저장 중단: ' + (eSnap_ && eSnap_.message));
    throw new Error('SNAPSHOT_FAILED: 저장 전 사본을 만들지 못해 전체저장을 중단했습니다 ('
      + (eSnap_ && eSnap_.message ? eSnap_.message : '원인 불명') + ')');
  }

  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (extraNames_.length) sheet.getRange(1, headers.length + 1, 1, extraNames_.length).setValues([extraNames_]);
  styleHeader(sheet, headers.length);

  if (merged.length) {
    // 🔀 시트의 실제 칼럼 위치에 맞춰 쓴다 — 사장님이 칼럼을 옮겨도 값이 안 밀린다
    var cmA = sheetColMap_(sheet);
    if (cmA.index['id'] === undefined) throw new Error("시트 머리글에 'id' 칸이 없습니다 — 머리글 이름을 되돌려 주세요");
    var out = merged.map(function(item) {
      var stamp = item.__sheetOnly ? String(item.updatedAt || now) : now;
      // 🔒 2026-09-10 P0-2: 이미 시트에 있던 행이면 그 행을 바탕에 깐다 —
      //   옛 기기가 모르는 새 칸(임대인 역할·재확인일 등)이 빈칸으로 지워지던 경로를 막는다.
      var exRow = exById_[String(item.id || '').trim()];
      var row = [];
      for (var i = 0; i < cmA.width; i++) row.push('');
      if (exRow) {
        for (var ib = 0; ib < cmA.width; ib++) {
          var nmb = cmA.names[ib];
          if (nmb && exRow[nmb] !== undefined) row[ib] = cellVal_(exRow[nmb]);
        }
      }
      for (var h = 0; h < headers.length; h++) {
        var name = headers[h], c = cmA.index[name];
        if (c === undefined) continue;
        if (name === 'updatedAt') { row[c] = stamp; continue; }
        var vv = item[name];
        if (exRow && (vv === undefined || vv === null)) continue;   // 안 보낸 칸 = 그대로 둔다
        row[c] = cellVal_(vv);
      }
      // 시트에만 있는 칸(코드가 모르는 열)도 읽어 둔 값을 그대로 되돌려 놓는다
      for (var k = 0; k < cmA.width; k++) {
        var nm = cmA.names[k];
        if (!nm || headers.indexOf(nm) >= 0) continue;
        if (item[nm] !== undefined) row[k] = cellVal_(item[nm]);
      }
      return row;
    });
    sheet.getRange(2, 1, out.length, cmA.width).setNumberFormat('@'); // 시트의 날짜 자동 변환 방지
    sheet.getRange(2, 1, out.length, cmA.width).setValues(out);
  }
  logChange(type, 'saveAll', merged.length + '건 저장'
    + (snapName_ ? ', 사본 ' + snapName_ : '')
    + (removedDup ? ', 중복 ' + removedDup + '건 제거' : '')
    + (skippedDeleted ? ', 삭제된 id ' + skippedDeleted + '건 재업로드 차단' : ''));
  if (type === 'listings') applyListingSheetUx(sheet);
  return { count: merged.length, removedDup: removedDup, skippedDeleted: skippedDeleted,
           snapshot: snapName_, reqId: String(opts.reqId || '') };
}

// 매물 중복 판정 키
// 🔴 2026-08-14 수정: 종전 키에 매물번호(id)가 없어서, 매물번호가 서로 다른 별개 매물이라도
//    주소·상세주소·거래유형이 같으면 저장할 때마다 한 건만 남고 나머지가 조용히 삭제됐다.
//    특히 엑셀 업로드 매물은 addr·addr2 가 비어 있어 키가 'APT:건물명||거래유형' 이 되므로
//    같은 건물 여러 호실이 첫 저장에서 한 건으로 뭉개졌다(사용자 알림도 없음).
//    → 매물번호가 있으면 그것만으로 판정한다. 주소가 겹치는 건 삭제하지 말고
//      markDuplicateListings 의 연빨강 표시로만 알린다.
function listingKey(o) {
  var id = String(o.id || '').trim();
  if (id) return 'ID:' + id;
  var a  = String(o.addr  || '').replace(/\s+/g, '');
  var a2 = String(o.addr2 || '').replace(/\s+/g, '');
  var ap = String(o.apt   || '').replace(/\s+/g, '');
  var t  = String(o.type  || '');
  if (!a && !ap) return '';
  return (a || 'APT:' + ap) + '|' + a2 + '|' + t;
}

// 행 완성도: 채워진 칸 수 (updatedAt 제외)
function rowScore(o, headers) {
  var s = 0;
  for (var i = 0; i < headers.length; i++) {
    var h = headers[i];
    if (h === 'updatedAt') continue;
    var v = o[h];
    if (String(v === undefined || v === null ? '' : v).trim() !== '') s++;
  }
  return s;
}

// 시트 사용성: 드롭다운(데이터 검증) + 매물설명 한 줄 표시 + 행 높이 고정
/**
 * 시트 칼럼을 이름으로 찾아 원하는 자리로 옮긴다 (2026-08-30, 사장님 요청)
 *   "접수·임대중 적는 칸이 너무 뒤에 있어 확인이 힘들다"
 *
 * 🔴 화면에서 직접 옮기려면 **필터를 먼저 꺼야 한다** — 구글시트는 필터가 걸려 있으면
 *    열 삽입·이동을 막는다(사장님이 "잘라내기·왼쪽에 1열 삽입이 안 된다"고 한 게 이것).
 *    여기서는 필터를 잠시 걷고, 옮기고, 다시 걸어 준다.
 * 🔴 쓰기가 이름 기준이라(2026-08-30) 옮겨도 값이 밀리지 않는다. 그 전이었다면 사고였다.
 *
 * @param type    'listings' 등
 * @param name    옮길 칼럼의 머리글 이름 (예: 'status')
 * @param toPos   1부터 세는 목표 위치 (예: 2 = 두 번째 칸)
 * @param dry     true 면 옮기지 않고 계획만 돌려준다
 */
/**
 * 🆘 백업에서 탭 하나를 되살린다 (2026-09-02 긴급)
 *   자동백업('05_자동백업' 폴더의 브리즈CRM_백업_YYYY-MM-DD)에서 같은 이름 탭을 찾아
 *   값을 그대로 덮어쓴다. **머리글부터 통째로** 가져오므로 칼럼 순서도 백업 시점으로 돌아간다.
 *   dry=1 이면 몇 행을 되살릴지만 알려주고 시트를 만지지 않는다.
 *   🔴 지금 시트에 있는 내용은 사라진다 — 되살리기 전에 현재 상태를 먼저 백업한다.
 */
/** 🔎 백업 파일 안을 들여다본다 — 되살리기 전에 진짜 데이터가 있는지 확인용 (2026-09-02) */
function backupPeek_(tabName, dateStr) {
  var folder = driveFolder_(BACKUP_FOLDER);
  var out = [], it = folder.getFiles();
  var names = [];
  while (it.hasNext()) { var f = it.next(); if (f.getName().indexOf(BACKUP_PREFIX) === 0) names.push({ n: f.getName(), id: f.getId() }); }
  names.sort(function (a, b) { return a.n < b.n ? 1 : -1; });
  var want = dateStr ? names.filter(function (x) { return x.n === BACKUP_PREFIX + dateStr; }) : names.slice(0, 6);
  for (var i = 0; i < want.length; i++) {
    try {
      var sh = SpreadsheetApp.openById(want[i].id).getSheetByName(tabName);
      if (!sh) { out.push({ backup: want[i].n, error: '탭 없음' }); continue; }
      var lr = sh.getLastRow(), lc = sh.getLastColumn();
      var real = 0, sample = '';
      if (lr > 1 && lc > 0) {
        var v = sh.getRange(2, 1, lr - 1, Math.min(lc, 5)).getValues();
        for (var r = 0; r < v.length; r++) if (String(v[r][0] || '').trim()) { real++; if (!sample) sample = v[r].join('|').slice(0, 60); }
      }
      out.push({ backup: want[i].n, lastRow: lr, 내용있는행: real, 표본: sample });
    } catch (e) { out.push({ backup: want[i].n, error: e.message }); }
  }
  return out;
}

/** 🔎 백업에서 특정 칸 값만 id 별로 꺼내온다 — 부분 복구용 (2026-09-02) */
function backupField_(tabName, dateStr, field) {
  var folder = driveFolder_(BACKUP_FOLDER);
  var pick = null, picked = '';
  var it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next(), n = f.getName();
    if (n.indexOf(BACKUP_PREFIX) !== 0) continue;
    if (dateStr) { if (n === BACKUP_PREFIX + dateStr) { pick = f; picked = n; break; } }
    else if (n > picked) { pick = f; picked = n; }
  }
  if (!pick) return { error: '백업을 찾지 못했습니다' };
  var sh = SpreadsheetApp.openById(pick.getId()).getSheetByName(tabName);
  if (!sh) return { error: '탭 없음', backup: picked };
  var lr = sh.getLastRow(), lc = sh.getLastColumn();
  var v = sh.getRange(1, 1, lr, lc).getValues();
  var hs = v[0].map(function (x) { return String(x || '').trim(); });
  var ic = hs.indexOf('id'), fc = hs.indexOf(field);
  if (ic < 0 || fc < 0) return { error: "머리글에 id 또는 '" + field + "' 없음", backup: picked, 머리글: hs.slice(0, 12) };
  var out = {};
  for (var i = 1; i < v.length; i++) {
    var id = String(v[i][ic] || '').trim();
    if (id) out[id] = String(v[i][fc] == null ? '' : v[i][fc]);
  }
  return { backup: picked, field: field, values: out };
}

function restoreTabFromBackup(tabName, dateStr, dry) {
  var name = String(tabName || '').trim();
  if (!name) return { error: '탭 이름이 필요합니다' };
  var folder = driveFolder_(BACKUP_FOLDER);
  var want = BACKUP_PREFIX + String(dateStr || '').trim();
  var pick = null, picked = '';
  var it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next(), n = f.getName();
    if (n.indexOf(BACKUP_PREFIX) !== 0) continue;
    if (dateStr) { if (n === want) { pick = f; picked = n; break; } }
    else if (n > picked) { pick = f; picked = n; }          // 날짜를 안 주면 가장 최근 것
  }
  if (!pick) return { error: '백업 파일을 찾지 못했습니다' + (dateStr ? ' (' + want + ')' : '') };

  var srcSheet = SpreadsheetApp.openById(pick.getId()).getSheetByName(name);
  if (!srcSheet) return { error: "백업에 '" + name + "' 탭이 없습니다", backup: picked };
  var lastR = srcSheet.getLastRow(), lastC = srcSheet.getLastColumn();
  if (lastR < 1 || lastC < 1) return { error: '백업 탭이 비어 있습니다', backup: picked };
  var vals = srcSheet.getRange(1, 1, lastR, lastC).getValues();

  var ss = SpreadsheetApp.openById(SHEET_ID);
  var dst = ss.getSheetByName(name);
  var nowRows = dst ? Math.max(dst.getLastRow() - 1, 0) : 0;
  if (dry) return { dry: true, backup: picked, 되살릴행: lastR - 1, 지금행: nowRows, 칸: lastC };

  if (!dst) dst = ss.insertSheet(name);
  // 먼저 지금 상태를 따로 남긴다 — 되살리기가 잘못돼도 되돌릴 수 있게
  var keep = null;
  try {
    if (dst.getLastRow() >= 1 && dst.getLastColumn() >= 1) {
      keep = name + '_되살리기전_' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'MMdd_HHmm');
      dst.copyTo(ss).setName(keep);
    }
  } catch (e) {}

  var f2 = dst.getFilter();
  if (f2) f2.remove();                                       // 필터가 있으면 쓰기가 막힌다
  if (dst.getMaxRows() < lastR) dst.insertRowsAfter(dst.getMaxRows(), lastR - dst.getMaxRows());
  if (dst.getMaxColumns() < lastC) dst.insertColumnsAfter(dst.getMaxColumns(), lastC - dst.getMaxColumns());
  /* 🔴 2026-09-02 진범 — 데이터 확인 규칙(드롭다운)이 쓰기를 통째로 거부한다.
     status 를 B열로 옮기면 applyListingSheetUx 가 B열에 '접수/상담중/…' 만 허용하는
     **엄격한** 규칙을 건다(setAllowInvalid(false)). 그 상태에서 백업(옛 칼럼 순서)을
     되살리면 B열에 주소가 들어가 규칙 위반 → **setValues 전체가 거부**된다.
     그런데 flush() 를 안 하면 그 오류가 조용히 묻혀 "42행 복구 완료"로 보였다.
     → 되살리기 전에 규칙을 먼저 걷는다. 규칙은 다음 시트 접근 때 자동으로 다시 걸린다. */
  dst.getRange(1, 1, dst.getMaxRows(), dst.getMaxColumns()).clearDataValidations();
  dst.clear({ contentsOnly: true });
  dst.getRange(1, 1, lastR, lastC).setNumberFormat('@');
  dst.getRange(1, 1, lastR, lastC).setValues(vals);
  SpreadsheetApp.flush();
  // 쓴 직후 같은 실행 안에서 다시 읽어 본다 — '썼다는데 없다'를 가리기 위한 실측
  var chk = SpreadsheetApp.openById(SHEET_ID).getSheetByName(name);
  var after = { lastRow: chk.getLastRow(), lastCol: chk.getLastColumn() };
  try { after.행2 = chk.getRange(2, 1, 1, 5).getValues()[0].join('|').slice(0, 60); } catch (e) { after.행2 = 'ERR ' + e.message; }
  logChange('listings', 'restore', name + ' ← ' + picked + ' (' + (lastR - 1) + '행)');
  return { restored: lastR - 1, backup: picked, 이전상태보관: keep, 칸: lastC, 쓴직후: after };
}

/**
 * 칼럼 너비를 내용에 맞춘다 (2026-09-02, 사장님 요청)
 *   구글시트의 '열 너비 자동 맞춤'과 같되, **너무 넓어지지 않게 상한**을 둔다.
 *   desc(광고문구)·note 처럼 긴 글이 든 칸은 자동맞춤하면 화면을 다 잡아먹는다.
 *   \u26a0 너비는 값에 영향을 주지 않는다 — 보기 설정일 뿐이라 되돌리기 위험이 없다.
 */
var FIT_MIN = 62, FIT_MAX = 200;
function fitSheetColumns(type) {
  var sheet = getOrCreateSheet(type);
  var last = sheet.getLastColumn();
  if (last < 1) return { error: '칸이 없습니다' };
  sheet.autoResizeColumns(1, last);
  SpreadsheetApp.flush();
  var names = sheet.getRange(1, 1, 1, last).getValues()[0];
  var wide = [], narrow = [];
  for (var c = 1; c <= last; c++) {
    var w = sheet.getColumnWidth(c);
    if (w > FIT_MAX) { sheet.setColumnWidth(c, FIT_MAX); wide.push(String(names[c - 1] || c)); }
    else if (w < FIT_MIN) { sheet.setColumnWidth(c, FIT_MIN); narrow.push(String(names[c - 1] || c)); }
  }
  SpreadsheetApp.flush();
  logChange(type, 'fitColumns', last + '칸 너비 자동 맞춤');
  return { 칸: last, 너무넓어_줄인칸: wide, 너무좁아_늘린칸: narrow, 상한: FIT_MAX, 하한: FIT_MIN };
}

/* ───────── 🛡 매물 소실 감시 (2026-09-02) ─────────────────────────────────
   왜 만들었나
     2026-09-02 매물 40건이 두 번 사라졌다. 둘 다 **기록 한 줄 없이** 사라졌고,
     자동백업이 하루 한 번(새벽 3시)뿐이라 그 사이에 넣은 것은 되살릴 수 없었다
     (에코아바 4건 소실). 사람이 알아채기 전까지 몇 시간이 지났다.

   무엇을 하나 — 10분마다(smsQueueSweep 에 편승)
     ① 매물관리 행 수를 센다
     ② 지난번보다 크게 줄지 않았으면 → 값을 통째로 '_매물스냅샷' 탭에 떠 둔다(최신 1벌)
     ③ 크게 줄었으면 → **스냅샷을 덮지 않고** 기록을 남기고 사장님께 문자로 알린다
   그래서 최악의 경우에도 **잃는 것은 10분치**이고, 되돌릴 사본이 항상 있다.
   되돌리기: action=restoreSnapshot (스냅샷 → 매물관리)
   ⚠ 스냅샷 탭은 지우지 말 것. 지워도 다음 10분에 다시 생기지만 그 사이가 무방비가 된다.
--------------------------------------------------------------------------- */
var GUARD_SNAP = '_매물스냅샷';
var GUARD_ROWS_KEY = 'GUARD_LAST_ROWS';
var GUARD_ALERT_KEY = 'GUARD_LAST_ALERT';
var GUARD_DROP_PCT = 0.7;       // 지난번의 70% 미만으로 줄면 '이상'으로 본다
var GUARD_ALERT_GAP_MIN = 60;   // 같은 경고를 1시간에 한 번만 보낸다

/** 매물관리에서 id 가 들어 있는 실제 행 수 */
function guardCount_(sh) {
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var cm = sheetColMap_(sh);
  var idc = cm.index['id'];
  if (idc === undefined) return -1;                       // 머리글이 깨진 상태 — 판단 불가
  var v = sh.getRange(2, idc + 1, last - 1, 1).getValues();
  var n = 0;
  for (var i = 0; i < v.length; i++) if (String(v[i][0] || '').trim()) n++;
  return n;
}

function listingsGuard_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(SHEETS.listings);
  if (!sh) return { skip: '매물관리 탭 없음' };
  var now = guardCount_(sh);
  if (now < 0) return { skip: '머리글에 id 가 없어 판단하지 않음' };

  var props = PropertiesService.getScriptProperties();
  var prev = parseInt(props.getProperty(GUARD_ROWS_KEY), 10);
  if (isNaN(prev)) prev = 0;

  // 크게 줄었으면 스냅샷을 지키고 알린다
  if (prev > 0 && now < Math.floor(prev * GUARD_DROP_PCT)) {
    var lastAlert = Number(props.getProperty(GUARD_ALERT_KEY) || 0);
    var quiet = (new Date().getTime() - lastAlert) < GUARD_ALERT_GAP_MIN * 60000;
    logChange('listings', 'guard', '🔴 매물이 ' + prev + '건 → ' + now + '건으로 줄었습니다 (스냅샷 보존)');
    if (!quiet) {
      props.setProperty(GUARD_ALERT_KEY, String(new Date().getTime()));
      try {
        var to = props.getProperty('OWNER_PHONE') || props.getProperty('SENDER_PHONE');
        if (to) smsSendMany([{ to: to, text: '[CRM] 매물이 ' + prev + '건에서 ' + now + '건으로 줄었습니다. 시트를 확인하세요. 되돌리려면 클로드에게 알려주세요.' }]);
      } catch (e) {}
    }
    return { alert: true, prev: prev, now: now, 스냅샷보존: true };
  }

  // 정상이면 스냅샷을 새로 뜬다
  var snap = ss.getSheetByName(GUARD_SNAP);
  if (!snap) { snap = ss.insertSheet(GUARD_SNAP); snap.hideSheet(); }
  var lr = sh.getLastRow(), lc = sh.getLastColumn();
  if (lr >= 1 && lc >= 1) {
    if (snap.getMaxRows() < lr) snap.insertRowsAfter(snap.getMaxRows(), lr - snap.getMaxRows());
    if (snap.getMaxColumns() < lc) snap.insertColumnsAfter(snap.getMaxColumns(), lc - snap.getMaxColumns());
    snap.clear({ contentsOnly: true });
    snap.getRange(1, 1, lr, lc).setNumberFormat('@');
    snap.getRange(1, 1, lr, lc).setValues(sh.getRange(1, 1, lr, lc).getValues());
  }
  props.setProperty(GUARD_ROWS_KEY, String(now));
  return { ok: true, rows: now, snapshot: GUARD_SNAP };
}

/** 스냅샷(최대 10분 전)에서 매물관리를 되돌린다 */
function restoreFromSnapshot() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var snap = ss.getSheetByName(GUARD_SNAP);
  if (!snap) return { error: '스냅샷이 아직 없습니다' };
  var sh = ss.getSheetByName(SHEETS.listings);
  var lr = snap.getLastRow(), lc = snap.getLastColumn();
  if (lr < 2) return { error: '스냅샷이 비어 있습니다' };
  var keep = SHEETS.listings + '_되돌리기전_' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'MMdd_HHmm');
  sh.copyTo(ss).setName(keep);
  var f = sh.getFilter(); if (f) f.remove();
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).clearDataValidations();
  if (sh.getMaxRows() < lr) sh.insertRowsAfter(sh.getMaxRows(), lr - sh.getMaxRows());
  sh.clear({ contentsOnly: true });
  sh.getRange(1, 1, lr, lc).setNumberFormat('@');
  sh.getRange(1, 1, lr, lc).setValues(snap.getRange(1, 1, lr, lc).getValues());
  SpreadsheetApp.flush();
  PropertiesService.getScriptProperties().setProperty(GUARD_ROWS_KEY, String(guardCount_(sh)));
  logChange('listings', 'restoreSnapshot', (lr - 1) + '행 되돌림');
  return { restored: lr - 1, 이전상태보관: keep };
}

function moveSheetColumn(type, name, toPos, dry) {
  var sheet = getOrCreateSheet(type);
  var cm = sheetColMap_(sheet);
  var from = cm.index[String(name || '').trim()];
  if (from === undefined) return { error: "'" + name + "' 칸을 시트에서 못 찾았습니다", 머리글: cm.names };
  var to = parseInt(toPos, 10);
  if (isNaN(to) || to < 1 || to > cm.width) return { error: '목표 위치가 1~' + cm.width + ' 범위를 벗어났습니다' };
  var fromPos = from + 1;
  if (fromPos === to) return { moved: false, reason: '이미 그 자리입니다', at: to };

  // 옮기기 전 상태를 센다 — 끝나고 대조해서 한 줄이라도 줄면 되돌린다
  var before = { rows: Math.max(sheet.getLastRow() - 1, 0), cols: sheet.getLastColumn() };
  if (dry) return { name: name, from: fromPos, to: to, dry: true, 현재: before, 현재순서: cm.names.slice(0, 12) };

  var ss = SpreadsheetApp.openById(SHEET_ID);
  // 🔴 되돌릴 사본을 먼저 만든다 (2026-09-02 사고 교훈 — 되돌릴 게 없어서 일이 커졌다)
  var keep = sheet.getName() + '_이동전_' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'MMdd_HHmm');
  sheet.copyTo(ss).setName(keep);

  var f = sheet.getFilter();
  var hadFilter = false;
  if (f) { f.remove(); hadFilter = true; }
  /* 🔴 데이터 확인 규칙(드롭다운)을 먼저 걷는다.
     안 걷으면 '접수/임대중만 허용' 규칙이 옮긴 자리에 그대로 남아,
     다른 값이 들어오는 순간 **그 시트에 대한 쓰기가 통째로 거부**된다.
     이것이 2026-09-02 매물 40건이 사라진 진짜 원인이었다. 옮긴 뒤 다시 걸어 준다. */
  sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).clearDataValidations();

  var err = '';
  try {
    var dest = (to > fromPos) ? to + 1 : to;
    sheet.moveColumns(sheet.getRange(1, fromPos, sheet.getMaxRows(), 1), dest);
    SpreadsheetApp.flush();                       // 오류가 조용히 묻히지 않게 즉시 반영
  } catch (e) { err = String(e && e.message || e); }

  var after = { rows: Math.max(sheet.getLastRow() - 1, 0), cols: sheet.getLastColumn() };
  var lost = (!err) && (after.rows < before.rows);

  if (err || lost) {
    // 되돌린다 — 사본에서 값을 그대로 복원
    try {
      var src = ss.getSheetByName(keep);
      var lr = src.getLastRow(), lc = src.getLastColumn();
      sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).clearDataValidations();
      sheet.clear({ contentsOnly: true });
      sheet.getRange(1, 1, lr, lc).setValues(src.getRange(1, 1, lr, lc).getValues());
      SpreadsheetApp.flush();
    } catch (e2) { err = (err || '') + ' / 되돌리기 실패: ' + e2.message; }
    return { moved: false, error: err || ('행이 ' + before.rows + '→' + after.rows + ' 로 줄어 되돌렸습니다'),
             되돌림: true, 사본: keep };
  }

  // 드롭다운·행높이를 새 자리 기준으로 다시 건다
  try { if (type === 'listings') applyListingSheetUx(sheet); } catch (e3) {}
  if (hadFilter) {
    try { sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getLastColumn()).createFilter(); } catch (e4) {}
  }
  SpreadsheetApp.flush();

  var fin = sheetColMap_(sheet);
  var res = { moved: true, name: name, from: fromPos, to: (fin.index[name] === undefined ? -1 : fin.index[name] + 1),
              행: before.rows + '→' + Math.max(sheet.getLastRow() - 1, 0), 사본: keep,
              필터복구: hadFilter, 새순서: fin.names.slice(0, 12) };
  logChange(type, 'moveColumn', name + ' ' + fromPos + '→' + to + ' (행 ' + res.행 + ')');
  return res;
}

function applyListingSheetUx(sheet) {
  sheet = sheet || getOrCreateSheet('listings');
  var headers = HEADERS.listings;
  var nRows = Math.max(sheet.getMaxRows() - 1, 1);
  // 🔀 2026-08-30: 시트 칼럼을 옮겨도 되도록 **시트의 실제 머리글 위치**를 쓴다(HEADERS 순서 아님)
  //   이걸 안 고치면 status 를 앞으로 옮긴 순간 '접수/임대중' 드롭다운이 엉뚱한 칸에 걸린다.
  var cmUx = sheetColMap_(sheet);
  function colIdx(name) { var c = cmUx.index[name]; return c === undefined ? 0 : c + 1; }
  var V = {
    type: ['매매','전세','월세','연세','단기'],
    kind: ['오픈형 원룸','분리형 원룸','빌라(투룸 이상)','아파트','오피스텔','주택','상가','사무실','건물','공장/창고','토지'],
    direction: ['남향','동향','서향','북향','남동향','남서향','북동향','북서향'],
    feeType: ['정액 관리비','기타 부과','확인 불가'],
    feeBasis: ['직전 월','최근 3개월 평균','최근 1년 평균','기타'],
    feeEvidence: ['세대별 사용량에 따라 부과','관리규약에 따라 부과','전체 사용량을 세대수로 나누어 부과'],
    feeNote: ['단독주택','오피스텔 제외 상가 건물','미등기/신축건물'],
    parking: ['가능','불가능','확인필요'],
    pets: ['가능','불가능','확인필요'],
    loan: ['있음','없음','확인필요'],
    jimok: ['전','답','대','임야','과수원','잡종지','목장용지','광천지','염전','공장용지','창고용지','기타'],
    zone: ['도시지역','관리지역','농림지역','자연환경보전지역'],
    // options 는 쉼표로 여러 개를 적는 칸이라 목록 검사를 걸면 전부 '붉은 꺾쇠' 경고가 뜬다
    //   → 유효성검사에서 제외 (2026-08-14). 허용값 안내는 매물 등록 화면 쪽에 있음
    // 🔴 2026-08-27 사장님 지시: '공실' 폐지 — '접수'로 통일했다. 두 상태는 홈페이지 노출·
    //   광고 대상·공실대조 취급이 완전히 같았고 차이는 뱃지 색과 정렬뿐이었다.
    //   목록에서 뺄 뿐 아니라 **시트에 손으로 적는 것도 막는다**(아래 STRICT 참조).
    status: ['접수','상담중','계약완료','임대중','거래완료','보류'],
    // 🌐 홈페이지 노출. 빈 칸도 '노출'로 친다 — 그래서 목록에 빈 값을 넣지 않고 허용만 한다.
    web: ['노출','숨김']
  };
  // 상태 칸만 목록 밖 값을 거부한다 — 나머지는 옵션 복수선택(쉼표 나열) 때문에 허용이어야 한다.
  //   ⚠ 유효성검사는 사람이 시트에 직접 칠 때만 막는다(API setValue 는 통과) — 승격·동기화는 무사.
  var STRICT = { status: true };   // web 은 빈 칸(=노출)을 허용해야 하므로 엄격검사 대상이 아니다
  for (var key in V) {
    var c = colIdx(key);
    if (c > 0) {
      var rule = SpreadsheetApp.newDataValidation()
        .requireValueInList(V[key], true)
        .setAllowInvalid(!STRICT[key])
        .build();
      sheet.getRange(2, c, nRows, 1).setDataValidation(rule);
    }
  }
  var dc = colIdx('desc');
  if (dc > 0) {
    sheet.getRange(1, dc, nRows + 1, 1).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
    sheet.setColumnWidth(dc, 220);
  }
  var nc = colIdx('note');
  if (nc > 0) sheet.getRange(1, nc, nRows + 1, 1).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
  // 🔴 2026-08-27: 종전에는 마지막 데이터 행(getLastRow)까지만 높이를 눌렀다. 그래서
  //   upsert 의 appendRow 로 새로 붙은 행은 기본 높이 그대로라 시트 행 높이가 제각각이 됐다
  //   (번호 통일 12건을 붙인 직후 사장님이 발견). 시트 전체 행에 걸어 새 행도 처음부터 21로.
  var mr = sheet.getMaxRows();
  if (mr > 1) {
    // 개행이 포함된 셀(매물설명)은 일반 setRowHeights로 눌리지 않아 강제 고정 사용
    if (sheet.setRowHeightsForced) sheet.setRowHeightsForced(2, mr - 1, 21);
    else sheet.setRowHeights(2, mr - 1, 21);
  }
  colorDaangnRequiredHeaders(sheet);
  markDuplicateListings(sheet);
}

// 시트 자체 중복 정리 (enrich 마지막에 호출)
function dedupeListingsSheet() {
  var sheet = getOrCreateSheet('listings');
  var rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return 0;
  var hs = rows[0].map(String);
  var objs = [];
  for (var i = 1; i < rows.length; i++) {
    var o = {};
    var empty = true;
    for (var c = 0; c < hs.length; c++) {
      var v = rows[i][c];
      o[hs[c]] = fmtCell(v);
      if (String(v === undefined || v === null ? '' : v).trim() !== '') empty = false;
    }
    if (!empty) objs.push(o);
  }
  var byKey = {}, result = [], removed = 0;
  for (var i = 0; i < objs.length; i++) {
    var k = listingKey(objs[i]);
    if (!k) { result.push(objs[i]); continue; }
    if (byKey[k] === undefined) { byKey[k] = result.length; result.push(objs[i]); }
    else {
      if (rowScore(objs[i], hs) > rowScore(result[byKey[k]], hs)) result[byKey[k]] = objs[i];
      removed++;
    }
  }
  if (!removed) return 0;
  sheet.clearContents();
  sheet.getRange(1, 1, 1, hs.length).setValues([hs]);
  styleHeader(sheet, hs.length);
  colorDaangnRequiredHeaders(sheet);
  if (result.length) {
    var out = result.map(function(o) { return hs.map(function(h) { return o[h] || ''; }); });
    sheet.getRange(2, 1, out.length, hs.length).setNumberFormat('@'); // 시트의 날짜 자동 변환 방지
    sheet.getRange(2, 1, out.length, hs.length).setValues(out);
  }
  logChange('listings', 'dedupe', removed + '건 제거');
  return removed;
}

/* ───────── 🔀 시트 칼럼 순서 자유화 (2026-08-30) ───────────────────────────
   사장님 "접수·임대중 적는 칸이 너무 뒤에 있어 확인이 힘들다. 옮겨도 되나?"

   \U0001F534 종전에는 **옮기면 안 됐다.** 읽기는 머리글 이름으로 찾는데(순서 무관),
      쓰기는 코드 안 HEADERS 순서대로 1열부터 덮어썼다. 그래서 칼럼을 옮기면
        · id 를 엉뚱한 칸에서 찾아 기존 행을 못 찾고 **새 행으로 추가**하고
        · 저장할 때 **모든 값이 밀려 들어갔다**(saveAll 은 전체 행을 그렇게 덮어썼다).
      실제로 08-30 아침 'web' 칼럼을 중간에 넣었다가 사진 주소 칸을 덮을 뻔했다.

   이제 쓰기도 **시트의 실제 머리글 이름**을 보고 그 칸에 넣는다. 그래서
     ✅ 사장님이 칼럼을 마음대로 옮겨도 된다(머리글 글자만 그대로 두면 된다)
     ✅ 시트에만 있고 코드에 없는 칸(손으로 만든 메모 열 등)은 **건드리지 않는다**
   \u26a0 머리글 **이름을 바꾸면** 그 칸은 코드가 못 찾아 값이 안 들어간다. 이름은 그대로 둘 것.
--------------------------------------------------------------------------- */
function sheetColMap_(sheet) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var hs = sheet.getRange(1, 1, 1, lastCol).getValues()[0]
                .map(function (x) { return String(x == null ? '' : x).trim(); });
  var index = {};
  for (var i = 0; i < hs.length; i++) {
    if (hs[i] && index[hs[i]] === undefined) index[hs[i]] = i;   // 먼저 나온 것이 이긴다
  }
  return { names: hs, index: index, width: hs.length };
}

/** 값 하나를 시트에 넣을 형태로 — 기존 규칙 그대로(객체는 JSON, 없으면 빈칸) */
function cellVal_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/**
 * item 을 시트 칼럼 순서에 맞춘 한 행으로 만든다.
 * base 를 주면 그 값을 바탕으로 덮어쓴다 — **코드가 모르는 칸은 그대로 살아남는다.**
 */
function rowForSheet_(cm, headers, item, now, base, keepEmpty) {
  var out = [];
  // 🔴 2026-09-10: 기존 칸을 되쓸 때는 fmtCell 을 쓴다.
  //   시트는 "2019-10-25" 를 날짜(Date)로 바꿔 저장한다. 그걸 cellVal_ 로 되쓰면
  //   JSON.stringify(Date) 가 되어 준공일이 ["2019-10-24T15:00:00.000Z"] 로 망가진다(LIVE 실측).
  for (var i = 0; i < cm.width; i++) out.push(base ? fmtCell(base[i]) : '');
  for (var h = 0; h < headers.length; h++) {
    var name = headers[h];
    var c = cm.index[name];
    if (c === undefined) continue;                    // 시트에 그 칸이 없으면 건너뛴다
    if (name === 'updatedAt') { out[c] = now; continue; }
    var v = (item || {})[name];
    // 🔒 2026-09-10 P0-2: 기존 행을 고칠 때(base 가 있을 때)는
    //   "안 보낸 칸 = 바꾸지 말라는 뜻". 예전에는 undefined 가 빈칸이 되어 기존 값을 지웠다.
    //   (욕실 8건만 채우려던 저장에서 담당자 8칸이 함께 바뀐 사고의 뿌리)
    //   보낸 빈 문자열('')은 그대로 "정말 비우라는 뜻" 으로 남겨 둔다.
    if (base && (v === undefined || v === null)) continue;
    // 담당자 칸처럼 지워지면 그 행을 아무도 못 고치게 되는 칸은 빈값으로도 지우지 않는다
    if (base && keepEmpty && keepEmpty[name]
        && String(v).trim() === '' && String(out[c]).trim() !== '') continue;
    out[c] = cellVal_(v);
  }
  return out;
}

function upsertRow(type, item, user) {
  if (!HEADERS[type]) throw new Error('알 수 없는 type: ' + type);
  // 2026-08-21 삭제 부활 차단(saveAll 과 같은 규칙): 지워진 id 를 옛 기기가 upsert 로
  //   되살리는 것 방지. 삭제 시각 이후에 수정된 행(다시 만든 것)은 통과.
  var tombId = String((item || {}).id || '').trim();
  if (tombId) {
    var tombsU = getTombstones_(type);
    if (tombsU[tombId] && !(tsNum_((item || {}).updatedAt) > tombsU[tombId])) {
      return { id: tombId, action: 'skipped_deleted', error: '삭제된 id — 재업로드 차단(다시 등록하려면 CRM에서 새로 저장)' };
    }
  }
  var sheet   = getOrCreateSheet(type);
  var headers = HEADERS[type];
  var now     = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
  var rows    = sheet.getDataRange().getValues();
  var cm      = sheetColMap_(sheet);                 // 🔀 시트의 실제 칼럼 위치
  var idCol   = cm.index['id'];
  if (idCol === undefined) throw new Error("시트 머리글에 'id' 칸이 없습니다 — 머리글 이름을 되돌려 주세요");
  var target  = -1;

  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][idCol]).trim() === String(item.id).trim()) {
      target = i + 1; break;
    }
  }
  if (type === 'landlords' && user && user.role === 'staff' && target > 0) {
    var ownerCol = cm.index['owner'] === undefined ? -1 : cm.index['owner'];
    if (ownerCol >= 0 && String(rows[target - 1][ownerCol] || '').trim() !== user.id) {
      return { id: item.id, action: 'denied', error: '본인이 등록한 임대인만 수정할 수 있습니다' };
    }
  }

  // 🔒 2026-09-10 P0-2: 담당자 도장은 **새로 만들 때만**.
  //   기존 행을 고칠 때는 담당자가 payload 에 없다는 이유로 지금 로그인한 사람으로 다시 찍지 않는다.
  //   (임대인 owner/ownerName, 매물·고객 agent — 전부 같은 규칙)
  if (target < 0 && user) {
    item = item || {};
    if (type === 'landlords' && user.role === 'staff') {
      item.owner = user.id;
      item.ownerName = user.name;
    }
    if ((type === 'listings' || type === 'customers') && !String(item.agent || '').trim()) {
      item.agent = user.id;
    }
  }

  // 고칠 때는 기존 행을 바탕으로 — 코드가 모르는 칸(손으로 만든 메모 열 등)을 지우지 않는다
  var base = target > 0 ? rows[target - 1] : null;
  var rowData = rowForSheet_(cm, headers, item, now, base,
                             type === 'landlords' ? { owner: 1, ownerName: 1 } : null);
  // 🧩 2026-09-08 서버가 찍는 칸(검수 도장·좌표)은 옛 기기의 전체행 upsert 가 빈칸으로 덮지 못하게 — 기존 값 유지(리뷰 확정)
  if (type === 'listings' && base) {
    var keepCols = ['verified', 'verifiedAt', 'auditNote', 'lat', 'lon'];
    for (var kc = 0; kc < keepCols.length; kc++) {
      var kci = cm.index[keepCols[kc]];
      if (kci === undefined) continue;
      var iv = (item || {})[keepCols[kc]];
      if (iv === undefined || iv === null || String(iv).trim() === '') rowData[kci] = fmtCell(base[kci]);
    }
  }

  if (target > 0) {
    // 🔒 2026-09-10 P0-2: 실제로 바뀐 칸이 하나도 없으면 쓰지 않는다.
    //   그냥 저장만 눌렀는데 updatedAt 이 튀어 "누가 고친 것처럼" 보이던 것을 막는다.
    var same = true;
    for (var q = 0; q < cm.width; q++) {
      if (cm.names[q] === 'updatedAt') continue;
      if (String(rowData[q]) !== fmtCell(base[q])) { same = false; break; }
    }
    if (same) return { id: item.id, action: 'unchanged' };
    try { sheet.getRange(target, 1, 1, cm.width).setNumberFormat('@'); } catch (eF2) {}   // 시트의 날짜 자동 변환 방지(saveAll 과 같은 규칙)
    sheet.getRange(target, 1, 1, cm.width).setValues([rowData]);
    logChange(type, 'update', item.id);
    return { id: item.id, action: 'updated' };
  } else {
    // 새 행도 글자 서식으로 고정해 둔다 — 시트가 "2019-10-25" 를 날짜로 바꾸면
    //   다음 수정 때 그 칸을 보존하다 값이 변형된다. 서식 지정이 안 되더라도 저장은 계속한다.
    try {
      var newRow_ = sheet.getLastRow() + 1;
      if (sheet.getMaxRows() < newRow_) sheet.insertRowsAfter(sheet.getMaxRows(), newRow_ - sheet.getMaxRows());
      sheet.getRange(newRow_, 1, 1, cm.width).setNumberFormat('@');
    } catch (eF) {}
    sheet.appendRow(rowData);
    logChange(type, 'insert', item.id);
    return { id: item.id, action: 'inserted' };
  }
}

// 쓰기 직렬화 (2026-08-21): saveAll(전체 다시쓰기)과 delete/upsert 가 겹치면 삭제가 되살아난다.
function withWriteLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('다른 기기의 저장 작업이 진행 중입니다 — 잠시 후 다시 시도하세요');
  try { return fn(); }
  finally {
    try { SpreadsheetApp.flush(); } catch (e) {}
    lock.releaseLock();
  }
}

// 삭제 기록(묘비) — 옛 localStorage 를 가진 기기가 saveAll/upsert 로 지운 매물을
// 다시 밀어넣는 것을 막는다. 삭제 시각보다 나중에 수정된 행은 "다시 만든 것"으로 보고 살린다.
var TOMBSTONE_SHEET = '삭제로그';
var TOMBSTONE_KEEP_DAYS = 60; // 이보다 오래된 기록은 새 삭제 때 정리(전 기기가 그 안에 한 번은 동기화됨)

function tombstoneSheet_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(TOMBSTONE_SHEET);
  if (!sh) {
    sh = ss.insertSheet(TOMBSTONE_SHEET);
    sh.getRange(1, 1, 1, 3).setValues([['구분', 'id', '삭제시각']]);
    styleHeader(sh, 3);
  }
  return sh;
}

function tsNum_(s) {
  if (s instanceof Date) return s.getTime();
  var str = String(s === undefined || s === null ? '' : s).trim();
  if (!str) return 0;
  var t = new Date(str.replace(' ', 'T')).getTime();
  if (isNaN(t)) t = new Date(str).getTime();
  return isNaN(t) ? 0 : t;
}

function addTombstone_(type, id) {
  try {
    var sh = tombstoneSheet_();
    var now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
    // 오래된 기록 정리(아래에서 위로 지워야 행번호가 안 밀림)
    var rows = sh.getDataRange().getValues();
    var cutoff = Date.now() - TOMBSTONE_KEEP_DAYS * 24 * 3600 * 1000;
    for (var i = rows.length - 1; i >= 1; i--) {
      var t = tsNum_(rows[i][2]);
      if (t && t < cutoff) sh.deleteRow(i + 1);
    }
    sh.appendRow([type, String(id), now]);
  } catch (e) {}
}

function getTombstones_(type) {
  var out = {};
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sh = ss.getSheetByName(TOMBSTONE_SHEET);
    if (!sh) return out;
    var rows = sh.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() !== type) continue;
      var id = String(rows[i][1]).trim();
      var at = tsNum_(rows[i][2]);
      if (!id || !at) continue;
      if (!out[id] || at > out[id]) out[id] = at; // 같은 id 여러 번이면 마지막 삭제 시각
    }
  } catch (e) {}
  return out;
}

// 🔴 2026-08-21 전면 개정 — "성공을 반환하는데 실제론 안 지워지던" 미해결 버그 대응.
//   ① 같은 id 행이 여러 개여도 전부 지운다(중복 행이 한 개만 지워져 남던 경로 차단)
//   ② flush 후 재확인, 남아 있으면 한 번 더 지우고 그래도 남으면 정직하게 실패를 보고한다
//   ③ 삭제를 삭제로그(묘비)에 남겨 옛 기기의 재업로드 부활을 막는다 (saveAll/upsert 가 대조)
//   ④ doPost 쪽 잠금(withWriteLock_)과 함께 saveAll 전체 다시쓰기와의 경합도 차단됨
function deleteRow(type, id, user) {
  if (!HEADERS[type]) throw new Error('알 수 없는 type: ' + type);
  var target = String(id === undefined || id === null ? '' : id).trim();
  if (!target) return { deleted: null, error: '삭제할 id가 비어 있습니다' };
  var sheet  = getOrCreateSheet(type);
  // 🔀 2026-08-30: 시트 칼럼을 옮겨도 되도록 **시트의 실제 머리글 위치**를 쓴다(HEADERS 순서 아님)
  //   🔴 여기가 틀리면 **엉뚱한 행을 지운다.** 못 찾으면 아예 멈춘다.
  var cmDel = sheetColMap_(sheet);
  var idCol  = cmDel.index['id'];
  if (idCol === undefined) return { deleted: null, error: "시트 머리글에 'id' 칸이 없습니다 — 머리글 이름을 되돌려 주세요" };
  var ownerCol = cmDel.index['owner'] === undefined ? -1 : cmDel.index['owner'];
  var removed = 0, denied = false, filterRemoved = false;

  for (var pass = 0; pass < 2; pass++) {
    var rows = sheet.getDataRange().getValues();
    var hit = false;
    for (var i = rows.length - 1; i >= 1; i--) {
      if (String(rows[i][idCol]).trim() !== target) continue;
      if (type === 'landlords' && user && user.role === 'staff' && ownerCol >= 0
          && String(rows[i][ownerCol] || '').trim() !== user.id) { denied = true; continue; }
      // 🔴 2026-08-22 진범 검거: 시트에 기본 필터가 있고 그 필터가 이 행을 숨기고 있으면
      //   deleteRow/deleteRows 가 예외 없이 조용히 무시된다(실측 v37 diagDelete).
      //   "삭제 성공 반환인데 안 지워짐" 몇 주 미스터리의 실제 원인 — 필터를 걷고 지운다.
      try {
        if (sheet.isRowHiddenByFilter(i + 1)) {
          var filt = sheet.getFilter();
          if (filt) { filt.remove(); filterRemoved = true; }
        }
      } catch (e) {}
      sheet.deleteRow(i + 1);
      removed++; hit = true;
    }
    SpreadsheetApp.flush();
    if (!hit) break; // 이번 회전에서 지운 게 없으면 재확인 불필요
  }

  // 반영 확인 — 예전 코드는 여기 없이 성공을 반환해 "안 지워졌는데 지워진 줄" 알았다
  var left = 0;
  var chk = sheet.getDataRange().getValues();
  for (var j = 1; j < chk.length; j++) {
    if (String(chk[j][idCol]).trim() === target) left++;
  }

  if (denied && removed === 0) {
    return { deleted: null, error: '본인이 등록한 임대인만 삭제할 수 있습니다' };
  }
  if (left > 0) {
    logChange(type, 'delete-failed', target + ' (' + left + '행 잔존)');
    return { deleted: null, error: '삭제가 시트에 반영되지 않았습니다(' + left + '행 잔존) — 구글 시트에서 직접 행을 삭제해 주세요' };
  }
  if (!denied) addTombstone_(type, target); // 시트에 없던 id 라도 기록 — 옛 기기 재업로드 차단
  logChange(type, 'delete', target + (removed ? ' (' + removed + '행)' : ' (시트엔 이미 없음, 삭제로그만 기록)')
    + (filterRemoved ? ' · 숨김필터 해제' : ''));
  var res = { deleted: target, removed: removed };
  if (filterRemoved) res.note = '이 행을 숨기던 시트 필터를 해제하고 지웠습니다(필터가 있으면 삭제가 무시되는 구글시트 특성)';
  return res;
}

function syncAll(payload) {
  var results = {};
  ['listings', 'customers', 'contracts'].forEach(function(type) {
    if (payload && payload[type]) {
      results[type] = saveAll(type, payload[type]);
    }
  });
  return results;
}

// ══════════════════════════════════════════
// 건축물대장 조회 (국토부 BldRgstHubService)
// 표제부 → 총층·사용승인일 / 전유부 → 해당층·전용면적 (동·호 매칭)
// ══════════════════════════════════════════

// 🔴 2026-08-14 추가: 같은 건물(지번)을 매물 행마다 처음부터 다시 받아오던 것을 1회로 줄인다.
//
//   문제였던 것 — API 는 한 번에 100건만 준다. 에코드파리(연동 260-15)는 전유공용 기록이
//   3,793건이라 38페이지, 페이지당 약 1.2초 → **매물 1건 보강에 대장 조회만 약 46초**.
//   시트에 같은 건물 매물이 20행이면 15분이 넘는데 **Apps Script 실행 제한은 6분**이라,
//   앞쪽 행만 채워지고 뒤쪽 행은 손도 못 댄 채 중단됐다.
//   (증상: 같은 건물인데 어떤 호수는 면적·층이 들어오고 어떤 호수는 빈칸)
//
//   지번이 같으면 응답도 같으므로 실행 1회 동안 메모리에 들고 재사용한다.
//   호수 매칭은 캐시된 목록에서 행마다 따로 하므로 결과는 종전과 동일하다.
//   ⚠ CacheService 는 키당 100KB 제한이라 3,793건을 못 담는다 — 실행 내 메모리 캐시가 맞다.
var BLDG_ITEM_CACHE = {};

function bldgCachedFetch_(cacheKey, op, baseQs) {
  var k = op + '@' + cacheKey;
  if (Object.prototype.hasOwnProperty.call(BLDG_ITEM_CACHE, k)) return BLDG_ITEM_CACHE[k];
  // 🧩 2026-09-08: 실행이 끝나도 남는 1일 캐시(CacheService 6h + 시트 '대장캐시' 24h) — 같은 지번을 하루 한 번만 API 에 묻는다
  var dc = bldgDayCacheGet_(k);
  if (dc) { BLDG_ITEM_CACHE[k] = dc; return dc; }
  var v = datagoFetch(op, baseQs);
  BLDG_ITEM_CACHE[k] = v;   // 실패(null)도 담는다 — 같은 건물을 행마다 3회씩 재시도하면 또 시간이 넘는다
  if (v && v.length) bldgDayCacheSet_(k, op, v);
  return v;
}

function bldgLookup(p) {
  if (!BLDG_API_KEY) {
    throw new Error('건축물대장 API 키가 없습니다 — 편집기 ⚙️ 프로젝트 설정 → 스크립트 속성에 BLDG_API_KEY 를 등록하세요');
  }
  // Encoding 키(%포함)는 그대로, Decoding 키는 인코딩해서 사용
  var keyParam = BLDG_API_KEY.indexOf('%') >= 0 ? BLDG_API_KEY : encodeURIComponent(BLDG_API_KEY);
  var baseQs = 'serviceKey=' + keyParam
    + '&sigunguCd=' + p.sigunguCd + '&bjdongCd=' + p.bjdongCd
    + '&platGbCd=' + (p.platGbCd || '0')
    + '&bun=' + pad4(p.bun) + '&ji=' + pad4(p.ji || '0')
    + '&numOfRows=100&_type=json';

  var out = { totalFloor: '', aprDate: '', floor: '', area: '', bldNm: '', use: '' };
  // 지번이 같으면 응답도 같다 — 이 키로 실행 내 캐시를 쓴다 (호수는 캐시 목록에서 행마다 매칭)
  var cacheKey = p.sigunguCd + '|' + p.bjdongCd + '|' + (p.platGbCd || '0')
    + '|' + pad4(p.bun) + '|' + pad4(p.ji || '0');

  // 표제부: 총층·사용승인일 (필지에 여러 동이면 dong으로 매칭, 없으면 첫 동)
  var titleItems = bldgCachedFetch_(cacheKey, 'getBrTitleInfo', baseQs);
  if (titleItems && titleItems.length) {
    var t = titleItems[0];
    var dongDigits = String(p.dong || '').replace(/\D/g, '');
    if (dongDigits) {
      for (var i = 0; i < titleItems.length; i++) {
        var dn = String(titleItems[i].dongNm || '').replace(/\D/g, '');
        if (dn && dn === dongDigits) { t = titleItems[i]; break; }
      }
    }
    // 🔴 여러 동짜리 단지인데 동 표기가 없으면 어느 동인지 알 수 없다 (2026-08-14)
    //    이때 첫 동의 값으로 "정정"하면 맞는 값을 오염시킨다 — 실제로 일도삼주아파트 505호가
    //    총층 15층→6층으로 덮일 뻔했다(시험에서 적발). 모호하면 빈 칸만 채우게 표시한다.
    //    단, 모든 동의 값이 같은 항목은 모호하지 않다 — 제원아파트(가~사동 전부 5층·같은 승인일)
    //    같은 옛 단지는 동을 몰라도 총층·승인일을 확정할 수 있다 (2026-08-14 2차 보강).
    if (titleItems.length > 1 && !dongDigits) {
      var fSet = {}, aSet = {};
      for (var ci = 0; ci < titleItems.length; ci++) {
        fSet[String(titleItems[ci].grndFlrCnt || '')] = 1;
        aSet[String(titleItems[ci].useAprDay || '')] = 1;
      }
      out.ambigFloor = Object.keys(fSet).length > 1;   // 동마다 총층이 다를 때만 모호
      out.ambigApr   = Object.keys(aSet).length > 1;   // 동마다 승인일이 다를 때만 모호
    }
    if (t.grndFlrCnt) out.totalFloor = String(t.grndFlrCnt) + '층';
    var apr = String(t.useAprDay || '').replace(/\D/g, '');
    if (apr.length === 8) out.aprDate = apr.slice(0, 4) + '-' + apr.slice(4, 6) + '-' + apr.slice(6);
    out.bldNm = String(t.bldNm || '');
    out.use = String(t.etcPurps || t.mainPurpsCdNm || '');
    // 🧩 2026-09-08 표제부 확장 — 대지면적·연면적·건축면적·건폐율·용적률·구조·내진설계·지하층·승강기·세대수
    //   여러 동 단지에서 동 표기가 없으면 동마다 다른 값은 비워 둔다(위 총층·승인일과 같은 원칙).
    var ext = bldgTitleExt_(titleItems, t, dongDigits);
    for (var ek in ext) out[ek] = ext[ek];
  }

  // 전유부: 호가 있어야 해당층·전용면적 조회 가능 (집합건물 한정)
  if (p.ho) {
    // 🔴 2026-08-14: 호수 하나를 알려고 건물 전체 대장을 받고 있었다.
    //    에코드파리는 전유공용 기록이 3,793건(38페이지) → 매물 1건에 약 46초.
    //    API 는 hoNm 파라미터로 그 호실만 줄 수 있다 → 9건, 0.3초 (실측 150배).
    //    이게 "보강이 6분 제한에 걸려 뒤쪽 행이 안 채워지던" 문제의 원천이다.
    var hoDigits0 = String(p.ho).replace(/\D/g, '');
    var areaItems = null;
    if (hoDigits0) {
      areaItems = bldgCachedFetch_(cacheKey + '|ho' + hoDigits0,
        'getBrExposPubuseAreaInfo', baseQs + '&hoNm=' + encodeURIComponent(hoDigits0));
    }
    // 호수 표기가 달라(예: '가동 101호') 필터로 안 잡히면 건물 전체를 받아 매칭한다.
    // 이 경로도 캐시되므로 같은 건물에서 두 번 이상 일어나지 않는다.
    if (!areaItems || !areaItems.length) {
      areaItems = bldgCachedFetch_(cacheKey, 'getBrExposPubuseAreaInfo', baseQs);
    }
    if (areaItems && areaItems.length) {
      var hoDigits = String(p.ho).replace(/\D/g, '');
      var dDigits = String(p.dong || '').replace(/\D/g, '');
      // 조건에 맞는 전유 기록을 전부 모아, 서로 다른 동에서 나오면 모호로 표시한다 (2026-08-14)
      var matches = [];
      for (var j = 0; j < areaItems.length; j++) {
        var it = areaItems[j];
        if (String(it.exposPubuseGbCdNm || '') !== '전유') continue;
        if (String(it.mainAtchGbCdNm || '').indexOf('주건축물') === -1) continue;
        if (String(it.hoNm || '').replace(/\D/g, '') !== hoDigits) continue;
        if (dDigits) {
          var idn = String(it.dongNm || '').replace(/\D/g, '');
          if (idn && idn !== dDigits) continue;
        }
        matches.push(it);
      }
      if (matches.length) {
        var dongSet = {};
        for (var mj = 0; mj < matches.length; mj++) dongSet[String(matches[mj].dongNm || '').replace(/\D/g, '')] = 1;
        if (Object.keys(dongSet).length > 1 && !dDigits) out.ambigExpos = true;   // 같은 호수가 여러 동에 있음
        var m0 = matches[0];
        if (m0.area) out.area = String(Math.round(parseFloat(m0.area) * 100) / 100) + '㎡';
        if (m0.flrNo !== undefined && m0.flrNo !== null && String(m0.flrNo) !== '') {
          out.floor = String(m0.flrNo) + '층';
        }
      }
    }
  }
  return out;
}

function pad4(v) {
  return ('0000' + String(v || '0').replace(/\D/g, '')).slice(-4);
}

// ══════════════════════════════════════════
// 대장 호수(전유부) 목록 — CRM [호수목록] 버튼용
// ══════════════════════════════════════════
function bldgUnits(p) {
  if (!BLDG_API_KEY) {
    throw new Error('건축물대장 API 키가 없습니다 — 편집기 ⚙️ 프로젝트 설정 → 스크립트 속성에 BLDG_API_KEY 를 등록하세요');
  }
  var keyParam = BLDG_API_KEY.indexOf('%') >= 0 ? BLDG_API_KEY : encodeURIComponent(BLDG_API_KEY);
  var baseQs = 'serviceKey=' + keyParam
    + '&sigunguCd=' + p.sigunguCd + '&bjdongCd=' + p.bjdongCd
    + '&platGbCd=' + (p.platGbCd || '0')
    + '&bun=' + pad4(p.bun) + '&ji=' + pad4(p.ji || '0')
    + '&numOfRows=100&_type=json';
  var items = datagoFetch('getBrExposPubuseAreaInfo', baseQs);
  var units = [];
  if (items) {
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (String(it.exposPubuseGbCdNm || '') !== '전유') continue;
      if (String(it.mainAtchGbCdNm || '').indexOf('주건축물') === -1) continue;
      units.push({
        dong: String(it.dongNm || ''),
        ho: String(it.hoNm || ''),
        area: it.area ? String(Math.round(parseFloat(it.area) * 100) / 100) : '',
        floor: (it.flrNo !== undefined && it.flrNo !== null && String(it.flrNo) !== '') ? String(it.flrNo) : ''
      });
    }
  }
  units.sort(function(a, b) {
    var fa = parseFloat(a.floor) || 0, fb = parseFloat(b.floor) || 0;
    if (fa !== fb) return fa - fb;
    return (parseInt(String(a.ho).replace(/\D/g, ''), 10) || 0) - (parseInt(String(b.ho).replace(/\D/g, ''), 10) || 0);
  });
  return units;
}

// ══════════════════════════════════════════
// 시트 직접 입력분 자동보강 (매물번호·주소·대장정보)
// ══════════════════════════════════════════
var JUSO_KEY = 'U01TX0FVVEgyMDI2MDQxNjAyNDc0MTExNzk0MDk=';
// 카카오 REST API 키 — 정부 주소DB에 없는 건물명(예: 에코드파리)을 카카오 지도DB로 보완 검색.
// developers.kakao.com → 브리즈부동산중개 CRM 앱 → 플랫폼 키 → "REST API 키"를 붙여넣으세요.
var KAKAO_REST_KEY = '8f56e71ab4095b56fc8cabbd800af681';
var KIND_CODE_GS = {'오픈형 원룸':'R','분리형 원룸':'R','빌라(투룸 이상)':'B','아파트':'A','오피스텔':'R','주택':'D','상가':'S','사무실':'F','건물':'G','공장/창고':'C',
  '빌라·연립':'B','단독주택':'D','오픈형원룸':'R','분리형원룸':'R','토지':'T','기타':'X'};

// juso 지번주소에서 건물명(bdNm) 꼬리 제거 — 주소 칼럼엔 순수 지번만 (건물명은 apt 칼럼에)
function pureJibun(juso) {
  var a = String(juso.jibunAddr || '').trim();
  var b = String(juso.bdNm || '').trim();
  if (b && a.length > b.length && a.slice(-b.length) === b) a = a.slice(0, a.length - b.length).trim();
  return a;
}

// 카카오 키워드 검색: 건물명 → 지번주소 (제주 결과만)
function kakaoPlaceAddr(name) {
  if (!KAKAO_REST_KEY || KAKAO_REST_KEY.indexOf('여기에') === 0) return null;
  var url = 'https://dapi.kakao.com/v2/local/search/keyword.json?size=5&query=' + encodeURIComponent(name);
  for (var t = 0; t < 3; t++) {
    try {
      var res = UrlFetchApp.fetch(url, { headers: { 'Authorization': 'KakaoAK ' + KAKAO_REST_KEY }, muteHttpExceptions: true });
      if (res.getResponseCode() !== 200) return null;
      var docs = (JSON.parse(res.getContentText()).documents) || [];
      for (var i = 0; i < docs.length; i++) {
        var a = String(docs[i].address_name || '');
        if (a.indexOf('제주') === 0) return a;
      }
      return null;
    } catch (e) { Utilities.sleep(500); }
  }
  return null;
}

function jusoSearch(keyword) {
  var url = 'https://business.juso.go.kr/addrlink/addrLinkApi.do?confmKey=' + encodeURIComponent(JUSO_KEY)
    + '&currentPage=1&countPerPage=10&resultType=json&keyword=' + encodeURIComponent(keyword);
  for (var t = 0; t < 3; t++) {
    try {
      var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      var d = JSON.parse(res.getContentText());
      var list = ((d.results || {}).juso) || [];
      for (var i = 0; i < list.length; i++) {
        var r = list[i];
        if (String(r.siNm || '').indexOf('제주') !== 0) continue; // 제주 매물만
        if (!r.lnbrMnnm || String(r.lnbrMnnm) === '0') continue;
        return r;
      }
      return null;
    } catch (e) { Utilities.sleep(700); }
  }
  return null;
}

// 건물명 → 지번 후보 전부 (2026-08-14 2차 보강) — 옛 단지는 주소 지번과 대장 지번이 다르다.
//   제원아파트: 주소는 연동 262-20인데 대장은 261-44(가~사동)·251-16(A~F동)에 있다.
//   표제부가 통째로 빌 때만 이 목록을 돌며 대장을 찾는다 (실패 경로 한정이라 호출 부담 없음).
var JUSO_ALTS_CACHE = {};
function jusoAlts_(keyword) {
  var k = String(keyword || '').trim();
  if (!k) return [];
  if (Object.prototype.hasOwnProperty.call(JUSO_ALTS_CACHE, k)) return JUSO_ALTS_CACHE[k];
  var out = [];
  var url = 'https://business.juso.go.kr/addrlink/addrLinkApi.do?confmKey=' + encodeURIComponent(JUSO_KEY)
    + '&currentPage=1&countPerPage=10&resultType=json&keyword=' + encodeURIComponent(k);
  try {
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var d = JSON.parse(res.getContentText());
    var list = ((d.results || {}).juso) || [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (String(r.siNm || '').indexOf('제주') !== 0) continue;
      if (!r.lnbrMnnm || String(r.lnbrMnnm) === '0') continue;
      out.push(r);
    }
  } catch (e) {}
  JUSO_ALTS_CACHE[k] = out;
  return out;
}

// 주소검색 캐시 (2026-08-14) — 같은 건물 매물이 20행이면 같은 주소를 20번 검색하던 것을 1회로.
// 대장 조회를 '항상' 하도록 바꾸면서 juso 호출도 그만큼 늘어나므로 함께 받친다.
var JUSO_CACHE = {};
function jusoCached_(keyword) {
  var k = String(keyword || '').trim();
  if (!k) return null;
  if (Object.prototype.hasOwnProperty.call(JUSO_CACHE, k)) return JUSO_CACHE[k];
  var v = jusoSearch(k);
  JUSO_CACHE[k] = v;
  return v;
}

function enrichListings() {
  var sheet = getOrCreateSheet('listings');
  var rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return { enriched: 0, notes: [] };
  var headers = rows[0].map(String);
  var col = {};
  headers.forEach(function(h, i) { col[h] = i; });
  var need = ['id', 'addr', 'addr2', 'apt', 'kind', 'area', 'floor', 'totalFloor', 'aprDate'];
  for (var n = 0; n < need.length; n++) {
    if (col[need[n]] === undefined) throw new Error('시트 헤더 누락: ' + need[n]);
  }
  var count = 0;
  var notes = [];
  var existingIds = {};
  // 🏢 같은 건물·같은 종류 매물의 관리비·주차·반려동물·대출을 통일 (2026-08-14 사장님 지시)
  //   에코드파리처럼 관리사무소가 있는 건물은 같은 원룸이면 조건이 같다 —
  //   값이 채워진 행을 본보기로 삼아 **빈 칸만** 물려받는다 (사람이 적은 값은 절대 안 덮음).
  //   🔴 2026-08-27 확대: 방수·욕실수·옵션도 포함. 사장님 지적 — "에코 드 파리는 월세·오픈형
  //     원룸·방1·화1·관리비까지 다 똑같은데 왜 안 채워지나". 원룸 건물은 호수만 다르고 조건이
  //     같아서, 종전 8개 항목만으로는 새로 적은 행이 절반 비어 있었다.
  //     (향·가격은 호수마다 다르므로 절대 물려받지 않는다)
  var UNIFORM_FIELDS = ['feeType','feeAmt','feeItems','feeBasis','feeEvidence','parking','pets','loan',
                        'rooms','baths','options'];
  // 🔴 2026-08-08: 같은 건물명(apt)으로 이미 주소가 채워진 행을 모아둔다.
  //    정부 주소DB·카카오에 없는 건물명(예: '에코힐튼')이라도, 같은 건물의 다른 호수가
  //    시트에 이미 주소를 갖고 있으면 그걸 물려받아 대장 조회까지 이어지게 한다.
  var aptAddr = {};
  for (var i = 1; i < rows.length; i++) {
    var v = String(rows[i][col.id] || '').trim();
    if (v) existingIds[v] = true;
    var ap0 = String(rows[i][col.apt] || '').trim();
    var ad0 = String(rows[i][col.addr] || '').trim();
    if (ap0 && ad0 && !aptAddr[ap0]) aptAddr[ap0] = ad0;
  }
  // 🔴 2026-08-27 신설 — 같은 건물의 물건유형·거래유형 다수결.
  //   사장님이 공실 사진을 보고 호수만 적어 넣으면 물건유형(kind)이 비어 있는데,
  //   ① 매물번호 접두가 'X'(기타)로 붙어 같은 건물인데 번호 앞자리가 O·X·R로 갈리고
  //   ② 관리비·방수 물려받기가 '건물명|물건유형' 키로 돌아가서 통째로 건너뛰었다.
  //   → 번호를 붙이기 **전에** 같은 건물의 다수 유형으로 빈 칸을 채운다(사람이 적은 값은 안 덮음).
  var kindVote = {}, typeVote = {};
  function voteKey_(apt, addr) {
    var a = String(apt || '').replace(/\s+/g, '');
    return a ? 'A:' + a : (String(addr || '').replace(/\s+/g, '') ? 'D:' + String(addr).replace(/\s+/g, '') : '');
  }
  for (var vi = 1; vi < rows.length; vi++) {
    var vk = voteKey_(rows[vi][col.apt], rows[vi][col.addr]);
    if (!vk) continue;
    var vKind = String(rows[vi][col.kind] || '').trim();
    var vType = col.type !== undefined ? String(rows[vi][col.type] || '').trim() : '';
    if (vKind) { (kindVote[vk] = kindVote[vk] || {})[vKind] = (kindVote[vk][vKind] || 0) + 1; }
    if (vType) { (typeVote[vk] = typeVote[vk] || {})[vType] = (typeVote[vk][vType] || 0) + 1; }
  }
  function topVote_(tbl, key) {
    var m = tbl[key]; if (!m) return '';
    var best = '', bn = 0;
    for (var k in m) if (m[k] > bn) { bn = m[k]; best = k; }
    return bn >= 1 ? best : '';
  }
  // 📅 날짜 표기 통일 (2026-08-27 사장님 지시) — 어떻게 적어도 2026-08-05 형태로 바꾼다.
  //   시트 칼럼이 텍스트(@) 서식이라 "8/5", "2026.8.5", "20260805" 가 그대로 남아
  //   정렬·비교·계약서 출력이 제각각이었다. '즉시입주'처럼 날짜가 아닌 말은 손대지 않는다.
  var DATE_COLS = ['recvDate', 'moveDate', 'availDate', 'aprDate', 'contractDate', 'contractEnd'];
  function normDate_(v) {
    if (v instanceof Date) {
      if (isNaN(v.getTime())) return '';
      return Utilities.formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd');
    }
    var s = String(v === undefined || v === null ? '' : v).trim();
    if (!s) return '';
    var pad = function (n) { return ('0' + n).slice(-2); };
    var y, mo, dd, m;
    if ((m = s.match(/^(\d{4})\s*[.\-\/년]\s*(\d{1,2})\s*[.\-\/월]\s*(\d{1,2})\s*[.일]?$/))) { y = +m[1]; mo = +m[2]; dd = +m[3]; }
    else if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/)))                 { y = +m[1]; mo = +m[2]; dd = +m[3]; }
    else if ((m = s.match(/^(\d{2})\s*[.\-\/]\s*(\d{1,2})\s*[.\-\/]\s*(\d{1,2})\s*\.?$/))) { y = 2000 + (+m[1]); mo = +m[2]; dd = +m[3]; }
    else if ((m = s.match(/^(\d{1,2})\s*[.\-\/월]\s*(\d{1,2})\s*[.일]?$/))) {  // "9/11" = 올해
      y = new Date().getFullYear(); mo = +m[1]; dd = +m[2];
    } else return '';                                                   // 날짜로 안 보이면 그대로 둔다
    if (mo < 1 || mo > 12 || dd < 1 || dd > 31 || y < 1900 || y > 2200) return '';
    // 달력에 없는 날(2월 30일 등)은 손대지 않는다 — 사람이 잘못 적은 것을 조용히 바꾸면 안 된다
    var chk = new Date(y, mo - 1, dd);
    if (chk.getFullYear() !== y || chk.getMonth() !== mo - 1 || chk.getDate() !== dd) return '';
    return y + '-' + pad(mo) + '-' + pad(dd);
  }
  // 건물+종류별 본보기 행: UNIFORM_FIELDS 중 채워진 값이 가장 많은 행
  var uniformTpl = {};
  for (var ui = 1; ui < rows.length; ui++) {
    var uApt = String(rows[ui][col.apt] || '').replace(/\s+/g, '');
    var uKind = String(rows[ui][col.kind] || '').trim();
    if (!uApt || !uKind) continue;
    var filled = 0;
    for (var uf = 0; uf < UNIFORM_FIELDS.length; uf++) {
      var cU = col[UNIFORM_FIELDS[uf]];
      if (cU !== undefined && String(rows[ui][cU] || '').trim()) filled++;
    }
    var uk = uApt + '|' + uKind;
    if (filled && (!uniformTpl[uk] || filled > uniformTpl[uk].filled)) uniformTpl[uk] = { row: rows[ui], filled: filled };
  }

  // ⏱ 시간 가드 (2026-08-14) — Apps Script 실행 제한은 6분이고, 넘으면 **아무 기록 없이 죽는다.**
  //    그게 "어디까지 됐는지 모르는" 상태를 만들어 원인 파악을 몇 주나 늦췄다.
  //    4분 30초에서 스스로 멈추고 어디까지 했는지 남긴다. 남은 행은 다음 실행에서 이어서 한다
  //    (보강은 같은 결과를 다시 써도 무해하므로 여러 번 돌려도 안전하다).
  //    🔴 이어받기가 실제로 동작하려면 어디서 멈췄는지 저장해야 한다. 안 그러면 다음 실행이
  //       또 1행부터 돌아 뒷행에 영영 도달하지 못한다(클로드 크롬 지적, 2026-08-14).
  var startedAt = new Date().getTime();
  var TIME_BUDGET_MS = 270000;
  var stoppedAt = 0;
  var props = PropertiesService.getScriptProperties();
  var resumeFrom = parseInt(props.getProperty('ENRICH_RESUME_ROW'), 10) || 0;
  if (resumeFrom >= rows.length) resumeFrom = 0;   // 행이 줄었으면 처음부터
  // 🔴 2026-08-27: 이번 실행에서 새로 매물번호를 붙인 행 = "사장님이 방금 적어 넣은 공실 목록".
  //   실행이 끝날 때까지 모아 두었다가 공실 대조에 넘긴다 (아래 VAC_PENDING_KEY 참조).
  var freshIds = [];

  for (var i = (resumeFrom > 1 ? resumeFrom : 1); i < rows.length; i++) {
    if (new Date().getTime() - startedAt > TIME_BUDGET_MS) { stoppedAt = i; break; }
    var r = rows[i];
    var apt = String(r[col.apt] || '').trim();
    var id = String(r[col.id] || '').trim();
    var addr = String(r[col.addr] || '').trim();
    if (!apt && !addr) continue;
    var changed = false;

    // 0) 📅 날짜 칸 표기 통일 — 어떻게 적어도 2026-08-05 형태로 (2026-08-27)
    for (var dc = 0; dc < DATE_COLS.length; dc++) {
      var dcName = DATE_COLS[dc];
      if (col[dcName] === undefined) continue;
      var rawD = r[col[dcName]];
      var normD = normDate_(rawD);
      if (normD && normD !== String(rawD === undefined || rawD === null ? '' : rawD).trim()) {
        sheet.getRange(i + 1, col[dcName] + 1).setValue(normD);
        r[col[dcName]] = normD;
        changed = true;
      }
    }

    // 0-b) 🏢 물건유형·거래유형 빈 칸을 같은 건물 다수결로 채운다 (2026-08-27)
    //   매물번호 접두가 여기서 정해지므로 **번호를 붙이기 전에** 해야 한다.
    var vkey = voteKey_(apt, addr);
    if (vkey) {
      if (!String(r[col.kind] || '').trim()) {
        var gKind = topVote_(kindVote, vkey);
        if (gKind) { sheet.getRange(i + 1, col.kind + 1).setValue(gKind); r[col.kind] = gKind; changed = true; }
      }
      if (col.type !== undefined && !String(r[col.type] || '').trim()) {
        var gType = topVote_(typeVote, vkey);
        if (gType) { sheet.getRange(i + 1, col.type + 1).setValue(gType); r[col.type] = gType; changed = true; }
      }
    }

    // 1) 매물번호 자동 생성
    if (!id) {
      var kind = String(r[col.kind] || '').trim();
      var prefix = KIND_CODE_GS[kind] || 'X';
      var d = new Date();
      var ymd = String(d.getFullYear()).slice(2)
        + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
      var seq = 1, cand;
      do { cand = prefix + ymd + '-' + ('0' + seq).slice(-2); seq++; } while (existingIds[cand]);
      existingIds[cand] = true;
      sheet.getRange(i + 1, col.id + 1).setValue(cand);
      freshIds.push(cand);
      changed = true;
    }

    // 2) 주소 자동 채움 (건물명 → 주소검색, 지번주소 기준)
    var juso = null;
    if (!addr && apt) {
      // 2-a) 같은 건물명의 다른 행이 이미 가진 주소를 먼저 물려받는다 (검색 안 되는 건물명 대비)
      if (aptAddr[apt]) {
        addr = aptAddr[apt];
        sheet.getRange(i + 1, col.addr + 1).setValue(addr);
        changed = true;
      } else {
        juso = jusoCached_(apt) || jusoCached_('제주 ' + apt);
        if (!juso) {
          // 정부 주소DB에 없는 건물명 → 카카오 지도DB로 지번주소를 얻어 재검색
          var ka = kakaoPlaceAddr(apt) || kakaoPlaceAddr('제주 ' + apt);
          if (ka) juso = jusoCached_(ka);
        }
        if (juso && juso.jibunAddr) {
          addr = pureJibun(juso);
          aptAddr[apt] = addr;   // 다음 행이 물려받을 수 있게 기록
          sheet.getRange(i + 1, col.addr + 1).setValue(addr);
          changed = true;
        } else {
          notes.push(apt + ': 주소검색 실패 (같은 건물명 주소가 시트에 하나도 없음 — 한 행에 주소를 직접 넣으면 나머지는 자동)');
        }
      }
    }

    // 3) 주소 지번 정규화 + 건물명 + 건축물대장 대조
    // 🔴 2026-08-14 2차 수정: 종전에는 "빈 칸이 하나라도 있을 때만" 대장을 조회했다
    //    (needBldg || !apt || looksRoad). 그래서 **이미 값이 다 채워진 행은 조회 자체를 안 해서**,
    //    잘못 박힌 값이 영영 안 고쳐졌다. 504호가 14층(실제 4층)으로 남아 있던 것이 이 때문이다.
    //    아래 putBldg 의 '대장 우선' 정정 로직은 있었지만 여기서 막혀 도달하지 못했다.
    //    → 주소가 있으면 **항상** 대장을 확인한다. 값이 같으면 putBldg 가 쓰지 않으므로
    //      불필요한 시트 쓰기는 생기지 않는다.
    //    ⚠ 조회 횟수가 늘어나는 만큼 jusoSearch 와 대장 조회를 캐시로 받쳐 둔다(아래 jusoCached_).
    if (addr) {
      if (!juso) juso = jusoCached_(addr);
      if (juso && String(juso.admCd || '').length >= 10 && juso.lnbrMnnm) {
        // 축약("연동260-15")·도로명("신광로 16") 입력을 정식 지번주소로 정규화
        var pj = pureJibun(juso);
        if (pj && pj !== addr) {
          addr = pj;
          sheet.getRange(i + 1, col.addr + 1).setValue(addr);
          changed = true;
        }
        // 건물명 자동 채움 1차: 정부 주소DB 건물명
        if (!apt && juso.bdNm && String(juso.bdNm).trim()) {
          apt = String(juso.bdNm).trim();
          sheet.getRange(i + 1, col.apt + 1).setValue(apt);
          changed = true;
        }
        var addr2 = String(r[col.addr2] || '');
        var dongM = addr2.match(/(\d+)\s*동/);
        var hoM = addr2.match(/(\d+)\s*호/);
        var hoVal = hoM ? hoM[1] : '';
        if (!hoVal) { // "호" 미표기 시: 동·층 표기를 뺀 마지막 숫자를 호수로 간주
          var rest = addr2.replace(/\d+\s*동/g, ' ').replace(/\d+\s*층/g, ' ');
          var nums = rest.match(/\d+/g);
          if (nums && nums.length) hoVal = nums[nums.length - 1];
        }
        var dongVal = dongM ? dongM[1] : '';
        var dh = addr2.match(/^(\d+)\s*-\s*(\d+)\s*$/); // "101-204" = 101동 204호
        if (dh) { dongVal = dh[1]; hoVal = dh[2]; }
        // 시트 상세주소 표기 정규화: "1601"→"1601호", "101-204"→"101동 204호"
        if (hoVal && (dh || /^\d+\s*$/.test(addr2))) {
          var na2 = (dongVal ? dongVal + '동 ' : '') + hoVal + '호';
          sheet.getRange(i + 1, col.addr2 + 1).setValue(na2);
          changed = true;
        }
        var b = bldgLookup({
          sigunguCd: String(juso.admCd).slice(0, 5),
          bjdongCd: String(juso.admCd).slice(5, 10),
          platGbCd: (juso.mtYn === '1' || juso.mtYn === 'Y') ? '1' : '0',
          bun: String(juso.lnbrMnnm),
          ji: String(juso.lnbrSlno || '0'),
          dong: dongVal,
          ho: hoVal
        });
        // 🔴 2026-08-14 정책 변경: **건축물대장이 우선이다.**
        //    종전에는 "빈 칸만 채움"이라, 한 번 잘못 들어간 값은 보강을 몇 번 돌려도 그대로였다.
        //    (실제 사고: 504호가 14층으로 들어가 있었는데 대장은 4층. 보강해도 안 고쳐졌다)
        //    사장님 지시 = 매물장·임대인에게 받아 적은 값보다 대장 값을 우선한다.
        //    ⚠ 덮어쓴 것은 안내문에 남겨 무엇이 바뀌었는지 보이게 한다.
        // 🔍 표제부가 통째로 비면 같은 건물명의 다른 지번에서 대장을 찾아본다 (제원아파트형, 2026-08-14)
        if (!b.totalFloor && !b.aprDate && !b.area && !b.floor && apt) {
          var alts = jusoAlts_(apt);
          for (var ai = 0; ai < alts.length && ai < 5; ai++) {
            var al = alts[ai];
            if (String(al.admCd) === String(juso.admCd) &&
                pad4(al.lnbrMnnm) === pad4(juso.lnbrMnnm) &&
                pad4(al.lnbrSlno || '0') === pad4(juso.lnbrSlno || '0')) continue;   // 원 지번은 이미 해봤다
            var b2 = bldgLookup({
              sigunguCd: String(al.admCd).slice(0, 5),
              bjdongCd: String(al.admCd).slice(5, 10),
              platGbCd: (al.mtYn === '1' || al.mtYn === 'Y') ? '1' : '0',
              bun: String(al.lnbrMnnm), ji: String(al.lnbrSlno || '0'),
              dong: dongVal, ho: hoVal
            });
            if (b2.totalFloor || b2.aprDate || b2.area || b2.floor) {
              b = b2;
              notes.push((apt || addr) + ': 대장을 ' + String(al.jibunAddr || '').replace(/^제주특별자치도\s*/, '')
                + ' 지번에서 찾음 (주소 지번에는 표제부 없음)');
              break;
            }
          }
        }
        var over = [];
        function putBldg(colName, newVal, label, fillOnly) {
          if (!newVal) return;                                  // 대장에 값이 없으면 손대지 않는다
          var cur = String(r[col[colName]] || '').trim();
          if (cur === String(newVal)) return;                   // 이미 같으면 쓰지 않는다(불필요한 쓰기 방지)
          if (fillOnly && cur) return;                          // 모호한 조회(여러 동)면 빈 칸만 채운다
          sheet.getRange(i + 1, col[colName] + 1).setValue(newVal);
          changed = true;
          if (cur) over.push(label + ' ' + cur + '→' + newVal); // 빈 칸 채움은 조용히, 덮어쓰기만 기록
        }
        putBldg('totalFloor', b.totalFloor, '총층',  b.ambigFloor);
        putBldg('aprDate',    b.aprDate,    '승인일', b.ambigApr);
        putBldg('area',       b.area,       '면적',   b.ambigExpos);
        putBldg('floor',      b.floor,      '해당층', b.ambigExpos);
        if (over.length) notes.push((apt || addr) + (hoVal ? ' ' + hoVal + '호' : '') + ': 대장 기준으로 정정 — ' + over.join(', '));
        if ((b.ambigFloor || b.ambigApr || b.ambigExpos) && hoVal) {
          notes.push((apt || addr) + ' ' + hoVal + '호: 여러 동 단지라 동을 알 수 없어 기존 값 유지 — 상세주소를 "동-호"(예: 101-505)로 적으면 정확히 맞춰집니다');
        }
        // 건물용도: 대장 값으로 **빈 칸만** 채운다 (2026-08-14 재활성화 — 사장님 지시).
        //   08-05에 껐던 이유는 '숙박시설'이 광고문에 그대로 실리던 것 — 지금은 광고문 쪽에서
        //   숙박 계열을 거르므로(buildListingDesc 가드) 칼럼을 채워도 안전하다.
        //   사람이 적어 둔 용도는 절대 덮지 않는다(fill-only).
        if (col.bldgUse !== undefined && b.use && !String(r[col.bldgUse] || '').trim()) {
          sheet.getRange(i + 1, col.bldgUse + 1).setValue(b.use); changed = true;
        }
        // 향 정규화: '남동'·'북' 처럼 적으면 '향'을 붙인다 (2026-08-14 사장님 지시)
        if (col.direction !== undefined) {
          var dirV = String(r[col.direction] || '').trim();
          if (/^[동서남북]{1,2}$/.test(dirV)) {
            sheet.getRange(i + 1, col.direction + 1).setValue(dirV + '향'); changed = true;
          }
        }
        // 같은 건물·같은 종류의 본보기에서 관리비·주차·반려동물·대출 빈 칸 물려받기 (2026-08-14)
        var ukey = String(apt || '').replace(/\s+/g, '') + '|' + String(r[col.kind] || '').trim();
        if (uniformTpl[ukey]) {
          var tplRow = uniformTpl[ukey].row;
          for (var tf = 0; tf < UNIFORM_FIELDS.length; tf++) {
            var cT = col[UNIFORM_FIELDS[tf]];
            if (cT === undefined) continue;
            var tv = String(tplRow[cT] || '').trim();
            if (tv && !String(r[cT] || '').trim()) { sheet.getRange(i + 1, cT + 1).setValue(tv); changed = true; }
          }
        }
        // (구) 08-05에 주석 처리했던 줄 — 위 재활성화로 대체됨: if (col.bldgUse !== undefined && b.use && !String(r[col.bldgUse] || '').trim()) { sheet.getRange(i + 1, col.bldgUse + 1).setValue(b.use); changed = true; }
        // 건물명도 건축물대장이 우선 (2026-08-14)
        //   같은 건물을 '에코드파리'·'에코 드 파리'로 섞어 적어 놓으면 중복 판정·검색이 갈린다.
        //   대장 표기('에코 드 파리')로 통일한다. 대장에 이름이 없으면 손대지 않는다.
        var bn = String(b.bldNm || '').trim();
        if (bn && bn !== apt) {
          if (apt) notes.push(apt + ' → ' + bn + ' (건물명을 대장 표기로 통일)');
          apt = bn;
          sheet.getRange(i + 1, col.apt + 1).setValue(apt);
          changed = true;
        }
        if (hoVal && !b.area && !b.floor) {
          // 왜 못 찾았는지까지 적는다 — 종전에는 "미매칭"만 떠서 대장에 없는 건지
          // 조회가 잘린 건지 구분할 수 없었다 (2026-08-14)
          notes.push((apt || addr) + ': 호수 ' + hoVal + ' 대장 미매칭'
            + (DATAGO_LAST_ERR ? ' — ' + DATAGO_LAST_ERR : ' — [호수목록]으로 확인 필요'));
        }
      } else if (apt || addr) {
        notes.push((apt || addr) + ': 지번 해석 실패');
      }
    }
    if (changed) count++;
  }
  // 🔴 2026-08-27 신설 — "이번에 적어 넣은 행"을 실행 사이에도 기억한다.
  //   종전에는 공실 대조가 이번 입력분을 '매물번호 날짜 = 오늘'로만 찾았다. 그래서 보강이
  //   시간초과로 중단되면(중단 회차는 공실 대조를 통째로 건너뛴다) 그 행들은 번호만 받은 채
  //   남고, 다음 날에는 '옛날 행'이 되어 영영 대조 대상에서 빠졌다. 같은 호수가 두 줄로
  //   굳어 빨간 중복 표시가 사라지지 않던 실제 원인(08-27 실측 18세트).
  //   → 새로 번호를 붙인 id 를 스크립트 속성에 쌓아 두고, 대조가 끝난 회차에만 비운다.
  var VAC_PENDING_KEY = 'VAC_PENDING_IDS';
  var pendingIds = [];
  try { pendingIds = JSON.parse(props.getProperty(VAC_PENDING_KEY) || '[]') || []; } catch (e) { pendingIds = []; }
  if (freshIds.length) {
    for (var fi = 0; fi < freshIds.length; fi++) {
      if (pendingIds.indexOf(freshIds[fi]) < 0) pendingIds.push(freshIds[fi]);
    }
    if (pendingIds.length > 400) pendingIds = pendingIds.slice(pendingIds.length - 400); // 속성 크기 보호
    props.setProperty(VAC_PENDING_KEY, JSON.stringify(pendingIds));
  }

  var removed = 0;
  if (stoppedAt) {
    // 멈춘 지점을 저장 — 다음 실행이 여기서부터 이어서 한다
    props.setProperty('ENRICH_RESUME_ROW', String(stoppedAt));
    notes.unshift('⏱ 시간이 오래 걸려 ' + (stoppedAt - 1) + '행까지만 하고 멈췄습니다 (전체 ' +
      (rows.length - 1) + '행). 한 번 더 누르면 ' + stoppedAt + '행부터 이어서 합니다.');
    if (pendingIds.length) {
      notes.push('🏢 이번에 적어 넣은 ' + pendingIds.length + '건은 기억해 두었습니다 — 이어서 하기가 끝나면 공실 대조가 그때 함께 돌아갑니다.');
    }
    // ⚠ 중단된 실행에서는 중복 정리·공실 대조를 하지 않는다 — 행이 지워지면 재개 행 번호가 틀어진다
  } else {
    props.deleteProperty('ENRICH_RESUME_ROW');
    // 🏢 공실 대조 (시트 입력 방식, 2026-08-14) — 사장님이 관리사무소 공실 사진을 보고
    //    시트에 적어 넣은 호수 목록을 기존 매물과 자동 대조한다. 상세는 함수 주석.
    var vac = vacancySheetReconcile_(sheet, pendingIds);
    if (vac && (vac.merged || vac.revived || vac.rented || vac.newUnits)) {
      notes.unshift('🏢 공실 대조: 중복 입력 정리 ' + vac.merged + '건 · 공실 복귀 ' + vac.revived +
        '건 · 임대중 전환 ' + vac.rented + '건 · 새 호수 ' + vac.newUnits + '건');
      for (var vn = 0; vn < vac.notes.length && vn < 5; vn++) notes.push(vac.notes[vn]);
    }
    props.deleteProperty(VAC_PENDING_KEY);   // 대조까지 끝난 회차에서만 비운다
    removed = dedupeListingsSheet();
  }
  applyListingSheetUx(sheet);
  logChange('listings', 'enrich', count + '행 보강, 중복 ' + removed + '건 제거'
    + (resumeFrom > 1 ? ' / ' + resumeFrom + '행부터 이어서 함' : '')
    + (stoppedAt ? ' / ⏱ ' + (stoppedAt - 1) + '행에서 시간 초과로 중단' : ''));
  return { enriched: count, removed: removed, stopped: stoppedAt ? (stoppedAt - 1) : 0,
           total: rows.length - 1, notes: notes.slice(0, 12) };
}

// ═══ 공실 대조 — 시트 입력 방식 (2026-08-14 신설 / 2026-08-27 개정) ═══
// 사장님 워크플로: 관리사무소가 보내준 공실 사진을 보고 **지금 공실인 호수를 시트에 전부** 적는다.
//   (기존에 뭐가 들어 있는지 대조하지 않고, 사진에 있는 대로 밑에서부터 다시 적는 방식)
// 그 행들은 매물번호 칸이 비어 있고, enrich 가 번호를 붙이면서 pendingIds 로 넘겨준다.
//   🔴 2026-08-27: 종전에는 '매물번호 날짜 = 오늘'로만 이번 입력분을 찾았다. 보강이 시간초과로
//      중단되면 번호만 받은 채 남아 다음 날부터 옛날 행이 되어 영영 대조에서 빠졌다.
//      이제 pendingIds(대조 끝난 회차에만 비움)를 우선 보고, 오늘 날짜 번호는 보조로만 쓴다.
//   ① 이번 입력 호수가 기존 행과 겹침 → 이번 행 삭제(병합). 기존 행이 임대중이었으면 '공실' 복귀
//   ② 이번 입력에 없는 기존 진행중(접수·상담중·공실) 행 → '임대중' 전환
//   ③ 겹치지 않는 이번 행 = 새 호수 → 유지 (상태 비었으면 '접수' — 2026-08-27 '공실' 폐지)
// 확인된 행에는 note 에 [공실확인 날짜] 도장을 남긴다 — 같은 날 두 번 돌려도 결과가 같도록(멱등).
// ⚠ 안전장치:
//   - 계약완료·거래완료·보류는 절대 자동 변경하지 않는다 (확인 필요로만 보고)
//   - ②(임대중 전환)는 **한 건물에 오늘 2건 이상** 입력됐을 때만 한다 — 호수 하나를 그냥
//     추가했을 뿐인데 그 건물 전체가 임대중으로 바뀌는 사고를 막는다
//   - CRM 화면의 [🏢 공실 대조] 버튼도 같은 도장을 남기므로 두 방식이 충돌하지 않는다
function vacAptKey_(s) { return String(s || '').replace(/\s+/g, ''); }
function vacHoKey_(s) {
  var t = String(s || '').trim();
  var dh = t.match(/^(\d+)\s*-\s*(\d+)$/);      // "101-204" = 101동 204호
  if (dh) return dh[1] + dh[2];
  return t.replace(/[^0-9]/g, '');
}
function vacancySheetReconcile_(sheet, pendingIds) {
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return null;
  var head = data[0].map(String);
  var col = {};
  head.forEach(function (h, i) { if (col[h] === undefined) col[h] = i; });
  if (col.id === undefined || col.apt === undefined || col.addr2 === undefined ||
      col.status === undefined || col.note === undefined) return null;

  var d = new Date();
  var ymd = String(d.getFullYear()).slice(2) + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
  var dateStr = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  var stamp = '[공실확인 ' + dateStr + ']';
  var todayIdRe = new RegExp('^[A-Z]' + ymd + '-');
  // 이번 입력분 판정: enrich 가 이번(또는 중단된 이전) 회차에 번호를 붙인 행이 우선.
  //   pendingIds 가 비어 있으면 종전대로 오늘 날짜 번호로만 판정한다(하위호환).
  var pendingSet = {};
  if (pendingIds && pendingIds.length) {
    for (var pi = 0; pi < pendingIds.length; pi++) pendingSet[String(pendingIds[pi]).trim()] = true;
  }
  var isFresh = function (ri) { return pendingSet[ri.id] === true || todayIdRe.test(ri.id); };

  var infos = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    infos.push({
      idx: i + 1,
      id: String(r[col.id] || '').trim(),
      aptK: vacAptKey_(r[col.apt]),
      hoK: vacHoKey_(r[col.addr2]),
      status: String(r[col.status] || '').trim(),
      note: String(r[col.note] || ''),
      row: r
    });
  }
  var res = { merged: 0, revived: 0, rented: 0, newUnits: 0, notes: [] };
  var toDelete = [];
  var byBld = {};
  infos.forEach(function (ri) { if (ri.aptK) (byBld[ri.aptK] = byBld[ri.aptK] || []).push(ri); });

  Object.keys(byBld).forEach(function (bk) {
    var all = byBld[bk];
    var todays = all.filter(isFresh);
    if (!todays.length) return;
    var olds = all.filter(function (ri) { return !isFresh(ri); });
    var oldByHo = {};
    olds.forEach(function (ri) { if (ri.hoK) (oldByHo[ri.hoK] = oldByHo[ri.hoK] || []).push(ri); });

    // ①·③ 병합과 새 호수 처리
    var seenToday = {};
    todays.forEach(function (t) {
      if (!t.hoK) return;
      if (seenToday[t.hoK]) { toDelete.push(t.idx); res.merged++; return; }   // 같은 호수를 오늘 두 번 입력
      seenToday[t.hoK] = true;
      var ex = oldByHo[t.hoK];
      if (ex && ex.length) {
        var o = ex[0];
        // 이번 행에 적어 넣은 값 중 기존 행이 비어 있는 칸만 가져온다 (기존 값은 절대 안 덮음)
        ['type', 'kind', 'price', 'rentAmt', 'feeAmt', 'options'].forEach(function (f) {
          if (col[f] === undefined) return;
          var nv = String(t.row[col[f]] || '').trim();
          if (nv && !String(o.row[col[f]] || '').trim()) sheet.getRange(o.idx, col[f] + 1).setValue(nv);
        });
        // 🔴 2026-08-27: 종전에는 ex[0] 한 행만 손봤다. 같은 호수가 두 줄이면 한 줄만 상태가
        //   바뀌어 '접수'와 '임대중'으로 갈렸고, 임대 나간 방이 남은 줄 때문에 계속 광고에
        //   노출됐다(08-27 실측 9건). 이제 같은 호수의 기존 행을 전부 처리한다 —
        //   공실 목록에 있는 호수에는 '임대중'이 한 줄도 남지 않는다.
        var anyRented = false;
        for (var xi = 0; xi < ex.length; xi++) {
          var ox = ex[xi];
          if (ox.status === '계약완료' || ox.status === '거래완료' || ox.status === '보류') {
            res.notes.push(t.hoK + '호: ' + ox.status + ' 상태인데 이번에 공실로 입력됨 — 상태를 직접 확인하세요');
            continue;                                   // 자동 변경 금지
          }
          if (ox.status === '임대중' || ox.status === '') {
            // 2026-08-27: '공실' 폐지 → '접수'로 되돌린다(둘 다 "지금 내놓을 수 있음"을 뜻했다)
            sheet.getRange(ox.idx, col.status + 1).setValue('접수');
            if (ox.status === '임대중') anyRented = true;
          }
          if (ox.note.indexOf(stamp) < 0) sheet.getRange(ox.idx, col.note + 1).setValue((ox.note ? ox.note + ' ' : '') + stamp);
        }
        if (anyRented) res.revived++;                   // 복귀 건수는 호수 단위로 센다
        if (ex.length > 1) {
          res.notes.push(t.hoK + '호: 같은 호수 기존 행이 ' + ex.length + '개라 함께 처리했습니다 — 시트에서 한 줄만 남기고 지워 주세요');
        }
        toDelete.push(t.idx);
        res.merged++;
      } else {
        if (t.note.indexOf(stamp) < 0) sheet.getRange(t.idx, col.note + 1).setValue((t.note ? t.note + ' ' : '') + stamp);
        if (!t.status) sheet.getRange(t.idx, col.status + 1).setValue('접수');   // 2026-08-27 '공실' 폐지
        res.newUnits++;
      }
    });

    // ② 임대중 전환 — 이번에 2건 이상 입력한 건물만 (공실 목록을 통째로 넣었다고 볼 수 있을 때)
    if (todays.length >= 2) {
      var inList = {};
      Object.keys(seenToday).forEach(function (h) { inList[h] = true; });
      // 오늘 도장이 찍힌 행(CRM 버튼으로 확인한 것 포함)도 목록에 있는 것으로 본다
      all.forEach(function (ri) { if (ri.hoK && ri.note.indexOf(stamp) >= 0) inList[ri.hoK] = true; });
      olds.forEach(function (o) {
        if (!o.hoK || inList[o.hoK]) return;
        if (o.status === '접수' || o.status === '상담중' || o.status === '공실' || o.status === '') {
          sheet.getRange(o.idx, col.status + 1).setValue('임대중');
          res.rented++;
          res.notes.push(o.hoK + '호: 이번 공실 목록에 없어 임대중으로 전환');
        }
      });
    }
  });

  // 행 삭제는 아래쪽부터 (번호 밀림 방지)
  // 🔴 2026-08-27: deleteRow 와 같은 함정 — 시트에 기본 필터가 걸려 그 행이 숨겨져 있으면
  //   deleteRow 가 예외 없이 조용히 무시된다(08-22 실측). 병합했다고 보고해 놓고 행은 그대로
  //   남아 중복이 되는 경로라 여기서도 필터를 걷고 지운다.
  toDelete.sort(function (a, b) { return b - a; });
  for (var di = 0; di < toDelete.length; di++) {
    try {
      if (sheet.isRowHiddenByFilter(toDelete[di])) {
        var filt = sheet.getFilter();
        if (filt) { filt.remove(); res.notes.push('행을 숨기던 시트 필터를 해제하고 병합했습니다'); }
      }
    } catch (e) {}
    sheet.deleteRow(toDelete[di]);
  }
  return res;
}

// 빈 응답(200+본문 0바이트)이 간헐적으로 오므로 재시도, totalCount 기준 페이지네이션
function datagoFetch(op, baseQs) {
  var url = 'https://apis.data.go.kr/1613000/BldRgstHubService/' + op + '?' + baseQs;
  var items = [];
  var page = 1;
  var total = 0;
  DATAGO_LAST_ERR = '';
  do {
    var body = null;
    for (var t = 0; t < 3; t++) {
      try {
        var res = UrlFetchApp.fetch(url + '&pageNo=' + page, { muteHttpExceptions: true });
        var text = res.getContentText();
        if (!text || !text.trim()) { DATAGO_LAST_ERR = '빈 응답'; Utilities.sleep(800); continue; }
        var d = JSON.parse(text);
        // 포털 공통 오류(키 미등록·트래픽 초과 등)는 response가 아니라 OpenAPI_ServiceResponse로 온다
        if (d.OpenAPI_ServiceResponse) {
          var cm = d.OpenAPI_ServiceResponse.cmmMsgHeader || {};
          DATAGO_LAST_ERR = (cm.returnAuthMsg || cm.errMsg || '포털 공통 오류') + '(' + (cm.returnReasonCode || '') + ')';
          Utilities.sleep(800); continue;
        }
        var h = (d.response || {}).header || {};
        if (h.resultCode !== '00' && h.resultCode !== '0') {
          DATAGO_LAST_ERR = h.resultMsg || ('resultCode ' + h.resultCode);
          Utilities.sleep(800); continue;
        }
        body = (d.response || {}).body || {};
        break;
      } catch (err) { DATAGO_LAST_ERR = String(err && err.message || err); Utilities.sleep(800); }
    }
    if (!body) return items.length ? items : null;
    total = parseInt(body.totalCount, 10) || 0;
    var it = body.items;
    it = (it && it.item) ? it.item : null;
    if (it && !Array.isArray(it)) it = [it];
    if (it) items = items.concat(it);
    if (!it) break;
    page++;
  } while (items.length < total && page <= 60);
  // ⚠ 페이지 상한. API 가 한 번에 100건만 주므로 60페이지 = 6,000건.
  //   (에코드파리 전유공용이 3,793건 = 38페이지다. 종전 상한 40페이지는 여유가 거의 없었다)
  //   상한에 걸려 잘리면 뒤쪽 호수가 통째로 안 잡히는데 종전에는 그 사실이 아무 데도 안 남았다
  //   → 아래에서 기록해 enrich 안내문에 뜨게 한다 (2026-08-14)
  if (total && items.length < total) {
    DATAGO_LAST_ERR = '기록 ' + total + '건 중 ' + items.length + '건만 조회됨(페이지 상한) — 뒤쪽 호수가 누락될 수 있음';
  }
  return items;
}

// ══════════════════════════════════════════
// 유틸리티
// ══════════════════════════════════════════
function getOrCreateSheet(type) {
  var ss   = SpreadsheetApp.openById(SHEET_ID);
  var name = SHEETS[type] || type;
  var sheet = ss.getSheetByName(name);
  var headers = HEADERS[type];

  if (!sheet) {
  sheet = ss.insertSheet(name);
  if (headers) {
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  styleHeader(sheet, headers.length);
  }
  return sheet;
  }
  // 2026-08-05: HEADERS에 칼럼을 추가했을 때 기존 시트를 넓히고 새 칼럼의 헤더 이름을 채운다.
  // 🔴 기존 헤더 이름은 절대 덮지 않는다 — 빈 칸에만 채운다.
  if (headers) {
  var maxCols = sheet.getMaxColumns();
  if (maxCols < headers.length) sheet.insertColumnsAfter(maxCols, headers.length - maxCols);
  // 🔀 2026-08-30: 칼럼을 옮겨 써도 되므로, **이름이 이미 있으면 자리와 무관하게 그대로 둔다.**
  //   종전에는 위치로만 비교해서, 순서를 바꿔 놓으면 같은 이름을 또 써 넣을 수 있었다.
  var wideNow = Math.max(sheet.getLastColumn(), headers.length);
  var have = {};
  var scan = sheet.getRange(1, 1, 1, wideNow).getValues()[0];
  for (var q = 0; q < scan.length; q++) {
    var nq = String(scan[q] == null ? '' : scan[q]).trim();
    if (nq) have[nq] = true;
  }
  var missing = headers.filter(function (h) { return !have[h]; });
  var cur = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  var changed = false;
  var seen = {};
  for (var i = 0; i < headers.length; i++) {
  var nm = String(cur[i] === undefined || cur[i] === null ? '' : cur[i]).trim();
  // 🔴 2026-08-28: 빈 칸뿐 아니라 **앞에 이미 나온 이름과 겹치는 칸**도 채운다.
  //   'web' 을 HEADERS 중간(descAt 뒤)에 넣었다가 겪은 사고 — 시트에는 이미 다른 세션이
  //   넣은 photoUrl·photoCnt 가 그 자리에 있어 한 칸씩 밀렸고, 마지막 빈 칸에
  //   **'photoCnt' 가 중복으로 적혔다.** 그 뒤로는 그 칸이 '빈 칸이 아니'라서 영원히
  //   막히고, 새 칼럼이 시트에 절대 생기지 않는다(읽을 때 이름으로 찾으므로 값이 사라진다).
  //   중복 이름은 언제나 잘못된 것이므로 덮어써도 안전하다.
  // 빈 칸이거나 앞에 나온 이름과 겹치면 → 아직 시트에 없는 이름부터 채운다
  if (nm === '' || seen[nm]) {
  var fill = missing.length ? missing.shift() : headers[i];
  cur[i] = fill;
  nm = fill;
  changed = true;
}
  seen[nm] = true;
}
if (changed) {
sheet.getRange(1, 1, 1, headers.length).setValues([cur]);
styleHeader(sheet, headers.length);
}
}
return sheet;
}

function styleHeader(sheet, colCount) {
  var r = sheet.getRange(1, 1, 1, colCount);
  r.setBackground('#0F6E56');
  r.setFontColor('#FFFFFF');
  r.setFontWeight('bold');
  r.setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
}

// 당근부동산 필수입력 칼럼 헤더 연한 노랑 표시 (프런트 exportDaangnExcel 필수 조건과 동일 세트)
// desc(매물 설명)는 내보내기 때 자동 생성되므로 제외
function colorDaangnRequiredHeaders(sheet) {
  sheet = sheet || getOrCreateSheet('listings');
  var headers = HEADERS.listings;
  var req = ['kind','type','price','rentAmt','addr','area','rooms','baths','floor','totalFloor'];
  var a1s = [];
  // 🔀 2026-08-30: 시트 칼럼을 옮겨도 되도록 **시트의 실제 머리글 위치**를 쓴다(HEADERS 순서 아님)
  var cmReq = sheetColMap_(sheet);
  for (var i = 0; i < req.length; i++) {
    var c = cmReq.index[req[i]];
    if (c !== undefined) a1s.push(sheet.getRange(1, c + 1).getA1Notation());
  }
  if (a1s.length) {
    var rl = sheet.getRangeList(a1s);
    rl.setBackground('#FFF2CC');
    rl.setFontColor('#7A5C00');
    rl.setFontWeight('bold');
  }
}

// 중복 행 표시: 매물번호(id) 또는 주소+호수가 같은 행을 연한 빨강 배경으로 (당근 중복등록·입력 오류 예방)
// 저장(applyListingSheetUx) 때마다 배경을 초기화 후 다시 계산 — 중복 해소되면 자동으로 사라짐
function markDuplicateListings(sheet) {
  sheet = sheet || getOrCreateSheet('listings');
  var rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return 0;
  var hs = rows[0].map(String);
  var iId = hs.indexOf('id'), iAddr = hs.indexOf('addr'), iAddr2 = hs.indexOf('addr2');
  var iStatus = hs.indexOf('status');
  var last = colLetter(hs.length);
  // 이전 표시 초기화 — 글자색도 함께 되돌린다(임대중 회색이 상태가 풀린 뒤에도 남지 않게)
  var reset = sheet.getRange(2, 1, rows.length - 1, hs.length);
  reset.setBackground(null);
  reset.setFontColor(null);
  var idCnt = {}, adCnt = {}, keys = [], grey = [];
  for (var i = 1; i < rows.length; i++) {
    var id = iId >= 0 ? String(rows[i][iId] || '').trim() : '';
    var ad = '';
    if (iAddr >= 0 && String(rows[i][iAddr] || '').trim()) {
      ad = (String(rows[i][iAddr] || '') + '|' + (iAddr2 >= 0 ? String(rows[i][iAddr2] || '') : '')).replace(/\s+/g, '');
    }
    keys.push([id, ad]);
    if (id) idCnt[id] = (idCnt[id] || 0) + 1;
    if (ad) adCnt[ad] = (adCnt[ad] || 0) + 1;
    // 🩶 2026-08-27 사장님 지시 — 임대가 나가 광고에서 빠진 행은 옅은 회색으로 죽여 둔다.
    //   지금 팔 수 있는 매물만 눈에 들어오게 하는 용도(삭제하지 않는 이유는 이력 보존).
    if (iStatus >= 0 && String(rows[i][iStatus] || '').trim() === '임대중') grey.push('A' + (i + 1) + ':' + last + (i + 1));
  }
  // 회색을 먼저 칠하고 중복 빨강을 위에 덮는다 — 중복 경고가 회색에 묻히면 안 된다
  if (grey.length) {
    var gl = sheet.getRangeList(grey);
    gl.setBackground('#EFEFEF');
    gl.setFontColor('#8A8A8A');
  }
  var a1s = [];
  for (var i = 0; i < keys.length; i++) {
    if ((keys[i][0] && idCnt[keys[i][0]] > 1) || (keys[i][1] && adCnt[keys[i][1]] > 1)) {
      var r = i + 2;
      a1s.push('A' + r + ':' + last + r);
    }
  }
  if (a1s.length) {
    var rl2 = sheet.getRangeList(a1s);
    rl2.setBackground('#F8D7DA');
    rl2.setFontColor(null);
  }
  return a1s.length;
}

function colLetter(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; }
  return s;
}

// 편집기에서 한 번 실행하면 매물관리 시트에 노랑·빨강 표시 즉시 적용 (재배포 없이도 시트에는 반영됨)
function testColorHeaders() {
  var sheet = getOrCreateSheet('listings');
  colorDaangnRequiredHeaders(sheet);
  var dup = markDuplicateListings(sheet);
  Logger.log('✅ 당근 필수 칼럼 노랑 표시 완료, 중복 행 빨강 표시 ' + dup + '건');
}

function logChange(type, action, detail) {
  try {
    var ss   = SpreadsheetApp.openById(SHEET_ID);
    var log  = ss.getSheetByName(SHEETS.logs);
    if (!log) {
      log = ss.insertSheet(SHEETS.logs);
      log.getRange(1,1,1,4).setValues([['시간','구분','액션','상세']]);
      styleHeader(log, 4);
    }
    log.appendRow([Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss'), type, action, String(detail)]);
  } catch(e) {}
}

function ok(obj) {
  obj.ok = true;
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function err(msg) {
  return ContentService.createTextOutput(JSON.stringify({ ok: false, error: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ══════════════════════════════════════════
// ★ 테스트 함수 (배포 전 여기서 먼저 실행!)
// ══════════════════════════════════════════

/** STEP 1: 먼저 이 함수 실행 → 시트 연결 + 권한 확인 */
function testSetup() {
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    Logger.log('✅ 스프레드시트 연결 성공: ' + ss.getName());

    ['listings', 'customers', 'contracts'].forEach(function(type) {
      var sheet = getOrCreateSheet(type);
      Logger.log('✅ 시트 확인: ' + sheet.getName() + ' (' + sheet.getLastRow() + '행)');
    });
    Logger.log('');
    Logger.log('✅ testSetup 통과! 다음: testSaveData 실행');
  } catch(e) {
    Logger.log('❌ 오류: ' + e.message);
    Logger.log('→ 권한 승인이 필요합니다. 팝업에서 허용을 클릭하세요.');
  }
}

/** STEP 2: 저장/조회/삭제 테스트 */
function testSaveData() {
  try {
    // 저장 테스트
    var result = saveAll('listings', [{
      id: 'test_001', apt: '테스트 매물', type: '전세', price: '3억',
      area: '59㎡', floor: '5층', status: '상담중',
      recvDate: '2026-05-17', cname: '테스트고객', note: 'CRM 연동 테스트'
    }]);
    Logger.log('✅ 저장 성공: ' + JSON.stringify(result));

    // 조회 테스트
    var loaded = getAllData('listings');
    Logger.log('✅ 조회 성공: ' + loaded.length + '건 | 첫번째: ' + loaded[0].apt);

    // 삭제 (테스트 데이터 정리)
    deleteRow('listings', 'test_001');
    Logger.log('✅ 삭제 성공');
    Logger.log('');
    Logger.log('✅ 모든 테스트 통과! 이제 배포하세요:');
    Logger.log('   배포 → 새 배포 → 웹앱 → 실행계정: 나 / 액세스: 모든사용자');
  } catch(e) {
    Logger.log('❌ 오류: ' + e.message);
  }
}

/** STEP 3: GET/POST 엔드포인트 시뮬레이션 */
function testEndpoint() {
  try {
    var getRes = doGet({ parameter: { action: 'ping' } });
    Logger.log('✅ GET ping: ' + getRes.getContent());

    var postRes = doPost({
      postData: { contents: JSON.stringify({ action: 'saveAll', type: 'listings', data: [] }) }
    });
    Logger.log('✅ POST saveAll: ' + postRes.getContent());
    Logger.log('✅ 엔드포인트 테스트 완료!');
  } catch(e) {
    Logger.log('❌ 오류: ' + e.message);
  }
}

/** 건축물대장 전유부(호실) 목록 진단 — 대장에 실제 등록된 호수 표기를 확인 */
function testBldg() {
  var keyParam = BLDG_API_KEY.indexOf('%') >= 0 ? BLDG_API_KEY : encodeURIComponent(BLDG_API_KEY);
  var baseQs = 'serviceKey=' + keyParam
    + '&sigunguCd=50110&bjdongCd=13700&platGbCd=0&bun=0260&ji=0015&numOfRows=100&_type=json';
  var items = datagoFetch('getBrExposPubuseAreaInfo', baseQs);
  if (!items) { Logger.log('❌ 전유부 조회 실패 (빈 응답 반복)'); return; }
  Logger.log('전체 항목 수: ' + items.length);
  var hos = [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (String(it.exposPubuseGbCdNm || '') !== '전유') continue;
    hos.push('[' + (it.dongNm || '무동') + '|' + (it.hoNm || '?') + '|' + (it.mainAtchGbCdNm || '?')
      + '|' + it.area + '㎡|' + it.flrNo + '층]');
  }
  Logger.log('전유 호실 ' + hos.length + '개, 앞 60개: ' + hos.slice(0, 60).join(' '));
}

/* ───────── 홈페이지 피드 설정 ───────── */
var HOMEPAGE_KIND_MAP = {
  '오픈형 원룸': '원투룸', '분리형 원룸': '원투룸', '오픈형원룸': '원투룸', '분리형원룸': '원투룸',
  '아파트': '아파트', '오피스텔': '오피스텔', '빌라·연립': '연립다세대', '빌라(투룸 이상)': '연립다세대',
  '주택': '단독 다가구 상가주택', '단독주택': '단독 다가구 상가주택',
  '상가': '상가', '사무실': '상가', '건물': '상가건물', '공장/창고': '공장 창고', '토지': '토지'
};
var HOMEPAGE_NO_ADDR = ['상가', '상가건물', '토지', '공장 창고', '기타매물']; // 위치(읍면동)도 숨김
var BLOG_RSS2 = 'https://rss.blog.naver.com/eya81.xml';
var NEWS_CATEGORY2 = ['부동산뉴스', '단지정보', '지역정보', '생활정보'];
var BOARD_CATEGORY2 = '게시판';

/* ───────── 매물 피드: CRM 매물관리 → 홈페이지 JSON ───────── */
function getHomepageListings() {
  var sheet = getOrCreateSheet('listings');
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var head = values[0].map(function (h) { return String(h).trim(); });
  var col = {};
  head.forEach(function (h, i) { if (col[h] == null) col[h] = i; });
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var g = function (n) { var i = col[n]; return (i != null && row[i] != null) ? String(row[i]).trim() : ''; };

    var deal = g('type'), kind = g('kind'), price = g('price');
    var addr = g('addr'), apt = g('apt');
    if (!deal || !price || (!addr && !apt)) continue;     // 최소 공개 조건: 거래유형+가격+위치
    if (['계약완료','임대중','거래완료','보류'].indexOf(g('status')) > -1) continue;              // 계약된 매물 미노출
    if (g('note').indexOf('테스트') > -1) continue;        // 테스트 매물 제외
    if (g('web') === '숨김') continue;                     // 🌐 사장님이 끈 매물 (빈 칸은 노출)

    var homeType = HOMEPAGE_KIND_MAP[kind] || '기타매물';
    // 🌐 정보가 덜 채워진 매물은 자동으로 뺀다 (2026-08-28)
    //   물건유형이 비면 '기타매물'이 되는데, 기타매물은 위치까지 숨기는 대상이라
    //   손님 화면엔 제목과 가격만 남는다 — 보여줄 게 없는 카드가 된다(실측 3건).
    //   면적도 없으면 원룸인지 상가인지 가늠할 수조차 없다.
    //   ※ 이 판정은 CRM 화면의 webEligible() 과 **같은 규칙**이어야 한다. 한쪽만 고치면
    //     광고관리에 '노출중'으로 보이는데 실제로는 안 나가는 상태가 된다.
    if (homeType === '기타매물' || !g('area')) continue;
    var hideAddr = HOMEPAGE_NO_ADDR.indexOf(homeType) !== -1;

    // 주소에서 시군구·읍면동만 추출 (지번·호수는 절대 미노출)
    var sigungu = (addr.match(/(제주시|서귀포시)/) || ['', ''])[1];
    var dongM = addr.match(/([가-힣0-9]{1,10}(?:동|리|읍|면))(?=\s|$)/);
    var dong = dongM ? dongM[1] : '';

    // 가격: "300/45" 한 칸 입력 자동 분리
    var rent = g('rentAmt');
    var pm = price.match(/^([\d,\.]+)\s*\/\s*([\d,\.]+)$/);
    if (pm && !rent) { price = pm[1]; rent = pm[2]; }
    var priceText;
    if (deal === '매매') priceText = '매매 ' + money2_(price);
    else if (deal === '전세') priceText = '전세 ' + money2_(price);
    else priceText = '보증금 ' + money2_(price) + (rent ? (deal === '연세' ? ' / 연 ' : ' / 월 ') + money2_(rent) : '');

    var title;
    if (homeType === '상가' || homeType === '상가건물') title = g('bldgUse') || homeType;
    else title = [dong, apt].filter(String).join(' ') || homeType;

    var descBits = [kind, g('area') ? '전용 ' + g('area') : '', g('direction'), g('options')];
    if (g('availDate')) descBits.push('입주 ' + g('availDate'));

    out.push({
      key: g('id'),
      // status: 삼항의 참·거짓 값이 둘 다 '공실'이라 모든 매물이 '공실'로 나갔다(죽은 코드).
      //   위 1186줄에서 계약완료·임대중·거래완료·보류는 이미 제외되므로 여기 남는 것은
      //   접수·상담중·공실·빈값뿐이다. '접수'·'상담중'은 내부 업무 용어라 공개 피드에 내보내지
      //   않는다 → 실제 공실만 '공실', 나머지는 빈 값. (홈페이지 app.js:199 isDone 은
      //   임대중·계약완료일 때만 배지를 띄우므로 화면 동작은 종전과 같다) 2026-08-14
      type: homeType, deal: deal, status: g('status') === '공실' ? '공실' : '',
      title: title,
      price: priceText, priceVal: Number(String(price).replace(/[^\d.]/g, '')) || 0,
      location: hideAddr ? '' : [sigungu, dong].filter(String).join(' '),
      addr: hideAddr ? '' : [sigungu, dong, apt].filter(String).join(' '),
      region: dong || '', noMap: hideAddr,
      area: g('area'),
      floor: (function (c, t) { return (c && t) ? c + '/' + t : (c || t || ''); })(g('floor'), g('totalFloor')),
      direction: g('direction'), rooms: g('rooms'),
      desc: descBits.filter(String).join(' · '),
      image: '', date: (g('recvDate') || g('updatedAt') || '').slice(0, 10)
    });
  }
  out.sort(function (a, b) {
    var d = String(b.date).localeCompare(String(a.date));
    return d !== 0 ? d : String(b.key).localeCompare(String(a.key));
  });
  return out;
}

function money2_(s) {
  s = String(s || '').replace(/,/g, '').trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return s;
  var n = Number(s);
  if (n >= 10000) {
    var eok = Math.floor(n / 10000), man = Math.round(n % 10000);
    return man ? eok + '억 ' + man.toLocaleString() : eok + '억';
  }
  return n.toLocaleString();
}

/* ───────── 블로그(뉴스·게시판) — 기존 홈페이지 엔진과 동일 ───────── */
function getBlogPosts2_(category) {
  var wanted = Array.isArray(category) ? category : (category ? [category] : []);
  var res = UrlFetchApp.fetch(BLOG_RSS2, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return [];
  var items = res.getContentText().split('<item>').slice(1);
  var posts = [];
  items.forEach(function (it) {
    var cat = tagVal2_(it, 'category');
    if (wanted.length && wanted.indexOf(cat) === -1) return;
    posts.push({
      title: tagVal2_(it, 'title'),
      body: stripTags2_(tagVal2_(it, 'description')).slice(0, 180),
      category: cat || '블로그',
      date: String(tagVal2_(it, 'pubDate')).slice(0, 16),
      link: tagVal2_(it, 'link')
    });
  });
  return posts;
}
function tagVal2_(s, tag) {
  var m = s.match(new RegExp('<' + tag + '>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</' + tag + '>'));
  return m ? m[1].trim() : '';
}
function stripTags2_(s) {
  return String(s).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

/* ───────── 응답(JSONP 지원 — 홈페이지 fetch·구형 브라우저 겸용) ───────── */
function reply2_(e, obj) {
  var json = JSON.stringify(obj);
  var cb = e && e.parameter && e.parameter.callback;
  if (cb) return ContentService.createTextOutput(cb + '(' + json + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

/* ───────── API 토큰 검증 ─────────
   스크립트 속성 API_TOKEN이 설정돼 있으면 요청의 token과 일치해야 통과.
   (미설정 시 통과 — 전환기용. 배포 후 반드시 속성을 설정할 것) */
// (checkToken_ 은 resolveUser_ 로 대체되어 제거 — 2026-08-14 정리)

/* ───────── 솔라피 문자 자동 발송 (접수장_문자발송.gs의 검증된 인증 방식 이식) ───────── */
function solapiAuth_() {
  var p = PropertiesService.getScriptProperties();
  var apiKey = p.getProperty('SOLAPI_API_KEY');
  var apiSecret = p.getProperty('SOLAPI_API_SECRET');
  var sender = p.getProperty('SENDER_PHONE');
  if (!apiKey || !apiSecret || !sender)
    throw new Error('프로젝트 설정(⚙)의 스크립트 속성에 SOLAPI_API_KEY / SOLAPI_API_SECRET / SENDER_PHONE을 넣으세요.');
  var date = new Date().toISOString();
  var salt = Utilities.getUuid().replace(/-/g, '');
  var raw = Utilities.computeHmacSha256Signature(date + salt, apiSecret);
  var sig = raw.map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
  return { header: 'HMAC-SHA256 apiKey=' + apiKey + ', date=' + date + ', salt=' + salt + ', signature=' + sig,
           sender: sender };
}

// messages: [{to: 전화번호, text: 문구}, ...] — 건별 개인화 문구 지원, 건당 120ms 간격
function smsSendMany(messages) {
  var sent = 0, failed = [];
  (messages || []).forEach(function (m) {
    var d = String(m.to || '').replace(/\D/g, '');
    if (d.length < 9 || d.length > 11) { failed.push((m.to || '?') + ': 번호 형식 오류'); return; }
    var a = solapiAuth_();
    var res = UrlFetchApp.fetch('https://api.solapi.com/messages/v4/send', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: a.header },
      payload: JSON.stringify({ message: { to: d, from: a.sender, text: String(m.text || '') } })
    });
    if (res.getResponseCode() === 200) { sent++; }
    else {
      var b = {};
      try { b = JSON.parse(res.getContentText()); } catch (e2) {}
      failed.push(d + ': ' + (b.errorMessage || b.errorCode || res.getResponseCode()));
    }
    Utilities.sleep(120);
  });
  logChange('sms', 'send', sent + '건 발송' + (failed.length ? ' / 실패 ' + failed.length + '건' : ''));
  return { sent: sent, failed: failed };
}

function smsBalance() {
  var a = solapiAuth_();
  var res = UrlFetchApp.fetch('https://api.solapi.com/cash/v1/balance', {
    muteHttpExceptions: true, headers: { Authorization: a.header }
  });
  return JSON.parse(res.getContentText());
}

/* ───────── 📬 공실확인 문자 대기열 (2026-08-28) ─────────────────────────────
   왜 대기열인가
     솔라피 계정의 **일일 발송 한도가 50건**이다(콘솔 실측 2026-08-28). 한도와 별개로,
     모르는 번호에 수천 통을 한 번에 쏘면 스팸 신고가 몰려 계정이 30일 정지된다.
     그래서 "한 번에 다 보내기"가 아니라 하루 50건씩 나눠 보내는 구조로 만든다.

   누구에게 보내는가 (사장님 확정 2026-08-28)
     **오늘부터 새로 공실이 잡히는 임대인만.**
     대상 판정은 임대인관리 시트 note 의 `공실감지 YYYY-MM-DD` 다 — 당근 공실감지가 실제
     공실 게시글을 잡아서 넣은 기록이라 "공실이 있었다"가 사실로 확인된 건들이다.
     🚫 수집원 제외 — 속성 VACSMS_SKIP_SOURCES 에 적힌 수집원(예: '오일장')은 대상에서 뺀다.
        2026-08-30: 오일장 직거래 건의 전화번호를 사장님이 정리하는 중이라 잠시 뺐다.
        다시 넣으려면 vacSmsBuild 를 `&skip=` (빈 값)으로 한 번 부른다.
     🔴 밀린 것(08-08~08-27, 실측 376명)은 **일부러 대상에서 뺐다.** 최대 20일 지난 건이라
        이미 나갔을 가능성이 크고, 첫 발송부터 수백 건이 나가면 스팸 신고 위험도 크다.
        기준일은 스크립트 속성 VACSMS_SINCE 에 있다. 밀린 것까지 보내려면 그 값을
        '2026-08-08' 로 바꾸고 vacSmsBuild 를 다시 부르면 된다(되돌리기 = 값 복원).

   🔴 자동 발송하지 않는다
     시간 트리거를 걸지 않았다. vacSmsRun 은 사장님이 화면에서 버튼을 눌러야만 돈다.
     모르는 사람에게 실제로 문자가 나가는 일이라 사람이 매번 시작시킨다.
     (대기열 채우기 vacSmsBuild 는 읽기·적재만 하므로 화면 진입 때 자동으로 돌아도 안전하다)

   되돌리기
     '공실확인발송' 시트를 지우면 대기열이 초기화된다 — 보낸 기록도 사라져 재발송 위험.
     보낸 사실은 남기고 다시 보내고 싶으면 시트를 지우지 말고 status 칸만 '대기'로 바꾼다.
------------------------------------------------------------------------------- */
var VACSMS_SHEET = '공실확인발송';
var VACSMS_HEADERS = ['queuedAt', 'phone', 'apt', 'addr', 'dong', 'detectedAt', 'kind', 'sentAt', 'status', 'error', 'src'];
var VACSMS_DAILY_CAP = 50;          // 솔라피 일일 한도(실측 2026-08-28). 한도가 오르면 이 숫자만 고친다.
var VACSMS_COST = 45;               // 장문 1건 요금(원) — 잔액 부족 예측에만 쓴다
var VACSMS_SINCE_KEY = 'VACSMS_SINCE';
// 🚫 수집원별 제외 (2026-08-30) — 예: '오일장'. 쉼표로 여러 개.
//   사장님 "오일장 직거래의 전화번호는 지금 수정 중이니 무시하고 진행" →
//   번호가 정리될 때까지 오일장 수집분은 문자 대상에서 뺀다.
//   다시 넣으려면 vacSmsBuild 를 `&skip=` (빈 값)으로 한 번 부르면 된다.
var VACSMS_SKIP_KEY = 'VACSMS_SKIP_SOURCES';

function vacSmsSheet_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(VACSMS_SHEET);
  if (!sh) { sh = ss.insertSheet(VACSMS_SHEET); sh.appendRow(VACSMS_HEADERS); sh.setFrozenRows(1); }
  return sh;
}
function vacSmsStamp_() { return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss'); }
function vacSmsToday_() { return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd'); }

/** 기준일 — 이 날짜 **이후에 감지된 공실만** 보낸다. 없으면 처음 부르는 날로 못박는다. */
function vacSmsSince_() {
  var pr = PropertiesService.getScriptProperties();
  var v = String(pr.getProperty(VACSMS_SINCE_KEY) || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) { v = vacSmsToday_(); pr.setProperty(VACSMS_SINCE_KEY, v); }
  return v;
}

/**
 * 🔴 시트에서 읽은 감지일을 'yyyy-MM-dd' 로 되돌린다 — 2026-08-28
 *   시트에 '2026-08-08' 을 넣으면 구글이 **날짜 값으로 바꿔 저장**한다. 다시 읽으면
 *   String() 결과가 'Sat Aug 08 2026 00:00:00 GMT+0900' 이 되어,
 *   문자열로 정렬하면 요일 이름(Fri/Mon/Sat…) 순으로 섞인다.
 *   실제로 발송 순서가 '최신순'이 아니게 되는 버그였다(v71 실측에서 드러남).
 */
function vacSmsDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd');
  var t = String(v == null ? '' : v).trim();
  var m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[0];
  var d = new Date(t);
  return isNaN(d.getTime()) ? '' : Utilities.formatDate(d, 'Asia/Seoul', 'yyyy-MM-dd');
}

/** note 앞머리에서 수집원을 뽑는다 — '당근 공실감지 …' → '당근', '오일장 공실감지 …' → '오일장' */
function vacSmsSource_(note) {
  var m = String(note || '').match(/^\s*([^\s:]+)\s*공실감지/);
  return m ? m[1] : '';
}
/** 제외할 수집원 목록 (스크립트 속성). 비어 있으면 아무것도 제외하지 않는다. */
function vacSmsSkipSources_() {
  var raw = String(PropertiesService.getScriptProperties().getProperty(VACSMS_SKIP_KEY) || '');
  var out = {};
  raw.split(',').forEach(function (x) { var t = x.trim(); if (t) out[t] = true; });
  return out;
}

/** 주소에서 읍면동만 뽑는다 — '제주특별자치도 제주시 노형동 909-5' → '노형동' */
function vacSmsDong_(addr) {
  var m = String(addr || '').match(/([가-힣0-9]+(?:동|읍|면|리))(?=\s|$)/);
  return m ? m[1] : '';
}

/** 시험 번호(010-0000-00xx)는 절대 발송 대상에 넣지 않는다 — 코워크 규칙 16 */
function vacSmsIsTest_(d) { return /^0100000\d{4}$/.test(d) || /^10000000\d{2}$/.test(d); }

/**
 * 🔴 동종업계(다른 공인중개사무소) 차단 — 2026-08-28
 *   제주오일장은 **중개사가 올리는 곳**이라 수집분이 임대인이 아니다.
 *   실측: 오일장 156행 중 151행(96%)이 중개업소, 당근 227행 중 0행.
 *   여기에 공실확인 문자가 나가면 동종업계에 영업 문자를 뿌리는 꼴이 된다 —
 *   제주는 좁아 평판이 상하고 공동중개 관계가 틀어진다. 스팸 신고 위험도 가장 높다.
 *
 *   판정은 상호(apt)와 이름(name)에 중개업 표지어가 있는지로 한다.
 *   실측 정확도: 오일장 151/156 차단(남은 5건은 전부 '개인직거래' = 진짜 직거래 임대인),
 *   당근 진짜 임대인 오탐 0건. 표지어를 넓히면 오탐이 생기니 함부로 늘리지 말 것.
 */
function vacSmsIsAgency_(apt, name) {
  var t = String(apt || '') + ' ' + String(name || '');
  return /(부동산|중개|공인|리얼티|realty|프롭테크|에이전시)/i.test(t);
}

/**
 * 문자 문안 — index.html 의 smsTpl.vacancy.임대인 과 **같은 문구**여야 한다.
 * 한쪽만 고치면 화면 미리보기와 실제 발송이 달라진다. 고칠 땐 반드시 양쪽 다.
 */
/** 동 이름 + 건물명을 합칠 때 겹치는 것을 뺀다 (2026-08-30)
   실제 대기열 미리보기에서 **'오등동 오등동진평연립주택'** 으로 나왔다. 건물명에 이미 동이
   들어 있는데 앞에 또 붙인 것이다. 첫 발송 전에 잡았다.
   규칙 (보수적으로 — 애매하면 그냥 둔다)
     ① 건물명이 동 이름으로 시작하면 동을 빼고 건물명만    '오등동'+'오등동진평연립주택' → '오등동진평연립주택'
     ② 동에서 끝의 동/읍/면/리를 떼어낸 앞부분(2글자 이상)으로 시작해도 뺀다
        '노형동'+'노형뜨란채' → '노형뜨란채'
        🔴 2글자 미만이면 안 뺀다 — '연동'의 앞부분은 '연' 한 글자라 '연립주택'까지
           걸려 버린다. 그래서 '연동 투에이치 오피스텔'은 그대로 둔다(정상).
     ③ 그 밖에는 그대로 '동 건물명' */
function vacSmsPlace_(dong, apt) {
  var d = String(dong || '').trim();
  var a = String(apt || '').trim();
  if (!d) return a;
  if (!a) return d;
  if (a.indexOf(d) === 0) return a;                       // ① 건물명이 동으로 시작
  var stem = d.replace(/(동|읍|면|리)$/, '');
  if (stem.length >= 2 && a.indexOf(stem) === 0) return a; // ② 앞부분이 겹침(2글자 이상일 때만)
  return (d + ' ' + a).replace(/\s+/g, ' ').trim();
}

function vacSmsText_(dong, apt) {
  var b = vacSmsPlace_(dong, apt);
  return '안녕하세요. ' + (b ? b + ' ' : '') + '공실 있는지 확인차 연락드렸습니다.\n'
       + '공실이 있으시다면 세입자를 빠르게 맞춰보겠습니다.\n'
       + '감사합니다.\n\n'
       + '브리즈부동산중개 대표 박정희\n'
       + '제주시 삼무로1길 13, 1층';
}

/**
 * 임대인관리 → 대기열 채우기 (멱등: 이미 큐에 있는 번호는 다시 넣지 않는다)
 * 같은 번호가 여러 건물로 잡히면 **가장 최근 감지 건** 하나만 남긴다 — 한 사람에게 두 통 가면 안 된다.
 * since 를 넘기면 그 날짜부터, 안 넘기면 VACSMS_SINCE(처음 실행한 날)부터.
 */
function vacSmsBuild(since, skip) {
  // skip 을 넘기면 그 값을 속성에 저장한다(빈 문자열이면 제외 해제). 안 넘기면 기존 설정을 쓴다.
  if (skip !== undefined && skip !== null) {
    PropertiesService.getScriptProperties().setProperty(VACSMS_SKIP_KEY, String(skip));
  }
  var skipSrc = vacSmsSkipSources_();
  var from = /^\d{4}-\d{2}-\d{2}$/.test(String(since || '')) ? String(since) : vacSmsSince_();
  var rows = getAllData('landlords') || [];
  var det = /공실감지\s*(\d{4}-\d{2}-\d{2})/;
  var kindRe = /공실감지[^:]*:\s*([^\s]+)/;
  var best = {};                                  // 번호 → 가장 최근 감지 건
  var scanned = 0, noDetect = 0, tooOld = 0, badPhone = 0, testSkip = 0, agencySkip = 0, sourceSkip = 0;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i] || {};
    scanned++;
    var note = String(r.note || '');
    var m = det.exec(note);
    if (!m) { noDetect++; continue; }              // 감지 기록 없는 옛 수집분 → 대상 아님
    if (m[1] < from) { tooOld++; continue; }       // 기준일 이전 = 밀린 것 → 보내지 않는다
    var src = vacSmsSource_(note);
    if (src && skipSrc[src]) { sourceSkip++; continue; }   // 🚫 제외 수집원(예: 번호 정리 중인 오일장)
    var d = String(r.phone || '').replace(/\D/g, '');
    if (d.length < 10 || d.length > 11) { badPhone++; continue; }
    if (vacSmsIsTest_(d)) { testSkip++; continue; }
    // 🔴 다른 중개사무소에는 보내지 않는다 (오일장 수집분 96%가 중개업소)
    if (vacSmsIsAgency_(r.apt, r.name)) { agencySkip++; continue; }
    var km = kindRe.exec(note);
    var cand = { phone: d, apt: String(r.apt || '').trim(), addr: String(r.addr || '').trim(),
                 detectedAt: m[1], kind: km ? km[1] : '', src: src };
    if (!best[d] || cand.detectedAt > best[d].detectedAt) best[d] = cand;
  }
  var sh = vacSmsSheet_();
  var have = {};
  var v = sh.getDataRange().getValues();
  for (var j = 1; j < v.length; j++) {
    var hd = String(v[j][1] || '').replace(/\D/g, '');
    if (hd) have[hd] = true;
  }
  var add = [], stamp = vacSmsStamp_(), targets = 0;
  for (var k in best) {
    targets++;
    if (have[k]) continue;
    var c = best[k];
    // 앞의 홑따옴표: 시트가 010… 을 숫자로 읽어 앞 0 을 떨구는 것을 막는다
    add.push([stamp, "'" + c.phone, c.apt, c.addr, vacSmsDong_(c.addr), c.detectedAt, c.kind, '', '대기', '', c.src || '']);
  }
  if (add.length) sh.getRange(sh.getLastRow() + 1, 1, add.length, VACSMS_HEADERS.length).setValues(add);
  logChange('vacSms', 'build', '대기열 ' + add.length + '건 추가 (기준일 ' + from + ')');
  return { since: from, scanned: scanned, targets: targets, added: add.length,
           alreadyQueued: targets - add.length,
           noDetect: noDetect, skippedOlderThanSince: tooOld, badPhone: badPhone,
           testSkip: testSkip, agencySkip: agencySkip, sourceSkip: sourceSkip,
           skipSources: Object.keys(skipSrc), at: stamp };
}

/**
 * 대기 중인 행만 지운다 — 발송완료·실패 기록은 남겨 재발송을 막는다.
 * 왜 필요한가: vacSmsBuild 에 since 를 넘기면 **그 자리에서 적재까지 한다**(계산만 하지 않는다).
 *   2026-08-28 실제로 '참고 계산' 의도로 since=2026-08-08 을 부르는 바람에 사장님이 빼라고 한
 *   밀린 225건이 대기열에 들어갔다. 그때 되돌리려고 만든 것.
 * before 를 주면 그 날짜 **이전** 감지분만 지운다(밀린 것만 걷어낼 때).
 */
function vacSmsClearWaiting(before, source) {
  var srcWant = String(source || '').trim();
  var sh = vacSmsSheet_();
  var v = sh.getDataRange().getValues();
  var cut = /^\d{4}-\d{2}-\d{2}$/.test(String(before || '')) ? String(before) : '';
  var del = 0;
  for (var i = v.length - 1; i >= 1; i--) {
    if (String(v[i][8] || '').trim() !== '대기') continue;
    if (cut && vacSmsDate_(v[i][5]) >= cut) continue;
    if (srcWant && String(v[i][10] || '').trim() !== srcWant) continue;   // 수집원 지정 시 그것만
    sh.deleteRow(i + 1); del++;
  }
  logChange('vacSms', 'clear', '대기 ' + del + '행 삭제' + (cut ? ' (' + cut + ' 이전)' : ''));
  return { deleted: del, before: cut || '(전체)', at: vacSmsStamp_() };
}

/** 대기열 현황 — 화면에 숫자만 보여주는 용도(발송하지 않는다) */
function vacSmsStat() {
  var sh = vacSmsSheet_();
  var v = sh.getDataRange().getValues();
  var today = vacSmsToday_();
  var wait = 0, sent = 0, fail = 0, sentToday = 0, oldest = '', newest = '';
  for (var i = 1; i < v.length; i++) {
    var st = String(v[i][8] || '').trim();
    var sa = String(v[i][7] || '');
    if (st === '발송완료') { sent++; if (sa.indexOf(today) === 0) sentToday++; }
    else if (st === '실패') fail++;
    else if (st === '대기') {
      wait++;
      var dt = vacSmsDate_(v[i][5]);
      if (dt) { if (!newest || dt > newest) newest = dt; if (!oldest || dt < oldest) oldest = dt; }
    }
  }
  var bal = null;
  try { var b = smsBalance(); bal = (b && b.balance != null) ? b.balance : null; } catch (e) {}
  return { since: vacSmsSince_(), wait: wait, sent: sent, failed: fail, sentToday: sentToday,
           remainToday: Math.max(0, VACSMS_DAILY_CAP - sentToday), dailyCap: VACSMS_DAILY_CAP,
           balance: bal, affordable: (bal == null ? null : Math.floor(bal / VACSMS_COST)),
           oldestWaiting: oldest, newestWaiting: newest, at: vacSmsStamp_() };
}

/**
 * 오늘치 발송. 기본 50건, 감지일 **최신순**(최근에 올라온 공실일수록 아직 비어 있을 확률이 높다).
 * dry=true 면 실제로 보내지 않고 누구에게 무엇이 갈지만 돌려준다.
 * 🔴 잔액을 먼저 본다 — 08-27 실패 4건의 사유가 전부 '잔액 부족'이었는데 조용히 실패해서
 *    몇 주 동안 몰랐다. 이제 부족하면 아예 시작하지 않고 이유를 돌려준다.
 */
function vacSmsRun(limit, dry) {
  var cap = parseInt(limit, 10);
  if (isNaN(cap) || cap <= 0) cap = VACSMS_DAILY_CAP;
  var st = vacSmsStat();
  if (st.remainToday <= 0)
    return { ok: false, reason: '오늘 한도 소진 — ' + st.sentToday + '/' + VACSMS_DAILY_CAP + '건 발송함', sent: 0, failed: 0 };
  cap = Math.min(cap, st.remainToday);
  if (!dry) {
    if (st.balance != null && st.balance < VACSMS_COST)
      return { ok: false, reason: '솔라피 잔액 부족(' + st.balance + '원) — 충전 후 다시 누르세요', sent: 0, failed: 0 };
    if (st.affordable != null && st.affordable < cap) cap = Math.max(1, st.affordable);
  }

  var sh = vacSmsSheet_();
  var v = sh.getDataRange().getValues();
  var pick = [];
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][8] || '').trim() !== '대기') continue;
    pick.push({ row: i + 1, phone: String(v[i][1] || '').replace(/\D/g, ''),
                apt: String(v[i][2] || ''), dong: String(v[i][4] || ''), detectedAt: vacSmsDate_(v[i][5]) });
  }
  pick.sort(function (a, b) { return a.detectedAt < b.detectedAt ? 1 : (a.detectedAt > b.detectedAt ? -1 : 0); });
  pick = pick.slice(0, cap);
  if (!pick.length) return { ok: true, sent: 0, failed: 0, reason: '보낼 대기 건이 없습니다', preview: [] };

  var preview = pick.slice(0, 3).map(function (p) { return { to: p.phone, text: vacSmsText_(p.dong, p.apt) }; });
  if (dry) return { ok: true, dry: true, wouldSend: pick.length, preview: preview };

  var sent = 0, failed = 0, errs = [], stamp = vacSmsStamp_();
  for (var j = 0; j < pick.length; j++) {
    var p = pick[j];
    if (vacSmsIsTest_(p.phone)) { sh.getRange(p.row, 8, 1, 3).setValues([[stamp, '건너뜀', '시험번호']]); continue; }
    // 2차 방어 — 필터를 넣기 전에 쌓인 행, 손으로 넣은 행까지 발송 직전에 한 번 더 본다
    if (vacSmsIsAgency_(p.apt, '')) { sh.getRange(p.row, 8, 1, 3).setValues([[stamp, '건너뜀', '중개업소']]); continue; }
    var r = smsSendMany([{ to: p.phone, text: vacSmsText_(p.dong, p.apt) }]);
    if (r && r.sent) { sent++; sh.getRange(p.row, 8, 1, 3).setValues([[vacSmsStamp_(), '발송완료', '']]); }
    else {
      failed++;
      var msg = (r && r.failed && r.failed[0]) ? String(r.failed[0]) : '알 수 없는 오류';
      sh.getRange(p.row, 8, 1, 3).setValues([[vacSmsStamp_(), '실패', msg]]);
      if (errs.length < 5) errs.push(msg);
      // 잔액이 바닥나면 남은 건을 실패로 태우지 않고 즉시 멈춘다(대기 상태로 남겨 다음에 재시도)
      if (/잔액|balance|Insufficient/i.test(msg)) { errs.push('잔액 부족으로 중단'); break; }
    }
  }
  logChange('vacSms', 'run', sent + '건 발송' + (failed ? ' / 실패 ' + failed : ''));
  return { ok: true, sent: sent, failed: failed, errors: errs, preview: preview, at: vacSmsStamp_() };
}

/* ───────── 구글캘린더: CRM 앱 방문예약 버튼 → 종일 일정 ───────── */
function addCalendarEvent(title, dateStr) {
  if (!title) throw new Error('일정 제목이 필요합니다');
  var d = dateStr ? new Date(dateStr + 'T00:00:00+09:00') : new Date();
  CalendarApp.getDefaultCalendar().createAllDayEvent(String(title), d);
  logChange('calendar', 'add', title + ' @ ' + (dateStr || '오늘'));
  return { title: String(title), date: dateStr || '' };
}

/* ───────── 임대인 권한 분리: 토큰 → 사용자 해석 / 직원 계정 관리 ───────── */
// 이름 마스킹: "박정희" → "박**" (담당자는 알되 임대인 신원은 보호)
function maskName_(name) {
  var s = String(name || '').trim();
  if (!s) return '';
  return s.charAt(0) + Array(Math.max(s.length, 2)).join('*');
}

/* 🔒 2026-09-11 S1 — 인증 '설정 실패' 는 차단이지 허용이 아니다(fail-closed).
   종전 첫 줄은 API_TOKEN 이 비면 누구나 대표(admin)로 봤다.
   설정 사고가 권한 개방으로 뒤집히는 구조였다(무설정 → 전권).
   doGet/doPost 의 tenantLocked_ 가 이미 앞을 막고 있지만, 원시 함수에서도 닫아 이중으로 막는다.
   🔴 토큰 값은 응답·로그·console 어디에도 남기지 않는다 — 원인 문구만 남긴다. */
var AUTH_FAIL_ = '';
function resolveUser_(t) {
  var props = PropertiesService.getScriptProperties();
  var got = props.getProperty('API_TOKEN');
  var admin = String(got === null || got === undefined ? '' : got);
  // undefined · null · '' · 공백만 · 속성 누락 → 전부 차단
  if (!admin.trim()) { AUTH_FAIL_ = 'API_TOKEN 설정 누락'; return null; }
  AUTH_FAIL_ = '';
  // 🔴 비교는 종전 그대로 저장값 원문과 한다(앞뒤 공백이 있는 토큰의 동작을 바꾸지 않는다)
  if (String(t || '') === admin) return { role: 'admin', id: 'admin', name: '대표' };
  var raw = props.getProperty('STAFF_TOKENS');
  if (raw && t) {
    try {
      var map = JSON.parse(raw);
      if (map[String(t)]) {
        return { role: 'staff', id: String(map[String(t)].id), name: String(map[String(t)].name || map[String(t)].id) };
      }
    } catch (err2) {}
  }
  AUTH_FAIL_ = '토큰 불일치';
  return null;
}
/* 인증 실패 원인을 서버 응답에서 구분하기 위한 꼬리말.
   🔴 토큰 값은 절대 넣지 않는다 — 설정 누락일 때만 그 사실만 알린다. */
function authFailNote_() {
  return AUTH_FAIL_ === 'API_TOKEN 설정 누락' ? ' [서버 설정: API_TOKEN 설정 누락]' : '';
}

/** 직원 계정 발급 — STAFF_NAME에 이름을 적고 실행하면 로그에 직원용 링크 출력 */
function addStaffAccount() {
  var STAFF_NAME = '직원이름'; // ← 수정 후 실행
  var props = PropertiesService.getScriptProperties();
  var map = {};
  try { map = JSON.parse(props.getProperty('STAFF_TOKENS') || '{}'); } catch (e2) { map = {}; }
  var token = Utilities.getUuid().replace(/-/g, '');
  var sid = 'staff_' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyMMddHHmmss');
  map[token] = { id: sid, name: STAFF_NAME };
  props.setProperty('STAFF_TOKENS', JSON.stringify(map));
  Logger.log('✅ 직원 "' + STAFF_NAME + '" 계정 생성');
  Logger.log('직원용 연결 링크(이 직원에게만 전달):');
  Logger.log('https://breeze-crm.netlify.app/#gs=' + encodeURIComponent('https://script.google.com/macros/s/AKfycbwM-LUL3NJ19XGeedp0Toz71cYR_RW38bVuh4bfSIzTd2qn-dGyGFLfjsodIyTA4LWu/exec') + '&tk=' + token);
}

function listStaffAccounts() {
  Logger.log(PropertiesService.getScriptProperties().getProperty('STAFF_TOKENS') || '(등록된 직원 없음)');
}


/** ── 대장 주차·세대수 조회 (CRM 주차·세대수 / 대장 일괄보초 전용) ── */
function bldgStat(p) {
  if (!p || !p.sigunguCd || !p.bjdongCd) throw new Error('지번 코드(sigunguCd/bjdongCd)가 없습니다');
  if (!BLDG_API_KEY) throw new Error('BLDG_API_KEY 미설정');

  // 다른 3곳과 동일하게 Encoding형 키(% 포함)는 이중 인코딩하지 않는다 (속성 입력값이라 형식 미보장)
  var baseQs = 'serviceKey=' + (BLDG_API_KEY.indexOf('%') >= 0 ? BLDG_API_KEY : encodeURIComponent(BLDG_API_KEY))
    + '&sigunguCd=' + p.sigunguCd
    + '&bjdongCd=' + p.bjdongCd
    + '&platGbCd=' + (p.platGbCd || '0')
    + '&bun=' + pad4(p.bun)
    + '&ji=' + pad4(p.ji)
    + '&numOfRows=100&_type=json';

  var items = datagoFetch('getBrTitleInfo', baseQs);
  if (!items || !items.length) throw new Error('건축물대장 표제부가 없습니다 (토지·무허가 등)'
    + (DATAGO_LAST_ERR ? ' — 포털 응답: ' + DATAGO_LAST_ERR : ''));

  var n = function (v) { var x = parseFloat(v); return isFinite(x) ? x : 0; };
  var dongDigits = String(p.dong || '').replace(/[^0-9]/g, '');

  var parkTotal = 0, hhldCnt = 0, elvt = 0, elvtEmg = 0, grndFlr = 0, ugrndFlr = 0, used = 0;
  var mainPurps = '', etcPurps = '', useAprDay = '';

  for (var i = 0; i < items.length; i++) {
    var t = items[i];
    if (dongDigits) {
      var dn = String(t.dongNm || '').replace(/[^0-9]/g, '');
      if (dn && dn !== dongDigits) continue;
    }
    used++;
    parkTotal += n(t.indrMechUtcnt) + n(t.oudrMechUtcnt) + n(t.indrAutoUtcnt) + n(t.oudrAutoUtcnt);
    hhldCnt   += n(t.hhldCnt) + n(t.hoCnt);
    elvt      += n(t.rideUseElvtCnt);
    elvtEmg   += n(t.emgenUseElvtCnt);
    grndFlr    = Math.max(grndFlr, n(t.grndFlrCnt));
    ugrndFlr   = Math.max(ugrndFlr, n(t.ugrndFlrCnt));
    if (!mainPurps) mainPurps = t.mainPurpsCdNm || '';
    if (!etcPurps)  etcPurps  = t.etcPurps || '';
    var apr = String(t.useAprDay || '');
    if (!useAprDay && apr.length === 8) useAprDay = apr.slice(0,4)+'-'+apr.slice(4,6)+'-'+apr.slice(6,8);
  }
  if (!used) throw new Error('해당 동의 표제부를 찾지 못했습니다');

  // 대단지 아파트는 주차가 동별 표제부가 아니라 총괄표제부(getBrRecapTitleInfo)에 실린다
  // (노형뜨란채 1079세대·아라KCC 578세대가 표제부 합계 0대로 나온 실측, 2026-08-07).
  // 표제부 합계가 0이면 총괄표제부에서 다시 집계한다. 총괄이 없거나 실패하면 0 그대로 둔다.
  if (!parkTotal) {
    try {
      var recs = datagoFetch('getBrRecapTitleInfo', baseQs) || [];
      for (var r2 = 0; r2 < recs.length; r2++) {
        var q = recs[r2];
        parkTotal += n(q.indrMechUtcnt) + n(q.oudrMechUtcnt) + n(q.indrAutoUtcnt) + n(q.oudrAutoUtcnt);
      }
    } catch (ignored) {}
  }

  return {
    parkTotal: parkTotal,
    parkPerHh: hhldCnt ? Math.round(parkTotal / hhldCnt * 100) / 100 : '',
    hhldCnt:   hhldCnt,
    elevator:  elvt,
    elevatorEmg: elvtEmg,
    grndFlr:   grndFlr,
    ugrndFlr:  ugrndFlr,
    mainPurps: mainPurps,
    etcPurps:  etcPurps,
    useAprDay: useAprDay,
    dongCnt:   used
  };
}

function testDocReq() {
  var sh = getOrCreateSheet('docReqs');
  var header = sh.getRange(1, 1, 1, 12).getValues()[0];
  Logger.log('시트 이름: ' + sh.getName());
  Logger.log('헤더: ' + header.join(', '));
}



// ══════════════════════════════════════════
// 시트 편집 즉시 반영: 상세주소 표기 정규화 (2026-08-08 추가)
//   "101-304"→"101동 304호", "1601"→"1601호" 로 셀 편집 즉시 정리.
//   🔴 API 호출 없음(즉시 처리). 면적·매물번호·대장조회는 무거운 작업이라 여기서 안 한다
//     — 그건 CRM '🛠 시트 보강+불러오기'(enrichListings)가 담당. 여기선 표기만 손본다.
//   onEdit 단순 트리거는 권한이 제한되지만 같은 스프레드시트 셀 쓰기는 허용된다.
// ══════════════════════════════════════════
/* ───────── 🧹 시트 메뉴: 인입함 정리 (2026-08-30) ─────────────────────────
   사장님 "구글시트에서 수정할 수 있도록" — CRM 화면을 열지 않고 시트 안에서 바로 정리한다.
   시트를 열면 상단에 **[🧹 브리즈 정리]** 메뉴가 생긴다.

   왜 메뉴인가
     인입함 미처리 931건 중 795건(85%)이 `문자수신(백업)` 이고, 한 번호가 241건·196건이다.
     문자 대화 전체가 한 줄씩 들어와 있어 **한 건씩 누를 성질이 아니다.**
     시트에서 필터+붙여넣기로 하면 숨은 행까지 덮어쓸 위험이 있다(08-22 삭제 사고와 같은 함정).
     메뉴로 하면 무엇이 몇 건인지 먼저 보여주고, 확인을 받은 뒤, 정확히 그 행만 찍는다.

   🔴 공통 안전장치 (inboxSweep_ 가 지킨다)
     · 이미 처리 표시(AC열)가 있는 행은 건드리지 않는다
     · 고객·임대인 시트는 손대지 않는다 — 인입함 AC열에 도장만 찍는다
     · 실행 전에 반드시 건수와 앞 8건을 보여주고 확인을 받는다(dry 먼저)
   되돌리기: AC열 값을 지우면 다시 미처리가 된다. 원본 문자·통화 내용은 그대로 남는다.

   ⚠ 메뉴는 **시트를 새로 열어야** 나타난다(onOpen 은 열 때 한 번 도는 단순 트리거).
     이미 열어 둔 시트라면 새로고침(F5).
--------------------------------------------------------------------------- */
function onOpen(e) {
  try {
    SpreadsheetApp.getUi()
      .createMenu('🧹 브리즈 정리')
      .addItem('📊 인입함 현황 보기', 'menuInboxStat')
      .addSeparator()
      .addItem('✅ 이미 등록된 번호 정리', 'menuInboxRegistered')
      .addItem('📱 선택한 칸의 번호 전체 정리', 'menuInboxThisPhone')
      .addItem('📂 접수경로로 정리', 'menuInboxByKind')
      .addSeparator()
      .addItem('↩ 선택한 행의 처리 표시 지우기', 'menuInboxUndo')
      .addToUi();
  } catch (err) {}     // 권한 없는 열람자에게는 메뉴가 없어도 시트는 열려야 한다
  try { recOnOpen_(); } catch (err) {}   // 🎙️ 2026-09-07 통화요약 메뉴 (기존 메뉴와 독립)
}

/** 미리보기 → 확인 → 실행. 모든 메뉴가 이 한 갈래만 쓴다(확인 없이 지우는 길을 만들지 않는다) */
function menuSweepConfirm_(ui, title, mode, value) {
  var pre = inboxSweep_(mode, value, true);
  if (pre.error) { ui.alert(title, '⚠ ' + pre.error, ui.ButtonSet.OK); return; }
  if (!pre.matched) { ui.alert(title, '정리할 미처리 건이 없습니다.', ui.ButtonSet.OK); return; }
  var lines = (pre.preview || []).map(function (x) {
    return '  ' + x.row + '행 · ' + (x.phone || '(번호없음)') + ' · ' + x.text;
  }).join('\n');
  var ans = ui.alert(title,
    pre.matched + '건을 처리 완료로 표시합니다.\n\n앞 ' + (pre.preview || []).length + '건 미리보기:\n' + lines +
    '\n\n· 고객·임대인 등록은 건드리지 않습니다(인입함 AC열 표시만).\n' +
    '· 되돌리려면 AC열 값을 지우면 됩니다.\n\n진행할까요?',
    ui.ButtonSet.YES_NO);
  if (ans !== ui.Button.YES) return;
  var r = inboxSweep_(mode, value, false);
  ui.alert(title, '✅ ' + r.marked + '건 정리했습니다.\n\n미처리로 되돌리려면 AC열 값을 지우세요.', ui.ButtonSet.OK);
}

function menuInboxStat() {
  var ui = SpreadsheetApp.getUi();
  var st = inboxStat_();
  if (st.error) { ui.alert('인입함 현황', '⚠ ' + st.error, ui.ButtonSet.OK); return; }
  var kinds = Object.keys(st.byKind || {}).sort(function (a, b) { return st.byKind[b] - st.byKind[a]; })
    .map(function (k) { return '  · ' + k + '  ' + st.byKind[k] + '건'; }).join('\n');
  var tops = (st.topPhones || []).slice(0, 6)
    .map(function (x) { return '  · …' + x.phone + '  ' + x.n + '건'; }).join('\n');
  ui.alert('📊 인입함 현황',
    '전체 ' + st.total + '행 / 미처리 ' + st.unprocessed + '건\n' +
    '이미 고객·임대인으로 등록된 번호에서 온 것: ' + st.alreadyRegistered + '건\n\n' +
    '[접수경로별]\n' + kinds + '\n\n' +
    '[건수 많은 번호]\n' + tops + '\n\n' +
    '문자 대화가 한 줄씩 들어와 한 번호에 수백 건이 쌓입니다.\n' +
    '번호 단위로 정리하시면 빠릅니다.', ui.ButtonSet.OK);
}

function menuInboxRegistered() {
  var ui = SpreadsheetApp.getUi();
  menuSweepConfirm_(ui, '✅ 이미 등록된 번호 정리', 'registered', '');
}

/** 인입함에서 아무 칸이나 클릭한 뒤 실행 — 그 행의 전화번호로 전체를 정리한다 */
function menuInboxThisPhone() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getActiveSheet();
  if (sh.getName() !== '인입함') {
    ui.alert('📱 번호 전체 정리', "'인입함' 탭에서 정리할 행의 아무 칸이나 클릭한 뒤 다시 실행해 주세요.", ui.ButtonSet.OK);
    return;
  }
  var row = sh.getActiveRange().getRow();
  if (row < 2) { ui.alert('📱 번호 전체 정리', '머리글 말고 데이터 행을 클릭해 주세요.', ui.ButtonSet.OK); return; }
  var phone = String(sh.getRange(row, INBOX_PHONE_COL).getValue() || '').trim();
  if (!phone) { ui.alert('📱 번호 전체 정리', '그 행에는 전화번호가 없습니다.', ui.ButtonSet.OK); return; }
  menuSweepConfirm_(ui, '📱 ' + phone + ' 전체 정리', 'phone', phone);
}

function menuInboxByKind() {
  var ui = SpreadsheetApp.getUi();
  var st = inboxStat_();
  var kinds = Object.keys(st.byKind || {}).sort(function (a, b) { return st.byKind[b] - st.byKind[a]; });
  if (!kinds.length) { ui.alert('📂 접수경로로 정리', '미처리 건이 없습니다.', ui.ButtonSet.OK); return; }
  var list = kinds.map(function (k) { return '  · ' + k + '  (' + st.byKind[k] + '건)'; }).join('\n');
  var res = ui.prompt('📂 접수경로로 정리',
    '정리할 접수경로를 그대로 입력하세요.\n\n' + list + '\n\n예: 문자수신(백업)', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var v = String(res.getResponseText() || '').trim();
  if (!v) return;
  if (kinds.indexOf(v) < 0) {
    ui.alert('📂 접수경로로 정리', "'" + v + "' 는 목록에 없습니다. 위 목록에서 그대로 옮겨 적어 주세요.", ui.ButtonSet.OK);
    return;
  }
  menuSweepConfirm_(ui, '📂 ' + v + ' 정리', 'kind', v);
}

/** 잘못 정리했을 때 — 선택한 행들의 AC열만 비운다(원본 데이터는 손대지 않는다) */
function menuInboxUndo() {
  var ui = SpreadsheetApp.getUi();
  var sh = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  if (sh.getName() !== '인입함') {
    ui.alert('↩ 되돌리기', "'인입함' 탭에서 되돌릴 행들을 선택한 뒤 다시 실행해 주세요.", ui.ButtonSet.OK);
    return;
  }
  var rg = sh.getActiveRange();
  var from = Math.max(rg.getRow(), 2), n = rg.getNumRows();
  if (rg.getRow() < 2) n = n - (2 - rg.getRow());
  if (n <= 0) { ui.alert('↩ 되돌리기', '머리글 말고 데이터 행을 선택해 주세요.', ui.ButtonSet.OK); return; }
  var ans = ui.alert('↩ 되돌리기',
    from + '행부터 ' + n + '개 행의 처리 표시를 지웁니다.\n(다시 미처리 상태가 됩니다. 원본 내용은 그대로입니다)\n\n진행할까요?',
    ui.ButtonSet.YES_NO);
  if (ans !== ui.Button.YES) return;
  sh.getRange(from, INBOX_REG_COL, n, 1).clearContent();
  logChange('inbox', 'undo', from + '행부터 ' + n + '행 처리표시 해제');
  ui.alert('↩ 되돌리기', n + '개 행을 미처리로 되돌렸습니다.', ui.ButtonSet.OK);
}

function onEdit(e) {
  try {
    if (!e || !e.range) return;
    var sh = e.range.getSheet();
    if (sh.getName() !== SHEETS.listings) return;       // 매물관리 시트만
    if (e.range.getNumColumns() !== 1 || e.range.getNumRows() !== 1) return; // 단일 셀만
    var row = e.range.getRow();
    if (row === 1) return;                                // 헤더 제외

    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    var cAddr2 = headers.indexOf('addr2') + 1;
    var cApt   = headers.indexOf('apt') + 1;
    var cAddr  = headers.indexOf('addr') + 1;
    var editedCol = e.range.getColumn();
    var raw = String(e.value == null ? '' : e.value).trim();
    if (!raw) return;

    // (1) 상세주소 칸 편집 → 표기 정규화 ("101-304"→"101동 304호")
    if (cAddr2 && editedCol === cAddr2) {
      var norm = normalizeAddr2Text_(raw);
      if (norm && norm !== raw) e.range.setValue(norm);
      return;
    }

    // (2) 건물명(apt) 칸 편집 → 같은 건물명이 시트에 이미 있으면 그 주소를 즉시 물려받는다.
    //     🔴 API 호출 없음(onEdit은 외부 통신이 막혀 있음) — 시트 안에서만 찾는다.
    //     시트에 없는 새 건물명은 여기서 못 채운다 → CRM '🛠 시트 보강+불러오기'가 juso·카카오로 조회.
    if (cApt && cAddr && editedCol === cApt) {
      var curAddr = sh.getRange(row, cAddr).getValue();
      if (String(curAddr == null ? '' : curAddr).trim()) return; // 이미 주소가 있으면 덮지 않는다
      var data = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), sh.getLastColumn()).getValues();
      var wantApt = raw.replace(/\s+/g, '');
      for (var i = 0; i < data.length; i++) {
        if (i + 2 === row) continue;
        var ap = String(data[i][cApt - 1] || '').replace(/\s+/g, '');
        var ad = String(data[i][cAddr - 1] || '').trim();
        if (ap && ad && ap === wantApt) {
          sh.getRange(row, cAddr).setValue(ad);   // 같은 건물의 기존 주소를 넣는다
          break;
        }
      }
      return;
    }
  } catch (err) { /* onEdit은 조용히 실패해야 시트 편집을 막지 않는다 */ }
}

// "101-304"→"101동 304호", "1601"→"1601호". 이미 정리됐거나 판단 불가면 원본 반환.
// (enrichListings 안의 정규화 규칙과 동일하게 유지할 것)
function normalizeAddr2Text_(addr2) {
  addr2 = String(addr2 || '').trim();
  if (!addr2) return addr2;
  // "호"가 이미 있으면(304호·101동 304호) 건드리지 않는다 — 이미 정리된 표기
  if (/\d+\s*호/.test(addr2)) return addr2;
  var dongM = addr2.match(/(\d+)\s*동/);
  var dongVal = dongM ? dongM[1] : '';
  var hoVal = '';
  var dh = addr2.match(/^(\d+)\s*-\s*(\d+)\s*$/);   // "101-304" = 101동 304호
  if (dh) {
    dongVal = dh[1]; hoVal = dh[2];
    return dongVal + '동 ' + hoVal + '호';
  }
  // 순수 숫자만("1601"→"1601호"). 동 표기가 섞였거나 지하·영문 등은 건드리지 않는다.
  if (/^\d+$/.test(addr2)) {
    return addr2 + '호';
  }
  return addr2;
}


// ══════════════════════════════════════════
// onEdit 트리거 설치 (2026-08-10 추가)
//   이 프로젝트는 스프레드시트에 종속되지 않은 독립형(standalone)이라,
//   트리거 화면의 "이벤트 소스"에 "스프레드시트에서"가 뜨지 않는다.
//   그래서 코드로 설치한다. 편집기에서 이 함수를 한 번만 실행하면 끝.
//   여러 번 실행해도 안전하다 — 기존 onEdit 트리거를 지우고 하나만 남긴다.
// ══════════════════════════════════════════
function installOnEditTrigger() {
  var all = ScriptApp.getProjectTriggers();
  var removed = 0;
  for (var i = 0; i < all.length; i++) {
    if (all[i].getHandlerFunction() === 'onEdit') {
      ScriptApp.deleteTrigger(all[i]);
      removed++;
    }
  }
  ScriptApp.newTrigger('onEdit')
    .forSpreadsheet(SpreadsheetApp.openById(SHEET_ID))
    .onEdit()
    .create();
  var now = ScriptApp.getProjectTriggers();
  var cnt = 0;
  for (var j = 0; j < now.length; j++) {
    if (now[j].getHandlerFunction() === 'onEdit') cnt++;
  }
  Logger.log('기존 onEdit 트리거 ' + removed + '개 제거 후 새로 설치');
  Logger.log('현재 onEdit 트리거: ' + cnt + '개 (1개여야 정상)');
  Logger.log('대상 시트: ' + SpreadsheetApp.openById(SHEET_ID).getName());
}

// ══════════════════════════════════════════
// 이실장 광고 프로그램 호환 API (2026-08-12)
//   매경이실장_광고등록.exe 가 쓰는 프로토콜(tabs/list/row/mark)을 CRM 매물관리로 제공.
//   프로그램 쪽은 ⚙시트연결에서 웹앱 주소·토큰만 이 CRM 것으로 바꾸면 코드 수정 없이 작동.
//   - 대상: 물건유형(kind)이 아파트/분양권/오피스텔인 매물 (이실장이 지원하는 종류)
//   - 계약완료·거래완료·임대중 매물은 제외
//   - mark(등록 성공 기록) → 해당 매물 adsFlat에 'isj' 표시 → 광고관리 탭에 광고중으로 뜸
// ══════════════════════════════════════════
function isjKind_(kind) {
  var k = String(kind || '');
  if (k.indexOf('오피스텔') >= 0) return '오피스텔';
  if (k.indexOf('아파트') >= 0 || k.indexOf('분양') >= 0) return '아파트';
  return '';
}

function isjListings_(user) {
  var rows = getAllData('listings', user) || [];
  return rows.filter(function (r) {
    var st = String(r.status || '');
    // CRM 화면의 오프마켓 정의(STATUS_OFF_MARKET)와 동일하게 — 보류도 광고 대상에서 제외
    if (st === '계약완료' || st === '거래완료' || st === '임대중' || st === '보류') return false;
    return !!isjKind_(r.kind);
  });
}

function isjAddrParts_(addr) {
  // '제주특별자치도 제주시 연동 260-15' → 시도/시군구/읍면동
  var t = String(addr || '').trim().split(/\s+/);
  return { sido: t[0] || '', sigungu: t[1] || '', dong: t[2] || '' };
}

// ─── 이실장 단위 정규화 (2026-08-14 추가) ───────────────────────────────────
// 🔴 종전에는 CRM의 자유 텍스트를 '(만)' 단위 칸에 원문 그대로 보냈다. 이실장 프로그램이
//    숫자만 남겨 읽으므로 '3억 2천' → 32만원, '33㎡(10평)' → 3310㎡, '지하1층' → 1층 으로
//    조용히 틀리게 등록됐다. 가격을 사실과 다르게 광고하면 공인중개사법 §18의2 위반 소지다.
//    변환 실패 시 원문 대신 빈 값을 보낸다 — 프로그램이 "시트에 비어 있습니다" 경고를 띄우므로
//    틀린 값이 그대로 올라가는 것보다 안전하다. 규칙은 index.html 의 당근 변환기와 같다.
function isjMoney_(s) {
  s = String(s == null ? '' : s).trim().replace(/[,\s]/g, '').replace(/원$/, '');
  if (!s) return '';
  var v = '', m;
  if ((m = s.match(/^(\d+(?:\.\d+)?)억(?:(\d+(?:\.\d+)?)(천|백)?만?)?$/))) {
    v = String(Math.round(parseFloat(m[1]) * 10000 +
        (m[2] ? parseFloat(m[2]) * (m[3] === '천' ? 1000 : m[3] === '백' ? 100 : 1) : 0)));
  } else if ((m = s.match(/^(\d+(?:\.\d+)?)(천|백)$/))) {
    v = String(Math.round(parseFloat(m[1]) * (m[2] === '천' ? 1000 : 100)));
  } else {
    s = s.replace(/만$/, '');
    if (/^\d+(\.\d+)?$/.test(s)) v = s;
  }
  return (v && Number(v) !== 0) ? v : '';
}
function isjNum_(v) {
  v = String(v == null ? '' : v).trim().replace(/(\d),(\d{3})(?!\d)/g, '$1$2');
  var neg = /지하|^B\d/i.test(v);
  var t = v.match(/\d+(?:\.\d+)?/g) || [];
  if (t.length !== 1 || Number(t[0]) === 0) return '';   // 토큰 2개면('1,2층') 이어붙어 오염되므로 비운다
  return (neg ? '-' : '') + t[0];
}
function isjArea_(v) {
  v = String(v == null ? '' : v).trim().replace(/(\d),(\d{3})(?!\d)/g, '$1$2');
  var m = v.match(/(\d+(?:\.\d+)?)\s*(?:㎡|m2|m²)/i);
  if (m) return Number(m[1]) > 0 ? m[1] : '';
  m = v.match(/(\d+(?:\.\d+)?)\s*평/);
  if (m) return Number(m[1]) > 0 ? String(Math.round(parseFloat(m[1]) * 3.3058 * 100) / 100) : '';
  return isjNum_(v);
}

function isjRowDict_(r) {
  var p = isjAddrParts_(r.addr);
  var type = String(r.type || '');
  var d = {
    '매물번호': r.id || '', '시도': p.sido, '시군구': p.sigungu, '읍면동': p.dong,
    '아파트명': r.apt || '', '동호': r.addr2 || '', '전용㎡': isjArea_(r.area),
    '해당층': isjNum_(r.floor), '총층': isjNum_(r.totalFloor),
    '방수': isjNum_(r.rooms), '욕실수': isjNum_(r.baths),
    '구분': type, '관리비(만)': isjMoney_(r.feeAmt), '방향': r.direction || '',
    '입주가능일': r.availDate || '', '소유자': r.cname || '', '소유자전화': r.cphone || '',
    '매물설명': r.desc || '', '건축물용도': r.bldgUse || '', '사용승인': r.aprDate || '',
    '매매가(만)': '', '전세금(만)': '', '보증금(만)': '', '월세(만)': ''
  };
  if (type === '매매') d['매매가(만)'] = isjMoney_(r.price);
  else if (type === '전세') d['전세금(만)'] = isjMoney_(r.price);
  else { d['보증금(만)'] = isjMoney_(r.price); d['월세(만)'] = isjMoney_(r.rentAmt); }
  return d;
}

function isjTabs_(user) {
  var rows = isjListings_(user);
  var counts = { '아파트': 0, '오피스텔': 0 };
  rows.forEach(function (r) { counts[isjKind_(r.kind)]++; });
  var headers = Object.keys(isjRowDict_({}));
  return { tabs: ['아파트', '오피스텔'].map(function (t) {
    return { tab: t, count: counts[t], headers: headers };
  }) };
}

function isjList_(user, tab, limit) {
  // 🔴 응답 형태는 원본 통합매물장 Code.gs listItems와 동일해야 한다:
  //    { _tab, _key, _row, <한글 요약 컬럼> } — 프로그램 sheet_mapping.summarize()가
  //    _tab/_key와 한글 키(매물번호·아파트명·동호·구분·가격·전용㎡·해당층·소재지·소유자)를 읽는다.
  //    (2026-08-12 교정: 영문 요약 키로 반환하던 초판은 선택창이 전부 공란이 되는 계약 위반이었음)
  var out = [];
  isjListings_(user).forEach(function (r) {
    var t = isjKind_(r.kind);
    if (tab && t !== tab) return;
    var type = String(r.type || '');
    var d = {
      _tab: t, _key: String(r.id || ''), _row: 0,
      '매물번호': r.id || '', '아파트명': r.apt || '', '동호': r.addr2 || '',
      '구분': type, '전용㎡': isjArea_(r.area), '해당층': isjNum_(r.floor),
      '소재지': r.addr || '', '소유자': r.cname || ''
    };
    // 선택창 요약도 등록 폼과 같은 단위로 보여야 사장님이 금액을 보고 고를 수 있다 (2026-08-14)
    if (type === '매매') d['매매가(만)'] = isjMoney_(r.price);
    else if (type === '전세') d['전세금(만)'] = isjMoney_(r.price);
    else { d['보증금(만)'] = isjMoney_(r.price); d['월세(만)'] = isjMoney_(r.rentAmt); }
    out.push(d);
  });
  if (limit && out.length > limit) out = out.slice(0, limit);
  return out;
}

function isjRow_(user, key) {
  // 🔴 응답 형태는 원본 Code.gs getRow와 동일해야 한다: { _tab, _key, _row, data:{한글 전체 컬럼} }
  //    프로그램 row_to_form이 data를, gui가 _tab/_key(등록기록 mark용)를 읽는다.
  //    (2026-08-12 교정: 평면 dict로 반환하던 초판은 폼이 전부 빈값이 되는 계약 위반이었음)
  var rows = isjListings_(user);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id || '').trim() === String(key || '').trim()) {
      return { _tab: isjKind_(rows[i].kind), _key: String(rows[i].id || ''), _row: 0,
               data: isjRowDict_(rows[i]) };
    }
  }
  throw new Error('매물을 찾을 수 없습니다: ' + key);
}

function isjMark_(body) {
  var key = String(body.key || '').trim();
  if (!key) return { marked: false, error: '매물번호(key) 없음' };
  // '매물장만 저장'(광고 미게시)은 광고중 표시를 남기면 거짓 정보가 된다 — 변경이력만 남기고 종료
  if (String(body['광고유형'] || '') === '매물장만 저장') {
    logChange('listings', 'isj-ad', key + ' 이실장 매물장만 저장(광고중 표시 생략)');
    return { marked: true, skipped: '매물장만 저장 — 광고중 표시 안 함', key: key };
  }
  var sheet = getOrCreateSheet('listings');
  var headers = HEADERS['listings'];
  var rows = sheet.getDataRange().getValues();
  // 🔀 2026-08-30: 시트 칼럼을 옮겨도 되도록 **시트의 실제 머리글 위치**를 쓴다(HEADERS 순서 아님)
  var cmIsj = sheetColMap_(sheet);
  var idCol = cmIsj.index['id'], adsCol = cmIsj.index['adsFlat'];
  var listCol = cmIsj.index['adList'], updCol = cmIsj.index['updatedAt'];
  if (idCol === undefined || adsCol === undefined) return { marked: 0, error: '시트 머리글에 id/adsFlat 칸이 없습니다' };
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][idCol]).trim() !== key) continue;
    var now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
    // adsFlat 형식은 CRM 화면(adsFlatten)과 동일: key~광고번호~시각~url 을 | 로 연결
    var segs = String(rows[i][adsCol] || '').split('|').filter(function (s) {
      return s && s.indexOf('isj~') !== 0;      // 기존 isj 기록은 갱신(중복 방지)
    });
    // ~ 와 | 는 세그먼트 구분자라 값에 들어오면 파싱이 깨진다 — 공백으로 치환
    segs.push(['isj', String(body['광고유형'] || '').replace(/[~|]/g, ' '), now, ''].join('~'));
    sheet.getRange(i + 1, adsCol + 1).setValue(segs.join('|'));
    if (listCol >= 0) {
      var al = String(rows[i][listCol] || '').split(',').filter(Boolean);
      if (al.indexOf('이실장') < 0) al.push('이실장');
      sheet.getRange(i + 1, listCol + 1).setValue(al.join(','));
    }
    if (updCol >= 0) sheet.getRange(i + 1, updCol + 1)
      .setValue(Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss'));
    logChange('listings', 'isj-ad', key + ' 이실장 등록(' + String(body['결과'] || '') + ')');
    return { marked: true, key: key };
  }
  return { marked: false, error: '매물번호를 찾지 못함: ' + key };
}

// ══════════════════════════════════════════
// 계약 만기 자동 이메일 알림 (2026-08-12 — 03_만기알리미 패턴 이식)
//   매일 오전 9시 트리거(installExpiryTrigger 로 1회 설치)가 계약 시트를 훑어,
//   만기 100일 이내로 새로 들어온 계약을 대표 이메일 1통(요약)으로 알린다.
//   같은 계약(id+만기일)은 한 번만 — '만기알림로그' 시트에 발송 기록을 남겨 중복을 막는다.
//   계약이 갱신되어 만기일이 바뀌면 새 알림 대상이 된다.
//   수신 주소: 스크립트 속성 EXPIRY_ALERT_EMAIL(선택), 없으면 스크립트 소유자 지메일.
//   ※ 화면(만기관리 탭)은 그대로 수동 조회용 — 이것은 "앱을 안 열어도 오는" 푸시 역할.
// ══════════════════════════════════════════
var EXPIRY_ALERT_DAYS = 100;   // 만기 며칠 전부터 알릴지 (만기알리미의 100일 골든타임)

function expiryDaysLeft_(dateStr) {
  var m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  // new Date('yyyy-mm-dd')는 UTC 자정으로 읽혀 KST에서 하루가 밀린다 — 반드시 연·월·일로 생성
  var end = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  return Math.floor((end.getTime() - today.getTime()) / 86400000);
}

function checkExpiryDaily() {
  // ⚖ 2026-09-08: 매매 계약 신고·해제·등기 추적을 여기(09시)에 얹는다 — 새 트리거 설치 불필요. 실패해도 만기 알림은 계속.
  try { riskSweepDaily(); } catch (eRisk) { try { logChange('risk', 'sweep', '오류: ' + (eRisk && eRisk.message || eRisk)); } catch (e2) {} }
  var contracts = getAllData('contracts', null) || [];
  var due = [];
  for (var i = 0; i < contracts.length; i++) {
    var c = contracts[i];
    if (String(c.type || '') === '매매') continue;   // 매매는 만기 개념 없음 (만기관리 탭과 동일)
    var d = expiryDaysLeft_(c.end);
    if (d === null || d > EXPIRY_ALERT_DAYS || d < -30) continue;  // 경과 30일까지 (화면과 동일)
    due.push({ c: c, d: d });
  }

  var msg;
  if (!due.length) {
    msg = '만기 ' + EXPIRY_ALERT_DAYS + '일 이내 계약 없음';
    Logger.log(msg);
    return msg;
  }

  // 이미 알린 계약(id+만기일)은 제외
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var log = ss.getSheetByName('만기알림로그');
  if (!log) {
    log = ss.insertSheet('만기알림로그');
    log.appendRow(['발송일시', '계약id', '건물명', '만기일', '남은일수', '수신주소']);
    log.setFrozenRows(1);
  }
  var already = {};
  var lr = log.getDataRange().getValues();
  for (var j = 1; j < lr.length; j++) {
    already[String(lr[j][1]) + '|' + fmtCell(lr[j][3])] = true;
  }
  var fresh = due.filter(function (x) {
    return !already[String(x.c.id) + '|' + String(x.c.end)];
  });
  if (!fresh.length) {
    msg = '대상 ' + due.length + '건 전부 이미 알림 완료 — 새로 보낼 것 없음';
    Logger.log(msg);
    return msg;
  }

  fresh.sort(function (a, b) { return a.d - b.d; });
  var to = PropertiesService.getScriptProperties().getProperty('EXPIRY_ALERT_EMAIL')
        || Session.getEffectiveUser().getEmail();
  var lines = fresh.map(function (x) {
    var c = x.c;
    var who = [];
    if (c.tenantName) who.push('임차인 ' + c.tenantName + (c.tenantPhone ? '(' + c.tenantPhone + ')' : ''));
    if (c.landlordName) who.push('임대인 ' + c.landlordName + (c.landlordPhone ? '(' + c.landlordPhone + ')' : ''));
    return '■ ' + (c.apt || '건물명 미입력') + (c.addr2 ? ' ' + c.addr2 : '')
      + ' — ' + (c.type || '') + (c.price ? ' ' + c.price : '') + (c.rentAmt ? '/' + c.rentAmt : '') + '\n'
      + '   만기일 ' + c.end + ' (' + (x.d < 0 ? (-x.d) + '일 지남' : 'D-' + x.d) + ')'
      + (who.length ? '\n   ' + who.join(' / ') : '');
  });
  var subject = '🚨[브리즈CRM 만기알림] 계약 ' + fresh.length + '건이 만기 '
    + EXPIRY_ALERT_DAYS + '일 이내로 들어왔습니다';
  var body = '대표님, 만기가 다가오는 계약이 있습니다.\n'
    + '갱신청구권 사용·재계약 여부를 먼저 확인해 선점하세요!\n\n'
    + lines.join('\n\n') + '\n\n'
    + 'CRM 만기관리 탭에서 상태(연장/종료/협의중)를 관리하세요:\n'
    + 'https://eya170823-rgb.github.io/crm/\n\n'
    + '(이 메일은 CRM 백엔드가 매일 오전 9시경 자동 발송합니다. 같은 계약은 한 번만 알립니다.)';
  MailApp.sendEmail(to, subject, body);

  var now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
  fresh.forEach(function (x) {
    log.appendRow([now, x.c.id || '', x.c.apt || '', x.c.end || '', x.d, to]);
  });
  logChange('contracts', 'expiry-alert', fresh.length + '건 만기알림 메일 발송 → ' + to);
  msg = fresh.length + '건 발송 → ' + to + ' (대상 ' + due.length + '건 중 신규만)';
  Logger.log(msg);
  return msg;
}

// 만기알림 트리거 설치 — 편집기에서 1회 실행 (installOnEditTrigger 와 같은 방식)
// 🔴 다른 트리거(onEdit 등)는 절대 건드리지 않는다. 여러 번 실행해도 안전(자기 것만 재설치).
// 매일 새벽 자동 보강 (2026-08-14 추가)
//   버튼을 안 눌러도 시트에 적어 둔 매물이 다음 날 아침엔 채워져 있게 한다.
//   결과는 '변경이력' 시트에 남으므로 나중에 무엇이 언제 바뀌었는지 볼 수 있다.
//   ⚠ 실패해도 예외를 밖으로 던지지 않는다 — 트리거가 죽으면 다음 날도 안 돌기 때문이다.
function enrichDaily() {
  try {
    var r = enrichListings();
    var msg = (r.enriched || 0) + '행 보강, 중복 ' + (r.removed || 0) + '건 제거';
    if (r.notes && r.notes.length) msg += ' / ' + r.notes.join(' | ');
    logChange('listings', 'enrichDaily', msg);
    Logger.log('자동 보강 완료 — ' + msg);
    try { bldgDayCachePrune_(); } catch (ePr) {}   // 🧩 2026-09-08 대장캐시 7일 지난 줄 정리
  } catch (e) {
    var em = '자동 보강 실패: ' + (e && e.message || e);
    try { logChange('listings', 'enrichDaily', em); } catch (e2) {}
    Logger.log(em);
  }
}

function installEnrichTrigger() {
  var all = ScriptApp.getProjectTriggers();
  var removed = 0;
  for (var i = 0; i < all.length; i++) {
    if (all[i].getHandlerFunction() === 'enrichDaily') {
      ScriptApp.deleteTrigger(all[i]);
      removed++;
    }
  }
  ScriptApp.newTrigger('enrichDaily').timeBased().everyDays(1).atHour(5).create();
  Logger.log('기존 자동보강 트리거 ' + removed + '개 제거 후 새로 설치 — 매일 새벽 5시경 실행');
  Logger.log('바로 시험하려면 enrichDaily 함수를 직접 실행해 보세요 (변경이력 시트에 결과가 남습니다)');
}

// ═══ 문자수신함 → 인입함 자동 회수 (구글 서버 단독, 2026-08-15) ═══
// 사장님 지시: "무엇을 눌러야 수집되는 게 아니라 저절로 수집되는 시스템이어야 한다."
// 종전에는 메인컴 server.py 만 회수할 수 있어 PC가 꺼지면 멈췄다(8/13 11:39 실제 정지).
// 이제 구글 서버가 10분마다 스스로 회수한다 — PC 불필요.
//   · PC(server.py)가 살아 있으면 5분 안에 가져가므로, 여기는 30분 넘게 남은 것만 처리한다
//     (이중 안전망 — 처리여부(F열)를 서로 확인해 절대 겹치지 않는다)
//   · 분류·기록 형식은 server.py 와 동일(인입함 26칸·공실현황 5칸·임대완료 규칙)
//   · PC 전용 기능(통화녹음 STT·사진 OCR·AI 요약)은 그대로 PC 몫 — 여기서는 문자만
var SMS_SWEEP_AGE_MIN = 30;        // 메인컴이 살아 있을 때 양보하는 시간(분)
/* 🔴 2026-08-30 — "인입이 안 된다"가 몇 주째 되풀이된 진짜 원인
   구조: 폰 → GAS '문자수신함' → **메인컴 server.py 가 즉시 회수** → 인입함
         메인컴이 못 하면 GAS 가 10분 트리거로 대신 한다(폴백).
   그런데 폴백은 **30분을 기다린 뒤** 처리한다. 메인컴이 먼저 하도록 양보하는 시간이다.
   문제: 메인컴 server.py 가 **2026-08-27 14:09 이후 죽어 있었다**
   (수신로그.jsonl 이 그날 멈춤 / 문자수신함 도장이 '처리완료'→'GAS자동'으로 바뀜).
   죽은 상대를 30분씩 기다리니 **문자가 올 때마다 30분 넘게 인입함에 안 보였다.**
   실측: 13:19:29 문자수신함 도착 → 13:23 까지 '미처리' → 인입함 마지막은 전날 23:25.
   → 메인컴이 최근에 실제로 처리한 적이 있는지 보고, 없으면 양보를 2분으로 줄인다.
      메인컴이 살아나면 저절로 30분 양보로 돌아간다(사람이 손댈 것 없음). */
var SMS_SWEEP_AGE_DEAD = 2;        // 메인컴이 죽어 있을 때 양보하는 시간(분)
var SMS_PC_ALIVE_MIN = 90;         // 이 시간 안에 '처리완료' 도장이 있으면 메인컴 생존으로 본다
var SMS_RENT_DONE_RE = /나갔(?:습니다|어요|다고|음)|나감|빠졌|빠짐|계약\s*(?:완료|됐|되었|체결)/;

function smsPhoneKey_(p) {
  var d = String(p || '').replace(/\D/g, '');
  if (d.slice(0, 2) === '82') d = '0' + d.slice(2);
  return d;
}
function smsFmtPhone_(p) {
  var d = smsPhoneKey_(p);
  if (d.length === 11) return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
  if (d.length === 10) return d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
  return String(p || '');
}
// CRM 시트(임대인·매물·고객)의 전화번호 색인 — server.py load_crm_index 의 축약판
function smsPhoneIndex_() {
  var idx = {};
  // 🔴 2026-09-13: flagCols 를 더했다 — 연락금지·수신거부·종료 고객을 자동응답에서 빼기 위해
  //   같은 스캔에서 상태 칸을 함께 담는다(시트를 또 읽지 않는다).
  function feed(type, phoneCol, nameCol, bldCol, isOwner, flagCols) {
    try {
      var v = getOrCreateSheet(type).getDataRange().getValues();
      if (v.length < 2) return;
      var h = v[0].map(String);
      var pi = h.indexOf(phoneCol), ni = h.indexOf(nameCol), bi = bldCol ? h.indexOf(bldCol) : -1;
      if (pi < 0) return;
      for (var i = 1; i < v.length; i++) {
        var toks = String(v[i][pi] || '').split(/[,\/;·\s]+/);
        for (var t = 0; t < toks.length; t++) {
          var k = smsPhoneKey_(toks[t]);
          if (k.length >= 9 && !idx[k]) {
            var flags = '';
            if (flagCols) {
              for (var fc = 0; fc < flagCols.length; fc++) {
                var ci2 = h.indexOf(flagCols[fc]);
                if (ci2 >= 0) flags += ' ' + String(v[i][ci2] || '');
              }
            }
            idx[k] = { name: ni >= 0 ? String(v[i][ni] || '') : '',
                       bld: bi >= 0 ? String(v[i][bi] || '') : '', owner: !!isOwner,
                       type: type, flags: flags };
          }
        }
      }
    } catch (e) {}
  }
  feed('landlords', 'phone', 'name', 'apt', true, ['contactStatus', 'banReason', 'note']);
  feed('listings', 'cphone', 'cname', 'apt', true, ['note']);
  feed('customers', 'phone', 'name', null, false, ['progressStatus', 'step', 'note']);
  return idx;
}
function smsExcluded_(ss) {
  var out = {};
  try {
    var sh = ss.getSheetByName('제외번호');
    if (!sh) return out;
    var v = sh.getDataRange().getValues();
    for (var i = 1; i < v.length; i++) {
      var k = smsPhoneKey_(v[i][0]);
      if (k) out[k] = true;
    }
  } catch (e) {}
  return out;
}
/* ══ 🚫 그만 받을 번호 (2026-09-09 대표 지시) ══
   '제외번호' 시트가 곧 규칙이다. A열에 번호를 적으면 그 번호를, 글자를 적으면 그 이름을 막는다.
   server.py 가 10분마다 이 시트를 다시 읽어 반영한다(즉시 반영은 아니다).
   🔴 등록하면 이미 쌓인 그 번호의 인입함 행도 서버가 지운다 — 되돌려도 지난 기록은 돌아오지 않는다. */
function excludeSheet_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName('제외번호');
  if (!sh) {
    sh = ss.insertSheet('제외번호');
    sh.appendRow(['전화번호', '메모(누구/왜 제외하는지)']);
  }
  return sh;
}
function excludeKey_(x) { return String(x || '').replace(/[^0-9A-Za-z가-힣]/g, ''); }

function excludeList_() {
  var sh = excludeSheet_();
  var v = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < v.length; i++) {
    var a = String(v[i][0] || '').trim();
    if (a) out.push({ row: i + 1, key: a, memo: String(v[i][1] || ''), isName: !/^[0-9\-\+\s()]+$/.test(a) });
  }
  return { rows: out, count: out.length };
}

function excludeAdd_(user, key, memo) {
  adminOnly_(user, '그만 받을 번호 등록');
  key = String(key || '').trim();
  if (!key) return { added: false, error: '번호나 이름이 비었습니다' };
  var sh = excludeSheet_();
  var v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (excludeKey_(v[i][0]) === excludeKey_(key)) return { added: false, already: true, key: key };
  }
  sh.appendRow([key, String(memo || '') + ' — 화면에서 등록 '
    + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm')]);
  return { added: true, key: key, note: '서버가 10분 안에 반영합니다. 이미 쌓인 같은 번호의 인입함 줄도 정리됩니다.' };
}

function excludeDel_(user, key) {
  adminOnly_(user, '그만 받을 번호 되돌리기');
  var sh = excludeSheet_();
  var v = sh.getDataRange().getValues();
  for (var i = v.length - 1; i >= 1; i--) {
    if (excludeKey_(v[i][0]) === excludeKey_(key)) { sh.deleteRow(i + 1); return { removed: true, key: key }; }
  }
  return { removed: false, error: '목록에 없습니다' };
}

/* 📥 인입함에 쌓인 '보낸 사람'을 번호별로 묶어 준다 — 무엇을 그만 받을지 고르는 화면용.
   🔴 판단하지 않는다. 건수·이름·마지막 날짜만 세어 주고 고르는 것은 사람이 한다. */
function inboxSenders_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName('인입함');
  if (!sh) return { rows: [], count: 0, error: '인입함 시트가 없습니다' };
  var v = sh.getDataRange().getValues();
  var map = {}, excl = {};
  try {
    var ev = excludeSheet_().getDataRange().getValues();
    for (var e2 = 1; e2 < ev.length; e2++) { var k2 = excludeKey_(ev[e2][0]); if (k2) excl[k2] = true; }
  } catch (e3) {}
  for (var i = 1; i < v.length; i++) {
    var phone = String(v[i][7] || '').trim();
    var name  = String(v[i][6] || '').trim();
    var kind  = String(v[i][4] || '').trim();
    var when  = v[i][3] ? String(v[i][3]).slice(0, 10) : '';
    var key   = excludeKey_(phone) || excludeKey_(name);
    if (!key) continue;
    if (!map[key]) map[key] = { key: key, phone: phone, names: {}, kinds: {}, n: 0, last: '', already: !!excl[key] };
    var m = map[key];
    m.n++;
    if (name) m.names[name] = 1;
    if (kind) m.kinds[kind] = 1;
    if (when > m.last) m.last = when;
    if (!m.phone && phone) m.phone = phone;
  }
  var out = [];
  for (var k in map) {
    var r = map[k];
    out.push({ key: r.key, phone: r.phone, name: Object.keys(r.names).join(' / '),
               kinds: Object.keys(r.kinds).join('·'), n: r.n, last: r.last, already: r.already });
  }
  out.sort(function (a, b) { return b.n - a.n; });
  return { rows: out, count: out.length };
}

// server.py inbox_row 와 동일한 26칸 배치 (A~Z만 — AA·AB는 접수장 수식 자리)
function smsInboxRow_(status, kind, phone, name, text, building, now) {
  var row = [];
  for (var i = 0; i < 26; i++) row.push('');
  row[0] = status;                       // A 고객상태
  row[3] = now;                          // D 등록일
  row[4] = kind;                         // E 접수경로
  row[6] = String(name || '');           // G 이름1
  row[7] = smsFmtPhone_(phone);          // H 전화1
  row[16] = String(building || '');      // Q 특정물건 (매칭 건물명)
  row[21] = String(text || '');          // V 상담내용
  return row;
}
/**
 * 메인컴 server.py 가 살아 있는가 — 문자수신함의 '처리완료' 도장으로 판단한다.
 * v: 문자수신함 전체 값(이미 읽어 둔 것을 넘겨 재조회를 피한다)
 * 돌려주는 값: { alive, last } — last 는 마지막으로 메인컴이 처리한 시각(문자열)
 */
function smsPcAlive_(v) {
  var newest = 0, txt = '';
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][5] || '').trim() !== '처리완료') continue;   // 메인컴만 이 도장을 찍는다
    var c = v[i][6];                                            // 처리시각
    // instanceof Date 만 보면 안 된다 — 다른 실행 영역(vm·라이브러리)에서 온 Date 는
    // instanceof 가 false 로 나온다. getTime 이 있으면 날짜로 본다.
    var t = (c && typeof c.getTime === 'function')
              ? c.getTime()
              : new Date(String(c || '').replace(' ', 'T')).getTime();
    if (!isNaN(t) && t > newest) { newest = t; txt = fmtCell(c); }
  }
  if (!newest) return { alive: false, last: '' };
  return { alive: (new Date().getTime() - newest) <= SMS_PC_ALIVE_MIN * 60000, last: txt };
}

function smsQueueSweep() {
  try { phoneSmsSweep_(); } catch (pe) {}   // 📱 폰 발송 ack 없는 건 문자 폴백 (같은 10분 트리거에 편승)
  try { kakaoTplAutoCheck_(); } catch (ke) {}  // 💛 알림톡 템플릿 승인 감시 — 승인되면 자동 활성+테스트 1회
  try { scheduleSweep_(); } catch (se) {}      // 📅 미팅·계약·잔금 리마인더(1일 전·당일, 9~21시만)
  try { listingsGuard_(); } catch (ge) {}     // 🛡 매물 소실 감시 + 10분 스냅샷 (2026-09-02)
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var q = ss.getSheetByName(SMS_QUEUE);
  if (!q) return { done: 0 };
  var v = q.getDataRange().getValues();
  if (v.length < 2) return { done: 0 };
  var now = new Date();
  // 🔴 메인컴이 죽어 있으면 30분을 기다릴 이유가 없다 (2026-08-30)
  var pc = smsPcAlive_(v);
  var waitMin = pc.alive ? SMS_SWEEP_AGE_MIN : SMS_SWEEP_AGE_DEAD;
  var cutoff = now.getTime() - waitMin * 60000;
  var stamp = Utilities.formatDate(now, 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
  var idx = null, excl = null, inbox = null, vac = null;
  var done = 0, skipped = 0;
  for (var i = 1; i < v.length && done < 200; i++) {
    var r = v[i];
    if (String(r[5] || '').trim()) continue;                    // 처리여부 있음 = PC가 이미 처리
    var when = String(r[0] || ''), phone = String(r[1] || ''), name = String(r[2] || '');
    var text = String(r[3] || ''), kind = String(r[4] || 'sms').trim() || 'sms';
    if (!phone && !name && !text) continue;
    var ts = (r[0] instanceof Date) ? r[0] : new Date(when.replace(' ', 'T'));  // 시트가 날짜셀로 바꾼 값은 String()하면 파싱 불능 → 30분 대기가 무시됐었음(08-17 실측)
    if (!isNaN(ts.getTime()) && ts.getTime() > cutoff) { skipped++; continue; }   // 아직 PC 차례
    if (idx === null) {                                          // 첫 처리 때만 색인 준비
      idx = smsPhoneIndex_();
      excl = smsExcluded_(ss);
      inbox = ss.getSheetByName('인입함');
      vac = ss.getSheetByName('공실현황');
    }
    var key = smsPhoneKey_(phone);
    var hit = key ? idx[key] : null;
    var bld = hit ? hit.bld : '';
    var mark = 'GAS자동';
    if (key && excl[key]) {
      mark = '제외번호';
    } else if (kind !== 'call' && SMS_RENT_DONE_RE.test(text)) {
      // 임대완료 문자 → 공실현황 [임대중] + 인입함 [광고확인] (server.py 와 동일한 이중 기록)
      if (vac) vac.appendRow([stamp, bld || name || '미등록번호', smsFmtPhone_(phone), text, '임대중']);
      if (inbox) inbox.appendRow(smsInboxRow_('광고확인', kind, phone, name,
        '⚠️ 임대완료 문자 — 해당 호실 광고 게시 중이면 내릴 것\n' + text, bld, stamp));
    } else if (kind !== 'call' && text.indexOf('공실') >= 0) {
      if (vac) vac.appendRow([stamp, bld || name || '미등록번호', smsFmtPhone_(phone), text, '']);
    } else if (hit && hit.owner) {
      if (inbox) inbox.appendRow(smsInboxRow_('임대인', kind, phone, name || hit.name, text, bld, stamp));
    } else {
      if (inbox) inbox.appendRow(smsInboxRow_('미확인', kind, phone, name, text, bld, stamp));
    }
    q.getRange(i + 1, 6, 1, 2).setValues([[mark, stamp]]);       // F 처리여부 · G 처리시각
    done++;
  }
  if (done) logChange('listings', 'smsSweep', '문자 자동회수 ' + done + '건 (구글서버)');
  return { done: done, waiting: skipped };
}
// 📥 인입함 조회·표시 (2026-08-22) — CRM 고객관리 화면의 "문의 인입함" 섹션이 사용.
//   인입함은 server.py·smsQueueSweep이 쌓는 28열 시트(A 고객상태·D 등록일·E 접수경로·
//   G 이름1·H 전화1·Q 특정물건·V 상담내용). 고객등록 도장은 29번째 열(AC)에 찍는다 —
//   server.py는 A~Z만 쓰므로 충돌 없음.
// 2026-08-26 확장: statusFilter(고객상태 일치)·unregOnly(AC 미등록만) 추가 — 인입함 921건이
//   최신 60~200건 창을 넘어가버려서, 조건에 맞는 것만 전체 시트에서 골라 최신순으로 담는다.
//   필터 없이 부르면(둘 다 falsy) 예전과 동일하게 "최신 limit건 그대로"를 반환(하위호환).
/* ───────── 📱 전화번호 앞 0 복원 (2026-09-08 실측 버그) ─────────────────────
   증상 · 010-6650-1431 이 106-650-1431 로 굳어 그 번호로 문자가 가지 않았다.
   원인 · 시트가 01066501431 을 숫자로 읽어 앞 0 을 날린다 → 10자리 → 지역번호로 오인해 3-3-4 로 자름.
   판정 · 10자리이고 1로 시작하며 두 번째가 0·1·6·7·8·9 면 휴대폰에서 0 이 빠진 것.
          9자리이고 2~8로 시작하면 유선에서 0 이 빠진 것(064 등).
          15xx·16xx·18xx 대표번호(8자리)는 건드리지 않는다.
   🔴 기본은 세어보기(dry). apply=1 을 붙여야 실제로 고친다. 고친 목록을 그대로 돌려준다. */
function phoneRestore_(v) {
  var raw = String(v == null ? '' : v).trim();
  if (!raw) return '';
  var d = raw.replace(/[^0-9]/g, '');
  if (!d) return '';
  if (d.length === 10 && d.charAt(0) === '1' && '016789'.indexOf(d.charAt(1)) >= 0) d = '0' + d;
  else if (d.length === 9 && '2345678'.indexOf(d.charAt(0)) >= 0) d = '0' + d;
  else return '';                                   // 고칠 것 없음
  if (d.length === 11) return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
  if (d.length === 10 && d.slice(0, 2) === '02') return '02-' + d.slice(2, 6) + '-' + d.slice(6);
  if (d.length === 10) return d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
  return '';
}
function phoneFix_(apply) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var out = { apply: !!apply, sheets: [], fixed: 0, checked: 0, samples: [], testRows: 0 };
  var TARGETS = [{ name: '인입함', col: 8 }, { name: '문자수신함', col: 2 }, { name: '공실현황', col: 2 }];
  TARGETS.forEach(function (t) {
    var sh = ss.getSheetByName(t.name);
    if (!sh) { out.sheets.push(t.name + ': 없음'); return; }
    var last = sh.getLastRow();
    if (last < 2) { out.sheets.push(t.name + ': 자료 없음'); return; }
    var rng = sh.getRange(2, t.col, last - 1, 1);
    var v = rng.getValues();
    var n = 0;
    for (var i = 0; i < v.length; i++) {
      out.checked++;
      var fixedVal = phoneRestore_(v[i][0]);
      if (!fixedVal) continue;
      if (out.samples.length < 10) out.samples.push(String(v[i][0]) + ' → ' + fixedVal);
      v[i][0] = fixedVal;
      n++;
    }
    if (n && apply) {
      rng.setNumberFormat('@');                     // 다시 숫자로 읽혀 0 이 날아가지 않게
      rng.setValues(v);
    }
    out.fixed += n;
    out.sheets.push(t.name + ': ' + n + '건' + (apply ? ' 고침' : ' 고칠 것'));
  });
  // 🧪 시험으로 넣은 행 청소 (번호가 비어 testCleanup 에 안 걸린 것)
  var inb = ss.getSheetByName('인입함');
  if (inb && apply) {
    var lastR = inb.getLastRow();
    if (lastR > 1) {
      var txt = inb.getRange(2, 22, lastR - 1, 1).getValues();
      for (var k = txt.length - 1; k >= 0; k--) {
        if (String(txt[k][0] || '').indexOf('앞 0 복원 확인') >= 0) { inb.deleteRow(k + 2); out.testRows++; }
      }
    }
  }
  return out;
}

/* 🏢 공실현황 최근 것 읽기 (2026-09-09) — server.py 가 쌓는 공실 문자.
   칸: 수신일시 | 건물명 | 발신번호 | 문자 원문 | 상태.  🔴 읽기만 한다.
   🔴 2026-09-11 A2-9C — 원문 상한을 400 → 3000 자로 늘렸다.
     400 자로 자르면 공실표 사진의 **월세·보증금 열이 잘려 나간다**(실측):
       에코드파리 공실표 845자 → 400자로 자르면 월세 0/9 · 보증금 0/9 → 가격변경 2건을
       「바뀐 것 없음」으로 잘못 보여 준다. 시트에는 전문이 들어 있고 읽기만 잘렸다.
     상한 근거(공실현황 146행 전수 실측): 최대 845 · 평균 37.2 · 중간값 23 · p95 72 · p99 435
       → 3000자 초과 0건. 146행 전체 글자수는 4,948 → 5,428(+480자)뿐이라 응답량 영향 미미.
     무제한으로 두지 않는 이유: 누군가 시트 칸에 아주 긴 글을 넣으면 응답이 터진다. */
var VAC_TEXT_MAX_ = 3000;
function vacList_(limit) {
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName('공실현황');
  if (!sh) return { rows: [], total: 0, error: '공실현황 시트가 없습니다' };
  var last = sh.getLastRow();
  if (last < 2) return { rows: [], total: 0 };
  var v = sh.getRange(2, 1, last - 1, 5).getValues();
  var out = [];
  for (var i = v.length - 1; i >= 0 && out.length < limit; i--) {
    var r = v[i];
    if (!String(r[1] || '').trim() && !String(r[3] || '').trim()) continue;
    out.push({ row: 2 + i, when: fmtCell(r[0]), apt: String(r[1] || '').trim(), phone: fmtCell(r[2]),
               text: String(r[3] || '').slice(0, VAC_TEXT_MAX_), status: String(r[4] || '').trim() });
  }
  return { rows: out, total: v.length };
}

/* 🔴 offset(쪽넘김) 2026-09-12 추가 — 종전엔 cap 500 에 막혀 최신 500행만 나갔다.
   그 500행으로 '계약완료 판정'·'중복 검사'·'전체 이력 검색' 을 하면 범위 밖 문자를
   없는 것으로 본다. offset 을 안 주면 지금과 똑같이 동작한다(기존 호출 그대로). */
/* ───────── 📝 대표 메모를 인입함에 한 줄 넣는다 (2026-09-12 지시 3) ─────────
   왜 필요한가
     대표님이 전화로 들은 것을 적어 둘 곳이 없었다. intakeMemo() 는 검사용 함수였고,
     실제로 메모를 적어 넣는 길이 없어 "메모 → 접수후보" 가 끊겨 있었다(PARTIAL).
   🔴 안전
     · 인입함 한 줄만 만든다. 매물장·고객·임대인·공실현황은 건드리지 않는다.
     · 접수경로를 '메모' 로 적어 ERP 가 MEMO 로 알아보게 한다(srcOf 가 이미 지원).
     · 매물 상태는 바뀌지 않는다 — 접수후보의 재료만 만든다.
     · 빈 내용은 넣지 않는다. 2,000자를 넘으면 자른다.
   되돌리기: 인입함에서 그 줄을 지우거나 AC열에 처리 표시를 하면 된다. */
function memoIn_(p, user) {
  var text = String((p && p.text) || '').trim();
  if (!text) return { error: '메모 내용이 비어 있습니다' };
  if (text.length > 2000) text = text.slice(0, 2000);
  var who = String((p && p.who) || (user && user.name) || '대표 메모').trim();
  var bld = String((p && p.bld) || '').trim();
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName('인입함');
  if (!sh) return { error: '인입함 탭이 없습니다' };
  var now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
  var row = [];
  for (var i = 0; i < 29; i++) row.push('');
  row[0] = '미확인';          /* A 고객상태 */
  row[2] = String((user && user.id) || '');   /* C 등록자 */
  row[3] = now;               /* D 등록일 — inboxList_ 가 읽는 자리 */
  row[4] = '메모';            /* E 접수경로 — srcOf 가 MEMO 로 알아본다 */
  row[6] = who;               /* G 이름1 */
  row[16] = bld;              /* Q 특정물건(건물명) */
  row[21] = text;             /* V 상담내용 */
  sh.appendRow(row);
  return { added: true, at: now, row: sh.getLastRow(), kind: '메모', chars: text.length };
}

function inboxList_(limit, statusFilter, unregOnly, offset) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName('인입함');
  if (!sh) return { rows: [], total: 0, matched: 0 };
  var last = sh.getLastRow();
  if (last < 2) return { rows: [], total: 0, matched: 0 };
  var n = last - 1;
  var cols = Math.min(29, sh.getMaxColumns());
  var v = sh.getRange(2, 1, n, cols).getValues();
  var cap = Math.min(Math.max(limit || 60, 1), 500);
  var skip = Math.max(parseInt(offset, 10) || 0, 0);
  var out = [];
  var matched = 0;
  for (var i = v.length - 1; i >= 0; i--) {          // 최신이 위
    var r = v[i];
    var status = String(r[0] || '');
    var reg = cols >= 29 ? fmtCell(r[28]) : '';
    if (statusFilter && statusFilter !== 'all' && status !== statusFilter) continue;
    if (unregOnly && String(reg || '').trim()) continue;
    matched++;
    if (matched > skip && out.length < cap) {
      out.push({
        row: 2 + i,
        status: status,
        when: fmtCell(r[3]),
        kind: String(r[4] || ''),
        name: String(r[6] || ''),
        phone: fmtCell(r[7]),
        bld: String(r[16] || ''),
        text: String(r[21] || '').slice(0, 400),
        reg: reg
      });
    }
  }
  return { rows: out, total: n, matched: matched, offset: skip,
           more: matched > skip + out.length };
}
/* ───────── 📥 인입함 무더기 정리 (2026-08-30) ─────────────────────────────
   왜 필요한가 (실측으로 드러난 것)
     미처리 486건의 정체를 재보니 **하나씩 누를 성질의 것이 아니었다.**
       · 459건(94%)이 `문자수신(백업)` — 실시간 인입이 아니라 폰 문자 백업을 통째로 넣은 것
       · 그중 **한 번호가 149건**('잘자' 등 개인 문자), 또 한 번호가 158건.
         문자 대화 전체가 한 줄씩 들어와 있다. 대화 하나가 리드 150건이 된 셈이다
       · 251건은 **이미 고객·임대인으로 등록된 사람**의 문자다(등록됐으니 인입함에 남길 이유가 없다)
     그래서 필요한 건 '한 건씩 누르기'가 아니라 **번호 단위·조건 단위 정리**다.

   🔴 안전장치
     · 이미 처리 표시(29열)가 있는 행은 절대 건드리지 않는다.
     · **고객·임대인 시트는 손대지 않는다.** 인입함 29열에 도장만 찍는다.
     · dry=1 이면 무엇이 정리될지 건수와 앞 8건만 돌려주고 시트를 만지지 않는다.
     · 번호 없는 행은 mode=phone 에서 절대 걸리지 않는다(빈 번호끼리 뭉뚱그려 지워지면 안 된다).
   되돌리기: 29열의 값을 지우면 다시 미처리로 돌아온다(원본 데이터는 그대로 남는다).
--------------------------------------------------------------------------- */
var INBOX_REG_COL = 29;              // 처리 표시 칸
var INBOX_PHONE_COL = 8;             // 전화1
var INBOX_KIND_COL = 5;              // 접수경로
var INBOX_TEXT_COL = 22;             // 본문

/** 시트는 010… 의 앞 0 을 떨군다(1026010110). 되살려서 뒤 8자리로 비교한다. */
function inboxPhoneKey_(p) {
  var d = String(p == null ? '' : p).replace(/[^0-9]/g, '');
  if (/^1[016789][0-9]{8}$/.test(d)) d = '0' + d;
  return d.length >= 8 ? d.slice(-8) : '';
}

/**
 * mode
 *   'phone'      value = 전화번호 → 그 번호의 미처리 건 전부
 *   'registered' 이미 고객·임대인으로 등록된 번호의 미처리 건 전부
 *   'kind'       value = 접수경로(예: '문자수신(백업)')
 *   'rows'       value = '12,15,20' 행번호 직접 지정
 */
function inboxSweep_(mode, value, dry, val) {
  var stampVal = String(val || '무시');
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName('인입함');
  if (!sh) return { error: '인입함 시트가 없습니다' };
  var last = sh.getLastRow();
  if (last < 2) return { matched: 0, marked: 0, preview: [] };
  if (sh.getMaxColumns() < INBOX_REG_COL) sh.insertColumnsAfter(sh.getMaxColumns(), INBOX_REG_COL - sh.getMaxColumns());
  if (String(sh.getRange(1, INBOX_REG_COL).getValue() || '').trim() === '') sh.getRange(1, INBOX_REG_COL).setValue('고객등록');

  var v = sh.getRange(2, 1, last - 1, INBOX_REG_COL).getValues();

  var want = {};                      // mode=registered 용
  if (mode === 'registered') {
    ['customers', 'landlords'].forEach(function (t) {
      (getAllData(t) || []).forEach(function (o) {
        var k = inboxPhoneKey_(o.phone);
        if (k) want[k] = true;
      });
    });
  }
  var pk = mode === 'phone' ? inboxPhoneKey_(value) : '';
  if (mode === 'phone' && !pk) return { error: '전화번호가 올바르지 않습니다' };
  var rowSet = {};
  if (mode === 'rows') {
    String(value || '').split(',').forEach(function (x) {
      var n = parseInt(x, 10); if (!isNaN(n)) rowSet[n] = true;
    });
  }

  var hits = [], preview = [];
  for (var i = 0; i < v.length; i++) {
    var row = i + 2;
    if (String(v[i][INBOX_REG_COL - 1] || '').trim()) continue;      // 이미 처리됨 → 건드리지 않는다
    var key = inboxPhoneKey_(v[i][INBOX_PHONE_COL - 1]);
    var hit = false;
    if (mode === 'phone')           hit = (key && key === pk);
    else if (mode === 'registered') hit = (key && want[key] === true);
    else if (mode === 'kind')       hit = (String(v[i][INBOX_KIND_COL - 1] || '').trim() === String(value || '').trim());
    else if (mode === 'rows')       hit = rowSet[row] === true;
    else return { error: '알 수 없는 mode: ' + mode };
    if (!hit) continue;
    hits.push(row);
    if (preview.length < 8) {
      preview.push({ row: row, phone: String(v[i][INBOX_PHONE_COL - 1] || ''),
                     kind: String(v[i][INBOX_KIND_COL - 1] || ''),
                     text: String(v[i][INBOX_TEXT_COL - 1] || '').replace(/\s+/g, ' ').slice(0, 60) });
    }
  }
  if (dry) return { mode: mode, value: String(value || ''), dry: true, matched: hits.length, marked: 0, preview: preview };

  var stamp = stampVal + ' ' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'MM-dd HH:mm');
  // 연속 구간을 묶어 한 번에 쓴다 — 한 건씩 setValue 하면 수백 건에서 시간초과가 난다
  for (var j = 0; j < hits.length;) {
    var a = j;
    while (j + 1 < hits.length && hits[j + 1] === hits[j] + 1) j++;
    var n = hits[j] - hits[a] + 1;
    var block = [];
    for (var b = 0; b < n; b++) block.push([stamp]);
    sh.getRange(hits[a], INBOX_REG_COL, n, 1).setValues(block);
    j++;
  }
  logChange('inbox', 'sweep', mode + '(' + (value || '') + ') ' + hits.length + '건 → ' + stampVal);
  return { mode: mode, value: String(value || ''), matched: hits.length, marked: hits.length, preview: preview, at: stamp };
}

/** 정리 전에 "무엇이 얼마나 있나" 를 한눈에 — 시트를 만지지 않는다 */
function inboxStat_() {
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName('인입함');
  if (!sh) return { error: '인입함 시트가 없습니다' };
  var last = sh.getLastRow();
  if (last < 2) return { total: 0, unprocessed: 0 };
  var v = sh.getRange(2, 1, last - 1, INBOX_REG_COL).getValues();
  var want = {};
  ['customers', 'landlords'].forEach(function (t) {
    (getAllData(t) || []).forEach(function (o) { var k = inboxPhoneKey_(o.phone); if (k) want[k] = true; });
  });
  var un = 0, reg = 0, byKind = {}, byPhone = {};
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][INBOX_REG_COL - 1] || '').trim()) continue;
    un++;
    var k = String(v[i][INBOX_KIND_COL - 1] || '(빈)');
    byKind[k] = (byKind[k] || 0) + 1;
    var ph = inboxPhoneKey_(v[i][INBOX_PHONE_COL - 1]);
    if (ph) {
      byPhone[ph] = (byPhone[ph] || 0) + 1;
      if (want[ph]) reg++;
    }
  }
  var top = Object.keys(byPhone).map(function (k) { return { phone: k, n: byPhone[k] }; })
                  .sort(function (a, b) { return b.n - a.n; }).slice(0, 10);
  return { total: v.length, unprocessed: un, alreadyRegistered: reg, byKind: byKind, topPhones: top };
}

function inboxMark_(row, val) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName('인입함');
  if (!sh) return { marked: null, error: '인입함 시트가 없습니다' };
  if (!row || row < 2 || row > sh.getLastRow()) return { marked: null, error: '행 번호가 유효하지 않습니다' };
  if (sh.getMaxColumns() < 29) sh.insertColumnsAfter(sh.getMaxColumns(), 29 - sh.getMaxColumns());
  if (String(sh.getRange(1, 29).getValue() || '').trim() === '') sh.getRange(1, 29).setValue('고객등록');
  var stamp = String(val || '고객등록') + ' ' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'MM-dd HH:mm');
  sh.getRange(row, 29).setValue(stamp);
  return { marked: row, stamp: stamp };
}
// 2026-08-26 신설: 일괄 처리 화면(체크박스 선택→일괄등록/무시)이 행마다 inboxMark를 따로
//   부르면 수십 번 왕복하게 되어 하나로 묶음 — 같은 도장(stamp)을 여러 행에 한 번에 찍는다.
function inboxMarkBulk_(rows, val) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName('인입함');
  if (!sh) return { marked: 0, error: '인입함 시트가 없습니다' };
  if (sh.getMaxColumns() < 29) sh.insertColumnsAfter(sh.getMaxColumns(), 29 - sh.getMaxColumns());
  if (String(sh.getRange(1, 29).getValue() || '').trim() === '') sh.getRange(1, 29).setValue('고객등록');
  var stamp = String(val || '고객등록') + ' ' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'MM-dd HH:mm');
  var last = sh.getLastRow();
  var n = 0;
  for (var i = 0; i < (rows || []).length; i++) {
    var row = rows[i];
    if (!row || row < 2 || row > last) continue;
    sh.getRange(row, 29).setValue(stamp);
    n++;
  }
  return { marked: n, stamp: stamp };
}

// 🧹 시험 흔적 일괄 청소 (2026-08-23) — 가짜 번호·테스트 표기 행만, 아래에서 위로 삭제
function testCleanup_(dry) {
  // 숫자만 남겨 대조: 010-0000-00xx(시험 주입)·10000000xx(코워크 시험) 계열만
  var FAKE_DIGITS_RE = /^01000000\d{2,3}$|^10000000\d{2}$|^(1011112222|1033334444|1055556666)$/; // 뒤 3개=08-11 야간테스트 실번호
  var TEST_TEXT_RE = /클로드.*시험|시험.*클로드|테스트 수신경로확인|__.*테스트__|dry재시험|자동응답 시험|Ŭ�/;
  var targets = [
    { name: '문자수신함', phoneCol: 1, textCols: [2, 3] },
    { name: '인입함', phoneCol: 7, textCols: [6, 21] },
    { name: '자동응답로그', phoneCol: 1, textCols: [5] },
    { name: '공실현황', phoneCol: 2, textCols: [1, 3] }
  ];
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var out = {};
  for (var t = 0; t < targets.length; t++) {
    var cfg = targets[t];
    var sh = ss.getSheetByName(cfg.name);
    if (!sh) { out[cfg.name] = '탭 없음'; continue; }
    var v = sh.getDataRange().getValues();
    var hits = [];
    for (var i = v.length - 1; i >= 1; i--) {
      var digits = String(v[i][cfg.phoneCol] || '').replace(/\D/g, '');
      var textHit = false;
      for (var c = 0; c < cfg.textCols.length; c++) {
        if (TEST_TEXT_RE.test(String(v[i][cfg.textCols[c]] || ''))) { textHit = true; break; }
      }
      if ((digits && FAKE_DIGITS_RE.test(digits)) || textHit) hits.push(i + 1);
    }
    if (!dry) {
      // 필터가 행을 숨기고 있으면 삭제가 무시된다(08-22 교훈) — 걷고 지운다
      for (var h = 0; h < hits.length; h++) {
        try { if (sh.isRowHiddenByFilter(hits[h])) { var f = sh.getFilter(); if (f) f.remove(); } } catch (e) {}
        sh.deleteRow(hits[h]);
      }
      SpreadsheetApp.flush();
    }
    out[cfg.name] = (dry ? '대상 ' : '삭제 ') + hits.length + '행';
  }
  if (!dry) logChange('sms', 'testCleanup', JSON.stringify(out));
  return out;
}

// 🔬 삭제 불능 행 진단 (2026-08-22 임시) — really='1'이면 실제 삭제 시도까지
function diagDelete_(id, really) {
  var out = { id: id };
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(SHEETS.listings);
  out.sheetName = sh.getName();
  out.sheetId = sh.getSheetId();
  out.maxRows = sh.getMaxRows();
  out.lastRow = sh.getLastRow();
  out.frozen = sh.getFrozenRows();
  try { out.hasFilter = !!sh.getFilter(); } catch (e) { out.hasFilter = 'err:' + e.message; }
  try { out.protections = sh.getProtections(SpreadsheetApp.ProtectionType.RANGE).length; } catch (e) { out.protections = 'err'; }
  var v = sh.getDataRange().getValues();
  var idCol = HEADERS.listings.indexOf('id');
  var rows = [];
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][idCol]).trim() === String(id).trim()) rows.push(i + 1);
  }
  out.matchRows = rows;
  if (rows.length) {
    var r = rows[rows.length - 1];
    try { out.hiddenByUser = sh.isRowHiddenByUser(r); } catch (e) { out.hiddenByUser = 'err:' + e.message; }
    try { out.hiddenByFilter = sh.isRowHiddenByFilter(r); } catch (e) { out.hiddenByFilter = 'err:' + e.message; }
    try { out.merged = sh.getRange(r, 1, 1, 5).getMergedRanges().length; } catch (e) { out.merged = 'err'; }
    if (really) {
      try { sh.deleteRow(r); out.deleteThrew = null; } catch (e) { out.deleteThrew = e.message; }
      SpreadsheetApp.flush();
      var v2 = sh.getDataRange().getValues();
      var still = 0;
      for (var j = 1; j < v2.length; j++) if (String(v2[j][idCol]).trim() === String(id).trim()) still++;
      out.stillAfterDeleteRow = still;
      out.lastRowAfter = sh.getLastRow();
      // 새 핸들로도 재확인 (같은 실행 내 캐시 의심 차단)
      var ss2 = SpreadsheetApp.openById(SHEET_ID);
      var sh2 = ss2.getSheetByName(SHEETS.listings);
      var v3 = sh2.getDataRange().getValues();
      var still2 = 0;
      for (var k = 1; k < v3.length; k++) if (String(v3[k][idCol]).trim() === String(id).trim()) still2++;
      out.stillFreshHandle = still2;
      if (still2 > 0) {
        // 대안 1: deleteRows
        try { sh.deleteRows(rows[rows.length - 1], 1); SpreadsheetApp.flush(); out.deleteRowsThrew = null; } catch (e) { out.deleteRowsThrew = e.message; }
        var v4 = sh.getDataRange().getValues();
        var still3 = 0;
        for (var m = 1; m < v4.length; m++) if (String(v4[m][idCol]).trim() === String(id).trim()) still3++;
        out.stillAfterDeleteRows = still3;
        if (still3 > 0) {
          // 대안 2: 내용 비우기 (행은 남되 id 소멸 → 최소한 목록·동기화에서 사라짐)
          try {
            sh.getRange(rows[rows.length - 1], 1, 1, sh.getMaxColumns()).clearContent();
            SpreadsheetApp.flush();
            out.clearedContent = true;
          } catch (e) { out.clearedContent = 'err:' + e.message; }
        }
      }
    }
  }
  return out;
}

// 🏠 통합매물장(아파트정보·오피스텔정보) → 임대인관리 일괄 이전 (2026-08-22)
//   임대인명부_이전.py(08-01 준비, 미실행)의 GAS 이식. 원본과 같은 규칙:
//   전화(소유주 우선, 없으면 관리사무소) 있는 행만 / id LA-·LO-행번호로 멱등 / 원본 불변.
//   🔴 원본 py는 옛 10칸 헤더 기준이라 지금 돌리면 칸이 밀렸을 것 — 여기서는 현행 12칸
//   (owner·ownerName 포함) 순서로 쓴다. 실행: ?action=importLandlords&token=… (또는 편집기)
var LEGACY_SHEET_ID = '1Jj3gSQz0b0vDZomKuEVf6WdFG8yGbp3HYEFRqiJDuOY'; // 통합매물장 (읽기 전용)
function importLegacyLandlords() {
  var sh = getOrCreateSheet('landlords');
  var have = {};
  var cur = sh.getDataRange().getValues();
  for (var i = 1; i < cur.length; i++) {
    var id0 = String(cur[i][0] || '').trim();
    if (id0) have[id0] = true;
  }
  var legacy = SpreadsheetApp.openById(LEGACY_SHEET_ID);
  var SRC = [
    ['아파트정보', 'LA', { apt: 'C', mgmt: 'AI', owner: 'AP', dong: 'F', jibun: 'G' }],
    ['오피스텔정보', 'LO', { apt: 'B', mgmt: 'X', owner: 'AC', dong: 'E', jibun: 'F' }]
  ];
  var colI = function (L) { var n = 0; for (var k = 0; k < L.length; k++) n = n * 26 + (L.charCodeAt(k) - 64); return n - 1; };
  var PHONE_RE = /01[016789][\-\s.]?\d{3,4}[\-\s.]?\d{4}|0\d{1,2}[\-\s.]?\d{3,4}[\-\s.]?\d{4}/;
  var now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
  var out = [], noPhone = 0, perTab = {};
  for (var s = 0; s < SRC.length; s++) {
    var tabName = SRC[s][0], prefix = SRC[s][1], m = SRC[s][2];
    var t = legacy.getSheetByName(tabName);
    if (!t) { perTab[tabName] = '탭 없음'; continue; }
    var last = t.getLastRow();
    if (last < 3) { perTab[tabName] = 0; continue; }
    var width = Math.max(colI(m.owner), colI(m.mgmt), colI(m.apt), colI(m.dong), colI(m.jibun)) + 1;
    var data = t.getRange(3, 1, last - 2, Math.min(width, t.getMaxColumns())).getValues();
    var added = 0;
    for (var r = 0; r < data.length; r++) {
      var rid = prefix + '-' + ('000' + (r + 3)).slice(-4);
      if (have[rid]) continue;
      var cell = function (L) { var x = data[r][colI(L)]; return String(x === undefined || x === null ? '' : x).trim(); };
      var apt = cell(m.apt), owner = cell(m.owner), mgmt = cell(m.mgmt);
      var phone = owner || mgmt;
      if (!apt && !phone) continue;
      if (!PHONE_RE.test(phone)) { noPhone++; continue; }
      var addr = [cell(m.dong), cell(m.jibun)].filter(function (x) { return x; }).join(' ');
      var bits = ['통합매물장 명부 이전'];
      if (!owner && mgmt) bits.push('관리사무소 번호');
      else if (owner && mgmt && mgmt !== owner) bits.push('관리사무소: ' + mgmt);
      // 현행 HEADERS.landlords 순서: id,name,phone,addr,apt,cycle,lastContact,nextContact,owner,ownerName,note,updatedAt
      out.push([rid, '', phone, addr, apt, '', '', '', 'admin', '대표', bits.join(' · '), now]);
      have[rid] = true;
      added++;
    }
    perTab[tabName] = added;
  }
  if (out.length) {
    var startRow = sh.getLastRow() + 1;
    var rng = sh.getRange(startRow, 1, out.length, 12);
    rng.setNumberFormat('@');           // 전화·날짜가 시트 자동 변환으로 깨지지 않게
    rng.setValues(out);
    logChange('landlords', 'importLegacy', out.length + '건 이전 (전화없음 제외 ' + noPhone + ')');
  }
  return { added: out.length, skippedNoPhone: noPhone, perTab: perTab,
           note: out.length ? 'CRM에서 [⬇️ 시트에서 불러오기]를 해야 화면에 나타납니다' : '신규 없음(이미 이전됐거나 전화 있는 행 없음)' };
}

// ═══ 📈 실거래 시세 대조 (2026-08-22) ═══
//   국토부 실거래가 공개 API(자동승인형)로 최근 6개월 제주시 거래를 받아 내 매물과 비교한다.
//   키는 대장 조회와 같은 BLDG_API_KEY(스크립트 속성) — 08-22 실측: 아파트 전월세(월 250건)·
//   아파트 매매(112건)·오피스텔 매매(22건) 승인 확인. 오피스텔 전월세·연립·단독은 403 =
//   data.go.kr에서 해당 API 활용신청(자동승인, 1분)하면 열린다.
//   월세는 보증금을 연 6%로 환산(만원: 보증금×0.005 + 월세)해 비교. 신고 실거래 기준.
var RTMS_LAWD = '50110';                 // 제주시(기본). 아파트 시세 화면은 지역을 골라 넘긴다.
var RTMS_CACHE = {};                     // 실행 내 메모리 캐시
// 🔴 lawd(지역코드)를 인자로 받게 확장(2026-09-07). 안 주면 제주시 — 기존 priceCheck_ 는 그대로.
//    캐시 키에 lawd 를 넣어 지역이 섞이지 않게 한다.
function rtmsFetch_(svc, ymd, lawd) {
  lawd = lawd || RTMS_LAWD;
  var ck = svc + '@' + ymd + '@' + lawd;
  if (Object.prototype.hasOwnProperty.call(RTMS_CACHE, ck)) return RTMS_CACHE[ck];
  var cache = null;
  try { cache = CacheService.getScriptCache(); } catch (e) {}
  if (cache) {
    try { var hit = cache.get('rtms_' + ck); if (hit) { RTMS_CACHE[ck] = JSON.parse(hit); return RTMS_CACHE[ck]; } } catch (e) {}
  }
  var key = PropertiesService.getScriptProperties().getProperty('BLDG_API_KEY') || '';
  var url = 'https://apis.data.go.kr/1613000/' + svc + '/get' + svc +
            '?serviceKey=' + encodeURIComponent(key) + '&LAWD_CD=' + lawd +
            '&DEAL_YMD=' + ymd + '&numOfRows=1000&pageNo=1';
  var out;
  try {
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var code = res.getResponseCode();
    if (code === 403) { out = { err: '활용신청 필요(data.go.kr에서 ' + svc + ' 신청 — 자동승인)' }; }
    else if (code !== 200) { out = { err: 'HTTP ' + code }; }
    else {
      var xml = res.getContentText();
      var rc = (xml.match(/<resultCode>([^<]*)/) || [])[1] || '';
      if (rc && rc !== '000' && rc !== '00') {
        out = { err: (xml.match(/<resultMsg>([^<]*)/) || [])[1] || rc };
      } else {
        var items = [];
        var blocks = xml.split('<item>');
        for (var i = 1; i < blocks.length; i++) {
          var b = blocks[i];
          var g = function (tag) { var mm = b.match(new RegExp('<' + tag + '>([^<]*)')); return mm ? mm[1].trim() : ''; };
          items.push({
            name: g('aptNm') || g('offiNm') || g('mhouseNm') || g('houseNm') || g('buildingNm'),
            dong: g('umdNm'),
            area: parseFloat(g('excluUseAr')) || 0,
            floor: g('floor'),
            deposit: parseInt(String(g('deposit')).replace(/[^\d]/g, ''), 10) || 0,
            rent: parseInt(String(g('monthlyRent')).replace(/[^\d]/g, ''), 10) || 0,
            deal: parseInt(String(g('dealAmount')).replace(/[^\d]/g, ''), 10) || 0,
            ym: g('dealYear') + '-' + ('0' + g('dealMonth')).slice(-2),
            // ⚖ 2026-09-08 추가 — 가장거래(해제·미등기) 추적용. 없으면 '' (옛 응답 호환)
            cdealType: g('cdealType'),        // 'O' = 해제된 거래
            cdealDay: g('cdealDay'),          // 해제사유발생일
            rgstDate: g('rgstDate'),          // 등기일자 (2023.7~ 아파트)
            dealingGbn: g('dealingGbn')       // 중개거래/직거래
          });
        }
        out = { items: items };
      }
    }
  } catch (e) { out = { err: e.message }; }
  RTMS_CACHE[ck] = out;
  if (cache && out.items) { try { cache.put('rtms_' + ck, JSON.stringify(out), 21600); } catch (e) {} }
  return out;
}
function priceNorm_(s) { return String(s || '').replace(/[\s()·\-]/g, ''); }
function priceMan_(n) {                   // 만원 → '1억2000만' 표기
  n = Math.round(n);
  if (n >= 10000) { var eok = Math.floor(n / 10000), rest = n % 10000; return eok + '억' + (rest ? rest + '만' : ''); }
  return n + '만';
}
function priceCheck_(p) {
  var kind = String(p.kind || '').trim();
  var type = String(p.type || '').trim();
  var isSale = type === '매매';
  var isJeonse = type === '전세';
  var svc;
  if (/아파트|분양권/.test(kind)) svc = isSale ? 'RTMSDataSvcAptTrade' : 'RTMSDataSvcAptRent';
  else if (/오피스텔/.test(kind)) svc = isSale ? 'RTMSDataSvcOffiTrade' : 'RTMSDataSvcOffiRent';
  else return { supported: false, why: '실거래 대조는 아파트·오피스텔만 됩니다 — 원룸·다가구·상가는 신고 데이터가 공개되지 않습니다' };

  var myPrice = parseInt(isjMoney_(p.price), 10) || 0;          // 만원
  var myRent = parseInt(isjMoney_(p.rentAmt), 10) || 0;
  var myVal, myLabel;
  if (isSale || isJeonse) { myVal = myPrice; myLabel = priceMan_(myPrice) + (isJeonse ? ' (전세)' : ''); }
  else {
    if (!myRent && !myPrice) return { supported: false, why: '매물에 금액이 없습니다' };
    myVal = Math.round(myPrice * 0.005 + myRent);               // 월 환산(만원)
    myLabel = priceMan_(myPrice) + '/' + myRent + ' (월 환산 ' + myVal + '만)';
  }
  if (!myVal) return { supported: false, why: '매물 금액(' + String(p.price || '') + ')을 숫자로 읽지 못했습니다' };

  var months = [];
  var now = new Date();
  for (var i = 0; i < 6; i++) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(Utilities.formatDate(d, 'Asia/Seoul', 'yyyyMM'));
  }
  var all = [], err = '';
  for (var mi = 0; mi < months.length; mi++) {
    var r = rtmsFetch_(svc, months[mi]);
    if (r.err) { err = r.err; continue; }
    for (var k = 0; k < r.items.length; k++) all.push(r.items[k]);
  }
  var nApt = priceNorm_(p.apt);
  var myDong = (String(p.addr || '').match(/제주시\s+([가-힣0-9]+동)/) || [])[1] || '';
  var myArea = parseFloat(p.area) || 0;
  var areaOk = function (a) { return !myArea || !a || Math.abs(a - myArea) <= Math.max(4, myArea * 0.12); };

  // 1차: 단지명 일치(+면적대) → 없으면 2차: 같은 동 + 같은 면적대
  var cands = [], scope = '';
  if (nApt) {
    cands = all.filter(function (it) {
      var n = priceNorm_(it.name);
      return n && (n.indexOf(nApt) >= 0 || nApt.indexOf(n) >= 0) && areaOk(it.area);
    });
    scope = '같은 단지';
  }
  if (!cands.length && myDong && myArea) {
    cands = all.filter(function (it) { return it.dong === myDong && areaOk(it.area); });
    scope = myDong + ' 동일 면적대';
  }
  var vals = [], samples = [];
  for (var c = 0; c < cands.length; c++) {
    var it = cands[c], v = 0;
    if (isSale) { if (it.deal > 0) v = it.deal; }
    else if (isJeonse) { if (it.rent === 0 && it.deposit > 0) v = it.deposit; }
    else { if (it.rent > 0) v = Math.round(it.deposit * 0.005 + it.rent); }
    if (v > 0) { vals.push(v); samples.push(it); }
  }
  if (!vals.length) return { supported: true, n: 0, scope: scope || '조건 일치', err: err };
  vals.sort(function (a, b) { return a - b; });
  var med = vals.length % 2 ? vals[(vals.length - 1) / 2]
                            : Math.round((vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2);
  var diffPct = Math.round((myVal - med) / med * 1000) / 10;
  var verdict = diffPct <= -5 ? '시세보다 저렴 💚' : diffPct < 5 ? '시세 수준' : '시세보다 높음 🔺';
  samples.sort(function (a, b) { return String(b.ym).localeCompare(String(a.ym)); });
  samples = samples.slice(0, 8).map(function (it) {
    return { ym: it.ym, name: it.name, area: it.area, floor: it.floor,
             label: isSale ? priceMan_(it.deal) : (priceMan_(it.deposit) + '/' + it.rent) };
  });
  var medLabel = isSale || isJeonse ? priceMan_(med) : '월 환산 ' + med + '만';
  return { supported: true, n: vals.length, scope: scope, med: med, medLabel: medLabel,
           myVal: myVal, myLabel: myLabel, diffPct: diffPct, verdict: verdict,
           samples: samples, err: err };
}

function installSmsSweepTrigger() {
  var all = ScriptApp.getProjectTriggers();
  var removed = 0;
  for (var i = 0; i < all.length; i++) {
    if (all[i].getHandlerFunction() === 'smsQueueSweep') { ScriptApp.deleteTrigger(all[i]); removed++; }
  }
  ScriptApp.newTrigger('smsQueueSweep').timeBased().everyMinutes(10).create();
  Logger.log('기존 문자회수 트리거 ' + removed + '개 제거 후 새로 설치 — 10분마다 자동 실행');
  Logger.log('PC(server.py)가 살아 있으면 PC가 먼저 가져가고, 죽어 있으면 30분 뒤 구글 서버가 회수합니다');
}

// 매물번호 접두 정리 (2026-08-14 사장님 지시) — 편집기에서 1회 실행
//   광고에 나간 적 없는 매물만, 현재 종류(kind) 기준의 접두(원룸·오피스텔=R 등)로 번호를 다시 붙인다.
//   당근(daangnNo·adsFlat·adList)에 흔적이 있으면 번호가 광고와 연결돼 있으므로 절대 안 바꾼다.
//   광고문구(desc) 안의 옛 번호도 함께 새 번호로 바꾼다.
function renumberUnadvertised() {
  var sheet = getOrCreateSheet('listings');
  var rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return;
  var head = rows[0].map(String);
  var col = {};
  head.forEach(function (h, i) { if (col[h] === undefined) col[h] = i; });
  var used = {};
  for (var i = 1; i < rows.length; i++) used[String(rows[i][col.id] || '').trim()] = true;
  var changed = 0, skipped = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    var id = String(r[col.id] || '').trim();
    var kind = String(r[col.kind] || '').trim();
    var m = id.match(/^([A-Z])(\d{6})-(\d+)$/);
    if (!m || !kind) continue;
    var want = KIND_CODE_GS[kind];
    if (!want || m[1] === want) continue;
    // 광고 흔적이 있으면 건드리지 않는다
    var adTouched = ['daangnNo', 'adsFlat', 'adList'].some(function (f) {
      return col[f] !== undefined && String(r[col[f]] || '').trim();
    });
    if (adTouched) { skipped.push(id + '(광고이력)'); continue; }
    var seq = 1, nid;
    do { nid = want + m[2] + '-' + ('0' + seq).slice(-2); seq++; } while (used[nid]);
    used[nid] = true;
    sheet.getRange(i + 1, col.id + 1).setValue(nid);
    if (col.desc !== undefined) {
      var dsc = String(r[col.desc] || '');
      if (dsc.indexOf(id) >= 0) sheet.getRange(i + 1, col.desc + 1).setValue(dsc.split(id).join(nid));
    }
    logChange('listings', 'renumber', id + ' → ' + nid);
    changed++;
  }
  Logger.log('매물번호 재부여 ' + changed + '건' + (skipped.length ? ' / 광고이력으로 건너뜀: ' + skipped.join(', ') : ''));
}

function installExpiryTrigger() {
  var all = ScriptApp.getProjectTriggers();
  var removed = 0;
  for (var i = 0; i < all.length; i++) {
    if (all[i].getHandlerFunction() === 'checkExpiryDaily') {
      ScriptApp.deleteTrigger(all[i]);
      removed++;
    }
  }
  ScriptApp.newTrigger('checkExpiryDaily').timeBased().everyDays(1).atHour(9).create();
  Logger.log('기존 만기알림 트리거 ' + removed + '개 제거 후 새로 설치 — 매일 오전 9시경 실행');
  Logger.log('바로 시험하려면 checkExpiryDaily 함수를 직접 실행해 보세요 (로그에 결과가 찍힘)');
}

// ══════════════════════════════════════════
// 🤖 1차 자동응답 + 수집 헬스체크 (2026-08-23 추가)
//   목적: 전화·문자 문의가 오면 사람이 받기 전에 CRM이 먼저 한 줄 답한다(5분 내 첫 응답).
//   경로: ① 폰 MacroDroid 문자 수신 → smsIn → smsInbound_ → autoReply_('sms')
//        ② 폰 MacroDroid 부재중 전화 → missedCall → autoReply_('call') + 인입함 기록
//   안전장치(전부 통과해야 보냄):
//     · 010 휴대폰 번호만 (1588·02·064·짧은 번호는 안 보냄)
//     · 폰 연락처에 저장된 사람(name 있음)은 안 보냄 — 지인·거래처 오발송 방지
//     · 제외번호 시트, 임대인·매물 연락처(관리사무소 포함)는 안 보냄
//     · 문자는 '문의 키워드'가 있을 때만 (방·원룸·매물·월세·연세·보증금·문의·입주…)
//     · 같은 번호에는 7일에 1번만 (자동응답로그 시트로 확인)
//     · 스크립트 속성 AUTO_REPLY=off 면 전체 정지 / AUTO_REPLY_SMS_TEXT·AUTO_REPLY_CALL_TEXT 로 문구 교체
//     · 실패해도 예외를 밖으로 던지지 않는다 — 수신 적재(smsInbound_)가 멈추면 안 되기 때문
// ══════════════════════════════════════════
var AUTO_REPLY_LOG = '자동응답로그';
var AUTO_REPLY_LOG_HEADER = ['발송시각', '번호', '유형', '결과', '문구', '원문'];
var AUTO_REPLY_COOLDOWN_DAYS = 7;
/* 🔴 2026-09-13 안전장치 3개 추가 (일요일 마감) — 자동응답 범위는 넓히지 않는다.
   A 하루 총 발송량 · B 연락금지·수신거부 고객 · C 종료·계약완료 고객
   하루 상한은 스크립트 속성 AUTO_REPLY_DAILY_MAX 로 바꿀 수 있다(기본 20). */
var AUTO_REPLY_DAILY_DEFAULT = 20;
var AUTO_REPLY_BAN_RE = /연락금지|수신거부|수신\s*거부|발송금지|문자금지|거부/;
var AUTO_REPLY_END_RE = /종료|계약완료|거래완료|계약\s*완료/;
function autoReplyDailyMax_() {
  var v = parseInt(String(PropertiesService.getScriptProperties()
    .getProperty('AUTO_REPLY_DAILY_MAX') || ''), 10);
  return (v > 0) ? v : AUTO_REPLY_DAILY_DEFAULT;
}
/* 오늘 실제로 보낸 건수 — 자동응답로그에서 센다('발송' 으로 시작하는 줄만) */
function autoReplySentToday_(sh) {
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var n = Math.min(400, last - 1);
  var v = sh.getRange(last - n + 1, 1, n, 4).getValues();
  var today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
  var c = 0;
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][3] || '').indexOf('발송') !== 0) continue;
    var d = v[i][0];
    var ds = (d instanceof Date)
      ? Utilities.formatDate(d, 'Asia/Seoul', 'yyyy-MM-dd') : String(d || '').slice(0, 10);
    if (ds === today) c++;
  }
  return c;
}
var AUTO_REPLY_INQUIRY_RE = /방|룸|원룸|투룸|매물|월세|연세|전세|보증금|공실|문의|입주|계약|임대|집\s*구|네이버|당근|직방|다방|광고|시세|얼마|가능한가요|볼\s*수|보고\s*싶|보러|위치|주소|사진/;

// 💛 카카오 알림톡 (2026-08-23): 스크립트 속성만 채우면 켜진다 — 코드 재배포 불요.
//   KAKAO_PF_ID(솔라피 발신프로필) + 템플릿ID 3종(KAKAO_TPL_INQUIRY/KAKAO_TPL_MISSED/KAKAO_TPL_CALLEND).
//   비어 있으면 지금처럼 SMS. 알림톡 성공 시 [Web발신] 없이 카톡으로 도착(건당 문자보다 저렴),
//   수신자가 카톡 미사용·실패면 솔라피가 자동으로 SMS 대체 발송(disableSms:false).
//   절차서: 03_지시어_문서\_카카오알림톡_켜는법_2026-08-23.md
function kakaoCfg_() {
  var p = PropertiesService.getScriptProperties();
  return { pfId: String(p.getProperty('KAKAO_PF_ID') || '').trim(),
           tpl: { sms: String(p.getProperty('KAKAO_TPL_INQUIRY') || '').trim(),
                  call: String(p.getProperty('KAKAO_TPL_MISSED') || '').trim(),
                  callEnd: String(p.getProperty('KAKAO_TPL_CALLEND') || '').trim() } };
}
// 📱 폰 유심 발송 (2026-08-24 사장님 "웹발신 빼기") — 폰(유심)이 보낸 문자엔 [Web발신]이 안 붙는다.
//   [Web발신]은 통신사가 "인터넷 발송" 문자에만 강제 삽입(과기정통부 고시)하는 것이라 API로는 제거 불가,
//   폰 발송이 유일한 합법 우회. 덤으로 무제한 요금제면 건당 0원.
//   구조: GAS → MacroDroid 웹훅(폰을 깨움) → 폰이 유심으로 SMS 발송 → 폰이 phoneSmsAck 회신.
//   5분 내 ack가 없으면(폰 꺼짐·데이터 끊김) 10분 스윕이 솔라피 문자로 폴백 — 손님이 못 받는 일은 없게.
//   켜는 법: 스크립트 속성 PHONE_SMS_WEBHOOK = https://trigger.macrodroid.com/<기기ID>/sms (비면 기능 꺼짐)
var PHONE_SMS_SHEET = '폰발신대기';
var PHONE_SMS_ACK_MIN = 5;      // ack 대기 시간(분) — 지나면 문자 폴백
function phoneSmsWebhook_() { return String(PropertiesService.getScriptProperties().getProperty('PHONE_SMS_WEBHOOK') || '').trim(); }
function phoneSmsSheet_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(PHONE_SMS_SHEET);
  if (!sh) { sh = ss.insertSheet(PHONE_SMS_SHEET); sh.appendRow(['시각', 'qid', '번호', '내용', '종류', '상태', '처리시각']); }
  return sh;
}
function phoneSmsSend_(to, text, kind) {
  var hook = phoneSmsWebhook_();
  if (!hook) return null;                                        // 속성 비어 있음 = 기능 꺼짐(기존 경로로)
  var sh = phoneSmsSheet_();
  var qid = 'Q' + new Date().getTime() + Math.floor(Math.random() * 1000);
  var stamp = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
  sh.appendRow([stamp, qid, String(to), String(text), kind || 'sms', '폰대기', '']);
  var row = sh.getLastRow();
  try {
    var url = hook + (hook.indexOf('?') < 0 ? '?' : '&')
      + 'sms_to=' + encodeURIComponent(String(to))
      + '&sms_text=' + encodeURIComponent(String(text))
      + '&qid=' + encodeURIComponent(qid);
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() >= 400) throw new Error('웹훅 ' + res.getResponseCode());
    return { r: { sent: 1, failed: [] }, via: '폰', qid: qid };
  } catch (e) {
    // 웹훅 자체가 실패 → 행을 닫아 스윕 중복 발송을 막고, 호출부가 즉시 솔라피로 가게 null
    sh.getRange(row, 6, 1, 2).setValues([['웹훅실패', stamp]]);
    return null;
  }
}
function phoneSmsAck_(qid) {                                     // 폰(MacroDroid)이 발송 직후 GET으로 호출
  if (!qid) return { acked: 0 };
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(PHONE_SMS_SHEET);
  if (!sh) return { acked: 0 };
  var v = sh.getDataRange().getValues();
  var stamp = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
  for (var i = v.length - 1; i >= 1; i--) {
    if (String(v[i][1]) === String(qid)) {
      sh.getRange(i + 1, 6, 1, 2).setValues([['폰발송', stamp]]);
      return { acked: 1 };
    }
  }
  return { acked: 0 };
}
function phoneSmsSweep_() {                                      // smsQueueSweep(10분 트리거)이 같이 돌린다
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(PHONE_SMS_SHEET);
  if (!sh) return { fallback: 0 };
  var v = sh.getDataRange().getValues();
  var cutoff = new Date().getTime() - PHONE_SMS_ACK_MIN * 60000;
  var stamp = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
  var n = 0;
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][5]) !== '폰대기') continue;
    var ts = (v[i][0] instanceof Date) ? v[i][0] : new Date(String(v[i][0]).replace(' ', 'T'));  // 날짜셀 파싱(smsQueueSweep과 동일 처리)
    if (!isNaN(ts.getTime()) && ts.getTime() > cutoff) continue;  // 아직 ack 대기 중
    var r = smsSendMany([{ to: String(v[i][2]), text: String(v[i][3]) }]);
    sh.getRange(i + 1, 6, 1, 2).setValues([[(r && r.sent) ? '문자폴백' : '폴백실패', stamp]]);
    n++;
  }
  if (n) logChange('listings', 'phoneSmsSweep', '폰 미발송 ' + n + '건 솔라피 문자로 폴백');
  return { fallback: n };
}
// 💛 솔라피에 연동된 카카오 채널을 API로 조회해 pfId를 속성(KAKAO_PF_ID)에 저장 (2026-08-24)
//   콘솔 UI를 뒤지지 않고 연동 확인 + pfId 확보를 한 번에 — action=kakaoPfSync
function kakaoPfSync_() {
  var a = solapiAuth_();
  // 경로가 버전에 따라 다름: v2 /kakao/v2/channels (현행) → 실패 시 구버전 /kakao/v1/plus-friends
  var urls = ['https://api.solapi.com/kakao/v2/channels', 'https://api.solapi.com/kakao/v1/plus-friends'];
  var code = 0, txt = '', body = {};
  for (var u = 0; u < urls.length; u++) {
    var res = UrlFetchApp.fetch(urls[u], { method: 'get', muteHttpExceptions: true, headers: { Authorization: a.header } });
    code = res.getResponseCode();
    txt = res.getContentText();
    if (code === 200) break;
  }
  body = {}; try { body = JSON.parse(txt); } catch (e) {}
  var list = body.channelList || body.list || body.plusFriends || (Array.isArray(body) ? body : []);
  var out = [];
  for (var i = 0; i < list.length; i++) {
    out.push({ pfId: String(list[i].channelId || list[i].pfId || ''),
               searchId: String(list[i].searchId || list[i].channelName || '') });
  }
  var pick = null;
  for (var j = 0; j < out.length; j++) {
    if (out[j].searchId.indexOf('브리즈') >= 0) { pick = out[j]; break; }
  }
  if (!pick && out.length === 1) pick = out[0];
  if (pick && pick.pfId) PropertiesService.getScriptProperties().setProperty('KAKAO_PF_ID', pick.pfId);
  return { http: code, channels: out, saved: pick ? pick.pfId : null,
           raw: out.length ? undefined : txt.slice(0, 300) };   // 목록이 비면 원문 일부로 원인 확인
}
// 📅 일정 알림 (2026-08-24 사장님 지시) — 미팅·계약·잔금 리마인더를 3번 보낸다:
//   ① 잡힌 즉시(확정 안내) ② 1일 전 ③ 당일 아침. 발송은 scheduleSend_ 경로
//   (알림톡 '일정안내' 템플릿 승인 시 알림톡 → 아니면 폰 유심(0원) → 솔라피 문자).
//   시트 '일정알림' 열: A시각 B id C날짜 D시간 E유형 F이름 G전화 H메모 I확정발송 J전일발송 K당일발송 L상태
var SCHED_SHEET = '일정알림';
function schedSheet_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(SCHED_SHEET);
  if (!sh) { sh = ss.insertSheet(SCHED_SHEET); sh.appendRow(['등록시각', 'id', '날짜', '시간', '유형', '이름', '전화', '메모', '확정발송', '전일발송', '당일발송', '상태', '캘린더ID']); }
  return sh;
}
function schedFmtDate_(d) { return Utilities.formatDate(d, 'Asia/Seoul', 'yyyy-MM-dd'); }
function schedLabel_(r) {                        // "8/25(화) 14:00 연동 사무실 미팅" 형태의 안내 문장
  var d = new Date(String(r[2]).replace(' ', 'T').slice(0, 10) + 'T00:00:00');
  var yo = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()] || '';
  var dt = (d.getMonth() + 1) + '/' + d.getDate() + '(' + yo + ')';
  var tm = String(r[3] || '').trim();
  var kind = String(r[4] || '일정');
  var memo = String(r[7] || '').trim();
  return dt + (tm ? ' ' + tm : '') + ' ' + kind + (memo ? ' — ' + memo : '');
}
// 일정 문자: 알림톡(일정안내 템플릿) → 폰 유심 → 솔라피. 문자 폴백은 단문(90B) 유지.
function scheduleSend_(to, label, prefix) {
  // 유료 SMS 폴백용 간결 단문 — 90B가 넘으면 메모부터 생략(문장 중간 절단 방지, 08-24)
  var full = '브리즈부동산중개입니다. ' + prefix + ' ' + label;
  var dash = label.indexOf(' — ');
  var noMemo = dash > 0 ? '브리즈부동산중개입니다. ' + prefix + ' ' + label.slice(0, dash) : full;
  var text = smsBytes_(full) <= 90 ? full : (smsBytes_(noMemo) <= 90 ? noMemo : smsTrim90_(noMemo));
  // 폰(0원)용 상세 — 업계 표준: 확정 선언문 + ▶라벨형 정보 + 변경·취소 안내 (08-24 웹 실측 조사 반영)
  var head = prefix === '[예약 확정]' ? '예약이 확정되었습니다.'
           : prefix === '[내일 일정]' ? '내일 일정을 안내드립니다.'
           : prefix === '[오늘 일정]' ? '오늘 일정을 안내드립니다.' : '일정을 안내드립니다.';
  var tail = prefix === '[예약 확정]' ? '변경·취소는 이 번호로 연락 부탁드립니다.'
                                      : '방문이 어려우시면 미리 연락 부탁드립니다.';
  var rich = '브리즈부동산중개입니다. ' + head + '\n▶ ' + label + '\n' + tail + ' 010-2601-0110';
  var p = PropertiesService.getScriptProperties();
  var tplId = String(p.getProperty('KAKAO_TPL_SCHEDULE') || '').trim();
  var cfg = kakaoCfg_();
  if (cfg.pfId && tplId) {
    try {
      var a = solapiAuth_();
      var msg = { to: to, from: a.sender,
                  kakaoOptions: { pfId: cfg.pfId, templateId: tplId,
                                  variables: { '#{안내내용}': prefix + ' ' + label }, disableSms: false } };
      var res = UrlFetchApp.fetch('https://api.solapi.com/messages/v4/send', {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        headers: { Authorization: a.header }, payload: JSON.stringify({ message: msg }) });
      if (res.getResponseCode() === 200) return { via: '알림톡' };
    } catch (se) {}
  }
  var ph = phoneSmsSend_(to, rich, 'sms');
  if (ph) return { via: '폰' };
  var r2 = smsSendMany([{ to: to, text: text }]);
  return { via: (r2 && r2.sent) ? '문자' : '실패' };
}
function scheduleAdd_(q) {
  var date = String(q.date || '').trim(), time = String(q.time || '').trim();
  var kind = String(q.kind || '미팅').trim(), name = String(q.name || '').trim();
  var phone = String(q.phone || '').replace(/\D/g, ''), memo = String(q.memo || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: '날짜는 yyyy-MM-dd 형식이어야 합니다: ' + date };
  if (phone.length < 9) return { error: '전화번호를 확인하세요: ' + q.phone };
  var sh = schedSheet_();
  var id = 'S' + new Date().getTime();
  var stamp = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
  var row = [stamp, id, date, time, kind, name, phone, memo, '', '', '', '예정', ''];
  var label = schedLabel_(row);
  var sent = '';
  if (String(q.confirm || '1') !== '0' && phone.length >= 9) {  // ① 잡힌 즉시 확정 안내 (confirm=0이면 생략)
    var r = scheduleSend_(phone, label, '[예약 확정]');
    sent = r.via;
    row[8] = stamp + ' ' + r.via;
  }
  // 📆 구글캘린더에도 등록 (2026-08-24 사장님 지시) — 실패해도 리마인더는 그대로 진행
  //    gcal=0이면 생략(계약처럼 양측 2건 등록 시 캘린더 중복 방지)
  var gcal = '';
  if (String(q.gcal || '1') !== '0') try {
    var tm = /^\d{1,2}:\d{2}/.test(time) ? time : '09:00';
    var st = new Date(date + 'T' + (tm.length === 4 ? '0' + tm : tm) + ':00');
    if (!isNaN(st.getTime())) {
      var ev = CalendarApp.getDefaultCalendar().createEvent(
        '[' + kind + '] ' + (name || phone || '') + (memo ? ' — ' + memo : ''),
        st, new Date(st.getTime() + 3600000));
      gcal = ev.getId();
      row[12] = gcal;
    }
  } catch (ce) { gcal = ''; }                    // 캘린더 권한 미승인 등 — 문자·리마인더에는 영향 없음
  sh.appendRow(row);
  logChange('listings', 'scheduleAdd', kind + ' ' + date + ' ' + (name || phone) + (sent ? ' 확정문자(' + sent + ')' : '') + (gcal ? ' 캘린더✓' : ''));
  return { id: id, label: label, confirmSent: sent || null, gcal: !!gcal };
}
function scheduleList_() {
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SCHED_SHEET);
  if (!sh) return { items: [] };
  var v = sh.getDataRange().getValues();
  var today = schedFmtDate_(new Date());
  var items = [];
  for (var i = 1; i < v.length; i++) {
    var r = v[i];
    if (!String(r[1] || '')) continue;
    var date = (r[2] instanceof Date) ? schedFmtDate_(r[2]) : String(r[2]).slice(0, 10);
    if (String(r[11]) === '완료' && date < today) continue;   // 지난 완료 건은 숨김
    items.push({ id: String(r[1]), date: date, time: String(r[3] || ''), kind: String(r[4] || ''),
                 name: String(r[5] || ''), phone: String(r[6] || ''), memo: String(r[7] || ''),
                 confirmed: String(r[8] || ''), dayBefore: String(r[9] || ''), dayOf: String(r[10] || ''),
                 status: String(r[11] || '') });
  }
  items.sort(function (a, b) { return (a.date + a.time) < (b.date + b.time) ? -1 : 1; });
  return { items: items.slice(0, 50) };
}
function scheduleDone_(id, mode) {               // mode: done(완료) | cancel(취소 — 리마인더 중단)
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SCHED_SHEET);
  if (!sh || !id) return { updated: 0 };
  var v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][1]) === String(id)) {
      sh.getRange(i + 1, 12).setValue(mode === 'cancel' ? '취소' : '완료');
      if (mode === 'cancel' && String(v[i][12] || '')) {       // 취소면 구글캘린더 이벤트도 삭제
        try { var ev = CalendarApp.getDefaultCalendar().getEventById(String(v[i][12])); if (ev) ev.deleteEvent(); } catch (ce) {}
      }
      return { updated: 1 };
    }
  }
  return { updated: 0 };
}
// 10분 스윕에 편승: 아침 9시 이후, 내일 일정(전일)·오늘 일정(당일)에 각 1회만 발송
function scheduleSweep_() {
  var now = new Date();
  var hour = parseInt(Utilities.formatDate(now, 'Asia/Seoul', 'H'), 10);
  if (hour < 9 || hour >= 21) return { sent: 0 };            // 야간·이른 아침 회피
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SCHED_SHEET);
  if (!sh) return { sent: 0 };
  var v = sh.getDataRange().getValues();
  var today = schedFmtDate_(now);
  var tomorrow = schedFmtDate_(new Date(now.getTime() + 86400000));
  var stamp = Utilities.formatDate(now, 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
  var n = 0;
  for (var i = 1; i < v.length; i++) {
    var r = v[i];
    if (String(r[11]) === '취소' || String(r[11]) === '완료') continue;
    var phone = String(r[6] || '').replace(/\D/g, '');
    if (phone.length < 9) continue;
    var date = (r[2] instanceof Date) ? schedFmtDate_(r[2]) : String(r[2]).slice(0, 10);
    if (date === tomorrow && !String(r[9] || '')) {           // ② 1일 전
      var r1 = scheduleSend_(phone, schedLabel_(r), '[내일 일정]');
      sh.getRange(i + 1, 10).setValue(stamp + ' ' + r1.via); n++;
    } else if (date === today && !String(r[10] || '')) {      // ③ 당일 아침
      var r2 = scheduleSend_(phone, schedLabel_(r), '[오늘 일정]');
      sh.getRange(i + 1, 11).setValue(stamp + ' ' + r2.via); n++;
    }
  }
  if (n) logChange('listings', 'scheduleSweep', '일정 리마인더 ' + n + '건 발송');
  return { sent: n };
}

// ✍️ 계약 문자 (2026-08-24 사장님 지시 "계약문자도") — 계약 저장 시 임대인·임차인 양측에
//   [계약 완료] 안내 + 잔금·입주일이 미래면 그 날짜로 리마인더(1일 전·당일)와 캘린더 등록(1건만).
//   경로: 알림톡(계약안내 템플릿 승인 시) → 폰 유심(0원, 상세) → 솔라피 단문.
function koDate_(dateStr) {
  var d = new Date(String(dateStr).slice(0, 10) + 'T00:00:00');
  if (isNaN(d.getTime())) return String(dateStr);
  var yo = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()] || '';
  return (d.getMonth() + 1) + '/' + d.getDate() + '(' + yo + ')';
}
function contractSend_(to, core, detail) {
  var p = PropertiesService.getScriptProperties();
  var tplId = String(p.getProperty('KAKAO_TPL_CONTRACT') || '').trim();
  var cfg = kakaoCfg_();
  if (cfg.pfId && tplId) {
    try {
      var a = solapiAuth_();
      var msg = { to: to, from: a.sender,
                  kakaoOptions: { pfId: cfg.pfId, templateId: tplId,
                                  variables: { '#{안내내용}': detail || core }, disableSms: false } };
      var res = UrlFetchApp.fetch('https://api.solapi.com/messages/v4/send', {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        headers: { Authorization: a.header }, payload: JSON.stringify({ message: msg }) });
      if (res.getResponseCode() === 200) return { via: '알림톡' };
    } catch (se) {}
  }
  // 폰(0원) 상세 — 업계 표준: 중개사 계약 문자는 항목 나열식(물건지·거래·잔금일)
  var rich = '브리즈부동산중개입니다. ' + (detail || core) + '\n문의사항은 이 번호로 연락 부탁드립니다. 010-2601-0110';
  var ph = phoneSmsSend_(to, rich, 'sms');
  if (ph) return { via: '폰' };
  var r2 = smsSendMany([{ to: to, text: core }]);   // core는 이미 90B 이내로 조립됨(smsFit_)
  return { via: (r2 && r2.sent) ? '문자' : '실패' };
}
function contractSms_(q) {
  var apt = String(q.apt || '').trim(), type = String(q.type || '').trim();
  var price = String(q.price || '').trim();
  var start = String(q.start || '').slice(0, 10);
  var future = /^\d{4}-\d{2}-\d{2}$/.test(start) && start >= schedFmtDate_(new Date());
  var ko = future ? koDate_(start) : '';
  // 단문 후보 사다리 — 잔금일이 잘리지 않게 긴 판부터 시도(08-24)
  var core = smsFit_(
    '브리즈부동산중개입니다. [계약 완료] ' + apt + (type ? ' ' + type : '') + ' 계약이 완료되었습니다.' + (ko ? ' 잔금·입주일 ' + ko + '.' : ''),
    '브리즈부동산중개입니다. [계약 완료] ' + apt + (type ? ' ' + type : '') + '.' + (ko ? ' 잔금·입주일 ' + ko + '.' : ''),
    '브리즈부동산중개입니다. [계약 완료] ' + apt + '.' + (ko ? ' 잔금·입주일 ' + ko + '.' : ''));
  var detail = '계약 체결 내용을 안내드립니다.\n▶ 물건지: ' + apt
    + '\n▶ 거래: ' + (type || '-') + (price ? ' ' + price : '')
    + (future ? '\n▶ 잔금·입주일: ' + koDate_(start) : '');
  var parties = [{ name: String(q.lname || ''), phone: String(q.lphone || ''), role: '임대인' },
                 { name: String(q.tname || ''), phone: String(q.tphone || ''), role: '임차인' }];
  var sent = [], reminders = 0, first = true;
  for (var i = 0; i < parties.length; i++) {
    var ph = parties[i].phone.replace(/\D/g, '');
    if (ph.length < 9) continue;
    var r = contractSend_(ph, core, detail);
    sent.push({ role: parties[i].role, via: r.via });
    if (future) {                                  // 잔금·입주일 리마인더 (1일 전·당일) — 확정 문자는 위에서 이미 감
      var ra = scheduleAdd_({ date: start, time: '', kind: '잔금·입주', name: parties[i].name,
                              phone: ph, memo: apt, confirm: '0', gcal: first ? '1' : '0' });
      if (ra && ra.id) { reminders++; first = false; }
    }
  }
  logChange('contracts', 'contractSms', apt + ' 계약 문자 ' + sent.length + '명 · 리마인더 ' + reminders + '건');
  return { sent: sent, reminders: reminders };
}

// 📁 드라이브 업로드 (2026-08-24 "밴드 사진 → 구글드라이브 공유") — doPost action=drivePut
//   body: { action:'drivePut', token, listingId:'R260827-01', name:'01_거실.jpg', b64:'...' }
//         (08-24 구버전 호환) { action:'drivePut', token, folder:'하위폴더명', name, b64 }
//
// 🔴 2026-08-27 사장님 지시 "반드시 사진보정 프로그램을 거치게 — 워터마크가 찍혀야 한다"
//    올라온 사진은 예외 없이 '원본' 폴더에만 들어간다. 광고에 쓰는 '보정완료' 폴더는
//    바탕화면 사진보정 프로그램만 만든다. 워터마크를 "찍는 걸 기억해야 하는 일"로 두면
//    언젠가 반드시 빠지므로, 광고용 사진이 사는 폴더 자체를 프로그램만 만들 수 있게 했다.
//    '원본'·'보정완료'는 그 프로그램의 약속어다 (automation/lib/common.js 의
//    INPUT_DIR_NAME·DEFAULT_OUTPUT_DIR_NAME). 여기 값을 바꾸면 프로그램이 사진을 못 찾는다.
//    폴더 규칙 문서: G:\내 드라이브\브리즈매물사진\_사진관리규칙.txt
var DRIVE_ROOT    = '브리즈매물사진';
var PHOTO_IN_DIR  = '원본';        // 사진을 넣는 곳 (사진보정 프로그램이 여기를 읽는다)
var PHOTO_OUT_DIR = '보정완료';    // 워터마크 찍힌 광고용 (프로그램만 만든다 — 여기에 업로드 금지)
// 사진보정 프로그램이 만드는 결과 폴더 이름 3종 (돌린 방식에 따라 다르다 — 앞에 있는 것부터 찾는다)
var PHOTO_OUT_DIRS = ['보정완료', '보정완료_무료', '보정완료_grok'];

// 🔤 폴더 이름 비교용 정규화 (2026-08-28)
//   CRM에는 '에코 드 파리', 드라이브 폴더는 '에코드파리'로 돼 있어 폴더를 못 찾았다.
//   그 매물의 사진이 통째로 안 붙는 원인이었고(홈페이지 20건이 전부 이 건물),
//   반대 경우(CRM '에코드파리' ↔ 폴더 '에코 드 파리')도 같은 문제다.
//   ※ 띄어쓰기·대소문자만 무시한다. 폴더 590개의 이름을 바꾸는 게 아니라 '찾을 때만' 느슨하게 본다.
function folderKey_(s) {
  return String(s || '').replace(/\s+/g, '').toLowerCase();
}

// 부모 폴더 안에서 이름이 같은 하위 폴더를 찾는다(띄어쓰기·대소문자 무시). 없으면 null.
//   1) 정확히 일치하는 이름을 먼저 본다 — 대부분 여기서 끝나므로 느려지지 않는다.
//   2) 없을 때만 하위 폴더를 훑어 느슨하게 맞춰 본다.
function findFolderLoose_(parent, name) {
  var it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  var want = folderKey_(name);
  if (!want) return null;
  var all = parent.getFolders();
  while (all.hasNext()) {
    var f = all.next();
    if (folderKey_(f.getName()) === want) return f;
  }
  return null;
}

function driveFolder_(sub) {
  var root;
  var it = DriveApp.getFoldersByName(DRIVE_ROOT);
  root = it.hasNext() ? it.next() : DriveApp.createFolder(DRIVE_ROOT);
  if (!sub) return root;
  return findFolderLoose_(root, sub) || root.createFolder(sub);
}

// 여러 단계 폴더를 순서대로 찾아 들어가며 없으면 만든다. create=false 면 없을 때 null.
//   새로 만들 때는 CRM에 적힌 표기 그대로 만든다(느슨한 매칭은 '찾기'에만 쓴다).
function driveFolderPath_(segs, create) {
  var f = driveFolder_('');
  for (var i = 0; i < segs.length; i++) {
    var name = String(segs[i] || '').trim();
    if (!name) continue;
    var hit = findFolderLoose_(f, name);
    if (hit) { f = hit; continue; }
    if (create === false) return null;
    f = f.createFolder(name);
  }
  return f;
}

// 주소에서 동/읍/면/리를 뽑는다. '제주특별자치도 제주시 연동 251-9' → '연동'
function photoDong_(addr) {
  var toks = String(addr || '').replace(/[(),]/g, ' ').split(/\s+/);
  for (var i = toks.length - 1; i >= 0; i--) {
    // {1,6}인 이유: '연동'처럼 두 글자짜리 동네가 있다 (2,7로 뒀다가 검산에서 잡힘)
    if (/^[가-힣][가-힣0-9]{0,7}(동|읍|면|리)$/.test(toks[i])) return toks[i];   // 하귀1리 처럼 숫자가 든 리도 읽는다(101동 같은 건물 동은 첫 글자가 숫자라 제외)
  }
  return '';
}

// 호수 폴더 이름. '101동 801호' → '101동-0801호' / '913호' → '0913호' / 빈칸 → '_건물'
//   네 자리로 0을 채우는 이유: 글자 순서 정렬이라 안 채우면 1105호가 913호보다 앞에 선다.
function photoUnit_(addr2) {
  var s = String(addr2 || '').trim();
  if (!s) return '_건물';
  var dong = (s.match(/(\d+)\s*동/) || [])[1];
  var ho   = (s.match(/(\d+)\s*호/) || [])[1];
  if (!ho && /^\d{1,4}$/.test(s)) ho = s;
  if (!ho) return s.replace(/[\\\/:*?"<>|]/g, '_');   // 숫자가 없으면 적힌 대로 둔다
  return (dong ? dong + '동-' : '') + pad4(ho) + '호';
}

// 주소에서 시(市)를 뽑는다 — 제주시 / 서귀포시 (2026-08-30 사장님 지시로 별도 표기)
//   '월평동'처럼 두 시에 같은 이름의 동이 있어서, 시를 안 나누면 구분이 안 된다.
//   못 읽으면 '_시확인필요'로 보내 사람이 보게 한다 (엉뚱한 시에 넣는 것보다 낫다).
function photoCity_(addr) {
  var a = String(addr || '');
  if (a.indexOf('서귀포시') > -1) return '서귀포시';
  if (a.indexOf('제주시') > -1) return '제주시';
  return '_시확인필요';
}

function photoKindRoot_(kind) {
  var k = String(kind || '');
  if (/상가|사무실|점포|공장|창고/.test(k)) return '02_상가';
  if (/토지|임야|대지/.test(k)) return '03_토지';
  return '01_주거용';
}

/* 매물 한 건 → 사진 폴더 경로 조각. 동이나 건물명이 없으면 날짜별 미분류로 보낸다.

   🔴 건물 폴더 이름은 '동 + 건물명' 이다 (2026-08-30 사장님 결정).
      예) 01_주거용 \ 연동 \ 연동 에코드파리 \ 1319호 \ 원본
      드라이브 검색창에서는 상위 폴더가 안 보인다. '에코드파리'만 있으면 어느 동인지 알 수 없어
      사장님이 건물 폴더 975개 중 954개를 '동 건물명'으로 바꿔 두셨고, 그 형태를 기준으로 삼는다.
      (종전 규칙은 동을 안 붙이는 것이었다 — 문서도 이 결정에 맞춰 고쳤다)

   ※ 주소가 같으면 언제나 같은 이름이 나오도록 여기 한 곳에서만 만든다.
     CRM [📷 사진 올리기]로 넣으면 사장님이 경로를 고를 일이 없다. */
function photoSegsFor_(o) {
  var dong = photoDong_(o.addr);
  var bldg = String(o.apt || '').trim();
  // 건물명에 동이 이미 붙어 있으면 일단 뗀다 — 아래에서 다시 붙이므로 '연동 연동 에코…'를 막는다
  if (dong && bldg !== dong && bldg.indexOf(dong) === 0) bldg = bldg.slice(dong.length).trim() || bldg;
  // 호수가 addr2 에 따로 있는데 건물명 끝에도 붙어 있으면 뗀다 (에코세잔 1102호 → 에코세잔)
  if (String(o.addr2 || '').trim()) bldg = bldg.replace(/\s*\d{1,4}\s*호\s*$/, '').trim();
  bldg = bldg.replace(/[\\\/:*?"<>|]/g, '_');
  if (!dong || !bldg) {
    return ['99_미분류', Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd')];
  }
  return [photoKindRoot_(o.kind), photoCity_(o.addr), dong, dong + ' ' + bldg, photoUnit_(o.addr2)];
}

function listingById_(id) {
  var rows = getOrCreateSheet('listings').getDataRange().getValues();
  if (rows.length < 2) return null;
  var hs = rows[0].map(String);
  var ic = hs.indexOf('id');
  if (ic < 0) return null;
  var want = String(id || '').trim();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][ic]).trim() !== want) continue;
    var o = {};
    for (var c = 0; c < hs.length; c++) o[hs[c]] = fmtCell(rows[i][c]);
    return o;
  }
  return null;
}

/* 🔒 2026-09-10 사진 업로드 소유 검사 — 직원이 남의 매물 폴더에 사진을 넣지 못하게.
   기존 임대인 규칙(본인이 등록한 것만 수정)과 같은 생각이다. 새 권한체계를 만들지 않는다.
   🔴 담당자가 비어 있는 매물은 막지 않는다 — 아직 담당을 안 정한 매물이 많고,
      담당 배정은 별도 결정 사항이라 여기서 대신 정하지 않는다(P0-2 원칙). */
function photoOwnGuard_(user, listingId) {
  if (!user || user.role === 'admin') return;              // 대표는 전체
  var id = String(listingId || '').trim();
  if (!id) return;                                          // 매물 지정이 없으면 미분류로 가므로 그대로 둔다
  var o = null;
  try { o = listingById_(id); } catch (e) { return; }       // 못 읽으면 기존 흐름에 맡긴다
  if (!o) return;
  var ag = String(o.agent || '').trim();
  if (!ag) return;                                          // 담당자 없음 = 막지 않는다
  if (ag === user.id || ag === user.name) return;
  throw new Error('본인이 담당하는 매물에만 사진을 올릴 수 있습니다 (담당: ' + ag + ')');
}

function drivePut_(body) {
  var name = String(body.name || 'file.jpg');
  var b64 = String(body.b64 || '');
  if (!b64) return { error: 'b64 비어 있음' };
  var mime = name.match(/\.png$/i) ? 'image/png' : (name.match(/\.webp$/i) ? 'image/webp' : 'image/jpeg');

  var folder, where;
  if (body.listingId) {
    var o = listingById_(body.listingId);
    if (!o) return { error: '매물번호를 시트에서 못 찾았습니다: ' + body.listingId + ' — 매물을 먼저 저장하세요' };
    // 🔴 2026-09-10 — 이미 있는 건물 폴더 아래에만 넣는다.
    //   종전에는 photoSegsFor_ 가 만든 이상적 경로(01_주거용/제주시/연동/연동 에코드파리/…)를
    //   driveFolderPath_(segs, true) 로 통째로 만들었다. 그런데 실제 드라이브는
    //   01_주거용/연동/260-15 (에코드파리)/… 라서, 올릴 때마다 사진창고가 둘로 갈라졌다.
    //   (사진보정 프로그램은 이름이 '원본'인 폴더를 전부 훑으므로, 갈라진 쪽도 그대로 보정돼
    //    광고에 쓸 사진이 두 군데로 흩어진다 — 실측: D:/breeze-tools 사진보정 findOriginalDirs)
    //   그래서 건물 폴더는 '찾은 것'만 쓰고, 못 찾거나 후보가 여럿이면 아예 만들지 않는다.
    var found = photoFindBase_(o);
    if (!found.bldFolder) {
      return { error: '건물 폴더를 하나로 정하지 못해 올리지 않았습니다 — ' + (found.why || '')
                 + (found.cands && found.cands.length ? (' / 후보: ' + found.cands.join(' · ')) : ''),
               status: 'REVIEW_REQUIRED', why: found.why || '', cands: found.cands || [],
               looked: DRIVE_ROOT + '/' + photoSegsFor_(o).join('/'),
               hint: '드라이브에서 건물 폴더를 확인한 뒤 다시 올리세요. 폴더를 직접 지정해 올릴 수도 있습니다.' };
    }
    // 건물 폴더 아래의 호실·원본만 필요하면 만든다 (건물 폴더는 절대 새로 만들지 않는다)
    var unitF = found.unitFolder || findFolderLoose_(found.bldFolder, found.unit)
                || found.bldFolder.createFolder(found.unit);
    var inF   = findFolderLoose_(unitF, PHOTO_IN_DIR) || unitF.createFolder(PHOTO_IN_DIR);
    folder = inF;                                        // 🔴 언제나 '원본'. 보정완료엔 못 넣는다
    where  = DRIVE_ROOT + '/' + found.path
             + (found.unitFolder ? '' : '/' + found.unit) + '/' + PHOTO_IN_DIR;
  } else {
    folder = driveFolder_(String(body.folder || '').trim());
    where  = DRIVE_ROOT + (body.folder ? '/' + String(body.folder).trim() : '');
  }

  var blob = Utilities.newBlob(Utilities.base64Decode(b64), mime, name);
  var f = folder.createFile(blob);
  f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { id: f.getId(), url: 'https://drive.google.com/file/d/' + f.getId() + '/view',
           folderUrl: folder.getUrl(), path: where, size: blob.getBytes().length };
}

/* ── 📷 실제 Drive 구조로 사진 폴더 찾기 (2026-09-09 실측 반영) ─────────────
   왜 필요한가 — 실측으로 확인된 어긋남 두 가지
     ① 코드가 찾던 경로: 01_주거용 / **제주시** / 연동 / **연동 에코드파리** / 0504호
     ② 실제 드라이브   : 01_주거용 /           연동 / **260-15 (에코드파리)** / 0604호
     01_주거용 아래 63개가 전부 동·리라 '제주시' 단계에서 곧바로 실패했고,
     건물 폴더는 '동 건물명' 이 아니라 '지번 (건물명)' · '건물명' · '지번' · '도로명' 이 섞여 있다.
     그래서 사진 9,166장이 있어도 매물에 하나도 안 붙었다(photoUrl 0/44).
   🔴 원칙
     · 드라이브 폴더를 옮기거나 이름을 바꾸지 않는다 — '찾을 때만' 실제 구조를 본다.
     · 동·지번·건물명·호수를 함께 본다. 하나만 믿고 붙이지 않는다.
     · 건물명이 비슷해도 지번이 다르면 다른 건물로 본다(실측: 메르헨하우스3 722-2 ↔ 폴더 722-3).
     · 지번은 맞는데 건물명이 전혀 다르고, 이름이 맞는 폴더가 따로 있으면 '후보 복수'로 사람에게 넘긴다.
     · '사진 없음' 과 '폴더 못 찾음' 을 반드시 구분해 돌려준다. */

/* 주소에서 지번(123 / 123-4 / 산12)을 뽑는다 — 동·읍·면·리 바로 뒤의 숫자만 본다 */
function photoJibun_(addr) {
  var a = String(addr || '').replace(/[(),]/g, ' ');
  var m = a.match(/[가-힣][가-힣0-9]{0,7}(?:동|읍|면|리)\s*(산\s*)?(\d+(?:-\d+)?)/);
  return m ? ((m[1] ? '산' : '') + m[2]) : '';
}
/* 폴더 이름을 숫자 토막과 글자 토막으로 나눈다. '260-15 (에코드파리)' → nums ['260-15'] · words ['에코드파리'] */
function folderTokens_(name) {
  var s = String(name || ''), nums = [], words = [], cur = '', mode = '';
  function flush() { if (cur) { (mode === 'n' ? nums : words).push(cur); cur = ''; } }
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i);
    if (c === ' ' || c === '(' || c === ')' || c === ',' || c === '_' || c === '.' || c === '+') { flush(); mode = ''; continue; }
    var m = ((c >= '0' && c <= '9') || c === '-') ? 'n' : 'w';
    if (m !== mode) { flush(); mode = m; }
    cur += c;
  }
  flush();
  return { nums: nums, words: words };
}
/* 건물 폴더 후보 고르기.
   반환 { hit, why } / { multi:[…], why } / { clash:[…], why } / null */
function photoPickBuilding_(names, jibun, bld) {
  var bkey = folderKey_(bld);
  var strong = [], byJibun = [], byName = [], clash = [];
  for (var i = 0; i < names.length; i++) {
    var nm = names[i];
    if (nm.charAt(0) === '_') continue;                  // _지번없음·_미분류 같은 보관용 폴더는 건너뛴다
    var t = folderTokens_(nm);
    var jOk = !!jibun && t.nums.indexOf(jibun) >= 0;      // 토막이 통째로 같아야 한다 (260-1 ≠ 260-15)
    var nOk = false;
    if (bkey.length >= 2) {
      for (var w = 0; w < t.words.length; w++) {
        var wk = folderKey_(t.words[w]);
        if (!wk) continue;
        if (wk === bkey) { nOk = true; break; }
        var shortLen = Math.min(wk.length, bkey.length);
        if (shortLen >= 4 && (wk.indexOf(bkey) >= 0 || bkey.indexOf(wk) >= 0)) { nOk = true; break; }
      }
      if (!nOk && folderKey_(nm) === bkey) nOk = true;
    }
    var jClash = !!jibun && t.nums.length > 0 && t.nums.indexOf(jibun) < 0;
    if (jOk && nOk) strong.push(nm);
    else if (jOk) byJibun.push(nm);
    else if (nOk && !jClash) byName.push(nm);
    else if (nOk && jClash) clash.push(nm);
  }
  if (strong.length === 1) return { hit: strong[0], why: '지번+건물명' };
  if (strong.length > 1) return { multi: strong, why: '지번+건물명 후보 여럿' };
  if (byJibun.length === 1 && !byName.length) {
    var tt = folderTokens_(byJibun[0]);
    var agree = tt.words.length === 0 || bkey.length < 3;
    for (var k = 0; !agree && k < tt.words.length; k++) {
      var kk = folderKey_(tt.words[k]), common = 0;
      while (common < kk.length && common < bkey.length && kk.charAt(common) === bkey.charAt(common)) common++;
      if (common >= 3) agree = true;
    }
    if (!agree && clash.length) return { multi: byJibun.concat(clash), why: '지번 폴더와 건물명 폴더가 서로 다름' };
    return { hit: byJibun[0], why: agree ? '지번' : '지번(건물명 확인 필요)' };
  }
  if (byJibun.length > 1) return { multi: byJibun, why: '지번 후보 여럿' };
  if (byName.length === 1 && String(bld || '').replace(/\s/g, '').length >= 3) return { hit: byName[0], why: '건물명' };
  if (byName.length > 1) return { multi: byName, why: '건물명 후보 여럿' };
  if (byJibun.length === 1 && byName.length === 1) return { multi: byJibun.concat(byName), why: '지번·건물명이 서로 다른 폴더' };
  if (clash.length) return { clash: clash, why: '건물명은 비슷하나 지번이 다름' };
  return null;
}
/* 매물 한 건 → 실제 드라이브의 건물 폴더·호실 폴더를 찾는다(만들지 않는다).
   status: dong-miss / bld-miss / bld-multi / bld-only / unit-hit */
function photoFindBase_(o) {
  var out = { status: '', why: '', bldFolder: null, unitFolder: null, cands: [],
              path: '', kind: photoKindRoot_(o.kind), dong: photoDong_(o.addr),
              jibun: photoJibun_(o.addr), unit: photoUnit_(o.addr2) };
  var root = driveFolder_('');
  var kindF = findFolderLoose_(root, out.kind);
  if (!kindF) { out.status = 'dong-miss'; out.why = out.kind + ' 폴더가 없습니다'; return out; }
  // 🔴 실제 구조에는 시(市) 단계가 없다. 있으면 들어가고, 없으면 건너뛴다(옛 구조도 계속 읽히게).
  var cityF = findFolderLoose_(kindF, photoCity_(o.addr));
  var base = cityF || kindF;
  var dongF = out.dong ? findFolderLoose_(base, out.dong) : null;
  if (!dongF && base !== kindF) dongF = out.dong ? findFolderLoose_(kindF, out.dong) : null;
  if (!dongF) { out.status = 'dong-miss'; out.why = '동·리 폴더를 찾지 못했습니다: ' + (out.dong || '(주소에 동 없음)'); return out; }
  var names = [], it = dongF.getFolders();
  while (it.hasNext()) names.push(it.next().getName());
  var pick = photoPickBuilding_(names, out.jibun, String(o.apt || '').trim());
  if (!pick) { out.status = 'bld-miss'; out.why = '건물 폴더를 찾지 못했습니다'; return out; }
  if (pick.clash) { out.status = 'bld-miss'; out.why = pick.why; out.cands = pick.clash; return out; }
  if (pick.multi) { out.status = 'bld-multi'; out.why = pick.why; out.cands = pick.multi; return out; }
  out.bldFolder = findFolderLoose_(dongF, pick.hit);
  out.why = pick.why;
  out.path = out.kind + '/' + out.dong + '/' + pick.hit;
  if (!out.bldFolder) { out.status = 'bld-miss'; out.why = '건물 폴더를 여는 데 실패했습니다'; return out; }
  out.unitFolder = findFolderLoose_(out.bldFolder, out.unit);
  out.status = out.unitFolder ? 'unit-hit' : 'bld-only';
  if (out.unitFolder) out.path += '/' + out.unit;
  return out;
}

// 📷 매물사진 현황 — doPost action=drivePhotos { token, listingId }
//   '원본' 몇 장 / '보정완료'(워터마크 완료) 몇 장인지와, 광고에 바로 쓸 수 있는 사진 목록을 준다.
//   보정완료가 원본보다 적으면 그 차이가 곧 '아직 보정 안 한 장수'다.
function drivePhotos_(body) {
  var o = listingById_(body.listingId);
  if (!o) return { error: '매물번호를 시트에서 못 찾았습니다: ' + body.listingId };
  // 🔴 실제 드라이브 구조로 찾는다. '사진 없음' 과 '폴더 못 찾음' 을 구분해 돌려준다.
  var found = photoFindBase_(o);
  var base = found.unitFolder;
  var out = { path: found.path ? (DRIVE_ROOT + '/' + found.path) : (DRIVE_ROOT + '/' + photoSegsFor_(o).join('/')),
              folderUrl: '', raw: 0, done: 0, photos: [],
              status: found.status, why: found.why, cands: found.cands,
              bldPath: found.bldFolder ? (DRIVE_ROOT + '/' + found.path) : '',
              bldUrl: found.bldFolder ? found.bldFolder.getUrl() : '' };
  // 📌 2026-09-10 — 호실 사진과 건물 사진을 섞지 않는다.
  //   건물 폴더까지만 찾은 것을 '이 호실 사진이 있다'로 세면 엉뚱한 방 사진이 광고에 나간다.
  //     EXACT_UNIT      이 호실 폴더에서 사진을 실제로 셌다
  //     UNIT_EMPTY      호실 폴더는 있는데 사진이 없다
  //     BUILDING_ONLY   건물 폴더는 하나로 정했지만 이 호실 폴더가 없다
  //     REVIEW_REQUIRED 건물 폴더가 없거나 후보가 여럿이다 — 사람이 봐야 한다
  out.match = (found.status === 'bld-only') ? 'BUILDING_ONLY'
            : (found.status === 'unit-hit') ? 'UNIT_EMPTY' : 'REVIEW_REQUIRED';
  if (!base) return out;                      // 폴더를 못 찾음(사진이 없는 것과 다르다)
  out.folderUrl = base.getUrl();

  function countIn(dirName) {
    return findFolderLoose_(base, dirName);
  }
  var inDir = countIn(PHOTO_IN_DIR);
  if (inDir) { var fi = inDir.getFiles(); while (fi.hasNext()) { fi.next(); out.raw++; } }

  // 사진보정 프로그램은 어떤 방식으로 돌렸느냐에 따라 결과 폴더 이름이 달라진다 (2026-08-28 실측).
  //   AI 보정 → '보정완료' / 무료 로컬 보정 → '보정완료_무료' / grok → '보정완료_grok'
  //   '보정완료'만 보면 무료로 돌린 사진이 통째로 안 보이므로 세 가지를 순서대로 찾는다.
  //   ※ 셋 다 워터마크가 찍혀 나오므로 광고에 써도 된다.
  var outDir = null;
  for (var d = 0; d < PHOTO_OUT_DIRS.length && !outDir; d++) outDir = countIn(PHOTO_OUT_DIRS[d]);
  if (outDir) {
    var fo = outDir.getFiles();
    while (fo.hasNext()) {
      var f = fo.next();
      out.done++;
      if (out.photos.length < 40) {
        out.photos.push({ name: f.getName(), id: f.getId(),
                          url: 'https://drive.google.com/file/d/' + f.getId() + '/view',
                          thumb: 'https://drive.google.com/thumbnail?id=' + f.getId() + '&sz=w400' });
      }
    }
    out.photos.sort(function (a, b) { return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); });
    out.folderUrl = outDir.getUrl();
  }
  out.pending = Math.max(0, out.raw - out.done);
  // 실제로 세어 본 뒤에만 EXACT_UNIT 으로 올린다 (억지로 늘리지 않는다)
  if (found.status === 'unit-hit' && (out.raw > 0 || out.done > 0)) out.match = 'EXACT_UNIT';
  return out;
}

// 💛 알림톡 템플릿 상태 동기화 (2026-08-24) — 검수 승인되는 순간 자동 활성 + 1회 테스트 발송
//   템플릿 3종(문의접수안내·부재중전화안내·상담전화후안내)을 솔라피 API로 조회해,
//   APPROVED가 되면 템플릿ID를 속성에 자동 저장 → sendSmart_가 그때부터 알림톡으로 나간다.
//   전부 준비되면 KAKAO_TEST_TO(기본 010-2584-0110 — 08-24 사장님 지시)로 테스트 알림톡 1회.
var KAKAO_TPL_MAP = { '문의접수안내': 'KAKAO_TPL_INQUIRY', '부재중전화안내': 'KAKAO_TPL_MISSED', '상담전화후안내': 'KAKAO_TPL_CALLEND', '일정안내': 'KAKAO_TPL_SCHEDULE', '계약안내': 'KAKAO_TPL_CONTRACT' };
/**
 * 💛 알림톡 현황 조회 — **아무것도 보내지 않고, 아무것도 저장하지 않는다** (2026-08-28)
 *   kakaoTplSync_ 는 조회하면서 승인된 템플릿ID를 속성에 저장하고, 조건이 맞으면
 *   **시험 문자를 실제로 발송한다**(KAKAO_TEST_SENT). "승인됐는지 보기만" 하려고
 *   그걸 부르면 손님 번호로 문자가 나갈 수 있다. 그래서 읽기 전용을 따로 뒀다.
 */
function kakaoStatus_() {
  var p = PropertiesService.getScriptProperties();
  var cfg = kakaoCfg_();
  var out = {
    pfId: cfg.pfId || '(없음)',
    설정된템플릿: { 문의: cfg.tpl.sms || '(없음)', 부재중: cfg.tpl.call || '(없음)', 통화종료: cfg.tpl.callEnd || '(없음)',
                   일정: String(p.getProperty('KAKAO_TPL_SCHEDULE') || '') || '(없음)' },
    시험발송기록: String(p.getProperty('KAKAO_TEST_SENT') || '') || '(아직 없음)',
    자동응답: String(p.getProperty('AUTO_REPLY') || 'on'),
    단문모드: String(p.getProperty('AUTO_REPLY_SHORT') || 'on'),
    폰발신웹훅: phoneSmsWebhook_() ? '설정됨' : '(없음 — 솔라피로 나감)'
  };
  try {
    var a = solapiAuth_();
    var urls = ['https://api.solapi.com/kakao/v2/templates?limit=100',
                'https://api.solapi.com/kakao/v1/templates?limit=100'];
    var code = 0, txt = '';
    for (var u = 0; u < urls.length; u++) {
      var res = UrlFetchApp.fetch(urls[u], { method: 'get', muteHttpExceptions: true, headers: { Authorization: a.header } });
      code = res.getResponseCode(); txt = res.getContentText();
      if (code === 200) break;
    }
    out.http = code;
    var body = {}; try { body = JSON.parse(txt); } catch (e) {}
    var list = body.templateList || body.list || (Array.isArray(body) ? body : []);
    out.템플릿수 = list.length;
    out.템플릿 = list.map(function (t) {
      return { 이름: String(t.name || ''), id: String(t.templateId || t.id || ''),
               상태: String(t.status || ''),
               // 반려 사유는 객체 배열로 온다 — String() 하면 '[object Object]' 가 되어 못 읽는다(08-28 실측)
               검수: (function () {
                 var c = t.comments || t.inspectionStatus;
                 if (c == null) return '';
                 if (typeof c === 'string') return c;
                 try { return JSON.stringify(c); } catch (e) { return String(c); }
               })(),
               채널: String(t.channelId || t.pfId || ''),
               본문: String(t.content || '').slice(0, 200) };
    });
    if (!list.length) out.원문 = txt.slice(0, 300);
  } catch (e) { out.오류 = String(e && e.message || e); }
  return out;
}

function kakaoTplSync_() {
  var a = solapiAuth_();
  var urls = ['https://api.solapi.com/kakao/v2/templates?limit=100', 'https://api.solapi.com/kakao/v1/templates?limit=100'];
  var code = 0, txt = '';
  for (var u = 0; u < urls.length; u++) {
    var res = UrlFetchApp.fetch(urls[u], { method: 'get', muteHttpExceptions: true, headers: { Authorization: a.header } });
    code = res.getResponseCode();
    txt = res.getContentText();
    if (code === 200) break;
  }
  var body = {}; try { body = JSON.parse(txt); } catch (e) {}
  var list = body.templateList || body.list || (Array.isArray(body) ? body : []);
  var p = PropertiesService.getScriptProperties();
  var out = [], saved = [];
  for (var i = 0; i < list.length; i++) {
    var t = list[i];
    var name = String(t.name || ''), id = String(t.templateId || t.id || ''), st = String(t.status || '');
    out.push({ name: name, id: id, status: st });
    if (KAKAO_TPL_MAP[name] && id && /APPROVED/i.test(st)) { p.setProperty(KAKAO_TPL_MAP[name], id); saved.push(name); }
  }
  var fired = null;
  if (p.getProperty('KAKAO_TPL_INQUIRY') && !p.getProperty('KAKAO_TEST_SENT')) {
    var to = p.getProperty('KAKAO_TEST_TO') || '01025840110';
    var r = sendSmart_(to, autoReplyText_('sms', ''), 'sms',
      { '#{매물안내}': '지금 안내 가능한 매물: 연동 원룸 월세 300/40, 22㎡ 7층' });
    p.setProperty('KAKAO_TEST_SENT', new Date().toISOString());
    fired = { to: to, via: r.via };
    logChange('listings', 'kakaoTest', '알림톡 활성 확인 테스트 발송 → ' + to + ' (' + r.via + ')');
  }
  return { http: code, templates: out, saved: saved, test: fired,
           raw: out.length ? undefined : txt.slice(0, 300) };
}
function kakaoTplAutoCheck_() {                  // smsQueueSweep(10분)이 부른다 — 승인 전까지 6시간에 1번만 조회
  var p = PropertiesService.getScriptProperties();
  if (p.getProperty('KAKAO_TPL_INQUIRY')) return;
  var last = parseInt(p.getProperty('KAKAO_TPL_LASTCHK') || '0', 10);
  if (new Date().getTime() - last < 6 * 3600 * 1000) return;
  p.setProperty('KAKAO_TPL_LASTCHK', String(new Date().getTime()));
  kakaoTplSync_();
}
// 알림톡 우선·문자 폴백 발송. kind: 'sms'|'call'|'callEnd' → 해당 템플릿 사용.
// 우선순위: ① 알림톡(속성 설정 시 — 카톡이라 [Web발신] 없음) ② 폰 유심(웹훅 설정 시 — 0원·[Web발신] 없음) ③ 솔라피 문자
function sendSmart_(to, text, kind, variables, textRich) {
  var cfg = kakaoCfg_();
  var tplId = cfg.tpl[kind] || '';
  if (!cfg.pfId || !tplId) {
    var ph = phoneSmsSend_(to, textRich || text, kind);   // 폰 유심=0원 → 상세 문구 사용
    if (ph) return ph;
    return { r: smsSendMany([{ to: to, text: text }]), via: '문자' };   // 유료 SMS 폴백 → 간결 단문
  }
  try {
    var a = solapiAuth_();
    // 공식 스펙(08-23 조사): 알림톡은 text와 variables를 동시에 못 쓴다 — variables만.
    // disableSms:false(기본)면 실패 시 솔라피가 템플릿 내용으로 SMS 자동 대체(발신번호 등록돼 있음).
    var msg = { to: to, from: a.sender,
                kakaoOptions: { pfId: cfg.pfId, templateId: tplId,
                                variables: variables || {}, disableSms: false } };
    var res = UrlFetchApp.fetch('https://api.solapi.com/messages/v4/send', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: a.header }, payload: JSON.stringify({ message: msg }) });
    if (res.getResponseCode() === 200) return { r: { sent: 1, failed: [] }, via: '알림톡' };
    var b = {}; try { b = JSON.parse(res.getContentText()); } catch (e2) {}
    // 알림톡 요청 자체가 거부되면(템플릿·프로필 문제) 문자로 재시도 — 손님이 응답을 못 받는 일은 없게
    var r2 = smsSendMany([{ to: to, text: text }]);
    return { r: r2, via: '문자(알림톡 거부: ' + (b.errorMessage || b.errorCode || res.getResponseCode()) + ')' };
  } catch (e) {
    var r3 = smsSendMany([{ to: to, text: text }]);
    return { r: r3, via: '문자(알림톡 오류: ' + (e && e.message || e) + ')' };
  }
}

function autoReplyMode_() {                      // 'on' | 'off' | 'dry'(모의발송 — 로그만)
  var v = String(PropertiesService.getScriptProperties().getProperty('AUTO_REPLY') || 'on').toLowerCase();
  return (v === 'off' || v === 'dry') ? v : 'on';
}
function autoReplyOn_() { return autoReplyMode_() !== 'off'; }

// 📋 문의 문장에 맞는 매물 추천 (2026-08-23 보고서 반영: "3분 응답 + 즉시 매물 제시"의 자동화)
//   문의 텍스트에서 동네·건물명·유형·거래를 읽어 광고 가능한 매물(접수·공실) 중 2건을 고른다.
//   과장 없이 사실만(지역·유형·가격·면적·층) — 매칭 점수 2점 미만이면 아무것도 붙이지 않는다.
function smartReplySuggest_(text) {
  try {
    if (String(PropertiesService.getScriptProperties().getProperty('AUTO_REPLY_LISTINGS') || 'on').toLowerCase() === 'off') return '';
    text = String(text || '');
    if (!text.trim()) return '';
    var wantType = (text.match(/월세|연세|전세|매매|단기/) || [])[0] || '';
    var wantKind = '';
    if (/투룸|두\s*칸|2\s*룸/.test(text)) wantKind = '투룸';
    else if (/원룸|1\.5룸|룸\b|방\s*구/.test(text)) wantKind = '원룸';
    if (/오피스텔|오피\b/.test(text)) wantKind = wantKind || '오피스텔';
    if (/아파트/.test(text)) wantKind = '아파트';
    if (/상가|사무실|점포/.test(text)) wantKind = '상가사무실';
    var v = getOrCreateSheet('listings').getDataRange().getValues();
    if (v.length < 2) return '';
    var h = v[0].map(String);
    var col = function (n) { return h.indexOf(n); };
    var ci = { id: col('id'), addr: col('addr'), apt: col('apt'), type: col('type'), kind: col('kind'),
               price: col('price'), rent: col('rentAmt'), area: col('area'), floor: col('floor'), status: col('status') };
    var scored = [];
    for (var i = 1; i < v.length; i++) {
      var r = v[i];
      var status = String(r[ci.status] || '').trim();
      if (status && status !== '접수' && status !== '공실') continue;
      var addr = String(r[ci.addr] || ''), apt = String(r[ci.apt] || '').trim();
      var kind = String(r[ci.kind] || ''), type = String(r[ci.type] || '').trim();
      var dong = (addr.match(/(?:제주시|서귀포시)\s+([가-힣0-9]+[동읍면리])/) || [])[1] || '';
      // 🔴 유형·거래가 명시된 문의와 어긋나는 매물은 점수와 무관하게 제외 (상가 문의에 원룸 보내기 방지)
      if (wantKind) {
        var kindOk = (wantKind === '원룸' && /원룸|오피스텔/.test(kind))
          || (wantKind === '투룸' && /투룸|빌라|주택/.test(kind))
          || (wantKind === '오피스텔' && /오피스텔|원룸/.test(kind))
          || (wantKind === '아파트' && /아파트/.test(kind))
          || (wantKind === '상가사무실' && /상가|사무실/.test(kind));
        if (!kindOk) continue;
      }
      if (wantType) {
        var rentish = /월세|연세|단기/;
        var typeOk = (type === wantType) || (rentish.test(wantType) && rentish.test(type));
        if (!typeOk) continue;                       // 매매↔임대차, 전세↔월세 교차 제시 금지
      }
      var s = 0;
      if (apt && apt.length >= 2 && text.indexOf(apt) >= 0) s += 3;
      if (dong && text.indexOf(dong) >= 0) s += 2;
      if (wantKind) s += 2;
      if (wantType && type === wantType) s += 1;
      else if (wantType) s += 0.5;
      if (s < 2) continue;
      var priceStr = String(r[ci.price] || '').trim();
      if (r[ci.rent] && String(r[ci.rent]).trim() && priceStr.indexOf('/') < 0) priceStr += '/' + String(r[ci.rent]).trim();
      var areaN = parseFloat(String(r[ci.area] || ''));
      var line = '· ' + (dong ? dong + ' ' : '') + kind + ' ' + type + ' ' + priceStr
               + (areaN ? ', ' + areaN + '㎡' : '') + (String(r[ci.floor] || '').trim() ? ' ' + String(r[ci.floor]).trim() : '')
               + (String(r[ci.id] || '').trim() ? ' (' + String(r[ci.id]).trim() + ')' : '');
      scored.push({ s: s, line: line });
    }
    if (!scored.length) return '';
    scored.sort(function (a, b) { return b.s - a.s; });
    var lines = scored.slice(0, 2).map(function (x) { return x.line; });
    return '\n\n지금 안내 가능한 매물:\n' + lines.join('\n');
  } catch (e) { return ''; }
}

// 문자 요금 단위 추정(EUC-KR): 한글 2바이트·ASCII 1바이트. 90바이트 이하 = 단문 SMS(18원).
function smsBytes_(s) {
  s = String(s || '');
  var b = 0;
  for (var i = 0; i < s.length; i++) b += (s.charCodeAt(i) > 127) ? 2 : 1;
  return b;
}
function smsFit_() {                              // 후보들 중 90B에 들어가는 첫 문안(잘림 자체 회피, 08-24)
  for (var i = 0; i < arguments.length; i++) if (smsBytes_(arguments[i]) <= 90) return arguments[i];
  return smsTrim90_(arguments[arguments.length - 1]);
}
function smsTrim90_(s) {                          // 90바이트 상한(단문 보장) — 08-24: 단어 중간 뚝 자르지 않는다
  s = String(s || '');
  if (smsBytes_(s) <= 90) return s;
  while (s.length && smsBytes_(s) > 88) s = s.slice(0, -1);   // 말줄임표(2B) 자리 확보
  var cut = Math.max(s.lastIndexOf(' '), s.lastIndexOf('\n'));
  if (cut > s.length * 0.6) s = s.slice(0, cut);              // 단어 중간이면 마지막 공백까지 후퇴
  return s.replace(/[\s.,·—-]+$/, '') + '…';
}
// 🔴 2026-08-23 사장님 지시: 모든 자동 문자는 단문(90바이트, 18원)으로 — LMS(45원) 금지.
//   매물 첨부는 SMS에선 생략하고, 알림톡이 켜지면 그쪽 변수(#{매물안내})로 부활한다(13원·1,000자).
//   예전 장문 문구로 되돌리려면 스크립트 속성 AUTO_REPLY_SHORT=off.
// ✒️ 2026-08-24 보완("디테일 빠졌다"): 요금이 안 드는 경로에서는 상세 문구를 쓴다 —
//   폰 유심(0원)·알림톡(13원·1,000자) = autoReplyRich_(동네·예산·입주시기 요청 + 매물 첨부),
//   솔라피 SMS 폴백(18원)일 때만 위의 간결 단문. 간결함과 디테일을 경로별로 둘 다 확보.
function autoReplyRich_(kind, inquiry) {
  var night = (function () {
    var h = parseInt(Utilities.formatDate(new Date(), 'Asia/Seoul', 'H'), 10);
    return h >= 21 || h < 8;
  })();
  var when = night ? '내일 오전에 연락드리겠습니다.' : '확인 후 바로 연락드리겠습니다.';
  var msg;
  if (kind === 'call') {
    msg = '브리즈부동산중개입니다. 전화 주셔서 감사합니다. ' + when
      + ' 찾으시는 동네·예산·입주 시기를 문자로 남겨주시면 맞는 매물을 먼저 안내드리겠습니다. 010-2601-0110';
  } else if (kind === 'callEnd') {
    msg = '브리즈부동산중개입니다. 상담 전화 감사합니다. 찾으시는 동네·예산·입주 시기를 이 번호로 남겨주시면 '
      + '맞는 매물부터 정리해 안내드리겠습니다. 010-2601-0110';
  } else {
    msg = '브리즈부동산중개입니다. 문의 주셔서 감사합니다. ' + when
      + ' 찾으시는 동네·예산·입주 시기를 남겨주시면 맞는 매물을 먼저 안내드리겠습니다.'
      + smartReplySuggest_(inquiry);
  }
  return msg.length > 350 ? msg.slice(0, 350) : msg;
}
function autoReplyShort_() {
  return String(PropertiesService.getScriptProperties().getProperty('AUTO_REPLY_SHORT') || 'on').toLowerCase() !== 'off';
}
function autoReplyText_(kind, inquiry) {
  var p = PropertiesService.getScriptProperties();
  var night = (function () {
    var h = parseInt(Utilities.formatDate(new Date(), 'Asia/Seoul', 'H'), 10);
    return h >= 21 || h < 8;
  })();
  if (autoReplyShort_()) {                        // 단문 모드(기본): 전부 90바이트 이하로 설계된 문구
    // 08-24 업계 표준 반영(웹 실측 조사): 인사→상호→용건(부재중은 사과 공식)→재연락 약속
    var whenS = night ? '내일 오전에 연락드리겠습니다.' : '확인 후 바로 연락드리겠습니다.';
    var msgS;
    if (kind === 'call') {
      msgS = p.getProperty('AUTO_REPLY_CALL_TEXT')
        || ('안녕하세요, 브리즈부동산중개입니다. 전화를 받지 못해 죄송합니다. ' + whenS);
    } else if (kind === 'callEnd') {
      msgS = p.getProperty('AUTO_REPLY_CALLEND_TEXT')
        || ('브리즈부동산중개입니다. 상담 감사합니다. 원하시는 조건을 남겨주시면 매물을 안내드리겠습니다.');
    } else {
      msgS = p.getProperty('AUTO_REPLY_SMS_TEXT')
        || ('안녕하세요, 브리즈부동산중개입니다. 문의 주셔서 감사합니다. ' + whenS);
    }
    return smsTrim90_(msgS);
  }
  // (구) 장문 모드 — AUTO_REPLY_SHORT=off일 때만
  var when = night ? '내일 오전 9시 이후 바로 연락드리겠습니다.' : '확인 후 곧 연락드리겠습니다.';
  if (kind === 'call') {
    return p.getProperty('AUTO_REPLY_CALL_TEXT')
      || ('[브리즈부동산중개] 전화 주셔서 감사합니다. 지금 현장 안내 중이라 ' + when
          + ' 찾으시는 동네·예산·입주시기를 문자로 남겨주시면 맞는 매물을 먼저 보내드립니다. 담당 010-2601-0110');
  }
  if (kind === 'callEnd') {
    return p.getProperty('AUTO_REPLY_CALLEND_TEXT')
      || ('[브리즈부동산중개] 상담 전화 감사합니다. 찾으시는 동네·예산·입주시기를 이 번호로 남겨주시면 '
          + '맞는 매물부터 정리해 보내드리겠습니다. 바른 기준, 가치 있는 동행 · 담당 010-2601-0110');
  }
  var base = p.getProperty('AUTO_REPLY_SMS_TEXT')
    || ('[브리즈부동산중개] 문의 감사합니다. ' + when
        + ' 원하시는 동네·예산·입주시기를 함께 남겨주시면 맞는 매물을 먼저 보내드립니다. 담당 010-2601-0110');
  var sug = smartReplySuggest_(inquiry);
  var msg = base + sug;
  return msg.length > 350 ? msg.slice(0, 350) : msg;
}
/* 🔴 모의판정(DRY-RUN) — 실제로 보내지 않고 '보낼까/왜 안 보낼까' 만 돌려준다.
   자동응답로그에도 남기지 않는다. 안전장치를 문자 한 통 없이 검증하기 위한 창구. */
function autoReplyDry_(p) {
  p = p || {};
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var log = autoReplyLogSheet_(ss);
  var kind = String(p.kind || 'sms');
  var phone = String(p.phone || '');
  var name = String(p.name || '');
  var text = String(p.text || '');
  var why = autoReplyGate_(kind, phone, name, text, ss, log);
  var key = smsPhoneKey_(phone);
  var hit = smsPhoneIndex_()[key] || null;
  return { would: why ? 'SKIP' : 'SEND', why: why || '보냅니다(모의)',
           kind: kind, phoneMask: smsFmtPhone_(phone).slice(0, 3) + '****' + key.slice(-4),
           who: hit ? (hit.owner ? '임대인·매물 연락처' : (hit.type || '')) : '모르는 번호',
           dailyMax: autoReplyDailyMax_(), sentToday: autoReplySentToday_(log),
           mode: autoReplyMode_() };
}
function autoReplyLogSheet_(ss) {
  var sh = ss.getSheetByName(AUTO_REPLY_LOG);
  if (!sh) {
    sh = ss.insertSheet(AUTO_REPLY_LOG);
    sh.getRange(1, 1, 1, AUTO_REPLY_LOG_HEADER.length).setValues([AUTO_REPLY_LOG_HEADER]);
    styleHeader(sh, AUTO_REPLY_LOG_HEADER.length);
    sh.setColumnWidth(5, 380); sh.setColumnWidth(6, 380);
  }
  return sh;
}
// 최근 N일 안에 같은 번호로 보낸 적이 있는가
function autoReplyRecent_(sh, key) {
  var last = sh.getLastRow();
  if (last < 2) return false;
  var n = Math.min(400, last - 1);
  var v = sh.getRange(last - n + 1, 1, n, 4).getValues();
  var cutoff = new Date().getTime() - AUTO_REPLY_COOLDOWN_DAYS * 86400000;
  for (var i = v.length - 1; i >= 0; i--) {
    if (smsPhoneKey_(v[i][1]) !== key) continue;
    if (String(v[i][3] || '').indexOf('발송') !== 0) continue;      // 실패·건너뜀은 쿨다운에 안 침
    var ts = (v[i][0] instanceof Date) ? v[i][0] : new Date(String(v[i][0]).replace(' ', 'T'));
    if (!isNaN(ts.getTime()) && ts.getTime() > cutoff) return true;
  }
  return false;
}
// kind: 'sms' | 'call'. 반환값은 기록용 — 절대 throw 하지 않는다.
/* 🔴 보낼지 말지만 정한다(실제 발송 없음) — 그래야 DRY-RUN 으로 검증할 수 있다.
   빈 문자열이면 '보낸다', 아니면 건너뛴 이유. 안전장치 11개가 전부 여기 있다. */
function autoReplyGate_(kind, phone, name, text, ss, log) {
  var key = smsPhoneKey_(phone);
  var _cu = (typeof CUR_USER_ !== 'undefined') ? CUR_USER_ : null;
  if (_cu && _cu.role !== 'admin') return '건너뜀: 대표 토큰이 아님(발송 차단)';
  if (!autoReplyOn_()) return '건너뜀: AUTO_REPLY=off';
  if (!(key.length === 11 && key.slice(0, 3) === '010')) return '건너뜀: 휴대폰 번호 아님';
  if (String(name || '').trim() && !/^\d[\d\-\s]*$/.test(String(name).trim()))
    return '건너뜀: 연락처 저장된 번호';
  if (smsExcluded_(ss)[key]) return '건너뜀: 제외번호';
  if (kind === 'sms' && !AUTO_REPLY_INQUIRY_RE.test(String(text || '')))
    return '건너뜀: 문의 키워드 없음';
  var hit = smsPhoneIndex_()[key];
  if (hit && hit.owner) return '건너뜀: 임대인·매물 연락처';
  /* 🔴 B 연락금지·수신거부 — 고객관리·임대인관리에 그렇게 적힌 사람에게는 보내지 않는다 */
  if (hit && AUTO_REPLY_BAN_RE.test(String(hit.flags || '')))
    return '건너뜀: 연락금지·수신거부로 적힌 분';
  /* 🔴 C 종료·계약완료 고객 — 상담이 끝난 분에게 자동응답을 보내지 않는다 */
  if (hit && hit.type === 'customers' && AUTO_REPLY_END_RE.test(String(hit.flags || '')))
    return '건너뜀: 종료·계약완료 고객';
  if (autoReplyRecent_(log, key)) return '건너뜀: ' + AUTO_REPLY_COOLDOWN_DAYS + '일 내 발송됨';
  /* 🔴 A 하루 총량 — 서로 다른 번호가 몰려도 하루 상한을 넘기지 않는다 */
  var max = autoReplyDailyMax_();
  var todayN = autoReplySentToday_(log);
  if (todayN >= max) return '건너뜀: 오늘 자동응답 상한 도달(' + todayN + '/' + max + ')';
  return '';
}
function autoReply_(kind, phone, name, text) {
  var ss, log, key = smsPhoneKey_(phone), reason = '';
  try {
    ss = SpreadsheetApp.openById(SHEET_ID);
    log = autoReplyLogSheet_(ss);
    reason = autoReplyGate_(kind, phone, name, text, ss, log);
    var now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
    if (reason) {
      log.appendRow([now, smsFmtPhone_(phone), kind, reason, '', String(text || '').slice(0, 200)]);
      return { sent: false, reason: reason };
    }
    var msg = autoReplyText_(kind, text);
    if (autoReplyMode_() === 'dry') {                      // 모의발송 — 문구·판정만 기록, 실제 발송 없음
      log.appendRow([now, smsFmtPhone_(phone), kind, '모의발송(dry)', msg, String(text || '').slice(0, 200)]);
      return { sent: false, reason: '모의발송(dry)' };
    }
    // 💛 알림톡 우선(속성 설정 시)·문자 폴백. 알림톡 템플릿 변수: #{매물안내}
    var sug = (kind === 'sms') ? String(smartReplySuggest_(text) || '').replace(/^\s+/, '') : '';
    var sr = sendSmart_(key, msg, kind, { '#{매물안내}': sug || '문의 내용을 확인해 곧 안내드리겠습니다' },
                        autoReplyRich_(kind, text));   // 08-24: 폰 유심(0원) 경로에는 상세 문구

    var r = sr.r;
    var result = (r.sent === 1) ? ('발송(' + sr.via + ')') : ('실패: ' + (r.failed && r.failed[0] || '원인 불명'));
    log.appendRow([now, smsFmtPhone_(phone), kind, result, msg, String(text || '').slice(0, 200)]);
    return { sent: r.sent === 1, reason: result };
  } catch (e) {
    try { if (log) log.appendRow([Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss'),
      smsFmtPhone_(phone), kind, '실패: ' + (e && e.message || e), '', '']); } catch (e2) {}
    return { sent: false, reason: '오류: ' + (e && e.message || e) };
  }
}
// 📞 부재중 전화 접수 — MacroDroid "부재중 전화" 트리거가 호출 (phone={call_number}, name={call_name})
//   인입함에 '부재중전화' 한 줄을 남기고(CRM 문의 인입함에 바로 보임) 자동응답 문자를 보낸다.
function missedCallInbound_(p) {
  p = p || {};
  var phone = String(p.phone || p.sender || p.number || '').trim();
  var name  = String(p.name || '').trim();
  if (!phone) return { skipped: '번호 없음' };
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
  var key = smsPhoneKey_(phone);
  var hit = smsPhoneIndex_()[key];
  var status = (hit && hit.owner) ? '임대인' : '미확인';
  var inbox = ss.getSheetByName('인입함');
  if (inbox) inbox.appendRow(smsInboxRow_(status, '부재중전화', phone, name || (hit ? hit.name : ''),
    '📞 부재중 전화 — 회신 필요', hit ? hit.bld : '', now));
  var ar = autoReply_('call', phone, name, '');
  logChange('sms', 'missedCall', smsFmtPhone_(phone) + ' → ' + (ar.sent ? '자동응답 발송' : ar.reason));
  return { received: true, at: now, phone: smsFmtPhone_(phone), autoReply: ar };
}

// 📝 블로그 발행 기록 (2026-08-23) — 매물의 adsFlat에 blog~번호~발행일~URL 세그먼트를 심는다.
//   blogreq~(발행요청 표시)는 함께 제거. CRM 화면에서는 블로그 칸이 '광고중'+열기 링크로 바뀐다.
//   호출: ?action=blogMark&id=매물번호&url=글주소[&no=글번호][&at=날짜]&token=…
function blogMark_(p) {
  var id = String((p && p.id) || '').trim();
  if (!id) return { marked: null, error: 'id가 없습니다' };
  var sh = getOrCreateSheet('listings');
  var v = sh.getDataRange().getValues();
  var h = v[0].map(String);
  var iId = h.indexOf('id'), iFlat = h.indexOf('adsFlat'), iList = h.indexOf('adList');
  if (iId < 0 || iFlat < 0) return { marked: null, error: 'adsFlat 칼럼 없음' };
  var at = String((p && p.at) || '').trim() || Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][iId]).trim() !== id) continue;
    var segs = String(v[i][iFlat] || '').split('|').filter(Boolean).filter(function (s) {
      return s.indexOf('blog~') !== 0 && s.indexOf('blogreq~') !== 0;
    });
    segs.push(['blog', String((p && p.no) || ''), at, String((p && p.url) || '')].join('~'));
    sh.getRange(i + 1, iFlat + 1).setValue(segs.join('|'));
    if (iList >= 0) {
      var al = String(v[i][iList] || '').split(',').filter(Boolean);
      if (al.indexOf('블로그') < 0) al.push('블로그');
      sh.getRange(i + 1, iList + 1).setValue(al.join(','));
    }
    logChange('listings', 'blogMark', id + ' (' + at + ')');
    return { marked: id, at: at };
  }
  return { marked: null, error: '매물을 찾을 수 없습니다: ' + id };
}

// 📞 통화 종료 피드백 (2026-08-23) — MacroDroid "통화 종료(발신·수신)" 트리거가 호출.
//   인입함 기록은 하지 않는다(통화녹음 STT 파이프라인이 이미 통화를 기록 — 중복 방지).
//   autoReply_의 안전장치 전부 적용: 저장 연락처·임대인·제외번호 건너뜀 + 7일 1회 쿨다운.
function callEndInbound_(p) {
  p = p || {};
  var phone = String(p.phone || p.number || p.sender || '').trim();
  if (!phone) return { skipped: '번호 없음' };
  var ar = autoReply_('callEnd', phone, String(p.name || ''), '');
  logChange('sms', 'callEnd', smsFmtPhone_(phone) + ' → ' + (ar.sent ? '피드백 발송' : ar.reason));
  return { received: true, phone: smsFmtPhone_(phone), autoReply: ar };
}

// 🩺 수집 헬스체크 — 매일 아침 한 번, 최근 48시간 동안 문자·통화가 한 건도 안 들어왔으면 메일로 알린다.
//   (2주 동안 통화 15건이 조용히 유실된 8월 사고의 재발 방지)
var HEALTH_WINDOW_HOURS = 48;
function healthCheckDaily() {
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var since = new Date().getTime() - HEALTH_WINDOW_HOURS * 3600000;
    function countRecent(sheetName, dateCol, kindCol, kindRe) {
      var sh = ss.getSheetByName(sheetName);
      if (!sh) return -1;
      var last = sh.getLastRow();
      if (last < 2) return 0;
      var n = Math.min(600, last - 1);
      var v = sh.getRange(last - n + 1, 1, n, Math.max(dateCol, kindCol) + 1).getValues();
      var c = 0;
      for (var i = 0; i < v.length; i++) {
        var d = v[i][dateCol];
        var ts = (d instanceof Date) ? d : new Date(String(d || '').replace(' ', 'T'));
        if (isNaN(ts.getTime()) || ts.getTime() < since) continue;
        if (kindRe && !kindRe.test(String(v[i][kindCol] || ''))) continue;
        c++;
      }
      return c;
    }
    var sms   = countRecent('인입함', 3, 4, /문자/);
    var calls = countRecent('인입함', 3, 4, /통화|부재중/);
    var queue = countRecent(SMS_QUEUE, 0, 4, null);
    var bal = '', balNum = 0;
    try { var b = smsBalance(); balNum = Number(b.balance || 0); bal = '잔액 ' + balNum + '원 / 포인트 ' + (b.point || 0); } catch (e1) { bal = '조회 실패'; }
    var problems = [];
    if (sms <= 0 && queue <= 0) problems.push('📵 문자: ' + HEALTH_WINDOW_HOURS + '시간 동안 0건 — 폰 MacroDroid(문자접수) / SMS Backup 예약백업 확인');
    if (calls <= 0) problems.push('📵 통화녹음: ' + HEALTH_WINDOW_HOURS + '시간 동안 0건 — 메인컴 server.py / Autosync 확인');
    if (balNum < 2000) problems.push('💸 솔라피 ' + bal + ' — 자동응답·만기문자가 못 나갑니다. 충전 필요');
    var summary = '최근 ' + HEALTH_WINDOW_HOURS + '시간: 문자 ' + sms + '건(수신함 ' + queue + '), 통화 ' + calls + '건 / 솔라피 ' + bal;
    logChange('sms', 'healthCheck', summary + (problems.length ? ' / 문제 ' + problems.length : ' / 정상'));
    if (!problems.length) return summary;
    var to = PropertiesService.getScriptProperties().getProperty('EXPIRY_ALERT_EMAIL') || 'eya170823@gmail.com';  // 웹앱 호출 문맥엔 Session 권한이 없어 고정 주소
    try {
    MailApp.sendEmail(to, '🩺[브리즈CRM 헬스체크] 수집 이상 ' + problems.length + '건',
      '대표님, CRM 수집 상태 점검 결과입니다.\n\n' + summary + '\n\n' + problems.join('\n') + '\n\n'
      + '폰 설정 지시서: 02_고객관리crm\\03_지시어_문서\\_폰설정_MacroDroid_구글서버_2026-08-11.md\n'
      + '(이 메일은 매일 아침 자동 발송되며, 문제가 없으면 오지 않습니다)');
    return summary + ' / 메일 발송';
  } catch (eMail) {
    // 메일 권한이 없는 실행 문맥(웹앱 호출 등)에서는 대표 폰으로 문자 요약을 보낸다
    try {
      var ownerPhone = PropertiesService.getScriptProperties().getProperty('OWNER_PHONE') || '01026010110';
      var r = smsSendMany([{ to: ownerPhone, text: smsTrim90_('[CRM] ' + problems.join('/')) }]);  // 08-23 단문화: 상세는 메일로 이미 감
      return summary + ' / 메일 불가 → 문자 ' + (r.sent ? '발송' : '실패');
    } catch (eSms) { return summary + ' / 알림 실패: ' + (eSms && eSms.message || eSms); }
    }
  } catch (e) {
    try { logChange('sms', 'healthCheck', '실패: ' + (e && e.message || e)); } catch (e2) {}
    return '실패: ' + (e && e.message || e);
  }
}
/* ───────── 💾 시트 하루 한 번 자동 백업 (2026-08-28) ─────────────────
   왜 필요한가
     구글시트는 되돌리기가 있지만 한계가 있다 — 며칠 지난 상태로는 못 돌아가고,
     시트 탭이 통째로 지워지거나 헤더가 깨지면(08-28 A1 이 'id'→'1' 로 바뀐 일이 있었다)
     어디서부터 틀어졌는지 찾을 수가 없다. 이 CRM 은 여러 기기·여러 세션이 동시에
     같은 시트를 고치므로 날짜별 사본이 있어야 대조가 된다.

   무엇을 하는가
     매일 새벽 3시경, 시트 전체를 드라이브 '05_자동백업' 폴더에 통째로 복사한다.
     파일명 `브리즈CRM_백업_YYYY-MM-DD`. 되살릴 때는 그 파일을 열어 필요한 탭만 복사한다.

   🔴 오래된 백업 정리
     기본 30일치만 남기고 넘치는 것은 **휴지통으로** 보낸다(영구삭제 아님 — 30일간 복구 가능).
     지우는 대상은 **우리가 만든 폴더 안의, 우리 파일명 규칙에 맞는 것만**이다.
     사장님이 그 폴더에 다른 파일을 넣어도 건드리지 않는다.
     보관 일수를 바꾸려면 스크립트 속성 BACKUP_KEEP_DAYS 에 숫자를 넣는다.

   되돌리기
     트리거만 지우면 멈춘다 — `uninstallBackupTrigger` 또는 편집기의 시계 아이콘.
     이미 만들어진 백업 파일은 그대로 남는다.
--------------------------------------------------------------------------- */
var BACKUP_FOLDER = '05_자동백업';
var BACKUP_PREFIX = '브리즈CRM_백업_';
var BACKUP_KEEP_DEFAULT = 30;

function backupKeepDays_() {
  var v = parseInt(PropertiesService.getScriptProperties().getProperty('BACKUP_KEEP_DAYS'), 10);
  return (!isNaN(v) && v >= 1) ? v : BACKUP_KEEP_DEFAULT;
}

/** 하루 한 번 실행 — 시트 전체 사본을 만들고 오래된 것을 정리한다 */
function backupSheetDaily() {
  var today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
  var name = BACKUP_PREFIX + today;
  var folder = driveFolder_(BACKUP_FOLDER);

  // 같은 날 두 번 돌아도 사본을 두 개 만들지 않는다(수동 실행 + 트리거가 겹칠 수 있다)
  var dup = folder.getFilesByName(name);
  if (dup.hasNext()) {
    var keptId = dup.next().getId();
    return { skipped: true, reason: '오늘 백업이 이미 있습니다', name: name, fileId: keptId,
             kept: backupCount_(folder), at: today };
  }

  var copy = DriveApp.getFileById(SHEET_ID).makeCopy(name, folder);
  var pruned = backupPrune_(folder);
  try { logChange('backup', 'daily', name + ' 생성' + (pruned.trashed ? ' / 오래된 ' + pruned.trashed + '개 휴지통' : '')); } catch (e) {}
  return { ok: true, name: name, fileId: copy.getId(), url: copy.getUrl(),
           trashed: pruned.trashed, kept: pruned.kept, keepDays: backupKeepDays_(), at: today };
}

/** 우리가 만든 백업만 세어 오래된 것부터 휴지통으로 */
function backupPrune_(folder) {
  var keep = backupKeepDays_();
  var rows = [], it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next(), n = f.getName();
    // 🔴 우리 파일명 규칙에 맞는 것만 만진다 — 사장님이 넣어둔 다른 파일은 절대 건드리지 않는다
    if (n.indexOf(BACKUP_PREFIX) !== 0) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(n.slice(BACKUP_PREFIX.length))) continue;
    rows.push({ name: n, file: f });
  }
  rows.sort(function (a, b) { return a.name < b.name ? 1 : (a.name > b.name ? -1 : 0); });  // 최신 먼저
  var trashed = 0;
  for (var i = keep; i < rows.length; i++) { rows[i].file.setTrashed(true); trashed++; }   // 휴지통(복구 가능)
  return { trashed: trashed, kept: Math.min(rows.length, keep) };
}

function backupCount_(folder) {
  var n = 0, it = folder.getFiles();
  while (it.hasNext()) { if (it.next().getName().indexOf(BACKUP_PREFIX) === 0) n++; }
  return n;
}

/** 화면에서 "마지막 백업 언제였나" 를 묻는 용도 — 만들지 않고 보기만 한다 */
function backupStatus() {
  var folder = driveFolder_(BACKUP_FOLDER);
  var names = [], it = folder.getFiles();
  while (it.hasNext()) {
    var n = it.next().getName();
    if (n.indexOf(BACKUP_PREFIX) === 0) names.push(n.slice(BACKUP_PREFIX.length));
  }
  names.sort().reverse();
  var today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
  var trig = false, all = ScriptApp.getProjectTriggers();
  for (var i = 0; i < all.length; i++) if (all[i].getHandlerFunction() === 'backupSheetDaily') trig = true;
  return { count: names.length, last: names[0] || '', oldest: names[names.length - 1] || '',
           todayDone: names.indexOf(today) >= 0, triggerInstalled: trig,
           keepDays: backupKeepDays_(), folder: BACKUP_FOLDER, at: today };
}

/**
 * 시트 탭 현황 — 어떤 탭이 실제로 쓰이고 있는지 보기 위한 조회 (2026-08-28)
 * 만지지 않는다. 탭 이름·실제 데이터 행 수·칸 수·코드가 쓰는 탭인지만 돌려준다.
 * '실제 행'은 getLastRow 가 아니라 **내용이 있는 마지막 행**이다 — 빈 행이 1000개씩
 * 딸려 있어 getLastRow 만 보면 안 쓰는 탭도 커 보인다.
 */
function sheetsInfo() {
  var known = {};
  for (var k in SHEETS) known[SHEETS[k]] = k;
  [TOMBSTONE_SHEET, VACSMS_SHEET, PHONE_SMS_SHEET, SCHED_SHEET,
   '문자수신함', '자동응답로그'].forEach(function (n) { if (n) known[n] = '(보조)'; });

  var out = [];
  var all = SpreadsheetApp.openById(SHEET_ID).getSheets();
  for (var i = 0; i < all.length; i++) {
    var sh = all[i], name = sh.getName();
    var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
    var head = '';
    if (lastRow >= 1 && lastCol >= 1) {
      head = sh.getRange(1, 1, 1, Math.min(lastCol, 8)).getValues()[0]
              .map(function (v) { return String(v || '').trim(); }).filter(String).join(',');
    }
    var peek = '';
    if (lastRow > 1 && lastRow <= 6 && lastCol >= 1) {         // 작은 탭은 내용을 보여준다(정체 판단용)
      peek = sh.getRange(2, 1, Math.min(lastRow - 1, 3), Math.min(lastCol, 6)).getValues()
               .map(function (r) { return r.map(function (v) { return String(v || '').trim(); }).filter(String).join('|'); })
               .filter(String).join(' ／ ').slice(0, 120);
    }
    out.push({ name: name, rows: Math.max(lastRow - 1, 0), cols: lastCol,
               maxRows: sh.getMaxRows(), usedBy: known[name] || '', head: head.slice(0, 70), peek: peek });
  }
  return { total: out.length, sheets: out, at: vacSmsStamp_() };
}

/**
 * 안 쓰는 빈 탭 정리 (2026-08-28) — 사장님 요청.
 *
 * 🔴 시트 탭 삭제는 되돌릴 수 없다. 그래서 방어벽을 세 겹으로 뒀다.
 *   1) **완전히 빈 탭만** 지운다 — 데이터 행이 하나라도 있으면 이름이 목록에 있어도 건너뛴다.
 *   2) **코드가 쓰는 탭은 절대 안 지운다** — SHEETS 와 보조 탭 이름은 이름만 나와도 거부.
 *      (계약완료·고객리드·공실확인발송은 지금 0행이지만 쓰는 탭이다. 지우면 저장이 깨진다)
 *   3) **지울 이름을 호출자가 직접 넘겨야 한다** — 자동으로 훑어 지우지 않는다.
 *   그리고 dry=1 이면 무엇이 지워질지만 돌려주고 손대지 않는다.
 *
 * 되돌리기: 당일 자동백업(드라이브 '05_자동백업' → 브리즈CRM_백업_YYYY-MM-DD)에서
 *   해당 탭을 복사해 오면 된다. 지우기 전에 백업이 있는지 먼저 확인한다.
 */
function sheetsPrune(names, dry, withData) {
  var want = String(names || '').split(',').map(function (x) { return x.trim(); }).filter(String);
  if (!want.length) return { error: '지울 탭 이름을 넘기세요(쉼표로 구분)' };

  var protectedNames = {};
  for (var k in SHEETS) protectedNames[SHEETS[k]] = true;
  [TOMBSTONE_SHEET, VACSMS_SHEET, PHONE_SMS_SHEET, SCHED_SHEET,
   '문자수신함', '자동응답로그', '인입함', '공실현황', '제외번호'].forEach(function (n) {
    if (n) protectedNames[n] = true;
  });

  var ss = SpreadsheetApp.openById(SHEET_ID);
  var out = { deleted: [], skipped: [], dry: !!dry, at: vacSmsStamp_() };
  for (var i = 0; i < want.length; i++) {
    var name = want[i];
    var sh = ss.getSheetByName(name);
    if (!sh) { out.skipped.push(name + ' — 그런 탭이 없습니다'); continue; }
    if (protectedNames[name]) { out.skipped.push(name + ' — 코드가 쓰는 탭입니다(거부)'); continue; }
    if (sh.getLastRow() > 0 || sh.getLastColumn() > 0) {
      // withData=1 은 "내용이 있어도 지운다" 는 **사람의 명시적 확인**이다.
      //   2026-08-28: 구글시트 기본 예제 탭 '시트2'(3행, 펜던트 후기 샘플)를 지우려고 열었다.
      //   🔴 방어벽 ②(코드가 쓰는 탭 거부)는 이 경우에도 그대로 걸린다 — 뚫리는 건 ①뿐이다.
      //   그리고 지우기 전에 무엇이 들어 있었는지 로그에 남긴다(되돌릴 근거).
      if (!withData) {
        out.skipped.push(name + ' — 내용이 있습니다(' + sh.getLastRow() + '행 ' + sh.getLastColumn() + '칸, 거부)');
        continue;
      }
      var snap = '';
      try {
        snap = sh.getRange(1, 1, Math.min(sh.getLastRow(), 3), Math.min(sh.getLastColumn(), 6))
                 .getValues().map(function (r) { return r.join('|'); }).join(' ／ ').slice(0, 200);
      } catch (e) {}
      out.withData = out.withData || [];
      out.withData.push(name + ' (' + sh.getLastRow() + '행) ' + snap);
    }
    if (ss.getSheets().length - out.deleted.length <= 1) { out.skipped.push(name + ' — 마지막 탭은 못 지웁니다'); continue; }
    if (!dry) ss.deleteSheet(sh);
    out.deleted.push(name);
  }
  if (!dry && out.deleted.length) {
    logChange('sheet', 'prune', '탭 삭제: ' + out.deleted.join(', ')
      + ((out.withData || []).length ? ' / 내용 있던 것: ' + out.withData.join(' ; ') : ''));
  }
  return out;
}

function installBackupTrigger() {
  var all = ScriptApp.getProjectTriggers(), removed = 0;
  for (var i = 0; i < all.length; i++) {
    if (all[i].getHandlerFunction() === 'backupSheetDaily') { ScriptApp.deleteTrigger(all[i]); removed++; }
  }
  ScriptApp.newTrigger('backupSheetDaily').timeBased().everyDays(1).atHour(3).create();
  return '기존 ' + removed + '개 제거 후 설치 — 매일 새벽 3시경 시트 전체 백업';
}

function uninstallBackupTrigger() {
  var all = ScriptApp.getProjectTriggers(), removed = 0;
  for (var i = 0; i < all.length; i++) {
    if (all[i].getHandlerFunction() === 'backupSheetDaily') { ScriptApp.deleteTrigger(all[i]); removed++; }
  }
  return removed + '개 제거 — 자동 백업이 멈췄습니다(만들어진 백업 파일은 그대로 남습니다)';
}

function installHealthTrigger() {
  var all = ScriptApp.getProjectTriggers(), removed = 0;
  for (var i = 0; i < all.length; i++) {
    if (all[i].getHandlerFunction() === 'healthCheckDaily') { ScriptApp.deleteTrigger(all[i]); removed++; }
  }
  ScriptApp.newTrigger('healthCheckDaily').timeBased().everyDays(1).atHour(8).create();
  return '기존 ' + removed + '개 제거 후 설치 — 매일 오전 8시경 실행';
}
// 🔎 문자수신함 최근 N행 조회 (검증용)
/* 📡 수집 상태 (2026-08-27 신설)
   폰(MacroDroid) → GAS smsIn → '문자수신함' 시트 → 메인컴 server.py 회수 → 인입함.
   이 사슬 어디가 끊겨도 겉으로는 조용하다. 마지막 수신 시각만 돌려주면 CRM 화면이 판단한다.
   ⚠ 가벼워야 한다 — 화면 열 때마다 부르므로 마지막 행 1개만 읽는다.                        */
// 🔧 2026-09-05 — server.py가 스프레드시트 조회 403으로 기동 직후 죽는 사고 진단·복구.
//   서비스계정 키 로테이션 시 새 계정이 시트 편집자로 재공유되지 않으면 조용히 이 상태가 된다.
function checkSheetAccess_() {
  var f = DriveApp.getFileById(SHEET_ID);
  return { owner: f.getOwner().getEmail(), editors: f.getEditors().map(function (u) { return u.getEmail(); }) };
}
function grantSheetAccess_(email) {
  email = String(email || '').trim();
  if (!email) return { granted: false, reason: '이메일이 없습니다' };
  var f = DriveApp.getFileById(SHEET_ID);
  if (f.getEditors().some(function (u) { return u.getEmail() === email; })) return { granted: false, reason: '이미 편집자입니다' };
  f.addEditor(email);
  logChange('sms', 'grantSheetAccess', email + ' 편집자 추가(문자접수서버 403 복구)');
  return { granted: true, email: email };
}

function collectStatus_() {
  var out = { lastSms: '', lastInbox: '', now: Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss') };
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var q = ss.getSheetByName(SMS_QUEUE);
    if (q && q.getLastRow() >= 2) {
      out.lastSms = fmtCell(q.getRange(q.getLastRow(), 1).getValue());
      // 🔴 메인컴(server.py)이 회수하고 있는지 — 죽으면 인입이 늦어진다(2026-08-30 사고)
      //    마지막 30행만 본다(화면 열 때마다 부르므로 가벼워야 한다)
      var from = Math.max(2, q.getLastRow() - 29);
      var vv = q.getRange(from, 1, q.getLastRow() - from + 1, 7).getValues();
      var pc = smsPcAlive_([[]].concat(vv));
      out.pcAlive = pc.alive;
      out.lastPcProcess = pc.last;
      var pend = 0;
      for (var k = 0; k < vv.length; k++) if (!String(vv[k][5] || '').trim()) pend++;
      out.pendingSms = pend;                                    // 아직 인입함에 안 넘어간 건수
    }
    var ib = ss.getSheetByName('인입함');
    if (ib && ib.getLastRow() >= 2) {
      // 인입함은 4번째 칼럼이 접수시각(inboxList_ 와 같은 규칙)
      out.lastInbox = fmtCell(ib.getRange(ib.getLastRow(), 4).getValue());
      out.inboxRows = ib.getLastRow() - 1;
    }
  } catch (e) { out.error = e.message; }
  return out;
}
function smsQueueList_(limit) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(SMS_QUEUE);
  if (!sh) return { rows: [] };
  var last = sh.getLastRow();
  if (last < 2) return { rows: [] };
  var n = Math.min(Math.max(limit || 20, 1), 200, last - 1);
  var v = sh.getRange(last - n + 1, 1, n, 7).getValues();
  var out = [];
  for (var i = v.length - 1; i >= 0; i--) {
    out.push({ row: last - n + 1 + i, when: fmtCell(v[i][0]), phone: fmtCell(v[i][1]), name: String(v[i][2] || ''),
               text: String(v[i][3] || '').slice(0, 200), kind: String(v[i][4] || ''), done: String(v[i][5] || ''), doneAt: fmtCell(v[i][6]) });
  }
  return { rows: out };
}
function autoReplyLogList_(limit) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(AUTO_REPLY_LOG);
  if (!sh) return { rows: [] };
  var last = sh.getLastRow();
  if (last < 2) return { rows: [] };
  var n = Math.min(Math.max(limit || 20, 1), 200, last - 1);
  var v = sh.getRange(last - n + 1, 1, n, 6).getValues();
  var out = [];
  for (var i = v.length - 1; i >= 0; i--) {
    out.push({ when: fmtCell(v[i][0]), phone: fmtCell(v[i][1]), kind: String(v[i][2] || ''), result: String(v[i][3] || ''),
               text: String(v[i][4] || '').slice(0, 120), src: String(v[i][5] || '').slice(0, 120) });
  }
  return { rows: out };
}


/* ============================================================================
   🎙️ 통화녹음 자동요약 (rec*) — 2026-09-07 신설
   ----------------------------------------------------------------------------
   폰 통화녹음 → 드라이브 폴더 → Gemini 전사·요약 → CRM '상담이력' 탭 → 고객관리 매칭.

   설계 원칙 (기존 백엔드와 싸우지 않기 위해 정한 것들):
   1. 함수 이름은 전부 rec* 접두사. 이 파일에는 함수가 200개가 넘어서 formatPhone 같은
      흔한 이름을 새로 만들면 언젠가 조용히 덮어쓴다.
   2. 전화번호는 **smsPhoneKey_/smsFmtPhone_ 를 그대로 재사용**한다. 문자접수·부재중접수가
      쓰는 것과 같은 키여야 "부재중 → 자동응답 → 콜백 상담"이 한 고객으로 묶인다.
      여기서 번호 정규화를 새로 만들면 같은 사람이 두 명으로 쌓인다.
   3. 시트는 getActiveSpreadsheet 를 쓰지 않고 **SHEET_ID 로 연다**. 시간 트리거는 "지금 열어둔
      탭"이 뭔지 모르기 때문에, active 기준으로 append 하면 매물관리 탭에 상담 행이 박힌다.
   4. 락은 LockService(스크립트 전역)를 쓰지 않는다. 녹음 처리가 몇 분씩 잡고 있으면
      그동안 들어온 문자·부재중 doPost 가 막힌다. 캐시 플래그로만 겹침을 막는다.
   5. 중복 방지는 파일 설명(description)이 아니라 **fileId 대조**다. 설명은 파일을 복사·이동하면
      사라지고, 폴더 소유자가 다르면 아예 쓰지도 못한다.
   6. API 키는 하드코딩하지 않는다(CLAUDE.md 철칙 5) — 전부 스크립트 속성.

   스크립트 속성 (전부 REC_ 접두사 — 기존 AUTO_REPLY·PHONE_SMS_WEBHOOK 등과 섞이지 않게):
     REC_DRIVE_FOLDER_ID  녹음 파일이 쌓이는 드라이브 폴더 ID   (필수)
     REC_GEMINI_KEY       Google AI Studio API 키               (필수)
     REC_GEMINI_MODEL     모델 이름 (기본 gemini-2.5-flash)     (선택)
     REC_BASELINE         이 시각 이후 생성된 파일만 처리       (선택)
     REC_MAX_MB           파일 크기 상한, 기본 45               (선택)
   ========================================================================== */

// ── 상담이력 탭 등록 ─────────────────────────────────────────────────────────
// SHEETS/HEADERS 에 넣어 두면 getOrCreateSheet 가 헤더 생성·칼럼 확장을 알아서 해 주고,
// sheetsPrune 의 "코드가 쓰는 탭" 보호 목록에도 자동으로 들어간다(실수로 못 지운다).
SHEETS.calls = '상담이력';
HEADERS.calls = [
  'id', 'when', 'phone', 'name', 'customerId', 'direction',
  'summary', 'budget', 'region', 'moveIn', 'propType', 'listingIds',
  'nextAction', 'nextActionDate', 'note',
  'matched', 'fileName', 'fileUrl', 'fileId', 'transcript', 'processedAt'
];

// AI 가 채우지 않는 칸(시스템이 채움). 이 목록에 없는 HEADERS.calls 칸은 전부 AI 추출 대상이 된다.
// → 나중에 HEADERS.calls 에 칼럼을 하나 추가하면 AI 가 자동으로 그 칸까지 채우기 시작한다.
var REC_SYS_FIELDS = ['id', 'when', 'customerId', 'listingIds',
                      'matched', 'fileName', 'fileUrl', 'fileId', 'transcript', 'processedAt'];

// AI 에게 건넬 한글 설명. 여기에 없는 칸은 칸 이름을 그대로 설명으로 쓴다.
var REC_LABELS = {
  phone:          '고객 전화번호 (숫자와 하이픈만)',
  name:           '고객 이름',
  direction:      '통화 방향 — 수신 / 발신 중 하나',
  summary:        '상담 내용 요약 (2~3문장, 무엇을 찾는지와 결론이 드러나게)',
  budget:         '예산 — 보증금/월세 형태로 (예: 500/50)',
  region:         '희망 지역 (제주시 동 이름 위주)',
  moveIn:         '입주 희망 시기 (YYYY-MM-DD 또는 "협의")',
  propType:       '희망 매물 종류 (오픈형 원룸 / 분리형 원룸 / 투룸 / 오피스텔 / 아파트 / 상가)',
  nextAction:     '다음에 해야 할 일 (예: 목요일 오후 3시 현장 안내, 계약서 초안 발송)',
  nextActionDate: '그 일을 해야 하는 날짜 (YYYY-MM-DD)',
  note:           '위 칸에 안 들어가는 특이사항 (반려동물, 주차, 대출, 급한 사정 등)'
};

var REC_MODEL_DEFAULT = 'gemini-2.5-flash';
var REC_TRANSCRIPT_CAP = 45000;   // 시트 한 칸 상한이 5만 자다. 넘기면 append 자체가 실패한다.
var REC_BUDGET_MS      = 4.5 * 60 * 1000;  // 개인 지메일 계정은 실행 6분 상한
var REC_DONE_FOLDER    = '처리완료';
var REC_LISTING_RE     = /\b([HRO]\d{6}-\d{2})\b/g;   // 매물번호 체계 H/R/O + YYMMDD + 일련번호

// ── 설정 읽기 ────────────────────────────────────────────────────────────────
function recProp_(key, dflt) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  return (v === null || v === '') ? (dflt === undefined ? '' : dflt) : String(v).trim();
}
function recApiKey_() {
  var k = recProp_('REC_GEMINI_KEY');
  if (!k) throw new Error('REC_GEMINI_KEY 가 없습니다. 메뉴 [⚙️ 녹음요약 기본설정] 에서 먼저 등록하세요.');
  return k;
}
function recFolderId_() {
  var f = recProp_('REC_DRIVE_FOLDER_ID');
  if (!f) throw new Error('REC_DRIVE_FOLDER_ID 가 없습니다. 메뉴 [⚙️ 녹음요약 기본설정] 에서 먼저 등록하세요.');
  return f;
}
function recModel_()  { return recProp_('REC_GEMINI_MODEL', REC_MODEL_DEFAULT); }
function recMaxMB_()  { return Number(recProp_('REC_MAX_MB', '45')) || 45; }
function recSheet_()  { return getOrCreateSheet('calls'); }
function recNow_(fmt) { return Utilities.formatDate(new Date(), 'Asia/Seoul', fmt || 'yyyy-MM-dd HH:mm:ss'); }

// AI 가 채울 칸 목록 — HEADERS.calls 에서 시스템 칸을 뺀 나머지
function recAiFields_() {
  return HEADERS.calls.filter(function (h) { return REC_SYS_FIELDS.indexOf(h) < 0; });
}

// ── 메뉴 ─────────────────────────────────────────────────────────────────────
// 🔴 기존 onOpen 은 건드리지 않는다. onOpen 안에서 이 함수를 호출하는 한 줄만 추가한다.
//    (같은 이름의 onOpen 을 새로 만들면 '🧹 브리즈 정리' 메뉴가 통째로 사라진다)
function recOnOpen_() {
  SpreadsheetApp.getUi()
    .createMenu('🎙️ 통화 요약')
    .addItem('⚙️ 녹음요약 기본설정 (폴더ID / API키)', 'recSetup')
    .addSeparator()
    .addItem('▶️ 지금 새 녹음 처리 (1회)', 'recRunOnce')
    .addItem('🔍 상태 점검', 'recStatus')
    .addItem('🧪 Gemini 연결 테스트', 'recTestApi')
    .addItem('📋 사용 가능한 모델 목록 보기', 'recListModels')
    .addSeparator()
    .addItem('⏰ 15분 주기 자동 실행 시작', 'recInstallTrigger')
    .addItem('⏹️ 자동 실행 중지', 'recRemoveTrigger')
    .addItem('🧹 기준점 재설정 (기존 파일 건너뛰기)', 'recResetBaseline')
    .addToUi();
}

function recSetup() {
  var ui = SpreadsheetApp.getUi(), props = PropertiesService.getScriptProperties();
  var curF = recProp_('REC_DRIVE_FOLDER_ID'), curK = recProp_('REC_GEMINI_KEY');

  var r1 = ui.prompt('1/2. 녹음 폴더 ID',
    '통화녹음이 쌓이는 드라이브 폴더 ID를 넣으세요.\n(현재: ' + (curF || '미설정') + ')\n\n' +
    '폴더를 브라우저로 열었을 때 주소 끝의 긴 문자열입니다.', ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  var f = r1.getResponseText().trim();
  if (f) props.setProperty('REC_DRIVE_FOLDER_ID', f);

  var r2 = ui.prompt('2/2. Gemini API 키',
    'Google AI Studio 에서 받은 키를 넣으세요.\n(현재: ' + (curK ? '등록됨(' + curK.slice(0, 6) + '…)' : '미설정') + ')',
    ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  var k = r2.getResponseText().trim();
  if (k) props.setProperty('REC_GEMINI_KEY', k);

  recSheet_();   // 상담이력 탭을 미리 만들어 둔다
  ui.alert('설정 완료',
    '상담이력 탭을 준비했습니다.\n\n다음 순서로 진행하세요.\n' +
    '1) [🧪 Gemini 연결 테스트]\n2) [▶️ 지금 새 녹음 처리]로 1건 확인\n3) [⏰ 15분 주기 자동 실행 시작]',
    ui.ButtonSet.OK);
}

// ── 파일명 파싱 ──────────────────────────────────────────────────────────────
// 갤럭시 통화녹음 파일명은 대체로 "통화 녹음 홍길동_260907_143012.m4a" 또는
// "010-1234-5678_20260907_143012.m4a" 꼴이다.
// 🔴 날짜를 먼저 떼어내지 않으면 20260907143 같은 11자리가 전화번호로 잡혀서
//    202-6090-7143 이라는 유령 고객이 만들어진다. 그래서 순서가 중요하다.
function recParseName_(name) {
  var meta = { phone: '', when: '', person: '', direction: '' };
  var base = String(name || '').replace(/\.[^.]+$/, '');

  if (/수신|착신|incoming/i.test(base)) meta.direction = '수신';
  else if (/발신|outgoing/i.test(base)) meta.direction = '발신';

  // 1) 전화번호 먼저 — 휴대폰/지역번호 패턴으로만 좁힌다
  var m = base.match(/(01[016789][-\s.]?\d{3,4}[-\s.]?\d{4})/) ||
          base.match(/(0(?:2|[3-6]\d)[-\s.]?\d{3,4}[-\s.]?\d{4})/);
  if (m) { meta.phone = smsFmtPhone_(m[0]); base = base.replace(m[0], ' '); }

  // 2) 날짜+시각 — YYMMDD_HHmm(ss) / YYYYMMDD_HHmm(ss) 둘 다
  var d = base.match(/(?:20)?(\d{2})(\d{2})(\d{2})[_\-.\s]?(\d{2})(\d{2})(\d{2})?/);
  if (d) {
    meta.when = '20' + d[1] + '-' + d[2] + '-' + d[3] + ' ' + d[4] + ':' + d[5];
    base = base.replace(d[0], ' ');
  }

  // 3) 남은 한글 토큰 = 폰 주소록에 저장돼 있던 상대 이름
  var nm = base.match(/[가-힣]{2,5}/g);
  if (nm) {
    for (var i = 0; i < nm.length; i++) {
      if (!/통화|녹음|전화|수신|발신|음성|사장|실장/.test(nm[i])) { meta.person = nm[i]; break; }
    }
  }
  return meta;
}

// ── MIME 처리 ────────────────────────────────────────────────────────────────
// getBlob().getContentType() 은 파일을 통째로 내려받는다. 30MB 녹음 50개면 매 실행마다
// 1.5GB 를 읽는 셈이라 실행시간이 먼저 터진다. getMimeType() 은 다운로드가 없다.
// Gemini 공식 오디오 지원은 wav/mp3/aiff/aac/ogg/flac 인데 갤럭시는 m4a(audio/mp4)로 저장한다.
// 실측상 audio/mp4 로 올리면 통과하므로 x-m4a 계열을 audio/mp4 로 바꿔서 보낸다.
function recMime_(file) {
  var t = String(file.getMimeType() || '').toLowerCase();
  if (t === 'audio/x-m4a' || t === 'audio/m4a') return 'audio/mp4';
  return t;
}
function recIsAudio_(mime) {
  return mime.indexOf('audio/') === 0 || mime === 'video/mp4';   // 일부 기기는 m4a 를 video/mp4 로 준다
}

// ── Gemini 응답 파싱 ─────────────────────────────────────────────────────────
// candidates[0].content.parts[0].text 를 바로 집으면, 안전필터 차단·출력잘림·thinking 파트
// 어느 하나만 걸려도 "undefined 의 text 를 읽을 수 없음"으로 죽고 원인이 안 남는다.
function recExtractText_(body) {
  var d;
  try { d = JSON.parse(body); } catch (e) { throw new Error('응답이 JSON 이 아님: ' + String(body).slice(0, 200)); }
  if (d.promptFeedback && d.promptFeedback.blockReason)
    throw new Error('Gemini 가 응답을 차단함: ' + d.promptFeedback.blockReason);
  var c = (d.candidates || [])[0];
  if (!c) throw new Error('응답에 후보가 없음: ' + String(body).slice(0, 200));
  var parts = (c.content && c.content.parts) || [];
  var t = parts.map(function (p) { return p.text || ''; }).join('');
  if (!t) throw new Error('빈 응답 (finishReason: ' + c.finishReason + ')');
  if (c.finishReason === 'MAX_TOKENS') console.warn('⚠️ 출력이 잘렸습니다 — 통화가 길어 전사본이 불완전할 수 있음');
  return t;
}

function recFetch_(url, opt) {
  opt = opt || {};
  opt.muteHttpExceptions = true;
  opt.headers = opt.headers || {};
  opt.headers['x-goog-api-key'] = recApiKey_();   // 키를 URL 에 안 넣는다(로그·에러본문 노출 방지)
  return UrlFetchApp.fetch(url, opt);
}

// ── 1단계: 오디오 업로드 → 전사 ──────────────────────────────────────────────
function recTranscribe_(file) {
  var mime = recMime_(file);
  var sizeMB = file.getSize() / (1024 * 1024);
  if (sizeMB > recMaxMB_()) throw new Error('파일이 ' + sizeMB.toFixed(1) + 'MB 로 상한(' + recMaxMB_() + 'MB)을 넘습니다');

  var up = recFetch_('https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=media',
    { method: 'post', contentType: mime, payload: file.getBlob().getBytes() });
  if (up.getResponseCode() !== 200) throw new Error('오디오 업로드 실패(' + up.getResponseCode() + '): ' + up.getContentText().slice(0, 300));

  var info = JSON.parse(up.getContentText()).file;
  for (var i = 0; info && info.state === 'PROCESSING' && i < 20; i++) {
    Utilities.sleep(3000);
    var ck = recFetch_('https://generativelanguage.googleapis.com/v1beta/' + info.name);
    if (ck.getResponseCode() === 200) info = JSON.parse(ck.getContentText());
  }
  if (!info || info.state !== 'ACTIVE')
    throw new Error('오디오가 준비되지 않음 (state: ' + (info ? info.state : '없음') + ')');

  try {
    var resp = recFetch_('https://generativelanguage.googleapis.com/v1beta/models/' + recModel_() + ':generateContent', {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify({
        contents: [{ parts: [
          { file_data: { mime_type: mime, file_uri: info.uri } },
          { text: '이 통화 녹음을 화자(중개사/고객)를 구분해서 처음부터 끝까지 빠짐없이 전사해줘. ' +
                  '부동산 상담이므로 지역명·단지명·금액·날짜는 특히 정확하게 옮겨줘.' }
        ] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 8192 }
      })
    });
    if (resp.getResponseCode() !== 200)
      throw new Error('전사 실패(' + resp.getResponseCode() + '): ' + resp.getContentText().slice(0, 300));
    return recExtractText_(resp.getContentText());
  } finally {
    // 업로드본은 48시간 뒤 자동 삭제되지만, 통화 내용이므로 쓰자마자 지운다.
    try { recFetch_('https://generativelanguage.googleapis.com/v1beta/' + info.name, { method: 'delete' }); } catch (e) {}
  }
}

// ── 2단계: 전사본 → 항목별 JSON ──────────────────────────────────────────────
// responseSchema 로 형식을 강제하기 때문에 JSON 수리 코드가 필요 없다.
function recStructure_(transcript) {
  var fields = recAiFields_();
  var props = {}, lines = [];
  fields.forEach(function (f) {
    props[f] = { type: 'STRING' };
    lines.push('- ' + f + ' : ' + (REC_LABELS[f] || f));
  });

  var prompt =
    '아래는 제주시 원룸·투룸 임대를 중개하는 부동산 사무소의 통화 녹음 전사본입니다.\n' +
    '내용을 읽고 항목별로 정보를 뽑아 JSON 으로만 답하세요.\n\n' +
    '[추출 항목]\n' + lines.join('\n') + '\n\n' +
    '[규칙]\n' +
    '1. 통화에 안 나온 항목은 반드시 빈 문자열("")로 두세요. 추측해서 채우지 마세요.\n' +
    '2. 금액은 만원 단위 숫자로. 보증금/월세는 "500/50" 형태로 쓰세요.\n' +
    '3. 날짜는 YYYY-MM-DD 로 쓰세요. "다음 주 화요일" 처럼 상대적 표현이면 오늘(' +
       recNow_('yyyy-MM-dd') + ') 기준으로 계산하세요.\n' +
    '4. summary 는 "무엇을 찾는 고객이고, 통화에서 무엇이 정해졌는지"가 드러나게 2~3문장으로.\n\n' +
    '[전사본]\n' + transcript;

  var resp = recFetch_('https://generativelanguage.googleapis.com/v1beta/models/' + recModel_() + ':generateContent', {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        response_mime_type: 'application/json',
        response_schema: { type: 'OBJECT', properties: props },
        temperature: 0.1, maxOutputTokens: 8192
      }
    })
  });
  if (resp.getResponseCode() !== 200)
    throw new Error('정보추출 실패(' + resp.getResponseCode() + '): ' + resp.getContentText().slice(0, 300));

  var txt = recExtractText_(resp.getContentText());
  try { return JSON.parse(txt); }
  catch (e) { throw new Error('추출 결과가 JSON 이 아님: ' + txt.slice(0, 300)); }
}

// ── 고객관리 탭 매칭 ─────────────────────────────────────────────────────────
// 실행당 한 번만 읽는다(파일마다 다시 읽으면 고객 수천 명일 때 실행시간이 먼저 끝난다).
// 칼럼은 위치가 아니라 **헤더 이름으로** 찾는다 — 이 프로젝트는 칼럼 순서를 바꿔도
// 이름이 같으면 그대로 두는 규칙(getOrCreateSheet 2026-08-30 주석)이라 위치 고정은 위험하다.
function recCustomerIndex_() {
  var sh = getOrCreateSheet('customers');
  var idx = { _sheet: sh, _map: {}, _cName: 0, _cNext: 0 };
  var last = sh.getLastRow(), wide = sh.getLastColumn();
  if (last < 2 || wide < 1) return idx;

  var v = sh.getRange(1, 1, last, wide).getValues();
  var head = v[0].map(function (x) { return String(x || '').trim(); });
  var cId = head.indexOf('id'), cName = head.indexOf('name'),
      cPhone = head.indexOf('phone'), cNext = head.indexOf('nextAction');
  if (cPhone < 0) return idx;
  idx._cName = cName + 1;
  idx._cNext = cNext + 1;

  for (var r = 1; r < v.length; r++) {
    var key = smsPhoneKey_(v[r][cPhone]);
    if (!key || idx._map[key]) continue;
    idx._map[key] = {
      row:  r + 1,
      id:   cId   >= 0 ? String(v[r][cId]   || '') : '',
      name: cName >= 0 ? String(v[r][cName] || '') : '',
      next: cNext >= 0 ? String(v[r][cNext] || '') : ''
    };
  }
  return idx;
}

// 기존 고객 행은 **빈 칸에만** 채운다. 사장님이 손으로 적어 둔 값을 AI 가 덮으면 안 된다.
// 🔴 고객관리에 없는 번호를 자동으로 새 고객으로 만들지는 않는다 — 광고 스팸·잘못 걸린 전화까지
//    고객 명부에 쌓이기 때문. 상담이력의 matched 칸에 '신규(미등록)'으로 표시만 하고,
//    사장님이 보고 판단해서 등록하는 쪽이 안전하다.
function recTouchCustomer_(idx, key, aiName, nextDate) {
  var hit = idx._map[key];
  if (!hit) return { id: '', matched: '신규(미등록)' };
  try {
    if (aiName && !hit.name && idx._cName > 0) idx._sheet.getRange(hit.row, idx._cName).setValue(aiName);
    if (nextDate && !hit.next && idx._cNext > 0) idx._sheet.getRange(hit.row, idx._cNext).setValue(nextDate);
  } catch (e) {
    console.warn('고객관리 갱신 실패(' + key + '): ' + e.message);
  }
  return { id: hit.id, matched: '기존고객' };
}

// ── 처리 완료 표시 ───────────────────────────────────────────────────────────
// 폴더 이동이 1순위(다음 실행 때 스캔 대상에서 아예 빠진다). 권한이 없으면 설명으로 대체.
function recMarkDone_(file, folder) {
  try {
    var it = folder.getFoldersByName(REC_DONE_FOLDER);
    var done = it.hasNext() ? it.next() : folder.createFolder(REC_DONE_FOLDER);
    file.moveTo(done);
    return true;
  } catch (e) {
    try { file.setDescription((file.getDescription() || '') + '\n[REC_DONE] ' + recNow_()); return true; }
    catch (e2) { console.warn('처리표시 실패: ' + file.getName() + ' — ' + e2.message); return false; }
  }
}

// 이미 기록된 파일인지 fileId 로 판별. 설명·파일명은 복사·이동하면 사라지지만 fileId 는 안 변한다.
function recDoneIds_(sheet) {
  var done = {};
  var col = HEADERS.calls.indexOf('fileId') + 1;
  var last = sheet.getLastRow();
  if (col < 1 || last < 2) return done;
  var v = sheet.getRange(2, col, last - 1, 1).getValues();
  for (var i = 0; i < v.length; i++) { var s = String(v[i][0] || ''); if (s) done[s] = true; }
  return done;
}

// ── 메인 처리 ────────────────────────────────────────────────────────────────
function recRun() {
  // 겹침 방지. LockService(스크립트 전역)를 쓰면 그동안 문자·부재중 doPost 가 같이 막힌다.
  var cache = CacheService.getScriptCache();
  if (cache.get('REC_RUNNING')) { console.log('이전 실행이 아직 도는 중 — 이번 회차 건너뜀'); return; }
  cache.put('REC_RUNNING', '1', 360);

  var deadline = Date.now() + REC_BUDGET_MS;
  var stat = { ok: 0, skip: 0, fail: 0, errors: [] };

  try {
    var folder = DriveApp.getFolderById(recFolderId_());
    var sheet  = recSheet_();
    var doneIds = recDoneIds_(sheet);
    var custIdx = recCustomerIndex_();

    var baseStr = recProp_('REC_BASELINE');
    var baseline = baseStr ? new Date(baseStr).getTime() : 0;

    var files = folder.getFiles();
    while (files.hasNext()) {
      if (Date.now() > deadline) { console.log('⏱ 시간 예산 도달 — 나머지는 다음 실행에서 이어서'); break; }

      var file = files.next();
      var fid  = file.getId();
      if (doneIds[fid]) { stat.skip++; continue; }
      if ((file.getDescription() || '').indexOf('[REC_DONE]') >= 0) { stat.skip++; continue; }

      var mime = recMime_(file);
      if (!recIsAudio_(mime)) { stat.skip++; continue; }

      if (baseline > 0 && file.getDateCreated().getTime() < baseline) { recMarkDone_(file, folder); stat.skip++; continue; }

      // 아직 업로드가 끝나지 않은 파일을 집으면 뒷부분이 잘린 채 전사된다.
      if (Date.now() - file.getLastUpdated().getTime() < 2 * 60 * 1000) {
        console.log('⏳ 업로드 직후 파일 — 다음 회차로 미룸: ' + file.getName());
        stat.skip++; continue;
      }

      var fname = file.getName();
      try {
        console.log('▶️ 처리 시작: ' + fname);
        var meta = recParseName_(fname);
        var transcript = recTranscribe_(file);
        var ai = recStructure_(transcript) || {};

        var phoneKey = smsPhoneKey_(ai.phone || meta.phone || '');
        var phoneFmt = phoneKey ? smsFmtPhone_(phoneKey) : '';
        var name     = String(ai.name || '').trim() || meta.person || '';
        var when     = String(ai.when || '').trim() || meta.when ||
                       Utilities.formatDate(file.getDateCreated(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm');

        var link = recTouchCustomer_(custIdx, phoneKey, name, String(ai.nextActionDate || '').trim());

        // 매물번호는 AI 추측보다 전사본에서 직접 뽑는 편이 정확하다(형식이 고정돼 있음).
        var ids = transcript.match(REC_LISTING_RE);
        var listingIds = ids ? ids.filter(function (x, i, a) { return a.indexOf(x) === i; }).join(', ') : '';

        var row = HEADERS.calls.map(function (h) {
          switch (h) {
            case 'id':          return 'CALL' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyMMdd-HHmmss');
            case 'when':        return when;
            case 'phone':       return phoneFmt;
            case 'name':        return name;
            case 'customerId':  return link.id;
            case 'direction':   return String(ai.direction || '').trim() || meta.direction || '';
            case 'listingIds':  return listingIds;
            case 'matched':     return phoneKey ? link.matched : '번호없음';
            case 'fileName':    return fname;
            case 'fileUrl':     return file.getUrl();
            case 'fileId':      return fid;
            case 'transcript':  return transcript.slice(0, REC_TRANSCRIPT_CAP);
            case 'processedAt': return recNow_();
            default:
              var v = ai[h];
              if (v === undefined || v === null) return '';
              return (typeof v === 'object') ? JSON.stringify(v) : String(v);   // 배열/객체가 오면 [object Object] 방지
          }
        });

        sheet.appendRow(row);
        doneIds[fid] = true;
        recMarkDone_(file, folder);
        stat.ok++;
        console.log('✅ 완료: ' + fname + ' → ' + (phoneFmt || '번호미상') + ' / ' + link.matched);
      } catch (err) {
        stat.fail++;
        stat.errors.push(fname + ' — ' + err.message);
        console.error('❌ 실패 [' + fname + ']: ' + err.message);
        // 실패 파일은 표시하지 않는다 → 다음 회차에 자동 재시도된다.
      }
    }
  } catch (e) {
    stat.fail++;
    stat.errors.push('전체 실행 오류 — ' + e.message);
    console.error('❌ recRun 중단: ' + e.message);
  } finally {
    cache.remove('REC_RUNNING');
  }

  console.log('=== 통화요약 결과: 성공 ' + stat.ok + ' / 건너뜀 ' + stat.skip + ' / 실패 ' + stat.fail + ' ===');
  if (stat.fail > 0) recNotifyFail_(stat);
  return stat;
}

// 실패를 콘솔에만 남기면 사장님은 영영 모른다. 하루 1통만 메일로 알린다(같은 날 중복 발송 방지).
function recNotifyFail_(stat) {
  try {
    var today = recNow_('yyyy-MM-dd');
    if (recProp_('REC_FAIL_MAILED') === today) return;
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(),
      '[브리즈CRM] 통화요약 실패 ' + stat.fail + '건',
      '실패한 녹음이 있습니다.\n\n' + stat.errors.join('\n') +
      '\n\n실패한 파일은 다음 실행에서 자동으로 다시 시도합니다.\n' +
      '계속 실패하면 시트 메뉴 [🎙️ 통화 요약 → 🔍 상태 점검]을 눌러 보세요.');
    PropertiesService.getScriptProperties().setProperty('REC_FAIL_MAILED', today);
  } catch (e) { console.warn('실패 알림 메일 전송 실패: ' + e.message); }
}

// ── 메뉴용 래퍼 ──────────────────────────────────────────────────────────────
function recRunOnce() {
  var ui = SpreadsheetApp.getUi();
  var s = recRun();
  if (!s) { ui.alert('실행 건너뜀', '이전 실행이 아직 진행 중입니다. 잠시 후 다시 눌러 주세요.', ui.ButtonSet.OK); return; }
  ui.alert('통화요약 처리 결과',
    '성공 ' + s.ok + '건 / 건너뜀 ' + s.skip + '건 / 실패 ' + s.fail + '건' +
    (s.errors.length ? '\n\n[실패 내역]\n' + s.errors.join('\n') : ''), ui.ButtonSet.OK);
}

function recInstallTrigger() {
  recDeleteTriggers_();
  // 5분이 아니라 15분인 이유: 이 프로젝트에는 이미 smsQueueSweep(10분) 등 트리거가 여러 개 돌고,
  // 하루 총 실행시간(개인 계정 90분)을 같이 나눠 쓴다. 오디오 전사는 건당 수십 초라
  // 5분 주기로 돌리면 문자 자동응답 쪽 실행시간을 갉아먹는다.
  ScriptApp.newTrigger('recRun').timeBased().everyMinutes(15).create();
  try { SpreadsheetApp.getUi().alert('자동 실행 시작', '15분마다 새 녹음을 확인해 상담이력에 기록합니다.', SpreadsheetApp.getUi().ButtonSet.OK); }
  catch (e) { console.log('recRun 트리거 설치 완료'); }
}
function recDeleteTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'recRun') ScriptApp.deleteTrigger(t);
  });
}
function recRemoveTrigger() {
  recDeleteTriggers_();
  try { SpreadsheetApp.getUi().alert('자동 실행 중지', '통화요약 자동 실행을 껐습니다.', SpreadsheetApp.getUi().ButtonSet.OK); }
  catch (e) { console.log('recRun 트리거 제거 완료'); }
}

function recResetBaseline() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.alert('기준점 재설정',
    '지금 폴더에 있는 기존 녹음을 전부 "처리완료"로 표시하고,\n' +
    '이 시각 이후 새로 들어오는 녹음부터 분석합니다.\n\n' +
    '이미 기록된 상담이력 행은 지우지 않습니다. 진행할까요?', ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) return;

  var n = 0;
  try {
    var folder = DriveApp.getFolderById(recFolderId_());
    var files = folder.getFiles();
    while (files.hasNext()) { if (recMarkDone_(files.next(), folder)) n++; }
  } catch (e) { ui.alert('오류', e.message, ui.ButtonSet.OK); return; }

  PropertiesService.getScriptProperties().setProperty('REC_BASELINE', new Date().toISOString());
  ui.alert('기준점 설정 완료',
    '기존 파일 ' + n + '개를 건너뛰기로 표시했습니다.\n기준 시각: ' + recNow_(), ui.ButtonSet.OK);
}

// ── 점검 도구 ────────────────────────────────────────────────────────────────
function recTestApi() {
  var ui = SpreadsheetApp.getUi();
  try {
    var r = recFetch_('https://generativelanguage.googleapis.com/v1beta/models/' + recModel_() + ':generateContent', {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify({ contents: [{ parts: [{ text: '연결 확인. 한 문장으로 인사해줘.' }] }] })
    });
    if (r.getResponseCode() === 200)
      ui.alert('연결 성공', '모델: ' + recModel_() + '\n\n응답:\n' + recExtractText_(r.getContentText()).slice(0, 300), ui.ButtonSet.OK);
    else
      ui.alert('연결 실패 (' + r.getResponseCode() + ')',
        r.getContentText().slice(0, 500) + '\n\n모델 이름이 틀렸을 수 있습니다. [📋 사용 가능한 모델 목록 보기]로 확인하세요.', ui.ButtonSet.OK);
  } catch (e) { ui.alert('연결 실패', e.message, ui.ButtonSet.OK); }
}

// 모델 이름은 시간이 지나면 바뀐다. 추측하지 말고 계정에서 실제로 쓸 수 있는 목록을 본다.
function recListModels() {
  var ui = SpreadsheetApp.getUi();
  try {
    var r = recFetch_('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200');
    if (r.getResponseCode() !== 200) { ui.alert('조회 실패 (' + r.getResponseCode() + ')', r.getContentText().slice(0, 500), ui.ButtonSet.OK); return; }
    var names = (JSON.parse(r.getContentText()).models || [])
      .filter(function (m) { return (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0; })
      .map(function (m) { return m.name.replace('models/', ''); });
    ui.alert('사용 가능한 모델 (' + names.length + '개)',
      '현재 설정: ' + recModel_() + '\n\n' + names.join('\n') +
      '\n\n바꾸려면 스크립트 속성 REC_GEMINI_MODEL 값을 고치세요.', ui.ButtonSet.OK);
  } catch (e) { ui.alert('조회 실패', e.message, ui.ButtonSet.OK); }
}

function recStatus() {
  var ui = SpreadsheetApp.getUi();
  var folderTxt = '', keyTxt = '', sheetTxt = '', trigTxt = '', baseTxt = '';

  try {
    var folder = DriveApp.getFolderById(recFolderId_());
    var files = folder.getFiles(), total = 0, audio = 0;
    while (files.hasNext()) { total++; if (recIsAudio_(recMime_(files.next()))) audio++; }
    folderTxt = '✅ ' + folder.getName() + ' (파일 ' + total + '개 / 대기 오디오 ' + audio + '개)';
  } catch (e) { folderTxt = '❌ ' + e.message; }

  try { var k = recApiKey_(); keyTxt = '✅ 등록됨 (' + k.slice(0, 6) + '…) / 모델 ' + recModel_(); }
  catch (e) { keyTxt = '❌ ' + e.message; }

  try { var sh = recSheet_(); sheetTxt = '✅ ' + sh.getName() + ' — 기록 ' + Math.max(sh.getLastRow() - 1, 0) + '건'; }
  catch (e) { sheetTxt = '❌ ' + e.message; }

  var n = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'recRun'; }).length;
  trigTxt = n > 0 ? '✅ 자동 실행 중 (15분 주기)' : '⏹️ 꺼짐';

  var b = recProp_('REC_BASELINE');
  baseTxt = b ? Utilities.formatDate(new Date(b), 'Asia/Seoul', 'yyyy-MM-dd HH:mm') + ' 이후 파일만' : '전체 (기준점 없음)';

  ui.alert('🎙️ 통화요약 상태',
    '• 녹음 폴더 : ' + folderTxt + '\n' +
    '• Gemini    : ' + keyTxt + '\n' +
    '• 상담이력  : ' + sheetTxt + '\n' +
    '• 수집 기준 : ' + baseTxt + '\n' +
    '• 자동 실행 : ' + trigTxt + '\n\n' +
    '전화번호 정규화는 문자접수와 같은 smsPhoneKey_ 를 씁니다(같은 고객으로 묶임).',
    ui.ButtonSet.OK);
}

/* ═══════════════════════════════════════════════════════════════════
   🥕 매물 수집 (당근부동산 · 제주오일장) — 2026-09-07 신설
   ─────────────────────────────────────────────────────────────────
   무엇인가
     지금까지는 PC의 파이썬 프로그램(D:\A_당근부동산)이 크롬을 띄워
     당근 지도를 스크롤하며 매물을 긁었다. 그래서 PC를 켜 둬야 했다.
     실측(2026-09-07) 결과 당근 목록은 **로그인도 토큰도 없이** 그냥
     HTTP 한 번으로 받을 수 있었다. 그래서 이 파일(구글 서버)로 옮겼다.
       · 한 구역 1,200건 / 34초 (브라우저 방식은 760건쯤에서 잘렸다)
       · 목록 응답에 동·건물명·좌표·가격·면적·층·개인/중개 구분이 다 들어 있다
       · 지번 주소만 좌표→주소 변환(카카오)으로 채우면 된다

   🔴 대표(마스터) 전용이다. 직원 토큰으로는 어떤 수집 액션도 통과하지 못한다.
      권한 판정은 기존 resolveUser_() 를 그대로 쓴다 (role === 'admin').

   🔴 구글 스크립트는 한 번에 6분까지만 돈다. 제주시는 45칸이라 한 번에 못 끝낸다.
      그래서 '이어달리기' 방식이다 — collectStep() 이 4분만 일하고 상태를 저장한 뒤
      1분짜리 트리거가 다시 불러 이어서 한다. 문자 대기열(smsQueueSweep)과 같은 방식.

   되돌리기: 이 블록 전체를 지우고 SHEETS.collected 항목을 빼면 원래대로 돌아간다.
            시트 '수집매물' 은 지워도 다음 수집 때 다시 만들어진다.
   ═══════════════════════════════════════════════════════════════════ */

var COL_SHEET = '수집매물';
var COL_STATE_KEY = 'COLLECT_STATE';
var COL_BUDGET_MS = 4 * 60 * 1000;   // 한 번 실행에서 일하는 시간(6분 한도 안쪽 여유)
var COL_TRIGGER_FN = 'gatherStep';

// 당근 공개 GraphQL (로그인 불필요 — 2026-09-07 실측)
var DG_GQL = 'https://realty.kr.karrotmarket.com/graphql';
var DG_HASH_FEED = '2d6f96b6459dcc3b99b214457862361c628048d470a31665f8883b3a6ef9e98f';
var DG_HASH_SAFE = 'c5fdc9a9faf0069e49d68c9df536b2e95ef25bb1bc4f8a182c6a41f692893e09';
var DG_PAGE = 50;                    // 한 번에 받아오는 매물 수
var DG_MAX_PAGES = 80;               // 한 구역 안전 상한(1,200건이 최대였음)

// 제주오일장
var OJ_BASE = 'https://www.jejuall.com';
var OJ_GUBUNS = ['6', '2', '3', '4'];
var OJ_MAX_PAGES = 40;
var OJ_SITE_PHONES = ['010-3697-7074', '064-748-5151', '064-763-5101'];  // 사이트 대표번호 — 임대인 번호가 아니다

// 제주시 격자 (파이썬 config.JEJU_BOUNDS 와 같은 값)
var COL_BOUNDS = { latMin: 33.460, latMax: 33.535, lonMin: 126.400, lonMax: 126.620 };
var COL_TILE_LAT = 0.015;
var COL_TILE_LON = 0.027;

var COL_HEADERS = [
  'src', 'id', 'url', 'kind', 'trade', 'price', 'deposit', 'rent',
  'area', 'floor', 'topFloor', 'dong', 'apt', 'addr', 'writer', 'biz', 'nick',
  'phone', 'lat', 'lon', 'status', 'dup', 'dupId', 'movedAt', 'seenAt'
];

/* ── 권한: 대표만 ─────────────────────────────────────────── */
function colAdmin_(user) {
  if (!user || user.role !== 'admin') {
    throw new Error('매물 수집은 대표(마스터)만 사용할 수 있습니다');
  }
  return user;
}

/* ── 시트 ─────────────────────────────────────────────────── */
/* 🔴 sheetColMap_ 은 { names, index, width } 를 돌려준다.
   칸 이름 → 번호만 필요한 곳이 많아 납작하게 꺼내 쓴다.
   (이걸 헷갈려 쓰면 값이 한 칸도 안 들어간다 — 2026-09-07 검산에서 잡힘) */
function colMap_(sheet) { return sheetColMap_(sheet).index; }


function colSheet_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(COL_SHEET);
  if (!sh) {
    sh = ss.insertSheet(COL_SHEET);
    sh.getRange(1, 1, 1, COL_HEADERS.length).setValues([COL_HEADERS]);
    sh.setFrozenRows(1);
  }
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, COL_HEADERS.length).setValues([COL_HEADERS]);
    sh.setFrozenRows(1);
  }
  return sh;
}

// 이미 시트에 있는 매물 키(src|id) — 같은 것을 두 번 넣지 않기 위해
function colSeenKeys_(sh) {
  var seen = {};
  var last = sh.getLastRow();
  if (last < 2) return seen;
  var cm = colMap_(sh);
  if (!('src' in cm) || !('id' in cm)) return seen;
  var vals = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  for (var i = 0; i < vals.length; i++) {
    var s = String(vals[i][cm.src] || ''), d = String(vals[i][cm.id] || '');
    if (d) seen[s + '|' + d] = i + 2;      // 값 = 행번호 (나중에 갱신할 때 쓴다)
  }
  return seen;
}

// 행 객체들을 시트 끝에 덧붙인다. 🔴 칸 순서는 시트의 머리글을 따른다(사장님이 칼럼을 옮겨도 안전)
function colAppend_(sh, items) {
  if (!items || !items.length) return 0;
  var cm = colMap_(sh);
  var width = sh.getLastColumn();
  var rows = [];
  for (var i = 0; i < items.length; i++) {
    var r = new Array(width);
    for (var k = 0; k < width; k++) r[k] = '';
    for (var key in items[i]) {
      if (key in cm) r[cm[key]] = cellVal_(items[i][key]);
    }
    rows.push(r);
  }
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, width).setValues(rows);
  SpreadsheetApp.flush();
  return rows.length;
}

/* ── 격자 ─────────────────────────────────────────────────── */
function colTiles_() {
  var out = [];
  for (var la = COL_BOUNDS.latMin; la < COL_BOUNDS.latMax; la += COL_TILE_LAT) {
    for (var lo = COL_BOUNDS.lonMin; lo < COL_BOUNDS.lonMax; lo += COL_TILE_LON) {
      var la2 = Math.min(la + COL_TILE_LAT, COL_BOUNDS.latMax);
      var lo2 = Math.min(lo + COL_TILE_LON, COL_BOUNDS.lonMax);
      out.push([la.toFixed(5), lo.toFixed(5), la2.toFixed(5), lo2.toFixed(5)].join(','));
    }
  }
  return out;
}

/* ── 당근: 목록 한 페이지 ─────────────────────────────────── */
function dgFeed_(tile, after) {
  var p = String(tile).split(',');
  var body = {
    variables: {
      first: DG_PAGE, after: after || null,
      input: {
        locationFilter: {
          neCoordinate: { lat: String(p[2]), lon: String(p[3]) },
          swCoordinate: { lat: String(p[0]), lon: String(p[1]) }
        },
        propertyFilter: { salesTypes: [] },
        resolution: 9, surface: 'MAP'
      }
    },
    extensions: { persistedQuery: { version: 1, sha256Hash: DG_HASH_FEED } }
  };
  var res = UrlFetchApp.fetch(DG_GQL, {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify(body), muteHttpExceptions: true,
    headers: {
      'accept': '*/*', 'accept-language': 'ko-KR',
      'origin': 'https://realty.daangn.com', 'referer': 'https://realty.daangn.com/',
      'x-realty-platform': 'realty-web'
    }
  });
  if (res.getResponseCode() !== 200) return null;
  var j;
  try { j = JSON.parse(res.getContentText()); } catch (e) { return null; }
  return ((j.data || {}).articleFeed) || null;
}

// 당근 매물 → 시트 행 객체
var DG_KIND = {
  ONE_ROOM: '원룸', TWO_ROOM: '투룸', OFFICETEL: '오피스텔',
  STORE: '상가', OFFICE: '사무실', APART: '아파트', HOUSE: '주택', LAND: '토지'
};
var DG_TRADE = { MONTH: '월세', YEAR: '연세', BORROW: '전세', BUY: '매매', SHORT: '단기' };

function dgRow_(a) {
  if (!a || !a.originalId) return null;
  var trades = a.trades || [];
  var t = null;
  for (var i = 0; i < trades.length; i++) if (trades[i] && trades[i].preferred) { t = trades[i]; break; }
  if (!t && trades.length) t = trades[0];
  t = t || {};
  var st = (a.salesTypeV3 || {}).type || '';
  var reg = a.region || {};
  var co = a.publicCoordinate || {};
  return {
    src: '당근',
    id: String(a.originalId),
    url: 'https://www.daangn.com/kr/realty/' + a.originalId + '/',
    kind: DG_KIND[st] || st,
    trade: DG_TRADE[t.type] || t.type || '',
    price: (t.price === 0 || t.price) ? t.price : '',
    deposit: (t.deposit === 0 || t.deposit) ? t.deposit : '',
    rent: (t.monthlyPay === 0 || t.monthlyPay) ? t.monthlyPay
          : ((t.yearlyPay === 0 || t.yearlyPay) ? t.yearlyPay : ''),
    area: a.area || '',
    floor: a.floor || '',
    topFloor: a.topFloor || '',
    dong: reg.name3 || reg.name || '',
    apt: a.buildingName || (a.complex || {}).name || '',
    addr: '',                                  // 좌표→주소 단계에서 채운다
    writer: (a.writerTypeV2 === 'DIRECT_USER') ? '개인' : '중개',
    biz: '',
    nick: (a.writer || {}).nickname || '',
    phone: '',
    lat: co.lat || '', lon: co.lon || '',
    status: a.status || '',
    dup: '', dupId: '', movedAt: '',
    seenAt: nowStr_()
  };
}

/* ── 당근: 안심번호(050) ──────────────────────────────────── */
function dgSafeNumber_(articleId) {
  var body = {
    variables: { input: { articleId: String(articleId) } },
    extensions: { persistedQuery: { version: 1, sha256Hash: DG_HASH_SAFE } }
  };
  var res = UrlFetchApp.fetch(DG_GQL, {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify(body), muteHttpExceptions: true,
    headers: {
      'accept': '*/*', 'accept-language': 'ko-KR',
      'origin': 'https://realty.daangn.com', 'referer': 'https://realty.daangn.com/',
      'x-realty-platform': 'realty-web'
    }
  });
  if (res.getResponseCode() !== 200) return '';
  try {
    var j = JSON.parse(res.getContentText());
    return ((j.data || {}).issueArticleSafeNumber || {}).safeNumber || '';
  } catch (e) { return ''; }
}

// 0504-4098-6861 로 보기 좋게 (시트가 앞의 0 을 떼먹지 않게 문자열로 확정)
function colPhoneFmt_(n) {
  var d = String(n || '').replace(/\D/g, '');
  if (d.length === 12 && d.indexOf('050') === 0) return d.slice(0, 4) + '-' + d.slice(4, 8) + '-' + d.slice(8);
  if (d.length === 11 && d.indexOf('050') === 0) return d.slice(0, 4) + '-' + d.slice(4, 7) + '-' + d.slice(7);
  return String(n || '');
}

/* ── 좌표 → 지번 주소 (카카오) ────────────────────────────── */
function colCoordAddr_(lat, lon) {
  if (!KAKAO_REST_KEY || !lat || !lon) return '';
  var url = 'https://dapi.kakao.com/v2/local/geo/coord2address.json?x='
          + encodeURIComponent(lon) + '&y=' + encodeURIComponent(lat);
  try {
    var res = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'KakaoAK ' + KAKAO_REST_KEY }, muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) return '';
    var docs = (JSON.parse(res.getContentText()).documents) || [];
    if (!docs.length) return '';
    var a = docs[0].address || {};
    return a.address_name || '';
  } catch (e) { return ''; }
}

/* ── 제주오일장 ───────────────────────────────────────────── */
function ojFetch_(url) {
  var res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true, followRedirects: true,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' }
  });
  if (res.getResponseCode() !== 200) return '';
  return res.getContentText('UTF-8');
}

function ojOne_(html, re) {
  var m = re.exec(html);
  return m ? String(m[1]).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim() : '';
}

// 목록 페이지 → 매물 카드들
/* 💰 오일장 가격 쪼개기 (2026-09-09 신설 — 그전에는 가격이 통째로 빠졌다)
   매매·전세는 단일 숫자(만원), 년월세·임대는 "보증금/월세".
   🔴 숫자를 지어내지 않는다 — 못 읽으면 빈칸으로 둔다. */
function ojPrice_(raw, trade) {
  var t = String(raw || '').replace(/[^0-9,\/]/g, '');
  if (!t) return { price: '', deposit: '', rent: '' };
  var n = function (x) { return String(x || '').replace(/,/g, '').trim(); };
  var p = t.split('/');
  if (p.length >= 2) return { price: '', deposit: n(p[0]), rent: n(p[1]) };
  var one = n(p[0]);
  if (!one || one === '0') return { price: '', deposit: '', rent: '' };
  // 거래유형이 임대 쪽인데 숫자가 하나뿐이면 보증금으로 본다(월세는 페이지에 없음)
  if (/월세|년세|임대|전월세/.test(String(trade || ''))) return { price: '', deposit: one, rent: '' };
  return { price: one, deposit: '', rent: '' };
}

function ojCards_(html, gubun) {
  var out = [];
  if (!html) return out;
  // 🔴 파이썬 수집기(_CARD_PAT)와 같은 규칙이어야 한다 — 카드는 <a href=".../CProperty/detail?num=NN">
  var re = /<a\s[^>]*href=["'][^"']*CProperty\/detail\?num=(\d+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  var m, inPage = {};
  while ((m = re.exec(html)) !== null) {
    var num = m[1], inner = m[2];
    if (inPage[num]) continue;          // 한 페이지에 같은 카드가 여러 번 나오는 경우가 있다
    inPage[num] = true;
    var biz = ojOne_(inner, /<h3\s+class=["']name_tit["']>([\s\S]*?)<\/h3>/i);
    // 💰 2026-09-09: 가격을 여기서 바로 쪼개 넣는다. 전에는 _priceRaw 로만 담고 버려서 전부 빈칸이었다.
    var _tr  = ojOne_(inner, /<span\s+class=["']type\d+["']>([\s\S]*?)<\/span>/i);
    var _raw = ojOne_(inner, /<span\s+class=["']price["']>([\s\S]*?)<\/span>/i);
    var _pr  = ojPrice_(_raw, _tr);
    out.push({
      src: '오일장', id: num,
      url: OJ_BASE + '/CProperty/detail?num=' + num,
      kind: ojOne_(inner, /<span\s+class=["']cate["']>([\s\S]*?)<\/span>/i),
      trade: _tr,
      price: _pr.price, deposit: _pr.deposit, rent: _pr.rent,
      area: ojOne_(inner, /<span\s+class=["']area["']>([\s\S]*?)<\/span>/i).replace(/,/g, ''),
      floor: '', topFloor: '',
      dong: '', apt: ojOne_(inner, /<h2\s+class=["']propertyname["']>([\s\S]*?)<\/h2>/i),
      addr: ojOne_(inner, /<span\s+class=["']add["']>([\s\S]*?)<\/span>/i),
      writer: (gubun === '2' || !biz) ? '개인' : '중개',
      biz: biz, nick: '',
      phone: ojOne_(inner, /<span\s+class=["']tel["']>([\s\S]*?)<\/span>/i),
      lat: '', lon: '', status: '',
      dup: '', dupId: '', movedAt: '',
      seenAt: nowStr_(),
      _priceRaw: _raw
    });
  }
  return out;
}

// 상세 페이지 → 소재지(지번)·연락처
function ojDetail_(num) {
  var html = ojFetch_(OJ_BASE + '/CProperty/detail?num=' + num);
  if (!html || html.length < 2000) return null;          // 삭제된 글은 153바이트 안내 페이지
  var addr = '', phone = '';
  var rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  for (var i = 0; i < rows.length; i++) {
    var text = rows[i].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!addr && text.indexOf('소재지') >= 0) {
      var m = /소재지\s+(.+)/.exec(text);
      if (m) {
        var a = m[1].trim();
        var kinds = ['원룸투룸', '상가점포', '아파트', '주택', '토지', '사무실', '오피스텔', '빌라', '쓰리룸', '분양권'];
        for (var k = 0; k < kinds.length; k++) a = a.split(kinds[k]).join('').trim();
        if (a) addr = a;
      }
    }
    if (!phone && text.indexOf('연락처') >= 0) {
      var ph = text.match(/0\d{1,2}-\d{3,4}-\d{4}/g) || [];
      for (var q = 0; q < ph.length; q++) {
        if (OJ_SITE_PHONES.indexOf(ph[q]) < 0) { phone = ph[q]; break; }
      }
    }
  }
  return { addr: addr, phone: phone };
}

/* ── 진행 상태 ────────────────────────────────────────────── */
function colState_() {
  var raw = PropertiesService.getScriptProperties().getProperty(COL_STATE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}
function colStateSet_(st) {
  PropertiesService.getScriptProperties().setProperty(COL_STATE_KEY, JSON.stringify(st));
}
function colStateClear_() {
  PropertiesService.getScriptProperties().deleteProperty(COL_STATE_KEY);
}

function nowStr_() {
  return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
}

/* ── 트리거 (이어달리기) ──────────────────────────────────── */
function colTriggerOn_() {
  colTriggerOff_();
  ScriptApp.newTrigger(COL_TRIGGER_FN).timeBased().everyMinutes(1).create();
}
function colTriggerOff_() {
  var all = ScriptApp.getProjectTriggers();
  for (var i = 0; i < all.length; i++) {
    if (all[i].getHandlerFunction() === COL_TRIGGER_FN) ScriptApp.deleteTrigger(all[i]);
  }
}

/* ── 시작 / 중지 / 진행상황 ───────────────────────────────── */
function gatherStart(user, opts) {
  colAdmin_(user);
  var cur = colState_();
  if (cur && cur.phase && cur.phase !== 'done') {
    return { already: true, state: cur };
  }
  opts = opts || {};
  var tiles = colTiles_();
  // 시험용: tiles 를 주면 그 개수만 훑는다 (배포 직후 1칸으로 확인할 때 쓴다).
  //   화면에서는 안 쓴다 — 사장님이 [수집 시작]을 누르면 언제나 제주시 전체다.
  if (opts.tiles && Number(opts.tiles) > 0) tiles = tiles.slice(0, Number(opts.tiles));
  var st = {
    phase: 'dg',
    startedAt: nowStr_(),
    tiles: tiles, ti: 0, after: null, pages: 0,
    ojGubuns: (opts.oiljang === false) ? [] : OJ_GUBUNS.slice(),
    ojPage: 1,
    pend: { addr: [], sn: [], ojd: [] },
    counts: { dg: 0, oj: 0, addr: 0, sn: 0, dup: 0, skip: 0 },
    log: []
  };
  colStateSet_(st);
  colTriggerOn_();
  colStep_();                                  // 첫 묶음은 바로 시작
  return { started: true, tiles: tiles.length, state: colState_() };
}

function gatherStop(user) {
  colAdmin_(user);
  colTriggerOff_();
  var st = colState_();
  if (st) { st.phase = 'done'; st.stoppedAt = nowStr_(); colStateSet_(st); }
  return { stopped: true, state: st };
}

function gatherStatus(user) {
  colAdmin_(user);
  var st = colState_();
  if (!st) return { phase: 'idle' };
  var total = (st.tiles || []).length;
  var pct = 0;
  if (st.phase === 'dg') pct = total ? Math.round(st.ti * 60 / total) : 0;
  else if (st.phase === 'oj') pct = 65;
  else if (st.phase === 'ojd') pct = 75;
  else if (st.phase === 'addr') pct = 85;
  else if (st.phase === 'sn') pct = 92;
  else if (st.phase === 'dup') pct = 97;
  else if (st.phase === 'done') pct = 100;
  return {
    phase: st.phase, percent: pct, counts: st.counts,
    tile: st.ti, tiles: total, startedAt: st.startedAt,
    finishedAt: st.finishedAt || '', log: (st.log || []).slice(-12)
  };
}

// 트리거가 부르는 이름 (권한 검사 없음 — 구글이 부르는 것이므로)
function gatherStep() { colStep_(); }

/* ── 본체: 4분만 일하고 상태를 저장한다 ───────────────────── */
// 🔴 수집 전용 겹침 방지 — 전역 잠금(LockService)을 오래 쥐면 안 된다!
//   처음에는 colStep_ 전체를 getScriptLock 으로 감쌌는데, 그 잠금은 saveAll·upsert·
//   공실문자 미리보기(vacSmsRun) 등 withWriteLock_ 를 쓰는 모든 기능과 **같은 자물쇠**다.
//   수집이 4분씩 쥐고 있는 동안 사장님의 [👁 미리보기]가 30초 기다리다
//   "다른 기기의 저장 작업이 진행 중" 으로 죽었다 (2026-09-07 실제 발생).
//   → 이제 전역 잠금은 '깃발을 세우는 순간'에만 몇 밀리초 쥐고,
//     일하는 4분 동안은 속성(COLLECT_STEP_AT) 깃발로만 겹침을 막는다.
//     깃발이 6.5분 넘게 방치돼 있으면 이전 실행이 강제종료된 것으로 보고 무시한다.
var COL_STEP_FLAG = 'COLLECT_STEP_AT';
var COL_STEP_STALE_MS = 6.5 * 60 * 1000;   // GAS 강제종료(6분)보다 넉넉하게

function colStepBusy_() {
  var props = PropertiesService.getScriptProperties();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return true;          // 깃발 확인 자체가 밀리면 이번 턴은 포기
  try {
    var at = Number(props.getProperty(COL_STEP_FLAG) || 0);
    if (at && (new Date().getTime() - at) < COL_STEP_STALE_MS) return true;
    props.setProperty(COL_STEP_FLAG, String(new Date().getTime()));
    return false;
  } finally {
    lock.releaseLock();                          // 🔴 즉시 풀어준다 — 저장·미리보기를 막지 않게
  }
}

function colStep_() {
  var st = colState_();
  if (!st || st.phase === 'done') { colTriggerOff_(); return; }

  if (colStepBusy_()) return;                    // 다른 gatherStep 이 도는 중이면 건너뛴다

  var t0 = new Date().getTime();
  var left = function () { return (new Date().getTime() - t0) < COL_BUDGET_MS; };
  var say = function (m) {
    st.log = (st.log || []).concat([nowStr_().slice(11) + ' ' + m]);
    if (st.log.length > 60) st.log = st.log.slice(-60);
  };

  try {
    var sh = colSheet_();
    var seen = colSeenKeys_(sh);

    /* ① 당근 목록 — 격자를 순서대로 */
    while (st.phase === 'dg' && st.ti < st.tiles.length && left()) {
      var feed = dgFeed_(st.tiles[st.ti], st.after);
      if (!feed) { st.ti++; st.after = null; st.pages = 0; continue; }
      var edges = feed.edges || [];
      var add = [];
      for (var i = 0; i < edges.length; i++) {
        var art = (edges[i].node || {}).article || edges[i].article;
        var row = dgRow_(art);
        if (!row) continue;
        var key = '당근|' + row.id;
        if (seen[key]) { st.counts.skip++; continue; }
        seen[key] = true;
        add.push(row);
        if (row.addr === '' && row.lat) st.pend.addr.push(row.id);
        if (row.writer === '개인') st.pend.sn.push(row.id);
      }
      if (add.length) { colAppend_(sh, add); st.counts.dg += add.length; }
      st.pages++;
      var pi = feed.pageInfo || {};
      if (pi.hasNextPage && pi.endCursor && edges.length && st.pages < DG_MAX_PAGES) {
        st.after = pi.endCursor;
      } else {
        say('구역 ' + (st.ti + 1) + '/' + st.tiles.length + ' 끝 (누적 ' + st.counts.dg + '건)');
        st.ti++; st.after = null; st.pages = 0;
      }
    }
    if (st.phase === 'dg' && st.ti >= st.tiles.length) {
      st.phase = st.ojGubuns.length ? 'oj' : 'ojd';
      say('당근 목록 끝 — ' + st.counts.dg + '건');
    }

    /* ② 오일장 목록 */
    while (st.phase === 'oj' && st.ojGubuns.length && left()) {
      var g = st.ojGubuns[0];
      var html = ojFetch_(OJ_BASE + '/CProperty?gubun=' + g + '&page_data_list=' + st.ojPage);
      var cards = ojCards_(html, g);
      var addo = [];
      for (var c = 0; c < cards.length; c++) {
        var k2 = '오일장|' + cards[c].id;
        if (seen[k2]) { st.counts.skip++; continue; }
        seen[k2] = true;
        delete cards[c]._priceRaw;
        addo.push(cards[c]);
        st.pend.ojd.push(cards[c].id);
      }
      if (addo.length) { colAppend_(sh, addo); st.counts.oj += addo.length; }
      if (!cards.length || st.ojPage >= OJ_MAX_PAGES) {
        say('오일장 구분 ' + g + ' 끝 (누적 ' + st.counts.oj + '건)');
        st.ojGubuns.shift(); st.ojPage = 1;
      } else {
        st.ojPage++;
      }
    }
    if (st.phase === 'oj' && !st.ojGubuns.length) st.phase = 'ojd';

    /* ③ 오일장 상세(지번 주소·전화) */
    while (st.phase === 'ojd' && st.pend.ojd.length && left()) {
      var onum = st.pend.ojd.shift();
      var d = ojDetail_(onum);
      if (d && (d.addr || d.phone)) {
        colUpdate_(sh, '오일장', onum, { addr: d.addr || '', phone: d.phone || '' });
        st.counts.addr++;
      }
    }
    if (st.phase === 'ojd' && !st.pend.ojd.length) { st.phase = 'addr'; say('오일장 상세 끝'); }

    /* ④ 당근 좌표 → 지번 주소 */
    while (st.phase === 'addr' && st.pend.addr.length && left()) {
      var aid = st.pend.addr.shift();
      var pos = colFind_(sh, '당근', aid);
      if (!pos) continue;
      var ad = colCoordAddr_(pos.lat, pos.lon);
      if (ad) { colUpdate_(sh, '당근', aid, { addr: ad }); st.counts.addr++; }
    }
    if (st.phase === 'addr' && !st.pend.addr.length) { st.phase = 'sn'; say('주소 변환 끝'); }

    /* ⑤ 개인 직거래 안심번호(050) */
    while (st.phase === 'sn' && st.pend.sn.length && left()) {
      var sid = st.pend.sn.shift();
      var num = dgSafeNumber_(sid);
      if (num) { colUpdate_(sh, '당근', sid, { phone: colPhoneFmt_(num) }); st.counts.sn++; }
    }
    if (st.phase === 'sn' && !st.pend.sn.length) { st.phase = 'dup'; say('안심번호 끝 — ' + st.counts.sn + '건'); }

    /* ⑥ 내 매물과 중복 대조 */
    if (st.phase === 'dup') {
      st.counts.dup = colDedupe_();
      st.phase = 'done';
      st.finishedAt = nowStr_();
      say('완료 — 당근 ' + st.counts.dg + ' / 오일장 ' + st.counts.oj
          + ' / 번호 ' + st.counts.sn + ' / 내매물겹침 ' + st.counts.dup);
      colTriggerOff_();
    }

    colStateSet_(st);
  } catch (e) {
    st.log = (st.log || []).concat([nowStr_().slice(11) + ' ⚠ ' + String(e).slice(0, 120)]);
    colStateSet_(st);
  } finally {
    try { SpreadsheetApp.flush(); } catch (e2) {}
    // 깃발을 내린다 — 다음 1분 트리거가 이어받는다
    try { PropertiesService.getScriptProperties().deleteProperty(COL_STEP_FLAG); } catch (e3) {}
  }
}

/* ── 행 찾기 / 고치기 ─────────────────────────────────────── */
function colFind_(sh, src, id) {
  var last = sh.getLastRow();
  if (last < 2) return null;
  var cm = colMap_(sh);
  var vals = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][cm.src] || '') === src && String(vals[i][cm.id] || '') === String(id)) {
      return { row: i + 2, lat: vals[i][cm.lat], lon: vals[i][cm.lon], vals: vals[i] };
    }
  }
  return null;
}

function colUpdate_(sh, src, id, patch) {
  var pos = colFind_(sh, src, id);
  if (!pos) return false;
  var cm = colMap_(sh);
  for (var key in patch) {
    if (key in cm) sh.getRange(pos.row, cm[key] + 1).setValue(cellVal_(patch[key]));
  }
  return true;
}

/* ── 내 매물과 중복 대조 ──────────────────────────────────── */
// 주소에서 시/도·시 접두어를 떼고 '연동 294-3' 형태로 맞춘다
function colAddrKey_(a) {
  var s = String(a || '').trim();
  var pfx = ['제주특별자치도 제주시 ', '제주특별자치도 서귀포시 ', '제주시 ', '서귀포시 ', '제주특별자치도 '];
  for (var i = 0; i < pfx.length; i++) {
    if (s.indexOf(pfx[i]) === 0) { s = s.slice(pfx[i].length); break; }
  }
  return s.replace(/\s+/g, ' ').trim();
}

function colDedupe_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var mine = ss.getSheetByName(SHEETS.listings);
  var sh = colSheet_();
  if (!mine || mine.getLastRow() < 2 || sh.getLastRow() < 2) return 0;

  var mcm = colMap_(mine);
  var mv = mine.getRange(2, 1, mine.getLastRow() - 1, mine.getLastColumn()).getValues();
  var byAddr = {};
  for (var i = 0; i < mv.length; i++) {
    var id = String(mv[i][mcm.id] || '');
    if (!id) continue;
    var k = colAddrKey_(mv[i][mcm.addr]);
    if (k) byAddr[k] = id;
    var k2 = colAddrKey_(mv[i][mcm.addr2]);
    if (k2) byAddr[k2] = id;
  }

  var cm = colMap_(sh);
  var last = sh.getLastRow();
  var vals = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  var dupCol = [], idCol = [], hit = 0;
  for (var r = 0; r < vals.length; r++) {
    var key = colAddrKey_(vals[r][cm.addr]);
    var found = key ? (byAddr[key] || '') : '';
    if (found) hit++;
    dupCol.push([found ? '내매물' : '']);
    idCol.push([found]);
  }
  sh.getRange(2, cm.dup + 1, dupCol.length, 1).setValues(dupCol);
  sh.getRange(2, cm.dupId + 1, idCol.length, 1).setValues(idCol);
  SpreadsheetApp.flush();
  return hit;
}

/* ── 수집 결과 읽기 (CRM 화면용) ──────────────────────────── */
function gatherList(user, opts) {
  colAdmin_(user);
  opts = opts || {};
  var sh = colSheet_();
  if (sh.getLastRow() < 2) return [];
  var cm = colMap_(sh);
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    var o = {};
    for (var key in cm) o[key] = vals[i][cm[key]];
    if (!String(o.id || '')) continue;
    if (opts.src && String(o.src) !== opts.src) continue;
    if (opts.writer && String(o.writer) !== opts.writer) continue;
    if (opts.onlyPhone && !String(o.phone || '').trim()) continue;
    if (opts.hideDup && String(o.dup || '')) continue;
    o._row = i + 2;
    out.push(o);
  }
  if (opts.limit && out.length > opts.limit) out = out.slice(0, opts.limit);
  return out;
}

/* ── 임대인 이관 ──────────────────────────────────────────── */
//  🔴 개인(직거래)만 넘긴다 — 중개업소 번호는 동종업계라 브리즈가 쓸 일이 없다.
//  🔴 이미 임대인관리에 있는 번호는 건너뛴다(번호 숫자만 비교).
//  🔴 050 은 당근 안심번호다. 통화는 되지만 문자는 대부분 막히므로 메모에 그렇게 적어 둔다.
function gatherToLandlords(user, opts) {
  colAdmin_(user);
  opts = opts || {};
  var rows = gatherList(user, { onlyPhone: true, writer: '개인' });
  if (!rows.length) return { moved: 0, skipped: 0, reason: '연락처가 있는 개인 매물이 없습니다' };

  var ss = SpreadsheetApp.openById(SHEET_ID);
  var lsh = ss.getSheetByName(SHEETS.landlords);
  var have = {};
  if (lsh && lsh.getLastRow() > 1) {
    var lcm = colMap_(lsh);
    var lv = lsh.getRange(2, 1, lsh.getLastRow() - 1, lsh.getLastColumn()).getValues();
    for (var i = 0; i < lv.length; i++) {
      var d = String(lv[i][lcm.phone] || '').replace(/\D/g, '');
      if (d) have[d] = true;
    }
  }

  var sh = colSheet_();
  var moved = 0, skipped = 0;
  var limit = opts.max || 100;
  for (var r = 0; r < rows.length && moved < limit; r++) {
    var o = rows[r];
    if (String(o.movedAt || '')) { skipped++; continue; }
    var digits = String(o.phone || '').replace(/\D/g, '');
    if (!digits || have[digits]) { skipped++; continue; }

    var is050 = digits.indexOf('050') === 0;
    var note = [
      o.src + ' 수집 (' + nowStr_().slice(0, 10) + ')',
      [o.kind, o.trade].filter(String).join(' '),
      o.apt ? ('건물: ' + o.apt) : '',
      o.area ? ('면적 ' + o.area + '㎡') : '',
      o.url ? ('글: ' + o.url) : '',
      is050 ? '⚠ 050 안심번호 — 통화는 되지만 문자는 대부분 안 갑니다' : ''
    ].filter(String).join(' / ');

    var item = {
      id: 'C' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyMMdd') + '-' + digits.slice(-4) + '-' + r,
      name: (o.writer === '개인' ? '개인' : '중개') + (o.apt ? (' ' + o.apt) : ''),
      phone: String(o.phone || ''),
      addr: String(o.addr || ''),
      apt: String(o.apt || ''),
      note: note
    };
    try {
      upsertRow('landlords', item, user);
      have[digits] = true;
      sh.getRange(o._row, colMap_(sh).movedAt + 1).setValue(nowStr_());
      moved++;
    } catch (e) { skipped++; }
  }
  SpreadsheetApp.flush();
  return { moved: moved, skipped: skipped, total: rows.length };
}

/* ── 편집기에서 한 번 눌러 확인하는 함수 ──────────────────── */
function gatherSelfTest() {
  var admin = { role: 'admin', id: 'admin', name: '대표' };
  var t = colTiles_();
  Logger.log('격자 ' + t.length + '칸, 첫 칸: ' + t[0]);
  var feed = dgFeed_(t[0], null);
  Logger.log('당근 응답: ' + (feed ? ((feed.edges || []).length + '건') : '실패'));
  if (feed && (feed.edges || []).length) {
    var a = (feed.edges[0].node || {}).article || feed.edges[0].article;
    Logger.log('첫 매물: ' + JSON.stringify(dgRow_(a)));
  }
  var oj = ojCards_(ojFetch_(OJ_BASE + '/CProperty?gubun=6&page_data_list=1'), '6');
  Logger.log('오일장 카드: ' + oj.length + '건' + (oj.length ? (' 예: ' + oj[0].apt + ' / ' + oj[0].addr) : ''));
  Logger.log('권한 검사(직원): ' + (function () {
    try { colAdmin_({ role: 'staff' }); return '❌ 통과되면 안 됨'; }
    catch (e) { return '✅ 막힘 — ' + e.message; }
  })());
}

/* ═══════════════════════════════════════════════════════════════════
   📈 아파트 실거래가 조회·분석 — 2026-09-07 신설
   ─────────────────────────────────────────────────────────────────
   바탕화면 '아파트_실거래가_조회분석.zip'(파이썬 GUI) 을 CRM 안으로 옮긴 것.
   원본이 하던 국토부 실거래가 API 호출을 그대로 쓴다 — 이미 CRM 에 있던
   rtmsFetch_() 를 지역코드(lawd)만 바꿔 재사용한다(키·캐시 공용).

   무엇을 하나
     · 아파트/오피스텔의 매매·전세·월세 실거래를 지역·기간으로 조회
     · 단지별 월별 평균가·거래량 추이(차트용 데이터)
   범위: 제주 기본, 필요하면 전국 시/군/구 선택(APT_REGIONS).
     🔴 조회는 언제나 '고른 지역 1곳'만 API 를 부른다 — 목록에 전국이 있어도
        느려지거나 캐시를 더 먹지 않는다(전국은 그냥 글자표일 뿐).

   되돌리기: 이 블록과 APT_REGIONS 를 지우고 action 라우팅(apt*)을 빼면 원래대로.
   ═══════════════════════════════════════════════════════════════════ */

var APT_REGIONS = {"제주특별자치도": {"제주시": "50110", "서귀포시": "50130"}, "서울특별시": {"종로구": "11110", "중구": "11140", "용산구": "11170", "성동구": "11200", "광진구": "11215", "동대문구": "11230", "중랑구": "11260", "성북구": "11290", "강북구": "11305", "도봉구": "11320", "노원구": "11350", "은평구": "11380", "서대문구": "11410", "마포구": "11440", "양천구": "11470", "강서구": "11500", "구로구": "11530", "금천구": "11545", "영등포구": "11560", "동작구": "11590", "관악구": "11620", "서초구": "11650", "강남구": "11680", "송파구": "11710", "강동구": "11740"}, "부산광역시": {"연제구": "26470", "동래구": "26260", "중구": "26110", "서구": "26140", "동구": "26170", "영도구": "26200", "부산진구": "26230", "남구": "26290", "북구": "26320", "해운대구": "26350", "사하구": "26380", "금정구": "26410", "강서구": "26440", "수영구": "26500", "사상구": "26530", "기장군": "26710"}, "대구광역시": {"중구": "27110", "동구": "27140", "서구": "27170", "남구": "27200", "북구": "27230", "수성구": "27260", "달서구": "27290", "달성군": "27710"}, "인천광역시": {"중구": "28110", "동구": "28140", "미추홀구": "28177", "연수구": "28185", "남동구": "28200", "부평구": "28237", "계양구": "28245", "서구": "28260", "강화군": "28710", "옹진군": "28720"}, "광주광역시": {"동구": "29110", "서구": "29140", "남구": "29155", "북구": "29170", "광산구": "29200"}, "대전광역시": {"동구": "30110", "중구": "30140", "서구": "30170", "유성구": "30200", "대덕구": "30230"}, "울산광역시": {"중구": "31110", "남구": "31140", "동구": "31170", "북구": "31200", "울주군": "31710"}, "세종특별자치시": {"세종시": "36110"}, "경기도": {"수원시": "41110", "성남시": "41130", "의정부시": "41150", "안양시": "41170", "부천시": "41190", "광명시": "41210", "평택시": "41220", "동두천시": "41250", "안산시": "41270", "고양시": "41280", "과천시": "41290", "구리시": "41310", "남양주시": "41360", "오산시": "41370", "시흥시": "41390", "군포시": "41410", "의왕시": "41430", "하남시": "41450", "용인시": "41460", "파주시": "41480", "이천시": "41500", "안성시": "41550", "김포시": "41570", "화성시": "41590", "광주시": "41610", "양주시": "41630", "포천시": "41650", "여주시": "41670", "연천군": "41800", "가평군": "41820", "양평군": "41830"}, "충청남도": {"천안시 서북구": "44133", "천안시 동남구": "44131", "아산시": "44200", "공주시": "44150", "보령시": "44180", "서산시": "44210", "논산시": "44230", "계룡시": "44250", "당진시": "44270", "금산군": "44710", "부여군": "44760", "서천군": "44770", "청양군": "44790", "홍성군": "44800", "예산군": "44810", "태안군": "44825"}, "충청북도": {"청주시 상당구": "43111", "청주시 서원구": "43112", "청주시 흥덕구": "43113", "청주시 청원구": "43114", "충주시": "43130", "제천시": "43150", "보은군": "43720", "옥천군": "43730", "영동군": "43740", "진천군": "43750", "괴산군": "43760", "음성군": "43770", "단양군": "43800"}, "경상남도": {"창원시 의창구": "48121", "창원시 성산구": "48123", "창원시 마산합포구": "48125", "창원시 마산회원구": "48127", "창원시 진해구": "48129", "진주시": "48170", "통영시": "48220", "사천시": "48240", "김해시": "48250", "밀양시": "48270", "거제시": "48310", "양산시": "48330"}};

// 종류·거래유형 → 국토부 서비스 이름 (priceCheck_ 와 같은 규칙)
function aptSvc_(kind, type) {
  var isSale = (type === '매매');
  if (/오피스텔/.test(kind)) return isSale ? 'RTMSDataSvcOffiTrade' : 'RTMSDataSvcOffiRent';
  return isSale ? 'RTMSDataSvcAptTrade' : 'RTMSDataSvcAptRent';   // 아파트·분양권 기본
}

// 최근 N개월 목록 'yyyyMM' (오늘 기준, 과거로)
function aptMonths_(n) {
  var out = [], now = new Date();
  for (var i = 0; i < n; i++) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(Utilities.formatDate(d, 'Asia/Seoul', 'yyyyMM'));
  }
  return out;
}

function aptNorm_(s) { return String(s || '').replace(/[\s()·\-]/g, ''); }

// 한 지역·기간의 실거래를 모두 받아 표준 배열로. (전월세는 rent=0 이면 전세)
function aptCollect_(lawd, svc, months) {
  var all = [], err = '';
  for (var i = 0; i < months.length; i++) {
    var r = rtmsFetch_(svc, months[i], lawd);
    if (r.err) { err = r.err; continue; }
    for (var k = 0; k < r.items.length; k++) all.push(r.items[k]);
  }
  return { items: all, err: err };
}

/* 조회: {sido, gugun | lawd, kind, type, q(단지명), months} → 표 + 요약 */
function aptSearch_(p) {
  p = p || {};
  var lawd = String(p.lawd || '');
  if (!lawd && p.sido && p.gugun) lawd = ((APT_REGIONS[p.sido] || {})[p.gugun]) || '';
  if (!lawd) return { ok: false, why: '지역을 고르세요' };
  if (!/^\d{5}$/.test(lawd)) return { ok: false, why: '지역코드가 이상합니다: ' + lawd };

  var kind = String(p.kind || '아파트');
  var type = String(p.type || '매매');
  var svc = aptSvc_(kind, type);
  var nMonths = Math.min(Math.max(parseInt(p.months, 10) || 6, 1), 12);
  var months = aptMonths_(nMonths);
  var got = aptCollect_(lawd, svc, months);
  if (!got.items.length && got.err) return { ok: false, why: got.err };

  var q = aptNorm_(p.q);
  var isSale = (type === '매매'), isJeonse = (type === '전세');
  var rows = [];
  for (var i = 0; i < got.items.length; i++) {
    var it = got.items[i];
    if (q) { var n = aptNorm_(it.name); if (!(n.indexOf(q) >= 0 || q.indexOf(n) >= 0)) continue; }
    // 전세=보증금만(월세 0) / 월세=월세>0 / 매매=거래금액
    var val, label;
    if (isSale) { if (!(it.deal > 0)) continue; val = it.deal; label = priceMan_(it.deal); }
    else if (isJeonse) { if (!(it.deposit > 0 && it.rent === 0)) continue; val = it.deposit; label = priceMan_(it.deposit); }
    else { if (!(it.rent > 0)) continue; val = Math.round(it.deposit * 0.005 + it.rent); label = priceMan_(it.deposit) + '/' + it.rent; }
    rows.push({ ym: it.ym, name: it.name, dong: it.dong, area: it.area,
                floor: it.floor, val: val, label: label,
                deal: it.deal, deposit: it.deposit, rent: it.rent });
  }
  // 최신순
  rows.sort(function (a, b) { return String(b.ym).localeCompare(String(a.ym)) || b.val - a.val; });

  // 요약(평균·중위·최고·최저)
  var summary = null;
  if (rows.length) {
    var vals = rows.map(function (r) { return r.val; }).sort(function (a, b) { return a - b; });
    var sum = 0; for (var v = 0; v < vals.length; v++) sum += vals[v];
    var med = vals.length % 2 ? vals[(vals.length - 1) / 2]
                              : Math.round((vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2);
    summary = {
      n: rows.length, avg: Math.round(sum / vals.length), med: med,
      min: vals[0], max: vals[vals.length - 1],
      avgLabel: aptValLabel_(Math.round(sum / vals.length), type),
      medLabel: aptValLabel_(med, type),
      minLabel: aptValLabel_(vals[0], type),
      maxLabel: aptValLabel_(vals[vals.length - 1], type)
    };
  }
  return { ok: true, lawd: lawd, kind: kind, type: type, months: nMonths,
           count: rows.length, rows: rows.slice(0, 500), summary: summary, err: got.err };
}

function aptValLabel_(v, type) {
  return (type === '월세') ? ('월 환산 ' + v + '만') : priceMan_(v);
}

/* 추이: 같은 조건에서 월별 평균가·거래량 (차트용). q(단지명) 있으면 그 단지만 */
function aptTrend_(p) {
  p = p || {};
  var lawd = String(p.lawd || '');
  if (!lawd && p.sido && p.gugun) lawd = ((APT_REGIONS[p.sido] || {})[p.gugun]) || '';
  if (!/^\d{5}$/.test(lawd)) return { ok: false, why: '지역을 고르세요' };
  var kind = String(p.kind || '아파트'), type = String(p.type || '매매');
  var svc = aptSvc_(kind, type);
  var nMonths = Math.min(Math.max(parseInt(p.months, 10) || 12, 3), 24);
  var months = aptMonths_(nMonths).slice().reverse();     // 과거→현재 순
  var q = aptNorm_(p.q);
  var isSale = (type === '매매'), isJeonse = (type === '전세');
  var myArea = parseFloat(p.area) || 0;
  var areaOk = function (a) { return !myArea || !a || Math.abs(a - myArea) <= Math.max(4, myArea * 0.12); };

  var series = [];
  for (var m = 0; m < months.length; m++) {
    var r = rtmsFetch_(svc, months[m], lawd);
    var vals = [];
    if (r.items) {
      for (var i = 0; i < r.items.length; i++) {
        var it = r.items[i];
        if (q) { var n = aptNorm_(it.name); if (!(n.indexOf(q) >= 0 || q.indexOf(n) >= 0)) continue; }
        if (!areaOk(it.area)) continue;
        var val;
        if (isSale) { if (!(it.deal > 0)) continue; val = it.deal; }
        else if (isJeonse) { if (!(it.deposit > 0 && it.rent === 0)) continue; val = it.deposit; }
        else { if (!(it.rent > 0)) continue; val = Math.round(it.deposit * 0.005 + it.rent); }
        vals.push(val);
      }
    }
    var avg = 0;
    if (vals.length) { var s = 0; for (var v = 0; v < vals.length; v++) s += vals[v]; avg = Math.round(s / vals.length); }
    var ymLabel = months[m].slice(0, 4) + '-' + months[m].slice(4);
    series.push({ ym: ymLabel, avg: avg, count: vals.length });
  }
  return { ok: true, lawd: lawd, kind: kind, type: type, q: p.q || '', series: series };
}

// 지역 목록(화면 드롭다운용) — 제주가 맨 앞
function aptRegions_() { return APT_REGIONS; }

/* ═══════════════════════════════════════════════════════════════════
   👥 직원 계정 관리 — 2026-09-08 신설, 대표(마스터) 전용
   ─────────────────────────────────────────────────────────────────
   종전: 직원 계정은 GAS 편집기에서 addStaffAccount() 를 손으로 고쳐 실행해야만
        만들 수 있었다(사장님이 직접 못 함, 링크도 옛 넷리파이 주소로 찍힘).
   이제: CRM 화면 [👥 직원 관리]에서 발급·접속링크 복사·삭제.
        저장소는 종전과 같은 스크립트 속성 STAFF_TOKENS = { 토큰: {id, name} } 그대로라
        기존에 발급한 직원 계정도 그대로 보인다. resolveUser_() 는 손대지 않았다.
   🔴 세 액션 모두 adminOnly_ — 직원 토큰으로는 목록도 못 본다.
   🔴 접속 링크는 화면(index.html staffLink)이 현재 사이트 주소로 만든다 — GAS 에 주소 하드코딩 없음.
   되돌리기: 이 블록과 doPost 의 staff* 3줄 삭제. STAFF_TOKENS 는 종전 방식과 호환.
   ═══════════════════════════════════════════════════════════════════ */
function adminOnly_(user, what) {
  if (!user || user.role !== 'admin') {
    throw new Error((what || '이 기능') + '은(는) 대표(마스터)만 사용할 수 있습니다');
  }
  return user;
}

function staffMap_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('STAFF_TOKENS') || '{}'); }
  catch (e) { return {}; }
}
function staffMapSet_(map) {
  PropertiesService.getScriptProperties().setProperty('STAFF_TOKENS', JSON.stringify(map));
}
// staff_yyMMddHHmmss → '2026-09-08 04:15'
function staffCreatedAt_(id) {
  var m = /^staff_(\d{12})/.exec(String(id || ''));
  if (!m) return '';
  var s = m[1];
  return '20' + s.slice(0, 2) + '-' + s.slice(2, 4) + '-' + s.slice(4, 6) + ' ' + s.slice(6, 8) + ':' + s.slice(8, 10);
}

function staffList(user) {
  adminOnly_(user, '직원 관리');
  var map = staffMap_(), out = [];
  for (var t in map) {
    out.push({ id: String(map[t].id || ''), name: String(map[t].name || ''),
               token: t, createdAt: staffCreatedAt_(map[t].id) });
  }
  out.sort(function (a, b) { return String(b.id).localeCompare(String(a.id)); });   // 최신 먼저
  return out;
}

function staffAdd(user, name) {
  adminOnly_(user, '직원 관리');
  name = String(name || '').trim();
  if (!name) throw new Error('직원 이름을 입력하세요');
  if (name.length > 20) throw new Error('이름은 20자 이내로');
  var map = staffMap_();
  for (var t in map) {
    if (String(map[t].name || '') === name) throw new Error('같은 이름의 직원이 이미 있습니다: ' + name);
  }
  var token = Utilities.getUuid().replace(/-/g, '');
  var base = 'staff_' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyMMddHHmmss');
  var sid = base, n = 2;
  var taken = function (id) { for (var k in map) if (String(map[k].id) === id) return true; return false; };
  while (taken(sid)) sid = base + '_' + (n++);          // 같은 초에 두 번 눌러도 안 겹치게
  map[token] = { id: sid, name: name };
  staffMapSet_(map);
  try { logChange('staff', 'add', name + ' (' + sid + ')'); } catch (e) {}
  return { id: sid, name: name, token: token, createdAt: staffCreatedAt_(sid) };
}

function staffRevoke(user, id) {
  adminOnly_(user, '직원 관리');
  var map = staffMap_(), hit = null;
  for (var t in map) {
    if (String(map[t].id) === String(id)) { hit = { token: t, name: String(map[t].name || '') }; break; }
  }
  if (!hit) return { removed: false, why: '해당 계정이 없습니다' };
  delete map[hit.token];
  staffMapSet_(map);
  try { logChange('staff', 'revoke', hit.name + ' (' + id + ')'); } catch (e) {}
  return { removed: true, id: String(id), name: hit.name };
}

/* ═══════════════════════════════════════════════════════════════════
   📞 CTI 팝업 — 2026-09-08 신설 (직원 즉시 실무 2단계)
   ─────────────────────────────────────────────────────────────────
   무엇: 폰(MacroDroid)이 **전화가 울리는 순간** GET 으로 묻는다 →
         이 번호가 임대인/고객/리드인지, 마지막 연락·다음 할 일·맞는 매물 수·최근 인입 1건을
         200자 안팎 한글 요약으로 돌려준다 → 폰이 그 글을 알림으로 띄운다.
   왜:   외근 중 전화를 받을 때 "누구지?"를 CRM 열지 않고 3초 안에 안다. 응대 속도 = 계약.
   통로: 규칙 17 과 같은 방식(쿼리 파라미터 GET). ?action=callPop&fmt=text&phone=…&token=…
         fmt=text 면 JSON 이 아니라 **글 그대로**(MacroDroid 가 파싱 없이 알림에 넣게).
   권한: 토큰만 있으면(직원 포함). 직원 토큰이면 임대인 이름은 maskName_ — 기존 임대인 마스킹 정책 그대로.
   기록: 변경이력에 남기지 않는다(전화마다 쌓이면 소음). 통화가 끝나면 기존 callEnd/missedCall 이 인입함에 적는다.
   재사용: smsPhoneKey_/smsFmtPhone_(번호 정규화), maskName_, getOrCreateSheet, HEADERS 칼럼명.
   되돌리기: 이 블록 + doGet 의 callPop 4줄 삭제. 데이터 변경 없음(읽기 전용 액션).
   ═══════════════════════════════════════════════════════════════════ */
var CALLPOP_MAX_CHARS = 320;

// 시트에서 전화 칸의 토큰(쉼표·슬래시·공백 구분) 중 하나가 key 와 같은 첫 행을 헤더 이름 → 값 객체로
function callPopFind_(type, phoneCol, key) {
  try {
    var v = getOrCreateSheet(type).getDataRange().getValues();
    if (v.length < 2) return null;
    var h = v[0].map(String), pi = h.indexOf(phoneCol);
    if (pi < 0) return null;
    for (var i = 1; i < v.length; i++) {
      var cell = String(v[i][pi] || '');
      // 🔴 공백만으로 자르면 '+82 10-3333-4444' 가 '+82' 와 '10-3333-4444' 로 갈라져 못 찾는다(검산에서 잡음).
      //    쉼표류로만 자른 후보 + 공백까지 자른 후보를 둘 다 본다 → 한 칸에 번호 여러 개도, 번호 안 공백도 된다.
      var toks = cell.split(/[,\/;·]+/).concat(cell.split(/[,\/;·\s]+/));
      for (var t = 0; t < toks.length; t++) {
        if (toks[t] && smsPhoneKey_(toks[t]) === key) {
          var o = {};
          for (var c = 0; c < h.length; c++) o[h[c]] = v[i][c];
          return o;
        }
      }
    }
  } catch (e) {}
  return null;
}

function callPopStr_(v, n) {
  var s = String(v === undefined || v === null ? '' : v).replace(/\s+/g, ' ').trim();
  if (n && s.length > n) s = s.slice(0, n) + '…';
  return s;
}
function callPopDate_(v) {                     // Date 든 문자열이든 'MM-dd'
  if (v && typeof v.getTime === 'function') return Utilities.formatDate(v, 'Asia/Seoul', 'MM-dd');
  var s = String(v || ''); var m = /(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? (m[2] + '-' + m[3]) : callPopStr_(s, 10);
}

// 고객의 희망(거래유형·종류)과 맞는 '접수/공실' 매물 수 — 화면 매칭(custMatchListings)의 가벼운 서버판
function callPopMatchCount_(type, kind) {
  try {
    var v = getOrCreateSheet('listings').getDataRange().getValues();
    if (v.length < 2) return 0;
    var h = v[0].map(String), iS = h.indexOf('status'), iT = h.indexOf('type'), iK = h.indexOf('kind');
    var rentish = function (t) { return /월세|연세|단기/.test(String(t || '')); };
    var n = 0;
    for (var i = 1; i < v.length; i++) {
      var st = String(v[i][iS] || '').trim();
      if (st && st !== '접수' && st !== '공실') continue;
      if (type) { var lt = String(v[i][iT] || ''); if (!(lt === type || (rentish(type) && rentish(lt)))) continue; }
      if (kind && String(v[i][iK] || '').indexOf(kind) < 0) continue;
      n++;
    }
    return n;
  } catch (e) { return 0; }
}

// 인입함에서 이 번호의 가장 최근 1건 — 칸 배치는 smsInboxRow_ 와 같다(D 등록일·E 경로·H 전화·V 상담내용)
function callPopLastInbox_(key) {
  try {
    var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName('인입함');
    if (!sh) return null;
    var v = sh.getDataRange().getValues();
    for (var i = v.length - 1; i >= 1; i--) {
      if (smsPhoneKey_(v[i][7]) === key) {
        return { when: callPopDate_(v[i][3]), kind: callPopStr_(v[i][4], 8), text: callPopStr_(v[i][21], 50) };
      }
    }
  } catch (e) {}
  return null;
}

function callPop_(p, user) {
  p = p || {};
  var phone = String(p.phone || p.number || p.sender || '').trim();
  if (!phone) return { found: false, text: '📞 번호 없음' };
  var key = smsPhoneKey_(phone);
  if (key.length < 9) return { found: false, text: '📞 ' + callPopStr_(phone, 20) + ' (번호 형식 이상)' };
  var isStaff = !!(user && user.role === 'staff');
  var fmt = smsFmtPhone_(phone);
  var lines = [], role = '', name = '', found = false;

  var ll = callPopFind_('landlords', 'phone', key);
  if (ll) {
    found = true; role = '임대인';
    name = isStaff ? maskName_(ll.name) : callPopStr_(ll.name, 12);
    lines.push('👤 ' + (name || '이름없음') + ' · 임대인');
    var where = [callPopStr_(ll.apt, 16), callPopStr_(ll.addr, 20)].filter(String).join(' ');
    if (where) lines.push('🏠 ' + where);
    var lc = ll.lastContact ? callPopDate_(ll.lastContact) : '', nc = ll.nextContact ? callPopDate_(ll.nextContact) : '';
    if (lc || nc) lines.push('📅 마지막 ' + (lc || '-') + ' · 다음 ' + (nc || '-'));
    if (ll.note) lines.push('📝 ' + callPopStr_(ll.note, 60));
  }
  if (!found) {
    var li = callPopFind_('listings', 'cphone', key);          // 매물에 적힌 임대인 연락처
    if (li) {
      found = true; role = '임대인';
      name = isStaff ? maskName_(li.cname) : callPopStr_(li.cname, 12);
      lines.push('👤 ' + (name || '이름없음') + ' · 매물 임대인');
      lines.push('🏠 ' + [callPopStr_(li.id, 12), callPopStr_(li.apt, 16), callPopStr_(li.addr2, 10)].filter(String).join(' ')
                 + (li.status ? ' · ' + callPopStr_(li.status, 6) : ''));
      if (li.price || li.rentAmt) lines.push('💰 ' + [callPopStr_(li.type, 4), callPopStr_(li.price, 12) + (li.rentAmt ? '/' + callPopStr_(li.rentAmt, 8) : '')].filter(String).join(' '));
    }
  }
  if (!found) {
    var cu = callPopFind_('customers', 'phone', key);
    if (cu) {
      found = true; role = callPopStr_(cu.role, 6) || '고객';
      name = callPopStr_(cu.name, 12);
      lines.push('👤 ' + (name || '이름없음') + ' · ' + role + (cu.step !== '' && cu.step !== undefined ? ' · 단계 ' + callPopStr_(cu.step, 4) : ''));
      var want = [callPopStr_(cu.type, 6), callPopStr_(cu.propType, 10), callPopStr_(cu.region, 14), cu.budget ? '예산 ' + callPopStr_(cu.budget, 12) : ''].filter(String).join(' ');
      if (want) lines.push('🎯 ' + want);
      if (cu.nextAction) lines.push('📌 다음 ' + callPopStr_(cu.nextAction, 40));
      if (cu.conApt) lines.push('🏠 계약 ' + callPopStr_(cu.conApt, 16));
      var n = callPopMatchCount_(callPopStr_(cu.type, 6), callPopStr_(cu.propType, 10));
      if (n) lines.push('🔎 맞는 매물 ' + n + '건');
    }
  }
  if (!found) {
    var ld = callPopFind_('leads', 'phone', key);
    if (ld) {
      found = true; role = '리드';
      name = callPopStr_(ld.name, 12);
      lines.push('👤 ' + (name || '이름없음') + ' · 문의고객(리드)' + (ld.status ? ' · ' + callPopStr_(ld.status, 8) : ''));
      if (ld.interest) lines.push('🎯 ' + callPopStr_(ld.interest, 40));
    }
  }
  var last = callPopLastInbox_(key);
  if (last) lines.push('📨 최근 ' + last.when + ' ' + last.kind + ': ' + last.text);
  if (!found) {
    lines.unshift('🆕 미등록 번호 ' + fmt);
    if (!last) lines.push('통화가 끝나면 인입함에 자동 기록됩니다');
  }
  var text = lines.join('\n');
  if (text.length > CALLPOP_MAX_CHARS) text = text.slice(0, CALLPOP_MAX_CHARS - 1) + '…';
  return { found: found, role: role, name: name, phone: fmt, text: text };
}

/* ═══════════════════════════════════════════════════════════════════
   ⚖ 이상거래 탐지 — 2026-09-08 신설 (직원 즉시 실무 3단계 · SaaS 기획서 PART2)
   ─────────────────────────────────────────────────────────────────
   무엇: 계약서를 쓸 때 그 금액이 같은 단지(없으면 같은 동)·같은 면적대의 최근 12개월
         국토부 신고 실거래 분포와 비교해 GREEN / AMBER / RED / HOLD 로 판정한다.
         판정 기준(사분위): Q1·Q3·IQR=Q3−Q1, 하한 L=Q1−1.5IQR, 상한 U=Q3+1.5IQR, 중위 M 대비 이탈율 r.
           RED   = V<Q1−3IQR 또는 V>Q3+3IQR 또는 |r|≥30%   (업/다운 계약 강한 의심)
           AMBER = V<L 또는 V>U 또는 |r|≥15%
           GREEN = 그 외 / HOLD = 표본<5건·금액 없음·비공개 유형(원룸·다가구·상가)
           표본 5~7건이면 RED 금지(AMBER 상한) — 소표본 오탐 방지.
   추적: 매매 계약은 이후 신고 데이터를 매일 대조해 REPORTED / REGISTERED / CANCELLED(해제=가장거래 의심)
         / REGISTRY_DELAY(신고 90일 지나도 등기 없음) / REPORT_MISSING(60일 지나도 신고 없음) 으로 표시.
         checkExpiryDaily(09시)에 얹어 돈다 — 새 트리거 설치 불필요.
   재사용: rtmsFetch_(국토부 파서, 캐시)·priceNorm_·priceMan_·isjMoney_·aptMonths_·getAllData·upsertRow.
   저장: HEADERS.contracts 끝 11칸(riskGrade…trackAt). 화면(계약서 작성기)이 등록 시 함께 넣는다.
   게이트: 기본 '경고만'. 스크립트 속성 RISK_BLOCK_RED=true 면 RED 를 직원이 등록 못 하고 대표만 가능.
   🔴 법적 판단이 아니라 참고자료 — 화면·응답에 그 문구를 항상 붙인다.
   되돌리기: 이 블록 + doGet riskCheck / doPost riskSweep / checkExpiryDaily 의 try 1줄 + HEADERS 11칸.
   ═══════════════════════════════════════════════════════════════════ */
var RISK_MONTHS = 12;
var RISK_MIN_N = 5;            // 이보다 적으면 HOLD
var RISK_SMALL_N = 8;          // 이보다 적으면 RED 금지
var RISK_AMBER_PCT = 0.15;
var RISK_RED_PCT = 0.30;
var RISK_TRACK_DAYS = 180;     // 매매 계약 추적 기간
var RISK_REPORT_DAYS = 60;     // 신고 없으면 REPORT_MISSING
var RISK_REG_DAYS = 90;        // 등기 없으면 REGISTRY_DELAY
var RISK_MATCH_PCT = 0.03;     // 신고 금액 매칭 허용 오차

function riskSvc_(kind, type) {
  var k = String(kind || '');
  if (/아파트|분양권/.test(k)) return type === '매매' ? 'RTMSDataSvcAptTrade' : 'RTMSDataSvcAptRent';
  if (/오피스텔/.test(k)) return type === '매매' ? 'RTMSDataSvcOffiTrade' : 'RTMSDataSvcOffiRent';
  return '';
}

// 소재지 글에서 단지명 후보 — '제주시 노형동 ○○아파트 101동 1001호' → '○○아파트'
function riskAptGuess_(addr) {
  // 브랜드 목록에 있으면 그것을, 없으면 "숫자로 시작하지 않고·동/읍/면/리/시로 끝나지 않는 가장 긴 토큰"을 단지명으로 본다.
  // (목록만 믿으면 '중흥S-클래스'처럼 목록에 없는 이름을 놓친다 — 검산에서 잡음)
  var toks = String(addr || '').replace(/[(),]/g, ' ').split(/\s+/), best = '', fallback = '';
  var re = /(아파트|오피스텔|빌라|빌|타운|캐슬|자이|힐스|파크|팰리스|더샵|푸르지오|래미안|아이파크|센트럴|편한|리버|마을|단지|하우스|맨션|주공|휴먼시아|부영|한화|현대|삼성|롯데|대림|코아루|스위첸|위브|리체|해모로|클래스)/;
  for (var i = 0; i < toks.length; i++) {
    var t = toks[i];
    if (!t || /^\d/.test(t)) continue;                                   // 번지·동번호·호수·층
    if (/(동|읍|면|리|시|도)$/.test(t) && !re.test(t)) continue;         // 행정구역
    if (/(호|층|번지|길|로)$/.test(t) && /\d/.test(t)) continue;
    if (re.test(t)) { if (t.length > best.length) best = t; }
    else if (t.length >= 3 && t.length > fallback.length) fallback = t;
  }
  return best || fallback;
}

// 계약 금액 → 비교값(만원). 매매=매매가, 전세=보증금, 월세=보증금×0.005+월세 (priceCheck_ 와 동일)
function riskValue_(type, price, rentAmt) {
  var p = parseInt(isjMoney_(price), 10) || 0;
  var r = parseInt(isjMoney_(rentAmt), 10) || 0;
  if (type === '매매' || type === '전세') return p;
  if (!p && !r) return 0;
  return Math.round(p * 0.005 + r);
}

// 사분위 통계
function riskStats_(vals) {
  var v = vals.slice().sort(function (a, b) { return a - b; }), n = v.length;
  var q = function (p) { var pos = (n - 1) * p, lo = Math.floor(pos), hi = Math.ceil(pos); return lo === hi ? v[lo] : Math.round(v[lo] + (v[hi] - v[lo]) * (pos - lo)); };
  var M = q(0.5), Q1 = q(0.25), Q3 = q(0.75), IQR = Q3 - Q1;
  return { n: n, M: M, Q1: Q1, Q3: Q3, IQR: IQR, L: Q1 - 1.5 * IQR, U: Q3 + 1.5 * IQR, min: v[0], max: v[n - 1] };
}

function riskGrade_(V, st) {
  var r = st.M ? (V - st.M) / st.M : 0;
  var iqr = st.IQR > 0;
  var grade = 'GREEN', code = 'IN_RANGE';
  if ((iqr && V < st.Q1 - 3 * st.IQR) || r <= -RISK_RED_PCT)      { grade = 'RED';   code = 'DOWN_SEVERE'; }
  else if ((iqr && V > st.Q3 + 3 * st.IQR) || r >= RISK_RED_PCT)  { grade = 'RED';   code = 'UP_SEVERE'; }
  else if ((iqr && V < st.L) || r <= -RISK_AMBER_PCT)             { grade = 'AMBER'; code = 'DOWN_OUTLIER'; }
  else if ((iqr && V > st.U) || r >= RISK_AMBER_PCT)              { grade = 'AMBER'; code = 'UP_OUTLIER'; }
  if (st.n < RISK_SMALL_N && grade === 'RED') { grade = 'AMBER'; code += '_SMALL'; }
  return { grade: grade, code: code, r: Math.round(r * 1000) / 10 };
}

function riskWhy_(g, st, label) {
  var dir = g.r < 0 ? '낮음' : '높음';
  var base = '중위 ' + label(st.M) + ' 대비 ' + (g.r > 0 ? '+' : '') + g.r + '% ' + dir;
  if (g.grade === 'RED')   return base + ' — ' + (g.r < 0 ? '다운계약' : '업계약') + ' 강한 의심. 대표 확인 후 진행하세요.';
  if (g.grade === 'AMBER') return base + ' — 실거래 정상범위 밖. 사유(층·향·급매·리모델링 등)를 확인해 두세요.';
  return base + ' — 실거래 범위 안입니다.';
}

function riskCheck_(p) {
  p = p || {};
  var type = String(p.type || '').trim(), kind = String(p.kind || '').trim();
  var svc = riskSvc_(kind, type);
  var blockRed = String(PropertiesService.getScriptProperties().getProperty('RISK_BLOCK_RED') || '') === 'true';
  var note = '국토부 신고 실거래 기준 참고자료이며 법적 판단이 아닙니다';
  if (!svc) return { supported: false, grade: 'HOLD', code: 'NO_PUBLIC_DATA', kind: kind, type: type, blockRed: blockRed, note: note,
                     why: '아파트·오피스텔만 실거래 신고 데이터가 공개됩니다 (' + (kind || '종류 없음') + ')' };
  var V = riskValue_(type, p.price, p.rentAmt);
  if (!V) return { supported: true, grade: 'HOLD', code: 'NO_AMOUNT', kind: kind, type: type, blockRed: blockRed, note: note,
                   why: '금액(' + String(p.price || '') + ')을 숫자로 읽지 못했습니다' };
  var lawd = String(p.lawd || '').trim();
  if (!/^\d{5}$/.test(lawd)) lawd = /서귀포/.test(String(p.addr || '')) ? '50130' : RTMS_LAWD;
  var months = aptMonths_(RISK_MONTHS), all = [], err = '';
  for (var mi = 0; mi < months.length; mi++) {
    var r = rtmsFetch_(svc, months[mi], lawd);
    if (r.err) { err = r.err; continue; }
    for (var k = 0; k < r.items.length; k++) all.push(r.items[k]);
  }
  var apt = String(p.apt || '').trim() || riskAptGuess_(p.addr);
  var nApt = priceNorm_(apt);
  var myDong = (String(p.addr || '').match(/([가-힣]+(?:동|읍|면|리))(?=\s|$)/) || [])[1] || '';
  var myArea = parseFloat(p.area) || 0;
  var areaOk = function (a) { return !myArea || !a || Math.abs(a - myArea) <= Math.max(4, myArea * 0.12); };
  var isSale = type === '매매', isJeonse = type === '전세';
  var valOf = function (it) {
    if (isSale) return it.deal > 0 ? it.deal : 0;
    if (isJeonse) return (it.rent === 0 && it.deposit > 0) ? it.deposit : 0;
    return it.rent > 0 ? Math.round(it.deposit * 0.005 + it.rent) : 0;
  };
  var cands = [], scope = '';
  if (nApt) {
    cands = all.filter(function (it) { var n = priceNorm_(it.name); return n && (n.indexOf(nApt) >= 0 || nApt.indexOf(n) >= 0) && areaOk(it.area); });
    scope = '같은 단지 ' + apt;
  }
  if (cands.length < RISK_SMALL_N && myDong) {
    var more = all.filter(function (it) { return it.dong === myDong && areaOk(it.area); });
    if (more.length > cands.length) { cands = more; scope = myDong + ' 동일 면적대'; }
  }
  var vals = [];
  for (var c = 0; c < cands.length; c++) { var v = valOf(cands[c]); if (v > 0) vals.push(v); }
  var label = function (v) { return (isSale || isJeonse) ? priceMan_(v) : '월 환산 ' + v + '만'; };
  if (vals.length < RISK_MIN_N) {
    return { supported: true, grade: 'HOLD', code: 'SMALL_SAMPLE', n: vals.length, scope: scope || '조건 일치 없음',
             kind: kind, type: type, lawd: lawd, months: RISK_MONTHS, apt: apt, V: V, labels: { V: label(V) }, err: err, blockRed: blockRed, note: note,
             why: '비교할 실거래가 ' + vals.length + '건뿐이라 판정을 보류합니다(최소 ' + RISK_MIN_N + '건)' + (err ? ' · ' + err : '') };
  }
  var st = riskStats_(vals), g = riskGrade_(V, st);
  return { supported: true, grade: g.grade, code: g.code, r: g.r, n: st.n, M: st.M, Q1: st.Q1, Q3: st.Q3, L: st.L, U: st.U, V: V,
           labels: { V: label(V), M: label(st.M), Q1: label(st.Q1), Q3: label(st.Q3) },
           scope: scope, months: RISK_MONTHS, lawd: lawd, kind: kind, type: type, apt: apt, err: err, blockRed: blockRed, note: note,
           why: riskWhy_(g, st, label) };
}

/* ── 매매 계약 사후 추적 (매일, checkExpiryDaily 에 동승) ─────────────── */
function riskDate_(s) {
  var m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
function riskYm_(d) { return d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2); }

// 계약 1건의 추적 상태를 계산 (순수 함수 — 검산 대상)
function riskTrackState_(c, items, now) {
  var at = riskDate_(c.riskAt);
  if (!at) return null;
  var days = Math.floor((now.getTime() - at.getTime()) / 86400000);
  if (days < 0 || days > RISK_TRACK_DAYS) return null;
  var V = parseInt(c.riskV, 10) || 0;
  if (!V) return null;
  var nApt = priceNorm_(riskAptGuess_(c.apt) || c.apt);
  var hit = null;
  for (var i = 0; i < items.length; i++) {
    var it = items[i], n = priceNorm_(it.name);
    if (!n || !nApt || !(n.indexOf(nApt) >= 0 || nApt.indexOf(n) >= 0)) continue;
    if (!(it.deal > 0) || Math.abs(it.deal - V) > V * RISK_MATCH_PCT) continue;
    if (!hit || String(it.cdealType) === 'O') hit = it;            // 해제 기록이 있으면 그것을 우선
  }
  if (hit) {
    if (String(hit.cdealType || '') === 'O') return 'CANCELLED';
    if (String(hit.rgstDate || '').trim()) return 'REGISTERED';
    return days > RISK_REG_DAYS ? 'REGISTRY_DELAY' : 'REPORTED';
  }
  return days > RISK_REPORT_DAYS ? 'REPORT_MISSING' : 'PENDING';
}

function riskSweepDaily() {
  var contracts = getAllData('contracts', null) || [];
  var now = new Date(), checked = 0, changed = 0, states = {};
  var sys = { role: 'admin', id: 'system', name: '이상거래추적' };
  for (var i = 0; i < contracts.length; i++) {
    var c = contracts[i];
    if (String(c.type || '') !== '매매') continue;
    if (!riskSvc_(c.riskKind, '매매')) continue;
    if (c.trackState === 'REGISTERED' || c.trackState === 'CANCELLED') continue;
    var at = riskDate_(c.riskAt);
    if (!at) continue;
    var lawd = /서귀포/.test(String(c.apt || '')) ? '50130' : RTMS_LAWD;
    var next = new Date(at.getFullYear(), at.getMonth() + 1, 1);
    var items = [];
    var yms = [riskYm_(at), riskYm_(next)];
    for (var m = 0; m < yms.length; m++) {
      var r = rtmsFetch_(riskSvc_(c.riskKind, '매매'), yms[m], lawd);
      if (r.items) items = items.concat(r.items);
    }
    var st = riskTrackState_(c, items, now);
    if (!st) continue;
    checked++;
    states[st] = (states[st] || 0) + 1;
    if (st !== String(c.trackState || '')) {
      c.trackState = st;
      c.trackAt = nowStr_();
      withWriteLock_(function () { upsertRow('contracts', c, sys); });      // 🔴 전체 행 객체(규칙 9)
      changed++;
    }
  }
  try { logChange('risk', 'sweep', '점검 ' + checked + '건 / 변경 ' + changed + '건 ' + JSON.stringify(states)); } catch (e) {}
  return { checked: checked, changed: changed, states: states };
}

/* ═══════════════════════════════════════════════════════════════════
   🏢 복제형 SaaS 온보딩 (S2) — 2026-09-08 신설 (SaaS 기획서 §0 로드맵 S2)
   ─────────────────────────────────────────────────────────────────
   사무소 1곳 = 시트 1장 + GAS 웹앱 1개(같은 코드) + 토큰 묶음. 코드는 1벌, 데이터는 완전 분리.
   절차(onboard-tenant.ps1):
     ① 마스터 tenantSheetCreate → 브리즈 시트를 복제하고 데이터를 비운다(헤더·운영 탭만 남김)
     ② clasp create 로 새 GAS 프로젝트 → 같은 google_apps_script.js push → deploy(웹앱 URL)
     ③ 새 웹앱에 tenantSetup(시트ID·토큰) 1회 — 그 뒤엔 잠긴다
     ④ 자동연결 링크(사이트#gs=<새 URL>&tk=<토큰>) 출력 → 새 사무소 대표가 열면 끝
   🔴 잠금(tenantLocked_): API_TOKEN 이 없는 배포는 tenantSetup 외 모든 요청을 거절한다.
      (종전 resolveUser_ 는 API_TOKEN 이 없으면 누구나 admin 으로 봤다 — 새 사무소가 설정 전 노출되는 구멍)
   🔴 SHEET_ID 기본값(브리즈 원본)은 API_TOKEN 이 있는 배포에서만 — 새 사무소가 남의 시트를 열지 않게.
   되돌리기: 이 블록 + doGet/doPost 잠금 3곳 + SHEET_ID 선언을 원래 상수로.
   ═══════════════════════════════════════════════════════════════════ */
// 새 사무소 시트에 남길 탭 — 나머지(백업탭·스냅샷·수집매물 등)는 지운다(수집매물은 첫 수집 때 다시 생김)
var TENANT_KEEP_TABS = ['매물관리', '고객관리', '임대인관리', '계약완료', '고객리드', '발급요청', '음성메모', '변경이력',
                        '삭제로그', '인입함', '문자수신함', '공실현황', '공실확인발송', '일정알림', '자동응답로그', '제외번호', '만기알림로그',
                        '브랜드자산', '결재함'];

function tenantLocked_() {
  try { return !String(PropertiesService.getScriptProperties().getProperty('API_TOKEN') || '').trim(); }
  catch (e) { return true; }
}

function tenantSheetCreate(user, name) {
  adminOnly_(user, '사무소 복제');
  name = String(name || '').trim();
  if (!name) throw new Error('사무소 이름을 입력하세요');
  var copy = DriveApp.getFileById(SHEET_ID).makeCopy('브리즈CRM_' + name + '_DB');
  var ss = SpreadsheetApp.openById(copy.getId());
  var sheets = ss.getSheets(), kept = [], removed = [], cleared = 0;
  for (var i = 0; i < sheets.length; i++) {
    var sh = sheets[i], nm = sh.getName();
    if (TENANT_KEEP_TABS.indexOf(nm) < 0) continue;
    var last = sh.getLastRow(), cols = Math.max(sh.getLastColumn(), 1);
    if (last > 1) {
      var rg = sh.getRange(2, 1, last - 1, cols);
      rg.clearDataValidations();               // 🔴 엄격 드롭다운이 걸려 있으면 clear 도 조용히 실패한다(09-02 사고)
      rg.clearContent();
      cleared += last - 1;
    }
    kept.push(nm);
  }
  for (var j = sheets.length - 1; j >= 0; j--) {
    var nm2 = sheets[j].getName();
    if (TENANT_KEEP_TABS.indexOf(nm2) >= 0) continue;
    if (ss.getSheets().length <= 1) break;     // 시트는 최소 1장
    ss.deleteSheet(sheets[j]);
    removed.push(nm2);
  }
  SpreadsheetApp.flush();
  try { logChange('tenant', 'sheetCreate', name + ' → ' + copy.getId() + ' (비움 ' + cleared + '행, 삭제탭 ' + removed.length + ')'); } catch (e) {}
  return { name: name, sheetId: copy.getId(), url: copy.getUrl(), kept: kept, removed: removed, cleared: cleared };
}

// 새 사무소 GAS 의 최초 1회 설정 — API_TOKEN 이 비어 있을 때만 통과. 이후엔 '이미 설정됨'.
function tenantSetup(p) {
  p = p || {};
  var props = PropertiesService.getScriptProperties();
  if (String(props.getProperty('API_TOKEN') || '').trim()) throw new Error('이미 설정된 사무소입니다 (API_TOKEN 있음)');
  var sheetId = String(p.sheetId || '').trim(), token = String(p.apiToken || '').trim();
  if (!/^[A-Za-z0-9_-]{20,}$/.test(sheetId)) throw new Error('sheetId 형식이 이상합니다');
  if (!/^[A-Za-z0-9]{16,}$/.test(token)) throw new Error('apiToken 은 영숫자 16자 이상');
  var title = SpreadsheetApp.openById(sheetId).getName();     // 접근 안 되면 여기서 예외
  props.setProperty('SHEET_ID', sheetId);
  props.setProperty('API_TOKEN', token);
  var extra = ['TENANT_NAME', 'OWNER_PHONE', 'SENDER_PHONE'];
  for (var i = 0; i < extra.length; i++) if (p[extra[i]]) props.setProperty(extra[i], String(p[extra[i]]));
  return { ok: true, sheetId: sheetId, sheetTitle: title, name: String(p.TENANT_NAME || '') };
}

/* ═══════════════════════════════════════════════════════════════════
   🧩 지시어 6건 반영 — 2026-09-08 (전부 CRM 안에서 돈다. PC 서버·파이썬·Node 없음 = SaaS 방식)
   ① 🏢 건축물대장 표제부 확장(대지면적·연면적·건축면적·건폐율·용적률·구조·내진설계·지하층·승강기·세대수)
        + 1일 캐시: CacheService(6h) 앞단 + 시트 '대장캐시'(24h) 뒷단          → bldgTitleExt_ / bldgDayCache*
   ② 📞 CTI 실시간 벨 이벤트(callRing) + 화면 폴링(callRingPoll)
        아톡비즈·MacroDroid 웹훅이 벨 울릴 때 callRing 을 부르면 PC 화면에 고객 카드가 뜬다(Express·Socket.io 대체)
   ③ 🧹 매물 데이터 감사(auditListings_): 중복[건물·보증금·월세·층]·호수 누락·대장 미조회·주소 없음·
        외부 공실망(수집매물 당근·오일장) 대조 → 검증 도장(auditApply)·중복 정제(auditDedupe, 대표 확인 후)
   ④ ⚙ 사무소 공통 설정(cfgAll_/cfgSet): 배분율·세율·직원별 요율·노션 DB — 기기(localStorage)가 아니라 서버에
   ⑤ 🔗 카톡 링크 보관함(linkImport): kakao.txt 의 URL·날짜·보낸이 → 제목 수집 → 시트 '링크수집' (+노션 DB 선택)
   되돌리기: 이 블록 + doGet/doPost 의 '🧩 2026-09-08' 줄 + HEADERS 끝 칸들 + bldgCachedFetch_/bldgLookup 의 ext 줄
   ═══════════════════════════════════════════════════════════════════ */

/* ── ① 건축물대장 1일 캐시 ───────────────────────────────────── */
var BLDG_DAY_TTL_H = 24;
var BLDG_DAY_MAX_CHARS = 45000;   // 시트 한 칸 한도(50,000자) 안쪽 — 대단지 전유부(수천 건)는 시트에 담지 않는다
var BLDG_DAY_PRUNE_DAYS = 7;

function bldgDayCacheGet_(k) {
  try { var c = CacheService.getScriptCache().get('bc:' + k); if (c) return JSON.parse(c); } catch (e) {}
  try {
    var sh = getOrCreateSheet('bldgcache');
    var v = sh.getDataRange().getValues();
    for (var i = 1; i < v.length; i++) {
      if (String(v[i][0]) !== k) continue;
      var age = (Date.now() - new Date(v[i][2]).getTime()) / 36e5;
      if (!(age >= 0 && age < BLDG_DAY_TTL_H)) return null;
      return JSON.parse(String(v[i][3] || 'null'));
    }
  } catch (e2) {}
  return null;
}

function bldgDayCacheSet_(k, op, val) {
  var s;
  try { s = JSON.stringify(val); } catch (e) { return false; }
  if (!s || s.length > BLDG_DAY_MAX_CHARS) return false;
  try { CacheService.getScriptCache().put('bc:' + k, s, 21600); } catch (e1) {}
  try {
    var sh = getOrCreateSheet('bldgcache');
    var now = new Date().toISOString();
    var v = sh.getDataRange().getValues();
    for (var i = 1; i < v.length; i++) {
      if (String(v[i][0]) === k) { sh.getRange(i + 1, 1, 1, 4).setValues([[k, op, now, s]]); return true; }
    }
    sh.appendRow([k, op, now, s]);
    return true;
  } catch (e2) { return false; }
}

function bldgDayCachePrune_() {   // enrichDaily(05시)가 부른다 — 오래된 줄 정리
  var sh = getOrCreateSheet('bldgcache');
  var v = sh.getDataRange().getValues();
  var cut = Date.now() - BLDG_DAY_PRUNE_DAYS * 86400000, removed = 0;
  for (var i = v.length - 1; i >= 1; i--) {
    var t = new Date(v[i][2]).getTime();
    if (!t || t < cut) { sh.deleteRow(i + 1); removed++; }
  }
  return removed;
}

/* 표제부(getBrTitleInfo) 한 건 → 확장 항목. 여러 동 단지에서 동 표기가 없고 동마다 값이 다르면 빈 칸(오염 방지). */
function bldgTitleExt_(items, t, dongDigits) {
  var out = { platArea: '', totArea: '', archArea: '', bcRat: '', vlRat: '', strct: '', quake: '', quakeAblty: '', ugFloor: '', elvtCnt: '', hhldCnt: '', mainUse: '' };
  if (!items || !items.length || !t) return out;
  var pick = function (field) {
    if (items.length > 1 && !dongDigits) {
      var set = {};
      for (var i = 0; i < items.length; i++) set[String(items[i][field] == null ? '' : items[i][field]).trim()] = 1;
      if (Object.keys(set).length > 1) return '';
    }
    return String(t[field] == null ? '' : t[field]).trim();
  };
  var area = function (v) { var n = parseFloat(v); return isNaN(n) || n <= 0 ? '' : String(Math.round(n * 100) / 100) + '㎡'; };
  var pct  = function (v) { var n = parseFloat(v); return isNaN(n) || n <= 0 ? '' : String(Math.round(n * 100) / 100) + '%'; };
  out.platArea = area(pick('platArea'));
  out.totArea  = area(pick('totArea'));
  out.archArea = area(pick('archArea'));
  out.bcRat    = pct(pick('bcRat'));
  out.vlRat    = pct(pick('vlRat'));
  out.strct    = pick('strctCdNm');
  var q = pick('rserthqkDsgnApplyYn');
  out.quake    = (q === '1' || q === 'Y') ? 'Y' : (q === '0' || q === 'N') ? 'N' : '';
  out.quakeAblty = pick('rserthqkAblty');
  var ug = pick('ugrndFlrCnt');
  out.ugFloor  = (ug && ug !== '0') ? ug + '층' : (ug === '0' ? '없음' : '');
  out.elvtCnt  = pick('rideUseElvtCnt');
  out.hhldCnt  = pick('hhldCnt');
  out.mainUse  = pick('mainPurpsCdNm');
  return out;
}

/* ── ② CTI 실시간 벨 이벤트 ─────────────────────────────────── */
var CALLRING_KEEP_MS = 10 * 60 * 1000;   // 이보다 오래된 벨은 화면에 안 띄운다

function callRingReply_(e, user) {
  var p = (e && e.parameter) || {};
  var body = {};
  try { if (e && e.postData && e.postData.contents && /^\s*\{/.test(e.postData.contents)) body = JSON.parse(e.postData.contents) || {}; } catch (eb) {}
  var merged = {};
  var keys = ['phone', 'number', 'caller', 'from', 'tel', 'callerNumber', 'caller_number', 'sender', 'name', 'kind', 'event', 'type'];
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (body[k] != null && body[k] !== '') merged[k] = body[k];
    if (p[k] != null && p[k] !== '') merged[k] = p[k];          // 쿼리가 본문보다 우선
  }
  var r = callRing_(merged, user);
  if (String(p.fmt || '') === 'text') return ContentService.createTextOutput(r.text).setMimeType(ContentService.MimeType.TEXT);
  return ok({ result: r });
}

function callRing_(p, user) {
  p = p || {};
  var phone = String(p.phone || p.number || p.caller || p.from || p.tel || p.callerNumber || p.caller_number || p.sender || '').trim();
  var pop = callPop_({ phone: phone }, user);
  var ev = { at: Date.now(), atStr: Utilities.formatDate(new Date(), 'Asia/Seoul', 'HH:mm:ss'),
             phone: pop.phone || phone, found: !!pop.found, role: pop.role || '', name: pop.name || '', text: pop.text || '',
             kind: String(p.kind || p.event || p.type || 'ring').slice(0, 12), by: user.id, byName: user.name };
  // 🔴 리뷰(09-08): 8초 폴링이 PropertiesService 일일 읽기 한도를 갉아먹을 수 있어 이벤트는 CacheService(10분)에, 대표용 색인만 속성 1개
  try { CacheService.getScriptCache().put('ring:' + user.id, JSON.stringify(ev), 600); } catch (e) {}
  try {
    var ps = PropertiesService.getScriptProperties();
    var ids = []; try { ids = JSON.parse(ps.getProperty('CALL_RING_IDS') || '[]') || []; } catch (e1) { ids = []; }
    if (ids.indexOf(user.id) < 0) { ids.push(user.id); ps.setProperty('CALL_RING_IDS', JSON.stringify(ids.slice(-30))); }
  } catch (e2) {}
  return ev;
}

function callRingPoll_(user, p) {
  var cache = CacheService.getScriptCache();
  var since = parseInt((p || {}).since, 10) || 0;
  var now = Date.now();
  var out = { now: now, ev: null, others: [] };
  var parse = function (s) {
    try {
      if (!s) return null;
      var o = JSON.parse(s);
      if (!o || !o.at || now - o.at > CALLRING_KEEP_MS || o.at <= since) return null;
      return o;
    } catch (e) { return null; }
  };
  out.ev = parse(cache.get('ring:' + user.id));
  if (user.role === 'admin') {                     // 대표 화면에는 직원 폰에 온 전화도 같이 뜬다(색인 속성 1개만 읽음)
    var ids = [];
    try { ids = JSON.parse(PropertiesService.getScriptProperties().getProperty('CALL_RING_IDS') || '[]') || []; } catch (e1) { ids = []; }
    ids = ids.filter(function (id) { return id !== user.id; });
    if (ids.length) {
      var all = cache.getAll(ids.map(function (id) { return 'ring:' + id; })) || {};
      for (var k in all) { var o = parse(all[k]); if (o) out.others.push(o); }
    }
  }
  return out;
}

/* ── ③ 매물 데이터 감사 ─────────────────────────────────────── */
var AUDIT_DONE_RE = /계약완료|임대중|거래완료/;
var AUDIT_EXT_STALE_DAYS = 2;    // 외부망(수집매물)에서 이 일수 넘게 안 보이면 '오래됨(검토대기)' — 자동으로 내리지 않는다
// 🔴 사장님 기준(09-08 13:30): 불확실한 매물은 자동 병합·삭제하지 않고 '검토대기'. 잠금(N)은 확실한 것만.
var AUDIT_BLOCK_RE = /^(중복 \d+건|주소 없음|지번 없음)$/;   // 이 사유만 N(미검증·직원 잠금). 나머지는 R(검토대기)
function auditGrade_(reasons) { if (!reasons.length) return 'Y'; for (var i = 0; i < reasons.length; i++) if (AUDIT_BLOCK_RE.test(reasons[i])) return 'N'; return 'R'; }

function auditNorm_(s) { return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, '').replace(/[()\[\]\-_·.,]/g, ''); }
function auditMan_(s) {          // '500/45' → 500, '3억' → 30000, '1,200' → 1200 (만원, 숫자만)
  var a = String(s == null ? '' : s).split('/')[0].trim();
  var v = isjMoney_(a);
  if (v) return Number(v);
  var n = parseFloat(a.replace(/[^\d.]/g, ''));
  return isNaN(n) ? 0 : n;
}
function auditRent_(l) {         // 월세: rentAmt 칸, 없으면 '500/45' 의 뒷부분
  if (l.rentAmt !== undefined && String(l.rentAmt).trim() !== '') return auditMan_(l.rentAmt);
  var parts = String(l.price || '').split('/');
  return parts.length > 1 ? auditMan_(parts[1]) : 0;
}
function auditFloor_(s) { var m = String(s == null ? '' : s).match(/-?\d+/); return m ? String(parseInt(m[0], 10)) : ''; }
function auditHo_(s) { var m = String(s == null ? '' : s).match(/(\d+)\s*호/); return m ? m[1] : ''; }
function auditBldg_(name) {      // 건물명에서 동·호·층 표기를 뗀다: '연동 OO 101동 801호' → '연동oo'
  return auditNorm_(String(name == null ? '' : name).replace(/\d+\s*동/g, ' ').replace(/\d+\s*호/g, ' ').replace(/\d+\s*층/g, ' ').replace(/\b[bB]\d+\b/g, ' '));
}
function auditFilled_(l) { var n = 0; for (var k in l) if (String(l[k] == null ? '' : l[k]).trim() !== '') n++; return n; }

function auditListings_(user, p) {
  var rows = getAllData('listings', user);
  var active = rows.filter(function (l) { return !AUDIT_DONE_RE.test(String(l.status || '')); });
  var info = {};
  active.forEach(function (l) {
    info[l.id] = { bldg: auditBldg_(l.apt || l.addr), dep: auditMan_(l.price), rent: auditRent_(l), floor: auditFloor_(l.floor), ho: auditHo_(l.addr2) || auditHo_(l.apt), reasons: [] };
  });
  // ① 중복 — [건물명, 거래유형, 보증금, 월세, 층, 호수] 완전 동일.
  //   🔴 09-08 라이브 실측: 에코드파리 2층 300/45 가 217·218·201호 — 서로 다른 방인데 호수를 안 보고 중복으로 잡았다.
  //      호수가 서로 다르면 중복이 아니다. 호수가 없는 매물은 같은 조건 매물이 있을 때 '호수 없음' 으로만 표시한다(삭제 대상 아님).
  var byKey = {}, byCond = {};
  active.forEach(function (l) {
    var f = info[l.id]; if (!f.bldg) return;
    var cond = [f.bldg, String(l.type || ''), f.dep, f.rent, f.floor].join('|');
    (byCond[cond] = byCond[cond] || []).push(l);
    var k = cond + '|' + f.ho;
    (byKey[k] = byKey[k] || []).push(l);
  });
  var dupGroups = [], sameCond = [];
  Object.keys(byKey).forEach(function (k) {
    var g = byKey[k]; if (g.length < 2) return;
    g.sort(function (a, b) { return auditFilled_(b) - auditFilled_(a) || String(a.recvDate || '').localeCompare(String(b.recvDate || '')) || String(a.id).localeCompare(String(b.id)); });
    var ids = g.map(function (x) { return x.id; });
    dupGroups.push({ key: k, apt: g[0].apt || g[0].addr, type: g[0].type, price: g[0].price, rentAmt: g[0].rentAmt, floor: g[0].floor, ho: info[g[0].id].ho, ids: ids, keep: ids[0], drop: ids.slice(1) });
    ids.forEach(function (id) { info[id].reasons.push('중복 ' + g.length + '건'); });
  });
  Object.keys(byCond).forEach(function (k) {
    var g = byCond[k]; if (g.length < 2) return;
    var hos = {}; g.forEach(function (l) { hos[info[l.id].ho || '(없음)'] = 1; });
    if (Object.keys(hos).length < 2) return;                       // 전부 같은 호수(=중복) 또는 전부 호수 없음(=중복)
    sameCond.push({ key: k, apt: g[0].apt || g[0].addr, type: g[0].type, price: g[0].price, rentAmt: g[0].rentAmt, floor: g[0].floor, ids: g.map(function (x) { return x.id; }), hos: Object.keys(hos) });
    g.forEach(function (l) { if (!info[l.id].ho) info[l.id].reasons.push('호수 없음(같은 조건 매물 있음)'); });
  });
  // ② 호수 누락 — 같은 건물·같은 층에 조건이 다른 매물이 2건 이상인데 호수가 없는 것
  var byFloor = {};
  active.forEach(function (l) { var f = info[l.id]; if (!f.bldg || !f.floor) return; (byFloor[f.bldg + '|' + f.floor] = byFloor[f.bldg + '|' + f.floor] || []).push(l); });
  var hoMissing = [];
  Object.keys(byFloor).forEach(function (k) {
    var g = byFloor[k]; if (g.length < 2) return;
    var conds = {}; g.forEach(function (l) { var f = info[l.id]; conds[[f.dep, f.rent, auditNorm_(l.area)].join('|')] = 1; });
    if (Object.keys(conds).length < 2) return;                 // 조건이 전부 같으면 ① 중복 쪽 문제
    g.forEach(function (l) { if (!info[l.id].ho) { hoMissing.push({ id: l.id, apt: l.apt, floor: l.floor, price: l.price, rentAmt: l.rentAmt }); info[l.id].reasons.push('상세 호실 확인 필요'); } });
  });
  // ③ 대장 미조회 · 주소 없음
  active.forEach(function (l) {
    var f = info[l.id];
    if (!String(l.addr || '').trim()) f.reasons.push('주소 없음');
    else if (!/\d/.test(String(l.addr))) f.reasons.push('지번 없음');
    if (!String(l.aprDate || '').trim() && !String(l.totalFloor || '').trim()) f.reasons.push('대장 미조회');
  });
  // ④ 외부 공실망 대조 — 수집매물(당근·오일장)에서 같은 건물·같은 보증금/월세를 찾고, 최근 수집에서 사라졌으면 표시
  var ext = { checked: 0, matched: 0, gone: [], lastSeen: '' };
  try { auditExt_(active, info, ext); } catch (ex) { ext.error = String(ex && ex.message || ex); }
  // 판정
  var verifiedIds = [], reviewIds = [], unverified = [], review = [];
  active.forEach(function (l) {
    var f = info[l.id];
    var g = auditGrade_(f.reasons);
    if (g === 'Y') verifiedIds.push(l.id);
    else if (g === 'R') { reviewIds.push(l.id); review.push({ id: l.id, apt: l.apt, addr2: l.addr2, status: l.status, reasons: f.reasons.slice() }); }
    else unverified.push({ id: l.id, apt: l.apt, addr2: l.addr2, status: l.status, reasons: f.reasons.slice() });
  });
  return { at: Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm'), total: rows.length, active: active.length,
           dupGroups: dupGroups, sameCond: sameCond, hoMissing: hoMissing, unverified: unverified, review: review, reviewIds: reviewIds, verifiedIds: verifiedIds, ext: ext,
           note: '소유자 대조는 공개 건축물대장 API 에 소유자 항목이 없어(개인정보) 불가 — 등기부 열람(유료) 필요' };
}

function auditExt_(active, info, ext) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(COL_SHEET); if (!sh) return;
  var v = sh.getDataRange().getValues(); if (v.length < 2) return;
  var h = v[0].map(String), ci = {}; h.forEach(function (n, i) { ci[n] = i; });
  var need = ['apt', 'addr', 'deposit', 'rent', 'seenAt', 'status', 'src', 'id'];
  for (var q = 0; q < need.length; q++) if (ci[need[q]] === undefined) return;
  var idx = {}, maxSeen = 0;
  for (var i = 1; i < v.length; i++) {
    var r = v[i];
    var b = auditBldg_(r[ci.apt]) || auditBldg_(r[ci.addr]); if (!b) continue;
    var seen = new Date(r[ci.seenAt]).getTime() || 0; if (seen > maxSeen) maxSeen = seen;
    var k = [b, auditMan_(r[ci.deposit]), auditMan_(r[ci.rent])].join('|');
    var cur = idx[k];
    if (!cur || seen > cur.seen) idx[k] = { seen: seen, status: String(r[ci.status] || ''), src: String(r[ci.src] || ''), id: String(r[ci.id] || '') };
  }
  ext.lastSeen = maxSeen ? Utilities.formatDate(new Date(maxSeen), 'Asia/Seoul', 'yyyy-MM-dd HH:mm') : '';
  var cut = maxSeen - AUDIT_EXT_STALE_DAYS * 86400000;
  active.forEach(function (l) {
    var f = info[l.id]; if (!f.bldg) return;
    ext.checked++;
    var m = idx[[f.bldg, f.dep, f.rent].join('|')]; if (!m) return;
    ext.matched++;
    // 🔴 리뷰 확정(09-08): 수집기는 이미 있는 글의 seenAt 을 다시 찍지 않는다 → '오래됨'만으로 내려갔다고 단정하면 오탐. 검토대기 사유로만 둔다.
    var gone = /삭제|완료|종료|마감|내림/.test(m.status), stale = !!(maxSeen && m.seen < cut);
    if (gone || stale) { ext.gone.push({ id: l.id, apt: l.apt, price: l.price, rentAmt: l.rentAmt, src: m.src, extId: m.id, seenAt: m.seen ? Utilities.formatDate(new Date(m.seen), 'Asia/Seoul', 'yyyy-MM-dd') : '', status: m.status, kind: gone ? '내려감' : '오래됨' }); f.reasons.push(gone ? '외부망 내려감(거래완료 확인)' : '외부망 확인 오래됨(재수집 필요)'); }
  });
}

/* 검증 도장 — 시트 verified/verifiedAt/auditNote 세 칸만 쓴다(행 전체를 다시 쓰지 않는다 → 규칙 9 위험 없음). 대표만. */
function auditApply(user, p) {
  adminOnly_(user, '검증 도장');
  var a = auditListings_(user, p);
  var sh = getOrCreateSheet('listings');
  var cm = sheetColMap_(sh);
  var cV = cm.index['verified'], cA = cm.index['verifiedAt'], cN = cm.index['auditNote'], cId = cm.index['id'];
  if (cV === undefined || cA === undefined || cN === undefined || cId === undefined) throw new Error('시트에 verified/verifiedAt/auditNote 칸이 없습니다');
  var v = sh.getDataRange().getValues(); if (v.length < 2) return { stamped: 0 };
  var ok_ = {}; a.verifiedIds.forEach(function (id) { ok_[id] = 1; });
  var rv = {}; a.review.forEach(function (u) { rv[u.id] = u.reasons.join(', '); });
  var why = {}; a.unverified.forEach(function (u) { why[u.id] = u.reasons.join(', '); });
  var now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
  var colV = [], colA = [], colN = [], y = 0, n = 0, rc = 0;
  for (var i = 1; i < v.length; i++) {
    var id = String(v[i][cId] || '').trim();
    if (!id) { colV.push([v[i][cV]]); colA.push([v[i][cA]]); colN.push([v[i][cN]]); continue; }
    if (ok_[id]) { colV.push(['Y']); colA.push([now]); colN.push(['']); y++; }
    else if (rv[id] !== undefined) { colV.push(['R']); colA.push([now]); colN.push([rv[id]]); rc++; }   // 검토대기 — 직원 화면 잠그지 않음
    else if (why[id] !== undefined) { colV.push(['N']); colA.push([now]); colN.push([why[id]]); n++; }
    else { colV.push(['']); colA.push([now]); colN.push(['계약·거래완료(검수 대상 아님)']); }
  }
  sh.getRange(2, cV + 1, colV.length, 1).setValues(colV);
  sh.getRange(2, cA + 1, colA.length, 1).setValues(colA);
  sh.getRange(2, cN + 1, colN.length, 1).setValues(colN);
  try { PropertiesService.getScriptProperties().setProperty('CFG_AUDIT_AT', now); } catch (e) {}
  logChange('listings', 'auditApply', '검증 Y ' + y + ' / 검토대기 R ' + rc + ' / N ' + n + ' / 중복그룹 ' + a.dupGroups.length);
  return { stamped: y + rc + n, verified: y, review: rc, unverified: n, at: now, audit: a };
}

/* 중복 정제 — 대표가 화면에서 확인한 그룹만. 서버가 다시 계산해 정말 중복인 것만 지운다(삭제로그 묘비 남음, 되살리기는 백업탭). */
function auditDedupe(user, p) {
  adminOnly_(user, '중복 정제');
  var groups = (p && p.groups) || [];
  if (!Array.isArray(groups) || !groups.length) throw new Error('정제할 그룹이 없습니다');
  var a = auditListings_(user, p);
  var real = {}; a.dupGroups.forEach(function (g) { g.ids.forEach(function (id) { real[id] = g; }); });
  var deleted = [], skipped = [];
  groups.forEach(function (g) {
    var keep = String((g || {}).keep || '').trim(), drop = ((g || {}).drop || []).map(String);
    drop.forEach(function (id) {
      var rg = real[id];
      if (!keep || id === keep || !rg || rg.ids.indexOf(keep) < 0) { skipped.push({ id: id, why: '중복 아님 또는 keep 불일치' }); return; }
      var r = deleteRow('listings', id, user);
      if (r && r.deleted) deleted.push(id); else skipped.push({ id: id, why: (r && r.error) || '삭제 실패' });
    });
  });
  logChange('listings', 'auditDedupe', '삭제 ' + deleted.length + '건 (' + deleted.join(',') + ') / 건너뜀 ' + skipped.length);
  return { deleted: deleted, skipped: skipped };
}

/* ── ④ 사무소 공통 설정 ─────────────────────────────────────── */
var CFG_KEYS = { PAYOUT_SPLIT: 1, PAYOUT_TAX: 1, PAYOUT_RATES: 1, NOTION_LINK_DB: 1, CTI_POLL_SEC: 1, AUDIT_AT: 1, FEATURE_LIVE: 1, BRAND_GUIDE: 1 };   // FEATURE_LIVE: 대표가 직원에게 공개한 P1 기능 목록(JSON 배열)

function cfgAll_(user) {
  var ps = PropertiesService.getScriptProperties();
  var out = {};
  for (var k in CFG_KEYS) { var v = ps.getProperty('CFG_' + k); if (v !== null && v !== undefined) out[k] = v; }
  out.notionReady = !!(String(ps.getProperty('NOTION_TOKEN') || '').trim() && out.NOTION_LINK_DB);
  out.role = user.role;
  return out;
}

function cfgSet(user, key, value) {
  adminOnly_(user, '설정 변경');
  key = String(key || '').trim();
  var v = String(value == null ? '' : value);
  if (v.length > 4000) throw new Error('설정값이 너무 깁니다');
  var ps = PropertiesService.getScriptProperties();
  if (key === 'NOTION_TOKEN') {                 // 비밀값: 저장만 하고 절대 돌려주지 않는다(cfgAll_ 은 notionReady 만)
    if (v) ps.setProperty('NOTION_TOKEN', v); else ps.deleteProperty('NOTION_TOKEN');
    logChange('cfg', 'set', 'NOTION_TOKEN ' + (v ? '등록' : '삭제'));
    return { key: key, saved: true };
  }
  if (!CFG_KEYS[key]) throw new Error('허용되지 않은 설정 키: ' + key);
  if (v) ps.setProperty('CFG_' + key, v); else ps.deleteProperty('CFG_' + key);
  logChange('cfg', 'set', key + '=' + v.slice(0, 80));
  return { key: key, value: v, saved: true };
}

/* ── ⑤ 카톡 링크 보관함 ─────────────────────────────────────── */
var LINK_TITLE_MAX = 25;     // 한 번 호출에 제목을 긁는 최대 개수(실행 6분 제한 안쪽) — 나머지는 다음 저장 때
var LINK_MAX_ITEMS = 300;

function linkId_(url) {
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(url), Utilities.Charset.UTF_8);
  var h = '';
  for (var i = 0; i < 6; i++) { var b = (d[i] + 256) % 256; h += ('0' + b.toString(16)).slice(-2); }
  return 'lk_' + h;
}
function linkDomain_(url) { var m = String(url).match(/^https?:\/\/([^\/:?#]+)/i); return m ? m[1].toLowerCase().replace(/^www\./, '') : ''; }
function linkTitle_(url) {
  try {
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) BreezeCRM/1.0' } });
    if (res.getResponseCode() >= 400) return '';
    var html = String(res.getContentText() || '').slice(0, 200000);
    var m = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
         || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)
         || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    var t = m ? m[1] : '';
    t = t.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
    return t.slice(0, 120);
  } catch (e) { return ''; }
}

function linkImport(user, p) {
  var items = (p && p.items) || [];
  if (!Array.isArray(items)) throw new Error('items 배열이 필요합니다');
  if (items.length > LINK_MAX_ITEMS) items = items.slice(0, LINK_MAX_ITEMS);
  var existing = {};
  getAllData('links', user).forEach(function (r) { existing[r.id] = r; });
  var t0 = Date.now(), titled = 0, skipped = 0, dup = 0, notion = 0, rows = [], seen = {};
  for (var i = 0; i < items.length; i++) {
    var it = items[i] || {};
    var url = String(it.url || '').trim().replace(/[)\]>.,]+$/, '');
    if (!/^https?:\/\/\S+$/i.test(url)) { skipped++; continue; }
    var id = linkId_(url);
    if (seen[id]) { dup++; continue; }
    seen[id] = 1;
    if (existing[id] && !(p && p.force)) { dup++; continue; }
    var title = String(it.title || '').trim();
    if (!title && titled < LINK_TITLE_MAX && Date.now() - t0 < 200000) { title = linkTitle_(url); if (title) titled++; }
    rows.push({ id: id, title: title || linkDomain_(url), url: url, at: String(it.at || '').slice(0, 19), sender: String(it.sender || '').slice(0, 30),
                source: String(it.source || 'kakao').slice(0, 20), domain: linkDomain_(url), memo: String(it.memo || '').slice(0, 200), notionId: '',
                updatedAt: new Date().toISOString() });
  }
  // 🔴 리뷰(09-08): 시트에 먼저 남기고 노션은 그다음 — 6분 초과로 끊겨도 재시도 때 노션에 같은 페이지가 두 번 생기지 않는다
  withWriteLock_(function () { for (var w = 0; w < rows.length; w++) upsertRow('links', rows[w], user); });
  var ps = PropertiesService.getScriptProperties();
  var nt = String(ps.getProperty('NOTION_TOKEN') || '').trim(), ndb = String(ps.getProperty('CFG_NOTION_LINK_DB') || '').trim();
  if (nt && ndb) {
    var pushed = [];
    for (var r = 0; r < rows.length; r++) { var nid = notionLinkPush_(nt, ndb, rows[r]); if (nid) { rows[r].notionId = nid; notion++; pushed.push(rows[r]); } }
    if (pushed.length) withWriteLock_(function () { for (var w2 = 0; w2 < pushed.length; w2++) upsertRow('links', pushed[w2], user); });
  }
  logChange('links', 'import', rows.length + '건 저장, 제목 ' + titled + '건, 노션 ' + notion + '건, 중복 ' + dup + ', 건너뜀 ' + skipped);
  return { saved: rows.length, titled: titled, dup: dup, skipped: skipped, notion: notion, notionReady: !!(nt && ndb) };
}

/* 노션 DB 한 줄 — 속성 이름은 지시어 그대로 '제목'(title) / 'URL'(url) / '업로드 날짜'(date). Notion-Version 2022-06-28. */
function notionLinkPush_(token, dbId, row) {
  try {
    var props = { '제목': { title: [{ text: { content: String(row.title || row.url).slice(0, 200) } }] }, 'URL': { url: row.url } };
    if (row.at && /^\d{4}-\d{2}-\d{2}/.test(row.at)) props['업로드 날짜'] = { date: { start: row.at.slice(0, 10) } };
    var res = UrlFetchApp.fetch('https://api.notion.com/v1/pages', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'Authorization': 'Bearer ' + token, 'Notion-Version': '2022-06-28' },
      payload: JSON.stringify({ parent: { database_id: dbId }, properties: props }) });
    if (res.getResponseCode() >= 300) return '';
    var j = JSON.parse(res.getContentText());
    return String(j.id || '');
  } catch (e) { return ''; }
}

/* ═══════════════════════════════════════════════════════════════════
   🎨 브랜드 스튜디오 — 2026-09-08 (P1, 사장님 지시 "브랜드·캐릭터 관리 기능")
   무엇: 캐릭터·로고·색상·2D 포즈/표정·3D·영상·굿즈 시안·사용지침을 **하나의 자산 체계**로 관리.
         파일은 드라이브 폴더 '브리즈_브랜드스튜디오'에(brandUpload), 시트 '브랜드자산'에는 링크·버전·상태·사용처만.
   흐름: 초안 → 검토대기 → 승인(대표) → 사용 → 보관. AI 결과물 자동 게시 없음(사람이 누른다).
         승인·사용·보관 표시와 삭제는 대표만. 직원은 승인본을 못 고치고 사용 기록만 덧붙인다(brandGuard_).
   기준표: 캐릭터 이름·역할·고정 특징(얼굴·머리·의상·색상·로고 위치)과 브랜드 색상은 스크립트 속성
         CFG_BRAND_GUIDE 에 JSON 으로 둔다(cfgSet, 대표만). 화면에서 언제든 고칠 수 있다 — 이름을 코드에 박지 않는다.
   되돌리기: 이 블록 + HEADERS.brand + SHEETS.brand + TENANT_KEEP_TABS '브랜드자산'
             + doPost 의 '🎨 2026-09-08' 3곳 + CFG_KEYS.BRAND_GUIDE.
   ═══════════════════════════════════════════════════════════════════ */
var BRAND_FOLDER = '브리즈_브랜드스튜디오';
var BRAND_STATUS = ['초안', '검토대기', '승인', '사용', '보관'];
var BRAND_CATS = ['원본캐릭터', '투명배경PNG', '2D포즈·표정', '3D캐릭터', '영상·애니메이션', '로고', '브랜드색상', '굿즈시안', '사용지침', '금지사례'];
var BRAND_MAX_BYTES = 6 * 1024 * 1024;

function brandFolder_() {
  var it = DriveApp.getFoldersByName(BRAND_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(BRAND_FOLDER);
}

/* 파일 업로드(base64) → 드라이브. 링크 보기 공개로 둬야 화면 미리보기·다운로드가 된다(마케팅 자산). */
function brandUpload(user, p) {
  p = p || {};
  var name = String(p.name || '').trim().replace(/[\\\/:*?"<>|]/g, '_').slice(0, 80) || ('asset_' + Date.now());
  var mime = String(p.mime || 'application/octet-stream').slice(0, 80);
  var b64 = String(p.b64 || '').replace(/^data:[^;]+;base64,/, '');
  if (!b64) throw new Error('파일 내용이 없습니다');
  var bytes = Utilities.base64Decode(b64);
  if (bytes.length > BRAND_MAX_BYTES) throw new Error('파일이 6MB 를 넘습니다 — 줄여서 올리거나 드라이브 링크를 직접 붙여 주세요');
  var f = brandFolder_().createFile(Utilities.newBlob(bytes, mime, name));
  try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  var id = f.getId();
  logChange('brand', 'upload', name + ' (' + bytes.length + 'B) ' + user.name);
  return { fileId: id, name: name, size: bytes.length,
           fileUrl: 'https://drive.google.com/file/d/' + id + '/view',
           thumbUrl: 'https://drive.google.com/thumbnail?id=' + id + '&sz=w800',
           downloadUrl: 'https://drive.google.com/uc?export=download&id=' + id };
}

/* 상태 흐름·권한을 서버가 지킨다 — 화면이 무엇을 보내든 여기를 지난 값만 시트에 간다. */
function brandGuard_(user, item) {
  item = item || {};
  if (!String(item.id || '').trim()) throw new Error('id 가 없습니다');
  if (!String(item.name || '').trim()) throw new Error('자산 이름이 없습니다');
  var st = String(item.status || '초안').trim();
  if (BRAND_STATUS.indexOf(st) < 0) throw new Error('상태값은 ' + BRAND_STATUS.join(' / ') + ' 만 됩니다');
  if (String(item.category || '') && BRAND_CATS.indexOf(String(item.category)) < 0) throw new Error('분류값이 목록에 없습니다: ' + item.category);
  var prev = null;
  try {
    var rows = getAllData('brand', user);
    for (var i = 0; i < rows.length; i++) if (String(rows[i].id) === String(item.id)) { prev = rows[i]; break; }
  } catch (e) {}
  // 🔴 검산이 잡음(09-08): 직원이 승인본에 **사용처만** 기록할 때도 status 가 '승인'인 채로 오므로,
  //    상태를 **바꾸려 할 때만** 막는다. 그대로 두고 저장하는 것은 허용(내용은 아래에서 원본으로 되돌린다).
  var prevSt = prev ? String(prev.status || '초안') : '초안';
  if (user.role !== 'admin' && st !== prevSt && (st === '승인' || st === '사용' || st === '보관')) {
    throw new Error('승인·사용·보관 표시는 대표만 할 수 있습니다 — [검토대기]로 올려 주세요');
  }
  if (user.role !== 'admin' && prev && (prev.status === '승인' || prev.status === '사용')) {
    // 직원은 승인본의 내용을 바꾸지 못한다 — 사용 기록(usedFor·usedAt)만 덧붙일 수 있다
    var keep = ['name', 'category', 'kind', 'charRole', 'desc', 'fileUrl', 'fileId', 'thumbUrl', 'version', 'status', 'approvedAt', 'approvedBy', 'createdBy', 'note'];
    for (var k = 0; k < keep.length; k++) item[keep[k]] = prev[keep[k]];
  }
  var now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
  var wasOk = !!(prev && (prev.status === '승인' || prev.status === '사용') && prev.approvedAt);
  if ((st === '승인' || st === '사용') && !wasOk) { item.approvedAt = now; item.approvedBy = user.name; }
  if (st === '초안' || st === '검토대기') { item.approvedAt = ''; item.approvedBy = ''; }   // 되돌리면 승인 도장도 지운다
  if (!item.createdBy) item.createdBy = (prev && prev.createdBy) ? prev.createdBy : user.name;
  if (!String(item.version || '').trim()) item.version = (prev && prev.version) ? prev.version : 'v1';
  return item;
}

/* ═══════════════════════════════════════════════════════════════════
   📎 G10-B 매물 첨부 보관 (2026-09-11)
   매물에 붙인 파일(등기부 스캔·계약 관련 자료 등)을 **비공개 드라이브**에 남긴다.

   왜 필요했나
     종전에는 listings[].attachments 가 dataUrl 로 **브라우저에만** 있었다.
     시트 HEADERS 에 칸이 없어 서버로 가지 않으므로, 기기를 바꾸거나 브라우저 자료를
     지우면 되찾을 수 없었다(index.html 2762 주석이 08-14 소실 사고를 기록).

   🔴 지키는 것
     · **setSharing 을 부르지 않는다.** 파일은 만든 계정만 볼 수 있는 상태로 둔다.
       (사진 drivePut_ · 브랜드 brandUpload 는 ANYONE_WITH_LINK 다 — 그 패턴을 쓰지 않는다)
     · 사진 폴더(브리즈매물사진)와 **다른 폴더**에 둔다. 사진을 옮기거나 섞지 않는다.
     · 파일 내용은 시트에 넣지 않는다. fileId 로만 가리킨다.
     · 클라이언트에 Drive 링크를 주지 않는다. 파일을 보려면 **서버를 거쳐야** 하고,
       그때마다 그 매물에 대한 권한을 다시 검사한다.
       → fileId 를 안다고 파일을 볼 수 있는 것이 아니다.
     · 업로드·조회 권한은 기존 photoOwnGuard_ 를 그대로 쓴다(새 권한 체계 0).
     · 지우지 않는다. status 를 disabled 로 둘 뿐 드라이브 원본은 남긴다(규칙 23).
   ═══════════════════════════════════════════════════════════════════ */
var ATTACH_ROOT = '브리즈매물첨부';        // 🔴 사진(브리즈매물사진)과 다른 폴더
var ATTACH_MAX_BYTES = 5 * 1024 * 1024;   // 화면과 같은 5MB
var ATTACH_OK_MIME = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png'
};
var ATTACH_OK_EXT = { pdf: 1, jpg: 1, jpeg: 1, png: 1 };

/* 첨부 전용 폴더 — 사진 폴더와 섞이지 않게 뿌리부터 다르다 */
function attachFolder_() {
  var it = DriveApp.getFoldersByName(ATTACH_ROOT);
  return it.hasNext() ? it.next() : DriveApp.createFolder(ATTACH_ROOT);
}

/* 🔴 확장자만 믿지 않는다 — 이름과 MIME 이 둘 다 허용 목록에 있어야 한다 */
function attachCheck_(name, mime, bytes) {
  var nm = String(name || '').trim();
  if (!nm) throw new Error('파일 이름이 없습니다');
  if (nm.length > 120) nm = nm.slice(0, 120);
  var dot = nm.lastIndexOf('.');
  var ext = dot > 0 ? nm.slice(dot + 1).toLowerCase() : '';
  if (!ATTACH_OK_EXT[ext]) throw new Error('이 종류는 올릴 수 없습니다: .' + (ext || '(확장자 없음)') + ' — pdf·jpg·png 만 됩니다');
  var mm = String(mime || '').toLowerCase().split(';')[0].trim();
  if (!ATTACH_OK_MIME[mm]) throw new Error('이 종류는 올릴 수 없습니다: ' + (mm || '(형식 없음)') + ' — pdf·jpg·png 만 됩니다');
  /* 이름과 형식이 서로 맞는지 — .pdf 인데 image/png 같은 어긋남을 막는다 */
  var want = ATTACH_OK_MIME[mm];
  if (want === '.pdf' && ext !== 'pdf') throw new Error('파일 이름과 형식이 다릅니다');
  if (want !== '.pdf' && ext === 'pdf') throw new Error('파일 이름과 형식이 다릅니다');
  if (!bytes || !bytes.length) throw new Error('파일 내용이 비어 있습니다');
  if (bytes.length > ATTACH_MAX_BYTES) throw new Error('파일이 5MB 를 넘습니다 (' + bytes.length + 'B)');
  /* 이름에서 폴더 구분자를 지운다 */
  nm = nm.replace(/[\\\/:*?"<>|]/g, '_');
  return { name: nm, mime: mm, size: bytes.length };
}

/* 올리기 — 🔴 드라이브 저장 뒤 시트에 적는다. 둘 다 돼야 성공이다. */
function listingAttachUpload(user, p) {
  p = p || {};
  var lid = String(p.listingId || '').trim();
  if (!lid) throw new Error('매물번호가 없습니다 — 매물을 먼저 저장하세요');
  var o = listingById_(lid);
  if (!o) throw new Error('그 매물을 찾지 못했습니다: ' + lid);
  photoOwnGuard_(user, lid);                       // 🔴 기존 권한 함수 재사용

  var b64 = String(p.b64 || '').replace(/^data:[^;]+;base64,/, '');
  if (!b64) throw new Error('파일 내용이 없습니다');
  var bytes = Utilities.base64Decode(b64);
  var chk = attachCheck_(p.name, p.mime, bytes);

  /* ① 드라이브에 넣는다 — 🔴 setSharing 을 부르지 않는다(비공개 유지) */
  var folder = attachFolder_();
  var f = folder.createFile(Utilities.newBlob(bytes, chk.mime, lid + '_' + chk.name));
  var fileId = f.getId();

  /* ② 시트에 적는다 — 여기서 실패하면 드라이브 파일이 홀로 남는다(고아). 지우지 않고 알린다. */
  try {
    var row = withWriteLock_(function () {
      var sh = getOrCreateSheet('listingAttachments');
      var rows = sh.getDataRange().getValues();
      var h = (rows.length ? rows[0] : []).map(String);
      if (!h.length || h.indexOf('listingId') < 0) {
        h = HEADERS.listingAttachments.slice();
        sh.getRange(1, 1, 1, h.length).setValues([h]);
      }
      var now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
      var obj = {
        id: 'LA' + Utilities.getUuid().slice(0, 8),
        listingId: lid, fileId: fileId, fileName: chk.name, mimeType: chk.mime,
        fileSize: String(chk.size), createdAt: now,
        createdBy: String(p.createdBy || (user ? (user.name || user.id) : '')),
        status: 'active', note: String(p.note || ''), updatedAt: now
      };
      var line = [];
      for (var c = 0; c < h.length; c++) line.push(obj[h[c]] === undefined ? '' : obj[h[c]]);
      sh.getRange(sh.getLastRow() + 1, 1, 1, h.length).setValues([line]);
      try { sh.getRange(sh.getLastRow(), 1, 1, h.length).setNumberFormat('@'); } catch (e) {}
      return obj;
    });
    logChange('listingAttachments', 'upload', lid + ' · ' + chk.name + ' (' + chk.size + 'B)');
    return { ok: true, id: row.id, listingId: lid, fileName: chk.name,
             mimeType: chk.mime, fileSize: chk.size, createdAt: row.createdAt };
  } catch (e) {
    /* 🔴 드라이브에는 들어갔는데 시트가 실패했다 — 지우지 않고 그대로 알린다(규칙 23) */
    return { ok: false, orphan: true, fileId: fileId, listingId: lid,
             error: '드라이브에는 올라갔지만 목록에 적지 못했습니다: ' + e.message
                  + ' (파일 id ' + fileId + ' — 지우지 않았습니다)' };
  }
}

/* 목록 — 🔴 그 매물을 볼 권한이 있을 때만. 파일 내용은 주지 않는다. */
function listingAttachList(user, p) {
  p = p || {};
  var lid = String(p.listingId || '').trim();
  if (!lid) return { rows: [] };
  photoOwnGuard_(user, lid);                       // 권한 없으면 여기서 막힌다
  var rows = getAllData('listingAttachments', user) || [];
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].listingId || '').trim() !== lid) continue;
    if (String(rows[i].status || 'active') !== 'active') continue;
    out.push({ id: rows[i].id, listingId: rows[i].listingId,
               fileName: rows[i].fileName, mimeType: rows[i].mimeType,
               fileSize: rows[i].fileSize, createdAt: rows[i].createdAt,
               createdBy: rows[i].createdBy });   // 🔴 fileId 를 내보내지 않는다
  }
  return { rows: out, count: out.length };
}

/* 열기 — 🔴 첨부 id 로만 받는다. 그 첨부의 매물 권한을 **다시** 검사한 뒤에야 내용을 준다.
   fileId 를 알아도 이 문을 지나야 하고, 드라이브 파일 자체는 비공개다. */
function listingAttachGet(user, p) {
  p = p || {};
  var aid = String(p.id || '').trim();
  if (!aid) throw new Error('첨부 번호가 없습니다');
  var rows = getAllData('listingAttachments', user) || [];
  var meta = null;
  for (var i = 0; i < rows.length; i++) if (String(rows[i].id) === aid) { meta = rows[i]; break; }
  if (!meta) throw new Error('그 첨부를 찾지 못했습니다');
  if (String(meta.status || 'active') !== 'active') throw new Error('그 첨부는 내려져 있습니다');
  photoOwnGuard_(user, String(meta.listingId || ''));   // 🔴 여기서 다시 검사한다

  var f = DriveApp.getFileById(String(meta.fileId));
  var blob = f.getBlob();
  return { id: meta.id, listingId: meta.listingId, fileName: meta.fileName,
           mimeType: meta.mimeType, fileSize: meta.fileSize,
           b64: Utilities.base64Encode(blob.getBytes()) };
}

/* 내리기 — 🔴 드라이브 원본은 지우지 않는다. 목록에서만 감춘다. */
function listingAttachDisable(user, p) {
  p = p || {};
  var aid = String(p.id || '').trim();
  if (!aid) throw new Error('첨부 번호가 없습니다');
  return withWriteLock_(function () {
    var sh = getOrCreateSheet('listingAttachments');
    var rows = sh.getDataRange().getValues();
    var h = rows[0].map(String);
    var ii = h.indexOf('id'), il = h.indexOf('listingId'), ist = h.indexOf('status'), iu = h.indexOf('updatedAt');
    for (var r = 1; r < rows.length; r++) {
      if (String(rows[r][ii]).trim() !== aid) continue;
      photoOwnGuard_(user, String(rows[r][il] || ''));
      sh.getRange(r + 1, ist + 1).setValue('disabled');
      if (iu >= 0) sh.getRange(r + 1, iu + 1).setValue(
        Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss'));
      logChange('listingAttachments', 'disable', aid + ' (드라이브 원본은 그대로)');
      return { ok: true, id: aid, status: 'disabled', driveKept: true };
    }
    throw new Error('그 첨부를 찾지 못했습니다');
  });
}

/* ═══════════════════════════════════════════════════════════════════
   📄 G9-B 계약문서 보관 (2026-09-10)
   그때 만든 계약서·확인설명서 **본문 그대로**를 계약 id 와 버전에 묶어 남긴다.

   왜 필요했나
     종전에는 계약서를 만들어도 화면(DOM)에만 있고 저장 코드가 0이었다.
     내일 다시 열면 없었다. 입력칸 39개 중 계약·매물에 남는 값이 13개뿐이라
     "입력값으로 다시 만들기" 로는 그날 문서를 되살릴 수 없다(G9-A 실측).
     게다가 로컬 초안은 만든 날짜를 본문에 박으므로 **재생성은 복원이 아니다.**

   🔴 지키는 것
     · contracts 50칸을 건드리지 않는다. 문서는 이 탭에만 쌓인다.
     · contractId 는 contracts.id **완전일치**로만 잇는다.
     · 기존 행을 고치지 않는다. 다시 저장하면 **버전을 올려 새 행**을 넣는다.
     · 계약서와 확인설명서는 한 번에 생긴 한 쌍이라 **한 번의 쓰기**로 같이 넣는다.
     · source 는 저장 당시 실제 경로(local/ai)를 그대로 적는다.
     · 직원은 본인 담당 계약의 문서만 받는다(getAllData 의 필터).
   ═══════════════════════════════════════════════════════════════════ */
var CDOC_TYPES = ['contract', 'explanation'];
var CDOC_MAX_BODY = 45000;    // 시트 한 셀 5만자보다 안전하게

/* 그 계약이 실제로 있는가 + 직원이면 본인 담당인가 */
function cdocGuard_(user, contractId) {
  var cid = String(contractId || '').trim();
  if (!cid) throw new Error('계약을 먼저 저장한 뒤 문서를 보관하세요 (계약번호가 없습니다)');
  var sh = getOrCreateSheet('contracts');
  var rows = sh.getDataRange().getValues();
  if (rows.length <= 1) throw new Error('그 계약을 찾지 못했습니다: ' + cid);
  var h = rows[0].map(String);
  var ci = h.indexOf('id'), ca = h.indexOf('agent');
  if (ci < 0) throw new Error("계약 시트에 'id' 칸이 없습니다");
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][ci] || '').trim() !== cid) continue;
    if (user && user.role === 'staff' && ca >= 0
        && String(rows[i][ca] || '').trim() !== user.id) {
      throw new Error('본인이 담당하는 계약의 문서만 보관할 수 있습니다');
    }
    return true;
  }
  throw new Error('그 계약을 찾지 못했습니다: ' + cid);
}

/* 같은 contractId + docType 안에서만 다음 버전을 센다 — 🔴 다른 계약과 섞이지 않는다 */
function cdocNextVersion_(rows, h, contractId, docType) {
  var ic = h.indexOf('contractId'), it = h.indexOf('docType'), iv = h.indexOf('version');
  if (ic < 0 || it < 0 || iv < 0) return 1;
  var max = 0;
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][ic] || '').trim() !== String(contractId)) continue;
    if (String(rows[i][it] || '').trim() !== String(docType)) continue;
    var v = parseInt(String(rows[i][iv] || '0').replace(/[^0-9]/g, ''), 10);
    if (!isNaN(v) && v > max) max = v;
  }
  return max + 1;
}

/* 저장 — 🔴 한 번의 setValues 로 같이 넣는다(한쪽만 들어가는 일이 없게) */
function contractDocSave(user, p) {
  p = p || {};
  var cid = String(p.contractId || '').trim();
  cdocGuard_(user, cid);

  var docs = [];
  for (var t = 0; t < CDOC_TYPES.length; t++) {
    var dt = CDOC_TYPES[t];
    var b = String((p.docs || {})[dt] == null ? '' : (p.docs || {})[dt]);
    if (!b.trim()) continue;                       // 빈 것은 넣지 않는다
    if (b.length > CDOC_MAX_BODY) throw new Error(dt + ' 본문이 너무 깁니다(' + b.length + '자)');
    docs.push({ docType: dt, body: b });
  }
  if (!docs.length) throw new Error('보관할 본문이 없습니다 — 먼저 문서를 만들어 주세요');

  var src = String(p.source || '').trim();
  if (src !== 'local' && src !== 'ai') throw new Error("source 는 local 또는 ai 여야 합니다");
  var who = String(p.createdBy || '').trim() || (user ? String(user.name || user.id || '') : '');

  return withWriteLock_(function () {
    var sh = getOrCreateSheet('contractDocuments');
    var rows = sh.getDataRange().getValues();
    var h = (rows.length ? rows[0] : []).map(String);
    if (!h.length || h.indexOf('contractId') < 0) {
      h = HEADERS.contractDocuments.slice();
      sh.getRange(1, 1, 1, h.length).setValues([h]);
      rows = [h];
    }
    var now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
    var lines = [], saved = [];
    for (var i = 0; i < docs.length; i++) {
      var ver = cdocNextVersion_(rows, h, cid, docs[i].docType);
      var o = {
        id: 'CD' + Utilities.getUuid().slice(0, 8),
        contractId: cid, docType: docs[i].docType, version: String(ver),
        body: docs[i].body, source: src,
        createdAt: now, createdBy: who, status: 'saved',
        note: String(p.note || ''), updatedAt: now
      };
      var line = [];
      for (var c = 0; c < h.length; c++) line.push(o[h[c]] === undefined ? '' : o[h[c]]);
      lines.push(line);
      saved.push({ id: o.id, docType: o.docType, version: ver });
    }
    if (lines.length) {
      var at = sh.getLastRow() + 1;
      sh.getRange(at, 1, lines.length, h.length).setValues(lines);
      try { sh.getRange(at, 1, lines.length, h.length).setNumberFormat('@'); } catch (e) {}
    }
    logChange('contractDocuments', 'save', cid + ' · ' + saved.map(function (x) {
      return x.docType + ' v' + x.version; }).join(' · ') + ' (' + src + ')');
    return { contractId: cid, saved: saved, count: saved.length };
  });
}

/* 조회 — 권한은 getAllData 가 건다. 목록만 줄 때는 본문을 빼서 가볍게 보낸다. */
function contractDocList(user, p) {
  p = p || {};
  var all = getAllData('contractDocuments', user) || [];
  var cid = String(p.contractId || '').trim();
  if (cid) all = all.filter(function (o) { return String(o.contractId || '').trim() === cid; });
  var withBody = String(p.body || '') === '1';
  var docId = String(p.docId || '').trim();
  if (docId) {
    for (var i = 0; i < all.length; i++) if (String(all[i].id) === docId) return { rows: [all[i]] };
    return { rows: [] };          // 권한 밖이거나 없는 문서 — 빈 결과
  }
  all.sort(function (a, b) {
    var t = String(a.docType || '').localeCompare(String(b.docType || ''));
    if (t) return t;
    return (parseInt(b.version, 10) || 0) - (parseInt(a.version, 10) || 0);
  });
  if (!withBody) all = all.map(function (o) {
    var c = {};
    for (var k in o) if (k !== 'body') c[k] = o[k];
    c.bodyLen = String(o.body || '').length;
    return c;
  });
  return { rows: all };
}

/* 자산 삭제는 대표만. 시트 행만 지우고 **드라이브 원본은 남긴다**(규칙 23: 자동 영구삭제 금지). */
function brandDelete(user, id) {
  adminOnly_(user, '브랜드 자산 삭제');
  var r = deleteRow('brand', id, user);
  logChange('brand', 'delete', String(id) + ' (드라이브 원본은 그대로 — 폴더 ' + BRAND_FOLDER + ')');
  return r;
}

/* ═══════════════════════════════════════════════════════════════════
   🗂 승인·보고함 — 2026-09-08 (SaaS 1순위)
   기존 구조 확인 결과: 결재 시트·함수가 **없었다**. 그래서 지시대로 둘을 나눠 만든다.
     ① 데이터 인터페이스(읽기) approvalFeed_ : 기존 시트에서 "승인이 필요한 일"을 **파생**해 보여준다.
        새 데이터를 만들지 않는다 — 매물 검수 결과·이상거래 등급·브랜드 자산 상태·이 달 정산을 그대로 읽는다.
     ② 결재 기록(쓰기) 시트 '결재함' : 사람이 올린 요청과 대표의 결정만 남는다.
   상태: 요청 → 승인 / 반려 / 확인요청 (+ 기한이 지나면 '기한 초과'로 보인다. 상태값이 아니라 계산값)
   권한: 올리기는 누구나(직원 포함), **결정(승인·반려·확인요청)은 대표만**(adminOnly_).
   🔴 여기서 문자·카톡·메일을 보내지 않는다. 결재는 기록일 뿐이고 발송은 기존 승인 절차를 따른다.
   되돌리기: 이 블록 + SHEETS.approvals + HEADERS.approvals + doGet/doPost 의 '🗂 2026-09-08' 줄.
   ═══════════════════════════════════════════════════════════════════ */
var APPROVAL_STATUS = ['요청', '승인', '반려', '확인요청'];
var APPROVAL_DUE_DAYS = 3;          // 올린 날부터 이 날짜가 지나면 기한 초과로 본다(기본값)
var APPROVAL_FEED_MAX = 60;

function approvalNow_() { return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm'); }
function approvalDay_(d) { return Utilities.formatDate(d, 'Asia/Seoul', 'yyyy-MM-dd'); }
function approvalAddDays_(days) { return approvalDay_(new Date(Date.now() + days * 86400000)); }

/* ── ① 데이터 인터페이스: 기존 시트에서 '승인이 필요한 일'을 뽑는다(읽기 전용) ── */
function approvalFeed_(user) {
  var out = [], note = [];
  var pushed = {};
  function add(o) {
    var key = o.targetType + ':' + o.targetId + ':' + o.kind;
    if (pushed[key]) return;
    pushed[key] = 1;
    out.push(o);
  }
  // 1) 매물 검수 — 미검증(N) 은 직원 화면에서 연락처가 가려진다 → 대표 확인 필요
  try {
    var ls = getAllData('listings', user);
    for (var i = 0; i < ls.length; i++) {
      var l = ls[i];
      if (/계약완료|임대중|거래완료/.test(String(l.status || ''))) continue;
      var v = String(l.verified || '');
      if (v === 'N') add({ kind: '매물 검수', targetType: 'listing', targetId: l.id, priority: '높음',
        title: [l.apt, l.addr2].filter(String).join(' ') + ' — 미검증', why: String(l.auditNote || ''), dept: '운영부', go: 'audit' });
      else if (v === 'R') add({ kind: '매물 검토', targetType: 'listing', targetId: l.id, priority: '보통',
        title: [l.apt, l.addr2].filter(String).join(' ') + ' — 검토대기', why: String(l.auditNote || ''), dept: '운영부', go: 'audit' });
    }
  } catch (e) { note.push('매물 확인 불가: ' + (e && e.message || e)); }
  // 2) 이상거래·추적 계약, 3) 중개보수 미입력(이 달)
  try {
    var cs = getAllData('contracts', user);
    var mon = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM');
    for (var c = 0; c < cs.length; c++) {
      var k = cs[c];
      if (k.riskGrade === 'RED') add({ kind: '이상거래', targetType: 'contract', targetId: k.id, priority: '높음',
        title: String(k.apt || '') + ' — 실거래 범위 크게 벗어남(RED)', why: String(k.riskCode || ''), dept: '운영부', go: 'contract' });
      else if (k.riskGrade === 'AMBER') add({ kind: '이상거래', targetType: 'contract', targetId: k.id, priority: '보통',
        title: String(k.apt || '') + ' — 실거래 범위 밖(AMBER)', why: String(k.riskCode || ''), dept: '운영부', go: 'contract' });
      if (/CANCELLED|REGISTRY_DELAY|REPORT_MISSING/.test(String(k.trackState || ''))) add({ kind: '계약 추적', targetType: 'contract', targetId: k.id, priority: '높음',
        title: String(k.apt || '') + ' — ' + String(k.trackState), why: '신고·해제·등기 확인 필요', dept: '운영부', go: 'contract' });
      if (String(k.start || '').slice(0, 7) === mon && !String(k.feeAmt || '').trim()) add({ kind: '정산', targetType: 'contract', targetId: k.id, priority: '보통',
        title: String(k.apt || '') + ' — 중개보수 미입력', why: '이 달 계약', dept: '관리부', go: 'payout' });
    }
  } catch (e2) { note.push('계약 확인 불가: ' + (e2 && e2.message || e2)); }
  // 4) 브랜드 자산 검토대기
  try {
    var bs = getAllData('brand', user);
    for (var b = 0; b < bs.length; b++) {
      if (String(bs[b].status || '') !== '검토대기') continue;
      add({ kind: '브랜드 자산', targetType: 'brand', targetId: bs[b].id, priority: '낮음',
        title: String(bs[b].name || '') + ' — 승인 대기', why: String(bs[b].category || ''), dept: '브리즈디자인', go: 'brand' });
    }
  } catch (e3) { note.push('브랜드 확인 불가: ' + (e3 && e3.message || e3)); }
  var rank = { '높음': 0, '보통': 1, '낮음': 2 };
  out.sort(function (a, z) { return (rank[a.priority] - rank[z.priority]) || String(a.kind).localeCompare(String(z.kind)); });
  return { at: approvalNow_(), items: out.slice(0, APPROVAL_FEED_MAX), total: out.length, note: note };
}

/* 결재함(사람이 올린 것) + 자동 감지 목록을 한 번에 — 화면이 이것만 부르면 된다 */
function approvalList_(user, p) {
  var rows = [];
  try { rows = getAllData('approvals', user); } catch (e) { rows = []; }
  var today = approvalDay_(new Date());
  var counts = { 요청: 0, 승인: 0, 반려: 0, 확인요청: 0, 기한초과: 0 };
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    r.overdue = (String(r.status || '요청') === '요청' && String(r.dueAt || '') && String(r.dueAt) < today);
    var st = String(r.status || '요청');
    if (counts[st] !== undefined) counts[st]++;
    if (r.overdue) counts.기한초과++;
  }
  rows.sort(function (a, z) { return String(z.requestedAt || '').localeCompare(String(a.requestedAt || '')); });
  var feed = approvalFeed_(user);
  return { at: approvalNow_(), rows: rows, counts: counts, feed: feed.items, feedTotal: feed.total, feedNote: feed.note, role: user.role };
}

/* ── ② 결재 올리기 — 직원도 가능. 같은 대상·같은 종류가 이미 대기 중이면 새로 만들지 않는다 ── */
function approvalAdd(user, p) {
  p = p || {};
  var title = String(p.title || '').trim();
  if (!title) throw new Error('제목이 없습니다');
  var kind = String(p.kind || '기타').trim().slice(0, 20);
  var targetType = String(p.targetType || '').trim().slice(0, 20);
  var targetId = String(p.targetId || '').trim().slice(0, 40);
  var rows = [];
  try { rows = getAllData('approvals', user); } catch (e) {}
  if (targetType && targetId) {
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].targetType) === targetType && String(rows[i].targetId) === targetId
          && String(rows[i].kind) === kind && String(rows[i].status || '요청') === '요청') {
        return { id: rows[i].id, action: 'exists', error: '같은 건이 이미 결재 대기 중입니다' };
      }
    }
  }
  var days = parseInt(p.dueDays, 10);
  if (isNaN(days) || days < 0 || days > 60) days = APPROVAL_DUE_DAYS;
  var item = {
    id: 'ap_' + new Date().getTime().toString(36) + '_' + Math.floor(Math.random() * 900 + 100),
    kind: kind, title: title.slice(0, 120), deptFrom: String(p.dept || '').slice(0, 20),
    targetType: targetType, targetId: targetId,
    amount: String(p.amount || '').replace(/[^\d]/g, '').slice(0, 12),
    requester: user.name, requestedAt: approvalNow_(), dueAt: approvalAddDays_(days),
    status: '요청', decidedBy: '', decidedAt: '', reason: '',
    priority: (['높음', '보통', '낮음'].indexOf(String(p.priority)) >= 0) ? String(p.priority) : '보통',
    note: String(p.note || '').slice(0, 300), updatedAt: new Date().toISOString()
  };
  upsertRow('approvals', item, user);
  logChange('approvals', 'add', item.kind + ' / ' + item.title + ' / ' + user.name);
  return { id: item.id, action: 'inserted' };
}

/* ── 결정은 대표만 ── */
function approvalDecide(user, p) {
  adminOnly_(user, '결재 승인·반려');
  p = p || {};
  var id = String(p.id || '').trim();
  var status = String(p.status || '').trim();
  if (!id) throw new Error('id 가 없습니다');
  if (APPROVAL_STATUS.indexOf(status) < 0 || status === '요청') throw new Error('상태는 승인 / 반려 / 확인요청 만 됩니다');
  var rows = getAllData('approvals', user);
  var cur = null;
  for (var i = 0; i < rows.length; i++) if (String(rows[i].id) === id) { cur = rows[i]; break; }
  if (!cur) throw new Error('결재 건을 찾지 못했습니다: ' + id);
  var reason = String(p.reason || '').slice(0, 300);
  if (status === '반려' && !reason) throw new Error('반려는 사유를 적어야 합니다');
  cur.status = status;
  cur.decidedBy = user.name;
  cur.decidedAt = approvalNow_();
  cur.reason = reason;
  cur.updatedAt = new Date().toISOString();
  upsertRow('approvals', cur, user);
  logChange('approvals', 'decide', status + ' / ' + cur.title + ' / ' + user.name + (reason ? ' / ' + reason : ''));
  return { id: id, status: status, decidedAt: cur.decidedAt };
}


/* ═══════════════════════════════════════════════════════════════════════════════
 * 🌅 아침 자동 운영 — dailyOpsMorning (2026-09-09)
 *   사장님 지시: "매일 자동화할 수 있는 업무 전수조사해서 저절로 돌아가도록"
 *   전수조사: 03_지시어_문서\_전수조사_매일자동화_2026-09-09.md
 *   08:00 트리거 하나에, 사람이 매일 버튼으로 하던 일 셋을 얹는다(시각은 DAILY_OPS_HOUR). 한 항목이 실패해도 다음 항목은 계속.
 *   🔴 발송·삭제·등록은 하지 않는다(규칙: 자동 발송 트리거 절대 금지). 대기열을 채우고, 살피고, 기록만 한다.
 *     ① 당근·오일장 매물 수집 시작(gatherStart) — 이미 도는 중이면 건너뜀. 이어달리기(gatherStep)가 25분쯤 마저 돈다
 *     ② 공실확인 문자 대기열 채우기(vacSmsBuild) — 큐만 채운다. 발송은 화면 [발송] 버튼(사람)
 *     ③ 광고 유효기간 점검(adExpirySweep_) — adsFlat 의 게시일 + 채널 유효일(네이버 90·직방·다방 30)로
 *        3일 이내 만료·이미 만료를 찾아 변경이력에 남기고, 해당 건이 있을 때만 대표 메일 1통(만기알림과 같은 수신자)
 *   설치: 편집기에서 installDailyOpsTrigger() 1회 실행, 또는 대표 토큰으로 ?action=installDailyOpsTrigger
 *   수동 실행: ?action=dailyOpsRun (대표만). 수집 요일은 속성 DAILY_OPS_GATHER_DAYS(기본 매일).
 * ═══════════════════════════════════════════════════════════════════════════════ */
var DAILY_OPS_HOUR = 8;   // 🕗 2026-09-09 대표 지시: 매물 수집을 아침 8시에 자동 실행
var DAILY_OPS_AD_DAYS = 3;
// index.html PLATFORMS 의 validDays 와 같아야 한다(0 = 무기한 → 점검 안 함)
var AD_VALID_DAYS = { daangn: 0, naver: 90, isj: 0, zigbang: 30, dabang: 30, peterpan: 0, blog: 0 };
var AD_LABEL = { daangn: '당근', naver: '네이버', isj: '이실장', zigbang: '직방', dabang: '다방', peterpan: '피터팬', blog: '블로그' };

// 'yyyy-MM-dd' / 'yyyy-MM-dd HH:mm' / 'yyyy.MM.dd' → 그날 자정 Date, 못 읽으면 null.
// 스크립트 시간대(미국일 수 있음)와 무관하게 연·월·일 숫자만 쓴다 — Utilities.formatDate 로 하루가 밀리는 사고 방지.
function adDate_(s) {
  var m = String(s == null ? '' : s).match(/(\d{4})[-.\/](\d{1,2})[-.\/](\d{1,2})/);
  if (!m) return null;
  var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}
function adYmd_(d) {
  var m = d.getMonth() + 1, dd = d.getDate();
  return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (dd < 10 ? '0' : '') + dd;
}

function adExpirySweep_(daysAhead, rows, today) {
  daysAhead = (daysAhead == null) ? DAILY_OPS_AD_DAYS : Number(daysAhead);
  rows = rows || (getAllData('listings', null) || []);
  var t0 = today ? adDate_(today) : null;
  if (!t0) { var n = new Date(); t0 = new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
  var soon = [], expired = [];
  rows.forEach(function (l) {
    var st = String(l.status || '');
    if (st === '계약완료' || st === '거래완료' || st === '임대중' || st === '보류') return;   // 오프마켓은 광고를 내릴 대상이지 연장 대상이 아님
    String(l.adsFlat || '').split('|').forEach(function (seg) {
      if (!seg) return;
      var p = seg.split('~');
      var key = p[0], at = adDate_(p[2]);
      var valid = AD_VALID_DAYS[key];
      if (!valid || !at) return;
      var exp = new Date(at.getFullYear(), at.getMonth(), at.getDate() + valid);
      var left = Math.round((exp - t0) / 86400000);
      var item = { id: l.id || '', apt: l.apt || '', addr2: l.addr2 || '', platform: AD_LABEL[key] || key,
                   postedAt: p[2] || '', expiresAt: adYmd_(exp), daysLeft: left, no: p[1] || '' };
      if (left < 0) expired.push(item);
      else if (left <= daysAhead) soon.push(item);
    });
  });
  var byLeft = function (a, b) { return a.daysLeft - b.daysLeft; };
  soon.sort(byLeft); expired.sort(byLeft);
  return { soon: soon, expired: expired, checked: rows.length };
}

function adExpiryMail_(r) {
  if (!r || (!r.soon.length && !r.expired.length)) return false;
  var to = PropertiesService.getScriptProperties().getProperty('EXPIRY_ALERT_EMAIL')
        || Session.getEffectiveUser().getEmail();
  var line = function (x) {
    return '■ ' + (x.apt || x.id) + (x.addr2 ? ' ' + x.addr2 : '') + ' — ' + x.platform + ' 게시 ' + x.postedAt
      + ' → 만료 ' + x.expiresAt + ' (' + (x.daysLeft < 0 ? (-x.daysLeft) + '일 지남' : 'D-' + x.daysLeft) + ')';
  };
  var body = '대표님, 광고 유효기간을 점검했습니다.\n\n'
    + (r.expired.length ? '⛔ 이미 만료 — 재등록하거나 광고관리에서 끄세요\n' + r.expired.map(line).join('\n') + '\n\n' : '')
    + (r.soon.length ? '⏳ ' + DAILY_OPS_AD_DAYS + '일 이내 만료\n' + r.soon.map(line).join('\n') + '\n\n' : '')
    + 'CRM 📢 광고 관리 화면에서 확인하세요.\n'   // 사이트 주소는 적지 않는다 — verify_staff "사이트 주소 하드코딩 없음" 규칙(주소가 바뀌면 메일이 거짓말을 한다)
    + '(이 메일은 CRM 백엔드가 매일 아침 자동으로 점검해 해당 건이 있을 때만 보냅니다. 재등록은 사람이 합니다.)';
  MailApp.sendEmail(to, '📢[브리즈CRM 광고만료] 만료 ' + r.expired.length + '건 · 임박 ' + r.soon.length + '건', body);
  return true;
}

// 수집을 돌리는 요일 — 스크립트 속성 DAILY_OPS_GATHER_DAYS ('0'=일 … '6'=토, 쉼표로 여러 개, '*'=매일, ''=안 함).
//   기본 '*'(매일) — 2026-09-09 대표 지시 "매물 수집을 아침 8시에 자동 실행".
//   🔴 알아둘 위험: 수집 한 번이 트리거 실행시간 ~25분(4분×6~7단계)을 먹는다. GAS 트리거 총량은 하루 90분이고
//   smsQueueSweep(10분)·recRun(15분) 등이 이미 그 안에서 다툰다(09-07 기록). 문자 회수가 늦어지면 속성을 '1'(월요일만)로 줄인다.
var DAILY_OPS_GATHER_DAYS_DEFAULT = '*';
function dailyOpsGatherToday_(now) {
  var raw = PropertiesService.getScriptProperties().getProperty('DAILY_OPS_GATHER_DAYS');
  if (raw === null || raw === undefined) raw = DAILY_OPS_GATHER_DAYS_DEFAULT;
  raw = String(raw).trim();
  if (raw === '') return false;
  if (raw === '*') return true;
  var dow = String((now || new Date()).getDay());
  return raw.split(',').map(function (s) { return s.trim(); }).indexOf(dow) >= 0;
}

function dailyOpsMorning() {
  var sys = { role: 'admin', id: 'system', name: '아침자동운영' };
  var out = { at: nowStr_() };
  // ① 당근·오일장 수집 — 속성 DAILY_OPS_GATHER_DAYS 요일에만(기본 매일). 쿼터가 모자라면 속성으로 줄인다.
  try {
    if (!dailyOpsGatherToday_()) out.gather = '오늘은 수집 요일 아님(속성 DAILY_OPS_GATHER_DAYS)';
    else {
      var st = colState_();
      if (st && st.phase && st.phase !== 'done') out.gather = '이미 수집 중(' + st.phase + ') — 건너뜀';
      else { var g = gatherStart(sys, {}); out.gather = g.already ? '이미 수집 중 — 건너뜀' : '시작 ' + (g.tiles || 0) + '구역'; }
    }
  } catch (e1) { out.gather = '오류: ' + (e1 && e1.message || e1); }
  // ② 공실확인 문자 대기열 (발송 아님)
  try {
    var v = vacSmsBuild();
    var tg = v.targets, tgn = (tg && tg.length != null) ? tg.length : tg;
    out.vac = '대기열 +' + (v.added || 0) + ' (대상 ' + (tgn == null ? '?' : tgn) + ')';
  } catch (e2) { out.vac = '오류: ' + (e2 && e2.message || e2); }
  // ③ 광고 유효기간
  try {
    var r = adExpirySweep_(DAILY_OPS_AD_DAYS);
    out.ad = '만료 ' + r.expired.length + ' · 임박 ' + r.soon.length + ' / 점검 ' + r.checked;
    out.adMail = adExpiryMail_(r);
  } catch (e3) { out.ad = '오류: ' + (e3 && e3.message || e3); }
  try { logChange('ops', 'dailyMorning', '수집: ' + out.gather + ' | 공실문자: ' + out.vac + ' | 광고: ' + out.ad + (out.adMail ? ' (메일 발송)' : '')); } catch (e4) {}
  return out;
}

/* 🕗 지금 걸려 있는 예약(트리거)을 그대로 읽어 준다 — 2026-09-09 신설
   🔴 "돌고 있다"고 말하려면 실제로 걸려 있는지 봐야 한다. 설치했다고 도는 게 아니다. */
function triggerList() {
  var all = ScriptApp.getProjectTriggers(), out = [];
  for (var i = 0; i < all.length; i++) {
    var t = all[i], o = { fn: t.getHandlerFunction(), type: String(t.getEventType()) };
    try { o.at = String(t.getTriggerSource()); } catch (e) {}
    out.push(o);
  }
  return { count: out.length, rows: out, dailyOpsHour: DAILY_OPS_HOUR,
           hasDailyOps: out.some(function (x) { return x.fn === 'dailyOpsMorning'; }) };
}

function installDailyOpsTrigger() {
  var all = ScriptApp.getProjectTriggers(), removed = 0;
  for (var i = 0; i < all.length; i++) {
    if (all[i].getHandlerFunction() === 'dailyOpsMorning') { ScriptApp.deleteTrigger(all[i]); removed++; }
  }
  ScriptApp.newTrigger('dailyOpsMorning').timeBased().everyDays(1).atHour(DAILY_OPS_HOUR).nearMinute(0).create();
  return { installed: true, hour: DAILY_OPS_HOUR, minute: 0, removed: removed };
}
