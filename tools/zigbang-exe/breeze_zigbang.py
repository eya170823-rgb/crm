# -*- coding: utf-8 -*-
"""
브리즈 직방 광고 (exe) — 2026-11-26 대표 지시
  ERP 매물목록의 광고 칸 '직' 버튼과 직방을 맞춘다.
   · 끄기(흑백)  → 직방 [매물 종료하기] → [네, 종료합니다]
   · 켜기(칼라)  → 직방에 종료된 같은 매물이 있으면 [매물 재등록하기] — 보증금·월세·면적은 ERP 값으로 고쳐서 등록
                   (직방에 이전 광고가 없는 새 매물은 다음 단계: 지금은 '신규 등록 필요'로 알려만 준다)
   · 등록되면 ERP 광고 표시에 직방 등록번호를 적어 둔다(다음에 내릴 때 그 번호로 찾음)
  ERP 로그인은 블로그·이실장 프로그램과 같다(한 번 하면 셋 다 됨). 직방 로그인은 이 프로그램 창에서 한 번(기억됨).
  프로그램을 켠 뒤에 누른 버튼만 처리한다(예전 표시는 건드리지 않음). [시험 모드]면 마지막 버튼은 누르지 않는다.
"""
import asyncio
import json
import os
import re
import sys
import threading
import time
import traceback
import tkinter as tk
from tkinter import ttk
import urllib.parse as up
import urllib.request as ur

from playwright.async_api import async_playwright

_EXE_DIR = os.path.dirname(sys.executable if getattr(sys, 'frozen', False) else os.path.abspath(__file__))
_APP_DIR = os.path.join(os.environ.get('APPDATA', os.path.expanduser('~')), 'BreezeBlog')   # ERP 로그인 저장소(공용)
_ZB_DIR = os.path.join(os.environ.get('LOCALAPPDATA', _APP_DIR), 'BreezeZigbang')
os.makedirs(_APP_DIR, exist_ok=True)
os.makedirs(_ZB_DIR, exist_ok=True)
STATE_F = os.path.join(_ZB_DIR, 'state.json')
BASE = 'https://ceo.zigbang.com'
SVCS = ('oneroom', 'officetel')
STOP = ('계약완료', '거래완료', '임대중', '보류')


def crash_log(msg):
    try:
        with open(os.path.join(_EXE_DIR, '오류기록.txt'), 'a', encoding='utf-8') as f:
            f.write(time.strftime('[%Y-%m-%d %H:%M:%S] ') + msg + '\n')
    except Exception:
        pass


def load_state():
    try:
        with open(STATE_F, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}


def save_state(st):
    try:
        with open(STATE_F, 'w', encoding='utf-8') as f:
            json.dump(st, f, ensure_ascii=False)
    except Exception:
        pass


_KN = {'1': '일', '2': '이', '3': '삼', '4': '사', '5': '오', '6': '육'}


def norm(s):
    t = re.sub(r'제주특별자치도|제주도|[\s()·,ㅣ|]', '', str(s or ''))
    return re.sub(r'([가-힣])([1-6])(동|리)', lambda m: m.group(1) + _KN[m.group(2)] + m.group(3), t)   # 이도2동 = 이도이동


def digits(s):
    return re.sub(r'\D', '', str(s or ''))


def won_man(s):
    """ERP 금액(만원) → 숫자. '200', '200만', '1,000' 모두 200/1000"""
    t = str(s or '').replace(',', '')
    m = re.search(r'\d+(?:\.\d+)?', t)
    if not m:
        return None
    v = float(m.group(0))
    if '억' in t:
        v = v * 10000
    return int(v)


