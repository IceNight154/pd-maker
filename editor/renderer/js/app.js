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
    show(title, el) {   // 같은 것을 다시 보여 줄 때(편집 뒤 다시 그림)는 스크롤 위치를 그대로
      const t = title || '인스펙터', b = $('#inspBody'), same = $('#inspTitle').textContent === t, keep = same ? b.scrollTop : 0;
      $('#inspTitle').textContent = t; b.innerHTML = ''; if (el) b.append(el);
      if (same) { b.scrollTop = keep; requestAnimationFrame(() => { if (b.scrollTop !== keep) b.scrollTop = keep; }); }
    },
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
    cycle(d) { if (!tabs.length) return; const i = tabs.indexOf(active); activate(tabs[(i + d + tabs.length) % tabs.length]); },
    refresh(key) { tabs.filter(t => !key || t.key === key).forEach(render); },
    get active() { return active && active.key; }
  };
  function render(t) {
    const body = $('#tabbody');
    const keep = active === t ? body.scrollTop : (t.scroll || 0);
    if (/^(node|room|char|hero|item|event|prop):/.test(t.key) && store.isOpen && !store.has(t.key)) { setTimeout(() => PDM.tabs.close(t.key), 0); return; }   // 지워진 리소스의 탭은 닫음 (그리다 오류 나지 않게)
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
    // 다시 그릴 때 화면이 밀리지 않게: 그림·미리보기(비동기로 크기가 정해짐)가 아직 작아서 페이지가 잠깐 짧아지면
    // 스크롤 위치가 잘려 위로 밀렸음 → 잠깐 예전 높이를 최소 높이로 잡아 두었다가 풂
    // 안쪽 스크롤 칸(아이템 시트 고르기 등)의 위치도 그대로 — 다시 그리면 맨 위로 돌아가 밀려 보였음
    const INNER = '.sheet-view, .map-scroll, .keep-scroll, .code-view';
    const inner = active === t ? [...t.el.querySelectorAll(INNER)].map(e => [e.scrollTop, e.scrollLeft]) : [];
    const oldH = active === t ? t.el.offsetHeight : 0;
    // 기준점: 방금 누른(포커스된) 칸 — 다시 그린 뒤 같은 자리의 칸이 화면의 같은 높이에 오게 맞춤 (위쪽 칸 높이가 바뀌어도 밀리지 않게)
    const anchor = active === t ? anchorOf(t.el) : null;
    if (oldH) t.el.style.minHeight = oldH + 'px';
    // 파일 하나짜리 리소스(캐릭터 · 아이템 · 이벤트 · 맵 오브젝트)는 편집 화면 맨 위에 공용 도구 줄 (id 바꾸기 · 복제 · 쓰는 곳 · 삭제)
    const rk = /^(char|item|event|prop):(.+)$/.exec(t.key);
    if (rk && PDM.resOps && el && el.classList && store.has(t.key)) { try { el.prepend(PDM.resOps.bar(rk[1], rk[2])); } catch (e) { console.error(e); } }
    t.el.innerHTML = ''; t.el.append(el);
    if (active === t) { body.innerHTML = ''; body.append(t.el); body.scrollTop = keep; if (anchor) keepAnchor(t, anchor); }
    clearTimeout(t._mh);
    if (oldH) t._mh = setTimeout(() => { t.el.style.minHeight = ''; }, 1500);
    if (inner.some(s => s[0] || s[1])) {
      // 그림이 늦게 그려져 칸 크기가 나중에 정해지므로 몇 번 다시 맞춤 (사용자가 그사이 움직였으면 건드리지 않음)
      const restore = () => [...t.el.querySelectorAll(INNER)].forEach((e, i) => { const s = inner[i]; if (!s || (!s[0] && !s[1])) return; if (e.scrollTop === 0 && e.scrollLeft === 0) { e.scrollTop = s[0]; e.scrollLeft = s[1]; } });
      restore(); [20, 80, 200, 500].forEach(ms => setTimeout(restore, ms));
    }
    drawTabbar();
  }
  /** 포커스된 칸(또는 마지막으로 누른 칸)의 위치: t.el 에서의 자식 번호 경로 + 화면에서의 높이 */
  let lastPointer = null;
  addEventListener('pointerdown', e => { lastPointer = e.target; }, true);
  function anchorOf(root) {
    let n = document.activeElement && root.contains(document.activeElement) && document.activeElement !== root ? document.activeElement : lastPointer && root.contains(lastPointer) ? lastPointer : null;
    if (!n) return null;
    const top = n.getBoundingClientRect().top, path = [];
    for (let x = n; x && x !== root; x = x.parentElement) path.unshift([...x.parentElement.children].indexOf(x));
    return { path, top };
  }
  function keepAnchor(t, a) {
    const body = $('#tabbody');
    const find = () => { let x = t.el; for (const i of a.path) { x = x && x.children[i]; if (!x) return null; } return x; };
    let moved = false; const off = () => { moved = true; };
    body.addEventListener('wheel', off, { once: true, passive: true });
    const fix = () => { if (moved) return; const n = find(); if (!n) return; const d = n.getBoundingClientRect().top - a.top; if (Math.abs(d) > 1) body.scrollTop += d; };
    fix(); [30, 120, 400].forEach(ms => setTimeout(fix, ms));   // 그림 · 미리보기가 늦게 커져도 다시 맞춤 (그사이 휠로 움직였으면 그만)
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
        h('span', { class: 'ti' }, PDM.iconFor(safe(() => typeof t.editor.icon === 'function' ? t.editor.icon(t.key) : t.editor.icon, ''))), h('span', { class: 'tl' }, title + (dirty ? ' ●' : '')),
        h('span', { class: 'x', title: '닫기', onclick: e => { e.stopPropagation(); PDM.tabs.close(t.key); } }, PDM.icon('x'))));
    });
    const on = bar.querySelector('.tab.on'); if (on) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });   // 탭이 많아도 지금 탭이 보이게
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
  // 리소스 목록에서 펼친 분류 — 처음에는 모두 접혀 있고, 펼친 것은 다음 실행 때도 기억
  const EXP_KEY = 'pdmaker_tree_expanded';
  const expanded = new Set((() => { try { return JSON.parse(localStorage.getItem(EXP_KEY) || '[]'); } catch (_) { return []; } })());
  const saveExpanded = () => { try { localStorage.setItem(EXP_KEY, JSON.stringify([...expanded])); } catch (_) { /* 무시 */ } };
  // ---------------- 확장 기능 (리소스 목록에서 켜고 끄는 부분) ----------------
  //  project.extensions = { event: bool, sys: bool } — 꺼진 것은 리소스 목록에서 숨김 (데이터는 그대로, 확장 기능 창에서 열 수 있음)
  //  예전 프로젝트(값 없음)는 모두 켜짐, 새 프로젝트는 꺼짐
  const EXTENSIONS = [
    { id: 'story', name: '스토리', desc: '스위치 · 변수 · 루트 · 엔딩 — 이벤트의 조건과 게임 진행 상태를 관리' },
    { id: 'event', name: '이벤트', desc: '커먼 이벤트 · 장면(연출) · 이정표 · 층 이벤트 — 대화·연출·스위치로 게임 진행을 만듦' },
    { id: 'prop', name: '맵 오브젝트', desc: '맵 위에 놓는 물건(상자 · 바위 · 레버 · 문짝 · 가로등)을 만듭니다 — 상태 · 밀기 · 상호작용 · 설치 칸과 표시 크기. 켜면 리소스 목록에 "맵 오브젝트"가, 맵 편집기의 "오브젝트 놓기"에 "맵 오브젝트"가 나타납니다' },
    { id: 'quests', name: '퀘스트', desc: 'NPC 에게 받아서 목표(몬스터 처치 · 아이템 모으기 · 맵 도착 · 대화 · 조건)를 채우고 보상을 받는 퀘스트 — 주는 캐릭터에게 말을 걸면 수주 창이 뜹니다. 이벤트 명령 "퀘스트" · "퀘스트 목록 창 열기", 조건식 quest.<id>' },
    { id: 'textfx', name: '글자 연출 (APNG)', desc: '예고편 컷신(제목 · 등장인물 소개 · 맺음말 · 크레딧 장면을 순서대로 — 이벤트 명령 "예고편 컷신 재생")과, CSS 로 움직이는 글자 그림(전투 시작 · 장소 이름 자막 등)을 만들어 APNG 로 저장하고, 이벤트 명령 "글자 연출 표시"로 게임 화면에 띄움' },
    { id: 'effects', name: '이펙트 · 파티클', desc: '불꽃·연기·반짝임 같은 파티클 이펙트를 만들어 맵에 놓거나(오브젝트 "이펙트"), 아이템을 쓸 때·이벤트 명령 "이펙트 재생"으로 띄움' },
    { id: 'compose', name: '노드 합성기 (배경 · 오브젝트 그림)', desc: '노드를 이어서 배경 타일 · 오브젝트 스프라이트를 만듭니다 (무늬 · 노이즈 · 그라데이션 · 색 보정 · 외곽선 · 그림자 · 겹치기 …). 결과를 PNG 로 저장해 스프라이트 · 타일셋으로 씁니다' },
    { id: 'motion', name: '모션 랩 (CSS · JS 움직이는 그림)', desc: 'CSS(+HTML) 나 JS(캔버스)로 움직이는 그림을 만들고 픽셀 아트로 구워(격자 시트 PNG · APNG) 화면 필터 층 · 이펙트 알갱이 · 맵 오브젝트 · 아이템 · 노드 합성기에 보냅니다. 화면 필터의 코드 층 · 글자 연출과 같은 굽는 부품을 씁니다' },
    { id: 'filters', name: '화면 필터 (날씨 · 노이즈 · 글리치)', desc: '화면 전체에 덮는 연출(비 · 눈 · 안개 · 밤 · 노이즈 · 주사선 · 글리치 · 번개)을 층으로 쌓아 만들고, 맵 노드 · 방 템플릿 · 그룹에 정하거나 이벤트 명령 "화면 필터"로 바꿉니다. 그림 층은 노드 합성기로 만들 수 있습니다' },
    { id: 'sys', name: '시스템', desc: '마음 시스템 · 용어 관리 · 플러그인 · Java 코드 생성기(이전 메이커)' },
    // 캐릭터 편집 화면의 칸 (켜야 보임)
    { id: 'charPortrait', name: '캐릭터: 초상화 · 표정 · 대사창 일러스트', desc: '캐릭터 편집 화면에 초상화·표정 칸을 보입니다 (대사창에 서는 그림)', section: true },
    { id: 'charHeart', name: '캐릭터: 마음 시스템', desc: '캐릭터 편집 화면에 마음 시스템(호감·신뢰·좋아하는 것) 칸을 보입니다', section: true },
    { id: 'charDialogue', name: '캐릭터: 상황별 대사', desc: '캐릭터 편집 화면에 상황(토픽)별 대사 칸을 보입니다', section: true },
    { id: 'charBehavior', name: '캐릭터: 행동 이벤트', desc: '캐릭터 편집 화면에 행동 이벤트(상황마다 실행할 명령) 칸을 보입니다', section: true }
  ];
  /** 켜져 있는지. 리소스 목록 항목(event·sys)은 값이 없으면 켬, 편집 화면 칸(section)은 확장 기능에서 체크해야 켬 (설정이 아예 없는 예전 프로젝트는 모두 켬) */
  const extOn = id => {   // 체크한 것만 켬 (새 프로젝트 · 설정이 없는 프로젝트는 모두 꺼짐)
    const x = (store.get('project') || {}).extensions;
    return !!x && x[id] === true;
  };
  function allRoots() {
    const roots = [];
    PDM.registry.editors.forEach(e => { if (e.tree) { try { roots.push(...e.tree()); } catch (err) { console.error(err); } } });
    return roots;
  }
  function showExtensions() {
    if (!store.isOpen) return;
    const roots = allRoots();
    const box = h('div', { style: { minWidth: '520px', maxWidth: '640px' } });
    const draw = () => {
      box.replaceChildren(h('p', { class: 'hint' }, '켠 확장 기능만 왼쪽 리소스 목록과 편집 화면에 보입니다. 꺼도 데이터는 지워지지 않고 게임에서도 그대로 동작합니다. 여기서 바로 열 수도 있습니다.'),
        ...EXTENSIONS.map(x => {
          const r = roots.find(n => n.id === x.id);
          const cb = h('input', { type: 'checkbox', checked: extOn(x.id), onchange: () => { store.edit('project', (cb.checked ? '확장 기능 켜기: ' : '확장 기능 끄기: ') + x.name, p => { p.extensions = Object.assign({}, p.extensions || {}, { [x.id]: cb.checked }); }); drawTree(); draw(); } });
          const kids = r && r.children ? r.children : [];
          return h('div', { style: { border: '1px solid var(--line)', borderRadius: '6px', padding: '8px 10px', margin: '8px 0' } },
            h('label', { class: 'check fw-bold' }, cb, h('span', {}, x.section ? `${x.name} — 편집 화면에 표시` : `${r && r.icon ? r.icon + ' ' : ''}${x.name} — 리소스 목록에 표시`)),
            h('div', { class: 'hint', style: { margin: '2px 0 6px 24px' } }, x.desc),
            ...kids.map(k => {
              const openBtn = n => h('button', { class: 'btn sm', onclick: () => { PDM.tabs.open(n.open); document.querySelectorAll('.modal-foot .pri').forEach(b => b.click()); } }, `${n.icon || ''} ${n.label}`);
              const leafs = k.children ? k.children.filter(n => n.open) : [];
              return h('div', { style: { margin: '4px 0 4px 24px' } },
                k.open ? openBtn(k) : h('div', { class: 'hstack wrap' },
                  h('b', {}, `${k.icon || ''} ${k.label}${k.count !== undefined ? ' (' + k.count + ')' : ''}`),
                  ...(k.menu || []).filter(m => m && m.label && /^새 |추가/.test(m.label)).slice(0, 2).map(m => h('button', { class: 'btn xs', onclick: () => { document.querySelectorAll('.modal-foot .pri').forEach(b => b.click()); m.run(); } }, m.label)),
                  ...leafs.slice(0, 30).map(openBtn)));
            }));
        }));
    };
    draw();
    PDM.ui.modal('확장 기능', box, [['닫기', null, 'pri']]);
  }
  PDM.extensions = { list: EXTENSIONS, on: extOn, show: showExtensions };
  function treeRoots() {
    const roots = allRoots().filter(n => !EXTENSIONS.some(x => x.id === n.id) || extOn(n.id));
    return roots.sort((a, b) => (a.order || 50) - (b.order || 50));
  }
  // ---- 리소스 검색: 이름(q) · 세부(분류 root / 세부 분류 group) · 전체(all = 접혀 있는 분류도. 끄면 펼쳐 놓은 분류 안에서만)
  const search = { q: '', detail: false, root: '', group: '', all: true };
  let forced = null;   // 검색 중에 펼쳐 보일 그룹 id
  const labelOf = n => String(n.label || '').toLowerCase();
  /** 검색 조건에 맞는 것만 남긴 목록 { nodes, open, count } — 조건이 없으면 null */
  function filterTree(roots) {
    const q = search.q.trim().toLowerCase();
    const scopeId = search.detail ? (search.group || search.root) : '';
    if (!q && !scopeId) return null;
    const open = new Set(); let count = 0;
    // inScope: 세부 분류 안인지, hit: 조상 그룹 이름이 이미 맞았는지 (그 아래는 전부 보임)
    const rec = (nodes, inScope, hit) => nodes.map(n => {
      const sc = inScope || n.id === scopeId;
      const me = !q || hit || labelOf(n).includes(q);
      if (!n.children) { if (sc && me) { count++; return n; } return null; }
      if (!search.all && !expanded.has(n.id)) return sc && q && labelOf(n).includes(q) ? Object.assign({}, n, { children: [] }) : null;   // 접힌 분류는 건너뜀
      const kids = rec(n.children, sc, hit || (!!q && labelOf(n).includes(q)));
      if (kids.length) { open.add(n.id); return Object.assign({}, n, { children: kids, count: undefined }); }
      return null;
    }).filter(Boolean);
    return { nodes: rec(roots, !scopeId, false), open, count };
  }
  function drawTreeSearch(roots) {
    const box = $('#treeSearch'); if (!box) return;
    if (!box.firstChild) {
      const inp = h('input', { type: 'search', id: 'treeSearchInput', placeholder: '이름 검색…', class: 'grow min-0' });
      let tm = 0; inp.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => { search.q = inp.value; drawTree(); }, 120); });
      inp.addEventListener('keydown', e => { if (e.key === 'Escape') { inp.value = ''; search.q = ''; drawTree(); } });
      box.append(h('div', { class: 'hstack gap-2' }, inp,
          h('button', { class: 'ib', id: 'treeSearchDetail', title: '세부 검색 — 분류·종류로 좁히기', onclick: () => { search.detail = !search.detail; drawTree(); } }, '☰'),
          h('label', { title: '전체 검색 — 체크하면 접혀 있는 분류까지 목록 전체에서 찾습니다. 끄면 지금 펼쳐 놓은 분류 안에서만 찾습니다', class: 'hstack gap-1 fs-xs nowrap' },
            h('input', { type: 'checkbox', checked: search.all, onchange: e => { search.all = e.target.checked; drawTree(); } }), '전체'),
          h('span', { id: 'treeSearchCount', class: 'hint', style: { fontSize: '11px', minWidth: '28px', textAlign: 'right' } })),
        h('div', { id: 'treeSearchMore', style: { display: 'none', gap: '4px', marginTop: '4px' } }));
    }
    $('#treeSearchDetail').classList.toggle('on', search.detail);
    const more = $('#treeSearchMore'); more.style.display = search.detail ? 'flex' : 'none';
    if (!search.detail) return;
    const groups = roots.filter(n => n.children);
    if (search.root && !groups.some(n => n.id === search.root)) { search.root = ''; search.group = ''; }
    const subs = []; const rec = (nodes, d) => nodes.forEach(n => { if (n.children) { subs.push([n.id, '　'.repeat(d) + String(n.label)]); rec(n.children, d + 1); } });
    const r = groups.find(n => n.id === search.root); if (r) rec(r.children, 0);
    if (search.group && !subs.some(x => x[0] === search.group)) search.group = '';
    const sel = (opts, val, first, on) => { const s = h('select', { class: 'grow min-0', onchange: () => on(s.value) }, h('option', { value: '' }, first), opts.map(([v, t]) => h('option', { value: v }, t))); s.value = val; return s; };
    more.replaceChildren(sel(groups.map(n => [n.id, `${n.icon || ''} ${n.label}`]), search.root, '(모든 분류)', v => { search.root = v; search.group = ''; drawTree(); }),
      sel(subs, search.group, '(모든 종류)', v => { search.group = v; drawTree(); }));
  }
  let treeDrag = null;   // 리소스 목록에서 끌고 있는 것
  function drawTree() {
    const body = $('#treeBody'); if (!body) return;
    saveExpanded();
    const sc = body.scrollTop; body.innerHTML = '';
    if (!store.isOpen) { body.append(h('div', { class: 'empty p-5' }, '프로젝트를 열어 주세요')); return; }
    const dirty = new Set(store.dirtyKeys());
    const walk = (nodes, d) => nodes.forEach(n => {
      const hasKids = n.children && n.children.length;
      const open = forced ? forced.has(n.id) : expanded.has(n.id);
      const el = h('div', { class: 'tn' + (n.children ? ' group' : '') + (n.open && active && active.key === n.open ? ' sel' : '') + (n.open && dirty.has(n.open) ? ' dirty' : '') + (n.off ? ' off' : ''),
        style: { '--d': d }, 'data-open': n.open || '',
        onclick: () => { if (n.open) { PDM.tabs.open(n.open); if (n.expandOnOpen && hasKids && !open) { expanded.add(n.id); drawTree(); } } else if (n.run) n.run(); else if (n.children) { open ? expanded.delete(n.id) : expanded.add(n.id); drawTree(); } },
        ondblclick: () => { if (n.children && n.open) { open ? expanded.delete(n.id) : expanded.add(n.id); drawTree(); } },
        oncontextmenu: e => { e.preventDefault(); if (n.menu) PDM.ui.menu(e.clientX, e.clientY, typeof n.menu === 'function' ? n.menu() : n.menu); } },
        h('span', { class: 'tw', onclick: e => { if (hasKids) { e.stopPropagation(); open ? expanded.delete(n.id) : expanded.add(n.id); drawTree(); } } }, hasKids ? (open ? '▾' : '▸') : ''),
        h('span', { class: 'ti' }, PDM.iconFor(n.icon)), h('span', { class: 'tl' }, n.label), n.count !== undefined ? h('span', { class: 'tc' }, n.count) : null,
        // 줄에 마우스를 올리면 보이는 작은 버튼 (예: 영웅 순서 ▲▼)
        n.actions && n.actions.length ? h('span', { class: 'tact' }, n.actions.map(a => h('button', { class: 'ib', title: a.title || '', onclick: e => { e.stopPropagation(); a.run(e); } }, a.label))) : null);
      // 끌어 놓기: n.drag = 끌 수 있는 것({ kind, id … }), n.drop(끈 것, 'before'|'after'|'into') = 여기에 놓았을 때 (true 를 돌려주면 처리함)
      //   n.canDrop(끈 것) 이 가능한 위치 목록 ['before','after','into'] 을 돌려줌
      if (n.drag) {
        el.draggable = true;
        el.addEventListener('dragstart', e => { treeDrag = n.drag; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', n.id); } catch (_) { /* 무시 */ } el.classList.add('dragging'); });
        el.addEventListener('dragend', () => { treeDrag = null; body.querySelectorAll('.drop-before, .drop-after, .drop-into, .dragging').forEach(x => x.classList.remove('drop-before', 'drop-after', 'drop-into', 'dragging')); });
      }
      if (n.drop && n.canDrop) {
        const where = e => {
          const ok = treeDrag ? n.canDrop(treeDrag) : null; if (!ok || !ok.length) return null;
          const r = el.getBoundingClientRect(), f = (e.clientY - r.top) / r.height;
          let pos = ok.includes('into') && (f > 0.3 && f < 0.7 || (!ok.includes('before') && !ok.includes('after'))) ? 'into' : f < 0.5 ? 'before' : 'after';
          if (!ok.includes(pos)) pos = ok.includes('into') ? 'into' : ok[0];
          return pos;
        };
        el.addEventListener('dragover', e => { const pos = where(e); if (!pos) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; el.classList.remove('drop-before', 'drop-after', 'drop-into'); el.classList.add('drop-' + pos); });
        el.addEventListener('dragleave', () => el.classList.remove('drop-before', 'drop-after', 'drop-into'));
        el.addEventListener('drop', e => { const pos = where(e); el.classList.remove('drop-before', 'drop-after', 'drop-into'); if (!pos) return; e.preventDefault(); const d2 = treeDrag; treeDrag = null; n.drop(d2, pos); if (pos === 'into' && n.children) expanded.add(n.id); drawTree(); });
      }
      body.append(el);
      if (hasKids && open) walk(n.children, d + 1);
    });
    let roots = treeRoots();
    drawTreeSearch(roots);
    const f = filterTree(roots);
    if (f) { roots = f.nodes; if (!roots.length) body.append(h('div', { class: 'empty p-5' }, '찾는 것이 없습니다' + (search.all ? '' : ' — "전체"를 체크하면 접혀 있는 분류에서도 찾습니다'))); }
    forced = f ? f.open : null;
    const cnt = $('#treeSearchCount'); if (cnt) cnt.textContent = f ? f.count + '개' : '';
    walk(roots, 0);
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
      { label: '새 프로젝트…', hint: PDM.keys.label('newProject'), run: newProject },
      { label: '프로젝트 열기…', hint: PDM.keys.label('openProject'), run: openProject },
      '-',
      { label: '저장', hint: PDM.keys.label('save'), run: saveAll, disabled: !store.isOpen },
      { label: '다른 이름으로 저장…', hint: PDM.keys.label('saveAs'), run: saveAs, disabled: !store.isOpen || !pdm.isElectron },
      '-',
      { label: '프로젝트 내보내기 (.pdmproj)…', hint: PDM.keys.label('exportProject'), run: exportProject, disabled: !store.isOpen || !pdm.isElectron },
      { label: '프로젝트 가져오기…', run: importProject, disabled: !pdm.isElectron },
      { label: '게임 파일 내보내기…', hint: PDM.keys.label('exportGame'), run: exportGame, disabled: !store.isOpen || !pdm.isElectron },
      '-',
      { label: '프로젝트 폴더 열기', run: () => pdm.openExternal(store.root), disabled: !store.isOpen || !pdm.isElectron },
      { label: '닫기', run: closeProject, disabled: !store.isOpen }
    ],
    '편집': () => [
      { label: '실행 취소' + (store.undoLabel() ? ` (${store.undoLabel()})` : ''), hint: PDM.keys.label('undo'), run: undo, disabled: !store.undoLabel() },
      { label: '다시 실행' + (store.redoLabel() ? ` (${store.redoLabel()})` : ''), hint: PDM.keys.label('redo'), run: redo, disabled: !store.redoLabel() },
      '-',
      { label: '단축키 설정…', hint: PDM.keys.label('keySettings'), run: () => PDM.keys.dialog() }
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
      { label: chk(PDM.tips.mode === 'hover') + '설명문: 마우스를 올리면 상자로 보기', run: () => PDM.tips.setMode('hover') },
      { label: chk(PDM.tips.mode === 'inline') + '설명문: 화면에 항상 펼쳐 보기', run: () => PDM.tips.setMode('inline') },
      { label: chk(PDM.tips.mode === 'off') + '설명문: 숨기기 (버튼 도움말만)', run: () => PDM.tips.setMode('off') },
      '-',
      { label: '출력 창', run: () => showBottom('log') }, { label: '검사 결과', run: () => showBottom('check') }
    ],
    '프로젝트': () => [
      { label: '프로젝트 설정', run: () => PDM.tabs.open('project'), disabled: !store.isOpen },
      { label: 'build.gradle 보기 · 고치기', run: editBuildGradle, disabled: !store.isOpen },
      { label: '확장 기능…', run: showExtensions, disabled: !store.isOpen },
      { label: '검사 (끊어진 참조 찾기)', hint: PDM.keys.label('check'), run: runCheck, disabled: !store.isOpen },
      '-',
      { label: '▶ 테스트 플레이', hint: PDM.keys.label('playtest'), run: () => playtest(), disabled: !store.isOpen },
      { label: '▶ 테스트 플레이 — desktop:debug (INDEV 버전)', run: () => playtest('debug'), disabled: !store.isOpen },
      { label: '▶ 테스트 플레이 — PDMaker 테스트 실행 (PLAYTEST 버전)', run: () => playtest('playtest'), disabled: !store.isOpen },
      { label: '게임 코드 컴파일 확인', run: () => runGame('compile'), disabled: !store.isOpen },
      { label: '빌드 정리 (gradlew clean)', run: cleanBuild, disabled: !store.isOpen || !pdm.isElectron },
      { label: '■ 중지', hint: PDM.keys.label('stopGame'), run: stopGame },
      '-',
      { label: '게임 파일 내보내기…', hint: PDM.keys.label('exportGame'), run: exportGame, disabled: !store.isOpen || !pdm.isElectron }
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
      { label: '조건식 문법', run: showCondHelp },
      { label: 'PDMaker 업데이트 확인…', run: () => checkUpdate(true) },
      { label: 'GitHub 페이지 열기', run: () => pdm.openExternal('https://github.com/IceNight154/pd-maker') }
    ]
  };
  function drawMenubar() {
    const mb = $('#menubar'); mb.innerHTML = '';
    Object.keys(MENUS).forEach(name => {
      const el = h('div', { class: 'mb', onclick: () => { const r = el.getBoundingClientRect(); PDM.ui.menu(r.left, r.bottom + 2, MENUS[name]()); } }, name);
      mb.append(el);
    });
  }

  /** 도구 모음 아이콘 — 공용 아이콘 한 벌(js/icons.js)에서 */
  const svgIcon = name => PDM.icon(name, 'tbi');
  /** 도구 모음 버튼: 아이콘 + (짧은) 글자, 마우스를 올리면 설명과 단축키 */
  const tbBtn = (icon, label, run, o = {}) => h('button', { class: 'tb' + (o.cls ? ' ' + o.cls : '') + (o.iconOnly ? ' icon' : ''), onclick: run, disabled: !!o.disabled,
    title: (o.tip || label) + (o.key ? `  (${o.key})` : '') }, svgIcon(icon), o.iconOnly ? null : h('span', {}, label));
  /** 도구 모음 묶음 버튼: 아이콘 + 글자 + ▾ — 누르면 아래로 메뉴 */
  const tbDrop = (icon, label, items, o = {}) => {
    const b = h('button', { class: 'tb drop' + (o.iconOnly ? ' icon' : ''), disabled: !!o.disabled, title: o.tip || label,
      onclick: () => { const r = b.getBoundingClientRect(); PDM.ui.menu(o.right ? r.right - 240 : r.left, r.bottom + 2, items()); } },
      svgIcon(icon), o.iconOnly ? null : h('span', {}, label), h('span', { class: 'drop-caret' }, '▾'));
    return b;
  };
  const drawToolbarSoon = PDM.debounce(() => drawToolbar(), 60);
  function drawToolbar() {
    const tb = $('#toolbar'); tb.innerHTML = '';
    const open = store.isOpen, el = pdm.isElectron, running = !!drawToolbar.running;
    const webTip = el ? '' : ' — 웹 모드에서는 쓸 수 없습니다';
    const grp = (...kids) => h('div', { class: 'tb-grp' }, ...kids);
    tb.append(
      grp(tbBtn('new', '새로', newProject, { iconOnly: true, tip: '새 프로젝트', key: PDM.keys.label('newProject') }),
        tbBtn('open', '열기', openProject, { iconOnly: true, tip: '프로젝트 열기', key: PDM.keys.label('openProject') }),
        tbBtn('save', '저장', saveAll, { disabled: !open, tip: '프로젝트 저장', key: PDM.keys.label('save'), cls: store.isDirty() ? 'dirty' : '' }),
        tbBtn('saveAs', '다른 이름으로', saveAs, { iconOnly: true, disabled: !open || !el, tip: '다른 이름으로 저장 (다른 폴더에 복사해서 계속 작업)' + webTip, key: PDM.keys.label('saveAs') })),
      // 내보내기 · 가져오기는 한 묶음으로 (예전: 버튼 3개)
      grp(tbDrop('exportGame', '내보내기', () => [
        { label: '게임 파일 내보내기… (JAR · exe · 설치 파일 · APK)', hint: PDM.keys.label('exportGame'), run: exportGame, disabled: !open || !el },
        '-',
        { label: '프로젝트 내보내기 (.pdmproj — 백업 · 다른 PC)…', hint: PDM.keys.label('exportProject'), run: exportProject, disabled: !open || !el },
        { label: '프로젝트 가져오기 (.pdmproj / .zip)…', run: importProject, disabled: !el }], { tip: '게임 파일 · 프로젝트 내보내기 / 가져오기' + webTip })),
      grp(tbBtn('undo', '실행 취소', undo, { iconOnly: true, disabled: !open || !store.undoLabel(), tip: '실행 취소' + (store.undoLabel() ? ': ' + store.undoLabel() : ''), key: PDM.keys.label('undo') }),
        tbBtn('redo', '다시 실행', redo, { iconOnly: true, disabled: !open || !store.redoLabel(), tip: '다시 실행' + (store.redoLabel() ? ': ' + store.redoLabel() : ''), key: PDM.keys.label('redo') })),
      grp(tbBtn('ext', '확장 기능', showExtensions, { disabled: !open, tip: '확장 기능 — 이벤트·시스템 같은 추가 기능을 켜고 끄기 (켠 것만 리소스 목록에 보임)' })),
      h('span', { class: 'grow' }),
      grp(tbBtn('check', '검사', runCheck, { disabled: !open, tip: '검사 — 끊어진 참조·빠진 그림 찾기', key: PDM.keys.label('check') })),
      // 테스트 플레이 + 빌드 묶음 (빌드 방식 고르기 · 컴파일 확인 · 빌드 정리 — 예전: 정리 버튼이 따로)
      grp(tbBtn('play', '테스트 플레이', playtest, { cls: 'play', disabled: !open || running, tip: '테스트 플레이 — 저장·검사 후 게임 실행', key: PDM.keys.label('playtest') }),
        tbDrop('clean', '빌드', () => [
          { label: '▶ desktop:debug 로 실행 (INDEV 버전)', run: () => playtest('debug'), disabled: !open || running },
          { label: '▶ PDMaker 테스트 실행 (PLAYTEST 버전)', run: () => playtest('playtest'), disabled: !open || running },
          '-',
          { label: '게임 코드 컴파일 확인', run: () => runGame('compile'), disabled: !open || running },
          { label: '빌드 정리 (gradlew clean) — 이상한 컴파일 오류가 날 때', run: cleanBuild, disabled: !open || !el || running }], { iconOnly: true, tip: '빌드 방식 · 컴파일 확인 · 빌드 정리' + webTip }),
        tbBtn('stop', '중지', stopGame, { cls: 'stop', iconOnly: true, disabled: !running && el, tip: '실행·빌드 중지', key: PDM.keys.label('stopGame') })),
      grp(tbBtn('theme', '테마', e => { const r = e.currentTarget.getBoundingClientRect(); PDM.ui.menu(r.right - 220, r.bottom + 2, MENUS['보기']().slice(0, 7)); }, { iconOnly: true, tip: `테마: ${({ system: '시스템 따르기', light: '밝게', dark: '어둡게' })[T().mode]}` }),
        // 설정 묶음: 프로젝트 설정 · build.gradle · 단축키 (예전: build.gradle 버튼이 따로)
        tbDrop('settings', '설정', () => [
          { label: '프로젝트 설정 (게임 저장소 · 런타임 · 게임 이름)', run: () => PDM.tabs.open('project'), disabled: !open },
          { label: 'build.gradle — 게임 저장소의 빌드 설정 보고 고치기', run: editBuildGradle, disabled: !open },
          { label: '확장 기능…', run: showExtensions, disabled: !open },
          '-',
          { label: '단축키 설정…', run: () => PDM.keys.dialog() }], { iconOnly: true, right: true, tip: '설정 — 프로젝트 · build.gradle · 단축키' })));
  }
  function updateStatus() {
    const d = store.isDirty();
    const el = $('#stDirty'); el.textContent = store.isOpen ? (d ? '● 저장 안 된 변경 있음' : '저장됨') : ''; el.classList.toggle('on', d);
    $('#projName').textContent = store.isOpen ? `— ${(store.get('project') || {}).name || ''}` : '';
    document.title = `${d ? '● ' : ''}PDMaker${store.isOpen ? ' — ' + ((store.get('project') || {}).name || '') : ''}`;
  }

  // ---------------- 프로젝트 열기/저장 ----------------
  // 최근 프로젝트: [{ path, name }] (예전 형식 — 경로 문자열 — 도 읽음). name 은 목록에만 보이는 별명
  const RECENT_MAX = 12;
  function recent() {
    try { return (JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') || []).map(x => typeof x === 'string' ? { path: x, name: '' } : x).filter(x => x && x.path); } catch (_) { return []; }
  }
  function saveRecent(list) { try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX))); } catch (_) { /* 무시 */ } }
  const samePath = (a, b) => String(a).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase() === String(b).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  function pushRecent(p) {
    const list = recent(), old = list.find(x => samePath(x.path, p));
    saveRecent([{ path: p, name: old ? old.name : '' }, ...list.filter(x => !samePath(x.path, p))]);
  }

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
  // ---------------- 게임 저장소 경로 찾기 ----------------
  //  project.json 의 gameRepo(프로젝트 기준 상대 경로)가 틀리면(새 프로젝트를 다른 깊이의 폴더에 만든 경우 등)
  //  ① PDMaker 폴더 안 game/shattered-pixel-dungeon-master ② 전에 쓴 저장소 ③ 프로젝트 위쪽 폴더들에서 찾아 고칩니다.
  const REPO_KEY = 'pdm.lastGameRepo';
  const REPO_NAMES = ['game/shattered-pixel-dungeon-master', 'shattered-pixel-dungeon-master', 'pd-maker/game/shattered-pixel-dungeon-master', 'game/shattered-pixel-dungeon', 'shattered-pixel-dungeon', 'pd-maker/game/shattered-pixel-dungeon', 'git-hub/shattered-pixel-dungeon'];
  async function isRepo(d) {
    if (!d) return false;
    try { return (await pdm.exists(pdm.join(d, 'gradlew'))) || (await pdm.exists(pdm.join(d, 'gradlew.bat'))); } catch (_) { return false; }
  }
  async function findRepo() {
    const p = store.get('project') || {};
    const cur = p.gameRepo ? store.abs(p.gameRepo) : '';
    let bundled = ''; try { const P = await pdm.paths(); if (await isRepo(P.gameRepo)) bundled = P.gameRepo; } catch (_) { /* 무시 */ }
    const same = (a, b) => String(a).replace(/[\\/]+$/, '').replace(/\\/g, '/').toLowerCase() === String(b).replace(/[\\/]+$/, '').replace(/\\/g, '/').toLowerCase();
    if (await isRepo(cur)) {
      // 예전 기준 저장소(PDMaker 의 game 폴더 안 shattered-pixel-dungeon · -mod-2)를 가리키면 지금 기준(-master)으로 바꿈
      // (직접 고른 저장소 — gameRepoPinned — 는 바꾸지 않음)
      const old = !p.gameRepoPinned && /^shattered-pixel-dungeon(-mod-2)?$/.test(pdm.basename(cur)) && bundled && same(pdm.dirname(cur), pdm.dirname(bundled)) && !same(cur, bundled);
      if (!old) return { dir: cur, changed: false };
      return { dir: bundled, changed: true };
    }
    if (bundled) return { dir: bundled, changed: true };
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
    else if (!quiet) PDM.log('게임 저장소(pd-maker/game/shattered-pixel-dungeon-master)를 찾지 못했습니다. 프로젝트 설정 → 게임 저장소 경로를 지정하세요: ' + r.dir, 'err');
    // 게임 저장소의 타이틀 모양 (4.0 이상: splashes/title 의 폐허 배경) → 타이틀 화면 기본값을 거기에 맞춤
    try {
      const was4 = PDM.gameTitle4;
      PDM.gameTitle4 = r.missing ? undefined : await pdm.exists(pdm.join(r.dir, 'core', 'src', 'main', 'assets', 'splashes', 'title', 'archs.png'));
      if (PDM.gameTitle4 !== undefined && PDM.titleSyncDefaults && PDM.titleSyncDefaults()) { try { await store.save(); } catch (_) { /* 무시 */ } }
      if (was4 !== PDM.gameTitle4) drawAll();
    } catch (_) { /* 무시 */ }
    // mod-2 전용 아이템(코덱스 등)은 그 저장소일 때만 목록에 보임
    try { const was = PDM.gameMod2; PDM.gameMod2 = r.missing ? undefined : await pdm.exists(pdm.join(r.dir, 'core', 'src', 'main', 'java', 'com', 'shatteredpixel', 'shatteredpixeldungeon', 'items', 'weapon', 'codices')); if (was !== PDM.gameMod2) drawAll(); } catch (_) { /* 무시 */ }
    // 리소스 목록의 게임 기본 아이템·방·몬스터를 이 저장소의 실제 파일에 맞춤 (gamescan.js)
    try { if (PDM.gameScan && await PDM.gameScan(r.missing ? '' : r.dir)) { drawAll(); if (active) PDM.tabs.refresh(active.key);
      // 이 저장소에만 있는 직업이 프로젝트에 없으면 알려 줌 (다른 게임 저장소를 연결했을 때)
      const need = PDM.gameSyncNeeded && PDM.gameSyncNeeded();
      if (need && !need.heroes && need.fix > 0) { const r2 = await PDM.gameSyncVanilla(true); if (r2 && r2.heroesFixed) { PDM.log(`영웅 ${r2.heroesFixed}명의 이름·그림 칸 크기를 게임 저장소에 맞췄습니다 (저장하면 반영)`, 'ok'); drawAll(); } }
      if (need && need.heroes > 0) { PDM.log(`이 게임 저장소에는 프로젝트에 없는 직업 ${need.heroes}개 · 몬스터 ${need.mobs}개가 있습니다 → 프로젝트 설정 › 게임 저장소 연결 › "영웅·캐릭터를 저장소에 맞추기" 를 누르면 리소스 목록에 들어옵니다.`, 'err'); toast('게임 저장소의 영웅이 프로젝트에 없습니다 — 프로젝트 설정에서 "영웅·캐릭터를 저장소에 맞추기"', 'bad'); }
    } } catch (e) { console.error(e); PDM.log('게임 저장소를 읽다가 오류가 났습니다 (리소스 목록이 기준 목록으로 보일 수 있음): ' + (e && e.message), 'err'); }
    return r.dir;
  }

  /** PDMaker 의 game 폴더 안에 있는 게임 저장소들 [{ dir, name }] (gradlew 가 있는 폴더) */
  async function listRepos() {
    const out = [];
    try {
      const P = await pdm.paths(), base = P.gameRepoDefault ? pdm.dirname(P.gameRepoDefault) : P.gameRepo ? pdm.dirname(P.gameRepo) : pdm.join(P.resources || '', 'game');
      for (const e of await pdm.list(base)) if (e.dir && await isRepo(pdm.join(base, e.name))) out.push({ dir: pdm.join(base, e.name), name: e.name });
    } catch (_) { /* 무시 */ }
    return out;
  }
  /** 이 프로젝트의 게임 저장소를 바꿈 (직접 고른 것으로 고정) → 그 저장소를 읽고, 영웅·캐릭터가 다르면 맞출지 물음 */
  async function setRepo(dir, opts = {}) {
    if (!(await isRepo(dir))) { toast('게임 저장소가 아닙니다 (gradlew 파일이 없음): ' + dir, 'bad'); return false; }
    const rel = pdm.relative(store.root, dir).replace(/\\/g, '/') || dir;
    store.edit('project', '게임 저장소 경로', r => { r.gameRepo = rel; r.gameRepoPinned = true; });
    try { await store.save(); } catch (_) { /* 무시 */ }
    try { localStorage.setItem(REPO_KEY, dir); } catch (_) { /* 무시 */ }
    if (PDM.assets && PDM.assets.clear) PDM.assets.clear();
    await resolveRepo(true);
    try { if (PDM.gameScan) await PDM.gameScan(dir, true); } catch (e) { console.error(e); }
    const need = PDM.gameSyncNeeded && PDM.gameSyncNeeded();
    if (need && (need.heroes || need.mobs || need.gone || need.fix)) {
      const yes = opts.auto || await PDM.ui.confirm(`이 게임 저장소와 프로젝트의 영웅·캐릭터가 다릅니다.\n\n· 저장소에만 있는 직업 ${need.heroes}개 · 몬스터 ${need.mobs}개\n· 저장소에 없는 원작 영웅·캐릭터 ${need.gone}개\n\n프로젝트를 이 저장소에 맞출까요? (없는 것은 빼고, 저장소의 것을 더합니다. 직접 만든 것은 그대로 · 실행 취소 가능)`);
      if (yes) { const r = await PDM.gameSyncVanilla(); if (r) PDM.log(`게임 저장소에 맞춰 리소스를 고쳤습니다 — 캐릭터 −${r.charsRemoved} +${r.charsAdded} · 영웅 −${r.heroesRemoved} +${r.heroesAdded}${r.heroesHidden ? ' (감춘 직업 ' + r.heroesHidden + '개는 꺼 둠)' : ''}`, 'ok'); try { await store.save(); } catch (_) { /* 무시 */ } }
    }
    PDM.log('게임 저장소: ' + dir, 'ok');
    drawAll(); PDM.tabs.refresh('project');
    return true;
  }
  /** 게임 저장소 경로를 "이전 메이커 경로" 칸에 잘못 적은 프로젝트 → 게임 저장소로 쓸지 물음 */
  async function offerLegacyRepo() {
    try {
      const p = store.get('project') || {}; if (!p.legacyMaker || p.gameRepoPinned) return;
      const dir = store.abs(p.legacyMaker), cur = p.gameRepo ? store.abs(p.gameRepo) : '';
      if (!(await isRepo(dir)) || String(dir).replace(/[\\/]+$/, '').toLowerCase() === String(cur).replace(/[\\/]+$/, '').toLowerCase()) return;
      if (await PDM.ui.confirm(`"이전 메이커 경로" 칸에 게임 저장소가 적혀 있습니다:\n${dir}\n\n지금 프로젝트는 다른 저장소를 쓰고 있습니다:\n${cur || '(없음)'}\n\n이 폴더를 이 프로젝트의 게임 저장소로 쓸까요?`)) { store.edit('project', '이전 메이커 경로 비우기', r => { r.legacyMaker = ''; }); await setRepo(dir); }
    } catch (e) { console.error(e); }
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

  /** 게임 저장소 맨 위 build.gradle 편집 (게임 이름 · 패키지 이름 · 버전 칸 + 파일 내용 그대로) */
  /** PDMaker 업데이트: GitHub 의 main 과 비교해서 보여 주고, 누르면 받아서 다시 시작. manual = 메뉴에서 누름 (최신이어도 알려 줌) */
  async function checkUpdate(manual) {
    if (!pdm.updateCheck) { if (manual) toast('이 실행 방식에서는 업데이트를 확인할 수 없습니다 (웹 모드 · 예전 실행 파일)', 'bad'); return; }
    let r;
    try { if (manual) toast('업데이트 확인 중…'); r = await pdm.updateCheck(); }
    catch (e) { if (manual) PDM.ui.modal('업데이트 확인', h('div', {}, h('p', {}, '업데이트를 확인하지 못했습니다.'), h('p', { class: 'hint dlg-text' }, String(e.message || e))), [['닫기', null, 'pri']]); return; }
    if (r.upToDate) { if (manual) PDM.ui.modal('업데이트 확인', h('div', {}, h('p', {}, 'PDMaker 가 최신입니다.'), h('p', { class: 'hint' }, `현재 ${r.local ? r.local.short : '?'} · ${r.note || ''}`)), [['닫기', null, 'pri']]); else PDM.log('PDMaker 가 최신입니다 (' + (r.local ? r.local.short : '') + ')', 'dim'); return; }
    if (!manual) { PDM.log(`PDMaker 새 버전이 있습니다 (${r.commits.length}개 변경) — 도움말 › PDMaker 업데이트 확인`, 'ok'); toast('PDMaker 새 버전이 있습니다 — 도움말 › 업데이트 확인'); return; }
    const fmtDate = d => d ? String(d).slice(0, 10) : '';
    const body = h('div', { style: { width: 'min(620px, 84vw)' } },
      h('p', {}, r.canApply ? '새 버전이 있습니다.' : '새 버전이 있지만 이 실행 방식에서는 직접 받아야 합니다.'),
      h('p', { class: 'hint' }, `현재 ${r.local ? r.local.short + (r.local.date ? ' (' + fmtDate(r.local.date) + ')' : '') : '알 수 없음'}  →  최신 ${r.remote.short}${r.remote.date ? ' (' + fmtDate(r.remote.date) + ')' : ''} · 방식: ${{ git: 'git pull', zip: 'ZIP 내려받아 덮어쓰기', packaged: '실행 파일' }[r.mode]}`),
      r.note ? h('p', { class: 'hint' }, r.note) : null,
      h('div', { class: 'fl' }, '바뀐 내용' + (r.behind ? ` (${r.behind}개)` : '')),
      h('div', { style: { maxHeight: '40vh', overflow: 'auto', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: '6px 10px' } },
        ...r.commits.slice(0, 60).map(c => h('div', { class: 'my-1' }, h('code', { class: 'hint mr-4' }, String(c.sha).slice(0, 7) + ' ' + fmtDate(c.date)), c.message))),
      h('p', { class: 'hint' }, r.mode === 'git' ? '업데이트하면 git pull 로 받아 온 뒤 PDMaker 를 다시 시작합니다.' + (r.dirty ? ` 이 폴더에 고친 파일이 ${r.dirty}개 있어 겹치면 실패할 수 있습니다 (실패하면 ZIP 방식으로 받을 수 있음).` : '')
        : r.mode === 'zip' ? '업데이트하면 PDMaker 파일을 최신으로 덮어쓴 뒤 다시 시작합니다. game 폴더(게임 저장소)와 프로젝트는 건드리지 않습니다.' : ''));
    const ans = await PDM.ui.modal('PDMaker 업데이트', body, [['닫기', null], ['GitHub 열기', 'page'], ...(r.canApply ? [['업데이트하고 다시 시작', 'go', 'pri']] : [])]);
    if (ans === 'page') { pdm.openExternal(r.page); return; }
    if (ans !== 'go') return;
    if (store.isOpen && store.isDirty()) { if (!(await PDM.ui.confirm('저장하지 않은 변경이 있습니다. 저장하고 업데이트할까요?'))) return; await saveAll(); }
    showBottom && showBottom('log'); PDM.log('PDMaker 업데이트 시작…', 'ok');
    try {
      let res = await pdm.updateApply({});
      if (res && res.gitFailed) {
        PDM.log(res.error, 'warn');
        if (!(await PDM.ui.confirm('git pull 이 실패했습니다 (이 폴더에서 고친 파일과 겹침).\n\nZIP 을 받아 PDMaker 파일만 덮어쓸까요? game 폴더는 건드리지 않지만, editor · runtime 등에서 직접 고친 내용은 사라집니다.'))) return;
        res = await pdm.updateApply({ zip: true });
      }
      PDM.log('업데이트 완료' + (res.sha ? ' → ' + String(res.sha).slice(0, 7) : ''), 'ok');
      if (res.needInstall) await PDM.ui.modal('업데이트', h('p', {}, '필요한 모듈(Electron 등) 버전이 바뀌었습니다. PDMaker 를 닫은 뒤 editor 폴더에서 npm install 을 한 번 실행해 주세요.'), [['확인', null, 'pri']]);
      await pdm.updateRestart();
    } catch (e) { PDM.log('업데이트 실패: ' + (e.message || e), 'err'); PDM.ui.modal('업데이트 실패', h('p', { class: 'dlg-text' }, String(e.message || e)), [['닫기', null, 'pri']]); }
  }
  async function editBuildGradle() {
    if (!store.isOpen) return;
    const repo = await resolveRepo(true), fp = pdm.join(repo || '', 'build.gradle');
    let text; try { text = await pdm.readText(fp); } catch (_) { toast('게임 저장소의 build.gradle 을 찾지 못했습니다 — 프로젝트 설정에서 게임 저장소 경로를 확인하세요', 'bad'); return; }
    const original = text;
    const KEYS = [['appName', '게임 이름 (appName)', true, '게임 창 제목 · 세이브 폴더 이름'], ['appPackageName', '패키지 이름 (appPackageName)', true, '예: com.myname.mygame'], ['appVersionName', '버전 이름 (appVersionName)', true, '예: 1.0.0'], ['appVersionCode', '버전 번호 (appVersionCode)', false, '정수 — 새 버전을 낼 때마다 올림']];
    const re = (k, q) => new RegExp('(\\b' + k + '\\s*=\\s*)' + (q ? "'([^']*)'" : '(\\d+)'));
    const ta = h('textarea', { class: 'mono', rows: 18, spellcheck: false, style: { width: '100%', fontSize: '12px', whiteSpace: 'pre', overflow: 'auto' } }); ta.value = text;
    const inputs = {};
    const fromText = () => KEYS.forEach(([k, , q]) => { const m = re(k, q).exec(ta.value); inputs[k].value = m ? m[2] : ''; inputs[k].disabled = !m; });
    KEYS.forEach(([k, label, q, hint]) => { const i = inputs[k] = h('input', { type: 'text' });
      i.addEventListener('input', () => { const v = q ? i.value.replace(/['\\\r\n]/g, '') : i.value.replace(/\D/g, ''); if (!q && v === '') return; ta.value = ta.value.replace(re(k, q), (m, a) => a + (q ? "'" + v + "'" : v)); }); });
    fromText(); ta.addEventListener('input', fromText);
    const ok = await PDM.ui.modal('build.gradle — 게임 빌드 설정', h('div', { style: { width: 'min(760px, 86vw)' } },
      h('p', { class: 'hint' }, fp),
      h('div', { class: 'row' }, ...KEYS.slice(0, 2).map(([k, label, , hint]) => PDM.ui.field(label, inputs[k], hint))),
      h('div', { class: 'row' }, ...KEYS.slice(2).map(([k, label, , hint]) => PDM.ui.field(label, inputs[k], hint))),
      h('p', { class: 'hint' }, '위 칸을 고치면 아래 파일 내용에 바로 반영됩니다. 아래 내용을 직접 고쳐도 됩니다 (라이브러리 버전 등). 게임 이름·패키지 이름은 프로젝트 설정에도 함께 저장되고, 세이브 폴더가 %APPDATA%\\.<패키지 둘째 마디>\\<게임 이름> 으로 정해집니다.'),
      ta),
      [['취소', null], ['원래대로 (백업에서)', 'restore'], ['저장', 'save', 'pri']]);
    if (!ok) return;
    try {
      if (ok === 'restore') {
        let bak; try { bak = await pdm.readText(fp + '.pdmaker-backup'); } catch (_) { toast('백업(build.gradle.pdmaker-backup)이 없습니다 — 아직 고친 적이 없습니다', 'bad'); return; }
        await pdm.writeText(fp, bak);
        store.edit('project', 'build.gradle 되돌리기', r => { delete r.game; });   // 프로젝트 쪽 이름도 비워야 다음 테스트 플레이 때 다시 덮어쓰지 않음
        PDM.log('build.gradle 을 처음 상태로 되돌렸습니다 (프로젝트의 게임 이름 · 패키지 이름도 비움)', 'ok'); toast('되돌렸습니다');
      } else {
        const now = ta.value; if (now === original) return;
        if (!(await pdm.exists(fp + '.pdmaker-backup'))) await pdm.writeText(fp + '.pdmaker-backup', original);
        await pdm.writeText(fp, now);
        const nm = (re('appName', true).exec(now) || [])[2], pk = (re('appPackageName', true).exec(now) || [])[2];
        store.edit('project', 'build.gradle', r => { r.game = Object.assign({}, r.game || {}, nm !== undefined ? { appName: nm } : {}, pk !== undefined && PDM.validPackage(pk) ? { appPackageName: pk } : {}); });
        if (pk !== undefined && !PDM.validPackage(pk)) PDM.log('패키지 이름이 올바른 꼴이 아닙니다 (영문 소문자·숫자를 점으로): ' + pk, 'err');
        PDM.log('build.gradle 을 저장했습니다: ' + fp, 'ok'); toast('build.gradle 저장');
      }
      PDM.tabs.refresh('project');
    } catch (e) { PDM.log('build.gradle 저장 실패: ' + e.message, 'err'); toast(e.message, 'bad'); }
  }

  let creating = false;   // 새 프로젝트를 만드는 중 (저장소를 고르기 전의 자동 알림을 막음)
  async function newProject() {
    if (!(await guardDirty())) return;
    const base = await pdm.openFolder('새 프로젝트를 만들 위치 선택 (그 안에 프로젝트 이름으로 폴더를 만듭니다)'); if (!base) return;
    // 폴더 이름: 프로젝트 이름에서 윈도우에서 못 쓰는 글자를 뺌
    const folderName = n => String(n || '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '').replace(/[. ]+$/, '').trim() || '새 픽셀 던전';
    // 프로젝트 이름 + 게임 이름 · 패키지 이름 (게임 저장소 build.gradle 의 appName · appPackageName — 세이브 폴더도 이걸로 정해짐)
    const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '') || 'mygame';
    const iName = h('input', { type: 'text', value: '새 픽셀 던전' }), iSub = h('input', { type: 'checkbox', checked: true }), where = h('small', { class: 'hint', style: { display: 'block', wordBreak: 'break-all' } }), iApp = h('input', { type: 'text', value: 'My Pixel Dungeon' }), iPkg = h('input', { type: 'text', value: 'com.pdmaker.mypixeldungeon' }), warn = h('small', { class: 'hint c-bad' });
    let pkgTouched = false;
    const target = () => iSub.checked ? pdm.join(base, folderName(iName.value)) : base;
    const showWhere = () => { where.textContent = '만들 곳: ' + target(); };
    iName.addEventListener('input', showWhere); iSub.addEventListener('change', showWhere); showWhere();
    iApp.addEventListener('input', () => { if (!pkgTouched) iPkg.value = 'com.pdmaker.' + slug(iApp.value); });
    iPkg.addEventListener('input', () => { pkgTouched = true; warn.textContent = PDM.validPackage(iPkg.value) ? '' : '패키지 이름은 영문 소문자·숫자를 점으로 이은 꼴이어야 합니다 (예: com.myname.mygame)'; });
    const made = await PDM.ui.modal('새 프로젝트', h('div', { style: { minWidth: '460px', maxWidth: '560px' } },
      PDM.ui.field('프로젝트 이름', iName),
      h('label', { class: 'check' }, iSub, '고른 위치 안에 프로젝트 이름으로 폴더 만들기'), where,
      PDM.ui.field('게임 이름 (appName) — 게임 창 제목 · 세이브 폴더 이름', iApp, '영문을 권합니다. 원작(Shattered Pixel Dungeon)과 다르게 지어야 세이브가 섞이지 않습니다.'),
      PDM.ui.field('패키지 이름 (appPackageName)', iPkg), warn,
      h('p', { class: 'hint' }, '이 둘은 테스트 플레이·게임 내보내기 때 게임 저장소의 build.gradle 에 적힙니다. 세이브는 %APPDATA%\\.<패키지 둘째 마디>\\<게임 이름> 폴더에 따로 저장됩니다. 나중에 프로젝트 설정에서 바꿀 수 있습니다.')),
      [['취소', null], ['만들기', () => ({ name: iName.value.trim() || '새 픽셀 던전', appName: iApp.value.trim(), pkg: iPkg.value.trim(), dir: target(), sub: iSub.checked }), 'pri']]);
    if (!made) return;
    const d = made.dir;
    if (await pdm.exists(pdm.join(d, 'project.json'))) { toast('이미 프로젝트가 있는 폴더입니다: ' + d, 'bad'); return; }
    if (made.sub && await pdm.exists(d)) {
      const items = (await pdm.list(d)) || [];
      if (items.length && !(await PDM.ui.confirm(`「${d}」 폴더가 이미 있고 비어 있지 않습니다 (${items.length}개). 그래도 이 폴더에 만들까요?`))) return;
    }
    if (made.sub) { try { await pdm.mkdir(d); } catch (e) { toast('폴더를 만들지 못했습니다: ' + e.message, 'bad'); return; } }
    const name = made.name;
    PDM.tabs.closeAll();
    creating = true;
    try { await store.createNew(d, name); } finally { creating = false; }
    store.edit('project', '게임 이름', r => { r.game = { appName: made.appName, appPackageName: PDM.validPackage(made.pkg) ? made.pkg : '' }; });
    await resolveRepo(true);   // 기본값(../../git-hub/…)이 이 폴더에서 틀리면 찾아서 고쳐 둠
    // 게임 저장소 경로: 왜 필요한지 설명 + 찾았는지 표시
    const cur = store.get('project').gameRepo || '';
    const found = cur && await isRepo(store.abs(cur));
    const inp = h('input', { type: 'text', value: cur, placeholder: '예: ../pd-maker/game/shattered-pixel-dungeon-master' });
    const pick = h('button', { class: 'btn sm', onclick: async e => { e.preventDefault(); const f = await pdm.openFolder('게임 저장소 폴더 선택 (gradlew 가 들어 있는 폴더)'); if (f) inp.value = pdm.relative(d, f).replace(/\\/g, '/') || f; } }, '폴더 찾기…');
    // PDMaker 의 game 폴더에 들어 있는 저장소들 — 눌러서 고름 (여러 개면 어느 것을 쓸지 꼭 골라야 함)
    const repos = await listRepos();
    const repoBtns = h('div', { class: 'flex gap-3 wrap m-0 mt-2 mb-4' });
    const drawRepos = () => repoBtns.replaceChildren(...repos.map(r => { const rel = pdm.relative(d, r.dir).replace(/\\/g, '/'); return h('button', { class: 'btn sm' + (inp.value === rel ? ' pri' : ''), onclick: e => { e.preventDefault(); inp.value = rel; drawRepos(); } }, r.name); }));
    drawRepos(); inp.addEventListener('input', drawRepos);
    const rel = await PDM.ui.modal('게임 저장소 경로', h('div', { style: { maxWidth: '620px' } },
      h('p', {}, 'PDMaker 는 게임을 처음부터 만드는 것이 아니라, ', h('b', {}, 'Shattered Pixel Dungeon 의 소스 코드(게임 저장소)'), ' 위에 프로젝트를 얹어서 실행합니다. 그래서 테스트 플레이와 게임 내보내기를 하려면 게임 저장소 폴더가 꼭 있어야 합니다.'),
      h('p', {}, '아래 둘 중 하나를 준비해 주세요.'),
      h('ul', { style: { margin: '4px 0 10px 18px' } },
        h('li', {}, '원작 소스: ', h('a', { href: '#', onclick: e => { e.preventDefault(); pdm.openExternal && pdm.openExternal(PDM.SPD_REPO_URL); } }, PDM.SPD_REPO_URL), ' 에서 받은 폴더 (Code → Download ZIP 을 풀거나 git clone)'),
        h('li', {}, '원래 작업하던 픽셀 던전(모드) 소스 폴더 — gradlew 파일이 들어 있는 맨 위 폴더')),
      h('p', { class: 'hint' }, '받은 폴더를 PDMaker 폴더의 game 안에 shattered-pixel-dungeon-master 라는 이름으로 넣어 두면 자동으로 찾습니다. 다른 곳에 두었다면 아래에 경로를 적거나 [폴더 찾기…] 로 고르세요. 나중에 프로젝트 설정 → 게임 저장소 연결에서도 바꿀 수 있습니다.'),
      h('p', { class: 'hint', style: { color: found ? 'var(--good, #5fd66a)' : 'var(--bad)' } }, found ? '✓ 게임 저장소를 찾았습니다: ' + cur : '✗ 아직 게임 저장소를 찾지 못했습니다 — 경로를 지정하지 않으면 그림 미리보기·테스트 플레이가 되지 않습니다.'),
      repos.length ? h('div', {}, h('b', { class: 'fs-sm' }, repos.length > 1 ? 'PDMaker 의 game 폴더에 저장소가 여러 개 있습니다 — 이 프로젝트에 쓸 것을 고르세요:' : 'PDMaker 의 game 폴더에 있는 저장소:'), repoBtns) : null,
      PDM.ui.field('게임 저장소 경로 (프로젝트 폴더 기준 상대 경로 또는 절대 경로)', h('div', { class: 'flex gap-3' }, inp, pick))),
      [['나중에', null], ['확인', () => inp.value.trim(), 'pri']]);
    if (rel) { store.edit('project', '게임 저장소 경로', r => { r.gameRepo = rel; r.gameRepoPinned = true; }); await store.save(); await resolveRepo(true); if (PDM.assets && PDM.assets.clear) PDM.assets.clear(); }
    // 고른 저장소가 기준 저장소와 다르면: 방금 채운 원작 영웅·캐릭터를 그 저장소에 맞춤 (없는 것은 빼고, 그 저장소에만 있는 것은 더함)
    try { if (PDM.gameScan) await PDM.gameScan(await resolveRepo(true), true); const r = PDM.gameSyncVanilla && await PDM.gameSyncVanilla();
      if (r && (r.charsRemoved || r.charsAdded || r.heroesRemoved || r.heroesAdded || r.heroesHidden || r.heroesFixed)) { PDM.log(`게임 저장소에 맞춰 리소스를 고쳤습니다 — 캐릭터 −${r.charsRemoved} +${r.charsAdded} · 영웅 −${r.heroesRemoved} +${r.heroesAdded}${r.heroesHidden ? ' (감춘 직업 ' + r.heroesHidden + '개는 꺼 둠)' : ''}`, 'ok'); await store.save(); } } catch (e) { console.error(e); PDM.log('리소스를 게임 저장소에 맞추지 못했습니다: ' + e.message, 'err'); }
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
    ['gameRepo', 'legacyMaker'].forEach(k => {
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
    const isWin = /win/i.test(navigator.platform || '') || /Windows/.test(navigator.userAgent);
    // 안드로이드 서명: 비우면 프로젝트의 signing/ 에 자동으로 만든 키 (경로 · 별칭만 기억하고 비밀번호는 저장하지 않음)
    const own = h('input', { type: 'checkbox', checked: !!last.keystore });
    const ksIn = h('input', { type: 'text', value: last.keystore || '', placeholder: '키스토어 파일 (.jks · .keystore)' });
    const ksPick = h('button', { class: 'btn sm', onclick: async e => { e.preventDefault(); const f = await pdm.openFile('키스토어 파일', ['jks', 'keystore', 'p12']); if (f) ksIn.value = f; } }, '찾기…');
    const alIn = h('input', { type: 'text', value: last.alias || '', placeholder: '별칭 (alias)' });
    const spIn = h('input', { type: 'password', placeholder: '키스토어 비밀번호' }), kpIn = h('input', { type: 'password', placeholder: '키 비밀번호 (비우면 같음)' });
    const ownBox = h('div', { style: { display: 'grid', gap: '4px', marginTop: '4px' } }, h('div', { class: 'imgpick' }, ksIn, ksPick), PDM.ui.row(alIn, spIn, kpIn));
    const syncOwn = () => { ownBox.style.display = own.checked ? 'grid' : 'none'; };
    own.onchange = syncOwn; syncOwn();
    const apkBox = h('div', { class: 'export-apk', style: { border: '1px solid var(--line)', borderRadius: '6px', padding: '6px 8px', marginTop: '6px' } },
      h('b', {}, '안드로이드 서명'),
      h('small', { class: 'hint', style: { display: 'block', margin: '2px 0 4px' } }, '기본: 처음 내보낼 때 프로젝트의 signing 폴더에 서명 키를 만들어 두고 계속 씁니다 (게임 파일에는 들어가지 않음). 같은 키로 서명해야 이미 설치한 게임 위에 업데이트되니 그 폴더를 잃어버리지 마세요. 구글 플레이에 올릴 거라면 내 키스토어를 쓰세요.'),
      h('label', { class: 'check' }, own, '내 키스토어 쓰기'), ownBox);
    const KINDS = [
      ['jar', 'JAR + 실행 파일(.bat)', '빠름. 받는 PC 에 Java 17 이상이 있어야 합니다. 폴더 크기 약 20~30 MB.'],
      ['image', 'Windows 실행 파일 폴더 (.exe · Java 포함)', 'Java 없이 폴더 안의 .exe 로 바로 실행. 처음 한 번은 JDK 를 내려받아 몇 분 걸립니다. 폴더 크기 약 60~90 MB.'],
      ['installer', 'Windows 설치 파일 (.exe 하나)', '받는 사람은 이 .exe 하나만 실행하면 설치되고 시작 메뉴 · 바탕 화면 바로 가기가 생깁니다 (게임 데이터 포함, 관리자 권한 필요 없음). 처음 한 번 WiX 도구(약 40MB)를 내려받습니다.' + (isWin ? '' : ' ⚠ Windows 에서만 만들 수 있습니다.')],
      ['apk', '안드로이드 앱 (.apk)', '휴대폰에 복사해서 설치하는 파일 (게임 데이터 포함). Android Studio 를 설치해 SDK 가 있어야 합니다. 처음 빌드는 내려받을 것이 많아 오래 걸립니다.']
    ];
    const syncKind = () => { apkBox.style.display = kind === 'apk' ? '' : 'none'; };
    const kindBox = h('div', { class: 'export-kinds' }, KINDS.map(([k, t, d]) => {
      const card = h('label', { class: 'export-kind' + (k === kind ? ' on' : '') },
        h('input', { type: 'radio', name: 'exk', checked: k === kind, onchange: () => { kind = k; kindBox.querySelectorAll('.export-kind').forEach(x => x.classList.toggle('on', x === card)); syncKind(); } }),
        h('div', {}, h('b', {}, t), h('small', { class: 'hint' }, d)));
      return card;
    }));
    syncKind();
    const body = h('div', { style: { minWidth: '520px' } },
      PDM.ui.field('게임 이름 (폴더·실행 파일 이름)', nameIn),
      PDM.ui.field('만들 곳', h('div', { class: 'imgpick' }, outIn, pick), '이 폴더 안에 "게임 이름" 폴더가 만들어집니다'),
      PDM.ui.field('종류', kindBox), apkBox,
      h('p', { class: 'hint' }, '저장 → 검사 → 게임 런타임 설치·코드 생성 → gradle 빌드 → 결과 + 프로젝트(project 폴더)를 모아 둡니다. 진행 상황은 출력 창에 나옵니다. 게임 이름·아이콘·버전 같은 게임 자체 정보는 게임 저장소 설정을 따릅니다.'));
    const ok = await PDM.ui.modal('게임 파일 내보내기', body, [['취소', false], ['내보내기', true, 'pri']]);
    if (!ok) return;
    const name = nameIn.value.trim() || projName(), outDir = outIn.value.trim();
    if (!outDir) { toast('만들 곳을 고르세요', 'bad'); return; }
    const signing = kind === 'apk' && own.checked ? { store: ksIn.value.trim(), alias: alIn.value.trim(), storePass: spIn.value, keyPass: kpIn.value } : null;
    if (signing && (!signing.store || !signing.alias || !signing.storePass)) { toast('키스토어 파일 · 별칭 · 비밀번호를 적어 주세요', 'bad'); return; }
    try { localStorage.setItem(EXPORT_KEY, JSON.stringify({ name, outDir, kind, keystore: signing ? signing.store : '', alias: signing ? signing.alias : '' })); } catch (_) { /* 무시 */ }
    const errs = runCheck().filter(r => r.level === 'error');
    if (errs.length && !(await PDM.ui.confirm(`오류 ${errs.length}개가 있습니다. 그래도 내보낼까요?`))) return;
    await saveAll();
    const p = store.get('project');
    try {
      showBottom('log');
      PDM.log(`게임 파일 내보내기 시작: ${name} (${(KINDS.find(x => x[0] === kind) || [, kind])[1]}) → ${outDir}`, 'ok');
      const r = await pdm.exportGame({ repo: await resolveRepo(), project: store.root, outDir, kind, name, signing });
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
  async function runGame(task, mode) {
    showBottom('log');
    const repo = await resolveRepo();
    // 테스트 플레이 빌드: 프로젝트 설정 (settings.playTask: 'debug' 기본 = gradle desktop:debug, INDEV 버전 | 'playtest' = PDMaker 테스트 실행)
    if (!mode) mode = (((store.get('project') || {}).settings || {}).playTask) || 'debug';
    if (task === 'play') PDM.log(mode === 'debug' ? '> 테스트 플레이: gradle desktop:debug (INDEV 버전)' : '> 테스트 플레이: PDMaker 테스트 실행 (PLAYTEST 버전)', 'dim');
    try { showBottom('log'); await pdm.runGame({ repo, project: store.root, task, mode }); setRunning(true); }
    catch (e) { PDM.log(e.message, 'err'); toast(e.message, 'bad'); }
  }
  async function playtest(mode) {
    if (!store.isOpen) return;
    const errs = runCheck().filter(r => r.level === 'error');
    if (errs.length && !(await PDM.ui.confirm(`오류 ${errs.length}개가 있습니다. 그래도 실행할까요?`))) return;
    await saveAll();
    runGame('play', typeof mode === 'string' ? mode : undefined);
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

  // ---------------- 시작 화면 (대시보드) ----------------
  /** 단축키 글자 → <kbd> 묶음 ('Ctrl+Shift+N' → Ctrl Shift N) */
  const kbdOf = id => { const k = PDM.keys.label(id); return k ? h('span', { class: 'hstack gap-1' }, String(k).split(' / ')[0].split('+').map(x => h('kbd', {}, x))) : null; };
  function drawWelcome() {
    const body = $('#tabbody'); body.innerHTML = '';
    const rec = recent();
    const logo = h('canvas', { width: 24, height: 24, 'aria-hidden': 'true' }); drawLogo(logo);
    const action = (ico, title, desc, run, key, pri) => h('button', { class: 'action' + (pri ? ' pri' : ''), onclick: run },
      h('span', { class: 'a-ico' }, PDM.icon(ico, 'lg')), h('span', {}, h('b', {}, title), h('span', {}, desc)), key ? kbdOf(key) : h('span'));
    const keyRow = (label, id) => [h('span', {}, label), kbdOf(id) || h('span', { class: 'c-dim' }, '—')];
    body.append(h('div', { class: 'welcome' },
      h('div', { class: 'dash-hero' }, logo,
        h('div', {}, h('h1', {}, '픽셀 던전 메이커'),
          h('p', {}, 'Shattered Pixel Dungeon 기반 게임 제작 도구. 맵 · 캐릭터 · 아이템 · 이벤트 · 스토리를 만들고 바로 테스트 플레이합니다.'))),
      !pdm.isElectron ? h('div', { class: 'dash-note', role: 'note' }, PDM.icon('circle-alert'), h('span', {}, '웹 모드로 실행 중입니다. 저장은 브라우저 안에만 되고, 테스트 플레이는 할 수 없습니다.')) : null,
      h('div', { class: 'dash-grid' },
        h('div', { class: 'dash-col' },
          h('section', {}, h('div', { class: 'dash-label' }, '시작하기'),
            h('div', { class: 'dash-actions' },
              action('file-plus', '새 프로젝트', '프로젝트 이름의 새 폴더에 26층 기본 구조로 시작', newProject, 'newProject', true),
              action('folder-open', '프로젝트 열기', 'project.json 이 있는 폴더 선택', openProject, 'openProject'),
              action('download', '프로젝트 가져오기', '내보낸 .pdmproj 파일을 빈 폴더에 풀어서 열기', importProject))),
          h('section', {}, h('div', { class: 'dash-label' }, '자주 쓰는 단축키'),
            h('div', { class: 'dash-keys' }, keyRow('저장', 'save'), keyRow('테스트 플레이', 'playtest'), keyRow('검사 (끊어진 참조)', 'check'), keyRow('리소스 검색', 'treeSearch'), keyRow('지금 탭 닫기', 'closeTab')))),
        h('section', { class: 'dash-col' },
          h('div', {}, h('div', { class: 'dash-label' }, h('span', {}, '최근 프로젝트' + (rec.length ? ` · ${rec.length}` : '')),
            rec.length ? h('button', { class: 'btn ghost xs', title: '최근 프로젝트 목록을 모두 지웁니다 (프로젝트 폴더는 그대로)', onclick: async () => {
              if (await PDM.ui.confirm('최근 프로젝트 목록을 모두 지울까요?\n(목록에서만 빠지고 프로젝트 폴더는 지워지지 않습니다)')) { saveRecent([]); drawWelcome(); }
            } }, '목록 비우기') : null),
          rec.length ? h('div', { class: 'recent' }, rec.map((r, i) => recentRow(r, i, rec)))
            : h('div', { class: 'recent-empty' }, PDM.icon('folder', 'xl'), h('b', {}, '아직 연 프로젝트가 없습니다'), h('span', { class: 'fs-sm' }, '새 프로젝트를 만들거나 폴더를 열면 여기에 쌓입니다.')))))));
    // 폴더가 없어진 항목 표시 (옮겼거나 지운 프로젝트)
    rec.forEach(async (r, i) => {
      let ok = true; try { ok = await pdm.exists(pdm.join(r.path, 'project.json')); } catch (_) { /* 무시 */ }
      const row = body.querySelector(`.recent-row[data-i="${i}"]`);
      if (row && !ok) { row.classList.add('missing'); row.title = '이 폴더에 project.json 이 없습니다 — 「경로」로 고치거나 「삭제」로 목록에서 빼세요'; }
    });
  }
  /** 최근 프로젝트 한 줄: 클릭하면 열기 · 별명 · 경로 수정 · 위로 · 목록에서 삭제 */
  function recentRow(r, i, rec) {
    const base = r.path.replace(/[\\/]+$/, '').split(/[\\/]/).pop();
    const act = (label, title, fn) => h('button', { class: 'btn ghost xs', title, onclick: e => { e.stopPropagation(); fn(); } }, label);
    const update = fn => { const list = recent(); const x = list.find(y => samePath(y.path, r.path)); if (x) { fn(x, list); saveRecent(list); } drawWelcome(); };
    return h('div', { class: 'recent-row', 'data-i': i, tabindex: 0, role: 'button', onclick: () => loadProject(r.path), onkeydown: e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); loadProject(r.path); } }, title: r.path },
      PDM.icon('folder'), h('div', { class: 'recent-main' }, h('b', {}, r.name || base), h('span', {}, r.path)),
      h('div', { class: 'recent-acts' },
        i > 0 ? act('▲', '위로 올리기', () => update((x, list) => { const k = list.indexOf(x); list.splice(k, 1); list.splice(k - 1, 0, x); })) : null,
        act('이름', '목록에 보일 이름 바꾸기 (폴더 이름은 그대로)', async () => {
          const v = await PDM.ui.prompt('목록에 보일 이름', r.name || base, '비우면 폴더 이름으로 보입니다. 프로젝트 폴더·파일은 바뀌지 않습니다.');
          if (v !== null && v !== undefined) update(x => { x.name = v.trim() === base ? '' : v.trim(); });
        }),
        act('경로', '프로젝트 폴더를 옮겼을 때 새 위치 지정', async () => {
          const d = await pdm.openFolder('프로젝트 폴더 다시 지정 (project.json 이 있는 폴더)');
          if (!d) return;
          let ok = false; try { ok = await pdm.exists(pdm.join(d, 'project.json')); } catch (_) { /* 무시 */ }
          if (!ok) { toast('project.json 이 없는 폴더입니다', 'bad'); return; }
          update((x, list) => { const dup = list.findIndex(y => y !== x && samePath(y.path, d)); if (dup >= 0) list.splice(dup, 1); x.path = d; });
        }),
        act('삭제', '최근 목록에서 빼기 (프로젝트 폴더는 지우지 않음)', () => update((x, list) => list.splice(list.indexOf(x), 1)))));
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

  function drawLogo(cv) {
    const g = (cv || $('#logo')).getContext('2d');
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
    store.on('load', () => { try { const pj = store.get('project'); if (pj && (!pj.extensions || pj.extensions.prop === undefined) && store.all('prop').length) store.edit('project', '확장 기능 켜기: 맵 오브젝트', r => { r.extensions = Object.assign({}, r.extensions, { prop: true }); }, { silent: true }); } catch (_) { /* 무시 */ }
      drawAll(); resolveRepo(true).then(() => offerBundle()).then(() => { if (!creating) offerLegacyRepo(); }); });
    store.on('change', () => drawToolbar());
    // 단축키: keys.js 의 동작 표 (편집 › 단축키 설정… 에서 바꿈)
    const K = PDM.keys;
    K.define('newProject', newProject); K.define('openProject', openProject); K.define('save', saveAll); K.define('saveAs', saveAs);
    K.define('exportProject', exportProject); K.define('exportGame', exportGame); K.define('undo', undo); K.define('redo', redo);
    K.define('keySettings', () => K.dialog()); K.define('playtest', () => playtest()); K.define('stopGame', stopGame); K.define('check', runCheck);
    K.define('projectSettings', () => store.isOpen && PDM.tabs.open('project')); K.define('showLog', () => showBottom('log'));
    K.define('closeTab', () => { if (!PDM.ui.closeTop() && active) PDM.tabs.close(active.key); });   // 떠 있는 창 · 메뉴가 먼저, 없으면 지금 탭 (프로그램은 닫지 않음)
    K.define('nextTab', () => PDM.tabs.cycle(1)); K.define('prevTab', () => PDM.tabs.cycle(-1));
    // 복사 · 붙여넣기: 지금 탭 편집기의 ctx.copy/paste(고른 노드 · 오브젝트 · 명령) → 리소스 통째로 → 목록 항목(이펙트 등)
    const resKey = k => /^(char|item|event|prop|room|hero):(.+)$/.exec(k || '');
    K.define('copy', () => {
      const txt = window.getSelection ? String(window.getSelection()) : ''; if (txt.trim()) return false;   // 글을 드래그해 골랐으면 브라우저 복사
      if (!active) return false;
      if (active.ctx && active.ctx.copy && active.ctx.copy() !== false) return;
      const m = resKey(active.key); if (m && store.has(active.key)) { PDM.resOps.copy(m[1], m[2]); return; }
      const lo = PDM.listOpsAll[active.key]; if (lo && lo.current) { lo.copy(); return; }
      return false;
    });
    K.define('paste', async () => {
      const c = await PDM.clip.get(); if (!c) { toast('복사한 것이 없습니다'); return; }
      if (active && active.ctx && active.ctx.paste && active.ctx.paste(c) !== false) return;
      if (c.kind.startsWith('res:')) PDM.resOps.paste(c.kind.slice(4), c.payload);
      else if (c.kind.startsWith('list:') && PDM.listOpsAll[c.kind.slice(5)]) PDM.listOpsAll[c.kind.slice(5)].paste(c.payload);
      else toast(`여기에는 붙여 넣을 수 없습니다 — ${c.label || c.kind}`, 'bad');
    });
    K.define('treeSearch', () => { const i = $('#treeSearch input'); if (i) { i.focus(); i.select(); } });
    K.onChange(() => { drawMenubar(); drawToolbar(); });
    addEventListener('keydown', e => {
      if (e.key === 'Escape' && !K.capturing && PDM.ui.closeTop()) { e.preventDefault(); return; }   // Esc = 맨 위 창 · 메뉴 닫기
      K.handle(e, /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName));
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
    if (pdm.isElectron) setTimeout(() => checkUpdate(false), 4000);   // 시작할 때 조용히 한 번 확인
    const q = new URLSearchParams(location.search).get('project');
    if (q) loadProject(q);
  }
  PDM.app = { listRepos, setRepo, editBuildGradle, redraw: () => drawAll(), expandTree: id => { if (!expanded.has(id)) { expanded.add(id); drawTree(); } }, loadProject, saveAll, saveAs, exportProject, importProject, exportGame, cleanBuild, playtest, runCheck, showBottom, bundleRepo, resolveRepo };
  document.readyState === 'loading' ? addEventListener('DOMContentLoaded', init) : init();
})();
