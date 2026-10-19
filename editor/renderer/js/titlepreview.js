// ================================================================
//  타이틀 화면 미리보기 (7차) — 게임 런타임 MakerTitle 과 같은 데이터 · 같은 배치 식(PDM.titleModel = MakerTitleModel)으로 그림
//    그림 · 글꼴 · 글 = 게임 저장소의 실제 파일: chrome.png 9조각(버튼 · 창), icons.png(Icons.java 의 자리), banners.png(로고),
//    pixel_font.ttf · droid_sans.ttf(글자), 게임의 버튼 이름(scenes_ko.properties), 프로젝트가 바꾼 그림이 있으면 그것
//    글자 줄바꿈 · 높이 = 원작 RenderedTextBlock 규칙(줄 높이 = round(크기 × 배율 × 0.75) ÷ 배율, 줄 간격 2, 낱말 사이 −0.667)
//    화면 크기 · 배율 = 테스트 플레이 실행 환경(PDM.testEnv)과 같은 계산 — 캔버스 1점 = 기기 1점(배율만큼 키움)
//  편집용 선택 윤곽은 따로 그린 겹(overlay) — 게임 화면 그림(canvas)에는 들어가지 않음
// ================================================================
PDM.titlePreview = (function () {
  const M = PDM.titleModel;
  const store = PDM.store;

  // ---------------- 게임 자원 (저장소마다 한 번) ----------------
  let res = null, resKey = null, resWait = null;
  /** { fonts, icons{이름:[x,y,w,h]}, labels{버튼 id: 글}, settings{키: 글}, version, versionCode } */
  async function resources() {
    let repo = null;
    try { repo = PDM.app && PDM.app.resolveRepo ? await PDM.app.resolveRepo(true) : null; } catch (_) { repo = null; }
    const key = repo || '';
    if (res && resKey === key) return res;
    if (resWait && resKey === key) return resWait;
    resKey = key;
    resWait = (async () => {
      const r = { fonts: false, icons: {}, labels: {}, settings: {}, version: '', versionCode: '' };
      if (!repo) return r;
      for (const [name, rel] of [['pdmPixel', ['core', 'src', 'main', 'assets', 'fonts', 'pixel_font.ttf']], ['pdmDroid', ['desktop', 'src', 'main', 'assets', 'fonts', 'droid_sans.ttf']]]) {
        try { const d = (await pdm.readDataURL(pdm.join(repo, ...rel))).replace(/^data:[^;,]*/, 'data:font/ttf'); const f = new FontFace(name, `url(${d})`); await f.load(); document.fonts.add(f); r.fonts = true; } catch (_) { /* 기본 글꼴 */ }
      }
      try {
        const src = await pdm.readText(pdm.join(repo, 'core', 'src', 'main', 'java', 'com', 'shatteredpixel', 'shatteredpixeldungeon', 'ui', 'Icons.java'));
        const re = /case\s+(\w+)\s*:\s*icon\.frame\(\s*icon\.texture\.uvRectBySize\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/g; let m;
        while ((m = re.exec(src))) r.icons[m[1]] = [+m[2], +m[3], +m[4], +m[5]];
      } catch (_) { /* 아이콘 없이 */ }
      try { const p = await PDM.gameProps(repo, 'scenes'); M.GAME_BUTTONS.forEach(([id, k]) => { r.labels[id] = p['scenes.titlescene.' + k] || ''; }); } catch (_) { /* 기본 글 */ }
      try { const p = await PDM.gameProps(repo, 'windows'); ['music_vol', 'music_mute', 'sfx_vol', 'sfx_mute'].forEach(k => { r.settings[k] = p['windows.wndsettings$audiotab.' + k] || ''; }); } catch (_) { /* 기본 글 */ }
      try { const g = await pdm.readText(pdm.join(repo, 'build.gradle')); const a = /appVersionName\s*=\s*'([^']+)'/.exec(g), b = /appVersionCode\s*=\s*(\d+)/.exec(g); r.version = a ? a[1] : ''; r.versionCode = b ? b[1] : ''; } catch (_) { /* 버전 모름 */ }
      res = r; resWait = null;
      return r;
    })();
    return resWait;
  }

  // ---------------- 화면 크기 (테스트 플레이 실행 환경과 같은 계산) ----------------
  const SCREENS = { env: '테스트 플레이 환경', pc: 'PC 1280×800', 'pc-small': 'PC 960×600', 'phone-land': '모바일 가로', 'phone-port': '모바일 세로' };
  /** → { W, H, zoom, land, desktop, safe{x,y,w,h}, name } (게임 UI 좌표) */
  function screen(kind) {
    const pj = (store && store.isOpen && store.get('project')) || {};
    const cfg = kind === 'env' || !kind ? (pj.testplay || {}) : { env: kind, safeArea: 'notch' };
    const r = PDM.testEnv.resolve(cfg);
    if (r.kind === 'pc') {
      const zoom = r.zoom || PDM.testEnv.gameZoom(r.device[0], r.device[1], 160, 2, 0, null);   // 데스크톱 판(LWJGL3)의 밀도 = 1 → 1280×800 은 ×3 (게임에서 확인: 427×267)
      const W = Math.ceil(r.device[0] / zoom), H = Math.ceil(r.device[1] / zoom);   // 원작 PixelScene: 카메라 크기 = 올림 (1280÷3 → 427)
      return { W, H, zoom, land: W > H, desktop: true, safe: { x: 0, y: 0, w: W, h: H }, name: `${r.name} — UI ${W}×${H} (×${zoom})` };
    }
    const [W, H] = r.logical, wz = r.winZoom, ins = (r.insets || [0, 0, 0, 0]).map(v => v / wz);
    // 글자 배율 = 기기 배율 (실제 휴대폰). simulateWindow = 테스트 플레이(PC 창으로 흉내)와 같게 PC 창 배율 — 자동 비교(title-compare.js)만 씀
    return { W, H, zoom: api.simulateWindow ? wz : r.zoom, land: W > H, desktop: false, safe: { x: ins[0], y: ins[1], w: Math.max(1, W - ins[0] - ins[2]), h: Math.max(1, H - ins[1] - ins[3]) }, name: `${r.name} — UI ${W}×${H} (기기 ×${r.zoom})` };
  }

  // ---------------- 글자 (원작 RenderedTextBlock 과 같은 줄바꿈 · 높이) ----------------
  const ASIAN = /[ᄀ-ᇿ㄰-㆏가-힯぀-ヿ㐀-鿿　-〿＀-￯]/;
  const SPLIT_CJK = /([぀-ゟ]|[゠-ヿ]|[一-鿿]|[　-〿])/;
  let mctx = null;
  const fontOf = (word, px) => `${px}px ${ASIAN.test(word) ? '"pdmDroid"' : '"pdmPixel"'}, "Malgun Gothic", sans-serif`;
  /** 낱말 하나의 폭 (UI) — 게임은 글자 크기 × 배율로 만든 글꼴(테두리 포함)을 배율로 나눠 씀 */
  function wordWidth(word, size, zoom) {
    if (!mctx) mctx = document.createElement('canvas').getContext('2d');
    const px = size * zoom; mctx.font = fontOf(word, px);
    const border = px / 10;
    return (mctx.measureText(word).width + border) / zoom;
  }
  /** 글 → { w, h, lines: [{ words: [{ t, x, y, w, hi }] }] } (x · y 는 글 상자 왼쪽 위 기준). maxWidth > 0 = 여러 줄 (낱말마다 나눔) */
  function textLayout(text, size, maxWidth, zoom, align) {
    const multiline = maxWidth > 0;
    const parts = [];
    String(text == null ? '' : text).split(/(\n|_|\*\*)/).forEach(p => {
      if (p === '\n' || p === '_' || p === '**') { parts.push(p); return; }
      (multiline ? p.split(/( )/) : [p]).forEach(q => q.split(SPLIT_CJK).forEach(x => { if (x) parts.push(x); }));
    });
    const lineH = Math.round(size * zoom * 0.75) / zoom;
    let x = 0, y = 0, height = 0, width = 0, hi = false;
    const lines = [[]];
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p === ' ') { x += 1.667; continue; }
      if (p === '_' || p === '**') { hi = !hi; continue; }
      if (p === '\n') { y += height + 2; x = 0; lines.push([]); continue; }
      height = Math.max(height, lineH);
      const w = wordWidth(p, size, zoom);
      let full = w;
      for (let j = i + 1; j < parts.length && parts[j] !== ' ' && parts[j] !== '\n'; j++) if (parts[j] !== '_' && parts[j] !== '**') full += wordWidth(parts[j], size, zoom) - 0.667;
      if (multiline && x + full - 0.001 > maxWidth && lines[lines.length - 1].length) { y += height + 2; x = 0; lines.push([]); }
      lines[lines.length - 1].push({ t: p, x, y, w, hi });
      x += w;
      if (x > width) width = x;
      x -= 0.667;
    }
    const h = parts.length ? y + height : 0;
    if (align === 'center' || align === 'right') lines.forEach(L => { if (!L.length) return; const lw = L[L.length - 1].x + L[L.length - 1].w; L.forEach(wd => { wd.x += align === 'center' ? (width - lw) / 2 : width - lw; }); });
    return { w: width, h, lines: lines.map(words => ({ words })), size };
  }
  /** 글 그리기 (게임 글꼴 테두리 = 검은 외곽선) */
  function drawText(g, L, x, y, color, alpha, zoom, hiColor) {
    if (alpha <= 0.005) return;
    g.save(); g.globalAlpha *= Math.max(0, Math.min(1, alpha)); g.textBaseline = 'alphabetic';
    const px = L.size, asc = Math.round(L.size * zoom * 0.75) / zoom;
    L.lines.forEach(line => line.words.forEach(wd => {
      g.font = fontOf(wd.t, px);
      g.lineJoin = 'round'; g.lineWidth = px / 5; g.strokeStyle = '#000';
      const bx = x + wd.x + px / 20, by = y + wd.y + asc;
      g.strokeText(wd.t, bx, by);
      g.fillStyle = wd.hi && hiColor ? hiColor : color; g.fillText(wd.t, bx, by);
    }));
    g.restore();
  }

  // ---------------- 그림 ----------------
  const imgs = {};
  /** 그림을 (처음이면) 읽기 시작하고, 읽혔으면 돌려줌 */
  function want(ref) { if (!ref) return null; if (!(ref in imgs)) { imgs[ref] = null; PDM.assets.load(ref).then(i => { imgs[ref] = i; }).catch(() => { imgs[ref] = false; }); } return imgs[ref] || null; }
  function clearImages() { Object.keys(imgs).forEach(k => delete imgs[k]); }
  /** 9조각 그리기 (게임 NinePatch 와 같은 방식 — 가장자리는 그대로, 가운데 · 변은 늘림) */
  function nine(g, img, sx, sy, sw, sh, m, x, y, w, h) {
    if (!img || w <= 0 || h <= 0) return;
    const [l, t, r, b] = m, cw = Math.max(0, w - l - r), ch = Math.max(0, h - t - b), mw = sw - l - r, mh = sh - t - b;
    const part = (ax, ay, aw, ah, dx, dy, dw, dh) => { if (aw > 0 && ah > 0 && dw > 0 && dh > 0) g.drawImage(img, sx + ax, sy + ay, aw, ah, dx, dy, dw, dh); };
    part(0, 0, l, t, x, y, l, t); part(l, 0, mw, t, x + l, y, cw, t); part(sw - r, 0, r, t, x + l + cw, y, r, t);
    part(0, t, l, mh, x, y + t, l, ch); part(l, t, mw, mh, x + l, y + t, cw, ch); part(sw - r, t, r, mh, x + l + cw, y + t, r, ch);
    part(0, sh - b, l, b, x, y + t + ch, l, b); part(l, sh - b, mw, b, x + l, y + t + ch, cw, b); part(sw - r, sh - b, r, b, x + l + cw, y + t + ch, r, b);
  }
  /** 조각(chrome.png 이름) 또는 내 그림 → { img, rect, margins } */
  function patchOf(skin, image, slice) {
    if (image) { const im = want(image); if (im) { const s = Math.max(0, +slice || 0); return { img: im, rect: [0, 0, im.width, im.height], m: [s, s, s, s] }; } }
    const C = PDM.gameTheme.CHROME[skin] || PDM.gameTheme.CHROME.GREY_BUTTON_TR;
    return { img: want('game:interfaces/chrome.png'), rect: C.slice(0, 4), m: C.slice(4) };
  }
  function drawPatch(g, P, x, y, w, h, alpha, bright) {
    if (!P.img) { g.save(); g.globalAlpha *= alpha; g.fillStyle = 'rgba(60,60,56,.8)'; g.fillRect(x, y, w, h); g.restore(); return; }
    g.save(); g.globalAlpha *= Math.max(0, Math.min(1, alpha)); if (bright !== 1) g.filter = `brightness(${bright})`;
    nine(g, P.img, P.rect[0], P.rect[1], P.rect[2], P.rect[3], P.m, x, y, w, h); g.restore();
  }
  function drawIcon(g, R, name, x, y, alpha) {
    const r = R.icons[name], im = want('game:interfaces/icons.png'); if (!r || !im) return;
    g.save(); g.globalAlpha *= alpha; g.drawImage(im, r[0], r[1], r[2], r[3], x, y, r[2], r[3]); g.restore();
  }
  const iconSize = (R, name) => (R.icons[name] ? [R.icons[name][2], R.icons[name][3]] : [0, 0]);

  // ---------------- 배경 (6차까지의 미리보기 그대로 — 게임 배경은 무작위가 섞여 같은 순간을 그릴 수는 없음) ----------------
  const RUINS_LAYERS = () => [
    { image: 'game:splashes/title/back_clusters.png', fw: 450, fh: 250, cols: 1, frames: 2, count: 4, speed: 1.33, size: 0.5, dark: 0.5, spin: 20 },
    { image: 'game:splashes/title/back_clusters.png', fw: 450, fh: 250, cols: 1, frames: 2, count: 3, speed: 2, size: 1, dark: 0.25, spin: 20 },
    { image: 'game:splashes/title/front_small.png', fw: 112, fh: 116, cols: 9, frames: 36, count: 6, speed: 2.66, size: 1, dark: 0.2, spin: 20 },
    { image: 'game:splashes/title/mid_mixed.png', fw: 273, fh: 242, cols: 7, frames: 28, count: 3, speed: 3.54, size: 1, dark: 0.1, spin: 20 },
    { image: 'game:splashes/title/mid_mixed.png', fw: 273, fh: 242, cols: 7, frames: 28, count: 2, speed: 4.7, size: 1.5, dark: 0, spin: 20 },
    { image: 'game:splashes/title/front_small.png', fw: 112, fh: 116, cols: 9, frames: 36, count: 3, speed: 6.26, size: 2.25, dark: 0, spin: 20 }];
  const MOD2_LAYERS = Array.from({ length: 10 }, (_, i) => `game:interfaces/title${i}.png`);
  const MOD2_SPEED = [2 * .10, 4 * .14, 7 * .18, 11 * .22, 16 * .28, 22 * .34, 30 * .42, 40 * .52, 52 * .66, 66 * .82];
  const arr = v => (Array.isArray(v) ? v : []);
  const rnd = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const archStyleOf = bg => bg.archs === false ? 'none' : (bg.archStyle || 'game');
  function drawBackground(g, t, W, H, tt) {
    const bg = t.background || {}, archSt = archStyleOf(bg);
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    if (bg.color) { g.fillStyle = bg.color; g.fillRect(0, 0, W, H); }
    const mod2bg = archSt === 'game' && want(MOD2_LAYERS[0]);
    if (archSt === 'game') MOD2_LAYERS.forEach(want);
    const RU = bg.ruins && bg.ruins.on ? bg.ruins : null;
    const T4 = want('game:splashes/title/archs.png');
    const t4bg = archSt === 'game' && !mod2bg && (RU || T4);
    if (t4bg) {
      const wallImg = RU ? ((RU.wall || {}).show === false ? null : want((RU.wall || {}).image || 'game:splashes/title/archs.png')) : T4;
      const k0 = H / 450, port = W <= H, sp = (RU ? (RU.speed ?? 15) : 15) * k0 * (port ? 1 / 1.5 : 1);
      const dv = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[(RU && RU.dir) || 'up'] || [0, -1], vert = dv[1] !== 0;
      if (wallImg) {
        const wl = (RU && RU.wall) || {}, fw = wl.fw || 333, fh = wl.fh || 100, cols = Math.max(1, wl.cols || 3), nf = Math.max(1, wl.frames || 6);
        const aw = (fw - 9) * k0, ah = (fh - 5) * k0, step = vert ? ah : aw, off = tt * sp, o = ((off % step) + step) % step, base = Math.floor(off / step);
        if (aw > 0.5 && ah > 0.5) for (let y = 0; y * ah < H + ah * 2; y++) for (let x = 0; x * aw < W + aw * 2; x++) {
          const gy = vert ? (dv[1] < 0 ? base + y : -base + y) : y, gx = vert ? x : (dv[0] < 0 ? base + x : -base + x);
          const f = Math.floor(rnd(gy * 31 + gx * 7) * nf);
          let px = x * aw - aw / 2, py = y * ah - ah / 2;
          if (vert) py += dv[1] < 0 ? -o : o - ah; else px += dv[0] < 0 ? -o : o - aw;
          g.drawImage(wallImg, (f % cols) * fw, Math.floor(f / cols) * fh, fw, fh, px, py, fw * k0 + 0.5, fh * k0 + 0.5);
        }
      }
      if (!RU || RU.dark !== false) { const gd = g.createLinearGradient(0, 0, 0, H); gd.addColorStop(0, 'rgba(0,0,0,0)'); gd.addColorStop(1, 'rgba(0,0,0,0.5)'); g.fillStyle = gd; g.fillRect(0, 0, W, H); }
      const k2 = k0 * (port ? 1 / 1.5 : 1);
      (RU ? (RU.layers || RUINS_LAYERS()) : RUINS_LAYERS()).forEach((L, li) => {
        if (L.show === false || !L.image) return;
        const im = want(L.image); if (!im || !(im.width > 0)) return;
        const fw = L.fw || im.width, fh = L.fh || im.height, cols = Math.max(1, L.cols || 1), nf = Math.max(1, L.frames || 1), sz = L.size ?? 1, dark = L.dark || 0, spin = (L.spin ?? 20) * Math.PI / 180;
        const w2 = fw * k2 * sz, h2 = fh * k2 * sz, big = Math.max(w2, h2), span = (vert ? H : W) + big * 2, cross = vert ? W : H;
        for (let n = 0; n < (L.count ?? 3); n++) {
          const seed = li * 17 + n * 5.3, pos = tt * sp * (L.speed ?? 2) + rnd(seed) * span, cyc = Math.floor(pos / span), along = (pos % span) - big;
          const q = rnd(seed + cyc * 3.1 + 1) * (cross + big / 3) - big / 3, f = Math.floor(rnd(seed + cyc * 7.7 + 2) * nf), ang = (rnd(seed + cyc * 1.9 + 3) * 2 - 1) * spin;
          let x, y;
          if (vert) { x = q; y = dv[1] < 0 ? H - along : along - h2; } else { y = q; x = dv[0] < 0 ? W - along : along - w2; }
          g.save(); g.translate(x + w2 / 2, y + h2 / 2); g.rotate(ang); g.filter = dark > 0 ? `brightness(${1 - dark})` : 'none';
          g.drawImage(im, (f % cols) * fw, Math.floor(f / cols) * fh, fw, fh, -w2 / 2, -h2 / 2, w2, h2); g.restore();
        }
      });
    } else if (mod2bg) {
      MOD2_LAYERS.forEach((r, i) => {
        const im = want(r); if (!im || !(im.width > 0 && im.height > 0)) return;
        const k = H / im.height, tw = im.width * k, off = -(bg.archReverse ? -1 : 1) * MOD2_SPEED[i] * tt;
        let x = ((off % tw) + tw) % tw - tw;
        if (tw > 0.5) for (; x < W; x += tw) g.drawImage(im, x, 0, tw, H);
      });
      const th = H * 0.4;
      [[0, 0.4, 0x25], [0.4, 0.35, 0x20], [0.75, 0.25, 0x15]].forEach(([y0, hh, a]) => { g.fillStyle = `rgba(56,171,171,${a / 255})`; g.fillRect(0, y0 * th, W, hh * th); });
    } else if (archSt !== 'none') {
      const aim = bg.archImages || {}, A = archSt === 'classic' && aim.bg ? aim.bg : 'game:interfaces/arcs1.png', B = archSt === 'classic' && aim.fg ? aim.fg : 'game:interfaces/arcs2.png';
      const dir = archSt === 'classic' ? (bg.archDir || 'up') : (bg.archReverse ? 'down' : 'up'), aspd = archSt === 'classic' ? (bg.archSpeed ?? 20) : 20;
      [[A, 1], [B, 2]].forEach(([r, s]) => {
        const im = want(r); if (!im || !(im.width > 0 && im.height > 0)) return;
        const o = tt * aspd * s, vx = dir === 'left' ? -o : dir === 'right' ? o : 0, vy = dir === 'up' ? -o : dir === 'down' ? o : 0;
        const ox = ((vx % im.width) + im.width) % im.width, oy = ((vy % im.height) + im.height) % im.height;
        for (let x = ox - im.width - im.width / 4; x < W; x += im.width) for (let y = oy - im.height; y < H; y += im.height) g.drawImage(im, x, y);
      });
    }
    const gr = bg.gradient;
    if (gr && gr.enabled !== false && gr.color) {
      const from = gr.from || 'top', vert = from === 'top' || from === 'bottom';
      const lg = vert ? g.createLinearGradient(0, from === 'top' ? 0 : H, 0, from === 'top' ? H : 0) : g.createLinearGradient(from === 'left' ? 0 : W, 0, from === 'left' ? W : 0, 0);
      const c = gr.color, a = gr.alpha ?? 0.55, rgb = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) || 0).join(',');
      lg.addColorStop(0, `rgba(${rgb},${a})`); lg.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = lg; g.fillRect(0, 0, W, H);
    }
  }
  /** 그림 레이어 (layers[] — MakerTitle.Layer 와 같은 크기 맞춤 · 흐름) */
  function drawLayers(g, t, W, H, tt, front) {
    (t.layers || []).forEach(l => {
      if (!!l.front !== front) return;
      const im = want(l.image); if (!im) return;
      g.save();
      let a = l.alpha ?? 1; if (l.pulse) a += l.pulse * Math.sin(tt * (l.pulseSpeed || 1) * 6.2832); g.globalAlpha = Math.max(0, Math.min(1, a));
      if (l.blend === 'light') g.globalCompositeOperation = 'lighter';
      const sc = l.scale || 1;
      if (l.tile) {
        const tw = im.width * sc, th = im.height * sc, ox = (((l.scrollX || 0) * tt) % tw + tw) % tw, oy = (((l.scrollY || 0) * tt) % th + th) % th;
        for (let x = ox - tw; x < W + tw; x += tw) for (let y = oy - th; y < H + th; y += th) g.drawImage(im, x, y, tw, th);
      } else {
        let sx = 0, sy = 0, fw = im.width, fh = im.height;
        if (l.frame && l.frame[0] > 0 && l.frame[1] > 0) {
          fw = l.frame[0]; fh = l.frame[1];
          const fr = l.frames && l.frames.length ? l.frames : [0], idx = fr[Math.floor(tt * (l.fps || 6)) % fr.length] | 0, cols = Math.max(1, Math.floor(im.width / fw));
          sx = (idx % cols) * fw; sy = Math.floor(idx / cols) * fh;
        }
        let kx = sc, ky = sc;
        if (l.fit === 'cover') kx = ky = Math.max(W / fw, H / fh) * sc; else if (l.fit === 'contain') kx = ky = Math.min(W / fw, H / fh) * sc;
        else if (l.fit === 'width') kx = ky = W / fw * sc; else if (l.fit === 'height') kx = ky = H / fh * sc; else if (l.fit === 'stretch') { kx = W / fw * sc; ky = H / fh * sc; }
        const dw = fw * kx, dh = fh * ky, wrap = (v, size, scr) => { const span = scr + size; return (((v + size) % span) + span) % span - size; };
        let x = (l.x ?? 0.5) * W - (l.anchorX ?? 0.5) * dw + (l.offsetX || 0), y = (l.y ?? 0.5) * H - (l.anchorY ?? 0.5) * dh + (l.offsetY || 0);
        if (l.scrollX) x = wrap(x + l.scrollX * tt, dw, W); if (l.scrollY) y = wrap(y + l.scrollY * tt, dh, H);
        if (l.bob) y += l.bob * Math.sin(tt * (l.bobSpeed || 1) * 6.2832);
        if (l.spin) { g.translate(x + dw / 2, y + dh / 2); g.rotate((l.spin * tt) * Math.PI / 180); x = -dw / 2; y = -dh / 2; }
        g.drawImage(im, sx, sy, fw, fh, x, y, dw, dh);
      }
      g.restore();
    });
  }

  /** 날씨 · 입자 (MakerTitle.Weather 와 같은 종류 · 색 · 개수 · 속도 범위. 게임은 무작위로 움직여 같은 순간은 아님 — 여기서는 시간으로 정해진 자리) */
  function drawParticles(g, t, W, H, tt, logo, front) {
    const bg = t.background || {};
    let eff = bg.effect || 'none'; if (eff === 'none' || !!bg.effectFront !== front) return;
    const mana = eff === 'mana'; if (mana) eff = 'fireflies';
    const col = bg.effectColor || { rain: '#8fb8ff', embers: '#ff8a2a', sparkle: '#fff4a0', petals: '#ffa8c8', fireflies: mana ? '#9fd8ff' : '#c8ff6a' }[eff] || '#ffffff';
    const around = bg.effectArea === 'logo' || (mana && bg.effectArea !== 'screen');
    const [ax, ay, aw, ah] = around && logo ? [logo.x - logo.w * 0.3, logo.y - logo.h * 0.3, Math.max(8, logo.w * 1.6), Math.max(8, logo.h * 1.6)] : [0, 0, W, H];
    const n = Math.max(1, Math.round((eff === 'rain' ? 70 : eff === 'fireflies' ? 18 : 45) * Math.max(0.1, +bg.effectDensity || 1)));
    g.save(); g.fillStyle = col;
    for (let i = 0; i < n; i++) {
      const r1 = rnd(i * 3.7 + 1), r2 = rnd(i * 5.1 + 2), r3 = rnd(i * 7.3 + 3), ph = r3 * 6.28, sz = r3 < 0.33 ? 2 : 1;
      let x, y, a = 1, w = sz, hh = sz;
      const wrapv = (v, lo, span) => lo + (((v - lo) % span) + span) % span;
      if (eff === 'rain') { const vy = 160 + r2 * 60; y = wrapv(ay + r1 * ah + vy * tt, ay - 5, ah + 10); x = wrapv(ax + r2 * aw - 20 * tt, ax - 10, aw + 20); w = 1; hh = 4; }
      else if (eff === 'embers') { const vy = -(10 + r2 * 15); y = wrapv(ay + r1 * ah + vy * tt, ay - 6, ah + 8); x = wrapv(ax + r2 * aw + (r3 - 0.5) * 12 * tt, ax - 10, aw + 20); a = Math.max(0, Math.min(1, (y - ay) / ah)); }
      else if (eff === 'petals') { const vy = 10 + r2 * 10; y = wrapv(ay + r1 * ah + vy * tt, ay - 3, ah + 8); x = wrapv(ax + r2 * aw + (8 + r3 * 12) * tt + Math.sin(tt * 1.5 + ph) * 6, ax - 10, aw + 20); w = 2; hh = 1; }
      else if (eff === 'sparkle' || eff === 'fireflies') { x = wrapv(ax + r1 * aw + Math.sin(tt * 0.7 + ph) * 8, ax, aw); y = wrapv(ay + r2 * ah + Math.cos(tt * 0.6 + ph) * 8, ay, ah); a = 0.5 + 0.5 * Math.sin(tt * (eff === 'sparkle' ? 4 : 2) + ph); }
      else { const vy = 8 + r2 * 10; y = wrapv(ay + r1 * ah + vy * tt, ay - 3, ah + 8); x = wrapv(ax + r2 * aw + (r3 - 0.5) * 6 * tt + Math.sin(tt * 1.5 + ph) * 6, ax - 10, aw + 20); }
      g.globalAlpha = a; g.fillRect(x, y, w, hh);
    }
    g.restore();
  }

  // ---------------- 한 장면 계산 + 그리기 ----------------
  /** 미리보기 값 (게임은 실제 값) — 정보 칸 · 저장 상태 */
  function infoValues(R, opts) {
    const pj = (store && store.isOpen && store.get('project')) || {};
    const v = { gameName: pj.name || '', author: pj.author || '', version: R.version || '', versionCode: R.versionCode || '', date: new Date().toISOString().slice(0, 10) };
    v.saveCount = opts.hasSaves ? '1' : '0';
    if (opts.hasSaves) Object.assign(v, { lastHero: '전사', lastDepth: '3', lastLevel: '5' });   // 미리보기 예시 (게임에서는 실제 마지막 저장)
    return v;
  }
  /** t = title.json, S = screen(), opts = { tt(초), revealed, gateT(누른 뒤 초), states{버튼 id: 'hover'|...}, hover:[x,y], focus(버튼 id), window(창 id), hasSaves, winT(창 연 뒤 초) }
   *  → geo { W, H, logo, buttons[], elements[], windows[], version, exit } (편집 · 검사용 — 게임 MakerTitle.geo() 와 같은 칸) */
  function render(g, t, S, R, opts) {
    const { W, H, zoom } = S, tt = opts.tt || 0;
    const lg = t.logo || {}, gate = t.gate || {}, bs = t.buttons || {}, bg = t.background || {};
    const gateOn = !!gate.enabled, revealed = !gateOn || !!opts.revealed, revealT = gateOn ? Math.min(1, (opts.gateT || 0) * 2) : 1;
    const geo = { W, H, zoom, land: S.land, safe: S.safe, buttons: [], elements: [], windows: [] };
    if (g) drawBackground(g, t, W, H, tt);
    const info = infoValues(R, opts);
    // 요소 (뒤)
    const elems = arr(t.elements).filter(e => e && typeof e === 'object' && e.visible !== false);
    const elemGeo = el => {
      const area = el.safe === false ? { x: 0, y: 0, w: W, h: H } : S.safe;
      let L = null, size;
      if (el.type === 'text') { const b = M.bindText(el.text, info, el.fallback); L = textLayout(String(b.text).replace(/\\n/g, '\n'), Math.max(5, Math.trunc(+el.size || 8)), Math.trunc(+el.w || 0), zoom, el.align || 'center'); size = { w: L.w, h: L.h }; }
      else { const im = want(el.image), sc = Math.max(0.01, +el.scale || 1); size = im ? { w: im.width * sc, h: im.height * sc } : { w: 0, h: 0 }; }
      return { r: M.elementRect(el, area, size), L, size };
    };
    const drawElems = layer => elems.forEach(el => {
      if ((el.layer || 'back') !== layer || (el.type !== 'text' && el.type !== 'image')) return;
      const shown = M.elementShown(el, gateOn && !revealed);
      const E = elemGeo(el);
      geo.elements.push({ id: el.id, r: [E.r.x, E.r.y, E.r.w, E.r.h], vis: shown, text: E.L ? M.bindText(el.text, info, el.fallback).text : '', size: [E.size.w, E.size.h] });
      if (!g || !shown) return;
      const fxs = arr(el.effects).filter(f => f && typeof f === 'object').map(f => M.fxNorm(f)).filter(f => f.trigger === 'enter' || f.trigger === 'always');
      const v = M.fxCombine(fxs.map(f => M.fxValue(f, f.trigger === 'enter' ? (el.show === 'menu' ? opts.gateT || tt : tt) : tt)));
      const a = Math.max(0, Math.min(1, el.alpha ?? 1)) * v.alpha;
      if (E.L) drawText(g, E.L, E.r.tx + v.dx, E.r.y + v.dy, /^#[0-9a-f]{6}$/i.test(el.color || '') ? el.color : '#ffffff', a, zoom);
      else { const im = want(el.image); if (im) { const s = v.scale, w = E.size.w * s, h = E.size.h * s; g.save(); g.globalAlpha = a; if (v.bright !== 1) g.filter = `brightness(${v.bright})`; g.translate(E.r.x + E.size.w / 2 + v.dx, E.r.y + E.size.h / 2 + v.dy); g.rotate((+el.angle || 0) * Math.PI / 180); g.drawImage(im, -w / 2, -h / 2, w, h); g.restore(); } }
    });
    drawElems('back');
    // 로고
    const mode = lg.mode || 'game', lsc = +lg.scale || 1;
    let lsize = { w: 0, h: 0 }, logoText = null, subText = null;
    if (mode === 'game') lsize = { w: (S.land ? 240 : 139) * lsc, h: (S.land ? 57 : 100) * lsc };
    else if (mode === 'image') { const im = want(lg.image); if (im) lsize = { w: im.width * lsc, h: im.height * lsc }; }
    else if (mode === 'text') {
      logoText = textLayout(String(lg.text || '').replace(/\\n/g, '\n'), Math.max(6, Math.trunc(+lg.size || 16)), 0, zoom, 'center');
      lsize = { w: logoText.w, h: logoText.h };
      if (lg.subtitle) { subText = textLayout(lg.subtitle, 8, 0, zoom, 'center'); lsize.h += subText.h + 3; }
    }
    const logo = M.logoRect(lg, gate, W, H, lsize);
    geo.logo = [logo.x, logo.y, logo.w, logo.h];
    if (g) {
      let la = 1, lift = 0;
      if (gateOn) { const k = revealed ? M.ease('smooth', revealT) : 0; if ((gate.logoAfter || 'fade') === 'fade') { la = 1 - k; lift = -10 * k; } else if (gate.logoAfter === 'up') lift = -(logo.y - 4) * k; }
      const an = lg.anim || 'none'; let ax = 0, ay = 0, am = 1;
      if (an === 'float') ay = Math.sin(tt * 1.6) * 2; else if (an === 'sway') ax = Math.sin(tt * 1.2) * 3; else if (an === 'pulse') am = 0.8 + 0.2 * Math.sin(tt * 2);
      const lx = logo.x + ax, ly = logo.y + lift + ay;
      if (la > 0.01) {
        g.save(); g.globalAlpha = la * am;
        if (mode === 'game') {
          const im = want('game:interfaces/banners.png');
          if (im) {
            const [sx, sy, sw, sh] = S.land ? [0, 100, 240, 57] : [0, 0, 139, 100];
            g.drawImage(im, sx, sy, sw, sh, lx, ly, sw * lsc, sh * lsc);
            if (lg.glow !== false) { g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = la * (0.8 + 0.2 * Math.sin(tt * 2)); const [gx, gy] = S.land ? [240, 100] : [139, 0]; g.drawImage(im, gx, gy, sw, sh, lx, ly, sw * lsc, sh * lsc); g.restore(); }
            if (lg.torches !== false && la > 0.3) {   // 원작 Fireball (초록 불꽃) 흉내
              const pts = S.land ? [[30, 35], [lsize.w / lsc - 30, 35]] : [[16, 70], [lsize.w / lsc - 16, 70]];
              pts.forEach(([px, py], i) => { const cx = lx + px * lsc, cy = ly + (py - 30) * lsc, fl = 1 + 0.12 * Math.sin(tt * 11 + i);   // 원작 Fireball: 그 점 위로 서는 불꽃 (입자라 모양은 비슷하게만)
                const rg = g.createRadialGradient(cx, cy + 6 * lsc, 0, cx, cy, 16 * lsc * fl); rg.addColorStop(0, 'rgba(230,255,210,0.95)'); rg.addColorStop(0.35, 'rgba(110,240,90,0.85)'); rg.addColorStop(1, 'rgba(30,150,40,0)');
                g.fillStyle = rg; g.beginPath(); g.ellipse(cx, cy, 7 * lsc * fl, 17 * lsc * fl, 0, 0, 7); g.fill(); });
            }
          }
        } else if (mode === 'image') { const im = want(lg.image); if (im) g.drawImage(im, lx, ly, lsize.w, lsize.h); }
        else if (logoText) {
          drawText(g, logoText, W / 2 - logoText.w / 2 + ax, ly, lg.color || '#ffd966', 1, zoom);
          if (subText) drawText(g, subText, W / 2 - subText.w / 2 + ax, ly + logoText.h + 3, lg.subColor || '#cccccc', 1, zoom);
        }
        g.restore();
      }
      drawParticles(g, t, W, H, tt, logo, false);
      drawLayers(g, t, W, H, tt, false);
    }
    // "화면을 누르세요"
    if (g && gateOn) {
      const pa = revealed ? 1 - M.ease('smooth', revealT * 2) : 1;
      if (pa > 0.01) { const P = textLayout(gate.text || '화면을 누르세요', 8, 0, zoom, 'left'); drawText(g, P, (W - P.w) / 2, Math.min(H - P.h - 12, logo.y + logo.h + 12), gate.color || '#dddddd', pa * (gate.blink !== false ? 0.55 + 0.45 * Math.sin(tt * 3) : 1), zoom); }
    }
    // 버튼
    const ctx = { hasSaves: !!opts.hasSaves, canQuit: S.desktop || opts.android !== false };
    const list = M.buttonList(bs, ctx);
    const places = list.map(e => e.item && e.item.place);
    const rects = M.buttonRects(bs, list.length, W, H, S.land, { y: logo.y, h: logo.h }, gate, places);
    const clock = gateOn ? (opts.gateT || 0) : tt;
    list.forEach((e, i) => {
      const it = e.item || {}, label = it.label || (e.gameIndex >= 0 ? (R.labels[e.id] || PDM.TITLE_BUTTONS[e.id] || e.id) : e.id);
      const ga = M.groupAnim(bs.anim, gateOn, revealed, false, 0, clock, tt, i, rects[i][2], 0);
      const forced = opts.states && opts.states[e.id];
      const hover = forced === 'hover' || (!!opts.hover && !opts.window && opts.hover[0] >= rects[i][0] && opts.hover[0] < rects[i][0] + rects[i][2] && opts.hover[1] >= rects[i][1] && opts.hover[1] < rects[i][1] + rects[i][3]);
      const flags = { hover, focus: forced === 'focus' || opts.focus === e.id, pressed: forced === 'pressed', disabled: forced === 'disabled' || e.disabled };
      const accent = e.id === 'support' && !it.label ? PDM.gameTheme.color('accent') : null;
      const st = M.resolveStyle(bs, e.item, flags, { accent, chrome: PDM.gameTheme.CHROME });
      const fxs = arr(it.effects).filter(f => f && typeof f === 'object').map(f => M.fxNorm(f));
      const v = M.fxCombine(fxs.map(f => {
        const held = f.trigger === 'hover' ? flags.hover && !flags.disabled : f.trigger === 'focus' ? flags.focus : false;
        if (f.trigger === 'enter') return M.fxValue(f, clock - i * ga.stagger);
        if (f.trigger === 'always') return M.fxValue(f, tt);
        if (f.trigger === 'click') return opts.clickAt && opts.clickAt[e.id] !== undefined ? M.fxValue(f, Math.max(0, tt - opts.clickAt[e.id])) : { dx: 0, dy: 0, scale: 1, alpha: 1, bright: 1 };   // 캔버스에서 누르면 그때부터
        return M.fxValue(f, held ? (opts.heldT !== undefined ? opts.heldT : f.delay + f.duration * (f.repeat < 0 ? 0.5 : f.repeat + 1)) : 0);
      }));
      const bx0 = rects[i][0] + ga.dx + (rects[i][2] - ga.bw) / 2, by0 = rects[i][1] + ga.dy, bw = ga.bw, bh = rects[i][3];
      const sc = st.scale * v.scale, nw = bw * sc, nh = bh * sc;
      const x = bx0 + (bw - nw) / 2 + v.dx, y = by0 + (bh - nh) / 2 + v.dy + st.dy;
      const a = ga.alpha * st.alpha * v.alpha;
      geo.buttons.push({ id: e.id, label, base: rects[i], r: [x, y, nw, nh], a, dis: flags.disabled, hover: flags.hover, focus: flags.focus, pressed: flags.pressed, skin: st.skin, tc: st.textColor, bright: st.bright * v.bright, vis: a > 0.01 });
      if (!g || a <= 0.01) return;
      drawPatch(g, patchOf(st.skin, st.image, st.slice), x, y, nw, nh, a, st.bright * v.bright);
      let icon = it.icon || ''; if (!icon && e.gameIndex >= 0) icon = M.GAME_BUTTONS[e.gameIndex][2];
      const isz = icon && icon !== 'NONE' ? iconSize(R, icon) : [0, 0];
      const L = textLayout(label, Math.max(5, Math.trunc(+it.size || 9)), 0, zoom, 'left');
      let cw = 0; if (isz[0]) cw += isz[0] + 2; if (label) cw += L.w + 2;
      if (label) drawText(g, L, x + (nw + cw) / 2 - L.w - 1, y + (nh - L.h) / 2, st.textColor, a * st.textAlpha, zoom);
      if (isz[0]) drawIcon(g, R, icon, x + (nw - cw) / 2 + 1, y + (nh - isz[1]) / 2, a * (flags.disabled ? 1 : 1));
    });
    drawElems('front');
    if (g) { drawLayers(g, t, W, H, tt, true); drawParticles(g, t, W, H, tt, logo, true); }
    // 버전 · 종료 · 화면 감추기
    const ver = t.version || {};
    if (ver.visible !== false && g) {
      const txt = ver.text || ('v' + (R.version || '?'));
      const L = textLayout(txt, ver.text ? 6 : 5, 0, zoom, 'left');
      drawText(g, L, W - L.w - 4, H - L.h - 2, '#888888', 1, zoom);
    }
    if (S.desktop && (t.exit || {}).visible !== false) { geo.exit = [W - 20, 0, 20, 20]; if (g) { const s = iconSize(R, 'EXIT'); drawIcon(g, R, 'EXIT', W - 20 + (20 - s[0]) / 2, (20 - s[1]) / 2, 1); } }
    if (g && (t.hideButton ?? !!PDM.gameTitle4) && revealed) { const s = iconSize(R, 'CHEVRON'); const r = R.icons.CHEVRON, im = want('game:interfaces/icons.png'); if (r && im) { g.save(); g.translate(W / 2, H - 8); g.rotate(Math.PI); g.drawImage(im, r[0], r[1], r[2], r[3], -s[0] / 2, -s[1] / 2, s[0], s[1]); g.restore(); } }
    // 창 (미리보기로 고른 창 하나 + 그 창이 연 창은 없음)
    if (opts.window) {
      const w = arr(t.windows).find(x => x && typeof x === 'object' && x.id === opts.window);
      if (w) geo.windows.push(drawWindow(g, t, w, S, R, info, opts));
    }
    return geo;
  }
  /** 창 하나 (게임 TitleWnd 와 같은 배치 — MakerTitleModel.windowLayout) */
  function drawWindow(g, t, w, S, R, info, opts) {
    const { W, H, zoom } = S, bs = { states: (t.buttons || {}).states };   // 창 안 버튼도 타이틀 버튼 묶음의 상태 모양 (런타임과 같음)
    const P = patchOf(w.skin || 'WINDOW', w.image, w.slice ?? 6);
    const pad = Math.max(0, Math.trunc(+w.padding || (w.padding === 0 ? 0 : 4))), ww = Math.max(40, Math.trunc(+w.w || 120)), cw = ww - pad * 2;
    const closeBtn = w.closeButton !== false;
    const ttl = M.bindText(w.title || '', info, '').text;
    const TL = ttl ? textLayout(ttl, 9, ww - pad * 2 - (closeBtn ? 12 : 0), zoom, 'left') : null;
    const content = arr(w.content).map(c => c && typeof c === 'object' ? c : {});   // 손상된 칸 = 빈 내용 (자리는 규칙대로 0)
    const made = content.map(c => {
      if (c.type === 'text') { const L = textLayout(String(M.bindText(c.text, info, c.fallback).text).replace(/\\n/g, '\n'), Math.max(5, Math.trunc(+c.size || 7)), cw, zoom, c.align || 'left'); return { L, h: L.h, w: L.w }; }
      if (c.type === 'image') { const im = want(c.image), sc = Math.max(0.01, +c.scale || 1); return im ? { im, h: im.height * sc, w: im.width * sc } : { h: 0, w: 0 }; }
      return { h: 0, w: 0 };
    });
    const L = M.windowLayout(w, W, H, S.safe, P.m, made.map(m => ({ h: m.h, w: m.w })), TL ? TL.h : 0);
    const out = { id: w.id, chrome: [L.chrome.x, L.chrome.y, L.chrome.w, L.chrome.h], items: L.items.map(r => [r.x, r.y, r.w, r.h]), overflow: L.overflow, tooTall: L.tooTall };
    if (!g) return out;
    const an = (w.anim || {}).type || 'fade', dur = Math.max(0.01, +((w.anim || {}).duration) || 0.2);
    const k = M.ease('smooth', Math.min(1, (opts.winT ?? 1) / dur)), a = an === 'none' ? 1 : k, dy = an === 'slideUp' ? Math.round(12 * (1 - k)) : an === 'slideDown' ? -Math.round(12 * (1 - k)) : 0;
    g.save(); g.translate(0, dy);
    g.fillStyle = `rgba(0,0,0,${0.5 * a * 0.6})`; g.fillRect(L.chrome.x - 2, L.chrome.y - 2, L.chrome.w + 4, L.chrome.h + 4);   // 원작 ShadowBox 흉내
    drawPatch(g, P, L.chrome.x, L.chrome.y, L.chrome.w, L.chrome.h, a, 1);
    if (TL) drawText(g, TL, L.title.x, L.title.y, /^#[0-9a-f]{6}$/i.test(w.titleColor || '') ? w.titleColor : PDM.gameTheme.color('accent'), a, zoom);
    if (L.close) drawIcon(g, R, 'CLOSE', L.close.x, L.close.y, a);
    content.forEach((c, i) => {
      const r = L.items[i], m = made[i];
      if (c.type === 'text') drawText(g, m.L, c.align === 'center' ? r.x + (r.w - m.L.w) / 2 : c.align === 'right' ? r.x + r.w - m.L.w : r.x, r.y, /^#[0-9a-f]{6}$/i.test(c.color || '') ? c.color : '#ffffff', a, zoom);
      else if (c.type === 'image' && m.im) { g.save(); g.globalAlpha = a; g.drawImage(m.im, r.x, r.y, m.w, m.h); g.restore(); }
      else if (c.type === 'divider') { g.save(); g.globalAlpha = a; g.fillStyle = /^#[0-9a-f]{6}$/i.test(c.color || '') ? c.color : '#888888'; g.fillRect(r.x, r.y, r.w, r.h); g.restore(); }
      else if (c.type === 'scroll') {
        const SL = textLayout(String(M.bindText(c.text, info, '').text).replace(/\\n/g, '\n'), Math.max(5, Math.trunc(+c.size || 6)), r.w - 2, zoom, 'left');
        g.save(); g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip(); drawText(g, SL, r.x, r.y, /^#[0-9a-f]{6}$/i.test(c.color || '') ? c.color : '#dddddd', a, zoom); g.restore();
        if (SL.h > r.h) { g.save(); g.globalAlpha = a * 0.5; g.fillStyle = '#7b8073'; g.fillRect(r.x + r.w - 1, r.y, 1, r.h * r.h / SL.h); g.restore(); }   // 원작 ScrollPane 막대
      } else if (c.type === 'button') {
        const flags = { disabled: c.enabled === false || (c.action === 'continue' && !opts.hasSaves && (c.noSave || 'disable') === 'disable') };
        const st = M.resolveStyle(bs, c, flags, { chrome: PDM.gameTheme.CHROME });
        drawPatch(g, patchOf(st.skin, st.image, st.slice), r.x, r.y, r.w, r.h, a * st.alpha, st.bright);
        const BL = textLayout(c.label || '', Math.max(5, Math.trunc(+c.size || 9)), 0, zoom, 'left');
        drawText(g, BL, r.x + (r.w - BL.w) / 2, r.y + (r.h - BL.h) / 2, st.textColor, a * st.alpha * st.textAlpha, zoom);
      } else if (c.type === 'setting') {
        const vol = c.key === 'musicVol' || c.key === 'sfxVol';
        const label = c.label || R.settings[{ music: 'music_mute', sound: 'sfx_mute', musicVol: 'music_vol', sfxVol: 'sfx_vol' }[c.key]] || M.SETTINGS[c.key] || c.key;
        if (vol) {   // 원작 OptionSlider: 가운데 제목 · 0 / 10 · 눈금 11개 · 손잡이
          const TT = textLayout(label, 9, 0, zoom, 'left'); drawText(g, TT, r.x + (r.w - TT.w) / 2, r.y + 2, '#ffffff', a, zoom);
          g.save(); g.globalAlpha = a; g.fillStyle = '#222'; const by = r.y + r.h - 7; g.fillRect(r.x + 2, by, r.w - 5, 1);
          for (let k2 = 0; k2 <= 10; k2++) g.fillRect(r.x + 2 + (r.w - 5) / 10 * k2, by - 4, 1, 9);
          g.fillStyle = '#ccc'; g.fillRect(r.x + (r.w - 5) / 10 * 7, by - 3, 4, 7); g.restore();
        } else {     // 원작 CheckBox (빨간 단추 + 체크)
          drawPatch(g, patchOf('RED_BUTTON', '', 0), r.x, r.y, r.w, r.h, a, 1);
          const TT = textLayout(label, 9, 0, zoom, 'left'); drawText(g, TT, r.x + (r.h - TT.h) / 2, r.y + (r.h - TT.h) / 2, '#ffffff', a, zoom);
          const s = iconSize(R, 'UNCHECKED'); drawIcon(g, R, 'UNCHECKED', r.x + r.w - (r.h - s[1]) / 2 - s[0], r.y + (r.h - s[1]) / 2, a);
        }
      }
    });
    g.restore();
    return out;
  }

  // ---------------- 미리보기 부품 (캔버스 + 편집 겹) ----------------
  /** 하나의 미리보기. o = { onPick(sel), onMove(sel, dx, dy, end), onResize(sel, dw, dh, end), getState() }
   *  → { el, canvas, overlay, set(t, opts), play(), pause(), restart(), stop(), geo } — requestAnimationFrame 하나 · 탭에서 사라지면 멈춤 */
  function create(o) {
    o = o || {};
    const canvas = h('canvas', { class: 'tp-canvas' }), overlay = h('canvas', { class: 'tp-overlay', tabindex: '0' });
    const el = h('div', { class: 'tp-stage' }, canvas, overlay);
    const g = canvas.getContext('2d'), og = overlay.getContext('2d');
    let errShown = false, lastOpts = null, t = null, opts = {}, S = null, R = res || { icons: {}, labels: {}, settings: {} }, playing = true, stopped = false, raf = 0, t0 = performance.now(), paused = 0, geo = null, lastSize = '';
    resources().then(r => { R = r; draw(); });
    function size() {
      const key = `${S.W}x${S.H}x${S.zoom}`; if (key === lastSize) return; lastSize = key;
      canvas.width = overlay.width = S.W * S.zoom; canvas.height = overlay.height = S.H * S.zoom;
      el.style.aspectRatio = `${S.W} / ${S.H}`;
    }
    const now = () => playing ? (performance.now() - t0) / 1000 : paused;
    function draw() {
      if (!t || !S) return;
      size();
      const tt = now();
      g.setTransform(S.zoom, 0, 0, S.zoom, 0, 0); g.imageSmoothingEnabled = false;
      const st = o.getState ? o.getState() : {};
      try {
        lastOpts = Object.assign({ tt, gateT: st.revealAt !== undefined ? tt - st.revealAt : 9, revealed: st.revealed, winT: st.winAt !== undefined ? tt - st.winAt : 9, hover: opts.hoverPt }, opts, st.opts || {});
        geo = render(g, st.data || t, S, R, lastOpts);
      } catch (e) {   // 손상된 값 등 — 멈추지 않고 알림 (검사 F7 이 이유를 보여 줌)
        if (!errShown) { console.warn('타이틀 미리보기:', e); errShown = true; }
        g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(0, 0, canvas.width, 28 * S.zoom / 3); g.fillStyle = '#ff8888'; g.font = `${12 * S.zoom / 3}px sans-serif`; g.fillText('미리보기를 그리지 못했습니다 — 검사(F7)를 보세요: ' + e.message, 6, 18 * S.zoom / 3);
        return;
      }
      drawOverlay(st);
    }
    function drawOverlay(st) {
      og.setTransform(S.zoom, 0, 0, S.zoom, 0, 0); og.clearRect(0, 0, S.W, S.H);
      if (!st || !st.outlines) return;
      const box = (r, color, w) => { if (!r) return; og.lineWidth = w / S.zoom * 1.5; og.strokeStyle = color; og.strokeRect(r[0], r[1], r[2], r[3]); };
      og.setLineDash([2 / S.zoom * 2, 2 / S.zoom * 2]);
      if (geo.logo && geo.logo[2] > 0) box(geo.logo, 'rgba(255,210,63,.55)', 1);
      geo.buttons.forEach(b => box(b.r, 'rgba(79,163,255,.5)', 1));
      geo.elements.forEach(e => box(e.r, 'rgba(47,214,196,.55)', 1));
      geo.windows.forEach(w => { box(w.chrome, 'rgba(255,140,220,.6)', 1); w.items.forEach(r => box(r, 'rgba(255,140,220,.35)', 1)); });
      og.setLineDash([]);
      const sr = selRect(st.sel);
      if (sr) { box(sr, '#2fd6c4', 2); og.fillStyle = '#2fd6c4'; const hs = 4 / S.zoom * 2; og.fillRect(sr[0] + sr[2] - hs / 2, sr[1] + sr[3] - hs / 2, hs, hs); }
      if (S.safe && (S.safe.x || S.safe.y || S.safe.w < S.W || S.safe.h < S.H)) { og.setLineDash([3 / S.zoom * 2, 3 / S.zoom * 2]); box([S.safe.x, S.safe.y, S.safe.w, S.safe.h], 'rgba(255,90,90,.6)', 1); og.setLineDash([]); }
    }
    /** 선택 → 화면 자리 */
    function selRect(sel) {
      if (!sel || !geo) return null;
      const [kind, id, j] = sel.split(':');
      if (kind === 'logo') return geo.logo;
      if (kind === 'button') { const b = geo.buttons.find(x => x.id === id); return b ? b.r : null; }
      if (kind === 'element') { const e = geo.elements.find(x => x.id === id); return e ? e.r : null; }
      if (kind === 'window') { const w = geo.windows.find(x => x.id === id); return w ? w.chrome : null; }
      if (kind === 'content') { const w = geo.windows.find(x => x.id === id); return w ? w.items[+j] : null; }
      if (kind === 'buttons' && geo.buttons.length) { const xs = geo.buttons.map(b => b.base); const x0 = Math.min(...xs.map(r => r[0])), y0 = Math.min(...xs.map(r => r[1])); return [x0, y0, Math.max(...xs.map(r => r[0] + r[2])) - x0, Math.max(...xs.map(r => r[1] + r[3])) - y0]; }
      return null;
    }
    /** 그 자리에 있는 것 (위에 그린 것부터) */
    function hit(x, y) {
      const inR = r => r && x >= r[0] && x < r[0] + r[2] && y >= r[1] && y < r[1] + r[3];
      for (const w of geo.windows.slice().reverse()) { for (let j = w.items.length - 1; j >= 0; j--) if (inR(w.items[j])) return `content:${w.id}:${j}`; if (inR(w.chrome)) return 'window:' + w.id; }
      for (const e of geo.elements.slice().reverse()) if (e.vis && inR(e.r)) return 'element:' + e.id;
      for (const b of geo.buttons.slice().reverse()) if (b.vis && inR(b.r)) return 'button:' + b.id;
      if (inR(geo.logo)) return 'logo';
      return 'background';
    }
    const toUI = ev => { const b = overlay.getBoundingClientRect(); return [(ev.clientX - b.left) / b.width * S.W, (ev.clientY - b.top) / b.height * S.H]; };
    let drag = null;
    overlay.addEventListener('pointerdown', ev => {
      if (!S || !geo) return;
      const [x, y] = toUI(ev), st = o.getState ? o.getState() : {};
      const sr = selRect(st.sel), hs = 6 / S.zoom * 2;
      const onHandle = sr && Math.abs(x - (sr[0] + sr[2])) <= hs && Math.abs(y - (sr[1] + sr[3])) <= hs;
      const sel = onHandle ? st.sel : hit(x, y);
      if (!onHandle && o.onPick) o.onPick(sel);
      drag = { sel, x, y, resize: onHandle, moved: false };
      overlay.setPointerCapture(ev.pointerId); overlay.focus();
    });
    overlay.addEventListener('pointermove', ev => {
      if (!S) return;
      const [x, y] = toUI(ev);
      if (!drag) { opts.hoverPt = [x, y]; return; }
      const dx = x - drag.x, dy = y - drag.y; if (Math.abs(dx) + Math.abs(dy) > 0.5) drag.moved = true;
      if (drag.moved) (drag.resize ? o.onResize : o.onMove) && (drag.resize ? o.onResize : o.onMove)(drag.sel, dx, dy, false);
    });
    overlay.addEventListener('pointerup', ev => {
      if (!drag) return;
      const [x, y] = toUI(ev), d = drag; drag = null;
      if (d.moved) (d.resize ? o.onResize : o.onMove) && (d.resize ? o.onResize : o.onMove)(d.sel, x - d.x, y - d.y, true);
    });
    overlay.addEventListener('pointerleave', () => { delete opts.hoverPt; });
    overlay.addEventListener('keydown', ev => { if (o.onKey && o.onKey(ev)) ev.preventDefault(); });
    let frames = 0;
    function loop() {
      raf = 0; frames++;
      if (stopped) return;
      if (!el.isConnected) return;                                   // 다시 그리는 중(잠깐 떼어짐) · 탭을 닫음 — 쉼 (다시 붙으면 set 이 깨움, 탭을 닫으면 편집기가 stop)
      if (!el.offsetParent) { raf = requestAnimationFrame(() => setTimeout(loop, 250)); return; }   // 숨은 탭: 그리지 않고 가끔 확인만
      draw();
      if (playing) raf = requestAnimationFrame(loop);
    }
    function kick() { if (!raf && !stopped) raf = requestAnimationFrame(loop); }
    function stop() { stopped = true; park(); }
    /** 쉬기: 예약한 다음 그림을 취소 (다시 그릴 때마다 · 탭을 닫을 때 — set() 이 다시 깨움). 남는 타이머 없음 */
    function park() { if (raf) cancelAnimationFrame(raf); raf = 0; }
    return {
      el, canvas, overlay,
      get geo() { return geo; }, get screen() { return S; }, get lastOpts() { return lastOpts; }, get debug() { return { frames, raf, stopped, playing, connected: el.isConnected, op: !!el.offsetParent }; }, get playing() { return playing; }, get time() { return now(); },
      set(nt, nopts) { t = nt; opts = Object.assign({}, nopts || {}, opts.hoverPt ? { hoverPt: opts.hoverPt } : {}); S = screen((nopts || {}).screen); draw(); kick(); },
      play() { if (!playing) { t0 = performance.now() - paused * 1000; playing = true; kick(); } },
      pause() { if (playing) { paused = now(); playing = false; draw(); } },
      restart() { t0 = performance.now(); paused = 0; draw(); kick(); },
      redraw() { draw(); },
      stop, park, wake: () => { draw(); kick(); }
    };
  }
  const h = PDM.h;
  const api = { resources, screen, SCREENS, textLayout, wordWidth, render, create, clearImages, patchOf, infoValues, simulateWindow: false };
  return api;
})();
