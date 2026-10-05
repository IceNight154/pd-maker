// ================================================================
//  PDMaker — Electron 메인 프로세스
//  파일 입출력 · 폴더 선택 · 테스트 플레이(gradle) · 플러그인 폴더 검색
//  화면(renderer)은 window.pdm (preload.js) 로만 이 기능들을 부릅니다.
// ================================================================
const { app, BrowserWindow, ipcMain, dialog, shell, Menu, nativeTheme, systemPreferences } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const IS_WIN = process.platform === 'win32';
let win = null;
let gameProc = null;

// ---------------- 테마 (시스템 색) ----------------
// 설정은 userData/pdmaker-settings.json 의 theme: 'system' | 'light' | 'dark'. 화면 쪽은 renderer/js/theme.js
function settingsFile() { return path.join(app.getPath('userData'), 'pdmaker-settings.json'); }
function readSettings() { try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch (_) { return {}; } }
function writeSettings(o) { try { fs.mkdirSync(path.dirname(settingsFile()), { recursive: true }); fs.writeFileSync(settingsFile(), JSON.stringify(o, null, 2)); } catch (_) { /* 무시 */ } }
const bgFor = dark => dark ? '#17151d' : '#f3f2f7';
/** OS 강조색 (Windows·macOS) → '#rrggbb', 없으면 null */
function accentColor() {
  try { const c = systemPreferences.getAccentColor && systemPreferences.getAccentColor(); return c ? '#' + String(c).slice(0, 6) : null; } catch (_) { return null; }
}
function themeInfo() { return { dark: nativeTheme.shouldUseDarkColors, source: nativeTheme.themeSource, accent: accentColor(), highContrast: !!nativeTheme.shouldUseHighContrastColors }; }
function sendTheme() { if (win && !win.isDestroyed()) { win.setBackgroundColor(bgFor(nativeTheme.shouldUseDarkColors)); win.webContents.send('theme:changed', themeInfo()); } }
nativeTheme.on('updated', sendTheme);
try { systemPreferences.on('accent-color-changed', sendTheme); } catch (_) { /* 이 OS 에는 없음 */ }
ipcMain.handle('theme:get', (_e) => ({ ok: true, value: themeInfo() }));
ipcMain.handle('theme:set', (_e, mode) => {
  const m = ['system', 'light', 'dark'].includes(mode) ? mode : 'system';
  nativeTheme.themeSource = m;                       // 제목 표시줄·대화상자·스크롤바도 같이 바뀜
  const st = readSettings(); st.theme = m; writeSettings(st);
  sendTheme();
  return { ok: true, value: themeInfo() };
});

function createWindow() {
  nativeTheme.themeSource = ['system', 'light', 'dark'].includes(readSettings().theme) ? readSettings().theme : 'system';
  win = new BrowserWindow({
    width: 1500, height: 920, minWidth: 1100, minHeight: 700,
    backgroundColor: bgFor(nativeTheme.shouldUseDarkColors),
    title: 'PDMaker — 픽셀 던전 메이커',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  Menu.setApplicationMenu(null); // 메뉴는 화면(HTML) 안에서 그립니다
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('close', e => {
    // 저장 안 된 변경이 있으면 화면 쪽에 물어봄
    if (win && !win.__forceClose) {
      e.preventDefault();
      win.webContents.send('app:before-close');
    }
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { stopGame(); app.quit(); });

// ---------------- 파일 ----------------
const ok = v => ({ ok: true, value: v });
const fail = e => ({ ok: false, error: String(e && e.message || e) });
function wrap(fn) { return async (_e, ...a) => { try { return ok(await fn(...a)); } catch (e) { return fail(e); } }; }

ipcMain.handle('fs:readText', wrap(p => fs.readFileSync(p, 'utf8')));
ipcMain.handle('fs:writeText', wrap((p, text) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  // 저장 중 꺼져도 파일이 깨지지 않도록 임시 파일에 쓰고 바꿔치기
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, p);
  return true;
}));
ipcMain.handle('fs:exists', wrap(p => fs.existsSync(p)));
ipcMain.handle('fs:list', wrap(dir => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).map(d => ({ name: d.name, dir: d.isDirectory() }));
}));
// 폴더 아래의 모든 파일 (상대 경로, / 구분) — 게임 저장소 훑기 (renderer/js/gamescan.js)
ipcMain.handle('fs:walk', wrap(dir => {
  const out = [];
  const rec = (d, rel) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.isDirectory()) rec(path.join(d, e.name), rel + e.name + '/'); else out.push(rel + e.name); } };
  if (fs.existsSync(dir)) rec(dir, '');
  return out;
}));
ipcMain.handle('fs:mkdir', wrap(p => { fs.mkdirSync(p, { recursive: true }); return true; }));
ipcMain.handle('fs:remove', wrap(p => { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true }); return true; }));
ipcMain.handle('fs:readDataURL', wrap(p => {
  const ext = path.extname(p).toLowerCase().slice(1);
  const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', ogg: 'audio/ogg', mp3: 'audio/mpeg', wav: 'audio/wav' }[ext] || 'application/octet-stream';
  return `data:${mime};base64,` + fs.readFileSync(p).toString('base64');
}));
ipcMain.handle('fs:writeDataURL', wrap((p, dataURL) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, Buffer.from(dataURL.split(',')[1], 'base64'));
  return true;
}));
ipcMain.handle('fs:copy', wrap((from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); return true; }));

