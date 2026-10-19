#!/usr/bin/env node
// ================================================================
//  6차 UI 테스트 — 스크린/카메라 연출 명령 · 게임 UI 테마 편집 (웹 모드 + Playwright · Chromium)
//    사용: NODE_PATH=$(npm root -g) node tools/tests/ui-camera-theme.js
//    ① 명령 넣기 창에 "카메라 / 스크린" 묶음 4개 · 새 명령 기본값(런타임과 같게 — 기다림 켬)
//    ② 고른 설정에 따라 필요한 칸만 (이동할 곳 = 월드 → x · y 숫자, 리셋 = 바로 → 시간 · 기다림 숨김) · 저장되는 값
//    ③ 이벤트 미리보기: 카메라 연출을 PDM.camera 식으로 — 흔들림이 끝나면 정확히 처음 자리 · 창을 닫으면 멈춤
//    ④ 게임 UI 테마(스프라이트 스킨): 프로젝트가 바꾼 chrome.png 조각으로 미리보기 · 쓸 조각 고르기 · 대비 검사 · 대사창의 "테마" 칸(빈 값) · 저장 → 다시 열기 · 예전 프로젝트(테마 파일 없음)
// ================================================================
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert'), { spawn, execFileSync } = require('child_process');
const env = require('./editor-env');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_) { console.log('playwright 를 찾지 못했습니다 — NODE_PATH=$(npm root -g) node tools/tests/ui-camera-theme.js'); process.exit(2); }
const ROOT = path.join(__dirname, '..', '..');

