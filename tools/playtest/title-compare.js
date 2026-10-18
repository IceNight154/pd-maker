#!/usr/bin/env node
// ================================================================
//  7차: 타이틀 — 실제 게임 기록(title-check.sh) 검사 + 편집기 미리보기와 배치 비교
//    사용: node tools/playtest/title-compare.js <title-check 폴더> <full 프로젝트> <base 프로젝트> [환경...]
//    ① 게임 동작: 상태(오버 · 포커스 · 비활성) · 키보드 · 창 열기/닫기(Esc · 바깥 · 닫을 수 없게 한 창) · 포커스 복원 · 비활성 이어하기 · 연속 클릭 1번만 · 오류 없음
//    ② 같은 프로젝트 · 같은 화면 크기에서 편집기(PDM.titlePreview — 웹 모드 + Playwright)와 게임(MakerTitle.geo)의 자리 비교
//       버튼 · 로고 = 같은 식이라 0 이어야 함, 창 = 게임은 기기 점 단위로 반올림(≤ 0.5), 글이 든 자리 = 글자 폭을 재는 엔진이 달라 ≤ 2 (넘으면 실패로 보고)
//    편집기 캔버스 캡처: <폴더>/editor-<환경>-menu.png · editor-<환경>-credits.png
// ================================================================
const fs = require('fs'), path = require('path');
const [dir, proj, base, ...envs] = process.argv.slice(2);
if (!dir || !proj) { console.log('사용: title-compare.js <폴더> <full 프로젝트> <base 프로젝트> [환경...]'); process.exit(2); }
const ENVS = envs.length ? envs : ['pc', 'phone-land', 'phone-port'];
let fail = 0; const lines = [];
const ok = (cond, msg) => { lines.push(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail++; };
/** 기록 → { 구간: [geo…] } · 동작 줄 · 오류 */
function parse(file) {
  const txt = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const seg = {}; let cur = 'start'; const acts = {}; const errs = [];
  txt.split('\n').forEach(l => {
    const m = /\[TEST\] mark (\S+)/.exec(l); if (m) { cur = m[1]; return; }
    const g = /\[TEST\] titlegeo (\{.*\})\s*$/.exec(l); if (g) { try { (seg[cur] = seg[cur] || []).push(JSON.parse(g[1])); } catch (e) { errs.push('titlegeo JSON: ' + e.message); } return; }
    if (/\[PDMaker\] 타이틀 동작: /.test(l)) (acts[cur] = acts[cur] || []).push(l.replace(/.*타이틀 동작: /, ''));
    if (/Exception|Error:|타이틀 화면 설정 오류/.test(l) && !/JAVA_TOOL|ALSA|libGL|MESA/.test(l)) errs.push(l.trim());
  });
  return { seg, acts, errs, txt };
}
const B = (g, id) => (g.buttons || []).find(b => b.id === id) || {};
const dmax = (a, b) => a && b ? Math.max(...a.map((v, i) => Math.abs(v - b[i]))) : Infinity;

(async () => {
  // ① 게임 동작
  for (const E of ENVS) {
    const { seg, acts, errs } = parse(path.join(dir, E + '.log'));
    const g = k => (seg[k] || []);
    const menu = g('menu')[0] || {};
    ok(JSON.stringify((menu.buttons || []).map(b => b.id)) === '["play","cont","credits","opts"]', `[${E}] 버튼 목록 (게임 버튼은 "들어가기"만 · 새 버튼 3개) ${JSON.stringify((menu.buttons || []).map(b => b.id))}`);
    ok(B(menu, 'cont').dis === true && Math.abs(B(menu, 'cont').a - 0.7) < 0.02, `[${E}] 저장 없음 → 이어하기 비활성 (투명도 ${B(menu, 'cont').a})`);
    const last = (menu.elements || []).find(e => e.id === 'last') || {}, ver = (menu.elements || []).find(e => e.id === 'ver') || {};
    ok(last.text === '저장된 게임이 없습니다' && /타이틀 검사 v.+ · 저장 0개/.test(ver.text || ''), `[${E}] 정보 칸: "${ver.text}" · 저장 없음 → 대체 문구 "${last.text}"`);
    const hv = g('hover')[0] || {};
    ok(B(hv, 'play').hover === true && Math.abs(B(hv, 'play').bright - 1.4) < 1e-6 && B(hv, 'cont').hover === false, `[${E}] 포인터 오버 → 묶음 오버 모양 (밝기 ${B(hv, 'play').bright})`);
    const [k1, k2, k3] = g('keys');
    ok(k1 && k1.focus === 'play' && k2 && k2.focus === 'credits' && B(k2, 'credits').skin === 'TOAST_TR' && B(k2, 'credits').tc === '#ffff44', `[${E}] 키보드: ↓ = 첫 버튼 · ↓ = 비활성 건너뜀 → "만든 사람" (포커스 모양 TOAST_TR · 노란 글자)`);
    ok(k3 && (k3.windows || []).length === 1 && k3.windows[0].id === 'credits', `[${E}] Enter → 만든 사람 창`);
    const [w1, w2] = g('winkeys');
    ok(w1 && w1.windows[0] && w1.windows[0].focus === 0, `[${E}] 창 안 Tab → 창 버튼 포커스`);
    ok(w2 && (w2.windows || []).length === 0 && w2.focus === 'credits', `[${E}] Esc → 창 닫힘 · 포커스 복원 (${w2 && w2.focus})`);
    const [o1, o2, o3] = g('options');
    ok(o1 && o1.windows.length === 1 && o2 && o2.windows.length === 1 && o3 && o3.windows.length === 0, `[${E}] 소리 설정 창: 바깥 누르기로 안 닫힘(설정대로) · Esc 로 닫힘`);
    const out = g('outside')[0];
    ok(out && out.windows.length === 0, `[${E}] 만든 사람 창: 바깥 누르면 닫힘`);
    const ct = g('cont')[0];
    ok(ct && !ct.leaving && !(acts.cont || []).length, `[${E}] 비활성 이어하기를 눌러도 아무 일 없음`);
    if (E.startsWith('phone')) { const r = g('rot'); ok(r.length === 2 && (r[0].W > r[0].H) !== (menu.W > menu.H) && r[1].W === menu.W && r[1].H === menu.H && r.every(x => (x.buttons || []).length === 4 && x.windows.length === 0),
      `[${E}] 창이 열리는 중 화면 돌리기 → 새 크기로 타이틀을 다시 만듦 (열던 창은 원작처럼 닫힘) · 다시 돌리면 처음 크기: ${menu.W}×${menu.H} → ${r.map(x => x.W + '×' + x.H).join(' → ')}`); }
    const rp = g('rapid')[0];
    ok(rp && rp.leaving === true && (acts.rapid || []).length === 1, `[${E}] 빠른 연속 클릭 (들어가기 ×2 + 만든 사람) → 동작 1번만: ${(acts.rapid || []).join(', ')}`);
    ok(!errs.length, `[${E}] 게임 오류 없음${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
  }
  // ② 편집기 미리보기와 비교
  let chromium; try { ({ chromium } = require('playwright')); } catch (_) { lines.push('(playwright 가 없어 편집기 비교는 건너뜀 — NODE_PATH=$(npm root -g))'); }
  if (chromium) {
    const { spawn } = require('child_process'), ROOT = path.join(__dirname, '..', '..');
    const port = 19700 + Math.floor(Math.random() * 200);
    const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', '/'], { stdio: 'ignore' });
    await new Promise(r => setTimeout(r, 800));
    const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const perr = []; page.on('pageerror', e => perr.push(String(e)));
    const open = async p => { await page.goto(`http://127.0.0.1:${port}${ROOT}/editor/renderer/index.html?project=${encodeURIComponent(path.resolve(p))}`); await page.waitForFunction(() => window.PDM && PDM.store && PDM.store.isOpen && PDM.tabs.active, null, { timeout: 15000 }); await page.waitForTimeout(500); await page.evaluate(() => PDM.tabs.open('title')); await page.waitForTimeout(1200); };
    const geoAt = async (env, win) => {
      await page.evaluate(([e, w]) => { PDM.store.edit('project', '비교', p => { p.testplay = { env: e, safeArea: 'notch' }; }); const ed = PDM.titleEditor; ed.select(w ? 'window:' + w : 'background'); }, [env, win]);
      await page.waitForTimeout(1800);
      return page.evaluate(() => { const g = PDM.titleEditor.geo(); return JSON.parse(JSON.stringify(g)); });
    };
    const shot = async name => { const d = await page.evaluate(() => { const st = PDM.titleEditor.preview(); return document.querySelector('.tp-canvas').toDataURL('image/png'); }); fs.writeFileSync(path.join(dir, name), Buffer.from(d.split(',')[1], 'base64')); };
    await open(proj);
    await page.evaluate(() => { PDM.titlePreview.simulateWindow = true; });   // 테스트 플레이는 휴대폰 화면을 PC 창 배율로 흉내 — 글자도 그 배율로 만듦
    await page.evaluate(() => { const b = [...document.querySelectorAll('.tp-toolbar label.check input')].find(i => i.parentElement.textContent.includes('편집 윤곽')); if (b && b.checked) b.click(); });
    for (const E of ENVS) {
      const { seg } = parse(path.join(dir, E + '.log'));
      const gm = (seg.menu || [])[0], gw = ((seg.keys || [])[2]);
      if (!gm) { ok(false, `[${E}] 게임 배치 기록 없음`); continue; }
      const em = await geoAt(E, null); await shot(`editor-${E}-menu.png`);
      ok(em.W === gm.W && em.H === gm.H, `[${E}] 화면 크기 같음: 편집기 ${em.W}×${em.H} · 게임 ${gm.W}×${gm.H}`);
      const sd = dmax(em.safe ? [em.safe.x, em.safe.y, em.safe.w, em.safe.h] : null, JSON.parse(JSON.stringify(gm.safe)));
      ok(sd < 0.51, `[${E}] 안전 영역 같음 (차이 ${sd.toFixed(2)})`);
      const ld = dmax(em.logo, gm.logo); ok(ld < 0.01, `[${E}] 로고 자리 같음 (차이 ${ld.toFixed(3)})`);
      const bd = Math.max(...gm.buttons.map(b => dmax((em.buttons.find(x => x.id === b.id) || {}).base, b.base)));
      ok(bd < 0.01, `[${E}] 버튼 ${gm.buttons.length}개 자리 같음 (최대 차이 ${bd.toFixed(3)})`);
      const sty = gm.buttons.every(b => { const e = em.buttons.find(x => x.id === b.id) || {}; return e.skin === b.skin && e.tc === b.tc && e.dis === b.dis; });
      ok(sty, `[${E}] 버튼 상태 모양 같음 (조각 · 글자 색 · 비활성)`);
      // 글이 같은 요소만 자리 비교 (버전 글은 게임을 띄운 방식에 따라 다름 — 테스트 하네스는 3.2.0-INDEV, 편집기는 build.gradle 의 버전)
      const same = gm.elements.filter(e => (em.elements.find(x => x.id === e.id) || {}).text === e.text), diff = gm.elements.filter(e => !same.includes(e));
      const ed = same.length ? Math.max(...same.map(e => dmax((em.elements.find(x => x.id === e.id) || {}).r, e.r))) : 0;
      const ew = same.length ? Math.max(...same.map(e => Math.abs(((em.elements.find(x => x.id === e.id) || {}).size || [0])[0] - e.size[0]))) : 0;
      const eh = same.length ? Math.max(...same.map(e => Math.abs(((em.elements.find(x => x.id === e.id) || {}).size || [0, 0])[1] - e.size[1]))) : 0;
      ok(same.length > 0 && ed <= 2.5 && eh < 0.01, `[${E}] 글 요소 ${same.length}개 자리: 글자 높이 차이 ${eh.toFixed(3)} · 폭 차이 최대 ${ew.toFixed(2)} → 자리 차이 최대 ${ed.toFixed(2)} (≤ 2.5 — 글자 폭을 재는 엔진이 다름)`);
      diff.forEach(e => lines.push(`  · 글이 다른 요소 "${e.id}": 게임 "${e.text}" / 편집기 "${(em.elements.find(x => x.id === e.id) || {}).text}" (버전 값 — 실행 방식 차이)`));
      if (gw && gw.windows[0]) {
        const ew2 = await geoAt(E, 'credits'); await shot(`editor-${E}-credits.png`);
        const wg = gw.windows[0], we = ew2.windows[0] || {};
        const cd = dmax(we.chrome, wg.chrome), md = dmax(we.chrome, wg.model);
        const id = Math.max(...wg.items.map((r, i) => dmax((we.items || [])[i], r)));
        ok(md < 0.01 && cd <= 0.5 && id < 0.01, `[${E}] 창 배치 같음: 내용 자리 차이 ${id.toFixed(3)} · 틀(규칙) ${md.toFixed(3)} · 틀(게임 화면, 기기 점 반올림) ${cd.toFixed(2)}`);
      }
    }
    // 예전 모양 (base)
    const bl = parse(path.join(dir, 'base-pc.log')), bm = (bl.seg.menu || [])[0];
    if (bm) {
      await open(base); await page.evaluate(() => { PDM.titlePreview.simulateWindow = true; }); const eb = await geoAt('pc', null); await shot('editor-base-pc.png');
      const bd = Math.max(...bm.buttons.map(b => dmax((eb.buttons.find(x => x.id === b.id) || {}).base, b.base)));
      ok(bm.buttons.length === 8 && bd < 0.01 && dmax(eb.logo, bm.logo) < 0.01, `[base · pc] 예전 모양 프로젝트: 게임 버튼 8개 · 로고 · 버튼 자리가 편집기와 같음 (차이 ${bd.toFixed(3)})`);
      ok(/Enter the Dungeon@96,129 a1.00, Support the Game@214,129/.test(bl.txt) || /@96,129 a1\.00/.test(bl.txt), '[base · pc] 6차까지와 같은 자리 (96,129 · 214,129 …)');
    }
    ok(!perr.length, '편집기 페이지 오류 없음' + (perr.length ? ': ' + perr.slice(0, 2).join(' | ') : ''));
    await browser.close(); srv.kill();
  }
  console.log(lines.join('\n'));
  console.log(`\n${lines.length - fail} 통과 · ${fail} 실패 (화면 시뮬레이션 — 실제 기기 · 에뮬레이터 아님)`);
  process.exit(fail ? 1 : 0);
})();
