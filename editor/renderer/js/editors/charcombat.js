// ================================================================
//  캐릭터 AI · 전투 편집기 (8차) — 탭 키 "combat:<캐릭터 id>" · 캐릭터 편집 화면의 "AI · 경로" 칸에서 엶
//    데이터 characters/<id>.json combat (형식 = js/aimodel.js 머리말). 고치기는 모두 store.edit (실행 취소 · 저장 표시 그대로)
//    왼쪽: 행동 목록 · 공격 목록 (추가 · 복제 · 삭제 · 순서 · 켜기) — 가운데: 고른 것의 설정 (접는 묶음 · 속성 찾기 · 범위 · 단위 · 기본값)
//    오른쪽: 시뮬레이터 — 가상의 대상 · 체력 · 거리 · 사건 · 재사용 대기를 넣으면 게임과 같은 규칙(PDM.aiModel = 런타임 MakerAIModel)으로
//            어떤 행동을 왜 고르는지(행동마다 이유) · 다음 턴(재사용 대기 · 이어지는 행동)을 보여 줌
//    combat 이 없는 캐릭터 = 원래 AI 그대로 (이 화면에서 "전투 설정 만들기" 를 눌러야 생김)
// ================================================================
(function () {
  const { h } = PDM, store = PDM.store;
  const M = () => PDM.aiModel;
  const ACTION_NAMES = { attack: '공격', approach: '다가가기 (쫓기)', retreat: '물러나기', keep: '거리 유지', flee: '도망', wander: '돌아다니기', patrol: '순찰 (처음 자리 둘레 4칸)', wait: '기다리기', heal: '회복 (자신)', protect: '아군 곁으로 (지키기)', say: '말하기', default: '원래 AI 에 맡기기' };
  const TARGET_NAMES = { enemy: '현재 적 (게임이 고른 적)', hero: '영웅', nearestEnemy: '가장 가까운 적', weakestEnemy: '체력 비율이 가장 낮은 적', weakestAlly: '체력 비율이 가장 낮은 아군', self: '자신' };
  const KEY_NAMES = { hp: '내 체력 (%)', targetHp: '대상 체력 (%)', dist: '대상과 거리 (칸)', visible: '대상이 보임', line: '투사체가 대상에 닿음', hasTarget: '대상이 있음', chance: '확률 (%)', turn: '게임 턴', event: '사건', allies: '보이는 아군 수', enemies: '보이는 적 수', status: '내 상태', targetStatus: '대상 상태', ready: '공격 준비됨 (재사용 대기 끝)' };
  const ON_NAMES = { '': '평소 (차례마다)', hit: '맞은 다음 차례', attacked: '공격한 다음 차례', targetLost: '대상을 놓친 차례', death: '쓰러질 때 (공격(범위) · 말하기)' };
  const EVENT_NAMES = { hit: '맞음', attacked: '공격함', targetLost: '대상을 놓침' };
  const STATUS_NAMES = { burning: '불탐', poison: '중독', slow: '느려짐', weak: '약화', cripple: '불구', bleed: '출혈', blind: '실명', vertigo: '어지러움', roots: '속박', frost: '냉기', paralysed: '마비 (상황에서만)' };
  const TYPE_NAMES = { melee: '근접', ranged: '원거리 (투사체)', area: '범위' };
  const FILTER_NAMES = { enemies: '적만', allies: '아군만', all: '모두' };
  const CMP_NAMES = { '<': '<', '<=': '≤', '>': '>', '>=': '≥', '==': '=', '!=': '≠' };
  /** 시작용 프로필 (원작에 없는 기능은 쓰지 않음 — 모두 MakerCombat 이 실제로 실행) */
  const PRESETS = {
    melee: { name: '근접형 — 다가가 베고, 체력이 낮으면 도망', make: () => ({ attacks: [{ id: 'slash', name: '베기', type: 'melee', range: 1, mult: 1 }],
      behaviors: [{ id: 'flee', name: '도망', priority: 100, when: { k: 'hp', cmp: '<=', v: 25 }, action: 'flee', cooldown: 0 }, { id: 'hit', name: '베기', priority: 50, action: 'attack', attack: 'slash' }, { id: 'chase', name: '쫓기', priority: 10, action: 'approach' }] }) },
    ranged: { name: '원거리 견제형 — 거리를 두며 쏘고, 붙으면 물러남', make: () => ({ attacks: [{ id: 'shot', name: '쏘기', type: 'ranged', range: 6, mult: 0.8, cooldown: 1 }, { id: 'jab', name: '찌르기', type: 'melee', range: 1, mult: 0.6 }],
      behaviors: [{ id: 'back', name: '물러나기', priority: 80, when: { k: 'dist', cmp: '<=', v: 2 }, action: 'retreat', chance: 70 }, { id: 'shoot', name: '쏘기', priority: 60, when: { op: 'and', items: [{ k: 'visible' }, { k: 'line' }] }, action: 'attack', attack: 'shot' },
        { id: 'jab', name: '찌르기', priority: 40, action: 'attack', attack: 'jab' }, { id: 'keep', name: '거리 유지', priority: 10, action: 'keep', dist: 4 }] }) },
    boss: { name: '보스형 — 준비 후 강타 · 범위 공격 · 맞으면 반격 콤보', make: () => ({ attacks: [{ id: 'smash', name: '강타', type: 'melee', range: 1, windup: 1, recovery: 1, mult: 2, knockback: 2, stun: 1 }, { id: 'quake', name: '땅울림', type: 'area', range: 3, radius: 2, mult: 0.7, cooldown: 6 }, { id: 'jab', name: '연속 찌르기', type: 'melee', range: 1, hits: 2, mult: 0.6 }],
      behaviors: [{ id: 'quake', name: '땅울림', priority: 70, when: { op: 'or', items: [{ k: 'enemies', cmp: '>=', v: 2 }, { k: 'hp', cmp: '<=', v: 50 }] }, action: 'attack', attack: 'quake' },
        { id: 'counter', name: '반격', priority: 60, on: 'hit', action: 'attack', attack: 'jab', next: 'smash' }, { id: 'smash', name: '강타', priority: 50, action: 'attack', attack: 'smash' }, { id: 'chase', name: '쫓기', priority: 10, action: 'approach' }] }) }
  };
  const uid = (list, base) => { let i = 1, id = base; const has = new Set(list.map(x => x && x.id)); while (has.has(id)) id = base + '_' + (++i); return id; };

  PDM.registerEditor({
    id: 'charcombat', icon: '⚔',
    match: k => k.startsWith('combat:'), needsResource: false,
    title: k => { const c = store.get('char:' + k.slice(7)); return 'AI · 전투 — ' + (c ? c.name : k.slice(7)); },
    watch: (ck, tk) => ck === 'char:' + tk.slice(7),
    tree: () => [],
    onActivate(key, ctx) { },
    render(key, ctx) {
      const id = key.slice(7), ck = 'char:' + id, c = store.get(ck);
      const st = ctx.state = ctx.state || { sel: { kind: 'b', i: 0 }, q: '', open: {}, sim: null };
      if (!c) return h('div', { class: 'page' }, h('div', { class: 'empty' }, `캐릭터 「${id}」 가 없습니다`));
      const cb = c.combat;
      const page = h('div', { class: 'page cc-page' });
      const head = h('div', { class: 'cc-head' },
        h('h1', {}, '⚔ AI · 전투 — ', h('span', {}, c.name)),
        h('button', { class: 'btn sm', onclick: () => PDM.tabs.open(ck) }, '← 캐릭터 설정'));
      page.append(head);
      if (!cb) {
        page.append(h('div', { class: 'cc-empty card' },
          h('p', {}, '이 캐릭터는 아직 전투 설정이 없어 게임의 원래 AI · 원래 공격으로 움직입니다.'),
          h('p', { class: 'hint' }, '전투 설정을 만들면 행동(조건 · 우선순위 · 재사용 대기)과 공격(근접 · 원거리 · 범위, 준비 · 회복 시간, 피해 배율, 밀치기 · 기절 · 상태)을 직접 정할 수 있습니다. 설정이 꺼져 있거나 검사 오류가 있으면 게임은 원래 AI 로 돌아갑니다.'),
          h('div', { class: 'btnbar' },
            ...Object.entries(PRESETS).map(([k, p]) => h('button', { class: 'btn sm' + (k === 'melee' ? ' pri' : ''), onclick: () => store.edit(ck, '전투 설정 만들기: ' + p.name, o => { o.combat = Object.assign({ version: 1, enabled: true, detect: 8 }, p.make()); }) }, '＋ ' + p.name)),
            h('button', { class: 'btn sm', onclick: () => store.edit(ck, '전투 설정 만들기 (빈 것)', o => { o.combat = { version: 1, enabled: true, detect: 8, behaviors: [], attacks: [] }; }) }, '＋ 빈 설정'))));
        return page;
      }
      const issues = M().validate(cb), errs = issues.filter(i => i.level === 'error');
      const dirty = store.dirtyKeys().includes(ck);
      const P = M().normalize(cb);
      head.append(h('div', { class: 'cc-status' },
        h('label', { class: 'check m-0', title: '끄면 게임은 원래 AI 로 움직입니다 (설정은 남음)' }, h('input', { type: 'checkbox', checked: cb.enabled !== false, onchange: e => store.edit(ck, e.target.checked ? '전투 설정 켜기' : '전투 설정 끄기', o => { o.combat.enabled = e.target.checked; }) }), h('span', {}, '게임에서 씀')),
        h('span', { class: 'badge' + (errs.length ? ' bad' : issues.length ? ' warn' : ' good'), title: issues.map(i => i.msg).join('\n') }, errs.length ? `오류 ${errs.length} — 게임은 원래 AI` : issues.length ? `주의 ${issues.length}` : '검사 통과'),
        h('span', { class: 'hint', title: 'Ctrl+S 로 저장 · Ctrl+Z / Ctrl+Y 실행 취소 · 다시 실행' }, dirty ? '● 저장 안 됨' : '저장됨'),
        h('label', { class: 'check m-0', title: '게임 로그에 차례마다 고른 행동과 이유를 남김 ([PDMaker] [AI] 줄)' }, h('input', { type: 'checkbox', checked: !!cb.debug, onchange: e => store.edit(ck, '전투 디버그 기록', o => { if (e.target.checked) o.combat.debug = true; else delete o.combat.debug; }) }), h('span', {}, '디버그 기록')),
        h('button', { class: 'btn xs danger', onclick: async () => { if (!(await PDM.ui.confirm(`「${c.name}」 의 전투 설정을 지울까요?\n게임은 원래 AI 로 움직입니다. (실행 취소로 되돌릴 수 있음)`))) return; store.edit(ck, '전투 설정 지우기', o => { delete o.combat; }); } }, '설정 지우기')));
      if (issues.length) page.append(h('div', { class: 'cc-issues', role: 'list' }, ...issues.map(i => h('button', { class: 'cc-issue ' + i.level, role: 'listitem', onclick: () => { const m = /^(behaviors|attacks)\.(\d+)/.exec(i.path); if (m) { st.sel = { kind: m[1] === 'attacks' ? 'a' : 'b', i: +m[2] }; ctx.refresh(); } } }, (i.level === 'error' ? '⛔ ' : '⚠ ') + i.msg))));
      const B = Array.isArray(cb.behaviors) ? cb.behaviors : [], A = Array.isArray(cb.attacks) ? cb.attacks : [];
      if (st.sel.kind === 'b' && !B[st.sel.i]) st.sel = B.length ? { kind: 'b', i: 0 } : A.length ? { kind: 'a', i: 0 } : { kind: 'b', i: -1 };
      if (st.sel.kind === 'a' && !A[st.sel.i]) st.sel = A.length ? { kind: 'a', i: 0 } : { kind: 'b', i: B.length ? 0 : -1 };
      // ---------------- 왼쪽: 목록
      const listOf = (kind, arr, label, make) => {
        const items = arr.map((x, i) => {
          const on = st.sel.kind === kind && st.sel.i === i, bad = issues.some(s => s.level === 'error' && s.path.startsWith(`${kind === 'b' ? 'behaviors' : 'attacks'}.${i}`));
          const n = kind === 'b' ? P.behaviors[i] : P.attacks[i];
          return h('div', { class: 'cc-li' + (on ? ' on' : '') + (bad ? ' bad' : '') + (kind === 'b' && x.enabled === false ? ' off' : ''), role: 'option', tabindex: '0', 'aria-selected': String(on), 'data-i': i, 'data-kind': kind,
            onclick: e => { if (e.target.closest('button,input')) return; st.sel = { kind, i }; ctx.refresh(); }, onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); st.sel = { kind, i }; ctx.refresh(); } } },
            kind === 'b' ? h('input', { type: 'checkbox', checked: x.enabled !== false, 'aria-label': '켜기', title: '켜기 / 끄기', onchange: e => store.edit(ck, '행동 켜기', o => { o.combat.behaviors[i].enabled = e.target.checked; }) }) : null,
            h('span', { class: 'cc-li-name' }, x.name || x.id || '(이름 없음)'),
            h('span', { class: 'cc-li-sub' }, kind === 'b' ? `${n.on ? '【' + (ON_NAMES[n.on] || n.on).split(' ')[0] + '】 ' : ''}${ACTION_NAMES[n.action] || n.action}${n.action === 'attack' && n.attack ? ' · ' + ((P.attacks.find(a => a.id === n.attack) || {}).name || n.attack) : ''} · 우선 ${n.priority}` : `${TYPE_NAMES[n.type]} · 사거리 ${n.range}${n.cooldown ? ' · 재사용 ' + n.cooldown : ''}`),
            h('span', { class: 'cc-li-btns' },
              h('button', { class: 'ib', title: '위로', 'aria-label': '위로', disabled: i === 0, onclick: () => store.edit(ck, '순서', o => { const L = kind === 'b' ? o.combat.behaviors : o.combat.attacks; [L[i - 1], L[i]] = [L[i], L[i - 1]]; st.sel = { kind, i: i - 1 }; }) }, '▲'),
              h('button', { class: 'ib', title: '아래로', 'aria-label': '아래로', disabled: i === arr.length - 1, onclick: () => store.edit(ck, '순서', o => { const L = kind === 'b' ? o.combat.behaviors : o.combat.attacks; [L[i + 1], L[i]] = [L[i], L[i + 1]]; st.sel = { kind, i: i + 1 }; }) }, '▼'),
              h('button', { class: 'ib', title: '복제', 'aria-label': '복제', onclick: async () => { if (!(await PDM.ui.confirm(`「${x.name || x.id}」 을 복제할까요?`))) return; store.edit(ck, '복제', o => { const L = kind === 'b' ? o.combat.behaviors : o.combat.attacks; const cp = PDM.clone(L[i]); cp.id = uid(L, (cp.id || 'x') + '_copy'); cp.name = (cp.name || '') + ' 사본'; L.splice(i + 1, 0, cp); st.sel = { kind, i: i + 1 }; }); } }, '⧉'),
              h('button', { class: 'ib danger', title: '삭제', 'aria-label': '삭제', onclick: async () => {
                const refs = kind === 'a' ? B.filter(b => b.attack === x.id).map(b => b.name || b.id) : B.filter(b => b.next === x.id || b.fail === x.id).map(b => b.name || b.id);
                if (!(await PDM.ui.confirm(`「${x.name || x.id}」 을 삭제할까요?${refs.length ? `\n이것을 쓰는 행동: ${refs.join(', ')} — 검사 오류가 됩니다 (게임은 원래 AI)` : ''}`))) return;
                store.edit(ck, '삭제', o => { (kind === 'b' ? o.combat.behaviors : o.combat.attacks).splice(i, 1); });
              } }, '✕')));
        });
        return h('div', { class: 'cc-list' },
          h('div', { class: 'cc-list-head' }, h('b', {}, `${label} (${arr.length})`), h('button', { class: 'btn xs', onclick: () => store.edit(ck, label + ' 추가', o => { const L = kind === 'b' ? (o.combat.behaviors = o.combat.behaviors || []) : (o.combat.attacks = o.combat.attacks || []); L.push(make(L)); st.sel = { kind, i: L.length - 1 }; }) }, '＋ 추가')),
          h('div', { role: 'listbox', 'aria-label': label }, ...items),
          !arr.length ? h('div', { class: 'hint' }, kind === 'b' ? '행동이 없으면 게임은 원래 AI 로 움직입니다.' : '공격이 없으면 "공격" 행동을 쓸 수 없습니다.') : null);
      };
      const left = h('div', { class: 'cc-left' },
        listOf('b', B, '행동', L => ({ id: uid(L, 'act'), name: '새 행동', priority: 0, action: 'approach' })),
        listOf('a', A, '공격', L => ({ id: uid(L, 'atk'), name: '새 공격', type: 'melee', range: 1, mult: 1 })),
        h('div', { class: 'cc-common' }, h('div', { class: 'fl' }, '공통'),
          fieldWrap('감지 거리', PDM.ui.F.num(ck, ['combat', 'detect'], { label: '감지 거리 (칸, 1~30, 기본 8)', int: true, min: 1, max: 30, def: 8 }), '이 거리 안의 보이는 캐릭터만 대상 · 적 수 · 아군 수로 셈')),
        h('p', { class: 'hint' }, '같은 우선순위끼리는 가중치로 고르고, 가중치도 같으면 목록 순서가 앞선 것부터 검사합니다.'));
      // ---------------- 가운데: 설정
      const center = h('div', { class: 'cc-center' });
      const search = h('input', { type: 'search', class: 'cc-q', placeholder: '속성 찾기 (예: 재사용 · 밀치기)', value: st.q || '', 'aria-label': '속성 찾기',
        oninput: e => { st.q = e.target.value; applyQ(center, st.q); } });
      center.append(search);
      if (st.sel.kind === 'b' && B[st.sel.i]) center.append(...behaviorForm(ck, st, st.sel.i, B[st.sel.i], P, ctx));
      else if (st.sel.kind === 'a' && A[st.sel.i]) center.append(...attackForm(ck, st, st.sel.i, A[st.sel.i], P));
      else center.append(h('div', { class: 'empty' }, '왼쪽에서 행동이나 공격을 고르세요'));
      applyQ(center, st.q);
      // ---------------- 오른쪽: 시뮬레이터
      const right = simulator(ck, st, cb, P, B, ctx);
      page.append(h('div', { class: 'cc-cols' }, left, center, right));
      page.append(h('p', { class: 'hint' }, '시간 단위는 모두 게임 턴입니다 (영웅이 한 칸 걷는 시간 = 1턴). 런타임이 지원하지 않는 것: 마나 · 기력 같은 자원(체력 소모만 지원), 회전 · 경로를 따라 휘는 투사체, 공격 동작의 프레임 단위 판정 (공격은 동작이 끝날 때 판정).'));
      return page;
    }
  });

  /** 입력칸 하나를 찾기 · 설명용으로 감쌈 */
  function fieldWrap(label, el, tip) {
    const w = h('div', { class: 'cc-f', 'data-q': label + ' ' + (tip || '') }, el);
    if (tip) w.title = tip;
    return w;
  }
  function applyQ(root, q) {
    q = String(q || '').trim().toLowerCase();
    root.querySelectorAll('.cc-f').forEach(f => { f.style.display = !q || f.dataset.q.toLowerCase().includes(q) ? '' : 'none'; });
    root.querySelectorAll('details.cc-sec').forEach(d => { if (q) d.open = [...d.querySelectorAll('.cc-f')].some(f => f.style.display !== 'none'); });
  }
  function sec(st, id, title, ...kids) {
    const open = st.open[id] !== false;
    const d = h('details', { class: 'cc-sec', open, ontoggle: e => { st.open[id] = e.target.open; } }, h('summary', {}, title), ...kids.filter(Boolean));
    return d;
  }
  const row = (...k) => h('div', { class: 'row' }, ...k.filter(Boolean));

  function behaviorForm(ck, st, i, b, P, ctx) {
    const { F } = PDM.ui, p = ['combat', 'behaviors', i], n = P.behaviors[i];
    const others = [['', '(없음)'], ...P.behaviors.filter((x, j) => j !== i && x.id).map(x => [x.id, `${x.name || x.id} (${x.id})`])];
    const atkOpts = P.attacks.filter(a => a.id).map(a => [a.id, `${a.name || a.id} (${TYPE_NAMES[a.type]})`]);
    return [
      sec(st, 'b-basic', '기본',
        row(fieldWrap('이름', F.text(ck, [...p, 'name'], { label: '이름', rerender: true })), fieldWrap('id', F.text(ck, [...p, 'id'], { label: 'id (이어지는 행동이 가리킴)', rerender: true }), '겹치면 검사 오류')),
        row(fieldWrap('우선순위', F.num(ck, [...p, 'priority'], { label: '우선순위 (−1000~1000, 높을수록 먼저, 기본 0)', min: -1000, max: 1000, def: 0, rerender: true }), '조건이 맞는 행동 중 우선순위가 가장 높은 것을 고름'),
          fieldWrap('언제', F.select(ck, [...p, 'on'], Object.entries(ON_NAMES), { label: '언제 검사', rerender: true }), '사건 행동은 그 사건이 있었던 차례에만 검사'))),
      sec(st, 'b-when', '조건 (AND / OR)', condEditor(ck, [...p, 'when'], b.when, P)),
      sec(st, 'b-do', '할 일',
        row(fieldWrap('동작', F.select(ck, [...p, 'action'], Object.entries(ACTION_NAMES), { label: '동작', rerender: true })),
          fieldWrap('대상', F.select(ck, [...p, 'target'], Object.entries(TARGET_NAMES), { label: '대상', rerender: true }), '감지 거리 안 · 보이는 캐릭터 중에서')),
        n.action === 'attack' ? fieldWrap('공격', F.select(ck, [...p, 'attack'], atkOpts, { label: '쓸 공격', empty: '(고르세요)', rerender: true }), '사거리 · 재사용 대기 · 투사체가 닿는지 · 체력 소모도 검사') : null,
        n.action === 'keep' ? fieldWrap('거리', F.num(ck, [...p, 'dist'], { label: '유지할 거리 (칸, 1~20, 기본 3)', int: true, min: 1, max: 20, def: 3 })) : null,
        n.action === 'heal' ? fieldWrap('회복량', F.num(ck, [...p, 'amount'], { label: '회복량 (체력, 0~9999, 기본 5)', int: true, min: 0, max: 9999, def: 5 })) : null,
        n.action === 'say' || n.on === 'death' ? fieldWrap('말', F.text(ck, [...p, 'say'], { label: '머리 위에 띄울 말' })) : null),
      sec(st, 'b-time', '시간 · 확률',
        row(fieldWrap('재사용 대기', F.num(ck, [...p, 'cooldown'], { label: '재사용 대기 (턴, 0~1000, 기본 0)', min: 0, max: 1000, def: 0, rerender: true }), '한 번 고른 뒤 이 턴이 지나야 다시 고름'),
          fieldWrap('대기', F.num(ck, [...p, 'delay'], { label: '행동 뒤 대기 (턴, 0~20, 기본 0)', min: 0, max: 20, def: 0, rerender: true }), '행동을 한 뒤 이만큼 턴을 더 씀 (다음 행동까지 사이)')),
        row(fieldWrap('확률', F.num(ck, [...p, 'chance'], { label: '확률 (%, 0~100, 기본 100)', min: 0, max: 100, def: 100 }), '조건이 맞아도 이 확률로만'),
          fieldWrap('가중치', F.num(ck, [...p, 'weight'], { label: '가중치 (0~1000, 기본 1)', min: 0, max: 1000, def: 1 }), '같은 우선순위의 행동이 여럿 통과하면 가중치 비율로 하나'))),
      sec(st, 'b-flow', '이어지는 행동 · 끊김',
        row(fieldWrap('성공 뒤', F.select(ck, [...p, 'next'], others, { label: '성공 뒤 이어서', rerender: true }), '다음 차례에 이 행동을 우선순위와 상관없이 먼저 검사 (콤보)'),
          fieldWrap('실패 뒤', F.select(ck, [...p, 'fail'], others, { label: '실패 뒤 (대상이 없어짐 · 사거리 밖 · 막힘)', rerender: true }), '실패했을 때 다음 차례에 먼저 검사')),
        fieldWrap('끊김', F.bool(ck, [...p, 'interrupt'], { label: '준비 중에 맞으면 끊김 (공격의 준비 시간이 있을 때)' }), '끊기면 실패 뒤 행동으로'))
    ];
  }
  function attackForm(ck, st, i, a, P) {
    const { F } = PDM.ui, p = ['combat', 'attacks', i], n = P.attacks[i];
    return [
      sec(st, 'a-basic', '기본',
        row(fieldWrap('이름', F.text(ck, [...p, 'name'], { label: '이름', rerender: true })), fieldWrap('id', F.text(ck, [...p, 'id'], { label: 'id', rerender: true }))),
        row(fieldWrap('종류', F.select(ck, [...p, 'type'], Object.entries(TYPE_NAMES), { label: '종류', rerender: true })),
          fieldWrap('사거리', F.num(ck, [...p, 'range'], { label: `사거리 (칸, 1~20, 기본 ${n.type === 'melee' ? 1 : 4})`, int: true, min: 1, max: 20, def: n.type === 'melee' ? 1 : 4 }), '대상과 거리가 이보다 멀면 쓰지 않음'),
          n.type === 'area' ? fieldWrap('범위', F.num(ck, [...p, 'radius'], { label: '범위 반지름 (칸, 0~6, 기본 1)', int: true, min: 0, max: 6, def: 1 }), '대상 칸 둘레 — 범위 공격은 명중 판정 없이 맞음') : null)),
      sec(st, 'a-time', '시간 (턴)',
        row(fieldWrap('준비', F.num(ck, [...p, 'windup'], { label: '준비 (턴, 0~10, 기본 0)', min: 0, max: 10, def: 0 }), '머리 위 "!" 를 띄우고 이만큼 기다린 뒤 공격 — 그동안 피할 수 있음'),
          fieldWrap('공격', h('div', { class: 'field' }, h('span', { class: 'fl' }, '공격 (턴)'), h('span', { class: 'hint' }, '1 (고정)'))),
          fieldWrap('회복', F.num(ck, [...p, 'recovery'], { label: '회복 (턴, 0~10, 기본 0)', min: 0, max: 10, def: 0 }), '공격 뒤 움직이지 못하는 시간'),
          fieldWrap('재사용 대기', F.num(ck, [...p, 'cooldown'], { label: '재사용 대기 (턴, 0~100, 기본 0)', min: 0, max: 100, def: 0 })))),
      sec(st, 'a-dmg', '피해 · 명중',
        row(fieldWrap('배율', F.num(ck, [...p, 'mult'], { label: '피해 배율 (0~20, 기본 1)', min: 0, max: 20, step: 0.1, def: 1 }), '피해 = 반올림(캐릭터 공격력(능력치의 공격 최소~최대) × 배율 + 더하기) − 대상 방어'),
          fieldWrap('더하기', F.num(ck, [...p, 'flat'], { label: '피해 더하기 (−999~999, 기본 0)', int: true, min: -999, max: 999, def: 0 })),
          fieldWrap('타수', F.num(ck, [...p, 'hits'], { label: '타수 (1~10, 기본 1)', int: true, min: 1, max: 10, def: 1 }), '한 번에 몇 번 때리는지 (매번 명중 판정)')),
        row(fieldWrap('명중', F.num(ck, [...p, 'acc'], { label: '명중 배율 (0~10, 기본 1)', min: 0, max: 10, step: 0.1, def: 1 }), '게임의 명중 판정(Char.hit)에 곱함 — 대상 회피와 비교'),
          fieldWrap('치명', F.num(ck, [...p, 'crit'], { label: '치명 확률 (%, 0~100, 기본 0)', min: 0, max: 100, def: 0 })),
          fieldWrap('치명 배율', F.num(ck, [...p, 'critMult'], { label: '치명 배율 (1~10, 기본 1.5)', min: 1, max: 10, step: 0.1, def: 1.5 }))),
        fieldWrap('체력 소모', F.num(ck, [...p, 'hpCost'], { label: '쓸 때 체력 소모 (0~9999, 기본 0)', int: true, min: 0, max: 9999, def: 0 }), '자원은 체력만 지원 — 체력이 모자라면 쓰지 않음')),
      sec(st, 'a-fx', '맞힌 뒤 효과',
        row(fieldWrap('밀치기', F.num(ck, [...p, 'knockback'], { label: '밀치기 (칸, 0~10, 기본 0)', int: true, min: 0, max: 10, def: 0 }), '게임의 충격파 마법봉과 같은 방식 (벽에 부딪히면 피해)'),
          fieldWrap('기절', F.num(ck, [...p, 'stun'], { label: '기절 (턴, 0~20, 기본 0)', min: 0, max: 20, def: 0 }), '게임의 마비')),
        row(fieldWrap('상태', F.select(ck, [...p, 'status'], [['', '(없음)'], ...M().STATUS.map(s => [s, STATUS_NAMES[s] || s])], { label: '상태 이상', rerender: true })),
          n.status ? fieldWrap('상태 시간', F.num(ck, [...p, 'statusTurns'], { label: '상태 시간 (턴, 1~50, 기본 3)', min: 1, max: 50, def: 3 })) : null)),
      sec(st, 'a-target', '대상 · 투사체',
        row(fieldWrap('대상 고르기', F.select(ck, [...p, 'filter'], Object.entries(FILTER_NAMES), { label: '범위 공격이 맞히는 대상' }), '범위 공격에만'),
          fieldWrap('아군 피해', F.bool(ck, [...p, 'friendlyFire'], { label: '아군도 맞음 (범위)' }))),
        n.type === 'ranged' ? fieldWrap('투사체', F.bool(ck, [...p, 'projectile'], { label: '투사체 — 사이에 막힌 칸이 있으면 쓰지 않음' })) : null),
      sec(st, 'a-look', '동작 · 이펙트 · 소리',
        row(fieldWrap('동작', F.select(ck, [...p, 'anim'], [['attack', '공격 동작 (attack)'], ['zap', '마법 동작 (zap)']], { label: '캐릭터 동작' }), '캐릭터 스프라이트의 동작 — 원거리는 동작 뒤 마법 화살이 날아감'),
          fieldWrap('이펙트', F.select(ck, [...p, 'effect'], PDM.ui.refOptions('effect'), { label: '맞는 곳 이펙트', empty: '(없음)' })),
          fieldWrap('소리', F.sound ? F.sound(ck, [...p, 'sound'], { label: '소리' }) : F.text(ck, [...p, 'sound'], { label: '소리' }))))
    ];
  }

  /** 조건 편집기: 묶음(AND/OR · NOT) 안에 조건 · 묶음 — 고치면 그 자리의 조건 객체를 바꿈 */
  function condEditor(ck, path, when, P) {
    const set = (label, fn) => store.edit(ck, label, o => { const parent = PDM.deepGet(o, path.slice(0, -1)); fn(parent, path[path.length - 1]); });
    const at = (o, sub) => sub.reduce((x, k) => x && x[k], o);
    const edit = (sub, label, fn) => store.edit(ck, label, o => { const root = PDM.deepGet(o, path); const t = sub.length ? at(root, sub) : root; fn(t, root); });
    const leaf = { k: 'dist', cmp: '<=', v: 1 };
    const node = (c, sub, depth) => {
      if (!c || typeof c !== 'object') return null;
      const del = h('button', { class: 'ib danger', title: '이 조건 지우기', 'aria-label': '조건 지우기', onclick: () => {
        if (!sub.length) return set('조건 지우기', (par, k) => { delete par[k]; });
        store.edit(ck, '조건 지우기', o => { const root = PDM.deepGet(o, path); const parent = at(root, sub.slice(0, -2)); parent.items.splice(sub[sub.length - 1], 1); });
      } }, '✕');
      const not = h('label', { class: 'check m-0', title: '반대로 (NOT)' }, h('input', { type: 'checkbox', checked: !!c.not, onchange: e => edit(sub, '조건 NOT', t => { if (e.target.checked) t.not = true; else delete t.not; }) }), h('span', {}, 'NOT'));
      if (Array.isArray(c.items)) {
        const op = h('select', { 'aria-label': '묶음 방식', onchange: e => edit(sub, '조건 묶음', t => { t.op = e.target.value; }) }, h('option', { value: 'and', selected: c.op !== 'or' }, '모두 (AND)'), h('option', { value: 'or', selected: c.op === 'or' }, '하나라도 (OR)'));
        return h('div', { class: 'cc-cg', style: { marginLeft: depth ? '14px' : '0' } },
          h('div', { class: 'cc-cg-head' }, not, op,
            h('button', { class: 'btn xs', onclick: () => edit(sub, '조건 추가', t => { t.items.push(Object.assign({}, leaf)); }) }, '＋ 조건'),
            depth < 4 ? h('button', { class: 'btn xs', onclick: () => edit(sub, '조건 묶음 추가', t => { t.items.push({ op: 'or', items: [Object.assign({}, leaf)] }); }) }, '＋ 묶음') : null, del),
          ...c.items.map((x, j) => node(x, [...sub, 'items', j], depth + 1)),
          !c.items.length ? h('div', { class: 'hint' }, '빈 묶음 = 항상 참') : null);
      }
      const k = c.k, M_ = M();
      const keySel = h('select', { 'aria-label': '조건 종류', onchange: e => edit(sub, '조건 종류', t => { t.k = e.target.value; if (M_.STR_KEYS.includes(t.k)) t.v = t.k === 'event' ? 'hit' : t.k === 'ready' ? ((P.attacks[0] || {}).id || '') : 'poison'; else if (M_.BOOL_KEYS.includes(t.k)) { delete t.v; delete t.cmp; } else { t.v = typeof t.v === 'number' ? t.v : 1; t.cmp = t.cmp || '<='; } }) },
        ...M_.KEYS.map(x => h('option', { value: x, selected: x === k }, KEY_NAMES[x] || x)), M_.KEYS.includes(k) ? null : h('option', { value: k, selected: true }, `⚠ 모름: ${k}`));
      let cmpSel = null, val;
      if (M_.BOOL_KEYS.includes(k)) val = h('span', { class: 'hint' }, '(참이면)');
      else if (M_.STR_KEYS.includes(k)) {
        const opts = k === 'event' ? Object.entries(EVENT_NAMES) : k === 'ready' ? P.attacks.map(a => [a.id, a.name || a.id]) : Object.entries(STATUS_NAMES);
        val = h('select', { 'aria-label': '값', onchange: e => edit(sub, '조건 값', t => { t.v = e.target.value; }) }, ...opts.map(([v, t]) => h('option', { value: v, selected: v === c.v }, t)));
      } else {
        cmpSel = h('select', { 'aria-label': '비교', onchange: e => edit(sub, '조건 비교', t => { t.cmp = e.target.value; }) }, ...M_.CMPS.map(x => h('option', { value: x, selected: x === (c.cmp || '>=') }, CMP_NAMES[x])));
        val = h('input', { type: 'number', value: c.v ?? 0, step: 'any', style: { width: '72px' }, 'aria-label': '값', onchange: e => { const v = parseFloat(e.target.value); edit(sub, '조건 값', t => { t.v = Number.isFinite(v) ? v : 0; }); } });
      }
      return h('div', { class: 'cc-c', style: { marginLeft: depth ? '14px' : '0' } }, not, keySel, cmpSel, val, del);
    };
    return h('div', { class: 'cc-cond' },
      when ? node(when, [], 0) : h('div', { class: 'hint' }, '조건 없음 — 항상 (대상이 필요한 동작은 대상이 있을 때)'),
      h('div', { class: 'pal-row' },
        h('button', { class: 'btn xs', onclick: () => set('조건 추가', (par, key) => { const cur = par[key]; if (!cur) par[key] = Object.assign({}, leaf); else if (Array.isArray(cur.items) && !cur.not) cur.items.push(Object.assign({}, leaf)); else par[key] = { op: 'and', items: [cur, Object.assign({}, leaf)] }; }) }, '＋ 조건'),
        h('button', { class: 'btn xs', onclick: () => set('조건 묶음 추가', (par, key) => { const cur = par[key]; const g = { op: 'or', items: [Object.assign({}, leaf)] }; if (!cur) par[key] = g; else if (Array.isArray(cur.items) && !cur.not) cur.items.push(g); else par[key] = { op: 'and', items: [cur, g] }; }) }, '＋ OR 묶음')));
  }

  // ---------------- 시뮬레이터 (PDM.aiModel — 런타임 MakerAIModel 과 같은 규칙)
  function simulator(ck, st, cb, P, B, ctx) {
    const S = st.sim = st.sim || { selfHp: 100, hasTarget: true, tDist: 1, tHp: 100, visible: true, line: true, enemies: 1, allies: 0, allyHp: 50, ev: { hit: false, attacked: false, targetLost: false }, turn: 0, cd: {}, next: '', roll: 50, random: false, log: [], status: '', tStatus: '' };
    const sit = () => {
      const T = S.hasTarget ? { hp: S.tHp, ht: 100, dist: S.tDist, visible: S.visible, line: S.line, st: S.tStatus ? [S.tStatus] : [] } : null;
      return { turn: S.turn, self: { hp: S.selfHp, ht: 100, st: S.status ? [S.status] : [] }, targets: { enemy: T, hero: T, nearestEnemy: T, weakestEnemy: T, weakestAlly: S.allies > 0 ? { hp: S.allyHp, ht: 100, dist: 2, visible: true, line: true, st: [] } : null },
        allies: S.allies, enemies: S.hasTarget ? Math.max(1, S.enemies) : 0, ev: Object.assign({}, S.ev), cd: Object.assign({}, S.cd), next: S.next,
        rolls: S.random ? Array.from({ length: 16 }, () => Math.random()) : [S.roll / 100] };
    };
    const s0 = sit(), R = M().decide(P, s0);
    const box = h('div', { class: 'cc-right' });
    const redraw = () => { const n = simulator(ck, st, cb, P, B, ctx); box.replaceWith(n); };
    const num = (label, k, min, max, step, tip) => h('label', { class: 'cc-sim-f', title: tip || '' }, h('span', {}, label), h('input', { type: 'number', min, max, step: step || 1, value: S[k], 'aria-label': label, onchange: e => { const v = parseFloat(e.target.value); S[k] = Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : S[k]; redraw(); } }));
    const chk = (label, get, set) => h('label', { class: 'check m-0' }, h('input', { type: 'checkbox', checked: !!get(), onchange: e => { set(e.target.checked); redraw(); } }), h('span', {}, label));
    const name = id => { const b = P.behaviors.find(x => x.id === id); return b ? (b.name || b.id) : id; };
    const chosen = R.id ? P.behaviors.find(b => b.id === R.id) : null;
    const A = chosen && chosen.action === 'attack' ? P.attacks.find(a => a.id === chosen.attack) : null;
    box.append(
      h('div', { class: 'cc-sim-head' }, h('b', {}, '시뮬레이터'), h('span', { class: 'hint', title: '편집기 PDM.aiModel 과 런타임 MakerAIModel 은 같은 규칙입니다 (tools/tests/run.js 가 Java 를 실제로 실행해 비교)' }, '게임과 같은 규칙')),
      h('div', { class: 'cc-sim-grid' },
        num('내 체력 %', 'selfHp', 0, 100, 1), num('턴', 'turn', 0, 9999, 1, '게임 턴 — 재사용 대기와 비교'),
        chk('대상 있음', () => S.hasTarget, v => { S.hasTarget = v; }), num('대상 거리', 'tDist', 0, 30, 1, '칸'),
        num('대상 체력 %', 'tHp', 0, 100, 1), chk('보임', () => S.visible, v => { S.visible = v; }),
        chk('투사체가 닿음', () => S.line, v => { S.line = v; }), num('보이는 적 수', 'enemies', 0, 20, 1),
        num('보이는 아군 수', 'allies', 0, 20, 1), num('아군 체력 %', 'allyHp', 0, 100, 1)),
      h('div', { class: 'cc-sim-row' }, h('span', { class: 'fl' }, '사건'), ...Object.entries(EVENT_NAMES).map(([k, t]) => chk(t, () => S.ev[k], v => { S.ev[k] = v; }))),
      h('div', { class: 'cc-sim-row' },
        h('label', {}, h('span', { class: 'fl' }, '내 상태 '), h('select', { onchange: e => { S.status = e.target.value; redraw(); } }, h('option', { value: '' }, '(없음)'), ...Object.entries(STATUS_NAMES).map(([v, t]) => h('option', { value: v, selected: v === S.status }, t)))),
        h('label', {}, h('span', { class: 'fl' }, ' 대상 상태 '), h('select', { onchange: e => { S.tStatus = e.target.value; redraw(); } }, h('option', { value: '' }, '(없음)'), ...Object.entries(STATUS_NAMES).map(([v, t]) => h('option', { value: v, selected: v === S.tStatus }, t))))),
      h('div', { class: 'cc-sim-row', title: '확률 · 가중치에 쓰는 난수 — 고정하면 같은 결과를 되풀이해 볼 수 있음' },
        chk('난수 무작위', () => S.random, v => { S.random = v; }),
        S.random ? null : h('label', { class: 'cc-sim-f' }, h('span', {}, '고정 난수 (0~99)'), h('input', { type: 'range', min: 0, max: 99, value: S.roll, 'aria-label': '고정 난수', oninput: e => { S.roll = +e.target.value; }, onchange: redraw }), h('span', { class: 'mono' }, String(S.roll)))),
      h('div', { class: 'cc-sim-out' + (R.id ? ' ok' : ' none') },
        h('div', { class: 'cc-sim-pick' }, R.id ? `▶ ${name(R.id)} — ${ACTION_NAMES[R.action] || R.action}${A ? ` · ${A.name || A.id} (${TYPE_NAMES[A.type]}, 준비 ${A.windup} · 회복 ${A.recovery}턴, 재사용 ${A.cooldown})` : ''}` : '▶ 원래 AI'),
        h('div', { class: 'hint' }, `이유: ${M().REASON[R.reason] || R.reason}${R.id ? ` · 이 행동이 쓰는 턴 ${M().turns(P, R.id)}` : ''}${S.next ? ` · 이어서 할 행동: ${name(S.next)}` : ''}`)),
      h('table', { class: 'cc-trace' }, h('thead', {}, h('tr', {}, h('th', {}, '행동'), h('th', {}, '우선'), h('th', {}, '결과'))),
        h('tbody', {}, ...R.trace.map(t => { const b = P.behaviors.find(x => x.id === t.id) || {}; const good = t.why === 'ok' || t.why === 'chain'; return h('tr', { class: t.id === R.id ? 'pick' : good ? 'ok' : 'no' }, h('td', {}, b.name || t.id), h('td', { class: 'mono' }, String(b.priority ?? '')), h('td', {}, (t.id === R.id ? '✔ 고름 · ' : '') + (M().WHY[t.why] || t.why))); }))),
      h('div', { class: 'cc-sim-cd hint' }, Object.keys(S.cd).length ? '재사용 대기: ' + Object.entries(S.cd).map(([k, v]) => `${k.startsWith('a:') ? '공격 ' : '행동 '}${k.slice(2)} → ${v}턴까지`).join(' · ') : '재사용 대기 없음'),
      h('div', { class: 'btnbar' },
        h('button', { class: 'btn sm pri', disabled: !R.id, title: '고른 행동을 한 것으로 치고 다음 차례로 (재사용 대기 · 이어지는 행동 · 턴이 런타임과 같은 규칙으로 바뀜)', onclick: () => { const a = M().after(P, s0, R.id, true); S.log.unshift(`턴 ${S.turn}: ${name(R.id)} 성공`); S.cd = a.cd; S.next = a.next; S.turn += M().turns(P, R.id); S.ev = { hit: false, attacked: R.action === 'attack', targetLost: false }; redraw(); } }, '▶ 다음 차례 (성공)'),
        h('button', { class: 'btn sm', disabled: !R.id, title: '대상이 없어짐 · 사거리 밖 · 막힘 등으로 실패한 것으로', onclick: () => { const a = M().after(P, s0, R.id, false); S.log.unshift(`턴 ${S.turn}: ${name(R.id)} 실패`); S.cd = a.cd; S.next = a.next; S.turn += 1; S.ev = { hit: false, attacked: false, targetLost: false }; redraw(); } }, '실패로'),
        h('button', { class: 'btn sm', onclick: () => { st.sim = null; redraw(); } }, '↺ 처음부터')),
      S.log.length ? h('div', { class: 'cc-sim-log hint' }, ...S.log.slice(0, 8).map(l => h('div', {}, l))) : null);
    return box;
  }

  /** 캐릭터 편집 화면에서 쓰는 요약 + 여는 버튼 */
  PDM.combatSummary = function (c) {
    const cb = c.combat;
    const open = () => PDM.tabs.open('combat:' + c.id);
    if (!cb) return h('div', { class: 'hstack wrap' }, h('button', { class: 'btn sm', onclick: open }, '⚔ AI · 전투 편집기…'), h('span', { class: 'hint' }, '전투 설정 없음 — 원래 AI · 원래 공격'));
    const iss = M().validate(cb), errs = iss.filter(i => i.level === 'error').length;
    return h('div', { class: 'hstack wrap' }, h('button', { class: 'btn sm pri', onclick: open }, '⚔ AI · 전투 편집기…'),
      h('span', { class: 'hint' }, `전투 설정: 행동 ${(cb.behaviors || []).length} · 공격 ${(cb.attacks || []).length} · ${cb.enabled === false ? '꺼짐 (원래 AI)' : errs ? `⛔ 오류 ${errs} — 게임은 원래 AI` : '게임에서 씀'}`));
  };
})();
