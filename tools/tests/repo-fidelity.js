#!/usr/bin/env node
// ================================================================
//  10차 — 저장소 기준 데이터 정합성 테스트 (Node 만 — Electron · 게임 빌드 없이)
//    사용: node tools/tests/repo-fidelity.js [--game <game 폴더>] [--out <측정표.json>] [이름 일부]
//    정답은 분석기와 다른 방법(원본 파일을 테스트가 직접 읽는 단순한 규칙)으로 만들고, 분석기 · 편집기 결과와 비교
//    ① 맵 · 지역: Dungeon.newLevel() 의 new XLevel() ↔ 분석 결과 · 맵 그래프 가져오기 · 고정 맵 타일 · 저장 후 다시 열기 · 기준 저장소 회귀
//    ② 영웅: HeroClass enum · actors 글 · spritesheet() 분기 ↔ 편집기 영웅 (id · 이름 · 그림) · 다른 직업 그림으로 바꾸지 않음
//    ③ 몬스터: 목록 · 그림 성공/실패 · 이어받은 그림 · 대표 몬스터 체력 · 그림 없는 몬스터도 목록에 남음
//    ④ 보스: Property.BOSS 를 적은 클래스 ↔ 분류 · 수동 분류가 다시 분석해도 남음
//    ⑤ 업적: enum Badge 항목 수 · 글자 키 · 그림 칸 · 조건을 못 찾은 것 표시
//    ⑥ 타이틀: TitleScene 의 버튼 · 줄 · 로고 칸 (화면 그림 비교는 ui-repofidelity.js)
//    ⑦ 사용자 편집 유지 (다시 분석 · 다시 맞추기) ⑧ 저장소 바꾸기 (섞이지 않음) ⑨ 손상 · 누락 파일
//    저장소가 없으면 그 검사는 "실행하지 못함"으로 실패 (성공으로 꾸미지 않음)
// ================================================================
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const env = require('./editor-env');
const ROOT = path.join(__dirname, '..', '..');
const A = require(path.join(ROOT, 'editor', 'repo-analyzer.js'));
const args = process.argv.slice(2), opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const GAME = path.resolve(opt('--game') || path.join(ROOT, 'game')), OUT = opt('--out');
const filter = args.filter((a, i) => !a.startsWith('--') && !['--game', '--out'].includes(args[i - 1]))[0] || '';
const REPOS = { base: 'shattered-pixel-dungeon-master', ark: 'ARK_PD-main', ba: 'New-Blue-Archive-Pixel-Dungeon-main' };
const PKG = 'core/src/main/java/com/shatteredpixel/shatteredpixeldungeon';
const tests = [], tmpDirs = [], table = {}, notRun = [];
const test = (name, fn) => tests.push({ name, fn });
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pdm-fid-')); tmpDirs.push(d); return d; };
const cacheDir = tmp(), reports = {};
const dirOf = k => path.join(GAME, REPOS[k]);
const need = k => { if (!fs.existsSync(dirOf(k))) { const m = `${REPOS[k]} 저장소가 없어 실행하지 못함 — 필요한 경로: ${dirOf(k)}`; notRun.push(m); throw new Error(m); } return reports[k] || (reports[k] = A.analyze(dirOf(k), { cacheDir })); };
const src = (k, rel) => fs.readFileSync(path.join(dirOf(k), PKG, rel), 'utf8');
const props = (k, rel) => { const d = {}; try { fs.readFileSync(path.join(dirOf(k), 'core/src/main/assets', rel), 'utf8').split(/\r?\n/).forEach(l => { const i = l.indexOf('='); if (i > 0 && !l.startsWith('#')) d[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }); } catch (_) { /* 없음 */ } return d; };
const row = (k, item, v) => { (table[k] = table[k] || {})[item] = v; };
const J = x => JSON.parse(JSON.stringify(x));

// ---------------------------------------------------------------- 정답 (테스트가 원본을 직접 읽음 — 분석기 코드를 쓰지 않음)
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
function truthLevels(k) {
  const s = stripComments(src(k, 'Dungeon.java')), i = s.search(/static\s+Level\s+newLevel\s*\(\s*\)/); let d = 0, j = s.indexOf('{', i), e = j;
  for (; e < s.length; e++) { if (s[e] === '{') d++; else if (s[e] === '}' && --d === 0) break; }
  return [...new Set([...s.slice(j, e).matchAll(/\bnew\s+(\w+)\s*\(\s*\)/g)].map(m => m[1]))];
}
function truthHeroes(k) {
  const s = stripComments(src(k, 'actors/hero/HeroClass.java')), body = s.slice(s.indexOf('enum HeroClass'), s.indexOf(';', s.indexOf('enum HeroClass')));
  const ids = [...body.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*\(/gm)].map(m => m[1]);
  const msg = Object.assign({}, props(k, 'messages/actors/actors.properties'), props(k, 'messages/actors/actors_ko.properties'));   // 게임의 한국어 설정과 같음 (_ko 가 덮음)
  const assets = stripComments(src(k, 'Assets.java')), amap = {}; for (const m of assets.matchAll(/(\w+)\s*=\s*"([^"]+\.png)"/g)) amap[m[1]] = m[2];
  // spritesheet(): switch (this) 의 case → return Assets.Sprites.X
  const sp = s.slice(s.search(/String\s+spritesheet\s*\(\s*\)/)); const sheet = {}; let pend = [], def = '', inThis = false;
  for (const ln of sp.split('\n').slice(0, 200)) {
    if (/switch\s*\(\s*this\s*\)/.test(ln)) { inThis = true; continue; } if (/switch\s*\(/.test(ln)) inThis = false;
    if (!inThis) { const r0 = /return\s+Assets\.Sprites\.(\w+)/.exec(ln); if (r0 && !def && /default/.test(pend.join())) def = amap[r0[1]]; }
    for (const c of ln.matchAll(/case\s+(\w+)\s*:|default\s*:/g)) pend.push(c[1] || 'default');
    const r = /return\s+Assets\.Sprites\.(\w+)/.exec(ln); if (r && inThis) { pend.forEach(c => { if (c === 'default') def = amap[r[1]]; else sheet[c] = amap[r[1]]; }); pend = []; }
    if (/^\s{4}\}/.test(ln) && Object.keys(sheet).length) break;
  }
  return ids.map(id => ({ id, name: msg['actors.hero.heroclass.' + id.toLowerCase()] || '', sheet: sheet[id] || def || '' }));
}
function truthBadges(k) {
  const s = stripComments(src(k, 'Badges.java')), a = s.search(/enum\s+Badge\s*\{/), b = s.indexOf(';', a), body = s.slice(s.indexOf('{', a) + 1, b);
  return [...body.replace(/\([^()]*\)/g, '').matchAll(/(?:^|,)\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?=,|$)/g)].map(m => m[1]);   // ARK: Get_25_STONES (대소문자 섞임)
}
/** actors/mobs 아래 파일 중 클래스 초기화 블록에 Property.BOSS 를 바로 적은 맨 위 클래스 */
function truthBosses(k) {
  const out = [], base = path.join(dirOf(k), PKG, 'actors/mobs');
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.java')) {
    const s = stripComments(fs.readFileSync(p, 'utf8')), cls = e.name.slice(0, -5), m = new RegExp('class\\s+' + cls + '\\b[^{]*\\{\\s*\\{([^{}]*)\\}').exec(s);
    if (m && /properties\.add\s*\(\s*Property\.BOSS\s*\)/.test(m[1])) out.push(path.relative(base, p).replace(/\.java$/, '').split(path.sep).join('.')); } });
  walk(base); return out;
}

