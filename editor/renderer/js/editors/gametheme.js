// ================================================================
//  게임 UI 테마 편집기 (6차) — 인게임 UI 스프라이트 스킨. theme.json = 어느 chrome.png 조각을 어느 UI 에 쓸지 + 글자 색.
//  스킨 그림 자체 = 프로젝트의 assets/game/interfaces/*.png (「UI 그림」 페이지에서 고침 — 원작 창 · 버튼 · 상태 판 · 도구 모음도 같은 그림).
//  PDMaker 가 더하는 UI(대사창 · 이름표 · 선택지 · 연출 배속 표시줄)도 그 그림의 9조각으로 그려짐. 편집기 자체 색(보기 → 테마)과는 따로.
// ================================================================
(function () {
  const { h } = PDM; const store = PDM.store; const K = 'theme';
  const SCALE = 3;   // 미리보기: 게임 픽셀 1개 = 3px
  /** 비동기로 채우는 칸 (그림을 읽은 뒤) */
  const later = (el, fill) => { fill(el).catch(e => el.replaceChildren(h('span', { class: 'hint' }, '그림을 읽지 못했습니다: ' + e.message))); return el; };

  /** chrome.png 전체 + 조각 자리 (UI 가 쓰는 조각은 강조) */
  function sheet(t) {
    return later(h('div', { class: 'gt-sheet' }, h('span', { class: 'hint' }, 'chrome.png 읽는 중…')), async el => {
      const T = PDM.gameTheme, img = await T.chrome();
      if (!img) { el.replaceChildren(h('span', { class: 'hint' }, 'chrome.png 를 찾지 못했습니다 — 프로젝트 설정에서 게임 저장소 경로를 지정하세요.')); return; }
      const used = new Set(Object.values(t.skin)), k = SCALE;
      const c = h('canvas', { width: img.width * k, height: img.height * k, class: 'gt-sheet-img' }), g = c.getContext('2d');
      g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, img.width * k, img.height * k);
      Object.entries(T.CHROME).forEach(([n, r]) => {
        if (n === 'GREY_BUTTON_TR') return;   // TOAST_TR 과 같은 자리
        g.strokeStyle = used.has(n) || (n === 'TOAST_TR' && used.has('GREY_BUTTON_TR')) ? '#2fd6c4' : 'rgba(255,255,255,.35)';
        g.lineWidth = used.has(n) ? 2 : 1; g.strokeRect(r[0] * k + .5, r[1] * k + .5, r[2] * k - 1, r[3] * k - 1);
      });
      el.replaceChildren(c, h('div', { class: 'gt-cap' }, `${PDM.assets.isOverridden('interfaces/chrome.png') ? '프로젝트가 바꾼 그림' : '원작 그림'} · 청록 테두리 = 지금 PDMaker UI 가 쓰는 조각`));
    });
  }
  /** 조각 하나를 9칸 늘림으로 그린 상자 (게임과 같은 방식) */
  function patchBox(type, w, hgt, inner, extra = {}) {
    const box = h('div', { class: 'gt-patch', style: Object.assign({ minWidth: w + 'px', minHeight: hgt + 'px' }, extra) }, inner);
    PDM.gameTheme.piece(type).then(p => { if (p) Object.assign(box.style, PDM.gameTheme.css(p, SCALE)); });
    return box;
  }
  /** 게임 안 모습 (실제 스프라이트 조각 · 실제 글자 색) */
  function preview(t) {
    const C = t.colors, S = t.skin, sh = { textShadow: `1px 1px 0 ${C.shadow}` };
    const seg = (label, on) => patchBox(on ? S.barBtnOn : S.barBtn, 0, 0, h('span', { style: Object.assign({ color: C.text, borderBottom: on ? `2px solid ${C.text}` : '2px solid transparent' }, sh) }, label), { padding: 0 });
    return h('div', { class: 'gt-prev' },
      h('div', { class: 'gt-row' },
        patchBox(S.name, 0, 0, h('span', { style: Object.assign({ color: C.text }, sh) }, '이름표'))),
      patchBox(S.box, 0, 60, h('div', { style: Object.assign({ color: C.text }, sh) }, '대사창 — 빈 칸 = 테마 ', h('b', { style: { color: C.accent } }, '강조'), ' 글자', h('span', { style: { color: C.accent, float: 'right' } }, '▼'))),
      h('div', { class: 'gt-col' },
        patchBox(S.choice, 0, 0, h('span', { style: Object.assign({ color: C.text }, sh) }, '선택지')),
        patchBox(S.choiceOn, 0, 0, h('span', { style: Object.assign({ color: C.text }, sh) }, '고른 선택지'))),
      patchBox(S.bar, 0, 0, h('div', { class: 'gt-row' }, h('span', { style: Object.assign({ color: C.accent }, sh) }, '2x'), seg('1x'), seg('2x', true), seg('4x'), seg('16x'), seg('스킵')), { marginTop: '8px', display: 'inline-block' }),
      h('div', { class: 'gt-row', style: { marginTop: '8px', flexWrap: 'wrap' } },
        ...[['textDim', '보조'], ['good', '✓ 완료'], ['warn', '! 주의'], ['error', '✕ 모자람']].map(([k, l]) => h('span', { style: Object.assign({ color: C[k] }, sh) }, l))));
  }
  PDM.registerEditor({
    id: 'gametheme', icon: () => '🎨', title: () => '게임 UI 테마',
    match: k => k === K,
    watch: ck => ck === K || ck === 'project',
    tree() { return store.isOpen ? [{ id: 'gametheme', label: '게임 UI 테마', icon: '🎨', order: 4.5, open: K }] : []; },
    render(key, ctx) {
      const { F, section, row } = PDM.ui, T = PDM.gameTheme, t = T.get();
      const has = !store.wasMissing(K);
      const pj = store.get('project') || {};
      const opts = Object.fromEntries(Object.keys(T.CHROME).map(n => [n, `${T.CHROME_NAMES[n] || n} — ${n}`]));
      const skinRow = ([k, label]) => h('div', { class: 'gt-skin' },
        patchBox(t.skin[k], 36, 24, h('span', { style: { color: t.colors.text, fontSize: '11px' } }, 'Aa')),
        F.select(K, ['skin', k], opts, { label, rerender: true }));
      return h('div', { class: 'page' },
        h('h1', {}, '🎨 게임 UI 테마'),
        h('p', { class: 'lead' }, '게임 UI 의 모습은 게임 UI 그림(interfaces/chrome.png · status_pane.png · toolbar.png …)이 정합니다. 원작 창 · 버튼 · 상태 판은 원래 이 그림을 쓰고, PDMaker 가 더하는 대사창 · 이름표 · 선택지 · 연출 배속 표시줄도 같은 chrome.png 의 조각으로 그립니다 — 그림을 바꾸면 모두 함께 바뀝니다.'),
        h('div', { class: 'hstack wrap mb-4' },
          h('button', { class: 'btn sm pri', onclick: () => PDM.tabs.open('uiart') }, '▭ UI 그림 열기 (스킨 그림 고치기 · 바꾸기)'),
          h('button', { class: 'btn sm', onclick: async () => { await PDM.assets.scanOverrides(); PDM.assets.clear(); ctx.refresh(); } }, '↻ 그림 새로 고침')),
        h('p', { class: 'hint' }, '우선순위: UI 요소에 직접 정한 값(대사 한 줄의 강조 색 · 대사창 모양을 직접 고름) → 대사창 설정(빈 칸 = 테마) → 이 테마(쓸 조각 · 글자 색) → 원작. ' + (has ? '' : '이 프로젝트에는 아직 theme.json 이 없어 PDMaker UI 가 예전 모습 그대로입니다 — 아래 값을 고치면 생깁니다.')),
        h('div', { class: 'gt-wrap' }, preview(t), sheet(t)),
        section('PDMaker UI 가 쓸 조각 (chrome.png 의 9칸 늘림 조각)',
          h('div', { class: 'gt-skins' }, ...T.SKIN_UI.map(skinRow)),
          h('p', { class: 'hint' }, '대사창은 대사창 편집기의 "모양"이 빈 칸(게임 UI 스킨)일 때 이 조각을 씁니다. 새 프로젝트는 처음부터 빈 칸입니다.')),
        section('글자 색 (그림으로 정할 수 없는 것만)',
          ...T.TOKENS.reduce((rows, tk, i) => { if (i % 3 === 0) rows.push([]); rows[rows.length - 1].push(tk); return rows; }, [])
            .map(group => row(...group.map(([k, label, desc]) => F.color(K, ['colors', k], { label, hint: desc, rerender: true, def: t.colors[k] })))),
          later(h('div', { class: 'gt-checks' }, h('span', { class: 'hint' }, '대비 재는 중…')), async el => {
            const cs = await T.checks(t), bad = cs.filter(c => !c.ok);
            el.replaceChildren(h('div', { class: 'fl' }, '읽기 쉬운지 (글자 색 ↔ 그 UI 그림 가운데 색)'),
              ...cs.map(c => h('div', { class: 'gt-check ' + (c.ok ? 'c-good' : 'c-warn'), 'data-ok': c.ok ? '1' : '0' }, `${c.ok ? '✓' : '⚠'} ${c.label} ${c.ratio}:1 (권장 ${c.min}:1 이상)`)),
              bad.length ? h('p', { class: 'hint' }, '⚠ 표시된 짝은 글자가 잘 안 보일 수 있습니다 — 글자 색이나 쓸 조각(또는 그림)을 바꿔 보세요. 고른 상태는 색 말고도 밑줄 · 조각으로 표시됩니다.') : null);
          })),
        section('연출 배속 표시줄',
          F.bool('project', ['cutsceneSpeed'], { label: '내보낸 게임에서도 대사 · 이벤트 · 카메라 연출 중에 화면 아래 배속 표시줄 (1x · 2x · 4x · 16x · 스킵)', rerender: true }),
          h('p', { class: 'hint' }, `지금: ${pj.cutsceneSpeed ? '켬' : '끔 (테스트 플레이에서는 늘 보임)'} · 연출이 끝나면 늘 1× 로 돌아갑니다. 예전 프로젝트는 끈 채로 시작합니다.`)));
    }
  });
})();
