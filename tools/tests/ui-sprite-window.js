#!/usr/bin/env node
// ================================================================
//  스프라이트(픽셀) 편집기 창 크기 회귀 테스트 (8차 — 웹 모드 + Playwright · Chromium)
//    사용: NODE_PATH=$(npm root -g) node tools/tests/ui-sprite-window.js [캡처 폴더]
//    예전 버그: 창이 작게 열렸다가 오른쪽 아래 모서리(◢)를 누르기만 해도 크게 바뀜
//      원인 ① 모서리 pointerdown 이 창(.modal)의 max-width 를 900px → 98vw 로 바꿈 (열 때와 다른 크기 규칙)
//      원인 ② 그림 칸(.px-pane)의 크기가 캔버스(그림 × 배율)를 따라감 → 확대/축소가 창 크기를 바꿈
//    재는 때: 열 때(첫 프레임) · 첫 그리기 뒤 · 모서리 누름(움직이지 않음) · 뗌 · 확대(+ · Ctrl+휠 · 배율 칸) · 끌어서 크기 조절 · 두 번 눌러 처음 크기 ·
//             다시 열기 · 작은 화면(창이 화면 안 · 속 스크롤) · 탭 바꾸기(창 뒤의 탭) · 그리기 · 실행 취소 · 저장
// ================================================================
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert'), { spawn } = require('child_process');
const env = require('./editor-env');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_) { console.log('playwright 를 찾지 못했습니다 — NODE_PATH=$(npm root -g) node tools/tests/ui-sprite-window.js'); process.exit(2); }
const ROOT = path.join(__dirname, '..', '..');
const SHOTS = process.argv[2] ? path.resolve(process.argv[2]) : null;

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdm-sw-')), dir = path.join(tmp, 'proj');
  fs.mkdirSync(dir, { recursive: true });
  { const ctx = env.load(); await ctx.PDM.store.createNew(dir, 'ui-sprite-window'); }
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const port = 18100 + Math.floor(Math.random() * 800);
  const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', '/'], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  const results = []; let fail = 0;
  const step = async (name, fn) => { try { const r = await fn(); results.push(`✓ ${name}${r ? `\n    ${r}` : ''}`); } catch (e) { fail++; results.push(`✗ ${name}\n    ${String(e.message || e).split('\n').slice(0, 6).join('\n    ')}`); } };
  const url = `http://127.0.0.1:${port}${ROOT}/editor/renderer/index.html?project=${encodeURIComponent(dir)}`;
  /** 창 · 그림 칸 · 캔버스의 크기 [w, h] */
  const size = () => page.evaluate(() => {
    const m = document.querySelector('.modal'), p = document.querySelector('.modal .px-pane'), c = document.querySelector('.modal .px-canvas');
    const R = e => { if (!e) return null; const r = e.getBoundingClientRect(); return [e.offsetWidth, e.offsetHeight, Math.round(r.left + (r.width - e.offsetWidth) / 2), Math.round(r.top + (r.height - e.offsetHeight) / 2)]; };   // 레이아웃 크기 (나타나는 애니메이션의 transform 빼고)
    return { modal: R(m), pane: R(p), canvas: c ? [c.width, c.height] : null, view: [innerWidth, innerHeight] };
  });
  const same = (a, b, what) => assert.deepStrictEqual(a.slice(0, 2), b.slice(0, 2), `${what}: ${a} → ${b}`);
  const shot = async n => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `sprite-window-${n}.png`) }); };
  /** 편집기를 열고 첫 프레임(같은 작업 안 · 그리기 전)의 크기를 잼 */
  const open = (w = 32, h = 32, rel = 'assets/sprites/sw_test.png') => page.evaluate(([w, h, rel]) => new Promise(res => {
    window.__swDone = PDM.editPixelsModal('시험 스프라이트', rel, w, h, 16, null, {});
    const first = () => { const m = document.querySelector('.modal'), p = document.querySelector('.modal .px-pane'); if (!m || !p) return requestAnimationFrame(first); res({ modal: [m.offsetWidth, m.offsetHeight], pane: [p.offsetWidth, p.offsetHeight] }); };
    // MutationObserver = 창이 DOM 에 붙는 바로 그 순간 (첫 그리기 전)
    const mo = new MutationObserver(() => { const m = document.querySelector('.modal .px-pane'); if (m) { mo.disconnect(); const d = document.querySelector('.modal'); res({ modal: [d.offsetWidth, d.offsetHeight], pane: [m.offsetWidth, m.offsetHeight], sync: true }); } });
    mo.observe(document.body, { childList: true, subtree: true });
    setTimeout(first, 2000);
  }), [w, h, rel]);
  const close = async () => { await page.evaluate(() => { const b = [...document.querySelectorAll('.modal .modal-foot button')].find(e => e.textContent.trim() === '취소'); b.click(); }); await page.waitForTimeout(200); };
  const grip = async () => { const r = await page.evaluate(() => { const g = document.querySelector('.modal .px-grip').getBoundingClientRect(); return [g.left + g.width / 2, g.top + g.height / 2]; }); return r; };
  try {
    await page.goto(url);
    await page.waitForFunction(() => window.PDM && PDM.store && PDM.store.isOpen && PDM.tabs.active, null, { timeout: 30000 });
    let s0, first;
    await step('열 때(첫 프레임) = 첫 그리기 뒤 = 0.5초 뒤 — 크기가 바뀌지 않음', async () => {
      first = await open(); await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      const s1 = await size(); await page.waitForTimeout(500); s0 = await size();
      same(first.modal, s1.modal, '첫 프레임 → 첫 그리기 뒤 (창)'); same(first.pane, s1.pane, '첫 프레임 → 첫 그리기 뒤 (그림 칸)'); same(s1.modal, s0.modal, '0.5초 뒤'); same(s1.pane, s0.pane, '0.5초 뒤 그림 칸');
      await shot('open');
      return `첫 프레임(${first.sync ? 'DOM 붙는 순간' : 'rAF'}) 창 ${first.modal} · 그림 칸 ${first.pane} · 캔버스 ${s0.canvas}`;
    });
    await step('창이 화면 안에 다 들어오고, 그림 칸이 편집할 만한 크기 (가로 ≥ 360 · 세로 ≥ 300 — 1400×900 화면)', async () => {
      const [w, h, l, t] = s0.modal; assert.ok(l >= 0 && t >= 0 && l + w <= 1400 && t + h <= 900, '창이 화면 밖 ' + s0.modal);
      assert.ok(s0.pane[0] >= 360 && s0.pane[1] >= 300, '그림 칸이 작음 ' + s0.pane);
    });
    await step('모서리(◢)를 누르기만 하고 뗌 — 창 · 그림 칸 크기 그대로 (예전: 900px → 98vw 로 갑자기 커짐)', async () => {
      const g = await grip();
      await page.mouse.move(...g); await page.mouse.down(); await page.waitForTimeout(100);
      const sDown = await size(); same(s0.modal, sDown.modal, '누름 (창)'); same(s0.pane, sDown.pane, '누름 (그림 칸)');
      await page.mouse.up(); await page.waitForTimeout(100);
      const sUp = await size(); same(s0.modal, sUp.modal, '뗌 (창)'); same(s0.pane, sUp.pane, '뗌 (그림 칸)');
      await shot('grip-click');
    });
    await step('확대/축소(+ · − · Ctrl+휠 · 배율 칸) — 캔버스만 바뀌고 창 · 그림 칸 크기 그대로', async () => {
      const c0 = (await size()).canvas;
      await page.evaluate(() => [...document.querySelectorAll('.modal button')].find(b => b.textContent.trim() === '+').click()); await page.waitForTimeout(100);
      let s = await size(); assert.ok(s.canvas[0] > c0[0], '캔버스가 커져야'); same(s0.modal, s.modal, '+ (창)'); same(s0.pane, s.pane, '+ (그림 칸)');
      const p = await page.evaluate(() => { const r = document.querySelector('.modal .px-canvas').getBoundingClientRect(); return [r.left + 20, r.top + 20]; });
      await page.mouse.move(...p); await page.keyboard.down('Control'); for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -100); await page.keyboard.up('Control'); await page.waitForTimeout(100);
      s = await size(); same(s0.modal, s.modal, 'Ctrl+휠 (창)'); same(s0.pane, s.pane, 'Ctrl+휠 (그림 칸)');
      await page.fill('.modal input[title^="표시 배율"]', '1'); await page.press('.modal input[title^="표시 배율"]', 'Tab'); await page.waitForTimeout(100);
      s = await size(); assert.deepStrictEqual(s.canvas, [32, 32]); same(s0.modal, s.modal, '배율 1 (창)'); same(s0.pane, s.pane, '배율 1 (그림 칸)');
      await page.fill('.modal input[title^="표시 배율"]', '40'); await page.press('.modal input[title^="표시 배율"]', 'Tab'); await page.waitForTimeout(100);
      s = await size(); same(s0.modal, s.modal, '배율 40 (창)'); same(s0.pane, s.pane, '배율 40 (그림 칸)');
      await shot('zoom40');
      return `캔버스 ${c0} → ${s.canvas} · 창 ${s.modal.slice(0, 2)} 그대로`;
    });
    await step('모서리를 끌어 크기 조절 → 그림 칸이 끈 만큼 · 창은 화면 안 · 뗀 뒤 그대로 → 두 번 누르면 처음 크기', async () => {
      const g = await grip();
      await page.mouse.move(...g); await page.mouse.down(); await page.mouse.move(g[0] - 120, g[1] - 80, { steps: 6 }); await page.waitForTimeout(80);
      const sMove = await size(); await page.mouse.up(); await page.waitForTimeout(150);
      const sEnd = await size();
      assert.ok(Math.abs(sMove.pane[0] - (s0.pane[0] - 120)) <= 2 && Math.abs(sMove.pane[1] - (s0.pane[1] - 80)) <= 2, `끈 만큼 ${s0.pane} → ${sMove.pane}`);
      same(sMove.pane, sEnd.pane, '뗀 뒤');
      const [w, h, l, t] = sEnd.modal; assert.ok(l >= 0 && t >= 0 && l + w <= 1400 && t + h <= 900);
      await page.mouse.move(...await grip()); await page.mouse.dblclick(...await grip()); await page.waitForTimeout(150);
      const sR = await size(); same(s0.pane, sR.pane, '두 번 눌러 처음 크기'); same(s0.modal, sR.modal, '두 번 눌러 처음 크기 (창)');
      return `그림 칸 ${s0.pane.slice(0, 2)} → ${sEnd.pane.slice(0, 2)} → ${sR.pane.slice(0, 2)}`;
    });
    await step('그리기 · 실행 취소 · 저장이 그대로 동작', async () => {
      const c = await page.evaluate(() => { const r = document.querySelector('.modal .px-canvas').getBoundingClientRect(); return [r.left + 5, r.top + 5]; });
      await page.mouse.click(...c); await page.waitForTimeout(80);
      const a = await page.evaluate(() => { const d = document.querySelector('.modal .px-canvas').getContext('2d').getImageData(2, 2, 1, 1).data; return d[3]; });
      assert.ok(a > 0, '칠해져야');
      await page.keyboard.press('Control+z'); await page.waitForTimeout(80);
      const a2 = await page.evaluate(() => { const c = document.querySelector('.modal .px-canvas'); const d = c.getContext('2d').getImageData(2, 2, 1, 1).data; return d[3]; });
      await page.mouse.click(...c); await page.waitForTimeout(80);
      await page.evaluate(() => [...document.querySelectorAll('.modal .modal-foot button')].find(b => b.textContent.trim() === '저장').click());
      const out = await page.evaluate(() => window.__swDone);
      assert.ok(out && /sw_test\.png$/.test(out), '저장 경로 ' + out);
      return `칠함 α ${a} · 실행 취소 뒤 α ${a2} · 저장 ${out}`;
    });
    await step('다시 열기 — 처음과 같은 크기 (모서리로 바꾼 크기가 남지 않음)', async () => {
      const f2 = await open(); await page.waitForTimeout(300); const s = await size();
      same(f2.modal, s.modal, '다시 열기 첫 프레임 → 뒤'); same(s0.modal, s.modal, '처음 연 크기와'); same(s0.pane, s.pane, '그림 칸');
    });
    await step('창 뒤에서 탭이 바뀌어도(다시 그리기) 창 크기 그대로', async () => {
      const before = await size();
      await page.evaluate(() => { PDM.tabs.open('project'); }); await page.waitForTimeout(300);
      const after = await size(); same(before.modal, after.modal, '탭 바꾸기 (창)'); same(before.pane, after.pane, '탭 바꾸기 (그림 칸)');
      await close();
    });
    await step('큰 그림(512×512)도 같은 창 크기 — 그림 크기가 창을 정하지 않음 (속 스크롤)', async () => {
      const f = await open(512, 512, 'assets/sprites/sw_big.png'); await page.waitForTimeout(300); const s = await size();
      same(f.modal, s.modal, '첫 프레임 → 뒤'); same(s0.pane, s.pane, '32×32 와 같은 그림 칸');
      const sc = await page.evaluate(() => { const p = document.querySelector('.modal .px-pane'); return [p.scrollWidth > p.clientWidth, p.scrollHeight > p.clientHeight]; });
      assert.deepStrictEqual(sc, [true, true], '속 스크롤');
      await close();
    });
    await step('작은 화면(800×560): 창이 화면 안 · 그림 칸이 줄고 창 안에서 스크롤 · 열고 나서 크기 그대로', async () => {
      await page.setViewportSize({ width: 800, height: 560 }); await page.waitForTimeout(200);
      const f = await open(); await page.waitForTimeout(300); const s = await size();
      same(f.modal, s.modal, '첫 프레임 → 뒤');
      const [w, h, l, t] = s.modal; assert.ok(l >= 0 && t >= 0 && l + w <= 800 && t + h <= 560, '창이 화면 밖 ' + s.modal);
      assert.ok(s.pane[0] >= 160 && s.pane[1] >= 120, '그림 칸 ' + s.pane);
      const g = await grip(); await page.mouse.move(...g); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(100);
      same(s.modal, (await size()).modal, '작은 화면에서 모서리 누름');
      await shot('small');
      await close();
      return `창 ${s.modal} · 그림 칸 ${s.pane.slice(0, 2)}`;
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
