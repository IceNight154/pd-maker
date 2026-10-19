#!/usr/bin/env node
// ================================================================
//  9차 — "게임 저장소 분석" 보고서 화면 테스트 (웹 모드 + Playwright · Chromium, 실제 마우스 · 키보드)
//    사용: NODE_PATH=$(npm root -g) node tools/tests/ui-repoanalysis.js [--reports <폴더>] [--shots <저장 폴더>]
//      · 기준 저장소(game/shattered-pixel-dungeon-master)는 이 자리에서 분석기(editor/repo-analyzer.js)로 분석
//      · --reports: 다른 PC 에서 만든 분석 결과(<저장소 이름>.json 또는 .json.gz — node editor/repo-analyzer.js <폴더> --json)
//        ARK_PD-main · New-Blue-Archive-Pixel-Dungeon-main 결과가 없으면 그 검사는 "실행하지 못함"으로 표시하고 실패로 셈
//    웹 모드에는 분석기가 없으므로 pdm.analyzeRepo · pdm.openFolder 만 바꿔 끼움 (화면 코드는 그대로)
//    확인: 요약 숫자 = 분석 결과 · 구조 차이 · 지원 범위 8단계 · 게임 객체 탭 · 문제 목록을 누르면 파일 경로 · 원인(· 코드) ·
//          키보드(Enter)로 열기 · 다시 분석해도 내용이 늘지 않음 · 가로 넘침 없음 · 밝음/어두움 · 페이지 오류 없음 · 웹 모드 안내
// ================================================================
const fs = require('fs'), path = require('path'), os = require('os'), zlib = require('zlib'), assert = require('assert'), { spawn } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_) { console.log('playwright 를 찾지 못했습니다 — NODE_PATH=$(npm root -g) node tools/tests/ui-repoanalysis.js'); process.exit(2); }
const { makeProject } = require('./ui-shots');
const ROOT = path.join(__dirname, '..', '..');
const A = require(path.join(ROOT, 'editor', 'repo-analyzer.js'));
const args = process.argv.slice(2), opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const SHOTS = opt('--shots') ? path.resolve(opt('--shots')) : null, REPORTS = opt('--reports') ? path.resolve(opt('--reports')) : null;

/** 분석 결과 모으기: 기준은 지금 분석, 나머지는 --reports 에서 */
function loadReports() {
  const out = {}, notRun = [];
  const base = path.join(ROOT, 'game', 'shattered-pixel-dungeon-master');
  if (fs.existsSync(base)) out.base = A.analyze(base); else notRun.push('기준 저장소가 없음: ' + base);
  for (const [k, name] of [['ark', 'ARK_PD-main'], ['ba', 'New-Blue-Archive-Pixel-Dungeon-main']]) {
    const f = REPORTS && [name + '.json', name + '.json.gz'].map(x => path.join(REPORTS, x)).find(x => fs.existsSync(x));
    if (!f) { notRun.push(`${name} 분석 결과가 없음 — --reports <폴더> 에 ${name}.json(.gz) 필요 (만들기: node editor/repo-analyzer.js <저장소> --json)`); continue; }
    let b = fs.readFileSync(f); if (/\.gz$/.test(f)) b = zlib.gunzipSync(b);
    out[k] = JSON.parse(b.toString('utf8'));
  }
  return { reports: out, notRun };
}

