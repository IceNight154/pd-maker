// ================================================================
//  이벤트 명령 목록 편집기 (RPG Maker 식)
//   PDM.commandList(key, path, opts) → 요소
//     key/path : store 안의 명령 배열 위치 (예: 'event:ev1', ['pages',0,'commands'])
//   · 더블클릭 = 편집, ◆ 줄 더블클릭 = 새 명령, 오른쪽 클릭 = 메뉴, Delete = 삭제
//   · 블록 명령: if(then/else), choice(branches), loop(body)
// ================================================================
(function () {
  const { h } = PDM;
  let clipboard = null;

  // ---------- 명령 하나의 입력 폼 (store 에 묶이지 않은 임시 객체용) ----------
  function paramInput(obj, p, ctx) {
    const set = v => { obj[p.k] = v; };
    const cur = obj[p.k];
    const sel = (entries, o = {}) => {
      const s = h('select', {}, h('option', { value: '' }, o.empty || '(선택 안 함)'), entries.map(([v, t]) => h('option', { value: v }, t)));
      if (o.create) s.append(h('option', { value: '__new' }, '+ 새로 만들기…'));
      s.value = cur ?? '';
      if (cur && s.value !== String(cur)) { s.append(h('option', { value: cur }, `⚠ ${cur}`)); s.value = cur; }
      s.addEventListener('change', async () => {
        if (s.value === '__new') {
          const id = await o.create(); if (!id) { s.value = cur ?? ''; return; }
          s.insertBefore(h('option', { value: id }, id), s.lastChild); s.value = id;
        }
        set(o.number ? +s.value : s.value);
        if (p.k === 'speaker' || p.k === 'char') ctx.onCharChange && ctx.onCharChange(s.value);
      });
      return s;
    };
    const R = kind => PDM.ui.refOptions(kind, { char: obj.speaker || obj.char });
    switch (p.t) {
      case 'textarea': { const t = h('textarea', { rows: 4 }); t.value = cur ?? ''; t.addEventListener('input', () => set(t.value)); return t; }
      case 'number': { const i = h('input', { type: 'number', value: cur ?? 0 }); i.addEventListener('input', () => set(parseFloat(i.value) || 0)); return i; }
      case 'bool': { const i = h('input', { type: 'checkbox', checked: !!cur }); i.addEventListener('change', () => set(i.checked)); return h('label', { class: 'check' }, i, '예'); }
      case 'optnum': {   // 빈 칸 = 다음 단계 값 (대사 스타일 — 0 도 값이므로 비우기와 구분), 범위 밖은 범위로
        const i = h('input', { type: 'number', value: cur ?? '', placeholder: '(기본)', min: p.min, max: p.max, step: p.step || 'any' });
        i.addEventListener('input', () => { const v = parseFloat(i.value); set(i.value === '' || !Number.isFinite(v) ? undefined : v); });
        i.addEventListener('change', () => { const v = parseFloat(i.value); if (i.value === '' || !Number.isFinite(v)) return; const c = Math.min(p.max ?? v, Math.max(p.min ?? v, v)); if (c !== v) { i.value = c; set(c); } });
        return i;
      }
      case 'optcolor': {   // 색 (비우면 대사창 설정)
        const ok = v => /^#[0-9a-f]{6}$/i.test(v || '');
        const c = h('input', { type: 'color', value: ok(cur) ? cur : '#d0602a' }), t = h('input', { type: 'text', value: cur ?? '', placeholder: '(기본) #rrggbb', style: { width: '9em' } });
        c.addEventListener('input', () => { t.value = c.value; set(c.value); });
        t.addEventListener('input', () => { if (ok(t.value)) { c.value = t.value; set(t.value); } else if (!t.value) set(undefined); });
        const x = h('button', { class: 'btn xs', title: '비우기 (대사창 설정)', onclick: e => { e.preventDefault(); t.value = ''; set(undefined); t.dispatchEvent(new Event('change', { bubbles: true })); } }, '기본');
        return h('div', { class: 'flex gap-2 items-center' }, c, t, x);
      }
      case 'select': return sel(Object.entries(p.options || {}), { empty: '(기본)' });
      case 'cond': {
        const i = h('input', { type: 'text', class: 'mono', value: cur ?? '', placeholder: '예: favor>=200 && switch.met' });
        const m = h('small', { class: 'hint' });
        const chk = () => { const e = PDM.Cond.check(i.value); m.textContent = e ? '⚠ ' + e : ''; m.classList.toggle('bad', !!e); };
        i.addEventListener('input', () => { set(i.value); chk(); }); chk();
        return h('div', {}, i, m);
      }
      case 'options': {
        const t = h('textarea', { rows: 4, placeholder: '한 줄에 하나씩' }); t.value = (cur || ['예', '아니오']).join('\n');
        if (!cur) set(['예', '아니오']);
        t.addEventListener('input', () => set(t.value.split('\n').map(s => s.trim()).filter(Boolean)));
        return h('div', {}, t, h('small', { class: 'hint' }, '선택지 개수만큼 분기가 생깁니다'));
      }
      case 'route': {   // 이동 경로 편집 (왼쪽 = 명령 목록, 오른쪽 = 누르면 추가되는 명령 버튼)
        const list = obj.route = Array.isArray(obj.route) ? obj.route : [];
        if (obj.path && !list.length) {   // 예전 방식(칸 좌표 문자열) → 걸어가기 명령으로
          String(obj.path).trim().split(/\s+/).forEach(pt => { const m = /^(-?\d+),(-?\d+)$/.exec(pt); if (m) list.push({ op: 'goto', x: +m[1], y: +m[2] }); }); delete obj.path; }
        if (obj.wait === undefined) obj.wait = true;
        let selI = list.length;   // 선택한 줄 (list.length = 맨 끝 ◇ — 새 명령이 들어갈 자리)
        const lb = h('div', { style: { border: '1px solid var(--line)', borderRadius: '6px', minHeight: '260px', maxHeight: '340px', overflow: 'auto', background: 'var(--bg)' } });
        const detail = h('div', { class: 'mt-3' });
        const optBox = h('div', { class: 'vstack gap-1 mt-4' });
        const chk = (k, label, dis) => { const i = h('input', { type: 'checkbox', checked: !!obj[k], disabled: !!dis }); i.onchange = () => { obj[k] = i.checked; redraw(); }; return h('label', { class: 'check', style: dis ? { opacity: .5 } : {} }, i, label); };
        const redraw = () => {
          lb.innerHTML = '';
          [...list, null].forEach((o, i) => lb.append(h('div', { style: { padding: '3px 8px', cursor: 'pointer', whiteSpace: 'nowrap', background: i === selI ? 'var(--accent-soft)' : (i % 2 ? 'var(--bg2)' : ''), boxShadow: i === selI ? 'inset 2px 0 0 var(--accent)' : '' },
            onclick: () => { selI = i; redraw(); }, ondblclick: () => { if (o) { list.splice(i, 1); selI = Math.min(i, list.length); redraw(); } } }, '◇ ' + (o ? PDM.routeOpText(o) : ''))));
          detail.innerHTML = '';
          const o = list[selI];
          if (o) {
            const d = PDM.ROUTE_OP[o.op] || { params: [] };
            d.params.forEach(([k, label, t]) => detail.append(PDM.ui.field(label, paramInput(o, { k, t }, {}))));
            detail.querySelectorAll('input,select').forEach(el => el.addEventListener('change', () => { const y = lb.scrollTop; const keep = document.activeElement; redrawList(); lb.scrollTop = y; }));
            detail.append(h('div', { class: 'flex gap-2 mt-2' },
              h('button', { class: 'btn xs', onclick: e => { e.preventDefault(); if (selI > 0) { [list[selI - 1], list[selI]] = [list[selI], list[selI - 1]]; selI--; redraw(); } } }, '▲ 위로'),
              h('button', { class: 'btn xs', onclick: e => { e.preventDefault(); if (selI < list.length - 1) { [list[selI + 1], list[selI]] = [list[selI], list[selI + 1]]; selI++; redraw(); } } }, '▼ 아래로'),
              h('button', { class: 'btn xs', onclick: e => { e.preventDefault(); list.splice(selI + 1, 0, PDM.clone(o)); selI++; redraw(); } }, '복제'),
              h('button', { class: 'btn xs danger', onclick: e => { e.preventDefault(); list.splice(selI, 1); selI = Math.min(selI, list.length); redraw(); } }, '삭제')));
          } else detail.append(h('small', { class: 'hint' }, '오른쪽 명령을 누르면 맨 끝(또는 선택한 줄 다음)에 들어갑니다. 줄을 누르면 값·순서를 고치고, 두 번 누르면 지웁니다.'));
          optBox.innerHTML = '';
          optBox.append(h('b', {}, '옵션'), chk('repeat', '동작을 반복 (맵을 떠날 때까지 · 기다리지 않음)'), chk('skip', '이동할 수 없으면 건너뛰기'), chk('wait', '끝날 때까지 대기', obj.repeat));
        };
        const redrawList = () => { [...lb.children].forEach((el, i) => { if (list[i]) el.textContent = '◇ ' + PDM.routeOpText(list[i]); }); };
        const add = id => { const d = PDM.ROUTE_OP[id], o = { op: id }; d.params.forEach(([k, , , def]) => { o[k] = def; }); const pos = selI >= list.length ? list.length : selI + 1; list.splice(pos, 0, o); selI = d.params.length || pos < list.length - 1 ? pos : list.length; redraw(); if (!d.params.length) lb.scrollTop = lb.scrollHeight; };
        const cols = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(150px, 1fr))', gap: '8px', flex: 1 } },
          PDM.ROUTE_OPS.map(([g, ops]) => h('div', {}, h('div', { class: 'fl', style: { marginBottom: '3px' } }, g),
            ops.map(([id, name]) => h('button', { class: 'btn xs', style: { display: 'block', width: '100%', marginBottom: '2px' }, onclick: e => { e.preventDefault(); add(id); } }, name)))));
        redraw();
        return h('div', { class: 'flex gap-5 items-start' }, h('div', { style: { width: '230px', flex: 'none' } }, lb, detail, optBox), cols);
      }
      case 'cell': {   // 칸 좌표 (x, y) + 맵에서 보면서 고르기. p.yk = y 를 넣는 키, p.nodeKey = 맵을 넣는 키 (없으면 같은 맵 — 볼 맵을 창에서 고름)
        const yk = p.yk || 'y';
        const xi = h('input', { type: 'number', value: obj[p.k] ?? 0, style: { width: '70px' }, title: 'x (왼쪽에서 몇 번째 칸 — 0부터)' }), yi = h('input', { type: 'number', value: obj[yk] ?? 0, style: { width: '70px' }, title: 'y (위에서 몇 번째 칸 — 0부터)' });
        xi.addEventListener('input', () => { obj[p.k] = parseInt(xi.value, 10) || 0; }); yi.addEventListener('input', () => { obj[yk] = parseInt(yi.value, 10) || 0; });
        const b = h('button', { class: 'btn sm', onclick: async e => { e.preventDefault();
          const r = await PDM.pickCell({ node: p.nodeKey ? obj[p.nodeKey] : (ctx.nodeId || ''), x: obj[p.k], y: obj[yk], title: p.pickTitle });
          if (!r) return;
          obj[p.k] = r.x; obj[yk] = r.y; xi.value = r.x; yi.value = r.y;
          if (p.nodeKey && obj[p.nodeKey] !== r.node) { obj[p.nodeKey] = r.node; ctx.redraw && ctx.redraw(); }
        } }, '🗺 맵에서 고르기…');
        return h('div', { class: 'hstack' }, h('span', { class: 'hint' }, 'x'), xi, h('span', { class: 'hint' }, 'y'), yi, b);
      }
      case 'sound': return PDM.ui.soundPicker(cur, set, { allowNone: true });
      case 'switch': return sel(R('switch'), { create: () => createStoryVar('switches', '스위치') });
      case 'var': return sel(R('var'), { create: () => createStoryVar('variables', '변수') });
      case 'terrain': return sel(R('terrain'), { number: true });
      case 'image': {
        const i = h('input', { type: 'text', value: cur ?? '', placeholder: 'assets/illustrations/...' });
        i.addEventListener('input', () => set(i.value));
        const b = h('button', { class: 'btn sm', onclick: async e => { e.preventDefault(); const r = await PDM.ui.pickImage('illustrations'); if (r) { i.value = r; set(r); } } }, '찾기…');
        return h('div', { class: 'imgpick' }, i, b);
      }
      case 'char': case 'charHero': case 'item': case 'event': case 'node': case 'group': case 'room': case 'route': case 'ending': case 'heartAction': case 'heartRequest': case 'topic': case 'heartStat': case 'face': case 'trait': case 'textfx': case 'effect': case 'filter': case 'trailer': case 'badge': case 'quest':
        return sel(R(p.t), { empty: p.t === 'face' ? '(기본)' : '(선택 안 함)' });
      default: { const i = h('input', { type: 'text', value: cur ?? '' }); i.addEventListener('input', () => set(i.value)); return i; }
    }
  }
  // ---------- 탭으로 나눈 칸 (대사 · 대사 스타일: 내용 · 글꼴 · 출력 · 연출 · 미리보기) ----------
  const lastTab = {};   // 명령 종류별 마지막으로 연 탭 (창 · 속성 창을 다시 열어도)
  /** def.params 를 body 에 그림. def.tabs 가 있으면 탭 줄 + 탭마다 칸. onField(el) = 칸마다 (속성 창이 input/change 를 받음) · ctx.previewOf() = 미리보기에 쓸 이벤트 스타일 */
  function renderParams(def, obj, ctx, body, onField) {
    const fieldOf = p => { const el = PDM.ui.field(p.label, paramInput(obj, p, ctx)); el.dataset.k = p.k; if (onField) onField(el); return el; };
    if (!def.tabs) { def.params.forEach(p => body.append(fieldOf(p))); return; }
    let cur = lastTab[obj.cmd] || def.tabs[0][0], stopPv = null;
    const bar = h('div', { class: 'seg tabs-cmd mb-3', role: 'tablist' }), pane = h('div', { class: 'cmd-tab' });
    const show = id => {
      cur = lastTab[obj.cmd] = id;
      if (stopPv) { stopPv(); stopPv = null; }
      bar.querySelectorAll('button').forEach(b => { const on = b.dataset.tab === id; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
      pane.innerHTML = '';
      if (id === 'preview') { stopPv = preview(def, obj, ctx, pane); return; }
      const ps = def.params.filter(p => (p.tab || 'main') === id);
      ps.forEach(p => pane.append(fieldOf(p)));
      if (id !== 'main') pane.append(h('p', { class: 'hint mt-2' }, '빈 칸 = 다음 단계 값: 이 대사 → 이벤트의 "대사 스타일" 명령 → 대사창 설정(대사창 편집기) → 기본값'));
    };
    def.tabs.forEach(([id, label]) => bar.append(h('button', { type: 'button', class: 'chip', role: 'tab', 'data-tab': id, onclick: e => { e.preventDefault(); show(id); } }, label)));
    body.append(bar, pane);
    show(def.tabs.some(t => t[0] === cur) ? cur : def.tabs[0][0]);
    // 칸을 다시 그려 미리보기가 화면에서 빠지면 그 재생은 스스로 멈춤 (PDM.Dialogue.render 의 타이머 · 프레임이 isConnected 를 봄)
  }
  /** 미리보기 탭: 게임 대사창과 같은 계산(PDM.Dialogue.render)으로 이 대사 · 스타일을 재생 — 되풀이 단추. 반환 = 멈추기 */
  function preview(def, obj, ctx, pane) {
    if (!PDM.Dialogue) { pane.append(h('p', { class: 'hint' }, '대사창 미리보기를 쓸 수 없습니다.')); return () => {}; }
    const stage = h('div', { class: 'dlg-stage cmd-pv' }), info = h('p', { class: 'hint mt-2' });
    // 화면 비율 = 이 프로젝트의 테스트 실행 환경 (휴대폰이면 그 기기의 논리 화면 — 세로면 세로 상자). PC = 16:9
    const te = PDM.testEnv ? PDM.testEnv.resolve((PDM.store.get('project') || {}).testplay) : null;
    const ar = te && te.kind === 'phone' ? te.logical : [16, 9];
    stage.style.aspectRatio = `${ar[0]} / ${ar[1]}`;
    if (ar[0] < ar[1]) { stage.style.width = Math.round(100 * Math.min(1, 0.62)) + '%'; stage.style.margin = '0 auto'; }
    const envNote = te ? ` · 화면: ${te.name}${te.kind === 'phone' ? ` ${te.logical[0]}×${te.logical[1]}` : ' 16:9'}` : '';
    let r = null, gen = 0;
    const play = async () => {
      const my = ++gen; if (r) { r.stop(); r.el.remove(); r = null; }
      const style = obj.cmd === 'textStyle' ? (obj.reset ? null : obj) : (ctx && ctx.styleBefore ? ctx.styleBefore() : null);
      const l = obj.cmd === 'textStyle' ? PDM.Dialogue.line('', '', '', '글자 **강조** 미리보기 — 가나다라 English 123', {}) : PDM.Dialogue.line(obj.speaker, obj.face, obj.illust, obj.text || '', {});
      if (obj.cmd === 'textStyle') l.name = '미리보기'; else { if (obj.name) l.name = obj.name; if (obj.side) l.side = obj.side; }
      PDM.Dialogue.styleLine(l, obj.cmd === 'textStyle' ? {} : obj, style);
      const res = await PDM.Dialogue.render(stage, l, {});
      if (my !== gen || !stage.isConnected) { res.stop(); res.el.remove(); return; }
      r = res;
      info.textContent = PDM.Dialogue.describeLine(l) + (style && obj.cmd !== 'textStyle' ? ' · 이 이벤트의 앞선 "대사 스타일"을 함께 씀' : '') + envNote;
    };
    pane.append(stage, h('div', { class: 'flex gap-2 mt-2' }, h('button', { type: 'button', class: 'btn sm', onclick: e => { e.preventDefault(); play(); } }, '다시 재생'), h('span', { class: 'hint' }, '누르면 글자를 다 보임 (게임과 같음)')), info);
    stage.addEventListener('click', () => { if (r && r.typing()) r.finish(); });
    requestAnimationFrame(play);
    return () => { gen++; if (r) { r.stop(); r.el.remove(); r = null; } };
  }
  async function createStoryVar(listKey, label) {
    const id = await PDM.ui.prompt(`새 ${label} id (영문)`, ''); if (!id) return null;
    const clean = PDM.slugId(id);
    PDM.store.edit('story', `${label} 추가`, r => { r[listKey] = r[listKey] || []; if (!r[listKey].some(x => x.id === clean)) r[listKey].push({ id: clean, name: id, group: '', note: '' }); }, { silent: true });
    return clean;
  }

  /** 이동 루트만 고치는 창 (이벤트 페이지의 자율 이동 "사용자 지정"). obj = { route, repeat, skip } — 확인하면 고친 사본, 취소하면 null */
  PDM.editRouteModal = async function (obj, title) {
    const o = PDM.clone(obj || {}); o.wait = false;
    const body = h('div', { style: { minWidth: '700px' } }, paramInput(o, { k: 'route', t: 'route' }, {}));
    const ok = await PDM.ui.modal(title || '이동 루트', body, [['취소', false], ['확인', true, 'pri']]);
    if (!ok) return null;
    delete o.wait; return o;
  };
  PDM.editCommandModal = async function (cmd, isNew, mopts = {}) {
    const def = PDM.COMMANDS[cmd.cmd];
    if (!def) { toast('알 수 없는 명령: ' + cmd.cmd, 'bad'); return null; }
    const obj = PDM.clone(cmd);
    const body = h('div', { style: { minWidth: '460px' } });
    const draw = () => {
      body.innerHTML = '';
      if (!def.params.length) body.append(h('p', { class: 'hint' }, '설정할 값이 없습니다.'));
      renderParams(def, obj, { onCharChange: () => { if (def.params.some(x => x.t === 'face')) draw(); }, redraw: () => draw(), styleBefore: () => (mopts.styleBefore ? mopts.styleBefore() : null) }, body);
    };
    draw();
    const ok = await PDM.ui.modal((isNew ? '새 명령: ' : '명령 편집: ') + def.name, body, [['취소', false], ['확인', true, 'pri']]);
    if (!ok) return null;
    return normBlocks(def, obj);
  };
  /** 블록 명령의 하위 목록 모양 맞추기 (선택지 수 = 갈래 수 · 조건 분기 then/else · 반복 body) */
  function normBlocks(def, obj) {
    if (def.block === 'branches') {
      obj.branches = obj.branches || [];
      while (obj.branches.length < (obj.options || []).length) obj.branches.push([]);
      obj.branches.length = (obj.options || []).length;
    }
    if (def.block === 'ifelse') { obj.then = obj.then || []; obj.else = obj.else || []; }
    if (def.block === 'body') obj.body = obj.body || [];
    return obj;
  }
  /** 명령 한 줄의 빠진 값 (목록의 ⚠ 표시 · 속성 창) — 실행은 되지만 아무 일도 하지 않거나 게임에서 건너뜀. 자세한 참조 검사는 검사(F7) */
  const REQUIRED = { text: ['text'], illust: ['image'], illustMove: [], sound: ['file'], call: ['event'], transfer: ['node'], choice: ['options'], textfx: ['fx'], effect: ['fx'], trailer: ['id'], giveItem: ['item'], switch: ['id'], var: ['id'] };
  function problems(c) {
    const def = PDM.COMMANDS[c.cmd];
    if (!def) return [`알 수 없는 명령 "${c.cmd}" (플러그인이 꺼져 있나요?)`];
    return (REQUIRED[c.cmd] || []).filter(k => !(c.cmd === 'sound' && c.kind === 'bgmStop')).filter(k => { const v = c[k]; return v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length); })
      .map(k => `"${((def.params || []).find(p => p.k === k) || {}).label || k}" 이(가) 비어 있습니다`);
  }
  PDM.commandProblems = problems;

  /** 명령 고르기 메뉴 (분류별) */
  function pickCommand(x, y) {
    return new Promise(res => {
      const groups = {};
      Object.entries(PDM.COMMANDS).forEach(([id, d]) => { (groups[d.g] = groups[d.g] || []).push([id, d]); });
      const grid = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(160px, 1fr))', gap: '10px' } },
        Object.entries(groups).map(([g, list]) => h('div', { class: 'cmd-grp' }, h('div', { class: 'fl mb-2' }, g),
          list.map(([id, d]) => h('button', { class: 'btn sm cmd-pick', 'data-name': (d.name + ' ' + id + ' ' + g).toLowerCase(), style: { display: 'block', width: '100%', textAlign: 'left', marginBottom: '3px' },
            onclick: () => { PDM.$('.modal-bg').remove(); res(id); } }, d.name + (d.plugin ? ' 🧩' : ''))))));
      // 이름으로 찾기 — 글자를 치면 맞는 명령만, Enter = 첫 번째
      const q = h('input', { type: 'search', placeholder: '명령 찾기 (예: 대사 · 일러스트 · 소리 · 대기)', class: 'w-full mb-4' });
      q.addEventListener('input', () => { const t = q.value.trim().toLowerCase(); grid.querySelectorAll('.cmd-pick').forEach(b => { b.hidden = !!t && !b.dataset.name.includes(t); }); grid.querySelectorAll('.cmd-grp').forEach(gr => { gr.hidden = ![...gr.querySelectorAll('.cmd-pick')].some(b => !b.hidden); }); });
      q.addEventListener('keydown', e => { if (e.key === 'Enter') { const b = [...grid.querySelectorAll('.cmd-pick')].find(x => !x.hidden); if (b) { e.preventDefault(); b.click(); } } });
      PDM.ui.modal('명령 넣기', h('div', {}, q, grid), [['취소', null]]).then(v => { if (v === null) res(null); });
      setTimeout(() => q.focus(), 30);
    });
  }

  // ---------- 목록 그리기 ----------
  // 목록마다 고른 명령 (탭을 다시 그려도 — 실행 취소 · 다른 편집 뒤 — 같은 명령을 고른 채로)
  const SEL = new Map();
  PDM.commandList = function (key, path, opts = {}) {
    const wrap = h('div', { class: 'cmdlist', tabindex: 0 });
    const selKey = key + '|' + JSON.stringify(path);
    let sel = SEL.get(selKey) || null;   // 선택한 명령의 경로 (store 경로)
    const setSel = p => { sel = p; if (p) SEL.set(selKey, p); else SEL.delete(selKey); };
    const arrAt = p => PDM.deepGet(PDM.store.get(key), p);

    function rows() {
      const out = []; let n = 0;
      const walk = (p, d) => {
        const arr = arrAt(p) || [];
        arr.forEach((c, i) => {
          const def = PDM.COMMANDS[c.cmd] || { g: '확장', name: c.cmd, sum: () => c.cmd };
          let s; try { s = def.sum ? def.sum(c) : def.name; } catch (_) { s = def.name; }
          out.push({ kind: 'cmd', path: [...p, i], arr: p, i, d, g: def.g, text: s, cmd: c, n: ++n });   // n = 실행 순서대로 매긴 번호 (목록 · 속성 창 제목)
          if (def.block === 'ifelse') {
            walk([...p, i, 'then'], d + 1);
            out.push({ kind: 'branch', d, text: '그 외' });
            walk([...p, i, 'else'], d + 1);
            out.push({ kind: 'branch', d, text: '분기 끝' });
          } else if (def.block === 'branches') {
            (c.options || []).forEach((opt, bi) => { out.push({ kind: 'branch', d, text: `「${opt}」 를 골랐을 때` }); walk([...p, i, 'branches', bi], d + 1); });
            out.push({ kind: 'branch', d, text: '선택 끝' });
          } else if (def.block === 'body') {
            walk([...p, i, 'body'], d + 1);
            out.push({ kind: 'branch', d, text: '반복 끝' });
          }
        });
        out.push({ kind: 'ins', arr: p, i: arr.length, d });
      };
      walk(path, 0);
      return out;
    }

    async function insertAt(arrPath, i) {
      const id = await pickCommand(); if (!id) return;
      const base = { cmd: id };
      if (opts.defaultSpeaker && (id === 'text')) base.speaker = opts.defaultSpeaker;
      const c = await PDM.editCommandModal(base, true, { styleBefore: () => styleBefore({ arr: arrPath, i }) }); if (!c) return;
      setSel([...arrPath, i]);
      PDM.store.edit(key, '명령 추가: ' + PDM.COMMANDS[id].name, r => {
        let a = PDM.deepGet(r, arrPath); if (!a) { PDM.deepSet(r, arrPath, []); a = PDM.deepGet(r, arrPath); }
        a.splice(i, 0, c);
      });
    }
    async function editAt(row) {
      const c = await PDM.editCommandModal(row.cmd, false, { styleBefore: () => styleBefore(row) }); if (!c) return;
      PDM.store.edit(key, '명령 편집', r => { PDM.deepGet(r, row.arr)[row.i] = c; });
    }
    function removeAt(row) { setSel(null); PDM.store.edit(key, '명령 삭제', r => { PDM.deepGet(r, row.arr).splice(row.i, 1); }); }
    function duplicateAt(row) { setSel([...row.arr, row.i + 1]); PDM.store.edit(key, '명령 복제', r => { const a = PDM.deepGet(r, row.arr); a.splice(row.i + 1, 0, PDM.clone(a[row.i])); }); }
    // 명령 복사는 공용 클립보드(PDM.clip, kind 'cmds')에도 — 다른 이벤트 · 캐릭터 행동에도 붙여 넣을 수 있음
    const copyCmd = cmd => { clipboard = [PDM.clone(cmd)]; PDM.clip.set('cmds', clipboard, '명령 ' + ((PDM.COMMANDS[cmd.cmd] || {}).name || cmd.cmd)); };
    const curClip = () => { const c = PDM.clip.peek(); return c && c.kind === 'cmds' ? PDM.clone(c.payload) : clipboard; };
    function paste(arrPath, i) {
      const clipboard = curClip();
      if (!clipboard) return;
      PDM.store.edit(key, '명령 붙여넣기', r => { let a = PDM.deepGet(r, arrPath); if (!a) { PDM.deepSet(r, arrPath, []); a = PDM.deepGet(r, arrPath); } a.splice(i, 0, ...PDM.clone(clipboard)); });
    }
    function move(row, dir) {
      const j = row.i + dir, n = (arrAt(row.arr) || []).length; if (j < 0 || j >= n) return;
      setSel([...row.arr, j]);
      PDM.store.edit(key, '명령 이동', r => { const a = PDM.deepGet(r, row.arr); [a[row.i], a[j]] = [a[j], a[row.i]]; });
    }
    const selRow = () => sel && rows().find(r => r.path && JSON.stringify(r.path) === JSON.stringify(sel));
    /** 이 자리(arr, i) 앞에서 마지막으로 실행되는 "대사 스타일" (목록 순서 — 런타임처럼 이벤트 안에서 이어짐). 되돌리기면 null */
    function styleBefore(at) {
      const list = rows(), key0 = JSON.stringify([...at.arr, at.i]);
      let end = list.findIndex(r => r.path && JSON.stringify(r.path) === key0); if (end < 0) end = list.length;
      for (let j = end - 1; j >= 0; j--) { const c = list[j].kind === 'cmd' && list[j].cmd; if (c && c.cmd === 'textStyle') return c.reset ? null : c; }
      return null;
    }

    /** 고른 명령의 속성을 오른쪽 속성 창에서 바로 고침 (같은 칸들 — 대화 상자와 같은 paramInput).
     *  고친 값은 잠깐(0.4초) 모았다가 store.edit 한 번 = 실행 취소 한 번. 목록 글만 다시 쓰고 속성 창은 그대로 두어 입력 중 초점을 잃지 않음 */
    let pending = null;
    function showProps() {
      if (opts.inspector === false || !PDM.inspector) return;
      const row = selRow();
      if (!row) { PDM.inspector.show(opts.title || '이벤트 명령', h('div', { class: 'empty' }, '명령을 누르면 여기서 바로 고칠 수 있습니다. ◇ 줄 더블클릭 · "+ 명령 추가" = 새 명령, 더블클릭 = 큰 창으로 편집.')); return; }
      const def = PDM.COMMANDS[row.cmd.cmd];
      if (!def) { PDM.inspector.show('알 수 없는 명령', h('div', { class: 'c-bad' }, problems(row.cmd)[0])); return; }
      const at = { arr: row.arr, i: row.i }, body = h('div', {});
      const obj = new Proxy(PDM.clone(row.cmd), { set(t, k, v) { t[k] = v; schedule(); return true; } });   // 칸이 값을 넣으면(찾기… 창 · 맵에서 고르기 포함) 저장 예약
      const commit = () => {
        pending = null;
        const cur = (arrAt(at.arr) || [])[at.i]; if (!cur || cur.cmd !== obj.cmd) return;   // 그사이 지워졌거나 바뀜
        const next = normBlocks(def, Object.assign(PDM.clone(obj), { then: cur.then, else: cur.else, body: cur.body, branches: cur.branches }));
        ['then', 'else', 'body', 'branches'].forEach(k => { if (next[k] === undefined) delete next[k]; });
        normBlocks(def, next);
        if (JSON.stringify(next) === JSON.stringify(cur)) return;
        PDM.store.edit(key, '명령 편집: ' + def.name, r => { PDM.deepGet(r, at.arr)[at.i] = next; }, { silent: !def.block });   // 블록(선택지 갈래 수)이 바뀔 수 있으면 목록을 다시 그림
        draw(); probe();
      };
      function schedule() { clearTimeout(pending); pending = setTimeout(commit, 400); }
      const probe = () => { const pr = problems(obj), box = body.querySelector('.cmd-probs'); if (box) box.textContent = pr.length ? '⚠ ' + pr.join(' · ') : ''; };
      const fields = () => {
        body.innerHTML = '';
        body.append(h('div', { class: 'cmd-probs c-warn mb-3' }));
        if (!def.params.length) body.append(h('p', { class: 'c-mute' }, '설정할 값이 없습니다.'));
        renderParams(def, obj, { onCharChange: () => { if (def.params.some(x => x.t === 'face')) fields(); }, redraw: () => fields(), styleBefore: () => styleBefore(at) }, body, el => {
          el.addEventListener('input', schedule); el.addEventListener('change', schedule);   // 목록 · 경로처럼 안쪽 배열을 바로 고치는 칸
        });
        body.append(h('div', { class: 'flex gap-2 wrap mt-4' },
          h('button', { class: 'btn sm', onclick: () => { commit(); editAt(selRow()); } }, '큰 창으로 편집…'),
          h('button', { class: 'btn sm', onclick: () => { commit(); duplicateAt(selRow()); } }, '복제'),
          h('button', { class: 'btn sm danger', onclick: () => { clearTimeout(pending); removeAt(selRow()); } }, '삭제')));
        probe();
      };
      fields();
      PDM.inspector.show(`${row.n}. ${def.name}`, body);
    }

    function draw() {
      wrap.innerHTML = '';
      const list = rows();
      // 도구 줄: 명령 추가(고른 명령 다음 · 없으면 끝) · 복제 · 위/아래 · 삭제
      const cur = selRow(), top = arrAt(path) || [];
      const tb = (label, tip, fn, dis, cls) => h('button', { class: 'btn xs' + (cls ? ' ' + cls : ''), title: tip, disabled: dis, onclick: e => { e.stopPropagation(); fn(); } }, label);
      wrap.append(h('div', { class: 'cmd-bar' },
        tb('+ 명령 추가', '고른 명령 다음에 (없으면 맨 끝에) 새 명령 — ◇ 줄 더블클릭과 같음', () => cur ? insertAt(cur.arr, cur.i + 1) : insertAt(path, top.length), false, 'add'),
        tb('복제', '고른 명령 복제', () => duplicateAt(cur), !cur), tb('▲', '위로', () => move(cur, -1), !cur || cur.i === 0), tb('▼', '아래로', () => move(cur, 1), !cur || cur.i >= (arrAt(cur.arr) || []).length - 1),
        tb('삭제', 'Delete', () => removeAt(cur), !cur, 'danger'), h('span', { class: 'grow' }), h('span', { class: 'c-dim fs-xs' }, `명령 ${list.filter(r => r.kind === 'cmd').length}개`)));
      list.forEach(r => {
        const same = sel && r.path && JSON.stringify(sel) === JSON.stringify(r.path);
        if (r.kind === 'cmd') {
          const pr = problems(r.cmd);
          wrap.append(h('div', { class: `cmd g-${r.g}` + (same ? ' sel' : '') + (pr.length ? ' bad' : ''), style: { '--d': r.d }, title: pr.length ? '⚠ ' + pr.join(' · ') : '',
            onclick: () => { setSel(r.path); draw(); showProps(); },
            ondblclick: () => editAt(r),
            oncontextmenu: e => { e.preventDefault(); setSel(r.path); draw(); showProps(); PDM.ui.menu(e.clientX, e.clientY, [
              { label: '편집…', run: () => editAt(r) },
              { label: '위에 새 명령…', run: () => insertAt(r.arr, r.i) },
              '-',
              { label: '복사', hint: PDM.keys.label('copy'), run: () => copyCmd(r.cmd) },
              { label: '위에 붙여넣기', hint: PDM.keys.label('paste'), run: () => paste(r.arr, r.i), disabled: !curClip() },
              { label: '복제', run: () => duplicateAt(r) },
              { label: '위로', run: () => move(r, -1) }, { label: '아래로', run: () => move(r, 1) },
              '-',
              { label: '삭제', hint: 'Del', run: () => removeAt(r) }]); } },
            h('span', { class: 'cn' }, r.n), h('span', { class: 'cg' }, pr.length ? '⚠' : '◆'), h('span', { class: 'cs' }, r.text)));
        } else if (r.kind === 'branch') {
          wrap.append(h('div', { class: 'cmd branch', style: { '--d': r.d } }, h('span', { class: 'cg' }, ':'), h('span', { class: 'cs' }, r.text)));
        } else {
          wrap.append(h('div', { class: 'cmd ins', style: { '--d': r.d }, title: '더블클릭해서 명령 넣기',
            ondblclick: () => insertAt(r.arr, r.i),
            oncontextmenu: e => { e.preventDefault(); PDM.ui.menu(e.clientX, e.clientY, [{ label: '새 명령…', run: () => insertAt(r.arr, r.i) }, { label: '붙여넣기', run: () => paste(r.arr, r.i), disabled: !clipboard }]); } },
            h('span', { class: 'cg' }, '◇'), h('span', { class: 'cs' }, r.d === 0 && r.i === 0 ? '(비어 있음 — 더블클릭해서 명령 넣기)' : '')));
        }
      });
    }
    wrap.addEventListener('keydown', e => {
      if (!sel) return;
      const row = rows().find(r => r.path && JSON.stringify(r.path) === JSON.stringify(sel)); if (!row) return;
      if (e.key === 'Delete') { e.preventDefault(); removeAt(row); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {   // 위 · 아래 명령 고르기 (Alt = 옮기기)
        e.preventDefault();
        if (e.altKey) { move(row, e.key === 'ArrowUp' ? -1 : 1); return; }
        const cmds = rows().filter(r => r.kind === 'cmd'), k = cmds.findIndex(r => JSON.stringify(r.path) === JSON.stringify(sel)), nx = cmds[k + (e.key === 'ArrowUp' ? -1 : 1)];
        if (nx) { setSel(nx.path); draw(); showProps(); }
      }
      else if (e.key === 'Enter') { e.preventDefault(); editAt(row); }
      else if (PDM.keys.is(e, 'copy')) { e.preventDefault(); e.stopPropagation(); copyCmd(row.cmd); }
      else if (PDM.keys.is(e, 'paste')) { e.preventDefault(); e.stopPropagation(); paste(row.arr, row.i + 1); }
    });
    draw();
    if (sel && selRow()) setTimeout(() => { if (wrap.isConnected) showProps(); }, 0);   // 다시 그린 뒤에도 고른 명령의 속성 창
    else if (sel) setSel(null);
    wrap.redraw = draw;
    return wrap;
  };
})();
