// ================================================================
//  런타임 적응 (11차) — PDMaker 런타임(pdmaker 패키지)을 "선택한 게임 저장소의 실제 구조"에 맞춰 설치할 수 있게 함
//
//  저장소 이름으로 고르지 않음. 저장소 소스를 훑어 다음을 판정하고, 복사하는 런타임 파일(사본)만 고침 — 게임 원본은 건드리지 않음:
//   1) 게임 본체 클래스: 루트 패키지에서 com.watabou.noosa.Game 을 상속하는 클래스 (SPD = ShatteredPixelDungeon, ARK = TomorrowRogueNight …)
//      → 런타임 소스의 ShatteredPixelDungeon 이름을 그 클래스로
//   2) 옮겨진 클래스: SPD 역사에서 패키지를 옮긴 클래스 (RELOCATIONS — 이름이 같다는 이유만이 아니라, 알려진 이동만)
//   3) 기능 조건 블록: 런타임 소스의 //#if <조건> … //#else … //#endif
//        (조건 뒤 " @ 설명" = 화면 · 보고에 보일 기능 이름)
//        조건 = has:<클래스> (게임 패키지 기준 상대 이름 · com.watabou… 는 그대로) · method:<클래스>#<이름> (함수 선언) · field:<클래스>#<이름> (필드 선언)
//               · member:<클래스>#<이름> (이름이 선언 · 쓰임으로 나옴) · re:<클래스>#<정규식> · ! · && · ||   (그 클래스 파일만 봄 — 상속은 따로 적음)
//        저장소 원본(runtime/src)은 SPD 판이 살아 있고, 다른 갈래는 "//#|" 로 주석 처리돼 있음 → 사본에서 조건대로 켜고 끔
//   4) 생성 코드(gen/*)의 import: 이 저장소에 없는 게임 패키지 · 클래스를 가리키고 파일 안에서 쓰지 않으면 뺌 (쓰지 않는 import 는 의미가 없음)
//  남는 것(조건 블록으로도 못 메운 클래스)은 missing 으로 보고 → 설치기가 파일을 고치기 전에 거부
// ================================================================
const fs = require('fs');
const path = require('path');

const GAME_PKG = 'com.shatteredpixel.shatteredpixeldungeon';
const GAME_DIR = GAME_PKG.split('.');
const SKIP_DIR = /^(\.git|build|\.gradle|node_modules|assets|res|\.idea|out)$/;

/** 알려진 패키지 이동 — { cls: 런타임이 쓰는 이름, alts: [예전/다른 판의 위치], note } */
const RELOCATIONS = [
  { cls: 'ui.Button', alts: ['com.watabou.noosa.ui.Button'], note: 'SPD 1.x 이전에는 Button 이 SPD-classes(com.watabou.noosa.ui)에 있었음' },
];

/** 저장소의 java 소스 루트들 (…/src/main/java) — SPD-classes 처럼 src/main/java 아래 com/watabou 도 포함 */
function sourceRoots(repo) {
  const roots = [];
  const walk = (d, depth) => {
    if (depth > 6) return; let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const e of es) {
      if (!e.isDirectory() || e.isSymbolicLink() || SKIP_DIR.test(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.name === 'java' && path.basename(d) === 'main') roots.push(p); else walk(p, depth + 1);
    }
  };
  walk(repo, 0);
  // 12차: gradle 없는 Eclipse · Ant 안드로이드 프로젝트 (원작 Pixel Dungeon — AndroidManifest.xml 옆의 src/)
  if (!roots.length && fs.existsSync(path.join(repo, 'AndroidManifest.xml')) && fs.existsSync(path.join(repo, 'src'))) roots.push(path.join(repo, 'src'));
  return roots;
}

/** 12차: 게임 패키지 — Dungeon · levels.Level · actors.hero.Hero 가 함께 있는 패키지 (SPD = com.shatteredpixel.shatteredpixeldungeon,
 *  RKPD2 · Rat King Adventure = com.zrp200.rkpd2 처럼 패키지 이름을 바꾼 파생작도). 못 찾으면 SPD 이름 */
