// ================================================================
//  공용 도구 — DOM 만들기, 경로/객체 다루기, 알림
// ================================================================
window.PDM = window.PDM || {};

// 12차: 게임 저장소의 게임 패키지 폴더 (저장소 기준 경로 조각) — SPD 는 core/src/main/java/com/shatteredpixel/shatteredpixeldungeon,
//   패키지 이름을 바꾼 파생작(RKPD2 · Rat King Adventure: …/com/zrp200/rkpd2)은 그 폴더. PDM.javaRoot(repo) 로 한 번 찾아 두면 PDM.javaRel(repo) 가 그 값
(function () {
  const SPD = ['core', 'src', 'main', 'java', 'com', 'shatteredpixel', 'shatteredpixeldungeon'], cache = {};
  PDM.JAVA_SPD = SPD;
  PDM.javaRel = repo => cache[repo] || SPD;
  PDM.javaRoot = async repo => {
    if (!repo) return SPD; if (cache[repo]) return cache[repo];
    let rel = SPD;
    try { if (window.pdm && pdm.gameJavaRel) { const r = await pdm.gameJavaRel(repo); if (Array.isArray(r) && r.length && r[0] !== '..') rel = r; } } catch (_) { /* 웹 모드 · 못 찾음 → SPD 자리 */ }
    return (cache[repo] = rel);
  };
})();

/** 디자인 토큰(CSS 변수) 값 읽기 — 캔버스처럼 CSS 를 쓸 수 없는 곳에서 (테마가 바뀌면 다음 그리기부터 반영). 없으면 fallback */
PDM.cssVar = (name, fallback) => { try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback; } catch (_) { return fallback; } };
/** '#rrggbb' + 불투명도 → rgba() (토큰 색을 캔버스에 옅게 칠할 때) */
PDM.alpha = (hex, a) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim()); if (!m) return hex; const n = parseInt(m[1], 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

/** h('div', {class:'x', onclick:fn}, ...children) — 간단한 DOM 생성기 */
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.entries(v).forEach(([sk, sv]) => { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; });
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

function uid(prefix) { return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 8); }
function clone(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }
function escapeHtml(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
/** 영문 id 로 쓸 수 있게 정리 */
function slugId(s, fallback) {
  const r = String(s || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  return r || fallback || uid('x');
}

/** 경로 배열로 값 읽기/쓰기:  deepGet(obj, ['a', 0, 'b']) */
function deepGet(obj, path) {
  let o = obj;
  for (const k of path) { if (o == null) return undefined; o = o[k]; }
  return o;
}
function deepSet(obj, path, value) {
  let o = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i];
    if (o[k] == null) o[k] = typeof path[i + 1] === 'number' ? [] : {};
    o = o[k];
  }
  o[path[path.length - 1]] = value;
}

let _toastTimer = null;
/** 짧은 알림 — kind: '' 안내 · 'ok'(= 'good') 성공 · 'warn' 주의 · 'bad' 실패. 모양: 왼쪽 상태 색 줄 + 기호(✓ ! ✕) — 색만으로 구분하지 않음.
 *  실패는 읽을 시간을 더 줌 (5초) · 화면 읽기 프로그램에 알림 (role=status / alert) */
function toast(msg, kind) {
  let el = $('#toast');
  if (!el) { el = h('div', { id: 'toast', 'aria-live': 'polite' }); document.body.append(el); }
  const k = kind === 'good' ? 'ok' : (kind || '');
  el.textContent = msg;
  el.setAttribute('role', k === 'bad' ? 'alert' : 'status');
  el.className = 'show ' + k;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.className = k; }, k === 'bad' ? 5000 : 2600);
}

/** 간단한 이벤트 발행기 */
function Emitter() {
  const m = {};
  return {
    on(ev, fn) { (m[ev] = m[ev] || []).push(fn); return () => { m[ev] = m[ev].filter(f => f !== fn); }; },
    emit(ev, ...a) { (m[ev] || []).slice().forEach(f => { try { f(...a); } catch (e) { console.error(e); } }); }
  };
}

// DOM append/prepend/replaceChildren 에 null · undefined · false 를 넘기면 "null" 글자가 찍혔음 → 건너뜀 (조건부로 붙이는 칸이 많아서)
['append', 'prepend', 'replaceChildren'].forEach(m => {
  [Element.prototype, DocumentFragment.prototype].forEach(P => {
    const orig = P[m]; if (!orig || orig.__pdm) return;
    const f = function (...a) { return orig.apply(this, a.filter(x => x !== null && x !== undefined && x !== false)); };
    f.__pdm = true; P[m] = f;
  });
});
Object.assign(PDM, { h, $, $$, uid, clone, escapeHtml, debounce, clamp, slugId, deepGet, deepSet, toast, Emitter });
/** Java 패키지 이름 꼴인지 (com.myname.mygame) */
PDM.validPackage = s => /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(String(s || '').trim());
