#!/usr/bin/env node
// ================================================================
//  편집기 셸 · 이벤트 편집기 UI 테스트 (웹 모드 + Playwright · Chromium — 실제 마우스 · 키보드)
//    사용: NODE_PATH=$(npm root -g) node tools/tests/ui-editor.js
//    패널 접기(단축키 · 버튼 · 다시 열어도 기억) · 좁은 창 · 상태 줄(맵 도구 · 저장 상태) · 입력 중 단축키 · 검사가 접힌 출력 창을 엶,
//    이벤트 명령: 누르면 속성 창에서 고침 → 실행 취소 · 번호 · ⚠ · 명령 찾기 · 키보드 이동 · 미리보기(연출 명령), 탭을 오가도 창 이벤트가 쌓이지 않음
// ================================================================
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert'), { spawn } = require('child_process');
const env = require('./editor-env');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_) { console.log('playwright 를 찾지 못했습니다 — NODE_PATH=$(npm root -g) node tools/tests/ui-editor.js'); process.exit(2); }
const ROOT = path.join(__dirname, '..', '..');

async function makeProject(dir) {
  const ctx = env.load(), S = ctx.PDM.store;
  await S.createNew(dir, 'ui-editor');
  S.edit('project', '확장', p => { p.extensions = { event: true, story: true }; });
  const k = S.keys('node')[0];
  S.edit(k, '맵', r => { r.mode = 'handmade'; r.size = { w: 10, h: 8 }; r.layers = { terrain: new Array(80).fill(1) }; r.objects = []; });
  S.add('event:ev', { format: 'pdmaker-event', version: 1, id: 'ev', name: '연출 시험', pages: [{ trigger: 'action', conds: {}, cond: '', commands: [
    { cmd: 'text', name: '안내자', text: '안녕' }, { cmd: 'illust', slot: 1, image: '', pos: 'left', fade: 3 }, { cmd: 'wait', turns: 2 }] }] });
  await S.save();
  return { node: k };
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdm-uied-')), dir = path.join(tmp, 'proj'); fs.mkdirSync(dir);
  const P = await makeProject(dir);
  const port = 18000 + Math.floor(Math.random() * 1000);
  const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', '/'], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    const live = window.__listeners = {};
    const add = window.addEventListener, rem = window.removeEventListener;
    window.addEventListener = function (t, f, o) { (live[t] = live[t] || new Set()).add(f); return add.call(this, t, f, o); };
    window.removeEventListener = function (t, f, o) { if (live[t]) live[t].delete(f); return rem.call(this, t, f, o); };
  });
  const results = []; let fail = 0;
  const step = async (name, fn) => { try { const r = await fn(); results.push(`✓ ${name}${r ? `\n    ${r}` : ''}`); } catch (e) { fail++; results.push(`✗ ${name}\n    ${String(e.message || e).split('\n').join('\n    ')}`); } };
  const url = `http://127.0.0.1:${port}${ROOT}/editor/renderer/index.html?project=${encodeURIComponent(dir)}`;
  const open = async () => { await page.goto(url); await page.waitForFunction(() => window.PDM && PDM.store && PDM.store.isOpen && PDM.tabs.active, null, { timeout: 30000 }); await page.waitForTimeout(500); };
  const visible = sel => page.evaluate(s => { const e = document.querySelector(s); return !!e && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0; }, sel);
  const key = async k => { await page.keyboard.press(k); await page.waitForTimeout(200); };
  const canvasW = () => page.evaluate(() => document.querySelector('#center').getBoundingClientRect().width);
  try {
    await open();
    await step('패널 접기: Ctrl+B · Ctrl+Shift+B · Ctrl+J 와 상태 줄 버튼 — 가운데 작업 칸이 넓어짐', async () => {
      const w0 = await canvasW();
      await key('Control+b'); assert.ok(!(await visible('#tree')), '리소스 패널');
      await key('Control+Shift+b'); assert.ok(!(await visible('#inspector')), '속성 패널');
      await key('Control+j'); assert.ok(!(await visible('#bottom')), '출력 패널');
      const w1 = await canvasW();
      assert.ok(w1 > w0 + 500, `넓어짐 ${w0} → ${w1}`);
      await page.click('#stPanels button:has-text("리소스")'); assert.ok(await visible('#tree'));
      return `가운데 너비 ${Math.round(w0)} → ${Math.round(w1)}px (세 패널 접음)`;
    });
    await step('다시 열어도 접은 상태 · 끈 크기를 기억 (localStorage)', async () => {
      await open();
      assert.ok(await visible('#tree') && !(await visible('#inspector')) && !(await visible('#bottom')));
      await page.click('.pnl-x[data-panel="tree"]'); assert.ok(!(await visible('#tree')), '패널 제목의 « 버튼');
      await key('Control+b'); await key('Control+Shift+b');
    });
    await step('검사(F7)는 접힌 출력 창을 펼쳐서 보여 줌', async () => {
      assert.ok(!(await visible('#bottom')));
      await key('F7');
      await page.waitForTimeout(400);
      assert.ok(await visible('#bottom') && await visible('#checkBody'));
    });
    await step('입력 칸에 글을 칠 때는 패널 단축키가 동작하지 않음 (글자 입력 우선)', async () => {
      await page.click('#treeSearch input'); await page.keyboard.type('맵');
      await page.keyboard.press('Control+b'); await page.waitForTimeout(150);
      assert.ok(await visible('#tree'), '리소스 패널이 접히면 안 됨');
      await page.fill('#treeSearch input', ''); await page.evaluate(() => document.activeElement.blur());
    });
    await step('좁은 창(1000×640)에서도 맵 캔버스가 보이고 도구가 동작 (패널 접기로 공간 확보)', async () => {
      await page.setViewportSize({ width: 1000, height: 640 });
      await page.evaluate(k => PDM.tabs.open(k), P.node); await page.waitForTimeout(600);
      const before = await page.evaluate(() => { const r = document.querySelector('.map-scroll').getBoundingClientRect(); return [r.width, r.height]; });
      await key('Control+b'); await key('Control+j');
      const after = await page.evaluate(() => { const r = document.querySelector('.map-scroll').getBoundingClientRect(); return [r.width, r.height]; });
      assert.ok(after[0] > before[0] && after[1] > before[1], `${before} → ${after}`);
      await key('Control+b'); await key('Control+j');
      return `맵 보기 영역 ${before.map(Math.round).join('×')} → ${after.map(Math.round).join('×')}px`;
    });
    await step('상태 줄: 맵 편집기의 도구 · 확대 · 맵 크기 · 선택 / 다른 탭으로 가면 비움', async () => {
      await key('m');
      let t = await page.textContent('#stCtx'); assert.ok(t.includes('도구: 선택') && t.includes('10×8칸') && t.includes('×'), t);
      await key('b'); t = await page.textContent('#stCtx'); assert.ok(t.includes('도구: 펜'), t);
      await key('Control+a'); t = await page.textContent('#stCtx'); assert.ok(t.includes('영역 10×8'), t);
      await key('Escape');
      await page.evaluate(() => PDM.tabs.open('event:ev')); await page.waitForTimeout(400);
      assert.strictEqual((await page.textContent('#stCtx')).trim(), '');
      await page.setViewportSize({ width: 1400, height: 900 });
      return '도구 바꾸기 · Ctrl+A 영역이 바로 반영';
    });
    await step('저장 상태: 바꾸면 "저장 안 됨 (n개)" → Ctrl+S → "저장됨"', async () => {
      await page.evaluate(() => PDM.store.edit('event:ev', '이름', r => { r.name = '연출 시험 2'; }));
      await page.waitForTimeout(150);
      let t = await page.textContent('#stDirty'); assert.ok(/저장 안 됨 \(1개\)/.test(t), t);
      await key('Control+s'); await page.waitForTimeout(400);
      t = await page.textContent('#stDirty'); assert.ok(t.includes('저장됨'), t);
    });
    await step('이벤트 명령: 누르면 속성 창에서 바로 고침 · 목록 글이 바뀜 · 입력 중 초점 유지 · Ctrl+Z 한 번으로 되돌림', async () => {
      await page.click('.cmdlist .cmd:has-text("안녕")'); await page.waitForTimeout(200);
      assert.ok((await page.textContent('#inspTitle')).includes('1. 대사 표시'));
      const ta = page.locator('#inspBody textarea').first();
      await ta.click(); await ta.fill('반가워요\n둘째 줄'); await page.waitForTimeout(700);
      assert.strictEqual(await page.evaluate(() => document.activeElement.tagName), 'TEXTAREA', '입력 중 초점');
      assert.strictEqual(await page.evaluate(() => PDM.store.get('event:ev').pages[0].commands[0].text), '반가워요\n둘째 줄');
      assert.ok((await page.textContent('.cmdlist')).includes('반가워요 ⏎ 둘째 줄'));
      await page.evaluate(() => document.activeElement.blur()); await key('Control+z');
      assert.strictEqual(await page.evaluate(() => PDM.store.get('event:ev').pages[0].commands[0].text), '안녕');
      assert.ok((await page.textContent('#inspBody')).length > 0 && (await page.inputValue('#inspBody textarea')) === '안녕', '되돌린 뒤 속성 창도 같은 명령 · 같은 값');
    });
    await step('번호 · ⚠(빈 값) · 도구 줄(복제 · 위/아래 · 삭제) · 키보드 ↑↓ · Alt+↓ 옮기기', async () => {
      const nums = await page.$$eval('.cmdlist .cmd .cn', e => e.map(x => x.textContent));
      assert.deepStrictEqual(nums, ['1', '2', '3']);
      assert.ok(await page.$eval('.cmdlist .cmd:nth-of-type(3)', e => e.classList.contains('bad')) || (await page.$$eval('.cmdlist .cmd.bad', e => e.length)) === 1, '그림 없는 일러스트 ⚠');
      await page.click('.cmdlist .cmd:has-text("대기")');
      await page.focus('.cmdlist'); await key('ArrowUp');
      assert.ok((await page.textContent('#inspTitle')).startsWith('2.'));
      await key('Alt+ArrowUp');
      assert.deepStrictEqual(await page.evaluate(() => PDM.store.get('event:ev').pages[0].commands.map(c => c.cmd)), ['illust', 'text', 'wait']);
      await page.click('.cmd-bar button:has-text("복제")');
      assert.strictEqual(await page.evaluate(() => PDM.store.get('event:ev').pages[0].commands.length), 4);
      await page.evaluate(() => document.activeElement.blur()); await key('Control+z'); await key('Control+z');
      assert.deepStrictEqual(await page.evaluate(() => PDM.store.get('event:ev').pages[0].commands.map(c => c.cmd)), ['text', 'illust', 'wait']);
    });
    await step('명령 추가: 찾기 칸에 "움직" → Enter = 일러스트 움직이기 · 기본값으로 추가', async () => {
      await page.click('.cmd-bar button:has-text("명령 추가")'); await page.waitForTimeout(300);
      await page.keyboard.type('움직'); await page.waitForTimeout(150);
      const shown = await page.$$eval('.cmd-pick', e => e.filter(b => !b.hidden).map(b => b.textContent));
      assert.deepStrictEqual(shown, ['일러스트 움직이기']);
      await page.keyboard.press('Enter'); await page.waitForTimeout(300);
      await page.click('.modal-foot .pri'); await page.waitForTimeout(300);
      const cmds = await page.evaluate(() => PDM.store.get('event:ev').pages[0].commands.map(c => c.cmd));
      assert.ok(cmds.includes('illustMove'), cmds.join(','));
      await page.evaluate(() => document.activeElement.blur()); await key('Control+z');
    });
    await step('미리보기: 새 연출 명령(크기 · 움직이기 · 화면 어둡게 · 입력 기다리기)이 오류 없이 재생', async () => {
      await page.evaluate(() => PDM.store.edit('event:ev', '연출', r => { r.pages[0].commands = [
        { cmd: 'fade', op: 'out', time: 2, wait: true }, { cmd: 'fade', op: 'in', time: 2, wait: true }, { cmd: 'illust', slot: 1, image: 'assets/none.png', pos: 'left', scale: 50 },
        { cmd: 'illustMove', slot: 1, pos: 'right', time: 2 }, { cmd: 'waitInput' }, { cmd: 'text', name: 'A', text: '끝', auto: 3 }]; }));
      await page.click('button:has-text("미리보기")'); await page.waitForTimeout(1200);
      await page.click('.scene-prev'); await page.waitForTimeout(900);
      const log = await page.textContent('.sim-log');
      assert.ok(log.includes('그림 없음: assets/none.png') && log.includes('입력 기다리는 중'), log);
      await page.click('.modal-foot button:has-text("닫기")'); await page.waitForTimeout(200);
      return '로그: ' + log.replace(/\s+/g, ' ').slice(0, 120);
    });
    await step('탭을 20번 오가도 창 이벤트가 쌓이지 않음', async () => {
      const count = () => page.evaluate(() => Object.fromEntries(Object.entries(window.__listeners).map(([k, v]) => [k, v.size])));
      await page.evaluate(k => PDM.tabs.open(k), P.node); await page.waitForTimeout(300);
      const a = await count();
      for (let i = 0; i < 10; i++) { await page.evaluate(() => PDM.tabs.open('event:ev')); await page.evaluate(k => { PDM.tabs.open(k); PDM.tabs.refresh(k); }, P.node); }
      await page.waitForTimeout(300);
      const b = await count();
      ['keydown', 'keyup', 'pointermove', 'pointerup', 'mousemove', 'mouseup'].forEach(t => assert.strictEqual(b[t] || 0, a[t] || 0, `${t}: ${a[t]} → ${b[t]}`));
      return Object.entries(b).map(([k, v]) => `${k} ${v}`).join(' · ');
    });
    await step('페이지 오류 없음', async () => { assert.deepStrictEqual(errors, []); });
  } finally { await browser.close(); srv.kill(); fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log(results.join('\n'));
  console.log(`\n${results.length - fail} 통과 · ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})();