// ---------------------------------------------------------------- 편집기 프로젝트 (가짜 Electron — 분석기 연결)
async function project(k, o = {}) {
  const ctx = env.load({ analyzer: true, analysisCache: cacheDir }), P = ctx.PDM; P.log = () => { };
  const dir = o.dir || path.join(tmp(), 'proj'); if (!o.dir) { fs.mkdirSync(dir); await P.store.createNew(dir, 'fid-' + k); } else await P.store.load(dir);
  if (k) { await P.gameScan(dirOf(k), true); if (o.sync !== false) await P.gameSyncVanilla(false, { remove: o.dir ? undefined : 'untouched' }); }
  return { ctx, P, dir };
}

// ================================================================ ① 맵 · 지역
test('ARK 맵: Dungeon.newLevel() 의 모든 층 클래스를 찾음 · 추가 맵(로도스 1~4 · 가비알 · 바다 · 시에스타 · 보스 교체) · 출처 · 생성 방식', () => {
  const r = need('ark'), M = r.objects.maps, truth = truthLevels('ark');
  const got = [...new Set(M.slots.map(s => s.cls))];
  assert.deepStrictEqual(truth.filter(c => !got.includes(c)), [], '놓친 층 클래스');
  assert.deepStrictEqual(got.filter(c => !truth.includes(c)), [], '없는 층 클래스를 지어냄');
  const extra = M.slots.filter(s => s.extra).map(s => s.cls);
  for (const c of ['NewRhodesLevel1', 'NewRhodesLevel2', 'NewRhodesLevel3', 'NewRhodesLevel4', 'GavialLevel', 'SeaLevel_part1', 'SiestaLevel_part1', 'GavialBossLevel2', 'NewPrisonBossLevel']) assert.ok(extra.includes(c), '추가 맵: ' + c);
  const rh = M.slots.find(s => s.cls === 'NewRhodesLevel2'); assert.deepStrictEqual([rh.depth, rh.branch], [[0], 2]);
  const gv = M.slots.find(s => s.cls === 'GavialLevel'); assert.deepStrictEqual(gv.depth, [31, 32, 33, 34]); assert.ok(gv.conds.includes('extrastage_Gavial'), JSON.stringify(gv.conds));
  const sea = M.slots.find(s => s.cls === 'SeaLevel_part1'); assert.ok(sea.conds.includes('!(extrastage_Gavial)') && sea.conds.includes('extrastage_Sea'), '앞 조건이 아닐 때: ' + JSON.stringify(sea.conds));
  for (const s of M.slots.filter(x => !x.fallback)) { const l = M.levels[s.cls]; assert.ok(l && fs.existsSync(path.join(dirOf('ark'), l.file)), '원본 파일: ' + s.cls); }
  const gen = {}; Object.values(M.levels).forEach(l => { gen[l.generator] = (gen[l.generator] || 0) + 1; });
  row('ark', '맵 · 지역', { 원본: truth.length, 인식: got.length, 완전분석: Object.values(M.levels).filter(l => l.generator === 'fixed' || l.generator === 'procedural').length, 편집가능: Object.values(M.levels).filter(l => l.generator === 'fixed').length, 미지원: Object.values(M.levels).filter(l => l.generator === 'code' || l.generator === 'fixed-partial').length });
  return `층 클래스 ${got.length} (원본 ${truth.length}) · 추가 ${extra.length} · 생성 방식 ${JSON.stringify(gen)}`;
});

