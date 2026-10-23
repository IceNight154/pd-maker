// ================================================================
//  repo-features — 12차: 서로 다른 Pixel Dungeon 저장소의 "기능" 찾기 · 가져오기 (읽기 전용 분석 + 프로젝트에 담을 꾸러미 만들기)
//
//   1) 찾기 (catalog): 가져올 저장소(source)를 지금 게임 저장소(target)와 클래스 · 멤버 단위로 비교
//      · package  — target 에 없는 패키지 (예: BA 의 items.weapon.melee.gun = 총기) · 그 안의 클래스 전부
//      · class    — target 에 있는 패키지에 새로 생긴 클래스 (예: actors.buffs.Xxx)
//      · member   — 두 저장소에 다 있는 클래스의 함수 · 필드 · 안쪽 클래스가 다름 (예: ARK 의 Hero.handle(int) = 계단 자동 이동)
//      이름은 SPD 패키지 기준으로 맞춰 비교 (패키지 이름을 바꾼 파생작도 — runtime-adapt.scanClasses)
//   2) 필요한 것 (closure): 고른 기능이 쓰는 것을 따라감
//      · source 에만 있는 클래스 → 통째로 · 두 저장소에 다 있는 클래스의 source 에만 있는 멤버(이름이 쓰임) → 그 멤버만
//      · 새로 들어가는 안쪽 클래스 · 함수를 부르는(다루는) source 의 바뀐 멤버도 (예: 새 행동 HeroAction.Descend 를 처리하는 Hero.act())
//      · 리소스: 쓰는 Assets 상수의 파일 · 글자: 들어가는 클래스의 번역 키 (messages/*.properties)
//   3) 꾸러미 (pack): 프로젝트 features/<id>/feature.json + files/ (원본 저장소가 없어도 다시 설치할 수 있게 내용을 담음)
//      설치기(runtime-installer.applyFeatures)가 테스트 플레이 · 내보내기 때 게임 저장소에 넣고, 제거하면 원래 파일로 되돌림
//   원본 저장소들은 읽기만 함
// ================================================================
const fs = require('fs');
const path = require('path');
const JS = require('./renderer/js/javasrc.js');
const adapt = require('./runtime-adapt.js');

const GAME_PKG = adapt.GAME_PKG;
const FORMAT = 1;

// ---------------------------------------------------------------- 멤버 나누기
const normType = t => String(t || '').replace(/@\w+(\([^)]*\))?\s*/g, '').replace(/\bfinal\s+/g, '').replace(/<[^<>]*(<[^<>]*>[^<>]*)*>/g, '').replace(/\s+/g, '').replace(/\.\.\./, '[]').replace(/^.*\./, '');
const squash = s => String(s || '').replace(/\s+/g, ' ').trim();

/** 형 하나의 멤버 [{ kind: method|field|type|init|constants, key, name, start, end, head }] — start · end 는 src 원문 위치 (앞 주석 · 어노테이션 포함) */
function members(src, st, t) {
  const b = st._s.bare, out = [];
  if (!t || t.close < 0) return out;
  let i = t.open + 1, segStart = i, depth = 0;
  const inner = st.types.filter(o => o !== t && !o.local && o.outer === t.name && o.depth === t.depth + 1 && o.start > t.open && o.close < t.close);
  // enum: 상수 목록 (첫 ; 까지)
  if (t.kind === 'enum') {
    let d = 0, k = i;
    for (; k < t.close; k++) { const c = b[k]; if ('({['.includes(c)) d++; else if (')}]'.includes(c)) d--; else if (c === ';' && d === 0) break; }
    // 상수 하나하나 (top-level 쉼표로 나눔) — 예: Talent 의 새 특성 상수만 가져오기
    const end = k < t.close ? k : t.close; let d2 = 0, cs = i;
    const pushC = (a, z) => { const raw = b.slice(a, z), nm = /^\s*(?:@\w+(?:\([^)]*\))?\s*)*([A-Za-z_$][\w$]*)/.exec(raw); if (nm && raw.trim()) out.push({ kind: 'const', key: 'const ' + nm[1], name: nm[1], start: a, end: z, head: '' }); };
    for (let q = i; q < end; q++) { const c = b[q]; if ('({['.includes(c)) d2++; else if (')}]'.includes(c)) d2--; else if (c === ',' && d2 === 0) { pushC(cs, q); cs = q + 1; } }
    pushC(cs, end);
    out.constEnd = end;
    if (k >= t.close) return out;
    i = segStart = k + 1;
  }
  const push = (s, e) => {
    const raw = b.slice(s, e), lead = raw.length - raw.trimStart().length, hs = s + lead;
    if (!raw.trim()) return;
    const it = inner.find(o => o.start >= s && o.start < e);
    if (it) { out.push({ kind: 'type', key: 'type ' + it.name, name: it.name, start: s, end: e, head: '' }); return; }
    const brace = b.indexOf('{', hs), semi = b.indexOf(';', hs);
    const headEnd = brace >= 0 && brace < e && (semi < 0 || brace < semi) ? brace : Math.min(e, semi < 0 ? e : semi);
    const head = squash(b.slice(hs, headEnd).replace(/@\w+(\([^)]*\))?/g, ' '));
    if (!head || /^static$/.test(head)) { out.push({ kind: 'init', key: '#init:' + hashOf(squash(raw)), name: '#init', start: s, end: e, head }); return; }   // 초기화 블록: 내용으로 구별
    const mm = /([A-Za-z_$][\w$]*)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*(?:throws\s+[\w.,\s]+)?$/.exec(head);
    if (mm && !/=/.test(head.slice(0, mm.index))) {
      const params = mm[2].trim() ? JS.splitArgs(mm[2]).map(p => normType(p.trim().replace(/\s+[\w$]+$/, ''))) : [];
      out.push({ kind: 'method', key: mm[1] + '(' + params.join(',') + ')', name: mm[1], start: s, end: e, head });
      return;
    }
    const fm = /([A-Za-z_$][\w$]*)\s*(?:=|$|,)/.exec(head.replace(/<[^<>]*>/g, ''));
    const names = [...head.replace(/=[^,]*(,|$)/g, '$1').matchAll(/([A-Za-z_$][\w$]*)\s*(?:,|$)/g)].map(x => x[1]);
    out.push({ kind: 'field', key: 'field ' + (names.join(',') || (fm && fm[1]) || head), name: names[names.length - 1] || (fm && fm[1]) || head, names, start: s, end: e, head });
  };
  for (; i < t.close; i++) {
    const c = b[i];
    if (c === '{' || c === '(' || c === '[') depth++;
    else if (c === '}' || c === ')' || c === ']') { depth--; if (depth === 0 && c === '}') { // 블록 끝 — 뒤의 ; (익명 클래스 필드 초기화) 는 그 필드에
        let k = i + 1; while (k < t.close && /\s/.test(b[k])) k++;
        if (b[k] === ';' || b[k] === ',' || b[k] === ')' || b[k] === '.') continue;
        const hd = b.slice(segStart, i); if (/=\s*new\b|=\s*\{|=\s*[^;{]*->/.test(hd.slice(0, hd.indexOf('{') < 0 ? hd.length : hd.indexOf('{')))) continue;   // 필드 초기화 식 안의 블록
        push(segStart, i + 1); segStart = i + 1; } }
    else if (c === ';' && depth === 0) { push(segStart, i + 1); segStart = i + 1; }
  }
  return out;
}

/** 파일 하나 → { pkg, imports[], types: [{ name, fq, kind, members[] }], src, st } (바깥 형과 안쪽 형 — 안쪽은 "Outer.Inner") */
function parseFile(src) {
  const st = JS.structure(src);
  const types = [];
  const fqOf = t => { const chain = [t.name]; let o = t; while (o.outer) { o = st.types.find(x => x.name === o.outer && x.depth === o.depth - 1 && x.start < o.start && x.close > o.start); if (!o) break; chain.unshift(o.name); } return chain.join('.'); };
  for (const t of st.types) if (!t.local) types.push({ name: t.name, path: fqOf(t), kind: t.kind, t, members: members(src, st, t) });
  return { pkg: st.pkg, imports: st.imports, types, src, st };
}

const hashOf = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16); };
/** 비교용 본문 (주석 없애고 빈칸 하나로 · 게임 패키지 이름은 SPD 이름으로) */
function normCode(bareSlice, gpkg) { let s = squash(bareSlice); if (gpkg && gpkg !== GAME_PKG) s = s.split(gpkg).join(GAME_PKG); return s; }

