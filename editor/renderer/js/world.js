// ================================================================
//  맵 그래프 (world) — 그룹 · 노드 · 연결
//   maps/world.json      : { start, groups[], nodes[{id, group, x, y}], edges[], customThemes[] }
//   maps/nodes/<id>.json : 노드 한 개의 맵 데이터 (생성 방식 · 타일 · 오브젝트 · 테마 …)
//
//   게임 안에서는 노드마다 (depth, branch) 번호가 필요합니다. depth 는 난이도(몬스터·아이템 수준),
//   branch 는 같은 depth 의 노드를 구분하는 번호입니다. 둘 다 연결 구조에서 자동으로 계산하며,
//   런타임(WorldGraph.java)도 똑같은 규칙으로 계산합니다.
// ================================================================
PDM.World = (function () {
  const w = () => (PDM.store && PDM.store.get('world')) || { groups: [], nodes: [], edges: [] };
  const nodeData = id => PDM.store && PDM.store.get('node:' + id);

  /** depth · branch 계산 (JS / Java 같은 규칙)
   *  1) 시작 노드 depth 1. 연결(from → to)을 따라 depth(to) = max(depth(to), depth(from)+1)
   *     (시작점에서 BFS 로 먼저 발견된 노드 → 나중 노드 방향의 연결만 씀. 되돌아가는 연결은 무시)
   *  2) 노드 데이터의 depth 가 1 이상이면 그 값으로 고정
   *  3) 어디에서도 닿지 않는 노드는 고정값 또는 1
   *  4) branch: depth 가 같은 노드끼리 [발견 순서 → 목록 순서] 로 0, 2, 3, 4 … (1 은 게임의 광산이 씀)
   */
  function compute(world, getData) {
    world = world || w(); getData = getData || nodeData;
    const nodes = world.nodes || [], edges = (world.edges || []).filter(e => e.from && e.to && e.from !== e.to);
    const ids = nodes.map(n => n.id);
    const start = ids.includes(world.start) ? world.start : ids[0];
    const fixed = {}; ids.forEach(id => { const d = getData(id); if (d && d.depth > 0) fixed[id] = d.depth | 0; });
    const depth = {}, found = {};
    let order = 0;
    if (start) {
      // BFS 로 발견 순서
      const q = [start]; found[start] = order++;
      while (q.length) { const a = q.shift(); edges.filter(e => e.from === a).forEach(e => { if (found[e.to] === undefined && ids.includes(e.to)) { found[e.to] = order++; q.push(e.to); } }); }
      depth[start] = fixed[start] || 1;
      // 가장 긴 경로 (노드 수만큼 반복하면 순환이 있어도 끝남)
      for (let it = 0; it < ids.length; it++) {
        let changed = false;
        edges.forEach(e => {
          if (depth[e.from] === undefined || !ids.includes(e.to)) return;
          if (!(found[e.to] > found[e.from])) return;            // 되돌아가는 연결(순환)은 깊이 계산에서 뺌
          const want = fixed[e.to] || Math.min(depth[e.from] + 1, 99);
          if (depth[e.to] === undefined || (!fixed[e.to] && want > depth[e.to])) { depth[e.to] = want; changed = true; }
        });
        if (!changed) break;
      }
    }
    ids.forEach(id => { if (depth[id] === undefined) depth[id] = fixed[id] || 1; });
    const idx = {}; ids.forEach((id, i) => { idx[id] = i; });
    const sorted = ids.slice().sort((a, b) => depth[a] - depth[b] || ((found[a] ?? 1e6) - (found[b] ?? 1e6)) || idx[a] - idx[b]);
    const branch = {}, next = {};
    sorted.forEach(id => { const d = depth[id]; const n = next[d] === undefined ? 0 : next[d]; branch[id] = n; next[d] = n === 0 ? 2 : n + 1; });
    return { start, depth, branch, reached: found };
  }

  let cache = null, cacheVer = -1;
  function info() {
    const ver = PDM.store ? PDM.store.version : 0;
    if (cache && cacheVer === ver) return cache;
    cache = compute(); cacheVer = ver;
    return cache;
  }

  const node = id => (w().nodes || []).find(n => n.id === id);
  const group = id => (w().groups || []).find(g => g.id === id);
  const groupOf = id => { const n = node(id); return n ? group(n.group) : null; };
  const dirOf = id => { const g = groupOf(id); const p = (PDM.store && PDM.store.get('project')) || {}; return (g && g.direction) || p.direction || 'down'; };

  /** 그룹 안에서의 층 번호: "지하 4-2층" (같은 그룹·같은 깊이의 노드가 여러 개면 -1, -2 …) */
  function label(id) {
    const d = nodeData(id) || {}, n = node(id);
    if (d.label) return d.label;
    const g = n && group(n.group);
    if (g && g.safe) return d.name || id;
    const I = info();
    const mates = (w().nodes || []).filter(x => x.group === (n && n.group));
    const minD = Math.min(...mates.map(x => I.depth[x.id]));
    const local = I.depth[id] - (isFinite(minD) ? minD : I.depth[id]) + 1;
    const same = mates.filter(x => I.depth[x.id] === I.depth[id] && !(nodeData(x.id) || {}).label).sort((a, b) => a.y - b.y || a.x - b.x);
    const suf = same.length > 1 ? `-${same.findIndex(x => x.id === id) + 1}` : '';
    return dirOf(id) === 'up' ? `${local}${suf}층` : `지하 ${local}${suf}층`;
  }
  const fullName = id => { const d = nodeData(id) || {}; const g = groupOf(id); const l = label(id); return `${g && !g.safe ? g.name + ' · ' : ''}${l}${d.name && d.name !== l && !(g && g.safe) ? ' ' + d.name : ''}`; };

  function themeOf(id) {
    const d = nodeData(id) || {};
    if (d.theme) return d.theme;
    const g = groupOf(id);
    if (g && g.theme) return g.theme;
    return PDM.defaultThemeForDepth(info().depth[id] || 1);
  }

  const outEdges = id => (w().edges || []).filter(e => e.from === id);
  const inEdges = id => (w().edges || []).filter(e => e.to === id);

  /** 노드 고르기 목록 [[id, 표시]] */
  const options = () => (w().nodes || []).map(n => [n.id, fullName(n.id)]);

  /** 직접 그린 맵의 출구(exit=true)·입구 타일 칸 (맵 순서) */
  function tiles(id, exit) {
    const d = nodeData(id) || {}, t = (d.layers || {}).terrain || [], out = [];
    t.forEach((v, i) => { if (exit ? (v === 8 || v === 21 || v === 22) : (v === 7 || v === 37)) out.push(i); });
    return out;
  }
  const kindOf = e => e.kind || 'main';
  /** 계단 배정 (런타임 WorldGraph.ports 와 같은 규칙 — 직접 그린 맵만 타일로, 나머지는 게임이 자리를 정함)
   *  돌려줌: { hand, exits:[{cell, i, what, edge}], entrances:[…], extraOut:[edge], extraIn:[edge] }
   *   what: 'door' | 'main' | 'back' | 'stair' | 'legacy' | null(안 씀) */
  function ports(id) {
    const d = nodeData(id) || {}, hand = d.mode === 'handmade';
    const outs = outEdges(id), ins = inEdges(id);
    const hasMain = outs.some(e => kindOf(e) === 'main'), hasDoorOut = outs.some(e => kindOf(e) === 'door');
    const ex = tiles(id, true), en = tiles(id, false);
    const exits = ex.map((cell, i) => ({ cell, i, what: null, edge: null })), entrances = en.map((cell, i) => ({ cell, i, what: null, edge: null }));
    const extraOut = [], extraIn = [];
    if (hand) {
      const used = new Set(), auto = [];
      const next = () => { for (let i = 0; i < ex.length; i++) if (!used.has(i)) { used.add(i); return i; } return -1; };
      outs.filter(e => kindOf(e) === 'door').forEach(e => { const k = e.exit ?? -1; if (k >= 0 && k < ex.length && !used.has(k)) { used.add(k); Object.assign(exits[k], { what: 'door', edge: e }); } else auto.push(e); });
      if (hasMain || !hasDoorOut) { const k = next(); if (k >= 0) exits[k].what = hasMain ? 'main' : 'back'; }
      auto.forEach(e => { const k = next(); if (k >= 0) Object.assign(exits[k], { what: 'door', edge: e }); else extraOut.push(e); });
      const stairs = outs.filter(e => kindOf(e) === 'stair');
      for (const e of stairs) { const k = next(); if (k < 0) break; Object.assign(exits[k], { what: 'stair', edge: e }); }
      const keep = id === w().start || !!d.entranceTo || !ins.length || ins.some(e => kindOf(e) !== 'door');
      const usedIn = new Set(); const autoIn = [];
      if (keep && en.length) { usedIn.add(0); entrances[0].what = 'legacy'; }
      ins.filter(e => kindOf(e) === 'door').forEach(e => { const k = e.entrance ?? -1; if (k >= 0 && k < en.length) { usedIn.add(k); Object.assign(entrances[k], { what: 'door', edge: e }); } else autoIn.push(e); });
      autoIn.forEach(e => { let k = -1; for (let i = 0; i < en.length; i++) if (!usedIn.has(i)) { k = i; break; } if (k >= 0) { usedIn.add(k); Object.assign(entrances[k], { what: 'door', edge: e }); } else extraIn.push(e); });
      entrances.forEach(x => { if (!x.what) x.what = 'legacy'; });
    } else {
      outs.filter(e => kindOf(e) === 'door').forEach((e, i) => { if (i > 0 || hasMain) extraOut.push(e); });
      const keep = id === w().start || !!d.entranceTo || !ins.length || ins.some(e => kindOf(e) !== 'door');
      ins.filter(e => kindOf(e) === 'door').forEach((e, i) => { if (i > 0 || keep) extraIn.push(e); });
    }
    return { hand, exits, entrances, extraOut, extraIn };
  }

  return { compute, info, node, group, groupOf, dirOf, label, fullName, themeOf, outEdges, inEdges, options, tiles, ports };
})();