function gamePackage(repo) { return gameLocation(repo).pkg; }
/** 게임 패키지 폴더 (절대 경로) — 없으면 SPD 자리 (core/src/main/java/com/shatteredpixel/shatteredpixeldungeon) */
function gameJavaDir(repo) { return gameLocation(repo).dir; }
const locCache = new Map();   // 저장소 → { at, v } (설치 · 상태 확인이 파일마다 부름 — 잠깐만 기억)
function gameLocation(repo) {
  const c = locCache.get(repo); if (c && Date.now() - c.at < 3000) return c.v;
  const v = findGameLocation(repo); locCache.set(repo, { at: Date.now(), v }); return v;
}
function findGameLocation(repo) {
  for (const root of sourceRoots(repo)) {
    let found = null;
    const walk = (d, depth) => { if (found || depth > 8) return; let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
      if (es.some(e => e.name === 'Dungeon.java') && fs.existsSync(path.join(d, 'levels', 'Level.java')) && fs.existsSync(path.join(d, 'actors', 'hero', 'Hero.java'))) { found = path.relative(root, d).split(path.sep).join('.'); return; }
      for (const e of es) if (e.isDirectory() && !e.isSymbolicLink() && !SKIP_DIR.test(e.name) && e.name !== 'pdmaker') walk(path.join(d, e.name), depth + 1); };
    walk(root, 0);
    if (found) return { pkg: found, dir: path.join(root, ...found.split('.')) };
  }
  return { pkg: GAME_PKG, dir: path.join(repo, 'core', 'src', 'main', 'java', ...GAME_PKG.split('.')) };
}
/** 게임 패키지 이름 바꾸기 (런타임 사본 · 연결 줄 · 생성 코드 — 소스는 SPD 이름으로 씀) */
const toGamePkg = (s, pkg) => !pkg || pkg === GAME_PKG ? s : s.replace(/\bcom\.shatteredpixel\.shatteredpixeldungeon\b/g, pkg);

/** 저장소 클래스 목록 → { classes: Map<FQN, 파일>, packages: Set<패키지> } (pdmaker 패키지는 뺌 — 설치된 런타임이 있어도 원래 게임만 봄)
 *  12차: 게임 패키지가 SPD 이름과 다르면 SPD 이름으로 바꿔 둔 목록 (아래 판정 · 조건 블록은 SPD 이름 기준) */
function scanClasses(repo, gpkg) {
  gpkg = gpkg || GAME_PKG;
  const norm = n => gpkg !== GAME_PKG && (n === gpkg || n.startsWith(gpkg + '.')) ? GAME_PKG + n.slice(gpkg.length) : n;
  const classes = new Map(), packages = new Set();
  for (const root of sourceRoots(repo)) {
    const walk = (d, pkg, depth) => {
      if (depth > 14) return; let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
      for (const e of es) {
        if (e.isSymbolicLink()) continue;
        if (e.isDirectory()) { if ((pkg === GAME_PKG || pkg === gpkg) && e.name === 'pdmaker') continue; walk(path.join(d, e.name), pkg ? pkg + '.' + e.name : e.name, depth + 1); }
        else if (e.name.endsWith('.java')) { classes.set(norm((pkg ? pkg + '.' : '') + e.name.slice(0, -5)), path.join(d, e.name)); if (pkg) packages.add(norm(pkg)); }
      }
    };
    walk(root, '', 0);
  }
  return { classes, packages };
}

/** 주석 · 문자열 지우기 (줄 수는 그대로) */
function stripJava(s) { return s.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, '').replace(/"(?:\\.|[^"\\\n])*"/g, '""'); }
const fq = c => /^(com|org|java|javax)\./.test(c) ? c : GAME_PKG + '.' + c;

