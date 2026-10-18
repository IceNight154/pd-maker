#!/usr/bin/env node
// ================================================================
//  타이틀 화면 편집기 UI 테스트 (7차 — 웹 모드 + Playwright · Chromium)
//    사용: NODE_PATH=$(npm root -g) node tools/tests/ui-title.js
//    ① 예전 프로젝트: 열기만 해서는 title.json 을 바꾸지 않음 · 모르는 칸은 고쳐도 남음 · 세 칸(목록 · 캔버스 · 속성)
//    ② 목록에서 고르기 · 글 추가 · 캔버스에서 눌러 고르기
//    ③ 끌기: 끄는 동안 원본(store)은 그대로, 놓으면 한 번 저장(되돌리기 한 번) · 화살표 키 1px
//    ④ 자유 배치 버튼 옮기기 · 오른쪽 아래 모서리로 크기
//    ⑤ 상태 미리보기(비활성 · 오버) · 창 미리보기(실제로 그려짐) · 검사 결과를 누르면 그 대상을 고름
//    ⑥ 삭제 → 되돌리기 · 저장 → 다시 열기 · 미리보기 루프가 탭을 닫으면 멈추고 다시 열어도 하나만 · 페이지 오류 없음
// ================================================================
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert'), { spawn } = require('child_process');
const env = require('./editor-env');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_) { console.log('playwright 를 찾지 못했습니다 — NODE_PATH=$(npm root -g) node tools/tests/ui-title.js'); process.exit(2); }
const ROOT = path.join(__dirname, '..', '..');