// ---------------- 새 노드 · 기본 월드 · 예전 형식 변환 ----------------
PDM.GROUP_COLORS = ['#5fd6b4', '#a58bff', '#ffb35c', '#6fb7ff', '#ff7a8a', '#c8e05a', '#e58cff', '#9aa4b8'];

/** 노드 맵 데이터 기본값 (maps/nodes/<id>.json) */
PDM.make.node = function (id, mode, extra) {
  const f = PDM.make.floor(1);
  delete f.depth;
  const n = Object.assign(f, { format: 'pdmaker-node', id, mode: mode || 'procedural', name: '', label: '', depth: 0, boss: false, entranceTo: '' }, extra || {});
  if (n.mode !== 'procedural' && !n.layers.terrain.length) {
    const W = n.mode === 'hybrid' ? 11 : 21, H = n.mode === 'hybrid' ? 11 : 13;
    n.size = { w: W, h: H };
    const t = new Array(W * H).fill(4);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) t[y * W + x] = 1;
    if (n.mode === 'handmade') { t[1 * W + 2] = 7; t[(H - 2) * W + W - 3] = 8; } else t[(H - 1) * W + (W >> 1)] = 5;
    n.layers.terrain = t;
  }
  return n;
};

/** 새 프로젝트의 맵 — 원작(Shattered Pixel Dungeon)과 같은 구성:
 *  하수도 · 감옥 · 동굴 · 드워프 도시 · 악마의 전당 5구역 × 5층 (자동 생성, 5·10·15·20·25층은 보스 층) */
