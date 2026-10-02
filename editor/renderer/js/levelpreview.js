// ================================================================
//  levelpreview — 타일셋을 고치는 동안, 게임이 실제로 만든 층을 그 타일셋으로 그려 보여 줌
//    표본: spd-level-previews.js (게임이 만든 층의 지형 + 게임이 고른 타일 칸 번호 — 벽 이어 붙이기 · 입체 벽 · 문 · 장식까지 게임과 같음)
//    PDM.levelPreview.panel({ theme, tiles: () => 캔버스|이미지, water: () => 캔버스|이미지|null }) → { el, redraw() }
//    PDM.levelPreview.themeOfPath(경로) → { theme, kind: 'tiles'|'water' } | null
// ================================================================
(function () {
  const h = PDM.h;
  const FILES = { SEWER: ['tiles_sewers', 'water0'], PRISON: ['tiles_prison', 'water1'], CAVES: ['tiles_caves', 'water2'], CITY: ['tiles_city', 'water3'], HALLS: ['tiles_halls', 'water4'] };
  const WATER_T = 29;   // Terrain.WATER
  function themeOfPath(p) {
    const n = String(p || '').replace(/\\/g, '/').split('/').pop().replace(/\.png$/i, '');
    for (const [t, [ti, wa]] of Object.entries(FILES)) { if (n === ti) return { theme: t, kind: 'tiles' }; if (n === wa) return { theme: t, kind: 'water' }; }
    return null;
  }
  /** 표본 하나를 캔버스에 (s = 한 칸 px) */
  function draw(cv, lv, tiles, water, s) {
    cv.width = lv.w * s; cv.height = lv.h * s;
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height);
    if (!tiles) return;
    const cell = (v, x, y) => { if (v >= 0) g.drawImage(tiles, (v % 16) * 16, Math.floor(v / 16) * 16, 16, 16, x * s, y * s, s, s); };
    for (let i = 0; i < lv.map.length; i++) {
      const x = i % lv.w, y = (i / lv.w) | 0;
      if (lv.map[i] === WATER_T) {
        if (water && water.width) g.drawImage(water, (x * 16) % Math.max(16, water.width - 15), (y * 16) % Math.max(16, water.height - 15), 16, 16, x * s, y * s, s, s);
        else { g.fillStyle = '#2d5f86'; g.fillRect(x * s, y * s, s, s); }
      }
      if (lv.tiles[i] !== lv.water) cell(lv.tiles[i], x, y);
    }
    for (let i = 0; i < lv.map.length; i++) cell(lv.walls[i], i % lv.w, (i / lv.w) | 0);
  }
  function panel(o) {
    const all = PDM.SPD_LEVEL_PREVIEWS || {};
    const list = Object.entries(all).flatMap(([t, a]) => a.map((lv, i) => ({ t, lv, label: `${(PDM.THEMES[t] || {}).name || t} — 깊이 ${lv.depth} (${lv.w}×${lv.h})` })));
    let cur = Math.max(0, list.findIndex(x => x.t === o.theme)), scale = 8, raf = 0;
    const cv = h('canvas', { style: { imageRendering: 'pixelated', display: 'block' } });
    const sel = h('select', {}, list.map((x, i) => h('option', { value: i, selected: i === cur }, x.label)));
    const zoom = h('input', { type: 'range', min: 4, max: 32, step: 2, value: scale, style: { width: '110px' }, title: '확대' });
    const box = h('div', { style: { overflow: 'auto', flex: '1', minHeight: '0', background: '#000', borderRadius: '6px', border: '1px solid var(--line)' } }, cv);
    const now = () => { raf = 0; const x = list[cur]; if (!x) return; try { draw(cv, x.lv, o.tiles(), o.water ? o.water() : null, scale); } catch (e) { /* 그림이 아직 없음 */ } };
    const redraw = () => { if (!raf) raf = requestAnimationFrame(now); };
    sel.onchange = () => { cur = +sel.value; redraw(); };
    zoom.oninput = () => { scale = +zoom.value; redraw(); };
    // 끌어서 보기 이동
    let pan = null;
    box.addEventListener('mousedown', e => { pan = { x: e.clientX, y: e.clientY, l: box.scrollLeft, t: box.scrollTop }; box.style.cursor = 'grabbing'; e.preventDefault(); });
    addEventListener('mousemove', e => { if (pan) { box.scrollLeft = pan.l - (e.clientX - pan.x); box.scrollTop = pan.t - (e.clientY - pan.y); } });
    addEventListener('mouseup', () => { pan = null; box.style.cursor = 'grab'; });
    box.style.cursor = 'grab';
    const el = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', width: 'min(38vw, 520px)', minWidth: '260px', height: '70vh' } },
      h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' } }, h('b', {}, '실시간 미리보기'), sel, zoom),
      list.length ? box : h('div', { class: 'empty' }, '층 표본이 없습니다'),
      h('div', { class: 'hint' }, '게임이 실제로 만든 층을 지금 고치는 타일셋으로 그립니다 (벽 이어 붙이기 · 입체 벽 · 문 · 장식 포함). 그리는 즉시 바뀌고, 끌어서 이동합니다. 층 구조는 표본이라 게임에서는 매번 다르게 만들어집니다.'));
    redraw();
    return { el, redraw };
  }
  PDM.levelPreview = { panel, draw, themeOfPath };
})();
