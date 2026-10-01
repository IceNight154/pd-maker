# 샘플 프로젝트 생성기 (위츨링 픽셀 타워). 다시 만들 때: python tools/make_sample.py
import json, os
ROOT = os.path.join(os.path.dirname(__file__), '..', 'sample-project')
def w(rel, obj):
    p = os.path.join(ROOT, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8') as f: json.dump(obj, f, ensure_ascii=False, indent=2); f.write('\n')
V = 1
w('project.json', {"format": "pdmaker-project", "version": V, "name": "위츨링 픽셀 타워 (샘플)", "author": "",
   "gameRepo": "../../git-hub/shattered-pixel-dungeon-mod-2", "legacyMaker": "../../pixel-dungeon-maker",
   "startHero": "aria", "heartButton": True, "direction": "up", "plugins": ["screen-fx"], "settings": {"tileSize": 16, "language": "ko"}})
w('terms.json', {"format": "pdmaker-terms", "version": V, "terms": {}})
# ---- 1층: 직접 그린 시험장 입구 ----
MAP = [
 "#####################",
 "#.......#...........#",
 "#..<....D.....~~~...#",
 "#.......#.....~~~...#",
 "####D####...........#",
 "#\"\"\"....#...S...S...#",
 "#\"\"\"....#...........#",
 "#.......D.......>...#",
 "#.......#...........#",
 "#####################"]
LEG = {'#': 4, '.': 1, '<': 7, '>': 8, 'D': 5, '~': 29, '"': 2, 'S': 25}
W, H = len(MAP[0]), len(MAP)
terrain = [LEG[ch] for row in MAP for ch in row]
# ---- 방 템플릿 (자동 생성 층에 끼워 넣는 방) ----
def grid(rows, leg):
    return [leg[c] for r in rows for c in r]
LEG2 = dict(LEG); LEG2.update({'P': 11, 'B': 27, '_': 14})
GH = ["####D####",
      "#\"\"\"\"\"\"\"#",
      "#\"S\"_\"S\"#",
      "D\"\"_P_\"\"D",
      "#\"S\"_\"S\"#",
      "#\"\"\"\"\"\"\"#",
      "####D####"]
w('rooms/herb_greenhouse.json', {"format": "pdmaker-room", "version": V, "id": "herb_greenhouse", "name": "약초 온실",
   "kind": "standard", "keepClean": True, "size": {"w": 9, "h": 7}, "layers": {"terrain": grid(GH, LEG2)},
   "objects": [{"id": "r1", "type": "item", "ref": "herb_moonleaf", "at": {"x": 4, "y": 3}, "cond": "", "count": 1}],
   "note": "테두리의 문(D) 자리에만 문이 생깁니다. 1장 모든 층에 하나씩."})
LIB = ["#######",
       "#B.B.B#",
       "#.....#",
       "#B._.B#",
       "#.....#",
       "###D###"]
w('rooms/hidden_library.json', {"format": "pdmaker-room", "version": V, "id": "hidden_library", "name": "루미에르의 서재",
   "kind": "special", "keepClean": True, "size": {"w": 7, "h": 6}, "layers": {"terrain": grid(LIB, LEG2)},
   "objects": [{"id": "r2", "type": "npc", "ref": "lumiere", "at": {"x": 3, "y": 3}, "cond": "", "count": 1}],
   "note": "특수 방(입구 하나). 4층에만."})

# ================= 맵 그래프 (maps/world.json + maps/nodes/<id>.json) =================
def node(id, mode="procedural", **kw):
    f = {"format": "pdmaker-node", "version": V, "id": id, "mode": mode, "name": "", "label": "", "depth": 0, "boss": False,
         "entranceTo": "", "theme": "", "size": {"w": 32, "h": 32},
         "procedural": {"sizeScale": 1, "standardRooms": [4, 6], "specialRooms": 1, "mobCap": 0, "feeling": "any"},
         "layers": {"terrain": []}, "objects": [], "onEnter": "", "note": ""}
    f.update(kw); w(f'maps/nodes/{id}.json', f); return f
ROOM = ["#########", "#.......#", "#.S...S.#", "#.......#", "#...\"...#", "#.......#", "#.S...S.#", "#.......#", "####D####"]
REST = ["###########", "#....<....#", "#.........#", "#..S...S..#", "#.........#", "#....>....#", "###########"]
ARC = ["#########", "#B.B.B.B#", "#.......#", "#...<...#", "#########"]
TOWN = ["###############", "#.....S...S...#", "#.\"\"\"......B..#", "#.\"\"\".........#", "#......_......#", "#.............#", "#......>......#", "###############"]

# --- 던전 밖: 마녀의 마을
node("town", "handmade", name="마녀의 마을", theme="CITY", size={"w": 15, "h": 8}, layers={"terrain": grid(TOWN, LEG2)},
  objects=[{"id": "t1", "type": "npc", "ref": "lumiere", "at": {"x": 10, "y": 5}, "cond": "", "count": 1},
           {"id": "t2", "type": "event", "ref": "ev_ember_seal", "at": {"x": 7, "y": 4}, "cond": "", "count": 1, "note": "봉인석"}],
  note="탑 1층 입구로 나오면 도착하는 바깥 마을. 출구(>)로 다시 탑 1층.")
# --- 1구역: 첫 번째 탑
node("f1", "handmade", name="시험장 입구", depth=1, size={"w": W, "h": H}, layers={"terrain": terrain}, onEnter="ev_opening", entranceTo="town",
  objects=[
    {"id": "o_board", "type": "event", "ref": "ev_notice_board", "at": {"x": 2, "y": 1}, "cond": "", "count": 1, "note": "게시판"},
    {"id": "o_mireille", "type": "npc", "ref": "mireille", "at": {"x": 12, "y": 7}, "cond": "!switch.mireille_joined", "count": 1, "event": "ev_talk_mireille"},
    {"id": "o_herb", "type": "item", "ref": "herb_moonleaf", "at": {"x": 2, "y": 6}, "cond": "", "count": 2},
    {"id": "o_rat", "type": "mob", "ref": "moss_rat", "at": {"x": 18, "y": 2}, "cond": "", "count": 1}],
  note="오프닝 → 게시판 → 미레유와 만남. 입구 계단은 마을로.")
node("f2", depth=2)
node("rest_2", "handmade", name="계단참 휴게실", label="계단참", size={"w": 11, "h": 7}, layers={"terrain": grid(REST, LEG2)},
  objects=[{"id": "x1", "type": "npc", "ref": "seraphine", "at": {"x": 2, "y": 3}, "cond": "", "count": 1}], note="2층과 3층 사이의 쉼터")
node("f3", "hybrid", name="세라핀의 방", depth=3, size={"w": 9, "h": 9}, layers={"terrain": [LEG[c] for r in ROOM for c in r]}, hybrid={"placement": "special"},
  objects=[{"id": "o_sera", "type": "npc", "ref": "seraphine", "at": {"x": 4, "y": 3}, "cond": "", "count": 1}])
node("archive", "handmade", bgm="none", name="비밀 서고", label="비밀 서고", theme="PRISON", size={"w": 9, "h": 5}, layers={"terrain": grid(ARC, LEG2)},
  objects=[{"id": "x2", "type": "item", "ref": "bone_charm", "at": {"x": 2, "y": 2}, "cond": "", "count": 1}], note="3층의 샛길 계단으로 들어가는 방")
node("f4a", depth=4, procedural={"sizeScale": 1, "standardRooms": [4, 6], "specialRooms": 1, "mobCap": 0, "feeling": "any",
  "rooms": [{"room": "hidden_library", "count": 1, "chance": 100, "cond": ""}]})
node("f5a", depth=5, boss=True)
node("f4b", depth=4, name="잿불 샛길", theme="CITY", note="마을의 봉인석을 풀면 3층에 갈림길 계단이 생김")
node("f5b", depth=5, boss=True, theme="CITY")
# --- 2-1구역: 봉인된 감옥 (여기 3층에서 아이작식 무작위 갈림길)
for i in range(1, 6): node(f"p{i}", boss=(i == 5))
node("p4w", name="물에 잠긴 층", theme="CAVES", procedural={"sizeScale": 1, "standardRooms": [4, 6], "specialRooms": 1, "mobCap": 0, "feeling": "WATER"})
# --- 2-2구역: 잿불 회랑
for i in range(1, 6): node(f"c{i}", boss=(i == 5), name="잿불 회랑" if i == 1 else "", onEnter="ev_ember_hall" if i == 1 else "")

X = lambda col: 60 + col * 210
nodes = [
  {"id": "town", "group": "outside", "x": X(0), "y": 60},
  {"id": "f1", "group": "g1", "x": X(0), "y": 330}, {"id": "f2", "group": "g1", "x": X(1), "y": 330}, {"id": "rest_2", "group": "g1", "x": X(2), "y": 330},
  {"id": "f3", "group": "g1", "x": X(3), "y": 330}, {"id": "f4a", "group": "g1", "x": X(4), "y": 330}, {"id": "f5a", "group": "g1", "x": X(5), "y": 330},
  {"id": "archive", "group": "g1", "x": X(3), "y": 520}, {"id": "f4b", "group": "g1", "x": X(4), "y": 520}, {"id": "f5b", "group": "g1", "x": X(5), "y": 520},
] + [{"id": f"p{i}", "group": "g21", "x": X(i - 1), "y": 810} for i in range(1, 6)] + [{"id": "p4w", "group": "g21", "x": X(3), "y": 1000}] \
  + [{"id": f"c{i}", "group": "g22", "x": X(i - 1), "y": 1300} for i in range(1, 6)]
E = []
def edge(a, b, **kw):
    e = {"id": f"e{len(E) + 1}", "from": a, "to": b, "kind": "main", "cond": "", "weight": 100, "label": ""}; e.update(kw); E.append(e)
edge("town", "f1")
for a, b in [("f1", "f2"), ("f2", "rest_2"), ("rest_2", "f3"), ("f3", "f4a"), ("f4a", "f5a"), ("f4b", "f5b")]: edge(a, b)
edge("f3", "archive", kind="stair", place="random")
edge("f3", "f4b", kind="stair", cond="switch.ember_seal", place="exit", message="잿불 봉인이 풀리며 붉은 계단이 드러났다…", label="잿불 갈림길")
edge("f5a", "p1"); edge("f5b", "c1")
for i in range(1, 3): edge(f"p{i}", f"p{i + 1}")
edge("p3", "p4", weight=70); edge("p3", "p4w", weight=30, label="30%: 물에 잠긴 층")
edge("p4", "p5"); edge("p4w", "p5")
for i in range(1, 5): edge(f"c{i}", f"c{i + 1}")
w('maps/world.json', {"format": "pdmaker-world", "version": V, "start": "f1",
  "groups": [
    {"id": "outside", "name": "던전 밖", "theme": "CITY", "direction": "", "color": "#e58cff", "rooms": [], "safe": True, "note": "마을", "bgm": "sound:town_theme"},
    {"id": "g1", "name": "1구역 · 첫 번째 탑", "theme": "SEWER", "direction": "", "color": "#5fd6b4", "rooms": [{"room": "herb_greenhouse", "count": 1, "chance": 100, "cond": ""}], "safe": False, "note": ""},
    {"id": "g21", "name": "2-1구역 · 봉인된 감옥", "theme": "PRISON", "direction": "", "color": "#a58bff", "rooms": [], "safe": False, "note": "3층 출구는 70% 본래 길, 30% 물에 잠긴 층"},
    {"id": "g22", "name": "2-2구역 · 잿불 회랑", "theme": "CITY", "direction": "", "color": "#ffb35c", "rooms": [], "safe": False, "note": "1구역 3층의 잿불 갈림길로만 올 수 있음", "bgm": "game:music/caves_tense.ogg"}],
  "nodes": nodes, "edges": E, "customThemes": []})

# ---- 캐릭터 ----
def char(id, kind, name, **kw):
    c = {"format": "pdmaker-character", "version": V, "id": id, "kind": kind, "name": name, "title": "", "desc": "",
         "sprite": {"sheet": "", "frame": [12, 15], "anims": {}}, "portrait": {"default": "", "expressions": []},
         "stats": {"hp": 20, "attackMin": 1, "attackMax": 4, "defense": 0, "accuracy": 10, "evasion": 5, "speed": 1},
         "ai": {"mode": "stand", "path": [], "wait": 3},
         "heart": {"enabled": False, "traits": [], "likes": [], "dislikes": [], "initial": {"favor": 0, "trust": 0}},
         "behaviors": {}, "dialogue": {}}
    c.update(kw); return c
L = lambda text, when="", face="": {"when": when, "face": face, "text": text}
# 아리아 시트(mod-2 sprites/aria.png 와 같은 파일): 48x60 프레임 = 12x15 의 4배, 행 = 갑옷 단계
ARIA_SPRITE = {"sheet": "assets/sprites/aria.png", "frame": [48, 60], "scale": 0.25, "anims": {
    "idle": {"frames": [0, 0, 0, 1, 0, 0, 1, 1], "fps": 1, "loop": True}, "run": {"frames": [2, 3, 4, 5, 6, 7], "fps": 20, "loop": True},
    "attack": {"frames": [20, 21, 22, 23], "fps": 15, "loop": False}, "zap": {"frames": [24, 25, 26, 27], "fps": 15, "loop": False},
    "operate": {"frames": [28, 29, 28, 29], "fps": 8, "loop": False}, "die": {"frames": [8, 9, 10, 11], "fps": 20, "loop": False}}}
w('characters/aria.json', char("aria", "npc", "아리아", title="원소의 서기",
  desc="원리주의적인 공부벌레. 불·물·바람·땅을 모두 다루는 길을 택한 견습 마녀. (플레이어블 설정은 heroes/aria.json)",
  sprite=ARIA_SPRITE,
  dialogue={"floor_enter": [L("새로운 층… 공기의 원소 배열부터 확인하자.")], "boss_defeated": [L("이론대로야. 코어를 회수하자.")]}))
w('heroes/aria.json', {"format": "pdmaker-hero", "version": V, "id": "aria", "name": "아리아", "title": "원소의 서기",
  "desc": "원리주의적인 공부벌레. 불·물·바람·땅을 모두 다루는 길을 택한 견습 마녀.",
  "enabled": True, "baseClass": "ARIA", "character": "aria",
  "sprite": ARIA_SPRITE,
  "stats": {"hp": 18, "hpPerLevel": 4, "str": 10, "attackSkill": 10, "defenseSkill": 5, "accPerLvl": 1, "evaPerLvl": 1,
            "unarmedMin": 1, "unarmedMax": 3, "speed": 1.0, "viewDistance": 8},
  "knownItems": ["spd:PotionOfHealing"],
  "startGold": 30,
  "inventory": {"clearDefault": False, "items": [
     {"item": "ration_witch", "count": 1, "level": 0, "equip": False, "quickslot": False, "identify": True},
     {"item": "spd:PotionOfHealing", "count": 1, "level": 0, "equip": False, "quickslot": True, "identify": True},
     {"item": "ember_staff", "count": 1, "level": 0, "equip": True, "quickslot": False, "identify": True},
     {"item": "moss_cloak", "count": 1, "level": 0, "equip": False, "quickslot": False, "identify": True},
     {"item": "seed_knife", "count": 3, "level": 0, "equip": False, "quickslot": True, "identify": True},
     {"item": "wind_bell", "count": 1, "level": 0, "equip": False, "quickslot": True, "identify": True}]},
  "skillButton": True,
  "signature": {"enabled": False, "name": "원소의 서", "desc": "아리아가 직접 필사한 원소 마법서. 네 원소의 주문이 적혀 있다.",
                "image": 246, "charges": 3, "rechargeTurns": 35},
  "skills": [
     {"id": "fire_bolt", "icon": 19, "name": "불꽃 화살", "desc": "적 하나에게 불꽃을 날려 피해를 주고 불태운다.", "unlockLevel": 1, "cost": 1, "cooldown": 0,
      "target": "enemy", "range": 6, "projectile": True, "visual": "fire", "time": 1, "shout": "",
      "sound": "game:sounds/zap.mp3", "hitSound": "game:sounds/burning.mp3",
      "effects": [{"type": "damage", "on": "target", "min": 3, "max": 7, "perLevel": 1}, {"type": "buff", "on": "target", "buff": "Burning", "turns": 3}]},
     {"id": "storm_lance", "icon": 51, "name": "폭풍의 창", "desc": "번개 창으로 대상과 그 주변 1칸의 적을 꿰뚫는다. 절반 확률로 마비시킨다.", "unlockLevel": 1, "cost": 2, "cooldown": 12,
      "target": "enemy", "range": 6, "projectile": True, "visual": "light", "time": 1, "shout": "꿰뚫어라!",
      "sound": "game:sounds/lightning.mp3", "requiresTalent": "storm_study", "requiresPoints": 1,
      "effects": [{"type": "damage", "on": "target", "radius": 1, "min": 4, "max": 9, "perLevel": 1}, {"type": "buff", "on": "target", "buff": "Paralysis", "turns": 2, "chance": 50}]},
     {"id": "frost_ring", "icon": 25, "name": "서리 고리", "desc": "대상 주변 2칸의 적을 얼린다.", "unlockLevel": 3, "cost": 2, "cooldown": 10,
      "target": "cell", "range": 5, "projectile": True, "visual": "frost", "time": 1, "shout": "",
      "effects": [{"type": "damage", "on": "area", "radius": 2, "min": 2, "max": 4}, {"type": "buff", "on": "area", "radius": 2, "buff": "Chill", "turns": 4}]},
     {"id": "wind_step", "icon": 21, "name": "바람 걸음", "desc": "보이는 칸으로 순간 이동한다.", "unlockLevel": 2, "cost": 1, "cooldown": 15,
      "target": "cell", "range": 5, "projectile": False, "visual": "none", "time": 1, "shout": "",
      "effects": [{"type": "blink"}]},
     {"id": "earth_ward", "icon": 42, "name": "대지의 방벽", "desc": "자신에게 보호막을 두른다.", "unlockLevel": 1, "cost": 1, "cooldown": 20,
      "target": "self", "range": 0, "projectile": False, "visual": "earth", "time": 1, "shout": "",
      "effects": [{"type": "shield", "on": "self", "amount": 6}]},
     {"id": "arcane_spark", "icon": 20, "name": "비전 불꽃", "desc": "코드로 만든 스킬: 레벨에 비례한 피해 + 가끔 마비.", "unlockLevel": 1, "cost": 1, "cooldown": 5,
      "target": "enemy", "range": 5, "projectile": True, "visual": "magic", "time": 1, "shout": "",
      "effects": [{"type": "code", "code": "if (target != null) {\n    target.damage(Random.NormalIntRange(2, 4) + hero.lvl / 2, hero);\n    if (target.isAlive() && Random.Int(4) == 0) Buff.affect(target, Paralysis.class, 2f);\n}"}]}],
  "code": {
    "imports": "",
    "members": "// 이 영웅만의 변수·함수를 여기에 (저장은 Bundle 로 직접 해야 함)\nprivate int kills = 0;",
    "onLevelUp": "GLog.p(\"원소의 이해가 깊어졌다! (Lv %d)\", lvl);",
    "onTalentUp": "if (talent.equals(\"storm_study\") && points == 1) GLog.h(\"폭풍의 창을 익혔다!\");",
    "attackProc": "// 5번에 1번 적을 불태움\nif (Random.Int(5) == 0) Buff.affect(enemy, Burning.class).reignite(enemy);",
    "onKill": "kills++;\n// 3마리마다 체력 1 회복\nif (kills % 3 == 0 && hero.HP < hero.HT) {\n    hero.HP++;\n    hero.sprite.showStatus(CharSprite.POSITIVE, \"+1\");\n}"
  },
  "talentTiers": [{"name": "견습", "unlockLevel": 2, "points": 5}, {"name": "숙련", "unlockLevel": 7, "points": 6},
                  {"name": "대가", "unlockLevel": 13, "points": 8}, {"name": "원소의 서기", "unlockLevel": 21, "points": 10}],
  "talents": [
     {"id": "ember_focus", "icon": 50, "name": "불씨 집중", "tier": 1, "maxPoints": 2, "desc": "불꽃 화살의 피해가 늘어난다.",
      "pointText": ["불꽃 화살 피해 +1", "불꽃 화살 피해 +2, 불태우는 시간 +2턴"], "requires": "", "requiresPoints": 1,
      "effects": [{"type": "skill", "skill": "fire_bolt", "field": "damage", "perPoint": 1}, {"type": "skill", "skill": "fire_bolt", "field": "turns", "perPoint": 1}]},
     {"id": "sturdy_study", "icon": 0, "name": "밤샘 공부", "tier": 1, "maxPoints": 2, "desc": "체력이 늘어난다.",
      "pointText": ["최대 체력 +4", "최대 체력 +8"], "requires": "", "requiresPoints": 1,
      "effects": [{"type": "stat", "stat": "hp", "perPoint": 4}]},
     {"id": "quick_notes", "icon": 207, "name": "속기", "tier": 1, "maxPoints": 2, "desc": "원소의 서가 더 빨리 충전된다.",
      "pointText": ["충전 속도 +20%", "충전 속도 +40%"], "requires": "", "requiresPoints": 1,
      "effects": [{"type": "stat", "stat": "recharge", "perPoint": 20}]},
     {"id": "storm_study", "icon": 173, "name": "폭풍 연구", "tier": 2, "maxPoints": 2, "desc": "새 주문 「폭풍의 창」을 배운다. 2포인트면 재사용 대기가 줄어든다.",
      "pointText": ["폭풍의 창을 배운다", "폭풍의 창 재사용 대기 -4턴"], "requires": "ember_focus", "requiresPoints": 1,
      "effects": [{"type": "unlockSkill", "skill": "storm_lance"}, {"type": "skill", "skill": "storm_lance", "field": "cooldown", "perPoint": -2}]},
     {"id": "elemental_guard", "icon": 3, "name": "원소 수호", "tier": 2, "maxPoints": 3, "desc": "방어와 대지의 방벽이 강해진다.",
      "pointText": ["방어 +1, 보호막 +2", "방어 +2, 보호막 +4", "방어 +3, 보호막 +6"], "requires": "", "requiresPoints": 1,
      "effects": [{"type": "stat", "stat": "armor", "perPoint": 1}, {"type": "skill", "skill": "earth_ward", "field": "amount", "perPoint": 2}]}],
  "passives": [
     {"id": "scholar", "name": "공부벌레", "desc": "최대 충전 +1", "unlockLevel": 4, "cond": "", "effects": [{"stat": "charges", "value": 1}]},
     {"id": "calm_breath", "name": "고른 호흡", "desc": "8턴마다 체력 1 회복", "unlockLevel": 1, "cond": "", "effects": [{"stat": "regen", "value": 8}]}],
  "note": "바탕 직업 ARIA 는 mod-2 의 직업. project.json 의 startHero 가 aria 라서 원본 게임(직업 선택 무관)에서도 적용됩니다."})
w('characters/mireille.json', char("mireille", "npc", "미레유", title="약초와 독의 연금술사",
  desc="마을 약초방의 딸. 호기심 많고 장난끼 심하지만 실험 중 폭발사고가 잦다.",
  sprite={"sheet": "game:sprites/wandmaker.png", "frame": [12, 14], "anims": {
    "idle": {"frames": [0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,2,3,3,3,3,3,3,2,1], "fps": 10, "loop": True}, "run": {"frames": [0], "fps": 20, "loop": True}, "die": {"frames": [0], "fps": 20, "loop": False}}},
  ai={"mode": "patrol", "path": [{"x": 11, "y": 7}, {"x": 14, "y": 7}, {"x": 14, "y": 5}], "wait": 4, "pathNode": "f1"},
  heart={"enabled": True, "traits": ["CHEERFUL", "CURIOUS"], "likes": ["tag:herb", "potion_ember"], "dislikes": ["tag:undead"], "initial": {"favor": 0, "trust": 0}},
  dialogue={
    "greet": [
      L("왔어? …기다렸다고는 안 했어!", "bond.close", ""),
      L("아리아! 마침 새 약초를 말리던 참이야. 같이 볼래?", "favor>=600 && trust>=200"),
      L("오, 또 만났네. 이 층 약초들 꽤 쓸 만해.", "stage>=1"),
      L("…흥. 지금은 말 걸지 마.", "sulk"),
      L("어, 안녕? 너도 승급시험 보러 왔구나.")],
    "talk": [
      L("탑의 이끼는 밤에만 빛나. 그래서 수확은 늘 새벽이지.", "exp.talked<3"),
      L("있잖아, 내가 만든 물약이 또 터졌어. 이번엔 무지개색이었다니까?", "favor>=100"),
      L("시험이 끝나면… 우리 약초방에 한번 와. 차 대접할게.", "att.trusting || att.devoted"),
      L("응? 그냥 얘기하고 싶었어?")],
    "gift_liked": [L("와아! 이거 정말 갖고 싶었어! 고마워!"), L("…이런 거 기억해 줬구나. 고마워, 진짜로.", "bond.admire")],
    "gift_normal": [L("고마워. 잘 쓸게.")],
    "gift_disliked": [L("…이걸 왜 나한테? 으, 냄새.")],
    "sulk": [L("아직 화 안 풀렸거든.")],
    "stage_up": [L("있잖아… 너랑 있으면 실험이 덜 무서워.")],
    "low_hp": [L("피 나잖아! 잠깐, 해독초 찧어 줄게!", "abl.intimacy>=3"), L("괜찮아? 너무 무리하지 마!")],
    "hero_kill": [L("우와, 방금 그 마법 뭐야?")],
    "talk_tired": [L("으음… 오늘은 말 많이 했다. 목 아파. 다음 층에서 또 얘기하자!"), L("…너랑은 계속 얘기해도 안 지치네. 신기하다.", "bond.partner")],
    "praise": [L("에, 에헤헤… 갑자기 왜 그래?"), L("정말? 이 조합, 사흘 밤 새서 찾은 거야!", "temper>0")],
    "praise_fail": [L("…그거, 비꼬는 거지?")],
    "comforted": [L("…고마워. 조금 나아졌어."), L("무서운 건 무서운 거지만… 네가 있으니까 괜찮아.", "stage>=2")],
    "apology_ok": [L("…흥. 이번만 봐줄게."), L("알았어, 알았다고. 나도 너무 화냈어.", "trust>=150")],
    "apology_fail": [L("사과하면 다야?"), L("…지금은 듣고 싶지 않아.")],
    "jealous": [L("…다른 애랑은 참 잘 지내네."), L("흥, 나한테는 그런 표정 안 짓더니.", "bond.admire")],
    "request_ok": [L("좋아! 어디든 따라갈게."), L("…너니까 말해 주는 거야.", "acceptLv>=2")],
    "request_no": [L("에… 그건 좀. 아직은 아니야."), L("지금 그런 말 할 기분 아니거든!", "sulk")],
    "bad_temper": [L("…오늘은 좀 건드리지 마.")],
    "good_temper": [L("오늘 왠지 기분 좋아! 뭐든 잘 될 것 같아!")],
    "ignored": [L("…나 여기 있는데.")],
    "diary": [
      L("오늘 아리아가 날 구해줬다. 심장이 아직도 쿵쾅거린다.", "gauge.relief>=300"),
      L("아리아랑 새 약초 얘기를 했다. 재밌었다!", "gauge.joy>=200"),
      L("오늘은 조금 무서웠다. 탑이 점점 깊어진다.", "gauge.fear>=200"),
      L("평범한 하루. 약초 세 뿌리 채집.")]}))
w('characters/seraphine.json', char("seraphine", "npc", "세라핀", title="그림자와 계약한 자",
  desc="과묵하고 무뚝뚝하지만 그림자에게는 다정하다.",
  sprite={"sheet": "game:sprites/ghost.png", "frame": [14, 15], "anims": {
    "idle": {"frames": [0, 1], "fps": 5, "loop": True}, "run": {"frames": [0, 1], "fps": 10, "loop": True},
    "attack": {"frames": [0, 2, 3], "fps": 10, "loop": False}, "die": {"frames": [0, 4, 5, 6, 7], "fps": 8, "loop": False}}},
  heart={"enabled": True, "traits": ["SHY", "INDIFFERENT", "JEALOUS"], "likes": ["tag:undead"], "dislikes": ["tag:herb"], "initial": {"favor": 0, "trust": 0}},
  dialogue={"greet": [L("…", ""), L("…너였구나.", "stage>=1"), L("그림자가 네 얘기를 해. …좋은 뜻으로.", "bond.admire")],
            "gift_liked": [L("…고마워. 그림자도 좋아해.")], "gift_disliked": [L("…필요 없어.")],
            "jealous": [L("…그 애랑 즐거워 보이네."), L("그림자가 시끄러워. …내 탓 아니야.", "bond.admire")],
            "talk_tired": [L("…오늘은 여기까지.")], "request_no": [L("…싫어.")], "request_ok": [L("…응.")]}))
w('characters/lumiere.json', char("lumiere", "npc", "루미에르", title="시간의 바늘",
  desc="승급시험에 실패한 과거가 있어, 이번엔 과거를 바꾸겠다는 각오로 시험에 임한다.",
  sprite={"sheet": "game:sprites/wandmaker.png", "frame": [12, 14], "anims": {"idle": {"frames": [0, 1, 2, 3, 2, 1], "fps": 6, "loop": True}}},
  heart={"enabled": True, "traits": ["PROUD", "CALM"], "likes": [], "dislikes": [], "initial": {"favor": 0, "trust": 30}},
  dialogue={"greet": [L("시간 낭비는 싫어. 용건만 말해."), L("…이번엔 늦지 않았네.", "trust>=100")]}))
w('characters/moss_rat.json', char("moss_rat", "mob", "이끼쥐",
  desc="탑 하층의 이끼를 먹고 사는 쥐. 등에서 약초가 자라기도 한다.",
  sprite={"sheet": "game:sprites/rat.png", "frame": [16, 15], "anims": {
    "idle": {"frames": [0, 0, 0, 1], "fps": 2, "loop": True}, "run": {"frames": [6, 7, 8, 9, 10], "fps": 10, "loop": True},
    "attack": {"frames": [2, 3, 4, 5, 0], "fps": 15, "loop": False}, "die": {"frames": [11, 12, 13, 14], "fps": 10, "loop": False}}},
  stats={"hp": 10, "attackMin": 1, "attackMax": 4, "defense": 1, "accuracy": 8, "evasion": 2, "speed": 1},
  ai={"mode": "hunt", "path": [], "wait": 0},
  behaviors={"onDeath": [{"cmd": "giveItem", "item": "herb_moonleaf", "count": 1}]}))

# ---- 아이템 ----
# 그림은 ItemSpriteSheet 상수 이름으로 (원작·mod-2 시트 모두 맞음). index 는 mod-2(32px) 시트 번호
SPR = {"SEED_SUNGRASS": 739, "POTION_CRIMSON": 672, "RATION": 869, "DUST": 929, "MAGES_STAFF": 197, "ARMOR_LEATHER": 353, "THROWING_KNIFE": 290, "ARTIFACT_SPELLBOOK": 486}
def item(id, cat, name, desc, idx, **kw):
    i = {"format": "pdmaker-item", "version": V, "id": id, "category": cat, "name": name, "desc": desc,
         "sprite": {"sheet": "builtin:items", "name": idx, "index": SPR.get(idx, 0)}, "stackable": True, "price": 10, "unique": False, "tags": [], "stats": {}, "onUse": [], "giftValue": {}}
    i.update(kw); return i
w('items/herb_moonleaf.json', item("herb_moonleaf", "material", "달빛 잎", "탑의 이끼 사이에서 자라는 약초. 밤에만 은은하게 빛난다.", "SEED_SUNGRASS", tags=["herb", "gift"], price=15))
w('items/potion_ember.json', item("potion_ember", "potion", "잿불 물약", "미레유가 만든 실험작. 마시면 몸이 따뜻해진다… 아마도.", "POTION_CRIMSON", tags=["gift"], subtype="",
  onUse=[{"cmd": "notice", "text": "몸이 따뜻해진다!", "color": "good"}, {"cmd": "heart", "char": "mireille", "stat": "gauge.joy", "value": 100}]))
w('items/ration_witch.json', item("ration_witch", "food", "견습 마녀 도시락", "시험 전날 밤 싸 둔 도시락.", "RATION", stats={"energy": 300}))
w('items/bone_charm.json', item("bone_charm", "gift", "뼈 부적", "으스스한 부적. 그림자가 좋아한다.", "DUST", tags=["undead", "gift"]))
# 코드가 붙은 장비 (kind: melee / missile / armor) — 게임 저장소의 pdmaker/gen/I_<id>.java 로 생성됨
w('items/ember_staff.json', item("ember_staff", "weapon", "잿불 지팡이", "끝에 잿불이 맺힌 지팡이. 맞힌 적을 가끔 불태운다.", "MAGES_STAFF", stackable=False, price=0, subtype="melee",
  kind="melee", weapon={"tier": 2, "min": 2, "max": 12, "minPerLvl": 1, "maxPerLvl": 3, "str": 12, "delay": 1.0, "reach": 1, "accuracy": 1.1},
  code={"imports": "", "members": "",
        "proc": "// 맞힐 때 25% 확률로 불태움\nif (Random.Int(4) == 0) {\n    Buff.affect(defender, Burning.class).reignite(defender);\n}",
        "onEquip": "GLog.i(\"지팡이 끝의 잿불이 살아난다.\");",
        "desc": "return value + \"\\n\\n강화할수록 최대 피해가 3씩 오릅니다.\";"}))
w('items/moss_cloak.json', item("moss_cloak", "armor", "이끼 망토", "탑의 이끼를 엮은 망토. 맞으면 가끔 뿌리가 적을 붙잡는다.", "ARMOR_LEATHER", stackable=False, price=0, subtype="armor",
  kind="armor", armor={"tier": 2, "drMin": 1, "drMax": 5, "drMinPerLvl": 0, "drMaxPerLvl": 2, "str": 11},
  code={"armorProc": "if (Random.Int(5) == 0) Buff.affect(attacker, Roots.class, 2f);"}))
w('items/seed_knife.json', item("seed_knife", "weapon", "씨앗 투척칼", "던지면 잘 박히는 작은 칼.", "THROWING_KNIFE", price=8, subtype="missile",
  kind="missile", weapon={"tier": 1, "min": 2, "max": 5, "minPerLvl": 1, "maxPerLvl": 1, "baseUses": 10, "sticky": True, "accuracy": 1.2, "delay": 1.0}))
w('items/wind_bell.json', item("wind_bell", "trinket", "바람 방울", "흔들면 주변의 적이 잠시 멈칫한다. (코드로 만든 사용 버튼)", "DUST", stackable=True, price=20,
  actions=[{"id": "ring", "name": "흔들기", "cond": "", "default": True, "consume": False, "time": 1,
            "code": "for (Mob m : Dungeon.level.mobs.toArray(new Mob[0])) {\n    if (m.alignment == Char.Alignment.ENEMY && Dungeon.level.distance(hero.pos, m.pos) <= 3) {\n        Buff.affect(m, Paralysis.class, 1f);\n    }\n}\nMakerAudio.playSe(\"sound:bell\");   // 사운드 편집기에서 만든 효과음\nGLog.i(\"딸랑—\");"}]))

# ---- 이벤트 ----
def ev(id, kind, name, pages, **kw):
    e = {"format": "pdmaker-event", "version": V, "id": id, "kind": kind, "name": name, "note": "", "pages": pages}
    e.update(kw); return e
def page(cmds, cond="", trigger="action", **kw):
    p = {"cond": cond, "trigger": trigger, "turnEvery": 10, "heartCond": "", "graphic": {}, "commands": cmds}
    p.update(kw); return p
T = lambda text, speaker="", face="", illust="": {"cmd": "text", "speaker": speaker, "face": face, "illust": illust, "text": text}
w('events/ev_opening.json', ev("ev_opening", "scene", "오프닝 — 승급시험의 날", [page([
  {"cmd": "if", "cond": "switch.opening_seen", "then": [{"cmd": "stop"}], "else": []},
  {"cmd": "flash", "color": "#ffffff", "time": 4},
  T("수 년에 한 번 열리는 정식 마녀 승급시험."),
  T("시험의 내용은, 수백 년 전부터 생겨나기 시작한 탑을 올라 코어를 회수해 오는 것."),
  T("…불, 물, 바람, 땅. 하나만 고르라고? 난 네 가지 전부로 증명할 거야.", "aria"),
  {"cmd": "choice", "options": ["각오를 다진다", "솔직히 조금 긴장된다"], "branches": [
    [T("좋아. 이론은 완벽해. 남은 건 실전뿐.", "aria"), {"cmd": "var", "id": "resolve", "op": "add", "value": 1}],
    [T("…괜찮아. 긴장도 계산에 넣으면 돼.", "aria")]]},
  {"cmd": "switch", "id": "opening_seen", "value": True}], trigger="none")]))
w('events/ev_notice_board.json', ev("ev_notice_board", "common", "시험장 게시판", [
  page([T("「정식 마녀 승급시험 안내」\n각 탑의 코어를 회수하여 제출할 것. 동료와의 협력은 허용한다."), {"cmd": "switch", "id": "read_notice", "value": True}]),
  page([T("게시판에 새 쪽지가 붙어 있다. 「약초 채집 도와줄 사람 구함 — 미레유」")], cond="switch.read_notice && !switch.met_mireille")]))
w('events/ev_talk_mireille.json', ev("ev_talk_mireille", "common", "미레유와 대화", [
  page([
    T("어, 안녕? 너도 승급시험 보러 왔구나. 난 미레유! 약초방 딸이야.", "mireille"),
    T("혹시 달빛 잎 봤어? 이 층 어딘가에 있을 텐데…", "mireille"),
    {"cmd": "choice", "options": ["같이 찾아 줄게", "바빠서 안 돼"], "branches": [
      [{"cmd": "action", "char": "mireille", "action": "TALK"}, {"cmd": "memory", "char": "mireille", "key": "offered_help"}, T("정말? 고마워!", "mireille")],
      [{"cmd": "action", "char": "mireille", "action": "RUDE"}, T("…그래. 알았어.", "mireille")]]},
    {"cmd": "switch", "id": "met_mireille", "value": True}]),
  page([
    {"cmd": "topic", "char": "mireille", "topic": "greet"},
    {"cmd": "choice", "options": ["이야기한다", "선물을 준다", "그만둔다"], "branches": [
      [{"cmd": "heartMenu", "char": "mireille"}],
      [{"cmd": "if", "cond": "item.herb_moonleaf>=1",
        "then": [{"cmd": "giveItem", "item": "herb_moonleaf", "count": -1}, {"cmd": "action", "char": "mireille", "action": "GIFT_LIKED"}, {"cmd": "topic", "char": "mireille", "topic": "gift_liked"}],
        "else": [T("줄 만한 것이 없다.")]}],
      []]}], cond="switch.met_mireille")]))
w('events/ev_mireille_close.json', ev("ev_mireille_close", "milestone", "미레유 — 약초방의 약속", [page([
  T("있잖아, 아리아.", "mireille", "", ""),
  T("시험이 끝나면… 우리 약초방 뒤뜰에 달빛 잎 심자. 둘이서.", "mireille"),
  {"cmd": "choice", "options": ["약속할게", "…생각해 볼게"], "branches": [
    [{"cmd": "heart", "char": "mireille", "stat": "rel.trust", "value": 100}, {"cmd": "switch", "id": "promise_garden", "value": True}, T("헤헤. 약속이다!", "mireille")],
    [T("…응. 기다릴게.", "mireille")]]}], trigger="none")]))
w('events/ev_daily_lost_page.json', ev("ev_daily_lost_page", "daily", "잃어버린 연구 노트", [page([
  T("바닥에 누군가의 연구 노트 한 장이 떨어져 있다."),
  {"cmd": "var", "id": "notes", "op": "add", "value": 1},
  {"cmd": "notice", "text": "연구 노트를 주웠다.", "color": "good"}], trigger="floorEnter")],
  daily={"chance": 30, "from": 1, "to": 5, "once": False}))
for eid, name, lines in [
    ("ev_end_true", "엔딩 — 약초방 뒤뜰", ["다섯 개의 코어를 제출한 날, 아리아는 정식 마녀가 되었다.", "그리고 약속대로, 뒤뜰에는 달빛 잎이 자라기 시작했다."]),
    ("ev_end_normal", "엔딩 — 정식 마녀", ["다섯 개의 코어를 제출한 날, 아리아는 정식 마녀가 되었다.", "…어딘가 조금, 허전한 기분이 들었다."]),
    ("ev_end_fail", "엔딩 — 다음 시험을 기약하며", ["탑은 너무 높았다.", "하지만 수 년 뒤, 시험은 다시 열린다."])]:
    w(f'events/{eid}.json', ev(eid, "scene", name, [page([T(l) for l in lines], trigger="none")]))

w('events/ev_ember_seal.json', ev("ev_ember_seal", "common", "마을 광장의 봉인석", [
  page([T("광장 한가운데 오래된 봉인석이 있다. 손을 대자 붉은 빛이 번진다…"),
        {"cmd": "sound", "kind": "se", "file": "sound:seal_open"},
        {"cmd": "switch", "id": "ember_seal", "value": True},
        {"cmd": "notice", "text": "탑 3층 어딘가에 새로운 길이 열렸다"}], trigger="touch"),
  page([T("봉인석은 이미 식어 있다.")], cond="switch.ember_seal", trigger="touch")]))
w('events/ev_ember_hall.json', ev("ev_ember_hall", "scene", "잿불 회랑 입장", [page([
  T("공기가 뜨겁다. 여긴 시험 안내에 없던 길이야…", "aria")], trigger="none")]))
w('story/story.json', {"format": "pdmaker-story", "version": V,
  "synopsis": "탑 등반물. 수 년에 한 번 열리는 정식 마녀 승급시험. 견습 마녀들은 수백 년 전부터 생겨난 탑을 올라, 탑마다 하나씩 있는 코어를 회수해야 한다.\n주인공 아리아는 가문의 압박을 거스르고 모든 원소를 다루는 길을 택했다. 같은 시험에 참가한 미레유, 세라핀, 루미에르와 얽히며 탑을 오른다.",
  "switches": [
    {"id": "opening_seen", "name": "오프닝 봄", "group": "시스템", "note": ""},
    {"id": "read_notice", "name": "게시판 읽음", "group": "1장", "note": ""},
    {"id": "met_mireille", "name": "미레유와 만남", "group": "미레유", "note": ""},
    {"id": "mireille_joined", "name": "미레유 동료 합류", "group": "미레유", "note": ""},
    {"id": "promise_garden", "name": "뒤뜰 약속", "group": "미레유", "note": "트루 엔딩 조건"},
    {"id": "ember_seal", "name": "잿불 봉인 해제", "group": "갈림길", "note": "1구역 3층의 잿불 갈림길 계단 조건"}],
  "variables": [
    {"id": "cores", "name": "회수한 코어", "initial": 0, "group": "진행", "note": "보스 처치마다 +1"},
    {"id": "resolve", "name": "각오", "initial": 0, "group": "아리아", "note": ""},
    {"id": "notes", "name": "주운 연구 노트", "initial": 0, "group": "수집", "note": ""}],
  "routes": [{"id": "main", "name": "기본 루트", "when": "", "note": ""},
             {"id": "ember", "name": "원소 폭주 루트", "when": "", "note": "조건식 route=='ember' 로 연결을 갈라 쓸 수 있음"}],
  "beats": [
    {"id": "b1", "node": "f1", "event": "ev_opening", "required": True, "note": "오프닝"},
    {"id": "b2", "node": "f1", "event": "ev_talk_mireille", "required": False, "note": "미레유 첫 만남"}],
  "endings": [
    {"id": "true_end", "name": "약초방 뒤뜰", "priority": 100, "when": "var.cores>=5 && switch.promise_garden", "scene": "ev_end_true", "note": ""},
    {"id": "normal_end", "name": "정식 마녀", "priority": 50, "when": "var.cores>=5", "scene": "ev_end_normal", "note": ""},
    {"id": "fail_end", "name": "다음 시험을 기약하며", "priority": 0, "when": "", "scene": "ev_end_fail", "note": ""}],
  "startEvent": ""})
print('ok')

# ---- 타이틀 화면 (title.json) ----
BTN = ["play", "support", "rankings", "journal", "news", "changes", "settings", "about"]
w('title.json', {"format": "pdmaker-title", "version": V, "enabled": True,
  "music": {"tracks": []},
  "background": {"archs": True, "archDir": "left", "archSpeed": 14, "color": "",
                 "gradient": {"enabled": True, "color": "#0b1b3a", "alpha": 0.55, "from": "top"},
                 "vignette": True, "effect": "mana", "effectDensity": 1, "effectColor": "", "effectFront": False, "effectArea": "logo"},
  "layers": [
    {"name": "마녀의 불꽃 왼쪽 (시트 애니메이션)", "image": "game:effects/fireball-short.png", "frame": [47, 47], "frames": list(range(24)), "fps": 24,
     "fit": "none", "x": 0.12, "y": 0.2, "anchorX": 0.5, "anchorY": 0.5, "scale": 1, "alpha": 1, "blend": "light",
     "bob": 2, "bobSpeed": 0.5, "pulse": 0, "pulseSpeed": 1, "spin": 0, "tile": False, "scrollX": 0, "scrollY": 0, "front": False},
    {"name": "마녀의 불꽃 오른쪽", "image": "game:effects/fireball-short.png", "frame": [47, 47], "frames": list(range(12, 24)) + list(range(12)), "fps": 24,
     "fit": "none", "x": 0.88, "y": 0.2, "anchorX": 0.5, "anchorY": 0.5, "scale": 1, "alpha": 1, "blend": "light",
     "bob": 2, "bobSpeed": 0.6, "pulse": 0, "pulseSpeed": 1, "spin": 0, "tile": False, "scrollX": 0, "scrollY": 0, "front": False}],
  "logo": {"mode": "game", "image": "", "text": "위츨링 픽셀 타워", "subtitle": "— 원소의 서기 아리아의 시험 —", "size": 18, "color": "#ffd966",
           "subColor": "#c8b8ff", "scale": 1, "y": 0, "offsetY": 0, "glow": True, "torches": False, "anim": "float"},
  "gate": {"enabled": True, "text": "화면을 누르세요", "color": "#c8b8ff", "blink": True, "logoAfter": "fade", "idleReturn": 15},
  "buttons": {"layout": "column", "columns": 1, "firstWide": False, "top": 0, "width": 120, "height": 18, "gap": 4, "offsetX": 0, "style": "",
    "anim": {"enter": "slideUp", "duration": 0.6, "stagger": 0.08, "distance": 24, "idle": "bob", "idleAmount": 1, "idleSpeed": 0.6},
    "items": [
      {"id": "play", "label": "탑에 오르기", "visible": True, "icon": ""},
      {"id": "rankings", "label": "", "visible": True, "icon": ""},
      {"id": "journal", "label": "", "visible": True, "icon": ""},
      {"id": "settings", "label": "", "visible": True, "icon": ""},
      {"id": "credits", "custom": True, "label": "만든 사람", "visible": True, "icon": "INFO", "action": "text", "title": "만든 사람",
       "text": "위츨링 픽셀 타워 (PDMaker 샘플)\n\n원작: Shattered Pixel Dungeon (Evan Debenham)\n만든 도구: PDMaker"},
      {"id": "about", "label": "", "visible": True, "icon": ""},
      {"id": "support", "label": "", "visible": False, "icon": ""},
      {"id": "news", "label": "", "visible": False, "icon": ""},
      {"id": "changes", "label": "", "visible": False, "icon": ""}]},
  "version": {"visible": True, "text": "샘플 v0.1"}, "exit": {"visible": True}})