PDM.World.defaultWorld = function () {
  const nodes = [], edges = [], data = {}, groups = [];
  const REGIONS = [['g1', '하수도', 'SEWER'], ['g2', '감옥', 'PRISON'], ['g3', '동굴', 'CAVES'], ['g4', '드워프 도시', 'CITY'], ['g5', '악마의 전당', 'HALLS']];
  REGIONS.forEach(([gid, name, theme], gi) => {
    groups.push({ id: gid, name, theme, direction: '', color: PDM.GROUP_COLORS[gi % PDM.GROUP_COLORS.length], rooms: [], safe: false, note: '원작 ' + name + ` (${gi * 5 + 1}~${gi * 5 + 5}층)` });
    for (let k = 1; k <= 5; k++) {
      const d = gi * 5 + k, id = 'n' + d;
      nodes.push({ id, group: gid, x: 40 + (k - 1) * 200, y: 80 + gi * 280 });
      data[id] = PDM.make.node(id, 'procedural', { boss: k === 5 });
      if (d > 1) edges.push({ id: 'e' + d, from: 'n' + (d - 1), to: id, kind: 'main', cond: '', weight: 100, label: '' });
    }
  });
  return { world: { format: 'pdmaker-world', version: 1, start: 'n1', groups, nodes, edges, customThemes: [] }, data };
};