// ---------------------------------------------------------------- 저장소 색인
const indexCache = new Map();
/** 저장소 색인 → { repo, gamePkg, javaDir, classes: Map<SPD 기준 FQN, { file, rel, pkg }>, parse(fqn), env } (파일은 처음 쓸 때 읽음) */
function index(repo) {
  const key = path.resolve(repo);
  const hit = indexCache.get(key); if (hit && Date.now() - hit.at < 60000) return hit.v;
  const env = adapt.environment(repo), gpkg = env.gamePkg, jd = adapt.gameJavaDir(repo);
  const classes = new Map();
  for (const [fq, file] of env.classes) {
    if (!fq.startsWith(GAME_PKG + '.') || fq.startsWith(GAME_PKG + '.pdmaker.')) continue;
    const rel = path.relative(jd, file).split(path.sep).join('/');
    if (rel.startsWith('..')) continue;
    classes.set(fq, { file, rel, pkg: fq.slice(0, fq.lastIndexOf('.')) });
  }
  const parsed = new Map();
  const parse = fq => { if (!parsed.has(fq)) { const c = classes.get(fq); let p = null; if (c) { try { p = parseFile(fs.readFileSync(c.file, 'utf8')); } catch (_) { p = null; } } parsed.set(fq, p); } return parsed.get(fq); };
  const packages = new Set([...classes.values()].map(c => c.pkg));
  const v = { repo: key, gamePkg: gpkg, javaDir: jd, classes, packages, parse, env, label: label(repo) };
  indexCache.set(key, { at: Date.now(), v });
  return v;
}
function label(repo) {
  let name = path.basename(path.resolve(repo));
  try { const g = fs.readFileSync(path.join(repo, 'build.gradle'), 'utf8'); const m = /appName\s*=\s*['"]([^'"]+)['"]/.exec(g); if (m) name = m[1]; } catch (_) { /* 이름 없음 */ }
  return name;
}

/** 클래스의 멤버 표 (key → { kind, name, code(원문), norm(비교용), type(형 경로) }) */
function memberTable(ix, fq) {
  const p = ix.parse(fq); if (!p) return null;
  const simple = fq.slice(fq.lastIndexOf('.') + 1);
  const out = new Map();
  for (const ty of p.types) {
    if (ty.path.split('.')[0] !== simple) continue;
    const pre = ty.path === simple ? '' : ty.path.slice(simple.length + 1) + '.';
    let prevKey = '';
    for (const m of ty.members) {
      if (m.kind === 'type') continue;   // 안쪽 형은 그 형의 멤버로 따로 (아래) — 형 자체는 "type" 항목으로
      out.set(pre + m.key, { kind: m.kind, name: m.name, names: m.names, owner: ty.path, code: p.src.slice(m.start, m.end), norm: normCode(p.st._s.bare.slice(m.start, m.end), ix.gamePkg), start: m.start, end: m.end, prev: prevKey });
      prevKey = pre + m.key;
    }
    if (ty.path !== simple) { const head = squash(p.st._s.bare.slice(ty.t.start, ty.t.open)); out.set('type ' + ty.path.slice(simple.length + 1), { kind: 'type', name: ty.name, owner: ty.path, head, code: '', norm: head }); }
  }
  return out;
}

// ---------------------------------------------------------------- 1) 찾기
/** source 저장소의 기능 목록 (target 과 비교) → { source, target, features[], summary }
 *  features: { id, kind: package|class|member, label, cls?, key?, classes[], size(줄), detail } */
