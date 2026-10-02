// ================================================================
//  updater — PDMaker 자체 업데이트 (GitHub 저장소의 main 과 비교해서 받아 옴)
//    check(root)        → { mode, local, remote, behind, commits[], upToDate, canApply, note }
//    apply(root, log)   → { ok, mode, sha, needInstall, files }
//    두 가지 방식:
//      · git  : pd-maker 폴더가 git 저장소이고 git 이 깔려 있으면 fetch / pull --ff-only
//      · zip  : 그 밖에는 GitHub 의 main zip 을 받아 덮어씀 (game/ · node_modules · .git 은 건드리지 않음)
//               받은 커밋은 pd-maker/.pdmaker-update.json 에 적어 둠 (다음 확인 때 비교)
//    Electron 없이 node 로도 돌아감 (테스트: node editor/updater.js check|apply [폴더])
// ================================================================
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const zlib = require('zlib');
const { spawnSync } = require('child_process');

const OWNER = 'IceNight154', REPO = 'pd-maker', BRANCH = 'main';
const PAGE = `https://github.com/${OWNER}/${REPO}`;
const API = `https://api.github.com/repos/${OWNER}/${REPO}`;
const ZIP = `https://codeload.github.com/${OWNER}/${REPO}/zip/refs/heads/${BRANCH}`;
const MARK = '.pdmaker-update.json';
/** zip 방식에서 덮어쓰지 않는 것: 게임 저장소(용량 큼 · PDMaker 가 고쳐 쓰는 파일) · 받은 모듈 · git */
const SKIP = [/^game\//, /^editor\/node_modules\//, /^\.git\//, /^editor\/dist\//];

function get(url, hops = 0) {
  return new Promise((res, rej) => {
    if (hops > 8) return rej(new Error('리다이렉트가 너무 많습니다'));
    const rq = https.get(url, { headers: { 'User-Agent': 'PDMaker-Updater', Accept: 'application/vnd.github+json' }, timeout: 20000 }, r => {
      if ([301, 302, 303, 307, 308].includes(r.statusCode) && r.headers.location) { r.resume(); return get(new URL(r.headers.location, url).toString(), hops + 1).then(res, rej); }
      const chunks = []; r.on('data', b => chunks.push(b));
      r.on('end', () => { const body = Buffer.concat(chunks);
        if (r.statusCode !== 200) return rej(new Error(r.statusCode === 403 ? 'GitHub 요청 한도를 넘었습니다. 잠시 뒤에 다시 해 보세요 (HTTP 403)' : r.statusCode === 404 ? 'GitHub 저장소를 찾지 못했습니다 (HTTP 404)' : 'GitHub 응답 오류: HTTP ' + r.statusCode));
        res(body); });
      r.on('error', rej);
    });
    rq.on('timeout', () => rq.destroy(new Error('GitHub 에 연결하지 못했습니다 (시간 초과)')));
    rq.on('error', e => rej(new Error('GitHub 에 연결하지 못했습니다: ' + (e.code || e.message))));
  });
}
const getJSON = async url => JSON.parse((await get(url)).toString('utf8'));

function git(root, args, timeout) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: timeout || 60000, windowsHide: true });
  return { ok: !r.error && r.status === 0, out: String(r.stdout || '').trim(), err: String(r.stderr || (r.error && r.error.message) || '').trim() };
}
/** 이 폴더가 pd-maker 의 git 저장소인지 (원격이 이 GitHub 저장소) */
function gitMode(root) {
  if (!fs.existsSync(path.join(root, '.git'))) return false;
  const top = git(root, ['rev-parse', '--show-toplevel']);
  if (!top.ok || path.resolve(top.out) !== path.resolve(root)) return false;
  const url = git(root, ['remote', 'get-url', 'origin']);
  return url.ok && new RegExp(OWNER + '/' + REPO + '(\\.git)?/?$', 'i').test(url.out);
}
function readMark(root) { try { return JSON.parse(fs.readFileSync(path.join(root, MARK), 'utf8')); } catch (_) { return null; } }
const short = s => String(s || '').slice(0, 7);
const firstLine = s => String(s || '').split('\n')[0].slice(0, 120);

