// ================================================================
//  게임 UI 테마 편집기 (6차) — theme.json. PDMaker 가 게임에 더하는 UI(대사창 · 선택지 · 배속 표시줄 · 마음 · 퀘스트 · 업적 ·
//  상점 · 주문 · 특성 · 영웅 선택 · PDMaker 가 띄우는 확인 창)의 공통 색 · 모양. 편집기 자체 색(보기 → 테마)과는 따로.
// ================================================================
(function () {
  const { h } = PDM; const store = PDM.store; const K = 'theme';
  /** 게임 안 UI 를 흉내 낸 미리보기 (실제 그림은 테스트 플레이 — 색 · 대비 · 고른 표시 확인용) */
  function preview(t) {
    const C = t.colors, r = t.shape === 'square' ? 0 : t.shape === 'game' ? 2 : t.radius * 2;
    const box = (bg, extra = {}) => Object.assign({ background: bg, border: `2px solid ${C.border}`, borderRadius: r + 'px', padding: (t.padding * 2) + 'px' }, extra);
    const btn = (label, on, dis) => h('span', { class: 'gt-btn', style: { background: dis ? C.disabled : on ? C.buttonOn : C.button, color: dis ? C.textDim : C.text, borderRadius: Math.min(r, 4) + 'px', boxShadow: on ? `inset 0 -2px 0 ${C.text}` : 'none' }, 'aria-pressed': on ? 'true' : 'false' }, label);
    return h('div', { class: 'gt-prev', style: { background: C.bg, fontSize: (12 * t.fontScale) + 'px' } },
      h('div', { style: box(C.panel) },
        h('div', { style: { color: C.accent, fontWeight: 700, marginBottom: '4px' } }, '퀘스트 · 상점 창 제목'),
        h('div', { style: { color: C.text } }, '본문 글자 — ', h('b', { style: { color: C.accent } }, '강조'), ' 와 ', h('span', { style: { color: C.textDim } }, '보조 설명')),
        h('div', { style: { margin: '6px 0', display: 'flex', gap: '6px', flexWrap: 'wrap' } }, h('span', { style: { color: C.good } }, '✓ 완료'), h('span', { style: { color: C.warn } }, '! 주의'), h('span', { style: { color: C.error } }, '✕ 돈이 모자람')),
        h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } }, btn('버튼', false), btn('고른 버튼', true), btn('잠김', false, true))),
      h('div', { class: 'gt-bar', style: { background: C.panel } }, h('span', { style: { color: C.accent } }, '▶ 2x'), btn('1x', false), btn('2x', true), btn('4x', false), btn('16x', false), btn('스킵', false)),
      h('div', { style: box(C.panel, { marginTop: '8px' }) }, h('div', { style: { color: C.text } }, '대사창 (빈 칸 = 테마) — ', h('span', { style: { color: C.accent } }, '**강조**'), ' ▼')));
  }
  PDM.registerEditor({
    id: 'gametheme', icon: () => '🎨', title: () => '게임 UI 테마',
    match: k => k === K,
    watch: ck => ck === K || ck === 'project',
    tree() { return store.isOpen ? [{ id: 'gametheme', label: '게임 UI 테마', icon: '🎨', order: 4.5, open: K }] : []; },
    render() {
      const { F, section, row } = PDM.ui, T = PDM.gameTheme, t = T.get(), raw = store.get(K);
      const has = !store.wasMissing(K) && !!(raw && raw.colors);   // 파일이 있거나 이번에 고침
      const presetBtn = id => h('button', { class: 'btn sm', onclick: async e => { e.preventDefault(); const p = T.preset(id); if (await PDM.ui.confirm(`게임 UI 테마를 "${p.name}" 으로 바꿀까요? (되돌리기로 복구할 수 있습니다)`)) store.edit(K, '게임 UI 테마: ' + p.name, o => { Object.keys(o).forEach(k => delete o[k]); Object.assign(o, p); }); } }, T.PRESETS[id][0]);
      const checks = T.checks(t), bad = checks.filter(c => !c.ok);
      const pj = store.get('project') || {};
      return h('div', { class: 'page' },
        h('h1', {}, '🎨 게임 UI 테마'),
        h('p', { class: 'lead' }, 'PDMaker 가 게임에 더하는 UI(대사창 · 선택지 · 연출 배속 표시줄 · 마음 · 퀘스트 · 업적 · 상점 · 주문 · 특성 · 영웅 선택 · 확인 창)가 함께 쓰는 색과 모양입니다. 편집기 자체의 색(보기 → 테마)과는 따로입니다.'),
        h('p', { class: 'hint' }, '우선순위: UI 요소에 직접 정한 값(예: 대사 한 줄의 강조 색) → 그 UI 설정(대사창 편집기 — 빈 칸 = 테마) → 이 테마 → 기본값(원작 모습). ' + (has ? '' : '이 프로젝트에는 아직 테마 파일이 없어 원작 모습 그대로입니다 — 아래 값을 고치면 theme.json 이 생깁니다.')),
        h('div', { class: 'hstack wrap mb-4' }, h('span', { class: 'hint' }, '빠른 시작:'), ...Object.keys(T.PRESETS).map(presetBtn)),
        h('div', { class: 'gt-wrap' }, preview(t),
          h('div', { class: 'gt-checks' }, h('div', { class: 'fl' }, '읽기 쉬운지 (대비)'),
            ...checks.map(c => h('div', { class: 'gt-check ' + (c.ok ? 'c-good' : 'c-warn') }, `${c.ok ? '✓' : '⚠'} ${c.label} ${c.ratio}:1 (권장 ${c.min}:1 이상)`)),
            bad.length ? h('p', { class: 'hint' }, '⚠ 표시된 짝은 글자가 잘 안 보일 수 있습니다. 고른 상태는 색 말고도 아래 줄로 표시됩니다.') : null)),
        section('색',
          ...T.TOKENS.reduce((rows, tk, i) => { if (i % 3 === 0) rows.push([]); rows[rows.length - 1].push(tk); return rows; }, [])
            .map(group => row(...group.map(([k, label, desc]) => F.color(K, ['colors', k], { label, hint: desc, rerender: true, def: t.colors[k] }))))),
        section('모양 · 크기',
          row(F.select(K, ['shape'], { game: '원작 창 테두리', round: '둥근 상자', square: '각진 상자' }, { label: '모양 (대사창이 테마를 따를 때)', rerender: true }),
            F.num(K, ['radius'], { label: '둥근 정도 (px, 둥근 상자)', int: true, min: 0, max: 12, def: 3, rerender: true }),
            F.num(K, ['padding'], { label: '기본 여백 (px)', int: true, min: 0, max: 24, def: 4, rerender: true }),
            F.num(K, ['fontScale'], { label: '글자 크기 배율 (미리보기 · 문서용 — 게임 글자 크기는 각 UI 설정)', step: 0.1, min: 0.5, max: 2, def: 1, rerender: true })),
          h('p', { class: 'hint' }, 'UI 크기(배율)는 게임 설정의 "화면 배율 · 인터페이스 크기"를 따릅니다 (테마가 바꾸지 않음). 원작이 직접 띄우는 창(가방 · 설정 · 원작 대화 상자)은 원작 그림(interfaces/chrome.png — 그림 관리에서 바꿀 수 있음)을 씁니다.')),
        section('연출 배속 표시줄',
          F.bool('project', ['cutsceneSpeed'], { label: '내보낸 게임에서도 대사 · 이벤트 · 카메라 연출 중에 화면 아래 배속 표시줄 (1x · 2x · 4x · 16x · 스킵)', rerender: true }),
          h('p', { class: 'hint' }, `지금: ${pj.cutsceneSpeed ? '켬' : '끔 (테스트 플레이에서는 늘 보임)'} · 연출이 끝나면 늘 1× 로 돌아갑니다. 예전 프로젝트는 끈 채로 시작합니다.`)));
    }
  });
})();
