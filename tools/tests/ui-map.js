#!/usr/bin/env node
// ================================================================
//  맵 편집기 UI 테스트 (웹 모드 + Playwright · Chromium — 실제 마우스 · 키보드 입력)
//    사용: node tools/tests/ui-map.js        (playwright 가 require 로 잡혀야 함 — 전역 설치면 NODE_PATH=$(npm root -g))
//    ⇱ 선택 도구의 영역 고르기 · 복사 · 붙여넣기 미리보기 · 잘라내기 · 실행 취소, 여러 오브젝트 고르기 · 함께 이동 · 일괄 수정 · 삭제,
//    탭을 다시 그려도 창 이벤트가 쌓이지 않는지, 큰 맵에서 영역을 끌 때 그리기 시간(측정)
//    임시 폴더에 프로젝트를 만들고 python3 http.server 로 / 를 열어 씀 — 웹 모드는 저장을 브라우저 안에만 하므로 파일은 바뀌지 않음
// ================================================================
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert'), { spawn } = require('child_process');
const env = require('./editor-env');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_) { console.log('playwright 를 찾지 못했습니다 — NODE_PATH=$(npm root -g) node tools/tests/ui-map.js'); process.exit(2); }
const ROOT = path.join(__dirname, '..', '..');
const J = x => JSON.parse(JSON.stringify(x));

