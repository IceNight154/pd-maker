// ================================================================
//  픽셀 편집기 (기존 메이커 스프라이트 탭을 부품으로 옮김)
//   PDM.pixelEditor({ width, height, src(데이터URL|null), scale, onSave(dataURL) }) → 요소
//   큰 이미지(스프라이트 시트, 타일셋)도 열 수 있고, 확대/격자/도구를 지원합니다.
// ================================================================
PDM.PALETTE = ['#000000', '#231b3b', '#4b3f73', '#6a45d6', '#a58bff', '#dcd5ef', '#ffffff', '#7a7a7a',
  '#b57a12', '#e6b95c', '#c2405a', '#ff7a93', '#1c8a69', '#5fd6b4', '#2b6cb0', '#63b3ed',
  '#7a4b2a', '#c98b5e', '#3f6b3a', '#8fce6a', '#5a1f2a', '#9a3a3a', '#2d5f86', '#a0d8ef'];

PDM.pixelEditor = function (o) {
  const { h } = PDM;
  let W = o.width || 16, H = o.height || 16;
  let scale = o.scale || Math.max(2, Math.floor(384 / Math.max(W, H)));
  let color = PDM.PALETTE[4], alpha = 1, tool = 'pen', grid = true, tileGrid = true, gridStep = o.gridStep || 0;   // alpha: 칠할 색의 불투명도 0~1
  const data = document.createElement('canvas'); data.width = W; data.height = H;
  const dg = data.getContext('2d', { willReadFrequently: true });
  // ---- 빛 레이어 (o.light): 그림과 같은 크기의 둘째 그림. 게임에서 그림 위에 "덧셈 합성"으로 그려져 실제로 빛나 보임 (<파일>_light.png)
  //  data 는 언제나 "지금 고치는 레이어", other 는 나머지 레이어 — 레이어를 바꾸면 두 캔버스의 내용을 맞바꿈
  const hasLight = !!o.light;
  const other = document.createElement('canvas'); other.width = W; other.height = H;
  const og = other.getContext('2d', { willReadFrequently: true });
  let layer = 'base', darkBg = true, showLight = true, lightMode = (o.light && o.light.mode) || 'add', lightBloom = +((o.light && o.light.bloom) || 0);
  const LIGHT_OPS = { add: 'lighter', screen: 'screen', overlay: 'overlay', dodge: 'color-dodge' };
  const baseCv = () => layer === 'base' ? data : other, lightCv = () => layer === 'light' ? data : other;
  function swapTo(l) { if (!hasLight || l === layer) return; const a = dg.getImageData(0, 0, W, H), b = og.getImageData(0, 0, W, H); dg.putImageData(b, 0, 0); og.putImageData(a, 0, 0); layer = l; if (typeof layerState === 'function') layerState(); }
  function setLayer(l) { if (!hasLight || l === layer) return; commitFloating(); swapTo(l); draw(); }
  const view = h('canvas', { class: 'px-canvas' });
  const hist = [], fut = [];
  const cap = () => ({ img: dg.getImageData(0, 0, W, H), w: W, h: H, layer });
  const put = st => { if (st.layer && st.layer !== layer) swapTo(st.layer);
    if (st.w !== W || st.h !== H) { const t = document.createElement('canvas'); t.width = other.width; t.height = other.height; t.getContext('2d').drawImage(other, 0, 0); W = st.w; H = st.h; data.width = W; data.height = H; other.width = W; other.height = H; og.drawImage(t, 0, 0); syncSize(); } dg.putImageData(st.img, 0, 0); };
  const snap = () => { hist.push(cap()); if (hist.length > 60) hist.shift(); fut.length = 0; };
  /** 작업 영역 크기 바꾸기 — anchor: 기존 그림을 어디에 둘지 (nw·n·ne·w·c·e·sw·s·se) */
  function resizeCanvas(nw, nh, anchor) {
    nw = Math.max(1, Math.min(4096, nw | 0)); nh = Math.max(1, Math.min(4096, nh | 0));
    if (nw === W && nh === H) return;
    snap();
    const old = document.createElement('canvas'); old.width = W; old.height = H; old.getContext('2d').drawImage(data, 0, 0);
    const ax = /w$/.test(anchor) || anchor === 'w' ? 0 : /e$/.test(anchor) ? 1 : 0.5;
    const ay = /^n/.test(anchor) ? 0 : /^s/.test(anchor) ? 1 : 0.5;
    const dx = Math.round((nw - W) * ax), dy = Math.round((nh - H) * ay);
    const old2 = document.createElement('canvas'); old2.width = W; old2.height = H; old2.getContext('2d').drawImage(other, 0, 0);
    W = nw; H = nh; data.width = W; data.height = H; other.width = W; other.height = H;
    dg.clearRect(0, 0, W, H); dg.drawImage(old, dx, dy); og.drawImage(old2, dx, dy);
    scale = Math.max(1, Math.min(48, Math.floor(384 / Math.max(W, H)) || 1));
    syncSize(); draw();
  }
  const sizeInfo = h('small', { class: 'hint' });
  const wIn = h('input', { type: 'number', min: 1, max: 4096, style: { width: '64px' } }), hIn = h('input', { type: 'number', min: 1, max: 4096, style: { width: '64px' } });
  function syncSize() { wIn.value = W; hIn.value = H; sizeInfo.textContent = '오른쪽 클릭 = 지우기 · Ctrl+휠 = 확대 · 그림 창 모서리 ◢ 끌기 = 표시 크기·배율. 크기 ' + W + '×' + H + (gridStep ? ` (칸 ${gridStep}px → ${Math.floor(W / gridStep)}×${Math.floor(H / gridStep)})` : ''); }

  function draw() {
    strokeFlush();
    if (document.activeElement !== zoomIn) zoomIn.value = scale;
    view.width = W * scale; view.height = H * scale;
    const g = view.getContext('2d'); g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, view.width, view.height);
    if (hasLight) {   // 그림 + 빛 레이어를 게임처럼 겹쳐 보기 (빛은 덧셈 합성)
      if (darkBg) { g.fillStyle = '#14121a'; g.fillRect(0, 0, view.width, view.height); }
      g.drawImage(baseCv(), 0, 0, W * scale, H * scale);
      if (showLight || layer === 'light') { g.globalCompositeOperation = LIGHT_OPS[lightMode] || 'lighter'; g.drawImage(lightCv(), 0, 0, W * scale, H * scale);
        if (lightBloom > 0) { g.globalCompositeOperation = 'lighter'; g.filter = `blur(${(lightBloom * (o.light.unit || 1) / 2.2 * scale).toFixed(1)}px) brightness(${(1 + lightBloom * (o.light.unit || 1) / 2.2 * 0.9).toFixed(2)})`; g.drawImage(lightCv(), 0, 0, W * scale, H * scale); g.filter = 'none'; }   // 번짐 (게임의 MakerBloom 과 같은 가우시안)
        g.globalCompositeOperation = 'source-over'; }
    } else g.drawImage(data, 0, 0, W * scale, H * scale);
    if (grid && scale >= 6) {
      g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1; g.beginPath();
      for (let x = 0; x <= W; x++) { g.moveTo(x * scale + .5, 0); g.lineTo(x * scale + .5, H * scale); }
      for (let y = 0; y <= H; y++) { g.moveTo(0, y * scale + .5); g.lineTo(W * scale, y * scale + .5); }
      g.stroke();
    }
    if (gridStep && tileGrid) {
      g.strokeStyle = 'rgba(165,139,255,.5)'; g.beginPath();
      for (let x = 0; x <= W; x += gridStep) { g.moveTo(x * scale + .5, 0); g.lineTo(x * scale + .5, H * scale); }
      for (let y = 0; y <= H; y += gridStep) { g.moveTo(0, y * scale + .5); g.lineTo(W * scale, y * scale + .5); }
      g.stroke();
    }
    // 붙여넣은(옮기는 중인) 그림 · 선택 영역 테두리
    if (floating) g.drawImage(floating.cv, floating.x * scale, floating.y * scale, floating.cv.width * scale, floating.cv.height * scale);
    if (sel && sel.mask && sel.mask.length !== W * H) sel = null;   // 크기를 바꾼 뒤의 낡은 선택
    if (sel) {
      g.save(); g.lineWidth = 1;
      const path = () => {
        g.beginPath();
        if (!sel.mask) { g.rect(sel.x * scale + .5, sel.y * scale + .5, sel.w * scale - 1, sel.h * scale - 1); return; }
        const m = sel.mask;   // 선택한 칸과 아닌 칸 사이의 변만 그림
        for (let y = sel.y; y < sel.y + sel.h; y++) for (let x = sel.x; x < sel.x + sel.w; x++) {
          if (!m[y * W + x]) continue;
          const X = x * scale + .5, Y = y * scale + .5, X2 = (x + 1) * scale - .5, Y2 = (y + 1) * scale - .5;
          if (y === 0 || !m[(y - 1) * W + x]) { g.moveTo(X, Y); g.lineTo(X2, Y); }
          if (y === H - 1 || !m[(y + 1) * W + x]) { g.moveTo(X, Y2); g.lineTo(X2, Y2); }
          if (x === 0 || !m[y * W + x - 1]) { g.moveTo(X, Y); g.lineTo(X, Y2); }
          if (x === W - 1 || !m[y * W + x + 1]) { g.moveTo(X2, Y); g.lineTo(X2, Y2); }
        }
      };
      g.strokeStyle = '#000'; g.setLineDash([]); path(); g.stroke();
      g.strokeStyle = floating ? '#5fd66a' : '#fff'; g.setLineDash([4, 4]); path(); g.stroke();
      g.restore();
    }
    if (selDrag && selDrag.pts && selDrag.pts.length > 1) {   // 올가미를 그리는 중
      g.save(); g.lineWidth = 1; g.strokeStyle = selDrag.mode === 'sub' ? '#ff7a7a' : '#ffe27a'; g.beginPath();
      selDrag.pts.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo']((x + .5) * scale, (y + .5) * scale)); g.stroke(); g.restore();
    }
    if (hov && brush > 1 && (tool === 'pen' || tool === 'erase')) {   // 브러쉬 크기 표시
      const o0 = Math.floor(brush / 2);
      g.save(); g.strokeStyle = 'rgba(255,255,255,.8)'; g.setLineDash([2, 2]); g.strokeRect((hov[0] - o0) * scale + .5, (hov[1] - o0) * scale + .5, brush * scale - 1, brush * scale - 1); g.restore();
    }
    selInfo.textContent = sel ? `선택 ${sel.w}×${sel.h} (${sel.x}, ${sel.y})${sel.mask ? ' · 모양 선택' : ''}${floating ? ' — 끌어서 옮기고 Enter 로 놓기' : ' — 칠하기는 선택 안에만'}` : '';
    if (o.onDraw) { try { o.onDraw(data); } catch (_) { /* 미리보기 오류는 무시 */ } }
  }
  // ---------------- 영역 선택 · 복사 · 붙여넣기 ----------------
  //  sel = 선택한 사각형 (픽셀 단위), floating = 붙여넣었거나 들어 올린 그림 (아직 놓지 않음 — 끌어서 옮김)
  let sel = null, floating = null, selDrag = null;
  const selInfo = h('small', { class: 'hint' });
  let brush = 1, hov = null;
  // 브러쉬 합성 방식 (그림 프로그램의 브러쉬 합성 모드) — 칠하는 색을 밑그림과 이 식으로 섞음 (b = 밑그림, s = 칠하는 색, 0~1)
  let brushMode = 'normal', brushSoft = false, lockAlpha = false, stroke = null;
  const BLEND = { normal: (b, s) => s, add: (b, s) => Math.min(1, b + s), dodge: (b, s) => s >= 1 ? 1 : Math.min(1, b / (1 - s)), screen: (b, s) => 1 - (1 - b) * (1 - s),
    overlay: (b, s) => b < .5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s), multiply: (b, s) => b * s };
  const BRUSH_MODES = { normal: '보통', add: '발광 (더하기)', dodge: '발광 닷지 (색상 닷지)', screen: '스크린', overlay: '오버레이', multiply: '곱하기 (어둡게)' };
  const sizes = { pen: 1, erase: 1 };   // 브러쉬 · 지우개 크기는 따로 기억
  const sizeKey = () => tool === 'erase' ? 'erase' : 'pen';
  const inSel = (x, y) => sel && x >= sel.x && y >= sel.y && x < sel.x + sel.w && y < sel.y + sel.h && (!sel.mask || sel.mask[y * W + x] === 1);
  // 선택 영역: 사각형(mask 없음) 또는 모양(mask = 칸마다 0/1, 크기 W×H). 더하기(Ctrl) · 빼기(Alt)는 mask 끼리 합침
  const rectMask = r => { const m = new Uint8Array(W * H); for (let y = Math.max(0, r.y); y < Math.min(H, r.y + r.h); y++) m.fill(1, y * W + Math.max(0, r.x), y * W + Math.min(W, r.x + r.w)); return m; };
  const selMask = s2 => !s2 ? new Uint8Array(W * H) : s2.mask ? s2.mask : rectMask(s2);
  function fromMask(m) {
    let x0 = W, y0 = H, x1 = -1, y1 = -1, n = 0;
    for (let i = 0; i < m.length; i++) if (m[i]) { const x = i % W, y = (i / W) | 0; n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null;
    const r = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    if (n !== r.w * r.h) r.mask = m;
    return r;
  }
  function combine(base, add, mode) {
    if (mode === 'new' || !base) return mode === 'sub' ? null : fromMask(add);
    const m = selMask(base).slice();
    for (let i = 0; i < m.length; i++) if (add[i]) m[i] = mode === 'add' ? 1 : 0;
    return fromMask(m);
  }
  const lineCells = (x0, y0, x1, y1, fn) => { if (![x0, y0, x1, y1].every(Number.isFinite) || Math.abs(x1 - x0) + Math.abs(y1 - y0) > 20000) return; let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy;
    for (;;) { fn(x0, y0); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } } };
  /** 올가미: 끌어서 그린 도형 안쪽 칸 */
  function lassoMask(pts) {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const cg = c.getContext('2d');
    cg.beginPath(); pts.forEach(([x, y], i) => cg[i ? 'lineTo' : 'moveTo'](x + .5, y + .5)); cg.closePath(); cg.fill();
    const d = cg.getImageData(0, 0, W, H).data, m = new Uint8Array(W * H);
    for (let i = 0; i < m.length; i++) if (d[i * 4 + 3] >= 128) m[i] = 1;
    const mark = (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) m[y * W + x] = 1; };
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; lineCells(a[0], a[1], b[0], b[1], mark); }
    return m;
  }
  /** 마법봉: 누른 칸과 이어진 같은 색 칸 */
  function wandMask(x0, y0) {
    const d = dg.getImageData(0, 0, W, H).data, m = new Uint8Array(W * H), t = (y0 * W + x0) * 4;
    const same = i => d[i] === d[t] && d[i + 1] === d[t + 1] && d[i + 2] === d[t + 2] && d[i + 3] === d[t + 3];
    const st = [y0 * W + x0];
    while (st.length) { const p = st.pop(); if (m[p] || !same(p * 4)) continue; m[p] = 1; const x = p % W;
      if (x > 0) st.push(p - 1); if (x < W - 1) st.push(p + 1); if (p >= W) st.push(p - W); if (p < W * (H - 1)) st.push(p + W); }
    return m;
  }
  /** 선택한 칸들을 투명하게 */
  function clearRegion(r) {
    if (!r.mask) { dg.clearRect(r.x, r.y, r.w, r.h); return; }
    const img = dg.getImageData(r.x, r.y, r.w, r.h), d = img.data;
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (r.mask[(r.y + y) * W + r.x + x]) { const i = (y * r.w + x) * 4; d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0; }
    dg.putImageData(img, r.x, r.y);
  }
  const undo = () => { if (hist.length) { fut.push(cap()); put(hist.pop()); floating = null; draw(); } };
  const redo = () => { if (fut.length) { hist.push(cap()); put(fut.pop()); floating = null; draw(); } };
  function setBrush(n) { brush = sizes[sizeKey()] = Math.max(1, Math.min(64, Math.round(n) || 1)); brushIn.value = brush; draw(); }
  function syncBrush() { brush = sizes[sizeKey()]; try { brushIn.value = brush; brushLbl.textContent = tool === 'erase' ? '지우개 크기' : '브러쉬 크기'; } catch (_) { /* 아직 화면을 만들기 전 */ } }
  function commitFloating() {
    if (!floating) return;
    snap(); dg.drawImage(floating.cv, floating.x, floating.y); floating = null;
  }
  function deselect() { commitFloating(); sel = null; draw(); }
  function regionCanvas(r) {
    const c = document.createElement('canvas'); c.width = r.w; c.height = r.h; const cg = c.getContext('2d');
    cg.drawImage(data, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    if (r.mask) { const img = cg.getImageData(0, 0, r.w, r.h), d = img.data;   // 모양 선택: 선택하지 않은 칸은 비움
      for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (!r.mask[(r.y + y) * W + r.x + x]) { const i = (y * r.w + x) * 4; d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0; }
      cg.putImageData(img, 0, 0); }
    return c;
  }
  function copySel(cut) {
    if (floating) { PDM._pixClip = floating.cv; if (cut) { floating = null; sel = null; draw(); } return; }
    const r = sel || { x: 0, y: 0, w: W, h: H };
    PDM._pixClip = regionCanvas(r);
    try { PDM._pixClip.toBlob(b => { if (b && navigator.clipboard && window.ClipboardItem) navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]).catch(() => { }); }); } catch (_) { /* 시스템 클립보드는 안 되어도 됨 */ }
    if (cut) { snap(); clearRegion(r); draw(); }
    toast(cut ? `잘라냈습니다 (${r.w}×${r.h})` : `복사했습니다 (${r.w}×${r.h})`);
  }
  async function pasteClip() {
    let clip = PDM._pixClip;
    if (!clip) {   // 다른 프로그램에서 복사한 그림
      try { for (const it of await navigator.clipboard.read()) { const t = it.types.find(x => x.startsWith('image/')); if (!t) continue; const bm = await createImageBitmap(await it.getType(t)); clip = document.createElement('canvas'); clip.width = bm.width; clip.height = bm.height; clip.getContext('2d').drawImage(bm, 0, 0); break; } } catch (_) { /* 권한 없음 */ }
    }
    if (!clip) { toast('붙여넣을 그림이 없습니다 — 먼저 영역을 복사하세요', 'bad'); return; }
    commitFloating();
    const x = sel ? sel.x : 0, y = sel ? sel.y : 0;
    const c = document.createElement('canvas'); c.width = clip.width; c.height = clip.height; c.getContext('2d').drawImage(clip, 0, 0);
    floating = { cv: c, x, y }; sel = { x, y, w: c.width, h: c.height };
    setTool('select'); draw();
  }
  function clearSel() { if (floating) { floating = null; sel = null; draw(); return; } if (!sel) return; snap(); clearRegion(sel); draw(); }
  function setTool(id) { tool = id; PDM.$$('[data-t]', wrap).forEach(b => b.classList.toggle('on', b.dataset.t === id)); syncBrush(); }
  const onKeySel = e => {
    if (!wrap.isConnected) { removeEventListener('keydown', onKeySel); return; }
    if (/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) return;
    const k = e.key.toLowerCase(), c = e.ctrlKey || e.metaKey, code = e.code;
    if (e.key === 'Alt') { e.preventDefault(); return; }   // Alt = 선택 빼기 (창 메뉴로 초점이 가지 않게)
    if (c && code === 'KeyZ') { e.preventDefault(); e.stopPropagation(); e.shiftKey ? redo() : undo(); return; }
    // Space 를 누른 채 끌기 = 작업 영역 이동 · Z 를 누른 채 끌기 = 확대/축소 (가운데에서 바깥으로 = 확대, 안쪽으로 = 축소)
    if (code === 'Space' && !c) { e.preventDefault(); e.stopPropagation(); if (!navKey) { navKey = 'pan'; view.style.cursor = 'grab'; } return; }
    if (code === 'KeyZ' && !c && !e.altKey) { e.preventDefault(); if (!navKey) { navKey = 'zoom'; view.style.cursor = 'zoom-in'; } return; }
    if (c && code === 'KeyD') { e.preventDefault(); e.stopPropagation(); deselect(); return; }   // 선택 해제
    if (c && code === 'KeyY') { e.preventDefault(); e.stopPropagation(); redo(); return; }
    if (!c && !e.altKey) {
      const tk = { KeyB: 'pen', KeyE: 'erase', KeyG: 'fill', KeyL: 'lasso', KeyW: 'wand', KeyM: 'select', KeyI: 'pick' }[code];
      if (tk) { e.preventDefault(); if (!SEL_TOOLS.includes(tk)) commitFloating(); setTool(tk); draw(); return; }
      if (code === 'BracketLeft') { e.preventDefault(); setBrush(brush - 1); return; }
      if (code === 'BracketRight') { e.preventDefault(); setBrush(brush + 1); return; }
    }
    if (c && k === 'c') { e.preventDefault(); copySel(false); }
    else if (c && k === 'x') { e.preventDefault(); copySel(true); }
    else if (c && k === 'v') { e.preventDefault(); pasteClip(); }
    else if (c && k === 'a') { e.preventDefault(); commitFloating(); sel = { x: 0, y: 0, w: W, h: H }; if (!SEL_TOOLS.includes(tool)) setTool('select'); draw(); }
    else if (k === 'escape' && (sel || floating)) { e.preventDefault(); e.stopPropagation(); if (floating) { floating = null; sel = null; draw(); } else deselect(); }
    else if (k === 'enter' && floating) { e.preventDefault(); e.stopPropagation(); commitFloating(); draw(); }
    else if ((k === 'delete' || k === 'backspace') && (sel || floating)) { e.preventDefault(); clearSel(); }
  };
  addEventListener('keydown', onKeySel, true);
  let navKey = null, nav = null;
  const onKeyUpNav = e => {
    if (!wrap.isConnected) { removeEventListener('keyup', onKeyUpNav, true); return; }
    if ((e.code === 'Space' && navKey === 'pan') || (e.code === 'KeyZ' && navKey === 'zoom')) { navKey = null; if (!nav) view.style.cursor = ''; }
  };
  addEventListener('keyup', onKeyUpNav, true);
  addEventListener('blur', () => { navKey = null; nav = null; view.style.cursor = ''; });
  addEventListener('pointermove', e => {
    if (!nav) return;
    const pn = view.parentNode;
    if (nav.type === 'pan') { pn.scrollLeft = nav.l - (e.clientX - nav.x); pn.scrollTop = nav.t - (e.clientY - nav.y); return; }
    const d = Math.hypot(e.clientX - nav.cx, e.clientY - nav.cy);
    const ns = Math.max(1, Math.min(48, Math.round(nav.s0 + (d - nav.d0) / 12)));
    if (ns !== scale) {   // 가운데에 보이던 곳이 그대로 가운데에 오게
      const fx = (pn.scrollLeft + pn.clientWidth / 2) / scale, fy = (pn.scrollTop + pn.clientHeight / 2) / scale;
      scale = ns; draw();
      pn.scrollLeft = fx * scale - pn.clientWidth / 2; pn.scrollTop = fy * scale - pn.clientHeight / 2;
    }
  });
  addEventListener('pointerup', () => { if (nav) { nav = null; view.style.cursor = navKey === 'pan' ? 'grab' : navKey === 'zoom' ? 'zoom-in' : ''; } });
  const hex = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  const SEL_TOOLS = ['select', 'lasso', 'wand'];
  function px1(x, y, c) {
    if (x < 0 || y < 0 || x >= W || y >= H || (sel && !floating && !inSel(x, y))) return;   // 선택이 있으면 그 안에만
    // 칸을 그 색·불투명도로 바꿈 (덧칠이 아니라 바꾸기 — 반투명 색을 정확히 넣기 위해)
    dg.clearRect(x, y, 1, 1);
    if (c !== null && alpha > 0) { dg.globalAlpha = alpha; dg.fillStyle = c; dg.fillRect(x, y, 1, 1); dg.globalAlpha = 1; }
  }
  /** 브러쉬 크기만큼 (정사각형, 누른 칸이 가운데) */
  function setPx(x, y, c) {
    const o0 = Math.floor(brush / 2);
    if (c === null || (brushMode === 'normal' && !brushSoft && !lockAlpha)) { for (let dy = 0; dy < brush; dy++) for (let dx = 0; dx < brush; dx++) px1(x - o0 + dx, y - o0 + dy, c); return; }
    // 합성 브러쉬 (발광 · 닷지 · 오버레이 …) / 부드러운 브러쉬 / 알파 잠금: 한 번 긋는 동안은 같은 칸을 여러 번 지나가도 한 번만 칠해지게, 긋기 전 그림(stroke.base)에서 다시 계산
    if (!stroke) { const img = dg.getImageData(0, 0, W, H); stroke = { base: new Uint8ClampedArray(img.data), img, mask: new Float32Array(W * H), dirty: false }; }
    const cr = parseInt(c.slice(1, 3), 16) / 255, cg = parseInt(c.slice(3, 5), 16) / 255, cb = parseInt(c.slice(5, 7), 16) / 255, rad = brush / 2;
    for (let dy = 0; dy < brush; dy++) for (let dx = 0; dx < brush; dx++) {
      const px = x - o0 + dx, py = y - o0 + dy;
      if (px < 0 || py < 0 || px >= W || py >= H || (sel && !floating && !inSel(px, py))) continue;
      let cov = 1;
      if (brushSoft && brush > 1) { const d = Math.hypot(dx + .5 - rad, dy + .5 - rad) / rad; if (d >= 1) continue; cov = Math.pow(1 - d, 1.3); }
      const i = py * W + px; if (cov <= stroke.mask[i]) continue; stroke.mask[i] = cov;
      const k = cov * alpha, b = stroke.base, d2 = stroke.img.data, q = i * 4, ab = b[q + 3] / 255;
      if (lockAlpha && ab === 0) continue;
      const ao = lockAlpha ? ab : k + ab * (1 - k);
      [cr, cg, cb].forEach((sv, ch) => { const bv = b[q + ch] / 255; const m = BLEND[brushMode](bv, sv);
        const cs = (1 - ab) * sv + ab * m;                               // 투명한 곳에는 색 그대로, 그려진 곳에는 합성 결과
        const co = lockAlpha ? (k * m + (1 - k) * bv) * ab : k * cs + (1 - k) * ab * bv;
        d2[q + ch] = ao > 0 ? Math.round(Math.min(1, co / ao) * 255) : 0; });
      d2[q + 3] = Math.round(ao * 255);
      stroke.dirty = true;
    }
  }
  const strokeFlush = () => { if (stroke && stroke.dirty) { dg.putImageData(stroke.img, 0, 0); stroke.dirty = false; } };
  function fill(x0, y0, c) {
    const img = dg.getImageData(0, 0, W, H), d = img.data;
    const at = (x, y) => (y * W + x) * 4, t = at(x0, y0);
    const target = [d[t], d[t + 1], d[t + 2], d[t + 3]];
    let rgba = [0, 0, 0, 0];
    if (c) { rgba = [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), Math.round(alpha * 255)]; if (!rgba[3]) rgba = [0, 0, 0, 0]; }
    if (target.every((v, i) => v === rgba[i])) return;
    const st = [[x0, y0]];
    while (st.length) {
      const [x, y] = st.pop(); if (x < 0 || y < 0 || x >= W || y >= H || (sel && !inSel(x, y))) continue;
      const i = at(x, y); if (d[i] !== target[0] || d[i + 1] !== target[1] || d[i + 2] !== target[2] || d[i + 3] !== target[3]) continue;
      d[i] = rgba[0]; d[i + 1] = rgba[1]; d[i + 2] = rgba[2]; d[i + 3] = rgba[3];
      st.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    dg.putImageData(img, 0, 0);
  }
  const cell = e => { const r = view.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / scale), Math.floor((e.clientY - r.top) / scale)]; };
  let down = false;
  view.addEventListener('pointerdown', e => {
    stroke = null;   // 새로 긋기 시작
    if (navKey && e.button === 0) {   // 이동 · 확대/축소 중에는 그리지 않음
      e.preventDefault();
      const pn = view.parentNode, r = pn.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      nav = navKey === 'pan' ? { type: 'pan', x: e.clientX, y: e.clientY, l: pn.scrollLeft, t: pn.scrollTop }
        : { type: 'zoom', cx, cy, d0: Math.hypot(e.clientX - cx, e.clientY - cy), s0: scale };
      if (navKey === 'pan') view.style.cursor = 'grabbing';
      return;
    }
    const [x, y] = cell(e);
    if (SEL_TOOLS.includes(tool)) {
      if (e.button !== 0) { deselect(); return; }
      e.preventDefault();
      const mode = e.shiftKey ? 'add' : e.altKey ? 'sub' : 'new';   // Shift = 선택에 더하기 · Alt = 선택에서 빼기
      const cx = Math.max(0, Math.min(W - 1, x)), cy = Math.max(0, Math.min(H - 1, y));
      if (mode === 'new' && tool !== 'wand' && (floating ? x >= sel.x && y >= sel.y && x < sel.x + sel.w && y < sel.y + sel.h : inSel(x, y))) {   // 선택 안쪽을 끌면 그 그림을 옮김 (처음이면 들어 올림)
        if (!floating) { snap(); floating = { cv: regionCanvas(sel), x: sel.x, y: sel.y }; clearRegion(sel); sel = { x: sel.x, y: sel.y, w: sel.w, h: sel.h }; }
        selDrag = { move: true, ox: x - floating.x, oy: y - floating.y };
      } else {
        commitFloating();
        const base = mode === 'new' ? null : sel;
        if (tool === 'wand') { sel = combine(base, wandMask(cx, cy), mode); draw(); return; }
        selDrag = { tool, mode, base, x0: cx, y0: cy, moved: false, pts: tool === 'lasso' ? [[cx, cy]] : null };
        if (mode === 'new') sel = null;
      }
      draw(); return;
    }
    if (floating) commitFloating();
    if (tool === 'pick') { const p = dg.getImageData(x, y, 1, 1).data; if (p[3]) { color = hex(p[0], p[1], p[2]); colorIn.value = color; setAlpha(p[3] / 255); drawPal(); } return; }
    snap();
    if (tool === 'fill') { if (e.button !== 2) useColor(color); fill(x, y, e.button === 2 || e.button === 5 ? null : color); draw(); return; }
    if (tool !== 'erase' && e.button !== 2 && e.button !== 5) useColor(color);
    down = [x, y]; setPx(x, y, tool === 'erase' || e.button === 2 || e.button === 5 ? null : color); draw();
  });
  view.addEventListener('pointermove', e => {
    if (!selDrag) return;
    const [x, y] = cell(e);
    if (selDrag.move) { floating.x = x - selDrag.ox; floating.y = y - selDrag.oy; sel = { x: floating.x, y: floating.y, w: floating.cv.width, h: floating.cv.height }; }
    else { const cx = Math.max(0, Math.min(W - 1, x)), cy = Math.max(0, Math.min(H - 1, y)); selDrag.moved = true;
      if (selDrag.pts) { const l = selDrag.pts[selDrag.pts.length - 1]; if (l[0] !== cx || l[1] !== cy) selDrag.pts.push([cx, cy]); }
      else { const r = { x: Math.min(selDrag.x0, cx), y: Math.min(selDrag.y0, cy), w: Math.abs(cx - selDrag.x0) + 1, h: Math.abs(cy - selDrag.y0) + 1 };
        sel = selDrag.mode === 'new' ? r : combine(selDrag.base, rectMask(r), selDrag.mode); } }
    draw();
  });
  view.addEventListener('pointermove', e => {
    const [x, y] = cell(e);
    if (!down) { if (brush > 1 && (tool === 'pen' || tool === 'erase') && (!hov || hov[0] !== x || hov[1] !== y)) { hov = [x, y]; draw(); } return; }
    hov = [x, y];
    const c = tool === 'erase' || (e.buttons & 34) ? null : color;   // 34 = 오른쪽 버튼(2) + 펜 지우개(32)
    lineCells(down[0], down[1], x, y, (a, b) => setPx(a, b, c));   // 빨리 움직여도 끊기지 않게 사이를 이음
    down = [x, y]; draw();
  });
  view.addEventListener('pointerleave', () => { if (hov) { hov = null; draw(); } });
  addEventListener('pointerup', () => { strokeFlush(); stroke = null; down = false; if (selDrag) {
    if (!selDrag.move) {
      if (selDrag.pts) sel = selDrag.pts.length > 2 ? combine(selDrag.base, lassoMask(selDrag.pts), selDrag.mode) : selDrag.base;
      else if (!selDrag.moved) sel = selDrag.mode === 'new' ? null : selDrag.base;
    }
    selDrag = null; if (wrap.isConnected) draw(); } });
  view.addEventListener('contextmenu', e => e.preventDefault());
  // 태블릿 펜 · 터치: 브라우저가 "끌기 = 화면 스크롤"로 가져가지 않게 하고(touch-action), 펜이 그림 밖으로 나가도 계속 그려지게 함
  view.style.touchAction = 'none';
  view.addEventListener('pointerdown', e => { try { view.setPointerCapture(e.pointerId); } catch (_) { /* 잡을 수 없는 포인터 */ } });
  addEventListener('pointercancel', () => dispatchEvent(new PointerEvent('pointerup')));

  // 최근 사용 색 8칸 (실제로 칠한 색 — 편집기를 다시 열어도 이어짐)
  const recent = PDM._pixRecent = PDM._pixRecent || [];
  const recEl = h('div', { class: 'px-pal', title: '최근 사용 색' });
  function drawRecent() {
    recEl.innerHTML = '';
    for (let i = 0; i < 8; i++) { const c = recent[i];
      recEl.append(h('div', { class: 'px-sw' + (c && c === color ? ' on' : ''), title: c || '', style: c ? { background: c } : { background: 'transparent', border: '1px dashed var(--line)', cursor: 'default' },
        onclick: () => { if (!c) return; color = c; colorIn.value = c; drawPal(); drawRecent(); } })); }
  }
  function useColor(c) { if (!c) return; const i = recent.indexOf(c); if (i === 0) return; if (i > 0) recent.splice(i, 1); recent.unshift(c); recent.length = Math.min(recent.length, 8); drawRecent(); }
  const pal = h('div', { class: 'px-pal' });
  function drawPal() { pal.innerHTML = ''; PDM.PALETTE.forEach(c => pal.append(h('div', { class: 'px-sw' + (c === color ? ' on' : ''), style: { background: c }, onclick: () => { color = c; colorIn.value = c; drawPal(); } }))); }
  const colorIn = h('input', { type: 'color', value: color, oninput: () => { color = colorIn.value; drawPal(); } });
  // 불투명도 (0~100%) — 반투명 그림자·유리·빛 같은 색을 칠할 때
  const alphaIn = h('input', { type: 'range', min: 0, max: 100, step: 1, value: 100, style: { flex: 1, minWidth: '80px' } });
  const alphaNum = h('input', { type: 'number', min: 0, max: 100, value: 100, style: { width: '56px' } });
  function setAlpha(a) { alpha = Math.max(0, Math.min(1, a)); const v = Math.round(alpha * 100); alphaIn.value = v; alphaNum.value = v; colorIn.style.opacity = String(0.25 + alpha * 0.75); }
  alphaIn.addEventListener('input', () => setAlpha(alphaIn.value / 100));
  alphaNum.addEventListener('change', () => setAlpha((+alphaNum.value || 0) / 100));
  // 표시 배율 (화면에서 한 픽셀을 몇 배로 볼지) — 숫자로 바로 정함
  const zoomIn = h('input', { type: 'number', min: 1, max: 48, value: scale, style: { width: '56px' }, title: '표시 배율: 그림의 한 픽셀을 화면에서 몇 배로 볼지' });
  zoomIn.addEventListener('change', () => { scale = Math.max(1, Math.min(48, Math.round(+zoomIn.value || 1))); draw(); });
  const fitFrame = () => { const pane = view.parentNode; if (!pane || !gridStep) return; const r = pane.getBoundingClientRect(); scale = Math.max(1, Math.min(48, Math.floor(Math.min(r.width / gridStep, r.height / (o.rowStep || gridStep)) * 0.9))); draw(); };
  const lyB = h('button', { class: 'btn xs', title: '스프라이트 그림', onclick: e => { e.preventDefault(); setLayer('base'); } }, '🖼 그림'),
    lyL = h('button', { class: 'btn xs', title: '빛 레이어 — 여기에 칠한 색은 게임에서 그림 위에 더해져(덧셈 합성) 빛나 보입니다. 어두운 색 = 약한 빛, 밝은 색 = 강한 빛', onclick: e => { e.preventDefault(); setLayer('light'); } }, '✨ 효과 레이어');
  const lyBg = h('input', { type: 'checkbox', checked: true }), lyShow = h('input', { type: 'checkbox', checked: true });
  lyBg.onchange = () => { darkBg = lyBg.checked; draw(); }; lyShow.onchange = () => { showLight = lyShow.checked; draw(); };
  function layerState() { lyB.classList.toggle('pri', layer === 'base'); lyL.classList.toggle('pri', layer === 'light'); }
  const layerBar = !hasLight ? null : h('div', { class: 'px-layers', style: { border: '1px solid var(--line)', borderRadius: '6px', padding: '4px 8px', display: 'grid', gap: '4px' } },
    h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' } }, h('span', { class: 'fl' }, '레이어'), lyB, lyL,
      h('span', { class: 'fl' }, '합성'), (() => { const sl = h('select', { title: '효과 레이어를 그림 위에 겹치는 방식 (게임에서도 같은 방식으로 겹칩니다)' },
        ...[['add', '발광 (더하기)'], ['screen', '스크린'], ['overlay', '오버레이'], ['dodge', '닷지 (색상 닷지)']].map(([k, v]) => h('option', { value: k, selected: k === lightMode }, v)));
        sl.onchange = () => { lightMode = sl.value; if (o.light && o.light.onMode) o.light.onMode(lightMode); draw(); }; return sl; })(),
      h('span', { class: 'fl', title: '효과 레이어를 흐리게 번지게 해서 은은하게 퍼지는 빛을 만듭니다 (칸 밖 · 이웃 타일 위로도 퍼짐). 0 = 번짐 없음' }, '번짐'),
      (() => { const r = h('input', { type: 'range', min: 0, max: 32, step: 1, value: lightBloom, style: { width: '110px' } }), n = h('span', { class: 'hint', style: { width: '34px' } }, lightBloom + 'px');
        r.oninput = () => { lightBloom = +r.value; n.textContent = lightBloom + 'px'; draw(); }; r.onchange = () => { if (o.light && o.light.onBloom) o.light.onBloom(lightBloom); }; return h('span', { style: { display: 'inline-flex', gap: '4px', alignItems: 'center' } }, r, n); })(),
      h('label', { class: 'check' }, lyShow, '빛 보기'), h('label', { class: 'check' }, lyBg, '어두운 배경'),
      h('button', { class: 'btn xs', title: '빛 레이어를 모두 지웁니다', onclick: e => { e.preventDefault(); if (layer !== 'light') setLayer('light'); snap(); dg.clearRect(0, 0, W, H); draw(); } }, '빛 지우기')),
    h('small', { class: 'hint' }, '효과 레이어는 게임에서 그림 위에 고른 합성 방식으로 겹칩니다 — 발광 = 색을 더해 빛남 · 스크린 = 부드럽게 밝아짐 · 오버레이 = 밝은 색은 밝게 어두운 색은 어둡게(대비) · 닷지 = 밑그림이 밝을수록 강하게 타오름. 효과 레이어에 직접 칠해서 만듭니다 (_light.png 로 저장). 주변을 밝히는 빛과 그림자는 맵 오브젝트의 "광원"으로 만드세요.'));
  layerState();

  const toolBtn = (id, label, tip) => h('button', { class: 'tool' + (tool === id ? ' on' : ''), 'data-t': id, title: tip || '', onclick: e => { e.preventDefault(); if (!SEL_TOOLS.includes(id)) commitFloating(); setTool(id); draw(); } }, label);
  const brushIn = h('input', { type: 'number', min: 1, max: 64, value: 1, style: { width: '56px' }, title: '브러쉬 크기 — [ 작게 · ] 크게 (브러쉬와 지우개는 크기를 따로 기억)' });
  const brushLbl = h('span', { class: 'fl' }, '브러쉬 크기');
  brushIn.addEventListener('change', () => setBrush(+brushIn.value));
  const side = h('div', { class: 'px-side-col', style: { display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '260px', flex: '1 1 300px' } },
    layerBar,
    h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } }, toolBtn('pen', '✎ 브러쉬', 'B'), toolBtn('erase', '⌫ 지우개', 'E'), toolBtn('fill', '▣ 채우기', 'G'), toolBtn('pick', '⊙ 스포이드', 'I'),
      toolBtn('select', '⬚ 사각 선택', 'M'), toolBtn('lasso', '➰ 올가미', 'L — 끌어서 그린 모양 안쪽을 선택'), toolBtn('wand', '✦ 마법봉', 'W — 누른 칸과 이어진 같은 색을 선택')),
    h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' } }, brushLbl, brushIn,
      h('button', { class: 'btn xs', title: '[', onclick: e => { e.preventDefault(); setBrush(brush - 1); } }, '[ 작게'), h('button', { class: 'btn xs', title: ']', onclick: e => { e.preventDefault(); setBrush(brush + 1); } }, '크게 ]')),
    (() => { const ms = h('select', { title: '칠하는 색을 밑그림과 섞는 방식' }, ...Object.entries(BRUSH_MODES).map(([k, v]) => h('option', { value: k }, v)));
      const note = h('small', { class: 'hint' });
      const NOTES = { normal: '', add: '칠할수록 색이 더해져 밝아집니다 — 빛 · 불꽃 · 반짝임. 불투명도를 낮추고 여러 번 덧그리면 자연스럽습니다.', dodge: '밑그림이 밝은 곳일수록 강하게 타오릅니다 — 금속 광택 · 강한 빛. 어두운 색으로 칠해야 과하지 않습니다.',
        screen: '부드럽게 밝아집니다 (하얗게 타지 않음).', overlay: '밝은 색은 밝게, 어두운 색은 어둡게 — 색감 · 대비 입히기.', multiply: '칠할수록 어두워집니다 — 그림자.' };
      ms.onchange = () => { brushMode = ms.value; note.textContent = NOTES[brushMode]; };
      const sf = h('input', { type: 'checkbox' }), la = h('input', { type: 'checkbox' });
      sf.onchange = () => { brushSoft = sf.checked; }; la.onchange = () => { lockAlpha = la.checked; };
      return h('div', { class: 'px-brushmode', style: { display: 'grid', gap: '3px' } },
        h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' } }, h('span', { class: 'fl' }, '브러쉬 합성'), ms,
          h('label', { class: 'check', title: '브러쉬 가장자리로 갈수록 옅어집니다 (브러쉬 크기 2 이상)' }, sf, '부드럽게'),
          h('label', { class: 'check', title: '이미 그려진 칸에만 칠합니다 (투명한 칸과 윤곽은 그대로)' }, la, '그려진 칸에만')), note); })(),
    h('small', { class: 'hint' }, '선택 도구: Shift+조작 = 선택에 더하기 · Alt+조작 = 선택에서 빼기. Ctrl+Z 되돌리기 · Ctrl+Shift+Z 다시 실행 · Space+끌기 = 이동 · Z+끌기 = 확대(바깥으로)/축소(안쪽으로)'),
    h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' } },
      h('button', { class: 'btn xs', title: 'Ctrl+C — 선택한 영역 복사 (선택이 없으면 그림 전체)', onclick: e => { e.preventDefault(); copySel(false); } }, '복사'),
      h('button', { class: 'btn xs', title: 'Ctrl+X', onclick: e => { e.preventDefault(); copySel(true); } }, '잘라내기'),
      h('button', { class: 'btn xs', title: 'Ctrl+V — 선택한 자리(없으면 왼쪽 위)에 붙이고, 끌어서 옮긴 뒤 Enter', onclick: e => { e.preventDefault(); pasteClip(); } }, '붙여넣기'),
      h('button', { class: 'btn xs', title: 'Delete — 선택한 영역을 투명하게', onclick: e => { e.preventDefault(); clearSel(); } }, '지우기'),
      h('button', { class: 'btn xs', title: 'Ctrl+D 또는 Esc — 선택 해제 (붙여넣던 그림은 그 자리에 놓임)', onclick: e => { e.preventDefault(); deselect(); } }, '선택 해제')),
    selInfo,
    h('div', {}, h('span', { class: 'fl' }, '최근 사용 색'), recEl),
    pal, h('label', { class: 'field' }, h('span', { class: 'fl' }, '직접 색 고르기'), colorIn),
    h('div', { class: 'field' }, h('span', { class: 'fl' }, '불투명도 (%)'), h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, alphaIn, alphaNum)),
    h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' } }, h('span', { class: 'fl' }, '표시 배율 ×'), zoomIn,
      gridStep ? h('button', { class: 'btn xs', title: '한 프레임이 창에 꽉 차게', onclick: e => { e.preventDefault(); fitFrame(); } }, '프레임 하나에 맞춤') : null,
      h('button', { class: 'btn xs', title: '그림 전체가 창에 들어오게', onclick: e => { e.preventDefault(); const pane = view.parentNode; const r = pane.getBoundingClientRect(); scale = Math.max(1, Math.min(48, Math.floor(Math.min(r.width / W, r.height / H)))); draw(); } }, '전체 맞춤')),
    h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } },
      h('button', { class: 'btn sm', title: 'Ctrl+Z', onclick: e => { e.preventDefault(); undo(); } }, '↶ 되돌리기'),
      h('button', { class: 'btn sm', title: 'Ctrl+Shift+Z', onclick: e => { e.preventDefault(); redo(); } }, '↷'),
      h('button', { class: 'btn sm', onclick: e => { e.preventDefault(); scale = Math.min(48, scale + 2); draw(); } }, '+'),
      h('button', { class: 'btn sm', onclick: e => { e.preventDefault(); scale = Math.max(1, scale - 2); draw(); } }, '−'),
      (() => { const b = h('button', { class: 'btn sm pri', title: '픽셀 한 칸마다 그리는 옅은 격자 켜기/끄기', onclick: e => { e.preventDefault(); grid = !grid; b.classList.toggle('pri', grid); draw(); } }, '픽셀 격자'); return b; })(),
      gridStep ? (() => { const b = h('button', { class: 'btn sm pri', title: `${gridStep}px 칸(타일 · 프레임)마다 그리는 보라색 격자 켜기/끄기`, onclick: e => { e.preventDefault(); tileGrid = !tileGrid; b.classList.toggle('pri', tileGrid); draw(); } }, '칸 격자'); return b; })() : null,
      h('button', { class: 'btn sm', onclick: e => { e.preventDefault(); snap(); dg.clearRect(0, 0, W, H); draw(); } }, '비우기')),
    sizeInfo,
    (() => {
      const anc = h('select', {}, [['nw', '↖ 왼쪽 위'], ['n', '↑ 위'], ['ne', '↗ 오른쪽 위'], ['w', '← 왼쪽'], ['c', '· 가운데'], ['e', '→ 오른쪽'], ['sw', '↙ 왼쪽 아래'], ['s', '↓ 아래'], ['se', '↘ 오른쪽 아래']].map(([v, t]) => h('option', { value: v }, t)));
      anc.value = 'nw';
      const step = gridStep || 0;
      return h('div', { class: 'px-size' },
        h('div', { class: 'fl' }, '작업 영역 크기'),
        h('div', { style: { display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' } }, '가로', wIn, '세로', hIn),
        h('div', { style: { display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap', marginTop: '4px' } }, '그림 위치', anc,
          h('button', { class: 'btn sm', onclick: e => { e.preventDefault(); resizeCanvas(+wIn.value, +hIn.value, anc.value); } }, '적용')),
        h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' } },
          ...[16, 32, 48, 64].map(n => h('button', { class: 'btn xs', onclick: e => { e.preventDefault(); resizeCanvas(n, n, anc.value); } }, `${n}×${n}`)),
          h('button', { class: 'btn xs', onclick: e => { e.preventDefault(); resizeCanvas(W * 2, H * 2, anc.value); } }, '×2'),
          step ? h('button', { class: 'btn xs', title: '오른쪽에 프레임 한 칸 더', onclick: e => { e.preventDefault(); resizeCanvas(W + step, H, 'w'); } }, '+1 프레임') : null,
          step ? h('button', { class: 'btn xs', title: '아래에 한 줄 더 (갑옷 단계 등)', onclick: e => { e.preventDefault(); resizeCanvas(W, H + (o.rowStep || H), 'n'); } }, '+1 줄') : null));
    })(),
    o.onSave ? h('button', { class: 'btn pri', onclick: e => { e.preventDefault(); commitFloating(); o.onSave(baseCv().toDataURL('image/png')); } }, '저장') : null,
    o.onSaveAs ? h('button', { class: 'btn', title: '원래 파일은 그대로 두고 새 파일로 저장합니다', onclick: e => { e.preventDefault(); commitFloating(); o.onSaveAs(baseCv().toDataURL('image/png')); } }, '다른 이름으로 저장…') : null);
  // 보기 창: 오른쪽 아래 모서리(◢)를 끌면 창 크기와 배율이 함께 커지거나 작아짐 (두 번 누르면 처음 크기로)
  const pane = h('div', { class: 'px-pane', style: { overflow: 'auto', maxWidth: 'min(70vw, 900px)', maxHeight: '70vh' } }, view);
  const grip = h('div', { class: 'px-grip', title: '끌어서 표시 크기·배율 바꾸기 (두 번 누르면 처음 크기로)' });
  const paneBox = h('div', { class: 'px-panebox' }, pane, grip);
  const scale0 = scale;
  grip.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const r = pane.getBoundingClientRect(), sx = e.clientX, sy = e.clientY, s0 = scale;
    const modal = wrap.closest('.modal'); if (modal) { modal.style.maxWidth = '98vw'; modal.style.maxHeight = '96vh'; }
    // 옆의 도구 칸(최소 너비)과 실시간 미리보기 칸이 차지할 자리는 남겨 둠 — 그 위로 겹치지 않게
    const pvEl = wrap.parentNode && wrap.parentNode.classList && wrap.parentNode.classList.contains('px-preview') ? wrap.parentNode.querySelector('.lp-panel') : null;
    const maxW = Math.max(200, innerWidth - 270 - (pvEl ? pvEl.getBoundingClientRect().width + 12 : 0) - 90), maxH = Math.max(160, innerHeight - 190);
    const move = ev => {
      const nw = Math.max(160, Math.min(maxW, r.width + ev.clientX - sx)), nh = Math.max(120, Math.min(maxH, r.height + ev.clientY - sy));
      pane.style.maxWidth = 'none'; pane.style.maxHeight = 'none'; pane.style.width = nw + 'px'; pane.style.height = nh + 'px';
      // 창이 커진 비율만큼 배율도 (가로·세로 중 더 많이 바뀐 쪽 기준)
      const f = Math.abs(nw / r.width - 1) >= Math.abs(nh / r.height - 1) ? nw / r.width : nh / r.height;
      const ns = Math.max(1, Math.min(48, Math.round(s0 * f)));
      if (ns !== scale) { scale = ns; draw(); }
    };
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); document.body.style.cursor = ''; };
    addEventListener('pointermove', move); addEventListener('pointerup', up); document.body.style.cursor = 'nwse-resize';
  });
  grip.addEventListener('dblclick', e => { e.preventDefault(); pane.style.width = ''; pane.style.height = ''; pane.style.maxWidth = 'min(70vw, 900px)'; pane.style.maxHeight = '70vh'; scale = scale0; draw(); });
  const wrap = h('div', { class: 'px-wrap' }, paneBox, side);

  if (o.src) { const img = new Image(); img.onload = () => { dg.drawImage(img, 0, 0); draw(); }; img.src = o.src; }
  // Ctrl + 휠 = 확대/축소
  view.addEventListener('wheel', e => { if (!e.ctrlKey) return; e.preventDefault(); scale = Math.max(1, Math.min(48, scale + (e.deltaY < 0 ? 1 : -1))); draw(); }, { passive: false });
  syncSize(); drawPal(); drawRecent(); draw();
  wrap.toDataURL = () => { commitFloating(); return baseCv().toDataURL('image/png'); };
  /** 빛 레이어 그림 (아무것도 없으면 '') */
  wrap.lightDataURL = () => { if (!hasLight) return ''; commitFloating(); const c = lightCv(), d = c.getContext('2d').getImageData(0, 0, W, H).data; for (let i = 3; i < d.length; i += 4) if (d[i]) return c.toDataURL('image/png'); return ''; };
  wrap.blankDataURL = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c.toDataURL('image/png'); };
  Object.defineProperty(wrap, 'dataCanvas', { get: () => baseCv() });
  Object.defineProperty(wrap, 'lightCanvas', { get: () => hasLight && showLight ? lightCv() : null });
  wrap.lightState = () => ({ mode: lightMode, bloom: lightBloom });
  if (hasLight && o.light.src) { const li = new Image(); li.onload = () => { const lg0 = layer === 'light' ? dg : og; lg0.imageSmoothingEnabled = false; lg0.drawImage(li, 0, 0, li.width, li.height, 0, 0, W, H); draw(); }; li.src = o.light.src; }
  return wrap;
};

