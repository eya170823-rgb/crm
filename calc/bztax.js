/* bztax.js — 브리즈 세무 근거 패널 (2026-08-13 신설)
 *
 * 계산기 본체(React 빌드본)는 소스가 없어 고칠 수 없다. 그래서 scenario.js·guide.js 와
 * 같은 방식으로 평문 JS를 얹어, ① 계산기가 못 다루는 항목을 경고하고
 * ② 계산기에 아예 없는 세목(증여·상속·임대소득·취득세 감면)의 세율·공제를
 * 근거 조문과 함께 보여준다.
 *
 * 수치 출처: .claude/skills/tax-assistant/02_세율표_2026-08-13.md (검증일 2026-08-13)
 * 표기 규칙: ✅ 현행 시행 중 / 🟡 2026.8.4 개정안(국회 통과 전, 확정 아님)
 * 네임스페이스: bztax-*  (guide-*, scenario-*, tax-* 와 충돌 없음)
 */
document.addEventListener('DOMContentLoaded', () => {

    const html = `
    <div id="bztax-wrapper">
        <div id="bztax-alert">
            <strong>⚠️ 양도소득세 — 보유 2년 미만이면 이 계산기를 쓰지 마십시오.</strong>
            단기보유 중과(1년 미만 <b>70%</b> · 1~2년 <b>60%</b>, 소득세법 §104①)가 반영되지 않아
            <b>실제 세액의 절반 이하</b>로 나옵니다.
        </div>
        <div id="bztax-header">
            <h2>🧾 계산기에 없는 세금 · 세무 근거표 <span class="bztax-date">기준일 2026-08-13</span></h2>
            <span id="bztax-toggle-icon">▼</span>
        </div>
        <div id="bztax-content">
            <div class="bztax-tabs">
                <button class="bztax-tab active" data-target="bztax-caution">먼저 확인</button>
                <button class="bztax-tab" data-target="bztax-gift">증여 · 상속</button>
                <button class="bztax-tab" data-target="bztax-rent">임대소득 · 부가세</button>
                <button class="bztax-tab" data-target="bztax-acq">취득세 · 감면</button>
            </div>

            <!-- ① 먼저 확인 -->
            <div id="bztax-caution" class="bztax-panel active">
                <h3>이 계산기의 한계 — 손님에게 숫자를 말하기 전에</h3>
                <table class="bztax-table">
                    <thead><tr><th>세목</th><th>계산기</th><th>반드시 알아야 할 것</th></tr></thead>
                    <tbody>
                        <tr>
                            <td>양도소득세</td><td class="bztax-no">주의</td>
                            <td class="bztax-left"><b class="bztax-warn">단기보유 중과 미반영.</b> 보유 1년 미만 70% / 1~2년 60%.
                                보유 2년 이상이면 결과가 대체로 맞습니다. <span class="bztax-src">소득세법 §104①</span></td>
                        </tr>
                        <tr>
                            <td>종합부동산세</td><td class="bztax-ok">2026-08-13 정정</td>
                            <td class="bztax-left">2026년 세율이 개편안 표로 계산되던 오류를 고쳤습니다.
                                다만 <b>고령자·장기보유 세액공제(최대 80%)와 세부담 상한(150%)은 여전히 미반영</b> —
                                고령 1주택자는 실제가 더 적습니다. <span class="bztax-src">종부세법 §9의2·§10</span></td>
                        </tr>
                        <tr>
                            <td>재산세</td><td class="bztax-ok">2026-08-13 정정</td>
                            <td class="bztax-left">1세대1주택 특례세율 3·4구간이 낮게 잡혀 있던 오류를 고쳤습니다.
                                특례는 <b>시가표준액 9억 이하</b>만 적용됩니다. <span class="bztax-src">지방세법 §111의2</span></td>
                        </tr>
                        <tr>
                            <td>취득세</td><td class="bztax-ok">사용 가능</td>
                            <td class="bztax-left">단 <b>생애최초 감면·다주택 중과</b>는 계산기에 없습니다 → 아래 [취득세] 탭 참조</td>
                        </tr>
                        <tr>
                            <td>증여 · 상속 · 임대소득</td><td class="bztax-no">없음</td>
                            <td class="bztax-left">계산 기능이 없습니다. <b>금액을 말하지 말고</b> 아래 표의 공제 한도와 구조만 안내하십시오.</td>
                        </tr>
                    </tbody>
                </table>

                <h4>제주는 조정대상지역이 아닙니다 (비조정) — 답이 크게 달라지는 부분</h4>
                <table class="bztax-table">
                    <thead><tr><th>항목</th><th>조정대상지역</th><th class="bztax-hl">제주(비조정)</th></tr></thead>
                    <tbody>
                        <tr><td>양도세 다주택 중과</td><td>+20~30%p</td><td class="bztax-hl">적용 안 됨</td></tr>
                        <tr><td>1세대1주택 비과세 거주요건</td><td>2년 거주 필요</td><td class="bztax-hl">거주요건 없음 (보유 2년만)</td></tr>
                        <tr><td>취득세 중과 시작</td><td>2주택째 8%</td><td class="bztax-hl">3주택째 8% / 4주택째 12%</td></tr>
                        <tr><td>일시적 2주택 처분기한</td><td>2년(2026.8.4~ 개정안)</td><td class="bztax-hl">3년</td></tr>
                    </tbody>
                </table>
                <p class="bztax-note">※ 규제지역 지정은 바뀔 수 있습니다. 큰 건은 국토교통부 규제지역 현황을 확인하십시오.</p>
            </div>

            <!-- ② 증여 · 상속 -->
            <div id="bztax-gift" class="bztax-panel">
                <h3>증여세 <span class="bztax-src">상증세법 §53·§53의2·§56</span></h3>
                <div class="bztax-grid">
                    <div>
                        <h4>세율 (증여·상속 공통)</h4>
                        <table class="bztax-table">
                            <thead><tr><th>과세표준</th><th>세율</th><th>누진공제</th></tr></thead>
                            <tbody>
                                <tr><td>1억 이하</td><td>10%</td><td>—</td></tr>
                                <tr><td>~5억</td><td>20%</td><td>1,000만</td></tr>
                                <tr><td>~10억</td><td>30%</td><td>6,000만</td></tr>
                                <tr><td>~30억</td><td>40%</td><td>1억6,000만</td></tr>
                                <tr><td>30억 초과</td><td>50%</td><td>4억6,000만</td></tr>
                            </tbody>
                        </table>
                    </div>
                    <div>
                        <h4>증여재산공제 — <b>10년 합산</b></h4>
                        <table class="bztax-table">
                            <thead><tr><th>관계</th><th>공제액</th></tr></thead>
                            <tbody>
                                <tr><td>배우자</td><td class="bztax-hl">6억</td></tr>
                                <tr><td>직계존속 → 성년 자녀</td><td class="bztax-hl">5,000만</td></tr>
                                <tr><td>직계존속 → 미성년 자녀</td><td>2,000만</td></tr>
                                <tr><td>직계비속 → 직계존속</td><td>5,000만</td></tr>
                                <tr><td>기타 친족</td><td>1,000만</td></tr>
                            </tbody>
                        </table>
                        <p class="bztax-note">혼인일 전후 2년 또는 출생일 후 2년 이내 <b>1억 추가</b> 공제(통합한도 1억, 1회). §53의2</p>
                    </div>
                </div>
                <div class="bztax-callout">
                    <b>🔑 중개 현장 규칙 2가지</b><br/>
                    ① 증여 상담에는 <b>증여세 + 증여 취득세 3.5%</b>(지방교육세·농특세 포함 약 4.0%)를 반드시 함께 계산합니다.<br/>
                    ② 대출이 낀 주택을 증여하면 <b>부담부증여</b>가 되어 채무 승계분에 <b>양도세가 따로</b> 붙습니다. 먼저 고지하십시오.
                </div>

                <h3>상속세 <span class="bztax-src">상증세법 §18~§24</span></h3>
                <table class="bztax-table">
                    <thead><tr><th>공제 항목</th><th>금액</th></tr></thead>
                    <tbody>
                        <tr><td>일괄공제 (기초+인적 대신 선택 가능)</td><td class="bztax-hl">5억</td></tr>
                        <tr><td>배우자 상속공제</td><td class="bztax-hl">최소 5억 ~ 최대 30억</td></tr>
                        <tr><td>기초공제</td><td>2억</td></tr>
                        <tr><td>자녀공제 (1인당)</td><td>5,000만 <span class="bztax-plan">🟡 개편안 5억 확대 계류</span></td></tr>
                        <tr><td>금융재산 상속공제</td><td>순금융재산 20% (최대 2억)</td></tr>
                        <tr><td>동거주택 상속공제</td><td>6억 한도</td></tr>
                    </tbody>
                </table>
                <div class="bztax-callout">
                    <b>즉답</b>: "배우자가 계시면 대체로 <b>10억</b>(일괄 5억 + 배우자 5억)까지는 상속세가 나오지 않습니다.
                    다만 확정은 세무사 확인이 필요합니다."<br/>
                    ⚠ 상속개시 전 <b>10년 이내 증여재산은 합산</b>됩니다(§13). 미리 증여했다고 끝난 게 아닙니다.
                </div>
            </div>

            <!-- ③ 임대소득 · 부가세 -->
            <div id="bztax-rent" class="bztax-panel">
                <h3>주택임대소득 — 1단계는 "과세 대상인가" <span class="bztax-src">소득세법 §64의2</span></h3>
                <table class="bztax-table">
                    <thead><tr><th>보유 주택 수</th><th>월세</th><th>보증금(간주임대료)</th></tr></thead>
                    <tbody>
                        <tr><td>1주택</td><td>기준시가 <b>12억 초과</b> 고가주택만 과세</td><td>비과세</td></tr>
                        <tr><td>2주택</td><td class="bztax-hl">과세</td><td>비과세</td></tr>
                        <tr><td>3주택 이상</td><td class="bztax-hl">과세</td><td class="bztax-hl">과세</td></tr>
                    </tbody>
                </table>
                <p class="bztax-note">3주택 이상이라도 <b>전용 40㎡ 이하 &amp; 기준시가 2억 이하</b> 소형주택은 주택 수에서 제외됩니다(일몰 여부 확인 필요).</p>

                <h4>분리과세 (연 임대수입 2,000만원 이하 선택 가능) — 세율 14%</h4>
                <table class="bztax-table">
                    <thead><tr><th>구분</th><th>등록임대사업자</th><th>미등록</th></tr></thead>
                    <tbody>
                        <tr><td>필요경비율</td><td>60%</td><td>50%</td></tr>
                        <tr><td>기본공제</td><td>400만</td><td>200만</td></tr>
                    </tbody>
                </table>
                <p class="bztax-note">기본공제는 <b>다른 종합소득금액이 2,000만원 이하</b>일 때만 적용됩니다. 2,000만원을 넘으면 종합과세(6~45%).</p>
                <div class="bztax-callout bztax-callout-warn">
                    <b>⚠ 건강보험료를 먼저 말하십시오.</b> 임대소득이 잡히면 건보료가 오를 수 있습니다.
                    손님의 실질 관심사인데 모르고 "세금 얼마 안 나옵니다"라고 답하면 사고가 납니다.
                    (건보료는 세금이 아니라 이 계산기 범위 밖 — 국민건강보험공단 1577-1000)
                </div>

                <h3>부가가치세 — 상가·근생 중개용</h3>
                <table class="bztax-table">
                    <thead><tr><th>거래</th><th>부가세</th></tr></thead>
                    <tbody>
                        <tr><td>주택임대</td><td class="bztax-hl">면세 (전용면적 무관)</td></tr>
                        <tr><td>상가임대</td><td>과세 10%</td></tr>
                        <tr><td>상가매매</td><td>건물분 10% 과세 / <b>토지분 면세</b> → 계약서에 토지·건물 가액 구분 기재 필수</td></tr>
                    </tbody>
                </table>
                <p class="bztax-note">간이과세 기준: 일반 1억400만원 미만 / <b>부동산임대업·과세유흥장소는 4,800만원 미만</b>.</p>
            </div>

            <!-- ④ 취득세 -->
            <div id="bztax-acq" class="bztax-panel">
                <h3>주택 유상거래 표준세율 <span class="bztax-src">지방세법 §11①8</span></h3>
                <table class="bztax-table">
                    <thead><tr><th>취득가액</th><th>취득세</th><th>지방교육세</th><th>농특세<br/>(85㎡ 초과만)</th><th>합계</th></tr></thead>
                    <tbody>
                        <tr><td>6억 이하</td><td>1%</td><td>0.1%</td><td>0.2%</td><td>1.1% / <b>1.3%</b></td></tr>
                        <tr><td>6~9억</td><td colspan="3">세율(%) = (취득가액 × 2 ÷ 3억 − 3) ÷ 100</td><td>—</td></tr>
                        <tr><td>9억 초과</td><td>3%</td><td>0.3%</td><td>0.2%</td><td>3.3% / <b>3.5%</b></td></tr>
                    </tbody>
                </table>
                <p class="bztax-note">🔑 <b>농특세는 전용 85㎡ 이하면 비과세</b>입니다. 제주 소형 매물 상당수가 여기 해당합니다.</p>

                <h3>다주택·법인 중과 — 제주 기준 <span class="bztax-src">지방세법 §13의2</span></h3>
                <table class="bztax-table">
                    <thead><tr><th>구분</th><th>세율</th><th>제주 적용</th></tr></thead>
                    <tbody>
                        <tr><td>법인의 주택 취득</td><td>12%</td><td class="bztax-hl">적용</td></tr>
                        <tr><td>3주택 (비조정)</td><td>8%</td><td class="bztax-hl">제주는 3주택째부터</td></tr>
                        <tr><td>4주택 이상 (비조정)</td><td>12%</td><td class="bztax-hl">제주는 4주택째부터</td></tr>
                        <tr><td>2주택 + 조정지역</td><td>8%</td><td>제주 무관</td></tr>
                    </tbody>
                </table>
                <p class="bztax-note">일시적 2주택은 시행령 §28의5 요건을 갖추면 중과에서 제외됩니다. 증여 취득세는 3.5%(조정지역 고가주택 12%는 제주 무관).</p>

                <h3>생애최초 취득세 감면 <span class="bztax-src">지방세특례제한법 §36의3 · 2028.12.31 일몰</span></h3>
                <table class="bztax-table">
                    <thead><tr><th>항목</th><th>내용</th></tr></thead>
                    <tbody>
                        <tr><td>대상</td><td>본인·배우자 모두 무주택 + 본인 거주 목적</td></tr>
                        <tr><td>가액 한도</td><td class="bztax-hl">12억 이하</td></tr>
                        <tr><td>거래 형태</td><td>유상거래만 (부담부증여 제외)</td></tr>
                        <tr><td>감면액</td><td>산출세액 <b>200만원</b>(요건 충족 시 300만원) 한도로 면제</td></tr>
                        <tr><td class="bztax-warn">추징</td><td class="bztax-warn">취득일부터 <b>3년 이내</b> 매각·증여·임대 시 추징</td></tr>
                    </tbody>
                </table>
                <p class="bztax-note">🟡 개편안(확정 아님): 지방 준공후 미분양(85㎡ 이하 &amp; 6억 이하) 취득세 최대 50% 감면 1년 한시,
                    인구감소지역 세컨드홈 특례 확대 — 제주 내 해당 읍면은 확인이 필요합니다.</p>
            </div>

            <div id="bztax-foot">
                중개사는 세무대리 자격이 없습니다. 위 수치는 <b>상담 보조용 참고자료</b>이며 세액을 단정하지 마십시오.
                실제 신고·납부는 반드시 <b>세무사 확인</b>을 거치도록 안내하십시오.
                세율·공제는 자주 바뀝니다 — 기준일(2026-08-13)에서 3개월이 지났다면 최신 여부를 확인하고 쓰십시오.
            </div>
        </div>
    </div>`;

    const rootEl = document.getElementById('root');
    if (!rootEl) return;
    rootEl.insertAdjacentHTML('beforebegin', html);

    const header = document.getElementById('bztax-header');
    const content = document.getElementById('bztax-content');
    const icon = document.getElementById('bztax-toggle-icon');

    header.addEventListener('click', () => {
        const open = content.classList.contains('active');
        content.classList.toggle('active', !open);
        icon.classList.toggle('open', !open);
    });

    const tabs = document.querySelectorAll('.bztax-tab');
    const panels = document.querySelectorAll('.bztax-panel');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            const target = document.getElementById(tab.dataset.target);
            if (target) target.classList.add('active');
        });
    });
});
