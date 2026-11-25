# -*- coding: utf-8 -*-
"""
브리즈 이실장 (exe) — 2026-11-25 대표 지시
  원본: 매경이실장 재등록 v1.1 배포용(노출종료 매물 재등록). 여기에 ERP 연결을 붙였다.
   · ERP 로그인(블로그 발행 프로그램과 같은 로그인 — 한 번 하면 둘 다 됨)
   · 통합조회 목록에서 ERP 매물장과 맞춰, ERP 에서 계약완료·거래완료·임대중·보류인 매물은 체크를 빼고 재등록도 막는다
   · 재등록이 끝나면 ERP 매물목록의 '이'(이실장) 광고 표시를 켠다
  결제(포인트 차감)는 지금처럼 사람이 체크한 매물만. 실행 오류는 프로그램 옆 '오류기록.txt'
"""
import asyncio
import os
import re
import sys
import threading
import tkinter as tk

def parse_item_dates_and_status(item):
    raw_period = item.get('period', '')
    combined_text = item.get('combined_text', item.get('status', ''))
    
    # 1. 등록일 (시간 제외)
    reg_date = raw_period.split(' ')[0] if raw_period and raw_period != '-' else raw_period
    
    # 2. 종료일 (combined_text에서 날짜 추출)
    end_date = ""
    match = re.search(r'(\d{2,4})[.-](\d{2})[.-](\d{2})\s*~\s*(\d{2,4})[.-](\d{2})[.-](\d{2})', combined_text)
    if match:
        end_date = f"{match.group(4)}-{match.group(5)}-{match.group(6)}"
        
    # 3. 진행상황 (combined_text에서 상태 키워드 추출)
    status_text = ""
    for kw in ["기간만료", "매물철회", "결제대기", "소유자완료", "소유자", "거래완료", "광고종료", "종료"]:
        if kw in combined_text:
            status_text = kw
            break
    if not status_text and not match:
        status_text = item.get('status', '')
        
    return reg_date, end_date, status_text
from tkinter import messagebox, filedialog
from tkinter import ttk

from playwright.async_api import async_playwright

import json as _json, time as _time, traceback as _tb
import urllib.request as _ur, urllib.parse as _up

_EXE_DIR = os.path.dirname(sys.executable if getattr(sys, 'frozen', False) else os.path.abspath(__file__))
_APP_DIR = os.path.join(os.environ.get('APPDATA', os.path.expanduser('~')), 'BreezeBlog')   # 블로그 프로그램과 같은 로그인 저장소
os.makedirs(_APP_DIR, exist_ok=True)


def crash_log(msg):
    try:
        with open(os.path.join(_EXE_DIR, '오류기록.txt'), 'a', encoding='utf-8') as f:
            f.write(_time.strftime('[%Y-%m-%d %H:%M:%S] ') + str(msg) + '\n')
    except Exception:
        pass


class ERP:
    """ERP(구글 서버) 연결 — 서버 주소는 프로그램 옆 breeze_blog_config.json, 로그인 토큰은 %APPDATA%\\BreezeBlog"""
    STOP = ('계약완료', '거래완료', '임대중', '보류')

    def __init__(self):
        self.conf = {}
        for p in (os.path.join(_EXE_DIR, 'breeze_blog_config.json'), os.path.join(_APP_DIR, 'config.json')):
            try:
                with open(p, encoding='utf-8') as f:
                    self.conf.update(_json.load(f))
            except Exception:
                pass
        self.rows = []

    def ok(self):
        return bool(self.conf.get('gas_url') and self.conf.get('token'))

    def _post(self, body):
        req = _ur.Request(self.conf['gas_url'], data=_json.dumps(body).encode('utf-8'), headers={'Content-Type': 'text/plain'})
        with _ur.urlopen(req, timeout=120) as r:
            return _json.loads(r.read().decode('utf-8'))

    def accounts(self):
        try:
            return self._post({'action': 'loginAccounts'}).get('result') or []
        except Exception:
            return []

    def login(self, account, pin):
        j = self._post({'action': 'login', 'account': account, 'password': pin})
        if not j.get('ok') or not j.get('token'):
            raise RuntimeError(j.get('error') or '로그인 실패')
        self.conf['token'], self.conf['account'] = j['token'], account
        with open(os.path.join(_APP_DIR, 'config.json'), 'w', encoding='utf-8') as f:
            _json.dump({'token': j['token'], 'account': account}, f, ensure_ascii=False)

    def load(self):
        q = _up.urlencode({'action': 'getAll', 'type': 'listings', 'compact': '1', 'token': self.conf.get('token', '')})
        with _ur.urlopen(self.conf['gas_url'] + '?' + q, timeout=180) as r:
            j = _json.loads(r.read().decode('utf-8'))
        if not j.get('ok'):
            raise RuntimeError(j.get('error') or '매물 조회 실패')
        if isinstance(j.get('cols'), list):
            cols = j['cols']
            self.rows = [{cols[i]: (row[i] if i < len(row) else '') for i in range(len(cols))} for row in j['rows']]
        else:
            self.rows = j.get('data') or []
        return len(self.rows)

    @staticmethod
    def _n(s):
        return re.sub(r'제주특별자치도|제주도|[\s()·,]', '', str(s or '')).lower()

    def match(self, loc, name, ho):
        """이실장 소재지·단지명/상세주소·호 → ERP 매물(같은 건물·번지, 호수가 맞으면 우선)"""
        nm, h, dong = self._n(name), re.sub(r'\D', '', str(ho or '')), (str(loc or '').split() or [''])[-1]
        if not nm:
            return None
        best, bs = None, 0
        for r in self.rows:
            apt, addr = self._n(r.get('apt')), self._n(r.get('addr')) + self._n(r.get('addrRoad'))
            if not ((apt and (nm in apt or apt in nm)) or nm in addr):
                continue
            sc = 3 + (2 if h and h in re.sub(r'\D', '', str(r.get('addr2') or '')) else 0) + (1 if dong and self._n(dong) in addr else 0)
            if sc > bs or (sc == bs and str(r.get('recvDate', '')) > str((best or {}).get('recvDate', ''))):
                best, bs = r, sc
        return best

    def mark_isj(self, r):
        """ERP 매물의 광고 표시에 이실장(isj) 켜기 — 화면의 '이' 아이콘과 같은 기록 방식"""
        segs = [x.strip() for x in str(r.get('adsFlat') or '').split('|') if x.strip()]
        rest = [x for x in segs if x.split('~')[0] not in ('isj', 'off:isj')]
        old = next((x for x in segs if x.split('~')[0] == 'isj'), None)
        flat = '|'.join(rest + [old or 'isj~~' + _time.strftime('%Y-%m-%d %H:%M') + '~'])
        j = self._post({'action': 'upsert', 'type': 'listings', 'data': {'id': r.get('id'), 'adsFlat': flat}, 'token': self.conf.get('token', '')})
        if j.get('ok'):
            r['adsFlat'] = flat
        return bool(j.get('ok'))

# ─── 색상 팔레트 (프리미엄 다크 네이비 + 오렌지 골드) ───
ACCENT      = "#ff6b35"   # 메인 오렌지
ACCENT2     = "#ffa552"   # 밝은 오렌지 (호버/강조)
BG_MAIN     = "#0b1626"   # 딥 네이비
BG_CARD     = "#112240"   # 카드 배경
BG_LIST     = "#0d1f3c"   # 리스트 배경
BG_HEADER   = "#0a1628"   # 헤더 배경
FG_MAIN     = "#cdd9e5"   # 기본 텍스트
FG_DIM      = "#8899aa"   # 흐린 텍스트
TEXT_COLOR  = "#ffffff"   # 흰 텍스트
GOLD        = "#ffc947"   # 골드 강조
SUCCESS     = "#2ecc71"   # 성공 초록
DANGER      = "#e74c3c"   # 위험 빨강