/** 저장소 환경 — { mainGame, has(cls), member(cls, name), relocations[{from,to,note}], notes[] } */
function environment(repo) {
  const gamePkg = gamePackage(repo);
  const { classes, packages } = scanClasses(repo, gamePkg);
  const srcCache = new Map();
  const read = f => { if (!srcCache.has(f)) { let s = ''; try { s = fs.readFileSync(f, 'utf8'); } catch (_) { /* 못 읽음 */ } srcCache.set(f, s); } return srcCache.get(f); };
  const has = c => classes.has(fq(c)) || packages.has(fq(c));
  const src = c => { const f = classes.get(fq(c)); return f ? stripJava(read(f)) : null; };
  const esc = n => n.replace(/[$]/g, '\\$');
  const member = (c, name) => { const t = src(c); return t != null && new RegExp('\\b' + esc(name) + '\\s*[(=;,]').test(t); };
  // 선언만 (호출 · 대입이 아니라): 함수 = "<형> 이름(" 앞에 접근자 · 형 · 제네릭, 필드 = "<형> 이름 =|;"
  const method = (c, name) => { const t = src(c); return t != null && new RegExp('(?:^|[\\s;{}])(?:(?:public|protected|private|static|final|synchronized|abstract|default)\\s+)*[\\w.$<>\\[\\],? ]*[\\w>\\]]\\s+' + esc(name) + '\\s*\\(', 'm').test(t); };
  const field = (c, name) => { const t = src(c); return t != null && new RegExp('(?:^|[\\s;{}(])(?:(?:public|protected|private|static|final|volatile|transient)\\s+)*[\\w.$<>\\[\\]]+\\s+' + esc(name) + '\\s*(?:=|;)', 'm').test(t); };
  const re = (c, rx) => { const t = src(c); return t != null && new RegExp(rx, 'm').test(t); };
  // 게임 본체: 루트 게임 패키지에서 Game 을 상속하는 클래스
  let mainGame = null;
  for (const [cls, f] of classes) {
    if (cls.lastIndexOf('.') !== GAME_PKG.length || !cls.startsWith(GAME_PKG + '.')) continue;
    if (/\bclass\s+\w+\s+extends\s+(com\.watabou\.noosa\.)?Game\b/.test(read(f))) { mainGame = cls.slice(GAME_PKG.length + 1); break; }
  }
  const relocations = [];
  for (const r of RELOCATIONS) {
    if (has(r.cls)) continue;
    const to = r.alts.find(a => has(a)); if (to) relocations.push({ from: fq(r.cls), to: fq(to), note: r.note });
  }
  // 12차: 게임 함수 선언의 수 타입 (이름 → [{ ret, params[] }]) — 체력 · 피해가 long 인 파생작(Experienced Pixel Dungeon)에 맞춰 덮어쓰는 함수 모양을 바꿀 때 (처음 쓸 때 한 번 훑음)
  let decls = null;
  const methodDecls = name => {
    if (!decls) {
      decls = new Map();
      const re = /(public|protected)\s+(?:(?:static|final|synchronized|abstract)\s+)*([\w.<>\[\]]+)\s+(\w+)\s*\(([^()]*)\)\s*(?:throws[^{;]*)?[{;]/g;
      for (const [c, f] of classes) {
        if (!c.startsWith(GAME_PKG + '.') || c.startsWith(GAME_PKG + '.pdmaker.')) continue;
        for (const m of read(f).matchAll(re)) {
          const params = m[4].trim() ? m[4].split(',').map(p => p.replace(/@\w+\s*/g, '').replace(/\bfinal\s+/g, '').trim().split(/\s+/).slice(0, -1).join(' ')) : [];
          (decls.get(m[3]) || decls.set(m[3], []).get(m[3])).push({ ret: m[2], params, vis: m[1] });
        }
      }
    }
    return decls.get(name) || [];
  };
  return { repo, gamePkg, classes, packages, mainGame, has, member, method, field, re, relocations, read, methodDecls };
}

/** 12차: 덮어쓰는 함수(@Override)의 int 반환 · 인자를 게임 선언에 맞춰 long 으로 — 그 이름 · 인자 수의 게임 선언이 모두 long 일 때만 (SPD 에서는 바뀌는 것 없음)
 *  예: Experienced Pixel Dungeon 의 Char.damageRoll() · drRoll() · attackProc(Char, long) · damage(long, Object) · Item.value() */
function widenOverrides(s, env) {
  const changed = [];
  if (!env.methodDecls) return { src: s, changed };
  let st = null; const struct = () => st || (st = require('./renderer/js/javasrc.js').structure(s));
  const out = s.replace(/(@Override\s+)(public|protected)(\s+(?:(?:final|synchronized)\s+)*)(int|long|void|[\w.<>\[\]]+)(\s+)(\w+)(\s*\()([^()]*)(\))/g, (m, ov, vis, mods, ret, sp, name, op, params, cl, at) => {
    const ps = params.trim() ? params.split(',') : [];
    const types = ps.map(p => p.replace(/@\w+\s*/g, '').replace(/\bfinal\s+/g, '').trim().split(/\s+/).slice(0, -1).join(' '));
    const num = t => t === 'int' || t === 'long';
    const same = d => d.params.length === ps.length && d.params.every((t, i) => t === types[i] || (num(t) && num(types[i])));
    // 1) 이 형이 실제로 물려받는 게임 클래스에서 그 함수 선언 (상속을 따라 올라감) — 반환형 · 수 타입 · 공개 범위를 그대로
    let ds = null;
    try { const d = superDecl(env, s, struct(), at, name, same); if (d) ds = [d]; } catch (_) { /* 못 찾음 → 아래 */ }
    // 2) 못 찾으면: 그 이름 · 모양의 게임 선언이 모두 같은 쪽일 때만 (SPD 에서는 바뀌는 것 없음)
    if (!ds) { ds = env.methodDecls(name).filter(same); if (!ds.length) return m; }
    let r2 = ret, v2 = vis, did = false;
    if (ret === 'int' && ds.every(d => d.ret === 'long')) { r2 = 'long'; did = true; }
    if (vis === 'protected' && ds.every(d => d.vis === 'public')) { v2 = 'public'; did = true; }   // 덮어쓰는 함수는 공개 범위를 좁힐 수 없음 (RKPD2: RenderedTextBlock.layout() 이 public)
    const ps2 = ps.map((p, i) => {
      const mm = /^(\s*(?:final\s+)?)int(\s+\w+\s*)$/.exec(p);
      if (mm && ds.every(d => d.params[i] === 'long')) { did = true; return mm[1] + 'long' + mm[2]; }
      return p;
    });
    if (!did) return m;
    changed.push(name);
    return ov + v2 + mods + r2 + sp + name + op + ps2.join(',') + cl;
  });
  return { src: out, changed };
}
/** 런타임 소스의 위치 at 을 감싼 형이 물려받는 게임 클래스들에서 name 함수 선언 (same 으로 모양 확인) → { ret, params, vis } | null */
function superDecl(env, s, st, at, name, same) {
  const t = st.types.filter(x => x.open < at && (x.close < 0 || x.close > at)).sort((a, b) => b.start - a.start)[0];
  if (!t || !t.ext) return null;
  const imports = st.imports || [];
  const resolve = (simple, imps, pkg) => {
    const n = String(simple).replace(/<.*$/, '');
    if (n.includes('.')) { const fq = n.startsWith('com.') ? n : null; if (fq) { const g = fq.split(env.gamePkg || GAME_PKG).join(GAME_PKG); if (env.classes.has(g)) return g; } const head = n.split('.')[0], im = imps.find(i => i.endsWith('.' + head)); if (im) { const g = (im + n.slice(head.length)).split(env.gamePkg || GAME_PKG).join(GAME_PKG); if (env.classes.has(g)) return g; } return null; }
    const im = imps.find(i => i.endsWith('.' + n)); if (im) { const g = im.split(env.gamePkg || GAME_PKG).join(GAME_PKG); return env.classes.has(g) ? g : null; }
    if (pkg && env.classes.has(pkg + '.' + n)) return pkg + '.' + n;
    for (const i of imps) if (i.endsWith('.*')) { const g = (i.slice(0, -2) + '.' + n).split(env.gamePkg || GAME_PKG).join(GAME_PKG); if (env.classes.has(g)) return g; }
    return null;
  };
  const declRe = new RegExp('(?:^|[\\s;{}])((?:(?:public|protected|private|static|final|synchronized|abstract)\\s+)*)([\\w.<>\\[\\]]+)\\s+' + name + '\\s*\\(([^()]*)\\)\\s*(?:throws[^{;]*)?[{;]', 'g');
  let fq = resolve(t.ext, imports, null), guard = 0;
  while (fq && guard++ < 12) {
    const src = env.read(env.classes.get(fq)); if (!src) return null;
    const JS = require('./renderer/js/javasrc.js'), gst = JS.structure(src), bare = JS.scan(src).code;
    const top = gst.types.find(x => x.name === fq.slice(fq.lastIndexOf('.') + 1)) || gst.types[0];
    for (const m of bare.matchAll(declRe)) {
      if (top && (m.index < top.open || m.index > top.close)) continue;
      // 바깥 형 본문 바로 아래 선언만 (안쪽 형 · 지역 클래스 것은 뺌)
      const inner = gst.types.find(x => x !== top && x.open < m.index && x.close > m.index); if (inner) continue;
      const params = m[3].trim() ? m[3].split(',').map(p => p.replace(/@\w+\s*/g, '').replace(/\bfinal\s+/g, '').trim().split(/\s+/).slice(0, -1).join(' ')) : [];
      const d = { ret: m[2], params, vis: (/\b(public|protected|private)\b/.exec(m[1]) || [, ''])[1] };
      if (same(d)) return d;
    }
    const pkg = fq.slice(0, fq.lastIndexOf('.'));
    fq = top && top.ext ? resolve(top.ext, gst.imports.map(i => i.split(env.gamePkg || GAME_PKG).join(GAME_PKG)), pkg) : null;
  }
  return null;
}

/** 조건식 평가: "has:a.B && !member:c.D#e || has:x" (괄호 없음 — || 가 && 보다 약함) */
function evalCond(expr, env) {
  return String(expr).split('||').some(part => part.split('&&').every(t => {
    t = t.trim(); let neg = false; while (t.startsWith('!')) { neg = !neg; t = t.slice(1).trim(); }
    let v;
    if (t.startsWith('has:')) v = env.has(t.slice(4).trim());
    else if (/^(member|method|field|re):/.test(t)) { const k = t.slice(0, t.indexOf(':')), rest = t.slice(k.length + 1).trim(), at = rest.indexOf('#'); v = env[k](rest.slice(0, at), rest.slice(at + 1)); }
    else if (t === 'true') v = true; else if (t === 'false') v = false;
    else throw new Error('모르는 조건: ' + t);
    return neg ? !v : v;
  }));
}

const OFF = '//#|';
/** 조건 블록 처리 → { src, blocks: [{ line, cond, on }] } */
function applyBlocks(src, env, file) {
  const lines = src.split('\n'), stack = [], blocks = [];
  // stack 원소: { taken: 이미 켠 갈래가 있음, on: 지금 갈래가 켜짐, parentOn }
  const live = () => stack.every(s => s.on);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i], t = raw.trim();
    const m = /^\/\/#(if|elif|else|endif)\b\s*(.*)$/.exec(t);
    if (m) {
      const [, kw, cond] = m;
      const [cnd, label] = String(cond).split(' @ ');
      if (kw === 'if') { const parentOn = live(); const on = parentOn && evalCond(cnd, env); stack.push({ taken: on, on, parentOn }); blocks.push({ file, line: i + 1, cond: cnd, label: label || '', on }); }
      else if (!stack.length) throw new Error(`${file}:${i + 1} //#${kw} 짝이 없음`);
      else if (kw === 'elif') { const s = stack[stack.length - 1]; s.on = s.parentOn && !s.taken && evalCond(cnd, env); s.taken = s.taken || s.on; blocks.push({ file, line: i + 1, cond: cnd, label: label || '', on: s.on }); }
      else if (kw === 'else') { const s = stack[stack.length - 1]; s.on = s.parentOn && !s.taken; s.taken = true; }
      else stack.pop();
      continue;
    }
    if (!stack.length) continue;
    const ind = /^\s*/.exec(raw)[0];
    const body = raw.slice(ind.length).startsWith(OFF) ? ind + raw.slice(ind.length + OFF.length).replace(/^ /, '') : raw;
    lines[i] = live() ? body : (body.trim() ? /^\s*/.exec(body)[0] + OFF + ' ' + body.trimStart() : body);
  }
  if (stack.length) throw new Error(`${file}: //#if 가 닫히지 않음`);
  return { src: lines.join('\n'), blocks };
}

