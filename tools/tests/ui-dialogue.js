#!/usr/bin/env node
// ================================================================
//  대사 글꼴 · 연출 탭과 테스트 플레이 실행 환경 UI 테스트 (5차 — 웹 모드 + Playwright · Chromium)
//    사용: NODE_PATH=$(npm root -g) node tools/tests/ui-dialogue.js
//    ① 예전 프로젝트(testplay 없음) = PC 기본 · 도구 모음 실행 환경 단추
//    ② 실행 환경 메뉴로 모바일 세로 → project.json testplay 에 저장 · 단추 폭 그대로 · 저장 → 다시 열기
//    ③ 실행 환경 창: 계산 결과(기기 px → UI → PC 창) · 틀린 값은 고쳐서 저장
//    ④ 대사 명령 속성: 내용 · 글꼴 · 출력 · 연출 · 미리보기 탭, 빈 칸 = 기본(값을 지움), 0 도 값
//    ⑤ 미리보기: 앞선 "대사 스타일"(연출 rise · 자간) 적용 · 강조 글자 · grapheme · 글자 연출이 실제로 움직임
//    ⑥ 미리보기를 닫으면 프레임 루프가 멈춤 (타이머 누수 없음) · 페이지 오류 없음
// ================================================================
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert'), { spawn } = require('child_process');
const env = require('./editor-env');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_) { console.log('playwright 를 찾지 못했습니다 — NODE_PATH=$(npm root -g) node tools/tests/ui-dialogue.js'); process.exit(2); }
const ROOT = path.join(__dirname, '..', '..');

