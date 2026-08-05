/**
 * 건축물대장 — 주차대수·세대수·엘리베이터 조회  (브리즈부동산중개 CRM)
 * ---------------------------------------------------------------------------
 * 왜 필요한가
 *   당근 엑셀 30열에는 '총 주차대수' 칸이 없다. 그런데 당근 등록화면은 주차 '가능'을 고르면
 *   총 주차대수를 필수로 요구한다. 유일한 전달 경로가 매물 설명 문장이라, 대장에서 숫자를
 *   가져와 CRM이 설명문에 "총 주차대수 N대"로 써 넣는다.
 *
 * 기존 코드와의 관계 (중요)
 *   · 이미 있는 bldgLookup() 은 총층·사용승인일·해당층·전용면적만 돌려준다.
 *     주차·세대수·승강기는 표제부에 있는데도 안 쓰고 버리고 있었다.
 *   · 그래서 새 API 신청도, 새 서비스키도 필요 없다.
 *     기존 상수 BLDG_API_KEY 와 기존 헬퍼 datagoFetch(), pad4() 를 그대로 재사용한다.
 *   · 주소 → 법정동코드 변환은 브라우저(카카오 SDK)가 이미 하고 있으므로 서버는 관여하지 않는다.
 *     따라서 카카오 REST 키도 필요 없다.
 *
 * 설치 (딱 두 가지)
 *   1. 이 파일 내용을 Apps Script 프로젝트에 새 파일로 붙여넣는다.
 *   2. 🔴 doPost 안에 한 줄을 추가한다. doGet 이 아니다.
 *      이 스크립트에는 비슷한 함수가 둘 있고 action 분기도 양쪽에 있다.
 *        doGet  (85~118행)  e.parameter 사용. 여기 있는 action==='bldg' 는 매물 등록화면용이라
 *                           절대 건드리지 말 것. 여기 넣으면 body 미정의로 터진다.
 *        doPost (123~140행) body 사용.  ← 여기다. CRM 이 POST 로 부르기 때문이다.
 *
 *      doPost 의  return err('알 수 없는 action: ' + action);  바로 위에 한 줄:
 *
 *        if (action === 'bldgStat') return ok({ data: bldgStat(body) });
 *
 *      결과:
 *        if (action === 'syncAll')  return ok({ result: syncAll(body.payload) });
 *        if (action === 'bldgStat') return ok({ data: bldgStat(body) });
 *        return err('알 수 없는 action: ' + action);
 *
 *   3. 배포 → 배포 관리 → 연필(수정) → 새 버전 → 배포.
 *      🔴 '새 배포'는 URL이 바뀌어 모든 기기 연결이 끊긴다. 절대 금지.
 *
 * 반환값
 *   { bldgName, mainPurps, etcPurps, useAprDay, grndFlr, ugrndFlr,
 *     hhldCnt, parkTotal, parkPerHh, elevator, totArea, dongCnt }
 *   조회 실패(토지·무허가·미등재)는 예외를 던진다. 호출부가 건너뛰도록 되어 있다.
 */

function bldgStat(p) {
  if (!BLDG_API_KEY || BLDG_API_KEY.indexOf('여기에') === 0) {
    throw new Error('건축물대장 API 키가 설정되지 않았습니다 (Apps Script 코드의 BLDG_API_KEY)');
  }
  if (!p || !p.sigunguCd || !p.bjdongCd) {
    throw new Error('시군구코드·법정동코드가 필요합니다');
  }

  // 기존 bldgLookup 과 동일한 방식으로 키를 만든다 (Encoding 키는 그대로, Decoding 키는 인코딩)
  var keyParam = BLDG_API_KEY.indexOf('%') >= 0 ? BLDG_API_KEY : encodeURIComponent(BLDG_API_KEY);
  var baseQs = 'serviceKey=' + keyParam
    + '&sigunguCd=' + p.sigunguCd + '&bjdongCd=' + p.bjdongCd
    + '&platGbCd=' + (p.platGbCd || '0')
    + '&bun=' + pad4(p.bun) + '&ji=' + pad4(p.ji || '0')
    + '&numOfRows=100&_type=json';

  var items = datagoFetch('getBrTitleInfo', baseQs);
  if (!items || !items.length) {
    throw new Error('대장 없음(토지·무허가·미등재일 수 있음)');
  }

  // 한 필지에 여러 동이면: 동 번호가 오면 그걸로, 아니면 연면적이 가장 큰 동을 대표로 쓴다.
  var it = items[0];
  var dongDigits = String(p.dong || '').replace(/\D/g, '');
  if (dongDigits) {
    for (var i = 0; i < items.length; i++) {
      var dn = String(items[i].dongNm || '').replace(/\D/g, '');
      if (dn && dn === dongDigits) { it = items[i]; break; }
    }
  } else {
    for (var j = 1; j < items.length; j++) {
      if (_bnum(items[j].totArea) > _bnum(it.totArea)) it = items[j];
    }
  }

  // 주차는 기계식·자주식 × 옥내·옥외 네 칸을 합쳐야 총 대수가 된다.
  var parkTotal = _bnum(it.indrMechUtcnt) + _bnum(it.oudrMechUtcnt)
                + _bnum(it.indrAutoUtcnt) + _bnum(it.oudrAutoUtcnt);
  // 세대수는 공동주택 hhldCnt, 다가구 fmlyCnt, 집합상가 hoCnt 로 칸이 갈린다.
  var hhldCnt  = _bnum(it.hhldCnt) || _bnum(it.fmlyCnt) || _bnum(it.hoCnt);
  var elevator = _bnum(it.rideUseElvtCnt) + _bnum(it.emgenUseElvtCnt);

  var apr = String(it.useAprDay || '').replace(/\D/g, '');

  return {
    bldgName : String(it.bldNm || ''),
    mainPurps: String(it.mainPurpsCdNm || ''),
    etcPurps : String(it.etcPurps || ''),
    useAprDay: apr.length === 8 ? apr.slice(0, 4) + '-' + apr.slice(4, 6) + '-' + apr.slice(6) : '',
    grndFlr  : _bnum(it.grndFlrCnt),
    ugrndFlr : _bnum(it.ugrndFlrCnt),
    hhldCnt  : hhldCnt || null,
    parkTotal: parkTotal,
    parkPerHh: hhldCnt ? Math.round((parkTotal / hhldCnt) * 100) / 100 : null,
    elevator : elevator,
    totArea  : _bnum(it.totArea),
    dongCnt  : items.length
  };
}

function _bnum(v) {
  var n = parseFloat(String(v == null ? '' : v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

/** 설치 확인용 — Apps Script 편집기에서 이 함수를 직접 실행해 보면 된다.
 *  제주시 연동 260-15(에코드파리) 기준. 로그에 주차·세대수가 찍히면 정상. */
function testBldgStat() {
  Logger.log(JSON.stringify(bldgStat({
    sigunguCd: '50110', bjdongCd: '10800', bun: '0260', ji: '0015'
  }), null, 2));
}
