// ================================================================
//  타이틀 화면 편집기 — title.json
//   7차: 왼쪽 요소 목록 · 가운데 실제 비율 캔버스(PDM.titlePreview — 게임과 같은 배치 식 PDM.titleModel · 같은 그림 · 같은 글꼴) · 오른쪽 속성
//   배경(게임 아치 가로·세로 흐름 · 색 · 그라데이션 · 그림 레이어 애니메이션 · 입자) · 로고 · "화면을 누르세요" · 글 · 그림 · 정보 칸 요소 ·
//   버튼(배치 · 자유 배치 · 상태별 모양 · 효과 · 동작) · 팝업 창(모양 · 내용 · 게임 설정) · 음악 · 버전
//   게임: MakerTitle.apply(TitleScene) — 원작·mod-2 의 원래 화면을 숨기고 설정대로 새로 만듦 (배치 · 상태 · 효과 식 = MakerTitleModel)
// ================================================================
(function () {
  const { h } = PDM;
  const store = PDM.store;
  const K = 'title';

  PDM.TITLE_BUTTONS = { play: '던전으로 들어가기', support: '게임을 지원하기', rankings: '랭킹', journal: '모험 일지', news: '새 소식', changes: '변경', settings: '설정', about: '소개' };
  const ICONS = ['', 'NONE', 'ENTER', 'GOLD', 'RANKINGS', 'BADGES', 'NEWS', 'CHANGES', 'PREFS', 'SHPX', 'JOURNAL', 'INFO', 'WARNING', 'TALENT', 'CATALOG', 'ALCHEMY', 'STAIRS', 'SKULL', 'BACKPACK_LRG', 'MAGNIFY', 'AUDIO', 'DISPLAY', 'LANGS', 'EXIT'];
  const EFFECTS = { none: '없음', snow: '눈', rain: '비', embers: '불티 (위로)', sparkle: '반짝임', petals: '꽃잎', fireflies: '반딧불', mana: '마나 반딧불 (mod-2 입자)' };
  const FITS = { none: '원래 크기 × 배율', cover: '화면 채우기 (잘림)', contain: '화면 안에 맞춤', width: '가로에 맞춤', height: '세로에 맞춤', stretch: '늘려서 채우기' };
  const STYLES = { '': '회색 (게임 기본)', RED_BUTTON: '빨강', GREY_BUTTON: '회색 (테두리)', TOAST_TR: '반투명' };
  const DIRS = { up: '↑ 위로', down: '↓ 아래로', left: '← 왼쪽으로', right: '→ 오른쪽으로' };
  /** 떠오르는 폐허의 게임 기본 겹 (ui/TitleBackground 와 같은 크기 · 밝기 · 속도 — 런타임 MakerTitle.Ruins.DEF 와 같음) */
  const RUINS_LAYERS = () => [
    { name: '먼 덩어리', image: 'game:splashes/title/back_clusters.png', fw: 450, fh: 250, cols: 1, frames: 2, count: 4, speed: 1.33, size: 0.5, dark: 0.5, spin: 20 },
    { name: '덩어리', image: 'game:splashes/title/back_clusters.png', fw: 450, fh: 250, cols: 1, frames: 2, count: 3, speed: 2, size: 1, dark: 0.25, spin: 20 },
    { name: '먼 작은 조각', image: 'game:splashes/title/front_small.png', fw: 112, fh: 116, cols: 9, frames: 36, count: 6, speed: 2.66, size: 1, dark: 0.2, spin: 20 },
    { name: '가운데 폐허 1', image: 'game:splashes/title/mid_mixed.png', fw: 273, fh: 242, cols: 7, frames: 28, count: 3, speed: 3.54, size: 1, dark: 0.1, spin: 20 },
    { name: '가운데 폐허 2', image: 'game:splashes/title/mid_mixed.png', fw: 273, fh: 242, cols: 7, frames: 28, count: 2, speed: 4.7, size: 1.5, dark: 0, spin: 20 },
    { name: '앞 작은 조각', image: 'game:splashes/title/front_small.png', fw: 112, fh: 116, cols: 9, frames: 36, count: 3, speed: 6.26, size: 2.25, dark: 0, spin: 20 }];
  const RUINS_DEFAULT = () => ({ on: true, dir: 'up', speed: 15, dark: true, wall: { show: true, image: '', fw: 333, fh: 100, cols: 3, frames: 6 }, layers: RUINS_LAYERS() });
  /** 배경 "게임 배경 그대로" (SPD 4.0 떠오르는 폐허) 직접 설정 — 방향 · 속도 · 벽 그림 · 조각 레이어 추가/삭제/수정 */
  function ruinsUI(K, bg, st) {
    const { F, row, listEditor } = PDM.ui;
    const RU = bg.ruins || {}, on = !!RU.on, P = (...k) => ['background', 'ruins', ...k];
    const toggle = h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: on, onchange: e => store.edit(K, '폐허 배경 직접 설정', o => {
      o.background = o.background || {};
      if (e.target.checked) o.background.ruins = Object.assign(RUINS_DEFAULT(), o.background.ruins && o.background.ruins.layers ? o.background.ruins : {}, { on: true });
      else if (o.background.ruins) o.background.ruins.on = false;
    }) }), h('span', {}, '폐허 배경 직접 설정 (방향 · 속도 · 벽 · 조각 레이어)'));
    if (!on) return h('div', {}, toggle);
    const wall = RU.wall || {};
    return h('div', { class: 'ruins-ui' },
      toggle,
      row(F.select(K, P('dir'), DIRS, { label: '흐르는 방향', def: 'up', rerender: true }),
        F.num(K, P('speed'), { label: '속도 (게임 15)', min: 0, step: 1, def: 15, rerender: true }),
        F.bool(K, P('dark'), { label: '아래쪽 어둡게 (게임 기본)', def: true, rerender: true })),
      h('div', { class: 'fl m-0 mt-4 mb-1' }, '뒤 벽 (바둑판처럼 깔려 함께 흐름)'),
      row(F.bool(K, P('wall', 'show'), { label: '벽 보이기', def: true, rerender: true }),
        F.image(K, P('wall', 'image'), { label: '벽 그림 (비우면 게임 back_wall.png)', sub: 'title', rerender: true })),
      wall.show !== false ? row(
        F.num(K, P('wall', 'fw'), { label: '칸 너비', min: 1, step: 1, def: 333, rerender: true }),
        F.num(K, P('wall', 'fh'), { label: '칸 높이', min: 1, step: 1, def: 100, rerender: true }),
        F.num(K, P('wall', 'cols'), { label: '시트 가로 칸 수', min: 1, step: 1, def: 3, rerender: true }),
        F.num(K, P('wall', 'frames'), { label: '칸 종류 수', min: 1, step: 1, def: 6, rerender: true })) : null,
      h('div', { class: 'fl hstack gap-4 m-0 mt-4 mb-1' }, '떠오르는 조각 레이어 (아래 것이 위에 그려짐)',
        h('button', { class: 'btn xs ml-auto', onclick: async e => { e.preventDefault(); if (await PDM.ui.confirm('조각 레이어를 게임 기본 6개로 되돌릴까요?')) store.edit(K, '폐허 레이어 되돌리기', o => { o.background.ruins.layers = RUINS_LAYERS(); }); } }, '게임 기본 레이어로 되돌리기')),
      listEditor(K, P('layers'), { addLabel: '폐허 레이어', emptyText: '레이어가 없습니다 (벽만 흐름).',
        make: () => ({ name: '레이어', image: '', fw: 0, fh: 0, cols: 1, frames: 1, count: 3, speed: 2, size: 1, dark: 0, spin: 20, show: true }),
        render: (l, i, p) => h('details', { open: !!st['ru' + i], ontoggle: e => { st['ru' + i] = e.target.open; } },
          h('summary', { class: 'pointer' }, h('b', {}, l.name || '레이어 ' + (i + 1)),
            h('span', { class: 'hint' }, `  ${(l.image || '(그림 없음)').replace(/^game:splashes\/title\//, '게임: ')} · ${l.count ?? 3}개 · 속도 ×${l.speed ?? 2}` + (l.show === false ? ' · 숨김' : ''))),
          row(F.text(K, [...p, 'name'], { label: '이름', rerender: true }), F.bool(K, [...p, 'show'], { label: '보이기', def: true, rerender: true })),
          row(F.image(K, [...p, 'image'], { label: '그림 (스프라이트 시트)', sub: 'title', rerender: true })),
          row(F.num(K, [...p, 'fw'], { label: '프레임 너비 (0 = 그림 전체)', min: 0, step: 1, def: 0, rerender: true }),
            F.num(K, [...p, 'fh'], { label: '프레임 높이 (0 = 그림 전체)', min: 0, step: 1, def: 0, rerender: true }),
            F.num(K, [...p, 'cols'], { label: '시트 가로 칸 수', min: 1, step: 1, def: 1, rerender: true }),
            F.num(K, [...p, 'frames'], { label: '프레임 수 (무작위로 고름)', min: 1, step: 1, def: 1, rerender: true })),
          row(F.num(K, [...p, 'count'], { label: '개수', min: 0, step: 1, def: 3, rerender: true }),
            F.num(K, [...p, 'speed'], { label: '속도 배율', min: 0, step: 0.1, def: 2, rerender: true }),
            F.num(K, [...p, 'size'], { label: '크기 배율', min: 0.05, step: 0.05, def: 1, rerender: true }),
            F.num(K, [...p, 'dark'], { label: '어둡게 (0~1)', min: 0, max: 1, step: 0.05, def: 0, rerender: true }),
            F.num(K, [...p, 'spin'], { label: '기울기 ±도', min: 0, step: 1, def: 20, rerender: true }))) }),
      h('p', { class: 'hint' }, '벽은 화면 높이에 맞춰 커지고, 조각은 화면 밖에서 들어와 반대편으로 나가면 다른 위치 · 프레임 · 기울기로 다시 나옵니다. 세로 화면에서는 게임처럼 조금 작고 느려집니다.'));
  }
  const ENTERS = { none: '없음 (바로 보임)', fade: '서서히 나타남', slideUp: '아래에서 위로', slideDown: '위에서 아래로', slideLeft: '오른쪽에서 왼쪽으로', slideRight: '왼쪽에서 오른쪽으로', drop: '떨어지며 튕김', pop: '가로로 튀어나옴' };
  const IDLES = { none: '없음', bob: '둥실둥실 (위아래)', sway: '살랑살랑 (좌우)', pulse: '깜빡임' };
  const LOGO_ANIM = { none: '없음', float: '둥실둥실', sway: '살랑살랑', pulse: '깜빡임' };

  const get = () => store.get(K) || PDM.defaults.title();

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
    // 7차 예시: 게임 기본 + 글 · 정보 요소, 버튼 상태 모양 · 효과, 이어하기, 만든 사람 · 소리 설정 창 (새 기능을 한눈에)
    showcase: () => PDM.titleModel.sample(PDM.defaults.title()),
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

  /** 타이틀 화면이 쓰는 게임 그림 — 고치면 프로젝트 assets/game/… 로 복사되어 게임·메뉴 화면 모두 그 그림을 씀 */
  function spriteSection(t, bg) {
    const wrap = h('div', {});
    if (!PDM.sprites) return wrap;
    const grid = h('div', { class: 'spr-grid' });
    wrap.append(h('p', { class: 'hint' }, '"고치기" = 게임 원본을 프로젝트 assets/game/ 으로 복사해 픽셀 편집기로 엶. "바꾸기" = 다른 PNG 로 교체. 노란 테두리 = 바꾼 그림, "원래대로" 로 되돌림. 새 그림은 위 "그림 레이어" 에 추가하세요.'), grid,
      h('div', { class: 'flex gap-3' },
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
  // ================================================================
  //  7차: 타이틀 편집 화면 — 왼쪽 요소 목록 · 가운데 실제 비율 캔버스(게임과 같은 규칙) · 오른쪽 고른 것의 속성
  //    선택(ctx.state.sel): background · music · logo · gate · buttons · button:<id> · element:<id> · window:<id> · content:<창 id>:<번호> · menus · pages · sprites · misc
  //    고치기는 모두 store.edit (되돌리기 · 다시 하기). 끌기 중에는 복사본만 바꾸고 놓을 때 한 번 저장 (끄는 동안 원본이 바뀌지 않음)
  // ================================================================
  const M = PDM.titleModel, TP = PDM.titlePreview;
  const CHROME_OPTS = () => Object.fromEntries(Object.keys(PDM.gameTheme.CHROME).map(n => [n, (PDM.gameTheme.CHROME_NAMES[n] || n) + ' — ' + n]));
  const idxOf = (arr, id) => (Array.isArray(arr) ? arr : []).findIndex(x => x && x.id === id);
  /** 선택 → { kind, id, j, path(데이터 경로), item } (없어진 대상이면 null) */
  function resolveSel(t, sel) {
    const [kind, id, j] = String(sel || '').split(':');
    if (kind === 'button') { const i = idxOf((t.buttons || {}).items, id); return { kind, id, i, path: i >= 0 ? ['buttons', 'items', i] : null, item: i >= 0 ? t.buttons.items[i] : null }; }
    if (kind === 'element') { const i = idxOf(t.elements, id); return i < 0 ? null : { kind, id, i, path: ['elements', i], item: t.elements[i] }; }
    if (kind === 'window') { const i = idxOf(t.windows, id); return i < 0 ? null : { kind, id, i, path: ['windows', i], item: t.windows[i] }; }
    if (kind === 'content') { const i = idxOf(t.windows, id), k = +j; const c = i >= 0 ? ((t.windows[i].content || [])[k]) : null; return c ? { kind, id, i, j: k, path: ['windows', i, 'content', k], item: c } : null; }
    return { kind: kind || 'background' };
  }
  /** 고른 대상의 창 (창 · 창 내용이면 그 창을 미리보기에 띄움) */
  const selWindow = sel => { const [k, id] = String(sel || '').split(':'); return k === 'window' || k === 'content' ? id : null; };

  // ---------------- 상태 모양 · 효과 편집 칸 ----------------
  function statesEditor(path, cur) {
    const { F, row } = PDM.ui;
    return h('div', { class: 'tp-states' }, ...M.STATES.map(s => {
      const v = (cur || {})[s] || {}, P = k => [...path, s, k];
      const set = Object.keys(v).filter(k => v[k] !== '' && v[k] !== undefined).length;
      return h('details', { open: s === 'normal' && !!set },
        h('summary', { class: 'pointer' }, h('b', {}, M.STATE_NAMES[s]), h('span', { class: 'hint' }, set ? `  ${set}칸 정함` : '  (위 단계 · 게임 기본)')),
        row(F.select(K, P('skin'), CHROME_OPTS(), { label: '바탕 조각 (chrome.png)', empty: '(그대로)', rerender: true }), F.image(K, P('image'), { label: '바탕 그림 (내 9조각)', sub: 'title', rerender: true }),
          F.num(K, P('slice'), { label: '그림 가장자리 (px)', min: 0, max: 64, int: true, def: 4, rerender: true })),
        row(F.color(K, P('textColor'), { label: '글자 색', rerender: true }), F.num(K, P('textAlpha'), { label: '글자 투명도 (0~1)', min: 0, max: 1, step: 0.05, def: 1, rerender: true }),
          F.num(K, P('alpha'), { label: '전체 투명도', min: 0, max: 1, step: 0.05, def: 1, rerender: true })),
        row(F.num(K, P('scale'), { label: '바탕 크기 (0.5~2)', min: 0.5, max: 2, step: 0.05, def: 1, rerender: true }), F.num(K, P('bright'), { label: '바탕 밝기 (1 = 그대로)', min: 0, max: 3, step: 0.05, def: 1, rerender: true }),
          F.num(K, P('dy'), { label: '아래로 (px)', min: -20, max: 20, step: 1, def: 0, rerender: true }),
          set ? h('button', { class: 'btn xs', onclick: e => { e.preventDefault(); store.edit(K, M.STATE_NAMES[s] + ' 모양 지우기', o => { const x = PDM.deepGet(o, path); if (x) delete x[s]; }); } }, '이 상태 지우기') : null));
    }), h('p', { class: 'hint' }, '우선순위: 비활성 > 눌림 > 키보드 포커스 > 포인터 오버 > 기본. 비활성 버튼은 포인터가 올라가도 비활성 모양입니다. 같은 상태에서는 버튼 칸 > 버튼 묶음 칸 > 게임 기본.'));
  }
  /** 효과 목록 (triggers = 쓸 수 있는 시작 조건) */
  function effectsEditor(path, list, triggers) {
    const { F, row } = PDM.ui;
    const presets = Object.entries(M.FX_PRESETS).filter(([, [, f]]) => triggers.includes(f.trigger));
    const add = h('select', { onchange: e => { const k = e.target.value; e.target.value = ''; if (!k) return; store.edit(K, '효과 추가: ' + M.FX_PRESETS[k][0], o => { const a = PDM.deepGet(o, path) || []; a.push(PDM.clone(M.FX_PRESETS[k][1])); PDM.deepSet(o, path, a); }); } },
      h('option', { value: '' }, '+ 효과 넣기 (쉬움)…'), presets.map(([k, [n]]) => h('option', { value: k }, n)));
    return h('div', { class: 'tp-fx' }, ...(list || []).map((f, i) => {
      const P = k => [...path, i, k], n = M.fxNorm(f);
      return h('div', { class: 'li' }, h('div', { class: 'li-body' },
        row(F.select(K, P('trigger'), Object.fromEntries(Object.entries(M.TRIGGERS).filter(([k]) => triggers.includes(k))), { label: '언제', rerender: true }),
          F.select(K, P('type'), M.FX_TYPES, { label: '무엇', rerender: true }),
          n.type === 'move' || n.type === 'shake' ? F.select(K, P('dir'), n.type === 'move' ? { down: '아래쪽', up: '위쪽', left: '왼쪽', right: '오른쪽' } : { x: '좌우', y: '위아래' }, { label: n.type === 'move' ? '방향 (값만큼 그쪽으로)' : '방향', rerender: true }) : null,
          F.num(K, P('from'), { label: n.type === 'move' ? '시작 거리 (px)' : n.type === 'shake' ? '시작 세기 (px)' : '시작 값', step: 0.05, def: n.from, rerender: true }),
          F.num(K, P('to'), { label: n.type === 'move' ? '끝 거리' : n.type === 'shake' ? '끝 세기' : '끝 값', step: 0.05, def: n.to, rerender: true }),
          F.num(K, P('duration'), { label: '시간 (초)', min: 0.01, step: 0.05, def: 0.5, rerender: true })),
        h('details', {}, h('summary', { class: 'pointer hint' }, '고급 (지연 · 반복 · 번갈아 · 보간)'),
          row(F.num(K, P('delay'), { label: '시작 지연 (초)', min: 0, step: 0.05, def: 0, rerender: true }), F.num(K, P('repeat'), { label: '반복 (0 = 한 번, −1 = 끝없이)', min: -1, step: 1, int: true, def: 0, rerender: true }),
            F.bool(K, P('yoyo'), { label: '번갈아 되돌아감', rerender: true }), F.select(K, P('ease'), M.EASES, { label: '보간', rerender: true }),
            n.type === 'shake' ? F.num(K, P('freq'), { label: '초당 흔들림', min: 0.1, step: 1, def: 12, rerender: true }) : null))),
        h('div', { class: 'li-tools' }, h('button', { class: 'ib danger', title: '삭제', onclick: e => { e.preventDefault(); store.edit(K, '효과 삭제', o => { PDM.deepGet(o, path).splice(i, 1); }); } }, '✕')));
    }), add, h('p', { class: 'hint' }, '같은 효과가 짧은 사이에 다시 시작돼도 쌓이지 않습니다 ("동안" 효과는 손을 떼면 되감기, "누를 때" 효과는 처음부터). 미리보기의 ▶ · ⟲ 로 확인하세요.'));
  }

  // ---------------- 속성 칸 ----------------
  function actionFields(p, it, inWindow, t) {
    const { F, row } = PDM.ui;
    const wins = (t.windows || []).map(w => [w.id, `${w.title || '(제목 없음)'} — ${w.id}`]);
    const acts = Object.entries(M.ACTIONS).filter(([k]) => inWindow || k !== 'close');
    return h('div', {},
      row(F.select(K, [...p, 'action'], acts, { label: '누르면', empty: inWindow ? undefined : (M.GAME_IDS.includes(it.id) ? '(게임 원래 동작)' : undefined), rerender: true }),
        it.action === 'window' ? F.select(K, [...p, 'window'], wins, { label: '열 창', empty: '(고르세요)', rerender: true }) : null,
        it.action === 'scene' ? F.select(K, [...p, 'scene'], M.SCENES, { label: '화면', rerender: true }) : null,
        it.action === 'url' ? F.text(K, [...p, 'url'], { label: '주소', placeholder: 'https://…', rerender: true }) : null,
        it.action === 'continue' ? F.select(K, [...p, 'noSave'], M.NO_SAVE, { label: '저장된 게임이 없으면', rerender: true }) : null,
        it.action === 'window' && !wins.length ? h('button', { class: 'btn xs', onclick: e => { e.preventDefault(); store.edit(K, '창 만들기', o => { o.windows = o.windows || []; const w = M.newWindow(o.windows); o.windows.push(w); PDM.deepSet(o, [...p, 'window'], w.id); }); } }, '+ 새 창 만들어 연결') : null),
      (it.action || (inWindow ? 'close' : '')) === 'text' ? row(F.text(K, [...p, 'title'], { label: '창 제목' }), F.textarea(K, [...p, 'text'], { label: '창 내용', rows: 3 })) : null,
      it.action === 'quit' ? h('p', { class: 'hint' }, 'PC · Android 에서만 보입니다 (iOS · 웹에서는 버튼이 숨겨짐 — 끌 수 없는 플랫폼에서 강제로 끄지 않음).') : null);
  }
  function buttonProps(t, S, st) {
    const { F, row } = PDM.ui;
    const game = M.GAME_IDS.includes(S.id), bs = t.buttons || {};
    if (!S.path) return h('div', {}, h('p', { class: 'hint' }, '이 게임 버튼은 아직 목록에 없습니다 (게임 기본 모양 · 순서는 맨 뒤).'),
      h('button', { class: 'btn sm', onclick: () => store.edit(K, '버튼 편집 시작', o => { o.buttons = o.buttons || {}; o.buttons.items = o.buttons.items || []; o.buttons.items.push({ id: S.id, label: '', visible: true, icon: '' }); }) }, '이 버튼 편집하기'));
    const p = S.path, it = S.item;
    return h('div', {},
      h('h3', {}, game ? '게임 버튼: ' + (PDM.TITLE_BUTTONS[S.id] || S.id) : '새 버튼: ' + (it.label || S.id)),
      row(F.text(K, [...p, 'label'], { label: game ? '글자 (비우면 게임 글)' : '글자', rerender: true }), F.bool(K, [...p, 'visible'], { label: '보이기', def: true, rerender: true }),
        F.bool(K, [...p, 'enabled'], { label: '누를 수 있음 (끄면 비활성)', def: true, rerender: true })),
      row(F.select(K, [...p, 'icon'], Object.fromEntries(ICONS.map(x => [x, x === '' ? (game ? '(원래 아이콘)' : '(없음)') : x === 'NONE' ? '(아이콘 없음)' : x])), { label: '아이콘', rerender: true }),
        F.num(K, [...p, 'size'], { label: '글자 크기 (게임 9)', min: 5, max: 16, int: true, def: 9, rerender: true }),
        F.num(K, [...p, 'focusOrder'], { label: '키보드 순서 (비우면 화면 순서)', step: 1, def: '', rerender: true }),
        h('div', { class: 'field' }, h('span', { class: 'fl' }, 'ID (바꿀 수 없음)'), h('code', {}, S.id))),
      game && !it.action ? h('p', { class: 'hint' }, '게임 원래 동작: ' + (M.SCENES[S.id] || PDM.TITLE_BUTTONS[S.id])) : null,
      actionFields(p, it, false, t),
      bs.layout === 'free' ? h('div', {}, h('div', { class: 'fl mt-4' }, '자유 배치 (캔버스에서 끌어 옮기기 · 오른쪽 아래 모서리로 크기)'),
        row(F.num(K, [...p, 'place', 'x'], { label: '가로 위치 (0~1, 가운데)', step: 0.01, rerender: true }), F.num(K, [...p, 'place', 'y'], { label: '세로 위치 (0~1)', step: 0.01, rerender: true }),
          F.num(K, [...p, 'place', 'w'], { label: '너비 (0 = 묶음)', min: 0, step: 1, rerender: true }), F.num(K, [...p, 'place', 'h'], { label: '높이 (0 = 묶음)', min: 0, step: 1, rerender: true })))
        : h('p', { class: 'hint' }, '자리는 버튼 묶음의 배치를 따릅니다. 버튼마다 직접 놓으려면 버튼 묶음의 배치를 "자유 배치"로 바꾸세요.'),
      h('div', { class: 'fl mt-4' }, '상태별 모양 (이 버튼만)'), statesEditor([...p, 'states'], it.states),
      h('div', { class: 'fl mt-4' }, '효과 (애니메이션)'), effectsEditor([...p, 'effects'], it.effects, ['enter', 'always', 'hover', 'focus', 'click']));
  }
  function groupProps(t) {
    const { F, row } = PDM.ui; const bt = t.buttons || {};
    return h('div', {},
      h('h3', {}, '버튼 묶음'),
      row(F.select(K, ['buttons', 'layout'], { game: '게임 원래 배치', grid: '격자', column: '한 줄로 세로', free: '자유 배치 (버튼마다 자리)' }, { label: '배치', rerender: true }),
        bt.layout === 'grid' ? F.num(K, ['buttons', 'columns'], { label: '열 수', int: true, min: 1, max: 4, def: 3, rerender: true }) : null,
        bt.layout === 'grid' ? F.bool(K, ['buttons', 'firstWide'], { label: '첫 버튼 넓게', rerender: true }) : null,
        F.select(K, ['buttons', 'style'], STYLES, { label: '기본 바탕 조각', rerender: true })),
      row(F.num(K, ['buttons', 'top'], { label: '시작 높이 (0~1, 0 = 자동)', step: 0.05, min: 0, max: 1, def: 0, rerender: true }),
        F.num(K, ['buttons', 'width'], { label: '버튼 영역 폭 (0 = 기본)', int: true, min: 0, def: 0, rerender: true }), F.num(K, ['buttons', 'height'], { label: '버튼 높이', int: true, min: 12, def: 20, rerender: true }),
        F.num(K, ['buttons', 'gap'], { label: '간격', int: true, min: 0, def: 3, rerender: true }), F.num(K, ['buttons', 'offsetX'], { label: '좌우 이동', int: true, def: 0, rerender: true })),
      h('div', { class: 'fl mt-4' }, '묶음 애니메이션 (모든 버튼)'),
      row(F.select(K, ['buttons', 'anim', 'enter'], ENTERS, { label: '나타날 때', rerender: true }),
        F.num(K, ['buttons', 'anim', 'duration'], { label: '걸리는 시간 (초)', step: 0.1, min: 0.05, def: 0.6, rerender: true }),
        F.num(K, ['buttons', 'anim', 'stagger'], { label: '버튼 사이 간격 (초)', step: 0.02, min: 0, def: 0.08, rerender: true }),
        F.num(K, ['buttons', 'anim', 'distance'], { label: '움직이는 거리 (px)', step: 2, min: 0, def: 24, rerender: true })),
      row(F.select(K, ['buttons', 'anim', 'idle'], IDLES, { label: '나타난 뒤 계속', rerender: true }),
        F.num(K, ['buttons', 'anim', 'idleAmount'], { label: '크기 (px)', step: 0.5, min: 0, def: 2, rerender: true }),
        F.num(K, ['buttons', 'anim', 'idleSpeed'], { label: '빠르기', step: 0.1, min: 0.1, def: 1, rerender: true })),
      h('div', { class: 'fl mt-4' }, '모든 버튼의 상태별 모양 (창 안 버튼도)'), statesEditor(['buttons', 'states'], bt.states));
  }
  function elementProps(t, S) {
    const { F, row } = PDM.ui; const p = S.path, el = S.item;
    const tokens = h('select', { onchange: e => { const k = e.target.value; e.target.value = ''; if (k) store.edit(K, '정보 칸 넣기', o => { const x = PDM.deepGet(o, p); x.text = (x.text || '') + `{${k}}`; }); } },
      h('option', { value: '' }, '+ 정보 칸 넣기…'), Object.entries(M.BINDS).map(([k, v]) => h('option', { value: k }, `{${k}} — ${v}`)));
    return h('div', {},
      h('h3', {}, (el.type === 'image' ? '그림: ' : '글: ') + (el.name || el.id)),
      row(F.text(K, [...p, 'name'], { label: '이름 (목록용)', rerender: true }), F.bool(K, [...p, 'visible'], { label: '보이기', def: true, rerender: true }),
        F.select(K, [...p, 'show'], M.SHOW, { label: '보이는 때', rerender: true }), F.select(K, [...p, 'layer'], M.LAYERS, { label: '겹', rerender: true }),
        h('div', { class: 'field' }, h('span', { class: 'fl' }, 'ID'), h('code', {}, el.id))),
      el.type === 'text' ? h('div', {},
        row(F.textarea(K, [...p, 'text'], { label: '글 ({이름} = 게임이 아는 정보, \\n = 줄바꿈)', rows: 2, rerender: true }), tokens),
        row(F.text(K, [...p, 'fallback'], { label: '정보가 없을 때 대신 쓸 글 (예: 저장 없음)', rerender: true }),
          F.num(K, [...p, 'size'], { label: '글자 크기', min: 5, max: 24, int: true, def: 8, rerender: true }), F.color(K, [...p, 'color'], { label: '색', def: '#ffffff', rerender: true }),
          F.select(K, [...p, 'align'], M.ALIGNS, { label: '정렬', rerender: true }), F.num(K, [...p, 'w'], { label: '줄바꿈 폭 (px, 0 = 한 줄)', min: 0, int: true, def: 0, rerender: true })))
        : row(F.image(K, [...p, 'image'], { label: '그림', sub: 'title', rerender: true }), F.num(K, [...p, 'scale'], { label: '배율', min: 0.05, step: 0.05, def: 1, rerender: true }),
          F.num(K, [...p, 'angle'], { label: '기울기 (도)', step: 5, def: 0, rerender: true })),
      h('div', { class: 'fl mt-4' }, '위치 (캔버스에서 끌기 · 화살표 키 1px · Shift+화살표 10px)'),
      row(F.num(K, [...p, 'x'], { label: '가로 위치 (0~1)', step: 0.01, def: 0.5, rerender: true }), F.num(K, [...p, 'y'], { label: '세로 위치 (0~1)', step: 0.01, def: 0.5, rerender: true }),
        F.num(K, [...p, 'anchorX'], { label: '기준점 X (0 왼 · 0.5 · 1 오른)', step: 0.5, min: 0, max: 1, def: 0.5, rerender: true }), F.num(K, [...p, 'anchorY'], { label: '기준점 Y', step: 0.5, min: 0, max: 1, def: 0.5, rerender: true })),
      row(F.num(K, [...p, 'offsetX'], { label: '좌우 이동 (px)', step: 1, def: 0, rerender: true }), F.num(K, [...p, 'offsetY'], { label: '위아래 이동 (px)', step: 1, def: 0, rerender: true }),
        F.num(K, [...p, 'alpha'], { label: '투명도 (0~1)', min: 0, max: 1, step: 0.05, def: 1, rerender: true }), F.bool(K, [...p, 'safe'], { label: '안전 영역 안에서 (노치 · 내비게이션 바 피함)', def: true, rerender: true })),
      h('div', { class: 'fl mt-4' }, '효과'), effectsEditor([...p, 'effects'], el.effects, ['enter', 'always']));
  }
  function windowProps(t, S) {
    const { F, row } = PDM.ui; const p = S.path, w = S.item;
    const content = w.content || [];
    const addC = h('select', { onchange: e => { const k = e.target.value; e.target.value = ''; if (k) store.edit(K, '창 내용 추가', o => { const x = PDM.deepGet(o, p); x.content = x.content || []; x.content.push(M.newContent(k)); }); } },
      h('option', { value: '' }, '+ 내용 넣기…'), Object.entries(M.CONTENT_TYPES).map(([k, v]) => h('option', { value: k }, v)));
    return h('div', {},
      h('h3', {}, '창: ' + (w.title || w.id)),
      row(F.text(K, [...p, 'title'], { label: '제목 (비우면 없음)', rerender: true }), F.color(K, [...p, 'titleColor'], { label: '제목 색 (비우면 테마 강조색)', rerender: true }), h('div', { class: 'field' }, h('span', { class: 'fl' }, 'ID'), h('code', {}, w.id))),
      row(F.num(K, [...p, 'w'], { label: '너비 (px)', min: 40, int: true, def: 120, rerender: true }), F.num(K, [...p, 'h'], { label: '높이 (0 = 내용에 맞춤)', min: 0, int: true, def: 0, rerender: true }),
        F.num(K, [...p, 'padding'], { label: '안쪽 여백', min: 0, int: true, def: 4, rerender: true }), F.num(K, [...p, 'offsetX'], { label: '가운데에서 좌우 (px)', int: true, def: 0, rerender: true }), F.num(K, [...p, 'offsetY'], { label: '위아래 (px)', int: true, def: 0, rerender: true })),
      row(F.select(K, [...p, 'skin'], CHROME_OPTS(), { label: '창 조각 (chrome.png)', rerender: true }), F.image(K, [...p, 'image'], { label: '창 그림 (내 9조각 — 있으면 이것)', sub: 'title', rerender: true }), F.num(K, [...p, 'slice'], { label: '그림 가장자리', min: 0, int: true, def: 6, rerender: true })),
      row(F.bool(K, [...p, 'closeButton'], { label: '닫기 단추 (✕)', def: true, rerender: true }), F.bool(K, [...p, 'closeEsc'], { label: 'Esc · 뒤로 키로 닫기', def: true, rerender: true }), F.bool(K, [...p, 'closeOutside'], { label: '바깥을 누르면 닫기', def: true, rerender: true })),
      row(F.select(K, [...p, 'anim', 'type'], M.WIN_ANIMS, { label: '열고 닫을 때', rerender: true }), F.num(K, [...p, 'anim', 'duration'], { label: '시간 (초)', min: 0.01, step: 0.05, def: 0.2, rerender: true }),
        F.sound(K, [...p, 'sounds', 'open'], { label: '열 때 소리', mini: true }), F.sound(K, [...p, 'sounds', 'close'], { label: '닫을 때 소리', mini: true })),
      h('p', { class: 'hint' }, '창이 떠 있는 동안 뒤의 타이틀 버튼은 눌리지 않습니다 (원작 창과 같음). 키보드: 화살표 · Tab 으로 창 안 버튼을 고르고 Enter. 닫으면 열기 전 포커스로 돌아갑니다.'),
      h('div', { class: 'fl mt-4' }, '내용 (위에서 아래로)'),
      h('div', { class: 'tp-list' }, ...content.map((c, j) => treeRow(`content:${w.id}:${j}`, `${M.CONTENT_TYPES[c.type] || c.type}: ${String(c.label || c.text || c.key || c.image || '').slice(0, 30)}`, { up: j > 0, down: j < content.length - 1, path: [...p, 'content'], index: j }))),
      addC);
  }
  function contentProps(t, S) {
    const { F, row } = PDM.ui; const p = S.path, c = S.item;
    const back = h('button', { class: 'btn xs', onclick: () => select('window:' + S.id) }, '← 창으로');
    const common = row(F.num(K, [...p, 'gap'], { label: '위 간격 (px)', min: 0, int: true, def: 2, rerender: true }),
      ['text', 'image', 'button'].includes(c.type) ? F.select(K, [...p, 'align'], M.ALIGNS, { label: '정렬', rerender: true }) : null);
    let body = null;
    if (c.type === 'text') body = h('div', {}, F.textarea(K, [...p, 'text'], { label: '글 ({이름} = 정보 칸)', rows: 3, rerender: true }),
      row(F.num(K, [...p, 'size'], { label: '글자 크기', min: 5, max: 16, int: true, def: 7, rerender: true }), F.color(K, [...p, 'color'], { label: '색', def: '#ffffff', rerender: true }), F.text(K, [...p, 'fallback'], { label: '정보가 없을 때', rerender: true })));
    else if (c.type === 'scroll') body = h('div', {}, F.textarea(K, [...p, 'text'], { label: '긴 글 (스크롤)', rows: 5, rerender: true }),
      row(F.num(K, [...p, 'h'], { label: '보이는 높이 (px)', min: 12, int: true, def: 60, rerender: true }), F.num(K, [...p, 'size'], { label: '글자 크기', min: 5, max: 16, int: true, def: 6, rerender: true }), F.color(K, [...p, 'color'], { label: '색', def: '#dddddd', rerender: true })));
    else if (c.type === 'image') body = row(F.image(K, [...p, 'image'], { label: '그림', sub: 'title', rerender: true }), F.num(K, [...p, 'scale'], { label: '배율', min: 0.05, step: 0.05, def: 1, rerender: true }));
    else if (c.type === 'divider') body = row(F.color(K, [...p, 'color'], { label: '색', def: '#888888', rerender: true }), F.num(K, [...p, 'thickness'], { label: '두께', min: 1, int: true, def: 1, rerender: true }));
    else if (c.type === 'space') body = F.num(K, [...p, 'h'], { label: '높이 (px)', min: 0, int: true, def: 6, rerender: true });
    else if (c.type === 'setting') body = h('div', {}, row(F.select(K, [...p, 'key'], M.SETTINGS, { label: '게임 설정', rerender: true }), F.text(K, [...p, 'label'], { label: '글 (비우면 게임 설정 창과 같은 글)', rerender: true })),
      h('p', { class: 'hint' }, '실제 게임 설정을 바꿉니다 (원작 설정 창의 소리 탭과 같은 값 — 끄기 체크 · 0~10 크기).'));
    else if (c.type === 'button') body = h('div', {}, row(F.text(K, [...p, 'label'], { label: '글자', rerender: true }), F.num(K, [...p, 'w'], { label: '너비 (0 = 창 폭)', min: 0, int: true, def: 0, rerender: true }),
      F.num(K, [...p, 'h'], { label: '높이', min: 12, int: true, def: 18, rerender: true }), F.select(K, [...p, 'icon'], Object.fromEntries(ICONS.map(x => [x, x === '' || x === 'NONE' ? '(없음)' : x])), { label: '아이콘', rerender: true }),
      F.bool(K, [...p, 'enabled'], { label: '누를 수 있음', def: true, rerender: true })), actionFields(p, c, true, t),
      h('div', { class: 'fl mt-4' }, '상태별 모양 (이 버튼만)'), statesEditor([...p, 'states'], c.states));
    return h('div', {}, h('div', { class: 'hstack' }, back, h('h3', { class: 'm-0' }, M.CONTENT_TYPES[c.type] || c.type)), body, common);
  }

  // ---------------- 왼쪽 목록 ----------------
  let current = null;   // { ctx, t } — 목록 · 캔버스가 부르는 select
  function select(sel) { if (!current) return; current.ctx.state.sel = sel; const w = selWindow(sel); if (w && current.ctx.state.winShown !== w) { current.ctx.state.winShown = w; current.ctx.state.winAt = current.pv ? current.pv.time : 0; } else if (!w) current.ctx.state.winShown = null; current.ctx.refresh(); }
  /** 목록 한 줄: 고르기 · (o.eye) 보이기 · 위/아래 · 복제 · 삭제 */
  function treeRow(sel, label, o = {}) {
    const st = current ? current.ctx.state : {};
    const tools = [];
    if (o.eye) tools.push(h('button', { class: 'ib', title: o.eye.on ? '숨기기' : '보이기', 'aria-pressed': String(!!o.eye.on), onclick: e => { e.stopPropagation(); store.edit(K, o.eye.on ? '숨기기' : '보이기', r => { PDM.deepSet(r, o.eye.path, !o.eye.on); }); } }, o.eye.on ? '👁' : '◌'));
    if (o.path) {
      const mv = d => e => { e.stopPropagation(); store.edit(K, '순서 바꾸기', r => { const a = PDM.deepGet(r, o.path); const i = o.index; [a[i + d], a[i]] = [a[i], a[i + d]]; }); };
      tools.push(h('button', { class: 'ib', title: '앞으로 (목록 위)', disabled: !o.up, onclick: mv(-1) }, '↑'), h('button', { class: 'ib', title: '뒤로 (목록 아래)', disabled: !o.down, onclick: mv(1) }, '↓'));
      if (o.dup !== false) tools.push(h('button', { class: 'ib', title: '복제', onclick: e => { e.stopPropagation(); store.edit(K, '복제', r => { const a = PDM.deepGet(r, o.path), c = PDM.clone(a[o.index]); if (c.id && o.idPrefix) c.id = M.freshId(o.idPrefix, a); a.splice(o.index + 1, 0, c); }); } }, '⧉'));
      if (o.del !== false) tools.push(h('button', { class: 'ib danger', title: '삭제 (되돌리기로 복구)', onclick: e => { e.stopPropagation(); store.edit(K, '삭제', r => { PDM.deepGet(r, o.path).splice(o.index, 1); }); if (st.sel === sel) select('background'); } }, '✕'));
    }
    return h('div', { class: 'tp-row' + (st.sel === sel ? ' sel' : '') + (o.off ? ' off' : ''), 'data-sel': sel, onclick: () => select(sel) }, h('span', { class: 'tp-label' }, label), h('span', { class: 'tp-tools' }, ...tools));
  }
  function tree(t, issues) {
    const bs = t.buttons || {}, items = Array.isArray(bs.items) ? bs.items : [];
    const order = items.map(x => x && x.id).filter(Boolean); M.GAME_IDS.forEach(id => { if (!order.includes(id)) order.push(id); });
    const mark = sel => { const n = issues.filter(x => x.sel === sel && x.level === 'error').length, w = issues.filter(x => x.sel === sel && x.level === 'warn').length; return n ? ` ✕${n}` : w ? ` !${w}` : ''; };
    const els = Array.isArray(t.elements) ? t.elements : [], wins = Array.isArray(t.windows) ? t.windows : [];
    const group = (title, ...kids) => h('div', { class: 'tp-group' }, h('div', { class: 'tp-gtitle' }, title), ...kids);
    return h('div', { class: 'tp-tree' },
      group('화면', treeRow('background', '🖼 배경 · 그림 레이어'), treeRow('music', '♪ 음악'), treeRow('logo', '🏷 로고'), treeRow('gate', '👆 "화면을 누르세요"'), treeRow('misc', '⚙ 버전 · 종료 · 감추기')),
      group('버튼', treeRow('buttons', '▤ 버튼 묶음 (배치 · 애니메이션 · 상태 모양)' + mark('buttons')),
        ...order.map(id => { const i = items.findIndex(x => x && x.id === id), it = i >= 0 ? items[i] : null;
          const label = (it && it.label) || PDM.TITLE_BUTTONS[id] || id;
          return treeRow('button:' + id, `${it && it.visible === false ? '(숨김) ' : ''}${label}${M.GAME_IDS.includes(id) ? '' : ' ✦'}${mark('button:' + id)}`,
            i >= 0 ? { eye: { on: it.visible !== false, path: ['buttons', 'items', i, 'visible'] }, path: ['buttons', 'items'], index: i, up: i > 0, down: i < items.length - 1, del: !M.GAME_IDS.includes(id), dup: !M.GAME_IDS.includes(id), idPrefix: 'btn', off: it.visible === false } : { off: false }); }),
        h('button', { class: 'btn xs add', onclick: () => store.edit(K, '새 버튼', o => { o.buttons = o.buttons || {}; o.buttons.items = o.buttons.items || []; const id = M.freshId('btn', o.buttons.items); o.buttons.items.push({ id, custom: true, label: '새 버튼', visible: true, icon: 'INFO', action: 'text', title: '새 버튼', text: '' }); setTimeout(() => select('button:' + id)); }) }, '+ 버튼')),
      group('글 · 그림 (요소)', ...els.map((e, i) => treeRow('element:' + e.id, `${e.type === 'image' ? '🖼' : '𝐓'} ${e.name || e.id}${e.visible === false ? ' (숨김)' : ''}${mark('element:' + e.id)}`,
        { eye: { on: e.visible !== false, path: ['elements', i, 'visible'] }, path: ['elements'], index: i, up: i > 0, down: i < els.length - 1, idPrefix: e.type === 'image' ? 'img' : 'txt', off: e.visible === false })),
        h('div', { class: 'hstack' }, h('button', { class: 'btn xs add', onclick: () => store.edit(K, '글 추가', o => { o.elements = o.elements || []; const e = M.newElement('text', o.elements); o.elements.push(e); setTimeout(() => select('element:' + e.id)); }) }, '+ 글'),
          h('button', { class: 'btn xs add', onclick: () => store.edit(K, '그림 추가', o => { o.elements = o.elements || []; const e = M.newElement('image', o.elements); o.elements.push(e); setTimeout(() => select('element:' + e.id)); }) }, '+ 그림'))),
      group('창 (버튼이 여는 팝업)', ...wins.map((w, i) => treeRow('window:' + w.id, `▣ ${w.title || w.id}${mark('window:' + w.id)}`, { path: ['windows'], index: i, up: i > 0, down: i < wins.length - 1, idPrefix: 'win' })),
        h('button', { class: 'btn xs add', onclick: () => store.edit(K, '창 추가', o => { o.windows = o.windows || []; const w = M.newWindow(o.windows); o.windows.push(w); setTimeout(() => select('window:' + w.id)); }) }, '+ 창')),
      group('그 밖', treeRow('menus', '메뉴 화면 (랭킹 · 일지 …)'), treeRow('pages', '하위 페이지 (소개 · 소식 …)'), treeRow('sprites', '타이틀 그림 고치기')));
  }

  PDM.registerEditor({
    id: 'title', icon: () => '🏰', title: () => '타이틀 화면',
    match: k => k === K,
    watch: ck => ck === K || ck === 'project' || ck === 'theme',
    onActivate() { if (current && current.pv) current.pv.wake(); },
    focus(sel) { select(sel); },   // 검사 결과를 누르면 그 대상을 고름   // 다른 탭에서 돌아오면 미리보기 다시 움직임
    tree() {
      if (!store.isOpen) return [];
      return [{ id: 'title', label: '타이틀 화면', icon: '🏰', order: 3, open: K }];
    },
    render(key, ctx) {
      const t = get();
      const { F, section, row, listEditor } = PDM.ui;
      const st = ctx.state = ctx.state || { sel: 'background', screen: 'env', outlines: true, hasSaves: false, revealed: true, force: '', winShown: null };
      const pv0 = () => ctx._pv;
      if (!ctx._pv) {
        const pv = TP.create({
          getState: () => ({ sel: st.sel, outlines: st.outlines, revealed: st.revealed, revealAt: st.revealAt, winAt: st.winAt, data: st.drag,
            opts: { states: st.force && String(st.sel).startsWith('button:') ? { [st.sel.slice(7)]: st.force } : {}, hasSaves: st.hasSaves, window: st.winShown, clickAt: st.clickAt,
              focus: st.force === 'focus' && String(st.sel).startsWith('button:') ? st.sel.slice(7) : null, heldT: st.playHeld ? undefined : undefined } }),
          onPick: sel => { if (String(sel).startsWith('button:')) { st.clickAt = Object.assign({}, st.clickAt, { [sel.slice(7)]: pv0().time }); } select(sel); },
          onMove: (sel, dx, dy, end) => moveSel(sel, dx, dy, end, false),
          onResize: (sel, dx, dy, end) => moveSel(sel, dx, dy, end, true),
          onKey: ev => { const d = ev.shiftKey ? 10 : 1, m = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[ev.key]; if (!m) return false; st.refocus = true; moveSel(st.sel, m[0], m[1], true, false); return true; }
        });
        ctx._pv = pv;
      }
      const pv = ctx._pv;
      ctx.onDispose(() => pv.park());   // 다시 그릴 때 · 탭을 닫을 때 (닫으면 다시 깨우는 것이 없어 그대로 멈춤)
      current = { ctx, t, pv };
      /** 끌기 · 화살표: 복사본(st.drag)으로 미리보기만, end 에서 한 번 저장 */
      function moveSel(sel, dx, dy, end, resize) {
        const base = get(), S = resolveSel(base, sel), scr = pv.screen; if (!S || !scr) return;
        const apply = o => {
          const R = resolveSel(o, sel);
          if (sel === 'logo') { o.logo = o.logo || {}; o.logo.offsetX = Math.round((+(base.logo || {}).offsetX || 0) + dx); o.logo.offsetY = Math.round((+(base.logo || {}).offsetY || 0) + dy); return true; }
          if (!R || !R.item) return false;
          const x = R.item, b = S.item;
          if (R.kind === 'element') {
            const area = x.safe === false ? { w: scr.W, h: scr.H } : scr.safe;
            if (resize) { if (x.type === 'text') x.w = Math.max(10, Math.round((+b.w || (pv.geo.elements.find(e => e.id === x.id) || { r: [0, 0, 40] }).r[2]) + dx)); else { const e = pv.geo.elements.find(q => q.id === x.id); const w0 = e ? e.r[2] : 10; x.scale = Math.max(0.05, Math.round((+b.scale || 1) * (w0 + dx) / Math.max(1, w0) * 100) / 100); } }
            else { x.x = Math.round(((+b.x ?? 0.5) + dx / area.w) * 1000) / 1000; x.y = Math.round(((+b.y ?? 0.5) + dy / area.h) * 1000) / 1000; }
            return true;
          }
          if (R.kind === 'window') { if (resize) x.w = Math.max(40, Math.round((+b.w || 120) + dx)); else { x.offsetX = Math.round((+b.offsetX || 0) + dx); x.offsetY = Math.round((+b.offsetY || 0) + dy); } return true; }
          if (R.kind === 'button') {
            if ((o.buttons || {}).layout !== 'free') { if (end) PDM.toast && PDM.toast('버튼을 직접 옮기려면 버튼 묶음 배치를 "자유 배치"로 바꾸세요'); return false; }
            const g0 = pv.geo.buttons.find(q => q.id === x.id); if (!g0) return false;
            const pb = b.place || {}; x.place = Object.assign({}, x.place || {});
            if (resize) { x.place.w = Math.max(16, Math.round((+pb.w || g0.base[2]) + dx)); x.place.h = Math.max(10, Math.round((+pb.h || g0.base[3]) + dy)); }
            else { x.place.x = Math.round(((g0.base[0] + g0.base[2] / 2) + dx) / scr.W * 1000) / 1000; x.place.y = Math.round(((g0.base[1] + g0.base[3] / 2) + dy) / scr.H * 1000) / 1000; }
            return true;
          }
          return false;
        };
        if (!end) { const c = PDM.clone(base); if (apply(c)) { st.drag = c; pv.redraw(); } return; }
        st.drag = null;
        const probe = PDM.clone(base); if (!apply(probe)) { pv.redraw(); return; }
        store.edit(K, resize ? '타이틀: 크기' : '타이틀: 옮기기', o => { apply(o); });
      }
      const issues = M.check(t);
      pv.set(t, { screen: st.screen });
      // 도구 모음
      const sel = st.sel || 'background', S = resolveSel(t, sel) || { kind: 'background' };
      const isBtn = S.kind === 'button';
      const tb = h('div', { class: 'tp-toolbar' },
        PDM.ui.field('화면', h('select', { onchange: e => { st.screen = e.target.value; ctx.refresh(); } }, Object.entries(TP.SCREENS).map(([k, v]) => h('option', { value: k, selected: st.screen === k }, v)))),
        h('button', { class: 'btn sm', title: '애니메이션 재생 · 일시 정지', onclick: () => { pv.playing ? pv.pause() : pv.play(); ctx.refresh(); } }, pv.playing ? '⏸ 멈춤' : '▶ 재생'),
        h('button', { class: 'btn sm', title: '처음부터 (등장 애니메이션 다시)', onclick: () => { pv.restart(); st.revealAt = 0; st.winAt = 0; ctx.refresh(); } }, '⟲ 처음부터'),
        (t.gate || {}).enabled ? h('button', { class: 'btn sm', onclick: () => { st.revealed = !st.revealed; st.revealAt = pv.time; ctx.refresh(); } }, st.revealed ? '👆 "화면을 누르세요"로' : '👆 누른 뒤 (메뉴)') : null,
        isBtn ? PDM.ui.field('이 버튼 상태', h('select', { onchange: e => { st.force = e.target.value; ctx.refresh(); } }, [['', '실제 (마우스를 올려 보세요)'], ['normal', '기본'], ['hover', '포인터 오버'], ['focus', '키보드 포커스'], ['pressed', '눌림'], ['disabled', '비활성']].map(([k, v]) => h('option', { value: k, selected: st.force === k }, v)))) : null,
        PDM.ui.field('창 미리보기', h('select', { onchange: e => { st.winShown = e.target.value || null; st.winAt = pv.time; ctx.refresh(); } }, h('option', { value: '' }, '(없음)'), (t.windows || []).map(w => h('option', { value: w.id, selected: st.winShown === w.id }, w.title || w.id)))),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!st.hasSaves, onchange: e => { st.hasSaves = e.target.checked; ctx.refresh(); } }), h('span', {}, '저장된 게임 있음 (예시 값)')),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!st.outlines, onchange: e => { st.outlines = e.target.checked; pv.redraw(); } }), h('span', {}, '편집 윤곽')));
      const scr = pv.screen;
      const center = h('div', { class: 'tp-center' }, tb, pv.el,
        h('div', { class: 'hint' }, `${scr ? scr.name : ''} · 실제 게임과 같은 데이터 · 배치 식 · 그림 · 글꼴로 그립니다 (배경 폐허 · 입자는 무작위라 순간 모양은 다름). 편집 윤곽은 게임에 나오지 않습니다.`));
      // 오른쪽 속성
      const selIssues = issues.filter(x => x.sel === sel || (S.kind === 'window' && String(x.sel).startsWith('content:' + S.id + ':')));
      let props;
      switch (S.kind) {
        case 'button': props = buttonProps(t, S, st); break;
        case 'buttons': props = groupProps(t); break;
        case 'element': props = S.item ? elementProps(t, S) : null; break;
        case 'window': props = S.item ? windowProps(t, S) : null; break;
        case 'content': props = S.item ? contentProps(t, S) : null; break;
        case 'music': props = h('div', {}, h('h3', {}, '음악'), h('p', { class: 'hint' }, '비워 두면 게임이 트는 곡 그대로 (원작: theme_1·theme_2' + (PDM.isMod2() ? ', mod-2: title.mp3' : '') + '). 여러 곡이면 무작위, "(음악 끄기)"로 무음.'),
          listEditor(K, ['music', 'tracks'], { addLabel: '곡 추가', compact: true, make: () => '', render: (x, i, ip) => F.sound(K, ip, { kind: 'bgm', allowNone: true, mini: true }) })); break;
        case 'logo': props = logoProps(t); break;
        case 'gate': props = gateProps(t); break;
        case 'misc': props = h('div', {}, h('h3', {}, '버전 · 종료 · 감추기'), row(F.bool(K, ['version', 'visible'], { label: '버전 글자', def: true, rerender: true }), F.text(K, ['version', 'text'], { label: '버전 글자 바꾸기 (비우면 게임 버전)', rerender: true })),
          row(F.bool(K, ['exit', 'visible'], { label: '종료 버튼 (PC)', def: true, rerender: true }), F.bool(K, ['hideButton'], { label: '화면 감추기 버튼 (아래 화살표)', def: !!PDM.gameTitle4, rerender: true }))); break;
        case 'menus': props = h('div', {}, h('h3', {}, '메뉴 화면 (랭킹 · 모험 일지 · 변경 · 소개 · 새 소식 · 지원)'),
          h('p', { class: 'hint' }, '게임은 메뉴 화면마다 따로 배경을 만들고, 랭킹·모험 일지·변경 화면에서는 음악을 theme 곡으로 바꿉니다. 켜 두면 타이틀과 같은 배경·음악을 이어서 씁니다.'),
          row(F.bool(K, ['menus', 'background'], { label: '타이틀과 같은 배경', def: true, rerender: true }), F.bool(K, ['menus', 'music'], { label: '타이틀과 같은 음악', def: true, rerender: true }),
            (t.menus || {}).background !== false ? F.bool(K, ['menus', 'layers'], { label: '그림 레이어도 (타이틀에서만 표시한 것 빼고)', def: true, rerender: true }) : null,
            (t.menus || {}).background !== false ? F.bool(K, ['menus', 'effect'], { label: '날씨·입자 효과도', rerender: true }) : null)); break;
        case 'pages': props = pagesSection(t); break;
        case 'sprites': props = section('타이틀 스프라이트 (게임 그림 고치기 · 바꾸기)', spriteSection(t, t.background || {})); break;
        default: props = backgroundProps(t, st);
      }
      const right = h('div', { class: 'tp-props' },
        selIssues.length ? h('div', { class: 'tp-issues' }, ...selIssues.map(x => h('div', { class: x.level === 'error' ? 'c-bad' : x.level === 'warn' ? 'c-warn' : 'hint' }, `${x.level === 'error' ? '✕' : x.level === 'warn' ? '!' : 'ℹ'} ${x.msg}`))) : null,
        props || h('p', { class: 'hint' }, '고른 것이 없어졌습니다 — 왼쪽 목록에서 고르세요.'));
      const preset = (name, label) => h('button', { class: 'btn sm', onclick: async e => { e.preventDefault(); if (await PDM.ui.confirm(`타이틀 화면을 "${label}" 모양으로 바꿀까요? (지금 설정은 되돌리기로 복구할 수 있습니다)`)) store.edit(K, '타이틀 모양: ' + label, o => { const p = PRESETS[name](); Object.keys(o).forEach(k => delete o[k]); Object.assign(o, p); }); } }, label);
      if (st.refocus) { st.refocus = false; setTimeout(() => pv.overlay.focus({ preventScroll: true })); }   // 화살표로 옮겨 다시 그려도 캔버스에 키보드가 남음
      const errs = issues.filter(x => x.level === 'error').length, warns = issues.filter(x => x.level === 'warn').length;
      return h('div', { class: 'page title-page' },
        h('h1', {}, '🏰 타이틀 화면'),
        h('p', { class: 'lead' }, '게임을 켰을 때 처음 나오는 화면입니다. 이 설정을 켜면 게임의 원래 타이틀을 숨기고 아래 설정대로 새로 그립니다. 가운데 미리보기는 게임과 같은 규칙으로 그리고, 왼쪽에서 고른 것을 오른쪽에서 고칩니다.'),
        row(F.bool(K, ['enabled'], { label: '이 설정 사용 (끄면 게임 원래 타이틀)', def: true, rerender: true }),
          h('div', { class: 'hstack' }, h('span', { class: 'hint' }, '빠른 시작:'), preset('game', '지금 게임 기본'), preset('spd', '예전 아치 모양'), preset('showcase', '예시 (요소 · 창 · 효과)'), PDM.isMod2() ? preset('mod2', 'mod-2(위츨링) 기본') : null),
          h('span', { class: errs ? 'c-bad' : warns ? 'c-warn' : 'hint' }, errs || warns ? `검사: 오류 ${errs} · 경고 ${warns} (목록의 ✕ · ! 표시)` : '검사: 문제 없음')),
        h('div', { class: 'tp-layout' }, tree(t, issues), center, right));
    }
  });
  function logoProps(t) {
    const { F, row } = PDM.ui;
    return h('div', {}, h('h3', {}, '로고'),
      row(F.select(K, ['logo', 'mode'], { game: '게임 로고 (지금 게임의 banners.png)', image: '내 그림', text: '글자', none: '없음' }, { label: '로고', rerender: true }),
        F.num(K, ['logo', 'scale'], { label: '배율', step: 0.25, min: 0.25, def: 1, rerender: true }), F.select(K, ['logo', 'anim'], LOGO_ANIM, { label: '움직임', rerender: true })),
      row(F.num(K, ['logo', 'y'], { label: '세로 위치 (0~1, 0 = 자동)', step: 0.05, min: 0, max: 1, def: 0, rerender: true }),
        F.num(K, ['logo', 'offsetY'], { label: '위아래 이동 (px)', step: 1, def: 0, rerender: true }), F.num(K, ['logo', 'offsetX'], { label: '좌우 이동 (px)', step: 1, def: 0, rerender: true })),
      (t.logo || {}).mode === 'image' ? F.image(K, ['logo', 'image'], { label: '로고 그림', sub: 'title', rerender: true }) : null,
      (t.logo || {}).mode === 'text' ? h('div', {},
        row(F.text(K, ['logo', 'text'], { label: '제목 글자 (\\n = 줄바꿈)', rerender: true }), F.num(K, ['logo', 'size'], { label: '글자 크기', int: true, min: 6, max: 40, def: 16, rerender: true }), F.color(K, ['logo', 'color'], { label: '색', def: '#ffd966', rerender: true })),
        row(F.text(K, ['logo', 'subtitle'], { label: '부제', rerender: true }), F.color(K, ['logo', 'subColor'], { label: '부제 색', def: '#cccccc', rerender: true }))) : null,
      (t.logo || {}).mode === 'game' || !(t.logo || {}).mode ? row(F.bool(K, ['logo', 'glow'], { label: '빛나는 글자', def: true, rerender: true }), F.bool(K, ['logo', 'torches'], { label: '횃불 (원작)', def: true, rerender: true })) : null,
      h('p', { class: 'hint' }, '캔버스에서 로고를 끌면 좌우 · 위아래 이동 값이 바뀝니다.'));
  }
  function gateProps(t) {
    const { F, row } = PDM.ui; const gate = t.gate || {};
    return h('div', {}, h('h3', {}, '"화면을 누르세요"'),
      row(F.bool(K, ['gate', 'enabled'], { label: '처음엔 로고만 — 누르면 메뉴가 나옴', rerender: true }),
        gate.enabled ? F.text(K, ['gate', 'text'], { label: '안내 글자', rerender: true }) : null,
        gate.enabled ? F.color(K, ['gate', 'color'], { label: '색', def: '#dddddd', rerender: true }) : null,
        gate.enabled ? F.bool(K, ['gate', 'blink'], { label: '깜빡임', def: true, rerender: true }) : null),
      gate.enabled ? row(F.select(K, ['gate', 'logoAfter'], { fade: '사라짐 (메뉴는 화면 가운데)', up: '위로 올라감', stay: '그대로' }, { label: '누른 뒤 로고', rerender: true }),
        F.num(K, ['gate', 'idleReturn'], { label: '가만히 두면 돌아가기 (초, 0 = 안 함)', int: true, min: 0, def: 15, rerender: true })) : null);
  }
  function backgroundProps(t, st) {
    const { F, row, listEditor } = PDM.ui;
    const bg = t.background || {};
    const ruinsOn = !!(bg.ruins && bg.ruins.on && PDM.gameTitle4 && !PDM.isMod2());
    return h('div', {}, h('h3', {}, '배경'),
      row(PDM.ui.field('배경 방식', (() => {
          const s = h('select', {}, Object.entries(ARCH_STYLES).map(([k, v]) => h('option', { value: k, selected: archStyleOf(bg) === k }, k === 'game' && !PDM.isMod2() ? (PDM.gameTitle4 ? '게임 배경 그대로 (SPD 4.0: 떠오르는 폐허)' : '게임 배경 그대로 (원작 아치)') : v)));
          s.onchange = () => store.edit(K, '배경 방식', o => { o.background = o.background || {}; o.background.archs = s.value !== 'none'; if (s.value !== 'none') o.background.archStyle = s.value; });
          return s; })()),
        archStyleOf(bg) === 'game' && !ruinsOn ? F.bool(K, ['background', 'archReverse'], { label: '반대 방향으로 흐름', rerender: true }) : null,
        archStyleOf(bg) === 'classic' ? F.select(K, ['background', 'archDir'], DIRS, { label: '흐르는 방향 (가로·세로)', rerender: true }) : null,
        archStyleOf(bg) === 'classic' ? F.num(K, ['background', 'archSpeed'], { label: '속도 (px/초, 원작 20)', min: 0, step: 1, def: 20, rerender: true }) : null,
        F.color(K, ['background', 'color'], { label: '배경색 (비우면 없음)', rerender: true })),
      archStyleOf(bg) === 'classic' ? row(
        F.image(K, ['background', 'archImages', 'bg'], { label: '뒤 아치 그림 (비우면 게임 arcs1.png)', sub: 'title', rerender: true }),
        F.image(K, ['background', 'archImages', 'fg'], { label: '앞 아치 그림 (비우면 게임 arcs2.png, 2배 빠름)', sub: 'title', rerender: true })) : null,
      archStyleOf(bg) === 'game' && PDM.gameTitle4 && !PDM.isMod2() ? ruinsUI(K, bg, st) : null,
      row(F.bool(K, ['background', 'gradient', 'enabled'], { label: '그라데이션 덮기', rerender: true }),
        (bg.gradient || {}).enabled ? F.color(K, ['background', 'gradient', 'color'], { label: '색 (예: #0b1b3a 밤하늘)', rerender: true }) : null,
        (bg.gradient || {}).enabled ? F.num(K, ['background', 'gradient', 'alpha'], { label: '진하기', step: 0.05, min: 0, max: 1, def: 0.55, rerender: true }) : null,
        (bg.gradient || {}).enabled ? F.select(K, ['background', 'gradient', 'from'], { top: '위에서', bottom: '아래에서', left: '왼쪽에서', right: '오른쪽에서' }, { label: '진한 쪽', rerender: true }) : null,
        F.bool(K, ['background', 'vignette'], { label: '아래쪽 어둡게', rerender: true })),
      row(F.select(K, ['background', 'effect'], Object.fromEntries(Object.entries(EFFECTS).filter(([k]) => PDM.isMod2() || k !== 'mana' || bg.effect === 'mana')), { label: '날씨·입자 효과', rerender: true }), F.num(K, ['background', 'effectDensity'], { label: '양', step: 0.25, min: 0.1, def: 1, rerender: true }),
        F.select(K, ['background', 'effectArea'], { screen: '화면 전체', logo: '로고 주변' }, { label: '위치', rerender: true }),
        F.color(K, ['background', 'effectColor'], { label: '색 (비우면 기본)', rerender: true }), F.bool(K, ['background', 'effectFront'], { label: '로고 위에', rerender: true })),
      h('div', { class: 'fl m-0 mt-4 mb-1' }, '그림 레이어 (아래 것이 위에 그려짐) — 크기 맞춤: 원래 크기 · 화면 채우기(잘림) · 화면 안에 맞춤 · 가로/세로에 맞춤 · 늘리기 + 위치 · 배율'),
      listEditor(K, ['layers'], { addLabel: '그림 레이어', emptyText: '레이어가 없습니다. 직접 그린 그림을 넣어 보세요.',
        make: () => ({ name: '레이어', image: '', frame: [0, 0], frames: [], fps: 6, fit: 'cover', x: 0.5, y: 0.5, anchorX: 0.5, anchorY: 0.5, scale: 1, alpha: 1, blend: 'normal', tile: false, scrollX: 0, scrollY: 0, front: false }),
        render: (l, i, p) => h('details', { open: !!st['ly' + i], ontoggle: e => { st['ly' + i] = e.target.open; } },
          h('summary', { class: 'pointer' }, h('b', {}, l.name || '레이어 ' + (i + 1)), h('span', { class: 'hint' }, '  ' + (l.image || '(그림 없음)') + (l.tile ? ' · 반복' : '') + (l.frame && l.frame[0] ? ' · 애니메이션' : '') + (l.front ? ' · 로고 위' : '') + (l.titleOnly ? ' · 타이틀만' : ''))),
          layerRow(p, l)) }));
  }
  PDM.titleEditor = { PRESETS, select: sel => select(sel), resolveSel, geo: () => current && current.pv ? current.pv.geo : null, preview: () => current && current.pv };
})();
