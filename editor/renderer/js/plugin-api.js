// ================================================================
//  편집기 등록부 + 플러그인 API
//
//  편집기(내장·플러그인 공통) 정의:
//   PDM.registerEditor({
//     id: 'floor',
//     match: tabKey => tabKey.startsWith('floor:'),   // 이 탭을 내가 여는가
//     title: tabKey => '3층', icon: '▦',
//     render: (tabKey, ctx) => HTMLElement,            // ctx.refresh() 로 다시 그리기
//     watch: (changedKey, tabKey) => bool,             // 이 리소스가 바뀌면 다시 그림 (기본: 같은 키)
//     tree: () => [트리 노드...]                         // 리소스 트리에 보일 항목 (선택)
//   })
//
//  플러그인(plugins/<id>/plugin.json + editor.js):
//   editor.js 는 function(api) { ... } 본문으로 실행됩니다. api 는 아래 makeApi() 참고.
// ================================================================
PDM.registry = { editors: [], menus: [], resourceTypes: [], loadedPlugins: [] };
PDM.registerEditor = def => { PDM.registry.editors = PDM.registry.editors.filter(e => e.id !== def.id); PDM.registry.editors.push(def); };
PDM.editorFor = tabKey => PDM.registry.editors.find(e => e.match(tabKey));

PDM.plugins = (function () {
  async function readManifest(dir) {
    try { const m = JSON.parse(await pdm.readText(pdm.join(dir, 'plugin.json'))); m.__dir = dir; return m; }
    catch (_) { return null; }
  }
  /** 프로젝트 plugins 폴더 + 에디터 내장 플러그인 폴더에서 목록 만들기 */
  async function discover() {
    const out = [];
    const dirs = [];
    if (PDM.store.root) dirs.push({ base: pdm.join(PDM.store.root, 'plugins'), source: '프로젝트' });
    try { const p = await pdm.paths(); dirs.push({ base: p.builtinPlugins, source: '내장' }); } catch (_) { /* 없음 */ }
    for (const d of dirs) {
      let list = [];
      try { list = await pdm.list(d.base); } catch (_) { list = []; }
      for (const f of list) {
        if (!f.dir) continue;
        const m = await readManifest(pdm.join(d.base, f.name));
        if (m && !out.some(x => x.id === m.id)) { m.__source = d.source; out.push(m); }
      }
    }
    return out;
  }

  function makeApi(manifest) {
    const tag = `[${manifest.id}]`;
    return {
      manifest,
      version: '0.1.0',
      h: PDM.h, ui: PDM.ui, store: PDM.store, T: PDM.T, Cond: PDM.Cond, assets: PDM.assets,
      log: (m, k) => PDM.log(`${tag} ${m}`, k),
      registerEditor: def => PDM.registerEditor(Object.assign({ plugin: manifest.id }, def)),
      /** 이벤트 명령 추가: def = { g:'확장', name, params:[...], sum: c => '...' } */
      registerEventCommand: (id, def) => { PDM.COMMANDS[id] = Object.assign({ g: '확장', plugin: manifest.id }, def); },
      registerMenu: (menu, label, run) => PDM.registry.menus.push({ menu, label, run, plugin: manifest.id }),
      registerResourceType: def => PDM.registry.resourceTypes.push(Object.assign({ plugin: manifest.id }, def)),
      onProjectLoad: fn => PDM.store.on('load', fn),
      /** 플러그인 전용 데이터: 프로젝트/<folder>/<name>.json */
      async readData(folder, name) { try { return JSON.parse(await pdm.readText(pdm.join(PDM.store.root, folder, name + '.json'))); } catch (_) { return null; } },
      async writeData(folder, name, obj) { return pdm.writeText(pdm.join(PDM.store.root, folder, name + '.json'), JSON.stringify(obj, null, 2)); },
      openTab: key => PDM.tabs.open(key)
    };
  }

  async function loadEnabled() {
    PDM.registry.loadedPlugins = [];
    const enabled = ((PDM.store.get('project') || {}).plugins) || [];
    const all = await discover();
    for (const id of enabled) {
      const m = all.find(x => x.id === id);
      if (!m) { PDM.log(`플러그인을 찾지 못했습니다: ${id}`, 'warn'); continue; }
      const missing = (m.dependencies || []).filter(d => !enabled.includes(d.id || d));
      if (missing.length) { PDM.log(`플러그인 ${id}: 필요한 플러그인이 꺼져 있음 → ${missing.join(', ')}`, 'warn'); continue; }
      if (m.editor && m.editor.main) {
        try {
          const code = await pdm.readText(pdm.join(m.__dir, m.editor.main));
          // eslint-disable-next-line no-new-func
          new Function('api', code)(makeApi(m));
          PDM.log(`플러그인 불러옴: ${m.name || id} ${m.version || ''}`, 'ok');
        } catch (e) { PDM.log(`플러그인 ${id} 오류: ${e.message}`, 'err'); continue; }
      }
      (m.contributes && m.contributes.eventCommands || []).forEach(c => {
        if (PDM.COMMANDS[c.id]) return;   // editor.js 에서 이미 등록했으면 그대로
        // plugin.json 에서는 { key, type, name } 로 써도 되고 { k, t, label } 로 써도 됨
        const params = (c.params || []).map(p => ({ k: p.k || p.key, t: p.t || p.type || 'text', label: p.label || p.name || p.key, options: p.options }));
        PDM.COMMANDS[c.id] = { g: '확장', name: c.name, params, plugin: id,
          sum: x => `${c.name}: ${params.map(p => `${p.label}=${x[p.k] ?? ''}`).join(', ')}` };
      });
      PDM.registry.loadedPlugins.push(m);
    }
  }
  return { discover, loadEnabled };
})();
