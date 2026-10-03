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
        const detail = h('div', { style: { marginTop: '6px' } });
        const optBox = h('div', { style: { marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '2px' } });
        const chk = (k, label, dis) => { const i = h('input', { type: 'checkbox', checked: !!obj[k], disabled: !!dis }); i.onchange = () => { obj[k] = i.checked; redraw(); }; return h('label', { class: 'check', style: dis ? { opacity: .5 } : {} }, i, label); };
        const redraw = () => {
          lb.innerHTML = '';
          [...list, null].forEach((o, i) => lb.append(h('div', { style: { padding: '3px 8px', cursor: 'pointer', whiteSpace: 'nowrap', background: i === selI ? 'var(--accent)' : (i % 2 ? 'var(--bg2)' : ''), color: i === selI ? '#fff' : '' },
            onclick: () => { selI = i; redraw(); }, ondblclick: () => { if (o) { list.splice(i, 1); selI = Math.min(i, list.length); redraw(); } } }, '◇ ' + (o ? PDM.routeOpText(o) : ''))));
          detail.innerHTML = '';
          const o = list[selI];
          if (o) {
            const d = PDM.ROUTE_OP[o.op] || { params: [] };
            d.params.forEach(([k, label, t]) => detail.append(PDM.ui.field(label, paramInput(o, { k, t }, {}))));
            detail.querySelectorAll('input,select').forEach(el => el.addEventListener('change', () => { const y = lb.scrollTop; const keep = document.activeElement; redrawList(); lb.scrollTop = y; }));
            detail.append(h('div', { style: { display: 'flex', gap: '4px', marginTop: '4px' } },
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
        return h('div', { style: { display: 'flex', gap: '10px', alignItems: 'flex-start' } }, h('div', { style: { width: '230px', flex: 'none' } }, lb, detail, optBox), cols);
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
      case 'char': case 'charHero': case 'item': case 'event': case 'node': case 'group': case 'room': case 'route': case 'ending': case 'heartAction': case 'heartRequest': case 'topic': case 'heartStat': case 'face': case 'trait': case 'textfx': case 'effect': case 'filter': case 'trailer':
        return sel(R(p.t), { empty: p.t === 'face' ? '(기본)' : '(선택 안 함)' });
      default: { const i = h('input', { type: 'text', value: cur ?? '' }); i.addEventListener('input', () => set(i.value)); return i; }
    }
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
  PDM.editCommandModal = async function (cmd, isNew) {
    const def = PDM.COMMANDS[cmd.cmd];
    if (!def) { toast('알 수 없는 명령: ' + cmd.cmd, 'bad'); return null; }
    const obj = PDM.clone(cmd);
    const body = h('div', { style: { minWidth: '460px' } });
    const draw = () => {
      body.innerHTML = '';
      if (!def.params.length) body.append(h('p', { class: 'hint' }, '설정할 값이 없습니다.'));
      def.params.forEach(p => body.append(PDM.ui.field(p.label, paramInput(obj, p, { onCharChange: () => { if (def.params.some(x => x.t === 'face')) draw(); } }))));
    };
    draw();
    const ok = await PDM.ui.modal((isNew ? '새 명령: ' : '명령 편집: ') + def.name, body, [['취소', false], ['확인', true, 'pri']]);
    if (!ok) return null;
    if (def.block === 'branches') {
      obj.branches = obj.branches || [];
      while (obj.branches.length < (obj.options || []).length) obj.branches.push([]);
      obj.branches.length = (obj.options || []).length;
    }
    if (def.block === 'ifelse') { obj.then = obj.then || []; obj.else = obj.else || []; }
    if (def.block === 'body') obj.body = obj.body || [];
    return obj;
  };

  /** 명령 고르기 메뉴 (분류별) */
  function pickCommand(x, y) {
    return new Promise(res => {
      const groups = {};
      Object.entries(PDM.COMMANDS).forEach(([id, d]) => { (groups[d.g] = groups[d.g] || []).push([id, d]); });
      const box = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(160px, 1fr))', gap: '10px' } },
        Object.entries(groups).map(([g, list]) => h('div', {}, h('div', { class: 'fl', style: { marginBottom: '4px' } }, g),
          list.map(([id, d]) => h('button', { class: 'btn sm', style: { display: 'block', width: '100%', textAlign: 'left', marginBottom: '3px' },
            onclick: () => { PDM.$('.modal-bg').remove(); res(id); } }, d.name + (d.plugin ? ' 🧩' : ''))))));
      PDM.ui.modal('명령 넣기', box, [['취소', null]]).then(v => { if (v === null) res(null); });
    });
  }

  // ---------- 목록 그리기 ----------
  PDM.commandList = function (key, path, opts = {}) {
    const wrap = h('div', { class: 'cmdlist', tabindex: 0 });
    let sel = null;   // 선택한 명령의 경로 (store 경로)
    const arrAt = p => PDM.deepGet(PDM.store.get(key), p);

    function rows() {
      const out = [];
      const walk = (p, d) => {
        const arr = arrAt(p) || [];
        arr.forEach((c, i) => {
          const def = PDM.COMMANDS[c.cmd] || { g: '확장', name: c.cmd, sum: () => c.cmd };
          let s; try { s = def.sum ? def.sum(c) : def.name; } catch (_) { s = def.name; }
          out.push({ kind: 'cmd', path: [...p, i], arr: p, i, d, g: def.g, text: s, cmd: c });
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
      const c = await PDM.editCommandModal(base, true); if (!c) return;
      PDM.store.edit(key, '명령 추가: ' + PDM.COMMANDS[id].name, r => {
        let a = PDM.deepGet(r, arrPath); if (!a) { PDM.deepSet(r, arrPath, []); a = PDM.deepGet(r, arrPath); }
        a.splice(i, 0, c);
      });
      sel = [...arrPath, i];
    }
    async function editAt(row) {
      const c = await PDM.editCommandModal(row.cmd, false); if (!c) return;
      PDM.store.edit(key, '명령 편집', r => { PDM.deepGet(r, row.arr)[row.i] = c; });
    }
    function removeAt(row) { PDM.store.edit(key, '명령 삭제', r => { PDM.deepGet(r, row.arr).splice(row.i, 1); }); sel = null; }
    function paste(arrPath, i) {
      if (!clipboard) return;
      PDM.store.edit(key, '명령 붙여넣기', r => { let a = PDM.deepGet(r, arrPath); if (!a) { PDM.deepSet(r, arrPath, []); a = PDM.deepGet(r, arrPath); } a.splice(i, 0, ...PDM.clone(clipboard)); });
    }
    function move(row, dir) {
      PDM.store.edit(key, '명령 이동', r => { const a = PDM.deepGet(r, row.arr); const j = row.i + dir; if (j < 0 || j >= a.length) return; [a[row.i], a[j]] = [a[j], a[row.i]]; });
      sel = [...row.arr, row.i + dir];
    }

    function draw() {
      wrap.innerHTML = '';
      const list = rows();
      list.forEach(r => {
        const same = sel && r.path && JSON.stringify(sel) === JSON.stringify(r.path);
        if (r.kind === 'cmd') {
          wrap.append(h('div', { class: `cmd g-${r.g}` + (same ? ' sel' : ''), style: { '--d': r.d },
            onclick: () => { sel = r.path; draw(); },
            ondblclick: () => editAt(r),
            oncontextmenu: e => { e.preventDefault(); sel = r.path; draw(); PDM.ui.menu(e.clientX, e.clientY, [
              { label: '편집…', run: () => editAt(r) },
              { label: '위에 새 명령…', run: () => insertAt(r.arr, r.i) },
              '-',
              { label: '복사', hint: 'Ctrl+C', run: () => { clipboard = [PDM.clone(r.cmd)]; toast('복사했습니다'); } },
              { label: '위에 붙여넣기', hint: 'Ctrl+V', run: () => paste(r.arr, r.i), disabled: !clipboard },
              { label: '위로', run: () => move(r, -1) }, { label: '아래로', run: () => move(r, 1) },
              '-',
              { label: '삭제', hint: 'Del', run: () => removeAt(r) }]); } },
            h('span', { class: 'cg' }, '◆'), h('span', { class: 'cs' }, r.text)));
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
      else if (e.key === 'Enter') { e.preventDefault(); editAt(row); }
      else if (e.ctrlKey && e.key === 'c') { clipboard = [PDM.clone(row.cmd)]; toast('복사했습니다'); }
      else if (e.ctrlKey && e.key === 'v') { e.preventDefault(); paste(row.arr, row.i + 1); }
    });
    draw();
    wrap.redraw = draw;
    return wrap;
  };
})();