test('ARK 맵: 고정 맵은 build() 를 따라 그린 타일이 원본과 같음 (NewRhodesLevel1 — Painter.fill 을 테스트가 따로 다시 그림)', () => {
  const r = need('ark'), l = r.objects.maps.levels.NewRhodesLevel1;
  assert.ok(l.layout.determined && l.layout.w === 35 && l.layout.h === 26, JSON.stringify([l.layout.w, l.layout.h, l.layout.unresolved]));
  // 테스트 쪽 그리기: setSize · Arrays.fill · Painter.fill · map[...] = Terrain.X 만 (같은 줄 순서)
  const s = src('ark', 'levels/NewRhodesLevel1.java'), T = {}; for (const m of src('ark', 'levels/Terrain.java').matchAll(/static\s+final\s+int\s+(\w+)\s*=\s*(0x[0-9a-fA-F]+|\d+)/g)) T[m[1]] = /0x/.test(m[2]) ? parseInt(m[2], 16) : +m[2];
  const b = s.slice(s.search(/boolean\s+build\s*\(\s*\)/)); let W = 0, H = 0, map = null;
  for (const st of stripComments(b.slice(0, b.indexOf('return true'))).split(';')) { const t = st.trim(); let m;
    if ((m = /setSize\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)/.exec(t))) { W = +m[1]; H = +m[2]; map = new Array(W * H).fill(0); }
    else if ((m = /Arrays\.fill\s*\(\s*map\s*,\s*Terrain\.(\w+)\s*\)/.exec(t))) map.fill(T[m[1]]);
    else if ((m = /Painter\.fill\s*\(\s*this\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*Terrain\.(\w+)\s*\)/.exec(t))) { for (let y = +m[2]; y < +m[2] + +m[4]; y++) for (let x = +m[1]; x < +m[1] + +m[3]; x++) if (x < W && y < H) map[y * W + x] = T[m[5]]; }
    else if ((m = /^map\s*\[\s*(\d+)\s*\]\s*=\s*Terrain\.(\w+)$/.exec(t))) map[+m[1]] = T[m[2]]; }
  let diff = 0; for (let i = 0; i < map.length; i++) if (map[i] !== l.layout.tiles[i]) diff++;
  assert.strictEqual(diff, 0, '다른 칸 ' + diff);
  return `${W}×${H} 칸 모두 같음 · 지형 값 ${[...new Set(map)].sort((a, b) => a - b).join(',')}`;
});

test('ARK 맵: 맵 그래프에 가져오기 → 노드 · 출처 · 유형 · 연결(원본/추정/미확인) · 편집 화면 · 저장 후 다시 열어도 그대로', async () => {
  need('ark'); const { P, dir } = await project('ark', { sync: false });
  const before = J(P.store.get('world')).nodes.length;
  const L = P.repoMaps.list(), extra = L.filter(s => s.extra);
  const made = P.repoMaps.importSlots(extra);
  const w = P.store.get('world'), g = w.groups.find(x => x.id.startsWith('repo_'));
  assert.ok(g && g.name.includes('RogueNights'), '그룹');
  assert.strictEqual(w.nodes.length - before, made.length);
  const nodes = made.map(id => P.store.get('node:' + id));
  assert.ok(nodes.every(n => n.src && n.src.kind === 'repo-level' && n.src.file && n.src.profile === P.REPO_ANALYSIS.profile.id), '출처');
  const hand = nodes.filter(n => n.mode === 'handmade'), game = nodes.filter(n => n.mode === 'game');
  assert.ok(hand.length >= 4 && game.length >= 10, `직접 그리기 ${hand.length} · 게임 원래 맵 ${game.length}`);
  assert.ok(hand.every(n => n.size && n.layers.terrain.length === n.size.w * n.size.h && P.REPO_ANALYSIS.objects.maps.levels[n.src.cls].layout.determined), '고정 맵만 타일');
  assert.ok(game.every(n => !n.size && n.gameLevel && n.layers.terrain.length === 0), '게임 원래 맵은 타일을 지어내지 않음');
  const rh = P.store.get('node:g_new_rhodes_level1_d0_b1'); assert.deepStrictEqual(J(rh.src.unknownTerrain), { 32: 'AVOID' }, '모르는 지형 값은 그대로 · 표시');
  const edges = w.edges.filter(e => e.src); assert.ok(edges.some(e => e.src.kind === 'repo-transition') && edges.some(e => e.src.kind === 'derived' && e.label === '추정'), '원본 · 추정 연결');
  const unres = nodes.flatMap(n => n.src.links).filter(x => x.status !== 'linked' && x.status !== 'derived');
  // 편집 화면: game 노드는 정보 화면, 직접 그리기는 맵 편집기
  const ed = P.editors ? P.editors : null;
  assert.ok(P.FLOOR_MODES.game && P.FLOOR_MODES.game.repoOnly, 'game 모드');
  await P.store.save();
  const re = await project(null, { dir });
  assert.deepStrictEqual(J(re.P.store.get('node:g_new_rhodes_level1_d0_b1').layers.terrain), J(rh.layers.terrain), '다시 열어도 타일 같음');
  assert.strictEqual(re.P.store.all('node').filter(n => n.src && n.src.kind === 'repo-level').length, made.length);
  // 다시 가져와도 중복 없음
  const again = P.repoMaps.importSlots(extra); assert.strictEqual(again.length, 0, '두 번째 가져오기 = 0');
  return `노드 ${made.length} (직접 그리기 ${hand.length} · 게임 원래 맵 ${game.length}) · 연결 원본 ${edges.filter(e => e.src.kind === 'repo-transition').length} · 추정 ${edges.filter(e => e.src.kind === 'derived').length} · 미확인/안 가져옴 ${unres.length}`;
});

test('기준 저장소 맵 회귀: 원작 층 클래스만 (추가 맵 0) · 새 프로젝트 맵 그래프는 그대로 (자동으로 가져오지 않음)', async () => {
  const r = need('base'), truth = truthLevels('base');
  assert.deepStrictEqual([...new Set(r.objects.maps.slots.map(s => s.cls))].sort(), truth.sort());
  assert.strictEqual(r.objects.maps.slots.filter(s => s.extra).length, 0); assert.ok(!r.features.some(f => f.id === 'extra-maps'));
  const { P } = await project('base'); const w = P.store.get('world');
  assert.strictEqual(w.nodes.length, 25); assert.ok(!w.groups.some(g => g.id.startsWith('repo_')));
  row('base', '맵 · 지역', { 원본: truth.length, 인식: new Set(r.objects.maps.slots.map(s => s.cls)).size, 완전분석: Object.values(r.objects.maps.levels).filter(l => l.generator === 'fixed' || l.generator === 'procedural').length, 편집가능: Object.values(r.objects.maps.levels).filter(l => l.generator === 'fixed').length, 미지원: Object.values(r.objects.maps.levels).filter(l => l.generator === 'code' || l.generator === 'fixed-partial').length });
  return `층 클래스 ${truth.length} · 노드 25 그대로`;
});

