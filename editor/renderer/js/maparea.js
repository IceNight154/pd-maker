// ================================================================
//  맵 영역 편집 — 사각형 영역 복사 · 잘라내기 · 붙여넣기 (맵 편집기 "⇱ 선택" 도구가 씀)
//    화면과 상관없는 데이터 연산만 (DOM 없음 — tools/tests 가 Node 에서 바로 확인)
//    대상 데이터 (노드 · 방 템플릿): layers.terrain · layers.tiles { 레이어: [...] } · layers.spawn · layers.rand · objects[] (칸 좌표가 있는 것)
//
//  복사본 (클립보드 kind "maparea"):
//    { format: 'pdmaker-maparea', version: 1, w, h, src: 원본 리소스 키,
//      terrain: [w*h] (-1 = 빈 칸), tiles: { 레이어 id: [w*h] }, spawn?: [w*h], rand?: [w*h], randSets?: [...],
//      objects: [ 원본 그대로 + at = 영역 안 상대 좌표 ] }
//  붙여넣기 규칙
//    · 원본의 빈 칸(-1) = 투명: 그 칸은 지형 · 레이어 · 스폰 · 무작위 칸 모두 그대로 둠
//    · 그 밖의 칸 = 원본 그대로 덮어씀 — 레이어도 원본 칸 값(없음 '' 포함)으로 (보이는 모습이 원본과 같게). 레이어끼리 섞이지 않음
//    · 맵 밖으로 나가는 칸 · 오브젝트는 붙이지 않음 (맵을 넓히지 않음 — 결과의 clippedCells · clippedObjects)
//    · 오브젝트: 새 id, 좌표를 붙인 자리로 옮김, 그 밖의 속성 · 참조(ref · event · cond …)는 그대로. 붙이는 곳에 이미 있던 오브젝트는 지우지 않음
//    · 직접 그린 노드에만 놓는 종류(start · 투명 입구/출구)는 방 템플릿에 붙이지 않음
//    · 무작위 칸(rand)은 같은 맵 안에서만 (번호가 그 맵의 randSets 를 가리키므로 — 다른 맵이면 빼고 알림)
//    · 스폰 구역은 받는 맵에 스폰 레이어가 있을 때만(직접 그린 노드)
//  잘라내기 = 복사에 성공한 뒤 clear (지우개 "전부"와 같은 규칙: 지형 빈 칸 · 모든 레이어 비움 · 스폰 · 무작위 칸 0 · 칸 안 오브젝트 삭제)
//  레이어 범위 (5차): opts.layer = 레이어 id 면 그 레이어만 — copy 는 그 레이어의 칸만 담고(복사본 layer = id, 지형 · 오브젝트 · 스폰 없음),
//    paste 는 받는 레이어(opts.layer, 없으면 복사본의 레이어) 칸만 고치고 빈 칸('')은 투명, clear 는 그 레이어만 비움.
//    레이어 칸을 고치면 그 칸의 지형은 "가장 위 레이어 중 지형을 가진 사용자 타일"로 다시 정함(opts.terrainOf · opts.order — 없으면 지형 그대로)
//  잠긴 레이어 (opts.locked = Set) 는 전부 범위의 paste · clear 에서도 건드리지 않음
// ================================================================
PDM.mapArea = (function () {
  const FORMAT = 'pdmaker-maparea';
  const sizeOf = d => ({ w: (d.size || {}).w | 0, h: (d.size || {}).h | 0 });
  const hasCell = o => o && o.at && o.at.x != null && o.at.y != null;

  /** 두 점 → 맵 안으로 자른 사각형 { x0, y0, x1, y1 } (포함) — 방향 상관없음. 맵과 겹치지 않으면 null */
  function rect(ax, ay, bx, by, W, H) {
    let x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), y0 = Math.min(ay, by), y1 = Math.max(ay, by);
    if (x1 < 0 || y1 < 0 || x0 >= W || y0 >= H) return null;
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W - 1, x1); y1 = Math.min(H - 1, y1);
    return { x0, y0, x1, y1 };
  }
  const inRect = (r, x, y) => !!r && x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;

  /** 칸 i 의 지형을 레이어로 다시 정함: 그리는 순서(order)의 가장 위 레이어부터 보며 지형을 가진 타일(terrainOf(id) ≥ 0)이 있으면 그 지형. 없으면 그대로 */
  function retopTerrain(L, i, opts) {
    if (!opts || !opts.terrainOf || !opts.order || !Array.isArray(L.terrain)) return;
    for (let k = opts.order.length - 1; k >= 0; k--) {
      const a = (L.tiles || {})[opts.order[k]], id = a && a[i];
      if (!id) continue;
      const t = opts.terrainOf(id);
      if (t != null && t >= 0) { L.terrain[i] = t; return; }
    }
  }
  /** 영역 복사 → 복사본 (영역이 맵 밖이면 null). key = 원본 리소스 키 (무작위 칸 번호를 같은 맵에서만 쓰려고). opts.layer = 그 레이어만 */
  function copy(d, r, key, opts = {}) {
    const { w: W, h: H } = sizeOf(d), L = d.layers || {};
    r = r && rect(r.x0, r.y0, r.x1, r.y1, W, H);
    if (!r || !Array.isArray(L.terrain) || L.terrain.length !== W * H) return null;
    const w = r.x1 - r.x0 + 1, h = r.y1 - r.y0 + 1;
    const grab = (arr, empty) => { const out = new Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = arr[(r.y0 + y) * W + r.x0 + x]; out[y * w + x] = v === undefined || v === null ? empty : v; } return out; };
    if (opts.layer) {   // 레이어 하나만: 지형은 "빈 칸"(-1)으로 채워 두고 붙일 때 쓰지 않음
      const a = (L.tiles || {})[opts.layer];
      return { format: FORMAT, version: 1, w, h, src: key || '', layer: opts.layer, terrain: new Array(w * h).fill(-1), tiles: { [opts.layer]: Array.isArray(a) && a.length === W * H ? grab(a, '') : new Array(w * h).fill('') }, objects: [] };
    }
    const out = { format: FORMAT, version: 1, w, h, src: key || '', terrain: grab(L.terrain, -1), tiles: {}, objects: [] };
    Object.entries(L.tiles || {}).forEach(([id, arr]) => { if (Array.isArray(arr) && arr.length === W * H) { const a = grab(arr, ''); if (a.some(Boolean)) out.tiles[id] = a; } });
    if (Array.isArray(L.spawn) && L.spawn.length === W * H) { const a = grab(L.spawn, 0); if (a.some(Boolean)) out.spawn = a; }
    if (Array.isArray(L.rand) && L.rand.length === W * H) { const a = grab(L.rand, 0); if (a.some(Boolean)) { out.rand = a; out.randSets = JSON.parse(JSON.stringify(d.randSets || [])); } }
    (d.objects || []).forEach(o => { if (hasCell(o) && inRect(r, o.at.x, o.at.y)) { const c = JSON.parse(JSON.stringify(o)); c.at = Object.assign({}, c.at, { x: o.at.x - r.x0, y: o.at.y - r.y0 }); out.objects.push(c); } });
    return out;
  }

  /** 복사본이 쓸 수 있는 모양인지 (다른 창 · 손으로 고친 클립보드 대비) */
  function valid(c) {
    if (!c || c.format !== FORMAT || !(c.w > 0) || !(c.h > 0) || !Array.isArray(c.terrain) || c.terrain.length !== c.w * c.h) return false;
    if (c.tiles && Object.values(c.tiles).some(a => !Array.isArray(a) || a.length !== c.w * c.h)) return false;
    if (c.spawn && c.spawn.length !== c.w * c.h) return false;
    if (c.rand && c.rand.length !== c.w * c.h) return false;
    if (c.layer && !(c.tiles && Array.isArray(c.tiles[c.layer]))) return false;
    return Array.isArray(c.objects || []);
  }

  /** 붙여넣기: 복사본 c 의 왼쪽 위를 맵 (px, py) 에. d 를 고침 (store.edit 안에서 부를 것).
   *  opts: { key (받는 리소스 키), kind: 'node' | 'room', uid: () => 새 오브젝트 id, objects: false 면 오브젝트는 빼고 }
   *  → { cells, clippedCells, objects, clippedObjects, skippedTypes, randDropped, ids (붙인 오브젝트 새 id) } */
  function paste(d, c, px, py, opts = {}) {
    if (!valid(c)) throw new Error('붙여 넣을 수 없는 영역 데이터입니다');
    const { w: W, h: H } = sizeOf(d);
    d.layers = d.layers || {};
    const L = d.layers;
    if (!Array.isArray(L.terrain) || L.terrain.length !== W * H) throw new Error('맵의 지형 데이터가 크기와 맞지 않습니다 (검사 F7)');
    const res = { cells: 0, clippedCells: 0, objects: 0, clippedObjects: 0, skippedTypes: 0, randDropped: false, ids: [] };
    const locked = opts.locked || new Set();
    if (c.layer || opts.layer) {   // 레이어 하나만: 받는 레이어(opts.layer, 없으면 원본 레이어)의 칸만 — 빈 칸('')은 투명, 지형 · 다른 레이어 · 오브젝트는 그대로
      const to = opts.layer || c.layer, src = c.layer ? c.tiles[c.layer] : null;
      if (!src) throw new Error('레이어 하나만 붙여 넣으려면 레이어를 복사한 것이어야 합니다');
      if (locked.has(to)) throw new Error('잠긴 레이어에는 붙여 넣을 수 없습니다');
      L.tiles = L.tiles || {};
      if (!Array.isArray(L.tiles[to]) || L.tiles[to].length !== W * H) L.tiles[to] = new Array(W * H).fill('');
      for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
        const v = src[y * c.w + x]; if (!v) continue;
        const tx = px + x, ty = py + y;
        if (tx < 0 || ty < 0 || tx >= W || ty >= H) { res.clippedCells++; continue; }
        const t = ty * W + tx; L.tiles[to][t] = v; retopTerrain(L, t, opts); res.cells++;
      }
      if (!L.tiles[to].some(Boolean)) delete L.tiles[to];
      if (!Object.keys(L.tiles).length) delete L.tiles;
      return res;
    }
    const sameMap = !!opts.key && c.src === opts.key;
    const useRand = !!c.rand && sameMap && Array.isArray(L.rand) && L.rand.length === W * H;
    if (c.rand && !useRand) res.randDropped = true;
    const useSpawn = !!c.spawn && Array.isArray(L.spawn) && L.spawn.length === W * H;
    // 레이어: 받는 맵에 없는 레이어는 만들어서 (원본이 칠한 레이어만)
    const tilesIn = c.tiles || {};
    if (Object.keys(tilesIn).length) L.tiles = L.tiles || {};
    Object.keys(tilesIn).forEach(id => { if (!Array.isArray(L.tiles[id]) || L.tiles[id].length !== W * H) L.tiles[id] = new Array(W * H).fill(''); });
    const allLayers = Object.keys(L.tiles || {});
    for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
      const s = y * c.w + x, v = c.terrain[s];
      if (v < 0) continue;   // 빈 칸 = 투명
      const tx = px + x, ty = py + y;
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) { res.clippedCells++; continue; }
      const t = ty * W + tx;
      L.terrain[t] = v;
      allLayers.forEach(id => { if (!locked.has(id)) L.tiles[id][t] = tilesIn[id] ? (tilesIn[id][s] || '') : ''; });
      if (useSpawn) L.spawn[t] = c.spawn[s] || 0;
      if (useRand) L.rand[t] = c.rand[s] || 0;
      res.cells++;
    }
    // 빈 레이어는 저장하지 않음 (맵 편집기의 putTiles 와 같음)
    if (L.tiles) { Object.keys(L.tiles).forEach(id => { if (!L.tiles[id].some(Boolean)) delete L.tiles[id]; }); if (!Object.keys(L.tiles).length) delete L.tiles; }
    if (opts.objects !== false) {
      d.objects = d.objects || [];
      (c.objects || []).forEach(o => {
        const T = PDM.OBJECT_TYPES && PDM.OBJECT_TYPES[o.type];
        if (T && (T.nodeOnly || o.type === 'start') && opts.kind === 'room') { res.skippedTypes++; return; }
        const tx = px + ((o.at && o.at.x) | 0), ty = py + ((o.at && o.at.y) | 0);
        if (tx < 0 || ty < 0 || tx >= W || ty >= H) { res.clippedObjects++; return; }
        const n = JSON.parse(JSON.stringify(o));
        n.id = opts.uid ? opts.uid() : 'o_' + Math.random().toString(36).slice(2, 8);
        n.at = Object.assign({}, n.at, { x: tx, y: ty });
        d.objects.push(n); res.objects++; res.ids.push(n.id);
      });
    }
    return res;
  }

  /** 영역 비우기 (잘라내기 · Delete): 지형 빈 칸(-1) · 모든 레이어 '' · 스폰 · 무작위 칸 0 · 칸 안 오브젝트 삭제 → 지운 오브젝트 수.
   *  opts.layer = 그 레이어만 비움(지형은 남은 레이어로 다시 정함 · 오브젝트 그대로) · opts.locked = 건드리지 않을 레이어 */
  function clear(d, r, opts = {}) {
    const { w: W, h: H } = sizeOf(d), L = d.layers || {};
    r = r && rect(r.x0, r.y0, r.x1, r.y1, W, H);
    if (!r) return 0;
    const locked = opts.locked || new Set();
    if (opts.layer) {
      const a = (L.tiles || {})[opts.layer];
      if (locked.has(opts.layer) || !Array.isArray(a)) return 0;
      for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) { const i = y * W + x; if (a[i]) { a[i] = ''; retopTerrain(L, i, opts); } }
      if (!a.some(Boolean)) delete L.tiles[opts.layer];
      if (L.tiles && !Object.keys(L.tiles).length) delete L.tiles;
      return 0;
    }
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
      const i = y * W + x;
      if (Array.isArray(L.terrain)) L.terrain[i] = -1;
      Object.entries(L.tiles || {}).forEach(([id, a]) => { if (Array.isArray(a) && !locked.has(id)) a[i] = ''; });
      if (Array.isArray(L.spawn)) L.spawn[i] = 0;
      if (Array.isArray(L.rand)) L.rand[i] = 0;
    }
    if (L.tiles) { Object.keys(L.tiles).forEach(id => { if (!Array.isArray(L.tiles[id]) || !L.tiles[id].some(Boolean)) delete L.tiles[id]; }); if (!Object.keys(L.tiles).length) delete L.tiles; }
    const before = (d.objects || []).length;
    if (d.objects) d.objects = d.objects.filter(o => !(hasCell(o) && inRect(r, o.at.x, o.at.y)));
    return before - (d.objects || []).length;
  }

  /** 영역 안의 오브젝트 id 목록 (선택 도구가 영역과 함께 고름) */
  const objectsIn = (d, r) => (d.objects || []).filter(o => hasCell(o) && inRect(r, o.at.x, o.at.y)).map(o => o.id).filter(Boolean);

  /** 여러 오브젝트를 (dx, dy) 만큼 옮김. 하나라도 맵 밖으로 나가면 아무것도 옮기지 않고 false. → 옮긴 칸 { 옛 칸: 새 칸 } (계단 번호 맞추기용) */
  function moveObjects(d, ids, dx, dy) {
    const { w: W, h: H } = sizeOf(d), set = new Set(ids), list = (d.objects || []).filter(o => set.has(o.id) && hasCell(o));
    if (!list.length || (!dx && !dy)) return null;
    if (list.some(o => o.at.x + dx < 0 || o.at.y + dy < 0 || o.at.x + dx >= W || o.at.y + dy >= H)) return false;
    const map = {};
    list.forEach(o => { map[o.at.y * W + o.at.x] = (o.at.y + dy) * W + o.at.x + dx; o.at = Object.assign({}, o.at, { x: o.at.x + dx, y: o.at.y + dy }); });
    return map;
  }

  /** 오브젝트만 담은 복사본 (여러 오브젝트 복사 · 복제 — 지형은 모두 빈 칸 = 투명). 왼쪽 위 = 고른 오브젝트들을 감싸는 사각형의 왼쪽 위 */
  function copyObjects(d, ids, key) {
    const set = new Set(ids), list = (d.objects || []).filter(o => set.has(o.id) && hasCell(o));
    if (!list.length) return null;
    const x0 = Math.min(...list.map(o => o.at.x)), y0 = Math.min(...list.map(o => o.at.y));
    const w = Math.max(...list.map(o => o.at.x)) - x0 + 1, h = Math.max(...list.map(o => o.at.y)) - y0 + 1;
    return { format: FORMAT, version: 1, w, h, src: key || '', objectsOnly: true, terrain: new Array(w * h).fill(-1), tiles: {},
      objects: list.map(o => { const c = JSON.parse(JSON.stringify(o)); c.at = Object.assign({}, c.at, { x: o.at.x - x0, y: o.at.y - y0 }); return c; }) };
  }

  return { FORMAT, rect, inRect, copy, copyObjects, valid, paste, clear, objectsIn, moveObjects, retopTerrain };
})();
