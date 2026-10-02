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
  let color = PDM.PALETTE[4], alpha = 1, tool = 'pen', grid = true, gridStep = o.gridStep || 0;   // alpha: 칠할 색의 불투명도 0~1
  const data = document.createElement('canvas'); data.width = W; data.height = H;
  const dg = data.getContext('2d', { willReadFrequently: true });
  const view = h('canvas', { class: 'px-canvas' });
  const hist = [], fut = [];
  const cap = () => ({ img: dg.getImageData(0, 0, W, H), w: W, h: H });
  const put = st => { if (st.w !== W || st.h !== H) { W = st.w; H = st.h; data.width = W; data.height = H; syncSize(); } dg.putImageData(st.img, 0, 0); };
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
    W = nw; H = nh; data.width = W; data.height = H;
    dg.clearRect(0, 0, W, H); dg.drawImage(old, dx, dy);
    scale = Math.max(1, Math.min(48, Math.floor(384 / Math.max(W, H)) || 1));
    syncSize(); draw();
  }
  const sizeInfo = h('small', { class: 'hint' });
  const wIn = h('input', { type: 'number', min: 1, max: 4096, style: { width: '64px' } }), hIn = h('input', { type: 'number', min: 1, max: 4096, style: { width: '64px' } });
  function syncSize() { wIn.value = W; hIn.value = H; sizeInfo.textContent = '오른쪽 클릭 = 지우기 · Ctrl+휠 = 확대 · 그림 창 모서리 ◢ 끌기 = 표시 크기·배율. 크기 ' + W + '×' + H + (gridStep ? ` (칸 ${gridStep}px → ${Math.floor(W / gridStep)}×${Math.floor(H / gridStep)})` : ''); }

  function draw() {
    if (document.activeElement !== zoomIn) zoomIn.value = scale;
    view.width = W * scale; view.height = H * scale;
    const g = view.getContext('2d'); g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, view.width, view.height);
    g.drawImage(data, 0, 0, W * scale, H * scale);
    if (grid && scale >= 6) {
      g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1; g.beginPath();
      for (let x = 0; x <= W; x++) { g.moveTo(x * scale + .5, 0); g.lineTo(x * scale + .5, H * scale); }
      for (let y = 0; y <= H; y++) { g.moveTo(0, y * scale + .5); g.lineTo(W * scale, y * scale + .5); }
      g.stroke();
    }
    if (gridStep) {
      g.strokeStyle = 'rgba(165,139,255,.5)'; g.beginPath();
      for (let x = 0; x <= W; x += gridStep) { g.moveTo(x * scale + .5, 0); g.lineTo(x * scale + .5, H * scale); }
      for (let y = 0; y <= H; y += gridStep) { g.moveTo(0, y * scale + .5); g.lineTo(W * scale, y * scale + .5); }
      g.stroke();
    }
    // 붙여넣은(옮기는 중인) 그림 · 선택 영역 테두리
    if (floating) g.drawImage(floating.cv, floating.x * scale, floating.y * scale, floating.cv.width * scale, floating.cv.height * scale);
    if (sel) {
      g.save(); g.lineWidth = 1;
      g.strokeStyle = '#000'; g.setLineDash([]); g.strokeRect(sel.x * scale + .5, sel.y * scale + .5, sel.w * scale - 1, sel.h * scale - 1);
      g.strokeStyle = floating ? '#5fd66a' : '#fff'; g.setLineDash([4, 4]); g.strokeRect(sel.x * scale + .5, sel.y * scale + .5, sel.w * scale - 1, sel.h * scale - 1);
      g.restore();
    }
    selInfo.textContent = sel ? `선택 ${sel.w}×${sel.h} (${sel.x}, ${sel.y})${floating ? ' — 끌어서 옮기고 Enter 로 놓기' : ''}` : '';
  }
  // ---------------- 영역 선택 · 복사 · 붙여넣기 ----------------
  //  sel = 선택한 사각형 (픽셀 단위), floating = 붙여넣었거나 들어 올린 그림 (아직 놓지 않음 — 끌어서 옮김)
  let sel = null, floating = null, selDrag = null;
  const selInfo = h('small', { class: 'hint' });
  const inSel = (x, y) => sel && x >= sel.x && y >= sel.y && x < sel.x + sel.w && y < sel.y + sel.h;
  function commitFloating() {
    if (!floating) return;
    snap(); dg.drawImage(floating.cv, floating.x, floating.y); floating = null;
  }
  function deselect() { commitFloating(); sel = null; draw(); }
  function regionCanvas(r) { const c = document.createElement('canvas'); c.width = r.w; c.height = r.h; c.getContext('2d').drawImage(data, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h); return c; }
  function copySel(cut) {
    if (floating) { PDM._pixClip = floating.cv; if (cut) { floating = null; sel = null; draw(); } return; }
    const r = sel || { x: 0, y: 0, w: W, h: H };
    PDM._pixClip = regionCanvas(r);
    try { PDM._pixClip.toBlob(b => { if (b && navigator.clipboard && window.ClipboardItem) navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]).catch(() => { }); }); } catch (_) { /* 시스템 클립보드는 안 되어도 됨 */ }
    if (cut) { snap(); dg.clearRect(r.x, r.y, r.w, r.h); draw(); }
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
  function clearSel() { if (floating) { floating = null; sel = null; draw(); return; } if (!sel) return; snap(); dg.clearRect(sel.x, sel.y, sel.w, sel.h); draw(); }
  function setTool(id) { tool = id; PDM.$$('[data-t]', wrap).forEach(b => b.classList.toggle('on', b.dataset.t === id)); }
  const onKeySel = e => {
    if (!wrap.isConnected) { removeEventListener('keydown', onKeySel); return; }
    if (/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) return;
    const k = e.key.toLowerCase(), c = e.ctrlKey || e.metaKey;
    if (c && k === 'c') { e.preventDefault(); copySel(false); }
    else if (c && k === 'x') { e.preventDefault(); copySel(true); }
    else if (c && k === 'v') { e.preventDefault(); pasteClip(); }
    else if (c && k === 'a') { e.preventDefault(); commitFloating(); sel = { x: 0, y: 0, w: W, h: H }; setTool('select'); draw(); }
    else if (k === 'escape' && (sel || floating)) { e.preventDefault(); e.stopPropagation(); if (floating) { floating = null; sel = null; draw(); } else deselect(); }
    else if (k === 'enter' && floating) { e.preventDefault(); e.stopPropagation(); commitFloating(); draw(); }
    else if ((k === 'delete' || k === 'backspace') && (sel || floating)) { e.preventDefault(); clearSel(); }
  };
  addEventListener('keydown', onKeySel, true);
  const hex = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  function setPx(x, y, c) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    // 칸을 그 색·불투명도로 바꿈 (덧칠이 아니라 바꾸기 — 반투명 색을 정확히 넣기 위해)
    dg.clearRect(x, y, 1, 1);
    if (c !== null && alpha > 0) { dg.globalAlpha = alpha; dg.fillStyle = c; dg.fillRect(x, y, 1, 1); dg.globalAlpha = 1; }
  }
  function fill(x0, y0, c) {
    const img = dg.getImageData(0, 0, W, H), d = img.data;
    const at = (x, y) => (y * W + x) * 4, t = at(x0, y0);
    const target = [d[t], d[t + 1], d[t + 2], d[t + 3]];
    let rgba = [0, 0, 0, 0];
    if (c) { rgba = [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), Math.round(alpha * 255)]; if (!rgba[3]) rgba = [0, 0, 0, 0]; }
    if (target.every((v, i) => v === rgba[i])) return;
    const st = [[x0, y0]];
    while (st.length) {
      const [x, y] = st.pop(); if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = at(x, y); if (d[i] !== target[0] || d[i + 1] !== target[1] || d[i + 2] !== target[2] || d[i + 3] !== target[3]) continue;
      d[i] = rgba[0]; d[i + 1] = rgba[1]; d[i + 2] = rgba[2]; d[i + 3] = rgba[3];
      st.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    dg.putImageData(img, 0, 0);
  }
  const cell = e => { const r = view.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / scale), Math.floor((e.clientY - r.top) / scale)]; };
  let down = false;
  view.addEventListener('mousedown', e => {
    const [x, y] = cell(e);
    if (tool === 'select') {
      if (e.button !== 0) { deselect(); return; }
      if (inSel(x, y)) {   // 선택 안쪽을 끌면 그 그림을 옮김 (처음이면 들어 올림)
        if (!floating) { snap(); floating = { cv: regionCanvas(sel), x: sel.x, y: sel.y }; dg.clearRect(sel.x, sel.y, sel.w, sel.h); }
        selDrag = { move: true, ox: x - floating.x, oy: y - floating.y };
      } else { commitFloating(); selDrag = { x0: Math.max(0, Math.min(W - 1, x)), y0: Math.max(0, Math.min(H - 1, y)), moved: false }; sel = null; }
      draw(); return;
    }
    if (floating) commitFloating();
    if (tool === 'pick') { const p = dg.getImageData(x, y, 1, 1).data; if (p[3]) { color = hex(p[0], p[1], p[2]); colorIn.value = color; setAlpha(p[3] / 255); drawPal(); } return; }
    snap();
    if (tool === 'fill') { fill(x, y, e.button === 2 ? null : color); draw(); return; }
    down = true; setPx(x, y, tool === 'erase' || e.button === 2 ? null : color); draw();
  });
  view.addEventListener('mousemove', e => {
    if (!selDrag) return;
    const [x, y] = cell(e);
    if (selDrag.move) { floating.x = x - selDrag.ox; floating.y = y - selDrag.oy; sel = { x: floating.x, y: floating.y, w: floating.cv.width, h: floating.cv.height }; }
    else { const cx = Math.max(0, Math.min(W - 1, x)), cy = Math.max(0, Math.min(H - 1, y)); selDrag.moved = true;
      sel = { x: Math.min(selDrag.x0, cx), y: Math.min(selDrag.y0, cy), w: Math.abs(cx - selDrag.x0) + 1, h: Math.abs(cy - selDrag.y0) + 1 }; }
    draw();
  });
  view.addEventListener('mousemove', e => { if (!down) return; const [x, y] = cell(e); setPx(x, y, tool === 'erase' || e.buttons === 2 ? null : color); draw(); });
  addEventListener('mouseup', () => { down = false; if (selDrag) { if (!selDrag.move && !selDrag.moved) sel = null; selDrag = null; if (wrap.isConnected) draw(); } });
  view.addEventListener('contextmenu', e => e.preventDefault());

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
  const toolBtn = (id, label) => h('button', { class: 'tool' + (tool === id ? ' on' : ''), 'data-t': id, onclick: e => { e.preventDefault(); if (id !== 'select') commitFloating(); setTool(id); draw(); } }, label);
  const side = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '190px' } },
    h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } }, toolBtn('pen', '✎ 펜'), toolBtn('erase', '⌫ 지우개'), toolBtn('fill', '▣ 채우기'), toolBtn('pick', '⊙ 스포이드'), toolBtn('select', '⬚ 영역 선택')),
    h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' } },
      h('button', { class: 'btn xs', title: 'Ctrl+C — 선택한 영역 복사 (선택이 없으면 그림 전체)', onclick: e => { e.preventDefault(); copySel(false); } }, '복사'),
      h('button', { class: 'btn xs', title: 'Ctrl+X', onclick: e => { e.preventDefault(); copySel(true); } }, '잘라내기'),
      h('button', { class: 'btn xs', title: 'Ctrl+V — 선택한 자리(없으면 왼쪽 위)에 붙이고, 끌어서 옮긴 뒤 Enter', onclick: e => { e.preventDefault(); pasteClip(); } }, '붙여넣기'),
      h('button', { class: 'btn xs', title: 'Delete — 선택한 영역을 투명하게', onclick: e => { e.preventDefault(); clearSel(); } }, '지우기'),
      h('button', { class: 'btn xs', title: 'Esc — 선택 해제 (붙여넣던 그림은 그 자리에 놓임)', onclick: e => { e.preventDefault(); deselect(); } }, '선택 해제')),
    selInfo,
    pal, h('label', { class: 'field' }, h('span', { class: 'fl' }, '직접 색 고르기'), colorIn),
    h('div', { class: 'field' }, h('span', { class: 'fl' }, '불투명도 (%)'), h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, alphaIn, alphaNum)),
    h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' } }, h('span', { class: 'fl' }, '표시 배율 ×'), zoomIn,
      gridStep ? h('button', { class: 'btn xs', title: '한 프레임이 창에 꽉 차게', onclick: e => { e.preventDefault(); fitFrame(); } }, '프레임 하나에 맞춤') : null,
      h('button', { class: 'btn xs', title: '그림 전체가 창에 들어오게', onclick: e => { e.preventDefault(); const pane = view.parentNode; const r = pane.getBoundingClientRect(); scale = Math.max(1, Math.min(48, Math.floor(Math.min(r.width / W, r.height / H)))); draw(); } }, '전체 맞춤')),
    h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } },
      h('button', { class: 'btn sm', onclick: e => { e.preventDefault(); if (hist.length) { fut.push(cap()); put(hist.pop()); draw(); } } }, '↶ 되돌리기'),
      h('button', { class: 'btn sm', onclick: e => { e.preventDefault(); if (fut.length) { hist.push(cap()); put(fut.pop()); draw(); } } }, '↷'),
      h('button', { class: 'btn sm', onclick: e => { e.preventDefault(); scale = Math.min(48, scale + 2); draw(); } }, '+'),
      h('button', { class: 'btn sm', onclick: e => { e.preventDefault(); scale = Math.max(1, scale - 2); draw(); } }, '−'),
      h('button', { class: 'btn sm', onclick: e => { e.preventDefault(); grid = !grid; draw(); } }, '격자'),
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
    o.onSave ? h('button', { class: 'btn pri', onclick: e => { e.preventDefault(); commitFloating(); o.onSave(data.toDataURL('image/png')); } }, '저장') : null,
    o.onSaveAs ? h('button', { class: 'btn', title: '원래 파일은 그대로 두고 새 파일로 저장합니다', onclick: e => { e.preventDefault(); commitFloating(); o.onSaveAs(data.toDataURL('image/png')); } }, '다른 이름으로 저장…') : null);
  // 보기 창: 오른쪽 아래 모서리(◢)를 끌면 창 크기와 배율이 함께 커지거나 작아짐 (두 번 누르면 처음 크기로)
  const pane = h('div', { class: 'px-pane', style: { overflow: 'auto', maxWidth: 'min(70vw, 900px)', maxHeight: '70vh' } }, view);
  const grip = h('div', { class: 'px-grip', title: '끌어서 표시 크기·배율 바꾸기 (두 번 누르면 처음 크기로)' });
  const paneBox = h('div', { class: 'px-panebox' }, pane, grip);
  const scale0 = scale;
  grip.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const r = pane.getBoundingClientRect(), sx = e.clientX, sy = e.clientY, s0 = scale;
    const modal = wrap.closest('.modal'); if (modal) { modal.style.maxWidth = '98vw'; modal.style.maxHeight = '96vh'; }
    const sideW = side.getBoundingClientRect().width;
    const maxW = Math.max(200, innerWidth - sideW - 90), maxH = Math.max(160, innerHeight - 190);
    const move = ev => {
      const nw = Math.max(160, Math.min(maxW, r.width + ev.clientX - sx)), nh = Math.max(120, Math.min(maxH, r.height + ev.clientY - sy));
      pane.style.maxWidth = 'none'; pane.style.maxHeight = 'none'; pane.style.width = nw + 'px'; pane.style.height = nh + 'px';
      // 창이 커진 비율만큼 배율도 (가로·세로 중 더 많이 바뀐 쪽 기준)
      const f = Math.abs(nw / r.width - 1) >= Math.abs(nh / r.height - 1) ? nw / r.width : nh / r.height;
      const ns = Math.max(1, Math.min(48, Math.round(s0 * f)));
      if (ns !== scale) { scale = ns; draw(); }
    };
    const up = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up); document.body.style.cursor = ''; };
    addEventListener('mousemove', move); addEventListener('mouseup', up); document.body.style.cursor = 'nwse-resize';
  });
  grip.addEventListener('dblclick', e => { e.preventDefault(); pane.style.width = ''; pane.style.height = ''; pane.style.maxWidth = 'min(70vw, 900px)'; pane.style.maxHeight = '70vh'; scale = scale0; draw(); });
  const wrap = h('div', { class: 'px-wrap' }, paneBox, side);

  if (o.src) { const img = new Image(); img.onload = () => { dg.drawImage(img, 0, 0); draw(); }; img.src = o.src; }
  // Ctrl + 휠 = 확대/축소
  view.addEventListener('wheel', e => { if (!e.ctrlKey) return; e.preventDefault(); scale = Math.max(1, Math.min(48, scale + (e.deltaY < 0 ? 1 : -1))); draw(); }, { passive: false });
  syncSize(); drawPal(); draw();
  wrap.toDataURL = () => { commitFloating(); return data.toDataURL('image/png'); };
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
  const ed = PDM.pixelEditor({ width: W, height: H, src, gridStep, rowStep: (opts || {}).rowStep, onSave: d => { result = d; PDM.$('.modal-foot .pri').click(); }, onSaveAs: saveAs });
  const ok = await PDM.ui.modal(title, ed, [['취소', false], ['저장', () => true, 'pri']]);
  if (!ok) return null;
  const data = result || ed.toDataURL();
  let out = asPath || saveAsPath || relPath;
  if (!out || out.startsWith('builtin:') || out.startsWith('game:')) {
    out = await PDM.ui.prompt('프로젝트 안에 저장할 경로', 'assets/sprites/new_sprite.png'); if (!out) return null;
  }
  await pdm.writeDataURL(PDM.store.abs(out), data);
  PDM.assets.invalidate(out);
  PDM.log('그림 저장: ' + out, 'ok');
  return out;
};
