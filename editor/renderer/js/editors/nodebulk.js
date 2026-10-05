// ================================================================
//  노드 한꺼번에 설정 — 맵 그래프에서 그룹 제목을 더블클릭(또는 그룹·여러 노드의 "노드 한꺼번에 설정…")
//   · 대상: 그룹의 노드들 (체크로 고름 · 자동 생성만 / 직접 그리기만)
//   · 바꾸기: 체크한 항목만 모든 대상 노드에 같은 값으로 (생성 방식 · 테마 · 보스 · 몬스터 스폰 · 깊이 · 배경음 · 화면 필터 · 안전구역 · 들어올 때 이벤트)
//   · 추가: 대상 노드마다 목록에 하나씩 넣음 (지형 광원 · 자동 광원 · 추가 방 · 스폰 몬스터) — "기존 것 지우고" 를 켜면 바꿔 넣음
//   적용은 실행 취소 한 번으로 되돌릴 수 있음.
// ================================================================
(function () {
  const { h } = PDM;
  const store = PDM.store;
  const MODE_NAME = m => ((PDM.FLOOR_MODES || {})[m] || {}).name || m;
  const GAME_MOBS = ['rat', 'albino', 'gnoll', 'crab', 'slime', 'snake', 'swarm', 'skeleton', 'thief', 'bat', 'brute', 'spinner', 'monk', 'warlock', 'golem', 'succubus', 'eye', 'scorpio'];

  const sel = (opts, val) => { const s = h('select', { style: { width: 'auto', maxWidth: '260px', flex: '0 1 auto' } }, opts.map(([v, t]) => h('option', { value: v }, t))); s.value = val; return s; };
  const num = (val, o = {}) => h('input', { type: 'number', value: val, min: o.min, max: o.max, step: o.step || 1, style: { width: '80px', flex: 'none' } });
  const color = val => h('input', { type: 'color', value: val, style: { width: '40px', flex: 'none' } });
  const terrains = () => PDM.TERRAIN.map(t => [String(t.id), t.name]);

  /**
   * @param ids   대상 후보 노드 id 목록
   * @param title 창 제목 (예: 그룹 이름)
   */
  async function nodeBulk(ids, title) {
    ids = ids.filter(id => store.get('node:' + id));
    if (!ids.length) { toast('노드가 없습니다', 'bad'); return; }
    const W_ = PDM.World;
    const on = new Set(ids);
    const summary = h('div', { class: 'hint', style: { marginTop: '10px', fontWeight: 'bold' } });

    // ---- 대상 ----
    const tBoxes = {};
    const tList = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '2px 14px', maxHeight: '120px', overflow: 'auto', padding: '4px 0' } },
      ids.map(id => {
        const d = store.get('node:' + id);
        const cb = tBoxes[id] = h('input', { type: 'checkbox', checked: true, onchange: () => { cb.checked ? on.add(id) : on.delete(id); update(); } });
        return h('label', { class: 'check', style: { display: 'inline-flex', alignItems: 'center', gap: '4px', margin: 0 } }, cb, d.name || W_.label(id) || id, h('span', { class: 'hint' }, `(${MODE_NAME(d.mode)})`));
      }));
    const pick = f => { ids.forEach(id => { const v = f(store.get('node:' + id)); tBoxes[id].checked = v; v ? on.add(id) : on.delete(id); }); update(); };
    const targetBox = h('div', {},
      h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
        h('button', { class: 'btn xs', onclick: () => pick(() => true) }, '모두'),
        h('button', { class: 'btn xs', onclick: () => pick(() => false) }, '없음'),
        ...Object.keys(PDM.FLOOR_MODES || {}).filter(m => ids.some(id => store.get('node:' + id).mode === m))
          .map(m => h('button', { class: 'btn xs', onclick: () => pick(d => d.mode === m) }, MODE_NAME(m) + '만'))),
      tList);

    // ---- 바꾸기 / 추가 줄 ----
    const rows = [];
    /** 한 줄: [적용] 이름 · 입력칸들. 입력을 건드리면 적용이 켜짐. apply(r, id) 가 노드 데이터를 고침 */
    function line(kind, label, inputs, apply, hint) {
      const cb = h('input', { type: 'checkbox', onchange: update });
      const wipe = kind === 'add' ? h('input', { type: 'checkbox', onchange: update }) : null;
      const touch = () => { if (!cb.checked) { cb.checked = true; update(); } };
      inputs.forEach(i => i.querySelectorAll ? [i, ...i.querySelectorAll('input,select')].forEach(x => { x.addEventListener('change', touch); x.addEventListener('input', touch); }) : null);
      const ck = { display: 'inline-flex', alignItems: 'center', gap: '4px', margin: 0 };
      const el = h('div', { style: { display: 'grid', gridTemplateColumns: '150px 1fr', alignItems: 'center', gap: '6px', padding: '4px 0', borderBottom: '1px solid var(--line)' } },
        h('label', { class: 'check', style: ck }, cb, h('b', {}, label)),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', minWidth: 0 } }, ...inputs,
          wipe ? h('label', { class: 'check', style: ck, title: '체크하면 노드에 있던 것을 모두 지우고 이것 하나만 남깁니다' }, wipe, '기존 것 지우고') : null,
          hint ? h('span', { class: 'hint' }, hint) : null));
      rows.push({ kind, label, cb, wipe, apply });
      return el;
    }

    // 생성 방식
    const sMode = sel(Object.entries(PDM.FLOOR_MODES || {}).map(([m, x]) => [m, x.name]), 'procedural');
    const sTheme = sel([['', '(그룹 테마)'], ...PDM.ui.refOptions('theme')], '');
    const sBoss = sel([['1', '보스 층'], ['0', '보통 층']], '0');
    const sMobs = sel([['1', '몬스터가 생김'], ['0', '몬스터가 생기지 않음']], '1');
    const nDepth = num(0, { min: 0, max: 30 });
    let bgm = '';
    const pBgm = PDM.ui.soundPicker('', v => { bgm = v; }, { kind: 'bgm', allowNone: true, empty: '(그룹 설정)', mini: true });
    const filters = PDM.ui.refOptions('filter');
    const sFilter = sel([['', '(없음 — 그룹 설정대로)'], ...filters], '');
    const sSafe = sel([['1', '안전구역 켜기'], ['0', '안전구역 끄기']], '1');
    const sEnter = sel([['', '(없음)'], ...PDM.ui.refOptions('event')], '');

    const setBox = h('div', {},
      line('set', '생성 방식', [sMode], (r, id) => {
        r.mode = sMode.value;
        if (r.mode !== 'procedural') {   // 단일 노드 속성과 같음: 타일이 없으면 준비
          const t = PDM.make.node(id, r.mode);
          if (!r.layers || !r.layers.terrain || !r.size || r.layers.terrain.length !== r.size.w * r.size.h || !r.layers.terrain.length) { r.size = t.size; r.layers = t.layers; }
        }
      }, '자동 생성 → 직접 그리기로 바꾸면 빈 타일이 준비됩니다'),
      line('set', '테마', [sTheme], r => { r.theme = sTheme.value; }),
      line('set', '보스 층', [sBoss], r => { r.boss = sBoss.value === '1'; }),
      line('set', '몬스터 스폰', [sMobs], r => {
        const v = sMobs.value === '1';
        r.noMobs = !v;
        if (r.mode === 'handmade') r.spawn = Object.assign({ mobs: [], initial: 3, max: 6, respawn: 50, minDist: 8 }, r.spawn || {}, { enabled: v });
      }),
      line('set', '난이도 깊이', [nDepth], r => { r.depth = Math.max(0, Math.min(30, parseInt(nDepth.value, 10) || 0)); }, '0 = 자동 (시작 노드에서의 거리)'),
      line('set', '배경음', [pBgm], r => { r.bgm = bgm; }),
      filters.length ? line('set', '화면 필터', [sFilter], r => { r.filter = sFilter.value; }) : null,
      line('set', '안전구역', [sSafe], r => { r.safe = Object.assign({ hunger: true, feed: false, cure: true, heal: 0, msg: true }, r.safe || {}, { on: sSafe.value === '1' }); }),
      line('set', '들어올 때 이벤트', [sEnter], r => { r.onEnter = sEnter.value; }));

    // 추가
    const tlTer = sel(terrains(), '29'), tlCol = color('#9a7cff');
    const alTer = sel(terrains(), '25'), alCol = color('#ffc870'), alChance = num(100, { min: 0, max: 100 }), alSpace = num(3, { min: 0, max: 30, step: 0.5 });
    const rooms = PDM.ui.refOptions('room');
    const rmSel = sel(rooms.length ? rooms : [['', '(방 템플릿 없음)']], (rooms[0] || [''])[0]), rmCount = num(1, { min: 1, max: 20 }), rmChance = num(100, { min: 0, max: 100 });
    const mobOpts = [...store.all('char').filter(c => ['mob', 'boss'].includes(c.kind)).map(c => [c.id, c.name]),
      ...GAME_MOBS.map(m => ['spd:' + m.charAt(0).toUpperCase() + m.slice(1), `(게임) ${m}`])];
    const mbSel = sel(mobOpts, mobOpts[0][0]), mbW = num(1, { min: 0 });
    const push = (r, path, item, wipe) => {
      let o = r; path.slice(0, -1).forEach(k => { o = o[k] = o[k] || {}; });
      const k = path[path.length - 1];
      o[k] = wipe ? [] : (o[k] || []);
      o[k].push(item);
    };
    const addBox = h('div', {},
      line('add', '지형 광원', [h('span', { class: 'hint' }, '지형'), tlTer, tlCol], (r, id, wipe) => push(r, ['terrainLights'], { terrain: +tlTer.value, color: tlCol.value, k: 1.5, z: 10, range: 2, pulse: 3, pulseMin: 55 }, wipe)),
      line('add', '자동 광원', [h('span', { class: 'hint' }, '지형'), alTer, alCol, h('span', { class: 'hint' }, '확률 %'), alChance, h('span', { class: 'hint' }, '간격'), alSpace],
        (r, id, wipe) => push(r, ['autoLights'], { terrain: +alTer.value, chance: +alChance.value || 0, max: 0, spacing: +alSpace.value || 0, color: alCol.value, k: 4, z: 10, range: 4, pulse: 0.8, pulseMin: 80 }, wipe)),
      rooms.length ? line('add', '추가 방', [rmSel, h('span', { class: 'hint' }, '개수'), rmCount, h('span', { class: 'hint' }, '확률 %'), rmChance],
        (r, id, wipe) => { if (r.mode === 'handmade') return false; push(r, ['procedural', 'rooms'], { room: rmSel.value, count: +rmCount.value || 1, chance: +rmChance.value || 0, cond: '' }, wipe); }, '자동 생성 · 혼합 노드만') : null,
      line('add', '스폰 몬스터', [mbSel, h('span', { class: 'hint' }, '무게'), mbW],
        (r, id, wipe) => { if (r.mode !== 'handmade') return false; r.spawn = Object.assign({ enabled: !r.noMobs, initial: 3, max: 6, respawn: 50, minDist: 8 }, r.spawn || {}); push(r, ['spawn', 'mobs'], { ref: mbSel.value, weight: +mbW.value || 0 }, wipe); }, '직접 그리기 노드만'));

    function update() {
      const act = rows.filter(x => x.cb.checked);
      summary.textContent = !on.size ? '대상 노드를 고르세요' : !act.length ? '바꾸거나 추가할 항목을 체크하세요 (입력칸을 건드리면 자동으로 체크됩니다)'
        : `노드 ${on.size}개에 적용: ${act.map(x => x.label + (x.kind === 'add' ? (x.wipe.checked ? ' (바꿔 넣기)' : ' 추가') : '')).join(' · ')}`;
    }
    update();

    const ok = await PDM.ui.modal(`노드 한꺼번에 설정 — ${title}`, h('div', { style: { minWidth: '640px' } },
      h('div', { class: 'fl' }, `대상 노드 (${ids.length}개 중 고르기)`), targetBox,
      h('div', { class: 'fl', style: { marginTop: '10px' } }, '바꾸기 — 체크한 항목을 모든 대상 노드에 같은 값으로'), setBox,
      h('div', { class: 'fl', style: { marginTop: '10px' } }, '추가 — 대상 노드마다 하나씩 넣기 (세부 값은 나중에 노드 속성에서 고칠 수 있음)'), addBox,
      summary), [['취소', null], ['적용', true, 'pri']]);
    if (!ok) return;
    const act = rows.filter(x => x.cb.checked), targets = ids.filter(id => on.has(id));
    if (!act.length || !targets.length) { toast('적용할 것이 없습니다'); return; }
    let changed = 0, skipped = 0;
    store.transaction('노드 한꺼번에 설정', () => targets.forEach(id => {
      let skip = 0;
      const did = store.edit('node:' + id, '노드 한꺼번에 설정', r => { act.forEach(x => { if (x.apply(r, id, x.wipe && x.wipe.checked) === false) skip++; }); });
      if (did) changed++;
      skipped += skip;
    }));
    toast(`노드 ${changed}개를 고쳤습니다` + (skipped ? ` (맞지 않는 종류라 건너뛴 항목 ${skipped}개)` : '') + ' — Ctrl+Z 로 되돌리기', 'good');
  }
  PDM.nodeBulk = nodeBulk;
})();