class App:
    def __init__(self, root):
        self.root = root
        self.root.title("브리즈 이실장 — 매물 자동 재등록 (ERP 연결)")
        self.root.geometry("1060x820")
        self.root.configure(bg=BG_MAIN)
        self.root.resizable(True, True)

        # ── 아이콘 설정 (작업표시줄 아이콘 캐시 초기화 및 다중해상도 렌더링) ──
        try:
            import ctypes
            # 캐시가 완전히 초기화되도록 ID 변경
            myappid = 'maekyung.leesiljang.automation.v1_5' 
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(myappid)
            
            if getattr(sys, 'frozen', False):
                base_path = sys._MEIPASS
            else:
                base_path = os.path.dirname(os.path.abspath(__file__))
            
            # 멀티 해상도(Multi-size)가 포함된 정규 ICO 적용
            icon_path = os.path.join(base_path, "app_icon.ico")
            
            if os.path.exists(icon_path):
                self.root.iconbitmap(default=icon_path)
        except Exception as e:
            pass

        # 상태 변수
        self.is_running = False
        self.is_reserved = False
        self._closing = False
        self.browser = None
        self.context = None
        self.page = None
        self._pw = None
        self.reservation_task = None

        self.scanned_items = []
        self.inter_delay = 0   # 매물 간 추가 대기(초): 0=빠름(~30초/건), 90=천천히(~2분/건)

        self.LOGIN_URL = "https://www.aipartner.com/home"
        self.TARGET_URL = "https://www.aipartner.com/offerings/ad_list"

        self.style = ttk.Style()
        self.style.theme_use("clam")
        self.style.configure("TLabel",
            background=BG_MAIN, foreground=FG_MAIN, font=("맑은 고딕", 10))
        self.style.configure("Treeview",
            background=BG_CARD, foreground=TEXT_COLOR,
            fieldbackground=BG_CARD, rowheight=32,
            font=("맑은 고딕", 9))
        self.style.configure("Treeview.Heading",
            background=BG_HEADER, foreground=GOLD,
            font=("맑은 고딕", 9, "bold"), relief="flat")
        self.style.map("Treeview",
            background=[("selected", "#1e4080")],
            foreground=[("selected", TEXT_COLOR)])
        self.style.configure("Vertical.TScrollbar",
            background=BG_CARD, troughcolor=BG_MAIN,
            arrowcolor=ACCENT, bordercolor=BG_MAIN)

        self._build_ui()
        self.load_account_info()
        self.erp = ERP()
        self.root.after(500, self._erp_start)
        self.loop = asyncio.new_event_loop()
        threading.Thread(target=self._start_loop, daemon=True).start()

        # 프로그램 시작 시 자동 로그인 실행
        self.root.after(500, self.start_login)

    def _build_ui(self):
        import datetime
        # ══════════════════════════════════════════
        # ① 최상단 헤더 (브랜드 바)
        # ══════════════════════════════════════════
        header = tk.Frame(self.root, bg=BG_HEADER, height=80)
        header.pack(fill=tk.X)
        header.pack_propagate(False)

        # 왼쪽: 브랜드 로고 영역
        brand_frame = tk.Frame(header, bg=BG_HEADER)
        brand_frame.pack(side=tk.LEFT, padx=18, pady=0, fill=tk.Y)

        # 브랜드 배지 (오렌지 캡슐)
        badge = tk.Frame(brand_frame, bg=ACCENT, padx=8, pady=2)
        badge.pack(anchor="w", pady=(14, 0))
        tk.Label(badge, text="AUTO", bg=ACCENT, fg="white",
                 font=("맑은 고딕", 7, "bold")).pack()

        # 메인 브랜드명
        brand_row = tk.Frame(brand_frame, bg=BG_HEADER)
        brand_row.pack(anchor="w", pady=(1, 0))
        tk.Label(brand_row, text="매경", bg=BG_HEADER, fg=ACCENT,
                 font=("맑은 고딕", 22, "bold")).pack(side=tk.LEFT)
        tk.Label(brand_row, text="이실장", bg=BG_HEADER, fg=TEXT_COLOR,
                 font=("맑은 고딕", 22, "bold")).pack(side=tk.LEFT)
        tk.Label(brand_row, text="  매물 자동 재등록", bg=BG_HEADER, fg=FG_DIM,
                 font=("맑은 고딕", 11)).pack(side=tk.LEFT, padx=(6, 0), pady=(4, 0))

        # 오른쪽: 버전 + 종료 버튼
        right_frame = tk.Frame(header, bg=BG_HEADER)
        right_frame.pack(side=tk.RIGHT, padx=18, fill=tk.Y)

        tk.Button(right_frame, text="✕  종 료", bg=DANGER, fg="white",
                  font=("맑은 고딕", 9, "bold"), relief="flat",
                  padx=14, pady=6, cursor="hand2",
                  command=self.on_closing).pack(side=tk.RIGHT, pady=22)

        tk.Label(right_frame, text="v1.1  |  커스텀", bg=BG_HEADER, fg=FG_DIM,
                 font=("맑은 고딕", 8)).pack(side=tk.RIGHT, padx=12, pady=26)

        # 헤더 하단 구분선 (오렌지)
        sep = tk.Frame(self.root, bg=ACCENT, height=3)
        sep.pack(fill=tk.X)

        # ══════════════════════════════════════════
        # ② 액션 버튼 패널
        # ══════════════════════════════════════════
        btn_panel = tk.Frame(self.root, bg=BG_CARD, pady=10)
        btn_panel.pack(fill=tk.X, padx=0)

        inner_btn = tk.Frame(btn_panel, bg=BG_CARD)
        inner_btn.pack(fill=tk.X, padx=14)
        for c in range(4):
            inner_btn.columnconfigure(c, weight=1)

        def make_btn(parent, text, col, bg, cmd, state=tk.NORMAL, columnspan=1):
            b = tk.Button(parent, text=text, bg=bg, fg=TEXT_COLOR,
                          font=("맑은 고딕", 10, "bold"), relief="flat",
                          height=2, cursor="hand2", state=state, command=cmd,
                          activebackground=ACCENT2, activeforeground="white")
            b.grid(row=0, column=col, columnspan=columnspan, sticky="ew", padx=4)
            return b

        self.btn_login = make_btn(inner_btn,
            "① 🌐  로그인", 0, "#1c3a6e", self.start_login)
        self.btn_auto_excel = make_btn(inner_btn,
            "② 📊  매물 통합조회 (종료/결제대기)", 1, "#14473e",
            self.start_auto_excel_combined, state=tk.DISABLED, columnspan=2)
        # 3번 컬럼은 스캔
        self.btn_scan = make_btn(inner_btn,
            "③ 🔎  화면스캔", 3, "#1c3a6e",
            self.start_scan, state=tk.DISABLED)

        # ══════════════════════════════════════════
        # ③ 툴바 (엑셀 저장/불러오기)
        # ══════════════════════════════════════════
        toolbar = tk.Frame(self.root, bg=BG_MAIN, pady=4)
        toolbar.pack(fill=tk.X, padx=14)

        # 구분선
        tk.Frame(toolbar, bg="#1e3a5f", width=2).pack(side=tk.LEFT, fill=tk.Y, padx=(0, 8))

        self.btn_save_excel = tk.Button(
            toolbar, text="💾 엑셀 저장", bg="#1a3a28", fg="#6ee7a0",
            font=("맑은 고딕", 9, "bold"), relief="flat", padx=10, pady=4,
            cursor="hand2", command=self.save_excel)
        self.btn_save_excel.pack(side=tk.LEFT, padx=3)

        self.btn_load_excel = tk.Button(
            toolbar, text="📂 엑셀 불러오기", bg="#1a3a28", fg="#6ee7a0",
            font=("맑은 고딕", 9, "bold"), relief="flat", padx=10, pady=4,
            cursor="hand2", command=self.load_excel)
        self.btn_load_excel.pack(side=tk.LEFT, padx=3)

        # ══════════════════════════════════════════
        # ④ 컨트롤 바 (선택 + 예약 + 실행)
        # ══════════════════════════════════════════
        ctrl_bar = tk.Frame(self.root, bg=BG_CARD, pady=6)
        ctrl_bar.pack(fill=tk.X, padx=0)

        inner_ctrl = tk.Frame(ctrl_bar, bg=BG_CARD)
        inner_ctrl.pack(fill=tk.X, padx=14)

        # 전체선택/해제
        for txt, cmd in [("☑ 전체선택", self.select_all), ("☐ 전체해제", self.deselect_all)]:
            tk.Button(inner_ctrl, text=txt, bg="#2a1a4a", fg="#c084fc",
                      font=("맑은 고딕", 9, "bold"), relief="flat",
                      padx=10, pady=4, cursor="hand2", command=cmd
                      ).pack(side=tk.LEFT, padx=3)

        # 상태 레이블
        self.lbl_status = tk.Label(inner_ctrl, text="스캔된 매물: 0건",
                                   bg=BG_CARD, fg=GOLD,
                                   font=("맑은 고딕", 10, "bold"))
        self.lbl_status.pack(side=tk.LEFT, padx=(12, 4))

        # 예약 영역
        reserve_frame = tk.Frame(inner_ctrl, bg=BG_CARD)
        reserve_frame.pack(side=tk.LEFT, padx=8)

        self.var_use_reserve = tk.BooleanVar(value=False)
        self.chk_reserve = tk.Checkbutton(
            reserve_frame, text="⏰ 예약",
            variable=self.var_use_reserve,
            bg=BG_CARD, fg=FG_MAIN,
            selectcolor="#1a2f4a",
            activebackground=BG_CARD, activeforeground=ACCENT,
            font=("맑은 고딕", 9, "bold"))
        self.chk_reserve.pack(side=tk.LEFT, padx=(0, 6))

        now = datetime.datetime.now()
        ent_style = dict(font=("Consolas", 10), justify="center",
                         bg="#0d1f3c", fg=TEXT_COLOR,
                         insertbackground=ACCENT,
                         relief="flat", highlightthickness=1,
                         highlightbackground="#1e4080",
                         highlightcolor=ACCENT)

        def _add_time_entry(parent, width, val, label):
            e = tk.Entry(parent, width=width, **ent_style)
            e.pack(side=tk.LEFT, padx=(2, 0))
            e.insert(0, str(val))
            tk.Label(parent, text=label, bg=BG_CARD, fg=FG_DIM,
                     font=("맑은 고딕", 8)).pack(side=tk.LEFT, padx=(2, 4))
            return e

        self.ent_year   = _add_time_entry(reserve_frame, 5, now.year,   "년")
        self.ent_month  = _add_time_entry(reserve_frame, 3, now.month,  "월")
        self.ent_day    = _add_time_entry(reserve_frame, 3, now.day,    "일")
        self.ent_hour   = _add_time_entry(reserve_frame, 3, now.hour,   "시")
        self.ent_minute = _add_time_entry(reserve_frame, 3, now.minute, "분")

        # ── 타임스케쥴 프리셋 버튼 ──
        tk.Frame(inner_ctrl, bg="#1e3a5f", width=2).pack(side=tk.LEFT, fill=tk.Y, padx=(6, 3))

        tk.Label(inner_ctrl, text="📅 골든타임:", bg=BG_CARD, fg=FG_DIM,
                 font=("맑은 고딕", 8, "bold")).pack(side=tk.LEFT, padx=(0, 2))

        def set_schedule(h, m):
            now_t = datetime.datetime.now()
            self.ent_year.delete(0, tk.END);   self.ent_year.insert(0, str(now_t.year))
            self.ent_month.delete(0, tk.END);  self.ent_month.insert(0, str(now_t.month))
            self.ent_day.delete(0, tk.END);    self.ent_day.insert(0, str(now_t.day))
            self.ent_hour.delete(0, tk.END);   self.ent_hour.insert(0, str(h))
            self.ent_minute.delete(0, tk.END); self.ent_minute.insert(0, str(m).zfill(2))
            self.var_use_reserve.set(True)
            self.log(f"⏰ 골든타임 설정 완료 → 오늘 {h}:{str(m).zfill(2)} 자동 예약!")

        for _lbl, _hh, _mm in [("🕙 10:30", 10, 30), ("🕧 12:30", 12, 30)]:
            tk.Button(inner_ctrl, text=_lbl,
                      bg="#1c2d5a", fg=GOLD,
                      font=("맑은 고딕", 9, "bold"), relief="flat",
                      padx=10, pady=3, cursor="hand2",
                      activebackground="#2a4080", activeforeground=GOLD,
                      command=lambda h=_hh, m=_mm: set_schedule(h, m)
            ).pack(side=tk.LEFT, padx=2)

        # ── 등록 속도 선택 버튼 ──
        tk.Frame(inner_ctrl, bg="#1e3a5f", width=2).pack(side=tk.LEFT, fill=tk.Y, padx=(6, 3))

        tk.Label(inner_ctrl, text="속도:", bg=BG_CARD, fg=FG_DIM,
                 font=("맑은 고딕", 8, "bold")).pack(side=tk.LEFT, padx=(0, 2))

        def set_speed(mode):
            if mode == "fast":
                self.inter_delay = 0
                self.btn_spd_fast.config(bg=ACCENT, fg="white")
                self.btn_spd_slow.config(bg="#1a2040", fg=FG_DIM)
                self.log("⚡ 등록 속도: [빠름] — 건당 약 30초 (추가 대기 없음)")
            else:
                self.inter_delay = 90
                self.btn_spd_fast.config(bg="#1a2040", fg=FG_DIM)
                self.btn_spd_slow.config(bg="#1a3a28", fg="#6ee7a0")
                self.log("🐢 등록 속도: [천천히] — 건당 약 2분 (90초 추가 대기)")

        self.btn_spd_fast = tk.Button(inner_ctrl, text="⚡ 빠름",
            bg=ACCENT, fg="white",
            font=("맑은 고딕", 9, "bold"), relief="flat",
            padx=9, pady=3, cursor="hand2",
            activebackground=ACCENT2, activeforeground="white",
            command=lambda: set_speed("fast"))
        self.btn_spd_fast.pack(side=tk.LEFT, padx=2)

        self.btn_spd_slow = tk.Button(inner_ctrl, text="🐢 천천히",
            bg="#1a2040", fg=FG_DIM,
            font=("맑은 고딕", 9, "bold"), relief="flat",
            padx=9, pady=3, cursor="hand2",
            activebackground="#2a5c31", activeforeground="#6ee7a0",
            command=lambda: set_speed("slow"))
        self.btn_spd_slow.pack(side=tk.LEFT, padx=2)
        # 매물삭제 버튼 (위험 강조 빨간색)
        self.btn_delete = tk.Button(inner_ctrl, text="🗑️  매물삭제", bg="#c0392b", fg="white",
            font=("맑은 고딕", 11, "bold"), relief="flat",
            padx=12, pady=6, cursor="hand2",
            activebackground="#e74c3c", activeforeground="white",
            command=self.start_deletion)
        # 작업 시작 버튼 (재등록)
        self.btn_execute = tk.Button(inner_ctrl, text="🚀  매물재등록", bg="white", fg="#1e4080",
            font=("맑은 고딕", 11, "bold"), relief="flat",
            padx=18, pady=6, cursor="hand2",
            activebackground="#e0e0e0", activeforeground="#1e4080",
            command=self.handle_action)
        self.btn_execute.pack(side=tk.RIGHT, padx=6)
        self.btn_delete.pack(side=tk.RIGHT, padx=6)

        # ══════════════════════════════════════════
        # 4.5 필터 및 계정정보 프레임
        # ══════════════════════════════════════════
        filter_panel = tk.Frame(self.root, bg=BG_CARD)
        filter_panel.pack(fill=tk.X, padx=14, pady=(6, 0))
        
        # ── 1. 계정 정보 줄 ──
        info_frame = tk.Frame(filter_panel, bg=BG_CARD)
        info_frame.pack(fill=tk.X, pady=4, padx=10)
        
        tk.Label(info_frame, text="👤 [계정정보]", bg=BG_CARD, fg=GOLD, font=("맑은 고딕", 9, "bold")).pack(side=tk.LEFT, padx=(0, 5))
        
        # 중개사 ID
        tk.Label(info_frame, text="중개사 ID:", bg=BG_CARD, fg=FG_MAIN, font=("맑은 고딕", 9)).pack(side=tk.LEFT, padx=(10, 2))
        self.ent_broker_id = tk.Entry(info_frame, width=12, bg="#0d1f3c", fg=TEXT_COLOR, relief="flat", insertbackground=ACCENT)
        self.ent_broker_id.pack(side=tk.LEFT, padx=(0, 10))
        
        # 이실장 ID
        tk.Label(info_frame, text="이실장 ID:", bg=BG_CARD, fg=FG_MAIN, font=("맑은 고딕", 9)).pack(side=tk.LEFT, padx=(5, 2))
        self.ent_user_id = tk.Entry(info_frame, width=12, bg="#0d1f3c", fg=TEXT_COLOR, relief="flat", insertbackground=ACCENT)
        self.ent_user_id.pack(side=tk.LEFT, padx=(0, 10))
        
        # 비밀번호
        tk.Label(info_frame, text="비밀번호:", bg=BG_CARD, fg=FG_MAIN, font=("맑은 고딕", 9)).pack(side=tk.LEFT, padx=(5, 2))
        self.ent_user_pw = tk.Entry(info_frame, width=12, show="*", bg="#0d1f3c", fg=TEXT_COLOR, relief="flat", insertbackground=ACCENT)
        self.ent_user_pw.pack(side=tk.LEFT, padx=(0, 10))

        # [저장] 버튼 추가
        tk.Button(info_frame, text="저장", bg="#2980b9", fg="white", font=("맑은 고딕", 8), cursor="hand2", command=self.save_account_info).pack(side=tk.LEFT, padx=(5, 0))

        # ── 2. 필터 줄 ──
        filter_frame = tk.Frame(filter_panel, bg=BG_CARD)
        filter_frame.pack(fill=tk.X, pady=(0, 4), padx=10)
        
        # 아파트명
        tk.Label(filter_frame, text="🏢 단지명:", bg=BG_CARD, fg=GOLD, font=("맑은 고딕", 9, "bold")).pack(side=tk.LEFT, padx=(0, 2))
        self.ent_apt_filter = tk.Entry(filter_frame, width=12, bg="#0d1f3c", fg=TEXT_COLOR, relief="flat", insertbackground=ACCENT)
        self.ent_apt_filter.pack(side=tk.LEFT, padx=(0, 4))
        
        tk.Button(filter_frame, text="선택(체크)", bg="#2a5c31", fg="white", font=("맑은 고딕", 8), cursor="hand2", command=self._filter_check_apt).pack(side=tk.LEFT, padx=1)
        tk.Button(filter_frame, text="해제", bg="#d35400", fg="white", font=("맑은 고딕", 8), cursor="hand2", command=self._filter_uncheck_apt).pack(side=tk.LEFT, padx=1)
        tk.Button(filter_frame, text="적용(조회)", bg="#1e4080", fg="white", font=("맑은 고딕", 8), cursor="hand2", command=self._apply_filters).pack(side=tk.LEFT, padx=(1, 15))
        
        # 거래유형
        tk.Label(filter_frame, text="거래종류:", bg=BG_CARD, fg=GOLD, font=("맑은 고딕", 9, "bold")).pack(side=tk.LEFT, padx=(0, 2))
        self.var_f_sale = tk.BooleanVar(value=True)
        self.var_f_jeonse = tk.BooleanVar(value=True)
        self.var_f_monthly = tk.BooleanVar(value=True)
        
        tk.Checkbutton(filter_frame, text="매매", variable=self.var_f_sale, bg=BG_CARD, fg=FG_MAIN, selectcolor="#1a2f4a", command=self._apply_filters).pack(side=tk.LEFT)
        tk.Checkbutton(filter_frame, text="전세", variable=self.var_f_jeonse, bg=BG_CARD, fg=FG_MAIN, selectcolor="#1a2f4a", command=self._apply_filters).pack(side=tk.LEFT)
        tk.Checkbutton(filter_frame, text="월세", variable=self.var_f_monthly, bg=BG_CARD, fg=FG_MAIN, selectcolor="#1a2f4a", command=self._apply_filters).pack(side=tk.LEFT, padx=(0, 15))
        
        # 등록일
        tk.Label(filter_frame, text="등록일:", bg=BG_CARD, fg=GOLD, font=("맑은 고딕", 9, "bold")).pack(side=tk.LEFT, padx=(0, 2))
        self.cb_period = ttk.Combobox(filter_frame, values=["전체", "최근 1주일", "최근 1개월", "최근 3개월", "최근 6개월"], width=10, state="readonly")
        self.cb_period.current(0)
        self.cb_period.pack(side=tk.LEFT)
        self.cb_period.bind("<<ComboboxSelected>>", lambda e: self._apply_filters())
        
        tk.Button(filter_frame, text="필터초기화", bg="#444444", fg="white", font=("맑은 고딕", 8), cursor="hand2", command=self._reset_filters).pack(side=tk.LEFT, padx=(10, 0))

        # ══════════════════════════════════════════
        # ⑤ 목록 프레임
        # ══════════════════════════════════════════
        list_outer = tk.Frame(self.root, bg=BG_MAIN)
        list_outer.pack(fill=tk.BOTH, expand=True, padx=14, pady=(6, 0))

        list_header = tk.Frame(list_outer, bg=BG_MAIN)
        list_header.pack(fill=tk.X, pady=(0, 4))
        tk.Label(list_header,
                 text="📋  노출종료 매물 목록",
                 bg=BG_MAIN, fg=ACCENT,
                 font=("맑은 고딕", 10, "bold")).pack(side=tk.LEFT)
        tk.Label(list_header,
                 text="(거래완료·소유자 자동 제외)",
                 bg=BG_MAIN, fg=FG_DIM,
                 font=("맑은 고딕", 8)).pack(side=tk.LEFT, padx=6, pady=2)

        list_frame = tk.Frame(list_outer, bg=BG_LIST,
                              highlightthickness=1,
                              highlightbackground="#1e4080")
        list_frame.pack(fill=tk.BOTH, expand=True)

        cols = ("체크", "No", "매물번호", "거래유형", "물건종류",
                "소재지", "단지명/상세주소", "동", "호", "면적",
                "가격", "등록일", "종료일", "진행상황", "작업")
        self.tree = ttk.Treeview(list_frame, columns=cols,
                                 show="headings", style="Treeview")

        col_cfg = [
            ("체크",        "☑",          40),
            ("No",         "No",          44),
            ("매물번호",    "매물번호",     96),
            ("거래유형",    "거래유형",     64),
            ("물건종류",    "물건종류",     64),
            ("소재지",      "소재지",       84),
            ("단지명/상세주소", "단지명/상세주소 🔽", 160),
            ("동",          "동",           52),
            ("호",          "호",           52),
            ("면적",        "면적",         110),
            ("가격",        "가격",          96),
            ("등록일",      "등록일",       100),
            ("종료일",      "종료일",       100),
            ("진행상황",    "진행상황 🔽",      84),
            ("작업",        "작업",          68),
        ]
        for col_id, heading, width in col_cfg:
            self.tree.heading(col_id, text=heading)
            self.tree.column(col_id, width=width, anchor="center", minwidth=30)

        # 짝수/홀수 행 및 체크 상태 색상 설정
        self.tree.tag_configure("odd",  background=BG_CARD)
        self.tree.tag_configure("even", background="#0f2848")
        self.tree.tag_configure("checked", background="#2a5c31") # 체크 시 연두색 강조 배경색
        self.tree.tag_configure("done", foreground=SUCCESS)
        self.tree.tag_configure("fail", foreground=DANGER)

        vsb = ttk.Scrollbar(list_frame, orient="vertical",
                            command=self.tree.yview)
        self.tree.configure(yscrollcommand=vsb.set)
        vsb.pack(side=tk.RIGHT, fill=tk.Y)
        self.tree.pack(fill=tk.BOTH, expand=True)
        self.tree.bind("<ButtonRelease-1>", self._on_left_click)
        self.tree.bind("<Button-3>", self._on_right_click) # 우클릭은 드롭다운 필터
        self.tree.bind("<Double-1>", self._on_left_click) # 더블클릭 방지/연동

        # ══════════════════════════════════════════
        # ⑥ 로그 패널
        # ══════════════════════════════════════════
        log_outer = tk.Frame(self.root, bg=BG_MAIN)
        log_outer.pack(fill=tk.X, padx=14, pady=(6, 10))

        log_title_bar = tk.Frame(log_outer, bg="#0a1628", pady=4)
        log_title_bar.pack(fill=tk.X)
        tk.Label(log_title_bar, text="  ⬛ 진행 로그",
                 bg="#0a1628", fg=GOLD,
                 font=("맑은 고딕", 9, "bold")).pack(side=tk.LEFT)

        log_frame = tk.Frame(log_outer, bg="#060e1a", height=150,
                             highlightthickness=1,
                             highlightbackground="#1e4080")
        log_frame.pack(fill=tk.X)
        log_frame.pack_propagate(False)

        self.txt_log = tk.Text(
            log_frame, bg="#060e1a", fg="#39ff14",
            font=("Consolas", 9), relief="flat",
            insertbackground=ACCENT,
            selectbackground="#1e4080", selectforeground=TEXT_COLOR)
        self.txt_log.pack(fill=tk.BOTH, expand=True, padx=6, pady=4)

        # 하단 상태바
        status_bar = tk.Frame(self.root, bg="#050e1a", height=22)
        status_bar.pack(fill=tk.X, side=tk.BOTTOM)
        status_bar.pack_propagate(False)
        tk.Label(status_bar,
                 text="  매경이실장 자동화 시스템  |  aipartner.com",
                 bg="#050e1a", fg=FG_DIM,
                 font=("맑은 고딕", 7)).pack(side=tk.LEFT, pady=3)
        tk.Label(status_bar,
                 text="Powered by Playwright  ●  ",
                 bg="#050e1a", fg="#1e4080",
                 font=("맑은 고딕", 7)).pack(side=tk.RIGHT, pady=3)

    def _start_loop(self):
        asyncio.set_event_loop(self.loop)
        self.loop.run_forever()

    def _in_thread(self, coro, on_done=None):
        async def wrapped():
            self.is_running = True
            try:
                await coro
            except Exception as e:
                self.log(f"❌ 오류: {e}")
            finally:
                self.is_running = False
                if on_done:
                    self.root.after(0, on_done)
        asyncio.run_coroutine_threadsafe(wrapped(), self.loop)

    def log(self, text):
        import datetime
        now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        self.root.after(0, self._append_log, f"[{now}] {text}\\n")

    def _append_log(self, msg):
        self.txt_log.insert(tk.END, msg)
        self.txt_log.see(tk.END)

    def select_all(self):
        for item in self.tree.get_children():
            vals = list(self.tree.item(item, "values"))
            vals[0] = "☑"
            self.tree.item(item, values=vals)
        self._refresh_row_colors()

    def deselect_all(self):
        for item in self.tree.get_children():
            vals = list(self.tree.item(item, "values"))
            vals[0] = "☐"
            self.tree.item(item, values=vals)
        self._refresh_row_colors()

    def _filter_check_apt(self):
        keyword = self.ent_apt_filter.get().strip()
        if not keyword: return
        for item in self.tree.get_children():
            vals = list(self.tree.item(item, "values"))
            if keyword in vals[6]: # 단지명/상세주소 컬럼
                vals[0] = "☑"
                self.tree.item(item, values=vals)
        self._refresh_row_colors()

    def _filter_uncheck_apt(self):
        keyword = self.ent_apt_filter.get().strip()
        if not keyword: return
        for item in self.tree.get_children():
            vals = list(self.tree.item(item, "values"))
            if keyword in vals[6]: # 단지명/상세주소 컬럼
                vals[0] = "☐"
                self.tree.item(item, values=vals)
        self._refresh_row_colors()

    def _apply_filters(self):
        if not hasattr(self, 'scanned_items') or not self.scanned_items:
            return
            
        keyword = self.ent_apt_filter.get().strip()
        f_sale = self.var_f_sale.get()
        f_jeonse = self.var_f_jeonse.get()
        f_monthly = self.var_f_monthly.get()
        period_val = self.cb_period.get()
        
        self.tree.delete(*self.tree.get_children())
        
        import datetime
        now = datetime.datetime.now()
        
        def check_period(p_str):
            if period_val == "전체" or not p_str: return True
            try:
                nums = re.findall(r'\d+', p_str)
                if len(nums) >= 3:
                    # p_str에 두 개의 날짜("시작일 ~ 종료일")가 있을 경우 
                    # 맨 마지막 3개 그룹의 숫자를 종료일자로 인식
                    y_str = nums[-3]
                    m_str = nums[-2]
                    d_str = nums[-1]
                    
                    y = int(y_str) if len(y_str)==4 else int("20"+y_str[-2:])
                    m = int(m_str)
                    d = int(d_str)
                    dt = datetime.datetime(y, m, d)
                    
                    # 종료일자 기준 (미래/과거 모두 포함하기 위해 절대값 사용)
                    days_diff = abs((now - dt).days)
                    
                    if period_val == "최근 1주일": return days_diff <= 7
                    elif period_val == "최근 1개월": return days_diff <= 31
                    elif period_val == "최근 3개월": return days_diff <= 93
                    elif period_val == "최근 6개월": return days_diff <= 186
            except:
                pass
            return True

        for i, item in enumerate(self.scanned_items):
            # 아파트명 체크
            name = item.get('name', '')
            if keyword and keyword not in name:
                continue
                
            # 거래유형 체크
            t_type = item.get('t_type', '')
            is_sale = "매매" in t_type
            is_jeonse = "전세" in t_type
            is_monthly = "월세" in t_type
            
            passed_type = False
            if is_sale and f_sale: passed_type = True
            if is_jeonse and f_jeonse: passed_type = True
            if is_monthly and f_monthly: passed_type = True
            # 매매/전세/월세 텍스트가 모두 없으면 기본적으로 통과시킴
            if not is_sale and not is_jeonse and not is_monthly: passed_type = True
            
            if not passed_type:
                continue
                
            # 등록기간 체크
            p_str = item.get('period', '')
            if not check_period(p_str):
                continue
                
            # 진행상황 체크
            s_filter = getattr(self, 'current_status_filter', '')
            if s_filter and item.get('status', '').strip() != s_filter:
                continue
                
            reg_date, end_date, status_text = parse_item_dates_and_status(item)
            val = (
                "☐", 
                item.get('no', str(i+1)), 
                item.get('id', ''), 
                item.get('t_type', ''), 
                item.get('obj_type', ''), 
                item.get('loc', ''), 
                item.get('name', ''), 
                item.get('dong', ''), 
                item.get('ho', ''), 
                item.get('area', ''), 
                item.get('price', ''), 
                reg_date,
                end_date,
                status_text,
                "-"
            )
            val = self._erp_check(val)   # 2026-11-25 ERP 계약완료 매물은 체크 해제 + 'ERP:' 표시
            self.tree.insert("", "end", values=val)
            
        self._refresh_row_colors()
        self.lbl_status.config(text=f"필터 결과: 조회 {len(self.tree.get_children())}건 (전체 {len(self.scanned_items)}건)")

    def _reset_filters(self):
        self.ent_apt_filter.delete(0, tk.END)
        self.var_f_sale.set(True)
        self.var_f_jeonse.set(True)
        self.var_f_monthly.set(True)
        self.cb_period.current(0)
        self.current_status_filter = ""
        self._apply_filters()

    def _on_left_click(self, event):
        region = self.tree.identify_region(event.x, event.y)
        
        # 헤더 영역 좌클릭 시 (순차 정렬 기능)
        if region == "heading":
            col_id = self.tree.identify_column(event.x)
            col_name = self.tree.column(col_id, "id")
            # 모든 헤더 좌클릭 시 정렬
            self._sort_column(col_name)
            return

        item = self.tree.identify_row(event.y)
        col = self.tree.identify_column(event.x)
        if item and col == '#1': # 체크 열 반전 좌클릭 시
            vals = list(self.tree.item(item, "values"))
            vals[0] = "☑" if vals[0] == "☐" else "☐"
            self.tree.item(item, values=vals)
            self._refresh_row_colors()

    def _on_right_click(self, event):
        region = self.tree.identify_region(event.x, event.y)
        
        # 헤더 영역 우클릭 시 (필터 드롭다운 팝업)
        if region == "heading":
            col_id = self.tree.identify_column(event.x)
            col_name = self.tree.column(col_id, "id")
            if col_name == "단지명/상세주소":
                self._show_apt_filter_menu(event.x_root, event.y_root)
            elif col_name == "진행상황":
                self._show_status_filter_menu(event.x_root, event.y_root)
            return

    def _show_apt_filter_menu(self, x, y):
        """현재 스캔된 데이터 바탕으로 단지명 고유값을 추출하여 팝업 메뉴 표시"""
        if not hasattr(self, 'scanned_items') or not self.scanned_items:
            # messagebox.showinfo("안내", "스캔된 데이터가 없습니다.", parent=self.root)
            return

        # 중복 없는 아파트 단지명 추출
        apts = set()
        for item in self.scanned_items:
            name = item.get('name', '').strip()
            if name:
                apts.add(name)

        sorted_apts = sorted(list(apts))
        if not sorted_apts:
            return

        # 팝업 메뉴 생성 스타일 지정
        menu = tk.Menu(self.root, tearoff=0, bg=BG_CARD, fg=TEXT_COLOR, 
                       activebackground=ACCENT, activeforeground="white",
                       font=("맑은 고딕", 9))
        
        # 전체 보기 항목
        menu.add_command(label="🔄 전체 보기 (필터 초기화)", 
                         command=lambda: self._apply_apt_selection(""),
                         foreground=GOLD)
        menu.add_separator()
        
        # 단지명 동적 추가 (텍스트가 너무 길면 자름)
        for apt in sorted_apts:
            display_name = apt if len(apt) < 25 else apt[:22] + "..."
            menu.add_command(label=f"🏢 {display_name}", command=lambda a=apt: self._apply_apt_selection(a))

        # 메뉴 팝업
        menu.tk_popup(x, y)

    def _apply_apt_selection(self, apt_name):
        """선택한 단지명으로 필터 텍스트박스를 갱신하고 필터 적용"""
        self.ent_apt_filter.delete(0, tk.END)
        if apt_name:
            self.ent_apt_filter.insert(0, apt_name)
            self.log(f"🔎 [세부 단지 선택] '{apt_name}' 항목을 보여줍니다.")
        else:
            self.log("🔎 [필터 해제] 전체 매물 목록을 표시합니다.")
            
        self._apply_filters()

    def _show_status_filter_menu(self, x, y):
        """현재 스캔된 데이터 바탕으로 진행상황 고유값을 추출하여 팝업 메뉴 표시"""
        if not hasattr(self, 'scanned_items') or not self.scanned_items:
            return

        statuses = set()
        for item in self.scanned_items:
            status = item.get('status', '').strip()
            if status:
                statuses.add(status)

        sorted_statuses = sorted(list(statuses))
        if not sorted_statuses:
            return

        menu = tk.Menu(self.root, tearoff=0, bg=BG_CARD, fg=TEXT_COLOR, 
                       activebackground=ACCENT, activeforeground="white",
                       font=("맑은 고딕", 9))
        
        menu.add_command(label="🔄 전체 보기 (필터 초기화)", 
                         command=lambda: self._apply_status_selection(""),
                         foreground=GOLD)
        menu.add_separator()
        
        for status in sorted_statuses:
            menu.add_command(label=f"📌 {status}", command=lambda s=status: self._apply_status_selection(s))

        menu.tk_popup(x, y)

    def _apply_status_selection(self, status_name):
        self.current_status_filter = status_name
        if status_name:
            self.log(f"🔎 [진행상황 선택] '{status_name}' 항목을 보여줍니다.")
        else:
            self.log("🔎 [진행상황 필터 해제] 전체 매물 목록을 표시합니다.")
            
        self._apply_filters()

    def _sort_column(self, col):
        """컬럼 데이터를 기준으로 리스트 정렬"""
        # 정렬 방향 전환 (오름차순/내림차순)
        reverse = getattr(self, f"_sort_reverse_{col}", False)
        
        # 데이터 수집 (표시되는 텍스트 기반)
        data = [(self.tree.set(item, col), item) for item in self.tree.get_children("")]
        
        # 숫자 정렬을 위한 헬퍼
        def natural_sort_key(val_tuple):
            val = val_tuple[0]
            if not val: return (1, "")
            
            # 숫자 기반 컬럼들만 숫자 추출 시도
            if col in ["No", "매물번호", "면적", "가격"]:
                try:
                    clean = val.replace(',', '').split('/')[0]
                    num_match = re.search(r'(\d+\.?\d*)', clean)
                    if num_match:
                        return (0, float(num_match.group(1)))
                except:
                    pass
            # 그 외 또는 숫자 추출 실패 시 문자열 정렬
            return (1, val)

        data.sort(key=natural_sort_key, reverse=reverse)

        # 리스트 아이템 재배열
        for index, (_, item) in enumerate(data):
            self.tree.move(item, "", index)

        # 다음 정렬 방향 반전 예약
        setattr(self, f"_sort_reverse_{col}", not reverse)
        
        # 정렬 후 행 색상(홀짝 등) 다시 입히기
        self._refresh_row_colors()

    def _refresh_row_colors(self):
        """체크 여부 및 홀짝 순서에 따라 행 배경색 갱신"""
        for i, item in enumerate(self.tree.get_children()):
            vals = self.tree.item(item, "values")
            is_checked = (vals[0] == "☑")
            
            tags = []
            if is_checked:
                tags.append("checked") # 체크된 행 강조색
            else:
                tags.append("even" if i % 2 == 0 else "odd") # 평상시 홀짝 줄무늬
            
            # 진행상황(12번 인덱스) 텍스트 색상 유지
            status = vals[12]
            if "완료" in status:
                tags.append("done")
            elif "실패" in status:
                tags.append("fail")
            
            self.tree.item(item, tags=tags)

    # ==========================================
    # 1. 로그인 (동일한 로직)
    # ==========================================
    def start_login(self):
        if self.is_running: return
        self.btn_login.config(state=tk.DISABLED, bg="#444")
        self.log("🌐 브라우저를 실행합니다...")
        def on_login_done():
            self.btn_login.config(state=tk.NORMAL, bg="#e63946") # 재로그인/브라우저 재실행을 위해 활성화 유지
            self.btn_auto_excel.config(state=tk.NORMAL, bg="#264653")
            self.btn_scan.config(state=tk.NORMAL, bg="#1d3557")
            self.start_auto_excel_combined()  # 로그인 직후 엑셀 데이터 동기화 자동 실행
        self._in_thread(self._login(), on_done=on_login_done)

    async def _login(self):
        # 입력값 유효성 검사 추가
        user_id = self.ent_user_id.get().strip()
        user_pw = self.ent_user_pw.get().strip()
        if not user_id or not user_pw:
            self.log("⚠️ 이실장 ID 또는 비밀번호가 입력되지 않았습니다. 계정정보를 입력하고 다시 진행해주세요.")
            # 자동 로그인을 보류하고 중단
            return
            
        # [추가] 기존 세션(브라우저)이 열려있다면 정리 후 새로 시작합니다.
        if hasattr(self, 'browser') and getattr(self, 'browser', None):
            try: await self.browser.close()
            except: pass
        if hasattr(self, '_pw') and getattr(self, '_pw', None):
            try: await self._pw.stop()
            except: pass
            
        self._pw = await async_playwright().start()
        # [수정] 파일 다운로드를 위해 accept_downloads=True 옵션 필수
        # headless=False : 브라우저 화면 표시 (진행 상황 확인 및 수동 개입 가능)
        self.browser = await self._pw.chromium.launch(
            headless=False,
            channel="chrome",
            downloads_path=os.path.join(_APP_DIR, "isj_downloads"),
            args=["--window-position=0,0", "--window-size=1280,900"]
        )
        self.context = await self.browser.new_context(viewport={"width": 1280, "height": 900}, accept_downloads=True)

        
        # [NEW] 로봇 마우스 시각화 스크립트
        await self.context.add_init_script("""
            if (window === window.top || window.self !== window.top) {
                document.addEventListener('DOMContentLoaded', () => {
                    const pwMouse = document.createElement('div');
                    pwMouse.id = 'playwright-mouse-pointer';
                    pwMouse.style.position = 'fixed';
                    pwMouse.style.left = '0';
                    pwMouse.style.top = '0';
                    pwMouse.style.width = '30px';
                    pwMouse.style.height = '30px';
                    pwMouse.style.background = 'rgba(255, 0, 0, 0.4)';
                    pwMouse.style.border = '3px solid red';
                    pwMouse.style.borderRadius = '50%';
                    pwMouse.style.pointerEvents = 'none';
                    pwMouse.style.zIndex = '99999999';
                    pwMouse.style.transform = 'translate(-50%, -50%)';
                    pwMouse.style.transition = 'width 0.1s, height 0.1s, background 0.1s';
                    pwMouse.style.display = 'none';
                    
                    document.body.appendChild(pwMouse);

                    document.addEventListener('mousemove', event => {
                        pwMouse.style.display = 'block';
                        pwMouse.style.left = event.clientX + 'px';
                        pwMouse.style.top = event.clientY + 'px';
                    }, true);

                    document.addEventListener('mousedown', event => {
                        pwMouse.style.width = '15px';
                        pwMouse.style.height = '15px';
                        pwMouse.style.background = 'rgba(255, 0, 0, 0.9)';
                    }, true);

                    document.addEventListener('mouseup', event => {
                        pwMouse.style.width = '30px';
                        pwMouse.style.height = '30px';
                        pwMouse.style.background = 'rgba(255, 0, 0, 0.4)';
                    }, true);
                });
            }
        """)

        async def on_dialog(dialog):
            msg = dialog.message
            if getattr(self, 'is_running', False):
                self.log(f"   🔔 [웹페이지 알림]: {msg}")
                self.last_dialog_message = msg
            try:
                await asyncio.sleep(2.0)
                await dialog.accept()
                if getattr(self, 'is_running', False):
                    self.log("   ✅ 팝업 [확인] 자동 클릭 완료")
            except: pass

        self.context.on("dialog", lambda dialog: asyncio.create_task(on_dialog(dialog)))
        self.page = await self.context.new_page()
        
        self.log("🔗 접속 후 메인 화면을 불러옵니다...")
        await self.page.goto(self.LOGIN_URL, wait_until="networkidle", timeout=15000)
        await self._close_popups() # 초기 유도 팝업 제거

        try:
            # 1. 메인 화면 [로그인] 버튼 클릭 (필요 시)
            self.log("   화면의 [로그인] 버튼을 클릭해 로그인 창을 엽니다...")
            try:
                # Playwright 내장 locator를 이용해 가장 강력하게 클릭을 발생시킴
                login_btn = self.page.locator("a:has-text('로그인'), button:has-text('로그인'), .btn-login").first
                await login_btn.click(timeout=3000)
                await asyncio.sleep(2)
            except: pass
            
            # 2. 아이디 / 비밀번호 입력
            try:
                # 플레이스홀더나 타입 기반으로 다중 매칭
                id_input = self.page.locator("input[placeholder*='아이디'], input[placeholder*='이메일'], input[name*='id'], input[type='text']").first
                await id_input.fill(self.ent_user_id.get(), timeout=3000)
                
                pw_input = self.page.locator("input[placeholder*='비밀번호'], input[name*='pw'], input[type='password']").first
                await pw_input.fill(self.ent_user_pw.get(), timeout=3000)
            except Exception as e:
                self.log(f"   입력창 탐색 실패: {e}")
            # 3. 폼 내부 로그인 버튼 제출
            try:
                # 비밀번호 필드에서 엔터키를 직접 쳐서 제출 시도 (가장 자연스러운 방법)
                if pw_input:
                    await pw_input.press('Enter')
                
                await asyncio.sleep(0.5)
                
                # 정확히 "로그인하기" 라는 텍스트만! 있는 요소를 찾아서 클릭 (주의: "다음 계정으로 로그인하기" 방어)
                try:
                    exact_btn = self.page.get_by_text("로그인하기", exact=True).first
                    if await exact_btn.count() > 0:
                        await exact_btn.hover()
                        await exact_btn.click(force=True, timeout=2000)
                        self.log("   👁️ 주황색 [로그인하기] 버튼 클릭 완료!")
                except:
                    # 보조적으로 강제로 맨 위쪽 로그인하기 버튼 클릭
                    submit_btn = self.page.locator("button:has-text('로그인하기')").first
                    await submit_btn.click(timeout=2000)
            except Exception:
                try: await self.page.evaluate("if(document.forms[0]) document.forms[0].submit();")
                except: pass
                
            await asyncio.sleep(1.5)
        except Exception as e:
            self.log(f"ℹ️ 자동 로그인 중 예외 발생, 필요 시 수동 로그인을 진행해 주세요. ({e})")

        # 로그인 감지 루프
        for _ in range(60):
            if await self.page.locator("text=로그아웃").count() > 0 or await self.page.locator("text=내정보").count() > 0 or "offerings" in self.page.url.lower() or "ad_list" in self.page.url.lower():
                self.log("✅ 로그인 완료.")
                break
            await asyncio.sleep(1)

        self.log("🔄 광고리스트 화면으로 이동합니다...")
        await self._close_popups() # 로그인 후 메인 팝업 제거
        await self._goto_ad_ended_folder()
        self.log("🎉 노출종료 화면 준비 완료! 잠시 후 자동으로 매물 데이터를 동기화합니다...")

    async def _goto_all_folder(self):
        self.log("📂 대상 화면의 '매물광고' 탭(폴더)으로 이동/새로고침 합니다...")
        if "ad_list" not in self.page.url:
            try:
                await self.page.goto(self.TARGET_URL, wait_until="domcontentloaded", timeout=10000)
            except Exception as e:
                self.log(f"   ⚠️ 페이지 이동 오류({e}), 2초 후 재시도...")
                await asyncio.sleep(2)
                try:
                    await self.page.goto(self.TARGET_URL, wait_until="domcontentloaded", timeout=15000)
                except Exception as e2:
                    self.log(f"   ❌ 페이지 이동 최종 실패: {e2}")
        else:
            try:
                await self.page.reload(wait_until="domcontentloaded", timeout=10000)
            except Exception as e:
                self.log(f"   ⚠️ 페이지 새로고침 오류({e})")
        await asyncio.sleep(1.5)
        await self._close_popups()
            
        try:
            clicked = await self.page.evaluate('''
                () => {
                    const elements = Array.from(document.querySelectorAll('div, li, a, button, span'));
                    for(const el of elements) {
                        const txt = el.innerText ? el.innerText.replace(/\s+/g, '') : '';
                        if ((txt.startsWith('매물광고') || txt.includes('광고매물') || txt.includes('진행매물')) && el.closest('.tab_area')) {
                            if (el.click) { el.click(); return true; }
                        }
                    }
                    const fallback = elements.find(el => {
                        const t = (el.innerText || "").replace(/\s+/g, '');
                        return t === '매물광고' || t === '광고매물';
                    });
                    if (fallback && fallback.click) { fallback.click(); return true; }
                    return false;
                }
            ''')
            if clicked:
                self.log("   [매물광고] 탭 클릭 완료")
                try: await self.page.wait_for_load_state("networkidle", timeout=3000)
                except: pass
                await asyncio.sleep(2)
                
                # '전체' 서브 탭 클릭 시도 (광고종료 박스 클릭과 동일한 멀티클릭 안전장치 적용)
                sub_clicked = await self.page.evaluate('''
                    () => {
                        const sub_elements = Array.from(document.querySelectorAll('div, li, a, button, span, strong'));
                        for(const el of sub_elements) {
                            const txt = el.innerText ? el.innerText.replace(/\\s+/g, '') : '';
                            // '전체429' 형태이거나 '전체(429)' 등 전체+숫자 조합 매칭
                            if (txt.startsWith('전체') && /^\\d+$/.test(txt.substring(2)) && txt.length < 20) {
                                el.click();
                                if(el.firstElementChild) el.firstElementChild.click();
                                if(el.parentElement) el.parentElement.click();
                                return true;
                            }
                        }
                        // 예비 매칭
                        for(const el of sub_elements) {
                            const txt = (el.innerText || "").trim().replace(/\\s+/g, '');
                            if (/^전체(\\(\\d+\\))?$/.test(txt) || /^전체\\[\\d+\\]$/.test(txt) || /^전체\\d+$/.test(txt)) {
                                el.click();
                                if(el.firstElementChild) el.firstElementChild.click();
                                if(el.parentElement) el.parentElement.click();
                                return true;
                            }
                        }
                        return false;
                    }
                ''')
                if sub_clicked:
                    self.log("   [매물광고 - 전체] 서브 탭 클릭 완료 (멀티클릭 적용)")
                    await asyncio.sleep(3.0)
                else:
                    self.log("   ⚠️ [매물광고 - 전체] 서브 탭을 찾지 못했습니다. 기본 탭 상태로 진행합니다.")
                    await asyncio.sleep(2.0)
        except Exception as e:
            self.log(f"   ⚠️ 탭 이동 중 오류: {e}")

    async def _goto_ad_ended_folder(self):
        self.log("📂 대상 화면의 '광고종료' 탭(폴더)으로 이동/새로고침 합니다...")
        if "ad_list" not in self.page.url:
            try:
                await self.page.goto(self.TARGET_URL, wait_until="domcontentloaded", timeout=10000)
            except Exception as e:
                self.log(f"   ⚠️ 페이지 이동 오류({e}), 2초 후 재시도...")
                await asyncio.sleep(2)
                try:
                    await self.page.goto(self.TARGET_URL, wait_until="domcontentloaded", timeout=15000)
                except Exception as e2:
                    self.log(f"   ❌ 페이지 이동 최종 실패: {e2}")
            await asyncio.sleep(1.5)
            await self._close_popups() # 페이지 이동 후 팝업 제거
            
        try:
            # 1. 자바스크립트를 통해 대시보드 박스(광고종료 + 숫자 조합)를 정확하게 타겟팅
            clicked = await self.page.evaluate("""
                () => {
                    const elements = Array.from(document.querySelectorAll('div, li, a, button, span'));
                    for(const el of elements) {
                        const txt = el.innerText ? el.innerText.replace(/\\s+/g, '') : '';
                        if(txt.startsWith('광고종료') && /\\d+/.test(txt) && txt.length < 20) {
                            el.click();
                            if(el.firstElementChild) el.firstElementChild.click();
                            if(el.parentElement) el.parentElement.click();
                            return "SUCCESS_BOX";
                        }
                    }
                    return "FAIL";
                }
            """)
            
            if clicked == "FAIL":
                folder_locator = self.page.get_by_text("광고종료", exact=True).first
                if await folder_locator.count() > 0:
                    await folder_locator.click(force=True)

            await asyncio.sleep(2.0)
        except Exception as e:
            self.log(f"   ⚠️ 폴더 자동 클릭 예외 발생: {e}")

    async def _close_popups(self, target_page=None):
        if target_page is None:
            target_page = self.page

        # 팝업이 뜰 때까지 잠시 대기
        await asyncio.sleep(1.0)
        try:
            self.log("   🧹 광고/안내 팝업창 확인 및 자동 닫기...")
            
            # 1. 메인 프레임 및 모든 iframe에서 동일하게 팝업 닫기 로직 실행
            frames = [target_page.main_frame] + target_page.frames
            total_clicked = 0
            
            for frame in frames:
                try:
                    # (1) "오늘 하루 보지 않기" 체크박스 처리
                    await frame.evaluate("""
                        () => {
                            const elements = Array.from(document.querySelectorAll('span, label, div, input, p'));
                            for (const el of elements) {
                                // 화면 전체를 덮는 부모/오버레이 요소 제외
                                if (el.offsetWidth > 400 || el.offsetHeight > 400) continue;
                                
                                const txt = (el.innerText || "").trim();
                                if (txt.includes('오늘 하루 보지 않기') || txt.includes('하루 동안 보지 않기') || txt.includes('오늘 하루 이 창을 열지 않음') || txt.includes('다시 보지 않기')) {
                                    el.click(); // 텍스트나 레이블 클릭
                                    // 주변 체크박스 강제 체크
                                    const parent = el.closest('div') || el.parentElement;
                                    if (parent) {
                                        const cb = parent.querySelector('input[type="checkbox"]');
                                        if (cb && !cb.checked) {
                                            cb.click();
                                        }
                                    }
                                }
                            }
                        }
                    """)
                    
                    # (2) "닫기" 버튼 탐색 및 클릭
                    clicked = await frame.evaluate("""
                        () => {
                            let cnt = 0;
                            const closeSelectors = '.btn_close, .close, .popup_close, .layer_close, [class*="btn_close"], [class*="close_btn"], [id*="btn_close"], [src*="close"]';
                            
                            // 1순위: 명확한 클릭 요소
                            const primaryBtns = Array.from(document.querySelectorAll('button, a, img, area, i, em'));
                            // 2순위: 텍스트를 감싸는 태그들 (버튼이 없는 경우를 대비, 자식부터 확인하기 위해 reverse)
                            const secondaryBtns = Array.from(document.querySelectorAll('span, div')).reverse();
                            
                            const checkAndClick = (b) => {
                                // 버튼이 화면 절반 이상을 덮는 오버레이(배경)인 경우 클릭 방지
                                if (b.offsetWidth > 400 || b.offsetHeight > 400) return false;
                                
                                const txt = (b.innerText || b.alt || b.title || "").trim().replace(/\s+/g, '').toLowerCase();
                                if ((txt === '닫기' || txt === '[닫기]' || txt === 'x' || txt.includes('팝업닫기') || txt === 'close' || txt === '창닫기') && 
                                    b.offsetWidth > 0 && b.offsetHeight > 0) {
                                    b.click();
                                    return true;
                                }
                                return false;
                            };

                            for (const b of primaryBtns) {
                                if(checkAndClick(b)) cnt++;
                            }
                            if (cnt === 0) {
                                for (const b of secondaryBtns) {
                                    if(checkAndClick(b)) {
                                        cnt++;
                                        break; // 2순위에서는 하나만 클릭 (부모 중복 클릭 방지)
                                    }
                                }
                            }
                            
                            // 명시적인 선택자를 통한 닫기 버튼 클릭
                            const specificCloseBtns = Array.from(document.querySelectorAll(closeSelectors));
                            for (const cb of specificCloseBtns) {
                                // 오버레이/배경 요소 무시
                                if (cb.offsetWidth > 0 && cb.offsetHeight > 0 && cb.offsetWidth < 400 && cb.offsetHeight < 400) {
                                    cb.click();
                                    cnt++;
                                }
                            }
                            return cnt;
                        }
                    """)
                    if clicked and clicked > 0:
                        total_clicked += clicked
                except Exception:
                    pass
                    
            if total_clicked > 0:
                self.log(f"   ✅ 안내 팝업창 {total_clicked}개를 정상적으로 닫았습니다.")
        except Exception as e:
            self.log(f"   ⚠️ 팝업 닫기 중 예외 발생: {e}")



    # ==========================================
    # 2. 엑셀 다운로드 기반 데이터 자동 파싱 (신규 로직)
    # ==========================================
    def start_auto_excel_combined(self):
        if self.is_running: return
        self.log("📊 매물 통합조회(종료매물 + 결제대기)를 시작합니다...")
        self._in_thread(self._sync_excel_combined())

    async def _sync_excel_combined(self):
        try:
            self.lbl_status.config(text="스캔된 매물: 조회 중...")
            
            # 1. 광고종료 매물 수집 (기존 HTML 스캔 + 엑셀)
            ended_items = await self._fetch_ended_items()
            
            # 2. 결제대기 매물 수집 (전체 탭 엑셀 다운로드)
            payment_items = await self._fetch_payment_items()
            
            # 3. 합치기 및 UI 반영
            all_items = ended_items + payment_items
            
            # 유령 매물 방지를 위해 화면 완벽히 비우기
            self.scanned_items = []
            
            self.root.after(0, self._populate_list, all_items)
            
        except Exception as e:
            self.log(f"❌ 통합 조회 중 오류 발생: {e}")

    async def _fetch_ended_items(self):
        items = []
        try:
            await self._goto_ad_ended_folder()

            # --- [개선] 스캔 속도 향상을 위해 '50개씩 보기' 클릭 시도 ---
            self.log("   ⚡ 스캔 속도 향상을 위해 '50개씩 보기'를 시도합니다...")
            try:
                await self.page.evaluate("""
                    () => {
                        const selects = document.querySelectorAll('select');
                        for(const s of selects) {
                            if(s.innerText.includes('50개씩 보기')) {
                                s.value = '50';
                                s.dispatchEvent(new Event('change'));
                                return true;
                            }
                        }
                        // 만약 select가 아니라 button+ul 형태라면
                        const btns = Array.from(document.querySelectorAll('button'));
                        for(const b of btns) {
                            if(b.innerText.includes('10개씩 보기') || b.innerText.includes('30개씩 보기') || b.innerText.includes('개씩 보기')) {
                                b.click();
                                setTimeout(() => {
                                    const opts = Array.from(document.querySelectorAll('li, a, button, span'));
                                    for(const opt of opts) {
                                        if(opt.innerText.includes('50개씩 보기')) {
                                            opt.click();
                                            return;
                                        }
                                    }
                                }, 300);
                                return true;
                            }
                        }
                        return false;
                    }
                """)
                await asyncio.sleep(1.0)
            except Exception as e:
                pass
            # -------------------------------------------------------------

            # --- [추가] 엑셀 다운 전 화면(HTML)에서 매물번호별 구체적 상태(기간만료 등) 수집 ---
            self.log("   전체 페이지를 스캔하여 화면 표기 데이터(종료구분 등)를 수집합니다...")
            status_map = {}
            for _ in range(5): # 50개씩 보기를 적용했으므로 최대 5페이지면 하루 30~50개 물량 충분
                # 네트워크나 네비게이션 지연으로 인해 DOM 객체가 파괴되는 현상(Execution context destroyed) 방어
                current_map = {}
                for retry in range(2):
                    try:
                        current_map = await self.page.evaluate("""
                            () => {
                                let smap = {};
                                const items = document.querySelectorAll('tr, .item, .list_item, .offering_item, div[class*="item"]');
                                items.forEach(el => {
                                    let text = el.innerText.replace(/\\s+/g, ' ');
                                    let matches = text.match(/(\\d{8,11})/g);
                                    if(matches) {
                                        matches.forEach(id => {
                                            if(!smap[id] || text.includes('소유자') || text.includes('거래완료')) {
                                                smap[id] = text;
                                            }
                                        });
                                    }
                                });
                                return smap;
                            }
                        """)
                        break # 성공 시 루프 탈출
                    except Exception as e:
                        if "Execution context was destroyed" in str(e):
                            self.log("   ⚠️ 페이지 로딩 지연 감지, 잠시 후 재시도합니다...")
                            await asyncio.sleep(2.0)
                        else:
                            break
                
                status_map.update(current_map)
                
                # 다음 페이지로 넘어가는 버튼 클릭
                clicked_next = False
                try:
                    clicked_next = await self.page.evaluate("""
                        () => {
                            let numBtns = Array.from(document.querySelectorAll('a, button, span, li')).filter(el => /^\\d+$/.test(el.innerText.trim()) && el.innerText.trim() !== '');
                            let activeIdx = -1;
                            for (let i = 0; i < numBtns.length; i++) {
                                let el = numBtns[i];
                                let p = el.parentElement;
                                let bg = window.getComputedStyle(el).backgroundColor || '';
                                if (!el.getAttribute('href') || el.classList.contains('on') || el.classList.contains('active') || bg.includes('255, 153') || bg.includes('255, 165') || el.tagName.toLowerCase() === 'strong' || (p && (p.classList.contains('on') || p.classList.contains('active')))) {
                                    activeIdx = i;
                                    break;
                                }
                            }
                            // 현재 페이지 번호 다음의 숫자 클릭
                            if (activeIdx !== -1 && activeIdx < numBtns.length - 1) {
                                let nextBtn = numBtns[activeIdx + 1];
                                if (nextBtn.click) {
                                    nextBtn.click();
                                    return true;
                                } else if (nextBtn.querySelector('a, button')) {
                                    nextBtn.querySelector('a, button').click();
                                    return true;
                                }
                            }
                            // 다음 버튼이 없거나 활성 번호를 못 찾은 경우 > 버튼 클릭 시도
                            let nextArrow = Array.from(document.querySelectorAll('a, button')).find(el => {
                                let txt = el.innerText.trim();
                                return (txt.includes('>') || txt.includes('다음') || txt.includes('▶')) && !el.classList.contains('disabled');
                            });
                            if (nextArrow) {
                                if (nextArrow.getAttribute('href') === 'javascript:void(0);' && !nextArrow.getAttribute('onclick')) return false;
                                if (nextArrow.parentElement && nextArrow.parentElement.classList.contains('disabled')) return false;
                                nextArrow.click();
                                return true;
                            }
                            return false;
                        }
                    """)
                except Exception as e:
                    # 클릭 직후 페이지가 넘어가면서 객체가 파괴된 경우, 클릭 성공으로 간주
                    if "Execution context was destroyed" in str(e):
                        clicked_next = True
                    else:
                        clicked_next = False

                if clicked_next:
                    try:
                        await self.page.wait_for_load_state("networkidle", timeout=3000)
                    except:
                        pass
                    await asyncio.sleep(2.0) # 충분한 대기 시간 부여
                else:
                    break

            # 다시 1페이지(기본 목록)로 초기화한 뒤 엑셀 다운로드 진행
            self.log("   스캔 완료! 엑셀 다운로드를 위해 첫 페이지 목록으로 복귀합니다...")
            await self._goto_ad_ended_folder()
            await asyncio.sleep(1.5)

            # 엑셀 다운로드 이벤트 대기 설정
            self.log("   엑셀 다운로드를 요청합니다...")
            
            async with self.page.expect_download() as download_info:
                # [엑셀출력] 형태의 버튼이나 링크를 찾아서 클릭
                clicked = await self.page.evaluate("""
                    () => {
                        const btns = Array.from(document.querySelectorAll('a, button, img'));
                        for(const b of btns) {
                            const txt = (b.innerText || '') + (b.alt || '') + (b.title || '');
                            if(txt.includes('엑셀출력') || txt.includes('엑셀다운') || txt.includes('엑셀 다운로드')) {
                                if(b.tagName.toLowerCase() === 'img' && b.parentElement && b.parentElement.tagName.toLowerCase() === 'a') {
                                    b.parentElement.click();
                                } else {
                                    b.click();
                                }
                                return true;
                            }
                        }
                        return false;
                    }
                """)
                if not clicked:
                    self.log("❌ 화면에서 [엑셀출력] 버튼을 찾지 못했습니다.")
                    return

            download = await download_info.value
            # 다운로드 폴더 경로 (내 PC > 다운로드)
            downloads_dir = os.path.join(os.path.expanduser("~"), "Downloads")
            os.makedirs(downloads_dir, exist_ok=True)
            download_path = os.path.join(downloads_dir, download.suggested_filename)
            await download.save_as(download_path)
            self.log(f"   📥 엑셀 다운로드 성공 ({download.suggested_filename})")
            
            # 다운받은 엑셀 파일 Pandas로 읽기
            import pandas as pd
            
            # html 형식의 xls 파일일 가능성 대비 (오래된 웹은 보통 이럼)
            try:
                # 먼저 일반 엔진으로 시도
                df = pd.read_excel(download_path)
            except Exception:
                # 안되면 html 로드 엔진 사용 (종종 xls 확장자지만 실제론 html table인 경우)
                try:
                    tables = pd.read_html(download_path, encoding='cp949')
                    df = tables[0]
                except:
                    tables = pd.read_html(download_path, encoding='utf-8')
                    df = tables[0]
            
            items = []
            
            # 칼럼(헤더) 이름으로 정확한 인덱스 찾기
            cols = [str(c) for c in df.columns]
            
            # 매경이실장 엑셀 컬럼 인덱스 매핑 (이미지 참조)
            # A: 이실장매물번호(0), B: 매경(1), C: 네이버(2), D: 매물종류(3), E: 소재지(4),
            # F: 단지명/상세주소(5), G: 동(6), H: 호(7), I: 면적(8), J: 거래유형(9), K: 가격(10)
            
            idx_map = {'id': -1, 'type': 3, 'loc': 4, 'name': 5, 'dong': 6, 'ho': 7, 'area': 8, 'trans': 9, 'price': 10, 'period': 11}
            
            for k, col_name in enumerate(cols):
                if "이실장매물번호" in col_name: idx_map['id'] = k
                elif "매물번호" in col_name and idx_map['id'] == -1: idx_map['id'] = k
                elif "매물종류" in col_name: idx_map['type'] = k
                elif "소재지" in col_name: idx_map['loc'] = k
                elif "상세주소" in col_name or "단지명" in col_name: idx_map['name'] = k
                elif "동" == col_name.strip(): idx_map['dong'] = k
                elif "호" == col_name.strip(): idx_map['ho'] = k
                elif "면적" in col_name: idx_map['area'] = k
                elif "거래유형" in col_name: idx_map['trans'] = k
                elif "가격" in col_name: idx_map['price'] = k
                elif "등록일" in col_name or "노출" in col_name: idx_map['period'] = k

            for i, row in df.iterrows():
                vals = list(row.values)
                vals = ["" if pd.isna(v) else str(v) for v in vals]
                row_str = " ".join(vals)
                
                # 거래완료 필터 (매경 엑셀에서 취급 안 할 수도 있지만 일단 유지)
                if "거래완료" in row_str:
                    continue
                
                # 매물번호 찾기 (이실장 매물번호)
                prop_id = vals[idx_map['id']] if len(vals) > idx_map['id'] else ""
                if not prop_id:
                    match = re.search(r'(\d{7,11})', row_str)
                    if match:
                        prop_id = match.group(1)
                
                if not prop_id: 
                    continue
                
                # 진행상황(종료구분) 파악: 엑셀엔 누락될 수 있으므로 화면(HTML) 텍스트와 혼합 탐색
                combined_text = row_str
                if prop_id in status_map:
                    combined_text += " " + status_map[prop_id]
                
                # 로그에 매칭된 텍스트 일부 출력 (디버깅용)
                # self.log(f"   🔎 상태 체크 [{prop_id}]: {combined_text[:50]}...")
                    
                status_val = ""
                # "매물철회"가 "광고종료"보다 우선시되도록 키워드 우선순위 조정
                for kw in ["기간만료", "매물철회", "소유자완료", "소유자", "거래완료", "종료"]:
                    if kw in combined_text:
                        status_val = kw
                        break
                if not status_val:
                    status_val = "광고종료"
                
                # ★ 소유자가 내렸거나 거래완료된 항목은 재등록 대상에서 제외
                # (소유자), (거래완료) 등 모든 변리에 대응하기 위해 contains 체크
                if any(k in combined_text for k in ("소유자", "거래완료")):
                    self.log(f"   ⏭️ 제외 (광고종료 종류 감지됨): {prop_id} (상태: {status_val})")
                    continue
                
                # 딕셔너리로 저장 (매경 엑셀 포맷에 맞춤)
                items.append({
                    'no': str(len(items)+1),
                    'id': prop_id,
                    't_type': vals[idx_map['trans']] if len(vals) > idx_map['trans'] else "",
                    'obj_type': vals[idx_map['type']] if len(vals) > idx_map['type'] else "",
                    'loc': vals[idx_map['loc']] if len(vals) > idx_map['loc'] else "",
                    'name': vals[idx_map['name']] if len(vals) > idx_map['name'] else "",
                    'dong': vals[idx_map['dong']] if len(vals) > idx_map['dong'] else "",
                    'ho': vals[idx_map['ho']] if len(vals) > idx_map['ho'] else "",
                    'area': vals[idx_map['area']] if len(vals) > idx_map['area'] else "",
                    'price': vals[idx_map['price']] if len(vals) > idx_map['price'] else "",
                    'period': vals[idx_map['period']] if len(vals) > idx_map['period'] else "",
                    'combined_text': combined_text,
                    'status': status_val
                })

            # 함수가 데이터를 직접 반환하도록 수정
            return items
            # 다운로드 후 파일 삭제 임시 중단 (디버깅 목적)
            # try: os.remove(download_path)
            # except: pass

        except ImportError:
            self.log("❌ 오류: pandas 또는 lxml 모듈이 설치되어 있지 않습니다. pip install pandas lxml openpyxl 입력 필요")
        except Exception as e:
            self.log(f"엑셀 동기화 오류: {e}")
        return items

    # ==========================================
    # 결제대기 매물 엑셀 다운로드 기반 파싱
    # ==========================================
    async def _fetch_payment_items(self):
        items = []
        try:
            # 1. 매물광고 탭으로 이동
            await self._goto_all_folder()

            # 2. 전체 탭에서 엑셀 바로 다운로드 (결제대기 포함 전체 매물)
            self.log("   📊 [매물광고 전체] 엑셀 다운로드를 요청합니다...")
            await asyncio.sleep(2)


            # 디버깅을 위해 현재 클릭된 화면 캡처 저장
            try:
                debug_img_path = os.path.join(os.path.expanduser("~"), "Downloads", "debug_payment_before_download.png")
                await self.page.screenshot(path=debug_img_path)
                self.log(f"   📸 [디버깅] 다운로드 직전 화면 캡처 저장 완료: {debug_img_path}")
            except Exception as e:
                self.log(f"   ⚠️ 화면 캡처 실패: {e}")

            self.log("   📊 엑셀 다운로드를 요청합니다...")
            async with self.page.expect_download() as download_info:
                clicked = await self.page.evaluate('''
                    () => {
                        const btns = Array.from(document.querySelectorAll('a, button, img'));
                        for(const b of btns) {
                            const txt = (b.innerText || '') + (b.alt || '') + (b.title || '');
                            if(txt.includes('엑셀출력') || txt.includes('엑셀다운') || txt.includes('엑셀 다운로드')) {
                                if(b.tagName.toLowerCase() === 'img' && b.parentElement && b.parentElement.tagName.toLowerCase() === 'a') {
                                    b.parentElement.click();
                                } else { b.click(); }
                                return true;
                            }
                        }
                        return false;
                    }
                ''')
                if not clicked:
                    self.log("❌ 화면에서 [엑셀출력] 버튼을 찾지 못했습니다.")
                    return

            download = await download_info.value
            downloads_dir = os.path.join(os.path.expanduser("~"), "Downloads")
            os.makedirs(downloads_dir, exist_ok=True)
            download_path = os.path.join(downloads_dir, download.suggested_filename)
            await download.save_as(download_path)
            self.log(f"   📥 결제대기 엑셀 다운로드 성공 ({download.suggested_filename})")

            # 5. 엑셀 파싱 (노출종료 매물 로직과 동일)
            import pandas as pd
            import openpyxl

            # 다운받은 엑셀을 편집사용 형태로 변환 (Protected View 해제)
            self.log("   🔄 엑셀 파일을 편집 가능 형태로 변환합니다...")
            editable_path = download_path.replace('.xlsx', '_edit.xlsx').replace('.xls', '_edit.xlsx')
            try:
                wb = openpyxl.load_workbook(download_path, data_only=True)
                wb.save(editable_path)
                wb.close()
                self.log("   ✅ 엑셀 변환 완료")
                read_path = editable_path
            except Exception as e:
                self.log(f"   ⚠️ 변환 실패, 원본 파일로 진행: {e}")
                read_path = download_path

            try: df = pd.read_excel(read_path)
            except Exception:
                try: df = pd.read_html(read_path, encoding='cp949')[0]
                except: df = pd.read_html(read_path, encoding='utf-8')[0]

            items = []
            cols = [str(c) for c in df.columns]
            idx_map = {'id': -1, 'type': 3, 'loc': 4, 'name': 5, 'dong': 6, 'ho': 7, 'area': 8, 'trans': 9, 'price': 10, 'period': 11}
            
            for k, col_name in enumerate(cols):
                if "이실장매물번호" in col_name: idx_map['id'] = k
                elif "매물번호" in col_name and idx_map['id'] == -1: idx_map['id'] = k
                elif "매물종류" in col_name: idx_map['type'] = k
                elif "소재지" in col_name: idx_map['loc'] = k
                elif "상세주소" in col_name or "단지명" in col_name: idx_map['name'] = k
                elif "동" == col_name.strip(): idx_map['dong'] = k
                elif "호" == col_name.strip(): idx_map['ho'] = k
                elif "면적" in col_name: idx_map['area'] = k
                elif "거래유형" in col_name: idx_map['trans'] = k
                elif "가격" in col_name: idx_map['price'] = k
                elif "등록일" in col_name or "노출" in col_name: idx_map['period'] = k

            self.log(f"   📋 엑셀 총 {len(df)}행 파싱 시작 (컬럼: {cols[:5]}...)")
            self.log(f"   📋 컬럼 매핑: {idx_map}")

            for i, row in df.iterrows():
                vals = list(row.values)
                # NaT(날짜 없음) = 결제대기 매물의 핵심 표시! 절대 빈값으로 바꾸지 않고 "Invalid date"로 보존
                vals = ["Invalid date" if pd.isna(v) else str(v) for v in vals]
                row_str = " ".join(vals)

                if "거래완료" in row_str: continue

                prop_id = vals[idx_map['id']] if len(vals) > idx_map['id'] else ""
                prop_id = str(prop_id).replace('.0', '').strip()

                if not prop_id:
                    match = re.search(r'(\d{7,11})', row_str)
                    if match: prop_id = match.group(1)

                # 등록일 컬럼 체크
                period_val = vals[idx_map['period']] if len(vals) > idx_map['period'] else ""
                
                # 결제대기 매물은 매경매물번호나 등록일 등이 비어있어 'Invalid date'가 됨
                if "Invalid date" not in row_str:
                    continue
                
                # 추가 검증: 만약 period_val이 명확한 정상 날짜 형식(예: 2026-05-20)을 띠고 있다면 결제대기가 아닐 확률이 높으므로 제외
                if len(period_val) >= 10 and "Invalid date" not in period_val and period_val not in ["-", "", "nan", "NaT"]:
                    if re.match(r"\d{4}-\d{2}-\d{2}", period_val):
                        continue

                status_val = "결제대기"

                items.append({
                    'no': str(len(items)+1),
                    'id': prop_id,
                    't_type': vals[idx_map['trans']] if len(vals) > idx_map['trans'] else "",
                    'obj_type': vals[idx_map['type']] if len(vals) > idx_map['type'] else "",
                    'loc': vals[idx_map['loc']] if len(vals) > idx_map['loc'] else "",
                    'name': vals[idx_map['name']] if len(vals) > idx_map['name'] else "",
                    'dong': vals[idx_map['dong']] if len(vals) > idx_map['dong'] else "",
                    'ho': vals[idx_map['ho']] if len(vals) > idx_map['ho'] else "",
                    'area': vals[idx_map['area']] if len(vals) > idx_map['area'] else "",
                    'price': vals[idx_map['price']] if len(vals) > idx_map['price'] else "",
                    'period': period_val,
                    'status': status_val
                })

            # 함수가 데이터를 직접 반환하도록 수정
            return items

        except ImportError:
            self.log("❌ 오류: pandas 모듈이 없습니다.")
        except Exception as e:
            self.log(f"결제대기 엑셀 동기화 오류: {e}")
        return items


    # ==========================================
    # 2.5 화면 스캔 (기존의 화면 HTML 파싱 보조 로직)
    # ==========================================
    def start_scan(self):
        if self.is_running: return
        self.log("🔎 엑셀 없이 눈에 보이는 화면 HTML 표기 기준으로 스캔합니다...")
        self._in_thread(self._scan_items())

    async def _scan_items(self):
        # [수정] 두 번째 스크린샷 표의 각 컬럼('td')을 정확히 파싱하도록 자바스크립트 수집기 변경
        try:
            items = await self.page.evaluate("""
                () => {
                    let results = [];
                    // 본문 리스트가 있는 테이블의 tr 탐색
                    const rows = document.querySelectorAll('table.board_list tbody tr');
                    let currentNo = '';
                    
                    rows.forEach(tr => {
                        const tds = tr.querySelectorAll('td');
                        if(tds.length < 8) return; // 내용이 없는 줄(선 등) 제외
                        
                        const txt = tr.innerText.replace(/\\s+/g, ' ').trim();
                        // '거래완료' 또는 '소유자'(소유자완료 포함)가 텍스트에 들어있으면 제외 (재등록 불필요)
                        if(txt.includes('거래완료') || txt.includes('소유자')) return;
                        
                        // 재광고 버튼이 포함되어 있는지 확인
                        if(!txt.includes('재광고')) return;
                        
                        // 보통 첫 번째 칸에 순번
                        let no = tds[1] ? tds[1].innerText.trim() : "";
                        if(no) currentNo = no; // rowspan 대응
                        
                        let prop_id = "";
                        let t_type = "";
                        let obj_type = "";
                        let loc = "";
                        let name = "";
                        let detail = "";
                        let area = "";
                        let price = "";
                        let period = "";
                        let status = "";
                        
                        // 두 번째 열: 매물번호 추출 (숫자 8~11자리)
                        const id_match = (tds[2] ? tds[2].innerText : "").match(/(\\d{8,11})/);
                        if(id_match) {
                            prop_id = id_match[1];
                        }
                        
                        // 텍스트 기반으로 대략적인 위치 파악 (템플릿 변동 대비)
                        t_type = tds[3] ? tds[3].innerText.trim() : "";
                        obj_type = tds[4] ? tds[4].innerText.trim() : "";
                        loc = tds[5] ? tds[5].innerText.replace(/\\n/g, ' ').trim() : "";
                        name = tds[6] ? tds[6].innerText.replace(/\\n/g, ' ').trim() : "";
                        detail = tds[7] ? tds[7].innerText.replace(/\\n/g, ' ').trim() : "";
                        area = tds[8] ? tds[8].innerText.replace(/\\n/g, ' ').trim() : "";
                        price = tds[9] ? tds[9].innerText.replace(/\\n/g, ' ').trim() : "";
                        period = tds[10] ? tds[10].innerText.replace(/\\n/g, ' ').trim() : "";
                        status = tds[11] ? tds[11].innerText.replace(/\\n/g, ' ').trim() : "";

                        if(prop_id) {
                            results.push({
                                'no': currentNo,
                                'id': prop_id,
                                't_type': t_type,
                                'obj_type': obj_type,
                                'loc': loc,
                                'name': name,
                                'detail': detail,
                                'area': area,
                                'price': price,
                                'period': period,
                                'status': status
                            });
                        }
                    });
                    return results;
                }
            """)
        except Exception as e:
            self.log(f"스캔 오류: {e}")
            return
            
        self.root.after(0, self._populate_list, items)

    def _populate_list(self, items):
        # 1. 기존에 이미 체크되어 있던 매물번호 수집
        checked_ids = set()
        for child in self.tree.get_children():
            vals = self.tree.item(child, "values")
            if vals and len(vals) > 2:
                if vals[0] == "☑":
                    checked_ids.add(vals[2])

        # 2. 기존 scanned_items와 신규 items 병합 (매물번호 기준 중복 제거)
        existing_map = {}
        if hasattr(self, 'scanned_items') and self.scanned_items:
            for it in self.scanned_items:
                pid = it.get('id', '')
                if pid:
                    existing_map[pid] = it

        # 신규 아이템으로 덮어쓰거나 추가
        for it in items:
            pid = it.get('id', '')
            if pid:
                existing_map[pid] = it

        merged_items = list(existing_map.values())
        
        # 3. 화면 갱신
        self.tree.delete(*self.tree.get_children())
        self.scanned_items = merged_items
        
        # 목록에 채우기
        for i, item in enumerate(merged_items):
            pid = item.get('id', '')
            chk_status = "☑" if pid in checked_ids else "☐"
            
            reg_date, end_date, status_text = parse_item_dates_and_status(item)
            val = (
                chk_status, 
                str(i+1), 
                pid, 
                item.get('t_type', ''), 
                item.get('obj_type', ''), 
                item.get('loc', ''), 
                item.get('name', ''), 
                item.get('dong', ''), 
                item.get('ho', ''), 
                item.get('area', ''), 
                item.get('price', ''), 
                reg_date,
                end_date,
                status_text,
                "-"
            )
            val = self._erp_check(val)   # 2026-11-25 ERP 계약완료 매물은 체크 해제 + 'ERP:' 표시
            self.tree.insert("", "end", values=val)
            
        self._refresh_row_colors() # 리스트 로드 후 색상 적용
            
        self.lbl_status.config(text=f"스캔: {len(merged_items)}건 (누적 조회)")
        self.log(f"✅ 화면에 총 {len(merged_items)}건의 매물 목록이 구성되었습니다 (신규 {len(items)}건 병합 완료).")

    # ───────── 2026-11-25 ERP 연결 ─────────
    def _erp_start(self):
        if not self.erp.conf.get('gas_url'):
            self.log("⚠️ ERP 서버 주소 파일(breeze_blog_config.json)이 없어 ERP 연결 없이 진행합니다.")
            return
        if not self.erp.ok():
            self._erp_login_dialog()
            return
        self._erp_load()

    def _erp_load(self):
        def run():
            try:
                n = self.erp.load()
                self.log(f"🔗 ERP 매물 {n}건을 받았습니다 — 계약완료 매물은 자동으로 체크에서 빠집니다.")
            except Exception as e:
                crash_log(_tb.format_exc())
                self.log(f"⚠️ ERP 매물을 못 받았습니다: {e}")
                self.root.after(0, self._erp_login_dialog)
        threading.Thread(target=run, daemon=True).start()

    def _erp_login_dialog(self):
        d = tk.Toplevel(self.root)
        d.title('ERP 로그인')
        d.grab_set()
        tk.Label(d, text='ERP 계정과 6자리 비밀번호 (블로그 발행 프로그램과 같은 로그인)', padx=12, pady=8).pack()
        acc = ttk.Combobox(d, state='readonly', width=22)
        acc.pack(padx=12, pady=4)
        pw = tk.Entry(d, show='●', width=24)
        pw.pack(padx=12, pady=4)
        msg = tk.Label(d, text='', fg='#c62828')
        msg.pack()

        def fill():
            a = self.erp.accounts()
            self.root.after(0, lambda: (acc.config(values=a), acc.set(a[0] if a else '')))
        threading.Thread(target=fill, daemon=True).start()

        def go():
            try:
                self.erp.login(acc.get(), pw.get().strip())
            except Exception as e:
                msg.config(text=str(e))
                return
            d.destroy()
            self._erp_load()
        tk.Button(d, text='로그인', command=go).pack(pady=8)
        tk.Button(d, text='ERP 없이 진행', command=d.destroy).pack(pady=(0, 10))
        pw.bind('<Return>', lambda e: go())

    def _erp_check(self, val):
        try:
            if not self.erp.rows:
                return val
            r = self.erp.match(val[5], val[6], val[8])
            if not r:
                return val
            st = str(r.get('status') or '').strip()
            if any(k in st for k in ERP.STOP):
                v = list(val)
                v[0] = '☐'
                v[13] = f"{v[13]} ERP:{st}".strip()
                return tuple(v)
        except Exception as e:
            crash_log('erp_check ' + str(e))
        return val

    def save_excel(self):
        if not self.scanned_items:
            messagebox.showinfo("알림", "저장할 데이터가 없습니다. 먼저 스캔해주세요.")
            return
        
        file_path = filedialog.asksaveasfilename(
            defaultextension=".xlsx",
            initialfile="노출종료_매물리스트.xlsx",
            title="엑셀 파일 저장",
            filetypes=[("Excel Files", "*.xlsx")]
        )
        if not file_path:
            return
            
        try:
            import pandas as pd
            data = []
            for item in self.tree.get_children():
                vals = self.tree.item(item, "values")
                data.append(vals)
                
            cols = ["체크", "No", "매물번호", "거래유형", "물건종류", "소재지", "단지명/상세주소", "동", "호", "면적", "가격", "등록일", "종료일", "진행상황", "작업"]
            df = pd.DataFrame(data, columns=cols)
            df.to_excel(file_path, index=False)
            self.log(f"💾 엑셀 저장 완료: {file_path}")
            messagebox.showinfo("성공", "엑셀 저장이 완료되었습니다.")
        except Exception as e:
            self.log(f"❌ 엑셀 저장 실패: {e}")
            messagebox.showerror("오류", f"엑셀 저장 중 문제가 발생했습니다.\n{e}")

    def load_excel(self):
        file_path = filedialog.askopenfilename(
            title="엑셀 파일 불러오기",
            filetypes=[("Excel Files", "*.xlsx"), ("All Files", "*.*")]
        )
        if not file_path:
            return
            
        try:
            import pandas as pd
            df = pd.read_excel(file_path)
            
            self.tree.delete(*self.tree.get_children())
            self.scanned_items = []
            
            for _, row in df.iterrows():
                vals = list(row.values)
                # nan 처리
                vals = ["" if pd.isna(v) else str(v) for v in vals]
                self.tree.insert("", "end", values=vals)
                self.scanned_items.append({"id": vals[2]}) # 최소한의 식별용 
                
            self._refresh_row_colors() # 엑셀 로드 후 색상 적용
            self.lbl_status.config(text=f"엑셀에서 {len(df)}건을 불러왔습니다.")
            self.log(f"📂 엑셀 불러오기 완료: {len(df)}건")
        except Exception as e:
            self.log(f"❌ 엑셀 불러오기 실패: {e}")
            messagebox.showerror("오류", f"엑셀 읽기 실패.\n{e}")


    # ==========================================
    # 3. 일괄 재등록 (완벽 클릭 로직 적용)
    # ==========================================
    def start_execution(self):
        if self.is_running: return
        
        targets = []
        for item in self.tree.get_children():
            vals = self.tree.item(item, "values")
            if vals[0] == "☑":  # 체크된 것만
                # 기존 vals[1]은 'No'(순번 1, 2, 3...)였으므로 무조건 맨 윗글이 클릭되는 오류 발생
                # vals[2] 가 실제 '매물번호'임
                targets.append((item, vals[2]))  # (tree아이디, 실제 고유 매물번호)
                
        if not targets:
            messagebox.showwarning("오류", "체크된 매물이 없습니다.")
            return

        self.btn_execute.config(state=tk.DISABLED, bg="#444")
        self.log("\n" + "="*40)
        self.log(f"🚀 체크된 {len(targets)}건 순차 재등록 프로세스 시작")
        self._in_thread(self._execute_batch(targets), on_done=self._on_execution_done)

    def handle_action(self):
        if self.is_reserved:
            # 이미 예약 대기 중이면 취소를 수행
            self.toggle_reservation()
            return

        if self.var_use_reserve.get():
            # 예약 모드
            self.toggle_reservation()
        else:
            # 즉시 실행 모드 (재등록)
            self.start_execution()

    def start_deletion(self):
        if self.is_running:
            return
        self.log("🗑️ 매물삭제 프로세스 시작...")
        targets = []
        for item in self.tree.get_children():
            vals = self.tree.item(item, "values")
            if vals[0] == "☑":  # 체크된 행
                targets.append((item, vals[2]))   # (tree_id, 매물번호)
        if not targets:
            messagebox.showwarning("오류", "삭제할 매물이 선택되지 않았습니다.")
            return
        self.btn_delete.config(state=tk.DISABLED, bg="#444")
        self._in_thread(self._execute_deletion_batch(targets), on_done=self._on_deletion_done)

    async def _execute_deletion_batch(self, targets):
        success = 0
        fail = 0
        total = len(targets)
        for i, (tree_id, prop_id) in enumerate(targets, 1):
            self.log(f"▶ [{i}/{total}] 매물 {prop_id} 삭제 중")
            # 1️⃣ 광고종료 폴더 이동
            await self._goto_ad_ended_folder()
            await asyncio.sleep(1)
            # 2️⃣ 매물번호 검색
            try:
                search_input = self.page.locator("input[placeholder*='매물번호']").first
                if await search_input.count() > 0:
                    await search_input.fill("")
                    await search_input.fill(prop_id)
                    await search_input.press('Enter')
                    await asyncio.sleep(2)
            except Exception as e:
                self.log(f"   검색 입력 오류: {e}")
            # 3️⃣ 확인서(선택) 버튼 또는 체크박스 클릭
            try:
                selected = await self.page.evaluate(f"""
                    (pid) => {{
                        const matched = [];
                        const allElems = document.querySelectorAll('tr, li, div[class*="item"], div[class*="list"], div[class*="row"]');
                        for(const el of allElems) {{
                            if(el.innerText && el.innerText.includes(pid)) {{
                                matched.push(el);
                            }}
                        }}
                        // 자식 요소 개수가 가장 적은 것(가장 구체적인 요소 = 해당 매물의 행)부터 탐색
                        matched.sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length);
                        
                        for(const r of matched) {{
                            // 체크박스 우선 탐색 (단, 전체선택 류의 all 포함된 것 제외)
                            const checkboxes = Array.from(r.querySelectorAll('input[type="checkbox"]'));
                            const chk = checkboxes.find(c => {{
                                const id = (c.id || '').toLowerCase();
                                const name = (c.name || '').toLowerCase();
                                const cls = (c.className || '').toLowerCase();
                                return !id.includes('all') && !name.includes('all') && !cls.includes('all');
                            }});
                            if(chk) {{ chk.click(); return true; }}
                            
                            // 버튼/링크 중 '선택' 또는 '확인서' 텍스트가 있는 요소 탐색
                            const btn = Array.from(r.querySelectorAll('button, a, span, label'))
                                         .find(el => (el.innerText || '').includes('선택') || (el.innerText || '').includes('확인서'));
                            if(btn) {{ btn.click(); return true; }}
                        }}
                        return false;
                    }}
                """, prop_id)
                if not selected:
                    raise Exception('선택버튼(체크박스) 없음')
            except Exception as e:
                self.log(f"   선택 버튼 클릭 오류: {e}")
                fail += 1
                self._update_row_status(tree_id, "삭제실패")
                continue
            await asyncio.sleep(1)
            # 4️⃣ 삭제하기 버튼 클릭
            try:
                deleted = await self.page.evaluate(f"""
                    (pid) => {{
                        const matched = [];
                        const allElems = document.querySelectorAll('tr, li, div[class*="item"], div[class*="list"], div[class*="row"]');
                        for(const el of allElems) {{
                            if(el.innerText && el.innerText.includes(pid)) {{
                                matched.push(el);
                            }}
                        }}
                        matched.sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length);
                        
                        // 1. 먼저 해당 매물 행 안에서 삭제 버튼 찾기
                        for(const r of matched) {{
                            const btn = Array.from(r.querySelectorAll('button, a, span'))
                                         .find(el => (el.innerText || '').includes('삭제') || (el.innerText || '').includes('삭제하기'));
                            if(btn) {{ btn.click(); return true; }}
                        }}
                        
                        // 2. 행 안에 없으면 화면 전체에서 삭제 버튼 찾기 (목록 위/아래 일괄 삭제 버튼 등)
                        const globalBtn = Array.from(document.querySelectorAll('button, a, span'))
                                             .find(el => {{
                                                 const txt = (el.innerText || '').replace(/\s+/g, '');
                                                 return txt === '삭제' || txt === '삭제하기' || txt === '선택삭제' || txt === '선택매물삭제';
                                             }});
                        if(globalBtn) {{ globalBtn.click(); return true; }}
                        return false;
                    }}
                """, prop_id)
                if not deleted:
                    raise Exception('삭제버튼 없음')
            except Exception as e:
                self.log(f"   삭제 버튼 클릭 오류: {e}")
                fail += 1
                self._update_row_status(tree_id, "삭제실패")
                continue
            await asyncio.sleep(1)
            # 5️⃣ 대화상자 처리 후 대기 (on_dialog 핸들러가 처리함)
            await asyncio.sleep(1)
            try:
                # 혹시 HTML 팝업이 있을 수 있으니 짧게 대기 후 클릭 (1초)
                await self.page.locator("button:has-text('확인')").first.click(force=True, timeout=1000)
            except Exception:
                pass # 에러 로그 생략 (정상 작동)
            
            # 다음 매물 처리를 위해 삭제가 서버에 반영될 시간 확보
            await asyncio.sleep(2)
            
            # 6️⃣ 결과 업데이트
            success += 1
            self._update_row_status(tree_id, "삭제완료")
            
            # 여러 건 삭제 시 페이지를 갱신하여 검색 초기화
            if i < total:
                try:
                    await self.page.goto(self.TARGET_URL, wait_until="domcontentloaded")
                    await asyncio.sleep(2)
                except:
                    pass

            if self.inter_delay > 0 and i < total:
                wait_min = self.inter_delay // 60
                wait_sec = self.inter_delay % 60
                self.log(f"   ⏸️ 다음 매물까지 {wait_min}분 {wait_sec}초 대기")
                await asyncio.sleep(self.inter_delay)
        self.log(f"🗑️ 삭제 완료: 성공 {success} / 실패 {fail}")

    def _update_row_status(self, tree_id, status_text):
        vals = list(self.tree.item(tree_id, "values"))
        vals[-1] = status_text
        self.root.after(0, lambda t=tree_id, v=vals: self.tree.item(t, values=v))

    def _on_deletion_done(self):
        self.btn_delete.config(state=tk.NORMAL, bg="#c0392b")
        self.log("🗑️ 매물삭제 프로세스 종료")

    def _on_execution_done(self):
        self.btn_execute.config(state=tk.NORMAL, bg="white", fg="#1e4080")
        self.btn_execute.config(text="🚀  매물재등록")
        if self.is_reserved:
            self.toggle_reservation() # 예약 모드 해제

    def toggle_reservation(self):
        if self.is_reserved:
            # 예약 취소
            if self.reservation_task:
                self.reservation_task.cancel()
                self.reservation_task = None
            self.is_reserved = False
            self.btn_execute.config(text="🚀  매물재등록", bg="white", fg="#1e4080")
            self.log("⏹️ 예약이 취소되었습니다.")
        else:
            # 예약 설정
            try:
                import datetime
                y = int(self.ent_year.get().strip())
                m = int(self.ent_month.get().strip())
                d = int(self.ent_day.get().strip())
                h = int(self.ent_hour.get().strip())
                mi = int(self.ent_minute.get().strip())
                
                res_time = datetime.datetime(y, m, d, h, mi)
                now = datetime.datetime.now()
                
                if res_time <= now:
                    messagebox.showwarning("경고", "예약 시간은 현재보다 미래여야 합니다.")
                    return
                
                diff = (res_time - now).total_seconds()
                self.is_reserved = True
                self.btn_execute.config(text="🚫 예약 대기 (취소)", bg="#c0392b")
                
                wait_h = int(diff // 3600)
                wait_m = int((diff % 3600) // 60)
                self.log(f"⏰ 예약이 설정되었습니다: {res_time.strftime('%Y-%m-%d %H:%M')} ({wait_h}시간 {wait_m}분 후 시작)")
                
                async def wait_and_start():
                    try:
                        await asyncio.sleep(diff)
                        self.root.after(0, self.start_execution)
                    except asyncio.CancelledError:
                        pass
                
                self.reservation_task = asyncio.run_coroutine_threadsafe(wait_and_start(), self.loop)
                
            except Exception as e:
                messagebox.showerror("오류", f"시간 형식이 잘못되었거나 입력값이 부적절합니다.\\n{e}")

    async def _execute_batch(self, targets):
        success_count = 0
        fail_count = 0
        total = len(targets)

        for i, (tree_id, prop_id) in enumerate(targets, 1):
            self.log(f"\n▶ [{i}/{total}] 타겟 매물 처리 중: {prop_id}")
            vals = list(self.tree.item(tree_id, 'values'))
            vals[-1] = "진행중..."
            self.root.after(0, lambda t_id=tree_id, v=vals: self.tree.item(t_id, values=v))
            
            # ── 결제대기 여부 판단 ──
            # vals[13]=진행상황(status), vals[12]=종료일, vals[11]=등록일
            # 결제대기 items는 period에 "Invalid date"가 들어있음 (엑셀 파싱 특성)
            is_payment_mode = (vals[13] == "결제대기") or ("Invalid date" in str(vals[11])) or (vals[12] == "결제대기")
            if is_payment_mode:
                self.log(f"   💳 [결제대기] 모드로 처리 (status={vals[13]}, period={vals[11]})")


            # ── [중요] 과태료 방지: 소유자, 거래완료 등 재등록 금지 매물 철저 차단 ──
            if 'ERP:' in str(vals[13]) and any(k in str(vals[13]) for k in ERP.STOP):
                self.log(f"   🚫 [ERP] 우리 매물장에서 '{vals[13]}' — 재등록하지 않습니다.")
                vals[-1] = "제외(ERP)"
                self.root.after(0, lambda t_id=tree_id, v=vals: self.tree.item(t_id, values=v))
                continue
            if any(k in str(vals[13]) for k in ("소유자", "거래완료")):
                self.log(f"   🚫 [안전 차단] '{vals[13]}' 상태의 매물은 재등록을 엄격히 금지합니다. (과태료 대상)")
                vals[-1] = "제외(과태료위험)"
                self.root.after(0, lambda t_id=tree_id, v=vals: self.tree.item(t_id, values=v))
                continue

            try:
                # [단계 1] 폴더로 이동 (결제대기면 전체폴더, 아니면 광고종료)
                if is_payment_mode:
                    await self._goto_all_folder()
                else:
                    await self._goto_ad_ended_folder()
                await asyncio.sleep(1.0)

                # [단계 2] 매물번호 검색창 입력
                try:
                    self.log(f"   🔍 매물번호 '{prop_id}' 검색 중...")
                    search_input = self.page.locator("input[placeholder*='매물번호']").first
                    if await search_input.count() > 0:
                        await search_input.fill("")
                        await search_input.fill(prop_id)
                        # 검색 버튼 클릭 시도
                        search_btn = self.page.locator("button:has-text('검색'), a:has-text('검색')").first
                        if await search_btn.count() > 0:
                            await search_btn.click(force=True)
                        else:
                            await search_input.press("Enter")
                        await asyncio.sleep(1.0)
                    else:
                        self.log(f"   (매물번호 검색란을 찾지 못했습니다. 전체 목록에서 탐색합니다.)")
                except Exception as e:
                    self.log(f"   (매물번호 검색 무시됨: {e})")

                is_success = False
                if is_payment_mode:
                    # ── [결제대기] 해당 매물 행의 [광고하기] 버튼을 직접 마킹 후 클릭 ──
                    # (체크박스 + 일괄버튼 방식 대신, 행 내 버튼을 직접 타겟팅)
                    self.log(f"   🖱️ 매물 {prop_id} 행의 [광고하기] 버튼 직접 클릭 시도...")

                    ad_btn_marked = await self.page.evaluate(f"""
                        (pId) => {{
                            const rows = Array.from(document.querySelectorAll('tr, li, div.item, div[class*="list"]'));
                            for(const r of rows) {{
                                if(r.innerText && r.innerText.includes(pId)) {{
                                    const btns = Array.from(r.querySelectorAll('button, a'));
                                    for(const b of btns) {{
                                        const txt = (b.innerText || b.value || b.textContent || '').trim().replace(/\\s+/g, '');
                                        if(txt === '광고하기') {{
                                            b.setAttribute('data-bot-pay-btn', 'pay-{prop_id}');
                                            b.style.border = '3px solid orange';
                                            b.style.boxShadow = '0 0 10px orange';
                                            return true;
                                        }}
                                    }}
                                }}
                            }}
                            return false;
                        }}
                    """, prop_id)

                    if not ad_btn_marked:
                        self.log(f"   ⚠️ 매물 {prop_id} 행에서 [광고하기] 버튼을 찾지 못했습니다.")
                        fail_count += 1
                        vals = list(self.tree.item(tree_id, 'values'))
                        vals[-1] = "실패(광고버튼없음)"
                        self.root.after(0, lambda t_id=tree_id, v=vals: self.tree.item(t_id, values=v))
                        continue

                    # 마킹된 버튼 클릭
                    try:
                        ad_btn_loc = self.page.locator(f'[data-bot-pay-btn="pay-{prop_id}"]')
                        bb = await ad_btn_loc.bounding_box()
                        if bb:
                            await self.page.mouse.move(bb['x'] + bb['width']/2, bb['y'] + bb['height']/2)
                            await asyncio.sleep(0.5)
                        await ad_btn_loc.click(force=True, timeout=3000)
                        self.log(f"   ✅ [광고하기] 버튼 클릭 완료")
                    except Exception as e:
                        self.log(f"   ⚠️ Locator 클릭 실패, JS 직접 클릭 시도: {e}")
                        try:
                            await self.page.evaluate(f"""
                                () => {{
                                    const btn = document.querySelector('[data-bot-pay-btn="pay-{prop_id}"]');
                                    if(btn) btn.click();
                                }}
                            """)
                        except: pass

                    await asyncio.sleep(2.5)

                    # 결제 화면 로드 대기
                    try: await self.page.wait_for_load_state("networkidle", timeout=8000)
                    except: pass
                    await asyncio.sleep(2.0)
                    
                    target_payment_page = self.page
                    if len(self.page.context.pages) > 1:
                        target_payment_page = self.page.context.pages[-1]
                        self.log("   (새 탭/팝업이 감지되어 해당 창에서 결제 처리를 시도합니다.)")
                        try:
                            await target_payment_page.bring_to_front()
                            await target_payment_page.wait_for_load_state("domcontentloaded", timeout=5000)
                        except: pass

                    # HTML 모달/팝업 확인 처리 (결제화면 진입 전 나타나는 확인 팝업만 처리)
                    # ※ 주의: '광고하기' 버튼은 누르지 않음 (결제 흐름 중단 방지)
                    self.log("   💬 결제 진입 전 팝업 확인 처리 중...")
                    try:
                        confirm_loc = target_payment_page.locator("button:has-text('확인'), a:has-text('확인')").first
                        if await confirm_loc.count() > 0 and await confirm_loc.is_visible():
                            await confirm_loc.click(force=True, timeout=2000)
                            self.log("   ✅ 팝업 [확인] 클릭 완료")
                            await asyncio.sleep(1.5)
                            try: await target_payment_page.wait_for_load_state("networkidle", timeout=6000)
                            except: pass
                            await asyncio.sleep(2.0)
                    except Exception:
                        pass  # 팝업 없거나 자동 수락됨

                    # 결제 화면에서 체크박스 + [결제하기] 클릭
                    self.log("   ⏳ 결제 처리 진행 중...")
                    await asyncio.sleep(2.0)

                    is_success = await self._check_and_click_transmit_button(target_payment_page)
                    
                    # 만약 새 탭이었다면 닫아주기
                    if target_payment_page != self.page:
                        try: await target_payment_page.close()
                        except: pass

                    # 결제 후 실제 성공 여부 검증 (페이지 상태 확인)
                    if is_success:
                        await asyncio.sleep(2.0)
                        # 결제 완료 확인: 팝업 메시지, 현재 URL 또는 페이지 텍스트 확인
                        try:
                            cur_url = self.page.url
                            page_text = await self.page.inner_text("body")
                            last_msg = getattr(self, 'last_dialog_message', '')

                            if "완료" in last_msg or "등록되었습니다" in last_msg or "전송되었습니다" in last_msg:
                                self.log(f"   🎉 팝업으로 결제 완료 확인됨! (팝업: {last_msg})")
                                # 성공했으므로 초기화
                                self.last_dialog_message = ""
                            elif "동의" in last_msg or "실패" in last_msg or "에러" in last_msg:
                                self.log(f"   ⚠️ 팝업 에러 발생: {last_msg}")
                                is_success = False
                                self.last_dialog_message = ""
                            elif any(kw in page_text for kw in ["결제완료", "광고등록완료", "등록되었습니다", "완료되었습니다", "노출중"]):
                                self.log("   🎉 화면 텍스트로 결제 완료 확인됨!")
                            elif "결제대기" in page_text and prop_id in page_text:
                                # 여전히 결제대기 상태면 실패로 처리
                                self.log(f"   ⚠️ 결제 후 화면에 '결제대기'가 남아있어 실패 의심.")
                                is_success = False
                        except: pass

                        self.log("   🔄 목록으로 복귀합니다...")
                        try: await self.page.goto(self.TARGET_URL, wait_until="domcontentloaded", timeout=10000)
                        except: pass
                    else:
                        self.log("   ❌ 결제 전송 처리 실패.")
                        try: await self.page.goto(self.TARGET_URL, wait_until="domcontentloaded", timeout=10000)
                        except: pass
                else:
                    # [단계 3] 버튼(재광고) 찾아 data-bot-target 속성 부여
                    btn_found = await self.page.evaluate(f"""
                        (params) => {{
                            const pId = params.pId;
                            const targetWord = '재광고';
                            const allElems = document.querySelectorAll('tr, li, div.item, div[class*="list"]');
                            for(const r of allElems) {{
                                if(r.innerText && r.innerText.includes(pId)) {{
                                    // ── [안전장치] 화면 상에 과태료 대상 키워드가 있으면 차단 ──
                                    if(r.innerText.includes('소유자') || r.innerText.includes('거래완료')) {{
                                        return 'BLOCKED_BY_POLICY';
                                    }}
                                    const btns = Array.from(r.querySelectorAll('a, button, span, input'));
                                    for(const b of btns) {{
                                        const txt = (b.innerText || b.value || b.alt || b.title || '').trim();
                                        if(txt === targetWord || txt.includes(targetWord)) {{
                                            let target_elem = b;
                                            if(b.tagName.toLowerCase() === 'img' && b.parentElement && b.parentElement.tagName.toLowerCase() === 'a') {{
                                                target_elem = b.parentElement;
                                            }}
                                            target_elem.setAttribute('data-bot-target', `re-register-${{pId}}`);
                                            target_elem.style.border = '3px solid blue';
                                            target_elem.style.boxShadow = '0 0 10px blue';
                                            return true;
                                        }}
                                    }}
                                }}
                            }}
                            return false;
                        }}
                    """, {'pId': prop_id})

                    if btn_found == 'BLOCKED_BY_POLICY':
                        self.log(f"   🚫 [안전 차단] [{prop_id}] 웹페이지 상에서 '소유자' 또는 '거래완료' 상태가 감지되어 재등록이 차단되었습니다! (과태료 방지)")
                        fail_count += 1
                        vals = list(self.tree.item(tree_id, 'values'))
                        vals[-1] = "제외(과태료위험)"
                        self.root.after(0, lambda t_id=tree_id, v=vals: self.tree.item(t_id, values=v))
                        continue

                    if not btn_found:
                        self.log(f"   ⚠️ 리스트에서 [{prop_id}] 매물의 재광고 버튼을 찾지 못했습니다. 건너뜁니다.")
                        fail_count += 1
                        vals = list(self.tree.item(tree_id, 'values'))
                        vals[-1] = "실패(목록없음)"
                        self.root.after(0, lambda t_id=tree_id, v=vals: self.tree.item(t_id, values=v))
                        continue

                    # [단계 4] 버튼 클릭
                    self.log(f"   🖱️ 클릭 진행!")
                    await self.page.evaluate("""
                        () => {
                            if(!document.getElementById('playwright-mouse-pointer')) {
                                const dot = document.createElement('div');
                                dot.id = 'playwright-mouse-pointer';
                                dot.style.cssText = 'position:fixed;width:22px;height:22px;border-radius:50%;background:rgba(255,0,0,0.65);border:2px solid white;pointer-events:none;z-index:2147483647;transition:left 0.15s,top 0.15s;';
                                document.body.appendChild(dot);
                                document.addEventListener('mousemove', e => { dot.style.left=(e.clientX-11)+'px'; dot.style.top=(e.clientY-11)+'px'; });
                            }
                        }
                    """)
                    try:
                        target_locator = self.page.locator(f'[data-bot-target="re-register-{prop_id}"]')
                        bb = await target_locator.bounding_box()
                        if bb:
                            await self.page.mouse.move(bb['x'] + bb['width']/2, bb['y'] + bb['height']/2)
                        await asyncio.sleep(0.8)
                        await self.page.evaluate(f"""
                            () => {{
                                const el = document.querySelector('[data-bot-target="re-register-{prop_id}"]');
                                if(el) el.click();
                            }}
                        """)
                    except Exception as e:
                        self.log(f"   (재광고 클릭 예외: {e})")
                        try:
                            await self.page.locator(f'[data-bot-target="re-register-{prop_id}"]').click(force=True, timeout=2000)
                        except: pass

                    # [단계 5] 재광고 폼 화면 로딩 대기
                    self.log("   ⏳ 재광고 폼 화면 로딩 대기 중...")
                    try:
                        await self.page.wait_for_url(lambda url: 'readvertise' in url or 'repost' in url or 're_ad' in url or url != self.TARGET_URL, timeout=5000)
                    except: pass
                    try:
                        await self.page.wait_for_load_state("networkidle", timeout=5000)
                    except:
                        try: await self.page.wait_for_load_state("domcontentloaded", timeout=3000)
                        except: pass
                    await asyncio.sleep(1.5)

                    # [단계 6] 재광고 폼에서 "광고하기" 버튼 클릭
                    form_submitted = await self._submit_register_form(self.page)

                    # [단계 7] 결제 화면에서 체크박스 + 결제하기
                    if form_submitted:
                        self.log("   ⏳ 결제 화면 로딩 대기 중...")
                        try:
                            await self.page.wait_for_load_state("networkidle", timeout=6000)
                        except:
                            try: await self.page.wait_for_load_state("domcontentloaded", timeout=4000)
                            except: pass
                        await asyncio.sleep(2.0)

                        target_payment_page = self.page
                        if len(self.page.context.pages) > 1:
                            target_payment_page = self.page.context.pages[-1]
                            self.log("   (새 탭/팝업이 감지되어 해당 창에서 결제 처리를 시도합니다.)")
                            try:
                                await target_payment_page.bring_to_front()
                                await target_payment_page.wait_for_load_state("domcontentloaded", timeout=5000)
                            except: pass

                        is_success = await self._check_and_click_transmit_button(target_payment_page)
                        
                        # 만약 새 탭이었다면 닫아주기
                        if target_payment_page != self.page:
                            try: await target_payment_page.close()
                            except: pass

                        if is_success:
                            await asyncio.sleep(2.0)
                            self.log("   🔄 목록으로 복귀합니다...")
                            try:
                                await self.page.goto(self.TARGET_URL, wait_until="domcontentloaded", timeout=10000)
                            except: pass
                    else:
                        self.log("   ❌ 재광고 폼에서 [광고하기] 버튼을 찾지 못했습니다.")
                        try:
                            await self.page.goto(self.TARGET_URL, wait_until="domcontentloaded", timeout=10000)
                        except: pass

                # [결과 처리]
                vals = list(self.tree.item(tree_id, 'values'))
                if is_success:
                    success_count += 1
                    vals[-1] = "완료"
                    try:   # 2026-11-25 ERP '이' 광고 표시 켜기
                        r_ = self.erp.match(vals[5], vals[6], vals[8]) if self.erp.rows else None
                        if r_ and self.erp.mark_isj(r_):
                            self.log(f"   🔗 ERP {r_.get('id')} 이실장 광고 표시를 켰습니다")
                    except Exception as eE:
                        crash_log('mark_isj ' + str(eE))
                    self.root.after(0, lambda t_id=tree_id, v=vals: self.tree.item(t_id, values=v))
                else:
                    fail_count += 1
                    vals[-1] = "실패(진행오류)"
                    self.root.after(0, lambda t_id=tree_id, v=vals: self.tree.item(t_id, values=v))

            except Exception as e:
                # 매물 전체 프로세스 중 예상치 못한 에러
                self.log(f"   🚨 타겟 매물 처리 중 예기치 않은 오류 발생: {e}")
                fail_count += 1
                vals = list(self.tree.item(tree_id, 'values'))
                vals[-1] = "실패(네트워크오류)"
                self.root.after(0, lambda t_id=tree_id, v=vals: self.tree.item(t_id, values=v))
                # 다음 번 항목을 위해 안전하게 원상복귀
                try:
                    await self.page.goto(self.TARGET_URL, wait_until="domcontentloaded", timeout=10000)
                except:
                    pass

            # ── 속도 조절: 다음 매물 전 추가 대기 ──
            if self.inter_delay > 0 and i < total:
                wait_min = self.inter_delay // 60
                wait_sec = self.inter_delay % 60
                self.log(f"   ⏸️  🐢 천천히 모드 — 다음 매물까지 {wait_min}분 {wait_sec}초 대기 중...")
                await asyncio.sleep(self.inter_delay)

        # 루프 종료
        self.log("\n🔄 모든 처리가 완료되었습니다.")
        try:
            await self.page.goto(self.TARGET_URL, wait_until="domcontentloaded")
        except: pass
        self.log(f"🏁 작업 완료! [성공: {success_count} / 실패: {fail_count}]")
        self.root.after(0, lambda: messagebox.showinfo("완료", f"일괄 재등록 완료\n\n성공: {success_count}건\n실패: {fail_count}건"))


    async def _submit_register_form(self, target_page):
        """재광고 폼 하단 [광고하기] 버튼을 찾아 클릭. 클릭 성공 시 True 반환."""
        await self._close_popups()
        self.log("   🔍 재광고 폼에서 [광고하기] 버튼 탐색 중... (최대 8초)")
        try:
            for attempt in range(16):  # 0.5초 * 16 = 최대 8초 대기
                await asyncio.sleep(0.5)
                frames = [target_page] + list(target_page.frames)
                for frame in frames:
                    try:
                        # [팝업 방어] 루프 돌 때마다 혹시 닫기 버튼이 떴는지 확인 (0.1초 타임아웃으로 빠르게)
                        try:
                            close_loc = frame.locator("button:text-is('닫기'), a:text-is('닫기')").last
                            if await close_loc.is_visible(timeout=100):
                                await close_loc.click(timeout=1000)
                                self.log("   🧹 (실시간) 광고 팝업 [닫기] 클릭 완료")
                                await asyncio.sleep(0.5)
                        except Exception:
                            pass

                        # 정확히 "광고하기" 텍스트를 가진 버튼/링크 탐색
                        btn = frame.locator("button:text-is('광고하기'), a:text-is('광고하기'), input[value='광고하기']").last
                        if await btn.count() > 0 and await btn.is_visible():
                            self.log(f"   ✔️ [광고하기] 버튼 발견! (시도 {attempt+1}회)")
                            await btn.scroll_into_view_if_needed(timeout=2000)
                            bb = await btn.bounding_box()
                            if bb:
                                await target_page.mouse.move(bb['x'] + bb['width']/2, bb['y'] + bb['height']/2)
                            await asyncio.sleep(0.5)
                            await btn.click(force=True, timeout=3000)
                            self.log("   ✅ [광고하기] 클릭 완료!")
                            return True
                    except Exception:
                        pass
            self.log("   ⚠️ [광고하기] 버튼을 8초 내에 찾지 못했습니다.")
            return False
        except Exception as e:
            self.log(f"   💥 _submit_register_form 예외: {e}")
            return False

    async def _check_and_click_transmit_button(self, target_page):
        """결제 화면: 체크박스 체크 → 결제하기 클릭 → 완료 팝업 확인"""
        await self._close_popups()
        self.log("   탐색: 결제 화면에서 체크박스 및 [결제하기] 버튼 처리 중...")
        
        try:
            # 가상 마우스 포인터 주입
            await target_page.evaluate("""
                () => {
                    if(!document.getElementById('playwright-mouse-pointer')) {
                        const box = document.createElement('div');
                        box.id = 'playwright-mouse-pointer';
                        box.style.position = 'fixed';
                        box.style.width = '20px';
                        box.style.height = '20px';
                        box.style.borderRadius = '50%';
                        box.style.backgroundColor = 'rgba(255, 0, 0, 0.6)';
                        box.style.border = '2px solid white';
                        box.style.pointerEvents = 'none';
                        box.style.zIndex = '999999';
                        box.style.transition = 'left 0.2s, top 0.2s';
                        document.body.appendChild(box);
                        document.addEventListener('mousemove', e => {
                            box.style.left = e.clientX - 10 + 'px';
                            box.style.top = e.clientY - 10 + 'px';
                        });
                        document.addEventListener('mousedown', e => {
                            box.style.transform = 'scale(0.5)';
                            box.style.backgroundColor = 'rgba(0, 0, 255, 0.8)';
                        });
                        document.addEventListener('mouseup', e => {
                            box.style.transform = 'scale(1)';
                            box.style.backgroundColor = 'rgba(255, 0, 0, 0.6)';
                        });
                    }
                }
            """)
        except: pass

        try:
            # 페이지 최하단으로 스크롤 (결제하기 버튼 노출)
            await target_page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            await asyncio.sleep(1.0)
        except Exception as se:
            self.log(f"   (스크롤 예외 무시: {se})")
            
        try:
            frames = [target_page] + list(target_page.frames)
            for frame in frames:
                try:
                    # ────────────────────────────────────────────
                    # [Step A] 체크박스 처리
                    # ※ 모든 체크박스를 체크하면 '자동 재광고' 등 불필요한 옵션이 선택되어 결제가 막힐 수 있습니다.
                    #   따라서 '동의', '필수', '약관' 텍스트가 포함된 영역의 체크박스만 체크합니다.
                    # ────────────────────────────────────────────
                    self.log("   📋 약관 동의 체크박스 확인 중 (필수 항목만 체크)...")
                    try:
                        clicked = await frame.evaluate("""
                            () => {
                                let cnt = 0;
                                const checkboxes = document.querySelectorAll('input[type="checkbox"]');
                                checkboxes.forEach(chk => {
                                    if(chk.checked) return;
                                    
                                    // 라벨이나 부모 텍스트 확인
                                    const lbl = chk.closest('label') || document.querySelector('label[for="' + chk.id + '"]');
                                    const wrapper = chk.closest('div, li, p, td, tr') || document.body;
                                    const txt = (wrapper.innerText || "").trim().toLowerCase();
                                    
                                    // '동의', '필수', '약관', '개인정보', '로켓', '결제', '확인' 키워드가 포함된 경우만 체크
                                    if(txt.includes('동의') || txt.includes('필수') || txt.includes('약관') || txt.includes('개인정보') || txt.includes('로켓') || txt.includes('결제') || txt.includes('확인')) {
                                        try {
                                            if (lbl) { lbl.click(); } else { chk.click(); }
                                            cnt++;
                                        } catch(e) {}
                                    }
                                });
                                return cnt;
                            }
                        """)
                        self.log(f"   ✅ 필수 약관 체크박스 처리 완료 (체크한 수: {clicked}개)")
                    except Exception as e:
                        self.log(f"   (JS 약관 체크 예외: {e})")

                    # 진행과정을 볼 수 있도록 대기 시간 부여
                    self.log("   ⏸️ 결제 안정성을 위해 잠시 대기합니다 (3초)...")
                    await asyncio.sleep(3.0)

                    # ────────────────────────────────────────────
                    # [Step B] 결제하기 버튼 탐색
                    # 핵심: button 과 a 태그만 검색, div/span 절대 제외
                    #       텍스트를 완벽히 일치시켜 엉뚱한 '결제취소' 등을 누르지 않게 방어
                    # ────────────────────────────────────────────
                    self.log("   🔍 하단 [결제하기] 버튼 탐색 중 (엄격한 텍스트 일치)...")
                    
                    btn_found = await frame.evaluate("""
                        () => {
                            const btns = Array.from(document.querySelectorAll('button, a, input[type="button"], input[type="submit"], div[class*="btn"], span[class*="btn"]'));
                            
                            // 1차 탐색: 명확하게 '결제'를 지칭하는 버튼 찾기 (가장 하단부터 역순 탐색)
                            for (let i = btns.length - 1; i >= 0; i--) {
                                const b = btns[i];
                                const txt = (b.innerText || b.value || b.textContent || '').trim().replace(/\\s+/g, '');
                                if (['결제하기', '결제', '결제요청', '결제진행', '결제진행하기'].includes(txt)) {
                                    b.setAttribute('data-bot-final-pay', '1');
                                    b.style.border = '4px solid blue';
                                    b.style.boxShadow = '0 0 12px blue';
                                    return true;
                                }
                            }
                            
                            // 2차 탐색: 명확한 결제 버튼이 없다면 가장 마지막에 있는 '등록' 또는 '확인' 버튼 찾기
                            for (let i = btns.length - 1; i >= 0; i--) {
                                const b = btns[i];
                                const txt = (b.innerText || b.value || b.textContent || '').trim().replace(/\\s+/g, '');
                                if (['등록', '확인', '등록하기', '확인하기', '전송', '전송하기'].includes(txt)) {
                                    b.setAttribute('data-bot-final-pay', '1');
                                    b.style.border = '4px solid blue';
                                    b.style.boxShadow = '0 0 12px blue';
                                    return true;
                                }
                            }
                            return false;
                        }
                    """)
                    
                    if btn_found:
                        pay_btn = frame.locator('[data-bot-final-pay="1"]')
                        await pay_btn.scroll_into_view_if_needed(timeout=2000)
                        await asyncio.sleep(0.5)

                        self.log("   ✅ [결제하기] 버튼 발견!")
                        
                        # 마우스 이동
                        bb = await pay_btn.bounding_box()
                        if bb:
                            mx = bb['x'] + bb['width'] / 2
                            my = bb['y'] + bb['height'] / 2
                            try: await target_page.mouse.move(mx, my)
                            except: pass

                        # ────────────────────────────────────────────
                        # [Step C] 결제하기 버튼 클릭 및 완료 팝업 처리
                        # ────────────────────────────────────────────
                        self.log("   🖱️ [결제하기] 버튼 클릭!")
                        await asyncio.sleep(0.5)
                        await pay_btn.click(force=True, timeout=3000)

                        self.log("   ⏳ 완료 팝업 대기 중 (3초)...")
                        await asyncio.sleep(3.0)

                        # HTML 모달 [확인] 버튼 처리 (window.alert 은 on_dialog 핸들러가 자동 처리)
                        # 중요: a:has-text('확인')은 푸터의 '현장확인' 링크를 누를 위험이 크므로 엄격한 text-is 사용
                        try:
                            confirm_btn = frame.locator("button:text-is('확인'), a:text-is('확인'), button:text-is('확인(OK)'), a:text-is('확인(OK)')").last
                            if await confirm_btn.count() > 0 and await confirm_btn.is_visible():
                                await confirm_btn.click(force=True, timeout=1500)
                                self.log("   ✅ 팝업 [확인] 클릭 완료!")
                        except: pass

                        await asyncio.sleep(1.0)
                        return True


                except Exception as e:
                    self.log(f"   (결제 단계 frame 예외: {e})")
                    continue

        except Exception as e:
            self.log(f"   (결제 버튼 처리 에러: {e})")
        
        self.log("   ❌ [결제하기] 버튼을 끝내 찾지 못했습니다.")
        return False

    def load_account_info(self):
        """이실장_계정정보.txt 파일에서 계정 정보를 읽어와 입력창에 설정합니다."""
        filepath = os.path.join(os.getcwd(), "이실장_계정정보.txt")
        if not os.path.exists(filepath):
            import sys
            if getattr(sys, 'frozen', False):
                base_dir = os.path.dirname(sys.executable)
                filepath = os.path.join(base_dir, "이실장_계정정보.txt")
        
        if os.path.exists(filepath):
            try:
                broker_id, user_id, user_pw = "", "", ""
                with open(filepath, "r", encoding="utf-8") as f:
                    for line in f:
                        line_stripped = line.strip()
                        if "중개사 ID" in line_stripped:
                            parts = line_stripped.split(":")
                            if len(parts) > 1: broker_id = parts[1].strip()
                        elif "이실장 ID" in line_stripped:
                            parts = line_stripped.split(":")
                            if len(parts) > 1: user_id = parts[1].strip()
                        elif "비밀번호" in line_stripped:
                            parts = line_stripped.split(":")
                            if len(parts) > 1: user_pw = parts[1].strip()
                
                if broker_id:
                    self.ent_broker_id.delete(0, tk.END)
                    self.ent_broker_id.insert(0, broker_id)
                if user_id:
                    self.ent_user_id.delete(0, tk.END)
                    self.ent_user_id.insert(0, user_id)
                if user_pw:
                    self.ent_user_pw.delete(0, tk.END)
                    self.ent_user_pw.insert(0, user_pw)
            except Exception as e:
                self.log(f"⚠️ 계정정보 로드 중 오류 발생: {e}")

    def save_account_info(self):
        """입력창에 있는 계정 정보를 이실장_계정정보.txt 파일에 저장합니다."""
        import sys
        if getattr(sys, 'frozen', False):
            base_dir = os.path.dirname(sys.executable)
        else:
            base_dir = os.getcwd()
        filepath = os.path.join(base_dir, "이실장_계정정보.txt")
        
        broker_id = self.ent_broker_id.get().strip()
        user_id = self.ent_user_id.get().strip()
        user_pw = self.ent_user_pw.get().strip()
        
        try:
            with open(filepath, "w", encoding="utf-8") as f:
                f.write("# 이실장(aipartner.com) 계정 정보\n")
                import datetime
                f.write(f"# 저장일: {datetime.date.today().strftime('%Y-%m-%d')}\n\n")
                f.write(f"중개사 ID : {broker_id}\n")
                f.write(f"이실장 ID : {user_id}\n")
                f.write(f"비밀번호   : {user_pw}\n\n")
                f.write("로그인 URL : https://www.aipartner.com/home\n")
            
            from tkinter import messagebox
            messagebox.showinfo("저장 완료", f"계정 정보가 성공적으로 저장되었습니다.\n저장 경로: {filepath}")
            self.log("💾 계정 정보가 파일에 저장되었습니다.")
        except Exception as e:
            from tkinter import messagebox
            messagebox.showerror("저장 실패", f"계정 정보 저장 중 오류가 발생했습니다: {e}")
            self.log(f"❌ 계정정보 저장 실패: {e}")

    def on_closing(self):
        if self._closing: return
        self._closing = True

        async def _shutdown():
            try:
                if self.browser: await self.browser.close()
                if self._pw: await self._pw.stop()
            except: pass
            finally:
                self.loop.stop()
                self.root.after(0, self.root.destroy)

        if self.loop.is_running():
            asyncio.run_coroutine_threadsafe(_shutdown(), self.loop)
        else:
            self.root.destroy()


if __name__ == "__main__":
    sys.excepthook = lambda tp, v, tb: crash_log(''.join(_tb.format_exception(tp, v, tb)))
    try:
        os.chdir(_EXE_DIR)   # 바로가기·작업폴더와 상관없이 프로그램 폴더 기준
    except Exception:
        pass
    root = tk.Tk()
    root.report_callback_exception = lambda tp, v, tb: crash_log(''.join(_tb.format_exception(tp, v, tb)))
    app = App(root)
    root.protocol("WM_DELETE_WINDOW", app.on_closing)
    root.mainloop()