async function makeProject(dir) {
  const ctx = env.load(), S = ctx.PDM.store;
  await S.createNew(dir, 'ui-dialogue');
  S.edit('project', '확장', p => { p.extensions = { event: true, story: true }; delete p.testplay; });
  S.add('event:ev', { format: 'pdmaker-event', version: 1, id: 'ev', name: '대사 연출', pages: [{ trigger: 'action', conds: {}, cond: '', commands: [
    { cmd: 'textStyle', effect: 'rise', tracking: 2, fxDur: 10 },
    { cmd: 'text', name: '안내자', text: '글자 **강조** 👍🏽 English 가나다' },
    { cmd: 'text', name: '안내자', text: '둘째 줄' }] }] });
  await S.save();
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdm-uidlg-')), dir = path.join(tmp, 'proj'); fs.mkdirSync(dir);
  await makeProject(dir);
  const port = 18900 + Math.floor(Math.random() * 900);
  const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', '/'], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  // 프레임 콜백 수 (미리보기 루프가 멈추는지)
  await page.addInitScript(() => { window.__raf = 0; const o = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = cb => o(t => { window.__raf++; cb(t); }); });
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  const results = []; let fail = 0;
  const step = async (name, fn) => { try { const r = await fn(); results.push(`✓ ${name}${r ? `\n    ${r}` : ''}`); } catch (e) { fail++; results.push(`✗ ${name}\n    ${String(e.message || e).split('\n').slice(0, 6).join('\n    ')}`); } };
  const url = `http://127.0.0.1:${port}${ROOT}/editor/renderer/index.html?project=${encodeURIComponent(dir)}`;
  const tp = () => page.evaluate(() => JSON.parse(JSON.stringify((PDM.store.get('project') || {}).testplay || null)));
  const btn = async () => { await page.waitForSelector('.env-btn'); await page.waitForTimeout(120); return page.evaluate(() => { const b = document.querySelector('.env-btn'); const r = b.getBoundingClientRect(); return { env: b.dataset.env, text: b.textContent.trim(), w: Math.round(r.width), x: Math.round(r.x) }; }); };
  const open = async () => { await page.goto(url); await page.waitForFunction(() => window.PDM && PDM.store && PDM.store.isOpen, null, { timeout: 15000 }); await page.waitForSelector('.env-btn'); await page.waitForTimeout(500); };   // 도구 모음은 프로젝트를 연 뒤 다시 그림
  try {
    await open();
    await step('① 예전 프로젝트(testplay 없음) = PC 기본 · 도구 모음 단추', async () => {
      assert.strictEqual(await tp(), null, '프로젝트 파일은 그대로 (열기만 해서는 쓰지 않음)');
      const b = await btn(); assert.strictEqual(b.env, 'pc'); assert.ok(b.text.includes('PC'), b.text);
      return b.text;
    });
    let w0;
    await step('② 메뉴로 모바일 세로 → testplay 저장 · 단추 폭/자리 그대로 · 저장 → 다시 열기', async () => {
      const b0 = await btn(); w0 = b0;
      await page.click('.env-btn'); await page.click('.ctx .ctx-i:has-text("모바일 세로")'); await page.waitForTimeout(200);
      const t = await tp(); assert.strictEqual(t.env, 'phone-port');
      const b1 = await btn(); assert.strictEqual(b1.env, 'phone-port');
      assert.ok(Math.abs(b1.w - b0.w) <= 1 && b1.x === b0.x, `단추 ${b0.w}px@${b0.x} → ${b1.w}px@${b1.x}`);
      await page.click('.env-btn'); await page.click('.ctx .ctx-i:has-text("4배속")'); await page.waitForTimeout(150);
      await page.keyboard.press('Control+s'); await page.waitForTimeout(500);
      // 웹 모드 저장은 localStorage 덧씌우기 → 다시 열면 같은 값
      await open();
      const t2 = await tp(); assert.strictEqual(t2.env, 'phone-port'); assert.strictEqual(t2.speed, 4);
      const b2 = await btn(); assert.ok(b2.text.includes('4×'), b2.text);
      return `${b0.text} → ${b2.text} (폭 ${b0.w} → ${b2.w}px)`;
    });
    await step('③ 실행 환경 창: 계산 결과 · 틀린 값은 안전한 값으로', async () => {
      await page.click('.env-btn'); await page.click('.ctx .ctx-i:has-text("실행 환경 설정")'); await page.waitForTimeout(300);
      const calc = await page.textContent('.env-calc'); assert.ok(calc.includes('154×334') && calc.includes('462×1002'), calc);
      await page.evaluate(() => { PDM.store.edit('project', '시험', p => { p.testplay = Object.assign({}, p.testplay, { speed: 3, uiScale: 99 }); }); });
      const fixed = await page.evaluate(() => PDM.testEnv.normalize(PDM.store.get('project').testplay));
      assert.deepStrictEqual([fixed.cfg.speed, fixed.cfg.uiScale, fixed.fixes.sort()], [1, 12, ['speed', 'uiScale']]);
      await page.keyboard.press('Escape'); await page.waitForTimeout(200);
      return calc.replace(/\s+/g, ' ').slice(0, 120);
    });
    await step('④ 대사 명령 속성: 탭 5개 · 글꼴 탭 빈 칸 = 기본(값 지움) · 0 도 값', async () => {
      await page.evaluate(() => PDM.tabs.open('event:ev')); await page.waitForTimeout(400);
      await page.click('.cmdlist .cmd:has-text("English")'); await page.waitForTimeout(200);
      const tabs = await page.$$eval('#inspBody .tabs-cmd button', bs => bs.map(b => b.textContent));
      assert.deepStrictEqual(tabs, ['내용', '글꼴', '출력', '연출', '미리보기']);
      await page.click('#inspBody .tabs-cmd button:has-text("글꼴")');
      const tr = page.locator('#inspBody [data-k="tracking"] input'); await tr.fill('0'); await page.waitForTimeout(600);
      assert.strictEqual(await page.evaluate(() => PDM.store.get('event:ev').pages[0].commands[1].tracking), 0, '0 도 값');
      await tr.fill(''); await page.waitForTimeout(600);
      assert.strictEqual(await page.evaluate(() => 'tracking' in PDM.store.get('event:ev').pages[0].commands[1]), false, '비우면 값이 없어짐 (대사 스타일 → 대사창 설정)');
      // 다른 명령을 눌렀다 돌아와도 마지막 탭
      await page.click('.cmdlist .cmd:has-text("둘째 줄")'); await page.waitForTimeout(200);
      assert.strictEqual(await page.textContent('#inspBody .tabs-cmd button.on'), '글꼴');
      return '탭: ' + tabs.join(' · ');
    });
    await step('⑤ 미리보기: 앞선 대사 스타일(rise · 자간 2) · 강조 · grapheme · 글자가 실제로 움직임', async () => {
      await page.click('.cmdlist .cmd:has-text("English")'); await page.waitForTimeout(200);
      await page.click('#inspBody .tabs-cmd button:has-text("미리보기")'); await page.waitForTimeout(250);
      const a = await page.evaluate(() => { const t = document.querySelector('.cmd-pv .dlg-text'), sp = [...t.querySelectorAll('.dlg-ch')];
        return { n: sp.length, chars: sp.map(s => s.textContent), em: sp.filter(s => s.dataset.em).map(s => s.textContent).join(''), ls: t.style.letterSpacing, moving: sp.filter(s => s.style.transform || s.style.opacity).length, info: document.querySelector('#inspBody .cmd-pv + div + p').textContent }; });
      assert.ok(a.chars.includes('👍🏽'), '이모지 조합이 한 글자');
      assert.strictEqual(a.em, '강조'); assert.ok(a.ls && parseFloat(a.ls) > 0, '자간 ' + a.ls);
      assert.ok(a.info.includes('올라옴') && a.info.includes('자간 2'), a.info);
      await page.waitForTimeout(1600);
      const b = await page.evaluate(() => [...document.querySelectorAll('.cmd-pv .dlg-ch')].filter(s => s.style.transform || s.style.opacity).length);
      assert.ok(a.moving > 0 || b === 0, '나오는 동안 움직이는 글자');
      assert.strictEqual(b, 0, '다 나온 뒤에는 제자리');
      return `글자 ${a.n}개 · 움직이던 글자 ${a.moving} → ${b} · ${a.info}`;
    });
    await step('⑥ 미리보기를 닫으면 프레임 루프가 멈춤 (타이머 누수 없음)', async () => {
      await page.click('#inspBody .tabs-cmd button:has-text("미리보기")'); await page.waitForTimeout(100);   // 다시 재생
      const during = await page.evaluate(async () => { const a = window.__raf; await new Promise(r => setTimeout(r, 300)); return window.__raf - a; });
      await page.click('#inspBody .tabs-cmd button:has-text("내용")'); await page.waitForTimeout(200);
      const after = await page.evaluate(async () => { const a = window.__raf; await new Promise(r => setTimeout(r, 500)); return window.__raf - a; });
      assert.ok(during > 5, '재생 중 프레임 ' + during);
      assert.ok(after <= 2, '닫은 뒤 프레임 ' + after);
      return `재생 중 0.3초 ${during}프레임 → 닫은 뒤 0.5초 ${after}프레임`;
    });
    await step('⑦ "대사 스타일" 명령: 목록 요약 · 연출 탭', async () => {
      const t = await page.textContent('.cmdlist .cmd:has-text("대사 스타일")'); assert.ok(t.includes('자간 2') && t.includes('rise'), t);
      return t.trim().replace(/\s+/g, ' ');
    });
    await step('페이지 오류 없음', async () => { assert.deepStrictEqual(errors, []); });
  } finally { await browser.close(); srv.kill(); fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log(results.join('\n'));
  console.log(`\n${results.length - fail} 통과 · ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})();
