// ================================================================
//  업적 (배지) — 기본 기능
//    ① 게임 원래 배지: 게임 저장소의 Badges.java 에서 목록(이름 · 그림 칸 · 종류)을 읽고, 이름 · 설명은 messages 에서 읽어 실제 내용을 보여 줌.
//       이름 · 설명을 고치면 게임 텍스트(texts.json 의 "*")에 들어가고, 그림은 interfaces/badges.png 를 고침.
//       얻는 조건: 게임 코드(Badges.java)의 실제 조건 줄을 보여 주고, badges.json 의 orig { 이름: { mode: off | custom, trigger, cond } } 로 끄거나 내 조건식으로 바꿈 (런타임 MakerBadges.blocked / giveOrig)
//    ② 내 배지: badges.json { list: [ { id, name, desc, icon(배지 시트 칸 번호), trigger, cond, event, hidden } ] } — 런타임 MakerBadges
//       이벤트 명령 "배지 주기" · "배지 목록 창 열기", 조건식 badge.<id>
// ================================================================
(function () {
  const { h, store, toast } = PDM;
  const K = 'badges';
  let SHEET = 'interfaces/badges.png', SHEET_REL = 'assets/game/interfaces/badges.png';   // 10차: 저장소의 Assets.Interfaces.BADGES
  let GEO = { cell: 16, cols: 8, textKeys: 'title-desc' };   // 10차: 칸 크기 · 한 줄 칸 수는 저장소에서 (BadgeBanner · 시트 너비) — ARK 는 한 줄 16칸
  const COLS_ = () => GEO.cols, CELL = () => GEO.cell;
  const list = () => (store.get(K) || {}).list || [];
  const TRIGGERS = { manual: '이벤트 명령 "배지 주기"로만', floorEnter: '층(맵)에 들어올 때 조건 검사', mobKilled: '몬스터를 처치했을 때 조건 검사', itemPickup: '아이템을 주웠을 때 조건 검사', turn: '매 턴 조건 검사' };
  const TYPES = { LOCAL: '한 판 안에서 얻음', GLOBAL: '여러 판에 걸쳐', JOURNAL: '도감 · 기록', HIDDEN: '숨김 (기록용)' };
  function make(id) { return { id, name: '새 배지', desc: '', icon: 0, image: '', trigger: 'manual', cond: '', event: '', hidden: false }; }
  const ops = PDM.listOps({ K, label: '배지', title: '업적 (배지)', icon: '🏅', prefix: 'badge', make, cmdType: 'badge', cmdKey: 'id' });

  // ---------------- 게임 원래 배지 읽기
  let cache = { repo: '', rows: null };
  let stats = [{ name: 'enemiesSlain' }, { name: 'goldCollected' }, { name: 'deepestFloor' }, { name: 'foodEaten' }, { name: 'itemsCrafted' }];
  const STAT_KO = { goldCollected: '모은 금화', deepestFloor: '가장 깊이 내려간 층', highestAscent: '가장 높이 올라온 층', enemiesSlain: '처치한 몬스터 수', foodEaten: '먹은 음식 수', itemsCrafted: '연금술로 만든 아이템 수', piranhasKilled: '처치한 피라냐 수', hazardAssistedKills: '함정 · 지형으로 처치한 수', ankhsUsed: '쓴 앙크 수', upgradesUsed: '쓴 강화의 주문서 수', sneakAttacks: '기습 공격 횟수', thrownAttacks: '투척 공격 횟수', spawnersAlive: '살아 있는 악마 소환기 수', duration: '지난 시간(턴)', totalScore: '총 점수', progressScore: '진행 점수', treasureScore: '보물 점수', exploreScore: '탐험 점수', totalBossScore: '보스 점수', totalQuestScore: '퀘스트 점수', heldItemValue: '가진 아이템 가치', amuletObtained: '아뮬렛을 얻음', gameWon: '게임 승리', ascended: '지상으로 올라옴', completedWithNoKilling: '아무도 죽이지 않고 층 통과', qualifiedForNoKilling: '이번 층에서 아직 아무도 안 죽임', qualifiedForBossChallengeBadge: '보스 도전 조건 유지 중', qualifiedForBossRemainsBadge: '유해 영웅으로 보스 조건 유지 중', qualifiedForRandomVictoryBadge: '무작위 영웅 승리 조건 유지 중' };

  // ---------------- 조건식 만들기: 목록에서 고르거나 직접 입력
  /** 고를 수 있는 조건 대상 [그룹, [[이름, 표시, 참/거짓형]]] */
  function targets() {
    const st = store.get('story') || {}, items = (store.keysOf ? store.keysOf('item') : []) || [];
    const g = [
      ['영웅 · 진행', [['hero.lvl', '영웅 레벨'], ['hero.str', '영웅 힘'], ['hero.hp', '영웅 체력'], ['hero.maxhp', '영웅 최대 체력'], ['hero.hp%', '영웅 체력 %'], ['gold', '가진 금화'], ['depth', '현재 층'], ['turns', '이번 판 턴 수']]],
      ['게임 통계 (이번 판)', stats.map(x => ['stat.' + x.name, (STAT_KO[x.name] || x.name), !!x.bool])],
      ['스위치', (st.switches || []).map(x => ['switch.' + x.id, x.name || x.id, true])],
      ['변수', (st.variables || []).map(x => ['var.' + x.id, x.name || x.id, x.type === 'bool'])],
      ['내 배지를 얻었는지', list().map(x => ['badge.' + x.id, x.name || x.id, true])],
      ['게임 원래 배지를 얻었는지', (cache.rows || []).map(x => ['badge.' + x.name, x.title || x.name, true])],
      ['가진 아이템 개수', items.map(k => { const id = String(k).split(':').pop(); return ['item.' + id, ((store.get(k) || {}).name || id)]; })]
    ];
    return g.filter(x => x[1].length);
  }
  const CMP = { '>=': '이상 (≥)', '>': '초과 (>)', '==': '같음 (=)', '!=': '다름 (≠)', '<=': '이하 (≤)', '<': '미만 (<)' };
  /** 식 → { join, terms:[{name, op, val}] } · 단순한 식(같은 연결자, 괄호 없음)만. 안 되면 null */
  function parseCond(text) {
    const t = String(text || '').trim(); if (!t) return { join: '&&', terms: [] };
    if (/[()]/.test(t) || (t.includes('&&') && t.includes('||'))) return null;
    const join = t.includes('||') ? '||' : '&&', terms = [];
    for (const part of t.split(join)) {
      const m = /^\s*(!?)\s*([A-Za-z_][\w.:%]*)\s*(?:(>=|<=|==|!=|>|<)\s*(-?[\w.]+|"[^"]*"|'[^']*'))?\s*$/.exec(part); if (!m) return null;
      if (m[1] && m[3]) return null;
      terms.push(m[3] ? { name: m[2], op: m[3], val: m[4] } : { name: m[2], op: m[1] ? 'false' : 'true', val: '' });
    }
    return { join, terms };
  }
  const buildCond = c => c.terms.filter(x => x.name).map(x => x.op === 'true' ? x.name : x.op === 'false' ? '!' + x.name : `${x.name}${x.op}${x.val === '' ? 0 : x.val}`).join(` ${c.join} `);
  /** 조건 편집 칸: 위 = 고르는 줄들, 아래 = 식 직접 입력 (서로 맞춰짐) */
  function condEditor(value, onChange, o = {}) {
    const wrap = h('div', { class: 'cond-ed', style: { display: 'grid', gap: '4px' } });
    const txt = h('input', { type: 'text', class: 'mono', value: value || '', placeholder: o.placeholder || '직접 입력 — 예: stat.enemiesSlain>=30 && hero.lvl>=10', title: '조건식 직접 입력 (&& = 그리고, || = 또는, ! = 아님, 괄호 가능)' });
    const msg = h('small', { class: 'hint' }), rowsEl = h('div', { style: { display: 'grid', gap: '3px' } });
    const tg = targets(), flat = new Map(tg.flatMap(x => x[1]).map(x => [x[0], x]));
    let cur = parseCond(value);
    const commit = v => { txt.value = v; check(); onChange(v); };
    const check = () => { const e = PDM.Cond && PDM.Cond.check ? PDM.Cond.check(txt.value) : ''; msg.textContent = e ? '⚠ ' + e : (cur ? '' : '괄호나 &&·|| 를 섞은 식이라 아래 칸에서 직접 고칩니다.'); msg.classList.toggle('bad', !!e); };
    const draw = () => {
      rowsEl.innerHTML = '';
      if (!cur) return;
      cur.terms.forEach((t, i) => {
        const known = flat.get(t.name), bool = known ? !!known[2] : (t.op === 'true' || t.op === 'false');
        const ts = h('select', { style: { flex: '2 1 150px', minWidth: 0 } }, h('option', { value: '' }, '(대상 고르기)'), ...tg.map(([gn, arr]) => h('optgroup', { label: gn }, ...arr.map(a => h('option', { value: a[0], selected: a[0] === t.name }, `${a[1]}  —  ${a[0]}`)))), !known && t.name ? h('option', { value: t.name, selected: true }, t.name) : null);
        ts.onchange = () => { t.name = ts.value; const k = flat.get(t.name); if (k && k[2]) { if (t.op !== 'false') t.op = 'true'; t.val = ''; } else if (t.op === 'true' || t.op === 'false') { t.op = '>='; t.val = '1'; } draw(); commit(buildCond(cur)); };
        const os = h('select', { style: { flex: '1 1 90px', minWidth: 0 } }, ...(bool ? [['true', '맞음 (참)'], ['false', '아님 (거짓)']] : Object.entries(CMP)).map(([k, v]) => h('option', { value: k, selected: k === t.op }, v)));
        os.onchange = () => { t.op = os.value; commit(buildCond(cur)); };
        const vi = bool ? null : h('input', { type: 'text', value: t.val, style: { flex: '1 1 60px', minWidth: 0, width: '60px' }, placeholder: '값' });
        if (vi) vi.onchange = () => { t.val = vi.value.trim(); commit(buildCond(cur)); };
        rowsEl.append(h('div', { style: { display: 'flex', gap: '3px', alignItems: 'center' } }, ts, os, vi, h('button', { class: 'btn xs', title: '이 조건 빼기', onclick: e => { e.preventDefault(); cur.terms.splice(i, 1); draw(); commit(buildCond(cur)); } }, '×')));
      });
      const js = h('select', { title: '조건이 여러 개일 때' }, h('option', { value: '&&', selected: cur.join === '&&' }, '모두 만족 (그리고)'), h('option', { value: '||', selected: cur.join === '||' }, '하나라도 만족 (또는)'));
      js.onchange = () => { cur.join = js.value; commit(buildCond(cur)); };
      rowsEl.append(h('div', { class: 'hstack gap-2' }, h('button', { class: 'btn xs add', onclick: e => { e.preventDefault(); cur.terms.push({ name: '', op: '>=', val: '1' }); draw(); } }, '+ 조건 고르기'), cur.terms.length > 1 ? js : null,
        o.suggest ? h('button', { class: 'btn xs', title: '게임 원래 조건: ' + o.suggest, onclick: e => { e.preventDefault(); cur = parseCond(o.suggest); draw(); commit(o.suggest); } }, '게임 원래 조건 넣기') : null));
    };
    txt.addEventListener('input', check);
    txt.addEventListener('change', () => { const v = txt.value.trim(); cur = parseCond(v); draw(); commit(v); });
    draw(); check();
    wrap.append(rowsEl, txt, msg);
    return wrap;
  }

  // ---------------- 배지 그림: 칸 하나 편집 · 다른 이름으로 저장 · 불러오기
  const loadImg = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; });
  async function askPath(def) {
    let out = (await PDM.ui.prompt('다른 이름으로 저장 — 프로젝트 안의 경로', def, '배지 그림 시트는 그대로 두고, 이 배지 그림만 새 PNG 파일(16×16)로 저장합니다.') || '').trim().replace(/\\/g, '/');
    if (!out) return null;
    if (/^([A-Za-z]:|\/|\.\.)/.test(out) || out.startsWith('game:')) { toast('프로젝트 폴더 안의 경로를 적어 주세요 (예: assets/sprites/badges/…)', 'bad'); return null; }
    if (!/\.png$/i.test(out)) out += '.png';
    try { if (await pdm.exists(store.abs(out)) && !(await PDM.ui.confirm(`「${out}」 파일이 이미 있습니다. 덮어쓸까요?`))) return null; } catch (_) { /* 확인 못 함 */ }
    return out;
  }
  /** 시트의 칸 하나를 그림 편집기로 고침. 저장 = 시트의 그 칸에 씀, 다른 이름으로 저장 = 새 파일 (경로를 돌려줌) */
  async function editCell(idx, title, defName) {
    const im = await PDM.assets.load('game:' + SHEET).catch(() => null); if (!im) { toast('배지 그림 시트를 읽을 수 없습니다 (게임 저장소 연결 확인)', 'bad'); return null; }
    const sx = (idx % GEO.cols) * GEO.cell, sy = Math.floor(idx / GEO.cols) * GEO.cell;
    const one = h('canvas', { width: GEO.cell, height: GEO.cell }); one.getContext('2d').drawImage(im, sx, sy, GEO.cell, GEO.cell, 0, 0, GEO.cell, GEO.cell);
    let result = null, asPath = null;
    const ed = PDM.pixelEditor({ width: GEO.cell, height: GEO.cell, src: one.toDataURL('image/png'), scale: 20,
      onSave: d => { result = d; PDM.$('.modal-foot .pri').click(); },
      onSaveAs: async d => { const out = await askPath(`assets/sprites/badges/${defName || 'badge_' + idx}.png`); if (!out) return; asPath = out; result = d; PDM.$('.modal-foot .pri').click(); } });
    const ok = await PDM.ui.modal(title, h('div', {}, ed, h('p', { class: 'hint' }, `저장 = 배지 그림 시트의 ${idx}번 칸을 고침 (이 칸을 쓰는 모든 배지에 적용) · 다른 이름으로 저장 = 시트는 그대로 두고 새 파일로`)), [['취소', false], ['저장', () => true, 'pri']]);
    if (!ok) return null;
    const data = result || ed.toDataURL();
    try {
      if (asPath) { await pdm.writeDataURL(store.abs(asPath), data); PDM.assets.invalidate(asPath); PDM.log('배지 그림 저장: ' + asPath, 'ok'); return { file: asPath }; }
      const cell = await loadImg(data), all = h('canvas', { width: im.width, height: im.height }), g = all.getContext('2d');
      g.drawImage(im, 0, 0); g.clearRect(sx, sy, GEO.cell, GEO.cell); g.drawImage(cell, 0, 0, cell.width, cell.height, sx, sy, GEO.cell, GEO.cell);
      await pdm.writeDataURL(store.abs(SHEET_REL), all.toDataURL('image/png'));
      PDM.assets.invalidate('game:' + SHEET); PDM.assets.invalidate(SHEET_REL); await PDM.assets.scanOverrides();
      PDM.log(`배지 그림 시트 ${idx}번 칸 저장 → ${SHEET_REL}`, 'ok');
      return { sheet: true };
    } catch (err) { toast('저장 실패: ' + err.message, 'bad'); return null; }
  }
  /** PNG 파일을 시트의 칸에 넣기 */
  async function importCell(idx) {
    const f = await PDM.ui.pickImage('sprites/badges'); if (!f) return false;
    const im = await PDM.assets.load('game:' + SHEET).catch(() => null), src = await PDM.assets.load(f).catch(() => null); if (!im || !src) { toast('그림을 읽을 수 없습니다', 'bad'); return false; }
    const sx = (idx % GEO.cols) * GEO.cell, sy = Math.floor(idx / GEO.cols) * GEO.cell, all = h('canvas', { width: im.width, height: im.height }), g = all.getContext('2d');
    g.imageSmoothingEnabled = false; g.drawImage(im, 0, 0); g.clearRect(sx, sy, GEO.cell, GEO.cell); g.drawImage(src, 0, 0, src.width, src.height, sx, sy, GEO.cell, GEO.cell);
    await pdm.writeDataURL(store.abs(SHEET_REL), all.toDataURL('image/png'));
    PDM.assets.invalidate('game:' + SHEET); PDM.assets.invalidate(SHEET_REL); await PDM.assets.scanOverrides();
    return true;
  }
  const fileCv = (ref, size) => { const c = h('canvas', { width: size, height: size, class: 'pixelated flex-none' });
    PDM.assets.load(ref).then(im => { if (!im) return; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(im, 0, 0, im.width, im.height, 0, 0, size, size); }).catch(() => { }); return c; };
  /** 게임 원래 배지 — 10차: javasrc.badges (분석기와 같은 규칙) — 들여쓰기 · 글자 키 형식(.title/.desc 또는 한 줄) · 시트 칸 수를 저장소에서 읽음.
   *  그림 · 이름 · 조건을 못 읽은 배지도 목록에서 빼지 않음 (r.noImage · r.nameSource 'none' · r.condParsed false) */
  async function scan() {
    const repo = await PDM.app.resolveRepo(true);
    if (cache.repo === repo && cache.rows) return cache.rows;
    const rows = [];
    try {
      const base = pdm.join(repo, 'core', 'src', 'main', 'java', 'com', 'shatteredpixel', 'shatteredpixeldungeon');
      const rd = async rel => { try { return await pdm.readText(pdm.join(base, ...rel.split('/'))); } catch (_) { return ''; } };
      const [src, banner, assetsSrc, statSrc] = await Promise.all(['Badges.java', 'effects/BadgeBanner.java', 'Assets.java', 'Statistics.java'].map(rd));
      if (!src) throw new Error('Badges.java 없음');
      const JSRC = window.PDMJava, sheetRel = (JSRC.assets(assetsSrc).map['Interfaces.BADGES']) || 'interfaces/badges.png';
      SHEET = sheetRel; SHEET_REL = 'assets/game/' + sheetRel;
      const im = await PDM.assets.load('game:' + sheetRel).catch(() => null);
      const T = PDM.gameTexts, c = await T.repoInfo(), lang = (c.langs || []).includes('ko') ? 'ko' : 'en';
      const txt = new Map((await T.loadRows('misc', lang)).map(r => [r.key, r.text]));
      const B = JSRC.badges(src, { msgs: Object.fromEntries(txt), banner, sheetSize: im ? [im.width, im.height] : null });
      GEO = { repo, cell: B.sheet.cell, cols: B.sheet.cols || Math.max(1, Math.floor(((im && im.width) || 128) / B.sheet.cell)), textKeys: B.textKeys };
      const lines = src.split('\n');
      B.list.forEach(b => {
        const code = b.conds.map(x => ({ m: x.method, args: x.args, line: x.line, text: x.text, src: lines.slice(x.from - 1, x.to).join('\n').replace(/\t/g, '  ') }));
        const main = code.find(x => /^if\s*\(/.test(x.text) && /!\s*(local|global)\.contains/.test(x.text)) || code[0] || null;
        rows.push({ name: b.id, key: b.key, icon: b.image, type: b.type || '(내부)', noImage: b.noImage, inSheet: b.inSheet, title: b.name, desc: b.desc, nameKey: b.nameKey, descKey: b.descKey, nameSource: b.nameSource, line: b.line,
          code, main, suggest: main ? suggest(main.text) : '', condParsed: b.condParsed });
      });
      const st2 = JSRC.statistics(statSrc); if (st2.length) stats = st2;
    } catch (e) { PDM.log && PDM.log('게임 원래 배지를 읽지 못했습니다: ' + (e.message || e), 'warn'); }
    cache = { repo, rows };
    return rows;
  }
  /** 게임 코드의 조건 줄을 내 조건식으로 옮길 수 있으면 옮김 (단순 비교만) */
  function suggest(text) {
    const m = /!local\.contains\(\s*Badge\.\w+\s*\)\s*&&\s*(.+?)\)\s*\{?\s*$/.exec(text); if (!m) return '';
    const e = m[1].replace(/Statistics\.(\w+)/g, 'stat.$1').replace(/Dungeon\.hero\.lvl/g, 'hero.lvl').replace(/Dungeon\.hero\.STR(\(\))?/g, 'hero.str').replace(/Dungeon\.gold/g, 'gold').replace(/(\d)_(\d)/g, '$1$2').replace(/\s+/g, '');
    return /^[a-zA-Z.]+(>=|>|==|<=|<)\d+$/.test(e) ? e : '';
  }
  const MODES = { '': '게임 원래 조건 그대로', custom: '내 조건식으로 바꾸기', off: '얻을 수 없게 끄기' };
  const OTRIG = { turn: '매 턴 검사', floorEnter: '층(맵)에 들어올 때 검사', mobKilled: '몬스터를 처치했을 때 검사', itemPickup: '아이템을 주웠을 때 검사' };
  const showCode = r => PDM.ui.modal(`얻는 조건 코드 — ${r.title || r.name}`, h('div', { style: { maxHeight: '65vh', overflow: 'auto', minWidth: '640px' } },
    h('p', { class: 'hint' }, `게임 저장소 Badges.java 에서 Badge.${r.name} 이(가) 나오는 메서드입니다. 이 메서드를 게임의 어느 곳에서 부르는지가 "얻는 때"입니다.`),
    ...[...new Map((r.code || []).map(c => [c.m, c])).values()].map(c => h('div', {}, h('div', { class: 'm-0 mt-3 mb-1 fw-bold' }, `${c.m}(${c.args})`), h('pre', { style: { fontSize: '11px', background: 'var(--bg2, #f3f1f8)', padding: '8px', borderRadius: '6px', whiteSpace: 'pre-wrap', userSelect: 'text' } }, c.src)))), [['닫기', true, 'pri']]);
  const iconCv = (idx, size, dim) => { const c = h('canvas', { width: size, height: size, style: { imageRendering: 'pixelated', flex: 'none', opacity: dim ? 0.35 : 1 } });
    PDM.assets.load('game:' + SHEET).then(im => { if (!im) return; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(im, (idx % GEO.cols) * GEO.cell, Math.floor(idx / GEO.cols) * GEO.cell, GEO.cell, GEO.cell, 0, 0, size, size); }).catch(() => { }); return c; };
  /** 배지 시트에서 칸 고르기 (원래 배지 · 내 배지가 쓰는 칸 표시) */
  async function pickCell(cur) {
    const im = await PDM.assets.load('game:' + SHEET).catch(() => null); if (!im) { toast('배지 그림 시트를 읽을 수 없습니다', 'bad'); return null; }
    const used = new Map(); (await scan()).forEach(r => used.set(r.icon, r.title || r.name)); list().forEach(b => { if (!used.has(b.icon)) used.set(b.icon, '내 배지: ' + (b.name || b.id)); });
    const Z = 3, cv = h('canvas', { width: im.width * Z, height: im.height * Z, style: { imageRendering: 'pixelated', cursor: 'pointer', background: '#222' } }), info = h('div', { class: 'hint' }, '칸을 누르세요. 노란 테두리 = 지금 고른 칸 · 흐린 칸 = 다른 배지가 쓰는 칸');
    let sel = cur | 0;
    const draw = () => { const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.clearRect(0, 0, cv.width, cv.height); g.drawImage(im, 0, 0, cv.width, cv.height);
      const rows = Math.floor(im.height / GEO.cell);
      for (let i = 0; i < GEO.cols * rows; i++) { const x = (i % GEO.cols) * GEO.cell * Z, y = Math.floor(i / GEO.cols) * GEO.cell * Z; if (used.has(i) && i !== sel) { g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(x, y, 16 * Z, 16 * Z); } g.strokeStyle = i === sel ? '#ffd24a' : 'rgba(255,255,255,.12)'; g.lineWidth = i === sel ? 2 : 1; g.strokeRect(x + .5, y + .5, 16 * Z - 1, 16 * Z - 1); } };
    cv.onclick = e => { const r = cv.getBoundingClientRect(); sel = Math.floor((e.clientY - r.top) / (GEO.cell * Z)) * GEO.cols + Math.floor((e.clientX - r.left) / (GEO.cell * Z)); info.textContent = `${sel}번 칸` + (used.has(sel) ? ` — 쓰는 곳: ${used.get(sel)}` : ' — 비어 있음 (새 그림을 그려 넣기 좋은 칸)'); draw(); };
    draw();
    const ok = await PDM.ui.modal('배지 그림 칸 고르기', h('div', {}, h('div', { style: { maxHeight: '60vh', overflow: 'auto' } }, cv), info), [['취소', false], ['고르기', true, 'pri']]);
    return ok ? sel : null;
  }

  PDM.badges = { K, make, ops, list, scan };

  PDM.registerEditor({
    id: K, icon: '🏅', title: () => '업적 (배지)',
    match: k => k === K, watch: ck => ck === 'texts' || ck === K,
    tree: () => store.isOpen ? [ops.treeNode(58)] : [],
    render(key, ctx) {
      const { F, row, section } = PDM.ui;
      const st = ctx.state = ctx.state || { q: '', only: false };
      const all = list();
      ops.take(st);
      const ov = ((store.get('texts') || {}).texts || {})['*'] || {};
      const setOv = (k, v) => store.edit('texts', '배지 글자: ' + k, r => { r.texts = r.texts || {}; const m = r.texts['*'] = r.texts['*'] || {}; if (v === '' || v == null) delete m[k]; else m[k] = v; });
      // ---- 내 배지
      const mine = h('div', {});
      all.forEach((b, i) => { const p = ['list', i];
        const sb = (label, title, fn, cls) => h('button', { class: 'btn xs w-full' + (cls ? ' ' + cls : ''), title, onclick: async e => { e.preventDefault(); await fn(); } }, label);
        const setB = (lbl, fn) => store.edit(K, lbl, r => fn(r.list[i]));
        const iconBtn = h('div', { style: { display: 'grid', gap: '3px', width: '104px' } },
          h('div', { style: { display: 'flex', justifyContent: 'center', padding: '4px', background: '#222', borderRadius: '6px', cursor: 'pointer' }, title: '두 번 누르면 그림 편집', ondblclick: () => editIcon() }, b.image ? fileCv(b.image, 48) : iconCv(b.icon | 0, 48)),
          h('div', { class: 'hint', style: { wordBreak: 'break-all' } }, b.image ? b.image.split('/').pop() : `시트 ${b.icon | 0}번 칸`),
          sb('✏ 그림 편집', '그림 편집기로 고치기 (저장 · 다른 이름으로 저장)', () => editIcon()),
          sb('칸 고르기', '배지 그림 시트에서 칸 고르기', async () => { const c = await pickCell(b.icon); if (c != null) setB('배지 그림 칸', x => { x.icon = c; delete x.image; }); }),
          sb('불러오기', 'PNG 파일을 이 배지의 그림으로 쓰기 (16×16 권장)', async () => { const f = await PDM.ui.pickImage('sprites/badges'); if (f) setB('배지 그림 불러오기', x => { x.image = f; }); }),
          sb('다른 이름으로', '지금 그림을 새 PNG 파일로 저장하고 이 배지가 그 파일을 쓰게 함', () => saveIconAs()),
          b.image ? sb('시트 칸으로', '따로 저장한 그림 대신 배지 그림 시트의 칸을 다시 씀', () => setB('배지 그림: 시트 칸', x => { delete x.image; })) : null);
        async function editIcon() {
          if (b.image) { const out = await PDM.editPixelsModal(`배지 그림 편집 — ${b.name || b.id}`, b.image, 16, 16); if (out) { PDM.assets.invalidate(out); if (out !== b.image) setB('배지 그림 (다른 이름으로 저장)', x => { x.image = out; }); else ctx.refresh(); } return; }
          const r = await editCell(b.icon | 0, `배지 그림 편집 — ${b.name || b.id}`, b.id); if (!r) return;
          if (r.file) setB('배지 그림 (다른 이름으로 저장)', x => { x.image = r.file; }); else ctx.refresh();
        }
        async function saveIconAs() {
          const out = await askPath(`assets/sprites/badges/${b.id}.png`); if (!out) return;
          const c = h('canvas', { width: 16, height: 16 }), g = c.getContext('2d'); g.imageSmoothingEnabled = false;
          const im = await PDM.assets.load(b.image || ('game:' + SHEET)).catch(() => null); if (!im) { toast('그림을 읽을 수 없습니다', 'bad'); return; }
          if (b.image) g.drawImage(im, 0, 0, im.width, im.height, 0, 0, 16, 16); else g.drawImage(im, ((b.icon | 0) % GEO.cols) * GEO.cell, Math.floor((b.icon | 0) / GEO.cols) * GEO.cell, GEO.cell, GEO.cell, 0, 0, 16, 16);
          await pdm.writeDataURL(store.abs(out), c.toDataURL('image/png')); PDM.assets.invalidate(out);
          setB('배지 그림 (다른 이름으로 저장)', x => { x.image = out; });
        }
        mine.append(h('div', { id: 'badge-' + b.id, class: 'selcard' + (st.id === b.id ? ' on' : ''), style: { display: 'flex', gap: '10px', alignItems: 'flex-start' } },
          h('div', { class: 'flex-none ta-center' }, iconBtn),
          h('div', { class: 'grow' },
            row(F.text(K, [...p, 'name'], { label: `이름 (id: ${b.id})`, rerender: true }), F.text(K, [...p, 'desc'], { label: '설명 (얻는 방법)' })),
            row(F.select(K, [...p, 'trigger'], TRIGGERS, { label: '얻는 때', rerender: true }),
              b.trigger && b.trigger !== 'manual' ? h('div', { class: 'field' }, h('span', { class: 'fl' }, '얻는 조건 — 목록에서 고르거나 아래 칸에 직접 입력 (참이면 얻음)'), condEditor(b.cond, v => store.edit(K, '배지 조건', r => { r.list[i].cond = v; }, { silent: true }))) : h('div', { class: 'field' }, h('span', { class: 'fl' }, '얻는 조건'), h('div', { class: 'hint' }, '이벤트의 "배지 주기" 명령으로 줍니다 (이벤트의 조건 · 분기를 그대로 쓸 수 있음).'))),
            row(F.ref(K, [...p, 'event'], 'event', { label: '얻었을 때 실행할 이벤트 (선택)', empty: '(없음)' }), F.bool(K, [...p, 'hidden'], { label: '얻기 전에는 이름 · 설명을 숨김 (???)' })),
            h('div', { class: 'flex gap-3' }, h('button', { class: 'btn xs', onclick: () => ops.rename(b.id) }, 'id 바꾸기'), h('button', { class: 'btn xs', onclick: () => ops.dup(b.id) }, '복제'),
              h('button', { class: 'btn xs', disabled: i === 0, onclick: () => ops.move(b.id, -1) }, '↑'), h('button', { class: 'btn xs', disabled: i === all.length - 1, onclick: () => ops.move(b.id, 1) }, '↓'),
              h('button', { class: 'btn xs danger', onclick: () => ops.remove(b.id) }, '삭제')))));
      });
      // ---- 게임 원래 배지 (비동기)
      const orig = h('div', {}, h('p', { class: 'hint' }, '게임 저장소에서 읽는 중…'));
      const q = h('input', { type: 'search', value: st.q, placeholder: '이름 · 설명 · 코드 이름으로 찾기', style: { width: '260px' } });
      const fill = rows => {
        orig.innerHTML = '';
        if (!rows.length) { orig.append(h('p', { class: 'hint' }, '게임 저장소에서 Badges.java 를 찾지 못했습니다 (프로젝트 설정의 게임 저장소 연결을 확인하세요).')); return; }
        const qq = st.q.trim().toLowerCase();
        const og = (store.get(K) || {}).orig || {};
        const show = rows.filter(r => (!qq || (r.name + ' ' + r.title + ' ' + r.desc).toLowerCase().includes(qq)) && (!st.only || ov[`badges$badge.${r.key}.title`] || ov[`badges$badge.${r.key}.desc`] || (og[r.name] && og[r.name].mode)));
        const tb = h('table', { class: 'grid' }, h('tr', {}, h('th', { style: { width: '62px' } }, '그림'), h('th', { style: { width: '17%' } }, '이름 (비우면 게임 원래 이름)'), h('th', { style: { width: '26%' } }, '설명 (비우면 게임 원래 설명)'), h('th', {}, '얻는 조건 (게임 코드 → 바꾸기)'), h('th', { style: { width: '120px' } }, '종류 · 코드 이름')));
        const setOrig = (name, fn, rerender) => store.edit(K, '원래 배지 조건: ' + name, d => { d.orig = d.orig || {}; const o = d.orig[name] = d.orig[name] || {}; fn(o); if (!o.mode) delete d.orig[name]; }, { silent: !rerender });
        const condCell = (r, o) => {
          const sel = h('select', {}, ...Object.entries(MODES).map(([k, v]) => h('option', { value: k, selected: (o.mode || '') === k }, v)));
          sel.onchange = () => setOrig(r.name, x => { x.mode = sel.value; if (sel.value === 'custom') { x.trigger = x.trigger || 'turn'; if (!x.cond) x.cond = r.suggest || ''; } }, true);
          const td = h('td', {},
            h('div', { class: 'flex gap-2 items-start' },
              h('code', { style: { fontSize: '10px', flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-all', opacity: o.mode ? 0.45 : 1, textDecoration: o.mode ? 'line-through' : 'none' } }, r.main ? `${r.main.m}(): ${r.main.text}` : '(Badges.java 에서 조건 줄을 찾지 못함)'),
              r.code && r.code.length ? h('button', { class: 'btn xs', title: '이 배지의 조건 코드 전체 보기', onclick: () => showCode(r) }, '코드') : null),
            sel);
          if (o.mode === 'custom') {
            const tr = h('select', {}, ...Object.entries(OTRIG).map(([k, v]) => h('option', { value: k, selected: (o.trigger || 'turn') === k }, v)));
            tr.onchange = () => setOrig(r.name, x => { x.trigger = tr.value; });
            td.append(tr, condEditor(o.cond || '', v => setOrig(r.name, x => { x.cond = v; }), { suggest: r.suggest, placeholder: r.suggest || '직접 입력 — 예: stat.enemiesSlain>=30' }));
          }
          return td;
        };
        show.forEach(r => {
          // 10차: 글자 키는 저장소 형식 그대로 (.title/.desc 또는 한 줄 키) — 저장소에 없는 키에 쓰면 게임이 읽지 않으므로 막음
          const kt = r.nameKey || (GEO.textKeys === 'single' ? `badges$badge.${r.key}` : `badges$badge.${r.key}.title`), kd = r.descKey || (GEO.textKeys === 'single' ? '' : `badges$badge.${r.key}.desc`);
          const ti = h('input', { type: 'text', value: ov[kt] || '', placeholder: r.title || (r.nameSource === 'none' ? '(이 저장소에 이름 글자 없음)' : '(이름 없음)') });
          const di = kd ? h('input', { type: 'text', value: ov[kd] || '', placeholder: r.desc || '(설명 없음)' }) : h('div', { class: 'ra-note' }, '이 저장소는 배지 설명 글 키를 쓰지 않음');
          ti.onchange = () => setOv(kt, ti.value.trim()); if (kd) di.onchange = () => setOv(kd, di.value.trim());
          if (r.noImage) { tb.append(h('tr', {}, h('td', {}, h('div', { class: 'ra-note' }, '그림 없음')), h('td', {}, ti, h('div', { class: 'hint' }, r.title)), h('td', {}, di, h('div', { class: 'hint' }, r.desc)), condCell(r, og[r.name] || {}),
            h('td', {}, h('div', { class: 'hint' }, TYPES[r.type] || r.type), h('code', { class: 'fs-2xs' }, r.name), h('div', { class: 'ra-note' }, 'enum 에 그림 번호가 없음 (내부 기록용 · 다른 배지로 대신 보임)')))); return; }
          const ic = iconCv(r.icon, 32); ic.style.cursor = 'pointer'; ic.title = '누르면 이 배지 그림 편집 (저장 · 다른 이름으로 저장)';
          ic.onclick = async () => { const x = await editCell(r.icon, `배지 그림 편집 — ${r.title || r.name}`, r.key); if (x && x.file) toast('새 파일로 저장했습니다: ' + x.file + ' (게임 원래 배지는 시트의 칸을 씁니다)'); if (x) ctx.refresh(); };
          const imp = h('button', { class: 'btn xs', title: 'PNG 파일을 이 칸에 넣기', onclick: async () => { if (await importCell(r.icon)) ctx.refresh(); } }, '불러오기');
          tb.append(h('tr', {}, h('td', {}, ic, imp), h('td', {}, ti, h('div', { class: 'hint' }, r.title)), h('td', {}, di, h('div', { class: 'hint' }, r.desc)), condCell(r, og[r.name] || {}),
            h('td', {}, h('div', { class: 'hint' }, TYPES[r.type] || r.type), h('code', { class: 'fs-2xs' }, r.name), h('div', { class: r.inSheet === false ? 'c-bad' : 'hint' }, `${r.icon}번 칸` + (r.inSheet === false ? ' — 시트 밖' : ''))))); });
        orig.append(h('div', { class: 'ra-note mb-2' }, `${show.length} / ${rows.length}개 · 저장소 원본 ${rows.length} · 이름 글자 있음 ${rows.filter(r => r.nameSource === 'repo').length} · 그림 있음 ${rows.filter(r => !r.noImage).length} · 얻는 조건을 Badges.java 에서 찾음 ${rows.filter(r => r.condParsed).length} (못 찾은 것은 다른 파일에서 주거나 미지원) · 시트 ${GEO.cell}px · 한 줄 ${GEO.cols}칸`), tb);
      };
      const geoAt = GEO.repo;
      scan().then(rows => { if (GEO.repo && GEO.repo !== geoAt) { ctx.refresh(); return; } q.oninput = () => { st.q = q.value; fill(rows); }; fill(rows); });   // 시트 칸 정보가 바뀌면 한 번 다시 그림
      return h('div', { class: 'page' }, h('h1', {}, '🏅 업적 (배지)'),
        h('p', { class: 'lead' }, '게임 원래 배지의 이름 · 설명 · 그림을 고치고, 내 배지를 만들어 얻는 조건과 때를 정합니다.'),
        section(`내 배지 (${all.length})`,
          h('p', { class: 'hint' }, '얻은 배지는 새 게임에도 남습니다 (조건식 badge.<id>). 얻으면 화면 가운데에 배지 띠와 "배지 획득: 이름"이 뜹니다. 게임 안에서 목록은 이벤트 명령 "배지 목록 창 열기"로 봅니다 — 게임 원래 배지 화면에는 나오지 않습니다. 그림은 아래 "배지 그림 시트"의 빈 칸에 그려 넣고 그 칸을 고르세요.'),
          mine, h('button', { class: 'btn sm add', onclick: () => ops.add() }, '+ 내 배지 추가')),
        section('배지 그림 시트',
          h('p', { class: 'hint' }, `게임 원래 배지와 내 배지가 같이 쓰는 그림입니다 (${GEO.cell}×${GEO.cell} 칸, 한 줄 ${GEO.cols}칸 — 이 게임 저장소 기준)` + '. "고치기"로 열어 원래 배지 그림을 바꾸거나 빈 칸에 새 배지를 그려 넣으세요. 크기와 칸 배치는 그대로 두세요.'),
          h('div', { class: 'spr-grid' }, PDM.sprites && PDM.sprites.gameCard ? [PDM.sprites.gameCard(SHEET, '배지 그림 시트'), PDM.sprites.gameCard('interfaces/locked_badge.png', '잠긴 배지 그림')] : h('p', { class: 'hint' }, '그림 관리 화면에서 interfaces/badges.png 를 고치세요.'))),
        section('게임 원래 배지',
          h('p', { class: 'hint' }, '게임 저장소에서 읽은 실제 목록입니다. 이름 · 설명 칸에 적으면 모든 언어에서 그 글로 바뀝니다 (게임 텍스트에 저장). "얻는 조건" 칸에는 게임 코드(Badges.java)의 실제 조건 줄이 나옵니다 — "코드"로 메서드 전체를 볼 수 있고, "내 조건식으로 바꾸기"를 고르면 게임 원래 조건 대신 내 조건식이 참일 때 얻습니다 (게임 통계는 stat.이름 — 예: stat.enemiesSlain, stat.goldCollected, stat.foodEaten · 그 밖에 hero.lvl, hero.str, gold, depth, switch.x, var.x, badge.이름). 조건을 바꾸면 설명 글도 맞게 고쳐 주세요.'),
          h('div', { class: 'hstack gap-4 mb-3' }, q,
            (() => { const c = h('input', { type: 'checkbox', checked: st.only }); c.onchange = () => { st.only = c.checked; ctx.refresh(); }; return h('label', { class: 'check' }, c, '고친 것만'); })()),
          orig));
    }
  });
})();