async function makeProject(dir) {
  const ctx = env.load(), S = ctx.PDM.store;
  await S.createNew(dir, 'ui-title');
  S.edit('project', '저장소', p => { p.gameRepo = path.relative(dir, path.join(ROOT, 'game', 'shattered-pixel-dungeon-master')); });
  // 6차까지 만든 타이틀 (새 칸 없음) + 편집기가 모르는 칸
  S.edit('title', '예전', t => { t.enabled = true; t.customX = { keep: 1 }; t.buttons.customY = 'y'; });
  await S.save();
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdm-uititle-')), dir = path.join(tmp, 'proj'); fs.mkdirSync(dir);
  await makeProject(dir);
  const titleFile = path.join(dir, 'title.json'), before = fs.readFileSync(titleFile, 'utf8');
  const port = 18900 + Math.floor(Math.random() * 900);
  const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', '/'], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.addInitScript(() => { window.__raf = 0; const o = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = cb => o(t => { window.__raf++; cb(t); }); });
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  const results = []; let fail = 0;
  const step = async (name, fn) => { try { const r = await fn(); results.push(`✓ ${name}${r ? `\n    ${r}` : ''}`); } catch (e) { fail++; results.push(`✗ ${name}\n    ${String(e.message || e).split('\n').slice(0, 6).join('\n    ')}`); } };
  const url = `http://127.0.0.1:${port}${ROOT}/editor/renderer/index.html?project=${encodeURIComponent(dir)}`;
  const open = async () => { await page.goto(url); await page.waitForFunction(() => window.PDM && PDM.store && PDM.store.isOpen && PDM.tabs.active, null, { timeout: 15000 }); await page.waitForTimeout(600); };
  const titleTab = async () => { await page.evaluate(() => PDM.tabs.open('title')); await page.waitForFunction(() => PDM.tabs.active === 'title' && document.querySelector('.tp-canvas') && PDM.titleEditor.geo(), null, { timeout: 8000 }); await page.waitForTimeout(800); };
  const T = () => page.evaluate(() => JSON.parse(JSON.stringify(PDM.store.get('title'))));
  const sel = () => page.evaluate(() => (document.querySelector('.tp-row.sel') || {}).dataset ? document.querySelector('.tp-row.sel').dataset.sel : null);
  const geo = () => page.evaluate(() => JSON.parse(JSON.stringify(PDM.titleEditor.geo())));
  /** 게임 좌표 → 화면 좌표 (캔버스 위) */
  const toPage = async (x, y) => page.evaluate(([x, y]) => { const c = document.querySelector('.tp-overlay'), b = c.getBoundingClientRect(), g = PDM.titleEditor.geo(); return [b.left + x / g.W * b.width, b.top + y / g.H * b.height]; }, [x, y]);
  try {
    await open();
    await step('① 예전 프로젝트: 열기만 하면 title.json 그대로 · 세 칸 · 검사 문제 없음', async () => {
      await titleTab();
      const panes = await page.$$eval('.tp-layout > *', e => e.map(x => x.className));
      assert.deepStrictEqual(panes, ['tp-tree', 'tp-center', 'tp-props']);
      await page.evaluate(() => PDM.store.edit('project', '다른 것', p => { p.author = 'x'; })); await page.keyboard.press('Control+s'); await page.waitForTimeout(500);
      const ov = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('pdmaker_web_overlay_v1') || '{}')).filter(k => k.endsWith('/title.json')));
      assert.deepStrictEqual(ov, [], '저장한 파일에 title.json 이 없어야 함');
      assert.strictEqual(fs.readFileSync(titleFile, 'utf8'), before);
      const issues = await page.evaluate(() => PDM.validate().filter(r => r.open === 'title' && r.level === 'error'));
      assert.deepStrictEqual(issues, []);
      return panes.join(' | ');
    });
    await step('② 목록: 버튼 묶음 · "+ 글" → 새 요소를 고름 · 속성 칸', async () => {
      await page.click(".tp-row[data-sel=\"buttons\"] .tp-label"); await page.waitForTimeout(300);
      assert.ok((await page.textContent('.tp-props')).includes('버튼 묶음'));
      await page.click('.tp-tree button:has-text("+ 글")'); await page.waitForTimeout(500);
      const s = await sel(); assert.ok(/^element:txt_/.test(s), s);
      assert.ok((await page.textContent('.tp-props')).includes('정보 칸 넣기'));
      return s;
    });
    await step('② 캔버스에서 "던전으로 들어가기"를 누르면 그 버튼을 고름', async () => {
      const g = await geo(), b = g.buttons.find(x => x.id === 'play');
      const [x, y] = await toPage(b.r[0] + b.r[2] / 2, b.r[1] + b.r[3] / 2);
      await page.mouse.click(x, y); await page.waitForTimeout(400);
      assert.strictEqual(await sel(), 'button:play');
    });
    let elId;
    await step('③ 글 요소 끌기: 끄는 동안 원본 그대로 · 놓으면 한 번 저장 (되돌리기 한 번에 원래대로)', async () => {
      elId = (await T()).elements[0].id;
      await page.click(`.tp-row[data-sel="element:${elId}"] .tp-label`); await page.waitForTimeout(300);
      const g = await geo(), e = g.elements.find(x => x.id === elId);
      assert.ok(e, 'geo: ' + JSON.stringify(g.elements) + ' / ' + elId + ' / ' + JSON.stringify((await T()).elements));
      const [x, y] = await toPage(e.r[0] + e.r[2] / 2, e.r[1] + e.r[3] / 2);
      const x0 = (await T()).elements[0].x;
      await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 60, y - 40, { steps: 5 }); await page.waitForTimeout(150);
      assert.strictEqual((await T()).elements[0].x, x0, '끄는 중에는 저장하지 않음');
      await page.mouse.up(); await page.waitForTimeout(400);
      const x1 = (await T()).elements[0].x; assert.ok(x1 > x0, `${x0} → ${x1}`);
      await page.keyboard.press('Control+z'); await page.waitForTimeout(400);
      assert.strictEqual((await T()).elements[0].x, x0, '되돌리기 한 번');
      await page.keyboard.press('Control+y'); await page.waitForTimeout(300);
      return `x ${x0} → ${x1}`;
    });
    await step('③ 화살표 키: 1px (Shift = 10px)', async () => {
      const g = await geo(), sc = g.safe ? g.safe.w : g.W;
      const x0 = (await T()).elements[0].x;
      await page.focus('.tp-overlay'); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(300);
      const x1 = (await T()).elements[0].x;
      assert.ok(Math.abs((x1 - x0) * sc - 1) < 0.6, `${x0} → ${x1} (${((x1 - x0) * sc).toFixed(2)}px)`);
      const y0 = (await T()).elements[0].y, sh = g.safe ? g.safe.h : g.H;
      await page.keyboard.press('Shift+ArrowDown'); await page.waitForTimeout(300);
      const y1 = (await T()).elements[0].y; assert.ok(Math.abs((y1 - y0) * sh - 10) < 0.6, `Shift+↓ ${y0} → ${y1}`);
    });
    await step('④ 자유 배치: 버튼 끌기 → place · 모서리 끌기 → 크기', async () => {
      await page.evaluate(() => PDM.store.edit('title', '자유', t => { t.buttons.layout = 'free'; })); await page.waitForTimeout(400);
      await page.click(".tp-row[data-sel=\"button:play\"] .tp-label"); await page.waitForTimeout(300);
      let g = await geo(), b = g.buttons.find(x => x.id === 'play');
      let [x, y] = await toPage(b.r[0] + b.r[2] / 2, b.r[1] + b.r[3] / 2);
      await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x - 50, y + 20, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(400);
      const it = (await T()).buttons.items.find(i => i.id === 'play');
      assert.ok(it.place && it.place.x > 0 && it.place.y > 0, JSON.stringify(it.place));
      g = await geo(); b = g.buttons.find(q => q.id === 'play');
      [x, y] = await toPage(b.r[0] + b.r[2], b.r[1] + b.r[3]);
      await page.mouse.move(x - 0.5, y - 0.5); await page.mouse.down(); await page.mouse.move(x + 40, y + 10, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(400);
      const it2 = (await T()).buttons.items.find(i => i.id === 'play');
      assert.ok(it2.place.w > b.base[2] + 5, JSON.stringify(it2.place));
      return JSON.stringify(it2.place);
    });
    await step('⑤ 상태 미리보기: 비활성 · 포인터 오버 (게임과 같은 상태 모양 계산)', async () => {
      await page.evaluate(() => PDM.store.edit('title', '상태', t => { t.buttons.states = { hover: { bright: 1.5 }, disabled: { textAlpha: 0.3 } }; }));
      await page.waitForTimeout(300);
      const pick = async v => { await page.selectOption('.tp-toolbar .field:has(.fl:text-is("이 버튼 상태")) select', v); await page.waitForTimeout(400); return (await geo()).buttons.find(x => x.id === 'play'); };
      const d = await pick('disabled'), hv = await pick('hover');
      assert.ok(d.dis && !hv.dis && hv.hover && Math.abs(hv.bright - 1.5) < 1e-9, JSON.stringify([d, hv]));
      await pick('');
    });
    await step('⑤ 창: "+ 창" → 버튼에 연결 · 미리보기에 실제로 그려짐 (캔버스 픽셀)', async () => {
      await page.click('.tp-tree button:has-text("+ 창")'); await page.waitForTimeout(500);
      const wid = (await T()).windows[0].id;
      assert.strictEqual(await sel(), 'window:' + wid);
      await page.waitForTimeout(800);
      const g = await geo(); assert.strictEqual(g.windows.length, 1);
      const c = g.windows[0].chrome;
      const px = await page.evaluate(([x, y]) => { const cv = document.querySelector('.tp-canvas'), z = cv.width / PDM.titleEditor.geo().W; return [...cv.getContext('2d').getImageData(Math.round(x * z), Math.round(y * z), 1, 1).data]; }, [c[0] + c[2] / 2, c[1] + c[3] - 8]);   // 아래 여백(창 조각 가장자리 6 + 안쪽 여백 4) 안쪽
      assert.deepStrictEqual(px.slice(0, 3), [62, 64, 57], '창 가운데 = chrome.png WINDOW 조각 색');
      await page.evaluate(id => PDM.store.edit('title', '연결', t => { const b = t.buttons.items.find(x => x.id === 'about'); b.action = 'window'; b.window = id; }), wid);
      return wid;
    });
    await step('⑤ 검사: 없는 창을 여는 버튼 → 결과를 누르면 그 버튼을 고름', async () => {
      await page.evaluate(() => PDM.store.edit('title', '깨짐', t => { const b = t.buttons.items.find(x => x.id === 'news'); b.action = 'window'; b.window = 'nope'; }));
      await page.click('#tabbody .page'); await page.keyboard.press('F7'); await page.waitForTimeout(1200);
      const item = page.locator('.chk-l:has-text("없는 창")').first();
      await item.click(); await page.waitForTimeout(600);
      assert.strictEqual(await sel(), 'button:news');
    });
    await step('⑥ 삭제 → 되돌리기 · 저장 → 다시 열기 (요소 · 창 · 모르는 칸 그대로)', async () => {
      await page.evaluate(() => PDM.store.edit('title', '고침', t => { const b = t.buttons.items.find(x => x.id === 'news'); delete b.action; delete b.window; }));
      await page.click(`.tp-row[data-sel="element:${elId}"] .ib.danger`); await page.waitForTimeout(400);
      assert.strictEqual((await T()).elements.length, 0);
      await page.keyboard.press('Control+z'); await page.waitForTimeout(400);
      assert.strictEqual((await T()).elements.length, 1);
      await page.keyboard.press('Control+s'); await page.waitForTimeout(600);
      await open(); await titleTab();
      const t = await T();
      assert.ok(t.elements.length === 1 && t.windows.length === 1 && t.customX && t.customX.keep === 1 && t.buttons.customY === 'y', JSON.stringify(Object.keys(t)));
    });
    await step('⑥ 미리보기 루프: 탭을 닫으면 멈춤 · 열고 닫기를 반복해도 하나만', async () => {
      const rate = async ms => { const a = await page.evaluate(() => window.__raf); await page.waitForTimeout(ms); return (await page.evaluate(() => window.__raf)) - a; };
      const r1 = await rate(1000);
      for (let i = 0; i < 5; i++) { await page.evaluate(() => PDM.tabs.close('title')); await page.waitForTimeout(150); await titleTab(); }
      const r5 = await rate(1000);
      await page.evaluate(() => PDM.tabs.close('title')); await page.waitForTimeout(500);
      const r0 = await rate(1000);
      assert.ok(r5 <= r1 * 1.6 + 5, `다시 연 뒤 초당 프레임 ${r5} (처음 ${r1}) — 루프가 쌓이면 늘어남`);
      assert.ok(r0 <= 3, `닫은 뒤 초당 프레임 ${r0}`);
      return `열림 ${r1}/초 · 5번 다시 연 뒤 ${r5}/초 · 닫음 ${r0}/초`;
    });
    await step('손상된 값: 편집기가 멈추지 않음 · 검사가 오류로 알림 · 미리보기는 쓸 수 있는 것만', async () => {
      await titleTab();
      await page.evaluate(() => PDM.store.edit('title', '손상', t => {
        t.elements = [null, 5, { id: 'e1', type: 'text', text: { a: 1 }, size: 'big', x: 'a', effects: 'x' }, { id: 'e2', type: 'image', image: 'assets/없는그림.png' }, { id: 'e3', type: 'video' }];
        t.windows = [{ id: 'w', w: 'wide', content: [null, { type: 'button', action: 'window', window: 'missing' }, { type: 'setting', key: 'nope' }, { type: 'zzz' }], anim: 5 }, 'x'];
        t.buttons.states = { hover: 'x', focus: { skin: 'NOPE', textColor: 'red', alpha: '9' }, weird: {} };
        t.buttons.items = [{ id: 'play', effects: [{ type: 'bogus', duration: -1, repeat: 'x' }, null], place: 'x' }, { id: 5 }, null, { id: 'c', custom: true, action: 'window', window: 'missing' }];
      }));
      await page.waitForTimeout(800);
      for (const s of ['element:e1', 'window:w', 'content:w:1', 'button:play', 'buttons']) { await page.evaluate(x => PDM.titleEditor.select(x), s); await page.waitForTimeout(250); }
      const g = await geo(), errs = await page.evaluate(() => PDM.validate().filter(r => r.open === 'title' && r.level === 'error').map(r => r.msg));
      assert.deepStrictEqual(g.buttons.map(b => b.id), ['play', 'c', 'support', 'rankings', 'journal', 'news', 'changes', 'settings', 'about']);   // 목록에 없는 게임 버튼은 뒤에 (게임과 같은 규칙)
      ['없는 창 "missing"', '모르는 요소 종류 "video"', '모르는 게임 설정 "nope"', '모르는 내용 종류 "zzz"', '"NOPE"', '"red"'].forEach(m => assert.ok(errs.some(e => e.includes(m)), m + ' — ' + errs.join(' | ')));
      await page.keyboard.press('Control+z'); await page.waitForTimeout(300);
      return `검사 오류 ${errs.length}개`;
    });
    await step('페이지 오류 없음', async () => { assert.deepStrictEqual(errors, []); });
  } finally { await browser.close(); srv.kill(); fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log(results.join('\n'));
  console.log(`\n${results.length - fail} 통과 · ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})();
