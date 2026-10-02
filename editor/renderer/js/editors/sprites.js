// ================================================================
//  그림 관리 — 프로젝트 assets 폴더의 모든 그림을 폴더별로 보고 고칩니다.
//   · 표준 폴더: sprites/heroes · sprites/characters/{npc,companion,monster,boss} · sprites/items · sprites/effects
//                portraits/<캐릭터> · illustrations · tiles · title · ui · game(게임 그림 바꾸기)
//   · 그림마다: 크기 · 쓰는 곳 · 편집(픽셀 편집기) · 바꾸기 · 이동/이름 바꾸기(참조 자동 수정) · 삭제(안 쓰는 것만)
//   · 게임 그림 바꾸기: 게임의 sprites/interfaces/effects/environment/splashes 그림을
//       assets/game/<같은 경로> 로 복사해서 고치면 게임과 에디터 모두 그 그림을 씀 (원래대로 = 삭제)
//   · 자동 정리: 쓰는 곳을 보고 표준 폴더로 옮김 (미리 보기 후 실행)
// ================================================================
(function () {
  const { h } = PDM;
  const store = PDM.store;
  const IMG = /\.(png|jpe?g|gif|webp)$/i;

  const FOLDERS = [
    ['sprites/heroes', '영웅 스프라이트', '🧙'],
    ['sprites/characters/npc', 'NPC', '☺'],
    ['sprites/characters/companion', '동료', '🤝'],
    ['sprites/characters/monster', '몬스터', '👾'],
    ['sprites/characters/boss', '보스', '👑'],
    ['sprites/items', '아이템', '🗡'],
    ['sprites/effects', '효과', '✨'],
    ['portraits', '초상화 (캐릭터별 폴더)', '🖼'],
    ['illustrations', '일러스트 · 이벤트 그림', '🎞'],
    ['tiles', '타일셋', '▦'],
    ['title', '타이틀 화면', '🏰'],
    ['ui', 'UI', '▭']
  ];
  const GAME_DIRS = [['sprites', '캐릭터·아이템 스프라이트'], ['interfaces', '화면·아이콘·타이틀'], ['effects', '효과'], ['environment', '타일·지형'], ['splashes', '직업 선택 그림']];
  const folderLabel = d => { const f = FOLDERS.find(x => x[0] === d); return f ? f[1] : d; };

  // ------------------------------------------------------------ 파일 목록
  async function walk(abs, pre, out, filter) {
    let l = []; try { l = await pdm.list(abs); } catch (_) { return out; }
    for (const e of l.sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.dir) await walk(pdm.join(abs, e.name), pre + e.name + '/', out, filter);
      else if (IMG.test(e.name) && (!filter || filter(pre + e.name))) out.push(pre + e.name);
    }
    return out;
  }
  /** 프로젝트 assets 아래 모든 그림 (assets/... 상대 경로) */
  const projectImages = () => walk(store.abs('assets'), 'assets/', []);

  // ------------------------------------------------------------ 참조 찾기/바꾸기
  function eachString(o, fn, path) {
    if (typeof o === 'string') return fn(o, path);
    if (Array.isArray(o)) o.forEach((v, i) => eachString(v, fn, [...path, i]));
    else if (o && typeof o === 'object') Object.keys(o).forEach(k => eachString(o[k], fn, [...path, k]));
  }
  /** 이 그림을 쓰는 리소스 키 목록 */
  function usesOf(rel) {
    const out = [];
    store.keys().forEach(k => { let hit = false; eachString(store.get(k), s => { if (s === rel) hit = true; }, []); if (hit) out.push(k); });
    return out;
  }
  function usesMap() {
    const m = new Map();
    store.keys().forEach(k => eachString(store.get(k), s => { if (s.startsWith('assets/') && IMG.test(s)) { if (!m.has(s)) m.set(s, new Set()); m.get(s).add(k); } }, []));
    return m;
  }
  function replaceIn(o, from, to) {
    if (Array.isArray(o)) o.forEach((v, i) => { if (v === from) o[i] = to; else replaceIn(v, from, to); });
    else if (o && typeof o === 'object') Object.keys(o).forEach(k => { if (o[k] === from) o[k] = to; else replaceIn(o[k], from, to); });
  }
  function keyName(k) {
    const o = store.get(k) || {};
    const ed = PDM.editorFor(k);
    try { if (ed && ed.title) return ed.title(k); } catch (_) { /* 이름 없음 */ }
    return o.name || k;
  }

  async function uniquePath(rel, taken) {
    const dot = rel.lastIndexOf('.'), base = rel.slice(0, dot), ext = rel.slice(dot);
    let p = rel, n = 2;
    while ((taken && taken.has(p)) || await pdm.exists(store.abs(p))) p = `${base}_${n++}${ext}`;
    return p;
  }
  /** 파일 옮기기 + 모든 리소스의 참조 수정. moves = [[from, to]] */
  async function moveFiles(moves, label) {
    const done = [];
    for (const [a, b] of moves) {
      try { await pdm.copy(store.abs(a), store.abs(b)); await pdm.remove(store.abs(a)); done.push([a, b]); PDM.assets.invalidate(a); PDM.assets.invalidate(b); }
      catch (e) { PDM.log(`옮기기 실패: ${a} → ${b} (${e.message})`, 'err'); }
    }
    if (!done.length) return 0;
    store.transaction(label || '그림 옮기기', () => {
      store.keys().forEach(k => {
        const src = JSON.stringify(store.get(k));
        if (!done.some(([a]) => src.includes(JSON.stringify(a)))) return;
        store.edit(k, label || '그림 옮기기', r => done.forEach(([a, b]) => replaceIn(r, a, b)));
      });
    });
    done.forEach(([a, b]) => PDM.log(`그림 옮김: ${a} → ${b}`, 'ok'));
    await PDM.app.saveAll();     // 파일은 이미 옮겼으므로 참조도 바로 저장
    return done.length;
  }

  // ------------------------------------------------------------ 자동 정리
  function isImg(s) { return typeof s === 'string' && s.startsWith('assets/') && IMG.test(s) && !s.startsWith('assets/game/'); }
  function planOrganize() {
    const plan = new Map();          // from → dir
    const want = (rel, dir) => { if (!isImg(rel) || plan.has(rel)) return; const cur = rel.slice(7, rel.lastIndexOf('/')); if (cur !== dir) plan.set(rel, dir); };
    store.all('hero').forEach(o => want(o.sprite && o.sprite.sheet, 'sprites/heroes'));
    store.keys('char').forEach(k => {
      const o = store.get(k), id = k.slice(5);
      want(o.sprite && o.sprite.sheet, PDM.assets.folderFor(k));
      const p = o.portrait || {};
      want(p.default, `portraits/${id}`);
      (Array.isArray(p.expressions) ? p.expressions.map(e => e.image) : Object.values(p.expressions || {})).forEach(x => want(x, `portraits/${id}`));
    });
    store.all('item').forEach(o => want(o.sprite && o.sprite.png, 'sprites/items'));
    const t = store.get('title') || {};
    eachString(t, s => want(s, 'title'), []);
    eachString(store.get('dialogue'), s => want(s, 'ui'), []);
    ((store.get('world') || {}).customThemes || []).forEach(c => want(c.tiles, 'tiles'));
    store.keys('event').forEach(k => eachString(store.get(k), s => want(s, 'illustrations'), []));
    eachString(store.get('story'), s => want(s, 'illustrations'), []);
    return plan;
  }
  async function autoOrganize() {
    const plan = planOrganize();
    if (!plan.size) { toast('정리할 그림이 없습니다 — 모두 표준 폴더에 있습니다'); return; }
    const taken = new Set(), moves = [];
    for (const [from, dir] of plan) {
      if (!(await pdm.exists(store.abs(from)))) continue;
      const to = await uniquePath(`assets/${dir}/${from.split('/').pop()}`, taken);
      taken.add(to); moves.push([from, to]);
    }
    if (!moves.length) { toast('옮길 파일이 없습니다 (파일이 없는 참조는 검사 창에서 확인)'); return; }
    const tbl = h('table', { class: 'tbl' }, h('tr', {}, h('th', {}, '지금'), h('th', {}, ''), h('th', {}, '옮길 곳')),
      moves.map(([a, b]) => h('tr', {}, h('td', { class: 'mono' }, a), h('td', {}, '→'), h('td', { class: 'mono' }, b))));
    const ok = await PDM.ui.modal(`그림 자동 정리 (${moves.length}개)`, h('div', {},
      h('p', { class: 'hint' }, '쓰는 곳을 보고 표준 폴더로 옮깁니다. 캐릭터·영웅·아이템·초상화·타이틀·타일셋·이벤트 그림의 경로도 함께 고쳐지고 바로 저장됩니다.'),
      h('div', { style: { maxHeight: '55vh', overflow: 'auto' } }, tbl)), [['취소', false], ['옮기기', true, 'pri']]);
    if (!ok) return;
    const n = await moveFiles(moves, '그림 자동 정리');
    toast(`${n}개 그림을 정리했습니다`);
    PDM.tabs.refresh();
  }
  async function makeStandardFolders() {
    for (const [d] of FOLDERS) await pdm.mkdir(store.abs('assets/' + d));
    await pdm.mkdir(store.abs('assets/game'));
    toast('표준 폴더를 만들었습니다');
  }

  // ------------------------------------------------------------ 썸네일
  function thumb(ref, size, o = {}) {
    const cv = h('canvas', { class: 'thumb', width: size, height: size });
    const info = o.info;
    PDM.assets.load(ref).then(img => {
      if (!img) { if (info) info.textContent = '읽기 실패'; return; }
      const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
      const sc = Math.min(size / img.width, size / img.height, img.width < size / 2 ? Math.floor(size / img.width) : 99);
      const w = img.width * sc, hh = img.height * sc;
      g.drawImage(img, (size - w) / 2, (size - hh) / 2, w, hh);
      if (info) info.textContent = `${img.width}×${img.height}`;
    });
    return cv;
  }

  // ------------------------------------------------------------ 프로젝트 그림 카드
  function projectCard(rel, uses, ctx) {
    const info = h('span', { class: 'hint' }, '…');
    const name = rel.split('/').pop();
    const useList = [...(uses || [])];
    const edit = async () => { const out = await PDM.editPixelsModal('그림 편집 — ' + name, rel, 16, 16); if (out) { PDM.assets.invalidate(rel); ctx.refresh(); } };
    const replace = async () => {
      const src = await pdm.openFile('바꿀 그림', ['png', 'jpg', 'jpeg', 'gif', 'webp']); if (!src) return;
      await pdm.copy(src, store.abs(rel)); PDM.assets.invalidate(rel); toast('그림을 바꿨습니다 (경로는 그대로)'); ctx.refresh();
    };
    const move = async () => {
      const to = await PDM.ui.prompt('새 경로 (폴더/이름 바꾸기)', rel, '예: assets/sprites/characters/npc/' + name + ' — 쓰는 곳의 경로도 함께 고칩니다');
      if (!to || to === rel) return;
      if (!to.startsWith('assets/') || !IMG.test(to)) { toast('assets/ 로 시작하는 그림 파일 경로여야 합니다', 'bad'); return; }
      if (await pdm.exists(store.abs(to))) { toast('이미 그 경로에 파일이 있습니다', 'bad'); return; }
      await moveFiles([[rel, to]], '그림 이동'); ctx.refresh();
    };
    const del = async () => {
      if (useList.length) { toast('쓰는 곳이 있어서 지울 수 없습니다', 'bad'); return; }
      if (!(await PDM.ui.confirm(`「${rel}」 파일을 지울까요? (되돌릴 수 없습니다)`))) return;
      await pdm.remove(store.abs(rel)); PDM.assets.invalidate(rel); PDM.log('그림 삭제: ' + rel, 'warn'); ctx.refresh();
    };
    const useEl = useList.length
      ? h('div', { class: 'spr-uses' }, useList.slice(0, 4).map(k => h('a', { onclick: () => PDM.tabs.open(k) }, keyName(k))), useList.length > 4 ? h('span', {}, ` 외 ${useList.length - 4}`) : null)
      : h('div', { class: 'spr-uses none' }, '쓰는 곳 없음');
    return h('div', { class: 'spr-card' },
      h('div', { class: 'spr-img', ondblclick: edit }, thumb(rel, 96, { info })),
      h('div', { class: 'spr-name', title: rel }, name), info, useEl,
      h('div', { class: 'spr-btns' },
        h('button', { class: 'btn xs', onclick: edit, title: '픽셀 편집기로 고치기' }, '편집'),
        h('button', { class: 'btn xs', onclick: replace, title: '다른 파일로 바꾸기 (경로 유지)' }, '바꾸기'),
        h('button', { class: 'btn xs', onclick: move, title: '폴더 옮기기 / 이름 바꾸기' }, '이동'),
        h('button', { class: 'btn xs danger', onclick: del, disabled: useList.length > 0, title: useList.length ? '쓰는 곳이 있어 지울 수 없음' : '삭제' }, '✕')));
  }

  // ------------------------------------------------------------ 게임 그림 바꾸기
  const overrideRel = gr => 'assets/game/' + gr;
  async function editGame(gr, title) {
    const rel = overrideRel(gr);
    if (!PDM.assets.isOverridden(gr)) {
      const src = PDM.assets.gamePath(gr);
      if (!src || !(await pdm.exists(src))) { toast('게임 원본을 찾지 못했습니다 (프로젝트 설정의 게임 저장소 경로)', 'bad'); return false; }
      const img = await PDM.assets.load('game:' + gr);
      const out = await PDM.editPixelsModal(title || ('게임 그림 고치기 — ' + gr), 'game:' + gr, img ? img.width : 16, img ? img.height : 16, 0, rel);
      if (!out) return false;
    } else {
      const out = await PDM.editPixelsModal(title || ('게임 그림 고치기 — ' + gr), rel, 16, 16);
      if (!out) return false;
    }
    await PDM.assets.scanOverrides(); PDM.tabs.refresh();
    PDM.log('게임 그림 바꿈: ' + gr + ' → ' + rel, 'ok');
    return true;
  }
  async function replaceGame(gr) {
    const src = await pdm.openFile('이 게임 그림 대신 쓸 PNG', ['png']); if (!src) return false;
    await pdm.copy(src, store.abs(overrideRel(gr)));
    await PDM.assets.scanOverrides(); PDM.tabs.refresh();
    toast('게임 그림을 바꿨습니다: ' + gr); return true;
  }
  async function resetGame(gr) {
    if (!(await PDM.ui.confirm(`「${gr}」 을 게임 원래 그림으로 되돌릴까요? (프로젝트의 ${overrideRel(gr)} 를 지웁니다)`))) return false;
    await pdm.remove(store.abs(overrideRel(gr)));
    await PDM.assets.scanOverrides(); PDM.tabs.refresh();
    toast('원래 그림으로 되돌렸습니다'); return true;
  }
  /** 게임 그림 한 장 카드 (타이틀 편집기에서도 씀) */
  function gameCard(gr, label) {
    const on = PDM.assets.isOverridden(gr);
    const info = h('span', { class: 'hint' }, '…');
    return h('div', { class: 'spr-card' + (on ? ' over' : '') },
      h('div', { class: 'spr-img', ondblclick: () => editGame(gr) }, thumb('game:' + gr, 96, { info }), on ? h('span', { class: 'spr-badge' }, '바꿈') : null),
      h('div', { class: 'spr-name', title: gr }, label || gr.split('/').pop()), info,
      label ? h('div', { class: 'spr-uses none mono' }, gr) : null,
      h('div', { class: 'spr-btns' },
        h('button', { class: 'btn xs', onclick: () => editGame(gr), title: on ? '바꾼 그림 편집' : '원본을 프로젝트로 복사해서 편집' }, '고치기'),
        h('button', { class: 'btn xs', onclick: () => replaceGame(gr), title: '다른 PNG 로 바꾸기' }, '바꾸기'),
        on ? h('button', { class: 'btn xs danger', onclick: () => resetGame(gr) }, '원래대로') : null));
  }

  // ------------------------------------------------------------ 화면
  function render(key, ctx) {
    const st = ctx.state = ctx.state || { dir: key.includes(':') ? key.slice(8) : '', gameDir: 'interfaces', q: '' };
    const page = h('div', { class: 'page' });
    page.append(h('h1', {}, '🖼 그림 관리'),
      h('p', { class: 'lead' }, '프로젝트의 모든 그림을 폴더별로 봅니다. 두 번 클릭 = 편집. 이동하면 캐릭터·아이템·타이틀 등에서 쓰는 경로도 함께 고쳐집니다.'),
      h('div', { class: 'spr-tools' },
        h('button', { class: 'btn sm pri', onclick: autoOrganize, title: '쓰는 곳을 보고 표준 폴더로 옮김' }, '🧹 자동 정리…'),
        h('button', { class: 'btn sm', onclick: makeStandardFolders }, '표준 폴더 만들기'),
        h('button', { class: 'btn sm', onclick: async () => { await PDM.assets.scanOverrides(); ctx.refresh(); } }, '↻ 새로 고침')));

    const side = h('div', { class: 'spr-side' });
    const main = h('div', { class: 'spr-main' });
    page.append(h('div', { class: 'spr-layout' }, side, main));

    projectImages().then(files => {
      const uses = usesMap();
      const dirOf = f => f.slice(7, f.lastIndexOf('/'));
      const under = (f, d) => dirOf(f) === d || dirOf(f).startsWith(d + '/');
      const count = d => files.filter(f => under(f, d)).length;
      const others = [...new Set(files.map(dirOf).filter(d => d !== 'game' && !d.startsWith('game/') && !FOLDERS.some(([f]) => d === f || d.startsWith(f + '/'))))].sort();
      const item = (d, label, icon, n) => h('div', { class: 'spr-f' + (st.dir === d ? ' on' : ''), onclick: () => { st.dir = d; ctx.refresh(); } },
        h('span', { class: 'ti' }, icon || '📁'), h('span', { class: 'tl' }, label), n != null ? h('span', { class: 'tc' }, n) : null);
      side.append(item('', '모든 그림', '▤', files.filter(f => !f.startsWith('assets/game/')).length));
      side.append(h('div', { class: 'spr-sep' }, '표준 폴더'));
      FOLDERS.forEach(([d, label, icon]) => side.append(item(d, label, icon, count(d))));
      if (others.length) { side.append(h('div', { class: 'spr-sep' }, '그 밖의 폴더')); others.forEach(d => side.append(item(d, d || 'assets', '📁', files.filter(f => dirOf(f) === d).length))); }
      side.append(h('div', { class: 'spr-sep' }, '게임'));
      side.append(item('@game', '게임 그림 바꾸기', '🎮', PDM.assets.overrides.size));
      const unused = files.filter(f => !f.startsWith('assets/game/') && !uses.has(f));
      side.append(item('@unused', '쓰는 곳 없는 그림', '○', unused.length));

      if (st.dir === '@game') { main.append(gamePage(st, ctx)); return; }
      let list = st.dir === '' ? files.filter(f => !f.startsWith('assets/game/'))
        : st.dir === '@unused' ? unused
          : files.filter(f => FOLDERS.some(x => x[0] === st.dir) ? under(f, st.dir) : dirOf(f) === st.dir);
      const q = h('input', { type: 'search', placeholder: '이름으로 찾기', value: st.q, oninput: () => { st.q = q.value; drawGrid(); } });
      const target = st.dir && !st.dir.startsWith('@') ? st.dir : '';
      const add = async () => {
        const dir = target || await PDM.ui.prompt('넣을 폴더 (assets/ 아래)', 'sprites/effects'); if (!dir) return;
        const src = await pdm.openFile('가져올 그림', ['png', 'jpg', 'jpeg', 'gif', 'webp']); if (!src) return;
        const rel = await uniquePath(`assets/${dir}/${pdm.basename(src)}`);
        await pdm.copy(src, store.abs(rel)); toast('가져왔습니다: ' + rel); ctx.refresh();
      };
      const draw = async () => {
        const dir = target || await PDM.ui.prompt('넣을 폴더 (assets/ 아래)', 'sprites/effects'); if (!dir) return;
        const nm = await PDM.ui.prompt('새 그림 이름과 크기', 'new_sprite 16x16', '예: slash 32x32  (이름 가로x세로)'); if (!nm) return;
        const m = nm.trim().match(/^(\S+)(?:\s+(\d+)\s*[x×]\s*(\d+))?$/); if (!m) { toast('형식: 이름 16x16', 'bad'); return; }
        const rel = await uniquePath(`assets/${dir}/${PDM.slugId(m[1]) || 'sprite'}.png`);
        const out = await PDM.editPixelsModal('새 그림 — ' + rel, rel, +(m[2] || 16), +(m[3] || 16)); if (out) ctx.refresh();
      };
      main.append(h('div', { class: 'spr-head' },
        h('b', {}, st.dir === '' ? '모든 그림' : st.dir === '@unused' ? '쓰는 곳 없는 그림' : 'assets/' + st.dir),
        st.dir && !st.dir.startsWith('@') ? h('span', { class: 'hint' }, folderLabel(st.dir)) : null,
        h('span', { style: { flex: 1 } }), q,
        h('button', { class: 'btn sm', onclick: add }, '+ 가져오기'),
        h('button', { class: 'btn sm', onclick: draw }, '✎ 새 그림')));
      const grid = h('div', {});
      main.append(grid);
      function drawGrid() {
        grid.innerHTML = '';
        const l = list.filter(f => !st.q || f.toLowerCase().includes(st.q.toLowerCase()));
        if (!l.length) { grid.append(h('div', { class: 'empty' }, st.q ? '찾는 그림이 없습니다' : '이 폴더에 그림이 없습니다. "+ 가져오기" 또는 "✎ 새 그림"으로 추가하세요.')); return; }
        // 하위 폴더별로 묶음 (초상화는 캐릭터별)
        const groups = new Map();
        l.forEach(f => { const d = dirOf(f); if (!groups.has(d)) groups.set(d, []); groups.get(d).push(f); });
        groups.forEach((fs, d) => {
          if (groups.size > 1 || d !== st.dir) grid.append(h('h3', { class: 'mono' }, 'assets/' + d));
          grid.append(h('div', { class: 'spr-grid' }, fs.map(f => projectCard(f, uses.get(f), ctx))));
        });
      }
      drawGrid();
    });
    return page;
  }

  function gamePage(st, ctx) {
    const wrap = h('div', {});
    wrap.append(h('div', { class: 'spr-head' }, h('b', {}, '게임 그림 바꾸기'),
      h('span', { style: { flex: 1 } }),
      h('select', { onchange: e => { st.gameDir = e.target.value; ctx.refresh(); } }, GAME_DIRS.map(([d, l]) => h('option', { value: d, selected: st.gameDir === d }, `${d}/ — ${l}`)), h('option', { value: '@over', selected: st.gameDir === '@over' }, '바꾼 그림만')),
      (() => { const q = h('input', { type: 'search', placeholder: '이름으로 찾기', value: st.q, oninput: () => { st.q = q.value; clearTimeout(q._t); q._t = setTimeout(() => ctx.refresh(), 300); } }); return q; })()));
    wrap.append(h('p', { class: 'hint' }, '게임 그림을 "고치기" 하면 프로젝트의 assets/game/<같은 경로> 로 복사되어 편집됩니다. 테스트 플레이 때 게임이 원본 대신 이 그림을 씁니다 (타이틀 배경 interfaces/title0~9.png, 아이템 시트 sprites/items.png 등). "원래대로" 는 복사본을 지웁니다.'));
    const grid = h('div', { class: 'spr-grid' }); wrap.append(grid);
    const g = store.gameAssetsDir();
    if (!g) { grid.append(h('div', { class: 'empty' }, '프로젝트 설정에서 게임 저장소 경로를 먼저 지정하세요')); return wrap; }
    const flt = f => !st.q || f.toLowerCase().includes(st.q.toLowerCase());
    const p = st.gameDir === '@over' ? Promise.resolve([...PDM.assets.overrides].sort())
      : walk(pdm.join(g, st.gameDir), st.gameDir + '/', [], f => /\.png$/i.test(f));
    p.then(files => {
      const l = files.filter(flt);
      if (!l.length) { grid.append(h('div', { class: 'empty' }, '그림이 없습니다')); return; }
      l.forEach(f => grid.append(gameCard(f)));
    });
    return wrap;
  }

  PDM.sprites = { gameCard, editGame, replaceGame, resetGame, usesOf, moveFiles, autoOrganize, projectImages, FOLDERS };

  PDM.registerEditor({
    id: 'sprites', icon: '🖼', title: () => '그림 관리',
    match: k => k === 'sprites' || k.startsWith('sprites:'),
    needsResource: false,
    tree: () => store.isOpen ? [{ id: 'sprites', label: '그림 관리', icon: '🖼', open: 'sprites', order: 58 }] : [],
    watch: () => false,
    render
  });
})();
