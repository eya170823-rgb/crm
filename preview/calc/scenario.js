document.addEventListener('DOMContentLoaded', () => {
    // Inject HTML structure
    const container = document.createElement('div');
    container.id = 'tax-scenario-container';
    
    container.innerHTML = `
        <div id="tax-scenario-toggle">종부세 / 재산세 시나리오 보기 ▾</div>
        <div id="tax-scenario-panel">
            <div class="tax-tabs">
                <button class="tax-tab active" data-target="tab-jongbu">종부세 (개편안)</button>
                <button class="tax-tab" data-target="tab-property">재산세 (예상)</button>
            </div>
            
            <div id="tab-jongbu" class="tax-tab-content active">
                <h3 class="scenario-title">개편안 기준 종합부동산세 계산</h3>
                
                <div class="scenario-form-group">
                    <label>연도 선택</label>
                    <select id="scenario-year">
                        <option value="2026">2026년 (현행)</option>
                        <option value="2027">2027년 (개편안)</option>
                        <option value="2028" selected>2028년 (세율 단일화)</option>
                    </select>
                </div>

                <div class="scenario-form-group">
                    <label>주택 유형</label>
                    <select id="scenario-house-type">
                        <option value="resident_1">거주 1주택</option>
                        <option value="non_resident_1">비거주 1주택</option>
                        <option value="joint_1_individual">1주택 공동명의 (각자 공제 · 지분 5:5 인별 계산)</option>
                        <option value="joint_1_special">1주택 공동명의 (1세대 1주택 특례 신청)</option>
                        <option value="multi_2_general">2주택 (일반)</option>
                        <option value="multi_2_provincial">2주택 (지방 2주택)</option>
                        <option value="multi_3_plus">3주택 이상</option>
                    </select>
                </div>

                <div class="scenario-form-group">
                    <label>주택가액총액 (총 공시가격, 원)</label>
                    <input type="text" id="scenario-total-value" placeholder="예: 1500000000" />
                </div>

                <div class="scenario-form-group" id="resident-value-group">
                    <label>거주주택가액 (거주중인 주택 공시가격, 원)</label>
                    <input type="text" id="scenario-resident-value" placeholder="다주택자의 경우 거주 주택 가액 입력" />
                </div>

                <div class="scenario-result">
                    <p>기본공제액: <span class="val" id="res-basic-deduction">0원</span></p>
                    <p>공정시장가액비율: <span class="val" id="res-fmv-ratio">0%</span></p>
                    <p>과세표준: <span class="val" id="res-tax-base">0원</span></p>
                    <p class="formula" id="res-formula-base" style="font-size: 0.85em; color: #868e96; margin-top: -8px; margin-bottom: 12px;"></p>
                    
                    <p class="total-tax" style="margin-top:10px;">총 납부세액 (추정): <span class="val" id="res-total-tax">0원</span></p>
                    <div style="font-size: 0.85em; color: #555; margin-top: 5px; background: #fff; padding: 10px; border-radius: 5px; border: 1px solid #ddd;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:5px;"><span>종부세액:</span> <span id="res-calculated-tax" style="font-weight:bold; color:#d32f2f;">0원</span></div>
                        <p class="formula" id="res-formula-tax" style="font-size: 0.85em; color: #868e96; margin-top: 0px; margin-bottom: 5px; text-align: right; line-height: 1.2;"></p>
                        <div style="display:flex; justify-content:space-between;"><span>농어촌특별세(20%):</span> <span id="res-rural-tax" style="font-weight:bold; color:#d32f2f;">0원</span></div>
                    </div>
                </div>
                
                <div id="joint-special-notice" style="display: none; margin-top: 15px; padding: 10px; background-color: #e7f5ff; border-left: 4px solid #339af0; font-size: 0.85em; color: #1864ab; line-height: 1.5; border-radius: 4px;">
                    <strong>💡 1세대 1주택 공동명의 특례 신청 안내</strong><br/>
                    특례를 적용받기 위해서는 <strong>매년 9월 16일부터 9월 30일까지</strong> 관할 세무서 또는 홈택스를 통해 개별적으로 신청해야 합니다. (기한 내 미신청 시 각자 9억 공제로 자동 계산됩니다)<br/>
                    특례를 신청하면 지분자 중 1인이 납세의무자가 되어 <strong>1세대1주택자로 보아 12억(2027년 이후 개편안 14억)</strong>을 공제받고, 고령자·장기보유 세액공제도 받을 수 있습니다.
                </div>

                <div id="joint-individual-notice" style="display: none; margin-top: 15px; padding: 10px; background-color: #fff4e6; border-left: 4px solid #f76707; font-size: 0.85em; color: #d9480f; line-height: 1.5; border-radius: 4px;">
                    <strong>💡 공동명의(각자 공제) 계산 방식</strong><br/>
                    종부세는 사람별로 매기는 세금입니다. 이 항목은 <strong>지분 5:5를 가정</strong>해 총 공시가격을 절반으로 나눈 뒤,
                    각자에게 공제와 누진세율을 적용하고 합산합니다. 지분 비율이 5:5가 아니면 실제 세액과 달라집니다.
                </div>

                <div class="scenario-note" style="margin-top: 15px; padding: 10px; background-color: #f8f9fa; border-left: 4px solid #adb5bd; font-size: 0.85em; color: #495057; line-height: 1.5; border-radius: 4px;">
                    <strong>※ 참고 메모 (안내사항)</strong><br/>
                    <strong>2026년은 현행 세법</strong>, 2027·2028년은 <strong>개편안(국회 통과 전 — 확정 아님)</strong> 기준으로 계산합니다.
                    과세표준과 산출세액을 즉시 시뮬레이션해 보기 위한 <strong>추정치</strong>입니다.<br/>
                    세부담 상한(현행 150% → 개편 200%), 연령·보유기간에 따른 세액공제(1세대1주택 최대 80%)는 <strong>반영되지 않았습니다</strong>
                    — 고령 1주택자는 실제 세액이 이보다 크게 줄 수 있으므로 이 숫자를 그대로 안내하지 마십시오.<br/>
                    <span style="color:#868e96;">세율·공제 기준일 2026-08-13</span>
                </div>
            </div>

            <div id="tab-property" class="tax-tab-content">
                <h3 class="scenario-title">재산세 추정 계산</h3>
                
                <div class="scenario-form-group">
                    <label>물건 유형</label>
                    <select id="prop-house-type">
                        <option value="1">주택 (1세대 1주택 특례세율)</option>
                        <option value="multi">주택 (다주택 또는 일반세율)</option>
                        <option value="building">건축물 (일반 상가/사무실 등)</option>
                        <option value="land_gen">토지 (종합합산 - 나대지 등)</option>
                        <option value="land_sep">토지 (별도합산 - 상가 부속토지 등)</option>
                    </select>
                </div>

                <div class="scenario-form-group">
                    <label>시가표준액 (주택/토지는 공시가격, 건축물은 시가표준액, 원)</label>
                    <input type="text" id="prop-total-value" placeholder="예: 500000000" />
                </div>

                <div class="scenario-result">
                    <p>공정시장가액비율: <span class="val" id="prop-fmv-ratio">0%</span></p>
                    <p>과세표준: <span class="val" id="prop-tax-base">0원</span></p>
                    <p class="formula" id="prop-formula-base" style="font-size: 0.85em; color: #868e96; margin-top: -8px; margin-bottom: 12px;"></p>
                    
                    <p class="total-tax" style="margin-top:10px;">산출세액 (합계): <span class="val" id="prop-calculated-tax">0원</span></p>
                    <div style="font-size: 0.85em; color: #555; margin-top: 5px; background: #fff; padding: 10px; border-radius: 5px; border: 1px solid #ddd;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:5px;"><span>재산세액:</span> <span id="prop-pure-tax" style="font-weight:bold; color:#2e7d32;">0원</span></div>
                        <div style="display:flex; justify-content:space-between; margin-bottom:5px;"><span>도시지역분(0.14%):</span> <span id="prop-city-tax" style="font-weight:bold; color:#2e7d32;">0원</span></div>
                        <div style="display:flex; justify-content:space-between;"><span>지방교육세(20%):</span> <span id="prop-edu-tax" style="font-weight:bold; color:#2e7d32;">0원</span></div>
                    </div>
                </div>
                
                <div class="scenario-note" style="margin-top: 15px; padding: 10px; background-color: #f8f9fa; border-left: 4px solid #adb5bd; font-size: 0.85em; color: #495057; line-height: 1.5; border-radius: 4px;">
                    <strong>※ 참고 메모 (안내사항)</strong><br/>
                    - 공정시장가액비율: 1주택(43~45%), 다주택(60%), 건축물 및 토지(70%) 적용<br/>
                    - 1세대1주택 특례세율(지방세법 §111의2)은 <strong>시가표준액 9억 이하</strong>에만 적용됩니다. 9억을 넘으면 일반세율로 자동 전환됩니다.<br/>
                    - 토지 및 상가(건축물)는 도시지역분(0.14%)이 포함되어 계산됩니다. (도시지역 내로 가정)<br/>
                    - 본 계산은 추정치이며 세부담 상한선 등은 반영되지 않았습니다.<br/>
                    <span style="color:#868e96;">세율 기준일 2026-08-13 (지방세법 §111·§111의2·§112·§151)</span>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(container);

    const toggle = document.getElementById('tax-scenario-toggle');
    const panel = document.getElementById('tax-scenario-panel');
    
    toggle.addEventListener('click', () => {
        panel.classList.toggle('active');
        if (panel.classList.contains('active')) {
            toggle.innerText = '종부세 / 재산세 시나리오 닫기 ▴';
        } else {
            toggle.innerText = '종부세 / 재산세 시나리오 보기 ▾';
        }
    });

    const yearEl = document.getElementById('scenario-year');
    const typeEl = document.getElementById('scenario-house-type');
    const totalValEl = document.getElementById('scenario-total-value');
    const residentValEl = document.getElementById('scenario-resident-value');
    const residentGroupEl = document.getElementById('resident-value-group');

    // UI Updates
    const jointNoticeEl = document.getElementById('joint-special-notice');
    const jointIndivNoticeEl = document.getElementById('joint-individual-notice');

    function syncTypeUI() {
        const val = typeEl.value;
        residentGroupEl.style.display = val.startsWith('multi_') ? 'block' : 'none';
        // 종전에는 이 두 안내문을 표시하는 코드가 없어 화면에 영영 안 떴다 (2026-08-13 수정)
        if (jointNoticeEl) jointNoticeEl.style.display = (val === 'joint_1_special') ? 'block' : 'none';
        if (jointIndivNoticeEl) jointIndivNoticeEl.style.display = (val === 'joint_1_individual') ? 'block' : 'none';
    }

    typeEl.addEventListener('change', () => {
        syncTypeUI();
        calculateTax();
    });
    syncTypeUI();

    // Formatting inputs
    function formatNumber(input) {
        let val = input.value.replace(/[^0-9]/g, '');
        if (val) {
            input.value = parseInt(val, 10).toLocaleString('ko-KR');
        } else {
            input.value = '';
        }
        calculateTax();
    }

    totalValEl.addEventListener('input', () => formatNumber(totalValEl));
    residentValEl.addEventListener('input', () => formatNumber(residentValEl));
    yearEl.addEventListener('change', calculateTax);

    function parseVal(str) {
        if (!str) return 0;
        return parseInt(str.replace(/,/g, ''), 10) || 0;
    }

    function calculateTax() {
        const year = parseInt(yearEl.value, 10);
        const type = typeEl.value;
        const totalVal = parseVal(totalValEl.value);
        const residentVal = parseVal(residentValEl.value);

        if (totalVal === 0) {
            updateResult(0, 0, 0, 0, 0, '');
            return;
        }

        // 0. 지분 안분 (2026-08-13 수정)
        //    종부세는 인별 과세다. 1주택 공동명의(각자 공제)는 총액이 아니라
        //    각자 지분(5:5 가정)에 각자 공제·각자 누진세율을 적용한 뒤 합산해야 한다.
        const shares = (type === 'joint_1_individual') ? 2 : 1;
        const perVal = totalVal / shares;

        // 1. 기본공제 (1인당)
        let basicDeduction = 0;
        if (year === 2026) {
            // 현행 (2026년) — 종부세법 §8①
            if (type === 'resident_1' || type === 'non_resident_1' || type === 'joint_1_special') {
                // 공동명의 특례를 신청하면 1세대1주택자로 보아 12억 공제 (종부세법 §10의2)
                basicDeduction = 1200000000;
            } else {
                basicDeduction = 900000000; // 다주택·공동명의 각자 공제 (1인당 9억)
            }
        } else {
            // 개편안 (2027년 이후)
            if (type === 'resident_1' || type === 'joint_1_special') {
                basicDeduction = 1400000000;
            } else if (type === 'non_resident_1') {
                basicDeduction = 900000000;
            } else if (type === 'joint_1_individual') {
                // 1주택 공동명의는 본인 지분이 곧 거주주택 → 거주비율 1 → 4억 + 5억 = 9억
                basicDeduction = 900000000;
            } else {
                // 다주택 그 외
                let extra = 0;
                if (totalVal > 0) {
                    extra = 500000000 * (residentVal / totalVal);
                }
                basicDeduction = 400000000 + extra;
            }
        }

        // 2. 공정시장가액비율
        let fmvRatio = 0;
        if (year === 2026) {
            fmvRatio = 0.6;
        } else if (year === 2027) {
            fmvRatio = 0.7;
        } else if (year === 2028) {
            // 1주택(공동명의 포함)·지방 2주택 70% / 3주택 이상·조정지역 80%
            if (type === 'resident_1' || type === 'non_resident_1' ||
                type === 'joint_1_individual' || type === 'joint_1_special' ||
                type === 'multi_2_provincial') {
                fmvRatio = 0.7;
            } else {
                fmvRatio = 0.8;
            }
        }

        // 3. 과세표준 (1인당 — 단독명의면 shares=1이라 종전과 동일)
        let taxBase = Math.max(0, perVal - basicDeduction);
        taxBase = Math.floor(taxBase * fmvRatio);

        // 4. 세율 적용 (누진 계산)
        let brackets = [];
        if (year === 2026) {
            // 🔴 2026-08-13 수정: 종전에는 2026년에도 아래 '개편안' 표를 써서 과대 산출됐다.
            //    현행 종부세법 §9 세율 (6~12억 구간이 1.0%)
            if (type === 'multi_3_plus') {
                brackets = [
                    { limit: 300000000, rate: 0.005 },
                    { limit: 600000000, rate: 0.007 },
                    { limit: 1200000000, rate: 0.010 },
                    { limit: 2500000000, rate: 0.020 },
                    { limit: 5000000000, rate: 0.030 },
                    { limit: 9400000000, rate: 0.040 },
                    { limit: Infinity, rate: 0.050 },
                ];
            } else {
                brackets = [
                    { limit: 300000000, rate: 0.005 },
                    { limit: 600000000, rate: 0.007 },
                    { limit: 1200000000, rate: 0.010 },
                    { limit: 2500000000, rate: 0.013 },
                    { limit: 5000000000, rate: 0.015 },
                    { limit: 9400000000, rate: 0.020 },
                    { limit: Infinity, rate: 0.027 },
                ];
            }
        } else if (year === 2028 || type === 'multi_3_plus') {
            // 2028년 모든 주택, 2027년 3주택 이상
            brackets = [
                { limit: 300000000, rate: 0.005 },
                { limit: 600000000, rate: 0.007 },
                { limit: 1200000000, rate: 0.013 },
                { limit: 2500000000, rate: 0.020 },
                { limit: 5000000000, rate: 0.030 },
                { limit: 9400000000, rate: 0.040 },
                { limit: Infinity, rate: 0.050 },
            ];
        } else {
            // 2027년 2주택 이하 (개편안)
            brackets = [
                { limit: 300000000, rate: 0.005 },
                { limit: 600000000, rate: 0.007 },
                { limit: 1200000000, rate: 0.013 },
                { limit: 2500000000, rate: 0.015 },
                { limit: 5000000000, rate: 0.020 },
                { limit: 9400000000, rate: 0.027 },
                { limit: Infinity, rate: 0.035 },
            ];
        }

        let tax = 0;
        let previousLimit = 0;
        let taxDetailsArr = [];
        
        for (let b of brackets) {
            if (taxBase > previousLimit) {
                let taxableInBracket = Math.min(taxBase, b.limit) - previousLimit;
                tax += taxableInBracket * b.rate;
                
                let amt = taxableInBracket;
                let amtStr = '';
                if (amt >= 100000000) {
                    let uk = Math.floor(amt / 100000000);
                    let man = Math.floor((amt % 100000000) / 10000);
                    amtStr = uk + '억';
                    if (man > 0) amtStr += ' ' + man.toLocaleString() + '만';
                } else {
                    amtStr = Math.floor(amt / 10000).toLocaleString() + '만';
                }
                taxDetailsArr.push(`${amtStr}×${(b.rate*100).toFixed(1).replace('.0', '')}%`);
                
                previousLimit = b.limit;
            } else {
                break;
            }
        }
        
        // 세액공제(1세대1주택 연령/장기보유 등) 및 농어촌특별세 등은 생략된 기본 산출세액
        const perTax = Math.floor(tax);
        tax = perTax * shares;   // 공동명의는 1인분 × 인원수
        let taxDetails = taxDetailsArr.length > 0 ? taxDetailsArr.join(' + ') : '';

        updateResult(totalVal, basicDeduction, fmvRatio, taxBase, tax, taxDetails, shares, perTax);
    }

    function updateResult(total, deduction, fmv, taxBase, tax, taxDetails, shares, perTax) {
        shares = shares || 1;
        const per = shares > 1 ? ' (1인당)' : '';
        const perVal = total / shares;

        document.getElementById('res-basic-deduction').innerText = Math.floor(deduction).toLocaleString('ko-KR') + '원' + per;
        document.getElementById('res-fmv-ratio').innerText = (fmv * 100).toFixed(0) + '%';
        document.getElementById('res-tax-base').innerText = taxBase.toLocaleString('ko-KR') + '원' + per;

        let formulaBase = shares > 1
            ? `계산식: (1인 지분 ${Math.floor(perVal).toLocaleString('ko-KR')}원 - 공제 ${Math.floor(deduction).toLocaleString('ko-KR')}원) × ${fmv*100}%  ※ 총 ${total.toLocaleString('ko-KR')}원 ÷ ${shares}명`
            : `계산식: (총주택 ${total.toLocaleString('ko-KR')}원 - 공제 ${Math.floor(deduction).toLocaleString('ko-KR')}원) × ${fmv*100}%`;
        if (perVal <= deduction && total > 0) {
            formulaBase = shares > 1
                ? `계산식: 1인 지분(${Math.floor(perVal).toLocaleString('ko-KR')}원)이 공제액 이하로 과세표준 0원`
                : `계산식: 주택가액이 공제액 이하로 과세표준 0원`;
        } else if (total === 0) {
            formulaBase = '';
        }
        document.getElementById('res-formula-base').innerText = formulaBase;

        document.getElementById('res-calculated-tax').innerText = tax.toLocaleString('ko-KR') + '원';

        let formulaTax = taxDetails ? `구간별 누진: [ ${taxDetails} ]` : '';
        if (formulaTax && shares > 1) {
            formulaTax += ` → 1인 ${(perTax || 0).toLocaleString('ko-KR')}원 × ${shares}명`;
        }
        document.getElementById('res-formula-tax').innerText = formulaTax;
        
        const ruralTax = Math.floor(tax * 0.2);
        const totalTax = tax + ruralTax;
        
        document.getElementById('res-rural-tax').innerText = ruralTax.toLocaleString('ko-KR') + '원';
        document.getElementById('res-total-tax').innerText = totalTax.toLocaleString('ko-KR') + '원';
    }
    // --- Tabs Logic ---
    const tabs = document.querySelectorAll('.tax-tab');
    const tabContents = document.querySelectorAll('.tax-tab-content');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            tab.classList.add('active');
            document.getElementById(tab.dataset.target).classList.add('active');
        });
    });

    // --- Property Tax Logic ---
    const propTypeEl = document.getElementById('prop-house-type');
    const propValEl = document.getElementById('prop-total-value');
    
    propValEl.addEventListener('input', () => formatNumber(propValEl));
    propValEl.addEventListener('input', calculatePropertyTax);
    propTypeEl.addEventListener('change', calculatePropertyTax);
    
    function calculatePropertyTax() {
        const type = propTypeEl.value;
        const totalVal = parseVal(propValEl.value);
        
        if (totalVal === 0) {
            updatePropResult(0, 0, 0, 0, 0, 0, '');
            return;
        }
        
        // 1. 공정시장가액비율
        let fmvRatio = 0.6;
        if (type === '1') {
            if (totalVal <= 300000000) fmvRatio = 0.43;
            else if (totalVal <= 600000000) fmvRatio = 0.44;
            else fmvRatio = 0.45;
        } else if (type === 'building' || type === 'land_gen' || type === 'land_sep') {
            fmvRatio = 0.7;
        }
        
        // 2. 과세표준
        let taxBase = Math.floor(totalVal * fmvRatio);
        
        // 3. 재산세액 계산
        let tax = 0;
        let brackets = [];
        
        if (type === '1' && totalVal <= 900000000) {
            // 🔴 2026-08-13 수정: 3·4구간 세율과 4구간 정액이 법정값보다 낮아 과소 산출됐다.
            //    지방세법 §111의2 (1세대1주택 특례세율, 시가표준액 9억 이하)
            //    3억 초과분은 42만원 + 0.35% 가 정답 (종전 코드는 34.5만원 + 0.2%)
            brackets = [
                { limit: 60000000, rate: 0.0005, base: 0 },
                { limit: 150000000, rate: 0.0010, base: 30000 },
                { limit: 300000000, rate: 0.0020, base: 120000 },
                { limit: Infinity, rate: 0.0035, base: 420000 }
            ];
        } else if (type === 'multi' || (type === '1' && totalVal > 900000000)) {
            brackets = [
                { limit: 60000000, rate: 0.0010, base: 0 },
                { limit: 150000000, rate: 0.0015, base: 60000 },
                { limit: 300000000, rate: 0.0025, base: 195000 },
                { limit: Infinity, rate: 0.0040, base: 570000 }
            ];
        } else if (type === 'land_gen') { // 종합합산 토지
            brackets = [
                { limit: 50000000, rate: 0.0020, base: 0 },
                { limit: 100000000, rate: 0.0030, base: 100000 },
                { limit: Infinity, rate: 0.0050, base: 250000 }
            ];
        } else if (type === 'land_sep') { // 별도합산 토지
            brackets = [
                { limit: 200000000, rate: 0.0020, base: 0 },
                { limit: 1000000000, rate: 0.0030, base: 400000 },
                { limit: Infinity, rate: 0.0040, base: 2800000 }
            ];
        } else if (type === 'building') { // 건축물 (단일세율 0.25%)
            brackets = [
                { limit: Infinity, rate: 0.0025, base: 0 }
            ];
        }
        
        let appliedBracket = brackets[0];
        let previousLimit = 0;
        
        for (let i = brackets.length - 1; i >= 0; i--) {
            if (i > 0 && taxBase > brackets[i-1].limit) {
                appliedBracket = brackets[i];
                previousLimit = brackets[i-1].limit;
                break;
            }
        }
        
        tax = appliedBracket.base + ((taxBase - previousLimit) * appliedBracket.rate);
        tax = Math.floor(tax);
        
        // 4. 도시지역분 (과세표준 * 0.14%) - 토지, 상가, 주택 모두 적용 가정
        let cityTax = Math.floor(taxBase * 0.0014);
        
        // 5. 지방교육세 (재산세액 * 20%)
        let eduTax = Math.floor(tax * 0.2);
        
        let total = tax + cityTax + eduTax;
        
        let formulaStr = `계산식: ${totalVal.toLocaleString('ko-KR')}원 × ${(fmvRatio*100).toFixed(0)}%`;
        
        updatePropResult(totalVal, fmvRatio, taxBase, tax, cityTax, eduTax, total, formulaStr);
    }
    
    function updatePropResult(totalVal, fmv, taxBase, pureTax, cityTax, eduTax, total, formulaStr) {
        document.getElementById('prop-fmv-ratio').innerText = (fmv * 100).toFixed(0) + '%';
        document.getElementById('prop-tax-base').innerText = taxBase.toLocaleString('ko-KR') + '원';
        
        const formulaEl = document.getElementById('prop-formula-base');
        if (formulaEl) formulaEl.innerText = formulaStr;
        
        document.getElementById('prop-pure-tax').innerText = pureTax.toLocaleString('ko-KR') + '원';
        document.getElementById('prop-city-tax').innerText = cityTax.toLocaleString('ko-KR') + '원';
        document.getElementById('prop-edu-tax').innerText = eduTax.toLocaleString('ko-KR') + '원';
        document.getElementById('prop-calculated-tax').innerText = total.toLocaleString('ko-KR') + '원';
    }

});
