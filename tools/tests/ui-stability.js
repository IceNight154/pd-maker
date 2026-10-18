#!/usr/bin/env node
// ================================================================
//  UI 밀림 회귀 테스트 (5차 — 웹 모드 + Playwright · Chromium, 실제 마우스 · 키보드)
//    사용: NODE_PATH=$(npm root -g) node tools/tests/ui-stability.js
//    단추를 누르기 전후(또는 열고 닫은 뒤)의 화면을 비교: 고정 영역의 자리 · 크기, 안쪽 스크롤, 가로 넘침, 상태 줄 글자 자리.
//    허용 오차 0.5px. 확대(줌)처럼 일부러 바뀌는 칸만 동작마다 빼고 비교 (아래 skip).
//    또 창 · 문서에 붙은 이벤트 처리기 수가 탭을 오가도 늘지 않는지 (처리기 중복 · 누수).
//    원인 · 고친 내용: docs/EDITOR-MOBILE-TESTPLAY-DIALOGUE-AND-UI-STABILITY.md §7
// ================================================================
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert'), { spawn } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_) { console.log('playwright 를 찾지 못했습니다 — NODE_PATH=$(npm root -g) node tools/tests/ui-stability.js'); process.exit(2); }
const { makeProject } = require('./ui-shots');
const ROOT = path.join(__dirname, '..', '..');
const TOL = 0.5;

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdm-stab-')), dir = path.join(tmp, 'proj'); fs.mkdirSync(dir);
  const P = await makeProject(dir);
  const port = 19400 + Math.floor(Math.random() * 500);
  const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', '/'], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  // 창 · 문서 · body 에 붙은 처리기 수 (붙이기 − 떼기)
  await page.addInitScript(() => {
    window.__ls = 0; const T = [window, document];
    const a = EventTarget.prototype.addEventListener, r = EventTarget.prototype.removeEventListener, seen = new WeakMap();
    EventTarget.prototype.addEventListener = function (t, f, o) { if (T.includes(this) || this === document.body) { const m = seen.get(this) || new Set(); seen.set(this, m); const k = t + '|' + (typeof o === 'object' ? !!o.capture : !!o); if (!m.has(f)) { m.add(f); f['__k' + k] = 1; window.__ls++; } } return a.call(this, t, f, o); };
    EventTarget.prototype.removeEventListener = function (t, f, o) { if (T.includes(this) || this === document.body) { const m = seen.get(this); if (m && m.has(f)) { m.delete(f); window.__ls--; } } return r.call(this, t, f, o); };
  });
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  const results = []; let fail = 0;
  const step = async (name, fn) => { try { const r = await fn(); results.push(`✓ ${name}${r ? `\n    ${r}` : ''}`); } catch (e) { fail++; results.push(`✗ ${name}\n    ${String(e.message || e).split('\n').slice(0, 8).join('\n    ')}`); } };
  const url = `http://127.0.0.1:${port}${ROOT}/editor/renderer/index.html?project=${encodeURIComponent(dir)}`;
  const snap = () => page.evaluate(() => {
    const o = {};
    const q = (n, s) => { const e = document.querySelector(s); if (!e) { o[n] = '없음'; return; } const r = e.getBoundingClientRect(); o[n] = [r.left, r.top, r.width, r.height].map(v => Math.round(v * 10) / 10); if (e.scrollHeight > e.clientHeight + 1) o[n + '.scroll'] = [e.scrollTop]; };
    [['도구 모음', '#toolbar'], ['리소스', '#tree'], ['가운데', '#center'], ['속성', '#inspector'], ['탭 줄', '#tabbar'], ['맵 도구', '.map-tools'], ['팔레트', '.palette'],
      ['맵 보기', '.map-scroll'], ['맵 정보', '.map-info'], ['상태 줄', '#status'], ['속성 내용', '#inspBody'], ['리소스 내용', '#treeBody']].forEach(([n, s]) => q(n, s));
    document.querySelectorAll('#toolbar .tb').forEach((e, i) => { const r = e.getBoundingClientRect(); o['도구 단추 ' + i] = [Math.round(r.left * 10) / 10, Math.round(r.width * 10) / 10]; });
    document.querySelectorAll('.map-tools .tool, .map-tools .tb-num').forEach((e, i) => { const r = e.getBoundingClientRect(); o['맵 도구 ' + i + ' ' + e.textContent.trim().slice(0, 6)] = [Math.round(r.left * 10) / 10, Math.round(r.width * 10) / 10]; });
    document.querySelectorAll('#status > span[id]').forEach(e => { const r = e.getBoundingClientRect(); o['상태 ' + e.id] = [Math.round(r.left * 10) / 10]; });   // 보이지 않는 빈칸(.grow)은 빼고
    o['가로 넘침'] = [document.documentElement.scrollWidth > innerWidth ? 1 : 0, document.body.scrollWidth > innerWidth ? 1 : 0];
    o['남은 메뉴 · 창'] = [document.querySelectorAll('.ctx').length, document.querySelectorAll('.modal-bg').length];
    return o;
  });
  const diff = (a, b, skip = []) => Object.keys(Object.assign({}, a, b)).filter(k => !skip.some(s => k.startsWith(s)))
    .filter(k => { const x = a[k], y = b[k]; if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length) return JSON.stringify(x) !== JSON.stringify(y); return x.some((v, i) => Math.abs(v - y[i]) > TOL); })
    .map(k => `${k}: ${JSON.stringify(a[k])} → ${JSON.stringify(b[k])}`);
  const settle = () => page.waitForTimeout(250);
  const jc = s => page.evaluate(q => { const e = document.querySelector(q); if (!e) throw new Error('없음: ' + q); e.click(); }, s);
  /** 동작 → (되돌리기) → 비교 */
  const same = async (name, act, back, skip, note) => step(name, async () => {
    const a = await snap(); await act(); await settle(); if (back) { await back(); await settle(); }
    const b = await snap(); const d = diff(a, b, skip);
    assert.deepStrictEqual(d, [], '밀린 곳'); return note || null;
  });
  try {
    await page.goto(url);
    await page.waitForFunction(() => window.PDM && PDM.store && PDM.store.isOpen && PDM.tabs.active, null, { timeout: 30000 });
    await page.evaluate(k => PDM.tabs.open(k), P.node); await page.waitForTimeout(800);
    await page.evaluate(() => { const p = document.querySelector('.palette'); if (p) p.scrollTop = 120; });
    // ---- 맵 도구: 같은 단추를 여러 번 · 도구마다 (고른 표시는 밑줄 · 배경 — 폭이 바뀌면 안 됨)
    const tools = (await page.$$eval('.map-tools .tool-grp .tool:not(:disabled)', e => e.map(x => x.textContent.trim()))).filter(t => !t.includes('세부'));   // 세부 그리기 = 다른 화면(그림 모드)
    await same(`그리기 도구 ${tools.length}개를 차례로 · 펜 세 번`, async () => {
      for (const t of tools) await page.click(`.map-tools .tool-grp .tool:has-text("${t}")`);
      for (let i = 0; i < 3; i++) await page.click('.map-tools .tool:has-text("펜")');
    }, null, ['팔레트'], tools.join(' · '));   // 도구에 따라 팔레트 내용(지우개 묶음)은 바뀜 — 팔레트 자리 · 크기는 아래에서 따로
    await same('팔레트 자리 · 크기 · 스크롤: 도구를 바꿔도 그대로', async () => { await page.click('.map-tools .tool:has-text("지우개")'); }, () => page.click('.map-tools .tool:has-text("펜")'));
    await same('타일 고르기 (팔레트 칸 누르기)', () => jc('.palette .pal-grid canvas:nth-child(3)'));
    await same('레이어 바꾸기 → 지형으로 되돌리기 (편집 대상 표시가 바뀌어도 자리 그대로)', () => jc('.palette .lay-row[data-layer]:not([data-layer=""])'), () => jc('.palette .lay-row[data-layer=""]'), ['맵 도구 '], '도구 이름 · 방 단추(레이어에서는 꺼짐)는 바뀔 수 있어 맵 도구 단추만 제외');
    await same('팔레트 묶음 접기 → 펴기', () => jc('.palette .pg-head'), () => jc('.palette .pg-head'));
    await same('보기 메뉴 열고 닫기 (Esc)', () => page.click('.map-tools button:has-text("보기")'), () => page.keyboard.press('Escape'));
    await same('확인 창 열고 닫기 (Esc)', () => page.evaluate(() => { PDM.ui.confirm('시험'); }), () => page.keyboard.press('Escape'));
    await same('맵 ↔ 이벤트 탭 다섯 번 (안쪽 스크롤 복원)', async () => {
      for (let i = 0; i < 5; i++) { await page.evaluate(() => PDM.tabs.open('event:ev_intro')); await page.waitForTimeout(200); await page.evaluate(k => PDM.tabs.open(k), P.node); await page.waitForTimeout(200); }
    });
    await same('패널 접기 → 펴기 (Ctrl+B · Ctrl+J)', async () => { await page.keyboard.press('Control+b'); await page.keyboard.press('Control+j'); }, async () => { await page.keyboard.press('Control+b'); await page.keyboard.press('Control+j'); });
    await same('테마 어둡게 → 원래대로', () => page.evaluate(() => PDM_THEME.setMode('dark')), () => page.evaluate(() => PDM_THEME.setMode('system')));
    await same('실행 환경 PC → 모바일 세로 → PC (도구 모음 단추 폭 고정)', async () => { await page.click('.env-btn'); await page.click('.ctx .ctx-i:has-text("모바일 세로")'); await settle(); },
      async () => { await page.waitForSelector('.env-btn'); await page.click('.env-btn'); await page.click('.ctx .ctx-i:has-text("PC")'); await settle(); }, ['상태 '], '상태 줄의 저장 표시는 바뀜(고정 폭)');
    await same('맵 칸 칠하기 (펜) → 실행 취소', async () => { await page.click('.map-tools .tool:has-text("펜")'); const r = await page.evaluate(() => { const c = document.querySelector('.map-scroll canvas').getBoundingClientRect(); return [c.left, c.top]; }); await page.mouse.click(r[0] + 100, r[1] + 100); },
      () => page.keyboard.press('Control+z'));
    await same('확대 → 축소 (숫자 칸 고정 폭)', () => page.evaluate(() => [...document.querySelectorAll('.map-tools .tool')].find(b => b.textContent === '+').click()),
      () => page.evaluate(() => [...document.querySelectorAll('.map-tools .tool')].find(b => b.textContent === '−').click()), ['맵 보기.scroll']);
    await same('저장 (Ctrl+S)', () => page.keyboard.press('Control+s'), null, ['상태 ']);
    await same('창 크기 1400 → 1000 → 1400', () => page.setViewportSize({ width: 1000, height: 700 }), () => page.setViewportSize({ width: 1400, height: 900 }));
    await step('좁은 창(1000×640): 가로로 넘치지 않음', async () => {
      await page.setViewportSize({ width: 1000, height: 640 }); await settle();
      const s = await snap(); await page.setViewportSize({ width: 1400, height: 900 }); await settle();
      assert.deepStrictEqual(s['가로 넘침'], [0, 0]);
    });
    await step('처리기 중복 없음: 탭 · 도구 · 레이어를 열 번 오가도 창 · 문서 처리기 수가 그대로', async () => {
      const n0 = await page.evaluate(() => window.__ls);
      for (let i = 0; i < 10; i++) {
        await page.evaluate(() => PDM.tabs.open('event:ev_intro')); await page.waitForTimeout(120);
        await page.evaluate(k => PDM.tabs.open(k), P.node); await page.waitForTimeout(120);
        await page.click('.map-tools .tool:has-text("지우개")'); await page.click('.map-tools .tool:has-text("펜")');
      }
      const n1 = await page.evaluate(() => window.__ls);
      assert.ok(n1 <= n0, `창 · 문서 처리기 ${n0} → ${n1}`);
      return `창 · 문서 · body 처리기 ${n0} → ${n1}`;
    });
    await step('페이지 오류 없음', async () => { assert.deepStrictEqual(errors, []); });
  } finally { await browser.close(); srv.kill(); fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log(results.join('\n'));
  console.log(`\n${results.length - fail} 통과 · ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})();
