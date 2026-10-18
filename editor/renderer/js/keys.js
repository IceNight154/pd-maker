// ================================================================
//  단축키 — 동작마다 기본 키 + 사용자가 바꾼 키 (편집 › 단축키 설정…)
//    저장: localStorage "pdm.keys" (PDMaker 전체 설정 — 프로젝트와 상관없음)
//    키 이름은 e.code 로 만들어서 한글 입력 상태에서도 같음 (예: "Ctrl+Shift+S", "F5", "[", "Space")
//    scope: global = 어디서나 (app.js 가 실행) · draw = 맵 편집기 · 스프라이트(픽셀) 편집기 도구
// ================================================================
(function () {
  const { h } = PDM;
  const KEY = 'pdm.keys';
  const ACTIONS = [
    // 파일
    { id: 'newProject', group: '파일', label: '새 프로젝트', def: ['Ctrl+N'], scope: 'global', inInput: true },
    { id: 'openProject', group: '파일', label: '프로젝트 열기', def: ['Ctrl+O'], scope: 'global', inInput: true },
    { id: 'save', group: '파일', label: '저장', def: ['Ctrl+S'], scope: 'global', inInput: true, inModal: true },
    { id: 'saveAs', group: '파일', label: '다른 이름으로 저장', def: ['Ctrl+Shift+S'], scope: 'global', inInput: true },
    { id: 'exportProject', group: '파일', label: '프로젝트 내보내기 (.pdmproj)', def: ['Ctrl+E'], scope: 'global', inInput: true },
    { id: 'exportGame', group: '파일', label: '게임 파일 내보내기', def: ['Ctrl+Shift+E'], scope: 'global', inInput: true },
    // 편집
    { id: 'undo', group: '편집', label: '실행 취소', def: ['Ctrl+Z'], scope: 'global' },
    { id: 'redo', group: '편집', label: '다시 실행', def: ['Ctrl+Y', 'Ctrl+Shift+Z'], scope: 'global' },
    { id: 'copy', group: '편집', label: '복사 (고른 리소스 · 노드 · 오브젝트 · 명령 · 항목)', def: ['Ctrl+C'], scope: 'global' },
    { id: 'cut', group: '편집', label: '잘라내기 (맵 편집기의 고른 영역 · 오브젝트)', def: ['Ctrl+X'], scope: 'global' },
    { id: 'paste', group: '편집', label: '붙여넣기', def: ['Ctrl+V'], scope: 'global' },
    { id: 'keySettings', group: '편집', label: '단축키 설정 열기', def: [], scope: 'global', inInput: true },
    // 보기 · 탭
    { id: 'closeTab', group: '보기', label: '지금 창 닫기 (떠 있는 창 → 없으면 지금 탭, 프로그램은 닫지 않음)', def: ['Ctrl+W'], scope: 'global', inInput: true, inModal: true },
    { id: 'nextTab', group: '보기', label: '다음 탭', def: ['Ctrl+Tab'], scope: 'global', inInput: true },
    { id: 'prevTab', group: '보기', label: '이전 탭', def: ['Ctrl+Shift+Tab'], scope: 'global', inInput: true },
    { id: 'treeSearch', group: '보기', label: '리소스 검색 칸으로', def: ['Ctrl+Shift+F'], scope: 'global', inInput: true },
    { id: 'showLog', group: '보기', label: '출력 창', def: [], scope: 'global', inInput: true },
    { id: 'toggleTree', group: '보기', label: '리소스 패널 보이기/숨기기', def: ['Ctrl+B'], scope: 'global' },
    { id: 'toggleInspector', group: '보기', label: '속성 패널 보이기/숨기기', def: ['Ctrl+Shift+B'], scope: 'global' },
    { id: 'toggleBottom', group: '보기', label: '출력 패널 보이기/숨기기', def: ['Ctrl+J'], scope: 'global' },
    // 프로젝트
    { id: 'playtest', group: '실행', label: '▶ 테스트 플레이', def: ['F5'], scope: 'global', inInput: true },
    { id: 'stopGame', group: '실행', label: '■ 중지', def: ['Shift+F5'], scope: 'global', inInput: true },
    { id: 'check', group: '프로젝트', label: '검사 — 끊어진 참조 · 빠진 그림 · 소리 찾기', def: ['F7'], scope: 'global', inInput: true },
    { id: 'projectSettings', group: '프로젝트', label: '프로젝트 설정 열기', def: [], scope: 'global', inInput: true },
    // 그리기 (맵 편집기 · 스프라이트 편집기 공용)
    { id: 'draw.pen', group: '그리기 (맵 · 스프라이트 편집)', label: '펜 / 브러쉬', def: ['B'], scope: 'draw' },
    { id: 'draw.erase', group: '그리기 (맵 · 스프라이트 편집)', label: '지우개', def: ['E'], scope: 'draw' },
    { id: 'draw.fill', group: '그리기 (맵 · 스프라이트 편집)', label: '채우기', def: ['G'], scope: 'draw' },
    { id: 'draw.pick', group: '그리기 (맵 · 스프라이트 편집)', label: '스포이드', def: ['I'], scope: 'draw' },
    { id: 'draw.select', group: '그리기 (맵 · 스프라이트 편집)', label: '선택', def: ['M'], scope: 'draw' },
    { id: 'draw.lasso', group: '그리기 (맵 · 스프라이트 편집)', label: '올가미 (스프라이트)', def: ['L'], scope: 'draw' },
    { id: 'draw.wand', group: '그리기 (맵 · 스프라이트 편집)', label: '마법봉 (스프라이트)', def: ['W'], scope: 'draw' },
    { id: 'draw.brushDown', group: '그리기 (맵 · 스프라이트 편집)', label: '브러쉬 작게', def: ['['], scope: 'draw' },
    { id: 'draw.brushUp', group: '그리기 (맵 · 스프라이트 편집)', label: '브러쉬 크게', def: [']'], scope: 'draw' },
    { id: 'draw.deselect', group: '그리기 (맵 · 스프라이트 편집)', label: '선택 해제', def: ['Ctrl+D'], scope: 'draw' }
  ];
  // 바꿀 수 없는 키 (참고용으로 창에 보여 줌)
  const FIXED = [
    ['맵 · 스프라이트 편집', 'Space+끌기 = 화면 이동 · Z+끌기 = 확대/축소 · Ctrl+휠 = 확대 · Enter = 화면에 맞춤 · Delete = 고른 것 삭제 · Ctrl+C/X/V/A (스프라이트)'],
    ['맵 편집기 ⇱ 선택', '빈 곳에서 끌기 = 영역 (Alt+끌기 = 오브젝트 위에서도) · Shift/Ctrl+클릭 = 여러 오브젝트 · Ctrl+A = 맵 전체 · Ctrl+C/X/V (붙일 자리를 누름, 오른쪽 클릭 · Esc = 끝) · Delete = 비우기/삭제 · 방향키 = 한 칸 (Shift = 5칸) · Esc = 선택 해제'],
    ['맵 그래프', 'Delete · Ctrl+D 복제 · Ctrl+C/V · Ctrl+A · G 그룹 · F 전체 보기 · 방향키 이동 · Esc'],
    ['어디서나', 'Esc = 창 닫기 · 입력 칸 안의 Ctrl+Z/Y 는 그 칸의 되돌리기']
  ];
  const byId = Object.fromEntries(ACTIONS.map(a => [a.id, a]));
  const runs = {};
  let custom = {};
  try { custom = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { custom = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(custom)); } catch (_) { /* 무시 */ } listeners.forEach(f => { try { f(); } catch (_) { /* 무시 */ } }); };
  const listeners = [];

  const CODE_NAMES = { BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Semicolon: ';', Quote: "'", Backquote: '`',
    Space: 'Space', Enter: 'Enter', NumpadEnter: 'Enter', Escape: 'Esc', Delete: 'Delete', Backspace: 'Backspace', Tab: 'Tab', Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
  /** 키 이벤트 → "Ctrl+Shift+S" (수정 키만 눌렀으면 null) */
  function combo(e) {
    const c = e.code || '';
    let k = null, m;
    if ((m = /^Key([A-Z])$/.exec(c))) k = m[1];
    else if ((m = /^(?:Digit|Numpad)(\d)$/.exec(c))) k = m[1];
    else if (/^F\d{1,2}$/.test(c)) k = c;
    else if (CODE_NAMES[c]) k = CODE_NAMES[c];
    else if (!c && e.key && e.key.length === 1) k = e.key.toUpperCase();
    if (!k) return null;
    return [(e.ctrlKey || e.metaKey) && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', k].filter(Boolean).join('+');
  }
  const get = id => (custom[id] !== undefined ? custom[id] : (byId[id] || {}).def) || [];
  const label = id => get(id)[0] || '';
  const is = (e, id) => { const c = combo(e); return !!c && get(id).includes(c); };
  /** 이 이벤트에 맞는 동작 id (scope 안에서) */
  function match(e, scope) { const c = combo(e); if (!c) return null; const a = ACTIONS.find(x => (!scope || x.scope === scope) && get(x.id).includes(c)); return a ? a.id : null; }
  /** 그리기 도구 이름 (draw.<이름>) — names 중에서 */
  function tool(e, names) { const c = combo(e); if (!c) return null; return names.find(n => get('draw.' + n).includes(c)) || null; }
  function define(id, run) { runs[id] = run; }
  /** 전역 단축키 처리 (app.js keydown). typing = 입력 칸에 있음 */
  function handle(e, typing) {
    if (capturing || e.defaultPrevented) return false;   // 편집기가 먼저 처리한 키 (스프라이트 편집기의 복사 등)
    const id = match(e, 'global'); if (!id) return false;
    const a = byId[id];
    if (typing && !a.inInput) return false;
    if (PDM.ui.modalOpen && !a.inModal) return false;   // 창이 떠 있을 때는 창 닫기 · 저장만
    if (!runs[id]) return false;
    if (runs[id](e) === false) return false;   // false = 처리하지 않음 (예: 글을 드래그해 고른 채 Ctrl+C → 브라우저 복사)
    e.preventDefault(); return true;
  }

  // ---------------- 설정 창 ----------------
  let capturing = null;
  function dialog() {
    const body = h('div', { class: 'keys-dlg' });
    const draw = () => {
      body.replaceChildren(
        h('p', { class: 'hint' }, '키 칸을 누르고 원하는 키를 누르면 바뀝니다 (Esc = 취소). 한 동작에 키를 여러 개 둘 수 있습니다. 바꾼 키는 이 PC 의 PDMaker 전체에 적용됩니다.'),
        h('div', { class: 'btnbar' }, h('button', { class: 'btn sm', onclick: async () => { if (await PDM.ui.confirm('모든 단축키를 기본값으로 되돌릴까요?')) { custom = {}; save(); draw(); } } }, '↺ 모두 기본값으로'),
          h('span', { class: 'hint' }, `바꾼 동작 ${Object.keys(custom).length}개`)),
        ...[...new Set(ACTIONS.map(a => a.group))].map(g => h('div', { class: 'keys-grp' }, h('div', { class: 'fl' }, g),
          ...ACTIONS.filter(a => a.group === g).map(a => {
            const ks = get(a.id), changed = custom[a.id] !== undefined;
            return h('div', { class: 'keys-row' + (changed ? ' changed' : '') },
              h('span', { class: 'keys-label' }, a.label),
              h('span', { class: 'keys-chips' },
                ...ks.map((k, i) => h('span', { class: 'kbd-chip' }, h('kbd', {}, k), h('button', { class: 'ib danger', title: '이 키 빼기', onclick: () => { custom[a.id] = ks.filter((_, j) => j !== i); save(); draw(); } }, '✕'))),
                capturing === a.id ? h('span', { class: 'kbd-chip wait' }, '키를 누르세요… (Esc 취소)') : h('button', { class: 'btn xs', onclick: () => { capturing = a.id; draw(); } }, ks.length ? '+ 키 추가' : '+ 키 지정')),
              changed ? h('button', { class: 'btn xs', title: '기본값: ' + (a.def.join(', ') || '없음'), onclick: () => { delete custom[a.id]; save(); draw(); } }, '↺ 기본') : h('span', { class: 'keys-def hint' }, ''));
          }))),
        h('div', { class: 'keys-grp' }, h('div', { class: 'fl' }, '바꿀 수 없는 키 (참고)'), ...FIXED.map(([t, s]) => h('div', { class: 'keys-row' }, h('span', { class: 'keys-label' }, t), h('span', { class: 'hint' }, s)))));
    };
    const onKey = async e => {
      if (!capturing) return;
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Escape') { capturing = null; draw(); return; }
      const c = combo(e); if (!c) return;   // 수정 키만 누름 — 계속 기다림
      const id = capturing, a = byId[id];
      const other = ACTIONS.find(x => x.id !== id && x.scope === a.scope && get(x.id).includes(c));
      capturing = null;
      if (other && !(await PDM.ui.confirm(`${c} 는 이미 「${other.label}」 에 쓰고 있습니다. 그 동작에서 빼고 「${a.label}」 에 줄까요?`))) { draw(); return; }
      if (other) custom[other.id] = get(other.id).filter(k => k !== c);
      if (!get(id).includes(c)) custom[id] = [...get(id), c];
      save(); draw();
    };
    addEventListener('keydown', onKey, true);
    draw();
    return PDM.ui.modal('단축키 설정', body, [['닫기', null, 'pri']]).finally(() => { capturing = null; removeEventListener('keydown', onKey, true); });
  }

  PDM.keys = { ACTIONS, combo, get, label, is, match, tool, define, handle, dialog, onChange: f => listeners.push(f), get capturing() { return capturing; } };
})();
