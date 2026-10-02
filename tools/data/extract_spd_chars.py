#!/usr/bin/env python3
# 게임(원작 Shattered Pixel Dungeon) 캐릭터·영웅 목록 → editor/renderer/js/spd-chars.js
#   사용: python tools/data/extract_spd_chars.py [원작 SPD 저장소]
#   actors/mobs · actors/mobs/npcs 의 몬스터·NPC·보스: 이름·설명(한국어), 능력치(HP·명중·회피·피해·방어·경험치), 스프라이트(시트·프레임 크기·애니메이션)
#   새 프로젝트를 만들 때 이것으로 원작과 같은 캐릭터·영웅을 채웁니다 (editor/renderer/js/store.js createNew)
import re, os, json, sys
_GH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'game')   # pd-maker/game — 기준 저장소: game/shattered-pixel-dungeon-master
V = (sys.argv[1] if len(sys.argv) > 1 else os.path.join(_GH, 'shattered-pixel-dungeon-master')) + '/core/src/main'
J = V + '/java/com/shatteredpixel/shatteredpixeldungeon'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'editor', 'renderer', 'js', 'spd-chars.js')

def props(p):
    d = {}
    for line in open(p, encoding='utf-8'):
        if '=' in line and not line.startswith('#'):
            k, v = line.rstrip('\n').split('=', 1); d[k.strip()] = v
    return d
ko = props(V + '/assets/messages/actors/actors_ko.properties'); en = props(V + '/assets/messages/actors/actors.properties')
msg = lambda k: ko.get(k) or en.get(k) or ''

# Assets.Sprites 상수 → 파일
assets = open(J + '/Assets.java', encoding='utf-8').read()
sprites_block = assets[assets.index('class Sprites'):]
SPR = dict(re.findall(r'public static final String\s+(\w+)\s*=\s*"([^"]+)"', sprites_block))

def read(p):
    try: return open(p, encoding='utf-8').read()
    except FileNotFoundError: return ''

def anim_of(src, name, c=0):
    m = re.search(name + r'\s*=\s*new\s+(?:MovieClip\.)?Animation\(\s*([^,]+?)\s*,\s*(true|false)\s*\)\s*;\s*' + name + r'\.frames\(\s*\w+\s*,([^;]*)\);', src)
    if not m: return None
    fps = re.findall(r'\d+', m.group(1)); fps = int(fps[-1]) if fps else 10   # "enraged ? 15 : 10" → 10
    frames = []
    for tok in m.group(3).split(','):
        tok = tok.strip()
        if not tok: continue
        n = re.findall(r'\d+', tok)
        if not n: continue
        frames.append(int(n[0]) + (c if re.search(r'\bc\b', tok) else 0))
    return {'frames': frames, 'fps': fps, 'loop': m.group(2) == 'true'}

def sprite_of(ref):
    """ref: 'RatSprite' 또는 'ShamanSprite.Red' (texOffset 을 쓰는 안쪽 클래스)"""
    cls, _, inner = ref.partition('.')
    src = read(J + '/sprites/' + cls + '.java')
    if not src: return None
    c = 0
    if inner:
        im = re.search(r'class\s+' + inner + r'\b[^{]*\{(.*?)\n\t\}', src, re.S)
        o = re.search(r'texOffset\(\)\s*\{\s*return\s+(\d+)', im.group(1)) if im else None
        c = int(o.group(1)) if o else 0
    else:
        cm = re.search(r'int\s+c\s*=\s*(?:[^;?]*\?\s*\d+\s*:\s*)?(\d+)\s*;', src)
        if cm: c = int(cm.group(1))
    tex = re.search(r'texture\(\s*Assets\.Sprites\.(\w+)\s*\)', src)
    film = re.search(r'new\s+TextureFilm\(\s*texture\s*,\s*(\d+)\s*,\s*(\d+)\s*\)', src)
    if not tex or not film or tex.group(1) not in SPR: return None
    sp = {'sheet': 'game:' + SPR[tex.group(1)], 'frame': [int(film.group(1)), int(film.group(2))], 'scale': 0, 'anims': {}}
    for a in ('idle', 'run', 'attack', 'zap', 'operate', 'die'):
        x = anim_of(src, a, c)
        if x: sp['anims'][a] = x
    if not sp['anims'].get('idle'): return None
    return sp

