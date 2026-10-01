// ================================================================
//  플러그인 관리 — 켜기/끄기, 순서, 제공 기능 보기
//  (GameMaker .gmplugin 매니페스트 + RPG Maker 플러그인 명령 방식)
// ================================================================
PDM.registerEditor({
  id: 'plugins', icon: '🧩', title: () => '플러그인',
  match: k => k === 'plugins',
  watch: ck => ck === 'project',
  render(key, ctx) {
    const { h } = PDM;
    const store = PDM.store;
    const page = h('div', { class: 'page' }, h('h1', {}, '플러그인'),
      h('p', { class: 'lead' }, '플러그인은 에디터에 편집기·이벤트 명령·메뉴를 더하고, 게임 쪽에는 런타임 jar 로 기능을 더합니다. 켜고 끈 뒤에는 프로젝트를 다시 열어야 적용됩니다.'));
    const body = h('div', {}, h('div', { class: 'hint' }, '플러그인 폴더를 읽는 중…'));
    page.append(body);
    PDM.plugins.discover().then(list => {
      const enabled = (store.get('project').plugins || []);
      body.innerHTML = '';
      if (!list.length) body.append(h('div', { class: 'empty' }, '플러그인이 없습니다. 프로젝트 폴더의 plugins/<이름>/plugin.json 을 만들어 보세요.'));
      list.sort((a, b) => { const ia = enabled.indexOf(a.id), ib = enabled.indexOf(b.id); return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib); });
      list.forEach(m => {
        const on = enabled.includes(m.id), idx = enabled.indexOf(m.id);
        const loaded = PDM.registry.loadedPlugins.some(x => x.id === m.id);
        const c = m.contributes || {};
        body.append(h('div', { class: 'sec' }, h('div', { class: 'sec-body', style: { paddingTop: '12px' } },
          h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } },
            h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: on, onchange: e => store.edit('project', '플러그인 ' + (e.target.checked ? '켜기' : '끄기'), r => {
              r.plugins = r.plugins || []; if (e.target.checked) { if (!r.plugins.includes(m.id)) r.plugins.push(m.id); } else r.plugins = r.plugins.filter(x => x !== m.id);
            }) }), h('b', {}, m.name || m.id)),
            h('span', { class: 'badge' }, m.version || ''), h('span', { class: 'badge' }, m.__source),
            loaded ? h('span', { class: 'badge good' }, '불러옴') : on ? h('span', { class: 'badge gold' }, '다시 열면 적용') : null,
            h('span', { class: 'grow' }),
            on ? h('button', { class: 'ib', disabled: idx <= 0, title: '먼저 불러오기', onclick: () => store.edit('project', '플러그인 순서', r => { const a = r.plugins; [a[idx - 1], a[idx]] = [a[idx], a[idx - 1]]; }) }, '↑') : null),
          h('p', { class: 'hint' }, m.description || ''),
          h('div', { class: 'kv' },
            h('b', {}, 'id'), h('span', { class: 'mono' }, m.id),
            m.author ? [h('b', {}, '만든 사람'), h('span', {}, m.author)] : null,
            (m.dependencies || []).length ? [h('b', {}, '필요'), h('span', {}, m.dependencies.map(d => d.id || d).join(', '))] : null,
            (c.eventCommands || []).length ? [h('b', {}, '이벤트 명령'), h('span', {}, c.eventCommands.map(x => x.name).join(', '))] : null,
            (c.resourceTypes || []).length ? [h('b', {}, '리소스'), h('span', {}, c.resourceTypes.map(x => x.name).join(', '))] : null,
            m.runtime ? [h('b', {}, '게임 쪽'), h('span', { class: 'mono' }, `${m.runtime.jar || ''} ${m.runtime.entry || ''}`)] : null,
            h('b', {}, '위치'), h('span', { class: 'mono hint' }, m.__dir)))));
      });
      body.append(h('div', { style: { marginTop: '10px' } },
        h('button', { class: 'btn', onclick: async () => { await PDM.app.saveAll(); PDM.app.loadProject(store.root); } }, '저장하고 프로젝트 다시 열기'),
        h('button', { class: 'btn', style: { marginLeft: '6px' }, onclick: () => PDM.ui.modal('플러그인 만들기', h('pre', { class: 'mono', style: { whiteSpace: 'pre-wrap' } },
`plugins/my-plugin/plugin.json
{
  "id": "my-plugin", "name": "내 플러그인", "version": "0.1.0",
  "pdmaker": ">=0.1",
  "editor": { "main": "editor.js" },
  "runtime": { "jar": "runtime/my-plugin.jar", "entry": "com.example.MyPlugin" },
  "contributes": {
    "eventCommands": [ { "id": "my.hello", "name": "인사하기",
       "params": [ { "key": "who", "type": "char", "name": "누구" } ] } ]
  }
}

plugins/my-plugin/editor.js   (api 가 주어짐)
api.registerMenu('플러그인', '안녕', () => api.log('안녕!'));
api.registerEditor({ id: 'my', match: k => k === 'my', title: () => '내 편집기',
  tree: () => [{ id: 'my', label: '내 편집기', icon: '★', open: 'my', order: 70 }],
  render: () => api.h('div', { class: 'page' }, '여기에 화면') });`), [['닫기', null]]) }, '플러그인 만드는 법')));
    });
    return page;
  }
});
