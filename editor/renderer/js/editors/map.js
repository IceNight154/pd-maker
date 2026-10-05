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
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, h('h4', {}, `프로젝트 방 템플릿 (${mine.length})`),
        h('button', { class: 'btn xs add', onclick: () => { closeBtn(); newRoom(); } }, '+ 새 방 템플릿')),
      mine.length ? null : h('p', { class: 'hint' }, '아직 없습니다 — "+ 새 방 템플릿"으로 만드세요.'),
      mine.length ? grid(mine.map(r => {
        // 프로젝트 방: 누르면 편집, 아래 버튼 = 편집 · 복제 · 삭제 (오른쪽 클릭 = 리소스 목록과 같은 메뉴)
        const c = card(roomCanvas(r, 10, 96), r.name, r.id, () => { closeBtn(); PDM.tabs.open('room:' + r.id); });
        const btn = (t, tip, run, cls) => h('button', { class: 'btn xs' + (cls ? ' ' + cls : ''), title: tip, onclick: e => { e.stopPropagation(); run(); } }, t);
        c.append(h('div', { style: { display: 'flex', gap: '3px', justifyContent: 'center', marginTop: '4px' } },
          btn('편집', '열어서 고치기', () => { closeBtn(); PDM.tabs.open('room:' + r.id); }),
          btn('복제', '사본을 만들어 엶', () => { closeBtn(); PDM.resOps.dup('room', r.id); }),
          btn('삭제', '방 템플릿 삭제 (쓰는 곳 수를 보여 줌)', async () => { if (await PDM.resOps.remove('room', r.id)) { closeBtn(); showRoomGallery(); } }, 'danger')));
        c.oncontextmenu = e => { e.preventDefault(); e.stopPropagation(); PDM.ui.menu(e.clientX, e.clientY, PDM.resOps.menu('room', r.id).map(m => m && m.run ? Object.assign({}, m, { run: () => { closeBtn(); m.run(); } }) : m)); };
        return c;
      })) : null,
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
    if (!list.length) wrap.append(h('div', { class: 'empty' }, o.emptyText || '블럭 없음 — 게임 코드의 구성으로 만듭니다 (아래). 위에서 블럭을 눌러 쌓으면 그 구성대로 자동 생성합니다.'),
      !o.emptyText && o.theme ? PDM.gameLevelBox(o.theme) : null,
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

  /** 안전구역 설정 칸 (맵 노드 · 방 템플릿 공통) — 런타임 MakerSafe */
  function safeFields(key, fl, where) {
    const { F } = PDM.ui, sf = fl.safe || {};
    const cb = (k, def, label, title) => { const c = h('input', { type: 'checkbox', checked: sf[k] === undefined ? def : !!sf[k] }); c.onchange = () => store.edit(key, '안전구역', r => { r.safe = r.safe || { on: true }; r.safe[k] = c.checked; }, { silent: true }); return h('label', { class: 'check', title: title || '' }, c, label); };
    const on = h('input', { type: 'checkbox', checked: !!sf.on }); on.onchange = () => store.edit(key, '안전구역', r => { r.safe = Object.assign({ hunger: true, feed: false, cure: true, heal: 0, msg: true }, r.safe || {}, { on: on.checked }); });
    return h('div', { style: { border: '1px solid var(--line)', borderRadius: '6px', padding: '6px 8px', margin: '6px 0' } },
      h('label', { class: 'check', title: `${where} 안전구역으로 씁니다` }, on, h('b', {}, '🛡 안전구역 사용'), h('span', { class: 'hint', style: { marginLeft: '6px' } }, `(${where})`)),
      sf.on ? h('div', { style: { marginLeft: '18px' } },
        cb('hunger', true, '허기가 쌓이지 않음 (머무는 동안 천천히 풀림)'),
        cb('feed', false, '들어올 때 허기를 모두 풂'),
        cb('cure', true, '해로운 상태이상 해제 (중독 · 화상 · 출혈 · 약화 · 실명 등 — 머무는 동안 계속)'),
        cb('msg', true, '들어올 때 · 나갈 때 알림 글 표시'),
        F.num(key, ['safe', 'heal'], { label: '턴마다 체력 회복 (0 = 없음)', int: true, min: 0, max: 99, def: 0 }),
        h('div', { class: 'hint' }, '이벤트 조건식에서 safe 로 "지금 안전구역 안인지"를 확인할 수 있습니다. 몬스터를 막으려면 몬스터 스폰 설정도 함께 끄세요.')) : null);
  }
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
      ui.moveObj = -1; ui.moveTo = null;   // 우클릭 메뉴의 "이동": 다음에 누르는 칸으로 옮기는 중인 오브젝트
      if (ui.zones === undefined) ui.zones = kind === 'room';
      if (ui.spawnVal === undefined) Object.assign(ui, { spawnVal: 1, spawnShape: 'pen', showSpawn: true, showPorts: true });
      const W = fl.size.w, H = fl.size.h;
      const drawable = kind !== 'node' || fl.mode !== 'procedural';
      const PAD = drawable ? 3 : 0;                                     // 맵 둘레 여백 칸 (모서리를 끌어 넓히거나 바깥에 그려 넓힐 자리)
      const MINS = 5, MAXS = kind === 'room' ? 18 : fl.mode === 'hybrid' ? 16 : 80;
      const up = isUp(fl, kind);
      if (drawable && (!fl.layers || !fl.layers.terrain || fl.layers.terrain.length !== W * H)) {
        store.edit(key, '타일 초기화', r => { r.layers = r.layers || {}; r.layers.terrain = blankTerrain(W, H, true); }, { silent: true });
      }
      // ---- 맵 세부 그리기: 맵 전체 그림(칸당 16px)을 스프라이트 편집기로 — 그리기·편집 기능만 보임
      if (ui.paintMode && kind === 'node' && fl.mode === 'handmade') {
        const PW = W * 16, PH = H * 16, body = h('div', { style: { flex: '1', overflow: 'auto', padding: '10px' } }, '불러오는 중…');
        const rel0 = (fl.paint && fl.paint.image) || `assets/maps/${fl.id}.png`;
        let ed = null;
        const back = () => { ui.paintMode = false; PDM.tabs.refresh(key); };
        const write = async (rel, d) => {
          try { await pdm.writeDataURL(store.abs(rel), d); } catch (err) { toast('저장 실패: ' + err.message, 'bad'); return false; }
          PDM.assets.invalidate(rel);
          store.edit(key, '맵 세부 그림', r => { r.paint = Object.assign({ enabled: true }, r.paint, { image: rel }); }, { silent: true });
          PDM.log('맵 세부 그림 저장: ' + rel, 'ok'); toast('저장했습니다: ' + rel, 'ok'); return true;
        };
        const saveAs = async d => {
          let out = (await PDM.ui.prompt('다른 이름으로 저장 — 프로젝트 안의 경로', rel0.replace(/(\.png)?$/i, '_copy.png'), '새 PNG 파일로 저장하고, 이 맵이 그 파일을 쓰게 됩니다.') || '').trim().replace(/\\/g, '/');
          if (!out) return;
          if (/^([A-Za-z]:|\/|\.\.)/.test(out) || out.startsWith('game:')) { toast('프로젝트 폴더 안의 경로를 적어 주세요 (예: assets/maps/…)', 'bad'); return; }
          if (!/\.png$/i.test(out)) out += '.png';
          if (await write(out, d)) PDM.tabs.refresh(key);
        };
        const exportPng = async () => {
          const d = ed.toDataURL(), name = `${fl.id}_map.png`;
          try { const out = await pdm.saveFile('맵 그림 내보내기', name, ['png']); if (!out) return; await pdm.writeDataURL(out, d); toast('내보냈습니다: ' + out, 'ok'); }
          catch (_) { const a = h('a', { href: d, download: name }); document.body.append(a); a.click(); a.remove(); }   // 웹 모드: 내려받기
        };
        /** 지금 타일 배치를 그림으로 (처음 시작할 때의 바탕 · "타일에서 다시 만들기") */
        const fromTiles = async () => {
          const c = h('canvas', { width: PW, height: PH }), g = c.getContext('2d'); g.imageSmoothingEnabled = false;
          const tiles = await PDM.assets.themeTiles(themeKey(themeOf(fl, kind))), t = fl.layers.terrain;
          for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (t[y * W + x] >= 0) PDM.assets.drawTerrain(g, tiles, t[y * W + x], x * 16, y * 16, 16, up);
          return c.toDataURL('image/png');
        };
        const open = src => { ed = PDM.pixelEditor({ width: PW, height: PH, src, gridStep: 16, scale: Math.max(1, Math.min(4, Math.floor(900 / Math.max(PW, PH)))), onSave: d => write(rel0, d), onSaveAs: saveAs }); body.innerHTML = ''; body.append(ed); };
        (async () => {
          let src = null;
          try { const abs = store.abs(rel0); if (fl.paint && fl.paint.image && await pdm.exists(abs)) src = await pdm.readDataURL(abs); } catch (_) { /* 새 그림 */ }
          if (src) {   // 맵 크기가 바뀌었으면 새 크기에 맞춰 옮겨 담음 (왼쪽 위 기준)
            const im = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; });
            if (im && (im.width !== PW || im.height !== PH)) { const c = h('canvas', { width: PW, height: PH }); c.getContext('2d').drawImage(im, 0, 0); src = c.toDataURL('image/png'); toast(`맵 크기가 바뀌어 그림을 ${PW}×${PH} 로 맞췄습니다`); }
          } else src = await fromTiles();
          open(src);
        })();
        ui.show = () => PDM.inspector.show('맵 세부 그리기', h('p', { class: 'hint' }, '그리기·편집 기능만 보입니다. 타일·오브젝트·연결을 고치려면 「← 맵 편집으로」.')); setTimeout(ui.show, 0);
        const en = h('input', { type: 'checkbox', checked: !fl.paint || fl.paint.enabled !== false, onchange: () => store.edit(key, '세부 그림 쓰기', r => { r.paint = Object.assign({ image: '' }, r.paint, { enabled: en.checked }); }, { silent: true }) });
        return h('div', { class: 'page full', style: { display: 'flex', flexDirection: 'column' } },
          h('div', { class: 'map-tools' },
            h('button', { class: 'tool', onclick: back }, '← 맵 편집으로'),
            h('b', { style: { margin: '0 8px' } }, `맵 세부 그리기 — ${fl.name || fl.id} (${PW}×${PH}px)`),
            h('label', { class: 'hint', style: { display: 'flex', alignItems: 'center', gap: '4px' }, title: '끄면 게임에서 원래 타일 그림으로 보입니다 (그림 파일은 남음)' }, en, '게임에 이 그림 쓰기'),
            h('span', { class: 'grow' }),
            h('button', { class: 'tool', title: '지금 타일 배치로 그림을 다시 만듭니다 (그린 내용은 사라짐 — Ctrl+Z 불가)', onclick: async () => { if (await PDM.ui.confirm('지금 타일 배치로 그림을 다시 만들까요? 지금까지 그린 내용은 사라집니다.')) open(await fromTiles()); } }, '↺ 타일에서 다시 만들기'),
            h('button', { class: 'tool', title: 'PNG 파일로 내보내기 (프로젝트 밖 아무 곳에나)', onclick: exportPng }, '⤓ 스프라이트 내보내기')),
          h('div', { class: 'hint', style: { padding: '4px 10px' } }, '한 칸 = 16×16px (격자). 저장하면 게임에서 타일 그림 대신 이 그림이 보입니다. 벽·바닥·문 같은 지형 판정은 맵 편집의 타일을 그대로 따릅니다. 투명하게 둔 곳은 검게 보입니다.'),
          body);
      }
      let terrain = drawable ? fl.layers.terrain.slice() : null;
      // 몬스터 스폰 구역 (직접 그린 노드만): 0 보통 · 1 스폰 구역 · 2 스폰 금지
      const canSpawn = kind === 'node' && fl.mode === 'handmade';
      let spawnL = canSpawn ? (((fl.layers || {}).spawn || []).length === W * H ? fl.layers.spawn.slice() : new Array(W * H).fill(0)) : null;
      const SPAWN_VALS = { 1: ['스폰 구역', '#5fd66a'], 2: ['스폰 금지', '#ff5a6a'], 0: ['지우개', '#9a93ad'] };
      // 무작위 칸 (방 템플릿만): 0 없음 · n = randSets[n-1] — 방이 들어갈 때마다 그 묶음의 선택지 중 하나로
      const canRand = kind === 'room';
      let randL = canRand ? (((fl.layers || {}).rand || []).length === W * H ? fl.layers.rand.slice() : new Array(W * H).fill(0)) : null;
      const RAND_COLORS = ['#ffb347', '#6ec6ff', '#c084fc', '#7ee08a', '#ff6b9a', '#f5e050', '#4dd4c6', '#ff8a5c'];
      const randColor = n => RAND_COLORS[(n - 1) % RAND_COLORS.length];
      if (ui.randVal === undefined) ui.randVal = 1; if (!ui.randShape) ui.randShape = 'pen';
      let tilesImg = null, paintImg = null;
      const theme = themeKey(themeOf(fl, kind));

      // ---- 팔레트 ----
      const palette = h('div', { class: 'palette' });
      const tileTool = () => ui.tool !== 'object' && ui.tool !== 'select' && ui.tool !== 'spawn' && ui.tool !== 'erase' && ui.tool !== 'rand';
      const ERASE = { all: '전부', wall: '벽', floor: '바닥·타일', object: '오브젝트', spawn: '스폰 구역', rand: '무작위 칸' };
      if (!ui.eraseKind) ui.eraseKind = 'all'; if (ui.port === undefined) ui.port = -1;
      const pickTile = v => { ui.terrain = v; if (!tileTool() || ui.tool === 'pick') ui.tool = 'pen'; drawPalette(); drawTools(); };
      /** 확장 기능이 꺼진 종류는 팔레트에서 숨김 (이 맵에 이미 놓은 것이 있으면 보임) */
      const typeOn = k => k === 'light' ? kind === 'node' && fl.mode !== 'procedural' : k !== 'prop' || (PDM.extensions && PDM.extensions.on('prop')) || (fl.objects || []).some(o => o.type === 'prop');
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
          palette.append(grid, h('div', { class: 'hint', style: { margin: '4px 0 10px' } }, ui.terrain === -1 ? '빈 칸 (그리지 않음)' : PDM.terrainName(PDM.TERRAIN_BY_ID[ui.terrain], up)),
            h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' } },
              h('button', { class: 'btn xs' + (ui.terrain === -1 && tileTool() ? ' pri' : ''), title: '아무것도 그리지 않은 칸 — 맵에 들어가지 않습니다 (게임에서는 막힌 벽)', onclick: () => pickTile(-1) }, '▢ 빈 칸 (지우기)'),
              h('button', { class: 'btn xs' + (ui.terrain === 0 && tileTool() ? ' pri' : ''), title: '바닥이 없는 칸 — 떨어지면 아래층으로', onclick: () => pickTile(0) }, '▼ 낭떠러지')),
            h('div', { class: 'fl' }, '지우개'),
            h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } }, ...Object.entries(ERASE).filter(([k]) => (k !== 'spawn' || canSpawn) && (k !== 'rand' || canRand)).map(([k, t]) => h('button', { class: 'btn xs' + (ui.tool === 'erase' && ui.eraseKind === k ? ' pri' : ''), title: k === 'all' ? '타일·오브젝트·스폰 구역을 모두 지웁니다 (끌어서)' : t + '만 지웁니다 (끌어서)', onclick: () => { ui.tool = 'erase'; ui.eraseKind = k; drawPalette(); drawTools(); } }, t))),
            h('button', { class: 'btn xs danger', style: { margin: '6px 0 10px' }, onclick: clearAll }, '🗑 맵 전체 지우기'),
            kind === 'node' ? h('div', { class: 'fl' }, '입구 · 출구') : '',
            kind === 'node' ? h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } },
              h('button', { class: 'btn xs' + (ui.terrain === 7 && tileTool() ? ' pri' : ''), onclick: () => pickTile(7) }, `＋ 입구 놓기 (${terrain.filter(v => v === 7).length}개)`),
              h('button', { class: 'btn xs' + (ui.terrain === 8 && tileTool() ? ' pri' : ''), onclick: () => pickTile(8) }, `＋ 출구 놓기 (${terrain.filter(v => v === 8).length}개)`)) : '',
            kind === 'node' ? h('div', { class: 'hint', style: { margin: '4px 0 10px' } }, '원하는 자리에 원하는 만큼 놓을 수 있습니다. 「⇱ 선택」 도구로 계단을 누르면 오른쪽에서 위치 수정 · 삭제 · 이어질 맵 지정을 할 수 있고, 끌어서 옮길 수도 있습니다.') : '',
            kind === 'room' ? h('div', { class: 'hint', style: { marginBottom: '10px', color: 'var(--gold)' } }, '테두리에 문 타일을 그리면 그 자리에만 문이 생깁니다 (연결 안 된 자리는 벽).') : '',
            h('div', { class: 'hint', style: { marginBottom: '10px' } }, '맵 크기: 네 모서리의 ◢ 손잡이를 끌어서 조절\n점선 바깥에 그리면 그 칸까지 맵이 넓어집니다'),
            h('button', { class: 'btn xs', style: { marginBottom: '10px' }, title: '타일을 그린 영역만 남기고 둘레의 빈 칸을 잘라냅니다 (둘레 한 칸은 남김)', onclick: trimToDrawn }, '✂ 그린 영역에 맞춰 자르기'),
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
        if (canRand) {
          const sets = fl.randSets || [];
          palette.append(h('div', { class: 'fl' }, '🎲 무작위 칸 (방이 들어갈 때마다 달라짐)'),
            h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } },
              ...sets.map((st, i) => h('button', { class: 'btn xs' + (ui.tool === 'rand' && ui.randVal === i + 1 ? ' pri' : ''), style: { borderColor: randColor(i + 1) }, title: (st.opts || []).map(o => (o.t === -2 ? '그대로' : (PDM.TERRAIN_BY_ID[o.t] || {}).name || o.t) + ' ' + (o.w ?? 1)).join(' · ') + ' — 오른쪽 클릭: 이름 바꾸기 · 복제 · 삭제', onclick: () => { ui.tool = 'rand'; ui.randVal = i + 1; ui.showRand = true; drawPalette(); drawTools(); paint(); },
                oncontextmenu: e => { e.preventDefault(); PDM.ui.menu(e.clientX, e.clientY, randSetMenu(i)); } }, `${i + 1}. ${st.name || '묶음'}`)),
              sets.length ? h('button', { class: 'btn xs' + (ui.tool === 'rand' && ui.randVal === 0 ? ' pri' : ''), onclick: () => { ui.tool = 'rand'; ui.randVal = 0; ui.showRand = true; drawPalette(); drawTools(); paint(); } }, '지우개') : null,
              h('button', { class: 'btn xs add', title: '새 무작위 칸 묶음 — 오른쪽 속성의 "변형"에서 선택지를 정합니다', onclick: () => addRandSet() }, '+ 묶음')),
            ui.tool === 'rand' && ui.randVal > 0 && sets[ui.randVal - 1] ? h('div', { class: 'btnbar' },
              h('span', { class: 'hint' }, `고른 묶음 ${ui.randVal}:`),
              h('button', { class: 'btn xs', onclick: () => renameRandSet(ui.randVal - 1) }, '이름 바꾸기'),
              h('button', { class: 'btn xs', onclick: () => dupRandSet(ui.randVal - 1) }, '복제'),
              h('button', { class: 'btn xs', onclick: () => clearRandCells(ui.randVal - 1) }, '칠한 칸 지우기'),
              h('button', { class: 'btn xs danger', onclick: () => removeRandSet(ui.randVal - 1) }, '삭제')) : '',
            sets.length ? h('div', { style: { display: 'flex', gap: '4px', margin: '4px 0', flexWrap: 'wrap' } }, ...[['pen', '✎ 칠하기'], ['rect', '▭ 사각형']].map(([k, t]) => h('button', { class: 'btn xs' + (ui.randShape === k ? ' pri' : ''), onclick: () => { ui.randShape = k; ui.tool = 'rand'; ui.showRand = true; drawPalette(); drawTools(); paint(); } }, t))) : null,
            h('div', { class: 'hint', style: { marginBottom: '10px' } }, sets.length ? '칠한 칸은 게임에서 그 묶음의 선택지 중 하나가 됩니다 (예: 물 50 · 풀 50). 오른쪽 "변형"에서 선택지 · 무게 · 칸마다/묶음 전체를 정하고 「🎲 변형 미리보기」로 확인하세요.' : '"+ 묶음"을 눌러 무작위 칸 묶음을 만든 뒤 칸에 칠하세요.'));
        }
        palette.append(h('div', { class: 'fl' }, '오브젝트 놓기'));
        const typeSel = h('select', { onchange: () => { ui.objType = typeSel.value; ui.objRef = ''; ui.tool = 'object'; drawPalette(); drawTools(); } },
          Object.entries(PDM.OBJECT_TYPES).filter(([k, v]) => ((k !== 'start' && !v.nodeOnly) || (kind === 'node' && (k === 'start' || fl.mode === 'handmade'))) && typeOn(k)).map(([k, v]) => h('option', { value: k }, v.name)));
        if (!typeOn(ui.objType)) ui.objType = 'npc';
        typeSel.value = ui.objType;
        const refKind = PDM.OBJECT_TYPES[ui.objType].ref;
        const opts = refKind === 'character' ? store.all('char').filter(c => ui.objType === 'mob' ? ['mob', 'boss'].includes(c.kind) : !['mob', 'boss', 'hero'].includes(c.kind)).map(c => [c.id, c.name])
          : refKind === 'item' ? store.all('item').map(c => [c.id, c.name]) : refKind === 'event' ? store.all('event').map(c => [c.id, c.name]) : refKind === 'prop' ? store.all('prop').map(c => [c.id, c.name]) : refKind === 'effect' ? PDM.ui.refOptions('effect') : [];
        if (refKind === 'character' && ui.objType === 'mob') opts.push(...['rat', 'gnoll', 'crab', 'slime', 'snake', 'albino'].map(m => ['spd:' + m, `(게임) ${m}`]));
        const refSel = h('select', { onchange: () => { ui.objRef = refSel.value; ui.tool = 'object'; drawTools(); } }, opts.map(([v, t]) => h('option', { value: v }, t)));
        if (!ui.objRef && opts[0]) ui.objRef = opts[0][0];
        refSel.value = ui.objRef;
        palette.append(h('div', { style: { display: 'flex', gap: '3px', flexWrap: 'wrap', marginBottom: '4px' } },
          ...Object.entries(PDM.OBJECT_TYPES).filter(([k, v]) => ((k !== 'start' && !v.nodeOnly) || (kind === 'node' && (k === 'start' || fl.mode === 'handmade'))) && typeOn(k)).map(([k, v]) => h('button', { class: 'btn xs' + (ui.tool === 'object' && ui.objType === k ? ' pri' : ''), style: { borderColor: v.color },
            onclick: () => { if (ui.objType !== k) ui.objRef = ''; ui.objType = k; ui.tool = 'object'; drawPalette(); drawTools(); } }, v.name))));
        const quick = h('div', { class: 'pal-grid', style: { marginTop: '6px' } });
        if (ui.objType === 'prop') store.all('prop').forEach(pr => {
          const c = h('canvas', { width: 16, height: 16, class: 'pal-t' + (ui.tool === 'object' && ui.objRef === pr.id ? ' on' : ''), title: pr.name + ' — 누른 뒤 맵을 클릭해 놓기', onclick: () => { ui.objRef = pr.id; ui.tool = 'object'; drawPalette(); drawTools(); } });
          if (pr.sprite && pr.sprite.sheet) PDM.assets.load(pr.sprite.sheet).then(img => { if (!img) return; const fw = pr.sprite.frame[0] || 16, fh = pr.sprite.frame[1] || 16, stt = (pr.states || [])[pr.start || 0] || {}, k = Math.min(1, 16 / fw, 16 / fh); const g = c.getContext('2d'); g.imageSmoothingEnabled = false; PDM.assets.drawFrame(g, img, fw, fh, (((pr.sprite.anims || {})[stt.anim] || {}).frames || stt.frames || [])[0] ?? (stt.frame || 0), (16 - fw * k) / 2, 16 - fh * k, k); });
          quick.append(c);
        });
        palette.append(typeSel, refKind ? refSel : '', quick.children.length ? quick : '',
          !opts.length && refKind ? h('div', { class: 'hint', style: { color: 'var(--gold)' } }, '아직 만든 것이 없습니다.') : '',
          ui.objType === 'prop' ? h('button', { class: 'btn xs', style: { marginTop: '6px' }, title: '새 맵 오브젝트(상자·레버·문·장식 등)를 만듭니다', onclick: () => PDM.propUtil && PDM.propUtil.newProp() }, '＋ 새 맵 오브젝트 만들기') : '',
          h('button', { class: 'btn sm' + (ui.tool === 'object' ? ' pri' : ''), style: { marginTop: '6px', width: '100%' }, onclick: () => { ui.tool = 'object'; drawTools(); drawPalette(); } }, '놓기 도구'),
          h('div', { class: 'hint', style: { marginTop: '10px' } }, drawable ? '타일: 왼쪽 클릭 그리기 · 오른쪽 클릭 스포이드\n오브젝트: 선택 도구로 끌어서 옮기기, Delete 로 삭제' : '자동 생성 층은 타일을 그리지 않습니다. 오브젝트는 "배치 규칙"으로 놓입니다.'));
      }

      // ---- 도구 막대 ----
      const tools = h('div', { class: 'map-tools' });
      function drawTools() {
        tools.innerHTML = '';
        const T = (id, label, tip) => h('button', { class: 'tool' + (ui.tool === id ? ' on' : ''), title: tip || '', onclick: () => { ui.tool = id; drawTools(); drawPalette(); } }, label);
        if (drawable) tools.append(T('pen', '✎ 펜', '타일 그리기 (B)'), T('rect', '▭ 사각형', '끌어서 채운 사각형'), T('room', '▣ 방', '끌어서 벽 두른 방'), T('fill', '▧ 채우기', '(G)'), T('pick', '⊙ 스포이드', '(I)'), T('erase', '⌫ 지우개', '끌어서 지우기 (E) — 무엇을 지울지는 왼쪽 「지우개」에서'));
        tools.append(T('select', '⇱ 선택', '오브젝트 · 입구/출구 계단 선택/이동 (M)'), T('object', '✚ 오브젝트'));
        if (canRand && (fl.randSets || []).length) tools.append(T('rand', '🎲 무작위 칸', '방이 들어갈 때마다 달라지는 칸 칠하기 (왼쪽에서 묶음 고르기)'));
        if (canSpawn) tools.append(T('spawn', '☗ 스폰 구역', '몬스터가 생기는 구역 / 안 생기는 구역 칠하기'));
        if (kind === 'node' && fl.mode === 'handmade') tools.append(h('button', { class: 'tool', title: '맵 전체를 한 장의 그림으로 직접 그립니다 (게임에서는 타일 그림 대신 이 그림이 보임)', onclick: () => { ui.paintMode = true; PDM.tabs.refresh(key); } }, '🖌 맵 세부 그리기'));
        tools.append(h('span', { class: 'tb-sep' }),
          h('button', { class: 'tool', title: '축소 (Ctrl+휠)', onclick: () => zoomStep(-1) }, '−'),
          h('span', { class: 'hint' }, `×${+ui.zoom.toFixed(2)}`),
          h('button', { class: 'tool', title: '확대 (Ctrl+휠)', onclick: () => zoomStep(1) }, '+'),
          h('button', { class: 'tool', title: '화면에 맞춤 (Enter)', onclick: () => zoomFit() }, '⛶ 맞춤'),
          drawable ? h('span', { class: 'hint', title: '펜·지우개 브러쉬 크기 — [ 작게 · ] 크게' }, `브러쉬 ${ui.brush || 1}`) : '',
          // 보기 켜고 끄기는 한 묶음 버튼으로 (예전: 무작위 표시 · 구역 표시 · 세부 그림 · 계단 번호 · 격자 · 구역 색 버튼이 따로 있었음)
          PDM.ui.dropBtn('👁 보기', () => {
            const tg = (label, on, set, hint) => ({ label, checked: !!on, hint, run: () => { set(); drawTools(); paint(); } });
            return [
              tg('격자', ui.grid, () => { ui.grid = !ui.grid; }),
              drawable ? tg('구역 색 (벽 빨강 · 바닥 파랑 · 문 초록)', ui.zones, () => { ui.zones = !ui.zones; }) : null,
              drawable && kind === 'node' ? tg('계단 번호 · 연결', ui.showPorts, () => { ui.showPorts = !ui.showPorts; }) : null,
              canSpawn ? tg('스폰 구역', ui.showSpawn, () => { ui.showSpawn = !ui.showSpawn; }) : null,
              canRand && (fl.randSets || []).length ? tg('무작위 칸', ui.showRand !== false, () => { ui.showRand = ui.showRand === false; }) : null,
              paintImg ? tg('맵 세부 그림 (끄면 타일)', ui.showPaint !== false, () => { ui.showPaint = ui.showPaint === false; }) : null];
          }, { cls: 'tool', title: '맵에 겹쳐 보일 것 켜고 끄기' }),
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
        const tim = await PDM.assets.load(c.tiles).catch(() => null), tcell = tim ? Math.max(1, Math.round(tim.width / 16)) : 16;
        const out = await PDM.editPixelsModal('타일셋 편집 — ' + c.name, c.tiles, 256, 256, tcell, null, { tilePreview: c.base || 'SEWER', light: { bloom: c.lightBloom || 0, unit: tcell / 16, onBloom: v => store.edit('world', '타일 효과 레이어 번짐', w => { const x = (w.customThemes || []).find(t => t.id === c.id); if (x) x.lightBloom = v; }, { silent: true }), mode: c.lightMode || 'add', onMode: m => store.edit('world', '타일 효과 레이어 합성 방식', w => { const x = (w.customThemes || []).find(t => t.id === c.id); if (x) x.lightMode = m; }, { silent: true }) } });
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
        const tc = Math.max(1, Math.round(img.width / 16));   // 타일셋 한 칸 px (큰 타일셋이면 32 · 48 …)
        const sx = (t.tile % 16) * tc, sy = Math.floor(t.tile / 16) * tc;
        const one = h('canvas', { width: tc, height: tc }); one.getContext('2d').drawImage(img, sx, sy, tc, tc, 0, 0, tc, tc);
        let result = null;
        const ed = PDM.pixelEditor({ width: tc, height: tc, src: one.toDataURL('image/png'), onSave: d => { result = d; PDM.$('.modal-foot .pri').click(); } });
        const ok = await PDM.ui.modal(`타일 그림 편집 — ${PDM.terrainName(t, up)} (${c.name})`, ed, [['취소', false], ['저장', () => true, 'pri']]);
        if (!ok) { PDM.tabs.refresh(); return; }
        const tile = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = result || ed.toDataURL(); });
        const all = h('canvas', { width: img.width, height: img.height }); const g = all.getContext('2d');
        g.drawImage(img, 0, 0); g.clearRect(sx, sy, tc, tc); g.drawImage(tile, 0, 0, tile.width, tile.height, sx, sy, tc, tc);
        try { await pdm.writeDataURL(store.abs(c.tiles), all.toDataURL('image/png')); } catch (err) { toast('저장 실패: ' + err.message, 'bad'); return; }
        afterTiles();
      }

      // ---- 캔버스 ----
      const cv = h('canvas', {});
      const info = h('div', { class: 'map-info' }, ' ');
      const sprites = {};
      async function loadSprites() {
        tilesImg = await PDM.assets.themeTiles(theme);
        if (fl.paint && fl.paint.image && fl.paint.enabled !== false) { try { paintImg = await PDM.assets.load(fl.paint.image); } catch (_) { paintImg = null; } }
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
        drawPalette(); drawTools(); paint();
      }
      const S = () => 16 * ui.zoom;
      const ZOOMS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 6];
      function zoomStep(d) {
        const z = d > 0 ? ZOOMS.find(v => v > ui.zoom + 1e-6) : [...ZOOMS].reverse().find(v => v < ui.zoom - 1e-6);
        if (z === undefined) return; ui.zoom = z; drawTools(); paint();
      }
      /** 맵 전체가 보이는 가장 큰 배율로 (Enter) */
      function zoomFit() {
        const sc = cv.parentElement; if (!sc || !sc.clientWidth) return;
        const w = (drawable ? W : 24) + PAD * 2, hh = (drawable ? H : 12) + PAD * 2;
        const z = Math.min((sc.clientWidth - 44) / (w * 16), (sc.clientHeight - 44) / (hh * 16));
        ui.zoom = PDM.clamp(Math.floor(z * 16) / 16, 0.25, 6); drawTools(); paint(); sc.scrollLeft = 0; sc.scrollTop = 0;
      }
      let dragRect = null;
      function paint() {
        const s = S();
        const w = drawable ? W : 24, hh = drawable ? H : 12;
        cv.width = (w + PAD * 2) * s; cv.height = (hh + PAD * 2) * s;
        const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
        if (PAD) { g.fillStyle = 'rgba(20,18,26,.55)'; g.fillRect(0, 0, cv.width, cv.height); g.strokeStyle = 'rgba(255,255,255,.25)'; g.setLineDash([4, 4]); g.strokeRect(PAD * s - .5, PAD * s - .5, w * s + 1, hh * s + 1); g.setLineDash([]); }
        g.save(); g.translate(PAD * s, PAD * s);
        if (drawable) {
          for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            if (terrain[y * W + x] < 0) { g.fillStyle = (x + y) % 2 ? '#1b1922' : '#221f2b'; g.fillRect(x * s, y * s, s, s); continue; }   // 빈 칸
            PDM.assets.drawTerrain(g, tilesImg, terrain[y * W + x], x * s, y * s, s, up);
          }
          if (ui.zones) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {   // 구역 색: 벽 빨강 · 바닥 파랑 · 문 초록 · 낭떠러지 빗금
            const v = terrain[y * W + x], t = PDM.TERRAIN_BY_ID[v];
            if (v < 0) continue;
            if (v === 0) { g.strokeStyle = 'rgba(200,170,255,.55)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x * s + 2, y * s + s - 2); g.lineTo(x * s + s - 2, y * s + 2); g.stroke(); continue; }
            g.fillStyle = ZONE_DOORS.includes(v) ? 'rgba(70,220,110,.38)' : t && t.pass ? 'rgba(70,130,255,.28)' : 'rgba(255,70,70,.30)';
            g.fillRect(x * s, y * s, s, s);
          }
        } else {
          g.fillStyle = '#15131a'; g.fillRect(0, 0, cv.width, cv.height);
          g.fillStyle = '#9a93ad'; g.font = '14px sans-serif'; g.textAlign = 'center';
          g.fillText('이 층은 게임이 자동으로 생성합니다 (배치 규칙만 설정)', cv.width / 2, 30);
        }
        if (paintImg && ui.showPaint !== false) g.drawImage(paintImg, 0, 0, W * s, H * s);
        if (ui.grid && drawable) {
          g.strokeStyle = 'rgba(255,255,255,.08)'; g.beginPath();
          for (let x = 0; x <= W; x++) { g.moveTo(x * s + .5, 0); g.lineTo(x * s + .5, H * s); }
          for (let y = 0; y <= H; y++) { g.moveTo(0, y * s + .5); g.lineTo(W * s, y * s + .5); }
          g.stroke();
        }
        // 무작위 칸
        if (canRand && (ui.showRand !== false || ui.tool === 'rand')) {
          g.font = `bold ${Math.max(8, s * .38)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
          for (let i = 0; i < W * H; i++) {
            const v = randL[i]; if (!v) continue;
            const x = (i % W) * s, y = Math.floor(i / W) * s, c = randColor(v);
            g.fillStyle = c + '55'; g.fillRect(x, y, s, s); g.strokeStyle = c; g.lineWidth = 1; g.setLineDash([3, 2]); g.strokeRect(x + 1.5, y + 1.5, s - 3, s - 3); g.setLineDash([]);
            if (s >= 14) { g.fillStyle = '#000a'; g.fillText('🎲' + v, x + s / 2 + 1, y + s / 2 + 1); g.fillStyle = '#fff'; g.fillText('🎲' + v, x + s / 2, y + s / 2); }
          }
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
        // 지형 광원 미리보기: 그 지형 칸마다 (게임과 같은 감쇠)
        if (drawable && (fl.terrainLights || []).length) (fl.terrainLights || []).forEach(tl => {
          const o2 = Object.assign({ color: '#9a7cff', k: 1.5, z: 10, range: 2 }, tl);
          for (let i = 0; i < W * H; i++) if (terrain[i] === +tl.terrain) PDM.drawLightPreview(g, (i % W) * s + s / 2, Math.floor(i / W) * s + s / 2, o2, s);
        });
        // 광원 미리보기의 그림자: 빛을 가리는 칸 (벽 = 1 · 막힌 맵 오브젝트 = 2, 맵 밖 = 벽)
        let lightBlock = null;
        if (drawable && (fl.objects || []).some(o => o.type === 'light')) {
          const pc = new Set();
          (fl.objects || []).forEach(o => { if (o.type !== 'prop' || !o.at || o.at.x == null) return; const sp = sprites['prop:' + o.ref], pr = sp && sp.prop; if (!pr || pr.castShadow === false) return;
            const st = (pr.states || [])[pr.start || 0]; if (st && st.solid === false) return;
            const ft = pr.foot || [1, 1]; for (let j = 0; j < Math.max(1, ft[1] | 0); j++) for (let k = 0; k < Math.max(1, ft[0] | 0); k++) pc.add((o.at.y - j) * W + o.at.x + k); });
          lightBlock = (x, y) => x < 0 || y < 0 || x >= W || y >= H ? 1 : PDM.terrainBlocksLight(terrain[y * W + x]) ? 1 : pc.has(y * W + x) ? 2 : 0;
        }
        // 오브젝트
        (fl.objects || []).forEach((o, i) => {
          let x, y;
          if (down && down.erase && o.at && o.at.x != null && down.objs.has(o.at.y * W + o.at.x)) return;
          if (down && down.move === i && down.to) { x = down.to[0] * s; y = down.to[1] * s; }
          else if (ui.moveObj === i && ui.moveTo) { x = ui.moveTo[0] * s; y = ui.moveTo[1] * s; }
          else if (drawable && o.at && o.at.x != null) { x = o.at.x * s; y = o.at.y * s; }
          else { x = (i % 12) * s * 2 + s / 2; y = (2 + Math.floor(i / 12) * 2) * s; }
          const col = (PDM.OBJECT_TYPES[o.type] || {}).color || '#fff';
          const sp = sprites[o.type === 'item' ? 'item:' + o.ref : o.type === 'prop' ? 'prop:' + o.ref : o.ref];
          if (sp && sp.img && sp.prop) {   // 맵 오브젝트: 시작 상태의 프레임, 칸 아래 가운데
            const pr = sp.prop, fw = pr.sprite.frame[0] || 16, fh = pr.sprite.frame[1] || 16, stt = (pr.states || [])[pr.start || 0] || {};
            const ft = pr.foot || [1, 1], fx = Math.max(1, ft[0] | 0), fy = Math.max(1, ft[1] | 0), u = s / 16;
            const k = (pr.sprite.scale > 0 ? pr.sprite.scale : Math.min(1, fx * 16 / fw, fy * 16 / fh)) * u;
            if (fx > 1 || fy > 1 || fh * k > s + 1) { g.fillStyle = 'rgba(201,163,106,.22)'; g.fillRect(x, y - (fy - 1) * s, fx * s, fy * s); g.strokeStyle = 'rgba(201,163,106,.8)'; g.lineWidth = 1; g.strokeRect(x + .5, y - (fy - 1) * s + .5, fx * s - 1, fy * s - 1); }   // 설치 칸 표시
            PDM.assets.drawFrame(g, sp.img, fw, fh, (((pr.sprite.anims || {})[stt.anim] || {}).frames || stt.frames || [])[0] ?? (stt.frame || 0), x + (fx * s - fw * k) / 2 + (+pr.sprite.ox || 0) * u, y + s - fh * k + (+pr.sprite.oy || 0) * u, k);
          } else if (sp && sp.img) { const fw = sp.c.sprite.frame[0], fh = sp.c.sprite.frame[1]; const sc = s / Math.max(fw, fh); PDM.assets.drawFrame(g, sp.img, fw, fh, 0, x + (s - fw * sc) / 2, y + (s - fh * sc), sc); }
          else if (sp && sp.canvas) g.drawImage(sp.canvas, x, y, s, s);
          else { g.fillStyle = col + 'cc'; g.fillRect(x + s * .15, y + s * .15, s * .7, s * .7); g.fillStyle = '#000'; g.font = `bold ${s * .5}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText({ light: '☀', npc: 'N', mob: 'M', item: 'I', event: 'E', start: 'S', prop: 'P', entrance: '<', exit: '>', plate: 'T' }[o.type] || '?', x + s / 2, y + s / 2 + 1); }
          if (o.type === 'light') PDM.drawLightPreview(g, x + s / 2, y + s / 2, o, s, { block: lightBlock });   // 광원: 게임과 같은 감쇠 · 그림자로 미리보기
          g.strokeStyle = i === ui.sel ? '#fff' : col; g.lineWidth = i === ui.sel ? 2 : 1; g.strokeRect(x + 1, y + 1, s - 2, s - 2);
          if (!drawable) { g.fillStyle = '#ccc'; g.font = '10px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText(PDM.PLACE_RULES[(o.at && o.at.rule) || 'random'] || '', x + s / 2, y + s + 2); }
        });
        if (dragRect) {
          const [a, b, c, d] = dragRect, rx = Math.min(a, c) * s, ry = Math.min(b, d) * s, rw = (Math.abs(c - a) + 1) * s, rh = (Math.abs(d - b) + 1) * s;
          g.strokeStyle = down === 'spawnrect' ? SPAWN_VALS[ui.spawnVal][1] : down === 'randrect' ? (ui.randVal ? randColor(ui.randVal) : '#9a93ad') : '#a58bff'; g.lineWidth = 2; g.strokeRect(rx, ry, rw, rh);
        }
        if (drawable && ui.port >= 0 && isStair(terrain[ui.port])) {   // 고른 계단
          const px = ui.port % W, py = Math.floor(ui.port / W);
          g.strokeStyle = '#fff'; g.lineWidth = 2; g.strokeRect(px * s + 1, py * s + 1, s - 2, s - 2);
          if (down && down.port !== undefined && down.to) { g.setLineDash([4, 3]); g.strokeStyle = '#ffe28a'; g.strokeRect(down.to[0] * s + 1, down.to[1] * s + 1, s - 2, s - 2); g.setLineDash([]); }
        }
        if (drawable) {   // 크기 조절 손잡이 (네 모서리)
          const R = down && down.resize ? down.rect : null;
          if (R) { g.fillStyle = 'rgba(165,139,255,.14)'; g.fillRect(R[0] * s, R[1] * s, R[2] * s, R[3] * s); g.strokeStyle = '#a58bff'; g.lineWidth = 2; g.setLineDash([6, 4]); g.strokeRect(R[0] * s, R[1] * s, R[2] * s, R[3] * s); g.setLineDash([]);
            g.fillStyle = '#fff'; g.font = 'bold 12px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillText(`${R[2]} × ${R[3]}`, R[0] * s + 4, R[1] * s - 4); }
          CORNERS.forEach(([cx, cy]) => { const hx = (R ? R[0] + (cx ? R[2] : 0) : cx * W) * s, hy = (R ? R[1] + (cy ? R[3] : 0) : cy * H) * s;
            g.fillStyle = '#a58bff'; g.strokeStyle = '#fff'; g.lineWidth = 1; g.fillRect(hx - 6, hy - 6, 12, 12); g.strokeRect(hx - 5.5, hy - 5.5, 11, 11); });
        }
        g.restore();
      }
      const ZONE_DOORS = [5, 6, 10, 16, 31];
      const cellAt = e => { const r = cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / S()) - PAD, Math.floor((e.clientY - r.top) / S()) - PAD]; };

      // ---- 맵 크기 바꾸기 (모서리 손잡이 · 바깥에 그리기 · 그린 영역에 맞춰 자르기) ----
      /** 새 크기로 옮겨 담기: 옛 (ox, oy) 가 새 (0, 0). 새 칸은 빈 칸(-1). edit(nt, nw, nh) 로 마무리 손질 */
      function reshape(ox, oy, nw, nh, label, editFn) {
        const nt = new Array(nw * nh).fill(-1), ns = new Array(nw * nh).fill(0), nr = new Array(nw * nh).fill(0);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const tx = x - ox, ty = y - oy; if (tx < 0 || ty < 0 || tx >= nw || ty >= nh) continue;
          nt[ty * nw + tx] = terrain[y * W + x]; if (spawnL) ns[ty * nw + tx] = spawnL[y * W + x] || 0; if (randL) nr[ty * nw + tx] = randL[y * W + x] || 0;
        }
        const gone = editFn ? editFn(nt, nw, nh) || (() => false) : () => false;
        store.edit(key, label, r => {
          r.size = { w: nw, h: nh }; r.layers.terrain = nt; if (r.layers.spawn) r.layers.spawn = ns; if (r.layers.rand) r.layers.rand = nr;
          r.objects = (r.objects || []).filter(o => { if (!o.at || o.at.x == null) return true; o.at.x -= ox; o.at.y -= oy; return o.at.x >= 0 && o.at.y >= 0 && o.at.x < nw && o.at.y < nh && !gone(o.at.x, o.at.y); });
        });
      }
      /** 타일을 그린 영역(빈 칸이 아닌 칸)만 남기고 자름 — 둘레 한 칸은 남김 */
      function trimToDrawn() {
        let bx0 = W, by0 = H, bx1 = -1, by1 = -1;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (terrain[y * W + x] >= 0) { bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y); }
        if (bx1 < 0) { toast('그린 타일이 없습니다', 'bad'); return; }
        // 가장자리 줄이 전부 막힌 칸(벽 등)이면 그대로, 지나갈 수 있는 칸·낭떠러지가 있으면 바깥에 한 칸 여유
        const open = (x, y) => { const v = terrain[y * W + x], t = PDM.TERRAIN_BY_ID[v]; return v === 0 || (t && t.pass); };
        const col = x => { for (let y = by0; y <= by1; y++) if (open(x, y)) return 1; return 0; }, rowO = y => { for (let x = bx0; x <= bx1; x++) if (open(x, y)) return 1; return 0; };
        const mL = col(bx0), mR = col(bx1), mT = rowO(by0), mB = rowO(by1);
        let ox = bx0 - mL, oy = by0 - mT, nw = bx1 - bx0 + 1 + mL + mR, nh = by1 - by0 + 1 + mT + mB;
        if (nw < MINS) nw = MINS; if (nh < MINS) nh = MINS;
        if (nw > MAXS) { ox = bx0; nw = Math.min(MAXS, bx1 - bx0 + 1); } if (nh > MAXS) { oy = by0; nh = Math.min(MAXS, by1 - by0 + 1); }
        if (ox === 0 && oy === 0 && nw === W && nh === H) { toast('이미 그린 영역에 맞춰져 있습니다'); return; }
        reshape(ox, oy, nw, nh, '그린 영역에 맞춰 자르기');
      }
      const CORNERS = [[0, 0], [1, 0], [0, 1], [1, 1]];
      const cornerAt = e => { const r = cv.getBoundingClientRect(), s = S(), mx = e.clientX - r.left - PAD * s, my = e.clientY - r.top - PAD * s;
        return CORNERS.find(([cx, cy]) => Math.abs(mx - cx * W * s) <= 8 && Math.abs(my - cy * H * s) <= 8) || null; };
      /** 손잡이를 끄는 중: 새 맵 사각형 [x, y, w, h] (지금 맵 칸 좌표) */
      function resizeRect(e, c) {
        const r = cv.getBoundingClientRect(), s = S();
        const gx = Math.round((e.clientX - r.left) / s) - PAD, gy = Math.round((e.clientY - r.top) / s) - PAD;
        let x0 = 0, y0 = 0, x1 = W, y1 = H;
        if (c[0]) x1 = x0 + PDM.clamp(gx - x0, MINS, MAXS); else x0 = x1 - PDM.clamp(x1 - gx, MINS, MAXS);
        if (c[1]) y1 = y0 + PDM.clamp(gy - y0, MINS, MAXS); else y0 = y1 - PDM.clamp(y1 - gy, MINS, MAXS);
        return [x0, y0, x1 - x0, y1 - y0];
      }
      const inB = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
      const EXITS = [8, 21, 22], ENTS = [7, 37], isStair = v => EXITS.includes(v) || ENTS.includes(v);
      /** 계단 타일이 바뀌는 편집: 통로 연결에 고정해 둔 출구·입구 번호가 같은 계단을 계속 가리키도록 맞춤 (cellMap: 옮긴 칸 {옛: 새}) */
      function withPorts(label, fn, cellMap) {
        if (kind !== 'node') return fn();
        const oe = W_.tiles(fl.id, true), oi = W_.tiles(fl.id, false);
        store.transaction(label, () => {
          fn();
          const ne = W_.tiles(fl.id, true), ni = W_.tiles(fl.id, false);
          const mp = (old, nw, k) => { const c = old[k]; if (c === undefined) return -1; return nw.indexOf(cellMap && cellMap[c] != null ? cellMap[c] : c); };
          const fix = e => { const r = {}; if (e.from === fl.id && (e.exit ?? -1) >= 0) r.exit = mp(oe, ne, e.exit); if (e.to === fl.id && (e.entrance ?? -1) >= 0) r.entrance = mp(oi, ni, e.entrance); return r; };
          const edges = (store.get('world') || {}).edges || [];
          if (edges.some(e => { const r = fix(e); return (r.exit !== undefined && r.exit !== e.exit) || (r.entrance !== undefined && r.entrance !== e.entrance); }))
            store.edit('world', '계단 번호 맞추기', w => w.edges.forEach(e => Object.assign(e, fix(e))), { silent: true });
        });
      }
      function movePort(a, b) {
        if (a === b || b < 0 || b >= W * H) return;
        if (isStair(terrain[b])) { toast('그 자리에는 이미 계단이 있습니다', 'bad'); return; }
        const v = terrain[a]; terrain[b] = v; terrain[a] = 1; ui.port = b; const copy = terrain.slice();
        withPorts('계단 옮기기', () => store.edit(key, '계단 옮기기', r => { r.layers.terrain = copy; }), { [a]: b });
      }
      function deletePort(a) {
        terrain[a] = 1; ui.port = -1; const copy = terrain.slice();
        withPorts('계단 삭제', () => store.edit(key, '계단 삭제', r => { r.layers.terrain = copy; }));
      }
      /** 계단 k 번(출구/입구)을 target 맵과 잇는 통로에 고정 — 통로가 없으면 새로 만듦. target 이 비면 고정 해제(자동) */
      function assignPort(isExit, k, target) {
        const f = isExit ? 'exit' : 'entrance', id = fl.id;
        store.edit('world', '계단 연결', w => {
          w.edges = w.edges || [];
          const mine = e => (e.kind === 'door' || (isExit && (e.kind || 'main') === 'main')) && (isExit ? e.from === id : e.to === id);   // 통로, 그리고 출구 쪽은 출구 연결(main)도 고정 가능
          w.edges.filter(mine).forEach(e => { if ((e[f] ?? -1) === k) e[f] = -1; });
          if (!target) return;
          let e = w.edges.find(x => mine(x) && (isExit ? x.to : x.from) === target && (x[f] ?? -1) < 0);
          if (!e) { e = { id: 'e' + Math.random().toString(36).slice(2, 8), from: isExit ? id : target, to: isExit ? target : id, kind: 'door', cond: '', weight: 100, label: '', place: 'exit', message: '', exit: -1, entrance: -1 }; w.edges.push(e); }
          e[f] = k;
        });
        paint(); showInspector();
      }
      /** 계단(칸 cell)의 연결 설정 칸들: 이어질 맵 + 그 맵의 짝 계단 */
      function portPanel(cell, isExit, linkedOnly) {
        const P_ = W_.ports(fl.id), out = h('div', {});
        if (!P_.hand) return out;
        const t = (isExit ? P_.exits : P_.entrances).find(q => q.cell === cell); if (!t) return out;
        const f = isExit ? 'exit' : 'entrance', g = isExit ? 'entrance' : 'exit';
        const pinned = t.edge && (t.edge[f] ?? -1) === t.i, isDoor = t.edge && t.edge.kind === 'door';
        const now = t.edge && !isDoor ? `출구 연결 → ${W_.fullName(t.edge.to)}` : t.edge ? `통로 ${isExit ? '→' : '←'} ${W_.fullName(isExit ? t.edge.to : t.edge.from)}${pinned ? '' : ' (자동 배정)'}` : t.what === 'main' ? '출구 연결 (그래프의 "출구" 연결을 따라감)' : t.what === 'back' ? '되돌아가기' : t.what === 'stair' ? '샛길' : t.what === 'legacy' ? '기본 입구 (처음 들어오거나 일반 연결로 들어오는 자리)' : '안 씀 (연결 없음)';
        const linked = new Set(((store.get('world') || {}).edges || []).filter(e => e.from === fl.id || e.to === fl.id).map(e => e.from === fl.id ? e.to : e.from));
        const nodeOpts = W_.options().filter(([id]) => id !== fl.id && (!linkedOnly || linked.has(id)));
        const sel = h('select', { onchange: () => assignPort(isExit, t.i, sel.value) }, h('option', { value: '' }, '자동 (고정하지 않음)'),
          nodeOpts.map(([id, name]) => h('option', { value: id }, name)));
        const other = pinned ? (isExit ? t.edge.to : t.edge.from) : '';
        sel.value = other;
        out.append(PDM.ui.field(isExit ? '이 출구로 가는 맵 (노드)' : '이 입구로 들어오는 맵 (노드)', sel), h('div', { class: 'hint' }, '지금: ' + now));
        if (linkedOnly && !nodeOpts.length) out.append(h('div', { class: 'hint', style: { color: 'var(--gold)' } }, '이 맵과 연결된 맵이 없습니다. 먼저 [맵] 그래프에서 노드를 연결하세요.'));
        if (pinned && isDoor) {
          const Q = W_.ports(other), od = store.get('node:' + other) || {}, ow = (od.size || {}).w || 1;
          if (Q.hand) {
            const list = isExit ? Q.entrances : Q.exits, eid = t.edge.id;
            const s2 = h('select', { onchange: () => { const v = +s2.value; store.edit('world', '짝 계단', w => { const e = w.edges.find(x => x.id === eid); if (e) e[g] = v; }); paint(); showInspector(); } },
              h('option', { value: -1 }, '자동 (남은 것 차례로 · 모자라면 새 계단)'), list.map(q => h('option', { value: q.i }, `${isExit ? '입구' : '출구'} ${q.i + 1} (${q.cell % ow}, ${Math.floor(q.cell / ow)})`)));
            s2.value = String(t.edge[g] ?? -1);
            out.append(PDM.ui.field(isExit ? '도착하는 입구 (그 맵에서)' : '출발하는 출구 (그 맵에서)', s2));
          } else out.append(h('div', { class: 'hint' }, `${W_.fullName(other)} 은(는) 직접 그린 맵이 아니라서 ${isExit ? '도착 입구' : '출발 출구'}는 게임이 정합니다.`));
          out.append(h('button', { class: 'btn xs', style: { marginTop: '6px' }, onclick: () => PDM.tabs.open('node:' + other) }, '그 맵 열기'));
        }
        out.append(h('div', { class: 'hint', style: { marginTop: '6px' } }, linkedOnly ? '맵 그래프에서 이 맵과 연결된 맵만 고를 수 있습니다. 고르면 그 연결이 여기에 고정됩니다.' : '맵을 고르면 그 맵과의 연결이 여기에 고정됩니다 (연결이 없으면 통로를 새로 만듦). 조건 등 자세한 설정은 맵 그래프의 연결에서.'));
        return out;
      }
      /** 브러쉬 크기([ ] 로 조절)만큼의 칸들 — 계단 타일은 한 칸만 */
      function brushCells(x, y) {
        const n = ui.tool === 'pen' && isStair(ui.terrain) ? 1 : (ui.brush || 1), o = Math.floor((n - 1) / 2), out = [];
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (inB(x - o + i, y - o + j)) out.push([x - o + i, y - o + j]);
        return out;
      }
      function eraseCell(x, y) {
        const i = y * W + x, k = ui.eraseKind, v = terrain[i], t = PDM.TERRAIN_BY_ID[v];
        if (drawable && v >= 0 && (k === 'all' || (k === 'wall' && t && !t.pass && v !== 0) || (k === 'floor' && (!t || t.pass || v === 0)))) terrain[i] = -1;
        if (spawnL && (k === 'all' || k === 'spawn')) spawnL[i] = 0;
        if (randL && (k === 'all' || k === 'rand')) randL[i] = 0;
        if (k === 'all' || k === 'object') down.objs.add(i);
        paint();
      }
      function commitErase(objs) {
        const copy = terrain ? terrain.slice() : null, sp = spawnL ? spawnL.slice() : null, rp = randL ? randL.slice() : null; ui.sel = -1;
        withPorts('지우개', () => store.edit(key, '지우개', r => {
          if (copy) r.layers.terrain = copy; if (sp && r.layers.spawn) r.layers.spawn = sp; if (rp && r.layers.rand) r.layers.rand = rp;
          if (objs.size) r.objects = (r.objects || []).filter(o => !(o.at && o.at.x != null && objs.has(o.at.y * W + o.at.x)));
        }));
      }
      async function clearAll() {
        const what = await PDM.ui.modal('맵 전체 지우기', h('p', {}, '이 맵에 그린 것을 모두 지웁니다. (실행 취소로 되돌릴 수 있습니다)'), [['취소', false], ['타일만', 'tiles'], ['타일 + 오브젝트 + 스폰 구역', 'all', 'pri']]);
        if (!what) return;
        terrain = new Array(W * H).fill(-1); if (what === 'all' && spawnL) spawnL = new Array(W * H).fill(0); if (what === 'all' && randL) randL = new Array(W * H).fill(0);
        const copy = terrain.slice(); ui.sel = -1; ui.port = -1;
        withPorts('맵 전체 지우기', () => store.edit(key, '맵 전체 지우기', r => {
          r.layers.terrain = copy;
          if (what === 'all') { if (r.layers.spawn) r.layers.spawn = new Array(W * H).fill(0); if (r.layers.rand) r.layers.rand = new Array(W * H).fill(0); r.objects = (r.objects || []).filter(o => !o.at || o.at.x == null); }
        }));
      }
      let hoverCell = null;   // 마우스가 마지막으로 있던 칸 (붙여넣기 자리)
      function objAt(x, y) {
        return (fl.objects || []).findIndex((o, i) => drawable ? (o.at && o.at.x === x && o.at.y === y)
          : (Math.floor(((i % 12) * 2 * S() + S() / 2) / S()) === x && 2 + Math.floor(i / 12) * 2 === y));
      }
      function flood(x0, y0, v) {
        const t0 = terrain[y0 * W + x0]; if (t0 === v) return;
        const st = [[x0, y0]];
        while (st.length) { const [x, y] = st.pop(); if (!inB(x, y) || terrain[y * W + x] !== t0) continue; terrain[y * W + x] = v; st.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]); }
      }
      function commitRand(label) { const copy = randL.slice(); store.edit(key, label, r => { r.layers.rand = copy; }, { silent: true }); }
      function addRandSet() {
        const n = (fl.randSets || []).length + 1;   // 새 묶음 번호 (edit 뒤의 fl 은 예전 것일 수 있어서 먼저 셈)
        ui.tool = 'rand'; ui.randVal = n; ui.showRand = true;
        store.edit(key, '무작위 칸 묶음 추가', r => { (r.randSets = r.randSets || []).push({ name: '묶음 ' + n, mode: 'cell', opts: [{ t: 29, w: 1 }, { t: 2, w: 1 }] }); });
      }
      // 무작위 칸 묶음 편집 (팔레트 · 속성 "변형" 공용)
      function randSetMenu(i) {
        return [{ label: '이름 바꾸기…', run: () => renameRandSet(i) }, { label: '복제', run: () => dupRandSet(i) }, { label: '칠한 칸 지우기', run: () => clearRandCells(i) }, '-', { label: '삭제', run: () => removeRandSet(i) }];
      }
      async function renameRandSet(i) {
        const st = (fl.randSets || [])[i]; if (!st) return;
        const n = await PDM.ui.prompt('무작위 칸 묶음 이름', st.name || ''); if (n == null || !n.trim()) return;
        store.edit(key, '무작위 칸 묶음 이름', r => { r.randSets[i].name = n.trim(); });
      }
      function dupRandSet(i) {
        const st = (fl.randSets || [])[i]; if (!st) return;
        const n = fl.randSets.length + 1;
        ui.tool = 'rand'; ui.randVal = n;
        store.edit(key, '무작위 칸 묶음 복제', r => { r.randSets.push(Object.assign(PDM.clone(st), { name: (st.name || '묶음') + ' 사본' })); });
      }
      function clearRandCells(i) {
        store.edit(key, '무작위 칸 지우기', r => { if (r.layers.rand) r.layers.rand = r.layers.rand.map(v => v === i + 1 ? 0 : v); });
        if (randL) randL = randL.map(v => v === i + 1 ? 0 : v);
      }
      async function removeRandSet(i) {
        const st = (fl.randSets || [])[i]; if (!st) return;
        const used = (randL || []).filter(v => v === i + 1).length;
        if (used && !(await PDM.ui.confirm(`「${st.name || '묶음 ' + (i + 1)}」 묶음을 삭제할까요? 칠한 칸 ${used}개는 무작위가 아니게 됩니다.`))) return;
        if (ui.randVal === i + 1) ui.randVal = 0; else if (ui.randVal > i + 1) ui.randVal--;
        store.edit(key, '무작위 칸 묶음 삭제', r => { r.randSets.splice(i, 1); if (r.layers.rand) r.layers.rand = r.layers.rand.map(v => v === i + 1 ? 0 : v > i + 1 ? v - 1 : v); });
      }
      function commitSpawn(label) { const copy = spawnL.slice(); store.edit(key, label, r => { r.layers.spawn = copy; if (!r.spawn) r.spawn = { enabled: true, mobs: [], initial: 3, max: 6, respawn: 50, minDist: 8 }; }, { silent: !!fl.spawn }); }
      function spawnFill(x0, y0, v) {
        // 같은 "지나갈 수 있음" 영역(벽으로 막힌 방)을 채움
        const pass = i => { const t = PDM.TERRAIN_BY_ID[terrain[i]]; return t && t.pass; };
        const want = pass(y0 * W + x0), seen = new Set(), st = [[x0, y0]];
        while (st.length) { const [x, y] = st.pop(); const i = y * W + x; if (!inB(x, y) || seen.has(i) || pass(i) !== want) continue; seen.add(i); spawnL[i] = v; st.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]); }
      }
      function commitTerrain(label) { const copy = terrain.slice(); withPorts(label, () => store.edit(key, label, r => { r.layers.terrain = copy; }, { silent: true })); }
      let down = null, lastCell = -1;
      cv.addEventListener('contextmenu', e => e.preventDefault());
      setTimeout(() => cv.parentElement && cv.parentElement.addEventListener('wheel', e => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); zoomStep(e.deltaY < 0 ? 1 : -1); }, { passive: false }), 0);
      cv.style.touchAction = 'none';   // 태블릿 펜 · 터치로 끌 때 브라우저가 화면 스크롤로 가져가지 않게
      cv.addEventListener('pointerdown', e => {
        if (navKey && e.button === 0) { e.preventDefault(); const sc = cv.parentElement, r = sc.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          let i0 = 0; ZOOMS.forEach((z, i) => { if (Math.abs(z - ui.zoom) < Math.abs(ZOOMS[i0] - ui.zoom)) i0 = i; });
          nav = navKey === 'pan' ? { type: 'pan', x: e.clientX, y: e.clientY, l: sc.scrollLeft, t: sc.scrollTop } : { type: 'zoom', cx, cy, d0: Math.hypot(e.clientX - cx, e.clientY - cy), i0 };
          cv.style.cursor = navKey === 'pan' ? 'grabbing' : 'zoom-in'; return; }
        const [x, y] = cellAt(e);
        if (ui.moveObj >= 0) {   // 우클릭 메뉴 "이동": 왼쪽 클릭한 칸으로 옮김 (오른쪽 클릭 = 취소)
          const i = ui.moveObj; ui.moveObj = -1; ui.moveTo = null;
          if (e.button === 0 && inB(x, y) && fl.objects[i]) moveObjTo(i, x, y); else { paint(); info.textContent = '이동 취소'; }
          return;
        }
        if (e.button === 2) {   // 오브젝트 위에서 우클릭: 끌면 이동, 그냥 놓으면 메뉴
          const oi = objAt(x, y);
          if (oi >= 0) { ui.sel = oi; ui.port = -1; paint(); showInspector(); down = { right: oi, from: [x, y], move: drawable ? oi : undefined }; return; }
        }
        const corner = drawable && e.button === 0 ? cornerAt(e) : null;
        if (corner) { e.preventDefault(); down = { resize: corner, rect: [0, 0, W, H] }; paint(); return; }
        if (drawable && e.button === 0 && !inB(x, y) && ['pen', 'rect', 'room'].includes(ui.tool) && ui.terrain >= 0) {   // 점선 바깥에 그리면 그 칸까지 넓힘
          const ox = Math.min(0, x), oy = Math.min(0, y), nw = Math.max(W, x + 1) - ox, nh = Math.max(H, y + 1) - oy;
          if (nw > MAXS || nh > MAXS) { toast(`최대 ${MAXS}×${MAXS}칸까지입니다`, 'bad'); return; }
          const v = ui.terrain; reshape(ox, oy, nw, nh, '바깥에 그려 맵 넓히기', nt => { nt[(y - oy) * nw + (x - ox)] = v; });
          return;
        }
        if (drawable && e.button === 2 && inB(x, y)) { ui.terrain = terrain[y * W + x]; if (ui.tool === 'object' || ui.tool === 'select') ui.tool = 'pen'; drawPalette(); drawTools(); return; }
        if (ui.tool === 'rand' && canRand && inB(x, y)) {
          if (e.button === 2) return;
          if (ui.randShape === 'rect') { down = 'randrect'; dragRect = [x, y, x, y]; paint(); }
          else { down = 'rand'; randL[y * W + x] = ui.randVal; paint(); }
          return;
        }
        if (ui.tool === 'spawn' && canSpawn && inB(x, y)) {
          if (e.button === 2) return;
          if (ui.spawnShape === 'rect') { down = 'spawnrect'; dragRect = [x, y, x, y]; paint(); }
          else if (ui.spawnShape === 'fill') { spawnFill(x, y, ui.spawnVal); paint(); commitSpawn('스폰 구역 채우기'); }
          else { down = 'spawn'; spawnL[y * W + x] = ui.spawnVal; paint(); }
          return;
        }
        if (ui.tool === 'erase') { if (inB(x, y) && e.button === 0) { down = { erase: true, objs: new Set() }; brushCells(x, y).forEach(([bx, by]) => eraseCell(bx, by)); } return; }
        if (ui.tool === 'pen' && inB(x, y)) { down = 'pen'; brushCells(x, y).forEach(([bx, by]) => { terrain[by * W + bx] = ui.terrain; }); lastCell = y * W + x; paint(); }
        else if ((ui.tool === 'rect' || ui.tool === 'room') && inB(x, y)) { down = ui.tool; dragRect = [x, y, x, y]; paint(); }
        else if (ui.tool === 'fill' && inB(x, y)) { flood(x, y, ui.terrain); paint(); commitTerrain('채우기'); }
        else if (ui.tool === 'pick' && inB(x, y)) { ui.terrain = terrain[y * W + x]; ui.tool = 'pen'; drawPalette(); drawTools(); }
        else if (ui.tool === 'object') {
          const noRef = !PDM.OBJECT_TYPES[ui.objType].ref;
          if (!ui.objRef && !noRef) { toast('놓을 대상을 먼저 고르세요', 'bad'); return; }
          const o = { id: PDM.uid('o'), type: ui.objType, ref: noRef ? '' : ui.objRef, at: drawable ? { x, y } : { rule: 'random' }, cond: '', count: 1 };
          ui.sel = (fl.objects || []).length;   // 새로 놓은 것을 선택 상태로
          store.edit(key, '오브젝트 놓기', r => { r.objects = r.objects || []; r.objects.push(o); });
        } else if (ui.tool === 'select') {
          const i = objAt(x, y); ui.sel = i;
          ui.port = i < 0 && drawable && kind === 'node' && inB(x, y) && isStair(terrain[y * W + x]) ? y * W + x : -1;
          paint(); showInspector();
          if (i >= 0 && drawable) down = { move: i, from: [x, y] };
          else if (ui.port >= 0) down = { port: ui.port };
        }
      });
      cv.addEventListener('pointermove', e => {
        const [x, y] = cellAt(e);
        const t = inB(x, y) && drawable ? PDM.TERRAIN_BY_ID[terrain[y * W + x]] : null;
        const oi = objAt(x, y);
        if (nav || navKey) return;
        if (ui.moveObj >= 0) { cv.style.cursor = 'move'; info.textContent = `옮길 칸을 누르세요 (오른쪽 클릭 · Esc = 취소)  (${x}, ${y})`; const nt = inB(x, y) ? [x, y] : null; if (String(nt) !== String(ui.moveTo)) { ui.moveTo = nt; paint(); } return; }
        if (!down) cv.style.cursor = drawable && cornerAt(e) ? (c => c[0] === c[1] ? 'nwse-resize' : 'nesw-resize')(cornerAt(e)) : '';
        hoverCell = { x, y };
        info.textContent = `(${x}, ${y})  ${t ? PDM.terrainName(t, up) + ' [' + t.id + ']' : ''}${canSpawn && inB(x, y) && spawnL[y * W + x] ? ' · ' + SPAWN_VALS[spawnL[y * W + x]][0] : ''}${canRand && inB(x, y) && randL[y * W + x] ? ' · 🎲' + randL[y * W + x] + ' ' + ((fl.randSets || [])[randL[y * W + x] - 1] || {}).name : ''}  ${oi >= 0 ? '· ' + PDM.OBJECT_TYPES[fl.objects[oi].type].name + ' ' + (fl.objects[oi].ref || '') : ''}`;
        if (down === 'pen' && inB(x, y)) { let ch = false; brushCells(x, y).forEach(([bx, by]) => { if (terrain[by * W + bx] !== ui.terrain) { terrain[by * W + bx] = ui.terrain; ch = true; } }); if (ch) { lastCell = y * W + x; paint(); } }
        else if (down === 'spawn' && inB(x, y) && spawnL[y * W + x] !== ui.spawnVal) { spawnL[y * W + x] = ui.spawnVal; paint(); }
        else if (down === 'rand' && inB(x, y) && randL[y * W + x] !== ui.randVal) { randL[y * W + x] = ui.randVal; paint(); }
        else if ((down === 'rect' || down === 'room' || down === 'spawnrect' || down === 'randrect') && dragRect) { dragRect[2] = PDM.clamp(x, 0, W - 1); dragRect[3] = PDM.clamp(y, 0, H - 1); paint(); }
        else if (down && down.erase) { if (inB(x, y)) brushCells(x, y).forEach(([bx, by]) => eraseCell(bx, by)); }
        else if (down && (down.move !== undefined || down.port !== undefined)) { if (inB(x, y)) { down.to = [x, y]; paint(); } }
      });
      const onUp = e => {
        if (down && down.right !== undefined && (!down.to || (down.to[0] === down.from[0] && down.to[1] === down.from[1]))) {   // 우클릭만 (끌지 않음) → 메뉴
          const i = down.right; down = null; paint(); objMenu(e, i); return;
        }
        if (down && down.resize) {
          const [rx, ry, rw, rh] = down.rect; down = null;
          if (rx !== 0 || ry !== 0 || rw !== W || rh !== H) reshape(rx, ry, rw, rh, '맵 크기 바꾸기'); else paint();
          return;
        }
        if (down && down.erase) { const o = down.objs; down = null; commitErase(o); paint(); return; }
        if (down && down.port !== undefined) { const a = down.port, to = down.to; down = null; if (to) movePort(a, to[1] * W + to[0]); paint(); return; }
        if (down === 'pen') { commitTerrain('타일 그리기'); if (kind === 'node' && isStair(ui.terrain) && lastCell >= 0 && terrain[lastCell] === ui.terrain) { ui.port = lastCell; ui.sel = -1; down = null; drawPalette(); paint(); showInspector(); return; } }
        else if (down === 'spawn') commitSpawn('스폰 구역 칠하기');
        else if (down === 'rand') commitRand('무작위 칸 칠하기');
        else if (down === 'randrect' && dragRect) {
          const [a, b, c, d] = dragRect;
          for (let y = Math.min(b, d); y <= Math.max(b, d); y++) for (let x = Math.min(a, c); x <= Math.max(a, c); x++) randL[y * W + x] = ui.randVal;
          dragRect = null; paint(); commitRand('무작위 칸 사각형');
        }
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
          moveObjTo(i, x, y);
        }
        down = null;
      };
      function moveObjTo(i, x, y) {
        const oa = fl.objects[i].at, oc = oa && oa.x != null ? oa.y * W + oa.x : -1;
        if (oc === y * W + x) { paint(); return; }
        withPorts('오브젝트 이동', () => store.edit(key, '오브젝트 이동', r => { r.objects[i].at = { x, y }; }, { silent: true }), { [oc]: y * W + x });
        paint(); showInspector();
      }
      /** 오브젝트 우클릭 메뉴 */
      function objMenu(e, i) {
        const o = fl.objects[i]; if (!o) return;
        const T = PDM.OBJECT_TYPES[o.type] || {}, refKind = { npc: 'char', mob: 'char', item: 'item', event: 'event', plate: 'event', prop: 'prop', effect: 'effect' }[o.type];
        const at = o.at && o.at.x != null ? o.at : null;
        PDM.ui.menu(e.clientX, e.clientY, [
          { label: `${T.name || o.type}${o.ref ? ' · ' + o.ref : ''}${at ? ` (${at.x}, ${at.y})` : ''}`, disabled: true, run: () => {} },
          '-',
          { label: '설정 열기', hint: '오른쪽 속성 창', run: () => { ui.sel = i; paint(); showInspector(); const ins = document.querySelector('#inspBody'); if (ins) ins.scrollTop = 0; } },
          { label: '이동…', hint: '다음에 누르는 칸으로', disabled: !drawable, run: () => { ui.moveObj = i; ui.moveTo = null; cv.style.cursor = 'move'; info.textContent = '옮길 칸을 누르세요 (오른쪽 클릭 · Esc = 취소)'; } },
          { label: '복제', hint: '옆 빈 칸에', run: () => dupObj(i) },
          refKind ? { label: '대상 열기', disabled: !o.ref || o.ref.startsWith('spd:'), run: () => PDM.tabs.open(refKind === 'effect' ? 'effects' : `${refKind}:${o.ref}`) } : null,
          '-',
          { label: '삭제', hint: 'Delete', run: () => { ui.sel = -1; withPorts('오브젝트 삭제', () => store.edit(key, '오브젝트 삭제', r => { r.objects.splice(i, 1); })); } },
        ].filter(Boolean));
      }
      /** 오브젝트 복제: 가장 가까운 지나갈 수 있는 빈 칸에 (자동 생성 맵이면 목록 끝에) */
      /** 오브젝트 o 를 (cx, cy) 또는 가장 가까운 지나갈 수 있는 빈 칸에 놓음 (복제 · 붙여넣기 공용). r0 = 0 이면 그 칸부터 */
      function placeObj(o, cx, cy, r0, label) {
        o = JSON.parse(JSON.stringify(o)); o.id = PDM.uid('o');
        if (drawable && o.at && o.at.x != null) {
          let spot = null;
          for (let r = r0; r <= 6 && !spot; r++) for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const x = cx + dx, y = cy + dy, t = inB(x, y) ? PDM.TERRAIN_BY_ID[terrain[y * W + x]] : null;
            if (t && t.pass && objAt(x, y) < 0) spot = { x, y };
          }
          if (!spot) { toast('옆에 빈 칸이 없습니다', 'bad'); return; }
          o.at = spot;
        }
        ui.sel = (fl.objects || []).length;
        store.edit(key, label, r => { r.objects = r.objects || []; r.objects.push(o); });
      }
      function dupObj(i) { const o = fl.objects[i]; placeObj(o, (o.at || {}).x, (o.at || {}).y, 1, '오브젝트 복제'); }
      // Ctrl+C / Ctrl+V: 고른 오브젝트 → 마우스가 있던 칸(없으면 원래 자리 옆)에. 다른 맵 · 방 템플릿에도 붙여 넣을 수 있음
      ctx.copy = () => { const o = ui.sel >= 0 && (fl.objects || [])[ui.sel]; if (!o) return false; PDM.clip.set('mapobj', o, (PDM.OBJECT_TYPES[o.type] || {}).name + (o.ref ? ' ' + o.ref : '')); };
      ctx.paste = c => {
        if (c.kind !== 'mapobj' || !c.payload) return false;
        const o = c.payload, at = o.at || {};
        if (PDM.OBJECT_TYPES[o.type] && PDM.OBJECT_TYPES[o.type].nodeOnly && kind !== 'node') { toast('이 오브젝트는 직접 그린 맵에만 놓을 수 있습니다', 'bad'); return; }
        const p = hoverCell && inB(hoverCell.x, hoverCell.y) ? hoverCell : { x: at.x ?? 0, y: at.y ?? 0 };
        placeObj(o, p.x, p.y, hoverCell ? 0 : 1, '오브젝트 붙여넣기');
      };
      const onMove = e => { if (down && down.resize) { down.rect = resizeRect(e, down.resize); info.textContent = `맵 크기 ${down.rect[2]} × ${down.rect[3]}`; paint(); } };
      addEventListener('pointermove', onMove);
      addEventListener('pointerup', onUp);
      const onKey = e => {
        if (PDM.tabs.active !== key || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
        if (document.querySelector('.modal')) return;
        const c = e.ctrlKey || e.metaKey;
        if (e.key === 'Escape' && ui.moveObj >= 0) { ui.moveObj = -1; ui.moveTo = null; cv.style.cursor = ''; info.textContent = '이동 취소'; paint(); return; }
        if (e.code === 'Space' && !c) { e.preventDefault(); if (!navKey) { navKey = 'pan'; cv.style.cursor = 'grab'; } return; }
        if (e.code === 'KeyZ' && !c && !e.altKey) { e.preventDefault(); if (!navKey) { navKey = 'zoom'; cv.style.cursor = 'zoom-in'; } return; }
        const K = PDM.keys;
        if (K.is(e, 'draw.deselect')) { e.preventDefault(); ui.sel = -1; ui.port = -1; paint(); showInspector(); return; }
        // 도구 · 브러쉬 크기 — 편집 › 단축키 설정 의 "그리기" 키 (스프라이트 편집과 같은 키)
        const tk = K.tool(e, ['pen', 'erase', 'fill', 'pick', 'select']);
        if (tk && (drawable || tk === 'select')) { e.preventDefault(); ui.tool = tk; drawTools(); drawPalette(); return; }
        if (K.is(e, 'draw.brushDown') || K.is(e, 'draw.brushUp')) { e.preventDefault(); ui.brush = PDM.clamp((ui.brush || 1) + (K.is(e, 'draw.brushUp') ? 1 : -1), 1, 9); drawTools(); return; }
        if (e.key === 'Enter') { e.preventDefault(); zoomFit(); return; }
        if (e.key === 'Delete' && ui.sel < 0 && ui.port >= 0 && drawable && isStair(terrain[ui.port])) { deletePort(ui.port); return; }
        if (e.key === 'Delete' && ui.sel >= 0) { const i = ui.sel; ui.sel = -1; withPorts('오브젝트 삭제', () => store.edit(key, '오브젝트 삭제', r => { r.objects.splice(i, 1); })); }
      };
      addEventListener('keydown', onKey);
      // Space+끌기 = 화면 이동 · Z+끌기 = 확대(바깥으로)/축소(안쪽으로) — 스프라이트 편집과 같음
      let navKey = null, nav = null;
      const onKeyUp = e => { if ((e.code === 'Space' && navKey === 'pan') || (e.code === 'KeyZ' && navKey === 'zoom')) { navKey = null; if (!nav) cv.style.cursor = ''; } };
      addEventListener('keyup', onKeyUp);
      const onNavMove = e => {
        if (!nav) return; const sc = cv.parentElement;
        if (nav.type === 'pan') { sc.scrollLeft = nav.l - (e.clientX - nav.x); sc.scrollTop = nav.t - (e.clientY - nav.y); return; }
        const d = Math.hypot(e.clientX - nav.cx, e.clientY - nav.cy), i = PDM.clamp(nav.i0 + Math.round((d - nav.d0) / 40), 0, ZOOMS.length - 1);
        if (ZOOMS[i] !== ui.zoom) { ui.zoom = ZOOMS[i]; drawTools(); paint(); }
      };
      const onNavUp = () => { if (nav) { nav = null; cv.style.cursor = navKey === 'pan' ? 'grab' : navKey === 'zoom' ? 'zoom-in' : ''; } };
      addEventListener('pointermove', onNavMove); addEventListener('pointerup', onNavUp);
      ctx.onDispose(() => { removeEventListener('keyup', onKeyUp); removeEventListener('pointermove', onNavMove); removeEventListener('pointerup', onNavUp); });
      ctx.onDispose(() => { removeEventListener('pointerup', onUp); removeEventListener('pointermove', onMove); removeEventListener('keydown', onKey); });

      // ---- 인스펙터: 층 속성 / 선택한 오브젝트 ----
      function showInspector() {
        const { F, section, row } = PDM.ui;
        const o = fl.objects && fl.objects[ui.sel];
        if (o) {
          const p = ['objects', ui.sel];
          const refKind = { npc: 'char', mob: 'char', item: 'item', event: 'event', plate: 'event', prop: 'prop', effect: 'effect' }[o.type];
          const el = h('div', {},
            F.select(key, [...p, 'type'], Object.fromEntries(Object.entries(PDM.OBJECT_TYPES).map(([k, v]) => [k, v.name])), { label: '종류' }),
            refKind ? F.ref(key, [...p, 'ref'], refKind, { label: '대상' }) : null,
            drawable ? row(F.num(key, [...p, 'at', 'x'], { label: 'x', int: true, rerender: true }), F.num(key, [...p, 'at', 'y'], { label: 'y', int: true, rerender: true }))
              : F.select(key, [...p, 'at', 'rule'], PDM.PLACE_RULES, { label: '배치 규칙' }),
            F.cond(key, [...p, 'cond'], { label: '등장 조건', hint: '비우면 항상 등장. 예: !switch.mireille_joined' }),
            o.type === 'mob' || o.type === 'item' ? F.num(key, [...p, 'count'], { label: '개수', min: 1, int: true }) : null,
            kind === 'room' ? F.num(key, [...p, 'chance'], { label: '나올 확률 (%)', int: true, min: 0, max: 100, def: 100, hint: '방이 들어갈 때마다 이 확률로 놓임 (100 = 늘)' }) : null,
            o.type === 'item' ? F.select(key, [...p, 'container'], PDM.ITEM_CONTAINERS, { label: '담는 방식' }) : null,
            o.type === 'npc' ? F.ref(key, [...p, 'event'], 'event', { label: '말 걸면 실행할 이벤트', empty: '(캐릭터의 인사 대사)' }) : null,
            o.type === 'start' ? (() => { const W0 = store.get('world') || {}, linked = [...new Set((W0.edges || []).filter(e => e.from === fl.id || e.to === fl.id).map(e => e.from === fl.id ? e.to : e.from))];
              return h('div', {},
                F.select(key, [...p, 'when'], { start: '게임을 시작할 때 (시작 맵에서 한 번)', always: '이 맵에 들어올 때마다 (어느 입구로 오든)', from: '고른 맵에서 넘어올 때' }, { label: '영웅을 여기에 세우는 때', rerender: true }),
                o.when === 'from' ? F.select(key, [...p, 'from'], Object.fromEntries(linked.map(id => [id, PDM.World.fullName(id)])), { label: '어느 맵에서 올 때 (이어진 맵)', empty: '(맵 고르기)' }) : null,
                h('div', { class: 'hint', style: { margin: '4px 0' } }, '게임에서는 보이지 않습니다. 이 칸이 없으면 평소처럼 입구(계단)에 서고, 입구도 없으면 맵 가운데 근처의 빈 칸에 섭니다. 지나갈 수 없는 칸(벽 · 빈 칸) 위에 놓으면 쓰이지 않습니다. 여러 개가 맞으면 "고른 맵에서 올 때" → "게임을 시작할 때" → "들어올 때마다" 순으로 씁니다. 저장을 불러올 때는 저장된 자리 그대로입니다.' + ((W0.start || '') !== fl.id && (o.when || 'start') === 'start' ? ' ⚠ 이 맵은 시작 맵이 아니라서 "게임을 시작할 때"는 쓰이지 않습니다.' : ''))); })() : null,
            (o.type === 'exit' || o.type === 'entrance') && drawable && o.at && o.at.x != null ? h('div', {}, h('div', { class: 'hint', style: { margin: '6px 0' } }, `그림이 없는 ${o.type === 'exit' ? '출구' : '입구'} — 아래 타일(문·바닥·맵 가장자리 등)은 그대로 보이고, 영웅이 이 칸을 밟으면 바로 다른 맵으로 넘어갑니다.`), portPanel(o.at.y * W + o.at.x, o.type === 'exit', true)) : null,
            o.type === 'light' ? h('div', {}, ...PDM.lightFields(key, p, o),
              h('div', { class: 'hint', style: { margin: '4px 0' } }, '게임에서는 광원 자체는 보이지 않고 빛만 보입니다. 위쪽 "조건"에 스위치 등을 적으면 그 조건이 맞을 때만 켜집니다 (게임 중에 바뀌어도 반영).')) : null,
            o.type === 'plate' ? h('div', {}, F.bool(key, [...p, 'once'], { label: '한 번만 발동 (밟은 뒤 사라짐)' }), h('div', { class: 'hint', style: { margin: '4px 0' } }, '게임에서는 보이지 않습니다. 영웅이 이 칸을 밟으면 위 「대상」 이벤트가 바로 실행됩니다 (이벤트의 발동 방식·이미지 설정과 상관없이).')) : null,
            F.text(key, [...p, 'note'], { label: '메모' }),
            h('div', { style: { display: 'flex', gap: '6px', marginTop: '8px' } },
              refKind ? h('button', { class: 'btn sm', onclick: () => o.ref && !o.ref.startsWith('spd:') && PDM.tabs.open(refKind === 'effect' ? 'effects' : `${refKind}:${o.ref}`) }, '대상 열기') : null,
              h('button', { class: 'btn sm danger', onclick: () => { const i = ui.sel; ui.sel = -1; withPorts('오브젝트 삭제', () => store.edit(key, '오브젝트 삭제', r => { r.objects.splice(i, 1); })); } }, '삭제')));
          PDM.inspector.show(`${PDM.OBJECT_TYPES[o.type].name} #${ui.sel}`, el);
          return;
        }
        if (drawable && kind === 'node' && ui.port >= 0 && isStair(terrain[ui.port])) {
          const cell = ui.port, isExit = EXITS.includes(terrain[cell]), P_ = W_.ports(fl.id);
          const t = (isExit ? P_.exits : P_.entrances).find(q => q.cell === cell) || { i: 0 };
          const xI = h('input', { type: 'number', value: cell % W, min: 0, max: W - 1 }), yI = h('input', { type: 'number', value: Math.floor(cell / W), min: 0, max: H - 1 });
          const mv = () => movePort(cell, PDM.clamp(+yI.value | 0, 0, H - 1) * W + PDM.clamp(+xI.value | 0, 0, W - 1));
          xI.onchange = mv; yI.onchange = mv;
          const el = h('div', {}, row(PDM.ui.field('x', xI), PDM.ui.field('y', yI)));
          el.append(portPanel(cell, isExit));
          el.append(h('div', { style: { display: 'flex', gap: '6px', marginTop: '8px' } },
            h('button', { class: 'btn sm', onclick: () => { PDM.tabs.open('world'); setTimeout(() => PDM.worldFocus && PDM.worldFocus(fl.id), 50); } }, '⌘ 그래프에서 보기'),
            h('button', { class: 'btn sm danger', title: 'Delete — 계단을 지우고 바닥으로', onclick: () => deletePort(cell) }, '삭제')));
          PDM.inspector.show(`${isExit ? '출구' : '입구'} ${t.i + 1}`, el);
          return;
        }
        const pr = ['procedural'];
        let el;
        if (kind === 'room') {
          const used = roomUsage(fl.id);
          el = h('div', {},
            PDM.resOps.bar('room', fl.id),   // id 바꾸기 · 복제 · 복사 · 쓰는 곳 · 삭제 (리소스 목록 오른쪽 클릭과 같은 동작)
            F.text(key, ['name'], { label: '방 이름', rerender: true }),
            F.select(key, ['kind'], { standard: '일반 방 (여러 방과 연결)', special: '특수 방 (입구 하나, 막다른 방)' }, { label: '종류' }),
            PDM.filters ? PDM.filters.field(key, ['filter'], '화면 필터 (영웅이 이 방 안에 있는 동안)', '(없음 — 맵 설정대로)') : null,
            safeFields(key, fl, '영웅이 이 방 안에 있는 동안'),
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
            variationSection(),
            section('크기 (5~18칸, 벽 포함)', resizeUI(5, 18), h('div', { class: 'hint' }, '맵 모서리의 손잡이를 끌어도 크기를 바꿀 수 있습니다.')),
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
          safeFields(key, fl, '이 맵 전체'),
          F.ref(key, ['theme'], 'theme', { label: '테마', empty: `(그룹 테마: ${themeName((grp || {}).theme) || '깊이 기본'})`, rerender: true }),
          PDM.filters ? PDM.filters.field(key, ['filter'], '화면 필터 (이 맵에 있는 동안)', '(없음 — 그룹 설정대로)') : null,
          section(`지형 광원 (${(fl.terrainLights || []).length})`,
            h('div', { class: 'hint' }, '고른 지형의 칸마다 은은한 빛이 퍼집니다 — 예) 물 → 보라빛 발광 호수, 잿불 → 붉은 빛. 직접 그린 칸 · 자동 생성 칸 모두에 적용되고, 영웅이 못 보는 칸에서는 꺼집니다 (벽 그림자는 없음). 깜빡임을 주면 칸마다 박자가 어긋나 일렁입니다.'),
            ...(fl.terrainLights || []).map((tl, i) => h('div', { class: 'card', style: { padding: '6px', margin: '6px 0' } },
              row(F.select(key, ['terrainLights', i, 'terrain'], PDM.TERRAIN.map(t => [t.id, t.name]), { label: '지형', number: true }),
                h('button', { class: 'btn xs', style: { alignSelf: 'end' }, onclick: () => store.edit(key, '지형 광원 삭제', o => { o.terrainLights.splice(i, 1); if (!o.terrainLights.length) delete o.terrainLights; }) }, '삭제')),
              ...PDM.lightFields(key, ['terrainLights', i], tl, { area: true }))),
            h('button', { class: 'btn sm add', onclick: () => store.edit(key, '지형 광원 추가', o => { (o.terrainLights = o.terrainLights || []).push({ terrain: 29, color: '#9a7cff', k: 1.5, z: 10, range: 2, pulse: 3, pulseMin: 55 }); }) }, '+ 지형 광원 추가')),
          section(`자동 광원 (${(fl.autoLights || []).length})`,
            h('div', { class: 'hint' }, '고른 지형 칸에 겹치도록 점광원을 자동으로 놓습니다 (벽 · 물건 · 캐릭터 그림자 있음) — 자동 생성 층에서도 됩니다. 자리는 층마다 씨앗으로 정해져서 다시 들어와도 같습니다. 예) 석상마다 촛불, 장식 벽에 횃불(빛 위치를 ↓ 로 옮김), 물 몇 군데에 도깨비불.'),
            ...(fl.autoLights || []).map((al, i) => h('div', { class: 'card', style: { padding: '6px', margin: '6px 0' } },
              row(F.select(key, ['autoLights', i, 'terrain'], PDM.TERRAIN.map(t => [t.id, t.name]), { label: '놓을 지형', number: true }),
                F.num(key, ['autoLights', i, 'chance'], { label: '칸마다 확률 (%)', int: true, min: 0, max: 100, def: 100 }),
                F.num(key, ['autoLights', i, 'max'], { label: '최대 개수 (0 = 제한 없음)', int: true, min: 0, max: 200, def: 0 }),
                F.num(key, ['autoLights', i, 'spacing'], { label: '최소 간격 (칸)', min: 0, max: 30, step: 0.5, def: 3, hint: '광원끼리 이보다 가까이 놓지 않음' }),
                h('button', { class: 'btn xs', style: { alignSelf: 'end' }, onclick: () => store.edit(key, '자동 광원 삭제', o => { o.autoLights.splice(i, 1); if (!o.autoLights.length) delete o.autoLights; }) }, '삭제')),
              row(F.num(key, ['autoLights', i, 'ox'], { label: '빛 위치 옮김 → (px)', def: 0 }), F.num(key, ['autoLights', i, 'oy'], { label: '빛 위치 옮김 ↓ (px)', def: 0 }),
                F.cond(key, ['autoLights', i, 'cond'], { label: '켜지는 조건 (비우면 늘)' })),
              ...PDM.lightFields(key, ['autoLights', i], al))),
            h('button', { class: 'btn sm add', onclick: () => store.edit(key, '자동 광원 추가', o => { (o.autoLights = o.autoLights || []).push({ terrain: 25, chance: 100, max: 0, spacing: 3, color: '#ffc870', k: 4, z: 10, range: 4, pulse: 0.8, pulseMin: 80 }); }) }, '+ 자동 광원 추가')),
          fl.mode !== 'handmade' ? section('구성 블럭 (자동 생성)',
            h('div', { class: 'hint' }, '블럭을 쌓아 이 층의 구성을 정합니다. 방의 위치와 연결, 방 안의 내용은 게임이 들어갈 때마다 자동으로 만듭니다.'
              + (!((fl.procedural || {}).blocks || []).length && grp && (grp.blocks || []).length ? ` 지금은 그룹 「${grp.name}」 의 블럭 ${grp.blocks.length}개를 따릅니다.` : '')),
            blockListEditor(key, [...pr, 'blocks'], grp && (grp.blocks || []).length ? { emptyText: `블럭 없음 — 그룹 「${grp.name}」 의 구성 블럭을 따릅니다. 여기에 쌓으면 이 노드만 다른 구성이 됩니다.` } : { theme: fl.theme || (grp || {}).theme || PDM.defaultThemeForDepth(fl.depth || 1) }),
            fl.mode === 'hybrid' ? F.select(key, ['hybrid', 'placement'], { special: '특수 방으로 (막다른 방)', random: '일반 방으로 (여러 방과 연결)' }, { label: '직접 그린 방을 넣는 방식' }) : null) : null,
          fl.mode !== 'handmade' ? section('추가 방 (방 템플릿)',
            h('div', { class: 'hint' }, '자동 생성할 때 이 방들을 함께 넣습니다.' + (grp && (grp.rooms || []).length ? ` 그룹 「${grp.name}」 의 방 ${grp.rooms.length}개도 들어갑니다.` : '')),
            roomListEditor(key, [...pr, 'rooms'])) : null,
          drawable ? section('크기', resizeUI(5, 80)) : null,
          canSpawn ? spawnSection() : null,
          section('연결',
            h('div', { class: 'hint' }, '들어오는 곳: '), ins.length ? ins.map(e => h('div', {}, '← ', link(e.from), portText(e, false))) : h('div', { class: 'hint' }, fl.id === (store.get('world') || {}).start ? '시작 노드' : '없음 (이벤트 "맵 이동"이나 입구 목적지로만 옴)'),
            h('div', { class: 'hint', style: { marginTop: '4px' } }, '나가는 곳: '), outs.length ? outs.map(e => h('div', {}, '→ ', link(e.to), portText(e, true))) : h('div', { class: 'hint' }, '없음 — 출구가 온 곳으로 되돌아갑니다'),
            h('div', { class: 'hint', style: { marginTop: '4px' } }, '연결은 맵 그래프에서 노드 가장자리의 점(위·아래·왼쪽·오른쪽)을 끌어서 만듭니다 (같은 두 노드 사이에 여러 개 가능). 연결을 누르면 쓸 출구·입구 번호를 고를 수 있습니다.'),
            F.select(key, ['entranceTo'], W_.options().filter(([id]) => id !== fl.id), { label: '입구 계단 목적지 (고급)', empty: '(기본: 온 곳으로 돌아가기)', hint: '예: 1층 입구 → 마을. 시작 노드의 입구는 기본이 "지상으로 나가기"' })),
          F.ref(key, ['onEnter'], 'event', { label: '들어올 때 이벤트 (처음 한 번)', empty: '(없음)' }),
          F.textarea(key, ['note'], { label: '메모' }),
          h('div', { class: 'hint' }, `오브젝트 ${(fl.objects || []).length}개 · 파일 maps/nodes/${fl.id}.json`));
        PDM.inspector.show(`${W_.fullName(fl.id)} 속성`, el);
      }
      // ---- 방 템플릿 변형 (뒤집기 · 돌리기 · 무작위 칸) — 런타임 TemplateRoom 과 같은 계산 ----
      function variationSection() {
        const { F, section, row } = PDM.ui;
        const sets = fl.randSets || [];
        const TER = [[-2, '(그린 타일 그대로)'], ...PDM.TERRAIN.map(t => [t.id, t.name])];
        return section('변형 (방이 들어갈 때마다 달라짐)',
          h('div', { class: 'hint' }, '같은 방이라도 들어갈 때마다 모양이 바뀌게 합니다. 오브젝트 · 문 자리도 같이 뒤집히고 돌아갑니다.'),
          row(F.bool(key, ['variation', 'flipH'], { label: '좌우 뒤집기 (반반)' }), F.bool(key, ['variation', 'flipV'], { label: '상하 뒤집기 (반반)' }), F.bool(key, ['variation', 'rotate'], { label: '90° 돌리기 (반반 · 가로세로가 바뀜)' })),
          h('div', { class: 'fl', style: { marginTop: '6px' } }, `🎲 무작위 칸 묶음 (${sets.length})`),
          ...sets.map((st, i) => h('div', { class: 'card', style: { padding: '6px', margin: '4px 0', borderLeft: '4px solid ' + randColor(i + 1) } },
            row(F.text(key, ['randSets', i, 'name'], { label: `${i + 1}. 이름`, rerender: true }),
              F.select(key, ['randSets', i, 'mode'], { cell: '칸마다 따로 굴림', all: '묶음 전체가 같은 결과' }, { label: '굴리는 방식', hint: '"묶음 전체" = 예) 이 웅덩이가 통째로 물이거나 통째로 용암' }),
              h('button', { class: 'btn xs', style: { alignSelf: 'end' }, onclick: () => dupRandSet(i) }, '복제'),
              h('button', { class: 'btn xs danger', style: { alignSelf: 'end' }, onclick: () => removeRandSet(i) }, '삭제')),
            ...(st.opts || []).map((op, j) => row(F.select(key, ['randSets', i, 'opts', j, 't'], TER, { label: j ? '' : '선택지 (지형)', number: true }),
              F.num(key, ['randSets', i, 'opts', j, 'w'], { label: j ? '' : '무게', min: 0, step: 1, def: 1, hint: j ? '' : '숫자가 클수록 자주 (예: 3 · 1 → 75% · 25%)' }),
              h('button', { class: 'btn xs', style: { alignSelf: 'end' }, onclick: () => store.edit(key, '선택지 삭제', r => { r.randSets[i].opts.splice(j, 1); }) }, '×'))),
            h('button', { class: 'btn xs add', onclick: () => store.edit(key, '선택지 추가', r => { (r.randSets[i].opts = r.randSets[i].opts || []).push({ t: -2, w: 1 }); }) }, '+ 선택지'),
            h('button', { class: 'btn xs', style: { marginLeft: '4px' }, onclick: () => { ui.tool = 'rand'; ui.randVal = i + 1; ui.showRand = true; drawTools(); drawPalette(); paint(); } }, '이 묶음으로 칠하기'))),
          h('div', { style: { display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' } },
            h('button', { class: 'btn sm add', onclick: () => addRandSet() }, '+ 무작위 칸 묶음'),
            h('button', { class: 'btn sm', onclick: () => previewVariants() }, '🎲 변형 미리보기')),
          h('div', { class: 'hint' }, '오브젝트마다 "나올 확률"도 정할 수 있습니다 (오브젝트를 고르면 속성에 있음).'));
      }
      /** 런타임과 같은 방식으로 변형 하나 만들기 → { w, h, t, objs, m } */
      function makeVariant() {
        const v = fl.variation || {}, sets = fl.randSets || [], rl = randL || [];
        let m = 0; if (v.flipH && Math.random() < 0.5) m |= 1; if (v.flipV && Math.random() < 0.5) m |= 2; if (v.rotate && Math.random() < 0.5) m |= 4;
        const pick = st => { const os = (st && st.opts) || []; const sum = os.reduce((a, o) => a + Math.max(0, o.w ?? 1), 0); if (!sum) return -1; let r = Math.random() * sum; for (let k = 0; k < os.length; k++) { r -= Math.max(0, os[k].w ?? 1); if (r < 0) return k; } return os.length - 1; };
        const all = sets.map(pick), res = terrain.slice();
        if (rl.length === W * H) for (let i = 0; i < W * H; i++) { const s = rl[i] - 1; if (s < 0 || !sets[s]) continue; const k = sets[s].mode === 'all' ? all[s] : pick(sets[s]); const o = (sets[s].opts || [])[k]; if (o && o.t !== -2 && o.t != null) res[i] = +o.t; }
        const w = m & 4 ? H : W, hh = m & 4 ? W : H;
        const src = (rx, ry) => { let x = rx, y = ry; if (m & 4) [x, y] = [y, x]; if (m & 2) y = H - 1 - y; if (m & 1) x = W - 1 - x; return y * W + x; };
        const dst = (tx, ty) => { let x = tx, y = ty; if (m & 1) x = W - 1 - x; if (m & 2) y = H - 1 - y; if (m & 4) [x, y] = [y, x]; return [x, y]; };
        const t = []; for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) t.push(res[src(x, y)]);
        const objs = (fl.objects || []).filter(o => o.at && o.at.x != null && Math.random() * 100 < (o.chance ?? 100)).map(o => ({ o, at: dst(o.at.x, o.at.y) }));
        return { w, h: hh, t, objs, m };
      }
      function previewVariants() {
        const N = 6, grid = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: '10px', justifyContent: 'center' } });
        const roll = () => {
          grid.innerHTML = '';
          for (let n = 0; n < N; n++) {
            const vr = makeVariant(), s = Math.max(6, Math.min(16, Math.floor(220 / Math.max(vr.w, vr.h))));
            const c = h('canvas', { width: vr.w * s, height: vr.h * s, style: { imageRendering: 'pixelated', border: '1px solid var(--line)', borderRadius: '4px' } }), g = c.getContext('2d'); g.imageSmoothingEnabled = false;
            vr.t.forEach((v, i) => { const x = (i % vr.w) * s, y = Math.floor(i / vr.w) * s; if (v == null || v < 0) { g.fillStyle = '#15131c'; g.fillRect(x, y, s, s); } else PDM.assets.drawTerrain(g, tilesImg, v, x, y, s); });
            vr.objs.forEach(({ o, at }) => { const col = (PDM.OBJECT_TYPES[o.type] || {}).color || '#fff'; g.fillStyle = col; g.globalAlpha = .9; g.beginPath(); g.arc(at[0] * s + s / 2, at[1] * s + s / 2, s * .3, 0, 7); g.fill(); g.globalAlpha = 1; });
            const tag = [vr.m & 1 ? '좌우' : '', vr.m & 2 ? '상하' : '', vr.m & 4 ? '90°' : ''].filter(Boolean).join(' · ') || '그대로';
            grid.append(h('div', { style: { textAlign: 'center' } }, c, h('div', { class: 'hint' }, tag)));
          }
        };
        roll();
        PDM.ui.modal('변형 미리보기 — ' + (fl.name || fl.id), h('div', {}, h('div', { class: 'hint', style: { marginBottom: '8px' } }, '게임에서 이 방이 들어갈 때 나올 수 있는 모양 몇 가지입니다 (동그라미 = 오브젝트, 연결 안 된 문 자리는 게임에서 벽이 됨).'), grid,
          h('div', { style: { textAlign: 'center', marginTop: '8px' } }, h('button', { class: 'btn sm pri', onclick: e => { e.preventDefault(); roll(); } }, '🎲 다시 굴리기'))), [['닫기', true]]);
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
        const mobOpts = PDM.mobRefOptions();
        return section('몬스터 스폰',
          F.bool(key, ['spawn', 'enabled'], { label: '이 맵에서 몬스터가 생기고 다시 생김', rerender: true }),
          sp.enabled ? h('div', {},
            row(F.num(key, ['spawn', 'initial'], { label: '처음 수', int: true, min: 0, max: 40, def: 3 }), F.num(key, ['spawn', 'max'], { label: '최대 수', int: true, min: 0, max: 40, def: 6 })),
            row(F.num(key, ['spawn', 'respawn'], { label: '다시 생기는 간격 (턴)', int: true, min: 1, def: 50, hint: '게임 기본 50' }), F.num(key, ['spawn', 'minDist'], { label: '영웅과 최소 거리', int: true, min: 0, max: 30, def: 8 })),
            h('div', { class: 'fl', style: { marginTop: '6px' } }, '나오는 몬스터 (무게대로 무작위)'),
            !(sp.mobs || []).length ? PDM.gameSpawnBox(fl.depth || ((() => { try { return W_.info().depth[fl.id]; } catch (_) { return 0; } })()) || 1) : null,
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
            const nt = new Array(nw * nh).fill(-1);
            for (let y = 0; y < Math.min(nh, H); y++) for (let x = 0; x < Math.min(nw, W); x++) nt[y * nw + x] = terrain[y * W + x];
            const ns = new Array(nw * nh).fill(0), nr = new Array(nw * nh).fill(0);
            if (spawnL) for (let y = 0; y < Math.min(nh, H); y++) for (let x = 0; x < Math.min(nw, W); x++) ns[y * nw + x] = spawnL[y * W + x] || 0;
            if (randL) for (let y = 0; y < Math.min(nh, H); y++) for (let x = 0; x < Math.min(nw, W); x++) nr[y * nw + x] = randL[y * W + x] || 0;
            store.edit(key, '크기 바꾸기', r => { r.size = { w: nw, h: nh }; r.layers.terrain = nt; if (r.layers.spawn) r.layers.spawn = ns; if (r.layers.rand) r.layers.rand = nr; r.objects = (r.objects || []).filter(o => !o.at || o.at.x == null || (o.at.x < nw && o.at.y < nh)); });
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
