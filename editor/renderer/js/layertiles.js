// ================================================================
//  레이어 타일 목록 (8차) — 타일 레이어마다 "이 레이어에 놓을 타일" 목록 · 사용자 타일 추가 · 복제 · 삭제 · 순서 · 검사
//    타일 정의는 예전처럼 world.userTiles 한 곳 (런타임 MakerUserTiles 가 읽음). 레이어 정의 world.tileLayers[].tiles = 타일 id 목록 (순서 = 팔레트 순서)
//      tiles 가 없는 레이어(예전 프로젝트 · 기본 레이어) = 모든 사용자 타일을 보여 줌 — 어느 레이어든 처음 고칠 때(추가 · 빼기 · 순서) 모든 레이어를 지금 목록으로 만들어 저장
//      tiles 는 편집기만 씀 — 런타임은 칸마다 적힌 타일 id 를 그대로 그리므로 목록에서 빼도 이미 놓은 칸은 바뀌지 않음
//    사용자 타일에 더한 칸 (모두 선택): category (분류 — 팔레트 걸러 보기) · alpha (0~1 — 런타임 MakerUserTiles.render 가 그 칸의 불투명도로)
//    타일셋에서 가져온 타일 = 그림 경로 + 칸(x, y) + 칸 크기를 가리킴 (그림을 복사하지 않음 — 같은 칸이면 이미 있는 타일을 다시 씀)
//    모두 순수 함수 (w = world 데이터) — 맵 편집기 팔레트 · 회귀 테스트(tools/tests/run.js) 공용. store.edit 안에서 부름
// ================================================================
(function () {
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  const tilesOf = w => (w && Array.isArray(w.userTiles) ? w.userTiles : []).filter(isObj);
  /** 레이어 정의 (world.tileLayers · 없으면 기본) */
  const layerDefs = w => w && Array.isArray(w.tileLayers) && w.tileLayers.length ? w.tileLayers.filter(isObj) : (PDM.tileLayersDefault ? PDM.tileLayersDefault() : []);
  const layerDef = (w, layerId) => layerDefs(w).find(l => l.id === layerId) || null;

  /** 레이어의 타일 목록: { tiles: [타일 정의], missing: [목록에만 있고 정의가 없는 id], all: 목록이 없어 전부 보이는지 } */
  function list(w, layerId) {
    const all = tilesOf(w), d = layerDef(w, layerId);
    if (!d || !Array.isArray(d.tiles)) return { tiles: all, missing: [], all: true };
    const by = new Map(all.map(t => [t.id, t])), seen = new Set(), tiles = [], missing = [];
    for (const id of d.tiles) { if (typeof id !== 'string' || seen.has(id)) continue; seen.add(id); const t = by.get(id); if (t) tiles.push(t); else missing.push(id); }
    return { tiles, missing, all: false };
  }
  /** 고치기 전에: world.tileLayers 를 실제 배열로 (없으면 기본 레이어 복사) · 그 레이어의 tiles 목록을 지금 보이는 목록으로. 레이어 정의(수정 가능)를 돌려줌 */
  function ensure(w, layerId) {
    if (!Array.isArray(w.tileLayers) || !w.tileLayers.length) w.tileLayers = PDM.clone(PDM.tileLayersDefault ? PDM.tileLayersDefault() : []);
    let d = w.tileLayers.find(l => isObj(l) && l.id === layerId);
    if (!d) { d = { id: layerId, name: layerId, depth: 'below', visible: true, solid: false }; w.tileLayers.push(d); }
    const now = tilesOf(w).map(t => t.id);   // 목록이 없던 레이어는 모두 "지금 보이던 목록"으로 — 새로 넣는 타일은 고친 레이어에만 들어감
    w.tileLayers.forEach(l => { if (isObj(l) && !Array.isArray(l.tiles)) l.tiles = now.slice(); });
    return d;
  }
  /** 겹치지 않는 타일 id */
  function newId(w, base) {
    const have = new Set(tilesOf(w).map(t => t.id));
    let id = base || PDM.uid('ut'); while (have.has(id)) id = PDM.uid('ut');
    return id;
  }
  /** 같은 그림의 같은 칸(크기까지)을 가리키는 타일 (타일셋에서 가져오기가 다시 씀) */
  function findRegion(w, image, size, x, y) {
    return tilesOf(w).find(t => t.image === image && !t.flow && Math.max(1, t.size || 16) === size && (t.x || 0) === x && (t.y || 0) === y) || null;
  }
  /** 그림의 한 칸을 가리키는 새 타일 정의 (지형은 그대로 — 그림만 덮음) */
  function regionTile(w, image, size, x, y, name, category) {
    return { id: newId(w), name: name || `타일 (${x}, ${y})`, image, x, y, size, terrain: -2, over: false, fx: '', category: category || '' };
  }
  /** 레이어 목록 끝에 타일 id 를 (이미 있으면 그대로) */
  function attach(w, layerId, id) { const d = ensure(w, layerId); if (!d.tiles.includes(id)) d.tiles.push(id); return d; }
  /** 타일 정의를 world.userTiles 에 넣고 레이어 목록에 붙임 → 타일 */
  function add(w, layerId, tile) {
    w.userTiles = Array.isArray(w.userTiles) ? w.userTiles : [];
    if (layerId) ensure(w, layerId);   // 목록을 먼저 만들어 둠 (새 타일이 다른 레이어의 "지금 목록"에 섞이지 않게)
    const t = Object.assign({}, tile); if (!t.id || tilesOf(w).some(o => o.id === t.id)) t.id = newId(w);
    w.userTiles.push(t);
    if (layerId) attach(w, layerId, t.id);
    return t;
  }
  /** 타일셋 영역(칸 x0..x1 · y0..y1)을 레이어에 — 칸마다 타일 하나 (같은 칸의 타일이 이미 있으면 그것을 목록에 붙임). 가져온(또는 다시 쓴) 타일 id 목록 */
  function addRegion(w, layerId, image, size, x0, y0, x1, y1, opts = {}) {
    const ids = [], sz = Math.max(1, size | 0 || 16);
    ensure(w, layerId);
    const xa = Math.min(x0, x1), xb = Math.max(x0, x1), ya = Math.min(y0, y1), yb = Math.max(y0, y1);
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
      let t = findRegion(w, image, sz, x, y);
      if (!t) t = add(w, null, regionTile(w, image, sz, x, y, (opts.name ? opts.name + (xa === xb && ya === yb ? '' : ` ${x - xa + 1 + (y - ya) * (xb - xa + 1)}`) : ''), opts.category));
      attach(w, layerId, t.id); ids.push(t.id);
    }
    return ids;
  }
  /** 타일 복제 (새 id · "사본") — 원래 타일 바로 뒤 · 레이어 목록에도 원래 타일 뒤에 */
  function duplicate(w, layerId, id) {
    const all = tilesOf(w), src = all.find(t => t.id === id); if (!src) return null;
    if (layerId) ensure(w, layerId);
    const c = Object.assign(PDM.clone(src), { id: newId(w), name: (src.name || '타일') + ' 사본' });
    const i = w.userTiles.indexOf(src); w.userTiles.splice(i + 1, 0, c);
    if (layerId) { const d = ensure(w, layerId), j = d.tiles.indexOf(id); if (j >= 0) d.tiles.splice(j + 1, 0, c.id); else d.tiles.push(c.id); }
    return c;
  }
  /** 레이어 목록 안에서 순서 바꾸기 (dir -1 · +1) */
  function move(w, layerId, id, dir) {
    const d = ensure(w, layerId), i = d.tiles.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= d.tiles.length) return false;
    [d.tiles[i], d.tiles[j]] = [d.tiles[j], d.tiles[i]]; return true;
  }
  /** 레이어 목록에서만 빼기 (정의 · 이미 놓은 칸은 그대로) */
  function detach(w, layerId, id) { const d = ensure(w, layerId), i = d.tiles.indexOf(id); if (i >= 0) d.tiles.splice(i, 1); return i >= 0; }
  /** 타일 정의 삭제 (모든 레이어 목록에서도). 이미 놓은 칸의 id 는 맵 데이터에 남음 — 부르는 쪽이 usage 로 먼저 묻기 */
  function remove(w, id) {
    if (!Array.isArray(w.userTiles)) return false;
    const i = w.userTiles.findIndex(t => isObj(t) && t.id === id); if (i < 0) return false;
    w.userTiles.splice(i, 1);
    (Array.isArray(w.tileLayers) ? w.tileLayers : []).forEach(l => { if (isObj(l) && Array.isArray(l.tiles)) l.tiles = l.tiles.filter(x => x !== id); });
    return true;
  }
  /** 분류 목록 (가나다순, 빈 분류 빼고) */
  const categories = tiles => [...new Set(tiles.map(t => String(t.category || '').trim()).filter(Boolean))].sort();
  /** 맵 데이터들에서 타일 id 를 쓴 칸 수 { total, places: [[키, 칸 수]] } — maps = [[키, 맵 데이터]] */
  function usage(maps, id) {
    let total = 0; const places = [];
    for (const [k, f] of maps) {
      const L = (f && f.layers) || {}, arrs = Object.values(isObj(L.tiles) ? L.tiles : {}).concat(Array.isArray(L.utile) ? [L.utile] : []);
      const n = arrs.reduce((a, arr) => a + (Array.isArray(arr) ? arr.filter(v => v === id).length : 0), 0);
      if (n) { total += n; places.push([k, n]); }
    }
    return { total, places };
  }
  /** 타일 하나 검사 — dims = 불러온 그림 { width, height } (없으면 null = 그림을 못 찾음, undefined = 아직 모름) → [문제 문장] */
  function check(t, dims) {
    const out = [];
    if (!isObj(t)) return ['타일 정의가 아닙니다'];
    if (!t.image) return out;   // 그림 없는 효과 타일 (지형 그림)
    if (dims === null) { out.push(`그림을 찾을 수 없습니다: ${t.image}`); return out; }
    if (t.alpha != null && !(t.alpha >= 0 && t.alpha <= 1)) out.push(`불투명도 ${t.alpha} — 0~1 이어야 합니다`);
    if (!dims || t.flow) return out;
    const z = Math.max(1, t.size || 16), x = t.x || 0, y = t.y || 0;
    if (!(Number.isInteger(x) && Number.isInteger(y)) || x < 0 || y < 0 || (x + 1) * z > dims.width || (y + 1) * z > dims.height)
      out.push(`칸 (${x}, ${y}) 이 그림(${dims.width}×${dims.height}, 칸 ${z}px) 밖입니다`);
    return out;
  }
  PDM.layerTiles = { list, ensure, add, addRegion, regionTile, findRegion, duplicate, move, detach, remove, attach, categories, usage, check, layerDefs };
})();
