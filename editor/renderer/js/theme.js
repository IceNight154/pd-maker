// ================================================================
//  테마 — 시스템 색에 맞춤 (index.html 의 <head> 에서 가장 먼저 실행: 깜빡임 없이 색을 정함)
//   · 모드: system(OS 의 밝게/어둡게를 따름, 바뀌면 바로 반영) · light · dark
//   · 강조색: system(Windows·macOS 강조색) · default(PDMaker 보라) · '#rrggbb'(직접)
//   설정은 이 PC 에 저장 (localStorage + Electron 은 userData/pdmaker-settings.json — 창 제목 표시줄·대화상자도 같은 테마)
// ================================================================
(function () {
  const KEY = 'pdmaker_theme_v1';
  const read = () => { try { return Object.assign({ mode: 'system', accent: 'system' }, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (_) { return { mode: 'system', accent: 'system' }; } };
  const write = o => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (_) { /* 저장 불가 */ } };
  let cfg = read();
  let sysAccent = null;                                   // Electron 이 알려 준 OS 강조색
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const listeners = [];

  const isDark = () => cfg.mode === 'dark' || (cfg.mode !== 'light' && (!mq || mq.matches));

  // ---- 색 계산: 강조색이 배경과 잘 구분되도록 밝기를 맞춤 ----
  const hex2rgb = h => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const rgb2hex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  /** 어두운 테마면 너무 어두운 강조색을 밝게, 밝은 테마면 너무 밝은 것을 어둡게 */
  function fitAccent(hex, dark) {
    let c = hex2rgb(hex); if (!c) return null;
    const target = dark ? [255, 255, 255] : [0, 0, 0];
    for (let i = 0; i < 12; i++) {
      const L = lum(c);
      if (dark ? L >= 0.28 : L <= 0.22) break;
      c = mix(c, target, 0.15);
    }
    return rgb2hex(c);
  }

  function apply() {
    const dark = isDark();
    const root = document.documentElement;
    root.dataset.theme = dark ? 'dark' : 'light';
    root.dataset.themeMode = cfg.mode;
    let acc = null;
    if (cfg.accent === 'system') acc = sysAccent;
    else if (cfg.accent && cfg.accent !== 'default') acc = cfg.accent;
    const fitted = acc ? fitAccent(acc, dark) : null;
    if (fitted) root.style.setProperty('--accent', fitted); else root.style.removeProperty('--accent');
    listeners.forEach(fn => { try { fn({ dark, mode: cfg.mode, accent: fitted }); } catch (_) { /* 무시 */ } });
  }
  apply();
  if (mq) (mq.addEventListener ? mq.addEventListener('change', apply) : mq.addListener(apply));

  window.PDM_THEME = {
    get mode() { return cfg.mode; },
    get accent() { return cfg.accent; },
    get dark() { return isDark(); },
    get systemAccent() { return sysAccent; },
    setMode(m) {
      cfg.mode = ['system', 'light', 'dark'].includes(m) ? m : 'system'; write(cfg);
      if (window.pdm && pdm.themeSet) pdm.themeSet(cfg.mode).then(info => { if (info) sysAccent = info.accent || sysAccent; apply(); }).catch(() => apply());
      else apply();
    },
    setAccent(a) { cfg.accent = a || 'system'; write(cfg); apply(); },
    onChange(fn) { listeners.push(fn); },
    /** Electron 연결 (bridge.js 뒤에 부름): OS 강조색 · 테마 바뀜 알림 */
    connect() {
      if (!window.pdm || !pdm.themeGet) return;
      const take = info => { if (!info) return; sysAccent = info.accent || null; apply(); };
      pdm.themeGet().then(take).catch(() => { /* 이전 버전 */ });
      pdm.on('theme:changed', take);
      // 이 PC 에 저장된 모드를 메인 프로세스(제목 표시줄·대화상자)에도 알려 줌
      if (pdm.themeSet) pdm.themeSet(cfg.mode).then(take).catch(() => { /* 무시 */ });
    }
  };
})();
