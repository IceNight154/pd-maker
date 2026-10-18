// ================================================================
//  테스트 플레이 실행 환경 (5차) — 프로젝트마다 project.json "testplay" 에 저장
//    { env: 'pc' | 'pc-small' | 'phone-land' | 'phone-port' | 'custom',
//      custom: { w, h, dpi },           // 사용자 지정: 기기의 실제 화면 픽셀 · 화면 밀도(dpi)
//      uiScale: 0,                      // 0 = 자동(그 기기에서 게임이 고르는 배율), 그 밖 = 그 기기의 UI 배율을 직접
//      rotate: true,                    // 실행 중 F9 = 화면 돌리기 (가로 ↔ 세로)
//      safeArea: 'none' | 'notch' | 'custom', insets: { l, t, r, b },   // 기기 픽셀 — 노치 · 상태 줄 · 내비게이션 바 흉내
//      touch: false, debug: true, speed: 1 }   // 터치 표시 · 디버그 정보 · 시작 배속(1 · 2 · 4 · 16)
//    값이 없거나 틀리면 안전한 기본값(normalize) — 예전 프로젝트는 "PC".
//
//  화면 크기 세 가지를 따로 셈 (resolve):
//    기기 픽셀(px) — 기기 화면의 실제 점 수 / 밀도(dpi) → 게임 배율(zoom) — 게임(PixelScene)이 그 기기에서 고르는 값과 같은 식
//    논리 화면(UI 좌표) = 기기 픽셀 ÷ 배율 — 게임 UI · 대사창 · 일러스트가 실제로 놓이는 좌표
//    PC 창 = 논리 화면 × PC 배율 — 큰 휴대폰 화면을 모니터에 맞게 줄이되 논리 화면(배치)은 기기와 똑같이
//  게임에는 -Dpdmaker.testenv=<resolve 결과 JSON> 으로 넘김 (런타임 MakerTestEnv). 웹 모드는 게임을 실행하지 못하므로 저장 · 미리보기만.
// ================================================================
PDM.testEnv = (function () {
  // 게임(SPD PixelScene)의 최소 화면 (UI 좌표) — 인터페이스 크기 0 = 휴대폰(가로/세로 배치), >0 = 데스크톱 큰 UI
  const MIN = { land: [240, 160], port: [135, 225], full: [360, 200] };
  const PRESETS = {
    'pc': { name: 'PC 표준', kind: 'pc', w: 1280, h: 800, dpi: 96 },
    'pc-small': { name: '작은 PC 창', kind: 'pc', w: 960, h: 600, dpi: 96 },
    'phone-land': { name: '모바일 가로형', kind: 'phone', w: 2340, h: 1080, dpi: 420 },
    'phone-port': { name: '모바일 세로형', kind: 'phone', w: 1080, h: 2340, dpi: 420 },
    'custom': { name: '사용자 지정', kind: 'phone', w: 1080, h: 2400, dpi: 400 }
  };
  const ENV_NAMES = { 'pc': 'PC', 'pc-small': 'PC (작은 창)', 'phone-land': '모바일 가로', 'phone-port': '모바일 세로', 'custom': '사용자 지정' };
  const SPEEDS = [1, 2, 4, 16];
  const DEFAULT = { env: 'pc', custom: { w: 1080, h: 2400, dpi: 400 }, uiScale: 0, rotate: true, safeArea: 'none', insets: { l: 0, t: 0, r: 0, b: 0 }, touch: false, debug: true, speed: 1 };
  const num = (v, lo, hi, def) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };

  /** 저장된 값(없을 수도, 틀릴 수도) → 늘 쓸 수 있는 설정. fixes = 고친 칸 이름들 (편집기가 알림) */
  function normalize(raw) {
    const r = raw && typeof raw === 'object' ? raw : {}, fixes = [];
    const o = JSON.parse(JSON.stringify(DEFAULT));
    if (r.env !== undefined) { if (PRESETS[r.env]) o.env = r.env; else fixes.push('env'); }
    const c = r.custom || {};
    o.custom = { w: num(c.w, 240, 8192, DEFAULT.custom.w), h: num(c.h, 240, 8192, DEFAULT.custom.h), dpi: num(c.dpi, 80, 800, DEFAULT.custom.dpi) };
    ['w', 'h', 'dpi'].forEach(k => { if (c[k] !== undefined && c[k] !== o.custom[k]) fixes.push('custom.' + k); });
    o.uiScale = num(r.uiScale ?? 0, 0, 12, 0); if (r.uiScale !== undefined && r.uiScale !== o.uiScale) fixes.push('uiScale');
    o.rotate = r.rotate === undefined ? DEFAULT.rotate : !!r.rotate;
    o.safeArea = ['none', 'notch', 'custom'].includes(r.safeArea) ? r.safeArea : 'none'; if (r.safeArea !== undefined && r.safeArea !== o.safeArea) fixes.push('safeArea');
    const ins = r.insets || {};
    o.insets = { l: num(ins.l, 0, 1000, 0), t: num(ins.t, 0, 1000, 0), r: num(ins.r, 0, 1000, 0), b: num(ins.b, 0, 1000, 0) };
    o.touch = !!r.touch; o.debug = r.debug === undefined ? DEFAULT.debug : !!r.debug;
    o.speed = SPEEDS.includes(Number(r.speed)) ? Number(r.speed) : 1; if (r.speed !== undefined && Number(r.speed) !== o.speed) fixes.push('speed');
    return { cfg: o, fixes };
  }

  /** 게임이 그 기기에서 고를 배율 (PixelScene.create 와 같은 식): 안전 영역을 뺀 화면에 최소 화면이 들어가는 가장 큰 배율(≥2)과 밀도 × 2.5(올림) 중 작은 것 */
  function gameZoom(w, h, dpi, iface, wish, ins) {
    const m = iface > 0 ? MIN.full : (w > h ? MIN.land : MIN.port), i = ins || { l: 0, t: 0, r: 0, b: 0 };
    const max = Math.max(2, Math.floor(Math.min((w - i.l - i.r) / m[0], (h - i.t - i.b) / m[1])));
    const density = dpi / 160;
    if (wish >= Math.ceil(density * 2) && wish <= max) return wish;   // 사용자가 고른 배율이 허용 범위면 그대로 (게임 설정 "화면 배율"과 같은 규칙)
    return Math.min(max, Math.max(2, Math.ceil(density * 2.5)));
  }

  /** 설정 → 실행에 쓸 값 { env, name, kind, device:[w,h], dpi, zoom, logical:[w,h], window:[w,h], winZoom, iface, insets:[l,t,r,b](창 px),
   *  rotated: 돌린 방향의 { device, zoom, logical, window, winZoom, insets } (휴대폰 · 돌리기 켬), rotate, touch, debug, speed } */
  function resolve(raw) {
    const { cfg } = normalize(raw);
    const P = PRESETS[cfg.env], dev = cfg.env === 'custom' ? cfg.custom : P;
    const pc = P.kind === 'pc';
    if (pc) {   // PC: 창 크기 = 기기 크기 · 데스크톱 큰 UI. 배율은 모니터 밀도에 따라 게임이 정함(0 = 자동 — 모니터마다 달라 미리 셀 수 없음) 또는 직접
      const iface = 2, zoom = cfg.uiScale > 0 ? cfg.uiScale : 0;
      return { env: cfg.env, name: ENV_NAMES[cfg.env], kind: 'pc', device: [dev.w, dev.h], dpi: dev.dpi, zoom, logical: zoom ? [Math.floor(dev.w / zoom), Math.floor(dev.h / zoom)] : null, window: [dev.w, dev.h], winZoom: zoom, iface,
        insets: [0, 0, 0, 0], rotate: cfg.rotate, touch: cfg.touch, debug: cfg.debug, speed: cfg.speed };
    }
    const iface = 0;
    // 한 방향(기기 w×h)의 값 — 돌린 방향(h×w)도 미리 셈: 실행 중 F9 가 둘 사이를 오감 (창 크기만 뒤집으면 게임이 고르는 배율 · 논리 화면이 실제 기기와 달라짐)
    const orient = (w, h, ins) => {
      const zoom = gameZoom(w, h, dev.dpi, iface, cfg.uiScale, ins);
      const logical = [Math.floor(w / zoom), Math.floor(h / zoom)];
      // PC 창 배율: 기기 배율의 절반쯤(≥2) — 창 = 논리 화면 × 창 배율 (논리 화면이 기기와 같음)
      const winZoom = Math.max(2, Math.min(zoom, Math.floor(zoom / 2)));
      const k = winZoom / zoom;   // 기기 px → 창 px
      return { device: [w, h], zoom, logical, window: [logical[0] * winZoom, logical[1] * winZoom], winZoom, insets: [ins.l, ins.t, ins.r, ins.b].map(v => Math.round(v * k)) };
    };
    const notch = (w, h) => w > h ? { l: Math.round(h * 0.08), t: 0, r: Math.round(h * 0.08), b: Math.round(h * 0.04) } : { l: 0, t: Math.round(w * 0.09), r: 0, b: Math.round(w * 0.045) };   // 노치 · 펀치홀 + 제스처 바 흉내
    const none = { l: 0, t: 0, r: 0, b: 0 }, c = cfg.insets;
    const ins = cfg.safeArea === 'notch' ? notch(dev.w, dev.h) : cfg.safeArea === 'custom' ? c : none;
    // 돌린 방향의 안전 영역: 노치는 그 방향의 모양 그대로, 직접 넣은 값은 기기를 시계 반대로 돌린 것처럼 (위 → 왼쪽)
    const insR = cfg.safeArea === 'notch' ? notch(dev.h, dev.w) : cfg.safeArea === 'custom' ? { l: c.t, t: c.r, r: c.b, b: c.l } : none;
    const main = orient(dev.w, dev.h, ins);
    return { env: cfg.env, name: ENV_NAMES[cfg.env], kind: 'phone', dpi: dev.dpi, ...main, iface,
      rotated: cfg.rotate ? orient(dev.h, dev.w, insR) : null, rotate: cfg.rotate, touch: cfg.touch, debug: cfg.debug, speed: cfg.speed };
  }
  /** 한 줄 설명 (도구 모음 · 메뉴 · 창) */
  const describe = r => r.kind === 'pc' ? `${r.name} · ${r.window[0]}×${r.window[1]} 창 · ${r.zoom ? `UI ${r.logical[0]}×${r.logical[1]} (×${r.zoom})` : 'UI 배율 자동 (모니터에 따라 게임이 정함)'}`
    : `${r.name} · 기기 ${r.device[0]}×${r.device[1]}px ${r.dpi}dpi → UI ${r.logical[0]}×${r.logical[1]} (기기 ×${r.zoom}) · PC 창 ${r.window[0]}×${r.window[1]} (×${r.winZoom})`;
  return { PRESETS, ENV_NAMES, SPEEDS, DEFAULT, normalize, resolve, gameZoom, describe };
})();