(async () => {
  const { reports, notRun } = loadReports();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdm-ra-')), dir = path.join(tmp, 'proj'); fs.mkdirSync(dir);
  await makeProject(dir);
  const port = 19900 + Math.floor(Math.random() * 90);
  const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', '/'], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch();
  const results = []; let fail = 0;
  const check = async (name, fn) => { try { const r = await fn(); results.push(`✓ ${name}${r ? '\n    ' + r : ''}`); } catch (e) { fail++; results.push(`✗ ${name}\n    ${String(e && e.message || e).split('\n').slice(0, 6).join('\n    ')}`); } };
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

  async function open(scheme, vw = 1400, vh = 900) {
    const page = await browser.newPage({ viewport: { width: vw, height: vh }, colorScheme: scheme });
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    page.on('dialog', d => d.dismiss());
    await page.goto(`http://127.0.0.1:${port}${ROOT}/editor/renderer/index.html?project=${encodeURIComponent(dir)}`);
    await page.waitForFunction(() => window.PDM && PDM.store && PDM.store.isOpen && PDM.tabs.active, null, { timeout: 30000 });
    await page.waitForTimeout(400);
    return { page, errors };
  }
  /** 웹 모드에 분석기 · 폴더 고르기만 끼움 (화면 코드는 그대로) */
  const install = (page, reps) => page.evaluate(R => {
    window.__calls = []; window.__pick = null;
    pdm.analyzeRepo = async (d, o) => { window.__calls.push({ dir: d, force: !!(o && o.force) }); const r = R[d] || null; if (!r) throw new Error('테스트: 분석 결과 없음 ' + d); return Object.assign(JSON.parse(JSON.stringify(r)), { cached: !(o && o.force) }); };
    pdm.openFolder = async () => window.__pick;
  }, reps);
  /** "다른 폴더 분석…" 으로 저장소 하나를 엶 (실제 단추 클릭) */
  async function analyzeVia(page, key) {
    await page.evaluate(k => { window.__pick = k; }, key);
    await page.getByRole('button', { name: '다른 폴더 분석…' }).click();
    await page.waitForFunction(k => window.__calls.some(c => c.dir === k) && document.querySelector('.page.ra .ra-support') && !/분석 중/.test(document.querySelector('.page.ra .btn.pri').textContent), key, { timeout: 15000 });
    await page.waitForTimeout(200);
  }
  const pageText = page => page.evaluate(() => document.querySelector('.page.ra').innerText);
  const groupRows = (page, title) => page.evaluate(t => { const d = [...document.querySelectorAll('.page.ra details.ra-grp')].find(x => x.querySelector('summary b').textContent === t); return d ? { open: d.open, badge: d.querySelector('summary .badge').textContent, rows: d.querySelectorAll('.ra-row').length } : null; }, title);
  const noOverflow = page => page.evaluate(() => { const p = document.querySelector('.page.ra'), s = p.closest('.tab-body, .editor, main') || p.parentElement; return { page: p.scrollWidth - p.clientWidth, doc: document.documentElement.scrollWidth - document.documentElement.clientWidth, host: s ? s.scrollWidth - s.clientWidth : 0 }; });

  try {
    // ---------------------------------------------------------------- 웹 모드 안내 (분석기 없음)
    await check('웹 모드(분석기 없음): 화면이 열리고 "Electron 편집기에서 여세요" 안내 — 오류로 멈추지 않음', async () => {
      const { page, errors } = await open('light');
      await page.evaluate(() => PDM.tabs.open('repoanalysis')); await page.waitForTimeout(500);
      const t = await pageText(page);
      assert.ok(/웹 모드/.test(t) && /Electron/.test(t), t.slice(0, 300));
      assert.deepStrictEqual(errors, []); await page.close();
    });

    for (const [key, label] of [['base', '기준 저장소'], ['ark', 'ARK_PD-main'], ['ba', 'New-Blue-Archive-Pixel-Dungeon-main']]) {
      const rep = reports[key];
      if (!rep) { await check(`${label}: 보고서 화면`, async () => { throw new Error('실행하지 못함 — ' + notRun.find(x => x.includes(label === '기준 저장소' ? '기준' : label))); }); continue; }
      for (const scheme of ['light', 'dark']) {
        await check(`${label} (${scheme}): 요약 · 구조 차이 · 지원 범위 · 객체 · 문제 목록 · 자세히 보기 · 다시 분석 · 넘침 없음`, async () => {
          const { page, errors } = await open(scheme);
          await install(page, { [key]: rep });
          await page.evaluate(() => PDM.tabs.open('repoanalysis')); await page.waitForTimeout(400);
          await analyzeVia(page, key);
          assert.deepStrictEqual(await page.evaluate(() => window.__calls.slice(-1)[0]), { dir: key, force: false }, '분석기를 고른 폴더로 부름');
          const t = await pageText(page), S = rep.summary;
          // 요약 숫자 = 분석 결과
          for (const s of [`${S.sourceFound} 발견 · ${S.sourceOk} 분석 성공`, `${S.resourcesFound} 발견 · ${S.resourcesDecoded} 디코딩 성공`, `${S.recognized} 인식 · ${S.converted} PDMaker 목록으로 변환 · ${S.unsupported} 원본 참조만 보존`]) assert.ok(t.includes(s), '요약에 없음: ' + s);
          assert.ok(t.includes(rep.root), '저장소 루트 표시');
          // 구조 차이
          assert.ok(t.includes(`이 저장소의 구조 차이 (${rep.features.length})`));
          for (const f of rep.features) assert.ok(t.includes(f.label), '구조 차이 표시: ' + f.label);
          if (!rep.features.length) assert.ok(/기준 저장소\(Shattered Pixel Dungeon\)와 같은 구조/.test(t), '차이가 없다는 문장이 보여야 함');
          // 값 · 근거는 보이는 글자 (tips.js 가 .hint 를 ⓘ 말풍선으로 숨기므로 — 예전: 근거 · 처리 · "없음" 이 화면에 안 보였음)
          const vis = await page.evaluate(() => [...document.querySelectorAll('.page.ra .ra-note')].filter(e => e.offsetParent && !e.classList.contains('tipped')).length);
          assert.ok(vis >= rep.features.length * 2 || (!rep.features.length && vis >= 1), 'ra-note 보임: ' + vis);
          for (const f of rep.features) assert.ok(t.includes(f.evidence.slice(0, 30)), '근거가 화면에 보임: ' + f.evidence);
          // 런타임: 런타임이 쓰는 게임 클래스 (없으면 "설치는 되지만 컴파일 안 됨" + 클래스 · 쓰는 곳)
          const cc = rep.runtime && rep.runtime.classCheck;
          if (cc && cc.checked) {
            if (cc.missing.length) { assert.ok(t.includes('설치는 되지만 컴파일 안 됨') && t.includes(`게임 클래스 ${cc.missing.length}개가 이 저장소에 없습니다`), '런타임: 컴파일 안 됨 표시'); for (const m of cc.missing) assert.ok(t.includes(m.cls), '없는 클래스 표시: ' + m.cls); }
            else assert.ok(t.includes(`게임 클래스 ${cc.refs}개가 모두 있습니다`), '런타임 클래스 모두 있음 표시');
          }
          // 지원 범위: 행 수 · 8단계 열
          const sup = await page.evaluate(() => { const tb = document.querySelector('.ra-support'); return { rows: tb.querySelectorAll('tbody tr').length, cols: tb.querySelectorAll('thead th').length, cells: [...tb.querySelectorAll('tbody tr')].map(r => r.querySelectorAll('td').length) }; });
          assert.strictEqual(sup.rows, rep.support.length); assert.strictEqual(sup.cols, 9); assert.ok(sup.cells.every(n => n === 9));
          // 게임 객체: 몬스터 탭 → 줄 수 (처음 60개) · 눌러서 자세히
          const mobs = rep.objects.mobs || [];
          await page.locator('.page.ra .chips .chip', { hasText: '몬스터 · NPC' }).click(); await page.waitForTimeout(150);
          const mobRows = await page.evaluate(() => document.querySelector('.chips').parentElement.querySelectorAll('.ra-row').length);
          assert.strictEqual(mobRows, Math.min(60, mobs.length), '몬스터 줄 수');
          // 문제 목록: 오류 묶음은 열려 있고 개수 = 결과
          const J = rep.source.java.problems, F = rep.resources.failed;
          const gj = await groupRows(page, '소스 분석 실패 · 부분'), gf = await groupRows(page, '리소스 디코딩 실패');
          assert.strictEqual(+gj.badge, J.total); assert.strictEqual(gj.open, J.list.length > 0); assert.strictEqual(gj.rows, Math.min(40, J.list.length));
          assert.strictEqual(+gf.badge, F.total); assert.strictEqual(gf.open, F.list.length > 0); assert.strictEqual(gf.rows, Math.min(40, F.list.length));
          // 한 줄 눌러서 자세히: 파일 경로 · 원인 (· 코드)
          let detail = '';
          const pick = J.list[0] ? ['소스 분석 실패 · 부분', J.list[0]] : F.list[0] ? ['리소스 디코딩 실패', F.list[0]] : null;
          if (pick) {
            const row = page.locator('.page.ra details.ra-grp', { has: page.locator('summary b', { hasText: pick[0] }) }).locator('.ra-row').first();
            if (scheme === 'dark') { await row.focus(); await page.keyboard.press('Enter'); } else await row.click();
            const modal = page.locator('.modal, [role=dialog]').last(); await modal.waitFor({ timeout: 5000 });
            const mt = await modal.innerText();
            assert.ok(mt.includes(pick[1].file.split('/').pop()) && mt.includes(pick[1].reason.slice(0, 20)), '자세히: 파일 · 원인\n' + mt.slice(0, 300));
            const local = fs.existsSync(path.join(rep.root, pick[1].file)), code = await modal.locator('pre').count();
            if (local && /\.java$/.test(pick[1].file)) assert.ok(code > 0, '로컬 파일이면 코드 일부를 보여 줌');
            if (!local && /\.(java|properties)$/.test(pick[1].file)) assert.ok(/파일을 읽지 못했습니다/.test(mt), '다른 PC 경로면 "읽지 못함" 안내 (멈추지 않음)');
            detail = `${pick[1].file.split('/').pop()} ${local ? (code ? '코드 표시' : '') : '(다른 PC 경로 → 안내)'}`;
            if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `ra-${key}-${scheme}-detail.png`) });
            await modal.locator('button.btn', { hasText: '닫기' }).click(); await page.waitForTimeout(150);
          } else {   // 문제가 없는 저장소: 몬스터 한 줄로 자세히 (코드 표시)
            const m = mobs.find(x => !x.abstract && x.file);
            await page.locator('.page.ra .chips').locator('xpath=..').locator('.ra-row').first().click();
            const modal = page.locator('.modal, [role=dialog]').last(); await modal.waitFor({ timeout: 5000 });
            const mt = await modal.innerText(); assert.ok(/\.java/.test(mt) && /원인/.test(mt), mt.slice(0, 200));
            if (fs.existsSync(rep.root)) assert.ok(await modal.locator('pre').count() > 0, '코드 일부');
            detail = (m ? '몬스터 줄 → ' : '') + '코드 표시';
            await modal.locator('button.btn', { hasText: '닫기' }).click(); await page.waitForTimeout(150);
          }
          // 넘침 없음 (넓은 표는 자기 안에서만 가로 스크롤)
          const ov = await noOverflow(page); assert.ok(ov.page <= 1 && ov.doc <= 1, '가로 넘침: ' + JSON.stringify(ov));
          if (SHOTS) { await page.evaluate(() => document.querySelector('.page.ra h1').scrollIntoView()); await page.waitForTimeout(100); await page.screenshot({ path: path.join(SHOTS, `ra-${key}-${scheme}.png`) });
            await page.evaluate(() => document.querySelector('.ra-support').scrollIntoView()); await page.waitForTimeout(100); await page.screenshot({ path: path.join(SHOTS, `ra-${key}-${scheme}-support.png`) }); }
          // 다시 분석: force 로 부르고, 내용이 쌓이지 않음 (같은 섹션 · 같은 줄 수)
          const before = await page.evaluate(() => ({ sec: document.querySelectorAll('.page.ra .ra-grp').length, feat: document.querySelectorAll('.page.ra .ra-feat').length, sup: document.querySelectorAll('.ra-support tbody tr').length, pages: document.querySelectorAll('.page.ra').length }));
          await page.getByRole('button', { name: '다시 분석' }).click();
          await page.waitForFunction(() => window.__calls.length >= 2 && !/분석 중/.test(document.querySelector('.page.ra .btn.pri').textContent), null, { timeout: 15000 });
          assert.deepStrictEqual(await page.evaluate(() => window.__calls.slice(-1)[0]), { dir: key, force: true }, '다시 분석 = force');
          const after = await page.evaluate(() => ({ sec: document.querySelectorAll('.page.ra .ra-grp').length, feat: document.querySelectorAll('.page.ra .ra-feat').length, sup: document.querySelectorAll('.ra-support tbody tr').length, pages: document.querySelectorAll('.page.ra').length }));
          assert.deepStrictEqual(after, before, '다시 분석해도 같은 내용 (중복 없음)');
          assert.ok(/방금 분석/.test(await pageText(page)), '다시 분석 후 "방금 분석" 표시');
          assert.deepStrictEqual(errors, [], '페이지 오류');
          await page.close();
          return `런타임 없는 클래스 ${cc && cc.checked ? cc.missing.length : '?'} · 구조 차이 ${rep.features.length} · 지원 범위 ${sup.rows}줄 · 몬스터 ${mobRows}줄 · 소스 문제 ${J.total} · 디코딩 실패 ${F.total} · 자세히: ${detail}`;
        });
      }
    }
    // 좁은 창 (1100×700): 지원 범위 표는 자기 안에서 가로 스크롤, 화면 전체는 넘치지 않음
    const any = reports.ark || reports.base;
    if (any) await check('좁은 창 1100×700: 화면 전체 가로 넘침 없음 (넓은 표만 자기 안에서 스크롤)', async () => {
      const { page, errors } = await open('light', 1100, 700); const k = reports.ark ? 'ark' : 'base';
      await install(page, { [k]: any }); await page.evaluate(() => PDM.tabs.open('repoanalysis')); await page.waitForTimeout(300); await analyzeVia(page, k);
      const ov = await noOverflow(page); assert.ok(ov.page <= 1 && ov.doc <= 1, JSON.stringify(ov));
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `ra-${k}-narrow.png`) });
      assert.deepStrictEqual(errors, []); await page.close();
    });
  } finally { await browser.close(); srv.kill(); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* 무시 */ } }
  console.log(results.join('\n'));
  if (notRun.length) console.log('\n실행하지 못함:\n· ' + notRun.join('\n· '));
  console.log(`\n${results.length - fail} 통과 · ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})();