function catalog(sourceRepo, targetRepo, opts) {
  opts = opts || {};
  const S = index(sourceRepo), T = index(targetRepo);
  const features = [];
  const lines = s => String(s || '').split('\n').length;
  // 새 클래스 → 패키지 묶음 (target 에 없는 가장 위 패키지) · 아니면 클래스 하나
  const groups = new Map();
  for (const [fq, c] of S.classes) {
    if (T.classes.has(fq)) continue;
    let root = c.pkg;
    if (!T.packages.has(root)) { const parts = root.split('.'); for (let i = GAME_PKG.split('.').length + 1; i <= parts.length; i++) { const p = parts.slice(0, i).join('.'); if (!T.packages.has(p) && !hasSubPkg(T, p)) { root = p; break; } } }
    const key = T.packages.has(root) ? 'class:' + fq : 'package:' + root;
    (groups.get(key) || groups.set(key, []).get(key)).push(fq);
  }
  for (const [key, list] of groups) {
    const kind = key.split(':')[0], name = key.slice(kind.length + 1);
    let size = 0; for (const fq of list) { try { size += lines(fs.readFileSync(S.classes.get(fq).file, 'utf8')); } catch (_) { /* 못 읽음 */ } }
    features.push({ id: key, kind, label: kind === 'package' ? rel(name) + ' (새 패키지 · 클래스 ' + list.length + '개)' : rel(name) + ' (새 클래스)', pkg: kind === 'package' ? name : undefined, classes: list.sort(), size });
  }
  // 바뀐 클래스 → 멤버
  if (opts.members !== false) {
    for (const [fq] of S.classes) {
      if (!T.classes.has(fq)) continue;
      const a = memberTable(S, fq), b = memberTable(T, fq); if (!a || !b) continue;
      for (const [k, m] of a) {
        if (m.kind === 'init') continue;
        const o = b.get(k);
        if (o && o.norm === m.norm) continue;
        features.push({ id: 'member:' + fq + '#' + k, kind: 'member', cls: fq, key: k, change: o ? 'changed' : 'added', memberKind: m.kind,
          label: rel(fq) + (k.startsWith('type ') ? ' · 안쪽 형 ' + k.slice(5) : ' · ' + k.replace(/^field /, '필드 ')) + (o ? ' (바뀜)' : ' (새로)'), classes: [fq], size: lines(m.code) });
      }
    }
  }
  features.sort((x, y) => (x.kind === y.kind ? 0 : x.kind === 'package' ? -1 : y.kind === 'package' ? 1 : x.kind === 'class' ? -1 : 1) || x.id.localeCompare(y.id));
  return { format: FORMAT, source: { repo: S.repo, label: S.label, gamePkg: S.gamePkg }, target: { repo: T.repo, label: T.label, gamePkg: T.gamePkg },
    summary: { packages: features.filter(f => f.kind === 'package').length, classes: features.filter(f => f.kind === 'class').length, members: features.filter(f => f.kind === 'member').length }, features };
}
const hasSubPkg = (ix, p) => { for (const q of ix.packages) if (q.startsWith(p + '.')) return true; return false; };
const rel = fq => fq.startsWith(GAME_PKG + '.') ? fq.slice(GAME_PKG.length + 1) : fq;