def num(src, pat, d=None):
    m = re.search(pat, src); return int(m.group(1)) if m else d

def method_body(src, name):
    m = re.search(r'(?:public|private|protected)\s+(?:static\s+)?\w+\s+' + name + r'\s*\([^)]*\)\s*\{', src)
    if not m: return ''
    i = m.end(); depth = 1
    while i < len(src) and depth:
        depth += {'{': 1, '}': -1}.get(src[i], 0); i += 1
    return src[m.end():i]

BOSS = {'Goo', 'Tengu', 'DM300', 'DwarfKing', 'YogDzewa'}
SKIP = {'Mob', 'MobSpawner', 'NPC', 'DirectableAlly', 'MirrorImage', 'PrismaticImage', 'DelayedRockFall', 'YogFist', 'Pylon', 'CrystalSpire', 'FungalCore', 'RotHeart', 'DemonSpawner', 'TormentedSpirit', 'PhantomPiranha', 'NewbornFireElemental'}
REGION = {'Rat': 1, 'Albino': 1, 'Snake': 1, 'Gnoll': 1, 'Crab': 1, 'Slime': 1, 'CausticSlime': 1, 'Goo': 1, 'FetidRat': 1, 'GnollTrickster': 1, 'GreatCrab': 1, 'Swarm': 1,
          'Skeleton': 2, 'Thief': 2, 'Bandit': 2, 'DM100': 2, 'Guard': 2, 'Necromancer': 2, 'SpectralNecromancer': 2, 'Tengu': 2, 'Bat': 3, 'Brute': 3, 'ArmoredBrute': 3, 'Shaman': 3,
          'Spinner': 3, 'DM200': 3, 'DM201': 3, 'DM300': 3, 'GnollGuard': 3, 'GnollSapper': 3, 'CrystalGuardian': 3, 'CrystalWisp': 3, 'FungalSentry': 3, 'FungalSpinner': 3,
          'Ghoul': 4, 'Elemental': 4, 'Swarm': 3, 'Statue': 0, 'ArmoredStatue': 0, 'Mimic': 0, 'GoldenMimic': 0, 'CrystalMimic': 0, 'EbonyMimic': 0, 'Wraith': 0, 'Bee': 0, 'GnollGeomancer': 3, 'Warlock': 4, 'Monk': 4, 'Senior': 4, 'Golem': 4, 'DwarfKing': 4, 'Succubus': 5, 'Eye': 5, 'Scorpio': 5, 'Acidic': 5, 'RipperDemon': 5, 'YogDzewa': 5,
          'Piranha': 0, 'HermitCrab': 1, 'GnollExile': 3, 'RotLasher': 0}
