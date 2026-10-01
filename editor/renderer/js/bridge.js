// ================================================================
//  bridge — 파일/실행 기능의 단일 창구 (window.pdm)
//  · Electron 으로 실행하면 preload.js 의 pdmNative 를 그대로 사용
//  · 브라우저로 열면 "웹 모드": 읽기는 http(fetch), 쓰기는 메모리 + 브라우저 저장소
//    (개발·확인용. 실제 작업은 Electron 으로 하세요)
// ================================================================
(function () {
  if (window.pdmNative) { window.pdm = window.pdmNative; return; }

  const OVERLAY_KEY = 'pdmaker_web_overlay_v1';
  let overlay = {};
  try { overlay = JSON.parse(localStorage.getItem(OVERLAY_KEY) || '{}'); } catch (_) { overlay = {}; }
  const persist = () => { try { localStorage.setItem(OVERLAY_KEY, JSON.stringify(overlay)); } catch (_) { /* 저장 불가 환경 */ } };
  const norm = p => {
    const abs = p.startsWith('/');
    const out = [];
    p.split('/').forEach(s => { if (!s || s === '.') return; if (s === '..') out.pop(); else out.push(s); });
    return (abs ? '/' : '') + out.join('/');
  };
  const join = (...parts) => norm(parts.filter(Boolean).join('/'));
  const url = p => encodeURI(p);

  window.pdm = {
    isElectron: false,
    sep: '/',
    join, resolve: (...p) => norm(p.reduce((a, b) => b.startsWith('/') ? b : a + '/' + b, '')),
    relative: (a, b) => {
      const A = norm(a).split('/').filter(Boolean), B = norm(b).split('/').filter(Boolean);
      let i = 0; while (i < A.length && i < B.length && A[i] === B[i]) i++;
      return [...A.slice(i).map(() => '..'), ...B.slice(i)].join('/') || '.';
    },
    dirname: p => norm(p).split('/').slice(0, -1).join('/') || '/',
    basename: (p, ext) => { let b = norm(p).split('/').pop(); if (ext && b.endsWith(ext)) b = b.slice(0, -ext.length); return b; },
    async readText(p) {
      p = norm(p);
      if (p in overlay) { if (overlay[p] === null) throw new Error('없음: ' + p); return overlay[p]; }
      const r = await fetch(url(p), { cache: 'no-store' });
      if (!r.ok) throw new Error('읽기 실패: ' + p);
      return r.text();
    },
    async writeText(p, t) { overlay[norm(p)] = t; persist(); return true; },
    async exists(p) {
      p = norm(p);
      if (p in overlay) return overlay[p] !== null;
      try { const r = await fetch(url(p), { method: 'HEAD', cache: 'no-store' }); return r.ok; } catch (_) { return false; }
    },
    /** python http.server 등의 폴더 목록 HTML 을 읽어서 목록을 만듭니다 */
    async list(dir) {
      dir = norm(dir);
      const out = new Map();
      try {
        const r = await fetch(url(dir + '/'), { cache: 'no-store' });
        if (r.ok) {
          const html = await r.text();
          const re = /href="([^"?#]+)"/g; let m;
          while ((m = re.exec(html))) {
            const name = decodeURIComponent(m[1]);
            if (name.startsWith('/') || name.startsWith('..') || name.includes('://')) continue;
            const isDir = name.endsWith('/');
            out.set(name.replace(/\/$/, ''), { name: name.replace(/\/$/, ''), dir: isDir });
          }
        }
      } catch (_) { /* 목록 불가 */ }
      Object.keys(overlay).forEach(k => {
        if (k.startsWith(dir + '/')) {
          const rest = k.slice(dir.length + 1), name = rest.split('/')[0];
          if (overlay[k] === null) { if (!rest.includes('/')) out.delete(name); }
          else out.set(name, { name, dir: rest.includes('/') });
        }
      });
      return [...out.values()];
    },
    async mkdir() { return true; },
    async remove(p) { overlay[norm(p)] = null; persist(); return true; },
    async copy(a, b) { overlay[norm(b)] = await this.readDataURL(a); persist(); return true; },
    async readDataURL(p) {
      p = norm(p);
      if (overlay[p] && overlay[p].startsWith('data:')) return overlay[p];
      const r = await fetch(url(p));
      if (!r.ok) throw new Error('이미지 없음: ' + p);
      const b = await r.blob();
      return new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); });
    },
    async writeDataURL(p, d) { overlay[norm(p)] = d; persist(); return true; },
    async openFolder() { const p = prompt('폴더 경로 (웹 모드: 서버 기준 경로)', '/sample-project'); return p ? norm(p) : null; },
    async openFile(t) { const p = prompt((t || '파일') + ' 경로 (웹 모드)', ''); return p ? norm(p) : null; },
    async confirm(m, buttons) { return window.confirm(m) ? 0 : (buttons ? buttons.length - 1 : 1); },
    async paths() {
      // 웹 모드: editor/renderer/index.html 기준으로 pd-maker 폴더를 계산
      const here = norm(location.pathname).split('/').slice(0, -3).join('/') || '';
      return { appDir: here + '/editor', resources: here, sample: here + '/sample-project', builtinPlugins: here + '/editor/builtin-plugins', home: '/', userData: '/' };
    },
    async openExternal(p) { window.open(p, '_blank'); return true; },
    async closeApp() { return true; },
    async runGame() { throw new Error('웹 모드에서는 테스트 플레이를 할 수 없습니다. Electron(PDMaker.exe)으로 실행하세요.'); },
    async stopGame() { return true; },
    async runtimeInstall() { throw new Error('웹 모드에서는 설치할 수 없습니다'); },
    async runtimeUninstall() { throw new Error('웹 모드에서는 제거할 수 없습니다'); },
    async runtimeStatus() { return { pkg: false, hooks: 0, total: 8, web: true }; },
    on() { /* 웹 모드에는 메인 프로세스 이벤트가 없음 */ },
    async saveFile() { throw new Error('웹 모드에서는 쓸 수 없습니다'); },
    async projectCopyTo() { throw new Error('웹 모드에서는 쓸 수 없습니다'); },
    async projectExport() { throw new Error('웹 모드에서는 쓸 수 없습니다'); },
    async projectImport() { throw new Error('웹 모드에서는 쓸 수 없습니다'); },
    async exportGame() { throw new Error('웹 모드에서는 게임 파일을 만들 수 없습니다. Electron(PDMaker.exe)으로 실행하세요.'); },
    async cleanBuild() { throw new Error('웹 모드에서는 쓸 수 없습니다'); },
    clearWebOverlay() { overlay = {}; persist(); }
  };
})();