// ================================================================ ② 영웅
for (const k of ['ark', 'base']) test(`${REPOS[k]} 영웅: 직업 수 · id(enum) · 이름(저장소 글) · 그림(spritesheet 분기) — 편집기 영웅과 같음 · 다른 직업 그림으로 바꾸지 않음`, async () => {
  need(k); const truth = truthHeroes(k), { P } = await project(k);
  const H = P.store.all('hero').filter(h => h.baseClass);
  assert.deepStrictEqual(H.map(h => h.baseClass).sort().join(','), truth.map(t => t.id).sort().join(','), '직업 목록');
  for (const t of truth) {
    const h = H.find(x => x.baseClass === t.id);
    assert.strictEqual(h.name, t.name, `${t.id} 이름`); assert.strictEqual(h.sprite.sheet, 'game:' + t.sheet, `${t.id} 그림`);
    assert.ok(fs.existsSync(path.join(dirOf(k), 'core/src/main/assets', t.sheet)), `${t.id} 그림 파일`);
    assert.strictEqual(P.prov.status(h, 'name'), 'repo'); assert.strictEqual(P.heroClassName(t.id), t.name, '바탕 직업 목록 이름');
  }
  const sheets = H.map(h => h.sprite.sheet); assert.strictEqual(new Set(sheets).size, sheets.length, '두 직업이 같은 그림을 쓰지 않음');
  if (k === 'ark') { const w = H.find(h => h.baseClass === 'WARRIOR'); assert.strictEqual(w.name, '블레이즈'); assert.ok(!/전사/.test(w.name)); assert.strictEqual(w.id, 'warrior', 'id 는 enum 그대로'); }
  if (k === 'base') assert.strictEqual(H.find(h => h.baseClass === 'WARRIOR').name, '전사');
  row(k, '영웅 직업', { 원본: truth.length, 인식: H.length, 완전분석: H.filter(h => P.prov.status(h, 'name') === 'repo' && P.prov.status(h, 'sprite.sheet') === 'repo').length, 편집가능: H.length, 미지원: (P.REPO_ANALYSIS.objects.heroSkins || []).length ? `스킨 시트 ${(P.REPO_ANALYSIS.objects.heroSkins || []).length}` : 0 });
  return truth.map(t => `${t.id}=${t.name}(${t.sheet.split('/').pop()})`).join(' · ');
});

// ================================================================ ③ 몬스터
test('ARK 몬스터: 저장소 목록 = 편집기 목록 · 그림 성공/실패 · 이어받은 그림 · 대표 몬스터 이름 · 체력 · 그림 없는 몬스터도 남음', async () => {
  const r = need('ark'), { P } = await project('ark');
  const conv = r.objects.mobs.filter(m => m.convertible && !m.cls.includes('$'));
  const chars = P.store.all('char').filter(c => c.game), byGame = new Map(chars.map(c => [c.game, c]));
  assert.deepStrictEqual(conv.filter(m => !byGame.has(m.cls)).map(m => m.cls), [], '편집기 목록에 없는 몬스터');
  const ok = conv.filter(m => m.spriteOk), bad = conv.filter(m => !m.spriteOk);
  assert.ok(bad.every(m => byGame.has(m.cls) && (byGame.get(m.cls).src.fields.sprite === undefined)), '그림 못 읽은 몬스터: 목록에 있고 그림 출처 기록 없음 (임시 그림)');
  // 이어받은 그림: 부모 클래스 파일에 spriteClass = <그 스프라이트> 가 실제로 있음
  const inh = r.objects.mobs.filter(m => m.spriteKind === 'inherited' && m.spriteOk); assert.ok(inh.length > 0, '이어받은 그림이 있는 몬스터 (보스 안의 소환수 등)');
  for (const m of inh.slice(0, 15)) { const pf = r.objects.mobs.find(x => x.simple === m.sprite.from) || null; const file = pf ? pf.file : null;
    assert.ok(file && new RegExp('spriteClass\\s*=\\s*' + m.sprite.ref.split('.').pop() + '\\s*\\.\\s*class').test(fs.readFileSync(path.join(dirOf('ark'), file), 'utf8')), `${m.cls} 의 그림 ${m.sprite.ref} 이 ${m.sprite.from} 에 있음`); }
  // 대표: 이름 = actors 글, 체력 = HP = HT 리터럴
  const msg = props('ark', 'messages/actors/actors.properties');
  for (const cls of ['Talulah', 'Pompeii', 'AirborneSoldier', 'Slug']) { const c = byGame.get(cls); if (!c) continue; const key = 'actors.mobs.' + cls.toLowerCase() + '.name';
    if (msg[key]) assert.strictEqual(c.name, msg[key].replace(/_([^_]+)_/g, '$1'), cls + ' 이름');
    const s = src('ark', 'actors/mobs/' + cls + '.java'), hp = /HP\s*=\s*HT\s*=\s*(\d+)\s*;/.exec(s); if (hp) assert.strictEqual(c.stats.hp, +hp[1], cls + ' 체력'); }
  const noKey = conv.filter(m => m.nameSource !== 'repo'); for (const m of noKey) { const c = byGame.get(m.cls); assert.strictEqual(P.prov.status(c, 'name'), 'derived', m.cls + ' 클래스 이름 = 추론 (번역 아님)'); }
  row('ark', '몬스터', { 원본: r.objects.mobs.filter(m => !m.abstract && !m.base).length, 인식: chars.length, 완전분석: ok.length, 편집가능: chars.length, 미지원: bad.length });
  return `변환 ${conv.length} · 그림 연결 ${ok.length} · 그림 못 읽음 ${bad.length} (목록에 남음) · 이어받은 그림 ${inh.length} · 번역 키 없음 ${noKey.length}`;
});