async function makeProject(dir, old) {
  const ctx = env.load(), S = ctx.PDM.store;
  await S.createNew(dir, 'ui-camera-theme');
  S.edit('project', '확장', p => { p.extensions = { event: true, story: true }; p.gameRepo = path.relative(dir, path.join(ROOT, 'game', 'shattered-pixel-dungeon-master')); });
  S.add('event:ev', { format: 'pdmaker-event', version: 1, id: 'ev', name: '카메라 연출', pages: [{ trigger: 'action', conds: {}, cond: '', commands: [
    { cmd: 'camShake', power: 6, time: 5, freq: 12, decay: 'linear', axis: 'both', wait: true }, { cmd: 'text', name: '안내자', text: '흔들림 뒤 대사' }] }] });
  await S.save();
  if (!old) {   // 프로젝트 스킨: 원작 chrome.png 의 빨강 ↔ 파랑을 바꾼 그림 (UI 그림 페이지에서 바꾼 것과 같은 자리)
    const src = path.join(ROOT, 'game', 'shattered-pixel-dungeon-master', 'core', 'src', 'main', 'assets', 'interfaces', 'chrome.png'), out = path.join(dir, 'assets', 'game', 'interfaces');
    fs.mkdirSync(out, { recursive: true });
    execFileSync('python3', ['-c', 'import sys\nfrom PIL import Image\nr,g,b,a=Image.open(sys.argv[1]).convert("RGBA").split()\nImage.merge("RGBA",(b,g,r,a)).save(sys.argv[2])', src, path.join(out, 'chrome.png')]);
  }
  if (old) {   // 예전 프로젝트처럼: 테마 파일 없음 · 대사창 색은 직접 값
    fs.rmSync(path.join(dir, 'theme.json'));
    const dj = JSON.parse(fs.readFileSync(path.join(dir, 'dialogue.json'), 'utf8'));
    Object.assign(dj.box, { color: '#ffffff', border: '#b9b4c8', textColor: '#3a3448', highlight: '#d0602a', style: 'round' });
    fs.writeFileSync(path.join(dir, 'dialogue.json'), JSON.stringify(dj));
  }
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdm-camth-')), dir = path.join(tmp, 'proj'), oldDir = path.join(tmp, 'old');
  fs.mkdirSync(dir); fs.mkdirSync(oldDir);
  await makeProject(dir, false); await makeProject(oldDir, true);
  const port = 19600 + Math.floor(Math.random() * 300);
  const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', '/'], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  const results = []; let fail = 0;
  const step = async (name, fn) => { try { const r = await fn(); results.push(`✓ ${name}${r ? `\n    ${r}` : ''}`); } catch (e) { fail++; results.push(`✗ ${name}\n    ${String(e.message || e).split('\n').slice(0, 6).join('\n    ')}`); } };
  const open = async d => { await page.goto(`http://127.0.0.1:${port}${ROOT}/editor/renderer/index.html?project=${encodeURIComponent(d)}`); await page.waitForFunction(() => window.PDM && PDM.store && PDM.store.isOpen && PDM.tabs.active, null, { timeout: 15000 }); await page.waitForTimeout(800); };   // 프로젝트를 연 뒤 첫 탭(맵 그래프)이 열릴 때까지
  /** 탭 열기 — 그 탭이 실제로 앞에 올 때까지 */
  const tab = async k => { await page.evaluate(x => PDM.tabs.open(x), k); await page.waitForFunction(x => PDM.tabs.active === x, k, { timeout: 5000 }); await page.waitForTimeout(300); };
  /** 지금 탭의 화면 (숨은 탭의 .page 와 섞이지 않게) */
  const pageText = () => page.evaluate(() => [...document.querySelectorAll('.page')].filter(e => e.offsetParent !== null).map(e => e.textContent).join(' '));
  const cmds = () => page.evaluate(() => JSON.parse(JSON.stringify(PDM.store.get('event:ev').pages[0].commands)));
  try {
    await open(dir);
    await tab('event:ev');
    await step('① 명령 넣기 창: "카메라 / 스크린" 묶음 4개 · 새 스크린 이동 = 기본값(타일 · 1초 · 부드럽게 · 기다림 켬)', async () => {
      await page.click('.cmd-bar button:has-text("+ 명령 추가")'); await page.waitForTimeout(200);
      const grp = await page.$$eval('.cmd-grp', gs => gs.map(g => [g.querySelector('.fl').textContent, [...g.querySelectorAll('.cmd-pick')].map(b => b.textContent)]).find(([t]) => t === '카메라 / 스크린'));
      assert.ok(grp, '묶음'); assert.deepStrictEqual(grp[1], ['스크린 이동', '스크린 팔로우', '스크린 쉐이크', '스크린 리셋']);
      await page.click('.cmd-pick:has-text("스크린 이동")'); await page.waitForTimeout(300);
      const labels = await page.$$eval('.modal .field .fl', ls => ls.map(l => l.textContent));
      assert.ok(labels.some(l => l.startsWith('칸 (x, y')) && !labels.some(l => l.startsWith('월드 x')), '타일일 때는 칸 고르기만 — ' + labels.join(' | '));
      return grp[1].join(' · ');
    });
    await step('② 이동할 곳을 "월드"로 → x · y 숫자 칸 (단위 표시) · 저장 값', async () => {
      await page.selectOption('.modal select', 'world'); await page.waitForTimeout(200);
      const labels = await page.$$eval('.modal .field .fl', ls => ls.map(l => l.textContent));
      assert.ok(labels.some(l => l.includes('월드 x (게임 픽셀')) && !labels.some(l => l.startsWith('칸 (x, y')), labels.join(' | '));
      const nums = page.locator('.modal input[type=number]'); await nums.nth(0).fill('120'); await nums.nth(1).fill('64');
      await page.click('.modal-foot .pri'); await page.waitForTimeout(300);
      const c = (await cmds()).find(x => x.cmd === 'camMove');
      assert.deepStrictEqual([c.target, c.x, c.y, c.time, c.ease, c.wait], ['world', 120, 64, 10, 'smooth', true]);
      const sum = await page.textContent('.cmdlist .cmd:has-text("스크린 이동")'); assert.ok(sum.includes('월드 (120, 64)px') && sum.includes('1초'), sum);
      return sum.trim().replace(/\s+/g, ' ');
    });
    await step('② 스크린 리셋: "바로"를 고르면 시간 · 기다림 칸이 사라짐 (속성 창)', async () => {
      await page.evaluate(() => PDM.store.edit('event:ev', 'reset', r => { r.pages[0].commands.push(Object.assign({ cmd: 'camReset' }, PDM.COMMANDS.camReset.defaults)); }));
      await page.waitForTimeout(300);
      await page.click('.cmdlist .cmd:has-text("스크린 리셋")'); await page.waitForTimeout(200);
      let labels = await page.$$eval('#inspBody .field .fl', ls => ls.map(l => l.textContent));
      assert.ok(labels.some(l => l.startsWith('돌아가는 시간')), labels.join(' | '));
      await page.selectOption('#inspBody select', 'instant'); await page.waitForTimeout(700);
      labels = await page.$$eval('#inspBody .field .fl', ls => ls.map(l => l.textContent));
      assert.ok(!labels.some(l => l.startsWith('돌아가는 시간')) && !labels.some(l => l.startsWith('다 돌아갈 때까지')), labels.join(' | '));
      assert.strictEqual((await cmds()).find(x => x.cmd === 'camReset').mode, 'instant');
    });
    await step('③ 이벤트 미리보기: 흔들림이 끝나면 정확히 처음 자리 (PDM.camera 식) · 그동안 대사로 넘어가지 않음', async () => {
      await page.click('button:has-text("▶ 미리보기")'); await page.waitForTimeout(150);
      const pos = () => page.evaluate(() => { const w = document.querySelector('.scene-world'); return w ? w.style.backgroundPosition : null; });
      const samples = []; for (let i = 0; i < 5; i++) { samples.push(await pos()); await page.waitForTimeout(60); }
      assert.ok(new Set(samples).size > 1, '흔들리는 중 자리가 바뀜: ' + samples.join(' / '));
      assert.strictEqual(await page.evaluate(() => !!document.querySelector('.scene-prev .dlg')), false, '흔들림을 기다리는 동안 대사가 뜨면 안 됨');
      await page.waitForTimeout(700);
      assert.ok(/^-?0(\.0)?px -?0(\.0)?px$/.test(await pos()), '끝난 뒤 0: ' + await pos());
      await page.keyboard.press('Escape'); await page.waitForTimeout(200);
      return samples.join(' → ');
    });
    await step('④ 게임 UI 테마: 프로젝트 chrome.png 의 조각으로 미리보기 (원작 그림이 아니라 바꾼 그림)', async () => {
      await tab('theme');
      assert.ok((await pageText()).includes('게임 UI 테마'));
      await page.waitForSelector('.gt-sheet canvas', { timeout: 5000 }); await page.waitForTimeout(300);
      const w = await page.evaluate(async () => { const p = await PDM.gameTheme.piece('WINDOW'), r = await PDM.gameTheme.piece('RED_BUTTON'); return [p.center, r.center, PDM.assets.isOverridden('interfaces/chrome.png')]; });
      assert.deepStrictEqual(w, ['#39403e', '#2a2ab2', true], '바꾼 그림의 가운데 색 (원작 = #3e4039 · #b22a2a)');
      const prev = await page.$$eval('.gt-prev .gt-patch', ps => ps.map(p => getComputedStyle(p).borderImageSource.slice(0, 20)));
      assert.ok(prev.length >= 6 && prev.every(x => x.startsWith('url("data:image/png')), prev.join(' | '));
      const checks = await page.$$eval('.gt-check', c => c.map(x => x.textContent));
      assert.ok(checks.length === 7 && checks.every(c => c.startsWith('✓')), checks.join(' | '));
      assert.ok((await pageText()).includes('프로젝트가 바꾼 그림'));
      if (process.env.SHOT) await page.screenshot({ path: path.join(process.env.SHOT, 'theme-page.png'), fullPage: true });
      return checks.join(' · ');
    });
    await step('④ 쓸 조각 고르기: 대사창 = 두루마리(밝은 그림) → theme.json skin · 미리보기 · 대비 경고 · 글자 색 고치면 풀림', async () => {
      const sel = page.locator('.gt-skins .field:has(.fl:text-is("대사창")) select');
      await sel.selectOption('SCROLL'); await page.waitForTimeout(500);
      assert.strictEqual(await page.evaluate(() => PDM.store.get('theme').skin.box), 'SCROLL');
      const bad = await page.$$eval('.gt-check[data-ok="0"]', c => c.map(x => x.textContent));
      assert.ok(bad.length && bad[0].includes('대사 글자 / 대사창'), '흰 글자 + 밝은 두루마리 = 경고: ' + bad.join(' | '));
      await page.evaluate(() => PDM.store.edit('theme', 'c', t => { t.colors.text = '#202020'; })); await page.waitForTimeout(500);
      assert.ok((await page.$$eval('.gt-check', c => c.map(x => x.textContent))).find(x => x.includes('대사 글자 / 대사창')).startsWith('✓'));
      await page.evaluate(() => PDM.store.edit('theme', 'c', t => { t.colors.text = '#ffffff'; t.skin.box = 'WINDOW'; t.colors.accent = '#7dd3c0'; })); await page.waitForTimeout(300);
      return bad[0];
    });
    await step('④ 대사창: 새 프로젝트는 모양 = 게임 UI 스킨 · 글자색 칸 = "테마"(빈 값) — 미리보기 상자 = chrome 조각 · 직접 고르면 그 값이 우선', async () => {
      await page.evaluate(() => PDM.store.edit('dialogue', 'box', d => { d.mode = 'box'; })); await page.waitForTimeout(200);
      await tab('dialogue');
      assert.strictEqual(await page.evaluate(() => PDM.Dialogue.cfg().box.style), 'skin');
      await page.waitForSelector('.dlg-box', { timeout: 5000 }); await page.waitForTimeout(300);
      const bi = await page.evaluate(() => getComputedStyle([...document.querySelectorAll('.dlg-box')].find(e => e.offsetParent !== null)).borderImageSource.slice(0, 20));
      assert.ok(bi.startsWith('url("data:image/png'), '대사창 = 스프라이트: ' + bi);
      if (process.env.SHOT) { await page.evaluate(() => { document.querySelector('.dlg-prev-ctl input[type=checkbox]').click(); }); await page.waitForTimeout(500); await page.screenshot({ path: path.join(process.env.SHOT, 'theme-dialogue.png') }); }
      const chip = page.locator('.field:has(.fl:text-is("글자색")) .chip').first();
      assert.strictEqual(await chip.getAttribute('aria-pressed'), 'true', '처음엔 테마');
      assert.strictEqual(await page.evaluate(() => PDM.Dialogue.cfg().box.highlight), '#7dd3c0', '미리보기 = 테마 강조색');
      await page.evaluate(() => PDM.store.edit('dialogue', 'c', d => { d.box.textColor = '#112233'; })); await page.waitForTimeout(300);
      assert.strictEqual(await page.evaluate(() => PDM.Dialogue.cfg().box.textColor), '#112233', '직접 값이 우선');
      await page.locator('.field:has(.fl:text-is("글자색")) .chip').first().click(); await page.waitForTimeout(300);
      assert.strictEqual(await page.evaluate(() => PDM.store.get('dialogue').box.textColor), '');
    });
    await step('④ 저장 → 다시 열기: 테마 · 대사창 연결 그대로', async () => {
      await page.keyboard.press('Control+s'); await page.waitForTimeout(500);
      await open(dir);
      assert.strictEqual(await page.evaluate(() => PDM.gameTheme.get().colors.accent), '#7dd3c0');
      assert.deepStrictEqual(await page.evaluate(() => [PDM.store.get('dialogue').box.textColor, PDM.store.get('dialogue').box.style]), ['', '']);
    });
    await step('④ 예전 프로젝트(테마 파일 없음): 열고 저장해도 theme.json 을 만들지 않음 · 대사창 직접 색 그대로 · 화면 안내', async () => {
      await open(oldDir);
      await tab('theme');
      assert.ok((await pageText()).includes('아직 theme.json 이 없어'));
      await page.evaluate(() => PDM.store.edit('event:ev', 'n', r => { r.name = '바꿈'; })); await page.keyboard.press('Control+s'); await page.waitForTimeout(500);
      const files = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('pdmaker_web_overlay_v1') || '{}')).filter(k => k.includes('/old/')).map(k => k.split('/old/')[1]));
      assert.ok(!files.includes('theme.json'), '저장한 파일: ' + files.join(', '));
      assert.deepStrictEqual(await page.evaluate(() => [PDM.Dialogue.cfg().box.color, PDM.Dialogue.cfg().box.style]), ['#ffffff', 'round']);
      return '저장된 파일: ' + files.join(', ');
    });
    await step('페이지 오류 없음', async () => { assert.deepStrictEqual(errors, []); });
  } finally { await browser.close(); srv.kill(); fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log(results.join('\n'));
  console.log(`\n${results.length - fail} 통과 · ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})();
