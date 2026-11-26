# -*- coding: utf-8 -*-
"""
브리즈 블로그 발행 (exe)  — 2026-11-24 대표 지시
  ERP 의 '블로그 발행' 화면을 없애고 이 PC 프로그램으로 옮김.
  ① ERP 계정+6자리 비밀번호로 로그인(원고·매물 사진을 ERP 서버에서 받는다)
  ② 원고를 고르고 [네이버 임시저장] → 크롬 창이 열린다. 처음 한 번은 그 창에서 사람이 네이버에 로그인한다(로그인 상태 유지 체크)
  ③ 프로그램이 제목 · 썸네일 · 본문 · 매물정보표 · 매물 사진(최대 10장)을 넣고 '임시저장'까지 누른다
  ④ 발행은 사람이 네이버에서 확인한 뒤 직접 누른다 → 다 올렸으면 [발행 완료 표시]
  비밀번호·토큰은 코드에 없다. ERP 로그인으로 받은 토큰만 이 PC(%APPDATA%\\BreezeBlog)에 둔다. 네이버 비밀번호는 저장하지 않는다.
"""
import os, sys, json, base64, time, threading, queue, traceback, re, io, tempfile, urllib.parse
from html.parser import HTMLParser
import tkinter as tk
from tkinter import ttk, messagebox
import requests

APP = '브리즈 블로그 발행'
APP_DIR = os.path.join(os.environ.get('APPDATA', os.path.expanduser('~')), 'BreezeBlog')
os.makedirs(APP_DIR, exist_ok=True)
CONF_PATH = os.path.join(APP_DIR, 'config.json')
EXE_DIR = os.path.dirname(sys.executable if getattr(sys, 'frozen', False) else os.path.abspath(__file__))
TMP = os.path.join(APP_DIR, 'tmp')
OFFICE = {'name': '브리즈부동산중개', 'reg': '50110-2026-00057', 'addr': '제주시 삼무로1길 13, 1층', 'ceo': '박정희', 'phone': '010-2601-0110'}


def crash_log(msg):
    try:
        with open(os.path.join(EXE_DIR, '오류기록.txt'), 'a', encoding='utf-8') as f:
            f.write(time.strftime('[%Y-%m-%d %H:%M:%S] ') + msg + '\n')
    except Exception:
        pass


def load_conf():
    c = {}
    for p in (os.path.join(EXE_DIR, 'breeze_blog_config.json'), CONF_PATH):   # 프로그램 옆 파일(서버 주소) → 이 PC 저장값(토큰)
        try:
            with open(p, encoding='utf-8') as f:
                c.update(json.load(f))
        except Exception:
            pass
    return c


def save_conf(c):
    with open(CONF_PATH, 'w', encoding='utf-8') as f:
        json.dump(c, f, ensure_ascii=False)


CONF = load_conf()


# ───────────────────────── ERP 서버 ─────────────────────────
def post(body, timeout=180):
    r = requests.post(CONF['gas_url'], data=json.dumps(body), headers={'Content-Type': 'text/plain'}, timeout=timeout)
    return r.json()


def api(action, **kw):
    j = post(dict(kw, action=action, token=CONF.get('token', '')))
    if not j.get('ok'):
        raise RuntimeError(j.get('error') or '서버 오류')
    res = j.get('result') or {}
    if isinstance(res, dict) and res.get('error'):
        raise RuntimeError(res['error'])
    return res


def listings():
    r = requests.get(CONF['gas_url'], params={'action': 'getAll', 'type': 'listings', 'compact': '1', 'token': CONF.get('token', '')}, timeout=180)
    j = r.json()
    if not j.get('ok'):
        raise RuntimeError(j.get('error') or '매물 조회 실패')
    if isinstance(j.get('cols'), list):
        cols = j['cols']
        return [{cols[i]: (row[i] if i < len(row) else '') for i in range(len(cols))} for row in j['rows']]
    return j.get('data') or []