chars = []
def add(path, cls, kind, src=None, outer=None):
    whole = read(path)
    if src is None:
        src = whole
        # 안쪽 클래스 (Shaman.RedShaman · Elemental.FireElemental …) 는 따로
        for im in re.finditer(r'public\s+static\s+class\s+(\w+)\s+extends\s+' + cls + r'\b[^{]*\{', src):
            if im.group(1) in SKIP: continue
            add(path, im.group(1), kind, src[im.start():], cls)
        if re.search(r'public\s+abstract\s+class\s+' + cls, src): return
        src = re.sub(r'public\s+static\s+class\s+\w+\s+extends\s+' + cls + r'\b.*', '', src, flags=re.S)
    spm = re.search(r'spriteClass\s*=\s*(\w+(?:\.\w+)?)\.class', src)
    sp = sprite_of(spm.group(1)) if spm else None
    if not sp: return
    base = ('actors.mobs.npcs.' if kind == 'npc' else 'actors.mobs.')
    key = base + ((outer.lower() + '$') if outer else '') + cls.lower()
    COLOR = {'RedShaman': '빨강', 'BlueShaman': '파랑', 'PurpleShaman': '보라'}
    name = msg(key + '.name') or (msg(base + outer.lower() + '.name') + ' (' + COLOR.get(cls, cls) + ')' if outer else '') or cls
    if outer: src = whole + src          # 능력치는 바깥 클래스에서
    st = {}
    hm = re.search(r'HP\s*=\s*HT\s*=\s*([^;]+);', src)   # "도전 ? 120 : 100" → 뒤의 기본값
    hp = int(re.findall(r'\d+', hm.group(1))[-1]) if hm and re.findall(r'\d+', hm.group(1)) else None
    if hp: st['hp'] = hp
    ev = num(src, r'defenseSkill\s*=\s*(\d+)')
    if ev is not None: st['evasion'] = ev
    dmg = re.search(r'NormalIntRange\(\s*(\d+)\s*,\s*(\d+)\s*\)', method_body(src, 'damageRoll'))
    if dmg: st['attackMin'], st['attackMax'] = int(dmg.group(1)), int(dmg.group(2))
    acc = num(method_body(src, 'attackSkill'), r'return\s+(\d+)\s*;')
    if acc is not None: st['accuracy'] = acc
    dr = re.search(r'NormalIntRange\(\s*0\s*,\s*(\d+)\s*\)', method_body(src, 'drRoll'))
    st['defense'] = int(dr.group(1)) if dr else 0
    spd = re.search(r'baseSpeed\s*=\s*([\d.]+)f?', src)
    st['speed'] = float(spd.group(1)) if spd else 1
    desc = msg(key + '.desc') or (msg(base + outer.lower() + '.desc') if outer else '')
    e = {'cls': ('npcs.' if kind == 'npc' else '') + ((outer + '$') if outer else '') + cls, 'kind': kind, 'name': name, 'desc': desc[:600], 'sprite': sp, 'stats': st}
    exp = num(src, r'EXP\s*=\s*(\d+)')
    if exp is not None: e['exp'] = exp
    r = REGION.get(cls, REGION.get(outer or ''))
    if r is not None: e['region'] = r
    chars.append(e)

for f in sorted(os.listdir(J + '/actors/mobs')):
    if not f.endswith('.java'): continue
    c = f[:-5]
    if c in SKIP: continue
    add(J + '/actors/mobs/' + f, c, 'boss' if c in BOSS else 'mob')
for f in sorted(os.listdir(J + '/actors/mobs/npcs')):
    if not f.endswith('.java'): continue
    c = f[:-5]
    if c in SKIP: continue
    add(J + '/actors/mobs/npcs/' + f, c, 'npc')

# 시작 아이템: HeroClass.java 의 initHero(공통) + init<직업>() 를 읽어서 (게임 저장소마다 다를 수 있음 — 추가 직업 포함)
#   equip: 장착 · quickslot: 퀵슬롯 · affix: 갑옷에 붙임(부러진 인장) · imbue: 마법사 지팡이에 넣은 마법봉 · count: 개수
ITEM_PATH = {}
for r, _, fs in os.walk(J + '/items'):
    for f in fs:
        if f.endswith('.java'):
            rel = os.path.relpath(os.path.join(r, f), J + '/items')[:-5].replace(os.sep, '.')
            ITEM_PATH.setdefault(f[:-5], rel)
