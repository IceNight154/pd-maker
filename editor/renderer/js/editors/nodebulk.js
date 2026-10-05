// ================================================================
//  노드 한꺼번에 설정 — 맵 그래프에서 그룹 제목을 더블클릭(또는 그룹·여러 노드의 "노드 한꺼번에 설정…")
//   · 대상: 그룹의 노드들 (체크로 고름 · 자동 생성만 / 직접 그리기만)
//   · 바꾸기: 체크한 항목만 모든 대상 노드에 같은 값으로 (생성 방식 · 테마 · 보스 · 몬스터 스폰 · 깊이 · 배경음 · 화면 필터 · 안전구역 · 들어올 때 이벤트)
//   · 추가: 대상 노드마다 목록에 넣음 (지형 광원 · 자동 광원 — 여러 개, 세부 설정 전부 + 미리보기 · 추가 방 · 스폰 몬스터) — "기존 것 지우고" 를 켜면 바꿔 넣음
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
   * 광원 목록 (여러 개 · 세부 설정 전부 · 미리보기) — 노드 속성의 지형 광원 / 자동 광원 칸과 같은 값
   * area = 지형 광원. 돌려줌: { el, items() → 넣을 광원 객체 목록 }
   */
  function lightList(area) {
    const D = area ? { terrain: 29, color: '#9a7cff', k: 1.5, z: 10, range: 2, pulse: 3, pulseMin: 55 }
      : { terrain: 25, chance: 100, max: 0, spacing: 3, ox: 0, oy: 0, cond: '', color: '#ffc870', k: 4, z: 10, range: 4, pulse: 0.8, pulseMin: 80, shadow: true, charShadow: true };
    const list = [], box = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' } });
    const lab = (t, input, title) => h('label', { style: { display: 'inline-flex', alignItems: 'center', gap: '4px', margin: 0 }, title: title || '' }, h('span', { class: 'hint' }, t), input);
    function card(v) {
      const cv = h('canvas', { width: 150, height: 76, style: { background: '#14121a', borderRadius: '6px', flex: 'none' } });
      const draw = () => {
        const g = cv.getContext('2d'); g.clearRect(0, 0, 150, 76);
        g.fillStyle = '#2a2833'; for (let x = 0; x < 150; x += 12) for (let y = 0; y < 76; y += 12) if (((x + y) / 12) % 2 === 0) g.fillRect(x, y, 12, 12);
        if (area) { const lake = [[4, 2], [5, 2], [6, 2], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [4, 4], [5, 4], [6, 4]];
          g.fillStyle = '#2d5f86'; lake.forEach(([x, y]) => g.fillRect(x * 12, y * 12, 12, 12)); lake.forEach(([x, y]) => PDM.drawLightPreview(g, x * 12 + 6, y * 12 + 6, v, 12));
        } else PDM.drawLightPreview(g, 75, 38, v, 12);
      };
      // 입력칸: 값이 바뀌면 v 에 넣고 미리보기 다시
      const inp = (k, o = {}) => {
        const el = o.check ? h('input', { type: 'checkbox', checked: v[k] !== false })
          : o.opts ? sel(o.opts, String(v[k])) : o.color ? color(v[k]) : o.text ? h('input', { type: 'text', value: v[k] || '', placeholder: o.ph || '', style: { width: '170px', flex: 'none' } }) : num(v[k], o);
        if (o.w) el.style.width = o.w;
        const put = () => { v[k] = o.check ? el.checked : o.opts ? +el.value : o.color || o.text ? el.value : (el.value === '' ? D[k] : +el.value); draw(); };
        el.addEventListener('input', put); el.addEventListener('change', put);
        return el;
      };
      const del = h('button', { class: 'btn xs', title: '이 광원 빼기', onclick: () => { const i = list.indexOf(v); if (i >= 0) list.splice(i, 1); el.remove(); if (!list.length) add(); } }, '✕');
      const el = h('div', { class: 'card', style: { display: 'flex', gap: '8px', padding: '6px', alignItems: 'flex-start' } }, cv,
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px 10px', alignItems: 'center', flex: 1, minWidth: 0 } },
          lab(area ? '지형' : '놓을 지형', inp('terrain', { opts: terrains() })), lab('빛 색', inp('color', { color: true })),
          lab('세기', inp('k', { min: 0, max: 60, step: 0.5, w: '64px' }), area ? '칸 하나의 세기 (칸이 모이면 더 밝아짐)' : '가운데 밝은 부분의 크기'),
          lab('부드러움', inp('z', { min: 1, max: 80, w: '64px' }), '클수록 넓고 은은하게'),
          lab('범위(칸)', inp('range', { min: area ? 0.5 : 1, max: 16, step: 0.5, w: '64px' }), '여기서 빛이 0 이 됨'),
          lab('깜빡임(초)', inp('pulse', { min: 0, step: 0.1, w: '64px' }), '0 = 일정'),
          lab('가장 어두울 때 %', inp('pulseMin', { min: 0, max: 100, w: '64px' })),
          ...(area ? [] : [
            lab('칸마다 확률 %', inp('chance', { min: 0, max: 100, w: '64px' })),
            lab('최대 개수', inp('max', { min: 0, max: 200, w: '64px' }), '0 = 제한 없음'),
            lab('최소 간격', inp('spacing', { min: 0, max: 30, step: 0.5, w: '64px' }), '광원끼리 이보다 가까이 놓지 않음 (칸)'),
            lab('위치 →', inp('ox', { w: '56px' }), '빛 위치 옮김 (px)'), lab('↓', inp('oy', { w: '56px' }), '빛 위치 옮김 (px) — 예: 벽 횃불은 아래로'),
            lab('켜지는 조건', inp('cond', { text: true, ph: '비우면 늘 · 예: switch.lamp' })),
            lab('벽 그림자', inp('shadow', { check: true })), lab('캐릭터 그림자', inp('charShadow', { check: true }))])),
        del);
      draw();
      return el;
    }
    function add(from) {
      const v = Object.assign({}, from || D);
      list.push(v); box.insertBefore(card(v), more);
    }
    const more = h('button', { class: 'btn xs add', style: { alignSelf: 'flex-start' }, onclick: () => { add(list[list.length - 1]); more.dispatchEvent(new Event('change', { bubbles: true })); } }, area ? '+ 지형 광원 하나 더' : '+ 자동 광원 하나 더');
    box.append(more);
    add();
    return { el: box, items: () => list.map(v => { const o = Object.assign({}, v); if (!area) { if (!o.cond) delete o.cond; if (!o.ox) delete o.ox; if (!o.oy) delete o.oy; if (o.shadow !== false) delete o.shadow; if (o.charShadow !== false) delete o.charShadow; } return o; }) };
  }

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
    function line(kind, label, inputs, apply, hint, count) {
      const cb = h('input', { type: 'checkbox', onchange: update });
      const wipe = kind === 'add' ? h('input', { type: 'checkbox', onchange: update }) : null;
      const touch = () => { if (!cb.checked) { cb.checked = true; update(); } };
      const ck = { display: 'inline-flex', alignItems: 'center', gap: '4px', margin: 0 };
      const el = h('div', { style: { display: 'grid', gridTemplateColumns: '150px 1fr', alignItems: 'center', gap: '6px', padding: '4px 0', borderBottom: '1px solid var(--line)' } },
        h('label', { class: 'check', style: ck }, cb, h('b', {}, label)),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', minWidth: 0 }, oninput: touch, onchange: touch }, ...inputs,
          wipe ? h('label', { class: 'check', style: ck, title: '체크하면 노드에 있던 것을 모두 지우고 여기서 넣는 것만 남깁니다' }, wipe, '기존 것 지우고') : null,
          hint ? h('span', { class: 'hint' }, hint) : null));
      rows.push({ kind, label, cb, wipe, apply, count });
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
    const tLights = lightList(true), aLights = lightList(false);
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
      line('add', '지형 광원', [tLights.el], (r, id, wipe) => tLights.items().forEach((it, i) => push(r, ['terrainLights'], it, wipe && !i)), '고른 지형의 칸마다 은은한 빛 (그림자 없음)', () => tLights.items().length),
      line('add', '자동 광원', [aLights.el], (r, id, wipe) => aLights.items().forEach((it, i) => push(r, ['autoLights'], it, wipe && !i)), '고른 지형 칸에 점광원을 자동으로 (그림자 있음)', () => aLights.items().length),
      rooms.length ? line('add', '추가 방', [rmSel, h('span', { class: 'hint' }, '개수'), rmCount, h('span', { class: 'hint' }, '확률 %'), rmChance],
        (r, id, wipe) => { if (r.mode === 'handmade') return false; push(r, ['procedural', 'rooms'], { room: rmSel.value, count: +rmCount.value || 1, chance: +rmChance.value || 0, cond: '' }, wipe); }, '자동 생성 · 혼합 노드만') : null,
      line('add', '스폰 몬스터', [mbSel, h('span', { class: 'hint' }, '무게'), mbW],
        (r, id, wipe) => { if (r.mode !== 'handmade') return false; r.spawn = Object.assign({ enabled: !r.noMobs, initial: 3, max: 6, respawn: 50, minDist: 8 }, r.spawn || {}); push(r, ['spawn', 'mobs'], { ref: mbSel.value, weight: +mbW.value || 0 }, wipe); }, '직접 그리기 노드만'));

    function update() {
      const act = rows.filter(x => x.cb.checked);
      summary.textContent = !on.size ? '대상 노드를 고르세요' : !act.length ? '바꾸거나 추가할 항목을 체크하세요 (입력칸을 건드리면 자동으로 체크됩니다)'
        : `노드 ${on.size}개에 적용: ${act.map(x => x.label + (x.count ? ` ${x.count()}개` : '') + (x.kind === 'add' ? (x.wipe.checked ? ' (바꿔 넣기)' : ' 추가') : '')).join(' · ')}`;
    }
    update();

    const ok = await PDM.ui.modal(`노드 한꺼번에 설정 — ${title}`, h('div', { style: { minWidth: '640px' } },
      h('div', { class: 'fl' }, `대상 노드 (${ids.length}개 중 고르기)`), targetBox,
      h('div', { class: 'fl', style: { marginTop: '10px' } }, '바꾸기 — 체크한 항목을 모든 대상 노드에 같은 값으로'), setBox,
      h('div', { class: 'fl', style: { marginTop: '10px' } }, '추가 — 대상 노드마다 넣기 (광원은 여러 개 · 세부 값까지 여기서, 나머지 세부 값은 나중에 노드 속성에서)'), addBox,
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
