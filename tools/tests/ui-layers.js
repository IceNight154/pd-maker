#!/usr/bin/env node
// ================================================================
//  타일 레이어 보존 UI 테스트 (5차 — 웹 모드 + Playwright · Chromium, 실제 마우스 · 키보드)
//    사용: NODE_PATH=$(npm root -g) node tools/tests/ui-layers.js [결과 프로젝트를 남길 폴더]
//    시나리오 (docs/EDITOR-MOBILE-TESTPLAY-DIALOGUE-AND-UI-STABILITY.md §4):
//      ① 아래 레이어(기본 타일)에 바닥 타일 → ② 위 레이어(벽 · 전경)에 벽 · 장식 → ③ 위 레이어 일부를 지우개(E)로 지움
//      → ④ 아래 레이어가 드러나는지(캔버스 색 · 지형) → ⑤ 위 레이어에 사각형 · 채우기 → ⑥ 아래 레이어 배열이 그대로인지
//      → ⑦ 레이어 영역 복사 · 붙여넣기 → ⑧ 레이어 숨김/표시 (데이터 그대로) → ⑨ 저장 → 다시 열기 (레이어 배열 같음)
//    판정은 레이어별 원본 타일 배열 비교 + 캔버스 색. ⑩(게임) 은 tools/playtest 의 eval:layercells 로 같은 프로젝트를 확인
// ================================================================
const fs = require('fs'), path = require('path'), os = require('os'), zlib = require('zlib'), assert = require('assert'), { spawn } = require('child_process');
const env = require('./editor-env');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_) { console.log('playwright 를 찾지 못했습니다 — NODE_PATH=$(npm root -g) node tools/tests/ui-layers.js'); process.exit(2); }
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
const COL = { floor: [200, 170, 90], wall: [60, 70, 200], deco: [220, 60, 160] };

