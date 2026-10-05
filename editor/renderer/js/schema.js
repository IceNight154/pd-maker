// ================================================================
//  스키마 — 타일 · 테마 · 이벤트 명령 · 기본값 만들기
//  (게임 런타임 Java 쪽과 번호/이름이 같아야 하는 것들이 모여 있습니다)
// ================================================================
PDM.FORMAT_VERSION = 1;

// ---------- 타일: SPD Terrain.java 번호 그대로 ----------
// tile = DungeonTileSheet 의 평면(flat) 타일 번호 (tiles_*.png, 16x16, 한 줄 16칸)
PDM.TERRAIN = [
  { id: 1,  key: 'EMPTY',        name: '바닥',          tile: 0,  color: '#5b5346', pass: true },
  { id: 20, key: 'EMPTY_DECO',   name: '장식 바닥',     tile: 1,  color: '#5f5646', pass: true },
  { id: 14, key: 'EMPTY_SP',     name: '특수 바닥',     tile: 4,  color: '#6d6450', pass: true },
  { id: 2,  key: 'GRASS',        name: '풀',            tile: 2,  color: '#3f6b3a', pass: true },
  { id: 15, key: 'HIGH_GRASS',   name: '높은 풀',       tile: 50 + 16, color: '#2f5a2c', pass: true },
  { id: 30, key: 'FURROWED_GRASS', name: '짓밟힌 풀',   tile: 51 + 16, color: '#4a6a3a', pass: true },
  { id: 9,  key: 'EMBERS',       name: '잿불',          tile: 3,  color: '#6b4a3a', pass: true },
  { id: 29, key: 'WATER',        name: '물',            tile: -1, color: '#2d5f86', pass: true },
  { id: 0,  key: 'CHASM',        name: '낭떠러지', tile: 24, color: '#111111', pass: false },
  { id: 4,  key: 'WALL',         name: '벽',            tile: 48, color: '#2b2622', pass: false, blockLight: true },
  { id: 12, key: 'WALL_DECO',    name: '장식 벽',       tile: 49, color: '#30291f', pass: false, blockLight: true },
  { id: 27, key: 'BOOKSHELF',    name: '책장',          tile: 50, color: '#4a3526', pass: false, blockLight: true },
  { id: 5,  key: 'DOOR',         name: '문',            tile: 56, color: '#8a5a2b', pass: true, blockLight: true },
  { id: 6,  key: 'OPEN_DOOR',    name: '열린 문',       tile: 57, color: '#9a6a3b', pass: true },
  { id: 10, key: 'LOCKED_DOOR',  name: '잠긴 문',       tile: 58, color: '#b08a2b', pass: false, blockLight: true },
  { id: 31, key: 'CRYSTAL_DOOR', name: '수정 문',       tile: 59, color: '#6ab0c8', pass: false },
  { id: 16, key: 'SECRET_DOOR',  name: '숨겨진 문',     tile: 48, color: '#3b2f22', pass: false, mark: '?', blockLight: true },
  { id: 13, key: 'BARRICADE',    name: '바리케이드',    tile: 65, color: '#6b4a2b', pass: false, blockLight: true },
  { id: 7,  key: 'ENTRANCE',     name: '입구(올라가는 계단)', tile: 16, color: '#3a7a9a', pass: true },
  { id: 8,  key: 'EXIT',         name: '출구(내려가는 계단)', tile: 17, color: '#9a3a3a', pass: true },
  { id: 21, key: 'LOCKED_EXIT',  name: '잠긴 출구',     tile: 61, color: '#7a2a2a', pass: false },
  { id: 22, key: 'UNLOCKED_EXIT', name: '열린 출구',    tile: 60, color: '#aa4a4a', pass: true },
  { id: 11, key: 'PEDESTAL',     name: '받침대',        tile: 20, color: '#8a8a7a', pass: true },
  { id: 24, key: 'WELL',         name: '우물',          tile: 18, color: '#3a6a8a', pass: true },
  { id: 3,  key: 'EMPTY_WELL',   name: '빈 우물',       tile: 19, color: '#4a5a6a', pass: true },
  { id: 28, key: 'ALCHEMY',      name: '연금술 솥',     tile: 64, color: '#7a4a8a', pass: false },
  { id: 25, key: 'STATUE',       name: '석상',          tile: 72, color: '#7a7a7a', pass: false },
  { id: 26, key: 'STATUE_SP',    name: '특수 석상',     tile: 73, color: '#8a8a9a', pass: false },
  { id: 33, key: 'REGION_DECO',  name: '지역 장식',     tile: 74, color: '#6a5a4a', pass: false },
  { id: 34, key: 'REGION_DECO_ALT', name: '지역 장식 2', tile: 75, color: '#6a5a5a', pass: false },
  { id: 18, key: 'TRAP',         name: '함정',          tile: 0,  color: '#aa2a6a', pass: true, mark: '!' },
  { id: 17, key: 'SECRET_TRAP',  name: '숨겨진 함정',   tile: 0,  color: '#7a2a5a', pass: true, mark: '?' },
  { id: 19, key: 'INACTIVE_TRAP', name: '작동한 함정',  tile: 0,  color: '#5a3a4a', pass: true, mark: 'x' }
];
PDM.TERRAIN_BY_ID = Object.fromEntries(PDM.TERRAIN.map(t => [t.id, t]));

/** 원작 게임 소스 (게임 저장소로 쓸 수 있는 것) */
PDM.SPD_REPO_URL = 'https://github.com/00-Evan/shattered-pixel-dungeon';

// ---------- 테마 ----------
PDM.THEMES = {
  SEWER:  { name: '하수도',       tiles: 'environment/tiles_sewers.png', water: 'environment/water0.png', color: '#3f6b4a', floors: [1, 5] },
  PRISON: { name: '감옥',         tiles: 'environment/tiles_prison.png', water: 'environment/water1.png', color: '#6b6b7a', floors: [6, 10] },
  CAVES:  { name: '동굴',         tiles: 'environment/tiles_caves.png',  water: 'environment/water2.png', color: '#8a6a3c', floors: [11, 15] },
  CITY:   { name: '드워프 도시',  tiles: 'environment/tiles_city.png',   water: 'environment/water3.png', color: '#4f5f8a', floors: [16, 20] },
  HALLS:  { name: '악마의 전당',  tiles: 'environment/tiles_halls.png',  water: 'environment/water4.png', color: '#8a3a3a', floors: [21, 25] }
};
PDM.defaultThemeForDepth = d => d <= 5 ? 'SEWER' : d <= 10 ? 'PRISON' : d <= 15 ? 'CAVES' : d <= 20 ? 'CITY' : 'HALLS';
PDM.BOSS_FLOORS = [5, 10, 15, 20, 25];

PDM.FLOOR_MODES = {
  procedural: { name: '절차 생성', desc: 'SPD 원래 생성기 + 배치 규칙' },
  hybrid:     { name: '혼합', desc: '절차 생성 층 안에 직접 그린 방 끼워 넣기' },
  handmade:   { name: '직접 그리기', desc: '타일을 모두 직접 그린 고정 맵' }
};
PDM.OBJECT_TYPES = {
  npc:   { name: 'NPC',     color: '#5fd6b4', ref: 'character' },
  mob:   { name: '몬스터',  color: '#e05a5a', ref: 'character' },
  item:  { name: '아이템',  color: '#e6b95c', ref: 'item' },
  event: { name: '이벤트',  color: '#a58bff', ref: 'event' },
  prop:  { name: '맵 오브젝트', color: '#c9a36a', ref: 'prop' },
  effect: { name: '이펙트', color: '#ff8fd0', ref: 'effect' },
  plate: { name: '투명 발판', color: '#b48cff', ref: 'event' },
  light: { name: '광원', color: '#ffe08a', ref: null },
  start: { name: '플레이어 스폰 위치', color: '#63b3ed', ref: null },
  entrance: { name: '입구 (투명)', color: '#3aa0c8', ref: null, nodeOnly: true },
  exit: { name: '출구 (투명)', color: '#d05a5a', ref: null, nodeOnly: true }
};
PDM.PLACE_RULES = { xy: '좌표 지정', random: '아무 방', entrance: '입구 방', exit: '출구 방', special: '특수 방' };

