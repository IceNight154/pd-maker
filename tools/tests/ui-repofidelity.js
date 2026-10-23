#!/usr/bin/env node
// ================================================================
//  10차 — 저장소 기준 데이터가 편집 화면에 그대로 나오는지 (웹 모드 + Playwright · Chromium, 실제 마우스 · 키보드)
//    사용: NODE_PATH=$(npm root -g) node tools/tests/ui-repofidelity.js [--game <game 폴더>] [--shots <저장 폴더>]
//    분석 결과는 이 자리에서 분석기로 만들어 웹 모드의 pdm.analyzeRepo 에 넣음 (Electron 의 repo:analyze 와 같은 모듈)
//    ① 맞추기 창 → 영웅 이름 · 출처 상자 ② 캐릭터 종류(보스 · 엘리트) · 분류 근거 ③ 게임 저장소의 맵 → 가져오기 → 맵 그래프 · 편집 화면
//    ④ 배지 화면 (항목 수 · 시트 칸) ⑤ 타이틀 미리보기 = TitleScene 의 setRect 식 (좌표 비교 · 밝음/어두움 · 가로/세로) ⑥ 저장소 바꾸면 화면도 바뀜
// ================================================================
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert'), { spawn } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_) { console.log('playwright 를 찾지 못했습니다 — NODE_PATH=$(npm root -g) node tools/tests/ui-repofidelity.js'); process.exit(2); }
const env = require('./editor-env');
const ROOT = path.join(__dirname, '..', '..');
const A = require(path.join(ROOT, 'editor', 'repo-analyzer.js'));
const args = process.argv.slice(2), opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const GAME = path.resolve(opt('--game') || path.join(ROOT, 'game')), SHOTS = opt('--shots') ? path.resolve(opt('--shots')) : null;
const ARK = path.join(GAME, 'ARK_PD-main'), BASE = path.join(GAME, 'shattered-pixel-dungeon-master');

