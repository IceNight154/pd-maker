// ================================================================
//  UI 그림 · 맵 그림 — 게임 화면 요소와 맵 타일셋을 한곳에서 보고 고칩니다.
//   'uiart'  : 게임 interfaces/ 그림 (창 테두리·버튼·상태 창·도구 막대·아이콘·배너)
//   'mapart' : 테마 타일셋·물·지형 그림 (environment/) + 사용자 테마(타일셋 · 물 그림 사본) 만들기·편집 + 사용자 타일(맵 그리기 팔레트)
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
      const out = await PDM.editPixelsModal('타일셋 편집 — ' + c.name, rel, 256, 256, tcell, null, { tilePreview: c.base || 'SEWER', light: { bloom: c.lightBloom || 0, unit: tcell / 16, onBloom: v => store.edit('world', '타일 효과 레이어 번짐', w => { const x = (w.customThemes || []).find(t => t.id === c.id); if (x) x.lightBloom = v; }, { silent: true }), mode: c.lightMode || 'add', onMode: m => store.edit('world', '타일 효과 레이어 합성 방식', w => { const x = (w.customThemes || []).find(t => t.id === c.id); if (x) x.lightMode = m; }, { silent: true }) } });
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
    // ---- 물 그림: 비우면 바탕 테마의 물. 편집하면 바탕 물을 assets/tiles/<id>_water.png 로 복사해서 고침
    const wcv = h('canvas', { width: 64, height: 64, class: 'checker', style: { imageRendering: 'pixelated', borderRadius: '4px', cursor: 'pointer', flex: 'none' }, title: '두 번 클릭 = 물 그림 편집 (2×2 로 이어 붙여 보여 줌 — 이음매 확인)' });
    PDM.assets.themeWater(c.id).then(img => { if (!img) return; const g = wcv.getContext('2d'); g.imageSmoothingEnabled = false; for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) g.drawImage(img, x * 32, y * 32, 32, 32); });
    const editWater = async () => {
      let rel = c.water;
      if (!rel) {
        rel = `assets/tiles/${c.id}_water.png`;
        try { await pdm.copy(PDM.assets.resolvePath('game:' + PDM.THEMES[c.base || 'SEWER'].water), store.abs(rel)); } catch (err) { toast('물 그림 복사 실패: ' + err.message, 'bad'); return; }
        store.edit('world', '사용자 테마 물 그림', w => { w.customThemes[i].water = rel; });
      }
      const out = await PDM.editPixelsModal('물 그림 편집 — ' + c.name, rel, 32, 32, 16, null, {});
      if (out && out !== rel) store.edit('world', '물 그림 경로', w => { w.customThemes[i].water = out; });
      PDM.assets.clear(); ctx.refresh();
    };
    wcv.ondblclick = editWater;
    // 사용자 타일에서 물 그림 고르기: 흐르는 타일은 그림 전체, 칸 타일은 그 칸을 이어 붙여 32×32 이상으로 → assets/tiles/<id>_water.png
    const waterFromTile = async t => {
      const img = await PDM.assets.load(t.image); if (!img) { toast('그 사용자 타일에 그림이 없습니다', 'bad'); return; }
      const z = Math.max(1, t.size || 16), sx = t.flow ? 0 : (t.x || 0) * z, sy = t.flow ? 0 : (t.y || 0) * z, sw = t.flow ? img.width : z, sh = t.flow ? img.height : z;
      const o = h('canvas', { width: Math.max(32, sw), height: Math.max(32, sh) }), g = o.getContext('2d'); g.imageSmoothingEnabled = false;
      for (let y = 0; y < o.height; y += sh) for (let x = 0; x < o.width; x += sw) g.drawImage(img, sx, sy, sw, sh, x, y, sw, sh);
      const rel = `assets/tiles/${c.id}_water.png`;
      try { await pdm.writeDataURL(store.abs(rel), o.toDataURL('image/png')); } catch (err) { toast('물 그림 저장 실패: ' + err.message, 'bad'); return; }
      store.edit('world', '물 그림 ← 사용자 타일 ' + (t.name || t.id), w => { w.customThemes[i].water = rel; w.customThemes[i].waterTile = t.id; });
      PDM.assets.clear(); ctx.refresh(); toast(`물 그림을 사용자 타일 「${t.name || t.id}」 로 바꿨습니다`);
    };
    const tileChoices = () => userTiles().filter(t => t.image);
    const srcTile = c.waterTile && userTiles().find(t => t.id === c.waterTile);
    const { F, row } = PDM.ui;
    const used = themeUsage(c.id);
    return h('div', { class: 'li', style: { alignItems: 'flex-start', marginBottom: '8px' } }, cv,
      h('div', { class: 'li-body' },
        row(F.text('world', ['customThemes', i, 'name'], { label: '이름' }), F.select('world', ['customThemes', i, 'base'], Object.fromEntries(Object.entries(PDM.THEMES).map(([k, t]) => [k, t.name])), { label: '바탕 테마 (물 · 장식 · 음악 기본)' })),
        row(F.image('world', ['customThemes', i, 'tiles'], { label: '타일셋 PNG (16×16칸 — 기본 256×256, 배율을 키우면 512 · 768 …)', sub: 'tiles', rerender: true })),
        h('div', { class: 'fl', style: { marginTop: '4px' } }, '물 그림'),
        h('div', { style: { display: 'flex', gap: '10px', alignItems: 'flex-start', margin: '2px 0 8px' } }, wcv,
          h('div', { style: { flex: '1', minWidth: 0 } },
            h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' } },
              h('button', { class: 'btn sm', onclick: editWater }, c.water ? '✎ 물 그림 편집…' : '✎ 물 그림 만들기 (바탕 테마 물 복사)…'),
              h('button', { class: 'btn sm', onclick: async () => { const f = await PDM.ui.pickImage('tiles'); if (!f) return; store.edit('world', '물 그림 불러오기', w => { w.customThemes[i].water = f; }); PDM.assets.clear(); ctx.refresh(); } }, '⤓ PNG 불러오기'),
              PDM.ui.dropBtn('▦ 사용자 타일에서…', () => tileChoices().length ? tileChoices().map(t => ({ label: `${t.name || t.id}${t.flow ? ' (흐르는 그림 — 전체)' : ` (${t.x || 0}, ${t.y || 0} 칸)`}`, run: () => waterFromTile(t) }))
                : [{ label: '그림이 있는 사용자 타일이 없습니다 — 아래 "사용자 타일"에서 만드세요', run: () => {} }]),
              srcTile ? h('button', { class: 'btn sm', title: '그 사용자 타일의 그림을 고쳤으면 다시 가져옴', onclick: () => waterFromTile(srcTile) }, `↻ 「${srcTile.name || srcTile.id}」 다시 가져오기`) : null,
              c.water ? h('button', { class: 'btn sm', onclick: () => { store.edit('world', '물 그림 되돌리기', w => { w.customThemes[i].water = ''; delete w.customThemes[i].waterTile; }); PDM.assets.clear(); ctx.refresh(); } }, '바탕 테마 물로') : null),
            h('p', { class: 'hint' }, `${c.water ? c.water : '지금: 바탕 테마(' + (PDM.THEMES[c.base || 'SEWER'] || {}).name + ')의 물'} — 물 칸 아래에 깔려 천천히 흐르는 그림입니다. 게임 물은 32×32 이고 가로 · 세로로 이어 붙여 쓰므로 끝과 끝이 이어지게 그리세요 (왼쪽 미리보기 = 2×2). 물가 모양은 타일셋의 물가 칸이 정합니다.${srcTile ? ` · 사용자 타일 「${srcTile.name || srcTile.id}」 에서 가져옴 (그 타일의 효과 · 이름은 물 칸에 붙지 않음 — 효과까지 원하면 그 사용자 타일을 맵에 칠하세요)` : ' · "사용자 타일에서…"로 내가 만든 타일의 그림을 물로 쓸 수 있습니다 (칸 타일은 이어 붙여 32×32).'}`))),
        h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' } },
          h('button', { class: 'btn sm pri', onclick: edit }, '✎ 타일셋 편집…'),
          h('span', { style: { display: 'inline-flex', gap: '4px', alignItems: 'center' }, title: '한 칸을 더 많은 픽셀로 그려 세밀하게 (게임에서도 적용 — 화면의 타일 크기는 그대로)' }, scaleSel, h('button', { class: 'btn sm', onclick: rescale }, '배율 적용'), scaleInfo),
          h('button', { class: 'btn sm', onclick: async () => { const f = await PDM.ui.pickImage('tiles'); if (!f) return; store.edit('world', '타일셋 불러오기', w => { w.customThemes[i].tiles = f; }); PDM.assets.clear(); ctx.refresh(); } }, '⤓ PNG 불러오기'),
          h('button', { class: 'btn sm danger', onclick: async () => { if (!(await PDM.ui.confirm(`사용자 테마 「${c.name}」 을 삭제할까요?` + (used.length ? `\n쓰는 곳 ${used.length}군데는 기본 테마로 보입니다.` : '') + '\n(타일셋 파일은 지우지 않습니다)'))) return; store.edit('world', '사용자 테마 삭제', w => { w.customThemes.splice(i, 1); }); ctx.refresh(); } }, '삭제'),
          h('span', { class: 'hint' }, used.length ? '쓰는 곳: ' + used.join(', ') : '쓰는 곳 없음 — 맵 그래프의 그룹·노드 "테마"에서 고르세요'))));
  }
  // ------------------------------------------------------------ 사용자 타일 (world.userTiles) — 맵 그리기 팔레트에서 칠함 (런타임 MakerUserTiles)
  const userTiles = () => (store.get('world') || {}).userTiles || [];
  PDM.userTiles = userTiles;
  /** 사용자 타일 한 칸을 g 의 (x, y, s×s)에 그림 (그림이 아직 없으면 불러온 뒤 then) */
  PDM.drawUserTile = function (g, t, x, y, s, tilesImg) {
    const mark = () => { if (!t.fx && !t.gameFx) return; g.font = `bold ${Math.max(7, s * .45)}px sans-serif`; g.textAlign = 'right'; g.textBaseline = 'top'; g.fillStyle = '#000a'; g.fillText('✦', x + s, y + 1); g.fillStyle = '#ffe27a'; g.fillText('✦', x + s - 1, y); };
    if (t.image && t.flow) return PDM.assets.load(t.image).then(img => { if (!img) return; g.imageSmoothingEnabled = false; const z = Math.min(16, img.width, img.height); g.drawImage(img, 0, 0, z, z, x, y, s, s); mark(); return img; });   // 흐르는 그림: 그림의 한쪽 귀퉁이
    if (!t.image) {   // 그림 없는 타일 = 지형 + 효과
      if (t.terrain >= 0) PDM.assets.drawTerrain(g, tilesImg || null, t.terrain, x, y, s); mark(); return Promise.resolve(null);
    }
    return PDM.assets.load(t.image).then(img => { if (!img) return; const z = Math.max(1, t.size || 16); g.imageSmoothingEnabled = false; g.drawImage(img, (t.x || 0) * z, (t.y || 0) * z, z, z, x, y, s, s); mark(); return img; });
  };
  /** 게임 효과 (런타임 MakerUserTiles.make) */
  PDM.GAME_TILE_FX = { sink: '하수도 배수구 물방울', torch: '감옥 횃불 (불꽃 + 빛무리)', vein: '동굴 광맥 반짝임', smoke: '도시 연기', greenflame: '도시 초록 불꽃', stream: '전당 물 김',
    alchemy: '연금술 솥 거품', sacrificial: '희생의 불꽃', healing: '치유의 샘 반짝임', flame: '불꽃', sparks: '전기 불꽃' };
  /** 게임의 "효과가 붙은 타일" 프리셋 — 그림 없이 지형 + 게임 효과 + 이름 */
  const TILE_PRESETS = [
    ['희생의 재단', { terrain: 11, gameFx: 'sacrificial', title: '희생의 재단', desc: '' }],
    ['연금술 솥', { terrain: 28, gameFx: 'alchemy', title: '', desc: '' }],
    ['하수도 배수구', { terrain: 12, gameFx: 'sink', title: '', desc: '' }],
    ['횃불 벽', { terrain: 12, gameFx: 'torch', title: '횃불', desc: '벽에 걸린 횃불이 타오르고 있다.' }],
    ['치유의 샘', { terrain: 24, gameFx: 'healing', title: '', desc: '' }],
    ['연기 나는 벽', { terrain: 12, gameFx: 'smoke', title: '', desc: '' }],
    ['수정 광맥', { terrain: 12, gameFx: 'vein', title: '', desc: '' }],
    ['초록 불꽃 화로', { terrain: 12, gameFx: 'greenflame', title: '초록 불꽃', desc: '' }],
    ['흐르는 물 그림 (하수도 물)', { terrain: -2, gameFx: '', image: 'game:environment/water0.png', flow: true, flowX: 0, flowY: -5, title: '', desc: '' }],
    ['빛나는 물 (물 그림 + 치유의 샘 반짝임)', { terrain: 29, gameFx: 'healing', image: 'game:environment/water0.png', flow: true, flowX: 0, flowY: -5, title: '빛나는 물', desc: '물이 은은하게 빛난다.' }]];
  /** 이 타일을 칠한 곳 (노드 · 방 이름과 칸 수) */
  function userTileUsage(id) {
    const out = [];
    [...store.all('node').map(f => ['node', f]), ...store.all('room').map(r => ['room', r])].forEach(([k, f]) => {
      const n = (((f.layers || {}).utile) || []).filter(v => v === id).length;
      if (n) out.push(`${k === 'room' ? '방 ' + f.name : PDM.World.fullName(f.id)} ${n}칸`);
    });
    return out;
  }
  function userTilesSection(ctx, st) {
    const { F, row, listEditor } = PDM.ui;
    const themeSheets = [...Object.entries(PDM.THEMES).map(([k, t]) => ['game:' + t.tiles, t.name + ' 타일셋']), ...customThemes().filter(c => c.tiles).map(c => [c.tiles, c.name + ' (사용자 테마)']),
      ...Object.values(PDM.THEMES).map(t => ['game:' + t.water, t.name + ' 물 그림']), ...customThemes().filter(c => c.water).map(c => [c.water, c.name + ' 물 그림 (사용자 테마)'])];
    return h('div', {},
      h('h2', { style: { marginTop: '18px' } }, `사용자 타일 (${userTiles().length})`),
      h('p', { class: 'hint' }, '희생의 재단 · 연금술 솥 · 하수도 배수구처럼 효과가 붙은 타일도 여기서 만듭니다 — 지형 + 게임 효과(또는 내 이펙트) + 살펴보기 이름 · 설명. 그림은 비워 두면 지형의 원래 그림.'),
      h('p', { class: 'hint' }, '타일셋의 정해진 칸(게임이 지형에 따라 고르는 그림) 말고도, 아무 그림의 한 칸을 타일로 만들어 두고 맵 그리기 팔레트의 "사용자 타일"에서 골라 원하는 칸에 칠할 수 있습니다. 칠하면 지형 위에 그 그림이 덮이고, 판정(벽 · 바닥 · 물 등)은 "칠할 때 지형"으로 정합니다. 직접 그린 맵 · 혼합 맵 · 방 템플릿에서 씁니다.'),
      h('div', { class: 'btnbar' }, h('span', { class: 'hint' }, '게임의 효과 타일로 시작:'),
        PDM.ui.dropBtn('+ 효과 타일 (게임 프리셋)', () => TILE_PRESETS.map(([n, o]) => ({ label: `${n} — ${PDM.GAME_TILE_FX[o.gameFx]}`, run: () => store.edit('world', '효과 타일 추가: ' + n, w => { w.userTiles = w.userTiles || []; w.userTiles.push(Object.assign({ id: PDM.uid('ut'), name: n, image: '', x: 0, y: 0, size: 16, over: false, fx: '' }, o)); }) })))),
      listEditor('world', ['userTiles'], { addLabel: '사용자 타일', dup: false, emptyText: '아직 없습니다 — "+ 사용자 타일"을 눌러 만드세요.',
        make: () => ({ id: PDM.uid('ut'), name: '새 타일', image: themeSheets[0][0], x: 0, y: 0, size: 16, terrain: -2, over: false }),
        render: (t, i, p) => {
          const z = Math.max(1, t.size || 16);
          // 칸 고르기: 그림을 격자로 보여 주고 누르면 x · y
          const pick = h('canvas', { class: 'checker', style: { imageRendering: 'pixelated', cursor: 'crosshair', maxWidth: '100%', borderRadius: '4px' }, title: '누르면 그 칸을 이 타일로' });
          const prev = h('canvas', { width: 48, height: 48, class: 'checker', style: { imageRendering: 'pixelated', borderRadius: '4px', flex: 'none' } });
          PDM.assets.load(t.image).then(img => {
            if (!img) return;
            const k = img.width <= 160 ? 3 : img.width <= 320 ? 2 : 1;
            pick.width = img.width * k; pick.height = img.height * k;
            const g = pick.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, pick.width, pick.height);
            g.strokeStyle = 'rgba(255,255,255,.15)'; g.beginPath();
            for (let x = 0; x <= img.width; x += z) { g.moveTo(x * k + .5, 0); g.lineTo(x * k + .5, pick.height); }
            for (let y = 0; y <= img.height; y += z) { g.moveTo(0, y * k + .5); g.lineTo(pick.width, y * k + .5); }
            g.stroke(); g.strokeStyle = '#ffd166'; g.lineWidth = 2; g.strokeRect((t.x || 0) * z * k + 1, (t.y || 0) * z * k + 1, z * k - 2, z * k - 2);
            pick.onclick = e => { const r = pick.getBoundingClientRect(), sx = pick.width / r.width; const cx = Math.floor((e.clientX - r.left) * sx / k / z), cy = Math.floor((e.clientY - r.top) * sx / k / z); store.edit('world', '사용자 타일 칸', w => { const o = w.userTiles[i]; o.x = cx; o.y = cy; }); };
          });
          PDM.drawUserTile(prev.getContext('2d'), t, 0, 0, 48);
          const used = userTileUsage(t.id);
          const open = !!st['ut' + i];
          return h('details', { open, ontoggle: e => { st['ut' + i] = e.target.open; } },
            h('summary', { style: { cursor: 'pointer', display: 'flex', gap: '8px', alignItems: 'center' } }, prev,
              h('b', {}, t.name || t.id), h('span', { class: 'hint' }, ` ${t.id} · (${t.x || 0}, ${t.y || 0}) · ${t.terrain >= 0 ? '칠하면 ' + ((PDM.TERRAIN_BY_ID[t.terrain] || {}).name || t.terrain) : '지형 그대로'}${t.over ? ' · 캐릭터 위' : ''}${t.gameFx ? ' · ✦ ' + (PDM.GAME_TILE_FX[t.gameFx] || t.gameFx) : ''}${t.fx ? ' · ✦ 이펙트 ' + t.fx : ''}${t.image ? '' : ' · 그림 없음 (지형 그림)'} · ${used.length ? '쓰는 곳 ' + used.length + '군데' : '아직 안 씀'}`)),
            row(F.text('world', [...p, 'name'], { label: '이름', rerender: true }),
              F.select('world', [...p, 'terrain'], [[-2, '칠한 칸의 지형 그대로 (그림만 덮음)'], ...PDM.TERRAIN.map(x => [x.id, `${x.name} (${x.id})`])], { label: '칠할 때 지형 (판정)', number: true, rerender: true }),
              F.select('world', [...p, 'size'], [[8, '8px'], [16, '16px (기본)'], [32, '32px'], [48, '48px'], [64, '64px']], { label: '그림의 한 칸 크기', number: true, rerender: true })),
            row(F.image('world', [...p, 'image'], { label: '그림 (타일셋 · 아무 PNG)', sub: 'tiles', rerender: true }),
              h('div', { class: 'field' }, h('span', { class: 'fl' }, '타일셋에서 고르기'), h('select', { onchange: e => { const v = e.target.value; if (v) store.edit('world', '사용자 타일 그림', w => { w.userTiles[i].image = v; }); } },
                h('option', { value: '' }, '(테마 타일셋 · 물 그림 …)'), themeSheets.map(([v, n]) => h('option', { value: v, selected: v === t.image }, n))))),
            row(F.bool('world', [...p, 'flow'], { label: '물처럼 흐르게 (그림 전체를 이어 붙여 흐름 — 물 그림에)', rerender: true }),
              t.flow ? F.num('world', [...p, 'flowX'], { label: '가로 흐름 (px/초)', step: 1, def: 0 }) : null,
              t.flow ? F.num('world', [...p, 'flowY'], { label: '세로 흐름 (px/초, 게임 물 -5)', step: 1, def: -5 }) : null),
            F.bool('world', [...p, 'over'], { label: '캐릭터 위에 그림 (지붕 · 나뭇가지 · 벽 장식처럼 앞을 가림)', rerender: true }),
            row(F.select('world', [...p, 'gameFx'], PDM.GAME_TILE_FX, { label: '게임 효과 (그 칸에서 계속)', empty: '(없음)', rerender: true }),
              F.select('world', [...p, 'fx'], PDM.ui.refOptions('effect'), { label: '내 이펙트 (이펙트 · 파티클)', empty: '(없음)', rerender: true }),
              h('div', { class: 'field' }, h('span', { class: 'fl' }, ' '), h('button', { class: 'btn sm', onclick: () => PDM.tabs.open('effects') }, '이펙트 편집…'))),
            row(F.text('world', [...p, 'title'], { label: '살펴보기 이름 (비우면 지형 이름)', rerender: true }), F.text('world', [...p, 'desc'], { label: '살펴보기 설명 (비우면 지형 설명)' })),
            t.image && t.flow ? h('p', { class: 'hint' }, '흐르는 그림 — 그림 전체가 칸들에 이음매 없이 이어져 흐릅니다 (가로 · 세로 크기는 16 · 32 · 64 처럼 2의 거듭제곱이 안전 — 게임 물은 32×32). 효과 · 살펴보기 이름도 함께 쓸 수 있습니다.')
              : t.image ? h('div', {}, h('div', { class: 'fl', style: { marginTop: '4px' } }, '칸 고르기 — 그림을 누르세요'), pick)
              : h('p', { class: 'hint' }, '그림 없음 — 게임이 지형(칠할 때 지형)의 원래 그림을 그리고 효과만 더합니다. 위 "그림"에 타일셋 · PNG 를 넣으면 그 칸 그림을 덮습니다.'),
            h('div', { class: 'btnbar', style: { marginTop: '6px' } },
              h('button', { class: 'btn sm', onclick: async () => { const img = await PDM.assets.load(t.image); if (!img) { toast('그림을 먼저 정하세요', 'bad'); return; }
                if (String(t.image).startsWith('game:')) { toast('게임 그림은 여기서 직접 고칠 수 없습니다 — 사용자 테마의 타일셋을 고르거나 PNG 를 만들어 쓰세요', 'bad'); return; }
                const out = await PDM.editPixelsModal('사용자 타일 그림 — ' + (t.name || t.id), t.image, img.width, img.height, z, null, {}); if (out && out !== t.image) store.edit('world', '사용자 타일 그림', w => { w.userTiles[i].image = out; }); PDM.assets.clear(); ctx.refresh(); } }, '✎ 그림 고치기…'),
              h('button', { class: 'btn sm', title: '새 PNG(한 칸)를 만들어 이 타일로', onclick: async () => {
                const rel = `assets/tiles/utile_${t.id}.png`; const out = await PDM.editPixelsModal('새 타일 그림 — ' + (t.name || t.id), rel, z, z, z, null, {});
                if (out) { store.edit('world', '사용자 타일 그림', w => { const o = w.userTiles[i]; o.image = out; o.x = 0; o.y = 0; }); PDM.assets.clear(); ctx.refresh(); } } }, '＋ 새로 그리기…'),
              h('button', { class: 'btn sm', onclick: () => store.edit('world', '사용자 타일 복제', w => { const c = Object.assign(PDM.clone(w.userTiles[i]), { id: PDM.uid('ut'), name: (w.userTiles[i].name || '타일') + ' 사본' }); w.userTiles.splice(i + 1, 0, c); }) }, '복제'),
              h('span', { class: 'hint' }, used.length ? '쓰는 곳: ' + used.join(', ') : '맵 그리기 팔레트 "사용자 타일"에서 골라 칠하세요')));
        } }));
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
      page.append(userTilesSection(ctx, st));
      // ② 게임 그림
      page.append(h('h2', { style: { marginTop: '18px' } }, '게임 테마 타일셋'), head(ctx, st),
        h('p', { class: 'hint' }, '타일셋은 256×256, 한 칸 16px 입니다. 칸 배치는 원본과 같게 두세요. 두 번 클릭 = 고치기.'));
      const body = h('div', {}); page.append(body);
      const show = gr => !st.only || PDM.assets.isOverridden(gr);
      listGame('environment').then(files => {
        if (!files) { body.append(h('div', { class: 'empty' }, '프로젝트 설정에서 게임 저장소 경로를 먼저 지정하세요')); return; }
        const have = new Set(files), known = new Set();
        const cards = [], waters = [];
        Object.values(PDM.THEMES).forEach(t => {
          known.add(t.tiles); known.add(t.water);
          if (have.has(t.tiles) && show(t.tiles)) cards.push(card(t.tiles, t.name + ' 타일셋'));
          if (have.has(t.water) && show(t.water)) waters.push(card(t.water, t.name + ' 물 (32×32, 이어 붙임)'));
        });
        if (cards.length) body.append(grid(cards));
        if (waters.length) body.append(h('h3', {}, '게임 물 그림'), h('p', { class: 'hint' }, '물 칸 아래에 깔려 흐르는 그림 — 고치면 그 테마의 모든 맵 물이 바뀝니다. 한 테마(사용자 테마)만 바꾸려면 위 사용자 테마의 "물 그림"에서.'), grid(waters));
        const rest = files.filter(f => !known.has(f) && show(f));
        if (rest.length) body.append(h('h3', {}, '지형 · 그 밖의 맵 그림'), grid(rest.map(f => card(f, ENV_LABELS[f.split('/').pop()]))));
        if (!body.children.length) body.append(h('div', { class: 'empty' }, st.only ? '아직 바꾼 맵 그림이 없습니다' : '게임 저장소에 environment 그림이 없습니다'));
      });
      return page;
    }
  });
})();