test('기준 저장소 몬스터 회귀: 원작 캐릭터 그림 · 이름이 바뀌지 않음 (새 프로젝트를 맞춰도 출처만 기록)', async () => {
  const r = need('base'), { P } = await project('base');
  const before = env.load().PDM; let changed = [];
  for (const e of before.SPD_CHARS) { const c = P.store.all('char').find(x => x.game === e.cls); if (!c) continue; if (c.sprite.sheet !== e.sprite.sheet) changed.push(e.cls + ' 그림 ' + e.sprite.sheet + ' → ' + c.sprite.sheet); }
  assert.ok(changed.length <= 3, '원작 그림이 바뀜: ' + changed.join(', '));
  row('base', '몬스터', { 원본: r.objects.mobs.filter(m => !m.abstract && !m.base).length, 인식: P.store.all('char').filter(c => c.game).length, 완전분석: r.objects.mobs.filter(m => m.convertible && m.spriteOk && !m.cls.includes('$')).length, 편집가능: P.store.all('char').filter(c => c.game).length, 미지원: r.objects.mobs.filter(m => m.convertible && !m.spriteOk && !m.cls.includes('$')).length });
  return `원작 캐릭터 ${before.SPD_CHARS.length} · 그림이 바뀐 것 ${changed.length}` + (changed.length ? ` (${changed.join(', ')})` : '');
});

// ================================================================ ④ 보스
for (const k of ['ark', 'base']) test(`${REPOS[k]} 보스: Property.BOSS 를 초기화에 적은 클래스는 모두 보스 · 일반 몬스터에 섞이지 않음 · 근거 기록`, async () => {
  const r = need(k), truth = truthBosses(k), { P } = await project(k);
  const miss = [], wrong = [];
  for (const t of truth) { const m = r.objects.mobs.find(x => x.cls === t); if (!m) { miss.push(t); continue; } if (m.classify.category !== 'boss') wrong.push(`${t}=${m.classify.category}`); }
  assert.deepStrictEqual(miss, [], '분석에 없는 보스'); assert.deepStrictEqual(wrong, [], '보스가 아닌 분류');
  const chars = P.store.all('char').filter(c => c.game && truth.includes(c.game));
  assert.ok(chars.every(c => c.kind === 'boss' && c.classify && c.classify.evidence.some(e => e.kind === 'boss-property')), '편집기 종류 = 보스 · 근거');
  const review = P.store.all('char').filter(c => c.kind === 'unsorted');
  const nameOnly = r.objects.mobs.filter(m => m.classify.category === 'boss' && m.classify.evidence.every(e => e.kind === 'name'));
  assert.strictEqual(nameOnly.length, 0, '이름에 Boss 가 있다는 것만으로 보스가 되지 않음');
  row(k, '보스', { 원본: truth.length, 인식: P.store.all('char').filter(c => c.kind === 'boss').length, 완전분석: chars.length, 편집가능: P.store.all('char').filter(c => c.kind === 'boss').length, 미지원: review.length ? `확인 필요 ${review.length}` : 0 });
  return `BOSS 속성 클래스 ${truth.length} → 모두 보스 · 편집기 보스 ${P.store.all('char').filter(c => c.kind === 'boss').length} · 엘리트 ${P.store.all('char').filter(c => c.kind === 'elite').length} · 확인 필요 ${review.length}`;
});

test('보스 분류: 사용자가 바꾼 종류는 다시 분석(강제) · 다시 맞추기에도 그대로 · 자동 분류와 구분', async () => {
  need('ark'); const { P } = await project('ark');
  const b = P.store.all('char').find(c => c.kind === 'boss'), m = P.store.all('char').find(c => c.kind === 'mob' && c.game);
  P.store.edit('char:' + b.id, 'x', o => { o.kind = 'elite'; }); P.store.edit('char:' + m.id, 'x', o => { o.kind = 'boss'; });
  A.analyze(dirOf('ark'), { cacheDir, force: true });   // 다시 분석
  await P.gameScan(dirOf('ark'), true); const res = await P.gameSyncVanilla();
  assert.strictEqual(P.store.get('char:' + b.id).kind, 'elite'); assert.strictEqual(P.store.get('char:' + m.id).kind, 'boss');
  assert.strictEqual(P.prov.status(P.store.get('char:' + b.id), 'kind'), 'user'); assert.strictEqual(P.store.get('char:' + b.id).classify.auto, 'boss', '자동 분류는 따로 남음');
  assert.ok(res.kept >= 2);
  return `${b.name}: 자동 보스 → 사용자 엘리트 유지 · ${m.name}: 자동 몬스터 → 사용자 보스 유지`;
});

// ================================================================ ⑤ 업적
for (const k of ['ark', 'base']) test(`${REPOS[k]} 업적: enum Badge 항목 모두 · 글자 키 형식 · 그림 칸(시트 너비) · 조건을 못 찾은 것도 목록에 남음`, () => {
  const r = need(k), B = r.objects.badges, truth = truthBadges(k);
  assert.deepStrictEqual(B.list.map(b => b.id), truth, '항목');
  const misc = Object.assign({}, props(k, 'messages/misc/misc.properties'));
  const withName = B.list.filter(b => b.nameSource === 'repo'); for (const b of withName.slice(0, 30)) assert.ok(misc[b.nameKey] !== undefined || props(k, 'messages/misc/misc_ko.properties')[b.nameKey] !== undefined, '글자 키 ' + b.nameKey);
  const img = B.list.filter(b => !b.noImage); assert.ok(img.every(b => b.inSheet === true), '그림 번호가 시트 안');
  const png = fs.readFileSync(path.join(dirOf(k), 'core/src/main/assets', B.sheet.file)), w = png.readUInt32BE(16);
  assert.strictEqual(B.sheet.cols, w / B.sheet.cell, '한 줄 칸 수 = 그림 너비 / 칸');
  if (k === 'ark') { assert.strictEqual(B.textKeys, 'single'); assert.strictEqual(B.sheet.cols, 16); } else { assert.strictEqual(B.textKeys, 'title-desc'); assert.strictEqual(B.sheet.cols, 8); }
  row(k, '업적 · 배지', { 원본: truth.length, 인식: B.list.length, 완전분석: B.list.filter(b => b.nameSource === 'repo' && !b.noImage && b.condParsed).length, 편집가능: B.list.length, 미지원: `조건 못 찾음 ${B.list.filter(b => !b.condParsed).length} · 그림 없음 ${B.list.filter(b => b.noImage).length}` });
  return `${truth.length}개 · 이름 ${withName.length} · 그림 ${img.length} · 조건 찾음 ${B.list.filter(b => b.condParsed).length} · 시트 ${B.sheet.cell}px × ${B.sheet.cols}칸 · 키 ${B.textKeys}`;
});

