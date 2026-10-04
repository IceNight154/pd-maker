// ================================================================
//  노드 합성기 (확장 기능 "compose") — 노드를 이어서 배경 · 오브젝트 스프라이트를 만드는 그림 합성 도구
//    데이터: compose.json { list: [ { id, name, w, h, out(저장 경로), nodes: [ { id, type, x, y, p: {…} } ], links: [ { from, to, port } ] } ] }
//    노드마다 출력은 그림 한 장 (w×h 캔버스). links: from 노드의 출력 → to 노드의 입력 칸(port: a | b)
//    "출력" 노드에 이어진 그림이 결과 — PNG 로 저장 (assets/compose/<id>.png 또는 정한 경로) → 스프라이트 · 타일셋 · 일러스트 고르기에서 씀
//    계산은 편집기에서만 (게임에는 결과 PNG 만 들어감)
//    PDM.compose = { TYPES, evaluate(graph) → Promise<canvas>, render(graph, nodeId) }
// ================================================================
(function () {
  const { h, store } = PDM;
  const K = 'compose';
  const list = () => (store.get(K) || {}).list || [];

  // ---------------------------------------------------------------- 그림 도우미
  const mk = (w, hh) => { const c = document.createElement('canvas'); c.width = w; c.height = hh; return c; };
  const cx = c => { const g = c.getContext('2d', { willReadFrequently: true }); g.imageSmoothingEnabled = false; return g; };
  const rgb = s => { const m = /^#?([0-9a-f]{6})$/i.exec(String(s || '')); const n = m ? parseInt(m[1], 16) : 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  /** 씨앗으로 정해지는 난수 0~1 */
  const hash = (x, y, s) => { let n = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; n = (n ^ (n >>> 13)) * 1274126177 | 0; return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
  /** 칸마다 계산해서 채움: fn(x, y, 원래 [r,g,b,a]) → [r,g,b,a] */
  function perPixel(src, w, hh, fn) {
    const out = mk(w, hh), g = cx(out);
    const img = src ? cx(src).getImageData(0, 0, w, hh) : g.createImageData(w, hh), d = img.data, px = [0, 0, 0, 0];
    for (let y = 0, i = 0; y < hh; y++) for (let x = 0; x < w; x++, i += 4) {
      px[0] = d[i]; px[1] = d[i + 1]; px[2] = d[i + 2]; px[3] = d[i + 3];
      const r = fn(x, y, px); d[i] = r[0]; d[i + 1] = r[1]; d[i + 2] = r[2]; d[i + 3] = r[3];
    }
    g.putImageData(img, 0, 0); return out;
  }
  const hsv2rgb = (hh, s, v) => { const f = n => { const k = (n + hh / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); }; return [f(5) * 255, f(3) * 255, f(1) * 255]; };
  const rgb2hsv = (r, g, b) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let hh = 0;
    if (d) hh = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [hh * 60, mx ? d / mx : 0, mx]; };
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  // ---------------------------------------------------------------- 노드 종류
  //  ins: 입력 칸 이름들 · params: [키, 라벨, 종류(num|color|select|bool|image|text), 기본값, 옵션] · run(c, 입력 캔버스들, 값) → 캔버스
  // 숫자 칸에는 숫자 대신 식을 쓸 수 있음 (애니메이션): t = 0~1 (한 바퀴) · frame · frames · pi · sin cos abs floor min max · rand(n)
  const CUR = { t: 0, frame: 0, frames: 1 }, exprs = {};
  function expr(src) {
    if (exprs[src] !== undefined) return exprs[src];
    let f = null;
    if (/^[\w\s+\-*/%().,<>=?:!&|]+$/.test(src) && (src.match(/[A-Za-z_]\w*/g) || []).every(w => ['t', 'frame', 'frames', 'pi', 'sin', 'cos', 'abs', 'floor', 'min', 'max', 'rand'].includes(w))) {
      try { f = new Function('t', 'frame', 'frames', 'pi', 'sin', 'cos', 'abs', 'floor', 'min', 'max', 'rand', '"use strict"; return (' + src + ');'); f(0, 0, 1, Math.PI, Math.sin, Math.cos, Math.abs, Math.floor, Math.min, Math.max, () => 0); } catch (_) { f = null; }
    }
    return (exprs[src] = f);
  }
  const N = (v, d) => {
    if (typeof v === 'number') return isFinite(v) ? v : d;
    const str = String(v ?? '').trim(); if (str === '') return d;
    if (/^-?\d*\.?\d+$/.test(str)) return parseFloat(str);
    const f = expr(str); if (!f) return d;
    try { const r = +f(CUR.t, CUR.frame, CUR.frames, Math.PI, Math.sin, Math.cos, Math.abs, Math.floor, Math.min, Math.max, n => hash(n | 0, CUR.frame, 7)); return isFinite(r) ? r : d; } catch (_) { return d; }
  };
  PDM.composeExprOk = v => typeof v === 'number' || /^-?\d*\.?\d+$/.test(String(v).trim()) || !!expr(String(v).trim());
  const TYPES = {
    // ---- 입력
    image: { cat: '입력', name: '그림 파일', ins: [], params: [['file', '그림 (프로젝트 · game:경로)', 'image', ''], ['fit', '맞추기', 'select', 'tile', { tile: '원래 크기로 반복 (타일)', stretch: '크기에 맞게 늘림', center: '가운데에 한 번', topleft: '왼쪽 위에 한 번' }],
      ['sx', '잘라 올 곳 x', 'num', 0], ['sy', '잘라 올 곳 y', 'num', 0], ['sw', '잘라 올 가로 (0 = 전체)', 'num', 0], ['sh', '잘라 올 세로 (0 = 전체)', 'num', 0]],
      async run(c, ins, p) {
        const o = mk(c.w, c.h), g = cx(o); let im = null;
        try { im = p.file ? await PDM.assets.load(p.file) : null; } catch (_) { im = null; }
        if (!im || !im.width) return o;
        const sw = N(p.sw, 0) > 0 ? N(p.sw, 0) : im.width - N(p.sx, 0), sh = N(p.sh, 0) > 0 ? N(p.sh, 0) : im.height - N(p.sy, 0), sx = N(p.sx, 0), sy = N(p.sy, 0);
        if (sw <= 0 || sh <= 0) return o;
        if (p.fit === 'stretch') g.drawImage(im, sx, sy, sw, sh, 0, 0, c.w, c.h);
        else if (p.fit === 'center') g.drawImage(im, sx, sy, sw, sh, Math.round((c.w - sw) / 2), Math.round((c.h - sh) / 2), sw, sh);
        else if (p.fit === 'topleft') g.drawImage(im, sx, sy, sw, sh, 0, 0, sw, sh);
        else for (let y = 0; y < c.h; y += sh) for (let x = 0; x < c.w; x += sw) g.drawImage(im, sx, sy, sw, sh, x, y, sw, sh);
        return o; } },
    paint: { cat: '입력', name: '직접 그리기', ins: [], params: [['file', '그린 그림 (아래 "그리기"로 만듦)', 'paint', '']],
      async run(c, ins, p) { const o = mk(c.w, c.h); try { const im = p.file ? await PDM.assets.load(p.file) : null; if (im && im.width) cx(o).drawImage(im, 0, 0); } catch (_) { /* 아직 안 그림 */ } return o; } },
    color: { cat: '입력', name: '단색', ins: [], params: [['color', '색', 'color', '#4b3f73'], ['alpha', '불투명도 (0~100)', 'num', 100]],
      run(c, ins, p) { const o = mk(c.w, c.h), g = cx(o); g.globalAlpha = clamp(N(p.alpha, 100) / 100, 0, 1); g.fillStyle = p.color || '#000'; g.fillRect(0, 0, c.w, c.h); return o; } },
    gradient: { cat: '입력', name: '그라데이션', ins: [], params: [['kind', '모양', 'select', 'linear', { linear: '직선', radial: '원형' }], ['c1', '색 1', 'color', '#231b3b'], ['c2', '색 2', 'color', '#a58bff'], ['angle', '각도 (직선 · 90 = 위→아래)', 'num', 90],
      ['steps', '단계 수 (0 = 부드럽게 · 픽셀 느낌은 4~8)', 'num', 6], ['dither', '경계에 디더링', 'bool', false]],
      run(c, ins, p) { const a = rgb(p.c1), b = rgb(p.c2), an = N(p.angle, 90) * Math.PI / 180, dx = Math.cos(an), dy = Math.sin(an), steps = Math.max(0, Math.round(N(p.steps, 0)));
        const ext = Math.abs(dx) * c.w + Math.abs(dy) * c.h || 1;
        return perPixel(null, c.w, c.h, (x, y) => {
          let t = p.kind === 'radial' ? Math.hypot((x + .5) / c.w - .5, (y + .5) / c.h - .5) * 2 : (((x + .5) - c.w / 2) * dx + ((y + .5) - c.h / 2) * dy) / ext + .5;
          t = clamp(t, 0, 1);
          if (steps > 1) { let u = t * (steps - 1); if (p.dither) u += (BAYER[(x & 3) + (y & 3) * 4] / 16 - .5) * .9; t = clamp(Math.round(u), 0, steps - 1) / (steps - 1); }
          const m = mixc(a, b, t); return [m[0], m[1], m[2], 255]; }); } },
    noise: { cat: '입력', name: '노이즈', ins: [], params: [['scale', '덩어리 크기 (px)', 'num', 8], ['octaves', '겹 수 (1~5)', 'num', 3], ['seed', '씨앗', 'num', 1], ['contrast', '대비 (%)', 'num', 100], ['tile', '이어 붙여도 끊기지 않게', 'bool', true]],
      run(c, ins, p) { const sc = Math.max(1, N(p.scale, 8)), oc = clamp(Math.round(N(p.octaves, 3)), 1, 5), seed = N(p.seed, 1) | 0, ct = N(p.contrast, 100) / 100;
        const val = (x, y, s, o) => { const gx = Math.floor(x / s), gy = Math.floor(y / s), fx = x / s - gx, fy = y / s - gy, wx = Math.max(1, Math.round(c.w / s)), wy = Math.max(1, Math.round(c.h / s));
          const m = (a, b) => p.tile ? ((a % b) + b) % b : a, hv = (a, b) => hash(m(a, wx), m(b, wy), seed + o * 97);
          const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
          return (hv(gx, gy) * (1 - u) + hv(gx + 1, gy) * u) * (1 - v) + (hv(gx, gy + 1) * (1 - u) + hv(gx + 1, gy + 1) * u) * v; };
        return perPixel(null, c.w, c.h, (x, y) => { let t = 0, amp = 1, sum = 0, s = sc; for (let o = 0; o < oc; o++) { t += val(x, y, Math.max(1, s), o) * amp; sum += amp; amp *= .5; s /= 2; }
          const g2 = clamp(((t / sum) - .5) * ct + .5, 0, 1) * 255; return [g2, g2, g2, 255]; }); } },
    shape: { cat: '입력', name: '도형', ins: [], params: [['kind', '모양', 'select', 'ellipse', { rect: '사각형', ellipse: '원 · 타원', diamond: '마름모' }], ['color', '색', 'color', '#ffffff'], ['w', '가로 (%)', 'num', 60], ['h', '세로 (%)', 'num', 60], ['x', '가운데 x (%)', 'num', 50], ['y', '가운데 y (%)', 'num', 50]],
      run(c, ins, p) { const col = rgb(p.color), rw = c.w * N(p.w, 60) / 200, rh = c.h * N(p.h, 60) / 200, ox = c.w * N(p.x, 50) / 100, oy = c.h * N(p.y, 50) / 100;
        return perPixel(null, c.w, c.h, (x, y) => { const u = (x + .5 - ox) / (rw || 1), v = (y + .5 - oy) / (rh || 1);
          const inside = p.kind === 'rect' ? Math.abs(u) <= 1 && Math.abs(v) <= 1 : p.kind === 'diamond' ? Math.abs(u) + Math.abs(v) <= 1 : u * u + v * v <= 1;
          return inside ? [col[0], col[1], col[2], 255] : [0, 0, 0, 0]; }); } },
    bricks: { cat: '입력', name: '무늬 (벽돌 · 격자 · 줄)', ins: [], params: [['kind', '무늬', 'select', 'bricks', { bricks: '벽돌', grid: '격자 (타일)', checker: '체크', stripes: '가로줄', planks: '널빤지 (세로줄)' }], ['bw', '칸 가로 (px)', 'num', 8], ['bh', '칸 세로 (px)', 'num', 4],
      ['c1', '칸 색', 'color', '#7a7a7a'], ['c2', '줄눈 · 둘째 색', 'color', '#231b3b'], ['vary', '칸마다 밝기 차이 (%)', 'num', 12], ['seed', '씨앗', 'num', 1]],
      run(c, ins, p) { const bw = Math.max(1, N(p.bw, 8) | 0), bh = Math.max(1, N(p.bh, 4) | 0), a = rgb(p.c1), b = rgb(p.c2), vr = N(p.vary, 12) / 100, seed = N(p.seed, 1) | 0;
        return perPixel(null, c.w, c.h, (x, y) => { const row = Math.floor(y / bh), off = p.kind === 'bricks' && row % 2 ? Math.floor(bw / 2) : 0, col = Math.floor((x + off) / bw), lx = (x + off) % bw, ly = y % bh;
          let edge = false, pick = a;
          if (p.kind === 'checker') pick = (col + row) % 2 ? b : a; else if (p.kind === 'stripes') edge = ly === 0; else if (p.kind === 'planks') edge = lx === 0; else edge = lx === 0 || ly === 0;
          if (edge) return [b[0], b[1], b[2], 255];
          const k = 1 + (hash(col, row, seed) - .5) * 2 * vr; return [clamp(pick[0] * k, 0, 255), clamp(pick[1] * k, 0, 255), clamp(pick[2] * k, 0, 255), 255]; }); } },
    // ---- 변형
    transform: { cat: '변형', name: '이동 · 회전 · 크기', ins: ['a'], params: [['dx', '이동 x (px)', 'num', 0], ['dy', '이동 y (px)', 'num', 0], ['scale', '크기 (%)', 'num', 100], ['rot', '회전 (도)', 'num', 0], ['wrap', '넘친 부분을 반대쪽에 이어 그림', 'bool', false]],
      run(c, ins, p) { const o = mk(c.w, c.h), g = cx(o); if (!ins.a) return o;
        const draw = (ox, oy) => { g.save(); g.translate(c.w / 2 + N(p.dx, 0) + ox, c.h / 2 + N(p.dy, 0) + oy); g.rotate(N(p.rot, 0) * Math.PI / 180); const s = N(p.scale, 100) / 100; g.scale(s, s); g.drawImage(ins.a, -c.w / 2, -c.h / 2); g.restore(); };
        if (p.wrap) for (const ox of [-c.w, 0, c.w]) for (const oy of [-c.h, 0, c.h]) draw(ox, oy); else draw(0, 0);
        return o; } },
    tile: { cat: '변형', name: '줄여서 반복', ins: ['a'], params: [['nx', '가로로 몇 번', 'num', 2], ['ny', '세로로 몇 번', 'num', 2]],
      run(c, ins, p) { const o = mk(c.w, c.h), g = cx(o); if (!ins.a) return o; const nx = Math.max(1, N(p.nx, 2) | 0), ny = Math.max(1, N(p.ny, 2) | 0);
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) g.drawImage(ins.a, 0, 0, c.w, c.h, Math.round(i * c.w / nx), Math.round(j * c.h / ny), Math.ceil(c.w / nx), Math.ceil(c.h / ny)); return o; } },
    flip: { cat: '변형', name: '뒤집기', ins: ['a'], params: [['h', '좌우', 'bool', true], ['v', '상하', 'bool', false]],
      run(c, ins, p) { const o = mk(c.w, c.h), g = cx(o); if (!ins.a) return o; g.translate(p.h ? c.w : 0, p.v ? c.h : 0); g.scale(p.h ? -1 : 1, p.v ? -1 : 1); g.drawImage(ins.a, 0, 0); return o; } },
    pixelate: { cat: '변형', name: '픽셀화', ins: ['a'], params: [['size', '덩어리 크기 (px)', 'num', 2]],
      run(c, ins, p) { const o = mk(c.w, c.h), g = cx(o); if (!ins.a) return o; const s = Math.max(1, N(p.size, 2) | 0), t = mk(Math.max(1, Math.ceil(c.w / s)), Math.max(1, Math.ceil(c.h / s)));
        cx(t).drawImage(ins.a, 0, 0, t.width, t.height); g.drawImage(t, 0, 0, t.width, t.height, 0, 0, t.width * s, t.height * s); return o; } },
    // ---- 색
    hsb: { cat: '색', name: '색조 · 채도 · 밝기', ins: ['a'], params: [['hue', '색조 (도)', 'num', 0], ['sat', '채도 (%)', 'num', 100], ['bri', '밝기 (%)', 'num', 100], ['con', '대비 (%)', 'num', 100]],
      run(c, ins, p) { if (!ins.a) return mk(c.w, c.h); const hu = N(p.hue, 0), sa = N(p.sat, 100) / 100, br = N(p.bri, 100) / 100, co = N(p.con, 100) / 100;
        return perPixel(ins.a, c.w, c.h, (x, y, q) => { if (!q[3]) return q; const v = rgb2hsv(q[0], q[1], q[2]), r = hsv2rgb((v[0] + hu + 360) % 360, clamp(v[1] * sa, 0, 1), clamp(v[2] * br, 0, 1));
          return [clamp((r[0] - 128) * co + 128, 0, 255), clamp((r[1] - 128) * co + 128, 0, 255), clamp((r[2] - 128) * co + 128, 0, 255), q[3]]; }); } },
    colormap: { cat: '색', name: '밝기에 색 입히기', ins: ['a'], params: [['c1', '어두운 곳', 'color', '#231b3b'], ['c2', '중간', 'color', '#6a45d6'], ['c3', '밝은 곳', 'color', '#dcd5ef'], ['steps', '단계 수 (0 = 부드럽게)', 'num', 5], ['dither', '디더링', 'bool', false]],
      run(c, ins, p) { if (!ins.a) return mk(c.w, c.h); const a = rgb(p.c1), b = rgb(p.c2), d = rgb(p.c3), steps = Math.max(0, Math.round(N(p.steps, 0)));
        return perPixel(ins.a, c.w, c.h, (x, y, q) => { let t = (q[0] * .299 + q[1] * .587 + q[2] * .114) / 255;
          if (steps > 1) { let u = t * (steps - 1); if (p.dither) u += (BAYER[(x & 3) + (y & 3) * 4] / 16 - .5) * .9; t = clamp(Math.round(u), 0, steps - 1) / (steps - 1); }
          const m = t < .5 ? mixc(a, b, t * 2) : mixc(b, d, (t - .5) * 2); return [m[0], m[1], m[2], q[3]]; }); } },
    palette: { cat: '색', name: '팔레트로 줄이기', ins: ['a'], params: [['pal', '팔레트', 'select', 'editor', { editor: '편집기 기본 팔레트', levels: '색마다 단계 수로' }], ['levels', '단계 수 (단계 수로 줄일 때)', 'num', 4], ['dither', '디더링', 'bool', true]],
      run(c, ins, p) { if (!ins.a) return mk(c.w, c.h); const pal = (PDM.PALETTE || []).map(rgb), lv = Math.max(2, N(p.levels, 4) | 0);
        return perPixel(ins.a, c.w, c.h, (x, y, q) => { if (!q[3]) return q; const dz = p.dither ? (BAYER[(x & 3) + (y & 3) * 4] / 16 - .5) * (p.pal === 'levels' ? 255 / (lv - 1) : 40) : 0;
          const r = q[0] + dz, g2 = q[1] + dz, b = q[2] + dz;
          if (p.pal === 'levels') { const f = v => clamp(Math.round(clamp(v, 0, 255) / 255 * (lv - 1)), 0, lv - 1) / (lv - 1) * 255; return [f(r), f(g2), f(b), q[3]]; }
          let best = pal[0] || [0, 0, 0], bd = Infinity; for (const k of pal) { const d = (k[0] - r) ** 2 + (k[1] - g2) ** 2 + (k[2] - b) ** 2; if (d < bd) { bd = d; best = k; } }
          return [best[0], best[1], best[2], q[3]]; }); } },
    replace: { cat: '색', name: '색 바꾸기', ins: ['a'], params: [['from', '이 색을', 'color', '#ffffff'], ['to', '이 색으로', 'color', '#a58bff'], ['tol', '비슷한 정도 (0~255)', 'num', 24]],
      run(c, ins, p) { if (!ins.a) return mk(c.w, c.h); const f = rgb(p.from), t = rgb(p.to), tol = N(p.tol, 24);
        return perPixel(ins.a, c.w, c.h, (x, y, q) => q[3] && Math.abs(q[0] - f[0]) <= tol && Math.abs(q[1] - f[1]) <= tol && Math.abs(q[2] - f[2]) <= tol ? [t[0], t[1], t[2], q[3]] : q); } },
    invert: { cat: '색', name: '반전', ins: ['a'], params: [], run(c, ins) { return ins.a ? perPixel(ins.a, c.w, c.h, (x, y, q) => [255 - q[0], 255 - q[1], 255 - q[2], q[3]]) : mk(c.w, c.h); } },
    threshold: { cat: '색', name: '밝기로 자르기 (투명)', ins: ['a'], params: [['level', '기준 밝기 (0~255)', 'num', 128], ['keep', '남길 쪽', 'select', 'bright', { bright: '밝은 곳', dark: '어두운 곳' }]],
      run(c, ins, p) { if (!ins.a) return mk(c.w, c.h); const lv = N(p.level, 128);
        return perPixel(ins.a, c.w, c.h, (x, y, q) => { const l = q[0] * .299 + q[1] * .587 + q[2] * .114; return (p.keep === 'dark' ? l < lv : l >= lv) ? q : [0, 0, 0, 0]; }); } },
    outline: { cat: '색', name: '외곽선', ins: ['a'], params: [['color', '색', 'color', '#000000'], ['corner', '대각선 칸도', 'bool', false], ['inside', '안쪽에 그림', 'bool', false]],
      run(c, ins, p) { if (!ins.a) return mk(c.w, c.h); const src = cx(ins.a).getImageData(0, 0, c.w, c.h).data, col = rgb(p.color);
        const al = (x, y) => x < 0 || y < 0 || x >= c.w || y >= c.h ? 0 : src[(y * c.w + x) * 4 + 3];
        const nb = p.corner ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
        return perPixel(ins.a, c.w, c.h, (x, y, q) => { const solid = q[3] > 0, near = nb.some(([dx, dy]) => (al(x + dx, y + dy) > 0) !== solid);
          return (p.inside ? solid && near : !solid && near) ? [col[0], col[1], col[2], 255] : q; }); } },
    shadow: { cat: '색', name: '그림자', ins: ['a'], params: [['dx', 'x 만큼', 'num', 1], ['dy', 'y 만큼', 'num', 1], ['color', '색', 'color', '#000000'], ['alpha', '불투명도 (0~100)', 'num', 60]],
      run(c, ins, p) { const o = mk(c.w, c.h), g = cx(o); if (!ins.a) return o; const col = rgb(p.color), al = clamp(N(p.alpha, 60) / 100, 0, 1);
        const sh = perPixel(ins.a, c.w, c.h, (x, y, q) => [col[0], col[1], col[2], q[3] ? Math.round(255 * al) : 0]);
        g.drawImage(sh, N(p.dx, 1), N(p.dy, 1)); g.drawImage(ins.a, 0, 0); return o; } },
    // ---- 합성
    blend: { cat: '합성', name: '겹치기', ins: ['a', 'b'], labels: { a: '아래', b: '위' }, params: [['mode', '방식', 'select', 'source-over', { 'source-over': '보통', lighter: '더하기 (빛)', multiply: '곱하기 (어둡게)', screen: '스크린 (밝게)', overlay: '오버레이' }], ['alpha', '위 그림 불투명도 (0~100)', 'num', 100]],
      run(c, ins, p) { const o = mk(c.w, c.h), g = cx(o); if (ins.a) g.drawImage(ins.a, 0, 0); if (ins.b) { g.globalAlpha = clamp(N(p.alpha, 100) / 100, 0, 1); g.globalCompositeOperation = p.mode || 'source-over'; g.drawImage(ins.b, 0, 0); } return o; } },
    mask: { cat: '합성', name: '마스크 (오려 내기)', ins: ['a', 'b'], labels: { a: '그림', b: '마스크' }, params: [['by', '기준', 'select', 'alpha', { alpha: '마스크의 불투명한 곳만 남김', luma: '마스크가 밝을수록 남김' }], ['inv', '반대로', 'bool', false]],
      run(c, ins, p) { if (!ins.a) return mk(c.w, c.h); if (!ins.b) return ins.a; const m = cx(ins.b).getImageData(0, 0, c.w, c.h).data;
        return perPixel(ins.a, c.w, c.h, (x, y, q) => { const i = (y * c.w + x) * 4; let k = p.by === 'luma' ? (m[i] * .299 + m[i + 1] * .587 + m[i + 2] * .114) / 255 * (m[i + 3] / 255) : m[i + 3] / 255; if (p.inv) k = 1 - k; return [q[0], q[1], q[2], Math.round(q[3] * k)]; }); } },
    // ---- 효과
    blur: { cat: '효과', name: '흐림', ins: ['a'], params: [['r', '세기 (px)', 'num', 1]],
      run(c, ins, p) { const o = mk(c.w, c.h), g = cx(o); if (!ins.a) return o; g.imageSmoothingEnabled = true; g.filter = `blur(${Math.max(0, N(p.r, 1))}px)`; g.drawImage(ins.a, 0, 0); g.filter = 'none'; return o; } },
    glow: { cat: '효과', name: '빛 번짐', ins: ['a'], params: [['r', '번지는 크기 (px)', 'num', 2], ['power', '세기 (%)', 'num', 80]],
      run(c, ins, p) { const o = mk(c.w, c.h), g = cx(o); if (!ins.a) return o; g.drawImage(ins.a, 0, 0); g.globalCompositeOperation = 'lighter'; g.globalAlpha = clamp(N(p.power, 80) / 100, 0, 1); g.filter = `blur(${Math.max(0, N(p.r, 2))}px)`; g.drawImage(ins.a, 0, 0); g.filter = 'none'; return o; } },
    sheet: { cat: '입력', name: '시트의 한 칸 (프레임)', ins: [], params: [['file', '스프라이트 시트', 'image', ''], ['fw', '칸 가로 (px)', 'num', 16], ['fh', '칸 세로 (px)', 'num', 16], ['index', '칸 번호 (식 가능 — 예: frame)', 'num', 'frame'], ['fit', '맞추기', 'select', 'center', { center: '가운데', stretch: '크기에 맞게 늘림', topleft: '왼쪽 위' }]],
      async run(c, ins, p) { const o = mk(c.w, c.h), g = cx(o); let im = null; try { im = p.file ? await PDM.assets.load(p.file) : null; } catch (_) { im = null; }
        if (!im || !im.width) return o; const fw = Math.max(1, N(p.fw, 16) | 0), fh = Math.max(1, N(p.fh, 16) | 0), cols = Math.max(1, Math.floor(im.width / fw)), total = cols * Math.max(1, Math.floor(im.height / fh));
        const i = ((Math.floor(N(p.index, 0)) % total) + total) % total, sx = (i % cols) * fw, sy = Math.floor(i / cols) * fh;
        if (p.fit === 'stretch') g.drawImage(im, sx, sy, fw, fh, 0, 0, c.w, c.h); else if (p.fit === 'topleft') g.drawImage(im, sx, sy, fw, fh, 0, 0, fw, fh); else g.drawImage(im, sx, sy, fw, fh, Math.round((c.w - fw) / 2), Math.round((c.h - fh) / 2), fw, fh);
        return o; } },
    text: { cat: '입력', name: '글자', ins: [], params: [['text', '글자', 'text', 'ABC'], ['size', '크기 (px)', 'num', 10], ['color', '색', 'color', '#ffffff'], ['x', 'x (%)', 'num', 50], ['y', 'y (%)', 'num', 50], ['bold', '굵게', 'bool', true], ['font', '글꼴', 'select', 'monospace', { monospace: '고정폭', 'sans-serif': '고딕', serif: '명조' }]],
      run(c, ins, p) { const o = mk(c.w, c.h), g = cx(o); g.font = `${p.bold ? 'bold ' : ''}${Math.max(4, N(p.size, 10))}px ${p.font || 'monospace'}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = p.color || '#fff';
        g.fillText(String(p.text ?? ''), c.w * N(p.x, 50) / 100, c.h * N(p.y, 50) / 100);
        return perPixel(o, c.w, c.h, (x, y, q) => q[3] >= 110 ? [q[0], q[1], q[2], 255] : [0, 0, 0, 0]); } },   // 가장자리를 또렷하게 (픽셀 글자)
    particles: { cat: '입력', name: '파티클 (물방울 · 불꽃 · 연기)', ins: ['a'], labels: { a: '알갱이 그림' }, params: [['count', '개수', 'num', 24], ['x', '나오는 곳 x (%)', 'num', 50], ['y', '나오는 곳 y (%)', 'num', 60], ['spreadX', '나오는 곳 너비 (px)', 'num', 2],
      ['angle', '방향 (도 · -90 = 위)', 'num', -90], ['spread', '퍼짐 (도)', 'num', 40], ['speed', '빠르기 (px/바퀴)', 'num', 30], ['gravity', '중력 (px/바퀴²)', 'num', 60], ['life', '수명 (바퀴의 비율 0~1)', 'num', 0.8],
      ['size', '크기 (px)', 'num', 1], ['c1', '처음 색', 'color', '#dcd5ef'], ['c2', '끝 색', 'color', '#6ab2e6'], ['fade', '사라지며 투명해짐', 'bool', true], ['seed', '씨앗', 'num', 1]],
      run(c, ins, p) { const o = mk(c.w, c.h), g = cx(o), n = clamp(N(p.count, 24) | 0, 0, 2000), seed = N(p.seed, 1) | 0, a = rgb(p.c1), b = rgb(p.c2), life = clamp(N(p.life, .8), 0.01, 1);
        const ang0 = N(p.angle, -90) * Math.PI / 180, spr = N(p.spread, 40) * Math.PI / 180, sp = N(p.speed, 30), gr2 = N(p.gravity, 60), sz = Math.max(1, N(p.size, 1) | 0), ox = c.w * N(p.x, 50) / 100, oy = c.h * N(p.y, 60) / 100, sw = N(p.spreadX, 2);
        for (let i = 0; i < n; i++) {   // 알갱이마다 태어나는 때가 달라 한 바퀴(t 0→1)가 끊김 없이 이어짐
          const born = hash(i, 1, seed), age = ((c.t - born) % 1 + 1) % 1, k = age / life; if (k > 1) continue;
          const an = ang0 + (hash(i, 2, seed) - .5) * spr, v = sp * (.6 + hash(i, 3, seed) * .8), tt = age;
          const x = Math.round(ox + (hash(i, 4, seed) - .5) * sw + Math.cos(an) * v * tt), y = Math.round(oy + Math.sin(an) * v * tt + .5 * gr2 * tt * tt), m = mixc(a, b, k);
          g.globalAlpha = p.fade ? clamp(1 - k, 0, 1) : 1;
          if (ins.a) g.drawImage(ins.a, x - (c.w >> 1), y - (c.h >> 1)); else { g.fillStyle = `rgb(${m[0] | 0},${m[1] | 0},${m[2] | 0})`; g.fillRect(x - (sz >> 1), y - (sz >> 1), sz, sz); }
        }
        g.globalAlpha = 1; return o; } },
    scatter: { cat: '변형', name: '여러 개 뿌리기', ins: ['a'], params: [['count', '개수', 'num', 12], ['scale', '크기 (%)', 'num', 30], ['vary', '크기 차이 (%)', 'num', 30], ['rot', '무작위 회전', 'bool', false], ['seed', '씨앗', 'num', 1], ['wrap', '가장자리에서 이어짐 (타일용)', 'bool', true]],
      run(c, ins, p) { const o = mk(c.w, c.h), g = cx(o); if (!ins.a) return o; const n = clamp(N(p.count, 12) | 0, 0, 500), seed = N(p.seed, 1) | 0, sc = N(p.scale, 30) / 100, vr = N(p.vary, 30) / 100;
        for (let i = 0; i < n; i++) { const x = hash(i, 11, seed) * c.w, y = hash(i, 12, seed) * c.h, k = Math.max(.02, sc * (1 + (hash(i, 13, seed) - .5) * 2 * vr)), r = p.rot ? Math.floor(hash(i, 14, seed) * 4) * Math.PI / 2 : 0;
          for (const dx of p.wrap ? [-c.w, 0, c.w] : [0]) for (const dy of p.wrap ? [-c.h, 0, c.h] : [0]) { g.save(); g.translate(Math.round(x + dx), Math.round(y + dy)); g.rotate(r); g.scale(k, k); g.drawImage(ins.a, -c.w / 2, -c.h / 2); g.restore(); } }
        return o; } },
    mirror: { cat: '변형', name: '대칭 (거울)', ins: ['a'], params: [['axis', '방향', 'select', 'h', { h: '왼쪽을 오른쪽에 비춤', v: '위를 아래에 비춤', both: '네 귀퉁이 대칭' }]],
      run(c, ins, p) { if (!ins.a) return mk(c.w, c.h); const src = cx(ins.a).getImageData(0, 0, c.w, c.h).data;
        return perPixel(null, c.w, c.h, (x, y) => { const sx = p.axis !== 'v' && x >= c.w / 2 ? c.w - 1 - x : x, sy = p.axis !== 'h' && y >= c.h / 2 ? c.h - 1 - y : y, i = (sy * c.w + sx) * 4; return [src[i], src[i + 1], src[i + 2], src[i + 3]]; }); } },
    wave: { cat: '효과', name: '물결 (일렁임)', ins: ['a'], params: [['amp', '세기 (px)', 'num', 2], ['len', '물결 길이 (px)', 'num', 12], ['phase', '위상 (0~1 · 식 가능: t)', 'num', 't'], ['dir', '방향', 'select', 'x', { x: '가로로 밀림', y: '세로로 밀림' }], ['wrap', '가장자리에서 이어짐', 'bool', true]],
      run(c, ins, p) { if (!ins.a) return mk(c.w, c.h); const src = cx(ins.a).getImageData(0, 0, c.w, c.h).data, amp = N(p.amp, 2), len = Math.max(1, N(p.len, 12)), ph = N(p.phase, 0) * Math.PI * 2;
        return perPixel(null, c.w, c.h, (x, y) => { let sx = x, sy = y; if (p.dir === 'y') sy = y + Math.round(Math.sin(x / len * Math.PI * 2 + ph) * amp); else sx = x + Math.round(Math.sin(y / len * Math.PI * 2 + ph) * amp);
          if (p.wrap) { sx = ((sx % c.w) + c.w) % c.w; sy = ((sy % c.h) + c.h) % c.h; } else if (sx < 0 || sy < 0 || sx >= c.w || sy >= c.h) return [0, 0, 0, 0];
          const i = (sy * c.w + sx) * 4; return [src[i], src[i + 1], src[i + 2], src[i + 3]]; }); } },
    displace: { cat: '효과', name: '밀어내기 (다른 그림의 밝기로)', ins: ['a', 'b'], labels: { a: '그림', b: '밝기' }, params: [['dx', 'x 세기 (px)', 'num', 3], ['dy', 'y 세기 (px)', 'num', 3], ['wrap', '가장자리에서 이어짐', 'bool', true]],
      run(c, ins, p) { if (!ins.a) return mk(c.w, c.h); if (!ins.b) return ins.a; const src = cx(ins.a).getImageData(0, 0, c.w, c.h).data, m = cx(ins.b).getImageData(0, 0, c.w, c.h).data, kx = N(p.dx, 3), ky = N(p.dy, 3);
        return perPixel(null, c.w, c.h, (x, y) => { const j = (y * c.w + x) * 4, l = (m[j] * .299 + m[j + 1] * .587 + m[j + 2] * .114) / 255 - .5; let sx = x + Math.round(l * 2 * kx), sy = y + Math.round(l * 2 * ky);
          if (p.wrap) { sx = ((sx % c.w) + c.w) % c.w; sy = ((sy % c.h) + c.h) % c.h; } else if (sx < 0 || sy < 0 || sx >= c.w || sy >= c.h) return [0, 0, 0, 0];
          const i = (sy * c.w + sx) * 4; return [src[i], src[i + 1], src[i + 2], src[i + 3]]; }); } },
    grow: { cat: '효과', name: '넓히기 · 깎기', ins: ['a'], params: [['n', '칸 수 (음수 = 깎기)', 'num', 1]],
      run(c, ins, p) { if (!ins.a) return mk(c.w, c.h); let cur = ins.a; const n = clamp(Math.round(N(p.n, 1)), -8, 8);
        for (let k = 0; k < Math.abs(n); k++) { const src = cx(cur).getImageData(0, 0, c.w, c.h).data, at = (x, y) => x < 0 || y < 0 || x >= c.w || y >= c.h ? -1 : (y * c.w + x) * 4;
          cur = perPixel(cur, c.w, c.h, (x, y, q) => { const nb = [at(x + 1, y), at(x - 1, y), at(x, y + 1), at(x, y - 1)];
            if (n > 0) { if (q[3]) return q; const i = nb.find(j => j >= 0 && src[j + 3]); return i === undefined ? q : [src[i], src[i + 1], src[i + 2], src[i + 3]]; }
            return q[3] && nb.some(j => j < 0 || !src[j + 3]) ? [0, 0, 0, 0] : q; }); }
        return cur; } },
    bevel: { cat: '효과', name: '입체감 (밝은 쪽 · 어두운 쪽)', ins: ['a'], params: [['light', '밝게 (%)', 'num', 35], ['dark', '어둡게 (%)', 'num', 35], ['from', '빛 방향', 'select', 'tl', { tl: '왼쪽 위', tr: '오른쪽 위', t: '위' }]],
      run(c, ins, p) { if (!ins.a) return mk(c.w, c.h); const src = cx(ins.a).getImageData(0, 0, c.w, c.h).data, al = (x, y) => x < 0 || y < 0 || x >= c.w || y >= c.h ? 0 : src[(y * c.w + x) * 4 + 3];
        const lx = p.from === 'tr' ? 1 : p.from === 't' ? 0 : -1, li = N(p.light, 35) / 100, dk = N(p.dark, 35) / 100;
        return perPixel(ins.a, c.w, c.h, (x, y, q) => { if (!q[3]) return q; const lit = !al(x + lx, y - 1) || (lx && !al(x + lx, y)), shade = !al(x - lx, y + 1) || (lx && !al(x - lx, y));
          const k = lit ? 1 + li : shade ? 1 - dk : 1; return [clamp(q[0] * k, 0, 255), clamp(q[1] * k, 0, 255), clamp(q[2] * k, 0, 255), q[3]]; }); } },
    fade: { cat: '색', name: '투명도 (전체 · 한쪽으로 옅어짐)', ins: ['a'], params: [['alpha', '불투명도 (0~100 · 식 가능)', 'num', 100], ['dir', '옅어지는 방향', 'select', 'none', { none: '없음 (전체 같게)', down: '아래로 갈수록', up: '위로 갈수록', out: '가장자리로 갈수록' }]],
      run(c, ins, p) { if (!ins.a) return mk(c.w, c.h); const al = clamp(N(p.alpha, 100) / 100, 0, 1);
        return perPixel(ins.a, c.w, c.h, (x, y, q) => { let k = al; if (p.dir === 'down') k *= 1 - y / Math.max(1, c.h - 1); else if (p.dir === 'up') k *= y / Math.max(1, c.h - 1); else if (p.dir === 'out') k *= clamp(1 - Math.hypot((x + .5) / c.w - .5, (y + .5) / c.h - .5) * 2, 0, 1);
          return [q[0], q[1], q[2], Math.round(q[3] * k)]; }); } },
    // ---- 출력
    effect: { cat: '입력', name: '이펙트 (파티클)', ins: [], params: [['fx', '이펙트 ("이펙트 · 파티클"에서 만든 것)', 'effect', ''], ['x', '중심 x (%)', 'num', 50], ['y', '중심 y (%)', 'num', 60], ['scale', '배율', 'num', 1],
      ['warm', '미리 돌려 두기 (초)', 'num', 0], ['loop', '계속 뿜기 (맵에 놓았을 때처럼)', 'bool', true], ['seed', '씨앗', 'num', 1]],
      async run(c, ins, p) { const o = mk(c.w, c.h); if (!PDM.effects || !PDM.effects.bake) return o;
        const fx = ((store.get('effects') || {}).list || []).find(x => x.id === p.fx); if (!fx) return o;
        const fr = await PDM.effects.bake(fx, { w: c.w, h: c.h, frames: c.frames, fps: c.fps, x: N(p.x, 50), y: N(p.y, 60), scale: N(p.scale, 1), warm: N(p.warm, 0), loop: !!p.loop, seed: N(p.seed, 1) | 0 });
        if (fr[c.frame]) cx(o).drawImage(fr[c.frame], 0, 0); return o; } },
    out: { cat: '출력', name: '출력', ins: ['a'], params: [], run(c, ins) { return ins.a || mk(c.w, c.h); } }
  };

  // ---------------------------------------------------------------- 계산
  /** 그래프에서 노드 하나의 그림 (cache: 이번 계산에서 이미 만든 것) */
  async function renderNode(gr, id, cache, stack, fr) {
    if (cache[id]) return cache[id];
    const n = (gr.nodes || []).find(x => x.id === id), T = n && TYPES[n.type];
    const frames = Math.max(1, gr.frames | 0 || 1), frame = ((fr | 0) % frames + frames) % frames;
    const c = { w: Math.max(1, gr.w | 0 || 32), h: Math.max(1, gr.h | 0 || 32), frame, frames, t: frame / frames, fps: Math.max(1, gr.fps | 0 || 8) };
    if (!T || (stack || []).includes(id)) return mk(c.w, c.h);   // 없는 노드 · 돌고 도는 연결
    const ins = {};
    for (const port of T.ins) { const l = (gr.links || []).find(x => x.to === id && x.port === port); ins[port] = l ? await renderNode(gr, l.from, cache, [...(stack || []), id], fr) : null; }
    const p = Object.assign({}, ...T.params.map(([k, , , d]) => ({ [k]: d })), n.p || {});
    CUR.t = c.t; CUR.frame = c.frame; CUR.frames = c.frames;   // 입력을 계산하는 동안 바뀌지 않음 (같은 프레임)
    let out; try { out = await T.run(c, ins, p); } catch (e) { out = mk(c.w, c.h); PDM.log && PDM.log(`노드 「${T.name}」 계산 오류: ${e.message || e}`, 'warn'); }
    return (cache[id] = out);
  }
  async function evaluate(gr, cache, fr) { const o = (gr.nodes || []).find(x => x.type === 'out'); return o ? renderNode(gr, o.id, cache || {}, null, fr) : mk(Math.max(1, gr.w | 0), Math.max(1, gr.h | 0)); }
  /** 모든 프레임을 차례로 */
  async function evaluateAll(gr) { const n = Math.max(1, gr.frames | 0 || 1), out = []; for (let f = 0; f < n; f++) out.push(await evaluate(gr, {}, f)); return out; }
  /** 프레임들을 한 장의 시트로 (cols 칸씩 줄바꿈 · 0 = 한 줄) */
  function toSheet(frames, cols) { const n = frames.length, c = cols > 0 ? Math.min(cols, n) : n, w = frames[0].width, hh = frames[0].height, o = mk(w * c, hh * Math.ceil(n / c)), g = cx(o);
    frames.forEach((f, i) => g.drawImage(f, (i % c) * w, Math.floor(i / c) * hh)); return o; }
  PDM.compose = { TYPES, evaluate, evaluateAll, toSheet, render: (gr, id, fr) => renderNode(gr, id, {}, null, fr) };

  // ---------------------------------------------------------------- 새 그래프 · 예시
  let seq = 0; const nid = () => 'n' + Date.now().toString(36).slice(-4) + (seq++).toString(36);
  const PRESETS = { blank: '빈 그래프', wall: '배경: 돌벽', floor: '배경: 바닥 타일', sky: '배경: 그라데이션 하늘', object: '오브젝트: 그림 + 외곽선 + 그림자', fountain: '움직임: 분수 (파티클 · 8프레임)', water: '움직임: 일렁이는 물 타일 (8프레임)' };
  function make(id, preset) {
    const g = { id, name: id, w: 64, h: 64, frames: 1, fps: 8, out: '', nodes: [], links: [] };
    const add = (type, x, y, p) => { const n = { id: nid(), type, x, y, p: p || {} }; g.nodes.push(n); return n.id; }, link = (from, to, port) => g.links.push({ from, to, port: port || 'a' });
    if (preset === 'wall') { const a = add('bricks', 20, 30, { kind: 'bricks', bw: 16, bh: 8, c1: '#7a7a7a', c2: '#231b3b', vary: 18 }), b = add('noise', 20, 230, { scale: 6, octaves: 3 }), m = add('blend', 240, 110, { mode: 'multiply', alpha: 55 }), p = add('palette', 460, 110, { pal: 'levels', levels: 5, dither: true }), o = add('out', 680, 110); link(a, m, 'a'); link(b, m, 'b'); link(m, p); link(p, o); }
    else if (preset === 'floor') { const a = add('bricks', 20, 30, { kind: 'grid', bw: 16, bh: 16, c1: '#4b3f73', c2: '#231b3b', vary: 10 }), b = add('noise', 20, 230, { scale: 4, octaves: 2, contrast: 140 }), m = add('blend', 240, 110, { mode: 'overlay', alpha: 45 }), o = add('out', 460, 110); link(a, m, 'a'); link(b, m, 'b'); link(m, o); }
    else if (preset === 'sky') { g.w = 128; g.h = 72; const a = add('gradient', 20, 30, { c1: '#231b3b', c2: '#a58bff', steps: 7, dither: true }), b = add('noise', 20, 230, { scale: 24, octaves: 3, contrast: 160 }), t = add('threshold', 240, 230, { level: 150 }), m = add('blend', 460, 110, { mode: 'screen', alpha: 35 }), o = add('out', 680, 110); link(a, m, 'a'); link(b, t); link(t, m, 'b'); link(m, o); }
    else if (preset === 'object') { g.w = 32; g.h = 32; const a = add('shape', 20, 60, { kind: 'ellipse', color: '#e6b95c', w: 55, h: 55 }), ol = add('outline', 240, 60, { color: '#231b3b' }), s = add('shadow', 460, 60, { dx: 1, dy: 2, alpha: 45 }), o = add('out', 680, 60); link(a, ol); link(ol, s); link(s, o); }
    else if (preset === 'fountain') { g.w = 32; g.h = 32; g.frames = 8; g.fps = 8;
      const base = add('shape', 20, 30, { kind: 'rect', color: '#7a7a7a', w: 70, h: 22, x: 50, y: 86 }), bv = add('bevel', 240, 30, {}), ol = add('outline', 460, 30, { color: '#231b3b' });
      const pt = add('particles', 20, 250, { count: 40, x: 50, y: 70, angle: -90, spread: 50, speed: 34, gravity: 70, life: 0.85, c1: '#dcd5ef', c2: '#6ab2e6' }), m = add('blend', 680, 130, {}), o = add('out', 900, 130);
      link(base, bv); link(bv, ol); link(ol, m, 'a'); link(pt, m, 'b'); link(m, o); }
    else if (preset === 'water') { g.w = 16; g.h = 16; g.frames = 8; g.fps = 6;
      const n = add('noise', 20, 30, { scale: 5, octaves: 2, contrast: 150 }), cm = add('colormap', 240, 30, { c1: '#2b4c7e', c2: '#3f7fc0', c3: '#9fd6ef', steps: 4 }), w = add('wave', 460, 30, { amp: 2, len: 16, phase: 't' }), o = add('out', 680, 30); link(n, cm); link(cm, w); link(w, o); }
    else add('out', 460, 110);
    return g;
  }
  const ops = PDM.listOps({ K, label: '합성 그림', title: '노드 합성기', icon: '🧩', prefix: 'comp', make, presets: PRESETS, clean: c => { c.out = ''; } });

  /** 다른 편집기의 그림을 노드 합성기로: 원본을 assets/compose/src_… 로 복사해 "그림 파일" 노드에 넣고, 저장 경로는 원래 파일(saveRel)로 → 저장하면 그 그림이 바뀜 */
  /** 이펙트 이미터의 알갱이 그림을 노드 합성기로: 이미 이 파일을 만드는 그래프가 있으면 그것을 열고, 그림이 있으면 그 그림에서, 없으면 새 그래프(흰 동그라미 + 번짐)로 시작. 돌려줌: 그림 경로 */
  PDM.compose.forEffect = async function (fx, em) {
    const e = (fx.emitters || [])[em]; if (!e) return null;
    const sp = e.sprite || {}, png = sp.png && !/^(game|builtin):/.test(sp.png) ? sp.png : '';
    const on = () => store.edit('project', '확장 기능 켜기: 노드 합성기', r => { r.extensions = Object.assign({}, r.extensions, { compose: true }); });
    const have = png && list().find(x => (x.out || `assets/compose/${x.id}.png`) === png);
    if (have) { on(); ops.show(have.id); return png; }
    if (png) { const fw = +sp.fw > 0 ? +sp.fw : 0, fh = +sp.fh > 0 ? +sp.fh : 0; await PDM.compose.fromImage(png, png, fw || 16, fh || 16); return png; }
    const rel = `assets/fx/${fx.id}_${em + 1}.png`;
    let id = String(fx.id + '_' + (em + 1)).replace(/[^A-Za-z0-9_]/g, '_'), k = 2; const base = id; while (list().some(x => x.id === id)) id = base + '_' + k++;
    const g = make(id, 'blank'); g.name = `${fx.name || fx.id} 알갱이 ${em + 1}`; g.w = 16; g.h = 16; g.out = rel;
    const o = g.nodes.find(n => n.type === 'out'), a = { id: nid(), type: 'shape', x: 40, y: 80, p: { kind: 'ellipse', color: '#ffffff', w: 45, h: 45 } }, b = { id: nid(), type: 'glow', x: 260, y: 80, p: {} };
    g.nodes.unshift(a, b); g.links.push({ from: a.id, to: b.id, port: 'a' }, { from: b.id, to: o.id, port: 'a' }); o.x = 480; o.y = 80;
    try { const img = await evaluate(g, {}, 0); await pdm.writeDataURL(store.abs(rel), img.toDataURL('image/png')); PDM.assets.invalidate(rel); if (PDM.effects && PDM.effects.invalidate) PDM.effects.invalidate(rel); }
    catch (er) { toast('알갱이 그림을 만들지 못했습니다: ' + (er.message || er), 'bad'); return null; }
    on();
    store.transaction('알갱이 그림 (노드 합성기)', () => {
      store.edit(K, '합성 그림 추가', r => { r.list = r.list || []; r.list.push(g); });
      store.edit('effects', '알갱이 그림', r => { const f = r.list.find(x => x.id === fx.id), e2 = f && f.emitters[em]; if (e2) e2.sprite = Object.assign({ fps: 10 }, e2.sprite || {}, { png: rel, fw: 0, fh: 0, frames: '', anim: 'none' }); });
    });
    ops.show(id); return rel;
  };
  /** 화면 필터의 그림 층을 노드 합성기로: 이 파일을 만드는 그래프가 있으면 열고, 그림이 있으면 그 그림에서, 없으면 새 그래프(64×64 노이즈)로 시작 */
  PDM.compose.forFilter = async function (f, li) {
    const l = (f.layers || [])[li]; if (!l) return null;
    const png = l.png && !/^(game|builtin):/.test(l.png) ? l.png : '';
    const on = () => store.edit('project', '확장 기능 켜기: 노드 합성기', r => { r.extensions = Object.assign({}, r.extensions, { compose: true }); });
    const have = png && list().find(x => (x.out || `assets/compose/${x.id}.png`) === png);
    if (have) { on(); ops.show(have.id); return png; }
    const shared = png && /^assets\/filters\/[a-z]+\.png$/.test(png);   // 기본 그림은 여러 필터가 같이 쓰므로 사본으로
    const rel = !png || shared ? `assets/filters/${f.id}_${li + 1}.png` : png;
    let id = String(f.id + '_' + (li + 1)).replace(/[^A-Za-z0-9_]/g, '_'), k = 2; const base = id; while (list().some(x => x.id === id)) id = base + '_' + k++;
    const g = make(id, 'blank'); g.name = `${f.name || f.id} 필터 그림 ${li + 1}`; g.w = 64; g.h = 64; g.out = rel;
    const o = g.nodes.find(n => n.type === 'out'); o.x = 480; o.y = 80;
    if (png) { let im = null; try { im = await PDM.assets.load(png); } catch (_) { im = null; }
      const src = `assets/compose/src_${id}.png`; try { await pdm.copy(PDM.assets.resolvePath(png), store.abs(src)); PDM.assets.invalidate(src); } catch (e) { toast('그림을 복사하지 못했습니다: ' + (e.message || e), 'bad'); return null; }
      if (im) { g.w = im.width; g.h = im.height; }
      const a = { id: nid(), type: 'image', x: 40, y: 80, p: { file: src, fit: 'topleft' } }; g.nodes.unshift(a); g.links.push({ from: a.id, to: o.id, port: 'a' }); }
    else { const a = { id: nid(), type: 'noise', x: 40, y: 80, p: { scale: 8, octaves: 3 } }, b = { id: nid(), type: 'threshold', x: 260, y: 80, p: { level: 150 } }; g.nodes.unshift(a, b); g.links.push({ from: a.id, to: b.id, port: 'a' }, { from: b.id, to: o.id, port: 'a' }); }
    try { const img = await evaluate(g, {}, 0); await pdm.writeDataURL(store.abs(rel), img.toDataURL('image/png')); PDM.assets.invalidate(rel); if (PDM.filters) PDM.filters.invalidate(rel); }
    catch (er) { toast('필터 그림을 만들지 못했습니다: ' + (er.message || er), 'bad'); return null; }
    on();
    store.transaction('필터 그림 (노드 합성기)', () => {
      store.edit(K, '합성 그림 추가', r => { r.list = r.list || []; r.list.push(g); });
      store.edit('filters', '필터 그림', r => { const x = r.list.find(y => y.id === f.id), l2 = x && x.layers[li]; if (l2) Object.assign(l2, { png: rel, frames: 1, fw: 0 }); });
    });
    ops.show(id); return rel;
  };
  PDM.compose.fromImage = async function (rel, saveRel, w, hh) {
    const base = String(saveRel || rel).replace(/\\/g, '/').split('/').pop().replace(/\.png$/i, '').replace(/[^A-Za-z0-9_]/g, '_') || 'image';
    let id = base, k = 2; while (list().some(x => x.id === id)) id = base + '_' + k++;
    const src = `assets/compose/src_${id}.png`;
    try { await pdm.copy(PDM.assets.resolvePath(rel), store.abs(src)); } catch (e) { toast('그림을 복사하지 못했습니다: ' + (e.message || e), 'bad'); return null; }
    PDM.assets.invalidate(src);
    let im = null; try { im = await PDM.assets.load(src); } catch (_) { im = null; }
    const g = make(id, 'blank'); g.name = base; g.w = (im && im.width) || w || 32; g.h = (im && im.height) || hh || 32; g.out = saveRel && !/^(game|builtin):/.test(saveRel) ? saveRel : `assets/compose/${id}.png`;
    const a = { id: nid(), type: 'image', x: 40, y: 110, p: { file: src, fit: 'topleft' } }; g.nodes.unshift(a); g.links.push({ from: a.id, to: g.nodes.find(n => n.type === 'out').id, port: 'a' });
    store.edit('project', '확장 기능 켜기: 노드 합성기', r => { r.extensions = Object.assign({}, r.extensions, { compose: true }); });
    store.edit(K, '합성 그림 추가', r => { r.list = r.list || []; r.list.push(g); });
    ops.show(id); return id;
  };

  // ---------------------------------------------------------------- 화면
  const NW = 150, NHEAD = 22, THUMB = 64;
  const nodeH = T => NHEAD + THUMB + 14 + Math.max(0, T.ins.length - 1) * 0;
  const portY = (T, i) => NHEAD + 14 + i * 22;

  PDM.registerEditor({
    id: K, icon: '🧩', title: () => '노드 합성기',
    match: k => k === K,
    tree: () => store.isOpen ? [ops.treeNode(57)] : [],
    render(key, ctx) {
      const st = ctx.state = ctx.state || { sel: null, tile: false, zoom: 4, frame: 0, play: false, gz: 1 };
      const all = list(); ops.take(st);
      if (!all.some(x => x.id === st.id)) st.id = (all[0] || {}).id;
      const idx = all.findIndex(x => x.id === st.id), gr = all[idx];
      const head = h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '8px' } },
        all.map(x => h('button', { class: 'btn sm' + (x.id === st.id ? ' pri' : ''), onclick: () => { st.id = x.id; st.sel = null; ctx.refresh(); } }, x.name || x.id)));
      const intro = h('p', { class: 'hint' }, '노드를 이어서 배경 · 오브젝트 그림을 만듭니다. 숫자 칸에는 식(t · frame)을 넣어 움직이게 할 수 있고, 프레임 수를 늘리면 스프라이트 시트로 저장됩니다. Ctrl+휠 = 그래프 확대 · Delete = 고른 노드 삭제. 노드 오른쪽 점(출력)을 끌어 다른 노드의 왼쪽 점(입력)에 놓으면 이어지고, "출력" 노드에 이어진 그림이 결과입니다. 결과는 PNG 로 저장해 스프라이트 · 타일셋 · 일러스트로 씁니다.');
      if (!gr) return h('div', { class: 'editor' }, h('h2', {}, '🧩 노드 합성기'), intro, ops.bar(null));

      const edit = (label, fn, silent) => store.edit(K, label, r => fn(r.list[idx]), silent ? { silent: true } : undefined);
      // ---- 그래프 영역
      const area = h('div', { style: { position: 'relative', width: '1600px', height: '900px' } });
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('width', 1600); svg.setAttribute('height', 900); svg.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none';
      area.append(svg);
      const scroll = h('div', { style: { overflow: 'auto', flex: 1, minWidth: 0, height: '62vh', border: '1px solid var(--line)', borderRadius: '8px', background: 'var(--graph-bg, var(--bg))' } }, area);
      const thumbs = {}, els = {};
      const pos = {}; gr.nodes.forEach(n => { pos[n.id] = { x: n.x || 0, y: n.y || 0 }; });
      const outPt = n => [pos[n.id].x + NW, pos[n.id].y + NHEAD + 14], inPt = (n, port) => [pos[n.id].x, pos[n.id].y + portY(TYPES[n.type], Math.max(0, TYPES[n.type].ins.indexOf(port)))];
      function drawLinks(temp) {
        svg.innerHTML = '';
        const path = (a, b, cls, id) => { const d = Math.max(30, Math.abs(b[0] - a[0]) * .5), p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          p.setAttribute('d', `M${a[0]},${a[1]} C${a[0] + d},${a[1]} ${b[0] - d},${b[1]} ${b[0]},${b[1]}`); p.setAttribute('fill', 'none'); p.setAttribute('stroke', cls); p.setAttribute('stroke-width', 2);
          if (id !== undefined) { p.style.pointerEvents = 'stroke'; p.style.cursor = 'pointer'; p.addEventListener('click', () => edit('연결 끊기', g => { g.links.splice(id, 1); })); const t = document.createElementNS('http://www.w3.org/2000/svg', 'title'); t.textContent = '누르면 연결을 끊습니다'; p.append(t); }
          svg.append(p); };
        gr.links.forEach((l, i) => { const a = gr.nodes.find(n => n.id === l.from), b = gr.nodes.find(n => n.id === l.to); if (a && b && TYPES[a.type] && TYPES[b.type]) path(outPt(a), inPt(b, l.port), '#5fd6b4', i); });
        if (temp) path(temp[0], temp[1], '#ffe27a');
      }
      gr.nodes.forEach(n => {
        const T = TYPES[n.type]; if (!T) return;
        const cv = h('canvas', { width: THUMB, height: THUMB, class: 'checker', style: { imageRendering: 'pixelated', display: 'block', margin: '0 auto', borderRadius: '3px' } }); thumbs[n.id] = cv;
        const el = h('div', { 'data-n': n.id, style: { position: 'absolute', left: pos[n.id].x + 'px', top: pos[n.id].y + 'px', width: NW + 'px', background: 'var(--bg3)', border: '1.5px solid ' + (st.sel === n.id ? 'var(--accent)' : 'var(--line)'), borderRadius: '8px', boxShadow: '0 2px 8px var(--shadow)', userSelect: 'none', cursor: 'grab' } },
          h('div', { style: { height: NHEAD + 'px', lineHeight: NHEAD + 'px', padding: '0 8px', fontSize: '12px', fontWeight: 600, borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap', overflow: 'hidden', background: n.type === 'out' ? 'var(--accent-soft)' : '' } }, T.name),
          h('div', { style: { padding: '6px 0 8px' } }, cv),
          ...T.ins.map((port, i) => h('div', { 'data-in': port, title: '입력' + (T.labels ? ': ' + T.labels[port] : ''), style: { position: 'absolute', left: '-7px', top: (portY(T, i) - 6) + 'px', width: '12px', height: '12px', borderRadius: '50%', border: '2px solid var(--good)', background: 'var(--bg)' } },
            T.labels ? h('span', { style: { position: 'absolute', left: '14px', top: '-4px', fontSize: '10px', color: 'var(--mute)', pointerEvents: 'none', whiteSpace: 'nowrap', textShadow: '0 0 3px var(--bg3)' } }, T.labels[port]) : null)),
          n.type !== 'out' ? h('div', { 'data-out': '1', title: '끌어서 다른 노드의 입력에 놓기', style: { position: 'absolute', right: '-7px', top: (NHEAD + 8) + 'px', width: '12px', height: '12px', borderRadius: '50%', border: '2px solid var(--good)', background: 'var(--good)', cursor: 'crosshair' } }) : null);
        els[n.id] = el; area.append(el);
      });
      drawLinks();
      // 끌기: 노드 이동 · 출력 점에서 연결
      let drag = null;
      const at = e => { const r = area.getBoundingClientRect(); return [(e.clientX - r.left) / st.gz, (e.clientY - r.top) / st.gz]; };
      const applyGz = () => { area.style.transform = `scale(${st.gz})`; area.style.transformOrigin = '0 0'; };
      applyGz();
      scroll.addEventListener('wheel', e => { if (!e.ctrlKey) return; e.preventDefault(); st.gz = clamp(Math.round((st.gz + (e.deltaY < 0 ? .1 : -.1)) * 10) / 10, .4, 2); applyGz(); }, { passive: false });
      const delSel = () => { const id = st.sel, n = gr.nodes.find(x => x.id === id); if (!n || n.type === 'out') return; st.sel = null; edit('노드 삭제', g => { g.nodes = g.nodes.filter(x => x.id !== id); g.links = g.links.filter(l => l.from !== id && l.to !== id); }); };
      const onKey = e => { if (!area.isConnected || document.querySelector('.modal-bg')) return; if (/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) return; if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); delSel(); } };
      addEventListener('keydown', onKey);
      area.style.touchAction = 'none';   // 태블릿 펜 · 터치로 끌 때 브라우저가 화면 스크롤로 가져가지 않게
      area.addEventListener('pointerdown', e => {
        const ne = e.target.closest('[data-n]'); if (!ne || e.button !== 0) { if (!ne && st.sel) { st.sel = null; ctx.refresh(); } return; }
        const id = ne.dataset.n, n = gr.nodes.find(x => x.id === id), p = at(e); e.preventDefault();
        if (e.target.closest('[data-out]')) drag = { type: 'link', from: id, a: outPt(n) };
        else drag = { type: 'move', id, ox: p[0] - pos[id].x, oy: p[1] - pos[id].y, moved: false };
      });
      const onMove = e => { if (!drag) return; if (!area.isConnected) { drag = null; return; } const p = at(e);
        if (drag.type === 'move') { drag.moved = true; pos[drag.id] = { x: Math.max(0, Math.round((p[0] - drag.ox) / 10) * 10), y: Math.max(0, Math.round((p[1] - drag.oy) / 10) * 10) }; els[drag.id].style.left = pos[drag.id].x + 'px'; els[drag.id].style.top = pos[drag.id].y + 'px'; drawLinks(); }
        else drawLinks([drag.a, p]); };
      const onUp = e => { if (!drag) return; const d = drag; drag = null; if (!area.isConnected) return;
        if (d.type === 'move') { if (d.moved) edit('노드 이동', g => { const n = g.nodes.find(x => x.id === d.id); if (n) { n.x = pos[d.id].x; n.y = pos[d.id].y; } }, true); if (st.sel !== d.id || !d.moved) { st.sel = d.id; ctx.refresh(); } return; }
        const t = document.elementFromPoint(e.clientX, e.clientY), ne = t && t.closest && t.closest('[data-n]');
        if (!ne || ne.dataset.n === d.from) { drawLinks(); return; }
        const to = ne.dataset.n, T = TYPES[(gr.nodes.find(x => x.id === to) || {}).type]; if (!T || !T.ins.length) { drawLinks(); return; }
        const pe = t.closest('[data-in]'), used = p2 => gr.links.some(l => l.to === to && l.port === p2);
        const port = pe ? pe.dataset.in : (T.ins.find(p2 => !used(p2)) || T.ins[0]);   // 점이 아니라 노드에 놓으면 빈 입력 칸에
        edit('노드 연결', g => { g.links = g.links.filter(l => !(l.to === to && l.port === port)); g.links.push({ from: d.from, to, port }); }); };
      addEventListener('pointermove', onMove); addEventListener('pointerup', onUp);
      ctx.onDispose(() => { removeEventListener('pointermove', onMove); removeEventListener('pointerup', onUp); removeEventListener('keydown', onKey); if (playTimer) clearInterval(playTimer); });
      let playTimer = 0;

      // ---- 미리보기 (고른 노드 · 없으면 결과) + 계산
      const big = h('canvas', { class: 'checker', style: { imageRendering: 'pixelated', borderRadius: '4px', maxWidth: '100%' } }), info = h('small', { class: 'hint' });
      let token = 0, lastOut = null;
      async function recompute() {
        const my = ++token, cache = {}, g2 = (store.get(K).list || [])[idx]; if (!g2) return;
        const nf = Math.max(1, g2.frames | 0 || 1); if (st.frame >= nf) st.frame = 0;
        const out = await evaluate(g2, cache, st.frame);
        for (const n of g2.nodes) if (!cache[n.id]) await renderNode(g2, n.id, cache, null, st.frame);
        if (my !== token || !area.isConnected) return;
        lastOut = out;
        g2.nodes.forEach(n => { const cv = thumbs[n.id], im = cache[n.id]; if (!cv || !im) return; const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.clearRect(0, 0, THUMB, THUMB);
          const k = Math.min(THUMB / im.width, THUMB / im.height), w = Math.max(1, Math.round(im.width * k)), hh = Math.max(1, Math.round(im.height * k)); g.drawImage(im, (THUMB - w) / 2, (THUMB - hh) / 2, w, hh); });
        const show = (st.sel && cache[st.sel]) || out, z = Math.max(1, st.zoom | 0), rep = st.tile ? 3 : 1;
        big.width = show.width * z * rep; big.height = show.height * z * rep; const g = big.getContext('2d'); g.imageSmoothingEnabled = false;
        for (let j = 0; j < rep; j++) for (let i = 0; i < rep; i++) g.drawImage(show, i * show.width * z, j * show.height * z, show.width * z, show.height * z);
        const sn = g2.nodes.find(n => n.id === st.sel); info.textContent = `${sn ? '고른 노드: ' + TYPES[sn.type].name : '결과 (출력 노드)'} · ${show.width}×${show.height}` + (nf > 1 ? ` · 프레임 ${st.frame + 1}/${nf}` : '') + (st.tile ? ' · 3×3 으로 이어 붙여 봄' : '');
      }
      // ---- 오른쪽: 미리보기 · 고른 노드의 값 · 저장
      const sel = gr.nodes.find(n => n.id === st.sel), ST = sel && TYPES[sel.type];
      const setP = (k, v) => { edit('노드 값', g => { const n = g.nodes.find(x => x.id === st.sel); if (n) { n.p = n.p || {}; n.p[k] = v; } }, true); recompute(); };
      const paramEl = ([k, label, kind, def, opts]) => {
        const cur = sel.p && sel.p[k] !== undefined ? sel.p[k] : def; let inp;
        if (kind === 'num') { inp = h('input', { type: 'text', value: cur, class: 'mono', title: '숫자 또는 식 — t(0~1 한 바퀴) · frame · frames · pi · sin() cos() abs() floor() min() max() rand(n). 예: t*360 · sin(t*2*pi)*3' });
          inp.oninput = () => { const v = inp.value.trim(), num = /^-?\d*\.?\d+$/.test(v); const ok = v !== '' && (num || PDM.composeExprOk(v)); inp.style.outline = ok ? '' : '1px solid var(--bad)'; if (ok) setP(k, num ? parseFloat(v) : v); }; }
        else if (kind === 'color') { inp = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(cur) ? cur : '#000000', style: { width: '48px', padding: 0 } }); inp.oninput = () => setP(k, inp.value); }
        else if (kind === 'bool') { const c = h('input', { type: 'checkbox', checked: !!cur }); c.onchange = () => setP(k, c.checked); return h('label', { class: 'check' }, c, label); }
        else if (kind === 'select') { inp = h('select', {}, Object.entries(opts || {}).map(([v, t]) => h('option', { value: v, selected: v === cur }, t))); inp.onchange = () => setP(k, inp.value); }
        else if (kind === 'effect') { const fl = (store.get('effects') || {}).list || [];
          const s2 = h('select', {}, h('option', { value: '' }, fl.length ? '(고르기)' : '(만든 이펙트가 없습니다)'), fl.map(x => h('option', { value: x.id, selected: x.id === cur }, x.name || x.id))); s2.onchange = () => { setP(k, s2.value); ctx.refresh(); };
          inp = h('div', { style: { display: 'flex', gap: '4px' } }, s2, cur ? h('button', { class: 'btn sm', title: '이펙트 편집기에서 열기', onclick: e => { e.preventDefault(); if (PDM.effects && PDM.effects.ops) PDM.effects.ops.show(cur); } }, '열기') : null); }
        else if (kind === 'image') { const t = h('input', { type: 'text', value: cur || '', placeholder: 'assets/… 또는 game:sprites/…' }); t.onchange = () => setP(k, t.value.trim());
          inp = h('div', { class: 'imgpick' }, t, h('button', { class: 'btn sm', onclick: async e => { e.preventDefault(); const r = await PDM.ui.pickImage('sprites'); if (r) { t.value = r; setP(k, r); } } }, '찾기…')); }
        else if (kind === 'paint') { inp = h('div', {}, h('code', { style: { fontSize: '11px' } }, cur || '(아직 안 그림)'), h('div', { style: { marginTop: '4px' } }, h('button', { class: 'btn sm pri', onclick: async e => { e.preventDefault();
          const rel = cur || `assets/compose/${gr.id}_${sel.id}.png`; const out = await PDM.editPixelsModal('그리기 — ' + gr.name, rel, gr.w, gr.h); if (out) { PDM.assets.invalidate(out); setP(k, out); ctx.refresh(); } } }, '✎ 그리기…'))); }
        else { inp = h('input', { type: 'text', value: cur ?? '' }); inp.onchange = () => setP(k, inp.value); }
        return PDM.ui.field(label, inp); };
      const cats = {}; Object.entries(TYPES).forEach(([id, T]) => { if (id !== 'out') (cats[T.cat] = cats[T.cat] || []).push([id, T]); });
      const addNode = (type, e) => { const sx = scroll.scrollLeft, sy = scroll.scrollTop, id = nid(); st.sel = id;
        edit('노드 추가', g => { g.nodes.push({ id, type, x: Math.round((sx + 40 + Math.random() * 60) / 10) * 10, y: Math.round((sy + 40 + Math.random() * 60) / 10) * 10, p: {} }); }); };
      const outPath = () => gr.out || `assets/compose/${gr.id}.png`;
      const nFrames = () => Math.max(1, gr.frames | 0 || 1);
      const write = async (rel, canvasOrUrl) => { await pdm.writeDataURL(store.abs(rel), typeof canvasOrUrl === 'string' ? canvasOrUrl : canvasOrUrl.toDataURL('image/png')); PDM.assets.invalidate(rel); };
      /** 저장: 프레임이 하나면 그림 한 장, 여럿이면 시트 (가로로 이어 붙임 · 줄 바꿈은 "시트 한 줄 칸 수"). 저장한 경로를 돌려줌 */
      const savePng = async () => { const rel = outPath();
        try { const cur = (store.get(K).list || [])[idx]; const frames = await PDM.compose.evaluateAll(cur); const img = frames.length > 1 ? PDM.compose.toSheet(frames, cur.cols | 0) : frames[0];
          await write(rel, img); if (!gr.out) edit('저장 경로', g => { g.out = rel; }, true);
          syncEffects(rel, cur, frames.length); syncFilters(rel, cur, frames.length);
          PDM.log(`노드 합성기: 저장 ${rel}` + (frames.length > 1 ? ` (시트 ${frames.length}프레임 · 한 칸 ${cur.w}×${cur.h})` : ''), 'ok'); toast('저장했습니다: ' + rel); return rel; }
        catch (er) { toast('저장 실패: ' + (er.message || er), 'bad'); return null; } };
      /** 이 파일을 알갱이 그림으로 쓰는 이펙트 이미터의 프레임 설정을 지금 그림에 맞춤 */
      const fxSprite = (old, rel, g, n) => Object.assign({ fps: 10 }, old || {}, { png: rel, fw: n > 1 ? g.w : 0, fh: n > 1 ? g.h : 0, frames: n > 1 ? `0-${n - 1}` : '', fps: Math.max(1, g.fps | 0 || 8), anim: n > 1 ? (old && old.anim && old.anim !== 'none' ? old.anim : 'life') : 'none' });
      const syncEffects = (rel, g, n) => { if (PDM.effects && PDM.effects.invalidate) PDM.effects.invalidate(rel);
        const d = store.get('effects'); if (!d || !(d.list || []).some(f => (f.emitters || []).some(e => (e.sprite || {}).png === rel))) return;
        store.edit('effects', '알갱이 그림 맞추기 (노드 합성기)', r => r.list.forEach(f => (f.emitters || []).forEach(e => { const o = e.sprite || {}; if (o.png === rel && (n > 1 || (+o.fw === g.w && +o.fh === g.h))) e.sprite = fxSprite(o, rel, g, n); })), { silent: true }); };   // 한 장짜리 그래프(시트 전체를 고치는 경우)는 프레임 설정을 건드리지 않음
      /** 이 파일을 그림 층으로 쓰는 화면 필터: 시트 프레임 설정을 지금 그림에 맞춤 */
      const flLayer = (old, rel, g, n) => Object.assign({}, old, { png: rel, frames: n, fw: n > 1 ? g.w : 0, fps: Math.max(1, g.fps | 0 || 8) });
      const syncFilters = (rel, g, n) => { if (PDM.filters) PDM.filters.invalidate(rel);
        const d = store.get('filters'); if (!d || !(d.list || []).some(f => (f.layers || []).some(l => l.type === 'image' && l.png === rel))) return;
        store.edit('filters', '필터 그림 맞추기 (노드 합성기)', r => r.list.forEach(f => (f.layers || []).forEach((l, i) => { if (l.type === 'image' && l.png === rel && (n > 1 || (l.frames | 0) > 1)) f.layers[i] = flLayer(l, rel, g, n); })), { silent: true }); };
      const toFilter = async () => { const fl = (store.get('filters') || {}).list || []; if (!fl.length) { toast('화면 필터가 없습니다 — 확장 기능 "화면 필터"에서 먼저 만들어 주세요', 'bad'); return; }
        const s1 = h('select', {}, fl.map(f => h('option', { value: f.id }, f.name || f.id))), s2 = h('select', {});
        const fill = () => { const f = fl.find(x => x.id === s1.value); s2.innerHTML = ''; s2.append(h('option', { value: -1 }, '새 그림 층으로 추가')); (f.layers || []).forEach((l, i) => { if (l.type === 'image') s2.append(h('option', { value: i }, `${i + 1}번 층의 그림 바꾸기`)); }); }; s1.onchange = fill; fill();
        const pot = n => n > 0 && (n & (n - 1)) === 0;
        const ok = await PDM.ui.modal('화면 필터의 그림 층으로 넣기', h('div', { style: { minWidth: '360px' } }, PDM.ui.field('필터', s1), PDM.ui.field('층', s2),
          h('p', { class: 'hint' }, '저장한 뒤 이 그림을 필터의 그림 층으로 씁니다 — 화면 가득 반복해서 깔리므로 "이어 붙여 보기"로 가장자리가 이어지는지 확인하세요.' + (nFrames() > 1 ? ` 시트의 ${nFrames()}칸이 차례로 재생됩니다.` : '') + (pot(gr.w) && pot(gr.h) ? '' : ` 지금 크기 ${gr.w}×${gr.h} — 32 · 64 · 128 처럼 2의 거듭제곱이 아니면 일부 기기에서 반복이 깨질 수 있습니다.`))), [['취소', false], ['넣기', true, 'pri']]);
        if (!ok) return; const rel = await savePng(); if (!rel) return; const fid = s1.value, li = +s2.value, cur = (store.get(K).list || [])[idx], n = Math.max(1, cur.frames | 0 || 1);
        store.edit('filters', '필터 그림 (노드 합성기)', r => { const f = r.list.find(x => x.id === fid); if (!f) return; f.layers = f.layers || [];
          if (li >= 0 && f.layers[li]) f.layers[li] = flLayer(f.layers[li], rel, cur, n); else f.layers.push(flLayer({ type: 'image', on: true, alpha: 50, blend: 'normal', scale: 1, vx: 0, vy: 0, jitter: 0 }, rel, cur, n)); });
        toast('화면 필터에 넣었습니다'); };
      const toEffect = async () => { const fl = (store.get('effects') || {}).list || []; if (!fl.length) { toast('이펙트가 없습니다 — "이펙트 · 파티클"에서 먼저 만들어 주세요', 'bad'); return; }
        const s1 = h('select', {}, fl.map(f => h('option', { value: f.id }, f.name || f.id))), s2 = h('select', {});
        const fill = () => { const f = fl.find(x => x.id === s1.value); s2.innerHTML = ''; (f.emitters || []).forEach((e, i) => s2.append(h('option', { value: i }, `${i + 1}. ${e.name || '이미터'}`))); }; s1.onchange = fill; fill();
        const ok = await PDM.ui.modal('이펙트 알갱이 그림으로 넣기', h('div', { style: { minWidth: '360px' } }, PDM.ui.field('이펙트', s1), PDM.ui.field('이미터', s2),
          h('p', { class: 'hint' }, `저장한 뒤 그 이미터의 알갱이 그림을 이 파일로 바꿉니다.` + (nFrames() > 1 ? ` 시트의 ${nFrames()}칸(${gr.w}×${gr.h})이 프레임이 되고, 알갱이 수명에 맞춰 재생됩니다.` : '') + ' 이후 여기서 다시 저장하면 이펙트에도 바로 반영됩니다. 알갱이 색을 이펙트에서 입히려면 흰색·회색으로 그리세요.')), [['취소', false], ['넣기', true, 'pri']]);
        if (!ok) return; const rel = await savePng(); if (!rel) return; const fid = s1.value, ei = +s2.value, cur = (store.get(K).list || [])[idx], n = Math.max(1, cur.frames | 0 || 1);
        store.edit('effects', '알갱이 그림 (노드 합성기)', r => { const f = r.list.find(x => x.id === fid), e = f && f.emitters[ei]; if (e) e.sprite = fxSprite(e.sprite, rel, cur, n); });
        toast('이펙트 알갱이 그림을 바꿨습니다'); };
      const saveApng = async () => { if (!PDM.textfx || !PDM.textfx.encodeApng) { toast('APNG 만들기 기능을 찾지 못했습니다', 'bad'); return; }
        try { const cur = (store.get(K).list || [])[idx], frames = await PDM.compose.evaluateAll(cur), rel = outPath().replace(/\.png$/i, '') + '_anim.png';
          const bytes = await PDM.textfx.encodeApng(frames, Math.max(1, cur.fps | 0 || 8), 0); let bin = ''; const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes); for (let k = 0; k < u.length; k += 8192) bin += String.fromCharCode.apply(null, u.subarray(k, k + 8192));
          await write(rel, 'data:image/png;base64,' + btoa(bin)); toast('APNG 저장: ' + rel); PDM.log('노드 합성기: APNG ' + rel, 'ok'); }
        catch (er) { toast('APNG 저장 실패: ' + (er.message || er), 'bad'); } };
      // ---- 다른 편집기에 바로 넣기
      const pickFrom = async (title, opts, extra) => { if (!opts.length) { toast(title + ': 고를 것이 없습니다 — 먼저 만들어 주세요', 'bad'); return null; }
        const sl = h('select', {}, opts.map(([v, t]) => h('option', { value: v }, t))); const ok = await PDM.ui.modal(title, h('div', { style: { minWidth: '360px' } }, PDM.ui.field('어디에', sl), extra || null), [['취소', false], ['넣기', true, 'pri']]); return ok ? sl.value : null; };
      const toProp = async () => { const id = await pickFrom('오브젝트 그림으로 넣기', store.all('prop').map(x => [x.id, `${x.name || x.id} (${x.id})`]), h('p', { class: 'hint' }, `저장한 뒤 그 오브젝트의 그림을 이 파일로 바꾸고, 한 칸 크기를 ${gr.w}×${gr.h} 로 맞춥니다.` + (nFrames() > 1 ? ` 시트의 ${nFrames()}칸이 프레임이 됩니다.` : ''))); if (!id) return;
        const rel = await savePng(); if (!rel) return; store.edit('prop:' + id, '오브젝트 그림 (노드 합성기)', r => { r.sprite = Object.assign({}, r.sprite, { sheet: rel, frame: [gr.w, gr.h] }); }); toast('오브젝트 그림을 바꿨습니다'); };
      const toItem = async () => { const id = await pickFrom('아이템 그림으로 넣기', store.all('item').map(x => [x.id, `${x.name || x.id} (${x.id})`]), h('p', { class: 'hint' }, '저장한 뒤 그 아이템의 그림을 이 PNG 로 바꿉니다 (아이템 그림은 16×16 을 권장 · 첫 프레임만 씀).')); if (!id) return;
        const cur = (store.get(K).list || [])[idx], first = await PDM.compose.evaluate(cur, {}, 0), rel = outPath().replace(/\.png$/i, '') + '_item.png';
        try { await write(rel, first); } catch (er) { toast('저장 실패: ' + (er.message || er), 'bad'); return; }
        store.edit('item:' + id, '아이템 그림 (노드 합성기)', r => { r.sprite = { png: rel }; }); toast('아이템 그림을 바꿨습니다'); };
      const toTiles = async () => { const themes = ((store.get('world') || {}).customThemes || []).filter(c => c.tiles); const xi = h('input', { type: 'number', value: 0, min: 0, max: 15, style: { width: '70px' } }), yi = h('input', { type: 'number', value: 0, min: 0, max: 15, style: { width: '70px' } });
        const id = await pickFrom('타일셋 칸에 넣기', themes.map(c => [c.id, c.name || c.id]), h('div', {}, PDM.ui.row(PDM.ui.field('칸 x (0~15)', xi), PDM.ui.field('칸 y (0~15)', yi)),
          h('p', { class: 'hint' }, `사용자 테마의 타일셋(256×256, 16px 칸)에서 이 칸부터 그림을 그려 넣습니다. 지금 그림은 ${gr.w}×${gr.h} 이라 ${Math.ceil(gr.w / 16)}×${Math.ceil(gr.h / 16)}칸을 덮습니다 (첫 프레임). 되돌리려면 타일셋 편집에서 고치세요. 사용자 테마는 "맵 그림 (타일셋)"에서 만듭니다.`))); if (!id) return;
        const th = themes.find(c => c.id === id), cur = (store.get(K).list || [])[idx];
        try { const im = await PDM.assets.load(th.tiles), first = await PDM.compose.evaluate(cur, {}, 0), t = mk(im.width, im.height), g = cx(t); g.drawImage(im, 0, 0);
          const tc = Math.max(1, Math.round(im.width / 16)), px = clamp(+xi.value | 0, 0, 15) * tc, py = clamp(+yi.value | 0, 0, 15) * tc; g.clearRect(px, py, first.width, first.height); g.drawImage(first, px, py);   // 큰 타일셋이면 한 칸 = tc px (그림을 그 크기로 만들면 세밀하게 들어감)
          await write(th.tiles, t); toast(`「${th.name || th.id}」 타일셋에 넣었습니다`); PDM.log(`노드 합성기: 타일셋 ${th.tiles} 의 (${px / tc}, ${py / tc}) 칸에 넣음 (한 칸 ${tc}px)`, 'ok'); }
        catch (er) { toast('타일셋에 넣지 못했습니다: ' + (er.message || er), 'bad'); } };
      // ---- 재생
      const setPlay = on => { st.play = on; if (playTimer) { clearInterval(playTimer); playTimer = 0; }
        if (on && nFrames() > 1) playTimer = setInterval(() => { if (!area.isConnected) { clearInterval(playTimer); return; } st.frame = (st.frame + 1) % nFrames(); if (frameIn) frameIn.value = st.frame; recompute(); }, 1000 / Math.max(1, gr.fps | 0 || 8)); };
      let frameIn = null;
      const F = PDM.ui.F;
      const side = h('div', { style: { width: '320px', flex: 'none', display: 'flex', flexDirection: 'column', gap: '8px' } },
        h('div', { style: { border: '1px solid var(--line)', borderRadius: '8px', padding: '8px', background: 'var(--bg2)' } },
          h('div', { style: { maxHeight: '300px', overflow: 'auto', textAlign: 'center' } }, big), info,
          h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '4px' } },
            (() => { const z = h('input', { type: 'range', min: 1, max: 12, value: st.zoom, style: { width: '90px' }, title: '확대' }); z.oninput = () => { st.zoom = +z.value; recompute(); }; return z; })(),
            nFrames() > 1 ? h('button', { class: 'btn xs', onclick: e => { setPlay(!st.play); e.target.textContent = st.play ? '❚❚' : '▶'; } }, st.play ? '❚❚' : '▶') : null,
            nFrames() > 1 ? (frameIn = (() => { const f = h('input', { type: 'range', min: 0, max: nFrames() - 1, value: st.frame, style: { width: '90px' }, title: '프레임' }); f.oninput = () => { st.frame = +f.value; recompute(); }; return f; })()) : null,
            (() => { const c = h('input', { type: 'checkbox', checked: st.tile }); c.onchange = () => { st.tile = c.checked; recompute(); }; return h('label', { class: 'check', title: '배경 타일이 끊기지 않고 이어지는지 확인' }, c, '이어 붙여 보기'); })())),
        sel ? h('div', { style: { border: '1px solid var(--line)', borderRadius: '8px', padding: '8px 10px', background: 'var(--bg2)' } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' } }, h('b', { style: { flex: 1 } }, ST.name),
            sel.type !== 'out' ? h('button', { class: 'btn xs', onclick: () => { const id = nid(); edit('노드 복제', g => { const n = g.nodes.find(x => x.id === st.sel); g.nodes.push(Object.assign(PDM.clone(n), { id, x: n.x + 20, y: n.y + 20 })); }); } }, '복제') : null,
            sel.type !== 'out' ? h('button', { class: 'btn xs danger', onclick: () => { const id = st.sel; st.sel = null; edit('노드 삭제', g => { g.nodes = g.nodes.filter(x => x.id !== id); g.links = g.links.filter(l => l.from !== id && l.to !== id); }); } }, '삭제') : null),
          ST.params.length ? ST.params.map(paramEl) : h('small', { class: 'hint' }, sel.type === 'out' ? '이 노드에 이어진 그림이 결과입니다.' : '정할 값이 없습니다.'))
          : h('div', { class: 'hint', style: { padding: '4px 2px' } }, '노드를 누르면 값을 고칩니다. 노드를 끌어 옮기고, 선을 누르면 연결이 끊깁니다.'),
        h('div', { style: { border: '1px solid var(--line)', borderRadius: '8px', padding: '8px 10px', background: 'var(--bg2)' } },
          h('b', {}, '그림 설정 · 저장'),
          PDM.ui.row(F.text(K, ['list', idx, 'name'], { label: '이름', rerender: true }), F.num(K, ['list', idx, 'w'], { label: '가로 (px)', int: true, min: 1, max: 1024, rerender: true }), F.num(K, ['list', idx, 'h'], { label: '세로 (px)', int: true, min: 1, max: 1024, rerender: true })),
          PDM.ui.row(F.num(K, ['list', idx, 'frames'], { label: '프레임 수 (1 = 정지 그림)', int: true, min: 1, max: 64, def: 1, rerender: true }), F.num(K, ['list', idx, 'fps'], { label: '초당 프레임', int: true, min: 1, max: 60, def: 8, rerender: true }), F.num(K, ['list', idx, 'cols'], { label: '시트 한 줄 칸 수 (0 = 한 줄)', int: true, min: 0, max: 64, def: 0 })),
          F.text(K, ['list', idx, 'out'], { label: '저장할 파일 (프로젝트 안)', placeholder: `assets/compose/${gr.id}.png` }),
          h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' } },
            h('button', { class: 'btn pri', onclick: savePng }, nFrames() > 1 ? '시트 PNG 로 저장' : 'PNG 로 저장'),
            nFrames() > 1 ? h('button', { class: 'btn', title: '움직이는 그림 한 장 (미리 보기 · 공유용)', onclick: saveApng }, 'APNG 로 저장') : null,
            h('button', { class: 'btn', title: '저장한 뒤 픽셀 편집기로 열어 손으로 다듬습니다', onclick: async () => { await savePng(); const o = await PDM.editPixelsModal('다듬기 — ' + gr.name, outPath(), gr.w, gr.h); if (o) PDM.assets.invalidate(o); } }, '저장하고 다듬기…')),
          h('div', { class: 'fl', style: { marginTop: '8px' } }, '다른 편집기에 바로 넣기'),
          h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '2px 0 6px' } }, h('button', { class: 'btn sm', onclick: toProp }, '📦 오브젝트 그림으로…'), h('button', { class: 'btn sm', onclick: toItem }, '🎁 아이템 그림으로…'), h('button', { class: 'btn sm', onclick: toTiles }, '▦ 타일셋 칸에…'), h('button', { class: 'btn sm', onclick: toEffect }, '🎇 이펙트 알갱이로…'), h('button', { class: 'btn sm', onclick: toFilter }, '🌧 화면 필터 층으로…')),
          h('small', { class: 'hint' }, '저장한 PNG 는 캐릭터 · 오브젝트 · 아이템 그림, 타일셋, 일러스트의 "찾기…"에서 고를 수 있습니다. 그래프를 고친 뒤에는 다시 저장해야 그림이 바뀝니다.')));
      const palette = h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-start', margin: '0 0 8px' } },
        Object.entries(cats).map(([c, l]) => h('div', { style: { display: 'flex', gap: '3px', flexWrap: 'wrap', alignItems: 'center' } }, h('span', { class: 'fl', style: { marginRight: '2px' } }, c),
          l.map(([id, T]) => h('button', { class: 'btn xs', title: T.name + ' 노드 추가', onclick: e => addNode(id, e) }, '+ ' + T.name)))));
      recompute(); if (st.play) setPlay(true);
      return h('div', { class: 'editor' }, h('h2', {}, '🧩 노드 합성기'), intro, ops.bar(gr), head, palette,
        h('div', { style: { display: 'flex', gap: '12px', alignItems: 'flex-start' } }, scroll, side));
    }
  });
})();
