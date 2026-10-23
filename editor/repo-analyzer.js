// ================================================================
//  게임 저장소 분석기 (9차) — Pixel Dungeon 계열 저장소를 "읽기 전용"으로 살펴서 무엇을 어디까지 이해했는지 보고합니다.
//    · 원본 파일은 읽기만 합니다 (쓰는 곳: 캐시 폴더 opts.cacheDir 하나 — 사용자 설정 폴더)
//    · 폴더 이름이 아니라 구조로 판단: settings.gradle → 모듈 → 소스 · 에셋 폴더 → Dungeon.java 가 있는 게임 모듈 · 패키지
//    · 단계마다 결과를 따로: 파일 발견 · 읽기 · 구조 분석 · 의미 분석 · 내부 모델 변환 · 편집기 표시 · 편집/저장 · 런타임 (support[])
//    · 확실하지 않은 것은 오류로 단정하지 않고 "추정" · "미확인"으로 표시
//  사용: node editor/repo-analyzer.js <폴더> [--json] [--force]   또는 main.js(ipc repo:analyze) · tools/tests/repo-compat.js 에서 require
// ================================================================
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const JS = require('./renderer/js/javasrc.js');

const VERSION = 5;   // 결과 모양이 바뀌면 올림 (예전 캐시를 쓰지 않게) — 2: 런타임 클래스 확인 · 4: 영웅 그림 구조 · 탐색 색인 · 적응 클래스 확인 · 5: 시작 자리(maps.start)
const SKIP_DIRS = new Set(['.git', '.gradle', 'build', 'node_modules', '.idea', '.vscode', '.cxx', '.externalNativeBuild']);
const IMG = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp']), AUD = new Set(['mp3', 'ogg', 'wav']), FONT = new Set(['ttf', 'otf', 'fnt']);
const TEXT = new Set(['properties', 'json', 'xml', 'txt', 'md']);
const EDIT_SRC = new Set(['aseprite', 'ase', 'psd', 'kra', 'xcf', 'pdn']);   // 그림 프로그램 원본 — 게임이 읽지 않음
const BACKUP = /\.(bak|orig|tmp|pdmaker-backup)(\.[\w-]+)*$|~$/i;
const LIST_CAP = 400;
const IS_WIN = process.platform === 'win32';

/** Windows 긴 경로 (260자 넘음) */
const LP = p => (IS_WIN && p.length > 240 && !p.startsWith('\\\\?\\')) ? '\\\\?\\' + path.resolve(p) : p;
const exists = p => { try { fs.accessSync(LP(p)); return true; } catch (_) { return false; } };
const isFile = p => { try { return fs.statSync(LP(p)).isFile(); } catch (_) { return false; } };
const isDir = p => { try { return fs.statSync(LP(p)).isDirectory(); } catch (_) { return false; } };
const readText = p => fs.readFileSync(LP(p), 'utf8');
const rel = (root, p) => path.relative(root, p).split(path.sep).join('/');
const ext = f => { const m = /\.([^./\\]+)$/.exec(f); return m ? m[1].toLowerCase() : ''; };
const cap = (list, n = LIST_CAP) => ({ total: list.length, list: list.slice(0, n), more: Math.max(0, list.length - n) });
const lower = s => IS_WIN ? String(s).toLowerCase() : String(s);
const inside = (base, p) => { const b = lower(base.endsWith(path.sep) ? base : base + path.sep); return lower(p) === lower(base) || lower(p).startsWith(b); };

// ---------------------------------------------------------------- 안전한 폴더 훑기
/** 저장소 밖으로 나가는 링크 · 순환 링크 · 권한 오류를 건너뛰고 모두 기록 */
function safeWalk(root, opts = {}) {
  const maxFiles = opts.maxFiles || 60000, maxDepth = opts.maxDepth || 40;
  const out = { files: [], dirs: 0, skipped: [], errors: [], caseDup: [], truncated: false };
  let rootReal; try { rootReal = fs.realpathSync(LP(root)); } catch (e) { out.errors.push({ rel: '.', reason: e.code || e.message }); return out; }
  const seen = new Set([lower(rootReal)]);
  const stack = [{ abs: root, rel: '', depth: 0 }];
  while (stack.length) {
    const cur = stack.pop();
    let ents;
    try { ents = fs.readdirSync(LP(cur.abs), { withFileTypes: true }); } catch (e) { out.errors.push({ rel: cur.rel || '.', reason: (e.code || '') + ' 폴더를 읽지 못함' }); continue; }
    out.dirs++;
    const names = new Map();
    for (const e of ents) {
      const r = cur.rel ? cur.rel + '/' + e.name : e.name, abs = path.join(cur.abs, e.name);
      const lk = e.name.toLowerCase(); if (names.has(lk)) out.caseDup.push([names.get(lk), r]); else names.set(lk, r);
      let isD = e.isDirectory(), isF = e.isFile();
      if (e.isSymbolicLink()) {
        let real; try { real = fs.realpathSync(LP(abs)); } catch (er) { out.skipped.push({ rel: r, reason: '깨진 링크' }); continue; }
        if (!inside(rootReal, real)) { out.skipped.push({ rel: r, reason: '저장소 밖을 가리키는 링크 — 읽지 않음' }); continue; }
        let st; try { st = fs.statSync(LP(abs)); } catch (_) { out.skipped.push({ rel: r, reason: '링크 대상을 읽지 못함' }); continue; }
        isD = st.isDirectory(); isF = st.isFile();
        if (isD && seen.has(lower(real))) { out.skipped.push({ rel: r, reason: '순환 링크 (이미 훑은 폴더)' }); continue; }
        if (isD) seen.add(lower(real));
      } else if (isD) {
        let real = abs; try { real = fs.realpathSync(LP(abs)); } catch (_) { /* 그대로 */ }
        if (seen.has(lower(real))) { out.skipped.push({ rel: r, reason: '이미 훑은 폴더 (연결 지점)' }); continue; }
        seen.add(lower(real));
      }
      if (isD) {
        if (SKIP_DIRS.has(e.name)) { out.skipped.push({ rel: r, reason: '빌드 결과 · 도구 폴더 (분석 대상 아님)' }); continue; }
        if (cur.depth + 1 > maxDepth) { out.skipped.push({ rel: r, reason: '폴더가 너무 깊음' }); continue; }
        stack.push({ abs, rel: r, depth: cur.depth + 1 });
      } else if (isF) {
        if (out.files.length >= maxFiles) { out.truncated = true; continue; }
        let st; try { st = fs.statSync(LP(abs)); } catch (er) { out.errors.push({ rel: r, reason: (er.code || '') + ' 파일 정보를 읽지 못함' }); continue; }
        out.files.push({ rel: r, abs, size: st.size, mtimeMs: Math.floor(st.mtimeMs) });
      }
    }
  }
  out.files.sort((a, b) => a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0);
  return out;
}

// ---------------------------------------------------------------- 저장소 루트 찾기
const settingsOf = d => ['settings.gradle', 'settings.gradle.kts'].map(f => path.join(d, f)).find(isFile) || null;
/** 고른 폴더 → 저장소 루트. 위로는 "이 폴더를 모듈로 포함하는 저장소"일 때만, 아래로는 3단계까지 후보를 모음 (첫 폴더를 그냥 고르지 않음) */
function findRoot(input) {
  const abs = path.resolve(String(input || ''));
  const res = { input: abs, root: null, reason: '', candidates: [], problems: [] };
  if (!input || !isDir(abs)) { res.problems.push('폴더가 없습니다: ' + abs); return res; }
  if (settingsOf(abs)) { res.root = abs; res.reason = 'settings.gradle 이 있는 폴더'; return res; }
  // 모듈 폴더(core 등)를 고른 경우: 위 폴더의 settings.gradle 이 이 폴더를 포함할 때만
  let d = abs;
  for (let up = 1; up <= 4; up++) {
    const p = path.dirname(d); if (!p || p === d) break; d = p;
    const sf = settingsOf(d); if (!sf) continue;
    let inc = { modules: [], projectDirs: {} }; try { inc = JS.gradleIncludes(readText(sf)); } catch (_) { /* 읽기 실패 */ }
    const r = rel(d, abs), dirs = inc.modules.map(m => inc.projectDirs[m] || m.replace(/^:/, '').split(':').join('/'));
    if (dirs.some(x => r === x || r.startsWith(x + '/'))) { res.root = d; res.reason = `고른 폴더(${r})가 모듈인 상위 저장소`; return res; }
    break;   // 상관없는 상위 폴더로는 올라가지 않음
  }
  // 아래로 찾기
  const found = [];
  const rec = (dir, depth) => {
    if (depth > 3) return;
    let ents = []; try { ents = fs.readdirSync(LP(dir), { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      if (!e.isDirectory() || SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
      const c = path.join(dir, e.name);
      if (settingsOf(c)) found.push(c); else rec(c, depth + 1);
    }
  };
  rec(abs, 1);
  res.candidates = found;
  if (found.length === 1) { res.root = found[0]; res.reason = '아래 폴더에서 찾은 유일한 Gradle 저장소'; return res; }
  if (found.length > 1) { res.problems.push(`이 폴더 안에 게임 저장소가 ${found.length}개 있습니다 — 하나를 고르세요`); return res; }
  if (['build.gradle', 'build.gradle.kts', 'gradlew', 'gradlew.bat'].some(f => isFile(path.join(abs, f)))) { res.root = abs; res.reason = 'settings.gradle 없는 단일 모듈 Gradle 폴더'; return res; }
  // 12차: gradle 없는 Eclipse · Ant 안드로이드 프로젝트 (원작 Pixel Dungeon — AndroidManifest.xml + src/ + assets/)
  if (isFile(path.join(abs, 'AndroidManifest.xml')) && isDir(path.join(abs, 'src'))) { res.root = abs; res.reason = 'gradle 없는 Eclipse · Ant 안드로이드 프로젝트 (AndroidManifest.xml · src/)'; res.layout = 'eclipse'; return res; }
  res.problems.push('Gradle 저장소를 찾지 못했습니다 (settings.gradle · build.gradle · gradlew 없음)');
  return res;
}

// ---------------------------------------------------------------- 파일 디코딩 확인
const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crc32(buf, a, z) { let c = -1; for (let i = a; i < z; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; }
/** PNG 끝까지 풀어 봄: 청크 CRC · IDAT 압축 풀기 · 줄 길이 */
function decodePng(b) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (b.length < 33 || sig.some((v, i) => b[i] !== v)) return { status: 'failed', reason: 'PNG 서명이 아님' };
  let off = 8, w = 0, h = 0, depth = 0, color = 0, inter = 0, sawEnd = false; const idat = [];
  while (off + 8 <= b.length) {
    const len = b.readUInt32BE(off), type = b.toString('latin1', off + 4, off + 8);
    if (off + 12 + len > b.length) return { status: 'failed', reason: `${type} 청크가 잘림 (파일이 손상됨)`, w, h };
    if (crc32(b, off + 4, off + 8 + len) !== b.readUInt32BE(off + 8 + len)) return { status: 'failed', reason: `${type} 청크 CRC 불일치 (파일이 손상됨)`, w, h };
    if (type === 'IHDR') { w = b.readUInt32BE(off + 8); h = b.readUInt32BE(off + 12); depth = b[off + 16]; color = b[off + 17]; inter = b[off + 20]; }
    else if (type === 'IDAT') idat.push(b.subarray(off + 8, off + 8 + len));
    else if (type === 'IEND') { sawEnd = true; break; }
    off += 12 + len;
  }
  if (!w || !h) return { status: 'failed', reason: 'IHDR 없음' };
  if (!sawEnd) return { status: 'failed', reason: 'IEND 없음 (파일 끝이 잘림)', w, h };
  let raw; try { raw = zlib.inflateSync(Buffer.concat(idat)); } catch (e) { return { status: 'failed', reason: '그림 데이터 압축을 풀지 못함: ' + e.message, w, h }; }
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color];
  if (!ch) return { status: 'failed', reason: '알 수 없는 색 형식 ' + color, w, h };
  if (!inter) { const need = h * (1 + Math.ceil(w * ch * depth / 8)); if (raw.length < need) return { status: 'failed', reason: `그림 데이터가 모자람 (${raw.length}/${need} 바이트)`, w, h }; }
  return { status: 'decoded', w, h, info: `${w}×${h}` };
}
function headJpg(b) {
  if (b[0] !== 0xFF || b[1] !== 0xD8) return { status: 'failed', reason: 'JPEG 서명이 아님' };
  let i = 2, w = 0, h = 0;
  while (i + 9 < b.length) {
    if (b[i] !== 0xFF) { i++; continue; }
    const mk = b[i + 1]; if (mk === 0xD9) break;
    if (mk >= 0xC0 && mk <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(mk)) { h = b.readUInt16BE(i + 5); w = b.readUInt16BE(i + 7); break; }
    if (mk === 0xD8 || (mk >= 0xD0 && mk <= 0xD7) || mk === 0x01) { i += 2; continue; }
    i += 2 + b.readUInt16BE(i + 2);
  }
  if (!w) return { status: 'failed', reason: 'JPEG 크기(SOF)를 찾지 못함' };
  let end = false; for (let k = b.length - 1; k >= Math.max(1, b.length - 4096); k--) if (b[k - 1] === 0xFF && b[k] === 0xD9) { end = true; break; }
  return end ? { status: 'header', w, h, info: `${w}×${h} (머리 · 끝 표시 확인)` } : { status: 'failed', reason: 'JPEG 끝 표시(EOI) 없음 — 잘린 파일', w, h };
}
/** 내용으로 본 실제 형식 (확장자와 다를 때 알려 주려고) */
function sniff(b) {
  if (b.length < 4) return '';
  const h4 = b.toString('latin1', 0, 4);
  if (b[0] === 0x89 && h4.slice(1) === 'PNG') return 'png'; if (b[0] === 0xFF && b[1] === 0xD8) return 'jpg'; if (h4 === 'OggS') return 'ogg'; if (h4 === 'RIFF') return b.toString('latin1', 8, 12) === 'WAVE' ? 'wav' : b.toString('latin1', 8, 12) === 'WEBP' ? 'webp' : 'riff';
  if (b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3) return 'webm/matroska'; if (h4 === 'fLaC') return 'flac'; if (b.toString('latin1', 0, 3) === 'ID3') return 'mp3';
  if (b.toString('latin1', 4, 8) === 'ftyp') return 'mp4/m4a'; if (h4.startsWith('GIF8')) return 'gif'; return '';
}
/** libGDX 스킨 JSON 은 따옴표 없는 키 · 값을 허용 — 엄격한 JSON 이 실패하면 느슨하게 한 번 더 */
function lenientJson(s) {
  const t = s.replace(/^﻿/, '').replace(/\/\/[^\n]*/g, '')
    .replace(/([{,\s])([A-Za-z_$][\w$.\-]*)\s*:/g, '$1"$2":')
    .replace(/:\s*([A-Za-z_$][\w$.\-]*)\s*([,}\]\n])/g, (m, v, z) => ['true', 'false', 'null'].includes(v) ? m : `: "${v}"${z}`)
    .replace(/,\s*([}\]])/g, '$1');
  JSON.parse(t); return true;
}
function checkMedia(f, b) {
  const e = ext(f);
  const real = sniff(b), known = { png: ['png'], jpg: ['jpg'], jpeg: ['jpg'], ogg: ['ogg'], mp3: ['mp3', ''], wav: ['wav'], webp: ['webp'], gif: ['gif'] }[e];
  if (known && real && !known.includes(real)) return { status: 'failed', reason: `확장자는 .${e} 인데 실제 내용은 ${real} 형식 — 게임이 .${e} 로 읽으면 실패할 수 있음` };
  if (e === 'png') return decodePng(b);
  if (e === 'jpg' || e === 'jpeg') return headJpg(b);
  if (e === 'webp') return b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP' ? { status: 'header', info: 'WebP 머리 확인' } : { status: 'failed', reason: 'WebP 서명이 아님' };
  if (e === 'gif') return /^GIF8[79]a/.test(b.toString('latin1', 0, 6)) ? { status: 'header', w: b.readUInt16LE(6), h: b.readUInt16LE(8) } : { status: 'failed', reason: 'GIF 서명이 아님' };
  if (e === 'bmp') return b.toString('latin1', 0, 2) === 'BM' ? { status: 'header' } : { status: 'failed', reason: 'BMP 서명이 아님' };
  if (e === 'ogg') { if (b.toString('latin1', 0, 4) !== 'OggS') return { status: 'failed', reason: 'Ogg 서명이 아님' };
    const head = b.toString('latin1', 0, Math.min(b.length, 300)); return /vorbis|OpusHead|FLAC/.test(head) ? { status: 'header', info: /vorbis/.test(head) ? 'Ogg Vorbis' : 'Ogg' } : { status: 'failed', reason: 'Ogg 안의 소리 형식을 모름' }; }
  if (e === 'mp3') {
    let i = 0; if (b.toString('latin1', 0, 3) === 'ID3' && b.length > 10) i = 10 + ((b[6] & 0x7f) << 21 | (b[7] & 0x7f) << 14 | (b[8] & 0x7f) << 7 | (b[9] & 0x7f));
    for (let k = i; k < Math.min(b.length - 1, i + 4096); k++) if (b[k] === 0xFF && (b[k + 1] & 0xE0) === 0xE0) return { status: 'header', info: 'MPEG 오디오 프레임 확인' };
    return { status: 'failed', reason: 'MP3 프레임을 찾지 못함' };
  }
  if (e === 'wav') return b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WAVE' ? { status: 'header' } : { status: 'failed', reason: 'WAV 서명이 아님' };
  if (e === 'ttf' || e === 'otf') { const t = b.readUInt32BE(0); return [0x00010000, 0x4F54544F, 0x74727565, 0x74746366].includes(t) ? { status: 'header', info: '글꼴 머리 확인' } : { status: 'failed', reason: '글꼴 서명이 아님' }; }
  if (TEXT.has(e) || e === 'fnt') {
    let s; try { s = new TextDecoder('utf-8', { fatal: true }).decode(b); } catch (_) { return { status: 'failed', reason: 'UTF-8 이 아닌 글자 (깨진 글자)' }; }
    if (e === 'json') { try { JSON.parse(s.replace(/^﻿/, '')); } catch (er) {
      try { lenientJson(s); return { status: 'decoded', info: 'libGDX 형식 JSON (따옴표 없는 키 — libGDX 는 읽음)' }; } catch (_) { return { status: 'failed', reason: 'JSON 문법 오류: ' + er.message }; } } return { status: 'decoded' }; }
    if (e === 'properties') { let keys = 0, bad = 0, cont = false; for (const ln of s.split(/\r?\n/)) { const t = ln.trim(); if (cont) { cont = /\\$/.test(t); continue; } if (!t || t[0] === '#' || t[0] === '!') continue; if (/[=:]/.test(t)) keys++; else bad++; cont = /\\$/.test(t); }
      return bad ? { status: 'partial', keys, reason: `키=값이 아닌 줄 ${bad}개` } : { status: 'decoded', keys }; }
    return { status: 'decoded' };
  }
  return null;
}