(async () => {
  const results = []; let fail = 0;
  const check = async (name, fn) => { try { const r = await fn(); results.push(`✓ ${name}${r ? '\n    ' + r : ''}`); } catch (e) { fail++; results.push(`✗ ${name}\n    ${String(e && e.message || e).split('\n').slice(0, 6).join('\n    ')}`); } };
  if (!fs.existsSync(ARK) || !fs.existsSync(BASE)) { console.log(`실행하지 못함 — 필요한 저장소: ${ARK} · ${BASE}`); console.log('\n0 통과 · 1 실패'); process.exit(1); }
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const REP = { [ARK]: A.analyze(ARK), [BASE]: A.analyze(BASE) };
  // 새 프로젝트 (원작 묶음) — 게임 저장소 = ARK (절대 경로)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdm-uirf-')), dir = path.join(tmp, 'proj'); fs.mkdirSync(dir);
  { const ctx = env.load(); await ctx.PDM.store.createNew(dir, 'ark-ui'); ctx.PDM.store.edit('project', '저장소', p => { p.gameRepo = ARK; p.gameRepoPinned = true; }); await ctx.PDM.store.save(); }
  const port = 19800 + Math.floor(Math.random() * 90);
  const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', '/'], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch();
  const open = async (scheme, vw = 1500, vh = 950) => {
    const page = await browser.newPage({ viewport: { width: vw, height: vh }, colorScheme: scheme });
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.addInitScript(R => {   // 웹 모드 bridge 가 window.pdm 을 만들 때 분석기를 끼움
      let v; Object.defineProperty(window, 'pdm', { configurable: true, get: () => v, set: x => { v = x; if (x) x.analyzeRepo = async d => { const k = Object.keys(R).find(q => q.replace(/[\\/]+$/, '') === String(d).replace(/[\\/]+$/, '')); if (!k) throw new Error('분석 결과 없음 ' + d); return JSON.parse(JSON.stringify(R[k])); }; } });
    }, REP);
    await page.goto(`http://127.0.0.1:${port}${ROOT}/editor/renderer/index.html?project=${encodeURIComponent(dir)}`);
    await page.waitForFunction(() => window.PDM && PDM.store && PDM.store.isOpen && PDM.tabs.active && PDM.REPO_ANALYSIS, null, { timeout: 60000 });
    await page.waitForTimeout(600);
    return { page, errors };
  };
  const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };
  const treeHas = (page, text) => page.evaluate(t => [...document.querySelectorAll('.tree .row, .tree-row, .tr-row, [data-id]')].some(e => e.textContent.includes(t)) || document.body.innerText.includes(t), text);

  try {
    const { page, errors } = await open('light');
    await check('① 프로젝트 설정 › "영웅·캐릭터를 저장소에 맞추기" → 확인 창 → 맞추기 → 영웅 이름 · 출처 상자', async () => {
      await page.evaluate(() => PDM.tabs.open('project')); await page.waitForTimeout(400);
      await page.getByRole('button', { name: '영웅·캐릭터를 저장소에 맞추기' }).click();
      const modal = page.locator('.modal').last(); await modal.waitFor({ timeout: 20000 });
      const mt = await modal.innerText(); assert.ok(/RogueNights/.test(mt) && /저장소에 없는 항목/.test(mt), mt.slice(0, 300));
      await shot(page, 'rf-sync-dialog');
      await modal.locator('button.btn.pri', { hasText: '맞추기' }).click(); await page.waitForTimeout(500);
      const names = await page.evaluate(() => PDM.store.all('hero').filter(h => h.baseClass).map(h => h.baseClass + '=' + h.name));
      for (const x of ['WARRIOR=블레이즈', 'MAGE=아미야', 'ROGUE=레드', 'HUNTRESS=그레이스롯', 'ROSECAT=로즈몬티스', 'NEARL=니어', 'CHEN=첸']) assert.ok(names.includes(x), x + ' / ' + names.join(', '));
      assert.ok(await treeHas(page, '블레이즈'), '리소스 목록에 블레이즈');
      await page.evaluate(() => PDM.tabs.open('hero:warrior')); await page.waitForTimeout(500);
      const ht = await page.evaluate(() => document.querySelector('.page').innerText);
      assert.ok(/블레이즈/.test(ht) && /데이터 출처/.test(ht), ht.slice(0, 300));
      await page.locator('.prov-box summary').first().click(); await page.waitForTimeout(150);
      const pt = await page.locator('.prov-box').first().innerText(); assert.ok(/저장소 원본/.test(pt) && /actors\.hero\.heroclass\.warrior/.test(pt), pt.slice(0, 400));
      await shot(page, 'rf-hero-blaze');
      return names.join(' · ');
    });
    await check('② 캐릭터: 보스 · 엘리트 · 분류 확인 묶음 · 보스 화면의 분류 근거 · 종류를 바꾸면 사용자 지정으로 표시', async () => {
      const kinds = await page.evaluate(() => { const o = {}; PDM.store.all('char').forEach(c => { o[c.kind] = (o[c.kind] || 0) + 1; }); return o; });
      assert.ok(kinds.boss >= 20 && kinds.elite >= 10, JSON.stringify(kinds));
      const id = await page.evaluate(() => PDM.store.all('char').find(c => c.game === 'Pompeii').id);
      await page.evaluate(k => PDM.tabs.open('char:' + k), id); await page.waitForTimeout(500);
      await page.locator('.prov-box summary').first().click(); await page.waitForTimeout(150);
      let t = await page.locator('.prov-box').first().innerText(); assert.ok(/자동 = 보스/.test(t) && /boss-property/.test(t), t.slice(0, 400));
      await shot(page, 'rf-char-boss');
      const sel = page.locator('select').filter({ has: page.locator('option[value="elite"]') }).first(); await sel.selectOption('elite'); await page.waitForTimeout(400);
      await page.locator('.prov-box summary').first().click().catch(() => { }); await page.waitForTimeout(150);
      t = await page.locator('.prov-box').first().innerText(); assert.ok(/사용자 지정 = 엘리트/.test(t), t.slice(0, 400));
      return JSON.stringify(kinds);
    });
    await check('③ 게임 저장소의 맵: 프로젝트를 열면 가져오기 없이 맵 그래프에 (11차) · 자세히(유형) · 직접 그리기 노드는 맵 편집기 · 게임 원래 맵은 정보 화면(근거)', async () => {
      const items = await page.evaluate(() => PDM.repoMaps.list().length); assert.ok(items >= 27);
      const shown = await page.evaluate(() => { const L = PDM.repoMaps.list().filter(s => s.extra); return { n: L.flatMap(s => s.ids).length, ok: L.every(s => s.ids.every(id => PDM.store.has('node:' + id))) }; });
      assert.ok(shown.ok && shown.n >= 30, '열자마자 원작에 없는 맵이 모두 그래프에: ' + JSON.stringify(shown));
      await page.evaluate(() => { PDM.repoMaps.details(PDM.repoMaps.list().find(s => s.cls === 'NewRhodesLevel1')); });   // 창이 닫힐 때까지 기다리지 않음
      const modal = page.locator('.modal').last(); await modal.waitFor(); const mt = await modal.innerText();
      assert.ok(/고정 맵 \(모든 칸 확정\)/.test(mt) && /35×26/.test(mt) && /맵 유형/.test(mt) && /고정/.test(mt) && !/가져오기/.test(mt), mt.slice(0, 400)); await shot(page, 'rf-map-details');
      await modal.locator('button', { hasText: '닫기' }).click(); await page.waitForTimeout(300);
      await page.evaluate(() => PDM.tabs.open('world')); await page.waitForTimeout(800);
      const cards = await page.evaluate(() => [...document.querySelectorAll('.wg-node')].filter(e => /원본 /.test(e.innerText)).length); assert.ok(cards >= 30, '그래프 카드 ' + cards);
      await page.evaluate(() => { const b = document.querySelector('.wg-vp'); if (b) b.focus(); }); await shot(page, 'rf-map-graph');
      await page.evaluate(() => PDM.tabs.open('node:g_new_rhodes_level1_d0_b1')); await page.waitForTimeout(700);
      assert.ok(await page.evaluate(() => !!document.querySelector('.page canvas')), '직접 그리기 노드 = 맵 편집기 (캔버스)'); await shot(page, 'rf-map-rhodes');
      await page.evaluate(() => PDM.tabs.open('node:g_gavial_level_d31')); await page.waitForTimeout(500);
      const gt = await page.evaluate(() => document.querySelector('.page').innerText); assert.ok(/게임 원래 맵/.test(gt) && /GavialLevel/.test(gt) && /extrastage_Gavial/.test(gt) && /근거 · Dungeon\.newLevel\(\)/.test(gt) && /조건부/.test(gt), gt.slice(0, 300)); await shot(page, 'rf-map-gamenode');
      return `저장소 맵 ${items} · 그래프 카드 ${cards}`;
    });
    await check('④ 배지: 항목 178 · 시트 16px · 한 줄 16칸 · 이름 글자 · 그림 없는 배지도 줄', async () => {
      await page.evaluate(() => PDM.tabs.open('badges')); await page.waitForFunction(() => /\/ 178개/.test(document.querySelector('.page').innerText), null, { timeout: 30000 });
      const t = await page.evaluate(() => document.querySelector('.page').innerText);
      const ph = await page.evaluate(() => [...document.querySelectorAll('.page input')].map(i => i.placeholder));   // 원래 이름은 입력 칸의 흐린 글(placeholder)로 보임
      assert.ok(/178 \/ 178개/.test(t) && ph.includes('리유니온 10명 처치') && /그림 없음/.test(t) && /이 저장소는 배지 설명 글 키를 쓰지 않음/.test(t), t.slice(0, 600)); await shot(page, 'rf-badges');
      return (/저장소 원본 \d+ · 이름 글자 있음 \d+ · 그림 있음 \d+ · 얻는 조건을 Badges.java 에서 찾음 \d+/.exec(t) || [''])[0];
    });
    // 타이틀: 원본 setRect 식으로 계산한 자리 ↔ 미리보기 geo
    const arkTitle = (W, H, land) => {   // ARK TitleScene.create (insets 0)
      const lr = land ? [89, 54] : [89, 54], topRegion = Math.max(lr[1] - 6, H * 0.45);
      const logo = [(W - lr[0]) / 2, 2 + (topRegion - lr[1]) / 2, lr[0], lr[1]];
      let GAP = Math.trunc(Math.trunc(H - topRegion - (land ? 3 : 4) * 20) / 3); GAP = Math.trunc(GAP / (land ? 3 : 5)); GAP = Math.max(GAP, 2);
      const aw = land ? 240 - 6 : 135 - 2, left = (W - aw) / 2, top = topRegion + GAP, B = {};
      if (land) { const w1 = aw / 2 - 1, w3 = Math.floor(aw / 3) - 1, y2 = top + 20 + GAP, y3 = y2 + 20 + GAP;
        B.play = [left, top, w1]; B.support = [left + w1 + 2, top, w1]; B.rankings = [left, y2, w3]; B.badges = [left + w3 + 2, y2, w3]; B.news = [left + 2 * (w3 + 2), y2, w3]; B.settings = [left, y3, w3]; B.changes = [left + w3 + 2, y3, w3]; B.about = [left + 2 * (w3 + 2), y3, w3]; }
      else { const w2 = aw / 2 - 1; let y = top; B.play = [left, y, aw]; y += 20 + GAP; B.support = [left, y, aw]; y += 20 + GAP; B.rankings = [left, y, w2]; B.badges = [left + w2 + 2, y, w2]; y += 20 + GAP; B.news = [left, y, w2]; B.changes = [left + w2 + 2, y, w2]; y += 20 + GAP; B.settings = [left, y, w2]; B.about = [left + w2 + 2, y, w2]; }
      return { logo, B };
    };
    for (const [scheme, scr] of [['light', 'pc'], ['dark', 'phone-port'], ['light', 'phone-land']]) {
      await check(`⑤ 타이틀 미리보기 (${scheme} · ${scr}): 버튼 · 로고 자리 = ARK TitleScene setRect 식 (0.5px 안) · 글 · 원래 구조 상자`, async () => {
        const p = scheme === 'light' ? page : (await open('dark')).page;
        await p.evaluate(s => { PDM.store.edit('project', '화면', o => { o.testplay = Object.assign({}, o.testplay || {}, { env: s }); }); PDM.tabs.open('title'); }, scr);
        await p.waitForFunction(() => PDM.tabs.active === 'title' && document.querySelector('.tp-canvas') && PDM.titleEditor.geo(), null, { timeout: 15000 }); await p.waitForTimeout(900);
        const g = await p.evaluate(() => JSON.parse(JSON.stringify(PDM.titleEditor.geo())));
        const want = arkTitle(g.W, g.H, g.land), bad = [];
        assert.deepStrictEqual(g.buttons.map(b => b.id).sort(), Object.keys(want.B).sort(), '버튼 구성 (일지 대신 배지)');
        for (const b of g.buttons) { const w = want.B[b.id], d = [Math.abs(b.base[0] - w[0]), Math.abs(b.base[1] - w[1]), Math.abs(b.base[2] - w[2])]; if (Math.max(...d) > 0.5) bad.push(`${b.id} 미리보기 ${b.base.slice(0, 3).map(n => n.toFixed(2))} · 원본 ${w.map(n => n.toFixed(2))}`); }
        const ld = want.logo.map((v, i) => Math.abs(v - g.logo[i])); if (Math.max(...ld) > 0.5) bad.push(`로고 ${g.logo.map(n => n.toFixed(1))} · 원본 ${want.logo.map(n => n.toFixed(1))}`);
        assert.deepStrictEqual(bad, [], bad.join('\n'));
        const lab = g.buttons.find(b => b.id === 'play').label; assert.strictEqual(lab, '작전 개시');
        const pt = await p.evaluate(() => document.querySelector('.title-page').innerText); assert.ok(/원래 타이틀 구조/.test(pt) && /원작과 다름/.test(pt), pt.slice(0, 200));
        await shot(p, `rf-title-${scheme}-${scr}`);
        return `${g.W}×${g.H} ${g.land ? '가로' : '세로'} · 버튼 ${g.buttons.length} · 최대 오차 ${Math.max(...g.buttons.map(b => { const w = want.B[b.id]; return Math.max(Math.abs(b.base[0] - w[0]), Math.abs(b.base[1] - w[1]), Math.abs(b.base[2] - w[2])); })).toFixed(3)}px`;
      });
    }
    await check('⑦ 게임 저장소 탐색 (11차): 파일 검색 → 그림 미리보기 · 클래스 상속 · 게임 데이터(원본/추론 · 편집 가능) → 편집기 · 번역 검색 · 읽기 전용', async () => {
      await page.evaluate(() => PDM.tabs.open('repoexplorer')); await page.waitForTimeout(500);
      let t = await page.evaluate(() => document.querySelector('.page').innerText); assert.ok(/게임 저장소 탐색/.test(t) && /읽기 전용/.test(t) && /클래스 2\d{3}/.test(t), t.slice(0, 300));
      const search = async q => { await page.locator('.rx-search').fill(q); await page.waitForTimeout(500); };
      await search('sprites/blaze'); await page.locator('.rx-row', { hasText: 'blaze.png' }).first().click();
      await page.waitForFunction(() => { const i = document.querySelector('.rx-img img'); return i && i.naturalWidth > 0; }, null, { timeout: 15000 });
      const img = await page.evaluate(() => { const i = document.querySelector('.rx-img img'); return [i.naturalWidth, i.naturalHeight]; }); assert.deepStrictEqual(img, [1800, 288]);
      t = await page.evaluate(() => document.querySelector('.rx-right').innerText); assert.ok(/쓰는 곳: 영웅 블레이즈 시트/.test(t), t.slice(0, 300)); await shot(page, 'rx-file-image');
      await page.locator('.rx-tabs button', { hasText: '클래스' }).click(); await page.waitForTimeout(300); await search('HeroSprite');
      await page.locator('.rx-row').filter({ hasText: /^C HeroSprite/ }).first().click(); await page.waitForFunction(() => document.querySelector('.rx-right .code-view .mark'), null, { timeout: 15000 });
      t = await page.evaluate(() => document.querySelector('.rx-right').innerText); assert.ok(/CharSprite/.test(t) && /MovieClip/.test(t) && /updateArmor/.test(t), t.slice(0, 400)); await shot(page, 'rx-class');
      await page.locator('.rx-tabs button', { hasText: '게임 데이터' }).click(); await page.waitForTimeout(300);
      await page.locator('.rx-filters button', { hasText: '영웅' }).click(); await page.waitForTimeout(300);
      const rows = await page.evaluate(() => [...document.querySelectorAll('.rx-left .rx-row')].map(e => e.innerText)); assert.ok(rows.length === 7 && rows.every(r => /원본/.test(r)), rows.join(' / '));
      await page.locator('.rx-row', { hasText: 'WARRIOR' }).click(); await page.waitForTimeout(300);
      t = await page.evaluate(() => document.querySelector('.rx-right').innerText); assert.ok(/36×34 · 36/.test(t) && /Icons\.BLAZE/.test(t) && /프로젝트 값의 출처/.test(t), t.slice(0, 500)); await shot(page, 'rx-data-hero');
      await page.locator('.rx-right button', { hasText: '영웅 편집기' }).click(); await page.waitForTimeout(400);
      assert.strictEqual(await page.evaluate(() => PDM.tabs.active), 'hero:warrior', '편집기 바로가기');
      await page.evaluate(() => PDM.tabs.open('repoexplorer')); await page.waitForTimeout(300);
      await page.locator('.rx-filters button', { hasText: '맵' }).first().click(); await page.waitForTimeout(300);
      t = await page.evaluate(() => document.querySelector('.rx-left').innerText); assert.ok(/그래프에 있음/.test(t) && /기본 층 노드가 대신/.test(t) && /조건부/.test(t), t.slice(0, 300));
      await page.locator('.rx-tabs button', { hasText: '번역' }).click(); await page.waitForTimeout(300); await search('heroclass.warrior');
      await page.waitForFunction(() => /actors\.hero\.heroclass\.warrior/.test(document.querySelector('.rx-left').innerText), null, { timeout: 20000 });
      t = await page.evaluate(() => document.querySelector('.rx-left').innerText); assert.ok(/블레이즈/.test(t), t.slice(0, 300)); await shot(page, 'rx-texts');
      // 탐색은 원본 저장소를 고치지 않음 (읽기만) — 이 화면에 저장 · 쓰기 동작이 없음
      assert.ok(!(await page.evaluate(() => [...document.querySelectorAll('.page button')].some(b => /저장소 파일 (저장|수정|삭제)/.test(b.textContent)))));
      return `그림 ${img.join('×')} · 영웅 ${rows.length}`;
    });
    await check('⑥ 저장소 바꾸기 (ARK → 기준): 타이틀 · 배지 · 바탕 직업 이름 · 맵 목록이 기준 저장소 것 · ARK 맵 노드는 "다른 저장소" 표시', async () => {
      await page.evaluate(async b => { PDM.store.edit('project', '게임 저장소 경로', p => { p.gameRepo = b; }); await PDM.app.resolveRepo(true); }, BASE); await page.waitForTimeout(600);   // app.setRepo 와 같은 길 (확인 창 빼고)
      const r = await page.evaluate(() => ({ prof: PDM.REPO_ANALYSIS.profile.label, warrior: PDM.heroClassName('WARRIOR'), extra: PDM.repoMaps.list().filter(s => s.extra).length, title: !!PDM.titleRepo() }));
      assert.deepStrictEqual([r.warrior, r.extra, r.title], ['전사', 0, false], JSON.stringify(r));
      await page.evaluate(() => { PDM.tabs.open('node:g_gavial_level_d31'); PDM.tabs.refresh('node:g_gavial_level_d31'); }); await page.waitForTimeout(400);   // 앱은 저장소를 다시 읽으면 열린 탭을 다시 그림 (resolveRepo)
      const gt = await page.evaluate(() => document.querySelector('.page').innerText); assert.ok(/다른 게임 저장소/.test(gt), gt.slice(0, 300));
      await page.evaluate(() => { PDM.tabs.open('badges'); PDM.tabs.refresh('badges'); }); await page.waitForFunction(() => /\/ 133개/.test(document.querySelector('.page').innerText) && /한 줄 8칸/.test(document.querySelector('.page').innerText), null, { timeout: 30000 });
      return JSON.stringify(r);
    });
    await check('페이지 오류 없음', async () => { assert.deepStrictEqual(errors, []); });
  } finally { await browser.close(); srv.kill(); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* 무시 */ } }
  console.log(results.join('\n'));
  console.log(`\n${results.length - fail} 통과 · ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})();
