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

test('레이어 범위 (5차): 레이어만 복사 · 붙여넣기 · 지우기 — 다른 레이어 · 지형 · 오브젝트는 그대로, 빈 칸은 투명, 잠긴 레이어는 안 건드림', () => {
  const { A } = areaEnv(), d = sampleMap(), before = JSON.parse(JSON.stringify(d));
  const terrainOf = id => ({ ut_a: 1, ut_b: -1, ut_c: 4 })[id] ?? -1, order = ['base', 'walldeco'];
  const c = A.copy(d, { x0: 1, y0: 1, x1: 3, y1: 1 }, 'node:m', { layer: 'walldeco' });
  eq(c.layer, 'walldeco'); eq(c.tiles, { walldeco: ['ut_b', '', 'ut_c'] }); eq(c.objects, []);
  eq(d, before);                                                       // 복사는 원본을 바꾸지 않음
  // 같은 레이어에 붙여넣기 (0,3): 빈 칸('')은 투명 → base · 지형 · 오브젝트 그대로, 칠한 칸의 지형은 가장 위 레이어 타일의 지형(ut_c = 4)
  const res = A.paste(d, c, 0, 3, { key: 'node:m', terrainOf, order });
  eq(res.cells, 2); eq(d.layers.tiles.base, before.layers.tiles.base);
  eq([d.layers.tiles.walldeco[15], d.layers.tiles.walldeco[16], d.layers.tiles.walldeco[17]], ['ut_b', '', 'ut_c']);
  eq(d.layers.terrain[15], 1); eq(d.layers.terrain[17], 4); eq(d.objects, before.objects);
  // 다른 레이어로 붙여넣기 (opts.layer) · 잠긴 레이어면 거부
  const d2 = sampleMap(); A.paste(d2, c, 0, 0, { layer: 'base', terrainOf, order }); eq(d2.layers.tiles.base[0], 'ut_b'); eq(d2.layers.tiles.walldeco, sampleMap().layers.tiles.walldeco);
  assert.throws(() => A.paste(sampleMap(), c, 0, 0, { layer: 'base', locked: new Set(['base']) }), /잠긴/);
  // 레이어만 지우기: walldeco 만 비움 → (1,1) 의 지형은 남은 base 타일(ut_a = 1)로, (3,1) 은 지형을 가진 타일이 없어 그대로
  const d3 = sampleMap(); d3.layers.terrain[6] = 4; A.clear(d3, { x0: 0, y0: 0, x1: 4, y1: 3 }, { layer: 'walldeco', terrainOf, order });
  assert.strictEqual(d3.layers.tiles.walldeco, undefined); eq(d3.layers.tiles.base, sampleMap().layers.tiles.base); eq(d3.layers.terrain[6], 1); eq(d3.layers.terrain[8], 1); eq(d3.objects.length, 4);
  // 전부 범위 지우기 · 붙여넣기에서도 잠긴 레이어는 그대로
  const d4 = sampleMap(); A.clear(d4, { x0: 0, y0: 0, x1: 4, y1: 3 }, { locked: new Set(['base']) }); eq(d4.layers.tiles.base, sampleMap().layers.tiles.base); assert.strictEqual(d4.layers.tiles.walldeco, undefined);
  const full = A.copy(sampleMap(), { x0: 0, y0: 0, x1: 4, y1: 3 }, 'node:m'), d5 = sampleMap(); d5.layers.tiles.base[6] = 'keep';
  A.paste(d5, full, 0, 0, { key: 'node:m', locked: new Set(['base']) }); eq(d5.layers.tiles.base[6], 'keep');
});

