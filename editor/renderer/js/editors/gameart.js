// ================================================================
//  UI 그림 · 맵 그림 — 게임 화면 요소와 맵 타일셋을 한곳에서 보고 고칩니다.
//   'uiart'  : 게임 interfaces/ 그림 (창 테두리·버튼·상태 창·도구 막대·아이콘·배너)
//   'mapart' : 테마 타일셋·물·지형 그림 (environment/) + 사용자 테마(타일셋 사본) 만들기·편집
//   고치면 프로젝트의 assets/game/<같은 경로> 에 저장되고, 게임이 원본 대신 그 그림을 씁니다 (그림 관리의 "게임 그림 바꾸기"와 같은 방식).
// ================================================================
(function () {
  const { h } = PDM;
  const store = PDM.store;

  /** 게임 폴더(sub) 안의 png 목록 (하위 폴더 포함) → 'sub/…png' */
  async function listGame(sub) {
    const g = store.gameAssetsDir(); if (!g) return null;
    const out = [];
    const walk = async (abs, pre) => {
      let l = []; try { l = await pdm.list(abs); } catch (_) { return; }
      for (const e of l.sort((a, b) => a.name.localeCompare(b.name))) { if (e.dir) await walk(pdm.join(abs, e.name), pre + e.name + '/'); else if (/\.png$/i.test(e.name)) out.push(pre + e.name); }
    };
    await walk(pdm.join(g, sub), sub + '/');
    return out;
  }
  const card = (gr, label) => PDM.sprites.gameCard(gr, label);
  const grid = cards => h('div', { class: 'spr-grid' }, cards);
  const head = (ctx, st) => h('div', { class: 'spr-tools' },
    h('button', { class: 'btn sm' + (st.only ? ' pri' : ''), onclick: () => { st.only = !st.only; ctx.refresh(); } }, st.only ? '✓ 바꾼 그림만' : '바꾼 그림만 보기'),
    h('button', { class: 'btn sm', onclick: async () => { await PDM.assets.scanOverrides(); PDM.assets.clear(); ctx.refresh(); } }, '↻ 새로 고침'),
    h('button', { class: 'btn sm', onclick: () => PDM.tabs.open('sprites') }, '🖼 그림 관리 열기'));

  // ------------------------------------------------------------ UI 그림
  const UI_GROUPS = [
    ['창 · 버튼 · 화면 틀', [
      ['chrome.png', '창 테두리 · 버튼 · 말풍선 (9칸 늘림)'], ['status_pane.png', '상태 창 (초상화 · 체력 · 경험치)'], ['toolbar.png', '도구 막대 · 퀵슬롯'],
      ['menu_pane.png', '오른쪽 위 메뉴 판 (층 · 열쇠)'], ['menu_button.png', '메뉴 버튼 (일지 · 메뉴)'], ['boss_hp.png', '보스 체력 막대'],
      ['radial_menu.png', '원형 메뉴 (컨트롤러)'], ['talent_button.png', '특성 버튼 틀'], ['shadow.png', '그림자 (화면 가장자리)']]],
    ['아이콘', [
      ['icons.png', '아이콘 모음 (버튼 · 창 · 표시)'], ['buffs.png', '버프 아이콘 (작은 것 — 상태 창 옆)'], ['large_buffs.png', '버프 아이콘 (큰 것 — 설명 창)'],
      ['hero_icons.png', '영웅 아이콘 (전직 · 직업 능력 · 행동 버튼)'], ['talent_icons.png', '특성 아이콘'], ['badges.png', '배지'], ['locked_badge.png', '잠긴 배지'], ['change_icons.png', '변경 내역 아이콘']]],
    ['배너 · 배경', [
      ['banners.png', '로고 · 배너 (보스 처치 · 게임 오버 등)'], ['arcs1.png', '메뉴 배경 아치 (뒤)'], ['arcs2.png', '메뉴 배경 아치 (앞)'], ['surface.png', '지상 화면 (엔딩)']]]
  ];
  PDM.registerEditor({
    id: 'uiart', icon: '▭', title: () => 'UI 그림',
    match: k => k === 'uiart', needsResource: false, watch: () => false,
    tree: () => store.isOpen ? [{ id: 'uiart', label: 'UI 그림', icon: '▭', open: 'uiart', order: 57 }] : [],
    render(key, ctx) {
      const st = ctx.state = ctx.state || { only: false };
      const page = h('div', { class: 'page' },
        h('h1', {}, '▭ UI 그림'),
        h('p', { class: 'lead' }, '게임 화면을 이루는 그림(창 테두리 · 버튼 · 상태 창 · 도구 막대 · 아이콘 · 배너)입니다. "고치기"는 원본을 프로젝트로 복사해서 편집하고, "바꾸기"는 다른 PNG 로 갈아 끼웁니다. 테스트 플레이부터 바로 적용되고, "원래대로"를 누르면 게임 원본으로 돌아갑니다.'),
        head(ctx, st),
        h('p', { class: 'hint' }, '그림의 크기와 칸 배치는 원본과 같게 두세요 — 게임이 정해진 위치에서 잘라 씁니다. 두 번 클릭 = 고치기.'));
      const body = h('div', {}); page.append(body);
      const known = new Set(UI_GROUPS.flatMap(([, l]) => l.map(([f]) => 'interfaces/' + f)));
      const show = gr => !st.only || PDM.assets.isOverridden(gr);
      listGame('interfaces').then(files => {
        if (!files) { body.append(h('div', { class: 'empty' }, '프로젝트 설정에서 게임 저장소 경로를 먼저 지정하세요')); return; }
        const have = new Set(files);
        UI_GROUPS.forEach(([name, list]) => {
          const cards = list.filter(([f]) => have.has('interfaces/' + f) && show('interfaces/' + f)).map(([f, label]) => card('interfaces/' + f, label));
          if (cards.length) body.append(h('h3', {}, name), grid(cards));
        });
        const rest = files.filter(f => !known.has(f) && show(f));
        if (rest.length) body.append(h('h3', {}, '그 밖의 화면 그림'), grid(rest.map(f => card(f))));
        if (!body.children.length) body.append(h('div', { class: 'empty' }, st.only ? '아직 바꾼 UI 그림이 없습니다' : '게임 저장소에 interfaces 그림이 없습니다'));
      });
      return page;
    }
  });

  // ------------------------------------------------------------ 맵 그림
  const ENV_LABELS = { 'terrain_features.png': '지형 위 그림 (함정 · 식물 · 풀 · 불씨)', 'raised_terrain.png': '솟은 지형 (높은 풀 · 문 위쪽)', 'wall_blocking.png': '벽 가림 (시야 밖 벽)',
    'visual_grid.png': '격자 표시', 'occlusion_shadows.png': '가림 그림자', 'tiles_caves_crystal.png': '수정 광산 타일셋', 'tiles_caves_gnoll.png': '놀 광산 타일셋' };
  const customThemes = () => (store.get('world') || {}).customThemes || [];
  /** 사용자 테마를 쓰는 곳 */
  function themeUsage(id) {
    const ref = 'custom:' + id, out = [];
    ((store.get('world') || {}).groups || []).forEach(g => { if (g.theme === ref) out.push('그룹 ' + g.name); });
    store.all('node').forEach(f => { if (f.theme === ref) out.push(PDM.World.fullName(f.id)); });
    store.all('room').forEach(r => { if (r.previewTheme === ref) out.push('방 ' + r.name + ' (편집 화면)'); });
    return out;
  }
  async function newTheme(ctx) {
    const sel = h('select', {}, Object.entries(PDM.THEMES).map(([k, t]) => h('option', { value: k }, t.name)));
    const nm = h('input', { type: 'text', value: '새 테마' });
    const ok = await PDM.ui.modal('새 사용자 테마', h('div', {}, PDM.ui.field('이름', nm), PDM.ui.field('바탕 테마 (이 타일셋을 복사해서 시작)', sel),
      h('p', { class: 'hint' }, '바탕 테마의 타일셋(256×256)을 프로젝트 assets/tiles 로 복사합니다. 만든 뒤 맵 그래프의 그룹·노드 "테마"에서 고르면 그 맵에 적용됩니다.')), [['취소', false], ['만들기', () => true, 'pri']]);
    if (!ok) return;
    let id = PDM.slugId(nm.value) || 'theme', n = 2; const base0 = id;
    while (customThemes().some(x => x.id === id)) id = base0 + '_' + n++;
    const rel = `assets/tiles/${id}.png`;
    try { await pdm.copy(PDM.assets.resolvePath('game:' + PDM.THEMES[sel.value].tiles), store.abs(rel)); } catch (err) { toast('타일셋 복사 실패: ' + err.message, 'bad'); return; }
    store.edit('world', '사용자 테마 추가', w => { w.customThemes = w.customThemes || []; w.customThemes.push({ id, name: nm.value.trim() || id, base: sel.value, tiles: rel, water: '', music: '' }); });
    PDM.assets.clear(); ctx.refresh();
  }
  function themeCard(c, ctx) {
    const i = customThemes().findIndex(x => x.id === c.id);
    const cv = h('canvas', { width: 128, height: 128, class: 'checker', style: { imageRendering: 'pixelated', borderRadius: '4px', cursor: 'pointer' }, title: '두 번 클릭 = 타일셋 편집' });
    PDM.assets.load(c.tiles).then(img => { if (!img) return; const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, 128, 128 * img.height / img.width); });
    const edit = async () => {
      let rel = c.tiles;
      if (!rel) { rel = `assets/tiles/${c.id}.png`; try { await pdm.copy(PDM.assets.resolvePath('game:' + PDM.THEMES[c.base || 'SEWER'].tiles), store.abs(rel)); } catch (err) { toast('타일셋 복사 실패: ' + err.message, 'bad'); return; } }
      const tim = await PDM.assets.load(rel).catch(() => null), tcell = tim ? Math.max(1, Math.round(tim.width / 16)) : 16;
      const out = await PDM.editPixelsModal('타일셋 편집 — ' + c.name, rel, 256, 256, tcell, null, { tilePreview: c.base || 'SEWER' });
      if (out && out !== c.tiles) store.edit('world', '타일셋 경로', w => { w.customThemes[i].tiles = out; });
      if (out) { PDM.assets.clear(); ctx.refresh(); }
    };
    cv.ondblclick = edit;
    // ---- 타일셋 배율: 한 칸(게임 화면에서는 언제나 한 칸 = 16)을 몇 px 로 그릴지. 타일셋 PNG 를 그 크기로 다시 만듦
    const SCALES = [[0.25, '×0.25 (한 칸 4px)'], [0.5, '×0.5 (한 칸 8px)'], [1, '×1 (한 칸 16px · 기본)'], [2, '×2 (한 칸 32px)'], [3, '×3 (한 칸 48px)'], [4, '×4 (한 칸 64px)']];
    const scaleInfo = h('span', { class: 'hint' }, ''), scaleSel = h('select', {}, SCALES.map(([v, t]) => h('option', { value: v }, t)));
    PDM.assets.load(c.tiles).then(img => { if (!img) return; const k = img.width / 256; scaleInfo.textContent = `지금: ${img.width}×${img.height}px · 한 칸 ${img.width / 16}px (×${+k.toFixed(2)})`; scaleSel.value = String(SCALES.some(x => x[0] === k) ? k : 1); }).catch(() => { });
    const rescale = async () => {
      const k = +scaleSel.value, img = c.tiles ? await PDM.assets.load(c.tiles).catch(() => null) : null;
      if (!img) { toast('먼저 타일셋 그림을 만들거나 불러오세요 ("타일셋 편집…")', 'bad'); return; }
      const cur = img.width / 256; if (cur === k) { toast('이미 그 배율입니다'); return; }
      if (!(await PDM.ui.confirm(`타일셋을 ×${k} (한 칸 ${16 * k}px, 전체 ${256 * k}px)로 다시 만듭니다.` + (k < cur ? '\n줄이면 지금의 세밀한 그림은 뭉개집니다 (되돌릴 수 없음).' : '\n지금 그림을 그대로 키운 뒤, 늘어난 칸에 세밀하게 덧그릴 수 있습니다.') + '\n게임 화면에서 타일 크기는 그대로이고, 그림만 더 세밀하게(또는 거칠게) 보입니다.'))) return;
      const o = h('canvas', { width: 256 * k, height: Math.round(img.height * k / cur) }), g = o.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, o.width, o.height);
      try { await pdm.writeDataURL(store.abs(c.tiles), o.toDataURL('image/png')); } catch (err) { toast('저장 실패: ' + err.message, 'bad'); return; }
      PDM.assets.clear(); PDM.log(`타일셋 배율: ${c.tiles} → ×${k} (${o.width}×${o.height})`, 'ok'); ctx.refresh();
    };
    const { F, row } = PDM.ui;
    const used = themeUsage(c.id);
    return h('div', { class: 'li', style: { alignItems: 'flex-start', marginBottom: '8px' } }, cv,
      h('div', { class: 'li-body' },
        row(F.text('world', ['customThemes', i, 'name'], { label: '이름' }), F.select('world', ['customThemes', i, 'base'], Object.fromEntries(Object.entries(PDM.THEMES).map(([k, t]) => [k, t.name])), { label: '바탕 테마 (물 · 장식 · 음악 기본)' })),
        row(F.image('world', ['customThemes', i, 'tiles'], { label: '타일셋 PNG (16×16칸 — 기본 256×256, 배율을 키우면 512 · 768 …)', sub: 'tiles', rerender: true }),
          F.image('world', ['customThemes', i, 'water'], { label: '물 그림 (선택 — 비우면 바탕 테마 물)', sub: 'tiles', rerender: true })),
        h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' } },
          h('button', { class: 'btn sm pri', onclick: edit }, '✎ 타일셋 편집…'),
          h('span', { style: { display: 'inline-flex', gap: '4px', alignItems: 'center' }, title: '한 칸을 더 많은 픽셀로 그려 세밀하게 (게임에서도 적용 — 화면의 타일 크기는 그대로)' }, scaleSel, h('button', { class: 'btn sm', onclick: rescale }, '배율 적용'), scaleInfo),
          h('button', { class: 'btn sm', onclick: async () => { const f = await PDM.ui.pickImage('tiles'); if (!f) return; store.edit('world', '타일셋 불러오기', w => { w.customThemes[i].tiles = f; }); PDM.assets.clear(); ctx.refresh(); } }, '⤓ PNG 불러오기'),
          h('button', { class: 'btn sm danger', onclick: async () => { if (!(await PDM.ui.confirm(`사용자 테마 「${c.name}」 을 삭제할까요?` + (used.length ? `\n쓰는 곳 ${used.length}군데는 기본 테마로 보입니다.` : '') + '\n(타일셋 파일은 지우지 않습니다)'))) return; store.edit('world', '사용자 테마 삭제', w => { w.customThemes.splice(i, 1); }); ctx.refresh(); } }, '삭제'),
          h('span', { class: 'hint' }, used.length ? '쓰는 곳: ' + used.join(', ') : '쓰는 곳 없음 — 맵 그래프의 그룹·노드 "테마"에서 고르세요'))));
  }
  PDM.registerEditor({
    id: 'mapart', icon: '▦', title: () => '맵 그림 (타일셋)',
    match: k => k === 'mapart', needsResource: false, watch: ck => ck === 'world',
    tree: () => store.isOpen ? [{ id: 'mapart', label: '맵 그림 (타일셋)', icon: '▦', open: 'mapart', order: 11 }] : [],
    render(key, ctx) {
      const st = ctx.state = ctx.state || { only: false };
      const page = h('div', { class: 'page' },
        h('h1', {}, '▦ 맵 그림 (타일셋)'),
        h('p', { class: 'lead' }, '맵을 이루는 그림입니다. ① 사용자 테마 — 타일셋을 복사해 나만의 테마를 만들고 원하는 맵에만 적용. ② 게임 테마 타일셋 — 고치면 그 테마를 쓰는 모든 맵이 바뀝니다.'));
      // ① 사용자 테마
      const cts = customThemes();
      page.append(h('h2', {}, `사용자 테마 (${cts.length})`),
        h('p', { class: 'hint' }, '바탕 테마의 타일셋을 복사해 고친 나만의 테마. 맵 그래프에서 그룹이나 노드의 "테마"로 고르면 그 맵에만 적용됩니다. 방 템플릿 편집 화면의 "타일 그림" 버튼으로 만든 테마도 여기에 나옵니다.'),
        ...cts.map(c => themeCard(c, ctx)),
        h('button', { class: 'btn sm add', onclick: () => newTheme(ctx) }, '+ 새 사용자 테마'));
      // ② 게임 그림
      page.append(h('h2', { style: { marginTop: '18px' } }, '게임 테마 타일셋'), head(ctx, st),
        h('p', { class: 'hint' }, '타일셋은 256×256, 한 칸 16px 입니다. 칸 배치는 원본과 같게 두세요. 두 번 클릭 = 고치기.'));
      const body = h('div', {}); page.append(body);
      const show = gr => !st.only || PDM.assets.isOverridden(gr);
      listGame('environment').then(files => {
        if (!files) { body.append(h('div', { class: 'empty' }, '프로젝트 설정에서 게임 저장소 경로를 먼저 지정하세요')); return; }
        const have = new Set(files), known = new Set();
        const cards = [];
        Object.values(PDM.THEMES).forEach(t => {
          [[t.tiles, t.name + ' 타일셋'], [t.water, t.name + ' 물']].forEach(([f, label]) => { known.add(f); if (have.has(f) && show(f)) cards.push(card(f, label)); });
        });
        if (cards.length) body.append(grid(cards));
        const rest = files.filter(f => !known.has(f) && show(f));
        if (rest.length) body.append(h('h3', {}, '지형 · 그 밖의 맵 그림'), grid(rest.map(f => card(f, ENV_LABELS[f.split('/').pop()]))));
        if (!body.children.length) body.append(h('div', { class: 'empty' }, st.only ? '아직 바꾼 맵 그림이 없습니다' : '게임 저장소에 environment 그림이 없습니다'));
      });
      return page;
    }
  });
})();
