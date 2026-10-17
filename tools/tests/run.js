#!/usr/bin/env node
// ================================================================
//  PDMaker 회귀 테스트 (Node 만 있으면 됨 — Electron · 게임 빌드 없이)
//    사용: node tools/tests/run.js [이름 일부]
//    ① 편집기 ↔ 런타임(Java) ↔ 게임 소스의 표가 서로 같은지 (밑그림 대응표 · 구멍 · 기본 레이어 · 함정)
//    ② 맵 데이터 변환(PDM.migrateMapData) · 저장/불러오기(PDM.store) · 백업 · 손상 파일 · 검사(PDM.validate)
//    임시 폴더에서만 프로젝트를 만들고 지움 — 실제 프로젝트 · 저장소 파일은 건드리지 않음
// ================================================================
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const env = require('./editor-env');
const ROOT = path.join(__dirname, '..', '..');
const PDMK = path.join(ROOT, 'runtime', 'src', 'com', 'shatteredpixel', 'shatteredpixeldungeon', 'pdmaker');
const GAME = path.join(ROOT, 'game', 'shattered-pixel-dungeon-master', 'core', 'src', 'main', 'java', 'com', 'shatteredpixel', 'shatteredpixeldungeon');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const read = p => fs.readFileSync(p, 'utf8');
/** 값 비교 (vm 안의 배열 · 객체도 — JSON 기준) */
const J = x => x === undefined ? x : JSON.parse(JSON.stringify(x));
const eq = (a, b, m) => assert.deepStrictEqual(J(a), J(b), m);
const tmpDirs = [];
function tmp() { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pdm-test-')); tmpDirs.push(d); return d; }
/** 새 프로젝트를 임시 폴더에 만들고 { ctx, dir } */
async function newProject(opts) {
  const ctx = env.load(opts), dir = path.join(tmp(), 'proj');
  fs.mkdirSync(dir);
  await ctx.PDM.store.createNew(dir, '테스트');
  return { ctx, dir };
}
const files = dir => { const out = []; const rec = (d, r) => fs.readdirSync(d, { withFileTypes: true }).forEach(e => e.isDirectory() ? rec(path.join(d, e.name), r + e.name + '/') : out.push(r + e.name)); rec(dir, ''); return out.sort(); };
const json = p => JSON.parse(read(p));

// ------------------------------------------------------------ ① 표 맞추기

/** DungeonTileSheet 의 int 상수 → 값 (xy(x, y) · 다른 상수 + 숫자) */
function tileSheet() {
  const src = read(path.join(GAME, 'tiles', 'DungeonTileSheet.java')), v = { WIDTH: 16 };
  const re = /static final int (\w+)\s*=\s*([^;]+);/g; let m;
  while ((m = re.exec(src))) {
    const e = m[2].replace(/xy\((\d+),\s*(\d+)\)/g, (_, x, y) => String((x - 1) + 16 * (y - 1))).replace(/\b[A-Z_][A-Z0-9_]*\b/g, k => k in v ? String(v[k]) : 'NaN');
    if (/^[\d\s+\-*NaN]+$/.test(e)) { const r = Function('return ' + e)(); if (Number.isFinite(r)) v[m[1]] = r; }
  }
  return v;
}

test('밑그림 대응표: 편집기 PDM.TILE_LEGACY_DEFAULT = 런타임 MakerTileUnderlay.LEGACY', () => {
  const { PDM } = env.load();
  const java = [...read(path.join(PDMK, 'MakerTileUnderlay.java')).matchAll(/\{visual:(\d+),under:\[([\d,]*)\]\}/g)].map(m => ({ visual: +m[1], under: m[2] ? m[2].split(',').map(Number) : [] }));
  eq(PDM.TILE_LEGACY_DEFAULT, java);
});

test('보존 타일 번호 29종: 대응표와 정확히 같고 게임 DungeonTileSheet 의 그림 번호와 대응', () => {
  const { PDM } = env.load();
  const KEEP = [1, 2, 3, 7, 8, 9, 16, 18, 22, 64, 65, 66, 67, 69, 70, 72, 73, 74, 75, 120, 121, 122, 123, 125, 126, 128, 129, 130, 131];
  eq(PDM.TILE_LEGACY_DEFAULT.map(e => e.visual), KEEP);
  const S = tileSheet(), byVal = {};
  Object.entries(S).forEach(([k, val]) => { if (k !== 'WIDTH') (byVal[val] = byVal[val] || []).push(k); });
  const missing = KEEP.filter(n => !byVal[n]);
  eq(missing, [], '게임 타일시트에 없는 번호: ' + missing);
  // 밑그림은 바닥 계열 그림만 (0 FLOOR · 4 FLOOR_SP · 6 FLOOR_ALT_1)
  assert.strictEqual(S.FLOOR, 0); assert.strictEqual(S.FLOOR_SP, 4); assert.strictEqual(S.FLOOR_ALT_1, 6);
  PDM.TILE_LEGACY_DEFAULT.forEach(e => e.under.forEach(u => assert.ok([0, 4, 6].includes(u), `칸 ${e.visual} 밑그림 ${u}`)));
  return KEEP.map(n => `${n}=${byVal[n].join('/')}`).join(' ');
});

test('원작 구멍 모양: 편집기 PDM.TILE_HOLES = 런타임 MakerTileUnderlay.HOLES', () => {
  const { PDM } = env.load();
  const java = {}; [...read(path.join(PDMK, 'MakerTileUnderlay.java')).matchAll(/HOLES\.put\((\d+), new int\[\]\{([^}]*)\}/g)].forEach(m => { java[m[1]] = m[2].split(',').map(Number); });
  eq(PDM.TILE_HOLES, java);
});

test('기본 타일 레이어: 편집기 PDM.TILE_LAYERS_DEFAULT = 런타임 MakerTileLayers.DEFAULT', () => {
  const { PDM } = env.load();
  const src = read(path.join(PDMK, 'MakerTileLayers.java')), light = src.match(/LIGHT = "([^;]*)";/)[1];
  const def = src.match(/DEFAULT = ([^;]*);/)[1].replace('+ LIGHT', '+ "' + light + '"');
  const java = [...def.matchAll(/\{id:(\w+),name:\\"([^\\]*)\\",depth:(\w+),visible:(\w+),solid:(\w+)(?:,blend:(\w+))?\}/g)]
    .map(m => Object.assign({ id: m[1], name: m[2], depth: m[3], visible: m[4] === 'true', solid: m[5] === 'true' }, m[6] ? { blend: m[6] } : {}));
  eq(PDM.TILE_LAYERS_DEFAULT, java);
});

test('함정 목록: 편집기 PDM.TRAPS 의 클래스가 게임 소스에 모두 있음 · 예전 지형 함정 대체 = 런타임과 같음', () => {
  const { PDM } = env.load();
  const missing = PDM.TRAPS.filter(t => !fs.existsSync(path.join(GAME, 'levels', 'traps', t.id + '.java'))).map(t => t.id);
  eq(missing, []);
  assert.ok(new RegExp(`"${PDM.TRAP_LEGACY}"`).test(read(path.join(PDMK, 'MakerTraps.java'))), 'MakerTraps 의 LEGACY 함정이 편집기와 다름');
});

// ------------------------------------------------------------ ② 맵 데이터 변환

test('migrateMapData: utile → tiles.base, 지형 함정 17·18·19 → 바닥 + 함정 오브젝트, 두 번째 실행은 변화 없음', () => {
  const { PDM } = env.load();
  const d = { size: { w: 3, h: 2 }, layers: { terrain: [1, 17, 18, 19, 4, 1], utile: ['', 'ut_a', '', '', '', ''] }, objects: [] };
  const ch = PDM.migrateMapData(d);
  assert.strictEqual(ch.length, 2);
  eq(d.layers.terrain, [1, 1, 1, 1, 4, 1]);
  eq(d.layers.tiles.base, ['', 'ut_a', '', '', '', '']);
  assert.ok(!('utile' in d.layers));
  const traps = d.objects.map(o => [o.type, o.ref, o.at.x, o.at.y, o.hidden, o.inactive]);
  eq(traps, [['trap', 'WornDartTrap', 1, 0, true, false], ['trap', 'WornDartTrap', 2, 0, false, false], ['trap', 'WornDartTrap', 0, 1, false, true]]);
  assert.ok(d.objects.every(o => typeof o.id === 'string' && o.id), '오브젝트 id');
  eq(PDM.migrateMapData(d), []);
  // 이미 그 칸에 함정 오브젝트가 있으면 겹쳐 만들지 않음
  const d2 = { size: { w: 1, h: 1 }, layers: { terrain: [18] }, objects: [{ id: 'x', type: 'trap', ref: 'AlarmTrap', at: { x: 0, y: 0 } }] };
  PDM.migrateMapData(d2);
  assert.strictEqual(d2.objects.length, 1);
});

// ------------------------------------------------------------ ③ 저장 · 불러오기

test('새 프로젝트 → 다시 불러오기: 문제 없음 · 저장할 것 없음 · 데이터 그대로', async () => {
  const { ctx, dir } = await newProject();
  const before = Object.fromEntries(ctx.PDM.store.keys().map(k => [k, JSON.stringify(ctx.PDM.store.get(k))]));
  const c2 = env.load();
  const problems = await c2.PDM.store.load(dir);
  eq(problems, []);
  eq(c2.PDM.store.dirtyKeys(), []);
  // tilecombos 는 쓸 때만 파일을 만듦 → 기본값으로 채워짐 (저장 대상 아님)
  const after = Object.fromEntries(c2.PDM.store.keys().map(k => [k, JSON.stringify(c2.PDM.store.get(k))]));
  delete before.tilecombos; delete after.tilecombos;
  eq(after, before);
  assert.ok(!fs.existsSync(path.join(dir, 'maps', 'tilecombos.json')));
  return `${Object.keys(after).length}개 리소스 · 파일 ${files(dir).length}개`;
});

test('편집 → 실행 취소 → 다시 실행 → 저장 → 불러오기', async () => {
  const { ctx, dir } = await newProject();
  const S = ctx.PDM.store, k = S.keys('node')[0];
  const orig = JSON.stringify(S.get(k));
  S.edit(k, '테스트 편집', r => { r.name = '바뀐 이름'; r.objects = r.objects || []; r.objects.push({ id: 'o1', type: 'trap', ref: 'AlarmTrap', at: { x: 1, y: 1 }, cond: '', hidden: false, inactive: false }); });
  S.undo(); assert.strictEqual(JSON.stringify(S.get(k)), orig);
  S.redo(); assert.strictEqual(S.get(k).name, '바뀐 이름');
  await S.save();
  const c2 = env.load(); await c2.PDM.store.load(dir);
  assert.strictEqual(c2.PDM.store.get(k).name, '바뀐 이름');
  assert.strictEqual(c2.PDM.store.get(k).objects.slice(-1)[0].ref, 'AlarmTrap');
});

test('손상된 JSON 파일: 기본값으로 덮어쓰지 않고 알림 · 저장해도 원본이 남음', async () => {
  const { dir } = await newProject();
  const bad = '{ "enabled": tru';   // 쓰다 만 파일
  fs.writeFileSync(path.join(dir, 'title.json'), bad);
  fs.writeFileSync(path.join(dir, 'maps', 'world.json'), '{"groups": [');
  const nodesBefore = Object.fromEntries(fs.readdirSync(path.join(dir, 'maps', 'nodes')).map(f => [f, read(path.join(dir, 'maps', 'nodes', f))]));
  const c = env.load();
  const problems = await c.PDM.store.load(dir);
  assert.ok(problems.some(p => p.includes('title.json')), '손상 알림 (title.json): ' + problems.join(' | '));
  assert.ok(problems.some(p => p.includes('world.json')), '손상 알림 (world.json)');
  await c.PDM.store.save();
  // 손상된 원본은 그대로 남거나 백업에 남아 있어야 함
  const keep = (rel, text) => read(path.join(dir, rel)) === text || files(dir).some(f => f.startsWith('.pdmaker-backup/') && f.endsWith(rel) && read(path.join(dir, f)) === text);
  assert.ok(keep('title.json', bad), 'title.json 원본이 사라짐');
  assert.ok(keep('maps/world.json', '{"groups": ['), 'world.json 원본이 사라짐');
  // 손상된 world.json 때문에 멀쩡한 노드 파일이 기본값으로 덮이면 안 됨
  Object.entries(nodesBefore).forEach(([f, t]) => assert.ok(keep('maps/nodes/' + f, t), `maps/nodes/${f} 이(가) 기본값으로 덮임`));
});

test('예전 형식 변환 저장: 원본을 백업에 남기고, 새 파일을 다 쓴 뒤에 예전 파일을 지움', async () => {
  const { dir } = await newProject();
  const k = fs.readdirSync(path.join(dir, 'maps', 'nodes'))[0], p = path.join(dir, 'maps', 'nodes', k);
  const n = json(p); n.mode = 'handmade'; n.size = { w: 2, h: 1 }; n.layers = { terrain: [17, 1], utile: ['ut_a', ''] };
  const orig = JSON.stringify(n, null, 2) + '\n'; fs.writeFileSync(p, orig);
  const c = env.load(); const problems = await c.PDM.store.load(dir);
  assert.ok(problems.some(x => x.includes('저장하면 적용')));
  await c.PDM.store.save();
  const now = json(p);
  eq(now.layers.terrain, [1, 1]); eq(now.layers.tiles.base, ['ut_a', '']);
  const bk = files(dir).filter(f => f.startsWith('.pdmaker-backup/') && f.endsWith('maps/nodes/' + k));
  assert.strictEqual(bk.length, 1, '변환 전 원본 백업');
  assert.strictEqual(read(path.join(dir, bk[0])), orig);
  // 두 번째 저장은 백업을 더 만들지 않음
  const c2 = env.load(); await c2.PDM.store.load(dir); await c2.PDM.store.save();
  assert.strictEqual(files(dir).filter(f => f.startsWith('.pdmaker-backup/')).length, 1);
});

test('저장 중 쓰기 실패: 예전 형식 파일을 먼저 지우지 않음 · 실패를 알림 · 다시 저장 가능', async () => {
  const { dir } = await newProject();
  fs.writeFileSync(path.join(dir, 'maps', 'floor_01.json'), '{"old": true}');
  let fail = true;
  const c = env.load({ failWrite: p => fail && p.endsWith('title.json') });
  await c.PDM.store.load(dir);
  c.PDM.store.edit('title', '편집', t => { t.enabled = !t.enabled; });
  await assert.rejects(() => c.PDM.store.save());
  assert.ok(fs.existsSync(path.join(dir, 'maps', 'floor_01.json')), '쓰기가 실패했는데 예전 파일을 먼저 지움');
  assert.ok(c.PDM.store.isDirty(), '실패한 뒤에도 저장 안 된 상태여야 함');
  fail = false;
  await c.PDM.store.save();
  assert.ok(!fs.existsSync(path.join(dir, 'maps', 'floor_01.json')));
  assert.ok(!c.PDM.store.isDirty());
});

test('손상된 파일을 고쳐 저장: 원본(손상본)을 백업한 뒤 덮어씀 · 지운 리소스도 백업', async () => {
  const { dir } = await newProject();
  fs.writeFileSync(path.join(dir, 'title.json'), '{ broken');
  const c = env.load(); await c.PDM.store.load(dir);
  const S = c.PDM.store, ck = S.keys('char')[0], cid = ck.split(':')[1], charText = read(path.join(dir, 'characters', cid + '.json'));
  S.edit('title', '고침', t => { t.testMark = 1; });
  S.remove(ck);
  await S.save();
  assert.strictEqual(json(path.join(dir, 'title.json')).testMark, 1);
  const bk = files(dir).filter(f => f.startsWith('.pdmaker-backup/'));
  assert.ok(bk.some(f => f.endsWith('/title.json') && read(path.join(dir, f)) === '{ broken'), '손상본 백업: ' + bk);
  assert.ok(bk.some(f => f.endsWith(`/characters/${cid}.json`) && read(path.join(dir, f)) === charText), '지운 리소스 백업');
  assert.ok(!fs.existsSync(path.join(dir, 'characters', cid + '.json')));
});

test('리소스 삭제 · 이름 바꾸기 저장: 새 파일을 쓴 뒤 옛 파일을 지움', async () => {
  const { ctx, dir } = await newProject();
  const S = ctx.PDM.store, k = S.keys('char')[0], id = k.split(':')[1];
  S.rename(k, 'char:zz_renamed');
  await S.save();
  assert.ok(fs.existsSync(path.join(dir, 'characters', 'zz_renamed.json')));
  assert.ok(!fs.existsSync(path.join(dir, 'characters', id + '.json')));
});

// ------------------------------------------------------------ ④ 검사

test('검사: 맵 타일 레이어의 없는 사용자 타일 · 없는 레이어 · 길이 오류를 알림', async () => {
  const { ctx } = await newProject();
  const S = ctx.PDM.store, k = S.keys('node')[0];
  S.edit('world', '타일', w => { w.userTiles = [{ id: 'ut_ok', name: 'ok', image: 'assets/tiles/x.png', x: 0, y: 0, size: 16 }]; });
  S.edit(k, '레이어', r => { r.mode = 'handmade'; r.size = { w: 2, h: 2 }; r.layers.terrain = [1, 1, 1, 1]; r.layers.tiles = { base: ['ut_ok', 'ut_gone', '', ''], ghost: ['ut_ok', '', '', ''], grass: ['ut_ok', ''] }; });
  const res = ctx.PDM.validate().filter(x => x.open === k).map(x => x.level + ' ' + x.msg);
  assert.ok(res.some(m => m.includes('ut_gone')), '없는 사용자 타일: ' + res.join(' | '));
  assert.ok(res.some(m => m.includes('ghost')), '없는 레이어');
  assert.ok(res.some(m => m.startsWith('error') && m.includes('grass')), '길이 오류');
  assert.ok(!res.some(m => m.includes('ut_ok')));
});

test('검사: 조합 타일 — 없는 조합 id · 빈 그림 · 확률 0', async () => {
  const { ctx } = await newProject();
  const S = ctx.PDM.store, k = S.keys('node')[0];
  S.edit('project', '확장', p => { p.extensions = { tilecombos: true }; });
  S.edit('tilecombos', '조합', t => { t.list = [{ id: 'c1', name: 'c1', sprites: [{ src: 'image', image: '', layer: 'base' }], autogen: { enabled: true, where: 'floor', chance: 0 } }]; });
  S.edit(k, '놓기', r => { r.mode = 'handmade'; r.objects = [{ id: 'o', type: 'combo', ref: 'nope', at: { x: 0, y: 0 } }]; });
  const msgs = ctx.PDM.validate().map(x => x.msg).join(' | ');
  assert.ok(msgs.includes('"nope"'), msgs); assert.ok(msgs.includes('그림 파일이 비어')); assert.ok(msgs.includes('확률이 0'));
});

// ------------------------------------------------------------ ⑤ 영역 편집 (PDM.mapArea — 맵 편집기 "⇱ 선택"의 복사 · 잘라내기 · 붙여넣기)

/** 시험용 맵: 5×4, 지형 · 레이어 2개 · 스폰 · 오브젝트(함정 · 조합 · 시작 위치) */
function sampleMap() {
  const W = 5, H = 4, n = W * H, T = new Array(n).fill(1);
  T[0] = 4; T[6] = 2; T[7] = -1;            // (0,0) 벽 · (1,1) 풀 · (2,1) 빈 칸
  const base = new Array(n).fill(''), deco = new Array(n).fill('');
  base[6] = 'ut_a'; deco[6] = 'ut_b'; deco[8] = 'ut_c';
  const spawn = new Array(n).fill(0); spawn[11] = 1;
  return { id: 'm', size: { w: W, h: H }, layers: { terrain: T, tiles: { base, walldeco: deco }, spawn },
    objects: [{ id: 'o1', type: 'trap', ref: 'AlarmTrap', at: { x: 1, y: 1 }, hidden: true, inactive: false, cond: 'switch.a', note: '메모' },
      { id: 'o2', type: 'combo', ref: 'wl', at: { x: 3, y: 1 }, cond: '' }, { id: 'o3', type: 'start', at: { x: 1, y: 2 }, when: 'start' }, { id: 'o4', type: 'item', ref: 'it', at: { rule: 'random' } }] };
}
const areaEnv = () => { const ctx = env.load(); let n = 0; return { A: ctx.PDM.mapArea, uid: () => 'new' + (++n), PDM: ctx.PDM }; };

test('영역 선택: 방향과 상관없이 같은 사각형 · 맵 경계로 자름 · 맵 밖이면 없음', () => {
  const { A } = areaEnv();
  eq(A.rect(3, 2, 1, 0, 5, 4), { x0: 1, y0: 0, x1: 3, y1: 2 });
  eq(A.rect(1, 0, 3, 2, 5, 4), A.rect(3, 2, 1, 0, 5, 4));
  eq(A.rect(-3, -1, 9, 9, 5, 4), { x0: 0, y0: 0, x1: 4, y1: 3 });
  assert.strictEqual(A.rect(6, 0, 9, 2, 5, 4), null);
  assert.strictEqual(A.rect(-5, -5, -1, -1, 5, 4), null);
});

test('영역 복사: 레이어별로 따로 · 상대 좌표 오브젝트 · 영역 밖 오브젝트 · 칸 없는 오브젝트 제외 · 원본 그대로', () => {
  const { A } = areaEnv(), d = sampleMap(), before = JSON.stringify(d);
  const c = A.copy(d, { x0: 1, y0: 1, x1: 3, y1: 2 }, 'node:m');
  assert.strictEqual(JSON.stringify(d), before, '복사가 원본을 바꿈');
  assert.ok(A.valid(c));
  eq([c.w, c.h], [3, 2]);
  eq(c.terrain, [2, -1, 1, 1, 1, 1]);
  eq(c.tiles, { base: ['ut_a', '', '', '', '', ''], walldeco: ['ut_b', '', 'ut_c', '', '', ''] });
  eq(c.spawn, [0, 0, 0, 1, 0, 0]);   // 스폰 칸 (1,2) → 영역 안 상대 (0,1)
  eq(c.objects.map(o => [o.id, o.at.x, o.at.y]), [['o1', 0, 0], ['o2', 2, 0], ['o3', 0, 1]]);
  assert.strictEqual(A.copy(d, A.rect(7, 7, 9, 9, 5, 4), 'node:m'), null);
});

test('붙여넣기: 빈 칸은 투명 · 레이어 칸 그대로 덮음 · 오브젝트 새 id + 좌표 이동 + 속성 보존 · 원본 데이터 손상 없음', () => {
  const { A, uid } = areaEnv(), d = sampleMap();
  const c = A.copy(d, { x0: 1, y0: 1, x1: 2, y1: 1 }, 'node:m');   // (1,1) 풀 + (2,1) 빈 칸
  const clipBefore = JSON.stringify(c);
  d.layers.terrain[16] = 5; d.layers.terrain[17] = 5; d.layers.tiles.base[17] = 'keep';   // 받는 자리 (1,3) (2,3)
  const r = A.paste(d, c, 1, 3, { key: 'node:m', kind: 'node', uid });
  assert.strictEqual(JSON.stringify(c), clipBefore, '붙여넣기가 복사본을 바꿈');
  eq([d.layers.terrain[16], d.layers.terrain[17]], [2, 5]);                  // 빈 칸 → 받는 칸 그대로
  eq([d.layers.tiles.base[16], d.layers.tiles.walldeco[16]], ['ut_a', 'ut_b']);
  assert.strictEqual(d.layers.tiles.base[17], 'keep');                        // 투명 칸의 레이어도 그대로
  const pasted = d.objects.filter(o => o.id.startsWith('new'));
  eq(pasted.map(o => [o.id, o.type, o.ref, o.at.x, o.at.y, o.hidden, o.cond, o.note]), [['new1', 'trap', 'AlarmTrap', 1, 3, true, 'switch.a', '메모']]);
  assert.strictEqual(new Set(d.objects.map(o => o.id)).size, d.objects.length, 'id 중복');
  assert.ok(d.objects.some(o => o.id === 'o1' && o.at.x === 1 && o.at.y === 1), '원본 오브젝트가 바뀜');
  eq([r.cells, r.objects, r.clippedCells, r.clippedObjects], [1, 1, 0, 0]);
});

test('붙여넣기: 맵 밖 칸 · 오브젝트는 잘라냄 · 맵 크기 그대로', () => {
  const { A, uid } = areaEnv(), d = sampleMap();
  const c = A.copy(d, { x0: 0, y0: 0, x1: 4, y1: 3 }, 'node:m');
  const r = A.paste(d, c, 3, 2, { key: 'node:m', kind: 'node', uid });
  eq(d.size, { w: 5, h: 4 }); assert.strictEqual(d.layers.terrain.length, 20);
  // 붙는 칸 (3..4, 2..3) = 원본 (0..1, 0..1) 4칸 · 오브젝트 o1 (1,1)→(4,3) 만 안, o2 (3,1)→(6,3) · o3 (1,2)→(4,4) 는 밖
  eq([r.cells, r.clippedCells > 0, r.objects, r.clippedObjects], [4, true, 1, 2]);
});

test('붙여넣기: 방 템플릿에는 노드 전용 오브젝트를 붙이지 않음 · 무작위 칸은 같은 맵에서만', () => {
  const { A, uid } = areaEnv(), d = sampleMap(); d.layers.rand = new Array(20).fill(0); d.layers.rand[6] = 1; d.randSets = [{ name: 's', opts: [] }];
  const c = A.copy(d, { x0: 1, y0: 1, x1: 1, y1: 2 }, 'room:r');
  const room = { id: 'r2', size: { w: 5, h: 4 }, layers: { terrain: new Array(20).fill(1), rand: new Array(20).fill(0) }, objects: [] };
  const r = A.paste(room, c, 0, 0, { key: 'room:r2', kind: 'room', uid });
  eq([r.objects, r.skippedTypes, r.randDropped], [1, 1, true]);
  assert.ok(room.layers.rand.every(v => v === 0));
  const r2 = A.paste(d, c, 3, 2, { key: 'room:r', kind: 'room', uid });
  assert.strictEqual(r2.randDropped, false); assert.strictEqual(d.layers.rand[2 * 5 + 3], 1);
});

test('잘라내기: 복사본이 맞으면 비움 (지우개 "전부"와 같음) · 잘못된 복사본은 붙여넣기 거부', () => {
  const { A } = areaEnv(), d = sampleMap();
  const c = A.copy(d, { x0: 1, y0: 1, x1: 3, y1: 1 }, 'node:m');
  assert.ok(A.valid(c));
  const n = A.clear(d, { x0: 1, y0: 1, x1: 3, y1: 1 });
  assert.strictEqual(n, 2);
  eq([6, 7, 8].map(i => d.layers.terrain[i]), [-1, -1, -1]);
  const tl = d.layers.tiles || {}; assert.ok(!tl.base, '빈 레이어는 지움'); assert.ok(!(tl.walldeco || []).some(Boolean));
  assert.ok(d.objects.some(o => o.id === 'o3') && d.objects.some(o => o.id === 'o4'));
  assert.throws(() => A.paste(d, Object.assign({}, c, { terrain: [1] }), 0, 0, {}));
  assert.throws(() => A.paste(d, { format: 'x' }, 0, 0, {}));
});

test('다중 오브젝트: 영역 안 오브젝트 고르기 · 함께 이동 · 맵 밖이면 아무것도 안 옮김', () => {
  const { A } = areaEnv(), d = sampleMap();
  eq(A.objectsIn(d, { x0: 0, y0: 0, x1: 3, y1: 1 }), ['o1', 'o2']);
  const before = JSON.stringify(d);
  assert.strictEqual(A.moveObjects(d, ['o1', 'o2'], 2, 0), false);   // o2 (3,1) → (5,1) 맵 밖
  assert.strictEqual(JSON.stringify(d), before);
  const m = A.moveObjects(d, ['o1', 'o2'], 1, 2);
  eq(m, { 6: 17, 8: 19 });
  eq(d.objects.filter(o => ['o1', 'o2'].includes(o.id)).map(o => [o.at.x, o.at.y, o.hidden]), [[2, 3, true], [4, 3, undefined]]);
  assert.ok(d.objects.find(o => o.id === 'o4').at.rule === 'random');
});

test('영역 편집을 store 로: 붙여넣기 → 실행 취소 → 다시 실행 → 저장 · 다시 열기', async () => {
  const { ctx, dir } = await newProject();
  const S = ctx.PDM.store, A = ctx.PDM.mapArea, k = S.keys('node')[0];
  S.edit(k, '준비', r => { const s = sampleMap(); r.mode = 'handmade'; r.size = s.size; r.layers = s.layers; r.objects = s.objects; });
  const orig = JSON.stringify(S.get(k));
  const c = A.copy(S.get(k), { x0: 0, y0: 0, x1: 1, y1: 1 }, k);
  S.edit(k, '영역 붙여넣기', r => { A.paste(r, c, 3, 2, { key: k, kind: 'node', uid: () => ctx.PDM.uid('o') }); });
  const pasted = JSON.stringify(S.get(k));
  S.undo(); assert.strictEqual(JSON.stringify(S.get(k)), orig);
  S.redo(); assert.strictEqual(JSON.stringify(S.get(k)), pasted);
  await S.save();
  const c2 = env.load(); await c2.PDM.store.load(dir);
  assert.strictEqual(JSON.stringify(c2.PDM.store.get(k)), pasted);
});

// ------------------------------------------------------------ ⑥ 데이터 · 에셋 검사 (PDM.validate · PDM.validateAssets)

/** 프로젝트 파일 상태 (경로 → 크기 · 수정 시각 · 내용 해시) — 검사가 파일을 고치지 않는지 */
function snapshotFiles(dir) { const crypto = require('crypto'); return Object.fromEntries(files(dir).map(f => { const p = path.join(dir, f), st = fs.statSync(p); return [f, `${st.size}|${st.mtimeMs}|${crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex')}`]; })); }
const GAME_REPO = path.join(ROOT, 'game', 'shattered-pixel-dungeon-master');

test('검사: 원작 그대로인 새 프로젝트 — 오류 없음 · 게임 그림 · 소리 참조 모두 실제 파일로 확인', async () => {
  const { ctx, dir } = await newProject();
  const S = ctx.PDM.store;
  S.edit('project', '저장소', p => { p.gameRepo = path.relative(dir, GAME_REPO); });
  const t0 = Date.now(), res = ctx.PDM.validate(), t1 = Date.now();
  const errs = res.filter(r => r.level === 'error');
  eq(errs.map(r => r.where + ' ' + r.msg), []);
  const a = await ctx.PDM.validateAssets();
  eq(a.issues.map(r => r.where + ' ' + r.msg), []);
  assert.ok(a.refs > 50, '확인한 경로가 너무 적음: ' + a.refs);
  assert.strictEqual(a.skippedGame, 0);
  return `동기 검사 ${t1 - t0}ms (결과 ${res.length}개 · 오류 0) · 에셋 경로 ${a.refs}개(쓰는 곳 ${a.uses}) · 폴더 ${a.dirs}개 · ${a.ms}ms`;
});

test('검사: 없는 그림 · 없는 소리 파일 · 없는 사운드 id · 대소문자 · 확장자 · 절대 경로 · 프로젝트 밖', async () => {
  const { ctx, dir } = await newProject();
  const S = ctx.PDM.store, ck = S.keys('char')[0];
  fs.mkdirSync(path.join(dir, 'assets', 'tiles'), { recursive: true }); fs.writeFileSync(path.join(dir, 'assets', 'tiles', 'Glow.png'), 'x');
  fs.mkdirSync(path.join(dir, 'assets', 'audio'), { recursive: true }); fs.writeFileSync(path.join(dir, 'assets', 'audio', 'step.ogg'), 'x');
  S.edit(ck, '그림', c => { c.sprite = Object.assign({}, c.sprite, { sheet: 'assets/sprites/none.png' }); c.extraA = 'assets/tiles/glow.png'; c.extraB = 'C:/Users/me/x.png'; c.extraC = '../outside/y.png'; c.voice = 'sound:nope'; });
  S.edit('sounds', '소리', r => { r.sounds = [{ id: 'gone', name: 'gone', kind: 'se', file: 'assets/audio/gone.wav' }, { id: 'step', name: 'step', kind: 'se', file: 'assets/audio/step.mp3' }]; });
  const before = snapshotFiles(dir), data = JSON.stringify(S.keys().map(k => S.get(k)));
  const sync = ctx.PDM.validate(), a = await ctx.PDM.validateAssets();
  const m = a.issues.map(r => `${r.level}|${r.kind}|${r.ref}`);
  ['warn|없는 에셋|assets/sprites/none.png', 'warn|대소문자|assets/tiles/glow.png', 'warn|경로|C:/Users/me/x.png', 'warn|경로|../outside/y.png', 'warn|없는 에셋|assets/audio/gone.wav', 'warn|확장자|assets/audio/step.mp3']
    .forEach(x => assert.ok(m.includes(x), `${x} 없음:\n${m.join('\n')}`));
  assert.ok(a.issues.every(r => r.fix && r.where && r.path), '조치 · 위치 · 데이터 경로');
  assert.ok(sync.some(r => r.level === 'error' && r.kind === '없는 사운드 참조' && r.msg.includes('nope')), '없는 sound: id');
  eq(snapshotFiles(dir), before); assert.strictEqual(JSON.stringify(S.keys().map(k => S.get(k))), data, '검사가 데이터를 바꿈');
});

test('검사: 잘못된 타일 번호 · 없는 오브젝트 종류 · 방 템플릿 오브젝트 참조 · 조합 타일 칸 번호 · 자동 생성 규칙', async () => {
  const { ctx } = await newProject();
  const S = ctx.PDM.store, k = S.keys('node')[0], rk = 'room:tst';
  S.edit('project', '확장', p => { p.extensions = { tilecombos: true }; });
  S.edit(k, '맵', r => { r.mode = 'handmade'; r.size = { w: 3, h: 2 }; r.layers.terrain = [1, 999, 7, 1, 1, 1]; r.objects = [{ id: 'g', type: 'ghost', at: { x: 0, y: 0 } }]; });
  S.add(rk, Object.assign(ctx.PDM.clone(S.get(S.keys('room')[0]) || {}), { id: 'tst', name: 'tst', kind: 'standard', size: { w: 5, h: 5 }, layers: { terrain: new Array(25).fill(4) }, objects: [{ id: 'r1', type: 'mob', ref: 'no_such_mob', at: { x: 2, y: 2 } }] }));
  S.edit('tilecombos', '조합', t => { t.list = [{ id: 'c', name: 'c', sprites: [{ src: 'tileset', tile: 300, layer: 'base' }], autogen: { enabled: true, where: 'sky', chance: 5, themes: ['custom:gone'], terrains: [999] } }]; });
  const res = ctx.PDM.validate(), m = res.map(r => `${r.level}|${r.open}|${r.kind || ''}|${r.msg}`).join('\n');
  assert.ok(res.some(r => r.level === 'error' && r.kind === '잘못된 타일 번호' && r.open === k && r.cell.x === 1 && r.cell.y === 0), '지형 999:\n' + m);
  assert.ok(res.some(r => r.level === 'error' && r.kind === '잘못된 오브젝트 종류' && r.msg.includes('ghost')), '오브젝트 종류');
  assert.ok(res.some(r => r.level === 'error' && r.open === rk && r.msg.includes('no_such_mob')), '방 템플릿 오브젝트 참조 (예전엔 검사하지 않았음)');
  assert.ok(res.some(r => r.level === 'error' && r.msg.includes('타일셋 칸 번호 300')), '조합 칸 번호');
  assert.ok(res.some(r => r.level === 'error' && r.msg.includes('"sky"')), '자동 생성 위치');
  assert.ok(res.some(r => r.level === 'warn' && r.msg.includes('custom:gone')), '없는 테마');
  assert.ok(res.some(r => r.level === 'warn' && r.msg.includes('지형 999')), '없는 지형');
});

test('검사: 손상된 JSON 파일을 오류로 보여 줌 (기본값으로 연 상태) · 파일은 그대로', async () => {
  const { dir } = await newProject();
  fs.writeFileSync(path.join(dir, 'title.json'), '{ broken');
  fs.writeFileSync(path.join(dir, 'characters', 'zz_bad.json'), '{ "id": ');
  const c = env.load(); await c.PDM.store.load(dir);
  const res = c.PDM.validate().filter(r => r.kind === '손상된 파일').map(r => r.where).sort();
  eq(res, ['characters/zz_bad.json', 'title.json']);
  assert.strictEqual(read(path.join(dir, 'title.json')), '{ broken');
});

// ------------------------------------------------------------ ⑦ 자동 생성 배치 방식 (tilecombos.json autogenVersion)

test('자동 생성 배치 방식: 새로 만드는 조합 파일 = 2 · 값이 없는 예전 파일 = 그대로(1) — 열고 저장해도 바뀌지 않음', async () => {
  const { ctx, dir } = await newProject();
  assert.ok(!fs.existsSync(path.join(dir, 'maps', 'tilecombos.json')));
  ctx.PDM.store.edit('tilecombos', '첫 조합', t => { t.list = [{ id: 'a', name: 'a', sprites: [] }]; });
  await ctx.PDM.store.save();
  assert.strictEqual(json(path.join(dir, 'maps', 'tilecombos.json')).autogenVersion, 2, '새 파일');
  const old = { format: 'pdmaker-tilecombos', version: 1, legacy: [], list: [{ id: 'b', name: 'b', sprites: [], autogen: { enabled: true, where: 'floor', chance: 5 } }] };
  fs.writeFileSync(path.join(dir, 'maps', 'tilecombos.json'), JSON.stringify(old));
  const c2 = env.load(); await c2.PDM.store.load(dir);
  assert.strictEqual(c2.PDM.store.get('tilecombos').autogenVersion, undefined);
  assert.ok(!c2.PDM.store.dirtyKeys().includes('tilecombos'));
  c2.PDM.store.edit('tilecombos', '편집', t => { t.list[0].name = 'bb'; }); await c2.PDM.store.save();
  assert.strictEqual(json(path.join(dir, 'maps', 'tilecombos.json')).autogenVersion, undefined, '예전 파일이 저장하면서 바뀜');
});

test('자동 생성 배치 방식: 런타임(MakerCombos)이 버전 1 공식을 그대로 두고 2 에서만 순번을 뺌', () => {
  const src = read(path.join(PDMK, 'MakerCombos.java'));
  assert.ok(src.includes('Dungeon.seedCurDepth() * 31337L + c.getString("id", "").hashCode() * 7L + (stable ? 0 : idx)'), '씨앗 공식');
  assert.ok(/getInt\("autogenVersion", 1\) >= 2/.test(src), '값이 없으면 1');
  assert.ok(/for \(JsonValue c : order\) \{\s*idx\+\+;/.test(src), 'idx 는 버전 1 에서 목록 순서대로 하나씩 (꺼진 조합 포함 — 예전과 같음)');
});

// ------------------------------------------------------------ 실행
(async () => {
  const only = process.argv[2];
  let pass = 0, fail = 0;
  for (const t of tests) {
    if (only && !t.name.includes(only)) continue;
    try { const r = await t.fn(); pass++; console.log(`✓ ${t.name}${r ? `\n    ${r}` : ''}`); }
    catch (e) { fail++; console.log(`✗ ${t.name}\n    ${String(e && e.message || e).split('\n').join('\n    ')}`); }
  }
  tmpDirs.forEach(d => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* 무시 */ } });
  console.log(`\n${pass} 통과 · ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})();
