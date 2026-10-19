#!/usr/bin/env node
// ================================================================
//  AI · 전투 편집기 UI 테스트 (8차 — 웹 모드 + Playwright · Chromium)
//    사용: NODE_PATH=$(npm root -g) node tools/tests/ui-combat.js [캡처 폴더]
//    캐릭터 화면의 "AI · 전투 편집기" → 빈 상태(원래 AI) → 근접형으로 시작 → 행동 고르기 · 우선순위 · 조건(AND/OR) · 공격 추가 · 복제(확인) · 삭제(확인)
//    → 없는 공격을 가리키면 검사 오류(게임은 원래 AI) · 실행 취소 → 시뮬레이터(체력 · 거리 · 사건 → 고른 행동 · 이유 = PDM.aiModel.decide) · 다음 차례(재사용 대기)
//    → 속성 찾기 · 키보드 · 좁은 창 → 저장 → 다시 열기 (combat 그대로 · 설정 없는 캐릭터 파일엔 combat 이 생기지 않음)
// ================================================================
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert'), { spawn } = require('child_process');
const env = require('./editor-env');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_) { console.log('playwright 를 찾지 못했습니다'); process.exit(2); }
const ROOT = path.join(__dirname, '..', '..');
const SHOTS = process.argv[2] ? path.resolve(process.argv[2]) : null;

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdm-cc-')), dir = path.join(tmp, 'proj');
  fs.mkdirSync(dir, { recursive: true });
  { const { PDM } = env.load(), S = PDM.store; await S.createNew(dir, 'ui-combat');
    S.add('char:cc_test', { id: 'cc_test', name: '시험 몬스터', kind: 'mob', desc: '', sprite: { sheet: 'game:sprites/rat.png', frame: [16, 15], anims: {} }, stats: { hp: 20, attackMin: 1, attackMax: 3 }, ai: { mode: 'hunt' }, behaviors: {} });
    S.add('char:cc_other', { id: 'cc_other', name: '그대로인 몬스터', kind: 'mob', desc: '', sprite: { sheet: 'game:sprites/rat.png', frame: [16, 15], anims: {} }, stats: { hp: 10 }, ai: { mode: 'hunt' }, behaviors: {} });
    await S.save(); }
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const port = 18100 + Math.floor(Math.random() * 800);
  const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', '/'], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  const results = []; let fail = 0;
  const step = async (name, fn) => { try { const r = await fn(); results.push(`✓ ${name}${r ? `\n    ${r}` : ''}`); } catch (e) { fail++; results.push(`✗ ${name}\n    ${String(e.message || e).split('\n').slice(0, 6).join('\n    ')}`); } };
  const url = `http://127.0.0.1:${port}${ROOT}/editor/renderer/index.html?project=${encodeURIComponent(dir)}`;
  const combat = () => page.evaluate(() => JSON.parse(JSON.stringify(PDM.store.get('char:cc_test').combat || null)));
  const btn = (text, scope = '.cc-page') => page.evaluate(([t, s]) => { const b = [...document.querySelectorAll(s + ' button')].find(e => e.textContent.trim().startsWith(t)); if (!b) throw new Error('버튼 없음: ' + t); b.click(); }, [text, scope]);
  const modalBtn = text => page.evaluate(t => { const ms = document.querySelectorAll('.modal'); const m = ms[ms.length - 1]; const b = [...m.querySelectorAll('.modal-foot button')].find(e => e.textContent.trim() === t); if (!b) throw new Error('창 버튼 없음: ' + t); b.click(); }, text);
  const li = (kind, name) => page.evaluate(([k, n]) => { const e = [...document.querySelectorAll(`.cc-li[data-kind="${k}"]`)].find(x => x.querySelector('.cc-li-name').textContent === n); if (!e) throw new Error('목록에 없음 ' + n); e.querySelector('.cc-li-name').click(); }, [kind, name]);
  const pick = () => page.evaluate(() => (document.querySelector('.cc-sim-pick') || {}).textContent || '');
  const fieldInput = label => page.evaluate(l => { const f = [...document.querySelectorAll('.cc-center .field')].find(e => (e.querySelector('.fl') || {}).textContent && e.querySelector('.fl').textContent.startsWith(l)); if (!f) throw new Error('칸 없음 ' + l); const i = f.querySelector('input,select'); i.setAttribute('data-test', '1'); return true; }, label);
  const setField = async (label, v) => { await page.evaluate(() => document.querySelectorAll('[data-test]').forEach(e => e.removeAttribute('data-test'))); await fieldInput(label); const tag = await page.evaluate(() => document.querySelector('[data-test]').tagName); if (tag === 'SELECT') await page.selectOption('[data-test]', v); else { await page.fill('[data-test]', String(v)); await page.press('[data-test]', 'Tab'); } await page.waitForTimeout(150); };
  const simSet = async (label, v) => { await page.evaluate(([l, v]) => { const f = [...document.querySelectorAll('.cc-sim-f')].find(e => e.querySelector('span').textContent === l); const i = f.querySelector('input'); i.value = v; i.dispatchEvent(new Event('change', { bubbles: true })); }, [label, v]); await page.waitForTimeout(100); };
  try {
    await page.goto(url);
    await page.waitForFunction(() => window.PDM && PDM.store && PDM.store.isOpen && PDM.tabs.active, null, { timeout: 30000 });
    await step('캐릭터 화면 → "AI · 전투 편집기" 로 별도 화면 · 설정 없음 = 원래 AI 안내 + 시작 틀', async () => {
      await page.evaluate(() => PDM.tabs.open('char:cc_test')); await page.waitForTimeout(400);
      const hint = await page.evaluate(() => [...document.querySelectorAll('.page .hint')].map(e => e.textContent).find(t => t.includes('전투 설정')) || '');
      assert.ok(hint.includes('원래 AI'), hint);
      await page.evaluate(() => [...document.querySelectorAll('.page button')].find(b => b.textContent.includes('AI · 전투 편집기')).click()); await page.waitForTimeout(400);
      assert.strictEqual(await page.evaluate(() => PDM.tabs.active), 'combat:cc_test');
      const t = await page.evaluate(() => document.querySelector('.cc-empty').textContent);
      assert.ok(t.includes('원래 AI') && t.includes('근접형'), t);
      return hint.trim();
    });
    await step('근접형으로 시작 → combat (version 1 · 행동 3 · 공격 1) · 시뮬레이터가 바로 판단', async () => {
      await btn('＋ 근접형'); await page.waitForTimeout(300);
      const c = await combat();
      assert.strictEqual(c.version, 1); assert.strictEqual(c.behaviors.length, 3); assert.strictEqual(c.attacks.length, 1);
      assert.ok((await pick()).includes('베기'), await pick());
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'combat-editor.png') });
      return await pick();
    });
    await step('행동 고르기 · 우선순위 · 조건 추가(AND 묶음으로) · 조건 종류/비교/값 — 데이터 · 시뮬레이터 결과', async () => {
      await li('b', '베기');
      await setField('우선순위', 70);
      assert.strictEqual((await combat()).behaviors[1].priority, 70);
      await page.evaluate(() => [...document.querySelectorAll('.cc-cond > .pal-row button')].find(b => b.textContent.includes('＋ 조건')).click()); await page.waitForTimeout(150);
      let w = (await combat()).behaviors[1].when; assert.deepStrictEqual(w, { k: 'dist', cmp: '<=', v: 1 });
      await page.evaluate(() => [...document.querySelectorAll('.cc-cond > .pal-row button')].find(b => b.textContent.includes('＋ OR 묶음')).click()); await page.waitForTimeout(150);
      w = (await combat()).behaviors[1].when; assert.strictEqual(w.op, 'and'); assert.strictEqual(w.items.length, 2); assert.strictEqual(w.items[1].op, 'or');
      await page.selectOption('.cc-cond .cc-cg .cc-cg .cc-c select[aria-label="조건 종류"]', 'hp'); await page.waitForTimeout(150);
      await page.selectOption('.cc-cond .cc-cg .cc-cg .cc-c select[aria-label="비교"]', '>='); await page.waitForTimeout(150);
      await page.fill('.cc-cond .cc-cg .cc-cg .cc-c input[aria-label="값"]', '50'); await page.press('.cc-cond .cc-cg .cc-cg .cc-c input[aria-label="값"]', 'Tab'); await page.waitForTimeout(150);
      w = (await combat()).behaviors[1].when;
      assert.deepStrictEqual(w.items[1], { op: 'or', items: [{ k: 'hp', cmp: '>=', v: 50 }] });
      return JSON.stringify(w);
    });
    await step('시뮬레이터: 거리 · 체력 · 사건을 바꾸면 고른 행동 · 이유가 바뀜 — 화면 결과 = PDM.aiModel.decide (게임과 같은 규칙)', async () => {
      assert.ok((await pick()).includes('베기'));
      await simSet('내 체력 %', 40);
      const p1 = await pick(); assert.ok(p1.includes('쫓기'), '체력 40 → 베기 조건(체력 ≥ 50) 불만족 · 도망(≤25) 아님 → 쫓기: ' + p1);
      await simSet('내 체력 %', 20); assert.ok((await pick()).includes('도망'));
      await simSet('내 체력 %', 90); await simSet('대상 거리', 3);
      const p3 = await pick(); assert.ok(p3.includes('쫓기'), p3);
      const why = await page.evaluate(() => [...document.querySelectorAll('.cc-trace tbody tr')].map(r => [...r.children].map(td => td.textContent).join('|')));
      assert.ok(why.some(r => r.startsWith('베기') && r.includes('조건 불만족')), why.join(' / '));
      const same = await page.evaluate(() => { const c = PDM.store.get('char:cc_test').combat; const r = PDM.aiModel.decide(c, { turn: 0, self: { hp: 90, ht: 100 }, targets: { enemy: { hp: 100, ht: 100, dist: 3, visible: true, line: true } }, enemies: 1, rolls: [0.5] }); return r.id; });
      assert.strictEqual(same, 'chase');
      return `체력 40 → ${p1.slice(0, 20)} · 거리 3 → ${p3.slice(0, 20)} · 이유 ${why.length}줄`;
    });
    await step('다음 차례: 재사용 대기 · 턴이 런타임 규칙대로 (도망 행동에 재사용 대기 5 → 다음 차례엔 고르지 않음)', async () => {
      await li('b', '도망'); await setField('재사용 대기', 5);
      await simSet('대상 거리', 1); await simSet('내 체력 %', 20);
      assert.ok((await pick()).includes('도망'));
      await btn('▶ 다음 차례', '.cc-right'); await page.waitForTimeout(150);
      const cd = await page.evaluate(() => document.querySelector('.cc-sim-cd').textContent);
      assert.ok(/행동 flee → 5턴까지/.test(cd), cd);
      const p = await pick(); assert.ok(!p.includes('도망'), '재사용 대기 중인데 도망 ' + p);
      const trace = await page.evaluate(() => [...document.querySelectorAll('.cc-trace tbody tr')].map(r => r.textContent).join(' / '));
      assert.ok(trace.includes('재사용 대기 중'), trace);
      return `${cd} · 다음 ${p.slice(0, 24)}`;
    });
    await step('공격 추가 · 행동 복제(확인 창) · 삭제(확인 창, 쓰는 행동 알림) → 검사 오류(게임은 원래 AI) → 실행 취소', async () => {
      await btn('＋ 추가', '.cc-list:nth-of-type(2)'); await page.waitForTimeout(150);
      assert.strictEqual((await combat()).attacks.length, 2);
      await page.evaluate(() => { const e = [...document.querySelectorAll('.cc-li[data-kind="b"]')].find(x => x.querySelector('.cc-li-name').textContent === '쫓기'); e.querySelector('button[aria-label="복제"]').click(); });
      await page.waitForSelector('.modal'); await modalBtn('확인'); await page.waitForTimeout(200);
      const c1 = await combat(); assert.strictEqual(c1.behaviors.length, 4); assert.strictEqual(c1.behaviors[3].id, 'chase_copy');
      await page.evaluate(() => { const e = [...document.querySelectorAll('.cc-li[data-kind="a"]')].find(x => x.querySelector('.cc-li-name').textContent === '베기'); e.querySelector('button[aria-label="삭제"]').click(); });
      await page.waitForSelector('.modal'); const msg = await page.evaluate(() => document.querySelector('.modal .modal-body').textContent);
      assert.ok(msg.includes('이것을 쓰는 행동: 베기'), msg);
      await modalBtn('진행'); await page.waitForTimeout(250);
      const badge = await page.evaluate(() => document.querySelector('.cc-status .badge').textContent);
      assert.ok(/오류 \d+ — 게임은 원래 AI/.test(badge), badge);
      const iss = await page.evaluate(() => [...document.querySelectorAll('.cc-issue.error')].map(e => e.textContent));
      assert.ok(iss.some(t => t.includes('없는 공격 "slash"')), iss.join(' / '));
      const v = await page.evaluate(() => PDM.validate().filter(r => r.open === 'combat:cc_test' && r.level === 'error').length);
      assert.ok(v >= 1, '전체 검사(F7)에도 나와야');
      await page.keyboard.press('Control+z'); await page.waitForTimeout(250);
      assert.strictEqual((await combat()).attacks.length, 2, '실행 취소 → 공격 복구');
      assert.ok(!/오류/.test(await page.evaluate(() => document.querySelector('.cc-status .badge').textContent)));
      return `${badge} → 실행 취소 · 전체 검사 오류 ${v}`;
    });
    await step('속성 찾기 · 접는 묶음 · 키보드(목록 Enter) · 단위/범위/기본값 표시', async () => {
      await li('a', '베기');
      await page.fill('.cc-q', '밀치기'); await page.waitForTimeout(100);
      const vis = await page.evaluate(() => [...document.querySelectorAll('.cc-center .cc-f')].filter(f => f.style.display !== 'none').map(f => f.dataset.q.split(' ')[0]));
      assert.deepStrictEqual(vis, ['밀치기']);
      await page.fill('.cc-q', ''); await page.waitForTimeout(100);
      const lbl = await page.evaluate(() => [...document.querySelectorAll('.cc-center .fl')].map(e => e.textContent).find(t => t.startsWith('준비')));
      assert.ok(/턴, 0~10, 기본 0/.test(lbl), lbl);
      await page.focus('.cc-li[data-kind="b"][data-i="0"]'); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
      assert.ok(await page.evaluate(() => document.querySelector('.cc-li[data-kind="b"][data-i="0"]').classList.contains('on')));
      await page.evaluate(() => document.querySelector('.cc-sec > summary').click()); await page.waitForTimeout(100);
      assert.ok(await page.evaluate(() => !document.querySelector('.cc-sec').open), '접힘');
      return lbl;
    });
    await step('좁은 창(760×800): 가로로 넘치지 않음 · 세 칸이 한 줄로 쌓임', async () => {
      await page.setViewportSize({ width: 760, height: 800 }); await page.waitForTimeout(300);
      const o = await page.evaluate(() => { const p = document.querySelector('.cc-page'); return [p.scrollWidth, p.clientWidth, getComputedStyle(document.querySelector('.cc-cols')).gridTemplateColumns.split(' ').length]; });
      assert.ok(o[0] <= o[1] + 2, '가로 넘침 ' + o);
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'combat-editor-narrow.png'), fullPage: false });
      await page.setViewportSize({ width: 1500, height: 950 }); await page.waitForTimeout(200);
      return `scrollWidth ${o[0]} ≤ ${o[1]} · 열 ${o[2]}`;
    });
    await step('저장 → 다시 열기: combat 그대로 · 설정하지 않은 캐릭터 파일에는 combat 이 생기지 않음', async () => {
      const before = await combat();
      await page.keyboard.press('Control+s'); await page.waitForTimeout(500);
      const files = await page.evaluate(() => JSON.parse(localStorage.getItem('pdmaker_web_overlay_v1') || '{}'));
      for (const [p, t] of Object.entries(files)) if (p.startsWith(dir) && typeof t === 'string' && !t.startsWith('data:')) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t); }
      const c2 = env.load(); await c2.PDM.store.load(dir);
      const J = v => JSON.parse(JSON.stringify(v));
      assert.deepStrictEqual(J(c2.PDM.store.get('char:cc_test').combat), before);
      assert.strictEqual(c2.PDM.store.get('char:cc_other').combat, undefined);
      assert.ok(!Object.keys(files).some(p => p.endsWith('cc_other.json')), '설정하지 않은 캐릭터 파일을 다시 쓰지 않음');
      return `행동 ${before.behaviors.length} · 공격 ${before.attacks.length}`;
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
