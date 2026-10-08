// ================================================================
//  설명문 표시 — 편집 화면 곳곳의 설명문(.hint 문단 · 입력칸 아래 설명 · 화면 머리 설명 .lead)을
//  그 기능(바로 앞 버튼 · 입력칸 · 섹션 제목)에 마우스를 올렸을 때 상자로 보여 줌.
//    모드 (보기 메뉴, localStorage "pdm.hints"):
//      hover  = 설명문을 숨기고 마우스를 올리면 상자로 (기본)
//      inline = 예전처럼 항상 펼쳐 보기
//      off    = 설명문 숨기기 (상자도 안 띄움 — 버튼의 짧은 도움말(title)만 상자로)
//    title 속성(버튼 도움말)도 모드와 상관없이 같은 상자로 보여 줌 (브라우저 기본 노란 말풍선 대신)
//    편집기 코드는 그대로 — 화면에 붙는 설명문을 MutationObserver 로 찾아 연결 (다시 그려도 자동으로)
//    그대로 두는 것: 줄 안의 짧은 상태 표시(span.hint) · 버튼 · 링크 · 입력칸이 들어 있는 설명 · 경고(글자색 지정 · .bad) ·
//                   테두리 상자 · 대화상자(.modal) 안 · data-keep
// ================================================================
(function () {
  const KEY = 'pdm.hints';
  const MODES = ['hover', 'inline', 'off'];
  let mode = (() => { try { const v = localStorage.getItem(KEY); return MODES.includes(v) ? v : 'hover'; } catch (_) { return 'hover'; } })();
  const SEL = 'p.hint, div.hint, small.hint, .lead';
  const INTERACTIVE = 'button, input, select, textarea, a, canvas, details, img, table, video, audio, .btn';
  const BIG = new Set(['page', 'editor', 'sec-body', 'li-body', 'row']);

  function apply() {
    document.body.classList.toggle('hints-hover', mode === 'hover');
    document.body.classList.toggle('hints-off', mode === 'off');
    hide();
  }
  function setMode(m) { if (!MODES.includes(m)) return; mode = m; try { localStorage.setItem(KEY, m); } catch (_) { /* 저장 불가 */ } apply(); }

  // ---------------- 설명문 → 기능 연결 ----------------
  const keep = el => el.dataset.keep != null || el.classList.contains('bad') || (el.style && (el.style.color || el.style.border || el.style.borderTop))
    || !!el.closest('.modal, .modal-bg, .ctx, #toast, .tip-box') || !!el.querySelector(INTERACTIVE) || !(el.textContent || '').trim();
  /** 이 설명문이 붙을 곳: 입력칸 묶음(label.field) · 바로 앞 요소(설명문 아닌 것) · 섹션 제목 · 부모 */
  function targetOf(el) {
    const fld = el.parentElement && el.parentElement.closest('label.field, .code-field');
    if (fld && el.classList.contains('hint') && el.tagName === 'SMALL') return fld;
    const par = el.parentElement; if (!par) return null;
    const head = () => { const s = par.parentElement, hd = s && s.querySelector(':scope > .sec-head'); return hd; };
    let p = el.previousElementSibling;
    while (p && (p.classList.contains('tipped') || p.tagName === 'BR' || p.tagName === 'SCRIPT')) p = p.previousElementSibling;
    // 앞이 여러 칸을 담은 묶음(줄 · 목록 · 상자)이면 섹션 설명으로 보고 섹션 제목에 붙임
    if (p && par.classList.contains('sec-body') && p.tagName === 'DIV' && !p.matches('.fl, .sec-head') && head()) return head();
    if (p && !p.matches('hr')) return p;
    if (par.classList.contains('sec-body') && head()) return head();
    let t = par;
    while (t && t.classList && [...t.classList].some(c => BIG.has(c)) && !t.previousElementSibling) t = t.parentElement;
    return t && t !== document.body ? t : null;
  }
  function attach(el) {
    if (el.classList.contains('tipped') || el.dataset.tipSkip) return;
    if (keep(el)) { el.dataset.tipSkip = '1'; return; }
    const t = targetOf(el);
    if (!t) { el.dataset.tipSkip = '1'; return; }
    (t._tipEls = t._tipEls || []).push(el);
    el.classList.add('tipped');
    t.classList.add('tip-mark');
    // 표시(ⓘ)를 붙일 자리: 입력칸 이름 · 체크 글자 · 섹션 제목 · 제목
    const lab = t.matches('label.field, .code-field') ? t.querySelector(':scope > .fl') : t.matches('label.check') ? t.querySelector(':scope > span') : t;
    if (lab && lab.matches('h1, h2, h3, h4, h5, .sec-head, .fl, label.check > span')) lab.classList.add('tip-dot');   // 줄 · 버튼 등에는 표시를 붙이지 않음 (모양이 흐트러지지 않게)
  }
  function scan(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.matches && root.matches(SEL)) attach(root);
    root.querySelectorAll && root.querySelectorAll(SEL).forEach(attach);
  }
  const mo = new MutationObserver(list => { for (const m of list) m.addedNodes.forEach(scan); });

  // ---------------- 상자 ----------------
  let box = null, cur = null, timer = 0;
  function ensureBox() { if (!box) { box = PDM.h('div', { class: 'tip-box', role: 'tooltip' }); document.body.append(box); } return box; }
  function hide() { clearTimeout(timer); timer = 0; cur = null; if (box) box.classList.remove('on'); }
  function textOf(el) {
    const parts = [];
    if (el.dataset.tip) parts.push(el.dataset.tip);
    if (mode === 'hover' && el._tipEls) el._tipEls.forEach(x => { if (x.isConnected) { const s = x.textContent.replace(/\s+\n/g, '\n').trim(); if (s && !parts.includes(s)) parts.push(s); } });
    return parts.join('\n\n');
  }
  /** 마우스 아래에서 가장 안쪽의 "설명이 있는" 요소 */
  function find(node) {
    for (let el = node; el && el !== document.body && el.nodeType === 1; el = el.parentElement) {
      if (el === box) return null;
      if (el.hasAttribute('title') && el.getAttribute('title')) { el.dataset.tip = el.getAttribute('title'); el.removeAttribute('title'); }   // 브라우저 말풍선 대신 상자
      if (el.dataset.tip || (mode === 'hover' && el._tipEls && el._tipEls.some(x => x.isConnected))) return el;
    }
    return null;
  }
  function show(el, mx, my) {
    const s = textOf(el); if (!s) return;
    const b = ensureBox(); b.textContent = s; b.classList.add('on');
    const r = el.getBoundingClientRect(), bw = b.offsetWidth, bh = b.offsetHeight, vw = innerWidth, vh = innerHeight;
    // 작은 것(버튼 · 입력칸) = 그 아래 · 큰 것(줄 · 상자) = 마우스 근처
    let x, y;
    if (r.height <= 64 && r.width <= 520) { x = r.left; y = r.bottom + 6; if (y + bh > vh - 4) y = r.top - bh - 6; }
    else { x = mx + 12; y = my + 18; if (y + bh > vh - 4) y = my - bh - 12; }
    x = Math.max(4, Math.min(x, vw - bw - 4)); y = Math.max(4, y);
    b.style.left = x + 'px'; b.style.top = y + 'px';
  }
  let mx = 0, my = 0;
  document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; }, true);
  document.addEventListener('mouseover', e => {
    const el = find(e.target);
    if (el === cur) return;
    hide();
    if (!el) return;
    cur = el;
    timer = setTimeout(() => { if (cur === el && el.isConnected) show(el, mx, my); }, el._tipEls && !el.dataset.tip ? 250 : 400);
  }, true);
  document.addEventListener('mouseout', e => { if (cur && (!e.relatedTarget || !cur.contains(e.relatedTarget))) hide(); }, true);
  ['mousedown', 'wheel', 'keydown'].forEach(t => document.addEventListener(t, hide, true));
  window.addEventListener('blur', hide);

  function start() { apply(); scan(document.body); mo.observe(document.body, { childList: true, subtree: true }); }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  PDM.tips = { get mode() { return mode; }, setMode, MODES, rescan: () => scan(document.body) };
})();