// ---------- 캐릭터 / 아이템 ----------
PDM.CHAR_KINDS = { npc: 'NPC', companion: '동료', mob: '몬스터', boss: '보스' };
PDM.AI_MODES = { stand: '제자리', wander: '돌아다님', patrol: '경로 순찰', follow: '플레이어 따라다님', schedule: '일과(턴마다 경로)', hunt: '적대(몬스터)' };
PDM.ANIM_KEYS = ['idle', 'run', 'attack', 'zap', 'die', 'operate'];
/** 영웅 시트에만 있는 기본 동작 (게임 HeroSprite 의 fly · read) · 캐릭터는 fly 만 */
PDM.ANIM_KEYS_HERO = ['idle', 'run', 'attack', 'zap', 'die', 'dead', 'operate', 'fly', 'read'];   // dead = 쓰러진 뒤 이어서 반복 (선택)
PDM.ANIM_KEYS_CHAR = [...PDM.ANIM_KEYS, 'fly'];
PDM.ANIM_NAMES = { idle: '가만히', run: '이동', attack: '공격', zap: '마법(원거리)', die: '쓰러짐', operate: '조작(문·상자)', fly: '날기 (공중부양·점프·날개)', read: '읽기 (주문서)', dead: '쓰러진 뒤 (die 가 끝나면 이어서 반복 · 선택)' };
/** 아이템 분류 — 게임 items 폴더 구조를 따름 (mod-2: 코덱스·그리모어 포함). 재료·선물은 PDMaker 추가 분류
 *  dir: 게임 폴더, subs: 세부 종류, use: "사용" 버튼 이름, consumable: 사용하면 1개 사라짐, kind: 게임 동작(무기·갑옷 상속) 추천 */
PDM.ITEM_CATEGORY_INFO = {
  weapon:   { name: '무기', icon: '⚔', dir: 'weapon', subs: { melee: '근거리 무기', ranged: '원거리 무기', missile: '투척 무기', dart: '다트' }, kind: 'melee' },
  codex:    { name: '코덱스 (마법 무기)', icon: '📖', dir: 'weapon/codices', subs: { melee: '근거리 코덱스', ranged: '원거리 코덱스', cast: '시전 코덱스' }, note: 'mod-2' },
  armor:    { name: '방어구', icon: '⛨', dir: 'armor', subs: { armor: '갑옷', class: '직업 갑옷' }, kind: 'armor' },
  artifact: { name: '아티팩트', icon: '✦', dir: 'artifacts' },
  ring:     { name: '반지', icon: '💍', dir: 'rings' },
  wand:     { name: '마법봉', icon: '🪄', dir: 'wands' },
  potion:   { name: '물약', icon: '⚗', dir: 'potions', subs: { '': '일반', exotic: '특이 물약', brew: '양조', elixir: '엘릭서' }, use: '마시기', consumable: true },
  scroll:   { name: '주문서', icon: '📜', dir: 'scrolls', subs: { '': '일반', exotic: '특이 주문서' }, use: '읽기', consumable: true },
  stone:    { name: '룬석', icon: '◈', dir: 'stones', use: '사용', consumable: true },
  spell:    { name: '마법 (연금)', icon: '✧', dir: 'spells', use: '시전', consumable: true },
  bomb:     { name: '폭탄', icon: '💣', dir: 'bombs', use: '사용', consumable: true },
  food:     { name: '음식', icon: '🍖', dir: 'food', use: '먹기', consumable: true },
  bag:      { name: '가방', icon: '🎒', dir: 'bags', subs: { '': '가방', grimoire: '그리모어 (mod-2)' } },
  key:      { name: '열쇠', icon: '🔑', dir: 'keys' },
  quest:    { name: '퀘스트', icon: '❗', dir: 'quest' },
  trinket:  { name: '장신구', icon: '🔹', dir: 'trinkets' },
  journal:  { name: '문서·페이지', icon: '📃', dir: 'journal', use: '읽기' },
  remains:  { name: '유품', icon: '🪦', dir: 'remains' },
  material: { name: '재료', icon: '🌿', dir: '', note: 'PDMaker' },
  gift:     { name: '선물', icon: '🎁', dir: '', note: 'PDMaker' },
  misc:     { name: '기타', icon: '•', dir: '(items 폴더 바로 아래: 앙크·이슬·횃불·물주머니 등)' }
};
PDM.ITEM_CATEGORIES = Object.fromEntries(Object.entries(PDM.ITEM_CATEGORY_INFO).map(([k, v]) => [k, v.name]));
/** 지금 프로젝트의 게임 저장소가 mod-2 인지 (app 이 저장소를 찾을 때 PDM.gameMod2 를 정함 — 모르면 원작으로 봄)
 *  원작(game/shattered-pixel-dungeon-master) 프로젝트에서는 mod-2 전용 분류·종류·직업·소리를 목록에서 뺌 */
PDM.isMod2 = () => PDM.gameMod2 === true;
PDM.itemCategories = () => Object.fromEntries(Object.entries(PDM.ITEM_CATEGORY_INFO).filter(([, v]) => PDM.isMod2() || v.note !== 'mod-2').map(([k, v]) => [k, v.name]));
/** 분류의 세부 종류 = 기본(schema) + 프로젝트에서 더하거나 이름을 바꾼 것 (project.itemSubs[분류][키] = 이름, null = 숨김) */
PDM.itemSubs = cat => {
  const info = PDM.ITEM_CATEGORY_INFO[cat] || {};
  const base = Object.assign({}, info.subs || {});
  if (!PDM.isMod2()) delete base.grimoire;
  const custom = (((PDM.store && PDM.store.isOpen && PDM.store.get('project')) || {}).itemSubs || {})[cat] || {};
  Object.entries(custom).forEach(([k, v]) => { if (v === null) delete base[k]; else base[k] = v; });
  if (!Object.keys(base).length) return null;
  let out = !info.subs && base[''] === undefined ? Object.assign({ '': '일반' }, base) : base;   // 세부 종류가 없던 분류에 더했으면 "일반"도
  // 순서: 리소스 목록에서 옮긴 순서 (project.itemSubOrder[분류])
  const ord = (((PDM.store && PDM.store.isOpen && PDM.store.get('project')) || {}).itemSubOrder || {})[cat];
  if (ord && ord.length) { const ks = Object.keys(out); ks.sort((x, y) => (ord.indexOf(x) < 0 ? 1000 + ks.indexOf(x) : ord.indexOf(x)) - (ord.indexOf(y) < 0 ? 1000 + ks.indexOf(y) : ord.indexOf(y))); out = Object.fromEntries(ks.map(k => [k, out[k]])); }
  return out;
};
PDM.itemKinds = () => Object.fromEntries(Object.entries(PDM.ITEM_KINDS).filter(([k]) => PDM.isMod2() || !['codex', 'grimoire'].includes(k)));
PDM.heroClasses = () => Object.fromEntries(Object.entries(PDM.HERO_CLASSES).filter(([k]) => PDM.isMod2() || k !== 'ARIA'));
PDM.gameSubclasses = () => Object.fromEntries(Object.entries(PDM.GAME_SUBCLASSES).filter(([k]) => PDM.isMod2() || !k.startsWith('ARIA_')));
PDM.BEHAVIOR_HOOKS = { onSpawn: '생성될 때', onInteract: '말을 걸었을 때', onSeeHero: '플레이어를 봤을 때', onTurn: '매 턴', onDamaged: '공격받았을 때', onDeath: '쓰러졌을 때' };

// ---------- 이벤트 ----------
PDM.TRIGGERS = {
  action: '조사(말 걸기)', touch: '밟았을 때', auto: '자동 실행 (조건이 맞으면 한 번)', parallel: '병렬 (매 턴)',
  floorEnter: '층에 들어올 때', turn: 'N 턴마다', heart: '마음 조건 만족 시', itemPickup: '아이템 주웠을 때',
  mobKilled: '몬스터 처치 시', bossDefeated: '보스 처치 시', none: '없음(호출 전용)'
};
PDM.EVENT_KINDS = { common: '커먼 이벤트', scene: '장면(연출)', milestone: '이정표 이벤트', daily: '층 이벤트(데일리)' };