HC = read(J + '/actors/hero/HeroClass.java')
def start_items(body):
    """init 메서드 본문 → (아이템 목록, 감정된 아이템)"""
    items, known, var, slot = [], [], {}, {}
    def mk(cls, arg=None):
        e = {'item': 'spd:' + ITEM_PATH[cls]}
        q = re.search(r'\bquantity\s*=\s*(\d+)', read(J + '/items/' + ITEM_PATH[cls].replace('.', '/') + '.java'))
        if q and int(q.group(1)) > 1: e['count'] = int(q.group(1))   # 기본 개수 (투척 무기 등)
        elif ITEM_PATH[cls].startswith('weapon.missiles.') and '.darts.' not in ITEM_PATH[cls]: e['count'] = 3   # MissileWeapon.defaultQuantity()
        if arg and ITEM_PATH.get(arg, '').startswith('wands.'): e['imbue'] = ITEM_PATH[arg]
        items.append(e); return e
    def use(v):   # 변수에 담긴 아이템을 목록에 올림 (처음 쓰일 때)
        x = var.get(v)
        if x is None: return None
        if x['e'] is None: x['e'] = mk(x['cls'], x['arg'])
        return x['e']
    NEW = r'new\s+(\w+)\s*\(\s*(?:new\s+(\w+)\s*\(\s*\))?'
    for st in re.sub(r'//[^\n]*', '', body).split(';'):
        st = st.strip().lstrip('{}').strip()
        if st.startswith('if'):   # if (조건) 문장 → 문장만
            d, i = 0, st.find('(')
            while i < len(st):
                d += {'(': 1, ')': -1}.get(st[i], 0); i += 1
                if d == 0: break
            st = st[i:].strip().lstrip('{').strip()
        if not st: continue
        m = re.search(r'hero\.belongings\.(\w+)\s*=\s*(?:\(\w+\)\s*)?(?:' + NEW + r'|(\w+))', st)
        if m:
            e = mk(m.group(2), m.group(3)) if m.group(2) in ITEM_PATH else use(m.group(4))
            if e is not None: e['equip'] = True; slot[m.group(1)] = e
            continue
        m = re.search(r'affixSeal\s*\(\s*new\s+(\w+)', st)
        if m and m.group(1) in ITEM_PATH: mk(m.group(1))['affix'] = True; continue
        m = re.search(r'quickslot\.setSlot\s*\(\s*\d+\s*,\s*(?:hero\.belongings\.(\w+)|(\w+))\s*\)', st)
        if m:
            e = slot.get(m.group(1)) if m.group(1) else use(m.group(2))
            if e is not None: e['quickslot'] = True
            continue
        m = re.search(r'(\w+)\s*=\s*' + NEW, st)
        if m and m.group(2) in ITEM_PATH:
            var[m.group(1)] = {'cls': m.group(2), 'arg': m.group(3), 'e': None}
            if '.collect' in st: use(m.group(1))
            continue
        m = re.match(r'(\w+)\s*\.', st)
        if m and m.group(1) in var:
            q = re.search(r'quantity\s*\(\s*(\d+)', st)
            if '.collect' in st or q:
                e = use(m.group(1))
                if q: e['count'] = int(q.group(1))
            continue
        m = re.match(NEW + r'\)\s*\.(\w+)', st)
        if m and m.group(1) in ITEM_PATH:
            if '.collect' in st: mk(m.group(1), m.group(2))
            elif m.group(3) == 'identify': known.append('spd:' + ITEM_PATH[m.group(1)])
    return items, known
common_items, common_known = start_items(method_body(HC, 'initHero').split('switch (this)')[0])
# 새 프로젝트에 넣지 않는 직업 (저장소에 추가된 실험 직업 등 — 원작 직업만)
SKIP_CLASSES = {'ARIA'}
classes = [c for c in re.findall(r'^\s+([A-Z][A-Z_]+)\s*\(\s*HeroSubClass', HC, re.M) if c not in SKIP_CLASSES]
FALLBACK_NAME = {}
heroes = []
for c in classes:
    k = 'actors.hero.heroclass.' + c.lower()
    body = method_body(HC, 'init' + c.title().replace('_', ''))
    own, known = start_items(body or '')
    armor = [x for x in common_items if x.get('equip')]
    rest = [x for x in common_items if not x.get('equip')]
    heroes.append({'cls': c, 'name': msg(k) or FALLBACK_NAME.get(c, c.title()), 'desc': msg(k + '_desc_short').replace('_', ''), 'descLong': msg(k + '_desc').replace('_', ''),
                   'items': own[:1] + armor + own[1:] + rest,
                   'known': common_known + known})
for hh in heroes: print(hh['cls'], hh['name'], json.dumps(hh['items'], ensure_ascii=False), hh['known'])

js = ('// 자동 생성 (tools/data/extract_spd_chars.py): 원작 Shattered Pixel Dungeon 의 캐릭터 · 영웅\n'
      '// cls: 게임 클래스 (actors.mobs.<cls>), kind: mob·boss·npc, sprite: 게임 시트·프레임·애니메이션, stats: 능력치, region: 1 하수도 ~ 5 전당\n'
      'PDM.SPD_CHARS = ' + json.dumps(chars, ensure_ascii=False, separators=(',', ':')) + ';\n'
      'PDM.SPD_HEROES = ' + json.dumps(heroes, ensure_ascii=False, separators=(',', ':')) + ';\n')
open(OUT, 'w', encoding='utf-8').write(js)
print(len(chars), 'chars', len(heroes), 'heroes →', OUT)
for k in ('mob', 'boss', 'npc'): print(k, [c['cls'] for c in chars if c['kind'] == k])
