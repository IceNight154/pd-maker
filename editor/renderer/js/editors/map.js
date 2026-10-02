// ================================================================
//  맵 편집기 (타일)
//   · 'node:<id>' : 맵 그래프의 노드 한 개 (타일 그리기, 오브젝트/NPC/이벤트 배치, 생성 방식)
//   · 'room:<id>' : 방 템플릿
//   (그룹 · 노드 연결은 world.js 의 맵 그래프 편집기)
// ================================================================
(function () {
  const { h } = PDM;
  const store = PDM.store;
  const W_ = PDM.World;

  /** 리소스 종류: node:id / room:id */
  function kindOf(key) { return key.split(':')[0]; }
  function groupOfNode(fl) { return fl && fl.id ? W_.groupOf(fl.id) : null; }
  function themeOf(fl, kind) {
    kind = kind || 'node';
    if (kind === 'room') return fl.previewTheme || roomAutoTheme(fl) || 'SEWER';
    return W_.themeOf(fl.id);
  }
  /** 방 템플릿의 "자동" 테마: 이 방이 들어가는 첫 그룹·노드의 테마 */
  function roomAutoTheme(fl) {
    const wd = store.get('world') || {}, has = l => (l || []).some(r => r.room === fl.id);
    for (const g of wd.groups || []) if ((has(g.rooms) || has(g.blocks) || (fl.auto && (fl.autoGroups || []).includes(g.id))) && g.theme) return g.theme;
    for (const f of store.all('node')) if (has((f.procedural || {}).rooms) || has((f.procedural || {}).blocks)) return W_.themeOf(f.id);
    if (fl.auto) { const g = (wd.groups || []).find(x => !x.safe && x.theme); if (g) return g.theme; }
    return '';
  }
  function isUp(fl, kind) { return (kind || 'node') === 'node' && W_.dirOf(fl.id) === 'up'; }
  function themeKey(t) { return t && t.startsWith('custom:') ? t.slice(7) : t; }
  function themeName(t) {
    if (!t) return '';
    if (PDM.THEMES[t]) return PDM.THEMES[t].name;
    const c = ((store.get('world') || {}).customThemes || []).find(x => x.id === themeKey(t));
    return c ? c.name : t;
  }
  function blankTerrain(w, hh, room) {
    const a = new Array(w * hh).fill(4);
    if (room) for (let y = 1; y < hh - 1; y++) for (let x = 1; x < w - 1; x++) a[y * w + x] = 1;
    return a;
  }

  // ---------- 새로 만들기 ----------
  async function newRoom() {
    const id = await PDM.ui.prompt('새 방 템플릿 id (영문)', '', '파일 이름이 됩니다. 예: herb_greenhouse'); if (!id) return;
    const clean = PDM.slugId(id);
    if (store.has('room:' + clean)) { toast('같은 id 가 있습니다', 'bad'); return; }
    const mobs = await PDM.askSpawn('새 방 템플릿 — 몬스터 스폰'); if (mobs === null || mobs === undefined) return;
    const r = PDM.make.room(clean); r.name = id; if (mobs === false) r.noMobs = true;
    store.add('room:' + clean, r, '방 템플릿 추가'); PDM.tabs.open('room:' + clean);
  }

  /** "추가 방" 목록 편집 (장 · 층 공용) */
  function roomListEditor(key, path) {
    const { F, row } = PDM.ui;
    return PDM.ui.listEditor(key, path, {
      addLabel: '방 추가', compact: true, emptyText: store.all('room').length ? '추가할 방이 없습니다' : '먼저 "방 템플릿"을 만드세요',
      make: () => ({ room: (store.all('room')[0] || {}).id || '', count: 1, chance: 100, cond: '' }),
      render: (it, i, p) => row(F.ref(key, [...p, 'room'], 'room', { label: '방 템플릿' }), F.num(key, [...p, 'count'], { label: '개수', int: true, min: 1, max: 5 }),
        F.num(key, [...p, 'chance'], { label: '확률(%)', int: true, min: 0, max: 100 }), F.cond(key, [...p, 'cond'], { label: '조건(선택)' }))
    });
  }
  // ---------- 게임 기본 방 미리보기 (spd-room-previews.js — 게임이 실제로 만든 표본) ----------
  const PV_MAP = { 37: 7, 32: 1, 23: 1, 35: 34, 36: 33, 38: 10, 39: 29 };   // 편집기에 없는 지형 → 비슷한 것
  /** 방의 표본들 → drawThumb 가 그릴 수 있는 꼴. 입구·출구 변형에 표본이 없으면 바탕 방 것 (borrowed) */
  function gameRoomPreviews(r) {
    const P = PDM.SPD_ROOM_PREVIEWS || {};
    let list = P[r.id], borrowed = '';
    if (!list || !list.length) {
      const m = /^(.*?)(Entrance|Exit)Room$/.exec(r.cls);
      const base = r.cls === 'MineEntrance' ? 'CaveRoom' : m ? (m[1] ? m[1] + 'Room' : 'EmptyRoom') : '';
      const b = base && (PDM.SPD_ROOMS || []).find(x => x.cls === base);
      if (b && P[b.id]) { list = P[b.id]; borrowed = b.name; }
    }
    return (list || []).map(s => ({ borrowed, previewTheme: s.theme, size: { w: s.w, h: s.h },
      layers: { terrain: Array.from(s.t, c => { const v = c.charCodeAt(0) - 48; return PV_MAP[v] !== undefined ? PV_MAP[v] : v; }) },
      objects: (s.o || []).map(o => ({ type: o[0], at: { x: o[1], y: o[2] } })) }));
  }
  /** 표본 하나를 그린 캔버스 (칸 크기 cell px, 최대 max px) */
  function roomCanvas(fl, cell, max) {
    const s = Math.max(2, Math.min(cell, Math.floor(max / Math.max(fl.size.w, fl.size.h))));
    const cv = h('canvas', { width: fl.size.w * s, height: fl.size.h * s, style: { imageRendering: 'pixelated', borderRadius: '3px' } });
    drawThumb(cv, fl, 'room');
    return cv;
  }
  /** 방 미리보기 모아 보기: 프로젝트 방 템플릿 + 게임 기본 방 전체 */
  function showRoomGallery() {
    const card = (cv, label, sub, run, dim) => h('div', { class: 'room-card', title: sub || '', onclick: run,
      style: { width: '112px', cursor: 'pointer', textAlign: 'center', padding: '6px', border: '1px solid var(--line)', borderRadius: '6px', opacity: dim ? .75 : 1 } },
      h('div', { style: { height: '96px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', borderRadius: '4px' } }, cv || h('span', { class: 'hint' }, '미리보기 없음')),
      h('div', { style: { fontSize: '11px', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, label));
    const grid = cards => h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px', margin: '6px 0 14px' } }, cards);
    const mine = store.all('room');
    let closeBtn;
    const body = h('div', { style: { width: 'min(860px, 88vw)' } },
      h('p', { class: 'hint' }, '게임 기본 방은 게임이 실제로 만든 표본입니다 (만들 때마다 크기·모양이 달라짐). 누르면 다른 표본과 설명. 노란 점 = 아이템, 빨간 점 = 몬스터, 초록 점 = NPC.'),
      mine.length ? h('h4', {}, `프로젝트 방 템플릿 (${mine.length})`) : null,
      mine.length ? grid(mine.map(r => card(roomCanvas(r, 10, 96), r.name, r.id, () => { closeBtn(); PDM.tabs.open('room:' + r.id); }))) : null,
      ...gameRoomGroups().filter(g => g.cat !== 'base').map(g => h('div', {}, h('h4', {}, `${g.name} (${g.rooms.length})`),
        grid(g.rooms.map(r => { const pv = gameRoomPreviews(r)[0]; return card(pv ? roomCanvas(pv, 10, 96) : null, r.name, r.cls + (r.noUse ? ' — ' + r.noUse : ''), () => showGameRoom(r), !!r.noUse); })))));
    closeBtn = () => { const b = body.closest('.modal-bg'); if (b) b.remove(); };
    PDM.ui.modal('방 미리보기', body, [['닫기', null, 'pri']]);
  }

  /** 게임 기본 방 정보 창 (맵 › 방 템플릿 › 게임 기본 방) */
  function showGameRoom(r) {
    const cn = Object.fromEntries(PDM.SPD_ROOM_CATS || []);
    const z = r.size || {}, used = roomUsage('game:' + r.id);
    const sz = [z.minW || z.minH ? `최소 ${z.minW || '?'}×${z.minH || '?'}` : '', z.maxW || z.maxH ? `최대 ${z.maxW || '?'}×${z.maxH || '?'}` : ''].filter(Boolean).join(' · ');
    const line = (k, v) => h('tr', {}, h('td', { class: 'hint', style: { paddingRight: '12px', whiteSpace: 'nowrap' } }, k), h('td', {}, v));
    const pvs = gameRoomPreviews(r);
    PDM.ui.modal('게임 기본 방 — ' + r.name, h('div', {},
      h('p', {}, r.desc || ''),
      pvs.length ? h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end', margin: '8px 0 4px' } },
        pvs.map(pv => h('div', { style: { textAlign: 'center' } }, roomCanvas(pv, 16, 240),
          h('div', { class: 'hint' }, `${(PDM.THEMES[pv.previewTheme] || {}).name || ''} · ${pv.size.w}×${pv.size.h}`)))) : h('p', { class: 'hint' }, '미리보기 표본이 없습니다.'),
      pvs.length ? h('p', { class: 'hint' }, (pvs[0].borrowed ? `※ 이 방의 표본이 없어 바탕이 되는 「${pvs[0].borrowed}」 모양을 보여 줍니다 (여기에 계단이 놓임). ` : '') + '게임이 실제로 만든 표본 — 만들 때마다 크기·모양이 달라집니다. 노란 점 = 아이템, 빨간 점 = 몬스터, 초록 점 = NPC.') : null,
      h('table', {},
        line('분류', cn[r.cat] || r.cat), line('클래스', h('span', { class: 'mono' }, 'levels.rooms.' + r.id)), line('바탕 클래스', h('span', { class: 'mono' }, r.base)),
        line('크기', sz || '바탕 클래스를 따름'),
        line('추가 방', r.noUse ? '쓸 수 없음 — ' + r.noUse : '쓸 수 있음 (그룹·노드 속성의 "추가 방"에서 고름)'),
        used.length ? line('쓰는 곳', used.join(', ')) : null)),
      [['코드 파일 보기', () => { setTimeout(() => PDM.showCodeFile(r.file, '게임 코드 — levels.rooms.' + r.id), 0); }], ['닫기', null, 'pri']]);
  }
  /** 게임 기본 방을 분류별로 */
  function gameRoomGroups() {
    return (PDM.SPD_ROOM_CATS || []).map(([c, n]) => ({ cat: c, name: n, rooms: (PDM.SPD_ROOMS || []).filter(r => r.cat === c) })).filter(g => g.rooms.length);
  }
  // ---------- 구성 블럭 (자동 생성 층의 구성을 블럭을 쌓아 정함) ----------
  //   <노드>.procedural.blocks · <그룹>.blocks — 비어 있으면 게임 기본 구성. 런타임: LevelHooks.addRooms / builder
  const BLOCKS = {
    layout:   { name: '구조', icon: '⌘', color: '#63b3ed', once: true, desc: '방들을 잇는 모양', make: () => ({ type: 'layout', shape: 'auto', tunnels: 'default' }) },
    feeling:  { name: '분위기', icon: '☁', color: '#a58bff', once: true, desc: '층 전체의 지형 느낌', make: () => ({ type: 'feeling', feeling: 'NONE' }) },
    standard: { name: '일반 방', icon: '▣', color: '#7fb069', desc: '무작위 일반 방', make: () => ({ type: 'standard', min: 4, max: 6, big: true }) },
    special:  { name: '특수 방', icon: '◈', color: '#e6b95c', desc: '무작위 특수 방 (보물·함정·정원…)', make: () => ({ type: 'special', min: 1, max: 2 }) },
    secret:   { name: '비밀 방', icon: '?', color: '#b07fd6', desc: '무작위 비밀 방 (숨은 문)', make: () => ({ type: 'secret', min: 0, max: 1 }) },
    room:     { name: '지정한 방', icon: '★', color: '#e07a5f', desc: '방 템플릿이나 게임 기본 방을 골라 넣기', make: () => ({ type: 'room', room: '', count: 1, chance: 100, cond: '' }) },
    shop:     { name: '상점', icon: '$', color: '#e07a5f', desc: '상점 방 (지정한 방 블럭으로 들어감)', make: () => ({ type: 'room', room: 'game:special.ShopRoom', count: 1, chance: 100, cond: '' }) }
  };
  const SHAPES = { auto: '자동 (게임 기본: 고리 또는 8자)', loop: '고리 — 한 바퀴 도는 길', figure8: '8자 — 고리 두 개', line: '일자 — 입구에서 출구까지 한 줄' };
  const FEELINGS = { NONE: '없음 (보통)', CHASM: '구덩이', WATER: '물', GRASS: '풀', DARK: '어둠', LARGE: '넓음 (방이 더 많아짐)', TRAPS: '함정', SECRETS: '비밀' };
  /** 블럭 구성의 방 수 어림 [최소, 최대] (입구·출구 포함) */
  function blockRoomCount(list) {
    let lo = 2, hi = 2, std = 0;
    (list || []).forEach(b => {
      if (b.type === 'standard' || b.type === 'special' || b.type === 'secret') { lo += b.min || 0; hi += Math.max(b.min || 0, b.max || 0); if (b.type === 'standard') std += Math.max(b.min || 0, b.max || 0); }
      else if (b.type === 'room') { hi += b.count || 1; if ((b.chance ?? 100) >= 100 && !b.cond) lo += b.count || 1; }
    });
    return [lo, hi, std];
  }
  function blockListEditor(key, path, o = {}) {
    const { F, row } = PDM.ui;
    const list = PDM.deepGet(store.get(key), path) || [];
    const edit = (label, fn) => store.edit(key, label, r => { if (!PDM.deepGet(r, path)) PDM.deepSet(r, path, []); fn(PDM.deepGet(r, path)); });
    const wrap = h('div', { class: 'blocks' });
    // 팔레트
    wrap.append(h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' } }, Object.entries(BLOCKS).map(([t, B]) => {
      const dis = B.once && list.some(b => b.type === t);
      return h('button', { class: 'btn xs', disabled: dis, title: B.desc + (dis ? ' — 이미 있음' : ''), style: { borderLeft: `4px solid ${B.color}` },
        onclick: e => { e.preventDefault(); edit('블럭 추가: ' + B.name, a => { const b = B.make(); B.once ? a.unshift(b) : a.push(b); }); } }, `+ ${B.icon} ${B.name}`);
    })));
    if (!list.length) wrap.append(h('div', { class: 'empty' }, o.emptyText || '블럭 없음 — 게임 기본 구성으로 만듭니다. 위에서 블럭을 눌러 쌓으면 그 구성대로 자동 생성합니다.'),
      h('button', { class: 'btn sm', style: { marginTop: '6px' }, onclick: e => { e.preventDefault(); edit('기본 구성 블럭', a => { a.push(BLOCKS.layout.make(), BLOCKS.standard.make(), BLOCKS.special.make(), BLOCKS.secret.make()); }); } }, '게임 기본과 비슷한 구성으로 채우기'));
    let dragFrom = -1;
    list.forEach((b, i) => {
      const B = BLOCKS[b.type] || { name: b.type, icon: '?', color: '#888' };
      const p = [...path, i];
      let body;
      if (b.type === 'layout') body = row(F.select(key, [...p, 'shape'], SHAPES, { label: '모양' }),
        F.select(key, [...p, 'tunnels'], { default: '기본', none: '통로 없이 방끼리 붙임', long: '통로 길게' }, { label: '통로' }));
      else if (b.type === 'feeling') body = F.select(key, [...p, 'feeling'], FEELINGS, { label: '분위기' });
      else if (b.type === 'room') body = h('div', {}, row(F.ref(key, [...p, 'room'], 'room', { label: '방' }), F.num(key, [...p, 'count'], { label: '개수', int: true, min: 1, max: 5 }),
        F.num(key, [...p, 'chance'], { label: '확률(%)', int: true, min: 0, max: 100 })), F.cond(key, [...p, 'cond'], { label: '조건(선택)' }),
        (() => { const g = String(b.room || '').startsWith('game:') && (PDM.SPD_ROOMS || []).find(r => 'game:' + r.id === b.room); const t = !g && b.room && store.get('room:' + b.room); const pv = g ? gameRoomPreviews(g)[0] : t;
          return pv ? h('div', { style: { marginTop: '4px', cursor: 'pointer' }, title: '눌러서 자세히', onclick: () => g ? showGameRoom(g) : PDM.tabs.open('room:' + b.room) }, roomCanvas(pv, 8, 72)) : null; })());
      else body = row(F.num(key, [...p, 'min'], { label: '최소', int: true, min: 0, max: b.type === 'standard' ? 20 : b.type === 'special' ? 6 : 4 }),
        F.num(key, [...p, 'max'], { label: '최대', int: true, min: 0, max: b.type === 'standard' ? 20 : b.type === 'special' ? 6 : 4 }),
        b.type === 'standard' ? F.bool(key, [...p, 'big'], { label: '큰 방 허용' }) : null);
      const card = h('div', { class: 'li compact', draggable: true, style: { borderLeft: `4px solid ${B.color}`, flexDirection: 'column', gap: '2px' },
        ondragstart: e => { dragFrom = i; e.dataTransfer.effectAllowed = 'move'; },
        ondragover: e => { if (dragFrom >= 0 && dragFrom !== i) e.preventDefault(); },
        ondrop: e => { e.preventDefault(); const f = dragFrom; dragFrom = -1; if (f >= 0 && f !== i) edit('블럭 순서', a => { const [x] = a.splice(f, 1); a.splice(i, 0, x); }); } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
          h('b', { style: { flex: 1, cursor: 'grab' }, title: '끌어서 순서 바꾸기' }, `⠿ ${B.icon} ${B.name}`),
          h('span', { class: 'li-tools' },
            h('button', { class: 'ib', title: '위로', disabled: i === 0, onclick: e => { e.preventDefault(); edit('블럭 순서', a => { [a[i - 1], a[i]] = [a[i], a[i - 1]]; }); } }, '↑'),
            h('button', { class: 'ib', title: '아래로', disabled: i === list.length - 1, onclick: e => { e.preventDefault(); edit('블럭 순서', a => { [a[i + 1], a[i]] = [a[i], a[i + 1]]; }); } }, '↓'),
            B.once ? null : h('button', { class: 'ib', title: '복제', onclick: e => { e.preventDefault(); edit('블럭 복제', a => { a.splice(i + 1, 0, PDM.clone(a[i])); }); } }, '⧉'),
            h('button', { class: 'ib danger', title: '삭제', onclick: e => { e.preventDefault(); edit('블럭 삭제', a => { a.splice(i, 1); }); } }, '✕'))),
        body);
      wrap.append(card);
    });
    if (list.length) {
      const [lo, hi, std] = blockRoomCount(list);
      wrap.append(h('div', { class: 'hint', style: { marginTop: '6px' } }, `▶ 입구 + 출구 + 블럭 = 방 ${lo === hi ? lo : lo + '~' + hi}개` + (std === 0 ? ' · 일반 방 블럭이 없으면 일반 방 1개가 자동으로 들어갑니다' : '') + (hi > 20 ? ' · 방이 많으면 층이 아주 넓어집니다' : '')));
    }
    return wrap;
  }

  /** 방 템플릿을 쓰는 곳 */
  function roomUsage(id) {
    const out = [];
    const rm = store.get('room:' + id);
    if (rm && rm.auto) { const gs = (rm.autoGroups || []).map(g => (W_.group(g) || {}).name).filter(Boolean); out.push(`자동 생성 ${rm.autoChance ?? 100}% (${gs.length ? gs.join('·') : '모든 그룹'})`); }
    ((store.get('world') || {}).groups || []).forEach(g => { if ([...(g.rooms || []), ...(g.blocks || [])].some(r => r.room === id)) out.push(g.name); });
    store.all('node').forEach(f => { if ([...((f.procedural || {}).rooms || []), ...((f.procedural || {}).blocks || [])].some(r => r.room === id)) out.push(W_.fullName(f.id)); });
    return out;
  }

  // ---------- 작은 미리보기 ----------
  async function drawThumb(cv, fl, kind) {
    kind = kind || 'node';
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    const tiles = await PDM.assets.themeTiles(themeKey(themeOf(fl, kind)));
    const up = isUp(fl, kind);
    const t = fl.layers && fl.layers.terrain;
    g.clearRect(0, 0, cv.width, cv.height);
    if ((kind !== 'node' || fl.mode !== 'procedural') && t && t.length === fl.size.w * fl.size.h) {
      const s = Math.max(1, Math.floor(Math.min(cv.width / fl.size.w, cv.height / fl.size.h)));
      g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height);
      const ox = (cv.width - fl.size.w * s) / 2, oy = (cv.height - fl.size.h * s) / 2;
      for (let y = 0; y < fl.size.h; y++) for (let x = 0; x < fl.size.w; x++) PDM.assets.drawTerrain(g, tiles, t[y * fl.size.w + x], ox + x * s, oy + y * s, s, up);
      (fl.objects || []).forEach(o => { if (o.at && o.at.x != null) { g.fillStyle = (PDM.OBJECT_TYPES[o.type] || {}).color || '#fff'; g.fillRect(ox + o.at.x * s, oy + o.at.y * s, Math.max(2, s), Math.max(2, s)); } });
    } else {
      for (let y = 0; y < cv.height; y += 16) for (let x = 0; x < cv.width; x += 16) PDM.assets.drawTerrain(g, tiles, ((x + y) / 16) % 5 === 0 ? 20 : 1, x, y, 16);
      g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, 0, cv.width, cv.height);
      g.fillStyle = '#ddd'; g.font = '11px sans-serif'; g.textAlign = 'center';
      const grp = groupOfNode(fl);
      const rooms = ((fl.procedural || {}).rooms || []).length + ((grp || {}).rooms || []).length;
      g.fillText((fl.boss ? '보스 · ' : '') + '자동 생성' + (rooms ? ` + 방 ${rooms}` : ''), cv.width / 2, cv.height / 2 + 4);
    }
  }

  // =============================================================
  //  층 편집기 (Floor)
  // =============================================================
  const floorUI = {};   // 층마다 도구 상태 유지 { tool, terrain, zoom, objType, objRef, sel }

  PDM.registerEditor({
    id: 'floor',
    icon: k => ({ node: '▦', room: '▣' })[kindOf(k)],
    match: k => /^(node|room):/.test(k),
    title: k => {
      const fl = store.get(k), kind = kindOf(k);
      if (!fl) return k;
      if (kind === 'room') return '방: ' + fl.name;
      return W_.fullName(fl.id);
    },
    watch: (ck, tk) => ck === tk || ck === 'world' || ck === 'project',
    onActivate: k => { const u = floorUI[k]; if (u && u.show) u.show(); },
    render(key, ctx) {
      const fl = store.get(key);
      if (!fl) return h('div', { class: 'page' }, '층 데이터가 없습니다');
      const kind = kindOf(key);
      const ui = floorUI[key] = floorUI[key] || { tool: 'pen', terrain: 1, zoom: 2, objType: 'npc', objRef: '', sel: -1, grid: true, spawnVal: 1, spawnShape: 'pen', showSpawn: true, showPorts: true };
      if (ui.zones === undefined) ui.zones = kind === 'room';
      if (ui.spawnVal === undefined) Object.assign(ui, { spawnVal: 1, spawnShape: 'pen', showSpawn: true, showPorts: true });
      const W = fl.size.w, H = fl.size.h;
      const drawable = kind !== 'node' || fl.mode !== 'procedural';
      const PAD = drawable ? 3 : 0;                                     // 맵 둘레 여백 칸 (Ctrl+끌기로 공간을 넓힐 자리)
      const MINS = 5, MAXS = kind === 'room' ? 18 : fl.mode === 'hybrid' ? 16 : 80;
      const up = isUp(fl, kind);
      if (drawable && (!fl.layers || !fl.layers.terrain || fl.layers.terrain.length !== W * H)) {
        store.edit(key, '타일 초기화', r => { r.layers = r.layers || {}; r.layers.terrain = blankTerrain(W, H, true); }, { silent: true });
      }
      let terrain = drawable ? fl.layers.terrain.slice() : null;
      // 몬스터 스폰 구역 (직접 그린 노드만): 0 보통 · 1 스폰 구역 · 2 스폰 금지
      const canSpawn = kind === 'node' && fl.mode === 'handmade';
      let spawnL = canSpawn ? (((fl.layers || {}).spawn || []).length === W * H ? fl.layers.spawn.slice() : new Array(W * H).fill(0)) : null;
      const SPAWN_VALS = { 1: ['스폰 구역', '#5fd66a'], 2: ['스폰 금지', '#ff5a6a'], 0: ['지우개', '#9a93ad'] };
      let tilesImg = null;
      const theme = themeKey(themeOf(fl, kind));

      // ---- 팔레트 ----
      const palette = h('div', { class: 'palette' });
      function drawPalette() {
        palette.innerHTML = '';
        if (drawable) {
          palette.append(h('div', { class: 'fl' }, '타일'));
          const grid = h('div', { class: 'pal-grid' });
          PDM.TERRAIN.forEach(t => {
            const cv = h('canvas', { width: 16, height: 16, class: 'pal-t' + (ui.terrain === t.id && ui.tool !== 'object' && ui.tool !== 'select' ? ' on' : ''), title: `${PDM.terrainName(t, up)} (${t.key}, ${t.id})`,
              onclick: () => { ui.terrain = t.id; if (ui.tool === 'object' || ui.tool === 'select') ui.tool = 'pen'; drawPalette(); drawTools(); } });
            const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
            PDM.assets.drawTerrain(g, tilesImg, t.id, 0, 0, 16, up);
            grid.append(cv);
          });
          palette.append(grid, h('div', { class: 'hint', style: { margin: '4px 0 10px' } }, PDM.terrainName(PDM.TERRAIN_BY_ID[ui.terrain], up)),
            h('button', { class: 'btn xs' + (ui.terrain === 0 && ui.tool !== 'object' && ui.tool !== 'select' ? ' pri' : ''), style: { marginBottom: '8px' }, title: '바닥이 없는 칸 — 떨어지면 아래층으로',
              onclick: () => { ui.terrain = 0; if (ui.tool === 'object' || ui.tool === 'select') ui.tool = 'pen'; drawPalette(); drawTools(); } }, '▢ 빈 타일 (낭떠러지)'),
            kind === 'room' ? h('div', { class: 'hint', style: { marginBottom: '10px', color: 'var(--gold)' } }, '테두리에 문 타일을 그리면 그 자리에만 문이 생깁니다 (연결 안 된 자리는 벽).') : '',
            h('div', { class: 'hint', style: { marginBottom: '10px' } }, 'Ctrl+끌기 = 끈 만큼 공간 추가\nAlt+끌기 = 끈 만큼 공간 빼기'),
            h('div', { class: 'fl' }, '타일 그림 (' + themeName(themeOf(fl, kind)) + ')'),
            h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '10px' } },
              h('button', { class: 'btn xs', title: '지금 고른 타일 한 칸(16×16)의 그림을 고칩니다', onclick: editOneTile }, '✎ 고른 타일'),
              h('button', { class: 'btn xs', title: '타일셋 전체(256×256)를 고칩니다', onclick: editTileset }, '▦ 타일셋 전체'),
              h('button', { class: 'btn xs', title: 'PNG 파일을 타일셋으로 불러옵니다 (256×256, 16칸 격자)', onclick: importTileset }, '⤓ PNG 불러오기')));
        }
        if (canSpawn) {
          palette.append(h('div', { class: 'fl' }, '몬스터 스폰 구역'),
            h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } }, ...[1, 2, 0].map(v => [v, SPAWN_VALS[v]]).map(([v, [t, c]]) => h('button', { class: 'btn xs' + (ui.tool === 'spawn' && ui.spawnVal === +v ? ' pri' : ''), style: { borderColor: c }, onclick: () => { ui.tool = 'spawn'; ui.spawnVal = +v; ui.showSpawn = true; drawPalette(); drawTools(); paint(); } }, t))),
            h('div', { style: { display: 'flex', gap: '4px', margin: '4px 0', flexWrap: 'wrap' } }, ...[['pen', '✎ 칠하기'], ['rect', '▭ 사각형'], ['fill', '▧ 방 채우기']].map(([k, t]) => h('button', { class: 'btn xs' + (ui.spawnShape === k ? ' pri' : ''), onclick: () => { ui.spawnShape = k; ui.tool = 'spawn'; ui.showSpawn = true; drawPalette(); drawTools(); paint(); } }, t))),
            h('div', { class: 'hint', style: { marginBottom: '10px' } }, (fl.spawn || {}).enabled ? '초록 = 이 안에서만 몬스터가 생김 · 빨강 = 절대 안 생김. 초록이 없으면 빨강을 뺀 아무 곳.' : '속성의 "몬스터 스폰"을 켜야 게임에서 적용됩니다.'));
        }
        palette.append(h('div', { class: 'fl' }, '오브젝트 놓기'));
        const typeSel = h('select', { onchange: () => { ui.objType = typeSel.value; ui.objRef = ''; ui.tool = 'object'; drawPalette(); drawTools(); } },
          Object.entries(PDM.OBJECT_TYPES).filter(([k]) => k !== 'start' || kind === 'node').map(([k, v]) => h('option', { value: k }, v.name)));
        typeSel.value = ui.objType;
        const refKind = PDM.OBJECT_TYPES[ui.objType].ref;
        const opts = refKind === 'character' ? store.all('char').filter(c => ui.objType === 'mob' ? ['mob', 'boss'].includes(c.kind) : !['mob', 'boss', 'hero'].includes(c.kind)).map(c => [c.id, c.name])
          : refKind === 'item' ? store.all('item').map(c => [c.id, c.name]) : refKind === 'event' ? store.all('event').map(c => [c.id, c.name]) : refKind === 'prop' ? store.all('prop').map(c => [c.id, c.name]) : refKind === 'effect' ? PDM.ui.refOptions('effect') : [];
        if (refKind === 'character' && ui.objType === 'mob') opts.push(...['rat', 'gnoll', 'crab', 'slime', 'snake', 'albino'].map(m => ['spd:' + m, `(게임) ${m}`]));
        const refSel = h('select', { onchange: () => { ui.objRef = refSel.value; ui.tool = 'object'; drawTools(); } }, opts.map(([v, t]) => h('option', { value: v }, t)));
        if (!ui.objRef && opts[0]) ui.objRef = opts[0][0];
        refSel.value = ui.objRef;
        palette.append(typeSel, refKind ? refSel : null,
          h('button', { class: 'btn sm' + (ui.tool === 'object' ? ' pri' : ''), style: { marginTop: '6px', width: '100%' }, onclick: () => { ui.tool = 'object'; drawTools(); drawPalette(); } }, '놓기 도구'),
          h('div', { class: 'hint', style: { marginTop: '10px' } }, drawable ? '타일: 왼쪽 클릭 그리기 · 오른쪽 클릭 스포이드\n오브젝트: 선택 도구로 끌어서 옮기기, Delete 로 삭제' : '자동 생성 층은 타일을 그리지 않습니다. 오브젝트는 "배치 규칙"으로 놓입니다.'));
      }

      // ---- 도구 막대 ----
      const tools = h('div', { class: 'map-tools' });
      function drawTools() {
        tools.innerHTML = '';
        const T = (id, label, tip) => h('button', { class: 'tool' + (ui.tool === id ? ' on' : ''), title: tip || '', onclick: () => { ui.tool = id; drawTools(); drawPalette(); } }, label);
        if (drawable) tools.append(T('pen', '✎ 펜', '타일 그리기'), T('rect', '▭ 사각형', '끌어서 채운 사각형'), T('room', '▣ 방', '끌어서 벽 두른 방'), T('fill', '▧ 채우기'), T('pick', '⊙ 스포이드'));
        tools.append(T('select', '⇱ 선택', '오브젝트 선택/이동'), T('object', '✚ 오브젝트'));
        if (canSpawn) tools.append(T('spawn', '☗ 스폰 구역', '몬스터가 생기는 구역 / 안 생기는 구역 칠하기'),
          h('button', { class: 'tool' + (ui.showSpawn ? ' on' : ''), title: '스폰 구역 보이기', onclick: () => { ui.showSpawn = !ui.showSpawn; drawTools(); paint(); } }, '구역 표시'));
        if (drawable && kind === 'node') tools.append(h('button', { class: 'tool' + (ui.showPorts ? ' on' : ''), title: '출구·입구 번호와 연결 보이기', onclick: () => { ui.showPorts = !ui.showPorts; drawTools(); paint(); } }, '계단 번호'));
        tools.append(h('span', { class: 'tb-sep' }),
          h('button', { class: 'tool', onclick: () => { ui.zoom = Math.max(1, ui.zoom - 1); paint(); } }, '−'),
          h('span', { class: 'hint' }, `×${ui.zoom}`),
          h('button', { class: 'tool', onclick: () => { ui.zoom = Math.min(6, ui.zoom + 1); paint(); } }, '+'),
          h('button', { class: 'tool' + (ui.grid ? ' on' : ''), onclick: () => { ui.grid = !ui.grid; drawTools(); paint(); } }, '격자'),
          drawable ? h('button', { class: 'tool' + (ui.zones ? ' on' : ''), title: '벽 = 빨강 · 바닥 = 파랑 · 문 = 초록 으로 덧칠해 보기', onclick: () => { ui.zones = !ui.zones; drawTools(); paint(); } }, '구역 색') : '',
          h('span', { class: 'grow' }),
          kind === 'node' ? h('select', { onchange: e => { const m = e.target.value; store.edit(key, '생성 방식', r => { r.mode = m; if (m === 'hybrid' && r.size.w > 16) { r.size = { w: 11, h: 11 }; r.layers.terrain = blankTerrain(11, 11, true); } }); } },
            Object.entries(PDM.FLOOR_MODES).map(([k, v]) => h('option', { value: k, selected: fl.mode === k }, v.name)))
            : h('span', { class: 'badge gold' }, fl.kind === 'special' ? '특수 방 템플릿' : '일반 방 템플릿'),
          kind === 'node' ? h('button', { class: 'tool', title: '맵 그래프에서 이 노드 보기', onclick: () => { PDM.tabs.open('world'); setTimeout(() => PDM.worldFocus && PDM.worldFocus(fl.id), 50); } }, '⌘ 그래프') : '',
          kind !== 'room' ? h('span', { class: 'badge' }, up ? '▲ 올라가기' : '▼ 내려가기') : '',
          kind === 'room' ? (() => { const auto = roomAutoTheme(fl);
            const sel = h('select', { title: '이 방을 어떤 테마 타일로 볼지 (게임에서는 방이 들어간 맵의 테마로 그려집니다)', onchange: e => { const v = e.target.value; store.edit(key, '미리보기 테마', r => { r.previewTheme = v; }); } },
              h('option', { value: '' }, `자동: ${themeName(auto || 'SEWER')}${auto ? ' (쓰는 맵의 테마)' : ''}`), PDM.ui.refOptions('theme').map(([v, t]) => h('option', { value: v }, t)));
            sel.value = fl.previewTheme || ''; return sel; })()
            : h('span', { class: 'badge' }, themeName(themeOf(fl, kind))));
      }

      // ---- 타일 그림 편집: 사용자 테마(타일셋 사본)를 만들어 고침 ----
      /** 지금 테마가 게임 기본이면 그 타일셋을 복사한 사용자 테마를 만들고, 사용자 테마 정보를 돌려줌 */
      async function ensureCustomTheme() {
        const cur = themeOf(fl, kind);
        const wd = store.get('world') || {};
        if (cur && cur.startsWith('custom:')) { const c = (wd.customThemes || []).find(x => x.id === cur.slice(7)); if (c && c.tiles) return c; }
        const base = PDM.THEMES[cur] ? cur : 'SEWER';
        if (!(await PDM.ui.confirm(`「${PDM.THEMES[base].name}」 타일셋을 복사해 사용자 테마를 만들고 그 그림을 고칩니다.\n(게임 기본 타일은 그대로 두고, 이 사용자 테마를 쓰는 맵에만 적용됩니다)`))) return null;
        let id = PDM.slugId((kind === 'room' ? fl.id : 'map_' + fl.id) + '_tiles'), n = 2;
        while ((wd.customThemes || []).some(x => x.id === id)) id = PDM.slugId(fl.id + '_tiles' + n++);
        const rel = `assets/tiles/${id}.png`;
        try { await pdm.copy(PDM.assets.resolvePath('game:' + PDM.THEMES[base].tiles), store.abs(rel)); } catch (err) { toast('타일셋 복사 실패: ' + err.message, 'bad'); return null; }
        const c = { id, name: (fl.name || fl.id) + ' 타일', base, tiles: rel, water: '', music: '' };
        store.transaction('사용자 테마 만들기', () => {
          store.edit('world', '사용자 테마 추가', w => { w.customThemes = w.customThemes || []; w.customThemes.push(c); });
          store.edit(key, '테마', r => { if (kind === 'room') r.previewTheme = 'custom:' + id; else r.theme = 'custom:' + id; });
        });
        return c;
      }
      const afterTiles = () => { PDM.assets.clear(); PDM.tabs.refresh(); };
      async function editTileset() {
        const c = await ensureCustomTheme(); if (!c) return;
        const out = await PDM.editPixelsModal('타일셋 편집 — ' + c.name, c.tiles, 256, 256, 16);
        if (out && out !== c.tiles) store.edit('world', '타일셋 경로', w => { const x = (w.customThemes || []).find(t => t.id === c.id); if (x) x.tiles = out; });   // 다른 이름으로 저장
        if (out) afterTiles(); else PDM.tabs.refresh();
      }
      async function importTileset() {
        const c = await ensureCustomTheme(); if (!c) return;
        const f = await PDM.ui.pickImage('tiles'); if (!f) { PDM.tabs.refresh(); return; }
        store.edit('world', '타일셋 불러오기', w => { const x = (w.customThemes || []).find(t => t.id === c.id); if (x) x.tiles = f; });
        afterTiles();
      }
      async function editOneTile() {
        const t = PDM.TERRAIN_BY_ID[ui.terrain];
        if (!t || t.tile < 0) { toast('이 타일은 타일셋 그림을 쓰지 않습니다 (물은 테마의 물 그림)', 'bad'); return; }
        const c = await ensureCustomTheme(); if (!c) return;
        const img = await PDM.assets.load(c.tiles); if (!img) { toast('타일셋을 읽을 수 없습니다', 'bad'); return; }
        const sx = (t.tile % 16) * 16, sy = Math.floor(t.tile / 16) * 16;
        const one = h('canvas', { width: 16, height: 16 }); one.getContext('2d').drawImage(img, sx, sy, 16, 16, 0, 0, 16, 16);
        let result = null;
        const ed = PDM.pixelEditor({ width: 16, height: 16, src: one.toDataURL('image/png'), onSave: d => { result = d; PDM.$('.modal-foot .pri').click(); } });
        const ok = await PDM.ui.modal(`타일 그림 편집 — ${PDM.terrainName(t, up)} (${c.name})`, ed, [['취소', false], ['저장', () => true, 'pri']]);
        if (!ok) { PDM.tabs.refresh(); return; }
        const tile = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = result || ed.toDataURL(); });
        const all = h('canvas', { width: img.width, height: img.height }); const g = all.getContext('2d');
        g.drawImage(img, 0, 0); g.clearRect(sx, sy, 16, 16); g.drawImage(tile, sx, sy);
        try { await pdm.writeDataURL(store.abs(c.tiles), all.toDataURL('image/png')); } catch (err) { toast('저장 실패: ' + err.message, 'bad'); return; }
        afterTiles();
      }

      // ---- 캔버스 ----
      const cv = h('canvas', {});
      const info = h('div', { class: 'map-info' }, ' ');
      const sprites = {};
      async function loadSprites() {
        tilesImg = await PDM.assets.themeTiles(theme);
        for (const o of fl.objects || []) {
          if ((o.type === 'npc' || o.type === 'mob') && o.ref && !o.ref.startsWith('spd:')) {
            const c = store.get('char:' + o.ref);
            if (c && c.sprite && c.sprite.sheet) sprites[o.ref] = { img: await PDM.assets.load(c.sprite.sheet), c };
          } else if (o.type === 'prop' && o.ref) {
            const pr = store.get('prop:' + o.ref);
            if (pr && pr.sprite && pr.sprite.sheet) sprites['prop:' + o.ref] = { img: await PDM.assets.load(pr.sprite.sheet), prop: pr };
          } else if (o.type === 'item' && o.ref) {
            const it = store.get('item:' + o.ref);
            if (it) { const c2 = document.createElement('canvas'); await PDM.assets.drawItemSprite(c2, it.sprite, 1); sprites['item:' + o.ref] = { canvas: c2 }; }
          }
        }
        drawPalette(); paint();
      }
      const S = () => 16 * ui.zoom;
      let dragRect = null;
      function paint() {
        const s = S();
        const w = drawable ? W : 24, hh = drawable ? H : 12;
        cv.width = (w + PAD * 2) * s; cv.height = (hh + PAD * 2) * s;
        const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
        if (PAD) { g.fillStyle = 'rgba(20,18,26,.55)'; g.fillRect(0, 0, cv.width, cv.height); g.strokeStyle = 'rgba(255,255,255,.25)'; g.setLineDash([4, 4]); g.strokeRect(PAD * s - .5, PAD * s - .5, w * s + 1, hh * s + 1); g.setLineDash([]); }
        g.save(); g.translate(PAD * s, PAD * s);
        if (drawable) {
          for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) PDM.assets.drawTerrain(g, tilesImg, terrain[y * W + x], x * s, y * s, s, up);
          if (ui.zones) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {   // 구역 색: 벽 빨강 · 바닥 파랑 · 문 초록 · 낭떠러지 빗금
            const v = terrain[y * W + x], t = PDM.TERRAIN_BY_ID[v];
            if (v === 0) { g.strokeStyle = 'rgba(200,170,255,.55)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x * s + 2, y * s + s - 2); g.lineTo(x * s + s - 2, y * s + 2); g.stroke(); continue; }
            g.fillStyle = ZONE_DOORS.includes(v) ? 'rgba(70,220,110,.38)' : t && t.pass ? 'rgba(70,130,255,.28)' : 'rgba(255,70,70,.30)';
            g.fillRect(x * s, y * s, s, s);
          }
        } else {
          g.fillStyle = '#15131a'; g.fillRect(0, 0, cv.width, cv.height);
          g.fillStyle = '#9a93ad'; g.font = '14px sans-serif'; g.textAlign = 'center';
          g.fillText('이 층은 게임이 자동으로 생성합니다 (배치 규칙만 설정)', cv.width / 2, 30);
        }
        if (ui.grid && drawable) {
          g.strokeStyle = 'rgba(255,255,255,.08)'; g.beginPath();
          for (let x = 0; x <= W; x++) { g.moveTo(x * s + .5, 0); g.lineTo(x * s + .5, H * s); }
          for (let y = 0; y <= H; y++) { g.moveTo(0, y * s + .5); g.lineTo(W * s, y * s + .5); }
          g.stroke();
        }
        // 스폰 구역
        if (canSpawn && (ui.showSpawn || ui.tool === 'spawn')) {
          for (let i = 0; i < W * H; i++) {
            const v = spawnL[i]; if (!v) continue;
            const x = (i % W) * s, y = Math.floor(i / W) * s;
            g.fillStyle = v === 1 ? 'rgba(95,214,106,.32)' : 'rgba(255,90,106,.32)'; g.fillRect(x, y, s, s);
            if (v === 2) { g.strokeStyle = 'rgba(255,90,106,.7)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x + 2, y + 2); g.lineTo(x + s - 2, y + s - 2); g.moveTo(x + s - 2, y + 2); g.lineTo(x + 2, y + s - 2); g.stroke(); }
          }
        }
        // 출구·입구 번호 (통로 연결 배정)
        if (drawable && kind === 'node' && ui.showPorts) {
          const P_ = W_.ports(fl.id);
          const tag = (t, exit) => {
            const x = (t.cell % W) * s, y = Math.floor(t.cell / W) * s;
            const txt = `${exit ? '출' : '입'}${t.i + 1}`;
            g.font = `bold ${Math.max(9, s * .32)}px sans-serif`; g.textAlign = 'left'; g.textBaseline = 'top';
            const tw = g.measureText(txt).width + 4;
            g.fillStyle = t.what ? (exit ? '#9a3a3acc' : '#3a7a9acc') : '#555c'; g.fillRect(x, y, tw, Math.max(11, s * .38));
            g.fillStyle = '#fff'; g.fillText(txt, x + 2, y + 1);
            const to = t.edge ? W_.label(exit ? t.edge.to : t.edge.from) : t.what === 'main' ? '출구 연결' : t.what === 'back' ? '되돌아가기' : t.what === 'legacy' && !exit ? '' : t.what ? '' : '안 씀';
            if (to && s >= 24) { g.font = `${Math.max(8, s * .26)}px sans-serif`; g.textBaseline = 'bottom'; g.fillStyle = '#000a'; const w2 = g.measureText(to).width + 4; g.fillRect(x, y + s - Math.max(10, s * .3), w2, Math.max(10, s * .3)); g.fillStyle = '#ffe28a'; g.fillText(to, x + 2, y + s - 1); }
          };
          if (P_.hand) { P_.exits.forEach(t => tag(t, true)); P_.entrances.forEach(t => tag(t, false)); }
          else if (fl.mode === 'hybrid') { W_.tiles(fl.id, true).forEach((c, i) => tag({ cell: c, i, what: 'x' }, true)); }
        }
        // 오브젝트
        (fl.objects || []).forEach((o, i) => {
          let x, y;
          if (down && down.move === i && down.to) { x = down.to[0] * s; y = down.to[1] * s; }
          else if (drawable && o.at && o.at.x != null) { x = o.at.x * s; y = o.at.y * s; }
          else { x = (i % 12) * s * 2 + s / 2; y = (2 + Math.floor(i / 12) * 2) * s; }
          const col = (PDM.OBJECT_TYPES[o.type] || {}).color || '#fff';
          const sp = sprites[o.type === 'item' ? 'item:' + o.ref : o.type === 'prop' ? 'prop:' + o.ref : o.ref];
          if (sp && sp.img && sp.prop) {   // 맵 오브젝트: 시작 상태의 프레임, 칸 아래 가운데
            const pr = sp.prop, fw = pr.sprite.frame[0] || 16, fh = pr.sprite.frame[1] || 16, stt = (pr.states || [])[pr.start || 0] || {};
            const k = (pr.sprite.scale > 0 ? pr.sprite.scale : Math.min(1, 16 / fw, 16 / fh)) * (s / 16);
            PDM.assets.drawFrame(g, sp.img, fw, fh, (stt.frames && stt.frames.length ? stt.frames[0] : stt.frame) || 0, x + (s - fw * k) / 2, y + s - fh * k, k);
          } else if (sp && sp.img) { const fw = sp.c.sprite.frame[0], fh = sp.c.sprite.frame[1]; const sc = s / Math.max(fw, fh); PDM.assets.drawFrame(g, sp.img, fw, fh, 0, x + (s - fw * sc) / 2, y + (s - fh * sc), sc); }
          else if (sp && sp.canvas) g.drawImage(sp.canvas, x, y, s, s);
          else { g.fillStyle = col + 'cc'; g.fillRect(x + s * .15, y + s * .15, s * .7, s * .7); g.fillStyle = '#000'; g.font = `bold ${s * .5}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText({ npc: 'N', mob: 'M', item: 'I', event: 'E', start: 'S', prop: 'P' }[o.type] || '?', x + s / 2, y + s / 2 + 1); }
          g.strokeStyle = i === ui.sel ? '#fff' : col; g.lineWidth = i === ui.sel ? 2 : 1; g.strokeRect(x + 1, y + 1, s - 2, s - 2);
          if (!drawable) { g.fillStyle = '#ccc'; g.font = '10px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText(PDM.PLACE_RULES[(o.at && o.at.rule) || 'random'] || '', x + s / 2, y + s + 2); }
        });
        if (dragRect) {
          const [a, b, c, d] = dragRect, rx = Math.min(a, c) * s, ry = Math.min(b, d) * s, rw = (Math.abs(c - a) + 1) * s, rh = (Math.abs(d - b) + 1) * s;
          if (down === 'grow' || down === 'cut') { g.fillStyle = down === 'grow' ? 'rgba(95,214,106,.30)' : 'rgba(255,90,106,.34)'; g.fillRect(rx, ry, rw, rh); }
          g.strokeStyle = down === 'spawnrect' ? SPAWN_VALS[ui.spawnVal][1] : down === 'grow' ? '#5fd66a' : down === 'cut' ? '#ff5a6a' : '#a58bff'; g.lineWidth = 2; g.strokeRect(rx, ry, rw, rh);
        }
        g.restore();
      }
      const ZONE_DOORS = [5, 6, 10, 16, 31];
      const cellAt = e => { const r = cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / S()) - PAD, Math.floor((e.clientY - r.top) / S()) - PAD]; };

      // ---- 맵 공간 넓히기/빼기 (Ctrl+끌기 / Alt+끌기) ----
      /** 새 크기로 옮겨 담기: 옛 (ox, oy) 가 새 (0, 0). 새 칸은 벽. edit(nt, nw, nh) 로 마무리 손질 */
      function reshape(ox, oy, nw, nh, label, editFn) {
        const nt = new Array(nw * nh).fill(4), ns = new Array(nw * nh).fill(0);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const tx = x - ox, ty = y - oy; if (tx < 0 || ty < 0 || tx >= nw || ty >= nh) continue;
          nt[ty * nw + tx] = terrain[y * W + x]; if (spawnL) ns[ty * nw + tx] = spawnL[y * W + x] || 0;
        }
        const gone = editFn ? editFn(nt, nw, nh) || (() => false) : () => false;
        store.edit(key, label, r => {
          r.size = { w: nw, h: nh }; r.layers.terrain = nt; if (r.layers.spawn) r.layers.spawn = ns;
          r.objects = (r.objects || []).filter(o => { if (!o.at || o.at.x == null) return true; o.at.x -= ox; o.at.y -= oy; return o.at.x >= 0 && o.at.y >= 0 && o.at.x < nw && o.at.y < nh && !gone(o.at.x, o.at.y); });
        });
      }
      function growSpace(x0, y0, x1, y1) {
        // 끈 영역 = 바닥, 그 둘레 한 칸은 벽이 되도록 맵을 넓힘
        const ox = Math.min(0, x0 - 1), oy = Math.min(0, y0 - 1), ex = Math.max(W - 1, x1 + 1), ey = Math.max(H - 1, y1 + 1);
        const nw = ex - ox + 1, nh = ey - oy + 1;
        if (nw > MAXS || nh > MAXS) { toast(`최대 ${MAXS}×${MAXS}칸까지입니다 (${nw}×${nh})`, 'bad'); return; }
        reshape(ox, oy, nw, nh, '맵 공간 추가', nt => {
          for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            const tx = x - ox, ty = y - oy, edge = tx === 0 || ty === 0 || tx === nw - 1 || ty === nh - 1;
            if (!edge && nt[ty * nw + tx] === 4) nt[ty * nw + tx] = 1;
          }
        });
      }
      function cutSpace(x0, y0, x1, y1) {
        x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W - 1, x1); y1 = Math.min(H - 1, y1);
        if (x0 > x1 || y0 > y1) return;
        // 끈 영역을 벽으로 메우고, 바깥쪽에 벽만 남은 줄은 잘라냄 (둘레 벽 한 칸은 남김)
        const t2 = terrain.slice();
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) t2[y * W + x] = 4;
        let bx0 = W, by0 = H, bx1 = -1, by1 = -1;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (t2[y * W + x] !== 4) { bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y); }
        let ox = 0, oy = 0, nw = W, nh = H;
        if (bx1 >= 0) {
          ox = Math.max(0, bx0 - 1); oy = Math.max(0, by0 - 1); nw = Math.min(W - 1, bx1 + 1) - ox + 1; nh = Math.min(H - 1, by1 + 1) - oy + 1;
          if (nw < MINS) { ox = Math.max(0, Math.min(ox, W - MINS)); nw = Math.min(W, MINS); }
          if (nh < MINS) { oy = Math.max(0, Math.min(oy, H - MINS)); nh = Math.min(H, MINS); }
        }
        reshape(ox, oy, nw, nh, '맵 공간 빼기', nt => {
          for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const tx = x - ox, ty = y - oy; if (tx >= 0 && ty >= 0 && tx < nw && ty < nh) nt[ty * nw + tx] = 4; }
          return (x, y) => x + ox >= x0 && x + ox <= x1 && y + oy >= y0 && y + oy <= y1;
        });
      }
      const inB = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
      function objAt(x, y) {
        return (fl.objects || []).findIndex((o, i) => drawable ? (o.at && o.at.x === x && o.at.y === y)
          : (Math.floor(((i % 12) * 2 * S() + S() / 2) / S()) === x && 2 + Math.floor(i / 12) * 2 === y));
      }
      function flood(x0, y0, v) {
        const t0 = terrain[y0 * W + x0]; if (t0 === v) return;
        const st = [[x0, y0]];
        while (st.length) { const [x, y] = st.pop(); if (!inB(x, y) || terrain[y * W + x] !== t0) continue; terrain[y * W + x] = v; st.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]); }
      }
      function commitSpawn(label) { const copy = spawnL.slice(); store.edit(key, label, r => { r.layers.spawn = copy; if (!r.spawn) r.spawn = { enabled: true, mobs: [], initial: 3, max: 6, respawn: 50, minDist: 8 }; }, { silent: !!fl.spawn }); }
      function spawnFill(x0, y0, v) {
        // 같은 "지나갈 수 있음" 영역(벽으로 막힌 방)을 채움
        const pass = i => { const t = PDM.TERRAIN_BY_ID[terrain[i]]; return t && t.pass; };
        const want = pass(y0 * W + x0), seen = new Set(), st = [[x0, y0]];
        while (st.length) { const [x, y] = st.pop(); const i = y * W + x; if (!inB(x, y) || seen.has(i) || pass(i) !== want) continue; seen.add(i); spawnL[i] = v; st.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]); }
      }
      function commitTerrain(label) { const copy = terrain.slice(); store.edit(key, label, r => { r.layers.terrain = copy; }, { silent: true }); }
      let down = null;
      cv.addEventListener('contextmenu', e => e.preventDefault());
      cv.addEventListener('mousedown', e => {
        const [x, y] = cellAt(e);
        if (drawable && e.button === 0 && (e.ctrlKey || e.altKey)) { e.preventDefault(); down = e.ctrlKey ? 'grow' : 'cut'; dragRect = [x, y, x, y]; paint(); return; }
        if (drawable && e.button === 2 && inB(x, y)) { ui.terrain = terrain[y * W + x]; if (ui.tool === 'object' || ui.tool === 'select') ui.tool = 'pen'; drawPalette(); drawTools(); return; }
        if (ui.tool === 'spawn' && canSpawn && inB(x, y)) {
          if (e.button === 2) return;
          if (ui.spawnShape === 'rect') { down = 'spawnrect'; dragRect = [x, y, x, y]; paint(); }
          else if (ui.spawnShape === 'fill') { spawnFill(x, y, ui.spawnVal); paint(); commitSpawn('스폰 구역 채우기'); }
          else { down = 'spawn'; spawnL[y * W + x] = ui.spawnVal; paint(); }
          return;
        }
        if (ui.tool === 'pen' && inB(x, y)) { down = 'pen'; terrain[y * W + x] = ui.terrain; paint(); }
        else if ((ui.tool === 'rect' || ui.tool === 'room') && inB(x, y)) { down = ui.tool; dragRect = [x, y, x, y]; paint(); }
        else if (ui.tool === 'fill' && inB(x, y)) { flood(x, y, ui.terrain); paint(); commitTerrain('채우기'); }
        else if (ui.tool === 'pick' && inB(x, y)) { ui.terrain = terrain[y * W + x]; ui.tool = 'pen'; drawPalette(); drawTools(); }
        else if (ui.tool === 'object') {
          if (!ui.objRef && ui.objType !== 'start') { toast('놓을 대상을 먼저 고르세요', 'bad'); return; }
          const o = { id: PDM.uid('o'), type: ui.objType, ref: ui.objType === 'start' ? '' : ui.objRef, at: drawable ? { x, y } : { rule: 'random' }, cond: '', count: 1 };
          ui.sel = (fl.objects || []).length;   // 새로 놓은 것을 선택 상태로
          store.edit(key, '오브젝트 놓기', r => { r.objects = r.objects || []; r.objects.push(o); });
        } else if (ui.tool === 'select') {
          const i = objAt(x, y); ui.sel = i; paint(); showInspector();
          if (i >= 0 && drawable) down = { move: i, from: [x, y] };
        }
      });
      cv.addEventListener('mousemove', e => {
        const [x, y] = cellAt(e);
        const t = inB(x, y) && drawable ? PDM.TERRAIN_BY_ID[terrain[y * W + x]] : null;
        const oi = objAt(x, y);
        info.textContent = `(${x}, ${y})  ${t ? PDM.terrainName(t, up) + ' [' + t.id + ']' : ''}${canSpawn && inB(x, y) && spawnL[y * W + x] ? ' · ' + SPAWN_VALS[spawnL[y * W + x]][0] : ''}  ${oi >= 0 ? '· ' + PDM.OBJECT_TYPES[fl.objects[oi].type].name + ' ' + (fl.objects[oi].ref || '') : ''}`;
        if (down === 'pen' && inB(x, y) && terrain[y * W + x] !== ui.terrain) { terrain[y * W + x] = ui.terrain; paint(); }
        else if (down === 'spawn' && inB(x, y) && spawnL[y * W + x] !== ui.spawnVal) { spawnL[y * W + x] = ui.spawnVal; paint(); }
        else if ((down === 'grow' || down === 'cut') && dragRect) { dragRect[2] = PDM.clamp(x, -PAD, W - 1 + PAD); dragRect[3] = PDM.clamp(y, -PAD, H - 1 + PAD); paint(); }
        else if ((down === 'rect' || down === 'room' || down === 'spawnrect') && dragRect) { dragRect[2] = PDM.clamp(x, 0, W - 1); dragRect[3] = PDM.clamp(y, 0, H - 1); paint(); }
        else if (down && down.move !== undefined) { if (inB(x, y)) { down.to = [x, y]; paint(); } }
      });
      const onUp = () => {
        if ((down === 'grow' || down === 'cut') && dragRect) {
          const [a, b, c, d] = dragRect, mode = down; dragRect = null; down = null;
          const x0 = Math.min(a, c), x1 = Math.max(a, c), y0 = Math.min(b, d), y1 = Math.max(b, d);
          if (mode === 'grow') growSpace(x0, y0, x1, y1); else cutSpace(x0, y0, x1, y1);
          paint(); return;
        }
        if (down === 'pen') commitTerrain('타일 그리기');
        else if (down === 'spawn') commitSpawn('스폰 구역 칠하기');
        else if (down === 'spawnrect' && dragRect) {
          const [a, b, c, d] = dragRect;
          for (let y = Math.min(b, d); y <= Math.max(b, d); y++) for (let x = Math.min(a, c); x <= Math.max(a, c); x++) spawnL[y * W + x] = ui.spawnVal;
          dragRect = null; paint(); commitSpawn('스폰 구역 사각형');
        }
        else if ((down === 'rect' || down === 'room') && dragRect) {
          const [a, b, c, d] = dragRect, x0 = Math.min(a, c), x1 = Math.max(a, c), y0 = Math.min(b, d), y1 = Math.max(b, d);
          for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            const edge = x === x0 || x === x1 || y === y0 || y === y1;
            terrain[y * W + x] = down === 'room' ? (edge ? 4 : ui.terrain === 4 ? 1 : ui.terrain) : ui.terrain;
          }
          dragRect = null; paint(); commitTerrain(down === 'room' ? '방 만들기' : '사각형 채우기');
        } else if (down && down.move !== undefined && down.to) {
          const i = down.move, [x, y] = down.to;
          down = null;
          store.edit(key, '오브젝트 이동', r => { r.objects[i].at = { x, y }; }, { silent: true });
          paint(); showInspector();
        }
        down = null;
      };
      addEventListener('mouseup', onUp);
      const onKey = e => {
        if (PDM.tabs.active !== key || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
        if (e.key === 'Delete' && ui.sel >= 0) { const i = ui.sel; ui.sel = -1; store.edit(key, '오브젝트 삭제', r => { r.objects.splice(i, 1); }); }
      };
      addEventListener('keydown', onKey);
      ctx.onDispose(() => { removeEventListener('mouseup', onUp); removeEventListener('keydown', onKey); });

      // ---- 인스펙터: 층 속성 / 선택한 오브젝트 ----
      function showInspector() {
        const { F, section, row } = PDM.ui;
        const o = fl.objects && fl.objects[ui.sel];
        if (o) {
          const p = ['objects', ui.sel];
          const refKind = { npc: 'char', mob: 'char', item: 'item', event: 'event', prop: 'prop', effect: 'effect' }[o.type];
          const el = h('div', {},
            F.select(key, [...p, 'type'], Object.fromEntries(Object.entries(PDM.OBJECT_TYPES).map(([k, v]) => [k, v.name])), { label: '종류' }),
            refKind ? F.ref(key, [...p, 'ref'], refKind, { label: '대상' }) : null,
            drawable ? row(F.num(key, [...p, 'at', 'x'], { label: 'x', int: true, rerender: true }), F.num(key, [...p, 'at', 'y'], { label: 'y', int: true, rerender: true }))
              : F.select(key, [...p, 'at', 'rule'], PDM.PLACE_RULES, { label: '배치 규칙' }),
            F.cond(key, [...p, 'cond'], { label: '등장 조건', hint: '비우면 항상 등장. 예: !switch.mireille_joined' }),
            o.type === 'mob' || o.type === 'item' ? F.num(key, [...p, 'count'], { label: '개수', min: 1, int: true }) : null,
            o.type === 'item' ? F.select(key, [...p, 'container'], PDM.ITEM_CONTAINERS, { label: '담는 방식' }) : null,
            o.type === 'npc' ? F.ref(key, [...p, 'event'], 'event', { label: '말 걸면 실행할 이벤트', empty: '(캐릭터의 인사 대사)' }) : null,
            F.text(key, [...p, 'note'], { label: '메모' }),
            h('div', { style: { display: 'flex', gap: '6px', marginTop: '8px' } },
              refKind ? h('button', { class: 'btn sm', onclick: () => o.ref && !o.ref.startsWith('spd:') && PDM.tabs.open(refKind === 'effect' ? 'effects' : `${refKind}:${o.ref}`) }, '대상 열기') : null,
              h('button', { class: 'btn sm danger', onclick: () => { const i = ui.sel; ui.sel = -1; store.edit(key, '오브젝트 삭제', r => { r.objects.splice(i, 1); }); } }, '삭제')));
          PDM.inspector.show(`${PDM.OBJECT_TYPES[o.type].name} #${ui.sel}`, el);
          return;
        }
        const pr = ['procedural'];
        let el;
        if (kind === 'room') {
          const used = roomUsage(fl.id);
          el = h('div', {},
            F.text(key, ['name'], { label: '방 이름', rerender: true }),
            F.select(key, ['kind'], { standard: '일반 방 (여러 방과 연결)', special: '특수 방 (입구 하나, 막다른 방)' }, { label: '종류' }),
            F.bool(key, ['keepClean'], { label: '자동 아이템·몬스터를 이 방에 놓지 않기', rerender: true }),
            (() => { const on = fl.noMobs === undefined ? !fl.keepClean : !fl.noMobs; const cb = h('input', { type: 'checkbox', checked: on, onchange: () => store.edit(key, '방의 몬스터 스폰', r => { r.noMobs = !cb.checked; }) });
              return h('label', { class: 'check', title: '켜면 게임이 이 방 안에도 몬스터를 놓고 다시 생기게 합니다. 끄면 이 방 안에는 몬스터가 생기지 않습니다 (방에 직접 놓은 몬스터는 그대로)' }, cb, '몬스터 스폰 (이 방 안에 몬스터가 생김)'); })(),
            F.select(key, ['cat'], Object.fromEntries(((store.get('project') || {}).roomCats || []).map(c => [c, c])), { label: '분류', empty: '(분류 없음)', hint: '리소스 목록에서 방을 분류로 끌어다 놓아도 됩니다' }),
            F.ref(key, ['previewTheme'], 'theme', { label: '테마 (편집 화면)', empty: `자동: ${themeName(roomAutoTheme(fl) || 'SEWER')}`, rerender: true, hint: '게임에서는 방이 들어간 맵의 테마 타일로 그려집니다' }),
            section('자동 생성',
              F.bool(key, ['auto'], { label: '자동 생성 맵에 이 방을 자동으로 넣기', rerender: true }),
              fl.auto ? F.num(key, ['autoChance'], { label: '맵마다 나올 확률(%)', int: true, min: 0, max: 100 }) : null,
              fl.auto ? h('div', {}, h('div', { class: 'fl' }, '나올 그룹 (아무것도 안 고르면 모든 그룹)'),
                ((store.get('world') || {}).groups || []).filter(g => !g.safe).map(g => h('label', { style: { display: 'block' } },
                  h('input', { type: 'checkbox', checked: (fl.autoGroups || []).includes(g.id), onchange: e => store.edit(key, '자동 생성 그룹', r => { const a = new Set(r.autoGroups || []); e.target.checked ? a.add(g.id) : a.delete(g.id); r.autoGroups = [...a]; }) }), ' ' + g.name))) : null,
              h('div', { class: 'hint' }, fl.auto ? '그룹·노드의 "추가 방"이나 구성 블럭에 이미 넣은 맵에는 중복으로 넣지 않습니다. 보스 층과 직접 그린 맵에는 들어가지 않습니다.' : '꺼 두면 그룹·노드의 "추가 방"이나 구성 블럭에서 고른 맵에만 들어갑니다.')),
            section('크기 (5~18칸, 벽 포함)', resizeUI(5, 18), h('div', { class: 'hint' }, '맵 위에서 Ctrl+끌기로 넓히고 Alt+끌기로 뺄 수도 있습니다.')),
            h('div', { class: 'hint' }, '쓰는 곳: ', used.length ? used.join(', ') : '없음 — 장 구성 화면이나 층 속성의 "추가 방"에서 고르세요'),
            F.textarea(key, ['note'], { label: '메모' }),
            h('div', { class: 'hint' }, `오브젝트 ${(fl.objects || []).length}개 (방이 놓인 위치 기준 좌표)`));
          PDM.inspector.show('방 템플릿 속성', el);
          return;
        }
        const grp = groupOfNode(fl);
        const I = W_.info();
        const outs = W_.outEdges(fl.id), ins = W_.inEdges(fl.id);
        const link = id => h('a', { href: '#', onclick: ev => { ev.preventDefault(); PDM.tabs.open('node:' + id); } }, W_.fullName(id));
        el = h('div', {},
          F.text(key, ['name'], { label: '맵 이름(선택)', rerender: true }),
          row(F.text(key, ['label'], { label: '층 표시 (비우면 자동)', placeholder: W_.label(fl.id), rerender: true }),
            F.num(key, ['depth'], { label: '난이도 깊이 (0=자동)', int: true, min: 0, max: 30, rerender: true, hint: `지금 ${I.depth[fl.id]} · branch ${I.branch[fl.id]}` })),
          F.bool(key, ['boss'], { label: '보스 층 (자동 생성일 때 테마의 보스 방)' }),
          F.ref(key, ['theme'], 'theme', { label: '테마', empty: `(그룹 테마: ${themeName((grp || {}).theme) || '깊이 기본'})`, rerender: true }),
          fl.mode !== 'handmade' ? section('구성 블럭 (자동 생성)',
            h('div', { class: 'hint' }, '블럭을 쌓아 이 층의 구성을 정합니다. 방의 위치와 연결, 방 안의 내용은 게임이 들어갈 때마다 자동으로 만듭니다.'
              + (!((fl.procedural || {}).blocks || []).length && grp && (grp.blocks || []).length ? ` 지금은 그룹 「${grp.name}」 의 블럭 ${grp.blocks.length}개를 따릅니다.` : '')),
            blockListEditor(key, [...pr, 'blocks'], grp && (grp.blocks || []).length ? { emptyText: `블럭 없음 — 그룹 「${grp.name}」 의 구성 블럭을 따릅니다. 여기에 쌓으면 이 노드만 다른 구성이 됩니다.` } : {}),
            fl.mode === 'hybrid' ? F.select(key, ['hybrid', 'placement'], { special: '특수 방으로 (막다른 방)', random: '일반 방으로 (여러 방과 연결)' }, { label: '직접 그린 방을 넣는 방식' }) : null) : null,
          fl.mode !== 'handmade' ? section('추가 방 (방 템플릿)',
            h('div', { class: 'hint' }, '자동 생성할 때 이 방들을 함께 넣습니다.' + (grp && (grp.rooms || []).length ? ` 그룹 「${grp.name}」 의 방 ${grp.rooms.length}개도 들어갑니다.` : '')),
            roomListEditor(key, [...pr, 'rooms'])) : null,
          drawable ? section('크기', resizeUI(5, 80)) : null,
          canSpawn ? spawnSection() : null,
          section('연결',
            h('div', { class: 'hint' }, '들어오는 곳: '), ins.length ? ins.map(e => h('div', {}, '← ', link(e.from), portText(e, false))) : h('div', { class: 'hint' }, fl.id === (store.get('world') || {}).start ? '시작 노드' : '없음 (이벤트 "맵 이동"이나 입구 목적지로만 옴)'),
            h('div', { class: 'hint', style: { marginTop: '4px' } }, '나가는 곳: '), outs.length ? outs.map(e => h('div', {}, '→ ', link(e.to), portText(e, true))) : h('div', { class: 'hint' }, '없음 — 출구가 온 곳으로 되돌아갑니다'),
            h('div', { class: 'hint', style: { marginTop: '4px' } }, '연결은 맵 그래프에서 노드 오른쪽 점을 끌어서 만듭니다 (같은 두 노드 사이에 여러 개 가능). 연결을 누르면 쓸 출구·입구 번호를 고를 수 있습니다.'),
            F.select(key, ['entranceTo'], W_.options().filter(([id]) => id !== fl.id), { label: '입구 계단 목적지 (고급)', empty: '(기본: 온 곳으로 돌아가기)', hint: '예: 1층 입구 → 마을. 시작 노드의 입구는 기본이 "지상으로 나가기"' })),
          F.ref(key, ['onEnter'], 'event', { label: '들어올 때 이벤트 (처음 한 번)', empty: '(없음)' }),
          F.textarea(key, ['note'], { label: '메모' }),
          h('div', { class: 'hint' }, `오브젝트 ${(fl.objects || []).length}개 · 파일 maps/nodes/${fl.id}.json`));
        PDM.inspector.show(`${W_.fullName(fl.id)} 속성`, el);
      }
      /** 연결 한 줄 설명: 종류 + 쓰는 출구·입구 번호 */
      function portText(e, out) {
        const k = e.kind || 'main';
        if (k === 'stair') return ' (샛길 계단' + (e.cond ? ', 조건' : '') + ')';
        if (k === 'main') { const n = W_.outEdges(e.from).filter(x => (x.kind || 'main') === 'main').length; return ' (갈림길 출구' + (n > 1 ? ` · 무게 ${e.weight ?? 100}` : '') + ')'; }
        const P_ = W_.ports(fl.id);
        const t = (out ? P_.exits : P_.entrances).find(x => x.edge && x.edge.id === e.id);
        const extra = (out ? P_.extraOut : P_.extraIn).some(x => x.id === e.id);
        return h('span', {}, ' (통로 · ', t ? h('b', {}, `${out ? '출구' : '입구'} ${t.i + 1}`) : extra ? '새 계단' : '자동', e.cond ? ' · 조건' : '', ') ',
          h('a', { href: '#', onclick: ev => { ev.preventDefault(); PDM.tabs.open('world'); setTimeout(() => PDM.worldSelectEdge && PDM.worldSelectEdge(e.id), 60); } }, '설정'));
      }
      /** 몬스터 스폰 (직접 그린 노드) */
      function spawnSection() {
        const { F, section, row } = PDM.ui;
        const sp = fl.spawn || {};
        const nz = spawnL.filter(v => v === 1).length, nf = spawnL.filter(v => v === 2).length;
        const mobOpts = [...store.all('char').filter(c => ['mob', 'boss'].includes(c.kind)).map(c => [c.id, c.name]),
          ...['rat', 'albino', 'gnoll', 'crab', 'slime', 'snake', 'swarm', 'skeleton', 'thief', 'bat', 'brute', 'spinner', 'monk', 'warlock', 'golem', 'succubus', 'eye', 'scorpio'].map(m => ['spd:' + m.charAt(0).toUpperCase() + m.slice(1), `(게임) ${m}`])];
        return section('몬스터 스폰',
          F.bool(key, ['spawn', 'enabled'], { label: '이 맵에서 몬스터가 생기고 다시 생김', rerender: true }),
          sp.enabled ? h('div', {},
            row(F.num(key, ['spawn', 'initial'], { label: '처음 수', int: true, min: 0, max: 40, def: 3 }), F.num(key, ['spawn', 'max'], { label: '최대 수', int: true, min: 0, max: 40, def: 6 })),
            row(F.num(key, ['spawn', 'respawn'], { label: '다시 생기는 간격 (턴)', int: true, min: 1, def: 50, hint: '게임 기본 50' }), F.num(key, ['spawn', 'minDist'], { label: '영웅과 최소 거리', int: true, min: 0, max: 30, def: 8 })),
            h('div', { class: 'fl', style: { marginTop: '6px' } }, '나오는 몬스터 (무게대로 무작위 · 비우면 깊이에 맞는 게임 기본 몬스터)'),
            PDM.ui.listEditor(key, ['spawn', 'mobs'], { addLabel: '몬스터 추가', compact: true,
              make: () => ({ ref: (mobOpts[0] || [''])[0], weight: 1 }),
              render: (it, i, ip) => row(F.select(key, [...ip, 'ref'], mobOpts, { label: '몬스터' }), F.num(key, [...ip, 'weight'], { label: '무게', int: true, min: 0, def: 1 })) }),
            h('div', { class: 'hint', style: { marginTop: '6px' } }, `스폰 구역 ${nz}칸 · 금지 ${nf}칸 — 도구 막대의 "☗ 스폰 구역"으로 칠합니다. ${nz ? '초록 칸 안에서만 생깁니다.' : '초록 칸이 없으면 빨강을 뺀 아무 곳(영웅 시야 밖)에서 생깁니다.'}`),
            h('div', { style: { display: 'flex', gap: '6px', marginTop: '4px' } },
              h('button', { class: 'btn sm', onclick: () => { ui.tool = 'spawn'; ui.showSpawn = true; drawTools(); drawPalette(); paint(); } }, '구역 칠하기'),
              h('button', { class: 'btn sm', onclick: () => { spawnL = new Array(W * H).fill(0); paint(); commitSpawn('스폰 구역 지우기'); } }, '구역 모두 지우기')))
            : h('p', { class: 'hint' }, '끄면 이 맵에는 직접 놓은 몬스터만 있고 새로 생기지 않습니다.'));
      }
      function resizeUI(minS, maxS) {
        const wI = h('input', { type: 'number', value: W, min: minS, max: maxS }), hI = h('input', { type: 'number', value: H, min: minS, max: maxS });
        return h('div', {}, PDM.ui.row(PDM.ui.field('가로', wI), PDM.ui.field('세로', hI)),
          h('button', { class: 'btn sm', onclick: () => {
            const nw = PDM.clamp(+wI.value | 0, minS, maxS), nh = PDM.clamp(+hI.value | 0, minS, maxS);
            const nt = blankTerrain(nw, nh, false);
            for (let y = 0; y < Math.min(nh, H); y++) for (let x = 0; x < Math.min(nw, W); x++) nt[y * nw + x] = terrain[y * W + x];
            const ns = new Array(nw * nh).fill(0);
            if (spawnL) for (let y = 0; y < Math.min(nh, H); y++) for (let x = 0; x < Math.min(nw, W); x++) ns[y * nw + x] = spawnL[y * W + x] || 0;
            store.edit(key, '크기 바꾸기', r => { r.size = { w: nw, h: nh }; r.layers.terrain = nt; if (r.layers.spawn) r.layers.spawn = ns; r.objects = (r.objects || []).filter(o => !o.at || o.at.x == null || (o.at.x < nw && o.at.y < nh)); });
          } }, '크기 적용'),
          h('button', { class: 'btn sm', style: { marginLeft: '4px' }, onclick: () => { terrain = blankTerrain(W, H, true); paint(); commitTerrain('방 틀로 초기화'); } }, '방 틀로 초기화'));
      }
      ui.show = showInspector;

      drawTools(); drawPalette(); loadSprites(); paint();
      setTimeout(showInspector, 0);
      return h('div', { class: 'page full' }, h('div', { class: 'map-wrap' }, palette,
        h('div', { class: 'map-main' }, tools, h('div', { class: 'map-scroll' }, cv), info)));
    }
  });

  PDM.mapUtil = { themeOf, themeName, newRoom, drawThumb, roomListEditor, blockListEditor, roomUsage, blankTerrain, showGameRoom, gameRoomGroups, gameRoomPreviews, showRoomGallery };
})();