// 명령 정의: params 의 type → 편집 화면 입력칸 종류
//  text | textarea | number | bool | select | char | charHero | item | event | switch | var | floor | image | face | cond | options | theme | ending | heartStat | sound
/** 스토리 변수의 형식: number | string | bool */
PDM.varTypeOf = id => ((((PDM.store.get('story') || {}).variables || []).find(v => v.id === id) || {}).type) || 'number';
// 이동 경로 명령 (RPG Maker 의 이동 루트 설정에 해당). p = 추가로 정하는 값 [키, 라벨, 종류, 기본값]
PDM.ROUTE_OPS = [
  ['이동', [['down', '아래로 이동'], ['left', '왼쪽으로 이동'], ['right', '오른쪽으로 이동'], ['up', '위로 이동'], ['dl', '왼쪽 아래로 이동'], ['dr', '오른쪽 아래로 이동'], ['ul', '왼쪽 위로 이동'], ['ur', '오른쪽 위로 이동'],
    ['random', '무작위로 이동'], ['toward', '영웅에게 다가가기'], ['away', '영웅에게서 멀어지기'], ['forward', '한 걸음 앞으로'], ['backward', '한 걸음 뒤로'],
    ['jump', '뛰어넘기…', [['x', 'x 만큼', 'number', 0], ['y', 'y 만큼', 'number', 0]]], ['goto', '칸으로 걸어가기…', [['x', 'x 좌표', 'number', 0], ['y', 'y 좌표', 'number', 0]]], ['wait', '대기…', [['n', '시간(0.1초)', 'number', 10]]]]],
  ['방향', [['turnDown', '아래를 봄'], ['turnLeft', '왼쪽을 봄'], ['turnRight', '오른쪽을 봄'], ['turnUp', '위를 봄'], ['turnR90', '오른쪽으로 90°'], ['turnL90', '왼쪽으로 90°'], ['turn180', '뒤돌기 (180°)'],
    ['turnRandom', '무작위 방향'], ['turnToward', '영웅 쪽을 봄'], ['turnAway', '영웅 반대쪽을 봄'],
    ['switchOn', '스위치 켜기…', [['id', '스위치', 'switch', '']]], ['switchOff', '스위치 끄기…', [['id', '스위치', 'switch', '']]], ['speed', '이동 속도 바꾸기…', [['n', '속도 1(느림)~6(빠름)', 'number', 4]]]]],
  ['상태', [['dirFixOn', '방향 고정 켜기'], ['dirFixOff', '방향 고정 끄기'], ['throughOn', '통과 켜기 (벽 · 장애물 무시)'], ['throughOff', '통과 끄기'], ['transparentOn', '투명 켜기'], ['transparentOff', '투명 끄기'],
    ['opacity', '불투명도 바꾸기…', [['n', '불투명도 0~255', 'number', 255]]], ['se', '효과음 재생…', [['file', '소리', 'sound', '']]]]]
];
PDM.ROUTE_OP = {}; PDM.ROUTE_OPS.forEach(([, l]) => l.forEach(([id, name, ps]) => { PDM.ROUTE_OP[id] = { name: name.replace('…', ''), params: ps || [] }; }));
PDM.routeOpText = o => { const d = PDM.ROUTE_OP[o.op]; if (!d) return o.op || '?'; const v = d.params.map(([k]) => o[k]).filter(x => x !== undefined && x !== ''); return d.name + (v.length ? ' ' + v.join(', ') : ''); };
PDM.COMMANDS = {
  text:      { g: '메시지', name: '대사 표시', params: [
                 { k: 'speaker', t: 'charHero', label: '화자' }, { k: 'face', t: 'face', label: '표정' },
                 { k: 'illust', t: 'image', label: '일러스트(선택 — 비우면 캐릭터 초상화)' },
                 { k: 'side', t: 'select', label: '일러스트 위치 (기본 = 대사창 설정)', options: { left: '왼쪽', right: '오른쪽', none: '이번엔 숨김' } },
                 { k: 'name', t: 'text', label: '이름 바꾸기(선택 — 예: ???)' }, { k: 'text', t: 'textarea', label: '대사' }],
               sum: c => `${c.speaker ? '[' + PDM.refName('character', c.speaker) + (c.face ? ':' + c.face : '') + '] ' : ''}${(c.text || '').replace(/\n/g, ' ')}` },
  choice:    { g: '메시지', name: '선택지', block: 'branches', params: [{ k: 'options', t: 'options', label: '선택지' }],
               sum: c => '선택: ' + (c.options || []).join(' / ') },
  topic:     { g: '메시지', name: '대사 토픽 말하기', params: [{ k: 'char', t: 'char', label: '캐릭터' }, { k: 'topic', t: 'topic', label: '토픽' }],
               sum: c => `${PDM.refName('character', c.char)} 의 「${c.topic || '?'}」 대사` },
  notice:    { g: '메시지', name: '알림 문구', params: [{ k: 'text', t: 'text', label: '문구' }, { k: 'color', t: 'select', label: '색', options: { normal: '보통', good: '좋음', bad: '나쁨', warn: '경고' } }],
               sum: c => '알림: ' + (c.text || '') },
  if:        { g: '흐름', name: '조건 분기', block: 'ifelse', params: [{ k: 'cond', t: 'cond', label: '조건' }], sum: c => '만약 ' + (c.cond || '(항상)') },
  loop:      { g: '흐름', name: '반복', block: 'body', params: [{ k: 'times', t: 'number', label: '횟수(0=중단까지)' }], sum: c => `반복 ${c.times || '∞'}` },
  break:     { g: '흐름', name: '반복 중단', params: [], sum: () => '반복 중단' },
  wait:      { g: '흐름', name: '대기', params: [{ k: 'turns', t: 'number', label: '시간(0.1초 단위)' }], sum: c => `대기 ${c.turns || 0}` },
  call:      { g: '흐름', name: '커먼 이벤트 호출', params: [{ k: 'event', t: 'event', label: '이벤트' }], sum: c => '호출: ' + PDM.refName('event', c.event) },
  label:     { g: '흐름', name: '이름표', params: [{ k: 'name', t: 'text', label: '이름' }], sum: c => `◈ 이름표: ${c.name || ''}` },
  jump:      { g: '흐름', name: '이름표로 건너뛰기', params: [{ k: 'name', t: 'text', label: '이름표 이름 (같은 목록이나 바깥 목록에 있는 것)' }], sum: c => `→ 이름표 「${c.name || ''}」 로` },
  stop:      { g: '흐름', name: '이벤트 중지', params: [], sum: () => '이벤트 중지' },
  global:    { g: '데이터', name: '전역 스위치 (새 게임에도 유지)', params: [{ k: 'key', t: 'text', label: '이름 (영문)' }, { k: 'value', t: 'bool', label: '켜기' }],
               sum: c => `전역 스위치 ${c.key || '?'} = ${c.value === false ? '끔' : '켬'}  (조건식 global.${c.key || '이름'} · 영웅 해금)` },
  switch:    { g: '데이터', name: '스위치', params: [{ k: 'id', t: 'switch', label: '스위치' }, { k: 'value', t: 'bool', label: '켜기' }],
               sum: c => `스위치 ${PDM.refName('switch', c.id)} = ${c.value ? '켬' : '끔'}` },
  var:       { g: '데이터', name: '변수', params: [{ k: 'id', t: 'var', label: '변수' }, { k: 'op', t: 'select', label: '연산', options: { set: '= (넣기)', add: '+= (더하기 · 문자열은 뒤에 붙이기)', sub: '-=', mul: '×=', div: '÷=', mod: '나머지 =', toggle: '뒤집기 (참/거짓 변수)' } },
                 { k: 'src', t: 'select', label: '넣을 값', options: { rand: '무작위 (최소 ~ 값)', ref: '다른 값 (아래 이름)' } }, { k: 'value', t: 'number', label: '값 (무작위면 최대 · 참/거짓 변수는 1 = 참, 0 = 거짓)' }, { k: 'text', t: 'text', label: '글자 (문자열 변수일 때 — {var.id} 같은 이름을 넣을 수 있음)' }, { k: 'min', t: 'number', label: '최소 (무작위일 때)' },
                 { k: 'ref', t: 'text', label: '다른 값 이름 (예: var.score · gold · hero.hp · hero.lvl · item.아이템id · depth · turns)' }],
               sum: c => `변수 ${PDM.refName('var', c.id)} ${({ set: '=', add: '+=', sub: '-=', mul: '×=', div: '÷=', mod: '%=' })[c.op || 'set']} ${c.op === 'toggle' ? '' : c.src === 'rand' ? `무작위(${c.min || 0}~${c.value ?? 0})` : c.src === 'ref' ? (c.ref || '?') : PDM.varTypeOf(c.id) === 'string' ? JSON.stringify(c.text || '') : PDM.varTypeOf(c.id) === 'bool' ? (c.value || c.text === 'true' ? '참' : '거짓') : (c.value ?? 0)}`.replace('undefined', '뒤집기') },
  self:      { g: '데이터', name: '셀프 스위치', params: [{ k: 'key', t: 'select', label: '스위치', options: { A: 'A', B: 'B', C: 'C', D: 'D' } }, { k: 'value', t: 'bool', label: '켜기' }],
               sum: c => `셀프 ${c.key || 'A'} = ${c.value ? '켬' : '끔'}` },
  heart:     { g: '마음', name: '마음 수치 변경', params: [{ k: 'char', t: 'char', label: '캐릭터' }, { k: 'stat', t: 'heartStat', label: '수치' }, { k: 'value', t: 'number', label: '더할 값' }],
               sum: c => `${PDM.refName('character', c.char)} ${PDM.T(c.stat || 'rel.favor')} ${c.value >= 0 ? '+' : ''}${c.value || 0}` },
  action:    { g: '마음', name: '행동 적용(행동표)', params: [{ k: 'char', t: 'char', label: '캐릭터' }, { k: 'action', t: 'heartAction', label: '행동' }, { k: 'say', t: 'bool', label: '결과 대사 말하기' }],
               sum: c => `${PDM.refName('character', c.char)} ← 행동 「${PDM.heartActionName(c.action)}」${c.say ? ' (+대사)' : ''}` },
  heartMenu: { g: '마음', name: '말 걸기 메뉴 열기', params: [{ k: 'char', t: 'char', label: '캐릭터' }], sum: c => `${PDM.refName('character', c.char)} 말 걸기 메뉴 (대화·칭찬·사과·부탁…)` },
  request:   { g: '마음', name: '부탁하기 (들어주면/거절하면)', block: 'ifelse', params: [{ k: 'char', t: 'char', label: '캐릭터' }, { k: 'request', t: 'heartRequest', label: '부탁' }],
               sum: c => `${PDM.refName('character', c.char)} 에게 부탁 「${(((PDM.store.get('heart') || {}).requests || []).find(r => r.key === c.request) || {}).name || c.request || '?'}」` },
  showHeart: { g: '마음', name: '마음 창 열기', params: [{ k: 'char', t: 'char', label: '캐릭터(비우면 최근)' }], sum: c => `마음 창 열기${c.char ? ' — ' + PDM.refName('character', c.char) : ''}` },
  memory:    { g: '마음', name: '기억 기록', params: [{ k: 'char', t: 'char', label: '캐릭터' }, { k: 'key', t: 'text', label: '기억 키' }],
               sum: c => `${PDM.refName('character', c.char)} 기억: ${c.key || ''}` },
  illust:    { g: '연출', name: '일러스트 표시', params: [{ k: 'slot', t: 'number', label: '번호(1~8)' }, { k: 'image', t: 'image', label: '이미지' },
                 { k: 'pos', t: 'select', label: '위치', options: { left: '왼쪽', center: '가운데', right: '오른쪽', full: '전체 화면' } }, { k: 'fade', t: 'number', label: '페이드(0.1초)' }],
               sum: c => `일러스트 #${c.slot || 1}: ${c.image || '(없음)'} (${c.pos || 'center'})` },
  illustHide:{ g: '연출', name: '일러스트 숨김', params: [{ k: 'slot', t: 'number', label: '번호(0=전부)' }, { k: 'fade', t: 'number', label: '페이드(0.1초)' }], sum: c => `일러스트 숨김 #${c.slot || '전부'}` },
  quest:     { g: '데이터', name: '퀘스트 (수주 창 · 수락 · 완료 · 포기)', params: [{ k: 'id', t: 'quest', label: '퀘스트' }, { k: 'op', t: 'select', label: '동작', options: { offer: '수주 창 띄우기 (수락 / 거절)', accept: '바로 수락', complete: '완료 처리 (보상 지급)', abandon: '포기', reset: '처음 상태로 (다시 받을 수 있게)' } }], sum: c => `퀘스트 ${({ offer: '수주 창', accept: '수락', complete: '완료', abandon: '포기', reset: '초기화' })[c.op || 'offer']}: ${(((PDM.store.get('quests') || {}).list || []).find(x => x.id === c.id) || {}).name || c.id || '?'}` },
  questLog:  { g: '데이터', name: '퀘스트 목록 창 열기', params: [], sum: () => '퀘스트 목록 창' },
  relocate:  { g: '캐릭터', name: 'NPC 이주 (지정한 맵의 지정한 칸에서 살게 함)', params: [{ k: 'char', t: 'char', label: '캐릭터 (비우면 말을 건 캐릭터)' }, { k: 'node', t: 'node', label: '이주할 맵 (비우면 사라짐)' }, { k: 'x', t: 'cell', yk: 'y', nodeKey: 'node', label: '칸 (맵을 보면서 고를 수 있음)', pickTitle: 'NPC 가 살 칸 고르기' }], sum: c => `이주: ${c.char ? PDM.refName('char', c.char) : '말을 건 캐릭터'} → ${c.node ? `「${PDM.refName('node', c.node)}」 (${c.x ?? 0}, ${c.y ?? 0})` : '사라짐'}` },
  shop:      { g: '월드', name: '상인 창 열기 (사고팔기)', params: [{ k: 'char', t: 'char', label: '상인 캐릭터 (비우면 말을 건 캐릭터) — 캐릭터 편집 화면의 "상인 기능"에 파는 물건을 정합니다' }], sum: c => `상인 창: ${c.char ? PDM.refName('char', c.char) : '말을 건 캐릭터'}` },
  badge:     { g: '데이터', name: '배지 주기 (업적)', params: [{ k: 'id', t: 'badge', label: '배지' }], sum: c => `배지: ${(((PDM.store.get('badges') || {}).list || []).find(x => x.id === c.id) || {}).name || c.id || '?'}` },
  badgeList: { g: '데이터', name: '배지 목록 창 열기', params: [], sum: () => '배지 목록 창' },
  trailer:   { g: '연출', name: '예고편 컷신 재생', params: [{ k: 'id', t: 'trailer', label: '예고편 컷신' }, { k: 'nowait', t: 'bool', label: '끝나기를 기다리지 않음' }],
               sum: c => `예고편 컷신: ${(((PDM.store.get('trailers') || {}).list || []).find(x => x.id === c.id) || {}).name || c.id || '?'}` },
  filter:    { g: '연출', name: '화면 필터', params: [{ k: 'mode', t: 'select', label: '동작', options: { set: '이 필터로 바꾸기', map: '맵 설정대로 되돌리기', off: '필터 끄기' } }, { k: 'id', t: 'filter', label: '필터 (바꾸기일 때)' }],
               sum: c => c.mode === 'map' ? '화면 필터: 맵 설정대로' : c.mode === 'off' ? '화면 필터: 끄기' : `화면 필터: ${(((PDM.store.get('filters') || {}).list || []).find(x => x.id === c.id) || {}).name || c.id || '?'}` },
  shake:     { g: '연출', name: '화면 흔들림', params: [{ k: 'power', t: 'number', label: '세기' }, { k: 'time', t: 'number', label: '시간(0.1초)' }], sum: c => `흔들림 ${c.power || 3}` },
  effect:    { g: '연출', name: '이펙트 재생', params: [{ k: 'fx', t: 'effect', label: '이펙트' }, { k: 'at', t: 'select', label: '위치', options: { char: '캐릭터 위치', xy: '칸 좌표' } },
               { k: 'target', t: 'charHero', label: '캐릭터 (위치가 캐릭터일 때)' }, { k: 'x', t: 'number', label: 'x (칸 좌표일 때)' }, { k: 'y', t: 'number', label: 'y' }],
               sum: c => `이펙트: ${(((PDM.store.get('effects') || {}).list || []).find(x => x.id === c.fx) || {}).name || c.fx || '?'} @ ${c.at === 'xy' ? `(${c.x || 0}, ${c.y || 0})` : (!c.target || c.target === '$hero' ? '영웅' : PDM.refName('char', c.target))}` },
  textfx:    { g: '연출', name: '글자 연출 표시', params: [{ k: 'fx', t: 'textfx', label: '글자 연출' }, { k: 'pos', t: 'select', label: '위치', options: { center: '가운데', top: '위', bottom: '아래' } },
               { k: 'width', t: 'number', label: '크기 (화면 너비 %, 기본 80)' }, { k: 'loops', t: 'number', label: '반복 횟수 (기본 1)' }, { k: 'nowait', t: 'bool', label: '기다리지 않고 바로 다음 명령으로' }],
               sum: c => `글자 연출: ${(((PDM.store.get('textfx') || {}).list || []).find(x => x.id === c.fx) || {}).name || c.fx || '?'}${c.nowait ? ' (기다리지 않음)' : ''}` },
  flash:     { g: '연출', name: '화면 번쩍임', params: [{ k: 'color', t: 'text', label: '색(#rrggbb)' }, { k: 'time', t: 'number', label: '시간(0.1초)' }], sum: c => `번쩍임 ${c.color || '#ffffff'}` },
  fade:      { g: '연출', name: '화면 어둡게 / 밝게', params: [{ k: 'op', t: 'select', label: '무엇을', options: { out: '어둡게 (페이드 아웃)', in: '밝게 (페이드 인)' } }, { k: 'time', t: 'number', label: '시간(0.1초)' }, { k: 'color', t: 'text', label: '색(#rrggbb, 기본 검정)' }, { k: 'wait', t: 'bool', label: '끝날 때까지 대기' }],
               sum: c => `화면 ${c.op === 'in' ? '밝게' : '어둡게'} (${(c.time ?? 5) / 10}초)` },
  face:      { g: '연출', name: '표정 바꾸기', params: [{ k: 'char', t: 'char', label: '캐릭터' }, { k: 'face', t: 'face', label: '표정' }], sum: c => `${PDM.refName('character', c.char)} 표정 → ${c.face || '기본'}` },
  sound:     { g: '연출', name: '효과음/음악', params: [{ k: 'kind', t: 'select', label: '종류', options: { se: '효과음', bgm: '배경음' } }, { k: 'file', t: 'sound', label: '소리 (사운드 편집기 목록 · 게임 소리)' }], sum: c => `${c.kind === 'bgm' ? '배경음' : '효과음'} ${PDM.audio ? PDM.audio.label(c.file) : c.file || ''}` },
  anim:      { g: '캐릭터', name: '애니메이션 재생', params: [{ k: 'target', t: 'charHero', label: '대상' }, { k: 'anim', t: 'text', label: '애니메이션 이름 (idle·attack·fly… 또는 시트에서 만든 추가 애니메이션)' }],
               sum: c => `${c.target === '$hero' || !c.target ? '영웅' : PDM.refName('character', c.target)} 애니메이션 「${c.anim || '?'}」` },
  move:      { g: '캐릭터', name: '이동 경로 설정', params: [{ k: 'char', t: 'charHero', label: '대상 (비우면 영웅)' }, { k: 'route', t: 'route', label: '이동 명령 (오른쪽 버튼을 누르면 왼쪽 목록에 추가)' }],
               sum: c => `${!c.char || c.char === '$hero' ? '영웅' : PDM.refName('character', c.char)} 이동: ${(c.route || []).map(PDM.routeOpText).join(' → ').slice(0, 90) || c.path || '(비어 있음)'}${c.repeat ? ' ↻ 반복' : c.wait === false ? ' (기다리지 않음)' : ''}` },
  teleport:  { g: '캐릭터', name: '순간 이동 (같은 맵)', params: [{ k: 'char', t: 'charHero', label: '대상 (비우면 영웅)' }, { k: 'x', t: 'cell', yk: 'y', label: '칸 (이벤트가 실행되는 맵 기준 — 맵을 보면서 고를 수 있음)', pickTitle: '옮길 칸 고르기' }],
               sum: c => `${!c.char || c.char === '$hero' ? '영웅' : PDM.refName('character', c.char)} 순간 이동 (${c.x || 0}, ${c.y || 0})` },
  spawn:     { g: '캐릭터', name: '캐릭터 소환', params: [{ k: 'char', t: 'char', label: '캐릭터' }, { k: 'x', t: 'cell', yk: 'y', label: '칸 (이벤트가 실행되는 맵 기준 — 맵을 보면서 고를 수 있음)', pickTitle: '소환할 칸 고르기' }], sum: c => `소환 ${PDM.refName('character', c.char)} (${c.x ?? 0},${c.y ?? 0})` },
  despawn:   { g: '캐릭터', name: '캐릭터 제거', params: [{ k: 'char', t: 'char', label: '캐릭터' }], sum: c => `제거 ${PDM.refName('character', c.char)}` },
  party:     { g: '캐릭터', name: '동료 합류/이탈', params: [{ k: 'char', t: 'char', label: '캐릭터' }, { k: 'join', t: 'bool', label: '합류' }], sum: c => `${PDM.refName('character', c.char)} ${c.join ? '합류 (영웅을 따라다님 · 층을 옮겨도 함께)' : '이탈 (그 자리에 남음)'}` },
  gold:      { g: '영웅', name: '금화 늘리기/줄이기', params: [{ k: 'value', t: 'number', label: '더할 금화 (음수 = 빼기)' }, { k: 'quiet', t: 'bool', label: '알림 없이' }], sum: c => `금화 ${c.value >= 0 ? '+' : ''}${c.value || 0}` },
  hp:        { g: '영웅', name: '체력 바꾸기', params: [{ k: 'op', t: 'select', label: '방식', options: { add: '더하기 (음수 = 피해)', set: '정하기', pct: '최대 체력의 % 만큼 더하기', full: '모두 회복' } }, { k: 'value', t: 'number', label: '값' },
                 { k: 'kill', t: 'bool', label: '0 이하가 되면 사망 (끄면 1 에서 멈춤)' }, { k: 'text', t: 'text', label: '사망 원인 문구 (선택)' }],
               sum: c => c.op === 'full' ? '체력 모두 회복' : `체력 ${c.op === 'set' ? '=' : (c.value >= 0 ? '+' : '')}${c.value || 0}${c.op === 'pct' ? '%' : ''}${c.kill ? ' (사망 가능)' : ''}` },
  buff:      { g: '영웅', name: '상태(버프) 걸기/풀기', params: [{ k: 'char', t: 'charHero', label: '대상 (비우면 영웅)' }, { k: 'buff', t: 'select', label: '상태', get options() { return PDM.SPD_BUFFS || {}; } }, { k: 'turns', t: 'number', label: '턴' }, { k: 'remove', t: 'bool', label: '풀기 (걸려 있는 것을 없앰)' }],
               sum: c => `${!c.char || c.char === '$hero' ? '영웅' : PDM.refName('character', c.char)} 상태 ${(PDM.SPD_BUFFS || {})[c.buff] || c.buff || '?'} ${c.remove ? '풀기' : (c.turns || 5) + '턴'}` },
  exp:       { g: '영웅', name: '경험치 · 레벨 · 힘', params: [{ k: 'op', t: 'select', label: '무엇을', options: { exp: '경험치 더하기', level: '레벨 올리기', str: '힘 더하기', maxhp: '최대 체력 더하기' } }, { k: 'value', t: 'number', label: '값' }],
               sum: c => `${({ exp: '경험치', level: '레벨', str: '힘', maxhp: '최대 체력' })[c.op || 'exp']} +${c.value || 0}` },
  heroPath:  { g: '영웅', name: '전직 · 직업 능력 고르기', params: [{ k: 'what', t: 'select', label: '무엇을', options: { subclass: '전직 고르기 (텐구의 가면 없이)', ability: '직업 능력 고르기 (왕관 없이 — 갑옷을 입고 있어야 함)' } }],
               sum: c => c.what === 'ability' ? '직업 능력 고르기 창' : '전직 고르기 창' },
  heroGauge: { g: '영웅', name: '게이지 · 원소 바꾸기', params: [{ k: 'op', t: 'select', label: '무엇을', options: { add: '게이지 더하기', set: '게이지 정하기', element: '원소 바꾸기' } },
                 { k: 'value', t: 'number', label: '값' }, { k: 'element', t: 'text', label: '원소 id (원소 바꾸기)' }],
               sum: c => c.op === 'element' ? `원소 → ${c.element || '?'}` : `게이지 ${c.op === 'set' ? '=' : (c.value >= 0 ? '+' : '')}${c.value || 0}` },
  spellCharge: { g: '영웅', name: '주문서 충전', params: [{ k: 'value', t: 'number', label: '더할 충전 (크게 = 가득)' }], sum: c => `주문서 충전 +${c.value || 0}` },
  giveItem:  { g: '월드', name: '아이템 주기/빼기', params: [{ k: 'item', t: 'item', label: '아이템' }, { k: 'count', t: 'number', label: '개수(음수=빼기)' }], sum: c => `아이템 ${PDM.refName('item', c.item)} ${c.count >= 0 ? '+' : ''}${c.count ?? 1}` },
  tile:      { g: '월드', name: '타일 바꾸기', params: [{ k: 'x', t: 'number', label: 'x' }, { k: 'y', t: 'number', label: 'y' }, { k: 'terrain', t: 'terrain', label: '타일' }], sum: c => `타일 (${c.x ?? 0},${c.y ?? 0}) → ${(PDM.TERRAIN_BY_ID[c.terrain] || {}).name || '?'}` },
  transfer:  { g: '월드', name: '맵 이동', params: [{ k: 'node', t: 'node', label: '맵(노드)' }, { k: 'x', t: 'cell', yk: 'y', nodeKey: 'node', label: '도착할 칸 (선택 — 맵을 보면서 고를 수 있음)', pickTitle: '도착할 칸 고르기' }], sum: c => `「${PDM.refName('node', c.node)}」 으로 이동` },
  route:     { g: '스토리', name: '루트 설정', params: [{ k: 'route', t: 'route', label: '루트' }], sum: c => `루트 → ${PDM.refName('route', c.route)}` },
  ending:    { g: '스토리', name: '엔딩 실행', params: [{ k: 'ending', t: 'ending', label: '엔딩(비우면 조건으로 자동)' }], sum: c => `엔딩: ${c.ending ? PDM.refName('ending', c.ending) : '(조건으로 결정)'}` },
  gameOver:  { g: '스토리', name: '게임 오버', params: [{ k: 'text', t: 'text', label: '문구 (사망 원인)' }], sum: c => '게임 오버 (영웅 사망 처리 · 부활 없음)' + (c.text ? ' — ' + c.text : '') },
  victory:   { g: '스토리', name: '게임 클리어 (승리)', params: [], sum: () => '게임 클리어 — 승리 기록을 남기고 랭킹 화면으로 (세이브 삭제)' },
  title:     { g: '스토리', name: '타이틀로 돌아가기', params: [], sum: () => '저장하고 타이틀 화면으로' },
  plugin:    { g: '확장', name: '플러그인 명령', params: [{ k: 'command', t: 'text', label: '명령 id' }, { k: 'args', t: 'textarea', label: '인자(JSON)' }], sum: c => `플러그인: ${c.command || ''}` },
  comment:   { g: '확장', name: '메모', params: [{ k: 'text', t: 'textarea', label: '메모' }], sum: c => '# ' + (c.text || '') }
};