class BodyPick(HTMLParser):
    """원고 html 에서 <title>, id=blog-body 안쪽 html 을 꺼낸다"""
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.title, self.out, self.depth, self.in_t, self.h1 = '', [], 0, False, ''
        self._h1 = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if self.depth:
            self.out.append(self.get_starttag_text())
            if tag not in ('br', 'img', 'hr', 'meta', 'input', 'source', 'wbr'):
                self.depth += 1
        elif a.get('id') == 'blog-body':
            self.depth = 1
        if tag == 'title':
            self.in_t = True
        if tag == 'h1':
            self._h1 = True

    def handle_startendtag(self, tag, attrs):
        if self.depth:
            self.out.append(self.get_starttag_text())

    def handle_endtag(self, tag):
        if tag == 'title':
            self.in_t = False
        if tag == 'h1':
            self._h1 = False
        if self.depth:
            if tag in ('br', 'img', 'hr', 'meta', 'input', 'source', 'wbr'):
                return
            self.depth -= 1
            if self.depth:
                self.out.append('</%s>' % tag)

    def handle_data(self, d):
        if self.in_t:
            self.title += d
        if self._h1 and not self.h1:
            self.h1 = d.strip()
        if self.depth:
            self.out.append(d)

    def handle_entityref(self, n):
        if self.depth:
            self.out.append('&%s;' % n)

    def handle_charref(self, n):
        if self.depth:
            self.out.append('&#%s;' % n)


def parse_draft(html):
    p = BodyPick()
    p.feed(html)
    body = ''.join(p.out) if p.out else re.sub(r'(?is)^.*<body[^>]*>|</body>.*$', '', html)
    body = re.sub(r'(?is)<script.*?</script>', '', body)
    return (p.title or p.h1).strip(), body


