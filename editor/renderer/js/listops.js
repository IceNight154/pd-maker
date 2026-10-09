// ================================================================
//  listOps — { list: [ { id, name … } ] } 꼴 리소스(이펙트 · 글자 연출)의 추가 · 복제 · 삭제 · id 바꾸기 · 순서
//    리소스 목록(트리)의 항목·오른쪽 클릭 메뉴와 편집 화면의 도구 줄에서 같이 씀
//    o = { K(저장 키), label, icon, prefix(새 id 앞머리), make(id, preset), clean(복제본 손질), presets{키: 이름} · presetMenu(add)(묶음 메뉴 — 있으면 presets 대신), cmdType(이벤트 명령 이름) + cmdKey(그 명령의 id 칸, 기본 fx), objType(맵 오브젝트 type), fields[아이템 등의 참조 칸] }
// ================================================================
PDM.listOpsAll = {};   // 저장 키 → listOps (Ctrl+C / Ctrl+V 가 지금 탭의 것을 찾음)
PDM.listOps = function (o) {
  const { h, store } = PDM;
  const list = () => (store.get(o.K) || {}).list || [];
  let want = null;
  const freeId = base => { let id = base, n = 2; while (list().some(x => x.id === id)) id = base + '_' + n++; return id; };
  async function askId(def, cur) {
    const name = await PDM.ui.prompt(`${o.label} id (영문·숫자)`, cur || freeId(def)); if (!name) return null;
    const id = name.trim().replace(/[^A-Za-z0-9_]/g, '_');
    if (!id || (id !== cur && list().some(x => x.id === id))) { PDM.log && PDM.log('이미 있거나 쓸 수 없는 id 입니다: ' + id, 'err'); return null; }
    return id;
  }
  const show = id => { want = id; PDM.tabs.open(o.K); PDM.tabs.refresh(o.K); };
  async function add(preset) {
    const id = await askId(preset || o.prefix || 'fx'); if (!id) return;
    const it = o.make(id, preset); want = id;
    store.edit(o.K, o.label + ' 추가', r => { r.list = r.list || []; r.list.push(it); }); PDM.tabs.open(o.K); PDM.app.expandTree(o.K);
  }
  async function dup(srcId) {
    const src = list().find(x => x.id === srcId); if (!src) return;
    const id = await askId(src.id + '_copy'); if (!id) return;
    const c = Object.assign(PDM.clone(src), { id, name: (src.name || src.id) + ' 사본' }); if (o.clean) o.clean(c);
    want = id; store.edit(o.K, o.label + ' 복제', r => { r.list.splice(r.list.findIndex(x => x.id === srcId) + 1, 0, c); }); PDM.tabs.open(o.K); PDM.app.expandTree(o.K);
  }
  async function remove(id) {
    const it = list().find(x => x.id === id); if (!it) return;
    if (!(await PDM.ui.confirm(`「${it.name || it.id}」 ${o.label}을(를) 지울까요?`))) return;
    store.edit(o.K, o.label + ' 삭제', r => { r.list = r.list.filter(x => x.id !== id); });
  }
  /** 객체 v 안에서 이 목록의 old id 를 쓰는 곳을 nu 로 고침 (nu 가 null 이면 세기만). 돌려줌: 수 */
  const fixRefs = (v, old, nu) => { let n = 0; if (!v || typeof v !== 'object') return 0;
    const set = (x, k) => { n++; if (nu != null) x[k] = nu; };
    if (!Array.isArray(v)) { const ck = o.cmdKey || 'fx'; if (o.cmdType && (v.type === o.cmdType || v.cmd === o.cmdType) && v[ck] === old) set(v, ck); if (o.objType && v.type === o.objType && v.ref === old) set(v, 'ref'); (o.fields || []).forEach(f => { if (v[f] === old) set(v, f); }); }
    Object.values(v).forEach(x => { n += fixRefs(x, old, nu); }); return n; };
  /** 쓰는 곳 [{ key, n }] */
  const usage = id => store.keys().filter(k => k !== o.K).map(k => ({ key: k, n: fixRefs(store.get(k), id, null) })).filter(x => x.n);
  function showUsage(id) {
    const u = usage(id || current);
    PDM.ui.modal(`쓰는 곳 — ${id || current}`, h('div', { style: { minWidth: '360px' } },
      u.length ? u.map(x => h('div', {}, h('a', { href: '#', onclick: e => { e.preventDefault(); PDM.tabs.open(x.key); } }, x.key), h('span', { class: 'hint' }, ` · ${x.n}군데`)))
        : h('p', { class: 'hint' }, '쓰는 곳이 없습니다.')), [['닫기', null, 'pri']]);
  }
  /** id 바꾸기 — 이 id 를 쓰는 이벤트 명령 · 맵 오브젝트 · 아이템 칸도 함께 고침 */
  async function rename(old) {
    const id = await askId(null, old); if (!id || id === old) return;
    const fix = v => fixRefs(v, old, id);
    let refs = 0;
    store.transaction(o.label + ' id 바꾸기', () => {
      store.edit(o.K, 'id 바꾸기', r => { const it = r.list.find(x => x.id === old); if (it) it.id = id; });
      store.keys().forEach(k => { if (k === o.K) return; const n = fix(PDM.clone(store.get(k))); if (n) { refs += n; store.edit(k, 'id 바꾸기', r => { fix(r); }); } });
    });
    want = id; PDM.tabs.refresh(o.K);
    PDM.log && PDM.log(`${o.label} id: ${old} → ${id}` + (refs ? ` (쓰는 곳 ${refs}군데도 고침)` : ''), 'ok');
  }
  // 복사 · 붙여넣기 (Ctrl+C / Ctrl+V — 편집 화면에서 고른 항목, bar() 가 기억)
  let current = null;
  function copy(id) { const it = list().find(x => x.id === (id || current)); if (it) PDM.clip.set('list:' + o.K, it, `${o.label} ${it.name || it.id}`); }
  function paste(data) {
    if (!data) return;
    const id = freeId(String(data.id || o.prefix || 'item').replace(/[^A-Za-z0-9_]/g, '_'));
    const c = Object.assign(PDM.clone(data), { id }); if (id !== data.id) c.name = (data.name || data.id) + ' 사본'; if (o.clean && id !== data.id) o.clean(c);
    want = id; store.edit(o.K, o.label + ' 붙여넣기', r => { r.list = r.list || []; r.list.push(c); }); PDM.tabs.open(o.K); PDM.tabs.refresh(o.K);
    toast(`붙여 넣었습니다: ${c.name || id}`);
  }
  const move = (id, d) => store.edit(o.K, o.label + ' 순서', r => { const i = r.list.findIndex(x => x.id === id), j = i + d; if (i < 0 || j < 0 || j >= r.list.length) return; [r.list[i], r.list[j]] = [r.list[j], r.list[i]]; });
  const addMenu = () => o.presetMenu ? o.presetMenu(add) : o.presets ? Object.entries(o.presets).map(([k, name]) => ({ label: `새 ${o.label}: ${name}`, run: () => add(k) })) : [{ label: `새 ${o.label}…`, run: () => add() }];   // presetMenu(add) = 묶음이 있는 메뉴
  const menuOf = x => [{ label: '열기', run: () => show(x.id) }, { label: '복제', run: () => dup(x.id) }, { label: 'id 바꾸기…', run: () => rename(x.id) },
    { label: '복사', hint: PDM.keys.label('copy'), run: () => copy(x.id) }, { label: '붙여넣기', hint: PDM.keys.label('paste'), run: async () => { const c = await PDM.clip.get(); if (c && c.kind === 'list:' + o.K) paste(c.payload); else toast(`복사한 ${o.label}이(가) 없습니다`); } }, '-',
    { label: '위로', run: () => move(x.id, -1) }, { label: '아래로', run: () => move(x.id, 1) }, '-', { label: '삭제', run: () => remove(x.id) }];
  return PDM.listOpsAll[o.K] = {
    list, add, dup, remove, rename, move, show, copy, paste, usage, showUsage, get current() { return current; },
    /** 편집 화면: 리소스 목록에서 고른 것이 있으면 st.id 로 (true = 바뀜) */
    take(st) { if (!want) return false; st.id = want; want = null; return true; },
    /** 리소스 목록 뿌리 항목 */
    treeNode(order) {
      const l = list();
      return { id: o.K, label: o.title, icon: o.icon, open: o.K, order, count: l.length, menu: addMenu, expandOnOpen: true,
        actions: [{ label: '＋', title: `새 ${o.label} 만들기`, run: e => o.presets && e ? PDM.ui.menu(e.clientX, e.clientY + 8, addMenu()) : add() }],
        children: l.map(x => ({ id: o.K + '__' + x.id, label: `${x.name || x.id} (${x.id})`, icon: o.itemIcon ? o.itemIcon(x) : '', run: () => show(x.id), menu: menuOf(x),
          actions: [{ label: '⧉', title: '복제', run: () => dup(x.id) }, { label: '✕', title: '삭제', run: () => remove(x.id) }] })) };
    },
    /** 편집 화면 도구 줄: 고른 것 fx 에 대한 추가 · 복제 · id 바꾸기 · 순서 · 삭제 */
    bar(fx) {
      current = fx ? fx.id : null;
      const l = list(), i = fx ? l.findIndex(x => x.id === fx.id) : -1;
      return h('div', { class: 'btnbar res-bar' },
        h('button', { class: 'btn sm pri', onclick: e => o.presets ? PDM.ui.menu(e.clientX, e.clientY + 10, addMenu()) : add() }, '+ 새로 만들기'),
        fx ? h('button', { class: 'btn sm', onclick: () => dup(fx.id) }, '복제') : null,
        fx ? h('button', { class: 'btn sm', onclick: () => rename(fx.id) }, 'id 바꾸기') : null,
        fx ? h('button', { class: 'btn sm', title: '복사 — 다른 프로젝트에도 붙여 넣을 수 있음 (' + PDM.keys.label('copy') + ')', onclick: () => copy(fx.id) }, '복사') : null,
        (o.cmdType || o.objType || o.fields) && fx ? h('button', { class: 'btn sm', onclick: () => showUsage(fx.id) }, '쓰는 곳') : null,
        fx ? h('button', { class: 'btn sm', title: '목록에서 앞으로', disabled: i <= 0, onclick: () => move(fx.id, -1) }, '◀') : null,
        fx ? h('button', { class: 'btn sm', title: '목록에서 뒤로', disabled: i < 0 || i >= l.length - 1, onclick: () => move(fx.id, 1) }, '▶') : null,
        fx ? h('button', { class: 'btn sm danger ml-auto', onclick: () => remove(fx.id) }, '삭제') : null,
        h('span', { class: 'hint', style: { flexBasis: '100%' } }, fx ? `고른 것: ${fx.name || fx.id} (${fx.id}) — 리소스 목록에서 항목을 오른쪽 클릭해도 같은 메뉴가 나옵니다.` : '아직 없습니다. "+ 새로 만들기"로 시작하세요.'));
    }
  };
};