/** 모달로 픽셀 편집기를 열고, 저장하면 프로젝트에 PNG 로 씁니다. 저장한 상대 경로를 돌려줍니다.
 *  saveAs: 저장할 프로젝트 경로 (relPath 가 game: 원본일 때 — 묻지 않고 그곳에 씀) */
PDM.editPixelsModal = async function (title, relPath, w, h_, gridStep, saveAsPath, opts) {
  let src = null;
  try { const abs = PDM.assets.resolvePath(relPath); if (abs && await pdm.exists(abs)) src = await pdm.readDataURL(abs); } catch (_) { /* 새 그림 */ }
  let img = null;
  if (src) img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; });
  const W = img ? img.width : w, H = img ? img.height : h_;
  let result = null, asPath = null;
  const inProject = relPath && !relPath.startsWith('builtin:') && !relPath.startsWith('game:');
  /** 다른 이름으로 저장: 프로젝트 안의 새 경로를 묻고 (원래 파일은 그대로) 그 경로를 돌려줌 */
  const saveAs = async d => {
    const base = String(saveAs_default()).replace(/\\/g, '/');
    let out = (await PDM.ui.prompt('다른 이름으로 저장 — 프로젝트 안의 경로', base, '원래 파일은 그대로 두고 새 PNG 파일로 저장합니다. 예: assets/sprites/heroes/warrior_red.png') || '').trim().replace(/\\/g, '/');
    if (!out) return;
    if (/^([A-Za-z]:|\/|\.\.)/.test(out) || out.startsWith('game:') || out.startsWith('builtin:')) { toast('프로젝트 폴더 안의 경로를 적어 주세요 (예: assets/sprites/…)', 'bad'); return; }
    if (!/\.png$/i.test(out)) out += '.png';
    try { if (await pdm.exists(PDM.store.abs(out)) && !(await PDM.ui.confirm(`「${out}」 파일이 이미 있습니다. 덮어쓸까요?`))) return; } catch (_) { /* 확인 못 함 */ }
    asPath = out; result = d; PDM.$('.modal-foot .pri').click();
  };
  function saveAs_default() {
    const src0 = (typeof saveAsPath === 'string' && saveAsPath) || (inProject ? relPath : '');
    if (src0) return src0.replace(/(\.png)?$/i, '_copy.png');
    const name = String(relPath || 'new_sprite.png').split('/').pop().replace(/\.png$/i, '');
    return `assets/sprites/${name}_copy.png`;
  }
  // 타일셋 · 물 그림이면 옆에 "실시간 미리보기" (게임이 만든 층을 지금 그림으로)
  const tp = PDM.levelPreview && ((opts || {}).tilePreview ? { theme: opts.tilePreview, kind: 'tiles' } : PDM.levelPreview.themeOfPath(saveAsPath || relPath));
  let pv = null, other = null;
  // 빛 레이어 (opts.light): 같은 이름의 _light.png 를 같이 열고 같이 저장
  const lightOf = pth => String(pth).replace(/\.png$/i, '') + '_light.png';
  let lightSrc = null, lightHad = false;
  if ((opts || {}).light && relPath) { try { const la = PDM.assets.resolvePath(lightOf(relPath)); if (la && await pdm.exists(la)) { lightSrc = await pdm.readDataURL(la); lightHad = true; } } catch (_) { /* 빛 레이어 없음 */ } }
  const ed = PDM.pixelEditor({ width: W, height: H, src, light: (opts || {}).light ? { src: lightSrc, mode: (opts.light || {}).mode, onMode: (opts.light || {}).onMode, bloom: (opts.light || {}).bloom, onBloom: (opts.light || {}).onBloom, unit: (opts.light || {}).unit } : null, gridStep, rowStep: (opts || {}).rowStep, onSave: d => { result = d; PDM.$('.modal-foot .pri').click(); }, onSaveAs: saveAs, onDraw: () => { if (pv) pv.redraw(); } });
  let body = ed;
  if (tp && (PDM.SPD_LEVEL_PREVIEWS || {})[tp.theme]) {
    const T = PDM.THEMES[tp.theme];
    PDM.assets.load('game:' + (tp.kind === 'tiles' ? T.water : T.tiles)).then(im => { other = im; if (pv) pv.redraw(); }).catch(() => {});
    pv = PDM.levelPreview.panel({ theme: tp.theme, tiles: () => tp.kind === 'tiles' ? ed.dataCanvas : other, water: () => tp.kind === 'tiles' ? other : ed.dataCanvas,
      light: () => tp.kind === 'tiles' ? ed.lightCanvas : null, lightState: () => ed.lightState() });
    body = PDM.h('div', { class: 'px-preview', style: { display: 'flex', gap: '12px', alignItems: 'flex-start' } }, ed, pv.el);
  }
  // 노드 합성기(확장 기능)가 켜져 있으면: 이 그림을 노드 합성기로 보내기 (저장하면 이 파일이 바뀜)
  const canCompose = PDM.compose && PDM.compose.fromImage && PDM.extensions && PDM.extensions.on('compose') && src;
  const ok = await PDM.ui.modal(title, body, [['취소', false], ...(canCompose ? [['🧩 노드 합성기에서 편집', 'compose']] : []), ['저장', () => true, 'pri']]);
  if (ok === 'compose') { await PDM.compose.fromImage(relPath, asPath || saveAsPath || (inProject ? relPath : ''), W, H); return null; }
  if (!ok) return null;
  const data = result || ed.toDataURL();
  let out = asPath || saveAsPath || relPath;
  if (!out || out.startsWith('builtin:') || out.startsWith('game:')) {
    out = await PDM.ui.prompt('프로젝트 안에 저장할 경로', 'assets/sprites/new_sprite.png'); if (!out) return null;
  }
  await pdm.writeDataURL(PDM.store.abs(out), data);
  if ((opts || {}).light) { try { const ld = ed.lightDataURL(), lp = lightOf(out);
    if (ld) { await pdm.writeDataURL(PDM.store.abs(lp), ld); PDM.assets.invalidate(lp); PDM.log('빛 레이어 저장: ' + lp, 'ok'); }
    else if (lightHad || await pdm.exists(PDM.store.abs(lp))) { await pdm.writeDataURL(PDM.store.abs(lp), ed.blankDataURL()); PDM.assets.invalidate(lp); }   // 빛을 모두 지움 → 빈 그림
  } catch (err) { PDM.log('빛 레이어 저장 실패: ' + err.message, 'err'); } }
  PDM.assets.invalidate(out);
  PDM.log('그림 저장: ' + out, 'ok');
  return out;
};