# ───────────────────────── 매물정보표(중개대상물 명시사항) ─────────────────────────
def won(v):
    s = str(v or '').strip().replace(',', '')
    if not s:
        return ''
    try:
        x = float(s)
    except ValueError:
        return str(v)
    if x >= 10000:
        e, m = int(x // 10000), int(round(x % 10000))
        return f'{e}억 {m:,}만원' if m else f'{e}억원'
    return f'{int(x):,}만원' if x == int(x) else f'{x:,}만원'


def info_rows(d):
    n = lambda k: str(d.get(k) or '').strip()
    t = n('type')
    if t == '매매':
        price = '매매가 ' + won(n('price'))
    elif t == '전세':
        price = '전세금 ' + won(n('price'))
    else:
        price = ' / '.join(x for x in [n('price') and '보증금 ' + won(n('price')), n('rentAmt') and (t or '월세') + ' ' + won(n('rentAmt'))] if x)
    words = [w for w in re.sub(r'^제주특별자치도\s*', '', n('addr')).split() if not re.search(r'\d', w)]
    fl, tf = n('floor').rstrip('층'), n('totalFloor').rstrip('층')
    av = n('availDate')
    avail = '즉시입주' if '즉시' in av else ('협의' if '협의' in av else av[:10])
    apr = re.sub(r'\D', '', n('aprDate'))
    return [
        ('소재지', ' '.join(words[:3])), ('거래형태', t),
        ('전용면적', n('area') and n('area') + '㎡'), ('해당 층 / 총 층수', (fl or tf) and f"{fl or '-'} / {tf or '-'}층"),
        ('가격', price), ('입주가능일', avail),
        ('방향(주된출입구기준)', n('direction') and n('direction').rstrip('향') + '향'), ('방 수 / 욕실 수', (n('rooms') or n('baths')) and f"{n('rooms') or '-'} / {n('baths') or '-'}"),
        ('중개대상물의 종류', n('kind')), ('사용승인일', f'{apr[:4]}.{apr[4:6]}.{apr[6:8]}' if len(apr) >= 8 else n('aprDate')),
        ('주차가능여부', n('parking') or ('가능' if n('parkTotal') not in ('', '0') else '')), ('총주차대수', n('parkTotal') and n('parkTotal') + '대'),
        ('건축물 용도', n('bldgUse')), ('관리비', (won(n('feeAmt')) + (f" ({n('feeType')})" if n('feeType') else '')) if n('feeAmt') else (n('feeType') or '사용량에 따라 다름')),
    ]


def office_rows(staff=''):
    return [('명칭', OFFICE['name']), ('등록번호', OFFICE['reg']), ('소재지', OFFICE['addr']), ('개업공인중개사', OFFICE['ceo']), ('연락처', OFFICE['phone'])]   # 2026-11-26 대표 지시 — 소속공인중개사 칸은 뺀다


def draw_info_card(d, path):
    from PIL import Image, ImageDraw, ImageFont
    fdir = os.path.join(os.environ.get('WINDIR', 'C:\\Windows'), 'Fonts')
    def font(sz, bold=False):
        for f in (('malgunbd.ttf' if bold else 'malgun.ttf'), 'malgun.ttf', 'gulim.ttc'):
            try:
                return ImageFont.truetype(os.path.join(fdir, f), sz)
            except Exception:
                continue
        return ImageFont.load_default()
    rows, office = info_rows(d), office_rows()
    W, pad, H = 1080, 44, 96
    h = 80 + (56 + 28 + len(rows) * H) + (56 + 56 + len(office) * H) + 96
    im = Image.new('RGB', (W, h), 'white')
    g = ImageDraw.Draw(im)
    navy = '#1e3a5f'
    y = 80
    tw = W - pad * 2
    thw = int(tw * 0.4)
    def table(cap, rs, first):
        nonlocal y
        if not first:
            y += 56
        f = font(38, True)
        tw0 = g.textlength(f'· {cap} ·', font=f)
        g.text(((W - tw0) / 2, y), f'· {cap} ·', fill=navy, font=f)
        y += 56 + 28
        top = y
        for i, (k, v) in enumerate(rs):
            g.rectangle([pad, y, pad + thw, y + H], fill=navy)
            g.text((pad + 18, y + H / 2), k, fill='white', font=font(24, True), anchor='lm')
            g.rectangle([pad + thw, y, pad + tw, y + H], fill='#f4f6fb' if i % 2 else 'white')
            hl = k == '가격' and v
            g.text((pad + thw + 18, y + H / 2), v or '확인필요', fill=('#c0392b' if hl else ('#222' if v else '#4a7a5a')), font=font(24, bool(hl)), anchor='lm')
            g.line([pad + thw, y + H - 1, pad + tw, y + H - 1], fill='#eceef3', width=2)
            y += H
        g.rectangle([pad, top, pad + tw, y], outline='#dfe2ea', width=2)
    table('중개대상물 명시사항', rows, True)
    table('중개사무소 및 개업공인중개사 명시사항', office, False)
    im.save(path)
    return path


# ───────────────────────── 네이버(크롬) ─────────────────────────
EDITOR_IFRAME = 'mainFrame'
TITLE_SELS = ['div.se-title-text', '.se-documentTitle .se-text-paragraph', 'textarea.se-title-textarea']
BODY_SELS = ['.se-content .se-section-text .se-text-paragraph', '.se-main-container .se-text-paragraph', '.se-main-container .se-component-content', ".se-main-container [contenteditable='true']"]
IMG_BTN = ["button[data-name='image']", '.se-image-toolbar-button', "button[data-log='dot.img']"]
SAVE_SELS = ["button[data-click-area='tpb.save']", "button[class*='save_btn']", "button[data-action='temp']", 'button.se_publishBtn.__se_temp', '.publish-layer-spot-button-temp']
POPUP_SELS = ['button.se-popup-button-cancel', '.se-popup-button-cancel', 'button.se-help-panel-close-button']


class Naver:
    """크롬 한 창을 프로그램이 끝날 때까지 쓴다(작업은 이 스레드에서만)"""
    def __init__(self, log):
        self.log = log
        self.q = queue.Queue()
        self.ctx = None
        threading.Thread(target=self._run, daemon=True).start()

    def submit(self, fn, *a):
        self.q.put((fn, a))

    def _run(self):
        while True:
            fn, a = self.q.get()
            try:
                fn(*a)
            except Exception as e:
                crash_log(traceback.format_exc())
                self.log(f'❌ 오류: {e}')

    def _ensure(self):
        if self.ctx:
            try:
                _ = self.ctx.pages
                return
            except Exception:
                self.ctx = None
        from playwright.sync_api import sync_playwright
        self.pw = sync_playwright().start()
        self.ctx = self.pw.chromium.launch_persistent_context(
            os.path.join(APP_DIR, 'chrome'), channel='chrome', headless=False, no_viewport=True,
            args=['--start-maximized', '--disable-blink-features=AutomationControlled'], ignore_default_args=['--enable-automation'])
        self.ctx.grant_permissions(['clipboard-read', 'clipboard-write'], origin='https://blog.naver.com')

    def _page(self):
        return self.ctx.pages[0] if self.ctx.pages else self.ctx.new_page()

    def _login(self, page, url):
        page.goto(url)
        page.wait_for_load_state('domcontentloaded')
        if 'nid.naver.com' not in page.url and page.query_selector('iframe#' + EDITOR_IFRAME):
            return True
        if 'nid.naver.com' not in page.url:
            page.goto('https://nid.naver.com/nidlogin.login?url=' + urllib.parse.quote(url, safe=''))
        self.log('🔑 열린 크롬 창에서 네이버에 로그인해 주세요 ("로그인 상태 유지" 체크하면 다음부터 생략) — 10분 기다립니다')
        t0 = time.time()
        # 2026-11-26 로그인을 해도 글이 안 써지던 문제 — time.sleep 으로 기다리면 크롬의 주소 변화가 프로그램에 전달되지 않아 '아직 로그인 화면'으로 알았다.
        #   크롬에 직접 주소를 물어보고(열린 탭 전부), 로그인된 탭을 찾으면 그 탭에서 글쓰기 화면을 연다
        while time.time() - t0 < 600:
            page.wait_for_timeout(1500)
            for pg in list(self.ctx.pages):
                try:
                    href = pg.evaluate('location.href')
                except Exception:
                    continue
                if 'nid.naver.com' in href or not href.startswith('http'):
                    continue
                if 'naver.com' in href:
                    if pg is not page:
                        try:
                            pg.close()
                        except Exception:
                            pass
                    page.goto(url)
                    page.wait_for_load_state('domcontentloaded')
                    if 'nid.naver.com' in page.evaluate('location.href'):
                        break
                    self.log('✔ 네이버 로그인 확인')
                    return True
        raise RuntimeError('네이버 로그인을 기다리다 시간이 지났습니다(10분)')

    def _click_any(self, frame, sels, timeout=2000):
        for s in sels:
            try:
                el = frame.locator(s).first
                if el.count() and el.is_visible():
                    el.click(timeout=timeout)
                    return True
            except Exception:
                continue
        return False

    def _upload(self, page, frame, paths):
        for s in IMG_BTN:
            try:
                btn = frame.locator(s).first
                if not (btn.count() and btn.is_visible()):
                    continue
                with page.expect_file_chooser(timeout=8000) as fc:
                    btn.click(timeout=3000)
                fc.value.set_files(paths)
                time.sleep(2 + 1.5 * len(paths))
                return True
            except Exception:
                continue
        self.log('⚠ 사진 버튼을 못 찾았습니다 — 사진은 직접 넣어 주세요')
        return False

    def write(self, job, done):
        """job: url, title, body(html), thumb, card, photos(list 경로)"""
        self._ensure()
        page = self._page()
        page.bring_to_front()
        self._login(page, job['url'])
        # 2026-11-26 글쓰기 칸이 안쪽 창(mainFrame)에 있든 바깥 화면에 바로 있든 찾는다(최대 90초)
        frame = None
        for _ in range(90):
            f = page.frame(name=EDITOR_IFRAME)
            for cand in ([f] if f else []) + [page.main_frame]:
                try:
                    if cand.locator('.se-documentTitle, .se-title-text, textarea.se-title-textarea').count():
                        frame = cand
                        break
                except Exception:
                    pass
            if frame:
                break
            page.wait_for_timeout(1000)
        if not frame:
            raise RuntimeError('네이버 글쓰기 화면을 못 찾았습니다 — 크롬 창에 글쓰기 화면이 떠 있는지 확인해 주세요')
        self.log('✔ 글쓰기 화면 확인')
        page.wait_for_timeout(3000)
        for _ in range(3):   # '작성 중인 글 이어쓰기' · 도움말 창 닫기
            if not self._click_any(frame, POPUP_SELS):
                break
            time.sleep(0.8)
        page.keyboard.press('Escape')
        # 제목
        ok = False
        for s in TITLE_SELS:
            try:
                t = frame.locator(s).first
                t.click(timeout=3000)
                page.keyboard.press('Control+A')
                page.keyboard.press('Backspace')
                page.keyboard.type(job['title'], delay=25)
                ok = True
                break
            except Exception:
                continue
        if not ok:
            raise RuntimeError('제목 칸을 못 찾았습니다(네이버 화면이 바뀐 듯)')
        self.log('✔ 제목')
        # 본문 칸으로
        moved = False
        for s in BODY_SELS:
            try:
                frame.locator(s).first.click(timeout=3000)
                moved = True
                break
            except Exception:
                continue
        if not moved:
            page.keyboard.press('Enter')
        time.sleep(0.8)
        if job.get('thumb'):
            if self._upload(page, frame, [job['thumb']]):
                page.keyboard.press('Enter')
                self.log('✔ 썸네일(대표 사진)')
        # 본문 — 서식 그대로 붙여 넣기(사람이 Ctrl+V 하는 것과 같다)
        plain = re.sub(r'<[^>]+>', '', job['body'])
        page.evaluate("""async ([h, p]) => { await navigator.clipboard.write([new ClipboardItem({'text/html': new Blob([h], {type: 'text/html'}), 'text/plain': new Blob([p], {type: 'text/plain'})})]); }""", [job['body'], plain])
        page.keyboard.press('Control+V')
        time.sleep(3)
        self.log('✔ 본문')
        page.keyboard.press('Control+End')
        page.keyboard.press('Enter')
        if job.get('card'):
            if self._upload(page, frame, [job['card']]):
                page.keyboard.press('Enter')
                self.log('✔ 매물정보표')
        if job.get('photos'):
            if self._upload(page, frame, job['photos']):
                self.log(f"✔ 매물 사진 {len(job['photos'])}장")
        time.sleep(2)
        page.mouse.move(0, 0)
        if self._click_any(frame, SAVE_SELS, 5000) or self._click_any(page, SAVE_SELS, 5000):
            time.sleep(2)
            self.log('💾 네이버 임시저장 완료 — 크롬 창에서 확인하고 [발행]을 눌러 주세요')
            done(True)
        else:
            self.log('⚠ 임시저장 버튼을 못 찾았습니다 — 크롬 창에서 직접 [저장]을 눌러 주세요')
            done(False)


# ───────────────────────── 화면 ─────────────────────────
class App:
    def __init__(self, root):
        self.root = root
        root.title(APP)
        root.geometry('980x640')
        try:
            root.iconbitmap(os.path.join(getattr(sys, '_MEIPASS', EXE_DIR), 'icon.ico'))
        except Exception:
            pass
        self.rows, self.cur, self.conf, self.lst = [], None, None, None
        self.naver = Naver(self.log)
        top = ttk.Frame(root, padding=8)
        top.pack(fill='x')
        self.who = ttk.Label(top, text='')
        self.who.pack(side='left')
        ttk.Button(top, text='원고 새로 받기', command=self.load).pack(side='right')
        ttk.Button(top, text='로그아웃', command=self.logout).pack(side='right', padx=6)
        mid = ttk.Panedwindow(root, orient='horizontal')
        mid.pack(fill='both', expand=True, padx=8)
        left = ttk.Frame(mid)
        self.tree = ttk.Treeview(left, columns=('st', 'kind', 'id', 'title'), show='headings', selectmode='browse')
        for c, t, w in (('st', '상태', 70), ('kind', '종류', 50), ('id', '매물', 70), ('title', '제목', 330)):
            self.tree.heading(c, text=t)
            self.tree.column(c, width=w, anchor='w')
        self.tree.pack(fill='both', expand=True)
        self.tree.bind('<<TreeviewSelect>>', lambda e: self.pick())
        mid.add(left, weight=3)
        right = ttk.Frame(mid, padding=(10, 0))
        mid.add(right, weight=2)
        self.title = ttk.Label(right, text='왼쪽에서 원고를 고르세요', wraplength=360, font=('맑은 고딕', 11, 'bold'))
        self.title.pack(anchor='w', pady=(0, 8))
        self.v_thumb, self.v_card, self.v_photo = tk.BooleanVar(value=True), tk.BooleanVar(value=True), tk.BooleanVar(value=True)
        ttk.Checkbutton(right, text='썸네일(대표 사진) 맨 위에', variable=self.v_thumb).pack(anchor='w')
        ttk.Checkbutton(right, text='매물정보표(중개대상물 명시사항) 넣기', variable=self.v_card).pack(anchor='w')
        ttk.Checkbutton(right, text='매물 사진 넣기(최대 10장, 워터마크)', variable=self.v_photo).pack(anchor='w')
        self.go = ttk.Button(right, text='네이버 임시저장', command=self.publish)
        self.go.pack(anchor='w', pady=(10, 4), ipadx=10, ipady=4)
        ttk.Button(right, text='발행 완료 표시', command=lambda: self.mark('옮김')).pack(anchor='w', pady=2)
        ttk.Button(right, text='보류', command=lambda: self.mark('보류')).pack(anchor='w', pady=2)
        self.logbox = tk.Text(root, height=8, state='disabled', bg='#f6f8fb')
        self.logbox.pack(fill='x', padx=8, pady=8)
        root.after(200, self.start)

    def log(self, msg):
        def f():
            self.logbox.config(state='normal')
            self.logbox.insert('end', time.strftime('%H:%M ') + msg + '\n')
            self.logbox.see('end')
            self.logbox.config(state='disabled')
        self.root.after(0, f)

    def bg(self, fn, then=None):
        def run():
            try:
                r = fn()
                if then:
                    self.root.after(0, lambda: then(r))
            except Exception as e:
                crash_log(traceback.format_exc())
                self.log(f'❌ {e}')
        threading.Thread(target=run, daemon=True).start()

    def start(self):
        if not CONF.get('gas_url'):
            messagebox.showerror(APP, '서버 주소 파일(breeze_blog_config.json)이 프로그램 옆에 없습니다.')
            return
        if not CONF.get('token'):
            self.login_dialog()
        else:
            self.who.config(text=f"ERP: {CONF.get('account', '')}")
            self.load()

    def login_dialog(self):
        d = tk.Toplevel(self.root)
        d.title('ERP 로그인')
        d.grab_set()
        ttk.Label(d, text='ERP 계정과 6자리 비밀번호', padding=10).pack()
        acc = ttk.Combobox(d, state='readonly', width=20)
        acc.pack(padx=12, pady=4)
        pw = ttk.Entry(d, show='●', width=22)
        pw.pack(padx=12, pady=4)
        msg = ttk.Label(d, text='', foreground='#c62828')
        msg.pack()
        def accounts():
            try:
                return post({'action': 'loginAccounts'}).get('result') or []
            except Exception:
                return []
        self.bg(accounts, lambda a: (acc.config(values=a), acc.set(a[0] if a else '')))
        def go():
            a, p = acc.get(), pw.get().strip()
            def run():
                return post({'action': 'login', 'account': a, 'password': p})
            def after(j):
                if not j.get('ok') or not j.get('token'):
                    msg.config(text=j.get('error') or '로그인 실패')
                    return
                CONF['token'], CONF['account'] = j['token'], a
                save_conf({'token': j['token'], 'account': a})
                d.destroy()
                self.who.config(text=f'ERP: {a}')
                self.load()
            self.bg(run, after)
        ttk.Button(d, text='로그인', command=go).pack(pady=10)
        pw.bind('<Return>', lambda e: go())

    def logout(self):
        CONF.pop('token', None)
        save_conf({})
        self.tree.delete(*self.tree.get_children())
        self.login_dialog()

    def load(self):
        self.log('원고 받는 중…')
        def run():
            rows = api('blogDrafts').get('rows') or []
            try:
                self.conf = api('blogConf')
            except Exception:
                self.conf = None
            return rows
        def after(rows):
            self.rows = rows
            self.tree.delete(*self.tree.get_children())
            order = {'새 원고': 0, '옮김요청': 1, '보류': 2, '옮김': 3, '비공개': 4}
            for i, d in enumerate(sorted(rows, key=lambda x: (order.get(x.get('status'), 5), str(x.get('date', ''))), reverse=False)):
                st = '발행됨' if d.get('status') == '옮김' else d.get('status', '')
                self.tree.insert('', 'end', iid=str(i), values=(st, d.get('kind', ''), d.get('listingId', ''), d.get('title', '')))
                self.tree.set(str(i), 'st', st)
                self.tree.item(str(i), tags=(d.get('fileId'),))
            self.log(f'원고 {len(rows)}편')
        self.bg(run, after)

    def sel(self):
        s = self.tree.selection()
        if not s:
            return None
        fid = self.tree.item(s[0], 'tags')[0]
        return next((d for d in self.rows if d.get('fileId') == fid), None)

    def pick(self):
        self.cur = self.sel()
        if self.cur:
            self.title.config(text=self.cur.get('title', ''))
            self.v_card.set(bool(self.cur.get('listingId')))
            self.v_photo.set(bool(self.cur.get('listingId')))

    def publish(self):
        d = self.cur
        if not d:
            messagebox.showinfo(APP, '원고를 먼저 고르세요')
            return
        if d.get('status') in ('옮김', '비공개') and not messagebox.askyesno(APP, '이미 발행한 원고입니다. 그래도 다시 임시저장할까요?'):
            return
        if not self.conf or not self.conf.get('id'):
            messagebox.showerror(APP, '네이버 블로그 설정(블로그 아이디)을 못 받았습니다')
            return
        self.go.config(state='disabled')
        self.log(f"▶ {d.get('title', '')}")
        os.makedirs(TMP, exist_ok=True)
        for f in os.listdir(TMP):
            try:
                os.remove(os.path.join(TMP, f))
            except Exception:
                pass
        want_t, want_c, want_p = self.v_thumb.get(), self.v_card.get(), self.v_photo.get()

        def prep():
            html = api('blogDraftGet', fileId=d['fileId']).get('html') or ''
            title, body = parse_draft(html)
            job = {'title': title or d.get('title', ''), 'body': body}
            cat = (self.conf.get('cat') or {}).get(d.get('kind', ''), '')
            job['url'] = f"https://blog.naver.com/PostWriteForm.naver?blogId={urllib.parse.quote(self.conf['id'])}&Redirect=Write" + (f'&categoryNo={cat}' if cat else '')
            if want_t and d.get('thumbId'):
                g = api('blogThumbGet', thumbId=d['thumbId'])
                p = os.path.join(TMP, 'thumb.' + ('png' if 'png' in g.get('mime', '') else 'jpg'))
                open(p, 'wb').write(base64.b64decode(g['b64']))
                job['thumb'] = p
            lid = str(d.get('listingId') or '')
            if lid and want_c:
                row = next((x for x in listings() if str(x.get('id')) == lid), None)
                if row:
                    job['card'] = draw_info_card(row, os.path.join(TMP, f'매물정보표_{lid}.png'))
                else:
                    self.log('⚠ 매물장에서 매물을 못 찾아 매물정보표는 뺍니다')
            if lid and want_p:
                ph = api('blogPhotos', fileId=d['fileId']).get('photos') or []
                paths = []
                for i, x in enumerate(ph[:10]):
                    ext = '.png' if 'png' in x.get('mime', '') else '.jpg'
                    p = os.path.join(TMP, f'photo_{i + 1:02d}{ext}')
                    open(p, 'wb').write(base64.b64decode(x['b64']))
                    paths.append(p)
                job['photos'] = paths
                if not paths:
                    self.log('⚠ 이 매물 사진 폴더에 사진이 없습니다')
            return job

        def after(job):
            self.log('크롬 여는 중…')
            self.naver.submit(self.naver.write, job, lambda ok: self.root.after(0, lambda: self.go.config(state='normal')))
        def guard():
            try:
                return prep()
            except Exception:
                self.root.after(0, lambda: self.go.config(state='normal'))
                raise
        self.bg(guard, after)

    def mark(self, status):
        d = self.cur
        if not d:
            return
        def run():
            return api('blogDraftMark', fileId=d['fileId'], status=status, naverUrl='')
        def after(_):
            d['status'] = status
            self.log(f"'{status}'(으)로 표시했습니다")
            self.load()
        self.bg(run, after)


def main():
    def hook(t, v, tb):
        crash_log(''.join(traceback.format_exception(t, v, tb)))
    sys.excepthook = hook
    root = tk.Tk()
    try:
        ttk.Style().theme_use('vista')
    except Exception:
        pass
    App(root)
    root.mainloop()


if __name__ == '__main__':
    main()
