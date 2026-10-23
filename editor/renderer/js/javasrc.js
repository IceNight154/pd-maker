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
//    heroSprite(src)           → { frame, rowH, anims, scale } (11차: updateArmor · tiers() 구조)
//    heroSelectIcons(src)      → { CLS: { kind:'icons'|'sheet', … } } (11차: HeroSelectScene 의 HeroBtn 아이콘)
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
      // 12차: 바깥 형의 상수도 (원작 Pixel Dungeon 은 Assets.WARRIOR 처럼 안쪽 클래스 없이) — 열쇠는 "WARRIOR"
      const own = body(src, st, t), base = src.slice(0, t.open + 1).split('\n').length;
      const local = {};
      for (const m of own.matchAll(/static\s+final\s+String\s+(\w+)\s*=\s*([^;]+);/g)) {
        const key = t.depth === 0 ? m[1] : t.name + '.' + m[1], expr = m[2].trim(), line = base + own.slice(0, m.index).split('\n').length - 1;
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
    const tex = /texture\(\s*Assets\.(?:(\w+)\.)?(\w+)\s*\)/.exec(own);   // 원작 Pixel Dungeon: Assets.RAT (안쪽 클래스 없음)
    if (tex) { out.tex = tex[1] ? tex[1] + '.' + tex[2] : tex[2]; out.sheet = (assetsMap || {})[out.tex] || ''; if (!out.sheet) out.problems.push(`Assets.${out.tex} 상수를 찾지 못함`); }
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
    const re = /((?:\s*(?:case\s+\w+|default)\s*:)+)\s*return\s+Assets\.(?:(\w+)\.)?(\w+)\s*;/g; let x;
    while ((x = re.exec(b))) {
      const key = x[2] ? x[2] + '.' + x[3] : x[3], p = (assetsMap || {})[key] || '';
      for (const c of x[1].matchAll(/case\s+(\w+)/g)) { out.map[c[1]] = p; out.consts[c[1]] = key; }
      if (/default/.test(x[1])) out.def = p;
    }
    return out;
  }
  function heroFrame(src) {
    const w = /FRAME_WIDTH\s*=\s*(\d+)/.exec(src || ''), h = /FRAME_HEIGHT\s*=\s*(\d+)/.exec(src || '');
    return w && h ? [+w[1], +h[1]] : null;
  }

  /** 11차: HeroSprite.java 의 실제 그림 구조 — FRAME_* 상수만이 아니라 updateArmor() 가 자르는 칸 · tiers() 줄 높이 · 동작
   *  → { frame:[w,h], rowH, anims:{ 이름: { frames, fps, loop } }, scale, avatarX, evidence:{…} } | null
   *  (원작: tiers() 줄 15 · 칸 12×15 · ARK: tiers() 줄 36 · 칸 36×34 · 동작 번호도 판마다 다름) */
  function heroSprite(src) {
    if (!src) return null;
    const s = scan(src).code, env = {};
    for (const m of s.matchAll(/static\s+final\s+int\s+(\w+)\s*=\s*([^;]+);/g)) { const v = evalInt(m[2], env); if (v != null) env[m[1]] = v; }
    const out = { frame: null, rowH: null, anims: {}, scale: 1, avatarX: null, evidence: {} };
    if (env.FRAME_WIDTH && env.FRAME_HEIGHT) { out.frame = [env.FRAME_WIDTH, env.FRAME_HEIGHT]; out.evidence.frame = 'FRAME_WIDTH · FRAME_HEIGHT'; }
    const tr = method(src, /TextureFilm\s+tiers\s*\(\s*\)\s*\{/);
    if (tr) { const m = /new\s+TextureFilm\s*\(([^;]*)\)\s*;/.exec(scan(tr.body).code); const a = m ? splitArgs(m[1]) : [];
      if (a.length === 3) { const v = evalInt(a[2], env); if (v) { out.rowH = v; out.evidence.rowH = 'tiers(): new TextureFilm(' + a.map(x => x.trim()).join(', ') + ')'; } } }
    const ua = method(src, /void\s+updateArmor\s*\(\s*\)\s*\{/);
    if (ua) {
      const b = scan(ua.body).code;
      // 갑옷 줄 안에서 자르는 칸: new TextureFilm( tiers(), <단계>, W, H ) — spearForm 같은 다른 분기의 칸은 쓰지 않음
      for (const m of b.matchAll(/new\s+TextureFilm\s*\(([^;]*)\)\s*;/g)) { const a = splitArgs(m[1]); if (a.length === 4 && /tiers\s*\(\s*\)/.test(a[0])) { const w = evalInt(a[2], env), h = evalInt(a[3], env);
        if (w && h) { out.frame = [w, h]; out.evidence.frame = 'updateArmor(): new TextureFilm(' + a.map(x => x.trim()).join(', ') + ')'; break; } } }
      const fps = {}, loop = {};
      for (const m of b.matchAll(/\b(\w+)\s*=\s*new\s+Animation\s*\(([^;]*)\)\s*;/g)) { const a = splitArgs(m[2]); const f = evalInt(a[0], env); if (f != null) { fps[m[1]] = f; loop[m[1]] = /true/.test(a[1] || ''); } }
      for (const m of b.matchAll(/\b(\w+)\s*\.\s*frames\s*\(([^;]*)\)\s*;/g)) { const a = splitArgs(m[2]).slice(1).map(x => evalInt(x, env)); if (!(m[1] in fps) || !a.length || a.some(x => x == null)) continue;
        out.anims[m[1]] = { frames: a, fps: fps[m[1]], loop: loop[m[1]] }; }
      for (const m of b.matchAll(/\b(\w+)\s*=\s*(\w+)\s*\.\s*clone\s*\(\s*\)\s*;/g)) if (out.anims[m[2]] && !out.anims[m[1]]) out.anims[m[1]] = JSON.parse(JSON.stringify(out.anims[m[2]]));
      if (Object.keys(out.anims).length) out.evidence.anims = 'updateArmor(): ' + Object.keys(out.anims).join(' · ');
    }
    // 그림 배율: 생성자 · updateArmor 에 scale.set 이 없으면 원래 크기 (1)
    const sc = /\bscale\s*\.\s*set\s*\(\s*([\d.]+)f?\s*\)/.exec(s); if (sc) { out.scale = +sc[1]; out.evidence.scale = 'scale.set(' + sc[1] + ')'; } else out.evidence.scale = 'scale.set 없음 → 원래 크기';
    const av = /uvRect\s*\(\s*(\d+)\s*,\s*0\s*,\s*FRAME_WIDTH/.exec(s); if (av) out.avatarX = +av[1];
    return out.frame ? out : null;
  }
  /** HeroSelectScene 의 직업 버튼 아이콘 → { CLS: { kind:'icons', name } | { kind:'sheet', rect:[x,y,w,h] } } · 기본(default) 분기는 '*' */
  function heroSelectIcons(src) {
    const out = {}; if (!src) return out;
    const s = scan(src).code, at = s.search(/class\s+HeroBtn\b/); if (at < 0) return out;
    const ctor = /HeroBtn\s*\(\s*HeroClass\s+\w+\s*\)\s*\{/.exec(s.slice(at)); if (!ctor) return out;
    const open = at + ctor.index + ctor[0].length - 1, body = s.slice(open + 1, matchClose(s, open));
    const one = t => { let m = /icon\s*\(\s*new\s+Image\s*\(\s*Icons\s*\.\s*(\w+)\s*\.\s*get\s*\(\s*\)\s*\)\s*\)/.exec(t) || /icon\s*\(\s*Icons\s*\.\s*get\s*\(\s*Icons\s*\.\s*(\w+)\s*\)\s*\)/.exec(t);
      if (m) return { kind: 'icons', name: m[1] };
      m = /icon\s*\(\s*new\s+Image\s*\(\s*\w+\s*\.\s*spritesheet\s*\(\s*\)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)\s*\)/.exec(t);
      return m ? { kind: 'sheet', rect: [+m[1], +m[2], +m[3], +m[4]] } : null; };
    const sw = /switch\s*\(\s*\w+\s*\)\s*\{/.exec(body);
    if (sw) { const b = body.slice(sw.index + sw[0].length);
      const re = /((?:\s*(?:case\s+\w+|default)\s*:)+)([\s\S]*?)(?=\bcase\s+\w+\s*:|\bdefault\s*:|$)/g; let m;
      while ((m = re.exec(b))) { const ic = one(m[2]); if (!ic) continue; for (const c of m[1].matchAll(/case\s+(\w+)/g)) out[c[1]] = ic; if (/default/.test(m[1])) out['*'] = ic; } }
    else { const ic = one(body); if (ic) out['*'] = ic; }
    return out;
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

  // ================================================================ 10차: 저장소 데이터 (영웅 스킨 · 배지 · 지형 · 층 구성 · 층 연결 · 고정 맵 · 타이틀)

  /** enum 상수와 인자: [{ name, args: ['4', 'BadgeType.GLOBAL'], line }] — 인자 없는 상수도 (args: []) */
  function enumEntries(src, name) {
    const st = structure(src), t = st.types.find(x => x.kind === 'enum' && (!name || x.name === name));
    if (!t || t.close < 0) return [];
    const b = st._s.bare, out = [];
    let i = t.open + 1, d = 0, start = i;
    const flush = end => {
      const seg = b.slice(start, end), m = /^\s*(?:@\w+\s*)*([A-Za-z_$][\w$]*)\s*(\(([\s\S]*)\))?\s*(\{[\s\S]*\})?\s*$/.exec(seg);
      if (m) { const args = m[3] !== undefined ? splitArgs(String(src).slice(start + seg.indexOf('(') + 1, start + seg.lastIndexOf(')'))) : [];
        out.push({ name: m[1], args, line: st._s.line(start + seg.search(/\S/)) }); }
    };
    for (; i < t.close; i++) {
      const ch = b[i];
      if (ch === '(' || ch === '{' || ch === '[') d++;
      else if (ch === ')' || ch === '}' || ch === ']') d--;
      else if (!d && (ch === ',' || ch === ';')) { flush(i); start = i + 1; if (ch === ';') return out; }
    }
    if (b.slice(start, t.close).trim()) flush(t.close);
    return out;
  }
  /** 인자 목록 나누기 (괄호 · 문자열 안의 쉼표는 그대로) */
  function splitArgs(txt) {
    const out = []; let d = 0, cur = '', q = '';
    for (let i = 0; i < txt.length; i++) {
      const ch = txt[i];
      if (q) { cur += ch; if (ch === '\\') { cur += txt[++i] || ''; } else if (ch === q) q = ''; continue; }
      if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
      if ('([{'.includes(ch)) d++; else if (')]}'.includes(ch)) d--;
      if (ch === ',' && !d) { out.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  /** HeroClass.spritesheet() 안에서 this 가 아닌 값으로 고르는 시트 (스킨 등) → [{ on, case, key, sheet }] */
  function heroSkins(src, assetsMap) {
    const m = method(src || '', /String\s+spritesheet\s*\(\s*\)\s*\{/); if (!m) return [];
    const out = [], b = m.body;
    for (const sw of b.matchAll(/switch\s*\(\s*([^)]+?)\s*\)\s*\{/g)) {
      if (/^this$/.test(sw[1].trim())) continue;
      const open = sw.index + sw[0].length - 1, close = matchClose(scan(b).bare, open), seg = b.slice(open + 1, close < 0 ? b.length : close);
      for (const x of seg.matchAll(/((?:\s*(?:case\s+[\w.]+|default)\s*:)+)\s*return\s+Assets\.(\w+)\.(\w+)\s*;/g)) {
        const key = x[2] + '.' + x[3];
        for (const c of x[1].matchAll(/case\s+([\w.]+)|default/g)) out.push({ on: sw[1].trim(), case: c[1] || 'default', key, sheet: (assetsMap || {})[key] || '' });
      }
    }
    return out;
  }

  /** Terrain.java → { EMPTY: 1, WALL: 4, … } */
  function terrain(src) {
    const out = {};
    for (const m of scan(src || '').code.matchAll(/static\s+final\s+int\s+([A-Z][A-Z0-9_]*)\s*=\s*(-?(?:0x[0-9a-fA-F]+|\d+))\s*;/g)) out[m[1]] = /0x/i.test(m[2]) ? parseInt(m[2], 16) : +m[2];   // AVOID = 0x20 (ARK 은 플래그 값을 지형 칸에 그대로 씀)
    return out;
  }

  /** 문장 단위 미니 해석기 (if · else · switch · case · 블록 · 한 문장) — 층 구성 읽기용. bare(주석 · 문자열 걷은 것) 기준 */
  function parseStatements(txt, from, to, ctx, onStmt, line) {
    let i = from;
    const skipWs = () => { while (i < to && /\s/.test(txt[i])) i++; };
    const parenAt = j => { const o = txt.indexOf('(', j); const c = matchClose(txt, o); return [o, c]; };
    const stmt = c => {
      skipWs(); if (i >= to) return;
      if (txt[i] === '{') { const c2 = matchClose(txt, i); parseStatements(txt, i + 1, c2 < 0 ? to : c2, c, onStmt, line); i = (c2 < 0 ? to : c2) + 1; return; }
      const head = txt.slice(i, Math.min(to, i + 12));
      if (/^if\s*\(/.test(head)) {
        const [o, cl] = parenAt(i); const cond = txt.slice(o + 1, cl).trim(); i = cl + 1;
        stmt(c.concat([{ if: cond }]));
        skipWs();
        if (/^else\b/.test(txt.slice(i, i + 5))) { i += 4; stmt(c.concat([{ if: cond, not: true }])); }
        return;
      }
      if (/^switch\s*\(/.test(head)) {
        const [o, cl] = parenAt(i); const on = txt.slice(o + 1, cl).trim(); const bo = txt.indexOf('{', cl); const bc = matchClose(txt, bo);
        const inner = txt.slice(bo + 1, bc); let labels = [], k = 0, segStart = 0; const segs = [];
        const lab = /\b(case\s+([^:]+?)\s*:|default\s*:)/g; let lm; let lastEnd = 0;
        // 같은 깊이의 case 라벨만 (안쪽 switch 의 라벨은 그 안에서)
        const depthAt = pos => { let d = 0; for (let q = 0; q < pos; q++) { if (inner[q] === '{') d++; else if (inner[q] === '}') d--; } return d; };
        const marks = []; while ((lm = lab.exec(inner))) if (depthAt(lm.index) === 0) marks.push({ at: lm.index, end: lm.index + lm[0].length, val: lm[2] ? lm[2].trim() : 'default' });
        for (let mi = 0; mi < marks.length; mi++) {
          const segFrom = marks[mi].end, segTo = mi + 1 < marks.length ? marks[mi + 1].at : inner.length;
          labels.push(marks[mi].val);
          if (inner.slice(segFrom, segTo).trim()) { parseStatements(txt, bo + 1 + segFrom, bo + 1 + segTo, c.concat([{ switch: on, cases: labels.slice() }]), onStmt, line); labels = []; }
        }
        i = bc + 1; return;
      }
      // 한 문장 (; 까지, 괄호 안의 ; 는 건너뜀)
      let j = i, d = 0;
      while (j < to) { const ch = txt[j]; if ('([{'.includes(ch)) d++; else if (')]}'.includes(ch)) d--; else if (ch === ';' && d <= 0) break; j++; }
      onStmt(txt.slice(i, j).trim(), c, line ? line(i) : 0);
      i = j + 1;
    };
    while (i < to) { const before = i; stmt(ctx); if (i <= before) i = before + 1; }
  }

  /** Dungeon.newLevel() → 층 자리 [{ depth: [n…] | 'default', branch: n | null, cls, conds: ['extrastage_Gavial', …], line }] + 판정 메서드 내용 */
  function levelSlots(dungeonSrc) {
    const src = String(dungeonSrc || ''), s = scan(src), out = { slots: [], line: 0, bossDepths: [], problems: [] };
    const mm = /static\s+Level\s+newLevel\s*\(\s*\)\s*\{/.exec(s.bare); if (!mm) { out.problems.push('Dungeon.newLevel() 을 찾지 못함'); return out; }
    out.line = s.line(mm.index);
    const open = s.bare.indexOf('{', mm.index + mm[0].length - 1), close = matchClose(s.bare, open);
    // 같은 파일의 boolean 판정 메서드 (isInRhodes() { return depth == 0 && … }) — 조건을 풀어 볼 때 씀
    const preds = {};
    for (const p of s.bare.matchAll(/static\s+boolean\s+(\w+)\s*\(\s*\)\s*\{\s*return\s+([^;]+);\s*\}/g)) preds[p[1]] = p[2].trim();
    const bl = /static\s+boolean\s+bossLevel\s*\(\s*int\s+depth\s*\)\s*\{\s*return\s+([^;]+);/.exec(s.bare);
    if (bl) for (const q of bl[1].matchAll(/depth\s*==\s*(\d+)/g)) out.bossDepths.push(+q[1]);
    const atoms = cond => { const e = String(cond).replace(/\b(\w+)\s*\(\s*\)/g, (m, n) => preds[n] ? '(' + preds[n] + ')' : m); return e; };
    parseStatements(s.bare, open + 1, close, [], (st, ctx, line) => {
      const m = /^(\w+)\s*=\s*new\s+(\w+)\s*\(\s*\)$/.exec(st); if (!m) return;
      let depth = null, branch = null; const conds = [];
      for (const c of ctx) {
        if (c.switch) {
          const on = c.switch.replace(/^Dungeon\./, ''), vals = c.cases.filter(v => v !== 'default').map(v => +v).filter(Number.isFinite), def = c.cases.includes('default');
          if (on === 'depth') depth = def && !vals.length ? 'default' : vals.concat(def ? ['default'] : []);
          else if (on === 'branch') branch = def && !vals.length ? 'default' : (vals.length === 1 ? vals[0] : vals);
          else conds.push(`switch(${on}) = ${c.cases.join('|')}`);
          continue;
        }
        const e = atoms(c.if);
        if (!c.not) {
          const bq = /\bbranch\s*==\s*(\d+)/.exec(e); if (bq && branch == null) branch = +bq[1];
          const dq = /\bdepth\s*==\s*(\d+)/.exec(e); if (dq && depth == null) depth = [+dq[1]];
          const rest = e.split('&&').map(x => x.trim()).filter(x => !/\b(branch|depth)\s*(==|>=|<=|>|<)\s*\d+/.test(x.replace(/^\(|\)$/g, '')));
          rest.forEach(x => { const t = x.replace(/^\(+|\)+$/g, '').trim(); if (t) conds.push(t); });
        } else {
          if (!/\b(branch|depth)\s*==/.test(e)) conds.push('!(' + c.if + ')');
        }
      }
      out.slots.push({ depth, branch: branch == null ? 0 : branch, cls: m[2], conds, line });
    }, s.line);
    return out;
  }

  /** 이 파일에 있는 LevelTransition 생성 → [{ cell, type, destDepth, destBranch, destType, conds, line }] (도착지가 숫자로 적힌 것만 destDepth 를 채움) */
  function levelTransitions(src) {
    const s = scan(src || ''), out = [];
    for (const m of s.bare.matchAll(/new\s+LevelTransition\s*\(/g)) {
      const o = m.index + m[0].length - 1, c = matchClose(s.bare, o); if (c < 0) continue;
      const a = splitArgs(String(src).slice(o + 1, c)), type = (/Type\.(\w+)/.exec(a[2] || '') || [])[1] || '';
      const t = { cell: a[1] || '', type, destDepth: null, destBranch: null, destType: '', conds: enclosingIfs(s.bare, m.index), line: s.line(m.index) };
      if (a.length >= 6) { t.destDepth = /^-?\d+$/.test(a[3]) ? +a[3] : a[3]; t.destBranch = /^-?\d+$/.test(a[4]) ? +a[4] : a[4]; t.destType = (/Type\.(\w+)/.exec(a[5]) || [])[1] || ''; }
      out.push(t);
    }
    return out;
  }
  /** pos 를 둘러싼 if 조건들 (가까운 것이 뒤) */
  function enclosingIfs(bare, pos) {
    const out = []; let d = 0;
    for (let i = pos - 1; i >= 0; i--) {
      const ch = bare[i];
      if (ch === '}') d++;
      else if (ch === '{') { if (d > 0) { d--; continue; }
        const before = bare.slice(Math.max(0, i - 400), i), m = /(else\s+)?if\s*\(([\s\S]*)\)\s*$/.exec(before);
        if (m) { // 괄호 짝이 맞는 조건만
          const txt = m[2]; let k = 0, ok = true; for (const c2 of txt) { if (c2 === '(') k++; else if (c2 === ')') { k--; if (k < 0) { ok = false; break; } } }
          if (ok && k === 0) out.unshift(txt.trim().replace(/\s+/g, ' '));
        } else if (/\belse\s*$/.test(before)) out.unshift('else');
        else if (/\)\s*$/.test(before) && /\b(void|boolean|int|Level)\s+\w+\s*\([^)]*\)\s*$/.test(before)) break;   // 메서드 시작
      }
    }
    return out;
  }

  /** 고정 맵: Level.build() 를 글자 그대로 따라 그림 (setSize · Arrays.fill · Painter.fill · map[n] = …) — 모르는 문장이 지도를 바꿀 수 있으면 "확정 못 함" */
  function staticLayout(src, terrainMap) {
    const out = { determined: false, w: 0, h: 0, tiles: null, entrance: null, exit: null, unresolved: [], ops: 0, line: 0 };
    const m = method(src || '', /boolean\s+build\s*\(\s*\)\s*\{/); if (!m) { out.unresolved.push({ line: 0, text: 'build() 없음 — 지도를 다른 곳에서 만듦' }); return out; }
    out.line = m.line;
    const sc = scan(m.body), T = terrainMap || {}, env = {};
    let map = null, W = 0, H = 0;
    const lineOf = i => m.line + m.body.slice(0, i).split('\n').length - 1;
    const tval = e => { e = String(e).trim(); const q = /^Terrain\.([A-Z][A-Z0-9_]*)$/.exec(e) || /^([A-Z][A-Z0-9_]*)$/.exec(e); return q && T[q[1]] !== undefined ? T[q[1]] : null; };
    const ival = e => { const ex = Object.assign({ width: W, height: H }, env); if (out.entrance != null) ex.entrance = out.entrance; if (out.exit != null) ex.exit = out.exit;
      return evalInt(String(e).replace(/\bwidth\s*\(\s*\)/g, 'width').replace(/\bheight\s*\(\s*\)/g, 'height'), ex); };
    const touchesMap = st => /\bmap\b|Painter\.|setSize|buildFlagMaps|cleanWalls|\bset\s*\(/.test(st);
    const IGNORE = /^(entrance|exit)\s*=|^feeling\s*=|^return\b|^(customTiles|customWalls|transitions|mobs|heaps|plants|traps)\b|^\w+(\.\w+)*\s+\w+\s*=\s*new\s+\w+(\.\w+)*\s*\(\s*\)$|^\w+\.setRect\(|^(super\.)?(addVisuals|createMobs|createItems)\b/;
    parseStatements(sc.bare, 0, sc.bare.length, [], (st0, ctx, li) => {
      const st = sc.code.slice(sc.bare.indexOf(st0), sc.bare.indexOf(st0) + st0.length) || st0, at = lineOf(sc.bare.indexOf(st0));
      if (ctx.length) { if (touchesMap(st)) out.unresolved.push({ line: at, text: '조건 · 반복 안에서 지도를 바꿈: ' + st.slice(0, 80) }); return; }
      let q;
      if ((q = /^setSize\s*\(\s*([^,]+),\s*([^)]+)\)$/.exec(st))) { const w = ival(q[1]), h = ival(q[2]); if (w && h) { W = w; H = h; map = new Array(W * H).fill(0); out.ops++; } else out.unresolved.push({ line: at, text: st }); return; }
      if ((q = /^(?:final\s+)?int\s+(\w+)\s*=\s*([^;]+)$/.exec(st))) { const v = ival(q[2]); if (v !== null) env[q[1]] = v; else if (touchesMap(st)) out.unresolved.push({ line: at, text: st }); return; }
      if ((q = /^Arrays\.fill\s*\(\s*map\s*,\s*([^)]+)\)$/.exec(st))) { const v = tval(q[1]); if (map && v !== null) { map.fill(v); out.ops++; } else out.unresolved.push({ line: at, text: st }); return; }
      if ((q = /^Painter\.fill\s*\(\s*this\s*,([\s\S]+)\)$/.exec(st))) {
        const a = splitArgs(q[1]); if (a.length === 5 && map) { const [x, y, w, h] = a.slice(0, 4).map(ival), v = tval(a[4]);
          if ([x, y, w, h].every(n => n !== null) && v !== null) { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (xx >= 0 && yy >= 0 && xx < W && yy < H) map[yy * W + xx] = v; out.ops++; return; } }
        out.unresolved.push({ line: at, text: st }); return;
      }
      if (/^map\s*\[/.test(st)) {   // map[a] = map[b] = Terrain.X
        const parts = st.split('=').map(x => x.trim()), v = tval(parts[parts.length - 1]);
        const idx = parts.slice(0, -1).map(p => { const r = /^map\s*\[([^\]]+)\]$/.exec(p); return r ? ival(r[1]) : null; });
        if (map && v !== null && idx.every(n => n !== null && n >= 0 && n < map.length)) { idx.forEach(n => { map[n] = v; }); out.ops++; } else out.unresolved.push({ line: at, text: st });
        return;
      }
      if ((q = /^(entrance|exit)\s*=\s*([^;]+)$/.exec(st))) { const v = ival(q[2]); out[q[1]] = v; return; }
      if (IGNORE.test(st)) return;
      if (touchesMap(st) || /^\w+\s*\(/.test(st)) out.unresolved.push({ line: at, text: st.slice(0, 120) });
    }, null);
    out.w = W; out.h = H;
    if (map && !out.unresolved.length && out.ops > 0) { out.determined = true; out.tiles = map; }
    else if (map && out.ops > 0) out.partial = true;
    return out;
  }

  /** BannerSprites.java → { PIXEL_DUNGEON: [x, y, w, h] } (uvRect(x1, y1, x2, y2)) */
  function bannerRects(src) {
    const out = {};
    for (const m of scan(src || '').code.matchAll(/case\s+(\w+)\s*:\s*icon\.frame\(\s*icon\.texture\.uvRect\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)\s*\)/g)) out[m[1]] = [+m[2], +m[3], +m[4] - +m[2], +m[5] - +m[3]];
    return out;
  }

  /** TitleScene.create() → 음악 · 배경 · 로고 · 횃불 · 버튼(글 키 · 아이콘 · 여는 화면) · 줄 배치 (가로 · 세로) */
  function titleScene(src, assetsMap) {
    const out = { line: 0, music: [], background: [], logo: null, glow: null, torches: { land: [], port: [] }, buttons: [], rows: { land: [], port: [] }, btnHeight: null, version: false, problems: [] };
    const m = method(src || '', /void\s+create\s*\(\s*\)\s*\{/); if (!m) { out.problems.push('TitleScene.create() 를 찾지 못함'); return out; }
    out.line = m.line;
    const sc = scan(m.body), code = sc.code, bare = sc.bare, lineOf = i => m.line + m.body.slice(0, i).split('\n').length - 1;
    const A = assetsMap || {};
    for (const q of code.matchAll(/Assets\.Music\.(\w+)/g)) { const k = 'Music.' + q[1]; if (!out.music.some(x => x.key === k)) out.music.push({ key: k, file: A[k] || '' }); }
    for (const q of bare.matchAll(/\bnew\s+(Archs|TitleBackground|\w*Background\w*|\w*Archs\w*)\s*\(/g)) if (!out.background.includes(q[1])) out.background.push(q[1]);
    // 로고 · 빛나는 글씨: BannerSprites.get(…) — 첫 번째 = 로고, new Image(BannerSprites.get(…)) = 글씨 빛
    const typesOf = e => { const t = [...e.matchAll(/Type\.(\w+)/g)].map(x => x[1]); return /landscape\(\)\s*\?/.test(e) && t.length === 2 ? { land: t[0], port: t[1] } : { land: t[0], port: t[0] }; };
    for (const q of code.matchAll(/BannerSprites\.get\s*\(([^;]*?Type\.\w+[^;]*?)\)\s*[;)]/g)) {
      const t = typesOf(q[1]), isGlow = /new\s+Image\s*\(\s*$/.test(code.slice(Math.max(0, q.index - 30), q.index));
      if (isGlow && !out.glow) out.glow = t; else if (!out.logo) out.logo = t;
    }
    // 횃불: placeTorch(title.x + A, title.y + B) / (title.x + title.width - A, …) — if (landscape()) { … } else { … } 안이면 방향별
    for (const q of code.matchAll(/placeTorch\s*\(\s*title\.x\s*\+\s*(?:title\.width(?:\(\))?\s*-\s*)?(\d+)\s*,\s*title\.y\s*\+\s*(\d+)\s*\)/g)) {
      const fromRight = /width/.test(q[0]), pt = { x: +q[1], y: +q[2], fromRight }, ifs = enclosingIfs(bare, q.index);
      const land = ifs.some(c => /^landscape\(\)$/.test(c)), port = ifs.some(c => c === 'else') && !land;
      if (land) out.torches.land.push(pt); else if (port) out.torches.port.push(pt); else { out.torches.land.push(pt); out.torches.port.push(pt); }
    }
    // 버튼
    const KEY2ID = { enter: 'play', play: 'play' };
    for (const q of code.matchAll(/(?:\w+\s+)?(\w+)\s*=\s*new\s+(\w+)\s*\(\s*[^,()]+\s*,\s*Messages\.get\s*\(\s*(?:this|TitleScene\.class)\s*,\s*"(\w+)"\s*\)\s*\)/g)) {
      const v = q[1], key = q[3], ic = new RegExp('\\b' + v + '\\.icon\\s*\\(\\s*Icons\\.get\\s*\\(\\s*Icons\\.(\\w+)').exec(code);
      // 누르면 여는 화면: 익명 클래스 본문 또는 이름 있는 안쪽 클래스의 onClick
      let scene = '', window = '';
      const after = code.slice(q.index + q[0].length, q.index + q[0].length + 900), anon = /^\s*\{/.test(after);
      const look = anon ? after.slice(0, (matchClose(sc.bare.slice(q.index + q[0].length), after.indexOf('{')) + 1) || 900) : (() => { const ic2 = new RegExp('class\\s+' + q[2] + '\\b[\\s\\S]*?onClick\\s*\\(\\s*\\)\\s*\\{([\\s\\S]*?)\\n\\s{4,8}\\}').exec(String(src)); return ic2 ? ic2[1] : ''; })();
      const sw = /switch(?:NoFade|Scene)?\s*\(\s*(\w+)\.class/.exec(look); if (sw) scene = sw[1];
      const wn = /new\s+(Wnd\w+)/.exec(look); if (wn) window = wn[1];
      let icon = ic ? ic[1] : '', iconAlt = [];
      if (!icon) {   // 이름 있는 안쪽 클래스가 정하는 아이콘 — 조건에 따라 여럿이면 마지막(else = 보통 때)을 기본으로
        const S0 = scan(String(src)), cs = new RegExp('class\\s+' + q[2] + '\\b').exec(S0.bare); if (cs) { const co = S0.bare.indexOf('{', cs.index), cc = matchClose(S0.bare, co), cb = S0.code.slice(cs.index, cc < 0 ? cs.index + 1500 : cc), all = [...cb.matchAll(/icon\s*\(\s*Icons\.get\s*\(\s*Icons\.(\w+)/g)].map(x => x[1]); if (all.length) { icon = all[all.length - 1]; iconAlt = all.slice(0, -1); } } }
      out.buttons.push({ var: v, cls: q[2], key, id: KEY2ID[key] || key, icon, iconAlt, scene, window, line: lineOf(q.index) });
    }
    // 줄 배치: setRect 순서 — Y 가 .top() 이면 같은 줄, 아니면 새 줄
    const vars = new Map(out.buttons.map(b => [b.var, b.id]));
    // setRect 를 담은 if (landscape()) 블록 (앞의 횃불 자리 if 와 구별)
    let ifL = null; for (const q of bare.matchAll(/if\s*\(\s*landscape\s*\(\s*\)\s*\)\s*\{/g)) { const c0 = matchClose(bare, q.index + q[0].length - 1); if (c0 > 0 && /\.setRect\s*\(/.test(bare.slice(q.index, c0))) { ifL = q; break; } }
    const rowsOf = (from, to) => { const rows = []; for (const q of code.slice(from, to).matchAll(/(\w+)\.setRect\s*\(([^;]*)\)\s*;/g)) { const id = vars.get(q[1]); if (!id) continue; const a = splitArgs(q[2]); const same = /\.top\s*\(\s*\)/.test(a[1] || ''); if (same && rows.length) rows[rows.length - 1].push(id); else rows.push([id]); } return rows; };
    if (ifL) { const o = ifL.index + ifL[0].length - 1, c = matchClose(bare, o); out.rows.land = rowsOf(o, c);
      const el = /^\s*else\s*\{/.exec(bare.slice(c + 1)); if (el) { const o2 = c + 1 + el[0].length - 1, c2 = matchClose(bare, o2); out.rows.port = rowsOf(o2, c2); } }
    else { const r = rowsOf(0, code.length); out.rows.land = r; out.rows.port = r; }
    const bh = /BTN_HEIGHT\s*=\s*(\d+)/.exec(code); if (bh) out.btnHeight = +bh[1];
    out.version = /BitmapText\s*\(\s*"v"\s*\+\s*Game\.version/.test(code) || /Game\.version/.test(code);
    return out;
  }

  /** 배지 (Badges.java enum Badge) — 분석기 · 편집기가 같이 씀
   *   o = { msgs: { 키: 글 } (misc 묶음, 언어 합친 것), banner: BadgeBanner.java 소스(칸 크기), sheetSize: [w, h] }
   *   → { list: [{ id, key, image, type, args, line, name, desc, nameKey, descKey, nameSource, noImage, inSheet, conds[], condParsed }], sheet: { cell, cols, cells, cellFrom }, textKeys, statistics? } */
  function badges(src, o) {
    o = o || {}; src = String(src || '');
    const ents = enumEntries(src, 'Badge'), S = scan(src), bl = lineIndex(src), mk = o.msgs || {};
    const meths = []; for (const q of S.bare.matchAll(/(?:public|private|protected)?\s*static\s+[\w<>\[\],\s]+?\s+(\w+)\s*\(([^)]*)\)\s*\{/g)) { const op = q.index + q[0].length - 1, c = matchClose(S.bare, op); if (c > 0) meths.push({ name: q[1], args: q[2].trim(), from: op, to: c, line: bl(q.index), start: q.index }); }
    const BOOK = /^(saveLocal|restore|filter|addReplaced|isObtainedLocally|unlock|isUnlocked|disown|allUnlocked|saveGlobal|loadGlobal|reset|load|save|store|displayBadge|loadLocal|isPlatinum|validateAll)/;
    const enumT = structure(src).types.find(t => t.name === 'Badge');
    const cellM = /new\s+TextureFilm\s*\(\s*\w+\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/.exec(o.banner || '') || /SIZE\s*=\s*(\d+)/.exec(o.banner || '');
    const cell = cellM ? +cellM[1] : 16, size = o.sheetSize;
    const cols = size ? Math.floor(size[0] / cell) : null, cells = size ? cols * Math.floor(size[1] / cell) : null;
    const lines = src.split('\n');
    const list = ents.map(e => {
      const k = e.name.toLowerCase(), nums = e.args.filter(a => /^-?\d+$/.test(a)), type = (e.args.map(a => /BadgeType\.(\w+)/.exec(a)).find(Boolean) || [])[1] || '';
      const image = nums.length ? +nums[0] : -1;
      const kt = 'badges$badge.' + k + '.title', k1 = 'badges$badge.' + k, kd = 'badges$badge.' + k + '.desc';
      const conds = [];
      for (const q of S.bare.matchAll(new RegExp('\\bBadge\\.' + e.name + '\\b', 'g'))) {
        if (enumT && q.index > enumT.open && q.index < enumT.close) continue;
        const me = meths.find(x => q.index > x.from && q.index < x.to); if (!me || BOOK.test(me.name)) continue;
        const ln = bl(q.index); conds.push({ method: me.name, args: me.args, line: ln, text: (lines[ln - 1] || '').trim().slice(0, 200), from: me.line, to: bl(me.to) });
      }
      const name = mk[kt] !== undefined ? mk[kt] : mk[k1] !== undefined ? mk[k1] : '';
      return { id: e.name, key: k, image, type: type || (e.args.length ? 'LOCAL' : ''), args: e.args, line: e.line,
        name, desc: mk[kd] || '', nameKey: mk[kt] !== undefined ? kt : mk[k1] !== undefined ? k1 : '', descKey: mk[kd] !== undefined ? kd : '', nameSource: mk[kt] !== undefined || mk[k1] !== undefined ? 'repo' : 'none',
        noImage: image < 0, inSheet: image >= 0 && cells ? image < cells : null, conds, condParsed: conds.length > 0 };
    });
    const textKeys = list.some(b => /\.title$/.test(b.nameKey)) ? 'title-desc' : list.some(b => b.nameKey) ? 'single' : 'none';
    return { list, sheet: { cell, cols, cells, size: size || null, cellFrom: cellM ? 'BadgeBanner' : '기본 16' }, textKeys, methods: meths.map(m => ({ name: m.name, args: m.args, line: m.line, to: bl(m.to) })) };
  }
  /** Statistics.java 의 public static 칸 (들여쓰기와 상관없이) → [{ name, bool }] */
  function statistics(src) { const out = []; for (const m of scan(src || '').code.matchAll(/public\s+static\s+(int|float|long|boolean)\s+(\w+)\s*[;=]/g)) out.push({ name: m[2], bool: m[1] === 'boolean' }); return out; }

  return { lineIndex, scan, matchClose, structure, body, enumConstants, method, caseBodies, assets, evalInt, itemSheet, sprite, heroSheets, heroFrame, heroSprite, heroSelectIcons, gradleProps, gradleIncludes, gradleSrcDirs, enumEntries, splitArgs, heroSkins, terrain, parseStatements, levelSlots, levelTransitions, enclosingIfs, staticLayout, bannerRects, titleScene, badges, statistics };
});