async function check(root) {
  const packaged = !fs.existsSync(path.join(root, 'editor', 'main.js'));   // 실행 파일 하나로 묶은 판은 스스로 덮어쓸 수 없음
  if (!packaged && gitMode(root)) {
    const head = git(root, ['rev-parse', 'HEAD']);
    const f = git(root, ['fetch', '--quiet', 'origin', BRANCH], 90000);
    if (!f.ok) throw new Error('git fetch 실패: ' + (f.err || '알 수 없는 오류'));
    const remote = git(root, ['rev-parse', 'FETCH_HEAD']).out;
    const log = git(root, ['log', '--format=%H%x09%cI%x09%s', 'HEAD..FETCH_HEAD']).out;
    const commits = log ? log.split('\n').map(l => { const [sha, date, ...m] = l.split('\t'); return { sha, date, message: m.join('\t') }; }) : [];
    const ahead = +(git(root, ['rev-list', '--count', 'FETCH_HEAD..HEAD']).out || 0);
    const dirty = git(root, ['status', '--porcelain', '-uno']).out.split('\n').filter(Boolean).length;
    return { mode: 'git', page: PAGE, local: { sha: head.out, short: short(head.out) }, remote: { sha: remote, short: short(remote) }, behind: commits.length, ahead, dirty, commits,
      upToDate: !commits.length, canApply: commits.length > 0,
      note: ahead ? `이 PC 에 아직 올리지 않은 커밋이 ${ahead}개 있습니다.` : '' };
  }
  const head = await getJSON(`${API}/commits/${BRANCH}`);
  const remote = { sha: head.sha, short: short(head.sha), date: head.commit && head.commit.committer && head.commit.committer.date, message: firstLine(head.commit && head.commit.message) };
  const mark = packaged ? null : readMark(root);
  let commits = [], behind = null;
  if (mark && mark.sha && mark.sha !== remote.sha) {
    try { const c = await getJSON(`${API}/compare/${mark.sha}...${remote.sha}`);
      behind = c.ahead_by; commits = (c.commits || []).reverse().map(x => ({ sha: x.sha, date: x.commit.committer.date, message: firstLine(x.commit.message) })); } catch (_) { /* 비교 실패 → 최신 커밋만 */ }
  }
  if (!commits.length && (!mark || mark.sha !== remote.sha)) commits = [{ sha: remote.sha, date: remote.date, message: remote.message }];
  const upToDate = !!(mark && mark.sha === remote.sha);
  return { mode: packaged ? 'packaged' : 'zip', page: PAGE, local: mark ? { sha: mark.sha, short: short(mark.sha), date: mark.date } : null, remote, behind, commits: upToDate ? [] : commits,
    upToDate, canApply: !packaged && !upToDate,
    note: packaged ? '실행 파일로 묶은 판은 스스로 업데이트할 수 없습니다. GitHub 에서 새로 받아 주세요.'
      : !mark ? '이 폴더가 어느 버전인지 기록이 없어 최신인지 알 수 없습니다. 업데이트하면 최신 파일로 덮어쓰고 버전을 기록합니다.' : '' };
}

/** zip 의 중앙 목록 (editor/zip.js 와 같은 방식 — 여기서는 필요한 파일만 풂) */
function zipList(buf) {
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('받은 파일이 ZIP 이 아닙니다');
  const n = buf.readUInt16LE(e + 10); let p = buf.readUInt32LE(e + 16); const out = [];
  for (let i = 0; i < n; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('ZIP 목록이 깨졌습니다');
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), loff = buf.readUInt32LE(p + 42);
    out.push({ name: buf.slice(p + 46, p + 46 + nlen).toString('utf8'), method, csize, loff });
    p += 46 + nlen + xlen + clen;
  }
  return out;
}
function zipData(buf, it) {
  const nlen = buf.readUInt16LE(it.loff + 26), xlen = buf.readUInt16LE(it.loff + 28), start = it.loff + 30 + nlen + xlen, body = buf.slice(start, start + it.csize);
  if (it.method === 8) return zlib.inflateRawSync(body);
  if (it.method === 0) return body;
  throw new Error('지원하지 않는 압축 방식: ' + it.name);
}

