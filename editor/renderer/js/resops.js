// ================================================================
//  resOps — 파일 하나짜리 리소스(캐릭터 · 아이템 · 이벤트 · 맵 오브젝트 · 방 템플릿)의 공용 동작
//    열기 · 이름 바꾸기 · id 바꾸기(쓰는 곳도 함께 고침) · 복제 · 삭제(쓰는 곳 수를 보여 줌)
//    리소스 목록의 오른쪽 클릭 메뉴와 편집 화면 머리말 버튼에서 같이 씀 — 편집기마다 따로 쓰던 복제/삭제 코드를 여기로 모음
// ================================================================
(function () {
  const { h, store } = PDM;
  const NAMES = { char: '캐릭터', item: '아이템', event: '이벤트', prop: '맵 오브젝트', room: '방 템플릿', hero: '영웅' };
  // 맵 오브젝트 type → 가리키는 리소스 종류
  const OBJ_KIND = { npc: 'char', mob: 'char', item: 'item', event: 'event', plate: 'event', prop: 'prop' };
  // 이벤트 명령 매개변수 종류 → 리소스 종류
  const PARAM_KIND = { char: 'char', charHero: 'char', item: 'item', event: 'event' };
  // 그 밖에 id 를 그대로 담는 칸 이름
  const FIELDS = {
    char: ['char', 'speaker', 'giver', 'turnIn', 'character'],
    item: ['item'],
    event: ['event', 'onEnter', 'acceptEvent', 'doneEvent'],
    prop: [],
    room: ['room'],
    hero: ['hero', 'heroId', 'startHero']
  };
  const LISTS = { item: ['likes', 'dislikes', 'knownItems'], hero: ['heroOrder'] };   // id 를 원소로 담는 배열 칸

  /** 객체 v 안의 old → nu 참조를 고침 (nu 가 null 이면 세기만). 돌려줌: 고친(찾은) 수 */
  function fixRefs(kind, old, nu, v) {
    let n = 0;
    const set = (o, k) => { n++; if (nu != null) o[k] = nu; };
    (function walk(x) {
      if (!x || typeof x !== 'object') return;
      if (Array.isArray(x)) { x.forEach(walk); return; }
      if (x.type && OBJ_KIND[x.type] === kind && x.ref === old) set(x, 'ref');
      const def = x.cmd && PDM.COMMANDS && PDM.COMMANDS[x.cmd];
      if (def) (def.params || []).forEach(p => { if (PARAM_KIND[p.t] === kind && x[p.k] === old) set(x, p.k); });
      if (x.type && x.target === old && ((kind === 'char' && (x.type === 'kill' || x.type === 'talk')) || (kind === 'item' && x.type === 'collect'))) set(x, 'target');
      (FIELDS[kind] || []).forEach(f => { if (x[f] === old && !(def && (def.params || []).some(p => p.k === f))) set(x, f); });
      (LISTS[kind] || []).forEach(f => { if (Array.isArray(x[f])) x[f].forEach((e, i) => { if (e === old) set(x[f], i); }); });
      Object.values(x).forEach(walk);
    })(v);
    return n;
  }
  /** 이 리소스를 쓰는 곳 [{ key, n }] */
  function usage(kind, id) {
    const out = [];
    store.keys().forEach(k => { if (k === kind + ':' + id) return; const n = fixRefs(kind, id, null, store.get(k)); if (n) out.push({ key: k, n }); });
    return out;
  }
  const freeId = (kind, base) => { let id = base, k = 2; while (store.has(kind + ':' + id)) id = base + '_' + k++; return id; };

  function open(kind, id) { PDM.tabs.open(kind + ':' + id); }
  async function renameLabel(kind, id) {
    const o = store.get(kind + ':' + id); if (!o) return;
    const n = await PDM.ui.prompt(`${NAMES[kind]} 이름`, o.name || ''); if (n == null || !n.trim() || n.trim() === o.name) return;
    store.edit(kind + ':' + id, '이름 바꾸기', r => { r.name = n.trim(); });
  }
  /** id 바꾸기 — 맵 오브젝트 · 이벤트 명령 · 퀘스트 · 상점 · 드랍 등 쓰는 곳도 함께 고침 */
  async function renameId(kind, id) {
    const raw = await PDM.ui.prompt(`${NAMES[kind]} 새 id (영문 · 숫자 · _)`, id, '쓰는 곳(맵 오브젝트 · 이벤트 명령 · 퀘스트 · 상점 · 드랍 · 영웅 연결)도 함께 바뀝니다. 조건식 안의 이름(char.<id>.favor 등)은 그대로이니 검사(F7)로 확인하세요.');
    if (!raw) return;
    const nu = PDM.slugId(raw.trim());
    if (!nu || nu === id) return;
    if (store.has(kind + ':' + nu)) { toast('이미 있는 id 입니다: ' + nu, 'bad'); return; }
    const users = usage(kind, id);
    let refs = 0;
    try {
      store.transaction(`${NAMES[kind]} id 바꾸기`, () => {
        store.rename(kind + ':' + id, kind + ':' + nu);
        store.edit(kind + ':' + nu, 'id 바꾸기', r => { r.id = nu; });
        users.forEach(u => { const k = u.key === kind + ':' + id ? kind + ':' + nu : u.key; if (!store.has(k)) return; store.edit(k, 'id 바꾸기 (참조)', r => { refs += fixRefs(kind, id, nu, r); }); });
      });
    } catch (e) { toast(e.message, 'bad'); return; }
    PDM.tabs.open(kind + ':' + nu);
    PDM.log && PDM.log(`${NAMES[kind]} id: ${id} → ${nu}` + (refs ? ` (쓰는 곳 ${refs}군데도 고침)` : ''), 'ok');
  }
  function dup(kind, id, after) {
    const src = store.get(kind + ':' + id); if (!src) return null;
    const nu = freeId(kind, id + '_copy');
    const c = Object.assign(PDM.clone(src), { id: nu, name: (src.name || id) + ' 사본' });
    store.add(kind + ':' + nu, c, `${NAMES[kind]} 복제`);
    if (after) after(nu, c);
    PDM.tabs.open(kind + ':' + nu);
    return nu;
  }
  async function remove(kind, id) {
    const o = store.get(kind + ':' + id); if (!o) return false;
    const u = usage(kind, id), cnt = u.reduce((a, x) => a + x.n, 0);
    const msg = `「${o.name || id}」 ${NAMES[kind]}을(를) 삭제할까요?` + (cnt ? `\n쓰는 곳 ${cnt}군데(${u.slice(0, 4).map(x => x.key).join(', ')}${u.length > 4 ? ' …' : ''})는 "대상 없음"이 됩니다.` : '');
    if (!(await PDM.ui.confirm(msg))) return false;
    store.remove(kind + ':' + id, `${NAMES[kind]} 삭제`);
    return true;
  }
  /** 리소스 목록 오른쪽 클릭 메뉴: "사용" 켜기/끄기 (enabled — 영웅 · 캐릭터 · 아이템) */
  function useToggle(kind, o) {
    const off = o.enabled === false;
    return { label: off ? '사용하기 (켜기)' : '사용 안 함 (끄기)', run: () => store.edit(kind + ':' + o.id, off ? '사용 켜기' : '사용 끄기', r => { if (off) delete r.enabled; else r.enabled = false; }) };
  }
  /** 복사 (Ctrl+C) — 리소스 통째로 */
  function copy(kind, id) { const o = store.get(kind + ':' + id); if (o) PDM.clip.set('res:' + kind, o, `${NAMES[kind] || kind} ${o.name || id}`); }
  /** 붙여넣기 — 같은 id 가 없으면 그 id 로 (다른 프로젝트에서 복사한 경우), 있으면 _copy 를 붙임 */
  function paste(kind, data) {
    if (!data || !NAMES[kind]) return null;
    const base = PDM.slugId(String(data.id || kind)), same = store.has(kind + ':' + base);
    const nu = same ? freeId(kind, base + '_copy') : base;
    const c = Object.assign(PDM.clone(data), { id: nu }); if (same) c.name = (data.name || base) + ' 사본';
    store.add(kind + ':' + nu, c, `${NAMES[kind]} 붙여넣기`);
    if (kind === 'hero') store.edit('project', '영웅 순서', r => { if (Array.isArray(r.heroOrder) && !r.heroOrder.includes(nu)) r.heroOrder.push(nu); }, { silent: true });
    PDM.tabs.open(kind + ':' + nu);
    toast(`붙여 넣었습니다: ${c.name || nu} (${nu})`);
    return nu;
  }
  /** 리소스 목록 오른쪽 클릭 메뉴의 공용 부분 (편집기가 extra 항목을 앞에 붙임) */
  /** o = { rename(id), dup(id) } — 그 리소스만의 방식이 있으면 (영웅: 시작 영웅 · 순서도 고침) */
  function menu(kind, id, extra, o = {}) {
    return [{ label: '열기', run: () => open(kind, id) }, { label: '이름 바꾸기…', run: () => renameLabel(kind, id) }, { label: 'id 바꾸기…', run: () => (o.rename || (x => renameId(kind, x)))(id) },
      { label: '복제', run: () => (o.dup || (x => dup(kind, x)))(id) }, { label: '복사', hint: PDM.keys.label('copy'), run: () => copy(kind, id) },
      { label: '붙여넣기 (새로 만들기)', hint: PDM.keys.label('paste'), run: async () => { const c = await PDM.clip.get(); if (c && c.kind === 'res:' + kind) paste(kind, c.payload); else toast(`복사한 ${NAMES[kind]}이(가) 없습니다`); } }, ...(extra && extra.length ? ['-', ...extra] : []), '-', { label: '삭제', run: () => remove(kind, id) }];
  }
  /** 편집 화면 머리말 버튼 줄 */
  function bar(kind, id, extra, o = {}) {
    return h('div', { class: 'btnbar res-bar' },
      h('button', { class: 'btn sm', onclick: () => (o.rename || (x => renameId(kind, x)))(id) }, 'id 바꾸기…'),
      h('button', { class: 'btn sm', onclick: () => (o.dup || (x => dup(kind, x)))(id) }, '복제'),
      h('button', { class: 'btn sm', title: '복사 — 다른 프로젝트에도 붙여 넣을 수 있음 (' + PDM.keys.label('copy') + ')', onclick: () => copy(kind, id) }, '복사'),
      h('button', { class: 'btn sm', title: '이 리소스를 쓰는 곳', onclick: () => showUsage(kind, id) }, '쓰는 곳'),
      ...(extra || []),
      h('button', { class: 'btn sm danger', style: { marginLeft: 'auto' }, onclick: () => remove(kind, id) }, '삭제'));
  }
  function showUsage(kind, id) {
    const u = usage(kind, id);
    PDM.ui.modal(`쓰는 곳 — ${id}`, h('div', { style: { minWidth: '360px' } },
      u.length ? u.map(x => h('div', {}, h('a', { href: '#', onclick: e => { e.preventDefault(); PDM.tabs.open(x.key); } }, x.key), h('span', { class: 'hint' }, ` · ${x.n}군데`)))
        : h('p', { class: 'hint' }, '쓰는 곳이 없습니다 (조건식 안의 이름은 찾지 않음).')), [['닫기', null, 'pri']]);
  }
  PDM.resOps = { useToggle, NAMES, open, renameLabel, renameId, dup, remove, menu, bar, usage, fixRefs, showUsage, copy, paste };
})();
