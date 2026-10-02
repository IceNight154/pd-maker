#!/usr/bin/env python3
# 게임(원작 Shattered Pixel Dungeon) 방 목록 → editor/renderer/js/spd-rooms.js
#   사용: python tools/data/extract_spd_rooms.py [원작 SPD 저장소]
#   levels/rooms 아래의 모든 방 클래스: 분류(폴더)·한국어 이름·설명·바탕 클래스·크기, "추가 방"으로 쓸 수 있는지
#   편집기 [맵] › [방 템플릿] 목록과 "추가 방" 고르기에 씁니다 (런타임: LevelHooks.addList 의 "game:<분류>.<클래스>")
import re, os, json, sys
_GH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'game')
V = (sys.argv[1] if len(sys.argv) > 1 else os.path.join(_GH, 'shattered-pixel-dungeon-master')) + '/core/src/main'
R = V + '/java/com/shatteredpixel/shatteredpixeldungeon/levels/rooms'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'editor', 'renderer', 'js', 'spd-rooms.js')

# 이름 · 설명 (입구/출구 변형은 바탕 방 이름에 자동으로 붙임)
N = {
 'Room': ('방 (모든 방의 바탕)', '크기·연결·문을 다루는 가장 바탕 클래스'),
 # --- 일반
 'StandardRoom': ('일반 방 (바탕)', '일반 방의 바탕 클래스. 크기 등급(보통·큼·거대)을 가짐'),
 'PatchRoom': ('무늬 방 (바탕)', '불규칙한 얼룩 무늬를 까는 방들의 바탕'),
 'StandardBridgeRoom': ('다리 방 (바탕)', '가운데를 가로지르는 띠와 다리가 있는 방들의 바탕'),
 'EmptyRoom': ('빈 방', '아무것도 없는 네모난 방'),
 'AquariumRoom': ('수족관 방', '가운데 물웅덩이에 피라냐가 사는 방'),
 'BurnedRoom': ('불탄 방', '잿더미와 불씨, 화염 함정이 깔린 방'),
 'CaveRoom': ('동굴 방', '벽이 불규칙하게 튀어나온 동굴 모양 방'),
 'CavesFissureRoom': ('동굴 균열 방', '여러 갈래 균열(구덩이)이 가로지르는 동굴 방'),
 'CellBlockRoom': ('감방 구역', '작은 감방들이 줄지어 있는 방'),
 'ChasmBridgeRoom': ('구덩이 다리 방', '구덩이 띠 위로 다리가 놓인 방'),
 'ChasmRoom': ('구덩이 방', '바닥 곳곳이 구덩이인 방'),
 'CircleBasinRoom': ('원형 수조 방', '둥근 물 수조가 있는 방'),
 'CirclePitRoom': ('원형 구덩이 방', '가운데가 둥글게 뚫린 방'),
 'CircleWallRoom': ('원형 벽 방', '둥근 벽으로 둘러싸인 방'),
 'FissureRoom': ('균열 방', '가운데에서 균열이 뻗어 나간 방'),
 'GrassyGraveRoom': ('풀밭 무덤 방', '풀이 자란 바닥에 묘비가 놓인 방'),
 'HallwayRoom': ('복도 방', '문과 문을 잇는 통로가 난 방'),
 'ImpShopRoom': ('임프 상점', '임프 퀘스트를 마치면 열리는 상점 (드워프 도시)'),
 'LibraryHallRoom': ('도서관 홀', '책장이 줄지어 선 넓은 방'),
 'LibraryRingRoom': ('도서관 고리 방', '책장이 고리 모양으로 둘린 방'),
 'MinefieldRoom': ('지뢰밭 방', '폭발 함정이 숨어 있는 방'),
 'PillarsRoom': ('기둥 방', '굵은 기둥이 서 있는 방'),
 'PlantsRoom': ('식물 방', '풀과 식물(씨앗)이 자라는 방'),
 'PlatformRoom': ('발판 방', '구덩이 위에 발판과 다리가 놓인 방'),
 'RegionDecoBridgeRoom': ('지역 장식 다리 방', '그 지역 장식물 띠 위로 다리가 놓인 방'),
 'RegionDecoLineRoom': ('지역 장식 줄 방', '그 지역 장식물이 줄지어 선 방'),
 'RegionDecoPatchRoom': ('지역 장식 무늬 방', '그 지역 장식물이 흩어진 방'),
 'RingRoom': ('고리 방', '가운데가 벽으로 막힌 고리 모양 방'),
 'RitualRoom': ('의식 방', '제단과 불씨가 있는 방'),
 'RuinsRoom': ('폐허 방', '무너진 벽 조각이 흩어진 방'),
 'SegmentedLibraryRoom': ('나뉜 도서관', '책장으로 칸이 나뉜 방'),
 'SegmentedRoom': ('나뉜 방', '벽으로 여러 칸이 나뉜 방'),
 'SewerPipeRoom': ('하수관 방', '문과 문을 물길이 잇는 방'),
 'SkullsRoom': ('해골 방', '해골 장식이 둥글게 놓인 방 (악마의 전당)'),
 'StatueLineRoom': ('석상 줄 방', '석상이 한 줄로 선 방'),
 'StatuesRoom': ('석상 방', '석상이 규칙적으로 놓인 방'),
 'StripedRoom': ('줄무늬 방', '풀과 바닥이 줄무늬를 이루는 방'),
 'StudyRoom': ('서재', '책장으로 둘러싸이고 가운데 받침대에 아이템이 놓인 방'),
 'SuspiciousChestRoom': ('수상한 상자 방', '가운데 상자가 미믹일 수도 있는 방'),
 'WaterBridgeRoom': ('물 다리 방', '물길 위로 다리가 놓인 방'),
 'EntranceRoom': ('입구 방', '층의 입구(계단)가 있는 방'),
 'ExitRoom': ('출구 방', '층의 출구(계단)가 있는 방'),
 # --- 특수
 'SpecialRoom': ('특수 방 (바탕)', '문이 하나뿐인 특수 방의 바탕 클래스'),
 'ArmoryRoom': ('무기고', '잠긴 문 안에 무기·방어구·폭탄이 있는 방'),
 'CryptRoom': ('납골당', '묘비 아래 저주받은 방어구가 묻힌 방'),
 'CrystalChoiceRoom': ('수정 선택 방', '수정 문 둘 중 하나만 열 수 있는 방'),
 'CrystalPathRoom': ('수정 길 방', '수정 문을 차례로 열며 들어가는 방'),
 'CrystalVaultRoom': ('수정 금고', '수정 상자 둘 중 하나를 고르는 방'),
 'DemonSpawnerRoom': ('악마 소환진 방', '악마 소환진이 놓인 방 (악마의 전당)'),
 'GardenRoom': ('정원', '키 큰 풀과 이슬·햇살풀이 자라는 방'),
 'LaboratoryRoom': ('연금술 실험실', '연금 솥과 물약이 있는 방'),
 'LibraryRoom': ('도서관', '책장과 주문서가 있는 방'),
 'MagicWellRoom': ('마법 우물 방', '각성·건강의 우물이 있는 방'),
 'MagicalFireRoom': ('마법 불 방', '꺼지지 않는 불 뒤에 보상이 있는 방'),
 'PitRoom': ('구덩이 바닥 방', '윗층의 약한 바닥에서 떨어져 들어오는 방'),
 'PoolRoom': ('수영장 방', '피라냐가 사는 물 건너편에 상자가 있는 방'),
 'RunestoneRoom': ('룬석 방', '룬석이 놓인 방'),
 'SacrificeRoom': ('희생 제단 방', '희생의 불이 타는 제단이 있는 방'),
 'SentryRoom': ('감시 장치 방', '감시 장치의 광선을 피해 보상에 닿는 방'),
 'ShopRoom': ('상점', '상인이 물건을 파는 방'),
 'StatueRoom': ('석상 방 (특수)', '움직이는 석상이 지키는 방'),
 'StorageRoom': ('창고', '바리케이드 뒤에 물건이 쌓인 방'),
 'ToxicGasRoom': ('독가스 방', '독가스가 뿜어지는 가운데 보상이 있는 방'),
 'TrapsRoom': ('함정 방', '함정 밭 건너편에 보상이 있는 방'),
 'TreasuryRoom': ('보물 창고', '금화와 상자가 가득한 방'),
 'WeakFloorRoom': ('약한 바닥 방', '바닥이 꺼져 아래층으로 떨어지는 방'),
 # --- 비밀
 'SecretRoom': ('비밀 방 (바탕)', '숨겨진 문으로만 들어가는 방의 바탕'),
 'RatKingRoom': ('쥐 왕의 방', '쥐 왕과 상자가 있는 비밀 방 (하수도)'),
 'SecretArtilleryRoom': ('비밀 무기 창고', '투척 무기와 폭탄이 놓인 비밀 방'),
 'SecretChestChasmRoom': ('비밀 구덩이 상자 방', '구덩이 너머 잠긴 상자들이 있는 비밀 방'),
 'SecretGardenRoom': ('비밀 정원', '씨앗 식물이 자라는 비밀 방'),
 'SecretHoardRoom': ('비밀 금고', '금화와 함정이 가득한 비밀 방'),
 'SecretHoneypotRoom': ('비밀 꿀단지 방', '깨진 꿀단지와 벌, 폭탄이 있는 비밀 방'),
 'SecretLaboratoryRoom': ('비밀 실험실', '연금 솥과 물약이 있는 비밀 방'),
 'SecretLarderRoom': ('비밀 식료품실', '음식과 축복받은 열매 덤불이 있는 비밀 방'),
 'SecretLibraryRoom': ('비밀 도서관', '주문서가 놓인 비밀 방'),
 'SecretMazeRoom': ('비밀 미로', '미로 끝에 보상이 있는 비밀 방'),
 'SecretRunestoneRoom': ('비밀 룬석 방', '룬석과 강화 재료가 있는 비밀 방'),
 'SecretSummoningRoom': ('비밀 소환 방', '소환 함정으로 가득한 비밀 방'),
 'SecretWellRoom': ('비밀 우물', '마법 우물이 있는 비밀 방'),
 # --- 연결
 'ConnectionRoom': ('연결 통로 (바탕)', '방과 방을 잇는 통로의 바탕 클래스'),
 'TunnelRoom': ('터널', '문과 문을 잇는 좁은 통로'),
 'BridgeRoom': ('다리 통로', '구덩이·물 위의 다리 통로'),
 'MazeConnectionRoom': ('미로 통로', '미로로 된 통로'),
 'PerimeterRoom': ('둘레 통로', '벽을 따라 도는 통로'),
 'RingBridgeRoom': ('고리 다리 통로', '가운데 고리가 있는 다리 통로'),
 'RingTunnelRoom': ('고리 터널', '가운데 고리가 있는 터널'),
 'WalkwayRoom': ('발판 통로', '구덩이 위를 도는 통로'),
 # --- 퀘스트
 'BlacksmithRoom': ('대장장이 방', '대장장이가 있는 방 (동굴 퀘스트)'),
 'MassGraveRoom': ('공동 묘지', '시체 가루가 묻힌 방 (지팡이 장인 퀘스트)'),
 'MineEntrance': ('광산 입구', '대장장이 퀘스트 광산의 입구 방'),
 'MineGiantRoom': ('광산 거대 방', '대장장이 퀘스트 광산의 거대 방'),
 'MineLargeRoom': ('광산 큰 방', '대장장이 퀘스트 광산의 큰 방'),
 'MineSecretRoom': ('광산 비밀 방', '대장장이 퀘스트 광산의 비밀 방'),
 'MineSmallRoom': ('광산 작은 방', '대장장이 퀘스트 광산의 작은 방'),
 'RitualSiteRoom': ('의식 장소', '촛불을 놓는 의식 표식이 있는 방 (지팡이 장인 퀘스트)'),
 'RotGardenRoom': ('썩은 정원', '썩은 심장과 덩굴이 있는 방 (지팡이 장인 퀘스트)'),
 'AmbitiousImpRoom': ('야심찬 임프의 방', '임프가 금고 털이를 맡기는 방 (드워프 도시 퀘스트)'),
 # --- 금고 (4.0 임프 퀘스트의 금고 층 전용)
 'VaultRoom': ('금고 방 (바탕)', '금고 층 방들의 바탕 클래스'),
 'VaultTreasureRoom': ('금고 보물 방 (바탕)', '금고 층 보물 방들의 바탕 클래스'),
 'VaultEntranceRoom': ('금고 입구', '금고 층에 들어서는 방'),
 'VaultFinalRoom': ('금고 마지막 방', '금고 층의 목표가 있는 마지막 방'),
 'VaultAlternatingFireRoom': ('금고 · 번갈아 뿜는 불 방', '불 함정이 번갈아 켜지는 방'),
 'VaultCircleRoom': ('금고 · 원형 방', '둥근 모양의 금고 방'),
 'VaultCrossRoom': ('금고 · 십자 방', '십자 모양의 금고 방'),
 'VaultEnemyCenterRoom': ('금고 · 가운데 경비 방', '가운데에 경비가 서 있는 방'),
 'VaultHallwayRoom': ('금고 · 복도 방', '통로로 된 금고 방'),
 'VaultLasersRoom': ('금고 · 레이저 방', '감시 레이저가 지나가는 방'),
 'VaultLongRingsRoom': ('금고 · 긴 고리 방', '긴 고리 모양 통로가 겹친 방'),
 'VaultLongRoom': ('금고 · 긴 방', '길쭉한 금고 방'),
 'VaultQuadrantsRoom': ('금고 · 네 칸 방', '네 구역으로 나뉜 방'),
 'VaultRingRoom': ('금고 · 고리 방', '고리 모양의 금고 방'),
 'VaultRingsRoom': ('금고 · 겹고리 방', '고리가 여러 겹인 방'),
 'VaultTokensRoom': ('금고 · 토큰 방', '토큰 문이 있는 방'),
 'VaultSimpleEnemyTreasureRoom': ('금고 · 경비 보물 방 (단순)', '경비 하나가 지키는 보물 방'),
 'VaultBookcaseTreasureRoom': ('금고 보물 · 책장 방', '책장 사이에 보물이 있는 방'),
 'VaultCircleScanTreasureRoom': ('금고 보물 · 원형 감시 방', '둥글게 도는 감시를 피하는 보물 방'),
 'VaultFlamePathRoom': ('금고 보물 · 불길 방', '불 함정 사이 길을 지나는 보물 방'),
 'VaultFlamesTreasureRoom': ('금고 보물 · 불 함정 방', '불 함정이 지키는 보물 방'),
 'VaultHardLaserTreasureRoom': ('금고 보물 · 레이저 방 (어려움)', '촘촘한 레이저가 지키는 보물 방'),
 'VaultLaserTreasureRoom': ('금고 보물 · 레이저 방', '레이저가 지키는 보물 방'),
 'VaultManyScansRoom': ('금고 보물 · 다중 감시 방', '감시가 여러 개 도는 보물 방'),
 'VaultMultipleEnemyTreasureRoom': ('금고 보물 · 경비 여럿 방', '경비 여럿이 지키는 보물 방'),
 'VaultSingleEnemyTreasureRoom': ('금고 보물 · 경비 하나 방', '경비 하나가 지키는 보물 방'),
 # --- 하수도 보스
 'GooBossRoom': ('구 보스 방 (바탕)', '하수도 보스(구) 방의 바탕'),
 'DiamondGooRoom': ('구 보스 방 · 마름모', '마름모 모양 구 보스 방'),
 'ThickPillarsGooRoom': ('구 보스 방 · 굵은 기둥', '굵은 기둥이 선 구 보스 방'),
 'ThinPillarsGooRoom': ('구 보스 방 · 가는 기둥', '가는 기둥이 선 구 보스 방'),
 'WalledGooRoom': ('구 보스 방 · 벽', '벽으로 나뉜 구 보스 방'),
 'SewerBossEntranceRoom': ('하수도 보스 층 입구', '구 보스 층의 입구 방'),
 'SewerBossExitRoom': ('하수도 보스 층 출구', '구 보스 층의 출구 방'),
}
CATS = [('standard', '일반 방'), ('entrance', '입구 방'), ('exit', '출구 방'), ('special', '특수 방'), ('secret', '비밀 방'),
        ('connection', '연결 통로'), ('quest', '퀘스트 방'), ('vault', '금고 방 (임프 퀘스트)'), ('sewerboss', '하수도 보스 방'), ('base', '바탕 클래스')]
