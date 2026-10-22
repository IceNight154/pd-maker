// ================================================================
//  타이틀 화면 공통 규칙 (7차) — 편집기 미리보기와 게임 런타임이 같은 식을 씀
//    런타임: runtime/.../pdmaker/MakerTitleModel.java (같은 함수 · 같은 순서). tools/tests/run.js 가 같은 입력을 양쪽에 넣어 결과를 비교함
//    (자바 쪽을 실제로 컴파일 · 실행 — tools/tests/TitleModelCheck.java)
//
//  좌표: 게임 UI 좌표(논리 화면 W×H, 원점 왼쪽 위). 위치 0~1 = 화면(또는 안전 영역)의 비율, 크기 · 이동 = 게임 픽셀
//  글자 크기를 재는 일만 엔진마다 다름 (게임 = 실제 글꼴 · 편집기 = 같은 글꼴 파일을 캔버스로) → 잰 값을 넣어 주면 나머지 계산은 같음
//
//  title.json 에 더한 칸 (모두 없어도 됨 — 없으면 6차까지와 같은 모습):
//    buttons.states { normal|hover|focus|pressed|disabled: 상태 모양 }   buttons.items[].states (그 버튼만)
//    buttons.items[]: enabled · noSave(이어하기 저장 없음: disable|hide|newgame) · window(창 id) · size(글자) · place{x,y,w,h}(배치 free) · effects[] · focusOrder
//    buttons.layout: 'free' (버튼마다 place)
//    elements[] (글 · 그림 — 글에는 {version} 같은 정보 칸)   windows[] (팝업 창과 내용)
// ================================================================
PDM.titleModel = (function () {
  /** 게임 버튼: id → [TitleScene 글 키, 기본 아이콘] (런타임 MakerTitle.IDS · KEYS · ICONS 와 같은 순서) */
  const GAME_BUTTONS = [['play', 'enter', 'ENTER'], ['support', 'support', 'GOLD'], ['rankings', 'rankings', 'RANKINGS'], ['journal', 'journal', 'JOURNAL'],
    ['news', 'news', 'NEWS'], ['changes', 'changes', 'CHANGES'], ['settings', 'settings', 'PREFS'], ['about', 'about', 'SHPX']];
  const GAME_IDS = GAME_BUTTONS.map(b => b[0]);
  /** 버튼 동작 (게임이 실제로 하는 것만) */
  const ACTIONS = { text: '글 창 띄우기 (원작 모양 창)', window: '내가 만든 창 열기', newgame: '새 게임 (영웅 선택)', continue: '이어하기 (저장 슬롯 고르기)',
    scene: '게임 화면 열기 (랭킹 · 설정 …)', url: '웹 페이지 열기', quit: '게임 끄기 (PC · Android)', close: '이 창 닫기 (창 안 버튼)' };
  const SCENES = { about: '소개', rankings: '랭킹', journal: '모험 일지', news: '새 소식', changes: '변경', settings: '설정 창', support: '지원', badges: '배지' };
  const STD_BUTTONS = GAME_BUTTONS.map(b => b.slice());
  /** 10차: 게임 버튼 구성을 선택한 저장소의 TitleScene 에 맞춤 (편집기 미리보기만 — 런타임 MakerTitleModel 은 원작 구성). null = 원작 구성.
   *  def = { buttons: [[id, 글 키, 아이콘]], order: { land: [id…], port: [id…] } } — 배열을 그 자리에서 바꿈 (내보낸 참조 유지) */
  let ORDER = null;
  function setGame(def) {
    const list = def && def.buttons && def.buttons.length ? def.buttons : STD_BUTTONS;
    GAME_BUTTONS.splice(0, GAME_BUTTONS.length, ...list.map(b => b.slice()));
    GAME_IDS.splice(0, GAME_IDS.length, ...GAME_BUTTONS.map(b => b[0]));
    ORDER = def && def.order ? def.order : null;
    return !!(def && def.buttons && def.buttons.length);
  }
  const NO_SAVE = { disable: '누를 수 없게 (흐리게)', hide: '숨기기', newgame: '새 게임으로' };

  // ---------------- 버튼 상태 ----------------
  /** 상태 (뒤일수록 우선): 기본 < 포인터 오버 < 키보드 포커스 < 눌림 < 비활성. 비활성 버튼은 포인터가 올라가도 비활성 모양 */
  const STATES = ['normal', 'hover', 'focus', 'pressed', 'disabled'];
  const STATE_NAMES = { normal: '기본', hover: '포인터 오버', focus: '키보드 포커스 (선택)', pressed: '눌림', disabled: '비활성' };
  /** 상태 모양 칸: skin(chrome.png 조각) · image(내 9조각 그림) · slice · textColor · textAlpha · alpha(전체) · scale(바탕 크기) · bright(바탕 밝기) · dy(아래로 px) */
  const STYLE_KEYS = ['skin', 'image', 'slice', 'textColor', 'textAlpha', 'alpha', 'scale', 'bright', 'dy'];
  /** 게임 그대로의 상태 모양 — 원작 StyledButton: 눌림 = 바탕 밝기 1.2, 비활성(enable(false)) = 글자 투명도 0.3. 오버 · 포커스 모양은 원작에 없어 포커스만 밝게 */
  const BUILTIN = { normal: { skin: 'GREY_BUTTON_TR', image: '', slice: 4, textColor: '#ffffff', textAlpha: 1, alpha: 1, scale: 1, bright: 1, dy: 0 },
    hover: {}, focus: { bright: 1.3 }, pressed: { bright: 1.2 }, disabled: { textAlpha: 0.3 } };
  const HEX = /^#[0-9a-f]{6}$/i;
  const it_ = (v, d) => { if (v === '' || v === null || v === undefined) return d; const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : d; };   // 자바 getInt (소수 = 버림)
  const fl_ = (v, d) => { const n = Number(v); return v === null || v === undefined || v === '' || !Number.isFinite(n) ? d : n; };
  const num = (v, def, lo, hi) => { const n = Number(v); return v === '' || v === null || v === undefined || !Number.isFinite(n) ? def : Math.min(hi, Math.max(lo, n)); };
  /** 한 상태의 값 중 쓸 수 있는 것만 o 에 덮음 (틀린 값은 무시 — 검사가 알림) */
  function mergeState(o, s, chrome) {
    if (!s || typeof s !== 'object') return;
    if (typeof s.skin === 'string' && s.skin && (!chrome || chrome[s.skin])) o.skin = s.skin;
    if (typeof s.image === 'string' && s.image) o.image = s.image;
    if (s.slice !== undefined && s.slice !== '') o.slice = num(s.slice, o.slice, 0, 64);
    if (typeof s.textColor === 'string' && HEX.test(s.textColor)) o.textColor = s.textColor.toLowerCase();
    if (s.textAlpha !== undefined && s.textAlpha !== '') o.textAlpha = num(s.textAlpha, o.textAlpha, 0, 1);
    if (s.alpha !== undefined && s.alpha !== '') o.alpha = num(s.alpha, o.alpha, 0, 1);
    if (s.scale !== undefined && s.scale !== '') o.scale = num(s.scale, o.scale, 0.5, 2);
    if (s.bright !== undefined && s.bright !== '') o.bright = num(s.bright, o.bright, 0, 3);
    if (s.dy !== undefined && s.dy !== '') o.dy = num(s.dy, o.dy, -20, 20);
  }
  /** 버튼의 지금 모양. flags = { hover, focus, pressed, disabled }. groupStyle = 예전 buttons.style (chrome 조각 이름).
   *  같은 상태 안에서는 버튼 칸 > 묶음 칸 > 게임 기본, 다른 상태끼리는 우선순위가 높은 상태가 이김 */
  function resolveStyle(bs, item, flags, opt) {
    const o = Object.assign({}, BUILTIN.normal), chrome = opt && opt.chrome;
    if (bs && typeof bs.style === 'string' && bs.style && (!chrome || chrome[bs.style])) o.skin = bs.style;
    if (opt && opt.accent && HEX.test(opt.accent)) o.textColor = opt.accent.toLowerCase();   // "게임을 지원하기" (글을 안 바꿨을 때) = 노란 글자 — 원작과 같음
    const gs = (bs && bs.states) || {}, is = (item && item.states) || {};
    STATES.forEach(s => {
      if (s !== 'normal' && !(flags && flags[s])) return;
      if (s !== 'normal') mergeState(o, BUILTIN[s], null);
      mergeState(o, gs[s], chrome); mergeState(o, is[s], chrome);
    });
    return o;
  }

  // ---------------- 효과 (애니메이션) ----------------
  /** 효과: { trigger: enter|always|hover|focus|click, type: fade|move|scale|bright|shake, dir(move/shake: up|down|left|right · shake 는 x|y 도), from, to,
   *         duration(초), delay(초), repeat(0 = 한 번, n = n번 더, -1 = 끝없이), yoyo(번갈아 되돌아감), ease: linear|smooth|inout|back, freq(shake 초당 흔들림) } */
  const TRIGGERS = { enter: '화면에 나타날 때 (메뉴가 열릴 때)', always: '늘 (나타난 뒤 계속)', hover: '포인터가 올라가 있는 동안', focus: '키보드로 고른 동안', click: '누를 때마다' };
  const FX_TYPES = { fade: '투명도', move: '이동', scale: '크기', bright: '밝기 (강조)', shake: '흔들림' };
  const EASES = { linear: '일정하게', smooth: '부드럽게 멈춤', inout: '부드럽게 시작 · 멈춤', back: '살짝 튀어나옴' };
  /** 초보자용 묶음 — 고르면 고급 칸이 채워짐 */
  const FX_PRESETS = {
    fadeIn: ['서서히 나타남', { trigger: 'enter', type: 'fade', from: 0, to: 1, duration: 0.5, ease: 'smooth' }],
    slideUp: ['아래에서 올라옴', { trigger: 'enter', type: 'move', dir: 'down', from: 16, to: 0, duration: 0.5, ease: 'smooth' }],
    slideLeft: ['오른쪽에서 들어옴', { trigger: 'enter', type: 'move', dir: 'right', from: 24, to: 0, duration: 0.5, ease: 'smooth' }],
    pop: ['튀어나옴 (팝업)', { trigger: 'enter', type: 'scale', from: 0.6, to: 1, duration: 0.4, ease: 'back' }],
    hoverGrow: ['오버하면 커짐', { trigger: 'hover', type: 'scale', from: 1, to: 1.1, duration: 0.15, ease: 'smooth' }],
    hoverGlow: ['오버하면 밝아짐 (강조)', { trigger: 'hover', type: 'bright', from: 1, to: 1.5, duration: 0.15, ease: 'smooth' }],
    focusBob: ['고르면 통통', { trigger: 'focus', type: 'move', dir: 'up', from: 0, to: 2, duration: 0.4, repeat: -1, yoyo: true, ease: 'inout' }],
    clickShake: ['누르면 흔들림', { trigger: 'click', type: 'shake', dir: 'x', from: 3, to: 0, duration: 0.3, freq: 12, ease: 'linear' }],
    clickFlash: ['누르면 번쩍', { trigger: 'click', type: 'bright', from: 2, to: 1, duration: 0.3, ease: 'smooth' }],
    blink: ['깜빡임 (계속)', { trigger: 'always', type: 'fade', from: 1, to: 0.5, duration: 0.8, repeat: -1, yoyo: true, ease: 'inout' }],
    float: ['둥실둥실 (계속)', { trigger: 'always', type: 'move', dir: 'up', from: 0, to: 2, duration: 1, repeat: -1, yoyo: true, ease: 'inout' }]
  };
  function ease(kind, k) {
    k = Math.max(0, Math.min(1, k));
    switch (kind) {
      case 'linear': return k;
      case 'inout': return k * k * (3 - 2 * k);
      case 'back': { const c = 1.70158; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); }
      default: return 1 - (1 - k) * (1 - k) * (1 - k);   // smooth = 부드럽게 멈춤 (원작 등장 애니메이션과 같은 식)
    }
  }
  /** 효과 칸 정리 (틀린 값 → 안전한 값) */
  function fxNorm(fx) {
    const f = fx || {};
    const type = FX_TYPES[f.type] ? f.type : 'fade';
    const defFrom = type === 'fade' ? 0 : type === 'scale' ? 0.6 : type === 'bright' ? 1 : type === 'shake' ? 3 : 16;
    const defTo = type === 'fade' || type === 'scale' || type === 'bright' ? 1 : 0;
    return { trigger: TRIGGERS[f.trigger] ? f.trigger : 'enter', type, dir: typeof f.dir === 'string' && f.dir ? f.dir : (type === 'shake' ? 'x' : 'down'),
      from: num(f.from, defFrom, -1000, 1000), to: num(f.to, defTo, -1000, 1000), duration: num(f.duration, 0.5, 0.01, 60), delay: num(f.delay, 0, 0, 60),
      repeat: Math.round(num(f.repeat, 0, -1, 1000)), yoyo: !!f.yoyo, ease: EASES[f.ease] ? f.ease : 'smooth', freq: num(f.freq, 12, 0.1, 60) };
  }
  /** 시간 tau(초 — 효과마다 시작부터) → 진행 0~1 (반복 · 번갈아). 끝난 뒤 = 마지막 값 (번갈아 + 짝수 번 = 처음 값) */
  function fxProgress(f, tau) {
    const t = tau - f.delay;
    if (t <= 0) return 0;
    const raw = t / f.duration, c = Math.floor(raw);
    if (f.repeat >= 0 && c > f.repeat) return f.yoyo && f.repeat % 2 === 1 ? 0 : 1;
    const frac = raw - c;
    return f.yoyo && c % 2 === 1 ? 1 - frac : frac;
  }
  /** 효과 하나의 값 { dx, dy, scale, alpha, bright } */
  function fxValue(fx, tau) {
    const f = fxNorm(fx), p = fxProgress(f, tau), e = ease(f.ease, p), v = f.from + (f.to - f.from) * e;
    const out = { dx: 0, dy: 0, scale: 1, alpha: 1, bright: 1 };
    switch (f.type) {
      case 'fade': out.alpha = Math.max(0, Math.min(1, v)); break;
      case 'scale': out.scale = Math.max(0, v); break;
      case 'bright': out.bright = Math.max(0, v); break;
      case 'move': {   // dir = 시작 쪽: down = 아래에서(+y) — 값 v 만큼 그쪽으로
        const s = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[f.dir] || [0, 1];
        out.dx = s[0] * v; out.dy = s[1] * v; break;
      }
      case 'shake': {   // 진폭 v (시작 → 끝) 로 흔들림. 진행으로 셈 → 끝 값이 0 이면 끝에서 정확히 0
        const d = v * Math.sin(Math.PI * 2 * f.freq * f.duration * p);
        if (f.dir === 'y' || f.dir === 'up' || f.dir === 'down') out.dy = d; else out.dx = d;
        break;
      }
    }
    return out;
  }
  /** 여러 효과 합치기 (이동은 더함, 크기 · 투명도 · 밝기는 곱함) */
  function fxCombine(list) {
    const o = { dx: 0, dy: 0, scale: 1, alpha: 1, bright: 1 };
    list.forEach(v => { o.dx += v.dx; o.dy += v.dy; o.scale *= v.scale; o.alpha *= v.alpha; o.bright *= v.bright; });
    return o;
  }
  /** "동안" 효과(hover · focus)의 시간: 켜져 있으면 앞으로, 꺼지면 (한 바퀴 안으로 줄인 뒤) 거꾸로 0 까지 — 짧게 여러 번 켜도 쌓이지 않음 */
  function heldStep(tau, active, dt, fx) {
    const f = fxNorm(fx);
    if (active) return tau + dt;
    const end = f.delay + f.duration;
    return Math.max(0, Math.min(tau, end) - dt);
  }
  /** 효과 시간이 끝났는지 (click 효과를 지우는 데 씀) */
  function fxDone(fx, tau) { const f = fxNorm(fx); return f.repeat >= 0 && tau - f.delay >= f.duration * (f.repeat + 1); }

  /** 버튼 묶음 등장 · 대기 애니메이션 (예전 buttons.anim — 6차까지와 같은 식) → { dx, dy, alpha, bw, a(등장 진행 0~1) }
   *  gateOn/revealed/returning = "화면을 누르세요" 상태, returnT = 돌아가는 진행, clock = 등장 시계, t = 화면 시간, i = 버튼 번호, hideK = 화면 감추기 진행 */
  function groupAnim(an, gateOn, revealed, returning, returnT, clock, t, i, bw, hideK) {
    an = an || {};
    let enter = typeof an.enter === 'string' && an.enter ? an.enter : (gateOn ? 'slideUp' : 'none');
    const dur = Math.max(0.05, fl_(an.duration, 0.6)), stag = fl_(an.stagger, 0.08), dist = fl_(an.distance, 24);
    const idle = typeof an.idle === 'string' && an.idle ? an.idle : 'none', amt = fl_(an.idleAmount, 2), spd = fl_(an.idleSpeed, 1);
    let a;
    if (!revealed && !returning && gateOn) a = 0;
    else if (enter === 'none') a = 1;
    else a = Math.max(0, Math.min(1, (clock - i * stag) / dur));
    const out = returning ? returnT : 0;
    let k = ease('smooth', a), dx = 0, dy = 0, w = bw;
    switch (enter) {
      case 'slideUp': dy = dist * (1 - k); break;
      case 'slideDown': dy = -dist * (1 - k); break;
      case 'slideLeft': dx = dist * (1 - k); break;
      case 'slideRight': dx = -dist * (1 - k); break;
      case 'drop': dy = -dist * (1 - ease('back', a)); k = Math.min(1, a * 2); break;
      case 'pop': w = bw * (0.6 + 0.4 * ease('back', a)); k = Math.min(1, a * 2); break;
    }
    dy += dist * 0.5 * out;
    let alpha = (enter === 'none' ? (a > 0 ? 1 : 0) : k) * (1 - out) * (1 - hideK);
    if (a >= 1 && !returning) {
      const ph = t * spd * 2.5 + i * 0.7;
      if (idle === 'bob') dy += Math.sin(ph) * amt;
      else if (idle === 'sway') dx += Math.sin(ph) * amt;
      else if (idle === 'pulse') alpha *= 0.8 + 0.2 * Math.sin(ph);
    }
    return { dx, dy, alpha, bw: w, a, stagger: stag };
  }

  // ---------------- 버튼 목록 · 배치 ----------------
  /** 화면에 놓을 버튼 (순서대로). ctx = { hasSaves, canQuit } — 이어하기 저장 없음 · 플랫폼이 못 하는 동작 처리.
   *  [{ id, item, gameIndex(게임 버튼 번호 또는 -1), disabled, action }] */
  function buttonList(bs, ctx) {
    const items = (bs && Array.isArray(bs.items)) ? bs.items : [];
    const byId = new Map(); items.forEach(it => { if (it && typeof it.id === 'string' && !byId.has(it.id)) byId.set(it.id, it); });
    const ids0 = ORDER && ctx && ctx.land !== undefined ? (ctx.land ? ORDER.land : ORDER.port) || GAME_IDS : GAME_IDS;   // 10차: 저장소 원래 타이틀은 방향마다 순서가 다를 수 있음
    // 저장소 원래 타이틀: 게임 버튼은 늘 그 저장소 순서 (버튼 칸을 고쳐도 자리는 원본), 내가 만든 버튼은 뒤에 · 원작: 예전처럼 items 순서가 먼저
    const order = ORDER && ctx && ctx.land !== undefined ? ids0.concat([...byId.keys()].filter(id => !ids0.includes(id))) : [...byId.keys()].concat(ids0.filter(id => !byId.has(id)));
    GAME_IDS.forEach(id => { if (!order.includes(id)) order.push(id); });
    const out = [];
    order.forEach(id => {
      const it = byId.get(id) || null, gi = GAME_IDS.indexOf(id);
      if (it && it.visible === false) return;
      if (gi < 0 && !(it && (it.custom || (typeof it.action === 'string' && it.action)))) return;
      let action = it && typeof it.action === 'string' ? it.action : '';
      let disabled = !!(it && it.enabled === false);
      if (action === 'continue' && ctx && !ctx.hasSaves) {
        const ns = it.noSave || 'disable';
        if (ns === 'hide') return;
        if (ns === 'newgame') action = 'newgame'; else disabled = true;
      }
      if (action === 'quit' && ctx && !ctx.canQuit) return;   // 이 플랫폼에서 끌 수 없음 (iOS · 웹) — 안 보임
      if (action === 'close') return;                          // 창 안에서만
      out.push({ id, item: it, gameIndex: gi, disabled, action });
    });
    return out;
  }
  /** 버튼 자리 [x, y, w, h] — 런타임 MakerTitle.Root.layout 과 같은 식 (정수 칸은 자바처럼 버림). logo = { y, h } (로고 아래 끝 계산) */
  function buttonRects(bs, n, W, H, land, logo, gate, places) {
    bs = bs || {}; gate = gate || {};
    const layout = typeof bs.layout === 'string' && bs.layout ? bs.layout : 'game';
    const bh = it_(bs.height, 20), gap = it_(bs.gap, 3);
    let aw = it_(bs.width, 0) > 0 ? it_(bs.width, 0) : (land ? 240 - 6 : 135 - 2);
    aw = Math.min(aw, W - 4);
    let left = (W - aw) / 2 + fl_(bs.offsetX, 0);
    const logoBottom = logo.y + logo.h, center = !!gate.enabled && (gate.logoAfter || 'fade') === 'fade';
    const out = [];
    if (layout === 'game') {
      const topRegion = Math.max(logoBottom - 2, H * 0.45);
      let GAP = Math.trunc(Math.trunc(H - topRegion - (land ? 3 : 4) * bh) / 3); GAP = Math.trunc(GAP / (land ? 3 : 5)); GAP = Math.max(GAP, 2);
      const top = fl_(bs.top, 0) > 0 ? fl_(bs.top, 0) * H : (center ? (H - (land ? 3 : 5) * (bh + GAP)) / 2 : topRegion + GAP);
      const perRow = land ? [2, 3, 3] : [1, 1, 2, 2, 2];
      let i = 0, row = 0, y = top;
      while (i < n) {
        let cols = row < perRow.length ? perRow[row] : (land ? 3 : 2);
        cols = Math.min(cols, n - i);
        const cw = (aw - (cols - 1) * 2) / cols;
        for (let c = 0; c < cols; c++, i++) out.push([left + c * (cw + 2), y, cw, bh]);
        y += bh + GAP; row++;
      }
      return out;
    }
    const free = layout === 'free';
    const cols = layout === 'column' || free ? 1 : Math.max(1, it_(bs.columns, land ? 3 : 2));
    const firstWide = !!bs.firstWide && cols > 1;
    const rows = firstWide ? 1 + Math.ceil((n - 1) / cols) : Math.ceil(n / cols);
    const blockH = rows * bh + (rows - 1) * gap;
    if ((layout === 'column' || free) && it_(bs.width, 0) <= 0) { aw = Math.min(120, W - 4); left = (W - aw) / 2 + fl_(bs.offsetX, 0); }
    let top = fl_(bs.top, 0) > 0 ? fl_(bs.top, 0) * H : (center ? (H - blockH) / 2 : Math.max(logoBottom + gap * 2, H * 0.45));
    if (top + blockH > H - 4) top = Math.max(2, H - 4 - blockH);
    const cw = (aw - (cols - 1) * 2) / cols;
    let y = top;
    for (let i = 0; i < n; i++) {
      if (i === 0 && firstWide) { out.push([left, y, aw, bh]); y += bh + gap; continue; }
      const k = i - (firstWide ? 1 : 0), c = k % cols;
      if (c === 0 && k > 0) y += bh + gap;
      out.push([left + c * (cw + 2), y, cw, bh]);
    }
    // 자유 배치: place { x, y (화면 비율 — 버튼 가운데), w, h (게임 픽셀, 0 = 위 계산) } 가 있는 버튼만 그 자리
    if (free && places) for (let i = 0; i < n; i++) {
      const p = places[i]; if (!p || typeof p !== 'object') continue;
      const w = fl_(p.w, 0) > 0 ? fl_(p.w, 0) : out[i][2], h = fl_(p.h, 0) > 0 ? fl_(p.h, 0) : out[i][3];
      const cx = p.x === undefined || p.x === '' ? out[i][0] + out[i][2] / 2 : fl_(p.x, 0.5) * W, cy = p.y === undefined || p.y === '' ? out[i][1] + out[i][3] / 2 : fl_(p.y, 0.5) * H;
      out[i] = [cx - w / 2, cy - h / 2, w, h];
    }
    return out;
  }
  /** 로고 자리 (MakerTitle.buildLogo 와 같음). size = { w, h } 잰 크기 (부제 포함) */
  function logoRect(lg, gate, W, H, size) {
    lg = lg || {};
    const topRegion = Math.max(size.h - 6, H * 0.45);
    const y0 = fl_(lg.y, 0);
    const cy = y0 > 0 ? y0 * H : ((gate || {}).enabled ? H / 2 - 8 : 2 + topRegion / 2);
    return { x: (W - size.w) / 2 + fl_(lg.offsetX, 0), y: cy - size.h / 2 + fl_(lg.offsetY, 0), w: size.w, h: size.h };
  }

  // ---------------- 요소 (글 · 그림) ----------------
  const ELEMENT_TYPES = { text: '글 (정보 칸 넣을 수 있음)', image: '그림' };
  const LAYERS = { back: '로고 뒤 (배경 위)', front: '버튼 위 (맨 앞)' };
  const SHOW = { always: '늘', gate: '"화면을 누르세요" 동안만', menu: '메뉴가 열린 뒤만' };
  const ALIGNS = { left: '왼쪽', center: '가운데', right: '오른쪽' };
  /** 요소 자리. area = { x, y, w, h } (화면 또는 안전 영역), size = { w, h } 잰 크기 (글: 줄바꿈 폭 w 로 잰 것).
   *  → { x, y, w, h(상자), tx(글 왼쪽 — 정렬 반영) } */
  function elementRect(el, area, size) {
    const bw = el.type === 'text' && fl_(el.w, 0) > 0 ? fl_(el.w, 0) : size.w, bh = size.h;
    const x = area.x + fl_(el.x, 0.5) * area.w - fl_(el.anchorX, 0.5) * bw + fl_(el.offsetX, 0);
    const y = area.y + fl_(el.y, 0.5) * area.h - fl_(el.anchorY, 0.5) * bh + fl_(el.offsetY, 0);
    const al = el.align === 'left' || el.align === 'right' ? el.align : 'center';
    const tx = al === 'left' ? x : al === 'right' ? x + bw - size.w : x + (bw - size.w) / 2;
    return { x, y, w: bw, h: bh, tx };
  }
  /** 지금 상태에서 보이는가 (gate = "화면을 누르세요" 상태) */
  function elementShown(el, gateShowing) {
    if (!el || el.visible === false) return false;
    const s = el.show || 'always';
    return s === 'always' || (s === 'gate' ? gateShowing : !gateShowing);
  }

  // ---------------- 정보 칸 ----------------
  /** 글 속 {이름} → 실제 값. 게임이 실제로 아는 것만 (없는 이름은 그대로 두고 검사가 오류로 알림) */
  const BINDS = { gameName: '게임 이름 (프로젝트 설정)', author: '만든 사람 (프로젝트 설정)', version: '게임 버전 (예: 4.0.0)', versionCode: '버전 코드 (빌드 번호)',
    saveCount: '저장된 게임 수', lastHero: '마지막 게임의 영웅', lastDepth: '마지막 게임의 깊이 (층)', lastLevel: '마지막 게임의 영웅 레벨', date: '오늘 날짜 (YYYY-MM-DD)' };
  /** vals = { 이름: 값 또는 null(그 값 없음 — 예: 저장 없음) } → { text, missing[], unknown[] }. 값이 하나라도 없으면 fallback(있으면) */
  function bindText(text, vals, fallback) {
    const missing = [], unknown = [];
    const out = String(text == null ? '' : text).replace(/\{(\w+)\}/g, (m, k) => {
      if (!(k in BINDS)) { unknown.push(k); return m; }
      const v = vals ? vals[k] : null;
      if (v === null || v === undefined || v === '') { missing.push(k); return ''; }
      return String(v);
    });
    if (missing.length && typeof fallback === 'string' && fallback !== '') return { text: fallback, missing, unknown };
    return { text: out, missing, unknown };
  }

  // ---------------- 창 (팝업) ----------------
  const CONTENT_TYPES = { text: '글', image: '그림', button: '버튼', divider: '구분선', space: '빈 칸', scroll: '스크롤 글 (긴 글)', setting: '게임 설정 (실제 설정을 바꿈)' };
  /** 실제로 바뀌는 게임 설정만 (원작 SPDSettings — WndSettings 와 같은 값) */
  const SETTINGS = { music: '음악 켜기', sound: '효과음 켜기', musicVol: '음악 크기 (0~10)', sfxVol: '효과음 크기 (0~10)' };
  const WIN_ANIMS = { none: '없음', fade: '서서히', slideUp: '아래에서 올라옴', slideDown: '위에서 내려옴' };
  /** 창 내용 하나의 높이 (글 · 스크롤 글은 measure 로 잰 높이) */
  function contentHeight(c, measured, imgH) {
    switch (c.type) {
      case 'text': return measured;
      case 'image': return imgH;
      case 'button': return it_(c.h, 18) > 0 ? it_(c.h, 18) : 18;
      case 'divider': return Math.max(1, it_(c.thickness, 1));
      case 'space': return Math.max(0, it_(c.h, 6));
      case 'scroll': return Math.max(12, it_(c.h, 60));
      case 'setting': return c.key === 'musicVol' || c.key === 'sfxVol' ? 21 : 16;   // 원작 WndSettings: SLIDER_HEIGHT 21 · BTN_HEIGHT 16
      default: return 0;
    }
  }
  /** 창 배치. safe = 안전 영역 { x, y, w, h }, margins = 창 그림 여백 [왼, 위, 오른, 아래], sizes[i] = { h(잰 높이), w(그림 폭) }, titleH = 제목 높이(없으면 0).
   *  → { x, y(내용 왼쪽 위 — 화면 좌표), w, h(내용 크기), chrome{x,y,w,h}, items[{x,y,w,h}], title{x,y,w,h}, close{x,y,w,h}|null, overflow } — 원작 Window 와 같은 가운데 · 이동 · 화면 안으로 */
  function windowLayout(win, W, H, safe, margins, sizes, titleH) {
    const w = Math.max(40, it_(win.w, 120)), pad = Math.max(0, it_(win.padding, 4));
    const closeBtn = win.closeButton !== false;
    const content = Array.isArray(win.content) ? win.content : [];
    let y = pad;
    const title = titleH > 0 ? { x: pad, y, w: w - pad * 2 - (closeBtn ? 12 : 0), h: titleH } : null;
    if (title) y += titleH + 2;
    else if (closeBtn) y = Math.max(y, 12);   // 닫기 단추 자리
    const items = [];
    content.forEach((c, i) => {
      const s = sizes[i] || { h: 0, w: 0 };
      if (i > 0 || title || closeBtn) y += Math.max(0, it_(c.gap, 2));
      const h = contentHeight(c, s.h, s.h);
      const cw = w - pad * 2;
      let iw = cw;
      if (c.type === 'image') iw = Math.min(cw, s.w);
      if (c.type === 'button' && it_(c.w, 0) > 0) iw = Math.min(cw, it_(c.w, 0));
      const al = c.align === 'left' ? 0 : c.align === 'right' ? 1 : 0.5;
      items.push({ x: pad + (cw - iw) * al, y, w: iw, h });
      y += h;
    });
    const auto = Math.ceil(y + pad - 1e-6);   // 게임 창 크기는 정수 (올림)
    const want = it_(win.h, 0);
    const h = want > 0 ? Math.max(want, auto) : auto;
    const [ml, mt, mr, mb] = margins;
    const cwid = w + ml + mr, chei = h + mt + mb;
    // 원작 Window: 안전 영역 가운데 + 이동(offset). 이동이 있으면 화면 가장자리 2px 안으로 (boundOffsetWithMargin)
    const offX = it_(win.offsetX, 0), offY = it_(win.offsetY, 0);
    let cx = safe.x + (safe.w - cwid) / 2 + offX, cy = safe.y + (safe.h - chei) / 2 + offY;
    if (offX !== 0) { if (cx < 2) cx = 2; else if (cx + cwid > W - 2) cx = W - 2 - cwid; }
    if (offY !== 0) { if (cy < 2) cy = 2; else if (cy + chei > H - 2) cy = H - 2 - chei; }
    const ox = cx + ml, oy = cy + mt;
    return { x: ox, y: oy, w, h, chrome: { x: cx, y: cy, w: cwid, h: chei },
      items: items.map(r => ({ x: ox + r.x, y: oy + r.y, w: r.w, h: r.h })),
      title: title ? { x: ox + title.x, y: oy + title.y, w: title.w, h: title.h } : null,
      close: closeBtn ? { x: ox + w - 11, y: oy, w: 11, h: 11 } : null,
      overflow: want > 0 && auto > want, tooTall: chei > H - 4 };
  }

  // ---------------- 검사 ----------------
  /** title.json 검사 → [{ level: error|warn, where, msg, sel(편집기에서 고를 것: 'button:<id>' · 'element:<id>' · 'window:<id>' · 'content:<창 id>:<번호>') }] */
  function check(t, ctx) {
    const out = [], add = (level, where, msg, sel) => out.push({ level, where, msg, sel });
    if (!t || typeof t !== 'object') return out;
    const chrome = (ctx && ctx.chrome) || (PDM.gameTheme && PDM.gameTheme.CHROME) || {};
    const bs = t.buttons || {}, items = Array.isArray(bs.items) ? bs.items : [];
    const wins = Array.isArray(t.windows) ? t.windows : [], els = Array.isArray(t.elements) ? t.elements : [];
    const winIds = new Set();
    const ids = new Map();
    const dup = (kind, id, sel, where) => { if (!id) { add('error', where, `${kind} id 가 비어 있습니다`, sel); return; } const k = kind + ':' + id; if (ids.has(k)) add('error', where, `${kind} id "${id}" 가 겹칩니다 (id 는 하나씩만)`, sel); ids.set(k, true); };
    wins.forEach((w, i) => { dup('창', w && w.id, 'window:' + (w && w.id), `창 ${i + 1}`); if (w && w.id) winIds.add(w.id); });
    const states = (where, st, sel) => { if (!st || typeof st !== 'object') return; Object.entries(st).forEach(([s, v]) => {
      if (!STATES.includes(s)) { add('warn', where, `모르는 상태 "${s}" — 무시됩니다`, sel); return; }
      if (!v || typeof v !== 'object') return;
      if (v.skin && !chrome[v.skin]) add('error', where, `${STATE_NAMES[s]} 상태의 조각 "${v.skin}" 이(가) chrome.png 에 없습니다`, sel);
      if (v.textColor && !HEX.test(v.textColor)) add('error', where, `${STATE_NAMES[s]} 상태의 글자 색 "${v.textColor}" 이(가) 올바른 색(#rrggbb)이 아닙니다`, sel);
      [['alpha', 0, 1], ['textAlpha', 0, 1], ['scale', 0.5, 2], ['bright', 0, 3]].forEach(([k, lo, hi]) => { if (v[k] !== undefined && v[k] !== '' && !(Number(v[k]) >= lo && Number(v[k]) <= hi)) add('warn', where, `${STATE_NAMES[s]} 상태의 ${k} ${v[k]} — ${lo}~${hi} 로 고쳐 씁니다`, sel); });
    }); };
    const effects = (where, list, sel) => (Array.isArray(list) ? list : []).forEach((f, j) => {
      if (!f || typeof f !== 'object') return;
      if (f.type && !FX_TYPES[f.type]) add('error', where, `효과 ${j + 1}: 모르는 종류 "${f.type}"`, sel);
      if (f.trigger && !TRIGGERS[f.trigger]) add('error', where, `효과 ${j + 1}: 모르는 시작 조건 "${f.trigger}"`, sel);
      if (f.duration !== undefined && !(Number(f.duration) > 0)) add('warn', where, `효과 ${j + 1}: 시간 ${f.duration} — 0보다 커야 합니다 (0.5초로 씀)`, sel);
      if (f.trigger === 'click' && Number(f.repeat) < 0) add('warn', where, `효과 ${j + 1}: 누를 때 효과가 끝없이 반복됩니다`, sel);
    });
    const action = (where, it, sel, inWindow) => {
      const a = it.action;
      if (a && !ACTIONS[a]) add('error', where, `모르는 동작 "${a}"`, sel);
      if (a === 'window' && !it.window) add('error', where, '열 창을 고르지 않았습니다', sel);
      else if (a === 'window' && !winIds.has(it.window)) add('error', where, `없는 창 "${it.window}" 을(를) 엽니다`, sel);
      if (a === 'url' && !it.url) add('warn', where, '주소가 비어 있습니다', sel);
      if (a === 'scene' && it.scene && !SCENES[it.scene]) add('error', where, `모르는 화면 "${it.scene}"`, sel);
      if (a === 'close' && !inWindow) add('warn', where, '"이 창 닫기"는 창 안 버튼에서만 쓰입니다 — 타이틀에는 안 보입니다', sel);
      if (a === 'quit') add('info', where, '게임 끄기는 PC · Android 에서만 보입니다 (iOS · 웹에서는 버튼이 숨겨짐)', sel);
      if (a === 'continue' && (it.noSave || 'disable') === 'disable') add('info', where, '저장된 게임이 없으면 흐리게 (누를 수 없음) 보입니다', sel);
    };
    items.forEach((it, i) => {
      if (!it || typeof it !== 'object') return;
      const where = `타이틀 화면 › 버튼 ${it.label || it.id || i + 1}`, sel = 'button:' + it.id;
      dup('버튼', it.id, sel, where);
      action(where, it, sel, false);
      states(where, it.states, sel); effects(where, it.effects, sel);
      if (bs.layout === 'free' && it.place) ['w', 'h'].forEach(k => { if (it.place[k] !== undefined && it.place[k] !== '' && !(Number(it.place[k]) >= 0)) add('error', where, `자유 배치 ${k} 값 ${it.place[k]} 이(가) 잘못됐습니다`, sel); });
    });
    states('타이틀 화면 › 버튼 묶음', bs.states, 'buttons');
    if (bs.layout && !['game', 'grid', 'column', 'free'].includes(bs.layout)) add('error', '타이틀 화면 › 버튼 묶음', `모르는 배치 "${bs.layout}"`, 'buttons');
    els.forEach((el, i) => {
      if (!el || typeof el !== 'object') return;
      const where = `타이틀 화면 › 요소 ${el.name || el.id || i + 1}`, sel = 'element:' + el.id;
      dup('요소', el.id, sel, where);
      if (!ELEMENT_TYPES[el.type]) add('error', where, `모르는 요소 종류 "${el.type}"`, sel);
      if (el.type === 'image' && !el.image) add('warn', where, '그림이 비어 있습니다 (안 보임)', sel);
      if (el.type === 'text') { const b = bindText(el.text, {}, ''); b.unknown.forEach(k => add('error', where, `없는 정보 칸 {${k}} — 게임이 모르는 값입니다 (쓸 수 있는 것: ${Object.keys(BINDS).join(', ')})`, sel)); if (el.color && !HEX.test(el.color)) add('error', where, `글자 색 "${el.color}" 이(가) 올바른 색(#rrggbb)이 아닙니다`, sel); }
      ['x', 'y', 'anchorX', 'anchorY'].forEach(k => { if (el[k] !== undefined && el[k] !== '' && !Number.isFinite(Number(el[k]))) add('error', where, `${k} 값 "${el[k]}" 이(가) 숫자가 아닙니다`, sel); });
      if (el.x !== undefined && (Number(el.x) < -0.5 || Number(el.x) > 1.5) || el.y !== undefined && (Number(el.y) < -0.5 || Number(el.y) > 1.5)) add('warn', where, '화면 밖에 놓였습니다 (목록에서 골라 옮길 수 있음)', sel);
      if (el.alpha !== undefined && el.alpha !== '' && !(Number(el.alpha) >= 0 && Number(el.alpha) <= 1)) add('warn', where, `투명도 ${el.alpha} — 0~1 로 고쳐 씁니다`, sel);
      effects(where, el.effects, sel);
    });
    wins.forEach((w, i) => {
      if (!w || typeof w !== 'object') return;
      const where = `타이틀 화면 › 창 ${w.title || w.id || i + 1}`, sel = 'window:' + w.id;
      if (w.skin && !chrome[w.skin]) add('error', where, `창 조각 "${w.skin}" 이(가) chrome.png 에 없습니다`, sel);
      const content = Array.isArray(w.content) ? w.content : [];
      const canClose = w.closeButton !== false || w.closeEsc !== false || w.closeOutside !== false || content.some(c => c && c.type === 'button' && (c.action === 'close' || ['newgame', 'continue', 'scene', 'window', 'quit'].includes(c.action)));
      if (!canClose) add('error', where, '닫을 방법이 없는 창입니다 (닫기 단추 · Esc · 바깥 누르기 · "이 창 닫기" 버튼 중 하나는 켜 두세요)', sel);
      if (!(Number(w.w || 120) >= 40)) add('warn', where, `너비 ${w.w} — 40 이상으로 씁니다`, sel);
      content.forEach((c, j) => {
        if (!c || typeof c !== 'object') return;
        const cw = `${where} › 내용 ${j + 1}`, cs = `content:${w.id}:${j}`;
        if (!CONTENT_TYPES[c.type]) add('error', cw, `모르는 내용 종류 "${c.type}"`, cs);
        if (c.type === 'button') action(cw, c, cs, true);
        if (c.type === 'setting' && !SETTINGS[c.key]) add('error', cw, `모르는 게임 설정 "${c.key}" (쓸 수 있는 것: ${Object.keys(SETTINGS).join(', ')})`, cs);
        if (c.type === 'image' && !c.image) add('warn', cw, '그림이 비어 있습니다', cs);
        if ((c.type === 'text' || c.type === 'scroll') && c.text) bindText(c.text, {}, '').unknown.forEach(k => add('error', cw, `없는 정보 칸 {${k}}`, cs));
        if (c.color && !HEX.test(c.color)) add('error', cw, `색 "${c.color}" 이(가) 올바른 색(#rrggbb)이 아닙니다`, cs);
      });
      // 다른 창이 여는지 (아무도 안 열면 알림)
    });
    const opened = new Set([...items.filter(x => x && x.action === 'window').map(x => x.window), ...wins.flatMap(w => (Array.isArray(w && w.content) ? w.content : []).filter(c => c && c.action === 'window').map(c => c.window))]);
    wins.forEach(w => { if (w && w.id && !opened.has(w.id)) add('warn', `타이틀 화면 › 창 ${w.title || w.id}`, '이 창을 여는 버튼이 없습니다', 'window:' + w.id); });
    return out;
  }

  // ---------------- 새로 만들 때 ----------------
  const uid = p => p + '_' + Math.random().toString(36).slice(2, 8);
  /** 지금 목록에 없는 새 id */
  function freshId(prefix, list) { const have = new Set((list || []).map(x => x && x.id)); let id; do { id = uid(prefix); } while (have.has(id)); return id; }
  function newElement(type, list) {
    return type === 'image' ? { id: freshId('img', list), type: 'image', name: '그림', visible: true, show: 'always', layer: 'back', image: '', scale: 1, x: 0.5, y: 0.5, anchorX: 0.5, anchorY: 0.5, offsetX: 0, offsetY: 0, alpha: 1, safe: true, effects: [] }
      : { id: freshId('txt', list), type: 'text', name: '글', visible: true, show: 'always', layer: 'front', text: '새 글', size: 8, color: '#ffffff', align: 'center', w: 0, fallback: '', x: 0.5, y: 0.9, anchorX: 0.5, anchorY: 0.5, offsetX: 0, offsetY: 0, alpha: 1, safe: true, effects: [] };
  }
  function newWindow(list) {
    return { id: freshId('win', list), title: '새 창', titleColor: '', w: 140, h: 0, offsetX: 0, offsetY: 0, padding: 4, skin: 'WINDOW', closeButton: true, closeOutside: true, closeEsc: true,
      anim: { type: 'fade', duration: 0.2 }, sounds: { open: '', close: '' }, content: [{ type: 'text', text: '창 내용을 여기에 씁니다.', size: 7, color: '#ffffff', align: 'left', gap: 2 }] };
  }
  function newContent(type) {
    switch (type) {
      case 'image': return { type, image: '', scale: 1, align: 'center', gap: 2 };
      case 'button': return { type, label: '닫기', action: 'close', align: 'center', w: 0, h: 18, gap: 4 };
      case 'divider': return { type, color: '#888888', thickness: 1, gap: 3 };
      case 'space': return { type, h: 6, gap: 0 };
      case 'scroll': return { type, text: '긴 글…', size: 6, color: '#dddddd', h: 60, gap: 2 };
      case 'setting': return { type, key: 'music', gap: 2 };
      default: return { type: 'text', text: '글', size: 7, color: '#ffffff', align: 'left', gap: 2 };
    }
  }
  /** 자동 테스트 · 예시용 설정 (tools/playtest/title-project.js full) — 실제 게임에서 그대로 씀 */
  function sample(t) {
    t.enabled = true;
    t.buttons = t.buttons || {};
    t.buttons.states = { hover: { bright: 1.4 }, focus: { skin: 'TOAST_TR', textColor: '#ffff44' }, disabled: { textAlpha: 0.3, alpha: 0.7 } };
    const items = t.buttons.items = GAME_IDS.map(id => ({ id, label: '', visible: id === 'play', icon: '' }));   // 게임 버튼은 "던전으로 들어가기"만 (나머지는 숨김 — 목록에는 남음)
    items.push({ id: 'cont', custom: true, label: '이어하기', visible: true, icon: 'ENTER', action: 'continue', noSave: 'disable' });
    items.push({ id: 'credits', custom: true, label: '만든 사람', visible: true, icon: 'INFO', action: 'window', window: 'credits', effects: [FX_PRESETS.hoverGrow[1], FX_PRESETS.clickShake[1]] });
    items.push({ id: 'opts', custom: true, label: '소리 설정', visible: true, icon: 'PREFS', action: 'window', window: 'options' });
    t.buttons.layout = 'column'; t.buttons.width = 0;
    t.elements = [
      { id: 'ver', type: 'text', name: '버전', visible: true, show: 'always', layer: 'front', text: '{gameName} v{version} · 저장 {saveCount}개', fallback: '', size: 6, color: '#bbbbbb', align: 'left', w: 0, x: 0, y: 1, anchorX: 0, anchorY: 1, offsetX: 3, offsetY: -2, alpha: 1, safe: true, effects: [] },
      { id: 'last', type: 'text', name: '마지막 게임', visible: true, show: 'menu', layer: 'front', text: '마지막: {lastHero} {lastDepth}층', fallback: '저장된 게임이 없습니다', size: 6, color: '#dddddd', align: 'right', w: 0, x: 1, y: 0, anchorX: 1, anchorY: 0, offsetX: -24, offsetY: 3, alpha: 1, safe: true, effects: [FX_PRESETS.fadeIn[1]] }
    ];
    t.windows = [
      { id: 'credits', title: '만든 사람', titleColor: '', w: 150, h: 0, offsetX: 0, offsetY: 0, padding: 4, skin: 'WINDOW', closeButton: true, closeOutside: true, closeEsc: true, anim: { type: 'slideUp', duration: 0.25 }, sounds: { open: '', close: '' },
        content: [{ type: 'text', text: '기획 · 개발: {author}', size: 7, color: '#ffffff', align: 'center', gap: 2 }, { type: 'divider', color: '#888888', thickness: 1, gap: 3 },
          { type: 'scroll', text: Array.from({ length: 12 }, (_, i) => `${i + 1}. 고마운 사람 ${i + 1}`).join('\n'), size: 6, color: '#dddddd', h: 50, gap: 3 },
          { type: 'text', text: '{gameName} v{version}', size: 6, color: '#aaaaaa', align: 'center', gap: 3 },
          { type: 'button', label: '닫기', action: 'close', align: 'center', w: 60, h: 18, gap: 4 }] },
      { id: 'options', title: '소리 설정', titleColor: '#ffff44', w: 130, h: 0, offsetX: 0, offsetY: 0, padding: 4, skin: 'WINDOW', closeButton: true, closeOutside: false, closeEsc: true, anim: { type: 'fade', duration: 0.2 }, sounds: { open: '', close: '' },
        content: [{ type: 'setting', key: 'music', gap: 2 }, { type: 'setting', key: 'musicVol', gap: 2 }, { type: 'setting', key: 'sound', gap: 2 }, { type: 'button', label: '확인', action: 'close', align: 'center', w: 60, h: 18, gap: 4 }] }];
    return t;
  }
  return { setGame, STD_BUTTONS, GAME_BUTTONS, GAME_IDS, ACTIONS, SCENES, NO_SAVE, STATES, STATE_NAMES, STYLE_KEYS, BUILTIN, resolveStyle, TRIGGERS, FX_TYPES, EASES, FX_PRESETS, ease, fxNorm, fxProgress, fxValue, fxCombine, heldStep, fxDone,
    buttonList, buttonRects, logoRect, groupAnim, ELEMENT_TYPES, LAYERS, SHOW, ALIGNS, elementRect, elementShown, BINDS, bindText, CONTENT_TYPES, SETTINGS, WIN_ANIMS, contentHeight, windowLayout,
    check, freshId, newElement, newWindow, newContent, sample };
})();