// ---------------------------------------------------------------- 2) 필요한 것
/** 코드 조각이 가리키는 source 의 게임 클래스 (FQN) — 패키지째 이름 · import · 같은 패키지 · 안쪽 형 이름 */
function refsOf(S, code, fileImports, ownPkg) {
  const bare = JS.scan(code).code.replace(/"(?:\\.|[^"\\\n])*"/g, '""');
  const norm = S.gamePkg !== GAME_PKG ? bare.split(S.gamePkg).join(GAME_PKG) : bare;
  const out = new Set();
  for (const m of norm.matchAll(/\bcom\.shatteredpixel\.shatteredpixeldungeon\.((?:[a-z_]\w*\.)*[A-Z]\w*)/g)) { const fq = GAME_PKG + '.' + m[1]; if (S.classes.has(fq)) out.add(fq); }
  const simple = new Map();
  for (const im of fileImports || []) {
    const n = S.gamePkg !== GAME_PKG ? im.split(S.gamePkg).join(GAME_PKG) : im;
    if (n.endsWith('.*')) { const p = n.slice(0, -2); for (const [fq, c] of S.classes) if (c.pkg === p) simple.set(fq.slice(p.length + 1), fq); }
    else if (S.classes.has(n)) simple.set(n.slice(n.lastIndexOf('.') + 1), n);
  }
  if (ownPkg) for (const [fq, c] of S.classes) if (c.pkg === ownPkg && !simple.has(fq.slice(ownPkg.length + 1))) simple.set(fq.slice(ownPkg.length + 1), fq);
  const words = new Set(norm.match(/\b[A-Z][\w$]*\b/g) || []);
  for (const w of words) if (simple.has(w)) out.add(simple.get(w));
  return out;
}
/** 생성자 후보: 코드에 new Name(…) 이 그 인자 수로 있을 때만 (이름만 나온다고 생성자가 필요한 것은 아님) */
function ctorUsed(code, name, key) {
  const want = (/\(([^)]*)\)$/.exec(key) || [, ''])[1]; const n = want ? want.split(',').length : 0;
  const c = JS.scan(code).code;
  for (const m of c.matchAll(new RegExp('\\bnew\\s+(?:[\\w.]+\\.)?' + name + '\\s*\\(', 'g'))) { const open = m.index + m[0].length - 1, close = JS.matchClose(c, open); if (close < 0) continue; const inner = c.slice(open + 1, close).trim(); if ((inner ? JS.splitArgs(inner).length : 0) === n) return true; }
  // super(…) · this(…) · enum 상수 NAME(…)
  for (const m of c.matchAll(/(?:\b(?:super|this)|^\s*(?:@\w+\s*)*[A-Z_][A-Z0-9_]*)\s*\(/g)) { const open = m.index + m[0].length - 1, close = JS.matchClose(c, open); if (close < 0) continue; const inner = c.slice(open + 1, close).trim(); if ((inner ? JS.splitArgs(inner).length : 0) === n) return true; }
  return false;
}
/** 안쪽 형의 멤버는 그 안쪽 형 이름을 코드가 쓸 때만 (흔한 이름 buff · icon … 이 겹치는 것 막기) */
const nestedSeen = (m, fq, ids) => { const simple = fq.slice(fq.lastIndexOf('.') + 1); if (!m.owner || m.owner === simple) return true; return m.owner.split('.').slice(1).some(n => ids.has(n)); };
const isCtor = (m, k) => m.kind === 'method' && /^(?:[\w]+\.)*([A-Z]\w*)\(/.test(k) && m.name === (m.owner || '').split('.').pop();
const visOnly = n => String(n).replace(/\b(public|protected|private)\s+/g, '');
const idents = code => new Set(JS.scan(code).code.replace(/"(?:\\.|[^"\\\n])*"/g, '""').match(/\b[A-Za-z_$][\w$]*\b/g) || []);

/** 고른 기능들이 필요한 것 → { classes: [fq] (통째로 넣을 새 클래스), members: [{ cls, key, change }] (바꾸거나 넣을 멤버),
 *   assets: [rel], messages: [{ file, key, value }], missing: [{ what, why }], callers: [{ cls, key }] } */
function closure(sourceRepo, targetRepo, ids) {
  const S = index(sourceRepo), T = index(targetRepo);
  const cat = catalog(sourceRepo, targetRepo);
  const byId = new Map(cat.features.map(f => [f.id, f]));
  const wantClasses = new Set(), wantMembers = new Map(), why = new Map(), missing = [];
  const tables = new Map(); const tab = (ix, fq) => { const k = ix.repo + '|' + fq; if (!tables.has(k)) tables.set(k, memberTable(ix, fq)); return tables.get(k); };
  const queue = [];
  const addClass = (fq, because) => { if (wantClasses.has(fq) || T.classes.has(fq)) return; wantClasses.add(fq); why.set(fq, because); queue.push({ type: 'class', fq }); };
  const addMember = (fq, key, because) => {
    const id = fq + '#' + key; if (wantMembers.has(id)) return;
    const a = tab(S, fq), b = tab(T, fq); if (!a || !a.has(key)) return;
    const o = b && b.get(key); if (o && o.norm === a.get(key).norm) return;
    wantMembers.set(id, { cls: fq, key, change: o ? 'changed' : 'added' }); why.set(id, because); queue.push({ type: 'member', fq, key });
    // 안쪽 형의 멤버를 넣으면 그 안쪽 형도 (없으면)
    const owner = a.get(key).owner, simple = fq.slice(fq.lastIndexOf('.') + 1);
    if (owner !== simple) { const tk = 'type ' + owner.slice(simple.length + 1); if (a.has(tk) && !(b && b.has(tk))) addMember(fq, tk, id); }
  };
  for (const id of ids) {
    const f = byId.get(id);
    if (!f) { missing.push({ what: id, why: '이 저장소에서 찾지 못한 기능' }); continue; }
    if (f.kind === 'member') addMember(f.cls, f.key, 'selected');
    else f.classes.forEach(fq => addClass(fq, 'selected'));
  }
  // 새로 들어가는 안쪽 형 → 그것을 다루는 source 의 바뀐 멤버 (호출 · instanceof — 예: HeroAction.Descend → Hero.act())
  // source 에만 있는 멤버 이름 → 그 멤버들 (이름으로 부르지 않은 클래스의 멤버도: Dungeon.level.breakWall(…) 의 Level#breakWall)
  let onlyByName = null;
  const onlyNames = () => {
    if (onlyByName) return onlyByName;
    onlyByName = new Map();
    for (const [fq] of S.classes) {
      if (!T.classes.has(fq)) continue;
      const a = tab(S, fq), b = tab(T, fq); if (!a || !b) continue;
      for (const [k, m] of a) { if (b.has(k) || m.kind === 'init' || m.kind === 'type') continue; for (const n of (m.names || [m.name])) (onlyByName.get(n) || onlyByName.set(n, []).get(n)).push({ fq, k }); }
    }
    return onlyByName;
  };
  // target 의 모든 멤버 이름 (이미 있는 이름으로 부른 것은 target 의 것으로 풀림 — 예: .image(…) · .update())
  let tNames = null;
  const targetNames = () => { if (tNames) return tNames; tNames = new Set(); for (const [fq] of T.classes) { const b = tab(T, fq); if (b) for (const [, m] of b) (m.names || [m.name]).forEach(n => tNames.add(n)); } return tNames; };
  const dotted = code => new Set([...JS.scan(code).code.replace(/"(?:\\.|[^"\\\n])*"/g, '""').matchAll(/\.\s*([A-Za-z_$][\w$]*)\b/g)].map(m => m[1]));
  const newTypeNames = () => [...wantMembers.values()].filter(m => m.key.startsWith('type ') && m.change === 'added').map(m => m.key.slice(5).split('.').pop());
  const handled = new Set();
  while (queue.length) {
    const q = queue.shift();
    let code, imports, pkg;
    if (q.type === 'class') { const p = S.parse(q.fq); if (!p) continue; code = p.src; imports = p.imports; pkg = S.classes.get(q.fq).pkg; }
    else { const p = S.parse(q.fq); const m = tab(S, q.fq).get(q.key); imports = p.imports; pkg = S.classes.get(q.fq).pkg;
      if (m.kind !== 'type') code = m.code;
      else { const w = wantMembers.get(q.fq + '#' + q.key), ty = p.types.find(t => t.path === m.owner); code = w && w.change === 'added' && ty ? p.src.slice(ty.t.start, ty.t.close + 1) : ''; } }   // 새 안쪽 형: 본문 전체가 들어감
    if (!code) continue;
    const ids0 = idents(code);
    for (const r of refsOf(S, code, imports, pkg)) {
      if (!T.classes.has(r)) { addClass(r, q.type === 'class' ? q.fq : q.fq + '#' + q.key); continue; }
      // 두 저장소에 다 있는 클래스: source 에만 있는 멤버 중 이 코드가 이름을 쓰는 것
      const a = tab(S, r), b = tab(T, r); if (!a || !b) continue;
      for (const [k, m] of a) {
        // 접근 범위만 넓힌 필드 · 함수 (private → protected 등) 를 이 코드가 쓰면 source 의 선언으로 (동작은 같음)
        if (b.has(k) && m.kind !== 'type' && b.get(k).norm !== m.norm && ids0.has(m.name) && visOnly(m.norm) === visOnly(b.get(k).norm)) { addMember(r, k, (q.type === 'class' ? q.fq : q.fq + '#' + q.key) + ' (접근 범위)'); continue; }
        if (b.has(k) || m.kind === 'init' || m.kind === 'constants') continue;
        const nm = m.kind === 'type' ? k.slice(5).split('.').pop() : m.name;
        if (isCtor(m, k)) { if (ctorUsed(code, m.name, k)) addMember(r, k, q.type === 'class' ? q.fq : q.fq + '#' + q.key); continue; }
        if (m.kind !== 'type' && !nestedSeen(m, r, ids0)) continue;
        if ((m.names || [nm]).some(n => ids0.has(n))) addMember(r, k, q.type === 'class' ? q.fq : q.fq + '#' + q.key);
      }
    }
    // 점으로 부른 이름 (x.name / x.name(…)) 이 source 에만 있는 멤버면 — 그 이름이 하나뿐이거나 이 코드가 그 클래스 · 그 패키지를 아는 경우
    for (const n of dotted(code)) {
      if (targetNames().has(n)) continue;
      const cands = (onlyNames().get(n) || []).filter(c => !wantMembers.has(c.fq + '#' + c.k));
      if (!cands.length) continue;
      const pick = cands.length <= 3 ? cands : cands.filter(c => code.includes(c.fq.slice(c.fq.lastIndexOf('.') + 1)));
      pick.forEach(c => addMember(c.fq, c.k, (q.type === 'class' ? q.fq : q.fq + '#' + q.key) + ' (.' + n + ')'));
    }
    // 새 필드 · 상수를 쓰는 초기화 블록 (예: ItemSpriteSheet 의 static { assignItemRect(새 상수, …) })
    if (q.type === 'member') {
      const a = tab(S, q.fq), b = tab(T, q.fq), m0 = a.get(q.key);
      if (m0 && (m0.kind === 'field' || m0.kind === 'const')) for (const [k, m] of a) { if (m.kind !== 'init' || (b && b.has(k))) continue; if ((m0.names || [m0.name]).some(n => new RegExp('\\b' + n + '\\b').test(m.code))) addMember(q.fq, k, q.fq + '#' + q.key); }
    }
    // 같은 클래스 안 (이 멤버가 쓰는 source 에만 있는 멤버)
    if (q.type === 'member') {
      const a = tab(S, q.fq), b = tab(T, q.fq);
      for (const [k, m] of a) { if (b && b.has(k)) continue; if (m.kind === 'init' || m.kind === 'constants') continue; const nm = m.kind === 'type' ? k.slice(5).split('.').pop() : m.name; if (isCtor(m, k)) { if (ctorUsed(code, m.name, k)) addMember(q.fq, k, q.fq + '#' + q.key); continue; } if (m.kind !== 'type' && !nestedSeen(m, q.fq, ids0) && !(q.key.startsWith('type ') || (tab(S, q.fq).get(q.key) || {}).owner === m.owner)) continue; if ((m.names || [nm]).some(n => ids0.has(n))) addMember(q.fq, k, q.fq + '#' + q.key); }
    }
    // 새 안쪽 형을 다루는 바뀐 멤버
    for (const tn of newTypeNames()) {
      if (handled.has(tn)) continue; handled.add(tn);
      for (const [fq] of S.classes) {
        if (!T.classes.has(fq)) continue;
        const a = tab(S, fq), b = tab(T, fq); if (!a || !b) continue;
        for (const [k, m] of a) { if (m.kind !== 'method') continue; const o = b.get(k); if (o && o.norm === m.norm) continue; if (new RegExp('\\binstanceof\\s+(?:\\w+\\.)*' + tn + '\\b|\\(\\s*(?:\\w+\\.)*' + tn + '\\s*\\)').test(m.code)) addMember(fq, k, 'handles ' + tn); }
      }
    }
  }
  // 이름 겹침: 새로 넣는 안쪽 형이 target 에서 그 파일이 이미 보는 클래스 이름(같은 패키지 · import)과 같으면 그 파일의 원래 코드가 다른 형을 가리키게 됨
  const conflicts = [];
  for (const m of wantMembers.values()) {
    if (!m.key.startsWith('type ') || m.change !== 'added') continue;
    const nm = m.key.slice(5).split('.').pop(), tp = T.parse(m.cls); if (!tp) continue;
    const pkg = T.classes.get(m.cls).pkg, seen = [...T.classes.keys()].some(fq => fq === pkg + '.' + nm) || tp.imports.some(i => i.endsWith('.' + nm));
    if (seen) conflicts.push({ what: rel(m.cls) + '.' + m.key.slice(5), why: `${rel(m.cls)} 이(가) 이미 쓰는 클래스 ${nm} 과(와) 이름이 같음 — 넣으면 그 파일의 원래 코드가 바뀐 형을 가리킴` });
  }
  // 리소스 · 글자
  const assetsMap = (() => { try { const f = S.classes.get(GAME_PKG + '.Assets'); return f ? JS.assets(fs.readFileSync(f.file, 'utf8')).map : {}; } catch (_) { return {}; } })();
  const tAssetsMap = (() => { try { const f = T.classes.get(GAME_PKG + '.Assets'); return f ? JS.assets(fs.readFileSync(f.file, 'utf8')).map : {}; } catch (_) { return {}; } })();
  const codes = [...[...wantClasses].map(fq => (S.parse(fq) || {}).src || ''), ...[...wantMembers.values()].map(m => (tab(S, m.cls).get(m.key) || {}).code || '')];
  const assetKeys = new Set(), assetFiles = new Set(), constsNeeded = new Set();
  for (const c of codes) for (const m of JS.scan(c).code.matchAll(/\bAssets\s*\.\s*(\w+)\s*\.\s*(\w+)/g)) assetKeys.add(m[1] + '.' + m[2]);
  for (const k of assetKeys) {
    const p = assetsMap[k]; if (!p) continue;
    if (!tAssetsMap[k]) constsNeeded.add(k);
    const f = findAsset(S.repo, p); if (f && !findAsset(T.repo, p)) assetFiles.add(f.rel);
  }
  const messages = messagesFor(S, T, [...wantClasses], [...wantMembers.values()]);
  return { source: { repo: S.repo, label: S.label }, target: { repo: T.repo, label: T.label }, selected: ids,
    classes: [...wantClasses].sort(), members: [...wantMembers.values()], why: Object.fromEntries(why), conflicts, assets: [...assetFiles].sort(), assetConsts: [...constsNeeded].sort(), messages, missing,
    lines: codes.reduce((n, c) => n + c.split('\n').length, 0) };
}

/** 리소스 파일 찾기 (모듈마다 src/main/assets) → { rel: assets 기준, file } */
function findAsset(repo, p) {
  for (const d of ['core/src/main/assets', 'android/src/main/assets', 'desktop/src/main/assets', 'android/assets']) { const f = path.join(repo, d, p); if (fs.existsSync(f)) return { rel: p, file: f, root: d }; }
  return null;
}

/** 들어가는 클래스 · 멤버의 번역 키 (messages/<영역>/<영역>[_lang].properties) — target 에 없는 키만 */
function messagesFor(S, T, classes, members) {
  const out = [];
  const keysWanted = new Set();
  const pref = fq => rel(fq).toLowerCase();
  for (const fq of classes) keysWanted.add(pref(fq) + '.');
  // 안쪽 형: Messages 는 $ 를 . 로 (actors.buffs.buff.xxx) · enum 상수: <클래스>.<상수 소문자>. (특성 · 직업 이름 등)
  for (const m of members) {
    if (m.key.startsWith('type ')) keysWanted.add(pref(m.cls) + '.' + m.key.slice(5).toLowerCase() + '.');
    const c = /(?:^|\.)const (\w+)$/.exec(m.key); if (c) { const own = m.key.slice(0, m.key.length - c[0].length).replace(/^\./, ''); keysWanted.add(pref(m.cls) + (own ? '.' + own.toLowerCase() : '') + '.' + c[1].toLowerCase() + '.'); keysWanted.add(pref(m.cls) + (own ? '.' + own.toLowerCase() : '') + '.' + c[1].toLowerCase() + '_'); }
  }
  if (!keysWanted.size) return out;
  // 글자 폴더: assets 아래 <영역>/<영역>*.properties 가 있는 폴더 (원작 messages · BA 처럼 new_messages 를 더 쓰는 모드도) — target 은 messages (없으면 첫 폴더)
  const msgRoots = repo => { const base = path.join(repo, 'core/src/main/assets'); let es = []; try { es = fs.readdirSync(base, { withFileTypes: true }); } catch (_) { return []; }
    return es.filter(e => e.isDirectory() && fs.existsSync(path.join(base, e.name, 'items')) && fs.readdirSync(path.join(base, e.name, 'items')).some(f => f.endsWith('.properties'))).map(e => e.name).sort((x, y) => (y === 'messages') - (x === 'messages')); };
  const tRoots = msgRoots(T.repo), tRoot = tRoots[0] || 'messages';
  const tHas = new Map();   // 'area/file' → 키 모음 (target 의 모든 글자 폴더)
  const tKeys = f => { if (!tHas.has(f)) { const m = new Set(); for (const r of tRoots) for (const k of readProps(path.join(T.repo, 'core/src/main/assets', r, f)).keys()) m.add(k); tHas.set(f, m); } return tHas.get(f); };
  const seen = new Set();
  for (const root of msgRoots(S.repo)) {
    const r = path.join(S.repo, 'core/src/main/assets', root);
    for (const area of fs.readdirSync(r)) {
      const ad = path.join(r, area); if (!fs.statSync(ad).isDirectory()) continue;
      for (const f of fs.readdirSync(ad)) {
        if (!f.endsWith('.properties')) continue;
        const af = area + '/' + f, src = readProps(path.join(ad, f)), have = tKeys(af);
        for (const [k, v] of src) { if (have.has(k) || seen.has(af + '|' + k)) continue; for (const w of keysWanted) if (k.startsWith(w)) { seen.add(af + '|' + k); out.push({ file: tRoot + '/' + af, key: k, value: v }); break; } }
      }
    }
  }
  return out;
}
function readProps(f) {
  const m = new Map(); let s = ''; try { s = fs.readFileSync(f, 'utf8'); } catch (_) { return m; }
  const lines = s.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    let l = lines[i]; if (/^\s*[#!]/.test(l) || !l.trim()) continue;
    while (/(^|[^\\])(\\\\)*\\$/.test(l) && i + 1 < lines.length) l = l.slice(0, -1) + lines[++i].replace(/^\s+/, '');
    const k = /^\s*((?:\\.|[^=:\s\\])+)\s*[=:\s]\s*(.*)$/.exec(l); if (k) m.set(k[1], k[2]);
  }
  return m;
}

// ---------------------------------------------------------------- 3) 꾸러미
/** 프로젝트에 담을 기능 꾸러미 → { feature, files: { 'files/<rel>': 내용 } } — 이름은 SPD 패키지 기준 (설치할 때 그 게임 패키지로) */
function pack(sourceRepo, targetRepo, ids, meta) {
  meta = meta || {};
  const S = index(sourceRepo), T = index(targetRepo);
  const cl = closure(sourceRepo, targetRepo, ids);
  const toSpd = s => S.gamePkg !== GAME_PKG ? s.split(S.gamePkg).join(GAME_PKG) : s;
  const files = {};
  const classFiles = cl.classes.map(fq => { const c = S.classes.get(fq), p = S.parse(fq); files['files/java/' + c.rel] = toSpd(p.src); return { cls: fq, rel: c.rel }; });
  const members = cl.members.map(m => {
    const a = memberTable(S, m.cls), x = a.get(m.key), p = S.parse(m.cls);
    const b = memberTable(T, m.cls), o = b && b.get(m.key);
    // 안쪽 형 자체(머리만) — 넣을 때는 그 형의 멤버를 모두 담은 원문으로
    let code = x.code;
    if (x.kind === 'type') { const ty = p.types.find(t => t.path === x.owner); code = ty ? p.src.slice(ty.t.start, ty.t.close + 1) : ''; const lead = /[^\n]*$/.exec(p.src.slice(0, ty ? ty.t.start : 0))[0]; code = lead.replace(/\S.*$/, '') + code; }
    // 새 멤버는 source 의 바로 앞 멤버 뒤에 (순서가 중요: 정적 필드의 앞쪽 참조 · 초기화 블록)
    return { cls: m.cls, key: m.key, kind: x.kind, owner: x.owner, change: m.change, code: toSpd(code), base: o ? hashOf(o.norm) : '', imports: p.imports.map(toSpd), after: x.prev || '', order: x.start || 0 };
  });
  // 안쪽 형을 통째로 넣으면 그 형 안의 멤버 항목은 뺌
  const wholeTypes = new Set(members.filter(m => m.kind === 'type' && m.change === 'added').map(m => m.cls + '|' + m.key.slice(5)));
  const mem2 = members.filter(m => !(m.kind !== 'type' && [...wholeTypes].some(w => { const [c, t] = w.split('|'); return m.cls === c && (m.owner === c.slice(c.lastIndexOf('.') + 1) + '.' + t || m.owner.startsWith(c.slice(c.lastIndexOf('.') + 1) + '.' + t + '.')); })));
  for (const a of cl.assets) { const f = findAsset(S.repo, a); if (f) files['files/assets/' + a] = fs.readFileSync(f.file); }
  const assetConsts = cl.assetConsts.map(k => { const [inner, name] = k.split('.'); const src = (S.parse(GAME_PKG + '.Assets') || {}).src || ''; const m = new RegExp('static\\s+final\\s+String\\s+' + name + '\\s*=\\s*[^;]+;').exec(src); return { inner, name, line: m ? m[0] : '' }; }).filter(x => x.line);
  const id = meta.id || slug(S.label + '-' + (ids[0] || 'feature'));
  const feature = { format: FORMAT, id, label: meta.label || (ids.length === 1 ? (catalogLabel(sourceRepo, targetRepo, ids[0]) || ids[0]) : ids.length + '개 기능'), enabled: true,
    source: { label: S.label, repo: path.basename(S.repo), gamePkg: S.gamePkg }, target: { label: T.label, repo: path.basename(T.repo) }, selected: ids, created: meta.created || '',
    classes: classFiles, members: mem2, assets: cl.assets, assetConsts, messages: cl.messages, missing: cl.missing, conflicts: cl.conflicts, lines: cl.lines,
    replaced: mem2.filter(m => m.change === 'changed').map(m => rel(m.cls) + '#' + m.key) };
  return { feature, files };
}
function catalogLabel(s, t, id) { const f = catalog(s, t).features.find(x => x.id === id); return f ? f.label : ''; }
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'feature';

/** 꾸러미를 프로젝트에 씀: features/<id>/feature.json + files/… → 폴더 경로 */
function savePack(projectDir, p) {
  const dir = path.join(projectDir, 'features', p.feature.id);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const [r, data] of Object.entries(p.files)) { const f = path.join(dir, ...r.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); }
  fs.writeFileSync(path.join(dir, 'feature.json'), JSON.stringify(p.feature, null, 2) + '\n', 'utf8');
  return dir;
}
/** 프로젝트의 기능 꾸러미 목록 */
function listPacks(projectDir) {
  const d = path.join(projectDir || '', 'features'); if (!projectDir || !fs.existsSync(d)) return [];
  return fs.readdirSync(d).map(id => { try { const f = JSON.parse(fs.readFileSync(path.join(d, id, 'feature.json'), 'utf8')); f.dir = path.join(d, id); return f; } catch (_) { return null; } }).filter(Boolean);
}

// ---------------------------------------------------------------- 게임 저장소에 넣기 · 빼기 (설치기가 부름)
const FMARK = '.pdmaker-feature-backup';
/** 꾸러미들을 게임 저장소에 넣음 → { applied: [id], files: [넣은 파일], patched: [고친 파일], problems: [] } — 고친 파일은 처음 한 번 원본을 FMARK 로 둠 */
function applyPacks(repo, packs, log = () => {}) {
  const T = index(repo); indexCache.delete(path.resolve(repo));
  const gpkg = adapt.gamePackage(repo), jd = adapt.gameJavaDir(repo), toG = s => adapt.toGamePkg(s, gpkg);
  const res = { applied: [], files: [], patched: [], assets: [], problems: [] };
  const backup = f => { if (!fs.existsSync(f + FMARK)) { fs.copyFileSync(f, f + FMARK); res.patched.push(path.relative(repo, f)); } };
  const assetsRoot = path.join(repo, 'core/src/main/assets');
  const added = new Set(packs.filter(p => p.enabled !== false).flatMap(p => (p.classes || []).map(c => c.cls)));
  for (const pk of packs) {
    if (pk.enabled === false) continue;
    const pdir = pk.dir;
    // 새 클래스 파일
    for (const c of pk.classes || []) {
      const to = path.join(jd, ...c.rel.split('/'));
      if (fs.existsSync(to) && !fs.existsSync(to + '.pdmaker-feature-new')) { res.problems.push(`${pk.id}: ${c.rel} 이(가) 이미 있음 — 넣지 않음`); continue; }
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.writeFileSync(to, toG(fs.readFileSync(path.join(pdir, 'files', 'java', ...c.rel.split('/')), 'utf8')), 'utf8');
      fs.writeFileSync(to + '.pdmaker-feature-new', pk.id, 'utf8');   // 표시: 제거할 때 지움
      res.files.push(path.relative(repo, to));
    }
    // 멤버 (바꾸기 · 넣기)
    const byCls = new Map(); for (const m of pk.members || []) (byCls.get(m.cls) || byCls.set(m.cls, []).get(m.cls)).push(m);
    for (const [cls, list] of byCls) {
      list.sort((x, y) => (x.order || 0) - (y.order || 0));
      const c = T.classes.get(cls); if (!c) { res.problems.push(`${pk.id}: ${rel(cls)} 이(가) 이 게임에 없음`); continue; }
      let src = fs.readFileSync(c.file, 'utf8');
      for (const m of list) {
        const r = patchMember(src, cls, m, toG);
        if (!r.ok) { res.problems.push(`${pk.id}: ${rel(cls)} · ${m.key} — ${r.why}`); continue; }
        src = r.src;
      }
      // import: 이 게임에 있는 것(또는 이번에 넣은 클래스) · 게임 밖 라이브러리만 (예: ARK 의 com.watabou.noosa.ui.Button 은 SPD-classes 에 없음 → 넣지 않음)
      const okImport = im => { const n = im.split(gpkg).join(GAME_PKG).replace(/\.\*$/, ''); if (!/^com\.(shatteredpixel|watabou)\./.test(n) && !n.startsWith(GAME_PKG)) return true;
        return T.env.classes.has(n) || T.env.packages.has(n) || added.has(n) || [...added].some(a => a.startsWith(n + '.')) || T.env.classes.has(n.slice(0, n.lastIndexOf('.'))); };
      src = addImports(src, list.flatMap(m => m.imports || []).map(toG).filter(okImport), list.map(m => toG(m.code)).join('\n'));
      backup(c.file); fs.writeFileSync(c.file, src, 'utf8');
    }
    // Assets 상수
    if ((pk.assetConsts || []).length) {
      const af = T.classes.get(GAME_PKG + '.Assets');
      if (af) { let src = fs.readFileSync(af.file, 'utf8'); let changed = false;
        for (const a of pk.assetConsts) { if (new RegExp('\\b' + a.name + '\\s*=').test(src)) continue; const p = parseFile(src), ty = p.types.find(t => t.name === a.inner && t.path === 'Assets.' + a.inner); if (!ty) { res.problems.push(`${pk.id}: Assets.${a.inner} 없음 — ${a.name}`); continue; } src = src.slice(0, ty.t.close) + '\t\t' + a.line + '\n\t' + src.slice(ty.t.close); changed = true; }
        if (changed) { backup(af.file); fs.writeFileSync(af.file, src, 'utf8'); } }
    }
    // 리소스 파일
    for (const a of pk.assets || []) {
      const to = path.join(assetsRoot, ...a.split('/')); if (fs.existsSync(to)) continue;
      fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(path.join(pdir, 'files', 'assets', ...a.split('/')), to); fs.writeFileSync(to + '.pdmaker-feature-new', pk.id, 'utf8'); res.assets.push(path.relative(repo, to));
    }
    // 글자
    const byFile = new Map(); for (const m of pk.messages || []) (byFile.get(m.file) || byFile.set(m.file, []).get(m.file)).push(m);
    for (const [f, list] of byFile) {
      const fp = path.join(assetsRoot, ...f.split('/'));
      if (!fs.existsSync(fp)) { if (/_\w+\.properties$/.test(f)) continue; fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, '', 'utf8'); fs.writeFileSync(fp + '.pdmaker-feature-new', pk.id, 'utf8'); }
      else backup(fp);
      const have = readProps(fp); const add = list.filter(m => !have.has(m.key));
      if (add.length) fs.appendFileSync(fp, '\n# PDMaker 기능: ' + pk.id + '\n' + add.map(m => m.key + '=' + m.value).join('\n') + '\n', 'utf8');
    }
    res.applied.push(pk.id); log(`기능 넣음: ${pk.label} (${pk.id})`);
  }
  return res;
}
/** 넣은 기능을 모두 뺌 (원본 파일 그대로) */
function removePacks(repo, log = () => {}) {
  let n = 0;
  const walk = d => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const e of es) { const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!/^(\.git|build|\.gradle|node_modules)$/.test(e.name)) walk(p); continue; }
      if (e.name.endsWith(FMARK)) { const orig = p.slice(0, -FMARK.length); fs.copyFileSync(p, orig); fs.rmSync(p); const hb = orig + '.pdmaker-backup'; if (fs.existsSync(hb)) fs.rmSync(hb); n++; }
      else if (e.name.endsWith('.pdmaker-feature-new')) { const orig = p.slice(0, -'.pdmaker-feature-new'.length); if (fs.existsSync(orig)) fs.rmSync(orig); fs.rmSync(p); n++; } } };
  walk(repo);
  // 빈 폴더 정리 (넣은 패키지)
  const prune = d => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return false; } let empty = true; for (const e of es) { if (e.isDirectory()) { if (!prune(path.join(d, e.name))) empty = false; } else empty = false; } return empty; };
  const jd = adapt.gameJavaDir(repo); const sweep = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) if (e.isDirectory()) { const p = path.join(d, e.name); sweep(p); if (!fs.readdirSync(p).length) fs.rmdirSync(p); } };
  if (n && fs.existsSync(jd)) { try { sweep(jd); } catch (_) { /* 무시 */ } }
  if (n) log(`넣은 기능 빼기: 파일 ${n}개를 원래대로`);
  indexCache.delete(path.resolve(repo));
  return n;
}

