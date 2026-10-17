#!/usr/bin/env node
// ================================================================
//  편집기 화면 캡처 (웹 모드 + Playwright · Chromium) — UI 개선 전후 비교용
//    사용: NODE_PATH=$(npm root -g) node tools/tests/ui-shots.js <저장 폴더> [접두어]
//    임시 프로젝트(직접 그린 맵 · 이벤트 · 대사)를 만들어 시작 화면 · 맵 편집기 · 이벤트 · 대사창을 넓은 창(1600×1000)과 좁은 창(1100×700)으로 찍음
// ================================================================
const fs = require('fs'), path = require('path'), os = require('os'), { spawn } = require('child_process');
const env = require('./editor-env');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..', '..');
const OUT = path.resolve(process.argv[2] || 'shots'), PRE = process.argv[3] || '';

async function makeProject(dir) {
  const ctx = env.load(), S = ctx.PDM.store;
  await S.createNew(dir, 'ui-shots');
  S.edit('project', '확장', p => { p.extensions = { event: true, story: true, tilecombos: true }; });
  const W = 16, H = 11, T = new Array(W * H).fill(1);
  for (let x = 0; x < W; x++) { T[x] = 4; T[(H - 1) * W + x] = 4; } for (let y = 0; y < H; y++) { T[y * W] = 4; T[y * W + W - 1] = 4; }
  T[2 * W + 3] = 7; T[8 * W + 12] = 8; for (let x = 5; x < 9; x++) T[5 * W + x] = 29;
  const k = S.keys('node')[0];
  S.edit(k, '맵', r => { r.mode = 'handmade'; r.size = { w: W, h: H }; r.layers = { terrain: T }; r.objects = [
    { id: 'o1', type: 'trap', ref: 'AlarmTrap', at: { x: 4, y: 7 }, cond: '' }, { id: 'o2', type: 'event', ref: 'ev_intro', at: { x: 10, y: 3 }, cond: '' }]; });
  S.add('event:ev_intro', { format: 'pdmaker-event', version: 1, id: 'ev_intro', name: '도입 장면', pages: [{ trigger: 'action', conds: {}, cond: '', commands: [
    { cmd: 'fade', op: 'out', time: 5, wait: true }, { cmd: 'illust', slot: 1, image: 'game:interfaces/arcs1.png', pos: 'center', fade: 5 }, { cmd: 'fade', op: 'in', time: 5, wait: true },
    { cmd: 'text', speaker: '', name: '안내자', text: '어서 오세요.\n이곳은 시험장입니다.' }, { cmd: 'sound', kind: 'se', file: 'game:sounds/item.mp3' },
    { cmd: 'wait', turns: 10 }, { cmd: 'illustHide', slot: 0, fade: 5 }, { cmd: 'text', speaker: '', name: '안내자', text: '행운을 빕니다.' }] }] });
  await S.save();
  return { node: k };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdm-shots-')), dir = path.join(tmp, 'proj'); fs.mkdirSync(dir);
  const P = await makeProject(dir);
  const port = 19000 + Math.floor(Math.random() * 900);
  const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', '/'], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch();
  try {
    for (const [vw, vh, tag] of [[1600, 1000, 'wide'], [1100, 700, 'narrow']]) {
      const page = await browser.newPage({ viewport: { width: vw, height: vh } });
      page.on('pageerror', e => console.log('PAGE ERROR', String(e)));
      await page.goto(`http://127.0.0.1:${port}${ROOT}/editor/renderer/index.html`);
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(OUT, `${PRE}${tag}-0-start.png`) });
      await page.goto(`http://127.0.0.1:${port}${ROOT}/editor/renderer/index.html?project=${encodeURIComponent(dir)}`);
      await page.waitForFunction(() => window.PDM && PDM.store && PDM.store.isOpen && PDM.tabs.active, null, { timeout: 30000 });
      await page.waitForTimeout(600);
      await page.evaluate(k => PDM.tabs.open(k), P.node); await page.waitForTimeout(900);
      await page.screenshot({ path: path.join(OUT, `${PRE}${tag}-1-map.png`) });
      await page.keyboard.press('m'); await page.waitForTimeout(150);
      const cv = await page.evaluate(() => { const r = document.querySelector('.map-scroll canvas').getBoundingClientRect(); return [r.left, r.top, r.width]; });
      const s = cv[2] / 22, at = (x, y) => [cv[0] + (x + 3.5) * s, cv[1] + (y + 3.5) * s];
      await page.mouse.move(...at(2, 6)); await page.mouse.down(); await page.mouse.move(...at(7, 8), { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(OUT, `${PRE}${tag}-2-map-select.png`) });
      await page.evaluate(() => PDM.tabs.open('event:ev_intro')); await page.waitForTimeout(900);
      const first = await page.$('.cmdlist .cmd:not(.ins):not(.branch)'); if (first) { await first.click(); await page.waitForTimeout(300); }   // 명령을 고른 모습 (속성 창)
      await page.screenshot({ path: path.join(OUT, `${PRE}${tag}-3-event.png`) });
      await page.evaluate(() => PDM.tabs.open('dialogue')); await page.waitForTimeout(900);
      await page.screenshot({ path: path.join(OUT, `${PRE}${tag}-4-dialogue.png`) });
      await page.close();
    }
  } finally { await browser.close(); srv.kill(); fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('saved to', OUT);
})();
