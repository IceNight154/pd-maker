// ================================================================
//  게임 UI 테마 (6차) — 프로젝트의 theme.json. 편집기 자체 색(theme.js · 청록)과는 따로: 게임 안 UI 만.
//    런타임 MakerTheme 와 같은 토큰 · 기본값 (tools/tests/run.js 가 두 쪽을 비교)
//    우선순위: UI 요소 직접 지정 → UI 묶음 설정(dialogue.json 등 — 빈 칸 "" = 테마) → 이 테마 → 런타임 기본(예전 모습)
// ================================================================
PDM.gameTheme = (function () {
  /** 토큰 · 설명 (편집 화면 순서) */
  const TOKENS = [
    ['bg', '배경', '영웅 선택 화면 같은 전체 바탕'], ['panel', '패널', '대사창 · 배속 표시줄 바탕'], ['border', '테두리', '대사창 테두리'],
    ['text', '기본 글자', '본문 · 버튼 글자'], ['textDim', '보조 글자', '잠긴 항목 · 설명'], ['accent', '강조', '창 제목 · 강조(**…**) 글자 · ▼ 표시 · 고른 값'],
    ['button', '버튼', '이름표 · 배속 단추 바탕'], ['buttonOn', '고른 버튼', '고른 배속 단추 바탕 (+ 아래 줄)'], ['disabled', '비활성', '잠긴 특성 칸'],
    ['warn', '주의', '주의 알림'], ['error', '오류 · 위험', '쓸 수 없는 주문 · 모자란 돈'], ['good', '좋음', '완료한 퀘스트'], ['shadow', '그림자', '글자 그림자 · 어두운 글']];
  /** 런타임 기본 = 4차까지 코드에 직접 쓰던 색 (MakerTheme.DEF) */
  const DEFAULT = { format: 'pdmaker-gametheme', version: 1, name: '게임 기본', shape: 'game', radius: 3, padding: 4, fontScale: 1,
    colors: { bg: '#1d1e20', panel: '#2a2a2a', border: '#8c7f65', text: '#ffffff', textDim: '#888888', accent: '#ffff44', button: '#4a3a6a', buttonOn: '#8a6d1f', disabled: '#666666', warn: '#ff8800', error: '#cc6666', good: '#44ff44', shadow: '#000000' } };
  const PRESETS = {
    game: ['게임 기본 (원작 느낌)', {}],
    dark: ['어두운 슬레이트', { shape: 'round', radius: 4, colors: { bg: '#15181d', panel: '#20252d', border: '#4b5563', text: '#eef1f5', textDim: '#9aa3ad', accent: '#7dd3c0', button: '#2f3742', buttonOn: '#2c6e63', disabled: '#4b5058' } }],
    light: ['밝은 종이', { shape: 'round', radius: 5, colors: { bg: '#f3efe6', panel: '#fbf8f1', border: '#b9ad94', text: '#2e2a24', textDim: '#6f675a', accent: '#a0461c', button: '#e5dccb', buttonOn: '#c98b3a', disabled: '#cfc6b4', shadow: '#ffffff' } }],
    parchment: ['양피지', { shape: 'square', radius: 0, colors: { bg: '#2b2014', panel: '#3b2d1c', border: '#a88a55', text: '#f4e6c8', textDim: '#bba98a', accent: '#ffcf5a', button: '#5a4329', buttonOn: '#8a6524', disabled: '#4a3b2a' } }]
  };
  const clone = o => JSON.parse(JSON.stringify(o));
  const HEX = /^#[0-9a-f]{6}$/i;
  /** 저장된 값(없거나 틀려도) → 늘 쓸 수 있는 테마 */
  function normalize(raw) {
    const r = raw && typeof raw === 'object' ? raw : {}, o = clone(DEFAULT);
    if (typeof r.name === 'string') o.name = r.name;
    if (['game', 'round', 'square'].includes(r.shape)) o.shape = r.shape;
    const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
    o.radius = num(r.radius, 0, 12, 3); o.padding = num(r.padding, 0, 24, 4); o.fontScale = num(r.fontScale, 0.5, 2, 1);
    const c = r.colors || {};
    Object.keys(o.colors).forEach(k => { if (HEX.test(c[k] || '')) o.colors[k] = c[k].toLowerCase(); });
    return o;
  }
  /** 프로젝트 테마 (없으면 기본) */
  const get = () => normalize(PDM.store && PDM.store.isOpen ? PDM.store.get('theme') : null);
  const color = token => get().colors[token] || DEFAULT.colors[token] || '#ffffff';
  /** 프리셋 → 테마 값 */
  const preset = id => { const p = PRESETS[id]; const o = clone(DEFAULT); if (!p) return o; const v = clone(p[1]); Object.assign(o, v, { colors: Object.assign(o.colors, v.colors || {}) }); o.name = p[0]; return o; };
  /** 대비 (WCAG 상대 휘도 비) */
  function contrast(a, b) {
    const L = hex => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0); };
    const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  /** 읽기 쉬운지 볼 짝 [글자, 바탕, 최소 비, 설명] */
  const PAIRS = [['text', 'panel', 4.5, '본문 / 패널'], ['accent', 'panel', 3, '강조 · 제목 / 패널'], ['text', 'button', 4.5, '버튼 글자 / 버튼'], ['text', 'buttonOn', 3, '버튼 글자 / 고른 버튼'], ['textDim', 'panel', 3, '보조 글자 / 패널'], ['text', 'bg', 4.5, '본문 / 배경']];
  const checks = t => PAIRS.map(([f, b, min, label]) => { const r = contrast(t.colors[f], t.colors[b]); return { f, b, min, label, ratio: Math.round(r * 10) / 10, ok: r >= min }; });
  /** dialogue.json 의 빈 칸("")이 따르는 토큰 (런타임 MakerDialogue.THEMED 와 같음) */
  const DIALOGUE_LINK = { 'box.color': 'panel', 'box.border': 'border', 'box.textColor': 'text', 'box.highlight': 'accent', 'name.color': 'button', 'name.textColor': 'text', 'indicator.color': 'accent', 'box.style': '@shape' };
  /** 대사창 설정의 빈 칸을 테마 값으로 (편집기 미리보기 — 런타임과 같은 규칙) */
  function resolveDialogue(c) {
    const t = get();
    Object.entries(DIALOGUE_LINK).forEach(([path, tok]) => {
      const [g, k] = path.split('.'); if (!c[g] || c[g][k] !== '') return;
      if (tok === '@shape') { c[g][k] = t.shape === 'game' ? 'game' : 'round'; c[g].radius = t.shape === 'square' ? 0 : t.radius; }
      else c[g][k] = t.colors[tok];
    });
    return c;
  }
  return { TOKENS, DEFAULT, PRESETS, normalize, get, color, preset, contrast, checks, DIALOGUE_LINK, resolveDialogue };
})();
