// ================================================================
//  용어 관리 — 화면/게임에 보이는 이름을 한 곳에서 바꿉니다.
//  era 에서 가져온 시스템 이름은 모두 여기서 대체 이름으로 관리됩니다.
// ================================================================
PDM.registerEditor({
  id: 'terms', icon: '🔤', title: () => '용어 관리',
  match: k => k === 'terms',
  render(key, ctx) {
    const { h } = PDM;
    const store = PDM.store;
    const st = ctx.st = ctx.st || { q: '' };
    const custom = (store.get('terms') || {}).terms || {};
    const keys = PDM.termKeys().filter(k => {
      const d = PDM.DEFAULT_TERMS[k] || {}; const q = st.q.toLowerCase();
      return !q || k.toLowerCase().includes(q) || PDM.T(k).toLowerCase().includes(q) || (d.group || '').includes(q) || (d.eraRef || '').toLowerCase().includes(q);
    });
    const search = h('input', { type: 'text', value: st.q, placeholder: '검색 (키, 이름, 분류, era 위치)', oninput: PDM.debounce(() => { st.q = search.value; ctx.refresh(); setTimeout(() => { const s = PDM.$('#termSearch'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }, 0); }, 250) });
    search.id = 'termSearch';
    const tb = h('table', { class: 'grid' }, h('tr', {}, h('th', {}, '분류'), h('th', {}, '키 (코드에서 사용)'), h('th', {}, 'era 위치'), h('th', {}, '기본 이름'), h('th', { style: { width: '30%' } }, '표시 이름'), h('th', {})));
    let lastGroup = null;
    keys.forEach(k => {
      const d = PDM.DEFAULT_TERMS[k] || { label: '', group: '사용자', eraRef: '' };
      const cur = custom[k] && custom[k].label;
      const inp = h('input', { type: 'text', value: cur || '', placeholder: d.label });
      inp.addEventListener('change', () => store.edit(key, '용어 변경: ' + k, r => {
        r.terms = r.terms || {};
        if (inp.value.trim()) r.terms[k] = Object.assign({}, r.terms[k], { label: inp.value.trim() }); else delete r.terms[k];
      }, { silent: true }));
      tb.append(h('tr', {},
        h('td', { class: 'hint' }, d.group !== lastGroup ? d.group : ''), h('td', { class: 'mono' }, k), h('td', { class: 'hint mono' }, d.eraRef || ''),
        h('td', { class: 'hint' }, d.label + (d.note ? ` (${d.note})` : '')), h('td', {}, inp),
        h('td', {}, cur ? h('button', { class: 'ib', title: '기본값으로', onclick: () => store.edit(key, '용어 초기화', r => { delete r.terms[k]; }) }, '↺') : null)));
      lastGroup = d.group;
    });
    return h('div', { class: 'page' },
      h('h1', {}, '용어 관리'),
      h('p', { class: 'lead' }, '에디터와 게임에 보이는 시스템 이름입니다. "표시 이름"을 비우면 기본 이름을 씁니다. 코드와 데이터는 왼쪽의 키만 쓰기 때문에, 이름을 바꿔도 아무것도 깨지지 않습니다.',
        h('br'), 'era 위치는 원본 시스템(CFLAG, ABL, MARK …)의 어느 자리를 대체했는지 표시합니다. 원본의 성인향 명칭은 이 프로젝트 어디에도 들어가지 않습니다.'),
      h('div', { style: { display: 'flex', gap: '8px', marginBottom: '10px' } }, search,
        h('button', { class: 'btn', onclick: async () => {
          const k = await PDM.ui.prompt('새 용어 키 (예: gauge.nostalgia, abl.fishing)', ''); if (!k) return;
          const label = await PDM.ui.prompt('표시 이름', ''); if (!label) return;
          store.edit(key, '용어 추가', r => { r.terms = r.terms || {}; r.terms[k.trim()] = { label }; });
        } }, '+ 용어 추가')),
      tb);
  }
});
