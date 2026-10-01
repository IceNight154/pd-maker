// ================================================================
//  공용 도구 — DOM 만들기, 경로/객체 다루기, 알림
// ================================================================
window.PDM = window.PDM || {};

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
function toast(msg, kind) {
  let el = $('#toast');
  if (!el) { el = h('div', { id: 'toast' }); document.body.append(el); }
  el.textContent = msg;
  el.className = 'show ' + (kind || '');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.className = ''; }, 2600);
}

/** 간단한 이벤트 발행기 */
function Emitter() {
  const m = {};
  return {
    on(ev, fn) { (m[ev] = m[ev] || []).push(fn); return () => { m[ev] = m[ev].filter(f => f !== fn); }; },
    emit(ev, ...a) { (m[ev] || []).slice().forEach(f => { try { f(...a); } catch (e) { console.error(e); } }); }
  };
}

Object.assign(PDM, { h, $, $$, uid, clone, escapeHtml, debounce, clamp, slugId, deepGet, deepSet, toast, Emitter });
