document.addEventListener('DOMContentLoaded', () => {
    const guideHTML = `
        <div id="guide-wrapper">
            <div id="guide-header">
                <h2>📢 2026.08.04 세법 개정안 및 계산기 사용 설명서</h2>
                <span id="guide-toggle-icon">▼</span>
            </div>
            <div id="guide-content">
                <div class="guide-tabs">
                    <button class="guide-tab active" data-target="tab-reform">세법 개정안 요약</button>
                    <button class="guide-tab" data-target="tab-manual">프로그램 사용 설명서</button>
                </div>
                
                <!-- 개정안 요약 탭 -->
                <div id="tab-reform" class="guide-panel active">
                    <h3>1. 양도소득세 개정 (2026.08.04)</h3>
                    
                    <h4>장기보유특별공제 개편</h4>
                    <table class="guide-table">
                        <thead>
                            <tr>
                                <th>구분</th>
                                <th>시행</th>
                                <th>내용</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td rowspan="3">1세대 1주택</td>
                                <td>2027년</td>
                                <td>현행 유지</td>
                            </tr>
                            <tr>
                                <td>2028년</td>
                                <td>거주 <span class="highlight">6%</span> + 보유 <span class="highlight">2%</span> (공제한도 20억원)</td>
                            </tr>
                            <tr>
                                <td>2029년</td>
                                <td>거주 <span class="highlight">8%</span> + 보유 0% (공제한도 10억원)</td>
                            </tr>
                            <tr>
                                <td rowspan="3">다주택자</td>
                                <td>2027년</td>
                                <td>현행 유지</td>
                            </tr>
                            <tr>
                                <td>2028년</td>
                                <td>거주 <span class="highlight">2%</span>(최대30%) 또는 보유 <span class="highlight">1%</span>(최대15%) (공제한도 20억원)</td>
                            </tr>
                            <tr>
                                <td>2029년</td>
                                <td>거주 <span class="highlight">2%</span>(최대30%)만 인정 (공제한도 10억원)</td>
                            </tr>
                        </tbody>
                    </table>
                    
                    <h4>1세대 1주택 기본공제 확대</h4>
                    <ul class="guide-list">
                        <li>10년 이상 거주한 1세대 1주택 기본공제: 250만원 → <span class="highlight">2,500만원</span> (양도가액 30억원 이하)</li>
                    </ul>

                    <h4>다주택자 중과세율</h4>
                    <p style="font-size: 13px; color: #868e96; margin-top: -10px; margin-bottom: 5px;">※ 조정대상지역 내 양도 시 적용 (비조정지역은 <strong>기본세율</strong> 적용)</p>
                    <table class="guide-table">
                        <thead>
                            <tr><th>연도</th><th>2주택</th><th>3주택 이상</th></tr>
                        </thead>
                        <tbody>
                            <tr><td>2026년</td><td>+20%<br><span style="font-size:11px; color:#f03e3e;">(27년 소급 +5%)</span></td><td>+30%<br><span style="font-size:11px; color:#f03e3e;">(27년 소급 +10%)</span></td></tr>
                            <tr><td>2027년</td><td>+5%</td><td>+10%</td></tr>
                            <tr><td>2028년</td><td>+10%</td><td>+15%</td></tr>
                            <tr><td>2029년</td><td>+20%</td><td>+30%</td></tr>
                        </tbody>
                    </table>
                    <ul class="guide-list" style="margin-top: 10px;">
                        <li><strong>소급 재정산:</strong> 2026.5.10 ~ 2026.12.31 기간 중 양도하여 기존 중과세율(+20%, +30%)로 납부했더라도, 2027년 신고 시 완화된 세율(+5%, +10%)로 재정산(환급) 받을 수 있습니다.</li>
                    </ul>
                    
                    <h4>고령 1주택자 한시 감면</h4>
                    <ul class="guide-list">
                        <li><strong>대상:</strong> 65세 이상, 수도권 5년 이상 거주자가 주택 처분 후 비수도권 이전</li>
                        <li><strong>감면:</strong> 2027년 양도세 <span class="highlight">50% 감면</span>(최대 5억원) / 2028년 <span class="highlight">30% 감면</span>(최대 3억원)</li>
                    </ul>

                    <h3 style="margin-top:30px;">2. 종합부동산세 개정 (2026.08.04)</h3>
                    
                    <h4>기본공제</h4>
                    <ul class="guide-list">
                        <li>거주 1주택: 12억원 → <span class="highlight">14억원</span></li>
                        <li>비거주 1주택: 12억원 → <span class="highlight">9억원</span></li>
                        <li>그 외(다주택): 4억원 + (5억원 × 거주주택가액/주택가액총액)</li>
                    </ul>

                    <h4>공정시장가액비율</h4>
                    <ul class="guide-list">
                        <li>2026년: 60% (현행) / 2027년: 70%</li>
                        <li>2028년: 1주택·지방 2주택 <span class="highlight">70%</span> / 3주택 이상 <span class="highlight">80%</span></li>
                    </ul>
                    
                    <h4>세율 및 세부담 상한</h4>
                    <ul class="guide-list">
                        <li>2027년 3주택 이상 및 <strong>2028년 모든 주택 세율 통일</strong> (0.5% ~ 최고 5.0%)</li>
                        <li>세부담 상한: 현행 150% → <span class="highlight">200%</span></li>
                    </ul>
                </div>

                <!-- 사용 설명서 탭 -->
                <div id="tab-manual" class="guide-panel">
                    <h3>부동산계산기도우미 사용 설명서</h3>
                    <div class="manual-grid">
                        <div class="manual-card">
                            <h4>대출 계산기</h4>
                            <p>원리금 균등, 원금 균등 등 상환 방식에 따른 월 납입금과 총 이자를 계산합니다. 대출금, 금리, 기간을 입력하여 자금 계획을 세워보세요.</p>
                        </div>
                        <div class="manual-card">
                            <h4>양도소득세 계산</h4>
                            <p>취득가액, 양도가액, 필요경비 등을 입력하여 양도소득세를 산출합니다. 보유기간과 주택 수에 따른 세금 차이를 미리 확인하세요.<br><br>
                            <span style="font-size: 13px; color: #f03e3e;">※ <b>다주택 중과세율 옵션</b>에서 '2027년 양도 및 2026년 소급 재정산'을 선택하면, 2026년 매도자가 내년에 환급받을 세액(재정산)을 미리 계산해 볼 수 있습니다.</span></p>
                        </div>
                        <div class="manual-card">
                            <h4>취득세 계산</h4>
                            <p>주택 매매가액을 기준으로 취득세율을 적용하고, 국민주택채권 할인료와 법무사 수수료 등 부동산 취득 시 발생하는 부대비용을 계산합니다.</p>
                        </div>
                        <div class="manual-card">
                            <h4>종부세 시나리오 (화면 하단)</h4>
                            <p>화면 맨 아래의 <strong>[종부세 개편 시나리오 보기]</strong>를 클릭하면, 2026년~2028년 개편안에 따른 종부세(기본 산출세액) 변화를 시뮬레이션 할 수 있습니다.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Inject before the root div
    const rootEl = document.getElementById('root');
    rootEl.insertAdjacentHTML('beforebegin', guideHTML);

    // Toggle Wrapper Logic
    const header = document.getElementById('guide-header');
    const content = document.getElementById('guide-content');
    const icon = document.getElementById('guide-toggle-icon');

    header.addEventListener('click', () => {
        const isActive = content.classList.contains('active');
        if (isActive) {
            content.classList.remove('active');
            icon.classList.remove('open');
        } else {
            content.classList.add('active');
            icon.classList.add('open');
        }
    });

    // Tabs Logic
    const tabs = document.querySelectorAll('.guide-tab');
    const panels = document.querySelectorAll('.guide-panel');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active from all tabs and panels
            tabs.forEach(t => t.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));
            
            // Add active to clicked tab
            tab.classList.add('active');
            
            // Show corresponding panel
            const targetId = tab.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');
        });
    });
});
