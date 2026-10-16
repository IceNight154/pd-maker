// ================================================================
//  조합 타일 — 여러 스프라이트(레이어 · 오프셋 · 순서 · 렌더 옵션) + 광원 · 이펙트 + 오브젝트(함정 등)를 묶은 재사용 프리셋
//    데이터: maps/tilecombos.json { legacy: [ { visual, under: [칸] } ], list: [ 조합 ] }   (런타임 MakerCombos · MakerTileUnderlay)
//    조합 { id, name,
//      sprites: [ { src: tileset | image, tile, image, x, y, size, layer, ox, oy (px, 한 칸 = 16), alpha (0~1), blend: normal | add } ]   배열 순서 = 같은 레이어 안의 그리는 순서
//      light: { on, color, k, z, range, ox, oy, shadow, charShadow, pulse, pulseMin }   실제 점광원 (MakerLights)
//      effect: effects.json id · objects: [ { type: trap | prop, ref, hidden } ] (오브젝트 시스템이 만듦) · terrain: -2 (그대로) | 지형 번호
//      autogen: { enabled, where, terrains, chance, max, spacing, themes, handmade } }
//    쓰는 곳: 맵 편집기 오브젝트 "조합 타일"(ref = 조합 id) · 자동 생성. 조합을 고치면 새로 만드는 층부터 반영 (이미 만든 세이브는 그대로)
//    legacy: 분리된(투명 배경) 타일셋에서 바닥을 지운 칸의 밑그림 대응표 — 기본값 PDM.TILE_LEGACY_DEFAULT, 여기서 바꾼 것만 저장
// ================================================================
(function () {
  const { h, store, toast } = PDM;
  const K = 'tilecombos';
  const data = () => store.get(K) || {};
  const list = () => data().list || [];
  const num = (v, d) => (isFinite(+v) && v !== '' && v !== null && v !== undefined ? +v : d);

  const WHERE = { wallFace: '벽 앞면 (아래가 바닥인 벽)', wall: '벽 (옆에 길이 있는 벽)', floor: '바닥', floorNearWall: '벽 바로 아래 바닥', grass: '풀 · 높은 풀', water: '물', terrain: '지형 지정' };
  const GLOW = 'assets/tiles/combo_glow.png';
  /** 발광 스프라이트용 기본 그림 (16×16 둥근 빛) — 없으면 만듦 */
  async function glowImage() {
    try { if (await pdm.exists(store.abs(GLOW))) return GLOW; } catch (_) { /* 만들기 */ }
    const cv = h('canvas', { width: 16, height: 16 }), g = cv.getContext('2d');
    const gr = g.createRadialGradient(8, 8, 0, 8, 8, 8); gr.addColorStop(0, 'rgba(255,220,150,1)'); gr.addColorStop(0.45, 'rgba(255,170,80,.55)'); gr.addColorStop(1, 'rgba(255,140,40,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 16, 16);
    await pdm.writeDataURL(store.abs(GLOW), cv.toDataURL('image/png')); PDM.assets.invalidate(GLOW);
    return GLOW;
  }
  const AUTO_OFF = { enabled: false, where: 'floor', terrains: [], chance: 10, max: 0, spacing: 2, themes: [], handmade: false };
  const PRESETS = {
    blank: '빈 조합',
    wall_light: '벽면 광원 장식 (벽 + 벽 장식 + 광원)',
    floor_trap: '바닥 장식 + 함정',
    grass_glow: '빛나는 풀'
  };
  function make(id, preset) {
    const base = { id, name: PRESETS[preset] || '새 조합 타일', sprites: [], light: { on: false }, effect: '', objects: [], terrain: -2, autogen: Object.assign({}, AUTO_OFF) };
    if (preset === 'wall_light') Object.assign(base, { name: '벽면 광원 장식',
      sprites: [{ src: 'tileset', tile: 84, layer: 'walldeco', ox: 0, oy: 0, alpha: 1, blend: 'normal' }, { src: 'image', image: GLOW, x: 0, y: 0, size: 16, layer: 'light', ox: 0, oy: 2, alpha: 0.9, blend: 'add' }],
      light: { on: true, color: '#ffb060', k: 4, z: 10, range: 4, ox: 0, oy: 6, shadow: true, charShadow: true, pulse: 1.6, pulseMin: 75 },
      autogen: Object.assign({}, AUTO_OFF, { enabled: true, where: 'wallFace', chance: 30, spacing: 3 }) });
    if (preset === 'floor_trap') Object.assign(base, { name: '바닥 장식 + 함정',
      sprites: [{ src: 'tileset', tile: 1, layer: 'base', ox: 0, oy: 0, alpha: 1, blend: 'normal' }],
      objects: [{ type: 'trap', ref: 'PoisonDartTrap', hidden: true }],
      autogen: Object.assign({}, AUTO_OFF, { enabled: false, where: 'floor', chance: 2, max: 2, spacing: 5 }) });
    if (preset === 'grass_glow') Object.assign(base, { name: '빛나는 풀',
      sprites: [{ src: 'tileset', tile: 2, layer: 'grass', ox: 0, oy: 0, alpha: 1, blend: 'normal' }, { src: 'image', image: GLOW, x: 0, y: 0, size: 16, layer: 'light', ox: 0, oy: 0, alpha: 0.6, blend: 'add' }],
      light: { on: true, color: '#8affc8', k: 1.5, z: 10, range: 2, ox: 0, oy: 0, shadow: false, charShadow: false },
      autogen: Object.assign({}, AUTO_OFF, { enabled: false, where: 'grass', chance: 8, spacing: 3 }) });
    if (base.sprites.some(s => s.image === GLOW)) glowImage().then(() => PDM.tabs.refresh(K)).catch(() => { });
    return base;
  }
  const ops = PDM.listOps({ K, label: '조합 타일', title: '조합 타일', icon: '🧩', prefix: 'combo', make, presets: PRESETS, objType: 'combo', itemIcon: c => (c.autogen || {}).enabled ? '✦' : '' });

  // ---------------- 그림 (편집기 미리보기 · 맵 편집기 공용)
  const themes = () => [...Object.entries(PDM.THEMES).map(([k, t]) => [k, t.name]), ...(((store.get('world') || {}).customThemes) || []).map(c => ['custom:' + c.id, `${c.name || c.id} (사용자 테마)`])];
  const themeKey = t => String(t || 'SEWER').replace('custom:', '');
  const layerDefs = () => PDM.tileLayers ? PDM.tileLayers() : PDM.TILE_LAYERS_DEFAULT;
  /** 그리는 순서: 레이어 순서(캐릭터 위 레이어는 뒤) → 배열 순서. 런타임 MakerUserTiles 와 같음 */
  function drawOrder(c) {
    const L = layerDefs(), ord = id => { const i = L.findIndex(l => l.id === id); return i < 0 ? 1000 : i; };
    const above = id => (L.find(l => l.id === id) || {}).depth === 'above';
    return (c.sprites || []).map((s, i) => ({ s, i })).sort((a, b) => (above(a.s.layer) - above(b.s.layer)) || (ord(a.s.layer) - ord(b.s.layer)) || (a.i - b.i));
  }
  const isAdd = s => s.blend === 'add' || (layerDefs().find(l => l.id === s.layer) || {}).blend === 'add';
  const visibleLayer = s => (layerDefs().find(l => l.id === s.layer) || {}).visible !== false;
  /** 스프라이트 그림 불러오기 → { img, sx, sy, sz } */
  async function spriteSrc(s, rawTiles) {
    if (s.src === 'image') { const img = s.image ? await PDM.assets.load(s.image) : null; if (!img) return null; const z = Math.max(1, num(s.size, 16)); return { img, sx: num(s.x, 0) * z, sy: num(s.y, 0) * z, sz: z }; }
    if (!rawTiles) return null;
    const n = Math.max(1, Math.round(rawTiles.width / 16)), t = num(s.tile, 0);
    return { img: rawTiles, sx: (t % 16) * n, sy: Math.floor(t / 16) * n, sz: n };
  }
  /** 조합을 칸 (x, y, 크기 s) 에 그림. hide = 숨긴 스프라이트 번호 Set (편집 중 끄기) */
  async function drawCombo(g, c, x, y, s, rawTiles, opt = {}) {
    const items = drawOrder(c).filter(({ s: sp, i }) => !(opt.hide && opt.hide.has(i)) && visibleLayer(sp));
    const srcs = await Promise.all(items.map(({ s: sp }) => spriteSrc(sp, rawTiles)));
    g.save(); g.imageSmoothingEnabled = false;
    items.forEach(({ s: sp, i }, k) => {
      const r = srcs[k]; if (!r) return;
      g.globalAlpha = Math.max(0, Math.min(1, num(sp.alpha, 1)));
      g.globalCompositeOperation = isAdd(sp) ? 'lighter' : 'source-over';
      g.drawImage(r.img, r.sx, r.sy, r.sz, r.sz, x + num(sp.ox, 0) * s / 16, y + num(sp.oy, 0) * s / 16, s, s);
      if (opt.sel === i) { g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.strokeStyle = '#ffe28a'; g.setLineDash([3, 2]); g.lineWidth = 1; g.strokeRect(x + num(sp.ox, 0) * s / 16 + .5, y + num(sp.oy, 0) * s / 16 + .5, s - 1, s - 1); g.setLineDash([]); }
    });
    g.restore();
  }
  // 맵 편집기용: 조합 id → 그림 캐시 (칸 3×3 캔버스, 가운데가 그 칸 — 오프셋으로 칸 밖에 나간 것도 보임)
  const thumbs = new Map();
  function thumb(id, rawTiles, redraw) {
    const c = list().find(x => x.id === id); if (!c) return null;
    const key = id + '|' + JSON.stringify(c.sprites || []) + '|' + JSON.stringify(layerDefs()), hit = thumbs.get(id);
    if (hit && hit.key === key && hit.tiles === rawTiles) return hit.cv;
    const cv = h('canvas', { width: 48, height: 48 });
    thumbs.set(id, { key, tiles: rawTiles, cv });
    drawCombo(cv.getContext('2d'), c, 16, 16, 16, rawTiles).then(() => redraw && redraw());
    return cv;
  }
  /** 쓰는 곳: 맵 · 방에 놓인 조합 오브젝트 + 자동 생성 */
  function usageOf(c) {
    const maps = [];
    [...store.all('node').map(f => ['node', f]), ...store.all('room').map(r => ['room', r])].forEach(([k, f]) => {
      const n = (f.objects || []).filter(o => o.type === 'combo' && o.ref === c.id).length;
      if (n) maps.push({ key: `${k}:${f.id}`, label: `${k === 'room' ? '방 ' + (f.name || f.id) : (PDM.World.fullName ? PDM.World.fullName(f.id) : f.id)} ${n}곳` });
    });
    return { maps, auto: !!(c.autogen || {}).enabled };
  }
  PDM.combos = { K, list, make, ops, drawCombo, thumb, usageOf, glowImage };

  // ---------------- 편집 화면
  PDM.registerEditor({
    id: K, icon: '🧩', title: () => '조합 타일',
    match: k => k === K,
    tree: () => store.isOpen ? [ops.treeNode(12)] : [],
    render(key, ctx) {
      const { F, section, row, field } = PDM.ui;
      const st = ctx.state = ctx.state || { theme: '', sel: -1, replace: -1, hide: new Set(), ctxScene: '' };
      if (!(PDM.extensions && PDM.extensions.on(K))) return h('div', { class: 'editor' }, h('h2', {}, '🧩 조합 타일'),
        h('p', { style: { margin: '8px 0 12px' } }, '확장 기능 "조합 타일 · 분리 타일셋 밑그림"이 꺼져 있습니다. 꺼져 있으면 게임에서도 조합 타일 · 자동 생성 · 밑그림 · "광원 · 효과" 레이어를 쓰지 않습니다 (데이터는 그대로 남음).'),
        h('button', { class: 'btn pri', onclick: () => { store.edit('project', '확장 기능 켜기: 조합 타일', p => { p.extensions = Object.assign({}, p.extensions || {}, { [K]: true }); }); PDM.app.redraw(); PDM.tabs.refresh(); } }, '확장 기능 켜기'),
        h('button', { class: 'btn ml-3', onclick: () => PDM.extensions.show() }, '확장 기능 창 열기'));
      const all = list();
      ops.take(st);
      if (!all.some(x => x.id === st.id)) st.id = (all[0] || {}).id;
      const idx = all.findIndex(x => x.id === st.id), c = all[idx];
      if (!st.theme) { const ct = ((store.get('world') || {}).customThemes || [])[0]; st.theme = ct ? 'custom:' + ct.id : 'SEWER'; }
      const P = ['list', idx];
      const edit = (label, fn) => store.edit(K, label, r => fn(r.list[idx]));
      const intro = h('p', { class: 'hint' }, '여러 스프라이트를 레이어 · 위치 · 순서 · 렌더 옵션과 함께 묶고, 광원 · 이펙트 · 오브젝트(함정 등)를 붙인 재사용 프리셋입니다. ' +
        '맵 편집기의 오브젝트 "조합 타일"로 직접 놓거나, 아래 "자동 생성"에 등록하면 층을 만들 때 조건에 맞는 칸에 자동으로 놓입니다. 실행 취소는 Ctrl+Z.');
      const head = h('div', { class: 'hstack wrap mb-4' }, all.map(x => { const u = usageOf(x), used = u.auto || u.maps.length;
        return h('button', { class: 'btn sm' + (x.id === st.id ? ' pri' : ''), title: used ? `쓰는 중 — ${[u.auto ? '자동 생성' : '', ...u.maps.map(m => m.label)].filter(Boolean).join(' · ')}` : '아무 데서도 쓰지 않음', onclick: () => { st.id = x.id; st.sel = -1; st.replace = -1; st.hide = new Set(); ctx.refresh(); } },
          h('span', { style: { color: used ? '#5fd6b4' : '#7a7590', marginRight: '4px' } }, used ? '●' : '○'), x.name || x.id); }));
      const legacy = legacySection(ctx, st);
      if (!c) return h('div', { class: 'editor' }, h('h2', {}, '🧩 조합 타일'), intro, ops.bar(null),
        h('div', { class: 'flex gap-3 wrap mb-4' }, Object.entries(PRESETS).map(([k, v]) => h('button', { class: 'btn', onclick: () => ops.add(k) }, '+ ' + v))), legacy);

      // ---- 미리보기 (주변 칸과 함께)
      const Z = 4, CW = 5, CH = 4, cv = h('canvas', { width: CW * 16 * Z, height: CH * 16 * Z, style: { imageRendering: 'pixelated', border: '1px solid var(--line)', borderRadius: '6px', display: 'block', background: '#14121a' } });
      const where = st.ctxScene || ((c.autogen || {}).where) || 'floor';
      const scene = (x, y) => {   // 미리보기 지형 (조합 칸 = 가운데 (2, 1))
        if (where === 'wallFace' || where === 'wall') return y <= 1 ? 4 : 1;
        if (where === 'floorNearWall') return y === 0 ? 4 : 1;
        if (where === 'water') return y >= 1 && x >= 1 && x <= 3 ? 29 : 1;
        if (where === 'grass') return y >= 1 && x >= 1 && x <= 3 ? 2 : 1;
        if (where === 'terrain') { const t = ((c.autogen || {}).terrains || [])[0]; return x === 2 && y === 1 && t != null ? +t : y === 0 ? 4 : 1; }
        return y === 0 ? 4 : 1;
      };
      (async () => {
        const tiles = await PDM.assets.themeTiles(themeKey(st.theme)).catch(() => null), raw = await PDM.assets.themeTiles(themeKey(st.theme), true).catch(() => null);
        const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.clearRect(0, 0, cv.width, cv.height);
        const s = 16 * Z;
        for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) PDM.assets.drawTerrain(g, tiles, x === 2 && y === 1 && c.terrain >= 0 ? c.terrain : scene(x, y), x * s, y * s, s);
        await drawCombo(g, c, 2 * s, 1 * s, s, raw, { hide: st.hide, sel: st.sel });
        const lt = c.light || {};
        if (lt.on) PDM.drawLightPreview(g, 2 * s + s / 2 + num(lt.ox, 0) * Z, 1 * s + s / 2 + num(lt.oy, 0) * Z, Object.assign({ color: '#ffe9a8', k: 3, z: 10, range: 4 }, lt), s);
        (c.objects || []).forEach(o => { if (o.type === 'trap') { g.fillStyle = 'rgba(208,80,122,.85)'; g.font = `bold ${s * .3}px sans-serif`; g.textAlign = 'right'; g.textBaseline = 'bottom'; g.fillText(o.hidden ? '함정?' : '함정', 3 * s - 3, 2 * s - 2); } });
        g.save(); g.setLineDash([5, 4]); g.strokeStyle = 'rgba(255,255,255,.55)'; g.strokeRect(2 * s + .5, s + .5, s - 1, s - 1); g.restore();
      })();

      // ---- 팔레트: 타일셋 칸 · 사용자 타일 · 그림 파일
      const addOrReplace = (sp, label) => {
        if (st.replace >= 0 && (c.sprites || [])[st.replace]) { const i = st.replace; st.replace = -1; st.sel = i;
          edit('스프라이트 교체', x => { const o = x.sprites[i]; ['src', 'tile', 'image', 'x', 'y', 'size'].forEach(k => delete o[k]); Object.assign(o, sp); }); return; }
        const defLayer = st.layer || ((c.autogen || {}).where === 'wallFace' || (c.autogen || {}).where === 'wall' ? 'walldeco' : 'base');
        st.sel = (c.sprites || []).length;
        edit(label || '스프라이트 추가', x => { x.sprites = x.sprites || []; x.sprites.push(Object.assign({ layer: defLayer, ox: 0, oy: 0, alpha: 1, blend: 'normal' }, sp)); });
      };
      const pal = h('canvas', { style: { imageRendering: 'pixelated', cursor: 'pointer', border: '1px solid var(--line)', borderRadius: '4px', maxWidth: '100%' } });
      PDM.assets.themeTiles(themeKey(st.theme), true).then(raw => {
        if (!raw) return; const n = Math.max(1, Math.round(raw.width / 16)), rows = Math.ceil(raw.height / n), z = 2;
        pal.width = 16 * 16 * z; pal.height = rows * 16 * z;
        const g = pal.getContext('2d'); g.imageSmoothingEnabled = false;
        for (let y = 0; y < pal.height; y += 16) for (let x = 0; x < pal.width; x += 16) { g.fillStyle = ((x + y) / 16) % 2 ? '#2a2833' : '#201e28'; g.fillRect(x, y, 16, 16); }
        g.drawImage(raw, 0, 0, 16 * n, rows * n, 0, 0, pal.width, pal.height);
        (c.sprites || []).forEach(sp => { if (sp.src !== 'image') { const t = num(sp.tile, 0); g.strokeStyle = '#ffe28a'; g.lineWidth = 2; g.strokeRect((t % 16) * 16 * z + 1, Math.floor(t / 16) * 16 * z + 1, 16 * z - 2, 16 * z - 2); } });
        pal.onclick = e => { const r = pal.getBoundingClientRect(), k = pal.width / r.width; const tx = Math.floor((e.clientX - r.left) * k / (16 * z)), ty = Math.floor((e.clientY - r.top) * k / (16 * z)); addOrReplace({ src: 'tileset', tile: ty * 16 + tx }); };
        pal.onmousemove = e => { const r = pal.getBoundingClientRect(), k = pal.width / r.width; const tx = Math.floor((e.clientX - r.left) * k / (16 * z)), ty = Math.floor((e.clientY - r.top) * k / (16 * z)); pal.title = `타일셋 칸 ${ty * 16 + tx} — 누르면 ${st.replace >= 0 ? '스프라이트 교체' : '스프라이트로 추가'}`; };
      });
      const uts = (PDM.userTiles ? PDM.userTiles() : []).filter(t => t.image && !t.flow);
      const utPal = h('div', { class: 'pal-grid mt-2' }, uts.map(t => { const cc = h('canvas', { width: 16, height: 16, class: 'pal-t', title: (t.name || t.id) + ' — 누르면 추가/교체' }); PDM.drawUserTile(cc.getContext('2d'), t, 0, 0, 16);
        cc.onclick = () => addOrReplace({ src: 'image', image: t.image, x: t.x || 0, y: t.y || 0, size: t.size || 16 }); return cc; }));
      const palBox = h('div', {},
        h('div', { class: 'hstack wrap mb-2' }, field('타일셋 (미리보기 · 팔레트)', (() => { const s = h('select', {}, themes().map(([v, n]) => h('option', { value: v, selected: v === st.theme }, n))); s.onchange = () => { st.theme = s.value; ctx.refresh(); }; return s; })()),
          field('새 스프라이트 레이어', (() => { const s = h('select', {}, h('option', { value: '' }, '(자동: 벽이면 벽 장식, 아니면 기본)'), layerDefs().map(l => h('option', { value: l.id, selected: st.layer === l.id }, l.name || l.id))); s.onchange = () => { st.layer = s.value; }; return s; })())),
        st.replace >= 0 ? h('div', { class: 'hint c-gold mb-2' }, `스프라이트 ${st.replace + 1} 을(를) 바꿀 그림을 고르세요 (타일셋 칸 · 사용자 타일 · 그림 파일). `, h('button', { class: 'btn xs', onclick: () => { st.replace = -1; ctx.refresh(); } }, '교체 취소')) : null,
        h('div', { class: 'hint mb-2' }, '타일셋 칸은 그 층의 테마 타일셋을 따라갑니다 (테마가 바뀌면 같은 번호의 그림). 테마와 상관없이 같은 그림을 쓰려면 사용자 타일이나 그림 파일을 쓰세요.'),
        pal, uts.length ? h('div', { class: 'fl mt-3' }, '사용자 타일') : null, uts.length ? utPal : null,
        h('div', { class: 'flex gap-2 wrap mt-3' },
          h('button', { class: 'btn sm', onclick: async () => { const r = await PDM.ui.pickImage('tiles'); if (r) addOrReplace({ src: 'image', image: r, x: 0, y: 0, size: 16 }, '스프라이트 추가 (그림 파일)'); } }, '그림 파일에서…'),
          h('button', { class: 'btn sm', title: '둥근 빛 그림(assets/tiles/combo_glow.png)을 발광 레이어에 추가', onclick: async () => { const r = await glowImage(); addOrReplace({ src: 'image', image: r, x: 0, y: 0, size: 16, layer: 'light', blend: 'add', alpha: 0.85 }, '발광 스프라이트 추가'); } }, '+ 발광 (빛무리)')));

      // ---- 스프라이트 목록
      const sprites = (c.sprites || []).map((sp, i) => {
        const sp_ = ['list', idx, 'sprites', i];
        const tc = h('canvas', { width: 32, height: 32, style: { imageRendering: 'pixelated', background: '#201e28', borderRadius: '3px', flex: 'none' } });
        PDM.assets.themeTiles(themeKey(st.theme), true).then(raw => spriteSrc(sp, raw)).then(r => { if (!r) return; const g = tc.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(r.img, r.sx, r.sy, r.sz, r.sz, 0, 0, 32, 32); });
        const vis = h('input', { type: 'checkbox', checked: !st.hide.has(i), title: '미리보기에서 보이기 (저장되지 않음)', onchange: () => { if (vis.checked) st.hide.delete(i); else st.hide.add(i); ctx.refresh(); } });
        const n = sp.src === 'image' ? `그림 ${sp.image || '(없음)'}${sp.size && sp.size !== 16 ? ` · ${sp.size}px` : ''} [${sp.x || 0}, ${sp.y || 0}]` : `타일셋 칸 ${sp.tile ?? 0}`;
        return h('div', { style: { border: '1px solid ' + (st.sel === i ? 'var(--acc, #a58bff)' : 'var(--line)'), borderRadius: '8px', padding: '6px 8px', marginBottom: '6px' }, onclick: e => { if (e.target.closest('input,select,button')) return; st.sel = st.sel === i ? -1 : i; ctx.refresh(); } },
          h('div', { class: 'hstack gap-3' }, vis, tc, h('b', {}, `${i + 1}.`), h('span', { class: 'hint grow' }, n),
            h('button', { class: 'ib', title: '먼저 그림 (같은 레이어 안에서 아래로)', disabled: i === 0, onclick: () => edit('스프라이트 순서', x => { [x.sprites[i - 1], x.sprites[i]] = [x.sprites[i], x.sprites[i - 1]]; }) }, '↑'),
            h('button', { class: 'ib', title: '나중에 그림 (같은 레이어 안에서 위로)', disabled: i === c.sprites.length - 1, onclick: () => edit('스프라이트 순서', x => { [x.sprites[i + 1], x.sprites[i]] = [x.sprites[i], x.sprites[i + 1]]; }) }, '↓'),
            h('button', { class: 'btn xs' + (st.replace === i ? ' pri' : ''), title: '그림만 바꾸기 (레이어 · 위치 · 옵션은 그대로)', onclick: () => { st.replace = st.replace === i ? -1 : i; ctx.refresh(); } }, '교체'),
            h('button', { class: 'ib', title: '복제', onclick: () => edit('스프라이트 복제', x => { x.sprites.splice(i + 1, 0, PDM.clone(x.sprites[i])); }) }, '⧉'),
            h('button', { class: 'ib', title: '빼기', onclick: () => { st.sel = -1; st.hide = new Set(); edit('스프라이트 삭제', x => { x.sprites.splice(i, 1); }); } }, '✕')),
          row(F.select(K, [...sp_, 'layer'], layerDefs().map(l => [l.id, `${l.name || l.id}${l.depth === 'above' ? ' (캐릭터 위)' : ''}${l.blend === 'add' ? ' · 발광' : ''}`]), { label: '레이어' }),
            F.num(K, [...sp_, 'ox'], { label: '→ 오프셋 (px)', int: true, min: -48, max: 48, def: 0, rerender: true }),
            F.num(K, [...sp_, 'oy'], { label: '↓ 오프셋 (px)', int: true, min: -48, max: 48, def: 0, rerender: true }),
            F.num(K, [...sp_, 'alpha'], { label: '불투명도 (0~1)', min: 0, max: 1, step: 0.05, def: 1, rerender: true }),
            F.select(K, [...sp_, 'blend'], { normal: '보통', add: '더하기 (발광)' }, { label: '겹치는 방식' })),
          sp.src === 'image' ? row(F.text(K, [...sp_, 'image'], { label: '그림 파일', rerender: true }), F.num(K, [...sp_, 'x'], { label: '칸 x', int: true, min: 0, def: 0, rerender: true }), F.num(K, [...sp_, 'y'], { label: '칸 y', int: true, min: 0, def: 0, rerender: true }), F.num(K, [...sp_, 'size'], { label: '칸 크기 (px)', int: true, min: 1, max: 256, def: 16, rerender: true }))
            : row(F.num(K, [...sp_, 'tile'], { label: '타일셋 칸 번호', int: true, min: 0, max: 255, def: 0, rerender: true })));
      });

      // ---- 광원 · 이펙트 · 지형 · 오브젝트
      const lt = c.light || {};
      const lightBox = h('div', {},
        F.bool(K, [...P, 'light', 'on'], { label: '실제 광원 (게임 화면에 빛 · 그림자 — 광원 시스템)', rerender: true }),
        lt.on ? h('div', {}, row(F.num(K, [...P, 'light', 'ox'], { label: '광원 → (px)', int: true, min: -48, max: 48, def: 0, rerender: true }), F.num(K, [...P, 'light', 'oy'], { label: '광원 ↓ (px)', int: true, min: -48, max: 48, def: 0, rerender: true })),
          ...PDM.lightFields(K, [...P, 'light'], lt)) : null,
        h('div', { class: 'hint' }, '빛나 보이는 그림(발광 스프라이트 · "광원 · 효과" 레이어)과 실제 광원은 따로입니다: 그림은 빛무리 모양만, 실제 광원은 주변 바닥 · 캐릭터를 밝히고 그림자를 만듭니다. 둘을 같이 쓰면 "벽면 광원 장식"처럼 보입니다.'));
      const terrOpts = [[-2, '(지형 그대로 둠)'], ...PDM.TERRAIN.filter(t => t.id >= 0).map(t => [t.id, `${PDM.terrainName ? PDM.terrainName(t) : t.name} [${t.id}]`])];
      const terrSel = h('select', {}, terrOpts.map(([v, n]) => h('option', { value: v, selected: num(c.terrain, -2) === v }, n)));
      terrSel.onchange = () => edit('조합 지형', x => { x.terrain = +terrSel.value; });
      const objs = (c.objects || []).map((o, oi) => {
        const op = [...P, 'objects', oi];
        return h('div', { class: 'hstack gap-2 wrap mb-2' },
          F.select(K, [...op, 'type'], { trap: '함정', prop: '맵 오브젝트' }, { rerender: true }),
          o.type === 'prop' ? F.ref(K, [...op, 'ref'], 'prop', { empty: '(고르기)' }) : F.select(K, [...op, 'ref'], PDM.TRAPS.map(t => [t.id, t.name])),
          o.type === 'trap' ? F.bool(K, [...op, 'hidden'], { label: '숨김' }) : null,
          h('button', { class: 'btn xs', onclick: () => edit('조합 오브젝트 삭제', x => { x.objects.splice(oi, 1); }) }, '×'));
      });
      const objBox = h('div', {}, ...objs,
        h('div', { class: 'flex gap-2' }, h('button', { class: 'btn xs add', onclick: () => edit('조합 오브젝트 추가', x => { x.objects = x.objects || []; x.objects.push({ type: 'trap', ref: 'WornDartTrap', hidden: true }); }) }, '+ 함정'),
          h('button', { class: 'btn xs add', onclick: () => edit('조합 오브젝트 추가', x => { x.objects = x.objects || []; x.objects.push({ type: 'prop', ref: '' }); }) }, '+ 맵 오브젝트')),
        h('div', { class: 'hint' }, '오브젝트는 바닥 그림과 따로 오브젝트 시스템이 만듭니다 — 함정은 게임 함정 규칙(밟으면 작동 · 찾기 · 해제)을 그대로 따르고, 바닥 타일은 바뀌지 않습니다.'));

      // ---- 자동 생성
      const a = c.autogen || {};
      const AP = [...P, 'autogen'];
      const themeChecks = h('div', { class: 'flex gap-3 wrap' }, themes().map(([v, n]) => { const on = (a.themes || []).includes(v); const cb = h('input', { type: 'checkbox', checked: on });
        cb.onchange = () => edit('자동 생성 테마', x => { x.autogen = x.autogen || {}; const s = new Set(x.autogen.themes || []); if (cb.checked) s.add(v); else s.delete(v); x.autogen.themes = [...s]; }); return h('label', { class: 'check' }, cb, n); }));
      const terrChecks = a.where === 'terrain' ? h('div', { class: 'flex gap-2 wrap' }, PDM.TERRAIN.filter(t => t.id >= 0).map(t => { const cb = h('input', { type: 'checkbox', checked: (a.terrains || []).map(Number).includes(t.id) });
        cb.onchange = () => edit('자동 생성 지형', x => { const s = new Set((x.autogen.terrains || []).map(Number)); if (cb.checked) s.add(t.id); else s.delete(t.id); x.autogen.terrains = [...s].sort((p, q) => p - q); }); return h('label', { class: 'check' }, cb, `${t.name} [${t.id}]`); })) : null;
      const autoBox = h('div', {},
        F.bool(K, [...AP, 'enabled'], { label: '자동 생성에 등록 (층을 만들 때 조건에 맞는 칸에 놓음)', rerender: true }),
        h('div', { style: { opacity: a.enabled ? 1 : 0.55 } },
          row(F.select(K, [...AP, 'where'], WHERE, { label: '놓을 곳' }),
            F.num(K, [...AP, 'chance'], { label: '확률 (칸마다 %)', min: 0, max: 100, step: 0.5, def: 10 }),
            F.num(K, [...AP, 'max'], { label: '층마다 최대 (0 = 제한 없음)', int: true, min: 0, def: 0 }),
            F.num(K, [...AP, 'spacing'], { label: '최소 간격 (칸)', min: 0, max: 20, step: 1, def: 2 })),
          terrChecks,
          h('div', { class: 'fl mt-3' }, '테마 (아무것도 고르지 않으면 모든 테마)'), themeChecks,
          F.bool(K, [...AP, 'handmade'], { label: '직접 그린 맵에도 놓기 (기본: 절차 생성 · 혼합 층만)' }),
          h('div', { class: 'hint mt-2' }, '같은 층은 늘 같은 자리에 놓입니다 (층 씨앗). 계단 · 함정 · 아이템 · 식물 칸과 문 · 맵 가장자리는 피합니다. 등록을 끄거나 조합을 지우면 새로 만드는 층에만 영향이 있고, 이미 만들어진 층(세이브)은 그대로입니다. ' +
            '여러 조합이 같은 칸을 원하면 목록에서 앞에 있는 조합이 먼저 놓입니다.')));

      const u = usageOf(c);
      const usage = h('div', { class: 'hint', style: { marginTop: '6px', maxWidth: '340px' } },
        u.auto || u.maps.length ? h('span', {}, h('b', { style: { color: '#5fd6b4' } }, '● 쓰는 중: '), [u.auto ? '자동 생성' : null, ...u.maps.map(m => m.label)].filter(Boolean).join(' · '))
          : h('span', {}, h('b', {}, '○ 쓰지 않음'), ' — 맵 편집기에서 오브젝트 "조합 타일"로 놓거나 자동 생성에 등록하세요.'));
      const ctxSel = h('select', {}, [['', '(자동 생성 위치를 따라감)'], ...Object.entries(WHERE)].map(([v, n]) => h('option', { value: v, selected: st.ctxScene === v }, n)));
      ctxSel.onchange = () => { st.ctxScene = ctxSel.value; ctx.refresh(); };

      return h('div', { class: 'editor' }, h('h2', {}, '🧩 조합 타일'), intro, head, ops.bar(c),
        h('div', { style: { display: 'flex', gap: '14px', alignItems: 'flex-start', flexWrap: 'wrap' } },
          h('div', { class: 'flex-none', style: { position: 'sticky', top: '0' } }, cv, field('미리보기 주변', ctxSel), usage,
            h('div', { class: 'hint', style: { maxWidth: '340px', marginTop: '4px' } }, '가운데 점선 칸이 조합을 놓는 칸입니다. 노란 점선 = 고른 스프라이트. 광원은 게임과 같은 감쇠로 그린 미리보기입니다.')),
          h('div', { style: { flex: 1, minWidth: '380px' } },
            row(F.text(K, [...P, 'name'], { label: '이름', rerender: true }), field('놓을 때 지형', terrSel)),
            section(`스프라이트 (${(c.sprites || []).length})`,
              (c.sprites || []).length ? h('div', {}, ...sprites) : h('p', { class: 'hint' }, '아래 팔레트에서 그림을 눌러 추가하세요.'),
              h('div', { class: 'hint mb-3' }, '그리는 순서: 타일 레이어 순서(맵 편집기 "레이어"에서 정함) → 같은 레이어 안에서는 이 목록 순서. "캐릭터 위" 레이어는 캐릭터를 가립니다. 칸을 막는(solid) 레이어에 넣으면 그 칸은 못 지나갑니다.'),
              palBox),
            section('광원 · 이펙트', lightBox, F.ref(K, [...P, 'effect'], 'effect', { label: '이펙트 (그 칸에서 계속 재생)', empty: '(없음)' })),
            section(`오브젝트 (${(c.objects || []).length})`, objBox),
            section('자동 생성', autoBox))),
        legacy);
    }
  });

  // ---------------- 분리된 타일셋 밑그림 대응표 (legacy)
  function legacySection(ctx, st) {
    const { section } = PDM.ui;
    const cur = PDM.tileLegacy(), def = new Map(PDM.TILE_LEGACY_DEFAULT.map(e => [e.visual, e.under]));
    const changed = (data().legacy || []).length;
    const grid = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '6px' } });
    Promise.all([PDM.assets.themeTiles(themeKey(st.theme), true), PDM.assets.themeTiles(themeKey(st.theme))]).then(([raw, comp]) => {
      if (!raw) return; const n = Math.max(1, Math.round(raw.width / 16));
      [...def.keys()].concat([...cur.keys()].filter(v => !def.has(v))).forEach(v => {
        const cv = h('canvas', { width: 64, height: 32, style: { imageRendering: 'pixelated', borderRadius: '3px' } }), g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
        g.fillStyle = '#2d5f86'; g.fillRect(0, 0, 64, 32);   // 물 (지운 바닥이면 비쳐 보이는 것)
        g.drawImage(raw, (v % 16) * n, Math.floor(v / 16) * n, n, n, 0, 0, 32, 32);
        g.drawImage(comp || raw, (v % 16) * n, Math.floor(v / 16) * n, n, n, 32, 0, 32, 32);
        const u = cur.get(v) || [], isDef = JSON.stringify(u) === JSON.stringify(def.get(v) || null);
        const inp = h('input', { type: 'text', value: u.join(','), placeholder: '없음', title: '밑그림 칸 번호 (여러 개면 쉼표 — 앞이 아래)', style: { width: '64px' } });
        inp.onchange = () => { const arr = inp.value.split(',').map(x => x.trim()).filter(x => x !== '').map(Number).filter(x => isFinite(x) && x >= 0 && x < 256);
          store.edit(K, '밑그림 대응표', r => { r.legacy = (r.legacy || []).filter(e => +e.visual !== v); if (JSON.stringify(arr) !== JSON.stringify(def.get(v) || null)) r.legacy.push({ visual: v, under: arr }); }); };
        grid.append(h('div', { style: { border: '1px solid var(--line)', borderRadius: '6px', padding: '4px 6px' } }, h('div', { class: 'hstack gap-2' }, cv, h('div', {}, h('b', {}, `칸 ${v}`), h('div', { class: 'hint' }, isDef ? '기본' : '바꿈'))),
          h('div', { class: 'hstack gap-2 mt-1' }, h('span', { class: 'hint' }, '밑그림'), inp)));
      });
    });
    return section('분리된 타일셋 밑그림 (예전 모습 재현)',
      h('p', { class: 'hint' }, '배경을 투명하게 분리한 타일셋(풀 · 장식 · 계단 · 조각상 칸의 바닥을 지운 그림)을 예전 일체형과 똑같이 보이게 하는 규칙입니다. 게임은 칸마다 그림 하나만 그리므로, 지운 바닥 자리에는 물이 비칩니다 → 그 칸 아래에 "밑그림" 칸을 먼저 그립니다. ' +
        '지금 타일셋에서 투명하고 원작에서는 불투명한 픽셀에만 그려서, 우물 물 · 연금술 솥 입구처럼 원래 물이 비치는 구멍과 원작 타일셋은 그대로입니다.'),
      h('p', { class: 'hint' }, '각 칸: 왼쪽 = 타일셋 그림 그대로(파란색 = 비치는 자리), 오른쪽 = 밑그림을 깐 모습(게임 · 맵 편집기 화면). 0 바닥 · 6 바닥 변형 · 4 특수 바닥. 75 · 131 은 원작마다 달라 확인이 필요합니다. 비우면 밑그림 없음.'),
      grid,
      h('div', { class: 'flex gap-3 mt-3' }, h('button', { class: 'btn sm', disabled: !changed, onclick: () => store.edit(K, '밑그림 대응표 기본값', r => { r.legacy = []; }) }, `기본값으로 되돌리기${changed ? ` (${changed}개 바꿈)` : ''}`)));
  }
})();
