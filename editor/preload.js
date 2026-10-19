// ================================================================
//  preload — 화면(renderer)에 window.pdmNative 로 파일/실행 기능을 열어줍니다.
//  (renderer/js/bridge.js 가 이걸 감싸서 window.pdm 을 만듭니다)
// ================================================================
const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');

const call = (ch, ...a) => ipcRenderer.invoke(ch, ...a).then(r => { if (!r.ok) throw new Error(r.error); return r.value; });

contextBridge.exposeInMainWorld('pdmNative', {
  isElectron: true,
  sep: path.sep,
  join: (...p) => path.join(...p),
  resolve: (...p) => path.resolve(...p),
  relative: (a, b) => path.relative(a, b),
  dirname: p => path.dirname(p),
  basename: (p, ext) => path.basename(p, ext),
  readText: p => call('fs:readText', p),
  writeText: (p, t) => call('fs:writeText', p, t),
  exists: p => call('fs:exists', p),
  list: d => call('fs:list', d),
  walk: d => call('fs:walk', d),
  mkdir: p => call('fs:mkdir', p),
  remove: p => call('fs:remove', p),
  copy: (a, b) => call('fs:copy', a, b),
  readDataURL: p => call('fs:readDataURL', p),
  writeDataURL: (p, d) => call('fs:writeDataURL', p, d),
  openFolder: t => call('dlg:openFolder', t),
  openFile: (t, e) => call('dlg:openFile', t, e),
  confirm: (m, b) => call('dlg:confirm', m, b),
  paths: () => call('app:paths'),
  openExternal: p => call('app:openExternal', p),
  showInFolder: p => call('app:showInFolder', p),
  closeApp: () => call('app:close'),
  updateCheck: () => call('update:check'),
  updateApply: opts => call('update:apply', opts || {}),
  updateRestart: () => call('update:restart'),
  runGame: opts => call('game:run', opts),
  stopGame: () => call('game:stop'),
  runtimeInstall: (repo, project) => call('runtime:install', { repo, project }),
  runtimeUninstall: repo => call('runtime:uninstall', repo),
  runtimeStatus: repo => call('runtime:status', repo),
  repoBundle: from => call('repo:bundle', { from }),
  // 게임 저장소 분석 (9차 — 읽기 전용 · 결과는 캐시)
  analyzeRepo: (dir, opts) => call('repo:analyze', Object.assign({ dir }, opts || {})),
  // 테마 (시스템 색)
  themeGet: () => call('theme:get'),
  themeSet: mode => call('theme:set', mode),
  // 프로젝트 · 게임 내보내기
  saveFile: (t, def, exts) => call('dlg:saveFile', t, def, exts),
  projectCopyTo: (from, to) => call('project:copyTo', { from, to }),
  projectExport: (dir, out) => call('project:export', { dir, out }),
  projectImport: (file, to) => call('project:import', { file, to }),
  exportGame: opts => call('game:export', opts),
  cleanBuild: repo => call('game:clean', { repo }),
  on: (ch, fn) => {
    const allowed = ['game:log', 'game:exit', 'app:before-close', 'theme:changed', 'export:done'];
    if (allowed.includes(ch)) ipcRenderer.on(ch, (_e, ...a) => fn(...a));
  }
});
