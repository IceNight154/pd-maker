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
      h('div', { class: 'hstack gap-4' }, h('h4', {}, `프로젝트 방 템플릿 (${mine.length})`),
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
      pvs.length ? h('div', { class: 'flex gap-5 items-end wrap m-0 mt-4 mb-2' },
        pvs.map(pv => h('div', { class: 'ta-center' }, roomCanvas(pv, 16, 240),
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
    wrap.append(h('div', { class: 'flex gap-2 wrap mb-4' }, Object.entries(BLOCKS).map(([t, B]) => {
      const dis = B.once && list.some(b => b.type === t);
      return h('button', { class: 'btn xs', disabled: dis, title: B.desc + (dis ? ' — 이미 있음' : ''), style: { borderLeft: `4px solid ${B.color}` },
        onclick: e => { e.preventDefault(); edit('블럭 추가: ' + B.name, a => { const b = B.make(); B.once ? a.unshift(b) : a.push(b); }); } }, `+ ${B.icon} ${B.name}`);
    })));
    if (!list.length) wrap.append(h('div', { class: 'empty' }, o.emptyText || '블럭 없음 — 게임 코드의 구성으로 만듭니다 (아래). 위에서 블럭을 눌러 쌓으면 그 구성대로 자동 생성합니다.'),
      !o.emptyText && o.theme ? PDM.gameLevelBox(o.theme) : null,
      h('button', { class: 'btn sm mt-3', onclick: e => { e.preventDefault(); edit('기본 구성 블럭', a => { a.push(BLOCKS.layout.make(), BLOCKS.standard.make(), BLOCKS.special.make(), BLOCKS.secret.make()); }); } }, '게임 기본과 비슷한 구성으로 채우기'));
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
          return pv ? h('div', { class: 'mt-2 pointer', title: '눌러서 자세히', onclick: () => g ? showGameRoom(g) : PDM.tabs.open('room:' + b.room) }, roomCanvas(pv, 8, 72)) : null; })());
      else body = row(F.num(key, [...p, 'min'], { label: '최소', int: true, min: 0, max: b.type === 'standard' ? 20 : b.type === 'special' ? 6 : 4 }),
        F.num(key, [...p, 'max'], { label: '최대', int: true, min: 0, max: b.type === 'standard' ? 20 : b.type === 'special' ? 6 : 4 }),
        b.type === 'standard' ? F.bool(key, [...p, 'big'], { label: '큰 방 허용' }) : null);
      const card = h('div', { class: 'li compact', draggable: true, style: { borderLeft: `4px solid ${B.color}`, flexDirection: 'column', gap: '2px' },
        ondragstart: e => { dragFrom = i; e.dataTransfer.effectAllowed = 'move'; },
        ondragover: e => { if (dragFrom >= 0 && dragFrom !== i) e.preventDefault(); },
        ondrop: e => { e.preventDefault(); const f = dragFrom; dragFrom = -1; if (f >= 0 && f !== i) edit('블럭 순서', a => { const [x] = a.splice(f, 1); a.splice(i, 0, x); }); } },
        h('div', { class: 'hstack' },
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
      wrap.append(h('div', { class: 'hint mt-3' }, `▶ 입구 + 출구 + 블럭 = 방 ${lo === hi ? lo : lo + '~' + hi}개` + (std === 0 ? ' · 일반 방 블럭이 없으면 일반 방 1개가 자동으로 들어갑니다' : '') + (hi > 20 ? ' · 방이 많으면 층이 아주 넓어집니다' : '')));
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
  // 왼쪽 패널 묶음 접힘 (5차) — 맵마다가 아니라 이 PC 전체에 기억
  const PAL_OPEN = (() => { try { return JSON.parse(localStorage.getItem('pdm.mapPalette') || '{}') || {}; } catch (_) { return {}; } })();
  const savePalOpen = () => { try { localStorage.setItem('pdm.mapPalette', JSON.stringify(PAL_OPEN)); } catch (_) { /* 저장 불가 */ } };
  let focusReq = null;   // 검사 결과를 누름: 다음에 그 맵을 그릴 때 그 칸을 영역으로 고름 (PDM.mapUtil.focus)

  /** 안전구역 설정 칸 (맵 노드 · 방 템플릿 공통) — 런타임 MakerSafe */
  function safeFields(key, fl, where) {
    const { F } = PDM.ui, sf = fl.safe || {};
    const cb = (k, def, label, title) => { const c = h('input', { type: 'checkbox', checked: sf[k] === undefined ? def : !!sf[k] }); c.onchange = () => store.edit(key, '안전구역', r => { r.safe = r.safe || { on: true }; r.safe[k] = c.checked; }, { silent: true }); return h('label', { class: 'check', title: title || '' }, c, label); };
    const on = h('input', { type: 'checkbox', checked: !!sf.on }); on.onchange = () => store.edit(key, '안전구역', r => { r.safe = Object.assign({ hunger: true, feed: false, cure: true, heal: 0, msg: true }, r.safe || {}, { on: on.checked }); });
    return h('div', { style: { border: '1px solid var(--line)', borderRadius: '6px', padding: '6px 8px', margin: '6px 0' } },
      h('label', { class: 'check', title: `${where} 안전구역으로 씁니다` }, on, h('b', {}, '🛡 안전구역 사용'), h('span', { class: 'hint ml-3' }, `(${where})`)),
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
      if (focusReq && focusReq.key === key) { const c = focusReq.cell; focusReq = null; ui.tool = 'select'; ui.selIds = []; ui.sel = -1; ui.area = { x0: c.x, y0: c.y, x1: c.x, y1: c.y }; }   // 검사 결과에서 칸으로 이동
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
        return h('div', { class: 'page full vstack gap-0' },
          h('div', { class: 'map-tools' },
            h('button', { class: 'tool', onclick: back }, '← 맵 편집으로'),
            h('b', { style: { margin: '0 8px' } }, `맵 세부 그리기 — ${fl.name || fl.id} (${PW}×${PH}px)`),
            h('label', { class: 'hint hstack gap-2', title: '끄면 게임에서 원래 타일 그림으로 보입니다 (그림 파일은 남음)' }, en, '게임에 이 그림 쓰기'),
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
      // 사용자 타일 (맵 그림에서 만든 타일 — world.userTiles): 칸마다 타일 id ('' = 없음). 칠하면 그 타일의 지형도 같이
      // 타일 레이어 (world.tileLayers — 지형 위에 순서대로): tilesL[레이어 id] = 칸마다 타일 id. utileL = 지금 칠하는(고른) 레이어
      const LAYERS = () => { const d = PDM.tileLayers(), extra = Object.keys(tilesL || {}).filter(id => !d.some(l => l.id === id)).map(id => ({ id, name: id + ' (정의 없음)', depth: 'below', visible: true })); return [...d, ...extra]; };
      const blankL = () => new Array(W * H).fill('');
      let tilesL = null;
      if (drawable) {
        tilesL = {};
        const src = (fl.layers || {}).tiles || {};
        for (const [id, arr] of Object.entries(src)) if (Array.isArray(arr)) tilesL[id] = arr.length === W * H ? arr.slice() : blankL();
        if (Array.isArray((fl.layers || {}).utile) && !tilesL.base) tilesL.base = fl.layers.utile.length === W * H ? fl.layers.utile.slice() : blankL();   // 아직 옮기지 않은 예전 형식
      }
      if (!ui.tileLayer || !PDM.tileLayers().some(l => l.id === ui.tileLayer)) ui.tileLayer = (PDM.tileLayers()[0] || { id: 'base' }).id;
      if (!ui.hideLayers) ui.hideLayers = {};   // 편집기에서만 숨긴 레이어 (게임과 상관없음)
      if (!ui.lockLayers) ui.lockLayers = {};   // 잠근 레이어 (편집기에서만): 칠하기 · 지우개 · 영역 지우기/붙여넣기가 건드리지 않음
      // 편집 대상 (5차): 'terrain' = 지형(+ 영역 도구는 모든 레이어) · 'layer' = ui.tileLayer 하나 — 그리기 도구 · 지우개 · 영역 복사/붙여넣기/지우기가 이 대상만 고침
      if (!ui.target) ui.target = ui.tool === 'utile' ? 'layer' : 'terrain';
      if (tilesL && !tilesL[ui.tileLayer]) tilesL[ui.tileLayer] = blankL();
      let utileL = tilesL ? tilesL[ui.tileLayer] : null;
      /** 저장할 모양: 빈 레이어는 빼고 { id: [...] } (없으면 null) */
      const tilesOut = () => { if (!tilesL) return null; const o = {}; for (const [id, a] of Object.entries(tilesL)) if (a.some(Boolean)) o[id] = a.slice(); return Object.keys(o).length ? o : null; };
      const putTiles = r => { const o = tilesOut(); if (o) r.layers.tiles = o; else delete r.layers.tiles; delete r.layers.utile; };
      const UT = () => PDM.userTiles ? PDM.userTiles() : [];
      const utDef = id => id ? UT().find(t => t.id === id) : null;
      const utImgs = new Map();   // 그림 경로 → 불러온 그림 (paint 가 씀, 없으면 불러온 뒤 다시 그림)
      if (ui.utile === undefined) ui.utile = ''; if (!ui.utShape) ui.utShape = 'pen';
      let tilesImg = null, rawTilesImg = null, paintImg = null, featImg = null;   // featImg = 게임 terrain_features.png (함정 그림)
      const theme = themeKey(themeOf(fl, kind));

      // ---- 선택 (⇱ 선택 도구): 영역 ui.area { x0, y0, x1, y1 } · 여러 오브젝트 ui.selIds [오브젝트 id] · ui.sel = 속성 창에 보일 대표(번호)
      //   선택은 화면 상태(ui)에만 둠 — 맵 데이터 · 실행 취소와 상관없음. 고치는 것은 모두 store.edit (실행 취소 그대로). 영역 연산 = PDM.mapArea
      const A = PDM.mapArea;
      if (!Array.isArray(ui.selIds)) ui.selIds = [];
      { const have = new Set((fl.objects || []).map(o => o.id)); ui.selIds = ui.selIds.filter(id => have.has(id)); }   // 지워진 오브젝트는 선택에서 뺌 (실행 취소 · 다른 편집 뒤)
      if (ui.area) ui.area = drawable ? A.rect(ui.area.x0, ui.area.y0, ui.area.x1, ui.area.y1, W, H) : null;   // 맵 크기가 바뀌었으면 맵 안으로
      const areaOn = () => drawable && !!ui.area && ui.tool === 'select';
      const selIndexes = () => { if (ui.selIds.length) { const st = new Set(ui.selIds); return (fl.objects || []).map((o, i) => st.has(o.id) ? i : -1).filter(i => i >= 0); } return ui.sel >= 0 && (fl.objects || [])[ui.sel] ? [ui.sel] : []; };
      const isSel = i => ui.selIds.length ? ui.selIds.includes(((fl.objects || [])[i] || {}).id) : i === ui.sel;
      const multi = () => ui.selIds.length > 1;
      function selectIds(ids) { ui.selIds = ids.slice(); const idx = selIndexes(); ui.sel = idx.length ? idx[0] : -1; }
      function clearSel() { ui.sel = -1; ui.selIds = []; ui.area = null; ui.port = -1; }

      // ---- 팔레트 ----
      const palette = h('div', { class: 'palette' });
      const tileTool = () => ui.tool !== 'object' && ui.tool !== 'select' && ui.tool !== 'spawn' && ui.tool !== 'erase' && ui.tool !== 'rand' && ui.tool !== 'utile';
      const ERASE = { all: '전부', wall: '벽', floor: '바닥·타일', utile: '지금 레이어', object: '오브젝트', spawn: '스폰 구역', rand: '무작위 칸' };
      if (!ui.eraseKind) ui.eraseKind = ui.target === 'layer' ? 'utile' : 'all'; if (ui.port === undefined) ui.port = -1;
      const onLayer = () => ui.target === 'layer' && !!tilesL;
      const lockedSet = () => new Set(Object.keys(ui.lockLayers).filter(k => ui.lockLayers[k]));
      /** 그리는 순서(캐릭터 아래 → 위) — 칸의 지형을 "가장 위 레이어의 타일"로 정할 때 · 그릴 때 (런타임 MakerUserTiles 와 같은 순서) */
      const drawOrder = () => { const l = LAYERS(); return [...l.filter(x => x.depth !== 'above'), ...l.filter(x => x.depth === 'above')].map(x => x.id); };
      /** 영역 연산 · 레이어 지형 다시 정하기에 넘길 것 */
      const layerOpts = () => ({ terrainOf: id => { const t = utDef(id); return t && t.terrain != null ? t.terrain : -1; }, order: drawOrder(), locked: lockedSet() });
      /** 도구 바꾸기 — 도구 막대 · 단축키 · 팔레트 공용. 편집 대상이 레이어면 펜 · 사각형 · 채우기 · 스포이드는 그 레이어의 사용자 타일로, 지우개는 그 레이어만 */
      function setTool(t, quiet) {
        if (['pen', 'rect', 'fill', 'pick'].includes(t) && onLayer()) { ui.tool = 'utile'; ui.utShape = t; }
        else if (t === 'erase') { ui.tool = 'erase'; if (onLayer()) ui.eraseKind = 'utile'; else if (ui.eraseKind === 'utile') ui.eraseKind = 'all'; }
        else ui.tool = t;
        if (!quiet) { drawTools(); drawPalette(); }
      }
      /** 편집 대상 바꾸기 (레이어 목록의 줄 · 타일 고르기) — 지금 도구는 같은 종류로 이어짐 */
      function setTarget(tg, layerId) {
        if (tg === 'layer' && tilesL) {
          ui.target = 'layer'; if (layerId) ui.tileLayer = layerId;
          if (!tilesL[ui.tileLayer]) tilesL[ui.tileLayer] = blankL();
          utileL = tilesL[ui.tileLayer];
          if (['pen', 'rect', 'fill', 'pick', 'room'].includes(ui.tool)) { ui.utShape = ui.tool === 'room' ? 'rect' : ui.tool; ui.tool = 'utile'; }
          if (ui.tool === 'erase') ui.eraseKind = 'utile';
        } else {
          ui.target = 'terrain';
          if (ui.tool === 'utile') ui.tool = ['rect', 'fill', 'pick'].includes(ui.utShape) ? ui.utShape : 'pen';
          if (ui.tool === 'erase' && ui.eraseKind === 'utile') ui.eraseKind = 'all';
        }
      }
      /** 도구 막대에서 켜진 도구 (레이어 편집 중의 펜 · 사각형 · 채우기 · 스포이드 = 사용자 타일 모양) */
      const toolOn = t => ui.tool === 'utile' ? ui.utShape === t || (t === 'pen' && !['rect', 'fill', 'pick'].includes(ui.utShape)) : ui.tool === t;
      /** 확장 기능이 꺼진 종류는 팔레트에서 숨김 (이 맵에 이미 놓은 것이 있으면 보임) */
      const typeOn = k => k === 'light' ? kind === 'node' && fl.mode !== 'procedural' : (k !== 'prop' && k !== 'combo') || (PDM.extensions && PDM.extensions.on(k === 'combo' ? 'tilecombos' : 'prop')) || (fl.objects || []).some(o => o.type === k);
      /** 오브젝트 종류의 대상 목록 [[id, 이름]] (팔레트 · 여러 오브젝트 일괄 수정 공용) */
      function refOpts(type) {
        const refKind = (PDM.OBJECT_TYPES[type] || {}).ref;
        const opts = refKind === 'character' ? store.all('char').filter(c => type === 'mob' ? ['mob', 'boss'].includes(c.kind) : !['mob', 'boss', 'hero'].includes(c.kind)).map(c => [c.id, c.name])
          : refKind === 'trap' ? PDM.TRAPS.map(t => [t.id, t.name]) : refKind === 'item' ? store.all('item').map(c => [c.id, c.name]) : refKind === 'event' ? store.all('event').map(c => [c.id, c.name]) : refKind === 'prop' ? store.all('prop').map(c => [c.id, c.name]) : refKind === 'effect' ? PDM.ui.refOptions('effect') : refKind === 'combo' ? PDM.ui.refOptions('combo') : [];
        if (refKind === 'character' && type === 'mob') opts.push(...['rat', 'gnoll', 'crab', 'slime', 'snake', 'albino'].map(m => ['spd:' + m, `(게임) ${m}`]));
        return opts;
      }
      // ---- 왼쪽 패널 (5차 재구성): 작업 묶음 — ① 그릴 것(타일 팔레트) ② 타일 레이어(편집 대상) ③ 지우개(지우개 도구일 때만) ④ 오브젝트 ⑤ 구역 · 입구/출구 ⑥ 고급
      //   묶음은 접을 수 있고 접힘 상태는 이 PC 에 기억(PAL_OPEN). 기능 · 단축키는 예전 그대로 — 위치와 묶음만 바뀜 (docs/EDITOR-MOBILE-TESTPLAY-DIALOGUE-AND-UI-STABILITY.md §3)
      function pgroup(id, title, sub, ...kids) {
        const open = PAL_OPEN[id] !== undefined ? PAL_OPEN[id] : !['adv'].includes(id);
        const body = h('div', { class: 'pg-body' }, ...kids.filter(Boolean));
        const el = h('section', { class: 'pg' + (open ? '' : ' closed'), 'data-pg': id },
          h('button', { class: 'pg-head', type: 'button', 'aria-expanded': String(open), onclick: () => { const o = el.classList.toggle('closed'); PAL_OPEN[id] = !o; savePalOpen(); el.firstChild.setAttribute('aria-expanded', String(!o)); } },
            h('span', { class: 'caret' }, '▾'), h('span', { class: 'pg-t' }, title), sub ? h('span', { class: 'pg-sub' }, sub) : null), body);
        return el;
      }
      /** 고른 타일을 "최근"에 (8개) */
      function pushRecent(k, id) { ui.recent = [{ k, id }, ...(ui.recent || []).filter(r => !(r.k === k && r.id === id))].slice(0, 8); }
      function pickTerrain(v) { ui.terrain = v; pushRecent('t', v); setTarget('terrain'); if (!tileTool() || ui.tool === 'pick') setTool('pen', true); drawPalette(); drawTools(); }
      function pickUtile(id) { ui.utile = id; if (id) pushRecent('u', id); setTarget('layer', ui.tileLayer); if (ui.tool !== 'utile') setTool(['rect', 'fill'].includes(ui.tool) ? ui.tool : 'pen', true); drawPalette(); drawTools(); }
      function drawPalette() {
        palette.innerHTML = '';
        if (drawable) {
          const lay = onLayer() ? LAYERS().find(l => l.id === ui.tileLayer) : null;
          const q = (ui.palQ || '').trim().toLowerCase(), hit = s => !q || String(s).toLowerCase().includes(q);
          // ① 그릴 것
          const tgrid = h('div', { class: 'pal-grid' });
          PDM.TERRAIN.filter(t => !t.legacy && hit(PDM.terrainName(t, up) + ' ' + t.key + ' ' + t.id)).forEach(t => {   // 지형 함정(17 · 18 · 19)은 예전 형식 — 함정은 오브젝트 "함정"으로
            const on = !onLayer() && ui.terrain === t.id && tileTool();
            const cv = h('canvas', { width: 16, height: 16, class: 'pal-t' + (on ? ' on' : ''), 'aria-pressed': String(on), title: `${PDM.terrainName(t, up)} (${t.key}, ${t.id}) — 지형에 그림`, onclick: () => pickTerrain(t.id) });
            const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
            PDM.assets.drawTerrain(g, tilesImg, t.id, 0, 0, 16, up);
            tgrid.append(cv);
          });
          const uts = UT().filter(t => hit((t.name || '') + ' ' + t.id)), ug = h('div', { class: 'pal-grid' });
          uts.forEach(t => {
            const on = ui.tool === 'utile' && ui.utile === t.id;
            const c = h('canvas', { width: 16, height: 16, class: 'pal-t' + (on ? ' on' : ''), 'aria-pressed': String(on), title: `${t.name || t.id} — ${t.terrain >= 0 ? '칠하면 지형: ' + ((PDM.TERRAIN_BY_ID[t.terrain] || {}).name || t.terrain) : '지형은 그대로 (그림만 덮음)'}${t.over ? ' · 캐릭터 위' : ''} · 지금 레이어에 칠함`,
              onclick: () => pickUtile(t.id) });
            PDM.drawUserTile(c.getContext('2d'), t, 0, 0, 16, tilesImg);
            ug.append(c);
          });
          const rec = (ui.recent || []).filter(r => r.k === 't' ? PDM.TERRAIN_BY_ID[r.id] : utDef(r.id)), rg = h('div', { class: 'pal-grid pal-recent' });
          rec.forEach(r => {
            const c = h('canvas', { width: 16, height: 16, class: 'pal-t', title: (r.k === 't' ? PDM.terrainName(PDM.TERRAIN_BY_ID[r.id], up) + ' (지형)' : ((utDef(r.id) || {}).name || r.id) + ' (사용자 타일)') + ' — 최근', onclick: () => r.k === 't' ? pickTerrain(r.id) : pickUtile(r.id) });
            const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
            if (r.k === 't') PDM.assets.drawTerrain(g, tilesImg, r.id, 0, 0, 16, up); else PDM.drawUserTile(g, utDef(r.id), 0, 0, 16, tilesImg);
            rg.append(c);
          });
          const search = h('input', { type: 'search', class: 'pal-search', placeholder: '타일 찾기 (이름 · 번호)', value: ui.palQ || '', 'aria-label': '타일 찾기',
            oninput: e => { ui.palQ = e.target.value; const pos = e.target.selectionStart; drawPalette(); const n = palette.querySelector('.pal-search'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } } });
          const what = onLayer() ? (ui.utile ? `▦ ${(utDef(ui.utile) || {}).name || ui.utile}` : '▦ 지우개 (사용자 타일)') : (ui.terrain === -1 ? '빈 칸' : PDM.terrainName(PDM.TERRAIN_BY_ID[ui.terrain], up));
          palette.append(pgroup('tiles', '그릴 것', what,
            h('div', { class: 'pal-target' + (onLayer() ? ' layer' : '') }, onLayer() ? `칠할 곳: ▦ 레이어 「${lay ? lay.name : ui.tileLayer}」` : '칠할 곳: ⛰ 지형 (게임 판정)'),
            search,
            rec.length && !q ? h('div', { class: 'fl' }, '최근') : null, rec.length && !q ? rg : null,
            h('div', { class: 'fl' }, '지형 타일'), tgrid,
            h('div', { class: 'pal-row' },
              h('button', { class: 'btn xs' + (!onLayer() && ui.terrain === -1 && tileTool() ? ' on' : ''), title: '아무것도 그리지 않은 칸 — 맵에 들어가지 않습니다 (게임에서는 막힌 벽)', onclick: () => pickTerrain(-1) }, '▢ 빈 칸'),
              h('button', { class: 'btn xs' + (!onLayer() && ui.terrain === 0 && tileTool() ? ' on' : ''), title: '바닥이 없는 칸 — 떨어지면 아래층으로', onclick: () => pickTerrain(0) }, '▼ 낭떠러지')),
            h('div', { class: 'fl' }, `사용자 타일 (${UT().length})`),
            uts.length ? ug : h('div', { class: 'hint' }, UT().length ? '찾는 타일이 없습니다.' : '"맵 그림"에서 아무 그림의 한 칸을 타일로 만들어 두면 여기서 골라 칠할 수 있습니다.'),
            h('div', { class: 'pal-row' },
              h('button', { class: 'btn xs' + (ui.tool === 'utile' && !ui.utile ? ' on' : ''), title: '지금 레이어에 칠한 사용자 타일만 지움 (지형은 아래 레이어에 맞춤)', onclick: () => pickUtile('') }, '사용자 타일 지우개'),
              h('button', { class: 'btn xs', onclick: () => PDM.tabs.open('mapart') }, UT().length ? '관리…' : '＋ 만들기…'))));
          // ② 타일 레이어 — 고른 줄 = 편집 대상 (펜 · 사각형 · 채우기 · 스포이드 · 지우개 · 영역 복사/붙여넣기/지우기가 그 레이어만)
          const lays = LAYERS(), cnt = id => ((tilesL || {})[id] || []).filter(Boolean).length;
          const row = (isOn, attrs, ...kids) => h('div', Object.assign({ class: 'lay-row' + (isOn ? ' on' : ''), role: 'button', tabindex: '0', 'aria-pressed': String(isOn) }, attrs), ...kids);
          palette.append(pgroup('layers', '타일 레이어', onLayer() ? `편집: ${lay ? lay.name : ui.tileLayer}` : '편집: 지형',
            h('div', { class: 'layer-list' },
              ...lays.slice().reverse().map(l => {
                const isOn = onLayer() && ui.tileLayer === l.id, locked = !!ui.lockLayers[l.id];
                return row(isOn, { title: `${l.depth === 'above' ? '캐릭터 위에 그림' : '캐릭터 아래에 그림'}${l.solid ? ' · 칠한 칸은 못 지나감' : ''}${l.visible === false ? ' · 게임에서 숨김' : ''} — 누르면 이 레이어를 편집`, 'data-layer': l.id,
                  onclick: e => { if (e.target.closest('button')) return; setTarget('layer', l.id); drawPalette(); drawTools(); paint(); },
                  onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } } },
                  h('button', { class: 'ib', title: ui.hideLayers[l.id] ? '편집기에서 보이기 (게임과 상관없음)' : '편집기에서 숨기기 (게임과 상관없음)', 'aria-label': (ui.hideLayers[l.id] ? '보이기: ' : '숨기기: ') + l.name, onclick: () => { ui.hideLayers[l.id] = !ui.hideLayers[l.id]; drawPalette(); paint(); } }, ui.hideLayers[l.id] ? '◌' : '👁'),
                  h('button', { class: 'ib' + (locked ? ' lk' : ''), title: locked ? '잠금 풀기' : '잠그기 — 지우개 "전부" · 영역 지우기/붙여넣기 · 칠하기에서 이 레이어를 건드리지 않음 (편집기에서만)', 'aria-label': (locked ? '잠금 풀기: ' : '잠그기: ') + l.name, onclick: () => { ui.lockLayers[l.id] = !locked; drawPalette(); } }, locked ? '🔒' : '🔓'),
                  h('span', { class: 'lay-name', style: { opacity: l.visible === false ? .55 : 1 } }, l.name),
                  l.depth === 'above' ? h('span', { class: 'badge', title: '캐릭터 위' }, '위') : null,
                  l.solid ? h('span', { class: 'badge bad', title: '칠한 칸은 못 지나감' }, '막힘') : null,
                  h('span', { class: 'lay-n' }, String(cnt(l.id) || '')));
              }),
              row(!onLayer(), { title: '지형 — 바닥 · 벽 · 문 · 계단 (게임 판정 · 맨 아래). 고르면 펜 · 사각형 · 방 · 채우기가 지형을 그리고, 영역 도구는 모든 레이어를 함께 다룸', 'data-layer': '',
                onclick: () => { setTarget('terrain'); drawPalette(); drawTools(); paint(); }, onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } } },
                h('span', { class: 'ib', 'aria-hidden': 'true' }, '⛰'), h('span', { class: 'lay-name' }, '지형 · 전체'), h('span', { class: 'lay-n' }, ''))),
            h('label', { class: 'check m-0 mt-2', title: '편집하는 레이어만 또렷하게 (편집기 화면만 — 게임과 상관없음)' }, h('input', { type: 'checkbox', checked: !!ui.dimOthers, onchange: e => { ui.dimOthers = e.target.checked; paint(); } }), h('span', {}, '다른 레이어 흐리게')),
            h('div', { class: 'pal-row' }, h('button', { class: 'btn xs', onclick: layerSettings }, '레이어 설정… (추가 · 삭제 · 순서 · 높이)'))));
          // ③ 지우개 (지우개 도구일 때만 — 무엇을 지울지)
          if (ui.tool === 'erase') {
            const kinds = Object.entries(ERASE).filter(([k]) => (k !== 'spawn' || canSpawn) && (k !== 'rand' || canRand));
            palette.append(pgroup('erase', '지우개', ERASE[ui.eraseKind],
              h('div', { class: 'pal-row' }, ...kinds.map(([k, t]) => h('button', { class: 'btn xs' + (ui.eraseKind === k ? ' on' : ''), title: k === 'all' ? '지형 · 잠기지 않은 모든 레이어 · 오브젝트 · 스폰 구역을 모두 지웁니다' : k === 'utile' ? `지금 레이어「${lay ? lay.name : ui.tileLayer}」의 사용자 타일만` : t + '만 지웁니다', onclick: () => { ui.eraseKind = k; if (k === 'utile') setTarget('layer', ui.tileLayer); drawPalette(); drawTools(); } }, k === 'utile' ? '지금 레이어' : t))),
              h('div', { class: 'hint' }, ui.eraseKind === 'all' ? '⚠ 전부: 아래 레이어의 타일도 함께 지워집니다 (잠근 레이어는 그대로).' : ui.eraseKind === 'utile' ? '고른 레이어만 지웁니다 — 아래 레이어는 그대로.' : '')));
          }
        }
        // ④ 오브젝트
        const types = Object.entries(PDM.OBJECT_TYPES).filter(([k, v]) => ((k !== 'start' && !v.nodeOnly) || (kind === 'node' && (k === 'start' || fl.mode === 'handmade'))) && typeOn(k));
        if (!typeOn(ui.objType)) ui.objType = 'npc';
        const refKind = PDM.OBJECT_TYPES[ui.objType].ref;
        const opts = refOpts(ui.objType);
        const refSel = h('select', { 'aria-label': '놓을 대상', onchange: () => { ui.objRef = refSel.value; setTool('object'); } }, opts.map(([v, t]) => h('option', { value: v }, t)));
        if (!ui.objRef && opts[0]) ui.objRef = opts[0][0];
        refSel.value = ui.objRef;
        const quick = h('div', { class: 'pal-grid mt-3' });
        if (ui.objType === 'prop') store.all('prop').forEach(pr => {
          const c = h('canvas', { width: 16, height: 16, class: 'pal-t' + (ui.tool === 'object' && ui.objRef === pr.id ? ' on' : ''), title: pr.name + ' — 누른 뒤 맵을 클릭해 놓기', onclick: () => { ui.objRef = pr.id; setTool('object'); } });
          if (pr.sprite && pr.sprite.sheet) PDM.assets.load(pr.sprite.sheet).then(img => { if (!img) return; const fw = pr.sprite.frame[0] || 16, fh = pr.sprite.frame[1] || 16, stt = (pr.states || [])[pr.start || 0] || {}, k = Math.min(1, 16 / fw, 16 / fh); const g = c.getContext('2d'); g.imageSmoothingEnabled = false; PDM.assets.drawFrame(g, img, fw, fh, (((pr.sprite.anims || {})[stt.anim] || {}).frames || stt.frames || [])[0] ?? (stt.frame || 0), (16 - fw * k) / 2, 16 - fh * k, k); });
          quick.append(c);
        });
        if (ui.objType === 'trap') PDM.TRAPS.forEach(tp => {
          const c = h('canvas', { width: 16, height: 16, class: 'pal-t' + (ui.tool === 'object' && ui.objRef === tp.id ? ' on' : ''), title: tp.name + ' — 누른 뒤 맵을 클릭해 놓기', onclick: () => { ui.objRef = tp.id; setTool('object'); } });
          drawTrap(c.getContext('2d'), tp.id, false, 0, 0, 16); quick.append(c);
        });
        if (ui.objType === 'combo' && PDM.combos) PDM.combos.list().forEach(cb => {
          const c = h('canvas', { width: 16, height: 16, class: 'pal-t' + (ui.tool === 'object' && ui.objRef === cb.id ? ' on' : ''), title: (cb.name || cb.id) + ' — 누른 뒤 맵을 클릭해 놓기', onclick: () => { ui.objRef = cb.id; setTool('object'); } });
          const g = c.getContext('2d'); g.imageSmoothingEnabled = false; PDM.combos.drawCombo(g, cb, 0, 0, 16, rawTilesImg); quick.append(c);
        });
        palette.append(pgroup('objects', '오브젝트', ui.tool === 'object' ? PDM.OBJECT_TYPES[ui.objType].name : '',
          h('div', { class: 'pal-row obj-types' }, ...types.map(([k, v]) => h('button', { class: 'btn xs' + (ui.tool === 'object' && ui.objType === k ? ' on' : ''), style: { borderLeftColor: v.color }, title: v.desc || v.name,
            onclick: () => { if (ui.objType !== k) ui.objRef = ''; ui.objType = k; setTool('object'); } }, v.name))),
          refKind ? refSel : null, quick.children.length ? quick : null,
          ui.objType === 'combo' ? h('div', { class: 'hint my-2' }, '조합 타일: 여러 스프라이트 + 광원 · 오브젝트 묶음을 한 칸에 놓습니다. ', h('button', { class: 'btn xs', onclick: () => PDM.tabs.open('tilecombos') }, '조합 타일 열기')) : null,
          ui.objType === 'trap' ? h('div', { class: 'hint my-2' }, '함정은 지형이 아니라 오브젝트입니다 — 바닥 타일 위에 따로 놓이고, 게임의 함정 규칙을 그대로 따릅니다. 숨김 · 작동함은 오른쪽에서.') : null,
          !opts.length && refKind ? h('div', { class: 'hint c-gold' }, '아직 만든 것이 없습니다.') : null,
          ui.objType === 'prop' ? h('button', { class: 'btn xs mt-3', title: '새 맵 오브젝트(상자·레버·문·장식 등)를 만듭니다', onclick: () => PDM.propUtil && PDM.propUtil.newProp() }, '＋ 새 맵 오브젝트 만들기') : null,
          drawable ? null : h('div', { class: 'hint mt-3' }, '자동 생성 층은 타일을 그리지 않습니다. 오브젝트는 "배치 규칙"으로 놓입니다.')));
        // ⑤ 구역 · 입구/출구
        const zone = [];
        if (drawable && kind === 'node') zone.push(h('div', { class: 'fl' }, '입구 · 출구'),
          h('div', { class: 'pal-row' },
            h('button', { class: 'btn xs' + (!onLayer() && ui.terrain === 7 && tileTool() ? ' on' : ''), onclick: () => pickTerrain(7) }, `＋ 입구 (${terrain.filter(v => v === 7).length})`),
            h('button', { class: 'btn xs' + (!onLayer() && ui.terrain === 8 && tileTool() ? ' on' : ''), onclick: () => pickTerrain(8) }, `＋ 출구 (${terrain.filter(v => v === 8).length})`)),
          h('div', { class: 'hint' }, '「⇱ 선택」으로 계단을 누르면 오른쪽에서 위치 · 삭제 · 이어질 맵을 정하고 끌어서 옮길 수 있습니다.'));
        if (drawable && kind === 'room') zone.push(h('div', { class: 'hint c-gold' }, '테두리에 문 타일을 그리면 그 자리에만 문이 생깁니다 (연결 안 된 자리는 벽).'));
        if (canSpawn) zone.push(h('div', { class: 'fl' }, '몬스터 스폰 구역'),
          h('div', { class: 'pal-row' }, ...[1, 2, 0].map(v => [v, SPAWN_VALS[v]]).map(([v, [t, c]]) => h('button', { class: 'btn xs' + (ui.tool === 'spawn' && ui.spawnVal === +v ? ' on' : ''), style: { borderLeftColor: c }, onclick: () => { ui.spawnVal = +v; ui.showSpawn = true; setTool('spawn'); paint(); } }, t))),
          ui.tool === 'spawn' ? h('div', { class: 'pal-row' }, ...[['pen', '✎ 칠하기'], ['rect', '▭ 사각형'], ['fill', '▧ 방 채우기']].map(([k, t]) => h('button', { class: 'btn xs' + (ui.spawnShape === k ? ' on' : ''), onclick: () => { ui.spawnShape = k; ui.showSpawn = true; setTool('spawn'); paint(); } }, t))) : null,
          h('div', { class: 'hint' }, (fl.spawn || {}).enabled ? '초록 = 이 안에서만 몬스터가 생김 · 빨강 = 절대 안 생김. 초록이 없으면 빨강을 뺀 아무 곳.' : '속성의 "몬스터 스폰"을 켜야 게임에서 적용됩니다.'));
        if (canRand) {
          const sets = fl.randSets || [];
          zone.push(h('div', { class: 'fl' }, '🎲 무작위 칸 (방이 들어갈 때마다 달라짐)'),
            h('div', { class: 'pal-row' },
              ...sets.map((st, i) => h('button', { class: 'btn xs' + (ui.tool === 'rand' && ui.randVal === i + 1 ? ' on' : ''), style: { borderLeftColor: randColor(i + 1) }, title: (st.opts || []).map(o => (o.t === -2 ? '그대로' : (PDM.TERRAIN_BY_ID[o.t] || {}).name || o.t) + ' ' + (o.w ?? 1)).join(' · ') + ' — 오른쪽 클릭: 이름 바꾸기 · 복제 · 삭제', onclick: () => { ui.randVal = i + 1; ui.showRand = true; setTool('rand'); paint(); },
                oncontextmenu: e => { e.preventDefault(); PDM.ui.menu(e.clientX, e.clientY, randSetMenu(i)); } }, `${i + 1}. ${st.name || '묶음'}`)),
              sets.length ? h('button', { class: 'btn xs' + (ui.tool === 'rand' && ui.randVal === 0 ? ' on' : ''), onclick: () => { ui.randVal = 0; ui.showRand = true; setTool('rand'); paint(); } }, '지우개') : null,
              h('button', { class: 'btn xs add', title: '새 무작위 칸 묶음 — 오른쪽 속성의 "변형"에서 선택지를 정합니다', onclick: () => addRandSet() }, '+ 묶음')),
            ui.tool === 'rand' && ui.randVal > 0 && sets[ui.randVal - 1] ? h('div', { class: 'pal-row' },
              h('button', { class: 'btn xs', onclick: () => renameRandSet(ui.randVal - 1) }, '이름 바꾸기'),
              h('button', { class: 'btn xs', onclick: () => dupRandSet(ui.randVal - 1) }, '복제'),
              h('button', { class: 'btn xs', onclick: () => clearRandCells(ui.randVal - 1) }, '칠한 칸 지우기'),
              h('button', { class: 'btn xs danger', onclick: () => removeRandSet(ui.randVal - 1) }, '삭제')) : null,
            sets.length && ui.tool === 'rand' ? h('div', { class: 'pal-row' }, ...[['pen', '✎ 칠하기'], ['rect', '▭ 사각형']].map(([k, t]) => h('button', { class: 'btn xs' + (ui.randShape === k ? ' on' : ''), onclick: () => { ui.randShape = k; ui.showRand = true; setTool('rand'); paint(); } }, t))) : null,
            h('div', { class: 'hint' }, sets.length ? '칠한 칸은 게임에서 그 묶음의 선택지 중 하나가 됩니다. 오른쪽 "변형"에서 선택지 · 무게를 정하고 「🎲 변형 미리보기」로 확인하세요.' : '"+ 묶음"을 눌러 무작위 칸 묶음을 만든 뒤 칸에 칠하세요.'));
        }
        if (zone.length) palette.append(pgroup('zones', '구역 · 입구/출구', '', ...zone));
        // ⑥ 고급 (기본 접힘) — 자주 쓰지 않는 것 · 되돌리기 어려운 것은 맨 아래 따로
        if (drawable) palette.append(pgroup('adv', '고급', '',
          h('div', { class: 'fl' }, '타일 그림 (' + themeName(themeOf(fl, kind)) + ')'),
          h('div', { class: 'pal-row' },
            h('button', { class: 'btn xs', title: '지금 고른 타일 한 칸(16×16)의 그림을 고칩니다', onclick: editOneTile }, '✎ 고른 타일'),
            h('button', { class: 'btn xs', title: '타일셋 전체(256×256)를 고칩니다', onclick: editTileset }, '▦ 타일셋 전체'),
            h('button', { class: 'btn xs', title: 'PNG 파일을 타일셋으로 불러옵니다 (256×256, 16칸 격자)', onclick: importTileset }, '⤓ PNG 불러오기')),
          h('div', { class: 'fl' }, '맵 크기'),
          h('div', { class: 'hint' }, '네 모서리의 ◢ 손잡이를 끌어서 조절 · 점선 바깥에 그리면 그 칸까지 넓어집니다'),
          h('div', { class: 'pal-row' }, h('button', { class: 'btn xs', title: '타일을 그린 영역만 남기고 둘레의 빈 칸을 잘라냅니다 (둘레 한 칸은 남김)', onclick: trimToDrawn }, '✂ 그린 영역에 맞춰 자르기'),
            h('button', { class: 'btn xs', onclick: layerSettings }, '레이어 설정…')),
          h('div', { class: 'pal-danger' }, h('button', { class: 'btn xs danger', onclick: clearAll }, '🗑 맵 전체 지우기…'))));
        palette.append(h('div', { class: 'hint mt-5' }, drawable ? '왼쪽 클릭 그리기 · 오른쪽 클릭 스포이드 · ⇱ 선택: 끌기 = 영역 (Alt+끌기 = 어디서든) · Ctrl+C/X/V · Delete · Ctrl+A · Shift/Ctrl+클릭 = 여러 개 · 방향키 = 한 칸씩' : ''));
      }

      // ---- 도구 막대 ----
      const tools = h('div', { class: 'map-tools' });
      /** 상태 줄: 지금 도구 · 칠하는 레이어 · 확대 · 맵 크기 · 선택 (PDM.status — 탭을 바꾸면 비워지고 이 탭으로 오면 다시) */
      const TOOL_NAMES = { pen: '펜', rect: '사각형', room: '방', fill: '채우기', pick: '스포이드', erase: '지우개', select: '선택', object: '오브젝트 놓기', rand: '무작위 칸', spawn: '스폰 구역', utile: '사용자 타일' };
      function updCtx() {
        if (PDM.tabs.active !== key || !PDM.status) return;
        const L = onLayer() ? ((PDM.tileLayers().find(l => l.id === ui.tileLayer) || {}).name || ui.tileLayer) : '';
        const sel = selIndexes().length, a = areaOn() ? ui.area : null;
        PDM.status.ctx([ui.pasteClip ? '붙여넣기 중 — 누른 칸이 왼쪽 위 · Esc 끝' : `도구: ${TOOL_NAMES[ui.tool] || ui.tool}${ui.tool === 'erase' ? ' (' + (ERASE[ui.eraseKind] || '') + ')' : ''}`,
          L ? `레이어: ${L}` : '', `×${+ui.zoom.toFixed(2)}`, drawable ? `${W}×${H}칸` : '자동 생성 층',
          a ? `영역 ${a.x1 - a.x0 + 1}×${a.y1 - a.y0 + 1}` : '', sel > 1 || (sel && a) ? `오브젝트 ${sel}개 선택` : sel ? `오브젝트 #${ui.sel} 선택` : ''].filter(Boolean).join('  ·  '));
      }
      function drawTools() {
        updCtx();
        tools.innerHTML = '';
        const K = PDM.keys, kl = id => { const k = K.label('draw.' + id); return k ? ` (${k})` : ''; };
        const T = (id, label, tip, o = {}) => { const on = toolOn(id); return h('button', { class: 'tool' + (on ? ' on' : ''), 'aria-pressed': String(on), title: tip || '', disabled: !!o.disabled, onclick: () => setTool(id) }, label); };
        const grp = (label, ...kids) => h('div', { class: 'tool-grp', role: 'group', 'aria-label': label }, ...kids.filter(Boolean));
        // 묶음: 그리기 | 선택 · 놓기 | 구역 · 모드 | 보기 (5차 — 그리기 도구는 편집 대상(지형 / 고른 레이어)에 그림)
        const tgt = onLayer() ? `고른 레이어「${(LAYERS().find(l => l.id === ui.tileLayer) || {}).name || ui.tileLayer}」` : '지형';
        if (drawable) tools.append(grp('그리기', T('pen', '✎ 펜', `${tgt}에 그리기${kl('pen')}`), T('rect', '▭ 사각형', `${tgt}에 끌어서 채운 사각형`), T('room', '▣ 방', onLayer() ? '방은 지형 전용 — 레이어 목록에서 「지형 · 전체」를 고르세요' : '끌어서 벽 두른 방', { disabled: onLayer() }),
          T('fill', '▧ 채우기', `${tgt} 채우기${kl('fill')}`), T('pick', '⊙ 스포이드', `${tgt}에서 고르기${kl('pick')}`), T('erase', '⌫ 지우개', `끌어서 지우기${kl('erase')} — 무엇을 지울지는 왼쪽 「지우개」`)));
        tools.append(grp('선택 · 놓기', T('select', '⇱ 선택', `오브젝트 · 계단 선택/이동, 빈 곳에서 끌기 = 영역 (복사 · 잘라내기 · 붙여넣기 — ${onLayer() ? '고른 레이어만' : '지형 + 모든 레이어'}), Shift/Ctrl+클릭 = 여러 개${kl('select')}`), T('object', '✚ 오브젝트', '오브젝트 놓기 — 종류는 왼쪽 「오브젝트」')));
        tools.append(grp('구역 · 모드', canRand && (fl.randSets || []).length ? T('rand', '🎲 무작위 칸', '방이 들어갈 때마다 달라지는 칸 칠하기 (왼쪽에서 묶음 고르기)') : null,
          canSpawn ? T('spawn', '☗ 스폰 구역', '몬스터가 생기는 구역 / 안 생기는 구역 칠하기') : null,
          kind === 'node' && fl.mode === 'handmade' ? h('button', { class: 'tool', title: '맵 전체를 한 장의 그림으로 직접 그립니다 (게임에서는 타일 그림 대신 이 그림이 보임)', onclick: () => { ui.paintMode = true; PDM.tabs.refresh(key); } }, '🖌 세부 그리기') : null));
        tools.append(h('span', { class: 'tb-sep' }),
          h('button', { class: 'tool', title: '축소 (Ctrl+휠)', onclick: () => zoomStep(-1) }, '−'),
          h('span', { class: 'hint tb-num' }, `×${+ui.zoom.toFixed(2)}`),   // 폭 고정 — 숫자 길이가 바뀌어도 옆 버튼이 밀리지 않게
          h('button', { class: 'tool', title: '확대 (Ctrl+휠)', onclick: () => zoomStep(1) }, '+'),
          h('button', { class: 'tool', title: '화면에 맞춤 (Enter)', onclick: () => zoomFit() }, '⛶ 맞춤'),
          drawable ? h('span', { class: 'hint tb-num', title: '펜·지우개 브러쉬 크기 — [ 작게 · ] 크게' }, `브러쉬 ${ui.brush || 1}`) : '',
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
        rawTilesImg = await PDM.assets.themeTiles(theme, true).catch(() => tilesImg);   // 조합 타일의 타일셋 스프라이트 (밑그림 없이)
        featImg = await PDM.assets.load('game:environment/terrain_features.png').catch(() => null);
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
      /** 함정 그림: 게임 terrain_features.png 의 (작동 중 ? 색 : 검정) + 모양 × 16 칸 (게임 TerrainFeaturesTilemap 과 같음) */
      function drawTrap(g, id, inactive, x, y, s) {
        const t = PDM.TRAP_BY_ID[id];
        if (!t || !featImg) { g.fillStyle = '#d0507a'; g.beginPath(); g.moveTo(x + s / 2, y + s * .15); g.lineTo(x + s * .85, y + s / 2); g.lineTo(x + s / 2, y + s * .85); g.lineTo(x + s * .15, y + s / 2); g.fill(); return; }
        const n = (inactive ? 8 : t.color) + t.shape * 16;
        g.imageSmoothingEnabled = false; g.drawImage(featImg, (n % 16) * 16, Math.floor(n / 16) * 16, 16, 16, x, y, s, s);
      }
      /** 레이어 설정 (world.tileLayers — 모든 맵 공통): 이름 · 그리는 높이 · 게임 표시 · 막힘 · 순서 · 추가 · 삭제 */
      async function layerSettings() {
        let L = PDM.clone(PDM.tileLayers());
        const box = h('div', { style: { minWidth: '560px' } });
        const used = id => [...store.keys().filter(k => k.startsWith('node:') || k.startsWith('room:'))].filter(k => { const t = ((store.get(k) || {}).layers || {}).tiles || {}; return (t[id] || []).some(Boolean); }).length;
        const draw = () => {
          box.innerHTML = '';
          box.append(h('p', { class: 'hint' }, '모든 맵에 같은 레이어 목록을 씁니다. 위에 있을수록 먼저(아래에) 그립니다. "캐릭터 위" 레이어는 캐릭터 · 아이템을 가립니다. "막힘" 레이어에 타일을 칠한 칸은 게임에서 지나갈 수 없습니다 (그림은 그대로).'),
            ...L.map((l, i) => h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', margin: '4px 0' } },
              h('button', { class: 'ib', disabled: i === 0, onclick: () => { [L[i - 1], L[i]] = [L[i], L[i - 1]]; draw(); } }, '▲'),
              h('button', { class: 'ib', disabled: i === L.length - 1, onclick: () => { [L[i + 1], L[i]] = [L[i], L[i + 1]]; draw(); } }, '▼'),
              (() => { const n = h('input', { type: 'text', value: l.name, style: { width: '150px' } }); n.oninput = () => { l.name = n.value; }; return n; })(),
              h('span', { class: 'hint mono grow' }, l.id),
              (() => { const d = h('select', { style: { width: '110px' } }, h('option', { value: 'below' }, '캐릭터 아래'), h('option', { value: 'above' }, '캐릭터 위')); d.value = l.depth || 'below'; d.onchange = () => { l.depth = d.value; }; return d; })(),
              h('label', { class: 'check', style: { whiteSpace: 'nowrap' } }, (() => { const c = h('input', { type: 'checkbox', checked: l.visible !== false }); c.onchange = () => { l.visible = c.checked; }; return c; })(), '게임에 보임'),
              h('label', { class: 'check', style: { whiteSpace: 'nowrap' } }, (() => { const c = h('input', { type: 'checkbox', checked: !!l.solid }); c.onchange = () => { l.solid = c.checked; }; return c; })(), '막힘'),
              h('button', { class: 'ib danger', title: '레이어 삭제 (칠한 타일은 맵 데이터에 남지만 게임에 그려지지 않음)', onclick: async () => { const n = used(l.id); if (n && !(await PDM.ui.confirm(`「${l.name}」 레이어를 ${n}개 맵에서 쓰고 있습니다. 목록에서 지울까요? (칠한 타일은 남지만 그려지지 않습니다)`))) return; L.splice(i, 1); draw(); } }, '✕'))),
            h('div', { class: 'flex gap-2 mt-3' },
              h('button', { class: 'btn sm', onclick: async () => { const n = await PDM.ui.prompt('새 레이어 이름', '', '예: 그림자 · 길 · 지붕'); if (!n) return; let id = PDM.slugId(n) || 'layer'; while (L.some(x => x.id === id)) id += '_2'; L.push({ id, name: n, depth: 'below', visible: true, solid: false }); draw(); } }, '＋ 레이어 추가'),
              h('button', { class: 'btn sm', onclick: () => { L = PDM.clone(PDM.tileLayersDefault()); draw(); } }, '기본 레이어로')));
        };
        draw();
        const ok = await PDM.ui.modal('타일 레이어 설정', box, [['취소', null], ['적용', () => true, 'pri']]);
        if (!ok) return;
        store.edit('world', '타일 레이어 설정', w => { w.tileLayers = L; });
        if (!L.some(l => l.id === ui.tileLayer)) ui.tileLayer = (L[0] || { id: 'base' }).id;
        PDM.tabs.refresh(key);
      }
      /** 타일 레이어 하나 그리기 (그림이 아직 없으면 불러온 뒤 다시 그림). 게임에서 숨긴 레이어는 흐리게 · 편집기에서 숨긴 레이어는 안 그림 */
      function drawLayer(g, l, s) {
        const arr = tilesL && tilesL[l.id]; if (!arr || ui.hideLayers[l.id]) return;
        g.save(); if (l.visible === false) g.globalAlpha = .35;
        if (ui.dimOthers && onLayer() && l.id !== ui.tileLayer) g.globalAlpha *= .3;   // 다른 레이어 흐리게 (편집기만)
        for (let i = 0; i < W * H; i++) {
          const t = utDef(arr[i]); if (!t) continue;
          if (!t.image) { if (t.fx || t.gameFx) PDM.drawUserTile(g, t, (i % W) * s, Math.floor(i / W) * s, s, tilesImg).catch(() => { }); continue; }   // 그림 없는 효과 타일: 지형 위에 ✦ (지형은 이미 그림)
          const img = utImgs.get(t.image);
          if (img === undefined) { utImgs.set(t.image, null); PDM.assets.load(t.image).then(im => { utImgs.set(t.image, im || false); if (im) paint(); }); continue; }
          if (!img) continue;
          if (t.flow) { const cx = i % W, cy = Math.floor(i / W), sx = (cx * 16) % img.width, sy = (cy * 16) % img.height; g.drawImage(img, sx, sy, Math.min(16, img.width - sx), Math.min(16, img.height - sy), cx * s, cy * s, s, s); }   // 흐르는 그림: 게임처럼 이어 붙임 (멈춘 모습)
          else { const z = Math.max(1, t.size || 16); g.drawImage(img, (t.x || 0) * z, (t.y || 0) * z, z, z, (i % W) * s, Math.floor(i / W) * s, s, s); }
          if (t.fx || t.gameFx) { g.font = `bold ${Math.max(7, s * .45)}px sans-serif`; g.textAlign = 'right'; g.textBaseline = 'top'; g.fillStyle = '#ffe27a'; g.fillText('✦', (i % W) * s + s - 1, Math.floor(i / W) * s); }
          if (l.solid && l.id === ui.tileLayer && ui.tool === 'utile') { g.strokeStyle = 'rgba(255,90,90,.75)'; g.lineWidth = 1; g.strokeRect((i % W) * s + 1.5, Math.floor(i / W) * s + 1.5, s - 3, s - 3); }   // 막는 레이어: 칠한 칸 빨간 테두리
        }
        g.restore();
      }
      let dragRect = null, areaMoved = false;
      /** 붙여넣기 미리보기: 마우스 칸을 왼쪽 위로 — 지형(빈 칸은 투명) · 오브젝트 자리 · 테두리 (맵 밖 칸은 그리지 않음 = 붙지 않음) */
      function drawPasteGhost(g, s) {
        const c = ui.pasteClip, px = ui.hover.x, py = ui.hover.y;
        g.save(); g.globalAlpha = .6;
        for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) { const v = c.terrain[y * c.w + x]; if (v >= 0 && inB(px + x, py + y)) PDM.assets.drawTerrain(g, tilesImg, v, (px + x) * s, (py + y) * s, s, up); }
        const lc = c.layer ? c.tiles[c.layer] : onLayer() && !c.objectsOnly ? (c.tiles || {})[ui.tileLayer] : null;   // 레이어 붙여넣기: 칠한 칸 자리
        if (lc) { g.fillStyle = PDM.alpha(PDM.cssVar('--map-sel', '#4fd8c6'), .35); for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (lc[y * c.w + x] && inB(px + x, py + y)) g.fillRect((px + x) * s, (py + y) * s, s, s); }
        g.globalAlpha = 1;
        (c.objects || []).forEach(o => { const ox = px + ((o.at || {}).x | 0), oy = py + ((o.at || {}).y | 0); if (!inB(ox, oy)) return; g.fillStyle = ((PDM.OBJECT_TYPES[o.type] || {}).color || '#ffffff') + 'cc'; g.fillRect(ox * s + s * .2, oy * s + s * .2, s * .6, s * .6); });
        g.setLineDash([4, 3]); g.strokeStyle = '#ffe28a'; g.lineWidth = 2; g.strokeRect(px * s, py * s, c.w * s, c.h * s); g.setLineDash([]);
        g.restore();
      }
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
          // 타일 레이어 — 캐릭터 아래(below) 레이어를 순서대로 (위(above) 레이어는 오브젝트 다음에)
          if (tilesL && ui.showUtile !== false) LAYERS().filter(l => l.depth !== 'above').forEach(l => drawLayer(g, l, s));
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
        const grpL = kind === 'node' ? (groupOfNode(fl) || {}) : {};
        const tLights = (fl.terrainLights || []).length ? fl.terrainLights : (grpL.terrainLights || []);
        const aLights = (fl.autoLights || []).length ? fl.autoLights : (grpL.autoLights || []);
        if (drawable && tLights.length) tLights.forEach(tl => {
          const o2 = Object.assign({ color: '#9a7cff', k: 1.5, z: 10, range: 2 }, tl);
          for (let i = 0; i < W * H; i++) if (terrain[i] === +tl.terrain) PDM.drawLightPreview(g, (i % W) * s + s / 2, Math.floor(i / W) * s + s / 2, o2, s);
        });
        // 광원 미리보기의 그림자: 빛을 가리는 칸 (벽 = 1 · 막힌 맵 오브젝트 = 2, 맵 밖 = 3 — 가장자리 벽의 바깥 변도 그림자를 만듦, 게임과 같음)
        let lightBlock = null;
        if (drawable && ((fl.objects || []).some(o => o.type === 'light') || aLights.length)) {
          const pc = new Set();
          (fl.objects || []).forEach(o => { if (o.type !== 'prop' || !o.at || o.at.x == null) return; const sp = sprites['prop:' + o.ref], pr = sp && sp.prop; if (!pr || pr.castShadow === false) return;
            const st = (pr.states || [])[pr.start || 0]; if (st && st.solid === false) return;
            const ft = pr.foot || [1, 1]; for (let j = 0; j < Math.max(1, ft[1] | 0); j++) for (let k = 0; k < Math.max(1, ft[0] | 0); k++) pc.add((o.at.y - j) * W + o.at.x + k); });
          lightBlock = (x, y) => x < 0 || y < 0 || x >= W || y >= H ? 3 : PDM.terrainBlocksLight(terrain[y * W + x]) ? 1 : pc.has(y * W + x) ? 2 : 0;
        }
        // 자동 광원 미리보기: 게임과 같은 규칙(확률 · 최대 개수 · 최소 간격)으로 고른 예시 자리 — 게임에서는 층마다 무작위로 다시 고름
        if (drawable && aLights.length) aLights.forEach((al, idx) => {
          PDM.autoLightCells(terrain, W, H, al, idx).forEach(([cx, cy]) => {
            const px = cx * s + s / 2 + (+al.ox || 0) * s / 16, py = cy * s + s / 2 + (+al.oy || 0) * s / 16;
            PDM.drawLightPreview(g, px, py, Object.assign({ color: '#ffc870', k: 4, z: 10, range: 4 }, al), s, al.shadow === false ? {} : { block: lightBlock });
            g.save(); g.setLineDash([3, 3]); g.strokeStyle = 'rgba(255,214,140,.85)'; g.lineWidth = 1; g.beginPath(); g.arc(px, py, Math.max(3, s * .18), 0, Math.PI * 2); g.stroke(); g.restore();
          });
        });
        // 오브젝트
        (fl.objects || []).forEach((o, i) => {
          let x, y;
          if (down && down.erase && o.at && o.at.x != null && down.objs.has(o.at.y * W + o.at.x)) return;
          if (down && down.move === i && down.to) { x = down.to[0] * s; y = down.to[1] * s; }
          else if (down && down.group && down.to && isSel(i) && o.at && o.at.x != null) { x = (o.at.x + down.to[0] - down.from[0]) * s; y = (o.at.y + down.to[1] - down.from[1]) * s; }   // 여러 개 함께 끄는 중
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
          else if (o.type === 'combo' && PDM.combos && PDM.combos.thumb(o.ref, rawTilesImg, () => paint())) g.drawImage(PDM.combos.thumb(o.ref, rawTilesImg), x - s, y - s, s * 3, s * 3);
          else if (o.type === 'trap') { g.save(); if (o.hidden) g.globalAlpha = .55; drawTrap(g, o.ref, o.inactive, x, y, s); g.restore(); if (o.hidden) { g.fillStyle = '#fff'; g.font = `bold ${Math.max(7, s * .4)}px sans-serif`; g.textAlign = 'right'; g.textBaseline = 'top'; g.fillText('?', x + s - 1, y); } }
          else { g.fillStyle = col + 'cc'; g.fillRect(x + s * .15, y + s * .15, s * .7, s * .7); g.fillStyle = '#000'; g.font = `bold ${s * .5}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText({ light: '☀', npc: 'N', mob: 'M', item: 'I', event: 'E', start: 'S', prop: 'P', entrance: '<', exit: '>', plate: 'T' }[o.type] || '?', x + s / 2, y + s / 2 + 1); }
          if (o.type === 'light') PDM.drawLightPreview(g, x + s / 2, y + s / 2, o, s, { block: lightBlock });
          if (o.type === 'combo') { const cb = (PDM.combos ? PDM.combos.list() : []).find(c => c.id === o.ref), lt = cb && cb.light; if (lt && lt.on) PDM.drawLightPreview(g, x + s / 2 + (+lt.ox || 0) * s / 16, y + s / 2 + (+lt.oy || 0) * s / 16, Object.assign({ color: '#ffe9a8', k: 3, z: 10, range: 4 }, lt), s, lt.shadow === false ? {} : { block: lightBlock }); }   // 광원: 게임과 같은 감쇠 · 그림자로 미리보기
          const on = isSel(i); g.strokeStyle = on ? '#fff' : col; g.lineWidth = on ? 2 : 1; g.strokeRect(x + 1, y + 1, s - 2, s - 2);
          if (on && multi()) { g.strokeStyle = PDM.cssVar('--map-area', '#5fd6ff'); g.lineWidth = 1; g.strokeRect(x - 1.5, y - 1.5, s + 3, s + 3); }   // 여러 개 고름: 바깥 테두리
          if (!drawable) { g.fillStyle = '#ccc'; g.font = '10px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText(PDM.PLACE_RULES[(o.at && o.at.rule) || 'random'] || '', x + s / 2, y + s + 2); }
        });
        // 캐릭터 위(above) 타일 레이어 — 오브젝트 위에 (게임에서 캐릭터를 가리는 전경)
        if (drawable && tilesL && ui.showUtile !== false) LAYERS().filter(l => l.depth === 'above').forEach(l => drawLayer(g, l, s));
        if (dragRect) {
          const [a, b, c, d] = dragRect, rx = Math.min(a, c) * s, ry = Math.min(b, d) * s, rw = (Math.abs(c - a) + 1) * s, rh = (Math.abs(d - b) + 1) * s;
          g.strokeStyle = down === 'spawnrect' ? SPAWN_VALS[ui.spawnVal][1] : down === 'randrect' ? (ui.randVal ? randColor(ui.randVal) : '#9a93ad') : down === 'area' ? PDM.cssVar('--map-area', '#5fd6ff') : PDM.cssVar('--map-sel', '#4fd8c6'); g.lineWidth = 2;
          if (down === 'area') g.setLineDash([6, 4]); g.strokeRect(rx, ry, rw, rh); g.setLineDash([]);
        }
        if (areaOn() && down !== 'area') {   // 고른 영역
          const r = ui.area, rx = r.x0 * s, ry = r.y0 * s, rw = (r.x1 - r.x0 + 1) * s, rh = (r.y1 - r.y0 + 1) * s;
          const AREA = PDM.cssVar('--map-area', '#5fd6ff'); g.save(); g.fillStyle = PDM.alpha(AREA, .10); g.fillRect(rx, ry, rw, rh); g.setLineDash([6, 4]); g.strokeStyle = AREA; g.lineWidth = 2; g.strokeRect(rx, ry, rw, rh); g.setLineDash([]);
          g.font = 'bold 11px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillStyle = AREA; g.fillText(`${r.x1 - r.x0 + 1} × ${r.y1 - r.y0 + 1}`, rx + 2, ry - 2); g.restore();
        }
        if (drawable && ui.pasteClip && ui.hover) drawPasteGhost(g, s);
        if (drawable && ui.port >= 0 && isStair(terrain[ui.port])) {   // 고른 계단
          const px = ui.port % W, py = Math.floor(ui.port / W);
          g.strokeStyle = '#fff'; g.lineWidth = 2; g.strokeRect(px * s + 1, py * s + 1, s - 2, s - 2);
          if (down && down.port !== undefined && down.to) { g.setLineDash([4, 3]); g.strokeStyle = '#ffe28a'; g.strokeRect(down.to[0] * s + 1, down.to[1] * s + 1, s - 2, s - 2); g.setLineDash([]); }
        }
        if (drawable) {   // 크기 조절 손잡이 (네 모서리)
          const R = down && down.resize ? down.rect : null;
          const SEL = PDM.cssVar('--map-sel', '#4fd8c6'); if (R) { g.fillStyle = PDM.alpha(SEL, .14); g.fillRect(R[0] * s, R[1] * s, R[2] * s, R[3] * s); g.strokeStyle = SEL; g.lineWidth = 2; g.setLineDash([6, 4]); g.strokeRect(R[0] * s, R[1] * s, R[2] * s, R[3] * s); g.setLineDash([]);
            g.fillStyle = '#fff'; g.font = 'bold 12px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillText(`${R[2]} × ${R[3]}`, R[0] * s + 4, R[1] * s - 4); }
          CORNERS.forEach(([cx, cy]) => { const hx = (R ? R[0] + (cx ? R[2] : 0) : cx * W) * s, hy = (R ? R[1] + (cy ? R[3] : 0) : cy * H) * s;
            g.fillStyle = SEL; g.strokeStyle = '#fff'; g.lineWidth = 1; g.fillRect(hx - 6, hy - 6, 12, 12); g.strokeRect(hx - 5.5, hy - 5.5, 11, 11); });
        }
        g.restore();
      }
      const ZONE_DOORS = [5, 6, 10, 16, 31];
      const cellAt = e => { const r = cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / S()) - PAD, Math.floor((e.clientY - r.top) / S()) - PAD]; };

      // ---- 맵 크기 바꾸기 (모서리 손잡이 · 바깥에 그리기 · 그린 영역에 맞춰 자르기) ----
      /** 새 크기로 옮겨 담기: 옛 (ox, oy) 가 새 (0, 0). 새 칸은 빈 칸(-1). edit(nt, nw, nh) 로 마무리 손질 */
      function reshape(ox, oy, nw, nh, label, editFn) {
        const nt = new Array(nw * nh).fill(-1), ns = new Array(nw * nh).fill(0), nr = new Array(nw * nh).fill(0), nu = {};
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const tx = x - ox, ty = y - oy; if (tx < 0 || ty < 0 || tx >= nw || ty >= nh) continue;
          nt[ty * nw + tx] = terrain[y * W + x]; if (tilesL) for (const id in tilesL) (nu[id] = nu[id] || new Array(nw * nh).fill(''))[ty * nw + tx] = tilesL[id][y * W + x] || ''; if (spawnL) ns[ty * nw + tx] = spawnL[y * W + x] || 0; if (randL) nr[ty * nw + tx] = randL[y * W + x] || 0;
        }
        const gone = editFn ? editFn(nt, nw, nh) || (() => false) : () => false;
        store.edit(key, label, r => {
          r.size = { w: nw, h: nh }; r.layers.terrain = nt; if (r.layers.spawn) r.layers.spawn = ns; if (r.layers.rand) r.layers.rand = nr; if (tilesL) { tilesL = nu; putTiles(r); }
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
        if (linkedOnly && !nodeOpts.length) out.append(h('div', { class: 'hint c-gold' }, '이 맵과 연결된 맵이 없습니다. 먼저 [맵] 그래프에서 노드를 연결하세요.'));
        if (pinned && isDoor) {
          const Q = W_.ports(other), od = store.get('node:' + other) || {}, ow = (od.size || {}).w || 1;
          if (Q.hand) {
            const list = isExit ? Q.entrances : Q.exits, eid = t.edge.id;
            const s2 = h('select', { onchange: () => { const v = +s2.value; store.edit('world', '짝 계단', w => { const e = w.edges.find(x => x.id === eid); if (e) e[g] = v; }); paint(); showInspector(); } },
              h('option', { value: -1 }, '자동 (남은 것 차례로 · 모자라면 새 계단)'), list.map(q => h('option', { value: q.i }, `${isExit ? '입구' : '출구'} ${q.i + 1} (${q.cell % ow}, ${Math.floor(q.cell / ow)})`)));
            s2.value = String(t.edge[g] ?? -1);
            out.append(PDM.ui.field(isExit ? '도착하는 입구 (그 맵에서)' : '출발하는 출구 (그 맵에서)', s2));
          } else out.append(h('div', { class: 'hint' }, `${W_.fullName(other)} 은(는) 직접 그린 맵이 아니라서 ${isExit ? '도착 입구' : '출발 출구'}는 게임이 정합니다.`));
          out.append(h('button', { class: 'btn xs mt-3', onclick: () => PDM.tabs.open('node:' + other) }, '그 맵 열기'));
        }
        out.append(h('div', { class: 'hint mt-3' }, linkedOnly ? '맵 그래프에서 이 맵과 연결된 맵만 고를 수 있습니다. 고르면 그 연결이 여기에 고정됩니다.' : '맵을 고르면 그 맵과의 연결이 여기에 고정됩니다 (연결이 없으면 통로를 새로 만듦). 조건 등 자세한 설정은 맵 그래프의 연결에서.'));
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
        const lk = ui.lockLayers;
        if (tilesL && (k === 'all' || ((k === 'wall' || k === 'floor') && terrain[i] < 0))) { for (const id in tilesL) if (!lk[id]) tilesL[id][i] = ''; }   // 전부 · 빈 칸이 된 칸: 잠기지 않은 모든 레이어
        else if (utileL && k === 'utile' && !lk[ui.tileLayer] && utileL[i]) { utileL[i] = ''; retop(i); }                     // 지금 레이어만 (지형은 남은 레이어에 맞춤)
        if (k === 'all' || k === 'object') down.objs.add(i);
        paint();
      }
      function commitErase(objs) {
        const copy = terrain ? terrain.slice() : null, sp = spawnL ? spawnL.slice() : null, rp = randL ? randL.slice() : null; ui.sel = -1;
        withPorts('지우개', () => store.edit(key, '지우개', r => {
          if (copy) r.layers.terrain = copy; if (tilesL) putTiles(r); if (sp && r.layers.spawn) r.layers.spawn = sp; if (rp && r.layers.rand) r.layers.rand = rp;
          if (objs.size) r.objects = (r.objects || []).filter(o => !(o.at && o.at.x != null && objs.has(o.at.y * W + o.at.x)));
        }));
      }
      async function clearAll() {
        const what = await PDM.ui.modal('맵 전체 지우기', h('p', {}, '이 맵에 그린 것을 모두 지웁니다. (실행 취소로 되돌릴 수 있습니다)'), [['취소', false], ['타일만', 'tiles'], ['타일 + 오브젝트 + 스폰 구역', 'all', 'pri']]);
        if (!what) return;
        terrain = new Array(W * H).fill(-1); if (tilesL) { for (const id in tilesL) tilesL[id] = blankL(); utileL = tilesL[ui.tileLayer]; } if (what === 'all' && spawnL) spawnL = new Array(W * H).fill(0); if (what === 'all' && randL) randL = new Array(W * H).fill(0);
        const copy = terrain.slice(); ui.sel = -1; ui.port = -1;
        withPorts('맵 전체 지우기', () => store.edit(key, '맵 전체 지우기', r => {
          r.layers.terrain = copy; delete r.layers.utile; delete r.layers.tiles;
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
      /** 사용자 타일 칠하기: 그 칸에 타일 id (+ 타일의 지형) — '' 면 지우기 */
      /** 사용자 타일 칠하기 · 지우기 (지금 레이어만). 칸의 지형 = 가장 위 레이어 중 지형을 가진 타일의 지형 (5차: 예전엔 칠한 타일의 지형으로 덮어써,
       *  위 레이어 타일을 지워도 그 지형이 남았고 아래 레이어 타일의 지형은 되돌아오지 않았음). 지형을 가진 타일이 하나도 없으면 지형 그대로 */
      function retop(i) { const L = { terrain, tiles: tilesL }; A.retopTerrain(L, i, layerOpts()); }
      function setUtile(i) { const v = ui.utile || '', before = terrain[i]; if (utileL[i] === v) { retop(i); return terrain[i] !== before; } utileL[i] = v; retop(i); return true; }
      function commitUtile(label) {
        const tc = terrain.slice();
        withPorts(label, () => store.edit(key, label, r => { r.layers.terrain = tc; putTiles(r); }, { silent: true }));
      }
      function utFill(x0, y0) {   // 같은 지형 · 같은 사용자 타일로 이어진 칸 전부
        const i0 = y0 * W + x0, t0 = terrain[i0], u0 = utileL[i0], seen = new Set(), st = [[x0, y0]];
        while (st.length) { const [x, y] = st.pop(), i = y * W + x; if (!inB(x, y) || seen.has(i) || terrain[i] !== t0 || utileL[i] !== u0) continue; seen.add(i); st.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]); }
        seen.forEach(setUtile);
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
        if (ui.pasteClip) {   // 붙여넣기 미리보기: 왼쪽 클릭 = 그 칸을 왼쪽 위로 붙임 (계속 눌러 여러 번) · 오른쪽 클릭 = 끝냄
          if (e.button === 0 && drawable) commitPaste(x, y); else { ui.pasteClip = null; info.textContent = '붙여넣기 끝'; paint(); updCtx(); }
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
        if (drawable && e.button === 2 && inB(x, y) && ui.tool !== 'utile') { ui.terrain = terrain[y * W + x]; if (ui.tool === 'object' || ui.tool === 'select') ui.tool = 'pen'; drawPalette(); drawTools(); return; }
        if (ui.tool === 'utile' && utileL && inB(x, y)) {
          if (e.button === 2 || ui.utShape === 'pick') { ui.utile = utileL[y * W + x] || ''; if (ui.utShape === 'pick') ui.utShape = 'pen'; drawPalette(); drawTools(); return; }   // 스포이드 (오른쪽 클릭 · 스포이드 도구)
          if (ui.lockLayers[ui.tileLayer]) { toast('잠긴 레이어입니다 — 왼쪽 레이어 목록의 🔒 를 눌러 풀 수 있습니다', 'warn'); return; }
          if (ui.utShape === 'rect') { down = 'utrect'; dragRect = [x, y, x, y]; paint(); }
          else if (ui.utShape === 'fill') { utFill(x, y); paint(); commitUtile('사용자 타일 채우기'); }
          else { down = 'utile'; brushCells(x, y).forEach(([bx, by]) => setUtile(by * W + bx)); paint(); }
          return;
        }
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
          if (ui.objType === 'trap') { delete o.count; o.hidden = false; }
          ui.sel = (fl.objects || []).length;   // 새로 놓은 것을 선택 상태로
          store.edit(key, '오브젝트 놓기', r => { r.objects = r.objects || []; r.objects.push(o); });
        } else if (ui.tool === 'select') {
          if (e.altKey && drawable && e.button === 0) { clearSel(); const cx = PDM.clamp(x, 0, W - 1), cy = PDM.clamp(y, 0, H - 1); down = 'area'; areaMoved = false; dragRect = [cx, cy, cx, cy]; paint(); showInspector(); return; }   // Alt+끌기 = 오브젝트 위에서 시작해도 영역
          const i = objAt(x, y), o = i >= 0 ? fl.objects[i] : null, add = e.shiftKey || e.ctrlKey || e.metaKey;
          if (o && add && o.id) {   // Shift/Ctrl+클릭: 여러 개 고르기 (고른 것을 다시 누르면 뺌)
            const cur = selIndexes().map(k => fl.objects[k].id).filter(Boolean);
            selectIds(cur.includes(o.id) ? cur.filter(id => id !== o.id) : [...cur, o.id]); ui.port = -1;
            paint(); showInspector(); return;
          }
          if (o && multi() && isSel(i) && drawable) { down = { group: ui.selIds.slice(), from: [x, y] }; return; }   // 고른 것 중 하나를 끌면 함께 이동
          ui.selIds = []; ui.area = null; ui.sel = i;
          ui.port = i < 0 && drawable && kind === 'node' && inB(x, y) && isStair(terrain[y * W + x]) ? y * W + x : -1;
          paint(); showInspector();
          if (i >= 0 && drawable) down = { move: i, from: [x, y] };
          else if (ui.port >= 0) down = { port: ui.port };
          else if (drawable && e.button === 0 && !add) { const cx = PDM.clamp(x, 0, W - 1), cy = PDM.clamp(y, 0, H - 1); down = 'area'; areaMoved = false; dragRect = [cx, cy, cx, cy]; }   // 빈 곳에서 끌기 = 영역 고르기 (그냥 누르기 = 선택 해제)
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
        if (ui.pasteClip && (!ui.hover || ui.hover.x !== x || ui.hover.y !== y)) { ui.hover = { x, y }; paint(); }
        info.textContent = `(${x}, ${y})  ${t ? PDM.terrainName(t, up) + ' [' + t.id + ']' : ''}${tilesL && inB(x, y) ? LAYERS().filter(l => (tilesL[l.id] || [])[y * W + x]).map(l => ' · ▦ ' + l.name + ': ' + ((utDef(tilesL[l.id][y * W + x]) || {}).name || tilesL[l.id][y * W + x])).join('') : ''}${canSpawn && inB(x, y) && spawnL[y * W + x] ? ' · ' + SPAWN_VALS[spawnL[y * W + x]][0] : ''}${canRand && inB(x, y) && randL[y * W + x] ? ' · 🎲' + randL[y * W + x] + ' ' + ((fl.randSets || [])[randL[y * W + x] - 1] || {}).name : ''}  ${oi >= 0 ? '· ' + PDM.OBJECT_TYPES[fl.objects[oi].type].name + ' ' + (fl.objects[oi].ref || '') : ''}`;
        if (down === 'pen' && inB(x, y)) { let ch = false; brushCells(x, y).forEach(([bx, by]) => { if (terrain[by * W + bx] !== ui.terrain) { terrain[by * W + bx] = ui.terrain; ch = true; } }); if (ch) { lastCell = y * W + x; paint(); } }
        else if (down === 'spawn' && inB(x, y) && spawnL[y * W + x] !== ui.spawnVal) { spawnL[y * W + x] = ui.spawnVal; paint(); }
        else if (down === 'rand' && inB(x, y) && randL[y * W + x] !== ui.randVal) { randL[y * W + x] = ui.randVal; paint(); }
        else if (down === 'utile' && inB(x, y)) { let ch = false; brushCells(x, y).forEach(([bx, by]) => { if (setUtile(by * W + bx)) ch = true; }); if (ch) paint(); }
        else if ((down === 'rect' || down === 'room' || down === 'spawnrect' || down === 'randrect' || down === 'utrect') && dragRect) { dragRect[2] = PDM.clamp(x, 0, W - 1); dragRect[3] = PDM.clamp(y, 0, H - 1); paint(); }
        else if (down === 'area' && dragRect) { const nx = PDM.clamp(x, 0, W - 1), ny = PDM.clamp(y, 0, H - 1); if (nx !== dragRect[2] || ny !== dragRect[3]) { dragRect[2] = nx; dragRect[3] = ny; areaMoved = true; paint(); info.textContent = `영역 ${Math.abs(nx - dragRect[0]) + 1} × ${Math.abs(ny - dragRect[1]) + 1}`; } }
        else if (down && down.group) { if (inB(x, y) && String(down.to) !== String([x, y])) { down.to = [x, y]; paint(); } }
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
        else if (down === 'utile') commitUtile(ui.utile ? '사용자 타일 칠하기' : '사용자 타일 지우기');
        else if (down === 'utrect' && dragRect) {
          const [a, b, c, d] = dragRect;
          for (let y = Math.min(b, d); y <= Math.max(b, d); y++) for (let x = Math.min(a, c); x <= Math.max(a, c); x++) setUtile(y * W + x);
          dragRect = null; paint(); commitUtile('사용자 타일 사각형');
        }
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
        } else if (down === 'area' && dragRect) {
          const [a, b, c, d] = dragRect; dragRect = null; down = null;
          if (!areaMoved) clearSel();   // 끌지 않고 누르기만 = 선택 해제
          else { ui.area = A.rect(a, b, c, d, W, H); selectIds(A.objectsIn(fl, ui.area)); }
          paint(); showInspector(); return;
        } else if (down && down.group && down.to) {
          const ids = down.group, dx = down.to[0] - down.from[0], dy = down.to[1] - down.from[1];
          down = null; moveGroup(ids, dx, dy); return;
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
        const T = PDM.OBJECT_TYPES[o.type] || {}, refKind = { npc: 'char', mob: 'char', item: 'item', event: 'event', plate: 'event', prop: 'prop', effect: 'effect', combo: 'combo' }[o.type];
        const at = o.at && o.at.x != null ? o.at : null;
        PDM.ui.menu(e.clientX, e.clientY, [
          { label: `${T.name || o.type}${o.ref ? ' · ' + o.ref : ''}${at ? ` (${at.x}, ${at.y})` : ''}`, disabled: true, run: () => {} },
          '-',
          { label: '설정 열기', hint: '오른쪽 속성 창', run: () => { ui.sel = i; paint(); showInspector(); const ins = document.querySelector('#inspBody'); if (ins) ins.scrollTop = 0; } },
          { label: '이동…', hint: '다음에 누르는 칸으로', disabled: !drawable, run: () => { ui.moveObj = i; ui.moveTo = null; cv.style.cursor = 'move'; info.textContent = '옮길 칸을 누르세요 (오른쪽 클릭 · Esc = 취소)'; } },
          { label: '복제', hint: '옆 빈 칸에', run: () => dupObj(i) },
          refKind ? { label: '대상 열기', disabled: !o.ref || o.ref.startsWith('spd:'), run: () => (refKind === 'combo' ? PDM.combos.ops.show(o.ref) : PDM.tabs.open(refKind === 'effect' ? 'effects' : `${refKind}:${o.ref}`)) } : null,
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
      // ---- 영역 · 여러 오브젝트 편집 (⇱ 선택 도구) — 고치는 것은 모두 store.edit 한 번 = 실행 취소 한 번
      /** 고른 오브젝트들을 (dx, dy) 만큼 함께 옮김 — 하나라도 맵 밖으로 나가면 옮기지 않음. 투명 입구 · 출구가 있으면 계단 번호도 맞춤 */
      function moveGroup(ids, dx, dy) {
        if (!dx && !dy) { paint(); return; }
        const probe = { size: fl.size, objects: PDM.clone(fl.objects || []) }, cellMap = A.moveObjects(probe, ids, dx, dy);
        if (cellMap === false) { toast('고른 오브젝트 중 맵 밖으로 나가는 것이 있어 옮기지 않았습니다', 'bad'); paint(); return; }
        if (!cellMap) { paint(); return; }
        ui.area = null;
        withPorts('오브젝트 여러 개 이동', () => store.edit(key, `오브젝트 ${ids.length}개 이동`, r => { A.moveObjects(r, ids, dx, dy); }), cellMap);
      }
      /** 붙여넣기 미리보기의 자리 (x, y) 에 붙임 — 붙인 영역 · 오브젝트를 고른 상태로. 미리보기는 Esc · 오른쪽 클릭까지 계속 */
      function commitPaste(x, y) {
        const c = ui.pasteClip;
        if (!A.valid(c)) { ui.pasteClip = null; toast('붙여 넣을 수 없는 데이터입니다', 'bad'); paint(); return; }
        let res = null;
        // 편집 대상이 레이어면 그 레이어 칸만 붙임 (전체 영역 복사본이면 그중 이 레이어 것만 — 지형 · 다른 레이어 · 오브젝트는 그대로)
        const layerOnly = onLayer() && !c.objectsOnly, src = layerOnly && !c.layer ? Object.assign({}, c, { layer: ui.tileLayer, tiles: { [ui.tileLayer]: (c.tiles || {})[ui.tileLayer] || new Array(c.w * c.h).fill('') }, objects: [] }) : c;
        try { withPorts('영역 붙여넣기', () => store.edit(key, c.objectsOnly ? `오브젝트 ${c.objects.length}개 붙여넣기` : layerOnly ? `레이어 붙여넣기 ${c.w}×${c.h}` : `영역 붙여넣기 ${c.w}×${c.h}`, r => { res = A.paste(r, src, x, y, Object.assign({ key, kind, uid: () => PDM.uid('o') }, layerOpts(), layerOnly ? { layer: ui.tileLayer } : c.layer ? { layer: c.layer } : {})); })); }
        catch (err) { toast('붙여넣기 실패: ' + err.message, 'bad'); return; }
        if (!res) return;
        const notes = [res.clippedCells ? `맵 밖 ${res.clippedCells}칸` : '', res.clippedObjects ? `맵 밖 오브젝트 ${res.clippedObjects}개` : '', res.skippedTypes ? `방 템플릿에 놓을 수 없는 오브젝트 ${res.skippedTypes}개` : '', res.randDropped ? '무작위 칸(다른 맵의 묶음 번호)' : ''].filter(Boolean);
        toast(`붙였습니다: ${c.objectsOnly ? '' : res.cells + '칸 · '}오브젝트 ${res.objects}개${notes.length ? ' — 빠짐: ' + notes.join(' · ') : ''}`, notes.length ? 'bad' : '');
        ui.area = c.objectsOnly ? null : A.rect(x, y, x + c.w - 1, y + c.h - 1, W, H); selectIds(res.ids);
        ctx.refresh();
      }
      /** 고른 영역 비우기 (Delete · 잘라내기) — 지우개 "전부"와 같음 */
      function clearArea(label) {
        const r = ui.area; if (!r) return;
        clearSel();
        withPorts(label, () => store.edit(key, label, d => { A.clear(d, r, Object.assign(layerOpts(), onLayer() ? { layer: ui.tileLayer } : {})); }));   // 레이어 편집 중이면 그 레이어만
      }
      function deleteSelected() {
        const ids = new Set(selIndexes().map(i => fl.objects[i].id).filter(Boolean)); if (!ids.size) return;
        clearSel();
        withPorts('오브젝트 여러 개 삭제', () => store.edit(key, `오브젝트 ${ids.size}개 삭제`, r => { r.objects = (r.objects || []).filter(o => !ids.has(o.id)); }));
      }
      /** 지금 선택을 복사본으로 (영역 → 영역 · 여러 오브젝트 → 오브젝트만). 없으면 null */
      function selectionClip() {
        if (areaOn()) return A.copy(fl, ui.area, key, onLayer() ? { layer: ui.tileLayer } : {});
        if (multi()) return A.copyObjects(fl, ui.selIds, key);
        return null;
      }
      const clipLabel = c => c.objectsOnly ? `오브젝트 ${c.objects.length}개` : c.layer ? `레이어「${(LAYERS().find(l => l.id === c.layer) || {}).name || c.layer}」 영역 ${c.w}×${c.h}` : `맵 영역 ${c.w}×${c.h}${c.objects.length ? ' · 오브젝트 ' + c.objects.length : ''}`;
      /** 고른 것 복제: 복사본을 만들어 붙여넣기 미리보기로 (클립보드는 그대로) */
      function duplicateSelection() {
        const c = selectionClip(); if (!c) return;
        ui.pasteClip = c; info.textContent = '붙일 자리(왼쪽 위)를 누르세요 — 계속 누르면 여러 번 붙임 · 오른쪽 클릭 / Esc = 끝'; paint();
      }
      // Ctrl+C / Ctrl+X / Ctrl+V: 영역(⇱ 선택으로 끈 사각형) · 여러 오브젝트 · 오브젝트 하나 — 다른 맵 · 방 템플릿에도 붙여 넣을 수 있음
      ctx.copy = () => {
        if (ui.paintMode) return false;
        const c = selectionClip();
        if (c) { PDM.clip.set('maparea', c, clipLabel(c)); return; }
        const o = ui.sel >= 0 && (fl.objects || [])[ui.sel]; if (!o) return false; PDM.clip.set('mapobj', o, (PDM.OBJECT_TYPES[o.type] || {}).name + (o.ref ? ' ' + o.ref : ''));
      };
      /** 잘라내기 = 복사가 된 뒤에만 지움 (복사본이 틀리면 원본을 지우지 않음) */
      ctx.cut = () => {
        if (ui.paintMode) return false;
        const c = selectionClip();
        if (c) {
          if (!A.valid(c)) { toast('복사하지 못해 지우지 않았습니다', 'bad'); return; }
          PDM.clip.set('maparea', c, clipLabel(c) + ' (잘라내기)');
          if (c.objectsOnly) deleteSelected(); else clearArea('영역 잘라내기');
          return;
        }
        const i = ui.sel, o = i >= 0 && (fl.objects || [])[i]; if (!o) return false;
        PDM.clip.set('mapobj', o, (PDM.OBJECT_TYPES[o.type] || {}).name + (o.ref ? ' ' + o.ref : '') + ' (잘라내기)');
        ui.sel = -1; withPorts('오브젝트 잘라내기', () => store.edit(key, '오브젝트 잘라내기', r => { r.objects.splice(i, 1); }));
      };
      ctx.paste = c => {
        if (ui.paintMode) return false;
        if (c.kind === 'maparea') {
          if (!drawable) { toast('자동 생성 층에는 영역을 붙여 넣을 수 없습니다 (직접 그린 맵 · 혼합 · 방 템플릿에서)', 'bad'); return; }
          if (!A.valid(c.payload)) { toast('붙여 넣을 수 없는 영역 데이터입니다', 'bad'); return; }
          ui.pasteClip = c.payload; ui.hover = hoverCell && inB(hoverCell.x, hoverCell.y) ? hoverCell : null;
          info.textContent = '붙일 자리(왼쪽 위)를 누르세요 — 계속 누르면 여러 번 붙임 · 오른쪽 클릭 / Esc = 끝'; paint(); updCtx(); return;
        }
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
        if (e.key === 'Escape' && !e.defaultPrevented && ui.pasteClip) { ui.pasteClip = null; info.textContent = '붙여넣기 끝'; paint(); updCtx(); return; }
        if (e.key === 'Escape' && !e.defaultPrevented && (ui.area || ui.selIds.length)) { clearSel(); paint(); showInspector(); return; }
        if (c && e.code === 'KeyA' && !e.shiftKey && !e.altKey && drawable) {   // Ctrl+A: 맵 전체를 영역으로 (오브젝트도 모두 고름)
          e.preventDefault(); ui.tool = 'select'; ui.area = { x0: 0, y0: 0, x1: W - 1, y1: H - 1 }; selectIds(A.objectsIn(fl, ui.area)); drawTools(); drawPalette(); paint(); showInspector(); return;
        }
        if (!c && !e.altKey && ui.tool === 'select' && drawable && /^Arrow/.test(e.key)) {   // 방향키: 고른 오브젝트를 한 칸씩 (Shift = 5칸)
          const ids = selIndexes().map(i => fl.objects[i].id).filter(Boolean);
          if (ids.length) { e.preventDefault(); const n = e.shiftKey ? 5 : 1, d = { ArrowLeft: [-n, 0], ArrowRight: [n, 0], ArrowUp: [0, -n], ArrowDown: [0, n] }[e.key]; moveGroup(ids, d[0], d[1]); return; }
        }
        if (e.code === 'Space' && !c) { e.preventDefault(); if (!navKey) { navKey = 'pan'; cv.style.cursor = 'grab'; } return; }
        if (e.code === 'KeyZ' && !c && !e.altKey) { e.preventDefault(); if (!navKey) { navKey = 'zoom'; cv.style.cursor = 'zoom-in'; } return; }
        const K = PDM.keys;
        if (K.is(e, 'draw.deselect')) { e.preventDefault(); clearSel(); ui.pasteClip = null; paint(); showInspector(); return; }
        // 도구 · 브러쉬 크기 — 편집 › 단축키 설정 의 "그리기" 키 (스프라이트 편집과 같은 키)
        const tk = K.tool(e, ['pen', 'erase', 'fill', 'pick', 'select']);
        if (tk && (drawable || tk === 'select')) { e.preventDefault(); setTool(tk); return; }   // 편집 대상이 레이어면 그 레이어용 도구로 (setTool)
        if (K.is(e, 'draw.brushDown') || K.is(e, 'draw.brushUp')) { e.preventDefault(); ui.brush = PDM.clamp((ui.brush || 1) + (K.is(e, 'draw.brushUp') ? 1 : -1), 1, 9); drawTools(); return; }
        if (e.key === 'Enter') { e.preventDefault(); zoomFit(); return; }
        if (e.key === 'Delete' && areaOn()) { e.preventDefault(); clearArea('영역 지우기'); return; }
        if (e.key === 'Delete' && multi()) { e.preventDefault(); deleteSelected(); return; }
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
      /** 여러 오브젝트 공통 속성 (바꾼 칸만 고른 오브젝트 모두에 — 나머지 속성은 그대로). 종류마다 고칠 수 있는 칸이 다름 */
      function bulkEditor(objs) {
        const ids = new Set(objs.map(o => o.id).filter(Boolean)); if (!ids.size) return null;
        const types = [...new Set(objs.map(o => o.type))], one = types.length === 1 ? types[0] : null, n = objs.length;
        const same = (k, def) => { const v = objs.map(o => o[k] === undefined ? def : o[k]); return v.every(x => JSON.stringify(x) === JSON.stringify(v[0])) ? { v: v[0] } : null; };
        const setAll = (label, fn) => store.edit(key, `오브젝트 ${ids.size}개: ${label}`, r => (r.objects || []).forEach(o => { if (ids.has(o.id)) fn(o); }));
        const MIXED = '(여러 값 — 고치면 모두 같아짐)';
        const text = (label, k) => { const sv = same(k, ''), i = h('input', { type: 'text', value: sv ? sv.v : '', placeholder: sv ? '' : MIXED }); i.onchange = () => setAll(label, o => { o[k] = i.value; }); return PDM.ui.field(label, i); };
        const num = (label, k, def, min, max) => { const sv = same(k, def), i = h('input', { type: 'number', value: sv ? sv.v : '', placeholder: sv ? '' : MIXED, min, max }); i.onchange = () => { if (i.value === '') return; const v = PDM.clamp(Math.round(+i.value), min, max); setAll(label, o => { o[k] = v; }); }; return PDM.ui.field(label, i); };
        const bool = (label, k) => { const sv = same(k, false), cb = h('input', { type: 'checkbox', checked: !!(sv && sv.v) }); cb.indeterminate = !sv; cb.onchange = () => setAll(label, o => { o[k] = cb.checked; }); return h('label', { class: 'check' }, cb, label + (sv ? '' : ' (여러 값)')); };
        const refSel = () => {
          const opts = refOpts(one), sv = same('ref', ''), sel = h('select', {}, sv ? null : h('option', { value: '' }, '(여러 값)'), opts.map(([v, t]) => h('option', { value: v, selected: !!sv && sv.v === v }, t)));
          sel.onchange = () => { if (sel.value) setAll(one === 'trap' ? '함정 종류' : '대상', o => { o.ref = sel.value; }); };
          return PDM.ui.field(one === 'trap' ? '함정 종류' : '대상', sel);
        };
        return h('div', {},
          h('div', { class: 'mb-3' }, `고른 오브젝트 ${n}개 — ` + types.map(t => `${(PDM.OBJECT_TYPES[t] || {}).name || t} ${objs.filter(o => o.type === t).length}`).join(' · ')),
          one && (PDM.OBJECT_TYPES[one] || {}).ref ? refSel() : null,
          one === 'trap' ? h('div', { class: 'flex gap-3 wrap' }, bool('숨겨진 함정', 'hidden'), bool('이미 작동한 함정', 'inactive')) : null,
          text('등장 조건', 'cond'),
          types.every(t => t === 'mob' || t === 'item') ? num('개수', 'count', 1, 1, 999) : null,
          kind === 'room' ? num('나올 확률 (%)', 'chance', 100, 0, 100) : null,
          text('메모', 'note'),
          h('div', { class: 'hint my-2' }, one ? '바꾼 칸만 고른 오브젝트 모두에 적용됩니다 (나머지 속성 · 좌표 · id 는 그대로).' : '종류가 섞여 있어 공통 속성(등장 조건 · 메모)만 함께 바꿀 수 있습니다. 종류별 속성은 한 종류만 고르면 보입니다.'),
          h('div', { class: 'flex gap-2 wrap mt-3' },
            drawable ? h('button', { class: 'btn sm', title: '붙일 자리를 눌러 복제 (여러 번 가능)', onclick: duplicateSelection }, '복제…') : null,
            h('button', { class: 'btn sm danger', title: 'Delete', onclick: deleteSelected }, `${ids.size}개 삭제`)));
      }
      /** 영역 · 여러 오브젝트를 고른 상태의 속성 창 */
      function showSelection() {
        const objs = selIndexes().map(i => fl.objects[i]), el = h('div', {});
        if (areaOn()) {
          const r = ui.area, b = (t, tip, fn, cls) => h('button', { class: 'btn sm' + (cls ? ' ' + cls : ''), title: tip, onclick: fn }, t);
          el.append(h('div', { class: 'mb-3' }, `영역 (${r.x0}, ${r.y0}) – (${r.x1}, ${r.y1}) · ${r.x1 - r.x0 + 1}×${r.y1 - r.y0 + 1}칸 · 오브젝트 ${objs.length}개`),
            h('div', { class: 'flex gap-2 wrap mb-4' }, b('복사', 'Ctrl+C — 지형 · 모든 타일 레이어 · 스폰 구역 · 무작위 칸 · 오브젝트', () => ctx.copy()), b('잘라내기', 'Ctrl+X — 복사한 뒤 비움', () => ctx.cut()),
              b('복제…', '붙일 자리를 눌러 복제 (여러 번 가능)', duplicateSelection), b('비우기', 'Delete — 지우개 "전부"와 같음 (실행 취소 가능)', () => clearArea('영역 지우기'), 'danger'), b('선택 해제', 'Esc', () => { clearSel(); paint(); showInspector(); })),
            h('div', { class: 'hint mb-4' }, '붙여넣기(Ctrl+V)는 미리보기가 마우스를 따라다니고, 누른 칸이 왼쪽 위가 됩니다. 빈 칸(▢)은 투명 — 받는 맵의 그 칸은 그대로입니다. 맵 밖으로 나가는 칸 · 오브젝트는 붙지 않습니다.'));
        }
        if (objs.length > 1 || (areaOn() && objs.length)) el.append(bulkEditor(objs) || '');
        PDM.inspector.show(areaOn() ? '영역 선택' : `오브젝트 ${objs.length}개`, el);
      }
      function showInspector() {
        updCtx();
        const { F, section, row } = PDM.ui;
        if (areaOn() || multi()) { showSelection(); return; }
        const o = fl.objects && fl.objects[ui.sel];
        if (o) {
          const p = ['objects', ui.sel];
          const refKind = { npc: 'char', mob: 'char', item: 'item', event: 'event', plate: 'event', prop: 'prop', effect: 'effect', combo: 'combo' }[o.type];
          const el = h('div', {},
            F.select(key, [...p, 'type'], Object.fromEntries(Object.entries(PDM.OBJECT_TYPES).map(([k, v]) => [k, v.name])), { label: '종류' }),
            refKind ? F.ref(key, [...p, 'ref'], refKind, { label: '대상' }) : null,
            o.type === 'trap' ? h('div', {},
              F.select(key, [...p, 'ref'], Object.fromEntries(PDM.TRAPS.map(t => [t.id, t.name]).concat(PDM.TRAP_BY_ID[o.ref] || !o.ref ? [] : [[o.ref, o.ref + ' (모드 함정)']])), { label: '함정 종류', rerender: true }),
              row(F.bool(key, [...p, 'hidden'], { label: '숨겨진 함정 (찾기 전엔 안 보임)', rerender: true }), F.bool(key, [...p, 'inactive'], { label: '이미 작동한 함정 (밟아도 아무 일 없음)', rerender: true })),
              (PDM.TRAP_BY_ID[o.ref] || {}).noHide && o.hidden ? h('div', { class: 'hint c-gold' }, '이 함정은 게임 규칙상 숨길 수 없어 보이게 놓입니다.') : null,
              h('div', { class: 'hint my-2' }, '바닥 타일은 그대로 두고 그 위에 함정이 놓입니다. 게임 함정 그대로 — 밟으면 작동하고(대부분 한 번 쓰면 꺼짐), 숨겨진 함정은 찾기로 드러납니다.')) : null,
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
                h('div', { class: 'hint my-2' }, '게임에서는 보이지 않습니다. 이 칸이 없으면 평소처럼 입구(계단)에 서고, 입구도 없으면 맵 가운데 근처의 빈 칸에 섭니다. 지나갈 수 없는 칸(벽 · 빈 칸) 위에 놓으면 쓰이지 않습니다. 여러 개가 맞으면 "고른 맵에서 올 때" → "게임을 시작할 때" → "들어올 때마다" 순으로 씁니다. 저장을 불러올 때는 저장된 자리 그대로입니다.' + ((W0.start || '') !== fl.id && (o.when || 'start') === 'start' ? ' ⚠ 이 맵은 시작 맵이 아니라서 "게임을 시작할 때"는 쓰이지 않습니다.' : ''))); })() : null,
            (o.type === 'exit' || o.type === 'entrance') && drawable && o.at && o.at.x != null ? h('div', {}, h('div', { class: 'hint my-3' }, `그림이 없는 ${o.type === 'exit' ? '출구' : '입구'} — 아래 타일(문·바닥·맵 가장자리 등)은 그대로 보이고, 영웅이 이 칸을 밟으면 바로 다른 맵으로 넘어갑니다.`), portPanel(o.at.y * W + o.at.x, o.type === 'exit', true)) : null,
            o.type === 'light' ? h('div', {}, ...PDM.lightFields(key, p, o),
              h('div', { class: 'hint my-2' }, '게임에서는 광원 자체는 보이지 않고 빛만 보입니다. 위쪽 "조건"에 스위치 등을 적으면 그 조건이 맞을 때만 켜집니다 (게임 중에 바뀌어도 반영).')) : null,
            o.type === 'plate' ? h('div', {}, F.bool(key, [...p, 'once'], { label: '한 번만 발동 (밟은 뒤 사라짐)' }), h('div', { class: 'hint my-2' }, '게임에서는 보이지 않습니다. 영웅이 이 칸을 밟으면 위 「대상」 이벤트가 바로 실행됩니다 (이벤트의 발동 방식·이미지 설정과 상관없이).')) : null,
            F.text(key, [...p, 'note'], { label: '메모' }),
            h('div', { class: 'flex gap-3 mt-4' },
              refKind ? h('button', { class: 'btn sm', onclick: () => o.ref && !o.ref.startsWith('spd:') && (refKind === 'combo' ? PDM.combos.ops.show(o.ref) : PDM.tabs.open(refKind === 'effect' ? 'effects' : `${refKind}:${o.ref}`)) }, '대상 열기') : null,
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
          el.append(h('div', { class: 'flex gap-3 mt-4' },
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
                h('button', { class: 'btn xs self-end', onclick: () => store.edit(key, '지형 광원 삭제', o => { o.terrainLights.splice(i, 1); if (!o.terrainLights.length) delete o.terrainLights; }) }, '삭제')),
              ...PDM.lightFields(key, ['terrainLights', i], tl, { area: true }))),
            h('button', { class: 'btn sm add', onclick: () => store.edit(key, '지형 광원 추가', o => { (o.terrainLights = o.terrainLights || []).push({ terrain: 29, color: '#9a7cff', k: 1.5, z: 10, range: 2, pulse: 3, pulseMin: 55 }); }) }, '+ 지형 광원 추가')),
          section(`자동 광원 (${(fl.autoLights || []).length})`,
            h('div', { class: 'hint' }, '고른 지형 칸에 겹치도록 점광원을 자동으로 놓습니다 (벽 · 물건 · 캐릭터 그림자 있음) — 자동 생성 층에서도 됩니다. 자리는 층마다 씨앗으로 정해져서 다시 들어와도 같습니다. 예) 석상마다 촛불, 장식 벽에 횃불(빛 위치를 ↓ 로 옮김), 물 몇 군데에 도깨비불. 직접 그린 맵에서는 맵 그림에 점선 동그라미와 빛으로 미리 보입니다 (확률 · 간격 · 최대 개수를 따른 예시 자리 — 실제 자리는 게임에서 층마다 정해짐).'),
            ...(fl.autoLights || []).map((al, i) => h('div', { class: 'card', style: { padding: '6px', margin: '6px 0' } },
              row(F.select(key, ['autoLights', i, 'terrain'], PDM.TERRAIN.map(t => [t.id, t.name]), { label: '놓을 지형', number: true }),
                F.num(key, ['autoLights', i, 'chance'], { label: '칸마다 확률 (%)', int: true, min: 0, max: 100, def: 100 }),
                F.num(key, ['autoLights', i, 'max'], { label: '최대 개수 (0 = 제한 없음)', int: true, min: 0, max: 200, def: 0 }),
                F.num(key, ['autoLights', i, 'spacing'], { label: '최소 간격 (칸)', min: 0, max: 30, step: 0.5, def: 3, hint: '광원끼리 이보다 가까이 놓지 않음' }),
                h('button', { class: 'btn xs self-end', onclick: () => store.edit(key, '자동 광원 삭제', o => { o.autoLights.splice(i, 1); if (!o.autoLights.length) delete o.autoLights; }) }, '삭제')),
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
            h('div', { class: 'hint mt-2' }, '나가는 곳: '), outs.length ? outs.map(e => h('div', {}, '→ ', link(e.to), portText(e, true))) : h('div', { class: 'hint' }, '없음 — 출구가 온 곳으로 되돌아갑니다'),
            h('div', { class: 'hint mt-2' }, '연결은 맵 그래프에서 노드 가장자리의 점(위·아래·왼쪽·오른쪽)을 끌어서 만듭니다 (같은 두 노드 사이에 여러 개 가능). 연결을 누르면 쓸 출구·입구 번호를 고를 수 있습니다.'),
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
          h('div', { class: 'fl mt-3' }, `🎲 무작위 칸 묶음 (${sets.length})`),
          ...sets.map((st, i) => h('div', { class: 'card', style: { padding: '6px', margin: '4px 0', borderLeft: '4px solid ' + randColor(i + 1) } },
            row(F.text(key, ['randSets', i, 'name'], { label: `${i + 1}. 이름`, rerender: true }),
              F.select(key, ['randSets', i, 'mode'], { cell: '칸마다 따로 굴림', all: '묶음 전체가 같은 결과' }, { label: '굴리는 방식', hint: '"묶음 전체" = 예) 이 웅덩이가 통째로 물이거나 통째로 용암' }),
              h('button', { class: 'btn xs self-end', onclick: () => dupRandSet(i) }, '복제'),
              h('button', { class: 'btn xs danger self-end', onclick: () => removeRandSet(i) }, '삭제')),
            ...(st.opts || []).map((op, j) => row(F.select(key, ['randSets', i, 'opts', j, 't'], TER, { label: j ? '' : '선택지 (지형)', number: true }),
              F.num(key, ['randSets', i, 'opts', j, 'w'], { label: j ? '' : '무게', min: 0, step: 1, def: 1, hint: j ? '' : '숫자가 클수록 자주 (예: 3 · 1 → 75% · 25%)' }),
              h('button', { class: 'btn xs self-end', onclick: () => store.edit(key, '선택지 삭제', r => { r.randSets[i].opts.splice(j, 1); }) }, '×'))),
            h('button', { class: 'btn xs add', onclick: () => store.edit(key, '선택지 추가', r => { (r.randSets[i].opts = r.randSets[i].opts || []).push({ t: -2, w: 1 }); }) }, '+ 선택지'),
            h('button', { class: 'btn xs ml-2', onclick: () => { ui.tool = 'rand'; ui.randVal = i + 1; ui.showRand = true; drawTools(); drawPalette(); paint(); } }, '이 묶음으로 칠하기'))),
          h('div', { class: 'flex gap-3 wrap mt-3' },
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
            grid.append(h('div', { class: 'ta-center' }, c, h('div', { class: 'hint' }, tag)));
          }
        };
        roll();
        PDM.ui.modal('변형 미리보기 — ' + (fl.name || fl.id), h('div', {}, h('div', { class: 'hint mb-4' }, '게임에서 이 방이 들어갈 때 나올 수 있는 모양 몇 가지입니다 (동그라미 = 오브젝트, 연결 안 된 문 자리는 게임에서 벽이 됨).'), grid,
          h('div', { class: 'mt-4 ta-center' }, h('button', { class: 'btn sm pri', onclick: e => { e.preventDefault(); roll(); } }, '🎲 다시 굴리기'))), [['닫기', true]]);
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
            h('div', { class: 'fl mt-3' }, '나오는 몬스터 (무게대로 무작위)'),
            !(sp.mobs || []).length ? PDM.gameSpawnBox(fl.depth || ((() => { try { return W_.info().depth[fl.id]; } catch (_) { return 0; } })()) || 1) : null,
            PDM.ui.listEditor(key, ['spawn', 'mobs'], { addLabel: '몬스터 추가', compact: true,
              make: () => ({ ref: (mobOpts[0] || [''])[0], weight: 1 }),
              render: (it, i, ip) => row(F.select(key, [...ip, 'ref'], mobOpts, { label: '몬스터' }), F.num(key, [...ip, 'weight'], { label: '무게', int: true, min: 0, def: 1 })) }),
            h('div', { class: 'hint mt-3' }, `스폰 구역 ${nz}칸 · 금지 ${nf}칸 — 도구 막대의 "☗ 스폰 구역"으로 칠합니다. ${nz ? '초록 칸 안에서만 생깁니다.' : '초록 칸이 없으면 빨강을 뺀 아무 곳(영웅 시야 밖)에서 생깁니다.'}`),
            h('div', { class: 'flex gap-3 mt-2' },
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
            const nl = {}; if (tilesL) for (const id in tilesL) { nl[id] = new Array(nw * nh).fill(''); for (let y = 0; y < Math.min(nh, H); y++) for (let x = 0; x < Math.min(nw, W); x++) nl[id][y * nw + x] = tilesL[id][y * W + x] || ''; }
            store.edit(key, '크기 바꾸기', r => { r.size = { w: nw, h: nh }; r.layers.terrain = nt; if (r.layers.spawn) r.layers.spawn = ns; if (r.layers.rand) r.layers.rand = nr; if (tilesL) { tilesL = nl; putTiles(r); } r.objects = (r.objects || []).filter(o => !o.at || o.at.x == null || (o.at.x < nw && o.at.y < nh)); });
          } }, '크기 적용'),
          h('button', { class: 'btn sm ml-2', onclick: () => { terrain = blankTerrain(W, H, true); paint(); commitTerrain('방 틀로 초기화'); } }, '방 틀로 초기화'));
      }
      ui.show = showInspector;

      drawTools(); drawPalette(); loadSprites(); paint();
      setTimeout(showInspector, 0);
      return h('div', { class: 'page full' }, h('div', { class: 'map-wrap' }, palette,
        h('div', { class: 'map-main' }, tools, h('div', { class: 'map-scroll' }, cv), info)));
    }
  });

  /** 검사 결과 → 맵의 칸 (x, y) 을 ⇱ 선택 영역으로 고른 채 열기 */
  function focus(key, cell) { if (!cell) return; focusReq = { key, cell }; PDM.tabs.refresh(key); }   // 열려 있으면 다시 그림 · 아니면 탭을 열 때 씀
  PDM.mapUtil = { focus, themeOf, themeName, newRoom, drawThumb, roomListEditor, blockListEditor, roomUsage, blankTerrain, showGameRoom, gameRoomGroups, gameRoomPreviews, showRoomGallery };
})();