// ---------- 참조 이름 표시 도우미 ----------
PDM.refName = function (kind, id) {
  if (!id) return '(없음)';
  const s = PDM.store; if (!s) return id;
  try {
    if (kind === 'character') { if (id === '$hero') return '플레이어'; const c = s.get('char:' + id); return c ? c.name || id : `⚠${id}`; }
    if (kind === 'item') { const c = s.get('item:' + id); return c ? c.name || id : `⚠${id}`; }
    if (kind === 'event') { const c = s.get('event:' + id); return c ? c.name || id : `⚠${id}`; }
    if (kind === 'node') { return PDM.World.node(id) ? PDM.World.fullName(id) : `⚠${id}`; }
    if (kind === 'room') { const c = s.get('room:' + id); return c ? c.name || id : `⚠${id}`; }
    if (kind === 'hero') { const c = s.get('hero:' + id); return c ? c.name || id : `⚠${id}`; }
    if (kind === 'group') { const g = PDM.World.group(id); return g ? g.name : `⚠${id}`; }
    const st = s.get('story') || {};
    if (kind === 'switch') { const v = (st.switches || []).find(x => x.id === id); return v ? v.name || id : `⚠${id}`; }
    if (kind === 'var') { const v = (st.variables || []).find(x => x.id === id); return v ? v.name || id : `⚠${id}`; }
    if (kind === 'route') { const v = (st.routes || []).find(x => x.id === id); return v ? v.name || id : `⚠${id}`; }
    if (kind === 'ending') { const v = (st.endings || []).find(x => x.id === id); return v ? v.name || id : `⚠${id}`; }
  } catch (_) { /* 무시 */ }
  return id;
};
PDM.heartActionName = function (key) {
  const h = PDM.store && PDM.store.get('heart');
  const a = h && (h.actions || []).find(x => x.key === key);
  return a ? a.name : (key || '?');
};