// ---------------------------------------------------------------- 분석
function analyze(input, opts = {}) {
  const t0 = Date.now();
  const R = { format: 'pdmaker-repo-analysis', version: VERSION, generatedAt: new Date().toISOString(), input: path.resolve(String(input || '')),
    root: null, rootReason: '', candidates: [], name: '', build: {}, modules: [], source: {}, resources: {}, refs: {}, messages: {}, objects: {}, itemSheet: null,
    features: [], support: [], runtime: null, errors: [], warnings: [], walk: {} };
  const fr = findRoot(input);
  R.candidates = fr.candidates; R.root = fr.root; R.rootReason = fr.reason; fr.problems.forEach(p => R.errors.push({ phase: '루트', reason: p }));
  if (!fr.root) { R.durationMs = Date.now() - t0; return R; }
  const root = fr.root;
  R.name = path.basename(root);
  // 캐시 (파일 목록 · 크기 · 수정 시각이 같으면 그대로)
  const walk = safeWalk(root, opts);
  // 런타임 소스(편집기와 함께 바뀜)도 지문에 넣음 — 편집기를 업데이트하면 "런타임 클래스 확인"을 다시
  const rtDir = path.join(opts.runtimeSrc || path.join(__dirname, '..', 'runtime', 'src'), 'com', 'shatteredpixel', 'shatteredpixeldungeon', 'pdmaker');
  let rtSig = ''; try { rtSig = fs.readdirSync(rtDir).sort().map(f => { const st = fs.statSync(path.join(rtDir, f)); return f + '|' + st.size; }).join(','); } catch (_) { /* 없음 */ }
  const fp = crypto.createHash('sha1').update(String(VERSION) + '\n' + rtSig + '\n' + walk.files.map(f => f.rel + '|' + f.size + '|' + f.mtimeMs).join('\n')).digest('hex');
  R.fingerprint = fp;
  let cacheFile = null;
  if (opts.cacheDir) {
    let real = root; try { real = fs.realpathSync(root); } catch (_) { /* 그대로 */ }
    cacheFile = path.join(opts.cacheDir, crypto.createHash('sha1').update(lower(real)).digest('hex').slice(0, 16) + '.json');
    if (!opts.force && isFile(cacheFile)) {
      try { const c = JSON.parse(readText(cacheFile)); if (c && c.version === VERSION && c.fingerprint === fp) { c.cached = true; c.cacheFile = cacheFile; return c; } } catch (_) { /* 깨진 캐시 → 다시 */ }
    }
  }
  R.walk = { files: walk.files.length, dirs: walk.dirs, skipped: cap(walk.skipped, 100), errors: walk.errors, caseDup: walk.caseDup.slice(0, 50), truncated: walk.truncated };
  walk.errors.forEach(e => R.errors.push({ phase: '폴더 훑기', file: e.rel, reason: e.reason }));
  if (walk.truncated) R.warnings.push({ phase: '폴더 훑기', reason: `파일이 너무 많아 ${walk.files.length}개까지만 봤습니다` });
  const byRel = new Map(walk.files.map(f => [f.rel, f])), byLower = new Map(walk.files.map(f => [f.rel.toLowerCase(), f]));
  R.timing = { walk: Date.now() - t0 };
  const phase = (name, fn) => { const ts = Date.now(); try { return fn(); } catch (e) { R.errors.push({ phase: name, reason: '분석 중 오류: ' + (e && e.stack ? e.stack.split('\n').slice(0, 2).join(' / ') : e) }); return null; } finally { R.timing[name] = Date.now() - ts; if (opts.trace) console.error('  ·', name, R.timing[name] + 'ms'); } };
  const safeRead = (f, label) => { try { return readText(f.abs || path.join(root, f)); } catch (e) { R.errors.push({ phase: label || '읽기', file: f.rel || f, reason: (e.code || '') + ' 읽지 못함' }); return null; } };

  // ---- 빌드 · 모듈
  phase('빌드 설정', () => {
    const sf = settingsOf(root), bf = ['build.gradle', 'build.gradle.kts'].map(x => path.join(root, x)).find(isFile);
    const inc = sf ? JS.gradleIncludes(readText(sf)) : { modules: [], statements: [], projectDirs: {} };
    const props = bf ? JS.gradleProps(readText(bf)) : {};
    const gp = path.join(root, 'gradle.properties'), wrapper = path.join(root, 'gradle', 'wrapper', 'gradle-wrapper.properties');
    let gradleVersion = ''; if (isFile(wrapper)) { const m = /gradle-([\d.]+)-/.exec(readText(wrapper)); if (m) gradleVersion = m[1]; }
    R.build = { settings: sf ? rel(root, sf) : '', buildFile: bf ? rel(root, bf) : '', appName: props.appName || '', appPackageName: props.appPackageName || '', appVersionName: props.appVersionName || '',
      appVersionCode: props.appVersionCode || '', javaCompat: props.appJavaCompatibility || '', gdxVersion: props.gdxVersion || '', gradleVersion,
      plugins: props.plugins || [], gradleProperties: isFile(gp), wrapper: isFile(path.join(root, 'gradlew')) || isFile(path.join(root, 'gradlew.bat')),
      includeStatements: inc.statements };
    R.name = R.build.appName || R.name;
    const mods = inc.modules.length ? inc.modules : [':'];
    for (const m of mods) {
      const dir = m === ':' ? '' : (inc.projectDirs[m] || m.replace(/^:/, '').split(':').join('/'));
      const abs = path.join(root, dir), mb = ['build.gradle', 'build.gradle.kts'].map(x => path.join(abs, x)).find(isFile);
      const sd = mb ? JS.gradleSrcDirs(readText(mb)) : { java: [], assets: [], res: [], resources: [] };
      const pick = (list, def) => [...new Set([...list, def])].filter(x => isDir(path.join(abs, x))).map(x => rel(root, path.join(abs, x)));
      const deps = mb ? JS.gradleProps(readText(mb)).dependencies : [];
      R.modules.push({ name: m, dir: dir || '.', exists: isDir(abs), buildFile: mb ? rel(root, mb) : '', java: pick(sd.java, 'src/main/java'), kotlin: pick([], 'src/main/kotlin'),
        assets: pick(sd.assets, 'src/main/assets'), res: pick(sd.res, 'src/main/res'), manifest: isFile(path.join(abs, 'src', 'main', 'AndroidManifest.xml')) ? rel(root, path.join(abs, 'src/main/AndroidManifest.xml')) : '',
        dependsOn: deps.filter(d => /^project/.test(d.dep)).map(d => (/['"]([^'"]+)['"]/.exec(d.dep) || [])[1]), libraries: deps.filter(d => !/^project/.test(d.dep)).map(d => d.dep.replace(/['"]/g, '')) });
      if (!isDir(abs)) R.warnings.push({ phase: '빌드 설정', file: dir, reason: `settings.gradle 에 있는 모듈 ${m} 의 폴더가 없음` });
    }
    const multi = inc.statements.find(s => s.modules.length > 1);
    if (multi) R.features.push({ id: 'settings-single-include', label: 'settings.gradle 이 한 문장에 여러 모듈을 include', evidence: `${R.build.settings}:${multi.line} (${multi.modules.length}개)`,
      effect: '런타임 설치기의 "안드로이드 SDK 가 없으면 android 모듈 건너뛰기" 연결 줄은 이 형식에 넣지 않음 (android 모듈이 빌드에 포함됨)' });
  });

  // 12차: gradle 없는 Eclipse · Ant 프로젝트 (원작 Pixel Dungeon) — 저장소 자체가 모듈 하나 (src · assets · res)
  if (fr.layout === 'eclipse') {
    const m = R.modules.find(x => x.dir === '.') || (R.modules.push({ name: ':', dir: '.', exists: true, buildFile: '', java: [], kotlin: [], assets: [], res: [], manifest: '', dependsOn: [], libraries: [] }), R.modules[R.modules.length - 1]);
    if (!m.java.length) m.java = ['src'];
    if (!m.assets.length && isDir(path.join(root, 'assets'))) m.assets = ['assets'];
    if (!m.res.length && isDir(path.join(root, 'res'))) m.res = ['res'];
    m.manifest = m.manifest || 'AndroidManifest.xml';
    R.features.push({ id: 'eclipse-layout', label: 'gradle 없는 Eclipse · Ant 안드로이드 프로젝트', evidence: 'AndroidManifest.xml · src/ · assets/ (settings.gradle · build.gradle 없음)', effect: '분석 · 탐색 · 프로젝트 만들기는 됨 — PDMaker 런타임 설치 · 테스트 플레이(gradle)는 안 됨' });
  }
  // ---- 소스 루트 · 게임 모듈 · 패키지
  const javaFiles = walk.files.filter(f => /\.java$/i.test(f.rel)), ktFiles = walk.files.filter(f => /\.kts?$/i.test(f.rel) && !/\.gradle\.kts$/i.test(f.rel));
  let J = null;   // { srcDir, pkgDir(rel), pkg }
  phase('게임 모듈', () => {
    const dungeon = javaFiles.filter(f => /(^|\/)Dungeon\.java$/.test(f.rel));
    const pick = dungeon.map(f => { const src = safeRead(f, '게임 모듈'); const st = src ? JS.structure(src) : null; return st && st.types.some(t => t.name === 'Dungeon' && t.depth === 0) ? { f, pkg: st.pkg } : null; }).filter(Boolean)
      .sort((a, b) => (/\/src\/main\/java\//.test(b.f.rel) - /\/src\/main\/java\//.test(a.f.rel)) || a.f.rel.length - b.f.rel.length)[0];
    if (!pick) { R.errors.push({ phase: '게임 모듈', reason: 'Dungeon 클래스(Dungeon.java)를 찾지 못했습니다 — Pixel Dungeon 계열 소스가 아닙니다' }); return; }
    const pkgDir = pick.f.rel.slice(0, -'/Dungeon.java'.length), srcDir = pick.pkg ? pkgDir.slice(0, pkgDir.length - pick.pkg.length).replace(/\/$/, '') : pkgDir;
    if (pick.pkg && !pkgDir.endsWith(pick.pkg.split('.').join('/'))) R.warnings.push({ phase: '게임 모듈', file: pick.f.rel, reason: `package ${pick.pkg} 와 폴더 위치가 다름` });
    J = { srcDir, pkgDir, pkg: pick.pkg };
    const mod = R.modules.filter(m => srcDir === m.dir || srcDir.startsWith(m.dir === '.' ? '' : m.dir + '/')).sort((a, b) => b.dir.length - a.dir.length)[0];
    R.source.gameModule = mod ? mod.name : '';
    R.source.javaRoot = pkgDir; R.source.srcDir = srcDir; R.source.pkg = pick.pkg;
    R.source.pkgFamily = /^com\.shatteredpixel\.shatteredpixeldungeon$/.test(pick.pkg) ? 'shattered' : /^com\.watabou\.pixeldungeon/.test(pick.pkg) ? 'watabou' : 'renamed';
  });
  const inGame = f => J && f.rel.startsWith(J.pkgDir + '/');
  const runtimeDir = J ? J.pkgDir + '/pdmaker/' : '\0';
  const gameJava = javaFiles.filter(f => inGame(f) && !f.rel.startsWith(runtimeDir));
  const jrel = f => f.rel.slice(J.pkgDir.length + 1);

  // ---- 소스 구조 분석 (모든 Java)
  const parsed = new Map();   // rel → { st, src }
  phase('소스 분석', () => {
    let ok = 0, partial = 0, failed = 0; const fails = [];
    const roots = new Set();
    for (const f of javaFiles) {
      if (f.rel.startsWith(runtimeDir)) continue;
      const src = safeRead(f, '소스 분석'); if (src == null) { failed++; fails.push({ file: f.rel, reason: '읽지 못함' }); continue; }
      const st = JS.structure(src);
      const top = st.types.filter(t => t.depth === 0);
      const sr = /^(.*?\/src\/[^/]+\/java)\//.exec(f.rel); if (sr) roots.add(sr[1]);
      let prob = st.problems.slice();
      const conflict = /^(<{7}|>{7})( |$)/m.exec(src);
      if (conflict) { st.balanced = false; prob.unshift({ line: src.slice(0, conflict.index).split('\n').length, reason: 'git 병합 충돌 표시(<<<<<<< · >>>>>>>)가 남아 있음 — 이 파일은 컴파일되지 않음' }); }
      if (!top.length && !/package-info\.java$|module-info\.java$/.test(f.rel)) prob.push({ line: 1, reason: '클래스 선언을 찾지 못함' });
      const want = f.rel.split('/').pop().replace(/\.java$/i, '');
      if (top.length && !top.some(t => t.name === want)) prob.push({ line: top[0].line, reason: `파일 이름(${want})과 맨 위 형 이름이 다름` });
      if (st.pkg && sr && f.rel.slice(sr[1].length + 1).split('/').slice(0, -1).join('.') !== st.pkg) prob.push({ line: 1, reason: `package ${st.pkg} 와 폴더 위치가 다름` });
      if (!st.balanced) { failed++; fails.push({ file: f.rel, line: (prob[0] || {}).line, reason: prob.map(p => p.reason).join(' · ') }); }
      else if (prob.length) { partial++; fails.push({ file: f.rel, line: prob[0].line, reason: prob.map(p => p.reason).join(' · '), partial: true }); }
      else ok++;
      if (inGame(f)) parsed.set(f.rel, { st, src });
    }
    R.source.roots = [...roots].sort();
    R.source.java = { found: javaFiles.length - javaFiles.filter(f => f.rel.startsWith(runtimeDir)).length, game: gameJava.length, ok, partial, failed, problems: cap(fails, 200) };
    R.source.kotlin = { found: ktFiles.length, note: ktFiles.length ? 'Kotlin 소스는 파일 목록만 — 구조 · 의미 분석은 지원하지 않음' : '' };
    if (ktFiles.length) R.features.push({ id: 'kotlin', label: 'Kotlin 소스', evidence: `${ktFiles.length}개`, effect: '목록만 표시 (분석기 미지원)' });
    const inst = javaFiles.filter(f => f.rel.startsWith(runtimeDir)).length;
    R.source.pdmakerRuntime = inst;   // 이미 설치된 PDMaker 런타임 (분석에서 뺌)
  });

  // ---- 엔트리 포인트
  phase('엔트리 포인트', () => {
    const games = [], launchers = [];
    for (const [r, { st, src }] of parsed) for (const t of st.types) if (t.depth === 0 && /^(Game|com\.watabou\.noosa\.Game)$/.test(t.ext)) games.push({ cls: t.name, file: r, line: t.line });
    for (const f of javaFiles) { if (inGame(f) || !/desktop|android|ios/i.test(f.rel)) continue; const s = safeRead(f); if (s && /static\s+void\s+main\s*\(\s*String/.test(s)) launchers.push({ file: f.rel }); else if (s && /extends\s+AndroidApplication\b/.test(s)) launchers.push({ file: f.rel, android: true }); }
    R.source.entry = { game: games, launchers };
    if (games.length && !games.some(g => g.cls === 'ShatteredPixelDungeon')) R.features.push({ id: 'game-class', label: '게임 시작 클래스 이름이 다름', evidence: games.map(g => `${g.cls} (${g.file}:${g.line})`).join(', '), effect: '분석 · 편집기는 영향 없음 (런타임은 이 클래스를 고치지 않음)' });
  });

  // ---- 에셋 폴더 · 디코딩
  const assetRoots = [];
  phase('리소스', () => {
    const gm = R.modules.find(m => m.name === R.source.gameModule);
    (gm ? gm.assets : []).concat(...R.modules.filter(m => m !== gm).map(m => m.assets)).forEach(a => { if (!assetRoots.includes(a)) assetRoots.push(a); });
    if (!assetRoots.length) R.errors.push({ phase: '리소스', reason: '에셋 폴더(src/main/assets 또는 sourceSets 의 assets)를 찾지 못함' });
    const resFiles = walk.files.filter(f => assetRoots.some(a => f.rel.startsWith(a + '/')));
    const androidRes = R.modules.flatMap(m => m.res).reduce((n, r) => n + walk.files.filter(f => f.rel.startsWith(r + '/')).length, 0);
    const byType = {}, failed = [], unsupported = [], ignored = [], items = {};
    const kind = f => { const e = ext(f.rel); return BACKUP.test(f.rel) ? 'backup' : IMG.has(e) ? 'image' : AUD.has(e) ? 'audio' : FONT.has(e) ? 'font' : TEXT.has(e) ? 'text' : EDIT_SRC.has(e) ? 'editsrc' : 'other'; };
    const maxDecode = opts.maxDecodeBytes || 64 * 1024 * 1024;
    for (const f of resFiles) {
      const k = kind(f), e = ext(f.rel), T = byType[k] = byType[k] || { found: 0, decoded: 0, header: 0, partial: 0, failed: 0, unsupported: 0, ignored: 0, bytes: 0, exts: {} };
      T.found++; T.bytes += f.size; T.exts[e] = (T.exts[e] || 0) + 1;
      const ar = assetRoots.find(a => f.rel.startsWith(a + '/')), key = f.rel.slice(ar.length + 1);
      if (k === 'backup') { T.ignored++; ignored.push({ file: f.rel, reason: '백업 · 임시 파일 — 게임이 읽지 않음' }); items[key] = { status: 'ignored' }; continue; }
      if (k === 'editsrc') { T.unsupported++; unsupported.push({ file: f.rel, reason: `그림 프로그램 원본(.${e}) — 게임이 읽지 않음. 경로만 보존` }); items[key] = { status: 'unsupported' }; continue; }
      if (f.size > maxDecode) { T.unsupported++; unsupported.push({ file: f.rel, reason: `너무 큰 파일 (${Math.round(f.size / 1048576)}MB) — 디코딩 건너뜀` }); items[key] = { status: 'skipped' }; continue; }
      let r = null;
      try { r = checkMedia(f.rel, fs.readFileSync(LP(f.abs))); } catch (er) { r = { status: 'failed', reason: (er.code || '') + ' 읽지 못함' }; }
      if (!r) { T.unsupported++; unsupported.push({ file: f.rel, reason: `형식을 확인하지 않은 파일(.${e || '확장자 없음'}) — 변환하지 않고 경로만 보존` }); items[key] = { status: 'unsupported' }; continue; }
      items[key] = { status: r.status, w: r.w, h: r.h, size: f.size, file: f.rel };
      if (r.status === 'decoded') T.decoded++; else if (r.status === 'header') T.header++; else if (r.status === 'partial') { T.partial++; failed.push({ file: f.rel, reason: r.reason, partial: true }); }
      else { T.failed++; failed.push({ file: f.rel, reason: r.reason }); }
    }
    // 같은 내용 파일 (크기가 같은 것끼리만 해시)
    const bySize = {}; resFiles.filter(f => ['image', 'audio', 'font'].includes(kind(f))).forEach(f => (bySize[f.size] = bySize[f.size] || []).push(f));
    const dups = [];
    for (const l of Object.values(bySize)) { if (l.length < 2) continue; const byHash = {}; for (const f of l) { try { const hsh = crypto.createHash('sha1').update(fs.readFileSync(LP(f.abs))).digest('hex'); (byHash[hsh] = byHash[hsh] || []).push(f.rel); } catch (_) { /* 위에서 기록 */ } }
      Object.values(byHash).filter(x => x.length > 1).forEach(x => dups.push(x)); }
    R.resources = { roots: assetRoots, total: resFiles.length, androidRes, byType, failed: cap(failed), unsupported: cap(unsupported), ignored: cap(ignored), duplicates: cap(dups, 100), _items: items };
  });
  const asset = key => (R.resources._items || {})[key] || null;
  const assetExists = key => { if (!key) return null; for (const a of assetRoots) { const r = a + '/' + key; if (byRel.has(r)) return { exact: true, rel: r }; const lo = byLower.get(r.toLowerCase()); if (lo) return { exact: false, rel: lo.rel }; } return null; };

  // ---- Assets.java 상수 · 글자 폴더 · 참조 관계
  const readJ = r => { if (!J) return ''; const p = parsed.get(J.pkgDir + '/' + r); return p ? p.src : ''; };
  let AS = { map: {}, consts: [], unresolved: [] };
  phase('에셋 참조', () => {
    if (!J) return;
    const asrc = readJ('Assets.java'); if (!asrc) { R.warnings.push({ phase: '에셋 참조', reason: 'Assets.java 가 없음 — 상수 참조를 확인하지 못함' }); return; }
    AS = JS.assets(asrc);
    const used = new Set(), resolved = [], missing = [], caseBad = [], dynamic = [];
    const mark = (p, from) => { const e = assetExists(p); if (e) { used.add(e.rel); if (!e.exact) caseBad.push({ path: p, actual: e.rel, from }); resolved.push(p); return true; } return false; };
    const msgRoots = [];
    for (const c of AS.consts) {
      const from = `${J.pkgDir}/Assets.java:${c.line}`;
      if (/^Messages\./.test(c.key) || !/\.\w{2,4}$/.test(c.path)) {   // 글자 묶음: messages/actors/actors → actors*.properties
        const dir = c.path.split('/').slice(0, -1).join('/'), base = c.path.split('/').pop();
        const hits = walk.files.filter(f => assetRoots.some(a => f.rel.startsWith(a + '/' + dir + '/')) && new RegExp('/' + base + '(_[\\w]+)?\\.properties$').test(f.rel));
        hits.forEach(f => used.add(f.rel));
        const isBundle = /^[\w\-]+\/([\w\-]+)\/\1$/.test(c.path);   // <폴더>/<묶음>/<묶음> — 클래스 이름(Messages · NewMessages …)과 상관없이
        if (isBundle) { const r0 = c.path.split('/')[0]; if (!msgRoots.includes(r0)) msgRoots.push(r0); }
        if (!hits.length && isBundle) missing.push({ key: 'Assets.' + c.key, path: c.path + '*.properties', from });
        continue;
      }
      if (!mark(c.path, from)) missing.push({ key: 'Assets.' + c.key, path: c.path, from });
    }
    // 소스의 문자열 경로 · 이어 붙여 만드는 경로
    const LIT = /"((?:[\w\-. ]+\/)+[\w\-. ]+\.(?:png|jpg|jpeg|webp|gif|mp3|ogg|wav|ttf|otf|fnt|json|txt))"/g;
    for (const [r, { src }] of parsed) {
      if (/\/Assets\.java$/.test(r)) continue;
      const code = JS.scan(src).code, line = JS.lineIndex(code);
      for (const m of code.matchAll(LIT)) if (!mark(m[1], `${r}:${line(m.index)}`)) missing.push({ key: '(문자열)', path: m[1], from: `${r}:${line(m.index)}` });
      for (const m of code.matchAll(/"((?:[\w\-]+\/)+[\w\-]*)"\s*\+|\+\s*"(\.(?:png|jpg|ogg|mp3|wav))"/g)) dynamic.push({ expr: (m[1] || '…') + ' + …' + (m[2] || ''), prefix: m[1] || '', from: `${r}:${line(m.index)}` });
    }
    const media = Object.entries(R.resources._items || {}).filter(([k, v]) => /^(decoded|header|failed|partial)$/.test(v.status) && /\.(png|jpe?g|webp|gif|mp3|ogg|wav|ttf|otf)$/i.test(k));
    const unref = [], maybe = [];
    for (const [k, v] of media) { if (used.has(v.file)) continue; const pre = dynamic.find(d => d.prefix && k.startsWith(d.prefix)); (pre ? maybe : unref).push(pre ? { file: v.file, reason: '코드가 이어 붙여 만드는 경로일 수 있음: ' + pre.expr + ' (' + pre.from + ')' } : { file: v.file }); }
    R.refs = { constants: AS.consts.length, unresolvedConstants: AS.unresolved, resolved: new Set(resolved).size, missing: cap(missing), caseMismatch: cap(caseBad), dynamic: cap(dynamic, 200),
      unreferenced: cap(unref), maybeDynamic: cap(maybe), note: '"추정 미사용"은 소스의 상수 · 문자열 경로에 없는 파일입니다 — 라이브러리 · 런처가 이름으로 읽는 파일일 수 있어 오류로 보지 않습니다' };
    // 글자 (messages)
    if (!msgRoots.length) msgRoots.push('messages');
    const langs = {}, bundles = {}, other = [];
    for (const f of walk.files) {
      const ar = assetRoots.find(a => f.rel.startsWith(a + '/')); if (!ar) continue;
      const k = f.rel.slice(ar.length + 1), r0 = k.split('/')[0]; if (!msgRoots.includes(r0)) continue;
      const m = /^[^/]+\/([^/]+)\/\1(?:_(\w+))?\.properties$/.exec(k);
      if (m) { (bundles[r0] = bundles[r0] || new Set()).add(m[1]); const L = m[2] || '(기본)'; langs[L] = (langs[L] || 0) + 1; }
      else other.push({ file: f.rel, reason: BACKUP.test(f.rel) ? '백업 파일 — 게임이 읽지 않음' : '글자 묶음 이름 규칙(<묶음>/<묶음>[_언어].properties)이 아님 — 게임이 읽지 않음' });
    }
    R.messages = { roots: msgRoots, overlay: msgRoots.length > 1, bundles: Object.fromEntries(Object.entries(bundles).map(([k, v]) => [k, [...v].sort()])), languages: langs, other: cap(other, 200) };
    if (msgRoots.length > 1) R.features.push({ id: 'messages-overlay', label: '글자 폴더 여러 개 (뒤 폴더가 앞 폴더를 덮어씀)', evidence: msgRoots.join(' + ') + ' (Assets.java Messages)', effect: '이름 · 설명을 모든 폴더에서 읽음 (편집기 gameMsgRoot 와 같은 규칙)' });
  });

  // ---- 클래스 그래프 (상속 관계)
  const types = new Map();   // 이름 → [{ name, file, line, ext, abstract, outer, kind, st, t }]
  phase('클래스 관계', () => {
    for (const [r, p] of parsed) for (const t of p.st.types) { if (t.local) continue; (types.get(t.name) || types.set(t.name, []).get(t.name)).push({ name: t.name, file: r, line: t.line, ext: t.ext.split('.').pop(), abstract: t.abstract, outer: t.outer, kind: t.kind, depth: t.depth, st: p.st, t, src: p.src }); }
    let n = 0; types.forEach(l => { n += l.length; });
    R.source.types = n; R.source.ambiguousNames = [...types.entries()].filter(([, l]) => l.length > 1).map(([k, l]) => ({ name: k, files: l.map(x => x.file) })).slice(0, 100);
  });
  /** 같은 이름이 여럿이면: 같은 파일 → 같은 폴더 → 첫 번째 */
  const resolveType = (name, from) => { const l = types.get(String(name).split('.').pop()); if (!l) return null; if (l.length === 1 || !from) return l[0];
    return l.find(x => x.file === from.file) || l.find(x => x.file.split('/').slice(0, -1).join('/') === from.file.split('/').slice(0, -1).join('/')) || l[0]; };
  const ancestry = d => { const out = []; let cur = d, guard = 0; while (cur && cur.ext && guard++ < 30) { out.push(cur.ext); cur = resolveType(cur.ext, cur); } return out; };
  const isA = (d, base) => d.name !== base && ancestry(d).includes(base);
  const all = () => [].concat(...types.values());
  const ownBody = d => JS.body(d.src, d.st, d.t);
  /** 필드 값: 자기 본문 → 부모 쪽으로 (부모 이름 · 값 · 위치) */
  const inherit = (d, re) => { let cur = d, guard = 0; while (cur && guard++ < 30) { const m = re.exec(ownBody(cur)); if (m) return { v: m[1], from: cur }; cur = cur.ext ? resolveType(cur.ext, cur) : null; } return null; };

  // ---- 아이템 시트 격자
  let SHEET = null;
  phase('아이템 그림 시트', () => {
    const src = readJ('sprites/ItemSpriteSheet.java'); if (!src) { R.warnings.push({ phase: '아이템 그림 시트', reason: 'sprites/ItemSpriteSheet.java 없음' }); return; }
    SHEET = JS.itemSheet(src);
    if (!SHEET) return;
    const ak = (AS.map['Sprites.ITEMS'] || 'sprites/items.png'), a = asset(ak);
    R.itemSheet = { file: J.pkgDir + '/sprites/ItemSpriteSheet.java', image: ak, imageSize: a && a.w ? [a.w, a.h] : null, cell: SHEET.cell, cols: SHEET.cols, origin1: SHEET.origin1, scale: SHEET.scale,
      consts: SHEET.consts, constCount: SHEET.consts ? Object.keys(SHEET.consts).length : 0, unresolved: SHEET.unresolved };
    if (a && a.w && SHEET.scale === 1 && a.w !== SHEET.cell * SHEET.cols) R.warnings.push({ phase: '아이템 그림 시트', file: a.file, reason: `그림 너비 ${a.w}px 가 칸 ${SHEET.cell}px × ${SHEET.cols}칸과 다름 — 번호 → 칸 위치가 어긋날 수 있음` });
    if (SHEET.cell !== 16 || SHEET.cols !== 16) R.features.push({ id: 'item-sheet-geometry', label: `아이템 시트 격자 ${SHEET.cell}px × 한 줄 ${SHEET.cols}칸`, evidence: `${R.itemSheet.file} (SIZE · WIDTH)` + (a && a.w ? `, ${ak} ${a.w}×${a.h}` : ''), effect: '편집기 아이템 그림 번호 · 칸 위치를 이 격자로 계산 (예전: 그림 너비 ÷ 16 으로 추정 → 어긋남)' });
  });
  const sheetIndexOk = idx => { if (!R.itemSheet || !R.itemSheet.imageSize || idx == null) return null; const [w, h] = R.itemSheet.imageSize, c = R.itemSheet.cell * (R.itemSheet.scale || 1), cols = R.itemSheet.cols;
    const x = (idx % cols) * c, y = Math.floor(idx / cols) * c; return x + c <= w && y + c <= h; };

  // ---- 게임 객체
  phase('게임 객체', () => {
    if (!J) return;
    const msgP = {};
    const props = bundle => { if (msgP[bundle]) return msgP[bundle]; const d = {};
      for (const r0 of (R.messages.roots || ['messages'])) for (const L of ['', '_ko']) for (const a of assetRoots) { const f = byRel.get(`${a}/${r0}/${bundle}/${bundle}${L}.properties`); if (!f) continue;
        try { readText(f.abs).split(/\r?\n/).forEach(line => { if (line.startsWith('#')) return; const i = line.indexOf('='); if (i > 0) d[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }); } catch (_) { /* 위에서 기록 */ } }
      return (msgP[bundle] = d); };
    /** 한 언어만 (별칭 · 원문 확인용): L = '' (기본) | '_en' | '_ko' … */
    const propsL = (bundle, L) => { const k = bundle + '|' + L; if (msgP[k]) return msgP[k]; const d = {};
      for (const r0 of (R.messages.roots || ['messages'])) for (const a of assetRoots) { const f = byRel.get(`${a}/${r0}/${bundle}/${bundle}${L}.properties`); if (!f) continue;
        try { readText(f.abs).split(/\r?\n/).forEach(line => { if (line.startsWith('#')) return; const i = line.indexOf('='); if (i > 0) d[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }); } catch (_) { /* 위에서 기록 */ } }
      return (msgP[k] = d); };
    const clean = s => String(s || '').replace(/\\n/g, ' ').replace(/_([^_]+)_/g, '$1').slice(0, 300);
    const where = d => ({ file: d.file, line: d.line });
    const dotted = (d, base) => { const r = d.file.slice(J.pkgDir.length + 1).replace(/\.java$/, ''); if (!r.startsWith(base + '/')) return null; const p = r.slice(base.length + 1).split('/').join('.'); return d.outer && d.depth > 0 ? p.split('.').slice(0, -1).concat(d.file.split('/').pop().replace(/\.java$/, '') + '$' + d.name).join('.').replace(/^\./, '') : p; };
    const O = R.objects;

    // 영웅 직업
    const hc = readJ('actors/hero/HeroClass.java');
    if (hc) {
      const names = JS.enumConstants(hc, 'HeroClass'), sheets = JS.heroSheets(hc, AS.map), frame = JS.heroFrame(readJ('sprites/HeroSprite.java'));
      const hs = readJ('scenes/HeroSelectScene.java') || '', msg = props('actors');
      const hb = /==\s*HeroClass\.(\w+)\s*\)\s*break\s*;/.exec(hs), cutAt = hb ? names.indexOf(hb[1]) : -1, skip = new Set();
      for (const m of JS.scan(hs).code.matchAll(/\bif\s*\(([^;{}]{0,600}?)\)\s*continue\s*;/g)) { const parts = m[1].split('||').map(t => /^\s*\w+\s*==\s*HeroClass\s*\.\s*(\w+)\s*$/.exec(t)); if (parts.every(Boolean)) parts.forEach(c => skip.add(c[1])); }
      const line = JS.lineIndex(hc), en = propsL('actors', '_en'), skins = JS.heroSkins(hc, AS.map);
      O.heroSkins = skins.map(x => Object.assign({}, x, { found: !!(x.sheet && assetExists(x.sheet)) }));
      O.heroes = names.map((n, i) => {
        const sheet = sheets.map[n] || sheets.def || '', a = sheet ? assetExists(sheet) : null, im = a ? asset(a.rel.slice(assetRoots.find(x => a.rel.startsWith(x + '/')).length + 1)) : null;
        const at = hc.search(new RegExp('^\\s*' + n + '\\s*[(,;]', 'm'));
        return { cls: n, name: clean(msg['actors.hero.heroclass.' + n.toLowerCase()]) || '', file: J.pkgDir + '/actors/hero/HeroClass.java', line: at >= 0 ? line(at) : 0,
          sheet, sheetConst: sheets.consts[n] || '', sheetFound: !!a, sheetDecoded: !!(im && /decoded|header/.test(im.status)), sheetSize: im && im.w ? [im.w, im.h] : null,
          conventional: sheet === 'sprites/' + n.toLowerCase() + '.png', hidden: (cutAt > 0 && i >= cutAt) || skip.has(n),
          // 10차: 식별자(게임 enum 상수) · 번역 키 · 표시 이름 · 별칭을 따로 — 이름을 기준 저장소(WARRIOR → 전사)로 바꾸지 않음
          id: n, nameKey: 'actors.hero.heroclass.' + n.toLowerCase(), descKey: 'actors.hero.heroclass.' + n.toLowerCase() + '_desc',
          nameSource: msg['actors.hero.heroclass.' + n.toLowerCase()] ? 'repo' : 'class',
          desc: clean(msg['actors.hero.heroclass.' + n.toLowerCase() + '_desc']),
          aliases: [...new Set([n, clean(en['actors.hero.heroclass.' + n.toLowerCase()]), sheet ? sheet.split('/').pop().replace(/\.\w+$/, '').toUpperCase() : ''].filter(x => x && x !== clean(msg['actors.hero.heroclass.' + n.toLowerCase()])))],
          spriteKind: !sheet ? 'none' : sheets.map[n] ? 'direct' : 'default', skinSheets: skins.length };
      });
      O.heroFrame = frame;
      // 11차: HeroSprite 의 실제 구조 (갑옷 줄 높이 · 줄 안의 칸 · 동작) · 선택 화면 아이콘의 출처
      const hsp = JS.heroSprite(readJ('sprites/HeroSprite.java'));
      if (hsp) { O.heroSprite = Object.assign(hsp, { file: J.pkgDir + '/sprites/HeroSprite.java' }); if (hsp.frame) O.heroFrame = hsp.frame; }
      const icons = JS.heroSelectIcons(hs);
      if (Object.keys(icons).length) O.heroSelectIcons = Object.assign(icons, { file: J.pkgDir + '/scenes/HeroSelectScene.java' });
      if (hsp && hsp.rowH && hsp.frame && hsp.rowH !== hsp.frame[1]) R.features.push({ id: 'hero-tier-rows', label: `영웅 갑옷 줄 ${hsp.rowH}px 안에 ${hsp.frame[0]}×${hsp.frame[1]} 칸`, evidence: hsp.evidence.frame + ' · ' + hsp.evidence.rowH, effect: '영웅 그림을 갑옷 줄 높이와 칸 크기를 따로 잘라 씀 (예전: 줄 높이 = 칸 높이로 가정 → 아래 줄이 섞임)' });
      if (Object.values(icons).some(x => x && x.kind === 'icons')) R.features.push({ id: 'hero-select-icons', label: '영웅 선택 버튼이 얼굴 아이콘(Icons)', evidence: 'HeroSelectScene.HeroBtn: ' + [...new Set(Object.values(icons).filter(x => x && x.kind === 'icons').map(x => 'Icons.' + x.name))].slice(0, 8).join(', '), effect: '시트를 바꾸지 않은 영웅은 게임의 선택 버튼 아이콘을 그대로 씀 (예전: 시트의 직업 갑옷 줄 → 최대 갑옷 모습)' });
      const odd = O.heroes.filter(x => x.sheet && !x.conventional);
      if (odd.length) R.features.push({ id: 'hero-sheet-switch', label: '영웅 시트 파일 이름이 직업 이름과 다름', evidence: odd.slice(0, 6).map(x => `${x.cls} → ${x.sheet}`).join(', ') + (odd.length > 6 ? ` 외 ${odd.length - 6}` : '') + ' (HeroClass.spritesheet())', effect: '영웅 그림을 spritesheet() 의 실제 파일로 연결 (예전: sprites/<직업>.png 로 가정 → 그림 없음)' });
      const hf = O.heroFrame;
      if (hf && (hf[0] !== 12 || hf[1] !== 15)) R.features.push({ id: 'hero-frame', label: `영웅 프레임 ${hf[0]}×${hf[1]}`, evidence: J.pkgDir + '/sprites/HeroSprite.java' + (hsp ? ' — ' + hsp.evidence.frame : ''), effect: '영웅 그림 칸 크기를 이 값으로' });
      if (/Dungeon\.hero\s*\.\s*\w*[Ss]kin|switch\s*\(\s*Dungeon\.hero\./.test((JS.method(hc, /String\s+spritesheet\s*\(\s*\)\s*\{/) || {}).body || '')) R.features.push({ id: 'hero-skin', label: '게임 중 바뀌는 영웅 그림(스킨)', evidence: 'HeroClass.spritesheet() 가 Dungeon.hero 값으로 다른 시트를 고름', effect: '편집기는 기본 시트만 연결 — 스킨 시트는 미지원 (원본 코드 그대로 동작)' });
    }

    // ---- 10차: 층 구성 (Dungeon.newLevel) · 층 연결 (LevelTransition) · 고정 맵 (build) — 몬스터 분류(보스 층에 나오는지)에도 씀
    const terrainMap = JS.terrain(readJ('levels/Terrain.java'));
    const dsrc = readJ('Dungeon.java'), LS = JS.levelSlots(dsrc);
    const levelInfo = {};
    const levelOf = cls => { if (levelInfo[cls] !== undefined) return levelInfo[cls]; const d = resolveType(cls); if (!d) return (levelInfo[cls] = null);
      const lay = JS.staticLayout(d.src, terrainMap), proc = isA(d, 'RegularLevel');
      return (levelInfo[cls] = { cls, file: d.file, line: d.line, parent: d.ext, generator: proc ? 'procedural' : lay.determined ? 'fixed' : lay.partial ? 'fixed-partial' : 'code',
        layout: { w: lay.w, h: lay.h, determined: lay.determined, partial: !!lay.partial, ops: lay.ops, entrance: lay.entrance, exit: lay.exit, unresolved: lay.unresolved.slice(0, 20), buildLine: lay.line, tiles: lay.determined ? lay.tiles : null },
        transitions: JS.levelTransitions(d.src).map(t => Object.assign(t, { file: d.file })),
        spawns: [...new Set([...JS.scan(d.src).bare.matchAll(/\bnew\s+([A-Z]\w*)\s*\(/g)].map(x => x[1]))] }); };
    O.maps = { file: J.pkgDir + '/Dungeon.java', line: LS.line, bossDepths: LS.bossDepths, problems: LS.problems, terrainCount: Object.keys(terrainMap).length,
      slots: LS.slots.map(x => { const fb = x.cls === 'DeadEndLevel' || x.depth === 'default' || x.depth == null || x.branch === 'default';
        const dl = Array.isArray(x.depth) ? x.depth.filter(n => n !== 'default') : [];
        return Object.assign({}, x, { depth: dl, fallback: fb, boss: dl.length > 0 && dl.every(n => LS.bossDepths.includes(n)) }); }),
      levels: {}, terrain: terrainMap };
    for (const sl of O.maps.slots) if (!sl.fallback) { const li = levelOf(sl.cls); if (li) O.maps.levels[sl.cls] = li; else sl.missing = true; }
    // 11차: 새 게임이 시작하는 자리 — Dungeon.init() 의 depth = … · branch = … (원작 1 · 0, ARK 0 · 2 = 로도스 숙소)
    { const im = JS.method(dsrc || '', /\bstatic\s+void\s+init\s*\(\s*\)\s*\{/); const b = im ? JS.scan(im.body).code : '';
      const dm = /(?:^|[^.\w])depth\s*=\s*(\d+)\s*;/m.exec(b), bm = /(?:^|[^.\w])branch\s*=\s*(\d+)\s*;/m.exec(b);
      if (dm) O.maps.start = { depth: +dm[1], branch: bm ? +bm[1] : 0, file: J.pkgDir + '/Dungeon.java', line: im.line + im.code.slice(0, im.code.indexOf('{') + 1 + dm.index).split('\n').length - 1, evidence: `Dungeon.init(): depth = ${dm[1]}` + (bm ? ` · branch = ${bm[1]}` : '') }; }
    O.maps.unusedLevels = all().filter(d => d.kind === 'class' && !d.abstract && isA(d, 'Level') && !O.maps.levels[d.name] && d.name !== 'DeadEndLevel').map(d => ({ cls: d.name, file: d.file, line: d.line }));
    // 보스 층 클래스에서 만드는 몬스터 → 분류 근거
    const bossSpawn = {};
    for (const sl of O.maps.slots) if (sl.boss && O.maps.levels[sl.cls]) for (const n of O.maps.levels[sl.cls].spawns) (bossSpawn[n] = bossSpawn[n] || []).push(`${O.maps.levels[sl.cls].file} (${sl.depth.join(',')}층)`);
    // 원작 SPD 의 층 클래스 (구조 차이를 말할 때의 기준 — 이 밖의 층 클래스 · 자리가 "추가 맵")
    const SPD_LEVELS = { SewerLevel: 'r', SewerBossLevel: 'b', PrisonLevel: 'r', PrisonBossLevel: 'b', CavesLevel: 'r', CavesBossLevel: 'b', CityLevel: 'r', CityBossLevel: 'b', HallsLevel: 'r', HallsBossLevel: 'b', LastLevel: 'l', MiningLevel: 'q', VaultLevel: 'q', DeadEndLevel: 'f', LastShopLevel: 'r' };
    O.maps.slots.forEach(x => { x.extra = !x.fallback && !SPD_LEVELS[x.cls]; });
    const extraSlots = O.maps.slots.filter(x => x.extra);
    if (extraSlots.length) R.features.push({ id: 'extra-maps', label: `원작에 없는 맵 ${extraSlots.length}개 (추가 층 · 갈래 · 던전 밖 · 보스 층 교체)`,
      evidence: extraSlots.map(x => `${x.cls}(${x.depth.join(',')}·${x.branch})`).slice(0, 6).join(', ') + (extraSlots.length > 6 ? ` 외 ${extraSlots.length - 6}` : '') + ` (${J.pkgDir}/Dungeon.java:${LS.line})`,
      effect: '맵 그래프 "게임 저장소의 맵" 에 표시 · 게임 원래 맵 노드로 가져오기 (고정 맵은 타일까지)' });

    /** 클래스 본문에서 메서드 본문 (자기 → 부모) */
    const inheritMethod = (d, re) => { let cur = d, guard = 0; while (cur && guard++ < 30) { const m = JS.method(ownBody(cur), re); if (m) return { m, from: cur }; cur = cur.ext ? resolveType(cur.ext, cur) : null; } return null; };
    /** properties.add(Property.X) — 자기 · 부모의 초기화 블록에서 (메서드 · 조건 안이면 conditional) */
    const propsOf = d => { const out = []; let cur = d, guard = 0;
      while (cur && guard++ < 30) { const b = ownBody(cur), sb = JS.scan(b).bare;
        for (const q of sb.matchAll(/properties\.add\s*\(\s*(?:Char\.)?Property\.(\w+)\s*\)/g)) {
          const ifs = JS.enclosingIfs(sb, q.index); let dd = 0, inMethod = false;
          for (let k = q.index - 1; k >= 0; k--) { const ch = sb[k]; if (ch === '}') dd++; else if (ch === '{') { if (dd) { dd--; continue; } const pre = sb.slice(Math.max(0, k - 200), k); if (/\)\s*(throws[\w\s,.]*)?$/.test(pre) && !/\b(if|for|while|switch|catch|synchronized)\s*\([^()]*(\([^()]*\)[^()]*)*\)\s*$/.test(pre)) { inMethod = true; break; } } }
          out.push({ prop: q[1], from: cur.name, file: cur.file, line: cur.line + b.slice(0, q.index).split('\n').length - 1, conditional: inMethod || ifs.length > 0 }); }
        cur = cur.ext ? resolveType(cur.ext, cur) : null; }
      return out; };
    const STAT = { attack: /Random\.NormalIntRange\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)/, int: /^\s*return\s+(\d+)\s*;\s*$/ };

    const spriteCache = {};
    const spriteOf = (ref, from) => {
      if (!ref) return null;
      const [outer, inner] = ref.split('.'), key = ref; if (spriteCache[key] !== undefined) return spriteCache[key];
      const d = resolveType(inner || outer, from);
      if (!d) return (spriteCache[key] = { problems: ['스프라이트 클래스 ' + ref + ' 를 찾지 못함'] });
      const top = inner ? resolveType(outer, from) : d;
      let sp = JS.sprite(top ? top.src : d.src, AS.map, inner || null);
      // 그림 · 프레임 · 애니메이션이 없으면 부모 스프라이트에서 (MobSprite 까지)
      let cur = top || d, guard = 0;
      while ((!sp.sheet || !sp.frame || !sp.anims.idle) && cur && cur.ext && !/^(MobSprite|CharSprite|MovieClip|Image)$/.test(cur.ext) && guard++ < 6) {
        cur = resolveType(cur.ext, cur); if (!cur) break; const p = JS.sprite(cur.src, AS.map, null);
        if (!sp.sheet && p.sheet) { sp.sheet = p.sheet; sp.tex = p.tex; } if (!sp.frame && p.frame) sp.frame = p.frame;
        for (const k of Object.keys(p.anims)) if (!sp.anims[k]) sp.anims[k] = p.anims[k];
        sp.problems = sp.problems.filter(x => !(x.includes('idle') && sp.anims.idle) && !(x.includes('상수') && sp.sheet));
        sp.inherited = (sp.inherited || []).concat(cur.name);
      }
      sp.cls = d.name; sp.file = d.file; sp.line = d.line;
      if (sp.sheet) { const a = assetExists(sp.sheet); sp.sheetFound = !!a; if (a) { const im = asset(a.rel.slice(assetRoots.find(x => a.rel.startsWith(x + '/')).length + 1)); sp.sheetSize = im && im.w ? [im.w, im.h] : null; sp.sheetDecoded = !!(im && /decoded|header/.test(im.status)); if (!a.exact) sp.problems.push('파일 이름 대소문자가 다름: ' + a.rel); } else sp.problems.push('그림 파일 없음: ' + sp.sheet); }
      if (sp.frame && sp.sheetSize && (sp.frame[0] > sp.sheetSize[0] || sp.frame[1] > sp.sheetSize[1])) sp.problems.push(`프레임 ${sp.frame.join('×')} 가 그림 ${sp.sheetSize.join('×')} 보다 큼`);
      if (sp.frame && sp.sheetSize && sp.anims.idle) { const per = Math.floor(sp.sheetSize[0] / sp.frame[0]) * Math.floor(sp.sheetSize[1] / sp.frame[1]), mx = Math.max(...Object.values(sp.anims).flatMap(a => a.frames)); if (mx >= per) sp.problems.push(`프레임 번호 ${mx} 가 그림의 칸 수(${per})를 넘음`); }
      return (spriteCache[key] = sp);
    };
    const parents = new Set(all().map(d => d.ext).filter(Boolean));   // 다른 클래스가 이어받는 클래스
    const mobs = all().filter(d => d.kind === 'class' && isA(d, 'Mob'));
    const amsg = props('actors');
    O.mobs = mobs.map(d => {
      const ref = dotted(d, 'actors/mobs'), spr = inherit(d, /\bspriteClass\s*=\s*([\w.]+?)\s*\.\s*class\b/)   // ARK: "AirborneSprite .class" (점 앞 공백)
        , sprDyn = spr ? null : inherit(d, /\bspriteClass\s*=\s*([^;\n]{1,80});/), sp = spr ? spriteOf(spr.v, spr.from) : null;
      const hp = inherit(d, /\bHP\s*=\s*HT\s*=\s*(\d+)\s*;/) || inherit(d, /\bHT\s*=\s*(\d+)\s*;/), def = inherit(d, /\bdefenseSkill\s*=\s*(\d+)\s*;/), exp = inherit(d, /\bEXP\s*=\s*(\d+)\s*;/);
      const key = ref ? 'actors.mobs.' + ref.toLowerCase() : '', name = clean(amsg[key + '.name']);
      const reasons = [];
      if (d.abstract) reasons.push('추상 클래스 (게임에 직접 나오지 않음)');
      if (!ref) reasons.push('actors/mobs 밖의 클래스 — PDMaker 런타임은 actors.mobs.<이름> 으로만 만듦');
      const base = !d.abstract && !spr && parents.has(d.name);
      if (base) reasons.push('바탕 클래스 — 다른 몬스터가 이어받고 자기 그림(spriteClass)이 없음');
      else if (!spr) reasons.push(sprDyn ? `그림 클래스를 코드로 고름 (spriteClass = ${sprDyn.v.trim()}) — 편집기는 임시 그림` : 'spriteClass 없음 (부모까지 확인)');
      else if (!sp || !sp.sheet || !sp.frame || !sp.anims || !sp.anims.idle) reasons.push('스프라이트를 읽지 못함: ' + ((sp && sp.problems) || []).join(' · '));
      const spriteOk = !!(sp && sp.sheet && sp.sheetFound && sp.frame && sp.anims && sp.anims.idle);
      if (spr && sp && !spriteOk && !reasons.some(x => x.startsWith('스프라이트'))) reasons.push('스프라이트를 읽지 못함: ' + (sp.problems.length ? sp.problems.join(' · ') : !sp.sheetFound ? '그림 파일 없음 ' + (sp.sheet || '') : '알 수 없음'));
      // 10차: 더 많은 능력치 (코드에 숫자로 적힌 것만 — 계산식이면 비움) · 어디서 왔는지
      const dmg = inheritMethod(d, /int\s+damageRoll\s*\(\s*\)\s*\{/), acc = inheritMethod(d, /int\s+attackSkill\s*\(\s*Char\s+\w+\s*\)\s*\{/), dr = inheritMethod(d, /int\s+drRoll\s*\(\s*\)\s*\{/);
      const dmgM = dmg && /^\s*return\s+Random\.NormalIntRange\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)\s*;\s*$/.exec(dmg.m.body), accM = acc && STAT.int.exec(acc.m.body), drM = dr && /Random\.NormalIntRange\s*\(\s*0\s*,\s*(\d+)\s*\)/.exec(dr.m.body);
      const spd = inherit(d, /\bbaseSpeed\s*=\s*([\d.]+)f?\s*;/), mx = inherit(d, /\bmaxLvl\s*=\s*(-?\d+)\s*;/), loot = inherit(d, /\bloot\s*=\s*(?:new\s+)?([\w.]+?)\s*(?:\.class|\(\s*\))\s*;/), lootCh = inherit(d, /\blootChance\s*=\s*([\d.]+)f?\s*;/);
      const extra = { attackMin: dmgM ? +dmgM[1] : null, attackMax: dmgM ? +dmgM[2] : null, accuracy: accM ? +accM[1] : null, defense: drM ? +drM[1] : null, speed: spd ? +spd.v : null, maxLvl: mx ? +mx.v : null };
      const extraFrom = {}; [['attackMin', dmg], ['attackMax', dmg], ['accuracy', acc], ['defense', dr], ['speed', spd], ['maxLvl', mx]].forEach(([k, v]) => { if (v && extra[k] != null && v.from.name !== d.name) extraFrom[k] = v.from.name; });
      // 분류 근거 — 이름에 Boss 가 있는지만으로 정하지 않음
      const props = propsOf(d), ev = [];
      props.filter(x => x.prop === 'BOSS').forEach(x => ev.push({ kind: x.conditional ? 'boss-property-conditional' : 'boss-property', to: 'boss', weight: x.conditional ? 1 : 3, where: `${x.file}:${x.line}` + (x.from !== d.name ? ` (${x.from} 에서 이어받음)` : '') }));
      props.filter(x => x.prop === 'MINIBOSS').forEach(x => ev.push({ kind: x.conditional ? 'miniboss-property-conditional' : 'miniboss-property', to: 'elite', weight: x.conditional ? 1 : 3, where: `${x.file}:${x.line}` + (x.from !== d.name ? ` (${x.from} 에서 이어받음)` : '') }));
      if (/BossHealthBar\.assignBoss\s*\(\s*this\s*\)/.test(JS.scan(ownBody(d)).bare)) ev.push({ kind: 'boss-health-bar', to: 'boss', weight: 2, where: d.file });
      if (bossSpawn[d.name]) ev.push({ kind: 'boss-level-spawn', to: 'boss', weight: 2, where: bossSpawn[d.name].join(', ') });
      if (/(^|\/)miniboss\//.test(d.file)) ev.push({ kind: 'miniboss-package', to: 'elite', weight: 1, where: d.file });
      if (/boss/i.test(d.name) && !/mini/i.test(d.name)) ev.push({ kind: 'name', to: 'boss', weight: 1, where: d.name });
      const npcCls = isA(d, 'NPC'); if (npcCls) ev.push({ kind: 'npc-class', to: 'npc', weight: 3, where: 'extends NPC' });
      const score = to => ev.filter(e => e.to === to).reduce((a, e) => a + e.weight, 0);
      const sb = score('boss'), se = score('elite');
      let category = npcCls ? 'npc' : 'mob', confidence = npcCls ? 'high' : 'none', review = false;
      if (!npcCls) {
        if (sb >= 3) { category = 'boss'; confidence = 'high'; }
        else if (se >= 3) { category = 'elite'; confidence = 'high'; }
        else if (sb >= 2) { category = 'boss'; confidence = 'medium'; }
        else if (sb > 0 || se > 0) { category = 'review'; confidence = 'low'; review = true; }   // 약한 근거만 — 확인 필요
        if (sb >= 3 && se >= 3 && !props.some(x => x.prop === 'BOSS' && !x.conditional)) { category = 'review'; review = true; confidence = 'low'; }
      }
      const classify = { category, confidence, review, evidence: ev, rule: '보스 속성(Property.BOSS) · 미니보스 속성 · 보스 체력 막대 · 보스 층에서 생성 · 패키지 · 이름 — 약한 근거만 있으면 확인 필요' };
      const nameKey = key + '.name', nameSource = amsg[nameKey] ? 'repo' : 'class';
      return Object.assign(where(d), { cls: ref || d.name, simple: d.name, npc: isA(d, 'NPC'), abstract: d.abstract, base, parent: d.ext, name, desc: clean(amsg[key + '.desc']),
        nameKey, nameSource, displayName: name || d.name, classify, properties: [...new Set(props.map(x => x.prop))], loot: loot ? loot.v : '', lootChance: lootCh ? +lootCh.v : null,
        spriteKind: spr ? (spr.from.name !== d.name ? 'inherited' : 'direct') : sprDyn ? 'dynamic' : 'none', spriteExpr: sprDyn ? sprDyn.v.trim() : '',
        statsExtra: extra, statsExtraFrom: extraFrom,
        sprite: spr ? { ref: spr.v, from: spr.from.name !== d.name ? spr.from.name : '', cls: sp && sp.cls, file: sp && sp.file, sheet: sp && sp.sheet, frame: sp && sp.frame, anims: sp && sp.anims, sheetFound: sp && sp.sheetFound, sheetSize: sp && sp.sheetSize, problems: sp ? sp.problems : [], inherited: sp && sp.inherited } : null,
        stats: { hp: hp ? +hp.v : null, evasion: def ? +def.v : null, exp: exp ? +exp.v : null, from: Object.fromEntries([['hp', hp], ['evasion', def], ['exp', exp]].filter(([, v]) => v && v.from.name !== d.name).map(([k, v]) => [k, v.from.name])) },
        convertible: !d.abstract && !base && !!ref, spriteOk, reasons });
    });
    // 보스 · 엘리트 클래스 안에 든 소환수 (Pompeii.BossSlug extends LavaSlug 등) — 자기 보스 속성이 없으면 일반 몬스터로 (근거: 소환한 쪽)
    for (const m of O.mobs) {
      if (!m.cls.includes('$') || m.classify.category === 'npc' || m.properties.includes('BOSS') || m.properties.includes('MINIBOSS')) continue;
      if (!['review', 'mob'].includes(m.classify.category)) continue;
      const outerCls = m.cls.split('$')[0], outer = O.mobs.find(x => x.cls === outerCls);
      if (!outer || !['boss', 'elite'].includes(outer.classify.category)) continue;
      m.classify.evidence.push({ kind: 'summon-of', to: 'mob', weight: 2, where: `${outer.cls} (${outer.classify.category}) 안에 정의된 클래스 · 보스 속성 없음` });
      m.classify.category = 'mob'; m.classify.confidence = 'medium'; m.classify.review = false; m.classify.summonOf = outer.cls;
    }

    // 아이템
    const items = all().filter(d => d.kind === 'class' && isA(d, 'Item'));
    const imsg = props('items');
    O.items = items.map(d => {
      const ref = dotted(d, 'items'), im = inherit(d, /\bimage\s*=\s*ItemSpriteSheet\.(\w+)/), idx = im && SHEET && SHEET.consts ? SHEET.consts[im.v] : undefined;
      const key = ref ? 'items.' + ref.toLowerCase() : '';
      const base = !d.abstract && !im && parents.has(d.name);
      const reasons = []; if (d.abstract) reasons.push('추상 클래스'); if (base) reasons.push('바탕 클래스 — 다른 아이템이 이어받고 자기 그림 상수가 없음'); if (!ref) reasons.push('items 폴더 밖 (예: 다른 클래스 안의 아이템)'); if (!im) { if (!base) reasons.push('그림 상수 없음 (부모까지)'); } else if (idx === undefined) reasons.push(`ItemSpriteSheet.${im.v} 번호를 계산하지 못함`);
      const inSheet = idx !== undefined ? sheetIndexOk(idx) : null; if (inSheet === false) reasons.push(`그림 번호 ${idx} 가 시트 밖`);
      return Object.assign(where(d), { cls: ref || d.name, simple: d.name, abstract: d.abstract, base, parent: d.ext, name: clean(imsg[key + '.name']), image: im ? im.v : '', imageFrom: im && im.from.name !== d.name ? im.from.name : '', index: idx, inSheet, convertible: !d.abstract && !base && !!ref, reasons });
    });

    // 방 · 층 · 버프 · 식물 · 함정 · blob · 캐릭터 스프라이트
    const group = (base, root) => all().filter(d => d.kind === 'class' && isA(d, base)).map(d => Object.assign(where(d), { cls: (root && dotted(d, root)) || d.name, simple: d.name, abstract: d.abstract, parent: d.ext }));
    O.rooms = group('Room', 'levels/rooms'); O.levels = group('Level', 'levels'); O.buffs = group('Buff', 'actors/buffs'); O.plants = group('Plant', 'plants'); O.traps = group('Trap', 'levels/traps'); O.blobs = group('Blob', 'actors/blobs');
    O.charSprites = group('CharSprite', 'sprites'); O.windows = group('Window', 'windows'); O.scenes = group('PixelScene', 'scenes');
    const tal = readJ('actors/hero/Talent.java'); O.talents = tal ? JS.enumConstants(tal, 'Talent').length : 0;
    const sub = readJ('actors/hero/HeroSubClass.java'); O.subclasses = sub ? JS.enumConstants(sub, 'HeroSubClass').filter(x => x !== 'NONE') : [];

    // ---- 10차: 업적 · 배지 (Badges.java enum Badge — 인자 없는 상수 · 탭/공백 들여쓰기 · 글자 키 두 형식 모두)
    const bsrc = readJ('Badges.java');
    if (bsrc) {
      const mk = Object.assign({}, propsL('misc', '_en'), props('misc')), sk = AS.map['Interfaces.BADGES'] || 'interfaces/badges.png', sa = asset(sk);
      const B = JS.badges(bsrc, { msgs: mk, banner: readJ('effects/BadgeBanner.java'), sheetSize: sa && sa.w ? [sa.w, sa.h] : null });
      O.badges = { file: J.pkgDir + '/Badges.java', sheet: Object.assign({ file: sk, found: !!sa }, B.sheet, { cellFrom: B.sheet.cellFrom === 'BadgeBanner' ? J.pkgDir + '/effects/BadgeBanner.java' : B.sheet.cellFrom }), textKeys: B.textKeys, list: B.list.map(b => Object.assign(b, { name: clean(b.name), desc: clean(b.desc) })) };
      const sheetCols = B.sheet.cols, cell = B.sheet.cell;
      if (O.badges.textKeys === 'single') R.features.push({ id: 'badge-text-single', label: '배지 글자 키가 한 줄 (badges$badge.<이름> — 설명 키 없음)', evidence: 'messages/misc', effect: '배지 이름을 이 키에서 읽음 (예전: .title · .desc 만 찾아 이름이 비었음)' });
      if (sheetCols && sheetCols !== 8) R.features.push({ id: 'badge-sheet-geometry', label: `배지 그림 시트 한 줄 ${sheetCols}칸 (${cell}px)`, evidence: `${sk} ${sa.w}×${sa.h}`, effect: '배지 그림 칸 계산을 시트 너비로 (예전: 8칸으로 고정)' });
      if (/\n {2,}public\s+enum\s+Badge/.test(bsrc) && !/\n\t+public\s+enum\s+Badge/.test(bsrc)) R.features.push({ id: 'badge-indent-spaces', label: 'Badges.java 가 공백 들여쓰기', evidence: O.badges.file, effect: '얻는 조건 줄을 들여쓰기와 상관없이 찾음 (예전: 탭만)' });
    }

    // ---- 10차: 타이틀 화면 (TitleScene.create · BannerSprites)
    const tsrc = readJ('scenes/TitleScene.java');
    if (tsrc) {
      const T = JS.titleScene(tsrc, AS.map), rects = JS.bannerRects(readJ('effects/BannerSprites.java')), smsg = props('scenes');
      const bk = AS.map['Interfaces.BANNERS'] || 'interfaces/banners.png';
      T.file = J.pkgDir + '/scenes/TitleScene.java';
      T.banner = { file: bk, found: !!assetExists(bk), rects };
      T.logoRect = T.logo ? { land: rects[T.logo.land] || null, port: rects[T.logo.port] || null } : null;
      T.glowRect = T.glow ? { land: rects[T.glow.land] || null, port: rects[T.glow.port] || null } : null;
      T.buttons.forEach(b => { b.label = clean(smsg['scenes.titlescene.' + b.key]) || ''; b.labelKey = 'scenes.titlescene.' + b.key; });
      T.musicFound = T.music.map(x => ({ key: x.key, file: x.file, found: !!(x.file && assetExists(x.file)) }));
      O.title = T;
      const STD = ['play', 'support', 'rankings', 'journal', 'news', 'changes', 'settings', 'about'];
      if (JSON.stringify(T.buttons.map(b => b.id)) !== JSON.stringify(STD)) R.features.push({ id: 'title-buttons', label: '타이틀 버튼 구성이 다름', evidence: T.buttons.map(b => b.id).join(', ') + ` (${T.file})`, effect: '타이틀 편집기 · 미리보기가 이 저장소의 버튼 · 줄 배치 · 아이콘을 씀' });
      if (T.logo && T.logo.land === T.logo.port && !/TITLE_/.test(T.logo.land)) R.features.push({ id: 'title-classic-logo', label: `타이틀 로고 ${T.logo.land} (가로 · 세로 같은 그림)`, evidence: `${T.banner.file} ${JSON.stringify(T.logoRect.land)}`, effect: '미리보기 로고 · 빛 글씨 · 횃불 자리를 저장소 값으로' });
    }

    // 층마다 나오는 몬스터 목록 (standardMobRotation 이 있는 클래스 — 원작 MobSpawner)
    const rot = [...parsed.entries()].find(([, p]) => /\bstandardMobRotation\s*\(/.test(p.src) && /ArrayList<\s*Class<\s*\?\s*extends\s+Mob\s*>\s*>\s+standardMobRotation|static\s+[\w<>?,\s]+standardMobRotation\s*\(/.test(p.src));
    O.mobRotation = rot ? { file: rot[0], rel: rot[0].slice(J.pkgDir.length + 1), line: JS.lineIndex(rot[1].src)(rot[1].src.search(/standardMobRotation\s*\(/)) } : null;
    if (O.mobRotation && O.mobRotation.rel !== 'actors/mobs/MobSpawner.java') R.features.push({ id: 'mob-rotation-class', label: '층별 몬스터 목록 클래스 이름이 다름', evidence: `${O.mobRotation.file}:${O.mobRotation.line} (standardMobRotation)`, effect: '맵 편집기 "몬스터 스폰" · 드랍 테이블 "게임 목록 가져오기" 가 이 파일을 읽음 (예전: MobSpawner.java 고정 → 읽지 못함)' });
    // 지역 Level 클래스 (편집기 테마 SEWER … HALLS 가 기대하는 것)
    O.regionLevels = ['SewerLevel', 'PrisonLevel', 'CavesLevel', 'CityLevel', 'HallsLevel'].map(n => ({ cls: n, found: !!types.get(n) }));
    // ---- 10차: 저장소 프로파일 — 폴더 경로가 아니라 게임 구조로 (폴더를 옮겨도 같은 값)
    const entry = ((R.source.entry || {}).game || [])[0];
    const pidSrc = [J.pkg, entry ? entry.cls : '', (O.heroes || []).map(x => x.cls).join(','), (O.maps.slots || []).filter(x => !x.fallback).map(x => x.cls).join(',')].join('|');
    let appName = R.build.appName; const bk2 = byRel.get('build.gradle.pdmaker-backup'); if (bk2) { try { const pb = JS.gradleProps(readText(bk2.abs)); if (pb.appName) appName = pb.appName; } catch (_) { /* 그대로 */ } }
    R.profile = { id: crypto.createHash('sha1').update(pidSrc).digest('hex').slice(0, 12), label: appName || R.name, entry: entry ? entry.cls : '', pkg: J.pkg, heroes: (O.heroes || []).map(x => x.cls) };
    const heroMissing = (O.heroes || []).filter(x => !x.sheetFound).length;
    if (heroMissing) R.warnings.push({ phase: '게임 객체', reason: `영웅 ${heroMissing}명의 그림 파일을 찾지 못함` });
  });

  // ---- 지원 범위 (단계별)
  phase('지원 범위', () => {
    const O = R.objects, st = (s, n, note) => ({ s, n: n == null ? undefined : String(n), note });
    const frac = (a, b) => b ? `${a}/${b}` : '0';
    const lvl = (a, b) => !b ? 'na' : a === b ? 'ok' : a > 0 ? 'partial' : 'no';
    const S = [], add = (area, stages, note) => S.push({ area, stages, note });
    const jv = R.source.java || {}, rs = R.resources.byType || {};
    add('프로젝트 루트 · 모듈', { found: st(R.root ? 'ok' : 'no', R.modules.length + '개 모듈'), read: st(R.build.settings ? 'ok' : 'partial'), structure: st(R.source.gameModule ? 'ok' : 'no', R.source.gameModule || '게임 모듈 없음'), semantic: st(R.source.pkg ? 'ok' : 'no', R.source.pkg), model: st('na'), display: st('ok'), edit: st('na'), runtime: st(R.runtime && R.runtime.ok ? 'partial' : 'no', R.runtime ? (R.runtime.ok ? '설치 가능 (빌드는 미확인)' : '설치 불가') : '미확인') });
    add('Java 소스', { found: st(jv.found ? 'ok' : 'no', jv.found), read: st(lvl(jv.found - 0, jv.found)), structure: st(lvl(jv.ok, jv.found), frac(jv.ok, jv.found), (jv.partial ? `부분 ${jv.partial}` : '') + (jv.failed ? ` 실패 ${jv.failed}` : '')), semantic: st('partial', R.source.types + '개 형', '상속 관계 · 필드 · 상수 (제한된 구조 분석 — 메서드 호출 관계는 추적하지 않음)'), model: st('na'), display: st('partial', '', '"게임 코드의 실제 값" 상자 · 코드 보기'), edit: st('no', '', '원본 코드는 고치지 않음 (PDMaker 코드 칸으로 덮어쓰기만)'), runtime: st('na') });
    if ((R.source.kotlin || {}).found) add('Kotlin 소스', { found: st('ok', R.source.kotlin.found), read: st('ok'), structure: st('no', '', '미지원'), semantic: st('no'), model: st('no'), display: st('no'), edit: st('no'), runtime: st('na') });
    const media = (k, label, decode) => { const T = rs[k]; if (!T) return; const good = T.decoded + T.header; add(label, { found: st('ok', T.found), read: st(lvl(T.found - T.failed - T.unsupported - T.ignored + T.failed, T.found - T.unsupported - T.ignored)), structure: st(lvl(good, T.found - T.unsupported - T.ignored), frac(good, T.found - T.unsupported - T.ignored), decode), semantic: st('partial', '', '참조 관계 — 위 "에셋 참조" 참고'), model: st('ok', '', '게임 경로(game:…)로 연결 · 복사 안 함'), display: st(k === 'audio' || k === 'font' ? 'partial' : 'ok'), edit: st(k === 'image' ? 'ok' : 'partial', '', k === 'image' ? '프로젝트 assets/game/ 에 복사해서 고침 (원본은 그대로)' : '바꿀 파일 지정'), runtime: st('unknown', '', '테스트 플레이 미확인') }, T.unsupported ? `미지원 ${T.unsupported}개` : ''); };
    media('image', '이미지', `PNG 는 끝까지 디코딩 · JPG 는 머리 · 끝 확인`); media('audio', '오디오', '머리(서명 · 프레임) 확인'); media('font', '글꼴', '머리 확인');
    if (rs.text) add('글자 · 데이터 파일', { found: st('ok', rs.text.found), read: st(lvl(rs.text.decoded + rs.text.partial, rs.text.found)), structure: st(lvl(rs.text.decoded, rs.text.found), frac(rs.text.decoded, rs.text.found)), semantic: st(R.messages.roots ? 'ok' : 'partial', (R.messages.roots || []).join(' + ')), model: st('partial', '', '이름 · 설명만 읽음'), display: st('ok'), edit: st('partial', '', '글자 바꾸기(texts.json)로 덮어씀'), runtime: st('unknown') });
    if (rs.editsrc) add('그림 프로그램 원본 (.aseprite 등)', { found: st('ok', rs.editsrc.found), read: st('no'), structure: st('no'), semantic: st('no'), model: st('no', '', '경로만 보존'), display: st('no'), edit: st('no'), runtime: st('na') }, '게임이 읽지 않는 파일');
    const H = O.heroes || [], hs = H.filter(x => x.sheetFound).length;
    add('영웅 직업', { found: st(H.length ? 'ok' : 'no', H.length), read: st(H.length ? 'ok' : 'no'), structure: st(H.length ? 'ok' : 'no', '', 'HeroClass enum'), semantic: st(lvl(hs, H.length), `그림 ${frac(hs, H.length)}`, O.heroFrame ? `프레임 ${O.heroFrame.join('×')}` : '프레임 크기 못 읽음'), model: st(lvl(H.length, H.length), H.length, '영웅 리소스 (baseClass)'), display: st('ok'), edit: st('partial', '', '이름 · 그림 · 시작 아이템 · 특성은 PDMaker 데이터로 덮어씀, 게임 코드 동작은 그대로'), runtime: st('unknown') });
    const M = (O.mobs || []).filter(x => !x.abstract && !x.base), mc = M.filter(x => x.convertible).length, ms = M.filter(x => x.spriteOk).length;
    add('몬스터 · NPC', { found: st(M.length ? 'ok' : 'no', M.length), read: st('ok'), structure: st('ok', '', 'Mob 을 이어받는 클래스 (상속 관계로)'), semantic: st(lvl(ms, M.length), `그림 ${frac(ms, M.length)}`, '스프라이트 · 체력 · 회피 · 경험치'), model: st(lvl(mc, M.length), frac(mc, M.length), '캐릭터 리소스 (game = actors.mobs.<경로>)'), display: st('ok', '', '캐릭터 목록 · "게임 코드의 실제 값"'), edit: st('partial', '', '"게임 동작 그대로"를 끄면 데이터로 편집 · AI 코드 자체는 편집 불가'), runtime: st('unknown') });
    const I = (O.items || []).filter(x => !x.abstract && !x.base), ic = I.filter(x => x.convertible).length, ii = I.filter(x => x.index !== undefined && x.inSheet !== false).length;
    add('아이템', { found: st(I.length ? 'ok' : 'no', I.length), read: st('ok'), structure: st('ok', '', 'Item 을 이어받는 클래스'), semantic: st(lvl(ii, I.length), `그림 번호 ${frac(ii, I.length)}`, R.itemSheet ? `시트 ${R.itemSheet.cell}px × ${R.itemSheet.cols}칸` : '시트 격자 못 읽음'), model: st(lvl(ic, I.length), frac(ic, I.length), '게임 아이템 목록 (spd:<경로>)'), display: st('ok'), edit: st('partial', '', '그림 · 이름 · 등장 금지 등 gameitems.json 으로 덮어씀, 효과 코드는 그대로'), runtime: st('unknown') });
    const RM = (O.rooms || []).filter(x => !x.abstract);
    add('방 (levels/rooms)', { found: st(RM.length ? 'ok' : 'no', RM.length), read: st('ok'), structure: st('ok'), semantic: st('partial', '', '이름 · 분류만 (방 모양은 코드)'), model: st('partial', '', '"게임 기본 방" 목록 — 구성 블럭에서 고를 수 있음'), display: st('ok'), edit: st('no', '', '방 코드는 편집 불가 (방 템플릿으로 새로 만듦)'), runtime: st('unknown') });
    const RL = O.regionLevels || [], rl = RL.filter(x => x.found).length;
    add('층 · 지역 (Level)', { found: st((O.levels || []).length ? 'ok' : 'no', (O.levels || []).length), read: st('ok'), structure: st('ok'), semantic: st(lvl(rl, RL.length), `지역 Level ${frac(rl, RL.length)}`, '방 수 규칙 (standardRooms · specialRooms)'), model: st('partial', '', '테마 5종 (하수도 ~ 전당)만 — 파생작 고유 지역은 원본 참조만'), display: st('ok'), edit: st('partial', '', '구성 블럭 · 직접 그린 층으로 바꿈'), runtime: st('unknown') });
    add('층별 몬스터 목록', { found: st(O.mobRotation ? 'ok' : 'no', O.mobRotation ? O.mobRotation.rel : '없음'), read: st(O.mobRotation ? 'ok' : 'no'), structure: st(O.mobRotation ? 'ok' : 'no'), semantic: st(O.mobRotation ? 'partial' : 'no', '', 'switch(depth) 의 case 만 (코드로 고르는 것은 미지원)'), model: st(O.mobRotation ? 'ok' : 'no', '', '드랍 테이블 "게임 목록 가져오기"'), display: st(O.mobRotation ? 'ok' : 'no'), edit: st('ok', '', '프로젝트 몬스터 목록으로 바꿈'), runtime: st(R.runtime && R.runtime.missing && R.runtime.missing.some(x => /MobSpawner/.test(x)) ? 'no' : 'unknown', '', R.runtime && R.runtime.missing && R.runtime.missing.some(x => /MobSpawner/.test(x)) ? '런타임 연결 줄(MobSpawner.java)을 넣을 곳이 없음' : '') });
    for (const [k, label] of [['buffs', '버프 · 상태 효과'], ['plants', '식물'], ['traps', '함정'], ['blobs', '퍼지는 효과 (Blob)']]) { const L = (O[k] || []).filter(x => !x.abstract); add(label, { found: st(L.length ? 'ok' : 'no', L.length), read: st('ok'), structure: st('ok'), semantic: st('partial', '', '클래스 이름 · 위치 · 부모만'), model: st('no', '', '원본 참조만 보존 (PDMaker 모델 없음)'), display: st('partial', '', '이 보고서에만'), edit: st('no'), runtime: st('na') }); }
    const rf = R.refs || {};
    add('에셋 참조', { found: st('ok', rf.constants + '개 상수'), read: st('ok'), structure: st((rf.unresolvedConstants || []).length ? 'partial' : 'ok', '', (rf.unresolvedConstants || []).length ? `계산 못 한 상수 ${(rf.unresolvedConstants || []).length}` : ''), semantic: st(((rf.missing || {}).total || 0) ? 'partial' : 'ok', `없는 파일 ${(rf.missing || {}).total || 0}`, `추정 미사용 ${(rf.unreferenced || {}).total || 0} · 해석 못 한 동적 경로 ${(rf.dynamic || {}).total || 0}`), model: st('na'), display: st('ok'), edit: st('na'), runtime: st('na') });
    R.support = S;
  });

  // ---- 런타임 설치 가능 여부 (설치기의 compat — 읽기만)
  phase('런타임 호환', () => {
    const inst = require('./runtime-installer.js'); R.runtime = inst.compat(root);
    // 런타임(pdmaker 패키지)이 이름으로 부르는 게임 클래스가 이 저장소에 있는지 — 없으면 설치해도 컴파일되지 않음 (예: ARK 에는 MobSpawner 가 없음)
    //   클래스 파일이 있는지만 봄 (메서드 · 필드 모양까지는 확인하지 않음 → 있어도 "미확인")
    const rdir = path.join(opts.runtimeSrc || path.join(__dirname, '..', 'runtime', 'src'), 'com', 'shatteredpixel', 'shatteredpixeldungeon', 'pdmaker');
    const cc = R.runtime.classCheck = { checked: false, refs: 0, missing: [] };
    if (!J || !isDir(rdir)) { cc.reason = !J ? '게임 모듈을 찾지 못함' : '런타임 소스 폴더가 없음: ' + rdir; return; }
    const uses = new Map();
    for (const f of fs.readdirSync(rdir).filter(x => /\.java$/.test(x)).sort()) {
      let src; try { src = readText(path.join(rdir, f)); } catch (_) { continue; }
      const bare = JS.scan(src).bare, line = JS.lineIndex(src);
      for (const m of bare.matchAll(/\bcom\.shatteredpixel\.shatteredpixeldungeon\.((?:[a-z_]\w*\.)*[A-Z]\w*)/g)) {
        if (/^pdmaker\./.test(m[1])) continue;
        const l = uses.get(m[1]) || uses.set(m[1], []).get(m[1]); if (l.length < 5) l.push(`${f}:${line(m.index)}`);
      }
    }
    cc.checked = true; cc.refs = uses.size;
    // 모든 모듈의 소스 루트에서 (services 같은 다른 모듈의 클래스도 core 가 의존하면 쓸 수 있음)
    const pkgPath = J.pkg.split('.').join('/') + '/', known = new Set();
    for (const f of javaFiles) { const i = f.rel.indexOf('/java/' + pkgPath); if (i >= 0) known.add(f.rel.slice(i + 6 + pkgPath.length, -5)); }
    for (const [cls, at] of uses) if (!known.has(cls.split('.').join('/'))) cc.missing.push({ cls, uses: at });
    // 11차: 설치기는 런타임 사본을 이 저장소 구조에 맞춰 적응한 뒤 설치함 (게임 본체 이름 · 옮겨진 클래스 · 기능 조건 블록) → 적응하고도 남는 것만 "없는 클래스"
    //       (원래 이름으로 없던 것은 raw 에 — 적응으로 해결된 것은 adapted)
    if (cc.missing.length) { try { const left = inst.missingClasses(root, opts.runtimeSrc || path.join(__dirname, '..', 'runtime', 'src')); const keep = new Set(left.map(m => m.cls));
      cc.raw = cc.missing; cc.adapted = cc.missing.filter(m => !keep.has(m.cls)).map(m => m.cls); cc.missing = left.map(m => ({ cls: m.cls, uses: (m.uses || []).slice(0, 5) })); } catch (e) { cc.adaptError = String(e && e.message || e); } }
    if (cc.missing.length) R.warnings.push({ phase: '런타임 호환', reason: `PDMaker 런타임이 쓰는 게임 클래스 ${cc.missing.length}개가 이 저장소에 없습니다 (${cc.missing.slice(0, 4).map(x => x.cls).join(', ')}${cc.missing.length > 4 ? ' …' : ''}) — 런타임을 설치하면 컴파일되지 않습니다` });
  });
  // 지원 범위의 런타임 줄을 compat 결과로 다시
  if (R.support[0] && R.runtime) {
    const cm = ((R.runtime.classCheck || {}).missing || []).length;
    R.support[0].stages.runtime = !R.runtime.ok ? { s: 'no', n: '설치 불가', note: R.runtime.problems.join(' · ') }
      : cm ? { s: 'no', n: `없는 클래스 ${cm}`, note: '런타임이 이름으로 부르는 게임 클래스가 없어 컴파일되지 않음 (보고서 "게임 런타임 설치" 참고)' }
      : { s: R.runtime.missing.length ? 'partial' : 'ok', n: `연결 줄 ${R.runtime.missing.length ? '누락 ' + R.runtime.missing.length : '모두'}`, note: '설치 가능 여부 · 클래스 이름만 확인 — 빌드 · 실행은 테스트 플레이에서 확인' + (((R.runtime.classCheck || {}).adapted || []).length ? ` · 이 저장소 구조에 맞춰 적응한 클래스 ${R.runtime.classCheck.adapted.length}개 (${R.runtime.classCheck.adapted.slice(0, 4).join(', ')}${R.runtime.classCheck.adapted.length > 4 ? ' …' : ''})` : '') };
  }

  // 11차: 저장소 탐색 화면용 색인 — 모든 파일(경로 · 종류 · 크기 · 그림 크기) · 클래스(파일 · 줄 · 부모 · 종류). 읽기만, 값은 원본 그대로
  try {
    const items = R.resources._items || {}, byFile = {};
    Object.values(items).forEach(v => { if (v && v.file) byFile[v.file] = v; });
    const kindOf = rel => { const e = ext(rel); return /\.java$/i.test(rel) ? 'java' : /\.kts?$/i.test(rel) ? 'kotlin' : /\.gradle(\.kts)?$/i.test(rel) ? 'gradle' : /\.properties$/i.test(rel) ? 'props' : IMG.has(e) ? 'image' : AUD.has(e) ? 'audio' : FONT.has(e) ? 'font' : TEXT.has(e) ? 'text' : 'other'; };
    R.index = {
      files: walk.files.map(f => { const v = byFile[f.rel], o = { p: f.rel, k: kindOf(f.rel), b: f.size }; if (v && v.w) { o.w = v.w; o.h = v.h; } if (v && v.status && v.status !== 'decoded') o.s = v.status; return o; }),
      classes: all().filter(d => !d.local).map(d => ({ n: d.name, f: d.file, l: d.line, p: d.ext || '', k: d.kind || 'class', a: !!d.abstract, o: d.outer || '' })).sort((a, b) => a.n.localeCompare(b.n) || a.f.localeCompare(b.f)),
    };
  } catch (e) { R.warnings.push({ phase: '색인', reason: '파일 · 클래스 색인을 만들지 못함: ' + e.message }); }
  delete R.resources._items;
  R.durationMs = Date.now() - t0;
  R.summary = summarize(R);
  if (cacheFile) { try { fs.mkdirSync(opts.cacheDir, { recursive: true }); const tmp = cacheFile + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(R)); fs.renameSync(tmp, cacheFile); R.cacheFile = cacheFile; } catch (e) { R.warnings.push({ phase: '캐시', reason: '캐시를 쓰지 못함: ' + e.message }); } }
  return R;
}

/** 표에 쓰는 숫자 요약 */
function summarize(R) {
  const O = R.objects || {}, jv = (R.source || {}).java || {}, by = (R.resources || {}).byType || {};
  const res = Object.values(by).reduce((a, t) => ({ found: a.found + t.found, ok: a.ok + t.decoded + t.header, failed: a.failed + t.failed + t.partial, unsupported: a.unsupported + t.unsupported + t.ignored }), { found: 0, ok: 0, failed: 0, unsupported: 0 });
  const conc = l => (l || []).filter(x => !x.abstract && !x.base);
  const objs = ['heroes', 'mobs', 'items', 'rooms', 'levels', 'buffs', 'plants', 'traps', 'blobs'];
  const recognized = objs.reduce((n, k) => n + (k === 'heroes' ? (O.heroes || []).length : conc(O[k]).length), 0);
  const converted = (O.heroes || []).length + conc(O.mobs).filter(x => x.convertible).length + conc(O.items).filter(x => x.convertible).length + conc(O.rooms).length;
  const unsupported = conc(O.mobs).filter(x => !x.convertible).length + conc(O.items).filter(x => !x.convertible).length + ['buffs', 'plants', 'traps', 'blobs'].reduce((n, k) => n + conc(O[k]).length, 0) + res.unsupported + (((R.source || {}).kotlin || {}).found || 0);
  return { sourceFound: jv.found || 0, sourceOk: jv.ok || 0, sourcePartial: jv.partial || 0, sourceFailed: jv.failed || 0, resourcesFound: res.found, resourcesDecoded: res.ok, resourcesFailed: res.failed, resourcesUnsupported: res.unsupported,
    heroes: (O.heroes || []).length, mobs: conc(O.mobs).length, mobsWithSprite: conc(O.mobs).filter(x => x.spriteOk).length, items: conc(O.items).length, itemsWithImage: conc(O.items).filter(x => x.index !== undefined && x.inSheet !== false).length,
    rooms: conc(O.rooms).length, recognized, converted, unsupported, errors: (R.errors || []).length, warnings: (R.warnings || []).length, features: (R.features || []).map(f => f.id) };
}

module.exports = { analyze, findRoot, safeWalk, checkMedia, decodePng, summarize, VERSION };

// main.js 가 worker 스레드로 부를 때
const WT = (() => { try { return require('worker_threads'); } catch (_) { return null; } })();
if (WT && !WT.isMainThread && WT.workerData && WT.workerData.pdmAnalyze) {
  try { WT.parentPort.postMessage({ value: analyze(WT.workerData.pdmAnalyze.dir, WT.workerData.pdmAnalyze) }); }
  catch (e) { WT.parentPort.postMessage({ error: String(e && e.message || e) }); }
}

if (require.main === module && (!WT || WT.isMainThread)) {   // worker 스레드에서는 require.main 도 이 파일 — 명령줄 처리를 하지 않음
  const args = process.argv.slice(2), dir = args.find(a => !a.startsWith('--'));
  if (!dir) { console.log('사용법: node editor/repo-analyzer.js <폴더> [--json]'); process.exit(1); }
  const r = analyze(dir, { force: args.includes('--force') });
  if (args.includes('--json')) console.log(JSON.stringify(r, null, 1));
  else { console.log(`${r.name} — ${r.root || '(루트 없음)'} (${r.durationMs}ms)`); console.log(JSON.stringify(r.summary, null, 1)); r.errors.slice(0, 20).forEach(e => console.log('✗', e.phase, e.file || '', e.reason)); r.features.forEach(f => console.log('•', f.label, '—', f.evidence)); }
}
