#!/usr/bin/env node
// ================================================================
//  아이템 공격 모션 타임라인 편집기 UI 테스트 (8차 — 웹 모드 + Playwright · Chromium)
//    사용: NODE_PATH=$(npm root -g) node tools/tests/ui-motion.js [캡처 폴더]
//    아이템 화면 → "모션 · 이펙트 타임라인 편집기" → 꺼짐 안내 → 기본 모션(베기) 복제 → 타임라인(키프레임 두 번 눌러 추가 = 1판 → 2판 같은 값으로)
//    → 끌어서 시각 옮기기(실행 취소 한 번) · 이징 · Delete → 타격 추가 · 맞는 순간 이펙트(판정 구간 밖 → 검사 경고) · 판정 맞추기
//    → 재생 · 멈춤 · 한 프레임 · 처음으로 · 재생 고리(requestAnimationFrame)가 하나뿐 · 탭을 바꾸면 쉼 · 닫으면 멈춤 → 내 모션 저장 → 저장 → 다시 열기
// ================================================================
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert'), { spawn } = require('child_process');
const env = require('./editor-env');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_) { console.log('playwright 를 찾지 못했습니다'); process.exit(2); }
const ROOT = path.join(__dirname, '..', '..');
const SHOTS = process.argv[2] ? path.resolve(process.argv[2]) : null;

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdm-am-')), dir = path.join(tmp, 'proj');
  fs.mkdirSync(dir, { recursive: true });
  { const { PDM } = env.load(), S = PDM.store; await S.createNew(dir, 'ui-motion');
    S.add('item:sw_test', Object.assign(PDM.make && PDM.make.item ? PDM.make.item('sw_test', 'weapon') : {}, { id: 'sw_test', name: '시험 검', category: 'weapon', kind: 'melee', sprite: { sheet: 'builtin:items', name: 'SWORD' } }));
    await S.save(); }
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const port = 18100 + Math.floor(Math.random() * 800);
  const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', '/'], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => { const raf = window.requestAnimationFrame.bind(window); window.__raf = 0; window.requestAnimationFrame = f => { window.__raf++; return raf(f); }; });
  const results = []; let fail = 0;
  const step = async (name, fn) => { try { const r = await fn(); results.push(`✓ ${name}${r ? `\n    ${r}` : ''}`); } catch (e) { fail++; results.push(`✗ ${name}\n    ${String(e.message || e).split('\n').slice(0, 6).join('\n    ')}`); } };
  const url = `http://127.0.0.1:${port}${ROOT}/editor/renderer/index.html?project=${encodeURIComponent(dir)}`;
  const fx = () => page.evaluate(() => JSON.parse(JSON.stringify(PDM.store.get('item:sw_test').attackFx || null)));
  const btn = (text, scope = '.am-page') => page.evaluate(([t, s]) => { const b = [...document.querySelectorAll(s + ' button')].find(e => e.textContent.trim().startsWith(t)); if (!b) throw new Error('버튼 없음: ' + t); b.click(); }, [text, scope]);
  const modalBtn = text => page.evaluate(t => { const ms = document.querySelectorAll('.modal'); const m = ms[ms.length - 1]; const b = [...m.querySelectorAll('.modal-foot button')].find(e => e.textContent.trim() === t); if (!b) throw new Error('창 버튼 없음: ' + t); b.click(); }, text);
  /** 타임라인 캔버스의 (t, 줄) 화면 좌표 — 편집기와 같은 계산 (HEAD 92 · PAD 8 · 줄 22 · 위 18) */
  const ROWS = ['seg', 'hit', 'angle', 'dist', 'scale', 'alpha', 'ox', 'oy', 'ev'];
  const tl = async (t, row) => { const r = await page.evaluate(() => { const c = document.querySelector('.am-tl'), b = c.getBoundingClientRect(); return [b.left, b.top, b.width / c.width, b.height / c.height, c.width]; }); const x = 92 + 8 + t * (r[4] - 92 - 16), y = 18 + ROWS.indexOf(row) * 22 + 11; return [r[0] + x * r[2], r[1] + y * r[3]]; };
  const rafRate = async ms => { const a = await page.evaluate(() => window.__raf); await page.waitForTimeout(ms); return (await page.evaluate(() => window.__raf) - a) * 1000 / ms; };
  try {
    await page.goto(url);
    await page.waitForFunction(() => window.PDM && PDM.store && PDM.store.isOpen && PDM.tabs.active, null, { timeout: 30000 });
    await step('아이템 화면 → 타임라인 편집기(별도 탭) · 모션 꺼짐 = 원래 공격 안내', async () => {
      await page.evaluate(() => PDM.tabs.open('item:sw_test')); await page.waitForTimeout(400);
      await page.evaluate(() => [...document.querySelectorAll('.page button')].find(b => b.textContent.includes('타임라인 편집기')).click()); await page.waitForTimeout(400);
      assert.strictEqual(await page.evaluate(() => PDM.tabs.active), 'atkfx:item:sw_test');
      assert.ok((await page.evaluate(() => document.querySelector('.am-empty').textContent)).includes('원래 공격'));
    });
    await step('기본 모션(베기) 복제 → 1판 keys 그대로 · 타임라인 · 미리보기 · 판정 시각 표시', async () => {
      await btn('↘ 베기'); await page.waitForTimeout(300);
      const f = await fx(); assert.ok(f.on && f.keys.length === 5 && !f.tracks, JSON.stringify(f).slice(0, 120));
      assert.ok(await page.evaluate(() => !!document.querySelector('.am-tl') && !!document.querySelector('.am-pv')));
      const t = await page.evaluate(() => document.querySelector('.am-time').textContent);
      assert.ok(/게임 판정 0\.267초/.test(t), t);
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'motion-editor.png') });
      return t.trim();
    });
    let before;
    await step('크기 줄을 두 번 눌러 키프레임 추가 → 2판 tracks (각도 · 거리 · 크기 · 불투명도가 1판과 같은 값) + 새 키', async () => {
      before = await page.evaluate(() => { const f = PDM.store.get('item:sw_test').attackFx; return [0, .1, .33, .5, .77, 1].map(t => PDM.atkMotion.sample(f, t)); });
      await page.mouse.dblclick(...await tl(0.4, 'scale')); await page.waitForTimeout(250);
      const f = await fx(); assert.ok(f.tracks && f.v === 2, '2판으로');
      assert.strictEqual(f.tracks.scale.length, 6, '크기 키 6개 (5 + 새 키)');
      const after = await page.evaluate(() => { const f = PDM.store.get('item:sw_test').attackFx; return [0, .1, .33, .5, .77, 1].map(t => PDM.atkMotion.sample(f, t)); });
      after.forEach((a, i) => ['angle', 'dist', 'alpha'].forEach(p => assert.ok(Math.abs(a[p] - before[i][p]) < 1e-9, `${p} 가 바뀜`)));
      assert.ok(f.keys && f.keys.length === 5, '1판 keys 는 그대로 남김 (예전 판 호환)');
      return `크기 키 ${f.tracks.scale.map(k => k[0]).join(', ')}`;
    });
    await step('키프레임 끌기 → 시각만 바뀜 · 실행 취소 한 번에 되돌아감', async () => {
      const f0 = await fx(), t0 = f0.tracks.angle[2][0];
      const a = await tl(t0, 'angle'), b = await tl(0.7, 'angle');
      await page.mouse.move(...a); await page.mouse.down(); await page.mouse.move(b[0], b[1], { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(250);
      const f1 = await fx(); const moved = f1.tracks.angle.map(k => k[0]);
      assert.ok(moved.some(t => Math.abs(t - 0.7) < 0.02) && !moved.includes(t0), `옮김 ${moved}`);
      await page.keyboard.press('Control+z'); await page.waitForTimeout(250);
      assert.deepStrictEqual((await fx()).tracks.angle, f0.tracks.angle, '실행 취소 한 번');
      return `${t0} → 0.7 → 실행 취소`;
    });
    await step('키프레임 고르기 → 이징 · 값 고치기 → Delete 로 삭제', async () => {
      await page.mouse.click(...await tl((await fx()).tracks.dist[1][0], 'dist')); await page.waitForTimeout(200);
      const head = await page.evaluate(() => document.querySelector('.am-insp .hint').textContent); assert.ok(head.includes('거리'), head);
      await page.selectOption('.am-insp select[aria-label="이징 (다음 키까지)"]', 'back'); await page.waitForTimeout(200);
      assert.strictEqual((await fx()).tracks.dist[1][2], 'back');
      await page.fill('.am-insp input[aria-label="값"]', '9'); await page.press('.am-insp input[aria-label="값"]', 'Tab'); await page.waitForTimeout(200);
      assert.strictEqual((await fx()).tracks.dist[1][1], 9);
      await page.focus('.am-tl'); await page.keyboard.press('Delete'); await page.waitForTimeout(200);
      assert.strictEqual((await fx()).tracks.dist.length, 4);
      return head;
    });
    await step('타격 추가(두 번 누르기) → "판정은 한 번" 경고 · 맞는 순간 이펙트를 판정 밖에 → "그림만 보이고 판정이 없음" 경고 → 판정 맞추기', async () => {
      await page.mouse.dblclick(...await tl(0.85, 'hit')); await page.waitForTimeout(250);
      assert.strictEqual((await fx()).hits.length, 2);
      let c = await page.evaluate(() => document.querySelector('.am-checks').textContent);
      assert.ok(c.includes('게임 판정은 공격 한 번에 한 번'), c);
      await page.evaluate(() => [...document.querySelectorAll('.am-evs button')].find(b => b.textContent.includes('＋ 이펙트')).click()); await page.waitForTimeout(150);
      await page.evaluate(() => [...document.querySelectorAll('.ctx .ctx-i')].find(e => e.textContent.startsWith('맞는 번쩍임')).click()); await page.waitForTimeout(250);
      await page.fill('.am-insp input[aria-label="시작 (0~1)"]', '0.95'); await page.press('.am-insp input[aria-label="시작 (0~1)"]', 'Tab'); await page.waitForTimeout(250);
      c = await page.evaluate(() => document.querySelector('.am-checks').textContent);
      assert.ok(c.includes('그림만 보이고 판정이 없습니다'), c);
      await page.selectOption('.am-basic select', 'hit'); await page.waitForTimeout(250);
      const f = await fx(); assert.strictEqual(f.sync, 'hit');
      const t = await page.evaluate(() => document.querySelector('.am-time').textContent);
      assert.ok(/게임 판정 0\.160초 \(첫 타격\)/.test(t), t);
      return t.trim();
    });
    await step('재생 · 멈춤 · 한 프레임 앞/뒤 · 처음으로 — 시각 표시 (60fps 프레임)', async () => {
      await page.evaluate(() => document.querySelector('.am-play').click()); await page.waitForTimeout(150);
      if (await page.evaluate(() => document.querySelector('.am-play').getAttribute('aria-label')) === '멈춤') await page.evaluate(() => document.querySelector('.am-play').click());
      await page.evaluate(() => document.querySelector('button[aria-label="처음으로"]').click()); await page.waitForTimeout(100);
      for (let i = 0; i < 3; i++) { await page.evaluate(() => document.querySelector('button[aria-label="한 프레임 앞"]').click()); await page.waitForTimeout(80); }
      let t = await page.evaluate(() => document.querySelector('.am-tlbl').textContent);
      assert.ok(/0\.050초 · 3f/.test(t), t);
      await page.evaluate(() => document.querySelector('button[aria-label="한 프레임 뒤"]').click()); await page.waitForTimeout(80);
      t = await page.evaluate(() => document.querySelector('.am-tlbl').textContent); assert.ok(/ 2f/.test(t), t);
      return t.trim();
    });
    await step('재생 고리: 재생 중 하나뿐(여러 번 다시 그려도 늘지 않음) · 다른 탭이면 쉼 · 탭을 닫으면 멈춤', async () => {
      await page.evaluate(() => document.querySelector('.am-play').click()); await page.waitForTimeout(200);
      const r1 = await rafRate(1000);
      for (let i = 0; i < 4; i++) { await page.evaluate(() => PDM.tabs.refresh('atkfx:item:sw_test')); await page.waitForTimeout(120); }
      await page.waitForTimeout(1300);   // 아이템 화면의 예전 미리보기(swing.js)는 떨어진 뒤 1초까지 돌 수 있음 — 그 뒤에 잼
      const r2 = await rafRate(1000);
      assert.ok(r1 > 20 && r2 < r1 * 1.5 + 5, `다시 그린 뒤 고리가 늘어남 ${r1.toFixed(0)} → ${r2.toFixed(0)}/초`);
      await page.evaluate(() => PDM.tabs.open('project')); await page.waitForTimeout(1300);
      const r3 = await rafRate(1000);
      await page.evaluate(() => PDM.tabs.open('atkfx:item:sw_test')); await page.waitForTimeout(300);
      const r4 = await rafRate(800);
      await page.evaluate(() => PDM.tabs.close ? PDM.tabs.close('atkfx:item:sw_test') : null); await page.waitForTimeout(400);
      const r5 = await rafRate(1000);
      assert.ok(r3 < 2, `다른 탭인데 고리가 돎 ${r3}`); assert.ok(r4 > 20, `돌아와도 다시 돌지 않음 ${r4}`);
      assert.ok(r5 < 2, `탭을 닫아도 고리가 돎 ${r5}`);
      return `재생 ${r1.toFixed(0)}/초 · 다시 그린 뒤 ${r2.toFixed(0)} · 다른 탭 ${r3.toFixed(0)} · 돌아옴 ${r4.toFixed(0)} · 닫음 ${r5.toFixed(0)}`;
    });
    await step('내 모션 저장(프로젝트 설정) → 저장 → 다시 열기: attackFx (tracks · hits · events · sync · 1판 keys) 그대로', async () => {
      await page.evaluate(() => PDM.tabs.open('atkfx:item:sw_test')); await page.waitForTimeout(300);
      page.once('dialog', d => d.accept());
      await btn('★ 내 모션으로 저장'); await page.waitForSelector('.modal'); await page.fill('.modal input', '시험 모션'); await modalBtn('확인'); await page.waitForTimeout(250);
      const pr = await page.evaluate(() => (PDM.store.get('project').atkMotionPresets || []).map(p => p.name)); assert.deepStrictEqual(pr, ['시험 모션']);
      const f = await fx();
      await page.keyboard.press('Control+s'); await page.waitForTimeout(500);
      const files = await page.evaluate(() => JSON.parse(localStorage.getItem('pdmaker_web_overlay_v1') || '{}'));
      for (const [p, t] of Object.entries(files)) if (p.startsWith(dir) && typeof t === 'string' && !t.startsWith('data:')) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t); }
      const c2 = env.load(); await c2.PDM.store.load(dir);
      const J = v => JSON.parse(JSON.stringify(v));
      assert.deepStrictEqual(J(c2.PDM.store.get('item:sw_test').attackFx), f);
      assert.strictEqual(J(c2.PDM.store.get('project').atkMotionPresets)[0].name, '시험 모션');
      return `트랙 ${Object.keys(f.tracks).join(',')} · 타격 ${f.hits.length} · 이펙트 ${f.events.length} · sync ${f.sync}`;
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