/** 쓰지 않는 · 없는 게임 import 빼기 (생성 코드용) */
function pruneImports(src, env) {
  const removed = [];
  const out = src.replace(/^import\s+(com\.shatteredpixel\.shatteredpixeldungeon\.[\w.]+?)(\.\*)?\s*;[^\n]*$/gm, (m, name, star) => {
    if (name.startsWith(GAME_PKG + '.pdmaker')) return m;
    if (star ? env.packages.has(name) : env.classes.has(name)) return m;
    if (!star) { const simple = name.split('.').pop(); const rest = src.replace(m, ''); if (new RegExp('\\b' + simple + '\\b').test(rest)) return m; }   // 쓰고 있음 → 그대로 (컴파일 오류로 드러남)
    removed.push(name + (star ? '.*' : ''));
    return '// (PDMaker: 이 게임에 없는 ' + (star ? '패키지' : '클래스') + ') ' + m;
  });
  return { src: out, removed };
}

/** 런타임 파일 하나 적응 → { src, changes[] } */
function adaptSource(src, env, file, opt) {
  opt = opt || {};
  const changes = [];
  let s = src;
  if (/\/\/#if\b/.test(s)) { const r = applyBlocks(s, env, file); s = r.src; r.blocks.forEach(b => changes.push({ kind: 'feature', file, line: b.line, cond: b.cond, label: b.label, on: b.on })); }
  if (env.mainGame && env.mainGame !== 'ShatteredPixelDungeon' && /\bShatteredPixelDungeon\b/.test(s)) {
    s = s.replace(/("(?:\\.|[^"\\\n])*")|\bShatteredPixelDungeon\b/g, (m, str) => str || env.mainGame);
    changes.push({ kind: 'main-game', file, to: env.mainGame });
  }
  for (const r of env.relocations) {
    const re = new RegExp('\\b' + r.from.replace(/\./g, '\\.') + '\\b', 'g');
    if (re.test(s)) { s = s.replace(re, r.to); changes.push({ kind: 'relocate', file, from: r.from, to: r.to, note: r.note }); }
  }
  { const w = widenOverrides(s, env); if (w.changed.length) { s = w.src; changes.push({ kind: 'numeric', file, methods: [...new Set(w.changed)] }); } }
  if (opt.generated) { const p = pruneImports(s, env); if (p.removed.length) { s = p.src; changes.push({ kind: 'import', file, removed: p.removed }); } }
  // 12차: 게임 패키지 이름이 다른 파생작 — 사본의 패키지 · import · 클래스 이름 · 반사용 문자열까지 그 이름으로 (맨 마지막: 위 판정은 SPD 이름 기준)
  if (env.gamePkg && env.gamePkg !== GAME_PKG && /com\.shatteredpixel\.shatteredpixeldungeon/.test(s)) { s = toGamePkg(s, env.gamePkg); changes.push({ kind: 'package', file, to: env.gamePkg }); }
  return { src: s, changes };
}

/** 적응한 소스에서 아직 저장소에 없는 게임 클래스 이름 [{ cls, uses }] (주석 · 문자열 · //#| 줄은 뺌) */
function missingIn(files, env) {
  const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, '').replace(/"(?:\\.|[^"\\\n])*"/g, '""');
  const uses = new Map();
  for (const [f, src0] of Object.entries(files)) {
    const src = env.gamePkg && env.gamePkg !== GAME_PKG ? src0.split(env.gamePkg).join(GAME_PKG) : src0;   // 판정은 SPD 이름 기준 (classes 와 같게)
    strip(src).split('\n').forEach((ln, i) => {
      for (const m of ln.matchAll(/\bcom\.shatteredpixel\.shatteredpixeldungeon\.((?:[a-z_]\w*\.)*[A-Z]\w*)/g)) {
        if (m[1].startsWith('pdmaker.')) continue;
        if (env.classes.has(GAME_PKG + '.' + m[1])) continue;
        // 중첩 클래스 (a.B.C → a.B)
        const parts = m[1].split('.'); let found = false;
        for (let k = parts.length - 1; k > 0 && !found; k--) if (/^[A-Z]/.test(parts[k - 1]) && env.classes.has(GAME_PKG + '.' + parts.slice(0, k).join('.'))) found = true;
        if (found) continue;
        const l = uses.get(m[1]) || uses.set(m[1], []).get(m[1]); if (l.length < 3) l.push(`${path.basename(f)}:${i + 1}`);
      }
      // 게임 본체 이름 (import 없이 같은 패키지 밖에서 쓰는 경우는 위에서 잡힘)
    });
  }
  return [...uses].map(([cls, at]) => ({ cls, uses: at }));
}

