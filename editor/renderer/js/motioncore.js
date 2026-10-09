// ================================================================
//  모션 코어 — CSS · HTML · JS(캔버스) 로 움직이는 그림을 만들어 게임 그림(PNG 시트 · APNG)으로 굽는 공용 부품
//  쓰는 곳: 모션 랩(editors/motion.js) · 화면 필터의 코드 층(editors/filter.js) · 글자 연출(editors/textfx.js)
//    src = { lang: 'css'(HTML + CSS) | 'js'(캔버스), html, code(CSS 또는 JS), w, h, frames, fps, seed }
//    · CSS: 화면 밖 상자에 올린 뒤 모든 애니메이션(Web Animations)을 프레임 시각으로 멈춰 놓고, 움직이는 속성의 계산된 값을 박아 SVG foreignObject 로 찍음
//      → animation-delay · 글자마다 어긋난 시작(stagger) · ::before/::after · CSS 변수 애니메이션까지 그대로
//    · JS: function (g, w, h, t, frame, frames, rand) — t 는 0~1 한 바퀴
//    pixel = { px(덩어리 크기 1~8), keep(덩어리만 키우고 크기는 그대로), alphaCut(0 = 안 함), palette('' | editor | levels), levels, dither, outline('#rrggbb' | '') }
//      픽셀 아트로 굽기 — CSS 의 부드러운 경계 · 반투명 · 흐림이 픽셀 게임에서 뿌옇게 보이지 않게
// ================================================================
(function () {
  const { h } = PDM;
  const num = (v, d) => (isFinite(+v) && v !== '' && v !== null && v !== undefined ? +v : d);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const MAXF = 240;

  // ---------------- 화면 밖에 올리기 · 프레임 찍기 (글자 연출에서 쓰던 방식을 공용으로)
  /** host 에 HTML · CSS 를 올리고 애니메이션을 모두 멈춘 채 돌려줌 → { root, stage, anims, seek(초) }
   *  doc = { html, css, W, H, prepare(root, stage) } — stage 는 .pdm-stage(크기 W×H) 또는 html 안의 .stage */
  /** @property 규칙을 문서 전체에 등록 (shadow 상자 안의 @property 는 브라우저가 무시함 — 등록해야 CSS 변수가 숫자 · 색으로 이어져 변함). 같은 이름은 처음 것만 */
  const registered = new Set();
  function registerProps(css) {
    String(css || '').replace(/@property\s+(--[\w-]+)\s*\{([^}]*)\}/g, (_, name, body) => {
      if (registered.has(name) || !window.CSS || !CSS.registerProperty) return '';
      const d = k => { const m = new RegExp(k + '\\s*:\\s*([^;]+)').exec(body); return m ? m[1].trim() : null; };
      try { CSS.registerProperty({ name, syntax: (d('syntax') || "'*'").replace(/^['"]|['"]$/g, ''), inherits: d('inherits') === 'true', initialValue: d('initial-value') || undefined }); } catch (_) { /* 이미 있음 · 잘못된 값 */ }
      registered.add(name); return '';
    });
  }
  /** @keyframes 안에서 움직이는 CSS 변수 이름들 (getKeyframes 는 CSS 변수를 알려 주지 않음) */
  const keyframeVars = css => { const out = new Set(); String(css || '').replace(/@keyframes[^{]*\{((?:[^{}]*\{[^{}]*\})*[^{}]*)\}/g, (_, body) => { (body.match(/--[\w-]+(?=\s*:)/g) || []).forEach(v => out.add(v)); return ''; }); return [...out]; };
  async function mount(doc, host, zoom) {
    registerProps(doc.css);
    const root = host.shadowRoot || host.attachShadow({ mode: 'open' });
    const own = !/class="stage"/.test(doc.html || '');
    const body = own ? `<div class="pdm-stage" style="position:relative;width:${doc.W}px;height:${doc.H}px;overflow:hidden">${doc.html || ''}</div>` : doc.html;
    root.innerHTML = `<style>${doc.css || ''}\n:host{display:inline-block}${zoom && zoom !== 1 ? `.pdm-stage,.stage{zoom:${zoom}}` : ''}</style>${body}`;
    const stage = root.querySelector(own ? '.pdm-stage' : '.stage');
    if (doc.prepare) doc.prepare(root, stage);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const anims = stage.getAnimations({ subtree: true });
    anims.forEach(a => a.pause());
    return { root, stage, anims, seek(t) { const ms = t * 1000; anims.forEach(a => { try { a.currentTime = ms; } catch (_) { /* 무시 */ } }); } };
  }
  const loadImg = src => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => no(new Error('그림으로 바꾸지 못했습니다 (CSS · HTML 을 확인하세요 — 바깥 그림 주소 url() 은 쓸 수 없습니다)')); im.src = src; });
  /** doc 를 times(초 목록)마다 찍어 캔버스 배열로. onProgress(0~1), cancel() 이 true 면 멈춤 */
  async function shoot(doc, times, onProgress, cancel) {
    const host = h('div', { style: { position: 'fixed', left: '-100000px', top: '0', pointerEvents: 'none' } });
    document.body.append(host);
    const frames = [];
    try {
      const m = await mount(doc, host), { stage, anims } = m;
      // 애니메이션이 바꾸는 속성만 골라 프레임마다 계산된 값을 박아 넣음 (가상 요소 ::before/::after 포함)
      [stage, ...stage.querySelectorAll('*')].forEach((e, i) => e.setAttribute('data-k', i));
      const targets = new Map(), vars = keyframeVars(doc.css);
      anims.forEach(a => { const ef = a.effect; if (!ef || !ef.target) return; const key = ef.target.getAttribute('data-k') + '|' + (ef.pseudoElement || '');
        const t = targets.get(key) || { el: ef.target, pseudo: ef.pseudoElement || null, props: new Set() }; targets.set(key, t);
        ef.getKeyframes().forEach(kf => Object.keys(kf).forEach(p => { if (!['offset', 'easing', 'composite', 'computedOffset'].includes(p)) t.props.add(p === 'cssFloat' ? 'float' : p === 'cssOffset' ? 'offset' : p.startsWith('--') ? p : p.replace(/[A-Z]/g, c => '-' + c.toLowerCase())); }));
        vars.forEach(v => t.props.add(v)); });
      const xml = new XMLSerializer();
      for (let i = 0; i < times.length; i++) {
        if (cancel && cancel()) throw new Error('중지했습니다');
        m.seek(times[i]);
        let rules = '';
        targets.forEach(tg => { const cs = getComputedStyle(tg.el, tg.pseudo); rules += `[data-k="${tg.el.getAttribute('data-k')}"]${tg.pseudo || ''}{${[...tg.props].map(p => `${p}:${cs.getPropertyValue(p)}!important`).join(';')}}\n`; });
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${doc.W}" height="${doc.H}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml"><style>${esc(doc.css || '')}\n*,*::before,*::after{animation:none!important;transition:none!important}\n${esc(rules)}</style>${xml.serializeToString(stage)}</div></foreignObject></svg>`;
        const im = await loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
        const cv = h('canvas', { width: doc.W, height: doc.H });
        cv.getContext('2d').drawImage(im, 0, 0);
        frames.push(cv);
        onProgress && onProgress((i + 1) / times.length * 0.7);
        if (i % 8 === 7) await new Promise(r => setTimeout(r, 0));
      }
      return frames;
    } finally { host.remove(); }
  }

  // ---------------- src(모션 랩 · 필터 코드 층) → 프레임
  const rng = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const DEFAULT_HTML = '<div class="fx"></div>';
  /** src 의 크기 · 프레임 수를 정리 */
  function dims(src) {
    return { w: clamp(num(src.w, 64) | 0, 4, 1024), h: clamp(num(src.h, 64) | 0, 4, 1024), n: clamp(num(src.frames, 1) | 0, 1, MAXF), fps: clamp(num(src.fps, 8), 1, 60) };
  }
  /** CSS 문서: .fx 가 그림 전체 상자이고 html 은 그 안에 들어감 (비면 .fx 하나 — 화면 필터 코드 층과 같은 약속).
   *  html 에 자기 .stage 가 있으면(글자 연출에서 가져온 것) 그대로 */
  function cssDoc(src) {
    const { w, h: hh } = dims(src), raw = (src.html || '').trim();
    return { W: w, H: hh, html: /class="stage"/.test(raw) ? raw : `<div class="fx">${raw}</div>`, css: `.fx{position:absolute;left:0;top:0;width:${w}px;height:${hh}px;overflow:hidden}\n${src.code || ''}` };
  }
  /** src → { frames, w, h, n, fps } */
  async function renderSrc(src, onProgress, cancel) {
    const { w, h: hh, n, fps } = dims(src);
    let frames;
    if (src.lang === 'js') {
      frames = [];
      const fn = new Function('g', 'w', 'h', 't', 'frame', 'frames', 'rand', src.code || '');
      for (let f = 0; f < n; f++) {
        if (cancel && cancel()) throw new Error('중지했습니다');
        const cv = h('canvas', { width: w, height: hh }), g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
        g.save(); fn(g, w, hh, f / n, f, n, rng(num(src.seed, 1) * 9973 + 17)); g.restore();
        frames.push(cv); onProgress && onProgress((f + 1) / n * 0.7);
        if (f % 8 === 7) await new Promise(r => setTimeout(r, 0));
      }
    } else frames = await shoot(cssDoc(src), [...Array(n).keys()].map(f => f / fps), onProgress, cancel);
    if (src.pixel) frames = pixelize(frames, src.pixel);
    return { frames, w: frames[0].width, h: frames[0].height, n, fps };
  }

  // ---------------- 픽셀 아트로 굽기
  const hexRgb = c => { const m = /^#?([0-9a-f]{6})$/i.exec(c || ''); if (!m) return null; const v = parseInt(m[1], 16); return [v >> 16 & 255, v >> 8 & 255, v & 255]; };
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  /** 픽셀 설정이 실제로 무언가 하는지 */
  function pixelOn(p) { return !!p && (num(p.px, 1) > 1 || num(p.alphaCut, 0) > 0 || !!p.palette || !!hexRgb(p.outline)); }
  function pixelize(frames, p) {
    if (!pixelOn(p)) return frames;
    const px = clamp(num(p.px, 1) | 0, 1, 16), cut = clamp(num(p.alphaCut, 0) | 0, 0, 255), keep = !!p.keep;
    const pal = p.palette === 'editor' ? (PDM.PALETTE || []).map(hexRgb).filter(Boolean) : null, lv = clamp(num(p.levels, 4) | 0, 2, 32), dith = !!p.dither, ol = hexRgb(p.outline);
    return frames.map(src => {
      const W = src.width, H = src.height, sw = Math.max(1, Math.round(W / px)), sh = Math.max(1, Math.round(H / px));
      const small = h('canvas', { width: sw, height: sh }), sg = small.getContext('2d');
      sg.imageSmoothingEnabled = true; sg.imageSmoothingQuality = 'high'; sg.drawImage(src, 0, 0, sw, sh);   // 덩어리 = 그 칸의 평균 색
      const id = sg.getImageData(0, 0, sw, sh), d = id.data;
      for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
        const i = (y * sw + x) * 4, b = dith ? (BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.5) : 0;
        if (cut) d[i + 3] = d[i + 3] + b * 64 >= cut ? 255 : 0;
        if (d[i + 3] === 0) continue;
        if (pal && pal.length) {
          let best = 0, bd = 1e9; const r = d[i] + b * 48, g = d[i + 1] + b * 48, bl = d[i + 2] + b * 48;
          pal.forEach((c, k) => { const dd = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - bl) ** 2; if (dd < bd) { bd = dd; best = k; } });
          d[i] = pal[best][0]; d[i + 1] = pal[best][1]; d[i + 2] = pal[best][2];
        } else if (p.palette === 'levels') {
          const st = 255 / (lv - 1);
          for (let c = 0; c < 3; c++) d[i + c] = clamp(Math.round((d[i + c] + b * st) / st) * st, 0, 255);
        }
      }
      if (ol) {   // 1칸 외곽선: 빈 칸인데 옆(상하좌우)에 찬 칸이 있으면 외곽선 색
        const a0 = new Uint8Array(sw * sh); for (let k = 0; k < sw * sh; k++) a0[k] = d[k * 4 + 3] > 0 ? 1 : 0;
        for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) { const k = y * sw + x; if (a0[k]) continue;
          if ((x > 0 && a0[k - 1]) || (x < sw - 1 && a0[k + 1]) || (y > 0 && a0[k - sw]) || (y < sh - 1 && a0[k + sw])) { d[k * 4] = ol[0]; d[k * 4 + 1] = ol[1]; d[k * 4 + 2] = ol[2]; d[k * 4 + 3] = 255; } }
      }
      sg.putImageData(id, 0, 0);
      if (!keep || px === 1) return small;
      const out = h('canvas', { width: sw * px, height: sh * px }), og = out.getContext('2d'); og.imageSmoothingEnabled = false; og.drawImage(small, 0, 0, sw * px, sh * px);
      return out;
    });
  }

  // ---------------- 시트 · APNG
  /** 프레임들 → 격자 시트 (가로 2048 을 넘지 않게 — 런타임은 가로 칸 수 = 시트 너비 ÷ 한 칸 가로) */
  function sheet(frames) {
    const w = frames[0].width, hh = frames[0].height, n = frames.length, cols = Math.max(1, Math.min(n, Math.floor(2048 / w))), rows = Math.ceil(n / cols);
    if (rows * hh > 4096) throw new Error(`시트가 너무 큽니다 (${cols * w}×${rows * hh}px) — 그림 크기나 프레임 수를 줄이세요`);
    const cv = h('canvas', { width: w * cols, height: hh * rows }), g = cv.getContext('2d');
    frames.forEach((f, i) => g.drawImage(f, (i % cols) * w, Math.floor(i / cols) * hh));
    return { canvas: cv, cols, rows, fw: w, fh: hh };
  }
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = a => { let c = 0xFFFFFFFF; for (let i = 0; i < a.length; i++) c = CRC[(c ^ a[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function chunk(type, data) {
    const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
    dv.setUint32(0, data.length); for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i); out.set(data, 8);
    dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  }
  async function deflate(bytes) {
    const cs = new CompressionStream('deflate'); const w = cs.writable.getWriter(); w.write(bytes); w.close();
    return new Uint8Array(await new Response(cs.readable).arrayBuffer());
  }
  async function frameData(cv) {
    const w = cv.width, hh = cv.height, d = cv.getContext('2d').getImageData(0, 0, w, hh).data;
    const raw = new Uint8Array((w * 4 + 1) * hh);
    for (let y = 0; y < hh; y++) raw.set(d.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);   // 줄마다 필터 0
    return deflate(raw);
  }
  /** frames(캔버스들) → APNG Uint8Array. loop: 0 = 무한 */
  async function encodeApng(frames, fps, loop, onProgress) {
    const w = frames[0].width, hh = frames[0].height, parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])];
    const u32 = (...v) => { const a = new Uint8Array(v.length * 4), dv = new DataView(a.buffer); v.forEach((x, i) => dv.setUint32(i * 4, x)); return a; };
    const ihdr = new Uint8Array(13); ihdr.set(u32(w, hh)); ihdr.set([8, 6, 0, 0, 0], 8);
    parts.push(chunk('IHDR', ihdr), chunk('acTL', u32(frames.length, Math.max(0, loop | 0))));
    let seq = 0;
    for (let i = 0; i < frames.length; i++) {
      const fc = new Uint8Array(26), dv = new DataView(fc.buffer);
      dv.setUint32(0, seq++); dv.setUint32(4, w); dv.setUint32(8, hh); dv.setUint16(20, 1); dv.setUint16(22, Math.round(fps));   // 프레임 길이 1/fps 초, dispose 0 · blend 0(덮어쓰기)
      parts.push(chunk('fcTL', fc));
      const z = await frameData(frames[i]);
      if (i === 0) parts.push(chunk('IDAT', z));
      else { const fd = new Uint8Array(4 + z.length); new DataView(fd.buffer).setUint32(0, seq++); fd.set(z, 4); parts.push(chunk('fdAT', fd)); }
      onProgress && onProgress(0.7 + (i + 1) / frames.length * 0.3);
    }
    parts.push(chunk('IEND', new Uint8Array(0)));
    const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let o = 0; parts.forEach(p => { out.set(p, o); o += p.length; });
    return out;
  }
  const bytesUrl = bytes => { let bin = ''; const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes); for (let k = 0; k < u.length; k += 8192) bin += String.fromCharCode.apply(null, u.subarray(k, k + 8192)); return 'data:image/png;base64,' + btoa(bin); };
  const apngPath = png => String(png).replace(/\.png$/i, '') + '_anim.png';

  /** src 를 구워 png(게임용 격자 시트)에 저장. 여러 프레임이면 옆에 APNG(<이름>_anim.png — 미리 보기 · 공유용)도. { fw, fh, frames, fps, cols, apng } */
  async function bake(src, png, onProgress, cancel) {
    if (!png) throw new Error('저장할 경로가 없습니다');
    const r = await renderSrc(src, onProgress, cancel), sh = sheet(r.frames);
    await pdm.writeDataURL(PDM.store.abs(png), sh.canvas.toDataURL('image/png'));
    PDM.assets.invalidate(png);
    let apng = '';
    if (r.n > 1) { try { apng = apngPath(png); await pdm.writeDataURL(PDM.store.abs(apng), bytesUrl(await encodeApng(r.frames, r.fps, 0))); PDM.assets.invalidate(apng); } catch (e) { apng = ''; PDM.log && PDM.log('APNG 저장 실패: ' + (e.message || e), 'warn'); } }
    return { fw: r.w, fh: r.h, frames: r.n, fps: r.fps, cols: sh.cols, apng, canvases: r.frames };
  }
  /** src 를 APNG 파일로 내보내기 (프로젝트 밖 아무 곳에나 — 웹 모드는 내려받기) */
  async function exportApng(src, name) {
    const r = await renderSrc(src), url = bytesUrl(await encodeApng(r.frames, r.fps, 0));
    try { const out = await pdm.saveFile('APNG 로 내보내기', name, ['png']); if (!out) return null; await pdm.writeDataURL(out, url); return out; }
    catch (_) { const a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove(); return name; }
  }

  PDM.motion = Object.assign(PDM.motion || {}, { mount, shoot, registerProps, renderSrc, cssDoc, dims, pixelize, pixelOn, sheet, encodeApng, crc32, bytesUrl, apngPath, bake, exportApng, rng, DEFAULT_HTML, MAXF });
})();