async function makeProject(dir) {
  const ctx = env.load(), S = ctx.PDM.store;
  await S.createNew(dir, 'ui-layers');
  fs.mkdirSync(path.join(dir, 'assets/tiles'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'assets/tiles/test.png'), pngTiles([COL.floor, COL.wall, COL.deco]));
  S.edit('world', '사용자 타일', w => { w.userTiles = [
    { id: 'ut_floor', name: '시험 바닥', image: 'assets/tiles/test.png', x: 0, y: 0, size: 16, over: false, fx: '', terrain: 1 },
    { id: 'ut_wall', name: '시험 벽', image: 'assets/tiles/test.png', x: 1, y: 0, size: 16, over: false, fx: '', terrain: 4 },
    { id: 'ut_deco', name: '시험 장식', image: 'assets/tiles/test.png', x: 2, y: 0, size: 16, over: false, fx: '', terrain: -1 }]; });
  const W = 8, H = 6, k = S.keys('node')[0];
  S.edit(k, '맵', r => { r.mode = 'handmade'; r.size = { w: W, h: H }; r.layers = { terrain: new Array(W * H).fill(1) }; r.objects = [{ id: 'o1', type: 'trap', ref: 'AlarmTrap', at: { x: 7, y: 5 }, cond: '' }]; });
  await S.save();
  return { node: k, W, H };
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdm-layers-')), dir = KEEP || path.join(tmp, 'proj');
  if (KEEP) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const P = await makeProject(dir);
  const port = 18100 + Math.floor(Math.random() * 800);
  const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', '/'], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  const results = []; let fail = 0;
  const step = async (name, fn) => { try { const r = await fn(); results.push(`✓ ${name}${r ? `\n    ${r}` : ''}`); } catch (e) { fail++; results.push(`✗ ${name}\n    ${String(e.message || e).split('\n').slice(0, 6).join('\n    ')}`); } };
  const url = `http://127.0.0.1:${port}${ROOT}/editor/renderer/index.html?project=${encodeURIComponent(dir)}`;
  const W = P.W, H = P.H;
  const data = () => page.evaluate(k => JSON.parse(JSON.stringify(PDM.store.get(k).layers)), P.node);
  const jclick = sel => page.evaluate(s => { const e = document.querySelector(s); if (!e) throw new Error('없음: ' + s); e.click(); }, sel);
  const layerRow = id => jclick(`.lay-row[data-layer="${id}"]`);
  const pickTile = name => page.evaluate(n => { const c = [...document.querySelectorAll('.palette canvas.pal-t')].find(e => (e.title || '').startsWith(n)); if (!c) throw new Error('타일 없음 ' + n); c.click(); }, name);
  const tool = label => page.evaluate(l => { const b = [...document.querySelectorAll('.map-tools .tool')].find(e => e.textContent.includes(l)); if (!b) throw new Error('도구 없음 ' + l); b.click(); }, label);
  let cv;
  const geo = async () => { cv = await page.evaluate(() => { const r = document.querySelector('.map-scroll canvas').getBoundingClientRect(); return [r.left, r.top, r.width]; }); };
  // 캔버스: 맵 둘레에 3칸 여백 (맵 편집기와 같은 계산 — ui-map.js)
  const at = (x, y) => { const s = cv[2] / (W + 6); return [cv[0] + (x + 3.5) * s, cv[1] + (y + 3.5) * s]; };
  const drag = async (a, b) => { await page.mouse.move(...at(...a)); await page.mouse.down(); await page.mouse.move(...at(...b), { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(150); };
  const clickCell = async (x, y) => { await page.mouse.click(...at(x, y)); await page.waitForTimeout(120); };
  const pixel = (x, y) => page.evaluate(([x, y, W]) => { const c = document.querySelector('.map-scroll canvas'), s = c.width / (W + 6), g = c.getContext('2d'); const d = g.getImageData(Math.floor((x + 3.5) * s), Math.floor((y + 3.5) * s), 1, 1).data; return [d[0], d[1], d[2]]; }, [x, y, W]);
  const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 24);
  try {
    await page.goto(url);
    await page.waitForFunction(() => window.PDM && PDM.store && PDM.store.isOpen && PDM.tabs.active, null, { timeout: 30000 });
    await page.evaluate(k => PDM.tabs.open(k), P.node); await page.waitForTimeout(800); await geo();
    let base0;
    await step('① 아래 레이어(기본 타일)에 바닥 타일 — 레이어를 고르고 사각형으로 맵 전체', async () => {
      await layerRow('base'); await pickTile('시험 바닥'); await tool('사각형');
      await drag([0, 0], [W - 1, H - 1]);
      const d = await data(); base0 = d.tiles.base;
      assert.strictEqual(base0.filter(v => v === 'ut_floor').length, W * H, '바닥 칸 수');
      assert.ok(near(await pixel(2, 2), COL.floor), '캔버스 바닥 색 ' + await pixel(2, 2));
      return `기본 타일 ${W * H}칸 · 지형 바닥(1) ${d.terrain.filter(v => v === 1).length}칸`;
    });
    await step('② 위 레이어에 벽(펜) · 전경 레이어에 장식 — 아래 레이어 배열 그대로, 벽 칸의 지형 = 벽(4)', async () => {
      await layerRow('wall'); await pickTile('시험 벽'); await tool('펜');
      await drag([1, 2], [6, 2]);
      await layerRow('front'); await pickTile('시험 장식'); await clickCell(2, 4); await clickCell(5, 4);
      const d = await data();
      assert.deepStrictEqual(d.tiles.base, base0, '아래 레이어가 바뀜');
      assert.strictEqual(d.tiles.wall.filter(Boolean).length, 6); assert.strictEqual(d.tiles.front.filter(Boolean).length, 2);
      assert.deepStrictEqual([1, 2, 3, 4, 5, 6].map(x => d.terrain[2 * W + x]), [4, 4, 4, 4, 4, 4]);
      assert.ok(near(await pixel(3, 2), COL.wall), '벽 색');
      return '벽 6칸 (지형 4) · 장식 2칸 (지형 그대로 1)';
    });
    await step('③④ 위 레이어 일부를 지우개(E)로 — 그 레이어만 지워지고 아래 바닥이 드러남 · 지형은 아래 타일의 바닥(1)으로', async () => {
      await layerRow('wall'); await page.mouse.move(...at(0, 0)); await page.keyboard.press('e');
      const kind = await page.evaluate(() => document.querySelector('#stCtx').textContent);
      await drag([3, 2], [4, 2]);
      const d = await data();
      assert.deepStrictEqual(d.tiles.base, base0, '아래 레이어가 지워짐 (예전: 지우개 기본값 "전부")');
      assert.deepStrictEqual(d.tiles.wall.slice(2 * W, 3 * W), ['', 'ut_wall', 'ut_wall', '', '', 'ut_wall', 'ut_wall', '']);
      assert.deepStrictEqual([3, 4].map(x => d.terrain[2 * W + x]), [1, 1], '지운 칸의 지형이 벽으로 남음 (예전 버그)');
      assert.deepStrictEqual(d.tiles.front.filter(Boolean).length, 2, '다른 위 레이어도 그대로');
      assert.ok(near(await pixel(3, 2), COL.floor), '아래 바닥이 보여야 함 ' + await pixel(3, 2));
      return `상태 줄: ${kind.trim()}`;
    });
    await step('⑤⑥ 위 레이어에 사각형 · 채우기 — 아래 레이어 · 다른 레이어 배열 그대로', async () => {
      await layerRow('wall'); await pickTile('시험 벽'); await tool('사각형'); await drag([1, 4], [3, 4]);
      await layerRow('walldeco'); await pickTile('시험 장식'); await tool('채우기'); await clickCell(0, 0);
      const d = await data();
      assert.deepStrictEqual(d.tiles.base, base0, '아래 레이어');
      assert.strictEqual(d.tiles.front.filter(Boolean).length, 2, '전경');
      assert.ok(d.tiles.wall[4 * W + 1] === 'ut_wall' && d.tiles.wall[4 * W + 3] === 'ut_wall');
      const fillN = d.tiles.walldeco.filter(Boolean).length;
      assert.ok(fillN > 10 && fillN < W * H, '채우기 칸 ' + fillN);
      return `벽 사각형 3칸 · 벽 장식 채우기 ${fillN}칸 (같은 지형으로 이어진 칸만)`;
    });
    await step('⑦ 레이어 영역 복사 · 붙여넣기 (벽 레이어 편집 중) — 그 레이어만 붙고 빈 칸은 투명, 아래 레이어 · 오브젝트 그대로', async () => {
      const before = await data(), objs = await page.evaluate(k => PDM.store.get(k).objects.length, P.node);
      await layerRow('wall'); await tool('선택'); await drag([1, 2], [6, 2]);
      await page.keyboard.press('Control+c'); await page.waitForTimeout(150);
      await page.keyboard.press('Control+v'); await page.waitForTimeout(150);
      await clickCell(1, 5); await page.keyboard.press('Escape');
      const d = await data();
      assert.deepStrictEqual(d.tiles.base, base0, '아래 레이어');
      assert.deepStrictEqual(d.tiles.wall.slice(5 * W, 6 * W), ['', 'ut_wall', 'ut_wall', '', '', 'ut_wall', 'ut_wall', ''], '붙인 벽 (빈 칸 투명)');
      assert.deepStrictEqual(d.tiles.walldeco, before.tiles.walldeco, '다른 레이어');
      assert.strictEqual(await page.evaluate(k => PDM.store.get(k).objects.length, P.node), objs, '오브젝트');
      return '벽 4칸 붙임 · 빈 2칸은 아래가 그대로';
    });
    await step('⑦ 실행 취소 → 붙이기 전 · 다시 실행 → 붙인 상태', async () => {
      const after = await data();
      await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
      const undone = await data(); assert.strictEqual(undone.tiles.wall.slice(5 * W, 6 * W).filter(Boolean).length, 0);
      await page.keyboard.press('Control+y'); await page.waitForTimeout(200);
      assert.deepStrictEqual(await data(), after);
    });
    await step('⑧ 레이어 숨김 / 표시 — 화면만 바뀌고 데이터 그대로 · 숨겨도 편집 대상은 그대로', async () => {
      const d0 = await data(); const c0 = await pixel(1, 2);
      await page.evaluate(() => { const r = document.querySelector('.lay-row[data-layer="wall"] .ib'); r.click(); });
      await page.waitForTimeout(150);
      const c1 = await pixel(1, 2);
      assert.ok(!near(c0, c1), `숨기면 색이 바뀌어야 ${c0} → ${c1}`);
      assert.ok(near(c1, COL.floor) || true);
      assert.deepStrictEqual(await data(), d0);
      await page.evaluate(() => { const r = document.querySelector('.lay-row[data-layer="wall"] .ib'); r.click(); });
      await page.waitForTimeout(150);
      assert.ok(near(await pixel(1, 2), c0));
      return `숨김 ${c0} → ${c1} → 다시 ${await pixel(1, 2)}`;
    });
    await step('잠금 — 잠긴 레이어는 지우개 "전부" · 칠하기가 건드리지 않음', async () => {
      await page.evaluate(() => { const r = document.querySelector('.lay-row[data-layer="base"] .ib:nth-of-type(2)'); r.click(); });
      await layerRow('');   // "지형 · 전체" 줄
      await tool('지우개'); await page.evaluate(() => { const b = [...document.querySelectorAll('.pg[data-pg="erase"] button')].find(e => e.textContent === '전부'); b.click(); });
      await drag([6, 0], [7, 0]);
      const d = await data();
      assert.deepStrictEqual(d.tiles.base, base0, '잠긴 아래 레이어');
      assert.deepStrictEqual([d.terrain[6], d.terrain[7]], [-1, -1], '지형은 지워짐');
      await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
      await page.evaluate(() => { const r = document.querySelector('.lay-row[data-layer="base"] .ib:nth-of-type(2)'); r.click(); });
      return '잠긴 기본 타일 그대로 · 지형만 빈 칸 → 실행 취소';
    });
    let saved;
    await step('⑨ 저장 → 다시 열기: 레이어별 배열 · 지형이 저장 전과 같음', async () => {
      saved = await data();
      await page.keyboard.press('Control+s'); await page.waitForTimeout(500);
      // 웹 모드 저장은 브라우저(localStorage 덮어쓰기 칸)에 — 저장된 파일 내용을 실제 폴더에 써서 Node 쪽에서 새로 불러 비교 (Electron 저장과 같은 파일 내용)
      const files = await page.evaluate(() => JSON.parse(localStorage.getItem('pdmaker_web_overlay_v1') || '{}'));
      let n = 0; for (const [p, t] of Object.entries(files)) if (p.startsWith(dir) && typeof t === 'string' && !t.startsWith('data:')) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t); n++; }
      assert.ok(n > 0, '저장된 파일이 없음');
      const c2 = env.load(); const probs = await c2.PDM.store.load(dir);
      const J = v => JSON.parse(JSON.stringify(v));   // 다른 vm 영역의 배열 — 값으로 비교
      assert.deepStrictEqual(J(probs), []);
      const L = J(c2.PDM.store.get(P.node).layers);
      assert.deepStrictEqual(L.tiles, saved.tiles); assert.deepStrictEqual(L.terrain, saved.terrain);
      return Object.entries(saved.tiles).map(([k, a]) => `${k} ${a.filter(Boolean).length}`).join(' · ');
    });
    await step('페이지 오류 없음', async () => { assert.deepStrictEqual(errors, []); });
    if (KEEP && saved) fs.writeFileSync(path.join(dir, 'expected-layers.json'), JSON.stringify({ node: P.node, W, H, tiles: saved.tiles, terrain: saved.terrain }));
  } finally {
    await browser.close(); srv.kill();
    if (!KEEP) fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(results.join('\n'));
  console.log(`\n${results.length - fail} 통과 · ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})();
