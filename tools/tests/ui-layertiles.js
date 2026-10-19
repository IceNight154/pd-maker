#!/usr/bin/env node
// ================================================================
//  레이어 타일 목록 UI 테스트 (8차 — 웹 모드 + Playwright · Chromium, 실제 마우스 · 키보드)
//    사용: NODE_PATH=$(npm root -g) node tools/tests/ui-layertiles.js [결과 프로젝트를 남길 폴더]
//    시나리오 (docs/EDITOR-TILE-AI-COMBAT-ANIMATION-8.md §2):
//      사용자 타일이 하나도 없는 새 프로젝트 → 레이어를 고르면 빈 상태 안내(타일 추가 · 타일셋에서 가져오기 · 이미지 가져오기) · 지형 타일 격자는 없음
//      → 이미지 가져오기로 두 칸을 끌어 골라 "풀" 레이어에 추가 → 곧바로 그 타일로 칠함 → 다른 레이어는 따로(빈 목록) → 다른 레이어에 추가 · 칠함 (아래 레이어 그대로)
//      → 지형 편집은 버튼으로만 · 분류 걸러 보기 · 복제(확인) · 순서 · 불투명도 → 놓인 타일 삭제: 경고 → 목록에서만 빼기(칸 그대로) · 실행 취소 → 삭제(칸은 ✕ · id 그대로) · 실행 취소
//      → 잠금 · 이 레이어 전체 지우기(확인 · 다른 레이어 그대로 · 실행 취소) → 그림이 없는 타일 경고 → 저장 → 다시 열기 (목록 · 타일 · 칸 그대로)
//    폴더를 주면 expected-layers.json 을 남김 → 게임에서 tools/playtest/compare-layers.js 로 같은 배치인지 (eval:layercells · layerinfo 의 불투명도)
// ================================================================
const fs = require('fs'), path = require('path'), os = require('os'), zlib = require('zlib'), assert = require('assert'), { spawn } = require('child_process');
const env = require('./editor-env');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_) { console.log('playwright 를 찾지 못했습니다 — NODE_PATH=$(npm root -g) node tools/tests/ui-layertiles.js'); process.exit(2); }
const ROOT = path.join(__dirname, '..', '..');
const KEEP = process.argv[2] ? path.resolve(process.argv[2]) : null;

/** 단색 16×16 타일 여러 개를 가로로 붙인 PNG (RGBA) */
function pngTiles(colors) {
  const w = 16 * colors.length, h = 16, raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; for (let x = 0; x < w; x++) { const c = colors[Math.floor(x / 16)], o = y * (w * 4 + 1) + 1 + x * 4; raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]; raw[o + 3] = 255; } }
  const crc = b => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let r = 0xffffffff; for (const x of b) r = t[(r ^ x) & 255] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const COL = { grassA: [60, 200, 80], grassB: [30, 140, 50], stone: [150, 150, 160], roof: [200, 60, 60] };

