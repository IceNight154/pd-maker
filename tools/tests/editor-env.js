// ================================================================
//  편집기 스크립트를 Node 에서 불러오는 환경 (회귀 테스트용 — Electron · 브라우저 없이)
//    editor/renderer/index.html 의 <script> 순서대로 vm 안에서 실행하고,
//    파일 기능(window.pdmNative)은 진짜 폴더(임시 폴더)를 쓰는 가짜로 바꿈 — main.js 의 fs:* 처리와 같은 동작
//    화면(DOM)은 아무것도 하지 않는 가짜. app.js(화면 시작)는 불러오지 않음
// ================================================================
const vm = require('vm'), fs = require('fs'), path = require('path');
const RENDERER = path.join(__dirname, '..', '..', 'editor', 'renderer');

/** 무엇을 불러도 아무 일도 하지 않는 객체 (document · 캔버스 등) */
function inert() {
  const f = function () { };
  return new Proxy(f, {
    get: (t, k) => k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : inert(),
    set: () => true,
    apply: () => inert(),
    construct: () => inert()
  });
}

/** main.js 의 fs:* 와 같은 동작 (writeText = 임시 파일에 쓰고 바꿔치기) */
function nativeFs(opts = {}) {
  const P = path;
  return {
    isElectron: true, sep: P.sep,
    join: (...p) => P.join(...p), resolve: (...p) => P.resolve(...p), relative: (a, b) => P.relative(a, b),
    dirname: p => P.dirname(p), basename: (p, e) => P.basename(p, e),
    async readText(p) { return fs.readFileSync(p, 'utf8'); },
    async writeText(p, t) {
      if (opts.failWrite && opts.failWrite(p)) throw new Error('쓰기 실패 (테스트): ' + p);
      fs.mkdirSync(P.dirname(p), { recursive: true }); const tmp = p + '.tmp'; fs.writeFileSync(tmp, t, 'utf8'); fs.renameSync(tmp, p); return true;
    },
    async exists(p) { return fs.existsSync(p); },
    async list(d) { return fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).map(e => ({ name: e.name, dir: e.isDirectory() })) : []; },
    async walk(d) { const out = []; const rec = (x, rel) => { for (const e of fs.readdirSync(x, { withFileTypes: true })) { if (e.isDirectory()) rec(P.join(x, e.name), rel + e.name + '/'); else out.push(rel + e.name); } }; if (fs.existsSync(d)) rec(d, ''); return out; },
    async mkdir(p) { fs.mkdirSync(p, { recursive: true }); return true; },
    async remove(p) { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true }); return true; },
    async copy(a, b) { fs.mkdirSync(P.dirname(b), { recursive: true }); fs.copyFileSync(a, b); return true; },
    async readDataURL(p) { return 'data:application/octet-stream;base64,' + fs.readFileSync(p).toString('base64'); },
    async writeDataURL(p, d) { fs.mkdirSync(P.dirname(p), { recursive: true }); fs.writeFileSync(p, Buffer.from(d.split(',')[1], 'base64')); return true; },
    async paths() { return { gameRepo: '' }; },
    // 9차: 저장소 분석기 (main.js 의 repo:analyze 와 같은 모듈). opts.analyzer 를 켤 때만 — 끄면 웹 모드와 같음 (분석기 없음)
    analyzeRepo: !opts.analyzer ? undefined : async (dir, o) => require(P.join(__dirname, '..', '..', 'editor', 'repo-analyzer.js')).analyze(dir, Object.assign({ cacheDir: opts.analysisCache }, o || {})),
    on() { }
  };
}

/** 편집기 환경 하나 (PDM · pdm 이 들어 있는 vm 컨텍스트) */
function load(opts = {}) {
  const html = fs.readFileSync(path.join(RENDERER, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]).filter(s => !/\/app\.js$/.test(s));
  const logs = [];
  const ctx = {
    console: { log: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(a.join(' ')) },
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval() { }, requestAnimationFrame: () => 0, cancelAnimationFrame() { },
    localStorage: { getItem: () => null, setItem() { }, removeItem() { } },
    navigator: { platform: 'Linux', userAgent: 'node' }, matchMedia: () => ({ matches: false, addEventListener() { } }),
    Element: function () { }, Node: function () { }, DocumentFragment: function () { }, Image: function () { }, MutationObserver: function () { return { observe() { }, disconnect() { } }; },
    addEventListener() { }, removeEventListener() { }, document: inert(),
    URL, Blob: function () { }, TextEncoder, TextDecoder, structuredClone
  };
  ctx.Element.prototype = {}; ctx.DocumentFragment.prototype = {}; ctx.HTMLElement = ctx.HTMLCanvasElement = ctx.Element;
  ctx.window = ctx; ctx.self = ctx;
  ctx.pdmNative = nativeFs(opts);
  vm.createContext(ctx);
  for (const s of scripts) vm.runInContext(fs.readFileSync(path.join(RENDERER, s), 'utf8'), ctx, { filename: s });
  // 화면 알림은 테스트에서 쓰지 않음
  ctx.PDM.toast = () => { };
  // 확장 기능 켜짐 여부 (app.js extOn 과 같은 규칙 — 체크한 것만 켬)
  if (!ctx.PDM.extensions) ctx.PDM.extensions = { on: id => { const x = (ctx.PDM.store.get('project') || {}).extensions; return !!x && x[id] === true; } };
  return ctx;
}

module.exports = { load, RENDERER };
