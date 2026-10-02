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
          h('p', { class: 'hint' }, '엔딩 실행 명령에서 엔딩을 지정하지 않으면, 우선순위가 높은 엔딩부터 조건을 검사해 처음 맞는 것을 봅니다.'),
          listEditor(key, ['endings'], { addLabel: '엔딩 추가', make: () => ({ id: PDM.uid('end'), name: '새 엔딩', priority: 0, when: '', scene: '', note: '' }),
            render: (it, i, p) => h('div', {}, row(F.text(key, [...p, 'id'], { label: 'id', transform: v => PDM.slugId(v) }), F.text(key, [...p, 'name'], { label: '이름' }), F.num(key, [...p, 'priority'], { label: '우선순위', int: true })),
              F.cond(key, [...p, 'when'], { label: '조건', placeholder: '예: var.cores>=5 && char.mireille.bond.close' }),
              row(F.ref(key, [...p, 'scene'], 'event', { label: '엔딩 장면(이벤트)' }), F.text(key, [...p, 'note'], { label: '메모' }))) })));
    }
  });
})();
