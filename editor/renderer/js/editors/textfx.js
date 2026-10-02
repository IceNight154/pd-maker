// ================================================================
//  글자 연출 (APNG) — CSS 로 움직이는 글자 그림을 만들어 APNG 로 저장 · 게임에서 표시
//    데이터: textfx.json { list: [ { id, name, text, font, size, … css, fps, loop, sheet } ] }
//    만들기: 화면 밖에서 실제 CSS 애니메이션을 시간별로 멈춰 놓고(Web Animations) → SVG foreignObject 로 캔버스에 찍음
//      → assets/fx/<id>.png  (APNG — 공유·다른 도구용)
//      → assets/fx/<id>_sheet.png (프레임 격자 — 게임용, 런타임 MakerTextFx · 이벤트 명령 "글자 연출 표시")
// ================================================================
(function () {
  const { h, store } = PDM;
  const K = 'textfx';
  const IN = { none: '없음', fade: '서서히 나타남', left: '왼쪽에서', right: '오른쪽에서', up: '아래에서 위로', down: '위에서 아래로', zoom: '크게 → 제자리', pop: '튀어나옴', blur: '흐림 → 또렷', spin: '돌면서' };
  const OUT = { none: '없음 (그대로 끝)', fade: '서서히 사라짐', left: '왼쪽으로', right: '오른쪽으로', up: '위로', down: '아래로', zoom: '커지며 사라짐', shrink: '작아지며 사라짐', blur: '흐려짐' };
  const LOOP = { none: '없음', pulse: '두근거림', shake: '떨림', float: '둥실', blink: '깜빡임', hue: '색 돌기' };
  const FONTS = [['sans-serif', '고딕 (기본)'], ['serif', '명조'], ['monospace', '고정폭'], ["'Malgun Gothic'", '맑은 고딕'], ["'Batang'", '바탕'], ["'Gungsuh'", '궁서'], ["Impact, sans-serif", 'Impact'], ['game', '게임 픽셀 글꼴 (영문·숫자)']];
  const KF = {
    'in-fade': 'from{opacity:0}', 'in-left': 'from{opacity:0;transform:translateX(-40%)}', 'in-right': 'from{opacity:0;transform:translateX(40%)}',
    'in-up': 'from{opacity:0;transform:translateY(80%)}', 'in-down': 'from{opacity:0;transform:translateY(-80%)}', 'in-zoom': 'from{opacity:0;transform:scale(2.6)}',
    'in-pop': '0%{opacity:0;transform:scale(.2)}70%{opacity:1;transform:scale(1.18)}100%{transform:scale(1)}', 'in-blur': 'from{opacity:0;filter:blur(14px)}', 'in-spin': 'from{opacity:0;transform:rotate(-200deg) scale(.3)}',
    'out-fade': 'to{opacity:0}', 'out-left': 'to{opacity:0;transform:translateX(-40%)}', 'out-right': 'to{opacity:0;transform:translateX(40%)}',
    'out-up': 'to{opacity:0;transform:translateY(-80%)}', 'out-down': 'to{opacity:0;transform:translateY(80%)}', 'out-zoom': 'to{opacity:0;transform:scale(2.6)}',
    'out-shrink': 'to{opacity:0;transform:scale(.2)}', 'out-blur': 'to{opacity:0;filter:blur(14px)}',
    'lp-pulse': '50%{transform:scale(1.07)}', 'lp-shake': '20%{transform:translate(-3px,2px)}40%{transform:translate(3px,-2px)}60%{transform:translate(-2px,-3px)}80%{transform:translate(2px,3px)}',
    'lp-float': '50%{transform:translateY(-8%)}', 'lp-blink': '50%{opacity:.35}', 'lp-hue': 'to{filter:hue-rotate(360deg)}'
  };
  const make = id => ({ id, name: '새 글자 연출', text: '전투 개시', font: 'sans-serif', size: 72, bold: true, italic: false, spacing: 4,
    color: '#ffffff', color2: '', stroke: '#1a1030', strokeW: 6, glow: '#7a5cff', glowW: 12, shadow: false,
    w: 640, h: 180, bg: '', perChar: false, stagger: 0.06,
    inFx: 'zoom', inDur: 0.4, hold: 1.2, outFx: 'fade', outDur: 0.4, loopFx: 'none', loopDur: 1,
    css: '', fps: 20, loop: 1, crop: true });
  const list = () => (store.get(K) || {}).list || [];
  const num = (v, d) => (isFinite(+v) ? +v : d);
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  /** 연출 하나의 HTML · CSS · 전체 길이(초) */
  function build(fx, fontFace) {
    const lines = String(fx.text || ' ').split('\n');
    const n = Math.max(1, [...lines.join('')].length);
    const st = fx.perChar ? Math.max(0, num(fx.stagger, 0)) : 0, spread = (n - 1) * st;
    const inD = fx.inFx === 'none' ? 0 : Math.max(0.01, num(fx.inDur, 0.4)), outD = fx.outFx === 'none' ? 0 : Math.max(0.01, num(fx.outDur, 0.4));
    const outStart = inD + spread + Math.max(0, num(fx.hold, 1));
    const total = Math.max(0.05, outStart + outD + (outD ? spread : 0));
    let i = 0;
    const html = `<div class="stage"><div class="wrap"><div class="text">${lines.map(l => `<div class="line">${[...l].map(c => `<span class="ch" style="--i:${i++}" data-c="${c === ' ' ? '&#160;' : esc(c).replace(/"/g, '&quot;')}">${c === ' ' ? '&#160;' : esc(c)}</span>`).join('') || '&#160;'}</div>`).join('')}</div></div></div>`;
    const anims = [], delays = [];
    if (inD) { anims.push(`in-${fx.inFx} ${inD}s cubic-bezier(.2,.8,.2,1) both`); delays.push(fx.perChar ? `calc(var(--i) * ${st}s)` : '0s'); }
    if (outD) { anims.push(`out-${fx.outFx} ${outD}s ease-in forwards`); delays.push(fx.perChar ? `calc(${outStart}s + var(--i) * ${st}s)` : outStart + 's'); }
    const animCss = anims.length ? `animation:${anims.join(',')};animation-delay:${delays.join(',')};` : '';
    const shadows = [];
    if (fx.glow && num(fx.glowW, 0) > 0) shadows.push(`0 0 ${fx.glowW}px ${fx.glow}`, `0 0 ${fx.glowW * 2}px ${fx.glow}`);
    if (fx.shadow) shadows.push(`${Math.max(2, fx.size / 16)}px ${Math.max(2, fx.size / 16)}px 0 rgba(0,0,0,.6)`);
    // 그라데이션: 테두리·빛 번짐은 원래 글자가 그리고, 그 위에 같은 글자를 겹쳐(::after) 속만 그라데이션으로 칠함
    const grad = fx.color2 ? `.ch::after{content:attr(data-c);position:absolute;left:0;top:0;background:linear-gradient(${fx.color},${fx.color2});-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;-webkit-text-stroke:0;text-shadow:none}` : '';
    const family = fx.font === 'game' ? "'pdmGameFont', monospace" : (fx.font || 'sans-serif');
    const used = new Set([inD && 'in-' + fx.inFx, outD && 'out-' + fx.outFx, fx.loopFx !== 'none' && 'lp-' + fx.loopFx].filter(Boolean));
    const css = `${fx.font === 'game' && fontFace ? fontFace : ''}
*{box-sizing:border-box;margin:0;padding:0}
.stage{--t:${total}s;width:${fx.w}px;height:${fx.h}px;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative;background:${fx.bg || 'transparent'}}
.wrap{display:inline-block;${fx.loopFx && fx.loopFx !== 'none' ? `animation:lp-${fx.loopFx} ${Math.max(0.1, num(fx.loopDur, 1))}s linear infinite;` : ''}}
.text{display:inline-block;text-align:center;white-space:pre;font:${fx.italic ? 'italic ' : ''}${fx.bold ? '700' : '400'} ${fx.size}px/1.15 ${family};letter-spacing:${num(fx.spacing, 0)}px;color:${fx.color};${num(fx.strokeW, 0) > 0 ? `-webkit-text-stroke:${fx.strokeW}px ${fx.stroke};paint-order:stroke fill;` : ''}${shadows.length ? `text-shadow:${shadows.join(',')};` : ''}${fx.perChar ? '' : animCss}}
.ch{display:inline-block;position:relative;white-space:pre;${fx.perChar ? animCss : ''}}
${grad}
${[...used].map(k => `@keyframes ${k}{${KF[k] || ''}}`).join('\n')}
${fx.css || ''}`;
    return { html, css, total };
  }

  // ---------------- 게임 픽셀 글꼴 (저장소 assets/fonts/pixel_font.ttf)
  let gameFont = null;
  async function loadGameFont() {
    if (gameFont !== null) return gameFont;
    try { const repo = await PDM.app.resolveRepo(true); const d = await pdm.readDataURL(pdm.join(repo, 'core', 'src', 'main', 'assets', 'fonts', 'pixel_font.ttf'));
      gameFont = `@font-face{font-family:'pdmGameFont';src:url(${d.replace(/^data:[^;]*/, 'data:font/ttf')}) format('truetype')}`; } catch (_) { gameFont = ''; }
    return gameFont;
  }

  // ---------------- 프레임 찍기
  const loadImg = src => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => no(new Error('그림을 만들지 못했습니다 (CSS 를 확인하세요)')); im.src = src; });
  /** 모든 프레임을 캔버스 배열로. onProgress(0~1) */
  async function capture(fx, onProgress) {
    const ff = fx.font === 'game' ? await loadGameFont() : '';
    const b = build(fx, ff), fps = Math.max(1, Math.min(60, num(fx.fps, 20)));
    const count = Math.max(1, Math.min(600, Math.round(b.total * fps)));
    const host = h('div', { style: { position: 'fixed', left: '-100000px', top: '0', width: fx.w + 'px', height: fx.h + 'px', pointerEvents: 'none' } });
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${b.css}</style>${b.html}`;
    document.body.append(host);
    const frames = [];
    try {
      if (ff) { try { const f = new FontFace('pdmGameFont', ff.match(/url\(([^)]+)\)/)[1].replace(/^/, 'url(') + ')'); await f.load(); document.fonts.add(f); } catch (_) { /* 기본 글꼴 */ } }
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const stage = root.querySelector('.stage');
      const anims = stage.getAnimations({ subtree: true });
      anims.forEach(a => a.pause());
      // 애니메이션이 바꾸는 속성만 골라 프레임마다 계산된 값을 박아 넣음 (가상 요소 ::before/::after 포함)
      const els = [stage, ...stage.querySelectorAll('*')];
      els.forEach((e, i) => e.setAttribute('data-k', i));
      const targets = new Map();
      anims.forEach(a => { const ef = a.effect; if (!ef || !ef.target) return; const key = ef.target.getAttribute('data-k') + '|' + (ef.pseudoElement || '');
        const t = targets.get(key) || { el: ef.target, pseudo: ef.pseudoElement || null, props: new Set() }; targets.set(key, t);
        ef.getKeyframes().forEach(kf => Object.keys(kf).forEach(p => { if (!['offset', 'easing', 'composite', 'computedOffset'].includes(p)) t.props.add(p === 'cssFloat' ? 'float' : p === 'cssOffset' ? 'offset' : p.startsWith('--') ? p : p.replace(/[A-Z]/g, c => '-' + c.toLowerCase())); })); });
      const xml = new XMLSerializer();
      for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / fps * 1000;
        anims.forEach(a => { try { a.currentTime = t; } catch (_) { /* 무시 */ } });
        let rules = '';
        targets.forEach(tg => { const cs = getComputedStyle(tg.el, tg.pseudo); rules += `[data-k="${tg.el.getAttribute('data-k')}"]${tg.pseudo || ''}{${[...tg.props].map(p => `${p}:${cs.getPropertyValue(p)}!important`).join(';')}}\n`; });
        const body = xml.serializeToString(stage);
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${fx.w}" height="${fx.h}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml"><style>${esc(b.css)}\n*,*::before,*::after{animation:none!important;transition:none!important}\n${esc(rules)}</style>${body}</div></foreignObject></svg>`;
        const im = await loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
        const cv = h('canvas', { width: fx.w, height: fx.h });
        cv.getContext('2d').drawImage(im, 0, 0);
        frames.push(cv);
        onProgress && onProgress((i + 1) / count * 0.7);
      }
    } finally { host.remove(); }
    return { frames, fps, total: b.total };
  }
  /** 투명 여백 자르기 (모든 프레임 공통 범위) */
  function crop(frames) {
    const w = frames[0].width, hh = frames[0].height; let x0 = w, y0 = hh, x1 = -1, y1 = -1;
    frames.forEach(cv => { const d = cv.getContext('2d').getImageData(0, 0, w, hh).data;
      for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 4) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } });
    if (x1 < 0) return frames;
    x0 = Math.max(0, x0 - 2); y0 = Math.max(0, y0 - 2); x1 = Math.min(w - 1, x1 + 2); y1 = Math.min(hh - 1, y1 + 2);
    return frames.map(cv => { const c = h('canvas', { width: x1 - x0 + 1, height: y1 - y0 + 1 }); c.getContext('2d').drawImage(cv, -x0, -y0); return c; });
  }

  // ---------------- APNG 만들기 (PNG 청크 직접 조립, 압축은 브라우저 CompressionStream)
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (a) => { let c = 0xFFFFFFFF; for (let i = 0; i < a.length; i++) c = CRC[(c ^ a[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
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
      dv.setUint32(0, seq++); dv.setUint32(4, w); dv.setUint32(8, hh); dv.setUint16(20, 1); dv.setUint16(22, fps);   // 프레임 길이 1/fps 초, dispose 0 · blend 0(덮어쓰기)
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
  const toDataURL = bytes => new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(new Blob([bytes], { type: 'image/png' })); });

  /** 만들기: APNG + 게임용 시트를 프로젝트 assets/fx 에 저장하고 sheet 정보를 적음 */
  async function generate(fx, onProgress) {
    let { frames, fps } = await capture(fx, onProgress);
    if (fx.crop !== false && !fx.bg) frames = crop(frames);
    const w = frames[0].width, hh = frames[0].height, n = frames.length;
    const apng = await encodeApng(frames, fps, num(fx.loop, 1), onProgress);
    const apngRel = `assets/fx/${fx.id}.png`, sheetRel = `assets/fx/${fx.id}_sheet.png`;
    await pdm.writeDataURL(pdm.join(store.root, apngRel), await toDataURL(apng));
    // 게임용 시트: 한 변 4096 을 넘지 않게 격자로
    const MAX = 4096; let cols = Math.max(1, Math.min(n, Math.ceil(Math.sqrt(n * hh / w)))); cols = Math.min(cols, Math.max(1, Math.floor(MAX / w)));
    const rows = Math.ceil(n / cols);
    let sheet = null, warn = '';
    if (w > MAX || rows * hh > MAX) warn = `게임용 시트가 너무 큽니다 (${cols * w}×${rows * hh}px > ${MAX}). 크기·길이·fps 를 줄이세요. APNG 만 저장했습니다.`;
    else {
      const cv = h('canvas', { width: cols * w, height: rows * hh }), g = cv.getContext('2d');
      frames.forEach((f, i) => g.drawImage(f, (i % cols) * w, Math.floor(i / cols) * hh));
      await pdm.writeDataURL(pdm.join(store.root, sheetRel), cv.toDataURL('image/png'));
      sheet = { png: sheetRel, cols, frames: n, w, h: hh, fps };
    }
    store.edit(K, '글자 연출 만들기', r => { const e = (r.list || []).find(x => x.id === fx.id); if (e) { e.apng = apngRel; if (sheet) e.sheet = sheet; else delete e.sheet; } });
    if (PDM.assets && PDM.assets.clear) PDM.assets.clear();
    return { apng, apngRel, sheet, warn, w, h: hh, n, bytes: apng.length };
  }
  PDM.textfx = { build, capture, encodeApng, generate, make };

  // ---------------- 편집 화면
  const BG = { check: '투명 (체크)', '#000000': '검정', '#ffffff': '하양', '#808080': '회색' };
  PDM.registerEditor({
    id: K, icon: '✨', title: () => '글자 연출 (APNG)',
    match: k => k === K,
    tree: () => store.isOpen ? [{ id: K, label: '글자 연출 (APNG)', icon: '✨', open: K, order: 56, count: list().length }] : [],
    render(key, ctx) {
      const { F, section, row } = PDM.ui;
      const st = ctx.state = ctx.state || { bg: 'check' };
      const all = list();
      if (!all.some(x => x.id === st.id)) st.id = (all[0] || {}).id;
      const idx = all.findIndex(x => x.id === st.id), fx = all[idx], p = ['list', idx];
      const add = async (from) => { const name = await PDM.ui.prompt('글자 연출 id (영문·숫자)', from ? from.id + '_copy' : 'fx_' + (all.length + 1)); if (!name) return; const id = name.trim().replace(/[^A-Za-z0-9_]/g, '_');
        if (!id || all.some(x => x.id === id)) { PDM.toast && PDM.toast('이미 있거나 쓸 수 없는 id 입니다', 'bad'); return; }
        const o = from ? Object.assign(PDM.clone(from), { id, name: from.name + ' 사본' }) : make(id); delete o.sheet; delete o.apng;
        st.id = id; store.edit(K, '글자 연출 추가', r => { r.list = r.list || []; r.list.push(o); }); };
      const head = h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '8px' } },
        all.map(x => h('button', { class: 'btn sm' + (x.id === st.id ? ' pri' : ''), onclick: () => { st.id = x.id; ctx.refresh(); } }, `${x.name || x.id}${x.sheet ? '' : ' ·'}`)),
        h('button', { class: 'btn sm', onclick: () => add() }, '+ 새 글자 연출'));
      if (!fx) return h('div', { class: 'editor' }, h('h2', {}, '글자 연출 (APNG)'),
        h('p', { class: 'hint' }, '"전투 개시" 같은 컷인 글자, 장소·시간 자막, 예고편 글자를 CSS 애니메이션으로 만들어 APNG 로 저장합니다. 이벤트 명령 "글자 연출 표시"로 게임 화면에 띄울 수 있습니다.'), head);

      // ---- 미리보기 (실제 CSS 애니메이션)
      const pv = h('div', { style: { border: '1px solid var(--line)', borderRadius: '6px', overflow: 'hidden', maxWidth: '100%', display: 'inline-block',
        background: st.bg === 'check' ? 'repeating-conic-gradient(#8884 0% 25%, transparent 0% 50%) 0 0 / 16px 16px' : st.bg } });
      const info = h('span', { class: 'hint' });
      const play = async () => {
        const b = build(fx, fx.font === 'game' ? await loadGameFont() : '');
        const root = pv.shadowRoot || pv.attachShadow({ mode: 'open' });
        const avail = Math.max(200, (pv.parentElement ? pv.parentElement.clientWidth : 700) - 4), z = Math.min(1, avail / fx.w);
        root.innerHTML = `<style>${b.css}\n:host{display:inline-block}.stage{zoom:${z}}</style>${b.html}`;
        info.textContent = `길이 ${b.total.toFixed(2)}초 · ${Math.round(b.total * num(fx.fps, 20))}프레임 · ${fx.w}×${fx.h}px`;
        clearTimeout(st.timer);
        if (st.repeat !== false) st.timer = setTimeout(() => { if (pv.isConnected) play(); }, b.total * 1000 + 500);
      };
      setTimeout(play, 0);
      const bar = h('div', { style: { height: '4px', background: 'var(--line)', borderRadius: '2px', marginTop: '6px', display: 'none' } }, h('div', { style: { height: '100%', width: '0', background: 'var(--accent, #7a5cff)', borderRadius: '2px' } }));
      const result = h('div', { class: 'hint', style: { marginTop: '6px' } }, fx.sheet ? `게임용 시트: ${fx.sheet.png} (${fx.sheet.frames}프레임 · ${fx.sheet.w}×${fx.sheet.h}px) · APNG: ${fx.apng || ''}` : '아직 만들지 않았습니다 — "만들기"를 눌러야 게임에서 쓸 수 있습니다. 설정을 바꾼 뒤에도 다시 눌러 주세요.');
      const out = h('div', { style: { marginTop: '6px' } });
      const run = async btn => {
        btn.disabled = true; bar.style.display = '';
        try {
          const r = await generate(fx, f => { bar.firstChild.style.width = Math.round(f * 100) + '%'; });
          const url = URL.createObjectURL(new Blob([r.apng], { type: 'image/png' }));
          out.replaceChildren(h('div', { class: 'hint' }, `만들었습니다 — ${r.n}프레임 · ${r.w}×${r.h}px · ${(r.bytes / 1024).toFixed(0)}KB → ${r.apngRel}`), r.warn ? h('div', { class: 'hint', style: { color: 'var(--bad)' } }, r.warn) : '',
            h('img', { src: url, style: { maxWidth: '100%', marginTop: '4px', background: st.bg === 'check' ? 'repeating-conic-gradient(#8884 0% 25%, transparent 0% 50%) 0 0 / 16px 16px' : st.bg } }));
          PDM.log && PDM.log(`글자 연출 「${fx.name}」 저장: ${r.apngRel}` + (r.sheet ? ` · ${r.sheet.png}` : ''), r.warn ? 'err' : 'ok');
        } catch (e) { out.replaceChildren(h('div', { class: 'hint', style: { color: 'var(--bad)' } }, '만들지 못했습니다: ' + e.message)); console.error(e); }
        btn.disabled = false; bar.style.display = 'none';
      };
      const col = (label, f) => PDM.ui.field(label, (() => { const cur = PDM.deepGet(store.get(K), [...p, f]) || '';
        const c = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(cur) ? cur : '#000000', style: { width: '36px', padding: 0 } });
        const t = h('input', { type: 'text', value: cur, placeholder: '없음', style: { width: '90px' } });
        const set = v => PDM.ui.commit(K, [...p, f], v, label, true);
        c.addEventListener('change', () => set(c.value)); t.addEventListener('change', () => set(t.value.trim()));
        return h('div', { style: { display: 'flex', gap: '4px' } }, c, t); })());
      const R = { rerender: true };
      return h('div', { class: 'editor' },
        h('h2', {}, '글자 연출 (APNG)'), head,
        section('미리보기',
          h('div', {}, pv),
          h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginTop: '6px' } },
            h('button', { class: 'btn sm', onclick: play }, '▶ 다시 재생'),
            h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: st.repeat !== false, onchange: e => { st.repeat = e.target.checked; play(); } }), '반복 재생'),
            (() => { const s = h('select', { onchange: () => { st.bg = s.value; ctx.refresh(); } }, Object.entries(BG).map(([v, t]) => h('option', { value: v }, '배경: ' + t))); s.value = st.bg; return s; })(),
            info),
          h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginTop: '8px' } },
            (() => { const b = h('button', { class: 'btn pri', onclick: () => run(b) }, '만들기 (APNG + 게임용 시트 저장)'); return b; })(),
            fx.apng && pdm.showInFolder ? h('button', { class: 'btn sm', onclick: () => pdm.showInFolder(pdm.join(store.root, fx.apng)).catch(e => PDM.log(e.message, 'err')) }, '파일 위치 열기') : null),
          bar, result, out),
        section('글자',
          row(F.text(K, [...p, 'name'], Object.assign({ label: '이름' }, R)), PDM.ui.field('id (이벤트 명령에서 고름)', h('input', { type: 'text', value: fx.id, disabled: true }))),
          F.textarea ? F.textarea(K, [...p, 'text'], Object.assign({ label: '글자 (여러 줄 가능)', rows: 2 }, R)) : F.text(K, [...p, 'text'], Object.assign({ label: '글자' }, R)),
          row(F.select(K, [...p, 'font'], FONTS, Object.assign({ label: '글꼴' }, R)), F.num(K, [...p, 'size'], Object.assign({ label: '크기(px)', int: true, min: 6, max: 400 }, R)),
            F.num(K, [...p, 'spacing'], Object.assign({ label: '자간(px)' }, R)), F.bool(K, [...p, 'bold'], Object.assign({ label: '굵게' }, R)), F.bool(K, [...p, 'italic'], Object.assign({ label: '기울임' }, R))),
          h('p', { class: 'hint' }, 'PC 에 설치된 글꼴을 씁니다. 다른 글꼴은 아래 "CSS 직접 쓰기"에서 .text{font-family:…} 로 지정하세요.')),
        section('꾸미기',
          row(col('글자 색', 'color'), col('아래쪽 색 (그라데이션 · 비우면 단색)', 'color2'), col('테두리 색', 'stroke'), F.num(K, [...p, 'strokeW'], Object.assign({ label: '테두리 두께', min: 0, max: 60 }, R))),
          row(col('빛 번짐 색', 'glow'), F.num(K, [...p, 'glowW'], Object.assign({ label: '빛 번짐 크기', min: 0, max: 80 }, R)), F.bool(K, [...p, 'shadow'], Object.assign({ label: '그림자' }, R)), col('배경 색 (비우면 투명)', 'bg'))),
        section('움직임',
          row(F.select(K, [...p, 'inFx'], IN, Object.assign({ label: '등장' }, R)), F.num(K, [...p, 'inDur'], Object.assign({ label: '등장 시간(초)', min: 0.05, step: 0.05 }, R)),
            F.num(K, [...p, 'hold'], Object.assign({ label: '머무는 시간(초)', min: 0, step: 0.1 }, R))),
          row(F.select(K, [...p, 'outFx'], OUT, Object.assign({ label: '퇴장' }, R)), F.num(K, [...p, 'outDur'], Object.assign({ label: '퇴장 시간(초)', min: 0.05, step: 0.05 }, R)),
            F.select(K, [...p, 'loopFx'], LOOP, Object.assign({ label: '머무는 동안' }, R)), F.num(K, [...p, 'loopDur'], Object.assign({ label: '주기(초)', min: 0.1, step: 0.1 }, R))),
          row(F.bool(K, [...p, 'perChar'], Object.assign({ label: '한 글자씩 차례로' }, R)), fx.perChar ? F.num(K, [...p, 'stagger'], Object.assign({ label: '글자 사이 간격(초)', min: 0, step: 0.01 }, R)) : null)),
        section('크기 · 내보내기',
          row(F.num(K, [...p, 'w'], Object.assign({ label: '너비(px)', int: true, min: 16, max: 2048 }, R)), F.num(K, [...p, 'h'], Object.assign({ label: '높이(px)', int: true, min: 16, max: 2048 }, R)),
            F.select(K, [...p, 'fps'], [12, 15, 20, 24, 30, 60].map(v => [v, v + ' fps']), Object.assign({ label: '초당 프레임', number: true }, R)),
            F.num(K, [...p, 'loop'], { label: 'APNG 반복 횟수 (0 = 무한)', int: true, min: 0 }), F.bool(K, [...p, 'crop'], { label: '투명 여백 자르기' })),
          h('p', { class: 'hint' }, '게임에서는 한 번 재생(이벤트 명령의 반복 횟수만큼)하고 사라집니다. 게임 화면에는 "화면 너비 %"로 크기를 맞춰 띄우므로, 여기 크기는 선명도에 맞게 정하면 됩니다. 프레임이 많고 크면 게임용 시트가 커집니다(한 변 4096px 까지).')),
        section('CSS 직접 쓰기 (고급)',
          h('p', { class: 'hint' }, '위 설정으로 만든 CSS 뒤에 덧붙습니다. 구조: .stage(전체) › .wrap(머무는 동안 효과) › .text(글자 전체) › .line(줄) › .ch(글자 하나, --i = 순번). 전체 길이는 var(--t). @keyframes 와 ::before/::after 도 쓸 수 있습니다. 바깥 그림·웹 글꼴(url)은 쓸 수 없습니다.'),
          (() => { const t = h('textarea', { rows: 8, class: 'mono', style: { width: '100%' }, placeholder: '예)\n.ch{animation:wave 0.8s ease-in-out infinite;animation-delay:calc(var(--i) * 0.08s)}\n@keyframes wave{50%{transform:translateY(-18%)}}' });
            t.value = fx.css || ''; t.addEventListener('change', () => PDM.ui.commit(K, [...p, 'css'], t.value, 'CSS', true)); return t; })(),
          h('details', {}, h('summary', { class: 'hint' }, '지금 만들어진 CSS 보기'), h('pre', { class: 'mono', style: { whiteSpace: 'pre-wrap', fontSize: '11px' } }, build(fx, '').css.trim()))),
        h('div', { style: { display: 'flex', gap: '6px', marginTop: '10px' } },
          h('button', { class: 'btn sm', onclick: () => add(fx) }, '복제'),
          h('button', { class: 'btn sm', onclick: async () => { if (await PDM.ui.confirm(`「${fx.name}」 글자 연출을 지울까요? (만든 그림 파일은 assets/fx 에 남습니다)`)) store.edit(K, '글자 연출 삭제', r => { r.list.splice(idx, 1); }); } }, '삭제')));
    }
  });
})();