/** 런타임 패키지 전체를 이 저장소에 맞춰 적응 (메모리에서만) → { files: {rel: src}, changes[], features[], missing[], env } */
function adaptRuntime(repo, runtimePkgDir, opt) {
  opt = opt || {};
  const env = opt.env || environment(repo);
  const files = {}, changes = [];
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name), r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(p, r);
      else if (e.name.endsWith('.java')) {
        const src = fs.readFileSync(p, 'utf8');
        if (!/\b(class|interface|enum)\s/.test(src)) continue;   // 빈 파일 = 지워진 파일 표시
        const a = adaptSource(src, env, r, { generated: r.startsWith('gen/') });
        files[r] = a.src; changes.push(...a.changes);
      }
    }
  };
  walk(runtimePkgDir, '');
  return { files, changes, features: summarizeFeatures(changes), missing: missingIn(files, env), env };
}

/** 조건 블록을 기능 이름별로 묶음: [{ cond, on, where[] }] */
function summarizeFeatures(changes) {
  const m = new Map();
  for (const c of changes) if (c.kind === 'feature') { const k = c.cond + '|' + c.on; const v = m.get(k) || m.set(k, { cond: c.cond, label: c.label || '', on: c.on, where: [] }).get(k); if (!v.label && c.label) v.label = c.label; if (v.where.length < 6) v.where.push(`${c.file}:${c.line}`); }
  return [...m.values()];
}

module.exports = { environment, widenOverrides, gamePackage, gameJavaDir, toGamePkg, scanClasses, sourceRoots, evalCond, applyBlocks, pruneImports, adaptSource, adaptRuntime, missingIn, RELOCATIONS, OFF, GAME_PKG };

// 명령줄 (개발 · 테스트 도구용): node runtime-adapt.js --dir <게임 저장소> <입력 폴더> <출력 폴더>  — 폴더의 .java 를 이 저장소에 맞춰 적응해 복사
if (require.main === module) {
  const [flag, repo, from, to] = process.argv.slice(2);
  if (flag !== '--dir' || !repo || !from || !to) { console.log('사용: node runtime-adapt.js --dir <게임 저장소> <입력 폴더> <출력 폴더>'); process.exit(2); }
  const env = environment(repo);
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(from).filter(x => x.endsWith('.java'))) {
    const a = adaptSource(fs.readFileSync(path.join(from, f), 'utf8'), env, f);
    fs.writeFileSync(path.join(to, f), a.src, 'utf8');
    a.changes.filter(c => c.kind === 'feature' && !c.on).forEach(c => console.log(`[적응] ${f}:${c.line} 끔 — ${c.cond}`));
  }
}