// ================================================================ ⑥ 타이틀 (구조 — 화면 비교는 ui-repofidelity.js)
for (const k of ['ark', 'base']) test(`${REPOS[k]} 타이틀: TitleScene 의 버튼(글 키 · 아이콘 · 여는 화면) · 줄 배치 · 로고 칸 = 원본`, () => {
  const r = need(k), T = r.objects.title, s = stripComments(src(k, 'scenes/TitleScene.java'));
  const keys = [...s.matchAll(/new\s+\w+\s*\(\s*[^,()]+\s*,\s*Messages\.get\s*\(\s*(?:this|TitleScene\.class)\s*,\s*"(\w+)"\s*\)\s*\)/g)].map(m => m[1]);
  assert.deepStrictEqual(T.buttons.map(b => b.key), keys, '버튼 글 키');
  const sc = msgsOf(k, 'scenes'); T.buttons.forEach(b => assert.strictEqual(b.label, (sc['scenes.titlescene.' + b.key] || '').replace(/_([^_]+)_/g, '$1'), b.key + ' 글'));
  const bn = stripComments(src(k, 'effects/BannerSprites.java'));
  const rect = t => { const m = new RegExp('case\\s+' + t + '\\s*:\\s*icon\\.frame\\(\\s*icon\\.texture\\.uvRect\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)').exec(bn); return m ? [+m[1], +m[2], m[3] - m[1], m[4] - m[2]] : null; };
  assert.deepStrictEqual(T.logoRect.land, rect(T.logo.land));
  if (k === 'ark') { assert.deepStrictEqual(T.buttons.map(b => b.id), ['play', 'support', 'rankings', 'badges', 'news', 'changes', 'settings', 'about']); assert.deepStrictEqual(T.rows.land, [['play', 'support'], ['rankings', 'badges', 'news'], ['settings', 'changes', 'about']]); assert.strictEqual(T.logo.land, 'PIXEL_DUNGEON'); assert.ok(r.features.some(f => f.id === 'title-buttons')); }
  else assert.ok(!r.features.some(f => f.id === 'title-buttons' || f.id === 'title-classic-logo'), '기준 저장소 = 원작 타이틀 (7차 모델 그대로)');
  const n = 4 + T.buttons.length;   // 배경 · 로고 · 빛 글자 · 버전 + 버튼
  row(k, '타이틀 요소', { 원본: n, 인식: n, 완전분석: 2 + T.buttons.length, 편집가능: n, 미지원: '횃불 입자 · 배경 움직임 비슷하게 · 하위 화면' });
  return `버튼 ${T.buttons.map(b => b.label).join(' · ')} · 로고 ${T.logo.land} ${JSON.stringify(T.logoRect.land)}`;
});
function msgsOf(k, b) { return Object.assign({}, props(k, `messages/${b}/${b}.properties`), props(k, `messages/${b}/${b}_ko.properties`)); }

// ================================================================ ⑦ 사용자 편집 유지
test('다시 분석 · 다시 맞추기: 사용자가 고친 이름 · 그림 · 능력치는 그대로 · 원본이 바뀌면 충돌로 보고 · 손대지 않은 칸만 새 값', async () => {
  need('ark'); const { P } = await project('ark');
  const h = P.store.all('hero').find(x => x.baseClass === 'MAGE'), c = P.store.all('char').find(x => x.game && x.stats.hp > 10);
  P.store.edit('hero:' + h.id, 'x', o => { o.name = '사용자 아미야'; }); P.store.edit('char:' + c.id, 'x', o => { o.stats.hp = 999; });
  // 원본이 바뀐 것처럼: 기록된 원본 값을 바꿔 둠 (다시 읽으면 저장소 값 ≠ 기록 → 충돌)
  P.store.edit('hero:' + h.id, 'x', o => { o.src.fields.name.v = '예전 원본 이름'; o.name = '사용자 아미야'; });
  const untouched = P.store.all('char').find(x => x.game && x.id !== c.id && P.prov.status(x, 'name') === 'repo');
  P.store.edit('char:' + untouched.id, 'x', o => { o.name = o.src.fields.name.v = '예전 값'; });   // 손대지 않은 칸 (기록 = 지금 값)
  const pl = await P.repoSync.plan(), ch = pl.heroes.find(e => e.cls === 'MAGE').changes;
  assert.ok(ch.some(x => x.path === 'name' && x.action === 'conflict'), '충돌 보고: ' + JSON.stringify(ch));
  const res = await P.gameSyncVanilla();
  assert.strictEqual(P.store.get('hero:' + h.id).name, '사용자 아미야'); assert.strictEqual(P.store.get('char:' + c.id).stats.hp, 999);
  assert.notStrictEqual(P.store.get('char:' + untouched.id).name, '예전 값', '손대지 않은 칸은 저장소 값으로');
  const sum = P.prov.summary(P.store.get('hero:' + h.id)).find(s => s.path === 'name'); assert.ok(sum.conflict && sum.pending === '아미야', JSON.stringify(sum));
  P.store.edit('hero:' + h.id, '되돌리기', o => { P.prov.revert(o, 'name'); }); assert.strictEqual(P.store.get('hero:' + h.id).name, '아미야');
  return `충돌 ${res.conflicts} · 사용자 값 유지 ${res.kept} · 되돌리기 → 원본 값`;
});