class ERP:
    def __init__(self):
        self.conf = {}
        for p in (os.path.join(_EXE_DIR, 'breeze_blog_config.json'), os.path.join(_APP_DIR, 'config.json')):
            try:
                with open(p, encoding='utf-8') as f:
                    self.conf.update(json.load(f))
            except Exception:
                pass
        self.rows = []

    def ok(self):
        return bool(self.conf.get('gas_url') and self.conf.get('token'))

    def _post(self, body):
        req = ur.Request(self.conf['gas_url'], data=json.dumps(body).encode('utf-8'), headers={'Content-Type': 'text/plain'})
        with ur.urlopen(req, timeout=120) as r:
            return json.loads(r.read().decode('utf-8'))

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
            json.dump({'token': j['token'], 'account': account}, f, ensure_ascii=False)

    def load(self):
        q = up.urlencode({'action': 'getAll', 'type': 'listings', 'compact': '1', 'token': self.conf.get('token', '')})
        with ur.urlopen(self.conf['gas_url'] + '?' + q, timeout=180) as r:
            j = json.loads(r.read().decode('utf-8'))
        if not j.get('ok'):
            raise RuntimeError(j.get('error') or '매물 조회 실패')
        if isinstance(j.get('cols'), list):
            cols = j['cols']
            self.rows = [{cols[i]: (row[i] if i < len(row) else '') for i in range(len(cols))} for row in j['rows']]
        else:
            self.rows = j.get('data') or []
        return len(self.rows)

    def set_zb_no(self, r, no):
        """ERP 광고 표시 'zigbang~번호~시각~' — 켜진 직방 칸에 직방 등록번호를 적는다"""
        segs = [x.strip() for x in str(r.get('adsFlat') or '').split('|') if x.strip()]
        out = []
        for x in segs:
            p = (x.split('~') + ['', '', '', ''])[:4]
            if p[0] == 'zigbang':
                p[1] = str(no)
                x = '~'.join(p)
            out.append(x)
        flat = '|'.join(out)
        j = self._post({'action': 'upsert', 'type': 'listings', 'data': {'id': r.get('id'), 'adsFlat': flat}, 'token': self.conf.get('token', '')})
        if j.get('ok'):
            r['adsFlat'] = flat
        return bool(j.get('ok'))


def zb_seg(r):
    """→ ('on'|'off'|None, 번호, 시각)"""
    for x in str(r.get('adsFlat') or '').split('|'):
        p = (x.strip().split('~') + ['', '', '', ''])[:4]
        if p[0] == 'zigbang':
            return 'on', p[1].strip(), p[2].strip()
        if p[0] == 'off:zigbang':
            return 'off', p[1].strip(), p[2].strip()
    return None, '', ''


def card_matches(card, r):
    """직방 카드(주소ㅣ동호) ↔ ERP 매물(지번 주소 + 호)"""
    if card.get('no') and card['no'] == zb_seg(r)[1]:
        return True
    addr = norm(r.get('addr'))
    m = re.search(r'([가-힣]+\d*(?:동|읍|면|리))(?:[가-힣]*리)?(\d+(?:-\d+)?)', addr)
    if not m:
        return False
    ca = norm(card.get('addr'))
    if m.group(1) not in ca or not re.search(r'(?<![\d-])' + re.escape(m.group(2)) + r'(?![\d-])', ca):
        return False
    ho = digits(r.get('addr2'))
    return (not ho) or (ho == digits(card.get('ho')))