test('레이어 지형 다시 정하기 (retopTerrain): 가장 위 레이어 중 지형을 가진 타일 — 위 타일을 지우면 아래 타일의 지형으로, 지형 없는 타일은 무시', () => {
  const { A } = areaEnv(), terrainOf = id => ({ floor: 1, wall: 4, deco: -1 })[id] ?? -1, order = ['base', 'wall', 'front'];
  const L = { terrain: [9], tiles: { base: ['floor'], wall: ['wall'], front: ['deco'] } };
  A.retopTerrain(L, 0, { terrainOf, order }); eq(L.terrain[0], 4);          // 벽(위) > 바닥(아래), 장식은 지형 없음
  L.tiles.wall[0] = ''; A.retopTerrain(L, 0, { terrainOf, order }); eq(L.terrain[0], 1);   // 위 벽을 지우면 아래 바닥의 지형
  L.tiles.base[0] = ''; A.retopTerrain(L, 0, { terrainOf, order }); eq(L.terrain[0], 1);   // 지형을 가진 타일이 없으면 그대로
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

// ------------------------------------------------------------ ⑧ 이벤트 · 연출 (편집기 명령 ↔ 런타임 EventInterpreter · MakerStage)

test('이벤트 명령: 편집기의 모든 명령을 런타임이 처리 · 연출 명령이 멈춤 감시 대상', () => {
  const { PDM } = env.load();
  const src = read(path.join(PDMK, 'EventInterpreter.java'));
  const cases = new Set([...src.matchAll(/case "(\w+)"/g)].map(m => m[1]));
  eq(Object.keys(PDM.COMMANDS).filter(k => !cases.has(k) && !PDM.COMMANDS[k].plugin), []);
  const waits = src.match(/UI_WAITS = [^;]*asList\(([^)]*)\)/)[1];
  ['text', 'choice', 'wait', 'fade', 'illust', 'illustMove', 'waitInput'].forEach(c => assert.ok(waits.includes(`"${c}"`), c));
  return `명령 ${Object.keys(PDM.COMMANDS).length}개`;
});

test('일러스트 자리: 편집기 미리보기(PDM.Dialogue.stageLayout) = 런타임 MakerStage 계산', () => {
  const { PDM } = env.load();
  const L = PDM.Dialogue.stageLayout, near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≠ ${b}`);
  for (const [W, H] of [[480, 270], [270, 585]]) {   // 가로 화면 · 세로 화면(휴대폰)
  // 런타임 MakerStage.show/place 를 그대로 옮긴 기준식
  const ref = (pos, iw, ih, o = {}) => {
    const full = pos === 'full', th = full ? H : Math.min(H * 0.9, W * ih / iw); let bs, bx, by;
    if (full) { bs = Math.max(W / iw, H / ih); bx = (W - iw * bs) / 2; by = (H - ih * bs) / 2; } else { bs = th / ih; const w0 = iw * bs; bx = pos === 'left' ? W * 0.04 : pos === 'right' ? W * 0.96 - w0 : (W - w0) / 2; by = th < H * 0.9 - 0.5 ? (H - th) / 2 : H - th; }
    const sc = bs * (o.scale || 1), w0 = iw * bs, h0 = ih * bs, w = iw * sc, h = ih * sc;
    return { x: bx + (o.ox || 0) + (w0 - w) / 2, y: by + (o.oy || 0) + (h0 - h), w, h };
  };
  for (const [iw, ih] of [[300, 500], [1920, 1080]]) for (const pos of ['left', 'center', 'right', 'full']) for (const o of [{}, { scale: 0.5 }, { scale: 1.3, ox: 12, oy: -7 }]) {
    const a = L(pos, W, H, iw, ih, o), b = ref(pos, iw, ih, o); ['x', 'y', 'w', 'h'].forEach(k => near(a[k], b[k]));
    if (pos !== 'full' && !o.scale) assert.ok(a.w <= W + 1e-6, `${W}×${H} ${pos} ${iw}×${ih}: 폭 ${a.w} 이 화면보다 넓음`);
  }
  // 아래 가운데 기준으로 커지고 작아짐 (서 있는 그림)
  const a = L('center', W, H, 300, 500, {}), b = L('center', W, H, 300, 500, { scale: 0.5 });
  near(a.x + a.w / 2, b.x + b.w / 2); near(a.y + a.h, b.y + b.h);
  }
  const java = read(path.join(PDMK, 'MakerStage.java'));
  ['H * 0.9f', 'th = Math.min(th, W * img.height / img.width)', 's.baseY = th < H * 0.9f - 0.5f ? (H - th) / 2f : H - th', 'W * 0.04f', 'W * 0.96f - iw', 'img.x = s.baseX + s.ox + (w0 - w) / 2f', 'img.y = s.baseY + s.oy + (h0 - h)', 'k * k * (3 - 2 * k)'].forEach(t => assert.ok(java.includes(t), '런타임 식이 바뀜: ' + t));
  assert.strictEqual(PDM.Dialogue.ease(0.5), 0.5);
});

test('명령의 빈 값: 목록 ⚠ · 검사(F7) 경고 — 대사 · 일러스트 그림 · 소리 (배경음 끄기는 소리 없어도 됨)', async () => {
  const { ctx } = await newProject();
  const P = ctx.PDM;
  eq(P.commandProblems({ cmd: 'illust', slot: 1, image: '' }).length, 1);
  eq(P.commandProblems({ cmd: 'sound', kind: 'bgmStop' }), []);
  eq(P.commandProblems({ cmd: 'sound', kind: 'se', file: '' }).length, 1);
  eq(P.commandProblems({ cmd: 'nope' }).length, 1);
  P.store.edit('project', '확장', p => { p.extensions = { event: true }; });
  P.store.add('event:ev', { format: 'pdmaker-event', version: 1, id: 'ev', name: 'ev', pages: [{ trigger: 'action', conds: {}, cond: '', commands: [{ cmd: 'illust', slot: 1, image: '' }, { cmd: 'illust', slot: 2, image: 'assets/illustrations/none.png' }, { cmd: 'text', text: '' }] }] });
  const res = P.validate().filter(r => r.open === 'event:ev');
  assert.strictEqual(res.filter(r => r.kind === '빈 값').length, 2, res.map(r => r.msg).join(' | '));
  const a = await P.validateAssets();
  assert.ok(a.issues.some(r => r.ref === 'assets/illustrations/none.png' && r.kind === '없는 에셋'), '없는 일러스트 그림');
});

test('연출 이벤트 저장 · 불러오기: 새 칸(크기 · 불투명도 · 움직이기 · 입력 기다리기 · 글자 속도 · 저절로 · 배경음 끄기)이 그대로', async () => {
  const { ctx, dir } = await newProject();
  const cmds = [{ cmd: 'illust', slot: 2, image: 'game:splashes/mage.jpg', pos: 'left', fade: 3, scale: 50, alpha: 80, ox: 4, oy: -2, flip: true, wait: true },
    { cmd: 'text', name: '안내자', text: '첫 줄\n둘째 줄', speed: 'fast', auto: 15 }, { cmd: 'illustMove', slot: 2, pos: 'right', scale: 60, time: 5 },
    { cmd: 'waitInput' }, { cmd: 'sound', kind: 'bgmStop', fade: 10 }, { cmd: 'illustHide', slot: 0, fade: 3 }];
  ctx.PDM.store.add('event:cut', { format: 'pdmaker-event', version: 1, id: 'cut', name: '연출', pages: [{ trigger: 'action', conds: {}, cond: '', commands: cmds }] });
  await ctx.PDM.store.save();
  const c2 = env.load(); const probs = await c2.PDM.store.load(dir);
  eq(probs, []);
  eq(c2.PDM.store.get('event:cut').pages[0].commands, cmds);
  eq(c2.PDM.store.dirtyKeys(), []);
  // 요약 글 (목록)
  const S = k => c2.PDM.COMMANDS[k].sum;
  assert.ok(S('illust')(cmds[0]).includes('50%') && S('illust')(cmds[0]).includes('대기'));
  assert.ok(S('text')(cmds[1]).includes('⏱1.5초'));
  assert.ok(S('sound')(cmds[4]).includes('배경음 끄기'));
});

// ------------------------------------------------------------ ⑨ 디자인 토큰 (4차 · 색 체계)
const CSS = () => fs.readFileSync(path.join(ROOT, 'editor/renderer/css/app.css'), 'utf8');
/** css 의 토큰 묶음 → { 이름: 값 } (color-mix(in srgb, A p%, B) 는 계산) */
function tokens(block) {
  const raw = {}; for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) raw[m[1]] = m[2].trim();
  return raw;
}
function themeTokens(theme) {
  const css = CSS(), dark = tokens(css.slice(css.indexOf(':root {'), css.indexOf(':root[data-theme="light"]')));
  if (theme === 'dark') return dark;
  const ls = css.indexOf(':root[data-theme="light"]'); return Object.assign({}, dark, tokens(css.slice(ls, css.indexOf('}', ls))));
}
function rgbOf(v, T, depth = 0) {
  if (depth > 6) throw new Error('토큰 순환: ' + v);
  v = v.trim();
  if (/^#[0-9a-f]{3}$/i.test(v)) v = '#' + [...v.slice(1)].map(c => c + c).join('');
  let m = /^#([0-9a-f]{6})$/i.exec(v); if (m) { const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  m = /^var\((--[\w-]+)\)$/.exec(v); if (m) { if (!(m[1] in T)) throw new Error('없는 토큰: ' + m[1]); return rgbOf(T[m[1]], T, depth + 1); }
  m = /^color-mix\(in srgb,\s*(.+?)\s+(\d+)%,\s*(.+)\)$/.exec(v);
  if (m) { if (m[3].trim() === 'transparent') return null; const a = rgbOf(m[1], T, depth + 1), b = rgbOf(m[3], T, depth + 1), t = +m[2] / 100; return a.map((x, i) => x * t + b[i] * (1 - t)); }
  return null;
}
const lumi = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const contrast = (a, b) => { const x = lumi(a), y = lumi(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

test('색 체계: 글자 · 상태 색 대비 (패널 · 작업 공간 · 입력 칸 바탕) — 어두운 · 밝은 테마 모두 4.5:1 이상, 강조색 테두리 3:1 이상', () => {
  const out = [];
  for (const th of ['dark', 'light']) {
    const T = themeTokens(th), C = n => rgbOf(`var(${n})`, T);
    for (const fg of ['--fg', '--mute', '--dim', '--accent', '--good', '--bad', '--warn', '--info', '--gold'])
      for (const bg of ['--bg', '--bg2', '--bg3']) {
        const r = contrast(C(fg), C(bg));
        assert.ok(r >= 4.5, `${th}: ${fg} / ${bg} = ${r.toFixed(2)} (4.5 미만)`);
      }
    const onAcc = contrast(C('--on-accent'), C('--accent2'));
    assert.ok(onAcc >= 4.5, `${th}: 주요 버튼 글자 --on-accent / --accent2 = ${onAcc.toFixed(2)}`);
    const sel = contrast(C('--accent'), C('--bg2'));
    assert.ok(sel >= 3, `${th}: 선택 테두리 --accent / --bg2 = ${sel.toFixed(2)}`);
    // 분류 색은 글자로 쓰임 → 4.5:1
    for (let i = 1; i <= 6; i++) { const r = contrast(C('--cat-' + i), C('--bg2')); assert.ok(r >= 4.5, `${th}: --cat-${i} = ${r.toFixed(2)}`); }
    out.push(`${th}: 보조 글자(--dim) ${contrast(C('--dim'), C('--bg2')).toFixed(1)}:1 · 주요 버튼 ${onAcc.toFixed(1)}:1 · 강조 ${sel.toFixed(1)}:1`);
  }
  // 보라 기운이 없는 중성 바탕 (R·G·B 차이가 작고, 파랑이 빨강보다 지나치게 크지 않음)
  for (const th of ['dark', 'light']) { const T = themeTokens(th); for (const n of ['--bg', '--bg2', '--bg3', '--bg4', '--line']) { const [r, g, b] = rgbOf(`var(${n})`, T); assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 14 && !(b > g + 4 && r > g + 2), `${th} ${n} 이 중성색이 아님: ${[r, g, b].map(Math.round)}`); } }
  return out.join(' · ');
});

test('색 체계: 편집기 코드가 쓰는 var(--토큰) 이 모두 정의돼 있음 (예전: --acc · --accent-bg 가 없어 늘 보라 기본값)', () => {
  const css = CSS(), defined = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
  // 코드가 그때그때 넣는 변수 (요소 style 로 설정)
  ['--d', '--treeW', '--inspW', '--bottomH', '--i', '--w', '--h', '--x', '--y', '--c', '--k', '--on-bg', '--on-line', '--on-fg'].forEach(n => defined.add(n));
  const dir = path.join(ROOT, 'editor/renderer'), bad = [];
  const scan = (f, txt) => { for (const m of txt.matchAll(/var\((--[\w-]+)/g)) if (!defined.has(m[1])) bad.push(`${f}: ${m[1]}`); };
  scan('app.css', css);
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.js$/.test(e.name) && !/motion-presets|motion\.js|textfx|filter\.js/.test(e.name)) scan(path.relative(dir, p), fs.readFileSync(p, 'utf8')); });
  walk(path.join(dir, 'js'));
  eq([...new Set(bad)], []);
  // 편집기 UI 의 옛 보라 직접 값이 남지 않음 (게임 그림 · 모션 예제 · 색 팔레트 같은 "게임 콘텐츠 색"은 예외)
  const left = [];
  ['js/app.js', 'js/audio.js', 'js/commands.js', 'js/editors/map.js', 'js/editors/heart.js', 'js/editors/quests.js', 'js/editors/badges.js', 'js/editors/trailer.js', 'js/editors/combos.js', 'css/app.css']
    .forEach(f => { const t = fs.readFileSync(path.join(dir, f), 'utf8'); if (/#a58bff|#6a45d6|165,\s*139,\s*255/i.test(t.replace(/feeling:.*\n/, ''))) left.push(f); });
  eq(left, []);
});

// ------------------------------------------------------------ ⑩ 테스트 플레이 실행 환경 (5차 · PDM.testEnv ↔ 런타임 MakerTestEnv ↔ gradle init)

test('실행 환경 설정: 없거나 틀린 값 → 안전한 기본값 (예전 프로젝트 = PC) · 고친 칸 알림', () => {
  const { PDM } = env.load(), T = PDM.testEnv;
  eq(T.normalize(undefined).cfg, T.DEFAULT); eq(T.normalize(undefined).fixes, []);
  eq(T.normalize(null).cfg.env, 'pc'); eq(T.normalize('문자열').cfg.env, 'pc');
  const r = T.normalize({ env: 'tablet?', uiScale: 99, speed: 3, safeArea: 'moon', custom: { w: 10, h: 'x', dpi: 5000 }, insets: { l: -5, t: 9999 } });
  eq(r.cfg.env, 'pc'); eq(r.cfg.uiScale, 12); eq(r.cfg.speed, 1); eq(r.cfg.safeArea, 'none');
  eq(r.cfg.custom, { w: 240, h: 2400, dpi: 800 }); eq(r.cfg.insets, { l: 0, t: 1000, r: 0, b: 0 });
  eq(r.fixes.sort(), ['custom.dpi', 'custom.h', 'custom.w', 'env', 'safeArea', 'speed', 'uiScale']);
  [1, 2, 4, 16].forEach(v => eq(T.normalize({ speed: v }).cfg.speed, v));
  eq(T.normalize({ env: 'phone-port', rotate: false, touch: 1, debug: 0 }).cfg, Object.assign({}, T.DEFAULT, { env: 'phone-port', rotate: false, touch: true, debug: false }));
});

test('실행 환경 계산: 기기 픽셀 · 배율(게임 PixelScene 식) · 논리 화면 · PC 창 · 안전 영역을 따로 — 돌린 방향도', () => {
  const { PDM } = env.load(), T = PDM.testEnv;
  // 게임 PixelScene.create 의 배율 식이 그대로인지 (원작이 바뀌면 이 계산도 바꿔야 함)
  const ps = read(path.join(GAME, 'scenes', 'PixelScene.java'));
  ['MIN_WIDTH_L', 'scaleFactor = 2.5f', 'float w = Game.width - insets.left - insets.right', 'maxDefaultZoom = (int)Math.min(w/minWidth, h/minHeight)', 'maxDefaultZoom = Math.max(2, maxDefaultZoom)',
    'if (defaultZoom < Math.ceil( Game.density * 2 ) || defaultZoom > maxDefaultZoom)', 'GameMath.gate(2, (int)Math.ceil( Game.density * scaleFactor ), maxDefaultZoom)'].forEach(t => assert.ok(ps.includes(t), '게임 배율 식이 바뀜: ' + t));
  const consts = Object.fromEntries([...ps.matchAll(/static final float (MIN_\w+)\s*=\s*(\d+)/g)].map(m => [m[1], +m[2]]));
  eq([consts.MIN_WIDTH_L, consts.MIN_HEIGHT_L, consts.MIN_WIDTH_P, consts.MIN_HEIGHT_P], [240, 160, 135, 225]);
  // 안전 영역이 크면 최대 배율이 줄어듦 (게임과 같이 안전 영역을 뺀 크기로)
  eq(T.gameZoom(1080, 2340, 420, 0, 0, { l: 0, t: 700, r: 0, b: 0 }), 7); eq(T.gameZoom(1080, 2340, 420, 0, 0, { l: 0, t: 1000, r: 0, b: 0 }), 5);
  const port = T.resolve({ env: 'phone-port', safeArea: 'notch' });
  eq([port.device, port.zoom, port.logical, port.window, port.winZoom, port.insets], [[1080, 2340], 7, [154, 334], [462, 1002], 3, [0, 42, 0, 21]]);
  eq([port.rotated.device, port.rotated.zoom, port.rotated.logical, port.rotated.window], [[2340, 1080], 6, [390, 180], [1170, 540]]);
  const land = T.resolve({ env: 'phone-land' });
  eq([land.zoom, land.logical, land.window, land.insets], [6, [390, 180], [1170, 540], [0, 0, 0, 0]]);
  eq(land.rotated.logical, port.logical);   // 가로를 돌리면 세로와 같은 논리 화면
  // 직접 넣은 안전 영역: 기기 px → 창 px (창 배율 / 기기 배율), 돌리면 시계 반대로 (위 → 왼쪽)
  const cu = T.resolve({ env: 'custom', custom: { w: 1080, h: 2400, dpi: 400 }, safeArea: 'custom', insets: { l: 0, t: 100, r: 0, b: 50 } });
  eq([cu.zoom, cu.winZoom, cu.logical], [7, 3, [154, 342]]);
  eq(cu.insets, [0, 43, 0, 21]); eq(cu.rotated.insets, [43, 0, 21, 0].map((v, i) => [Math.round(100 * 3 / 6), 0, Math.round(50 * 3 / 6), 0][i]));
  // 사용자가 고른 UI 배율 — 게임 설정 "화면 배율"처럼 허용 범위 안에서만
  eq(T.resolve({ env: 'phone-port', uiScale: 6 }).zoom, 6); eq(T.resolve({ env: 'phone-port', uiScale: 2 }).zoom, 7);
  // PC: 창 = 기기 크기, 배율 자동(0)이면 논리 화면은 미리 세지 않음 · 돌리기 없음
  const pc = T.resolve(undefined);
  eq([pc.kind, pc.window, pc.zoom, pc.logical, pc.iface, pc.rotated], ['pc', [1280, 800], 0, null, 2, undefined]);
  eq(T.resolve({ env: 'pc', uiScale: 2 }).logical, [640, 400]);
  eq(T.resolve({ env: 'phone-port', rotate: false }).rotated, null);
  assert.ok(T.describe(port).includes('154×334') && T.describe(pc).includes('자동'));
});

test('실행 환경 전달: gradle init 스크립트에 그대로(따옴표 · 역슬래시 이스케이프) · 런타임이 읽는 칸 · 배속 값이 같음', () => {
  const { PDM } = env.load(), init = require(path.join(ROOT, 'editor', 'playtest-init.js'));
  const r = PDM.testEnv.resolve({ env: 'custom', custom: { w: 1080, h: 2400, dpi: 400 } });
  r.name = "사용자 '지정' \\ 테스트";   // 이름에 따옴표 · 역슬래시가 있어도
  const s = init.build('C:\\게임\\내 프로젝트', r);
  assert.ok(s.includes("systemProperty 'pdmaker.project', 'C:/게임/내 프로젝트'"));
  const m = s.match(/dbg\.systemProperty 'pdmaker\.testenv', '((?:[^'\\]|\\.)*)'/);
  assert.ok(m, 'desktop:debug 에도 실행 환경');
  eq(JSON.parse(m[1].replace(/\\(.)/g, '$1')), J(r));   // groovy 작은따옴표 문자열을 풀면 원래 JSON
  assert.ok(!init.build('/p', null).includes('pdmaker.testenv'), '실행 환경이 없으면 넘기지 않음 (런타임은 원래대로)');
  const java = read(path.join(PDMK, 'MakerTestEnv.java'));
  ['"insets"', '"speed"', '"window"', '"winZoom"', '"iface"', '"rotated"', '"rotate"', '"touch"', '"debug"', '"name"'].forEach(k => assert.ok(java.includes(k), '런타임이 읽지 않는 칸: ' + k));
  eq(read(path.join(PDMK, 'MakerCutscene.java')).match(/SPEEDS = \{([^}]*)\}/)[1].split(',').map(Number), PDM.testEnv.SPEEDS);   // 6차: 배속은 MakerCutscene
  const main = read(path.join(ROOT, 'editor', 'main.js'));
  assert.ok(/require\('\.\/playtest-init(\.js)?'\)/.test(main), 'main.js 가 같은 모듈로 init 스크립트를 씀');
});

// ------------------------------------------------------------ ⑪ 대사 글꼴 · 연출 (5차 · 편집기 미리보기 ↔ 런타임 MakerDialogue · EventInterpreter)

test('대사 스타일: 편집기 칸 = 런타임이 읽는 칸 · 단위 · 우선순위(대사 → 대사 스타일 → 대사창 설정)', () => {
  const { PDM } = env.load(), D = PDM.Dialogue;
  const src = read(path.join(PDMK, 'EventInterpreter.java'));
  const body = src.slice(src.indexOf('void styleLine('), src.indexOf('String pick(JsonValue c'));
  const rt = new Set([...body.matchAll(/pick\(c, "(\w+)"\)/g)].map(m => m[1]));
  const ed = new Set(PDM.COMMANDS.textStyle.params.map(p => p.k).filter(k => k !== 'reset'));
  eq([...ed].sort(), [...rt].sort());
  eq(PDM.COMMANDS.text.params.filter(p => p.tab && p.tab !== 'main').map(p => p.k).filter(k => k !== 'auto').sort(), [...rt].sort());
  ['/ 10f', '/ 100f'].forEach(t => assert.ok(body.includes(t), '단위가 바뀜: ' + t));
  // 속도 이름표 (런타임 textSpeed)
  const sp = src.match(/static float textSpeed[\s\S]*?switch \(v\) \{([^}]*)\}/)[1];
  eq(Object.fromEntries([...sp.matchAll(/case "(\w+)": return (\d+)/g)].map(m => [m[1], +m[2]])), D.SPEEDS);
  // 우선순위
  const l = D.styleLine({}, { tracking: 2, effect: '' }, { tracking: 5, effect: 'rise', fxDur: 4, fxStrength: 150, size: 120, bold: 'on', speed: 'veryfast' });
  eq([l.tracking, l.effect, l.fxDur, l.fxStrength, l.sizePct, l.bold, l.speed], [2, 'rise', 0.4, 1.5, 120, true, 160]);
  const z = D.styleLine({}, { tracking: 0 }, null); eq(z.tracking, 0);   // 0 도 값 (빈 칸과 다름)
  eq(D.styleLine({}, {}, null).speed, -1); eq(D.styleLine({}, { speed: 'instant' }, null).speed, 0);
  // 대사창 설정 → 기본값
  const s = D.lineStyle({ speed: -1 }, Object.assign(PDM.defaults.dialogue(), { fx: { effect: 'pop', dur: 0.5, scope: 'em' }, text: { tracking: 1 } }));
  eq([s.effect, s.dur, s.strength, s.emOnly, s.tracking, s.speed], ['pop', 0.5, 1, true, 1, 40]);
});

test('대사 연출 식 · 기본값: 편집기 PDM.Dialogue.fxAt = 런타임 TypeText.fx · DEFAULTS 같음 · 글자 = grapheme', () => {
  const { PDM } = env.load(), D = PDM.Dialogue, java = read(path.join(PDMK, 'MakerDialogue.java'));
  ['e = p * p * (3 - 2 * p)', 'case "rise": dy = 3f * strength * (1 - e); a = e;', 'case "drop": dy = -3f * strength * (1 - e); a = e;', 'case "pop": sc = 1 + 0.8f * strength * (1 - e); a = Math.min(1, e * 2);',
    'case "shake": dx = 0.7f * strength * (float) Math.sin(now * 40 + k * 2.3f); dy = 0.7f * strength * (float) Math.cos(now * 33 + k * 1.7f);', 'case "wave": dy = 1.2f * strength * (float) Math.sin(now * 6 + k * 0.6f);', 'case "fade": a = e;']
    .forEach(t => assert.ok(java.includes(t), '런타임 연출 식이 바뀜: ' + t));
  const f = D.fxAt('rise', 0.125, 1, 0, 0.25, 1); eq([+f.dy.toFixed(4), +f.a.toFixed(4)], [1.5, 0.5]);
  eq(D.fxAt('pop', 1, 1, 0, 0.25, 1), { dx: 0, dy: 0, sc: 1, a: 1 });
  // 기본값 (편집기 defaults.dialogue ↔ 런타임 DEFAULTS 문자열)
  const d = PDM.defaults.dialogue();
  eq(d.fx, { effect: 'none', dur: 0.25, strength: 1, scope: 'all', emScale: 1 }); eq(d.text.tracking, 0);
  assert.ok(java.includes('fx:{effect:none,dur:0.25,strength:1,scope:all,emScale:1}') && java.includes('lineSpacing:0,tracking:0'));
  // 글자 단위: 결합 문자 · 이모지 조합을 쪼개지 않음 (런타임 BreakIterator)
  eq(D.graphemes('가나👍🏽é'), ['가', '나', '👍🏽', 'é']);
  assert.ok(java.includes('BreakIterator.getCharacterInstance()'));
});

// ------------------------------------------------------------ ⑫ 6차: 카메라 연출 · 게임 UI 테마 · 연출 배속

test('카메라 연출 식: 편집기 PDM.camera = 런타임 MakerCamera (보간 · 맵 경계 · 흔들림 오프셋 · 잘못된 시간)', () => {
  const { PDM } = env.load(), C = PDM.camera, java = read(path.join(PDMK, 'MakerCamera.java'));
  ['case "linear": return k;', 'case "in": return k * k;', 'case "out": return 1 - (1 - k) * (1 - k);', 'default: return k * k * (3 - 2 * k);',
    'if (map <= view) return map / 2f;', 'return Math.max(view / 2f, Math.min(map - view / 2f, v));', 'return !Float.isFinite(s) || s <= 0 ? 0 : Math.min(60f, s);',
    'd = shDecay.equals("none") ? 1f : shDecay.equals("smooth") ? (1 - k) * (1 - k) : 1 - k;', 'float w = (float) (Math.PI * 2 * shFreq * shT), amp = shPower * d;',
    'amp * (float) (0.7 * Math.sin(w) + 0.3 * Math.sin(w * 2.3 + 1.1))', 'amp * (float) (0.7 * Math.sin(w * 1.13 + 2.0) + 0.3 * Math.cos(w * 1.7))', 'if (shT >= shDur) stopShake();']
    .forEach(t => assert.ok(java.includes(t), '런타임 식이 바뀜: ' + t));
  eq([C.ease('smooth', 0.5), C.ease('linear', 0.3), C.ease('in', 0.5), C.ease('out', 0.5)], [0.5, 0.3, 0.25, 0.75]);
  eq([C.clampAxis(40, 427, 640), C.clampAxis(99999, 427, 640), C.clampAxis(300, 427, 320), C.clampAxis(NaN, 427, 640)], [213.5, 426.5, 160, 320]);   // 작은 맵 = 가운데
  eq([C.safeTime(-1), C.safeTime(NaN), C.safeTime(Infinity), C.safeTime(0), C.safeTime(2)], [0, 0, 0, 0, 2]);
  eq(C.shakeOffset(6, 0.8, 12, 'linear', 'both', 0.8), { x: 0, y: 0 }); eq(C.shakeOffset(6, 0.8, 12, 'linear', 'x', 0.1).y, 0);   // 끝 = 정확히 0 · 방향
  assert.ok(Math.abs(C.shakeOffset(6, 0.8, 12, 'none', 'both', 0.013).x) <= 6);
  eq(C.tileToWorld(2, 3), { x: 40, y: 56 });
  // 런타임이 읽는 명령 칸 = 편집기 칸
  ['"target"', '"x"', '"y"', '"ref"', '"ease"', '"wait"', '"time"', '"kind"', '"event"', '"start"', '"smooth"', '"speed"', '"ax"', '"ay"', '"power"', '"freq"', '"decay"', '"axis"', '"mode"', '"follow"']
    .forEach(k => assert.ok(java.includes('getString(' + k) || java.includes('getFloat(' + k) || java.includes('getBoolean(' + k), '런타임이 읽지 않는 칸: ' + k));
  ['camMove', 'camFollow', 'camShake', 'camReset'].forEach(id => { const d = PDM.COMMANDS[id]; assert.ok(d && d.g === '카메라 / 스크린', id); if (id !== 'camFollow') assert.notStrictEqual(d.defaults.wait, false, id + ' 기본 = 기다림'); });
  return '명령 4개 · 식 12줄 일치';
});

test('설치기: 카메라(PixelScene.PixelCamera.update) · 테마(GameScene.show) 연결 줄이 실제 게임 소스에 붙음', () => {
  const I = require(path.join(ROOT, 'editor', 'runtime-installer.js'));
  const need = [['scenes/PixelScene.java', 'MakerCamera.before(this)'], ['scenes/GameScene.java', 'MakerTheme.onShow(wnd)']];
  for (const [file, text] of need) {
    const p = I.PATCHES.find(x => x.file === file && x.line.includes(text)); assert.ok(p, file);
    const src = read(path.join(GAME, file));
    const m = [].concat(p.anchor).map(a => a.exec(src)).find(Boolean);
    assert.ok(m, `${file}: 붙일 자리를 찾지 못함 (원작이 바뀜)`);
    if (file.includes('PixelScene')) assert.ok(src.slice(src.lastIndexOf('class PixelCamera', m.index), m.index).includes('class PixelCamera'), 'PixelCamera 안이어야 함');
  }
});

test('게임 UI 테마(스프라이트 스킨): 편집기 PDM.gameTheme = 런타임 MakerTheme · 원작 Chrome 조각 · 대사창 빈 칸 연결 · 예전 프로젝트는 그대로', async () => {
  const { PDM } = env.load(), T = PDM.gameTheme;
  const th = read(path.join(PDMK, 'MakerTheme.java')), dl = read(path.join(PDMK, 'MakerDialogue.java'));
  const def = Object.fromEntries([...th.matchAll(/\{ "(\w+)", "(#[0-9a-f]{6})" \}/g)].map(m => [m[1], m[2]]));
  eq(def, T.DEFAULT.colors);
  const link = Object.fromEntries([...dl.matchAll(/THEMED\.put\("([\w.]+)", "(@?\w+)"\)/g)].map(m => [m[1], m[2]]));
  eq(link, T.DIALOGUE_LINK);
  // 조각 좌표 = 원작 Chrome.java (아래 표는 원작 소스에서 옮김 — 원작이 바뀌면 여기도) · UI 기본 조각 = 런타임 MakerTheme.SKIN
  const SPD_CHROME = { WINDOW: '0,0,20,20,6', WINDOW_SILVER: '86,0,22,22,7', TOAST: '20,0,9,9,4', TOAST_TR: '20,9,9,9,4', GREY_BUTTON_TR: '20,9,9,9,4', TOAST_TR_HEAVY: '29,9,9,9,4', TOAST_WHITE: '29,0,9,9,4',
    RED_BUTTON: '38,0,6,6,2', GREY_BUTTON: '38,6,6,6,2', TAG: '22,18,16,14,3', GEM: '0,32,32,32,13', SCROLL: '32,32,32,32,5,11,5,11', TAB_SET: '64,0,20,20,6', TAB_SELECTED: '65,22,8,13,3,7,3,5', TAB_UNSELECTED: '75,22,8,13,3,7,3,5' };
  Object.entries(SPD_CHROME).forEach(([n, r]) => { const v = r.split(',').map(Number); if (v.length === 5) v.push(v[4], v[4], v[4]); eq(T.CHROME[n], v, n); });
  eq(Object.keys(T.CHROME).sort(), Object.keys(SPD_CHROME).sort());
  eq(Object.fromEntries([...th.matchAll(/\{ "(\w+)", "([A-Z_]+)" \}/g)].map(m => [m[1], m[2]])), T.DEFAULT.skin);
  assert.ok(T.SKIN_UI.every(([, , d]) => T.CHROME[d]) && T.TOKENS.every(([k]) => T.DEFAULT.colors[k]));
  // 대비: 원작 chrome.png 의 조각 가운데 색(원작 그림에서 잰 값 · 알파)으로 — 기본 글자 색이 모두 읽힘, 어두운 글자는 걸림
  const CENTER = { WINDOW: ['#3e4039', 1], TOAST_TR: ['#3e4039', 0.6], GREY_BUTTON_TR: ['#3e4039', 0.6], RED_BUTTON: ['#b22a2a', 1], TOAST_WHITE: ['#f2f2f2', 1] };
  const fake = async n => CENTER[n] ? { center: CENTER[n][0], alpha: CENTER[n][1], m: T.CHROME[n].slice(4), type: n } : null;
  const ok = await T.checks(T.DEFAULT, fake); eq(ok.length, 7); ok.forEach(c => assert.ok(c.ok, '기본 테마 대비: ' + c.label + ' ' + c.ratio));
  const dark = await T.checks(T.normalize({ colors: { text: '#202020' } }), fake); assert.ok(dark.some(c => !c.ok && c.f === 'text'), '어두운 글자는 경고');
  const white = await T.checks(T.normalize({ skin: { box: 'TOAST_WHITE' } }), fake); assert.ok(white.find(c => c.label.startsWith('대사 글자')).ok === false, '흰 조각 + 흰 글자 경고');
  eq(T.normalize({ colors: { text: 'red', accent: '#ABCDEF' }, skin: { box: 'NOPE', name: 'SCROLL' } }).colors.accent, '#abcdef');
  eq([T.normalize({ colors: { text: 'red' } }).colors.text, T.normalize({ skin: { box: 'NOPE' } }).skin.box, T.normalize({ skin: { name: 'SCROLL' } }).skin.name], ['#ffffff', 'WINDOW', 'SCROLL']);
  // 새 프로젝트: theme.json 생김 · 대사창 색 = 빈 칸(테마) · 내보낸 게임 배속 표시줄 켬
  const { ctx, dir } = await newProject();
  assert.ok(fs.existsSync(path.join(dir, 'theme.json')), '새 프로젝트 theme.json');
  const dj = json(path.join(dir, 'dialogue.json'));
  eq([dj.box.style, dj.box.textColor, dj.name.textColor, dj.indicator.color], ['', '', '', '']); eq(json(path.join(dir, 'project.json')).cutsceneSpeed, true);
  const c = ctx.PDM.Dialogue.cfg(); eq([c.box.style, c.box.textColor, c.box.highlight, c._skin.box], ['skin', T.DEFAULT.colors.text, T.DEFAULT.colors.accent, 'WINDOW']);   // 미리보기도 테마 (스프라이트 스킨)
  assert.ok(c.box.color && c.name.color, '테마와 상관없는 빈 칸 = 기본값');
  // 예전 프로젝트: theme.json · dialogue.json 이 없으면 → 열기 · 저장해도 theme.json 을 만들지 않음, 대사창은 예전 색
  fs.rmSync(path.join(dir, 'theme.json')); fs.rmSync(path.join(dir, 'dialogue.json'));
  const pj = json(path.join(dir, 'project.json')); delete pj.cutsceneSpeed; fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify(pj));
  const old = env.load(); await old.PDM.store.load(dir); await old.PDM.store.save();
  assert.ok(!fs.existsSync(path.join(dir, 'theme.json')), '예전 프로젝트에 theme.json 을 만들면 안 됨');
  eq(json(path.join(dir, 'dialogue.json')).box.color, '#ffffff'); eq(json(path.join(dir, 'project.json')).cutsceneSpeed, undefined);
  // 테마를 고치면 그때 파일이 생기고 저장 · 다시 열기 후 그대로
  old.PDM.store.edit('theme', '테마', t => { t.colors.accent = '#123456'; }); await old.PDM.store.save();
  const again = env.load(); await again.PDM.store.load(dir); eq(again.PDM.gameTheme.get().colors.accent, '#123456');
});

test('연출 배속: 런타임 상태 모델 — 끝 · 취소 · 오류 = 1× · 표시와 시간은 따로 · 중첩은 실제 실행 상태로', () => {
  const cs = read(path.join(PDMK, 'MakerCutscene.java')), ei = read(path.join(PDMK, 'EventInterpreter.java'));
  ['if (!a && wasActive) {', 'speed = 1; skipping = false;', 'public static int timeScale() { return wasActive ? (skipping ? 16 : speed) : 1; }', 'Game.timeScale = timeScale();',
    'if (EventInterpreter.busy())', 'MakerCamera.animating()', 'windowKind()', 'tokens.values()', 'if (e == null || !visible) return false;']
    .forEach(t => assert.ok(cs.includes(t), '상태 모델이 바뀜: ' + t));
  assert.ok(!/Game\.timeScale\s*=/.test(read(path.join(PDMK, 'MakerTestEnv.java'))), 'Game.timeScale 은 MakerCutscene 한 곳에서만');
  assert.ok(ei.includes('MakerCamera.eventEnded(this)') && ei.includes('MakerCamera.eventEnded(current)'), '이벤트 끝 · 취소 때 카메라 정리');
});

// ------------------------------------------------------------ 7차: 타이틀 화면
/** 타이틀 공통 규칙 검사 입력 (편집기 · 런타임에 똑같이 넣음) */
function titleCases(M) {
  const C = [];
  const bsList = [{}, { style: 'RED_BUTTON' }, { style: 'NOPE', states: { hover: { bright: 1.5, textColor: '#00FF00' }, disabled: { alpha: 0.4, skin: 'TOAST' }, pressed: { dy: 2, scale: 1.1 } } },
    { states: { normal: { skin: 'TOAST_TR', textColor: '#123456', slice: 3 }, focus: { skin: 'BAD' } } }];
  const itemList = [null, { id: 'x', states: { hover: { textColor: '#ff0000', alpha: 3 }, normal: { image: 'img/b.png', slice: '6' } } }, { id: 'y', states: { disabled: { textAlpha: 0.5 }, focus: { bright: '' } } }];
  for (const bs of bsList) for (const item of itemList) for (let f = 0; f < 16; f++) {
    const flags = { hover: !!(f & 1), focus: !!(f & 2), pressed: !!(f & 4), disabled: !!(f & 8) };
    C.push({ fn: 'style', bs, item, flags, accent: f === 3 ? '#ffff44' : null });
  }
  const fxs = Object.values(M.FX_PRESETS).map(x => x[1]).concat([{ type: 'move', dir: 'left', from: 10, to: -5, duration: 0.4, delay: 0.2, repeat: 2, yoyo: true, ease: 'back' },
    { type: 'shake', dir: 'y', from: 4, to: 1, duration: 0.5, repeat: 1, freq: 7 }, { type: 'fade', duration: -3, repeat: 'x', ease: 'nope' }, { type: 'bogus' }, {}]);
  for (const fx of fxs) for (const tau of [0, 0.03, 0.1, 0.2, 0.35, 0.5, 0.8, 1, 1.3, 2.7, 9]) C.push({ fn: 'fx', fx, tau });
  for (const fx of fxs.slice(4, 8)) for (const [tau, active, dt] of [[0, true, 0.1], [0.3, false, 0.05], [5, false, 0.1], [0.02, false, 0.1], [2, true, 0.016]]) C.push({ fn: 'held', fx, tau, active, dt });
  const lb = [{}, { items: [{ id: 'play', visible: false }, { id: 'c', custom: true, action: 'continue' }, { id: 'h', action: 'continue', noSave: 'hide' }, { id: 'n', action: 'continue', noSave: 'newgame' },
    { id: 'q', action: 'quit' }, { id: 'z', action: 'close' }, { id: 'about', enabled: false }, { id: 'plain' }, { id: 'w', action: 'window', window: 'a' }, { id: 'c' }] }];
  for (const bs of lb) for (const hasSaves of [false, true]) for (const canQuit of [false, true]) C.push({ fn: 'list', bs, hasSaves, canQuit });
  const screens = [[427, 267, true], [480, 300, true], [390, 180, true], [154, 334, false], [135, 292, false]];
  const lays = [{}, { layout: 'grid', columns: 3, firstWide: true, height: 18.7, gap: '4' }, { layout: 'column', width: 0, top: 0.5 }, { layout: 'grid', columns: 2, width: 300, offsetX: -7.5 },
    { layout: 'free', height: 20, width: 100 }, { layout: 'game', top: 0.3, height: 16, width: 200 }, { layout: 'grid', height: '' }];
  const places = [{ x: 0.2, y: 0.8, w: 60, h: 22 }, null, { x: '', y: 0.1 }, { w: 0, h: 30 }, 'bad'];
  for (const [W, H, land] of screens) for (const bs of lays) for (const gate of [{}, { enabled: true }, { enabled: true, logoAfter: 'up' }]) for (const n of [1, 5, 8]) {
    C.push({ fn: 'rects', bs, n, W, H, land, logo: { y: 33.5, h: land ? 57 : 100 }, gate, places: bs.layout === 'free' ? places : null });
  }
  for (const [W, H] of screens) for (const lg of [{}, { y: 0.3, offsetX: 5, offsetY: -3 }, { y: '' }]) for (const gate of [{}, { enabled: true }]) C.push({ fn: 'logo', lg, gate, W, H, size: { w: 240, h: 57 } });
  const area = [[0, 0, 427, 267], [12, 30, 130, 280]];
  for (const el of [{ type: 'text', x: 0, y: 1, anchorX: 0, anchorY: 1, offsetX: 3, offsetY: -2, align: 'left' }, { type: 'text', w: 100, align: 'right', x: 0.5 }, { type: 'text', w: 100, align: 'center' },
    { type: 'image', w: 100, x: '0.25', y: 0.75, anchorX: 1 }, { type: 'text', x: 'abc' }]) for (const a of area) C.push({ fn: 'el', el, area: a, size: { w: 40, h: 9 } });
  for (const el of [{}, { visible: false }, { show: 'gate' }, { show: 'menu' }, { show: '' }]) for (const gate of [false, true]) C.push({ fn: 'shown', el, gate });
  for (const [text, vals, fallback] of [['v{version} · {saveCount}개', { version: '4.0.0', saveCount: '2' }, ''], ['마지막: {lastHero} {lastDepth}층', { lastHero: null }, '저장 없음'], ['{nope} {version}', { version: '1' }, 'x'], ['$1 \\ {date}', { date: '2026-01-02' }, ''], ['', {}, 'f']])
    C.push({ fn: 'bind', text, vals, fallback });
  const win = M.sample({ buttons: { items: [] } }).windows;
  const wins = win.concat([{ id: 'a', w: 30, h: 400, offsetX: -500, offsetY: 900, closeButton: false, padding: 0, content: [{ type: 'image', align: 'right' }, { type: 'space', h: -3 }, { type: 'setting', key: 'sfxVol' }, { type: 'button', w: 500, align: 'left' }] },
    { id: 'b', title: '', closeButton: false, content: [] }, { id: 'c', w: 'wide', h: 10, offsetX: 3.9, content: [{ type: 'text', gap: 0 }, { type: 'divider', thickness: 3 }, { type: 'scroll', h: 2 }] }]);
  for (const w of wins) for (const [W, H] of screens) for (const titleH of [0, 11]) {
    const sizes = (w.content || []).map((c, i) => [c.type === 'image' ? 30 : 9 + i, c.type === 'image' ? 50 : 0]);
    C.push({ fn: 'win', win: w, W, H, safe: W < H ? [0, 20, W, H - 30] : [0, 0, W, H], margins: [6, 6, 6, 6], sizes, titleH });
  }
  return C;
}
/** 편집기 식으로 같은 입력 계산 (출력 모양은 자바 검사 프로그램과 같게) */
function titleRunJS(M, c) {
  const fxA = v => [v.dx, v.dy, v.scale, v.alpha, v.bright];
  switch (c.fn) {
    case 'style': { const o = M.resolveStyle(c.bs, c.item, c.flags, { accent: c.accent, chrome: PDMG.gameTheme.CHROME }); return { skin: o.skin, image: o.image, slice: o.slice, textColor: o.textColor, textAlpha: o.textAlpha, alpha: o.alpha, scale: o.scale, bright: o.bright, dy: o.dy }; }
    case 'fx': return fxA(M.fxValue(c.fx, c.tau));
    case 'held': return M.heldStep(c.tau, c.active, c.dt, c.fx);
    case 'list': return M.buttonList(c.bs, { hasSaves: c.hasSaves, canQuit: c.canQuit }).map(e => ({ id: e.id, gameIndex: e.gameIndex, disabled: e.disabled, action: e.action }));
    case 'rects': return M.buttonRects(c.bs, c.n, c.W, c.H, c.land, c.logo, c.gate, c.places);
    case 'logo': { const r = M.logoRect(c.lg, c.gate, c.W, c.H, c.size); return [r.x, r.y, r.w, r.h]; }
    case 'el': { const r = M.elementRect(c.el, { x: c.area[0], y: c.area[1], w: c.area[2], h: c.area[3] }, c.size); return [r.x, r.y, r.w, r.h, r.tx]; }
    case 'shown': return M.elementShown(c.el, c.gate);
    case 'bind': { const r = M.bindText(c.text, c.vals, c.fallback); return [r.text, ...r.missing.map(k => 'missing:' + k), ...r.unknown.map(k => 'unknown:' + k)]; }
    case 'win': { const L = M.windowLayout(c.win, c.W, c.H, { x: c.safe[0], y: c.safe[1], w: c.safe[2], h: c.safe[3] }, c.margins, c.sizes.map(s => ({ h: s[0], w: s[1] })), c.titleH);
      const R = r => r ? [r.x, r.y, r.w, r.h] : null;
      return { x: L.x, y: L.y, w: L.w, h: L.h, chrome: R(L.chrome), items: L.items.map(R), title: R(L.title), close: R(L.close), overflow: L.overflow, tooTall: L.tooTall }; }
  }
}
let PDMG = null;
/** 숫자는 1e-6 안이면 같음 */
function near(a, b, p) {
  if (typeof a === 'number' && typeof b === 'number') { if (Math.abs(a - b) > 1e-6) throw new Error(`${p}: 편집기 ${a} ≠ 런타임 ${b}`); return; }
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') { if (a !== b) throw new Error(`${p}: 편집기 ${JSON.stringify(a)} ≠ 런타임 ${JSON.stringify(b)}`); return; }
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) throw new Error(`${p}: 칸 수 다름 ${JSON.stringify(a)} / ${JSON.stringify(b)}`);
  ka.forEach(k => near(a[k], b[k], p + '.' + k));
}
test('타이틀 공통 규칙: 편집기 PDM.titleModel = 런타임 MakerTitleModel (실제로 자바를 실행해 같은 입력 비교 — 상태 · 효과 · 버튼 목록 · 배치 · 요소 · 정보 칸 · 창)', () => {
  const { execFileSync } = require('child_process');
  const { PDM } = env.load(); PDMG = PDM; const M = PDM.titleModel;
  const cases = titleCases(M), js = cases.map(c => titleRunJS(M, c));
  let javac = true; try { execFileSync('javac', ['-version'], { stdio: 'ignore' }); } catch (_) { javac = false; }
  if (!javac) return 'javac 가 없어 자바 쪽 비교는 건너뜀 (편집기 쪽 계산만 함) — JDK 를 설치하면 비교함';
  const out = tmp();
  execFileSync('javac', ['-nowarn', '-encoding', 'UTF-8', '-d', out, path.join(PDMK, 'MakerTitleModel.java'), path.join(__dirname, 'TitleModelCheck.java')], { stdio: 'pipe' });
  const res = JSON.parse(execFileSync('java', ['-Dfile.encoding=UTF-8', '-cp', out, 'TitleModelCheck'], { input: Buffer.from(JSON.stringify(cases), 'utf8'), maxBuffer: 64 << 20, stdio: ['pipe', 'pipe', 'pipe'] }).toString('utf8'));
  eq(res.length, cases.length);
  cases.forEach((c, i) => near(J(js[i]), res[i], `#${i} ${c.fn} ${JSON.stringify(c).slice(0, 160)}`));
  const n = fn => cases.filter(c => c.fn === fn).length;
  return `${cases.length}개 입력 모두 같음 (상태 ${n('style')} · 효과 ${n('fx')} · 동안 ${n('held')} · 목록 ${n('list')} · 배치 ${n('rects')} · 로고 ${n('logo')} · 요소 ${n('el') + n('shown')} · 정보 ${n('bind')} · 창 ${n('win')})`;
});

test('타이틀 규칙 (편집기): 상태 우선순위 · 효과 끝 값 · 빠른 재시작 누적 없음 · 이어하기 · 정보 칸 · 창 · 검사', () => {
  const { PDM } = env.load(), M = PDM.titleModel;
  // 비활성이 오버 · 눌림보다 우선 (오버 모양이 덮지 못함), 눌림이 포커스보다 우선
  const bs = { states: { hover: { textColor: '#00ff00', alpha: 0.9 }, disabled: { textColor: '#555555' }, focus: { bright: 2 }, pressed: { bright: 0.5 } } };
  eq(M.resolveStyle(bs, null, { hover: true, disabled: true }).textColor, '#555555');
  eq(M.resolveStyle(bs, null, { hover: true, disabled: true }).alpha, 0.9);   // 비활성에 없는 칸은 아래 상태(오버) 값
  eq(M.resolveStyle(bs, null, { focus: true, pressed: true }).bright, 0.5);
  eq(M.resolveStyle({}, null, {}).skin, 'GREY_BUTTON_TR'); eq(M.resolveStyle({}, null, { pressed: true }).bright, 1.2); eq(M.resolveStyle({}, null, { disabled: true }).textAlpha, 0.3);   // 원작 StyledButton 과 같음
  // 효과: 끝나면 정확히 끝 값, 흔들림 끝 = 0, 번갈아 짝수 번 = 처음 값
  eq(M.fxValue(M.FX_PRESETS.slideUp[1], 10).dy, 0); eq(M.fxValue(M.FX_PRESETS.fadeIn[1], 10).alpha, 1); eq(M.fxValue(M.FX_PRESETS.fadeIn[1], 0).alpha, 0);
  assert.ok(Math.abs(M.fxValue(M.FX_PRESETS.clickShake[1], 10).dx) < 1e-9);
  eq(M.fxValue({ type: 'scale', from: 1, to: 2, duration: 1, repeat: 1, yoyo: true, ease: 'linear' }, 5).scale, 1);
  // "동안" 효과를 짧게 수백 번 켜고 꺼도 시간이 한 바퀴를 넘지 않음 (누적 없음)
  const hv = M.FX_PRESETS.hoverGrow[1]; let tau = 0;
  for (let i = 0; i < 500; i++) { tau = M.heldStep(tau, true, 0.05, hv); tau = M.heldStep(tau, false, 0.01, hv); }
  assert.ok(tau <= 0.15 + 1e-9, 'tau ' + tau); eq(M.fxValue(hv, M.heldStep(tau, false, 1, hv)).scale, 1);
  // 이어하기: 저장 없음 → 흐리게 / 숨김 / 새 게임, 저장 있으면 그대로
  const items = [{ id: 'c', custom: true, action: 'continue' }, { id: 'h', custom: true, action: 'continue', noSave: 'hide' }, { id: 'n', custom: true, action: 'continue', noSave: 'newgame' }];
  const L0 = M.buttonList({ items }, { hasSaves: false, canQuit: true }), L1 = M.buttonList({ items }, { hasSaves: true, canQuit: true });
  eq(L0.filter(e => !M.GAME_IDS.includes(e.id)).map(e => [e.id, e.disabled, e.action]), [['c', true, 'continue'], ['n', false, 'newgame']]);
  eq(L1.filter(e => !M.GAME_IDS.includes(e.id)).map(e => [e.id, e.disabled, e.action]), [['c', false, 'continue'], ['h', false, 'continue'], ['n', false, 'continue']]);
  eq(M.buttonList({ items: [{ id: 'q', action: 'quit' }] }, { canQuit: false }).some(e => e.id === 'q'), false);
  // 정보 칸: 없는 값 → 대체 문구, 모르는 이름 → 그대로 + 검사 오류
  eq(M.bindText('마지막 {lastHero}', {}, '저장 없음').text, '저장 없음'); eq(M.bindText('{version}', { version: '4.0.0' }).text, '4.0.0'); eq(M.bindText('{nope}', {}).unknown, ['nope']);
  // 창: 화면보다 크면 표시 · 이동해도 화면 안
  const L = M.windowLayout({ w: 120, offsetX: 999, content: [{ type: 'space', h: 500 }] }, 427, 267, { x: 0, y: 0, w: 427, h: 267 }, [6, 6, 6, 6], [{ h: 0, w: 0 }], 0);
  eq([L.chrome.x + L.chrome.w <= 425, L.tooTall], [true, true]);
  // 검사: 없는 창 · 닫을 수 없는 창 · 모르는 정보 칸 · 겹친 id · 잘못된 색
  const t = M.sample({ buttons: { items: [] } });
  eq(M.check(t).filter(x => x.level === 'error'), []);
  t.buttons.items.push({ id: 'credits', custom: true, action: 'window', window: 'nope' });
  t.elements.push({ id: 'e1', type: 'text', text: '{nope}', color: 'red' });
  t.windows.push({ id: 'trap', closeButton: false, closeEsc: false, closeOutside: false, content: [{ type: 'text', text: 'x' }] });
  const errs = M.check(t).filter(x => x.level === 'error').map(x => x.msg);
  ['없는 창 "nope"', '닫을 방법이 없는 창', '없는 정보 칸 {nope}', 'id "credits" 가 겹칩니다', '"red" 이(가) 올바른 색'].forEach(m => assert.ok(errs.some(e => e.includes(m)), m + ' — ' + errs.join(' | ')));
  assert.ok(M.check(t).every(x => typeof x.sel === 'string'), '검사 결과마다 편집기에서 고를 대상');
  return `검사 오류 ${errs.length}개 확인`;
});

test('타이틀 데이터 호환: 예전 title.json 은 그대로 · 모르는 칸 유지 · 손상된 값에도 규칙 · 검사가 멈추지 않음', async () => {
  const { ctx, dir } = await newProject(), S = ctx.PDM.store, M = ctx.PDM.titleModel;
  // 6차까지의 title.json (새 칸 없음) + 모르는 칸 → 열고 저장해도 그대로 (title 을 고치지 않으면 파일을 쓰지 않음)
  S.edit('title', '예전', t => { t.enabled = true; t.customX = { keep: [1, 2] }; }); await S.save();
  const file = path.join(dir, 'title.json'), before = read(file);
  const again = env.load(); await again.PDM.store.load(dir); again.PDM.store.edit('project', 'x', p => { p.author = 'a'; }); await again.PDM.store.save();
  eq(read(file), before);
  // 고쳐도 모르는 칸은 남음
  again.PDM.store.edit('title', '고침', t => { t.buttons.items[0].label = '시작'; t.elements = [M.newElement('text', [])]; }); await again.PDM.store.save();
  const j = json(file); eq([j.customX, j.buttons.items[0].label, j.elements.length], [{ keep: [1, 2] }, '시작', 1]);
  // 예전 데이터 = 6차와 같은 버튼 목록 · 배치 (새 칸이 없으면 예전 모습)
  const old = JSON.parse(before), list = M.buttonList(old.buttons, { hasSaves: false, canQuit: true });
  eq(list.map(e => e.id), old.buttons.items.map(x => x.id)); eq(list.every(e => !e.disabled && e.action === ''), true);
  const r = M.buttonRects(old.buttons, list.length, 427, 267, true, { y: 33.575, h: 57 }, old.gate, null);
  eq(r.slice(0, 3).map(x => x.map(v => Math.round(v))), [[97, 129, 116, 20], [215, 129, 116, 20], [97, 158, 77, 20]]);   // 게임(6차) 96.5,129 · 214.5,129 · 96.5,158 (반올림)
  // 손상된 값
  const bad = { elements: 'x', windows: [null, 5, { content: 'x' }, { id: 'w', content: [null, 5, { type: 'button', action: 7 }] }], buttons: { items: [null, 5, { id: 3 }, { id: 'a', states: 'x', effects: [null, 'x', { type: 9 }] }], states: [1, 2], layout: 9 } };
  assert.doesNotThrow(() => { M.check(bad); M.buttonList(bad.buttons, {}); M.buttonRects(bad.buttons, 3, 427, 267, true, { y: 0, h: 0 }, null, [null, 'x', 5]); M.resolveStyle(bad.buttons, bad.buttons.items[3], { hover: true }); M.fxValue(null, 1); M.fxValue('x', 1); M.windowLayout(bad.windows[2], 427, 267, { x: 0, y: 0, w: 427, h: 267 }, [6, 6, 6, 6], [], 0); });
  assert.ok(M.check(bad).some(x => x.level === 'error'));
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