test('분석 실패 · 저장소가 사라짐: 정상 데이터를 기본값으로 덮지 않음 · 앞 저장소의 분석 결과가 남지 않음', async () => {
  need('ark'); const { ctx, P } = await project('ark');
  const snap = J(P.store.all('char').filter(c => c.game).map(c => [c.id, c.name, c.kind, c.sprite.sheet]));
  // 분석기가 실패하는 저장소 (파일 목록만 있음)
  const bad = path.join(tmp(), 'broken'); fs.mkdirSync(path.join(bad, PKG, 'items'), { recursive: true }); fs.mkdirSync(path.join(bad, PKG, 'levels', 'rooms'), { recursive: true });
  fs.writeFileSync(path.join(bad, PKG, 'items', 'Item.java'), 'class Item {'); fs.writeFileSync(path.join(bad, PKG, 'levels', 'rooms', 'Room.java'), 'class Room {');
  await P.gameScan(bad, true);
  assert.ok(!P.REPO_ANALYSIS || P.REPO_ANALYSIS.root !== dirOf('ark'), '앞 저장소(ARK) 분석 결과가 남지 않음');
  const res = await P.gameSyncVanilla();
  assert.deepStrictEqual(J(P.store.all('char').filter(c => c.game).map(c => [c.id, c.name, c.kind, c.sprite.sheet])), snap, '캐릭터 그대로');
  await P.gameScan('', true); assert.strictEqual(P.REPO_ANALYSIS, null);
  return `망가진 저장소 → 캐릭터 ${snap.length}명 그대로 · 분석 결과 비움`;
});

// ================================================================ ⑧ 저장소 바꾸기
test('저장소 바꾸기 (ARK → 기준): 영웅 이름 · 배지 · 타이틀 · 맵 목록이 새 저장소 것 · ARK 에서 가져온 값은 "다른 저장소" 로 표시 · 사라진 것은 고른 것만 지움', async () => {
  need('ark'); need('base'); const { P } = await project('ark');
  P.repoMaps.importSlots(P.repoMaps.list().filter(s => s.extra).slice(0, 2));
  const arkProf = P.REPO_ANALYSIS.profile.id;
  await P.gameScan(dirOf('base'), true);
  assert.notStrictEqual(P.REPO_ANALYSIS.profile.id, arkProf);
  assert.strictEqual(P.heroClassName('WARRIOR'), '전사', '바탕 직업 이름 = 새 저장소');
  assert.ok(!P.repoMaps.list().some(s => s.extra), '맵 목록 = 기준 저장소 것');
  assert.ok(!P.REPO_ANALYSIS.objects.badges.list.some(b => b.id === 'UNLOCK_ROSECAT'), '배지 = 기준 저장소 것');
  const pl = await P.repoSync.plan();
  const miss = pl.missing.map(x => x.cls);
  assert.ok(['ROSECAT', 'NEARL', 'CHEN'].every(c => miss.includes(c)), 'ARK 직업은 "저장소에 없음" 목록에 (지우지 않음)');
  const res = P.repoSync.apply(pl, { remove: [] });
  assert.ok(P.store.all('hero').some(h => h.baseClass === 'ROSECAT'), '고르지 않으면 지우지 않음');
  const w = P.store.all('hero').find(h => h.baseClass === 'WARRIOR');
  assert.strictEqual(w.name, '전사', '손대지 않은 이름은 새 저장소 값'); assert.strictEqual(w.src.profile, P.REPO_ANALYSIS.profile.id);
  const ark = P.store.all('node').find(n => n.src && n.src.kind === 'repo-level'); assert.strictEqual(ark.src.profile, arkProf, 'ARK 맵 노드는 ARK 출처 그대로 (다른 저장소로 표시)');
  const ros = P.store.all('hero').find(h => h.baseClass === 'ROSECAT'); assert.strictEqual(ros.src.profile, arkProf, '사라진 직업의 출처 = ARK');
  return `ARK(${arkProf}) → 기준(${P.REPO_ANALYSIS.profile.id}) · 사라진 항목 ${pl.missing.length} (지우지 않음) · 바뀐 영웅 ${res.heroesUpdated}`;
});