/** 예전 형식(chapters.json + floor_XX + extra_*) → 맵 그래프 */
PDM.World.fromLegacy = function (chapters, floors, extras) {
  const notes = [];
  const world = { format: 'pdmaker-world', version: 1, start: '', groups: [], nodes: [], edges: [], customThemes: (chapters && chapters.customThemes) || [] };
  const data = {};
  const fid = d => 'f' + d;
  const chs = (chapters && chapters.chapters) || [];
  let eid = 1;
  const edge = (from, to, o) => world.edges.push(Object.assign({ id: 'e' + (eid++), from, to, kind: 'main', cond: '', weight: 100, label: '' }, o || {}));
  const inGroup = {};
  chs.forEach((c, gi) => {
    world.groups.push({ id: c.id || 'g' + (gi + 1), name: c.name || `${gi + 1}구역`, theme: c.theme || '', direction: c.direction || '', color: PDM.GROUP_COLORS[gi % PDM.GROUP_COLORS.length], rooms: c.rooms || [], safe: false, note: '' });
    (c.floors || []).forEach(d => { inGroup[d] = c.id || 'g' + (gi + 1); });
    if ((c.paths || []).length) notes.push(`장 「${c.name}」 의 갈림길(paths)은 노드 연결로 바뀌었습니다. 맵 화면에서 갈림길 노드와 조건 연결을 다시 만들어 주세요.`);
  });
  const depths = Object.keys(floors).map(Number).sort((a, b) => a - b);
  if (depths.some(d => !inGroup[d])) world.groups.push({ id: 'etc', name: '기타 층', theme: '', direction: '', color: PDM.GROUP_COLORS[7], rooms: [], safe: false, note: '' });
  const col = {}; // 그룹별 다음 x
  const place = (id, g, below) => {
    const gi = world.groups.findIndex(x => x.id === g);
    col[g] = col[g] || 0;
    const n = { id, group: g, x: 40 + col[g] * 200, y: 60 + gi * 330 + (below ? 200 : 0) };
    if (!below) col[g]++;
    world.nodes.push(n); return n;
  };
  const extrasAfter = (d, link) => extras.filter(e => e.after === d && e.link === link).sort((a, b) => (a.order || 0) - (b.order || 0) || a.branch - b.branch);
  let prev = null;
  depths.forEach(d => {
    const f = floors[d], g = inGroup[d] || 'etc';
    const id = fid(d);
    const nd = Object.assign({}, f, { format: 'pdmaker-node', id, depth: d, label: '', boss: !!(f.procedural && f.procedural.keepBoss) || (d % 5 === 0 && f.mode === 'procedural'), entranceTo: '' });
    data[id] = nd;
    place(id, g);
    if (prev) edge(prev, id);
    prev = id;
    // 통과형 사이 맵
    extrasAfter(d, 'inline').forEach(e => { data[e.id] = legacyExtra(e); place(e.id, g); edge(prev, e.id); prev = e.id; });
    // 샛길형
    extrasAfter(d, 'side').forEach(e => {
      data[e.id] = legacyExtra(e); const n = place(e.id, g, true); n.x = world.nodes.find(x => x.id === id).x;
      const at = e.sideAt || {};
      edge(id, e.id, { kind: 'stair', cond: e.cond || '', place: at.rule === 'xy' ? 'xy' : (at.rule || 'random'), at: at.rule === 'xy' ? { x: at.x, y: at.y } : undefined });
    });
  });
  // 던전 밖 맵
  const free = extras.filter(e => e.link === 'free');
  if (free.length) {
    world.groups.push({ id: 'outside', name: '던전 밖', theme: '', direction: '', color: PDM.GROUP_COLORS[6], rooms: [], safe: true, note: '' });
    free.forEach(e => { data[e.id] = legacyExtra(e); place(e.id, 'outside'); });
  }
  // 계단 목적지 (entranceTo / exitTo)
  const tgt = t => !t || t === 'back' ? '' : t.startsWith('floor:') ? fid(+t.slice(6)) : t.startsWith('extra:') ? t.slice(6) : '';
  [...depths.map(d => [fid(d), floors[d]]), ...extras.map(e => [e.id, e])].forEach(([id, f]) => {
    if (!data[id]) return;
    if (f.entranceTo) data[id].entranceTo = tgt(f.entranceTo);
    if (f.exitTo && tgt(f.exitTo)) {
      world.edges = world.edges.filter(x => !(x.from === id && x.kind === 'main'));
      edge(id, tgt(f.exitTo));
    }
  });
  world.start = data.f1 ? 'f1' : (world.nodes[0] || {}).id || '';
  function legacyExtra(e) {
    const n = Object.assign({}, e, { format: 'pdmaker-node', mode: 'handmade', depth: 0, label: '', boss: false, entranceTo: '' });
    ['after', 'branch', 'link', 'order', 'sideAt', 'cond', 'exitTo'].forEach(k => delete n[k]);
    return n;
  }
  return { world, data, notes };
};