# "추가 방"으로 못 쓰는 것: 전용 층·퀘스트 상태가 있어야 하는 방
NO_USE = {'BlacksmithRoom': '대장장이 퀘스트 전용', 'MineEntrance': '광산 층 전용', 'MineGiantRoom': '광산 층 전용', 'MineLargeRoom': '광산 층 전용',
          'MineSmallRoom': '광산 층 전용', 'MineSecretRoom': '광산 층 전용', 'PitRoom': '윗층의 약한 바닥 방과 짝', 'AmbitiousImpRoom': '임프 퀘스트 전용'}

def name_of(cls):
    if cls in N: return N[cls]
    m = re.match(r'(.+?)(Entrance|Exit)Room$', cls)
    if m and m.group(1) + 'Room' in N:
        b = N[m.group(1) + 'Room']; t = '입구' if m.group(2) == 'Entrance' else '출구'
        return (b[0] + ' · ' + t, b[1] + f' — 층의 {t}(계단)가 있음')
    return (cls, '')

rooms = []
for d, _, fs in os.walk(R):
    for f in sorted(fs):
        if not f.endswith('.java'): continue
        cls = f[:-5]; src = open(os.path.join(d, f), encoding='utf-8').read()
        m = re.search(r'public\s+(abstract\s+)?class\s+' + cls + r'\s+extends\s+(\w+)', src)
        if not m: continue
        rel = os.path.relpath(os.path.join(d, f), R).replace(os.sep, '/')[:-5]
        top = rel.split('/')[0] if '/' in rel else ''
        abstract = bool(m.group(1)) or cls == 'Room'
        vault = rel.startswith('quest/vault')
        if abstract: cat = 'base'
        elif vault: cat = 'vault'
        elif re.search(r'Entrance(Room)?$', cls): cat = 'entrance'
        elif re.search(r'ExitRoom$', cls): cat = 'exit'
        else: cat = top
        nm, desc = name_of(cls)
        why = ''
        if abstract: why = '바탕 클래스'
        elif cls in NO_USE: why = NO_USE[cls]
        elif vault: why = '금고 층 전용'
        elif cat in ('entrance', 'exit'): why = '입구·출구는 층마다 자동으로 하나씩 놓임'
        elif top == 'sewerboss': why = '하수도 보스 층 전용'
        def dim(fn):
            x = re.search(r'int\s+' + fn + r'\s*\(\s*\)\s*\{\s*return\s+(?:Math\.max\(\s*(?:super\.' + fn + r'\(\)\s*,\s*)?)?(\d+)', src)
            return int(x.group(1)) if x else None
        o = {'id': rel.replace('/', '.'), 'cls': cls, 'cat': cat, 'name': nm, 'desc': desc, 'base': m.group(2), 'file': 'levels/rooms/' + rel + '.java'}
        size = {k: v for k, v in (('minW', dim('minWidth')), ('minH', dim('minHeight')), ('maxW', dim('maxWidth')), ('maxH', dim('maxHeight'))) if v}
        if size: o['size'] = size
        if why: o['noUse'] = why
        rooms.append(o)
order = [c for c, _ in CATS]
rooms.sort(key=lambda r: (order.index(r['cat']) if r['cat'] in order else 99, r['name']))
miss = [r['cls'] for r in rooms if r['name'] == r['cls']]
with open(OUT, 'w', encoding='utf-8') as f:
    f.write('/* 자동 생성 — tools/data/extract_spd_rooms.py (게임 levels/rooms 의 방 목록) */\n')
    f.write('PDM.SPD_ROOM_CATS = ' + json.dumps(CATS, ensure_ascii=False) + ';\n')
    f.write('PDM.SPD_ROOMS = [\n' + ',\n'.join(' ' + json.dumps(r, ensure_ascii=False) for r in rooms) + '\n];\n')
print(len(rooms), '개', '· 이름 없음:', miss)
