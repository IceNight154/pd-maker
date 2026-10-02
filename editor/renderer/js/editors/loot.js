// ================================================================
//  드랍 테이블 — 캐릭터(몬스터) · 상자류에서 무엇이 얼마의 확률로 나오는지
//    캐릭터: char.drops [{ item, chance, min, max, cond }]
//    상자류: project.loot.<chest|locked|crystal|tomb|skeleton> { mode, pick, rows:[{ item, chance, min, max, depthMin, depthMax, cond }] }
//    런타임: MakerDrops (mobDrop · chestLoot)
// ================================================================
(function () {
  const { h, store } = PDM;
  PDM.LOOT_CONTAINERS = {
    chest:    { name: '상자', icon: '▣', desc: '층에 무작위로 놓이는 보통 상자' },
    locked:   { name: '잠긴 상자', icon: '🔒', desc: '황금 열쇠로 여는 상자' },
    crystal:  { name: '수정 상자', icon: '◇', desc: '수정 열쇠로 여는 상자 (보물 방)' },
    tomb:     { name: '무덤', icon: '✝', desc: '파헤치면 망령이 나오는 무덤' },
    skeleton: { name: '해골 (유해)', icon: '☠', desc: '뒤지면 아이템이 나오는 유해' }
  };
  /** 맵에 놓는 아이템의 담는 방식 (오브젝트 container) */
  PDM.ITEM_CONTAINERS = { '': '바닥에 그대로', chest: '상자', locked: '잠긴 상자 (황금 열쇠 필요)', crystal: '수정 상자 (수정 열쇠 필요)', tomb: '무덤', skeleton: '해골 (유해)' };

  const itemName = v => !v ? '' : store.has('item:' + v) ? (store.get('item:' + v).name || v) : v.startsWith('spd:') ? (((Object.values(PDM.SPD_ITEM_GROUPS || {}).flat().find(x => 'spd:' + x.p === v)) || {}).n || v) : '⚠ 없는 아이템';
  PDM.lootItemName = itemName;
  function itemInput(skey, path) {
    const i = h('input', { type: 'text', value: PDM.deepGet(store.get(skey), path) || '', placeholder: '아이템 — 눌러서 목록' });
    i.addEventListener('change', () => PDM.ui.commit(skey, path, i.value.trim(), '드랍 아이템', true));
    return PDM.ui.field('아이템', PDM.ui.combo(i, PDM.ui.itemOptions), itemName(i.value));
  }
  /** 드랍 줄 목록. o.depth = 깊이 범위 칸, o.weight = 확률 대신 가중치 (하나만 뽑기) */
  PDM.lootRows = function (skey, path, o = {}) {
    const { F, row } = PDM.ui;
    const rows = PDM.deepGet(store.get(skey), path) || [];
    const total = rows.reduce((a, r) => a + Math.max(0, +r.chance || 0), 0);
    return PDM.ui.listEditor(skey, path, { addLabel: '아이템 추가', emptyText: o.emptyText || '드랍 없음',
      make: () => ({ item: '', chance: o.weight ? 10 : 10, min: 1, max: 1, cond: '' }),
      render: (it, i, p) => h('div', {},
        row(itemInput(skey, [...p, 'item']),
          F.num(skey, [...p, 'chance'], { label: o.weight ? '가중치' : '확률(%)', min: 0, max: o.weight ? 100000 : 100, step: 0.1, dec: 1, rerender: !!o.weight,
            hint: o.weight && total > 0 ? `실제 ${(Math.max(0, +it.chance || 0) / total * 100).toFixed(1)}%` : '' }),
          F.num(skey, [...p, 'min'], { label: '개수 최소', int: true, min: 1 }), F.num(skey, [...p, 'max'], { label: '최대', int: true, min: 1 })),
        row(o.depth ? F.num(skey, [...p, 'depthMin'], { label: '깊이 최소 (0 = 제한 없음)', int: true, min: 0 }) : null,
          o.depth ? F.num(skey, [...p, 'depthMax'], { label: '깊이 최대 (0 = 제한 없음)', int: true, min: 0 }) : null,
          F.cond(skey, [...p, 'cond'], { label: '조건 (선택)' }))) });
  };
  /** 캐릭터 편집기에 넣는 드랍 테이블 */
  PDM.charLootEditor = function (key, c) {
    const fromItems = PDM.dropsFrom ? PDM.dropsFrom(c.id) : [];
    return h('div', {},
      h('p', { class: 'hint' }, '이 몬스터가 죽을 때 떨어뜨리는 아이템. 줄마다 따로 확률을 굴립니다 (100% = 항상). 개수는 겹쳐지는 아이템에만 적용됩니다.'),
      PDM.lootRows(key, ['drops'], { emptyText: '드랍 없음 — 게임 코드의 전리품만 떨어뜨립니다 (캐릭터 화면의 "게임 코드의 실제 값" 참고)' }),
      fromItems.length ? h('div', { class: 'hint' }, '아이템 쪽 드랍 테이블에서 이 몬스터를 고른 것 (함께 적용): ',
        fromItems.map(([k, t]) => h('a', { href: '#', style: { marginRight: '8px' }, onclick: e => { e.preventDefault(); PDM.tabs.open(k); } }, t))) : null);
  };

  const summary = rows => (rows || []).filter(r => r.item).map(r => `${itemName(r.item)} ${r.chance}%`).join(', ');
  PDM.registerEditor({
    id: 'loot', icon: '🎲', title: () => '드랍 테이블',
    match: k => k === 'loot',
    watch: ck => ck === 'project' || ck === 'gameitems' || ck.startsWith('char:') || ck.startsWith('item:'),
    tree: () => store.isOpen ? [{ id: 'loot', label: '드랍 테이블', icon: '🎲', open: 'loot', order: 31 }] : [],
    render(key, ctx) {
      const { F, section, row } = PDM.ui;
      const p = store.get('project') || {};
      const loot = p.loot || {};
      const st = ctx.state = ctx.state || {};
      const mobs = store.all('char').filter(c => ['mob', 'boss'].includes(c.kind));
      const ensure = k => store.edit('project', '상자 드랍 테이블', o => { o.loot = o.loot || {}; o.loot[k] = o.loot[k] || { mode: 'add', pick: 'each', rows: [] }; });
      return h('div', { class: 'editor' },
        h('h2', {}, '드랍 테이블'),
        h('p', { class: 'hint' }, '몬스터와 상자류에서 어떤 아이템이 얼마의 확률로 나오는지 정합니다. 아이템 쪽에서 정하려면 아이템 편집 화면의 "드랍 테이블"을 쓰세요 (둘 다 함께 적용됩니다).'),
        section('상자류 (게임이 층을 만들 때 놓는 것)',
          h('p', { class: 'hint' }, '맵에 직접 놓은 상자(맵 오브젝트 "아이템"의 "담는 방식")는 여기 표의 영향을 받지 않고, 놓은 아이템이 그대로 들어갑니다. 열쇠·퀘스트 아이템은 "바꾸기"에서도 남깁니다.'),
          Object.entries(PDM.LOOT_CONTAINERS).map(([k, info]) => {
            const t = loot[k];
            const open = st.open === k;
            const head = h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', cursor: 'pointer', padding: '6px 0' }, onclick: () => { st.open = open ? null : k; if (!t) ensure(k); else ctx.refresh(); } },
              h('b', {}, `${open ? '▾' : '▸'} ${info.icon} ${info.name}`), h('span', { class: 'hint' }, t && (t.rows || []).length ? `${t.mode === 'replace' ? '바꾸기' : '추가'} · ${summary(t.rows)}` : info.desc + ' — ' + (PDM.gameHeapText(k) || '').split('.')[0]));
            if (!open || !t) return h('div', { style: { borderTop: '1px solid var(--line)' } }, head);
            const one = t.pick === 'one';
            return h('div', { style: { borderTop: '1px solid var(--line)', paddingBottom: '8px' } }, head,
              row(F.select('project', ['loot', k, 'mode'], { add: '게임이 넣는 내용물에 추가', replace: '게임이 넣는 내용물 대신 (바꾸기)' }, { label: '적용 방식', rerender: true }),
                F.select('project', ['loot', k, 'pick'], { each: '줄마다 따로 확률을 굴림 (여러 개 나올 수 있음)', one: '하나만 뽑음 (가중치 비율대로)' }, { label: '뽑는 방식', rerender: true })),
              h('p', { class: 'hint' }, one ? '가중치가 클수록 잘 나옵니다. 예: 30 · 10 · 10 → 60% · 20% · 20%.' : '줄마다 확률(%)을 따로 굴립니다. 하나도 뽑히지 않은 상자는 원래 내용물 그대로 둡니다.'),
              PDM.lootRows('project', ['loot', k, 'rows'], { depth: true, weight: one, emptyText: '아이템 없음 — 게임이 넣는 내용물 그대로 (아래 설명)' }),
              PDM.gameHeapBox(k));
          })),
        section('몬스터',
          mobs.length ? h('table', { class: 'tbl', style: { width: '100%' } },
            h('tr', {}, h('th', { style: { textAlign: 'left' } }, '몬스터'), h('th', { style: { textAlign: 'left' } }, '드랍'), h('th', {}, '')),
            mobs.map(c => {
              const mine = summary(c.drops), other = (PDM.dropsFrom ? PDM.dropsFrom(c.id) : []).map(x => x[1]).join(', ');
              const open = st.mob === c.id;
              return [h('tr', {},
                h('td', {}, `${c.name} (${c.id})` + (c.kind === 'boss' ? ' · 보스' : '')),
                (() => { const td = h('td', { class: 'hint' }, [mine, other].filter(Boolean).join(', ') || (c.noGameLoot ? '없음' : ''), c.noGameLoot && (mine || other) ? ' · 게임 전리품 없음' : '');
                  if (!c.noGameLoot) { const g = h('span', {}, (mine || other ? ' + ' : '') + (c.game ? '게임: …' : '')); td.append(g); if (c.game) PDM.gameMobLoot(c.game).then(t => { g.textContent = (mine || other ? ' + ' : '') + '게임: ' + (t || '없음'); }); else if (!(mine || other)) g.textContent = '없음'; }
                  return td; })(),
                h('td', { style: { textAlign: 'right', whiteSpace: 'nowrap' } },
                  h('button', { class: 'btn sm' + (open ? ' pri' : ''), onclick: () => { st.mob = open ? null : c.id; ctx.refresh(); } }, open ? '접기' : '편집'),
                  h('button', { class: 'btn sm', style: { marginLeft: '4px' }, onclick: () => PDM.tabs.open('char:' + c.id) }, '캐릭터 열기'))),
              open ? h('tr', {}, h('td', { colspan: 3 },
                F.bool('char:' + c.id, ['noGameLoot'], { label: '게임 코드의 전리품을 떨어뜨리지 않음', rerender: true }),
                PDM.charLootEditor('char:' + c.id, c))) : null];
            })) : h('p', { class: 'hint' }, '몬스터·보스 캐릭터가 없습니다. 캐릭터 목록에서 몬스터를 만들거나 게임 몬스터를 가져오면 여기에 나옵니다.')));
    }
  });
})();
