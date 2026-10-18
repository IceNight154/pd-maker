// ================================================================
//  게임 UI 테마 = 프로젝트의 인게임 UI 스프라이트 스킨 (6차) — theme.json + assets/game/interfaces/*.png
//    스킨 그림: 프로젝트의 assets/game/interfaces/chrome.png · status_pane.png · toolbar.png … (리소스 「UI 그림」에서 바꿈). 없으면 원작 그림.
//    PDMaker 가 더하는 UI(대사창 · 이름표 · 선택지 · 연출 배속 표시줄)는 chrome.png 의 9조각(원작 Chrome.Type)으로 그림 — 어느 조각을 쓸지 = theme.skin.
//    글자 색(스프라이트로 정할 수 없는 것만) = theme.colors. 런타임 MakerTheme 와 같은 값 · 같은 조각 좌표 (tools/tests/run.js 가 비교)
//    우선순위: UI 요소 직접 지정 → UI 묶음 설정(dialogue.json — 빈 칸 = 테마) → 이 테마 → 원작 스프라이트 · 글자 색
//    편집기 자체 색(theme.js · 청록)과는 따로.
// ================================================================
PDM.gameTheme = (function () {
  /** 원작 Chrome.java 의 9조각: [x, y, w, h, 왼 · 위 · 오른 · 아래 여백] (chrome.png 안의 자리) */
  const CHROME = {
    WINDOW: [0, 0, 20, 20, 6, 6, 6, 6], WINDOW_SILVER: [86, 0, 22, 22, 7, 7, 7, 7], TOAST: [20, 0, 9, 9, 4, 4, 4, 4],
    TOAST_TR: [20, 9, 9, 9, 4, 4, 4, 4], GREY_BUTTON_TR: [20, 9, 9, 9, 4, 4, 4, 4], TOAST_TR_HEAVY: [29, 9, 9, 9, 4, 4, 4, 4], TOAST_WHITE: [29, 0, 9, 9, 4, 4, 4, 4],
    RED_BUTTON: [38, 0, 6, 6, 2, 2, 2, 2], GREY_BUTTON: [38, 6, 6, 6, 2, 2, 2, 2], TAG: [22, 18, 16, 14, 3, 3, 3, 3], GEM: [0, 32, 32, 32, 13, 13, 13, 13],
    SCROLL: [32, 32, 32, 32, 5, 11, 5, 11], TAB_SET: [64, 0, 20, 20, 6, 6, 6, 6], TAB_SELECTED: [65, 22, 8, 13, 3, 7, 3, 5], TAB_UNSELECTED: [75, 22, 8, 13, 3, 7, 3, 5]
  };
  const CHROME_NAMES = { WINDOW: '창 (원작 모든 창)', WINDOW_SILVER: '은색 창', TOAST: '알림', TOAST_TR: '반투명 알림 (원작 알림 · 메뉴 단추)', GREY_BUTTON_TR: '반투명 회색 단추 (= 반투명 알림)',
    TOAST_TR_HEAVY: '진한 반투명 (가방 · 툴팁)', TOAST_WHITE: '흰 칸 (글 입력)', RED_BUTTON: '빨간 단추 (원작 단추)', GREY_BUTTON: '회색 단추', TAG: '태그 (행동 표시)', GEM: '보석 틀', SCROLL: '두루마리 (이야기 창)',
    TAB_SET: '탭 묶음', TAB_SELECTED: '고른 탭', TAB_UNSELECTED: '안 고른 탭' };
  /** PDMaker UI 마다 쓸 조각 (런타임 MakerTheme.SKIN 과 같음) */
  const SKIN_UI = [
    ['box', '대사창', 'WINDOW'], ['name', '이름표', 'TOAST_TR'], ['choice', '선택지', 'GREY_BUTTON_TR'], ['choiceOn', '고른 선택지', 'RED_BUTTON'],
    ['bar', '연출 배속 표시줄 바탕', 'TOAST_TR'], ['barBtn', '배속 단추', 'GREY_BUTTON_TR'], ['barBtnOn', '고른 배속 단추', 'RED_BUTTON']];
  /** 글자 색 (스프라이트로 정할 수 없는 것만) */
  const TOKENS = [
    ['text', '기본 글자', '대사 · 이름 · 버튼 글자'], ['textDim', '보조 글자', '잠긴 항목 · 설명'], ['accent', '강조', '창 제목 · 강조(**…**) 글자 · ▼ · 현재 배속'],
    ['warn', '주의', '주의 알림'], ['error', '오류 · 위험', '쓸 수 없는 주문 · 모자란 돈'], ['good', '좋음', '완료한 퀘스트'], ['shadow', '그림자', '글자 그림자']];
  /** 기본 = 원작 (런타임 MakerTheme.DEF · SKIN) */
  const DEFAULT = { format: 'pdmaker-gametheme', version: 2, name: '게임 기본',
    skin: Object.fromEntries(SKIN_UI.map(([k, , d]) => [k, d])),
    colors: { text: '#ffffff', textDim: '#888888', accent: '#ffff44', warn: '#ff8800', error: '#cc6666', good: '#44ff44', shadow: '#000000' } };
  const clone = o => JSON.parse(JSON.stringify(o));
  const HEX = /^#[0-9a-f]{6}$/i;
  function normalize(raw) {
    const r = raw && typeof raw === 'object' ? raw : {}, o = clone(DEFAULT);
    if (typeof r.name === 'string') o.name = r.name;
    const s = r.skin || {}; Object.keys(o.skin).forEach(k => { if (CHROME[s[k]]) o.skin[k] = s[k]; });
    const c = r.colors || {}; Object.keys(o.colors).forEach(k => { if (HEX.test(c[k] || '')) o.colors[k] = c[k].toLowerCase(); });
    return o;
  }
  const get = () => normalize(PDM.store && PDM.store.isOpen ? PDM.store.get('theme') : null);
  const color = token => get().colors[token] || DEFAULT.colors[token] || '#ffffff';

  // ---- 스프라이트 조각 (편집기 미리보기 — 프로젝트가 바꾼 chrome.png 가 있으면 그것: PDM.assets 'game:' 규칙)
  let chromeImg = null;
  /** 프로젝트 chrome.png (있으면) 또는 원작 — PDM.assets 가 경로마다 캐시. 그림이 바뀌면(새로 고침 · 바꾸기) 조각 캐시도 비움 */
  async function chrome() {
    const img = PDM.assets ? await PDM.assets.load('game:interfaces/chrome.png').catch(() => null) : null;
    if (img !== chromeImg) { chromeImg = img; cache.clear(); }
    return chromeImg;
  }
  const cache = new Map();
  /** 조각 → { url(그 부분만 잘라 낸 PNG), m:[왼,위,오른,아래], center:'#rrggbb'(가운데 색 — 대비 검사), alpha } */
  async function piece(type) {
    const img = await chrome(), r = CHROME[type];
    if (!img || !r) return null;
    if (cache.has(type)) return cache.get(type);
    const c = document.createElement('canvas'); c.width = r[2]; c.height = r[3];
    const g = c.getContext('2d'); g.drawImage(img, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]);
    let center = '#000000', alpha = 1;
    try { const d = g.getImageData(Math.floor(r[2] / 2), Math.floor(r[3] / 2), 1, 1).data; center = '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join(''); alpha = d[3] / 255; } catch (_) { /* 다른 출처 그림 */ }
    const p = { url: c.toDataURL(), m: r.slice(4), center, alpha, type };
    cache.set(type, p); return p;
  }
  /** 9조각 CSS (k = 게임 픽셀 1개의 화면 px) */
  const css = (p, k) => p ? { background: 'none', border: 'none', borderStyle: 'solid', borderWidth: p.m.map(v => (v * k) + 'px').join(' '), borderImage: `url("${p.url}") ${p.m.join(' ')} fill / ${p.m.map(v => (v * k) + 'px').join(' ')} stretch`, imageRendering: 'pixelated', borderRadius: 0 } : {};

  /** 대비 (WCAG). 반투명 조각은 검은 게임 화면 위에 놓인 색으로 */
  function contrast(a, b) {
    const L = hex => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0); };
    const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  const onBlack = (hex, a) => { const n = parseInt(hex.slice(1), 16); return '#' + [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v * a).toString(16).padStart(2, '0')).join(''); };
  /** 글자 색 ↔ 그 UI 스프라이트 가운데 색 (실제 그림에서 잼) */
  async function checks(t, pieceOf = piece) {
    const pairs = [['text', 'box', 4.5, '대사 글자 / 대사창'], ['text', 'name', 4.5, '이름 / 이름표'], ['text', 'choice', 4.5, '선택지 글자 / 선택지'], ['text', 'choiceOn', 3, '선택지 글자 / 고른 선택지'],
      ['accent', 'box', 3, '강조 / 대사창'], ['accent', 'bar', 3, '현재 배속 / 표시줄'], ['text', 'barBtnOn', 3, '배속 글자 / 고른 배속 단추']];
    const out = [];
    for (const [f, ui, min, label] of pairs) {
      const p = await pieceOf(t.skin[ui]); if (!p) continue;
      const bg = onBlack(p.center, p.alpha), r = contrast(t.colors[f], bg);
      out.push({ f, ui, min, label, bg, ratio: Math.round(r * 10) / 10, ok: r >= min });
    }
    return out;
  }
  /** dialogue.json 의 빈 칸("")이 따르는 것 (런타임 MakerDialogue.THEMED 와 같음 — 글자 색 · 모양 "@skin" = 스프라이트) */
  const DIALOGUE_LINK = { 'box.textColor': 'text', 'box.highlight': 'accent', 'name.textColor': 'text', 'indicator.color': 'accent', 'box.style': '@skin' };
  /** 대사창 설정의 빈 칸을 테마로 (편집기 미리보기 — 런타임 MakerDialogue.s 와 같음). 그 밖의 빈 칸 = 기본값 */
  function resolveDialogue(c, defaults) {
    const t = get();
    Object.entries(DIALOGUE_LINK).forEach(([path, tok]) => {
      const [g, k] = path.split('.'); if (!c[g] || c[g][k] !== '') return;
      c[g][k] = tok === '@skin' ? 'skin' : t.colors[tok];
    });
    if (defaults) Object.keys(c).forEach(g => { if (c[g] && typeof c[g] === 'object' && defaults[g]) Object.keys(c[g]).forEach(k => { if (c[g][k] === '' && !(g + '.' + k in DIALOGUE_LINK) && typeof defaults[g][k] === 'string' && defaults[g][k] !== '') c[g][k] = defaults[g][k]; }); });
    c._skin = t.skin;
    return c;
  }
  return { CHROME, CHROME_NAMES, SKIN_UI, TOKENS, DEFAULT, normalize, get, color, chrome, piece, css, contrast, checks, DIALOGUE_LINK, resolveDialogue };
})();
