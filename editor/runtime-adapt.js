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
  return roots;
}

/** 저장소 클래스 목록 → { classes: Map<FQN, 파일>, packages: Set<패키지> } (pdmaker 패키지는 뺌 — 설치된 런타임이 있어도 원래 게임만 봄) */
function scanClasses(repo) {
  const classes = new Map(), packages = new Set();
  for (const root of sourceRoots(repo)) {
    const walk = (d, pkg, depth) => {
      if (depth > 14) return; let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
      for (const e of es) {
        if (e.isSymbolicLink()) continue;
        if (e.isDirectory()) { if (pkg === GAME_PKG && e.name === 'pdmaker') continue; walk(path.join(d, e.name), pkg ? pkg + '.' + e.name : e.name, depth + 1); }
        else if (e.name.endsWith('.java')) { classes.set((pkg ? pkg + '.' : '') + e.name.slice(0, -5), path.join(d, e.name)); if (pkg) packages.add(pkg); }
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
  const { classes, packages } = scanClasses(repo);
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
  return { repo, classes, packages, mainGame, has, member, method, field, re, relocations, read };
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
  if (opt.generated) { const p = pruneImports(s, env); if (p.removed.length) { s = p.src; changes.push({ kind: 'import', file, removed: p.removed }); } }
  return { src: s, changes };
}

/** 적응한 소스에서 아직 저장소에 없는 게임 클래스 이름 [{ cls, uses }] (주석 · 문자열 · //#| 줄은 뺌) */
function missingIn(files, env) {
  const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, '').replace(/"(?:\\.|[^"\\\n])*"/g, '""');
  const uses = new Map();
  for (const [f, src] of Object.entries(files)) {
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

module.exports = { environment, scanClasses, sourceRoots, evalCond, applyBlocks, pruneImports, adaptSource, adaptRuntime, missingIn, RELOCATIONS, OFF, GAME_PKG };

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
