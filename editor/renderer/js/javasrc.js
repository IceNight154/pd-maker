// ================================================================
//  javasrc — 게임 저장소의 Java 소스를 "제한된 구조 분석"으로 읽는 공용 부품
//    편집기 화면(window.PDMJava) · 저장소 분석기(editor/repo-analyzer.js, require) · 테스트가 같은 코드를 씀
//    정규식만으로 소스를 훑지 않도록: 주석 · 문자열을 먼저 걷어 낸 "골격"에서 괄호 짝 · 형(class/interface/enum) 선언 · 깊이를 셈
//    (완전한 Java 파서가 아님 — 실패하면 problems 에 줄 번호와 함께 남기고, 읽은 데까지는 돌려줌)
//
//    scan(src)                 → { code(주석만 걷음), bare(주석·문자열 걷음), problems }
//    structure(src)            → { pkg, imports, types[{kind,name,ext,impl,abstract,line,start,open,close,depth,outer}], balanced, problems }
//    body(src, type)           → 형 본문 (안쪽 형 본문은 비움 — 자기 필드만 보려고)
//    enumConstants(src, name)  → enum 상수 이름 목록 (생성자 인자 · 본문 있는 상수도)
//    method(src, re)           → { body, code, line } (괄호 짝은 문자열 · 주석을 건너뜀)
//    caseBodies(body, name)    → switch 의 case NAME: 본문들
//    assets(src)               → { map: { 'Sprites.RAT': 'sprites/rat.png' }, consts: [{key,path,line}], unresolved: [{key,expr,line}] }
//    itemSheet(src)            → { cell, cols, origin1, scale, consts:{NAME:번호}, unresolved:[] } | null
//    sprite(src, assetsMap, inner) → { tex, sheet, frame:[w,h], anims, texOffset, parent, problems }
//    heroSheets(src, assetsMap) → { map: { WARRIOR: 'sprites/warrior.png' }, def, consts: { WARRIOR: 'Sprites.WARRIOR' } }
//    heroFrame(src)            → [w, h] | null
//    gradleProps(src)          → { appName, appPackageName, appVersionName, … } (+= 이어 붙이기 포함)
//    gradleIncludes(src)       → { modules: [':core', …], statements: [{ line, modules }], projectDirs: { ':x': 'dir' } }
//    gradleSrcDirs(src)        → { java: [...], assets: [...], res: [...], resources: [...] }
// ================================================================
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PDMJava = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), function () {

  /** 줄 시작 위치 표 → 위치 i 의 줄 번호(1부터) */
  function lineIndex(src) {
    const starts = [0];
    for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) starts.push(i + 1);
    return i => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (starts[m] <= i) lo = m; else hi = m - 1; } return lo + 1; };
  }
  const blankOf = s => s.replace(/[^\n]/g, ' ');

  /** 주석 · 문자열 걷어 내기 (길이 · 줄 바꿈은 그대로 → 위치가 원본과 같음) */
  function scan(src) {
    src = String(src || '');
    const n = src.length, problems = [], line = lineIndex(src);
    let code = '', bare = '', i = 0;
    while (i < n) {
      const c = src[i], d = src[i + 1];
      if (c === '/' && d === '/') { let j = src.indexOf('\n', i); if (j < 0) j = n; const pad = ' '.repeat(j - i); code += pad; bare += pad; i = j; continue; }
      if (c === '/' && d === '*') {
        let j = src.indexOf('*/', i + 2);
        if (j < 0) { problems.push({ line: line(i), reason: '닫히지 않은 주석 (/* … 끝까지)' }); j = n; } else j += 2;
        const seg = blankOf(src.slice(i, j)); code += seg; bare += seg; i = j; continue;
      }
      if (c === '"' && src.startsWith('"""', i)) {   // 텍스트 블록 (Java 15+)
        let j = src.indexOf('"""', i + 3);
        if (j < 0) { problems.push({ line: line(i), reason: '닫히지 않은 텍스트 블록 (""")' }); j = n; } else j += 3;
        code += src.slice(i, j); bare += blankOf(src.slice(i, j)); i = j; continue;
      }
      if (c === '"' || c === "'") {
        let j = i + 1;
        while (j < n && src[j] !== c && src[j] !== '\n') { if (src[j] === '\\') j++; j++; }
        if (src[j] !== c) problems.push({ line: line(i), reason: c === '"' ? '닫히지 않은 문자열' : '닫히지 않은 문자 리터럴' }); else j++;
        code += src.slice(i, j); bare += blankOf(src.slice(i, j)); i = j; continue;
      }
      code += c; bare += c; i++;
    }
    return { code, bare, problems, line };
  }

  /** bare 에서 open 위치의 여는 괄호와 짝이 맞는 닫는 괄호 위치 (없으면 -1) */
  function matchClose(bare, open) {
    const o = bare[open], cl = o === '{' ? '}' : o === '(' ? ')' : o === '[' ? ']' : null; if (!cl) return -1;
    let d = 0;
    for (let i = open; i < bare.length; i++) { const ch = bare[i]; if (ch === o) d++; else if (ch === cl && --d === 0) return i; }
    return -1;
  }

  const MODS = /\b(public|protected|private|static|abstract|final|sealed|non-sealed|strictfp)\b/g;
  /** 형 선언 · 괄호 짝 · 패키지 */
  function structure(src) {
    const s = scan(src), b = s.bare, out = { pkg: '', imports: [], types: [], balanced: true, problems: s.problems.slice(), lines: String(src || '').split('\n').length };
    const pm = /^\s*package\s+([\w.]+)\s*;/m.exec(b.replace(/@\w+(\([^)]*\))?/g, m => ' '.repeat(m.length)));
    if (pm) out.pkg = pm[1];
    for (const m of b.matchAll(/^\s*import\s+(static\s+)?([\w.*]+)\s*;/gm)) out.imports.push(m[2]);
    // 괄호 짝
    const stack = [];
    for (let i = 0; i < b.length; i++) {
      const ch = b[i];
      if (ch === '{' || ch === '(' || ch === '[') stack.push([ch, i]);
      else if (ch === '}' || ch === ')' || ch === ']') {
        const want = ch === '}' ? '{' : ch === ')' ? '(' : '[', top = stack.pop();
        if (!top || top[0] !== want) { out.balanced = false; out.problems.push({ line: s.line(i), reason: `짝이 맞지 않는 '${ch}'` + (top ? ` (${s.line(top[1])}줄의 '${top[0]}' 와)` : '') }); break; }
      }
    }
    if (out.balanced && stack.length) { out.balanced = false; const t = stack[stack.length - 1]; out.problems.push({ line: s.line(t[1]), reason: `닫히지 않은 '${t[0]}' (파일 끝까지)` }); }
    // 형 선언 (class · interface · enum · record · @interface) — 익명 클래스(new X() { })는 선언이 아니므로 제외
    const re = /(^|[\s;{}])((?:(?:public|protected|private|static|abstract|final|sealed|non-sealed|strictfp)\s+)*)(class|interface|enum|record|@interface)\s+([A-Za-z_$][\w$]*)/g;
    let m;
    while ((m = re.exec(b))) {
      const at = m.index + m[1].length, open = b.indexOf('{', at + m[0].length - m[1].length);
      if (open < 0) continue;
      const head = b.slice(at, open);
      if (/[;=]/.test(head.replace(/<[^<>]*>/g, ''))) continue;   // "Foo.class;" 같은 것
      const close = matchClose(b, open);
      const tail = head.slice(head.indexOf(m[4]) + m[4].length).replace(/<[^<>]*(<[^<>]*>[^<>]*)*>/g, ' ');
      const ext = /\bextends\s+([\w.$]+)/.exec(tail), impl = /\bimplements\s+([^{]+)/.exec(tail);
      out.types.push({ kind: m[3], name: m[4], ext: ext ? ext[1] : '', impl: impl ? impl[1].split(',').map(x => x.trim().replace(/<.*$/, '')).filter(Boolean) : [],
        abstract: /\babstract\b/.test(m[2]) || m[3] === 'interface', mods: (m[2].match(MODS) || []), line: s.line(at), start: at, open, close });
    }
    // 깊이 · 바깥 형
    out.types.sort((a, c) => a.start - c.start);
    for (const t of out.types) {
      const outer = out.types.filter(o => o !== t && o.open < t.start && (o.close < 0 || o.close > t.start)).sort((a, c) => c.start - a.start)[0];
      t.outer = outer ? outer.name : ''; t.depth = outer ? outer.depth + 1 : 0;
      // 메서드 안 지역 클래스: 바깥 형 본문 바로 아래가 아니면 local
      if (outer) { let d = 0; for (let i = outer.open + 1; i < t.start; i++) { if (b[i] === '{') d++; else if (b[i] === '}') d--; } t.local = d > 0; } else t.local = false;
    }
    out._s = s;
    return out;
  }

  /** 형 본문 (안쪽 형 본문은 비움) — src 원문 기준 */
  function body(src, st, t) {
    if (!t || t.close < 0) return '';
    let txt = String(src).slice(t.open + 1, t.close);
    const inner = st.types.filter(o => o !== t && o.start > t.open && o.close > 0 && o.close < t.close).sort((a, c) => c.start - a.start);
    for (const o of inner) { const a = o.start - t.open - 1, z = o.close - t.open; if (a >= 0 && z <= txt.length) txt = txt.slice(0, a) + blankOf(txt.slice(a, z)) + txt.slice(z); }
    return txt;
  }

  /** enum 상수 이름들 */
  function enumConstants(src, name) {
    const st = structure(src), t = st.types.find(x => x.kind === 'enum' && (!name || x.name === name));
    if (!t || t.close < 0) return [];
    const b = st._s.bare.slice(t.open + 1, t.close), out = [];
    let d = 0, cur = '';
    for (let i = 0; i < b.length; i++) {
      const ch = b[i];
      if (ch === '(' || ch === '{' || ch === '[') { d++; continue; }
      if (ch === ')' || ch === '}' || ch === ']') { d--; continue; }
      if (d) continue;
      if (ch === ',' || ch === ';') { const m = /^\s*(?:@\w+\s*)*([A-Za-z_$][\w$]*)/.exec(cur); if (m) out.push(m[1]); cur = ''; if (ch === ';') break; continue; }
      cur += ch;
    }
    if (cur.trim()) { const m = /^\s*(?:@\w+\s*)*([A-Za-z_$][\w$]*)\s*$/.exec(cur); if (m) out.push(m[1]); }
    return out;
  }

  /** 메서드 전체 · 본문 (괄호 짝은 문자열 · 주석을 건너뜀) */
  function method(src, re) {
    const s = scan(src), m = re.exec(s.bare); if (!m) return null;
    const open = s.bare.indexOf('{', m.index + m[0].length - 1); if (open < 0) return null;
    const close = matchClose(s.bare, open), end = close < 0 ? src.length : close;
    const start = src.lastIndexOf('\n', m.index) + 1;
    return { body: src.slice(open + 1, end), code: src.slice(start, end + 1), line: s.line(start) };
  }
  /** switch 의 case NAME: … (case A: default: 처럼 붙은 것도) */
  function caseBodies(bodyTxt, name) {
    const out = [], re = new RegExp('case\\s+' + name + '\\s*:', 'g'); let m;
    while ((m = re.exec(bodyTxt))) {
      const rest = bodyTxt.slice(m.index + m[0].length).replace(/^(\s*(default|case\s+\w+)\s*:)+/, '');
      const end = rest.search(/\b(case\s+\w+\s*:|default\s*:)/);
      out.push(end < 0 ? rest : rest.slice(0, end));
    }
    return out;
  }

  /** Assets.java 의 안쪽 클래스별 문자열 상수 → { 'Sprites.RAT': 'sprites/rat.png' } */
  function assets(src) {
    const st = structure(src), out = { map: {}, consts: [], unresolved: [] };
    for (const t of st.types) {
      if (t.depth === 0) continue;
      const own = body(src, st, t), base = src.slice(0, t.open + 1).split('\n').length;
      const local = {};
      for (const m of own.matchAll(/static\s+final\s+String\s+(\w+)\s*=\s*([^;]+);/g)) {
        const key = t.name + '.' + m[1], expr = m[2].trim(), line = base + own.slice(0, m.index).split('\n').length - 1;
        let val = null;
        if (/^"[^"]*"$/.test(expr)) val = expr.slice(1, -1);
        else {   // "a" + B + "c" 처럼 이어 붙인 것 — 같은 클래스 상수만
          const parts = expr.split('+').map(x => x.trim()); let ok = true, acc = '';
          for (const p of parts) { if (/^"[^"]*"$/.test(p)) acc += p.slice(1, -1); else if (local[p] != null) acc += local[p]; else if (out.map[p] != null) acc += out.map[p]; else { ok = false; break; } }
          if (ok) val = acc;
        }
        if (val == null) { out.unresolved.push({ key, expr, line }); continue; }
        local[m[1]] = val; out.map[key] = val; out.consts.push({ key, path: val, line });
      }
    }
    return out;
  }

  /** 간단한 정수식 계산 (상수 · + - * / · 괄호) */
  function evalInt(expr, env) {
    const e = String(expr).replace(/\b([A-Za-z_]\w*)\b/g, k => (k in env ? '(' + env[k] + ')' : 'NaN'));
    if (!/^[\d\s+\-*/()NaN.]+$/.test(e)) return null;
    try { const v = Function('return (' + e + ')')(); return Number.isFinite(v) ? Math.trunc(v) : null; } catch (_) { return null; }
  }
  /** ItemSpriteSheet.java → 칸 크기 · 한 줄 칸 수 · 번호 상수 */
  function itemSheet(src) {
    if (!src) return null;
    let s = scan(src).code; const cut = s.indexOf('class Icons'); if (cut > 0) s = s.slice(0, cut);
    const env = {}, num = name => { const m = new RegExp('static\\s+final\\s+int\\s+' + name + '\\s*=\\s*([^;]+);').exec(s); return m ? evalInt(m[1], env) : null; };
    const size = num('SIZE'); if (size != null) env.SIZE = size;
    const txw = num('TX_WIDTH'); if (txw != null) env.TX_WIDTH = txw;
    const txh = num('TX_HEIGHT'); if (txh != null) env.TX_HEIGHT = txh;
    const width = num('WIDTH'); if (width != null) env.WIDTH = width;
    const scaleM = /int\s+scale\s*=\s*(\d+)/.exec(s);
    const xyM = /int\s+xy\s*\(\s*int\s+(\w+)\s*,\s*int\s+(\w+)\s*\)\s*\{([^}]*)\}/.exec(s);
    const origin1 = xyM ? new RegExp('\\b' + xyM[1] + '\\s*-=\\s*1').test(xyM[3]) : true;
    const cols = width != null ? width : (txw && size ? Math.floor(txw / size) : 16);
    const out = { cell: size || 16, cols, origin1, scale: scaleM ? +scaleM[1] : 1, txWidth: txw, txHeight: txh, consts: {}, unresolved: [] };
    const xy = (x, y) => origin1 ? (x - 1) + cols * (y - 1) : x + cols * y;
    const re = /(public|private)?\s*static\s+final\s+int\s+(\w+)\s*=\s*([^;]+);/g; let m;
    const val = e => { e = e.trim(); let t = 0;
      for (const part of e.replace(/-/g, '+-').split('+')) { const p = part.trim(); if (!p) continue; let v;
        const x = /^xy\(\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(p);
        if (x) v = xy(+x[1], +x[2]); else if (/^-?\d+$/.test(p)) v = +p; else if (p in env) v = env[p]; else if (p[0] === '-' && p.slice(1) in env) v = -env[p.slice(1)]; else return null;
        t += v; }
      return t; };
    while ((m = re.exec(s))) {
      if (['WIDTH', 'SIZE', 'TX_WIDTH', 'TX_HEIGHT'].includes(m[2])) continue;
      const v = val(m[3]); if (v === null) { if (m[1] === 'public') out.unresolved.push(m[2]); continue; }
      env[m[2]] = v; if (m[1] === 'public') out.consts[m[2]] = v;
    }
    return Object.keys(out.consts).length > 20 ? out : Object.assign(out, { consts: null });
  }

  /** 캐릭터 스프라이트 클래스 → 시트 · 프레임 크기 · 애니메이션 (원작 tools/data/extract_spd_chars.py 와 같은 규칙) */
  function sprite(src, assetsMap, inner) {
    const out = { tex: '', sheet: '', frame: null, anims: {}, texOffset: 0, parent: '', problems: [] };
    if (!src) { out.problems.push('소스 없음'); return out; }
    const st = structure(src);
    let own = src;
    if (inner) {
      const t = st.types.find(x => x.name === inner);
      if (t) { const o = /texOffset\s*\(\s*\)\s*\{\s*return\s+(\d+)/.exec(body(src, st, t)); if (o) out.texOffset = +o[1]; }
    } else {
      const top = st.types.find(x => x.depth === 0); if (top) { out.parent = top.ext; own = body(src, st, top); }
      const cm = /int\s+c\s*=\s*(?:[^;?]*\?\s*\d+\s*:\s*)?(\d+)\s*;/.exec(own); if (cm) out.texOffset = +cm[1];
    }
    const tex = /texture\(\s*Assets\.(\w+)\.(\w+)\s*\)/.exec(own);
    if (tex) { out.tex = tex[1] + '.' + tex[2]; out.sheet = (assetsMap || {})[out.tex] || ''; if (!out.sheet) out.problems.push(`Assets.${out.tex} 상수를 찾지 못함`); }
    else if (/texture\(/.test(own)) out.problems.push('그림을 코드로 고름 (texture(...) 가 상수가 아님)');
    // 프레임 크기: 숫자 · 같은 파일의 int 상수 · "return 숫자;" 한 줄짜리 메서드 (texHeight() 등)
    const numOf = e => { e = String(e).trim(); if (/^\d+$/.test(e)) return +e;
      const c1 = new RegExp('\\bint\\s+' + e.replace(/\W/g, '') + '\\s*=\\s*(\\d+)\\s*;').exec(src); if (c1 && /^\w+$/.test(e)) return +c1[1];
      const mm = /^(\w+)\s*\(\s*\)$/.exec(e); if (mm) { const b = new RegExp('\\bint\\s+' + mm[1] + '\\s*\\(\\s*\\)\\s*\\{\\s*return\\s+(\\d+)\\s*;\\s*\\}').exec(src); if (b) return +b[1]; }
      return null; };
    const film = /new\s+TextureFilm\(\s*texture\s*,\s*([^,()]+(?:\(\s*\))?)\s*,\s*([^,()]+(?:\(\s*\))?)\s*\)/.exec(own);
    if (film) { const fw = numOf(film[1]), fh = numOf(film[2]); if (fw != null && fh != null) out.frame = [fw, fh]; else out.problems.push(`프레임 크기를 코드로 정함 (TextureFilm(texture, ${film[1].trim()}, ${film[2].trim()}))`); }
    else if (/new\s+TextureFilm\(/.test(own)) out.problems.push('프레임 크기를 코드로 정함 (TextureFilm 인자가 숫자가 아님)');
    const c = out.texOffset;
    for (const a of ['idle', 'run', 'attack', 'zap', 'operate', 'die']) {
      const m = new RegExp('\\b' + a + '\\s*=\\s*new\\s+(?:MovieClip\\.)?Animation\\(\\s*([^,]+?)\\s*,\\s*(true|false)\\s*\\)\\s*;\\s*' + a + '\\.frames\\(\\s*\\w+\\s*,([^;]*)\\);').exec(own);
      if (!m) continue;
      const fpsN = m[1].match(/\d+/g), frames = [];
      for (const tok of m[3].split(',')) { const tt = tok.trim(); if (!tt) continue; const n = tt.match(/\d+/); if (!n) continue; frames.push(+n[0] + (/\bc\b/.test(tt) ? c : 0)); }
      out.anims[a] = { frames, fps: fpsN ? +fpsN[fpsN.length - 1] : 10, loop: m[2] === 'true' };
    }
    if (!out.anims.idle) out.problems.push('idle 애니메이션을 읽지 못함');
    return out;
  }

  /** HeroClass.spritesheet() 의 switch (this) → 직업별 시트 경로 */
  function heroSheets(src, assetsMap) {
    const out = { map: {}, def: '', consts: {} };
    const m = method(src || '', /String\s+spritesheet\s*\(\s*\)\s*\{/); if (!m) return out;
    const sw = /switch\s*\(\s*this\s*\)\s*\{/.exec(m.body); if (!sw) return out;
    const b = m.body.slice(sw.index + sw[0].length);
    const re = /((?:\s*(?:case\s+\w+|default)\s*:)+)\s*return\s+Assets\.(\w+)\.(\w+)\s*;/g; let x;
    while ((x = re.exec(b))) {
      const key = x[2] + '.' + x[3], p = (assetsMap || {})[key] || '';
      for (const c of x[1].matchAll(/case\s+(\w+)/g)) { out.map[c[1]] = p; out.consts[c[1]] = key; }
      if (/default/.test(x[1])) out.def = p;
    }
    return out;
  }
  function heroFrame(src) {
    const w = /FRAME_WIDTH\s*=\s*(\d+)/.exec(src || ''), h = /FRAME_HEIGHT\s*=\s*(\d+)/.exec(src || '');
    return w && h ? [+w[1], +h[1]] : null;
  }

  /** build.gradle 의 ext 값들 (appName · appVersionName += '…' 등) */
  function gradleProps(src) {
    const s = scan(src || '').code, out = {};
    for (const m of s.matchAll(/^\s*(\w+)\s*(\+?=)\s*(.+)$/gm)) {
      const v = m[3].trim(); let val;
      const q = /^(['"])(.*)\1\s*$/.exec(v);
      if (q) val = q[2]; else if (/^-?\d+$/.test(v)) val = +v; else if (/^JavaVersion\.(\w+)/.test(v)) val = /^JavaVersion\.(\w+)/.exec(v)[1]; else continue;
      if (m[2] === '+=' && typeof out[m[1]] === 'string') out[m[1]] += val; else out[m[1]] = val;
    }
    out.plugins = [...new Set([...s.matchAll(/apply\s+plugin\s*:\s*['"]([^'"]+)['"]/g), ...s.matchAll(/\bid\s*\(?\s*['"]([\w.\-]+)['"]/g)].map(x => x[1]))];
    out.dependencies = [...s.matchAll(/^\s*(implementation|api|compileOnly|runtimeOnly|annotationProcessor|classpath)\s*\(?\s*(project\s*\(\s*['"][^'"]+['"]\s*\)|['"][^'"]+['"])/gm)].map(x => ({ conf: x[1], dep: x[2].replace(/\s+/g, '') }));
    return out;
  }
  /** settings.gradle 의 include (여러 줄 · 한 문장에 여러 모듈 · include(':a') 모두) */
  function gradleIncludes(src) {
    const s = scan(src || '').code, out = { modules: [], statements: [], projectDirs: {} }, line = lineIndex(s);
    const re = /(^|[\s;)])include\b\s*\(?/g; let m;
    while ((m = re.exec(s))) {
      let i = m.index + m[0].length, txt = '';
      // 문장 끝: 줄 끝인데 마지막 글자가 ',' 가 아니면
      while (i < s.length) { const nl = s.indexOf('\n', i), seg = s.slice(i, nl < 0 ? s.length : nl); txt += seg + '\n'; i = nl < 0 ? s.length : nl + 1; if (!/,\s*$/.test(seg)) break; }
      const mods = [...txt.matchAll(/['"](:?[\w\-.:]+)['"]/g)].map(x => x[1].startsWith(':') ? x[1] : ':' + x[1]);
      if (mods.length) { out.statements.push({ line: line(m.index + m[1].length), modules: mods }); mods.forEach(x => { if (!out.modules.includes(x)) out.modules.push(x); }); }
    }
    for (const p of s.matchAll(/project\s*\(\s*['"](:[\w\-.:]+)['"]\s*\)\s*\.projectDir\s*=\s*(?:new\s+File\s*\(\s*(?:settingsDir|rootDir)\s*,\s*)?['"]([^'"]+)['"]/g)) out.projectDirs[p[1]] = p[2];
    return out;
  }
  /** 모듈 build.gradle 의 sourceSets (srcDirs = [ … ] / srcDir '…') */
  function gradleSrcDirs(src) {
    const s = scan(src || '').code, out = { java: [], assets: [], res: [], resources: [] };
    for (const m of s.matchAll(/\b(java|assets|res|resources)\s*\.\s*srcDirs?\s*(?:=|\+=)?\s*\(?\s*(\[[^\]]*\]|['"][^'"]+['"])/g))
      for (const q of m[2].matchAll(/['"]([^'"]+)['"]/g)) if (!out[m[1]].includes(q[1])) out[m[1]].push(q[1]);
    return out;
  }

  return { lineIndex, scan, matchClose, structure, body, enumConstants, method, caseBodies, assets, evalInt, itemSheet, sprite, heroSheets, heroFrame, gradleProps, gradleIncludes, gradleSrcDirs };
});
