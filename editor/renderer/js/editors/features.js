// ================================================================
//  다른 저장소 기능 가져오기 (12차) — game/ 아래 다른 Pixel Dungeon 저장소의 기능을 찾아 이 프로젝트에 담음
//    탭 키: 'features'  ·  열기: 메뉴 프로젝트 › 다른 저장소 기능 가져오기 · 게임 저장소 탐색 화면의 버튼
//    찾기 · 필요한 것 · 꾸러미는 repo-features.js (main 프로세스) — 원본 저장소는 읽기만 함
//    가져온 기능은 프로젝트 features/<id>/ 에 담기고, 테스트 플레이 · 내보내기 때 설치기가 게임 저장소에 넣음 (런타임 제거 · 기능 끄기 → 원래 파일로)
// ================================================================
(function () {
  const h = PDM.h;
  const K = 'features';
  const KIND = { package: ['새 패키지', 'good'], class: ['새 클래스', 'info'], member: ['바뀐 · 새 멤버', 'warn'] };
  const MAX = 300;
  // toast: util.js 의 전역 함수
  let cur = null, cache = { source: '', target: '', cat: null, list: null, repos: null, closure: null, closureKey: '' };
  const refresh = () => { if (cur) cur.refresh(); };
  const project = () => PDM.store && PDM.store.root;

  async function load(st) {
    const repo = await PDM.app.resolveRepo(true);
    st.target = repo || '';
    // 다른 프로젝트 · 저장소로 바뀌었으면 처음부터
    if (cache.forRepo !== st.target || cache.forProject !== project()) { cache = { source: '', target: '', cat: null, list: null, repos: null, closure: null, closureKey: '', forRepo: st.target, forProject: project() }; st.picked = []; }
    if (!cache.repos && pdm.featureRepos) { try { cache.repos = await pdm.featureRepos(repo); } catch (e) { cache.repos = []; st.err = e.message; } }
    if (!cache.list && pdm.featureList && project()) { try { cache.list = await pdm.featureList(project()); } catch (e) { cache.list = []; } }
    refresh();
  }
  async function compare(st) {
    if (!st.source || !st.target) return;
    st.busy = '비교하는 중… (저장소 두 개의 클래스 · 멤버를 맞춰 봄)'; refresh();
    try { cache.cat = await pdm.featureCatalog(st.source, st.target); cache.source = st.source; cache.target = st.target; st.picked = []; cache.closure = null; }
    catch (e) { toast(e.message, 'bad'); }
    st.busy = ''; refresh();
  }
  async function preview(st) {
    const key = st.picked.join('|'); if (!key) { cache.closure = null; refresh(); return; }
    if (cache.closureKey === key && cache.closure) return;
    st.busy = '필요한 것을 따라가는 중…'; refresh();
    try { cache.closure = await pdm.featureClosure(cache.source, cache.target, st.picked); cache.closureKey = key; } catch (e) { toast(e.message, 'bad'); cache.closure = null; }
    st.busy = ''; refresh();
  }
  async function doImport(st) {
    if (!st.picked.length || !project()) return;
    const cl = cache.closure;
    const rep = (cl && cl.members.filter(m => m.change === 'changed').length) || 0;
    const ok = await pdm.confirm(`고른 기능 ${st.picked.length}개를 이 프로젝트에 가져옵니다.\n\n· 새 클래스 ${cl ? cl.classes.length : '?'}개 · 멤버 ${cl ? cl.members.length : '?'}개${rep ? ` (그중 이 게임의 원래 코드를 바꾸는 것 ${rep}개)` : ''}\n· 리소스 ${cl ? cl.assets.length : '?'}개 · 번역 ${cl ? cl.messages.length : '?'}줄\n\n게임 저장소 파일은 다음 테스트 플레이 때 바뀌고, 기능을 끄거나 지우면 원래대로 돌아갑니다.`, '가져오기');
    if (!ok) return;
    st.busy = '가져오는 중…'; refresh();
    try {
      const r = await pdm.featureImport({ source: cache.source, target: cache.target, ids: st.picked, project: project(), label: st.label || '' });
      toast(`가져옴: ${r.label}`); cache.list = null; st.picked = []; st.label = ''; cache.closure = null; await load(st);
    } catch (e) { toast(e.message, 'bad'); }
    st.busy = ''; refresh();
  }

  // ------------------------------------------------------------ 화면
  function render(key, ctx) {
    cur = ctx; const st = ctx.state = ctx.state || { kind: 'package', q: '', picked: [], more: 0 };
    const page = h('div', { class: 'page ft-page' });
    page.append(h('h1', {}, '🧩 다른 저장소 기능 가져오기', h('span', { class: 'badge ml-4', title: 'game/ 아래 원본 저장소는 읽기만 합니다' }, '원본은 읽기 전용')));
    if (!pdm.featureCatalog) { page.append(h('div', { class: 'box c-warn' }, '이 실행 환경(웹 모드)에는 저장소 비교기가 없습니다 — Electron 편집기에서 여세요.')); return page; }
    if (!st.loaded) { st.loaded = true; load(st); }
    page.append(h('p', { class: 'hint' }, '다른 Pixel Dungeon 저장소(예: ARK 의 계단 이동 · Blue Archive 의 총기)를 지금 게임 저장소와 클래스 · 함수 단위로 비교해 기능을 고르면, 그 기능이 쓰는 클래스 · 함수 · 그림 · 번역까지 함께 프로젝트에 담습니다. 테스트 플레이 · 내보내기 때 게임에 들어가고, 끄거나 지우면 원래 파일로 돌아갑니다.'));

    // 가져온 기능
    const list = cache.list || [];
    const box = h('div', { class: 'box mb-3' }, h('h3', {}, `이 프로젝트에 가져온 기능 (${list.length})`));
    if (!list.length) box.append(h('div', { class: 'ra-note' }, '아직 없음 — 아래에서 저장소를 고르고 비교하세요'));
    for (const f of list) {
      box.append(h('div', { class: 'ft-item' },
        h('label', { class: 'ft-row' }, h('input', { type: 'checkbox', checked: f.enabled, onchange: async e => { try { await pdm.featureSet(project(), f.id, { enabled: e.target.checked }); cache.list = null; load(st); } catch (er) { toast(er.message, 'bad'); } } }),
          h('b', {}, f.label), h('span', { class: 'hint ml-2' }, `${f.source && f.source.label || ''} · 클래스 ${f.classes} · 멤버 ${f.members} · 리소스 ${f.assets} · 번역 ${f.messages} · ${f.lines}줄`)),
        f.replaced.length ? h('details', { class: 'hint' }, h('summary', {}, `이 게임의 원래 코드를 바꾸는 멤버 ${f.replaced.length}개`), h('div', { class: 'mono' }, f.replaced.join(' · '))) : null,
        f.conflicts.length ? h('div', { class: 'c-warn' }, '⚠ 이름 겹침: ' + f.conflicts.map(c => c.what).join(', ')) : null,
        h('button', { class: 'btn xs ml-2', onclick: async () => { if (!(await pdm.confirm(`"${f.label}" 을(를) 프로젝트에서 지웁니다. 다음 테스트 플레이 때 게임 저장소에서도 빠집니다.`, '지우기'))) return; await pdm.featureSet(project(), f.id, { remove: true }); cache.list = null; load(st); } }, '지우기')));
    }
    page.append(box);

    // 저장소 고르기
    const repos = cache.repos || [];
    const sel = h('select', { class: 'ft-src', onchange: e => { st.source = e.target.value; } }, h('option', { value: '' }, repos.length ? '— 가져올 저장소 —' : '(game/ 아래에 다른 저장소가 없음)'), ...repos.map(r => h('option', { value: r.dir, selected: r.dir === st.source }, `${r.label} (${r.name})`)));
    page.append(h('div', { class: 'btnbar mb-3' }, h('span', {}, '가져올 저장소 '), sel, h('button', { class: 'btn pri sm', disabled: !!st.busy, onclick: () => compare(st) }, '비교'), h('span', { class: 'hint ml-2 mono' }, '→ 지금 게임: ' + (st.target || '(연결 안 됨)'))));
    if (st.busy) page.append(h('div', { class: 'box' }, '⏳ ' + st.busy));
    const cat = cache.cat;
    if (!cat) return page;

    // 기능 목록
    page.append(h('div', { class: 'ra-note mb-2' }, `${cat.source.label} → ${cat.target.label}: 새 패키지 ${cat.summary.packages} · 새 클래스 ${cat.summary.classes} · 바뀐 · 새 멤버 ${cat.summary.members}` + (cat.source.gamePkg !== cat.target.gamePkg ? ` (패키지 이름 ${cat.source.gamePkg} → ${cat.target.gamePkg} 로 바꿔 넣음)` : '')));
    const search = h('input', { type: 'search', class: 'ft-search', placeholder: '이름으로 찾기 (예: gun · Hero.handle)', value: st.q });
    let tm = 0; search.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => { st.q = search.value; st.more = 0; refresh(); setTimeout(() => { const s2 = document.querySelector('.ft-search'); if (s2) { s2.focus(); s2.setSelectionRange(s2.value.length, s2.value.length); } }, 0); }, 250); });
    page.append(h('div', { class: 'rx-tabs' }, ...Object.entries(KIND).map(([k, [l]]) => h('button', { class: 'btn sm' + (st.kind === k ? ' pri' : ''), onclick: () => { st.kind = k; st.more = 0; refresh(); } }, `${l} (${cat.features.filter(f => f.kind === k).length})`)), search));
    const q = st.q.trim().toLowerCase();
    const rows = cat.features.filter(f => f.kind === st.kind && (!q || (f.label + ' ' + f.id).toLowerCase().includes(q)));
    const left = h('div', { class: 'rx-left ft-list' }), right = h('div', { class: 'rx-right' });
    for (const f of rows.slice(0, MAX + st.more)) {
      const on = st.picked.includes(f.id);
      left.append(h('label', { class: 'ft-row' + (on ? ' sel' : '') }, h('input', { type: 'checkbox', checked: on, onchange: e => { st.picked = e.target.checked ? [...st.picked, f.id] : st.picked.filter(x => x !== f.id); preview(st); } }),
        h('span', { class: 'badge ' + KIND[f.kind][1] }, KIND[f.kind][0]), h('span', { class: 'ml-2' }, f.label), h('span', { class: 'hint ml-2' }, f.size + '줄')));
    }
    if (rows.length > MAX + st.more) left.append(h('button', { class: 'btn xs mt-2', onclick: () => { st.more += MAX; refresh(); } }, `더 보기 (${rows.length - MAX - st.more}개 남음)`));
    if (!rows.length) left.append(h('div', { class: 'hint' }, '없음'));

    // 필요한 것 · 가져오기
    const cl = cache.closure;
    if (!st.picked.length) right.append(h('div', { class: 'hint' }, '왼쪽에서 기능을 고르면 함께 들어갈 것 (쓰는 클래스 · 함수 · 그림 · 번역)과 이 게임에서 바뀌는 코드를 보여 줍니다.'));
    else if (cl) {
      const changed = cl.members.filter(m => m.change === 'changed'), added = cl.members.filter(m => m.change === 'added');
      right.append(h('h3', {}, `고른 기능 ${st.picked.length}개 — 함께 들어갈 것`),
        h('ul', {}, h('li', {}, `새 클래스 ${cl.classes.length}개`), h('li', {}, `새 멤버 ${added.length}개 (이 게임의 클래스에 더함)`),
          h('li', { class: changed.length ? 'c-warn' : '' }, `바꾸는 멤버 ${changed.length}개 (이 게임의 원래 코드를 가져온 저장소의 것으로)`), h('li', {}, `리소스 ${cl.assets.length}개 · Assets 상수 ${cl.assetConsts.length}개 · 번역 ${cl.messages.length}줄 · 합계 ${cl.lines}줄`)),
        changed.length ? h('details', { open: changed.length <= 12 }, h('summary', {}, '바뀌는 멤버'), h('div', { class: 'mono ft-mono' }, ...changed.map(m => h('div', {}, `${m.cls.replace(/^com\.shatteredpixel\.shatteredpixeldungeon\./, '')} · ${m.key}  ← ${(cl.why[m.cls + '#' + m.key] || '').replace(/^com\.shatteredpixel\.shatteredpixeldungeon\./, '')}`)))) : null,
        (cl.conflicts || []).length ? h('div', { class: 'box c-warn' }, '⚠ 이름 겹침 — 넣으면 컴파일되지 않거나 원래 코드가 다른 형을 가리킬 수 있음:', ...cl.conflicts.map(c => h('div', {}, '· ' + c.why))) : null,
        cl.missing.length ? h('div', { class: 'box c-warn' }, '찾지 못함: ' + cl.missing.map(m => m.what).join(', ')) : null,
        h('details', {}, h('summary', {}, `새 클래스 · 멤버 목록 (${cl.classes.length + added.length})`), h('div', { class: 'mono ft-mono' }, ...cl.classes.map(c => h('div', {}, '+ ' + c.replace(/^com\.shatteredpixel\.shatteredpixeldungeon\./, ''))), ...added.map(m => h('div', {}, '+ ' + m.cls.replace(/^com\.shatteredpixel\.shatteredpixeldungeon\./, '') + ' · ' + m.key)))),
        h('div', { class: 'hint mt-2' }, '컴파일은 테스트 플레이 때 확인됩니다 (게임 저장소 빌드). 그림 시트를 함께 쓰는 아이템 그림은 그 저장소의 시트 위치를 그대로 쓰므로 그림이 다를 수 있습니다 — 아이템 편집기에서 바꾸세요.'),
        h('div', { class: 'btnbar mt-3' }, h('input', { type: 'text', placeholder: '이름 (비우면 자동)', value: st.label || '', oninput: e => { st.label = e.target.value; } }),
          h('button', { class: 'btn pri', disabled: !!st.busy || !project(), onclick: () => doImport(st) }, '프로젝트에 가져오기')));
    }
    page.append(h('div', { class: 'rx-layout' }, left, right));
    return page;
  }

  PDM.registerEditor({ id: K, icon: '🧩', title: () => '기능 가져오기', match: k => k === K, needsResource: false, watch: () => false, render });
  PDM.featureImport = { reset: () => { cache = { source: '', target: '', cat: null, list: null, repos: null, closure: null, closureKey: '' }; } };
})();
