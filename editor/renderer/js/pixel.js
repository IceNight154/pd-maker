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
  let color = PDM.PALETTE[4], tool = 'pen', grid = true, gridStep = o.gridStep || 0;
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
  function syncSize() { wIn.value = W; hIn.value = H; sizeInfo.textContent = '오른쪽 클릭 = 지우기 · Ctrl+휠 = 확대. 크기 ' + W + '×' + H + (gridStep ? ` (칸 ${gridStep}px → ${Math.floor(W / gridStep)}×${Math.floor(H / gridStep)})` : ''); }

  function draw() {
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
  }
  const hex = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  function setPx(x, y, c) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    if (c === null) dg.clearRect(x, y, 1, 1); else { dg.fillStyle = c; dg.fillRect(x, y, 1, 1); }
  }
  function fill(x0, y0, c) {
    const img = dg.getImageData(0, 0, W, H), d = img.data;
    const at = (x, y) => (y * W + x) * 4, t = at(x0, y0);
    const target = [d[t], d[t + 1], d[t + 2], d[t + 3]];
    let rgba = [0, 0, 0, 0];
    if (c) { rgba = [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 255]; }
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
    if (tool === 'pick') { const p = dg.getImageData(x, y, 1, 1).data; if (p[3]) { color = hex(p[0], p[1], p[2]); colorIn.value = color; drawPal(); } return; }
    snap();
    if (tool === 'fill') { fill(x, y, e.button === 2 ? null : color); draw(); return; }
    down = true; setPx(x, y, tool === 'erase' || e.button === 2 ? null : color); draw();
  });
  view.addEventListener('mousemove', e => { if (!down) return; const [x, y] = cell(e); setPx(x, y, tool === 'erase' || e.buttons === 2 ? null : color); draw(); });
  addEventListener('mouseup', () => { down = false; });
  view.addEventListener('contextmenu', e => e.preventDefault());

  const pal = h('div', { class: 'px-pal' });
  function drawPal() { pal.innerHTML = ''; PDM.PALETTE.forEach(c => pal.append(h('div', { class: 'px-sw' + (c === color ? ' on' : ''), style: { background: c }, onclick: () => { color = c; colorIn.value = c; drawPal(); } }))); }
  const colorIn = h('input', { type: 'color', value: color, oninput: () => { color = colorIn.value; drawPal(); } });
  const toolBtn = (id, label) => h('button', { class: 'tool' + (tool === id ? ' on' : ''), 'data-t': id, onclick: e => { e.preventDefault(); tool = id; PDM.$$('[data-t]', wrap).forEach(b => b.classList.toggle('on', b.dataset.t === id)); } }, label);
  const side = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '190px' } },
    h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } }, toolBtn('pen', '✎ 펜'), toolBtn('erase', '⌫ 지우개'), toolBtn('fill', '▣ 채우기'), toolBtn('pick', '⊙ 스포이드')),
    pal, h('label', { class: 'field' }, h('span', { class: 'fl' }, '직접 색 고르기'), colorIn),
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
    o.onSave ? h('button', { class: 'btn pri', onclick: e => { e.preventDefault(); o.onSave(data.toDataURL('image/png')); } }, '저장') : null);
  const wrap = h('div', { class: 'px-wrap' }, h('div', { style: { overflow: 'auto', flex: '1 1 auto', minWidth: '0', maxWidth: 'min(70vw, 900px)', maxHeight: '70vh' } }, view), side);

  if (o.src) { const img = new Image(); img.onload = () => { dg.drawImage(img, 0, 0); draw(); }; img.src = o.src; }
  // Ctrl + 휠 = 확대/축소
  view.addEventListener('wheel', e => { if (!e.ctrlKey) return; e.preventDefault(); scale = Math.max(1, Math.min(48, scale + (e.deltaY < 0 ? 1 : -1))); draw(); }, { passive: false });
  syncSize(); drawPal(); draw();
  wrap.toDataURL = () => data.toDataURL('image/png');
  return wrap;
};

/** 모달로 픽셀 편집기를 열고, 저장하면 프로젝트에 PNG 로 씁니다. 저장한 상대 경로를 돌려줍니다.
 *  saveAs: 저장할 프로젝트 경로 (relPath 가 game: 원본일 때 — 묻지 않고 그곳에 씀) */
PDM.editPixelsModal = async function (title, relPath, w, h_, gridStep, saveAs, opts) {
  let src = null;
  try { const abs = PDM.assets.resolvePath(relPath); if (abs && await pdm.exists(abs)) src = await pdm.readDataURL(abs); } catch (_) { /* 새 그림 */ }
  let img = null;
  if (src) img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; });
  const W = img ? img.width : w, H = img ? img.height : h_;
  let result = null;
  const ed = PDM.pixelEditor({ width: W, height: H, src, gridStep, rowStep: (opts || {}).rowStep, onSave: d => { result = d; PDM.$('.modal-foot .pri').click(); } });
  const ok = await PDM.ui.modal(title, ed, [['취소', false], ['저장', () => true, 'pri']]);
  if (!ok) return null;
  const data = result || ed.toDataURL();
  let out = saveAs || relPath;
  if (!out || out.startsWith('builtin:') || out.startsWith('game:')) {
    out = await PDM.ui.prompt('프로젝트 안에 저장할 경로', 'assets/sprites/new_sprite.png'); if (!out) return null;
  }
  await pdm.writeDataURL(PDM.store.abs(out), data);
  PDM.assets.invalidate(out);
  PDM.log('그림 저장: ' + out, 'ok');
  return out;
};