test('런타임 설치기: ARK 는 이 저장소 구조에 맞춰 적응 설치 (임시 사본에서만 — 원본 저장소는 건드리지 않음) · 제거하면 바이트 단위로 원래대로 · 기준 · BA 도 없는 클래스 0', () => {
  // 11차: 7acad71 부터 설치기는 런타임 사본을 저장소 구조(게임 본체 이름 · 옮겨진 클래스 · 기능 조건 블록)에 맞춰 설치함 → ARK 설치가 성공함.
  //       예전 시험은 "거부"를 기대하며 원본 game/ARK_PD-main 에 install 을 불러, 성공하면 원본 저장소를 고쳤음 → 사본에서만 설치 · 원본 지문 비교
  need('ark'); const I = require(path.join(ROOT, 'editor', 'runtime-installer.js'));
  const before = A.analyze(dirOf('ark')).fingerprint, logs = [], d = path.join(tmp(), 'ark-copy');
  // 사본: .git 과 그림 · 소리 파일은 빼고 (설치기는 Java · gradle · 글자 파일만 읽고 고침)
  fs.cpSync(dirOf('ark'), d, { recursive: true, filter: f => !/[\\/]\.git([\\/]|$)/.test(f) && !/\.(png|jpe?g|ogg|mp3|wav|aseprite|psd)$/i.test(f) });
  const hashAll = root => { const out = {}, walk = (x, rel) => { for (const e of fs.readdirSync(x, { withFileTypes: true })) { const r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) walk(path.join(x, e.name), r); else out[r] = require('crypto').createHash('sha1').update(fs.readFileSync(path.join(x, e.name))).digest('hex'); } }; walk(root, ''); return out; };
  const orig = hashAll(d);
  assert.deepStrictEqual(I.missingClasses(d), [], '적응 후 없는 클래스 0');
  I.install(d, path.join(ROOT, 'runtime', 'src'), l => logs.push(l));
  assert.ok(logs.some(l => /게임 본체 클래스: TomorrowRogueNight/.test(l)), '게임 본체 이름을 이 저장소 것으로: ' + logs.filter(l => /본체|옮겨진|맞춤/.test(l)).slice(0, 3).join(' / '));
  assert.ok(fs.existsSync(path.join(d, PKG, 'pdmaker', 'HeroRuntime.java')), '사본에 런타임 설치');
  assert.ok(/pdmaker\.HeroRuntime\.updateArmor\(this\)/.test(fs.readFileSync(path.join(d, PKG, 'sprites/HeroSprite.java'), 'utf8')), '영웅 그림 연결 줄');
  assert.strictEqual(A.analyze(dirOf('ark')).fingerprint, before, '원본 저장소 파일이 그대로');
  assert.ok(!fs.existsSync(path.join(dirOf('ark'), PKG, 'pdmaker')), '원본 저장소에 pdmaker 패키지가 생기지 않음');
  I.uninstall(d, () => { });
  const now = hashAll(d), diff = [...new Set([...Object.keys(orig), ...Object.keys(now)])].filter(k => orig[k] !== now[k] && !/\.pdmaker-backup$/.test(k));
  assert.deepStrictEqual(diff, [], '제거 뒤 사본 = 설치 전 (백업 파일 제외)');
  for (const k of ['base', 'ba']) if (fs.existsSync(dirOf(k))) assert.deepStrictEqual(I.missingClasses(dirOf(k)), [], k);
  return `사본 설치 · 연결 ${logs.filter(l => /연결|갱신|추가/.test(l)).length}줄 · 제거 후 바뀐 파일 0 · 원본 지문 그대로`;
});

// ================================================================ ⑨ 손상 · 누락 파일
test('손상 · 누락: newLevel 이 없는 Dungeon · Badges 없음 · 깨진 TitleScene · 괄호가 모자란 층 클래스 → 분석은 끝까지 · 문제를 기록', () => {
  const d = path.join(tmp(), 'damaged'), W = (rel, s) => { const p = path.join(d, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
  W('settings.gradle', "include ':core'\n"); W('build.gradle', "allprojects { ext { appName = 'Damaged' } }\n"); W('core/build.gradle', '');
  const J0 = (rel, s) => W(PKG + '/' + rel, 'package com.shatteredpixel.shatteredpixeldungeon' + (rel.includes('/') ? '.' + rel.split('/').slice(0, -1).join('.') : '') + ';\n' + s);
  J0('Dungeon.java', 'public class Dungeon { public static int depth; }\n');
  J0('levels/Level.java', 'public abstract class Level { }\n'); J0('levels/BrokenLevel.java', 'public class BrokenLevel extends Level {\n\tprotected boolean build() {\n\t\tsetSize(10, 10\n');
  J0('scenes/TitleScene.java', 'public class TitleScene { void create() { StyledButton b = new StyledButton(X, Messages.get(this, "enter")) { ');
  J0('actors/hero/HeroClass.java', 'public enum HeroClass { WARRIOR; }\n');
  W('core/src/main/assets/sprites/x.png', Buffer.from([1, 2, 3]));
  const r = A.analyze(d);
  assert.ok(r.root === d && r.objects.maps, '분석이 끝까지');
  assert.ok(r.objects.maps.problems.some(p => /newLevel/.test(p)), '맵: newLevel 없음 기록 ' + JSON.stringify(r.objects.maps.problems));
  assert.strictEqual(r.objects.maps.slots.length, 0); assert.ok(!r.objects.badges, '배지 파일이 없으면 배지 결과 없음 (지어내지 않음)');
  assert.ok(r.source.java.problems.list.some(p => /BrokenLevel/.test(p.file)) && r.source.java.problems.list.some(p => /TitleScene/.test(p.file)), '깨진 파일 기록');
  assert.ok(r.objects.title && (r.objects.title.problems.length || r.objects.title.buttons.length <= 1), '타이틀: 문제 기록 또는 읽은 데까지');
  assert.ok(r.resources.failed.list.some(f => /x\.png/.test(f.file)), '손상 그림');
  return `맵 문제 ${r.objects.maps.problems.length} · 소스 문제 ${r.source.java.problems.total} · 오류 ${r.errors.length}`;
});

// ---------------------------------------------------------------- 실행
(async () => {
  let pass = 0, fail = 0; const lines = [];
  for (const t of tests) {
    if (filter && !t.name.includes(filter)) continue;
    const t0 = Date.now();
    try { const r = await t.fn(); pass++; lines.push(`✓ ${t.name} (${Date.now() - t0}ms)${r ? '\n    ' + r : ''}`); }
    catch (e) { fail++; lines.push(`✗ ${t.name}\n    ${String(e && e.stack || e).split('\n').slice(0, 8).join('\n    ')}`); }
  }
  console.log(lines.join('\n'));
  for (const k of Object.keys(table)) {
    console.log(`\n### ${REPOS[k]}\n| 항목 | 원본 발견 수 | PDMaker 인식 수 | 완전 분석 수 | 편집 가능 수 | 미지원 수 |\n|---|---:|---:|---:|---:|---:|`);
    for (const [item, v] of Object.entries(table[k])) console.log(`| ${item} | ${v.원본} | ${v.인식} | ${v.완전분석} | ${v.편집가능} | ${v.미지원} |`);
  }
  if (notRun.length) console.log('\n실행하지 못함:\n· ' + [...new Set(notRun)].join('\n· '));
  if (OUT) fs.writeFileSync(OUT, JSON.stringify({ pass, fail, table, notRun, at: new Date().toISOString() }, null, 1));
  console.log(`\n${pass} 통과 · ${fail} 실패`);
  for (const d of tmpDirs) try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* 무시 */ }
  process.exit(fail ? 1 : 0);
})();
