// ================================================================
//  IDE 셸 — 메뉴 · 툴바 · 리소스 트리 · 탭 · 인스펙터 · 출력창
// ================================================================
(function () {
  const { h } = PDM;
  const store = PDM.store;
  const RECENT_KEY = 'pdmaker_recent_v1';

  // ---------------- 출력창 ----------------
  PDM.log = function (msg, kind) {
    const body = $('#logBody'); if (!body) return;
    const t = new Date().toTimeString().slice(0, 8);
    body.append(h('div', { class: 'log-l ' + (kind || '') }, `${t}  ${msg}`));
    while (body.childElementCount > 2000) body.firstChild.remove();
    body.scrollTop = body.scrollHeight;
  };
  function showBottom(which) {
    $$('.btab').forEach(b => b.classList.toggle('on', b.dataset.b === which));
    $('#logBody').hidden = which !== 'log'; $('#checkBody').hidden = which !== 'check';
  }

  // ---------------- 인스펙터 ----------------
  PDM.inspector = {
    show(title, el) { $('#inspTitle').textContent = title || '인스펙터'; const b = $('#inspBody'); b.innerHTML = ''; if (el) b.append(el); },
    clear() { this.show('인스펙터', h('div', { class: 'empty' }, '선택한 것이 없습니다')); }
  };

  // ---------------- 탭 ----------------
  const tabs = [];     // { key, el, editor, scroll }
  let active = null;
  PDM.tabs = {
    open(key) {
      let t = tabs.find(x => x.key === key);
      if (!t) {
        const editor = PDM.editorFor(key);
        if (!editor) { toast('열 수 없는 항목: ' + key, 'bad'); return; }
        t = { key, editor, el: h('div', { class: 'tabpage' }) };
        tabs.push(t);
        render(t);
      }
      activate(t);
      return t;
    },
    close(key) {
      const i = tabs.findIndex(x => x.key === key); if (i < 0) return;
      const t = tabs[i]; t.dispose && t.dispose();
      tabs.splice(i, 1);
      if (active === t) { active = null; if (tabs.length) activate(tabs[Math.min(i, tabs.length - 1)]); else { $('#tabbody').innerHTML = ''; PDM.inspector.clear(); } }
      drawTabbar();
    },
    closeAll() { tabs.slice().forEach(t => this.close(t.key)); },
    refresh(key) { tabs.filter(t => !key || t.key === key).forEach(render); },
    get active() { return active && active.key; }
  };
  function render(t) {
    const body = $('#tabbody');
    const keep = active === t ? body.scrollTop : (t.scroll || 0);
    t.dispose && t.dispose(); t.dispose = null;
    // ctx 는 탭마다 하나 (ctx.state / ctx.st 에 둔 화면 상태가 다시 그려도 유지됨)
    const ctx = t.ctx = t.ctx || { refresh: () => render(t), onDispose: fn => { t.dispose = fn; }, key: t.key };
    let el;
    try {
      el = t.editor.render(t.key, ctx);
    } catch (e) {
      console.error(e);
      el = h('div', { class: 'page' }, h('h1', {}, '이 화면을 그리다 오류가 났습니다'), h('pre', { class: 'mono' }, e.stack || String(e)));
    }
    t.el.innerHTML = ''; t.el.append(el);
    if (active === t) { body.innerHTML = ''; body.append(t.el); body.scrollTop = keep; }
    drawTabbar();
  }
  function activate(t) {
    if (active && active !== t) active.scroll = $('#tabbody').scrollTop;
    active = t;
    const body = $('#tabbody'); body.innerHTML = ''; body.append(t.el); body.scrollTop = t.scroll || 0;
    if (!t.el.childElementCount) render(t);
    drawTabbar(); markTree();
    PDM.inspector.clear();
    t.editor.onActivate && t.editor.onActivate(t.key);
  }
  function drawTabbar() {
    const bar = $('#tabbar'); bar.innerHTML = '';
    tabs.forEach(t => {
      const dirty = store.dirtyKeys().includes(t.key);
      const title = safe(() => t.editor.title(t.key), t.key);
      bar.append(h('div', { class: 'tab' + (t === active ? ' on' : ''), title: t.key,
        onmousedown: e => { if (e.button === 1) { e.preventDefault(); PDM.tabs.close(t.key); } },
        onclick: () => activate(t) },
        h('span', {}, safe(() => typeof t.editor.icon === 'function' ? t.editor.icon(t.key) : t.editor.icon, '')), h('span', { class: 'tl' }, title + (dirty ? ' ●' : '')),
        h('span', { class: 'x', onclick: e => { e.stopPropagation(); PDM.tabs.close(t.key); } }, '✕')));
    });
  }
  const safe = (fn, d) => { try { return fn(); } catch (_) { return d; } };

  // store 이벤트 → 탭 다시 그리기
  store.on('change', (key, opts) => {
    tabs.forEach(t => {
      const w = t.editor.watch ? t.editor.watch(key, t.key) : key === t.key;
      if (w && (!opts.silent || opts.reload)) render(t);
    });
    drawTree();
  });
  store.on('structure', key => {
    tabs.slice().forEach(t => {
      if (t.key === key && !store.has(key) && t.editor.needsResource !== false) PDM.tabs.close(t.key);
      else if (t.editor.watchStructure && t.editor.watchStructure(key, t.key)) render(t);
    });
    drawTree();
  });
  store.on('dirty', () => { updateStatus(); drawTabbar(); drawTreeSoon(); drawToolbarSoon(); });

  // ---------------- 리소스 트리 ----------------
  const expanded = new Set(['map', 'char', 'item', 'event', 'story', 'sys']);
  function treeRoots() {
    const roots = [];
    PDM.registry.editors.forEach(e => { if (e.tree) { try { roots.push(...e.tree()); } catch (err) { console.error(err); } } });
    return roots.sort((a, b) => (a.order || 50) - (b.order || 50));
  }
  function drawTree() {
    const body = $('#treeBody'); if (!body) return;
    const sc = body.scrollTop; body.innerHTML = '';
    if (!store.isOpen) { body.append(h('div', { class: 'empty', style: { padding: '10px' } }, '프로젝트를 열어 주세요')); return; }
    const dirty = new Set(store.dirtyKeys());
    const walk = (nodes, d) => nodes.forEach(n => {
      const hasKids = n.children && n.children.length;
      const open = expanded.has(n.id);
      const el = h('div', { class: 'tn' + (n.children ? ' group' : '') + (n.open && active && active.key === n.open ? ' sel' : '') + (n.open && dirty.has(n.open) ? ' dirty' : ''),
        style: { '--d': d }, 'data-open': n.open || '',
        onclick: () => { if (n.open) PDM.tabs.open(n.open); else if (n.children) { open ? expanded.delete(n.id) : expanded.add(n.id); drawTree(); } },
        ondblclick: () => { if (n.children && n.open) { open ? expanded.delete(n.id) : expanded.add(n.id); drawTree(); } },
        oncontextmenu: e => { e.preventDefault(); if (n.menu) PDM.ui.menu(e.clientX, e.clientY, typeof n.menu === 'function' ? n.menu() : n.menu); } },
        h('span', { class: 'tw', onclick: e => { if (hasKids) { e.stopPropagation(); open ? expanded.delete(n.id) : expanded.add(n.id); drawTree(); } } }, hasKids ? (open ? '▾' : '▸') : ''),
        h('span', { class: 'ti' }, n.icon || ''), h('span', { class: 'tl' }, n.label), n.count !== undefined ? h('span', { class: 'tc' }, n.count) : null);
      body.append(el);
      if (hasKids && open) walk(n.children, d + 1);
    });
    walk(treeRoots(), 0);
    body.scrollTop = sc;
  }
  const drawTreeSoon = PDM.debounce(drawTree, 80);
  PDM.drawTree = drawTree;
  function markTree() { $$('.tn').forEach(el => el.classList.toggle('sel', !!active && el.dataset.open === active.key)); }

  // ---------------- 메뉴 / 툴바 (GameMaker 식: 위 = 메뉴, 아래 = 아이콘 도구 모음) ----------------
  const T = () => window.PDM_THEME;
  const chk = on => (on ? '✓ ' : '\u2003 ');
  const MENUS = {
    '파일': () => [
      { label: '새 프로젝트…', hint: 'Ctrl+N', run: newProject },
      { label: '프로젝트 열기…', hint: 'Ctrl+O', run: openProject },
      { label: '샘플 프로젝트 열기', run: openSample },
      '-',
      { label: '저장', hint: 'Ctrl+S', run: saveAll, disabled: !store.isOpen },
      { label: '다른 이름으로 저장…', hint: 'Ctrl+Shift+S', run: saveAs, disabled: !store.isOpen || !pdm.isElectron },
      '-',
      { label: '프로젝트 내보내기 (.pdmproj)…', hint: 'Ctrl+E', run: exportProject, disabled: !store.isOpen || !pdm.isElectron },
      { label: '프로젝트 가져오기…', run: importProject, disabled: !pdm.isElectron },
      { label: '게임 파일 내보내기…', hint: 'Ctrl+Shift+E', run: exportGame, disabled: !store.isOpen || !pdm.isElectron },
      '-',
      { label: '프로젝트 폴더 열기', run: () => pdm.openExternal(store.root), disabled: !store.isOpen || !pdm.isElectron },
      { label: '닫기', run: closeProject, disabled: !store.isOpen }
    ],
    '편집': () => [
      { label: '실행 취소' + (store.undoLabel() ? ` (${store.undoLabel()})` : ''), hint: 'Ctrl+Z', run: undo, disabled: !store.undoLabel() },
      { label: '다시 실행' + (store.redoLabel() ? ` (${store.redoLabel()})` : ''), hint: 'Ctrl+Y', run: redo, disabled: !store.redoLabel() }
    ],
    '보기': () => [
      { label: chk(T().mode === 'system') + '테마: 시스템 따르기', run: () => T().setMode('system') },
      { label: chk(T().mode === 'light') + '테마: 밝게', run: () => T().setMode('light') },
      { label: chk(T().mode === 'dark') + '테마: 어둡게', run: () => T().setMode('dark') },
      '-',
      { label: chk(T().accent === 'system') + '강조색: 시스템 강조색' + (T().systemAccent ? '' : ' (이 환경에서는 없음)'), run: () => T().setAccent('system') },
      { label: chk(T().accent === 'default') + '강조색: PDMaker 보라', run: () => T().setAccent('default') },
      { label: chk(!['system', 'default'].includes(T().accent)) + '강조색: 직접 고르기…', run: pickAccent },
      '-',
      { label: '출력 창', run: () => showBottom('log') }, { label: '검사 결과', run: () => showBottom('check') }
    ],
    '프로젝트': () => [
      { label: '프로젝트 설정', run: () => PDM.tabs.open('project'), disabled: !store.isOpen },
      { label: '검사 (끊어진 참조 찾기)', hint: 'F7', run: runCheck, disabled: !store.isOpen },
      '-',
      { label: '▶ 테스트 플레이', hint: 'F5', run: playtest, disabled: !store.isOpen },
      { label: '게임 코드 컴파일 확인', run: () => runGame('compile'), disabled: !store.isOpen },
      { label: '빌드 정리 (gradlew clean)', run: cleanBuild, disabled: !store.isOpen || !pdm.isElectron },
      { label: '■ 중지', run: stopGame },
      '-',
      { label: '게임 파일 내보내기…', hint: 'Ctrl+Shift+E', run: exportGame, disabled: !store.isOpen || !pdm.isElectron }
    ],
    '도구': () => [
      { label: '용어 관리', run: () => PDM.tabs.open('terms'), disabled: !store.isOpen },
      { label: '마음 시스템', run: () => PDM.tabs.open('heart'), disabled: !store.isOpen },
      { label: '그림 관리', run: () => PDM.tabs.open('sprites'), disabled: !store.isOpen },
      { label: '고급: Java 코드 생성기 (이전 메이커)', run: () => PDM.tabs.open('legacy'), disabled: !store.isOpen },
      ...PDM.registry.menus.filter(m => m.menu === '도구').map(m => ({ label: m.label, run: m.run }))
    ],
    '플러그인': () => [
      { label: '플러그인 관리', run: () => PDM.tabs.open('plugins'), disabled: !store.isOpen },
      ...PDM.registry.menus.filter(m => m.menu === '플러그인').map(m => ({ label: m.label, run: m.run }))
    ],
    '도움말': () => [
      { label: '설계서 (DESIGN.md) 열기', run: async () => { const p = await pdm.paths(); pdm.openExternal(pdm.join(p.resources, 'DESIGN.md')); } },
      { label: '조건식 문법', run: showCondHelp }
    ]
  };
  function drawMenubar() {
    const mb = $('#menubar'); mb.innerHTML = '';
    Object.keys(MENUS).forEach(name => {
      const el = h('div', { class: 'mb', onclick: () => { const r = el.getBoundingClientRect(); PDM.ui.menu(r.left, r.bottom + 2, MENUS[name]()); } }, name);
      mb.append(el);
    });
  }

  /** 도구 모음 아이콘 (선 그림 SVG — 글자색을 따라 테마에 맞음) */
  const ICON = {
    new: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M12 11v6M9 14h6',
    open: 'M3 7a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v2M3 7v11a1 1 0 0 0 1 1h14l3-8H7l-3 8',
    save: 'M5 3h11l3 3v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM8 3v5h7V3M8 20v-6h8v6',
    saveAs: 'M5 3h9l3 3v4M5 3a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h6M8 3v5h6V3M14 20l6-6 2 2-6 6h-2z',
    exportProj: 'M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
    importProj: 'M12 3v12M7 10l5 5 5-5M4 17v3h16v-3',
    exportGame: 'M3 5h18v11H3zM8 21h8M12 16v5M9 9l3 3 3-3M12 6v6',
    undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
    redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
    check: 'M20 6L9 17l-5-5',
    clean: 'M3 21l6-6M14 4l6 6-8 8-6-6zM9 9l6 6',
    play: 'M7 4v16l13-8z',
    stop: 'M6 6h12v12H6z',
    theme: 'M12 3a9 9 0 1 0 0 18zM12 3a9 9 0 0 1 0 18',
    settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'
  };
  function svgIcon(name) {
    const ns = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(ns, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'tbi');
    const p = document.createElementNS(ns, 'path'); p.setAttribute('d', ICON[name] || ''); s.append(p);
    return s;
  }
  /** 도구 모음 버튼: 아이콘 + (짧은) 글자, 마우스를 올리면 설명과 단축키 */
  const tbBtn = (icon, label, run, o = {}) => h('button', { class: 'tb' + (o.cls ? ' ' + o.cls : '') + (o.iconOnly ? ' icon' : ''), onclick: run, disabled: !!o.disabled,
    title: (o.tip || label) + (o.key ? `  (${o.key})` : '') }, svgIcon(icon), o.iconOnly ? null : h('span', {}, label));
  const drawToolbarSoon = PDM.debounce(() => drawToolbar(), 60);
  function drawToolbar() {
    const tb = $('#toolbar'); tb.innerHTML = '';
    const open = store.isOpen, el = pdm.isElectron, running = !!drawToolbar.running;
    const webTip = el ? '' : ' — 웹 모드에서는 쓸 수 없습니다';
    const grp = (...kids) => h('div', { class: 'tb-grp' }, ...kids);
    tb.append(
      grp(tbBtn('new', '새로', newProject, { iconOnly: true, tip: '새 프로젝트', key: 'Ctrl+N' }),
        tbBtn('open', '열기', openProject, { iconOnly: true, tip: '프로젝트 열기', key: 'Ctrl+O' }),
        tbBtn('save', '저장', saveAll, { disabled: !open, tip: '프로젝트 저장', key: 'Ctrl+S', cls: store.isDirty() ? 'dirty' : '' }),
        tbBtn('saveAs', '다른 이름으로', saveAs, { iconOnly: true, disabled: !open || !el, tip: '다른 이름으로 저장 (다른 폴더에 복사해서 계속 작업)' + webTip, key: 'Ctrl+Shift+S' })),
      grp(tbBtn('exportProj', '프로젝트 내보내기', exportProject, { disabled: !open || !el, tip: '프로젝트 내보내기 — 폴더 전체를 .pdmproj 파일 하나로 (다른 PC·백업·공유용)' + webTip, key: 'Ctrl+E' }),
        tbBtn('importProj', '가져오기', importProject, { iconOnly: true, disabled: !el, tip: '프로젝트 가져오기 (.pdmproj / .zip)' + webTip }),
        tbBtn('exportGame', '게임 파일 내보내기', exportGame, { disabled: !open || !el, tip: '게임 파일 내보내기 — 친구에게 줄 수 있는 실행 파일 폴더(JAR 또는 Java 포함 실행 파일) 만들기' + webTip, key: 'Ctrl+Shift+E' })),
      grp(tbBtn('undo', '실행 취소', undo, { iconOnly: true, disabled: !open || !store.undoLabel(), tip: '실행 취소' + (store.undoLabel() ? ': ' + store.undoLabel() : ''), key: 'Ctrl+Z' }),
        tbBtn('redo', '다시 실행', redo, { iconOnly: true, disabled: !open || !store.redoLabel(), tip: '다시 실행' + (store.redoLabel() ? ': ' + store.redoLabel() : ''), key: 'Ctrl+Y' })),
      h('span', { class: 'grow' }),
      grp(tbBtn('check', '검사', runCheck, { disabled: !open, tip: '검사 — 끊어진 참조·빠진 그림 찾기', key: 'F7' }),
        tbBtn('clean', '정리', cleanBuild, { iconOnly: true, disabled: !open || !el || running, tip: '빌드 정리 (gradlew clean) — 이상한 컴파일 오류가 날 때' + webTip })),
      grp(tbBtn('play', '테스트 플레이', playtest, { cls: 'play', disabled: !open || running, tip: '테스트 플레이 — 저장·검사 후 게임 실행', key: 'F5' }),
        tbBtn('stop', '중지', stopGame, { cls: 'stop', iconOnly: true, disabled: !running && el, tip: '실행·빌드 중지' })),
      grp(tbBtn('theme', '테마', e => { const r = e.currentTarget.getBoundingClientRect(); PDM.ui.menu(r.right - 220, r.bottom + 2, MENUS['보기']().slice(0, 7)); }, { iconOnly: true, tip: `테마: ${({ system: '시스템 따르기', light: '밝게', dark: '어둡게' })[T().mode]}` }),
        tbBtn('settings', '설정', () => PDM.tabs.open('project'), { iconOnly: true, disabled: !open, tip: '프로젝트 설정 (게임 저장소 · 런타임)' })));
  }
  function updateStatus() {
    const d = store.isDirty();
    const el = $('#stDirty'); el.textContent = store.isOpen ? (d ? '● 저장 안 된 변경 있음' : '저장됨') : ''; el.classList.toggle('on', d);
    $('#projName').textContent = store.isOpen ? `— ${(store.get('project') || {}).name || ''}` : '';
    document.title = `${d ? '● ' : ''}PDMaker${store.isOpen ? ' — ' + ((store.get('project') || {}).name || '') : ''}`;
  }

  // ---------------- 프로젝트 열기/저장 ----------------
  function recent() { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (_) { return []; } }
  function pushRecent(p) { try { localStorage.setItem(RECENT_KEY, JSON.stringify([p, ...recent().filter(x => x !== p)].slice(0, 8))); } catch (_) { /* 무시 */ } }

  async function guardDirty() {
    if (!store.isDirty()) return true;
    const r = await PDM.ui.modal('저장 안 된 변경', h('p', {}, '저장하지 않은 변경이 있습니다. 저장할까요?'), [['취소', 'cancel'], ['저장 안 함', 'discard', 'danger'], ['저장', 'save', 'pri']]);
    if (r === 'save') { await saveAll(); return true; }
    return r === 'discard';
  }
  async function loadProject(dir) {
    if (!(await guardDirty())) return;
    PDM.tabs.closeAll();
    try {
      const problems = await store.load(dir);
      PDM.assets.clear(); await PDM.assets.scanOverrides();
      pushRecent(dir);
      PDM.log(`프로젝트 열림: ${dir}`, 'ok');
      problems.forEach(p => PDM.log(p, 'warn'));
      const a = await PDM.assets.checkGameAssets();
      $('#stAssets').textContent = a.ok ? '● 게임 스프라이트 연결됨' : '● 게임 스프라이트 없음 (프로젝트 설정 확인)';
      $('#stAssets').style.color = a.ok ? 'var(--good)' : 'var(--bad)';
      if (!a.ok) PDM.log(a.reason, 'warn');
      await PDM.plugins.loadEnabled();
      drawAll();
      PDM.tabs.open('world');
    } catch (e) { PDM.log(e.message, 'err'); toast('열기 실패: ' + e.message, 'bad'); }
  }
  async function openProject() { const d = await pdm.openFolder('프로젝트 폴더 열기 (project.json 이 있는 폴더)'); if (d) loadProject(d); }
  async function openSample() { const p = await pdm.paths(); loadProject(p.sample); }
  // ---------------- 게임 저장소 경로 찾기 ----------------
  //  project.json 의 gameRepo(프로젝트 기준 상대 경로)가 틀리면(새 프로젝트를 다른 깊이의 폴더에 만든 경우 등)
  //  ① PDMaker 폴더 안 game/shattered-pixel-dungeon ② 전에 쓴 저장소 ③ 프로젝트 위쪽 폴더들에서 찾아 고칩니다.
  const REPO_KEY = 'pdm.lastGameRepo';
  const REPO_NAMES = ['game/shattered-pixel-dungeon', 'shattered-pixel-dungeon', 'pd-maker/game/shattered-pixel-dungeon', 'game/shattered-pixel-dungeon-mod-2', 'shattered-pixel-dungeon-mod-2', 'git-hub/shattered-pixel-dungeon', 'git-hub/shattered-pixel-dungeon-mod-2'];
  async function isRepo(d) {
    if (!d) return false;
    try { return (await pdm.exists(pdm.join(d, 'gradlew'))) || (await pdm.exists(pdm.join(d, 'gradlew.bat'))); } catch (_) { return false; }
  }
  async function findRepo() {
    const p = store.get('project') || {};
    const cur = p.gameRepo ? store.abs(p.gameRepo) : '';
    if (await isRepo(cur)) return { dir: cur, changed: false };
    try { const P = await pdm.paths(); if (await isRepo(P.gameRepo)) return { dir: P.gameRepo, changed: true }; } catch (_) { /* 무시 */ }
    let last = null; try { last = localStorage.getItem(REPO_KEY); } catch (_) { /* 무시 */ }
    if (await isRepo(last)) return { dir: last, changed: true };
    let dir = store.root;
    for (let up = 0; up < 6 && dir; up++) {
      for (const n of REPO_NAMES) { const c = pdm.join(dir, n); if (await isRepo(c)) return { dir: c, changed: true }; }
      const parent = pdm.dirname(dir); if (!parent || parent === dir) break; dir = parent;
    }
    return { dir: cur, changed: false, missing: true };
  }
  /** 게임 저장소 절대 경로 (틀렸으면 찾아서 project.json 을 고치고 저장) */
  async function resolveRepo(quiet) {
    if (!store.isOpen) return '';
    const r = await findRepo();
    if (r.changed) {
      const rel = pdm.relative(store.root, r.dir).replace(/\\/g, '/');
      const old = (store.get('project') || {}).gameRepo;
      store.edit('project', '게임 저장소 경로 자동 수정', o => { o.gameRepo = rel; });
      try { await store.save(); } catch (_) { /* 무시 */ }
      PDM.log(`게임 저장소 경로를 고쳤습니다: ${old || '(없음)'} → ${rel}`, 'ok');
      if (PDM.assets && PDM.assets.clear) PDM.assets.clear();
      drawAll();
    }
    if (!r.missing) { try { localStorage.setItem(REPO_KEY, r.dir); } catch (_) { /* 무시 */ } }
    else if (!quiet) PDM.log('게임 저장소(pd-maker/game/shattered-pixel-dungeon)를 찾지 못했습니다. 프로젝트 설정 → 게임 저장소 경로를 지정하세요: ' + r.dir, 'err');
    // mod-2 전용 아이템(코덱스 등)은 그 저장소일 때만 목록에 보임
    try { const was = PDM.gameMod2; PDM.gameMod2 = r.missing ? undefined : await pdm.exists(pdm.join(r.dir, 'core', 'src', 'main', 'java', 'com', 'shatteredpixel', 'shatteredpixeldungeon', 'items', 'weapon', 'codices')); if (was !== PDM.gameMod2) drawAll(); } catch (_) { /* 무시 */ }
    return r.dir;
  }

  /** 게임 저장소를 PDMaker 폴더 안(game/)으로 옮기고 이 프로젝트 경로를 맞춤 */
  async function bundleRepo(from) {
    if (!(await PDM.ui.confirm(`게임 저장소를 PDMaker 폴더 안으로 옮길까요?\n\n${from}\n→ PDMaker/game/ 안\n\n다른 PC 에 PDMaker 폴더만 복사해도 테스트 플레이가 됩니다. Android Studio 등에서 이 폴더를 열어 두었다면 먼저 닫아 주세요.`))) return;
    try {
      showBottom('log');
      const r = await pdm.repoBundle(from);
      store.edit('project', '게임 저장소 경로', o => { o.gameRepo = pdm.relative(store.root, r.dest).replace(/\\/g, '/'); });
      await store.save();
      try { localStorage.setItem(REPO_KEY, r.dest); } catch (_) { /* 무시 */ }
      PDM.assets.clear(); drawAll(); PDM.tabs.refresh('project');
      PDM.log(r.moved ? `게임 저장소를 옮겼습니다 → ${r.dest}` : `게임 저장소를 복사했습니다 (원래 폴더는 그대로) → ${r.dest}`, 'ok');
      toast(r.moved ? '옮겼습니다' : '복사했습니다');
    } catch (e) { PDM.log('옮기기 실패: ' + e.message, 'err'); toast(e.message, 'bad'); }
  }
  /** 프로젝트를 열 때: PDMaker 폴더 안에 저장소가 없고 바깥 저장소를 쓰면 한 번 권함 */
  async function offerBundle() {
    if (!pdm.repoBundle || !store.isOpen) return;
    try {
      const P = await pdm.paths(); if (P.gameRepo) return;
      const repo = await resolveRepo(true); if (!(await isRepo(repo))) return;
      if (localStorage.getItem('pdm.bundleAsked') === repo) return;
      localStorage.setItem('pdm.bundleAsked', repo);
      await bundleRepo(repo);
    } catch (_) { /* 무시 */ }
  }

  async function newProject() {
    if (!(await guardDirty())) return;
    const d = await pdm.openFolder('새 프로젝트를 만들 빈 폴더 선택'); if (!d) return;
    if (await pdm.exists(pdm.join(d, 'project.json'))) { toast('이미 프로젝트가 있는 폴더입니다', 'bad'); return; }
    const name = await PDM.ui.prompt('프로젝트 이름', '새 픽셀 던전'); if (name === null) return;
    PDM.tabs.closeAll();
    await store.createNew(d, name);
    await resolveRepo(true);   // 기본값(../../git-hub/…)이 이 폴더에서 틀리면 찾아서 고쳐 둠
    const rel = await PDM.ui.prompt('게임 저장소(shattered-pixel-dungeon) 경로', store.get('project').gameRepo, '프로젝트 폴더 기준 상대 경로 또는 절대 경로');
    if (rel) { store.edit('project', '게임 저장소 경로', r => { r.gameRepo = rel; }); await store.save(); }
    pushRecent(d); drawAll(); PDM.tabs.open('world');
    PDM.log('새 프로젝트를 만들었습니다: ' + d, 'ok');
  }
  async function closeProject() { if (!(await guardDirty())) return; PDM.tabs.closeAll(); location.reload(); }
  async function saveAll() {
    if (!store.isOpen) return;
    try { const s = await store.save(); PDM.log(`저장했습니다 (${s.length}개 파일)`, 'ok'); toast('저장했습니다'); }
    catch (e) { PDM.log('저장 실패: ' + e.message, 'err'); toast('저장 실패', 'bad'); }
  }
  /** 폴더를 옮기면 상대 경로(게임 저장소 등)가 틀어지므로 새 위치 기준으로 다시 계산 */
  function rebasePaths(oldRoot, newRoot) {
    const p = store.get('project') || {};
    const fix = {};
    ['gameRepo', 'rpgMakerDir', 'legacyMaker'].forEach(k => {
      const v = p[k]; if (!v || /^([A-Za-z]:[\\/]|\/)/.test(v)) return;
      const abs = pdm.resolve ? pdm.resolve(oldRoot, v) : pdm.join(oldRoot, v);
      fix[k] = pdm.relative(newRoot, abs).replace(/\\/g, '/');
    });
    return fix;
  }
  async function saveAs() {
    if (!store.isOpen) return;
    const dir = await pdm.openFolder('다른 이름으로 저장 — 새 프로젝트를 둘 빈 폴더 선택'); if (!dir) return;
    const old = store.root;
    try {
      await pdm.projectCopyTo(old, dir);
      const fix = rebasePaths(old, dir);
      store.relocate(dir);
      if (Object.keys(fix).length) store.edit('project', '경로 다시 맞춤', o => Object.assign(o, fix));
      await store.save();
      pushRecent(dir); PDM.assets.clear(); await PDM.assets.scanOverrides();
      drawAll(); PDM.tabs.refresh();
      PDM.log(`다른 이름으로 저장: ${dir}` + (Object.keys(fix).length ? ` (경로 다시 맞춤: ${Object.entries(fix).map(([k, v]) => k + '=' + v).join(', ')})` : ''), 'ok');
      toast('다른 이름으로 저장했습니다');
    } catch (e) { PDM.log('다른 이름으로 저장 실패: ' + e.message, 'err'); toast('실패: ' + e.message, 'bad'); }
  }
  const projName = () => ((store.get('project') || {}).name || 'project').replace(/[\\/:*?"<>|]/g, '_');
  async function exportProject() {
    if (!store.isOpen) return;
    if (store.isDirty()) await saveAll();
    const out = await pdm.saveFile('프로젝트 내보내기', `${projName()}.pdmproj`, ['pdmproj', 'zip']); if (!out) return;
    try {
      const r = await pdm.projectExport(store.root, out);
      PDM.log(`프로젝트 내보내기: ${r.files}개 파일, ${(r.bytes / 1024).toFixed(0)} KB → ${r.out}`, 'ok');
      toast('프로젝트를 내보냈습니다');
    } catch (e) { PDM.log('프로젝트 내보내기 실패: ' + e.message, 'err'); toast('실패: ' + e.message, 'bad'); }
  }
  async function importProject() {
    if (!(await guardDirty())) return;
    const file = await pdm.openFile('프로젝트 가져오기 (.pdmproj / .zip)', ['pdmproj', 'zip']); if (!file) return;
    const dir = await pdm.openFolder('프로젝트를 풀어 놓을 빈 폴더 선택'); if (!dir) return;
    try {
      await pdm.projectImport(file, dir);
      await loadProject(dir);
      const a = await PDM.assets.checkGameAssets();
      if (!a.ok) { PDM.log('가져온 프로젝트의 게임 저장소 경로를 찾지 못했습니다 — 프로젝트 설정에서 고쳐 주세요', 'warn'); PDM.tabs.open('project'); }
    } catch (e) { PDM.log('프로젝트 가져오기 실패: ' + e.message, 'err'); toast('실패: ' + e.message, 'bad'); }
  }
  /** 게임 파일 내보내기 (GameMaker 의 Create Executable) */
  const EXPORT_KEY = 'pdmaker_export_v1';
  async function exportGame() {
    if (!store.isOpen) return;
    let last = {}; try { last = JSON.parse(localStorage.getItem(EXPORT_KEY) || '{}'); } catch (_) { /* 없음 */ }
    const nameIn = h('input', { type: 'text', value: last.name || projName() });
    const outIn = h('input', { type: 'text', value: last.outDir || '', placeholder: '내보낼 폴더' });
    const pick = h('button', { class: 'btn sm', onclick: async e => { e.preventDefault(); const d = await pdm.openFolder('게임 파일을 만들 폴더'); if (d) outIn.value = d; } }, '찾기…');
    let kind = last.kind || 'jar';
    const kindBox = h('div', { class: 'export-kinds' }, [
      ['jar', 'JAR + 실행 파일(.bat)', '빠름. 받는 PC 에 Java 17 이상이 있어야 합니다. 폴더 크기 약 20~30 MB.'],
      ['image', '실행 파일 폴더 (Java 포함)', 'Java 없이 바로 실행(.exe). 처음 한 번은 JDK 를 내려받아 몇 분 걸립니다. 폴더 크기 약 60~90 MB.']
    ].map(([k, t, d]) => {
      const card = h('label', { class: 'export-kind' + (k === kind ? ' on' : '') },
        h('input', { type: 'radio', name: 'exk', checked: k === kind, onchange: () => { kind = k; kindBox.querySelectorAll('.export-kind').forEach(x => x.classList.toggle('on', x === card)); } }),
        h('div', {}, h('b', {}, t), h('small', { class: 'hint' }, d)));
      return card;
    }));
    const body = h('div', { style: { minWidth: '520px' } },
      PDM.ui.field('게임 이름 (폴더·실행 파일 이름)', nameIn),
      PDM.ui.field('만들 곳', h('div', { class: 'imgpick' }, outIn, pick), '이 폴더 안에 "게임 이름" 폴더가 만들어집니다'),
      PDM.ui.field('종류', kindBox),
      h('p', { class: 'hint' }, '저장 → 검사 → 게임 런타임 설치·코드 생성 → gradle 빌드 → 결과 + 프로젝트(project 폴더)를 모아 둡니다. 진행 상황은 출력 창에 나옵니다. 게임 이름·아이콘·버전 같은 게임 자체 정보는 게임 저장소 설정을 따릅니다.'));
    const ok = await PDM.ui.modal('게임 파일 내보내기', body, [['취소', false], ['내보내기', true, 'pri']]);
    if (!ok) return;
    const name = nameIn.value.trim() || projName(), outDir = outIn.value.trim();
    if (!outDir) { toast('만들 곳을 고르세요', 'bad'); return; }
    try { localStorage.setItem(EXPORT_KEY, JSON.stringify({ name, outDir, kind })); } catch (_) { /* 무시 */ }
    const errs = runCheck().filter(r => r.level === 'error');
    if (errs.length && !(await PDM.ui.confirm(`오류 ${errs.length}개가 있습니다. 그래도 내보낼까요?`))) return;
    await saveAll();
    const p = store.get('project');
    try {
      showBottom('log');
      PDM.log(`게임 파일 내보내기 시작: ${name} (${kind === 'image' ? '실행 파일 폴더' : 'JAR'}) → ${outDir}`, 'ok');
      const r = await pdm.exportGame({ repo: await resolveRepo(), project: store.root, outDir, kind, name });
      setRunning(true);
      PDM.log(`빌드 중… (${r.task}) 끝나면 ${r.dest} 에 만들어집니다`, 'dim');
    } catch (e) { PDM.log('게임 파일 내보내기 실패: ' + e.message, 'err'); toast('실패: ' + e.message, 'bad'); }
  }
  async function cleanBuild() {
    const p = store.get('project'); if (!p) return;
    try { showBottom('log'); await pdm.cleanBuild(await resolveRepo()); setRunning(true); } catch (e) { PDM.log(e.message, 'err'); toast(e.message, 'bad'); }
  }
  function setRunning(on) { drawToolbar.running = on; drawToolbar(); }
  async function pickAccent() {
    const cur = T().accent && T().accent.startsWith('#') ? T().accent : '#a58bff';
    const i = h('input', { type: 'color', value: cur, style: { width: '80px', height: '40px' } });
    const v = await PDM.ui.modal('강조색 고르기', h('div', {}, i, h('p', { class: 'hint' }, '밝은/어두운 테마에서 잘 보이도록 밝기는 자동으로 조금 맞춥니다.')), [['취소', null], ['적용', () => i.value, 'pri']]);
    if (v) T().setAccent(v);
  }
  function undo() { const l = store.undo(); if (l) toast('실행 취소: ' + l); }
  function redo() { const l = store.redo(); if (l) toast('다시 실행: ' + l); }

  // ---------------- 검사 / 테스트 플레이 ----------------
  function runCheck() {
    const res = PDM.validate();
    const body = $('#checkBody'); body.innerHTML = '';
    if (!res.length) body.append(h('div', { class: 'log-l ok' }, '문제를 찾지 못했습니다 ✓'));
    res.forEach(r => body.append(h('div', { class: 'chk-l log-l ' + (r.level === 'error' ? 'err' : r.level === 'info' ? 'info' : 'warn'), onclick: () => r.open && PDM.tabs.open(r.open) }, `${r.level === 'error' ? '✕' : r.level === 'info' ? 'ℹ' : '!'} ${r.where} — ${r.msg}`)));
    showBottom('check');
    return res;
  }
  async function runGame(task) {
    showBottom('log');
    const repo = await resolveRepo();
    try { showBottom('log'); await pdm.runGame({ repo, project: store.root, task }); setRunning(true); }
    catch (e) { PDM.log(e.message, 'err'); toast(e.message, 'bad'); }
  }
  async function playtest() {
    if (!store.isOpen) return;
    const errs = runCheck().filter(r => r.level === 'error');
    if (errs.length && !(await PDM.ui.confirm(`오류 ${errs.length}개가 있습니다. 그래도 실행할까요?`))) return;
    await saveAll();
    runGame('play');
  }
  function stopGame() { pdm.stopGame().then(() => { PDM.log('중지 요청', 'dim'); setRunning(false); }); }

  function showCondHelp() {
    PDM.ui.modal('조건식 문법', h('div', { class: 'mono', style: { whiteSpace: 'pre-wrap', lineHeight: 1.6, maxWidth: '640px' } },
`비교:  ==  !=  >=  <=  >  <      연결:  &&(그리고)  ||(또는)  !(아님)  괄호 ( )
값:    숫자, '문자열', true, false

이름 (캐릭터 대사/마음 조건 안에서는 그 캐릭터 기준):
  favor  trust  anger  sulk  stage
  mood(무드, 층마다 0)  moodFull  temper(기분 −1/0/1)  displeased(언짢음)
  accept(마음 열림 점수)  acceptLv(0~3)  stress  jealousy  fatigue(대화 피로)  warm(이번 층에 어울림)
  uses.<행동키>(이번 층 횟수)
  gauge.joy …   crystal.joy …   abl.intimacy …   mark.fear …   exp.talked …
  bond.admire   att.friendly   memory.<키>

전역:
  switch.<id>   var.<id>   self.A   route   depth   chapter
  hero.class    hero.hp%   item.<id>(가진 개수)
  hero.subclass(전직 id)  hero.ability(직업 능력 id)  hero.gauge(게이지)  hero.element(원소 id)  hero.charge(주문서 충전)
  char.<캐릭터id>.favor  (다른 캐릭터 수치)

예)  favor>=600 && temper>0 && mood>=200
     switch.bridge_fixed && !(var.gold < 100)
     char.mireille.trust>=200 || bond.close`));
  }

  // ---------------- 시작 화면 ----------------
  function drawWelcome() {
    const body = $('#tabbody'); body.innerHTML = '';
    const rec = recent();
    body.append(h('div', { class: 'welcome' },
      h('h1', {}, '픽셀 던전 메이커'),
      h('p', { class: 'lead' }, 'Shattered Pixel Dungeon 기반 게임 제작 도구. 맵 · 캐릭터 · 아이템 · 이벤트 · 스토리를 만들고 바로 테스트 플레이합니다.'),
      !pdm.isElectron ? h('p', { class: 'hint bad' }, '웹 모드로 실행 중입니다. 저장은 브라우저 안에만 되고, 테스트 플레이는 할 수 없습니다.') : null,
      h('div', { class: 'cards' },
        h('div', { class: 'card', onclick: openSample }, h('b', {}, '샘플 열기'), h('span', {}, '위츨링 픽셀 타워 샘플 — 아리아·미레유, 1층 이벤트, 마음 시스템 예시')),
        h('div', { class: 'card', onclick: newProject }, h('b', {}, '새 프로젝트'), h('span', {}, '빈 폴더에 26층 기본 구조로 시작')),
        h('div', { class: 'card', onclick: openProject }, h('b', {}, '프로젝트 열기'), h('span', {}, 'project.json 이 있는 폴더 선택')),
        h('div', { class: 'card', onclick: importProject }, h('b', {}, '프로젝트 가져오기'), h('span', {}, '내보낸 .pdmproj 파일을 빈 폴더에 풀어서 열기'))),
      rec.length ? h('h3', {}, '최근 프로젝트') : null,
      h('div', { class: 'recent' }, rec.map(p => h('div', { onclick: () => loadProject(p) }, p)))));
  }
  function drawAll() { drawMenubar(); drawToolbar(); drawTree(); updateStatus(); if (!store.isOpen) drawWelcome(); }

  // ---------------- 크기 조절 ----------------
  function splitters() {
    $$('.split-v').forEach(sp => sp.addEventListener('mousedown', e => {
      e.preventDefault();
      const right = sp.dataset.right, target = sp.dataset.target, root = document.documentElement;
      const startX = e.clientX, start = $('#' + target).getBoundingClientRect().width;
      const move = ev => { const w = PDM.clamp(start + (right ? startX - ev.clientX : ev.clientX - startX), 160, 700); root.style.setProperty(target === 'tree' ? '--treeW' : '--inspW', w + 'px'); };
      const up = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up); };
      addEventListener('mousemove', move); addEventListener('mouseup', up);
    }));
    $('.split-h').addEventListener('mousedown', e => {
      e.preventDefault();
      const startY = e.clientY, start = $('#bottom').getBoundingClientRect().height;
      const move = ev => document.documentElement.style.setProperty('--bottomH', PDM.clamp(start + startY - ev.clientY, 60, 600) + 'px');
      const up = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up); };
      addEventListener('mousemove', move); addEventListener('mouseup', up);
    });
  }

  function drawLogo() {
    const g = $('#logo').getContext('2d');
    const px = ['..aaaa..', '.aabbaa.', 'aabccbaa', '.abccba.', '..bddb..', '..d..d..', '.dd..dd.', '........'];
    const col = { a: '#6a45d6', b: '#a58bff', c: '#e6b95c', d: '#5fd6b4' };
    px.forEach((r, y) => [...r].forEach((c, x) => { if (col[c]) { g.fillStyle = col[c]; g.fillRect(x * 3, y * 3, 3, 3); } }));
  }

  // ---------------- 시작 ----------------
  function init() {
    drawLogo(); splitters(); drawAll(); PDM.inspector.clear();
    $('#stMode').textContent = pdm.isElectron ? 'Electron' : '웹 모드(개발용)';
    $$('.btab').forEach(b => b.addEventListener('click', () => showBottom(b.dataset.b)));
    $('#logClear').addEventListener('click', () => { $('#logBody').innerHTML = ''; $('#checkBody').innerHTML = ''; });
    $('#treeCollapse').addEventListener('click', () => { expanded.clear(); drawTree(); });
    store.on('load', () => { drawAll(); resolveRepo(true).then(() => offerBundle()); });
    store.on('change', () => drawToolbar());
    addEventListener('keydown', e => {
      const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); saveAs(); }
      else if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); saveAll(); }
      else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'e') { e.preventDefault(); exportGame(); }
      else if (e.ctrlKey && e.key.toLowerCase() === 'e') { e.preventDefault(); exportProject(); }
      else if (e.ctrlKey && e.key.toLowerCase() === 'n') { e.preventDefault(); newProject(); }
      else if (e.ctrlKey && e.key.toLowerCase() === 'o') { e.preventDefault(); openProject(); }
      else if (e.ctrlKey && !typing && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (e.ctrlKey && !typing && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
      else if (e.key === 'F5') { e.preventDefault(); playtest(); }
      else if (e.key === 'F7') { e.preventDefault(); runCheck(); }
    });
    pdm.on('game:log', l => PDM.log(l, /error|오류|exception|FAILED/i.test(l) ? 'err' : /warning|경고/i.test(l) ? 'warn' : ''));
    pdm.on('game:exit', code => { setRunning(false); PDM.log(`게임/빌드 종료 (코드 ${code})`, code === 0 ? 'ok' : 'warn'); });
    pdm.on('export:done', r => {
      setRunning(false);
      if (r.ok) {
        PDM.log('게임 파일을 만들었습니다: ' + r.dest, 'ok'); toast('게임 파일을 만들었습니다');
        PDM.ui.modal('게임 파일 내보내기 완료', h('div', {}, h('p', {}, '만든 곳:'), h('p', { class: 'mono' }, r.dest)), [['닫기', null], ['폴더 열기', () => { pdm.openExternal(r.dest); return null; }, 'pri']]);
      } else { PDM.log('게임 파일 내보내기 실패: ' + r.error, 'err'); toast('게임 파일 내보내기 실패', 'bad'); }
    });
    if (window.PDM_THEME) { PDM_THEME.connect(); PDM_THEME.onChange(() => drawToolbar()); }
    pdm.on('app:before-close', async () => { if (await guardDirty()) pdm.closeApp(); });
    PDM.log('PDMaker 시작 ' + (pdm.isElectron ? '' : '(웹 모드)'), 'dim');
    const q = new URLSearchParams(location.search).get('project');
    if (q) loadProject(q);
  }
  PDM.app = { loadProject, saveAll, saveAs, exportProject, importProject, exportGame, cleanBuild, playtest, runCheck, showBottom, bundleRepo, resolveRepo };
  document.readyState === 'loading' ? addEventListener('DOMContentLoaded', init) : init();
})();