/** 클래스 원문에서 멤버 하나 바꾸기 · 넣기 */
function patchMember(src, cls, m, toG) {
  const p = parseFile(src), simple = cls.slice(cls.lastIndexOf('.') + 1);
  const code = toG(m.code);
  const ownerPath = m.owner || simple;
  const ty = p.types.find(t => t.path === ownerPath);
  if (m.kind === 'type') {
    const tp = simple + '.' + m.key.slice(5), ex = p.types.find(t => t.path === tp);
    if (ex) { const s = lineStart(src, ex.t.start); return { ok: true, src: src.slice(0, s) + code.replace(/^\s*\n/, '') + src.slice(ex.t.close + 1) }; }
    const outerPath = tp.slice(0, tp.lastIndexOf('.')), ot = p.types.find(t => t.path === outerPath);
    if (!ot) return { ok: false, why: '넣을 바깥 형이 없음 (' + outerPath + ')' };
    return { ok: true, src: src.slice(0, ot.t.close) + '\n' + code.replace(/^\s*\n/, '').replace(/\s*$/, '') + '\n' + src.slice(ot.t.close) };
  }
  if (!ty) return { ok: false, why: '그 형이 이 게임에 없음 (' + ownerPath + ')' };
  const key = m.key.slice(ownerPath === simple ? 0 : ownerPath.length - simple.length);
  const ex = ty.members.find(x => x.key === key);
  if (m.kind === 'const' && !ex) {   // 새 enum 상수: 상수 목록 끝 (; 앞 · 없으면 형 끝)에 쉼표로
    const consts = ty.members.filter(x => x.kind === 'const'); const last = consts[consts.length - 1];
    if (!last) return { ok: false, why: '상수 목록을 찾지 못함' };
    const raw = src.slice(last.start, last.end), trail = raw.length - raw.trimEnd().length, at = last.end - trail;
    return { ok: true, src: src.slice(0, at) + ',\n\t' + code.trim() + src.slice(at) };
  }
  if (m.change === 'changed' || ex) {
    if (!ex) return { ok: false, why: '바꿀 멤버를 찾지 못함' };
    if (m.base) { const cur = hashOf(normCode(p.st._s.bare.slice(ex.start, ex.end))); if (cur !== m.base) return { ok: false, why: '이 게임의 그 멤버가 꾸러미를 만들 때와 다름 (게임 저장소가 바뀜) — 기능을 다시 가져오세요' }; }
    return { ok: true, src: src.slice(0, ex.start) + code + src.slice(ex.end) };
  }
  // 새 멤버: source 에서 바로 앞에 있던 멤버 뒤 (없으면 형의 끝 } 앞)
  const prevKey = m.after ? m.after.slice(ownerPath === simple ? 0 : ownerPath.length - simple.length) : '';
  const pv = prevKey && ty.members.find(x => x.key === prevKey);
  if (pv) return { ok: true, src: src.slice(0, pv.end) + (code.startsWith('\n') ? '' : '\n') + code.replace(/\s*$/, '') + src.slice(pv.end) };
  return { ok: true, src: src.slice(0, ty.t.close) + code.replace(/\s*$/, '') + '\n' + src.slice(ty.t.close) };
}
const lineStart = (s, i) => s.lastIndexOf('\n', i - 1) + 1;
/** 넣은 코드가 쓰는 import 중 파일에 없는 것 더하기 (쓰는 이름만) */
function addImports(src, imports, code) {
  const st = JS.structure(src), have = new Set(st.imports);
  const used = idents(code);
  const add = [...new Set(imports)].filter(im => !have.has(im) && (im.endsWith('.*') || used.has(im.slice(im.lastIndexOf('.') + 1))));
  if (!add.length) return src;
  const m = /^(\s*import\s+[^;]+;[^\n]*\n)(?![\s\S]*^\s*import\s)/m.exec(src) || /^\s*package\s+[^;]+;[^\n]*\n/m.exec(src);
  if (!m) return add.map(i => 'import ' + i + ';').join('\n') + '\n' + src;
  const at = m.index + m[0].length;
  return src.slice(0, at) + add.map(i => 'import ' + i + ';\n').join('') + src.slice(at);
}

