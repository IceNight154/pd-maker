// ================================================================
//  게임 저장소의 맵 (10차) — Dungeon.newLevel() 이 고르는 층 클래스를 맵 그래프에 보여 주고 가져옴
//    자료: PDM.REPO_ANALYSIS.objects.maps (repo-analyzer.js — slots · levels · transitions · 고정 맵 레이아웃)
//    가져오기:
//      · 고정 맵 (build() 를 끝까지 따라가 모든 칸이 정해짐) → 직접 그리기(handmade) 노드 + 원본 타일 — 타일 편집 가능
//        저장소만의 지형 값(예: ARK 의 Terrain.AVOID = 0x20 을 칸에 씀)은 값 그대로 두고 "PDMaker 가 모르는 지형"으로 표시 (다른 지형으로 바꾸지 않음)
//      · 절차 생성 · 코드 생성 · 일부만 확정된 고정 맵 → 게임 원래 맵(game) 노드 — 게임이 그 클래스로 만듦 (런타임 MakerRuntime.createLevel)
//        타일 편집 불가 · 미리보기 그림을 지어내지 않음. 이름 · 그룹 · 연결 · 깊이만 PDMaker 에서
//      · 연결: LevelTransition(도착 깊이 · 갈래가 숫자) → 원본 연결 / 같은 조건의 깊이 순서 → 추정 연결 (점선 · "추정") / 나머지 → 미확인 목록
//    노드 데이터 src = { kind: 'repo-level', profile, repo, cls, file, line, generator, depths, depth, branch, conds, links[], unknownTerrain{} }
// ================================================================
(function () {
  const h = PDM.h;
  const GEN = { procedural: '절차 생성 (RegularLevel)', fixed: '고정 맵 (모든 칸 확정)', 'fixed-partial': '고정 맵 (일부만 확정)', code: '코드가 만드는 맵' };
  const maps = () => { const R = PDM.REPO_ANALYSIS; return R && R.objects && R.objects.maps ? R.objects.maps : null; };
  const prof = () => (PDM.REPO_ANALYSIS || {}).profile || { id: 'repo', label: '게임 저장소' };
  const slug = s => String(s).replace(/([a-z])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9_]+/g, '_').toLowerCase();
  /** 슬롯 → 노드 id 들 (깊이마다 하나) */
  const nodeIds = (s, i) => { const ds = s.depth.length ? s.depth : [null]; return ds.map(d => 'g_' + slug(s.cls) + (d == null ? '' : '_d' + d) + (s.branch ? '_b' + s.branch : '') + (dupIdx(s, i) ? '_' + dupIdx(s, i) : '')); };
  /** 같은 클래스 · 같은 깊이가 조건만 다르게 여러 번 나올 때 구분 */
  const dupIdx = (s, i) => { const M = maps(); if (!M) return 0; const same = M.slots.filter((x, k) => k < i && !x.fallback && x.cls === s.cls && JSON.stringify(x.depth) === JSON.stringify(s.depth) && x.branch === s.branch); return same.length; };
  /** 예전(10차)에 가져온 고정 맵: 지금 분석의 타일과 같으면 손대지 않은 것 */
  const sameTiles = (s, n) => { const l = level(s); return !!(l && l.layout && l.layout.tiles && n.layers && JSON.stringify(n.layers.terrain) === JSON.stringify(l.layout.tiles)); };
  /** 게임 원본 그대로인 층 노드 (런타임 WorldGraph.nativeGame 과 같은 규칙) — 게임 코드가 그 층 · 계단을 만듦 */
  function isNative(n) {
    if (!n || !PDM.World.originOf(n)) return false;
    if (n.mode === 'game') return true;
    return n.mode === 'handmade' && !!n.src.tilesHash && !(n.objects || []).length && !n.onEnter && thash((n.layers || {}).terrain || []) === n.src.tilesHash;
  }
  /** 타일 배열 지문 (가져온 뒤 사용자가 고쳤는지) */
  const thash = a => { let x = 2166136261; for (const v of a) { x ^= v & 0xffff; x = Math.imul(x, 16777619) >>> 0; } return a.length + ':' + x.toString(16); };
  /** 슬롯 노드 id → 그 슬롯을 맡은 노드 (원작 층 노드를 바꿔 맡은 경우 그 노드) */
  const slotNode = id => PDM.store ? PDM.store.all('node').find(n => n.src && n.src.slotId === id && n.id !== id) || null : null;
  /** 손대지 않은 기본(새 프로젝트) 층 노드인가 — 키 순서와 상관없이 같은 값 */
  const deq = (a, b) => { if (a === b) return true; if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false; const ka = Object.keys(a).filter(k => a[k] !== undefined), kb = Object.keys(b).filter(k => b[k] !== undefined); return ka.length === kb.length && ka.every(k => deq(a[k], b[k])); };
  let DW = null, DWC = null; const tplNode = id => { DW = DW || PDM.World.defaultWorld(); return DW.data[id] || null; };
  const WD = () => { DW = DW || PDM.World.defaultWorld(); return DWC || (DWC = PDM.World.compute(DW.world, id => DW.data[id])); };
  const untouchedTemplate = n => { const t = n && tplNode(n.id); if (!t || (n.src && n.src.kind)) return false; const strip = o => { const c = JSON.parse(JSON.stringify(o)); delete c.format; delete c.version; return c; }; return deq(strip(n), strip(t)); };
  const imported = id => PDM.store && (PDM.store.has('node:' + id) || !!slotNode(id));
  const level = s => (maps().levels || {})[s.cls] || null;
  /** PDMaker 지형 표에 없는 값 → { 값: 저장소 상수 이름 } */
  function unknownTerrain(tiles) {
    const R = PDM.REPO_ANALYSIS, names = {}; Object.entries((R && R.objects.maps && R.objects.maps.terrain) || {}).forEach(([k, v]) => { (names[v] = names[v] || []).push(k); });
    const out = {}; new Set(tiles).forEach(v => { if (!PDM.TERRAIN_BY_ID[v]) out[v] = (names[v] || ['(이름 없음)']).join(' / '); });
    return out;
  }
  /** 가져오기 방식: 'handmade' (타일까지) | 'game' */
  const howOf = s => { const l = level(s); return l && l.generator === 'fixed' && l.layout.determined && l.layout.tiles && s.depth.length <= 1 ? 'handmade' : 'game'; };

  /** 11차: 맵 유형 · 편집 가능 범위 · 근거 (노드 src 와 목록 표시에 같이 씀)
   *  유형: fixed(모든 칸 확정) · partial(고정 맵인데 일부 문장을 못 읽음) · game-generated(코드가 만듦) · procedural(절차 생성) — 조건이 있으면 conditional 을 덧붙임 */
  const TYPE = { fixed: 'fixed', 'fixed-partial': 'partial', code: 'game-generated', procedural: 'procedural' };
  const TYPE_LABEL = { fixed: '고정', partial: '일부만 확정', 'game-generated': '게임 코드 생성', procedural: '절차 생성', conditional: '조건부', unknown: '알 수 없음' };
  function facts(s) {
    const l = level(s), M = maps(), how = howOf(s);
    const mapTypes = [TYPE[l ? l.generator : ''] || 'unknown'].concat(s.conds.length ? ['conditional'] : []);
    const evidence = [{ kind: 'Dungeon.newLevel()', file: M.file, line: s.line, text: `깊이 ${s.depth.join(', ') || '-'} · 갈래 ${s.branch}${s.conds.length ? ' · 조건 ' + s.conds.join(' 그리고 ') : ''} → new ${s.cls}()` }];
    if (l) evidence.push({ kind: '층 클래스', file: l.file, line: l.line, text: `${s.cls} extends ${l.parent || '?'} — ${GEN[l.generator] || l.generator}` });
    if (l && l.layout && l.layout.buildLine) evidence.push({ kind: 'build()', file: l.file, line: l.layout.buildLine, text: `해석한 문장 ${l.layout.ops || 0} · 못 한 문장 ${(l.layout.unresolved || []).length}` });
    return { mapTypes, editable: how === 'handmade' ? 'tiles' : 'meta', editableNote: how === 'handmade' ? '타일 · 이름 · 연결 편집 가능 (원본 지형 배치를 옮김)' : '이름 · 그룹 · 연결 · 깊이만 — 타일은 게임 코드가 만듦', evidence };
  }

  /** 목록 (그래프 옆 · 리소스 트리) */
  function list() {
    const M = maps(); if (!M) return [];
    return M.slots.map((s, i) => Object.assign({}, s, { i, level: level(s), ids: s.fallback ? [] : nodeIds(s, i), how: s.fallback ? '' : howOf(s) })).filter(s => !s.fallback);
  }

  /** 슬롯들 가져오기 (이미 있는 노드는 건너뜀) → 만든 노드 id 들. 1) 노드 데이터 2) 그래프(그룹 · 노드 자리 · 연결) 3) 노드마다 연결 기록 */
  function importSlots(slots, o) {
    o = o || {}; const store = PDM.store, P = prof(), M = maps(); if (!M) return [];
    const made = [], gid = 'repo_' + P.id, adopted = {};
    store.transaction('게임 저장소 맵 가져오기', () => {
      const w0 = store.get('world') || { nodes: [] }, baseY = Math.max(0, ...(w0.nodes || []).filter(n => n.group !== gid).map(n => n.y)) + 320;
      const place = [];
      // 1) 노드 데이터
      for (const s of slots) {
        const l = level(s), how = howOf(s);
        nodeIds(s, s.i).forEach((id, k) => {
          if (store.has('node:' + id) || slotNode(id)) return;
          const d = s.depth[k] != null ? s.depth[k] : null;
          const src = Object.assign({ kind: 'repo-level', profile: P.id, repo: P.label, cls: s.cls, file: l ? l.file : '', line: l ? l.line : 0, slotLine: s.line, generator: l ? l.generator : 'unknown', depths: s.depth.slice(), depth: d, branch: s.branch, conds: s.conds.slice(), boss: !!s.boss, links: [] }, facts(s));
          let nd;
          if (how === 'handmade') {
            const L = l.layout, unk = unknownTerrain(L.tiles);
            nd = PDM.make.node(id, 'handmade', { name: s.cls, depth: d > 0 ? d : 0, boss: !!s.boss });
            nd.size = { w: L.w, h: L.h }; nd.layers = Object.assign({}, nd.layers, { terrain: L.tiles.slice() });
            src.unknownTerrain = unk; src.buildLine = L.buildLine; src.tilesHash = thash(L.tiles); src.tilesFrom = 'build() 를 그대로 따라 그림 (setSize · Arrays.fill · Painter.fill · map[] =)';
            src.notes = ['지형 배치만 가져옴 — 원본의 그림 덧씌움(customTiles · customWalls) · 몬스터 · 아이템 · 이벤트는 게임 코드에 남음 (이 노드는 PDMaker 직접 그리기 맵으로 동작)'].concat(Object.keys(unk).length ? [`PDMaker 가 모르는 지형 값 ${Object.entries(unk).map(([v, n]) => v + ' = ' + n).join(', ')} 는 값 그대로 둠 (편집기에서 빈 칸처럼 보임)`] : []);
          } else {
            nd = PDM.make.node(id, 'procedural', { name: s.cls, depth: d > 0 ? d : 0, boss: !!s.boss });
            nd.mode = 'game'; nd.gameLevel = s.cls; delete nd.size; nd.layers = { terrain: [] };
            src.notes = [l && l.generator === 'fixed-partial' ? `고정 맵이지만 build() 의 ${l.layout.unresolved.length}개 문장을 해석하지 못해 타일을 확정하지 않음 — 게임이 만듦` : l && l.generator === 'code' ? 'build() 가 코드로 지도를 만듦 — 게임이 만듦' : '절차 생성 — 게임의 생성기가 만듦'];
          }
          src.slotId = id;
          const tid = (o.adopt || {})[id];
          if (tid && store.has('node:' + tid)) {
            // 11차: 원작 층 노드(손대지 않은 기본 노드)와 같은 자리를 이 저장소가 다른 층 클래스로 바꿈 (예: ARK 10층 NewPrisonBossLevel) → 그 노드를 이 층으로 (겹친 노드를 만들지 않음 · 원래 노드는 src.template 에)
            store.edit('node:' + tid, '원작 층 노드 → 게임 저장소의 층', n => { const tpl = JSON.parse(JSON.stringify(n)); Object.keys(n).forEach(key => delete n[key]); Object.assign(n, nd, { id: tid, name: tpl.name || nd.name, label: tpl.label || '' }); n.src = Object.assign(src, { adopted: true, template: tpl }); });
            adopted[id] = tid; made.push(tid); return;
          }
          nd.src = src;
          store.add('node:' + id, nd, '게임 저장소 맵');
          made.push(id); place.push({ id, d, branch: s.branch || 0, dup: dupIdx(s, s.i), cls: s.cls });
        });
      }
      // 2) 그래프: 그룹 · 노드 자리 · 연결
      const real = id => adopted[id] || (store.has('node:' + id) ? id : (slotNode(id) || {}).id || id);
      const all = list().filter(s => s.ids.some(id => store.has('node:' + real(id))));
      // 원작과 같은 층(기본 층 노드가 대신하는 것)은 지금 그래프에서 그 깊이 · 갈래에 있는 노드로 (예: ARK 로도스 1 → 깊이 1 = 하수도 1층 노드)
      const W0 = PDM.World.compute(store.get('world')), chainAt = (d, b) => Object.keys(W0.depth).find(id => W0.depth[id] === d && W0.branch[id] === b && !((store.get('node:' + id) || {}).src || {}).kind) || null;
      const nodeAt = (depth, branch) => { for (const s of all) { const k = s.depth.indexOf(depth); if (k >= 0 && s.branch === branch) return real(s.ids[k]); } return chainAt(depth, branch); };
      const linksOf = {};
      store.edit('world', '저장소 맵 그래프', w => {
        w.groups = w.groups || []; w.nodes = w.nodes || []; w.edges = w.edges || [];
        if (!w.groups.some(g => g.id === gid)) w.groups.push({ id: gid, name: `게임 저장소 맵 — ${P.label}`, theme: '', direction: '', color: PDM.GROUP_COLORS[w.groups.length % PDM.GROUP_COLORS.length], rooms: [], safe: false, note: `${P.label} 의 Dungeon.newLevel() 이 고르는 층 (프로파일 ${P.id})`, src: { kind: 'repo-group', profile: P.id } });
        const used = {};
        place.forEach(p => { const col = p.d == null ? 0 : p.d, row = p.branch * 2 + p.dup, k = col + ':' + row; used[k] = (used[k] || 0) + 1;
          w.nodes.push({ id: p.id, group: gid, x: 40 + col * 200, y: baseY + row * 150 + (used[k] - 1) * 40, src: { kind: 'repo-level', cls: p.cls } }); });
        const have = (a, b) => w.edges.some(e => e.from === a && e.to === b);
        let eid = 1; const nextId = () => { while (w.edges.some(e => e.id === 'ge' + eid)) eid++; return 'ge' + eid++; };
        for (const s of all) s.ids.forEach((slotId, k) => {
          const id = real(slotId);
          if (!made.includes(id) && !o.relink) return;
          const links = linksOf[id] = [];
          (s.level ? s.level.transitions : []).forEach(t => {
            const ok = typeof t.destDepth === 'number' && typeof t.destBranch === 'number', to = ok ? nodeAt(t.destDepth, t.destBranch) : null;
            links.push({ type: t.type, destDepth: t.destDepth, destBranch: t.destBranch, conds: t.conds, file: t.file, line: t.line, status: !ok ? 'unresolved' : to ? 'linked' : 'not-imported', to: to || '' });
            if (to && to !== id && !have(id, to)) w.edges.push({ id: nextId(), from: id, to, kind: 'stair', cond: '', weight: 100, label: '원본 ' + (t.type || '연결'), src: { kind: 'repo-transition', file: t.file, line: t.line, conds: t.conds } });
          });
          const d = s.depth[k];
          if (typeof d === 'number') { const nx = all.find(q => q.branch === s.branch && q.depth.includes(d + 1) && (JSON.stringify(q.conds) === JSON.stringify(s.conds) || !q.conds.length || !s.conds.length));
            const to = nx ? real(nx.ids[nx.depth.indexOf(d + 1)]) : null;
            if (to && store.has('node:' + to) && !have(id, to) && !links.some(x => x.to === to)) { w.edges.push({ id: nextId(), from: id, to, kind: 'main', cond: '', weight: 100, label: '추정', src: { kind: 'derived', note: 'Dungeon.newLevel() 의 깊이 순서 — 계단 위치 · 조건은 게임 코드' } }); links.push({ type: 'depth-order', status: 'derived', to }); } }
        });
      });
      // 3) 노드마다 연결 기록
      Object.entries(linksOf).forEach(([id, links]) => store.edit('node:' + id, '연결 기록', r => { r.src = r.src || {}; r.src.links = links; }));
    });
    return made;
  }

  /** 11차: 저장소 맵을 맵 그래프에 기본으로 — 계획 (store 를 바꾸지 않음)
   *   add: 그래프에 없는 원작에 없는 맵(슬롯 · 노드 id) · represented: 원작과 같은 층 클래스 → 프로젝트의 기본 층 노드가 그 층 / 사용자가 만든 같은 클래스 노드
   *   dismissed: 예전에 그래프에 넣었는데 사용자가 지운 것 (다시 넣지 않음) · upgrade: 예전(10차)에 가져온 노드에 유형 · 근거 기록이 없음
   *   missing: 이 저장소 프로파일로 가져왔는데 지금 저장소에 없는 노드 (확인 없이 지우지 않음) */
  function plan() {
    const M = maps(), store = PDM.store; if (!M || !store || !store.isOpen) return null;
    const P = prof(), w = store.get('world') || {}, seen = new Set(((w.repoMaps || {})[P.id] || {}).seen || []);
    const nodes = store.all('node'), out = { profile: P, add: [], represented: [], dismissed: [], present: [], upgrade: [], missing: [] }, W = PDM.World.compute(w);
    const want = new Set();
    for (const s of list()) {
      if (!s.extra) { out.represented.push({ s, by: 'chain', note: '원작과 같은 층 클래스 — 프로젝트의 기본 층 노드가 이 층' }); continue; }
      s.ids.forEach((id, k) => {
        want.add(id);
        const d = s.depth[k] != null ? s.depth[k] : null;
        const sn = !store.has('node:' + id) && slotNode(id); if (sn) { out.present.push({ s, id, adopted: sn.id }); return; }
        if (store.has('node:' + id)) { out.present.push({ s, id }); const n = store.get('node:' + id); if (!n.src || !n.src.mapTypes || (n.mode === 'handmade' && !n.src.tilesHash && sameTiles(s, n))) out.upgrade.push({ s, id }); return; }
        const same = nodes.find(n => n.id !== id && n.gameLevel === s.cls && (!(n.depth > 0) || d == null || n.depth === d));
        if (same) { out.represented.push({ s, id, by: same.id, note: `같은 층 클래스를 쓰는 노드 ${same.id} 가 있음 — 겹쳐 만들지 않음` }); return; }
        if (seen.has(id)) { out.dismissed.push({ s, id }); return; }
        // 원작 층 노드가 같은 자리(깊이 · 갈래)에 있고 손대지 않은 기본 노드면 그 노드를 이 층으로 바꿈 (조건 없는 슬롯만 — 예: ARK 보스 층 교체)
        // (기본 노드의 원래 자리 = 새 프로젝트 그래프에서의 자리도 같아야 함 — 사용자가 시작 노드를 바꿔 층이 밀렸으면 바꾸지 않음)
        const tid = d != null && !s.conds.length ? Object.keys(W.depth).find(x => W.depth[x] === d && W.branch[x] === s.branch && WD().depth[x] === d && WD().branch[x] === s.branch && untouchedTemplate(store.get('node:' + x))) : null;
        out.add.push(tid ? { s, id, adopt: tid } : { s, id });
      });
    }
    const S = M.start;
    if (S) { const sl = list().find(s => s.extra && s.depth.includes(S.depth) && s.branch === S.branch && !s.conds.length);
      const sid = sl ? sl.ids[sl.depth.indexOf(S.depth)] : null, ad = sid && out.add.find(x => x.id === sid && x.adopt), sn = sid && !store.has('node:' + sid) && slotNode(sid);
      const id = ad ? ad.adopt : sn ? sn.id : sid, rec = w.src && w.src.fields && w.src.fields.start;
      out.start = Object.assign({}, S, { id, slot: sl ? sl.cls : null, need: !!id && (w.start !== id || !rec) }); }
    for (const n of nodes) if (n.src && n.src.kind === 'repo-level' && n.src.profile === P.id && !want.has(n.src.slotId || n.id)) out.missing.push({ id: n.id, cls: n.src.cls, touched: n.mode === 'handmade' && !!n.src.tilesHash && thash((n.layers || {}).terrain || []) !== n.src.tilesHash });
    return out;
  }
  /** 계획 적용 — 한 번에 (중간에 실패하면 전부 되돌림 → 프로젝트는 그대로). opts.remove = 지울 노드 id (사용자가 확인한 것만) */
  function sync(opts) {
    opts = opts || {}; const store = PDM.store, pl = plan(); if (!pl) return null;
    const P = pl.profile, res = { added: [], upgraded: 0, removed: [], missing: pl.missing.length, represented: pl.represented.length, dismissed: pl.dismissed.length };
    const slots = []; pl.add.forEach(a => { if (!slots.includes(a.s)) slots.push(a.s); });
    const removeIds = (opts.remove || []).filter(id => pl.missing.some(m => m.id === id));
    if (!slots.length && !pl.upgrade.length && !removeIds.length && !(pl.start && pl.start.id && pl.start.need)) return res;
    const before = JSON.stringify(store.get('world') || null), had = new Set(store.keys());
    const snap = {}; [...pl.upgrade.map(u => u.id), ...removeIds].forEach(id => { if (store.has('node:' + id)) snap[id] = JSON.stringify(store.get('node:' + id)); });
    try {
      store.transaction('게임 저장소 맵을 맵 그래프에', () => {
        const adopt = {}; pl.add.forEach(a => { if (a.adopt) adopt[a.id] = a.adopt; });
        if (slots.length) { const m = importSlots(slots, { adopt }); res.added = m.filter(id => pl.add.some(a => a.id === id && !a.adopt)); res.adopted = m.filter(id => Object.values(adopt).includes(id)); }
        pl.upgrade.forEach(u => { if (store.edit('node:' + u.id, '맵 유형 · 근거', n => { n.src = Object.assign(n.src || {}, facts(u.s)); if (n.mode === 'handmade' && !n.src.tilesHash && sameTiles(u.s, n)) n.src.tilesHash = thash(n.layers.terrain); })) res.upgraded++; });
        // 11차: 새 게임 시작 자리 = 게임의 Dungeon.init() (ARK: 깊이 0 · 갈래 2 = 로도스 숙소). 원작 1층처럼 기본 층 노드가 대신하는 자리면 그대로 둠
        if (pl.start && pl.start.id) store.edit('world', '시작 노드 = 게임의 시작 자리', w => { const r = PDM.prov.sync(w, 'start', { value: pl.start.id, from: 'repo', file: pl.start.file, line: pl.start.line, note: pl.start.evidence }, { legacyDefault: cur => cur === 'n1' && store.has('node:n1') && !(store.get('node:n1').src || {}).kind }); res.start = r.action; });
        removeIds.forEach(id => { store.remove('node:' + id, '저장소에 없는 맵 지움'); res.removed.push(id); });
        store.edit('world', '저장소 맵 기록', w => {
          if (removeIds.length) { w.nodes = (w.nodes || []).filter(n => !removeIds.includes(n.id)); w.edges = (w.edges || []).filter(e => !removeIds.includes(e.from) && !removeIds.includes(e.to)); }
          w.repoMaps = w.repoMaps || {}; const r = w.repoMaps[P.id] = w.repoMaps[P.id] || { seen: [] };
          r.repo = P.label; r.seen = [...new Set(r.seen.concat(pl.add.map(a => a.id), pl.present.map(a => a.id)))].sort();
        });
      });
    } catch (e) {
      // 되돌림: 새로 더한 노드 지움 · 고친 노드 · 그래프를 전 상태로
      for (const k of store.keys()) if (!had.has(k) && k.startsWith('node:')) { try { store.remove(k, '되돌림'); } catch (_) { /* 무시 */ } }
      Object.entries(snap).forEach(([id, j]) => { try { if (store.has('node:' + id)) store.edit('node:' + id, '되돌림', n => { Object.keys(n).forEach(k => delete n[k]); Object.assign(n, JSON.parse(j)); }); else store.add('node:' + id, JSON.parse(j), '되돌림'); } catch (_) { /* 무시 */ } });
      try { if (before) store.edit('world', '되돌림', w => { Object.keys(w).forEach(k => delete w[k]); Object.assign(w, JSON.parse(before)); }); } catch (_) { /* 무시 */ }
      throw new Error('게임 저장소 맵을 맵 그래프에 넣다가 실패해 되돌렸습니다: ' + (e && e.message || e));
    }
    return res;
  }
  /** 프로젝트를 열 때 · 저장소를 바꿀 때 (분석이 성공했을 때만) — 더하기만, 지우지 않음 */
  function autoSync() {
    if (!maps()) return null;
    try { const r = sync({}); if (r && (r.added.length || (r.adopted || []).length || r.upgraded || r.start === 'set')) PDM.log(`게임 저장소의 맵을 맵 그래프에 넣었습니다 — 새 노드 ${r.added.length}` + ((r.adopted || []).length ? ` · 원작 층 노드를 이 저장소의 층으로 ${r.adopted.length} (${r.adopted.join(', ')})` : '') + (r.upgraded ? ` · 유형/근거 기록 ${r.upgraded}` : '') + (r.start === 'set' ? ` · 시작 노드 = 게임의 시작 자리 (${(PDM.store.get('world') || {}).start})` : r.start === 'keep-user' || r.start === 'conflict' ? ' · 시작 노드는 사용자가 정한 것 그대로 (게임의 시작 자리와 다름)' : '') + (r.missing ? ` · 저장소에 없는 노드 ${r.missing} (지우지 않음 — 리소스 › 게임 저장소의 맵에서 확인)` : ''), 'ok');
      else if (r && r.missing) PDM.log(`이 게임 저장소에 없는 맵 노드 ${r.missing}개 — 지우지 않았습니다 (리소스 › 게임 저장소의 맵 › 저장소에 없는 맵)`, 'warn');
      return r; } catch (e) { PDM.log(String(e.message || e), 'err'); return null; }
  }
  /** 저장소에 없는 맵 지우기 — 고른 것만 (창) */
  async function confirmMissing() {
    const pl = plan(); if (!pl || !pl.missing.length) { PDM.toast && PDM.toast('저장소에 없는 맵이 없습니다', 'ok'); return; }
    const checks = pl.missing.map(m => ({ m, cb: h('input', { type: 'checkbox', checked: false }) }));
    const body = h('div', { class: 'vstack gap-2', style: { minWidth: '520px' } }, h('p', { class: 'ra-note' }, `「${pl.profile.label}」 로 가져왔는데 지금 저장소의 Dungeon.newLevel() 에 없는 맵입니다. 지울 것만 고르세요 (기본: 지우지 않음).`),
      ...checks.map(({ m, cb }) => h('label', { class: 'flex gap-3' }, cb, h('span', { class: 'mono' }, `${m.id} — ${m.cls}${m.touched ? ' (타일을 고침)' : ''}`))));
    const r = await PDM.ui.modal('저장소에 없는 맵', body, [['취소', false], ['고른 것 지우기', () => true, 'danger']]);
    if (!r) return;
    const ids = checks.filter(c => c.cb.checked).map(c => c.m.id); if (!ids.length) return;
    const res = sync({ remove: ids }); PDM.log(`저장소에 없는 맵 ${res.removed.length}개를 지웠습니다`, 'ok');
  }

  /** 슬롯 자세히 (창) */
  async function details(s) {
    const l = s.level, M = maps();
    const rows = [['클래스', s.cls], ['원본', l ? `${l.file}:${l.line}` : '(층 클래스를 찾지 못함)'], ['고르는 곳', `${M.file}:${s.line} (Dungeon.newLevel)`], ['깊이 · 갈래', `${s.depth.join(', ') || '-'} · 갈래 ${s.branch}`],
      ['조건', s.conds.length ? s.conds.join(' 그리고 ') : '없음'], ['만드는 방식', l ? GEN[l.generator] || l.generator : '알 수 없음'], ['보스 층', s.boss ? '예 (bossLevel 깊이)' : '아니오'],
      ['맵 유형', facts(s).mapTypes.map(t => TYPE_LABEL[t] || t).join(' · ')],
      ['그래프 노드', s.extra ? (s.how === 'handmade' ? '직접 그리기 노드 — 원본 타일 그대로 · 타일 편집 가능' : '게임 원래 맵 노드 — 게임이 이 클래스로 만듦 · 타일 편집 불가') : '원작과 같은 층 클래스 — 프로젝트의 기본 층 노드가 이 층 (따로 만들지 않음)']];
    const body = h('div', { class: 'vstack gap-3', style: { minWidth: '620px', maxHeight: '70vh', overflow: 'auto' } },
      h('div', { class: 'kv' }, ...rows.flatMap(([k, v]) => [h('b', {}, k), h('span', { class: 'mono', style: { userSelect: 'text' } }, v)])),
      l && l.layout.w ? h('div', { class: 'ra-note' }, `레이아웃 ${l.layout.w}×${l.layout.h} · 해석한 문장 ${l.layout.ops} · 해석 못 한 문장 ${l.layout.unresolved.length}` + (l.layout.entrance != null ? ` · 입구 칸 ${l.layout.entrance}` : '') + (l.layout.exit != null ? ` · 출구 칸 ${l.layout.exit}` : '')) : null,
      l && l.layout.unresolved.length ? h('details', {}, h('summary', { class: 'pointer' }, `해석 못 한 문장 ${l.layout.unresolved.length}개 (그래서 타일을 확정하지 않음)`), ...l.layout.unresolved.map(u => h('div', { class: 'ra-note mono' }, `${u.line}: ${u.text}`))) : null,
      h('b', {}, `연결 (LevelTransition ${l ? l.transitions.length : 0}개)`),
      ...(l ? l.transitions : []).map(t => h('div', { class: 'ra-note mono' }, `${t.line}: ${t.type || '?'} → 깊이 ${t.destDepth ?? '(같은 층/코드)'} · 갈래 ${t.destBranch ?? '-'}${t.conds.length ? ' — 조건 ' + t.conds.join(' / ') : ''}`)),
      l && !l.transitions.length ? h('div', { class: 'ra-note' }, '이 클래스에는 연결이 적혀 있지 않습니다 — 게임 기본 계단 (위 · 아래 깊이)') : null);
    const btns = [['닫기', false]]; if (s.extra && !s.ids.every(imported)) btns.push(['맵 그래프에 다시 넣기', () => 'imp', 'pri']);
    if (l && l.file && PDM.showCodeFile) btns.unshift(['원본 코드', () => 'code']);
    const r = await PDM.ui.modal('게임 저장소 맵 — ' + s.cls, body, btns);
    if (r === 'imp') { const made = importSlots([s]); PDM.log(`맵 그래프에 넣었습니다: ${s.cls} (노드 ${made.length})`, 'ok'); PDM.tabs.open('world'); }
    if (r === 'code') { const jr = PDM.javaRel((PDM.GAME_SCAN || {}).repo).slice(-3).join('/') + '/', f = String(l.file).replace(/\\/g, '/'); PDM.showCodeFile(f.includes(jr) ? f.slice(f.indexOf(jr) + jr.length) : f.replace(/^.*?\/shatteredpixeldungeon\//, ''), s.cls); }
  }

  /** 리소스 트리 항목 (맵 아래) */
  function treeItem() {
    const L = list(); if (!L.length) return null;
    const extra = L.filter(s => s.extra), std = L.filter(s => !s.extra);
    const pl = plan(), miss = pl ? pl.missing : [];
    const item = s => ({ id: 'rm_' + s.i, label: `${s.cls} — ${s.depth.join(',') || '-'}층 · 갈래 ${s.branch} · ${facts(s).mapTypes.map(t => TYPE_LABEL[t] || t).join('·')}${!s.extra ? '' : s.ids.every(imported) ? ' ✓' : ' (그래프에 없음)'}`, icon: s.how === 'handmade' ? '▦' : s.level && s.level.generator === 'procedural' ? '⟳' : '⚙',
      run: () => details(s), menu: [{ label: '자세히…', run: () => details(s) }, { label: '맵 그래프에 다시 넣기', disabled: !s.extra || s.ids.every(imported), run: () => { importSlots([s]); PDM.tabs.open('world'); } }] });
    return { id: 'repomaps', label: `게임 저장소의 맵 (${prof().label})`, icon: '🗎', count: L.length,
      menu: [{ label: '저장소 맵 다시 맞추기 (새 맵만 더함)', run: () => { autoSync(); PDM.tabs.open('world'); } }, { label: `저장소에 없는 맵 ${miss.length}개 확인 · 지우기…`, disabled: !miss.length, run: confirmMissing }],
      children: [{ id: 'rm_extra', label: `원작에 없는 맵 (${extra.length}) — 맵 그래프에 기본으로`, icon: '＋', count: extra.length, children: extra.map(item) }, { id: 'rm_std', label: `원작과 같은 층 클래스 (${std.length}) — 기본 층 노드가 대신`, icon: '▤', count: std.length, children: std.map(item) }]
        .concat(miss.length ? [{ id: 'rm_missing', label: `저장소에 없는 맵 (${miss.length}) — 지우지 않음`, icon: '⚠', count: miss.length, run: confirmMissing, children: miss.map(m => ({ id: 'rm_m_' + m.id, label: `${m.id} — ${m.cls}`, icon: '⚠', run: () => PDM.tabs.open('node:' + m.id) })) }] : []) };
  }

  /** game 노드의 편집 화면 (타일 대신 정보) */
  function nodePage(key) {
    const nd = PDM.store.get(key), src = nd.src || {}, { section, F } = PDM.ui;
    const R = PDM.REPO_ANALYSIS, other = R && R.profile && src.profile && R.profile.id !== src.profile;
    const L = maps() && (maps().levels || {})[src.cls];
    return h('div', { class: 'page' },
      h('h1', {}, '⚙ ' + (nd.name || src.cls), h('span', { class: 'badge info ml-4' }, '게임 원래 맵'), h('span', { class: 'hint ml-4' }, nd.id)),
      h('div', { class: 'ra-note mb-3' }, `게임 저장소의 ${src.cls} 클래스가 이 층을 만듭니다 — 타일 편집 불가 · 이름 · 그룹 · 연결 · 깊이만 PDMaker 에서`),
      h('p', { class: 'lead' }, `게임 원래 맵 — 게임 저장소의 ${src.cls} 클래스가 이 층을 만듭니다. PDMaker 에서는 이름 · 그룹 · 연결 · 깊이만 정하고, 타일은 편집할 수 없습니다.`),
      other ? h('div', { class: 'box c-warn mb-5' }, `이 노드는 다른 게임 저장소(${src.repo || src.profile})에서 가져왔습니다. 지금 저장소에 ${src.cls} 가 ${L ? '있습니다' : '없습니다 — 게임에서는 테마 기본 생성기로 대신 만듦'}.`) : null,
      section('원본',
        h('div', { class: 'kv' }, ...[['클래스', src.cls], ['원본 파일', src.file ? `${src.file}:${src.line}` : '-'], ['만드는 방식', GEN[src.generator] || src.generator], ['원본 깊이 · 갈래', `${(src.depths || []).join(', ') || '-'} · ${src.branch}`],
          ['조건', (src.conds || []).length ? src.conds.join(' 그리고 ') : '없음'], ['맵 유형', (src.mapTypes || []).map(t => TYPE_LABEL[t] || t).join(' · ') || '(기록 없음)'], ['편집', src.editableNote || '-'],
          ['게임에서', isNative(nd) ? `원본 그대로 — 게임 코드가 깊이 ${src.depth} · 갈래 ${src.branch} 에 이 층을 만들고 계단도 원본 그대로` : PDM.World.originOf(nd) ? 'PDMaker 가 만듦 (타일 · 오브젝트 · 이벤트를 고침) — 원본 자리 그대로' : 'PDMaker 가 만듦 (깊이를 바꿈 — 그래프 연결로 자리 계산)'], ['가져온 저장소', `${src.repo || ''} (프로파일 ${src.profile || '?'})`]].flatMap(([k, v]) => [h('b', {}, k), h('span', { class: 'mono', style: { userSelect: 'text' } }, v)])),
        ...(src.notes || []).map(n => h('div', { class: 'ra-note' }, n)),
        ...(src.evidence || []).map(e => h('div', { class: 'ra-note mono' }, `근거 · ${e.kind} — ${e.file}:${e.line} — ${e.text}`))),
      section('PDMaker 설정', PDM.ui.row(F.text(key, ['name'], { label: '이름 (편집기 · 맵 그래프)' }), F.num(key, ['depth'], { label: '깊이 고정 (0 = 연결로 계산)', int: true, min: 0, max: 99 }), F.bool(key, ['boss'], { label: '보스 층 (표시용)' }))),
      section('연결 (원본에서 읽음)',
        ...((src.links || []).length ? src.links.map(x => h('div', { class: 'ra-note mono' }, `${x.status === 'linked' ? '✓ 연결됨' : x.status === 'derived' ? '추정' : x.status === 'not-imported' ? '도착 맵을 아직 안 가져옴' : '미확인 (도착지가 코드로 정해짐)'} · ${x.type}` + (x.destDepth != null ? ` → 깊이 ${x.destDepth} · 갈래 ${x.destBranch}` : '') + (x.to ? ` (${x.to})` : '') + (x.line ? ` · ${String(x.file || '').split('/').pop()}:${x.line}` : '')))
          : [h('div', { class: 'ra-note' }, '적힌 연결이 없습니다 — 게임 기본 계단')])));
  }

  PDM.repoMaps = { list, importSlots, details, treeItem, nodePage, GEN, howOf, plan, sync, autoSync, confirmMissing, facts, TYPE_LABEL, isNative, thash };
})();
