#!/usr/bin/env python3
# 샘플 캐릭터 스탠딩 일러스트(자리표시용 그림) 만들기 — 대사창 확인용
#   sample-project/assets/portraits/<캐릭터>/{default,smile,worried}.png  (400×800, 투명 배경)
#   python tools/sample/make_portraits.py   (Pillow 필요)
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'sample-project', 'assets', 'portraits')
S = 2                      # 크게 그린 뒤 줄여서 가장자리를 부드럽게
W, H = 400, 800

CHARS = {
    'aria':     dict(hair=(58, 44, 92), hair2=(92, 72, 140), dress=(52, 46, 110), trim=(236, 196, 92), eye=(200, 70, 60), hat=True, long=True),
    'mireille': dict(hair=(120, 150, 70), hair2=(160, 190, 100), dress=(214, 150, 96), trim=(250, 244, 226), eye=(70, 120, 60), hat=False, long=False),
}
SKIN, SKIN2, LINE = (252, 226, 208), (238, 200, 182), (60, 44, 56)


def draw(c, face):
    im = Image.new('RGBA', (W * S, H * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    P = lambda *xy: [v * S for v in xy]
    cx = 200
    # 뒷머리
    if c['long']:
        d.rounded_rectangle(P(cx - 118, 150, cx + 118, 560), radius=110 * S, fill=c['hair'])
    else:
        d.ellipse(P(cx - 112, 110, cx + 112, 330), fill=c['hair'])
    # 몸 (옷)
    d.polygon(P(cx - 70, 330, cx + 70, 330, cx + 150, 800, cx - 150, 800), fill=c['dress'], outline=LINE)
    d.polygon(P(cx - 70, 330, cx + 70, 330, cx + 40, 420, cx - 40, 420), fill=c['trim'])
    d.line(P(cx, 420, cx, 800), fill=LINE, width=2 * S)
    if not c['hat']:   # 앞치마
        d.rounded_rectangle(P(cx - 90, 470, cx + 90, 800), radius=20 * S, fill=c['trim'], outline=LINE)
    # 팔
    for sgn in (-1, 1):
        d.polygon(P(cx + sgn * 70, 335, cx + sgn * 110, 350, cx + sgn * 150, 600, cx + sgn * 118, 612), fill=c['dress'], outline=LINE)
        d.ellipse(P(cx + sgn * 134 - 18, 598, cx + sgn * 134 + 18, 636), fill=SKIN, outline=LINE)
    # 목·얼굴
    d.rectangle(P(cx - 22, 280, cx + 22, 336), fill=SKIN2)
    d.ellipse(P(cx - 92, 120, cx + 92, 318), fill=SKIN, outline=LINE, width=2 * S)
    # 앞머리
    d.chord(P(cx - 100, 96, cx + 100, 260), 180, 360, fill=c['hair'])
    for i in range(-3, 4):
        x = cx + i * 26
        d.polygon(P(x - 20, 170, x + 20, 170, x + 4 * (1 if i % 2 else -1), 222), fill=c['hair'])
    d.arc(P(cx - 80, 110, cx + 40, 200), 200, 300, fill=c['hair2'], width=6 * S)
    # 옆머리
    for sgn in (-1, 1):
        d.polygon(P(cx + sgn * 96, 170, cx + sgn * 78, 170, cx + sgn * 70, 330 if c['long'] else 280, cx + sgn * 104, 340 if c['long'] else 270), fill=c['hair'])
    # 눈
    for sgn in (-1, 1):
        ex = cx + sgn * 38
        if face == 'smile':
            d.arc(P(ex - 20, 222, ex + 20, 252), 200, 340, fill=LINE, width=4 * S)
        else:
            d.ellipse(P(ex - 15, 214, ex + 15, 256), fill=(255, 255, 255), outline=LINE, width=2 * S)
            d.ellipse(P(ex - 11, 222, ex + 11, 254), fill=c['eye'])
            d.ellipse(P(ex - 5, 226, ex + 3, 236), fill=(255, 255, 255))
        if face == 'worried':
            d.line(P(ex - 18, 200 + (6 if sgn < 0 else -2), ex + 18, 200 + (-2 if sgn < 0 else 6)), fill=LINE, width=3 * S)
    # 볼·입
    for sgn in (-1, 1):
        d.ellipse(P(cx + sgn * 58 - 14, 262, cx + sgn * 58 + 14, 276), fill=(248, 176, 170))
    if face == 'smile':
        d.chord(P(cx - 16, 268, cx + 16, 294), 0, 180, fill=(200, 80, 90), outline=LINE)
    elif face == 'worried':
        d.arc(P(cx - 12, 280, cx + 12, 296), 200, 340, fill=LINE, width=2 * S)
    else:
        d.line(P(cx - 9, 284, cx + 9, 284), fill=LINE, width=2 * S)
    # 모자 (마녀)
    if c['hat']:
        d.ellipse(P(cx - 150, 118, cx + 150, 168), fill=(40, 32, 70), outline=LINE, width=2 * S)
        d.polygon(P(cx - 80, 140, cx + 80, 140, cx + 60, 20, cx + 10, 0), fill=(40, 32, 70), outline=LINE)
        d.rectangle(P(cx - 78, 120, cx + 78, 140), fill=c['trim'])
    return im.resize((W, H), Image.LANCZOS)


for cid, c in CHARS.items():
    folder = os.path.join(OUT, cid)
    os.makedirs(folder, exist_ok=True)
    for face in ('default', 'smile', 'worried'):
        draw(c, face).save(os.path.join(folder, face + '.png'))
    print('portraits', cid)
