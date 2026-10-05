// ================================================================
//  맵 그래프 편집기 — 그룹 · 노드 · 연결 (탭 키 'world')
//
//   조작
//    · 화면 이동: Space + 끌기 / 가운데 버튼 끌기 / 오른쪽 버튼 끌기     · 확대/축소: 휠
//    · 노드: 끌어서 이동 (Alt = 격자 무시), Shift+클릭 = 여러 개 선택, 빈 곳 끌기 = 사각형 선택
//    · 연결: 노드 가장자리 점(●, 네 면)을 다른 노드로 끌기.  Alt 를 누른 채 놓으면 샛길 계단으로
//    · 더블클릭: 노드 = 맵 열기, 그룹 제목 = 그룹 노드 한꺼번에 설정, 빈 곳 = 새 노드
//    · 오른쪽 클릭(끌지 않고): 메뉴 (새 노드 / 새 그룹 / 연결 / 삭제 …)
//    · 키: Delete 삭제 · Ctrl+D 복제 · Ctrl+A 전체 선택 · G 선택한 노드로 그룹 · F 전체 보기 · 방향키 조금 이동 · Esc 선택 해제
//   그룹 사각형은 속한 노드를 감싸도록 자동으로 커지고 줄어듭니다. 노드를 다른 그룹 안에 놓으면 그 그룹으로 옮겨집니다.
// ================================================================
(function () {
  const { h } = PDM;
  const store = PDM.store;
  const W_ = PDM.World;
  const NW = 170, NH = 150, GRID = 10, PAD = 22, HEAD = 56;
  const views = {};          // 프로젝트별 화면 위치 { x, y, z }
  let clip = null;           // 복사한 노드들
  let sel = { nodes: new Set(), edge: null, group: null };
  const EDGE_KINDS = { door: '통로 (연결마다 각자 출구·입구)', main: '갈림길 출구 (여러 개면 무작위 하나)', stair: '샛길 계단 (조건으로 계단이 생김)' };
  let spaceDown = false;

  const world = () => store.get('world');
  const wnode = id => (world().nodes || []).find(n => n.id === id);
  /** 그룹 음악: 테마 기본 음악을 그룹마다 따로 (탐험 곡 여러 개 · 긴장 · 보스) */
  function groupMusic(g, p) {
    const { F, row, section } = PDM.ui;
    const th = g.theme && !g.theme.startsWith('custom:') ? g.theme : '';
    const tm = PDM.THEME_MUSIC[th || 'SEWER'];
    const thName = th ? (PDM.THEMES[th] || {}).name : '깊이에 따른 테마';
    const def = `테마 기본: ${thName} — ${tm.tracks.join(' · ')} (무작위), 긴장 ${tm.tense}, 보스 ${tm.boss}`;
    return section('음악 (테마 기본 음악 대신)',
      h('p', { class: 'hint' }, def, '. 비워 둔 칸은 테마 기본을 씁니다. 노드마다 따로 정한 배경음이 가장 우선입니다.'),
      F.sound('world', [...p, 'bgm'], { label: '탐험 음악', kind: 'bgm', allowNone: true, empty: '(테마 기본)' }),
      h('div', { class: 'fl' }, '같이 돌려 틀 곡 (여러 곡이면 층마다 무작위 · 게임 곡끼리는 게임처럼 이어서 재생)'),
      PDM.ui.listEditor('world', [...p, 'bgmExtra'], { addLabel: '곡 추가', compact: true, make: () => '', render: (it, i, ip) => F.sound('world', ip, { kind: 'bgm', mini: true }) }),
      row(F.sound('world', [...p, 'bgmTense'], { label: '긴장 음악', kind: 'bgm', empty: '(없음)' }), F.cond('world', [...p, 'bgmTenseWhen'], { label: '긴장 음악 조건', hint: '예: switch.ghost_quest || var.danger>=3' })),
      F.sound('world', [...p, 'bgmBoss'], { label: '보스 층 음악 (노드의 "보스 층" 체크)', kind: 'bgm', empty: '(테마 기본 · 보스전 시작 시 게임이 바꿈)' }),
      h('button', { class: 'btn sm', onclick: () => store.edit('world', '테마 기본 음악 채우기', r => { const x = r.groups.find(q => q.id === g.id); x.bgm = PDM.themeMusicRef(tm.tracks[0]); x.bgmExtra = tm.tracks.slice(1).map(PDM.themeMusicRef); x.bgmTense = PDM.themeMusicRef(tm.tense); x.bgmBoss = PDM.themeMusicRef(tm.boss); }) }, '테마 기본 음악으로 채워서 고치기'));
  }
  function uniqueId(base) {
    let i = 1, id;
    do { id = base + (i++); } while (store.has('node:' + id) || wnode(id));
    return id;
  }
  const snap = (v, free) => free ? Math.round(v) : Math.round(v / GRID) * GRID;

  /** 그룹 사각형 (노드들을 감쌈). 노드가 없는 그룹은 저장된 위치에 빈 사각형 */
  function groupRect(g, pos) {
    const ns = (world().nodes || []).filter(n => n.group === g.id);
    if (!ns.length) return { x: g.x || 0, y: g.y || 0, w: 260, h: 200, empty: true };
    const P = id => (pos && pos[id]) || wnode(id);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    ns.forEach(n => { const p = P(n.id); x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x + NW); y1 = Math.max(y1, p.y + NH); });
    return { x: x0 - PAD, y: y0 - HEAD, w: x1 - x0 + PAD * 2, h: y1 - y0 + HEAD + PAD };
  }

  // ---------------- 편집 동작 ----------------
  /** mobs: true 몬스터 생김 · false 안 생김 (noMobs — 직접 그리기 맵은 spawn.enabled 도 맞춤) */
  function addNode(mode, x, y, groupId, mobs) {
    const id = uniqueId('n');
    store.transaction('노드 추가', () => {
      const nd = PDM.make.node(id, mode);
      if (mobs === false) nd.noMobs = true;
      if (mode === 'handmade') nd.spawn = Object.assign({ enabled: mobs !== false, mobs: [], initial: 3, max: 6, respawn: 50, minDist: 8 }, nd.spawn || {}, { enabled: mobs !== false });
      store.add('node:' + id, nd, '노드 추가');
      store.edit('world', '노드 추가', r => { r.nodes.push({ id, group: groupId || '', x: snap(x), y: snap(y) }); if (!r.start) r.start = id; });
    });
    sel = { nodes: new Set([id]), edge: null, group: null };
    return id;
  }
  /** 몬스터 스폰 여부를 물어보고 노드 추가 (취소하면 null) */
  async function addNodeAsk(mode, x, y, groupId) {
    const mobs = await PDM.askSpawn('새 노드 — 몬스터 스폰');
    if (mobs === null || mobs === undefined) return null;
    return addNode(mode, x, y, groupId, mobs);
  }
  function groupAt(x, y, exclude) {
    const gs = (world().groups || []).slice().reverse();
    return gs.find(g => { const r = groupRect(g); return x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h && (!exclude || !exclude(g)); });
  }
  function addGroup(x, y, nodeIds) {
    const n = (world().groups || []).length;
    const id = 'g' + Date.now().toString(36).slice(-5);
    store.edit('world', '그룹 추가', r => {
      r.groups.push({ id, name: `${n + 1}구역`, theme: '', direction: '', color: PDM.GROUP_COLORS[n % PDM.GROUP_COLORS.length], rooms: [], safe: false, note: '', x: snap(x), y: snap(y) });
      (nodeIds || []).forEach(nid => { const nn = r.nodes.find(q => q.id === nid); if (nn) nn.group = id; });
    });
    sel = { nodes: new Set(), edge: null, group: id };
  }
  async function deleteNodes(ids) {
    ids = [...ids]; if (!ids.length) return;
    const drawn = ids.filter(id => { const d = store.get('node:' + id); return d && (d.mode !== 'procedural' || (d.objects || []).length); });
    if (drawn.length && !(await PDM.ui.confirm(`노드 ${ids.length}개를 삭제할까요? (${drawn.map(id => W_.fullName(id)).join(', ')} 에는 그린 맵/오브젝트가 있습니다)`))) return;
    store.transaction('노드 삭제', () => {
      store.edit('world', '노드 삭제', r => {
        r.nodes = r.nodes.filter(n => !ids.includes(n.id));
        r.edges = r.edges.filter(e => !ids.includes(e.from) && !ids.includes(e.to));
        if (ids.includes(r.start)) r.start = (r.nodes[0] || {}).id || '';
      });
      ids.forEach(id => store.remove('node:' + id, '노드 삭제'));
    });
    sel = { nodes: new Set(), edge: null, group: null };
  }
  function duplicate(ids, dx = 30, dy = 30, fromClip) {
    const src = fromClip || ids.map(id => ({ pos: PDM.clone(wnode(id)), data: PDM.clone(store.get('node:' + id)) }));
    const map = {}; const made = [];
    store.transaction('노드 복제', () => {
      src.forEach(s => {
        const id = uniqueId('n'); map[s.pos.id] = id;
        const d = s.data; d.id = id;
        store.add('node:' + id, d, '노드 복제');
        made.push({ id, group: s.pos.group, x: snap(s.pos.x + dx), y: snap(s.pos.y + dy) });
      });
      store.edit('world', '노드 복제', r => {
        r.nodes.push(...made);
        // 복제한 노드들끼리의 연결도 같이
        const edges = fromClip ? (clip.edges || []) : r.edges.filter(e => map[e.from] && map[e.to]);
        edges.forEach(e => { if (map[e.from] && map[e.to]) r.edges.push(Object.assign({}, e, { id: 'e' + Math.random().toString(36).slice(2, 8), from: map[e.from], to: map[e.to] })); });
      });
    });
    sel = { nodes: new Set(made.map(m => m.id)), edge: null, group: null };
  }
  /** 연결 만들기 — 같은 두 노드 사이에도 여러 개 가능 (통로는 연결마다 다른 출구·입구를 씀) */
  // ---- 연결이 붙는 면 (마인드맵처럼 네 방향) : r 오른쪽 · l 왼쪽 · t 위 · b 아래. 비어 있으면 두 노드의 위치로 자동
  const SIDES = { '': '자동 (노드 위치에 맞춤)', r: '오른쪽', l: '왼쪽', t: '위', b: '아래' };
  const SIDE_N = { r: [1, 0], l: [-1, 0], t: [0, -1], b: [0, 1] }, OPP = { r: 'l', l: 'r', t: 'b', b: 't' };
  const sidePt = (p, sd, off) => sd === 'r' ? [p.x + NW, p.y + NH / 2 + off] : sd === 'l' ? [p.x, p.y + NH / 2 + off] : sd === 't' ? [p.x + NW / 2 + off, p.y] : [p.x + NW / 2 + off, p.y + NH];
  /** 두 노드 위치로 고른 면 [출발 면, 도착 면] */
  function autoSides(a, b) {
    const dx = (b.x - a.x) / NW, dy = (b.y - a.y) / NH;
    const s1 = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'r' : 'l') : (dy >= 0 ? 'b' : 't');
    return [s1, OPP[s1]];
  }
  /** 노드 안의 점(월드 좌표)에서 가장 가까운 면 */
  const nearSide = (p, x, y) => { const d = { l: x - p.x, r: p.x + NW - x, t: y - p.y, b: p.y + NH - y }; return Object.keys(d).sort((m, n) => d[m] - d[n])[0]; };
  function edgePath(e, a, b, off) {
    const au = autoSides(a, b), s1 = SIDE_N[e.fromSide] ? e.fromSide : au[0], s2 = SIDE_N[e.toSide] ? e.toSide : au[1];
    const [x1, y1] = sidePt(a, s1, off), [x2, y2] = sidePt(b, s2, off);
    const k = Math.max(40, Math.min(220, Math.hypot(x2 - x1, y2 - y1) * .45)), n1 = SIDE_N[s1], n2 = SIDE_N[s2];
    return { d: `M${x1},${y1} C${x1 + n1[0] * k},${y1 + n1[1] * k} ${x2 + n2[0] * k},${y2 + n2[1] * k} ${x2},${y2}`, x1, y1, x2, y2,
      mx: (x1 + x2) / 2 + (n1[0] + n2[0]) * k * .375, my: (y1 + y2) / 2 + (n1[1] + n2[1]) * k * .375 };
  }
  function connect(from, to, kind, sides) {
    if (from === to) return;
    kind = kind || 'door';
    const same = (world().edges || []).filter(e => e.from === from && e.to === to);
    const id = 'e' + Math.random().toString(36).slice(2, 8);
    const e = { id, from, to, kind, cond: '', weight: 100, label: '', place: 'exit', message: '' };
    if (kind === 'door') Object.assign(e, { exit: -1, entrance: -1 });
    if (sides) { if (sides[0]) e.fromSide = sides[0]; if (sides[1]) e.toSide = sides[1]; }
    store.edit('world', '노드 연결', r => { r.edges.push(e); });
    if (same.length) toast(`같은 두 노드 사이의 ${same.length + 1}번째 연결 — 출구·입구를 따로 씁니다`);
    sel = { nodes: new Set(), edge: id, group: null };
    PDM.tabs.refresh('world');
  }
  function autoLayout() {
    const I = W_.info();
    const gs = (world().groups || []).slice();
    const order = gs.map(g => ({ g, min: Math.min(...(world().nodes || []).filter(n => n.group === g.id).map(n => I.depth[n.id])) }))
      .sort((a, b) => (a.g.safe - b.g.safe) || (isFinite(a.min) ? a.min : 999) - (isFinite(b.min) ? b.min : 999));
    store.edit('world', '자동 정렬', r => {
      let y = 60;
      const lay = gid => {
        const ns = r.nodes.filter(n => (n.group || '') === gid);
        if (!ns.length) return;
        const minD = Math.min(...ns.map(n => I.depth[n.id]));
        const cols = {};
        ns.sort((a, b) => I.depth[a.id] - I.depth[b.id] || a.y - b.y || a.x - b.x).forEach(n => {
          const c = I.depth[n.id] - minD; cols[c] = (cols[c] || 0) + 1;
          n.x = 60 + c * (NW + 40); n.y = y + HEAD + (cols[c] - 1) * (NH + 30);
        });
        y += HEAD + Math.max(...Object.values(cols)) * (NH + 30) + 60;
      };
      order.forEach(o => lay(o.g.id));
      lay('');
    });
  }

  // ---------------- 편집기 ----------------
  PDM.registerEditor({
    id: 'world', icon: '🗺', title: () => '맵 그래프',
    match: k => k === 'world',
    watch: ck => ck === 'world' || ck === 'project' || ck.startsWith('node:') || ck.startsWith('room:'),
    watchStructure: k => /^(node|room):/.test(k),
    tree() {
      if (!store.isOpen || !world()) return [];
      const wd = world();
      const nodeItem = n => ({ id: 'n_' + n.id, label: W_.label(n.id) + ((store.get('node:' + n.id) || {}).name && !(W_.group(n.group) || {}).safe ? ' · ' + store.get('node:' + n.id).name : ''),
        icon: n.id === wd.start ? '★' : ({ handmade: '▦', hybrid: '▨' })[(store.get('node:' + n.id) || {}).mode] || ((store.get('node:' + n.id) || {}).boss ? '☠' : '▢'), open: 'node:' + n.id,
        menu: () => [{ label: '맵 열기', run: () => PDM.tabs.open('node:' + n.id) },
          { label: '이름 바꾸기…', run: async () => { const d = store.get('node:' + n.id) || {}; const v = await PDM.ui.prompt('맵 이름', d.name || ''); if (v != null) store.edit('node:' + n.id, '맵 이름', r => { r.name = v.trim(); }); } },
          { label: '시작 노드로 지정', disabled: n.id === wd.start, run: () => store.edit('world', '시작 노드', r => { r.start = n.id; }) },
          { label: '복제', run: () => duplicate([n.id]) },
          { label: '그래프에서 보기', run: () => { sel = { nodes: new Set([n.id]), edge: null, group: null }; PDM.tabs.open('world'); PDM.tabs.refresh('world'); } },
          '-', { label: '삭제', run: () => deleteNodes([n.id]) }] });
      const I = W_.info();
      const sortN = ns => ns.slice().sort((a, b) => I.depth[a.id] - I.depth[b.id] || a.y - b.y);
      const rooms = store.all('room');
      // ---- 방 템플릿: 분류(project.roomCats) · 순서(project.roomOrder) — 끌어 놓기로 옮김
      const proj = store.get('project') || {};
      const roomCats = proj.roomCats || [], rOrd = proj.roomOrder || [];
      const sortedRooms = rooms.map((r, i) => [r, rOrd.indexOf(r.id) < 0 ? 100000 + i : rOrd.indexOf(r.id)]).sort((a, b) => a[1] - b[1]).map(x => x[0]);
      const roomInto = (id, cat) => store.edit('room:' + id, '방 분류', r => { r.cat = cat; });
      const placeRoom = (id, targetId, pos) => store.transaction('방 옮기기', () => {
        const tg = store.get('room:' + targetId); if (!tg || id === targetId) return;
        store.edit('room:' + id, '방 분류', r => { r.cat = tg.cat || ''; });
        const ids = sortedRooms.map(r => r.id).filter(x => x !== id); const k = ids.indexOf(targetId);
        ids.splice(pos === 'before' ? k : k + 1, 0, id);
        store.edit('project', '방 순서', p => { p.roomOrder = ids; });
      });
      const newRoomCat = async () => {
        const n = (await PDM.ui.prompt('새 분류 이름', '', '예: 보물 방, 함정 방, 이벤트 방') || '').trim(); if (!n) return;
        if (roomCats.includes(n)) { toast('같은 이름의 분류가 있습니다', 'bad'); return; }
        store.edit('project', '방 분류 추가', p => { p.roomCats = [...(p.roomCats || []), n]; });
      };
      const renameRoomCat = async c => {
        const n = (await PDM.ui.prompt('분류 이름', c) || '').trim(); if (!n || n === c) return;
        if (roomCats.includes(n)) { toast('같은 이름의 분류가 있습니다', 'bad'); return; }
        store.transaction('방 분류 이름', () => {
          store.edit('project', '방 분류 이름', p => { p.roomCats = (p.roomCats || []).map(x => x === c ? n : x); });
          rooms.filter(r => r.cat === c).forEach(r => store.edit('room:' + r.id, '방 분류', o => { o.cat = n; }));
        });
      };
      const deleteRoomCat = c => store.transaction('방 분류 삭제', () => {
        store.edit('project', '방 분류 삭제', p => { p.roomCats = (p.roomCats || []).filter(x => x !== c); });
        rooms.filter(r => r.cat === c).forEach(r => store.edit('room:' + r.id, '방 분류', o => { o.cat = ''; }));
      });
      const moveRoomCat = (c, target, pos) => store.edit('project', '방 분류 순서', p => {
        const a = (p.roomCats || []).filter(x => x !== c); const k = a.indexOf(target); a.splice(pos === 'before' ? k : k + 1, 0, c); p.roomCats = a;
      });
      const roomItem = r => ({ id: 'r_' + r.id, label: `${r.name} (${r.id})`, icon: r.auto ? '⟳' : r.kind === 'special' ? '◈' : '▣', open: 'room:' + r.id,
        drag: { kind: 'room', id: r.id },
        canDrop: d => d.kind === 'room' && d.id !== r.id ? ['before', 'after'] : null,
        drop: (d, pos) => placeRoom(d.id, r.id, pos),
        actions: [{ label: r.auto ? '☑' : '☐', title: r.auto ? `자동 생성 켜짐 (${r.autoChance ?? 100}%) — 눌러서 끄기` : '자동 생성 꺼짐 — 눌러서 모든 자동 생성 맵에 넣기', run: () => store.edit('room:' + r.id, '자동 생성', o => { o.auto = !o.auto; if (o.autoChance == null) o.autoChance = 100; }) }],
        menu: [{ label: r.auto ? '자동 생성 끄기' : '자동 생성 켜기', run: () => store.edit('room:' + r.id, '자동 생성', o => { o.auto = !o.auto; if (o.autoChance == null) o.autoChance = 100; }) },
          ...roomCats.filter(c => c !== r.cat).map(c => ({ label: `분류로 옮기기: ${c}`, run: () => roomInto(r.id, c) })),
          r.cat ? { label: '분류에서 빼기', run: () => roomInto(r.id, '') } : null,
          '-', ...PDM.resOps.menu('room', r.id, [{ label: '쓰는 곳…', run: () => PDM.resOps.showUsage('room', r.id) }])].filter(Boolean) });
      return [{ id: 'map', label: '맵', icon: '🗺', order: 10, open: 'world',
        children: [
          ...(wd.groups || []).map(g => ({ id: 'grp_' + g.id, label: g.name, icon: g.safe ? '⌂' : '▣', count: (wd.nodes || []).filter(n => n.group === g.id).length,
            menu: () => [{ label: '노드 한꺼번에 설정…', run: () => PDM.nodeBulk((wd.nodes || []).filter(n => n.group === g.id).map(n => n.id), `그룹 「${g.name}」`) },
              { label: '이름 바꾸기…', run: async () => { const v = await PDM.ui.prompt('그룹 이름', g.name); if (v && v.trim()) store.edit('world', '그룹 이름', r => { r.groups.find(x => x.id === g.id).name = v.trim(); }); } },
              { label: '그래프에서 보기', run: () => { sel = { nodes: new Set(), edge: null, group: g.id }; PDM.tabs.open('world'); PDM.tabs.refresh('world'); } },
              '-', { label: '그룹 삭제 (노드는 남김)', run: async () => { if (await PDM.ui.confirm(`「${g.name}」 그룹을 삭제할까요? 노드는 그룹 없이 남습니다.`)) store.edit('world', '그룹 삭제', r => { r.groups = r.groups.filter(x => x.id !== g.id); r.nodes.forEach(x => { if (x.group === g.id) x.group = ''; }); }); } }],
            children: sortN((wd.nodes || []).filter(n => n.group === g.id)).map(nodeItem) })),
          ...sortN((wd.nodes || []).filter(n => !n.group || !W_.group(n.group))).map(nodeItem),
          { id: 'rooms', label: '방 템플릿', icon: '▣', count: rooms.length + (PDM.SPD_ROOMS || []).length,
            menu: [{ label: '새 방 템플릿…', run: PDM.mapUtil.newRoom }, { label: '새 분류…', run: newRoomCat }, { label: '방 미리보기 (모아 보기)…', run: PDM.mapUtil.showRoomGallery }],
            actions: [{ label: '＋', title: '새 분류', run: newRoomCat }, { label: '▦', title: '방 미리보기 (모아 보기)', run: PDM.mapUtil.showRoomGallery }],
            canDrop: d => d.kind === 'room' ? ['into'] : null, drop: d => roomInto(d.id, ''),
            children: [
              // 분류 (project.roomCats) — 방을 끌어다 놓으면 그 분류로
              ...roomCats.map(c => ({ id: 'rcat_' + c, label: c, icon: '▤', count: sortedRooms.filter(r => r.cat === c).length,
                drag: { kind: 'rcat', cat: c },
                canDrop: d => d.kind === 'room' ? ['into'] : d.kind === 'rcat' && d.cat !== c ? ['before', 'after'] : null,
                drop: (d, pos) => d.kind === 'room' ? roomInto(d.id, c) : moveRoomCat(d.cat, c, pos),
                menu: [{ label: '이름 바꾸기…', run: () => renameRoomCat(c) }, { label: '분류 삭제 (방은 남김)', run: () => deleteRoomCat(c) }],
                children: sortedRooms.filter(r => r.cat === c).map(roomItem) })),
              ...sortedRooms.filter(r => !r.cat || !roomCats.includes(r.cat)).map(roomItem),
              // 게임 기본 방 (levels/rooms 전체) — 누르면 정보 창
              { id: 'grooms', label: '게임 기본 방', icon: '▤', count: (PDM.SPD_ROOMS || []).length,
                children: PDM.mapUtil.gameRoomGroups().map(g => ({ id: 'grc_' + g.cat, label: g.name, icon: '▤', count: g.rooms.length,
                  children: g.rooms.map(r => ({ id: 'gr_' + r.id, label: r.added ? `${r.cls} ＋` : `${r.name} (${r.cls})`, icon: r.noUse ? '▫' : '▪', run: () => PDM.mapUtil.showGameRoom(r) })) })) }] }] }];
    },
    onActivate() { setTimeout(() => PDM.worldInspect && PDM.worldInspect(), 0); },
    render(key, ctx) {
      const wd = world();
      if (!wd) return h('div', { class: 'page' }, '맵 그래프가 없습니다');
      wd.groups = wd.groups || []; wd.nodes = wd.nodes || []; wd.edges = wd.edges || [];
      const vkey = store.root || '_';
      const view = views[vkey] = views[vkey] || null;
      const proj = store.get('project');
      const I = W_.info();

      // 선택 정리 (지워진 것)
      sel.nodes = new Set([...sel.nodes].filter(id => wnode(id)));
      if (sel.edge && !wd.edges.some(e => e.id === sel.edge)) sel.edge = null;
      if (sel.group && !W_.group(sel.group)) sel.group = null;

      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg'); svg.setAttribute('class', 'wg-svg');
      const canvas = h('div', { class: 'wg-canvas' });
      const vp = h('div', { class: 'wg-vp', tabindex: 0 }, canvas);
      canvas.append(svg);
      const nodeEls = {}, titleEls = {};
      let pos = {};          // 끌기 중 임시 위치
      const P = id => pos[id] || wnode(id);

      // ---- 그리기 ----
      function applyView() {
        canvas.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.z})`;
        vp.style.backgroundPosition = `${v.x}px ${v.y}px`;
        vp.style.backgroundSize = `${20 * v.z}px ${20 * v.z}px`;
        zoomLbl.textContent = Math.round(v.z * 100) + '%';
      }
      function drawSvg(extra) {
        while (svg.firstChild) svg.firstChild.remove();
        const el = (tag, attrs) => { const e = document.createElementNS(svgNS, tag); Object.entries(attrs).forEach(([k, val]) => e.setAttribute(k, val)); svg.append(e); return e; };
        // 그룹
        wd.groups.forEach(g => {
          const r = groupRect(g, pos);
          el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: 18, class: 'wg-grp' + (sel.group === g.id ? ' on' : '') + (g.safe ? ' safe' : ''), style: `stroke:${g.color || '#5fd6b4'}` });
          const t = titleEls[g.id];
          if (t) { t.style.left = r.x + 'px'; t.style.top = r.y + 'px'; t.style.width = r.w + 'px'; }
        });
        // 연결
        const mains = {}; wd.edges.forEach(e => { if ((e.kind || 'main') === 'main') mains[e.from] = (mains[e.from] || 0) + 1; });
        // 같은 두 노드 사이의 연결이 여럿이면 나란히 벌려 그림
        const pairN = {}, pairK = {};
        wd.edges.forEach(e => { const k = [e.from, e.to].sort().join('|'); pairK[e.id] = pairN[k] || 0; pairN[k] = (pairN[k] || 0) + 1; });
        wd.edges.forEach(e => {
          const a = P(e.from), b = P(e.to); if (!a || !b) return;
          const n = pairN[[e.from, e.to].sort().join('|')], off = n > 1 ? (pairK[e.id] - (n - 1) / 2) * Math.min(14, (NH - 10) / (n - 1)) : 0;
          const ep = edgePath(e, a, b, off), d = ep.d;
          const cls = 'wg-edge' + (e.kind === 'stair' ? ' stair' : '') + (e.kind === 'door' ? ' door' : '') + (e.cond ? ' cond' : '') + (sel.edge === e.id ? ' on' : '');
          const hit = el('path', { d, class: 'wg-hit' }); hit.dataset.edge = e.id;
          el('path', { d, class: cls, 'marker-end': 'url(#wgArrow)' });
          const tags = [];
          if (e.kind === 'stair') tags.push('샛길');
          if (e.kind === 'door' && (n > 1 || (e.exit ?? -1) >= 0 || (e.entrance ?? -1) >= 0)) tags.push(`출${(e.exit ?? -1) >= 0 ? e.exit + 1 : '·'}→입${(e.entrance ?? -1) >= 0 ? e.entrance + 1 : '·'}`);
          if ((e.kind || 'main') === 'main' && mains[e.from] > 1) tags.push(`${e.weight ?? 100}`);
          if (e.cond) tags.push('if ' + e.cond);
          if (e.label) tags.unshift(e.label);
          if (tags.length) {
            const mx = ep.mx, my = ep.my;
            const txt = el('text', { x: mx, y: my - 6, class: 'wg-etag' + (sel.edge === e.id ? ' on' : ''), 'text-anchor': 'middle' });
            txt.textContent = tags.join(' · ').slice(0, 40); txt.dataset.edge = e.id;
          }
        });
        if (extra) extra(el);
        const defs = document.createElementNS(svgNS, 'defs');
        defs.innerHTML = '<marker id="wgArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#5fd6b4"/></marker>';
        svg.prepend(defs);
      }
      function placeNodes() { Object.entries(nodeEls).forEach(([id, e]) => { const p = P(id); e.style.left = p.x + 'px'; e.style.top = p.y + 'px'; }); }

      // 그룹 제목
      wd.groups.forEach(g => {
        const t = h('div', { class: 'wg-gtitle', 'data-group': g.id }, h('span', {}, g.safe ? '⌂ ' + g.name : g.name));
        titleEls[g.id] = t; canvas.append(t);
      });
      // 노드 카드
      wd.nodes.forEach(n => {
        const d = store.get('node:' + n.id) || { id: n.id, mode: 'procedural' };
        const g = W_.group(n.group);
        const cv = h('canvas', { width: NW - 14, height: 84 });
        if (d.size) PDM.mapUtil.drawThumb(cv, d, 'node');
        const mode = PDM.FLOOR_MODES[d.mode] || { name: d.mode };
        const e = h('div', { class: 'wg-node' + (sel.nodes.has(n.id) ? ' on' : '') + (d.boss ? ' boss' : '') + (n.id === wd.start ? ' start' : ''), 'data-node': n.id, style: { borderColor: sel.nodes.has(n.id) ? '' : (g ? g.color + '66' : '') } },
          cv,
          h('div', { class: 'wg-nt' }, h('b', {}, (n.id === wd.start ? '★ ' : '') + W_.label(n.id)),
            h('span', { class: 'badge' + (d.mode === 'handmade' ? ' gold' : d.mode === 'hybrid' ? ' good' : '') }, mode.name)),
          h('div', { class: 'wg-ns' }, [d.name, PDM.mapUtil.themeName(W_.themeOf(n.id)), `깊이 ${I.depth[n.id]}`].filter(Boolean).join(' · ')),
          ...['r', 'l', 't', 'b'].map(sd => h('div', { class: 'wg-port out s-' + sd, 'data-port': n.id, 'data-side': sd, title: '끌어서 다른 노드와 연결 — 놓는 쪽 면에 붙음 (Shift = 갈림길 출구 · Alt = 샛길 계단)' })));
        nodeEls[n.id] = e; canvas.append(e);
      });
      placeNodes();

      // ---- 보기 ----
      const zoomLbl = h('span', { class: 'hint' });
      let v = view || null;
      function fit() {
        const r = vp.getBoundingClientRect();
        if (!wd.nodes.length || !r.width) { v = { x: 40, y: 40, z: 1 }; applyView(); return; }
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        wd.groups.forEach(g => { const q = groupRect(g); x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x + q.w); y1 = Math.max(y1, q.y + q.h); });
        wd.nodes.forEach(n => { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x + NW); y1 = Math.max(y1, n.y + NH); });
        const z = PDM.clamp(Math.min((r.width - 60) / (x1 - x0), (r.height - 60) / (y1 - y0)), 0.2, 1.4);
        v = { x: (r.width - (x1 - x0) * z) / 2 - x0 * z, y: (r.height - (y1 - y0) * z) / 2 - y0 * z, z };
        views[vkey] = v; applyView();
      }
      const toWorld = (cx, cy) => { const r = vp.getBoundingClientRect(); return { x: (cx - r.left - v.x) / v.z, y: (cy - r.top - v.y) / v.z }; };
      PDM.worldSelectEdge = eid => { if (!wd.edges.some(x => x.id === eid)) return; sel = { nodes: new Set(), edge: eid, group: null }; ctx.refresh(); };
      PDM.worldFocus = id => { const n = wnode(id); if (!n) return; const r = vp.getBoundingClientRect(); v.x = r.width / 2 - (n.x + NW / 2) * v.z; v.y = r.height / 2 - (n.y + NH / 2) * v.z; applyView(); sel = { nodes: new Set([id]), edge: null, group: null }; ctx.refresh(); };

      // ---- 마우스 ----
      let drag = null;      // { type: pan|move|connect|marquee|gmove, ... }
      let marqEl = null;
      vp.addEventListener('contextmenu', e => e.preventDefault());
      vp.style.touchAction = 'none';   // 태블릿 펜 · 터치로 끌 때 브라우저가 화면 스크롤로 가져가지 않게
      vp.addEventListener('pointerdown', e => {
        vp.focus();
        const t = e.target;
        const nodeEl = t.closest('.wg-node'), port = t.closest('.wg-port.out'), title = t.closest('.wg-gtitle');
        const edgeId = t.dataset && t.dataset.edge;
        if (e.button === 1 || (e.button === 0 && spaceDown) || e.button === 2) {
          drag = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y, moved: false, right: e.button === 2, target: t };
          vp.classList.add('panning'); e.preventDefault(); return;
        }
        if (e.button !== 0) return;
        const wpt = toWorld(e.clientX, e.clientY);
        if (port) { drag = { type: 'connect', from: port.dataset.port, side: port.dataset.side || 'r', x: wpt.x, y: wpt.y }; e.preventDefault(); return; }
        if (nodeEl) {
          const id = nodeEl.dataset.node;
          if (e.shiftKey || e.ctrlKey) { sel.nodes.has(id) ? sel.nodes.delete(id) : sel.nodes.add(id); }
          else if (!sel.nodes.has(id)) sel.nodes = new Set([id]);
          sel.edge = null; sel.group = null;
          markSel();
          drag = { type: 'move', sx: wpt.x, sy: wpt.y, ids: [...sel.nodes], moved: false };
          e.preventDefault(); return;
        }
        if (title) {
          const gid = title.dataset.group;
          sel = { nodes: new Set(wd.nodes.filter(n => n.group === gid).map(n => n.id)), edge: null, group: gid };
          markSel(); inspect();
          drag = { type: 'move', sx: wpt.x, sy: wpt.y, ids: [...sel.nodes], moved: false, group: gid, gx: W_.group(gid).x || 0, gy: W_.group(gid).y || 0 };
          e.preventDefault(); return;
        }
        if (edgeId) { sel = { nodes: new Set(), edge: edgeId, group: null }; markSel(); drawSvg(); inspect(); return; }
        // 빈 곳: 사각형 선택
        if (!e.shiftKey) { sel = { nodes: new Set(), edge: null, group: null }; markSel(); drawSvg(); inspect(); }
        drag = { type: 'marquee', x0: wpt.x, y0: wpt.y, base: new Set(sel.nodes) };
      });
      const onMove = e => {
        if (!drag) return;
        if (drag.type === 'pan') {
          const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
          if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
          v.x = drag.vx + dx; v.y = drag.vy + dy; applyView(); return;
        }
        const wpt = toWorld(e.clientX, e.clientY);
        if (drag.type === 'move') {
          const dx = wpt.x - drag.sx, dy = wpt.y - drag.sy;
          if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 3 / v.z) return;
          drag.moved = true;
          pos = {};
          drag.ids.forEach(id => { const n = wnode(id); pos[id] = { x: snap(n.x + dx, e.altKey), y: snap(n.y + dy, e.altKey) }; });
          if (drag.group && !drag.ids.length) { const g = W_.group(drag.group); g.x = snap(drag.gx + dx); g.y = snap(drag.gy + dy); }
          placeNodes();
          // 다른 그룹 위에 놓일지 표시
          drag.target = null;
          if (!drag.group) {
            const c = pos[drag.ids[0]]; const own = wnode(drag.ids[0]).group;
            const g = groupAt(c.x + NW / 2, c.y + NH / 2, g2 => g2.id === own);
            drag.target = g ? g.id : null;
          }
          drawSvg(el => { if (drag.target) { const r = groupRect(W_.group(drag.target)); el('rect', { x: r.x - 4, y: r.y - 4, width: r.w + 8, height: r.h + 8, rx: 22, class: 'wg-drop' }); } });
        } else if (drag.type === 'connect') {
          drag.x = wpt.x; drag.y = wpt.y;
          const a = P(drag.from);
          drawSvg(el => el('path', { d: `M${sidePt(a, drag.side, 0).join(',')} L${wpt.x},${wpt.y}`, class: 'wg-edge temp' + (e.altKey ? ' stair' : '') }));
        } else if (drag.type === 'marquee') {
          const x = Math.min(drag.x0, wpt.x), y = Math.min(drag.y0, wpt.y), w = Math.abs(wpt.x - drag.x0), hh = Math.abs(wpt.y - drag.y0);
          if (!marqEl) { marqEl = h('div', { class: 'wg-marq' }); canvas.append(marqEl); }
          Object.assign(marqEl.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: hh + 'px' });
          sel.nodes = new Set(drag.base);
          wd.nodes.forEach(n => { if (n.x + NW > x && n.x < x + w && n.y + NH > y && n.y < y + hh) sel.nodes.add(n.id); });
          markSel();
        }
      };
      const onUp = e => {
        if (!drag) return;
        const d = drag; drag = null;
        vp.classList.remove('panning');
        if (d.type === 'pan') {
          views[vkey] = v;
          if (d.right && !d.moved) contextMenu(e, d.target);
          return;
        }
        if (d.type === 'move') {
          if (!d.moved) { inspect(); return; }
          const moved = pos; pos = {};
          if (d.group && !d.ids.length) { const g = W_.group(d.group); const nx = g.x, ny = g.y; g.x = d.gx; g.y = d.gy; store.edit('world', '그룹 이동', r => { const x = r.groups.find(q => q.id === d.group); x.x = nx; x.y = ny; }); return; }
          store.edit('world', d.group ? '그룹 이동' : '노드 이동', r => {
            Object.entries(moved).forEach(([id, p]) => { const n = r.nodes.find(q => q.id === id); if (n) { n.x = p.x; n.y = p.y; if (d.target) n.group = d.target; } });
          });
          if (d.target) toast(`「${W_.group(d.target).name}」 그룹으로 옮겼습니다`);
          return;
        }
        if (d.type === 'connect') {
          const tEl = document.elementFromPoint(e.clientX, e.clientY);
          const nodeEl = tEl && tEl.closest && tEl.closest('.wg-node');
          if (nodeEl && nodeEl.dataset.node !== d.from) { const tp = toWorld(e.clientX, e.clientY); connect(d.from, nodeEl.dataset.node, e.altKey ? 'stair' : e.shiftKey ? 'main' : 'door', [d.side, nearSide(P(nodeEl.dataset.node), tp.x, tp.y)]); }
          else if (!nodeEl) {
            // 빈 곳에 놓으면: 새 노드를 만들고 바로 연결
            const g = wnode(d.from).group;
            const kindE = e.altKey ? 'stair' : e.shiftKey ? 'main' : 'door', from = d.from;
            const sd = d.side, np = sd === 'l' ? [d.x - NW, d.y - NH / 2] : sd === 't' ? [d.x - NW / 2, d.y - NH] : sd === 'b' ? [d.x - NW / 2, d.y] : [d.x, d.y - NH / 2];
            addNodeAsk('procedural', np[0], np[1], g).then(id => { if (id) connect(from, id, kindE, [sd, OPP[sd]]); else drawSvg(); });
          } else drawSvg();
          return;
        }
        if (d.type === 'marquee') { if (marqEl) { marqEl.remove(); marqEl = null; } inspect(); }
      };
      vp.addEventListener('wheel', e => {
        e.preventDefault();
        const r = vp.getBoundingClientRect();
        const cx = e.clientX - r.left, cy = e.clientY - r.top;
        const nz = PDM.clamp(v.z * Math.pow(1.0015, -e.deltaY), 0.15, 2.5);
        v.x = cx - (cx - v.x) * nz / v.z; v.y = cy - (cy - v.y) * nz / v.z; v.z = nz;
        views[vkey] = v; applyView();
      }, { passive: false });
      vp.addEventListener('dblclick', e => {
        const nodeEl = e.target.closest('.wg-node');
        if (nodeEl) { PDM.tabs.open('node:' + nodeEl.dataset.node); return; }
        if (e.target.closest('.wg-gtitle')) { bulkGroup(e.target.closest('.wg-gtitle').dataset.group); return; }
        const p = toWorld(e.clientX, e.clientY);
        const g = groupAt(p.x, p.y);
        addNodeAsk('procedural', p.x - NW / 2, p.y - NH / 2, g && g.id);
      });
      // Ctrl+C / Ctrl+V (공용 단축키 — app.js 가 지금 탭의 ctx.copy/paste 를 부름): 고른 노드 + 그 사이 연결
      ctx.copy = () => {
        const ids = [...sel.nodes]; if (!ids.length) return false;
        clip = { nodes: ids.map(id => ({ pos: PDM.clone(wnode(id)), data: PDM.clone(store.get('node:' + id)) })), edges: wd.edges.filter(x => sel.nodes.has(x.from) && sel.nodes.has(x.to)).map(x => PDM.clone(x)) };
        PDM.clip.set('nodes', clip, `노드 ${ids.length}개`);
      };
      ctx.paste = c => {
        if (c.kind !== 'nodes' || !c.payload || !(c.payload.nodes || []).length) return false;
        clip = c.payload; duplicate([], 60, 60, clip.nodes.map(x => ({ pos: PDM.clone(x.pos), data: PDM.clone(x.data) })));
      };
      const onKey = e => {
        if (PDM.tabs.active !== key || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
        if (e.code === 'Space') { if (!spaceDown) { spaceDown = true; vp.classList.add('grab'); } e.preventDefault(); return; }
        if (e.type !== 'keydown') return;
        const ids = [...sel.nodes];
        if ((e.key === 'Delete' || e.key === 'Backspace')) {
          e.preventDefault();
          if (sel.edge) { const id = sel.edge; sel.edge = null; store.edit('world', '연결 삭제', r => { r.edges = r.edges.filter(x => x.id !== id); }); }
          else if (ids.length) deleteNodes(ids);
        } else if (e.ctrlKey && e.key.toLowerCase() === 'd') { e.preventDefault(); if (ids.length) duplicate(ids); }
        else if (e.ctrlKey && e.key.toLowerCase() === 'a') { e.preventDefault(); sel = { nodes: new Set(wd.nodes.map(n => n.id)), edge: null, group: null }; markSel(); inspect(); }
        else if (!e.ctrlKey && e.key.toLowerCase() === 'f') fit();
        else if (e.key === 'Enter' && !ids.length && !sel.edge && !sel.group) { e.preventDefault(); fit(); }   // 아무것도 고르지 않았을 때 Enter = 화면에 꽉 차게
        else if (!e.ctrlKey && e.key.toLowerCase() === 'g' && ids.length) { const r0 = Math.min(...ids.map(id => wnode(id).x)); addGroup(r0, Math.min(...ids.map(id => wnode(id).y)), ids); }
        else if (e.key === 'Escape') { sel = { nodes: new Set(), edge: null, group: null }; markSel(); drawSvg(); inspect(); }
        else if (e.key.startsWith('Arrow') && ids.length) {
          e.preventDefault();
          const st = e.shiftKey ? 50 : GRID, dx = e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0, dy = e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0;
          store.edit('world', '노드 이동', r => ids.forEach(id => { const n = r.nodes.find(q => q.id === id); n.x += dx; n.y += dy; }));
        }
      };
      const onKeyUp = e => { if (e.code === 'Space') { spaceDown = false; vp.classList.remove('grab'); } };
      addEventListener('pointermove', onMove); addEventListener('pointerup', onUp);
      addEventListener('keydown', onKey); addEventListener('keyup', onKeyUp);
      ctx.onDispose(() => { removeEventListener('pointermove', onMove); removeEventListener('pointerup', onUp); removeEventListener('keydown', onKey); removeEventListener('keyup', onKeyUp); });

      function markSel() {
        Object.entries(nodeEls).forEach(([id, e]) => e.classList.toggle('on', sel.nodes.has(id)));
        Object.entries(titleEls).forEach(([id, e]) => e.classList.toggle('on', sel.group === id));
      }

      // ---- 메뉴 ----
      /** 그룹의 노드 설정을 한꺼번에 바꾸기 · 추가 (editors/nodebulk.js) */
      function bulkGroup(gid) {
        const g = W_.group(gid); if (!g) return;
        PDM.nodeBulk(wd.nodes.filter(n => n.group === gid).map(n => n.id), `그룹 「${g.name}」`);
      }
      async function renameGroup(gid) {
        const g = W_.group(gid); const n = await PDM.ui.prompt('그룹 이름', g.name); if (!n) return;
        store.edit('world', '그룹 이름', r => { r.groups.find(x => x.id === gid).name = n; });
      }
      function contextMenu(e, t) {
        const p = toWorld(e.clientX, e.clientY);
        const nodeEl = t.closest && t.closest('.wg-node'), title = t.closest && t.closest('.wg-gtitle'), edgeId = t.dataset && t.dataset.edge;
        if (nodeEl) {
          const id = nodeEl.dataset.node;
          if (!sel.nodes.has(id)) { sel = { nodes: new Set([id]), edge: null, group: null }; markSel(); inspect(); }
          const ids = [...sel.nodes];
          PDM.ui.menu(e.clientX, e.clientY, [
            { label: '맵 열기', hint: '더블클릭', run: () => PDM.tabs.open('node:' + id) },
            { label: '시작 노드로 지정', run: () => store.edit('world', '시작 노드', r => { r.start = id; }) },
            { label: '복제', hint: 'Ctrl+D', run: () => duplicate(ids) },
            ids.length > 1 ? { label: `노드 ${ids.length}개 한꺼번에 설정…`, run: () => PDM.nodeBulk(ids, `선택한 노드 ${ids.length}개`) } : null,
            '-',
            ...wd.groups.map(g => ({ label: `그룹으로 옮기기: ${g.name}`, run: () => store.edit('world', '그룹 바꾸기', r => ids.forEach(x => { r.nodes.find(q => q.id === x).group = g.id; })) })),
            { label: '선택한 노드로 새 그룹', hint: 'G', run: () => addGroup(wnode(id).x, wnode(id).y, ids) },
            { label: '그룹에서 빼기', run: () => store.edit('world', '그룹에서 빼기', r => ids.forEach(x => { r.nodes.find(q => q.id === x).group = ''; })) },
            '-',
            { label: '나가는 연결 모두 끊기', run: () => store.edit('world', '연결 끊기', r => { r.edges = r.edges.filter(x => !ids.includes(x.from)); }) },
            { label: '삭제', hint: 'Delete', run: () => deleteNodes(ids) }].filter(Boolean));
          return;
        }
        if (title) {
          const gid = title.dataset.group, g = W_.group(gid);
          PDM.ui.menu(e.clientX, e.clientY, [
            { label: '노드 한꺼번에 설정…', hint: '더블클릭', run: () => bulkGroup(gid) },
            { label: '이름 바꾸기…', run: () => renameGroup(gid) },
            { label: g.safe ? '던전 맵으로 표시' : '던전 밖(마을 등)으로 표시', run: () => store.edit('world', '그룹 종류', r => { const x = r.groups.find(q => q.id === gid); x.safe = !x.safe; }) },
            { label: '이 그룹에 노드 추가', run: () => { const r = groupRect(g); addNodeAsk('procedural', r.x + r.w + 20, r.y + HEAD, gid); } },
            '-',
            { label: '그룹 삭제 (노드는 남김)', run: () => store.edit('world', '그룹 삭제', r => { r.groups = r.groups.filter(x => x.id !== gid); r.nodes.forEach(n => { if (n.group === gid) n.group = ''; }); }) },
            { label: '그룹과 노드 모두 삭제', run: () => deleteNodes(wd.nodes.filter(n => n.group === gid).map(n => n.id)).then(() => store.edit('world', '그룹 삭제', r => { r.groups = r.groups.filter(x => x.id !== gid); })) }]);
          return;
        }
        if (edgeId) {
          const ed = wd.edges.find(x => x.id === edgeId);
          sel = { nodes: new Set(), edge: edgeId, group: null }; markSel(); drawSvg(); inspect();
          PDM.ui.menu(e.clientX, e.clientY, [
            ...Object.entries(EDGE_KINDS).filter(([k]) => k !== (ed.kind || 'main')).map(([k, t]) => ({ label: t.split(' (')[0] + '(으)로 바꾸기', run: () => store.edit('world', '연결 종류', r => { const x = r.edges.find(q => q.id === edgeId); x.kind = k; if (k === 'door') { x.exit = x.exit ?? -1; x.entrance = x.entrance ?? -1; } }) })),
            { label: '같은 방향으로 통로 하나 더', run: () => connect(ed.from, ed.to, 'door') },
            { label: '방향 뒤집기', run: () => store.edit('world', '연결 뒤집기', r => { const x = r.edges.find(q => q.id === edgeId); [x.from, x.to] = [x.to, x.from]; [x.exit, x.entrance] = [x.entrance, x.exit]; [x.fromSide, x.toSide] = [x.toSide, x.fromSide]; }) },
            { label: '삭제', hint: 'Delete', run: () => store.edit('world', '연결 삭제', r => { r.edges = r.edges.filter(x => x.id !== edgeId); }) }]);
          return;
        }
        const g = groupAt(p.x, p.y);
        PDM.ui.menu(e.clientX, e.clientY, [
          { label: '새 노드: 자동 생성', hint: '더블클릭', run: () => addNodeAsk('procedural', p.x - NW / 2, p.y - NH / 2, g && g.id) },
          { label: '새 노드: 직접 그리기', run: () => addNodeAsk('handmade', p.x - NW / 2, p.y - NH / 2, g && g.id) },
          { label: '새 노드: 혼합 (자동 생성 + 직접 그린 방)', run: () => addNodeAsk('hybrid', p.x - NW / 2, p.y - NH / 2, g && g.id) },
          '-',
          { label: sel.nodes.size ? `선택한 노드 ${sel.nodes.size}개로 새 그룹` : '새 그룹 (빈 그룹)', run: () => addGroup(p.x, p.y, [...sel.nodes]) },
          clip ? { label: `붙여넣기 (노드 ${clip.nodes.length}개)`, hint: 'Ctrl+V', run: () => { const o = clip.nodes[0].pos; duplicate([], p.x - o.x, p.y - o.y, clip.nodes.map(c => ({ pos: PDM.clone(c.pos), data: PDM.clone(c.data) }))); } } : null,
          '-',
          { label: '전체 보기', hint: 'F · Enter', run: fit },
          { label: '자동 정렬 (깊이별 열)', run: autoLayout }].filter(Boolean));
      }

      // ---- 인스펙터 ----
      function inspect() {
        const { F, section, row } = PDM.ui;
        const ids = [...sel.nodes];
        if (sel.edge) {
          const i = wd.edges.findIndex(x => x.id === sel.edge); const ed = wd.edges[i]; const p = ['edges', i];
          const kind = ed.kind || 'main';
          const mains = wd.edges.filter(x => x.from === ed.from && (x.kind || 'main') === 'main');
          const siblings = wd.edges.filter(x => x.from === ed.from && x.to === ed.to);
          const portSelect = (nodeId, field, exit) => {
            const P_ = W_.ports(nodeId), nd = store.get('node:' + nodeId) || {};
            const list = exit ? P_.exits : P_.entrances, W = (nd.size || {}).w || 1;
            if (!P_.hand) return h('div', { class: 'field' }, h('span', { class: 'fl' }, exit ? '출발 쪽 출구' : '도착 쪽 입구'),
              h('div', { class: 'hint' }, `${W_.fullName(nodeId)} 은(는) ${nd.mode === 'hybrid' ? '혼합' : '자동 생성'} 맵 — ${exit ? '첫 통로는 원래 출구, 나머지는 출구 근처에' : '첫 통로는 원래 입구(되돌아가는 연결이 없을 때), 나머지는 입구 근처에'} 계단을 새로 놓습니다.`));
            const opts = [[-1, `자동 (${exit ? '남은 출구' : '남은 입구'} 차례로 · 모자라면 새 계단)`]];
            list.forEach(t => {
              const mine = t.edge && t.edge.id === ed.id;
              const who = mine ? ' ← 이 연결' : t.what === 'door' ? ` — 통로 → ${W_.fullName(exit ? t.edge.to : t.edge.from)}` : t.what === 'main' ? ' — 출구 연결' : t.what === 'back' ? ' — 되돌아가기' : t.what === 'stair' ? ' — 샛길' : t.what === 'legacy' ? (exit ? '' : ' — 기본 입구') : ' — 안 씀';
              opts.push([t.i, `${exit ? '출구' : '입구'} ${t.i + 1} (${t.cell % W}, ${Math.floor(t.cell / W)})${who}`]);
            });
            const cur = list.find(t => t.edge && t.edge.id === ed.id);
            const extra = (exit ? P_.extraOut : P_.extraIn).some(x => x.id === ed.id);
            return F.select('world', [...p, field], opts, { label: exit ? `출발 쪽 출구 (${W_.fullName(nodeId)})` : `도착 쪽 입구 (${W_.fullName(nodeId)})`, number: true,
              hint: cur ? `지금: ${exit ? '출구' : '입구'} ${cur.i + 1} 번 타일` : extra ? `타일이 모자라 ${exit ? '출구' : '입구'} 근처에 계단을 새로 놓습니다 (맵 편집기에서 ${exit ? '출구(>)' : '입구(<)'} 타일을 더 그리면 그것을 씀)` : '' });
          };
          PDM.inspector.show('연결', h('div', {},
            h('p', {}, h('b', {}, W_.fullName(ed.from)), ' → ', h('b', {}, W_.fullName(ed.to)), siblings.length > 1 ? h('span', { class: 'badge', style: { marginLeft: '6px' } }, `같은 방향 ${siblings.findIndex(x => x.id === ed.id) + 1}/${siblings.length}`) : null),
            (() => { const sel2 = h('select', {}, h('option', { value: 'ab', selected: true }, `${W_.fullName(ed.from)} → ${W_.fullName(ed.to)}`), h('option', { value: 'ba' }, `${W_.fullName(ed.to)} → ${W_.fullName(ed.from)}`));
              sel2.onchange = () => { if (sel2.value === 'ba') store.edit('world', '연결 방향', r => { const x = r.edges[i]; [x.from, x.to] = [x.to, x.from]; [x.exit, x.entrance] = [x.entrance, x.exit]; [x.fromSide, x.toSide] = [x.toSide, x.fromSide]; }); };
              return PDM.ui.field('방향 (화살표 쪽으로 넘어감)', sel2); })(),
            row(F.select('world', [...p, 'fromSide'], SIDES, { label: '출발 노드에서 붙는 면' }), F.select('world', [...p, 'toSide'], SIDES, { label: '도착 노드에서 붙는 면' })),
            F.select('world', [...p, 'kind'], EDGE_KINDS, { label: '종류', onchange: v => { if (v === 'door') store.edit('world', '연결 종류', r => { const x = r.edges[i]; x.exit = x.exit ?? -1; x.entrance = x.entrance ?? -1; }, { silent: true }); } }),
            kind === 'door' ? h('div', {},
              h('p', { class: 'hint' }, '통로: 출발 노드의 출구 하나와 도착 노드의 입구 하나가 짝이 됩니다. 이 출구로 가면 짝 입구에 도착하고, 그 입구로 돌아가면 이 출구로 돌아옵니다. 같은 두 노드 사이에 통로를 여러 개 만들 수 있고, 통로마다 다른 출구·입구를 씁니다.'),
              portSelect(ed.from, 'exit', true), portSelect(ed.to, 'entrance', false)) : null,
            F.cond('world', [...p, 'cond'], { label: '조건 (트리거)', hint: kind === 'stair' ? '만족하면 계단이 생깁니다 (들어올 때마다 다시 검사). 예: switch.ember_seal' : kind === 'door' ? '만족할 때만 이 출구로 갈 수 있습니다 (전에는 계단 그림만 있고 막힘). 비우면 항상' : '만족하는 출구 연결들 중에서 고릅니다. 비우면 항상' }),
            kind === 'main' ? F.num('world', [...p, 'weight'], { label: `무게 (갈림길 출구가 ${mains.length}개일 때 확률)`, int: true, min: 0, hint: '아이작처럼 여러 출구 중 하나를 무작위로 — 이 맵을 처음 만들 때 한 번 정하고 저장. 모두 한 출구 타일(첫 번째 남은 출구)을 씁니다.' }) : null,
            kind !== 'main' ? row(F.select('world', [...p, 'place'], { exit: '출구 근처', entrance: '입구 근처', random: '아무 방', xy: '좌표 (직접 그린 맵)' }, { label: kind === 'door' ? '새 계단 위치 (출구 타일이 모자랄 때)' : '계단 위치', rerender: true }),
              ed.place === 'xy' ? F.num('world', [...p, 'at', 'x'], { label: 'x', int: true }) : null, ed.place === 'xy' ? F.num('world', [...p, 'at', 'y'], { label: 'y', int: true }) : null) : null,
            kind !== 'main' ? F.text('world', [...p, 'message'], { label: '계단이 생길 때 문구 (선택)' }) : null,
            F.text('world', [...p, 'label'], { label: '메모 (그래프에 표시)' }),
            h('div', { style: { display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' } },
              h('button', { class: 'btn sm', onclick: () => connect(ed.from, ed.to, 'door') }, '＋ 같은 방향 통로 하나 더'),
              h('button', { class: 'btn sm', onclick: () => store.edit('world', '연결 뒤집기', r => { const x = r.edges[i]; [x.from, x.to] = [x.to, x.from]; [x.exit, x.entrance] = [x.entrance, x.exit]; [x.fromSide, x.toSide] = [x.toSide, x.fromSide]; }) }, '방향 뒤집기'),
              h('button', { class: 'btn sm', onclick: () => PDM.tabs.open('node:' + ed.from) }, '출발 맵 열기'),
              h('button', { class: 'btn sm', onclick: () => PDM.tabs.open('node:' + ed.to) }, '도착 맵 열기'),
              h('button', { class: 'btn sm danger', onclick: () => { sel.edge = null; store.edit('world', '연결 삭제', r => { r.edges.splice(i, 1); }); } }, '삭제')),
            h('p', { class: 'hint' }, '노드의 네 면에 있는 점을 끌어 연결 (끌기 시작한 면 → 놓은 면에 붙음): 그냥 = 통로 · Shift = 갈림길 출구 · Alt = 샛길. 직접 그린 맵의 출구(>)·입구(<) 타일 번호는 맵 편집기에 표시됩니다.')));
          return;
        }
        if (sel.group && ids.length !== 1) {
          const gi = wd.groups.findIndex(x => x.id === sel.group); const g = wd.groups[gi]; const p = ['groups', gi];
          PDM.inspector.show('그룹: ' + g.name, h('div', {},
            h('button', { class: 'btn sm pri', style: { marginBottom: '8px' }, title: '그룹 제목 더블클릭', onclick: () => bulkGroup(g.id) }, `노드 ${wd.nodes.filter(n => n.group === g.id).length}개 한꺼번에 설정…`),
            F.text('world', [...p, 'name'], { label: '이름' }),
            PDM.filters ? PDM.filters.field('world', [...p, 'filter'], '화면 필터 (이 그룹의 모든 맵)', '(없음)') : null,
            row(F.ref('world', [...p, 'theme'], 'theme', { label: '테마', empty: '(깊이 기본)' }),
              F.select('world', [...p, 'direction'], { down: '▼ 내려가기', up: '▲ 올라가기' }, { label: '진행 방향', empty: `(프로젝트: ${proj.direction === 'up' ? '▲' : '▼'})` })),
            row(h('div', { class: 'field' }, h('span', { class: 'fl' }, '색'), (() => { const c = h('input', { type: 'color', value: g.color || '#5fd6b4' }); c.addEventListener('change', () => PDM.ui.commit('world', [...p, 'color'], c.value, '그룹 색')); return c; })()),
              F.bool('world', [...p, 'safe'], { label: '던전 밖 (마을 등: 층 번호 대신 이름, 데일리 이벤트 없음)' })),
            groupMusic(g, p),
            section('구성 블럭 (이 그룹의 자동 생성 노드 전체)', h('div', { class: 'hint' }, '블럭을 쌓아 층의 구성을 정합니다. 노드에 따로 블럭을 쌓으면 그 노드는 자기 것을 씁니다.'), PDM.mapUtil.blockListEditor('world', [...p, 'blocks'], { theme: g.theme || 'SEWER' })),
            section('이 그룹의 자동 생성 노드마다 추가할 방', PDM.mapUtil.roomListEditor('world', [...p, 'rooms'])),
            F.textarea('world', [...p, 'note'], { label: '메모', rows: 2 }),
            h('p', { class: 'hint' }, `노드 ${wd.nodes.filter(n => n.group === g.id).length}개. 제목을 끌면 그룹째 움직입니다.`)));
          return;
        }
        if (ids.length === 1) {
          const id = ids[0], d = store.get('node:' + id), k = 'node:' + id, wi = wd.nodes.findIndex(n => n.id === id);
          PDM.inspector.show(W_.fullName(id), h('div', {},
            h('div', { style: { display: 'flex', gap: '6px', marginBottom: '8px' } },
              h('button', { class: 'btn sm pri', onclick: () => PDM.tabs.open(k) }, '맵 열기'),
              id !== wd.start ? h('button', { class: 'btn sm', onclick: () => store.edit('world', '시작 노드', r => { r.start = id; }) }, '★ 시작 노드로') : h('span', { class: 'badge good' }, '★ 시작 노드')),
            F.text(k, ['name'], { label: '맵 이름' }),
            row(F.select(k, ['mode'], Object.fromEntries(Object.entries(PDM.FLOOR_MODES).map(([m, x]) => [m, x.name])), { label: '생성 방식', onchange: m => { if (m !== 'procedural') store.edit(k, '타일 준비', r => { const t = PDM.make.node(id, m); if (!r.layers || !r.layers.terrain || r.layers.terrain.length !== r.size.w * r.size.h || !r.layers.terrain.length) { r.size = t.size; r.layers = t.layers; } }, { silent: true }); } }),
              F.select('world', ['nodes', wi, 'group'], wd.groups.map(g => [g.id, g.name]), { label: '그룹', empty: '(없음)' })),
            row(F.text(k, ['label'], { label: '층 표시', placeholder: W_.label(id) }), F.num(k, ['depth'], { label: '난이도 깊이 (0=자동)', int: true, min: 0, max: 30, hint: `지금 ${I.depth[id]}` })),
            row(F.ref(k, ['theme'], 'theme', { label: '테마', empty: '(그룹 테마)' }), F.bool(k, ['boss'], { label: '보스 층' })),
            (() => { const on = d.mode === 'handmade' ? !!(d.spawn || {}).enabled : !d.noMobs;
              const cb = h('input', { type: 'checkbox', checked: on, onchange: () => store.edit(k, '몬스터 스폰', r => { r.noMobs = !cb.checked; if (r.mode === 'handmade') r.spawn = Object.assign({ mobs: [], initial: 3, max: 6, respawn: 50, minDist: 8 }, r.spawn || {}, { enabled: cb.checked }); }) });
              return h('label', { class: 'check', title: '끄면 이 맵에는 몬스터가 놓이지도 다시 생기지도 않습니다 (직접 놓은 몬스터·NPC 는 그대로)' }, cb, '몬스터 스폰 (몬스터가 생기고 다시 생김)'); })(),
            F.sound(k, ['bgm'], { label: '배경음', kind: 'bgm', allowNone: true, empty: `(그룹 설정${(W_.group((wnode(id) || {}).group) || {}).bgm ? ': ' + PDM.audio.label(W_.group(wnode(id).group).bgm) : ' — 게임 기본'})` }),
            h('p', { class: 'hint' }, `게임 안 번호: depth ${I.depth[id]} · branch ${I.branch[id]}${I.reached[id] === undefined && id !== wd.start ? ' · 시작 노드에서 닿지 않음 (이벤트 "맵 이동"이나 입구 목적지로만 갈 수 있음)' : ''}`),
            h('p', { class: 'hint' }, '연결: 노드 가장자리의 점(네 면)을 다른 노드로 끌기 — 놓은 쪽 면에 붙습니다. 빈 곳에 놓으면 새 노드가 생기며 이어집니다.')));
          return;
        }
        if (ids.length > 1) {
          PDM.inspector.show(`노드 ${ids.length}개`, h('div', {},
            h('button', { class: 'btn sm', onclick: () => addGroup(Math.min(...ids.map(id => wnode(id).x)), Math.min(...ids.map(id => wnode(id).y)), ids) }, '이 노드들로 새 그룹 (G)'), ' ',
            h('button', { class: 'btn sm', onclick: () => duplicate(ids) }, '복제 (Ctrl+D)'), ' ',
            h('button', { class: 'btn sm pri', onclick: () => PDM.nodeBulk(ids, `선택한 노드 ${ids.length}개`) }, '한꺼번에 설정…'), ' ',
            h('button', { class: 'btn sm danger', onclick: () => deleteNodes(ids) }, '삭제'),
            PDM.ui.field('그룹 한꺼번에 바꾸기', (() => { const s2 = h('select', { onchange: () => store.edit('world', '그룹 바꾸기', r => ids.forEach(x => { r.nodes.find(q => q.id === x).group = s2.value; })) },
              h('option', { value: '' }, '(없음)'), wd.groups.map(g => h('option', { value: g.id }, g.name))); s2.value = ''; return s2; })())));
          return;
        }
        // 아무것도 선택 안 함: 월드 설정
        PDM.inspector.show('맵 그래프', h('div', {},
          h('p', { class: 'hint' }, '노드 = 맵 한 개, 선 = 계단 연결, 사각형 = 그룹(구역). 게임 안 난이도 깊이는 시작 노드에서의 거리로 자동 계산됩니다.'),
          h('div', { class: 'kv' },
            h('b', {}, '화면 이동'), h('span', {}, 'Space+끌기 · 가운데/오른쪽 버튼 끌기 · 휠 확대'),
            h('b', {}, '노드'), h('span', {}, '끌기 이동 · Shift 여러 개 · 빈 곳 끌기 사각형 선택'),
            h('b', {}, '연결'), h('span', {}, '가장자리 점 → 다른 노드 (Alt = 샛길)'),
            h('b', {}, '만들기'), h('span', {}, '빈 곳 더블클릭 · 오른쪽 클릭 메뉴'),
            h('b', {}, '키'), h('span', {}, 'Del · Ctrl+D/C/V/A · G 그룹 · F 전체 · 방향키')),
          section('사용자 테마',
            h('p', { class: 'hint' }, '기본 타일셋을 복사해서 고친 나만의 테마입니다. 그룹/노드 테마에서 고를 수 있습니다.'),
            PDM.ui.listEditor('world', ['customThemes'], {
              addLabel: '테마 추가', compact: true,
              make: () => ({ id: PDM.uid('theme'), name: '새 테마', base: 'SEWER', tiles: '', water: '', music: '' }),
              render: (it, i, p) => h('div', {},
                row(F.text('world', [...p, 'id'], { label: 'id', transform: val => PDM.slugId(val) }), F.text('world', [...p, 'name'], { label: '이름' }),
                  F.select('world', [...p, 'base'], Object.fromEntries(Object.entries(PDM.THEMES).map(([kk, t]) => [kk, t.name])), { label: '바탕 테마' })),
                F.sound('world', [...p, 'music'], { label: '음악 (그룹·노드 배경음이 없을 때)', kind: 'bgm' }),
                row(F.select('world', [...p, 'lightMode'], { add: '발광 (더하기)', screen: '스크린', overlay: '오버레이', dodge: '닷지 (색상 닷지)' }, { label: '✨ 타일 효과 레이어 합성 방식', def: 'add' }),
                  F.num('world', [...p, 'lightBloom'], { label: '번짐 반경 (px · 한 칸 = 16, 0 = 없음)', int: true, min: 0, max: 48, def: 0, hint: '은은하게 퍼지는 빛 — 이웃 타일 위로도 퍼짐' }),
                  F.num('world', [...p, 'lightBloomPower'], { label: '번짐 세기 (%)', int: true, min: 0, max: 300, def: 100 }),
                  F.num('world', [...p, 'lightPower'], { label: '효과 레이어 세기 (%)', int: true, min: 0, max: 300, def: 100 }),
                  F.num('world', [...p, 'lightPulse'], { label: '깜빡임 주기 (초, 0 = 일정)', min: 0, step: 0.1, def: 0 }),
                  F.num('world', [...p, 'lightPulseMin'], { label: '깜빡일 때 가장 어두운 세기 (%)', int: true, min: 0, max: 100, def: 40 })),
                h('div', { class: 'hint' }, '타일 효과 레이어: "타일셋 편집"의 레이어 줄에서 "✨ 효과 레이어"로 바꿔 빛낼 타일(용암 · 수정 · 이끼 …) 위에 칠하면, 게임에서 그 타일 종류 전체가 빛납니다 (타일셋과 같은 이름의 _light.png).'),
                row(F.image('world', [...p, 'tiles'], { label: '타일셋 PNG (256×256)', sub: 'tiles' }),
                  h('div', { class: 'field' }, h('span', { class: 'fl' }, ' '), h('button', { class: 'btn sm', onclick: async () => {
                    let rel = it.tiles;
                    if (!rel) {
                      rel = `assets/tiles/${it.id}.png`;
                      try { await pdm.copy(PDM.assets.resolvePath('game:' + PDM.THEMES[it.base || 'SEWER'].tiles), store.abs(rel)); } catch (err) { toast('기본 타일셋 복사 실패: ' + err.message, 'bad'); return; }
                      store.edit('world', '타일셋 경로', r => { PDM.deepSet(r, [...p, 'tiles'], rel); });
                    }
                    const out = await PDM.editPixelsModal('타일셋 편집 — ' + it.name, rel, 256, 256, 16, null, { tilePreview: it.base || 'SEWER', light: { bloom: it.lightBloom || 0, unit: 1, onBloom: v => store.edit('world', '타일 효과 레이어 번짐', w => { const x = (w.customThemes || []).find(t => t.id === it.id); if (x) x.lightBloom = v; }, { silent: true }), mode: it.lightMode || 'add', onMode: m => store.edit('world', '타일 효과 레이어 합성 방식', w => { const x = (w.customThemes || []).find(t => t.id === it.id); if (x) x.lightMode = m; }, { silent: true }) } });
                    if (out && out !== rel) store.edit('world', '타일셋 경로', r => { PDM.deepSet(r, [...p, 'tiles'], out); });   // 다른 이름으로 저장
                    if (out) { PDM.assets.clear(); PDM.tabs.refresh(); }
                  } }, '타일셋 편집…'))))
            })),
          section('방 템플릿',
            h('p', { class: 'hint' }, '자동 생성 노드에 끼워 넣을 직접 그린 방. 그룹이나 노드 속성의 "추가 방"에서 고릅니다.'),
            ...store.all('room').map(r => h('div', {}, h('a', { href: '#', onclick: ev => { ev.preventDefault(); PDM.tabs.open('room:' + r.id); } }, `▣ ${r.name}`), h('span', { class: 'hint' }, `  ${r.size.w}×${r.size.h} · 쓰는 곳 ${PDM.mapUtil.roomUsage(r.id).length}`))),
            h('button', { class: 'btn sm add', onclick: PDM.mapUtil.newRoom }, '+ 방 템플릿 만들기'),
            h('button', { class: 'btn sm', style: { marginLeft: '6px' }, onclick: PDM.mapUtil.showRoomGallery }, '▦ 방 미리보기'),
            h('p', { class: 'hint', style: { marginTop: '10px' } }, `게임 기본 방 ${(PDM.SPD_ROOMS || []).length}개 — ▪ 는 "추가 방"으로 쓸 수 있고, ▫ 는 전용 층·자동 배치라 볼 수만 있습니다. 누르면 설명과 코드 파일.`),
            ...PDM.mapUtil.gameRoomGroups().map(g => h('details', {}, h('summary', {}, `▤ ${g.name} (${g.rooms.length})`),
              h('div', { style: { padding: '2px 0 6px 14px' } }, g.rooms.map(r => h('div', {},
                h('a', { href: '#', title: r.desc || '', onclick: ev => { ev.preventDefault(); PDM.mapUtil.showGameRoom(r); } }, `${r.noUse ? '▫' : '▪'} ${r.name}`),
                h('span', { class: 'hint' }, `  ${r.cls}${r.noUse ? '' : ' · 쓰는 곳 ' + PDM.mapUtil.roomUsage('game:' + r.id).length}`)))))))));
      }
      PDM.worldInspect = inspect;

      // ---- 툴바 ----
      const tb = h('div', { class: 'wg-tb' },
        h('button', { class: 'btn sm', onclick: e => PDM.ui.menu(e.clientX, e.clientY + 10, [
          ['procedural', '자동 생성'], ['handmade', '직접 그리기'], ['hybrid', '혼합']].map(([m, n]) => ({ label: '새 노드: ' + n, run: () => { const r = vp.getBoundingClientRect(); const p = toWorld(r.left + r.width / 2, r.top + r.height / 2); addNodeAsk(m, p.x - NW / 2, p.y - NH / 2); } }))) }, '+ 노드'),
        h('button', { class: 'btn sm', onclick: () => { const r = vp.getBoundingClientRect(); const p = toWorld(r.left + r.width / 2, r.top + r.height / 2); addGroup(p.x, p.y, [...sel.nodes]); } }, '+ 그룹'),
        h('span', { class: 'tb-sep' }),
        h('button', { class: 'btn sm', title: 'F — 또는 아무것도 고르지 않고 Enter', onclick: fit }, '전체 보기'),
        h('button', { class: 'btn sm', onclick: autoLayout }, '자동 정렬'),
        h('button', { class: 'btn sm pri', title: '게임 전체의 진행 방향. 그룹마다 따로 정할 수도 있습니다',
          onclick: () => store.edit('project', '진행 방향 반전', r => { r.direction = r.direction === 'up' ? 'down' : 'up'; }) },
          proj.direction === 'up' ? '⇅ ▲ 올라가기 (탑)' : '⇅ ▼ 내려가기 (던전)'),
        h('span', { class: 'grow' }), zoomLbl);

      const page = h('div', { class: 'page full wg' }, tb, vp,
        h('div', { class: 'wg-help' }, 'Space+끌기 이동 · 휠 확대 · 빈 곳 더블클릭 새 노드 · 가장자리 점 끌기 연결 (그냥=통로 · Shift=갈림길 출구 · Alt=샛길 · 여러 번 끌면 통로 여러 개) · 오른쪽 클릭 메뉴'));
      drawSvg(); markSel();
      requestAnimationFrame(() => { if (!v) fit(); else applyView(); if (PDM.tabs.active === key) inspect(); });
      if (v) applyView();
      return page;
    }
  });
})();