module.exports = { catalog, closure, pack, savePack, listPacks, applyPacks, removePacks, index, memberTable, parseFile, members, patchMember, addImports, readProps, FORMAT };

// 명령줄: node repo-features.js catalog <source> <target> | closure <source> <target> <id>…
if (require.main === module) {
  const [cmd, a, b, ...rest] = process.argv.slice(2);
  if (cmd === 'catalog') { const c = catalog(a, b); console.log(JSON.stringify(c.summary)); c.features.slice(0, +process.env.N || 60).forEach(f => console.log(`${f.kind.padEnd(7)} ${f.label}  [${f.size}줄]  ${f.id}`)); }
  else if (cmd === 'closure') { const c = closure(a, b, rest); console.log(JSON.stringify({ classes: c.classes.length, members: c.members.length, assets: c.assets.length, messages: c.messages.length, lines: c.lines, missing: c.missing }, null, 1)); c.members.forEach(m => console.log('  member', m.change, rel(m.cls) + '#' + m.key, '←', c.why[m.cls + '#' + m.key])); if (process.env.V) c.classes.forEach(x => console.log('  class', rel(x), '←', c.why[x])); }
  else console.log('사용: node repo-features.js catalog <가져올 저장소> <게임 저장소> | closure <가져올> <게임> <기능 id>…');
}