// ---------- 기본값 만들기 ----------
PDM.make = {
  floor(depth) {
    const boss = false;
    return { format: 'pdmaker-floor', version: PDM.FORMAT_VERSION, depth, mode: boss ? 'procedural' : 'procedural',
      theme: '', name: '', size: { w: 32, h: 32 },
      procedural: { sizeScale: 1, standardRooms: [4, 6], specialRooms: 1, mobCap: 0, feeling: 'any', keepBoss: boss },
      layers: { terrain: [] }, objects: [], onEnter: '', note: '' };
  },
  character(id, kind) {
    return { format: 'pdmaker-character', version: PDM.FORMAT_VERSION, id, kind: kind || 'npc', name: '새 캐릭터', title: '', desc: '',
      sprite: { sheet: '', frame: [12, 15], anims: { idle: { frames: [0, 0, 0, 1], fps: 1, loop: true }, run: { frames: [2, 3, 4, 5], fps: 20, loop: true }, attack: { frames: [6, 7, 8], fps: 15, loop: false }, die: { frames: [9, 10, 11], fps: 12, loop: false } } },
      portrait: { default: '', expressions: [] },
      stats: { hp: 20, attackMin: 1, attackMax: 4, defense: 0, accuracy: 10, evasion: 5, speed: 1 },
      ai: { mode: kind === 'mob' ? 'hunt' : 'stand', path: [], wait: 3 },
      heart: { enabled: kind === 'npc' || kind === 'companion', traits: [], likes: [], dislikes: [], initial: { favor: 0, trust: 0 } },
      behaviors: {}, dialogue: { greet: [{ when: '', face: '', text: '안녕하세요.' }] } };
  },
  /** 원작 캐릭터 id: 'Shaman$RedShaman' → red_shaman, 'npcs.Ghost' → ghost, 'DM300' → dm300 */
  vanillaCharId(cls) { const c = String(cls).split('.').pop().split('$').pop(); return c.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase(); },
  /** 원작(Shattered Pixel Dungeon) 캐릭터 한 명 — game = 게임 클래스, useGame = 게임 원래 동작 그대로 */
  vanillaChar(e) {
    const id = PDM.make.vanillaCharId(e.cls);
    const c = PDM.make.character(id, e.kind);
    Object.assign(c, { name: e.name, desc: String(e.desc || '').replace(/\\n/g, '\n').replace(/_([^_]+)_/g, '$1'), game: e.cls, useGame: true,
      sprite: PDM.clone(e.sprite), note: '원작 캐릭터 (actors.mobs.' + e.cls + ')' + (e.region ? ` · ${['', '하수도', '감옥', '동굴', '드워프 도시', '악마의 전당'][e.region]}` : '') });
    c.stats = Object.assign({ hp: 1, attackMin: 0, attackMax: 0, defense: 0, accuracy: 0, evasion: 0, speed: 1 }, e.stats || {});
    c.heart.enabled = false;
    c.dialogue = {};
    c.ai.mode = e.kind === 'npc' ? 'stand' : 'hunt';
    if (e.exp != null) c.exp = e.exp;
    return c;
  },
  /** 새 프로젝트를 원작(game/shattered-pixel-dungeon-master)처럼: 영웅 전부(추가 직업 포함) + 원작 캐릭터 전부 → { 'hero:warrior': …, 'char:rat': … } */
  vanilla() {
    const out = {};
    (PDM.SPD_HEROES || []).forEach(x => {
      const id = x.cls.toLowerCase(), hr = PDM.make.hero(id);
      Object.assign(hr, { name: x.name, desc: String(x.descLong || x.desc || '').replace(/\\n/g, '\n'), baseClass: x.cls, note: '원작 영웅 — 비워 둔 항목(그림·특성·전직·직업 능력)은 게임 코드의 값을 씁니다 (각 섹션 위 상자에 실제 값 표시)' });
      hr.spellbook.enabled = false;
      // 그림: 원작 영웅 시트(행 = 갑옷 단계 0~6)와 원작 HeroSprite 의 애니메이션 — 바로 미리 보고 고칠 수 있게 채워 둠
      hr.sprite = { sheet: 'game:sprites/' + id + '.png', frame: [12, 15], scale: 0, tierRows: [0, 1, 2, 3, 4, 5, 6], anims: {
        idle: { frames: [0, 0, 0, 1, 0, 0, 1, 1], fps: 1, loop: true }, run: { frames: [2, 3, 4, 5, 6, 7], fps: 20, loop: true },
        attack: { frames: [13, 14, 15, 0], fps: 15, loop: false }, zap: { frames: [13, 14, 15, 0], fps: 15, loop: false },
        die: { frames: [8, 9, 10, 11, 12, 11], fps: 20, loop: false }, operate: { frames: [16, 17, 16, 17], fps: 8, loop: false },
        fly: { frames: [18], fps: 1, loop: true }, read: { frames: [19, 20, 20, 20, 20, 20, 20, 20, 20, 19], fps: 20, loop: false } } };
      // 시작 아이템: 원작과 같은 목록 (fromGame = 게임이 이미 주는 것 — "목록대로 직접 주기"를 누르기 전에는 게임이 줌)
      hr.inventory = { clearDefault: false, items: (x.items || []).map(e => Object.assign({ item: '', count: 1, level: 0, equip: false, quickslot: false, identify: true, fromGame: true }, e)) };
      hr.knownItems = (x.known || []).slice();
      out['hero:' + id] = hr;
    });
    (PDM.SPD_CHARS || []).forEach(e => { const c = PDM.make.vanillaChar(e); if (!out['char:' + c.id]) out['char:' + c.id] = c; });
    return out;
  },
  /** 플레이어블 영웅 (heroes/<id>.json) — 영웅 편집기 */
  hero(id) {
    return { format: 'pdmaker-hero', version: PDM.FORMAT_VERSION, id, name: '새 영웅', title: '', desc: '', enabled: true,
      baseClass: '', character: '',   // '' = 완전히 새 영웅 (게임 직업에서 아무것도 물려받지 않음)
      select: { illust: '', fit: 'right', frameW: 0, frameH: 0, frames: '', fps: 8, icon: '' },   // 캐릭터 선택 화면
      sprite: { sheet: '', frame: [12, 15], scale: 0, anims: {} },
      stats: { hp: 20, hpPerLevel: 5, str: 10, attackSkill: 10, defenseSkill: 5, accPerLvl: 1, evaPerLvl: 1, unarmedMin: 0, unarmedMax: 0, speed: 1, viewDistance: 8 },
      startGold: 0, knownItems: [],
      inventory: { clearDefault: false, items: [] },
      code: { imports: '', members: '' },
      spellbook: { enabled: true, name: '주문서', desc: '', charges: 3, rechargeTurns: 40 },   // image 없음 = 게임의 마스터리 책 그림
      spells: [], subclasses: [], abilities: [], gauge: PDM.make.gauge(),
      passives: [], talentTiers: PDM.clone(PDM.TALENT_TIERS_DEFAULT), talents: [], note: '' };
  },
  /** 주문 (ClericSpell) */
  spell(tier) {
    return { id: 'spell_' + Math.random().toString(36).slice(2, 6), name: '새 주문', desc: '', tier: tier || 1, unlockLevel: 1, cost: 1, cooldown: 0,
      target: 'enemy', range: 6, projectile: true, visual: 'magic', time: 1, shout: '', cond: '', subclass: '', ability: '', heat: 0,
      effects: [{ type: 'damage', on: 'target', min: 2, max: 6, perLevel: 0 }] };
  },
  /** 직업 능력 (ArmorAbility) */
  ability() {
    return { id: 'ability_' + Math.random().toString(36).slice(2, 6), name: '새 직업 능력', shortDesc: '', desc: '', icon: 19, chargeUse: 35,
      target: 'cell', range: 6, projectile: true, visual: 'magic', time: 1, shout: '', heat: 0,
      effects: [{ type: 'damage', on: 'area', radius: 2, min: 5, max: 10, perLevel: 1 }] };
  },
  /** 전직 (HeroSubClass) */
  subclass() { return { id: 'subclass_' + Math.random().toString(36).slice(2, 6), name: '새 전직', shortDesc: '', desc: '', icon: 0, base: '', effects: [] }; },
  /** 게이지 · 원소 (mod-2 과열) — 기본은 꺼짐 */
  gauge() {
    return { enabled: false, name: '과열', max: 100, buffIcon: 2, perTurn: 0, sameElement: 2, afterUse: 2, idle: 1, recentTurns: 3,
      levels: [], overflow: { enabled: true, delay: 4, resetTo: 60, effects: [] }, elements: [], switchCool: 25, switchCooldown: 0, replaceNative: ['NewOverHeat'] };
  },
  gaugeLevel(at) { return { at: at || 25, name: '', desc: '', effects: [] }; },
  element() { return { id: 'el_' + Math.random().toString(36).slice(2, 5), name: '새 원소', color: '#E24F2E', icon: 0, desc: '', effects: [], onSwitch: [] }; },
  /** 코덱스 수치 (mod-2 Codex: 티어·내구·힘) */
  codexStats(type, tier) {
    tier = tier || 1;
    return { type: type || 'melee', tier, min: tier, max: 4 * tier + 2, minPerLvl: 1, maxPerLvl: tier, str: 0, baseUses: 10, quantity: 3, castTime: 1,
      range: type === 'ranged' ? 6 : 5, radius: type === 'cast' ? 1 : 0, target: 'cell', projectile: true, visual: type === 'melee' ? 'none' : 'magic', heat: 8, effects: [] };
  },
  talent(tier) {
    return { id: 'talent_' + Math.random().toString(36).slice(2, 6), name: '새 특성', tier: tier || 1, maxPoints: 2, desc: '', pointText: ['', ''],
      requires: '', requiresPoints: 1, effects: [{ type: 'stat', stat: 'hp', perPoint: 5 }] };
  },
  passive() { return { id: 'passive_' + Math.random().toString(36).slice(2, 6), name: '새 패시브', desc: '', unlockLevel: 1, cond: '', effects: [{ stat: 'hp', value: 5 }] }; },
  item(id) {
    return { format: 'pdmaker-item', version: PDM.FORMAT_VERSION, id, category: 'misc', name: '새 아이템', desc: '',
      sprite: { sheet: 'builtin:items', index: 0 }, stackable: true, price: 10, unique: false, tags: [], stats: {}, onUse: [], giftValue: {},
      kind: 'misc', code: { imports: '', members: '' }, actions: [] };
  },
  /** 아이템 종류별 기본 수치 (종류를 바꿀 때 채움) */
  weaponStats(kind, tier) {
    tier = tier || 1;
    if (kind === 'missile') return { tier, min: 2 * tier, max: 5 * tier, minPerLvl: 1, maxPerLvl: tier, str: 0, delay: 1, accuracy: 1, baseUses: 8, sticky: true };
    return { tier, min: tier, max: 5 * (tier + 1), minPerLvl: 1, maxPerLvl: tier + 1, str: 0, delay: 1, reach: 1, accuracy: 1 };
  },
  armorStats(tier) { tier = tier || 1; return { tier, drMin: 0, drMax: tier * 2, drMinPerLvl: 1, drMaxPerLvl: tier, str: 0 }; },
  itemAction() { return { id: 'use', name: '사용', cond: '', default: true, consume: false, time: 1, code: 'GLog.i("사용했다!");' }; },
  event(id, kind) {
    return { format: 'pdmaker-event', version: PDM.FORMAT_VERSION, id, kind: kind || 'common', name: '새 이벤트', note: '',
      pages: [PDM.make.page()] };
  },
  page() { return { cond: '', conds: {}, trigger: 'action', turnEvery: 10, heartCond: '', graphic: {}, move: { type: 'fixed', speed: 3, freq: 3, route: [], repeat: true, skip: false }, opts: {}, commands: [] }; },
  /** 맵 오브젝트: 맵에 놓는 물건 (상자·바위·레버…) — 상태·밀기·상호작용. 런타임 MakerProp */
  prop(id) {
    return { format: 'pdmaker-prop', version: PDM.FORMAT_VERSION, id, name: '새 오브젝트', desc: '', note: '',
      sprite: { sheet: '', frame: [16, 16], scale: 0, ox: 0, oy: 0, over: false }, foot: [1, 1],
      states: [{ name: '기본', frame: 0, solid: true, switch: '' }], start: 0,
      pushable: false, pushSound: '', goal: { terrain: -1, switch: '', event: '' },
      interact: 'none', event: '', loop: true, cond: '', sound: '', stepOn: 'none', stepEvent: '' };
  },
  /** 방 템플릿: 자동 생성 층에 끼워 넣는 직접 그린 방 */
  room(id) {
    const w = 9, hh = 7, t = new Array(w * hh).fill(4);
    for (let y = 1; y < hh - 1; y++) for (let x = 1; x < w - 1; x++) t[y * w + x] = 1;
    t[Math.floor(w / 2)] = 5; t[(hh - 1) * w + Math.floor(w / 2)] = 5; t[Math.floor(hh / 2) * w] = 5; t[Math.floor(hh / 2) * w + w - 1] = 5;
    return { format: 'pdmaker-room', version: PDM.FORMAT_VERSION, id, name: '새 방', kind: 'standard', keepClean: true, previewTheme: '', cat: '', auto: true, autoChance: 100, autoGroups: [],
      size: { w, h: hh }, layers: { terrain: t }, objects: [], note: '' };
  }
};

