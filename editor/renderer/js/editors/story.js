// ================================================================
//  스토리 편집기 — 스위치/변수 사전, 루트, 스토리 비트(장별 필수 이벤트), 엔딩, 흐름도
// ================================================================
(function () {
  const { h } = PDM;
  const store = PDM.store;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = (tag, attrs, ...kids) => { const e = document.createElementNS(NS, tag); Object.entries(attrs || {}).forEach(([k, v]) => e.setAttribute(k, v)); kids.forEach(k => e.append(typeof k === 'string' ? document.createTextNode(k) : k)); return e; };

  function flowChart() {
    const story = store.get('story'), chs = ((store.get('world') || {}).groups || []);
    const colW = 190, gap = 40, top = 30;
    const I = PDM.World.info();
    const beatsOf = c => (story.beats || []).filter(b => (PDM.World.node(b.node) || {}).group === c.id).sort((a, b) => (I.depth[a.node] || 0) - (I.depth[b.node] || 0));
    const heights = chs.map(c => 60 + beatsOf(c).length * 22);
    const ends = (story.endings || []).slice().sort((a, b) => (b.priority || 0) - (a.priority || 0));
    const H = Math.max(200, ...heights.map(x => x + top + 20), ends.length * 64 + top + 20);
    const W = chs.length * (colW + gap) + 230;
    const s = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
    s.append(svg('defs', {}, svg('marker', { id: 'arr', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, svg('path', { d: 'M0,0 L10,5 L0,10 z', fill: '#9a93ad' }))));
    chs.forEach((c, i) => {
      const x = 10 + i * (colW + gap), hh = heights[i];
      const theme = PDM.THEMES[c.theme] || {};
      s.append(svg('rect', { x, y: top, width: colW, height: hh, rx: 8, fill: '#292535', stroke: theme.color || '#3b3550', 'stroke-width': 2 }));
      s.append(svg('text', { x: x + 10, y: top + 20, 'font-weight': 'bold' }, c.name || c.id));
      const ns = ((store.get('world') || {}).nodes || []).filter(n => n.group === c.id);
      s.append(svg('text', { x: x + 10, y: top + 38, fill: '#9a93ad', 'font-size': 11 }, `노드 ${ns.length}개 · 보스 ${ns.filter(n => (store.get('node:' + n.id) || {}).boss).length}`));
      let y = top + 58;
      beatsOf(c).forEach(b => {
        s.append(svg('text', { x: x + 12, y, 'font-size': 11, fill: b.required ? '#e6b95c' : '#e6e1f0' }, `${b.required ? '★' : '·'} ${PDM.World.label(b.node)} ${PDM.refName('event', b.event)}`.slice(0, 28)));
        y += 22;
      });
      (c.routeThemes || []).forEach(r => { s.append(svg('text', { x: x + 12, y, 'font-size': 10, fill: '#5fd6b4' }, `⤷ ${r.when} → ${r.theme}`.slice(0, 32))); y += 20; });
      if (i < chs.length - 1) s.append(svg('line', { x1: x + colW, y1: top + 30, x2: x + colW + gap - 2, y2: top + 30, stroke: '#9a93ad', 'stroke-width': 2, 'marker-end': 'url(#arr)' }));
    });
    const ex = 10 + chs.length * (colW + gap);
    ends.forEach((e, i) => {
      const y = top + i * 64;
      s.append(svg('rect', { x: ex, y, width: 200, height: 52, rx: 8, fill: '#3a2030', stroke: '#ff7a93' }));
      s.append(svg('text', { x: ex + 10, y: y + 20, 'font-weight': 'bold' }, `🏁 ${e.name || e.id}`));
      s.append(svg('text', { x: ex + 10, y: y + 38, 'font-size': 10, fill: '#9a93ad' }, `[${e.priority || 0}] ${e.when || '항상'}`.slice(0, 34)));
      const lastX = 10 + (chs.length - 1) * (colW + gap) + colW;
      s.append(svg('path', { d: `M${lastX},${top + 30} C${lastX + 20},${top + 30} ${ex - 20},${y + 26} ${ex - 2},${y + 26}`, fill: 'none', stroke: '#9a93ad', 'stroke-dasharray': '4 3', 'marker-end': 'url(#arr)' }));
    });
    if (!ends.length) s.append(svg('text', { x: ex, y: top + 20, fill: '#6c6580' }, '엔딩이 없습니다'));
    return h('div', { class: 'flow' }, s);
  }

  PDM.registerEditor({
    id: 'story', icon: '📖', title: () => '스토리',
    match: k => k === 'story',
    watch: (ck) => ck === 'story' || ck === 'world',
    watchStructure: k => k.startsWith('event:'),
    tree: () => store.isOpen ? [{ id: 'story', label: '스토리', icon: '📖', order: 50, open: 'story',
      children: [{ id: 'story_sw', label: `스위치 ${((store.get('story') || {}).switches || []).length} · 변수 ${((store.get('story') || {}).variables || []).length}`, icon: '🔘', open: 'story' },
        { id: 'story_end', label: `엔딩 ${((store.get('story') || {}).endings || []).length}`, icon: '🏁', open: 'story' }] }] : [],
    render(key) {
      const { F, section, row, listEditor } = PDM.ui;
      const story = store.get('story');

      // 입장 문구 칸이 쓰는 자리 (예전 프로젝트에는 없음)
      if (!story.messages || typeof story.messages !== 'object') story.messages = {};
      const M_ = story.messages; if (!M_.start) M_.start = { text: '', window: false }; if (!M_.groups) M_.groups = {}; if (!Array.isArray(M_.nodes)) M_.nodes = [];
      if (!Array.isArray(story.locks)) story.locks = [];
      if (!story.intro || typeof story.intro !== 'object') story.intro = { welcome: '', welcomeButton: '', vanilla: true, groups: {} };
      if (!story.intro.groups) story.intro.groups = {};
      if (!story.ending || typeof story.ending !== 'object') story.ending = { text: '', exit: '', stay: '', surfaceExit: '' };
      const groups = ((store.get('world') || {}).groups || []);
      groups.forEach(g => { if (!M_.groups[g.id]) M_.groups[g.id] = { text: '', window: false }; if (!story.intro.groups[g.id]) story.intro.groups[g.id] = { text: '', image: '' }; });
      const themeLabel = g => { const t = g.theme || ''; return t.startsWith('custom:') ? '사용자 테마' : ((PDM.THEMES[t] || {}).name || '깊이 기본 테마'); };
      // 게임 원래 글 · 그림을 실제 내용으로 보여 주기
      const OB = (k, label, fmt) => PDM.gameTexts ? PDM.gameTexts.origBox(k, label, fmt) : h('span', {});
      const dfmt = t => String(t).replace(/%d/g, '{depth}');
      const thumb = (rel, w, hh, title) => { const c = h('canvas', { width: w, height: hh, title: title || rel, style: { border: '1px solid var(--line)', borderRadius: '4px', background: '#111', flex: 'none' } });
        PDM.assets.load(rel).then(im => { if (!im) return; const g = c.getContext('2d'), k = Math.max(w / im.width, hh / im.height); g.drawImage(im, (w - im.width * k) / 2, (hh - im.height * k) / 2, im.width * k, im.height * k); }).catch(() => { }); return c; };
      const REGIONS = [['sewers', '하수도'], ['prison', '감옥'], ['caves', '동굴'], ['city', '드워프 도시'], ['halls', '악마의 전당']];
      const depthOf = (() => { try { return PDM.World.info().depth || {}; } catch (_) { return {}; } })();
      /** 그룹이 시작하는 층 · 원작 지역 (층 ÷ 5) */
      const regionOf = g => { const ds = (((store.get('world') || {}).nodes) || []).filter(n => n.group === g.id).map(n => depthOf[n.id]).filter(d => d > 0); const d = ds.length ? Math.min(...ds) : 0, r = d ? Math.min(5, Math.ceil(d / 5)) : 0; return { d, r, key: r ? REGIONS[r - 1][0] : '', name: r ? REGIONS[r - 1][1] : '' }; };
      const tableOf = (listKey, cols, make) => {
        const arr = story[listKey] || [];
        const tb = h('table', { class: 'grid' }, h('tr', {}, cols.map(c => h('th', { style: { width: c.w || '' } }, c.label)), h('th', { style: { width: '30px' } })));
        arr.forEach((it, i) => tb.append(h('tr', {}, cols.map(c => h('td', {}, c.input([listKey, i, c.k]))),
          h('td', {}, h('button', { class: 'ib danger', onclick: () => store.edit(key, '삭제', r => { r[listKey].splice(i, 1); }) }, '✕')))));
        return h('div', {}, tb, h('button', { class: 'btn sm add', onclick: () => store.edit(key, '추가', r => { r[listKey] = r[listKey] || []; r[listKey].push(make(arr.length)); }) }, '+ 추가'));
      };
      // 변수 형식 · 형식에 맞는 처음 값 입력칸
      const rowAt = p => (story[p[0]] || [])[p[1]] || {};
      const typeSelect = p => { const cur = rowAt(p).type || 'number';
        const sl = h('select', {}, [['number', '숫자'], ['string', '문자열'], ['bool', '참/거짓']].map(([v, t]) => h('option', { value: v, selected: v === cur }, t)));
        sl.onchange = () => store.edit(key, '변수 형식', r => { const it = r[p[0]][p[1]]; it.type = sl.value; it.initial = sl.value === 'string' ? String(it.initial === true || it.initial === false || it.initial === 0 || it.initial == null ? '' : it.initial) : sl.value === 'bool' ? !!(it.initial && it.initial !== '0' && it.initial !== 'false') : (parseInt(it.initial, 10) || 0); });
        return sl; };
      const initialInput = p => { const it = rowAt(p), t = it.type || 'number';
        if (t === 'string') { const i = h('input', { type: 'text', value: it.initial == null ? '' : String(it.initial), placeholder: '(빈 글자)' }); i.onchange = () => store.edit(key, '처음 값', r => { r[p[0]][p[1]].initial = i.value; }, { silent: true }); return i; }
        if (t === 'bool') { const sl = h('select', {}, h('option', { value: 'false', selected: !it.initial }, '거짓 (false)'), h('option', { value: 'true', selected: !!it.initial }, '참 (true)')); sl.onchange = () => store.edit(key, '처음 값', r => { r[p[0]][p[1]].initial = sl.value === 'true'; }, { silent: true }); return sl; }
        return F.num(key, p, { int: true }); };
      return h('div', { class: 'page' },
        h('h1', {}, '스토리'),
        h('p', { class: 'lead' }, '게임 전체 이야기의 흐름을 관리합니다. 이벤트에서 쓰는 스위치/변수를 여기서 이름 붙여 두고, 장마다 필수 이벤트(비트)와 엔딩 조건을 정합니다.'),
        section('흐름도', flowChart()),
        section('시놉시스', F.textarea(key, ['synopsis'], { rows: 5, placeholder: '예) 수 년에 한 번 열리는 정식 마녀 승급시험. 견습 마녀들은 탑의 코어를 회수해야 한다…' }),
          F.ref(key, ['startEvent'], 'event', { label: '게임 시작 시 이벤트(오프닝)', empty: '(없음)' })),
        section('스위치 (켬/끔)', tableOf('switches', [
          { label: 'id', k: 'id', w: '22%', input: p => F.text(key, p, { transform: v => PDM.slugId(v) }) },
          { label: '이름', k: 'name', w: '25%', input: p => F.text(key, p) },
          { label: '처음 상태', k: 'initial', w: '11%', input: p => { const on = !!rowAt(p).initial; const sl = h('select', { style: on ? { color: 'var(--good)', fontWeight: '600' } : {} }, h('option', { value: 'false', selected: !on }, '끔 (OFF)'), h('option', { value: 'true', selected: on }, '켬 (ON)')); sl.onchange = () => store.edit(key, '스위치 처음 상태', r => { r[p[0]][p[1]].initial = sl.value === 'true'; }); return sl; } },
          { label: '그룹', k: 'group', w: '15%', input: p => F.text(key, p) },
          { label: '메모', k: 'note', input: p => F.text(key, p) }], n => ({ id: 'sw' + (n + 1), name: '', initial: false, group: '', note: '' })),
          h('p', { class: 'hint' }, '"처음 상태"를 켬으로 두면 새 게임을 시작할 때 이미 켜져 있습니다. 게임 중에는 이벤트 명령 "스위치"로 바꿉니다.')),
        section('변수 (숫자 · 문자열 · 참/거짓)', tableOf('variables', [
          { label: 'id', k: 'id', w: '20%', input: p => F.text(key, p, { transform: v => PDM.slugId(v) }) },
          { label: '이름', k: 'name', w: '22%', input: p => F.text(key, p) },
          { label: '형식', k: 'type', w: '13%', input: p => typeSelect(p) },
          { label: '처음 값', k: 'initial', w: '16%', input: p => initialInput(p) },
          { label: '그룹', k: 'group', w: '12%', input: p => F.text(key, p) },
          { label: '메모', k: 'note', input: p => F.text(key, p) }], n => ({ id: 'var' + (n + 1), name: '', type: 'number', initial: 0, group: '', note: '' })),
          h('p', { class: 'hint' }, '숫자 = 정수 · 문자열 = 글자(이름, 암호 등) · 참/거짓 = 스위치처럼 켬/끔. 조건식: var.id >= 3 · var.id == "글자" · var.id (참/거짓). 대사·알림·선택지 글 안에 {var.id} 를 쓰면 그 값이 들어갑니다 ({gold} · {hero.lvl} 같은 이름도 됨).')),
        section('소개 화면 (처음 켰을 때 · 구역에 처음 들어갈 때의 이야기 글)',
          h('p', { class: 'hint' }, '① 게임을 처음 켰을 때 로고 아래에 나오는 소개 글과 그 아래 버튼. ② 새 구역에 처음 들어갈 때 로딩 화면(배경 그림 + 이야기 글 + "계속" 버튼). 비워 두면 게임 원래 글 · 그림이 나옵니다.'),
          F.textarea(key, ['intro', 'welcome'], { label: '① 처음 켰을 때 소개 글 (비우면 아래의 게임 원래 글)', rows: 5, placeholder: '예) 수 년에 한 번, 시험의 탑이 열린다…' }),
          OB('journal.document.intros.dungeon.body'),
          row(F.text(key, ['intro', 'welcomeButton'], { label: '① 버튼 글자 (타이틀 화면의 시작 버튼과 같은 글 · 비우면 아래의 게임 원래 글)' }),
            F.bool(key, ['intro', 'vanilla'], { label: '글을 비운 그룹은 원작 구역 소개 글 쓰기 (끄면 글 없이 바로 넘어감)' })),
          OB('scenes.titlescene.enter', '버튼 — 게임 원래 글'),
          h('div', { class: 'fl', style: { marginTop: '8px' } }, '② 그룹(구역)에 처음 들어갈 때 — 로딩 화면'),
          groups.length ? h('div', {}, groups.map(g => { const rg = regionOf(g), cfg = (story.intro.groups || {})[g.id] || {};
            return h('div', { style: { borderTop: '1px dashed var(--line)', padding: '6px 0' } },
              row(F.textarea(key, ['intro', 'groups', g.id, 'text'], { label: `${g.name || g.id} — 이야기 글 (비우면 아래의 게임 원래 글)`, rows: 4 }),
                F.image(key, ['intro', 'groups', g.id, 'image'], { label: '로딩 배경 그림 (비우면 아래의 게임 원래 그림)', sub: 'splashes', rerender: true })),
              rg.r ? h('div', { style: { display: 'flex', gap: '10px', alignItems: 'flex-start' } },
                h('div', { style: { flex: 'none', textAlign: 'center' } }, thumb(cfg.image || `game:splashes/${rg.key}.jpg`, 176, 99), h('div', { class: 'hint' }, cfg.image ? '정한 그림' : `게임 원래 그림: splashes/${rg.key}.jpg`)),
                h('div', { style: { flex: 1 } }, OB(`journal.document.intros.${rg.key}.body`, `게임 원래 글 — 이 그룹은 ${rg.d}층에서 시작 → 원작 「${rg.name}」 지역 (원작 글은 새 게임 때, 그리고 ${(rg.r - 1) * 5 + 1}층에 처음 내려올 때만 뜸)`)))
                : h('div', { class: 'hint' }, '이 그룹에 맵이 없어 원작 지역을 알 수 없습니다.')); }))
            : h('p', { class: 'hint' }, '맵 그래프에 그룹이 없습니다.'),
          h('p', { class: 'hint' }, '이야기 글은 그 그룹에 처음 들어갈 때 한 번, 내려가는(앞으로 가는) 이동에서만 뜹니다 — 게임 시작 때는 시작 맵의 그룹 글이 뜹니다. 배경 그림은 세로가 화면에 맞게 늘어나므로 원작처럼 가로로 넓은 그림(예: 800×450)을 권합니다. {변수id} 를 쓸 수 있습니다.')),
        section('입장 문구 (게임 시작 · 구역 · 맵에 들어올 때)',
          h('p', { class: 'hint' }, '층에 들어올 때 화면 아래 기록에 나오는 글("…층으로 내려왔다")을 바꿉니다. 비워 두면 게임 원래 글이 나옵니다. {depth} = 층 번호, {변수id} = 변수 값. "창으로도 보여 주기"를 켜면 양피지 창(이야기 창)으로도 띄웁니다. 우선순위: 게임 첫 시작 → 맵 → 그룹(구역) → 아래 두 칸의 문구.'),
          row(F.textarea(key, ['messages', 'start', 'text'], { label: '게임을 처음 시작했을 때 (한 번)', rows: 2, placeholder: '예) 시험의 탑 앞에 섰다. 문이 천천히 열린다…' }), F.bool(key, ['messages', 'start', 'window'], { label: '창으로도 보여 주기' })),
          row(h('div', { style: { flex: 1 } }, F.text(key, ['messages', 'descend'], { label: '새 층에 처음 왔을 때 (비우면 아래의 게임 원래 글)', placeholder: '예: {depth}층에 도착했다.' }), OB('scenes.gamescene.descend', null, dfmt)),
            h('div', { style: { flex: 1 } }, F.text(key, ['messages', 'back'], { label: '왔던 층에 다시 왔을 때 (비우면 아래의 게임 원래 글)', placeholder: '예: {depth}층으로 돌아왔다.' }), OB('scenes.gamescene.return', null, dfmt))),
          h('div', { class: 'fl', style: { marginTop: '8px' } }, '그룹(구역 · 테마)에 처음 들어왔을 때'),
          groups.length ? h('div', {}, groups.map(g => row(F.textarea(key, ['messages', 'groups', g.id, 'text'], { label: `${g.name || g.id} (${themeLabel(g)})`, rows: 2, placeholder: '(없음) 예) 축축한 공기. 지하 수로에 들어섰다.' }), F.bool(key, ['messages', 'groups', g.id, 'window'], { label: '창으로도 보여 주기' }))))
            : h('p', { class: 'hint' }, '맵 그래프에 그룹이 없습니다.'),
          h('div', { class: 'fl', style: { marginTop: '8px' } }, '특정 맵에 처음 들어왔을 때'),
          listEditor(key, ['messages', 'nodes'], { addLabel: '맵 문구 추가', compact: true, make: () => ({ node: ((store.get('world') || {}).start) || '', text: '', window: false }),
            render: (it, i, p) => row(F.ref(key, [...p, 'node'], 'node', { label: '맵(노드)' }), F.textarea(key, [...p, 'text'], { label: '문구', rows: 2 }), F.bool(key, [...p, 'window'], { label: '창으로도' })) })),
        section('잠긴 맵 (조건이 맞아야 들어갈 수 있는 맵)',
          h('p', { class: 'hint' }, '고른 맵으로 가는 모든 계단 · 통로가 조건이 맞을 때까지 막힙니다 (계단은 보이지만 누르면 아래 문구가 나오고 넘어가지 않음). 조건에는 스위치 · 변수 · 루트를 쓸 수 있습니다 — 예: switch.gate_open · var.cores>=3 · route==\'true\'. 이벤트에서 그 스위치를 켜면 열립니다. 연결 하나만 막으려면 맵 그래프의 연결 "조건"을 쓰세요.'),
          listEditor(key, ['locks'], { addLabel: '잠긴 맵 추가', compact: true, make: () => ({ node: '', cond: '', message: '', note: '' }),
            render: (it, i, p) => h('div', {}, row(F.ref(key, [...p, 'node'], 'node', { label: '맵(노드)', empty: '(고르기)' }), F.cond(key, [...p, 'cond'], { label: '열리는 조건 (참이면 들어갈 수 있음)', placeholder: '예: switch.gate_open' })),
              row(F.text(key, [...p, 'message'], { label: '막혔을 때 문구', placeholder: '(기본) 아직 이곳으로는 갈 수 없다.' }), F.text(key, [...p, 'note'], { label: '메모' }))) })),
        section('루트',
          h('p', { class: 'hint' }, '현재 루트는 이벤트의 "루트 설정" 명령으로 바뀌고, 조건식에서 route==\'id\' 로 확인합니다. 맵 그래프의 연결 조건에 route==\'id\' 를 쓰면 루트마다 다른 구역으로 갈라집니다.'),
          listEditor(key, ['routes'], { addLabel: '루트 추가', compact: true, make: () => ({ id: PDM.uid('route'), name: '새 루트', when: '', note: '' }),
            render: (it, i, p) => row(F.text(key, [...p, 'id'], { label: 'id', transform: v => PDM.slugId(v) }), F.text(key, [...p, 'name'], { label: '이름' }),
              F.cond(key, [...p, 'when'], { label: '자동 진입 조건(선택)' }), F.text(key, [...p, 'note'], { label: '메모' })) })),
        section('스토리 비트 (맵별 이벤트)',
          listEditor(key, ['beats'], { addLabel: '비트 추가', compact: true, make: () => ({ id: PDM.uid('beat'), node: ((store.get('world') || {}).start) || '', event: '', required: true, note: '' }),
            render: (it, i, p) => row(F.ref(key, [...p, 'node'], 'node', { label: '맵(노드)' }),
              F.ref(key, [...p, 'event'], 'event', { label: '이벤트' }), F.bool(key, [...p, 'required'], { label: '필수' }), F.text(key, [...p, 'note'], { label: '메모' })) })),
        section('엔딩',
          h('div', { style: { border: '1px solid var(--line)', borderRadius: '8px', padding: '8px 10px', marginBottom: '10px' } },
            h('b', {}, '게임 원래 엔딩'),
            h('p', { class: 'hint' }, '원작은 마지막 층에서 「옌더의 아뮬렛」을 주우면 ① 아뮬렛 화면(아래 글 + 버튼 두 개)이 뜨고, "끝내기" 쪽을 고르거나 아뮬렛을 들고 1층 입구로 올라가면 ② 지상 화면(아래 그림 + 버튼)으로 끝납니다. 아래에서 그 글들을 바꿀 수 있고, 그림은 "UI 그림 · 스프라이트"에서 고칩니다. 프로젝트에 아뮬렛이 나오지 않으면 이 화면들은 뜨지 않습니다 — 그때는 아래 "엔딩 추가"와 이벤트 명령 "엔딩 실행"으로 끝을 만드세요.'),
            h('div', { style: { display: 'flex', gap: '10px', alignItems: 'flex-start', flexWrap: 'wrap' } },
              h('div', { style: { flex: 'none', textAlign: 'center' } }, thumb('game:sprites/amulet.png', 64, 64), h('div', { class: 'hint' }, '① sprites/amulet.png')),
              h('div', { style: { flex: 1, minWidth: '320px' } },
                F.textarea(key, ['ending', 'text'], { label: '① 아뮬렛 화면의 글 (비우면 아래의 게임 원래 글)', rows: 3 }), OB('scenes.amuletscene.text'),
                row(h('div', { style: { flex: 1 } }, F.text(key, ['ending', 'exit'], { label: '① 버튼: 끝내기 (비우면 게임 원래 글)' }), OB('scenes.amuletscene.exit')),
                  h('div', { style: { flex: 1 } }, F.text(key, ['ending', 'stay'], { label: '① 버튼: 계속하기 (비우면 게임 원래 글)' }), OB('scenes.amuletscene.stay'))))),
            h('div', { style: { display: 'flex', gap: '10px', alignItems: 'flex-start', flexWrap: 'wrap', marginTop: '6px' } },
              h('div', { style: { flex: 'none', textAlign: 'center' } }, thumb('game:interfaces/surface.png', 176, 99), h('div', { class: 'hint' }, '② interfaces/surface.png')),
              h('div', { style: { flex: 1, minWidth: '320px' } }, F.text(key, ['ending', 'surfaceExit'], { label: '② 지상 화면의 버튼 (비우면 게임 원래 글)' }), OB('scenes.surfacescene.exit')))),
          h('b', {}, '프로젝트 엔딩'),
          h('p', { class: 'hint' }, '이벤트 명령 "엔딩 실행"이 부릅니다. 엔딩을 지정하지 않으면 우선순위가 높은 엔딩부터 조건을 검사해 처음 맞는 것을 봅니다. 엔딩 이름이 기록에 나오고, "엔딩 장면"에 고른 이벤트가 실행됩니다 (그 이벤트의 끝에 "게임 클리어" · "타이틀로" 명령을 두세요).'),
          listEditor(key, ['endings'], { addLabel: '엔딩 추가', make: () => ({ id: PDM.uid('end'), name: '새 엔딩', priority: 0, when: '', scene: '', note: '' }),
            render: (it, i, p) => h('div', {}, row(F.text(key, [...p, 'id'], { label: 'id', transform: v => PDM.slugId(v) }), F.text(key, [...p, 'name'], { label: '이름' }), F.num(key, [...p, 'priority'], { label: '우선순위', int: true })),
              F.cond(key, [...p, 'when'], { label: '조건', placeholder: '예: var.cores>=5 && char.mireille.bond.close' }),
              row(F.ref(key, [...p, 'scene'], 'event', { label: '엔딩 장면(이벤트)' }), F.text(key, [...p, 'note'], { label: '메모' }))) })));
    }
  });
})();