// ---------------- 대화상자 ----------------
ipcMain.handle('dlg:openFolder', wrap(async (title) => {
  const r = await dialog.showOpenDialog(win, { title: title || '폴더 선택', properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
}));
ipcMain.handle('dlg:openFile', wrap(async (title, exts) => {
  const r = await dialog.showOpenDialog(win, { title: title || '파일 선택', properties: ['openFile'],
    filters: exts ? [{ name: exts.join(', '), extensions: exts }] : [] });
  return r.canceled ? null : r.filePaths[0];
}));
ipcMain.handle('dlg:confirm', wrap(async (message, buttons) => {
  const r = await dialog.showMessageBox(win, { type: 'question', message, buttons: buttons || ['확인', '취소'], defaultId: 0, cancelId: (buttons || []).length - 1 });
  return r.response;
}));
// ---------------- PDMaker 폴더 안의 게임 저장소 (다른 PC 에서도 그대로 쓰도록) ----------------
//  기준: pd-maker/game/shattered-pixel-dungeon-master  (없으면 예전 기준 game/shattered-pixel-dungeon)
//  exe 로 만든 경우: exe 옆 game/ 또는 resources/game/
const REPO_NAME = 'shattered-pixel-dungeon-master';
const REPO_NAMES = [REPO_NAME, 'shattered-pixel-dungeon'];
function bundledRepoDirs() {
  const c = [];
  for (const n of REPO_NAMES) {
    if (app.isPackaged) c.push(path.join(path.dirname(process.execPath), 'game', n), path.join(process.resourcesPath, 'game', n));
    c.push(path.join(__dirname, '..', 'game', n));
  }
  return c;
}
/** 바깥 저장소를 옮겨 넣을 기본 자리 */
const defaultRepoDir = () => path.join(__dirname, '..', 'game', REPO_NAME);
const isRepoDir = d => !!d && fs.existsSync(path.join(d, 'gradlew.bat')) || (!!d && fs.existsSync(path.join(d, 'gradlew')));
function bundledRepo() { return bundledRepoDirs().find(isRepoDir) || null; }
/** 바깥에 있는 게임 저장소를 PDMaker 폴더 안(game/)으로 옮김. 같은 드라이브면 통째로 옮기고, 안 되면 복사(빌드 결과·.gradle 제외) */
ipcMain.handle('repo:bundle', wrap(({ from }) => {
  if (!isRepoDir(from)) throw new Error('게임 저장소가 아닙니다 (gradlew 없음): ' + from);
  const dest = path.join(__dirname, '..', 'game', REPO_NAME);
  if (path.resolve(from) === path.resolve(dest)) return { dest, moved: false };
  if (fs.existsSync(dest)) throw new Error('이미 있습니다: ' + dest);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try { fs.renameSync(from, dest); log(`> 게임 저장소를 옮겼습니다: ${from} → ${dest}`); return { dest, moved: true }; }
  catch (e) {
    log(`> 통째로 옮기지 못해 복사합니다 (${e.code || e.message}) — 원래 폴더는 그대로 남습니다`);
    const skip = /(^|[\\/])(\.gradle|build|\.idea|out)$/;
    fs.cpSync(from, dest, { recursive: true, filter: src => !skip.test(path.relative(from, src)) });
    return { dest, moved: false };
  }
}));

ipcMain.handle('app:paths', wrap(() => ({
  gameRepo: bundledRepo(),
  gameRepoDefault: defaultRepoDir(),
  appDir: __dirname,
  resources: app.isPackaged ? process.resourcesPath : path.join(__dirname, '..'),
  sample: app.isPackaged ? path.join(process.resourcesPath, 'sample-project') : path.join(__dirname, '..', 'sample-project'),
  builtinPlugins: path.join(__dirname, 'builtin-plugins'),
  home: app.getPath('home'),
  userData: app.getPath('userData')
})));
ipcMain.handle('app:openExternal', wrap(p => /^https?:\/\//i.test(String(p)) ? shell.openExternal(p) : shell.openPath(p)));
// 파일 위치 열기: 탐색기에서 그 파일을 선택한 채로 폴더를 엶 (파일이 없으면 폴더만)
ipcMain.handle('app:showInFolder', wrap(p => { if (fs.existsSync(p)) shell.showItemInFolder(path.normalize(p)); else shell.openPath(path.dirname(p)); return true; }));
// ---- PDMaker 업데이트 (GitHub main 과 비교 · 받아 오기) — updater.js
const updater = require('./updater');
const updateRoot = () => path.join(__dirname, '..');
ipcMain.handle('update:check', wrap(() => updater.check(updateRoot())));
ipcMain.handle('update:apply', wrap(async ({ zip } = {}) => {
  const log = m => { try { win.webContents.send('game:log', String(m)); } catch (_) { /* 창 닫힘 */ } };
  try { return await (zip ? updater.applyZip(updateRoot(), log) : updater.apply(updateRoot(), log)); }
  catch (e) { if (e.gitFailed) return { ok: false, gitFailed: true, error: e.message }; throw e; }
}));
ipcMain.handle('update:restart', wrap(() => { win.__forceClose = true; app.relaunch(); app.exit(0); return true; }));
ipcMain.handle('app:close', wrap(() => { win.__forceClose = true; win.close(); return true; }));

// ---------------- 테스트 플레이 ----------------
// 게임 저장소의 build.gradle 은 건드리지 않고, init 스크립트로 실행 작업을 하나 추가합니다.
// (기존 pixel-dungeon-maker 의 MakerServer 방식을 그대로 가져옴)
function findJavaHome() {
  const c = [];
  if (IS_WIN) {
    const pf = process.env.ProgramFiles || 'C:\\Program Files';
    const la = process.env.LOCALAPPDATA || '';
    c.push(path.join(pf, 'Android', 'Android Studio', 'jbr'), path.join(la, 'Programs', 'Android Studio', 'jbr'),
      path.join(pf, 'Android', 'Android Studio', 'jre'));
  } else {
    c.push('/opt/android-studio/jbr', '/usr/lib/jvm/default-java');
  }
  if (process.env.JAVA_HOME) c.push(process.env.JAVA_HOME);
  // 흔한 JDK 설치 폴더 (Temurin · Microsoft · Oracle · Zulu) + PDMaker 가 내려받은 JDK
  const scan = dir => { try { return fs.readdirSync(dir).map(f => path.join(dir, f)).sort().reverse(); } catch (_) { return []; } };
  if (IS_WIN) {
    const pf = process.env.ProgramFiles || 'C:\\Program Files';
    ['Eclipse Adoptium', 'Microsoft', 'Java', 'Zulu', 'BellSoft'].forEach(v => c.push(...scan(path.join(pf, v))));
  }
  c.push(...scan(jdkDir()));
  const ok = p => { if (!p || !fs.existsSync(path.join(p, 'bin', IS_WIN ? 'java.exe' : 'java'))) return false;
    const m = path.basename(p).match(/(?:jdk|jre)-?(\d+)/i); return !m || +m[1] >= 17; };   // 이 게임은 Java 17 이상
  return c.find(ok) || null;
}
/** PDMaker 가 Java 를 내려받아 두는 곳 */
function jdkDir() { return path.join(app.getPath('userData'), 'jdk'); }
/** Java(JDK 17+) 가 없으면 Eclipse Temurin 21 을 내려받아 풂 (처음 한 번, 약 190MB) */
async function ensureJava() {
  const have = findJavaHome();
  if (have) return have;
  if (!IS_WIN) throw new Error('Java 17 이상(JDK)이 필요합니다. 설치한 뒤 JAVA_HOME 을 지정하세요.');
  const url = 'https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse';
  const dir = jdkDir(); fs.mkdirSync(dir, { recursive: true });
  const zipFile = path.join(dir, 'jdk-download.zip');
  log('> Java(JDK) 가 없어 Eclipse Temurin 21 을 내려받습니다 (처음 한 번, 약 190MB) …');
  await download(url, zipFile);
  log('> 압축 푸는 중 …');
  await new Promise((res, rej) => { const t = spawn('tar', ['-xf', zipFile, '-C', dir]); t.on('close', c => c === 0 ? res() : rej(new Error('JDK 압축 풀기 실패 (tar 종료 코드 ' + c + ')'))); t.on('error', rej); });
  fs.rmSync(zipFile, { force: true });
  const got = findJavaHome();
  if (!got) throw new Error('JDK 를 내려받았지만 찾지 못했습니다: ' + dir);
  log('> Java 준비됨: ' + got);
  return got;
}
function download(url, to, hops = 0) {
  const https = require('https');
  return new Promise((res, rej) => {
    if (hops > 8) return rej(new Error('리다이렉트가 너무 많습니다'));
    https.get(url, { headers: { 'User-Agent': 'PDMaker' } }, r => {
      if ([301, 302, 303, 307, 308].includes(r.statusCode) && r.headers.location) { r.resume(); return download(new URL(r.headers.location, url).toString(), to, hops + 1).then(res, rej); }
      if (r.statusCode !== 200) { r.resume(); return rej(new Error('내려받기 실패: HTTP ' + r.statusCode + ' ' + url)); }
      const total = +r.headers['content-length'] || 0; let got = 0, last = 0;
      const out = fs.createWriteStream(to);
      r.on('data', b => { got += b.length; if (total && got - last > total / 10) { last = got; log(`  … ${Math.round(got / total * 100)}%`); } });
      r.pipe(out); out.on('finish', () => out.close(res)); out.on('error', rej);
    }).on('error', rej);
  });
}
function writeInitScript(userData, projectDir) {
  const f = path.join(userData, 'pdmaker-playtest.gradle');
  const proj = projectDir.replace(/\\/g, '/');
  fs.writeFileSync(f, [
    '// PDMaker 가 만든 파일. build.gradle 을 고치지 않고 테스트 실행 작업을 추가합니다.',
    'gradle.projectsEvaluated {',
    "    def d = rootProject.findProject(':desktop')",
    "    if (d == null) throw new GradleException('desktop project not found')",
    "    d.tasks.register('pdmakerPlaytest', JavaExec) {",
    "        group = 'pdmaker'",
    '        classpath = d.sourceSets.main.runtimeClasspath',
    "        mainClass.set('com.shatteredpixel.shatteredpixeldungeon.desktop.DesktopLauncher')",
    '        ignoreExitValue = true',
    "        systemProperty 'Specification-Title', 'PDMaker Playtest'",
    "        systemProperty 'Implementation-Title', d.appPackageName",
    "        systemProperty 'Specification-Version', d.appVersionName + '-PLAYTEST'",
    "        systemProperty 'Implementation-Version', d.appVersionCode",
    `        systemProperty 'pdmaker.project', '${proj}'`,
    "        jvmArgs '-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Dstderr.encoding=UTF-8', '-Dsun.stdout.encoding=UTF-8'",
    "        if (System.getProperty('os.name').toLowerCase().contains('mac')) jvmArgs '-XstartOnFirstThread'",
    '    }',
    '    // desktop:debug (게임 원래 실행 작업 — INDEV 버전) 으로 테스트할 때도 이 프로젝트를 넘겨줌',
    "    def dbg = d.tasks.findByName('debug')",
    '    if (dbg != null) {',
    `        dbg.systemProperty 'pdmaker.project', '${proj}'`,
    "        dbg.jvmArgs '-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Dstderr.encoding=UTF-8', '-Dsun.stdout.encoding=UTF-8'",
    '    }',
    '}', ''].join('\n'), 'utf8');
  return f;
}
function log(line) { if (win) win.webContents.send('game:log', line); }
function stopGame() {
  if (!gameProc) return;
  try {
    if (IS_WIN) spawn('taskkill', ['/pid', String(gameProc.pid), '/T', '/F']);
    else gameProc.kill('SIGTERM');
  } catch (_) { /* 무시 */ }
  gameProc = null;
}
/** 모듈 build.gradle 이 빠진 저장소(복사·압축 중 누락) → 옆의 원작 저장소에서 채우거나 알기 쉬운 오류. 없으면 gradle 이 "BUILD FAILED" 만 남김 */
function repairRepo(repo) {
  const mods = ['SPD-classes', 'core', 'desktop', 'services'];
  const missing = mods.filter(m => fs.existsSync(path.join(repo, m)) && !fs.existsSync(path.join(repo, m, 'build.gradle')));
  if (!missing.length) return;
  const donors = [path.join(path.dirname(repo), REPO_NAME), path.join(__dirname, '..', 'game', REPO_NAME), path.join(path.dirname(repo), 'shattered-pixel-dungeon'), path.join(__dirname, '..', 'game', 'shattered-pixel-dungeon')];
  const left = [];
  for (const m of missing) {
    const d = donors.map(x => path.join(x, m, 'build.gradle')).find(f => fs.existsSync(f));
    if (d) { fs.copyFileSync(d, path.join(repo, m, 'build.gradle')); log(`> 빠진 ${m}/build.gradle 을 원작 저장소에서 채웠습니다`); }
    else left.push(m + '/build.gradle');
  }
  if (left.length) throw new Error('게임 저장소에 빌드 파일이 없습니다: ' + left.join(', ') + ' — 원래 게임 저장소에서 복사해 넣으세요 (' + repo + ')');
}
ipcMain.handle('game:run', wrap(async ({ repo, project, task, mode }) => {
  if (gameProc) throw new Error('이미 실행 중입니다. 먼저 중지하세요.');
  if (!isRepoDir(repo) && bundledRepo()) repo = bundledRepo();
  const gradlew = path.join(repo, IS_WIN ? 'gradlew.bat' : 'gradlew');
  if (!fs.existsSync(gradlew)) throw new Error('게임 저장소(gradlew)를 찾지 못했습니다: ' + repo + ' — pd-maker/game/' + REPO_NAME + ' 에 넣거나 프로젝트 설정에서 경로를 지정하세요');
  repairRepo(repo);
  const javaHome = await ensureJava();
  // 런타임이 없거나 에디터보다 오래됐으면 먼저 설치·갱신 (예전에는 이걸 안 하면 원래 게임이 그대로 실행됐음)
  if (task !== 'compile') {
    const st = runtimeState(repo);
    if (!st.upToDate) {
      log(`> 게임 런타임 ${st.pkg ? '갱신' : '설치'} (${st.reason})`);
      installer.install(repo, runtimeSrc(), l => log('  ' + l));
    } else log('> 게임 런타임: 최신');
  }
  // 영웅·아이템에 적은 코드 → pdmaker/gen/*.java (컴파일 때도 항상 새로 만듦)
  if (project) { try { installer.generate(repo, project, l => log('  ' + l)); } catch (e) { log('! 코드 생성 실패: ' + e.message); } }
  // 게임 이름 · 패키지 이름 → build.gradle (세이브 폴더가 원작과 섞이지 않게)
  if (project) { try { installer.applyGameId(repo, project, l => log('  ' + l)); } catch (e) { log('! build.gradle 게임 이름 적용 실패: ' + e.message); } }
  const init = writeInitScript(app.getPath('userData'), project);
  const args = task === 'compile'
    ? ['core:compileJava', '--console=plain']
    : ['-I', init, mode === 'debug' ? 'desktop:debug' : 'desktop:pdmakerPlaytest', '--no-daemon', '--console=plain'];   // debug = 게임 원래 실행 작업 (버전 표시 -INDEV)
  const cmd = IS_WIN ? 'cmd.exe' : 'sh';
  const full = IS_WIN ? ['/c', 'gradlew.bat', ...args] : ['gradlew', ...args];
  const env = Object.assign({}, process.env);
  if (javaHome) env.JAVA_HOME = javaHome;
  log(`> gradlew ${args.join(' ')}   (${repo})`);
  log(`> JAVA_HOME = ${javaHome || '(시스템 기본값)'}`);
  gameProc = spawn(cmd, full, { cwd: repo, env });
  // 생성 코드(gen/*.java)의 컴파일 오류 → 어느 영웅/아이템의 어느 칸 몇째 줄인지 덧붙임
  const genDir = path.join(repo, 'core', 'src', 'main', 'java', 'com', 'shatteredpixel', 'shatteredpixeldungeon', 'pdmaker', 'gen');
  const explain = l => {
    const m = l.match(/pdmaker[\\/]gen[\\/]((?:[\w]+[\\/])*(?:H|I)_\w+\.java):(\d+)/);
    if (!m) return;
    try {
      const where = codegen.locate(fs.readFileSync(path.join(genDir, ...m[1].split(/[\\/]/)), 'utf8'), +m[2]);
      if (where) log(`  ↳ 에디터 코드 오류: ${where.what} · ${where.where} · ${where.line}번째 줄`);
    } catch (_) { /* 무시 */ }
  };
  const pipe = s => s.toString().split(/\r?\n/).forEach(l => { if (l) { log(l); explain(l); } });
  gameProc.stdout.on('data', pipe);
  gameProc.stderr.on('data', pipe);
  gameProc.on('close', code => { log(`> 끝남 (종료 코드 ${code})`); gameProc = null; if (win) win.webContents.send('game:exit', code); });
  return true;
}));
ipcMain.handle('game:stop', wrap(() => { stopGame(); return true; }));

// ---------------- 프로젝트 저장·내보내기·가져오기 (GameMaker 의 Save As · Export/Import Project) ----------------
const zip = require('./zip');
/** 프로젝트에 넣지 않는 것: 임시 파일·백업 */
const skipProj = (rel, isDir) => /(^|\/)(\.git|node_modules|\.pdmaker-tmp)$/.test(rel) || /^signing$/.test(rel) || (!isDir && /\.tmp$/.test(rel));   // signing = 안드로이드 서명 키 (게임 파일에 넣지 않음)
ipcMain.handle('project:copyTo', wrap(({ from, to }) => {
  if (!fs.existsSync(path.join(from, 'project.json'))) throw new Error('프로젝트 폴더가 아닙니다: ' + from);
  if (fs.existsSync(to) && fs.readdirSync(to).length) throw new Error('빈 폴더를 골라 주세요: ' + to);
  if (path.resolve(to).startsWith(path.resolve(from) + path.sep)) throw new Error('프로젝트 안쪽 폴더에는 저장할 수 없습니다');
  fs.cpSync(from, to, { recursive: true, filter: src => !skipProj(path.relative(from, src).replace(/\\/g, '/'), fs.statSync(src).isDirectory()) });
  return to;
}));
ipcMain.handle('dlg:saveFile', wrap(async (title, defName, exts) => {
  const r = await dialog.showSaveDialog(win, { title: title || '저장', defaultPath: defName || undefined,
    filters: exts ? [{ name: exts.join(', '), extensions: exts }] : [] });
  return r.canceled ? null : r.filePath;
}));
ipcMain.handle('project:export', wrap(({ dir, out }) => {
  if (!fs.existsSync(path.join(dir, 'project.json'))) throw new Error('프로젝트 폴더가 아닙니다: ' + dir);
  const n = zip.zipDir(dir, out, { exclude: skipProj });
  log(`> 프로젝트 내보내기: ${n}개 파일 → ${out}`);
  return { out, files: n, bytes: fs.statSync(out).size };
}));
ipcMain.handle('project:import', wrap(({ file, to }) => {
  const { list } = zip.entries(file);
  // 압축 안에 폴더 하나로 싸여 있으면 그 안을 풀기
  const names = list.map(e => e.name).filter(n => !n.endsWith('/'));
  const top = names.every(n => n.includes('/')) ? names[0].split('/')[0] + '/' : '';
  if (!names.some(n => n === top + 'project.json')) throw new Error('project.json 이 없는 파일입니다 (PDMaker 프로젝트가 아님)');
  if (fs.existsSync(to) && fs.readdirSync(to).length) throw new Error('빈 폴더를 골라 주세요: ' + to);
  const tmp = to + '.pdmaker-tmp';
  fs.rmSync(tmp, { recursive: true, force: true });
  const n = zip.unzip(file, tmp);
  fs.mkdirSync(to, { recursive: true });
  const src = top ? path.join(tmp, top.slice(0, -1)) : tmp;
  fs.cpSync(src, to, { recursive: true });
  fs.rmSync(tmp, { recursive: true, force: true });
  log(`> 프로젝트 가져오기: ${n}개 파일 → ${to}`);
  return to;
}));

// ---------------- 게임 파일 내보내기 (GameMaker 의 Create Executable) ----------------
// jar: gradlew desktop:release → <이름>.jar + project/ + 실행 파일(bat/sh)   (Java 17 이 깔린 PC 에서 실행)
// image: gradlew desktop:jpackageImage → Java 가 들어 있는 실행 파일 폴더 + project/   (처음엔 JDK 를 내려받아 오래 걸림)
function newestFile(dir, re) {
  if (!fs.existsSync(dir)) return null;
  return fs.readdirSync(dir).filter(f => re.test(f)).map(f => path.join(dir, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || null;
}
function prepareRuntime(repo, project) {
  repairRepo(repo);
  const st = runtimeState(repo);
  if (!st.upToDate) { log(`> 게임 런타임 ${st.pkg ? '갱신' : '설치'} (${st.reason})`); installer.install(repo, runtimeSrc(), l => log('  ' + l)); }
  if (project) installer.generate(repo, project, l => log('  ' + l));
  if (project) installer.applyGameId(repo, project, l => log('  ' + l));
}
async function runGradle(repo, args, onDone, extraEnv) {
  if (gameProc) throw new Error('이미 실행 중입니다. 먼저 중지하세요.');
  const gradlew = path.join(repo, IS_WIN ? 'gradlew.bat' : 'gradlew');
  if (!fs.existsSync(gradlew)) throw new Error('게임 저장소(gradlew)를 찾지 못했습니다: ' + repo);
  const javaHome = await ensureJava();
  const env = Object.assign({}, process.env, extraEnv || {}); if (javaHome) env.JAVA_HOME = javaHome;
  log(`> gradlew ${args.join(' ')}   (${repo})`);
  gameProc = spawn(IS_WIN ? 'cmd.exe' : 'sh', IS_WIN ? ['/c', 'gradlew.bat', ...args] : ['gradlew', ...args], { cwd: repo, env });
  const pipe = b => b.toString().split(/\r?\n/).forEach(l => { if (l) log(l); });
  gameProc.stdout.on('data', pipe); gameProc.stderr.on('data', pipe);
  gameProc.on('close', code => { gameProc = null; try { onDone(code); } catch (e) { log('! ' + e.message); if (win) win.webContents.send('export:done', { ok: false, error: e.message }); } });
}
const safeName = s => String(s || 'game').replace(/[\\/:*?"<>|]/g, '_').trim() || 'game';
function copyProjectInto(project, dest) {
  const to = path.join(dest, 'project');
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(project, to, { recursive: true, filter: src => !skipProj(path.relative(project, src).replace(/\\/g, '/'), fs.statSync(src).isDirectory()) });
}
// 게임 파일 내보내기 — kind:
//   jar       : desktop:release → JAR + .bat (Java 필요)
//   image     : desktop:jpackageImage → Java 가 들어 있는 실행 파일 폴더 (.exe)
//   installer : 위 폴더의 app/project 에 프로젝트를 넣고 JDK 의 jpackage 로 Windows 설치 파일(.exe 하나) — WiX 3 이 없으면 내려받음
//   apk       : android:assembleRelease (프로젝트를 assets/pdmaker-project 에 넣고, init 스크립트로 서명 · pdmaker 코드 보존)
ipcMain.handle('game:export', wrap(async ({ repo, project, outDir, kind, name, signing }) => {
  if (!fs.existsSync(path.join(project, 'project.json'))) throw new Error('프로젝트 폴더가 아닙니다');
  if (!isRepoDir(repo) && bundledRepo()) repo = bundledRepo();
  if (kind === 'installer' && !IS_WIN) throw new Error('Windows 설치 파일(.exe)은 Windows 에서만 만들 수 있습니다');
  let apk = null;
  if (kind === 'apk') apk = await prepareApk(repo, project, signing || {});   // SDK · 서명 키를 먼저 확인 (빌드 전에 실패를 알림)
  prepareRuntime(repo, project);
  const nm = safeName(name);
  const dest = path.join(outDir, nm);
  const task = kind === 'apk' ? 'android:assembleRelease' : kind === 'image' || kind === 'installer' ? 'desktop:jpackageImage' : 'desktop:release';
  const fail = msg => { log('! ' + msg); if (win) win.webContents.send('export:done', { ok: false, error: msg }); };
  const done = () => { log(`> 게임 파일 내보내기 끝: ${dest}`); if (win) win.webContents.send('export:done', { ok: true, dest }); };
  const args = [task, '--console=plain'];
  if (apk) args.push('-I', apk.init);
  const run = runGradle(repo, args, code => {
    if (apk) apk.cleanup();
    if (code !== 0) return fail(`빌드 실패 (코드 ${code}) — 출력 창을 확인하세요`);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    if (kind === 'apk') {
      const f = newestFile(path.join(repo, 'android', 'build', 'outputs', 'apk', 'release'), /\.apk$/);
      if (!f) return fail('APK 를 찾지 못했습니다 (android/build/outputs/apk/release)');
      if (/unsigned/.test(path.basename(f))) return fail('서명되지 않은 APK 가 나왔습니다 — 서명 설정을 확인하세요');
      fs.copyFileSync(f, path.join(dest, nm + '.apk'));
      fs.writeFileSync(path.join(dest, '읽어 주세요.txt'), '\ufeff' + `${nm}.apk\r\n\r\n안드로이드 기기에 복사해서 열면 설치됩니다 ("출처를 알 수 없는 앱" 허용 필요).\r\n게임 데이터(프로젝트)는 APK 안에 들어 있습니다.\r\n서명 키: ${apk.keyNote}\r\n같은 키로 서명해야 기존 설치 위에 업데이트됩니다.\r\n`);
      return done();
    }
    if (kind === 'image' || kind === 'installer') {
      const base = path.join(repo, 'desktop', 'build', 'jpackage');
      const img = fs.existsSync(base) ? fs.readdirSync(base).map(f => path.join(base, f)).find(f => fs.statSync(f).isDirectory()) : null;
      if (!img) return fail('jpackage 결과 폴더를 찾지 못했습니다: ' + base);
      if (kind === 'image') { fs.cpSync(img, dest, { recursive: true }); copyProjectInto(project, dest); return done(); }
      // 설치 파일: 실행 파일 폴더를 임시로 복사 → app/project 에 프로젝트 → jpackage --type exe
      const tmp = path.join(repo, 'desktop', 'build', 'pdmaker-installer'), app = path.join(tmp, path.basename(img));
      fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
      fs.cpSync(img, app, { recursive: true });
      copyProjectInto(project, path.join(app, 'app'));
      makeInstaller(repo, project, app, dest, nm).then(file => { fs.rmSync(tmp, { recursive: true, force: true }); log('> 설치 파일: ' + file); done(); }, e => fail('설치 파일 만들기 실패: ' + e.message));
      return;
    }
    const jar = newestFile(path.join(repo, 'desktop', 'build', 'libs'), /\.jar$/);
    if (!jar) return fail('jar 를 찾지 못했습니다 (desktop/build/libs)');
    fs.copyFileSync(jar, path.join(dest, nm + '.jar'));
    // .bat 는 ANSI 로 읽히므로 한글 이름을 적지 않고 폴더의 jar 를 찾아 실행
    fs.writeFileSync(path.join(dest, nm + '.bat'), `@echo off\r\ncd /d "%~dp0"\r\nfor %%f in (*.jar) do start "" javaw -jar "%%f"\r\n`);
    fs.writeFileSync(path.join(dest, nm + '.sh'), `#!/bin/sh\ncd "$(dirname "$0")"\nexec java -jar "${nm}.jar"\n`, { mode: 0o755 });
    fs.writeFileSync(path.join(dest, '읽어 주세요.txt'), '\ufeff' + `${nm}\r\n\r\n실행: ${nm}.bat 더블클릭 (Java 17 이상 필요)\r\nproject 폴더 = 게임 데이터 (PDMaker 로 만든 것). 지우거나 옮기지 마세요.\r\n`);
    copyProjectInto(project, dest);
    done();
  }, apk ? apk.env : null);
  try { await run; } catch (e) { if (apk) apk.cleanup(); throw e; }
  return { dest, task };
}));

// ---------------- Windows 설치 파일 (jpackage --type exe) ----------------
/** WiX 3 (jpackage 가 .exe 설치 파일을 만들 때 씀) — PATH 에 있으면 그것, 없으면 PDMaker 폴더에 내려받음 (처음 한 번, 약 40MB) */
async function ensureWix() {
  const has = d => d && fs.existsSync(path.join(d, 'candle.exe')) && fs.existsSync(path.join(d, 'light.exe'));
  const fromPath = (process.env.PATH || '').split(path.delimiter).find(has);
  if (fromPath) return fromPath;
  const pf = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const inst = (() => { try { return fs.readdirSync(pf).filter(f => /^WiX Toolset v3/i.test(f)).map(f => path.join(pf, f, 'bin')).find(has); } catch (_) { return null; } })();
  if (inst) return inst;
  const dir = path.join(app.getPath('userData'), 'wix3');
  if (has(dir)) return dir;
  fs.mkdirSync(dir, { recursive: true });
  const zip = path.join(dir, 'wix-download.zip');
  log('> WiX Toolset 3 이 없어 내려받습니다 (설치 파일을 만들 때 필요 · 처음 한 번, 약 40MB) …');
  await download('https://github.com/wixtoolset/wix3/releases/download/wix3141rtm/wix314-binaries.zip', zip);
  await new Promise((res, rej) => { const t = spawn('tar', ['-xf', zip, '-C', dir]); t.on('close', c => c === 0 ? res() : rej(new Error('WiX 압축 풀기 실패 (tar 종료 코드 ' + c + ')'))); t.on('error', rej); });
  fs.rmSync(zip, { force: true });
  if (!has(dir)) throw new Error('WiX 를 내려받았지만 candle.exe 를 찾지 못했습니다: ' + dir);
  return dir;
}
/** 게임 저장소가 내려받은 JDK(데스크톱 빌드용) 또는 PDMaker 의 JDK 에서 jpackage */
function findJpackage(repo, javaHome) {
  const exe = IS_WIN ? 'jpackage.exe' : 'jpackage';
  const jd = path.join(repo, 'desktop', 'build', 'jdks');
  const scan = d => { try { return fs.readdirSync(d).map(f => path.join(d, f)); } catch (_) { return []; } };
  for (const plat of scan(jd)) for (const j of scan(plat)) { const f = path.join(j, 'bin', exe); if (fs.existsSync(f)) return f; }
  const f = javaHome && path.join(javaHome, 'bin', exe);
  return f && fs.existsSync(f) ? f : null;
}
async function makeInstaller(repo, project, appImage, dest, nm) {
  const wix = await ensureWix();
  const javaHome = await ensureJava();
  const jp = findJpackage(repo, javaHome);
  if (!jp) throw new Error('jpackage 를 찾지 못했습니다 (JDK 17 이상 필요)');
  const gradle = fs.readFileSync(path.join(repo, 'build.gradle'), 'utf8');
  const ver = ((/appVersionName\s*=\s*'([^']*)'/.exec(gradle) || [])[1] || '1.0.0').match(/\d+(\.\d+){0,2}/);
  const gid = installer.gameId(project) || {};
  // 같은 게임이면 늘 같은 업그레이드 UUID (새 버전 설치 파일이 예전 것을 덮어씀)
  const h = require('crypto').createHash('md5').update('pdmaker:' + (gid.appPackageName || nm)).digest('hex');
  const uuid = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
  const args = ['--type', 'exe', '--app-image', appImage, '--name', path.basename(appImage), '--dest', dest,
    '--app-version', ver ? ver[0] : '1.0.0', '--vendor', 'PDMaker', '--win-upgrade-uuid', uuid,
    '--win-shortcut', '--win-menu', '--win-dir-chooser', '--win-per-user-install'];
  log(`> jpackage ${args.join(' ')}`);
  const env = Object.assign({}, process.env, { PATH: wix + path.delimiter + (process.env.PATH || '') });
  await new Promise((res, rej) => {
    const p = spawn(jp, args, { env });
    const pipe = b => b.toString().split(/\r?\n/).forEach(l => { if (l) log(l); });
    p.stdout.on('data', pipe); p.stderr.on('data', pipe);
    p.on('close', c => c === 0 ? res() : rej(new Error('jpackage 종료 코드 ' + c + ' (게임 이름에 한글이 있으면 영어 이름으로 다시 해 보세요)'))); p.on('error', rej);
  });
  const exe = newestFile(dest, /\.exe$/i);
  if (!exe) throw new Error('설치 파일(.exe)이 만들어지지 않았습니다');
  const want = path.join(dest, nm + ' 설치.exe');
  try { fs.renameSync(exe, want); return want; } catch (_) { return exe; }
}

// ---------------- 안드로이드 APK ----------------
/** 안드로이드 SDK — 환경 변수 · 저장소 local.properties · 흔한 설치 위치 */
function findAndroidSdk(repo) {
  const c = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT];
  try { const lp = fs.readFileSync(path.join(repo, 'local.properties'), 'utf8'); const m = /^\s*sdk\.dir\s*=\s*(.+)$/m.exec(lp); if (m) c.push(m[1].trim().replace(/\\\\/g, '\\').replace(/\\:/g, ':')); } catch (_) { /* 없음 */ }
  const home = require('os').homedir();
  if (IS_WIN) c.push(path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'Android', 'Sdk'));
  c.push(path.join(home, 'Library', 'Android', 'sdk'), path.join(home, 'Android', 'Sdk'), '/opt/android-sdk');
  return c.find(d => d && fs.existsSync(path.join(d, 'platforms')) || (d && fs.existsSync(path.join(d, 'cmdline-tools')))) || null;
}
/** 서명 키: 직접 고른 키스토어, 없으면 프로젝트의 signing/ 에 만들어 둔 키 (처음 한 번 keytool 로 만듦) */
async function apkSigning(project, s, javaHome) {
  if (s.store) {
    if (!fs.existsSync(s.store)) throw new Error('키스토어 파일이 없습니다: ' + s.store);
    if (!s.alias || !s.storePass) throw new Error('키스토어의 별칭(alias)과 비밀번호를 적어 주세요');
    return { store: s.store, storePass: s.storePass, alias: s.alias, keyPass: s.keyPass || s.storePass, note: s.store };
  }
  const dir = path.join(project, 'signing'), jks = path.join(dir, 'release.jks'), info = path.join(dir, 'keystore.json');
  if (fs.existsSync(jks) && fs.existsSync(info)) { const k = JSON.parse(fs.readFileSync(info, 'utf8')); return { store: jks, storePass: k.storePass, alias: k.alias, keyPass: k.keyPass || k.storePass, note: `프로젝트의 signing/release.jks (잃어버리지 마세요)` }; }
  fs.mkdirSync(dir, { recursive: true });
  const pass = require('crypto').randomBytes(18).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 20);
  const keytool = path.join(javaHome || '', 'bin', IS_WIN ? 'keytool.exe' : 'keytool');
  const kt = fs.existsSync(keytool) ? keytool : 'keytool';
  log('> 안드로이드 서명 키를 만듭니다: ' + jks);
  await new Promise((res, rej) => {
    const p = spawn(kt, ['-genkeypair', '-keystore', jks, '-storetype', 'PKCS12', '-alias', 'pdmaker', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000',
      '-storepass', pass, '-keypass', pass, '-dname', 'CN=PDMaker Game, O=PDMaker']);
    p.stderr.on('data', b => log(b.toString().trim())); p.on('close', c => c === 0 ? res() : rej(new Error('keytool 종료 코드 ' + c))); p.on('error', rej);
  });
  fs.writeFileSync(info, JSON.stringify({ alias: 'pdmaker', storePass: pass, keyPass: pass, note: '이 키로 서명한 APK 만 서로 업데이트됩니다. 이 폴더를 지우거나 잃어버리지 마세요 (게임 파일에는 들어가지 않음).' }, null, 2));
  fs.writeFileSync(path.join(dir, '읽어 주세요.txt'), '\ufeff안드로이드 APK 서명 키입니다.\r\n같은 키로 서명해야 이미 설치한 게임 위에 업데이트할 수 있습니다.\r\n지우거나 잃어버리지 말고, 다른 사람에게 주지 마세요.\r\n');
  return { store: jks, storePass: pass, alias: 'pdmaker', keyPass: pass, note: `프로젝트의 signing/release.jks (잃어버리지 마세요)` };
}
/** APK 빌드 준비: SDK 확인 · 서명 키 · init 스크립트 · 프로젝트를 assets 에 → { init, env, cleanup, keyNote } */
async function prepareApk(repo, project, signing) {
  const sdk = findAndroidSdk(repo);
  if (!sdk) throw new Error('안드로이드 SDK 를 찾지 못했습니다. Android Studio 를 설치하고 한 번 실행해 SDK 를 받은 뒤 다시 하세요 (또는 ANDROID_HOME 환경 변수에 SDK 폴더를 지정).');
  const lpf = path.join(repo, 'local.properties');
  let lp = ''; try { lp = fs.readFileSync(lpf, 'utf8'); } catch (_) { /* 없음 */ }
  if (!/^\s*sdk\.dir\s*=/m.test(lp)) { fs.writeFileSync(lpf, lp + (lp && !lp.endsWith('\n') ? '\n' : '') + 'sdk.dir=' + sdk.replace(/\\/g, '\\\\').replace(/:/g, '\\:') + '\n'); log('> local.properties: sdk.dir = ' + sdk); }
  const javaHome = await ensureJava();
  const k = await apkSigning(project, signing, javaHome);
  // init 스크립트: 릴리스 서명 + pdmaker 코드가 R8 에 지워지지 않게 (게임 저장소 build.gradle 은 건드리지 않음)
  const init = path.join(require('os').tmpdir(), 'pdmaker-apk-init.gradle');
  fs.writeFileSync(init, [
    'allprojects {',
    '  afterEvaluate { p ->',
    "    if (p.plugins.hasPlugin('com.android.application') && p.hasProperty('pdmStore')) {",
    "      def keep = new File(p.layout.buildDirectory.get().asFile, 'pdmaker-keep.pro'); keep.parentFile.mkdirs()",
    "      keep.text = '-keep class com.shatteredpixel.shatteredpixeldungeon.pdmaker.** { *; }\\n'",
    "      def sc = p.android.signingConfigs.create('pdm')",
    "      sc.storeFile = p.file(p.property('pdmStore')); sc.storePassword = p.property('pdmStorePass'); sc.keyAlias = p.property('pdmAlias'); sc.keyPassword = p.property('pdmKeyPass')",
    "      def rel = p.android.buildTypes.getByName('release')",
    '      rel.signingConfig = sc',
    '      rel.proguardFiles(keep)',
    '    }',
    '  }',
    '}', ''].join('\n'));
  // 프로젝트를 core 의 assets/pdmaker-project 에 (안드로이드는 이 assets 를 씀 — 런타임이 Gdx.files.internal 로 읽음). 빌드가 끝나면 지움
  const assets = path.join(repo, 'core', 'src', 'main', 'assets', 'pdmaker-project');
  fs.rmSync(assets, { recursive: true, force: true });
  fs.cpSync(project, assets, { recursive: true, filter: src => !skipProj(path.relative(project, src).replace(/\\/g, '/'), fs.statSync(src).isDirectory()) });
  log('> 프로젝트를 APK 에 넣습니다 (assets/pdmaker-project)');
  return {
    init, keyNote: k.note,
    env: { ORG_GRADLE_PROJECT_pdmStore: k.store, ORG_GRADLE_PROJECT_pdmStorePass: k.storePass, ORG_GRADLE_PROJECT_pdmAlias: k.alias, ORG_GRADLE_PROJECT_pdmKeyPass: k.keyPass },   // 비밀번호는 명령줄 · 출력 창에 남지 않게 환경 변수로
    cleanup: () => { try { fs.rmSync(assets, { recursive: true, force: true }); } catch (_) { /* 무시 */ } }
  };
}
ipcMain.handle('game:clean', wrap(async ({ repo }) => {
  if (!isRepoDir(repo) && bundledRepo()) repo = bundledRepo();
  await runGradle(repo, ['clean', '--console=plain'], code => { log(`> 빌드 정리 끝 (코드 ${code})`); if (win) win.webContents.send('game:exit', code); });
  return true;
}));

// ---------------- 게임 런타임 설치 (pdmaker 패키지 + 연결 줄) ----------------
const installer = require('./runtime-installer');
const codegen = require('./renderer/js/codegen');
const runtimeSrc = () => app.isPackaged ? path.join(process.resourcesPath, 'runtime', 'src') : path.join(__dirname, '..', 'runtime', 'src');
ipcMain.handle('runtime:install', wrap(arg => {
  const { repo, project } = typeof arg === 'string' ? { repo: arg } : arg;
  const lines = []; installer.install(repo, runtimeSrc(), l => { lines.push(l); log(l); }, project || null); return lines;
}));
ipcMain.handle('runtime:uninstall', wrap(repo => { const lines = []; installer.uninstall(repo, l => { lines.push(l); log(l); }); return lines; }));
/** 설치된 런타임이 에디터의 것과 같은지 (파일 내용 + 연결 줄 수) */
function runtimeState(repo) {
  const d = path.join(repo, 'core', 'src', 'main', 'java', 'com', 'shatteredpixel', 'shatteredpixeldungeon');
  const pkgDir = path.join(d, 'pdmaker');
  const src = path.join(runtimeSrc(), 'com', 'shatteredpixel', 'shatteredpixeldungeon', 'pdmaker');
  if (!fs.existsSync(pkgDir)) return { pkg: false, upToDate: false, reason: 'pdmaker 패키지 없음' };
  const srcFiles = fs.readdirSync(src).filter(f => f.endsWith('.java') && /\bclass\s/.test(fs.readFileSync(path.join(src, f), 'utf8')));
  if (fs.readdirSync(pkgDir).some(f => f.endsWith('.java') && !srcFiles.includes(f))) return { pkg: true, upToDate: false, reason: '예전 파일이 남아 있음' };
  for (const f of srcFiles) {
    const t = path.join(pkgDir, f);
    if (!fs.existsSync(t) || fs.readFileSync(t, 'utf8') !== fs.readFileSync(path.join(src, f), 'utf8')) return { pkg: true, upToDate: false, reason: f + ' 이(가) 예전 것' };
  }
  let hooks = 0;
  for (const f of [...new Set(installer.PATCHES.map(p => p.file))]) {
    const fp = installer.patchFile(repo, f); if (fs.existsSync(fp)) hooks += fs.readFileSync(fp, 'utf8').split(installer.MARK).length - 1;
  }
  if (hooks < installer.PATCHES.length) return { pkg: true, upToDate: false, reason: `연결 줄 ${hooks}/${installer.PATCHES.length}` };
  return { pkg: true, upToDate: true };
}
ipcMain.handle('runtime:status', wrap(repo => {
  const d = path.join(repo, 'core', 'src', 'main', 'java', 'com', 'shatteredpixel', 'shatteredpixeldungeon');
  const pkg = fs.existsSync(path.join(d, 'pdmaker', 'MakerRuntime.java'));
  let hooks = 0;
  for (const f of [...new Set(installer.PATCHES.map(p => p.file))]) {
    const fp = installer.patchFile(repo, f); if (fs.existsSync(fp)) hooks += fs.readFileSync(fp, 'utf8').split(installer.MARK).length - 1;
  }
  return { pkg, hooks, total: installer.PATCHES.length };
}));
