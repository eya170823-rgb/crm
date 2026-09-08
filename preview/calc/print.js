document.addEventListener('DOMContentLoaded', () => {
  const content = localStorage.getItem('printContent');
  const headStyles = localStorage.getItem('printHead');
  
  if (headStyles) {
    document.head.innerHTML += headStyles;
  }
  
  if (content) {
    document.getElementById('print-root').innerHTML = `
      <div class="app-container" style="max-width: 100%; margin: 0; min-height: auto; box-shadow: none;">
        <main class="main-content" style="padding: 0;">
          ${content}
        </main>
      </div>
    `;
  }

  // 인쇄 전용 스타일 추가
  const style = document.createElement('style');
  style.innerHTML = `
    body { background-color: white !important; padding: 20px !important; }
    .action-btn, .quick-btn-group, .tabs-container { display: none !important; }
    .card, .result-card { box-shadow: none !important; border: 1px solid #ccc !important; }
    
    @media print {
      body { padding: 0 !important; margin: 0 !important; }
      .app-container { transform: scale(0.9); transform-origin: top center; }
      .card, .result-card { padding: 12px !important; margin-bottom: 10px !important; }
      .input-group { margin-bottom: 10px !important; }
      h2 { margin-bottom: 10px !important; font-size: 1.1rem !important; }
    }
  `;
  document.head.appendChild(style);

  // 로딩 후 약간의 딜레이를 주어 폰트나 CSS가 적용될 시간을 줌
  setTimeout(() => {
    window.print();
  }, 500);
});
