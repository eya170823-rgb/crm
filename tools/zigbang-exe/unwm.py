# -*- coding: utf-8 -*-
"""브리즈 워터마크 지우기 — ERP src/features/unwm.ts 와 같은 방법(파이썬판, numpy).
사진 높이 82% 지점 가로 띠(흰 줄 2개 + 흰 글자)만 찾아 주변 색으로 메운다. 돌려주는 값 = 메운 픽셀 수(0=워터마크 없음)"""
import numpy as np


def _minmax(a, R, axis, fn):
    out = a.copy()
    for k in range(1, R + 1):
        f = np.roll(a, k, axis=axis)
        b = np.roll(a, -k, axis=axis)
        # 가장자리는 roll 로 넘어온 값을 쓰지 않게 원래 값으로
        if axis == 1:
            f[:, :k] = a[:, :k]
            b[:, -k:] = a[:, -k:]
        else:
            f[:k, :] = a[:k, :]
            b[-k:, :] = a[-k:, :]
        out = fn(out, fn(f, b))
    return out


def remove_breeze_watermark(img):
    """img: HxWx3 uint8 (RGB) — 제자리에서 고친다"""
    h, w = img.shape[:2]
    band = max(28, round(h * 0.072))
    cy = round(h * 0.82)
    top, bot = round(cy - band / 2), round(cy + band / 2)
    lw = max(1, round(h * 0.0022))
    fs = round(band * 0.58)
    pad = max(6, round(band * 0.3))
    y0, y1 = max(0, top - pad), min(h, bot + pad)
    rh = y1 - y0
    if rh < 10 or w < 10:
        return 0
    reg = img[y0:y1].astype(np.float32)
    L = reg.min(axis=2)
    R = max(3, int(np.ceil(fs * 0.16)))
    op = _minmax(_minmax(L, R, 1, np.minimum), R, 0, np.minimum)
    op = _minmax(_minmax(op, R, 1, np.maximum), R, 0, np.maximum)
    mask = np.zeros((rh, w), bool)
    ty0 = max(0, round(cy - fs * 0.75) - y0)
    ty1 = min(rh, round(cy + fs * 0.75) - y0)
    diff = L - op
    sub = (L >= 186) & (diff > np.maximum(9, 0.33 * (255 - op)))
    mask[ty0:ty1] = sub[ty0:ty1]
    if mask.sum() < w * 0.15:
        return 0
    for a in (top, bot - lw):
        r0, r1 = max(0, a - 2 - y0), min(rh, a + lw + 2 - y0)
        if r1 > r0:
            mask[r0:r1] = True
    grow = max(2, round(fs * 0.09))
    gy0, gy1 = max(0, ty0 - 1), min(rh, ty1 + 1)
    for _ in range(grow):
        m = mask[gy0:gy1]
        n = m.copy()
        n[:, 1:] |= m[:, :-1]
        n[:, :-1] |= m[:, 1:]
        n[1:, :] |= m[:-1, :]
        n[:-1, :] |= m[1:, :]
        mask[gy0:gy1] = n
    known = ~mask
    total = int(mask.sum())
    NB = [(-1, 0, 2), (1, 0, 2), (0, -1, 2), (0, 1, 2), (-1, -1, 1), (1, -1, 1), (-1, 1, 1), (1, 1, 1)]
    guard = 0
    while (~known).any() and guard < 200:
        guard += 1
        kp = np.pad(known, 1)
        ring = (~known) & (kp[1:-1, :-2] | kp[1:-1, 2:] | kp[:-2, 1:-1] | kp[2:, 1:-1])
        if not ring.any():
            break
        rp = np.pad(reg, ((1, 1), (1, 1), (0, 0)))
        acc = np.zeros_like(reg)
        sw = np.zeros((rh, w), np.float32)
        for dx, dy, wt in NB:
            kk = kp[1 + dy:1 + dy + rh, 1 + dx:1 + dx + w]
            vv = rp[1 + dy:1 + dy + rh, 1 + dx:1 + dx + w]
            acc += vv * (kk[..., None] * wt)
            sw += kk * wt
        upd = ring & (sw > 0)
        reg[upd] = acc[upd] / sw[upd][:, None]
        known |= upd
    for _ in range(3):
        sm = (np.roll(reg, 1, 1) + np.roll(reg, -1, 1) + np.roll(reg, 1, 0) + np.roll(reg, -1, 0)) / 4
        inner = mask.copy()
        inner[0, :] = inner[-1, :] = False
        inner[:, 0] = inner[:, -1] = False
        reg[inner] = sm[inner]
    img[y0:y1] = np.clip(reg, 0, 255).astype(np.uint8)
    return total