// ---------- 진행 방향 · 층 이름 ----------
/** 'down' | 'up' — 프로젝트 기본 (노드는 PDM.World.dirOf) */
PDM.dirOf = function () { const p = (PDM.store && PDM.store.get('project')) || {}; return p.direction || 'down'; };
PDM.floorLabel = d => d == null ? '?' : (PDM.dirOf() === 'up' ? `${d}층` : `지하 ${d}층`);
/** 계단 이름: 탑 모드에서는 입구가 아래층 계단, 출구가 위층 계단 */
PDM.terrainName = function (t, up) {
  if (!t) return '';
  if (t.key === 'ENTRANCE') return up ? '입구 (아래층에서 올라온 계단)' : '입구 (위층으로 가는 계단)';
  if (t.key === 'EXIT') return up ? '출구 (위층으로 올라가는 계단)' : '출구 (아래층으로 내려가는 계단)';
  return t.name;
};

// ---------- 영웅 편집기 목록 ----------
/** 바탕 직업 (게임 HeroClass). 모드 직업은 직접 입력 */
PDM.HERO_CLASSES = { WARRIOR: '전사', MAGE: '마법사', ROGUE: '도적', HUNTRESS: '사냥꾼', DUELIST: '결투가', CLERIC: '성직자', ARIA: '아리아' };
/** 시작 아이템 자동완성용: 자주 쓰는 게임 아이템 (spd:클래스이름) */
PDM.SPD_ITEMS = ['PotionOfHealing', 'PotionOfStrength', 'PotionOfExperience', 'ScrollOfUpgrade', 'ScrollOfIdentify', 'ScrollOfTeleportation', 'ScrollOfMagicMapping',
  'Food', 'Pasty', 'Waterskin', 'VelvetPouch', 'ScrollHolder', 'PotionBandolier', 'MagicalHolster', 'Torch', 'Bomb', 'Honeypot', 'Ankh', 'Dewdrop',
  'weapon.melee.WornShortsword', 'weapon.melee.Dagger', 'weapon.melee.MagesStaff', 'weapon.melee.Sword', 'weapon.melee.Rapier', 'weapon.melee.Quarterstaff',
  'weapon.missiles.ThrowingStone', 'weapon.missiles.ThrowingKnife', 'weapon.SpiritBow', 'armor.ClothArmor', 'armor.LeatherArmor',
  'wands.WandOfMagicMissile', 'wands.WandOfFireblast', 'wands.WandOfFrost', 'artifacts.CloakOfShadows', 'artifacts.HolyTome', 'rings.RingOfHaste'].map(x => 'spd:' + x);
