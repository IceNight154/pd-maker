// ================================================================
//  화면 필터 (확장 기능 "filters") — 화면 전체에 덮는 연출: 날씨(비 · 눈 · 안개), 밤 · 노을, 노이즈 · 주사선 · 글리치, 번개
//    데이터: filters.json { list: [ { id, name, overUI, layers: [ 층 ] } ] }   (런타임 MakerFilter 와 같은 규칙)
//    층 type:
//      tint  { color, alpha(0~100), blend(normal|add), pulse(%), pulseSec }                  색 덮기
//      image { png, fit(tile|stretch), alpha, blend, scale, vx, vy(px/초), jitter(초당 튐), fw, frames, fps }   그림을 화면 가득 반복(또는 화면에 맞게 늘림)
//      vignette { color, alpha, size(가운데 투명한 크기 %), soft(번짐 %), pulse, pulseSec }   조리개: 가장자리를 어둡게(또는 색으로)
//      code  { lang(js|css), code, w, h, frames, fps, fit … + 구운 png }                     코드로 그린 그림 — 편집기에서 PNG(시트)로 구워 그림 층처럼 씀
//      letterbox { color, alpha, size(띠 두께 %), side(tb | lr) }                           레터박스
//      flash { color, alpha, every(초), dur(초) }                                            가끔 번쩍
//    필터마다 나타남 · 사라짐: inType / outType (fade | dissolve | slide | none), inSec / outSec
//      shake { power, every(초), time(초) }                                                  가끔 흔들림
//    쓰는 곳 (앞이 우선): 이벤트 명령 "화면 필터" → 방 템플릿의 filter → 맵 노드의 filter → 그룹의 filter
//    노드 합성기와 연계: 그림 층의 그림을 합성기 그래프로 만들고(PDM.compose.forFilter), 합성기에서 저장하면 바로 반영
// ================================================================
(function () {
  const { h, store, toast } = PDM;
  const K = 'filters';
  const list = () => (store.get(K) || {}).list || [];
  const num = (v, d) => (isFinite(+v) && v !== '' && v !== null && v !== undefined ? +v : d);

  // ---------------- 기본 그림 (assets/filters/*.png — 64×64, 반복해서 깔리므로 가장자리가 이어지게)
  const rng = seed => { let a = seed | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
  const wrapDot = (g, s, x, y, w, hh) => { for (let j = 0; j < hh; j++) for (let i = 0; i < w; i++) g.fillRect(((x + i) % s + s) % s, ((y + j) % s + s) % s, 1, 1); };
  const TEX = {
    rain: ['빗줄기', (g, s, r) => { g.fillStyle = '#cfe0ff'; for (let i = 0; i < 26; i++) { const x = r() * s | 0, y = r() * s | 0, n = 4 + (r() * 5 | 0); for (let k = 0; k < n; k++) { g.globalAlpha = 0.35 + 0.65 * k / n; wrapDot(g, s, x - (k >> 1), y + k, 1, 1); } } }],
    snow: ['눈송이', (g, s, r) => { g.fillStyle = '#ffffff'; for (let i = 0; i < 22; i++) { const x = r() * s | 0, y = r() * s | 0, big = r() < 0.3; g.globalAlpha = 0.5 + r() * 0.5; wrapDot(g, s, x, y, big ? 2 : 1, big ? 2 : 1); } }],
    fog: ['안개', (g, s, r) => { const n = 8, v = []; for (let i = 0; i < n * n; i++) v.push(r()); const at = (x, y) => v[((y % n + n) % n) * n + ((x % n + n) % n)];
      const d = g.createImageData(s, s); for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) { const fx = x / s * n, fy = y / s * n, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
        const a = at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx, b = at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx, k = a * (1 - sy) + b * sy, i = (y * s + x) * 4; d.data[i] = d.data[i + 1] = d.data[i + 2] = 235; d.data[i + 3] = Math.round(Math.max(0, k - 0.25) * 6) * 40; } g.putImageData(d, 0, 0); }],
    noise: ['노이즈', (g, s, r) => { const d = g.createImageData(s, s); for (let i = 0; i < s * s * 4; i += 4) { const v = r() * 255 | 0; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = r() < 0.55 ? 0 : 90 + (r() * 165 | 0); } g.putImageData(d, 0, 0); }],
    scan: ['주사선', (g, s) => { g.fillStyle = '#000000'; for (let y = 0; y < s; y += 2) g.fillRect(0, y, s, 1); }],
    glitch: ['글리치 띠', (g, s, r) => { for (let i = 0; i < 7; i++) { const y = r() * s | 0, hh = 1 + (r() * 3 | 0), x = r() * s | 0, w = 12 + (r() * 40 | 0); g.fillStyle = ['#ff3b6b', '#3bf0ff', '#ffffff', '#a58bff'][r() * 4 | 0]; g.globalAlpha = 0.5 + r() * 0.5; wrapDot(g, s, x, y, w, hh); } }],
    dust: ['먼지 · 반딧불', (g, s, r) => { g.fillStyle = '#ffe9a8'; for (let i = 0; i < 9; i++) { g.globalAlpha = 0.4 + r() * 0.6; wrapDot(g, s, r() * s | 0, r() * s | 0, 1, 1); } }]
  };
  const texPath = k => `assets/filters/${k}.png`;
  async function makeTex(k, force) {
    const rel = texPath(k);
    try { if (!force && await pdm.exists(store.abs(rel))) return rel; } catch (_) { /* 만들기 */ }
    const s = 64, cv = h('canvas', { width: s, height: s }), g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    TEX[k][1](g, s, rng(k.length * 7919 + k.charCodeAt(0)));
    await pdm.writeDataURL(store.abs(rel), cv.toDataURL('image/png'));
    PDM.assets.invalidate(rel); delete imgCache[rel];
    return rel;
  }

  // ---------------- 코드 층 굽기: JS(캔버스) · CSS → PNG (여러 프레임이면 시트)
  const loadUrl = url => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('그림으로 바꾸지 못했습니다 (코드를 확인하세요)')); i.src = url; });
  const escXml = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  async function codeFrame(l, w, hh, f, n) {
    const cv = h('canvas', { width: w, height: hh }), g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    if (l.lang === 'css') {
      const sec = f / Math.max(1, num(l.fps, 8));
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hh}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${hh}px;position:relative;overflow:hidden"><style>.fx{position:absolute;left:0;top:0;width:${w}px;height:${hh}px;overflow:hidden}\n${escXml(l.code || '')}\n*,*::before,*::after{animation-play-state:paused!important;animation-delay:${-sec}s!important}</style><div class="fx"></div></div></foreignObject></svg>`;
      g.drawImage(await loadUrl('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)), 0, 0);
    } else {
      const fn = new Function('g', 'w', 'h', 't', 'frame', 'frames', 'rand', l.code || '');
      g.save(); fn(g, w, hh, f / n, f, n, rng(num(l.seed, 1) * 9973 + 17)); g.restore();
    }
    return cv;
  }
  /** 코드 층을 구워 l.png 에 저장하고 { fw, frames } 를 돌려줌 (l.png 가 비어 있으면 실패) */
  const MAXF = 120;
  const apngPath = png => String(png).replace(/\.png$/i, '') + '_anim.png';
  const bytesUrl = bytes => { let bin = ''; const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes); for (let k = 0; k < u.length; k += 8192) bin += String.fromCharCode.apply(null, u.subarray(k, k + 8192)); return 'data:image/png;base64,' + btoa(bin); };
  async function codeFrames(l) {
    const w = PDM.clamp(num(l.w, 160) | 0, 8, 512), hh = PDM.clamp(num(l.h, 96) | 0, 8, 512), n = PDM.clamp(num(l.frames, 1) | 0, 1, MAXF), out = [];
    for (let f = 0; f < n; f++) { out.push(await codeFrame(l, w, hh, f, n)); if (f % 8 === 7) await new Promise(r => setTimeout(r, 0)); }
    return { frames: out, w, h: hh, n };
  }
  /** 코드 층을 구워 l.png(게임용 격자 시트)에 저장. 여러 프레임이면 옆에 APNG(<이름>_anim.png — 미리 보기 · 공유용)도 저장. { fw, frames, apng } 를 돌려줌 */
  async function bake(l) {
    if (!l.png) throw new Error('저장할 경로가 없습니다');
    const { frames, w, h: hh, n } = await codeFrames(l);
    // 격자 시트: 한 변이 2048 을 넘지 않게 (런타임은 가로 칸 수 = 시트 너비 ÷ 한 칸 가로 로 읽음)
    const cols = Math.max(1, Math.min(n, Math.floor(2048 / w))), rows = Math.ceil(n / cols);
    if (rows * hh > 4096) throw new Error(`시트가 너무 큽니다 (${cols * w}×${rows * hh}px) — 그림 크기나 프레임 수를 줄이세요`);
    const sheet = h('canvas', { width: w * cols, height: hh * rows }), sg = sheet.getContext('2d');
    frames.forEach((f, i) => sg.drawImage(f, (i % cols) * w, Math.floor(i / cols) * hh));
    await pdm.writeDataURL(store.abs(l.png), sheet.toDataURL('image/png'));
    PDM.assets.invalidate(l.png); delete imgCache[l.png];
    let apng = '';
    if (n > 1 && PDM.textfx && PDM.textfx.encodeApng) { try { apng = apngPath(l.png); await pdm.writeDataURL(store.abs(apng), bytesUrl(await PDM.textfx.encodeApng(frames, Math.max(1, num(l.fps, 8)), 0))); } catch (e) { apng = ''; PDM.log && PDM.log('APNG 저장 실패: ' + (e.message || e), 'warn'); } }
    return { fw: n > 1 ? w : 0, frames: n, apng };
  }
  /** 코드 층을 APNG 파일로 내보내기 (프로젝트 밖 아무 곳에나) */
  async function exportApng(l, name) {
    if (!PDM.textfx || !PDM.textfx.encodeApng) throw new Error('APNG 만들기 기능을 찾지 못했습니다');
    const { frames } = await codeFrames(l), url = bytesUrl(await PDM.textfx.encodeApng(frames, Math.max(1, num(l.fps, 8)), 0));
    try { const out = await pdm.saveFile('APNG 로 내보내기', name, ['png']); if (!out) return null; await pdm.writeDataURL(out, url); return out; }
    catch (_) { const a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove(); return name; }   // 웹 모드: 내려받기
  }

  // ---------------- 새 필터 · 예시
  const L = {
    tint: (color, alpha, o) => Object.assign({ type: 'tint', on: true, color, alpha, blend: 'normal', pulse: 0, pulseSec: 2 }, o),
    image: (tex, alpha, o) => Object.assign({ type: 'image', on: true, png: tex ? texPath(tex) : '', alpha, blend: 'normal', scale: 1, vx: 0, vy: 0, jitter: 0, fw: 0, frames: 1, fps: 8 }, o),
    vignette: (color, alpha, size, soft, o) => Object.assign({ type: 'vignette', on: true, color, alpha, size, soft, pulse: 0, pulseSec: 2 }, o),
    code: (lang, code, o) => Object.assign({ type: 'code', on: true, lang, code, w: 160, h: 96, frames: 1, fps: 8, fit: 'stretch', png: '', alpha: 100, blend: 'normal', scale: 1, vx: 0, vy: 0, jitter: 0, fw: 0 }, o),
    letterbox: (size, o) => Object.assign({ type: 'letterbox', on: true, color: '#000000', alpha: 100, size, side: 'tb' }, o),
    flash: (color, alpha, every, dur) => ({ type: 'flash', on: true, color, alpha, every, dur }),
    shake: (power, every, time) => ({ type: 'shake', on: true, power, every, time })
  };
  // ---------------- 코드 층: 예시 코드
  const CODE = {
    crack: `// 깨진 화면 — g: 캔버스 2D, w·h: 크기, t: 0~1(한 바퀴), frame, frames, rand(): 씨앗 난수(프레임마다 같은 순서)
const cx = w * 0.62, cy = h * 0.4;            // 금이 시작되는 곳
g.strokeStyle = 'rgba(235,245,255,0.9)'; g.lineWidth = 1;
for (let i = 0; i < 13; i++) {                // 방사형 금
  let a = i / 13 * Math.PI * 2 + rand() * 0.4, x = cx, y = cy;
  g.beginPath(); g.moveTo(x, y);
  for (let k = 0; k < 9; k++) { a += (rand() - 0.5) * 0.5; const d = 6 + rand() * 14; x += Math.cos(a) * d; y += Math.sin(a) * d; g.lineTo(x, y); }
  g.stroke();
}
g.strokeStyle = 'rgba(235,245,255,0.5)';
for (let r = 10; r < 60; r += 9 + rand() * 8) {  // 거미줄처럼 잇는 금
  g.beginPath();
  for (let i = 0; i <= 13; i++) { const a = i / 13 * Math.PI * 2, d = r * (0.8 + rand() * 0.4); g.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d); }
  g.stroke();
}
g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(cx - 1, cy - 1, 3, 3);`,
    scanbar: `/* CSS 로 그리기 — .fx 가 화면 전체입니다 (::before · ::after 도 쓸 수 있음). 애니메이션은 프레임 수만큼 구워집니다 */
.fx { background: radial-gradient(ellipse at center, transparent 40%, rgba(0, 0, 0, 0.8) 100%); }
.fx::before { content: ''; position: absolute; left: 0; right: 0; height: 18%;
  background: linear-gradient(transparent, rgba(120, 255, 200, 0.28), transparent);
  animation: bar 1s linear infinite; }
@keyframes bar { from { top: -18%; } to { top: 100%; } }`,
    tear: `// 화면 찢김 (글리치) — 프레임마다 다른 띠: Math.random() 은 프레임마다 달라집니다
for (let i = 0; i < 6; i++) {
  const y = Math.random() * h | 0, hh = 1 + (Math.random() * 6 | 0), x = (Math.random() - 0.5) * w * 0.6;
  g.fillStyle = ['rgba(255,60,110,.55)', 'rgba(60,240,255,.55)', 'rgba(255,255,255,.35)', 'rgba(0,0,0,.7)'][Math.random() * 4 | 0];
  g.fillRect(x, y, w, hh);
}`
  };
  const PRESETS = {
    blank: { name: '빈 필터', layers: () => [] },
    rain: { name: '날씨: 비', layers: () => [L.tint('#1c2a4a', 28), L.image('rain', 65, { vx: -45, vy: 190 })] },
    storm: { name: '날씨: 폭풍우 (비 + 번개 + 흔들림)', layers: () => [L.tint('#101a33', 40), L.image('rain', 80, { vx: -90, vy: 260 }), L.flash('#dfe8ff', 55, 7, 0.25), L.shake(1, 9, 0.25)] },
    snow: { name: '날씨: 눈', layers: () => [L.tint('#c8d8f0', 12), L.image('snow', 80, { vx: 8, vy: 28 }), L.image('snow', 45, { vx: -5, vy: 16, scale: 2 })] },
    fog: { name: '날씨: 안개', layers: () => [L.image('fog', 45, { vx: 6, vy: 1, scale: 3 }), L.tint('#b8c2cc', 12)] },
    night: { name: '시간: 밤', layers: () => [L.tint('#0a1030', 45), L.image('dust', 55, { vx: 3, vy: -4, blend: 'add' })] },
    sunset: { name: '시간: 노을', layers: () => [L.tint('#ff7a3a', 20, { blend: 'add' }), L.tint('#402060', 15)] },
    noise: { name: '화면: 노이즈 (지지직)', layers: () => [L.image('noise', 22, { jitter: 18 })] },
    crt: { name: '화면: 주사선 (옛날 모니터)', layers: () => [L.image('scan', 28), L.tint('#30ff90', 6, { blend: 'add', pulse: 60, pulseSec: 0.2 })] },
    glitch: { name: '화면: 글리치', layers: () => [L.image('glitch', 55, { jitter: 9, blend: 'add' }), L.image('noise', 12, { jitter: 20 }), L.flash('#ff3b6b', 18, 3, 0.08), L.shake(1, 4, 0.12)] },
    cinema: { name: '연출: 레터박스 (영화 화면)', inType: 'slide', inSec: 0.6, outType: 'slide', outSec: 0.6, overUI: true, layers: () => [L.letterbox(12)] },
    cinemaDark: { name: '연출: 레터박스 + 어둡게 (디졸브)', inType: 'dissolve', inSec: 0.8, outType: 'dissolve', outSec: 0.8, layers: () => [L.tint('#000000', 35), L.letterbox(14)] },
    danger: { name: '분위기: 위험 (붉게 깜빡임)', layers: () => [L.vignette('#c01020', 70, 35, 60, { pulse: 80, pulseSec: 1.4 })] },
    vignette: { name: '조리개: 가장자리 어둡게', layers: () => [L.vignette('#000000', 80, 45, 55)] },
    tunnel: { name: '조리개: 좁은 시야 (동굴 · 어둠)', layers: () => [L.vignette('#000000', 100, 18, 30)] },
    crack: { name: '화면: 깨진 유리 (코드)', layers: () => [L.code('js', CODE.crack, { alpha: 90 }), L.vignette('#000000', 45, 50, 50)] },
    tear: { name: '화면: 찢김 글리치 (코드 · 8프레임)', layers: () => [L.code('js', CODE.tear, { frames: 8, fps: 12, blend: 'add', alpha: 80 }), L.shake(1, 5, 0.1)] },
    cssbar: { name: '화면: 훑는 빛 + 조리개 (CSS 코드)', layers: () => [L.code('css', CODE.scanbar, { frames: 12, fps: 12 })] }
  };
  function make(id, preset) {
    const p = PRESETS[preset] || PRESETS.blank, layers = p.layers();
    layers.forEach((l, i) => { if (l.type === 'code') { l.png = `assets/filters/${id}_${i + 1}_code.png`; bake(l).catch(e => PDM.log && PDM.log('필터 코드 굽기 실패: ' + (e.message || e), 'err')); } });
    layers.forEach(l => { if (l.type === 'image' && l.png) { const k = Object.keys(TEX).find(t => texPath(t) === l.png); if (k) makeTex(k).catch(() => { }); } });
    return { id, name: preset && preset !== 'blank' ? p.name.replace(/^[^:]+:\s*/, '').replace(/\s*\(.*$/, '') : id, overUI: !!p.overUI, inType: p.inType || 'fade', inSec: p.inSec ?? 0.5, outType: p.outType || 'fade', outSec: p.outSec ?? 0.5, layers };
  }
  const ops = PDM.listOps({ K, label: '화면 필터', title: '화면 필터', icon: '🌧', prefix: 'filter', make, presets: Object.fromEntries(Object.entries(PRESETS).map(([k, v]) => [k, v.name])), fields: ['filter'], cmdType: 'filter', cmdKey: 'id',
    clean: c => (c.layers || []).forEach(l => { if (l.type === 'code') l.png = ''; }) });   // 복제본의 코드 층은 제 그림 파일을 새로 구움

  // ---------------- 미리보기 (런타임과 같은 계산)
  const imgCache = {};
  const loadImg = png => { if (!png) return null; const c = imgCache[png]; if (c !== undefined) return c; imgCache[png] = null; PDM.assets.load(png).then(im => { imgCache[png] = im || null; }).catch(() => { }); return null; };
  const frameCv = document.createElement('canvas');
  /** 디졸브 점 무늬 (런타임 MakerFilter.dither 와 같은 무늬): 색 c, 찬 정도 k(0~1) */
  const dithers = {};
  function ditherFill(g, c, k) {
    const lv = PDM.clamp(Math.round(k * 16), 0, 16), key = c + lv;
    if (!dithers[key]) { const n = 32, cv = document.createElement('canvas'); cv.width = cv.height = n; const t = cv.getContext('2d'); t.fillStyle = c;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { let hs = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0; hs = Math.imul(hs ^ (hs >>> 13), 1274126177); hs = (hs ^ (hs >>> 16)) & 255; if (hs * 16 < lv * 256) t.fillRect(x, y, 1, 1); }
      dithers[key] = cv; }
    return g.createPattern(dithers[key], 'repeat');
  }
  function preview(cv, getF, getOpt) {
    const g = cv.getContext('2d'); let last = performance.now(), T = 0, raf = 0; const stt = new Map();
    let tiles = null; PDM.assets.themeTiles('SEWER').then(t => { tiles = t; }).catch(() => { });
    const scene = (W, H, o) => {   // 게임 화면 흉내: 바닥 · 벽 · 캐릭터
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      const cols = Math.ceil(W / 16), rows = Math.ceil(H / 16);
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { const wall = y < 2 || x === 0 || x === cols - 1 || y === rows - 1 || (x === 7 && y > 4);
        if (tiles) PDM.assets.drawTerrain(g, tiles, wall ? 4 : (x * 7 + y * 13) % 11 === 0 ? 2 : 1, x * 16, y * 16, 16); else { g.fillStyle = wall ? '#3a3640' : '#57534e'; g.fillRect(x * 16, y * 16, 16, 16); } }
      g.fillStyle = '#c0392b'; g.fillRect(W / 2 - 4, H / 2 - 2, 8, 10); g.fillStyle = '#f1c9a5'; g.fillRect(W / 2 - 3, H / 2 - 8, 6, 6);
    };
    const ui = W => { g.fillStyle = 'rgba(40,36,48,.92)'; g.fillRect(0, 0, 70, 14); g.fillStyle = '#c0392b'; g.fillRect(16, 3, 44, 3); g.fillStyle = '#e6b95c'; g.fillRect(16, 8, 30, 2); g.fillStyle = 'rgba(40,36,48,.92)'; g.fillRect(W - 40, 0, 40, 12); };
    const frame = now => {
      raf = requestAnimationFrame(frame);
      if (!cv.isConnected) { cancelAnimationFrame(raf); return; }
      if (!cv.offsetParent) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now; T += dt;
      const f = getF(), o = getOpt(), Z = o.zoom || 2, W = cv.width / Z, H = cv.height / Z;
      g.setTransform(Z, 0, 0, Z, 0, 0); g.imageSmoothingEnabled = false; g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      let sx = 0, sy = 0;
      const layers = f ? (f.layers || []).filter(l => l.on !== false) : [];
      layers.forEach((l, i) => { if (l.type !== 'shake') return; const s = stt.get(i) || { next: num(l.every, 4), left: 0 }; stt.set(i, s);
        if (s.left > 0) { s.left -= dt; sx += (Math.random() * 2 - 1) * num(l.power, 1); sy += (Math.random() * 2 - 1) * num(l.power, 1); }
        else if ((s.next -= dt) <= 0) { s.next = num(l.every, 4) * (0.5 + Math.random()); s.left = num(l.time, 0.2); } });
      g.save(); g.translate(Math.round(sx), Math.round(sy)); scene(W, H, o); g.restore();
      const over = f && f.overUI;
      if (!over) { /* 필터 뒤에 UI */ }
      // 나타남 · 사라짐 미리보기: (없음) → 나타남 → 잠깐 보임 → 사라짐 → 원래대로
      let KK = 1, MODE = 'fade';
      if (o.demo != null && f) { const inS = f.inType === 'none' ? 0 : Math.max(0, num(f.inSec, 0.5)), outS = f.outType === 'none' ? 0 : Math.max(0, num(f.outSec, 0.5)); let t = (now - o.demo) / 1000 - 0.4;
        if (t < 0) KK = 0; else if (t < inS) { KK = t / inS; MODE = f.inType || 'fade'; } else if ((t -= inS) < 1.2) KK = 1; else if ((t -= 1.2) < outS) { KK = 1 - t / outS; MODE = f.outType || 'fade'; } else if (t - outS < 0.5) KK = 0; else o.demo = null; }
      const drawLayers = () => layers.forEach((l, i) => {
        const solid = l.type === 'tint' || l.type === 'letterbox', dis = MODE === 'dissolve' && solid, ka = dis || (MODE === 'slide' && l.type === 'letterbox') ? 1 : KK;
        if (KK <= 0) return;
        if (l.type === 'shake' ) return;
        if (l.type === 'letterbox') { const sz = PDM.clamp(num(l.size, 12), 0, 50) / 100 * (MODE === 'slide' ? KK : 1), lr = l.side === 'lr', c = /^#[0-9a-f]{6}$/i.test(l.color || '') ? l.color : '#000000';
          g.globalCompositeOperation = 'source-over'; g.globalAlpha = Math.max(0, Math.min(1, num(l.alpha, 100) / 100)) * ka; g.fillStyle = dis ? ditherFill(g, c, KK) : c;
          if (lr) { g.fillRect(0, 0, W * sz, H); g.fillRect(W - W * sz, 0, W * sz, H); } else { g.fillRect(0, 0, W, H * sz); g.fillRect(0, H - H * sz, W, H * sz); } return; }
        g.globalCompositeOperation = l.blend === 'add' || l.type === 'flash' ? 'lighter' : 'source-over';
        if (l.type === 'tint') { const p = num(l.pulse, 0) / 100; g.globalAlpha = ka * Math.max(0, Math.min(1, num(l.alpha, 30) / 100 * (1 - p * (0.5 + 0.5 * Math.sin(T * 6.2832 / Math.max(0.1, num(l.pulseSec, 2))))))); g.fillStyle = dis ? ditherFill(g, /^#[0-9a-f]{6}$/i.test(l.color || '') ? l.color : '#000000', KK) : (l.color || '#000'); g.fillRect(0, 0, W, H); }
        else if (l.type === 'flash') { const s = stt.get(i) || { next: num(l.every, 6) * 0.5, left: 0 }; stt.set(i, s); const dur = Math.max(0.02, num(l.dur, 0.15));
          if (s.left > 0) { s.left -= dt; g.globalAlpha = ka * Math.max(0, num(l.alpha, 60) / 100 * s.left / dur); g.fillStyle = l.color || '#fff'; g.fillRect(0, 0, W, H); }
          else if ((s.next -= dt) <= 0) { s.next = Math.max(0.05, num(l.every, 6)) * (0.5 + Math.random()); s.left = dur; } }
        else if (l.type === 'vignette') { const p = num(l.pulse, 0) / 100, a = Math.max(0, Math.min(1, num(l.alpha, 80) / 100 * (1 - p * (0.5 + 0.5 * Math.sin(T * 6.2832 / Math.max(0.1, num(l.pulseSec, 2)))))));
          const c = /^#[0-9a-f]{6}$/i.test(l.color || '') ? l.color : '#000000', r0 = PDM.clamp(num(l.size, 45), 0, 100) / 100, r1 = Math.min(1.5, r0 + Math.max(0.01, num(l.soft, 55) / 100));
          g.save(); g.translate(W / 2, H / 2); g.scale(W / 2 * 1.4143, H / 2 * 1.4143);   // 타원: 모서리에서 반지름 1
          const gr = g.createRadialGradient(0, 0, r0, 0, 0, r1); gr.addColorStop(0, c + '00'); gr.addColorStop(1, c); g.globalAlpha = ka * a; g.fillStyle = gr; g.fillRect(-1, -1, 2, 2); g.restore(); }
        else if (l.type === 'image' || l.type === 'code') { const im = loadImg(l.png); if (!im) return;
          const n = Math.max(1, num(l.frames, 1) | 0), fw = n > 1 && num(l.fw, 0) > 0 ? Math.min(l.fw, im.width) : im.width, cols = Math.max(1, Math.floor(im.width / fw)), fh = n > 1 && num(l.fw, 0) > 0 ? Math.max(1, Math.floor(im.height / Math.ceil(n / cols))) : im.height;
          const s = stt.get(i) || { ox: 0, oy: 0, jt: 0 }; stt.set(i, s);
          s.ox += num(l.vx, 0) * dt; s.oy += num(l.vy, 0) * dt;
          if (num(l.jitter, 0) > 0 && (s.jt -= dt) <= 0) { s.jt = 1 / l.jitter; s.ox = Math.random() * 256; s.oy = Math.random() * 256; }
          const fr = n > 1 ? Math.floor(T * Math.max(1, num(l.fps, 8))) % n : 0, sc = Math.max(0.1, num(l.scale, 1));
          let src = im; if (n > 1 || fw !== im.width) { frameCv.width = fw; frameCv.height = fh; const t = frameCv.getContext('2d'); t.clearRect(0, 0, fw, fh); t.drawImage(im, (fr % cols) * fw, Math.floor(fr / cols) * fh, fw, fh, 0, 0, fw, fh); src = frameCv; }
          if ((l.fit || (l.type === 'code' ? 'stretch' : 'tile')) === 'stretch') { g.globalAlpha = ka * Math.max(0, Math.min(1, num(l.alpha, 50) / 100)); g.drawImage(src, 0, 0, fw, fh, 0, 0, W, H); return; }
          const tw = fw * sc, th = fh * sc, x0 = ((s.ox % tw) + tw) % tw - tw, y0 = ((s.oy % th) + th) % th - th;
          g.globalAlpha = ka * Math.max(0, Math.min(1, num(l.alpha, 50) / 100));
          for (let y = y0; y < H; y += th) for (let x = x0; x < W; x += tw) g.drawImage(src, Math.round(x), Math.round(y), tw, th); }
      });
      if (over) { ui(W); drawLayers(); } else { drawLayers(); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; ui(W); }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    };
    raf = requestAnimationFrame(frame);
  }
  const isPot = n => n > 0 && (n & (n - 1)) === 0;

  PDM.filters = { K, make, PRESETS, TEX, makeTex, ops, list, bake, exportApng, CODE,
    invalidate(png) { if (png) delete imgCache[png]; else Object.keys(imgCache).forEach(k => delete imgCache[k]); },
    /** 속성 창에 넣는 "화면 필터" 고르기 칸 (확장 기능이 꺼져 있고 값도 없으면 안 보임) */
    field(key, path, label, empty, o = {}) { const cur = PDM.deepGet ? PDM.deepGet(store.get(key), path) : null;
      if (!(PDM.extensions && PDM.extensions.on(K)) && !cur) return o.always ? PDM.ui.field(o.always === 'bare' ? '' : label || '화면 필터', h('span', { class: 'hint' }, '화면 필터 확장 기능이 꺼져 있습니다 — ', h('a', { href: '#', onclick: e => { e.preventDefault(); store.edit('project', '확장 기능 켜기: 화면 필터', p => { p.extensions = Object.assign({}, p.extensions || {}, { [K]: true }); }); PDM.tabs.refresh && PDM.tabs.refresh(); } }, '켜기'))) : null;
      return PDM.ui.F.ref(key, path, 'filter', { label: label || '화면 필터', empty: empty || '(없음)' }); } };

  const TRANS = { fade: '페이드 (서서히)', dissolve: '디졸브 (점으로 흩어짐)', slide: '슬라이드 (레터박스 띠가 밀려옴)', none: '없음 (바로)' };
  const TYPES = { tint: '색 덮기', letterbox: '레터박스 (위아래 띠)', vignette: '조리개 (가장자리 어둡게)', image: '그림 깔기 (흐르는 무늬)', code: '코드로 그리기 (JS · CSS)', flash: '번쩍임', shake: '화면 흔들림' };

  PDM.registerEditor({
    id: K, icon: '🌧', title: () => '화면 필터',
    match: k => k === K,
    tree: () => store.isOpen ? [ops.treeNode(56)] : [],
    render(key, ctx) {
      const { F, section, row } = PDM.ui;
      const st = ctx.state = ctx.state || { zoom: 2 };
      const all = list();
      ops.take(st);
      if (!all.some(x => x.id === st.id)) st.id = (all[0] || {}).id;
      const idx = all.findIndex(x => x.id === st.id), f = all[idx];
      const intro = h('p', { class: 'hint' }, '화면 전체에 덮는 연출을 층(레이어)으로 쌓아 만듭니다 — 날씨(비 · 눈 · 안개), 밤 · 노을, 노이즈 · 주사선 · 글리치, 번개 등. 쓰는 곳: ① 맵 편집기 속성의 "화면 필터"(맵 노드 · 방 템플릿) ② 맵 그래프의 그룹 속성 ③ 이벤트 명령 "화면 필터". 여러 곳에 정했으면 이벤트 → 방 → 맵 → 그룹 순서로 앞의 것이 보입니다.');
      const head = h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '8px' } },
        all.map(x => h('button', { class: 'btn sm' + (x.id === st.id ? ' pri' : ''), onclick: () => { st.id = x.id; ctx.refresh(); } }, x.name || x.id)));
      if (!f) return h('div', { class: 'editor' }, h('h2', {}, '🌧 화면 필터'), intro, ops.bar(null),
        h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } }, Object.entries(PRESETS).map(([k, v]) => h('button', { class: 'btn', onclick: () => ops.add(k) }, v.name))));
      const lp = i => ['list', idx, 'layers', i];
      const edit = (label, fn) => store.edit(K, label, r => fn(r.list[idx]));
      const cv = h('canvas', { width: 480, height: 288, style: { imageRendering: 'pixelated', border: '1px solid var(--line)', borderRadius: '6px', display: 'block' } });
      preview(cv, () => ((store.get(K) || {}).list || [])[idx], () => st);
      const colorF = (path, cur) => { const c = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(cur || '') ? cur : '#000000', style: { width: '56px', padding: 0 } }); c.addEventListener('change', () => PDM.ui.commit(K, path, c.value, '필터 색')); return PDM.ui.field('색', c); };
      const imgBox = (l, i) => {
        const setPng = (png, extra) => edit('필터 그림', x => { Object.assign(x.layers[i], { png }, extra || {}); });
        const txt = h('input', { type: 'text', value: l.png || '', placeholder: 'assets/… (64×64 처럼 2의 거듭제곱 크기 권장)', style: { flex: 1, minWidth: '160px' } });
        txt.addEventListener('change', () => setPng(txt.value.trim()));
        const warn = h('div', { class: 'hint', style: { color: 'var(--gold)' } });
        if (l.png) PDM.assets.load(l.png).then(im => { if (!im) { warn.textContent = '그림을 찾을 수 없습니다.'; return; } const n = Math.max(1, num(l.frames, 1) | 0), fw = n > 1 && num(l.fw, 0) > 0 ? l.fw : im.width, cols = Math.max(1, Math.floor(im.width / fw)), fh = n > 1 ? Math.floor(im.height / Math.ceil(n / cols)) : im.height;
          if (!isPot(fw) || !isPot(fh)) warn.textContent = `한 칸이 ${fw}×${fh} — 16 · 32 · 64 · 128 처럼 2의 거듭제곱 크기가 아니면 일부 기기(모바일)에서 반복이 깨질 수 있습니다.`; }).catch(() => { });
        return h('div', {},
          h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' } }, txt,
            h('button', { class: 'btn sm', onclick: async () => { const r = await PDM.ui.pickImage('filters'); if (r) { delete imgCache[r]; setPng(r, { fw: 0, frames: 1 }); } } }, '찾기…'),
            h('button', { class: 'btn sm', onclick: async () => { const rel = l.png && !l.png.startsWith('game:') ? l.png : `assets/filters/${f.id}_${i + 1}.png`; const out = await PDM.editPixelsModal('필터 그림 — ' + f.name, rel, 64, 64); if (out) { delete imgCache[out]; PDM.assets.invalidate(out); setPng(out); } } }, l.png ? '그림 편집…' : '직접 그리기…'),
            PDM.compose && PDM.compose.forFilter ? h('button', { class: 'btn sm', title: '노드 합성기에서 이 층의 그림(무늬 · 노이즈 · 움직이는 시트)을 만들거나 고칩니다. 합성기에서 저장하면 바로 반영됩니다', onclick: () => PDM.compose.forFilter(f, i) }, '🧩 노드 합성기로…') : null),
          h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center', margin: '6px 0' } }, h('span', { class: 'hint' }, '기본 그림:'),
            Object.entries(TEX).map(([k, v]) => h('button', { class: 'btn xs', onclick: async () => { try { setPng(await makeTex(k), { fw: 0, frames: 1 }); } catch (er) { toast(er.message, 'bad'); } } }, v[0]))),
          warn,
          row(F.num(K, [...lp(i), 'alpha'], { label: '진하기 (0~100)', min: 0, max: 100, def: 50 }), F.select(K, [...lp(i), 'blend'], { normal: '보통', add: '더하기 (밝게)' }, { label: '겹치는 방식' }), F.num(K, [...lp(i), 'scale'], { label: '배율', min: 0.25, max: 16, step: 0.25, def: 1 })),
          row(F.select(K, [...lp(i), 'fit'], { tile: '반복해서 깔기', stretch: '화면에 맞게 늘리기 (한 장)' }, { label: '놓는 방식', def: l.type === 'code' ? 'stretch' : 'tile', rerender: true })),
          (l.fit || (l.type === 'code' ? 'stretch' : 'tile')) === 'stretch' ? null : row(F.num(K, [...lp(i), 'vx'], { label: '흐름 → (px/초)', def: 0 }), F.num(K, [...lp(i), 'vy'], { label: '흐름 ↓ (px/초)', def: 0 }), F.num(K, [...lp(i), 'jitter'], { label: '튐 (초당 횟수 · 노이즈/글리치)', min: 0, max: 60, def: 0 })),
          l.type === 'code' ? null : row(F.num(K, [...lp(i), 'frames'], { label: '프레임 수 (시트)', int: true, min: 1, max: 64, def: 1, rerender: true }), F.num(K, [...lp(i), 'fw'], { label: '한 칸 가로 (px)', int: true, min: 0, def: 0 }), F.num(K, [...lp(i), 'fps'], { label: '초당 프레임', int: true, min: 1, max: 60, def: 8 })));
      };
      const codeBox = (l, i) => {
        const msg = h('div', { class: 'hint' }, l.png ? '구운 그림: ' + l.png : '');
        const run = async () => { const cur = ((store.get(K) || {}).list || [])[idx].layers[i], rel = cur.png || `assets/filters/${f.id}_${i + 1}_code.png`;
          try { const r = await bake(Object.assign({}, cur, { png: rel })); store.edit(K, '코드 층 굽기', x => { Object.assign(x.list[idx].layers[i], { png: rel, fw: r.fw }); }, { silent: true }); msg.style.color = ''; msg.textContent = `구웠습니다: ${rel}` + (r.frames > 1 ? ` (${r.frames}프레임 시트)` : '') + (r.apng ? ` · APNG ${r.apng}` : ''); }
          catch (er) { msg.style.color = 'var(--bad)'; msg.textContent = '오류: ' + (er.message || er); } };
        const ta = h('textarea', { rows: 12, class: 'mono', spellcheck: false, style: { width: '100%', whiteSpace: 'pre', fontSize: '12px' } }); ta.value = l.code || '';
        ta.addEventListener('change', () => { store.edit(K, '필터 코드', x => { x.list[idx].layers[i].code = ta.value; }, { silent: true }); run(); });
        ta.addEventListener('keydown', e => { if (e.key === 'Tab') { e.preventDefault(); const s0 = ta.selectionStart; ta.setRangeText('  ', s0, ta.selectionEnd, 'end'); } e.stopPropagation(); });
        const reRun = () => setTimeout(run, 0);
        if (!l.png) reRun(); else pdm.exists(store.abs(l.png)).then(ok => { if (!ok) run(); }).catch(() => { });   // 아직 굽지 않은 층(복제 · 새로 추가)
        return h('div', {},
          row(F.select(K, [...lp(i), 'lang'], { js: 'JavaScript (캔버스에 그리기)', css: 'CSS (.fx 꾸미기)' }, { label: '코드 종류', rerender: true }),
            h('div', { class: 'field' }, h('span', { class: 'fl' }, '예시 코드 넣기'), h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } },
              [['crack', '깨진 화면', 'js'], ['tear', '찢김', 'js'], ['scanbar', '훑는 빛 (CSS)', 'css']].map(([k, n, lang]) => h('button', { class: 'btn xs', onclick: () => { store.edit(K, '예시 코드', x => { Object.assign(x.list[idx].layers[i], { lang, code: CODE[k] }); }); reRun(); } }, n))))),
          ta,
          h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', margin: '4px 0' } }, h('button', { class: 'btn sm pri', onclick: run }, '▶ 코드 적용 (그림으로 굽기)'),
            h('button', { class: 'btn sm', title: '움직이는 그림 한 장(APNG)으로 내보냅니다 — 미리 보기 · 공유용. 게임은 격자 시트를 씁니다', onclick: async () => { const cur = ((store.get(K) || {}).list || [])[idx].layers[i];
              try { const out = await exportApng(cur, `${f.id}_${i + 1}.png`); if (out) toast('APNG 로 내보냈습니다: ' + out, 'ok'); } catch (er) { toast('내보내기 실패: ' + (er.message || er), 'bad'); } } }, '⤓ APNG 로 내보내기'), msg),
          h('div', { class: 'hint' }, l.lang === 'css' ? 'CSS: 화면 전체가 .fx 요소입니다. background · gradient · box-shadow · ::before/::after · @keyframes 애니메이션을 쓸 수 있습니다. 바깥 그림(url)과 글꼴은 쓸 수 없습니다. 애니메이션은 "프레임 수 ÷ 초당 프레임" 초 길이로 구워지므로 그 길이에 맞춰 반복되게 만드세요.'
            : 'JS: 이 코드가 프레임마다 한 번 실행됩니다. 쓸 수 있는 값 — g(캔버스 2D), w, h, t(0~1 한 바퀴), frame, frames, rand()(씨앗 난수: 프레임마다 같은 순서 → 움직이지 않는 무늬), Math.random()(프레임마다 다름).'),
          h('div', { class: 'hint', style: { marginBottom: '6px' } }, '코드는 편집기에서 그림(격자 시트 PNG)으로 구워져 게임에 들어갑니다 — 게임 안에서 코드가 실행되는 것은 아닙니다. 여러 프레임이면 같은 폴더에 APNG(…_anim.png)도 함께 저장됩니다 (미리 보기 · 공유용). 코드를 고친 뒤 칸 밖을 누르면 자동으로 다시 굽습니다.'),
          row(F.num(K, [...lp(i), 'w'], { label: '그림 가로 (px)', int: true, min: 8, max: 512, def: 160, onchange: reRun }), F.num(K, [...lp(i), 'h'], { label: '그림 세로 (px)', int: true, min: 8, max: 512, def: 96, onchange: reRun }),
            F.num(K, [...lp(i), 'frames'], { label: `프레임 수 (1~${MAXF})`, int: true, min: 1, max: MAXF, def: 1, onchange: reRun }), F.num(K, [...lp(i), 'fps'], { label: '초당 프레임', int: true, min: 1, max: 60, def: 8, onchange: reRun })),
          row(F.num(K, [...lp(i), 'alpha'], { label: '진하기 (0~100)', min: 0, max: 100, def: 100 }), F.select(K, [...lp(i), 'blend'], { normal: '보통', add: '더하기 (밝게)' }, { label: '겹치는 방식' }),
            F.select(K, [...lp(i), 'fit'], { stretch: '화면에 맞게 늘리기', tile: '반복해서 깔기' }, { label: '놓는 방식', def: 'stretch', rerender: true })),
          (l.fit || 'stretch') === 'tile' ? row(F.num(K, [...lp(i), 'scale'], { label: '배율', min: 0.25, max: 16, step: 0.25, def: 1 }), F.num(K, [...lp(i), 'vx'], { label: '흐름 → (px/초)', def: 0 }), F.num(K, [...lp(i), 'vy'], { label: '흐름 ↓ (px/초)', def: 0 }), F.num(K, [...lp(i), 'jitter'], { label: '튐 (초당)', min: 0, max: 60, def: 0 })) : null);
      };
      const layerEl = (l, i) => {
        const on = h('input', { type: 'checkbox', checked: l.on !== false, onchange: () => edit('층 켜기', x => { x.layers[i].on = on.checked; }) });
        const body = l.type === 'tint' ? h('div', {},
            row(colorF([...lp(i), 'color'], l.color), F.num(K, [...lp(i), 'alpha'], { label: '진하기 (0~100)', min: 0, max: 100, def: 30 }), F.select(K, [...lp(i), 'blend'], { normal: '보통 (덮기)', add: '더하기 (밝게)' }, { label: '겹치는 방식' })),
            row(F.num(K, [...lp(i), 'pulse'], { label: '깜빡임 폭 (0~100 %)', min: 0, max: 100, def: 0 }), F.num(K, [...lp(i), 'pulseSec'], { label: '깜빡임 주기 (초)', min: 0.1, step: 0.1, def: 2 })))
          : l.type === 'image' ? imgBox(l, i)
          : l.type === 'code' ? codeBox(l, i)
          : l.type === 'letterbox' ? row(colorF([...lp(i), 'color'], l.color), F.num(K, [...lp(i), 'size'], { label: '띠 두께 (화면의 %)', min: 0, max: 50, def: 12 }), F.num(K, [...lp(i), 'alpha'], { label: '진하기 (0~100)', min: 0, max: 100, def: 100 }), F.select(K, [...lp(i), 'side'], { tb: '위 · 아래', lr: '왼쪽 · 오른쪽' }, { label: '띠 위치' }))
          : l.type === 'vignette' ? h('div', {},
            row(colorF([...lp(i), 'color'], l.color), F.num(K, [...lp(i), 'alpha'], { label: '진하기 (0~100)', min: 0, max: 100, def: 80 }), F.num(K, [...lp(i), 'size'], { label: '가운데 밝은 크기 (%)', min: 0, max: 100, def: 45 }), F.num(K, [...lp(i), 'soft'], { label: '번짐 (%)', min: 1, max: 100, def: 55 })),
            row(F.num(K, [...lp(i), 'pulse'], { label: '깜빡임 폭 (0~100 %)', min: 0, max: 100, def: 0 }), F.num(K, [...lp(i), 'pulseSec'], { label: '깜빡임 주기 (초)', min: 0.1, step: 0.1, def: 2 })))
          : l.type === 'flash' ? row(colorF([...lp(i), 'color'], l.color), F.num(K, [...lp(i), 'alpha'], { label: '밝기 (0~100)', min: 0, max: 100, def: 60 }), F.num(K, [...lp(i), 'every'], { label: '평균 간격 (초)', min: 0.05, step: 0.5, def: 6 }), F.num(K, [...lp(i), 'dur'], { label: '길이 (초)', min: 0.02, step: 0.05, def: 0.15 }))
          : row(F.num(K, [...lp(i), 'power'], { label: '세기 (px)', min: 0, max: 20, def: 1 }), F.num(K, [...lp(i), 'every'], { label: '평균 간격 (초)', min: 0.1, step: 0.5, def: 4 }), F.num(K, [...lp(i), 'time'], { label: '길이 (초)', min: 0.05, step: 0.05, def: 0.2 }));
        return h('div', { style: { border: '1px solid var(--line)', borderRadius: '8px', padding: '8px 10px', marginBottom: '8px', opacity: l.on === false ? 0.55 : 1 } },
          h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px' } }, h('label', { class: 'check', style: { flex: 1 } }, on, h('b', {}, `${i + 1}. ${TYPES[l.type] || l.type}`)),
            h('button', { class: 'ib', title: '아래 층으로 (먼저 그림)', disabled: i === 0, onclick: () => edit('층 순서', x => { [x.layers[i - 1], x.layers[i]] = [x.layers[i], x.layers[i - 1]]; }) }, '↑'),
            h('button', { class: 'ib', title: '위 층으로 (나중에 그림)', disabled: i === f.layers.length - 1, onclick: () => edit('층 순서', x => { [x.layers[i + 1], x.layers[i]] = [x.layers[i], x.layers[i + 1]]; }) }, '↓'),
            h('button', { class: 'ib', title: '복제', onclick: () => edit('층 복제', x => { x.layers.splice(i + 1, 0, PDM.clone(x.layers[i])); }) }, '⧉'),
            h('button', { class: 'ib', title: '삭제', onclick: () => edit('층 삭제', x => { x.layers.splice(i, 1); }) }, '✕')),
          body);
      };
      const addLayer = t => edit('층 추가', x => { x.layers = x.layers || []; x.layers.push(t === 'tint' ? L.tint('#102040', 30) : t === 'letterbox' ? L.letterbox(12) : t === 'vignette' ? L.vignette('#000000', 80, 45, 55) : t === 'code' ? L.code('js', CODE.crack, { png: `assets/filters/${x.id}_${x.layers.length + 1}_code.png` }) : t === 'image' ? L.image('', 50) : t === 'flash' ? L.flash('#ffffff', 60, 6, 0.15) : L.shake(1, 4, 0.2)); });
      const uses = []; store.keys().forEach(k => { const d = store.get(k); if (!d) return; if ((k.startsWith('node:') || k.startsWith('room:')) && d.filter === f.id) uses.push(`${k.startsWith('node:') ? '맵' : '방'} ${d.name || d.id}`); });
      ((store.get('world') || {}).groups || []).forEach(g => { if (g.filter === f.id) uses.push('그룹 ' + (g.name || g.id)); });
      return h('div', { class: 'editor' }, h('h2', {}, '🌧 화면 필터'), intro, head, ops.bar(f),
        h('div', { style: { display: 'flex', gap: '14px', alignItems: 'flex-start', flexWrap: 'wrap' } },
          h('div', { style: { flex: 'none' } }, cv,
            h('div', { class: 'hint', style: { marginTop: '4px', maxWidth: '480px' } }, '미리보기 (게임 화면 흉내). 왼쪽 위 · 오른쪽 위의 어두운 막대는 UI 자리입니다.'),
            h('div', { class: 'hint', style: { marginTop: '6px', maxWidth: '480px' } }, uses.length ? '쓰는 곳: ' + uses.join(' · ') : '아직 맵 · 방 · 그룹에 정해 두지 않았습니다 (이벤트 명령으로만 쓸 수도 있습니다).')),
          h('div', { style: { flex: 1, minWidth: '380px' } },
            row(F.text(K, ['list', idx, 'name'], { label: '이름', rerender: true }), F.bool(K, ['list', idx, 'overUI'], { label: 'UI(상태창 · 버튼) 위까지 덮기' })),
            row(F.select(K, ['list', idx, 'inType'], TRANS, { label: '나타날 때' }), F.num(K, ['list', idx, 'inSec'], { label: '걸리는 시간 (초)', min: 0, max: 30, step: 0.1, def: 0.5 }),
              F.select(K, ['list', idx, 'outType'], TRANS, { label: '사라질 때' }), F.num(K, ['list', idx, 'outSec'], { label: '걸리는 시간 (초)', min: 0, max: 30, step: 0.1, def: 0.5 })),
            h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', margin: '2px 0 4px' } }, h('button', { class: 'btn sm', onclick: () => { st.demo = performance.now(); } }, '▶ 나타남 · 사라짐 미리보기'),
              h('span', { class: 'hint' }, '필터가 바뀔 때(맵 · 방 이동, 이벤트 명령) 앞의 필터는 사라지고 새 필터가 나타납니다. 디졸브는 색 덮기 · 레터박스에, 슬라이드는 레터박스에 적용되고 나머지 층은 페이드됩니다.')),
            h('div', { class: 'fl', style: { margin: '8px 0 4px' } }, '층 (위에서부터 차례로 그려져, 아래쪽 층이 화면에서 더 위에 보입니다)'),
            (f.layers || []).length ? f.layers.map(layerEl) : h('p', { class: 'hint' }, '층이 없습니다. 아래에서 추가하세요.'),
            h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } }, Object.entries(TYPES).map(([t, n]) => h('button', { class: 'btn sm', onclick: () => addLayer(t) }, '+ ' + n))))));
    }
  });
})();