/** 시험 프로젝트: 직접 그린 노드 "ui" 12×9 (+ 큰 맵 "big" 80×80) */
async function makeProject(dir) {
  const ctx = env.load(), S = ctx.PDM.store;
  await S.createNew(dir, 'ui-test');
  const W = 12, H = 9, T = new Array(W * H).fill(1);
  for (let x = 0; x < W; x++) { T[x] = 4; T[(H - 1) * W + x] = 4; } for (let y = 0; y < H; y++) { T[y * W] = 4; T[y * W + W - 1] = 4; }
  T[2 * W + 2] = 2; T[2 * W + 3] = 29; T[3 * W + 2] = -1;
  const base = new Array(W * H).fill(''); base[2 * W + 2] = 'ut_a';
  S.edit('world', 'ut', w => { w.userTiles = [{ id: 'ut_a', name: 'A', image: '', x: 0, y: 0, size: 16, terrain: -2 }]; });
  const objs = [{ id: 'oA', type: 'trap', ref: 'AlarmTrap', at: { x: 2, y: 2 }, cond: '', hidden: false, inactive: false },
    { id: 'oB', type: 'trap', ref: 'WornDartTrap', at: { x: 4, y: 3 }, cond: 'switch.x', hidden: true, inactive: false },
    { id: 'oC', type: 'item', ref: '', at: { x: 8, y: 6 }, cond: '', count: 2 }];
  const nodes = S.keys('node');
  S.edit(nodes[0], 'ui', r => { r.mode = 'handmade'; r.size = { w: W, h: H }; r.layers = { terrain: T, tiles: { base } }; r.objects = objs; });
  const BW = 80, BT = new Array(BW * BW).fill(1);
  S.edit(nodes[1], 'big', r => { r.mode = 'handmade'; r.size = { w: BW, h: BW }; r.layers = { terrain: BT }; r.objects = []; });
  await S.save();
  return { small: nodes[0], big: nodes[1], W, H };
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdm-ui-')), dir = path.join(tmp, 'proj'); fs.mkdirSync(dir);
  const P = await makeProject(dir);
  const port = 18000 + Math.floor(Math.random() * 1000);
  const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', '/'], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: undefined } : {});
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  // 창 이벤트 수 세기 (탭을 다시 그릴 때 쌓이는지)
  await page.addInitScript(() => {
    const live = window.__listeners = {};
    const add = window.addEventListener, rem = window.removeEventListener;
    window.addEventListener = function (t, f, o) { (live[t] = live[t] || new Set()).add(f); return add.call(this, t, f, o); };
    window.removeEventListener = function (t, f, o) { if (live[t]) live[t].delete(f); return rem.call(this, t, f, o); };
  });
  const results = []; let fail = 0;
  const step = async (name, fn) => { try { const r = await fn(); results.push(`✓ ${name}${r ? `\n    ${r}` : ''}`); } catch (e) { fail++; results.push(`✗ ${name}\n    ${String(e.message || e).split('\n').join('\n    ')}`); } };
  try {
    await page.goto(`http://127.0.0.1:${port}${ROOT}/editor/renderer/index.html?project=${encodeURIComponent(dir)}`);
    await page.waitForFunction(() => window.PDM && PDM.store && PDM.store.isOpen, null, { timeout: 30000 });
    await page.waitForFunction(() => PDM.tabs.active, null, { timeout: 30000 });   // 프로젝트를 열면 맵 그래프 탭이 먼저 열림 — 그 뒤에 탭을 열어야 함
    await page.waitForTimeout(500);
    const node = k => page.evaluate(k => JSON.parse(JSON.stringify(PDM.store.get(k))), k);
    const openTab = async k => { await page.evaluate(k => PDM.tabs.open(k), k); await page.waitForFunction(k => PDM.tabs.active === k && document.querySelector('.map-scroll canvas'), k, { timeout: 15000 }); await page.waitForTimeout(400); };
    /** 칸 (x, y) 의 화면 좌표 (맵 캔버스: 둘레 3칸 여백) */
    const cellXY = async (x, y, W) => page.evaluate(([x, y, W]) => { const cv = document.querySelector('.map-scroll canvas'); const r = cv.getBoundingClientRect(), s = r.width / (W + 6); return [r.left + (x + 3 + .5) * s, r.top + (y + 3 + .5) * s]; }, [x, y, W]);
    const drag = async (a, b, W, opts = {}) => { const [x0, y0] = await cellXY(a[0], a[1], W), [x1, y1] = await cellXY(b[0], b[1], W);
      await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 3 }); await page.mouse.move(x1, y1, { steps: 3 }); await page.mouse.up(); await page.waitForTimeout(150); };
    const click = async (c, W, mod) => { const [x, y] = await cellXY(c[0], c[1], W); if (mod) await page.keyboard.down(mod); await page.mouse.click(x, y); if (mod) await page.keyboard.up(mod); await page.waitForTimeout(150); };
    const inspTitle = () => page.evaluate(() => (document.querySelector('#inspTitle') || document.querySelector('.insp-title') || {}).textContent || document.querySelector('#inspector') && document.querySelector('#inspector').innerText.split('\n')[0]);
    const key = async k => { await page.keyboard.press(k); await page.waitForTimeout(200); };

    await openTab(P.small);
    const W = P.W, orig = await node(P.small);
    await key('m');   // ⇱ 선택 도구

    await step('영역 고르기: 끌기 · 역방향 · 맵 밖으로 끌면 맵 경계로', async () => {
      await drag([1, 1], [4, 3], W);
      let a = await page.evaluate(() => PDM.mapArea && document.body.innerText.includes('영역 (1, 1) – (4, 3)'));
      assert.ok(a, '영역 (1,1)–(4,3) 표시 없음');
      await drag([4, 3], [1, 1], W);
      assert.ok(await page.evaluate(() => document.body.innerText.includes('영역 (1, 1) – (4, 3)')), '역방향');
      await drag([9, 6], [20, 15], W);
      assert.ok(await page.evaluate(() => document.body.innerText.includes('영역 (9, 6) – (11, 8)')), '맵 밖까지 끌기 → 경계');
      return '속성 창: 영역 좌표 · 크기 표시 확인';
    });
    await step('빈 곳 클릭 = 선택 해제', async () => {
      await click([6, 4], W);
      assert.ok(!(await page.evaluate(() => document.body.innerText.includes('영역 ('))));
    });
    await step('영역 복사 → 붙여넣기 미리보기 → 클릭으로 붙임 (레이어 · 오브젝트 새 id · 빈 칸 투명) → Esc', async () => {
      await drag([4, 2], [2, 3], W);   // 빈 칸에서 시작 (오브젝트 칸에서 끌면 오브젝트 이동 — 예전 동작 그대로)
      await key('Control+c');
      const clip = await page.evaluate(() => PDM.clip.peek());
      assert.strictEqual(clip.kind, 'maparea'); assert.strictEqual(clip.payload.w, 3); assert.strictEqual(clip.payload.h, 2);
      await key('Control+v');
      const [hx, hy] = await cellXY(6, 5, W); await page.mouse.move(hx, hy, { steps: 2 }); await page.waitForTimeout(150);
      await page.mouse.click(hx, hy); await page.waitForTimeout(300);
      await key('Escape');
      const d = await node(P.small), at = (x, y) => d.layers.terrain[y * W + x];
      assert.deepStrictEqual([at(6, 5), at(7, 5), at(8, 5)], [2, 29, 1]);
      assert.strictEqual(at(6, 6), 1, '빈 칸(-1)은 투명 — 받는 칸 그대로');
      assert.strictEqual(d.layers.tiles.base[5 * W + 6], 'ut_a');
      const pasted = d.objects.filter(o => !['oA', 'oB', 'oC'].includes(o.id));
      assert.deepStrictEqual(pasted.map(o => [o.ref, o.at.x, o.at.y, o.cond, o.hidden]), [['AlarmTrap', 6, 5, '', false], ['WornDartTrap', 8, 6, 'switch.x', true]]);
      assert.strictEqual(new Set(d.objects.map(o => o.id)).size, d.objects.length, 'id 중복');
      assert.deepStrictEqual(d.objects.filter(o => ['oA', 'oB'].includes(o.id)).map(o => [o.at.x, o.at.y]), [[2, 2], [4, 3]], '원본 오브젝트가 바뀜');
      return `붙인 오브젝트 ${pasted.length}개 (새 id ${pasted.map(o => o.id).join(', ')})`;
    });
    await step('실행 취소 → 원래 그대로 · 다시 실행 → 붙인 상태', async () => {
      const after = await node(P.small);
      await key('Control+z');
      assert.deepStrictEqual(await node(P.small), orig);
      await key('Control+y');
      assert.deepStrictEqual(await node(P.small), after);
      await key('Control+z');
    });
    await step('잘라내기: 복사본을 만든 뒤 영역을 비움 · 실행 취소로 복구', async () => {
      await page.keyboard.down('Alt'); await drag([2, 2], [3, 2], W); await page.keyboard.up('Alt');   // Alt+끌기 = 오브젝트 칸에서 시작해도 영역
      await key('Control+x');
      const d = await node(P.small), clip = await page.evaluate(() => PDM.clip.peek());
      assert.strictEqual(clip.kind, 'maparea'); assert.deepStrictEqual(clip.payload.terrain, [2, 29]);
      assert.deepStrictEqual([d.layers.terrain[2 * W + 2], d.layers.terrain[2 * W + 3]], [-1, -1]);
      assert.ok(!d.objects.some(o => o.id === 'oA'), '영역 안 오브젝트 삭제');
      assert.ok(!(d.layers.tiles && d.layers.tiles.base && d.layers.tiles.base.some(Boolean)));
      await key('Control+z');
      assert.deepStrictEqual(await node(P.small), orig);
    });
    await step('여러 오브젝트: 클릭 + Shift 클릭 → 함께 끌어 이동 → 실행 취소', async () => {
      await click([2, 2], W); await click([4, 3], W, 'Shift');
      assert.ok(await page.evaluate(() => document.body.innerText.includes('고른 오브젝트 2개')), '일괄 수정 창');
      await drag([2, 2], [3, 4], W);
      const d = await node(P.small);
      assert.deepStrictEqual(d.objects.filter(o => o.id !== 'oC').map(o => [o.id, o.at.x, o.at.y, o.hidden, o.cond]), [['oA', 3, 4, false, ''], ['oB', 5, 5, true, 'switch.x']]);
      assert.deepStrictEqual(d.objects.find(o => o.id === 'oC').at, { x: 8, y: 6 });
      await key('Control+z'); assert.deepStrictEqual(await node(P.small), orig);
    });
    await step('여러 오브젝트 일괄 수정: 등장 조건 · 숨김 (바꾼 칸만, 나머지 속성 그대로)', async () => {
      await click([6, 4], W); await click([2, 2], W); await click([4, 3], W, 'Control');
      const inp = page.locator('label:has-text("등장 조건") input, .field:has-text("등장 조건") input').first();
      await inp.fill('switch.go'); await inp.press('Tab'); await page.waitForTimeout(250);
      let d = await node(P.small);
      assert.deepStrictEqual(d.objects.filter(o => o.id !== 'oC').map(o => [o.cond, o.ref, o.hidden, o.at.x]), [['switch.go', 'AlarmTrap', false, 2], ['switch.go', 'WornDartTrap', true, 4]]);
      const cb = page.locator('label.check:has-text("숨겨진 함정") input').first();
      assert.ok(await cb.evaluate(c => c.indeterminate), '여러 값이면 중간 상태');
      await cb.click(); await page.waitForTimeout(250);
      d = await node(P.small);
      assert.deepStrictEqual(d.objects.filter(o => o.id !== 'oC').map(o => o.hidden), [true, true]);
      await key('Control+z'); await key('Control+z');
      assert.deepStrictEqual(await node(P.small), orig);
    });
    await step('여러 오브젝트 삭제 (Delete) → 실행 취소', async () => {
      await click([6, 4], W); await click([2, 2], W); await click([8, 6], W, 'Shift');
      await key('Delete');
      const d = await node(P.small);
      assert.deepStrictEqual(d.objects.map(o => o.id), ['oB']);
      await key('Control+z'); assert.deepStrictEqual(await node(P.small), orig);
    });
    await step('방향키: 고른 오브젝트 한 칸씩 · 맵 밖으로는 안 감', async () => {
      await click([6, 4], W); await click([2, 2], W);
      await key('ArrowRight');
      let d = await node(P.small); assert.deepStrictEqual(d.objects.find(o => o.id === 'oA').at, { x: 3, y: 2 });
      await key('Shift+ArrowUp');   // y 2 → -3: 맵 밖 → 그대로
      d = await node(P.small); assert.deepStrictEqual(d.objects.find(o => o.id === 'oA').at, { x: 3, y: 2 });
      await key('Control+z'); assert.deepStrictEqual(await node(P.small), orig);
    });
    await step('Ctrl+A = 맵 전체 영역 · Esc = 해제', async () => {
      await key('Control+a');
      assert.ok(await page.evaluate(() => document.body.innerText.includes('영역 (0, 0) – (11, 8)')));
      await key('Escape');
      assert.ok(!(await page.evaluate(() => document.body.innerText.includes('영역 ('))));
    });
    await step('검사 (F7): 결과에 종류 · 조치 표시 · 에셋 확인 줄 · 누르면 맵의 그 칸으로', async () => {
      await page.evaluate(k => PDM.store.edit(k, '잘못된 지형', r => { r.layers.terrain[4 * 12 + 7] = 999; }), P.small);
      await page.evaluate(() => PDM.app.runCheck());
      await page.waitForFunction(() => document.querySelector('#checkBody') && document.querySelector('#checkBody').innerText.includes('에셋 경로'), null, { timeout: 15000 });
      const txt = await page.evaluate(() => document.querySelector('#checkBody').innerText);
      assert.ok(txt.includes('[잘못된 타일 번호]') && txt.includes('(칸 7, 4)') && txt.includes('→ 그 칸을'), txt.slice(0, 400));
      await page.evaluate(() => { const l = [...document.querySelectorAll('#checkBody .chk-l')].find(x => x.textContent.includes('잘못된 타일 번호')); l.click(); });
      await page.waitForTimeout(400);
      assert.ok(await page.evaluate(() => document.body.innerText.includes('영역 (7, 4) – (7, 4)')), '그 칸이 영역으로 골라짐');
      await key('Control+z'); await key('Escape');
      assert.deepStrictEqual(await node(P.small), orig);
      return txt.split('\n').find(l => l.includes('에셋 경로'));
    });
    await step('탭을 다시 그려도 창 이벤트가 쌓이지 않음 (예전: 다시 그릴 때마다 keyup · pointermove · pointerup 이 늘었음)', async () => {
      const count = () => page.evaluate(() => Object.fromEntries(Object.entries(window.__listeners).map(([k, v]) => [k, v.size])));
      const a = await count();
      for (let i = 0; i < 10; i++) await page.evaluate(k => PDM.tabs.refresh(k), P.small);
      await page.waitForTimeout(200);
      const b = await count();
      ['keyup', 'pointermove', 'pointerup', 'keydown'].forEach(t => assert.strictEqual(b[t], a[t], `${t}: ${a[t]} → ${b[t]}`));
      return `다시 그리기 10번 전후 — keydown ${a.keydown}→${b.keydown} · keyup ${a.keyup}→${b.keyup} · pointermove ${a.pointermove}→${b.pointermove} · pointerup ${a.pointerup}→${b.pointerup}`;
    });
    await step('성능 측정: 80×80 맵에서 영역을 끌 때 그리기 1번 시간 (사각형 도구와 비교)', async () => {
      await openTab(P.big); await key('m');
      const measure = async tool => {
        await page.evaluate(() => { const cv = document.querySelector('.map-scroll canvas'), g = cv.getContext('2d'), orig = g.drawImage; window.__paint = { n: 0 };
          const p0 = CanvasRenderingContext2D.prototype.fillRect; window.__t = []; });
        const [x0, y0] = await cellXY(5, 5, 80), [x1, y1] = await cellXY(40, 40, 80);
        await page.mouse.move(x0, y0); await page.mouse.down();
        const t0 = await page.evaluate(() => performance.now());
        const N = 35; for (let i = 1; i <= N; i++) await page.mouse.move(x0 + (x1 - x0) * i / N, y0 + (y1 - y0) * i / N);
        const t1 = await page.evaluate(() => performance.now());
        await page.mouse.up(); await page.waitForTimeout(200);
        return (t1 - t0) / N;
      };
      const area = await measure('select');
      await key('Escape');
      await page.evaluate(() => { const b = [...document.querySelectorAll('.map-tools .tool')].find(x => x.textContent.includes('사각형')); b && b.click(); });
      const rect = await measure('rect');
      await key('Control+z');
      return `칸이 바뀔 때마다 한 번 그림 — 영역 끌기 평균 ${area.toFixed(1)}ms/이동 · 사각형 도구 ${rect.toFixed(1)}ms/이동 (헤드리스 Chromium, 확대 ×2, 35번 이동 · 마우스 이동 처리 포함)`;
    });
    await step('페이지 오류 없음', async () => { assert.deepStrictEqual(errors, []); });
  } finally {
    await browser.close(); srv.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(results.join('\n'));
  console.log(`\n${results.length - fail} 통과 · ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})();
