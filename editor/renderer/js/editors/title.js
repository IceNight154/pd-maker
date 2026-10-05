// ================================================================
//  타이틀 화면 편집기 — title.json
//   배경(게임 아치 가로·세로 흐름 · 색 · 그라데이션 · 그림 레이어 애니메이션 · 입자) · 로고 · "화면을 누르세요" ·
//   버튼(배치 · 등장/대기 애니메이션 · 동작) · 음악 · 버전
//   게임: MakerTitle.apply(TitleScene) — 원작·mod-2 의 원래 화면을 숨기고 설정대로 새로 만듦
// ================================================================
(function () {
  const { h } = PDM;
  const store = PDM.store;
  const K = 'title';

  PDM.TITLE_BUTTONS = { play: '던전으로 들어가기', support: '게임을 지원하기', rankings: '랭킹', journal: '모험 일지', news: '새 소식', changes: '변경', settings: '설정', about: '소개' };
  const ICONS = ['', 'NONE', 'ENTER', 'GOLD', 'RANKINGS', 'BADGES', 'NEWS', 'CHANGES', 'PREFS', 'SHPX', 'JOURNAL', 'INFO', 'WARNING', 'TALENT', 'CATALOG', 'ALCHEMY', 'STAIRS', 'SKULL', 'BACKPACK_LRG', 'MAGNIFY', 'AUDIO', 'DISPLAY', 'LANGS', 'EXIT'];
  const ACTIONS = { text: '글 창 띄우기 (만든 사람·이야기)', newgame: '새 게임 (영웅 선택)', continue: '이어하기 (슬롯 선택)', scene: '게임 화면 열기', url: '웹 페이지 열기', quit: '게임 끄기' };
  const SCENES = { about: '소개', rankings: '랭킹', journal: '모험 일지', news: '새 소식', changes: '변경', settings: '설정', support: '지원' };
  const EFFECTS = { none: '없음', snow: '눈', rain: '비', embers: '불티 (위로)', sparkle: '반짝임', petals: '꽃잎', fireflies: '반딧불', mana: '마나 반딧불 (mod-2 입자)' };
  const FITS = { none: '원래 크기 × 배율', cover: '화면 채우기 (잘림)', contain: '화면 안에 맞춤', width: '가로에 맞춤', height: '세로에 맞춤', stretch: '늘려서 채우기' };
  const STYLES = { '': '회색 (게임 기본)', RED_BUTTON: '빨강', GREY_BUTTON: '회색 (테두리)', TOAST_TR: '반투명' };
  const DIRS = { up: '↑ 위로', down: '↓ 아래로', left: '← 왼쪽으로', right: '→ 오른쪽으로' };
  const ENTERS = { none: '없음 (바로 보임)', fade: '서서히 나타남', slideUp: '아래에서 위로', slideDown: '위에서 아래로', slideLeft: '오른쪽에서 왼쪽으로', slideRight: '왼쪽에서 오른쪽으로', drop: '떨어지며 튕김', pop: '가로로 튀어나옴' };
  const IDLES = { none: '없음', bob: '둥실둥실 (위아래)', sway: '살랑살랑 (좌우)', pulse: '깜빡임' };
  const LOGO_ANIM = { none: '없음', float: '둥실둥실', sway: '살랑살랑', pulse: '깜빡임' };
  // 게임 화면 단위 크기 = 창 크기 ÷ 배율. PC 는 배율 3 (PixelScene: ceil(density × 2.5), density 1), 휴대폰 세로는 1080×2340 · 배율 8
  const SIZES = { l256: [427, 267, '가로 1280×800'], l320: [640, 360, '가로 1920×1080'], p180: [135, 292, '세로 (휴대폰)'] };

  const get = () => store.get(K) || PDM.defaults.title();
  const ease = t => { t = Math.max(0, Math.min(1, t)); return 1 - Math.pow(1 - t, 3); };
  const back = t => { t = Math.max(0, Math.min(1, t)); const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

  /** 배경 방식: game(게임 배경 그대로) · classic(원작 아치, 방향·속도·그림) · none — 게임 MakerTitle.archStyle 과 같음 */
  const archStyleOf = bg => bg.archs === false ? 'none' : (bg.archStyle || 'game');
  const ARCH_STYLES = { game: '게임 배경 그대로 (mod-2: 숲·탑 10겹 가로 시차 배경 / 원작: 아치)', classic: '원작 아치 그림 (방향·속도·그림 바꾸기)', none: '없음 (색·그림 레이어만)' };
  /** mod-2 ui/Archs 의 10겹 배경 (0 = 가장 먼 밤하늘) 과 층마다 흐르는 속도 (SPEEDS × PARALLAX) */
  const MOD2_LAYERS = Array.from({ length: 10 }, (_, i) => `game:interfaces/title${i}.png`);
  const MOD2_SPEED = [2 * .10, 4 * .14, 7 * .18, 11 * .22, 16 * .28, 22 * .34, 30 * .42, 40 * .52, 52 * .66, 66 * .82];

  /** 손대지 않은 기본 타이틀이면 지금 게임 저장소의 모양(3.x ↔ 4.0)으로 맞춤. 바꿨으면 true (app.resolveRepo 가 저장소를 찾은 뒤 부름) */
  PDM.titleSyncDefaults = function () {
    if (!store.isOpen || PDM.gameTitle4 === undefined) return false;
    const cur = store.get(K); if (!cur) return false;
    const norm = o => { const c = PDM.clone(o); delete c.version; return JSON.stringify(c); };
    const want = PDM.defaults.title(PDM.gameTitle4 ? '4.0' : '3.x');
    if (norm(cur) === norm(want)) return false;
    // 예전 기본값(버전별) 그대로인 경우만 — 사용자가 고친 타이틀은 건드리지 않음
    const olds = ['4.0', '3.x'].map(v => PDM.defaults.title(v));
    const legacy = PDM.defaults.title('3.x'); delete legacy.hideButton;   // hideButton 이 생기기 전의 기본값
    if (![...olds, legacy].some(o => norm(o) === norm(cur))) return false;
    store.edit(K, '타이틀 화면: 게임 저장소 기본 모양', o => { Object.keys(o).forEach(k => delete o[k]); Object.assign(o, want); });
    PDM.log('타이틀 화면 기본값을 지금 게임 저장소(' + (PDM.gameTitle4 ? 'SPD 4.0 모양' : '예전 아치 모양') + ')에 맞췄습니다', 'ok');
    return true;
  };
  /** 4.0 타이틀 배경 그림 (ui/TitleBackground) */
  const T4 = { archs: 'game:splashes/title/archs.png', clusters: 'game:splashes/title/back_clusters.png', mid: 'game:splashes/title/mid_mixed.png', small: 'game:splashes/title/front_small.png' };
  /** 미리 만든 모양 */
  const PRESETS = {
    // 지금 게임 저장소의 타이틀 그대로 (4.0: 폐허 시차 배경 + 화면 감추기 버튼, 그 전: 아치)
    game: () => PDM.defaults.title(),
    // 원작 아치 모양: 아치(arcs1·2)가 위로 흐름 — 어느 저장소에서도 같은 모습
    spd: () => { const d = PDM.defaults.title('3.x'); d.background.archStyle = 'classic'; return d; },
    // mod-2 모양: 게임 배경(숲·탑 10겹 시차 배경) + 로고 주변 마나 반딧불
    mod2: () => Object.assign(PDM.defaults.title(), {
      background: { archs: true, archStyle: 'game', archReverse: false, archDir: 'up', archSpeed: 20, archImages: { bg: '', fg: '' }, color: '', gradient: { enabled: false, color: '#0b1b3a', alpha: 0.55, from: 'top' }, vignette: false, effect: 'mana', effectDensity: 1, effectColor: '', effectFront: false, effectArea: 'logo' },
      logo: { mode: 'game', image: '', text: '', subtitle: '', size: 16, color: '#ffd966', subColor: '#cccccc', scale: 1, y: 0, offsetY: 0, glow: true, torches: false, anim: 'none' },
      gate: { enabled: true, text: '화면을 누르세요', color: '#dddddd', blink: true, logoAfter: 'fade', idleReturn: 15 },
      buttons: { layout: 'column', columns: 1, firstWide: false, top: 0, width: 120, height: 18, gap: 4, offsetX: 0, style: '',
        anim: { enter: 'slideUp', duration: 0.6, stagger: 0.08, distance: 24, idle: 'none', idleAmount: 2, idleSpeed: 1 },
        items: Object.keys(PDM.TITLE_BUTTONS).map(id => ({ id, label: '', visible: true, icon: '' })) } })
  };

  // ---------------- 레이아웃 직접 편집: 로고 · 버튼 영역을 끌어서 옮기고 크기 바꾸기 ----------------
  function layoutWrap(t, st, pv, ctx) {
    const wrap = h('div', { class: 'title-lay-wrap' }, pv.el);
    const chk = h('label', { class: 'check', style: { marginTop: '4px' } }, h('input', { type: 'checkbox', checked: !!st.layoutEdit, onchange: e => { st.layoutEdit = e.target.checked; ctx.refresh(); } }),
      h('span', {}, '레이아웃 직접 편집 (로고·버튼 영역을 끌어서 옮기기 · 모서리로 크기)'));
    const out = h('div', {}, wrap, chk);
    if (!st.layoutEdit) return out;
    const g = pv.geo, W = g.W;
    const regions = [];
    if (g.logo) regions.push({ id: 'logo', label: '로고', color: '#ffd23f', resize: 'both', rect: g.logo });
    if (g.buttons) regions.push({ id: 'buttons', label: '버튼', color: '#4fa3ff', resize: 'w', rect: g.buttons });
    requestAnimationFrame(() => {
      const lay = PDM.layoutEditor({ stage: wrap, regions, onChange: (id, r) => store.edit(K, '타이틀 레이아웃: ' + (id === 'logo' ? '로고' : '버튼'), o => {
        if (id === 'logo') {
          o.logo = o.logo || {};
          const ratio = g.logo.w > 0 ? r.w / g.logo.w : 1;
          if (Math.abs(ratio - 1) > 0.02) o.logo.scale = Math.round((o.logo.scale || 1) * ratio * 100) / 100;
          o.logo.y = Math.max(0.01, Math.min(1, r.y + r.h / 2));
          o.logo.offsetY = 0;
          o.logo.offsetX = Math.round((r.x + r.w / 2 - 0.5) * W);
        } else {
          o.buttons = o.buttons || {};
          o.buttons.top = Math.max(0.001, Math.round(r.y * 1000) / 1000);
          o.buttons.width = Math.max(20, Math.round(r.w * W));
          o.buttons.offsetX = Math.round((r.x + r.w / 2 - 0.5) * W);
        }
      }) });
      out.append(h('p', { class: 'hint' }, '로고: 위치(세로 위치·좌우 이동)와 크기(배율) · 버튼: 위쪽 위치·너비·좌우 이동이 아래 설정값에 들어갑니다.'));
      void lay;
    });
    return out;
  }

  // ---------------- 미리보기 (게임 MakerTitle 과 같은 계산) ----------------
  function preview(t, st) {
    const [W, H] = SIZES[st.size || 'l256'];
    const land = W > H, SC = 3;
    const cv = h('canvas', { width: W * SC, height: H * SC, class: 'title-prev', style: { width: Math.min(W * SC, 760) + 'px', cursor: 'pointer' } });
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    const imgs = {};
    const want = r => { if (r && !(r in imgs)) { imgs[r] = null; PDM.assets.load(r).then(i => { imgs[r] = i; }); } return imgs[r]; };
    const lg = t.logo || {}, bg = t.background || {}, gate = t.gate || {}, bs = t.buttons || {}, an = bs.anim || {};
    const archSt = archStyleOf(bg), aim = bg.archImages || {};
    const ARC_BG = archSt === 'classic' && aim.bg ? aim.bg : 'game:interfaces/arcs1.png', ARC_FG = archSt === 'classic' && aim.fg ? aim.fg : 'game:interfaces/arcs2.png';
    [ARC_BG, ARC_FG, 'game:interfaces/banners.png'].forEach(want);
    if (archSt === 'game') { MOD2_LAYERS.forEach(want); Object.values(T4).forEach(want); }        // 게임 배경: 4.0 폐허 배경 · mod-2 배경 (없으면 원작 아치)
    (t.layers || []).forEach(l => want(l.image));
    if (lg.mode === 'image') want(lg.image);
    const gateOn = !!gate.enabled;
    // 로고 크기·위치
    const mode = lg.mode || 'game', lsc = lg.scale || 1;
    let logoW = 0, logoH = 0;
    if (mode === 'game') { logoW = (land ? 240 : 139) * lsc; logoH = (land ? 57 : 100) * lsc; }
    else if (mode === 'text') { const sz = Math.max(6, lg.size || 16); const lines = String(lg.text || '').split(/\\n|\n/); logoH = lines.length * sz * 1.1 + (lg.subtitle ? 11 : 0); logoW = W * 0.7; }
    else if (mode === 'image') { logoW = 100; logoH = 40; }
    const topRegion = Math.max(logoH - 6, H * 0.45);
    const cy0 = lg.y > 0 ? lg.y * H : (gateOn ? H / 2 - 8 : 2 + topRegion / 2);
    const logoX = (W - logoW) / 2 + (lg.offsetX || 0), logoY = cy0 - logoH / 2 + (lg.offsetY || 0);
    // 입자
    const parts = [];
    let eff = bg.effect || 'none'; if (eff === 'mana') eff = 'fireflies';
    const pcol = bg.effectColor || { rain: '#8fb8ff', embers: '#ff8a2a', sparkle: '#fff4a0', petals: '#ffa8c8', fireflies: bg.effect === 'mana' ? '#9fd8ff' : '#c8ff6a' }[eff] || '#ffffff';
    const area = bg.effectArea === 'logo' || (bg.effect === 'mana' && bg.effectArea !== 'screen') ? [logoX - logoW * 0.3, logoY - logoH * 0.3, logoW * 1.6, logoH * 1.6] : [0, 0, W, H];
    const spawn = (p, any) => {
      const [ax, ay, aw, ah] = area;
      p.x = ax + Math.random() * aw; p.ph = Math.random() * 6.28; p.s = Math.random() < 0.33 ? 2 : 1;
      if (eff === 'rain') { p.y = any ? ay + Math.random() * ah : ay - 5; p.vx = -20; p.vy = 160 + Math.random() * 60; }
      else if (eff === 'embers') { p.y = any ? ay + Math.random() * ah : ay + ah + 2; p.vx = (Math.random() - .5) * 12; p.vy = -(10 + Math.random() * 15); }
      else if (eff === 'petals') { p.y = any ? ay + Math.random() * ah : ay - 3; p.vx = 8 + Math.random() * 12; p.vy = 10 + Math.random() * 10; }
      else if (eff === 'sparkle' || eff === 'fireflies') { p.y = ay + Math.random() * ah; p.vx = (Math.random() - .5) * 8; p.vy = (Math.random() - .5) * 8; }
      else { p.y = any ? ay + Math.random() * ah : ay - 3; p.vx = (Math.random() - .5) * 6; p.vy = 8 + Math.random() * 10; }
    };
    if (eff !== 'none') { const n = Math.max(1, Math.round((eff === 'rain' ? 70 : eff === 'fireflies' ? 18 : 45) * (bg.effectDensity || 1))); for (let i = 0; i < n; i++) { const p = {}; spawn(p, true); parts.push(p); } }

    // 버튼 위치 (MakerTitle.layout 과 같음)
    function buttonRects() {
      const items = bs.items && bs.items.length ? bs.items : [];
      const order = items.map(x => x.id); Object.keys(PDM.TITLE_BUTTONS).forEach(id => { if (!order.includes(id)) order.push(id); });
      const list = [];
      order.forEach(id => {
        const it = items.find(x => x.id === id);
        if (it && it.visible === false) return;
        const game = !!PDM.TITLE_BUTTONS[id];
        if (!game && !(it && (it.custom || it.action))) return;
        list.push({ id, label: (it && it.label) || PDM.TITLE_BUTTONS[id] || id });
      });
      const layout = bs.layout || 'game', bh = bs.height || 20, gap = bs.gap ?? 3, n = list.length;
      let aw = bs.width > 0 ? bs.width : (land ? 240 - 6 : 135 - 2); aw = Math.min(aw, W - 4);
      let left = (W - aw) / 2 + (bs.offsetX || 0);
      const logoBottom = logoY + logoH, center = gateOn && (gate.logoAfter || 'fade') === 'fade';
      const out = [];
      if (layout === 'game') {
        const tr = Math.max(logoBottom - 2, H * 0.45);
        let GAP = Math.floor((H - tr - (land ? 3 : 4) * bh) / 3); GAP = Math.max(2, Math.floor(GAP / (land ? 3 : 5)));
        const top = bs.top > 0 ? bs.top * H : (center ? (H - (land ? 3 : 5) * (bh + GAP)) / 2 : tr + GAP);
        const perRow = land ? [2, 3, 3] : [1, 1, 2, 2, 2];
        let i = 0, row = 0, y = top;
        while (i < n) { let cols = row < perRow.length ? perRow[row] : (land ? 3 : 2); cols = Math.max(1, Math.min(cols | 0, n - i)); const cw = (aw - (cols - 1) * 2) / cols; for (let c = 0; c < cols; c++, i++) out.push({ ...list[i], i, r: [left + c * (cw + 2), y, cw, bh] }); y += bh + GAP; row++; }
        return out;
      }
      const cols = layout === 'column' ? 1 : Math.max(1, bs.columns || (land ? 3 : 2));
      const firstWide = !!bs.firstWide && cols > 1;
      const rows = firstWide ? 1 + Math.ceil((n - 1) / cols) : Math.ceil(n / cols), blockH = rows * bh + (rows - 1) * gap;
      if (layout === 'column' && !(bs.width > 0)) { aw = Math.min(120, W - 4); left = (W - aw) / 2 + (bs.offsetX || 0); }
      let top = bs.top > 0 ? bs.top * H : (center ? (H - blockH) / 2 : Math.max(logoBottom + gap * 2, H * 0.45));
      if (top + blockH > H - 4) top = Math.max(2, H - 4 - blockH);
      const cw = (aw - (cols - 1) * 2) / cols; let y = top;
      list.forEach((x, i) => {
        if (i === 0 && firstWide) { out.push({ ...x, i, r: [left, y, aw, bh] }); y += bh + gap; return; }
        const k = i - (firstWide ? 1 : 0), c = k % cols; if (c === 0 && k > 0) y += bh + gap;
        out.push({ ...x, i, r: [left + c * (cw + 2), y, cw, bh] });
      });
      return out;
    }
    const btns = buttonRects();

    // 상태: 탭 방식이면 처음엔 "화면을 누르세요", 클릭하면 메뉴
    let revealed = !gateOn || st.showMenu, revealT = revealed && gateOn ? 1 : 0, btnClock = 0;
    cv.onclick = () => { if (gateOn && !revealed) { revealed = true; revealT = 0; btnClock = 0; st.showMenu = true; } else if (gateOn) { revealed = false; revealT = 0; st.showMenu = false; } else { t0 = performance.now(); } };
    let t0 = performance.now(), last = t0, stop = false, archOff = 0;
    const mod2Off = MOD2_LAYERS.map(() => 0); let t4T = 0;
    // 게임 배경(원작 아치)은 위로 20 — 반대로 흐름이면 아래로. 원작 아치 방식은 설정대로
    const dir = archSt === 'classic' ? (bg.archDir || 'up') : (bg.archReverse ? 'down' : 'up'), aspd = archSt === 'classic' ? (bg.archSpeed ?? 20) : 20;
    function frame(now) {
      if (stop) return;
      if (!cv.isConnected) { stop = true; return; }                       // 탭을 닫았으면 끝
      if (!cv.offsetParent) { last = now; setTimeout(() => requestAnimationFrame(frame), 300); return; }   // 다른 탭을 보는 동안은 그리지 않음
      const tt = (now - t0) / 1000, e = Math.min(0.1, (now - last) / 1000); last = now;
      if (revealed) { revealT = Math.min(1, revealT + e * 2); btnClock += e; }
      g.setTransform(SC, 0, 0, SC, 0, 0); g.imageSmoothingEnabled = false;
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      if (bg.color) { g.fillStyle = bg.color; g.fillRect(0, 0, W, H); }
      // 게임 배경: mod-2 = 10겹 가로 시차 배경 (ui/Archs 와 같은 속도), 원작 = 아치가 위로
      const mod2bg = archSt === 'game' && imgs[MOD2_LAYERS[0]];
      const t4bg = archSt === 'game' && !mod2bg && imgs[T4.archs];
      if (t4bg) {
        // SPD 4.0 타이틀 배경 (ui/TitleBackground 를 흉내): 아치 벽이 위로 흐르고, 그 앞에 폐허 조각들이 더 빠르게 떠오름
        const k = H / 450, sp = 15 * k * (W <= H ? 1 / 1.5 : 1);
        t4T += e;
        const rnd = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
        const aw = 333 * k, ah = 100 * k, off = (t4T * sp) % ah, row0 = Math.floor(t4T * sp / ah);
        if (ah > 0.5 && aw > 0.5) for (let ry = -1; ry * ah - off < H; ry++) for (let cx = 0; cx * aw < W; cx++) {
          const f = Math.floor(rnd((row0 + ry) * 31 + cx) * 6);
          g.drawImage(t4bg, (f % 3) * 333, Math.floor(f / 3) * 100, 333, 100, cx * aw, ry * ah - off, aw + 0.5, ah + 0.5);
        }
        const gd = g.createLinearGradient(0, 0, 0, H); gd.addColorStop(0, 'rgba(0,0,0,0)'); gd.addColorStop(1, 'rgba(0,0,0,0.5)'); g.fillStyle = gd; g.fillRect(0, 0, W, H);
        const k2 = k * (W <= H ? 1 / 1.5 : 1);
        // [그림, 프레임 가로, 세로, 열, 프레임 수, 개수, 속도 배율, 크기 배율, 어둡기]
        // 크기·밝기·속도는 게임 ui/TitleBackground 의 겹과 같게 (먼 덩어리 0.5배·밝기 0.5 → 덩어리 1배·0.75 → 먼 조각 → 중간 1 → 중간 2(1.5배) → 앞 조각(2.25배))
        [[T4.clusters, 450, 250, 1, 2, 4, 1.33, 0.5, 0.5], [T4.clusters, 450, 250, 1, 2, 3, 2, 1, 0.25], [T4.small, 112, 116, 9, 36, 6, 2.66, 1, 0.2],
          [T4.mid, 273, 242, 7, 28, 3, 3.54, 1, 0.1], [T4.mid, 273, 242, 7, 28, 2, 4.7, 1.5, 0], [T4.small, 112, 116, 9, 36, 3, 6.26, 2.25, 0]].forEach(([r, fw, fh, cols, nf, cnt, spd, sz, dark], li) => {
          const im = imgs[r]; if (!im) return;
          const w2 = fw * k2 * sz, h2 = fh * k2 * sz, span = H + h2 * 2;
          for (let i = 0; i < cnt; i++) {
            const seed = li * 17 + i * 5.3, cyc = Math.floor((t4T * sp * spd + rnd(seed) * span) / span);
            const y = H + h2 - ((t4T * sp * spd + rnd(seed) * span) % span), x = rnd(seed + cyc * 3.1 + 1) * (W + w2) - w2, f = Math.floor(rnd(seed + cyc * 7.7 + 2) * nf);
            g.filter = dark > 0 ? `brightness(${1 - dark})` : 'none';   // 먼 것일수록 어둡게
            g.drawImage(im, (f % cols) * fw, Math.floor(f / cols) * fh, fw, fh, x, y - h2, w2, h2);
            g.filter = 'none';
          }
        });
      } else if (mod2bg) {
        MOD2_LAYERS.forEach((r, i) => {
          const im = imgs[r]; if (!im || !(im.width > 0 && im.height > 0)) return;   // 크기가 0 인 그림이면 아래 반복이 끝나지 않음
          mod2Off[i] -= (bg.archReverse ? -1 : 1) * MOD2_SPEED[i] * e;
          const k = H / im.height, tw = im.width * k;
          let x = ((mod2Off[i] % tw) + tw) % tw - tw;
          if (tw > 0.5) for (; x < W; x += tw) g.drawImage(im, x, 0, tw, H);
        });
        // 위쪽 물빛 그라데이션 (Archs 와 같은 3단)
        const th = H * 0.4;
        [[0, 0.4, 0x25], [0.4, 0.35, 0x20], [0.75, 0.25, 0x15]].forEach(([y0, hh, a]) => { g.fillStyle = `rgba(56,171,171,${a / 255})`; g.fillRect(0, y0 * th, W, hh * th); });
      } else if (archSt !== 'none') {
        archOff += e * aspd;
        [[ARC_BG, 1], [ARC_FG, 2]].forEach(([r, sp]) => {
          const im = imgs[r]; if (!im || !(im.width > 0 && im.height > 0)) return;
          const o = archOff * sp, vx = dir === 'left' ? -o : dir === 'right' ? o : 0, vy = dir === 'up' ? -o : dir === 'down' ? o : 0;
          const ox = ((vx % im.width) + im.width) % im.width, oy = ((vy % im.height) + im.height) % im.height;
          for (let x = ox - im.width - im.width / 4; x < W; x += im.width) for (let y = oy - im.height; y < H; y += im.height) g.drawImage(im, x, y);
        });
      }
      const gr = bg.gradient;
      if (gr && gr.enabled !== false && gr.color) {
        const from = gr.from || 'top', vert = from === 'top' || from === 'bottom';
        const lg2 = vert ? g.createLinearGradient(0, from === 'top' ? 0 : H, 0, from === 'top' ? H : 0) : g.createLinearGradient(from === 'left' ? 0 : W, 0, from === 'left' ? W : 0, 0);
        const c = gr.color, a = gr.alpha ?? 0.55;
        const rgb = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) || 0).join(',');
        lg2.addColorStop(0, `rgba(${rgb},${a})`); lg2.addColorStop(1, `rgba(${rgb},0)`);
        g.fillStyle = lg2; g.fillRect(0, 0, W, H);
      }
      const drawLayers = front => (t.layers || []).forEach(l => {
        if (!!l.front !== front) return;
        const im = imgs[l.image]; if (!im) return;
        g.save();
        let a = l.alpha ?? 1; if (l.pulse) a += l.pulse * Math.sin(tt * (l.pulseSpeed || 1) * 6.2832); g.globalAlpha = Math.max(0, Math.min(1, a));
        if (l.blend === 'light') g.globalCompositeOperation = 'lighter';
        const sc = l.scale || 1;
        if (l.tile) {
          const tw = im.width * sc, th = im.height * sc;
          const ox = (((l.scrollX || 0) * tt) % tw + tw) % tw, oy = (((l.scrollY || 0) * tt) % th + th) % th;
          for (let x = ox - tw; x < W + tw; x += tw) for (let y = oy - th; y < H + th; y += th) g.drawImage(im, x, y, tw, th);
        } else {
          let sx = 0, sy = 0, fw = im.width, fh = im.height;
          if (l.frame && l.frame[0] > 0 && l.frame[1] > 0) {
            fw = l.frame[0]; fh = l.frame[1];
            const fr = l.frames && l.frames.length ? l.frames : [0];
            const idx = fr[Math.floor(tt * (l.fps || 6)) % fr.length] | 0, cols = Math.max(1, Math.floor(im.width / fw));
            sx = (idx % cols) * fw; sy = Math.floor(idx / cols) * fh;
          }
          let kx = sc, ky = sc;
          if (l.fit === 'cover') kx = ky = Math.max(W / fw, H / fh) * sc;
          else if (l.fit === 'contain') kx = ky = Math.min(W / fw, H / fh) * sc;
          else if (l.fit === 'width') kx = ky = W / fw * sc;
          else if (l.fit === 'height') kx = ky = H / fh * sc;
          else if (l.fit === 'stretch') { kx = W / fw * sc; ky = H / fh * sc; }
          const dw = fw * kx, dh = fh * ky;
          const wrap = (v, size, screen) => { const span = screen + size; return (((v + size) % span) + span) % span - size; };
          let x = (l.x ?? 0.5) * W - (l.anchorX ?? 0.5) * dw + (l.offsetX || 0);
          let y = (l.y ?? 0.5) * H - (l.anchorY ?? 0.5) * dh + (l.offsetY || 0);
          if (l.scrollX) x = wrap(x + l.scrollX * tt, dw, W);
          if (l.scrollY) y = wrap(y + l.scrollY * tt, dh, H);
          if (l.bob) y += l.bob * Math.sin(tt * (l.bobSpeed || 1) * 6.2832);
          if (l.spin) { g.translate(x + dw / 2, y + dh / 2); g.rotate((l.spin * tt) * Math.PI / 180); x = -dw / 2; y = -dh / 2; }
          g.drawImage(im, sx, sy, fw, fh, x, y, dw, dh);
        }
        g.restore();
      });
      const drawParts = () => parts.forEach(p => {
        const [ax, ay, aw, ah] = area;
        const wob = Math.sin(tt * 1.5 + p.ph);
        p.x += (p.vx + ((eff === 'snow' || eff === 'petals') ? wob * 6 : 0)) * e; p.y += p.vy * e;
        let a = 1;
        if (eff === 'sparkle' || eff === 'fireflies') { if (p.x < ax) p.x += aw; if (p.x > ax + aw) p.x -= aw; if (p.y < ay) p.y += ah; if (p.y > ay + ah) p.y -= ah; a = 0.5 + 0.5 * Math.sin(tt * (eff === 'sparkle' ? 4 : 2) + p.ph); }
        else if (p.y > ay + ah + 5 || p.y < ay - 6 || p.x < ax - 10 || p.x > ax + aw + 10) spawn(p, false);
        if (eff === 'embers') a = Math.max(0, Math.min(1, (p.y - ay) / ah));
        g.globalAlpha = a; g.fillStyle = pcol;
        g.fillRect(p.x, p.y, eff === 'petals' ? 2 : eff === 'rain' ? 1 : p.s, eff === 'rain' ? 4 : eff === 'petals' ? 1 : p.s);
        g.globalAlpha = 1;
      });
      drawLayers(false);
      if (bg.vignette) { const v = g.createLinearGradient(0, 0, 0, H); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.9)'); g.fillStyle = v; g.fillRect(0, 0, W, H); }
      // 로고 (탭 뒤: 사라짐 / 위로 / 그대로)
      let la = 1, lift = 0;
      if (gateOn) { const k = revealed ? ease(revealT) : 0; if ((gate.logoAfter || 'fade') === 'fade') { la = 1 - k; lift = -10 * k; } else if (gate.logoAfter === 'up') lift = -(logoY - 4) * k; }
      const anim = lg.anim || 'none';
      let ax2 = 0, ay2 = 0, am = 1;
      if (anim === 'float') ay2 = Math.sin(tt * 1.6) * 2; else if (anim === 'sway') ax2 = Math.sin(tt * 1.2) * 3; else if (anim === 'pulse') am = 0.8 + 0.2 * Math.sin(tt * 2);
      const lx = logoX + ax2, ly = logoY + lift + ay2;
      g.globalAlpha = Math.max(0, la * am);
      if (mode === 'game' && imgs['game:interfaces/banners.png']) {
        const im = imgs['game:interfaces/banners.png'];
        const [sx, sy, sw, sh] = land ? [0, 100, 240, 57] : [0, 0, 139, 100];
        g.drawImage(im, sx, sy, sw, sh, lx, ly, sw * lsc, sh * lsc);
        if (lg.glow !== false) { g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = la * (0.8 + 0.2 * Math.sin(tt * 2)) * 0.6; const [gx, gy] = land ? [240, 100] : [139, 0]; g.drawImage(im, gx, gy, sw, sh, lx, ly, sw * lsc, sh * lsc); g.restore(); }
        if (lg.torches !== false && la > 0.3) { g.fillStyle = `rgba(255,${150 + 60 * Math.sin(tt * 9)},40,0.9)`; const pts = land ? [[30, 35], [210, 35]] : [[16, 70], [123, 70]]; pts.forEach(([x, y]) => { g.beginPath(); g.arc(lx + x * lsc, ly + y * lsc - 4, 3 + Math.sin(tt * 11), 0, 7); g.fill(); }); }
      } else if (mode === 'image' && imgs[lg.image]) {
        const im = imgs[lg.image]; g.drawImage(im, W / 2 - im.width * lsc / 2 + ax2, cy0 - im.height * lsc / 2 + lift + ay2 + (lg.offsetY || 0), im.width * lsc, im.height * lsc);
      } else if (mode === 'text') {
        const size = Math.max(6, lg.size || 16);
        g.fillStyle = lg.color || '#ffd966'; g.textAlign = 'center'; g.textBaseline = 'top';
        g.font = `bold ${size}px "Malgun Gothic", sans-serif`;
        const lines = String(lg.text || '').split(/\\n|\n/);
        lines.forEach((ln, i) => g.fillText(ln, W / 2 + ax2, ly + i * size * 1.1));
        if (lg.subtitle) { g.font = '8px "Malgun Gothic", sans-serif'; g.fillStyle = lg.subColor || '#ccc'; g.fillText(lg.subtitle, W / 2 + ax2, ly + lines.length * size * 1.1 + 3); }
      }
      g.globalAlpha = 1;
      drawLayers(true);
      drawParts();
      // 화면을 누르세요
      if (gateOn) {
        const pa = revealed ? 1 - ease(revealT * 2) : 1;
        if (pa > 0.01) { g.globalAlpha = pa * (gate.blink !== false ? 0.55 + 0.45 * Math.sin(tt * 3) : 1); g.fillStyle = gate.color || '#ddd'; g.font = '8px "Malgun Gothic", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText(gate.text || '화면을 누르세요', W / 2, Math.min(H - 20, logoY + logoH + 12)); g.globalAlpha = 1; }
      }
      // 버튼: 등장 · 대기 애니메이션
      const enter = an.enter || (gateOn ? 'slideUp' : 'none'), dur = Math.max(0.05, an.duration || 0.6), stag = an.stagger ?? 0.08, dist = an.distance ?? 24;
      const idle = an.idle || 'none', amt = an.idleAmount ?? 2, spd = an.idleSpeed ?? 1;
      const clock = gateOn ? btnClock : tt;
      const style = bs.style || '';
      btns.forEach(b => {
        let a = !revealed ? 0 : enter === 'none' ? 1 : Math.max(0, Math.min(1, (clock - b.i * stag) / dur));
        let k = ease(a), dx = 0, dy = 0, [x, y, w, hh] = b.r, bw = w;
        if (enter === 'slideUp') dy = dist * (1 - k); else if (enter === 'slideDown') dy = -dist * (1 - k);
        else if (enter === 'slideLeft') dx = dist * (1 - k); else if (enter === 'slideRight') dx = -dist * (1 - k);
        else if (enter === 'drop') { dy = -dist * (1 - back(a)); k = Math.min(1, a * 2); } else if (enter === 'pop') { bw = w * (0.6 + 0.4 * back(a)); k = Math.min(1, a * 2); }
        let alpha = enter === 'none' ? (revealed ? 1 : 0) : k;
        if (a >= 1) { const ph = tt * spd * 2.5 + b.i * 0.7; if (idle === 'bob') dy += Math.sin(ph) * amt; else if (idle === 'sway') dx += Math.sin(ph) * amt; else if (idle === 'pulse') alpha *= 0.8 + 0.2 * Math.sin(ph); }
        if (alpha <= 0.01) return;
        const bx = x + dx + (w - bw) / 2, by = y + dy;
        g.globalAlpha = alpha;
        // 게임의 회색 반투명 버튼(GREY_BUTTON_TR)처럼: 어두운 반투명 바탕 + 밝은 테두리 + 안쪽 어두운 선
        g.fillStyle = style === 'RED_BUTTON' ? '#a03c32' : style === 'TOAST_TR' ? 'rgba(20,20,20,0.55)' : 'rgba(46,46,44,0.82)';
        g.fillRect(bx, by, bw, hh);
        if (style !== 'TOAST_TR') { g.lineWidth = 1; g.strokeStyle = style === 'RED_BUTTON' ? '#d98a7e' : '#8f8f86'; g.strokeRect(bx + 0.5, by + 0.5, bw - 1, hh - 1); g.strokeStyle = 'rgba(0,0,0,0.55)'; g.strokeRect(bx + 1.5, by + 1.5, bw - 3, hh - 3); }
        g.fillStyle = b.id === 'support' ? '#ffff44' : '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '7px "Malgun Gothic", sans-serif';
        g.fillText(b.label, bx + bw / 2, by + hh / 2 + 0.5, bw - 4);
        g.globalAlpha = 1;
      });
      const v = t.version || {};
      if (v.visible !== false) { g.fillStyle = '#888'; g.font = '5px monospace'; g.textAlign = 'right'; g.textBaseline = 'bottom'; g.fillText(v.text || (PDM.gameTitle4 ? 'v4.0.0' : 'v3.2.0'), W - 4, H - 2); }
      if ((t.hideButton ?? !!PDM.gameTitle4) && revealed) { g.strokeStyle = '#bbb'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(W / 2 - 4, H - 11); g.lineTo(W / 2, H - 7); g.lineTo(W / 2 + 4, H - 11); g.stroke(); }
      if ((t.exit || {}).visible !== false) { g.fillStyle = '#555'; g.fillRect(W - 12, 0, 12, 12); g.fillStyle = '#ccc'; g.font = '8px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('✕', W - 6, 6); }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    // 레이아웃 편집용 영역 (화면 비율)
    const geo = { W, H, logo: logoW > 0 ? { x: logoX / W, y: logoY / H, w: logoW / W, h: Math.max(6, logoH) / H } : null };
    if (btns.length) {
      const x0 = Math.min(...btns.map(b => b.r[0])), y0 = Math.min(...btns.map(b => b.r[1])), x1 = Math.max(...btns.map(b => b.r[0] + b.r[2])), y1 = Math.max(...btns.map(b => b.r[1] + b.r[3]));
      geo.buttons = { x: x0 / W, y: y0 / H, w: (x1 - x0) / W, h: (y1 - y0) / H };
    }
    return { el: cv, geo, stop: () => { stop = true; }, replay: () => { t0 = performance.now(); btnClock = 0; revealT = 0; } };
  }

  // ---------------- 편집 칸 ----------------
  function layerRow(p, l) {
    const { F, row } = PDM.ui;
    const sx = l.scrollX || 0, sy = l.scrollY || 0;
    const curDir = sx < 0 ? 'left' : sx > 0 ? 'right' : sy < 0 ? 'up' : sy > 0 ? 'down' : '';
    const speed = Math.abs(sx) || Math.abs(sy) || 20;
    const dirSel = h('select', {}, h('option', { value: '' }, '멈춤'), Object.entries(DIRS).map(([k, v]) => h('option', { value: k, selected: k === curDir }, v)));
    const spdIn = h('input', { type: 'number', value: speed, min: 1, step: 1 });
    const applyDir = () => store.edit(K, '레이어 흐름', o => {
      const x = PDM.deepGet(o, p), d = dirSel.value, v = Math.max(1, +spdIn.value || 20);
      x.scrollX = d === 'left' ? -v : d === 'right' ? v : 0; x.scrollY = d === 'up' ? -v : d === 'down' ? v : 0;
    });
    dirSel.onchange = applyDir; spdIn.onchange = applyDir;
    return h('div', {},
      row(F.text(K, [...p, 'name'], { label: '이름', rerender: true }), F.image(K, [...p, 'image'], { label: '그림', sub: 'title', rerender: true }), F.bool(K, [...p, 'front'], { label: '로고 위에 그림', rerender: true }),
        F.bool(K, [...p, 'titleOnly'], { label: '타이틀에서만 (메뉴 화면엔 안 그림)', rerender: true })),
      row(F.bool(K, [...p, 'tile'], { label: '반복 타일 (끝없이 흐르는 배경)', rerender: true }), F.num(K, [...p, 'scale'], { label: '배율', step: 0.25, min: 0.05, def: 1, rerender: true }),
        F.num(K, [...p, 'alpha'], { label: '투명도', step: 0.05, min: 0, max: 1, def: 1, rerender: true }), F.select(K, [...p, 'blend'], { normal: '보통', light: '빛 (더하기)' }, { label: '섞기', rerender: true })),
      row(PDM.ui.field('흐름 방향 (가로·세로)', dirSel), PDM.ui.field('흐름 속도 (px/초)', spdIn),
        F.num(K, [...p, 'scrollX'], { label: '가로 (−왼쪽 +오른쪽)', step: 1, def: 0, rerender: true }), F.num(K, [...p, 'scrollY'], { label: '세로 (−위 +아래)', step: 1, def: 0, rerender: true })),
      l.tile ? null : row(F.select(K, [...p, 'fit'], FITS, { label: '크기 맞춤', rerender: true }),
        F.num(K, [...p, 'x'], { label: '가로 위치 (0~1)', step: 0.05, def: 0.5, rerender: true }), F.num(K, [...p, 'y'], { label: '세로 위치 (0~1)', step: 0.05, def: 0.5, rerender: true }),
        F.num(K, [...p, 'anchorX'], { label: '기준점 X', step: 0.5, min: 0, max: 1, def: 0.5, rerender: true }), F.num(K, [...p, 'anchorY'], { label: '기준점 Y', step: 0.5, min: 0, max: 1, def: 0.5, rerender: true })),
      l.tile ? null : row(F.num(K, [...p, 'frame', 0], { label: '프레임 폭 (0 = 한 장)', int: true, min: 0, def: 0, rerender: true }), F.num(K, [...p, 'frame', 1], { label: '프레임 높이', int: true, min: 0, def: 0, rerender: true }),
        F.list(K, [...p, 'frames'], { label: '재생할 프레임 번호', hint: '예: 0, 1, 2, 1', number: true, rerender: true }), F.num(K, [...p, 'fps'], { label: '초당 프레임', min: 0.5, step: 0.5, def: 6, rerender: true })),
      row(l.tile ? null : F.num(K, [...p, 'bob'], { label: '위아래 흔들림 (px)', step: 1, def: 0, rerender: true }), l.tile ? null : F.num(K, [...p, 'bobSpeed'], { label: '흔들림 속도', step: 0.1, def: 1, rerender: true }),
        F.num(K, [...p, 'pulse'], { label: '깜빡임 (투명도 폭)', step: 0.05, def: 0, rerender: true }), l.tile ? null : F.num(K, [...p, 'spin'], { label: '회전 (도/초)', step: 5, def: 0, rerender: true })));
  }

  function buttonRow(p, it) {
    const { F, row } = PDM.ui;
    const game = !!PDM.TITLE_BUTTONS[it.id];
    return h('div', {},
      row(h('b', { style: { minWidth: '110px', alignSelf: 'center' } }, game ? '게임: ' + PDM.TITLE_BUTTONS[it.id] : '새 버튼'),
        F.text(K, [...p, 'label'], { label: '글자 (비우면 원래)', rerender: true }), F.bool(K, [...p, 'visible'], { label: '보이기', def: true, rerender: true }),
        F.select(K, [...p, 'icon'], Object.fromEntries(ICONS.map(x => [x, x === '' ? (game ? '(원래 아이콘)' : '(없음)') : x === 'NONE' ? '(아이콘 없음)' : x])), { label: '아이콘' })),
      (!game || it.action) ? row(F.select(K, [...p, 'action'], ACTIONS, { label: game ? '동작 (바꾸기)' : '동작', empty: game ? '(원래 동작)' : undefined, rerender: true }),
        it.action === 'scene' ? F.select(K, [...p, 'scene'], SCENES, { label: '화면' }) : null,
        it.action === 'url' ? F.text(K, [...p, 'url'], { label: '주소', placeholder: 'https://…' }) : null,
        (it.action || 'text') === 'text' ? F.text(K, [...p, 'title'], { label: '창 제목' }) : null) : null,
      (!game || it.action) && (it.action || 'text') === 'text' ? F.textarea(K, [...p, 'text'], { label: '창 내용', rows: 3 }) : null,
      game && !it.action ? h('button', { class: 'btn xs', onclick: e => { e.preventDefault(); PDM.ui.commit(K, [...p, 'action'], 'text', '버튼 동작', true); } }, '동작 바꾸기…') : null);
  }

  /** 타이틀 화면이 쓰는 게임 그림 — 고치면 프로젝트 assets/game/… 로 복사되어 게임·메뉴 화면 모두 그 그림을 씀 */
  function spriteSection(t, bg) {
    const wrap = h('div', {});
    if (!PDM.sprites) return wrap;
    const grid = h('div', { class: 'spr-grid' });
    wrap.append(h('p', { class: 'hint' }, '"고치기" = 게임 원본을 프로젝트 assets/game/ 으로 복사해 픽셀 편집기로 엶. "바꾸기" = 다른 PNG 로 교체. 노란 테두리 = 바꾼 그림, "원래대로" 로 되돌림. 새 그림은 위 "그림 레이어" 에 추가하세요.'), grid,
      h('div', { style: { display: 'flex', gap: '6px' } },
        h('button', { class: 'btn sm', onclick: () => { const tb = PDM.tabs.open('sprites'); if (tb && tb.ctx) { tb.ctx.state = Object.assign(tb.ctx.state || {}, { dir: '@game', gameDir: 'interfaces' }); tb.ctx.refresh(); } } }, '그림 관리에서 게임 그림 모두 보기 →')));
    const style = archStyleOf(bg);
    PDM.assets.load(MOD2_LAYERS[0]).then(m2 => {
      const list = [];
      // 지금 게임 배경(game)이 실제로 쓰는 그림: mod-2 = title0~9 10겹 · SPD 4.0 이상 = splashes/title (TitleBackground) · 그 전 = 아치(arcs1/2)
      if (style === 'game' && m2) MOD2_LAYERS.forEach((r, i) => list.push([r.slice(5), `배경 ${i}층` + (i === 0 ? ' (가장 먼 하늘)' : i === 9 ? ' (가장 가까움)' : '')]));
      else if (style === 'game' && PDM.gameTitle4) list.push([T4.archs.slice(5), '아치 벽 (archs)'], [T4.clusters.slice(5), '뒤쪽 폐허 덩어리 (back_clusters)'], [T4.mid.slice(5), '가운데 폐허 (mid_mixed)'], [T4.small.slice(5), '앞쪽 작은 조각 (front_small)']);
      if (style === 'classic' || (style === 'game' && !m2 && !PDM.gameTitle4)) list.push(['interfaces/arcs1.png', '뒤 아치'], ['interfaces/arcs2.png', '앞 아치']);
      if ((t.logo || {}).mode === 'game' || !(t.logo || {}).mode) list.push(['interfaces/banners.png', '로고 (banners)']);
      list.push(['interfaces/chrome.png', '버튼·창 테두리 (chrome)'], ['interfaces/icons.png', '버튼 아이콘 (icons)']);
      list.forEach(([gr, label]) => grid.append(PDM.sprites.gameCard(gr, label)));
    });
    return wrap;
  }


  // ---- 하위 페이지 (게임 버튼이 여는 화면의 내용) — 런타임 MakerPages ----
  function pagesSection(t) {
    const { F, row, section, listEditor } = PDM.ui;
    const pg = t.pages || {}, m = id => (pg[id] || {}).mode || 'game';
    const blocks = id => h('div', {},
      F.text(K, ['pages', id, 'title'], { label: '화면 제목' }),
      listEditor(K, ['pages', id, 'blocks'], { addLabel: '블록 추가', emptyText: '블록이 없습니다 — "블록 추가"로 제목 · 글 · 링크 버튼을 넣으세요',
        make: () => ({ title: '', text: '', link: '', linkLabel: '', color: '#ffff44' }),
        render: (b, i, p) => h('div', {},
          row(F.text(K, [...p, 'title'], { label: '제목 (노란 글자)' }), F.color(K, [...p, 'color'], { label: '제목 색', def: '#ffff44' })),
          F.textarea(K, [...p, 'text'], { label: '글', rows: 3 }),
          row(F.text(K, [...p, 'link'], { label: '링크 주소 (비우면 버튼 없음)', placeholder: 'https://…' }), F.text(K, [...p, 'linkLabel'], { label: '버튼 글자 (비우면 주소)' }))) }));
    const PAGE = { game: '게임 원래 화면', custom: '내가 만든 화면 (아래 블록)' };
    return section('하위 페이지 (게임 버튼이 여는 화면의 내용)',
      h('p', { class: 'hint' }, '타이틀의 소개 · 지원 · 변경 · 새 소식 버튼이 여는 화면과, 업데이트 확인을 이 게임에 맞게 바꿉니다. 게임 저장소 코드를 고치지 않아도 됩니다 (업데이트 · 소식은 테스트 플레이 때 설치되는 연결 줄이 이 설정을 읽음).'),
      h('h3', {}, '업데이트 확인'),
      row(F.select(K, ['pages', 'updates', 'mode'], { game: '게임 원래 (Shattered PD 의 GitHub)', github: '내 GitHub 저장소', off: '끄기 (업데이트 알림 없음)' }, { label: '확인 방식', rerender: true }),
        m('updates') === 'github' ? F.text(K, ['pages', 'updates', 'repo'], { label: 'GitHub 저장소 (owner/repo)', placeholder: 'myname/my-game' }) : null,
        m('updates') !== 'off' ? F.text(K, ['pages', 'updates', 'page'], { label: '업데이트 버튼이 여는 주소 (비우면 그 릴리스 페이지)', placeholder: 'https://…' }) : null),
      m('updates') === 'github' ? h('p', { class: 'hint' }, '그 저장소의 Releases 를 봅니다. 릴리스 본문에 "internal version number: <버전 코드>" 한 줄을 넣고, 그 숫자가 게임의 버전 코드(build.gradle 의 appVersionCode)보다 크면 업데이트로 알립니다. 본문 첫 부분(--- 줄 위)이 업데이트 설명으로 나옵니다 — 게임 GitHubUpdates 와 같은 규칙.') : null,
      h('h3', {}, '새 소식'),
      row(F.select(K, ['pages', 'news', 'mode'], { game: '게임 원래 (shatteredpixel.com)', feed: '내 RSS 주소', custom: '직접 쓴 소식 (인터넷 없이)', off: '끄기' }, { label: '소식', rerender: true }),
        m('news') === 'feed' ? F.text(K, ['pages', 'news', 'url'], { label: 'RSS 주소', placeholder: 'https://…/feed.xml', hint: '게임 원래 피드와 같은 형식 (item 의 title · description · link · pubDate)' }) : null),
      m('news') === 'custom' ? listEditor(K, ['pages', 'news', 'articles'], { addLabel: '소식 추가', emptyText: '소식이 없습니다',
        make: () => ({ title: '새 소식', summary: '', date: new Date().toISOString().slice(0, 10), url: '', icon: 'ICON: NEWS' }),
        render: (a, i, p) => h('div', {},
          row(F.text(K, [...p, 'title'], { label: '제목' }), F.text(K, [...p, 'date'], { label: '날짜 (YYYY-MM-DD)' })),
          F.textarea(K, [...p, 'summary'], { label: '요약', rows: 2 }),
          row(F.text(K, [...p, 'url'], { label: '자세히 보기 주소 (선택)', placeholder: 'https://…' }), F.text(K, [...p, 'icon'], { label: '아이콘', hint: '"ICON: NEWS" · "ICON: CHANGES" · "ITEM: <번호>" (게임 형식)' }))) }) : null,
      ...[['about', '소개 (About)'], ['support', '지원 (Supporter)'], ['changes', '변경 (Changes)']].map(([id, name]) => h('div', {},
        h('h3', {}, name),
        F.select(K, ['pages', id, 'mode'], PAGE, { label: name + ' 화면', rerender: true }),
        m(id) === 'custom' ? blocks(id) : null)));
  }
  PDM.registerEditor({
    id: 'title', icon: () => '🏰', title: () => '타이틀 화면',
    match: k => k === K,
    watch: ck => ck === K,
    tree() {
      if (!store.isOpen) return [];
      return [{ id: 'title', label: '타이틀 화면', icon: '🏰', order: 3, open: K }];
    },
    render(key, ctx) {
      const t = get();
      const { F, section, row, listEditor } = PDM.ui;
      const st = ctx.state = ctx.state || { size: 'l256' };
      if (ctx._stop) ctx._stop();
      const pv = preview(t, st);
      ctx._stop = pv.stop;
      ctx.onDispose(() => pv.stop());
      const bg = t.background || {}, bt = t.buttons || {}, gate = t.gate || {};
      const sizeTabs = h('div', { class: 'code-tabs' }, Object.entries(SIZES).map(([k, v]) => h('button', { class: 'btn xs' + (st.size === k ? ' on' : ''), onclick: e => { e.preventDefault(); st.size = k; ctx.refresh(); } }, v[2])),
        h('button', { class: 'btn xs', onclick: e => { e.preventDefault(); pv.replay(); } }, '▶ 애니메이션 다시 보기'),
        gate.enabled ? h('span', { class: 'hint' }, '  (미리보기를 누르면 "화면을 누르세요" ↔ 메뉴)') : null);
      const preset = (name, label) => h('button', { class: 'btn sm', onclick: async e => { e.preventDefault(); if (await PDM.ui.confirm(`타이틀 화면을 "${label}" 모양으로 바꿀까요? (지금 설정은 되돌리기로 복구할 수 있습니다)`)) store.edit(K, '타이틀 모양: ' + label, o => { const p = PRESETS[name](); Object.keys(o).forEach(k => delete o[k]); Object.assign(o, p); }); } }, label);
      return h('div', { class: 'page' },
        h('h1', {}, '🏰 타이틀 화면'),
        h('p', { class: 'lead' }, '게임을 켰을 때 처음 나오는 화면입니다. 이 설정을 켜면 게임의 원래 타이틀을 숨기고 아래 설정대로 새로 그립니다. 미리보기는 대략적인 모습이고, 정확한 모습은 ▶ 테스트 플레이로 확인하세요.'),
        row(F.bool(K, ['enabled'], { label: '이 설정 사용 (끄면 게임 원래 타이틀)', def: true, rerender: true }),
          h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, h('span', { class: 'hint' }, '빠른 시작:'), preset('game', '지금 게임 기본'), preset('spd', '예전 아치 모양'), PDM.isMod2() ? preset('mod2', 'mod-2(위츨링) 기본') : null)),
        h('div', { class: 'title-prev-wrap' }, sizeTabs, layoutWrap(t, st, pv, ctx)),
        section('음악',
          h('p', { class: 'hint' }, '비워 두면 게임이 트는 곡 그대로 (원작: theme_1·theme_2' + (PDM.isMod2() ? ', mod-2: title.mp3' : '') + '). 여러 곡이면 무작위, "(음악 끄기)"로 무음.'),
          listEditor(K, ['music', 'tracks'], { addLabel: '곡 추가', compact: true, make: () => '', render: (x, i, ip) => F.sound(K, ip, { kind: 'bgm', allowNone: true, mini: true }) })),
        section('배경',
          row(PDM.ui.field('배경 방식', (() => {
              const s = h('select', {}, Object.entries(ARCH_STYLES).map(([k, v]) => h('option', { value: k, selected: archStyleOf(bg) === k }, k === 'game' && !PDM.isMod2() ? (PDM.gameTitle4 ? '게임 배경 그대로 (SPD 4.0: 떠오르는 폐허)' : '게임 배경 그대로 (원작 아치)') : v)));
              s.onchange = () => store.edit(K, '배경 방식', o => { o.background = o.background || {}; o.background.archs = s.value !== 'none'; if (s.value !== 'none') o.background.archStyle = s.value; });
              return s; })()),
            archStyleOf(bg) === 'game' ? F.bool(K, ['background', 'archReverse'], { label: '반대 방향으로 흐름', rerender: true }) : null,
            archStyleOf(bg) === 'classic' ? F.select(K, ['background', 'archDir'], DIRS, { label: '흐르는 방향 (가로·세로)', rerender: true }) : null,
            archStyleOf(bg) === 'classic' ? F.num(K, ['background', 'archSpeed'], { label: '속도 (px/초, 원작 20)', min: 0, step: 1, def: 20, rerender: true }) : null,
            F.text(K, ['background', 'color'], { label: '배경색 #rrggbb (비우면 없음)', rerender: true })),
          archStyleOf(bg) === 'classic' ? row(
            F.image(K, ['background', 'archImages', 'bg'], { label: '뒤 아치 그림 (비우면 게임 arcs1.png)', sub: 'title', rerender: true }),
            F.image(K, ['background', 'archImages', 'fg'], { label: '앞 아치 그림 (비우면 게임 arcs2.png, 2배 빠름)', sub: 'title', rerender: true })) : null,
          archStyleOf(bg) === 'game' ? h('p', { class: 'hint' }, '게임 배경 그림 자체를 바꾸려면 아래 "타이틀 스프라이트"에서 고치기 — 메뉴 화면(랭킹·일지 등)도 같은 그림을 씁니다.') : null,
          row(F.bool(K, ['background', 'gradient', 'enabled'], { label: '그라데이션 덮기', rerender: true }),
            (bg.gradient || {}).enabled ? F.text(K, ['background', 'gradient', 'color'], { label: '색 (예: #0b1b3a 밤하늘)', rerender: true }) : null,
            (bg.gradient || {}).enabled ? F.num(K, ['background', 'gradient', 'alpha'], { label: '진하기', step: 0.05, min: 0, max: 1, def: 0.55, rerender: true }) : null,
            (bg.gradient || {}).enabled ? F.select(K, ['background', 'gradient', 'from'], { top: '위에서', bottom: '아래에서', left: '왼쪽에서', right: '오른쪽에서' }, { label: '진한 쪽', rerender: true }) : null,
            F.bool(K, ['background', 'vignette'], { label: '아래쪽 어둡게', rerender: true })),
          row(F.select(K, ['background', 'effect'], Object.fromEntries(Object.entries(EFFECTS).filter(([k]) => PDM.isMod2() || k !== 'mana' || (t.background || {}).effect === 'mana')), { label: '날씨·입자 효과', rerender: true }), F.num(K, ['background', 'effectDensity'], { label: '양', step: 0.25, min: 0.1, def: 1, rerender: true }),
            F.select(K, ['background', 'effectArea'], { screen: '화면 전체', logo: '로고 주변' }, { label: '위치', rerender: true }),
            F.text(K, ['background', 'effectColor'], { label: '색 (비우면 기본)', rerender: true }), F.bool(K, ['background', 'effectFront'], { label: '로고 위에', rerender: true })),
          h('div', { class: 'fl', style: { margin: '8px 0 2px' } }, '그림 레이어 (아래 것이 위에 그려짐) — 스프라이트 시트 애니메이션 · 가로/세로 흐름 · 흔들림 · 깜빡임 · 회전'),
          listEditor(K, ['layers'], { addLabel: '그림 레이어', emptyText: '레이어가 없습니다. 직접 그린 그림을 넣어 보세요.',
            make: () => ({ name: '레이어', image: '', frame: [0, 0], frames: [], fps: 6, fit: 'cover', x: 0.5, y: 0.5, anchorX: 0.5, anchorY: 0.5, scale: 1, alpha: 1, blend: 'normal', tile: false, scrollX: 0, scrollY: 0, front: false }),
            render: (l, i, p) => h('details', { open: !!st['ly' + i], ontoggle: e => { st['ly' + i] = e.target.open; } },
              h('summary', { style: { cursor: 'pointer' } }, h('b', {}, l.name || '레이어 ' + (i + 1)), h('span', { class: 'hint' }, '  ' + (l.image || '(그림 없음)') + (l.tile ? ' · 반복' : '') + (l.frame && l.frame[0] ? ' · 애니메이션' : '') + (l.scrollX ? (l.scrollX < 0 ? ' · ←' : ' · →') : '') + (l.scrollY ? (l.scrollY < 0 ? ' · ↑' : ' · ↓') : '') + (l.front ? ' · 로고 위' : '') + (l.titleOnly ? ' · 타이틀만' : ''))),
              layerRow(p, l)) })),
        section('타이틀 스프라이트 (게임 그림 고치기 · 바꾸기)', spriteSection(t, bg)),
        section('메뉴 화면 (랭킹 · 모험 일지 · 변경 · 소개 · 새 소식 · 지원)',
          h('p', { class: 'hint' }, '게임은 메뉴 화면마다 따로 배경을 만들고, 랭킹·모험 일지·변경 화면에서는 음악을 theme 곡으로 바꿉니다. 켜 두면 타이틀과 같은 배경·음악을 이어서 씁니다.'),
          row(F.bool(K, ['menus', 'background'], { label: '타이틀과 같은 배경', def: true, rerender: true }),
            F.bool(K, ['menus', 'music'], { label: '타이틀과 같은 음악', def: true, rerender: true }),
            (t.menus || {}).background !== false ? F.bool(K, ['menus', 'layers'], { label: '그림 레이어도 (타이틀에서만 표시한 것 빼고)', def: true, rerender: true }) : null,
            (t.menus || {}).background !== false ? F.bool(K, ['menus', 'effect'], { label: '날씨·입자 효과도', rerender: true }) : null)),
        pagesSection(t),
        section('로고',
          row(F.select(K, ['logo', 'mode'], { game: '게임 로고 (지금 게임의 banners.png)', image: '내 그림', text: '글자', none: '없음' }, { label: '로고', rerender: true }),
            F.num(K, ['logo', 'scale'], { label: '배율', step: 0.25, min: 0.25, def: 1, rerender: true }),
            F.num(K, ['logo', 'y'], { label: '세로 위치 (0~1, 0 = 자동)', step: 0.05, min: 0, max: 1, def: 0, rerender: true }),
            F.num(K, ['logo', 'offsetY'], { label: '위아래 이동 (px)', step: 1, def: 0, rerender: true }), F.num(K, ['logo', 'offsetX'], { label: '좌우 이동 (px)', step: 1, def: 0, rerender: true }),
            F.select(K, ['logo', 'anim'], LOGO_ANIM, { label: '움직임', rerender: true })),
          (t.logo || {}).mode === 'image' ? F.image(K, ['logo', 'image'], { label: '로고 그림', sub: 'title', rerender: true }) : null,
          (t.logo || {}).mode === 'text' ? h('div', {},
            row(F.text(K, ['logo', 'text'], { label: '제목 글자 (\\n = 줄바꿈)', rerender: true }), F.num(K, ['logo', 'size'], { label: '글자 크기', int: true, min: 6, max: 40, def: 16, rerender: true }), F.text(K, ['logo', 'color'], { label: '색', rerender: true })),
            row(F.text(K, ['logo', 'subtitle'], { label: '부제', rerender: true }), F.text(K, ['logo', 'subColor'], { label: '부제 색', rerender: true }))) : null,
          (t.logo || {}).mode === 'game' || !(t.logo || {}).mode ? row(F.bool(K, ['logo', 'glow'], { label: '빛나는 글자', def: true, rerender: true }), F.bool(K, ['logo', 'torches'], { label: '횃불 (원작)', def: true, rerender: true })) : null),
        section('"화면을 누르세요"',
          row(F.bool(K, ['gate', 'enabled'], { label: '처음엔 로고만 — 누르면 메뉴가 나옴', rerender: true }),
            gate.enabled ? F.text(K, ['gate', 'text'], { label: '안내 글자', rerender: true }) : null,
            gate.enabled ? F.text(K, ['gate', 'color'], { label: '색', rerender: true }) : null,
            gate.enabled ? F.bool(K, ['gate', 'blink'], { label: '깜빡임', def: true, rerender: true }) : null),
          gate.enabled ? row(F.select(K, ['gate', 'logoAfter'], { fade: '사라짐 (메뉴는 화면 가운데)', up: '위로 올라감', stay: '그대로' }, { label: '누른 뒤 로고', rerender: true }),
            F.num(K, ['gate', 'idleReturn'], { label: '가만히 두면 돌아가기 (초, 0 = 안 함)', int: true, min: 0, def: 15, rerender: true })) : null),
        section('버튼',
          row(F.select(K, ['buttons', 'layout'], { game: '게임 원래 배치', grid: '격자', column: '한 줄로 세로' }, { label: '배치', rerender: true }),
            bt.layout === 'grid' ? F.num(K, ['buttons', 'columns'], { label: '열 수', int: true, min: 1, max: 4, def: 3, rerender: true }) : null,
            bt.layout === 'grid' ? F.bool(K, ['buttons', 'firstWide'], { label: '첫 버튼 넓게', rerender: true }) : null,
            F.select(K, ['buttons', 'style'], STYLES, { label: '버튼 모양', rerender: true })),
          row(F.num(K, ['buttons', 'top'], { label: '시작 높이 (0~1, 0 = 자동)', step: 0.05, min: 0, max: 1, def: 0, rerender: true }),
            F.num(K, ['buttons', 'width'], { label: '버튼 영역 폭 (0 = 기본)', int: true, min: 0, def: 0, rerender: true }), F.num(K, ['buttons', 'height'], { label: '버튼 높이', int: true, min: 12, def: 20, rerender: true }),
            F.num(K, ['buttons', 'gap'], { label: '간격', int: true, min: 0, def: 3, rerender: true }), F.num(K, ['buttons', 'offsetX'], { label: '좌우 이동', int: true, def: 0, rerender: true })),
          h('div', { class: 'fl', style: { margin: '8px 0 2px' } }, '버튼 애니메이션'),
          row(F.select(K, ['buttons', 'anim', 'enter'], ENTERS, { label: '나타날 때', rerender: true }),
            F.num(K, ['buttons', 'anim', 'duration'], { label: '걸리는 시간 (초)', step: 0.1, min: 0.05, def: 0.6, rerender: true }),
            F.num(K, ['buttons', 'anim', 'stagger'], { label: '버튼 사이 간격 (초)', step: 0.02, min: 0, def: 0.08, rerender: true }),
            F.num(K, ['buttons', 'anim', 'distance'], { label: '움직이는 거리 (px)', step: 2, min: 0, def: 24, rerender: true })),
          row(F.select(K, ['buttons', 'anim', 'idle'], IDLES, { label: '나타난 뒤 계속', rerender: true }),
            F.num(K, ['buttons', 'anim', 'idleAmount'], { label: '크기 (px)', step: 0.5, min: 0, def: 2, rerender: true }),
            F.num(K, ['buttons', 'anim', 'idleSpeed'], { label: '빠르기', step: 0.1, min: 0.1, def: 1, rerender: true })),
          h('p', { class: 'hint' }, '게임 버튼은 글자·아이콘·숨기기·동작 바꾸기가 되고, 새 버튼(예: 만든 사람 글)을 넣을 수 있습니다. 목록 순서가 화면 순서입니다.'),
          listEditor(K, ['buttons', 'items'], { addLabel: '새 버튼', make: () => ({ id: 'btn_' + Math.random().toString(36).slice(2, 6), custom: true, label: '만든 사람', visible: true, icon: 'INFO', action: 'text', title: '만든 사람', text: '' }),
            render: (it, i, p) => buttonRow(p, it) })),
        section('기타',
          row(F.bool(K, ['version', 'visible'], { label: '버전 글자', def: true, rerender: true }), F.text(K, ['version', 'text'], { label: '버전 글자 바꾸기 (비우면 게임 버전)', rerender: true }),
            F.bool(K, ['exit', 'visible'], { label: '종료 버튼 (PC)', def: true, rerender: true }), F.bool(K, ['hideButton'], { label: '화면 감추기 버튼 (아래 화살표 — 누르면 로고·버튼이 사라지고 배경만 보임)', def: !!PDM.gameTitle4, rerender: true }))));
    }
  });
  PDM.titleEditor = { preview, PRESETS };
})();
