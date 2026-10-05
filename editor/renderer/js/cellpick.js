// ================================================================
//  맵에서 칸 고르기 — PDM.pickCell({ node, x, y, lockNode, title }) → { node, x, y } 또는 null
//    맵(노드)의 타일과 놓인 오브젝트를 보면서 칸을 눌러 좌표를 정합니다 (NPC 이주 · 맵 이동 · 소환 · 순간 이동 · 퀘스트의 이주 칸).
// ================================================================
(function () {
  const { h, store } = PDM;
  let lastNode = '';
  PDM.pickCell = async function (o = {}) {
    const nodes = store.all('node');
    if (!nodes.length) { PDM.toast && PDM.toast('맵(노드)이 없습니다', 'bad'); return null; }
    const st = { node: (o.node && store.get('node:' + o.node) ? o.node : '') || (store.get('node:' + lastNode) ? lastNode : '') || (nodes.find(n => n.mode !== 'procedural') || nodes[0]).id, x: o.x ?? -1, y: o.y ?? -1 };
    const sel = h('select', { disabled: !!o.lockNode }, nodes.map(n => h('option', { value: n.id, selected: n.id === st.node }, PDM.World.fullName(n.id) + (n.mode === 'procedural' ? ' (자동 생성)' : n.mode === 'hybrid' ? ' (혼합 — 직접 그린 방)' : ''))));
    const cv = h('canvas', { style: { cursor: 'crosshair', imageRendering: 'pixelated', border: '1px solid var(--line)', borderRadius: '4px', display: 'block' } });
    const info = h('div', { class: 'hint', style: { minHeight: '18px', marginTop: '4px' } }), note = h('div', { class: 'hint' });
    let S = 16, fl = null, tiles = null, hover = null;
    const T = PDM.OBJECT_TYPES || {};
    const tname = (x, y) => { const t = PDM.TERRAIN_BY_ID[(fl.layers.terrain || [])[y * fl.size.w + x]]; return t ? t.name : '빈 칸'; };
    const passOk = (x, y) => { const t = PDM.TERRAIN_BY_ID[(fl.layers.terrain || [])[y * fl.size.w + x]]; return !!(t && t.pass); };
    const objsAt = (x, y) => (fl.objects || []).filter(ob => ob.at && ob.at.x === x && ob.at.y === y);
    const objName = ob => (T[ob.type] || {}).name + (ob.ref ? ' ' + (PDM.refName ? PDM.refName((T[ob.type] || {}).ref === 'character' ? 'char' : (T[ob.type] || {}).ref || ob.type, ob.ref) : ob.ref) : '');
    function paint() {
      const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.clearRect(0, 0, cv.width, cv.height);
      if (!fl || !fl.layers || !fl.layers.terrain || fl.mode === 'procedural') return;
      const W = fl.size.w, H = fl.size.h;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = fl.layers.terrain[y * W + x]; if (v == null || v < 0) { g.fillStyle = '#15131c'; g.fillRect(x * S, y * S, S, S); } else PDM.assets.drawTerrain(g, tiles, v, x * S, y * S, S); }
      g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1;
      for (let x = 0; x <= W; x++) { g.beginPath(); g.moveTo(x * S + .5, 0); g.lineTo(x * S + .5, H * S); g.stroke(); }
      for (let y = 0; y <= H; y++) { g.beginPath(); g.moveTo(0, y * S + .5); g.lineTo(W * S, y * S + .5); g.stroke(); }
      (fl.objects || []).forEach(ob => { if (!ob.at || ob.at.x == null) return; const c = (T[ob.type] || {}).color || '#fff';
        g.fillStyle = c; g.globalAlpha = .85; g.beginPath(); g.arc(ob.at.x * S + S / 2, ob.at.y * S + S / 2, S * .32, 0, 7); g.fill(); g.globalAlpha = 1;
        g.fillStyle = '#000'; g.font = `bold ${Math.max(8, S * .42)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(((T[ob.type] || {}).name || '?')[0], ob.at.x * S + S / 2, ob.at.y * S + S / 2 + 1); });
      if (hover) { g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 1; g.strokeRect(hover[0] * S + .5, hover[1] * S + .5, S - 1, S - 1); }
      if (st.x >= 0 && st.y >= 0 && st.x < W && st.y < H) { g.strokeStyle = '#ffd24a'; g.lineWidth = 3; g.strokeRect(st.x * S + 1.5, st.y * S + 1.5, S - 3, S - 3);
        g.beginPath(); g.moveTo(st.x * S + S / 2, st.y * S + 3); g.lineTo(st.x * S + S / 2, st.y * S + S - 3); g.moveTo(st.x * S + 3, st.y * S + S / 2); g.lineTo(st.x * S + S - 3, st.y * S + S / 2); g.lineWidth = 2; g.stroke(); }
    }
    const showInfo = () => {
      if (!fl || fl.mode === 'procedural' || !fl.layers) { info.textContent = ''; return; }
      const c = hover || (st.x >= 0 ? [st.x, st.y] : null);
      const sl = st.x >= 0 ? `고른 칸: (${st.x}, ${st.y}) ${tname(st.x, st.y)}${passOk(st.x, st.y) ? '' : ' ⚠ 지나갈 수 없는 칸 — 게임에서는 옆 칸이나 입구 근처에 섭니다'}` : '칸을 눌러 고르세요';
      info.textContent = sl + (hover ? `   ·   가리키는 칸: (${c[0]}, ${c[1]}) ${tname(c[0], c[1])}${objsAt(c[0], c[1]).length ? ' — ' + objsAt(c[0], c[1]).map(objName).join(', ') : ''}` : '');
    };
    async function load() {
      fl = store.get('node:' + st.node); lastNode = st.node;
      if (!fl || fl.mode === 'procedural' || !fl.layers || !fl.layers.terrain) { cv.width = 420; cv.height = 60; cv.style.display = 'none'; note.textContent = '이 맵은 자동 생성이라 들어갈 때마다 모양이 달라져서 칸을 고를 수 없습니다. 게임에서는 입구 근처에 섭니다 (좌표는 쓰이지 않음).'; showInfo(); return; }
      cv.style.display = 'block';
      note.textContent = fl.mode === 'hybrid' ? '혼합 맵: 여기 보이는 것은 "직접 그린 방"이고, 좌표는 그 방 안의 칸입니다.' : '동그라미 = 이 맵에 놓인 오브젝트 (첫 글자: 종류). 노란 십자 = 고른 칸.';
      S = Math.max(8, Math.min(40, Math.floor(Math.min(760 / fl.size.w, 460 / fl.size.h))));
      cv.width = fl.size.w * S; cv.height = fl.size.h * S;
      tiles = await PDM.assets.themeTiles((PDM.World.themeOf(fl.id) || '').replace('custom:', '')).catch(() => null);
      if (st.x >= fl.size.w || st.y >= fl.size.h) { st.x = -1; st.y = -1; }
      paint(); showInfo();
    }
    const cell = e => { const r = cv.getBoundingClientRect(), k = cv.width / r.width; return [Math.floor((e.clientX - r.left) * k / S), Math.floor((e.clientY - r.top) * k / S)]; };
    cv.onmousemove = e => { const c = cell(e); if (!fl || c[0] < 0 || c[1] < 0 || c[0] >= fl.size.w || c[1] >= fl.size.h) return; hover = c; paint(); showInfo(); };
    cv.onmouseleave = () => { hover = null; paint(); showInfo(); };
    cv.onclick = e => { const c = cell(e); if (!fl || c[0] < 0 || c[1] < 0 || c[0] >= fl.size.w || c[1] >= fl.size.h) return; st.x = c[0]; st.y = c[1]; paint(); showInfo(); };
    cv.ondblclick = () => { const bs = document.querySelectorAll('.modal-foot .pri'); if (bs.length) bs[bs.length - 1].click(); };
    sel.onchange = () => { st.node = sel.value; st.x = -1; st.y = -1; load(); };
    await load();
    const ok = await PDM.ui.modal(o.title || '맵에서 칸 고르기', h('div', { style: { minWidth: '460px' } },
      h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' } }, h('span', { class: 'fl' }, '맵'), sel,
        h('button', { class: 'btn xs', title: '이 맵을 맵 그리기 화면으로 열기', onclick: e => { e.preventDefault(); PDM.tabs.open('node:' + st.node); } }, '맵 열기')),
      h('div', { style: { maxHeight: '62vh', maxWidth: '80vw', overflow: 'auto' } }, cv), note, info), [['취소', false], ['이 칸으로', true, 'pri']]);
    if (!ok) return null;
    const proc = !fl || fl.mode === 'procedural';
    return { node: st.node, x: proc ? -1 : st.x, y: proc ? -1 : st.y };
  };
})();

// ================================================================
//  광원 설정 칸 · 미리보기 (맵의 "광원" 오브젝트와 맵 오브젝트의 광원이 함께 씀 — 런타임 MakerLights)
//    밝기 = k / (sqrt(d² + z²) − z), 범위 끝에서 0
//    벽 그림자: 게임(MakerLights)과 같은 GameMaker 방식 — 빛을 가리는 칸마다 대각선 두 개를 광원 반대쪽으로 길게 늘인 모양을 빛에서 지움
// ================================================================
(function () {
  const { h } = PDM;
  PDM.lightFields = function (key, p, o) {
    const { F, row } = PDM.ui;
    return [
      row(F.color(key, [...p, 'color'], { label: '빛 색', def: '#ffe9a8' }),
        F.num(key, [...p, 'k'], { label: '세기', min: 0, max: 60, step: 0.5, def: 3, rerender: true, hint: '가운데 밝은 부분의 크기' }),
        F.num(key, [...p, 'z'], { label: '부드러움 (높이)', min: 1, max: 80, step: 1, def: 10, rerender: true, hint: '클수록 넓고 은은하게' }),
        F.num(key, [...p, 'range'], { label: '범위 (칸)', min: 1, max: 16, step: 0.5, def: 4, rerender: true, hint: '여기서 빛이 0 이 됨' })),
      row(F.bool(key, [...p, 'shadow'], { label: '벽 그림자 — 벽 · 닫힌 문 · 막힌 맵 오브젝트 뒤로는 빛이 가지 않음', def: true }),
        F.bool(key, [...p, 'charShadow'], { label: '캐릭터 그림자 — 빛 가까이 있는 캐릭터 뒤로 그림자가 늘어짐', def: true })),
      row(F.num(key, [...p, 'pulse'], { label: '깜빡임 주기 (초, 0 = 일정)', min: 0, step: 0.1, def: 0 }),
        F.num(key, [...p, 'pulseMin'], { label: '깜빡일 때 가장 어두운 세기 (%)', int: true, min: 0, max: 100, def: 60 })),
      (() => { const cv = h('canvas', { width: 220, height: 110, style: { background: '#14121a', borderRadius: '6px', display: 'block' } }); const g = cv.getContext('2d');
        g.fillStyle = '#2a2833'; for (let x = 0; x < 220; x += 16) for (let y = 0; y < 110; y += 16) if (((x + y) / 16) % 2 === 0) g.fillRect(x, y, 16, 16);
        PDM.drawLightPreview(g, 110, 55, o, 16); return h('div', {}, h('div', { class: 'hint' }, '미리보기 (네모 한 칸 = 타일 한 칸)'), cv); })()];
  };
  /** 이 칸이 빛을 가리는지 — 게임의 solid && losBlocking (벽 · 장식 벽 · 책장 · 문 · 잠긴 문 · 숨겨진 문 · 바리케이드) */
  PDM.terrainBlocksLight = id => { const t = PDM.TERRAIN_BY_ID[id]; return !!(t && t.blockLight); };
  /** (cx, cy) 에 광원 o 를 한 칸 = s px 로 그림 (덧셈 합성).
   *  opt.block(x, y) → 0 = 빛이 지나감 · 1 = 벽 칸 · 2 = 막힌 맵 오브젝트 (칸 좌표, 캔버스 (0,0) = 칸 (0,0)) — 주면 그림자를 그림 */
  PDM.drawLightPreview = function (g, cx, cy, o, s, opt) {
    const range = Math.max(0.5, +o.range || 4) * 16, z = Math.max(0.5, +o.z || 10), k = Math.max(0, o.k == null ? 3 : +o.k), R = range * s / 16;
    const hx = String(o.color || '#ffe9a8').replace('#', ''), cr = parseInt(hx.slice(0, 2), 16) || 0, cg = parseInt(hx.slice(2, 4), 16) || 0, cb = parseInt(hx.slice(4, 6), 16) || 0;
    const edge = k / (Math.sqrt(range * range + z * z) - z), gr = g.createRadialGradient(cx, cy, 0, cx, cy, R);
    // 게임과 같은 1 − e^−x 로 부드럽게 · 게임과 같은 얹는 방식 (화면 × (1 + 빛) ≈ 반 세기 color-dodge, + 빛 × 0.3 덧셈)
    for (let i = 0; i <= 24; i++) { const t = Math.pow(i / 24, 1.6), d = t * range, den = Math.sqrt(d * d + z * z) - z, x = k / den - edge, v = den <= 1e-5 ? 1 : x > 0 ? 1 - Math.exp(-x) : 0;
      gr.addColorStop(t, `rgba(${cr >> 1},${cg >> 1},${cb >> 1},${v.toFixed(3)})`); }   // 빛이 없는 곳은 투명 (맵 밖을 검게 덮지 않게)
    const put = (img, x, y) => { g.save(); g.globalCompositeOperation = 'color-dodge'; img(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.6; img(); g.restore(); };

    const block = opt && opt.block && o.shadow !== false ? opt.block : null;
    if (!block) { put(() => { g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill(); }); return; }
    // 그림자: 빛을 따로 그린 뒤 그림자 볼륨 모양을 지우고 덧셈으로 얹음
    const S = Math.ceil(R) * 2 + 2, ox = cx - S / 2, oy = cy - S / 2, cv = document.createElement('canvas'); cv.width = S; cv.height = S;
    const c = cv.getContext('2d'); c.translate(-ox, -oy); c.fillStyle = gr; c.beginPath(); c.arc(cx, cy, R, 0, 7); c.fill();
    c.globalCompositeOperation = 'destination-out'; c.fillStyle = '#000';
    const far = S * 4, ext = (x, y) => { const dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy) || 1; return [x + dx / l * far, y + dy / l * far]; };
    const quad = (x1, y1, x2, y2) => { const a = ext(x1, y1), b = ext(x2, y2); c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.lineTo(b[0], b[1]); c.lineTo(a[0], a[1]); c.closePath(); c.fill(); };
    const lx = Math.floor(cx / s), ly = Math.floor(cy / s), n = Math.ceil(R / s) + 1, inside = block(lx, ly) === 1;
    const open = (x, y) => !block(x, y) || block(x, y) === 2;
    for (let y = ly - n; y <= ly + n; y++) for (let x = lx - n; x <= lx + n; x++) {
      if (x === lx && y === ly) continue;
      const b = block(x, y); if (!b) continue;
      if (b === 1 && !inside && !(open(x - 1, y) || open(x + 1, y) || open(x, y - 1) || open(x, y + 1))) continue;   // 안쪽 벽은 건너뜀
      const m = b === 2 ? s * 2 / 16 : 0, x1 = x * s + m, y1 = y * s + m, x2 = (x + 1) * s - m, y2 = (y + 1) * s - m;
      if (cx >= x1 && cx <= x2 && cy >= y1 && cy <= y2) continue;
      quad(x1, y1, x2, y2); quad(x2, y1, x1, y2);
    }
    put(() => g.drawImage(cv, ox, oy));
  };
})();
