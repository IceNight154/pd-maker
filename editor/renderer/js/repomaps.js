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
  const imported = id => PDM.store && PDM.store.has('node:' + id);
  const level = s => (maps().levels || {})[s.cls] || null;
  /** PDMaker 지형 표에 없는 값 → { 값: 저장소 상수 이름 } */
  function unknownTerrain(tiles) {
    const R = PDM.REPO_ANALYSIS, names = {}; Object.entries((R && R.objects.maps && R.objects.maps.terrain) || {}).forEach(([k, v]) => { (names[v] = names[v] || []).push(k); });
    const out = {}; new Set(tiles).forEach(v => { if (!PDM.TERRAIN_BY_ID[v]) out[v] = (names[v] || ['(이름 없음)']).join(' / '); });
    return out;
  }
  /** 가져오기 방식: 'handmade' (타일까지) | 'game' */
  const howOf = s => { const l = level(s); return l && l.generator === 'fixed' && l.layout.determined && l.layout.tiles && s.depth.length <= 1 ? 'handmade' : 'game'; };

  /** 목록 (그래프 옆 · 리소스 트리) */
  function list() {
    const M = maps(); if (!M) return [];
    return M.slots.map((s, i) => Object.assign({}, s, { i, level: level(s), ids: s.fallback ? [] : nodeIds(s, i), how: s.fallback ? '' : howOf(s) })).filter(s => !s.fallback);
  }

  /** 슬롯들 가져오기 (이미 있는 노드는 건너뜀) → 만든 노드 id 들. 1) 노드 데이터 2) 그래프(그룹 · 노드 자리 · 연결) 3) 노드마다 연결 기록 */
  function importSlots(slots, o) {
    o = o || {}; const store = PDM.store, P = prof(), M = maps(); if (!M) return [];
    const made = [], gid = 'repo_' + P.id;
    store.transaction('게임 저장소 맵 가져오기', () => {
      const w0 = store.get('world') || { nodes: [] }, baseY = Math.max(0, ...(w0.nodes || []).filter(n => n.group !== gid).map(n => n.y)) + 320;
      const place = [];
      // 1) 노드 데이터
      for (const s of slots) {
        const l = level(s), how = howOf(s);
        nodeIds(s, s.i).forEach((id, k) => {
          if (store.has('node:' + id)) return;
          const d = s.depth[k] != null ? s.depth[k] : null;
          const src = { kind: 'repo-level', profile: P.id, repo: P.label, cls: s.cls, file: l ? l.file : '', line: l ? l.line : 0, slotLine: s.line, generator: l ? l.generator : 'unknown', depths: s.depth.slice(), depth: d, branch: s.branch, conds: s.conds.slice(), boss: !!s.boss, links: [] };
          let nd;
          if (how === 'handmade') {
            const L = l.layout, unk = unknownTerrain(L.tiles);
            nd = PDM.make.node(id, 'handmade', { name: s.cls, depth: d > 0 ? d : 0, boss: !!s.boss });
            nd.size = { w: L.w, h: L.h }; nd.layers = Object.assign({}, nd.layers, { terrain: L.tiles.slice() });
            src.unknownTerrain = unk; src.buildLine = L.buildLine; src.tilesFrom = 'build() 를 그대로 따라 그림 (setSize · Arrays.fill · Painter.fill · map[] =)';
            src.notes = ['지형 배치만 가져옴 — 원본의 그림 덧씌움(customTiles · customWalls) · 몬스터 · 아이템 · 이벤트는 게임 코드에 남음 (이 노드는 PDMaker 직접 그리기 맵으로 동작)'].concat(Object.keys(unk).length ? [`PDMaker 가 모르는 지형 값 ${Object.entries(unk).map(([v, n]) => v + ' = ' + n).join(', ')} 는 값 그대로 둠 (편집기에서 빈 칸처럼 보임)`] : []);
          } else {
            nd = PDM.make.node(id, 'procedural', { name: s.cls, depth: d > 0 ? d : 0, boss: !!s.boss });
            nd.mode = 'game'; nd.gameLevel = s.cls; delete nd.size; nd.layers = { terrain: [] };
            src.notes = [l && l.generator === 'fixed-partial' ? `고정 맵이지만 build() 의 ${l.layout.unresolved.length}개 문장을 해석하지 못해 타일을 확정하지 않음 — 게임이 만듦` : l && l.generator === 'code' ? 'build() 가 코드로 지도를 만듦 — 게임이 만듦' : '절차 생성 — 게임의 생성기가 만듦'];
          }
          nd.src = src;
          store.add('node:' + id, nd, '게임 저장소 맵');
          made.push(id); place.push({ id, d, branch: s.branch || 0, dup: dupIdx(s, s.i), cls: s.cls });
        });
      }
      // 2) 그래프: 그룹 · 노드 자리 · 연결
      const all = list().filter(s => s.ids.some(id => store.has('node:' + id)));
      const nodeAt = (depth, branch) => { for (const s of all) { const k = s.depth.indexOf(depth); if (k >= 0 && s.branch === branch) return s.ids[k]; } return null; };
      const linksOf = {};
      store.edit('world', '저장소 맵 그래프', w => {
        w.groups = w.groups || []; w.nodes = w.nodes || []; w.edges = w.edges || [];
        if (!w.groups.some(g => g.id === gid)) w.groups.push({ id: gid, name: `게임 저장소 맵 — ${P.label}`, theme: '', direction: '', color: PDM.GROUP_COLORS[w.groups.length % PDM.GROUP_COLORS.length], rooms: [], safe: false, note: `${P.label} 의 Dungeon.newLevel() 이 고르는 층 (프로파일 ${P.id})`, src: { kind: 'repo-group', profile: P.id } });
        const used = {};
        place.forEach(p => { const col = p.d == null ? 0 : p.d, row = p.branch * 2 + p.dup, k = col + ':' + row; used[k] = (used[k] || 0) + 1;
          w.nodes.push({ id: p.id, group: gid, x: 40 + col * 200, y: baseY + row * 150 + (used[k] - 1) * 40, src: { kind: 'repo-level', cls: p.cls } }); });
        const have = (a, b) => w.edges.some(e => e.from === a && e.to === b);
        let eid = 1; const nextId = () => { while (w.edges.some(e => e.id === 'ge' + eid)) eid++; return 'ge' + eid++; };
        for (const s of all) s.ids.forEach((id, k) => {
          if (!made.includes(id) && !o.relink) return;
          const links = linksOf[id] = [];
          (s.level ? s.level.transitions : []).forEach(t => {
            const ok = typeof t.destDepth === 'number' && typeof t.destBranch === 'number', to = ok ? nodeAt(t.destDepth, t.destBranch) : null;
            links.push({ type: t.type, destDepth: t.destDepth, destBranch: t.destBranch, conds: t.conds, file: t.file, line: t.line, status: !ok ? 'unresolved' : to ? 'linked' : 'not-imported', to: to || '' });
            if (to && to !== id && !have(id, to)) w.edges.push({ id: nextId(), from: id, to, kind: 'stair', cond: '', weight: 100, label: '원본 ' + (t.type || '연결'), src: { kind: 'repo-transition', file: t.file, line: t.line, conds: t.conds } });
          });
          const d = s.depth[k];
          if (typeof d === 'number') { const nx = all.find(q => q.branch === s.branch && q.depth.includes(d + 1) && (JSON.stringify(q.conds) === JSON.stringify(s.conds) || !q.conds.length || !s.conds.length));
            const to = nx ? nx.ids[nx.depth.indexOf(d + 1)] : null;
            if (to && store.has('node:' + to) && !have(id, to) && !links.some(x => x.to === to)) { w.edges.push({ id: nextId(), from: id, to, kind: 'main', cond: '', weight: 100, label: '추정', src: { kind: 'derived', note: 'Dungeon.newLevel() 의 깊이 순서 — 계단 위치 · 조건은 게임 코드' } }); links.push({ type: 'depth-order', status: 'derived', to }); } }
        });
      });
      // 3) 노드마다 연결 기록
      Object.entries(linksOf).forEach(([id, links]) => store.edit('node:' + id, '연결 기록', r => { r.src = r.src || {}; r.src.links = links; }));
    });
    return made;
  }

  /** 슬롯 자세히 (창) */
  async function details(s) {
    const l = s.level, M = maps();
    const rows = [['클래스', s.cls], ['원본', l ? `${l.file}:${l.line}` : '(층 클래스를 찾지 못함)'], ['고르는 곳', `${M.file}:${s.line} (Dungeon.newLevel)`], ['깊이 · 갈래', `${s.depth.join(', ') || '-'} · 갈래 ${s.branch}`],
      ['조건', s.conds.length ? s.conds.join(' 그리고 ') : '없음'], ['만드는 방식', l ? GEN[l.generator] || l.generator : '알 수 없음'], ['보스 층', s.boss ? '예 (bossLevel 깊이)' : '아니오'],
      ['가져오면', s.how === 'handmade' ? '직접 그리기 노드 — 원본 타일 그대로 · 타일 편집 가능' : '게임 원래 맵 노드 — 게임이 이 클래스로 만듦 · 타일 편집 불가']];
    const body = h('div', { class: 'vstack gap-3', style: { minWidth: '620px', maxHeight: '70vh', overflow: 'auto' } },
      h('div', { class: 'kv' }, ...rows.flatMap(([k, v]) => [h('b', {}, k), h('span', { class: 'mono', style: { userSelect: 'text' } }, v)])),
      l && l.layout.w ? h('div', { class: 'ra-note' }, `레이아웃 ${l.layout.w}×${l.layout.h} · 해석한 문장 ${l.layout.ops} · 해석 못 한 문장 ${l.layout.unresolved.length}` + (l.layout.entrance != null ? ` · 입구 칸 ${l.layout.entrance}` : '') + (l.layout.exit != null ? ` · 출구 칸 ${l.layout.exit}` : '')) : null,
      l && l.layout.unresolved.length ? h('details', {}, h('summary', { class: 'pointer' }, `해석 못 한 문장 ${l.layout.unresolved.length}개 (그래서 타일을 확정하지 않음)`), ...l.layout.unresolved.map(u => h('div', { class: 'ra-note mono' }, `${u.line}: ${u.text}`))) : null,
      h('b', {}, `연결 (LevelTransition ${l ? l.transitions.length : 0}개)`),
      ...(l ? l.transitions : []).map(t => h('div', { class: 'ra-note mono' }, `${t.line}: ${t.type || '?'} → 깊이 ${t.destDepth ?? '(같은 층/코드)'} · 갈래 ${t.destBranch ?? '-'}${t.conds.length ? ' — 조건 ' + t.conds.join(' / ') : ''}`)),
      l && !l.transitions.length ? h('div', { class: 'ra-note' }, '이 클래스에는 연결이 적혀 있지 않습니다 — 게임 기본 계단 (위 · 아래 깊이)') : null);
    const btns = [['닫기', false]]; if (!s.ids.every(imported)) btns.push(['맵 그래프에 가져오기', () => 'imp', 'pri']);
    if (l && l.file && PDM.showCodeFile) btns.unshift(['원본 코드', () => 'code']);
    const r = await PDM.ui.modal('게임 저장소 맵 — ' + s.cls, body, btns);
    if (r === 'imp') { const made = importSlots([s]); PDM.log(`맵 그래프에 가져왔습니다: ${s.cls} (노드 ${made.length})`, 'ok'); PDM.tabs.open('world'); }
    if (r === 'code') PDM.showCodeFile(l.file.replace(/^.*?\/shatteredpixeldungeon\//, ''), s.cls);
  }

  /** 리소스 트리 항목 (맵 아래) */
  function treeItem() {
    const L = list(); if (!L.length) return null;
    const extra = L.filter(s => s.extra), std = L.filter(s => !s.extra);
    const item = s => ({ id: 'rm_' + s.i, label: `${s.cls} — ${s.depth.join(',') || '-'}층 · 갈래 ${s.branch}${s.conds.length ? ' · 조건' : ''}${s.ids.every(imported) ? ' ✓' : ''}`, icon: s.how === 'handmade' ? '▦' : s.level && s.level.generator === 'procedural' ? '⟳' : '⚙',
      run: () => details(s), menu: [{ label: '자세히…', run: () => details(s) }, { label: '맵 그래프에 가져오기', disabled: s.ids.every(imported), run: () => { importSlots([s]); PDM.tabs.open('world'); } }] });
    return { id: 'repomaps', label: `게임 저장소의 맵 (${prof().label})`, icon: '🗎', count: L.length,
      menu: [{ label: `추가 맵 ${extra.length}개 모두 가져오기`, disabled: !extra.length, run: () => { const m = importSlots(extra); PDM.log(`게임 저장소의 추가 맵을 가져왔습니다 — 노드 ${m.length}`, 'ok'); PDM.tabs.open('world'); } }],
      children: [{ id: 'rm_extra', label: `원작에 없는 맵 (${extra.length})`, icon: '＋', count: extra.length, children: extra.map(item) }, { id: 'rm_std', label: `원작과 같은 층 클래스 (${std.length})`, icon: '▤', count: std.length, children: std.map(item) }] };
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
          ['조건', (src.conds || []).length ? src.conds.join(' 그리고 ') : '없음'], ['가져온 저장소', `${src.repo || ''} (프로파일 ${src.profile || '?'})`]].flatMap(([k, v]) => [h('b', {}, k), h('span', { class: 'mono', style: { userSelect: 'text' } }, v)])),
        ...(src.notes || []).map(n => h('div', { class: 'ra-note' }, n))),
      section('PDMaker 설정', PDM.ui.row(F.text(key, ['name'], { label: '이름 (편집기 · 맵 그래프)' }), F.num(key, ['depth'], { label: '깊이 고정 (0 = 연결로 계산)', int: true, min: 0, max: 99 }), F.bool(key, ['boss'], { label: '보스 층 (표시용)' }))),
      section('연결 (원본에서 읽음)',
        ...((src.links || []).length ? src.links.map(x => h('div', { class: 'ra-note mono' }, `${x.status === 'linked' ? '✓ 연결됨' : x.status === 'derived' ? '추정' : x.status === 'not-imported' ? '도착 맵을 아직 안 가져옴' : '미확인 (도착지가 코드로 정해짐)'} · ${x.type}` + (x.destDepth != null ? ` → 깊이 ${x.destDepth} · 갈래 ${x.destBranch}` : '') + (x.to ? ` (${x.to})` : '') + (x.line ? ` · ${String(x.file || '').split('/').pop()}:${x.line}` : '')))
          : [h('div', { class: 'ra-note' }, '적힌 연결이 없습니다 — 게임 기본 계단')])));
  }

  PDM.repoMaps = { list, importSlots, details, treeItem, nodePage, GEN, howOf };
})();