/** 스킬에 쓸 수 있는 게임 버프 */
PDM.SPD_BUFFS = { Burning: '불붙음', Chill: '냉기', Frost: '빙결', Paralysis: '마비', Poison: '독', Bleeding: '출혈', Cripple: '절름', Blindness: '실명',
  Weakness: '약화', Vulnerable: '취약', Charm: '매혹', Terror: '공포', Slow: '느려짐', Roots: '속박', Haste: '가속', Invisibility: '투명', Bless: '축복',
  Adrenaline: '아드레날린', MindVision: '마음의 눈', Levitation: '부양', Recharging: '재충전', Barkskin: '나무껍질' };
PDM.CAST_TARGETS = { self: '자신', enemy: '적 하나', ally: '아군 (자신 포함)', cell: '칸 (범위 중심)', adjacent: '옆 칸의 적 (근접)' };
PDM.SKILL_TARGETS = PDM.CAST_TARGETS;
PDM.SKILL_VISUALS = { magic: '마법 화살', fire: '불', frost: '얼음', earth: '대지', shadow: '그림자', light: '빛', poison: '독', foliage: '풀잎', force: '충격', rainbow: '무지개', none: '없음' };
PDM.SKILL_EFFECTS = {
  damage: { name: '피해', fields: ['on', 'radius', 'min', 'max', 'perLevel', 'percent'] },
  heal: { name: '회복', fields: ['on', 'amount', 'percent'] },
  shield: { name: '보호막', fields: ['on', 'amount', 'percent'] },
  buff: { name: '상태 효과', fields: ['on', 'radius', 'buff', 'turns'] },
  knockback: { name: '밀쳐내기', fields: ['on', 'radius', 'power'] },
  blink: { name: '순간 이동 (고른 칸으로)', fields: [] },
  summon: { name: '소환', fields: ['ref', 'count', 'ally'] },
  event: { name: '이벤트 실행', fields: ['event'] },
  heart: { name: '마음 행동 적용', fields: ['char', 'action'] },
  gauge: { name: '게이지 (과열) 바꾸기', fields: ['amount'] },
  code: { name: '코드 (Java)', fields: ['code'] }
};
PDM.ITEM_KINDS = { misc: '일반 (사용 명령·코드 행동)', melee: '근접 무기', missile: '투척 무기', armor: '갑옷', codex: '코덱스 (내구가 닳는 사용형 마법 — mod-2)', grimoire: '그리모어 (코덱스 가방)', game: '게임 아이템 상속 (게임 클래스를 코드로 고치기)' };
PDM.CODEX_TYPES = { melee: '근접 (옆 칸 적)', ranged: '원거리 (날아가 맞힘)', cast: '시전 (범위·자신)' };
/** 게임 전직 (HeroSubClass) — 전직의 "게임 전직 효과도 켜기" */
PDM.GAME_SUBCLASSES = { BERSERKER: '광전사', GLADIATOR: '검투사', BATTLEMAGE: '전투 마법사', WARLOCK: '흑마법사', ASSASSIN: '암살자', FREERUNNER: '질주자',
  SNIPER: '저격수', WARDEN: '감시자', CHAMPION: '챔피언', MONK: '수도사', PRIEST: '사제', PALADIN: '성기사',
  ARIA_HARMONY: '아리아: 조화 (mod-2)', ARIA_OVERHEAT: '아리아: 과열 (mod-2)', ARIA_GRIMOIRE_INK: '아리아: 잉크 그리모어 (mod-2)' };