async function apply(root, log) {
  log = log || (() => {});
  if (!fs.existsSync(path.join(root, 'editor', 'main.js'))) throw new Error('실행 파일로 묶은 판은 스스로 업데이트할 수 없습니다.');
  const pkgBefore = (() => { try { return JSON.stringify(JSON.parse(fs.readFileSync(path.join(root, 'editor', 'package.json'), 'utf8')).devDependencies || {}); } catch (_) { return ''; } })();
  const depsChanged = () => { try { return JSON.stringify(JSON.parse(fs.readFileSync(path.join(root, 'editor', 'package.json'), 'utf8')).devDependencies || {}) !== pkgBefore; } catch (_) { return false; } };
  if (gitMode(root)) {
    log('> git pull --ff-only origin ' + BRANCH);
    const r = git(root, ['pull', '--ff-only', 'origin', BRANCH], 180000);
    if (r.out) log(r.out);
    if (!r.ok) { const e = new Error('git pull 이 실패했습니다.\n' + (r.err || r.out)); e.gitFailed = true; throw e; }
    return { ok: true, mode: 'git', sha: git(root, ['rev-parse', 'HEAD']).out, needInstall: depsChanged() };
  }
  return applyZip(root, log, depsChanged);
}
/** zip 으로 덮어쓰기 (git 방식이 실패했을 때도 직접 부를 수 있음) */
async function applyZip(root, log, depsChanged) {
  log = log || (() => {});
  const head = await getJSON(`${API}/commits/${BRANCH}`);
  log('> 내려받는 중: ' + ZIP);
  const buf = await get(ZIP);
  log(`  받음 ${(buf.length / 1048576).toFixed(1)} MB — 푸는 중…`);
  const list = zipList(buf).filter(it => !it.name.endsWith('/'));
  if (!list.length) throw new Error('받은 ZIP 이 비어 있습니다');
  const top = list[0].name.split('/')[0] + '/';   // pd-maker-main/
  if (!list.some(it => it.name === top + 'editor/main.js')) throw new Error('받은 ZIP 이 PDMaker 가 아닙니다');
  const hasGame = fs.existsSync(path.join(root, 'game')) && fs.readdirSync(path.join(root, 'game')).length > 0;
  const base = path.resolve(root); let n = 0, skipped = 0;
  // 먼저 전부 풀어 보고(메모리) 문제없으면 씀 — 중간에 깨진 ZIP 으로 반만 덮어쓰지 않게
  const todo = [];
  for (const it of list) {
    if (!it.name.startsWith(top)) continue;
    const rel = it.name.slice(top.length);
    if (SKIP.some(re => re.test(rel)) && !(rel.startsWith('game/') && !hasGame)) { skipped++; continue; }
    const target = path.resolve(base, ...rel.split('/'));
    if (!target.startsWith(base + path.sep)) throw new Error('잘못된 경로가 들어 있습니다: ' + it.name);
    todo.push([target, zipData(buf, it)]);
  }
  for (const [target, data] of todo) {
    let same = false; try { same = fs.statSync(target).size === data.length && fs.readFileSync(target).equals(data); } catch (_) { /* 새 파일 */ }
    if (same) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, data); n++;
  }
  fs.writeFileSync(path.join(root, MARK), JSON.stringify({ sha: head.sha, date: head.commit.committer.date, message: firstLine(head.commit.message), updatedAt: new Date().toISOString() }, null, 2));
  log(`  파일 ${n}개를 바꿨습니다 (게임 저장소 등 ${skipped}개는 그대로 둠)`);
  return { ok: true, mode: 'zip', sha: head.sha, files: n, needInstall: depsChanged ? depsChanged() : false };
}

module.exports = { check, apply, applyZip, PAGE, MARK };

if (require.main === module) {
  const [cmd, dir] = process.argv.slice(2), root = path.resolve(dir || path.join(__dirname, '..'));
  (cmd === 'apply' ? apply(root, console.log) : cmd === 'zip' ? applyZip(root, console.log) : check(root)).then(r => console.log(JSON.stringify(r, null, 2)), e => { console.error('오류: ' + e.message); process.exit(1); });
}