async function makeProject(dir) {
  const ctx = env.load(), S = ctx.PDM.store;
  await S.createNew(dir, 'ui-layertiles');
  fs.mkdirSync(path.join(dir, 'assets/tiles'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'assets/tiles/pal.png'), pngTiles([COL.grassA, COL.grassB, COL.stone, COL.roof]));
  const W = 8, H = 6, k = S.keys('node')[0];
  S.edit(k, '맵', r => { r.mode = 'handmade'; r.size = { w: W, h: H }; r.layers = { terrain: new Array(W * H).fill(1) }; r.objects = []; });
  await S.save();
  assert.ok(!((S.get('world') || {}).userTiles || []).length, '새 프로젝트에 사용자 타일이 없어야 함');
  return { node: k, W, H };
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdm-lt-')), dir = KEEP || path.join(tmp, 'proj');
  if (KEEP) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const P = await makeProject(dir), W = P.W, H = P.H, PNG = path.join(dir, 'assets/tiles/pal.png');
  const port = 18100 + Math.floor(Math.random() * 800);
  const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', '/'], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  page.on('dialog', d => d.accept(d.type() === 'prompt' ? PNG : undefined));   // 웹 모드 "파일 고르기" = prompt → 그림 경로
  const results = []; let fail = 0;
  const step = async (name, fn) => { try { const r = await fn(); results.push(`✓ ${name}${r ? `\n    ${r}` : ''}`); } catch (e) { fail++; results.push(`✗ ${name}\n    ${String(e.message || e).split('\n').slice(0, 6).join('\n    ')}`); } };
  const url = `http://127.0.0.1:${port}${ROOT}/editor/renderer/index.html?project=${encodeURIComponent(dir)}`;
  const data = () => page.evaluate(k => JSON.parse(JSON.stringify(PDM.store.get(k).layers)), P.node);
  const world = () => page.evaluate(() => JSON.parse(JSON.stringify(PDM.store.get('world'))));
  const layerDef = async id => ((await world()).tileLayers || []).find(l => l.id === id) || null;
  const jclick = sel => page.evaluate(s => { const e = document.querySelector(s); if (!e) throw new Error('없음: ' + s); e.click(); }, sel);
  const btn = (text, scope = '.palette') => page.evaluate(([t, s]) => { const b = [...document.querySelectorAll(s + ' button')].find(e => e.textContent.trim().startsWith(t)); if (!b) throw new Error('버튼 없음: ' + t); b.click(); }, [text, scope]);
  const modalBtn = text => page.evaluate(t => { const ms = document.querySelectorAll('.modal'); const m = ms[ms.length - 1]; if (!m) throw new Error('창 없음'); const b = [...m.querySelectorAll('.modal-foot button')].find(e => e.textContent.trim() === t); if (!b) throw new Error('창 버튼 없음: ' + t); b.click(); }, text);
  const waitModal = () => page.waitForSelector('.modal', { timeout: 5000 });
  const layerRow = id => jclick(`.lay-row[data-layer="${id}"]`);
  const ui = () => page.evaluate(k => { const s = PDM.tabs.active; return null; }, P.node);
  const palTiles = () => page.evaluate(() => [...document.querySelectorAll('.palette .lt-grid canvas.pal-t')].map(c => ({ id: c.dataset.ut, on: c.classList.contains('on'), bad: c.classList.contains('bad'), title: c.title })));
  const tool = label => page.evaluate(l => { const b = [...document.querySelectorAll('.map-tools .tool')].find(e => e.textContent.includes(l)); if (!b) throw new Error('도구 없음 ' + l); b.click(); }, label);
  let cv;
  const geo = async () => { cv = await page.evaluate(() => { const r = document.querySelector('.map-scroll canvas').getBoundingClientRect(); return [r.left, r.top, r.width]; }); };
  const at = (x, y) => { const s = cv[2] / (W + 6); return [cv[0] + (x + 3.5) * s, cv[1] + (y + 3.5) * s]; };
  const drag = async (a, b) => { await page.mouse.move(...at(...a)); await page.mouse.down(); await page.mouse.move(...at(...b), { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(150); };
  const pixel = (x, y, dx = .5, dy = .5) => page.evaluate(([x, y, W, dx, dy]) => { const c = document.querySelector('.map-scroll canvas'), s = c.width / (W + 6), g = c.getContext('2d'); const d = g.getImageData(Math.floor((x + 3 + dx) * s), Math.floor((y + 3 + dy) * s), 1, 1).data; return [d[0], d[1], d[2]]; }, [x, y, W, dx, dy]);
  const near = (a, b, t = 24) => a.every((v, i) => Math.abs(v - b[i]) < t);
  /** 칸 고르기 창의 그림에서 칸 (cx, cy) 의 화면 좌표 */
  const pickAt = async (cx, cy) => { const r = await page.evaluate(() => { const c = document.querySelector('.modal .lt-pick'); const b = c.getBoundingClientRect(); return [b.left, b.top, b.width, c.width]; }); const k = r[2] / r[3] * (r[3] / 64); return [r[0] + (cx + .5) * 16 * k, r[1] + (cy + .5) * 16 * k]; };
  /** 이미지 가져오기 → 칸 (a..b) 를 끌어 골라 이름 · 분류로 추가 */
  async function importCells(a, b, name, cat) {
    await btn('⤓ 이미지 가져오기'); await waitModal(); await page.waitForSelector('.modal .lt-pick'); await page.waitForTimeout(200);
    const p0 = await pickAt(...a), p1 = await pickAt(...b);
    await page.mouse.move(...p0); await page.mouse.down(); await page.mouse.move(...p1, { steps: 4 }); await page.mouse.up();
    await page.fill('.modal input[aria-label="이름"]', name); await page.fill('.modal input[aria-label="분류"]', cat);
    const info = await page.evaluate(() => document.querySelector('.modal .lt-import .hint:nth-of-type(1) ~ .hint, .modal .lt-import > .hint:last-of-type').textContent);
    await modalBtn('레이어에 추가'); await page.waitForTimeout(250);
    return info;
  }
  try {
    await page.goto(url);
    await page.waitForFunction(() => window.PDM && PDM.store && PDM.store.isOpen && PDM.tabs.active, null, { timeout: 30000 });
    await page.evaluate(k => PDM.tabs.open(k), P.node); await page.waitForTimeout(800); await geo();
    await step('빈 상태: 사용자 타일 0개 프로젝트에서 레이어를 고르면 안내 + 타일 추가 · 타일셋에서 가져오기 · 이미지 가져오기 · 지형 타일 격자는 없음', async () => {
      await layerRow('grass');
      const s = await page.evaluate(() => ({ empty: (document.querySelector('.palette .lt-empty') || {}).textContent || '', terrainTiles: [...document.querySelectorAll('.palette canvas.pal-t')].filter(c => /지형에 그림/.test(c.title)).length, target: document.querySelector('.palette .pal-target').textContent }));
      for (const t of ['타일 추가', '타일셋에서 가져오기', '이미지 가져오기']) assert.ok(s.empty.includes(t), '안내 버튼 ' + t + ': ' + s.empty);
      assert.strictEqual(s.terrainTiles, 0, '레이어 편집 중 지형 타일 격자');
      assert.ok(s.target.includes('풀'), s.target);
      return s.target.replace(/\s+/g, ' ');
    });
    let grass = [];
    await step('이미지 가져오기: 두 칸을 끌어 골라 "풀" 레이어에 추가 → 타일 정의 2개(그림 경로 + 칸) · 그 레이어 목록에만 · 곧바로 고른 상태', async () => {
      const info = await importCells([0, 0], [1, 0], '풀', '식생');
      const w = await world(), g = await layerDef('grass');
      grass = g.tiles;
      assert.strictEqual(w.userTiles.length, 2);
      assert.deepStrictEqual(w.userTiles.map(t => [t.image, t.x, t.y, t.size, t.category]), [['assets/tiles/pal.png', 0, 0, 16, '식생'], ['assets/tiles/pal.png', 1, 0, 16, '식생']]);
      assert.deepStrictEqual(g.tiles, w.userTiles.map(t => t.id));
      assert.deepStrictEqual((await layerDef('base')).tiles, [], '다른 레이어 목록은 비어 있어야 (그 레이어에 추가하지 않음)');
      const pt = await palTiles(); assert.strictEqual(pt.length, 2); assert.ok(pt[0].on, '첫 타일이 골라져 있어야');
      return info;
    });
    await step('곧바로 칠하기 (펜 · 사각형): 고른 타일이 풀 레이어에 · 캔버스 색', async () => {
      await tool('사각형'); await drag([0, 0], [3, 1]);
      const d = await data();
      assert.strictEqual(d.tiles.grass.filter(v => v === grass[0]).length, 8);
      assert.ok(near(await pixel(1, 1), COL.grassA), '색 ' + await pixel(1, 1));
      await page.evaluate(id => document.querySelector(`.palette .lt-grid canvas[data-ut="${id}"]`).click(), grass[1]); await tool('펜');
      await drag([4, 0], [5, 0]);
      const d2 = await data(); assert.deepStrictEqual([d2.tiles.grass[4], d2.tiles.grass[5]], [grass[1], grass[1]]);
      return `풀 ${d2.tiles.grass.filter(Boolean).length}칸`;
    });
    let stone;
    await step('레이어마다 따로: 기본 타일 레이어는 빈 목록 → 그 레이어에 돌 타일 추가 · 칠함 → 풀 레이어 그대로 · 풀 목록에 돌 없음', async () => {
      const g0 = (await data()).tiles.grass.slice();
      await layerRow('base');
      assert.ok(await page.evaluate(() => !!document.querySelector('.palette .lt-empty')), '기본 타일 레이어는 빈 상태');
      await importCells([2, 0], [2, 0], '돌', '바닥');
      stone = (await layerDef('base')).tiles[0];
      await tool('사각형'); await drag([0, 0], [W - 1, H - 1]);
      const d = await data();
      assert.strictEqual(d.tiles.base.filter(v => v === stone).length, W * H);
      assert.deepStrictEqual(d.tiles.grass, g0, '위(풀) 레이어가 바뀜');
      assert.ok(!(await layerDef('grass')).tiles.includes(stone));
      assert.ok(near(await pixel(1, 1), COL.grassA), '풀이 돌 위에 보여야');
      assert.ok(near(await pixel(6, 4), COL.stone), '돌 ' + await pixel(6, 4));
      return `돌 ${W * H}칸 · 풀 ${g0.filter(Boolean).length}칸 그대로`;
    });
    await step('지형/레이어 분리: 레이어 편집 중에는 지형 타일을 고를 수 없고 "⛰ 지형 편집으로" 버튼으로만 바뀜 · 지형 편집 중 지형 타일을 골라도 레이어 데이터 그대로', async () => {
      const d0 = await data();
      await btn('⛰ 지형 편집으로');
      const t = await page.evaluate(() => document.querySelector('.palette .pal-target').textContent);
      assert.ok(t.includes('지형'), t);
      await page.evaluate(() => [...document.querySelectorAll('.palette canvas.pal-t')].find(c => /지형에 그림/.test(c.title)).click());
      assert.deepStrictEqual((await data()).tiles, d0.tiles);
      await layerRow('grass');
      return t.trim();
    });
    await step('분류로 걸러 보기 · 찾기', async () => {
      await layerRow('grass');
      const opts = await page.evaluate(() => [...document.querySelectorAll('.palette select.lt-cat option')].map(o => o.textContent));
      assert.deepStrictEqual(opts, ['모든 분류 (2)', '식생 (2)']);
      await page.selectOption('.palette select.lt-cat', '식생'); await page.waitForTimeout(100);
      assert.strictEqual((await palTiles()).length, 2);
      await page.fill('.palette .pal-search', '없는이름'); await page.waitForTimeout(100);
      assert.strictEqual((await palTiles()).length, 0);
      await page.fill('.palette .pal-search', ''); await page.waitForTimeout(100);
      await page.selectOption('.palette select.lt-cat', ''); await page.waitForTimeout(100);
      return opts.join(' · ');
    });
    let copy;
    await step('복제(확인 창) · 순서 바꾸기 · 이름 · 불투명도 → 실행 취소', async () => {
      await page.evaluate(id => document.querySelector(`.palette .lt-grid canvas[data-ut="${id}"]`).click(), grass[0]);
      await btn('복제', '.palette .lt-sel'); await waitModal(); await modalBtn('확인'); await page.waitForTimeout(200);
      let g = await layerDef('grass'); copy = g.tiles[1];
      assert.strictEqual(g.tiles.length, 3); assert.ok((await world()).userTiles.find(t => t.id === copy).name.endsWith('사본'));
      await page.evaluate(() => document.querySelector('.palette .lt-sel button[aria-label="뒤로"]').click()); await page.waitForTimeout(150);
      g = await layerDef('grass'); assert.deepStrictEqual(g.tiles, [grass[0], grass[1], copy], '순서');
      await page.fill('.palette .lt-sel input[aria-label="불투명도 (0~1)"]', '0.5'); await page.press('.palette .lt-sel input[aria-label="불투명도 (0~1)"]', 'Enter'); await page.waitForTimeout(150);
      assert.strictEqual((await world()).userTiles.find(t => t.id === copy).alpha, .5);
      await page.mouse.move(...at(0, 0));
      await page.keyboard.press('Control+z'); await page.waitForTimeout(150);
      assert.strictEqual((await world()).userTiles.find(t => t.id === copy).alpha, undefined, '실행 취소 → 불투명도 없음');
      await page.keyboard.press('Control+y'); await page.waitForTimeout(150);
      return `목록 ${g.tiles.length}개 · 사본 불투명도 0.5`;
    });
    await step('복제한 반투명 타일 칠하기 → 캔버스에서 아래(돌)와 섞인 색', async () => {
      await layerRow('grass'); await page.evaluate(id => document.querySelector(`.palette .lt-grid canvas[data-ut="${id}"]`).click(), copy); await tool('펜');
      await drag([6, 3], [7, 3]);
      const c = await pixel(6, 3), want = COL.grassA.map((v, i) => (v + COL.stone[i]) / 2);
      assert.ok(near(c, want, 30), `반투명 ${c} ≈ ${want}`);
      return `칸 색 ${c}`;
    });
    await step('놓인 타일 삭제: 쓰는 곳 경고 → "목록에서만 빼기" = 칸 그대로 → 실행 취소 → "삭제" = 정의만 지움(칸의 id 그대로 · ✕ 표시) → 실행 취소', async () => {
      const d0 = await data();
      await page.evaluate(id => document.querySelector(`.palette .lt-grid canvas[data-ut="${id}"]`).click(), grass[1]);
      await btn('삭제', '.palette .lt-sel'); await waitModal();
      const msg = await page.evaluate(() => document.querySelector('.modal .modal-body').textContent);
      assert.ok(/1개 맵에 2칸/.test(msg), msg);
      await modalBtn('목록에서만 빼기'); await page.waitForTimeout(200);
      assert.ok(!(await layerDef('grass')).tiles.includes(grass[1])); assert.deepStrictEqual((await data()).tiles, d0.tiles, '칸이 바뀜');
      assert.ok((await world()).userTiles.some(t => t.id === grass[1]), '정의는 남아야');
      await page.mouse.move(...at(0, 0)); await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
      assert.ok((await layerDef('grass')).tiles.includes(grass[1]), '실행 취소 → 목록에 다시');
      await layerRow('grass');
      await page.evaluate(id => document.querySelector(`.palette .lt-grid canvas[data-ut="${id}"]`).click(), grass[1]);
      await btn('삭제', '.palette .lt-sel'); await waitModal(); await modalBtn('삭제'); await page.waitForTimeout(200);
      const w = await world();
      assert.ok(!w.userTiles.some(t => t.id === grass[1])); assert.ok(!(await layerDef('grass')).tiles.includes(grass[1]));
      assert.deepStrictEqual((await data()).tiles, d0.tiles, '칸의 id 는 그대로 (조용히 다른 그림으로 바뀌지 않음)');
      const warn = await page.evaluate(() => [...document.querySelectorAll('.palette .lt-bad')].map(e => e.textContent).join(' | '));
      assert.ok(/정의가 없는 타일이 놓인 칸 2개/.test(warn), warn);
      const xc = await pixel(4, 0, .22, .22);
      assert.ok(xc[0] > 200 && xc[1] < 140, '✕ 표시 색 ' + xc);
      await page.mouse.move(...at(0, 0)); await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
      assert.ok((await world()).userTiles.some(t => t.id === grass[1]), '실행 취소 → 정의 복구');
      return `${msg.slice(0, 40)}… · ✕ 색 ${xc}`;
    });
    await step('잠금: 잠긴 레이어에는 칠해지지 않음', async () => {
      await layerRow('grass');
      const d0 = await data();
      await page.evaluate(() => document.querySelector('.lay-row[data-layer="grass"] .ib:nth-of-type(2)').click());
      await page.evaluate(id => document.querySelector(`.palette .lt-grid canvas[data-ut="${id}"]`).click(), grass[0]); await tool('펜');
      await drag([0, 5], [3, 5]);
      assert.deepStrictEqual((await data()).tiles.grass, d0.tiles.grass);
      await page.evaluate(() => document.querySelector('.lay-row[data-layer="grass"] .ib:nth-of-type(2)').click());
    });
    await step('이 레이어 전체 지우기: 확인 창 → 그 레이어만 비고 아래 레이어 그대로 → 실행 취소', async () => {
      await layerRow('grass'); const d0 = await data();
      await btn('이 레이어 전체 지우기'); await waitModal(); await modalBtn('이 레이어 지우기'); await page.waitForTimeout(200);
      const d = await data();
      assert.ok(!d.tiles.grass || !d.tiles.grass.some(Boolean), '풀 레이어가 남음');
      assert.deepStrictEqual(d.tiles.base, d0.tiles.base);
      await page.mouse.move(...at(0, 0)); await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
      assert.deepStrictEqual((await data()).tiles, d0.tiles);
    });
    await step('그림이 없는 타일 · 칸이 그림 밖인 타일: 팔레트에 경고 표시 (멈추지 않음)', async () => {
      await page.evaluate(() => PDM.store.edit('world', '시험: 깨진 타일', w => { w.userTiles.push({ id: 'ut_gone', name: '없는 그림', image: 'assets/tiles/nope.png', x: 0, y: 0, size: 16, terrain: -2 }, { id: 'ut_out', name: '밖 칸', image: 'assets/tiles/pal.png', x: 9, y: 0, size: 16, terrain: -2 }); PDM.layerTiles.attach(w, 'grass', 'ut_gone'); PDM.layerTiles.attach(w, 'grass', 'ut_out'); }));
      await page.waitForTimeout(600); await layerRow('grass'); await page.waitForTimeout(300);
      const pt = (await palTiles()).filter(t => t.id === 'ut_gone' || t.id === 'ut_out');
      assert.ok(pt.length === 2 && pt.every(t => t.bad), JSON.stringify(pt));
      assert.ok(/찾을 수 없습니다/.test(pt[0].title) && /그림\(64×16/.test(pt[1].title), pt.map(t => t.title).join(' / '));
      await page.mouse.move(...at(0, 0)); await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
      return pt.map(t => t.title.split('\n')[1]).join(' · ');
    });
    let saved, savedW;
    await step('저장 → 다시 열기: 레이어 목록 · 타일 정의 · 칸 그대로', async () => {
      saved = await data(); savedW = await world();
      await page.keyboard.press('Control+s'); await page.waitForTimeout(500);
      const files = await page.evaluate(() => JSON.parse(localStorage.getItem('pdmaker_web_overlay_v1') || '{}'));
      let n = 0; for (const [p, t] of Object.entries(files)) if (p.startsWith(dir) && typeof t === 'string' && !t.startsWith('data:')) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t); n++; }
      assert.ok(n > 0);
      const c2 = env.load(); const probs = await c2.PDM.store.load(dir);
      const J = v => JSON.parse(JSON.stringify(v));
      assert.deepStrictEqual(J(probs), []);
      const w2 = J(c2.PDM.store.get('world'));
      assert.deepStrictEqual(w2.userTiles, savedW.userTiles); assert.deepStrictEqual(w2.tileLayers, savedW.tileLayers);
      assert.deepStrictEqual(J(c2.PDM.store.get(P.node).layers.tiles), saved.tiles);
      return Object.entries(saved.tiles).map(([k, a]) => `${k} ${a.filter(Boolean).length}칸`).join(' · ') + ` · 목록 ${savedW.tileLayers.filter(l => l.tiles.length).map(l => l.id + ' ' + l.tiles.length).join(', ')}`;
    });
    await step('페이지 오류 없음', async () => { assert.deepStrictEqual(errors, []); });
    if (KEEP && saved) fs.writeFileSync(path.join(dir, 'expected-layers.json'), JSON.stringify({ node: P.node, W, H, tiles: saved.tiles, terrain: saved.terrain, alpha: { [copy]: .5 } }));
  } finally {
    await browser.close(); srv.kill();
    if (!KEEP) fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(results.join('\n'));
  console.log(`\n${results.length - fail} 통과 · ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})();