PDM.EFFECT_ON = { target: '대상', self: '자신', area: '범위 안의 적' };
PDM.PASSIVE_STATS = { hp: '최대 체력 +', str: '힘 + (한 번)', regen: 'N턴마다 체력 1 회복', gold: '골드 + (한 번)', charges: '주문서 최대 충전 +' };
/** 전직 · 게이지 단계 · 원소가 주는 능력치 ({stat, value}) */
PDM.HERO_STATS = { hp: '최대 체력 +', accuracy: '명중 +', evasion: '회피 +', damage: '공격 피해 +', armor: '방어 +', speed: '이동 속도 +%',
  damagePct: '공격 피해 +%', takenPct: '받는 피해 +% (음수 = 줄임)', castPct: '주문·능력 피해 +%', codexPct: '코덱스 피해 +%',
  charges: '주문서 최대 충전 +', recharge: '충전 속도 +%', regen: 'N턴마다 체력 1 회복' };

// ---------- 특성 (Talent) ----------
/** SPD 기본 특성 단계: 레벨 2/7/13/21 에 열리고, 단계마다 최대 5/6/8/10 포인트 (레벨당 1). 3단계는 전직 뒤, 4단계는 직업 능력 뒤 */
PDM.TALENT_TIERS_DEFAULT = [
  { name: '1단계', unlockLevel: 2, points: 5 }, { name: '2단계', unlockLevel: 7, points: 6 },
  { name: '3단계', unlockLevel: 13, points: 8, requires: 'subclass' }, { name: '4단계', unlockLevel: 21, points: 10, requires: 'ability' }];
PDM.TIER_REQUIRES = { '': '레벨만', subclass: '전직 뒤 (원작 3단계)', ability: '직업 능력 뒤 (원작 4단계)' };
PDM.TALENT_EFFECTS = { stat: '능력치', spell: '주문·능력·코덱스 강화', unlockSpell: '주문 배우기' };
PDM.TALENT_STATS = { hp: '최대 체력 +', str: '힘 + (올릴 때 한 번)', accuracy: '명중 +', evasion: '회피 +', damage: '공격 피해 +', armor: '방어 +',
  speed: '이동 속도 +%', damagePct: '공격 피해 +%', takenPct: '받는 피해 +%', castPct: '주문·능력 피해 +%', codexPct: '코덱스 피해 +%',
  charges: '주문서 최대 충전 +', recharge: '충전 속도 +%', regen: 'N턴마다 체력 1 회복 (패시브와 합산)', gold: '골드 + (올릴 때 한 번)', view: '시야 + (올릴 때 한 번)' };
PDM.SKILL_FIELDS = { damage: '피해 (최소·최대 모두)', amount: '양 (회복·보호막)', turns: '상태 효과 턴', radius: '반경', range: '사거리', cost: '주문 충전 소모', chargeUse: '능력 갑옷 충전 %', cooldown: '재사용 대기', count: '소환 수', power: '밀치는 칸 수' };
/** 단계별로 이 레벨에서 얻은 포인트 */
PDM.talentPoints = (tiers, lvl) => (tiers && tiers.length ? tiers : PDM.TALENT_TIERS_DEFAULT).map(t => Math.max(0, Math.min(t.points || 0, lvl - (t.unlockLevel || 1) + 1)));
