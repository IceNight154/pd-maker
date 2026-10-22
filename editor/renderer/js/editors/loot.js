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
        fromItems.map(([k, t]) => h('a', { href: '#', class: 'mr-4', onclick: e => { e.preventDefault(); PDM.tabs.open(k); } }, t))) : null);
  };

  const summary = rows => (rows || []).filter(r => r.item).map(r => `${itemName(r.item)} ${r.chance}%`).join(', ');
  PDM.registerEditor({
    id: 'loot', icon: '🎲', title: () => '드랍 테이블',
    match: k => k === 'loot',
    watch: ck => ck === 'project' || ck === 'gameitems' || ck === 'world' || ck.startsWith('char:') || ck.startsWith('item:'),
    tree: () => store.isOpen ? [{ id: 'loot', label: '드랍 테이블', icon: '🎲', open: 'loot', order: 31 }] : [],
    render(key, ctx) {
      const { F, section, row } = PDM.ui;
      const p = store.get('project') || {};
      const loot = p.loot || {};
      const st = ctx.state = ctx.state || { page: 'chest' };
      const mobs = store.all('char').filter(c => PDM.isHostile(c.kind));
      const ensure = k => store.edit('project', '상자 드랍 테이블', o => { o.loot = o.loot || {}; o.loot[k] = o.loot[k] || { mode: 'add', pick: 'each', rows: [] }; });
      // 쪽: 상자류 · 몬스터 · 아이템 · 금화 (예전에는 한 화면에 상자류 · 몬스터만)
      const PAGES = { chest: '▣ 상자류', mob: '☠ 몬스터', item: '🎁 아이템', gold: '🪙 금화', theme: '🗺 테마별 몬스터' };
      const tabs = h('div', { class: 'btnbar loot-tabs' }, Object.entries(PAGES).map(([k, t]) => h('button', { class: 'btn sm' + (st.page === k ? ' pri' : ''), onclick: () => { st.page = k; ctx.refresh(); } }, t)));
      const page = st.page === 'mob' ? mobPage() : st.page === 'item' ? itemPage() : st.page === 'gold' ? goldPage() : st.page === 'theme' ? themePage() : chestPage();
      return h('div', { class: 'editor' },
        h('h2', {}, '드랍 테이블'),
        h('p', { class: 'hint' }, '어디서 무엇이 얼마의 확률로 나오는지 정합니다. 몬스터 쪽(그 몬스터가 떨어뜨리는 것)과 아이템 쪽(그 아이템이 나오는 곳)은 함께 적용됩니다.'),
        tabs, page);

      function chestPage() {
        return section('상자류 (게임이 층을 만들 때 놓는 것)',
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
          }));
      }

      function mobPage() {
        return section('몬스터 (그 몬스터가 죽을 때 떨어뜨리는 것)',
          mobs.length ? h('table', { class: 'tbl w-full' },
            h('tr', {}, h('th', { class: 'ta-left' }, '몬스터'), h('th', { class: 'ta-left' }, '드랍'), h('th', {}, '')),
            mobs.map(c => {
              const mine = summary(c.drops), other = (PDM.dropsFrom ? PDM.dropsFrom(c.id) : []).map(x => x[1]).join(', ');
              const open = st.mob === c.id;
              return [h('tr', {},
                h('td', {}, `${c.name} (${c.id})` + (c.kind === 'boss' ? ' · 보스' : '')),
                (() => { const td = h('td', { class: 'hint' }, [mine, other].filter(Boolean).join(', ') || (c.noGameLoot ? '없음' : ''), c.noGameLoot && (mine || other) ? ' · 게임 전리품 없음' : '');
                  if (!c.noGameLoot) { const g = h('span', {}, (mine || other ? ' + ' : '') + (c.game ? '게임: …' : '')); td.append(g); if (c.game) PDM.gameMobLoot(c.game).then(t => { g.textContent = (mine || other ? ' + ' : '') + '게임: ' + (t || '없음'); }); else if (!(mine || other)) g.textContent = '없음'; }
                  return td; })(),
                h('td', { class: 'ta-right nowrap' },
                  h('button', { class: 'btn sm' + (open ? ' pri' : ''), onclick: () => { st.mob = open ? null : c.id; ctx.refresh(); } }, open ? '접기' : '편집'),
                  h('button', { class: 'btn sm', onclick: () => PDM.tabs.open('char:' + c.id) }, '캐릭터 열기'))),
              open ? h('tr', {}, h('td', { colspan: 3 },
                F.bool('char:' + c.id, ['noGameLoot'], { label: '게임 코드의 전리품을 떨어뜨리지 않음', rerender: true }),
                PDM.charLootEditor('char:' + c.id, c))) : null];
            })) : h('p', { class: 'hint' }, '몬스터·보스 캐릭터가 없습니다. 캐릭터 목록에서 몬스터를 만들거나 게임 몬스터를 가져오면 여기에 나옵니다.'),
          h('p', { class: 'hint' }, '모든 몬스터의 금화는 "🪙 금화" 쪽에서 조절합니다.'));
      }

      // ---- 아이템 쪽: 그 아이템이 어디서 나오는지 (아이템의 drops · 게임 아이템은 gameitems.json) ----
      function itemPage() {
        const gi = (store.get('gameitems') || {}).items || {};
        const gname = ref => itemName(ref);
        const dsum = ds => (ds || []).map(d => d.src === 'floor' ? `층 바닥 ${d.chance}%` : `${(store.get('char:' + d.char) || {}).name || d.char || '?'} ${d.chance}%`).join(', ');
        const rowsAll = [
          ...store.all('item').map(it => ({ ref: it.id, name: `${it.name} (${it.id})`, skey: 'item:' + it.id, path: ['drops'], drops: it.drops || [], game: false })),
          ...Object.entries(gi).filter(([k, v]) => (v.drops || []).length || st.itemOpen === k).map(([k, v]) => ({ ref: k, name: `${gname(k)} — 게임 아이템`, skey: 'gameitems', path: ['items', k, 'drops'], drops: v.drops || [], game: true }))];
        const q = (st.itemQ || '').trim().toLowerCase();
        const shown = rowsAll.filter(r => (!q || r.name.toLowerCase().includes(q)) && (!st.itemOnly || r.drops.length));
        // 게임 아이템의 드랍 테이블 새로 만들기
        const addInp = h('input', { type: 'text', placeholder: '게임 아이템 — 눌러서 목록에서 고르기' });
        const addBtn = h('button', { class: 'btn sm', onclick: () => { const v = addInp.value.trim(); if (!v) return toast('아이템을 고르세요');
          if (!v.startsWith('spd:')) { if (store.has('item:' + v)) { st.itemOpen = v; ctx.refresh(); return; } return toast('목록에서 아이템을 고르세요', 'bad'); }
          store.edit('gameitems', '게임 아이템 드랍 테이블', r => { r.items = r.items || {}; const e = r.items[v] = r.items[v] || {}; e.drops = e.drops || []; if (!e.drops.length) e.drops.push({ src: 'mob', char: (mobs[0] || {}).id || '', chance: 10, min: 1, max: 1, cond: '' }); });
          st.itemOpen = v; } }, '드랍 테이블 만들기');
        const search = h('input', { type: 'text', value: st.itemQ || '', placeholder: '아이템 이름으로 찾기', style: { maxWidth: '260px' } });
        search.addEventListener('input', PDM.debounce(() => { st.itemQ = search.value; ctx.refresh(); }, 200));
        return section('아이템 (그 아이템이 어디서 나오는지 — 몬스터가 죽을 때 · 층 바닥)',
          h('p', { class: 'hint' }, '프로젝트 아이템은 모두 나오고, 게임 아이템은 드랍 테이블을 만든 것만 나옵니다. 몬스터 쪽에서 정한 드랍과 함께 적용됩니다.'),
          h('div', { class: 'btnbar' }, search,
            h('label', { class: 'check m-0' }, h('input', { type: 'checkbox', checked: !!st.itemOnly, onchange: e => { st.itemOnly = e.target.checked; ctx.refresh(); } }), '드랍이 있는 것만')),
          h('div', { class: 'btnbar' }, h('span', { class: 'hint' }, '게임 아이템 추가:'), h('div', { style: { flex: '1 1 260px', maxWidth: '360px' } }, PDM.ui.combo(addInp, PDM.ui.itemOptions)), addBtn),
          shown.length ? h('table', { class: 'tbl w-full' },
            h('tr', {}, h('th', { class: 'ta-left' }, '아이템'), h('th', { class: 'ta-left' }, '나오는 곳'), h('th', {}, '')),
            shown.map(r => {
              const open = st.itemOpen === r.ref;
              return [h('tr', {},
                h('td', {}, r.name),
                h('td', { class: 'hint' }, dsum(r.drops) || '없음'),
                h('td', { class: 'ta-right nowrap' },
                  h('button', { class: 'btn sm' + (open ? ' pri' : ''), onclick: () => { st.itemOpen = open ? null : r.ref; ctx.refresh(); } }, open ? '접기' : '편집'),
                  h('button', { class: 'btn sm', onclick: () => PDM.tabs.open(r.game ? 'spditem:' + r.ref.slice(4) : 'item:' + r.ref) }, '아이템 열기'))),
              open ? h('tr', {}, h('td', { colspan: 3 }, PDM.itemDropsEditor(r.skey, r.path))) : null];
            })) : h('p', { class: 'hint' }, '맞는 아이템이 없습니다.'));
      }

      // ---- 테마별 몬스터: 그 테마의 맵에서 생기는 몬스터 (런타임 MakerDrops.themeMob — Level.createMob 연결 줄) ----
      function themePage() {
        const all = p.themeMobs || {}, opts = PDM.mobRefOptions();
        const nameOf = r => (opts.find(o => o[0] === r) || [r, r])[1];
        const ensureT = th => store.edit('project', '테마별 몬스터', o => { o.themeMobs = o.themeMobs || {}; o.themeMobs[th] = o.themeMobs[th] || { on: true, chance: 100, mobs: [] }; });
        const floorsOf = th => (PDM.THEMES[th] || {}).floors;
        // 게임 목록 가져오기: 그 테마 깊이들의 MobSpawner 목록을 합쳐 무게로
        const fromGame = async th => {
          const f = floorsOf(th); if (!f) return;
          const cnt = {};
          for (let d = f[0]; d < f[1]; d++) { const r = await PDM.gameRotation(d); (r && r.list || []).forEach(x => { cnt[x.cls] = (cnt[x.cls] || 0) + x.n; }); }
          if (!Object.keys(cnt).length) { toast('게임 저장소의 MobSpawner.java 를 읽지 못했습니다', 'bad'); return; }
          store.edit('project', '테마별 몬스터: 게임 목록 가져오기', o => { o.themeMobs = o.themeMobs || {}; const t = o.themeMobs[th] = o.themeMobs[th] || { on: true, chance: 100 }; t.mobs = Object.entries(cnt).map(([c, n]) => ({ ref: 'spd:' + c, weight: n })); });
        };
        return section('테마별 몬스터 (그 테마의 맵에서 저절로 생기는 몬스터)',
          h('p', { class: 'hint' }, '맵 그래프에서 노드 · 그룹의 "테마"가 이 테마인 맵(테마를 비우면 깊이 기본: 1~5 하수도 · 6~10 감옥 …)에서 게임이 몬스터를 만들 때 이 목록에서 무게대로 뽑습니다. 확률 100% = 이 목록만, 50% = 반은 게임 기본 몬스터. 사용자 테마에 목록이 없으면 바탕 테마의 목록을 씁니다. 직접 그리기 맵의 "몬스터 스폰" 목록이 있으면 그것이 먼저입니다. 맵에 직접 놓은 몬스터 · 보스 층은 그대로.'),
          PDM.ui.refOptions('theme').map(([th, label]) => {
            const t = all[th], open = st.theme === th, n = t && (t.mobs || []).length;
            const sum = !n ? '게임 기본' : (t.on === false ? '꺼짐 · ' : '') + `${t.chance ?? 100}% · ` + t.mobs.slice(0, 5).map(m => `${nameOf(m.ref)}×${m.weight ?? 1}`).join(', ') + (t.mobs.length > 5 ? ' …' : '');
            const head = h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', cursor: 'pointer', padding: '6px 0' }, onclick: () => { st.theme = open ? null : th; if (!t) ensureT(th); else ctx.refresh(); } },
              h('b', {}, `${open ? '▾' : '▸'} ${label}`), h('span', { class: 'hint' }, sum));
            if (!open || !t) return h('div', { style: { borderTop: '1px solid var(--line)' } }, head);
            const P = ['themeMobs', th], f = floorsOf(th);
            return h('div', { style: { borderTop: '1px solid var(--line)', paddingBottom: '8px' } }, head,
              row(F.bool('project', [...P, 'on'], { label: '사용', def: true, rerender: true }),
                F.num('project', [...P, 'chance'], { label: '이 목록에서 뽑을 확률 (%)', min: 0, max: 100, step: 5, def: 100, rerender: true }),
                F.num('project', [...P, 'depthMin'], { label: '깊이 최소 (0 = 제한 없음)', int: true, min: 0, def: 0 }),
                F.num('project', [...P, 'depthMax'], { label: '깊이 최대 (0 = 제한 없음)', int: true, min: 0, def: 0 })),
              PDM.ui.listEditor('project', [...P, 'mobs'], { addLabel: '몬스터 추가', compact: true, emptyText: '몬스터 없음 — 게임 기본 그대로',
                make: () => ({ ref: (opts[0] || [''])[0], weight: 1 }),
                render: (it, i, ip) => row(F.select('project', [...ip, 'ref'], opts.some(o => o[0] === it.ref) ? opts : [[it.ref, it.ref + ' (목록에 없음)'], ...opts], { label: '몬스터', rerender: true }),
                  F.num('project', [...ip, 'weight'], { label: '무게', int: true, min: 0, def: 1, rerender: true })) }),
              h('div', { class: 'flex gap-3 wrap mt-3' },
                f ? h('button', { class: 'btn sm', title: `깊이 ${f[0]}~${f[1] - 1} 의 게임 몬스터 목록(MobSpawner)을 합쳐 채웁니다`, onclick: async () => { if (n && !(await PDM.ui.confirm('지금 목록을 게임 목록으로 바꿀까요?'))) return; fromGame(th); } }, '게임 목록 가져오기') : null,
                h('button', { class: 'btn sm danger', onclick: () => store.edit('project', '테마별 몬스터 지우기', o => { delete o.themeMobs[th]; st.theme = null; }) }, '이 테마 설정 지우기 (게임 기본으로)')),
              f ? PDM.gameSpawnBox(f[0]) : h('p', { class: 'hint' }, '사용자 테마 — 비워 두면 바탕 테마의 목록 (바탕 테마에도 없으면 게임 기본).'));
          }));
      }

      // ---- 금화: 게임이 만드는 금화 양 · 몬스터의 게임 금화 · 모든 몬스터의 추가 금화 (런타임 MakerDrops.goldAmount · goldDrop) ----
      function goldPage() {
        const g = (loot.gold || {}), x = g.extra || {};
        const P = ['loot', 'gold'];
        const d = Math.max(1, st.goldDepth || 5), mult = (g.mult ?? 100) / 100;
        const base = [30 + d * 10, 60 + d * 20].map(v => Math.round(v * mult));
        const ex = [x.min ?? 5, x.max ?? 15].map(v => Math.round(v + (x.perDepth || 0) * (d - 1)));
        const depthIn = h('input', { type: 'number', min: 1, max: 30, value: d, style: { width: '70px' } });
        depthIn.addEventListener('change', () => { st.goldDepth = +depthIn.value || 1; ctx.refresh(); });
        return h('div', {},
          section('게임이 만드는 금화',
            h('p', { class: 'hint' }, '게임은 금화 더미를 만들 때 깊이에 따라 30 + 깊이×10 ~ 60 + 깊이×20 개를 넣습니다 (층 바닥 · 몬스터 전리품 · 상자 모두). 여기서 그 양에 배율을 곱합니다.'),
            row(F.num('project', [...P, 'mult'], { label: '금화 양 배율 (%) — 100 = 게임 그대로, 0 = 금화 더미가 비어 나옴', int: true, min: 0, max: 1000, def: 100, rerender: true }),
              F.bool('project', [...P, 'noGame'], { label: '몬스터가 게임 코드대로 떨어뜨리는 금화 끄기 (놀 · 구울 · 브루트 등)' }))),
          section('모든 몬스터의 추가 금화',
            h('p', { class: 'hint' }, '적 몬스터가 죽을 때마다 확률로 금화를 더 떨어뜨립니다 (게임 금화와 따로). 양 = 최소~최대 + 깊이마다 늘어나는 양 × (깊이 − 1), 보스는 배율을 곱합니다.'),
            F.bool('project', [...P, 'extra', 'on'], { label: '추가 금화 사용', rerender: true }),
            x.on ? h('div', {},
              row(F.num('project', [...P, 'extra', 'chance'], { label: '확률 (%)', min: 0, max: 100, step: 0.1, dec: 1, def: 30, rerender: true }),
                F.num('project', [...P, 'extra', 'min'], { label: '양 최소', int: true, min: 0, def: 5, rerender: true }),
                F.num('project', [...P, 'extra', 'max'], { label: '양 최대', int: true, min: 0, def: 15, rerender: true }),
                F.num('project', [...P, 'extra', 'perDepth'], { label: '깊이마다 + (개)', min: 0, step: 0.5, def: 3, rerender: true }),
                F.num('project', [...P, 'extra', 'boss'], { label: '보스 배율 (×)', min: 0, step: 0.5, def: 5, rerender: true })),
              F.cond('project', [...P, 'extra', 'cond'], { label: '조건 (선택 — 예: switch.gold_rush)' })) : null),
          section('미리 계산',
            h('div', { class: 'btnbar' }, h('span', { class: 'hint' }, '깊이'), depthIn),
            h('p', {}, `게임 금화 더미: ${base[0]} ~ ${base[1]}개` + (g.noGame ? ' (몬스터 전리품에서는 나오지 않음)' : '')),
            x.on ? h('p', {}, `추가 금화: ${x.chance ?? 30}% 확률로 ${ex[0]} ~ ${Math.max(ex[0], ex[1])}개 · 보스 ${Math.round(ex[0] * (x.boss ?? 5))} ~ ${Math.round(Math.max(ex[0], ex[1]) * (x.boss ?? 5))}개`) : h('p', { class: 'hint' }, '추가 금화 꺼짐')));
      }
    }
  });
})();
