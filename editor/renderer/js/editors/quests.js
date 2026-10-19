// ================================================================
//  퀘스트 — 확장 기능 "quests" (기본 꺼짐)
//    quests.json { list: [ { id, name, desc, giver, turnIn, cond, auto, repeat, remind,
//      objectives: [ { type: kill | collect | reach | talk | cond, target, count, take, cond, text } ],
//      rewards: { gold, exp, items: [ { item, count } ] }, acceptEvent, doneEvent } ] }   — 런타임 MakerQuests
//    NPC(주는 캐릭터)에게 말을 걸면 수주 창이 뜨고, 목표를 채운 뒤 다시 말을 걸면 보상 창이 뜸.
//    이벤트 명령 "퀘스트" · "퀘스트 목록 창 열기", 조건식 quest.<id> (0 없음 · 1 진행 중 · 2 목표 달성 · 3 완료), quest.<id>.active / .ready / .done
// ================================================================
(function () {
  const { h, store } = PDM;
  const K = 'quests';
  const list = () => (store.get(K) || {}).list || [];
  const OBJ = { kill: '몬스터 처치', collect: '아이템 모으기', reach: '맵에 도착', talk: '캐릭터와 대화', cond: '조건 달성 (조건식)' };
  function make(id) { return { id, name: '새 퀘스트', desc: '', giver: '', turnIn: '', cond: '', auto: false, repeat: false, remind: true, objectives: [{ type: 'kill', target: '', count: 3, text: '' }], rewards: { gold: 50, exp: 0, items: [] }, acceptEvent: '', doneEvent: '' }; }
  const ops = PDM.listOps({ K, label: '퀘스트', title: '퀘스트', icon: '📜', prefix: 'quest', make, cmdType: 'quest', cmdKey: 'id' });
  PDM.quests = { K, make, ops, list };

  /** 아이템 고르는 칸 (프로젝트 아이템 + 게임 아이템 spd:…) */
  function itemInput(value, onChange) {
    const i = h('input', { type: 'text', value: value || '', placeholder: '아이템 고르기 (눌러서 목록)', style: { minWidth: '0', flex: '2 1 160px' } });
    i.addEventListener('change', () => onChange(i.value.trim()));
    return PDM.ui.combo(i, () => PDM.ui.itemOptions());
  }
  PDM.itemInput = itemInput;
  const sel = (opts, value, onChange, style) => { const s = h('select', { style: style || {} }, ...opts.map(([v, l]) => h('option', { value: v, selected: String(v) === String(value || '') }, l))); s.onchange = () => onChange(s.value); return s; };
  const num = (value, onChange, min, w) => { const i = h('input', { type: 'number', value: value ?? 0, min: min ?? 0, style: { width: (w || 64) + 'px' } }); i.onchange = () => onChange(Math.max(min ?? 0, i.value | 0)); return i; };

  PDM.registerEditor({
    id: K, icon: '📜', title: () => '퀘스트',
    match: k => k === K,
    tree: () => store.isOpen ? [ops.treeNode(57)] : [],
    render(key, ctx) {
      const { F, row, section } = PDM.ui;
      const st = ctx.state = ctx.state || {};
      const all = list();
      ops.take(st);
      if (!all.some(q => q.id === st.id)) st.id = (all[0] || {}).id;
      const chars = PDM.ui.refOptions('char'), nodes = PDM.ui.refOptions('node');
      const mobs = [['', '(아무 적이나)'], ...store.all('char').filter(c => ['mob', 'boss'].includes(c.kind)).map(c => [c.id, `${c.name} (${c.id})`])];
      const cards = all.map((q, qi) => {
        const P = ['list', qi], open = st.id === q.id;
        const ed = (lbl, fn, rr) => store.edit(K, lbl, r => fn(r.list[qi]), rr === false ? { silent: true } : undefined);
        const head = h('div', { class: 'hstack gap-4 pointer', onclick: () => { st.id = open ? null : q.id; ctx.refresh(); } },
          h('span', {}, open ? '▾' : '▸'), h('b', {}, q.name || q.id), h('span', { class: 'hint mono' }, q.id),
          h('span', { class: 'hint' }, `${q.giver ? '주는 캐릭터: ' + PDM.refName('char', q.giver) : '이벤트 명령으로 수주'} · 목표 ${(q.objectives || []).length}개` + (q.auto ? ' · 자동 완료' : '') + (q.repeat ? ' · 반복' : '')));
        if (!open) return h('div', { id: 'quest-' + q.id, style: { border: '1px solid var(--line)', borderRadius: '8px', padding: '8px 10px', marginBottom: '6px' } }, head);
        // ---- 목표
        const objs = (q.objectives || []).map((o, oi) => {
          const eo = (fn, rr) => ed('퀘스트 목표', x => fn(x.objectives[oi]), rr);
          let target;
          if (o.type === 'kill') { const cur = mobs.some(m => m[0] === (o.target || '')); const t = h('input', { type: 'text', value: o.target || '', placeholder: '몬스터 (비우면 아무 적이나) — 캐릭터 id 또는 게임 몬스터 클래스 이름 (예: Rat)', style: { flex: '2 1 160px', minWidth: 0 } });
            t.onchange = () => eo(x => { x.target = t.value.trim(); }, false);
            target = [sel(cur ? mobs : [...mobs, [o.target, o.target + ' (게임 몬스터)']], o.target, v => eo(x => { x.target = v; }), { flex: '1 1 120px', minWidth: 0 }), t]; }
          else if (o.type === 'collect') target = [itemInput(o.target, v => eo(x => { x.target = v; }, false)), h('label', { class: 'check', title: '보고할 때 그 아이템을 가져갑니다' }, (() => { const c = h('input', { type: 'checkbox', checked: o.take !== false }); c.onchange = () => eo(x => { x.take = c.checked; }, false); return c; })(), '보고할 때 가져감')];
          else if (o.type === 'reach') target = [sel([['', '(맵 고르기)'], ...nodes], o.target, v => eo(x => { x.target = v; }, false), { flex: '2 1 160px', minWidth: 0 })];
          else if (o.type === 'talk') target = [sel([['', '(캐릭터 고르기)'], ...chars], o.target, v => eo(x => { x.target = v; }, false), { flex: '2 1 160px', minWidth: 0 })];
          else { const t = h('input', { type: 'text', class: 'mono', value: o.cond || '', placeholder: '예: switch.boss_down · var.herbs>=5 · hero.lvl>=5', style: { flex: '2 1 160px', minWidth: 0 } }); const m = h('small', { class: 'hint' });
            const chk = () => { const e = PDM.Cond && PDM.Cond.check ? PDM.Cond.check(t.value) : ''; m.textContent = e ? '⚠ ' + e : ''; }; t.oninput = chk; t.onchange = () => eo(x => { x.cond = t.value.trim(); }, false); chk(); target = [t, m]; }
          const tx = h('input', { type: 'text', value: o.text || '', placeholder: '목표 글 (비우면 자동: "○○ 처치" 등)', style: { flex: '2 1 140px', minWidth: 0 } }); tx.onchange = () => eo(x => { x.text = tx.value; }, false);
          return h('div', { class: 'hstack gap-2 wrap mb-2' },
            sel(Object.entries(OBJ), o.type, v => eo(x => { x.type = v; x.target = ''; }), { flex: '0 0 150px' }), ...target,
            o.type === 'kill' || o.type === 'collect' ? h('span', { class: 'hint' }, '×') : null, o.type === 'kill' || o.type === 'collect' ? num(o.count ?? 1, v => eo(x => { x.count = v; }, false), 1, 56) : null,
            tx, h('button', { class: 'btn xs', title: '이 목표 빼기', onclick: () => ed('목표 삭제', x => { x.objectives.splice(oi, 1); }) }, '×'));
        });
        // ---- 보상 아이템
        const rw = q.rewards || {};
        const ritems = (rw.items || []).map((e, ei) => h('div', { class: 'hstack gap-2 mb-2' },
          itemInput(e.item, v => ed('보상 아이템', x => { x.rewards.items[ei].item = v; }, false)), h('span', { class: 'hint' }, '×'), num(e.count ?? 1, v => ed('보상 개수', x => { x.rewards.items[ei].count = v; }, false), 1, 56),
          h('button', { class: 'btn xs', onclick: () => ed('보상 아이템 삭제', x => { x.rewards.items.splice(ei, 1); }) }, '×')));
        return h('div', { id: 'quest-' + q.id, class: 'selcard' }, head,
          h('div', { class: 'mt-4' },
            row(F.text(K, [...P, 'name'], { label: '이름', rerender: true }), F.ref(K, [...P, 'giver'], 'char', { label: '주는 캐릭터 (말을 걸면 수주 창)', empty: '(없음 — 이벤트 명령으로만)', rerender: true }),
              F.ref(K, [...P, 'turnIn'], 'char', { label: '보고할 캐릭터', empty: '(주는 캐릭터와 같음)' })),
            F.textarea(K, [...P, 'desc'], { label: '설명 (수주 창에 나오는 글)', rows: 3 }),
            F.cond(K, [...P, 'cond'], { label: '받을 수 있는 조건 (비우면 언제나)', placeholder: '예: hero.lvl>=3 && quest.q1.done' }),
            h('div', { class: 'fl mt-3' }, '목표 (모두 채우면 달성)'), ...objs,
            h('button', { class: 'btn xs add', onclick: () => ed('목표 추가', x => { x.objectives = x.objectives || []; x.objectives.push({ type: 'kill', target: '', count: 1, text: '' }); }) }, '+ 목표 추가'),
            h('div', { class: 'fl mt-5' }, '보상'),
            row(F.num(K, [...P, 'rewards', 'gold'], { label: '금화', int: true, min: 0, def: 0 }), F.num(K, [...P, 'rewards', 'exp'], { label: '경험치', int: true, min: 0, def: 0 })),
            ...ritems, h('button', { class: 'btn xs add', onclick: () => ed('보상 아이템 추가', x => { x.rewards = x.rewards || {}; x.rewards.items = x.rewards.items || []; x.rewards.items.push({ item: '', count: 1 }); }) }, '+ 보상 아이템 추가'),
            h('div', { class: 'fl mt-5' }, '진행'),
            row(F.bool(K, [...P, 'auto'], { label: '목표를 채우면 바로 완료 (보고 없이 보상)', rerender: true }), F.bool(K, [...P, 'repeat'], { label: '완료한 뒤에도 다시 받을 수 있음', rerender: true }),
              F.bool(K, [...P, 'remind'], { label: '진행 중에 주는 캐릭터에게 말을 걸면 진행 상황 창', def: true })),
            (() => { const mv = q.move || {}; const on = h('input', { type: 'checkbox', checked: !!mv.on });
              on.onchange = () => ed('완료하면 이주', x => { x.move = Object.assign({ char: '', node: '', x: 0, y: 0 }, x.move || {}, { on: on.checked }); });
              return h('div', { style: { border: '1px dashed var(--line)', borderRadius: '6px', padding: '6px 8px', margin: '6px 0' } },
                h('label', { class: 'check' }, on, h('b', {}, '완료하면 NPC 이주'), h('span', { class: 'hint ml-3' }, '퀘스트를 완료하는 순간 캐릭터가 지정한 맵의 지정한 칸으로 옮겨 가서 삽니다')),
                mv.on ? row(F.ref(K, [...P, 'move', 'char'], 'char', { label: '이주할 캐릭터', empty: '(주는 캐릭터)' }), F.ref(K, [...P, 'move', 'node'], 'node', { label: '이주할 맵', empty: '(맵 고르기 — 비우면 사라짐)' }),
                  F.num(K, [...P, 'move', 'x'], { label: 'x', int: true, min: 0, def: 0 }), F.num(K, [...P, 'move', 'y'], { label: 'y', int: true, min: 0, def: 0 }),
                  h('div', { class: 'field' }, h('span', { class: 'fl' }, ' '), h('button', { class: 'btn sm', onclick: async () => { const r = await PDM.pickCell({ node: mv.node, x: mv.x, y: mv.y, title: 'NPC 가 살 칸 고르기' }); if (r) ed('이주할 칸', x => { x.move.node = r.node; x.move.x = Math.max(0, r.x); x.move.y = Math.max(0, r.y); }); } }, '🗺 맵에서 고르기…'))) : null,
                mv.on ? h('div', { class: 'hint' }, '"맵에서 고르기"로 맵의 타일과 놓인 것들을 보면서 칸을 고를 수 있습니다 (좌표는 왼쪽 위가 0, 0). 그 칸이 막혀 있으면 바로 옆 칸이나 입구 근처에 섭니다. 원래 놓여 있던 맵에서는 사라집니다. 이벤트에서 하려면 명령 "NPC 이주"를 쓰세요.') : null); })(),
            row(F.ref(K, [...P, 'acceptEvent'], 'event', { label: '수락했을 때 실행할 이벤트 (선택)', empty: '(없음)' }), F.ref(K, [...P, 'doneEvent'], 'event', { label: '완료했을 때 실행할 이벤트 (선택)', empty: '(없음)' })),
            h('div', { class: 'hint' }, `조건식: quest.${q.id} (0 없음 · 1 진행 중 · 2 목표 달성 · 3 완료) · quest.${q.id}.active · quest.${q.id}.ready · quest.${q.id}.done`),
            h('div', { class: 'flex gap-3 mt-3' }, h('button', { class: 'btn xs', onclick: () => ops.rename(q.id) }, 'id 바꾸기'), h('button', { class: 'btn xs', onclick: () => ops.dup(q.id) }, '복제'),
              h('button', { class: 'btn xs', disabled: qi === 0, onclick: () => ops.move(q.id, -1) }, '↑'), h('button', { class: 'btn xs', disabled: qi === all.length - 1, onclick: () => ops.move(q.id, 1) }, '↓'),
              h('button', { class: 'btn xs danger', onclick: () => ops.remove(q.id) }, '삭제'))));
      });
      return h('div', { class: 'page' }, h('h1', {}, '📜 퀘스트'),
        h('p', { class: 'lead' }, 'NPC 에게 받아서 목표를 채우고 보상을 받는 퀘스트를 만듭니다.'),
        section(`퀘스트 (${all.length})`,
          h('p', { class: 'hint' }, '"주는 캐릭터"를 정하면 게임에서 그 캐릭터에게 말을 걸 때 수주 창(설명 · 목표 · 보상, 수락 / 거절)이 뜹니다. 목표를 모두 채우고 다시 말을 걸면(또는 "보고할 캐릭터"에게) 보상 창이 뜹니다. ' +
            '이벤트에서 직접 다루려면 명령 "퀘스트"(수주 창 · 바로 수락 · 완료 처리 · 포기)와 "퀘스트 목록 창 열기"를 씁니다. 진행 상태는 저장 파일에 함께 저장됩니다.'),
          ...cards, h('button', { class: 'btn sm add', onclick: () => ops.add() }, '+ 퀘스트 추가')));
    }
  });
})();
