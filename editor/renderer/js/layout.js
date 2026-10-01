// ================================================================
//  UI 레이아웃 편집 — 미리보기 위에 영역(사각형)을 그리고 · 옮기고 · 크기를 바꾸는 공용 부품
//    PDM.layoutEditor({ stage, regions, onChange, tools })
//      stage   : 미리보기 요소 (position: relative) — 좌표는 0~1 비율
//      regions : [{ id, label, color, rect: {x,y,w,h}, resize: 'both'|'w'|'none', minW, minH }]
//      onChange(id, rect) : 옮기기·크기 바꾸기·새로 그리기가 끝났을 때 (한 번)
//      tools   : 그리기 도구 목록 [{ id, label }] — 도구를 고르고 미리보기 위를 끌면 그 영역을 새로 그림
//    반환: { el(도구 막대), destroy() }
// ================================================================
PDM.layoutEditor = function (opt) {
  const { h } = PDM;
  const stage = opt.stage;
  const layer = h('div', { class: 'lay-layer' });
  stage.append(layer);
  let drawTool = null;
  const snap = v => Math.round(v * 400) / 400;          // 0.25% 단위
  const clamp01 = v => Math.max(0, Math.min(1, v));

  function box(r) {
    const rect = Object.assign({ x: 0, y: 0, w: 0.1, h: 0.1 }, r.rect);
    const el = h('div', { class: 'lay-box' + (r.resize === 'none' ? ' fixed' : ''), title: r.label + ' — 끌어서 옮기기' + (r.resize !== 'none' ? ' · 모서리로 크기' : ''), style: { borderColor: r.color, '--c': r.color } },
      h('span', { class: 'lay-tag', style: { background: r.color } }, r.label));
    const place = () => Object.assign(el.style, { left: rect.x * 100 + '%', top: rect.y * 100 + '%', width: rect.w * 100 + '%', height: rect.h * 100 + '%' });
    place();
    const drag = (e, mode) => {
      e.preventDefault(); e.stopPropagation();
      const b = stage.getBoundingClientRect(), sx = e.clientX, sy = e.clientY, r0 = Object.assign({}, rect);
      el.classList.add('on');
      const move = ev => {
        const dx = (ev.clientX - sx) / b.width, dy = (ev.clientY - sy) / b.height;
        if (mode === 'move') { rect.x = snap(clamp01(Math.min(r0.x + dx, 1 - r0.w))); rect.y = snap(clamp01(Math.min(r0.y + dy, 1 - r0.h))); }
        else {
          rect.w = snap(Math.max(r.minW || 0.02, Math.min(1 - r0.x, r0.w + dx)));
          if (r.resize !== 'w') rect.h = snap(Math.max(r.minH || 0.02, Math.min(1 - r0.y, r0.h + dy)));
        }
        place();
      };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); el.classList.remove('on'); opt.onChange(r.id, Object.assign({}, rect)); };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    };
    el.addEventListener('pointerdown', e => { if (!drawTool) drag(e, 'move'); });
    if (r.resize !== 'none') {
      const hd = h('div', { class: 'lay-handle', style: { background: r.color } });
      hd.addEventListener('pointerdown', e => drag(e, 'size'));
      el.append(hd);
    }
    return el;
  }
  (opt.regions || []).forEach(r => layer.append(box(r)));

  // 그리기: 도구를 고른 뒤 빈 곳을 끌기
  const onDown = e => {
    if (!drawTool) return;
    e.preventDefault(); e.stopPropagation();
    const b = stage.getBoundingClientRect();
    const x0 = clamp01((e.clientX - b.left) / b.width), y0 = clamp01((e.clientY - b.top) / b.height);
    const ghost = h('div', { class: 'lay-box drawing' }); layer.append(ghost);
    let rect = { x: x0, y: y0, w: 0, h: 0 };
    const move = ev => {
      const x1 = clamp01((ev.clientX - b.left) / b.width), y1 = clamp01((ev.clientY - b.top) / b.height);
      rect = { x: snap(Math.min(x0, x1)), y: snap(Math.min(y0, y1)), w: snap(Math.abs(x1 - x0)), h: snap(Math.abs(y1 - y0)) };
      Object.assign(ghost.style, { left: rect.x * 100 + '%', top: rect.y * 100 + '%', width: rect.w * 100 + '%', height: rect.h * 100 + '%' });
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); ghost.remove();
      const t = drawTool; setTool(null);
      if (rect.w > 0.01 && rect.h > 0.01) opt.onChange(t, rect);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  layer.addEventListener('pointerdown', onDown);
  const toolBtns = {};
  function setTool(id) {
    drawTool = id;
    layer.classList.toggle('drawing', !!id);
    Object.entries(toolBtns).forEach(([k, b]) => b.classList.toggle('on', k === id));
  }
  const bar = h('div', { class: 'lay-tools' },
    (opt.tools || []).length ? h('span', { class: 'hint' }, '영역 그리기:') : null,
    ...(opt.tools || []).map(t => (toolBtns[t.id] = h('button', { class: 'btn xs', title: '누른 뒤 미리보기 위를 끌어서 그리기', onclick: e => { e.preventDefault(); setTool(drawTool === t.id ? null : t.id); } }, t.label))));
  return { el: bar, layer, destroy() { layer.remove(); } };
};