class App:
    def __init__(self, root):
        self.root = root
        root.title('브리즈 직방 광고')
        root.geometry('760x520')
        self.erp = ERP()
        self.st = load_state()
        if not self.st.get('since'):
            self.st['since'] = time.strftime('%Y-%m-%d %H:%M')   # 이 시각 뒤에 누른 버튼만 처리
            save_state(self.st)
        self.st.setdefault('done', {})
        self.busy = False
        top = tk.Frame(root)
        top.pack(fill='x', padx=10, pady=8)
        tk.Button(top, text='지금 처리', command=self.run_once, bg='#1c3a6e', fg='white').pack(side='left')
        self.auto = tk.BooleanVar(value=True)
        tk.Checkbutton(top, text='2분마다 자동', variable=self.auto).pack(side='left', padx=8)
        self.dry = tk.BooleanVar(value=bool(self.st.get('dry', True)))
        tk.Checkbutton(top, text='시험 모드(마지막 버튼은 안 누름)', variable=self.dry, command=self._save_dry).pack(side='left', padx=8)
        tk.Button(top, text='ERP 로그인', command=self._erp_login_dialog).pack(side='right')
        tk.Label(root, text=f"ERP 에서 {self.st['since']} 이후에 누른 '직' 버튼만 처리합니다.", fg='#555').pack(anchor='w', padx=10)
        self.txt = tk.Text(root, height=26)
        self.txt.pack(fill='both', expand=True, padx=10, pady=(4, 10))
        self.loop = asyncio.new_event_loop()
        threading.Thread(target=self.loop.run_forever, daemon=True).start()
        self.pw = self.ctx = self.page = None
        root.after(800, self._start)
        root.after(120000, self._tick)
        root.protocol('WM_DELETE_WINDOW', self._close)

    def _save_dry(self):
        self.st['dry'] = bool(self.dry.get())
        save_state(self.st)

    def log(self, s):
        self.root.after(0, lambda: (self.txt.insert('end', time.strftime('%H:%M ') + s + '\n'), self.txt.see('end')))

    def _start(self):
        if not self.erp.conf.get('gas_url'):
            self.log('⚠️ 프로그램 옆에 breeze_blog_config.json(ERP 서버 주소)이 없습니다.')
            return
        if not self.erp.ok():
            self._erp_login_dialog()
            return
        self.run_once()

    def _tick(self):
        if self.auto.get():
            self.run_once()
        self.root.after(120000, self._tick)

    def run_once(self):
        if self.busy:
            return
        self.busy = True
        fut = asyncio.run_coroutine_threadsafe(self._work(), self.loop)

        def done(f):
            self.busy = False
            e = f.exception()
            if e:
                crash_log(''.join(traceback.format_exception(e)))
                self.log(f'⚠️ 오류: {e}')
        fut.add_done_callback(done)

    # ── 직방 브라우저 ──
    async def _browser(self):
        if self.page and not self.page.is_closed():
            return self.page
        if not self.pw:
            self.pw = await async_playwright().start()
        self.ctx = await self.pw.chromium.launch_persistent_context(
            os.path.join(_ZB_DIR, 'profile'), channel='chrome', headless=False,
            viewport={'width': 1280, 'height': 900}, args=['--window-position=0,0'])
        self.page = self.ctx.pages[0] if self.ctx.pages else await self.ctx.new_page()
        return self.page

    async def _ensure_login(self, pg):
        await pg.goto(BASE + '/dashboard', wait_until='domcontentloaded')
        await pg.wait_for_timeout(1500)
        t0 = time.time()
        while '/dashboard' not in pg.url:
            if time.time() - t0 < 3:
                self.log('🔑 직방 창에서 로그인해 주세요(한 번 하면 기억됩니다). 기다리는 중…')
            if time.time() - t0 > 600:
                raise RuntimeError('직방 로그인을 기다리다 멈췄습니다')
            await pg.wait_for_timeout(3000)
            if '/dashboard' not in pg.url and 'login' not in pg.url and pg.url.startswith(BASE):
                await pg.goto(BASE + '/dashboard', wait_until='domcontentloaded')

    async def _popups(self, pg):
        """공지 팝업([닫기])이 뜨면 닫는다 — 버튼 클릭을 가리지 않게"""
        for _ in range(3):
            d = pg.locator('[role=alertdialog]:has(button:text-is("닫기"))')
            if not await d.count():
                return
            try:
                await d.first.get_by_role('button', name='닫기').click(timeout=2000)
            except Exception:
                return
            await pg.wait_for_timeout(400)

    async def _cards(self, pg, svc, status):
        await pg.goto(f'{BASE}/ads/{svc}?status={status}', wait_until='domcontentloaded')
        try:
            await pg.wait_for_selector('[data-sentry-component="AdItemCard"]', timeout=6000)
        except Exception:
            return []
        await self._popups(pg)
        for _ in range(20):   # 더 있으면 끝까지 내려서 다 불러온다
            n = await pg.locator('[data-sentry-component="AdItemCard"]').count()
            await pg.mouse.wheel(0, 20000)
            await pg.wait_for_timeout(700)
            if await pg.locator('[data-sentry-component="AdItemCard"]').count() == n:
                break
        texts = await pg.locator('[data-sentry-component="AdItemCard"]').all_inner_texts()
        out = []
        for i, t in enumerate(texts):
            t1 = re.sub(r'\s+', ' ', t)
            no = (re.search(r'등록번호\s*:\s*(\d+)', t1) or [None, ''])[1]
            am = re.search(r'(제주[^ㅣ]*?\d+(?:-\d+)?)\s*ㅣ\s*([^ ]*?)(\d+)호', t1)
            out.append({'i': i, 'no': no, 'addr': am.group(1) if am else '', 'ho': am.group(3) if am else '', 'svc': svc, 'text': t1[:80]})
        return out

    async def _work(self):
        try:
            n = await asyncio.get_running_loop().run_in_executor(None, self.erp.load)
        except Exception as e:
            self.log(f'⚠️ ERP 매물을 못 받았습니다: {e} — [ERP 로그인]을 눌러 주세요')
            return
        since = self.st['since']
        ups, downs = [], []
        for r in self.erp.rows:
            state, no, at = zb_seg(r)
            if not state or not at or at < since:
                continue
            key = f"{r.get('id')}|{state}|{at}"
            if key in self.st['done']:
                continue
            if state == 'on' and not no:
                ups.append((key, r))
            elif state == 'off':
                downs.append((key, r))
        if not ups and not downs:
            self.log(f'· ERP {n}건 확인 — 처리할 직방 요청 없음')
            return
        pg = await self._browser()
        await self._ensure_login(pg)
        dry = bool(self.dry.get())
        for key, r in downs:
            await self._down(pg, key, r, dry)
        for key, r in ups:
            await self._up(pg, key, r, dry)

    def _done(self, key, msg):
        self.st['done'][key] = time.strftime('%Y-%m-%d %H:%M ') + msg
        save_state(self.st)

    async def _down(self, pg, key, r, dry):
        rid = r.get('id')
        for svc in SVCS:
            cards = await self._cards(pg, svc, 'open')
            hit = next((c for c in cards if card_matches(c, r)), None)
            if not hit:
                continue
            self.log(f'⬇️ {rid} 직방 {hit["no"]} 광고 내리기')
            card = pg.locator('[data-sentry-component="AdItemCard"]').nth(hit['i'])
            await card.get_by_text('매물 종료하기', exact=True).click()
            await pg.wait_for_timeout(800)
            if dry:
                self.log('   (시험 모드) [네, 종료합니다] 직전에서 멈췄습니다')
                await pg.get_by_role('button', name='아니요').click()
                return
            await pg.get_by_role('button', name='네, 종료합니다').click()
            await pg.wait_for_timeout(2500)
            self.log(f'   ✅ {rid} 직방 광고 종료')
            self._done(key, f'종료 {hit["no"]}')
            return
        self.log(f'· {rid} 직방에 광고중인 같은 매물이 없습니다(이미 내려감)')
        self._done(key, '광고 없음')

    async def _up(self, pg, key, r, dry):
        rid = r.get('id')
        if any(k in str(r.get('status') or '') for k in STOP):
            self.log(f'🚫 {rid} ERP 상태가 "{r.get("status")}" — 직방에 올리지 않습니다')
            self._done(key, '상태 차단')
            return
        for svc in SVCS:   # 이미 광고중이면 번호만 적는다
            hit = next((c for c in await self._cards(pg, svc, 'open') if card_matches(c, r)), None)
            if hit:
                self.erp.set_zb_no(r, hit['no'])
                self.log(f'· {rid} 이미 직방 광고중({hit["no"]}) — 번호만 ERP 에 적었습니다')
                self._done(key, f'이미 광고중 {hit["no"]}')
                return
        for svc in SVCS:
            hit = next((c for c in await self._cards(pg, svc, 'close') if card_matches(c, r)), None)
            if not hit:
                continue
            self.log(f'⬆️ {rid} 직방 {hit["no"]} 재등록')
            await pg.goto(f'{BASE}/ads/{svc}/ad-item/{hit["no"]}/renew', wait_until='domcontentloaded')
            await pg.wait_for_selector('input[name="sales.deposit"], input[name="title"]', timeout=15000)
            await pg.wait_for_timeout(1500)
            await self._popups(pg)
            dep, rent, area = won_man(r.get('price')), won_man(r.get('rentAmt')), str(r.get('area') or '').strip()
            if dep is not None and await pg.locator('input[name="sales.deposit"]').count():
                await pg.fill('input[name="sales.deposit"]', str(dep))
            if rent is not None and await pg.locator('input[name="sales.rent"]').count():
                await pg.fill('input[name="sales.rent"]', str(rent))
            am = re.search(r'\d+(?:\.\d+)?', area)
            if am and await pg.locator('input[name="sizeM2"]').count() and not (await pg.input_value('input[name="sizeM2"]')).strip():
                await pg.fill('input[name="sizeM2"]', am.group(0))
            agree = pg.locator('input[type=checkbox]').last   # 맨 아래 '광고등록 규정 동의'
            try:
                if not await agree.is_checked():
                    await agree.check(force=True)
            except Exception:
                pass
            if dry:
                self.log('   (시험 모드) 내용을 채우고 [매물 등록 완료] 직전에서 멈췄습니다 — 창에서 확인해 보세요')
                return
            await pg.get_by_role('button', name='매물 등록 완료').click()
            await pg.wait_for_timeout(4000)
            if '/renew' in pg.url:
                err = re.sub(r'\s+', ' ', (await pg.locator('main').inner_text()))
                bad = re.findall(r'[^ ]{0,20}(?:입력해|선택해|필수)[^ ]{0,20}', err)[:3]
                self.log(f'   ❌ {rid} 등록이 안 됐습니다 — {" / ".join(bad) or "화면의 빨간 안내를 확인해 주세요"}')
                self._done(key, '재등록 실패')
                return
            for svc2 in SVCS:
                hit2 = next((c for c in await self._cards(pg, svc2, 'open') if card_matches(c, r)), None)
                if hit2:
                    self.erp.set_zb_no(r, hit2['no'])
                    self.log(f'   ✅ {rid} 직방 광고 등록({hit2["no"]}) — ERP 에 번호를 적었습니다')
                    self._done(key, f'재등록 {hit2["no"]}')
                    return
            self.log(f'   ✅ {rid} 등록 완료(검수 대기일 수 있음)')
            self._done(key, '재등록(검수대기)')
            return
        self.log(f'· {rid} 직방에 이전 광고가 없습니다 — 신규 등록은 다음 단계에서 됩니다(지금은 직접 올려 주세요)')
        self._done(key, '신규 필요')

    def _erp_login_dialog(self):
        d = tk.Toplevel(self.root)
        d.title('ERP 로그인')
        d.grab_set()
        tk.Label(d, text='ERP 계정과 6자리 비밀번호 (블로그·이실장 프로그램과 같은 로그인)', padx=12, pady=8).pack()
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
            self.run_once()
        tk.Button(d, text='로그인', command=go).pack(pady=8)
        pw.bind('<Return>', lambda e: go())

    def _close(self):
        async def shut():
            try:
                if self.ctx:
                    await self.ctx.close()
                if self.pw:
                    await self.pw.stop()
            except Exception:
                pass
        try:
            asyncio.run_coroutine_threadsafe(shut(), self.loop).result(timeout=5)
        except Exception:
            pass
        self.root.destroy()


if __name__ == '__main__':
    root = tk.Tk()
    App(root)
    root.mainloop()
