#!/usr/bin/env node
// ================================================================
//  12차 — "다른 저장소 기능 가져오기" 화면 테스트 (웹 모드 + Playwright · Chromium, 실제 마우스 · 키보드)
//    사용: NODE_PATH=$(npm root -g) node tools/tests/ui-features.js [--shots <저장 폴더>]
//    웹 모드에는 main 프로세스가 없으므로 pdm.feature* 를 이 Node 의 repo-features.js 로 이어 줌 (화면 코드는 그대로)
//    확인: 저장소 고르기 → 비교 → 새 패키지 탭 · 찾기 → 총기 패키지 체크 → 함께 들어갈 것(클래스 · 멤버 · 번역) →
//          가져오기 → 프로젝트 features/ 에 꾸러미 · 목록에 보임 → 끄기(feature.json enabled=false) → 지우기 ·
//          바뀐 멤버 탭 · ARK 계단(Hero.handle) 미리보기에 "바꾸는 멤버" · 웹 모드 안내 · 가로 넘침 없음 · 밝음/어두움 · 페이지 오류 없음
//    game/ 의 저장소(SPD · BA · ARK)가 없으면 그 검사는 "실행하지 못함"으로 표시하고 실패로 셈
// ================================================================
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert'), { spawn } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_) { console.log('playwright 를 찾지 못했습니다 — NODE_PATH=$(npm root -g) node tools/tests/ui-features.js'); process.exit(2); }
const { makeProject } = require('./ui-shots');
const ROOT = path.join(__dirname, '..', '..');
const F = require(path.join(ROOT, 'editor', 'repo-features.js'));
const args = process.argv.slice(2), opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const SHOTS = opt('--shots') ? path.resolve(opt('--shots')) : null;
const G = n => path.join(ROOT, 'game', n);
const BASE = G('shattered-pixel-dungeon-master'), BA = G('New-Blue-Archive-Pixel-Dungeon-main'), ARK = G('ARK_PD-main');

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdm-ft-')), dir = path.join(tmp, 'proj'); fs.mkdirSync(dir);
  await makeProject(dir);
  const port = 19800 + Math.floor(Math.random() * 90);
  const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', '/'], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch();
  const results = []; let fail = 0;
  const check = async (name, fn) => { try { const r = await fn(); results.push(`✓ ${name}${r ? '\n    ' + r : ''}`); } catch (e) { fail++; results.push(`✗ ${name}\n    ${String(e && e.message || e).split('\n').slice(0, 6).join('\n    ')}`); } };
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const have = [BASE, BA, ARK].every(d => fs.existsSync(d));

  async function open(scheme, vw = 1400, vh = 900, wire = true) {
    const page = await browser.newPage({ viewport: { width: vw, height: vh }, colorScheme: scheme });
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    page.on('dialog', d => d.dismiss());
    if (wire) await page.exposeFunction('__feat', async (m, a) => {
      // main.js 의 features:* 와 같은 일 (repo-features.js)
      if (m === 'repos') return [{ dir: BA, label: 'Blue Archive', name: path.basename(BA) }, { dir: ARK, label: 'Rogue Nights', name: path.basename(ARK) }];
      if (m === 'catalog') return F.catalog(a.source, a.target);
      if (m === 'closure') return F.closure(a.source, a.target, a.ids);
      if (m === 'import') { const p = F.pack(a.source, a.target, a.ids, { label: a.label }); const d = F.savePack(a.project, p); const f = p.feature; return { id: f.id, label: f.label, classes: f.classes.length, members: f.members.length, replaced: f.replaced, conflicts: f.conflicts, missing: f.missing, dir: d }; }
      if (m === 'list') return F.listPacks(a.project).map(f => ({ id: f.id, label: f.label, enabled: f.enabled !== false, source: f.source, created: f.created, classes: f.classes.length, members: f.members.length, assets: f.assets.length, messages: f.messages.length, replaced: f.replaced || [], conflicts: f.conflicts || [], lines: f.lines }));
      if (m === 'set') { const f = F.listPacks(a.project).find(x => x.id === a.id); if (a.remove) { fs.rmSync(f.dir, { recursive: true }); return true; } const j = path.join(f.dir, 'feature.json'), o = JSON.parse(fs.readFileSync(j, 'utf8')); o.enabled = !!a.enabled; fs.writeFileSync(j, JSON.stringify(o, null, 2)); return true; }
      throw new Error('알 수 없는 호출 ' + m);
    });
    await page.goto(`http://127.0.0.1:${port}${ROOT}/editor/renderer/index.html?project=${encodeURIComponent(dir)}`);
    await page.waitForFunction(() => window.PDM && PDM.store && PDM.store.isOpen && PDM.tabs.active, null, { timeout: 30000 });
    if (wire) await page.evaluate(([base, pdir]) => {
      pdm.featureRepos = () => window.__feat('repos', {});
      pdm.featureCatalog = (source, target) => window.__feat('catalog', { source, target });
      pdm.featureClosure = (source, target, ids) => window.__feat('closure', { source, target, ids });
      pdm.featureImport = o => window.__feat('import', o);
      pdm.featureList = project => window.__feat('list', { project });
      pdm.featureSet = (project, id, o) => window.__feat('set', Object.assign({ project, id }, o));
      pdm.confirm = async () => true;
      PDM.app.resolveRepo = async () => base;
      PDM.store.root = pdir;
    }, [BASE, dir]);
    await page.waitForTimeout(300);
    return { page, errors };
  }
  const text = page => page.evaluate(() => (document.querySelector('.page.ft-page') || document.body).innerText);
  const noOverflow = page => page.evaluate(() => { const p = document.querySelector('.page.ft-page'); return { page: p.scrollWidth - p.clientWidth, doc: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
  const waitText = (page, re, ms = 120000) => page.waitForFunction(r => new RegExp(r).test((document.querySelector('.page.ft-page') || document.body).innerText), re.source, { timeout: ms });

  try {
    await check('웹 모드(비교기 없음): 화면이 열리고 "Electron 편집기에서 여세요" 안내 — 오류로 멈추지 않음', async () => {
      const { page, errors } = await open('light', 1400, 900, false);
      await page.evaluate(() => PDM.tabs.open('features')); await page.waitForTimeout(400);
      const t = await text(page); assert.ok(/웹 모드/.test(t) && /Electron/.test(t), t.slice(0, 200));
      assert.deepStrictEqual(errors, []); await page.close();
    });
    if (!have) { await check('실제 저장소 화면 검사', async () => { throw new Error('실행하지 못함 — game/ 에 SPD · BA · ARK 저장소가 필요'); }); }
    else for (const scheme of ['light', 'dark']) {
      await check(`BA 총기 가져오기 (${scheme}): 고르기 · 비교 · 찾기 · 체크 · 함께 들어갈 것 · 가져오기 · 끄기 · 지우기`, async () => {
        const { page, errors } = await open(scheme);
        await page.evaluate(() => PDM.tabs.open('features')); await waitText(page, /이 프로젝트에 가져온 기능 \(0\)/);
        await page.locator('select.ft-src').selectOption(BA);
        await page.getByRole('button', { name: '비교' }).click();
        await waitText(page, /새 패키지 \d+ · 새 클래스 \d+/);
        const s = await page.locator('.ft-search'); await s.click(); await s.type('melee.gun');
        await page.waitForTimeout(700);
        const row = page.locator('.ft-list .ft-row', { hasText: 'items.weapon.melee.gun (새 패키지' });
        assert.strictEqual(await row.count(), 1, '총기 패키지 한 줄');
        await row.locator('input').check();
        await waitText(page, /함께 들어갈 것/);
        const t = await text(page);
        assert.ok(/새 클래스 1\d\d개/.test(t), '함께 들어갈 새 클래스 수 (100개 넘음): ' + (/새 클래스 \d+개/.exec(t) || [''])[0]);
        assert.ok(/번역 \d{3,}줄/.test(t), '번역 줄 수');
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `features-ba-${scheme}.png`) });
        const ov = await noOverflow(page); assert.ok(ov.page <= 1 && ov.doc <= 1, '가로 넘침: ' + JSON.stringify(ov));
        await page.getByRole('button', { name: '프로젝트에 가져오기' }).click();
        await waitText(page, /이 프로젝트에 가져온 기능 \(1\)/);
        const packs = F.listPacks(dir); assert.strictEqual(packs.length, 1); assert.ok(packs[0].classes.length > 100 && fs.existsSync(path.join(packs[0].dir, 'files', 'java', 'items', 'weapon', 'melee', 'gun', 'Gun.java')));
        // 끄기 (체크 해제) → feature.json enabled=false
        await page.locator('.ft-item input[type=checkbox]').first().uncheck(); await page.waitForTimeout(600);
        assert.strictEqual(F.listPacks(dir)[0].enabled, false);
        await page.locator('.ft-item').getByRole('button', { name: '지우기' }).click();
        await waitText(page, /이 프로젝트에 가져온 기능 \(0\)/);
        assert.strictEqual(F.listPacks(dir).length, 0);
        assert.deepStrictEqual(errors, []); await page.close();
      });
    }
    if (have) await check('ARK 계단: 바뀐 · 새 멤버 탭 · Hero.handle 미리보기에 "바꾸는 멤버" (이 게임의 원래 코드를 바꿈) 표시', async () => {
      const { page, errors } = await open('light');
      await page.evaluate(() => PDM.tabs.open('features')); await waitText(page, /가져온 기능/);
      await page.locator('select.ft-src').selectOption(ARK);
      await page.getByRole('button', { name: '비교' }).click();
      await waitText(page, /새 패키지 \d+ · 새 클래스 \d+/);
      await page.getByRole('button', { name: /^바뀐 · 새 멤버/ }).click(); await page.waitForTimeout(300);
      const s = page.locator('.ft-search'); await s.click(); await s.type('hero.Hero · handle(int)'); await page.waitForTimeout(700);
      const row = page.locator('.ft-list .ft-row', { hasText: 'actors.hero.Hero · handle(int) (바뀜)' });
      assert.strictEqual(await row.count(), 1);
      await row.locator('input').check(); await waitText(page, /바꾸는 멤버 \d+개/);
      const t = await text(page);
      assert.ok(/바꾸는 멤버 [1-9]\d*개/.test(t) && t.includes('actors.hero.Hero · act()'), '바뀌는 멤버에 Hero.act()');
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'features-ark-stairs.png') });
      assert.deepStrictEqual(errors, []); await page.close();
    });
    await check('좁은 화면(390×844): 가로 넘침 없음', async () => {
      const { page, errors } = await open('light', 390, 844);
      await page.evaluate(() => PDM.tabs.open('features')); await page.waitForTimeout(800);
      const ov = await noOverflow(page); assert.ok(ov.doc <= 1, JSON.stringify(ov));
      assert.deepStrictEqual(errors, []); await page.close();
    });
  } finally {
    await browser.close(); srv.kill();
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* 무시 */ }
  }
  console.log(results.join('\n'));
  console.log(`\n${results.length - fail} 통과 · ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})();
