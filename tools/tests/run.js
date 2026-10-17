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
